const { test } = require('node:test');
const assert = require('node:assert/strict');
const { Queue } = require('../src/queue.cjs');
const sp = require('../src/story-plan.js');

const story = 'Ngày xưa có một cô bé tên Mai sống ở làng ven sông. Mỗi sáng Mai dậy sớm ra bến đón đò.\n\nMột hôm có chú cá vàng nhảy lên thuyền. Mai thả cá về sông và cá hứa sẽ giúp cô một điều ước.\n\nHết.';

test('chia nhanh gộp câu theo thời lượng, giữ đủ chữ, mỗi cảnh có lời đọc và prompt', () => {
  const scenes = sp.planStory(story, { seconds: 10, aspect: '16:9', style: 'hoạt hình màu nước', character: 'Mai, bé gái tóc đen' });
  assert.ok(scenes.length >= 2 && scenes.length <= 4, 'số cảnh ' + scenes.length);
  for (const [index, scene] of scenes.entries()) {
    assert.equal(scene.title, 'Cảnh ' + (index + 1));
    assert.ok(scene.voiceover.length > 0 && scene.voiceover.length <= 10 * sp.CHARS_PER_SECOND + 1, 'dài ' + scene.voiceover.length);
    assert.match(scene.prompt, /dài \d+ giây, tỷ lệ 16:9/);
    assert.ok(scene.prompt.includes(scene.voiceover));
    assert.match(scene.prompt, /Nhân vật: Mai, bé gái tóc đen/);
    assert.match(scene.prompt, /Phong cách hình ảnh: hoạt hình màu nước/);
    assert.match(scene.prompt, /Không chèn chữ, phụ đề/);
    assert.match(scene.prompt, /Audio: no speech, no dialogue, no singing/);
    assert.match(scene.prompt, /mouths closed/);
    assert.equal(scene.durationSeconds, sp.sceneSeconds(scene.voiceover, 10), 'giây của cảnh tự tính theo lời kể');
    assert.ok(scene.durationSeconds >= 3 && scene.durationSeconds <= 10);
    assert.ok(sp.estimateSeconds(scene.voiceover) <= scene.durationSeconds, 'lời đọc luôn vừa trong clip');
    assert.ok(scene.prompt.includes(`Tạo video dài ${scene.durationSeconds} giây`), 'prompt mẫu ghi đúng số giây của cảnh');
  }
  const joined = scenes.map(s => s.voiceover).join(' ').replace(/\s/g, '');
  assert.equal(joined, story.replace(/\s/g, ''));
});

test('báo lỗi tiếng Việt khi thiếu kịch bản hoặc cấu hình sai', () => {
  assert.throws(() => sp.planStory('   ', {}), /Dán kịch bản/);
  assert.throws(() => sp.planStory('a', { seconds: 1 }), /3 đến 10/);
  assert.throws(() => sp.planStory('a', { seconds: 11 }), /tối đa 10 giây/);
  assert.throws(() => sp.planStory('a', { aspect: '4:3' }), /16:9/);
});

const reply = `Dưới đây là kết quả:

**CẢNH 1**
**LỜI:** Ngày xưa có cô bé tên Mai sống ở làng ven sông.
**PROMPT:** Cô bé Mai tóc đen đứng trên bến sông lúc bình minh, sương mỏng,
máy quay lia chậm từ mặt nước lên khuôn mặt cô.

Cảnh 2:
Lời: Một hôm có chú cá vàng nhảy lên thuyền.
Prompt: Cá vàng bật lên khỏi mặt nước, Mai ngạc nhiên đưa tay đón.

### Scene 3
VOICE: Mai thả cá về sông.
PROMPT: Cận cảnh đôi tay thả cá, mặt nước gợn sóng.`;

test('tách trả lời của Muse (đậm, chữ hoa/thường, nhiều dòng, Scene/Cảnh) thành cảnh', () => {
  const scenes = sp.parseMuseReply(reply, { seconds: 10 });
  assert.equal(scenes.length, 3);
  assert.deepEqual(scenes.map(s => s.title), ['Cảnh 1', 'Cảnh 2', 'Cảnh 3']);
  assert.equal(scenes[0].voiceover, 'Ngày xưa có cô bé tên Mai sống ở làng ven sông.');
  assert.match(scenes[0].prompt, /bến sông lúc bình minh, sương mỏng,\nmáy quay lia chậm/);
  assert.equal(scenes[1].voiceover, 'Một hôm có chú cá vàng nhảy lên thuyền.');
  assert.match(scenes[1].prompt, /^Cá vàng bật lên/);
  assert.ok(scenes.every(s => s.prompt.includes(sp.NO_SPEECH)), 'prompt nào cũng có câu no speech, kể cả khi Muse quên');
  assert.equal(scenes[1].prompt.split(sp.NO_SPEECH).length, 2);
  assert.equal(scenes[2].voiceover, 'Mai thả cá về sông.');
  assert.ok(scenes.every(s => s.durationSeconds === sp.sceneSeconds(s.voiceover, 10)));
  assert.ok(scenes[2].durationSeconds < 10, 'lời ngắn thì clip ngắn, không cố định 10 giây');
});

test('thiếu PROMPT thì tự dựng prompt từ lời; không có cảnh nào thì báo lỗi rõ', () => {
  const scenes = sp.parseMuseReply('CẢNH 1\nLỜI: Mai ra bến sông.', { seconds: 10 });
  assert.match(scenes[0].prompt, /Mai ra bến sông\./);
  assert.throws(() => sp.parseMuseReply('Xin lỗi, tôi không làm được.'), /Chưa thấy cảnh nào/);
});

test('phụ đề chia theo câu, mỗi đoạn không quá dài, thời gian khít thời lượng', () => {
  const text = 'Ngày xưa có một cô bé tên Mai sống ở làng ven sông. Mỗi sáng Mai dậy sớm ra bến đón đò, mang theo cả giỏ bánh nhỏ để đổi lấy vài con cá tươi cho bữa sáng.';
  const chunks = sp.subtitleChunks(text, 9, { maxChars: 60 });
  assert.ok(chunks.length >= 3);
  assert.equal(chunks[0].start, 0);
  assert.equal(chunks.at(-1).end, 9);
  for (let i = 0; i < chunks.length; i++) {
    assert.ok(Array.from(chunks[i].text).length <= 60, chunks[i].text);
    if (i) assert.equal(chunks[i].start, chunks[i - 1].end);
    assert.ok(chunks[i].end > chunks[i].start);
  }
  assert.equal(chunks.map(c => c.text).join(' ').replace(/\s/g, ''), text.replace(/\s/g, ''));
  assert.deepEqual(sp.subtitleChunks('', 5), []);
  assert.deepEqual(sp.subtitleChunks('Xin chào', 0), []);
});

test('SRT đúng định dạng giờ:phút:giây,mili', () => {
  assert.equal(sp.srtTime(3661.5), '01:01:01,500');
  assert.equal(sp.toSrt([{ start: 0, end: 1.25, text: 'A' }, { start: 1.25, end: 3, text: 'B' }]), '1\n00:00:00,000 --> 00:00:01,250\nA\n\n2\n00:00:01,250 --> 00:00:03,000\nB\n');
});

test('hàng đợi nhận loại «story», đánh số riêng và giữ storyId, lời đọc, ảnh tham chiếu', async () => {
  const q = new Queue({ save: async () => {}, run: async () => '' });
  await q.add([{ prompt: 'v' }]);
  await q.add([{ kind: 'story', prompt: 'a', voiceover: 'Lời a', storyId: 'Truyen 01/../x', references: ['C:\\ref.png'] }, { kind: 'story', prompt: 'b', voiceover: 'Lời b' }]);
  const jobs = q.jobs.filter(j => j.kind === 'story');
  assert.equal(jobs.length, 2);
  assert.deepEqual(jobs.map(j => j.order), [1, 2]);
  assert.equal(q.jobs[0].kind, 'video');
  assert.equal(jobs[0].storyId, 'Truyen01x');
  assert.equal(jobs[0].voiceover, 'Lời a');
  assert.deepEqual(jobs[0].references, ['C:\\ref.png']);
  const seen = [];
  const runner = new Queue({ jobs: q.jobs, save: async () => {}, run: async job => { seen.push(job.kind); return 'C:\\o\\' + job.order + '.mp4'; } });
  await runner.start('story');
  assert.deepEqual(seen, ['story', 'story']);
  assert.equal(runner.jobs.find(j => j.kind === 'video').status, 'pending');
  const restored = new Queue({ jobs: JSON.parse(JSON.stringify(runner.jobs)), save: async () => {}, run: async () => '' });
  assert.equal(restored.jobs.filter(j => j.kind === 'story').length, 2);
  await restored.clearAll('story');
  assert.equal(restored.jobs.length, 1);
});

/* ---------- hiểu kịch bản, đa ngôn ngữ, 10 giây ---------- */
test('nhận ngôn ngữ và ước lượng độ dài lời đọc theo ngôn ngữ', () => {
  const sample = {
    vi: 'Ngày xưa có một cô bé tên Mai sống ở làng ven sông.', en: 'Every morning Tom rowed out to the middle of the lake and waited for the sun.',
    es: 'Todos los días Tomás salía al lago con su barca para pescar.', fr: 'Chaque matin, Tom allait sur le lac avec sa barque pour pêcher.',
    de: 'Jeden Morgen ruderte Tom auf den See hinaus und wartete auf die Sonne.', zh: '每天早上，小明都会划船到湖中央等待日出。', ja: '毎朝、トムは湖の真ん中までボートをこいでいきました。',
    ko: '매일 아침 톰은 호수 한가운데로 배를 저어 갔습니다.', ru: 'Каждое утро Том выплывал на середину озера.'
  };
  for (const [code, text] of Object.entries(sample)) assert.equal(sp.detectLanguage(text), code, code);
  assert.ok(sp.estimateSeconds('每天早上，小明都会划船到湖中央等待日出。', 'zh') > 2.5, 'chữ Hán đọc chậm hơn nhiều so với số ký tự');
  assert.ok(sp.charsPerSecond('zh') < sp.charsPerSecond('en'));
});

test('mỗi cảnh vừa 10 giây ở mọi ngôn ngữ, không mất chữ', () => {
  const texts = {
    vi: 'Ngày xưa có một cô bé tên Mai sống ở làng ven sông. Mỗi sáng Mai dậy sớm ra bến đón đò, mang theo giỏ bánh nhỏ để đổi lấy vài con cá tươi. Một hôm có chú cá vàng nhảy lên thuyền và nói rằng nó muốn về nhà. Mai thả cá về sông rồi đứng nhìn theo mãi. Từ đó mỗi sáng cá vàng lại bơi đến chào Mai.',
    en: 'Every morning Tom rowed out to the middle of the lake and waited for the sun to rise. One day a golden fish leapt into his boat and begged him to let it go. Tom lifted the fish gently and set it back into the water. The fish circled the boat three times before it vanished. After that, every dawn it came back to greet him.',
    zh: '每天早上，小明都会划船到湖中央等待日出。有一天，一条金鱼跳进了他的船里，请求他放它回去。小明轻轻地把金鱼放回水中。金鱼绕着小船转了三圈才消失。从那以后，每个黎明它都会回来向他问好。',
    ja: '毎朝、トムは湖の真ん中までボートをこいで日の出を待ちました。ある日、金色の魚がボートに跳び込み、逃がしてほしいと頼みました。トムは魚をそっと水に戻しました。魚はボートのまわりを三回まわって消えました。'
  };
  for (const [code, text] of Object.entries(texts)) {
    const scenes = sp.planStory(text, { seconds: 10 });
    assert.ok(scenes.length >= 2, code + ' phải chia thành nhiều cảnh');
    for (const scene of scenes) assert.ok(sp.estimateSeconds(scene.voiceover, code) <= 10, `${code}: cảnh dài ${sp.estimateSeconds(scene.voiceover, code).toFixed(1)} giây`);
    assert.equal(scenes.map(s => s.voiceover).join('').replace(/\s/g, ''), text.replace(/\s/g, ''), code + ' không được mất hay thêm chữ');
  }
});

const script3 = 'Mai ra bến sông lúc bình minh. Cá vàng nhảy lên thuyền. Mai thả cá về sông. Cá vàng bơi đi mất.';
const sceneOf = (voiceover, prompt = 'Mô tả đủ dài để qua kiểm tra độ dài prompt. ' + sp.NO_SPEECH) => ({ voiceover, prompt, durationSeconds: 10 });

test('đối chiếu trả lời của Muse với kịch bản: đủ, thiếu câu, bịa thêm, sai thứ tự', () => {
  const good = [sceneOf('Mai ra bến sông lúc bình minh. Cá vàng nhảy lên thuyền.'), sceneOf('Mai thả cá về sông. Cá vàng bơi đi mất.')];
  assert.equal(sp.checkAgainstScript(script3, good).ok, true);
  assert.equal(sp.checkAgainstScript(script3, good).coverage, 1);
  const dropped = sp.checkAgainstScript(script3, [good[0], sceneOf('Cá vàng bơi đi mất.')]);
  assert.equal(dropped.ok, false);
  assert.deepEqual(dropped.missing.map(m => m.text), ['Mai thả cá về sông.']);
  assert.match(dropped.issues[0], /Thiếu 1 câu/);
  const invented = sp.checkAgainstScript(script3, [good[0], sceneOf('Một con rồng bay qua núi cao và phun lửa xuống thung lũng.'), good[1]]);
  assert.equal(invented.ok, false);
  assert.equal(invented.added[0].scene, 2);
  const swapped = sp.checkAgainstScript(script3, [good[1], good[0]]);
  assert.equal(swapped.ok, false, 'đảo thứ tự cảnh bị phát hiện');
  const zh = '小明划船到湖中央。金鱼跳进船里。小明把金鱼放回水中。';
  assert.equal(sp.checkAgainstScript(zh, [sceneOf('小明划船到湖中央。金鱼跳进船里。'), sceneOf('小明把金鱼放回水中。')]).ok, true);
  assert.equal(sp.checkAgainstScript(zh, [sceneOf('小明划船到湖中央。'), sceneOf('小明把金鱼放回水中。')]).ok, false);
});

test('sửa theo kịch bản: lời đúng nguyên văn, câu bị bỏ thành cảnh mới ở đúng vị trí, cảnh bịa bị loại', () => {
  const muse = [
    { voiceover: 'Mai ra bến sông lúc bình minh.', prompt: 'P1 ' + sp.NO_SPEECH, durationSeconds: 10 },
    { voiceover: 'Một con rồng bay qua núi cao.', prompt: 'P-rong ' + sp.NO_SPEECH, durationSeconds: 10 },
    { voiceover: 'Mai thả cá về sông. Cá vàng bơi đi mất.', prompt: 'P3 ' + sp.NO_SPEECH, durationSeconds: 10 }
  ];
  const fixed = sp.alignToScript(script3, muse, { seconds: 10 });
  assert.deepEqual(fixed.map(s => s.voiceover), ['Mai ra bến sông lúc bình minh.', 'Cá vàng nhảy lên thuyền.', 'Mai thả cá về sông. Cá vàng bơi đi mất.']);
  assert.equal(fixed[0].prompt, muse[0].prompt, 'giữ prompt của Muse cho cảnh khớp');
  assert.equal(fixed[2].prompt, muse[2].prompt);
  assert.match(fixed[1].prompt, /Cá vàng nhảy lên thuyền\./, 'câu bị bỏ có prompt dựng từ chính câu đó');
  assert.deepEqual(fixed.map(s => s.title), ['Cảnh 1', 'Cảnh 2', 'Cảnh 3']);
  assert.equal(fixed.map(s => s.voiceover).join(' '), script3);
  assert.equal(sp.checkAgainstScript(script3, fixed).ok, true);
});

test('soát cảnh trước khi tạo: lời quá dài, thoại, nhảy thời gian, prompt ngắn hoặc thiếu no speech', () => {
  const ok = sceneOf('Mai ra bến sông lúc bình minh.');
  const long = sceneOf('Ngày xưa có một cô bé tên Mai sống ở làng ven sông, mỗi sáng cô dậy sớm ra bến đón đò, mang theo giỏ bánh nhỏ để đổi cá tươi cho bữa sáng của cả nhà mình.');
  const talk = sceneOf('Mai nói: "Cá vàng ơi, hãy ở lại với tôi".');
  const skip = sceneOf('Hôm sau Mai lại ra bến sông.');
  const short = { voiceover: 'Mai ra bến.', prompt: 'Mai ra bến sông.' };
  const warnings = sp.lintScenes([ok, long, talk, skip, short], { seconds: 10 });
  assert.deepEqual(warnings[0], []);
  assert.match(warnings[1].join('|'), /Lời đọc dài khoảng/);
  assert.match(warnings[2].join('|'), /lời thoại trong ngoặc kép/);
  assert.match(warnings[3].join('|'), /chuyển mốc thời gian/);
  assert.match(warnings[4].join('|'), /quá ngắn/);
  assert.match(warnings[4].join('|'), /no speech/);
  assert.match(sp.lintScenes([{ voiceover: 'Mai ra bến.', prompt: 'Ngắn.\n' + sp.NO_SPEECH }], { seconds: 10 })[0].join('|'), /quá ngắn/, 'câu no speech tự thêm không được tính vào độ dài prompt');
  assert.match(sp.lintScenes([sceneOf('Tom rowed the boat. Then, later that night, the storm came.')], { seconds: 10 })[0].join('|'), /chuyển mốc thời gian/);
});

test('phụ đề: chia theo câu ở mọi ngôn ngữ, chữ Hán không khoảng trắng, và dịch ranh giới về đúng chỗ nghỉ', () => {
  const zh = sp.subtitleChunks('小明划船到湖中央等待日出。有一天，一条金鱼跳进了他的船里，请求他放它回去。小明轻轻地把金鱼放回水中。', 9, { maxChars: 80 });
  assert.ok(zh.length >= 3);
  assert.ok(zh.every(c => Array.from(c.text).length <= 32), 'dòng chữ Hán ngắn: ' + zh.map(c => c.text.length));
  assert.equal(zh.map(c => c.text).join(''), '小明划船到湖中央等待日出。有一天，一条金鱼跳进了他的船里，请求他放它回去。小明轻轻地把金鱼放回水中。');
  assert.equal(zh[0].start, 0); assert.equal(zh.at(-1).end, 9);
  const text = 'Every morning Tom rowed out to the lake. One day a golden fish leapt into his boat. Tom set the fish back into the water.';
  const plain = sp.subtitleChunks(text, 9, { maxChars: 60 });
  assert.equal(plain.length, 3);
  const snapped = sp.subtitleChunks(text, 9, { maxChars: 60, pauses: [2.6, 6.4] });
  assert.ok(Math.abs(snapped[0].end - 2.6) < 0.001 && Math.abs(snapped[1].end - 6.4) < 0.001, JSON.stringify(snapped.map(c => c.end)));
  assert.ok(snapped.every((c, i) => c.end > c.start && (i === 0 || c.start === snapped[i - 1].end)));
  const far = sp.subtitleChunks(text, 9, { maxChars: 60, pauses: [0.4, 8.7] });
  assert.deepEqual(far.map(c => c.end), plain.map(c => c.end), 'chỗ nghỉ quá xa thì giữ cách chia theo độ dài chữ');
  assert.equal(sp.subtitleChunks('', 5).length, 0);
});

/* ---------- chỉ dán câu chuyện: lời đọc luôn là nguyên văn, Muse chỉ chia cảnh và viết prompt hình ---------- */
const tale = 'Ngày xưa có một cô bé tên Mai sống ở làng ven sông. Mỗi sáng, em dắt trâu ra đồng. Một hôm, em nhặt được chiếc hộp gỗ cũ bên bờ nước, bên trong là một chiếc chìa khóa nhỏ. Em hoảng hốt nhìn quanh, rồi mỉm cười. Bà Ba từ xa gọi em về ăn cơm.';

test('toàn bộ văn bản dán vào là lời đọc: không coi «Cảnh 1:», «Lời dẫn:» hay tên người nói là nhãn', () => {
  const pasted = 'Cảnh 1: Mai ra bến sông.\nLời dẫn: cá vàng nhảy lên thuyền.\nMinh: Chào bạn nhé.';
  assert.equal(sp.storyText(pasted), 'Cảnh 1: Mai ra bến sông. Lời dẫn: cá vàng nhảy lên thuyền. Minh: Chào bạn nhé.');
  const scenes = sp.planStory(pasted, { seconds: 10 });
  assert.equal(scenes.map(s => s.voiceover).join(' '), sp.storyText(pasted), 'không bỏ chữ nào của truyện');
  assert.equal(sp.storyText('**Mai** đi _chậm_ `lại`.'), 'Mai đi chậm lại.', 'chỉ bỏ ký hiệu markdown');
  assert.equal(sp.planStory('3.5 km đường dài. TS. Nguyễn nói. Mr. Smith agreed. Xong.', { seconds: 10 }).length, 1, 'số thập phân và viết tắt không bị cắt câu');
  assert.ok(sp.planStory(pasted, { seconds: 10 }).every(s => s.offline === true), 'chia nhanh: prompt mẫu, chưa qua Muse');
});

test('câu được đánh số; câu quá dài cắt ở dấu phẩy; mỗi câu có số giây đọc', () => {
  const units = sp.storyUnits(tale, { seconds: 10 });
  assert.equal(units.length, 5);
  assert.deepEqual(units.map(u => u.n), [1, 2, 3, 4, 5]);
  assert.ok(units.every(u => u.seconds > 0 && u.seconds <= 10));
  assert.equal(units.map(u => u.text).join(' '), tale);
  const long = 'Mỗi sáng, ' + 'em dắt trâu ra đồng cỏ xanh ven sông, '.repeat(8) + 'rồi về.';
  const cut = sp.storyUnits(long, { seconds: 10 });
  assert.ok(cut.length > 1 && cut.every(u => u.seconds <= 10), 'câu dài được cắt cho vừa 10 giây');
  assert.equal(cut.map(u => u.text).join(' ').replace(/\s/g, ''), long.replace(/\s/g, ''));
});

test('yêu cầu gửi Muse: đọc hiểu cả truyện, chia theo SỐ CÂU, không chép lời, prompt đúng hành động và nét mặt, nhận ra mọi nhân vật', () => {
  const text = sp.buildMuseInstruction(tale, { seconds: 10, aspect: '9:16', style: 'điện ảnh', character: 'Mai, bé gái tóc đen', reference: true }, { marker: 'ab12cd' });
  assert.match(text, /MỘT video ngắn, dài tối đa 10 giây/);
  assert.match(text, /Độ dài video của cảnh tự theo lời kể/);
  assert.match(text, /video 5 giây: 0–2 giây/);
  assert.match(text, /ĐỌC HIỂU/);
  assert.match(text, /KHÔNG chép lại lời/);
  assert.match(text, /tổng của mỗi cảnh không quá 9 giây/);
  assert.match(text, /KHÔNG nhảy thời gian/);
  assert.match(text, /nét mặt, ánh mắt, cử chỉ/);
  assert.match(text, /0–3 giây/);
  assert.match(text, /nhận ra MỌI nhân vật/);
  assert.match(text, /ảnh tham chiếu đính kèm/);
  assert.match(text, /KHÔNG vẽ vào hình/);
  assert.match(text, /^CÂU: <số câu đầu>/m);
  assert.match(text, /^PROMPT:/m);
  assert.match(text, /^\[1\] \(\d+(\.\d)? giây\) Ngày xưa có một cô bé/m);
  assert.match(text, /^\[5\] \([\d.]+ giây\) Bà Ba từ xa/m);
  assert.match(text, /MSDONEab12cd/);
  assert.ok(text.trimEnd().endsWith('MSENDab12cd'), 'dòng cuối là mốc kết thúc yêu cầu để app tìm ra trả lời');
  assert.match(text, /Nhân vật chính \(người dùng mô tả\): Mai, bé gái tóc đen/);
  assert.match(text, /phong cách hình ảnh: điện ảnh/);
  assert.match(text, /tỷ lệ 9:16/);
  assert.ok(text.includes(sp.NO_SPEECH));
  assert.ok(!/MSDONE|MSEND/.test(sp.buildMuseInstruction(tale, { seconds: 10 })), 'không có mốc khi dán thủ công');
});

test('chia một đoạn: Muse vẫn đọc cả truyện làm ngữ cảnh, nhận nhân vật đã chốt, chỉ chia các câu được chỉ định', () => {
  const units = sp.storyUnits(tale, { seconds: 10 });
  const text = sp.buildMuseInstruction(tale, { seconds: 10 }, { units, ranges: [[3, 5]], cast: 'Mai – theo ảnh; Bà Ba – 60 tuổi, tóc bạc, áo nâu', part: 2, parts: 2, marker: 'ff00aa' });
  assert.match(text, /phần 2\/2/);
  assert.match(text, /NGỮ CẢNH/);
  assert.ok(text.indexOf('NGỮ CẢNH') < text.indexOf('CÁC CÂU CẦN CHIA CẢNH'));
  assert.ok(text.includes(tale), 'toàn bộ truyện nằm trong ngữ cảnh');
  const list = text.slice(text.indexOf('CÁC CÂU CẦN CHIA CẢNH'));
  assert.ok(!/^\[1\]|^\[2\]/m.test(list) && /^\[3\]/m.test(list) && /^\[5\]/m.test(list));
  assert.match(text, /NHÂN VẬT ĐÃ CHỐT[^:]*: Mai – theo ảnh; Bà Ba – 60 tuổi/);
  assert.ok(!/^NHÂN VẬT: </m.test(text), 'đã chốt nhân vật thì không đòi lại từ đầu');
  assert.match(text, /đến câu số 5/);
});

const goodReply = `Dưới đây là kết quả:

NHÂN VẬT: Mai – theo ảnh tham chiếu; Bà Ba – 60 tuổi, tóc bạc búi, áo bà ba nâu
**CẢNH 1**
**CÂU:** 1-2
**PROMPT:** 0–3 giây: Mai, bé gái tóc đen, đứng bên bờ sông lúc bình minh, mỉm cười nhìn mặt nước.
3–10 giây: em dắt con trâu đi dọc bờ ruộng, ánh nắng xiên.

Cảnh 2
Câu: 3
Prompt: Mai ngồi xổm bên bờ nước cầm chiếc hộp gỗ cũ, mở nắp, nhìn chiếc chìa khóa nhỏ, mắt tròn ngạc nhiên.

CẢNH 3
CÂU: 4 - 5
PROMPT: Mai nhìn quanh hoảng hốt, rồi mỉm cười khi thấy bà Ba (60 tuổi, tóc bạc, áo nâu) vẫy tay từ xa.
MSDONEab12cd
Câu chúc thừa này phải bị bỏ qua.`;

test('trả lời của Muse theo số câu: lời đọc lấy từ truyện thật, prompt từ Muse, nhận danh sách nhân vật', () => {
  const r = sp.scenesFromReply(tale, goodReply, { seconds: 10, aspect: '16:9' });
  assert.equal(r.done, true);
  assert.match(r.cast, /Mai – theo ảnh tham chiếu; Bà Ba – 60 tuổi/);
  assert.equal(r.scenes.length, 3);
  assert.deepEqual(r.scenes.map(s => s.units), [[1, 2], [3, 3], [4, 5]]);
  assert.equal(r.scenes[0].voiceover, 'Ngày xưa có một cô bé tên Mai sống ở làng ven sông. Mỗi sáng, em dắt trâu ra đồng.');
  assert.equal(r.scenes.map(s => s.voiceover).join(' '), tale, 'ghép các cảnh lại ra đúng nguyên văn truyện');
  assert.match(r.scenes[0].prompt, /^0–3 giây: Mai, bé gái tóc đen[^]*7?3–10 giây: em dắt/);
  assert.ok(r.scenes.every(s => s.prompt.includes(sp.NO_SPEECH) && !s.offline), 'prompt nào cũng có no speech; không cảnh nào là mẫu');
  assert.ok(!r.scenes.some(s => /chúc thừa|MSDONE/.test(s.prompt)), 'nội dung sau mốc kết thúc bị bỏ');
  assert.equal(sp.checkAgainstScript(tale, r.scenes).ok, true);
  assert.deepEqual(r.scenes.map(s => s.title), ['Cảnh 1', 'Cảnh 2', 'Cảnh 3']);
});

test('Muse đánh số sai: câu bị bỏ, chồng lên nhau, gom quá dài, ngoài phạm vi → vẫn đủ chữ, đúng thứ tự, phần sai thành cảnh mẫu để hỏi lại', () => {
  const input = { seconds: 10, aspect: '16:9' };
  const p = n => `PROMPT: Mô tả đủ dài cho cảnh ${n}: Mai đứng bên sông, nét mặt ngạc nhiên, gió thổi nhẹ qua tóc.`;
  // bỏ sót câu 3; cảnh 3 lặp lại câu 2
  const gap = sp.scenesFromReply(tale, `CẢNH 1\nCÂU: 1-2\n${p(1)}\nCẢNH 2\nCÂU: 2-2\n${p(2)}\nCẢNH 3\nCÂU: 4-5\n${p(3)}`, input).scenes;
  assert.equal(gap.map(s => s.voiceover).join(' '), tale);
  assert.deepEqual(gap.map(s => s.units), [[1, 2], [3, 3], [4, 5]]);
  assert.deepEqual(gap.map(s => Boolean(s.offline)), [false, true, false], 'chỉ câu bị bỏ sót là cảnh mẫu');
  // gom cả 5 câu vào một cảnh: quá 10 giây → cắt cho vừa, phần dư thành cảnh mẫu
  const all = sp.scenesFromReply(tale, `CẢNH 1\nCÂU: 1-5\n${p(1)}`, input).scenes;
  assert.ok(all.length >= 2 && all.every(s => sp.estimateSeconds(s.voiceover) <= 10));
  assert.equal(all.map(s => s.voiceover).join(' '), tale);
  assert.equal(all[0].offline, undefined);
  assert.ok(all.slice(1).every(s => s.offline));
  // số câu ngoài phạm vi và cảnh không có số
  const wild = sp.scenesFromReply(tale, `CẢNH 1\nCÂU: 1-99\n${p(1)}\nCẢNH 2\nCÂU: 7-9\n${p(2)}`, input).scenes;
  assert.equal(wild.map(s => s.voiceover).join(' '), tale);
  // thiếu PROMPT → cảnh mẫu, vẫn có no speech
  const none = sp.scenesFromReply(tale, 'CẢNH 1\nCÂU: 1-5', input).scenes;
  assert.ok(none.every(s => s.offline && s.prompt.includes(sp.NO_SPEECH)));
  // sau cùng không có câu nào bị mất hay nhân đôi dù Muse đảo thứ tự
  const swapped = sp.scenesFromReply(tale, `CẢNH 1\nCÂU: 4-5\n${p(1)}\nCẢNH 2\nCÂU: 1-3\n${p(2)}`, input).scenes;
  assert.equal(swapped.map(s => s.voiceover).join(' '), tale, 'thứ tự luôn theo truyện, không theo thứ tự Muse viết');
});

test('hỏi lại một đoạn: chỉ ghép trong phạm vi câu được hỏi', () => {
  const input = { seconds: 10 };
  const reply = 'CẢNH 1\nCÂU: 3\nPROMPT: Mai ngồi bên bờ nước mở hộp gỗ cũ, ngạc nhiên nhìn chiếc chìa khóa nhỏ trong hộp.\nCẢNH 2\nCÂU: 1-2\nPROMPT: Cảnh nằm ngoài phạm vi, phải bị bỏ qua hoàn toàn khi hỏi lại.';
  const r = sp.scenesFromReply(tale, reply, input, { from: 3, to: 3 }).scenes;
  assert.equal(r.length, 1);
  assert.deepEqual(r[0].units, [3, 3]);
  assert.match(r[0].voiceover, /^Một hôm, em nhặt được/);
  const legacy = sp.scenesFromReply(tale, 'CẢNH 1\nLỜI: Một hôm em nhặt được chiếc hộp gỗ cũ bên bờ nước, bên trong là chiếc chìa khóa nhỏ.\nPROMPT: Mai mở chiếc hộp gỗ cũ bên bờ nước, ngạc nhiên nhìn chiếc chìa khóa nhỏ.', input, { from: 3, to: 3 }).scenes;
  assert.equal(legacy.length, 1, 'khuôn cũ «LỜI» vẫn dùng được khi hỏi lại một đoạn');
  assert.equal(legacy[0].voiceover, 'Một hôm, em nhặt được chiếc hộp gỗ cũ bên bờ nước, bên trong là một chiếc chìa khóa nhỏ.', 'lời lấy lại nguyên văn từ truyện');
  assert.deepEqual(legacy[0].units, [3, 3]);
  assert.match(legacy[0].prompt, /Mai mở chiếc hộp gỗ cũ/);
  assert.deepEqual(sp.scenesFromReply(tale, 'Xin lỗi\nCẢNH 1\nPROMPT: chỉ có prompt, không có số câu cũng không có lời', input, { from: 3, to: 3 }).scenes, [], 'không có số câu lẫn lời thì không ghép được (người gọi sẽ hỏi lại)');
});

test('Muse quên khuôn «CÂU» mà chép LỜI: lời được sửa về nguyên văn truyện', () => {
  const reply = 'CẢNH 1\nLỜI: Ngày xưa có cô bé tên Mai sống ở làng ven sông. Mỗi sáng em dắt trâu ra đồng.\nPROMPT: Mai dắt trâu qua cánh đồng xanh lúc bình minh, mỉm cười nhìn mặt trời.\nCẢNH 2\nLỜI: Một hôm em nhặt được chiếc hộp gỗ.\nPROMPT: Mai mở chiếc hộp gỗ bên bờ nước, ngạc nhiên nhìn vào trong.';
  const r = sp.scenesFromReply(tale, reply, { seconds: 10 });
  assert.equal(r.scenes.map(s => s.voiceover).join(' '), tale);
  assert.ok(r.scenes[0].prompt.includes('dắt trâu qua cánh đồng'));
});

test('hàng đợi: «áp ảnh cho hàng chờ» ở tab video không ghi đè ảnh của cảnh kể chuyện', async () => {
  const q = new Queue({ save: async () => {}, run: async () => '' });
  await q.add([{ prompt: 'v', references: [] }, { kind: 'story', prompt: 's', voiceover: 'a', references: ['C:\\mai.png'] }]);
  await q.applyReferences(['C:\\khac.png']);
  assert.deepEqual(q.jobs.find(j => j.kind === 'video').references, ['C:\\khac.png']);
  assert.deepEqual(q.jobs.find(j => j.kind === 'story').references, ['C:\\mai.png']);
});


test('giây mỗi cảnh tự tính theo lời kể: ngắn thì ngắn, tối thiểu 3, tối đa 10, làm tròn lên có chừa nhịp nghỉ', () => {
  assert.equal(sp.sceneSeconds('Mai ra bến.', 10), 3, 'rất ngắn thì vẫn 3 giây');
  assert.equal(sp.sceneSeconds('', 10), 10, 'chưa có lời thì dùng mức tối đa');
  const eleven = 'Mai ra bến sông lúc bình minh, sương mỏng phủ kín mặt nước yên ả và lạnh buốt.'; // ~11 giây nếu đọc chậm
  for (const text of ['Mai ra bến sông lúc bình minh.', 'Mai ra bến sông lúc bình minh, sương mỏng phủ kín mặt nước.', eleven, tale]) {
    const need = Math.ceil(Math.round(sp.estimateSeconds(text) / 0.9 * 100) / 100);
    const got = sp.sceneSeconds(text, 10);
    assert.equal(got, Math.min(10, Math.max(3, need)), text);
    assert.ok(got >= 3 && got <= 10);
  }
  // Đúng 4,5 giây đọc (63 ký tự, 14 ký tự/giây) thì cần 5 giây chứ không phải 6 (không để sai số số thực đẩy lên).
  const text63 = 'a'.repeat(63);
  assert.equal(sp.estimateSeconds(text63, 'vi'), 4.5);
  assert.equal(sp.sceneSeconds(text63, 10), 5);
  assert.equal(sp.sceneSeconds('a '.repeat(2000), 10), 10, 'không bao giờ vượt mức tối đa của Muse');
  assert.equal(sp.sceneSeconds('a '.repeat(2000), 6), 6, 'mức tối đa tùy chọn vẫn được giữ');
});

test('các cảnh trong cùng một truyện có độ dài khác nhau theo lời kể, kể cả cảnh Muse viết và cảnh mẫu', () => {
  const script = 'Mai ra bến. Một hôm, em nhặt được chiếc hộp gỗ cũ bên bờ nước, bên trong là một chiếc chìa khóa nhỏ rất cũ kỹ. Em mỉm cười.';
  const units = sp.storyUnits(script, { seconds: 10 });
  const parsed = [{ units: [1, 1], prompt: 'Mai đứng bên bến sông lúc sáng sớm, mắt nhìn mặt nước phẳng lặng, hai tay buông thõng.' }, { units: [2, 3], prompt: '' }];
  const out = sp.assembleScenes(units, parsed, { seconds: 10 });
  assert.equal(out.length, 2);
  assert.equal(out[0].durationSeconds, 3, 'cảnh một câu ngắn');
  assert.equal(out[1].durationSeconds, sp.sceneSeconds(out[1].voiceover, 10));
  assert.ok(out[1].durationSeconds > out[0].durationSeconds);
  assert.ok(out[1].prompt.includes(`Tạo video dài ${out[1].durationSeconds} giây`), 'cảnh mẫu ghi giây theo lời của chính nó');
});

test('sửa lời về nguyên văn thì giây của cảnh cũng tính lại theo lời mới', () => {
  const script = 'Mai ra bến sông. Cá vàng nhảy lên thuyền, Mai thả cá về sông và mỉm cười thật lâu.';
  const muse = [{ voiceover: 'Mai ra bến sông.', prompt: 'P1 ' + sp.NO_SPEECH, durationSeconds: 10 }, { voiceover: 'Cá vàng nhảy lên thuyền.', prompt: 'P2 ' + sp.NO_SPEECH, durationSeconds: 10 }];
  const fixed = sp.alignToScript(script, muse, { seconds: 10 });
  assert.ok(fixed.every(s => s.durationSeconds === sp.sceneSeconds(s.voiceover, 10)));
});


test('mô tả nhân vật và ảnh tham chiếu chỉ xuất hiện khi có dùng, không phải mặc định', () => {
  const bare = { seconds: 10, aspect: '16:9' };
  const none = sp.buildMuseInstruction(tale, bare, { marker: 'ab12cd' });
  assert.doesNotMatch(none, /ảnh tham chiếu/, 'không có ảnh thì không nhắc ảnh tham chiếu');
  assert.doesNotMatch(none, /Nhân vật chính \(người dùng mô tả\)/, 'không nhập mô tả thì không có dòng mô tả');
  assert.doesNotMatch(none, /phong cách hình ảnh/);
  assert.match(none, /nhận ra các nhân vật CÓ MẶT/);
  assert.match(none, /KHÔNG vẽ vào hình/, 'người chỉ được nhắc tới thì không vẽ');
  assert.match(none, /^NHÂN VẬT: </m, 'vẫn yêu cầu dòng chốt nhân vật phụ để giữ nhất quán');
  const withRef = sp.buildMuseInstruction(tale, { ...bare, reference: true }, { marker: 'ab12cd' });
  assert.match(withRef, /ảnh tham chiếu đính kèm/);
  assert.match(withRef, /theo ảnh tham chiếu/);
  assert.match(sp.buildMuseInstruction(tale, { ...bare, character: 'Mai, bé gái' }, { marker: 'ab12cd' }), /Nhân vật chính \(người dùng mô tả\): Mai, bé gái/);

  const plain = sp.planStory('Mai ra bến sông lúc bình minh.', bare)[0].prompt;
  assert.doesNotMatch(plain, /ảnh tham chiếu/);
  assert.doesNotMatch(plain, /Nhân vật:/);
  const full = sp.planStory('Mai ra bến sông lúc bình minh.', { ...bare, reference: true, character: 'Mai, bé gái' })[0].prompt;
  assert.match(full, /Nhân vật: Mai, bé gái/);
  assert.match(full, /như trong ảnh tham chiếu/);
});

/* ---------- chế độ quảng cáo sản phẩm ---------- */
const adBase = { seconds: 10, aspect: '9:16', ad: { product: 'Bình giữ nhiệt Aqua 500ml', points: 'Giữ nóng 12 giờ\nNắp chống tràn\n\nInox 304', audience: 'Dân văn phòng', offer: 'Giảm 20% đến hết tuần', cta: 'Bấm vào giỏ hàng để xem chi tiết', tone: 'warm', length: 30, camera: ['macro', 'orbit'], look: 'ugc' } };
const adCopy = 'Sáng nào cũng lạnh tay? Bình Aqua giữ nóng 12 giờ. Nắp chống tràn thật tiện. Bấm vào giỏ hàng để xem chi tiết.';

test('quảng cáo: options chuẩn hóa dữ liệu từ giao diện; không có ad thì là chế độ kể chuyện', () => {
  assert.equal(sp.options({}).ad, null);
  assert.equal(sp.options({ ad: 'x' }).ad, null);
  const ad = sp.options({ ad: { product: '  Bình   giữ nhiệt ', points: 'a\r\n\r\n  b  \n' + 'c'.repeat(500), camera: ['macro', 'macro', 'nope', 'orbit', 'pan', 'top'], look: 'zzz', tone: 'zzz', length: 99 } }).ad;
  assert.equal(ad.product, 'Bình giữ nhiệt');
  assert.deepEqual(ad.points.split('\n').map(x => x.length), [1, 1, 240], 'bỏ dòng trống, cắt dòng quá dài');
  assert.deepEqual(ad.camera, ['macro', 'orbit', 'pan'], 'bỏ trùng và mã lạ, tối đa 3');
  assert.equal(ad.look, ''); assert.equal(ad.tone, 'hype'); assert.equal(ad.length, 30);
  assert.equal(sp.options({ ad: { product: 'x', length: '45' } }).ad.length, 45);
  assert.ok(sp.AD_CAMERA.length === 9 && sp.AD_LOOK.length === 6 && sp.AD_TONE.length === 5 && sp.AD_LENGTHS.join() === '15,30,45,60');
  assert.ok([...sp.AD_CAMERA, ...sp.AD_LOOK, ...sp.AD_TONE].every(x => x.id && x.label && x.en && x.prompt), 'mỗi lựa chọn có tên, tên tiếng Anh và câu đưa vào prompt');
});

test('quảng cáo: câu lệnh nhờ Muse VIẾT lời có đủ thông tin, luật không bịa, khuôn trả lời và mốc', () => {
  assert.throws(() => sp.buildAdScriptInstruction({ ad: { product: '  ' } }), /Nhập tên sản phẩm/);
  assert.throws(() => sp.buildAdScriptInstruction({}), /Nhập tên sản phẩm/);
  const text = sp.buildAdScriptInstruction(adBase, { marker: 'ab12cd' });
  assert.match(text, /Sản phẩm: Bình giữ nhiệt Aqua 500ml/);
  assert.match(text, /Điểm nổi bật:\n- Giữ nóng 12 giờ\n- Nắp chống tràn\n- Inox 304/);
  assert.match(text, /Người xem hướng tới: Dân văn phòng/);
  assert.match(text, /Giá \/ ưu đãi: Giảm 20% đến hết tuần/);
  assert.match(text, /nhắc đúng nguyên văn thông tin người dùng đưa/);
  assert.match(text, /«Bấm vào giỏ hàng để xem chi tiết»/);
  assert.match(text, /thân mật, chân thành/);
  assert.match(text, /khoảng 321–397 ký tự \(đọc khoảng 30 giây\)/);
  assert.match(text, /KHÔNG bịa tính năng, thông số, con số, thành phần, giá, khuyến mãi, chứng nhận/);
  assert.match(text, /Không nói về chữa bệnh, giảm cân hay hiệu quả y tế/);
  assert.match(text, /Không so sánh với sản phẩm hay thương hiệu khác/);
  assert.match(text, /\nKỊCH BẢN:\n/);
  assert.match(text, /dòng cuối cùng của trả lời chỉ gồm đúng một từ: MSDONEab12cd/);
  assert.match(text, /MSENDab12cd$/);
  // Không nhập giá → dặn Muse không nhắc giá; không nhập kêu gọi → câu mời nhẹ; không điểm nổi bật → không bịa.
  const lean = sp.buildAdScriptInstruction({ ad: { product: 'Áo thun cotton' } }, { marker: 'ab12cd' });
  assert.match(lean, /KHÔNG nhắc đến giá, giảm giá hay quà tặng/);
  assert.doesNotMatch(lean, /Giá \/ ưu đãi:/);
  assert.match(lean, /nhẹ nhàng, không ép/);
  assert.match(lean, /Điểm nổi bật: \(người dùng chưa nêu/);
  assert.doesNotMatch(lean, /Người xem hướng tới/);
  // Độ dài mục tiêu đổi theo lựa chọn.
  assert.match(sp.buildAdScriptInstruction({ ad: { product: 'x', length: 60 } }), /khoảng 643–794 ký tự \(đọc khoảng 60 giây\)/);
  assert.match(sp.buildAdScriptInstruction({ ad: { product: 'x', length: 15 } }), /khoảng 161–198 ký tự \(đọc khoảng 15 giây\)/);
});

test('quảng cáo: lấy lời từ trả lời của Muse — bỏ lời dẫn, nhãn, emoji, hashtag, ghi chú, mốc; từ chối trả lời rỗng', () => {
  const reply = 'Dạ, đây là kịch bản:\n\n**KỊCH BẢN:**\n## Mở đầu\nSáng nào cũng lạnh tay? 😍\n(nhạc nền nhẹ)\n[Cảnh bình bốc khói]\n- Bình Aqua giữ nóng 12 giờ. #binhgiunhiet\n2) Mở đầu: Nắp chống tràn thật tiện.\n---\n“Bấm vào giỏ hàng để xem chi tiết.”\nMSDONEab12cd';
  assert.equal(sp.scriptFromReply(reply), 'Sáng nào cũng lạnh tay?\nBình Aqua giữ nóng 12 giờ.\nNắp chống tràn thật tiện.\nBấm vào giỏ hàng để xem chi tiết.');
  assert.equal(sp.scriptFromReply('KỊCH BẢN: Một câu quảng cáo đủ dài để dùng được.\nMSDONEab12cd'), 'Một câu quảng cáo đủ dài để dùng được.', 'lời nằm cùng dòng với nhãn');
  assert.equal(sp.scriptFromReply('Câu một của quảng cáo đủ dài.\nCâu hai cũng đủ dài nhé.'), 'Câu một của quảng cáo đủ dài.\nCâu hai cũng đủ dài nhé.', 'không có nhãn vẫn lấy cả trả lời');
  assert.equal(sp.scriptFromReply('Lời đọc: Một câu quảng cáo đủ dài để dùng được.'), 'Một câu quảng cáo đủ dài để dùng được.');
  assert.throws(() => sp.scriptFromReply('KỊCH BẢN:\nMSDONEab12cd'), /Muse chưa viết lời quảng cáo/);
  assert.throws(() => sp.scriptFromReply(''), /Muse chưa viết lời quảng cáo/);
  assert.throws(() => sp.scriptFromReply('Ngắn quá\n😍 #tag'), /Muse chưa viết lời quảng cáo/);
});

test('quảng cáo: câu lệnh chia cảnh có luật sản phẩm, máy quay, phong cách, nhịp quảng cáo; kể chuyện không bị đổi', () => {
  const ask = sp.buildMuseInstruction(adCopy, { ...adBase, reference: true }, { marker: 'ab12cd' });
  assert.match(ask, /đạo diễn hình ảnh cho video QUẢNG CÁO sản phẩm bán hàng/);
  assert.match(ask, /LỜI QUẢNG CÁO \(đã đánh số câu\):/);
  assert.match(ask, /^\[1\] \(/m);
  assert.match(ask, /5\. SẢN PHẨM: ảnh tham chiếu đính kèm là sản phẩm thật\. Giữ đúng hình dạng, tỷ lệ, màu sắc, chất liệu, bao bì và nhãn/);
  assert.match(ask, /Sản phẩm phải HIỆN RÕ ở mọi cảnh/);
  assert.match(ask, /không cảnh «trước\/sau» hay minh họa chữa bệnh, giảm cân, hiệu quả y tế/);
  assert.match(ask, /không cảnh so sánh với sản phẩm khác/);
  assert.match(ask, /7\. Không thêm chữ, giá, phụ đề hay logo vào hình \(nhãn thật trên sản phẩm giữ nguyên như ảnh\); tỷ lệ 9:16\./);
  assert.match(ask, /9\. Nhịp quảng cáo: cảnh đầu phải thu hút/);
  assert.match(ask, /^NHÂN VẬT: <sản phẩm: mô tả cố định theo ảnh tham chiếu; người mẫu nếu có/m);
  assert.match(ask, /THÔNG TIN QUẢNG CÁO \(do người dùng cung cấp\):\nSản phẩm: Bình giữ nhiệt Aqua 500ml\nĐiểm nổi bật:\n- Giữ nóng 12 giờ/);
  assert.match(ask, /Giá \/ ưu đãi \(chỉ để hiểu, không vẽ chữ giá lên hình\): Giảm 20% đến hết tuần/);
  assert.match(ask, /Chuyển động máy quay đã chọn: cận cảnh chi tiết \(macro\)[^\n]*; máy quay xoay chậm quanh sản phẩm/);
  assert.match(ask, /Phong cách quảng cáo: phong cách review đời thường \(UGC\)/);
  assert.match(ask, /MSENDab12cd$/);
  assert.doesNotMatch(ask, /video kể chuyện|nhận ra MỌI nhân vật|CÂU CHUYỆN \(đã đánh số câu\)/);
  // Không có ảnh → mô tả sản phẩm theo chữ, không nhắc ảnh tham chiếu.
  const noRef = sp.buildMuseInstruction(adCopy, adBase, { marker: 'ab12cd' });
  assert.match(noRef, /5\. SẢN PHẨM: chưa có ảnh tham chiếu/);
  assert.doesNotMatch(noRef, /ảnh tham chiếu đính kèm/);
  assert.doesNotMatch(noRef, /theo ảnh tham chiếu/);
  // Người mẫu do người dùng mô tả.
  assert.match(sp.buildMuseInstruction(adCopy, { ...adBase, character: 'cô gái 25 tuổi, tóc dài' }, { marker: 'ab12cd' }), /Người mẫu \(người dùng mô tả\): cô gái 25 tuổi, tóc dài/);
  // Chế độ kể chuyện y như cũ.
  const story = sp.buildMuseInstruction(adCopy, { seconds: 10, aspect: '16:9' }, { marker: 'ab12cd' });
  assert.match(story, /video kể chuyện/);
  assert.doesNotMatch(story, /QUẢNG CÁO|THÔNG TIN QUẢNG CÁO|Nhịp quảng cáo/);
});

test('quảng cáo: prompt mẫu (chia nhanh) có sản phẩm, máy quay, phong cách, ảnh sản phẩm và vẫn cấm tiếng', () => {
  const [scene] = sp.planStory(adCopy, { ...adBase, reference: true });
  assert.match(scene.prompt, /^Tạo video quảng cáo sản phẩm dài \d+ giây, tỷ lệ 9:16/);
  assert.match(scene.prompt, /Sản phẩm quảng cáo: Bình giữ nhiệt Aqua 500ml\. Sản phẩm hiện rõ/);
  assert.match(scene.prompt, /Máy quay \(chọn hợp với cảnh\): cận cảnh chi tiết \(macro\)[^\n]*; máy quay xoay chậm quanh sản phẩm \(orbit\)/);
  assert.match(scene.prompt, /Phong cách quảng cáo: review đời thường \(UGC\)/);
  assert.match(scene.prompt, /Sản phẩm giữ đúng hình dạng, màu sắc, chất liệu và bao bì như trong ảnh tham chiếu; không đổi sang sản phẩm khác/);
  assert.match(scene.prompt, /Không thêm chữ, giá, phụ đề hay logo mới vào hình/);
  assert.ok(scene.prompt.includes(sp.NO_SPEECH));
  assert.doesNotMatch(scene.prompt, /Giảm 20%/, 'giá không bị vẽ vào prompt hình');
  assert.equal(scene.voiceover, adCopy, 'lời đọc vẫn đúng nguyên văn');
  const bare = sp.planStory(adCopy, { seconds: 10, aspect: '16:9' })[0].prompt;
  assert.doesNotMatch(bare, /quảng cáo|Sản phẩm/i, 'kể chuyện không lẫn chữ quảng cáo');
  assert.match(sp.planStory(adCopy, { seconds: 10, aspect: '16:9', ad: { product: '' } })[0].prompt, /Sản phẩm quảng cáo: sản phẩm trong ảnh tham chiếu/, 'chưa nhập tên thì gọi chung là sản phẩm trong ảnh');
});
