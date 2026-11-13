const { test } = require('node:test');
const assert = require('node:assert/strict');
const P = require('../src/wild-plan.js');
const { createWildWriter } = require('../src/wild-write.cjs');

const { fakeMuse } = require('./fixtures/wild-fake-muse.cjs');
const writer = (fake, extra = {}) => createWildWriter({ ask: fake.ask, delay: async () => {}, ...extra });

test('viết cả phim 20 phút: một lượt hồ sơ rồi các lượt ≤ 10 cảnh, đủ 130 cảnh, mỗi lượt biết 3 cảnh trước', async () => {
  const fake = fakeMuse(), drafts = [];
  const w = writer(fake);
  const result = await w.write({ options: { topic: 'Cầy mangut', minutes: 20 }, onDraft: d => drafts.push(d.scenes.length) });
  assert.equal(fake.log.bible, 1);
  assert.equal(result.scenes.length, 130);
  assert.equal(result.bible.chapters.length, 16);
  assert.deepEqual(result.scenes.map(s => s.number), Array.from({ length: 130 }, (_, i) => i + 1));
  assert.ok(fake.log.chapter.every(([a, b]) => b - a + 1 <= P.PART_SCENES && b >= a));
  assert.equal(fake.log.chapter[0][0], 1);
  assert.equal(fake.log.chapter.at(-1)[1], 130);
  const second = fake.log.instructions.filter(x => x.includes('HỒ SƠ PHIM (đã chốt)'))[1];
  assert.match(second, /Cảnh \d+: lời:/, 'lượt sau có các cảnh ngay trước');
  assert.equal(result.scenes[0].join, 'NEW');
  assert.ok(drafts.length >= 17, 'lưu nháp sau hồ sơ và sau mỗi lượt');
  assert.equal(drafts.at(-1), 130);
  assert.equal(w.status().busy, false);
  assert.equal(w.status().done, 130);
  const longest = (() => { let run = 0, best = 0; for (const s of result.scenes) { run = s.join === 'CONTINUE' ? run + 1 : 0; best = Math.max(best, run); } return best; })();
  assert.ok(longest <= P.MAX_CHAIN - 1);
  // cảnh quang cảnh (NV: KHÔNG) được nhận như cảnh hợp lệ, luôn MỚI, và chiếm khoảng 1/6 phim
  const wide = result.scenes.filter(s => s.noCast);
  assert.equal(wide.length, 21);
  assert.ok(wide.every(s => s.number % 6 === 0 && s.cast.length === 0 && s.join === 'NEW' && /QUANG CẢNH/.test(s.kind)));
  assert.equal(result.bible.plot.length > 40, true);
  assert.ok(result.bible.chapters.every(c => /địa điểm/i.test(c.place)));
});

test('Muse bỏ sót cảnh ở lần đầu: hỏi lại chỉ phần thiếu, nhận đủ', async () => {
  const fake = fakeMuse({ total: 122, chapters: 14, drop: (n, attempt) => attempt === 1 && (n === 4 || n === 5) });
  const result = await writer(fake).write({ options: { topic: 'x', minutes: 15 } });
  assert.equal(result.scenes.length, 122);
  const retry = fake.log.chapter.filter(([a, b]) => a === 4 && b === 5);
  assert.equal(retry.length, 1, 'lần hai chỉ xin cảnh 4–5');
  const retryText = fake.log.instructions.find(x => /các cảnh 4–5/.test(x));
  assert.match(retryText, /SỬA LỖI/);
  assert.match(retryText, /Thiếu cảnh: 4, 5/);
});

test('Muse cứ thiếu một cảnh: dừng đúng chỗ, giữ bản nháp, «Viết tiếp» không hỏi lại hồ sơ và các lượt đã xong', async () => {
  let failing = true;
  const fake = fakeMuse({ total: 122, chapters: 14, drop: n => failing && n === 23 });
  let saved = null;
  const w = writer(fake);
  await assert.rejects(w.write({ options: { topic: 'x', minutes: 15 }, onDraft: d => { saved = d; } }), e => /thiếu hoặc sai khuôn cảnh 23/.test(e.message) && /Viết tiếp/.test(e.message));
  assert.ok(saved.bible.chapters.length);
  assert.ok(saved.scenes.some(s => s.number === 22), 'giữ các cảnh đã đạt');
  assert.ok(!saved.scenes.some(s => s.number === 23));
  assert.match(w.status().error, /cảnh 23/);
  failing = false;
  const before = { bible: fake.log.bible, asks: fake.log.chapter.length };
  const result = await w.write({ options: { topic: 'x', minutes: 15 }, resume: saved, onDraft: d => { saved = d; } });
  assert.equal(fake.log.bible, before.bible, 'không lập lại hồ sơ');
  assert.equal(result.scenes.length, 122);
  const asked = fake.log.chapter.slice(before.asks);
  assert.ok(asked.length <= 12, 'chỉ viết phần còn lại, không viết lại từ đầu');
  assert.ok(asked.every(([, b]) => b >= 21), 'bỏ qua các lượt đã đủ cảnh');
});

test('hồ sơ hỏng khuôn thì hỏi lại kèm lỗi; hỏng mãi thì báo lỗi rõ', async () => {
  let n = 0;
  const bad = async instruction => { n++; return 'TIÊU ĐỀ: x\nSỰ THẬT:\n- ngắn'; };
  const w = createWildWriter({ ask: bad, delay: async () => {} });
  await assert.rejects(w.write({ options: { topic: 'x' } }), /Hồ sơ phim Muse viết chưa đúng khuôn/);
  assert.equal(n, 3, 'tối đa 3 lần');
});

test('không nhập chủ đề, hàng đợi đang chạy, bấm Dừng', async () => {
  const fake = fakeMuse();
  await assert.rejects(writer(fake).write({ options: { topic: '' } }), /Nhập tên con vật/);
  await assert.rejects(writer(fake, { isBusy: () => true }).write({ options: { topic: 'x' } }), /Dừng hàng đợi/);
  assert.equal(fake.log.bible, 0, 'không gửi gì cho Muse');
  const controllerAsk = async (m, i) => { throw Object.assign(Error('Đã dừng phân tích.'), { name: 'AbortError' }); };
  const w = createWildWriter({ ask: controllerAsk, delay: async () => {} });
  await assert.rejects(w.write({ options: { topic: 'x' } }), e => e.name === 'AbortError');
  assert.equal(w.status().error, '', 'bấm Dừng không phải lỗi');
  assert.equal(w.status().busy, false);
});

test('chia chương thành các lượt đều nhau', () => {
  const w = createWildWriter({ ask: async () => '', delay: async () => {} });
  assert.deepEqual(w.rangesOf({ from: 1, to: 8 }), [[1, 8]]);
  assert.deepEqual(w.rangesOf({ from: 11, to: 24 }), [[11, 17], [18, 24]]);
  assert.deepEqual(w.rangesOf({ from: 1, to: 10 }), [[1, 10]]);
  assert.deepEqual(w.rangesOf({ from: 1, to: 11 }), [[1, 6], [7, 11]]);
});
