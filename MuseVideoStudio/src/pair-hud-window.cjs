// Tab «So sánh song song»: cửa sổ Electron ẩn chạy pair-hud.html để vẽ các lớp chữ bằng canvas.
// Cửa sổ chỉ mở khi dựng và đóng ngay sau đó (close). Mỗi lệnh gọi một hàm của PairHud trong trang và nhận về PNG dạng data URL.
const path = require('node:path');

function createWindowHud({ BrowserWindow, file = path.join(__dirname, 'pair-hud.html') }) {
  let win = null, opening = null;
  const alive = () => win && !win.isDestroyed();
  async function open() {
    if (alive()) return win;
    if (!opening) {
      opening = (async () => {
        const w = new BrowserWindow({
          show: false, width: 1280, height: 720, backgroundColor: '#00000000',
          webPreferences: { contextIsolation: true, nodeIntegration: false, sandbox: true, backgroundThrottling: false }
        });
        try {
          await w.loadFile(file);
          const ok = await w.webContents.executeJavaScript('PairHud.ready()');
          if (!ok) throw Error('Trang vẽ chữ chưa sẵn sàng.');
        } catch (e) { try { if (!w.isDestroyed()) w.destroy(); } catch { /* đã đóng */ } throw e; }
        win = w;
        return w;
      })().finally(() => { opening = null; });
    }
    return opening;
  }
  // JSON.stringify cho ra biểu thức JavaScript hợp lệ, nên dữ liệu (tiêu đề, phụ đề…) không thể chen mã vào lệnh.
  async function call(name, args) {
    const w = await open();
    return w.webContents.executeJavaScript(`PairHud.${name}(...${JSON.stringify(args)})`);
  }
  function close() { try { if (alive()) win.destroy(); } catch { /* đã đóng */ } win = null; }
  return {
    init: options => call('init', [options]),
    base: () => call('base', []),
    tag: (number, label) => call('tag', [number, label]),
    caption: text => call('caption', [text]),
    meterSeq: (side, from, to, other) => call('meterSeq', other === undefined ? [side, from, to] : [side, from, to, other]),
    intro: () => call('intro', []),
    outro: (lessons, closing) => call('outro', [lessons, closing]),
    thumb: options => call('thumb', [options]),
    close
  };
}

module.exports = { createWindowHud };
