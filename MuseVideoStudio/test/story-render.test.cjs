const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const r = require('../src/story-render.cjs');
const { command } = require('../src/merge.cjs');

const hasFfmpeg = spawnSync('ffmpeg', ['-version']).status === 0 && spawnSync('ffprobe', ['-version']).status === 0;

test('độ dài cảnh: có lời thì cắt/kéo theo lời + 0,4 giây, không lời thì giữ nguyên clip', () => {
  assert.equal(r.sceneLength(10, 4), 4.4);
  assert.equal(r.sceneLength(5, 8), 8.4);
  assert.equal(r.sceneLength(10, 0), 10);
  assert.equal(r.sceneLength(10, 0.2), r.MIN_SCENE);
  assert.throws(() => r.dimensions('4:3'), /16:9/);
  assert.deepEqual(r.dimensions('9:16'), { width: 1080, height: 1920 });
});

test('lệnh ghép một cảnh: giữ tiếng động nhỏ dưới giọng kể, có lớp phụ đề theo giờ, cắt đúng độ dài', () => {
  const args = r.segmentArgs({ clip: 'c.mp4', hasAudio: true, voice: 'v.wav', sfx: 0.25, subs: [{ png: 's1.png', start: 0, end: 2 }, { png: 's2.png', start: 2, end: 4.4 }], clipSeconds: 10, total: 4.4, width: 1920, height: 1080, out: 'o.mp4' });
  const graph = args[args.indexOf('-filter_complex') + 1];
  assert.match(graph, /volume=0\.25/);
  assert.match(graph, /amix=inputs=2/);
  assert.match(graph, /enable='between\(t,0,2\)'/);
  assert.match(graph, /enable='between\(t,2,4\.4\)'/);
  assert.ok(!/tpad/.test(graph), 'clip dài hơn lời thì không giữ khung cuối');
  assert.equal(args[args.indexOf('-t', args.indexOf('-map')) + 1], '4.4');
  const held = r.segmentArgs({ clip: 'c.mp4', hasAudio: false, voice: 'v.wav', sfx: 0.25, clipSeconds: 2, total: 3.4, width: 1080, height: 1080, out: 'o.mp4' });
  const heldGraph = held[held.indexOf('-filter_complex') + 1];
  assert.match(heldGraph, /tpad=stop_mode=clone:stop_duration=1\.4/);
  assert.ok(!/amix/.test(heldGraph), 'clip không có âm thanh thì chỉ còn giọng kể');
  const silent = r.segmentArgs({ clip: 'c.mp4', hasAudio: false, voice: null, sfx: 0, clipSeconds: 2, total: 2, width: 1080, height: 1080, out: 'o.mp4' });
  assert.ok(silent.includes('anullsrc=r=48000:cl=stereo'));
});

test('ghép thật bằng ffmpeg: cắt clip thừa, giữ khung cuối khi lời dài, phụ đề + SRT, có tiếng', { skip: !hasFfmpeg && 'cần ffmpeg + ffprobe' }, async t => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'muse-story-'));
  t.after(() => fs.rm(dir, { recursive: true, force: true }));
  const ff = (...a) => command('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-y', ...a], 120000);
  const clipA = path.join(dir, 'a.mp4'), clipB = path.join(dir, 'b.mp4'), voiceA = path.join(dir, 'a.wav'), voiceB = path.join(dir, 'b.mp3'), png = path.join(dir, 's.png');
  // Clip A: 6 giây có tiếng động; Clip B: 2 giây không có âm thanh; lời A 2 giây, lời B 3 giây.
  await ff('-f', 'lavfi', '-i', 'testsrc=s=640x360:r=24:d=6', '-f', 'lavfi', '-i', 'sine=f=300:d=6', '-c:v', 'libx264', '-c:a', 'aac', '-shortest', clipA);
  await ff('-f', 'lavfi', '-i', 'testsrc2=s=640x360:r=24:d=2', '-c:v', 'libx264', '-an', clipB);
  await ff('-f', 'lavfi', '-i', 'sine=f=800:d=2', voiceA);
  await ff('-f', 'lavfi', '-i', 'sine=f=600:d=3', voiceB);
  await ff('-f', 'lavfi', '-i', 'color=c=red@0.6:s=1920x1080,format=rgba', '-frames:v', '1', png);
  const lengths = await r.measureScenes({ scenes: [{ clip: clipA, voice: voiceA }, { clip: clipB, voice: voiceB }] });
  assert.ok(Math.abs(lengths[0].seconds - 2.4) < 0.1 && Math.abs(lengths[1].seconds - 3.4) < 0.1, JSON.stringify(lengths));
  const seen = [];
  const result = await r.assembleStory({
    scenes: [
      { clip: clipA, voice: voiceA, chunks: [{ text: 'Một', start: 0, end: 1.2, png }, { text: 'Hai', start: 1.2, end: 2.4, png }] },
      { clip: clipB, voice: voiceB, chunks: [{ text: 'Ba', start: 0, end: 3.4, png }] }
    ],
    dir: path.join(dir, 'out'), name: 'Truyện thử: 01', aspect: '1:1', subtitles: true, srt: true, sfx: 'low', onProgress: m => seen.push(m)
  });
  assert.equal(path.basename(result.output), 'Truyện thử 01.mp4');
  assert.ok(Math.abs(result.seconds - 5.8) < 0.3, 'tổng ' + result.seconds);
  assert.deepEqual(result.notes.map(n => [Math.round(n.cut), Math.round(n.hold)]), [[4, 0], [0, 1]]);
  const info = JSON.parse(await command('ffprobe', ['-v', 'error', '-show_streams', '-of', 'json', result.output]));
  const video = info.streams.find(s => s.codec_type === 'video');
  assert.equal(video.width, 1080); assert.equal(video.height, 1080);
  assert.ok(info.streams.some(s => s.codec_type === 'audio'));
  const srt = await fs.readFile(result.srt, 'utf8');
  assert.match(srt, /1\n00:00:00,000 --> 00:00:01,200\nMột/);
  assert.match(srt, /3\n00:00:02,400 --> 00:00:05,800\nBa/);
  // Phụ đề thật sự được chèn: khung đầu có màu đỏ phủ lên.
  const grab = spawnSync('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-ss', '0.5', '-i', result.output, '-frames:v', '1', '-vf', 'scale=1:1,format=rgb24', '-f', 'rawvideo', '-']);
  const [red, green, blue] = grab.stdout;
  assert.ok(red - Math.max(green, blue) > 40, `khung 0,5 giây chưa có lớp phụ đề đỏ: ${red},${green},${blue}`);
  assert.ok(seen.some(m => /Ghép cảnh 2\/2/.test(m)) && seen.some(m => /Đang nối/.test(m)));
  // File tạm đã dọn.
  assert.deepEqual((await fs.readdir(path.join(dir, 'out'))).filter(f => f.startsWith('.story-')), []);
  // Tên trùng thì đánh số, không ghi đè.
  const again = await r.assembleStory({ scenes: [{ clip: clipB, voice: null, chunks: [] }], dir: path.join(dir, 'out'), name: 'Truyện thử: 01', aspect: '16:9', subtitles: false, srt: false, sfx: 'off' });
  assert.equal(path.basename(again.output), 'Truyện thử 01 (2).mp4');
  assert.equal(again.srt, '');
});
