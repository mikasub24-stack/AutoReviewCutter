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
      await Promise.all(['400 40px MapLora', '600 40px MapLora', '700 40px MapLora', 'italic 600 40px MapLora', 'italic 700 40px MapLora', '900 40px MapImpact', '400 40px MapDisplay', '800 40px MapRound', '700 40px MapLabel'].map(f => document.fonts.load(f)));
      return { frames: Math.ceil(tl.total * tl.fps) };
    },
    // Vẽ khung i/fps. Mã hóa JPEG của khung i chạy song song với việc vẽ khung i+1.
    async frame(t, quality = .92) { R.drawFrame(t); return encode(quality); },
    // Ảnh bìa 16:9 (một khung JPEG, trả về base64): bản đồ giai đoạn index, quả cầu cờ mặt giận dữ, vài từ rất to (hook); variant chọn kiểu bố cục.
    async thumbnail({ raw, timeline, index, variant = 0, hook = '', quality = .92 }) {
      await this.init({ raw, timeline });
      R.drawThumbnail(index, { variant, hook });
      const buf = await encode(quality);
      let str = '';
      for (let i = 0; i < buf.length; i += 0x8000) str += String.fromCharCode.apply(null, buf.subarray(i, i + 0x8000));
      return btoa(str);
    },
    // Khung mà cửa sổ số `worker` (trong `workers` cửa sổ) phải vẽ: cả video chia thành khối `chunk` khung liên tiếp, phát vòng tròn cho các cửa sổ.
    // Khung liền nhau nằm cùng một cửa sổ nên bộ nhớ đệm bản đồ vẫn có tác dụng; mỗi khung chỉ phụ thuộc thời điểm t nên vẽ ở cửa sổ nào cũng ra đúng một hình.
    framesOf(N, worker = 0, workers = 1, chunk = 24) {
      const list = [];
      for (let c = worker; c * chunk < N; c += workers) for (let i = c * chunk; i < Math.min(N, (c + 1) * chunk); i++) list.push(i);
      return list;
    },
    async run({ fps = tl.fps, quality = .92, worker = 0, workers = 1, chunk = 24 } = {}) {
      const bridge = window.maphistBridge, N = Math.ceil(tl.total * fps), out = [];
      const list = this.framesOf(N, worker, workers, chunk);
      let inflight = null;
      for (let k = 0; k < list.length; k++) {
        const i = list[k];
        R.drawFrame(i / fps);
        const encoded = encode(quality);
        if (inflight) { const r = await inflight; if (r && r.stop) return { frames: k, stopped: true }; }
        inflight = encoded.then(buf => bridge ? bridge.frame(i, buf) : (out.push(buf), null));
      }
      if (inflight) { const r = await inflight; if (r && r.stop) return { frames: list.length, stopped: true }; }
      return bridge ? { frames: list.length, stopped: false } : { frames: list.length, stopped: false, buffers: out };
    }
  };
  window.__mapRenderReady = true;
})();
