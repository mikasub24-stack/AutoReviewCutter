'use strict';
/* Nhận kiểu hình của ảnh tham chiếu (chỉ nhận ra loại «hoạt hình 2D phẳng», kiểu tờ sticker / nét viền đậm / màu phẳng).
   Lý do: ảnh tham chiếu chỉ là một ảnh đính kèm, mô hình video dùng nó khi cảnh có thứ khớp với ảnh (rừng, xe tải, lính…) còn cảnh không khớp
   (trong phòng, bàn bản đồ) thì bỏ qua ảnh và vẽ người thật. Biết ảnh là 2D phẳng thì app viết thẳng kiểu đó vào đầu mọi prompt (chữ mô tả nằm trong story-plan.js),
   không chỉ trông vào ảnh đính kèm. Ảnh kiểu khác (ảnh chụp, tranh vẽ chi tiết, 3D) trả về '' — app giữ câu khóa chung như cũ.
   Đầu vào: điểm ảnh 4 kênh (BGRA hoặc RGBA, thứ tự kênh không ảnh hưởng) đã thu về rộng ~512 điểm. Hàm thuần, không cần Electron. */

const WIDTH = 512;
const FLAT_DIFF = 8, EDGE_DIFF = 60;

// Đặc trưng: tỉ lệ vùng phẳng (hàng xóm gần như cùng màu), tỉ lệ vùng viền (đổi màu mạnh), số màu chiếm trên 0,2% ảnh (lượng tử 4 bit/kênh).
function features(buf, width, height, channels = 4) {
  const w = Math.floor(width), h = Math.floor(height);
  if (!buf || w < 16 || h < 16 || buf.length < w * h * channels) return null;
  const at = (x, y) => (y * w + x) * channels;
  let flat = 0, edge = 0, n = 0;
  const bins = new Uint32Array(4096);
  for (let y = 0; y < h - 1; y++) {
    for (let x = 0; x < w - 1; x++) {
      const i = at(x, y), r = at(x + 1, y), d = at(x, y + 1);
      const dx = Math.abs(buf[i] - buf[r]) + Math.abs(buf[i + 1] - buf[r + 1]) + Math.abs(buf[i + 2] - buf[r + 2]);
      const dy = Math.abs(buf[i] - buf[d]) + Math.abs(buf[i + 1] - buf[d + 1]) + Math.abs(buf[i + 2] - buf[d + 2]);
      if (dx <= FLAT_DIFF && dy <= FLAT_DIFF) flat++;
      if (dx > EDGE_DIFF || dy > EDGE_DIFF) edge++;
      bins[((buf[i] >> 4) << 8) | ((buf[i + 1] >> 4) << 4) | (buf[i + 2] >> 4)]++;
      n++;
    }
  }
  let colors = 0;
  for (const count of bins) if (count / n > 0.002) colors++;
  return { flat: flat / n, edge: edge / n, colors };
}

// Ngưỡng đo trên tờ sticker 2D thật (50 màu, vùng phẳng 0,40, viền 0,41) và 59 khung hình Muse vẽ chi tiết / người thật (từ 73 màu trở lên, hoặc ít viền).
function lookOf(buf, width, height, channels = 4) {
  const f = features(buf, width, height, channels);
  if (!f) return '';
  return f.colors <= 70 && f.flat >= 0.3 && f.edge >= 0.25 ? 'flat2d' : '';
}

// Đọc ảnh bằng nativeImage của Electron (main process): thu nhỏ còn WIDTH điểm rồi nhận kiểu. Lỗi bất kỳ → '' (không ảnh hưởng gì).
function lookOfFile(nativeImage, file) {
  try {
    const image = nativeImage.createFromPath(file);
    if (!image || image.isEmpty()) return '';
    const size = image.getSize();
    const small = size.width > WIDTH ? image.resize({ width: WIDTH, quality: 'good' }) : image;
    const { width, height } = small.getSize();
    return lookOf(small.toBitmap(), width, height, 4);
  } catch { return ''; }
}

module.exports = { features, lookOf, lookOfFile, WIDTH };
