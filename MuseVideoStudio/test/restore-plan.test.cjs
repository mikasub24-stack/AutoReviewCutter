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
  assert.match(line(20), /keeping exactly the framing/);
  assert.doesNotMatch(P.clipPrompt(house, hs[at(5)], at(5) + 1, hs.length), /camera follows/);
  const inside = P.options({ theme: 'house_in', minutes: 5 }), is = P.stepsOf(inside);
  assert.match(shotOf(inside, is[0], 1, is.length), /ONE fixed angle chosen so the whole action is clearly visible/);
  const fixed = P.options({ theme: 'cabin', minutes: 2, camera: 'fixed' });
  const prompt = P.clipPrompt(fixed, P.stepsOf(fixed)[0], 1, 15, { first: true });
  assert.doesNotMatch(prompt, /SHOT:/);
  assert.match(prompt, /one fixed camera on a tripod/);
});

test('cảm xúc và sức lực: việc nặng thì thở mạnh, đổ mồ hôi, lau mặt; càng về cuối càng mệt; không lộ mặt thì chỉ dùng dáng người; không có người thì không có dòng này', () => {
  const c = P.options({ theme: 'cabin', minutes: 5 }), steps = P.stepsOf(c), total = steps.length;
  const line = (cfg, st, n, t = total) => (P.clipPrompt(cfg, st, n, t).split('\n').find(l => l.startsWith('Emotion and effort')) || '');
  const heavy = steps.findIndex(s => /levels the ground with a shovel|cuts long straight poles/.test(s.en));
  assert.ok(heavy >= 0);
  const h = line(c, steps[heavy], heavy + 1);
  assert.match(h, /HARD physical labour/);
  assert.match(h, /sweat/);
  assert.match(h, /wipe the sweat from the face/);
  assert.match(h, /never by moving the camera to the face/);
  assert.match(line(c, steps[heavy], 2), /just started/);
  assert.match(line(c, steps[heavy], Math.round(total * 0.45)), /Several hours/);
  assert.match(line(c, steps[heavy], Math.round(total * 0.8)), /Many hours/);
  assert.match(line(c, steps[heavy], total), /almost done: exhausted/);
  const calm = P.stepsOf(P.options({ theme: 'cabin', minutes: 5 })).find(s => /stands proudly/.test(s.en));
  assert.match(line(c, calm, total), /relaxed, pleased expression/);
  const faceless = P.options({ theme: 'cabin', minutes: 5, faceless: true });
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
