// Nguồn khung hình thật cho tab «Bản đồ lịch sử»: các cửa sổ Electron ẩn vẽ canvas và gửi từng khung JPEG về tiến trình chính.
// Nhiều cửa sổ vẽ song song (mỗi cửa sổ một khối khung liên tiếp, phát vòng tròn); khung được xếp lại đúng thứ tự trước khi đưa cho onFrame.
// Dùng qua createMapService({ renderFrames }); kiểm thử thay bằng nguồn khung giả.
const os = require('node:os');
const path = require('node:path');

const MAX_WORKERS = 16;
const CHUNK = 24;   // số khung liên tiếp mỗi cửa sổ vẽ một lượt (khung liền nhau cùng cửa sổ để tận dụng bộ nhớ đệm bản đồ)

// Số cửa sổ vẽ theo số luồng CPU và dung lượng RAM (mỗi cửa sổ vẽ tốn vài trăm MB đến ~1 GB): chừa chỗ cho bộ mã hóa video và giao diện.
// Có thể ép bằng biến môi trường MUSE_RENDER_WORKERS hoặc ô «Số cửa sổ vẽ» trong tab (1–MAX_WORKERS).
function defaultWorkers(cores = os.cpus().length, env = process.env.MUSE_RENDER_WORKERS, memGB = os.totalmem() / 2 ** 30) {
  const forced = Math.round(Number(env));
  if (forced >= 1 && forced <= MAX_WORKERS) return forced;
  // Máy mạnh thì vẽ nhiều cửa sổ hơn: khoảng một cửa sổ cho mỗi 2,5 luồng CPU (12 luồng → 5, 16 → 6, 24 → 10), mỗi cửa sổ cần ~1,5 GB RAM chừa chỗ cho hệ thống.
  const byCpu = cores >= 10 ? Math.max(4, Math.round(cores / 2.5)) : cores >= 6 ? 3 : cores >= 4 ? 2 : 1;
  const byRam = memGB >= 12 ? Math.floor((memGB - 4) / 1.5) : memGB >= 7.5 ? 3 : memGB >= 5 ? 2 : 1;
  return Math.min(byCpu, byRam, MAX_WORKERS);
}

// Nhận khung theo thứ tự bất kỳ, gọi onFrame đúng thứ tự 0,1,2,… Cửa sổ chỉ bị giữ lại khi nó vượt quá `limit` khung so với khung chờ ghi
// (giữ RAM nhỏ khi vẽ nhanh hơn mã hóa). Lỗi hoặc yêu cầu dừng từ onFrame truyền cho mọi cửa sổ qua { stop: true }.
function orderedSink({ onFrame, limit }) {
  let next = 0, pumping = false, stopped = false, failure = null, loop = Promise.resolve();
  const held = new Map();   // index -> { buffer, ack, acked }
  const release = () => {
    for (const [index, h] of held) {
      if (h.acked) continue;
      if (stopped || failure) { h.acked = true; h.ack({ stop: true }); }
      else if (index - next < limit) { h.acked = true; h.ack({ stop: false }); }
    }
  };
  // Một vòng ghi duy nhất chạy tại một thời điểm; trả về lời hứa hoàn tất khi không còn khung liền kề nào để ghi.
  function pump() {
    if (pumping) return loop;
    pumping = true;
    loop = (async () => {
      try {
        while (!stopped && !failure && held.has(next)) {
          const h = held.get(next); held.delete(next);
          const index = next++;
          try { const r = await onFrame(h.buffer, index); if (r && r.stop) stopped = true; } catch (error) { failure = error; }
          if (!h.acked) { h.acked = true; h.ack({ stop: stopped || Boolean(failure) }); }
          release();
        }
      } finally { pumping = false; release(); }
    })();
    return loop;
  }
  return {
    push(index, buffer) { return new Promise(ack => { held.set(index, { buffer, ack, acked: false }); release(); pump(); }); },
    // Các cửa sổ báo xong khi khung cuối vừa được nhận (chưa chắc đã ghi): đợi ghi nốt các khung còn giữ lại.
    async flush() { await pump(); },
    get stopped() { return stopped; },
    get failure() { return failure; },
    get written() { return next; }
  };
}

function createWindowFrames({ BrowserWindow, ipcMain, quality = .92, workers = 0 }) {
  let current = null;   // { senders: Set, push }
  let registered = false;
  const register = () => {
    if (registered) return;
    registered = true;
    ipcMain.handle('maphist:frame', async (event, index, buffer) => {
      const cur = current;
      if (!cur || !cur.senders.has(event.sender)) return { stop: true };
      return cur.push(index, buffer);
    });
  };
  const makeWindow = timeline => new BrowserWindow({
    show: false, width: timeline.W, height: timeline.H, useContentSize: true, backgroundColor: '#000000',
    webPreferences: { preload: path.join(__dirname, 'maphist-render-preload.cjs'), contextIsolation: true, nodeIntegration: false, sandbox: true, backgroundThrottling: false }
  });
  const destroy = win => { try { if (!win.isDestroyed()) win.destroy(); } catch { /* đã đóng */ } };

  // timeline đã dựng sẵn, raw = dữ liệu world.json; onFrame(buffer, index) được gọi đúng thứ tự khung và trả { stop } để dừng sớm.
  async function renderFrames({ timeline, raw, fps, signal, onFrame, onInfo = () => {}, workers: wanted = 0 }) {
    register();
    const total = Math.ceil(timeline.total * fps);
    const count = Math.max(1, Math.min(Math.min(MAX_WORKERS, Math.round(Number(wanted)) || workers || defaultWorkers()), Math.ceil(total / CHUNK)));
    const sink = orderedSink({ onFrame, limit: CHUNK * count });
    const wins = [];
    const stopAll = () => wins.forEach(destroy);
    signal?.addEventListener('abort', stopAll, { once: true });
    const aborted = () => Object.assign(Error('Đã dừng.'), { name: 'AbortError' });
    try {
      for (let k = 0; k < count; k++) wins.push(makeWindow(timeline));
      current = { senders: new Set(wins.map(w => w.webContents)), push: (index, buffer) => sink.push(index, buffer) };
      onInfo({ workers: count });
      const init = JSON.stringify({ raw, timeline });
      await Promise.all(wins.map(async (win, k) => {
        await win.loadFile(path.join(__dirname, 'maphist-render.html'));
        const wc = win.webContents;
        await wc.executeJavaScript('window.__mapRenderReady === true');
        await wc.executeJavaScript(`MapRender.init(${init})`);
        return wc.executeJavaScript(`MapRender.run(${JSON.stringify({ fps, quality, worker: k, workers: count, chunk: CHUNK })})`);
      }));
      await sink.flush();
      if (signal?.aborted) throw aborted();
      if (sink.failure) throw sink.failure;
      return { frames: sink.written, stopped: sink.stopped, workers: count };
    } catch (error) {
      if (signal?.aborted) throw aborted();
      throw sink.failure || error;
    } finally {
      signal?.removeEventListener('abort', stopAll);
      current = null;
      stopAll();
    }
  }
  // Một ảnh bìa tĩnh: cửa sổ ẩn vẽ giai đoạn index kèm tiêu đề, trả về Buffer JPEG.
  async function renderStill({ timeline, raw, index, variant = 0, hook = '', quality = .92, signal }) {
    const win = makeWindow(timeline);
    const stop = () => destroy(win);
    signal?.addEventListener('abort', stop, { once: true });
    try {
      await win.loadFile(path.join(__dirname, 'maphist-render.html'));
      const wc = win.webContents;
      await wc.executeJavaScript('window.__mapRenderReady === true');
      const b64 = await wc.executeJavaScript(`MapRender.thumbnail(${JSON.stringify({ raw, timeline, index, variant, hook, quality })})`);
      return Buffer.from(b64, 'base64');
    } finally {
      signal?.removeEventListener('abort', stop);
      stop();
    }
  }
  return { renderFrames, renderStill };
}

module.exports = { createWindowFrames, orderedSink, defaultWorkers, CHUNK, MAX_WORKERS };
