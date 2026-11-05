// Real Chromium UI test with mocked IPC for the "Kể chuyện" tab; no Muse calls, no real voices.
const { chromium } = require('playwright-core'), http = require('http'), fs = require('fs/promises'), path = require('path'), assert = require('assert/strict');
(async () => {
  const files = { '/assets/muse-studio.svg': 'assets/muse-studio.svg', '/assets/zalo-qr.jpg': 'assets/zalo-qr.jpg', '/': 'index.html', '/style.css': 'style.css', '/renderer.js': 'renderer.js', '/ui-i18n.js': 'ui-i18n.js', '/script-planner.js': 'script-planner.js', '/prompt-import.js': 'prompt-import.js', '/reference-map.js': 'reference-map.js', '/story-plan.js': 'story-plan.js', '/story-ui.js': 'story-ui.js' };
  const server = http.createServer(async (req, res) => {
    const name = files[req.url];
    if (!name) { res.writeHead(404); return res.end(); }
    res.setHeader('Content-Type', name.endsWith('.jpg') ? 'image/jpeg' : name.endsWith('.svg') ? 'image/svg+xml' : name.endsWith('.js') ? 'application/javascript' : name.endsWith('.css') ? 'text/css' : 'text/html');
    res.end(await fs.readFile(path.join(__dirname, '../src', name)));
  });
  await new Promise(r => server.listen(0, '127.0.0.1', r));
  const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || '/usr/bin/chromium', headless: true, args: ['--no-sandbox'] });
  try {
    const page = await browser.newPage({ viewport: { width: 1450, height: 1500 } }), errors = [];
    page.on('pageerror', e => errors.push(e.message)); page.on('dialog', d => d.accept());
    await page.addInitScript(() => {
      localStorage.setItem('museStudio.language', 'vi');
      const job = (kind, n, extra = {}) => ({ id: kind + n, kind, status: 'completed', stage: 'completed', order: n, number: n, prompt: kind + ' prompt ' + n, title: 'Cảnh ' + n, references: [], output: 'C:\\Videos\\' + n + '.mp4', ...extra });
      const s = {
        version: '1.2.0', active: false, paused: true,
        jobs: [job('video', 1), job('image', 1, { output: 'C:\\Videos\\Anh\\001.png' }),
          job('story', 1, { storyId: 'Truyen-1', voiceover: 'Lời cảnh một.', output: 'C:\\Videos\\KeChuyen\\Truyen-1\\001.mp4' }),
          job('story', 2, { storyId: 'Truyen-1', voiceover: 'Lời cảnh hai.', output: 'C:\\Videos\\KeChuyen\\Truyen-1\\002.mp4' }),
          job('story', 3, { storyId: 'Truyen-1', voiceover: 'Lời cảnh ba.', output: 'C:\\Videos\\KeChuyen\\Truyen-1\\003.mp4' })],
        license: { status: 'trial', device: 'TESTDEVICE', expiresAt: Date.now() + 86400000, message: 'Dùng thử 24 giờ' },
        story: { busy: false, progress: '', error: '', output: '', srt: '', notes: [], voice: { setupBusy: false, setupMessage: '', setupError: '', ready: { edge: false, clone: false }, platform: 'win32', edgeVoices: [{ id: 'vi-VN-HoaiMyNeural', lang: 'vi', language: 'Tiếng Việt', name: 'Hoài My (nữ)' }, { id: 'vi-VN-NamMinhNeural', lang: 'vi', language: 'Tiếng Việt', name: 'Nam Minh (nam)' }, { id: 'en-US-AriaNeural', lang: 'en', language: 'Tiếng Anh', name: 'Aria (nữ)' }], windowsVoices: [{ name: 'Microsoft An', culture: 'vi-VN', gender: 'Male' }], clones: [] } },
        settings: { browserChoice: 'builtin', browserPath: '', output: 'C:\\Videos', autoMerge: false, autoPackage: false, ffmpeg: 'ffmpeg', accountCount: 2, composer: 'textarea', fileInput: 'input[type=file]', submit: '', video: 'video', image: 'img', attachmentReadySelector: '', timeoutMinutes: 15 }
      };
      window.calls = []; window.s = s; let listener, id = 100;
      window.push = () => listener(structuredClone(s));
      window.studio = {
        onUpdate: fn => listener = fn,
        invoke: async (name, data) => {
          window.calls.push({ name, data: name === 'storyBuild' ? { ...data, scenes: data.scenes.map(sc => ({ id: sc.id, chunks: sc.chunks.map(c => ({ text: c.text, start: c.start, end: c.end, x: c.x, y: c.y, png: c.png ? [...c.png.slice(0, 4)] : null })) })) } : data });
          if (name === 'storyAnalyze') {
            s.story.analyze = { busy: true, progress: 'Phần 1/1 · Muse đang viết (đã 2 cảnh)…', part: 1, parts: 1, error: '' }; listener(structuredClone(s));
            await new Promise(r => setTimeout(r, window.analyzeDelay || 300));
            s.story.analyze = { busy: false, progress: 'Muse đã chia 2 cảnh', part: 1, parts: 1, error: '' };
            listener(structuredClone(s));
            const units = data.script.split(/(?<=[.!?])\s+/);
            const result = { scenes: [{ title: 'Cảnh 1', source: units.slice(0, 2).join(' '), voiceover: units.slice(0, 2).join(' '), visual: '', prompt: 'Mai dắt trâu qua cánh đồng lúc bình minh, mỉm cười.\nAudio: no speech, no dialogue, no singing, no narration, no lip movement - characters stay silent with mouths closed.', durationSeconds: 10, units: [1, 2] }, { title: 'Cảnh 2', source: units.slice(2).join(' '), voiceover: units.slice(2).join(' '), visual: '', prompt: 'Chú cá vàng nhảy lên thuyền, Mai ngạc nhiên đưa tay đón.\nAudio: no speech, no dialogue, no singing, no narration, no lip movement - characters stay silent with mouths closed.', durationSeconds: 10, units: [3, 4] }].filter(sc => sc.voiceover.trim()), cast: 'Mai – theo ảnh', understanding: { summary: 'Mai dắt trâu, thả cá vàng về sông.', approach: 'Truyện kể nhẹ nhàng; dựng đúng diễn biến.', setting: 'Làng ven sông, buổi sáng.' }, notes: [] };
            if (window.analyzeStop && !data.resume) { result.scenes = result.scenes.slice(0, 1); result.incomplete = { from: 3, total: units.length, message: 'Muse chưa chia đúng đoạn từ câu 3.' }; }
            return result;
          }
          if (name === 'storyAnalyzeCancel') { s.story.analyze = { busy: false, progress: '', part: 0, parts: 0, error: '' }; }
          if (name === 'images') return ['C:\\Refs\\mai.png'];
          if (name === 'add') s.jobs.push(...data.map(j => ({ ...j, id: String(++id), status: 'pending', stage: 'pending', order: s.jobs.filter(x => x.kind === 'story').length + 1 })));
          if (name === 'start') { s.active = true; s.paused = false; }
          if (name === 'storySetupVoice') { s.story.voice.setupBusy = true; s.story.voice.setupMessage = 'Đang tìm Python…'; }
          if (name === 'storyAddVoice') s.story.voice.clones.push({ key: 'Giong-cua-toi', name: data.name });
          if (name === 'storyListen') return 'C:\\Data\\preview\\nghe.mp3';
          if (name === 'storyPrepare') return { runId: 'r1', scenes: s.jobs.filter(j => j.kind === 'story' && j.storyId === data.storyId).map(j => ({ id: j.id, number: j.order, text: j.voiceover, seconds: 4.4, clipSeconds: 10, voiceSeconds: 4, pauses: [] })) };
          if (name === 'storyBuild') { s.story.output = 'C:\\Videos\\KeChuyen\\Truyen-1\\Truyen-1.mp4'; s.story.srt = data.srt ? 'C:\\Videos\\KeChuyen\\Truyen-1\\Truyen-1.srt' : ''; s.story.notes = [{ scene: 1, cut: 5.6, hold: 0 }, { scene: 2, cut: 0, hold: 2 }]; }
          return structuredClone(s);
        }
      };
    });
    await page.goto(`http://127.0.0.1:${server.address().port}/`);
    await page.waitForFunction(() => document.querySelectorAll('.card').length > 0);
    const called = name => page.evaluate(n => window.calls.filter(c => c.name === n), name);

    // Video tab does not show story clips; the story tab counts them.
    assert.equal(await page.locator('.card').count(), 1);
    assert.equal(await page.locator('#navStoryCount').textContent(), '3');
    assert.equal(await page.locator('#storyPanel').isVisible(), false);
    await page.locator('#navStory').click();
    assert.equal(await page.locator('#headingText').textContent(), 'Danh sách clip kể chuyện');
    assert.equal(await page.locator('.card').count(), 3);
    assert.equal(await page.locator('#storyPanel').isVisible(), true);
    assert.equal(await page.locator('#storyOutput').isVisible(), true);
    assert.equal(await page.locator('#editorPanel').isVisible(), false);
    assert.equal(await page.locator('#outputTools').isVisible(), false);
    assert.equal(await page.locator('#folderPath').textContent(), 'C:\\Videos\\KeChuyen');
    // Each story clip can be watched on its card as soon as it is downloaded (before any export).
    assert.deepEqual(await page.locator('.card video.resultVideo').evaluateAll(l => l.map(v => v.getAttribute('src') + '|' + v.controls)), ['file:///C:/Videos/KeChuyen/Truyen-1/001.mp4|true', 'file:///C:/Videos/KeChuyen/Truyen-1/002.mp4|true', 'file:///C:/Videos/KeChuyen/Truyen-1/003.mp4|true']);
    assert.equal(await page.locator('.card .mediaLabel:has-text("Video đã tải")').count(), 3);
    assert.match(await page.locator('#summary').textContent(), /^3 \/ 3 clip đã lưu$/);
    assert.equal(await page.locator('.card .cardActions button:has-text("Đưa về sửa")').first().isHidden(), true, 'cảnh kể chuyện không có nút đưa về sửa');

    // Script → Muse analysis → character image → create clips.
    await page.locator('#storyScript').fill('Ngày xưa có một cô bé tên Mai sống ở làng ven sông. Mỗi sáng Mai dậy sớm ra bến đón đò.\n\nMột hôm có chú cá vàng nhảy lên thuyền. Mai thả cá về sông và cá hứa sẽ giúp cô một điều ước.');
    await page.locator('#storyCharacter').fill('Mai, bé gái tóc đen');
    assert.equal(await page.locator('#storySplit').count(), 0, 'không còn nút «Chia nhanh»: chỉ Muse đọc hiểu rồi mới chia cảnh');
    await page.locator('#storyAnalyze').click();
    await page.waitForFunction(() => document.querySelectorAll('#storyScenes .draftRow').length >= 2 && !document.getElementById('storyAnalyze').disabled);
    const sceneCount = await page.locator('#storyScenes .draftRow').count();
    assert.ok(sceneCount >= 2, 'cảnh ' + sceneCount);
    assert.match(await page.locator('#storySceneCount').textContent(), /^\d+ cảnh$/);
    assert.match(await page.locator('#storyScenes .draftRow textarea').nth(1).inputValue(), /Audio: no speech, no dialogue/);
    await page.locator('#storyRefs').click();
    assert.match(await page.locator('#storyRefInfo').textContent(), /mai\.png/);

    // Dán thủ công (dự phòng): yêu cầu có câu đánh số; trả lời theo số câu → lời lấy NGUYÊN VĂN từ truyện.
    await page.locator('#storyMuse summary').click();
    await page.locator('#storyAsk').click();
    const instruction = await page.locator('#storyInstruction').inputValue();
    assert.match(instruction, /CÂU CHUYỆN \(đã đánh số câu\):/); assert.match(instruction, /^\[1\] \(/m); assert.match(instruction, /Audio: no speech/);
    assert.match(instruction, /nhận ra MỌI nhân vật/);
    await page.locator('#storyReply').fill('NHÂN VẬT: Mai – theo ảnh tham chiếu\nCẢNH 1\nCÂU: 1-2\nPROMPT: Cô bé Mai đứng trên bến sông lúc bình minh, mỉm cười nhìn mặt nước.\n\nCẢNH 2\nCÂU: 3-4\nPROMPT: Cá vàng bật lên khỏi mặt nước, Mai ngạc nhiên đưa tay đón.');
    await page.locator('#storyParse').click();
    assert.equal(await page.locator('#storyScenes .draftRow').count(), 2);
    assert.match(await page.locator('#storyScenes .draftRow textarea').nth(1).inputValue(), /Cô bé Mai đứng trên bến sông[\s\S]*no speech/);
    assert.equal(await page.locator('#storyScenes .draftRow textarea').nth(0).inputValue(), 'Ngày xưa có một cô bé tên Mai sống ở làng ven sông. Mỗi sáng Mai dậy sớm ra bến đón đò.');
    assert.equal(await page.locator('#storyScenes .storyTag:visible').count(), 0, 'cảnh do Muse viết không bị đánh dấu là prompt mẫu');
    await page.locator('#storyReply').fill('Xin lỗi tôi không làm được'); await page.locator('#storyParse').click();
    assert.match(await page.locator('#toast').textContent(), /Chưa thấy cảnh nào/);
    assert.equal(await page.locator('#storyScenes .draftRow').count(), 2, 'trả lời hỏng không xóa cảnh đang có');

    await page.locator('#storyCreate').click();
    await page.waitForFunction(() => window.calls.some(c => c.name === 'start'));
    const add = (await called('add')).at(-1).data;
    assert.equal(add.length, 2);
    assert.ok(add.every(j => j.kind === 'story' && /^Truyen-\d{8}-\d{6}$/.test(j.storyId) && j.storyId === add[0].storyId));
    assert.deepEqual(add.map(j => j.voiceover), ['Ngày xưa có một cô bé tên Mai sống ở làng ven sông. Mỗi sáng Mai dậy sớm ra bến đón đò.', 'Một hôm có chú cá vàng nhảy lên thuyền. Mai thả cá về sông và cá hứa sẽ giúp cô một điều ước.']);
    assert.ok(add.every(j => j.references.length === 1 && j.references[0] === 'C:\\Refs\\mai.png' && j.image === 'C:\\Refs\\mai.png'));
    assert.deepEqual((await called('start')).at(-1).data, { kind: 'story' });
    assert.equal(await page.locator('#storyScenes .draftRow').count(), 0);

    // Hiểu kịch bản: đối chiếu lời với kịch bản gốc, sửa một chạm, soát từng cảnh, giới hạn 10 giây, đa ngôn ngữ.
    await page.evaluate(() => { document.getElementById('storyPanel').open = true; document.getElementById('storyMuse').open = true; });
    await page.locator('#storyScript').fill('Mai ra bến sông lúc bình minh. Cá vàng nhảy lên thuyền. Mai thả cá về sông.');
    // Muse chép «LỜI» và bỏ sót một câu → app tự căn lời về nguyên văn truyện, câu bị bỏ thành cảnh mẫu.
    await page.locator('#storyReply').fill('CẢNH 1\nLỜI: Mai ra bến sông lúc bình minh.\nPROMPT: Cô bé Mai đứng trên bến sông lúc bình minh, sương mỏng, mặt mỉm cười nhìn mặt nước.\n\nCẢNH 2\nLỜI: Mai thả cá về sông.\nPROMPT: Mai cúi xuống thả cá vàng xuống nước, nét mặt dịu dàng, mặt nước gợn sóng.');
    await page.locator('#storyParse').click();
    await page.waitForFunction(() => document.querySelectorAll('#storyScenes .draftRow').length === 3);
    assert.deepEqual(await page.locator('#storyScenes .draftRow textarea:nth-of-type(1)').evaluateAll(list => list.map(t => t.value)), ['Mai ra bến sông lúc bình minh.', 'Cá vàng nhảy lên thuyền.', 'Mai thả cá về sông.']);
    await page.waitForFunction(() => /prompt mẫu \(chưa qua Muse\): cảnh 2\./.test(document.getElementById('storyCheck').textContent));
    assert.match(await page.locator('#storyCheck').textContent(), /khớp 100% kịch bản gốc[\s\S]*1 cảnh đang dùng prompt mẫu \(chưa qua Muse\): cảnh 2/);
    assert.equal(await page.locator('#storyScenes .draftRow .storyTag').nth(1).isVisible(), true, 'cảnh mẫu có nhãn');
    assert.equal(await page.locator('#storyScenes .draftRow .storyTag').nth(0).isVisible(), false);
    // Người dùng tự xóa mất một câu trong lời đọc → báo lệch kịch bản gốc, một chạm sửa lại.
    await page.locator('#storyScenes .draftRow').nth(0).locator('textarea').nth(0).fill('Mai ra bến.');
    await page.waitForFunction(() => /Chưa khớp kịch bản gốc/.test(document.getElementById('storyCheck').textContent));
    assert.equal(await page.locator('#storyCheck').evaluate(e => e.classList.contains('bad')), true);
    await page.locator('#storyCheck button:has-text("Sửa lời theo kịch bản gốc")').click();
    await page.waitForFunction(() => /khớp 100% kịch bản gốc/.test(document.getElementById('storyCheck').textContent));
    assert.equal(await page.locator('#storyScenes .draftRow').nth(0).locator('textarea').nth(0).inputValue(), 'Mai ra bến sông lúc bình minh.');
    // Sửa prompt của cảnh mẫu thì không còn bị coi là mẫu.
    await page.locator('#storyScenes .draftRow').nth(1).locator('textarea').nth(1).fill('Chú cá vàng nhảy lên thuyền, Mai ngạc nhiên đưa hai tay đón, mắt tròn, miệng hé mở.\nAudio: no speech, no dialogue.');
    await page.waitForFunction(() => document.querySelectorAll('#storyScenes .draftRow .storyTag')[1].hidden);
    // Soát từng cảnh: sửa prompt thành quá ngắn → có cảnh báo ngay trên cảnh đó.
    const prompts = page.locator('#storyScenes .draftRow').nth(0).locator('textarea').nth(1);
    await prompts.fill('Mai ra bến.');
    await page.waitForFunction(() => /Prompt quá ngắn/.test(document.querySelector('#storyScenes .draftRow .storyWarn').textContent));
    assert.match(await page.locator('#storyCheck').textContent(), /1 cảnh cần xem lại trước khi tạo/);
    // Giây mỗi cảnh tự tính theo lời kể, không còn ô nhập tay.
    assert.equal(await page.locator('#storySeconds').count(), 0, 'không còn ô Giây / cảnh');
    await page.locator('#storyScript').fill('Mai ra bến. Cá vàng nhảy lên thuyền, Mai thả cá về sông và mỉm cười thật lâu cùng bà.'); await page.locator('#storyAnalyze').click();
    await page.waitForFunction(() => /^Muse đã chia \d+ cảnh\./.test(document.getElementById('storyInfo').textContent) && !document.getElementById('storyAnalyze').disabled);
    const secs = async () => (await page.locator('#storyScenes .draftRow strong').allTextContents()).map(t => Number(/· (\d+) giây/.exec(t)?.[1]));
    const first = await secs();
    assert.ok(first.length >= 1 && first.every(n => n >= 3 && n <= 10), 'giây trong khoảng 3–10: ' + first);
    await page.locator('#storyScenes .draftRow').nth(0).locator('textarea').nth(0).fill('Mai ra bến.');
    assert.equal((await secs())[0], 3, 'sửa lời ngắn lại thì giây của cảnh đó tự giảm');
    await page.locator('#storyScenes .draftRow').nth(0).locator('textarea').nth(0).fill('Mai ra bến sông lúc bình minh, sương mỏng phủ kín mặt nước yên ả, cô bé đứng lặng thật lâu nhìn dòng nước.');
    assert.ok((await secs())[0] > 3, 'sửa lời dài ra thì giây tăng');
    // Đa ngôn ngữ: kịch bản tiếng Anh chọn giọng tiếng Anh trước; kịch bản tiếng Trung chia theo chữ Hán.
    await page.locator('#storyScript').fill('Every morning, Tom rowed out to the middle of the lake. One day, a golden fish jumped into his boat.');
    await page.locator('#storyAnalyze').click();
    await page.waitForFunction(() => !document.getElementById('storyAnalyze').disabled && document.querySelectorAll('#storyScenes .draftRow').length >= 1);
    assert.deepEqual(await page.locator('#storyScenes .draftRow textarea:nth-of-type(1)').evaluateAll(list => list.map(t => t.value)), ['Every morning, Tom rowed out to the middle of the lake. One day, a golden fish jumped into his boat.']);
    await page.locator('#storyEngine').selectOption('edge');
    await page.locator('#storyVoice').evaluate(e => { e.dispatchEvent(new Event('change')); });
    assert.match(await page.locator('#storyVoice option').first().textContent(), /Aria.*Tiếng Anh ✓/, 'kịch bản tiếng Anh: giọng tiếng Anh đứng đầu');
    await page.locator('#storyScript').fill('小明划船到湖中央等待日出。有一天，一条金鱼跳进了他的船里，请求他放它回去。小明轻轻地把金鱼放回水中。金鱼绕着小船转了三圈才消失。');
    await page.locator('#storyAnalyze').click();
    await page.waitForFunction(() => !document.getElementById('storyAnalyze').disabled && document.querySelectorAll('#storyScenes .draftRow').length >= 1);
    assert.ok(await page.locator('#storyScenes .draftRow').count() >= 1);
    assert.equal((await page.locator('#storyScenes .draftRow textarea:nth-of-type(1)').evaluateAll(list => list.map(t => t.value))).join(''), '小明划船到湖中央等待日出。有一天，一条金鱼跳进了他的船里，请求他放它回去。小明轻轻地把金鱼放回水中。金鱼绕着小船转了三圈才消失。');
    await page.locator('#storyScript').fill('');
    while (await page.locator('#storyScenes .draftRow').count()) await page.locator('#storyScenes .draftRow button:has-text("Xóa cảnh")').first().click();

    // Voices: free setup, listen, clone with consent.
    await page.locator('#storyEngine').selectOption('edge');
    assert.match(await page.locator('#storyVoiceInfo').textContent(), /Chưa cài giọng Microsoft/);
    assert.equal(await page.locator('#storyListen').isDisabled(), false);
    assert.equal(await page.locator('#storyVoice option').count(), 3);
    assert.match(await page.locator('#storyVoice option').first().textContent(), /Hoài My.*✓/, 'giọng hợp ngôn ngữ kịch bản (tiếng Việt) đứng đầu');
    await page.locator('#storySetup').click();
    await page.waitForFunction(() => document.querySelector('#storySetupStop') && !document.querySelector('#storySetupStop').hidden);
    assert.match(await page.locator('#storyVoiceInfo').textContent(), /Đang tìm Python/);
    assert.equal(await page.locator('#storySetup').isDisabled(), true);
    await page.evaluate(() => { Object.assign(window.s.story.voice, { setupBusy: false, setupMessage: '', ready: { edge: true, clone: true } }); window.push(); });
    await page.locator('#storyEngine').selectOption('clone');
    assert.match(await page.locator('#storyVoiceInfo').textContent(), /Chưa có giọng clone/);
    assert.equal(await page.locator('#storyListen').isDisabled(), true);
    assert.equal(await page.locator('#storyCloneAdd').isDisabled(), true, 'chưa tick đồng ý thì không nhân bản');
    await page.locator('#storyCloneBox summary').click();
    await page.locator('#storyCloneName').fill('Giọng của tôi');
    await page.locator('#storyCloneConsent').check();
    assert.equal(await page.locator('#storyCloneAdd').isDisabled(), false);
    await page.locator('#storyCloneAdd').click();
    await page.waitForFunction(() => document.querySelectorAll('#storyClones .cloneName').length === 1);
    assert.deepEqual((await called('storyAddVoice')).at(-1).data, { name: 'Giọng của tôi', consent: true });
    assert.equal(await page.locator('#storyVoice').inputValue(), 'Giong-cua-toi');
    await page.locator('#storyTempo').selectOption('1.15');
    await page.locator('#storyListen').click();
    await page.waitForFunction(() => !document.querySelector('#storyAudio').hidden);
    assert.deepEqual((await called('storyListen')).at(-1).data, { engine: 'clone', voice: 'Giong-cua-toi', tempo: '1.15', text: 'Ngày xưa có một cô bé tên Mai sống ở làng ven sông. Mỗi sáng Mai dậy sớm ra bến đón đò.' });
    assert.match(await page.locator('#storyAudio').getAttribute('src'), /^file:\/\/\/C:\/Data\/preview\/nghe\.mp3$/);

    // Subtitles: preview is drawn; export sends PNG captions only when on; .srt and sound-effect level pass through.
    assert.equal(await page.evaluate(() => { const c = document.getElementById('subPreview'); const d = c.getContext('2d').getImageData(0, c.height * 0.8, c.width, c.height * 0.2).data; for (let i = 0; i < d.length; i += 4) if (d[i] > 240 && d[i + 1] > 240 && d[i + 2] > 240) return true; return false; }), true, 'xem trước vẽ chữ trắng ở phần dưới');
    await page.locator('#subPos').selectOption('top');
    assert.equal(await page.evaluate(() => { const c = document.getElementById('subPreview'); const d = c.getContext('2d').getImageData(0, c.height * 0.8, c.width, c.height * 0.2).data; for (let i = 0; i < d.length; i += 4) if (d[i] > 240 && d[i + 1] > 240 && d[i + 2] > 240) return true; return false; }), false, 'đổi vị trí lên trên thì phần dưới hết chữ');
    await page.locator('#subPos').selectOption('bottom');
    await page.evaluate(() => { window.s.jobs.find(j => j.id === 'story2').status = 'pending'; window.push(); });
    assert.equal(await page.locator('#storyExport').isDisabled(), true);
    assert.match(await page.locator('#storyStatus').textContent(), /Còn 1 cảnh chưa có clip/);
    await page.evaluate(() => { window.s.jobs.find(j => j.id === 'story2').status = 'completed'; window.push(); });
    await page.locator('#subSrt').check(); await page.locator('#storySfx').selectOption('mid'); await page.locator('#storyName').fill('Cô bé Mai');
    await page.locator('#storyExport').click();
    await page.waitForFunction(() => window.calls.some(c => c.name === 'storyBuild'));
    const prep = (await called('storyPrepare')).at(-1).data;
    assert.deepEqual(prep, { storyId: 'Truyen-1', engine: 'clone', voice: 'Giong-cua-toi', tempo: '1.15' });
    let build = (await called('storyBuild')).at(-1).data;
    assert.equal(build.runId, 'r1'); assert.equal(build.subtitles, true); assert.equal(build.srt, true); assert.equal(build.sfx, 'mid'); assert.equal(build.name, 'Cô bé Mai'); assert.equal(build.aspect, '16:9');
    assert.equal(build.scenes.length, 3);
    assert.ok(build.scenes.every(sc => sc.chunks.length >= 1 && sc.chunks.every(c => c.end > c.start && Array.isArray(c.png) && c.png.join() === '137,80,78,71')), 'mỗi đoạn phụ đề là PNG');
    assert.equal(build.scenes[0].chunks[0].text, 'Lời cảnh một.'); assert.equal(build.scenes[0].chunks.at(-1).end, 4.4);
    assert.ok(build.scenes.every(sc => sc.chunks.every(c => Number.isInteger(c.x) && Number.isInteger(c.y) && c.x % 2 === 0 && c.y % 2 === 0 && c.y > 600)), 'phụ đề dưới đáy chỉ gửi vùng chữ, kèm vị trí (x, y)');
    await page.waitForFunction(() => /✓ Truyen-1\.mp4/.test(document.getElementById('storyStatus').textContent));
    assert.match(await page.locator('#storyStatus').textContent(), /Tự edit: cắt 5\.6 giây thừa; 1 cảnh lời dài hơn clip nên giữ khung cuối \(cảnh 2\)/);
    assert.equal(await page.locator('#storyOpen').isVisible(), true);
    await page.locator('#storyOpen').click(); assert.equal((await called('storyReveal')).length, 1);

    // The exported video plays right here in the tab (no need to open the folder).
    const player = page.locator('#storyVideo');
    assert.equal(await player.isVisible(), true);
    assert.equal(await player.getAttribute('src'), 'file:///C:/Videos/KeChuyen/Truyen-1/Truyen-1.mp4');
    assert.equal(await player.evaluate(v => v.controls), true);
    await page.waitForTimeout(500); // the fake file does not exist: let the browser's own load error settle first
    await page.evaluate(() => document.getElementById('storyVideo').dispatchEvent(new Event('error')));
    assert.equal(await page.locator('#storyVideoError').isVisible(), true, 'file lỗi → có báo');
    await page.evaluate(() => document.getElementById('storyVideo').dispatchEvent(new Event('loadeddata')));
    assert.equal(await page.locator('#storyVideoError').isHidden(), true, 'nạp được → ẩn báo');
    // While exporting, the player is removed; the new file is loaded again when done (same name included).
    await page.evaluate(() => { window.s.story.busy = true; window.s.story.progress = 'Đang dựng…'; window.push(); });
    await page.waitForFunction(() => document.getElementById('storyVideo').hidden && !document.getElementById('storyVideo').hasAttribute('src'));
    await page.evaluate(() => { window.s.story.busy = false; window.s.story.progress = ''; window.push(); });
    await page.waitForFunction(() => !document.getElementById('storyVideo').hidden && document.getElementById('storyVideo').getAttribute('src') === 'file:///C:/Videos/KeChuyen/Truyen-1/Truyen-1.mp4');

    // Subtitle switch off: nothing is drawn, .srt-only still carries timings.
    await page.locator('#subOn').uncheck();
    await page.locator('#storyExport').click();
    await page.waitForFunction(() => window.calls.filter(c => c.name === 'storyBuild').length === 2);
    build = (await called('storyBuild')).at(-1).data;
    assert.equal(build.subtitles, false); assert.equal(build.srt, true);
    assert.ok(build.scenes.every(sc => sc.chunks.length >= 1 && sc.chunks.every(c => c.png === null)));
    await page.locator('#subSrt').uncheck();
    await page.locator('#storyExport').click();
    await page.waitForFunction(() => window.calls.filter(c => c.name === 'storyBuild').length === 3);
    build = (await called('storyBuild')).at(-1).data;
    assert.equal(build.subtitles, false); assert.equal(build.srt, false); assert.ok(build.scenes.every(sc => sc.chunks.length === 0));

    // Failed export keeps the message and does not stay stuck.
    await page.evaluate(() => { const original = window.studio.invoke; window.studio.invoke = async (name, data) => { if (name === 'storyPrepare') throw Error('Error invoking remote method \'studio:storyPrepare\': Error: Chưa cài giọng clone.'); return original(name, data); }; });
    await page.locator('#storyExport').click();
    await page.waitForFunction(() => /Chưa cài giọng clone/.test(document.getElementById('toast').textContent));
    assert.equal(await page.locator('#storyExport').isDisabled(), false);

    // Settings persist across reload, tab is remembered, English works.
    await page.reload();
    await page.waitForFunction(() => document.querySelectorAll('.card').length > 0);
    assert.equal(await page.locator('#headingText').textContent(), 'Danh sách clip kể chuyện');
    assert.equal(await page.locator('#storyEngine').inputValue(), 'clone');
    assert.equal(await page.locator('#subOn').isChecked(), false);
    assert.equal(await page.locator('#storySfx').inputValue(), 'mid');
    assert.equal(await page.locator('#storyCharacter').inputValue(), 'Mai, bé gái tóc đen');
    await page.locator('#languagePicker').selectOption('en');
    await page.waitForFunction(() => document.documentElement.lang === 'en' && document.getElementById('storyExport').textContent === 'Export MP4');
    assert.equal(await page.locator('#headingText').textContent(), 'Story clip workspace');
    assert.match(await page.locator('#storyPanel summary').first().textContent(), /Story & character/);
    assert.equal(await page.locator('#navStory').textContent().then(t => t.replace(/\s+/g, '')), '✎Story3');
    assert.equal(await page.locator('#storyListen').textContent(), '▶ Listen to voice');
    assert.equal(await page.locator('#subOn').locator('xpath=..').textContent().then(t => t.trim()), 'Show subtitles in the video');
    assert.equal(await page.locator('#storySfx option[value=low]').textContent(), 'Low (background under narration)');
    // Phần kiểm tra kịch bản cũng được dịch sang tiếng Anh.
    await page.evaluate(() => { document.getElementById('storyPanel').open = true; document.getElementById('storyMuse').open = true; });
    await page.locator('#storyScript').fill('Mai ra bến sông lúc bình minh. Cá vàng nhảy lên thuyền.');
    await page.locator('#storyReply').fill('CẢNH 1\nCÂU: 1-2\nPROMPT: Ngắn.');
    await page.locator('#storyParse').click();
    await page.locator('#storyScenes .draftRow').first().locator('textarea').nth(0).fill('Mai ra bến sông lúc bình minh.');
    await page.waitForFunction(() => /Does not match the original script/.test(document.getElementById('storyCheck').textContent));
    const englishCheck = await page.locator('#storyCheck').textContent();
    assert.match(englishCheck, /1 sentence\(s\) of the script are missing/);
    assert.match(englishCheck, /1 scene\(s\) need a look before creating/);
    assert.equal(await page.locator('#storyCheck button').textContent(), 'Fix narration to match the original script');
    assert.match(await page.locator('#storyScenes .storyWarn').first().textContent(), /Prompt too short/);
    // Phân tích bằng Muse (giao diện): tiến độ hiện trong lúc chờ, nút Dừng, kết quả thay danh sách cảnh.
    await page.evaluate(() => { window.analyzeDelay = 700; });
    await page.locator('#storyScript').fill('Ngày xưa có một cô bé tên Mai sống ở làng ven sông. Mỗi sáng Mai dậy sớm ra bến đón đò. Một hôm có chú cá vàng nhảy lên thuyền. Mai thả cá về sông và cá hứa sẽ giúp cô một điều ước.');
    await page.locator('#storyAnalyze').click();
    await page.waitForFunction(() => document.getElementById('storyAnalyze').disabled && !document.getElementById('storyAnalyzeStop').hidden);
    assert.equal(await page.locator('#storyAnalyze').textContent(), 'Muse is analyzing…');
    assert.match(await page.locator('#storyInfo').textContent(), /Part 1\/1 · Muse is writing \(2 scene\(s\) so far\)…/);
    await page.waitForFunction(() => !document.getElementById('storyAnalyze').disabled);
    assert.equal(await page.locator('#storyAnalyzeStop').isHidden(), true);
    assert.equal(await page.locator('#storyScenes .draftRow').count(), 2);
    assert.match(await page.locator('#storyInfo').textContent(), /^Muse split the story into 2 scenes\. Review the narration and prompts, then click Create clips\.$/);
    assert.equal(await page.locator('#storyScenes .storyTag:visible').count(), 0, 'kết quả của Muse không có cảnh «prompt mẫu»');
    // Khung «Muse hiểu bài thế này»: hiện tóm tắt, cách minh họa, nhân vật, bối cảnh để người dùng thấy ngay chỗ Muse hiểu sai.
    assert.equal(await page.locator('#storyUnderstand').isVisible(), true);
    assert.equal(await page.locator('#storyUnderstand > summary').textContent(), 'This is how Muse understood the text');
    await page.locator('#storyUnderstand > summary').click();
    assert.deepEqual(await page.locator('#storyUnderstandBody h4').allTextContents(), ['Summary', 'How to illustrate it', 'Characters', 'Setting']);
    assert.deepEqual(await page.locator('#storyUnderstandBody p').allTextContents(), ['Mai dắt trâu, thả cá vàng về sông.', 'Truyện kể nhẹ nhàng; dựng đúng diễn biến.', 'Mai – theo ảnh', 'Làng ven sông, buổi sáng.']);
    assert.equal(await page.locator('#storyAnalyze').textContent(), 'Analyze with Muse');
    assert.equal(await page.locator('#storyAnalyzeAgain').isHidden(), true);
    const analyze = (await called('storyAnalyze')).at(-1).data;
    assert.equal(analyze.seconds, 10); assert.equal(analyze.aspect, '16:9'); assert.match(analyze.script, /^Ngày xưa/); assert.equal(analyze.character, 'Mai, bé gái tóc đen');
    assert.equal('resume' in analyze, false, 'lần đầu không gửi vị trí làm tiếp');
    // Muse dừng giữa chừng: giữ cảnh đã chia, nút thành «Phân tích tiếp» (không tự chia nhanh); làm tiếp gửi chỗ dừng + nhân vật.
    await page.evaluate(() => { window.analyzeStop = true; window.analyzeDelay = 200; });
    await page.locator('#storyAnalyze').click();
    await page.waitForFunction(() => document.getElementById('storyAnalyze').textContent === 'Continue analysis');
    assert.equal(await page.locator('#storyScenes .draftRow').count(), 1);
    assert.match(await page.locator('#storyInfo').textContent(), /^Muse split 1 scene\(s\) and stopped at sentence 3\/\d+\. Muse did not split the part from sentence 3 correctly\. Click “Continue analysis” so Muse carries on from there/);
    assert.equal(await page.locator('#storyScenes .storyTag:visible').count(), 0);
    assert.equal(await page.locator('#storyAnalyzeAgain').isVisible(), true);
    assert.equal(await page.locator('#storyAnalyzeAgain').textContent(), 'Analyze again from the start');
    await page.evaluate(() => { window.analyzeStop = false; });
    await page.locator('#storyAnalyze').click();
    await page.waitForFunction(() => document.getElementById('storyAnalyze').textContent === 'Analyze with Muse' && !document.getElementById('storyAnalyze').disabled);
    assert.equal(await page.locator('#storyScenes .draftRow').count(), 3, 'cảnh đã có được giữ, cảnh mới nối tiếp');
    assert.deepEqual(await page.evaluate(() => window.storyUi.scenes.map(sc => sc.title)), ['Cảnh 1', 'Cảnh 2', 'Cảnh 3'], 'đánh số lại liên tục sau khi nối');
    assert.deepEqual((await called('storyAnalyze')).at(-1).data.resume, { from: 3, cast: 'Mai – theo ảnh', understanding: { summary: 'Mai dắt trâu, thả cá vàng về sông.', approach: 'Truyện kể nhẹ nhàng; dựng đúng diễn biến.', setting: 'Làng ven sông, buổi sáng.' } }, 'làm tiếp mang theo chỗ dừng, nhân vật và phần Muse đã hiểu');
    assert.equal(await page.locator('#storyUnderstand').isVisible(), true);
    assert.equal(await page.locator('#storyAnalyzeAgain').isHidden(), true);
    // Sửa truyện sau khi dừng → không còn làm tiếp được; «Phân tích lại từ đầu» hỏi trước rồi thay hết, không gửi vị trí cũ.
    await page.evaluate(() => { window.analyzeStop = true; });
    await page.locator('#storyAnalyze').click();
    await page.waitForFunction(() => document.getElementById('storyAnalyze').textContent === 'Continue analysis');
    await page.locator('#storyScript').fill(await page.locator('#storyScript').inputValue() + ' Thêm một câu nữa.');
    assert.equal(await page.locator('#storyAnalyze').textContent(), 'Analyze with Muse', 'sửa truyện thì hết làm tiếp');
    await page.locator('#storyScript').fill(analyze.script);
    assert.equal(await page.locator('#storyAnalyze').textContent(), 'Continue analysis', 'trả lại đúng truyện thì làm tiếp được');
    await page.evaluate(() => { window.analyzeStop = false; });
    await page.locator('#storyAnalyzeAgain').click();
    await page.waitForFunction(() => !document.getElementById('storyAnalyze').disabled && document.querySelectorAll('#storyScenes .draftRow').length === 2);
    assert.equal('resume' in (await called('storyAnalyze')).at(-1).data, false, 'làm lại từ đầu không gửi vị trí cũ');
    assert.equal(await page.locator('#storyAnalyze').textContent(), 'Analyze with Muse');
    const analyzeCalls = (await called('storyAnalyze')).length;
    await page.locator('#storyScript').fill(''); await page.locator('#storyAnalyze').click();
    assert.match(await page.locator('#toast').textContent(), /Paste the story first/);
    assert.equal((await called('storyAnalyze')).length, analyzeCalls, 'không gửi Muse khi chưa có truyện');
    assert.deepEqual(errors, []);
    console.log('PASS: story tab — own jobs/counts/folder, Muse analysis + pasted Muse reply parsing (no-speech rule kept), no quick split, character image on every scene, free voice setup/listen/clone with consent, subtitles on/off + .srt + PNG captions, auto-edit report, export errors, persistence, English labels.');
  } finally { await browser.close(); server.close(); }
})().catch(e => { console.error(e); process.exitCode = 1; });
