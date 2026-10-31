const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { resolveBrowser } = require('../src/browser-discovery.cjs');

const env = { ProgramFiles: 'C:\\Program Files', 'ProgramFiles(x86)': 'C:\\Program Files (x86)', LOCALAPPDATA: 'C:\\Users\\Example\\AppData\\Local' };
test('builtin does not inspect any executable or profile', () => {
  assert.equal(resolveBrowser({ choice: 'builtin', exists: () => { throw Error('must not probe'); } }), null);
});
test('Windows Chrome checks official install roots in order and handles mixed-case environment names', () => {
  const wanted = 'C:\\Users\\Example\\AppData\\Local\\Google\\Chrome\\Application\\chrome.exe';
  const seen = [];
  assert.equal(resolveBrowser({ choice: 'chrome', platform: 'win32', env, exists: p => { seen.push(p); return p === wanted; } }), wanted);
  assert.deepEqual(seen, [
    'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
    wanted
  ]);
});
test('Windows Edge resolves its x86 installation independently of Chrome', () => {
  const wanted = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
  assert.equal(resolveBrowser({ choice: 'edge', platform: 'win32', env, exists: p => p === wanted }), wanted);
});
test('missing browser never silently selects the other brand', () => {
  const seen = [];
  assert.throws(() => resolveBrowser({ choice: 'chrome', platform: 'win32', env, exists: p => { seen.push(p); return p.includes('Microsoft'); } }), /Không tìm thấy Google Chrome/);
  assert.equal(seen.some(p => p.includes('Microsoft')), false);
  assert.throws(() => resolveBrowser({ choice: 'edge', platform: 'win32', env: {}, exists: () => true }), /Không tìm thấy Microsoft Edge/);
});
test('custom paths must be absolute, exist, and be readable', () => {
  const wanted = 'D:\\Tools\\Browser\\chrome.exe';
  assert.equal(resolveBrowser({ choice: 'custom', customPath: ` ${wanted} `, platform: 'win32', exists: p => p === wanted }), wanted);
  assert.throws(() => resolveBrowser({ choice: 'custom', customPath: 'chrome.exe', platform: 'win32', exists: () => true }), /tuyệt đối/);
  assert.throws(() => resolveBrowser({ choice: 'custom', customPath: wanted, platform: 'win32', exists: () => false }), /không tồn tại/);
  assert.throws(() => resolveBrowser({ choice: 'custom', customPath: wanted, platform: 'win32', exists: () => { throw Error('access denied'); } }), /không tồn tại/);
});
test('real custom-path discovery rejects directories', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'browser-discovery-'));
  try { assert.throws(() => resolveBrowser({ choice: 'custom', customPath: root }), /không tồn tại/); }
  finally { fs.rmdirSync(root); }
});
test('Linux and macOS resolve known executable paths without mixing brands', () => {
  assert.equal(resolveBrowser({ choice: 'chrome', platform: 'linux', exists: p => p === '/usr/bin/chromium' }), '/usr/bin/chromium');
  assert.equal(resolveBrowser({ choice: 'edge', platform: 'linux', exists: p => p === '/usr/bin/microsoft-edge-stable' }), '/usr/bin/microsoft-edge-stable');
  const wanted = '/Users/example/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge';
  assert.equal(resolveBrowser({ choice: 'edge', platform: 'darwin', env: { HOME: '/Users/example' }, exists: p => p === wanted }), wanted);
});
test('unknown choices and unsupported discovery platforms give actionable errors', () => {
  assert.throws(() => resolveBrowser({ choice: 'firefox' }), /Chọn trình duyệt/);
  assert.throws(() => resolveBrowser({ choice: 'edge', platform: 'unknown' }), /đường dẫn trình duyệt tùy chọn/);
});
