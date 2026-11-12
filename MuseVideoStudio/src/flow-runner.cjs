// Chạy một cảnh trên Google Flow (Veo 3.1) qua "driver" (thao tác trang Flow) — tách riêng để kiểm thử bằng driver giả.
// Một trang Flow dùng chung cho nhiều cảnh chạy song song: các thao tác đụng giao diện (gửi, tải) xếp hàng qua một khóa, còn chờ video tạo xong thì song song.
const { stoppedError, abortable } = require('./queue.cjs');

class Lock {
  constructor() { this.tail = Promise.resolve(); }
  run(fn) {
    const result = this.tail.then(fn, fn);
    this.tail = result.catch(() => {});
    return result;
  }
}

const delayWith = (ms, signal) => new Promise((resolve, reject) => {
  if (signal?.aborted) return reject(stoppedError());
  const timer = setTimeout(() => { signal?.removeEventListener('abort', onAbort); resolve(); }, ms);
  const onAbort = () => { clearTimeout(timer); reject(stoppedError()); };
  signal?.addEventListener('abort', onAbort, { once: true });
});

// spec của một cảnh → thông số gửi cho driver.
function specOf(job, { model, aspect }) {
  const image = job.phase === 'image' || job.kind === 'image';
  const refs = Array.isArray(job.references) ? job.references.filter(Boolean) : [];
  return {
    kind: image ? 'image' : 'video',
    prompt: job.prompt,
    startFrame: image ? '' : refs[0] || '',   // video: ảnh đầu là khung hình đầu thật
    references: image ? refs : [],             // ảnh: tối đa vài ảnh tham chiếu (thành phần)
    aspect: aspect || job.aspect || '16:9',
    seconds: image ? 0 : Number(job.durationSeconds) || 8,
    model: model || 'lite'
  };
}

function createFlowRunner({ driver, getPage, lock = new Lock(), pollMs = 4000, sleep = delayWith }) {
  async function run(job, { signal, stage, save, model, aspect, projectUrl, timeoutMinutes = 20, store }) {
    const check = () => { if (signal?.aborted) throw stoppedError(); };
    const step = p => abortable(p, signal);
    const spec = specOf(job, { model, aspect });
    check();
    const page = await step(getPage());
    let card = job.flowCard && job.flowCard.kind === spec.kind ? job.flowCard : null;
    if (!card) {
      stage('submitting', spec.kind === 'image' ? 'Đang gửi ảnh vào Flow' : 'Đang gửi cảnh vào Flow (Veo 3.1)');
      card = await step(lock.run(async () => {
        check();
        await driver.ensureReady(page, { projectUrl });
        check();
        return driver.submit(page, spec, { signal });
      }));
      job.flowCard = { ...card, kind: spec.kind, at: new Date().toISOString() };
      card = job.flowCard;
      await step(save());
    } else stage('waiting', 'Nối lại cảnh đã gửi vào Flow, không gửi lần nữa (tránh tốn tín dụng)');
    const warnAt = Date.now() + timeoutMinutes * 60000;
    let state;
    while (true) {
      check();
      try { state = await step(driver.status(page, card)); }
      catch (e) { if (signal?.aborted) throw e; if (/Target closed|closed|detached|destroyed|navigat/i.test(e.message || '')) { stage('waiting', 'Trang Flow đang tải lại, đợi giây lát'); await sleep(2000, signal); continue; } throw e; }
      if (state.state === 'failed') { delete job.flowCard; job.progress = null; throw Error(state.error || 'Flow không tạo được cảnh này.'); }
      if (state.src && card.src !== state.src) card.src = state.src;
      if (state.state === 'done') break;
      job.progress = Number.isFinite(state.progress) ? state.progress : null;
      if (Date.now() > warnAt) job.late = true;
      stage('waiting', (job.late ? 'Flow chậm hơn dự kiến · vẫn đang chờ. ' : '') + 'Đang tạo trong Flow' + (Number.isFinite(state.progress) ? ` · ${Math.round(state.progress)}%` : ''));
      await sleep(pollMs, signal);
    }
    job.progress = null; job.resultReadyAt = new Date().toISOString();
    stage('downloading', spec.kind === 'image' ? 'Đang tải ảnh về máy' : 'Đang tải video về máy (720p gốc)');
    const output = await step(store(async temporary => lock.run(async () => { check(); await driver.ensureReady(page, { projectUrl }); return driver.download(page, card, temporary, { kind: spec.kind, signal }); })));
    delete job.flowCard;
    return output;
  }
  return { run, lock };
}

module.exports = { createFlowRunner, specOf, Lock };
