const fs = require('node:fs/promises');
const path = require('node:path');

// Electron persistent partitions retain persistent cookies and web storage, but
// Electron 40 does not restore session-only cookies. Keep only Muse session
// cookies in an OS-encrypted, account-specific backup to implement Remember me.
function isMuseCookie(cookie) {
  const host = typeof cookie?.domain === 'string' ? cookie.domain.replace(/^\.+/, '').toLowerCase() : '';
  if (!/^[a-z0-9.-]+$/.test(host)) return false;
  return host === 'muse.ai' || host.endsWith('.muse.ai');
}
function sessionCookie(cookie) {
  return isMuseCookie(cookie) && (cookie.session === true || (cookie.session !== false && cookie.expirationDate === undefined))
    && typeof cookie.name === 'string' && typeof cookie.value === 'string';
}
function cookieKey(cookie) { return [cookie.domain?.replace(/^\.+/, '').toLowerCase(), cookie.path || '/', cookie.name].join('\n'); }
function details(cookie) {
  const host = cookie.domain.replace(/^\.+/, '').toLowerCase();
  const cookiePath = typeof cookie.path === 'string' && cookie.path.startsWith('/') ? cookie.path : '/';
  const result = {
    url: `https://${host}${cookiePath}`, name: cookie.name, value: cookie.value,
    path: cookiePath, secure: Boolean(cookie.secure), httpOnly: Boolean(cookie.httpOnly),
    sameSite: ['unspecified','no_restriction','lax','strict'].includes(cookie.sameSite) ? cookie.sameSite : 'unspecified'
  };
  // Omitting domain is essential for host-only and __Host- cookies.
  if (!cookie.hostOnly) result.domain = cookie.domain;
  return result;
}
function createSessionStore({ session, safeStorage, file, platform = process.platform, onError = () => {} }) {
  let running = false, writes = Promise.resolve(), backupBlocked = false;
  function available() {
    return safeStorage.isEncryptionAvailable() && !(platform === 'linux' && safeStorage.getSelectedStorageBackend?.() === 'basic_text');
  }
  async function restore() {
    if (!available()) return { available: false, enabled: false, restored: 0, error: '' };
    let bytes;
    try { bytes = await fs.readFile(file); }
    catch (e) {
      if (e.code === 'ENOENT') return { available: true, enabled: true, restored: 0, error: '' };
      backupBlocked = true;
      return { available: true, enabled: false, restored: 0, error: 'Không thể đọc phiên đăng nhập đã lưu. Bản lưu được giữ nguyên; vui lòng đăng nhập lại.' };
    }
    let restored = 0;
    try {
      const data = JSON.parse(safeStorage.decryptString(bytes));
      if (data.version !== 1 || !Array.isArray(data.cookies)) throw Error('Invalid session format');
      const current = new Set((await session.cookies.get({})).map(cookieKey));
      let rejected = 0;
      for (const cookie of data.cookies.filter(sessionCookie)) {
        if (current.has(cookieKey(cookie))) continue;
        try { await session.cookies.set(details(cookie)); restored++; }
        catch { rejected++; }
      }
      if (rejected) {
        backupBlocked = true;
        return { available: true, enabled: false, restored, error: `Có ${rejected} cookie phiên không khôi phục được. Bản lưu được giữ nguyên; vui lòng đăng nhập lại.` };
      }
      return { available: true, enabled: true, restored, error: '' };
    } catch {
      backupBlocked = true;
      return { available: true, enabled: false, restored, error: 'Không thể khôi phục phiên đăng nhập trên máy này. Bản lưu được giữ nguyên; vui lòng đăng nhập lại.' };
    }
  }
  function flush() {
    const pending = writes.catch(() => {}).then(async () => {
      const nativeFlush = Promise.resolve().then(() => session.cookies.flushStore());
      const backupFlush = Promise.resolve().then(async () => {
        if (!available() || backupBlocked) return;
        const cookies = (await session.cookies.get({})).filter(sessionCookie);
        const encrypted = safeStorage.encryptString(JSON.stringify({ version: 1, cookies }));
        await fs.mkdir(path.dirname(file), { recursive: true });
        await fs.writeFile(file + '.tmp', encrypted, { mode: 0o600 });
        await fs.rename(file + '.tmp', file);
      });
      const results = await Promise.allSettled([nativeFlush, backupFlush]);
      if (results.some(result => result.status === 'rejected')) throw Error('Chưa lưu được đầy đủ dữ liệu phiên đăng nhập trên máy.');
    });
    writes = pending;
    return pending;
  }
  function changed(_event, cookie) {
    if (isMuseCookie(cookie)) flush().catch(() => onError('Không thể lưu phiên đăng nhập trên máy.'));
  }
  function start() { if (!running) { session.cookies.on('changed', changed); running = true; } }
  async function dispose() {
    if (running) session.cookies.removeListener('changed', changed);
    running = false; await flush();
  }
  return { restore, start, flush, dispose, available, isEnabled: () => available() && !backupBlocked };
}
module.exports = { createSessionStore };
