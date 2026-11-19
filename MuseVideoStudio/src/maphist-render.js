// Cửa sổ ẩn dựng video bản đồ: nhận dữ liệu bản đồ + dòng thời gian, vẽ từng khung rồi gửi JPEG về tiến trình chính.
// Chạy được cả trong trình duyệt thường (khi kiểm thử) nếu không có cầu nối `maphistBridge`: khi đó run() trả mảng khung.
(function () {
  'use strict';
  let R = null, tl = null, canvas = null;
  const encode = quality => new Promise((resolve, reject) => canvas.toBlob(blob => blob ? blob.arrayBuffer().then(b => resolve(new Uint8Array(b)), reject) : reject(Error('Không mã hóa được khung hình.')), 'image/jpeg', quality));
  window.MapRender = {
    async init({ raw, timeline }) {
      canvas = document.getElementById('c');
      const geo = window.maphistGeo.build(raw);
      R = window.maphistDraw.create({ canvas, geo });
      tl = timeline; R.setTimeline(tl);
      await Promise.all(['400 40px MapLora', '600 40px MapLora', '700 40px MapLora', 'italic 600 40px MapLora', 'italic 700 40px MapLora'].map(f => document.fonts.load(f)));
      return { frames: Math.ceil(tl.total * tl.fps) };
    },
    // Vẽ khung i/fps. Mã hóa JPEG của khung i chạy song song với việc vẽ khung i+1.
    async frame(t, quality = .92) { R.drawFrame(t); return encode(quality); },
    // Ảnh bìa 16:9 (một khung JPEG, trả về base64): bản đồ giai đoạn index + tiêu đề lớn.
    async thumbnail({ raw, timeline, index, title, subtitle, years, quality = .92 }) {
      await this.init({ raw, timeline });
      R.drawThumbnail(index, { title, subtitle, years });
      const buf = await encode(quality);
      let str = '';
      for (let i = 0; i < buf.length; i += 0x8000) str += String.fromCharCode.apply(null, buf.subarray(i, i + 0x8000));
      return btoa(str);
    },
    async run({ fps = tl.fps, quality = .92 } = {}) {
      const bridge = window.maphistBridge, N = Math.ceil(tl.total * fps), out = [];
      let inflight = null;
      for (let i = 0; i < N; i++) {
        R.drawFrame(i / fps);
        const encoded = encode(quality);
        if (inflight) { const r = await inflight; if (r && r.stop) return { frames: i, stopped: true }; }
        inflight = encoded.then(buf => bridge ? bridge.frame(i, buf) : (out.push(buf), null));
      }
      if (inflight) { const r = await inflight; if (r && r.stop) return { frames: N, stopped: true }; }
      return bridge ? { frames: N, stopped: false } : { frames: N, stopped: false, buffers: out };
    }
  };
  window.__mapRenderReady = true;
})();
