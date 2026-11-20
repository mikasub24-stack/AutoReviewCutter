// Tab «Bản đồ lịch sử»: Muse soạn kịch bản NGAY TRONG APP từ một chủ đề, hai bước nhỏ:
//   1. dàn ý (tiêu đề, nước ở trung tâm, các giai đoạn theo năm);
//   2. chi tiết từng lượt ≤ BATCH giai đoạn (lời đọc tiếng Anh, thế lực + vùng tô, địa danh, hành trình).
// Mỗi lượt được soát (đủ giai đoạn, lời đọc đủ dài, tên vùng khớp dữ liệu bản đồ) và hỏi lại nếu lỗi. Có thể làm tiếp từ bản nháp.
const { randomBytes } = require('node:crypto');
const { createMuseAsk, infra } = require('./muse-ask.cjs');
const defaultPlan = require('./maphist-plan.js');

const ATTEMPTS = 3;

function createMapWriter({ plan = defaultPlan, geo, dom, openMuse, getMuse, getSettings, delay, notify = () => {}, isBusy = () => false, leaseAccount = null, ensureAllowed = async () => {}, timing = {}, ask: askOverride = null }) {
  const state = { busy: false, progress: '', error: '', done: 0, total: 0, phase: '' };
  let controller = null;
  const say = (progress, extra = {}) => { Object.assign(state, { progress }, extra); notify(); };
  const status = () => ({ busy: state.busy, progress: state.progress, error: state.error, done: state.done, total: state.total, phase: state.phase });
  const driver = askOverride ? null : createMuseAsk({ dom, getSettings, delay, say: (...a) => say(...a), timing });
  const ask = askOverride || driver.ask;
  const check = signal => { if (signal.aborted) throw Object.assign(Error('Đã dừng soạn kịch bản.'), { name: 'AbortError' }); };
  const wait = async (ms, signal) => { const end = Date.now() + ms; while (Date.now() < end) { check(signal); await delay(Math.min(250, end - Date.now())); } check(signal); };
  const newMarker = () => randomBytes(3).toString('hex');
  const getGeo = () => (typeof geo === 'function' ? geo() : geo);

  // Hỏi Muse một lượt; lỗi hạ tầng (Muse chưa nhận được yêu cầu) thì chờ rồi thử lại một lần.
  async function askOnce(muse, instruction, marker, signal, label, attempt) {
    try { return await ask(muse, instruction, marker, signal, label); }
    catch (e) { if (!e.infra || attempt) throw e; await wait(2000, signal); return null; }
  }

  async function writeOutline(muse, config, signal, countryNames) {
    let fix = '', last = null;
    for (let attempt = 0; attempt < ATTEMPTS; attempt++) {
      check(signal);
      const marker = newMarker();
      say('Lập dàn ý · chuẩn bị yêu cầu…', { phase: 'outline' });
      const reply = await askOnce(muse, plan.buildOutlineInstruction(config, { marker, countryNames, fix }), marker, signal, 'Lập dàn ý', attempt);
      if (reply == null) continue;
      try { return plan.parseOutline(reply, config); }
      catch (e) { if (!e.fixable) throw e; last = e; fix = e.fix; }
    }
    throw last || Error('Muse chưa lập được dàn ý. Bấm làm lại.');
  }

  async function writeRange({ muse, config, outline, range, previous, provinces, countryNames, signal, label, have = new Map() }) {
    const g = getGeo();
    const good = new Map();
    for (let n = range[0]; n <= range[1]; n++) if (have.has(n)) good.set(n, have.get(n));   // làm tiếp: chỉ hỏi lại những giai đoạn còn thiếu
    const todo = [];
    for (let n = range[0]; n <= range[1]; n++) if (!good.has(n)) todo.push(n);
    let want = todo.length ? [todo[0], todo[todo.length - 1]] : range, fix = '';
    for (let attempt = 0; attempt < ATTEMPTS; attempt++) {
      check(signal);
      const marker = newMarker();
      say(`${label} · chuẩn bị yêu cầu…`, { phase: 'eras' });
      const instruction = plan.buildErasInstruction(config, outline, { marker, range: want, previous, provinces, countryNames, fix });
      const reply = await askOnce(muse, instruction, marker, signal, label, attempt);
      if (reply == null) continue;
      let items;
      try { items = plan.parseEras(reply); }
      catch (e) { if (!e.fixable) throw e; fix = e.fix; continue; }
      const result = plan.checkEras(items, want, g, outline.country);
      const bad = new Set([...result.missing, ...result.bad]);
      for (const [n, raw] of items) if (n >= want[0] && n <= want[1] && !bad.has(n) && !good.has(n)) good.set(n, raw);
      const left = [];
      for (let n = range[0]; n <= range[1]; n++) if (!good.has(n)) left.push(n);
      // Lượt cuối: nhận bản còn lỗi vùng (người dùng sửa ở bước xem lại) miễn là có lời đọc.
      if (left.length && attempt === ATTEMPTS - 1) {
        for (const n of left) { const raw = items.get(n); if (raw && plan.words(raw.narration) >= 8) good.set(n, raw); }
      }
      const rest = [];
      for (let n = range[0]; n <= range[1]; n++) if (!good.has(n)) rest.push(n);
      if (!rest.length) return good;
      want = [rest[0], rest[rest.length - 1]];
      fix = plan.fixText({ missing: result.missing.filter(n => rest.includes(n)), bad: result.bad.filter(n => rest.includes(n)), issues: result.issues.filter(x => rest.some(n => new RegExp(`^Giai đoạn ${n}\\b`).test(x))) }, want);
    }
    const left = [];
    for (let n = range[0]; n <= range[1]; n++) if (!good.has(n)) left.push(n);
    throw Object.assign(Error(`Muse viết thiếu hoặc sai giai đoạn ${left.join(', ')}. Bấm «Viết tiếp» để Muse làm tiếp từ chỗ này.`), { partial: good });
  }

  // resume = { outline, items:{n: eraRaw} } từ bản nháp đã lưu. onDraft({outline, items}) được gọi sau mỗi lượt để lưu nháp.
  // Chủ đề để trống: Muse tự chọn; onOutline(outline) báo ngay khi có dàn ý (có tên video thật).
  async function write({ options: input = {}, resume = null, onDraft = () => {}, onOutline = () => {} }) {
    if (state.busy) throw Error('Muse đang soạn kịch bản. Chờ xong hoặc bấm Dừng.');
    const config = plan.options(input), bad = plan.problems(config);
    if (bad.length) throw Error(bad[0]);
    // Có hàm leaseAccount: chọn một tài khoản Muse đang mở mà đang rảnh (tài khoản 1 bận thì dùng tài khoản khác).
    let lease = null;
    if (leaseAccount) {
      await ensureAllowed();
      lease = leaseAccount('map');
      if (!lease) throw Error('Mọi tài khoản Muse đang mở đều bận. Chờ xong hoặc mở thêm một tài khoản Muse khác rồi bấm «Viết tiếp».');
    } else {
      if (isBusy()) throw Error('Dừng hàng đợi và các thao tác trình duyệt trước khi nhờ Muse soạn kịch bản.');
      await ensureAllowed();
    }
    const account = lease ? lease.index : 0;
    controller = new AbortController();
    const signal = controller.signal;
    Object.assign(state, { busy: true, error: '', progress: account ? `Đang mở Muse (tài khoản ${account + 1})…` : 'Đang mở Muse…', done: 0, total: 0, phase: 'outline' });
    notify();
    try {
      let muse = null;
      if (!askOverride) {
        await openMuse(account);
        check(signal);
        muse = getMuse(account);
        if (!muse) throw infra(`Chưa mở được Muse tài khoản ${account + 1}.`);
      }
      const countryNames = getGeo().countryNames;
      let outline = resume && resume.outline && Array.isArray(resume.outline.eras) && resume.outline.eras.length ? resume.outline : null;
      if (!outline) { outline = await writeOutline(muse, config, signal, countryNames); onDraft({ outline, items: {} }); }
      if (!config.topic) config.topic = outline.title;     // chủ đề do Muse tự chọn: lấy tiêu đề dàn ý làm chủ đề
      onOutline(outline);
      state.total = outline.eras.length;
      const items = new Map();
      for (const [k, v] of Object.entries((resume && resume.items) || {})) { const n = Number(k); if (v && Number.isInteger(n) && n >= 1 && n <= outline.eras.length) items.set(n, v); }
      const draft = () => ({ outline, items: Object.fromEntries(items) });
      const main = outline.country ? (getGeo().resolve(outline.country) || [])[0] : null;
      const provinces = main ? (getGeo().provinceNames.get(main.a3) || []).slice(0, 140) : [];
      const batches = [];
      for (let a = 1; a <= outline.eras.length; a += plan.BATCH) batches.push([a, Math.min(outline.eras.length, a + plan.BATCH - 1)]);
      for (let i = 0; i < batches.length; i++) {
        const range = batches[i];
        const complete = Array.from({ length: range[1] - range[0] + 1 }, (_, k) => range[0] + k).every(n => items.has(n));
        if (complete) { state.done = Math.max(state.done, range[1]); continue; }
        const label = `Soạn kịch bản ${i + 1}/${batches.length} (giai đoạn ${range[0]}–${range[1]})`;
        const prevRaw = range[0] > 1 ? items.get(range[0] - 1) : null;
        const previous = prevRaw ? plan.normalizeScript({ country: outline.country, eras: [prevRaw] }, null).script.eras[0] : null;
        try {
          const got = await writeRange({ muse, config, outline, range, previous, provinces, countryNames, signal, label, have: items });
          for (const [n, raw] of got) items.set(n, raw);
        } catch (e) {
          for (const [n, raw] of e.partial || []) items.set(n, raw);
          onDraft(draft());
          throw e;
        }
        state.done = range[1];
        onDraft(draft());
        say(`Đã soạn ${range[1]}/${outline.eras.length} giai đoạn`);
      }
      const raw = plan.assemble(outline, items, config.language);
      if (raw.eras.length !== outline.eras.length) throw Error(`Kịch bản mới có ${raw.eras.length}/${outline.eras.length} giai đoạn. Bấm «Viết tiếp».`);
      say(`Muse đã soạn xong kịch bản (${raw.eras.length} giai đoạn)`, { phase: 'done' });
      return { script: raw, outline, config };
    } catch (error) {
      state.error = error.name === 'AbortError' ? '' : String(error.message);
      throw error;
    } finally {
      state.busy = false; controller = null;
      if (lease) lease.release();
      notify();
    }
  }

  function cancel() { controller?.abort(); }
  return { write, cancel, status, get busy() { return state.busy; } };
}

module.exports = { createMapWriter };
