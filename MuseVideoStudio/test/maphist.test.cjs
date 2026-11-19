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
  const dir = tmp(), voice = fakeVoice(2), progress = [];
  const service = createMapService({ getSettings: () => ({ ffmpeg: 'ffmpeg' }), voice, renderFrames: fakeFrames(), notify: () => progress.push(service.status().progress) });
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

test('dựng không giọng đọc: video im lặng, độ dài theo lời đọc ước lượng', { skip: !ffmpegOk && 'cần ffmpeg + ffprobe' }, async () => {
  const dir = tmp();
  const service = createMapService({ getSettings: () => ({ ffmpeg: 'ffmpeg' }), voice: null, renderFrames: fakeFrames() });
  const result = await service.make({ runId: 'r', dir, config: {}, script: oneEra() });
  assert.deepEqual(probe(result.output).streams.map(s => s.codec_type), ['video']);
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
  for (const file of ['maphist-geo.js', 'maphist-plan.js', 'maphist-draw.js', 'maphist-ui.js']) assert.ok(html.includes(`src="${file}"`), file);
});

test('nối app: mọi việc tạo video bản đồ đều đòi gói Năm / Vĩnh viễn; xóa chỉ trong thư mục BanDo', () => {
  const main = fs.readFileSync(path.join(__dirname, '../src/main.cjs'), 'utf8');
  const checks = main.slice(main.indexOf('async function mapChecks'), main.indexOf('async function runMapBuild'));
  assert.match(checks, /requireLongTerm\(\)/);
  const block = name => { const i = main.indexOf(`    ${name}:`); return main.slice(i, main.indexOf('\n    },', i)); };
  for (const name of ['mapMake', 'mapRender']) assert.match(block(name), /await mapChecks\(\)/, name);
  assert.match(block('mapSaveScript'), /requireLongTerm\(\)/);
  assert.match(main, /createMapService\(\{[^}]*ensureAllowed:\(\)=>licenseManager\.requireLongTerm\(\)/);
  assert.match(main, /createMapWriter\(\{[^}]*ensureAllowed:\(\)=>licenseManager\.requireLongTerm\(\)/);
  assert.match(main, /roots=\[path\.join\(out,'DonNha'\),path\.join\(out,'DongVat'\),path\.join\(out,'BanDo'\)\]/);
  assert.match(main, /maphist:\{\.\.\.mapState,runs:settings\.mapRuns\|\|\{\},write:mapWriter\?\.status\(\)\|\|\{\},build:mapService\?\.status\(\)\|\|\{\}\}/);
});
