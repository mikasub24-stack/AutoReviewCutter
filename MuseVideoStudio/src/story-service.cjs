// Điều phối tab «Kể chuyện» ở tiến trình chính: lấy clip đã xong theo ĐÚNG SỐ CẢNH,
// làm giọng đọc, rồi ghép MP4 (cắt clip thừa, phụ đề, tiếng động nền).
const fs = require('node:fs/promises');
const path = require('node:path');
const { randomUUID } = require('node:crypto');
const { assembleStory, measureScenes } = require('./story-render.cjs');

const MAX_PNG = 8 * 1024 * 1024;
const MAX_CHUNKS = 40;

// Cảnh của một truyện, xếp theo số cảnh (không theo thứ tự xong khi chạy nhiều luồng).
function storyJobs(jobs, storyId) {
  return (jobs || []).filter(j => j.kind === 'story' && (!storyId || j.storyId === storyId))
    .sort((a, b) => (a.order || 0) - (b.order || 0));
}
function storyFolder(output, storyId) {
  return path.join(output, 'KeChuyen', String(storyId || 'Truyen').replace(/[^\w-]/g, '') || 'Truyen');
}

function createStoryService({ getSettings, getJobs, voice, ensureAllowed = async () => {}, notify = () => {}, userDataDir }) {
  const state = { busy: false, progress: '', error: '', output: '', srt: '', notes: [], storyId: '' };
  let prepared = null, controller = null;

  const say = text => { state.progress = text; notify(); };
  function status() { return { busy: state.busy, progress: state.progress, error: state.error, output: state.output, srt: state.srt, notes: state.notes, storyId: state.storyId }; }

  function pick(storyId) {
    const jobs = storyJobs(getJobs(), storyId);
    if (!jobs.length) throw Error('Chưa có cảnh nào của truyện này trong hàng đợi.');
    const missing = jobs.filter(j => j.status !== 'completed' || !j.output).map(j => j.order || '?');
    if (missing.length) throw Error(`Còn ${missing.length} cảnh chưa có clip (cảnh ${missing.slice(0, 12).join(', ')}${missing.length > 12 ? '…' : ''}). Chạy hàng đợi cho xong rồi xuất.`);
    return jobs;
  }

  async function guard(task) {
    if (state.busy) throw Error('Đang xử lý truyện, chờ xong đã.');
    state.busy = true; state.error = ''; controller = new AbortController(); notify();
    try { return await task(controller.signal); }
    catch (error) { state.error = error.name === 'AbortError' ? 'Đã dừng.' : error.message; throw error; }
    finally { state.busy = false; controller = null; state.progress = state.error ? '' : state.progress; notify(); }
  }

  // Bước 1: làm giọng đọc cho mọi cảnh, đo thời lượng để chia phụ đề.
  function prepare({ storyId, engine = 'none', voice: voiceId = '', tempo = 1 }) {
    return guard(async signal => {
      await ensureAllowed();
      const jobs = pick(storyId);
      const settings = getSettings();
      if (!settings.output) throw Error('Chọn thư mục lưu video trước.');
      const dir = path.join(userDataDir, 'story-run', randomUUID().slice(0, 8));
      await fs.rm(path.join(userDataDir, 'story-run'), { recursive: true, force: true }).catch(() => {});
      await fs.mkdir(dir, { recursive: true });
      let voices = [];
      if (engine !== 'none') {
        say('Đang làm giọng đọc…');
        voices = await voice.synth({ engine, voice: voiceId, tempo, dir, signal, onProgress: say, items: jobs.map(j => ({ id: j.id, text: j.voiceover || '' })) });
      }
      const byId = new Map(voices.map(v => [v.id, v.file]));
      const scenes = jobs.map(j => ({ id: j.id, number: j.order, clip: j.output, voice: byId.get(j.id) || null, text: j.voiceover || '' }));
      say('Đang đo độ dài từng cảnh…');
      const lengths = await measureScenes({ scenes, ffmpeg: settings.ffmpeg });
      prepared = { runId: path.basename(dir), dir, storyId, scenes };
      say(`Đã chuẩn bị ${scenes.length} cảnh`);
      return { runId: prepared.runId, scenes: scenes.map((s, i) => ({ id: s.id, number: s.number, text: s.text, seconds: lengths[i].seconds, clipSeconds: lengths[i].clipSeconds, voiceSeconds: lengths[i].voiceSeconds })) };
    });
  }

  // Bước 2: nhận ảnh phụ đề từ giao diện rồi ghép MP4.
  function build({ runId, name, aspect = '16:9', subtitles = true, srt = false, sfx = 'low', scenes = [] }) {
    return guard(async signal => {
      await ensureAllowed();
      if (!prepared || prepared.runId !== runId) throw Error('Phiên chuẩn bị đã hết hạn. Bấm Xuất MP4 lại.');
      const settings = getSettings();
      const extra = new Map((Array.isArray(scenes) ? scenes : []).map(s => [s.id, s]));
      const parts = [];
      for (const scene of prepared.scenes) {
        const given = extra.get(scene.id);
        const chunks = [];
        const list = Array.isArray(given?.chunks) ? given.chunks.slice(0, MAX_CHUNKS) : [];
        for (const [k, chunk] of list.entries()) {
          if (!chunk || typeof chunk.text !== 'string' || !Number.isFinite(chunk.start) || !Number.isFinite(chunk.end) || chunk.end <= chunk.start) continue;
          let png = null;
          if (chunk.png) {
            const bytes = Buffer.from(chunk.png);
            if (!bytes.length || bytes.length > MAX_PNG || bytes.readUInt32BE(0) !== 0x89504e47) throw Error('Ảnh phụ đề không hợp lệ.');
            png = path.join(prepared.dir, `sub-${scene.number}-${k}.png`);
            await fs.writeFile(png, bytes);
          }
          chunks.push({ text: chunk.text, start: chunk.start, end: chunk.end, png });
        }
        parts.push({ clip: scene.clip, voice: scene.voice, chunks });
      }
      const folder = storyFolder(settings.output, prepared.storyId);
      const result = await assembleStory({ scenes: parts, dir: folder, name: String(name || prepared.storyId || 'Ke-chuyen'), ffmpeg: settings.ffmpeg, aspect, subtitles: Boolean(subtitles), srt: Boolean(srt), sfx, onProgress: say, signal });
      Object.assign(state, { output: result.output, srt: result.srt, notes: result.notes, storyId: prepared.storyId });
      await fs.rm(prepared.dir, { recursive: true, force: true }).catch(() => {});
      prepared = null;
      say('Đã xuất MP4');
      return status();
    });
  }

  function cancel() { controller?.abort(); }
  return { status, prepare, build, cancel, state };
}

module.exports = { createStoryService, storyJobs, storyFolder };
