const { test } = require('node:test');
const assert = require('node:assert/strict');
const { EventEmitter } = require('node:events');
const { CHECK_URL } = require('../src/network-check.cjs');
const { checkElectronNetwork } = require('../src/electron-network-check.cjs');

const usa = { success: true, ip: '203.0.113.10', country_code: 'US', country: 'United States' };
function fixture({ report = usa, text, load, read, status = 200 } = {}) {
  const windows = [], session = { account: 'dedicated-test-session' };
  class Window {
    constructor(options) {
      this.options = options; this.destroyed = false; this.destroyCount = 0; this.loads = []; this.reads = 0; this.url = '';
      const contents = new EventEmitter();
      contents.getURL = () => this.url;
      contents.setWindowOpenHandler = fn => { this.popupHandler = fn; };
      contents.executeJavaScript = async (source, userGesture) => {
        this.reads++; this.readScript = source; this.userGesture = userGesture;
        if (read) return read(this);
        return text === undefined ? JSON.stringify(report) : text;
      };
      this.webContents = contents; windows.push(this);
    }
    async loadURL(url) {
      this.loads.push(url);
      if (load) return load(this);
      this.url = url;
      this.webContents.emit('did-navigate', {}, url, status);
    }
    isDestroyed() { return this.destroyed; }
    destroy() { this.destroyCount++; this.destroyed = true; }
  }
  return { Window, session, windows, check: options => checkElectronNetwork({ BrowserWindow: Window, session, ...options }) };
}
function cleaned(t) {
  assert.equal(t.windows[0].destroyCount, 1);
  for (const event of ['will-redirect', 'will-navigate', 'will-frame-navigate', 'did-navigate']) assert.equal(t.windows[0].webContents.listenerCount(event), 0);
}

test('uses the exact account session in a hidden sandboxed window and observes US result without visiting Muse', async () => {
  const t = fixture(); const report = await t.check();
  assert.equal(report.countryCode, 'US'); assert.equal(report.ip, usa.ip); assert.ok(Number.isFinite(Date.parse(report.observedAt)));
  const w = t.windows[0];
  assert.equal(w.options.show, false); assert.equal(w.options.webPreferences.session, t.session);
  assert.equal(w.options.webPreferences.nodeIntegration, false); assert.equal(w.options.webPreferences.contextIsolation, true); assert.equal(w.options.webPreferences.sandbox, true);
  assert.equal(w.options.webPreferences.preload, undefined); assert.equal(w.options.webPreferences.partition, undefined);
  assert.deepEqual(w.loads, [CHECK_URL]); assert.deepEqual(w.popupHandler(), { action: 'deny' }); assert.equal(w.userGesture, false);
  cleaned(t);
});
test('returns non-US results as observations instead of falsely reporting a network failure', async () => {
  const t = fixture({ report: { ...usa, ip: '2001:db8::10', country_code: 'VN', country: 'Vietnam' } });
  const report = await t.check(); assert.equal(report.countryCode, 'VN'); assert.equal(report.ip, '2001:db8::10'); cleaned(t);
});
test('malformed JSON and denied or oversized reports fail without exposing remote details', async () => {
  for (const text of ['private remote detail', JSON.stringify({ ...usa, success: false, message: 'private remote detail' }), 'x'.repeat(32769)]) {
    const t = fixture({ text });
    await assert.rejects(t.check(), error => error.message.includes('Không kiểm tra được IP') && !error.message.includes('private remote detail'));
    cleaned(t);
  }
});
test('an observed HTTP error is rejected even if its body resembles a valid report', async () => {
  const t = fixture({ status: 403 }); await assert.rejects(t.check(), /Không kiểm tra được IP/); cleaned(t);
});
test('load failures always destroy the probe and sanitize remote errors', async () => {
  const t = fixture({ load: async () => { throw Error('private proxy detail'); } });
  await assert.rejects(t.check(), error => error.message.includes('Không kiểm tra được IP') && !error.message.includes('private proxy detail')); cleaned(t);
});
test('redirects away from the hardcoded check URL are blocked before navigation', async () => {
  for (const eventName of ['will-redirect', 'will-navigate', 'will-frame-navigate']) {
    let prevented = false;
    const t = fixture({ load: async w => {
      w.webContents.emit(eventName, { url: 'https://muse.ai/', preventDefault() { prevented = true; } });
      return new Promise(() => {});
    } });
    await assert.rejects(t.check(), /Không kiểm tra được IP/); assert.equal(prevented, true); assert.equal(t.windows[0].reads, 0); cleaned(t);
  }
});
test('legacy redirect event arguments are guarded and a mismatched final URL cannot be read', async () => {
  let prevented = false;
  const redirected = fixture({ load: async w => {
    w.webContents.emit('will-redirect', { preventDefault() { prevented = true; } }, 'https://other.test/');
    return new Promise(() => {});
  } });
  await assert.rejects(redirected.check(), /Không kiểm tra được IP/); assert.equal(prevented, true); cleaned(redirected);
  const wrongURL = fixture({ load: async w => { w.url = CHECK_URL + '#changed'; } });
  await assert.rejects(wrongURL.check(), /Không kiểm tra được IP/); assert.equal(wrongURL.windows[0].reads, 0); cleaned(wrongURL);
});
test('one timeout bounds the entire load operation and destroys a stuck probe', async () => {
  const t = fixture({ load: () => new Promise(() => {}) });
  await assert.rejects(t.check({ timeoutMs: 20 }), /Không kiểm tra được IP/); cleaned(t);
});
test('one timeout also bounds body reading and cleans the hidden window', async () => {
  const t = fixture({ read: () => new Promise(() => {}) });
  await assert.rejects(t.check({ timeoutMs: 20 }), /Không kiểm tra được IP/); assert.equal(t.windows[0].reads, 1); cleaned(t);
});
test('late load completion after timeout never starts a body read or opens another window', async () => {
  let finish;
  const t = fixture({ load: w => new Promise(resolve => { finish = () => { w.url = CHECK_URL; resolve(); }; }) });
  await assert.rejects(t.check({ timeoutMs: 20 }), /Không kiểm tra được IP/);
  finish(); await new Promise(resolve => setImmediate(resolve));
  assert.equal(t.windows.length, 1); assert.equal(t.windows[0].reads, 0); cleaned(t);
});
