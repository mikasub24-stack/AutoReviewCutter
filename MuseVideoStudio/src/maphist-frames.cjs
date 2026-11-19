// Nguồn khung hình thật cho tab «Bản đồ lịch sử»: một cửa sổ Electron ẩn vẽ canvas và gửi từng khung JPEG về tiến trình chính.
// Dùng qua createMapService({ renderFrames }); kiểm thử thay bằng nguồn khung giả.
const path = require('node:path');

function createWindowFrames({ BrowserWindow, ipcMain, quality = .92 }) {
  let current = null;   // { sender, onFrame }
  let registered = false;
  const register = () => {
    if (registered) return;
    registered = true;
    ipcMain.handle('maphist:frame', async (event, index, buffer) => {
      const cur = current;
      if (!cur || event.sender !== cur.sender) return { stop: true };
      return cur.onFrame(buffer, index);
    });
  };
  // timeline đã dựng sẵn, raw = dữ liệu world.json; onFrame(buffer, index) trả { stop } để dừng sớm.
  async function renderFrames({ timeline, raw, fps, signal, onFrame }) {
    register();
    const win = new BrowserWindow({
      show: false, width: timeline.W, height: timeline.H, useContentSize: true, backgroundColor: '#000000',
      webPreferences: { preload: path.join(__dirname, 'maphist-render-preload.cjs'), contextIsolation: true, nodeIntegration: false, sandbox: true, backgroundThrottling: false }
    });
    const stop = () => { try { if (!win.isDestroyed()) win.destroy(); } catch { /* đã đóng */ } };
    signal?.addEventListener('abort', stop, { once: true });
    try {
      current = { sender: win.webContents, onFrame };
      await win.loadFile(path.join(__dirname, 'maphist-render.html'));
      const wc = win.webContents;
      await wc.executeJavaScript('window.__mapRenderReady === true');
      await wc.executeJavaScript(`MapRender.init(${JSON.stringify({ raw, timeline })})`);
      const result = await wc.executeJavaScript(`MapRender.run(${JSON.stringify({ fps, quality })})`);
      if (signal?.aborted) throw Object.assign(Error('Đã dừng.'), { name: 'AbortError' });
      return result;
    } catch (error) {
      if (signal?.aborted) throw Object.assign(Error('Đã dừng.'), { name: 'AbortError' });
      throw error;
    } finally {
      signal?.removeEventListener('abort', stop);
      current = null;
      stop();
    }
  }
  // Một ảnh bìa tĩnh: cửa sổ ẩn vẽ giai đoạn index kèm tiêu đề, trả về Buffer JPEG.
  async function renderStill({ timeline, raw, index, title, subtitle, years, quality = .92, signal }) {
    const win = new BrowserWindow({
      show: false, width: timeline.W, height: timeline.H, useContentSize: true, backgroundColor: '#000000',
      webPreferences: { preload: path.join(__dirname, 'maphist-render-preload.cjs'), contextIsolation: true, nodeIntegration: false, sandbox: true, backgroundThrottling: false }
    });
    const stop = () => { try { if (!win.isDestroyed()) win.destroy(); } catch { /* đã đóng */ } };
    signal?.addEventListener('abort', stop, { once: true });
    try {
      await win.loadFile(path.join(__dirname, 'maphist-render.html'));
      const wc = win.webContents;
      await wc.executeJavaScript('window.__mapRenderReady === true');
      const b64 = await wc.executeJavaScript(`MapRender.thumbnail(${JSON.stringify({ raw, timeline, index, title, subtitle, years, quality })})`);
      return Buffer.from(b64, 'base64');
    } finally {
      signal?.removeEventListener('abort', stop);
      stop();
    }
  }
  return { renderFrames, renderStill };
}

module.exports = { createWindowFrames };
