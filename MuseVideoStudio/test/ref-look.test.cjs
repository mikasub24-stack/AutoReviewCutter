const { test } = require('node:test');
const assert = require('node:assert/strict');
const { features, lookOf, lookOfFile } = require('../src/ref-look.cjs');

const W = 512, H = 341;
// Tranh «sticker» giả: nền trắng, lưới ô màu phẳng có viền đen đậm (nhiều viền như tờ sticker thật).
function sticker() {
  const buf = Buffer.alloc(W * H * 4, 255);
  const colors = [[255, 255, 255], [60, 110, 50], [200, 60, 40], [255, 255, 255], [40, 80, 160], [230, 200, 60], [255, 255, 255], [120, 120, 120]];
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const cx = Math.floor(x / 9), cy = Math.floor(y / 9), line = x % 9 < 2 || y % 9 < 2;
    const c = line ? [10, 10, 10] : colors[(cx * 3 + cy * 5) % colors.length], i = (y * W + x) * 4;
    buf[i] = c[0]; buf[i + 1] = c[1]; buf[i + 2] = c[2]; buf[i + 3] = 255;
  }
  return buf;
}
// Ảnh giống ảnh chụp: dải màu liên tục + nhiễu, không có vùng phẳng.
function photo() {
  const buf = Buffer.alloc(W * H * 4);
  let seed = 12345; const rnd = () => ((seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const i = (y * W + x) * 4;
    buf[i] = (x * 255 / W + rnd() * 30) & 255; buf[i + 1] = (y * 255 / H + rnd() * 30) & 255; buf[i + 2] = ((x + y) * 255 / (W + H) + rnd() * 30) & 255; buf[i + 3] = 255;
  }
  return buf;
}

test('tờ sticker 2D phẳng được nhận là flat2d, ảnh giống ảnh chụp thì không', () => {
  assert.equal(lookOf(sticker(), W, H), 'flat2d');
  assert.equal(lookOf(photo(), W, H), '');
});

test('ảnh toàn một màu hoặc quá nhỏ / thiếu dữ liệu không bị nhận nhầm', () => {
  assert.equal(lookOf(Buffer.alloc(W * H * 4, 255), W, H), '', 'toàn trắng: không có viền');
  assert.equal(lookOf(Buffer.alloc(10), 2, 2), '');
  assert.equal(lookOf(null, W, H), '');
  assert.equal(features(Buffer.alloc(8), W, H), null);
});

test('lookOfFile: lỗi đọc ảnh trả chuỗi rỗng, ảnh hợp lệ đi qua thu nhỏ rồi nhận kiểu', () => {
  const small = { isEmpty: () => false, getSize: () => ({ width: W, height: H }), toBitmap: () => sticker() };
  assert.equal(lookOfFile({ createFromPath: () => small }, 'a.png'), 'flat2d');
  const big = { isEmpty: () => false, getSize: () => ({ width: 2048, height: 1364 }), resize: o => { assert.equal(o.width, 512); return small; } };
  assert.equal(lookOfFile({ createFromPath: () => big }, 'b.png'), 'flat2d');
  assert.equal(lookOfFile({ createFromPath: () => ({ isEmpty: () => true }) }, 'c.png'), '');
  assert.equal(lookOfFile({ createFromPath: () => { throw Error('hỏng'); } }, 'd.png'), '');
});
