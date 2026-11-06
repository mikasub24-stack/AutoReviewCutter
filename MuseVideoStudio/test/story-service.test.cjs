const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { Queue } = require('../src/queue.cjs');
const { saveOrderedOutput } = require('../src/ordered-output.cjs');
const { createStoryService, storyJobs, storyFolder } = require('../src/story-service.cjs');
const { command } = require('../src/merge.cjs');

const hasFfmpeg = spawnSync('ffmpeg', ['-version']).status === 0 && spawnSync('ffprobe', ['-version']).status === 0;
const ff = (...a) => command('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-y', ...a], 120000);

test('thư mục truyện sạch ký tự, các cảnh xếp theo số cảnh dù mảng đang lộn xộn', () => {
  assert.ok(storyFolder('C:\\Out', '../x y').endsWith(path.join('KeChuyen', 'xy')));
  assert.ok(storyFolder('/o', '').endsWith(path.join('KeChuyen', 'Truyen')));
  const jobs = [{ kind: 'story', storyId: 'A', order: 3 }, { kind: 'video', order: 1 }, { kind: 'story', storyId: 'B', order: 1 }, { kind: 'story', storyId: 'A', order: 1 }, { kind: 'story', storyId: 'A', order: 2 }];
  assert.deepEqual(storyJobs(jobs, 'A').map(j => j.order), [1, 2, 3]);
});

test('chạy 3 luồng, cảnh xong NGƯỢC thứ tự: clip vẫn đặt tên theo số cảnh và video ghép đúng thứ tự; lời ngắn thì cắt clip thừa', { skip: !hasFfmpeg && 'cần ffmpeg + ffprobe' }, async t => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'muse-story-svc-'));
  t.after(() => fs.rm(dir, { recursive: true, force: true }));
  const output = path.join(dir, 'Videos'), folder = storyFolder(output, 'T1'), colors = ['red', 'green', 'blue'];
  await fs.mkdir(folder, { recursive: true });
  const finished = [];
  const queue = new Queue({
    concurrency: 3, save: async () => {},
    run: async job => {
      await new Promise(r => setTimeout(r, (4 - job.order) * 250)); // cảnh 3 xong trước, cảnh 1 xong sau cùng
      const temp = path.join(dir, `tmp-${job.order}.mp4`);
      await ff('-f', 'lavfi', '-i', `color=c=${colors[job.order - 1]}:s=320x180:r=24:d=2`, '-f', 'lavfi', '-i', 'sine=f=300:d=2', '-c:v', 'libx264', '-c:a', 'aac', '-shortest', temp);
      const saved = await saveOrderedOutput(temp, folder, job, '.mp4');
      finished.push(job.order);
      return saved;
    }
  });
  await queue.add(colors.map((c, i) => ({ kind: 'story', storyId: 'T1', prompt: 'p' + i, voiceover: 'Lời cảnh ' + (i + 1) })));
  await queue.start('story');
  assert.deepEqual(finished, [3, 2, 1], 'cảnh xong ngược thứ tự');
  assert.deepEqual((await fs.readdir(folder)).sort(), ['001.mp4', '002.mp4', '003.mp4']);
  assert.deepEqual(queue.jobs.map(j => path.basename(j.output)), ['001.mp4', '002.mp4', '003.mp4']);

  // Lời đọc giả 1,2 giây mỗi cảnh (ngắn hơn clip 2 giây).
  const voice = {
    synth: async ({ items, dir: d }) => {
      const out = [];
      for (const item of items) { const file = path.join(d, item.id + '.wav'); await ff('-f', 'lavfi', '-i', 'sine=f=500:d=1.2', file); out.push({ id: item.id, file, seconds: 1.2 }); }
      return out;
    }
  };
  // Đảo mảng việc để chứng minh dịch vụ không dựa vào thứ tự mảng.
  const shuffled = [...queue.jobs].reverse();
  const svc = createStoryService({ getSettings: () => ({ output, ffmpeg: 'ffmpeg' }), getJobs: () => shuffled, voice, userDataDir: path.join(dir, 'ud') });
  const prep = await svc.prepare({ storyId: 'T1', engine: 'edge', voice: 'x', tempo: 1 });
  assert.deepEqual(prep.scenes.map(s => s.number), [1, 2, 3]);
  assert.deepEqual(prep.scenes.map(s => s.text), ['Lời cảnh 1', 'Lời cảnh 2', 'Lời cảnh 3']);
  for (const s of prep.scenes) { assert.ok(Math.abs(s.clipSeconds - 2) < 0.2); assert.ok(Math.abs(s.seconds - 1.6) < 0.1, 'cắt còn lời + 0,4 giây'); }
  const png = path.join(dir, 'sub.png');
  await ff('-f', 'lavfi', '-i', 'color=c=white@0.0:s=1080x1080,format=rgba', '-frames:v', '1', png);
  const bytes = await fs.readFile(png);
  const chunkFor = scene => [{ text: 'Phụ đề ' + scene.number, start: 0, end: scene.seconds, png: bytes }];
  await assert.rejects(() => svc.build({ runId: 'sai', scenes: [] }), /hết hạn/);
  await assert.rejects(() => svc.build({ runId: prep.runId, aspect: '1:1', scenes: prep.scenes.map(s => ({ id: s.id, chunks: [{ text: 'x', start: 0, end: 1, png: Buffer.from('không phải png') }] })) }), /Ảnh phụ đề không hợp lệ/);
  const done = await svc.build({ runId: prep.runId, name: 'Truyện T1', aspect: '1:1', subtitles: true, srt: true, sfx: 'low', scenes: prep.scenes.map(s => ({ id: s.id, chunks: chunkFor(s) })) });
  assert.equal(path.dirname(done.output), folder);
  assert.equal(path.basename(done.output), 'Truyện T1.mp4');
  assert.ok(Math.abs(Number(JSON.parse(await command('ffprobe', ['-v', 'error', '-show_format', '-of', 'json', done.output])).format.duration) - 4.8) < 0.4);
  assert.deepEqual(done.notes.map(n => Math.round(n.cut * 10) / 10), [0.4, 0.4, 0.4]);
  // Màu giữa mỗi cảnh phải là đỏ → xanh lá → xanh dương (đúng thứ tự cảnh).
  const colorAt = sec => { const g = spawnSync('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-ss', String(sec), '-i', done.output, '-frames:v', '1', '-vf', 'crop=10:10:(iw-10)/2:(ih-10)/2,scale=1:1,format=rgb24', '-f', 'rawvideo', '-']); return [...g.stdout]; };
  const [r1, g1, b1] = colorAt(0.8), [r2, g2, b2] = colorAt(2.4), [r3, g3, b3] = colorAt(4.0);
  assert.ok(r1 > 150 && g1 < 90 && b1 < 90, `cảnh 1 phải đỏ: ${r1},${g1},${b1}`);
  assert.ok(g2 > 90 && r2 < 90 && b2 < 90, `cảnh 2 phải xanh lá: ${r2},${g2},${b2}`);
  assert.ok(b3 > 150 && r3 < 90 && g3 < 90, `cảnh 3 phải xanh dương: ${r3},${g3},${b3}`);
  const srt = await fs.readFile(done.srt, 'utf8');
  assert.ok(srt.indexOf('Phụ đề 1') < srt.indexOf('Phụ đề 2') && srt.indexOf('Phụ đề 2') < srt.indexOf('Phụ đề 3'));
  assert.match(srt, /2\n00:00:01,600 --> 00:00:03,200\nPhụ đề 2/);
  // Không có giọng: clip giữ nguyên 2 giây mỗi cảnh.
  const silent = createStoryService({ getSettings: () => ({ output, ffmpeg: 'ffmpeg' }), getJobs: () => queue.jobs, voice, userDataDir: path.join(dir, 'ud2') });
  const plain = await silent.prepare({ storyId: 'T1', engine: 'none' });
  assert.ok(plain.scenes.every(s => Math.abs(s.seconds - 2) < 0.2));
});

test('còn cảnh chưa xong thì không xuất; báo đúng số cảnh', async () => {
  const jobs = [{ kind: 'story', storyId: 'Q', order: 1, status: 'completed', output: 'a.mp4' }, { kind: 'story', storyId: 'Q', order: 2, status: 'running', output: '' }, { kind: 'story', storyId: 'Q', order: 3, status: 'failed', output: '' }];
  const svc = createStoryService({ getSettings: () => ({ output: '/o', ffmpeg: 'ffmpeg' }), getJobs: () => jobs, voice: {}, userDataDir: os.tmpdir() });
  await assert.rejects(() => svc.prepare({ storyId: 'Q', engine: 'none' }), /Còn 2 cảnh chưa có clip \(cảnh 2, 3\)/);
  assert.equal(svc.status().busy, false);
  assert.match(svc.status().error, /Còn 2 cảnh/);
  await assert.rejects(() => svc.prepare({ storyId: 'khác', engine: 'none' }), /Chưa có cảnh nào/);
});

test('Mẹo vặt: việc «ảnh» không bị tính là clip khi ghép MP4; cảnh thiếu clip báo theo số bước', async () => {
  const jobs = [
    { kind: 'story', storyId: 'T', phase: 'image', number: 1, order: 1, status: 'completed', output: 'a1.png' },
    { kind: 'story', storyId: 'T', phase: 'image', number: 2, order: 2, status: 'completed', output: 'a2.png' },
    { kind: 'story', storyId: 'T', phase: 'clip', dependsOn: 'image', number: 1, order: 3, status: 'completed', output: 'c1.mp4' },
    { kind: 'story', storyId: 'T', phase: 'clip', dependsOn: 'image', number: 2, order: 4, status: 'pending', output: '' }
  ];
  assert.deepEqual(storyJobs(jobs, 'T').map(j => j.number), [1, 2]);
  assert.ok(storyJobs(jobs, 'T').every(j => j.phase === 'clip'));
  const service = createStoryService({ getSettings: () => ({ output: os.tmpdir() }), getJobs: () => jobs, voice: {}, userDataDir: os.tmpdir() });
  await assert.rejects(service.prepare({ storyId: 'T', engine: 'none' }), /Còn 1 cảnh chưa có clip \(cảnh 2\)/);
});
