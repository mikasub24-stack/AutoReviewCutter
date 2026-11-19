const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const zlib = require('node:zlib');
const { spawnSync } = require('node:child_process');
const Geo = require('../src/maphist-geo.js');
const Plan = require('../src/maphist-plan.js');
const { createMapWriter } = require('../src/maphist-write.cjs');
const { createMapService, audioPlan, videoArgs, cleanName, FPS } = require('../src/maphist-service.cjs');
const { fakeMapMuse } = require('./fixtures/maphist-fake-muse.cjs');

const raw = JSON.parse(zlib.gunzipSync(fs.readFileSync(path.join(__dirname, '../src/assets/maphist/world.json.gz'))));
const geo = Geo.build(raw);
const sample = JSON.parse(fs.readFileSync(path.join(__dirname, 'fixtures/maphist-sample.json'), 'utf8'));
const copy = x => JSON.parse(JSON.stringify(x));

// ---------- dữ liệu bản đồ ----------
test('dữ liệu bản đồ: đủ nước + tỉnh, tra tên không phân biệt dấu/hoa thường, ưu tiên tỉnh của nước chính', () => {
  assert.ok(geo.countries.length >= 230);
  assert.equal(geo.resolve('Indonesia')[0].a3, 'IDN');
  assert.equal(geo.resolve('  viet nam ')[0].a3, 'VNM', 'bỏ dấu cách thừa, khớp tên có alias');
  assert.equal(geo.resolve('VIETNAM')[0].a3, 'VNM');
  const barat = geo.resolve('Jawa Barat', 'IDN');
  assert.equal(barat.length, 1);
  assert.equal(barat[0].kind, 'province');
  assert.equal(barat[0].a3, 'IDN');
  assert.ok(!geo.resolve('Atlantis Prime') || geo.resolve('Atlantis Prime').length === 0, 'tên lạ thì không khớp');
  assert.ok(geo.provinceNames.get('IDN').includes('Jawa Barat'));
  for (const u of geo.countries.slice(0, 20)) assert.ok(u.rings.length && u.area >= 0 && u.bb[2] >= u.bb[0]);
});

test('vùng tròn (circles) thành đơn vị B:lon,lat,km và đọc lại đúng', () => {
  const key = Geo.blobKey(35.2, 31.7, 120);
  assert.match(key, /^B:/);
  assert.deepEqual(Geo.parseBlob(key), { lon: 35.2, lat: 31.7, km: 120 });
  assert.equal(Geo.parseBlob('C:IDN'), null);
});

// ---------- kịch bản + dòng thời gian ----------
test('chuẩn hóa kịch bản mẫu: không lỗi, vùng đổi thành đơn vị, nhãn năm đúng', () => {
  const { script, issues } = Plan.normalizeScript(copy(sample), geo);
  assert.deepEqual(issues, []);
  assert.equal(script.eras.length, 3);
  assert.ok(script.eras.every(e => e.realms.every(r => r.units.length > 0)));
  assert.equal(Plan.yearLabel(-44), '44 BC');
  assert.equal(Plan.yearLabel(476), '476 AD');
  assert.equal(Plan.yearLabel(1945), '1945');
});

test('chuẩn hóa: báo vùng không có trong dữ liệu, thiếu lời đọc, năm không tăng', () => {
  const bad = copy(sample);
  bad.eras[0].realms[0].regions.push('Atlantis Prime');
  bad.eras[1].narration = '';
  const { script, issues } = Plan.normalizeScript(bad, geo);
  const text = issues.map(x => x.text).join('\n');
  assert.match(text, /Atlantis Prime/);
  assert.equal(script.eras[0].realms[0].unknown.includes('Atlantis Prime'), true);
  assert.match(text, /lời đọc/i);
});

test('dòng thời gian: intro → các giai đoạn → outro, tổng = intro + Σ giai đoạn + outro, mỗi giai đoạn đủ dài cho lời đọc', () => {
  const { script } = Plan.normalizeScript(copy(sample), geo);
  const tl = Plan.compile(script, geo, { durations: [10, 0, 14] });
  const total = tl.introEnd + tl.eras.reduce((s, e) => s + e.dur, 0) + Plan.OUTRO;
  assert.ok(Math.abs(tl.total - total) < 1e-9);
  assert.ok(tl.eras[0].dur >= 10 + Plan.LEAD, 'đủ lời đọc thật');
  assert.ok(tl.eras[1].dur >= 8.5, 'giai đoạn không có độ dài thật vẫn đủ ngắn nhất');
  assert.equal(tl.eras[0].start, tl.introEnd);
  assert.equal(tl.eras[1].start, tl.eras[0].end);
  assert.equal(Plan.stateAt(tl, 0.5).phase, 'intro');
  const mid = Plan.stateAt(tl, tl.eras[1].start + 4);
  assert.equal(mid.phase, 'era');
  assert.equal(mid.index, 1);
  assert.ok(mid.cam.span > 1 && mid.cam.span <= 360);
  assert.equal(Plan.stateAt(tl, tl.total - 1).phase, 'outro');
  assert.ok(tl.milestones.length <= 9 && tl.milestones[0].era === 0 && tl.milestones.at(-1).era === tl.eras.length - 1);
});

test('bộ đếm năm / dân số chạy tăng dần và dừng đúng số của giai đoạn', () => {
  const { script } = Plan.normalizeScript(copy(sample), geo);
  const tl = Plan.compile(script, geo, { durations: [8, 8, 8] });
  let last = -Infinity;
  for (let t = tl.introEnd; t < tl.outroStart; t += 0.25) {
    const c = Plan.counterAt(Plan.stateAt(tl, t));
    assert.ok(c.yearF >= last - 1e-9, `năm không lùi tại ${t}`);
    last = c.yearF;
  }
  for (const e of tl.eras) {
    const c = Plan.counterAt(Plan.stateAt(tl, e.end - 0.2));
    assert.equal(Math.round(c.yearF), e.year);
    assert.equal(c.pop, e.population);
  }
});

test('phụ đề từng từ: câu chia thành cụm, chỉ số từ đang đọc tăng đều và đọc hết cụm cuối', () => {
  const edited = copy(sample);
  edited.eras[0].narration = 'In 1350, the kingdom of Majapahit rose on Java. It ruled the sea lanes, and its merchants grew rich, until rivals came from far across the ocean.';
  const { script } = Plan.normalizeScript(edited, geo);
  const era = Plan.compile(script, geo, { durations: [12, 12, 12] }).eras[0];
  const chunks = Plan.chunksOf(era.narration);
  assert.ok(chunks.length >= 2, `chia ${chunks.length} cụm`);
  assert.equal(chunks.flatMap(c => c.words).map(w => w.w).join(' '), Plan.flat(era.narration), 'ghép các cụm lại đúng nguyên lời đọc');
  let lastChunk = -1, lastDone = -1;
  for (let local = 0; local <= era.dur; local += 0.1) {
    const s = Plan.subtitleAt(era, local);
    assert.ok(s.index >= lastChunk, 'cụm không lùi');
    if (s.index === lastChunk) assert.ok(s.done >= lastDone, 'từ không lùi trong cụm');
    lastChunk = s.index; lastDone = s.done;
    assert.ok(s.within >= 0 && s.within <= 1);
  }
  assert.equal(lastChunk, chunks.length - 1);
  const first = Plan.subtitleAt(era, 0);
  assert.equal(first.index, 0);
  assert.equal(first.done, 0, 'trước khi giọng bắt đầu chưa từ nào được đọc');
  assert.equal(first.entered, 0);
  const end = Plan.subtitleAt(era, era.dur);
  assert.equal(end.done, end.chunk.words.length, 'đọc hết cụm cuối');
});

test('màu pigment lấy từ cờ: có sắc, không trắng/đen', () => {
  const { pigment } = require('../src/maphist-draw.js');
  for (const realm of [{ colors: ['#ffffff', '#d62839'] }, { colors: ['#000000', '#ffffff', '#21468b'] }, { color: '#fafafa' }, { color: '#010101' }]) {
    const c = pigment(realm), n = parseInt(c.slice(1), 16), r = n >> 16, g = (n >> 8) & 255, b = n & 255, lum = (.3 * r + .59 * g + .11 * b) / 255;
    assert.match(c, /^#[0-9a-f]{6}$/);
    assert.ok(lum > .1 && lum < .66, `${c} lum=${lum}`);
  }
});

// ---------- Muse soạn kịch bản ----------
const writer = (fake, extra = {}) => createMapWriter({ ask: fake.ask, geo, delay: async () => {}, ...extra });

test('Muse soạn: dàn ý rồi các lượt ≤5 giai đoạn, đủ giai đoạn, lưu nháp sau mỗi lượt', async () => {
  const fake = fakeMapMuse({ eras: 12 }), drafts = [];
  const w = writer(fake);
  const result = await w.write({ options: { topic: 'History of Testland', minutes: 3 }, onDraft: d => drafts.push(Object.keys(d.items).length) });
  assert.equal(fake.log.outline, 1);
  assert.deepEqual(fake.log.eras, [[1, 5], [6, 10], [11, 12]]);
  assert.equal(result.script.eras.length, 12);
  assert.equal(result.script.title, 'History of Testland');
  assert.deepEqual(drafts, [0, 5, 10, 12]);
  const { issues } = Plan.normalizeScript(result.script, geo);
  assert.deepEqual(issues, []);
  assert.match(fake.log.instructions[2], /GIAI ĐOẠN NGAY TRƯỚC/, 'lượt sau biết giai đoạn ngay trước để nối màu');
  assert.equal(w.status().busy, false);
  assert.equal(w.status().done, 12);
});

test('Muse bỏ sót giai đoạn: hỏi lại chỉ phần thiếu', async () => {
  const fake = fakeMapMuse({ eras: 12, drop: (n, attempt) => n === 7 && attempt === 1 });
  const result = await writer(fake).write({ options: { topic: 'x y z', minutes: 3 } });
  assert.equal(result.script.eras.length, 12);
  assert.ok(fake.log.eras.some(([a, b]) => a === 7 && b === 7), 'lần hai chỉ xin giai đoạn 7');
  assert.match(fake.log.instructions.find(x => /từ 7 đến 7/.test(x)), /SỬA LỖI/);
});

test('vùng sai tên mãi: lượt cuối vẫn nhận (để người dùng sửa ở bước xem lại) và báo lỗi khi chuẩn hóa', async () => {
  const fake = fakeMapMuse({ eras: 12, badRegion: 4 });
  const result = await writer(fake).write({ options: { topic: 'x y z', minutes: 3 } });
  assert.equal(result.script.eras.length, 12);
  assert.equal(fake.log.eras.filter(([a, b]) => a === 4 && b === 4).length, 2, 'hỏi lại riêng giai đoạn 4 hai lần nữa (tổng 3 lượt)');
  const { issues } = Plan.normalizeScript(result.script, geo);
  assert.ok(issues.some(x => /Atlantis Prime/.test(x.text)));
});

test('Muse thiếu mãi: dừng đúng chỗ, giữ nháp; «Viết tiếp» không hỏi lại dàn ý và các lượt đã xong', async () => {
  let failing = true;
  const fake = fakeMapMuse({ eras: 12, drop: n => failing && n === 8 });
  let saved = null;
  await assert.rejects(writer(fake).write({ options: { topic: 'x y z', minutes: 3 }, onDraft: d => { saved = d; } }), e => /giai đoạn 8/.test(e.message) && /Viết tiếp/.test(e.message));
  assert.ok(saved.outline.eras.length === 12);
  assert.deepEqual(Object.keys(saved.items).map(Number).sort((a, b) => a - b), [1, 2, 3, 4, 5, 6, 7, 9, 10]);
  failing = false;
  const outlineCalls = fake.log.outline, calls = fake.log.eras.length;
  const result = await writer(fake).write({ options: { topic: 'x y z', minutes: 3 }, resume: saved });
  assert.equal(fake.log.outline, outlineCalls, 'không lập lại dàn ý');
  assert.deepEqual(fake.log.eras.slice(calls), [[8, 8], [11, 12]], 'chỉ hỏi lại giai đoạn còn thiếu, không hỏi lại giai đoạn đã đạt');
  assert.equal(result.script.eras.length, 12);
});

test('bấm Dừng khi Muse đang soạn: báo dừng, không lưu lỗi, làm tiếp được từ nháp', async () => {
  let w, saved = null, held = 0;
  const fake = fakeMapMuse({ eras: 12, hold: async (label, signal) => { held++; if (held === 3) { w.cancel(); if (signal.aborted) throw Object.assign(Error('Đã dừng.'), { name: 'AbortError' }); } } });
  w = writer(fake);
  await assert.rejects(w.write({ options: { topic: 'x y z', minutes: 3 }, onDraft: d => { saved = d; } }), e => e.name === 'AbortError');
  assert.equal(w.status().busy, false);
  assert.equal(w.status().error, '', 'dừng chủ động không phải lỗi');
  assert.ok(saved.outline && Object.keys(saved.items).length === 5);
  const result = await writer(fakeMapMuse({ eras: 12 })).write({ options: { topic: 'x y z', minutes: 3 }, resume: saved });
  assert.equal(result.script.eras.length, 12);
});

test('thiếu chủ đề / đang bận / không đủ gói thì không hỏi Muse', async () => {
  const fake = fakeMapMuse();
  await assert.rejects(writer(fake).write({ options: { topic: 'a' } }), /chủ đề/i);
  await assert.rejects(writer(fake, { isBusy: () => true }).write({ options: { topic: 'History of X' } }), /Dừng hàng đợi/);
  await assert.rejects(writer(fake, { ensureAllowed: async () => { throw Error('Cần gói Năm'); } }).write({ options: { topic: 'History of X' } }), /gói Năm/);
  assert.equal(fake.log.instructions.length, 0);
  let release; const gate = new Promise(r => { release = r; });
  const slow = writer(fakeMapMuse({ hold: () => gate }));
  const first = slow.write({ options: { topic: 'History of X', minutes: 2 } });
  await new Promise(r => setImmediate(r));
  await assert.rejects(slow.write({ options: { topic: 'History of X' } }), /đang soạn/i);
  release(); await first;
});

test('độ dài chọn 6 / 8 / 15 phút: số giai đoạn tăng theo, không vượt trần', () => {
  assert.deepEqual(Plan.LENGTHS, [6, 8, 15]);
  assert.equal(Plan.DEFAULT_MINUTES, 8);
  assert.deepEqual(Plan.LENGTHS.map(m => Plan.eraCount(m)), [23, 30, 56]);
  assert.equal(Plan.options({ minutes: 99 }).minutes, 15, 'không vượt 15 phút');
  assert.equal(Plan.options({}).minutes, 8, 'mặc định 8 phút');
  assert.ok(Plan.eraCount(15) <= Plan.MAX_ERAS);
});

test('chủ đề để trống: được phép; chủ đề quá ngắn thì báo; lời nhắc dàn ý bảo Muse tự chọn và tránh chủ đề đã làm', () => {
  assert.deepEqual(Plan.problems(Plan.options({ topic: '' })), []);
  assert.match(Plan.problems(Plan.options({ topic: 'ab' }))[0], /quá ngắn/);
  const auto = Plan.buildOutlineInstruction(Plan.options({ topic: '', minutes: 8, avoid: ['The Mongol Empire', 'Ancient Egypt'] }), { marker: 'abc', countryNames: ['Indonesia'] });
  assert.match(auto, /CHƯA chọn/);
  assert.match(auto, /TỰ CHỌN/);
  assert.match(auto, /KHÔNG chọn lại[^\n]*The Mongol Empire; Ancient Egypt/);
  assert.doesNotMatch(auto, /CHỦ ĐỀ \(chỉ là chủ đề/);
  const given = Plan.buildOutlineInstruction(Plan.options({ topic: 'The Viking Age', minutes: 8 }), { marker: 'abc', countryNames: ['Norway'] });
  assert.match(given, /CHỦ ĐỀ \(chỉ là chủ đề cần làm video[^\n]*: The Viking Age/);
  assert.doesNotMatch(given, /CHƯA chọn/);
  const raw = { country: 'Indonesia', eras: Array.from({ length: 12 }, (_, i) => ({ year: 1000 + i * 50, title: `Age ${i + 1}`, focus: 'x' })) };
  assert.throws(() => Plan.parseOutline(JSON.stringify(raw), Plan.options({ topic: '', minutes: 3 })), e => e.fixable && /title/.test(e.fix), 'chủ đề tự chọn mà thiếu title thì bắt viết lại');
});

test('Muse tự chọn chủ đề: lấy title của dàn ý làm tên video và báo ngay khi có dàn ý', async () => {
  const fake = fakeMapMuse({ eras: 12 }), seen = [];
  const result = await writer(fake).write({ options: { topic: '', minutes: 3, avoid: ['Ancient Egypt'] }, onOutline: o => seen.push(o.title) });
  assert.deepEqual(seen, ['History of Testland']);
  assert.equal(result.config.topic, 'History of Testland');
  assert.equal(result.script.eras.length, 12);
  assert.match(fake.log.instructions[0], /CHƯA chọn/);
  assert.match(fake.log.instructions[0], /Ancient Egypt/);
  assert.doesNotMatch(fake.log.instructions[1], /CHƯA chọn/, 'các lượt chi tiết dùng dàn ý, không hỏi lại chủ đề');
});

test('video 15 phút: dàn ý ~56 giai đoạn được nhận đủ, chia lượt ≤5', async () => {
  const fake = fakeMapMuse({ eras: 56 });
  const result = await writer(fake).write({ options: { topic: 'History of Testland', minutes: 15 } });
  assert.equal(result.script.eras.length, 56);
  assert.equal(fake.log.eras.length, 12);
  assert.deepEqual(fake.log.eras[11], [56, 56]);
  assert.deepEqual(Plan.normalizeScript(result.script, geo).issues, []);
  // Lệnh FFmpeg ghép âm thanh của 56 giai đoạn phải nằm dưới giới hạn dòng lệnh của Windows (32767 ký tự), kể cả đường dẫn dài.
  const long = 'C:\\Users\\Nguoi Dung Ten Rat Dai\\AppData\\Local\\Temp\\muse-map-abc123def\\';
  const voices = Array.from({ length: 56 }, (_, i) => ({ file: `${long}voice-${String(i).padStart(3, '0')}.mp3`, lead: .7, dur: 15.3 }));
  const plan = audioPlan({ voices, music: long + 'nhac-nen.mp3', total: 900, introEnd: 3.2, outroSeconds: 4.2, firstInput: 1 });
  assert.ok(plan.filters.join(';').length + plan.inputs.flat().join(' ').length < 22000, 'dòng lệnh âm thanh đủ ngắn');
});

// ---------- dựng video ----------
const ffmpegOk = spawnSync('ffmpeg', ['-version']).status === 0 && spawnSync('ffprobe', ['-version']).status === 0;
const jpeg = () => spawnSync('ffmpeg', ['-v', 'error', '-f', 'lavfi', '-i', 'color=c=0x335577:s=320x180', '-frames:v', '1', '-f', 'image2', '-c:v', 'mjpeg', 'pipe:1'], { maxBuffer: 1e7 }).stdout;
const probe = file => JSON.parse(spawnSync('ffprobe', ['-v', 'error', '-show_entries', 'stream=codec_type,nb_frames,duration:format=duration', '-of', 'json', file]).stdout);
const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'maphist-'));
const oneEra = () => { const s = copy(sample); s.eras = s.eras.slice(0, 1); return s; };
function fakeVoice(seconds = 2) {
  const calls = [];
  return { calls, async synth(opts) {
    calls.push(opts);
    fs.mkdirSync(opts.dir, { recursive: true });
    return opts.items.map(it => { const file = path.join(opts.dir, `${it.id}.wav`); spawnSync('ffmpeg', ['-v', 'error', '-y', '-f', 'lavfi', '-i', `sine=frequency=330:duration=${seconds}`, file]); return { id: it.id, file, seconds }; });
  } };
}
function fakeFrames({ stopAfter = 0, onStart } = {}) {
  const buf = jpeg();
  return async ({ timeline, fps, signal, onFrame }) => {
    onStart?.(timeline);
    const N = Math.ceil(timeline.total * fps);
    for (let i = 0; i < N; i++) {
      if (signal?.aborted) throw Object.assign(Error('Đã dừng.'), { name: 'AbortError' });
      const r = await onFrame(buf, i);
      if (r && r.stop) return { frames: i, stopped: true };
      if (stopAfter && i + 1 === stopAfter) await new Promise(r2 => setTimeout(r2, 50));
    }
    return { frames: N, stopped: false };
  };
}

test('hiệu ứng âm thanh: tín hiệu theo dòng thời gian, chữ dán theo ngôn ngữ, bộ lọc trộn thêm tiếng hiệu ứng', () => {
  const g = geo;
  const script = copy(sample); script.eras.forEach(e => { e.markers = [{ type: 'battle', name: 'X', at: [110, -7] }, { type: 'ship', name: 'Y', at: [112, -6] }]; e.routes = [{ points: [[100, -2], [110, -7]], ship: true }]; });
  const norm = lang => Plan.normalizeScript({ ...script, lang }, g).script;
  const tl = Plan.compile(norm('en'), g, { durations: script.eras.map(() => 9), fps: 30 });
  const cues = Plan.cuesOf(tl);
  assert.ok(cues.length > 20 && cues.every((c, i) => c.t >= 0 && c.t < tl.total && (i === 0 || c.t >= cues[i - 1].t)), 'đã sắp xếp theo thời gian, nằm trong video');
  const kinds = new Set(cues.map(c => c.kind));
  for (const k of ['whoosh', 'tick', 'swell', 'pop', 'boom', 'splash', 'coin', 'tada', 'sticker']) assert.ok(kinds.has(k), 'có tín hiệu ' + k);
  const stickers = cues.filter(c => c.kind === 'sticker');
  assert.equal(stickers.length, tl.eras.length, 'mỗi giai đoạn tối đa một chữ dán');
  assert.ok(stickers.every(c => c.text === 'BOOM!' && tl.eras[c.era].markers[c.marker].type === 'battle'), 'chữ dán BOOM! đi với trận đánh');
  assert.equal(Plan.cuesOf(Plan.compile(norm('de'), g, { durations: [], fps: 30 })).find(c => c.kind === 'sticker').text, 'BUMM!', 'chữ dán theo ngôn ngữ video');
  assert.ok(cues.some(c => c.kind === 'tada' && c.t >= tl.outroStart), 'nhạc kết ở màn cuối');
  // nhịp hình và tiếng dùng chung một bảng thời gian
  assert.equal(Plan.TIMING.marker0, 1.1);
  const Sfx = require('../src/maphist-sfx.cjs');
  const wav = Sfx.synth(cues, tl.total);
  assert.equal(wav.toString('ascii', 0, 4), 'RIFF'); assert.equal(wav.toString('ascii', 8, 12), 'WAVE');
  assert.equal(wav.readUInt16LE(22), 2); assert.equal(wav.readUInt32LE(24), Sfx.RATE);
  assert.equal(wav.readUInt32LE(40), wav.length - 44);
  assert.ok(Math.abs((wav.length - 44) / 4 / Sfx.RATE - tl.total) < 1, 'dài bằng cả video');
  let peak = 0, loud = 0; const n = (wav.length - 44) / 2;
  for (let i = 0; i < n; i += 7) { const v = Math.abs(wav.readInt16LE(44 + i * 2)) / 32768; if (v > peak) peak = v; if (v > .02) loud++; }
  assert.ok(peak > .3 && peak <= .86, 'đủ lớn nhưng không vỡ tiếng: ' + peak.toFixed(2));
  assert.ok(loud > 200, 'có tiếng thật');
  const silent = Sfx.synth([], 3); let max = 0; for (let i = 44; i < silent.length; i += 2) max = Math.max(max, Math.abs(silent.readInt16LE(i)));
  assert.equal(max, 0, 'không tín hiệu thì im lặng');
  const base = { total: 40, introEnd: 3.2, outroSeconds: 4.2, musicVolume: .2 };
  const only = audioPlan({ ...base, voices: [], music: '', sfx: 'fx.wav', firstInput: 1 });
  assert.ok(only.hasAudio && only.inputs.length === 1 && only.filters[0].startsWith('[1:a]') && only.filters.at(-1).endsWith('[aout]'), 'chỉ có hiệu ứng vẫn có tiếng');
  const full = audioPlan({ ...base, voices: [{ file: 'a.wav', lead: .7, dur: 10 }], music: 'm.mp3', sfx: 'fx.wav', firstInput: 1 });
  assert.ok(full.filters.some(f => /\[amain\]\[sfx\]amix/.test(f)) && full.filters.at(-1).endsWith('[aout]') && /sidechaincompress/.test(full.filters.join(';')), 'hiệu ứng trộn lên trên lời + nhạc đã hạ');
  const labels = new Set(), used = [];
  for (const f of full.filters) { for (const m of f.matchAll(/\]?\[([a-z0-9]+)\]/g)) { /* nhãn */ } }
  const outs = full.filters.map(f => (f.match(/\[([a-z0-9]+)\]$/) || [])[1]).filter(Boolean);
  assert.ok(outs.includes('amain') && outs.includes('sfx') && outs.at(-1) === 'aout', 'chuỗi nhãn đủ: ' + outs.join(','));
  assert.equal(audioPlan({ ...base, voices: [], music: '' }).hasAudio, false, 'không hiệu ứng, không lời, không nhạc thì vẫn im lặng');
});

test('kiểu hoạt hình: mặc định cho kịch bản mới, kịch bản cũ vẫn dùng được, kiểu cổ giữ lại; mọi chuỗi cần cho màn mở/kết có đủ 4 ngôn ngữ', () => {
  const g = geo;
  assert.equal(Plan.normalizeScript(copy(sample), g).script.theme, 'cartoon');
  assert.equal(Plan.normalizeScript({ ...copy(sample), theme: 'classic' }, g).script.theme, 'classic');
  assert.equal(Plan.normalizeScript({ ...copy(sample), theme: 'bậy' }, g).script.theme, 'cartoon');
  const tl = theme => Plan.compile(Plan.normalizeScript({ ...copy(sample), theme }, g).script, g, { durations: [], fps: 30 });
  assert.equal(tl('cartoon').theme, 'cartoon'); assert.equal(tl('classic').theme, 'classic');
  for (const id of ['en', 'de', 'fr', 'ru']) {
    const S = Plan.strings(id);
    for (const k of ['sub', 'est', 'fav', 'favSub']) assert.ok(typeof S[k] === 'string' && S[k].length > 1, id + '.' + k);
    assert.ok(S.stickers.battle && S.stickers.ship, id + ' stickers');
  }
  const Cart = require('../src/maphist-cartoon.js');
  assert.equal(Cart.groupDigits(17486000, ','), '17,486,000'); assert.equal(Cart.groupDigits(999, ','), '999');
  assert.deepEqual(['sail', 'crown', 'swords', 'star', 'flag', 'scroll', 'castle', 'person', 'rocket'].filter(i => !Cart.ICON_NAMES.includes(i)), [], 'đủ biểu tượng cho huy hiệu mà Muse có thể chọn');
});

test('bộ lọc âm thanh: chỉ lời / lời + nhạc có hạ nhạc khi có lời / chỉ nhạc / im lặng', () => {
  const base = { total: 40, introEnd: 3.2, outroSeconds: 4.2, musicVolume: .2 };
  const voices = [{ file: 'a.wav', lead: .7, dur: 10 }, { file: 'b.wav', lead: .7, dur: 12 }];
  const v = audioPlan({ ...base, voices, music: '' });
  assert.ok(v.hasAudio && v.filters.at(-1).endsWith('[aout]') && !v.filters.some(f => /sidechain/.test(f)));
  assert.equal(v.inputs.length, 4, 'lặng đầu + 2 lời + lặng cuối');
  assert.ok(v.filters[0].startsWith('[0:a]'), 'chỉ số đầu vào mặc định bắt đầu từ 0');
  const shifted = audioPlan({ ...base, voices, music: 'm.mp3', firstInput: 1 });
  assert.ok(shifted.filters[0].startsWith('[1:a]') && !shifted.filters.some(f => /\[0:a\]/.test(f)), 'đầu vào 0 là video nên âm thanh bắt đầu từ 1');
  const vm = audioPlan({ ...base, voices, music: 'm.mp3' });
  assert.ok(vm.filters.some(f => /sidechaincompress/.test(f)), 'nhạc tự hạ khi có lời');
  assert.ok(vm.inputs.some(i => i.includes('-stream_loop')), 'nhạc lặp cho đủ video');
  const m = audioPlan({ ...base, voices: [], music: 'm.mp3' });
  assert.ok(m.hasAudio && !m.filters.some(f => /sidechain/.test(f)));
  assert.equal(audioPlan({ ...base, voices: [], music: '' }).hasAudio, false);
  assert.ok(videoArgs({ out: 'x.mp4' }).includes('image2pipe'));
  assert.equal(cleanName('Lịch sử Việt Nam: Đại Việt!'), 'Lich-su-Viet-Nam-Dai-Viet');
  assert.equal(cleanName('???'), 'Ban-do-lich-su');
});

test('dựng video: giọng → khung → MP4 có hình + tiếng, đúng độ dài và số khung, dọn thư mục tạm', { skip: !ffmpegOk && 'cần ffmpeg + ffprobe' }, async () => {
  const dir = tmp(), voice = fakeVoice(2), progress = [], previews = [];
  const service = createMapService({ getSettings: () => ({ ffmpeg: 'ffmpeg' }), voice, renderFrames: fakeFrames(), notify: () => { const st = service.status(); progress.push(st.progress); if (st.preview) previews.push({ file: st.preview, ok: fs.existsSync(st.preview) && fs.readFileSync(st.preview)[0] === 0xff }); } });
  const result = await service.make({ runId: 'r1', dir, name: 'Thử nghiệm', config: { voice: 'en-US-GuyNeural', tempo: 1.1 }, script: oneEra() });
  assert.equal(path.basename(result.output), 'Thu-nghiem.mp4');
  assert.equal(voice.calls[0].engine, 'edge');
  assert.equal(voice.calls[0].voice, 'en-US-GuyNeural');
  assert.equal(voice.calls[0].tempo, 1.1);
  assert.equal(voice.calls[0].items[0].text, sample.eras[0].narration);
  const info = probe(result.output), streams = info.streams.map(s => s.codec_type).sort();
  assert.deepEqual(streams, ['audio', 'video']);
  const expected = Plan.INTRO + Math.max(8.5, Plan.LEAD + 2 + 1) + Plan.OUTRO;
  assert.ok(Math.abs(Number(info.format.duration) - expected) < .6, `duration ${info.format.duration} vs ${expected}`);
  assert.equal(Number(info.streams.find(s => s.codec_type === 'video').nb_frames), Math.ceil(expected * FPS));
  assert.ok(!fs.existsSync(path.join(dir, '.dang-dung')), 'xóa thư mục tạm');
  assert.equal(result.publish.title, oneEra().title, 'trả về tiêu đề đăng YouTube đúng như trên video');
  const pubFile = path.join(dir, 'tieu-de-youtube.txt');
  assert.ok(fs.existsSync(pubFile) && result.publishFile === pubFile && fs.readFileSync(pubFile, 'utf8').startsWith('TITLE\n' + oneEra().title + '\n'), 'ghi sẵn file tiêu đề cạnh video');
  assert.ok(previews.length >= 3 && previews.every(p => p.ok), 'vẽ tới đâu có khung xem trước tới đó, file đọc được ngay khi báo');
  assert.deepEqual([...new Set(previews.map(p => path.basename(p.file)))].sort(), ['xem-truoc-0.jpg', 'xem-truoc-1.jpg'], 'ghi luân phiên hai file để khung đang hiện không bị ghi đè');
  assert.equal(service.status().preview, '', 'dựng xong thì bỏ xem trước');
  assert.ok(progress.some(p => /khung hình/.test(p)) && service.status().phase === 'done' && !service.busy);
  fs.rmSync(dir, { recursive: true, force: true });
});

test('dựng video có nhạc nền: kiểm tra định dạng nhạc, tự hạ nhạc, vẫn ra MP4 hợp lệ', { skip: !ffmpegOk && 'cần ffmpeg + ffprobe' }, async () => {
  const dir = tmp(), song = path.join(dir, 'nhac.mp3');
  spawnSync('ffmpeg', ['-v', 'error', '-y', '-f', 'lavfi', '-i', 'sine=frequency=220:duration=3', song]);
  const service = createMapService({ getSettings: () => ({ ffmpeg: 'ffmpeg' }), voice: fakeVoice(2), renderFrames: fakeFrames() });
  await assert.rejects(service.make({ runId: 'r', dir, config: { voice: 'v', music: path.join(dir, 'a.txt') }, script: oneEra() }), /Nhạc nền phải là/);
  await assert.rejects(service.make({ runId: 'r', dir, config: { voice: 'v', music: path.join(dir, 'khong-co.mp3') }, script: oneEra() }), /Không mở được file nhạc/);
  const result = await service.make({ runId: 'r', dir, config: { voice: 'v', music: song, musicVolume: .3 }, script: oneEra() });
  assert.ok(probe(result.output).streams.some(s => s.codec_type === 'audio'));
  fs.rmSync(dir, { recursive: true, force: true });
});

test('dựng không giọng đọc: kiểu hoạt hình có hiệu ứng âm thanh, kiểu cổ thì im lặng', { skip: !ffmpegOk && 'cần ffmpeg + ffprobe' }, async () => {
  const dir = tmp();
  const service = createMapService({ getSettings: () => ({ ffmpeg: 'ffmpeg' }), voice: null, renderFrames: fakeFrames() });
  const classic = await service.make({ runId: 'r', dir, config: {}, script: { ...oneEra(), theme: 'classic' } });
  assert.deepEqual(probe(classic.output).streams.map(s => s.codec_type), ['video']);
  const toon = await service.make({ runId: 'r2', dir, name: 'toon', config: {}, script: oneEra() });
  const streams = probe(toon.output).streams;
  assert.deepEqual(streams.map(s => s.codec_type), ['video', 'audio'], 'kiểu hoạt hình: có tiếng hiệu ứng dù không có giọng đọc và nhạc');
  assert.ok(Math.abs(Number(streams[1].duration) - toon.seconds) < .6, 'tiếng dài bằng video');
  fs.rmSync(dir, { recursive: true, force: true });
});

test('dựng video: kịch bản rỗng / thiếu lời đọc / đang bận / không đủ gói thì báo lỗi rõ và không vẽ', async () => {
  const dir = tmp(); let drawn = 0;
  const frames = async () => { drawn++; return { frames: 0 }; };
  const service = createMapService({ getSettings: () => ({ ffmpeg: 'ffmpeg' }), voice: fakeVoice(), renderFrames: frames });
  await assert.rejects(service.make({ runId: 'r', dir, config: {}, script: { title: 'x', eras: [] } }), /chưa có giai đoạn/);
  const empty = oneEra(); empty.eras[0].narration = '';
  await assert.rejects(service.make({ runId: 'r', dir, config: {}, script: empty }), /chưa có lời đọc/);
  const locked = createMapService({ getSettings: () => ({ ffmpeg: 'ffmpeg' }), ensureAllowed: async () => { throw Error('Cần gói Năm'); }, renderFrames: frames });
  await assert.rejects(locked.make({ runId: 'r', dir, config: {}, script: oneEra() }), /gói Năm/);
  assert.equal(drawn, 0);
  fs.rmSync(dir, { recursive: true, force: true });
});

test('bấm Dừng giữa chừng: báo dừng, ffmpeg kết thúc, thư mục tạm được dọn, dựng lại được', { skip: !ffmpegOk && 'cần ffmpeg + ffprobe' }, async () => {
  const dir = tmp(); let service;
  const buf = jpeg();
  const frames = async ({ timeline, fps, signal, onFrame }) => { for (let i = 0; i < timeline.total * fps; i++) { if (i === 40) service.cancel(); if (signal.aborted) throw Object.assign(Error('Đã dừng.'), { name: 'AbortError' }); const r = await onFrame(buf, i); if (r && r.stop) return { frames: i, stopped: true }; } return {}; };
  service = createMapService({ getSettings: () => ({ ffmpeg: 'ffmpeg' }), voice: fakeVoice(), renderFrames: frames });
  await assert.rejects(service.make({ runId: 'r', dir, config: { voice: 'v' }, script: oneEra() }), e => e.name === 'AbortError');
  assert.ok(!fs.existsSync(path.join(dir, '.dang-dung')));
  assert.equal(service.busy, false);
  assert.equal(service.status().error, '', 'dừng chủ động không phải lỗi');
  const again = createMapService({ getSettings: () => ({ ffmpeg: 'ffmpeg' }), voice: fakeVoice(), renderFrames: fakeFrames() });
  const result = await again.make({ runId: 'r', dir, config: { voice: 'v' }, script: oneEra() });
  assert.ok(fs.existsSync(result.output));
  fs.rmSync(dir, { recursive: true, force: true });
});

test('nguồn khung hình trả thiếu khung: báo lỗi chứ không xuất video cụt', { skip: !ffmpegOk && 'cần ffmpeg + ffprobe' }, async () => {
  const dir = tmp(), buf = jpeg();
  const service = createMapService({ getSettings: () => ({ ffmpeg: 'ffmpeg' }), voice: fakeVoice(), renderFrames: async ({ onFrame }) => { for (let i = 0; i < 10; i++) await onFrame(buf, i); return {}; } });
  await assert.rejects(service.make({ runId: 'r', dir, config: { voice: 'v' }, script: oneEra() }), /Chỉ vẽ được 10\//);
  assert.ok(!fs.existsSync(path.join(dir, '.dang-dung')));
  fs.rmSync(dir, { recursive: true, force: true });
});

// ---------- nối vào app ----------
test('ảnh bìa 16:9: chọn giai đoạn nhiều lãnh thổ nhất, đổi ảnh theo variant, nén xuống ≤ 2 MB, ghi tệp riêng từng ảnh', { skip: !ffmpegOk && 'cần ffmpeg để tạo JPEG mẫu' }, async () => {
  const dir = tmp(), asked = [], small = jpeg();
  const service = createMapService({ getSettings: () => ({}), renderFrames: fakeFrames(), renderStill: async a => { asked.push(a); return a.quality > .8 ? Buffer.alloc(2_100_000, 1) : small; } });
  const a = await service.thumbnail({ dir, name: 'Thử', script: copy(sample), variant: 0 });
  assert.equal(path.basename(a.file), 'thumbnail-1.jpg');
  assert.ok(fs.existsSync(a.file) && fs.statSync(a.file).size <= 1.9e6, 'JPEG nhỏ hơn 2 MB (YouTube)');
  assert.ok(asked.length >= 2 && asked[0].quality > asked.at(-1).quality, 'quá nặng thì nén thêm');
  assert.equal(asked[0].variant, 0); assert.equal('title' in asked[0] || 'years' in asked[0], false, 'ảnh bìa chỉ nhận vài từ to (hook), không nhận cả tiêu đề');
  assert.equal(asked[0].hook, Plan.hookOf(sample)); assert.ok(asked[0].hook.split(' ').length <= 5 && asked[0].hook === asked[0].hook.toLocaleUpperCase('en'));
  assert.equal(asked[0].timeline.W, 1920);
  assert.equal(asked[0].timeline.H, 1080);
  assert.equal(a.count, 3, 'ba kiểu bố cục');
  const b = await service.thumbnail({ dir, name: 'Thử', script: copy(sample), variant: 1 });
  assert.equal(path.basename(b.file), 'thumbnail-2.jpg');
  assert.notEqual(b.era, a.era, 'bấm lại ra giai đoạn khác'); assert.equal(asked.at(-1).variant, 1);
  const wrapped = await service.thumbnail({ dir, name: 'Thử', script: copy(sample), variant: a.count });
  assert.equal(wrapped.variant, 0, 'hết vòng thì quay lại ảnh đầu');
  assert.equal(fs.readdirSync(dir).filter(f => f.endsWith('.tmp')).length, 0);
});

test('ảnh bìa: đòi đúng gói, không chạy khi đang dựng, báo khi thiếu bộ vẽ hoặc kịch bản rỗng', async () => {
  const dir = tmp();
  const denied = createMapService({ getSettings: () => ({}), renderFrames: fakeFrames(), renderStill: async () => Buffer.from('x'), ensureAllowed: async () => { throw Error('Cần gói Năm'); } });
  await assert.rejects(denied.thumbnail({ dir, script: copy(sample) }), /gói Năm/);
  const none = createMapService({ getSettings: () => ({}), renderFrames: fakeFrames() });
  await assert.rejects(none.thumbnail({ dir, script: copy(sample) }), /bộ vẽ ảnh bìa/);
  const ok = createMapService({ getSettings: () => ({}), renderFrames: fakeFrames(), renderStill: async () => Buffer.from('x') });
  await assert.rejects(ok.thumbnail({ dir, script: { title: 'x', eras: [] } }), /chưa có giai đoạn/i);
});

test('nhóm chủ đề: bảy nhóm, mỗi nhóm có đề tài gợi ý và một khung video mẫu riêng, nhẹ, đúng định dạng', () => {
  const spec = JSON.parse(fs.readFileSync(path.join(__dirname, '../tools/maphist-categories.json'), 'utf8'));
  assert.deepEqual(Plan.CATEGORIES.map(c => c.id), spec.map(c => c.id), 'thứ tự nhóm trong giao diện = trong bộ vẽ hình mẫu');
  assert.equal(Plan.CATEGORIES.length, 7);
  const hashes = new Set(), allTopics = new Set();
  for (const c of Plan.CATEGORIES) {
    const sp = spec.find(x => x.id === c.id);
    assert.deepEqual(c.topics, sp.topics, `${c.id}: đề tài trong giao diện = đề tài khai báo`);
    assert.ok(c.label && c.desc && c.ask, `${c.id}: đủ tên, mô tả, lời dặn Muse`);
    assert.ok(c.topics.length >= 5, `${c.id}: đủ đề tài gợi ý`);
    for (const t of c.topics) { assert.ok(Plan.problems({ topic: t }).length === 0, `${t}: đề tài hợp lệ`); allTopics.add(t); }
    assert.ok(sp.sample && sp.sample.script && sp.sample.script.eras.length >= 2, `${c.id}: có kịch bản mẫu để vẽ hình`);
    const buf = fs.readFileSync(path.join(__dirname, '../src/assets/maphist/categories', c.id + '.jpg'));
    assert.ok(buf.length > 20000 && buf.length < 150000, `${c.id}: cỡ hình ${buf.length}`);
    assert.equal(buf[0], 0xff); assert.equal(buf[1], 0xd8);
    hashes.add(require('node:crypto').createHash('sha1').update(buf).digest('hex'));
  }
  assert.equal(hashes.size, 7, 'không có hai nhóm dùng hình giống hệt nhau');
  assert.ok(allTopics.size >= 40, 'danh sách đề tài đủ dài: ' + allTopics.size);
  assert.equal(Plan.categoryOf('empire').label, 'Đế chế');
  assert.equal(Plan.categoryOf('nope'), null);
  assert.equal(Plan.options({ category: 'war' }).category, 'war');
  assert.equal(Plan.options({ category: 'nope' }).category, '', 'nhóm lạ thì bỏ');
  const ask = Plan.buildOutlineInstruction(Plan.options({ topic: '', category: 'dynasty', minutes: 8 }));
  assert.match(ask, /Triều đại/); assert.match(ask, /TRIỀU ĐẠI/); assert.match(ask, /TỰ CHỌN/);
  const own = Plan.buildOutlineInstruction(Plan.options({ topic: 'The Han Dynasty', category: 'dynasty', minutes: 8 }));
  assert.doesNotMatch(own, /CHƯA chọn đề tài/, 'đã gõ đề tài thì không bảo Muse tự chọn');
});

test('thông tin đăng YouTube: tiêu đề đúng như trên video, chương có mốc giờ thật, thẻ và mô tả trong giới hạn', () => {
  const era = (year, title) => ({ year, title, caption: 'c', narration: 'One two three four five six seven eight nine ten eleven twelve words here today.', realms: [], markers: [], routes: [] });
  const script = { title: 'The Mongol Empire: From Steppe to Superpower', subtitle: 'How a few tribes ruled half the world', country: 'Mongolia', eras: [era(1206, 'Temujin united'), era(1219, 'Khwarazm falls'), era(1241, 'Europe trembles'), era(1260, 'Empire splits'), era(1368, 'Yuan ends')] };
  const tl = Plan.compile(script, null, { durations: [14, 14, 14, 14, 14], fps: 30 });
  const pack = Plan.publishPack(script, tl);
  assert.equal(pack.title, script.title, 'đúng tiêu đề trên video');
  assert.ok(pack.title.length <= 100);
  assert.equal(pack.chapters.length, 5);
  assert.equal(pack.chapters[0].clock, '0:00', 'chương đầu phải ở 0:00 (YouTube yêu cầu)');
  for (let k = 1; k < pack.chapters.length; k++) assert.ok(pack.chapters[k].t - pack.chapters[k - 1].t >= 10, 'mỗi chương dài từ 10 giây');
  assert.match(pack.description, /Chapters\n0:00 1206: Temujin united\n/);
  assert.match(pack.description, /#History #HistoryMap #AnimatedMap #Mongolia/);
  assert.ok(pack.description.length < 5000);
  assert.ok(pack.tags.join(', ').length <= 460 && pack.tags.includes('mongolia history') && pack.tags.includes('the mongol empire'));
  assert.match(pack.text, /^TITLE\nThe Mongol Empire: From Steppe to Superpower\n\nDESCRIPTION\n/);
  assert.match(pack.text, /\nTAGS\nthe mongol empire: from steppe to superpower, /);
  assert.equal(Plan.clock(3725), '1:02:05'); assert.equal(Plan.clock(75), '1:15');
  // Quá ít chương (kịch bản ngắn) thì không in mục Chapters, tránh YouTube bỏ qua cả danh sách.
  const short = Plan.publishPack({ title: 'Tiny', eras: [era(1, 'a')] }, Plan.compile({ title: 'Tiny', eras: [era(1, 'a')] }, null, { durations: [14], fps: 30 }));
  assert.deepEqual(short.chapters, []); assert.doesNotMatch(short.description, /Chapters/);
  assert.equal(Plan.publishPack({ title: '', eras: [] }, null).title, 'History');
});

test('ngôn ngữ video: Anh, Đức, Pháp, Nga — kịch bản, nhãn năm, chữ cố định và gói YouTube đều theo ngôn ngữ', () => {
  assert.deepEqual(Plan.LANGUAGES.map(l => l.id), ['en', 'de', 'fr', 'ru']);
  assert.equal(Plan.options({}).language, 'en', 'mặc định tiếng Anh');
  assert.equal(Plan.options({ language: 'fr' }).language, 'fr');
  assert.equal(Plan.options({ language: 'xx' }).language, 'en', 'ngôn ngữ lạ thì về tiếng Anh');
  assert.equal(Plan.yearLabel(-221, 'de'), '221 v. Chr.'); assert.equal(Plan.yearLabel(300, 'fr'), '300 apr. J.-C.'); assert.equal(Plan.yearLabel(300, 'ru'), '300 н. э.'); assert.equal(Plan.yearLabel(-221), '221 BC');
  for (const l of Plan.LANGUAGES) {
    assert.match(l.voice, new RegExp('^' + l.id + '-[A-Z]{2}-')); assert.ok(l.sample.length > 40 && l.label && l.vi);
    assert.ok(l.s.thanks && l.s.bcTag && l.s.adTag && l.s.people(2500000) && l.s.people(800));
  }
  assert.equal(Plan.strings('ru').thanks, 'Спасибо за просмотр'); assert.equal(Plan.strings('de').people(2500000), '2,5 Mio. Menschen');
  // Lời nhắc gửi Muse nói rõ ngôn ngữ, tên vùng (regions) luôn giữ tiếng Anh để khớp bản đồ.
  for (const [id, name] of [['de', 'TIẾNG ĐỨC'], ['fr', 'TIẾNG PHÁP'], ['ru', 'TIẾNG NGA']]) {
    const c = Plan.options({ topic: 'History of Testland', language: id });
    assert.match(Plan.buildOutlineInstruction(c, ['Mongolia']), new RegExp(name));
    assert.match(Plan.buildErasInstruction(c, { title: 'T', country: 'Mongolia', eras: [{ year: 1, title: 'x', focus: 'f' }] }, { range: [1, 1], countryNames: ['Mongolia'] }), new RegExp(name));
  }
  assert.doesNotMatch(Plan.buildOutlineInstruction(Plan.options({ topic: 'History of Testland' }), ['Mongolia']), /TIẾNG (ĐỨC|PHÁP|NGA)/);
  // Kịch bản mang ngôn ngữ đi suốt: normalizeScript → compile → publishPack.
  const era = (year, title) => ({ year, title, caption: 'c', narration: 'Eins zwei drei vier fünf sechs sieben acht neun zehn elf zwölf Wörter heute hier.', realms: [], markers: [], routes: [] });
  for (const [id, chapters, tag] of [['de', 'Kapitel', /#Geschichte/], ['fr', 'Chapitres', /#Histoire/], ['ru', 'Главы', /#История/]]) {
    const raw = { lang: id, title: 'T', subtitle: 'S', country: 'Mongolia', eras: [era(-221, 'a'), era(300, 'b'), era(1206, 'c'), era(1219, 'd'), era(1241, 'e')] };
    const { script } = Plan.normalizeScript(raw, null);
    assert.equal(script.lang, id);
    const tl = Plan.compile(script, null, { durations: [14, 14, 14, 14, 14], fps: 30 });
    assert.equal(tl.lang, id); assert.equal(tl.eras[0].label, Plan.yearLabel(-221, id));
    const pack = Plan.publishPack(script, tl);
    assert.equal(pack.lang, id); assert.ok(pack.description.includes('\n' + chapters + '\n0:00 ' + Plan.yearLabel(-221, id) + ': a'), pack.description); assert.match(pack.description, tag);
    assert.ok(pack.tags.length >= 5 && pack.tags.join(', ').length <= 460);
  }
  assert.equal(Plan.normalizeScript({ lang: 'zz', title: 'T', eras: [] }, null).script.lang, 'en');
  // assemble ghi ngôn ngữ và lời kêu gọi đăng ký của ngôn ngữ đó.
  const out = Plan.assemble({ title: 'T', subtitle: 'S', country: 'Mongolia', eras: [{ n: 1, year: 1, title: 'x' }] }, new Map(), 'fr');
  assert.equal(out.lang, 'fr'); assert.equal(out.outro, Plan.strings('fr').subscribe);
  // Vẽ khung và dựng video dùng đúng bảng chữ, không còn chữ tiếng Anh cố định.
  const draw = fs.readFileSync(path.join(__dirname, '..', 'src', 'maphist-draw.js'), 'utf8');
  assert.match(draw, /Plan\.strings\(tl\.lang\)\.thanks/); assert.match(draw, /Plan\.strings\(tl\.lang\)\.people\(n\)/); assert.match(draw, /Plan\.strings\(tl\.lang\)\[yearF < 0 \? 'bcTag' : 'adTag'\]/);
  assert.doesNotMatch(draw, /'Thanks for watching'|\$\{people\(n\)\} people/);
  const main = fs.readFileSync(path.join(__dirname, '..', 'src', 'main.cjs'), 'utf8');
  assert.match(main, /function pickMapVoice\(wanted,language\)/); assert.match(main, /language:config\.language,voice/); assert.match(main, /language:meta\.language,avoid/);
});

test('chữ to trên ảnh bìa (hook): Muse viết hoặc lấy từ tiêu đề, 1–5 từ VIẾT HOA, bỏ mạo từ, theo ngôn ngữ', () => {
  assert.equal(Plan.hookOf({ lang: 'en', title: 'The Aztec Empire: From a Lake Island to the Fall of Tenochtitlan' }), 'AZTEC EMPIRE');
  assert.equal(Plan.hookOf({ lang: 'en', title: 'World War II', hook: 'the war that changed everything' }), 'THE WAR THAT CHANGED EVERYTHING');
  assert.equal(Plan.hookOf({ lang: 'fr', title: 'L’Empire aztèque : d’une île du lac' }), 'EMPIRE AZTÈQUE');
  assert.equal(Plan.hookOf({ lang: 'ru', title: 'Империя ацтеков: от острова на озере' }), 'ИМПЕРИЯ АЦТЕКОВ');
  assert.equal(Plan.hookOf({ lang: 'de', title: 'Das Aztekenreich - Aufstieg und Fall' }), 'AZTEKENREICH');
  assert.equal(Plan.hookOf({ lang: 'ru', title: '' }), 'ИСТОРИЯ'); assert.equal(Plan.hookOf(null), 'HISTORY');
  const long = Plan.hookOf({ lang: 'en', hook: 'one two three four five six seven eight nine' }); assert.ok(long.split(' ').length <= 5 && long.length <= 34, long);
  // Lời nhắc gửi Muse đòi «hook» ngắn bằng đúng ngôn ngữ video; kịch bản giữ lại hook qua chuẩn hóa và biên dịch.
  for (const id of ['en', 'de', 'fr', 'ru']) {
    const p = Plan.buildOutlineInstruction(Plan.options({ topic: 'History of Testland', language: id }), ['Mongolia']);
    assert.ok(p.includes('"hook"') && p.includes(Plan.langOf(id).hookExample), id);
    assert.equal(Plan.langOf(id).hookExample, Plan.langOf(id).hookExample.toLocaleUpperCase(id));
  }
  const { script } = Plan.normalizeScript({ lang: 'de', title: 'T', hook: 'Herren der Steppe', eras: [] }, null);
  assert.equal(script.hook, 'Herren der Steppe'); assert.equal(Plan.compile(script, null, { durations: [], fps: 30 }).hook, 'HERREN DER STEPPE');
  assert.equal(Plan.assemble({ title: 'T', subtitle: 'S', hook: 'Хук', country: 'X', eras: [{ n: 1, year: 1, title: 'x' }] }, new Map(), 'ru').hook, 'Хук');
});

test('tiêu đề mở đầu: tiêu đề dài tự xuống dòng (tối đa 3 dòng) và luôn vừa khung; dải tên giai đoạn không tràn', () => {
  const { titleLayout } = require('../src/maphist-draw.js');
  const ctx = { font: '', measureText(s) { return { width: s.length * Number(/(\d+)px/.exec(this.font)[1]) * .52 }; } };   // giả lập đo chữ: rộng ~0,52 × cỡ chữ mỗi ký tự
  const widest = (r) => Math.max(...r.lines.map(l => { ctx.font = `700 ${r.size}px x`; return ctx.measureText(l).width; }));
  const short = titleLayout(ctx, 'The Mongol Empire', 1560);
  assert.deepEqual(short.lines, ['The Mongol Empire']); assert.equal(short.size, 128, 'tiêu đề ngắn giữ cỡ chữ lớn nhất, một dòng');
  const mid = titleLayout(ctx, 'The Aztec Empire: Rise, Fall and the Making of Modern Mexico', 1560);
  assert.equal(mid.lines.length, 2); assert.ok(mid.size >= 90 && widest(mid) <= 1560, JSON.stringify(mid));
  const long = titleLayout(ctx, 'The Aztec Empire: From a Lake Island to the Fall of Tenochtitlan — and the Mexico It Became', 1560);
  assert.ok(long.lines.length <= 3 && long.size >= 70 && widest(long) <= 1560, JSON.stringify(long));
  assert.equal(long.lines.join(' '), 'The Aztec Empire: From a Lake Island to the Fall of Tenochtitlan — and the Mexico It Became', 'không làm rơi chữ nào');
  const huge = titleLayout(ctx, 'word '.repeat(40).trim(), 1560);
  assert.ok(huge.lines.length <= 3 && huge.size >= 40 && huge.lines.join(' ').split(' ').length === 40);
  assert.deepEqual(titleLayout(ctx, '', 1560).lines, ['']);
  // nguồn: dải tên giai đoạn thu nhỏ chữ khi quá dài (không để tràn ra ngoài khung hình)
  const draw = fs.readFileSync(path.join(__dirname, '../src/maphist-draw.js'), 'utf8');
  assert.match(draw, /MAXW - 90\) \/ textW/);
});

test('nối app: mọi lệnh giao diện gọi đều có trong main.cjs và danh sách cho phép của preload; mọi id đều có trong index.html', () => {
  const read = f => fs.readFileSync(path.join(__dirname, '../src', f), 'utf8');
  const main = read('main.cjs'), preload = read('preload.cjs'), ui = read('maphist-ui.js'), html = read('index.html');
  const handlers = new Set([...main.matchAll(/^\s{4}(map[A-Z]\w*)\s*:/gm)].map(m => m[1]));
  assert.ok(handlers.size >= 9, [...handlers].join(','));
  const called = new Set([...ui.matchAll(/call\('(map[A-Z]\w*)'/g)].map(m => m[1]));
  for (const name of called) assert.ok(handlers.has(name), `main.cjs thiếu lệnh ${name}`);
  for (const name of handlers) assert.ok(preload.includes(`'${name}'`), `preload chưa cho phép ${name}`);
  for (const name of ['storySetupVoice', 'storyListen', 'chooseMusic', 'state']) assert.ok(preload.includes(`'${name}'`) || main.includes(`${name}:`), name);
  const ids = new Set([...ui.matchAll(/\$\('(map\w+)'\)/g)].map(m => m[1]));
  for (const id of ids) assert.ok(html.includes(`id="${id}"`), `index.html thiếu id ${id}`);
  for (const id of ['mapPanel', 'navMap', 'navMapCount', 'mapEditor']) assert.ok(html.includes(`id="${id}"`), id);
  for (const file of ['maphist-geo.js', 'maphist-plan.js', 'maphist-cartoon.js', 'maphist-scenes.js', 'maphist-draw.js', 'maphist-ui.js']) assert.ok(html.includes(`src="${file}"`), file);
});

test('nối app: mọi việc tạo video bản đồ đều đòi gói Năm / Vĩnh viễn; xóa chỉ trong thư mục BanDo', () => {
  const main = fs.readFileSync(path.join(__dirname, '../src/main.cjs'), 'utf8');
  const checks = main.slice(main.indexOf('async function mapChecks'), main.indexOf('async function runMapBuild'));
  assert.match(checks, /requireLongTerm\(\)/);
  const block = name => { const i = main.indexOf(`    ${name}:`); return main.slice(i, main.indexOf('\n    },', i)); };
  for (const name of ['mapMake', 'mapRender']) assert.match(block(name), /await mapChecks\(\)/, name);
  assert.match(block('mapSaveScript'), /requireLongTerm\(\)/);
  const save = block('mapSave');
  assert.match(save, /data\?\.thumb/, 'lưu được cả thumbnail');
  assert.match(save, /meta\?\.thumb:meta\?\.output/, 'thumbnail lấy từ ảnh đã tạo, video lấy từ file đã dựng');
  assert.match(save, /extensions:thumb\?\['jpg','jpeg'\]:\['mp4'\]/);
  assert.match(main, /createMapService\(\{[^}]*ensureAllowed:\(\)=>licenseManager\.requireLongTerm\(\)/);
  assert.match(main, /createMapWriter\(\{[^}]*ensureAllowed:\(\)=>licenseManager\.requireLongTerm\(\)/);
  assert.match(main, /roots=\[path\.join\(out,'DonNha'\),path\.join\(out,'DongVat'\),path\.join\(out,'BanDo'\)\]/);
  assert.match(main, /maphist:\{\.\.\.mapState,runs:settings\.mapRuns\|\|\{\},write:mapWriter\?\.status\(\)\|\|\{\},build:mapService\?\.status\(\)\|\|\{\}\}/);
});
