const { test } = require('node:test');
const assert = require('node:assert/strict');
const P = require('../src/wild-plan.js');

const castLock = 'adult male banded mongoose, sandy brown fur with darker transverse bands across the back, a small notch in the left ear, lean muscular build';
const BIBLE_REPLY = (total = 130, chapters = 16) => {
  const per = Math.floor(total / chapters), rest = total - per * chapters;
  const rows = Array.from({ length: chapters }, (_, i) => `${i + 1} | Chương ${i + 1} | ${per + (i < rest ? 1 : 0)} | Tình huống mới số ${i + 1} của phim | bình minh | Termite mound clearing ${i + 1}: the mound at the left, one acacia at the right, low sun from the east`);
  return [
    '**TIÊU ĐỀ:** Cầy mangut: người gác hang trên thảo nguyên',
    'LOÀI: Cầy mangut sọc (Mungos mungo), châu Phi hạ Sahara, thảo nguyên và savan',
    'SỰ THẬT:',
    '- Cầy mangut sọc sống thành đàn và cùng nhau canh gác hang.',
    '- Chúng ăn côn trùng, bò sát nhỏ và trứng, đào bới để tìm mồi.',
    '- Con non được cả đàn chăm sóc và bảo vệ trong hang.',
    '- Khi có thiên địch trên không, một số cá thể canh gác kêu báo động.',
    '- Mỗi lứa thường có vài con non, thời điểm sinh phụ thuộc vào mùa mưa.',
    '- Chúng đánh dấu lãnh thổ bằng mùi và đi kiếm ăn theo đàn vào ban ngày.',
    'NHÂN VẬT:',
    `1 | nhân vật chính | cầy mangut đực trưởng thành | ${castLock}`,
    '2 | đối thủ | rắn hổ mang, trưởng thành | adult forest cobra, glossy dark olive scales with pale belly, about two meters long',
    '3 | con non | cầy mangut con | young banded mongoose pup, small, fluffy light brown fur with faint stripes',
    'BỐI CẢNH: African savanna in the dry season, golden grass, scattered acacia trees and termite mounds, warm low sun at dawn and dusk, dusty air.',
    'ẢNH BÌA: the lead mongoose standing upright on a termite mound at sunrise, backlit by golden light, grassland behind',
    'CỐT TRUYỆN: Mùa khô kéo dài, cầy mangut đực dẫn đàn đi tìm mồi cho đàn con đói; một con rắn hổ mang chặn đường, đàn mất một con non, rồi tìm được bãi mồi mới.',
    'ĐẶC SẮC:',
    '2 | Điệu múa tán tỉnh: hai con đực đứng thẳng, nghiêng đầu, đỉnh điểm, hệ quả',
    '- 4 | Cuộc săn rắn: rình, tiếp cận, đớp, kết quả thất bại',
    '9 | Chăm con non: dẫn đi, canh chừng, cho ăn',
    'CHƯƠNG:',
    ...rows,
    'MSDONE1a2b3c'
  ].join('\n');
};
const bible = () => P.parseBible(BIBLE_REPLY(), { topic: 'Cầy mangut', minutes: 20 });

const sceneBlock = (n, extra = {}) => [
  `CẢNH ${n}`,
  `LỜI: ${extra.narration ?? `Bình minh lên, cầy mangut đứng gác trên gò mối số ${n}.`}`,
  `NỐI: ${extra.join ?? 'TIẾP'}`,
  extra.kind === undefined ? '' : `LOẠI: ${extra.kind}`,
  `NV: ${extra.cast ?? '1,2'}`,
  extra.frame === undefined ? '' : `KHUNG: ${extra.frame}`,
  `HÀNH ĐỘNG: ${extra.action ?? 'Telephoto close-up. 0-3s the mongoose stands upright and scans the grass; 3-6s it turns its head to the left; 6-10s it drops to all fours and sniffs the ground.'}`,
  `CUỐI: ${extra.end ?? 'The mongoose is on all fours, nose to the ground, facing left, grass behind it.'}`,
  'ÂM THANH: wind in the grass, distant birds'
].filter(Boolean).join('\n');
const FRAME = 'Wide shot at dawn: the lead mongoose stands on a termite mound in the middle, golden grass around, acacia tree on the right.';

test('số cảnh và độ dài lời theo số phút: 15 phút dùng cảnh 8 giây, từ 20 phút dùng cảnh 10 giây', () => {
  assert.deepEqual(P.MINUTES, [15, 20, 25]);
  const o = m => P.options({ topic: 'sư tử', minutes: m });
  assert.equal(o(15).seconds, 8);
  assert.equal(o(20).seconds, 10);
  assert.equal(o(25).seconds, 10);
  assert.equal(o(15).scenes, 122);
  assert.equal(o(20).scenes, 130);
  assert.equal(o(25).scenes, 163);
  assert.equal(P.options({ topic: 'x', minutes: 3 }).minutes, 20, 'số phút lạ về mặc định');
  assert.equal(P.options({ topic: 'x', aspect: '1:1' }).aspect, '16:9');
  assert.equal(P.options({ topic: 'x', lang: 'xx' }).lang, 'vi');
  assert.equal(o(20).budget, 180, 'tiếng Việt: 10 giây × 20 ký tự × 0,9');
  assert.equal(P.options({ topic: 'x', lang: 'en', minutes: 15 }).budget, 108);
});

test('chưa nhập chủ đề thì không gửi gì cho Muse', () => {
  assert.throws(() => P.buildBibleInstruction({ topic: '   ' }), /Nhập tên con vật/);
  assert.equal(P.problems(P.options({ topic: '' })).length, 1);
});

test('lời nhắc hồ sơ phim: đủ luật trung thực, săn mồi thật, bảo vệ con, không máu, mốc kết thúc', () => {
  const text = P.buildBibleInstruction({ topic: 'Cầy mangut và rắn hổ mang', minutes: 20 }, { marker: 'ab12cd' });
  for (const part of ['ĐÚNG SỰ THẬT KHOA HỌC', 'khá thường xuyên', 'KHÔNG máu me', 'NUÔI VÀ BẢO VỆ CON NON', 'ĐÚNG 130', 'MỞ ĐẦU', 'vòng tuần hoàn', 'MỚI và độc đáo', 'Cầy mangut và rắn hổ mang']) assert.ok(text.includes(part), part);
  assert.match(text, /MSDONEab12cd/);
  assert.ok(text.trim().endsWith('MSENDab12cd'));
  assert.match(text, /tiếng Việt/);
  assert.match(P.buildBibleInstruction({ topic: 'lion', lang: 'en' }), /tiếng Anh/);
});

test('đọc hồ sơ phim: tiêu đề, sự thật, nhân vật, bối cảnh, chương chia đủ số cảnh', () => {
  const b = bible();
  assert.equal(b.title, 'Cầy mangut: người gác hang trên thảo nguyên');
  assert.equal(b.facts.length, 6);
  assert.equal(b.cast.length, 3);
  assert.equal(b.cast[1].id, 2);
  assert.match(b.cast[1].lock, /forest cobra/);
  assert.match(b.world, /savanna/);
  assert.match(b.cover, /termite mound/);
  assert.equal(b.chapters.length, 16);
  assert.equal(b.total, 130);
  assert.equal(b.chapters[0].from, 1);
  assert.equal(b.chapters.at(-1).to, 130);
  b.chapters.forEach((c, i) => { assert.ok(c.to - c.from + 1 >= P.MIN_CHAPTER && c.to - c.from + 1 <= P.MAX_CHAPTER); if (i) assert.equal(c.from, b.chapters[i - 1].to + 1); });
});

test('hồ sơ hỏng khuôn: nói rõ thiếu gì và cho phép hỏi lại', () => {
  assert.throws(() => P.parseBible('TIÊU ĐỀ: x\nSỰ THẬT:\n- ngắn', { topic: 'x' }), e => e.fixable && /SỰ THẬT chỉ có 0|thiếu BỐI CẢNH|CHƯƠNG chỉ có 0/.test(e.message));
  const few = BIBLE_REPLY(130, 8);   // 8 chương × 16 = quá dài mỗi chương
  assert.throws(() => P.parseBible(few, { topic: 'x', minutes: 20 }), /CHƯƠNG quá ít/);
  const many = BIBLE_REPLY(130, 50);
  assert.throws(() => P.parseBible(many, { topic: 'x', minutes: 20 }), /CHƯƠNG quá nhiều/);
});

test('chia lại số cảnh các chương cho đúng tổng', () => {
  const counts = P.normalizeChapters([{ scenes: 8 }, { scenes: 8 }, { scenes: 30 }, { scenes: 10 }], 40);
  assert.deepEqual(counts, [8, 8, 14, 10]);
  assert.equal(P.normalizeChapters(Array.from({ length: 12 }, () => ({ scenes: 12 })), 122).reduce((a, b) => a + b, 0), 122);
  assert.ok(P.normalizeChapters([{ scenes: 1 }, { scenes: 99 }], 20).every(n => n >= P.MIN_CHAPTER && n <= P.MAX_CHAPTER));
});

test('lời nhắc từng lượt: hồ sơ, dàn ý, cảnh trước, luật nối, khuôn, mốc', () => {
  const b = bible(), cfg = { topic: 'Cầy mangut', minutes: 20 };
  const text = P.buildChapterInstruction(cfg, b, { marker: 'ff00aa', chapter: b.chapters[2], range: [b.chapters[2].from, b.chapters[2].from + 4], previous: [{ number: 15, narration: 'Gió thổi.', end: 'The mongoose faces left.' }] });
  for (const part of ['SỰ THẬT được dùng', 'NHÂN VẬT (số | vai | nhận dạng)', 'ĐANG VIẾT', 'Cảnh 15: lời: Gió thổi.', 'trạng thái cuối: The mongoose faces left.', 'Tối đa 180 ký tự', 'NỐI: <TIẾP hoặc MỚI>', 'HÀNH ĐỘNG: <English>', 'Không để quá 5 cảnh TIẾP', 'KHÔNG máu me']) assert.ok(text.includes(part), part);
  assert.match(text, new RegExp(`các cảnh ${b.chapters[2].from}–${b.chapters[2].from + 4}`));
  assert.match(text, /MSDONEff00aa/);
  assert.ok(text.trim().endsWith('MSENDff00aa'));
  const firstText = P.buildChapterInstruction(cfg, b, { chapter: b.chapters[0], range: [1, 5] });
  assert.match(firstText, /Cảnh 1–2 là MỞ ĐẦU/);
  assert.match(firstText, /PHẢI là MỚI/);
  const lastText = P.buildChapterInstruction(cfg, b, { chapter: b.chapters.at(-1), range: [126, 130] });
  assert.match(lastText, /Cảnh 130 là cảnh KẾT/);
  const fixText = P.buildChapterInstruction(cfg, b, { chapter: b.chapters[0], range: [1, 5], fix: 'Thiếu cảnh: 4.' });
  assert.match(fixText, /SỬA LỖI/);
});

test('đọc các cảnh Muse viết (có markdown, có dấu phụ khác nhau), bỏ lời dài quá khung', () => {
  const reply = [
    '**CẢNH 1**', 'LỜI: —', 'NỐI: MỚI', 'NV: 1', `KHUNG: ${FRAME}`, 'HÀNH ĐỘNG: Telephoto wide shot, 0-4s the mongoose stands on the mound; 4-10s it looks toward the horizon.', 'CUỐI: The mongoose stands on the mound looking right.', 'ÂM THANH: wind',
    '', 'Cảnh 2:', '- LỜI: **Một buổi sáng như mọi buổi sáng.** Nhưng hôm nay có điều gì đó khác.', '- NỐI: TIẾP', '- NV: 1,2', '- HÀNH ĐỘNG: Low tracking shot, the mongoose walks right through the grass.', '  keeping its head high.', '- CUỐI: The mongoose stops at the grass edge, head up, looking right.', '- ÂM THANH: footsteps',
    '', `### Scene 3`, `LỜI: ${'Rất dài. '.repeat(60)}`, 'NỐI: MỚI', 'NV: 2', `KHUNG: ${FRAME}`, 'HÀNH ĐỘNG: Close-up of the cobra raising its hood slowly in the grass, tongue flicking.', 'CUỐI: The cobra holds its raised hood, facing the camera.', 'ÂM THANH: hiss',
    'MSDONE1a2b3c'
  ].join('\n');
  const s = P.parseScenes(reply, { topic: 'x', minutes: 20 });
  assert.equal(s.length, 3);
  assert.equal(s[0].narration, '', 'dấu — là cảnh không lời');
  assert.equal(s[0].join, 'NEW');
  assert.deepEqual(s[1].cast, [1, 2]);
  assert.match(s[1].narration, /^Một buổi sáng như mọi buổi sáng\. Nhưng/);
  assert.match(s[1].action, /keeping its head high/, 'dòng nối của HÀNH ĐỘNG được gộp');
  assert.ok(Array.from(s[2].narration).length <= 180, 'lời dài quá bị rút bớt');
  assert.match(s[2].narration, /\.$/);
});

test('soát một lượt: thiếu cảnh, thiếu trường, cảnh MỚI thiếu khung, nhân vật lạ, lặp lời', () => {
  const reply = [
    sceneBlock(1, { join: 'NEW', frame: FRAME }),
    sceneBlock(2, { action: 'short' }),
    sceneBlock(3, { join: 'MỚI', frame: '' }),
    sceneBlock(4, { cast: '9' }),
    sceneBlock(5, { narration: 'Bình minh lên, cầy mangut đứng gác trên gò mối số 4.' })
  ].join('\n');
  const scenes = P.parseScenes(reply, { topic: 'x', minutes: 20 });
  const check = P.checkScenes(scenes, [1, 7], { topic: 'x', minutes: 20 }, { castIds: [1, 2, 3] });
  assert.equal(check.ok, false);
  assert.deepEqual(check.missing, [6, 7]);
  assert.deepEqual(check.bad, [2, 3, 4]);
  assert.ok(check.issues.some(x => /Cảnh 2: thiếu HÀNH ĐỘNG/.test(x)));
  assert.ok(check.issues.some(x => /Cảnh 3: cảnh MỚI thiếu KHUNG/.test(x)));
  assert.ok(check.issues.some(x => /Cảnh 4: NV có số không có trong hồ sơ/.test(x)));
  assert.ok(check.issues.some(x => /Cảnh 5 lặp lời của cảnh 4/.test(x)));
  const fix = P.fixText(check, [1, 7]);
  assert.match(fix, /Thiếu cảnh: 6, 7/);
  const good = P.checkScenes(P.parseScenes([1, 2].map((n, i) => sceneBlock(n, i ? {} : { join: 'NEW', frame: FRAME })).join('\n'), { topic: 'x' }), [1, 2], { topic: 'x' });
  assert.equal(good.ok, true);
});

test('ghép chuỗi: cảnh đầu luôn MỚI, không quá 6 cảnh liền một chuỗi, cảnh ép MỚI lấy khung từ trạng thái cuối cảnh trước', () => {
  const b = bible();
  const raw = Array.from({ length: 14 }, (_, i) => P.parseScenes(sceneBlock(i + 1, { join: i === 0 ? 'NEW' : 'TIẾP', frame: i === 0 ? FRAME : undefined, end: `End state number ${i + 1} of the mongoose, facing left in the grass.` }), { topic: 'x' })[0]);
  const out = P.assemble(b, raw);
  assert.equal(out[0].join, 'NEW');
  let run = 0, longest = 0;
  for (const s of out) { run = s.join === 'CONTINUE' ? run + 1 : 0; longest = Math.max(longest, run); }
  assert.ok(longest <= P.MAX_CHAIN - 1, 'chuỗi nối liền tối đa ' + (P.MAX_CHAIN - 1));
  const forced = out.find((s, i) => i > 0 && s.join === 'NEW');
  assert.ok(forced);
  assert.match(forced.frame, /^The same moment right after: End state number/);
});

test('việc trong hàng đợi: ảnh nhân vật, ảnh mốc cho cảnh MỚI, clip nối bằng khung cuối, ảnh bìa', () => {
  const b = bible();
  const scenes = [
    P.parseScenes(sceneBlock(1, { join: 'NEW', frame: FRAME, narration: '—' }), { topic: 'x' })[0],
    P.parseScenes(sceneBlock(2), { topic: 'x' })[0],
    P.parseScenes(sceneBlock(3, { join: 'NEW', frame: FRAME, cast: '2' }), { topic: 'x' })[0]
  ];
  const jobs = P.buildJobs({ topic: 'Cầy mangut', minutes: 20 }, b, scenes, { storyId: 'DV-Cay-mangut' });
  assert.ok(jobs.every(j => j.kind === 'wild' && j.storyId === 'DV-Cay-mangut'));
  const portraits = jobs.filter(j => j.phase === 'image' && j.number > 900 && j.number < 950);
  assert.deepEqual(portraits.map(j => j.number), [901, 902, 903]);
  const key1 = jobs.find(j => j.phase === 'image' && j.number === 1);
  assert.deepEqual(key1.refList, [{ phase: 'image', number: 901 }], 'ảnh mốc cảnh 1 giữ cá thể nhân vật 1');
  assert.deepEqual(key1.needs, [{ phase: 'image', number: 901 }]);
  const key3 = jobs.find(j => j.phase === 'image' && j.number === 3);
  assert.deepEqual(key3.refList, [{ phase: 'image', number: 902 }], 'cảnh 3 do nhân vật 2 (rắn) dẫn đầu');
  assert.equal(jobs.filter(j => j.phase === 'image' && j.number === 2).length, 0, 'cảnh TIẾP không có ảnh mốc');
  const clip1 = jobs.find(j => j.phase === 'clip' && j.number === 1), clip2 = jobs.find(j => j.phase === 'clip' && j.number === 2), clip3 = jobs.find(j => j.phase === 'clip' && j.number === 3);
  assert.deepEqual(clip1.refList, [{ phase: 'image', number: 1 }]);
  assert.deepEqual(clip2.needs, [{ phase: 'clip', number: 1 }]);
  assert.deepEqual(clip2.refList, [{ phase: 'clip', number: 1, part: 'lastFrame' }]);
  assert.deepEqual(clip3.refList, [{ phase: 'image', number: 3 }]);
  assert.equal(clip1.voiceover, '');
  assert.match(clip2.voiceover, /cầy mangut đứng gác/);
  assert.equal(clip2.durationSeconds, 10);
  assert.equal(jobs.at(-1).number, 950);
  assert.equal(jobs.at(-1).phase, 'image');
  assert.match(clip2.prompt, /continues directly from the previous clip/);
  assert.doesNotMatch(clip1.prompt, /continues directly from the previous clip/);
});

test('prompt clip: tỉ lệ, bắt đầu từ ảnh, nhận dạng cố định, bối cảnh, thực tế, không máu / người / chữ, chỉ tiếng tự nhiên', () => {
  const b = bible();
  const s = P.parseScenes(sceneBlock(2, { cast: '1,2' }), { topic: 'x' })[0];
  const clip = P.clipPrompt(P.options({ topic: 'x', minutes: 20 }), b, s, b.chapters[0]);
  for (const part of ['Horizontal 16:9', '10-second', 'starts EXACTLY from the attached image', 'SHOT: Telephoto close-up', 'By the last second', 'notch in the left ear', 'forest cobra', 'African savanna', 'No blood, no gore', 'No people', 'No speech, no narration', 'No text', 'not animation', 'no morphing']) assert.ok(clip.includes(part), part);
  assert.doesNotMatch(clip, /young banded mongoose pup/, 'chỉ khóa nhân vật có trong cảnh');
  const vertical = P.clipPrompt(P.options({ topic: 'x', aspect: '9:16', minutes: 15 }), b, s, b.chapters[0]);
  assert.match(vertical, /Vertical 9:16/);
  assert.match(vertical, /8-second/);
  const key = P.keyframePrompt(P.options({ topic: 'x' }), b, { ...s, frame: FRAME }, b.chapters[0], { hasRef: true });
  assert.match(key, /First frame of a wildlife documentary shot: Wide shot at dawn/);
  assert.match(key, /keep exactly the same individual/);
  assert.match(P.coverPrompt(P.options({ topic: 'x' }), b), /clear empty space for a title/);
});

test('cảnh bị Muse chặn vì nội dung: làm dịu lời, rồi bỏ hẳn va chạm', () => {
  assert.equal(P.isPolicyError('Nội dung vi phạm chính sách'), true);
  assert.equal(P.isPolicyError('Mạng chậm'), false);
  const prompt = 'Header\nSHOT: The cobra strikes and bites the mongoose; blood on the sand, a violent attack.\nBy the last second: the prey is killed.\nPLACE: savanna';
  const one = P.safeRetryPrompt(prompt, 1);
  assert.doesNotMatch(one, /blood|bites|killed|violent|prey|attack/i);
  assert.match(one, /SAFETY REWRITE: calm natural-history footage/);
  assert.match(one, /PLACE: savanna/, 'dòng khác giữ nguyên');
  const two = P.safeRetryPrompt(one, 2);
  assert.equal(two.split('\n').filter(l => l.startsWith('SAFETY REWRITE:')).length, 1, 'không chồng câu an toàn');
  assert.match(two, /no confrontation/);
});

test('ghi chú đi kèm: sự thật cần kiểm, lời thuyết minh, nhắc khai báo nội dung AI', () => {
  const b = bible();
  const s = P.parseScenes(sceneBlock(1, { join: 'NEW', frame: FRAME }), { topic: 'x' });
  const text = P.notesText(P.options({ topic: 'Cầy mangut', minutes: 20 }), b, s);
  assert.match(text, /SỰ THẬT MÀ PHIM DÙNG/);
  assert.match(text, /tự kiểm lại/);
  assert.match(text, /nội dung bị thay đổi hoặc tổng hợp/);
  assert.match(text, /1\. Bình minh lên/);
  assert.match(text, /tránh đăng hàng loạt/);
});

test('mã phim theo tên con vật, không dấu', () => {
  assert.equal(P.storyIdBase(P.options({ topic: 'Cầy mangut và rắn hổ mang' })), 'DV-Cay-mangut-va-ran-ho-mang');
  assert.equal(P.storyIdBase(P.options({ topic: '' })), 'DV-phim');
});

test('hồ sơ phim: cốt truyện và địa điểm từng chương được đọc và gửi lại cho từng lượt viết', () => {
  const b = bible();
  assert.match(b.plot, /Mùa khô kéo dài.*rắn hổ mang.*bãi mồi mới/);
  assert.match(b.chapters[0].place, /^Termite mound clearing 1: the mound at the left/);
  assert.match(b.chapters[5].place, /^Termite mound clearing 6:/);
  assert.equal(b.highlights.length, 3);
  assert.deepEqual(b.chapters.filter(c => c.highlights.length).map(c => c.n), [2, 4, 9 > b.chapters.length ? b.chapters.length : 9]);
  const cfg = { topic: 'Cầy mangut', minutes: 20 };
  const ask = P.buildBibleInstruction(cfg, { marker: 'x1' });
  for (const part of ['CÂU CHUYỆN, KHÔNG PHẢI BÀI GIỚI THIỆU', 'ít nhất HAI BƯỚC NGOẶT', 'HÀNH TRÌNH QUA NHIỀU NƠI', 'SỢI CHỈ CHÍNH THEO LOÀI, KHÔNG CHỈ MỖI TẤN CÔNG', 'KHOẢNH KHẮC ĐẶC SẮC: phim tài liệu hay không chỉ có tấn công', 'Săn mồi chỉ là MỘT loại', 'NHỊP ĐIỆN ẢNH', 'CỐT TRUYỆN:', 'ĐẶC SẮC:', 'mô tả CỐ ĐỊNH vật nào ở đâu']) assert.ok(ask.includes(part), 'thiếu: ' + part);
  const text = P.buildChapterInstruction(cfg, b, { chapter: b.chapters[2], range: [b.chapters[2].from, b.chapters[2].from + 4] });
  assert.match(text, /CỐT TRUYỆN \(cả phim\): Mùa khô kéo dài/);
  assert.match(text, /\(địa điểm: Termite mound clearing 3:/);
  for (const part of ['LOẠI: <CHÍNH | CẬN | XA | QUANG CẢNH | MÔI TRƯỜNG | THÚ PHỤ>', 'ÍT NHẤT 3 cảnh thuộc loại XA, QUANG CẢNH, MÔI TRƯỜNG hoặc THÚ PHỤ', 'không để quá 2 cảnh CHÍNH hoặc CẬN liên tiếp', 'ghi KHÔNG nếu cảnh chỉ có phong cảnh', 'đẩy câu chuyện đi tiếp']) assert.ok(text.includes(part), 'thiếu: ' + part);
});

test('cảnh quang cảnh: NV: KHÔNG hợp lệ, luôn là cảnh MỚI, không kéo nhân vật chính vào khung', () => {
  const read = (extra, n = 7) => P.parseScenes(sceneBlock(n, { kind: 'QUANG CẢNH', ...extra }), { topic: 'x' })[0];
  const land = read({ cast: 'KHÔNG', join: 'NEW', frame: 'Very wide landscape of the dry savanna at dusk, no animals.' });
  assert.equal(land.noCast, true);
  assert.deepEqual(land.cast, []);
  assert.equal(land.kind, 'QUANG CẢNH');
  assert.equal(read({ cast: '0', join: 'NEW', frame: 'x wide' }).noCast, true);
  assert.equal(read({ cast: 'none', join: 'NEW', frame: 'x wide' }).noCast, true);
  const withZero = read({ cast: '0,1', join: 'NEW', frame: 'x wide' });
  assert.equal(withZero.noCast, false);
  assert.deepEqual(withZero.cast, [1]);
  const junk = read({ cast: 'abc', join: 'NEW', frame: 'x wide' });
  assert.equal(junk.noCast, false);
  const cfg = { topic: 'x', minutes: 20 };
  assert.ok(P.checkScenes([junk], [7, 7], cfg, { castIds: [1, 2, 3] }).issues.some(t => /thiếu NV/.test(t)), 'NV rác vẫn bị báo thiếu');
  assert.ok(!P.checkScenes([land], [7, 7], cfg, { castIds: [1, 2, 3] }).issues.some(t => /thiếu NV/.test(t)), 'NV: KHÔNG không bị báo thiếu NV');
  // dù Muse ghi TIẾP, cảnh không nhân vật vẫn là cảnh MỚI (cắt sang phong cảnh)
  const b = bible();
  const [a, c] = [P.parseScenes(sceneBlock(1, { join: 'NEW', frame: FRAME }), { topic: 'x' })[0], P.parseScenes(sceneBlock(2, { kind: 'QUANG CẢNH', cast: 'KHÔNG', join: 'CONTINUE', frame: 'Very wide landscape at dusk, no animals.' }), { topic: 'x' })[0]];
  const assembled = P.assemble(b, [a, c]);
  assert.equal(assembled[1].join, 'NEW');
  const jobs = P.buildJobs({ topic: 'Cầy mangut', minutes: 20 }, b, [a, c], { storyId: 'DV-Cay-mangut' });
  const key2 = jobs.find(j => j.phase === 'image' && j.number === 2);
  assert.ok(key2, 'cảnh quang cảnh có ảnh mốc riêng');
  assert.deepEqual(key2.refList, []);
  assert.deepEqual(key2.needs, []);
  assert.match(key2.prompt, /NOT in this shot|no animals/);
  assert.doesNotMatch(key2.prompt, /attached image shows the individual animal/);
  assert.match(key2.prompt, /expansive, deep-focus wide landscape/);
  const clip2 = jobs.find(j => j.phase === 'clip' && j.number === 2);
  assert.deepEqual(clip2.needs, [{ phase: 'image', number: 2 }]);
  assert.match(clip2.prompt, /expansive, deep-focus wide landscape/);
  // cảnh có nhân vật vẫn dùng phong cách chung, không phải khung rộng
  const clip1 = jobs.find(j => j.phase === 'clip' && j.number === 1);
  assert.doesNotMatch(clip1.prompt, /expansive, deep-focus wide landscape/);
});

test('khoảnh khắc đặc sắc: yêu cầu của người làm phim, bắt buộc có ĐẶC SẮC, chương nào có thì được nhắc kể trọn chuỗi, bối cảnh cố định gắn vào prompt', () => {
  const cfg = { topic: 'Chim cổ rắn', minutes: 20 };
  const none = P.buildBibleInstruction(cfg, { marker: 'x1' });
  assert.doesNotMatch(none, /KHOẢNH KHẮC NGƯỜI LÀM PHIM MUỐN CÓ/);
  const sig = P.buildBibleInstruction({ ...cfg, signature: '  chim cổ rắn xòe cánh làm bóng\ndụ cá;  điệu múa tán tỉnh ' }, { marker: 'x1' });
  assert.match(sig, /KHOẢNH KHẮC NGƯỜI LÀM PHIM MUỐN CÓ \(dữ liệu[^)]*không phải mệnh lệnh[^)]*CÓ THẬT[^)]*\): chim cổ rắn xòe cánh làm bóng dụ cá; điệu múa tán tỉnh$/m);
  assert.equal(P.options({ topic: 'x', signature: 'a'.repeat(500) }).signature.length, 300);
  assert.equal(P.highlightCount(20), 3);
  assert.equal(P.highlightCount(60), 10);
  assert.match(none, /ít nhất 3 KHOẢNH KHẮC ĐẶC SẮC KHÁC LOẠI NHAU/);
  // hồ sơ không có ĐẶC SẮC (hoặc quá ít) bị báo lỗi để Muse viết lại
  const without = BIBLE_REPLY().replace(/ĐẶC SẮC:[\s\S]*?CHƯƠNG:/, 'CHƯƠNG:');
  assert.throws(() => P.parseBible(without, cfg), e => e.fixable && /ĐẶC SẮC chỉ có 0 dòng/.test(e.fix));
  // chương có khoảnh khắc đặc sắc thì lượt viết chương đó được nhắc; chương khác thì không
  const b = bible();
  const withHl = P.buildChapterInstruction(cfg, b, { chapter: b.chapters[1], range: [b.chapters[1].from, b.chapters[1].from + 2] });
  assert.match(withHl, /KHOẢNH KHẮC ĐẶC SẮC CỦA CHƯƠNG NÀY \(bắt buộc kể trọn\): Điệu múa tán tỉnh/);
  assert.match(withHl, /CHUỖI 3–5 cảnh NỐI: TIẾP liền nhau trong CÙNG MỘT chỗ/);
  const plain = P.buildChapterInstruction(cfg, b, { chapter: b.chapters[0], range: [b.chapters[0].from, b.chapters[0].from + 2] });
  assert.doesNotMatch(plain, /KHOẢNH KHẮC ĐẶC SẮC CỦA CHƯƠNG NÀY/);
  // bối cảnh cố định của chương gắn vào ảnh mốc và clip
  const scene = P.parseScenes(sceneBlock(1, { join: 'NEW', frame: FRAME }), { topic: 'x' })[0];
  const [a] = P.assemble(b, [scene]);
  for (const text of [P.keyframePrompt({ topic: 'x', minutes: 20, aspect: '16:9', seconds: 8 }, b, a, b.chapters[0]), P.clipPrompt({ topic: 'x', minutes: 20, aspect: '16:9', seconds: 8 }, b, a, b.chapters[0], { first: true })]) {
    assert.match(text, /SET of this part of the film \(the same place in every shot of this chapter[^)]*\): Termite mound clearing 1: the mound at the left/);
  }
});
