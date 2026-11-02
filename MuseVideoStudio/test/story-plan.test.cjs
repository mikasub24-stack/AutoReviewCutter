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
  assert.throws(() => sp.planStory('a', { seconds: 1 }), /3 đến 60/);
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
