const { CHECK_URL, parseNetworkReport } = require('./network-check.cjs');

const FAILURE = 'Không kiểm tra được IP và quốc gia của trình duyệt. Kiểm tra kết nối rồi thử lại.';

/** Observe egress from an account's Electron session without opening Muse. */
async function checkElectronNetwork({ BrowserWindow, session, timeoutMs = 15000, signal } = {}) {
  let probe, timer, onAbort, cancelled = false;
  const listeners = [];
  try {
    if(signal?.aborted)throw Error('Cancelled');
    if (typeof BrowserWindow !== 'function' || !session || !Number.isFinite(timeoutMs) || timeoutMs <= 0) throw Error('Invalid network check configuration');
    probe = new BrowserWindow({
      show: false,
      width: 400,
      height: 300,
      webPreferences: { session, sandbox: true, nodeIntegration: false, contextIsolation: true, devTools: false }
    });
    const contents = probe.webContents;
    let responseStatus;
    let rejectNavigation;
    const rejectedNavigation = new Promise((_, reject) => { rejectNavigation = reject; });
    const listen = (event, fn) => { contents.on(event, fn); listeners.push([event, fn]); };
    const blockOtherNavigation = (event, legacyURL) => {
      const url = typeof event?.url === 'string' ? event.url : legacyURL;
      if (url !== CHECK_URL) {
        event?.preventDefault?.();
        rejectNavigation(Error('Unexpected network-check navigation'));
      }
    };
    listen('will-redirect', blockOtherNavigation);
    listen('will-navigate', blockOtherNavigation);
    listen('will-frame-navigate', blockOtherNavigation);
    // did-navigate exposes the main-frame HTTP response status in current
    // Electron. Do not use obsolete did-get-response-details hooks.
    listen('did-navigate', (_event, url, status) => {
      if (url !== CHECK_URL) { rejectNavigation(Error('Unexpected network-check destination')); return; }
      if (typeof status === 'number') {
        responseStatus = status;
        if (status !== 200) rejectNavigation(Error('Unsuccessful network-check response'));
      }
    });
    contents.setWindowOpenHandler(() => ({ action: 'deny' }));

    const assertActive = () => {
      if (cancelled || probe.isDestroyed() || contents.getURL() !== CHECK_URL) throw Error('Network check cancelled or redirected');
      if (responseStatus !== undefined && responseStatus !== 200) throw Error('Unsuccessful network-check response');
    };
    const operation = (async () => {
      await probe.loadURL(CHECK_URL);
      assertActive();
      const text = await contents.executeJavaScript("(() => { const pre = document.querySelector('pre'); return pre ? pre.innerText : (document.body ? document.body.innerText : ''); })()", false);
      assertActive();
      if (typeof text !== 'string' || text.length > 32768) throw Error('Invalid network-check body');
      return parseNetworkReport(JSON.parse(text));
    })();
    const deadline = new Promise((_, reject) => { timer = setTimeout(() => { cancelled = true; reject(Error('Network check timed out')); }, timeoutMs); });
    const aborted=new Promise((_,reject)=>{onAbort=()=>{cancelled=true;reject(Error('Cancelled'));};signal?.addEventListener('abort',onAbort,{once:true});if(signal?.aborted)onAbort();});
    return await Promise.race([operation, rejectedNavigation, deadline,aborted]);
  } catch {
    throw Error(FAILURE);
  } finally {
    cancelled = true;
    clearTimeout(timer);if(onAbort)signal?.removeEventListener('abort',onAbort);
    if (probe) {
      for (const [event, fn] of listeners) probe.webContents.removeListener(event, fn);
      if (!probe.isDestroyed()) { try { probe.destroy(); } catch {} }
    }
  }
}

module.exports = { checkElectronNetwork };
