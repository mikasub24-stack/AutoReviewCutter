// Tab «So sánh song song»: dựng video cuối từ hai clip Muse mỗi mốc.
//   Mỗi mốc  = clip TRÁI | clip PHẢI (cắt giữa cho vừa nửa khung) + lớp chữ canvas (nhãn, huy hiệu mốc, phụ đề, thanh pin tụt dần)
//              + giọng đọc + tiếng nền của hai clip (trái ở loa trái, phải ở loa phải, tự nhỏ khi có giọng) + hiệu ứng âm thanh tự tổng hợp.
//   Thêm thẻ mở đầu (tiêu đề) và thẻ kết (bài học + câu cuối), rồi nối các đoạn: hình giữ nguyên, tiếng nối liền và mã hóa AAC một lần (kèm nhạc nền nếu có).
// Độ dài mỗi đoạn làm tròn đúng số khung hình nên hình và tiếng luôn bằng nhau; không lệch dần ở chỗ nối.
// `hud` là bộ vẽ lớp chữ (cửa sổ Electron ẩn khi chạy thật, Chromium khi kiểm thử): init/base/tag/caption/meterSeq/intro/outro trả về PNG dạng data URL; thumb trả về JPEG (thumbnail 16:9).
const fs = require('node:fs/promises');
const path = require('node:path');
const { randomUUID } = require('node:crypto');
const { checkTools } = require('./merge.cjs');
const { run, pool, freeName, probe, parallelism, FPS } = require('./story-render.cjs');
const Hud = require('./pair-hud.js');
const Plan = require('./pair-plan.js');
const Sfx = require('./maphist-sfx.cjs');

const LEAD = 0.35;          // giọng vào chậm một chút để phụ đề hiện trước
const TAIL = 0.4;           // lặng sau lời đọc
const INTRO_MIN = 4.5, OUTRO_MIN = 8, OUTRO_TAIL = 1.4;
const MUSIC_EXT = ['.mp3', '.wav', '.m4a', '.aac', '.ogg', '.flac'];
const num = n => String(Math.round(n * 1000) / 1000);
const frames = seconds => Math.max(1, Math.round(seconds * FPS));
const align = seconds => frames(seconds) / FPS;

// Độ dài một mốc: hết clip dài hơn, và đủ chỗ cho giọng đọc (giữ khung cuối nếu giọng dài hơn clip).
function beatLength(clipSeconds, voiceSeconds) {
  const voice = Number(voiceSeconds) > 0 ? Number(voiceSeconds) + LEAD + TAIL : 0;
  return align(Math.min(24, Math.max(2, Number(clipSeconds) || 0, voice)));
}
const introLength = voiceSeconds => align(Math.max(INTRO_MIN, Number(voiceSeconds) > 0 ? Number(voiceSeconds) + 1.4 : 0));
const outroLength = voiceSeconds => align(Math.max(OUTRO_MIN, Number(voiceSeconds) > 0 ? Number(voiceSeconds) + LEAD + OUTRO_TAIL + 0.4 : 0));

// Hiệu ứng theo cảnh: đọc mô tả cảnh của từng bên (tiếng Anh, do kịch bản viết) và chọn tiếng hợp với việc đang xảy ra. Mỗi bên tối đa 2 tiếng,
// đặt lệch về đúng bên đó (trái / phải), đứng sau tiếng vút + pop đầu mốc và trước lúc thanh pin chạy.
const SCENE_SOUNDS = [
  { kind: 'coin', gain: .5, re: /\b(coins?|cash|money|wallet|purse|bills?|price|prices|pays?|paying|paid|buys?|buying|bought|purchases?|shopping|shop|store|checkout|receipt|credit card|register|spends?|spending|salary|paycheck|rent|loan|debt|bank|atm)\b/ },
  { kind: 'bam', gain: .45, re: /\b(yells?|yelling|shouts?|shouting|screams?|screaming|argues?|arguing|angry|anger|slams?|slamming|fights?|fighting|furious|scolds?|scolding|storms?)\b/ },
  { kind: 'knock', gain: .5, re: /\b(door|knocks?|knocking|doorbell|enters?|entering|arrives?|arriving|leaves?|leaving)\b/ },
  { kind: 'notify', gain: .4, re: /\b(phone|smartphone|calls?|calling|texts?|texting|messages?|notifications?|app|email)\b/ },
  { kind: 'chime', gain: .4, re: /\b(smiles?|smiling|laughs?|laughing|celebrates?|celebrating|hugs?|hugging|happy|joy|proud|success|wins?|cheers?|cheering|party|gifts?|graduat\w+)\b/ },
  { kind: 'swell', gain: .5, re: /\b(cries|cry|crying|tears|sad|lonely|alone|worr(?:y|ies|ied)|stress(?:ed)?|anxious|tired|exhausted|sighs?|panic(?:s|king)?)\b/ },
  { kind: 'ding', gain: .32, re: /\b(saves?|saving|savings|piggy|deposits?|invests?|investing|interest|budget|grows?|growing|jar)\b/ },
  { kind: 'steps', gain: .4, re: /\b(walks?|walking|runs?|running|rush(?:es|ing)?|hurr(?:y|ies|ying)|late|strolls?|steps)\b/ },
  { kind: 'typing', gain: .35, re: /\b(types?|typing|keyboard|laptop|computer|desk|works?|working|office|studies|study|studying|homework)\b/ }
];
function sceneCues(beat, total) {
  const cues = [];
  const text = side => String((beat && beat[side]) || '').toLowerCase();
  const sides = [['left', -.6, text('left')], ['right', .6, text('right')]];
  const shared = String((beat && beat.frame) || '').toLowerCase();
  sides.forEach(([, pan, own], si) => {
    const found = SCENE_SOUNDS.filter(s => s.re.test(own) || (!own && s.re.test(shared))).slice(0, 2);
    found.forEach((s, i) => cues.push({ t: 1.0 + i * .9 + si * .25, kind: s.kind, gain: s.gain, pan }));
  });
  return cues.filter(c => c.t < total - .3);
}

// Âm thanh tổng hợp cho một mốc (giây tính từ đầu mốc): vút khi chuyển mốc, pop khi phụ đề hiện, tiếng theo cảnh (sceneCues), tích tắc khi pin tụt, «bam» khi tụt mạnh, «ding» khi bên phải tăng.
function cuesFor(beat, prev, total) {
  const cues = [{ t: .03, kind: 'whoosh', gain: .5 }, { t: .45, kind: 'pop', gain: .3 }, ...sceneCues(beat, total)];
  const dL = Number(beat.leftScore) - Number(prev.left), dR = Number(beat.rightScore) - Number(prev.right);
  const moveStart = Hud.METER_HOLD / Hud.METER_FPS, moveEnd = Hud.METER_FRAMES / Hud.METER_FPS;
  if (dL <= -4) {
    const n = Math.min(10, Math.max(3, Math.round(-dL / 4)));
    for (let i = 0; i < n; i++) cues.push({ t: moveStart + .05 + i * (moveEnd - moveStart - .1) / n, kind: 'tick', gain: .45 });
    if (dL <= -14) cues.push({ t: moveEnd, kind: 'sticker', gain: .3 });
  }
  if (dR >= 3) cues.push({ t: moveEnd, kind: 'ding', gain: .3 });
  return cues.filter(c => c.t < total - .1);
}

const fit = (geo, side) => `scale=${geo.half[side].w}:${geo.half[side].h}:force_original_aspect_ratio=increase,crop=${geo.half[side].w}:${geo.half[side].h},setsar=1`;
const stackName = geo => (geo.layout === 'stack' ? 'vstack' : 'hstack');
// Chuẩn hóa một clip thành `total` giây: giữ khung cuối nếu clip ngắn hơn.
const clipChain = (index, label, geo, side, duration, total) =>
  `[${index}:v]${fit(geo, side)},fps=${FPS},tpad=stop_mode=clone:stop_duration=${num(Math.max(0, total - duration) + 0.2)},trim=duration=${num(total)},setpts=PTS-STARTPTS[${label}]`;
const imageInput = (file, total) => ['-loop', '1', '-framerate', String(FPS), '-t', num(total), '-i', file];
const END = ['-c:v', 'libx264', '-preset', 'veryfast', '-crf', '21', '-bf', '0', '-pix_fmt', 'yuv420p', '-r', String(FPS)];

// Hình của một mốc (không tiếng). layers: { base, tag, caption, meterL:{pattern}, meterR:{pattern} } (đường dẫn PNG / mẫu chuỗi PNG).
function beatVideoArgs({ clipL, clipR, geo, durL, durR, total, layers, threads = 2, out }) {
  const args = ['-hide_banner', '-loglevel', 'error', '-nostdin', '-y', '-i', clipL, '-i', clipR];
  args.push(...imageInput(layers.base, total), ...imageInput(layers.tag, total), ...imageInput(layers.caption, total));
  args.push('-framerate', String(Hud.METER_FPS), '-start_number', '0', '-i', layers.meterL, '-framerate', String(Hud.METER_FPS), '-start_number', '0', '-i', layers.meterR);
  const t = num(total), c = geo.caption, f = [];
  f.push(clipChain(0, 'l', geo, 'L', durL, total), clipChain(1, 'r', geo, 'R', durR, total));
  f.push(`[l][r]${stackName(geo)}=inputs=2,format=yuv420p[m0]`);
  f.push('[2:v]format=yuva420p[base]', '[m0][base]overlay=0:0:format=yuv420[m1]');
  f.push(`[3:v]format=yuva420p,fade=t=in:st=0:d=0.3:alpha=1,fade=t=out:st=${num(Math.max(0, total - 0.4))}:d=0.3:alpha=1[tag]`, `[m1][tag]overlay=${geo.tag.x}:${geo.tag.y}:format=yuv420[m2]`);
  const rise = `min(1\\,max(0\\,(t-0.45)/0.35))`;
  f.push(`[4:v]format=yuva420p,fade=t=in:st=0.45:d=0.35:alpha=1,fade=t=out:st=${num(Math.max(0.8, total - 0.5))}:d=0.3:alpha=1[cap]`, `[m2][cap]overlay=x=${c.x}:y='${c.y}+18*(1-${rise})':format=yuv420[m3]`);
  f.push('[5:v]format=yuva420p[ml]', `[m3][ml]overlay=${geo.meter.L.x}:${geo.meter.L.y}:format=yuv420[m4]`);
  f.push('[6:v]format=yuva420p[mr]', `[m4][mr]overlay=${geo.meter.R.x}:${geo.meter.R.y}:format=yuv420[m5]`);
  f.push(`[m5]fade=t=in:st=0:d=0.22,fade=t=out:st=${num(Math.max(0, total - 0.2))}:d=0.2,format=yuv420p[vout]`);
  args.push('-filter_complex', f.join(';'), '-map', '[vout]', '-an', '-frames:v', String(frames(total)), ...END, '-threads', String(threads), out);
  return args;
}

// Thẻ mở đầu: hai clip đầu làm mờ, tối đi, thẻ tiêu đề hiện lên.
function introVideoArgs({ clipL, clipR, geo, durL, durR, total, layer, threads = 2, out }) {
  const args = ['-hide_banner', '-loglevel', 'error', '-nostdin', '-y', '-i', clipL, '-i', clipR, ...imageInput(layer, total)];
  const f = [clipChain(0, 'l', geo, 'L', durL, total), clipChain(1, 'r', geo, 'R', durR, total),
    `[l][r]${stackName(geo)}=inputs=2,boxblur=14:2,eq=brightness=-0.2:saturation=0.85,format=yuv420p[m0]`,
    `[2:v]format=yuva420p,fade=t=in:st=0.3:d=0.55:alpha=1,fade=t=out:st=${num(Math.max(0.6, total - 0.5))}:d=0.4:alpha=1[card]`,
    '[m0][card]overlay=0:0:format=yuv420[m1]',
    `[m1]fade=t=in:st=0:d=0.4,fade=t=out:st=${num(Math.max(0, total - 0.3))}:d=0.3,format=yuv420p[vout]`];
  args.push('-filter_complex', f.join(';'), '-map', '[vout]', '-an', '-frames:v', String(frames(total)), ...END, '-threads', String(threads), out);
  return args;
}

// Thẻ kết: khung cuối hai clip cuối làm mờ; nền thẻ hiện trước, từng bài học hiện lần lượt, câu cuối hiện sau cùng.
// layers = [{ png, start }] (lớp đầu là nền + tiêu đề).
function outroVideoArgs({ clipL, clipR, geo, total, layers, threads = 2, out }) {
  const args = ['-hide_banner', '-loglevel', 'error', '-nostdin', '-y', '-sseof', '-0.6', '-i', clipL, '-sseof', '-0.6', '-i', clipR];
  layers.forEach(l => args.push(...imageInput(l.png, total)));
  const f = [clipChain(0, 'l', geo, 'L', 0.6, total), clipChain(1, 'r', geo, 'R', 0.6, total),
    `[l][r]${stackName(geo)}=inputs=2,boxblur=14:2,eq=brightness=-0.22:saturation=0.85,format=yuv420p[m0]`];
  let last = 'm0';
  layers.forEach((l, i) => {
    const s = num(l.start), rise = `min(1\\,max(0\\,(t-${s})/0.5))`;
    f.push(`[${i + 2}:v]format=yuva420p,fade=t=in:st=${s}:d=0.5:alpha=1,fade=t=out:st=${num(Math.max(0.6, total - 0.5))}:d=0.4:alpha=1[o${i}]`);
    f.push(`[${last}][o${i}]overlay=x=0:y='${i ? `14*(1-${rise})` : 0}':format=yuv420[m${i + 1}]`);
    last = `m${i + 1}`;
  });
  f.push(`[${last}]fade=t=in:st=0:d=0.4,fade=t=out:st=${num(Math.max(0, total - 0.6))}:d=0.6,format=yuv420p[vout]`);
  args.push('-filter_complex', f.join(';'), '-map', '[vout]', '-an', '-frames:v', String(frames(total)), ...END, '-threads', String(threads), out);
  return args;
}

// Tiếng của một đoạn, PCM đúng `total` giây: giọng đọc (giữa) + tiếng nền hai clip (trái / phải, nhỏ lại khi có giọng) + hiệu ứng.
// ambience = âm lượng tiếng nền (0 = tắt). voiceLead = giây đợi trước khi giọng vào.
function audioArgs({ clipL = null, clipR = null, hasL = false, hasR = false, voice = null, sfx = null, ambience = 0.45, voiceLead = LEAD, voiceVolume = 1, total, out }) {
  const args = ['-hide_banner', '-loglevel', 'error', '-nostdin', '-y'];
  let next = 0;
  const idx = {};
  if (voice) { args.push('-i', voice); idx.voice = next++; }
  if (sfx) { args.push('-i', sfx); idx.sfx = next++; }
  if (clipL && hasL && ambience > 0) { args.push('-i', clipL); idx.L = next++; }
  if (clipR && hasR && ambience > 0) { args.push('-i', clipR); idx.R = next++; }
  if (!next) { args.push('-f', 'lavfi', '-t', num(total), '-i', 'anullsrc=r=48000:cl=stereo'); idx.silence = next++; }
  const stereo = 'aresample=48000,aformat=sample_fmts=fltp:channel_layouts=stereo,asetpts=PTS-STARTPTS';
  const mono = 'aresample=48000,aformat=sample_fmts=fltp:channel_layouts=mono,asetpts=PTS-STARTPTS';
  const f = [], mix = [];
  const ambient = [];
  if (idx.L != null) { f.push(`[${idx.L}:a]${mono},pan=stereo|c0=c0|c1=0.2*c0,volume=${num(ambience)},apad[aL]`); ambient.push('[aL]'); }
  if (idx.R != null) { f.push(`[${idx.R}:a]${mono},pan=stereo|c0=0.2*c0|c1=c0,volume=${num(ambience)},apad[aR]`); ambient.push('[aR]'); }
  let amb = '';
  if (ambient.length === 2) { f.push(`${ambient.join('')}amix=inputs=2:duration=longest:dropout_transition=0,volume=2[amb]`); amb = '[amb]'; }
  else if (ambient.length === 1) { f.push(`${ambient[0]}anull[amb]`); amb = '[amb]'; }
  if (idx.voice != null) {
    const lead = Math.round(Math.max(0, voiceLead) * 1000);
    f.push(`[${idx.voice}:a]${mono},pan=stereo|c0=c0|c1=c0,adelay=${lead}|${lead},volume=${num(voiceVolume)},apad[vo]`);
    if (amb) {
      f.push('[vo]asplit=2[vo1][vo2]', `${amb}[vo1]sidechaincompress=threshold=0.03:ratio=10:attack=15:release=350[duck]`);
      mix.push('[duck]', '[vo2]');
    } else mix.push('[vo]');
  } else if (amb) mix.push(amb);
  if (idx.sfx != null) { f.push(`[${idx.sfx}:a]${stereo},apad[sx]`); mix.push('[sx]'); }
  if (idx.silence != null) f.push(`[${idx.silence}:a]${stereo},apad[sil]`), mix.push('[sil]');
  const fade = `afade=t=in:st=0:d=0.05,afade=t=out:st=${num(Math.max(0, total - 0.15))}:d=0.15`;
  if (mix.length === 1) f.push(`${mix[0]}alimiter=limit=0.95,${fade}[aout]`);
  else f.push(`${mix.join('')}amix=inputs=${mix.length}:duration=longest:dropout_transition=0,volume=${mix.length},alimiter=limit=0.95,${fade}[aout]`);
  args.push('-filter_complex', f.join(';'), '-map', '[aout]', '-t', num(total), '-c:a', 'pcm_s16le', '-ar', '48000', '-ac', '2', out);
  return args;
}

// Nối: hình giữ nguyên, tiếng nối liền; có nhạc nền thì nhạc tự nhỏ đi khi có giọng / hiệu ứng.
function finalArgs({ videoList, audioList, music = '', musicVolume = 0.14, total, out }) {
  const args = ['-hide_banner', '-loglevel', 'error', '-nostdin', '-y', '-f', 'concat', '-safe', '1', '-i', videoList, '-f', 'concat', '-safe', '1', '-i', audioList];
  if (!music) return [...args, '-map', '0:v', '-map', '1:a', '-c:v', 'copy', '-c:a', 'aac', '-b:a', '192k', '-ar', '48000', '-movflags', '+faststart', out];
  args.push('-stream_loop', '-1', '-i', music);
  const norm = 'aresample=48000,aformat=sample_fmts=fltp:channel_layouts=stereo,asetpts=PTS-STARTPTS';
  const f = ['[1:a]asplit=2[n1][n2]',
    `[2:a]${norm},volume=${num(musicVolume)},atrim=0:${num(total)},afade=t=in:d=2,afade=t=out:st=${num(Math.max(0, total - 3))}:d=3,asetpts=PTS-STARTPTS[mus]`,
    '[mus][n1]sidechaincompress=threshold=0.05:ratio=5:attack=60:release=1400[duck]',
    '[duck][n2]amix=inputs=2:duration=longest:dropout_transition=0,volume=2,alimiter=limit=0.95[aout]'];
  return [...args, '-filter_complex', f.join(';'), '-map', '0:v', '-map', '[aout]', '-c:v', 'copy', '-c:a', 'aac', '-b:a', '192k', '-ar', '48000', '-t', num(total), '-movflags', '+faststart', out];
}

const decode = data => {
  const text = String(data || '');
  const i = text.indexOf(',');
  if (!text.startsWith('data:image/png') || i < 0) throw Error('Bộ vẽ chữ trả ảnh không hợp lệ.');
  return Buffer.from(text.slice(i + 1), 'base64');
};

// clips: [{ number, left, right }] theo số mốc. voice: bộ làm giọng (voiceService) hoặc null. config: { voice, tempo, music, musicVolume, ambience, layout, lang }
async function assemblePair({ script, config = {}, clips, hud, voice = null, dir, name = 'So-sanh-song-song', ffmpeg = 'ffmpeg', onProgress = () => {}, signal, cores, sfxEnabled = true }) {
  if (!script || !Array.isArray(script.beats) || !script.beats.length) throw Error('Chưa có kịch bản để dựng.');
  const byNumber = new Map((clips || []).map(c => [c.number, c]));
  const missing = script.beats.filter(b => !byNumber.get(b.number) || !byNumber.get(b.number).left || !byNumber.get(b.number).right).map(b => b.number);
  if (missing.length) throw Error(`Còn mốc chưa có đủ hai clip (${missing.slice(0, 12).join(', ')}${missing.length > 12 ? '…' : ''}). Chạy hàng đợi cho xong rồi dựng.`);
  if (config.music) {
    if (!MUSIC_EXT.includes(path.extname(config.music).toLowerCase())) throw Error(`Nhạc nền phải là ${MUSIC_EXT.join(', ')}.`);
    await fs.access(config.music).catch(() => { throw Error('Không mở được file nhạc nền. Chọn lại file nhạc.'); });
  }
  // Âm lượng giọng đọc (thanh kéo): 0.3–1.6 lần mức gốc.
  const voiceVolume = Math.min(1.6, Math.max(0.3, Number(config.voiceVolume) || 1));
  const t = await checkTools(ffmpeg);
  const geo = Hud.geometry(config.layout === 'stack' ? 'stack' : 'side');
  await fs.mkdir(dir, { recursive: true });
  const temp = await fs.mkdtemp(path.join(dir, '.pair-'));
  const { workers, threads } = parallelism(cores);
  const beats = script.beats;
  try {
    // 1. Giọng đọc: tiêu đề (mở đầu), từng mốc, bài học + câu cuối (thẻ kết).
    const spoken = new Map();
    if (config.voice && voice) {
      onProgress('Đang làm giọng đọc…');
      const outroText = [...(script.lessons || []), script.closing].filter(Boolean).join('. ');
      const items = [{ id: 'intro', label: 'mở đầu', text: script.title }, ...beats.map(b => ({ id: `b${b.number}`, label: String(b.number), text: b.narration })), ...(outroText ? [{ id: 'outro', label: 'kết', text: outroText }] : [])]
        .filter(i => String(i.text || '').trim());
      const done = await voice.synth({ engine: 'edge', voice: config.voice, items, tempo: config.tempo || 1, volume: 1, dir: path.join(temp, 'giong'), signal, onProgress: x => onProgress(x) });
      for (const d of done || []) spoken.set(d.id, d);
    }
    // 2. Đo clip + giọng.
    onProgress('Đang đo độ dài các clip…');
    const infos = await pool(beats, 8, async b => {
      const c = byNumber.get(b.number);
      await Promise.all([fs.access(c.left), fs.access(c.right)]);
      const [l, r] = await Promise.all([probe(t.ffprobe, c.left), probe(t.ffprobe, c.right)]);
      if (!l.hasVideo || !r.hasVideo) throw Error(`Mốc ${b.number} thiếu luồng video.`);
      const v = spoken.get(`b${b.number}`);
      const seconds = v ? (v.seconds > 0 ? v.seconds : (await probe(t.ffprobe, v.file)).duration) : 0;
      return { l, r, voice: v ? v.file : null, voiceSeconds: seconds, total: beatLength(Math.max(l.duration, r.duration), seconds) };
    }, signal);
    const voiceSeconds = async id => { const v = spoken.get(id); return v ? (v.seconds > 0 ? v.seconds : (await probe(t.ffprobe, v.file)).duration) : 0; };
    const introVoice = await voiceSeconds('intro'), outroVoice = await voiceSeconds('outro');
    // 3. Dựng từng mốc (nhiều mốc cùng lúc): vẽ lớp chữ, ghép hình, trộn tiếng.
    const language = Plan.langOf(config.lang);
    await hud.init({ layout: geo.layout, title: script.title, left: script.left, right: script.right, meter: script.meter, verdict: Plan.verdictOf(beats, script.mode), total: beats.length, lang: language.id, tagline: Plan.taglineOf(language.id, script.mode), lessonsTitle: Plan.lessonsTitleOf(language.id, script.mode) });
    const base = path.join(temp, 'base.png');
    await fs.writeFile(base, decode(await hud.base()));
    const pieces = [];
    let done = 0;
    onProgress(`Đang dựng 0/${beats.length} mốc…`);
    const prevOf = i => i ? { left: beats[i - 1].leftScore, right: beats[i - 1].rightScore } : { left: 100, right: 100 };
    await pool(beats, workers, async (b, i, stop) => {
      const info = infos[i], c = byNumber.get(b.number), prev = prevOf(i), id = String(b.number).padStart(3, '0');
      const files = {
        base, tag: path.join(temp, `tag-${id}.png`), caption: path.join(temp, `cap-${id}.png`)
      };
      await fs.writeFile(files.tag, decode(await hud.tag(b.number, b.label)));
      await fs.writeFile(files.caption, decode(await hud.caption(b.caption)));
      for (const [side, from, to] of [['L', prev.left, b.leftScore], ['R', prev.right, b.rightScore]]) {
        const seq = await hud.meterSeq(side, from, to);
        for (let k = 0; k < seq.length; k++) await fs.writeFile(path.join(temp, `m${side}-${id}-${String(k).padStart(3, '0')}.png`), decode(seq[k]));
      }
      const video = path.join(temp, `v-${id}.mp4`), audio = path.join(temp, `a-${id}.wav`);
      let sfx = null;
      if (sfxEnabled) { sfx = path.join(temp, `fx-${id}.wav`); await fs.writeFile(sfx, Sfx.synth(cuesFor(b, prev, info.total), info.total)); }
      await Promise.all([
        run(t.ffmpeg, beatVideoArgs({
          clipL: c.left, clipR: c.right, geo, durL: info.l.duration, durR: info.r.duration, total: info.total, threads,
          layers: { ...files, meterL: path.join(temp, `mL-${id}-%03d.png`), meterR: path.join(temp, `mR-${id}-%03d.png`) }, out: video
        }), { signal: stop }),
        run(t.ffmpeg, audioArgs({ clipL: c.left, clipR: c.right, hasL: info.l.hasAudio, hasR: info.r.hasAudio, voice: info.voice, sfx, ambience: config.ambience == null ? 0.45 : config.ambience, voiceVolume, total: info.total, out: audio }), { signal: stop })
      ]);
      pieces[i] = { video, audio, total: info.total };
      // đã ghép xong thì xóa ảnh lớp của mốc này cho đỡ tốn ổ đĩa
      await Promise.all((await fs.readdir(temp)).filter(f => f.includes(`-${id}`) && f.endsWith('.png')).map(f => fs.rm(path.join(temp, f), { force: true })));
      onProgress(`Đang dựng ${++done}/${beats.length} mốc…`);
    }, signal);
    // 4. Thẻ mở đầu + thẻ kết.
    onProgress('Đang dựng thẻ mở đầu và thẻ kết…');
    const first = byNumber.get(beats[0].number), last = byNumber.get(beats[beats.length - 1].number);
    const introTotal = introLength(introVoice), outroTotal = outroLength(outroVoice);
    const introPng = path.join(temp, 'intro.png');
    await fs.writeFile(introPng, decode(await hud.intro()));
    const outroLayers = [];
    const outro = (await hud.outro(script.lessons || [], script.closing || '')) || [];
    for (let k = 0; k < outro.length; k++) {
      const png = path.join(temp, `outro-${k}.png`);
      await fs.writeFile(png, decode(outro[k]));
      // nền hiện ngay; mỗi bài học cách nhau; câu cuối hiện sau bài học cuối
      outroLayers.push({ png, start: k === 0 ? 0.2 : 0.9 + (k - 1) * Math.max(0.9, Math.min(2.4, (outroTotal - 3.2) / Math.max(1, outro.length - 1))) });
    }
    const introVideo = path.join(temp, 'v-intro.mp4'), introAudio = path.join(temp, 'a-intro.wav');
    const outroVideo = path.join(temp, 'v-outro.mp4'), outroAudio = path.join(temp, 'a-outro.wav');
    const introSfx = path.join(temp, 'fx-intro.wav'), outroSfx = path.join(temp, 'fx-outro.wav');
    if (sfxEnabled) {
      await fs.writeFile(introSfx, Sfx.synth([{ t: .05, kind: 'whoosh', gain: .6 }, { t: .7, kind: 'pop', gain: .4 }], introTotal));
      await fs.writeFile(outroSfx, Sfx.synth([{ t: .2, kind: 'whoosh', gain: .5 }, ...outroLayers.slice(1).map(l => ({ t: l.start + .05, kind: 'pop', gain: .35 })), { t: outroLayers.length > 1 ? outroLayers[outroLayers.length - 1].start : 1, kind: 'tada', gain: .5 }], outroTotal));
    }
    const infoOf = (n, k) => infos[beats.findIndex(b => b.number === n)][k];
    await Promise.all([
      run(t.ffmpeg, introVideoArgs({ clipL: first.left, clipR: first.right, geo, durL: infoOf(beats[0].number, 'l').duration, durR: infoOf(beats[0].number, 'r').duration, total: introTotal, layer: introPng, threads, out: introVideo }), { signal }),
      run(t.ffmpeg, audioArgs({ voice: spoken.get('intro')?.file || null, sfx: sfxEnabled ? introSfx : null, voiceLead: 0.8, ambience: 0, voiceVolume, total: introTotal, out: introAudio }), { signal }),
      run(t.ffmpeg, outroVideoArgs({ clipL: last.left, clipR: last.right, geo, total: outroTotal, layers: outroLayers, threads, out: outroVideo }), { signal }),
      run(t.ffmpeg, audioArgs({ voice: spoken.get('outro')?.file || null, sfx: sfxEnabled ? outroSfx : null, voiceLead: 0.5, ambience: 0, voiceVolume, total: outroTotal, out: outroAudio }), { signal })
    ]);
    // 5. Nối.
    const order = [{ video: introVideo, audio: introAudio, total: introTotal }, ...pieces, { video: outroVideo, audio: outroAudio, total: outroTotal }];
    const total = order.reduce((s, p) => s + p.total, 0);
    // Mốc giờ của từng mốc trong video cuối (dùng cho chương YouTube): mở đầu rồi lần lượt từng mốc, cuối cùng là thẻ kết.
    const timeline = [];
    let at = introTotal;
    beats.forEach((b, i) => { timeline.push({ number: b.number, start: Math.round(at * 1000) / 1000 }); at += pieces[i].total; });
    const outroStart = Math.round(at * 1000) / 1000;
    await fs.writeFile(path.join(temp, 'video.txt'), order.map(p => `file '${path.basename(p.video)}'`).join('\n'));
    await fs.writeFile(path.join(temp, 'audio.txt'), order.map(p => `file '${path.basename(p.audio)}'`).join('\n'));
    onProgress('Đang nối các mốc thành video…');
    const staging = path.join(temp, 'final.mp4');
    await run(t.ffmpeg, finalArgs({ videoList: path.join(temp, 'video.txt'), audioList: path.join(temp, 'audio.txt'), music: config.music || '', musicVolume: config.musicVolume == null ? 0.14 : config.musicVolume, total, out: staging }), { signal });
    const result = await probe(t.ffprobe, staging);
    if (!result.hasVideo || !(result.duration > 0)) throw Error('Video ghép chưa hợp lệ.');
    const safe = String(name).replace(/[\\/:*?"<>|\u0000-\u001f]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 80) || 'So-sanh-song-song';
    const output = await freeName(dir, safe, '.mp4');
    await fs.rename(staging, output);
    // Ảnh bìa: khung thẻ mở đầu khi tiêu đề đã hiện rõ.
    let cover = '';
    try {
      cover = output.replace(/\.mp4$/i, '.jpg');
      await run(t.ffmpeg, ['-hide_banner', '-loglevel', 'error', '-nostdin', '-y', '-ss', num(Math.min(1.6, introTotal - 0.7)), '-i', output, '-frames:v', '1', '-q:v', '3', cover], { signal });
    } catch (e) { if (signal?.aborted) throw e; cover = ''; }
    return { output, cover, seconds: result.duration, expected: total, beats: beats.length, intro: introTotal, outro: outroTotal, timeline, outroStart };
  } finally {
    await fs.rm(temp, { recursive: true, force: true });
  }
}

// ---------- Thumbnail 16:9 ----------
// Mốc làm ảnh bìa theo kiểu: kiểu 1 «Điểm cuối» lấy mốc cuối (điểm cuối cùng của hai bên); các kiểu còn lại lấy mốc chênh điểm nhiều nhất,
// rồi nhiều nhì, nhiều ba (hai nửa khác nhau rõ nhất nên thumbnail «kể» được câu chuyện).
function thumbBeat(beats, style, mode) {
  if (style === 1) return beats[beats.length - 1];
  const gap = b => Math.abs(Number(b.leftScore) - Number(b.rightScore)) || 0;
  // Ưu tiên mốc mà bên dẫn điểm là bên được ✓ ở cuối video, để số % trên ảnh không mâu thuẫn với dấu ✗ / ✓.
  const verdict = Plan.verdictOf(beats, mode), leads = b => Number(b.rightScore) > Number(b.leftScore) ? 'R' : Number(b.leftScore) > Number(b.rightScore) ? 'L' : '';
  const same = verdict ? beats.filter(b => leads(b) === verdict) : [];
  const ranked = (same.length ? same : beats).map(b => ({ b, i: beats.indexOf(b), g: gap(b) })).sort((x, y) => y.g - x.g || y.i - x.i);
  const rank = style === 0 ? 0 : style === 2 ? 1 : 2;
  return ranked[Math.min(rank, ranked.length - 1)].b;
}
const decodeJpeg = data => {
  const text = String(data || ''), i = text.indexOf(',');
  if (!text.startsWith('data:image/jpeg') || i < 0) throw Error('Bộ vẽ thumbnail trả ảnh không hợp lệ.');
  const buffer = Buffer.from(text.slice(i + 1), 'base64');
  if (buffer.length < 4 || buffer[0] !== 0xff || buffer[1] !== 0xd8) throw Error('Bộ vẽ thumbnail trả ảnh không hợp lệ.');
  return buffer;
};
// Lấy một khung hình giữa clip (đủ nét, tránh khung đầu còn mờ) thành JPEG ≤ 1280 px.
async function grabFrame({ ffmpeg, ffprobe, clip, out, signal }) {
  const { duration } = await probe(ffprobe, clip);
  const at = duration > 0 ? Math.min(3, duration * 0.45) : 0;
  await run(ffmpeg, ['-hide_banner', '-loglevel', 'error', '-nostdin', '-y', '-ss', num(at), '-i', clip, '-frames:v', '1', '-vf', "scale='min(1280,iw)':-2", '-q:v', '2', out], { signal });
  const buffer = await fs.readFile(out).catch(() => null);
  if (!buffer || !buffer.length) throw Error(`Không lấy được khung hình từ clip ${path.basename(clip)}.`);
  return `data:image/jpeg;base64,${buffer.toString('base64')}`;
}
// Ảnh bìa 16:9 (1920×1080 JPEG ≤ 1,9 MB) của video đã có kịch bản + đủ clip. `variant` chọn kiểu (xoay vòng qua Hud.THUMB.STYLES kiểu).
// clips: [{ number, left, right }] theo số mốc (như assemblePair). Không cần video đã dựng xong.
async function makePairThumbnail({ script, config = {}, clips, hud, dir, variant = 0, ffmpeg = 'ffmpeg', signal }) {
  if (!script || !Array.isArray(script.beats) || !script.beats.length) throw Error('Chưa có kịch bản để làm thumbnail.');
  const count = Hud.THUMB.STYLES, k = ((Math.round(Number(variant)) || 0) % count + count) % count;
  const byNumber = new Map((clips || []).map(c => [c.number, c]));
  const beat = thumbBeat(script.beats, k, script.mode), c = byNumber.get(beat.number);
  if (!c || !c.left || !c.right) throw Error(`Mốc ${beat.number} chưa có đủ hai clip để làm thumbnail.`);
  const t = await checkTools(ffmpeg);
  await fs.mkdir(dir, { recursive: true });
  const temp = await fs.mkdtemp(path.join(dir, '.thumb-'));
  try {
    const [leftImage, rightImage] = await Promise.all([
      grabFrame({ ffmpeg: t.ffmpeg, ffprobe: t.ffprobe, clip: c.left, out: path.join(temp, 'l.jpg'), signal }),
      grabFrame({ ffmpeg: t.ffmpeg, ffprobe: t.ffprobe, clip: c.right, out: path.join(temp, 'r.jpg'), signal })
    ]);
    const last = script.beats[script.beats.length - 1], shown = k === 1 ? last : beat;
    const jpeg = decodeJpeg(await hud.thumb({
      variant: k, leftImage, rightImage, title: script.title, left: script.left, right: script.right, meter: script.meter,
      leftScore: shown.leftScore, rightScore: shown.rightScore, verdict: Plan.verdictOf(script.beats, script.mode), lang: Plan.langOf(config.lang).id
    }));
    if (jpeg.length > Hud.THUMB.MAX_BYTES + 5e4) throw Error('Ảnh thumbnail quá nặng (hơn 2 MB). Bấm tạo lại để thử kiểu khác.');
    const file = path.join(dir, `thumbnail-${k + 1}.jpg`), part = path.join(temp, 'out.jpg');
    await fs.writeFile(part, jpeg);
    await fs.rename(part, file);
    return { file, variant: k, count, beat: beat.number, bytes: jpeg.length };
  } finally {
    await fs.rm(temp, { recursive: true, force: true });
  }
}

module.exports = { makePairThumbnail, thumbBeat, LEAD, TAIL, MUSIC_EXT, beatLength, introLength, outroLength, cuesFor, sceneCues, SCENE_SOUNDS, beatVideoArgs, introVideoArgs, outroVideoArgs, audioArgs, finalArgs, assemblePair, decode };
