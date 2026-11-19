// Tab «Bản đồ lịch sử»: dựng video từ kịch bản.
//   kịch bản → đọc lời tiếng Anh từng giai đoạn (giọng Microsoft miễn phí) → chia thời gian theo lời đọc → vẽ từng khung hình
//   (cửa sổ ẩn hoặc nguồn khung giả khi kiểm thử) → ffmpeg ghép hình → trộn lời đọc + nhạc nền (nhạc tự nhỏ đi khi có lời) → MP4.
const fs = require('node:fs/promises');
const path = require('node:path');
const zlib = require('node:zlib');
const { spawn } = require('node:child_process');
const Geo = require('./maphist-geo.js');
const Plan = require('./maphist-plan.js');
const { checkTools } = require('./merge.cjs');

const FPS = 30;
const MUSIC_EXT = ['.mp3', '.wav', '.m4a', '.aac', '.ogg', '.flac'];
const WORLD_FILE = path.join(__dirname, 'assets', 'maphist', 'world.json.gz');
const cleanName = (name, fallback = 'Ban-do-lich-su') => String(name || '').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/g, 'd').replace(/Đ/g, 'D').replace(/[^\w-]+/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '').slice(0, 60) || fallback;
const num = n => (Math.round(n * 1000) / 1000).toString();

// Chạy ffmpeg; `feed(stdin)` đẩy dữ liệu vào đầu vào (khung hình). Dừng được ngay khi bấm Dừng.
function run(file, args, { signal, timeout = 3 * 3600000, feed = null } = {}) {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) return reject(Object.assign(Error('Đã dừng.'), { name: 'AbortError' }));
    const child = spawn(file, args, { windowsHide: true, shell: false, stdio: [feed ? 'pipe' : 'ignore', 'ignore', 'pipe'] });
    let err = '', timedOut = false, feedError = null;
    const stop = () => child.kill();
    const timer = setTimeout(() => { timedOut = true; stop(); }, timeout);
    signal?.addEventListener('abort', stop, { once: true });
    child.stderr.on('data', b => { err = (err + b).slice(-16000); });
    child.once('error', e => { clearTimeout(timer); reject(Error(`Không mở được ${path.basename(file)}: ${e.message}. Chọn FFmpeg và ffprobe trong Cài đặt.`)); });
    child.stdin?.on('error', () => { /* ffmpeg đã đóng đầu vào; lỗi thật báo ở lúc đóng tiến trình */ });
    child.once('close', code => {
      clearTimeout(timer); signal?.removeEventListener('abort', stop);
      if (signal?.aborted) reject(Object.assign(Error('Đã dừng.'), { name: 'AbortError' }));
      else if (timedOut) reject(Error('FFmpeg vượt thời gian xử lý.'));
      else if (feedError && !err.trim()) reject(feedError);
      else if (code !== 0 || feedError) reject(Error(`${path.basename(file)} thất bại (${code}): ${err.trim().split('\n').slice(-4).join(' ')}`));
      else resolve({ err });
    });
    if (feed) Promise.resolve().then(() => feed(child.stdin)).catch(e => { feedError = e; child.kill(); });
  });
}

// Ghi một khối vào stdin của ffmpeg, đợi khi ống đầy (không để RAM phình ra khi vẽ nhanh hơn mã hóa).
function writeChunk(stream, chunk) {
  return new Promise((resolve, reject) => {
    if (stream.destroyed) return reject(Error('FFmpeg đã dừng nhận khung hình.'));
    const ok = stream.write(chunk, err => err && reject(err));
    if (ok) resolve(); else stream.once('drain', resolve);
  });
}

function videoArgs({ fps = FPS, out, threads = 0 }) {
  return ['-hide_banner', '-loglevel', 'error', '-nostdin', '-y', '-f', 'image2pipe', '-framerate', String(fps), '-c:v', 'mjpeg', '-i', 'pipe:0',
    '-an', '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '20', '-pix_fmt', 'yuv420p', '-r', String(fps), '-threads', String(threads), '-movflags', '+faststart', out];
}

// Bộ lọc âm thanh: lời đọc đặt đúng giây, nhạc nền lặp + mờ vào/ra và tự nhỏ đi khi có lời.
// voices: [{ file, start (giây trong video), dur (độ dài khoảng dành cho giai đoạn) }]; music: file hoặc ''.
function audioPlan({ voices, music, musicVolume = .2, total, introEnd, outroSeconds, firstInput = 0 }) {
  const inputs = [], filters = [];
  const norm = 'aresample=48000,aformat=sample_fmts=fltp:channel_layouts=stereo,asetpts=PTS-STARTPTS';
  let narration = '';
  if (voices.length) {
    // Mỗi giai đoạn thành một đoạn đúng độ dài (lời đọc + khoảng lặng) rồi nối liền.
    const labels = [];
    inputs.push(['-f', 'lavfi', '-t', num(introEnd), '-i', 'anullsrc=r=48000:cl=stereo']);
    labels.push(`[${firstInput + inputs.length - 1}:a]${norm}[s0]`);
    const parts = ['[s0]'];
    voices.forEach((v, i) => {
      inputs.push(['-i', v.file]);
      const k = firstInput + inputs.length - 1, lead = Math.max(0, v.lead || 0);
      labels.push(`[${k}:a]${norm},adelay=${Math.round(lead * 1000)}|${Math.round(lead * 1000)},apad=whole_dur=${num(v.dur)},atrim=0:${num(v.dur)},asetpts=PTS-STARTPTS[v${i}]`);
      parts.push(`[v${i}]`);
    });
    inputs.push(['-f', 'lavfi', '-t', num(outroSeconds), '-i', 'anullsrc=r=48000:cl=stereo']);
    labels.push(`[${firstInput + inputs.length - 1}:a]${norm}[s1]`);
    parts.push('[s1]');
    filters.push(...labels, `${parts.join('')}concat=n=${parts.length}:v=0:a=1[nar]`);
    narration = '[nar]';
  }
  if (music) {
    inputs.push(['-stream_loop', '-1', '-i', music]);
    const k = firstInput + inputs.length - 1;
    filters.push(`[${k}:a]${norm},volume=${num(musicVolume)},atrim=0:${num(total)},afade=t=in:d=2,afade=t=out:st=${num(Math.max(0, total - 3))}:d=3,asetpts=PTS-STARTPTS[mus]`);
    if (narration) {
      filters.push(`${narration}asplit=2[n1][n2]`, '[mus][n1]sidechaincompress=threshold=0.04:ratio=9:attack=20:release=500[duck]',
        '[duck][n2]amix=inputs=2:duration=longest:dropout_transition=0,volume=2,alimiter=limit=0.95[aout]');
    } else filters.push('[mus]alimiter=limit=0.95[aout]');
  } else if (narration) filters.push(`${narration}alimiter=limit=0.95[aout]`);
  return { inputs, filters, hasAudio: filters.length > 0 };
}

function createMapService({ getSettings = () => ({}), voice = null, ensureAllowed = async () => {}, notify = () => {}, renderFrames, renderStill = null, loadRaw = null, userDataDir = '' } = {}) {
  const state = { busy: false, phase: '', progress: '', done: 0, total: 0, error: '', runId: '', preview: '', previewAt: 0 };
  let controller = null, geoCache = null, rawCache = null;
  const say = (progress, extra = {}) => { Object.assign(state, { progress }, extra); notify(); };
  const status = () => ({ ...state });

  async function raw() {
    if (rawCache) return rawCache;
    rawCache = loadRaw ? await loadRaw() : JSON.parse(zlib.gunzipSync(await fs.readFile(WORLD_FILE)).toString('utf8'));
    return rawCache;
  }
  async function geo() { return geoCache || (geoCache = Geo.build(await raw())); }

  // Đọc lời tiếng Anh từng giai đoạn → [{ file, seconds }] theo thứ tự (null nếu không dùng giọng).
  async function speak({ script, config, dir, signal }) {
    if (!config.voice) return script.eras.map(() => null);
    if (!voice) throw Error('Chưa có bộ làm giọng.');
    const items = script.eras.map((e, i) => ({ id: `e${i + 1}`, label: String(i + 1), text: e.narration }));
    const done = await voice.synth({ engine: 'edge', voice: config.voice, items, tempo: config.tempo, volume: 1, dir, signal, onProgress: text => say(text, { phase: 'voice' }) });
    const byId = new Map(done.map(d => [d.id, d]));
    return items.map(item => byId.get(item.id) || null);
  }

  // Dựng cả video. script: kịch bản thô hoặc đã chuẩn hóa. Trả về { output, seconds, issues }.
  async function make({ runId, dir, name, config: input = {}, script: rawScript, onDone = () => {} }) {
    if (state.busy) throw Error('Đang dựng một video bản đồ. Chờ xong hoặc bấm Dừng.');
    await ensureAllowed();
    const settings = getSettings();
    const config = Plan.options(input);
    const g = await geo();
    const { script, issues } = Plan.normalizeScript(rawScript, g);
    if (!script.eras.length) throw Error('Kịch bản chưa có giai đoạn nào để dựng.');
    if (script.eras.some(e => Plan.words(e.narration) < 3)) throw Error('Có giai đoạn chưa có lời đọc. Điền lời đọc rồi dựng lại.');
    if (config.music && !MUSIC_EXT.includes(path.extname(config.music).toLowerCase())) throw Error(`Nhạc nền phải là ${MUSIC_EXT.join(', ')}.`);
    if (config.music) await fs.access(config.music).catch(() => { throw Error('Không mở được file nhạc nền. Chọn lại file nhạc.'); });
    controller = new AbortController();
    const signal = controller.signal;
    Object.assign(state, { busy: true, phase: 'prepare', progress: 'Đang chuẩn bị…', done: 0, total: 0, error: '', runId, preview: '', previewAt: 0 });
    notify();
    const temp = path.join(dir, '.dang-dung');
    try {
      const t = await checkTools(settings.ffmpeg || 'ffmpeg');
      await fs.mkdir(dir, { recursive: true });
      await fs.rm(temp, { recursive: true, force: true });
      await fs.mkdir(temp, { recursive: true });
      // 1. Lời đọc
      say('Đang đọc lời thuyết minh…', { phase: 'voice' });
      const spoken = await speak({ script, config, dir: path.join(dir, 'giong'), signal });
      if (signal.aborted) throw Object.assign(Error('Đã dừng.'), { name: 'AbortError' });
      // 2. Dòng thời gian theo độ dài lời đọc thật
      const timeline = Plan.compile(script, g, { durations: spoken.map(s => (s ? s.seconds : 0)), fps: FPS });
      const frames = Math.ceil(timeline.total * FPS);
      // 3. Vẽ + mã hóa hình
      const silent = path.join(temp, 'hinh.mp4');
      Object.assign(state, { phase: 'render', done: 0, total: frames });
      say(`Đang vẽ khung hình 0/${frames}…`);
      const started = Date.now();
      let written = 0;
      await run(t.ffmpeg, videoArgs({ out: silent }), {
        signal,
        feed: async stdin => {
          await renderFrames({
            timeline, raw: await raw(), fps: FPS, signal,
            onFrame: async buffer => {
              if (signal.aborted) return { stop: true };
              await writeChunk(stdin, Buffer.from(buffer));
              written++;
              if (written % 15 === 0 || written === frames) {
                const speed = written / Math.max(1, (Date.now() - started) / 1000), left = Math.max(0, Math.round((frames - written) / Math.max(speed, .1)));
                const extra = { done: written };
                // Khung xem trước: ghi luân phiên hai file (file đang hiện không bị ghi đè), lỗi ghi thì bỏ qua.
                try {
                  const file = path.join(temp, `xem-truoc-${Math.floor(written / 15) % 2}.jpg`);
                  await fs.writeFile(file, Buffer.from(buffer));
                  Object.assign(extra, { preview: file, previewAt: Date.now() });
                } catch { /* không có xem trước thì thôi */ }
                say(`Đang vẽ khung hình ${written}/${frames} · còn khoảng ${left >= 90 ? Math.round(left / 60) + ' phút' : left + ' giây'}`, extra);
              }
              return { stop: false };
            }
          });
          stdin.end();
        }
      });
      if (signal.aborted) throw Object.assign(Error('Đã dừng.'), { name: 'AbortError' });
      if (written < frames) throw Error(`Chỉ vẽ được ${written}/${frames} khung hình. Thử dựng lại.`);
      // 4. Ghép tiếng
      say('Đang ghép lời đọc và nhạc nền…', { phase: 'mux' });
      const output = path.join(dir, `${cleanName(name || script.title)}.mp4`);
      const voices = timeline.eras.map((e, i) => spoken[i] ? { file: spoken[i].file, lead: Plan.LEAD, dur: e.dur } : null).filter(Boolean);
      const audio = audioPlan({ voices, music: config.music, musicVolume: config.musicVolume, total: timeline.total, introEnd: timeline.introEnd, outroSeconds: Plan.OUTRO, firstInput: 1 });   // đầu vào 0 là video đã vẽ
      if (audio.hasAudio) {
        const args = ['-hide_banner', '-loglevel', 'error', '-nostdin', '-y', '-i', silent];
        for (const group of audio.inputs) args.push(...group);
        args.push('-filter_complex', audio.filters.join(';'), '-map', '0:v', '-map', '[aout]', '-c:v', 'copy', '-c:a', 'aac', '-b:a', '192k', '-t', num(timeline.total), '-movflags', '+faststart', output);
        await run(t.ffmpeg, args, { signal });
      } else await fs.copyFile(silent, output);
      Object.assign(state, { preview: '', previewAt: 0 });
      await fs.rm(temp, { recursive: true, force: true });
      say('Video bản đồ đã dựng xong', { phase: 'done' });
      // Tiêu đề đăng YouTube (đúng tiêu đề trên video) + mô tả có chương + thẻ; ghi sẵn thành file cạnh video.
      const publish = Plan.publishPack(script, timeline);
      let publishFile = '';
      try { publishFile = path.join(dir, 'tieu-de-youtube.txt'); await fs.writeFile(publishFile, publish.text, 'utf8'); } catch { publishFile = ''; }
      const result = { output, seconds: timeline.total, eras: script.eras.length, issues, publish: { title: publish.title, description: publish.description, tags: publish.tags, chapters: publish.chapters }, publishFile };
      onDone(result);
      return result;
    } catch (error) {
      state.error = error.name === 'AbortError' ? '' : String(error.message);
      Object.assign(state, { preview: '', previewAt: 0 });
      await fs.rm(temp, { recursive: true, force: true }).catch(() => {});
      throw error;
    } finally {
      state.busy = false; controller = null;
      notify();
    }
  }

  const THUMB_STYLES = 3;
  // Giai đoạn đáng làm ảnh bìa nhất: nhiều lãnh thổ + địa danh nhất (tối đa 3 lựa chọn, tốt nhất trước).
  function pickEras(timeline) {
    const scored = timeline.eras.map((e, i) => ({ i, score: (e.realms || []).reduce((n, r) => n + ((r.units || []).length), 0) * 10 + (e.markers || []).length * 3 + (e.routes || []).length * 2 + i * .01 }));
    return scored.sort((a, b) => b.score - a.score).slice(0, 3).map(x => x.i);
  }
  // Ảnh bìa 16:9 (1920×1080 JPEG ≤ 2 MB, đúng giới hạn YouTube) của video đã có kịch bản: vài từ RẤT TO (script.hook, hoặc lấy từ tiêu đề) + quả cầu cờ mặt giận dữ.
  // 3 kiểu: đối đầu hai thế lực / nhân vật lớn bên trái / nhân vật lớn bên phải; mỗi kiểu lấy một trong các giai đoạn đẹp nhất.
  async function thumbnail({ dir, name, script: rawScript, variant = 0 }) {
    if (state.busy) throw Error('Đang dựng một video bản đồ. Chờ dựng xong rồi tạo thumbnail.');
    await ensureAllowed();
    if (!renderStill) throw Error('Chưa có bộ vẽ ảnh bìa.');
    const g = await geo();
    const { script } = Plan.normalizeScript(rawScript, g);
    if (!script.eras.length) throw Error('Kịch bản chưa có giai đoạn nào.');
    const timeline = Plan.compile(script, g, { durations: [], fps: FPS });
    const picks = pickEras(timeline), count = THUMB_STYLES, k = ((Math.round(Number(variant)) || 0) % count + count) % count;
    let buffer = null;
    for (const quality of [.92, .86, .8, .72, .64]) {
      buffer = Buffer.from(await renderStill({ timeline, raw: await raw(), index: picks[k % picks.length], variant: k, hook: Plan.hookOf(script), quality }));
      if (buffer.length <= 1.9e6) break;
    }
    await fs.mkdir(dir, { recursive: true });
    const file = path.join(dir, `thumbnail-${k + 1}.jpg`), part = file + '.tmp';
    await fs.writeFile(part, buffer);
    await fs.rename(part, file);
    return { file, era: picks[k % picks.length], variant: k, count, bytes: buffer.length };
  }

  const cancel = () => controller?.abort();
  return { make, thumbnail, cancel, status, geo, raw, speak, get busy() { return state.busy; } };
}

module.exports = { createMapService, audioPlan, videoArgs, writeChunk, cleanName, FPS, MUSIC_EXT, WORLD_FILE };
