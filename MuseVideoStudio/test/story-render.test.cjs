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

test('độ dài cảnh luôn tròn số khung hình (1/30 giây) để hình và tiếng bằng nhau', () => {
  for (const [clip, voice] of [[10, 1.234], [9.7, 4.567], [10, 0], [6.016, 0], [3, 7.91]]) {
    const total = r.sceneLength(clip, voice);
    assert.ok(Math.abs(total * r.FPS - Math.round(total * r.FPS)) < 1e-9, `${clip}/${voice} -> ${total}`);
  }
});

test('lệnh hình một cảnh: lớp phụ đề theo giờ và theo vị trí, giữ khung cuối khi lời dài, đúng số khung, không khung B', () => {
  const args = r.videoArgs({ clip: 'c.mp4', subs: [{ png: 's1.png', x: 100, y: 800, start: 0, end: 2 }, { png: 's2.png', x: 100, y: 800, start: 2, end: 4.4 }], clipSeconds: 10, total: 4.4, width: 1920, height: 1080, threads: 2, out: 'o.mp4' });
  const graph = args[args.indexOf('-filter_complex') + 1];
  assert.match(graph, /overlay=100:800:format=yuv420:enable='between\(t,0,2\)'/);
  assert.match(graph, /overlay=100:800:format=yuv420:enable='between\(t,2,4\.4\)'/);
  assert.ok(graph.includes('format=yuva420p'), 'ảnh phụ đề đổi sang YUV có alpha, không đổi cả khung hình');
  assert.equal(args[args.indexOf('-frames:v') + 1], '132');
  assert.ok(args.includes('-an'), 'hình không mang tiếng; tiếng nối riêng');
  assert.equal(args[args.indexOf('-bf') + 1], '0');
  assert.equal(args[args.indexOf('-preset') + 1], 'veryfast');
  assert.equal(args[args.indexOf('-threads') + 1], '2');
  const png = args.indexOf('s1.png');
  assert.equal(args[png - 5], '-framerate');
  assert.equal(args[png - 4], '2', 'ảnh phụ đề chỉ cần 2 khung mỗi giây');
  const held = r.videoArgs({ clip: 'c.mp4', clipSeconds: 2, total: 3.4, width: 1080, height: 1080, out: 'o.mp4' });
  assert.match(held[held.indexOf('-filter_complex') + 1], /tpad=stop_mode=clone:stop_duration=1\.6/);
});

test('lệnh tiếng một cảnh: giữ tiếng động nhỏ dưới giọng kể, đúng độ dài, PCM để nối liền', () => {
  const mixed = r.audioArgs({ clip: 'c.mp4', hasAudio: true, voice: 'v.wav', sfx: 0.25, total: 4.4, out: 'o.wav' });
  const graph = mixed[mixed.indexOf('-filter_complex') + 1];
  assert.match(graph, /volume=0\.25/);
  assert.match(graph, /amix=inputs=2/);
  assert.equal(mixed[mixed.indexOf('-t') + 1], '4.4');
  assert.equal(mixed[mixed.indexOf('-c:a') + 1], 'pcm_s16le');
  assert.ok(mixed.includes('-vn'), 'không giải mã hình khi chỉ lấy tiếng');
  const voiceOnly = r.audioArgs({ clip: 'c.mp4', hasAudio: false, voice: 'v.wav', sfx: 0.25, total: 3.4, out: 'o.wav' });
  assert.ok(!/amix/.test(voiceOnly[voiceOnly.indexOf('-filter_complex') + 1]), 'clip không có âm thanh thì chỉ còn giọng kể');
  const silent = r.audioArgs({ clip: 'c.mp4', hasAudio: false, voice: null, sfx: 0, total: 2, out: 'o.wav' });
  assert.ok(silent.includes('anullsrc=r=48000:cl=stereo'));
});

test('chia việc dựng theo số nhân CPU: nhiều cảnh cùng lúc, mỗi cảnh vài luồng, không vượt tổng', () => {
  assert.deepEqual(r.parallelism(1), { workers: 1, threads: 1 });
  assert.deepEqual(r.parallelism(2), { workers: 1, threads: 2 });
  assert.deepEqual(r.parallelism(8), { workers: 4, threads: 2 });
  assert.deepEqual(r.parallelism(16), { workers: 4, threads: 4 });
  for (const cores of [1, 2, 3, 4, 6, 8, 12, 24]) { const { workers, threads } = r.parallelism(cores); assert.ok(workers * threads <= Math.max(cores, 1)); }
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
  assert.ok(Math.abs(result.seconds - 5.8) < 0.05, 'tổng ' + result.seconds);
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
  assert.ok(seen.some(m => /Đang dựng 2\/2 cảnh/.test(m)) && seen.some(m => /Đang nối/.test(m)));
  // File tạm đã dọn.
  assert.deepEqual((await fs.readdir(path.join(dir, 'out'))).filter(f => f.startsWith('.story-')), []);
  // Tên trùng thì đánh số, không ghi đè.
  const again = await r.assembleStory({ scenes: [{ clip: clipB, voice: null, chunks: [] }], dir: path.join(dir, 'out'), name: 'Truyện thử: 01', aspect: '16:9', subtitles: false, srt: false, sfx: 'off' });
  assert.equal(path.basename(again.output), 'Truyện thử 01 (2).mp4');
  assert.equal(again.srt, '');
});

const ffq = (...a) => command('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-y', ...a], 120000);
const streamTimes = async file => JSON.parse(await command('ffprobe', ['-v', 'error', '-show_streams', '-of', 'json', file])).streams.map(x => [x.codec_type, Number(x.duration), Number(x.start_time)]);

test('nối nhiều cảnh độ dài lẻ: hình và tiếng cùng độ dài, không lệch dần, bắt đầu cùng lúc', { skip: !hasFfmpeg && 'cần ffmpeg + ffprobe' }, async t => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'muse-story-sync-'));
  t.after(() => fs.rm(dir, { recursive: true, force: true }));
  const scenes = [];
  for (const [i, voice] of [1.234, 2.718, 0.9, 3.141, 1.618, 2.236, 1.414, 2.05, 1.732, 0.5, 2.5, 1.111].entries()) {
    const clip = path.join(dir, `c${i}.mp4`), wav = path.join(dir, `v${i}.wav`);
    await ffq('-f', 'lavfi', '-i', `testsrc2=s=320x180:r=24:d=${3 + (i % 3)}`, '-f', 'lavfi', '-i', 'sine=f=300:d=6', '-c:v', 'libx264', '-preset', 'ultrafast', '-c:a', 'aac', '-shortest', clip);
    await ffq('-f', 'lavfi', '-i', `sine=f=${400 + i * 20}:d=${voice}`, wav);
    scenes.push({ clip, voice: wav, chunks: [] });
  }
  const done = await r.assembleStory({ scenes, dir: path.join(dir, 'out'), name: 'sync', aspect: '16:9', subtitles: false, sfx: 'low', cores: 4 });
  const expected = (await Promise.all(scenes.map(async (scene, i) => r.sceneLength((await r.probe('ffprobe', scene.clip)).duration, (await r.probe('ffprobe', scene.voice)).duration)))).reduce((x, y) => x + y, 0);
  assert.ok(Math.abs(done.expected - expected) < 1e-6);
  const times = await streamTimes(done.output);
  const v = times.find(x => x[0] === 'video'), a = times.find(x => x[0] === 'audio');
  assert.ok(Math.abs(v[1] - expected) < 1 / 30 + 1e-3, `hình ${v[1]} khác dự kiến ${expected}`);
  assert.ok(Math.abs(a[1] - expected) < 0.03, `tiếng ${a[1]} khác dự kiến ${expected}`);
  assert.ok(Math.abs(v[1] - a[1]) < 0.035, `hình ${v[1]} và tiếng ${a[1]} lệch nhau`);
  assert.ok(Math.abs(v[2]) < 1e-3 && Math.abs(a[2]) < 1e-3, `bắt đầu lệch: hình ${v[2]}, tiếng ${a[2]}`);
});

test('phụ đề cắt gọn đặt đúng vị trí; chỗ nghỉ của giọng đọc được phát hiện đúng giây', { skip: !hasFfmpeg && 'cần ffmpeg + ffprobe' }, async t => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'muse-story-pos-'));
  t.after(() => fs.rm(dir, { recursive: true, force: true }));
  const clip = path.join(dir, 'c.mp4'), box = path.join(dir, 'box.png');
  await ffq('-f', 'lavfi', '-i', 'color=c=0x202020:s=1280x720:r=24:d=3', '-c:v', 'libx264', '-an', clip);
  await ffq('-f', 'lavfi', '-i', 'color=c=red:s=200x100,format=rgba', '-frames:v', '1', box);
  const done = await r.assembleStory({ scenes: [{ clip, voice: null, chunks: [{ text: 'x', start: 0, end: 3, png: box, x: 400, y: 800 }] }], dir: path.join(dir, 'out'), aspect: '1:1', subtitles: true, sfx: 'off' });
  const pixel = (x, y) => [...spawnSync('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-ss', '1', '-i', done.output, '-frames:v', '1', '-vf', `crop=1:1:${x}:${y},format=rgb24`, '-f', 'rawvideo', '-']).stdout];
  const [r1, g1, b1] = pixel(500, 850), [r2, g2, b2] = pixel(100, 100);
  assert.ok(r1 > 180 && g1 < 80 && b1 < 80, `trong hộp phải đỏ: ${r1},${g1},${b1}`);
  assert.ok(r2 < 80 && g2 < 80 && b2 < 80, `ngoài hộp phải giữ nguyên nền tối: ${r2},${g2},${b2}`);
  // Giọng đọc 3 cụm cách nhau bởi hai khoảng lặng (giữa ở 1,4 s và 3,2 s).
  const voice = path.join(dir, 'v.wav');
  await ffq('-f', 'lavfi', '-i', 'sine=f=440:d=1.2', '-f', 'lavfi', '-i', 'anullsrc=r=44100:cl=mono:d=0.4', '-f', 'lavfi', '-i', 'sine=f=500:d=1.4', '-f', 'lavfi', '-i', 'anullsrc=r=44100:cl=mono:d=0.4', '-f', 'lavfi', '-i', 'sine=f=420:d=1', '-filter_complex', '[0][1][2][3][4]concat=n=5:v=0:a=1,aresample=44100[a]', '-map', '[a]', voice);
  const pauses = await r.voicePauses('ffmpeg', voice, 4.4);
  assert.equal(pauses.length, 2, JSON.stringify(pauses));
  assert.ok(Math.abs(pauses[0] - 1.4) < 0.08 && Math.abs(pauses[1] - 3.2) < 0.08, JSON.stringify(pauses));
  const measured = await r.measureScenes({ scenes: [{ clip, voice }] });
  assert.equal(measured[0].pauses.length, 2);
});

test('một cảnh hỏng thì dừng cả lượt, báo đúng lỗi và không để lại file tạm', { skip: !hasFfmpeg && 'cần ffmpeg + ffprobe' }, async t => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'muse-story-fail-'));
  t.after(() => fs.rm(dir, { recursive: true, force: true }));
  const good = path.join(dir, 'g.mp4');
  await ffq('-f', 'lavfi', '-i', 'testsrc=s=320x180:r=24:d=2', '-c:v', 'libx264', '-an', good);
  await assert.rejects(() => r.assembleStory({ scenes: [{ clip: good, chunks: [] }, { clip: path.join(dir, 'khong-co.mp4'), chunks: [] }], dir: path.join(dir, 'out'), subtitles: false }), /ENOENT|no such file/i);
  assert.deepEqual((await fs.readdir(path.join(dir, 'out'))).filter(f => f.startsWith('.story-')), []);
  const stopper = new AbortController(); stopper.abort();
  await assert.rejects(() => r.assembleStory({ scenes: [{ clip: good, chunks: [] }], dir: path.join(dir, 'out'), subtitles: false, signal: stopper.signal }), /Đã dừng/);
});
