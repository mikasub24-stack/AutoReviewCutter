// Chế độ «Khí tài đối đầu» của tab So sánh song song: lời nhắc riêng, điểm theo hạng mục, hình thực tế (không người que), an toàn, đăng video.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const P = require('../src/pair-plan.js');
const { createPairWriter } = require('../src/pair-write.cjs');
const { fakeMuse } = require('./fixtures/pair-fake-muse.cjs');

const GEAR_CAST = 'LEFT: a grey single-engine stealth fighter jet with a diamond-shaped intake, low-visibility roundels; RIGHT: a twin-engine light-grey stealth fighter with angled tails and large flaps; one jet each.';
function gearBible(total = 7, { topic = 'F-35 vs Su-57' } = {}) {
  const arc = Array.from({ length: total }, (_, i) => `${i + 1} | ${['INTRO', 'SPEED', 'RANGE', 'STEALTH', 'WEAPONS', 'COST', 'VERDICT'][i] || 'ROUND ' + (i + 1)} | Round ${i + 1}: how the two jets differ here. | ${i ? 60 + (i % 3) * 8 : 50} | ${i ? 70 - (i % 2) * 15 : 50}`);
  return ['TITLE: ' + topic, 'LEFT LABEL: f-35', 'RIGHT LABEL: su-57', 'METER: rating', 'EQUIPMENT: ' + GEAR_CAST, 'LESSONS:', '- Each jet fits a different mission', '- Price matters as much as speed', 'CLOSING: Which would you pick?', 'ARC:', ...arc, 'MSDONEabc123'].join('\n');
}

test('khí tài: tùy chọn mặc định là «đời sống», chế độ lạ rơi về mặc định, có 12 cặp gợi ý đủ nhãn', () => {
  assert.equal(P.options({}).mode, 'life');
  assert.equal(P.options({ mode: 'gear' }).mode, 'gear');
  assert.equal(P.options({ mode: 'weird' }).mode, 'life');
  assert.deepEqual(P.MODES, ['life', 'gear']);
  assert.equal(P.GEAR_TOPICS.length, 12);
  for (const t of P.GEAR_TOPICS) for (const l of ['en', 'vi']) {
    const x = P.gearPreset(t.id, l);
    assert.ok(x.topic && x.left && x.right && x.left !== x.right, t.id + l);
    assert.ok(x.left.length <= P.limits('en').label && x.right.length <= P.limits('en').label, 'nhãn trong giới hạn ' + t.id);
  }
  assert.equal(P.gearPreset('f35_su57', 'vi').meter, 'ĐIỂM'); assert.equal(P.gearPreset('f35_su57', 'de').meter, '', 'ngôn ngữ khác: để Muse tự viết chỉ số');
  assert.equal(new Set(P.GEAR_TOPICS.map(t => t.id)).size, 12);
});

test('khí tài: lời nhắc hồ sơ nói về khí tài, hạng mục, điểm 0-100, không có cảnh chiến sự; chế độ đời sống không đổi', () => {
  const gear = P.buildBibleInstruction({ mode: 'gear', topic: 'F-35 vs Su-57', lang: 'en', minutes: 1 }, { marker: 'x1' });
  for (const re of [/KHÍ TÀI ĐỐI ĐẦU/, /CÔNG KHAI/, /HẠNG MỤC/, /không bịa số|KHÔNG bịa số/i, /KHÔNG cảnh chiến sự/, /điểm trái 0-100/, /KHÍ TÀI: <ENGLISH/, /F-35 vs Su-57/, /MSENDx1/]) assert.match(gear, re, String(re));
  assert.doesNotMatch(gear, /người que|CONFIDENCE|Mốc 1 cả hai bên đều 100/);
  const auto = P.buildBibleInstruction({ mode: 'gear', lang: 'vi', avoid: ['F-35 vs Su-57'] }, {});
  assert.match(auto, /TỰ CHỌN một cặp khí tài/); assert.match(auto, /TRÁNH các cặp/);
  const life = P.buildBibleInstruction({ topic: 'x', lang: 'en' }, {});
  assert.match(life, /cùng một nhân vật, hai con đường/); assert.doesNotMatch(life, /KHÍ TÀI/);
  const part = P.buildPartInstruction({ mode: 'gear', lang: 'en', minutes: 1 }, { title: 'T', left: 'A', right: 'B', meter: 'RATING', cast: GEAR_CAST, arc: [{ number: 1, label: 'INTRO', summary: 's', leftScore: 50, rightScore: 50 }, { number: 2, label: 'SPEED', summary: 's', leftScore: 70, rightScore: 60 }] }, { range: [1, 2], marker: 'p1' });
  assert.match(part, /KHÍ TÀI ĐỐI ĐẦU/); assert.match(part, /đứng cạnh nhau/); assert.match(part, /KHÔNG cảnh chiến sự/); assert.match(part, /đủ 2 dòng/);
});

test('khí tài: đọc hồ sơ — mục KHÍ TÀI, mốc 1 điểm 50/50 (không ép 100), điểm từng hạng mục giữ nguyên, nhãn dự phòng đúng chế độ', () => {
  const cfg = { mode: 'gear', topic: 'F-35 vs Su-57', lang: 'en', minutes: 1 };
  const bible = P.parseBible(gearBible(7), cfg);
  assert.equal(bible.mode, 'gear'); assert.equal(bible.left, 'F-35'); assert.equal(bible.right, 'SU-57'); assert.equal(bible.meter, 'RATING');
  assert.match(bible.cast, /stealth fighter/);
  assert.deepEqual([bible.arc[0].leftScore, bible.arc[0].rightScore], [50, 50]);
  assert.ok(bible.arc.slice(1).some(r => r.leftScore !== r.rightScore) && bible.arc.every(r => r.leftScore <= 100));
  const noLabels = P.parseBible(gearBible(7).replace(/^LEFT LABEL.*\n|^RIGHT LABEL.*\n|^METER.*\n/gm, ''), { mode: 'gear', lang: 'vi', minutes: 1 });
  assert.deepEqual([noLabels.left, noLabels.right, noLabels.meter], ['KHÍ TÀI A', 'KHÍ TÀI B', 'ĐIỂM']);
  assert.throws(() => P.parseBible(gearBible(7).replace(/^EQUIPMENT.*\n/m, ''), cfg), /KHÍ TÀI/);
  // chế độ đời sống vẫn ép mốc 1 = 100/100
  const life = P.parseBible(require('./fixtures/pair-fake-muse.cjs').bibleReply(7), { lang: 'en', minutes: 1 });
  assert.deepEqual([life.arc[0].leftScore, life.arc[0].rightScore], [100, 100]); assert.equal(life.mode, 'life');
});

test('khí tài: lắp kịch bản mang chế độ + điểm khởi đầu 50; việc hàng đợi gắn mode; prompt hình thực tế, hai khí tài, không chữ, âm thanh máy', () => {
  const cfg = { mode: 'gear', topic: 'F-35 vs Su-57', lang: 'en', minutes: 1 };
  const bible = P.parseBible(gearBible(7), cfg);
  const beats = bible.arc.map(a => ({ number: a.number, label: a.label, caption: 'Cap ' + a.number, narration: 'Left jet is faster, right jet turns tighter.', frame: 'A wide airfield apron at sunrise with both jets parked side by side, the left jet on the left and the right jet on the right', left: 'The left jet taxis forward slowly and the camera tracks it', right: 'The right jet taxis forward slowly and the camera tracks it', leftScore: a.leftScore + 3, rightScore: a.rightScore }));
  const script = P.assemble(bible, beats, cfg);
  assert.equal(script.mode, 'gear'); assert.deepEqual([script.beats[0].leftScore, script.beats[0].rightScore], [50, 50]);
  const jobs = P.buildJobs(cfg, script, { storyId: 'SS-x' });
  assert.equal(jobs.length, 7 * 3); assert.ok(jobs.every(j => j.mode === 'gear'));
  const img = jobs.find(j => j.phase === 'image').prompt, clipL = jobs.find(j => j.side === 'L').prompt, clipR = jobs.find(j => j.side === 'R').prompt;
  for (const t of [img, clipL, clipR]) { assert.match(t, /EQUIPMENT/); assert.match(t, /No text, lettering/); assert.doesNotMatch(t, /stick-figure|stick figure|round white head/i); }
  assert.match(img, /side by side/); assert.match(clipL, /LEFT side of the first frame/); assert.match(clipR, /RIGHT side of the first frame/);
  assert.match(clipL, /engine, turbine, wind or mechanical sounds/); assert.match(clipL, /no explosions|no weapons hitting/i);
  const lifeJobs = P.buildJobs({ lang: 'en', minutes: 1 }, { ...script, mode: 'life', cast: 'x' }, { storyId: 'SS-y' });
  assert.ok(lifeJobs.every(j => !('mode' in j)), 'đời sống: việc không mang mode');
  assert.match(lifeJobs.find(j => j.phase === 'image').prompt, /stick-figure/);
});

test('khí tài: cảnh bị Muse chặn được làm dịu theo kiểu khí tài (không bắn, không nổ), không dùng lời đời sống', () => {
  const cfg = { mode: 'gear', lang: 'en', minutes: 1 };
  const bible = P.parseBible(gearBible(7), cfg);
  const script = P.assemble(bible, bible.arc.map(a => ({ number: a.number, label: a.label, caption: 'c', narration: 'n', frame: 'An airfield, both jets parked side by side', left: 'The left jet fires a missile at a target and explodes it in a fireball', right: 'The right jet launches rockets in combat', leftScore: 60, rightScore: 60 })), cfg);
  const clip = P.buildJobs(cfg, script, { storyId: 'SS-z' }).find(j => j.side === 'L');
  const one = P.safeRetryPrompt(clip.prompt, 1), two = P.safeRetryPrompt(one, 2);
  assert.doesNotMatch(one.split('\n').find(l => l.startsWith('ACTION')), /fires|missile|explodes|fireball|combat|target/i);
  assert.match(one, /air-show \/ museum-style display/); assert.match(two, /parked side by side at a calm outdoor display/);
  assert.equal(two.split('\n').filter(l => l.startsWith('SAFETY REWRITE:')).length, 1, 'không chồng lời dặn an toàn');
  assert.ok(P.isPolicyError('This content violates our policy'));
});

test('khí tài: chữ cố định đủ 15 ngôn ngữ; không có dấu ✓ / ✗ (đúng / sai) cho khí tài; ghi chú đăng video nhắc kiểm tra nguồn', () => {
  for (const l of P.LANGUAGES) {
    assert.ok(P.taglineOf(l.id, 'gear') && P.taglineOf(l.id, 'gear') !== P.taglineOf(l.id, 'life'), 'tagline ' + l.id);
    assert.ok(P.lessonsTitleOf(l.id, 'gear') && P.meterOf(l.id, 'gear'), l.id);
  }
  assert.equal(P.taglineOf('vi', 'life'), 'MỘT NHÂN VẬT · HAI CON ĐƯỜNG'); assert.equal(P.taglineOf('vi', 'gear'), 'ĐỐI ĐẦU · SO SÁNH THÔNG SỐ');
  const beats = [{ leftScore: 50, rightScore: 50 }, { leftScore: 90, rightScore: 40 }];
  assert.equal(P.verdictOf(beats), 'L'); assert.equal(P.verdictOf(beats, 'gear'), '', 'khí tài: không có đúng / sai');
  const cfg = { mode: 'gear', topic: 'F-35 vs Su-57', lang: 'vi', minutes: 1 };
  const bible = P.parseBible(gearBible(7), cfg);
  const script = P.assemble(bible, bible.arc.map(a => ({ number: a.number, label: a.label, caption: 'c', narration: 'n', frame: 'f'.repeat(30), left: 'l'.repeat(30), right: 'r'.repeat(30), leftScore: a.leftScore, rightScore: a.rightScore })), cfg);
  const notes = P.notesText(cfg, script, {});
  assert.match(notes, /kiểm tra lại với nguồn chính thức/); assert.match(notes, /Điểm 0–100 chỉ là đánh giá ước lượng/); assert.doesNotMatch(notes, /nuôi dạy, sức khỏe hay tài chính/);
  const pack = P.publishPack(script, { lang: 'vi', mode: 'gear', timeline: [], outroStart: 0 });
  assert.match(pack.description, /điểm số chỉ là ước lượng/); assert.ok(pack.hashtags.some(h => /KhiTai|DoiDauKhiTai/.test(h)), pack.hashtags.join(' '));
  assert.ok(pack.titles.every(t => !/Đúng|đúng và sai/i.test(t)), pack.titles.join(' | '));
  assert.ok(P.publishPack(script, { lang: 'de', mode: 'gear' }).description.includes('AI-generated'), 'ngôn ngữ khác dùng bản tiếng Anh');
  assert.equal(P.hudScript(script).mode, 'gear');
});

test('khí tài: trình viết kịch bản thật (createPairWriter) chạy trọn chế độ khí tài với Muse giả: hồ sơ, các phần, đủ mốc, mode giữ đến cuối', async () => {
  const total = 9, instructions = [];
  const ask = async (muse, instruction) => {
    instructions.push(instruction);
    if (!/Bây giờ viết CHI TIẾT các mốc/.test(instruction)) return gearBible(total);
    const [, a, b] = /các mốc (\d+) đến (\d+)/.exec(instruction).map(Number), out = ['BEATS:'];
    for (let n = a; n <= b; n++) out.push(`${n} | ROUND ${n} | Caption ${n} | The left jet is quicker while the right jet turns tighter at beat ${n}. | A wide airfield apron at sunrise, both jets parked side by side, the left jet on the left half | The left jet taxis forward slowly while the camera tracks it | The right jet taxis forward slowly while the camera tracks it | 62 | 55`);
    return out.join('\n') + '\nMSDONEabc123';
  };
  const w = createPairWriter({ ask, delay: async () => {} });
  const drafts = [];
  const result = await w.write({ options: { mode: 'gear', topic: 'F-35 vs Su-57', minutes: 1, lang: 'en' }, onDraft: d => drafts.push(d) });
  assert.equal(result.config.mode, 'gear'); assert.equal(result.config.beats, 7);
  assert.equal(result.script.beats.length, 7); assert.equal(result.script.mode, 'gear');
  assert.deepEqual([result.script.beats[0].leftScore, result.script.beats[0].rightScore], [50, 50]);
  assert.ok(instructions.every(t => /KHÍ TÀI ĐỐI ĐẦU/.test(t)), 'mọi lời nhắc đều ở chế độ khí tài');
  assert.ok(drafts.length >= 2);
  // chế độ đời sống vẫn dùng lời nhắc cũ
  const fake = fakeMuse({ total: 7 });
  await createPairWriter({ ask: fake.ask, delay: async () => {} }).write({ options: { topic: 'x', minutes: 1 } });
  assert.ok(fake.log.instructions.every(t => !/KHÍ TÀI ĐỐI ĐẦU/.test(t)));
});
