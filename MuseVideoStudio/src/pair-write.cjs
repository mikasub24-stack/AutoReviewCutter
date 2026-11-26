// Tab «So sánh song song»: Muse viết kịch bản NGAY TRONG APP, từng bước nhỏ:
//   1. hồ sơ phim (chủ đề nếu để trống, nhãn hai bên, chỉ số, nhân vật, kết luận, dàn ý toàn bộ các mốc);
//   2. từng phần ≤ PART_BEATS mốc, lượt sau biết 2 mốc ngay trước để nối mạch.
// Mỗi lượt được soát (đủ mốc, đủ cột, lời đọc vừa độ dài, hai bên khác nhau) và hỏi lại phần lỗi.
// Có thể «Viết tiếp» từ bản nháp đã lưu: không hỏi lại hồ sơ và các phần đã xong.
const { randomBytes } = require('node:crypto');
const { createMuseAsk, infra } = require('./muse-ask.cjs');
const { acquireAccount } = require('./account-pick.cjs');
const defaultPlan = require('./pair-plan.js');

const ATTEMPTS = 3;

function createPairWriter({ plan = defaultPlan, dom, openMuse, getMuse, getSettings, delay, notify = () => {}, isBusy = () => false, leaseAccount = null, ensureAllowed = async () => {}, timing = {}, ask: askOverride = null }) {
  const state = { busy: false, progress: '', error: '', done: 0, total: 0, phase: '' };
  let controller = null;
  const say = (progress, extra = {}) => { Object.assign(state, { progress }, extra); notify(); };
  const status = () => ({ busy: state.busy, progress: state.progress, error: state.error, done: state.done, total: state.total, phase: state.phase });
  const driver = askOverride ? null : createMuseAsk({ dom, getSettings, delay, say: (...a) => say(...a), timing });
  const ask = askOverride || driver.ask;
  const check = signal => { if (signal.aborted) throw Object.assign(Error('Đã dừng viết kịch bản.'), { name: 'AbortError' }); };
  const wait = async (ms, signal) => { const end = Date.now() + ms; while (Date.now() < end) { check(signal); await delay(Math.min(250, end - Date.now())); } check(signal); };
  const newMarker = () => randomBytes(3).toString('hex');

  // Hỏi Muse một lượt; lỗi hạ tầng (Muse chưa nhận được yêu cầu) được thử lại một lần.
  async function askOnce(muse, instruction, marker, signal, label, attempt) {
    try { return await ask(muse, instruction, marker, signal, label); }
    catch (e) { if (!e.infra || attempt) throw e; await wait(2000, signal); return null; }
  }

  async function writeBible(muse, config, signal) {
    let fix = '', last = null;
    for (let attempt = 0; attempt < ATTEMPTS; attempt++) {
      check(signal);
      const marker = newMarker();
      say(config.auto ? 'Muse chọn chủ đề và lập hồ sơ phim…' : 'Lập hồ sơ phim · chuẩn bị yêu cầu…', { phase: 'bible' });
      const reply = await askOnce(muse, plan.buildBibleInstruction(config, { marker, fix }), marker, signal, 'Lập hồ sơ phim', attempt);
      if (reply == null) continue;
      try { return plan.parseBible(reply, config); }
      catch (e) { if (!e.fixable) throw e; last = e; fix = e.fix; }
    }
    throw last || Error('Muse chưa lập được hồ sơ phim. Bấm «Viết tiếp» để thử lại.');
  }

  // Chia các mốc thành các lượt đều nhau, mỗi lượt ≤ PART_BEATS mốc.
  function rangesOf(total) {
    const parts = Math.max(1, Math.ceil(total / plan.PART_BEATS)), out = [];
    let from = 1;
    for (let i = 0; i < parts; i++) { const size = Math.floor(total / parts) + (i < total % parts ? 1 : 0); out.push([from, from + size - 1]); from += size; }
    return out;
  }

  async function writeRange({ muse, config, bible, range, have, signal, label }) {
    const good = new Map();
    let want = range, fix = '';
    for (let attempt = 0; attempt < ATTEMPTS; attempt++) {
      check(signal);
      const marker = newMarker();
      const before = [...have.values(), ...good.values()].filter(b => b.number < want[0]).sort((a, b) => a.number - b.number);
      say(`${label} · chuẩn bị yêu cầu…`, { phase: 'beats' });
      const reply = await askOnce(muse, plan.buildPartInstruction(config, bible, { marker, range: want, previous: before.slice(-2), fix }), marker, signal, label, attempt);
      if (reply == null) continue;
      const beats = plan.parseBeats(reply, config).filter(b => b.number >= want[0] && b.number <= want[1]);
      const result = plan.checkBeats(beats, want, config);
      const bad = new Set([...result.missing, ...result.bad]);
      for (const b of beats) if (!b.bad && !bad.has(b.number) && !good.has(b.number)) good.set(b.number, b);
      const left = [];
      for (let n = range[0]; n <= range[1]; n++) if (!good.has(n)) left.push(n);
      if (!left.length) return [...good.values()].sort((a, b) => a.number - b.number);
      want = [left[0], left[left.length - 1]];
      fix = plan.fixText({
        missing: result.missing.filter(n => left.includes(n)), bad: result.bad.filter(n => left.includes(n)),
        issues: result.issues.filter(x => left.some(n => new RegExp(`^Mốc ${n}\\b`).test(x)))
      });
    }
    const left = [];
    for (let n = range[0]; n <= range[1]; n++) if (!good.has(n)) left.push(n);
    throw Object.assign(Error(`Muse viết thiếu hoặc sai khuôn mốc ${left.slice(0, 10).join(', ')}${left.length > 10 ? '…' : ''}. Bấm «Viết tiếp» để Muse làm tiếp từ chỗ này.`), { partial: [...good.values()] });
  }

  // resume = { bible, beats } từ bản nháp đã lưu. onDraft({bible, beats}) lưu sau mỗi lượt.
  async function write({ options: input = {}, resume = null, onDraft = () => {} }) {
    if (state.busy) throw Error('Muse đang viết kịch bản. Chờ xong hoặc bấm Dừng.');
    const config = plan.options(input), bad = plan.problems(config);
    if (bad.length) throw Error(bad[0]);
    const lease = await acquireAccount({ leaseAccount, isBusy, ensureAllowed, owner: 'pair', busyMessage: 'Dừng hàng đợi và các thao tác trình duyệt trước khi nhờ Muse viết kịch bản.' });
    const account = lease ? lease.index : 0;   // tài khoản 1 bận thì dùng tài khoản Muse khác đang rảnh
    controller = new AbortController();
    const signal = controller.signal;
    Object.assign(state, { busy: true, error: '', progress: account ? `Đang mở Muse (tài khoản ${account + 1})…` : 'Đang mở Muse…', done: 0, total: config.beats, phase: 'bible' });
    notify();
    try {
      let muse = null;
      if (!askOverride) {
        await openMuse(account);
        check(signal);
        muse = getMuse(account);
        if (!muse) throw infra(`Chưa mở được Muse tài khoản ${account + 1}.`);
      }
      let bible = resume && resume.bible && Array.isArray(resume.bible.arc) && resume.bible.arc.length === config.beats ? resume.bible : null;
      if (!bible) { bible = await writeBible(muse, config, signal); onDraft({ bible, beats: [] }); }
      const have = new Map();
      for (const b of (resume && Array.isArray(resume.beats) ? resume.beats : [])) if (b && !b.bad && Number.isInteger(b.number) && b.number >= 1 && b.number <= config.beats) have.set(b.number, b);
      const draft = () => ({ bible, beats: [...have.values()].sort((a, b) => a.number - b.number) });
      const ranges = rangesOf(config.beats);
      for (let i = 0; i < ranges.length; i++) {
        const range = ranges[i];
        const complete = Array.from({ length: range[1] - range[0] + 1 }, (_, k) => range[0] + k).every(n => have.has(n));
        if (complete) { state.done = Math.max(state.done, range[1]); continue; }
        const label = `Viết kịch bản ${i + 1}/${ranges.length} (mốc ${range[0]}–${range[1]})`;
        try {
          for (const b of await writeRange({ muse, config, bible, range, have, signal, label })) have.set(b.number, b);
        } catch (e) {
          for (const b of e.partial || []) have.set(b.number, b);
          onDraft(draft());
          throw e;
        }
        state.done = range[1];
        onDraft(draft());
        say(`Đã viết ${range[1]}/${config.beats} mốc`);
      }
      const script = plan.assemble(bible, [...have.values()], config);
      if (script.beats.length !== config.beats) throw Error(`Kịch bản mới có ${script.beats.length}/${config.beats} mốc. Bấm «Viết tiếp».`);
      say(`Muse đã viết xong kịch bản (${script.beats.length} mốc)`, { phase: 'done' });
      return { script, bible, config };
    } catch (error) {
      state.error = error.name === 'AbortError' ? '' : String(error.message).replace('bấm Phân tích lại.', 'bấm «Viết tiếp».');
      throw error;
    } finally {
      state.busy = false; controller = null;
      if (lease) lease.release();
      notify();
    }
  }

  function cancel() { controller?.abort(); }
  return { write, cancel, status, rangesOf, get busy() { return state.busy; } };
}

module.exports = { createPairWriter };
