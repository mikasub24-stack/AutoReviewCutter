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
  // Âm thanh: Muse và Flow đều xin tiếng động tự nhiên của công việc (không còn «hoàn toàn im lặng» như trước 1.9.1)
  for (const provider of ['muse', 'flow']) {
    const p = P.clipPrompt(P.options({ theme: 'house_in', minutes: 2, place: 'old brick house living room', provider }), steps[0], 1, 15, { first: true });
    assert.match(p, /only the quiet natural sounds of the work itself/, provider);
    assert.match(p, /no speech[\s\S]*no music/, provider);
    assert.doesNotMatch(p, /completely silent|no audio at all|no ambient noise/, provider);
    assert.match(p, /exact number of floors \(storeys\)[^.]*never lower/, provider);   // nhà 2 tầng không được thành 1 tầng
  }
  assert.match(first, /old brick house living room/);
  assert.match(first, /LOCKED - these never change/);
  assert.match(first, /anonymous, generic, fictional individual/);
  assert.match(first, /not any real person, not a celebrity/);
  assert.match(first, /same face and facial features/);
  assert.match(first, /face is clearly visible/);
  assert.doesNotMatch(first, /continues directly from the previous clip/);
  assert.match(next, /continues directly from the previous clip/);
  assert.match(first, /Audio: only the quiet natural sounds/);
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

test('góc quay: máy luôn đứng yên, không cận mặt / zoom / lia; ngoài trời cảnh rộng xa, trong nhà một góc cố định, đổi góc là cú cắt rõ; cố định thì không có dòng SHOT', () => {
  const shotOf = (c, st, n, t) => P.clipPrompt(c, st, n, t).split('\n').find(l => l.startsWith('SHOT:'));
  const cabin = P.options({ theme: 'cabin', minutes: 20 }), cs = P.stepsOf(cabin);
  for (const [i, st] of cs.entries()) {
    const line = shotOf(cabin, st, i + 1, cs.length);
    assert.ok(line, 'cảnh ' + (i + 1) + ' có dòng SHOT');
    assert.match(line, /never moves during a shot: no zoom, no push-in, no pull-out, no pan, no tilt, no orbit/);
    assert.match(line, /never a face close-up/);
    if (i > 0) assert.match(line, /completely still/);
    assert.doesNotMatch(P.clipPrompt(cabin, st, i + 1, cs.length), /CLOSE-UP|face and shoulders|push-in and pull-out|moves smoothly in to|reframes ONCE|camera follows/);
  }
  assert.match(shotOf(cabin, cs[0], 1, cs.length), /WIDE, distant shot filmed from far away/, 'ngoài trời: cảnh rộng quay xa');
  // Nhà đầy đủ: ngoài → vào nhà (cắt sang góc trong nhà) → ... → ra ngoài (cắt về cảnh rộng)
  const house = P.options({ theme: 'house_full', minutes: 20 }), hs = P.stepsOf(house);
  const at = n => hs.findIndex(s => s.step === n && s.part <= 1);
  const line = n => shotOf(house, hs[at(n)], at(n) + 1, hs.length);
  assert.match(line(2), /completely still, locked on a tripod/);
  assert.match(line(2), /keeping exactly the framing/, 'ngoài trời giữa chừng: giữ khung rộng, không đổi');
  assert.match(line(5), /clean, clearly visible cut in the first second to the new camera angle: ONE fixed angle/, 'vào nhà: cắt sang một góc cố định trong nhà');
  assert.match(line(6), /ONE clear, clean cut in the first second to a new fixed angle/, 'trong nhà: sang chỗ khác trong phòng thì cắt một lần');
  assert.match(line(19), /clean, clearly visible cut in the first second to the new camera angle: a WIDE, distant shot/, 'ra ngoài: cắt về cảnh rộng');
  assert.match(line(20), /clean, clearly visible cut in the first second to the new camera angle: ONE fixed angle/, 'xong nhà: quay bên trong nhà mới, cắt sang một góc cố định trong nhà');
  assert.match(line(21), /clean, clearly visible cut in the first second to the new camera angle: a WIDE, distant shot/, 'rồi cắt ra toàn cảnh ngoài nhà mới');
  assert.doesNotMatch(P.clipPrompt(house, hs[at(5)], at(5) + 1, hs.length), /camera follows/);
  const inside = P.options({ theme: 'house_in', minutes: 5 }), is = P.stepsOf(inside);
  assert.match(shotOf(inside, is[0], 1, is.length), /ONE fixed angle chosen so the whole action is clearly visible/);
  const fixed = P.options({ theme: 'cabin', minutes: 2, camera: 'fixed' });
  const prompt = P.clipPrompt(fixed, P.stepsOf(fixed)[0], 1, 15, { first: true });
  assert.doesNotMatch(prompt, /SHOT:/);
  assert.match(prompt, /one fixed camera on a tripod/);
});

test('cảm xúc và sức lực (dọn nhà): việc nặng thì thở mạnh, đổ mồ hôi, lau mặt; càng về cuối càng mệt; không lộ mặt thì chỉ dùng dáng người; không có người thì không có dòng này', () => {
  const c = P.options({ theme: 'house_full', minutes: 5 }), steps = P.stepsOf(c), total = steps.length;
  const line = (cfg, st, n, t = total) => (P.clipPrompt(cfg, st, n, t).split('\n').find(l => l.startsWith('Emotion and effort')) || '');
  const heavy = steps.findIndex(s => /cut down and cleared/.test(s.en));
  assert.ok(heavy >= 0);
  const h = line(c, steps[heavy], heavy + 1);
  assert.match(h, /HARD physical labour/);
  assert.match(h, /sweat/);
  assert.match(h, /never by moving the camera to the face/);
  // lau mồ hôi chỉ lâu lâu: khoảng 1 clip trong 6, không bao giờ ở clip 1-2; clip khác thì làm liên tục
  const wipes = Array.from({ length: 60 }, (_, i) => i + 1).filter(n => /wipe the sweat from the face/.test(line(c, steps[heavy], n, 60)));
  assert.deepEqual(wipes.slice(0, 4), [3, 9, 15, 21]);
  assert.ok(wipes.length >= 8 && wipes.length <= 12, 'khoảng 1/6 số clip: ' + wipes.length);
  assert.ok(!wipes.some(n => wipes.includes(n + 1)), 'không lau ở hai clip liền nhau');
  assert.match(line(c, steps[heavy], 4, 60), /keeps working without stopping the whole clip: no wiping the face/);
  assert.doesNotMatch(line(c, steps[heavy], 4, 60), /wipe the sweat/);
  assert.match(line(c, steps[heavy], 3, 60), /Once, in the middle of the clip, the person pauses for a moment to wipe the sweat/);
  assert.doesNotMatch(line(c, steps[heavy], 1, 60), /wipe the sweat/);
  const plain = steps.find(s => !/cut down and cleared/.test(s.en) && !/brand new/.test(s.en));
  assert.match(line(c, plain, 4, 60) + line(c, plain, 3, 60), /keeps working without stopping|The person works calmly|Once, in the middle/);
  assert.match(line(c, steps[heavy], 2), /just started/);
  assert.match(line(c, steps[heavy], Math.round(total * 0.45)), /Several hours/);
  assert.match(line(c, steps[heavy], Math.round(total * 0.8)), /Many hours/);
  assert.match(line(c, steps[heavy], total), /almost done: exhausted/);
  const calm = steps.find(s => /brand new/.test(s.en));
  assert.match(line(c, calm, total), /relaxed, pleased expression/);
  const faceless = P.options({ theme: 'house_full', minutes: 5, faceless: true });
  assert.match(line(faceless, steps[heavy], 3), /with the body only/);
  const noPerson = P.options({ theme: 'car', minutes: 5, person: false }), ns = P.stepsOf(noPerson);
  assert.equal(line(noPerson, ns[0], 1), '', 'không có người thì không có dòng cảm xúc');
  const withPerson = P.options({ theme: 'house_full', minutes: 5 });
  const wp = P.stepsOf(withPerson);
  assert.ok(withPerson.person, 'nhà có người làm');
  assert.match(P.keyframePrompt(withPerson, wp[10], 10, wp.length), /sweaty, hair damp|soaked in sweat|fresh with a little sweat/);
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
  assert.equal(P.THEMES.length, 14);
  assert.ok(P.THEMES.every(t => t.id === 'custom' || t.steps.length === (t.id === 'house_full' ? 21 : t.id.startsWith('stove_') ? 18 : 15)));
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
  assert.equal(theme.steps.length, 21);
  const inside = theme.steps.findIndex(st => /finished, furnished room, spotless/.test(st[1]));
  assert.ok(inside > at(/outer walls are painted/) && inside < at(/wide shot from far outside/), 'xong nhà: quay trong rồi mới quay toàn cảnh ngoài');
  assert.match(theme.base, /weeds and vines/);
  // camera luôn xen kẽ vì đi từ ngoài vào trong
  assert.equal(P.options({ theme: 'house_full', camera: 'fixed' }).camera, 'varied');
  // dài 10 phút: đủ 21 việc theo thứ tự, mỗi việc nhiều phần; ngắn thì vẫn có việc đầu và cuối
  const ten = P.stepsOf(P.options({ theme: 'house_full', minutes: 10 }));
  assert.equal(ten[0].step, 1);
  assert.equal(ten[ten.length - 1].step, 21);
  assert.deepEqual([...ten.map(s => s.step)].sort((a, b) => a - b), ten.map(s => s.step), 'không đảo thứ tự');
  const short = P.stepsOf(P.options({ theme: 'house_full', minutes: 1 }));
  assert.equal(short[0].step, 1);
  assert.equal(short[short.length - 1].step, 21);
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

const { Queue } = require('../src/queue.cjs');
test('chạy song song theo đoạn: số đoạn theo số tài khoản, đầu mỗi đoạn từ ảnh mốc, ảnh mốc làm từ ảnh gốc', () => {
  const c = P.options({ theme: 'house_full', minutes: 45 });                    // 270 cảnh
  assert.deepEqual(P.segmentsOf(c, 1), [0]);
  assert.equal(P.segmentsOf(c, 4).length, 4);
  assert.equal(P.segmentsOf(c, 10).length, 10);
  assert.equal(P.segmentsOf(c, 99).length, 10, 'tối đa 10');
  assert.equal(P.segmentsOf(P.options({ theme: 'house_full', minutes: 45, parallel: 3 }), 10).length, 3, 'chọn tay 3 đoạn');
  assert.equal(P.segmentsOf(P.options({ theme: 'house_full', minutes: 45, parallel: 1 }), 10).length, 1, 'chọn 1 chuỗi');
  assert.equal(P.segmentsOf(P.options({ theme: 'house_full', minutes: 1 }), 10).length, 1, 'video ngắn không chia');
  assert.equal(P.segmentsOf(P.options({ theme: 'house_full', minutes: 2 }), 10).length, 2, 'mỗi đoạn có ít nhất ' + P.MIN_SEGMENT + ' cảnh');
  const starts = P.segmentsOf(c, 4);
  assert.deepEqual(P.seamsOf(c, 4), starts.slice(1));
  const jobs = P.buildJobs(c, { storyId: 's', photo: '', accounts: 4 });
  const clips = jobs.filter(j => j.phase === 'clip'), images = jobs.filter(j => j.phase === 'image');
  assert.equal(clips.length, 270);
  assert.deepEqual(images.map(j => j.number), [1, 2, 3, 4], 'ảnh gốc + 3 ảnh mốc');
  starts.slice(1).forEach((idx, k) => {
    assert.deepEqual(clips[idx].needs, [{ phase: 'image', number: k + 2 }]);
    assert.deepEqual(clips[idx].refList, [{ phase: 'image', number: k + 2 }]);
    assert.doesNotMatch(clips[idx].prompt, /continues directly from the previous clip/);
  });
  assert.deepEqual(clips[1].needs, [{ phase: 'clip', number: 1 }], 'trong một đoạn vẫn nối bằng khung cuối');
  for (const key of images.slice(1)) {
    assert.deepEqual(key.refList, [{ phase: 'image', number: 1 }]);
    assert.match(key.prompt, /^Edit the attached photo\./);
    assert.match(key.prompt, /Currently in progress/);
  }
  assert.ok(images[3].prompt.includes('already finished') && images[3].prompt.length > images[1].prompt.length, 'mốc càng sau càng nhiều việc đã xong');
  const withPhoto = P.buildJobs(c, { storyId: 's', photo: 'C:\\a.jpg', accounts: 3 });
  assert.deepEqual(withPhoto.filter(j => j.phase === 'image').map(j => [j.number, j.needs, j.refList]), [[2, [], [{ file: 'C:\\a.jpg' }]], [3, [], [{ file: 'C:\\a.jpg' }]]]);
  assert.ok(P.buildJobs(c, { storyId: 's', accounts: 1 }).every(j => j.phase === 'clip' || j.number === 1), 'một tài khoản: không có ảnh mốc');
  assert.ok(P.buildJobs(c, { storyId: 's', accounts: 4 }).length <= 740);
});

test('các đoạn chạy thật sự song song trên nhiều tài khoản, mỗi đoạn vẫn nối tiếp bằng khung cuối', async () => {
  const c = P.options({ theme: 'cabin', minutes: 3 });                           // 23 cảnh → 3 đoạn
  const jobs = P.buildJobs(c, { storyId: 'S', photo: '', accounts: 3 });
  let running = 0, max = 0; const refs = {};
  const q = new Queue({ save: async () => {}, concurrency: 3, accounts: 3, gateWaitMs: 2, run: async (j, slot) => {
    j.account = slot + 1; running++; max = Math.max(max, running);
    refs[j.phase + j.number] = [...j.references];
    await new Promise(r => setTimeout(r, 3)); running--;
    if (j.phase === 'clip') j.lastFrame = `/f/${j.number}.png`;
    return j.phase === 'image' ? `/a/${j.number}.png` : `/v/${j.number}.mp4`;
  } });
  await q.add(jobs);
  await q.start('restore');
  assert.ok(q.jobs.every(j => j.status === 'completed'), q.jobs.filter(j => j.status !== 'completed').length + ' việc chưa xong');
  assert.ok(max >= 2, 'có ít nhất 2 cảnh chạy cùng lúc: ' + max);
  const starts = P.segmentsOf(c, 3);
  assert.deepEqual(refs['clip1'], ['/a/1.png']);
  assert.deepEqual(refs['clip' + (starts[1] + 1)], ['/a/2.png'], 'đầu đoạn 2 dùng ảnh mốc 2');
  assert.deepEqual(refs['clip' + (starts[2] + 1)], ['/a/3.png']);
  assert.deepEqual(refs['clip2'], ['/f/1.png'], 'trong đoạn dùng khung cuối cảnh trước');
  assert.deepEqual(refs['clip' + (starts[1] + 2)], ['/f/' + (starts[1] + 1) + '.png']);
});

test('người trong video: mặc định NỮ trẻ ở mọi chủ đề, chọn Nam thì ra nam, nữ có trong mọi clip, ảnh nền và ảnh mốc', () => {
  const female = /woman/, male = /\bman\b/;
  for (const theme of P.THEMES) {
    const c = P.options({ theme: theme.id, minutes: 3, place: 'x', customSteps: 'a\nb\nc' });
    assert.equal(c.who, 'female');
    assert.match(c.personDesc, female, theme.id);
    assert.doesNotMatch(c.personDesc, male, theme.id);
    assert.match(c.personDesc, /fair light skin/);
    assert.match(c.personDesc, /pretty, youthful/);
    assert.doesNotMatch(c.personDesc, /beard|clean-shaven/);
  }
  // Nữ ở sinh tồn và ở dọn nhà là hai bộ đồ khác nhau, đều là người trưởng thành.
  assert.match(P.options({ theme: 'cabin' }).personDesc, /28-year-old woman.*work jacket/);
  assert.match(P.options({ theme: 'house_full' }).personDesc, /27-year-old woman.*hard hat/);
  // Nam: đúng mô tả cũ.
  const m = P.options({ theme: 'house_full', who: 'male' });
  assert.equal(m.personDesc, P.WORKER); assert.match(m.personDesc, male);
  assert.equal(P.options({ theme: 'cabin', who: 'male' }).personDesc, P.SURVIVOR);
  // Giá trị lạ → nữ; tự mô tả thì thắng lựa chọn.
  assert.equal(P.options({ who: 'robot' }).who, 'female');
  assert.equal(P.options({ who: 'male', personDesc: 'a 25-year-old woman with red hair' }).personDesc, 'a 25-year-old woman with red hair');
  // Mọi chỗ cần người đều nói đúng người nữ: sổ cảnh trong mọi clip, ảnh nền, ảnh mốc.
  const c = P.options({ theme: 'house_full', minutes: 10, place: 'brick house' });
  const jobs = P.buildJobs(c, { storyId: 'S', photo: '', accounts: 3 });
  const prompts = jobs.map(j => j.prompt);
  assert.ok(prompts.length > 70);
  assert.ok(prompts.every(t => /woman/.test(t)), 'mọi prompt (ảnh nền, cảnh, ảnh mốc) phải nói là nữ');
  assert.ok(prompts.every(t => !/\ba (30|35)-year-old man\b/.test(t)));
  assert.match(jobs.find(j => j.phase === 'image' && j.number === 2).prompt, /The person in the picture is a 27-year-old woman/);
});

test('«Giống người trong ảnh gốc»: bắt buộc có ảnh, prompt giữ nguyên mặt, tóc, da, giới tính của người trong ảnh', () => {
  const c = P.options({ theme: 'house_full', who: 'photo', place: 'x' });
  assert.equal(c.personDesc, P.PHOTO_PERSON);
  assert.match(c.personDesc, /exactly the same face, hairstyle, hair color, skin tone, apparent age, gender/);
  assert.ok(P.problems(c, { hasPhoto: false }).some(t => /Giống người trong ảnh gốc/.test(t)), 'thiếu ảnh thì báo');
  assert.ok(!P.problems(c, { hasPhoto: true }).some(t => /Giống người trong ảnh gốc/.test(t)));
  assert.ok(P.problems({ ...c, lang: 'en' }, { hasPhoto: false }).some(t => /Same person as in the photo/.test(t)));
  // Có tự mô tả thì không cần ảnh.
  assert.ok(!P.problems(P.options({ who: 'photo', place: 'x', personDesc: 'a young woman with fair skin' }), { hasPhoto: false }).some(t => /ảnh gốc/.test(t)));
  const jobs = P.buildJobs(c, { storyId: 'S', photo: 'C:\\a.jpg', accounts: 1 });
  assert.match(jobs[0].prompt, /same single person who appears in the attached reference photo/);
  assert.ok(P.screenConfig(c).length === 0, 'mô tả theo ảnh không bị coi là tên người nổi tiếng');
});

test('Google Flow: luôn clip 8 giây, 120 phút = 900 clip, job mang provider/aspect, không lời thoại, mặc định là Muse', () => {
  assert.equal(P.options({ theme: 'cabin' }).provider, 'muse');
  assert.equal(P.options({ theme: 'cabin', provider: 'lạ' }).provider, 'muse');
  assert.deepEqual(P.PROVIDERS, ['muse', 'flow']);
  const f = extra => P.options({ theme: 'house_full', provider: 'flow', ...extra });
  assert.equal(f({ minutes: 20, seconds: 5 }).seconds, 8, 'Flow ép 8 giây, kể cả từ 20 phút');
  assert.equal(P.clipCount(f({ minutes: 1 })), 8);
  assert.equal(P.clipCount(f({ minutes: 20 })), 150);
  assert.equal(P.clipCount(f({ minutes: 120 })), 900);
  assert.equal(P.clipCount(P.options({ theme: 'house_full', minutes: 120 })), 720, 'Muse vẫn 720');
  const cfg = f({ minutes: 5, aspect: '9:16' });
  const jobs = P.buildJobs(cfg, { storyId: 's', photo: '', accounts: 3 });
  assert.ok(jobs.length > 38 && jobs.every(j => j.provider === 'flow' && j.aspect === '9:16'), 'mọi job (ảnh, clip) đều chạy bằng Flow');
  const clips = jobs.filter(j => j.phase === 'clip');
  assert.equal(clips.length, 38);
  assert.match(clips[1].prompt, /no speech, no dialogue, no singing, no narration, no music/);
  assert.deepEqual(clips[1].needs, [{ phase: 'clip', number: 1 }], 'vẫn nối bằng khung cuối của clip trước');
  const museJobs = P.buildJobs(P.options({ theme: 'house_full', minutes: 5 }), { storyId: 's', photo: '', accounts: 3 });
  assert.ok(museJobs.every(j => !j.provider), 'Muse: không gắn provider');
});

// ---- chia lại truyện đang chạy
function liveStory(accounts, { photo = '/p.jpg', doneClips = 13, running = 14 } = {}) {
  const cfg = P.options({ theme: 'house_full', minutes: 15, seconds: 8 });
  const jobs = P.buildJobs(cfg, { storyId: 'S', photo, accounts }).map((j, i) => ({ ...j, id: 'j' + i, status: 'pending' }));
  const clips = jobs.filter(j => j.phase === 'clip');
  jobs.filter(j => j.phase === 'image').forEach(j => { j.status = 'completed'; j.output = '/img' + j.number + '.png'; });
  clips.slice(0, doneClips).forEach(j => { j.status = 'completed'; j.output = '/v' + j.number + '.mp4'; j.lastFrame = '/f' + j.number + '.png'; });
  if (running) clips[running - 1].status = 'running';
  return { cfg, jobs, clips };
}

test('resegment: truyện tạo lúc 3 tài khoản, giờ có 5 → chia thêm 2 đoạn ở phần chưa làm, ảnh mốc biết «đã xong những gì»', () => {
  const { jobs, clips } = liveStory(3);
  const plan = P.resegment(jobs, 5);
  assert.ok(plan, 'phải chia được');
  assert.equal(plan.images.length, 2);
  assert.equal(plan.changes.length, 2);
  assert.deepEqual(plan.images.map(j => j.number), [4, 5], 'tiếp số sau ảnh mốc 2, 3 đã có');
  assert.equal(plan.seams.length, 4, '5 đoạn = 4 chỗ nối');
  assert.ok(plan.seams.every((v, i, a) => i === 0 || v > a[i - 1]));
  for (const ch of plan.changes) {
    const job = jobs.find(j => j.id === ch.id);
    assert.equal(job.status, 'pending');
    assert.ok(!ch.prompt.includes('continues directly from the previous clip'), 'đầu đoạn mới không còn dòng nối cảnh trước');
    assert.deepEqual(ch.needs, ch.refList.map(r => ({ phase: r.phase, number: r.number })));
    assert.equal(ch.needs[0].phase, 'image');
    assert.ok(plan.images.some(im => im.number === ch.needs[0].number));
  }
  for (const im of plan.images) {
    assert.match(im.prompt, /Edit the attached photo/);
    assert.match(im.prompt, /already finished: /, 'có liệt kê các bước đã xong');
    assert.deepEqual(im.refList, [{ file: '/p.jpg' }]);
    assert.deepEqual(im.needs, []);
  }
});

test('resegment: không chia khi đã đủ đoạn, khi chỉ muốn 1, hoặc khi còn quá ít cảnh chưa làm', () => {
  const five = liveStory(5);
  assert.equal(P.resegment(five.jobs, 5), null, 'đã đủ 5 đoạn đang hoạt động');
  assert.equal(P.resegment(liveStory(3).jobs, 1), null);
  const nearEnd = liveStory(1, { doneClips: 108, running: 109 });
  assert.equal(P.resegment(nearEnd.jobs, 5), null, 'còn 5 cảnh: chia ra chỉ thêm chỗ nối');
});

test('resegment: một chuỗi duy nhất, chưa có ảnh gốc của người dùng → ảnh mốc dựa vào ảnh Muse tạo (ảnh 1)', () => {
  const { jobs } = liveStory(1, { photo: '', doneClips: 10, running: 11 });
  const plan = P.resegment(jobs, 4);
  assert.equal(plan.images.length, 3);
  assert.deepEqual(plan.images[0].needs, [{ phase: 'image', number: 1 }]);
  assert.deepEqual(plan.images[0].refList, [{ phase: 'image', number: 1 }]);
  assert.deepEqual(plan.images.map(j => j.number), [2, 3, 4]);
  const starts = plan.changes.map(c => c.number).sort((a, b) => a - b);
  assert.ok(starts[0] > 15, 'điểm chia nằm trong phần chưa làm, sau cảnh đang chạy');
  assert.ok(Math.min(starts[1] - starts[0], 114 - starts[2]) >= 4, 'mỗi đoạn còn ít nhất 4 cảnh');
});

test('resegment: không đụng cảnh đã gửi / đã xong; ảnh gốc của truyện Flow giữ provider', () => {
  const { jobs, clips } = liveStory(3);
  // một cảnh ở giữa đã bị gửi dở (đang chờ gửi lại) thì không dùng làm điểm chia
  const plan0 = P.resegment(jobs, 5);
  const used = new Set(plan0.changes.map(c => c.number));
  clips.filter(c => used.has(c.number)).forEach(c => { c.resumeMode = 'resubmit'; });
  const plan1 = P.resegment(jobs, 5);
  if (plan1) for (const ch of plan1.changes) assert.ok(!jobs.find(j => j.id === ch.id).resumeMode);
  const flow = liveStory(3).jobs.map(j => ({ ...j, provider: 'flow', aspect: '16:9' }));
  const planF = P.resegment(flow, 5);
  assert.ok(planF.images.every(im => im.provider === 'flow' && im.aspect === '16:9'));
});

test('thumbnail 16:9: prompt nhờ Muse ghép ảnh trước / sau, có tiêu đề; số việc cao hơn mọi ảnh mốc và resegment bỏ qua nó', () => {
  const vi = P.thumbnailPrompt({ title: 'Dọn nhà bỏ hoang', lang: 'vi' });
  assert.match(vi, /16:9/); assert.match(vi, /FIRST attached photo[^\n]*BEFORE/); assert.match(vi, /SECOND attached photo[^\n]*AFTER/);
  assert.match(vi, /"Dọn nhà bỏ hoang"/); assert.match(vi, /"TRƯỚC"/); assert.match(vi, /"SAU"/);
  assert.match(P.thumbnailPrompt({ title: 'Old house "wow"', lang: 'en' }), /"BEFORE"/);
  assert.doesNotMatch(P.thumbnailPrompt({ title: 'a "b" c' }), /"a "b" c"/);
  assert.doesNotMatch(P.thumbnailPrompt({}), /exactly these words/);
  assert.ok(P.THUMB_NUMBER >= 100);
  const config = P.options({ theme: 'house_full', minutes: 6, seconds: 8, aspect: '16:9', person: false, parallel: 1, lang: 'vi' });
  const jobs = P.buildJobs(config, { storyId: 's', photo: 'p.png' }).map((j, i) => ({ ...j, id: 'j' + i, status: 'pending' }));
  const withThumb = [...jobs, { kind: 'restore', phase: 'image', number: P.THUMB_NUMBER, title: 'Thumbnail 16:9', prompt: 'x', id: 'thumb', status: 'pending' }];
  const a = P.resegment(jobs, 3), b = P.resegment(withThumb, 3);
  assert.ok(a && b);
  assert.deepEqual(b.images.map(j => j.number), a.images.map(j => j.number));
  assert.ok(b.images.every(j => j.number < P.THUMB_NUMBER));
});

test('đồ cầm trên tay: mọi cảnh chỉ cầm một dụng cụ giữ nguyên cả clip; sang bước mới thì đặt cái cũ xuống rồi nhặt cái mới', () => {
  const config = P.options({ theme: 'house_full', minutes: 5, seconds: 8, aspect: '16:9', person: true, parallel: 1, lang: 'vi' });
  const jobs = P.buildJobs(config, { storyId: 's', photo: 'p.png' }).filter(j => j.phase === 'clip');
  assert.ok(jobs.length > 10);
  assert.ok(jobs.every(j => /Hand items: the person holds ONLY the one tool/.test(j.prompt)), 'cảnh nào cũng có luật đồ cầm');
  assert.doesNotMatch(jobs[0].prompt, /Changing tools/, 'cảnh đầu chưa có dụng cụ trước');
  const starts = jobs.filter(j => /STEP (\d+) of \d+(, part 1 of \d+)?:/.test(j.prompt.split('\n').find(l => /^STEP /.test(l)) || '') && !/STEP 1 of/.test(j.prompt));
  assert.ok(starts.length > 0 && starts.every(j => /Changing tools: the person first puts the previous tool down/.test(j.prompt)), 'đầu mỗi bước mới: đặt dụng cụ cũ xuống rồi nhặt dụng cụ mới');
  const cont = jobs.find(j => /part [2-9] of/.test(j.prompt));
  if (cont) assert.doesNotMatch(cont.prompt, /Changing tools/, 'cảnh tiếp tục cùng một bước thì giữ nguyên dụng cụ, không đổi');
});

test('ảnh mốc đầu đoạn: dặn trạng thái đã xong (sơn rồi thì tường sạch, lát sàn rồi thì sàn mới…) và giữ đúng một ngôi nhà', () => {
  const config = P.options({ theme: 'house_full', minutes: 20, seconds: 8, aspect: '16:9', person: true, parallel: 1, lang: 'vi' });
  const steps = P.stepsOf(config), total = steps.length;
  const at = re => steps.findIndex(st => re.test(st.en));
  const early = P.keyframePrompt(config, steps[0], 0, total);
  assert.doesNotMatch(early, /So the place now looks like this/, 'đầu bài chưa có gì xong');
  const flooring = P.keyframePrompt(config, steps[at(/new flooring is laid/)], at(/new flooring is laid/), total);
  assert.match(flooring, /already painted: clean, even and fresh, with no peeling paint or wallpaper/);
  assert.match(flooring, /every wall and ceiling is smooth and flat/);
  assert.doesNotMatch(flooring, /whole inside floor is already covered/, 'đang lát sàn thì chưa xong sàn');
  const windows = P.keyframePrompt(config, steps[at(/windows and new doors/)], at(/windows and new doors/), total);
  assert.match(windows, /already painted/); assert.match(windows, /whole inside floor is already covered with new flooring planks/);
  const wiring = P.keyframePrompt(config, steps[at(/new wiring/)], at(/new wiring/), total);
  assert.match(wiring, /windows and doors are new, clean and sealed/);
  const last = P.keyframePrompt(config, steps[total - 1], total - 1, total);
  assert.match(last, /the room is furnished and decorated/);
  for (const text of [early, flooring, windows, wiring, last]) assert.match(text, /The building keeps its exact architecture in every picture: the same number of floors, the same roof shape/);
  // chủ đề tự viết không có danh sách bước thì không thêm trạng thái bịa
  const custom = P.options({ theme: 'custom', customText: 'dọn phòng', minutes: 5, seconds: 8, aspect: '16:9', person: false, parallel: 1, lang: 'vi' });
  assert.doesNotMatch(P.keyframePrompt(custom, P.stepsOf(custom)[3], 3, P.stepsOf(custom).length), /So the place now looks like this/);
});

// ---- 1.9.7: xây bếp + sinh tồn tự nhiên (nhịp nhanh / thật / chậm, lau mồ hôi hiếm, khóa chất liệu)
const STOVES = ['stove_clay', 'stove_brick', 'stove_ring', 'stove_oven', 'stove_stone'];
const promptsOf = (theme, minutes = 8) => {
  const c = P.options({ theme, minutes, seconds: 8 }), steps = P.stepsOf(c);
  return { c, steps, prompts: steps.map((st, i) => P.clipPrompt(c, st, i + 1, steps.length, { first: i === 0 })) };
};

test('5 chủ đề xây bếp: 18 bước đúng thứ tự thợ làm, mặc định 8 phút, có tiêu đề tiếng Anh, không bước nào nói bếp sắt', () => {
  assert.deepEqual(P.THEMES.filter(t => t.id.startsWith('stove_')).map(t => t.id), STOVES);
  assert.ok(P.THEMES.findIndex(t => t.id === STOVES[4]) < P.THEMES.findIndex(t => t.id === 'custom'), 'chủ đề tự nhập vẫn nằm cuối');
  for (const id of STOVES) {
    const t = P.themeOf(id);
    assert.equal(t.steps.length, 18, id);
    assert.equal(t.defaultMinutes, 8, id);
    assert.ok(t.survival && t.person, id);
    assert.equal(P.EN[id].titles.length, 18, id);
    assert.ok(P.EN[id].label && P.EN[id].hint && P.EN[id].placeholder, id);
    assert.ok(t.steps.every(st => st.length === 3 && 'fns'.includes(st[2])), id + ': mỗi bước có nhịp f / n / s');
    assert.ok(new Set(t.steps.map(st => st[2])).size === 3, id + ': đủ cả ba nhịp');
    assert.ok(t.steps.every(st => !/\b(iron|steel|metal|welds?|gas|electric)\b/i.test(st[1].replace(/(?:\(|; the chimney is solid brick, )?not a metal pipe\)?/gi, ''))), id + ': bước không nhắc bếp sắt / gas / điện (chỉ được nói «không phải ống kim loại»)');
    assert.ok(t.steps.every(st => !/\b(he|she|his|her|him)\b/i.test(st[1])), id + ': không dùng đại từ giới tính (người mặc định là nữ)');
    assert.ok(t.locks.length >= 2 && t.locks.every((l, i, a) => l[0] >= 1 && l[0] <= 18 && (i === 0 || l[0] > a[i - 1][0])), id + ': các mốc khóa tăng dần');
    assert.ok(t.locks.every(l => /never metal|no metal|never a different/.test(l[1]) || /no .*metal body/.test(l[1])), id + ': khóa nói rõ không phải kim loại');
  }
  const en = P.stepsOf(P.options({ theme: 'stove_brick', minutes: 8, lang: 'en' }));
  assert.equal(en[0].title, 'Mark the outline (1/3)', '60 cảnh ÷ 18 bước: bước đầu 3 cảnh');
  // 8 phút = 60 cảnh 8 giây, đủ cả 18 bước, mỗi bước 3–4 cảnh
  for (const id of STOVES) {
    const { steps } = promptsOf(id);
    assert.equal(steps.length, 60);
    assert.equal(new Set(steps.map(s => s.step)).size, 18, id);
    assert.ok(steps.every(s => s.parts >= 3 && s.parts <= 4), id);
  }
  assert.equal(P.clipCount(P.options({ theme: 'stove_clay', minutes: 10, seconds: 8 })), 75, '10 phút = 75 cảnh');
});

test('sinh tồn: ba nhịp xen kẽ (tua nhanh, thời gian thật, chậm tỉ mỉ), không còn «6x», «luôn nhanh», «không bao giờ chậm»', () => {
  for (const id of [...STOVES, 'shelter', 'cabin', 'bunker']) {
    const { prompts } = promptsOf(id, id.startsWith('stove') ? 8 : 5);
    const all = prompts.join('\n');
    assert.match(all, /Pace: BRISK/, id);
    assert.match(all, /Pace: REAL TIME/, id);
    assert.match(all, /Pace: SLOW AND CAREFUL/, id);
    assert.doesNotMatch(all, /FAST-MOTION|about 6x speed|Never slow motion|never slow or calm movement|Pace: fast and energetic|sped up about 4x|Pace: FAST-FORWARD/, id);   // không còn tua nhanh: Muse hiểu thành «gạch tự mọc ra»
    assert.ok(prompts.every(p => /^Amount of work: in these 8 seconds only the small amount of work that one person can really do/m.test(p) && /never appear, disappear or move by themselves/.test(p) && /keeps exactly the same shape, size, position and material for the whole clip/.test(p)), id + ': mỗi cảnh chỉ làm một lượng việc nhỏ có thật, phần đã xây giữ nguyên');
    assert.ok(prompts.every(p => (p.match(/^Pace: /gm) || []).length === 1), id + ': mỗi cảnh đúng một dòng nhịp');
    // nhịp của cảnh đi theo bước: các cảnh cùng một bước giữ nguyên nhịp
    const byStep = new Map();
    prompts.forEach((p, i) => { const k = /STEP (\d+) of/.exec(p)[1], pace = /^Pace: ([A-Z -]+)\./m.exec(p)[1]; byStep.set(k, new Set([...(byStep.get(k) || []), pace])); });
    assert.ok([...byStep.values()].every(set => set.size === 1), id);
  }
  // chủ đề dọn nhà vẫn tua nhanh như trước
  const house = P.options({ theme: 'house_full', minutes: 5 }), hs = P.stepsOf(house);
  assert.match(P.clipPrompt(house, hs[3], 4, hs.length), /FAST-MOTION real-life video[^\n]*about 6x speed/);
  assert.match(P.clipPrompt(house, hs[3], 4, hs.length), /Pace: fast and energetic/);
  assert.doesNotMatch(P.clipPrompt(house, hs[3], 4, hs.length), /Pace: REAL TIME|OBJECT LOCK|Technique:/);
});

test('sinh tồn: lau mồ hôi rất hiếm (không ở 7 clip đầu, cách nhau 15 clip), diễn bình tĩnh tự nhiên, không nhăn nhó / mồ hôi chảy ròng', () => {
  const { prompts } = promptsOf('stove_clay');
  const wipes = prompts.map((p, i) => (/briefly wipes the forehead/.test(p) ? i + 1 : 0)).filter(Boolean);
  assert.deepEqual(wipes, [8, 23, 38, 53], 'tối đa 4 lần trong 8 phút');
  assert.ok(prompts.slice(0, 7).every(p => /no wiping gesture of any kind/.test(p)), '7 clip đầu cấm lau mặt');
  assert.equal(prompts.filter(p => /no wiping gesture of any kind/.test(p)).length, 56, 'các clip còn lại cấm động tác lau mặt');
  const all = prompts.join('\n');
  assert.doesNotMatch(all, /HARD physical labour|sweat running down|frowning with effort|jaw clenched|shirt dark with sweat|soaked in sweat|exhausted/);
  assert.match(all, /works calmly and naturally like an experienced worker/);
  assert.match(all, /No grimacing, no clenched jaw, no frowning, no dramatic panting/);
  const faceless = P.options({ theme: 'stove_clay', minutes: 8, faceless: true }), fs = P.stepsOf(faceless);
  assert.match(P.clipPrompt(faceless, fs[10], 11, 60), /body only: a steady posture and calm breathing/);
  // ảnh mốc: người bình tĩnh, không ướt đẫm mồ hôi
  const c = P.options({ theme: 'stove_clay', minutes: 8 }), st = P.stepsOf(c), kf = P.keyframePrompt(c, st[50], 50, 60);
  assert.match(kf, /calm, with slightly damp hair and a little tired/);
  assert.doesNotMatch(kf, /soaked in sweat|shirt dark with sweat|sweaty, hair damp/);
  assert.match(P.keyframePrompt(c, st[3], 3, 60), /calm and fresh, at most a faint shine of sweat/);
});

test('sinh tồn: kỹ thuật làm thật (cầm dụng cụ đúng, vật liệu phản ứng thật, không động tác giả) có trong mọi cảnh', () => {
  for (const id of [...STOVES, 'shelter', 'cabin', 'bunker']) {
    const { prompts } = promptsOf(id, 5);
    assert.ok(prompts.every(p => /Technique: the person uses the real, correct technique/.test(p) && /No pretend or mimed actions/.test(p) && /no hands passing through objects/.test(p)), id);
    assert.ok(prompts.every(p => /LOCKED - these never change[^\n]*everything that is already built/.test(p) && !/number of floors/.test(p)), id + ': dùng luật khóa cho vật đang xây, không nói tầng nhà');
  }
});

test('khóa chất liệu bếp: từ lúc bếp xuất hiện tới cảnh cuối, mọi cảnh nhắc đúng chất liệu; không bao giờ thành bếp sắt', () => {
  const must = { stove_clay: /CLAY stove[^\n]*no metal body, no cast iron, no steel/, stove_brick: /RED BRICK stove[^\n]*no metal body, no cast iron, no steel/, stove_ring: /ring of RED BRICKS[^\n]*no metal ring, no steel fire bowl, no cast iron/, stove_oven: /CLAY dome oven[^\n]*no metal body, no steel oven/, stove_stone: /STONE stove[^\n]*no brick body, no metal body/ };
  for (const id of STOVES) {
    const t = P.themeOf(id), first = t.locks[0][0], { steps, prompts } = promptsOf(id);
    prompts.forEach((p, i) => {
      const has = /^OBJECT LOCK /m.test(p);
      assert.equal(has, steps[i].step >= first, `${id} cảnh ${i + 1} (bước ${steps[i].step}): khóa từ bước ${first}`);
      if (has) assert.match(p, /never changes[^\n]*never turns into a different kind of object and never changes its material/);
    });
    const last = prompts[prompts.length - 1];
    assert.match(last, /^OBJECT LOCK .*never metal/m, id + ': cảnh cuối vẫn nhắc không phải kim loại');
    assert.ok(prompts.some(p => must[id].test(p)), id + ': có cảnh mang khóa chất liệu đầy đủ');
    // mốc khóa sau thay mô tả của mốc trước (không dồn hai mô tả)
    assert.ok(prompts.every(p => (p.match(/^OBJECT LOCK /gm) || []).length <= 1), id);
  }
  // bếp đất sét: bếp được quét vôi trắng thì khóa chuyển sang vôi trắng nhưng vẫn là đất sét
  const clay = promptsOf('stove_clay');
  assert.match(clay.prompts[clay.steps.findIndex(s => s.step === 14)], /chimney of solid clay at the back, not a metal pipe; it is clay, never metal/);
  assert.match(clay.prompts[clay.steps.findIndex(s => s.step === 16)], /matt white lime-washed clay[^\n]*the stove is clay, never metal/);
  // bước đầu: chưa có vật nào, chưa khóa gì
  assert.doesNotMatch(clay.prompts[0], /OBJECT LOCK/);
  // nhà gỗ và hầm: bếp xây bằng đá + đất sét / đất sét, không phải bếp sắt, và cảnh cuối nhắc lại
  const cabin = promptsOf('cabin', 5), bunker = promptsOf('bunker', 5);
  const lockedFrom = (r, from) => r.prompts.every((p, i) => /^OBJECT LOCK /m.test(p) === (r.steps[i].step >= from));
  assert.ok(lockedFrom(cabin, 13), 'nhà gỗ: khóa từ bước 13');
  assert.ok(lockedFrom(bunker, 14), 'hầm: khóa từ bước 14');
  assert.match(cabin.prompts.at(-1), /STONE-and-clay stove with a short stone chimney[^\n]*no metal body, no cast iron, no steel/);
  assert.match(bunker.prompts.at(-1), /CLAY stove with a short clay chimney[^\n]*no metal body, no cast iron, no steel/);
  assert.ok(!/stone stove with a chimney pipe|clay stove with a chimney\b/.test(JSON.stringify(P.THEMES.filter(t => ['cabin', 'bunker'].includes(t.id)))), 'bước xây bếp đã đổi lời: không còn «chimney pipe» (ống sắt)');
  // khung hình bếp: gần hơn, thấy cả bếp lẫn người
  assert.equal(clay.c.camera, 'fixed', 'bếp: mặc định cố định một góc quay');
  assert.match(clay.prompts[5], /Camera: one fixed camera on a tripod[^\n]*The framing never changes: a medium-wide shot filmed from a few metres away: the whole stove and the person's whole body \(head included\) are always in the frame/);
  assert.doesNotMatch(clay.prompts[5], /WIDE, distant shot|^SHOT:/m);
  const varied = P.options({ theme: 'stove_clay', minutes: 8, camera: 'varied' });
  assert.equal(varied.camera, 'varied', 'vẫn chọn lại được góc xen kẽ');
  assert.match(P.clipPrompt(varied, P.stepsOf(varied)[5], 6, 60), /Camera: a still, tripod-mounted real camera like a documentary about building by hand: a medium-wide shot/);
  assert.equal(cabin.c.camera, 'varied', 'nhà gỗ, hầm: giữ như cũ');
  assert.match(cabin.prompts[5], /documentary about building by hand: a WIDE, distant shot filmed from far away/);
  // dọn nhà không bị ảnh hưởng
  const house = P.options({ theme: 'house_full', minutes: 5 });
  assert.ok(P.stepsOf(house).every((st, i, a) => !/^OBJECT LOCK /m.test(P.clipPrompt(house, st, i + 1, a.length))));
});

test('ảnh mốc và chia lại truyện bếp: ảnh mốc cũng khóa chất liệu bếp, dùng chữ «vật đang xây» thay vì «ngôi nhà»', () => {
  const c = P.options({ theme: 'stove_brick', minutes: 8 }), steps = P.stepsOf(c), at = steps.findIndex(s => s.step === 13);
  const kf = P.keyframePrompt(c, steps[at], at, steps.length);
  assert.match(kf, /OBJECT LOCK[^\n]*smooth pale plaster/);
  assert.match(kf, /The thing being built keeps its exact shape, size, position, material and color/);
  assert.doesNotMatch(kf, /number of floors|exact architecture/);
  assert.match(kf, /View: a medium-wide shot filmed from a few metres away/);
  assert.match(P.keyframePrompt(c, steps[0], 0, steps.length), /Edit the attached photo/);
  assert.doesNotMatch(P.keyframePrompt(c, steps[0], 0, steps.length), /OBJECT LOCK/, 'bước đầu chưa khóa');
  // truyện đang chạy (đã có prompt) chia thêm đoạn: ảnh mốc lấy nguyên dòng khóa từ prompt của cảnh đó
  const jobs = P.buildJobs(c, { storyId: 'B', photo: '/p.jpg', accounts: 2 }).map((j, i) => ({ ...j, id: 'j' + i, status: 'pending' }));
  jobs.filter(j => j.phase === 'image').forEach(j => { j.status = 'completed'; j.output = '/img' + j.number + '.png'; });
  jobs.filter(j => j.phase === 'clip').slice(0, 5).forEach(j => { j.status = 'completed'; j.output = '/v' + j.number + '.mp4'; j.lastFrame = '/f' + j.number + '.png'; });
  const plan = P.resegment(jobs, 5);
  assert.ok(plan && plan.images.length >= 2, 'phải chia thêm đoạn');
  for (const im of plan.images) {
    const ch = plan.changes.find(x => x.needs[0].number === im.number), job = jobs.find(j => j.id === ch.id);
    const lock = (/^OBJECT LOCK[^\n]*/m.exec(job.prompt) || [''])[0];
    assert.ok(lock, 'cảnh ở giữa truyện đã có khóa');
    assert.ok(im.prompt.includes(lock), 'ảnh mốc mang đúng dòng khóa của cảnh đó');
    assert.match(im.prompt, /The thing being built keeps its exact shape/);
  }
  // truyện dọn nhà chia lại vẫn dùng chữ «ngôi nhà» như cũ
  const { jobs: hj } = liveStory(3), hp = P.resegment(hj, 5);
  assert.ok(hp.images.every(im => /The building keeps its exact architecture/.test(im.prompt) && !/OBJECT LOCK/.test(im.prompt)));
});

test('có ảnh tham chiếu: người và quần áo trong ảnh được giữ nguyên, không ép trang phục mặc định; khóa trang phục trong dòng PERSON; chữ mồ hôi không nhắc áo', () => {
  const all = jobs => jobs.map(j => j.prompt).join('\n');
  const defaultOutfit = /green work jacket.*grey beanie/;
  for (const theme of ['stove_brick', 'cabin', 'house_full']) {
    const photoJobs = P.buildJobs(P.options({ theme, minutes: 4 }), { storyId: 's', photo: 'C:\\anh-nguoi.png', accounts: 3 });
    const text = all(photoJobs);
    assert.match(text, /the person already shown in the attached photo, kept exactly as in that photo/, theme);
    assert.match(text, /the very same clothes, hat and gloves: never change, add or remove any garment/, theme);
    assert.match(text, /Only if the attached photo shows no person at all, the person is a 2\d-year-old woman/, theme + ': mô tả mặc định chỉ là phương án khi ảnh không có người');
    assert.ok(photoJobs.filter(j => j.phase === 'image').every(j => /The person in the picture is the person already shown in the attached photo/.test(j.prompt)), theme + ': ảnh mốc sửa từ ảnh gốc cũng giữ người trong ảnh');
    assert.ok(photoJobs.filter(j => j.phase === 'clip').every(j => /the very same clothes, hat and gloves with nothing added, removed or swapped/.test(j.prompt)), theme);
    // không ảnh: như cũ
    const plain = all(P.buildJobs(P.options({ theme, minutes: 4 }), { storyId: 's' }));
    assert.doesNotMatch(plain, /already shown in the attached photo/, theme);
    assert.match(plain, /the very same clothes, hat and gloves with nothing added, removed or swapped/, theme);
  }
  // người dùng tự gõ mô tả người: nghe theo mô tả, không chèn «giống ảnh»
  const typed = all(P.buildJobs(P.options({ theme: 'cabin', minutes: 2, personDesc: 'a woman in a blue raincoat' }), { storyId: 's', photo: 'p.png' }));
  assert.doesNotMatch(typed, /already shown in the attached photo/);
  assert.match(typed, /a woman in a blue raincoat/);
  // «Giống người trong ảnh» vẫn dùng câu riêng, không lặp ghép
  const same = all(P.buildJobs(P.options({ theme: 'cabin', minutes: 2, who: 'photo' }), { storyId: 's', photo: 'p.png' }));
  assert.doesNotMatch(same, /Only if the attached photo shows no person/);
  assert.match(same, /exactly the same face, hairstyle, hair color/);
  // chữ mồ hôi không nhắc «áo thấm mồ hôi» (áo của người trong ảnh có thể là loại mỏng / sáng màu)
  for (const theme of ['stove_brick', 'cabin', 'house_full']) {
    const text = all(P.buildJobs(P.options({ theme, minutes: 8 }), { storyId: 's', photo: 'p.png', accounts: 2 }));
    assert.doesNotMatch(text, /shirt dark with sweat|sweat-dark back and shirt/, theme);
  }
  assert.doesNotMatch(all(P.buildJobs(P.options({ theme: 'house_full', minutes: 8, faceless: true }), { storyId: 's' })), /sweat-dark back and shirt/);
});
