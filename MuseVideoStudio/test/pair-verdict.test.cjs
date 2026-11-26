// Kết luận ✓ / ✗ của video So sánh song song: bên có điểm cuối cao hơn là bên ✓ (chênh dưới 5 điểm thì không kết luận);
// mốc làm thumbnail đồng chiều với kết luận để số % không mâu thuẫn với dấu.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const P = require('../src/pair-plan.js');
const R = require('../src/pair-render.cjs');

const has = spawnSync('ffmpeg', ['-version']).status === 0 && spawnSync('ffprobe', ['-version']).status === 0;
const beats = list => list.map(([l, r], i) => ({ number: i + 1, label: 'AGE ' + (i + 1), caption: 'c', narration: 'n', leftScore: l, rightScore: r }));

test('kết luận: điểm cuối cao hơn là bên ✓; chênh dưới 5 điểm hoặc thiếu điểm thì không kết luận', () => {
  assert.equal(P.verdictOf(beats([[100, 100], [30, 92]])), 'R');
  assert.equal(P.verdictOf(beats([[100, 100], [88, 20]])), 'L');
  assert.equal(P.verdictOf(beats([[100, 100], [60, 63]])), '', 'chênh 3 điểm');
  assert.equal(P.verdictOf(beats([[100, 100], [60, 65]])), 'R', 'chênh đúng 5 điểm');
  assert.equal(P.verdictOf([]), '');
  assert.equal(P.verdictOf(null), '');
  assert.equal(P.verdictOf([{ number: 1 }]), '', 'thiếu điểm');
});

test('thumbnail chọn mốc cùng chiều với kết luận: bên thua từng dẫn trước một lúc không được lên ảnh với dấu ✓', () => {
  // Mốc 2: bên trái dẫn 95-20 (chênh lớn nhất) nhưng cuối video bên phải thắng 25-90.
  const list = beats([[100, 100], [95, 20], [60, 70], [25, 90]]);
  assert.equal(P.verdictOf(list), 'R');
  assert.equal(R.thumbBeat(list, 0).number, 4, 'kiểu 1 lấy mốc có bên thắng cuối video dẫn điểm và chênh nhiều nhất');
  assert.equal(R.thumbBeat(list, 2).number, 3, 'kiểu 3 lấy mốc kế tiếp cùng chiều');
  // Không có kết luận: giữ cách chọn cũ (chênh điểm nhiều nhất).
  const tie = beats([[100, 100], [95, 20], [60, 62]]);
  assert.equal(P.verdictOf(tie), '');
  assert.equal(R.thumbBeat(tie, 0).number, 2);
});

test('makePairThumbnail truyền kết luận cho bộ vẽ', { skip: has ? false : 'cần ffmpeg và ffprobe' }, async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'pair-verdict-'));
  try {
    const sample = path.join(dir, 'mau.mp4');
    const r = spawnSync('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-y', '-f', 'lavfi', '-i', 'testsrc=size=320x180:rate=30:duration=1', '-pix_fmt', 'yuv420p', sample]);
    assert.equal(r.status, 0, String(r.stderr));
    const jpg = path.join(dir, 'px.jpg');
    spawnSync('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-y', '-f', 'lavfi', '-i', 'testsrc=size=64x36:rate=1:duration=1', '-frames:v', '1', '-q:v', '5', jpg]);
    const jpeg = 'data:image/jpeg;base64,' + (await fs.readFile(jpg)).toString('base64');
    const list = beats([[100, 100], [95, 20], [25, 90]]), seen = [];
    const hud = { thumb: async o => { seen.push(o); return jpeg; } };
    const clips = list.map(b => ({ number: b.number, left: sample, right: sample }));
    const script = { title: 'One child, two paths', left: 'RAISED WITH YELLING', right: 'RAISED WITH LISTENING', meter: 'CONFIDENCE', beats: list };
    await R.makePairThumbnail({ script, config: {}, clips, hud, dir: path.join(dir, 'out'), variant: 0 });
    assert.equal(seen[0].verdict, 'R');
    assert.deepEqual([seen[0].leftScore, seen[0].rightScore], [25, 90], 'số % trên ảnh cùng chiều với dấu');
    await R.makePairThumbnail({ script: { ...script, beats: beats([[100, 100], [60, 61]]) }, config: {}, clips: clips.slice(0, 2), hud, dir: path.join(dir, 'out'), variant: 0 });
    assert.equal(seen[1].verdict, '', 'chênh quá ít thì không có dấu');
  } finally { await fs.rm(dir, { recursive: true, force: true }); }
});
