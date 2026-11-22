const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const zlib = require('node:zlib');
const { spawnSync } = require('node:child_process');
const R = require('../src/pair-render.cjs');
const Hud = require('../src/pair-hud.js');

const has = spawnSync('ffmpeg', ['-version']).status === 0 && spawnSync('ffprobe', ['-version']).status === 0;
const opts = { skip: has ? false : 'cần ffmpeg và ffprobe' };
const ff = (...args) => { const r = spawnSync('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-y', ...args]); assert.equal(r.status, 0, String(r.stderr)); };
const probe = file => JSON.parse(spawnSync('ffprobe', ['-v', 'error', '-show_format', '-show_streams', '-of', 'json', file]).stdout);

// PNG 1×1 trong suốt một nửa: đủ để kiểm đường ống dựng mà không cần trình vẽ chữ.
const crc = Buffer.alloc(0);
function png() {
  const chunk = (type, data) => {
    const body = Buffer.concat([Buffer.from(type), data]), out = Buffer.alloc(12 + data.length);
    out.writeUInt32BE(data.length, 0); body.copy(out, 4); out.writeUInt32BE(zlib.crc32(body) >>> 0, 8 + data.length);
    return out;
  };
  const header = Buffer.alloc(13); header.writeUInt32BE(1, 0); header.writeUInt32BE(1, 4); header.set([8, 6, 0, 0, 0], 8);
  const raw = zlib.deflateSync(Buffer.from([0, 255, 80, 40, 128]));
  return Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), chunk('IHDR', header), chunk('IDAT', raw), chunk('IEND', Buffer.alloc(0))]);
}
const dataUrl = () => 'data:image/png;base64,' + png().toString('base64');
const fakeHud = (log = []) => ({
  init: async o => { log.push(['init', o]); }, base: async () => dataUrl(), tag: async (n, l) => { log.push(['tag', n, l]); return dataUrl(); },
  caption: async t => { log.push(['caption', t]); return dataUrl(); },
  meterSeq: async (side, from, to) => { log.push(['meter', side, from, to]); return from === to ? [dataUrl()] : Array.from({ length: Hud.METER_FRAMES }, dataUrl); },
  intro: async () => dataUrl(), outro: async lessons => [dataUrl(), ...lessons.map(dataUrl), dataUrl()]
});

const script = {
  title: 'One child, two paths', left: 'RAISED WITH YELLING', right: 'RAISED WITH LISTENING', meter: 'CONFIDENCE', lessons: ['Stay calm', 'Listen first'], closing: 'Voices shape children.',
  beats: [1, 2].map(n => ({ number: n, label: `AGE ${n * 3}`, caption: `Caption ${n}`, narration: `Narration ${n}`, leftScore: [100, 60][n - 1], rightScore: [100, 98][n - 1] }))
};

test('độ dài mốc: theo clip dài hơn, mở rộng khi giọng dài, khớp khung hình 30 fps, có giới hạn', () => {
  assert.equal(R.beatLength(8, 0), 8);
  assert.equal(R.beatLength(8, 3), 8, 'giọng ngắn hơn clip: giữ độ dài clip');
  assert.ok(Math.abs(R.beatLength(8, 9) - (9 + R.LEAD + R.TAIL)) < 1 / 30, 'giọng dài hơn clip: giữ khung cuối cho đủ lời');
  assert.equal(R.beatLength(1, 0), 2, 'tối thiểu 2 giây');
  assert.equal(R.beatLength(8, 60), 24, 'tối đa 24 giây');
  for (const v of [0, 1.234, 6.789, 11.1]) { const s = R.beatLength(8, v); assert.equal(Math.round(s * 30), s * 30, 'tròn khung ' + s); }
  assert.ok(R.introLength(0) >= 4.5);
  assert.ok(R.introLength(8) >= 9.4);
  assert.ok(R.outroLength(0) >= 8);
  assert.ok(R.outroLength(12) >= 12 + R.LEAD + 0.4);
});

test('âm thanh tự tạo: luôn có vút + pop; pin tụt mạnh thêm tích tắc và «bam»; bên phải tăng thì «ding»; không quá độ dài mốc', () => {
  const calm = R.cuesFor({ leftScore: 100, rightScore: 100 }, { left: 100, right: 100 }, 8);
  assert.deepEqual(calm.map(c => c.kind), ['whoosh', 'pop']);
  const drop = R.cuesFor({ leftScore: 40, rightScore: 99 }, { left: 80, right: 95 }, 8);
  const kinds = drop.map(c => c.kind);
  assert.ok(kinds.filter(k => k === 'tick').length >= 3 && kinds.filter(k => k === 'tick').length <= 10);
  assert.ok(kinds.includes('sticker'), 'tụt ≥ 14 điểm có «bam»');
  assert.ok(kinds.includes('ding'), 'bên phải tăng ≥ 3 có «ding»');
  const small = R.cuesFor({ leftScore: 70, rightScore: 100 }, { left: 74, right: 100 }, 8).map(c => c.kind);
  assert.ok(small.includes('tick') && !small.includes('sticker') && !small.includes('ding'));
  assert.ok(R.cuesFor({ leftScore: 10, rightScore: 100 }, { left: 90, right: 90 }, 2).every(c => c.t < 2));
});

test('lệnh ffmpeg: chia ngang dùng hstack, chia dọc dùng vstack; ảnh chữ và pin đúng kích thước bố cục', () => {
  for (const layout of ['side', 'stack']) {
    const geo = Hud.geometry(layout);
    const args = R.beatVideoArgs({ clipL: 'L.mp4', clipR: 'R.mp4', geo, durL: 8, durR: 8, total: 8, threads: 2, out: 'out.mp4', layers: { base: 'b.png', tag: 't.png', caption: 'c.png', meterL: 'mL-%03d.png', meterR: 'mR-%03d.png' } });
    const graph = args[args.indexOf('-filter_complex') + 1];
    assert.match(graph, layout === 'stack' ? /vstack/ : /hstack/);
    assert.doesNotMatch(graph, layout === 'stack' ? /hstack/ : /vstack/);
    assert.ok(args.includes('L.mp4') && args.includes('R.mp4') && args.includes('mL-%03d.png') && args.includes('mR-%03d.png'));
    assert.equal(args.at(-1), 'out.mp4', 'tệp ra đứng cuối');
    assert.ok(args.indexOf('out.mp4') > args.lastIndexOf('-i'), 'mọi đầu vào đứng trước tệp ra');
    assert.match(args.join(' '), /-framerate 10/, 'chuỗi ảnh pin chạy 10 khung/giây');
    assert.match(graph, new RegExp(`scale=${geo.half.L.w}:${geo.half.L.h}`));
  }
  const final = R.finalArgs({ videoList: 'v.txt', audioList: 'a.txt', music: '', total: 30, out: 'f.mp4' });
  assert.ok(!final.join(' ').includes('amix'), 'không nhạc thì không trộn nhạc');
  const withMusic = R.finalArgs({ videoList: 'v.txt', audioList: 'a.txt', music: 'm.mp3', musicVolume: 0.2, total: 30, out: 'f.mp4' });
  assert.ok(withMusic.includes('m.mp3'));
  assert.match(withMusic.join(' '), /volume=0\.2/);
  assert.equal(withMusic.at(-1), 'f.mp4');
});

test('dựng kiểm tra đầu vào: thiếu kịch bản, thiếu clip, nhạc sai đuôi hay không mở được đều báo rõ trước khi chạy ffmpeg', async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'pair-render-in-'));
  try {
    await assert.rejects(R.assemblePair({ script: { beats: [] }, clips: [], hud: fakeHud(), dir }), /Chưa có kịch bản/);
    await assert.rejects(R.assemblePair({ script, clips: [{ number: 1, left: 'a.mp4', right: 'b.mp4' }], hud: fakeHud(), dir }), /chưa có đủ hai clip \(2\)/);
    const clips = [1, 2].map(n => ({ number: n, left: 'a.mp4', right: 'b.mp4' }));
    await assert.rejects(R.assemblePair({ script, clips, config: { music: path.join(dir, 'x.txt') }, hud: fakeHud(), dir }), /Nhạc nền phải là/);
    await assert.rejects(R.assemblePair({ script, clips, config: { music: path.join(dir, 'khong-co.mp3') }, hud: fakeHud(), dir }), /Không mở được file nhạc nền/);
  } finally { await fs.rm(dir, { recursive: true, force: true }); }
});

async function workspace() {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'pair-render-'));
  const clips = [];
  for (const n of [1, 2]) {
    const left = path.join(dir, `L${n}.mp4`), right = path.join(dir, `R${n}.mp4`);
    // bên trái có tiếng, bên phải câm: kiểm cả hai đường âm thanh
    ff('-f', 'lavfi', '-i', 'testsrc2=size=320x180:rate=24', '-f', 'lavfi', '-i', 'sine=frequency=330:sample_rate=44100', '-t', '2', '-shortest', '-pix_fmt', 'yuv420p', '-c:v', 'libx264', '-c:a', 'aac', left);
    ff('-f', 'lavfi', '-i', 'smptebars=size=320x180:rate=24', '-t', '2', '-pix_fmt', 'yuv420p', '-c:v', 'libx264', right);
    clips.push({ number: n, left, right });
  }
  const voices = [];
  for (const id of ['intro', 'b1', 'b2', 'outro']) { const file = path.join(dir, `v-${id}.wav`); ff('-f', 'lavfi', '-i', 'sine=frequency=520:sample_rate=24000', '-t', '1.5', file); voices.push({ id, file, seconds: 1.5 }); }
  const voice = { calls: [], synth: async function (o) { this.calls.push(o); return o.items.map(i => voices.find(v => v.id === i.id)).filter(Boolean); } };
  return { dir, clips, voice };
}

for (const layout of ['side', 'stack']) {
  test(`dựng thật bằng ffmpeg (${layout}): mở đầu + hai mốc + kết, đúng khung hình, có tiếng, đúng độ dài, có ảnh bìa`, opts, async () => {
    const { dir, clips, voice } = await workspace();
    try {
      const log = [], progress = [];
      const out = path.join(dir, 'out');
      const result = await R.assemblePair({ script, config: { voice: 'en-US-GuyNeural', layout, lang: 'en', tempo: 1 }, clips, hud: fakeHud(log), voice, dir: out, name: 'Thử: / một video?', onProgress: t => progress.push(t) });
      assert.equal(path.basename(result.output), 'Thử một video.mp4', 'tên tệp an toàn');
      assert.equal(result.beats, 2);
      const info = probe(result.output);
      const v = info.streams.find(s => s.codec_type === 'video'), a = info.streams.find(s => s.codec_type === 'audio');
      assert.deepEqual([v.width, v.height], layout === 'stack' ? [1080, 1920] : [1920, 1080]);
      assert.ok(a, 'có luồng âm thanh');
      assert.ok(Math.abs(Number(info.format.duration) - result.expected) < 0.25, `dài ${info.format.duration}s, mong đợi ${result.expected}s`);
      assert.ok(Math.abs(result.expected - (result.intro + result.outro + 2 * R.beatLength(2, 1.5))) < 0.01, 'tổng = mở đầu + các mốc + kết');
      assert.ok((await fs.stat(result.cover)).size > 1000, 'ảnh bìa');
      // mốc giờ từng mốc trong video thành phẩm (để lập chương YouTube)
      const per = R.beatLength(2, 1.5);
      assert.deepEqual(result.timeline.map(x => x.number), [1, 2]);
      assert.ok(Math.abs(result.timeline[0].start - result.intro) < 0.01, 'mốc 1 bắt đầu ngay sau phần mở đầu');
      assert.ok(Math.abs(result.timeline[1].start - (result.intro + per)) < 0.01, 'mốc 2 bắt đầu sau mốc 1');
      assert.ok(Math.abs(result.outroStart - (result.intro + 2 * per)) < 0.01, 'thẻ bài học bắt đầu sau mốc cuối');
      assert.ok(Math.abs(result.outroStart + result.outro - result.expected) < 0.01, 'thẻ bài học kéo dài tới hết video');
      // giọng: tiêu đề, từng mốc, bài học + câu cuối được gửi đi đọc, đúng giọng đã chọn
      assert.deepEqual(voice.calls[0].items.map(i => i.id), ['intro', 'b1', 'b2', 'outro']);
      assert.equal(voice.calls[0].voice, 'en-US-GuyNeural');
      assert.equal(voice.calls[0].items.at(-1).text, 'Stay calm. Listen first. Voices shape children.');
      // vẽ chữ: khởi tạo đúng bố cục và ngôn ngữ; pin mốc 2 chạy từ 100 xuống 60 (trái) và 100 → 98 (phải)
      assert.equal(log.find(x => x[0] === 'init')[1].layout, layout);
      assert.equal(log.find(x => x[0] === 'init')[1].lang, 'en');
      assert.deepEqual(log.filter(x => x[0] === 'meter').map(x => x.slice(1)).sort(), [['L', 100, 100], ['L', 100, 60], ['R', 100, 100], ['R', 100, 98]].sort());
      assert.ok(progress.some(t => /Đang dựng 2\/2 mốc/.test(t)));
      assert.ok(progress.at(-1).includes('nối'));
      // dọn sạch thư mục tạm
      assert.deepEqual((await fs.readdir(out)).filter(f => f.startsWith('.pair-')), []);
      // không có tiếng đọc: vẫn dựng được (chỉ âm thanh clip và hiệu ứng)
      const silent = await R.assemblePair({ script, config: { layout, lang: 'en' }, clips, hud: fakeHud(), voice: null, dir: out, name: 'Không giọng', sfxEnabled: false });
      assert.ok(probe(silent.output).streams.some(s => s.codec_type === 'video'));
      assert.notEqual(silent.output, result.output);
    } finally { await fs.rm(dir, { recursive: true, force: true }); }
  });
}

test('dựng thật có nhạc nền và dừng giữa chừng không để lại tệp tạm', opts, async () => {
  const { dir, clips, voice } = await workspace();
  try {
    const music = path.join(dir, 'nhac.mp3');
    ff('-f', 'lavfi', '-i', 'sine=frequency=220:sample_rate=44100', '-t', '40', '-c:a', 'libmp3lame', music);
    const out = path.join(dir, 'out');
    const result = await R.assemblePair({ script, config: { voice: 'v', layout: 'side', lang: 'en', music, musicVolume: 0.3 }, clips, hud: fakeHud(), voice, dir: out, name: 'Có nhạc' });
    assert.ok(probe(result.output).streams.some(s => s.codec_type === 'audio'));
    const ctrl = new AbortController();
    const running = R.assemblePair({ script, config: { layout: 'side', lang: 'en' }, clips, hud: fakeHud(), voice: null, dir: out, name: 'Bị dừng', signal: ctrl.signal, onProgress: t => { if (/Đang dựng 0/.test(t)) ctrl.abort(); } });
    await assert.rejects(running, e => e.name === 'AbortError' || /dừng|abort/i.test(e.message));
    assert.deepEqual((await fs.readdir(out)).filter(f => f.startsWith('.pair-')), [], 'dọn thư mục tạm khi dừng');
    assert.ok(!(await fs.readdir(out)).some(f => f.startsWith('Bị dừng')), 'không để lại video dở');
  } finally { await fs.rm(dir, { recursive: true, force: true }); }
});

// ---- Thumbnail 16:9
const jpegUrl = dir => { const f = path.join(dir, 'px.jpg'); ff('-f', 'lavfi', '-i', 'testsrc=size=64x36:rate=1:duration=1', '-frames:v', '1', '-q:v', '5', f); return require('node:fs').promises.readFile(f).then(b => 'data:image/jpeg;base64,' + b.toString('base64')); };
const thumbScript = {
  ...script,
  beats: [{ number: 1, leftScore: 100, rightScore: 100 }, { number: 2, leftScore: 70, rightScore: 95 }, { number: 3, leftScore: 20, rightScore: 90 }, { number: 4, leftScore: 55, rightScore: 60 }, { number: 5, leftScore: 30, rightScore: 92 }]
    .map(b => ({ ...b, label: `AGE ${b.number}`, caption: 'c', narration: 'n' }))
};

test('thumbnail: mốc được chọn theo kiểu (chênh điểm nhiều nhất / nhiều nhì / nhiều ba; kiểu «Điểm cuối» lấy mốc cuối)', () => {
  const pick = style => R.thumbBeat(thumbScript.beats, style).number;
  assert.equal(pick(0), 3, 'chênh 70');
  assert.equal(pick(1), 5, 'mốc cuối');
  assert.equal(pick(2), 5, 'chênh 62');
  assert.equal(pick(3), 2, 'chênh 25');
  assert.equal(R.thumbBeat([thumbScript.beats[0]], 3).number, 1, 'chỉ một mốc vẫn chọn được');
  assert.equal(R.thumbBeat([{ number: 1 }, { number: 2 }], 0).number, 2, 'thiếu điểm: mốc sau cùng');
});

test('thumbnail: lấy khung hình thật từ clip trái / phải, gọi bộ vẽ đúng kiểu, ghi thumbnail-N.jpg, xoay vòng và dọn tệp tạm', opts, async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'pair-thumb-'));
  try {
    const sample = path.join(dir, 'mau.mp4');
    ff('-f', 'lavfi', '-i', 'testsrc=size=320x180:rate=30:duration=2', '-pix_fmt', 'yuv420p', sample);
    const clips = thumbScript.beats.map(b => ({ number: b.number, left: sample, right: sample }));
    const jpeg = await jpegUrl(dir), seen = [];
    const hud = { thumb: async o => { seen.push(o); return jpeg; } };
    const out = path.join(dir, 'out');
    const a = await R.makePairThumbnail({ script: thumbScript, config: { lang: 'vi' }, clips, hud, dir: out, variant: 0 });
    assert.deepEqual([a.variant, a.count, a.beat], [0, 4, 3]);
    assert.equal(path.basename(a.file), 'thumbnail-1.jpg');
    assert.equal(a.bytes, (await fs.stat(a.file)).size);
    const o = seen[0];
    assert.match(o.leftImage, /^data:image\/jpeg;base64,\/9j\//);
    assert.match(o.rightImage, /^data:image\/jpeg;base64,\/9j\//);
    assert.deepEqual([o.variant, o.title, o.left, o.right, o.meter, o.lang, o.leftScore, o.rightScore], [0, 'One child, two paths', 'RAISED WITH YELLING', 'RAISED WITH LISTENING', 'CONFIDENCE', 'vi', 20, 90]);
    const b = await R.makePairThumbnail({ script: thumbScript, config: { lang: 'en' }, clips, hud, dir: out, variant: 1 });
    assert.equal(path.basename(b.file), 'thumbnail-2.jpg');
    assert.deepEqual([seen[1].leftScore, seen[1].rightScore], [30, 92], 'kiểu «Điểm cuối»: điểm của mốc cuối');
    const c = await R.makePairThumbnail({ script: thumbScript, config: {}, clips, hud, dir: out, variant: 6 });
    assert.deepEqual([c.variant, path.basename(c.file)], [2, 'thumbnail-3.jpg'], 'vòng lại sau 4 kiểu');
    const d = await R.makePairThumbnail({ script: thumbScript, config: {}, clips, hud, dir: out, variant: -1 });
    assert.equal(d.variant, 3, 'số âm cũng không lỗi');
    assert.deepEqual((await fs.readdir(out)).sort(), ['thumbnail-1.jpg', 'thumbnail-2.jpg', 'thumbnail-3.jpg', 'thumbnail-4.jpg'], 'không để lại thư mục tạm');
    const body = await fs.readFile(a.file);
    assert.deepEqual([body[0], body[1]], [0xff, 0xd8]);
  } finally { await fs.rm(dir, { recursive: true, force: true }); }
});

test('thumbnail: báo lỗi rõ khi thiếu kịch bản / clip, khi bộ vẽ trả ảnh sai hay quá nặng, và không để lại tệp tạm', opts, async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'pair-thumb-bad-'));
  try {
    const sample = path.join(dir, 'mau.mp4');
    ff('-f', 'lavfi', '-i', 'testsrc=size=320x180:rate=30:duration=1', '-pix_fmt', 'yuv420p', sample);
    const clips = thumbScript.beats.map(b => ({ number: b.number, left: sample, right: sample }));
    const jpeg = await jpegUrl(dir), out = path.join(dir, 'out');
    const make = (extra = {}) => R.makePairThumbnail({ script: thumbScript, config: {}, clips, hud: { thumb: async () => jpeg }, dir: out, variant: 0, ...extra });
    await assert.rejects(make({ script: null }), /Chưa có kịch bản/);
    await assert.rejects(make({ script: { beats: [] } }), /Chưa có kịch bản/);
    await assert.rejects(make({ clips: clips.filter(c => c.number !== 3) }), /Mốc 3 chưa có đủ hai clip/);
    await assert.rejects(make({ clips: clips.map(c => c.number === 3 ? { ...c, right: '' } : c) }), /Mốc 3 chưa có đủ hai clip/);
    await assert.rejects(make({ clips: clips.map(c => ({ ...c, left: path.join(dir, 'khong-co.mp4') })) }), /./);
    await assert.rejects(make({ hud: { thumb: async () => 'data:image/png;base64,AAAA' } }), /ảnh không hợp lệ/);
    await assert.rejects(make({ hud: { thumb: async () => 'data:image/jpeg;base64,AAAA' } }), /ảnh không hợp lệ/);
    await assert.rejects(make({ hud: { thumb: async () => undefined } }), /ảnh không hợp lệ/);
    await assert.rejects(make({ hud: { thumb: async () => { throw Error('Không đọc được khung hình để làm thumbnail.'); } } }), /Không đọc được khung hình/);
    const big = 'data:image/jpeg;base64,' + Buffer.concat([Buffer.from([0xff, 0xd8]), Buffer.alloc(2.1e6, 7)]).toString('base64');
    await assert.rejects(make({ hud: { thumb: async () => big } }), /quá nặng/);
    assert.deepEqual(await fs.readdir(out), [], 'lỗi thì không để lại tệp nào');
    await assert.rejects(make({ ffmpeg: path.join(dir, 'khong-co-ffmpeg') }), /./);
  } finally { await fs.rm(dir, { recursive: true, force: true }); }
});
