// Tab «Động vật hoang dã»: Muse viết kịch bản phim tài liệu NGAY TRONG APP, từng bước nhỏ:
//   1. hồ sơ phim (sự thật khoa học, nhân vật, bối cảnh, dàn ý chương);
//   2. từng chương, mỗi lượt ≤ PART_SCENES cảnh, lượt sau biết 3 cảnh ngay trước để nối liền mạch.
// Mỗi lượt được soát (đủ số cảnh, đủ trường, không lặp) và hỏi lại nếu lỗi. Có thể làm tiếp từ bản nháp đã lưu.
const { randomBytes } = require('node:crypto');
const { createMuseAsk, infra } = require('./muse-ask.cjs');
const defaultPlan = require('./wild-plan.js');

const ATTEMPTS = 3;

function createWildWriter({ plan = defaultPlan, dom, openMuse, getMuse, getSettings, delay, notify = () => {}, isBusy = () => false, ensureAllowed = async () => {}, timing = {}, ask: askOverride = null }) {
  const state = { busy: false, progress: '', error: '', done: 0, total: 0, phase: '' };
  let controller = null;
  const say = (progress, extra = {}) => { Object.assign(state, { progress }, extra); notify(); };
  const status = () => ({ busy: state.busy, progress: state.progress, error: state.error, done: state.done, total: state.total, phase: state.phase });
  const driver = askOverride ? null : createMuseAsk({ dom, getSettings, delay, say: (...a) => say(...a), timing });
  const ask = askOverride || driver.ask;
  const check = signal => { if (signal.aborted) throw Object.assign(Error('Đã dừng viết kịch bản.'), { name: 'AbortError' }); };
  const wait = async (ms, signal) => { const end = Date.now() + ms; while (Date.now() < end) { check(signal); await delay(Math.min(250, end - Date.now())); } check(signal); };
  const newMarker = () => randomBytes(3).toString('hex');

  // Hỏi Muse một lượt, thử lại khi Muse chưa nhận được yêu cầu (lỗi hạ tầng) một lần.
  async function askOnce(muse, instruction, marker, signal, label, attempt) {
    try { return await ask(muse, instruction, marker, signal, label); }
    catch (e) { if (!e.infra || attempt) throw e; await wait(2000, signal); return null; }
  }

  async function writeBible(muse, config, signal) {
    let fix = '', last = null;
    for (let attempt = 0; attempt < ATTEMPTS; attempt++) {
      check(signal);
      const marker = newMarker();
      say('Lập hồ sơ phim · chuẩn bị yêu cầu…', { phase: 'bible' });
      const reply = await askOnce(muse, plan.buildBibleInstruction(config, { marker, fix }), marker, signal, 'Lập hồ sơ phim', attempt);
      if (reply == null) continue;
      try { return plan.parseBible(reply, config); }
      catch (e) { if (!e.fixable) throw e; last = e; fix = e.fix; }
    }
    throw last || Error('Muse chưa lập được hồ sơ phim. Bấm Tạo phim lại.');
  }

  // Chia chương thành các lượt đều nhau, mỗi lượt ≤ PART_SCENES cảnh.
  function rangesOf(chapter) {
    const n = chapter.to - chapter.from + 1, parts = Math.max(1, Math.ceil(n / plan.PART_SCENES));
    const out = [];
    let from = chapter.from;
    for (let i = 0; i < parts; i++) { const size = Math.floor(n / parts) + (i < n % parts ? 1 : 0); out.push([from, from + size - 1]); from += size; }
    return out;
  }

  async function writeRange({ muse, config, bible, chapter, range, have, signal, label }) {
    const castIds = bible.cast.map(c => c.id);
    const good = new Map();   // cảnh đã đạt trong lượt này
    let want = range, fix = '';
    for (let attempt = 0; attempt < ATTEMPTS; attempt++) {
      check(signal);
      const marker = newMarker();
      const before = [...have.values(), ...good.values()].filter(s => s.number < want[0]).sort((a, b) => a.number - b.number);
      say(`${label} · chuẩn bị yêu cầu…`, { phase: 'scenes' });
      const instruction = plan.buildChapterInstruction(config, bible, { marker, chapter, range: want, previous: before.slice(-3), fix });
      const reply = await askOnce(muse, instruction, marker, signal, label, attempt);
      if (reply == null) continue;
      const scenes = plan.parseScenes(reply, config).filter(s => s.number >= want[0] && s.number <= want[1]);
      const result = plan.checkScenes(scenes, want, config, { castIds });
      const bad = new Set([...result.missing, ...result.bad]);
      for (const s of scenes) if (!bad.has(s.number) && !good.has(s.number)) good.set(s.number, s);
      const left = [];
      for (let n = range[0]; n <= range[1]; n++) if (!good.has(n)) left.push(n);
      if (!left.length) return [...good.values()].sort((a, b) => a.number - b.number);
      want = [left[0], left[left.length - 1]];
      fix = plan.fixText({ missing: result.missing.filter(n => left.includes(n)), bad: result.bad.filter(n => left.includes(n)), issues: result.issues.filter(x => left.some(n => new RegExp(`^Cảnh ${n}\\b`).test(x))) }, want);
    }
    const left = [];
    for (let n = range[0]; n <= range[1]; n++) if (!good.has(n)) left.push(n);
    const error = Object.assign(Error(`Muse viết thiếu hoặc sai khuôn cảnh ${left.slice(0, 10).join(', ')}${left.length > 10 ? '…' : ''}. Bấm «Viết tiếp» để Muse làm tiếp từ chỗ này.`), { partial: [...good.values()] });
    throw error;
  }

  // resume = { bible, scenes } từ bản nháp đã lưu. onDraft({bible, scenes}) được gọi sau mỗi lượt để lưu nháp.
  async function write({ options: input = {}, resume = null, onDraft = () => {} }) {
    if (state.busy) throw Error('Muse đang viết kịch bản. Chờ xong hoặc bấm Dừng.');
    const config = plan.options(input), bad = plan.problems(config);
    if (bad.length) throw Error(bad[0]);
    if (isBusy()) throw Error('Dừng hàng đợi và các thao tác trình duyệt trước khi nhờ Muse viết kịch bản.');
    await ensureAllowed();
    controller = new AbortController();
    const signal = controller.signal;
    Object.assign(state, { busy: true, error: '', progress: 'Đang mở Muse…', done: 0, total: config.scenes, phase: 'bible' });
    notify();
    try {
      let muse = null;
      if (!askOverride) {
        await openMuse(0);
        check(signal);
        muse = getMuse(0);
        if (!muse) throw infra('Chưa mở được Muse tài khoản 1.');
      }
      let bible = resume && resume.bible && Array.isArray(resume.bible.chapters) && resume.bible.chapters.length ? resume.bible : null;
      if (!bible) { bible = await writeBible(muse, config, signal); onDraft({ bible, scenes: [] }); }
      state.total = bible.total;
      const have = new Map();
      for (const s of (resume && Array.isArray(resume.scenes) ? resume.scenes : [])) if (s && Number.isInteger(s.number) && s.number >= 1 && s.number <= bible.total) have.set(s.number, s);
      const draft = () => ({ bible, scenes: [...have.values()].sort((a, b) => a.number - b.number) });
      const jobs = bible.chapters.flatMap(chapter => rangesOf(chapter).map(range => ({ chapter, range })));
      for (let i = 0; i < jobs.length; i++) {
        const { chapter, range } = jobs[i];
        const complete = Array.from({ length: range[1] - range[0] + 1 }, (_, k) => range[0] + k).every(n => have.has(n));
        if (complete) { state.done = Math.max(state.done, range[1]); continue; }
        const label = `Viết kịch bản ${i + 1}/${jobs.length} (cảnh ${range[0]}–${range[1]}, chương ${chapter.n}: ${chapter.title})`;
        try {
          const scenes = await writeRange({ muse, config, bible, chapter, range, have, signal, label });
          for (const s of scenes) have.set(s.number, s);
        } catch (e) {
          for (const s of e.partial || []) have.set(s.number, s);
          onDraft(draft());
          throw e;
        }
        state.done = range[1];
        onDraft(draft());
        say(`Đã viết ${range[1]}/${bible.total} cảnh`);
      }
      const scenes = plan.assemble(bible, [...have.values()]);
      if (scenes.length !== bible.total) throw Error(`Kịch bản mới có ${scenes.length}/${bible.total} cảnh. Bấm «Viết tiếp».`);
      say(`Muse đã viết xong kịch bản (${scenes.length} cảnh)`, { phase: 'done' });
      return { bible, scenes, config };
    } catch (error) {
      state.error = error.name === 'AbortError' ? '' : String(error.message).replace('bấm Phân tích lại.', 'bấm Tạo phim lại.');
      throw error;
    } finally {
      state.busy = false; controller = null;
      notify();
    }
  }

  function cancel() { controller?.abort(); }
  return { write, cancel, status, rangesOf, get busy() { return state.busy; } };
}

module.exports = { createWildWriter };
