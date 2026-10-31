const { EventEmitter } = require('node:events');
const fs = require('node:fs/promises');
const path = require('node:path');
const { createSessionStore } = require('./session-store.cjs');

const markerText = 'MuseVideoStudio dedicated browser profile\n';
function museURL(value) {
  try { const u = new URL(value); return u.protocol === 'https:' && (u.hostname === 'muse.ai' || u.hostname.endsWith('.muse.ai')); }
  catch { return false; }
}
async function ownProfile(directory) {
  if (typeof directory !== 'string' || !path.isAbsolute(directory)) throw Error('Cần thư mục hồ sơ riêng có đường dẫn đầy đủ.');
  await fs.mkdir(directory, { recursive: true });
  const marker = path.join(directory, '.muse-studio-profile');
  try {
    if (await fs.readFile(marker, 'utf8') !== markerText) throw Error('Invalid profile marker');
  } catch (e) {
    if (e.code !== 'ENOENT' || (await fs.readdir(directory)).length) throw Error('Không dùng thư mục Chrome cá nhân. Hãy chọn thư mục hồ sơ riêng trống cho Muse Studio.');
    await fs.writeFile(marker, markerText, { flag: 'wx', mode: 0o600 });
  }
}
function toElectron(cookie) {
  return {
    domain: cookie.domain, path: cookie.path || '/', name: cookie.name, value: cookie.value,
    hostOnly: !cookie.domain.startsWith('.'), secure: Boolean(cookie.secure), httpOnly: Boolean(cookie.httpOnly),
    sameSite: ({ Strict: 'strict', Lax: 'lax', None: 'no_restriction' })[cookie.sameSite] || 'unspecified',
    session: cookie.expires === -1 || cookie.expires === undefined,
    ...(cookie.expires >= 0 ? { expirationDate: cookie.expires } : {})
  };
}
function toPlaywright(cookie) {
  // Chromium interprets a domain without a leading dot as host-only. Preserve
  // the exact cookie path instead of deriving a parent directory from its URL.
  return {
    name: cookie.name, value: cookie.value, domain: cookie.domain || new URL(cookie.url).hostname,
    path: cookie.path || '/', secure: Boolean(cookie.secure), httpOnly: Boolean(cookie.httpOnly),
    sameSite: ({ strict: 'Strict', lax: 'Lax', no_restriction: 'None' })[cookie.sameSite] || 'Lax'
  };
}

async function launchExternalBrowser({ executablePath, profileDir, sessionFile, safeStorage, onWarning = () => {}, chromium, onClosed = () => {}, headless = false }) {
  if (typeof executablePath !== 'string' || !path.isAbsolute(executablePath)) throw Error('Chọn đường dẫn Chrome hoặc Edge đầy đủ.');
  await fs.access(executablePath);
  await ownProfile(profileDir);
  const engine = chromium || require('playwright-core').chromium;
  let context, store, pollTimer, debounceTimer, pendingFlush, closePromise, closing = false, closed = false, current;
  const attached = new Set();
  function warning(message) { try { onWarning(message); } catch {} }
  function stopTimers() { clearInterval(pollTimer); clearTimeout(debounceTimer); }
  function selectPage() {
    if (closed || !context) throw Error('Trình duyệt tài khoản đã đóng. Hãy mở lại tài khoản.');
    const pages = context.pages().filter(p => !p.isClosed());
    if (current && !current.isClosed() && museURL(current.url())) return current;
    const match = pages.find(p => museURL(p.url()));
    if (match) { current = match; return match; }
    throw Error('Hãy mở trang chat trên muse.ai trong trình duyệt tài khoản.');
  }
  function assertPage() { const page = selectPage(); if (!museURL(page.url())) throw Error('Chỉ thao tác tự động trên muse.ai.'); return page; }
  function flush() {
    if (closed || !store) return Promise.resolve();
    if (pendingFlush) return pendingFlush;
    pendingFlush = store.flush().finally(() => { pendingFlush = undefined; });
    return pendingFlush;
  }
  function scheduleFlush() {
    if (closed || closing) return;
    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => flush().catch(() => warning('Chưa lưu được phiên đăng nhập của tài khoản.')), 150);
    debounceTimer.unref?.();
  }
  function attachPage(page) {
    if (attached.has(page)) return;
    attached.add(page); page.on('response', scheduleFlush);
    page.once('close', () => { attached.delete(page); page.removeListener('response', scheduleFlush); });
  }
  function close() {
    if (closePromise) return closePromise;
    if (closed) return Promise.resolve();
    closing = true; stopTimers();
    closePromise = (async () => {
      let failed = false;
      try { await pendingFlush; } catch { failed = true; }
      try { if (store) await store.dispose(); } catch { failed = true; }
      try { if (context) await context.close(); } catch { failed = true; }
      finally { closed = true; }
      if (failed) throw Error('Chưa lưu hoặc đóng được đầy đủ phiên trình duyệt. Có thể cần đăng nhập lại.');
    })();
    return closePromise;
  }

  try {
    context = await engine.launchPersistentContext(profileDir, {
      executablePath, headless, acceptDownloads: true, timeout: 30000, viewport: null
    });
    context.setDefaultTimeout(15000);
    context.on('close', () => {
      closed = true; stopTimers();
      for (const p of attached) p.removeListener('response', scheduleFlush);
      attached.clear();
      try { onClosed(); } catch {}
    });
    const cookieEvents = new EventEmitter();
    cookieEvents.get = async () => (await context.cookies()).map(toElectron);
    cookieEvents.set = async cookie => context.addCookies([toPlaywright(cookie)]);
    // Chrome persists its native profile when its context closes. There is no
    // Playwright flush-cookie-store API; the encrypted backup is flushed here.
    cookieEvents.flushStore = async () => {};
    store = createSessionStore({ session: { cookies: cookieEvents }, safeStorage, file: sessionFile, onError: warning });
    const status = await store.restore();
    if (status.error) warning(status.error);
    else if (!status.available) warning('Máy chưa hỗ trợ lưu mã hóa cookie phiên. Cookie có thời hạn vẫn được Chrome/Edge lưu trong hồ sơ.');
    store.start();
    current = context.pages().find(p => !p.isClosed() && museURL(p.url())) || context.pages().find(p => !p.isClosed()) || await context.newPage();
    for (const p of context.pages()) attachPage(p);
    context.on('page', attachPage);
    await current.goto('https://muse.ai/', { waitUntil: 'domcontentloaded', timeout: 30000 });
    pollTimer = setInterval(() => {
      if (!closed && !closing) flush().catch(() => warning('Chưa lưu được phiên đăng nhập của tài khoản.'));
    }, 2000);
    pollTimer.unref?.();
    return {
      external: true,
      isDestroyed: () => closed,
      isSessionEnabled: () => Boolean(store?.isEnabled()),
      url: () => { try { return selectPage().url(); } catch { return current && !current.isClosed() ? current.url() : ''; } },
      show: async () => {
        if (closed) throw Error('Trình duyệt tài khoản đã đóng.');
        const page = current && !current.isClosed() ? current : context.pages().find(p => !p.isClosed());
        if (!page) throw Error('Trình duyệt tài khoản không có tab đang mở.');
        await page.bringToFront();
      },
      evaluate: (fn, arg) => assertPage().evaluate(fn, arg),
      upload: async (selector, files) => {
        const page = assertPage();
        if (!Array.isArray(files) || !files.length) throw Error('Chọn ít nhất một ảnh tham chiếu.');
        await Promise.all(files.map(file => fs.access(file)));
        const input = page.locator(selector);
        if (await input.count() !== 1) throw Error('Không xác định được ô tải ảnh duy nhất. Mở nút + trên Muse hoặc chỉnh selector.');
        if (files.length > 1 && await input.getAttribute('multiple') === null) throw Error('Ô tải ảnh Muse hiện tại chỉ nhận một ảnh.');
        await input.setInputFiles(files);
      },
      pressEnter: async () => { await assertPage().keyboard.press('Enter'); },
      click: async selector => {
        const page = assertPage(), target = page.locator(selector);
        if (await target.count() !== 1 || !await target.isVisible() || !await target.isEnabled()) throw Error('Không xác định được nút sẵn sàng duy nhất trên Muse.');
        await target.click();
      },
      download: async (url, target) => {
        const page = assertPage();
        let parsed;
        try { parsed = new URL(url); } catch { throw Error('Địa chỉ video chưa hợp lệ.'); }
        if (parsed.username || parsed.password || !(parsed.protocol === 'https:' || (parsed.protocol === 'blob:' && museURL(parsed.pathname)))) throw Error('Chỉ tải URL video HTTPS hoặc blob của Muse.');
        await fs.mkdir(path.dirname(target), { recursive: true });
        const pending = page.waitForEvent('download', { timeout: 180000 });
        pending.catch(() => {});
        try {
          await page.evaluate(source => {
            const a = document.createElement('a'); a.href = source; a.download = 'muse-video.mp4'; a.style.display = 'none';
            document.body.appendChild(a); try { a.click(); } finally { a.remove(); }
          }, url);
          const item = await pending;
          await item.saveAs(target);
          if (await item.failure()) throw Error('Download failed');
          return target;
        } catch { throw Error('Không tải được video trực tiếp. Nếu Muse dùng stream hoặc nút tải riêng, cần hiệu chỉnh luồng tải; không tự gửi lại prompt.'); }
      },
      flush,
      close
    };
  } catch (error) {
    stopTimers();
    try { if (context) await context.close(); } catch {}
    throw Error('Không mở được Chrome/Edge cho tài khoản. Kiểm tra đường dẫn trình duyệt, hồ sơ riêng và kết nối Muse.');
  }
}
module.exports = { launchExternalBrowser };
