const { test } = require('node:test');
const assert = require('node:assert/strict');
const { createFlowRunner, specOf } = require('../src/flow-runner.cjs');

function fakeDriver({ ready = 3, fail = new Set(), log = [] } = {}) {
  let n = 0, inside = 0, maxInside = 0;
  const cards = new Map();
  const enter = async name => { inside++; maxInside = Math.max(maxInside, inside); log.push(name + ':in'); await new Promise(r => setTimeout(r, 15)); inside--; log.push(name + ':out'); };
  return {
    log, cards, get maxInside() { return maxInside; },
    async ensureReady() {},
    async submit(page, spec) { await enter('submit'); const id = 'c' + (++n); cards.set(id, { spec, polls: 0 }); return { id }; },
    async status(page, card) { const c = cards.get(card.id); c.polls++; if (fail.has(c.spec.prompt)) return { state: 'failed', error: 'Bị chặn bởi chính sách' }; return c.polls >= ready ? { state: 'done' } : { state: 'generating', progress: c.polls * 30 }; },
    async download(page, card, target) { await enter('download'); log.push('dl:' + card.id + ':' + target); return target; }
  };
}
const ctx = (extra = {}) => ({ signal: new AbortController().signal, stage: () => {}, save: async () => {}, model: 'lite', aspect: '16:9', projectUrl: 'https://flow.google.com/project/x', store: async capture => { await capture('/tmp/x.part'); return '/out/clip.mp4'; }, ...extra });
const job = (extra = {}) => ({ id: 'j', kind: 'restore', phase: 'clip', number: 1, prompt: 'p1', durationSeconds: 8, references: ['/a/1.png'], ...extra });

test('spec: clip video lấy ảnh đầu làm khung hình đầu, ảnh mốc dùng ảnh tham chiếu', () => {
  assert.deepEqual(specOf(job(), { model: 'fast', aspect: '9:16' }), { kind: 'video', prompt: 'p1', startFrame: '/a/1.png', references: [], aspect: '9:16', seconds: 8, model: 'fast' });
  const k = specOf(job({ phase: 'image', references: ['/a/b.png'], durationSeconds: undefined }), {});
  assert.equal(k.kind, 'image'); assert.equal(k.startFrame, ''); assert.deepEqual(k.references, ['/a/b.png']); assert.equal(k.seconds, 0);
});

test('một cảnh: gửi đúng một lần, chờ tới khi xong, tải về, xóa dấu thẻ đã gửi', async () => {
  const driver = fakeDriver(); const runner = createFlowRunner({ driver, getPage: async () => ({}), pollMs: 1 });
  const j = job(); const saves = [];
  const out = await runner.run(j, ctx({ save: async () => saves.push(JSON.stringify(j.flowCard)) }));
  assert.equal(out, '/out/clip.mp4');
  assert.equal(driver.log.filter(x => x === 'submit:in').length, 1);
  assert.equal(driver.log.filter(x => x.startsWith('dl:')).length, 1);
  assert.match(saves[0], /"id":"c1"/, 'thẻ đã gửi được lưu trước khi chờ để nối lại nếu tắt app');
  assert.equal(j.flowCard, undefined);
});

test('nhiều cảnh song song: gửi và tải xếp hàng (không đè nhau trên một trang), chờ thì song song', async () => {
  const driver = fakeDriver({ ready: 40 }); const runner = createFlowRunner({ driver, getPage: async () => ({}), pollMs: 3 });
  const jobs = Array.from({ length: 5 }, (_, i) => job({ id: 'j' + i, number: i + 1, prompt: 'p' + i }));
  let waiting = 0, maxWaiting = 0;
  await Promise.all(jobs.map(j => runner.run(j, ctx({ stage: (s) => { if (s === 'waiting') { waiting++; maxWaiting = Math.max(maxWaiting, waiting); setTimeout(() => waiting--, 4); } } }))));
  assert.equal(driver.maxInside, 1, 'chỉ một thao tác giao diện tại một lúc');
  assert.ok(maxWaiting >= 3, 'chờ song song: ' + maxWaiting);
  assert.equal(driver.log.filter(x => x === 'submit:in').length, 5);
});

test('Flow báo lỗi cảnh (bị chặn…): ném lỗi rõ, xóa thẻ để lần thử lại gửi lại', async () => {
  const driver = fakeDriver({ fail: new Set(['bad']) }); const runner = createFlowRunner({ driver, getPage: async () => ({}), pollMs: 1 });
  const j = job({ prompt: 'bad' });
  await assert.rejects(runner.run(j, ctx()), /chính sách/);
  assert.equal(j.flowCard, undefined);
});

test('tải lỗi thì giữ thẻ: thử lại KHÔNG gửi lại (không tốn thêm tín dụng)', async () => {
  const driver = fakeDriver(); const runner = createFlowRunner({ driver, getPage: async () => ({}), pollMs: 1 });
  const j = job(); let first = true;
  await assert.rejects(runner.run(j, ctx({ store: async capture => { if (first) { first = false; throw Error('đĩa đầy'); } await capture('/t'); return '/o.mp4'; } })), /đĩa đầy/);
  assert.equal(j.flowCard.id, 'c1');
  const out = await runner.run(j, ctx());
  assert.equal(out, '/out/clip.mp4');
  assert.equal(driver.log.filter(x => x === 'submit:in').length, 1);
});

test('dừng khi đang chờ: ném lỗi dừng, giữ thẻ để Tiếp tục nối lại', async () => {
  const driver = fakeDriver({ ready: 1000 }); const runner = createFlowRunner({ driver, getPage: async () => ({}), pollMs: 5 });
  const j = job(); const controller = new AbortController();
  const p = runner.run(j, ctx({ signal: controller.signal }));
  setTimeout(() => controller.abort(), 60);
  await assert.rejects(p, e => e.name === 'AbortError' || /dừng|stop/i.test(e.message));
  assert.ok(j.flowCard);
});
