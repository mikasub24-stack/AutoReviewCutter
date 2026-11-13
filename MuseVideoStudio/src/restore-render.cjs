// Tab «Dọn nhà · Sinh tồn» ở tiến trình chính: cắt KHUNG CUỐI THẬT của clip vừa tải (làm ảnh đầu cho clip kế) và tự dựng các clip thành MỘT video hoàn chỉnh.
const fs = require('node:fs/promises');
const path = require('node:path');
const { execFile } = require('node:child_process');
const { command, checkTools } = require('./merge.cjs');

const SIZES = { '16:9': [1920, 1080], '9:16': [1080, 1920], '1:1': [1080, 1080] };
const MUSIC_EXT = new Set(['.mp3', '.wav', '.m4a', '.aac', '.ogg', '.flac']);
const cleanId = id => String(id || '').replace(/[^\w-]/g, '').slice(0, 60);

function restoreFolder(output, storyId) {
  return path.join(output, 'DonNha', cleanId(storyId) || 'DonNha');
}

// Khung cuối thật của clip: đọc ~1 giây cuối, ghi đè vào cùng một tệp, khung cuối cùng còn lại.
async function extractLastFrame({ ffmpeg = 'ffmpeg', clip, out }) {
  await fs.mkdir(path.dirname(out), { recursive: true });
  await fs.rm(out, { force: true }).catch(() => {});
  try {
    await command(ffmpeg, ['-hide_banner', '-loglevel', 'error', '-nostdin', '-y', '-sseof', '-1', '-i', clip, '-an', '-update', '1', '-f', 'image2', '-c:v', 'png', out], 120000);
  } catch (e) {
    throw Error('Không lấy được khung cuối của clip để nối cảnh sau (' + String(e.message).slice(0, 300) + '). Chọn FFmpeg và ffprobe trong Cài đặt.');
  }
  const stat = await fs.stat(out).catch(() => null);
  if (!stat || stat.size < 1000) throw Error('Khung cuối của clip bị trống. Clip tải về có thể hỏng; bấm «Tạo lại» cho cảnh này.');
  return out;
}

// Giống nhau giữa KHUNG ĐẦU của clip vừa tải và ảnh đã đưa cho Muse làm khung đầu (0..1, SSIM trên ảnh xám thu nhỏ, làm mờ nhẹ, cắt giữa cho cùng tỉ lệ).
// Clip đúng thì khung đầu ≈ ảnh đưa vào (≈0,8–1). Thấp nghĩa là Muse bỏ qua ảnh và dựng cảnh / ngôi nhà / người khác.
async function frameSimilarity({ ffmpeg = 'ffmpeg', clip, image }) {
  const prep = 'scale=256:144:force_original_aspect_ratio=increase,crop=256:144,setsar=1,gblur=sigma=1.5,format=gray';
  const args = ['-hide_banner', '-nostdin', '-loglevel', 'info', '-i', clip, '-i', image, '-lavfi', `[0:v]trim=end_frame=1,setpts=PTS-STARTPTS,${prep}[a];[1:v]${prep}[b];[a][b]ssim`, '-frames:v', '1', '-f', 'null', '-'];
  const stderr = await new Promise((resolve, reject) => {
    execFile(ffmpeg, args, { windowsHide: true, timeout: 120000, maxBuffer: 4000000 }, (e, _out, err) => e ? reject(Error(`Không so được khung hình: ${String(err || e.message).slice(-300)}`)) : resolve(String(err)));
  });
  const m = /All:([0-9.]+)/.exec(stderr);
  if (!m) throw Error('Không đọc được kết quả so khung hình.');
  return Math.min(1, Math.max(0, Number(m[1])));
}

async function duration(ffprobe, file) {
  const out = await command(ffprobe, ['-v', 'error', '-select_streams', 'v:0', '-show_entries', 'format=duration:stream=r_frame_rate', '-of', 'default=nw=1:nk=1', file], 60000);
  const [rate = '', length = ''] = String(out).trim().split(/\s+/);
  const seconds = Number(length), [a, b] = rate.split('/').map(Number);
  if (!(seconds > 0)) throw Error('Clip không đọc được thời lượng: ' + path.basename(file));
  return { seconds, frame: a > 0 && b > 0 ? b / a : 1 / 30 };
}

// Clip có luồng âm thanh không (Muse / Flow thường có tiếng động kèm theo).
async function hasAudio(ffprobe, file) {
  try { return String(await command(ffprobe, ['-v', 'error', '-select_streams', 'a:0', '-show_entries', 'stream=codec_type', '-of', 'csv=p=0', file], 60000)).trim().length > 0; }
  catch { return false; }
}

const CHUNK = 40;   // số clip mỗi lượt FFmpeg: video 2 giờ có hàng trăm clip, mở hết một lần dễ vượt giới hạn tệp mở của Windows

// Nối các clip theo số cảnh (cắt cứng: cảnh sau bắt đầu đúng bằng khung cuối cảnh trước nên không cần chuyển cảnh), chuẩn hóa khung hình,
// mờ dần vào / ra, GIỮ TIẾNG ĐỘNG GỐC của từng clip (clip không có tiếng thì thay bằng im lặng cùng độ dài), nhạc nền (nếu có) trộn nhỏ bên dưới.
// Mỗi clip xử lý riêng (hình + tiếng) rồi ghép các clip (copy, không mã hóa lại). Trả về đường dẫn video.
async function assembleRestore({ clips, dir, name = 'Video', ffmpeg = 'ffmpeg', aspect = '16:9', music = '', seams = [], onProgress = () => {} }) {
  if (!Array.isArray(clips) || !clips.length) throw Error('Chưa có clip nào để dựng.');
  for (const c of clips) await fs.access(c).catch(() => { throw Error('Không thấy tệp clip: ' + c); });
  const t = await checkTools(ffmpeg);
  const [width, height] = SIZES[aspect] || SIZES['16:9'];
  await fs.mkdir(dir, { recursive: true });
  onProgress('Đang đo thời lượng các clip…');
  const lengths = [], trimmed = [], frames = [];
  const seamSet = new Set((Array.isArray(seams) ? seams : []).map(Number).filter(n => Number.isInteger(n) && n > 0 && n < clips.length));   // đầu mỗi đoạn chạy song song: nối bằng ảnh mốc, không phải khung cuối clip trước
  // Khung ĐẦU của clip sau trùng khung cuối clip trước (nối bằng khung cuối thật): bỏ khung trùng đó ở mọi chỗ nối để không bị khựng một nhịp.
  for (const [i, c] of clips.entries()) { const d = await duration(t.ffprobe, c), cut = i > 0 && !seamSet.has(i) && d.seconds > d.frame * 2; trimmed.push(cut); frames.push(d.frame); lengths.push(cut ? d.seconds - d.frame : d.seconds); }
  const total = lengths.reduce((a, b) => a + b, 0);
  const useMusic = Boolean(music) && MUSIC_EXT.has(path.extname(music).toLowerCase()) && await fs.access(music).then(() => true, () => false);
  if (music && !useMusic) onProgress('Không đọc được tệp nhạc nền, dựng không nhạc.');
  const long = total > 1800;
  const encode = ['-c:v', 'libx264', '-preset', long ? 'veryfast' : 'medium', '-crf', long ? '20' : '18', '-pix_fmt', 'yuv420p'];
  const stamp = `.muse-restore-${Date.now().toString(36)}`;
  const segments = [], files = [];
  const listFile = path.join(dir, `${stamp}.txt`), temp = path.join(dir, `${stamp}.part.mp4`);
  try {
    // Mỗi clip được xử lý RIÊNG bằng một lượt FFmpeg (chuẩn hóa khung hình, bỏ khung trùng, mờ vào / ra ở chỗ cần) rồi ghép bằng concat demuxer (không mã hóa lại).
    // Không mở nhiều clip trong cùng một lượt FFmpeg: bộ lọc concat giữ trong RAM các khung đã giải mã của mọi clip, 20–40 clip 1080p là hết bộ nhớ («malloc failed»).
    const last = clips.length - 1;
    for (let i = 0; i < clips.length; i++) {
      const seg = path.join(dir, `${stamp}-clip-${String(i + 1).padStart(4, '0')}.ts`);
      files.push(seg);
      onProgress(`Đang xử lý cảnh ${i + 1}/${clips.length} (${Math.round(total)} giây tất cả)…`);
      const len = lengths[i], inD = i === 0 ? 0.6 : seamSet.has(i) ? 0.35 : 0, outD = i === last ? (total > 4 ? 1 : 0) : seamSet.has(i + 1) ? 0.35 : 0;
      const fadeAt = (kind) => [inD ? `${kind}=t=in:st=0:d=${inD}` : '', outD ? `${kind}=t=out:st=${Math.max(0, len - outD).toFixed(3)}:d=${outD}` : ''].filter(Boolean);
      const vf = [trimmed[i] ? 'trim=start_frame=1,setpts=PTS-STARTPTS' : '', `scale=${width}:${height}:force_original_aspect_ratio=decrease`, `pad=${width}:${height}:(ow-iw)/2:(oh-ih)/2`, 'setsar=1', 'fps=30', 'format=yuv420p', 'setpts=PTS-STARTPTS', ...fadeAt('fade')].filter(Boolean).join(',');
      // Tiếng gốc của clip (tiếng chổi, nước, bước chân…): cắt cùng chỗ với hình, đưa về 48 kHz stereo, đệm im lặng / cắt cho đúng độ dài hình để các đoạn khớp nhau.
      const withAudio = await hasAudio(t.ffprobe, clips[i]);
      const af = [...(withAudio && trimmed[i] ? [`atrim=start=${frames[i].toFixed(5)}`, 'asetpts=PTS-STARTPTS'] : []), 'aresample=48000', 'aformat=sample_fmts=fltp:channel_layouts=stereo', 'apad', `atrim=end=${len.toFixed(3)}`, 'asetpts=PTS-STARTPTS', ...fadeAt('afade')].join(',');
      const args = ['-hide_banner', '-loglevel', 'error', '-nostdin', '-y', '-i', clips[i]];
      if (!withAudio) args.push('-f', 'lavfi', '-t', len.toFixed(3), '-i', 'anullsrc=r=48000:cl=stereo');
      args.push('-filter_complex', `[0:v]${vf}[v];[${withAudio ? '0' : '1'}:a]${af}[a]`, '-map', '[v]', '-map', '[a]', ...encode, '-c:a', 'aac', '-ar', '48000', '-ac', '2', '-b:a', '192k', '-t', len.toFixed(3), '-f', 'mpegts', seg);
      await command(t.ffmpeg, args, 1800000);
      segments.push(path.basename(seg));
    }
    await fs.writeFile(listFile, segments.map(f => `file '${f}'`).join('\n') + '\n');
    onProgress('Đang ghép các đoạn và âm thanh…');
    const args = ['-hide_banner', '-loglevel', 'error', '-nostdin', '-y', '-f', 'concat', '-safe', '0', '-i', listFile];
    if (useMusic) args.push('-stream_loop', '-1', '-i', music);
    const orig = '[0:a]aresample=48000:async=1:first_pts=0,aformat=sample_fmts=fltp:channel_layouts=stereo';
    const audio = useMusic
      ? `${orig}[o];[1:a]atrim=0:${total.toFixed(3)},asetpts=PTS-STARTPTS,afade=t=in:st=0:d=1${total > 6 ? `,afade=t=out:st=${(total - 2.5).toFixed(3)}:d=2.5` : ''},aformat=sample_fmts=fltp:channel_layouts=stereo[m];[o][m]amix=inputs=2:weights=1 0.35:duration=first:dropout_transition=0,volume=1.35,alimiter=limit=0.95[a]`
      : `${orig}[a]`;
    args.push('-filter_complex', audio, '-map', '0:v:0', '-map', '[a]', '-c:v', 'copy', '-c:a', 'aac', '-ar', '48000', '-b:a', '192k', '-t', total.toFixed(3), '-movflags', '+faststart', temp);
    await command(t.ffmpeg, args, 3600000);
    const info = JSON.parse(await command(t.ffprobe, ['-v', 'error', '-show_format', '-show_streams', '-of', 'json', temp], 60000));
    if (!(Number(info.format.duration) > 0) || !info.streams.some(s => s.codec_type === 'video')) throw Error('Video dựng ra chưa hợp lệ.');
    const base = String(name || 'Video').replace(/[\\/:*?"<>|\u0000-\u001f]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 80) || 'Video';
    for (let n = 1; n <= 999; n++) {
      const final = path.join(dir, `${base}${n === 1 ? '' : ' (' + n + ')'}.mp4`);
      try { await fs.copyFile(temp, final, fs.constants.COPYFILE_EXCL); return final; }
      catch (e) { if (e.code !== 'EEXIST') throw e; }
    }
    throw Error('Quá nhiều video trùng tên trong thư mục.');
  } finally {
    for (const f of [...files, listFile, temp]) await fs.rm(f, { force: true }).catch(() => {});
  }
}

// Chọn các clip đưa vào video: bỏ cảnh người dùng đã loại (excluded = số cảnh). Chỗ cắt giữa hai cảnh KHÔNG liền nhau (do bỏ cảnh)
// coi như chỗ nối mới (không bỏ khung trùng, mờ nhẹ vào / ra) vì khung đầu cảnh sau không còn trùng khung cuối cảnh trước.
// clips: [{number, output}] đã xếp theo số cảnh; seams: chỉ số (theo `clips`) của đầu mỗi đoạn chạy song song. Trả về {used, seams} với seams theo `used`.
function planAssembly({ clips, excluded = [], seams = [] }) {
  const out = new Set((Array.isArray(excluded) ? excluded : []).map(Number));
  const used = clips.filter(c => !out.has(Number(c.number)));
  if (!used.length) throw Error('Phải giữ lại ít nhất một cảnh trong video.');
  const seamClips = new Set();
  for (const i of Array.isArray(seams) ? seams : []) if (clips[i]) seamClips.add(clips[i]);
  used.forEach((c, k) => { if (k > 0 && clips[clips.indexOf(c) - 1] !== used[k - 1]) seamClips.add(c); });
  return { used, seams: used.map((c, k) => (k > 0 && seamClips.has(c) ? k : -1)).filter(k => k > 0) };
}

module.exports = { planAssembly, restoreFolder, extractLastFrame, frameSimilarity, assembleRestore, CHUNK, SIZES, MUSIC_EXT, cleanId };
