// Nhạc nền tự tạo của tab «So sánh song song»: miễn bản quyền (tổng hợp bằng mã), lặp liền mạch, đủ nhỏ để nằm dưới giọng đọc.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const M = require('../src/pair-music.cjs');

const samples = wav => { const n = (wav.length - 44) / 4, l = new Int16Array(n), r = new Int16Array(n); for (let i = 0; i < n; i++) { l[i] = wav.readInt16LE(44 + i * 4); r[i] = wav.readInt16LE(46 + i * 4); } return { n, l, r }; };

test('mỗi phong cách ra WAV 16-bit stereo hợp lệ, có tiếng, không rè, dài đúng 16 ô nhịp', () => {
  for (const kind of M.KINDS) {
    const { wav, seconds } = M.render(kind);
    assert.equal(wav.toString('latin1', 0, 4), 'RIFF');
    assert.equal(wav.readUInt16LE(22), 2);
    assert.equal(wav.readUInt32LE(24), M.RATE);
    const style = M.STYLES[kind], expected = 16 * 4 * 60 / style.bpm;
    assert.ok(Math.abs(seconds - expected) < 0.01, `${kind}: ${seconds} ≠ ${expected}`);
    const { n, l, r } = samples(wav);
    let peak = 0, sum = 0;
    for (let i = 0; i < n; i++) { peak = Math.max(peak, Math.abs(l[i]), Math.abs(r[i])); sum += l[i] * l[i] + r[i] * r[i]; }
    const rms = Math.sqrt(sum / (2 * n)) / 32768;
    assert.ok(peak < 32767 * 0.95, `${kind}: đỉnh ${peak} quá sát trần`);
    assert.ok(rms > 0.03 && rms < 0.2, `${kind}: mức trung bình ${rms.toFixed(3)} (phải nhỏ để nằm dưới giọng đọc nhưng vẫn nghe được)`);
  }
});

test('vòng lặp liền mạch: mẫu cuối nối mượt vào mẫu đầu (không có tiếng «cạch» khi lặp)', () => {
  for (const kind of M.KINDS) {
    const { n, l } = samples(M.render(kind).wav);
    let biggest = 0;
    for (let i = 1; i < n; i += 5) biggest = Math.max(biggest, Math.abs(l[i] - l[i - 1]));
    const seam = Math.abs(l[0] - l[n - 1]);
    assert.ok(seam <= Math.max(2500, biggest * 1.2), `${kind}: chỗ nối nhảy ${seam}, bước lớn nhất trong bài ${biggest}`);
  }
});

test('ba phong cách khác nhau thật, và mỗi phong cách luôn ra đúng cùng một bản', () => {
  const a = M.KINDS.map(k => M.render(k).wav);
  assert.notDeepEqual(a[0], a[1]);
  assert.notDeepEqual(a[1], a[2]);
  assert.deepEqual(M.render('warm').wav, a[0]);
  assert.throws(() => M.render('khong-co'), /Phong cách nhạc nền không có/);
});

test('pickKind chọn ổn định theo mã video và dùng đủ cả ba phong cách', () => {
  assert.equal(M.pickKind('SS-phim'), M.pickKind('SS-phim'));
  const seen = new Set(Array.from({ length: 40 }, (_, i) => M.pickKind('SS-video-' + i)));
  assert.deepEqual([...seen].sort(), [...M.KINDS].sort());
  assert.ok(M.KINDS.includes(M.pickKind('')));
});

test('ensureTrack ghi file WAV một lần rồi dùng lại; file hỏng/trống được tạo lại', async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'pair-music-'));
  try {
    const sub = path.join(dir, 'chua-co');
    const file = await M.ensureTrack(sub, 'calm');
    assert.equal(path.basename(file), 'nhac-nen-tu-dong-calm.wav');
    const first = await fs.stat(file);
    assert.ok(first.size > 1e5);
    await new Promise(resolve => setTimeout(resolve, 20));
    assert.equal(await M.ensureTrack(sub, 'calm'), file);
    assert.equal((await fs.stat(file)).mtimeMs, first.mtimeMs, 'lần sau không ghi lại');
    await fs.writeFile(file, 'hỏng');
    await M.ensureTrack(sub, 'calm');
    assert.ok((await fs.stat(file)).size > 1e5, 'file hỏng được tạo lại');
    assert.deepEqual((await fs.readdir(sub)).filter(n => n.endsWith('.tmp')), [], 'không để lại file tạm');
    await assert.rejects(M.ensureTrack(sub, 'xx'), /Phong cách nhạc nền không có/);
  } finally { await fs.rm(dir, { recursive: true, force: true }); }
});
