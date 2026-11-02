// Ghép tab «Kể chuyện»: mỗi cảnh = clip Muse + lời đọc + phụ đề (tuỳ chọn) → một MP4.
const fs = require('node:fs/promises');
const path = require('node:path');
const { command, checkTools } = require('./merge.cjs');
const { toSrt } = require('./story-plan.js');

const SIZES = { '16:9': [1920, 1080], '9:16': [1080, 1920], '1:1': [1080, 1080] };
const TAIL = 0.4; // giây lặng sau mỗi lời đọc
const MIN_SCENE = 1.5;
const SFX = { off: 0, low: 0.25, mid: 0.5 }; // âm lượng tiếng động gốc của clip khi đang có giọng kể

function dimensions(aspect) {
  const size = SIZES[aspect];
  if (!size) throw Error('Tỉ lệ phải là 16:9, 9:16 hoặc 1:1.');
  return { width: size[0], height: size[1] };
}

// Có lời đọc: cảnh dài đúng lời + 0,4 giây. Clip dài hơn thì CẮT phần thừa; ngắn hơn thì giữ khung cuối cho đọc hết.
// Không có lời đọc: giữ nguyên độ dài clip.
function sceneLength(clipSeconds, voiceSeconds) {
  const clip = Number(clipSeconds) || 0;
  const voice = Number(voiceSeconds) || 0;
  return voice > 0 ? Math.max(MIN_SCENE, voice + TAIL) : clip;
}

async function probe(ffprobe, file) {
  const info = JSON.parse(await command(ffprobe, ['-v', 'error', '-show_streams', '-show_format', '-of', 'json', file], 60000));
  const duration = Number(info.format?.duration);
  return {
    duration: Number.isFinite(duration) && duration > 0 ? duration : 0,
    hasVideo: info.streams.some(s => s.codec_type === 'video'),
    hasAudio: info.streams.some(s => s.codec_type === 'audio')
  };
}

const num = n => String(Math.round(n * 1000) / 1000);

// Lệnh ffmpeg cho một cảnh. `subs` = [{png, start, end}] tính từ đầu cảnh.
// `sfx` = âm lượng tiếng động gốc của clip (0 = tắt). Lời kể nằm trên, tiếng động chỉ làm nền.
function segmentArgs({ clip, hasAudio, voice, sfx = 0, subs = [], clipSeconds, total, width, height, out }) {
  const args = ['-hide_banner', '-loglevel', 'error', '-nostdin', '-y', '-i', clip];
  let voiceIndex = -1, silenceIndex = -1, next = 1;
  if (voice) { args.push('-i', voice); voiceIndex = next++; }
  const subIndex = [];
  for (const sub of subs) { args.push('-loop', '1', '-framerate', '30', '-t', num(total), '-i', sub.png); subIndex.push(next++); }
  const clipAudio = Boolean(hasAudio && sfx > 0);
  if (!voice && !clipAudio) { args.push('-f', 'lavfi', '-t', num(total), '-i', 'anullsrc=r=48000:cl=stereo'); silenceIndex = next++; }
  const hold = Math.max(0, total - clipSeconds);
  const filters = [`[0:v]scale=${width}:${height}:force_original_aspect_ratio=decrease,pad=${width}:${height}:(ow-iw)/2:(oh-ih)/2,setsar=1,fps=30${hold > 0.02 ? `,tpad=stop_mode=clone:stop_duration=${num(hold)}` : ''},format=yuv420p,setpts=PTS-STARTPTS[b0]`];
  subs.forEach((sub, k) => {
    filters.push(`[b${k}][${subIndex[k]}:v]overlay=0:0:format=auto:enable='between(t,${num(sub.start)},${num(sub.end)})'[b${k + 1}]`);
  });
  filters.push(`[b${subs.length}]format=yuv420p[vout]`);
  const norm = 'aresample=48000,aformat=sample_fmts=fltp:channel_layouts=stereo,asetpts=PTS-STARTPTS';
  const fade = `afade=t=out:st=${num(Math.max(0, total - 0.15))}:d=0.15`;
  if (voiceIndex >= 0 && clipAudio) {
    filters.push(`[0:a]${norm},volume=${num(sfx)},apad[sx]`);
    filters.push(`[${voiceIndex}:a]${norm},apad[vo]`);
    // amix chia đôi mỗi đường nên nhân 2 để giữ đúng âm lượng đã đặt.
    filters.push(`[sx][vo]amix=inputs=2:duration=longest:dropout_transition=0,volume=2,alimiter=limit=0.95,${fade}[aout]`);
  } else if (voiceIndex >= 0) {
    filters.push(`[${voiceIndex}:a]${norm},apad,${fade}[aout]`);
  } else if (clipAudio) {
    filters.push(`[0:a]${norm},apad,${fade}[aout]`);
  } else {
    filters.push(`[${silenceIndex}:a]${norm},apad[aout]`);
  }
  args.push('-filter_complex', filters.join(';'), '-map', '[vout]', '-map', '[aout]', '-t', num(total),
    '-c:v', 'libx264', '-threads', '2', '-preset', 'fast', '-crf', '20', '-pix_fmt', 'yuv420p', '-r', '30',
    '-c:a', 'aac', '-ar', '48000', '-ac', '2', '-b:a', '192k', out);
  return args;
}

async function freeName(dir, base, extension) {
  for (let n = 1; n < 10000; n++) {
    const file = path.join(dir, base + (n === 1 ? '' : ` (${n})`) + extension);
    try { await fs.access(file); } catch { return file; }
  }
  throw Error('Quá nhiều file trùng tên trong thư mục lưu.');
}

// scenes: [{ clip, voice|null, chunks:[{text,start,end,png|null}] }]
async function assembleStory({ scenes, dir, name = 'Ke-chuyen', ffmpeg = 'ffmpeg', aspect = '16:9', subtitles = true, srt = false, sfx = 'low', onProgress = () => {}, signal }) {
  if (!Array.isArray(scenes) || !scenes.length) throw Error('Chưa có cảnh nào để ghép.');
  const { width, height } = dimensions(aspect);
  const t = await checkTools(ffmpeg);
  await fs.mkdir(dir, { recursive: true });
  const temp = await fs.mkdtemp(path.join(dir, '.story-'));
  try {
    const timeline = [], notes = [];
    const sfxVolume = SFX[sfx] ?? SFX.low;
    let offset = 0;
    for (let i = 0; i < scenes.length; i++) {
      if (signal?.aborted) throw Error('Đã dừng.');
      const scene = scenes[i];
      onProgress(`Ghép cảnh ${i + 1}/${scenes.length}`);
      await fs.access(scene.clip);
      const clipInfo = await probe(t.ffprobe, scene.clip);
      if (!clipInfo.hasVideo) throw Error(`Cảnh ${i + 1} không có luồng video.`);
      const voiceInfo = scene.voice ? await probe(t.ffprobe, scene.voice) : null;
      const total = sceneLength(clipInfo.duration, voiceInfo?.duration);
      const chunks = Array.isArray(scene.chunks) ? scene.chunks : [];
      const burn = subtitles ? chunks.filter(c => c.png).map(c => ({ png: c.png, start: Math.max(0, c.start), end: Math.min(total, c.end) })) : [];
      const out = path.join(temp, `seg-${i}.mp4`);
      const cut = clipInfo.duration - total, hold = total - clipInfo.duration;
      notes.push({ scene: i + 1, clipSeconds: clipInfo.duration, seconds: total, cut: cut > 0.05 ? cut : 0, hold: hold > 0.05 ? hold : 0 });
      // Có giọng kể: tiếng động gốc chỉ làm nền nhỏ. Không có giọng: giữ tiếng động gốc đủ to (trừ khi tắt).
      const volume = scene.voice ? sfxVolume : (sfx === 'off' ? 0 : 1);
      await command(t.ffmpeg, segmentArgs({ clip: scene.clip, hasAudio: clipInfo.hasAudio, voice: scene.voice || null, sfx: volume, subs: burn, clipSeconds: clipInfo.duration, total, width, height, out }));
      for (const c of chunks) timeline.push({ text: c.text, start: offset + c.start, end: offset + Math.min(total, c.end) });
      offset += total;
    }
    await fs.writeFile(path.join(temp, 'list.txt'), scenes.map((_, i) => `file 'seg-${i}.mp4'`).join('\n'));
    onProgress('Đang nối các cảnh…');
    const staging = path.join(temp, 'final.mp4');
    await command(t.ffmpeg, ['-hide_banner', '-loglevel', 'error', '-nostdin', '-y', '-f', 'concat', '-safe', '1', '-i', path.join(temp, 'list.txt'), '-c', 'copy', '-movflags', '+faststart', staging]);
    const result = await probe(t.ffprobe, staging);
    if (!result.hasVideo || !(result.duration > 0)) throw Error('Video ghép chưa hợp lệ.');
    const safe = String(name).replace(/[\\/:*?"<>|\u0000-\u001f]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 80) || 'Ke-chuyen';
    const output = await freeName(dir, safe, '.mp4');
    await fs.rename(staging, output);
    let srtFile = '';
    if (srt && timeline.length) { srtFile = output.replace(/\.mp4$/i, '.srt'); await fs.writeFile(srtFile, toSrt(timeline), 'utf8'); }
    return { output, srt: srtFile, seconds: result.duration, notes };
  } finally {
    await fs.rm(temp, { recursive: true, force: true });
  }
}

// Đo thời lượng từng cảnh (clip + lời đọc) để chia phụ đề đúng giờ.
async function measureScenes({ scenes, ffmpeg = 'ffmpeg' }) {
  const t = await checkTools(ffmpeg);
  const out = [];
  for (const scene of scenes) {
    await fs.access(scene.clip);
    const clip = await probe(t.ffprobe, scene.clip);
    const voice = scene.voice ? await probe(t.ffprobe, scene.voice) : null;
    out.push({ clipSeconds: clip.duration, voiceSeconds: voice?.duration || 0, seconds: sceneLength(clip.duration, voice?.duration) });
  }
  return out;
}

module.exports = { SIZES, SFX, TAIL, MIN_SCENE, dimensions, sceneLength, segmentArgs, assembleStory, measureScenes, probe };
