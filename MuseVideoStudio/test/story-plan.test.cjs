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
    assert.match(scene.prompt, /dài 10 giây, tỷ lệ 16:9/);
    assert.ok(scene.prompt.includes(scene.voiceover));
    assert.match(scene.prompt, /Nhân vật: Mai, bé gái tóc đen/);
    assert.match(scene.prompt, /Phong cách hình ảnh: hoạt hình màu nước/);
    assert.match(scene.prompt, /Không chèn chữ, phụ đề/);
    assert.match(scene.prompt, /Audio: no speech, no dialogue, no singing/);
    assert.match(scene.prompt, /mouths closed/);
    assert.equal(scene.durationSeconds, 10);
  }
  const joined = scenes.map(s => s.voiceover).join(' ').replace(/\s/g, '');
  assert.equal(joined, story.replace(/\s/g, ''));
});

test('kịch bản có «Cảnh N» thì giữ đúng mốc cảnh và bỏ nhãn khỏi lời đọc', () => {
  const scenes = sp.planStory('Cảnh 1: Mai ra bến sông.\nCảnh 2: Cá vàng nhảy lên thuyền.', { seconds: 10 });
  assert.equal(scenes.length, 2);
  assert.equal(scenes[0].voiceover, 'Mai ra bến sông.');
  assert.equal(scenes[1].voiceover, 'Cá vàng nhảy lên thuyền.');
});

test('báo lỗi tiếng Việt khi thiếu kịch bản hoặc cấu hình sai', () => {
  assert.throws(() => sp.planStory('   ', {}), /Dán kịch bản/);
  assert.throws(() => sp.planStory('a', { seconds: 1 }), /3 đến 10/);
  assert.throws(() => sp.planStory('a', { seconds: 11 }), /tối đa 10 giây/);
  assert.throws(() => sp.planStory('a', { aspect: '4:3' }), /16:9/);
});

test('câu lệnh gửi Muse nêu thời lượng, tỉ lệ, nhân vật, khuôn trả lời và kèm đủ kịch bản', () => {
  const text = sp.buildMuseInstruction(story, { seconds: 8, aspect: '9:16', style: 'điện ảnh', character: 'Mai' });
  assert.match(text, /mỗi cảnh khoảng 8 giây/);
  assert.match(text, /tỷ lệ 9:16/);
  assert.match(text, /^LỜI:/m);
  assert.match(text, /^PROMPT:/m);
  assert.match(text, /Nhân vật chính: Mai/);
  assert.ok(text.includes('Mỗi sáng Mai dậy sớm ra bến đón đò.'));
  assert.ok(text.indexOf('KỊCH BẢN:') < text.indexOf('Ngày xưa'));
  assert.ok(text.includes(sp.NO_SPEECH), 'yêu cầu Muse luôn kết thúc prompt bằng câu «no speech» tiếng Anh');
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
  assert.ok(scenes.every(s => s.durationSeconds === 10));
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
const labelled = `Cảnh 1
Hình ảnh: Cô bé Mai đứng trước cổng làng lúc bình minh, sương mỏng.
Lời dẫn: Ngày xưa có một cô bé tên Mai.
(Nhạc nhẹ, tiếng chim hót)

Cảnh 2
Hình ảnh: Chú cá vàng nhảy lên thuyền, Mai ngạc nhiên.
Lời dẫn: Một hôm có chú cá vàng nhảy lên thuyền.`;

test('kịch bản có nhãn «Hình ảnh / Lời dẫn»: chỉ lời dẫn được đọc, mô tả hình và chỉ dẫn vào prompt', () => {
  const scenes = sp.planStory(labelled, { seconds: 10 });
  assert.equal(scenes.length, 2);
  assert.equal(scenes[0].voiceover, 'Ngày xưa có một cô bé tên Mai.');
  assert.equal(scenes[1].voiceover, 'Một hôm có chú cá vàng nhảy lên thuyền.');
  assert.ok(scenes.every(s => !/Hình ảnh|Lời dẫn|Nhạc/.test(s.voiceover)), 'nhãn và chỉ dẫn không được đọc thành tiếng');
  assert.match(scenes[0].prompt, /HÌNH ẢNH THEO KỊCH BẢN[^\n]*\nCô bé Mai đứng trước cổng làng lúc bình minh, sương mỏng\. Nhạc nhẹ, tiếng chim hót/);
  assert.match(scenes[1].prompt, /Chú cá vàng nhảy lên thuyền, Mai ngạc nhiên/);
  assert.equal(sp.scriptVoice(labelled), 'Ngày xưa có một cô bé tên Mai. Một hôm có chú cá vàng nhảy lên thuyền.');
});

test('kịch bản tiếng Anh: Scene / Visual / Narrator; không có nhãn thì mọi dòng là lời', () => {
  const english = 'Scene 1\nVisual: A fisherman rows across a calm lake at dawn.\nNarrator: Every morning, Tom rowed out to the middle of the lake.\nScene 2\nVisual: A golden fish leaps into the boat.\nNarrator: One day, a golden fish jumped into his boat.';
  const scenes = sp.planStory(english, { seconds: 10 });
  assert.deepEqual(scenes.map(s => s.voiceover), ['Every morning, Tom rowed out to the middle of the lake.', 'One day, a golden fish jumped into his boat.']);
  assert.match(scenes[1].prompt, /A golden fish leaps into the boat\./);
  const plain = sp.planStory('Dòng một.\nDòng hai.', { seconds: 10 });
  assert.equal(plain.length, 1);
  assert.equal(plain[0].voiceover, 'Dòng một. Dòng hai.');
  assert.equal(sp.planStory('Minh: Chào bạn nhé.\nLan: Chào Minh!', { seconds: 10 })[0].voiceover, 'Minh: Chào bạn nhé. Lan: Chào Minh!', 'tên người nói không bị coi là nhãn chỉ dẫn');
});

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
  assert.equal(sp.checkAgainstScript(labelled, sp.planStory(labelled, { seconds: 10 })).ok, true, 'kịch bản có nhãn: chỉ so với phần lời');
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

test('yêu cầu gửi Muse: nguyên văn lời, mỗi cảnh một khoảnh khắc trong 10 giây, mô tả hành động và nét mặt, nhân vật không nói', () => {
  const text = sp.buildMuseInstruction(story, { seconds: 10, aspect: '16:9', character: 'Mai' });
  assert.match(text, /NGUYÊN VĂN/);
  assert.match(text, /MỘT video 10 giây/);
  assert.match(text, /KHÔNG nhảy thời gian/);
  assert.match(text, /nét mặt, cử chỉ/);
  assert.match(text, /0–3 giây/);
  assert.match(text, /không bịa thêm/);
  assert.match(text, /dự kiến khoảng \d+ cảnh/);
  const withLabels = sp.buildMuseInstruction(labelled, { seconds: 10 });
  assert.ok(withLabels.includes('Hình ảnh: Cô bé Mai'), 'kịch bản gốc được gửi nguyên vẹn');
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

test('tiêu đề cảnh «Cảnh 1 – Bến sông» trong kịch bản có nhãn là bối cảnh, không bị đọc thành tiếng', () => {
  const scenes = sp.planStory('**Cảnh 1 – Bến sông**\n**Hình ảnh:** Bình minh trên sông.\n**Lời dẫn:** Mai ra bến sông.\n\n**Cảnh 2 – Con thuyền**\n**Hình ảnh:** Cá vàng nhảy.\n**Lời dẫn:** Cá nhảy lên thuyền.', { seconds: 10 });
  assert.deepEqual(scenes.map(s => s.voiceover), ['Mai ra bến sông.', 'Cá nhảy lên thuyền.']);
  assert.match(scenes[0].visual, /Bến sông.*Bình minh trên sông/);
  // Không có nhãn: phần sau «Cảnh N:» vẫn là lời kể như trước.
  assert.deepEqual(sp.planStory('Cảnh 1: Mai ra bến sông.\nCảnh 2: Cá nhảy lên thuyền.', { seconds: 10 }).map(s => s.voiceover), ['Mai ra bến sông.', 'Cá nhảy lên thuyền.']);
  assert.equal(sp.planStory('## Cảnh 1\nMai ra bến sông.\n## Cảnh 2\nCá vàng nhảy lên thuyền.', { seconds: 10 }).length, 2);
  assert.equal(sp.planStory('3.5 km đường dài. TS. Nguyễn nói. Mr. Smith agreed. Xong.', { seconds: 10 }).length, 1, 'số thập phân và viết tắt không bị cắt câu');
});
