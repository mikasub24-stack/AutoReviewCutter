const { test } = require('node:test');
const assert = require('node:assert/strict');
const P = require('../src/wild-plan.js');

const castLock = 'adult male banded mongoose, sandy brown fur with darker transverse bands across the back, a small notch in the left ear, lean muscular build';
const BIBLE_REPLY = (total = 130, chapters = 16) => {
  const per = Math.floor(total / chapters), rest = total - per * chapters;
  const rows = Array.from({ length: chapters }, (_, i) => `${i + 1} | Chương ${i + 1} | ${per + (i < rest ? 1 : 0)} | Diễn biến số ${i + 1} của phim | bình minh`);
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
