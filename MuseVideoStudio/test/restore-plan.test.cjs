const { test } = require('node:test');
const assert = require('node:assert/strict');
const P = require('../src/restore-plan.js');

test('số cảnh theo số phút: 1 phút đến 2 giờ, từ 20 phút dùng cảnh 10 giây', () => {
  assert.deepEqual(P.MINUTES, [1, 2, 3, 5, 8, 10, 15, 20, 30, 40, 45, 50, 60, 90, 120]);
  const n = minutes => P.clipCount(P.options({ theme: 'cabin', minutes }));
  assert.equal(n(1), 8);
  assert.equal(n(2), 15);
  assert.equal(n(10), 75);
  assert.equal(n(20), 120);
  assert.equal(n(30), 180);
  assert.equal(n(40), 240);
  assert.equal(n(45), 270);
  assert.equal(n(50), 300);
  assert.equal(n(60), 360);
  assert.equal(n(120), 720);
  assert.equal(P.options({ minutes: 20, seconds: 5 }).seconds, 10, 'từ 20 phút ép 10 giây');
  assert.equal(P.options({ minutes: 5, seconds: 6 }).seconds, 6);
  assert.equal(P.options({ minutes: 999 }).minutes, 2, 'số phút lạ về mặc định');
});

test('khung hình chỉ ngang hoặc dọc; góc quay, người, mặt có giá trị mặc định đúng', () => {
  assert.equal(P.options({ aspect: '1:1' }).aspect, '16:9');
  assert.equal(P.options({ aspect: '9:16' }).aspect, '9:16');
  const o = P.options({ theme: 'house_in' });
  assert.equal(o.person, true, 'luôn có người dọn');
  assert.equal(o.camera, 'varied');
  assert.equal(o.faceless, false, 'mặc định có mặt');
  assert.equal(P.options({ theme: 'house_in', person: false }).person, false);
  assert.equal(P.options({ theme: 'bunker', person: false }).person, true, 'sinh tồn luôn có người');
  assert.equal(P.options({ theme: 'cabin', camera: 'fixed' }).camera, 'fixed');
  assert.equal(P.options({ theme: 'cabin', camera: 'xyz' }).camera, 'varied');
});

test('chia việc: ít cảnh thì chọn đều giữ việc đầu và cuối, nhiều cảnh thì chia phần', () => {
  const few = P.stepsOf(P.options({ theme: 'house_in', minutes: 1 }));
  assert.equal(few.length, 8);
  assert.equal(few[0].step, 1);
  assert.equal(few[few.length - 1].step, 15);
  const same = P.stepsOf(P.options({ theme: 'house_in', minutes: 2 }));
  assert.deepEqual(same.map(s => s.step), Array.from({ length: 15 }, (_, i) => i + 1));
  const many = P.stepsOf(P.options({ theme: 'house_in', minutes: 120 }));
  assert.equal(many.length, 720);
  for (let k = 1; k <= 15; k++) {
    const parts = many.filter(s => s.step === k);
    assert.ok(parts.length >= 47 && parts.length <= 49, `việc ${k}: ${parts.length} phần`);
    assert.deepEqual(parts.map(s => s.part), parts.map((_, i) => i + 1));
  }
  assert.match(many[1].title, /\(2\/48\)/);
});

test('chủ đề tự nhập: dùng các dòng người dùng ghi, hoặc chia theo mức hoàn thành', () => {
  const typed = P.stepsOf(P.options({ theme: 'custom', minutes: 1, customSteps: 'Hút nước hồ\nChà rêu\nSơn lại' }));
  assert.equal(typed.length, 8);
  assert.equal(typed[0].en, 'Hút nước hồ');
  assert.equal(typed[typed.length - 1].en, 'Sơn lại');
  const auto = P.stepsOf(P.options({ theme: 'custom', minutes: 1 }));
  assert.equal(auto.length, 8);
  assert.match(auto[2].en, /% complete/);
  assert.match(auto[7].en, /finished/);
});

test('đồ thị việc: ảnh gốc → cảnh 1; mỗi cảnh sau lấy khung cuối cảnh trước', () => {
  const c = P.options({ theme: 'cabin', minutes: 2 });
  const noPhoto = P.buildJobs(c, { storyId: 's' });
  assert.equal(noPhoto.length, 16);
  assert.equal(noPhoto[0].phase, 'image');
  assert.deepEqual(noPhoto[1].needs, [{ phase: 'image', number: 1 }]);
  assert.deepEqual(noPhoto[1].refList, [{ phase: 'image', number: 1 }]);
  assert.deepEqual(noPhoto[2].needs, [{ phase: 'clip', number: 1 }]);
  assert.deepEqual(noPhoto[2].refList, [{ phase: 'clip', number: 1, part: 'lastFrame' }]);
  const withPhoto = P.buildJobs(c, { storyId: 's', photo: 'C:\\a.jpg' });
  assert.equal(withPhoto.length, 15);
  assert.deepEqual(withPhoto[0].needs, []);
  assert.deepEqual(withPhoto[0].refList, [{ file: 'C:\\a.jpg' }]);
  assert.ok(withPhoto.every(j => j.kind === 'restore' && j.durationSeconds === 8));
  const anchored = P.buildJobs(P.options({ theme: 'cabin', minutes: 2, anchor: true }), { storyId: 's', photo: 'p.png' });
  assert.equal(anchored[0].refList.length, 1);
  assert.equal(anchored[1].refList.length, 2, 'neo ảnh gốc từ cảnh 2');
});

test('video 2 giờ: 721 việc, mọi prompt dưới giới hạn của hàng đợi', () => {
  const jobs = P.buildJobs(P.options({ theme: 'house_out', minutes: 120, anchor: true }), { storyId: 's' });
  assert.equal(jobs.length, 721);
  assert.ok(jobs.every(j => j.prompt.length < 6000));
  assert.ok(jobs.length <= 740, 'vừa giới hạn của restoreCreate');
});

test('prompt: khóa đồng nhất, người vô danh, cảnh nối cảnh, tiếng Anh', () => {
  const c = P.options({ theme: 'house_in', minutes: 2, place: 'old brick house living room' });
  const steps = P.stepsOf(c);
  const first = P.clipPrompt(c, steps[0], 1, 15, { first: true });
  const next = P.clipPrompt(c, steps[1], 2, 15);
  assert.match(first, /starts EXACTLY from the attached image/);
  assert.match(first, /old brick house living room/);
  assert.match(first, /LOCKED - these never change/);
  assert.match(first, /anonymous, generic, fictional individual/);
  assert.match(first, /not any real person, not a celebrity/);
  assert.match(first, /same face and facial features/);
  assert.match(first, /face is clearly visible/);
  assert.doesNotMatch(first, /continues directly from the previous clip/);
  assert.match(next, /continues directly from the previous clip/);
  assert.match(first, /Audio: no speech/);
  assert.match(first, /FAST-MOTION real-life video of a person doing the work/);
  assert.match(first, /Never slow motion/);
  assert.match(first, /sharp, crisp, high-detail/);
  assert.match(first, /nothing ever changes by itself, by magic or by a cut/);
  assert.match(P.sceneBible(c), /PERSON \(the same single person/);
  assert.equal(P.sceneBible(c), P.sceneBible(c), 'sổ cảnh ổn định');
  // sổ cảnh giống hệt ở mọi cảnh
  const bible = P.sceneBible(c);
  for (const [i, s] of steps.entries()) assert.ok(P.clipPrompt(c, s, i + 1, steps.length).includes(bible));
  assert.doesNotMatch(first, /[ạảãàáâấầẩẫậăắằẳẵặẹẻẽèéêếềểễệịỉĩìíọỏõòóôốồổỗộơớờởỡợụủũùúưứừửữựỳỵỷỹýđ]/i, 'prompt hoàn toàn tiếng Anh');
});

test('không lộ mặt: bỏ yêu cầu mặt, thêm lệnh quay từ sau lưng', () => {
  const c = P.options({ theme: 'house_in', minutes: 2, faceless: true });
  const prompt = P.clipPrompt(c, P.stepsOf(c)[0], 1, 15, { first: true });
  assert.match(prompt, /filmed from behind, from a distance or from the side/);
  assert.doesNotMatch(prompt, /same face and facial features/);
  assert.doesNotMatch(prompt, /face is clearly visible/);
  assert.match(P.baseImagePrompt(c), /seen from behind/);
});

test('góc quay: xen kẽ xa / vừa / gần, cuối mỗi bước lùi ra cảnh xa; cố định thì không có dòng SHOT', () => {
  const c = P.options({ theme: 'cabin', minutes: 20 });   // 120 cảnh → mỗi việc nhiều phần
  const steps = P.stepsOf(c);
  const shot = i => P.clipPrompt(c, steps[i], i + 1, steps.length).split('\n').find(l => l.startsWith('SHOT:'));
  const kinds = new Set();
  for (const [i, s] of steps.entries()) {
    const line = shot(i);
    assert.ok(line, 'cảnh ' + (i + 1) + ' có dòng SHOT');
    if (s.part >= s.parts) assert.match(line, /settles on a WIDE shot/);
    else { const m = /to a (MEDIUM|CLOSE-UP|WIDE)/.exec(line); assert.ok(m); kinds.add(m[1]); }
  }
  assert.ok(kinds.has('MEDIUM') && kinds.has('CLOSE-UP'), 'có cả cảnh vừa và cảnh gần');
  assert.ok([...steps.keys()].some(i => /face and shoulders/.test(shot(i))), 'có cảnh cận mặt khi để lộ mặt');
  const hidden = P.options({ theme: 'cabin', minutes: 20, faceless: true }), hs = P.stepsOf(hidden);
  assert.ok(hs.every((s, i) => !/face and shoulders/.test(P.clipPrompt(hidden, s, i + 1, hs.length))), 'không lộ mặt thì không có cận mặt');
  const fixed = P.options({ theme: 'cabin', minutes: 2, camera: 'fixed' });
  const prompt = P.clipPrompt(fixed, P.stepsOf(fixed)[0], 1, 15, { first: true });
  assert.doesNotMatch(prompt, /SHOT:/);
  assert.match(prompt, /one fixed camera on a tripod/);
});

test('chặn người nổi tiếng và nhân vật khi gõ chữ, không chặn chữ thường dùng', () => {
  for (const bad of ['poster of Donald Trump on the wall', 'Phòng khách giống ca sĩ Sơn Tùng', 'a Spider-Man toy', 'Elon Musk standing', 'Pikachu doll', 'Bác Hồ', 'looks like a famous actor', 'tổng thống']) {
    assert.ok(P.screenText(bad).length > 0, bad);
  }
  for (const ok of ['an old Toyota Corolla 1990 in a garage', 'a frozen lake with a cabin', 'king size bed in a farm house', 'dọn nhà vừa xong', 'Honda Cub 1985 rusty', 'a mushroom garden', 'cabin by the river']) {
    assert.deepEqual(P.screenText(ok), [], ok);
  }
  const bad = P.options({ theme: 'custom', place: 'Elsa castle', personDesc: 'a man who looks like Messi', light: 'sunset', customSteps: 'Meet Batman' });
  const found = P.screenConfig(bad);
  assert.ok(found.includes('elsa') && found.includes('messi') && found.includes('batman'), found.join());
  const vi = P.problems(bad, { hasPhoto: true });
  assert.equal(vi.length, 1);
  assert.match(vi[0], /người nổi tiếng hoặc nhân vật có bản quyền/);
  assert.match(P.problems({ ...bad, lang: 'en' }, { hasPhoto: true })[0], /famous person or a copyrighted character/);
  assert.deepEqual(P.problems(P.options({ theme: 'cabin' })), []);
  assert.equal(P.problems(P.options({ theme: 'custom' })).length, 1, 'tự nhập cần ảnh hoặc mô tả');
  // chữ do tool sinh ra (có chữ celebrity trong lời dặn an toàn) không tự bị chặn
  assert.deepEqual(P.screenConfig(P.options({ theme: 'cabin', person: true })), []);
});

test('Muse chặn vì nội dung: nhận ra lỗi và đổi prompt an toàn hơn dần', () => {
  assert.ok(P.isPolicyError('This prompt was blocked by policy'));
  assert.ok(P.isPolicyError('Nội dung vi phạm chính sách'));
  assert.ok(P.isPolicyError('Cannot generate videos of public figures'));
  assert.ok(!P.isPolicyError('Network error: ECONNRESET'));
  assert.ok(!P.isPolicyError('Hết thời gian chờ video'));
  const base = 'Create a video.\nPERSON: a man.';
  const one = P.safeRetryPrompt(base, 1);
  const two = P.safeRetryPrompt(one, 2);
  assert.match(one, /very small and far away or seen only from behind/);
  assert.match(two, /no person is visible in this clip at all/);
  assert.doesNotMatch(two, /very small and far away/, 'không dồn lệnh cũ');
  assert.equal(two.split('SAFETY REWRITE:').length, 2);
  assert.match(P.safeRetryPrompt('Photo of a room.', 2, { image: true }), /with no person visible at all/);
});

test('tiêu đề tiếng Anh và tên chủ đề', () => {
  const en = P.stepsOf(P.options({ theme: 'cabin', minutes: 2, lang: 'en' }));
  assert.equal(en[0].title, 'Level the ground');
  const vi = P.stepsOf(P.options({ theme: 'cabin', minutes: 2, lang: 'vi' }));
  assert.notEqual(vi[0].title, en[0].title);
  assert.equal(P.videoTitle(P.options({ theme: 'bunker', lang: 'en' })), 'Survival · dig an underground shelter');
  assert.equal(P.THEMES.length, 9);
  assert.ok(P.THEMES.every(t => t.id === 'custom' || t.steps.length === (t.id === 'house_full' ? 20 : 15)));
  for (const t of P.THEMES) if (t.id !== 'custom') assert.equal(P.EN[t.id].titles.length, t.steps.length, t.id);
});

test('«cả ngôi nhà»: toàn cảnh rậm rạp → dọn ngoài → vào nhà → dọn, sơn sửa trong → đèn, thiết bị → ngoài lần nữa → hoàn thiện như nhà mới', () => {
  assert.equal(P.THEMES[0].id, 'house_full', 'là chủ đề đầu tiên và mặc định');
  assert.equal(P.options({}).theme, 'house_full');
  const theme = P.themeOf('house_full'), en = theme.steps.map(s => s[1]);
  const at = re => en.findIndex(t => re.test(t));
  const order = [/overgrown with tall weeds/, /weeds, vines and bushes .* cut down/, /yard .* raked clean/, /pressure-washed/, /opens the front door/, /inside the house the big trash/, /primer/, /painted with two clean coats/, /new flooring/, /light bulbs/, /kitchen counter/, /furniture is carried in/, /outer walls are painted/, /brand new/].map(at);
  assert.ok(order.every(i => i >= 0), order.join());
  assert.deepEqual([...order].sort((a, b) => a - b), order, 'đúng thứ tự người dùng mô tả');
  assert.equal(theme.steps.length, 20);
  assert.match(theme.base, /weeds and vines/);
  // camera luôn xen kẽ vì đi từ ngoài vào trong
  assert.equal(P.options({ theme: 'house_full', camera: 'fixed' }).camera, 'varied');
  // dài 10 phút: đủ 20 việc theo thứ tự, mỗi việc nhiều phần; ngắn thì vẫn có việc đầu và cuối
  const ten = P.stepsOf(P.options({ theme: 'house_full', minutes: 10 }));
  assert.equal(ten[0].step, 1);
  assert.equal(ten[ten.length - 1].step, 20);
  assert.deepEqual([...ten.map(s => s.step)].sort((a, b) => a - b), ten.map(s => s.step), 'không đảo thứ tự');
  const short = P.stepsOf(P.options({ theme: 'house_full', minutes: 1 }));
  assert.equal(short[0].step, 1);
  assert.equal(short[short.length - 1].step, 20);
  // bước không bị gán «done by the person» thừa khi câu đã có người
  const c = P.options({ theme: 'house_full', minutes: 2 }), steps = P.stepsOf(c);
  const first = P.clipPrompt(c, steps[0], 1, steps.length, { first: true });
  assert.doesNotMatch(first, /\(done by the person in the scene\)/);
  assert.match(P.clipPrompt(c, steps[5], 6, steps.length), /\(done by the person in the scene\)/);
  assert.doesNotMatch(P.baseImagePrompt(c), /nobody around/);
});

test('tên video: người dùng đặt tên thì dùng tên đó cho video và thư mục, để trống thì lấy tên chủ đề', () => {
  const named = P.options({ theme: 'house_full', name: '  Nhà ma thành biệt thự  ' });
  assert.equal(named.name, 'Nhà ma thành biệt thự');
  assert.equal(P.videoTitle(named), 'Nhà ma thành biệt thự');
  assert.equal(P.storyIdBase(named), 'Nha-ma-thanh-biet-thu');
  const plain = P.options({ theme: 'house_full' });
  assert.equal(plain.name, '');
  assert.match(P.videoTitle(plain), /Dọn nhà bỏ hoang/);
  assert.match(P.storyIdBase(plain), /^Don-nha-bo-hoang/);
  assert.equal(P.options({ name: 'x'.repeat(200) }).name.length, 80);
  assert.equal(P.options({ name: 'a\nb\tc' }).name, 'a b c');
});
