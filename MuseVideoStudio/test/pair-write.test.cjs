const { test } = require('node:test');
const assert = require('node:assert/strict');
const P = require('../src/pair-plan.js');
const { createPairWriter } = require('../src/pair-write.cjs');
const { fakeMuse } = require('./fixtures/pair-fake-muse.cjs');

const writer = (fake, extra = {}) => createPairWriter({ ask: fake.ask, delay: async () => {}, ...extra });

test('viết cả video 9 phút: một lượt hồ sơ rồi các lượt ≤ 8 mốc, đủ 66 mốc, lượt sau biết 2 mốc ngay trước', async () => {
  const fake = fakeMuse(), drafts = [];
  const w = writer(fake);
  const result = await w.write({ options: { topic: 'Raised with yelling', minutes: 9 }, onDraft: d => drafts.push(d.beats.length) });
  assert.equal(fake.log.bible, 1);
  assert.equal(result.script.beats.length, 66);
  assert.deepEqual(result.script.beats.map(b => b.number), Array.from({ length: 66 }, (_, i) => i + 1));
  assert.ok(fake.log.parts.every(([a, b]) => b - a + 1 <= P.PART_BEATS && b >= a));
  assert.equal(fake.log.parts[0][0], 1);
  assert.equal(fake.log.parts.at(-1)[1], 66);
  assert.equal(fake.log.parts.length, 9);
  const second = fake.log.instructions.filter(x => /Bây giờ viết CHI TIẾT/.test(x))[1];
  assert.match(second, /HAI MỐC NGAY TRƯỚC/);
  assert.match(second, /\n7 \| AGE 7 \| Caption of beat 7 \|/);
  assert.equal(result.script.title, 'Raised with yelling and raised with listening');
  assert.equal(result.script.left, 'RAISED WITH YELLING');
  assert.equal(result.config.beats, 66);
  assert.equal(result.config.lang, 'en');
  assert.ok(drafts.length >= 10, 'lưu nháp sau hồ sơ và sau mỗi lượt');
  assert.equal(drafts[0], 0);
  assert.equal(drafts.at(-1), 66);
  const status = w.status();
  assert.equal(status.busy, false);
  assert.equal(status.done, 66);
  assert.match(status.progress, /Muse đã viết xong kịch bản \(66 mốc\)/);
});

test('chủ đề trống: lời nhắc nhờ Muse tự chọn; chủ đề lấy từ tiêu đề Muse trả về', async () => {
  const fake = fakeMuse({ total: 7, topic: 'Sleeping on time and staying up late' });
  const result = await writer(fake).write({ options: { topic: '', minutes: 1, lang: 'es' } });
  assert.match(fake.log.instructions[0], /TỰ CHỌN một chủ đề/);
  assert.match(fake.log.instructions[0], /tiếng Tây Ban Nha/);
  assert.equal(result.script.title, 'Sleeping on time and staying up late');
  assert.equal(result.config.auto, true);
  assert.equal(result.script.beats.length, 7);
});

test('hồ sơ thiếu mốc ở lần đầu: hỏi lại hồ sơ kèm đúng lỗi, nhận đủ', async () => {
  const fake = fakeMuse({ total: 7, bibleSkip: [3] });
  const result = await writer(fake).write({ options: { topic: 'x', minutes: 1 } });
  assert.equal(fake.log.bible, 2);
  assert.match(fake.log.instructions[1], /SỬA LỖI/);
  assert.match(fake.log.instructions[1], /thiếu: 3/);
  assert.equal(result.script.beats.length, 7);
});

test('Muse bỏ sót hoặc viết sai mốc ở lần đầu: hỏi lại chỉ phần lỗi, nêu rõ lỗi, nhận đủ', async () => {
  const fake = fakeMuse({ total: 22, bad: (n, attempt) => attempt === 1 ? (n === 4 ? 'omit' : n === 5 ? 'short' : n === 6 ? 'long' : '') : '' });
  const result = await writer(fake).write({ options: { topic: 'x', minutes: 3 } });
  assert.equal(result.script.beats.length, 22);
  const retry = fake.log.parts.filter(([a, b]) => a === 4 && b === 6);
  assert.equal(retry.length, 1, 'lần hai chỉ xin mốc 4–6');
  const text = fake.log.instructions.find(x => /các mốc 4 đến 6/.test(x));
  assert.match(text, /SỬA LỖI/);
  assert.match(text, /Thiếu mốc: 4\./);
  assert.match(text, /Mốc 5: thiếu cột/);
  assert.match(text, /Mốc 6: LỜI ĐỌC dài/);
});

test('Muse cứ viết sai một mốc: dừng đúng chỗ, giữ bản nháp, «Viết tiếp» không hỏi lại hồ sơ và các lượt đã xong', async () => {
  let failing = true;
  const fake = fakeMuse({ total: 22, bad: n => failing && n === 11 ? 'short' : '' });
  let saved = null;
  const w = writer(fake);
  await assert.rejects(w.write({ options: { topic: 'x', minutes: 3 }, onDraft: d => { saved = d; } }), e => /thiếu hoặc sai khuôn mốc 11/.test(e.message) && /Viết tiếp/.test(e.message));
  assert.ok(saved.bible.arc.length === 22);
  assert.ok(saved.beats.some(b => b.number === 10), 'giữ các mốc đã đạt');
  assert.ok(!saved.beats.some(b => b.number === 11));
  assert.match(w.status().error, /mốc 11/);
  assert.equal(w.status().busy, false);
  failing = false;
  const before = { bible: fake.log.bible, parts: fake.log.parts.length };
  const result = await w.write({ options: { topic: 'x', minutes: 3 }, resume: saved });
  assert.equal(fake.log.bible, before.bible, 'không hỏi lại hồ sơ');
  const asked = fake.log.parts.slice(before.parts);
  assert.ok(asked.length >= 1 && asked.length <= 2);
  assert.ok(asked.every(([a]) => a >= 9), 'không hỏi lại các lượt đã xong: ' + JSON.stringify(asked));
  assert.equal(result.script.beats.length, 22);
  assert.equal(w.status().error, '');
});

test('đổi độ dài giữa chừng: hồ sơ cũ khác số mốc thì viết lại từ đầu thay vì dùng nhầm', async () => {
  const fake = fakeMuse({ total: 7 });
  const stale = { bible: { arc: Array.from({ length: 22 }, (_, i) => ({ number: i + 1 })) }, beats: [] };
  const result = await writer(fake).write({ options: { topic: 'x', minutes: 1 }, resume: stale });
  assert.equal(fake.log.bible, 1);
  assert.equal(result.script.beats.length, 7);
});

test('chia lượt đều nhau và không quá 8 mốc', () => {
  const w = writer(fakeMuse());
  for (const total of [7, 22, 37, 59, 66, 73]) {
    const r = w.rangesOf(total);
    assert.equal(r[0][0], 1);
    assert.equal(r.at(-1)[1], total);
    assert.ok(r.every(([a, b], i) => b - a + 1 <= 8 && (i === 0 || a === r[i - 1][1] + 1)), String(total));
    const sizes = r.map(([a, b]) => b - a + 1);
    assert.ok(Math.max(...sizes) - Math.min(...sizes) <= 1, 'các lượt đều nhau');
  }
});

test('dừng giữa chừng: báo đã dừng, giữ nháp; bận thì từ chối; lỗi tùy chọn báo rõ', async () => {
  const fake = fakeMuse({ total: 22 });
  let w;
  let calls = 0;
  const abortingAsk = async (...a) => { if (++calls === 3) w.cancel(); return fake.ask(...a); };
  w = createPairWriter({ ask: abortingAsk, delay: async () => {} });
  let saved = null;
  await assert.rejects(w.write({ options: { topic: 'x', minutes: 3 }, onDraft: d => { saved = d; } }), e => e.name === 'AbortError' && /Đã dừng viết kịch bản/.test(e.message));
  assert.equal(w.status().error, '', 'dừng chủ động không coi là lỗi');
  assert.ok(saved && saved.bible);
  // đang bận hàng đợi / trình duyệt
  const busy = createPairWriter({ ask: fakeMuse().ask, delay: async () => {}, isBusy: () => true });
  await assert.rejects(busy.write({ options: { minutes: 9 } }), /Dừng hàng đợi/);
  // chưa có quyền (gói không đủ) thì không gọi Muse
  let asked = 0;
  const locked = createPairWriter({ ask: async () => { asked++; return ''; }, delay: async () => {}, ensureAllowed: async () => { throw Error('Cần gói Năm'); } });
  await assert.rejects(locked.write({ options: { minutes: 9 } }), /Cần gói Năm/);
  assert.equal(asked, 0);
});

test('lỗi hạ tầng (Muse chưa nhận yêu cầu) được thử lại một lần, rồi mới báo lỗi', async () => {
  const fake = fakeMuse({ total: 7 });
  let first = true;
  const flaky = async (...a) => { if (first) { first = false; throw Object.assign(Error('Muse chưa nhận được yêu cầu'), { infra: true }); } return fake.ask(...a); };
  const result = await createPairWriter({ ask: flaky, delay: async () => {} }).write({ options: { topic: 'x', minutes: 1 } });
  assert.equal(result.script.beats.length, 7);
  const dead = async () => { throw Object.assign(Error('Muse không phản hồi'), { infra: true }); };
  await assert.rejects(createPairWriter({ ask: dead, delay: async () => {} }).write({ options: { topic: 'x', minutes: 1 } }), /Muse không phản hồi/);
});
