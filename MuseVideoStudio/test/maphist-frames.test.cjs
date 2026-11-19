// Nguồn khung hình nhiều cửa sổ của tab «Bản đồ lịch sử»: cửa sổ giả (không cần Electron) gửi khung lộn xộn, kiểm tra thứ tự, dừng, lỗi, bộ nhớ.
const test = require('node:test');
const assert = require('node:assert/strict');
const { createWindowFrames, orderedSink, defaultWorkers, CHUNK } = require('../src/maphist-frames.cjs');

// maphist-render.js là mã cửa sổ ẩn: nạp riêng để dùng đúng hàm chia khung (không cần canvas).
const MapRender = (() => { const saved = global.window; global.window = {}; require('../src/maphist-render.js'); const m = global.window.MapRender; global.window = saved; return m; })();

const sleep = ms => new Promise(r => setTimeout(r, ms));
let seed = Number(process.env.MUSE_TEST_SEED) || 7; const rnd = () => (seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296;

// Bộ giả: mỗi BrowserWindow giả chạy đúng danh sách khung của MapRender.framesOf, mỗi khung vẽ mất thời gian ngẫu nhiên rồi gửi qua ipc giả.
function fakeElectron({ frames = 400, drawMs = () => rnd() * 4, crashAt = -1 } = {}) {
  const handlers = new Map(), windows = [];
  class BrowserWindow {
    constructor(options) {
      this.options = options; this.destroyed = false; this.sent = [];
      this.webContents = { executeJavaScript: code => this.exec(code) };
      windows.push(this);
    }
    isDestroyed() { return this.destroyed; }
    destroy() { this.destroyed = true; }
    async loadFile() {}
    async exec(code) {
      if (code === 'window.__mapRenderReady === true') return true;
      if (code.startsWith('MapRender.init(')) return { frames };
      const args = JSON.parse(code.slice('MapRender.run('.length, -1));
      const list = MapRender.framesOf(Math.ceil(frames / 30 * args.fps), args.worker, args.workers, args.chunk);
      for (let k = 0; k < list.length; k++) {
        if (this.destroyed) throw Error('Render frame was disposed');
        await sleep(drawMs(list[k]));
        if (list[k] === crashAt) throw Error('Cửa sổ vẽ bị sập');
        const r = await handlers.get('maphist:frame')({ sender: this.webContents }, list[k], Buffer.from([list[k] & 255, list[k] >> 8]));
        this.sent.push(list[k]);
        if (r.stop) return { frames: k, stopped: true };
      }
      return { frames: list.length, stopped: false };
    }
  }
  return { BrowserWindow, ipcMain: { handle: (name, fn) => handlers.set(name, fn) }, handlers, windows };
}
const timelineOf = frames => ({ total: frames / 30, W: 1920, H: 1080 });

async function run({ frames = 400, workers = 3, onFrame, signal, electron = fakeElectron({ frames }) }) {
  const f = createWindowFrames({ BrowserWindow: electron.BrowserWindow, ipcMain: electron.ipcMain, workers });
  const seen = [];
  const result = await f.renderFrames({ timeline: timelineOf(frames), raw: {}, fps: 30, signal, onFrame: onFrame || (async (buf, index) => { seen.push({ index, value: buf[0] | (buf[1] << 8) }); return { stop: false }; }) });
  return { result, seen, windows: electron.windows };
}

test('chia khung cho các cửa sổ: mỗi khung đúng một cửa sổ, đủ khung, khối liền nhau', () => {
  for (const [N, workers, chunk] of [[1, 1, 24], [100, 1, 24], [100, 3, 24], [1455, 4, 24], [48, 2, 24], [47, 5, 24], [5, 4, 24]]) {
    const all = [];
    for (let w = 0; w < workers; w++) all.push(...MapRender.framesOf(N, w, workers, chunk));
    assert.equal(all.length, N, `${N}/${workers}`);
    assert.deepEqual([...all].sort((a, b) => a - b), Array.from({ length: N }, (_, i) => i), `${N}/${workers}`);
  }
  const first = MapRender.framesOf(200, 1, 3, 24);
  assert.deepEqual(first.slice(0, 3), [24, 25, 26]);
  assert.equal(first[24], 24 * 4, 'khối kế tiếp của cửa sổ này cách đúng workers khối');
});

test('số cửa sổ vẽ theo số nhân CPU và RAM, có thể ép bằng biến môi trường', () => {
  assert.equal(defaultWorkers(2, '', 32), 1);
  assert.equal(defaultWorkers(4, '', 32), 2);
  assert.equal(defaultWorkers(8, '', 32), 3);
  assert.equal(defaultWorkers(16, '', 32), 6);
  assert.equal(defaultWorkers(16, '', 8), 3, 'RAM 8 GB: tối đa 3 cửa sổ');
  assert.equal(defaultWorkers(16, '', 6), 2);
  assert.equal(defaultWorkers(16, '', 4), 1, 'RAM ít: một cửa sổ như trước');
  assert.equal(defaultWorkers(16, '2', 4), 2, 'ép bằng biến môi trường');
  assert.equal(defaultWorkers(4, '99', 32), 2, 'giá trị vô lý bị bỏ qua');
  assert.equal(defaultWorkers(12, '', 32), 5);
  assert.equal(defaultWorkers(24, '', 32), 10, 'máy nhiều luồng vẽ nhiều cửa sổ hơn');
  assert.equal(defaultWorkers(32, '', 64), 13);
  assert.equal(defaultWorkers(64, '', 128), 16, 'tối đa 16');
  assert.equal(defaultWorkers(24, '', 16), 8, 'RAM 16 GB giới hạn còn 8');
  assert.equal(defaultWorkers(24, '', 12), 5);
  assert.equal(defaultWorkers(4, '16', 4), 16, 'cho phép ép tới 16 cửa sổ');
  assert.equal(defaultWorkers(4, 'abc', 32), 2);
  assert.ok(defaultWorkers() >= 1 && defaultWorkers() <= 4);
});

test('nhiều cửa sổ vẽ lộn xộn nhưng onFrame nhận đúng thứ tự 0..N-1, mỗi khung một lần, cửa sổ đóng hết', async () => {
  for (const workers of [1, 2, 3, 4]) {
    const { result, seen, windows } = await run({ frames: 333, workers });
    assert.equal(seen.length, 333, `${workers} cửa sổ`);
    seen.forEach((s, i) => { assert.equal(s.index, i); assert.equal(s.value, i, 'nội dung khung khớp số thứ tự'); });
    assert.equal(windows.length, workers);
    assert.ok(windows.every(w => w.destroyed));
    assert.equal(result.stopped, false); assert.equal(result.workers, workers);
    // mỗi cửa sổ chỉ nhận khung của mình
    const sets = windows.map(w => new Set(w.sent)); const total = sets.reduce((n, s) => n + s.size, 0);
    assert.equal(total, 333);
  }
});

test('video ngắn dùng ít cửa sổ hơn: không tạo cửa sổ không có việc', async () => {
  const { windows, seen } = await run({ frames: 30, workers: 4 });
  assert.equal(windows.length, 2, '30 khung = 2 khối 24 → 2 cửa sổ');
  assert.equal(seen.length, 30);
});

test('ghi chậm: cửa sổ bị giữ lại, số khung chờ ghi không vượt giới hạn (RAM nhỏ), vẫn đủ khung đúng thứ tự', async () => {
  let pending = 0, maxPending = 0;
  const electron = fakeElectron({ frames: 600, drawMs: () => 0 });
  const handle = electron.ipcMain.handle;
  electron.ipcMain.handle = (name, fn) => handle(name, async (event, index, buffer) => { pending++; maxPending = Math.max(maxPending, pending); return fn(event, index, buffer); });
  const seen = [];
  const out = await run({ frames: 600, workers: 4, electron, onFrame: async (buf, index) => { await sleep(1); seen.push(index); pending--; return { stop: false }; } });
  assert.equal(seen.length, 600);
  seen.forEach((v, i) => assert.equal(v, i));
  assert.ok(maxPending <= CHUNK * 4 + 4, `chờ ghi tối đa ${maxPending}`);
  assert.equal(out.result.stopped, false);
});

test('bộ xếp thứ tự: khung đến ngược vẫn ghi đúng thứ tự; ack sớm trong giới hạn, giữ lại khi vượt giới hạn', async () => {
  const log = []; let release; const gate = new Promise(r => { release = r; });
  const sink = orderedSink({ limit: 3, onFrame: async (b, i) => { if (i === 0) await gate; log.push(i); return { stop: false }; } });
  const acks = [];
  const p = [3, 2, 1, 0].map(i => sink.push(i, Buffer.from([i])).then(r => { acks.push(i); return r; }));
  await sleep(5);
  assert.deepEqual(log, [], 'chưa có khung 0 nên chưa ghi gì');
  assert.ok(!acks.includes(3), 'khung 3 vượt giới hạn (3 - 0 >= 3) nên bị giữ');
  assert.ok(acks.includes(2) && acks.includes(1), 'khung trong giới hạn được báo nhận sớm');
  release();
  await Promise.all(p);
  assert.deepEqual(log, [0, 1, 2, 3]);
  assert.equal(sink.written, 4);
});

test('yêu cầu dừng từ onFrame: mọi cửa sổ nhận stop và kết thúc, kết quả báo đã dừng', async () => {
  const { result, seen, windows } = await run({ frames: 500, workers: 3, onFrame: async (buf, index) => ({ stop: index >= 40 }) });
  assert.equal(result.stopped, true);
  assert.ok(windows.every(w => w.destroyed));
  assert.ok(result.frames <= 41 + 1);
  assert.equal(seen.length, 0);
});

test('onFrame báo lỗi (ví dụ FFmpeg đã dừng): renderFrames ném đúng lỗi đó, không treo', async () => {
  await assert.rejects(run({ frames: 400, workers: 3, onFrame: async (buf, index) => { if (index === 30) throw Error('FFmpeg đã dừng nhận khung hình.'); return { stop: false }; } }), /FFmpeg đã dừng nhận khung hình/);
});

test('một cửa sổ vẽ sập giữa chừng: dựng báo lỗi và đóng mọi cửa sổ', async () => {
  const electron = fakeElectron({ frames: 400, crashAt: 100 });
  await assert.rejects(run({ frames: 400, workers: 3, electron }), /sập/);
  assert.ok(electron.windows.every(w => w.destroyed));
});

test('bấm Dừng (signal): đóng cửa sổ và báo AbortError', async () => {
  const controller = new AbortController();
  const electron = fakeElectron({ frames: 900, drawMs: () => 2 });
  setTimeout(() => controller.abort(), 40);
  await assert.rejects(run({ frames: 900, workers: 3, signal: controller.signal, electron }), error => error.name === 'AbortError');
  assert.ok(electron.windows.every(w => w.destroyed));
});

test('chỉ nhận khung từ cửa sổ của lần dựng đang chạy', async () => {
  const electron = fakeElectron({ frames: 30 });
  const f = createWindowFrames({ BrowserWindow: electron.BrowserWindow, ipcMain: electron.ipcMain, workers: 1 });
  assert.equal(electron.handlers.get('maphist:frame'), undefined, 'chưa đăng ký khi chưa dựng');
  await f.renderFrames({ timeline: timelineOf(30), raw: {}, fps: 30, onFrame: async () => ({ stop: false }) });
  const reply = await electron.handlers.get('maphist:frame')({ sender: { id: 'lạ' } }, 0, Buffer.from([1]));
  assert.deepEqual(reply, { stop: true });
});
