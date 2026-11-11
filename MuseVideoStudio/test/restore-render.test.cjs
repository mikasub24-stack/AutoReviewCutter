const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const R = require('../src/restore-render.cjs');

const has = spawnSync('ffmpeg', ['-version']).status === 0 && spawnSync('ffprobe', ['-version']).status === 0;
const opts = { skip: has ? false : 'cần ffmpeg và ffprobe' };
const ff = (...args) => { const r = spawnSync('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-y', ...args]); assert.equal(r.status, 0, String(r.stderr)); };
const probe = file => JSON.parse(spawnSync('ffprobe', ['-v', 'error', '-show_format', '-show_streams', '-of', 'json', file]).stdout);

async function workspace() {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'restore-render-'));
  const clip = (name, source) => { const f = path.join(dir, name); ff('-f', 'lavfi', '-i', `${source}=size=320x180:rate=24`, '-t', '1', '-pix_fmt', 'yuv420p', f); return f; };
  return { dir, clip };
}

test('khung cuối thật của clip được cắt ra làm ảnh đầu clip sau', opts, async () => {
  const { dir, clip } = await workspace();
  const file = clip('a.mp4', 'testsrc2');
  const out = await R.extractLastFrame({ clip: file, out: path.join(dir, 'khung', 'a-cuoi.png') });
  assert.ok((await fs.stat(out)).size > 1000);
  assert.deepEqual(await fs.readFile(out).then(b => [...b.subarray(1, 4)]), [0x50, 0x4e, 0x47]);
  await fs.rm(dir, { recursive: true, force: true });
});

test('so khung đầu của clip với ảnh đã đưa: clip đúng ≈ 1, ảnh khác thấp hơn rõ', opts, async () => {
  const { dir, clip } = await workspace();
  const file = clip('b.mp4', 'testsrc2');
  const first = path.join(dir, 'first.png'), other = path.join(dir, 'other.png');
  ff('-i', file, '-frames:v', '1', first);
  ff('-f', 'lavfi', '-i', 'cellauto=size=320x180:rate=1:random_fill_ratio=0.4:rule=110', '-frames:v', '1', other);
  const same = await R.frameSimilarity({ clip: file, image: first });
  const diff = await R.frameSimilarity({ clip: file, image: other });
  assert.ok(same > 0.95, 'giống ' + same);
  assert.ok(diff < 0.6 && diff < same - 0.3, 'khác ' + diff);
  await fs.rm(dir, { recursive: true, force: true });
});

test('dựng ít clip: một video dọc 1080×1920 có hình và tiếng im lặng, không để lại tệp tạm', opts, async () => {
  const { dir, clip } = await workspace();
  const clips = [clip('1.mp4', 'testsrc2'), clip('2.mp4', 'smptebars'), clip('3.mp4', 'mandelbrot')];
  const steps = [];
  const out = await R.assembleRestore({ clips, dir: path.join(dir, 'out'), name: 'Dọn nhà: thử?', aspect: '9:16', onProgress: t => steps.push(t) });
  assert.equal(path.basename(out), 'Dọn nhà thử.mp4');
  const info = probe(out);
  const video = info.streams.find(s => s.codec_type === 'video'), audio = info.streams.find(s => s.codec_type === 'audio');
  assert.equal(video.width, 1080); assert.equal(video.height, 1920);
  assert.ok(audio, 'có luồng âm thanh');
  assert.ok(Math.abs(Number(info.format.duration) - (3 - 2 / 24)) < 0.25, 'dài ' + info.format.duration);   // bỏ khung trùng ở 2 chỗ nối
  const again = await R.assembleRestore({ clips, dir: path.join(dir, 'out'), name: 'Dọn nhà: thử?', aspect: '16:9' });
  assert.equal(path.basename(again), 'Dọn nhà thử (2).mp4', 'trùng tên thì thêm (2)');
  assert.equal(probe(again).streams.find(s => s.codec_type === 'video').width, 1920);
  assert.deepEqual((await fs.readdir(path.join(dir, 'out'))).filter(n => n.startsWith('.')), []);
  await fs.rm(dir, { recursive: true, force: true });
});

test('dựng nhiều clip chia thành nhiều đoạn rồi ghép, đủ thời lượng, dùng nhạc nền', opts, async () => {
  const { dir, clip } = await workspace();
  const base = [clip('1.mp4', 'testsrc2'), clip('2.mp4', 'smptebars')];
  const count = R.CHUNK * 2 + 3;
  const clips = Array.from({ length: count }, (_, i) => base[i % 2]);
  const music = path.join(dir, 'nhac.mp3');
  ff('-f', 'lavfi', '-i', 'sine=frequency=440:duration=2', '-c:a', 'libmp3lame', music);
  const steps = [];
  const out = await R.assembleRestore({ clips, dir: path.join(dir, 'out'), name: 'Dài', aspect: '16:9', music, onProgress: t => steps.push(t) });
  assert.ok(steps.some(t => /đoạn 3\/3/.test(t)), steps.join(' | '));
  const info = probe(out);
  const expect = count - (count - 1) / 24;   // mỗi chỗ nối bỏ một khung trùng
  assert.ok(Math.abs(Number(info.format.duration) - expect) < 0.5, `dài ${info.format.duration}, cần ${expect}`);
  const streams = info.streams, vd = Number(streams.find(s => s.codec_type === 'video').duration), ad = Number(streams.find(s => s.codec_type === 'audio').duration);
  assert.ok(Math.abs(vd - ad) < 0.3, `hình ${vd} và tiếng ${ad} phải dài bằng nhau`);
  assert.ok(info.streams.some(s => s.codec_type === 'audio'));
  assert.deepEqual((await fs.readdir(path.join(dir, 'out'))).filter(n => n.startsWith('.')), []);
  await fs.rm(dir, { recursive: true, force: true });
});

test('chỗ nối giữa các đoạn song song: mờ ra rồi vào, chỗ nối thường thì cắt cứng không mờ', opts, async () => {
  const { dir, clip } = await workspace();
  const base = [clip('1.mp4', 'smptebars'), clip('2.mp4', 'smptebars')];
  const clips = Array.from({ length: 6 }, (_, i) => base[i % 2]);
  const out = await R.assembleRestore({ clips, dir: path.join(dir, 'out'), name: 'Nối', aspect: '16:9', seams: [2, 4, 0, 6, 99, 'x'] });
  const info = probe(out);
  const expect = 6 - 3 / 24;   // chỉ 3 chỗ nối thường (1, 3, 5) bỏ khung trùng; 2 chỗ nối đoạn (2, 4) giữ nguyên
  assert.ok(Math.abs(Number(info.format.duration) - expect) < 0.3, `dài ${info.format.duration}, cần ${expect}`);
  const luma = t => { const r = spawnSync('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-ss', String(t), '-i', out, '-frames:v', '1', '-vf', 'scale=1:1,format=gray', '-f', 'rawvideo', '-']); assert.equal(r.status, 0, String(r.stderr)); return r.stdout[0]; };
  const seg = 1 + (1 - 1 / 24);                      // đoạn 1 gồm 2 clip, đã bỏ một khung trùng
  assert.ok(luma(seg - 0.04) < 40, 'cuối đoạn phải gần đen: ' + luma(seg - 0.04));
  assert.ok(luma(seg + 0.04) < 40, 'đầu đoạn kế phải gần đen: ' + luma(seg + 0.04));
  assert.ok(luma(seg + 0.6) > 80, 'giữa đoạn phải sáng: ' + luma(seg + 0.6));
  assert.ok(luma(0.99) > 80, 'chỗ nối thường (giữa đoạn) không được mờ: ' + luma(0.99));
  assert.deepEqual((await fs.readdir(path.join(dir, 'out'))).filter(n => n.startsWith('.')), []);
  await fs.rm(dir, { recursive: true, force: true });
});

test('thiếu clip hoặc danh sách rỗng thì báo lỗi rõ', opts, async () => {
  await assert.rejects(R.assembleRestore({ clips: [], dir: os.tmpdir() }), /Chưa có clip/);
  await assert.rejects(R.assembleRestore({ clips: ['/không/có/tệp.mp4'], dir: os.tmpdir() }), /Không thấy tệp clip/);
});
