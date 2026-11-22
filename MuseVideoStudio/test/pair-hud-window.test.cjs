const { test } = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const { createWindowHud } = require('../src/pair-hud-window.cjs');

// BrowserWindow giả: executeJavaScript chạy biểu thức thật trên đối tượng PairHud giả, nên lỗi cú pháp / chèn mã sẽ lộ ra.
function fakeElectron({ ready = true, failLoad = false } = {}) {
  const made = [], calls = [];
  class BrowserWindow {
    constructor(options) {
      this.options = options; this.destroyed = false; made.push(this);
      const hud = new Proxy({}, { get: (_, name) => name === 'ready' ? () => ready : (...args) => { calls.push(JSON.parse(JSON.stringify([name, ...args]))); return `data:image/png;base64,${name}`; } });
      this.webContents = { executeJavaScript: async code => vm.runInNewContext(code, { PairHud: hud }) };
    }
    async loadFile(file) { this.file = file; if (failLoad) throw Error('không mở được trang'); }
    isDestroyed() { return this.destroyed; }
    destroy() { this.destroyed = true; }
  }
  return { BrowserWindow, made, calls };
}

test('mở một cửa sổ ẩn, an toàn (không nodeIntegration, sandbox), dùng chung cho mọi lệnh và chạy song song vẫn chỉ mở một', async () => {
  const e = fakeElectron();
  const hud = createWindowHud({ BrowserWindow: e.BrowserWindow, file: '/app/pair-hud.html' });
  const results = await Promise.all([hud.base(), hud.tag(3, 'AGE 3'), hud.caption('Hello'), hud.meterSeq('L', 100, 60), hud.intro(), hud.outro(['a', 'b'], 'end')]);
  assert.equal(e.made.length, 1, 'chỉ một cửa sổ');
  const w = e.made[0];
  assert.equal(w.options.show, false);
  assert.equal(w.options.webPreferences.nodeIntegration, false);
  assert.equal(w.options.webPreferences.contextIsolation, true);
  assert.equal(w.options.webPreferences.sandbox, true);
  assert.equal(w.file, '/app/pair-hud.html');
  assert.ok(results.every(r => /^data:image\/png/.test(r)));
  assert.deepEqual(e.calls.find(c => c[0] === 'tag'), ['tag', 3, 'AGE 3']);
  assert.deepEqual(e.calls.find(c => c[0] === 'meterSeq'), ['meterSeq', 'L', 100, 60]);
  assert.deepEqual(e.calls.find(c => c[0] === 'outro'), ['outro', ['a', 'b'], 'end']);
  await hud.init({ layout: 'side', title: 'T' });
  assert.equal(e.made.length, 1);
});

test('dữ liệu có dấu nháy, xuống dòng, ${} hay mã lệnh chỉ là dữ liệu: không chạy được và không làm hỏng lệnh', async () => {
  const e = fakeElectron();
  const hud = createWindowHud({ BrowserWindow: e.BrowserWindow });
  const nasty = '"); globalThis.hacked = 1; (\'`${process.exit()}\n </script>\\';
  await hud.caption(nasty);
  await hud.init({ title: nasty, lessons: [nasty] });
  await hud.thumb({ variant: 2, title: nasty, left: nasty, leftImage: 'data:image/jpeg;base64,' + nasty });
  assert.deepEqual(e.calls[0], ['caption', nasty]);
  assert.equal(e.calls[1][1].title, nasty);
  assert.deepEqual(e.calls[2], ['thumb', { variant: 2, title: nasty, left: nasty, leftImage: 'data:image/jpeg;base64,' + nasty }]);
  assert.equal(globalThis.hacked, undefined);
});

test('đóng thì hủy cửa sổ; gọi tiếp sẽ mở cửa sổ mới; cửa sổ bị hủy từ ngoài cũng tự mở lại', async () => {
  const e = fakeElectron();
  const hud = createWindowHud({ BrowserWindow: e.BrowserWindow });
  await hud.base();
  hud.close();
  assert.equal(e.made[0].destroyed, true);
  hud.close(); // đóng hai lần không lỗi
  await hud.base();
  assert.equal(e.made.length, 2);
  e.made[1].destroy();
  await hud.base();
  assert.equal(e.made.length, 3);
});

test('trang không sẵn sàng hoặc không mở được: hủy cửa sổ, báo lỗi rõ, lần sau thử lại được', async () => {
  const notReady = fakeElectron({ ready: false });
  const a = createWindowHud({ BrowserWindow: notReady.BrowserWindow });
  await assert.rejects(a.base(), /Trang vẽ chữ chưa sẵn sàng/);
  assert.equal(notReady.made[0].destroyed, true);
  await assert.rejects(a.base(), /chưa sẵn sàng/);
  assert.equal(notReady.made.length, 2, 'lần sau mở lại, không kẹt ở lần lỗi');
  const noLoad = fakeElectron({ failLoad: true });
  const b = createWindowHud({ BrowserWindow: noLoad.BrowserWindow });
  await assert.rejects(b.tag(1, 'x'), /không mở được trang/);
  assert.equal(noLoad.made[0].destroyed, true);
});
