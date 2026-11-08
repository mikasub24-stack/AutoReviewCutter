// Ghép tab «Kể chuyện»: mỗi cảnh = clip Muse + lời đọc + phụ đề (tuỳ chọn) → một MP4.
//
// Cách làm để dựng NHANH và KHỚP:
//  - Hình và tiếng của mỗi cảnh dựng riêng, nhiều cảnh chạy song song (tuỳ số nhân CPU).
//  - Độ dài mỗi cảnh làm tròn đúng số khung hình (1/30 giây), nên tiếng và hình của cảnh luôn bằng nhau.
//  - Tiếng của mọi cảnh được nối liền thành MỘT luồng rồi mã hóa AAC đúng một lần, nên không có khe hở hay lệch dần
//    ở chỗ nối (mã hóa AAC từng cảnh rồi nối sẽ lệch vài chục mili giây mỗi cảnh).
//  - Hình giữ nguyên khi nối (không mã hóa lại).
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { spawn } = require('node:child_process');
const { command, checkTools } = require('./merge.cjs');
const { toSrt } = require('./story-plan.js');

const SIZES = { '16:9': [1920, 1080], '9:16': [1080, 1920], '1:1': [1080, 1080] };
const FPS = 30;
const TAIL = 0.4; // giây lặng sau mỗi lời đọc
const MIN_SCENE = 1.5;
const SFX = { off: 0, low: 0.25, mid: 0.5 }; // âm lượng tiếng động gốc (tỉ lệ so với chính clip) khi chưa đo được độ to
// Đo được độ to thì không dùng tỉ lệ cố định nữa: hạ tiếng động gốc xuống thấp hơn GIỌNG KỂ đúng bấy nhiêu dB,
// clip Muse to cỡ nào cũng không át lời kể (hạ 25% so với chính clip vẫn to hơn giọng nếu clip to).
const SFX_BELOW = { low: 20, mid: 12 };

function dimensions(aspect) {
  const size = SIZES[aspect];
  if (!size) throw Error('Tỉ lệ phải là 16:9, 9:16 hoặc 1:1.');
  return { width: size[0], height: size[1] };
}

const frames = seconds => Math.max(1, Math.round(seconds * FPS));
const align = seconds => frames(seconds) / FPS;

// Có lời đọc: cảnh dài đúng lời + 0,4 giây. Clip dài hơn thì CẮT phần thừa; ngắn hơn thì giữ khung cuối cho đọc hết.
// Không có lời đọc: giữ nguyên độ dài clip. Luôn tròn số khung hình để hình và tiếng bằng nhau tuyệt đối.
function sceneLength(clipSeconds, voiceSeconds) {
  const clip = Number(clipSeconds) || 0;
  const voice = Number(voiceSeconds) || 0;
  return align(voice > 0 ? Math.max(MIN_SCENE, voice + TAIL) : clip);
}

// Chạy một chương trình; dừng được ngay khi bấm Dừng.
function run(file, args, { signal, timeout = 900000 } = {}) {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) return reject(Error('Đã dừng.'));
    const child = spawn(file, args, { windowsHide: true, shell: false });
    let out = '', err = '', timedOut = false;
    const stop = () => child.kill();
    const timer = setTimeout(() => { timedOut = true; stop(); }, timeout);
    signal?.addEventListener('abort', stop, { once: true });
    child.stdout.on('data', b => { out = (out + b).slice(-1000000); });
    child.stderr.on('data', b => { err = (err + b).slice(-16000); });
    child.once('error', e => { clearTimeout(timer); reject(Error(`Không mở được ${path.basename(file)}: ${e.message}. Chọn FFmpeg và ffprobe trong Cài đặt.`)); });
    child.once('close', code => {
      clearTimeout(timer); signal?.removeEventListener('abort', stop);
      if (signal?.aborted) reject(Error('Đã dừng.'));
      else if (timedOut) reject(Error('FFmpeg vượt thời gian xử lý.'));
      else if (code !== 0) reject(Error(`${path.basename(file)} thất bại (${code}): ${err}`));
      else resolve({ out, err });
    });
  });
}

// Độ to trung bình (LUFS, bỏ quãng lặng) của phần tiếng trong file; null nếu không có tiếng / quá ngắn để đo.
async function loudness(ffmpeg, file, signal) {
  try {
    const { err } = await run(ffmpeg, ['-hide_banner', '-nostats', '-nostdin', '-i', file, '-vn', '-af', 'ebur128=peak=none', '-f', 'null', '-'], { signal });
    const hit = [...String(err).matchAll(/^\s+I:\s+(-?\d+(?:\.\d+)?|-inf)\s+LUFS/gm)].pop();
    const value = hit ? Number(hit[1]) : NaN;
    return Number.isFinite(value) && value > -69 ? value : null;
  } catch (e) { if (signal?.aborted) throw e; return null; }
}

// Hệ số âm lượng (tuyến tính, 0..1) cho tiếng động gốc dưới giọng kể. Không bao giờ khuếch đại clip.
function sfxGain(level, voiceLufs, clipLufs) {
  const fixed = SFX[level] ?? 0;
  if (!(fixed > 0)) return 0;
  const below = SFX_BELOW[level];
  if (!below || !Number.isFinite(voiceLufs) || !Number.isFinite(clipLufs)) return fixed;
  const db = Math.max(-60, Math.min(0, (voiceLufs - below) - clipLufs));
  return Math.pow(10, db / 20);
}

// Chạy `task` cho từng phần tử, tối đa `limit` việc cùng lúc; một việc lỗi thì dừng các việc còn lại.
async function pool(items, limit, task, signal) {
  const results = new Array(items.length);
  const controller = new AbortController();
  const outer = () => controller.abort();
  signal?.addEventListener('abort', outer, { once: true });
  let next = 0, failed = null;
  const worker = async () => {
    while (!failed && !controller.signal.aborted) {
      const index = next++;
      if (index >= items.length) return;
      try { results[index] = await task(items[index], index, controller.signal); }
      catch (error) { failed = failed || error; controller.abort(); }
    }
  };
  try { await Promise.all(Array.from({ length: Math.max(1, Math.min(limit, items.length)) }, worker)); }
  finally { signal?.removeEventListener('abort', outer); }
  if (failed) throw failed;
  if (signal?.aborted) throw Error('Đã dừng.');
  return results;
}

// Bao nhiêu cảnh dựng cùng lúc và mỗi cảnh dùng bao nhiêu luồng: dùng hết CPU mà không tranh nhau.
function parallelism(cores = os.cpus().length) {
  const total = Math.max(1, cores);
  const workers = Math.min(4, Math.max(1, Math.floor(total / 2)));
  return { workers, threads: Math.max(1, Math.floor(total / workers)) };
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

// Chỗ người đọc nghỉ (giây, tính từ đầu file giọng) — dùng để căn phụ đề đúng tiếng.
async function voicePauses(ffmpeg, voice, seconds) {
  try {
    const { err } = await run(ffmpeg, ['-hide_banner', '-nostdin', '-i', voice, '-af', 'silencedetect=noise=-35dB:d=0.12', '-f', 'null', '-'], { timeout: 60000 });
    const starts = [...err.matchAll(/silence_start:\s*(-?[\d.]+)/g)].map(m => Number(m[1]));
    const ends = [...err.matchAll(/silence_end:\s*(-?[\d.]+)/g)].map(m => Number(m[1]));
    const pauses = [];
    ends.forEach((end, i) => {
      const start = Math.max(0, starts[i]);
      if (Number.isFinite(start) && Number.isFinite(end) && start > 0.15 && end < seconds - 0.1) pauses.push(Math.round((start + end) / 2 * 1000) / 1000);
    });
    return pauses;
  } catch { return []; }
}

const num = n => String(Math.round(n * 1000) / 1000);

// Hình của một cảnh (không có tiếng). `subs` = [{png, start, end}] tính từ đầu cảnh.
function videoArgs({ clip, subs = [], clipSeconds, total, width, height, threads = 2, out }) {
  const args = ['-hide_banner', '-loglevel', 'error', '-nostdin', '-y', '-i', clip];
  // Ảnh phụ đề chỉ cần vài khung mỗi giây: lớp phủ giữ khung gần nhất, đỡ giải mã lại ảnh cho từng khung hình.
  subs.forEach(sub => args.push('-loop', '1', '-framerate', '2', '-t', num(total), '-i', sub.png));
  const hold = Math.max(0, total - clipSeconds) + 0.2; // luôn dư một chút rồi cắt đúng số khung bằng -frames:v
  const filters = [`[0:v]scale=${width}:${height}:force_original_aspect_ratio=decrease,pad=${width}:${height}:(ow-iw)/2:(oh-ih)/2,setsar=1,fps=${FPS},tpad=stop_mode=clone:stop_duration=${num(hold)},format=yuv420p,setpts=PTS-STARTPTS[b0]`];
  // Phủ chữ ngay trong YUV 4:2:0 (không đổi định dạng cả khung hình 1080p cho mỗi lớp) — nhanh hơn nhiều so với format=auto.
  subs.forEach((sub, k) => {
    filters.push(`[${k + 1}:v]format=yuva420p[s${k}]`);
    filters.push(`[b${k}][s${k}]overlay=${Math.round(sub.x || 0)}:${Math.round(sub.y || 0)}:format=yuv420:enable='between(t,${num(sub.start)},${num(sub.end)})'[b${k + 1}]`);
  });
  filters.push(`[b${subs.length}]format=yuv420p[vout]`);
  // Không dùng khung B để mỗi đoạn bắt đầu đúng 0 và nối không cần mã hóa lại.
  args.push('-filter_complex', filters.join(';'), '-map', '[vout]', '-an', '-frames:v', String(frames(total)),
    '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '21', '-bf', '0', '-threads', String(threads), '-pix_fmt', 'yuv420p', '-r', String(FPS), out);
  return args;
}

// Tiếng của một cảnh: lời đọc + (tiếng động gốc nhỏ làm nền), đúng `total` giây, PCM để nối liền.
// `sfx` = âm lượng tiếng động gốc của clip (0 = tắt). Lời kể nằm trên, tiếng động chỉ làm nền.
function audioArgs({ clip, hasAudio, voice, sfx = 0, total, out }) {
  const args = ['-hide_banner', '-loglevel', 'error', '-nostdin', '-y'];
  let next = 0, voiceIndex = -1, clipIndex = -1, silenceIndex = -1;
  if (voice) { args.push('-i', voice); voiceIndex = next++; }
  const clipAudio = Boolean(hasAudio && sfx > 0);
  if (clipAudio) { args.push('-vn', '-i', clip); clipIndex = next++; }
  if (!voice && !clipAudio) { args.push('-f', 'lavfi', '-t', num(total), '-i', 'anullsrc=r=48000:cl=stereo'); silenceIndex = next++; }
  const norm = 'aresample=48000,aformat=sample_fmts=fltp:channel_layouts=stereo,asetpts=PTS-STARTPTS';
  const fade = `afade=t=out:st=${num(Math.max(0, total - 0.15))}:d=0.15`;
  const filters = [];
  if (voiceIndex >= 0 && clipIndex >= 0) {
    filters.push(`[${clipIndex}:a]${norm},volume=${num(sfx)},apad[sx]`);
    filters.push(`[${voiceIndex}:a]${norm},apad[vo]`);
    // amix chia đôi mỗi đường nên nhân 2 để giữ đúng âm lượng đã đặt.
    filters.push(`[sx][vo]amix=inputs=2:duration=longest:dropout_transition=0,volume=2,alimiter=limit=0.95,${fade}[aout]`);
  } else if (voiceIndex >= 0) {
    filters.push(`[${voiceIndex}:a]${norm},apad,${fade}[aout]`);
  } else if (clipIndex >= 0) {
    filters.push(`[${clipIndex}:a]${norm},apad,${fade}[aout]`);
  } else {
    filters.push(`[${silenceIndex}:a]${norm},apad[aout]`);
  }
  args.push('-filter_complex', filters.join(';'), '-map', '[aout]', '-t', num(total), '-c:a', 'pcm_s16le', '-ar', '48000', '-ac', '2', out);
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
async function assembleStory({ scenes, dir, name = 'Ke-chuyen', ffmpeg = 'ffmpeg', aspect = '16:9', subtitles = true, srt = false, sfx = 'off', onProgress = () => {}, signal, cores }) {
  if (!Array.isArray(scenes) || !scenes.length) throw Error('Chưa có cảnh nào để ghép.');
  const { width, height } = dimensions(aspect);
  const t = await checkTools(ffmpeg);
  await fs.mkdir(dir, { recursive: true });
  const temp = await fs.mkdtemp(path.join(dir, '.story-'));
  try {
    const sfxVolume = SFX[sfx] ?? 0;
    const { workers, threads } = parallelism(cores);
    onProgress('Đang đọc thông tin các cảnh…');
    // 1. Đo từng cảnh để biết độ dài chính xác (song song).
    const plan = await pool(scenes, 8, async (scene, i) => {
      await fs.access(scene.clip);
      const clipInfo = await probe(t.ffprobe, scene.clip);
      if (!clipInfo.hasVideo) throw Error(`Cảnh ${i + 1} không có luồng video.`);
      const voiceInfo = scene.voice ? await probe(t.ffprobe, scene.voice) : null;
      let gain = sfxVolume;
      if (scene.voice && clipInfo.hasAudio && sfxVolume > 0) {
        const [voiceLufs, clipLufs] = await Promise.all([loudness(t.ffmpeg, scene.voice, signal), loudness(t.ffmpeg, scene.clip, signal)]);
        gain = sfxGain(sfx, voiceLufs, clipLufs);
      }
      return { clipInfo, voiceInfo, gain, total: sceneLength(clipInfo.duration, voiceInfo?.duration) };
    }, signal);
    const timeline = [], notes = [];
    let offset = 0;
    const jobs = scenes.map((scene, i) => {
      const { clipInfo, total, gain } = plan[i];
      const chunks = Array.isArray(scene.chunks) ? scene.chunks : [];
      const burn = subtitles ? chunks.filter(c => c.png).map(c => ({ png: c.png, x: c.x || 0, y: c.y || 0, start: Math.max(0, c.start), end: Math.min(total, c.end) })) : [];
      const cut = clipInfo.duration - total, hold = total - clipInfo.duration;
      notes.push({ scene: i + 1, clipSeconds: clipInfo.duration, seconds: total, cut: cut > 0.05 ? cut : 0, hold: hold > 0.05 ? hold : 0 });
      for (const c of chunks) timeline.push({ text: c.text, start: offset + c.start, end: offset + Math.min(total, c.end) });
      offset += total;
      // Có giọng kể: tiếng động gốc chỉ làm nền nhỏ. Không có giọng: giữ tiếng động gốc đủ to (trừ khi tắt).
      const volume = scene.voice ? gain : (sfx === 'off' ? 0 : 1);
      return { i, scene, clipInfo, total, burn, volume };
    });
    // 2. Dựng hình + tiếng từng cảnh, nhiều cảnh cùng lúc.
    let done = 0;
    onProgress(`Đang dựng 0/${jobs.length} cảnh…`);
    await pool(jobs, workers, async (job, _index, stop) => {
      const video = path.join(temp, `v-${job.i}.mp4`), audio = path.join(temp, `a-${job.i}.wav`);
      await Promise.all([
        run(t.ffmpeg, videoArgs({ clip: job.scene.clip, subs: job.burn, clipSeconds: job.clipInfo.duration, total: job.total, width, height, threads, out: video }), { signal: stop }),
        run(t.ffmpeg, audioArgs({ clip: job.scene.clip, hasAudio: job.clipInfo.hasAudio, voice: job.scene.voice || null, sfx: job.volume, total: job.total, out: audio }), { signal: stop })
      ]);
      onProgress(`Đang dựng ${++done}/${jobs.length} cảnh…`);
    }, signal);
    // 3. Nối: hình giữ nguyên, tiếng nối liền rồi mã hóa AAC một lần.
    await fs.writeFile(path.join(temp, 'video.txt'), scenes.map((_, i) => `file 'v-${i}.mp4'`).join('\n'));
    await fs.writeFile(path.join(temp, 'audio.txt'), scenes.map((_, i) => `file 'a-${i}.wav'`).join('\n'));
    onProgress('Đang nối các cảnh…');
    const staging = path.join(temp, 'final.mp4');
    await run(t.ffmpeg, ['-hide_banner', '-loglevel', 'error', '-nostdin', '-y', '-f', 'concat', '-safe', '1', '-i', path.join(temp, 'video.txt'), '-f', 'concat', '-safe', '1', '-i', path.join(temp, 'audio.txt'),
      '-map', '0:v', '-map', '1:a', '-c:v', 'copy', '-c:a', 'aac', '-b:a', '192k', '-ar', '48000', '-movflags', '+faststart', staging], { signal });
    const result = await probe(t.ffprobe, staging);
    if (!result.hasVideo || !(result.duration > 0)) throw Error('Video ghép chưa hợp lệ.');
    const safe = String(name).replace(/[\\/:*?"<>|\u0000-\u001f]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 80) || 'Ke-chuyen';
    const output = await freeName(dir, safe, '.mp4');
    await fs.rename(staging, output);
    let srtFile = '';
    if (srt && timeline.length) { srtFile = output.replace(/\.mp4$/i, '.srt'); await fs.writeFile(srtFile, toSrt(timeline), 'utf8'); }
    return { output, srt: srtFile, seconds: result.duration, expected: offset, notes };
  } finally {
    await fs.rm(temp, { recursive: true, force: true });
  }
}

// Đo thời lượng từng cảnh (clip + lời đọc) và chỗ nghỉ của giọng để chia phụ đề đúng giờ.
async function measureScenes({ scenes, ffmpeg = 'ffmpeg' }) {
  const t = await checkTools(ffmpeg);
  return pool(scenes, 6, async scene => {
    await fs.access(scene.clip);
    const clip = await probe(t.ffprobe, scene.clip);
    const voice = scene.voice ? await probe(t.ffprobe, scene.voice) : null;
    const voiceSeconds = voice?.duration || 0;
    return {
      clipSeconds: clip.duration, voiceSeconds, seconds: sceneLength(clip.duration, voice?.duration),
      pauses: voiceSeconds > 1 ? await voicePauses(t.ffmpeg, scene.voice, voiceSeconds) : []
    };
  });
}

module.exports = { SIZES, SFX, SFX_BELOW, loudness, sfxGain, TAIL, MIN_SCENE, FPS, dimensions, sceneLength, videoArgs, audioArgs, parallelism, voicePauses, assembleStory, measureScenes, probe };
