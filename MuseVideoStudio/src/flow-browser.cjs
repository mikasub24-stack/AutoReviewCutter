// Trình duyệt riêng cho Google Flow (Veo 3.1).
// Google chặn đăng nhập trong trình duyệt do Playwright mở (cờ automation), nên Chrome/Edge được mở BÌNH THƯỜNG với hồ sơ riêng của tool
// (người dùng tự đăng nhập một lần), rồi tool nối vào bằng cổng gỡ lỗi cục bộ (CDP) để điều khiển cùng cửa sổ đó.
const fs = require('node:fs/promises');
const net = require('node:net');
const path = require('node:path');
const { spawn } = require('node:child_process');

const FLOW_URL = 'https://flow.google.com/';
const flowHost = url => { try { const h = new URL(url).hostname; return h === 'flow.google.com' || h === 'labs.google' || h.endsWith('.labs.google'); } catch { return false; } };

function freePort() {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => { const { port } = server.address(); server.close(() => resolve(port)); });
  });
}

async function waitForDebugger(port, { timeoutMs = 30000, child } = {}) {
  const end = Date.now() + timeoutMs;
  let last = '';
  while (Date.now() < end) {
    if (child && child.exitCode !== null) throw Error('Chrome/Edge đã thoát ngay khi mở (mã ' + child.exitCode + '). Đóng các cửa sổ Chrome dùng cùng hồ sơ rồi thử lại.');
    try {
      const response = await fetch(`http://127.0.0.1:${port}/json/version`);
      if (response.ok) return true;
      last = 'HTTP ' + response.status;
    } catch (e) { last = e.message; }
    await new Promise(r => setTimeout(r, 250));
  }
  throw Error('Trình duyệt chưa mở cổng điều khiển (' + last + ').');
}

// profileDir: thư mục riêng của tool (không dùng hồ sơ Chrome cá nhân của người dùng).
async function startFlowBrowser({ executablePath, profileDir, chromium, headless = false, extraArgs = [], onClosed = () => {}, url = FLOW_URL }) {
  if (typeof executablePath !== 'string' || !path.isAbsolute(executablePath)) throw Error('Chọn đường dẫn Chrome hoặc Edge đầy đủ.');
  await fs.access(executablePath);
  if (typeof profileDir !== 'string' || !path.isAbsolute(profileDir)) throw Error('Đường dẫn hồ sơ Flow không hợp lệ.');
  await fs.mkdir(profileDir, { recursive: true });
  const engine = chromium || require('playwright-core').chromium;
  const port = await freePort();
  const args = [
    `--remote-debugging-port=${port}`, '--remote-debugging-address=127.0.0.1', `--user-data-dir=${profileDir}`,
    '--no-first-run', '--no-default-browser-check', '--disable-background-timer-throttling', '--disable-backgrounding-occluded-windows', '--disable-renderer-backgrounding',
    ...(headless ? ['--headless=new'] : []), ...extraArgs, url
  ];
  const child = spawn(executablePath, args, { stdio: 'ignore', windowsHide: false });
  let closed = false;
  let spawnError = null;
  child.once('error', e => { spawnError = e; });
  child.once('exit', () => { closed = true; try { onClosed(); } catch {} });
  let browser;
  try {
    await waitForDebugger(port, { child });
    if (spawnError) throw spawnError;
    browser = await engine.connectOverCDP(`http://127.0.0.1:${port}`);
  } catch (e) {
    try { child.kill(); } catch {}
    throw Error('Không mở được trình duyệt cho Flow: ' + e.message);
  }
  const context = browser.contexts()[0] || await browser.newContext();
  context.setDefaultTimeout(15000);
  const pages = () => context.pages().filter(p => !p.isClosed());
  async function page() {
    if (closed) throw Error('Trình duyệt Flow đã đóng.');
    const list = pages();
    return list.find(p => flowHost(p.url())) || list[0] || await context.newPage();
  }
  async function close() {
    if (closed) return;
    closed = true;
    // Đóng êm để Chrome kịp ghi cookie đăng nhập vào hồ sơ.
    try { const cdp = await browser.newBrowserCDPSession(); await cdp.send('Browser.close'); } catch {}
    await new Promise(r => setTimeout(r, 400));
    try { await browser.close(); } catch {}
    try { child.kill(); } catch {}
  }
  return { external: true, port, context, browser, page, pages, close, isClosed: () => closed, pid: child.pid };
}

module.exports = { FLOW_URL, flowHost, startFlowBrowser, freePort, waitForDebugger };
