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
    const openFolds = () => page.evaluate(() => document.querySelectorAll('details.more').forEach(d => { d.open = true; }));   // «Tùy chọn thêm» đóng sẵn cho gọn: mở ra khi cần thao tác
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
        story: { busy: false, progress: '', error: '', output: '', srt: '', notes: [], voice: { setupBusy: false, setupMessage: '', setupError: '', ready: { edge: false, clone: false }, platform: 'win32', edgeVoices: [{ id: 'vi-VN-HoaiMyNeural', lang: 'vi', language: 'Tiếng Việt', name: 'Hoài My (nữ)' }, { id: 'vi-VN-NamMinhNeural', lang: 'vi', language: 'Tiếng Việt', name: 'Nam Minh (nam)' }, { id: 'en-US-AriaNeural', lang: 'en', language: 'Tiếng Anh', name: 'Aria (nữ)' }], windowsVoices: [{ name: 'Microsoft An', culture: 'vi-VN', gender: 'Male' }], clones: [], presets: [{ name: 'Adam bựa', desc: 'Nam · Bắc · Phong cách tự nhiên', gender: 'm', region: 'Bắc' }, { name: 'Thiện Minh', desc: 'Nam · Bắc · Phong cách kể chuyện', gender: 'm', region: 'Bắc' }, { name: 'Quang Sơn', desc: 'Nam · Trung · Phong cách tự nhiên', gender: 'm', region: 'Trung' }, { name: 'Thái Sơn', desc: 'Nam · Nam · Phong cách kể chuyện', gender: 'm', region: 'Nam' }], catalog: { live: false, count: 3, at: 0, busy: false, error: '' } } },
        settings: { browserChoice: 'builtin', browserPath: '', output: 'C:\\Videos', autoMerge: false, autoPackage: false, ffmpeg: 'ffmpeg', accountCount: 2, composer: 'textarea', fileInput: 'input[type=file]', submit: '', video: 'video', image: 'img', attachmentReadySelector: '', timeoutMinutes: 15 }
      };
      window.calls = []; window.s = s; let listener, id = 100;
      window.push = () => listener(structuredClone(s));
      window.studio = {
        onUpdate: fn => listener = fn,
        invoke: async (name, data) => {
          window.calls.push({ name, data: name === 'storyBuild' ? { ...data, scenes: data.scenes.map(sc => ({ id: sc.id, chunks: sc.chunks.map(c => ({ text: c.text, start: c.start, end: c.end, x: c.x, y: c.y, png: c.png ? [...c.png.slice(0, 4)] : null })) })) } : data });
          if (name === 'storyAnalyze') {
            if (window.analyzeFail) throw Error("Error invoking remote method 'storyAnalyze': Error: Muse không trả lời, thử lại sau.");
            s.story.analyze = { busy: true, progress: 'Phần 1/1 · Muse đang viết (đã 2 cảnh)…', part: 1, parts: 1, error: '' }; listener(structuredClone(s));
            await new Promise(r => setTimeout(r, window.analyzeDelay || 300));
            s.story.analyze = { busy: false, progress: 'Muse đã chia 2 cảnh', part: 1, parts: 1, error: '' };
            listener(structuredClone(s));
            const units = data.script.split(/(?<=[.!?])\s+/);
            const result = { scenes: [{ title: 'Cảnh 1', source: units.slice(0, 2).join(' '), voiceover: units.slice(0, 2).join(' '), visual: '', prompt: 'Mai dắt trâu qua cánh đồng lúc bình minh, mỉm cười.\nAudio: no speech, no dialogue, no singing, no narration, no lip movement - characters stay silent with mouths closed.', durationSeconds: 10, units: [1, 2] }, { title: 'Cảnh 2', source: units.slice(2).join(' '), voiceover: units.slice(2).join(' '), visual: '', prompt: 'Chú cá vàng nhảy lên thuyền, Mai ngạc nhiên đưa tay đón.\nAudio: no speech, no dialogue, no singing, no narration, no lip movement - characters stay silent with mouths closed.', durationSeconds: 10, units: [3, 4] }].filter(sc => sc.voiceover.trim()), cast: 'Mai – theo ảnh', understanding: { summary: 'Mai dắt trâu, thả cá vàng về sông.', approach: 'Truyện kể nhẹ nhàng; dựng đúng diễn biến.', setting: 'Làng ven sông, buổi sáng.' }, notes: [] };
            if (data.tip) { result.scenes = result.scenes.map((sc, i) => ({ ...sc, prompt: 'Bếp gỗ sáng. 0–5 giây [câu ' + sc.units[0] + ']: tay đặt tỏi lên thớt. 5–10 giây [câu ' + sc.units[1] + ']: dao đập nhẹ.\nAudio: no speech, no dialogue.', image: 'Tạo ảnh chụp thật cận cảnh tay đặt tép tỏi lên thớt gỗ tròn, ánh sáng cửa sổ, bước ' + (i + 1) + '.\nTỷ lệ khung hình ảnh: 16:9 (ngang).\nKhông có chữ, chữ số, logo, hình mờ hay phụ đề trong ảnh.' })); result.understanding = null; }
            if (window.sceneCount) result.scenes = Array.from({ length: window.sceneCount }, (_, i) => ({ ...result.scenes[i % result.scenes.length], title: 'Cảnh ' + (i + 1) }));   // bài dài: nhiều cảnh
            if (window.analyzeStop && !data.resume) { result.scenes = result.scenes.slice(0, 1); result.incomplete = { from: 3, total: units.length, message: 'Muse chưa chia đúng đoạn từ câu 3.' }; }
            return result;
          }
          if (name === 'storyAdWrite') {
            s.story.analyze = { busy: true, kind: 'write', progress: 'Viết mẹo vặt · Muse đang viết…', part: 0, parts: 1, error: '' }; listener(structuredClone(s));
            await new Promise(r => setTimeout(r, window.writeDelay || 300));
            s.story.analyze = { busy: false, kind: 'write', progress: 'Muse đã viết xong mẹo vặt (2 bước)', part: 0, parts: 1, error: '' }; listener(structuredClone(s));
            return { script: 'Tủ lạnh có mùi thì thử cách này. Bước 1: Lấy hộp baking soda. Bước 2: Đặt vào ngăn giữa. Vậy là xong.', notes: ['Muse còn thiếu bước 3: bổ sung vào ô mẹo hoặc bấm viết lại.'] };
          }
          if (name === 'storyAnalyzeCancel') { s.story.analyze = { busy: false, progress: '', part: 0, parts: 0, error: '' }; }
          if (name === 'images') return ['C:\\Refs\\mai.png'];
          if (name === 'add') s.jobs.push(...data.map(j => ({ ...j, id: String(++id), status: 'pending', stage: 'pending', order: s.jobs.filter(x => x.kind === 'story').length + 1 })));
          if (name === 'start') { s.active = true; s.paused = false; }
          if (name === 'storyRefreshVoices') { const vv = s.story.voice; vv.edgeVoices.push({ id: 'fr-CA-SylvieNeural', lang: 'fr', language: 'Tiếng Pháp', name: 'Sylvie (nữ) · fr-CA' }); vv.catalog = { live: true, count: vv.edgeVoices.length, at: 1, busy: false, error: '' }; }
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
    // Giao diện gọn: các ô phụ nằm trong «Tùy chọn thêm» và đều đóng sẵn.
    assert.deepEqual(await page.evaluate(() => [...document.querySelectorAll('details.more')].map(d => [d.id || 'scene', d.open])), [['tipMore', false], ['subMore', false]]);
    assert.equal(await page.locator('#tipMore summary').textContent(), 'Tùy chọn thêm');
    assert.equal(await page.locator('#subMore summary').textContent(), 'Kiểu chữ phụ đề (phông, cỡ, màu, vị trí)');

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
    await page.locator('#storyForm').fill('người que, đầu tròn trắng');
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
    await page.locator('#storyReply').fill('NHÂN VẬT: Mai – theo ảnh tham chiếu\nCẢNH 1\nCÂU: 1-2\nPROMPT: Cô bé Mai đứng trên bến sông lúc bình minh, mỉm cười nhìn mặt nước.\n0–5 giây [câu 1]: Mai đứng trên bến sông, nhìn mặt nước.\n5–10 giây [câu 2]: Mai vẫy tay chào người lái đò.\n\nCẢNH 2\nCÂU: 3-4\nPROMPT: Cá vàng bật lên khỏi mặt nước, Mai ngạc nhiên đưa tay đón.\n0–5 giây [câu 4]: Mai thả cá về sông.\n5–10 giây [câu 3]: Cá vàng nhảy lên thuyền.');
    await page.locator('#storyParse').click();
    assert.equal(await page.locator('#storyScenes .draftRow').count(), 2);
    assert.match(await page.locator('#storyScenes .draftRow textarea').nth(1).inputValue(), /Cô bé Mai đứng trên bến sông[\s\S]*no speech/);
    assert.equal(await page.locator('#storyScenes .draftRow textarea').nth(0).inputValue(), 'Ngày xưa có một cô bé tên Mai sống ở làng ven sông. Mỗi sáng Mai dậy sớm ra bến đón đò.');
    assert.equal(await page.locator('#storyScenes .storyTag:visible').count(), 0, 'cảnh do Muse viết không bị đánh dấu là prompt mẫu');
    // Mốc chuyển động: cảnh 2 ghi câu 4 trước câu 3 → cảnh báo ngay ở cảnh đó; cảnh 1 đúng thứ tự thì không bị cảnh báo mốc.
    await page.waitForFunction(() => /đảo thứ tự câu/.test(document.querySelectorAll('#storyScenes .draftRow')[1]?.textContent || ''));
    assert.ok(!/đảo thứ tự câu|Chưa có mốc nào/.test(await page.locator('#storyScenes .draftRow').nth(0).textContent()), 'cảnh đúng thứ tự không bị báo lỗi mốc');
    assert.match(await page.locator('#storyScenes .draftRow').nth(1).textContent(), /câu 4 rồi câu 3/);

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
    assert.ok(add.every(j => !/\[\s*câu/i.test(j.prompt)), 'thẻ [câu N] bị bỏ trước khi gửi tạo video');
    assert.match(add[1].prompt, /0–5 giây: Mai thả cá về sông\.\n5–10 giây: Cá vàng nhảy lên thuyền\./);
    assert.deepEqual((await called('start')).at(-1).data, { kind: 'story' });
    assert.equal(await page.locator('#storyScenes .draftRow').count(), 0);

    // Hiểu kịch bản: đối chiếu lời với kịch bản gốc, sửa một chạm, soát từng cảnh, giới hạn 10 giây, đa ngôn ngữ.
    await page.evaluate(() => { document.getElementById('storyPanel').open = true; document.getElementById('storyMuse').open = true; });
    await page.locator('#storyScript').fill('Mai ra bến sông lúc bình minh. Cá vàng nhảy lên thuyền. Mai thả cá về sông.');
    // Muse chép «LỜI» và bỏ sót một câu → app tự căn lời về nguyên văn truyện, câu bị bỏ thành cảnh mẫu.
    await page.locator('#storyReply').fill('CẢNH 1\nLỜI: Mai ra bến sông lúc bình minh.\nPROMPT: Cô bé Mai đứng trên bến sông lúc bình minh, sương mỏng, mặt mỉm cười nhìn mặt nước.\n\nCẢNH 2\nLỜI: Mai thả cá về sông.\nPROMPT: Mai cúi xuống thả cá vàng xuống nước, nét mặt dịu dàng, mặt nước gợn sóng.');
    await page.locator('#storyParse').click();
    await page.waitForFunction(() => document.querySelectorAll('#storyScenes .draftRow').length === 3);
    assert.deepEqual(await page.locator('#storyScenes .draftRow .draftContent > textarea').evaluateAll(list => list.map(t => t.value)), ['Mai ra bến sông lúc bình minh.', 'Cá vàng nhảy lên thuyền.', 'Mai thả cá về sông.']);
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
    await openFolds();
    await page.locator('#storyScenes .draftRow').nth(1).locator('textarea').nth(1).fill('Chú cá vàng nhảy lên thuyền, Mai ngạc nhiên đưa hai tay đón, mắt tròn, miệng hé mở.\nAudio: no speech, no dialogue.');
    await page.waitForFunction(() => document.querySelectorAll('#storyScenes .draftRow .storyTag')[1].hidden);
    // Soát từng cảnh: sửa prompt thành quá ngắn → có cảnh báo ngay trên cảnh đó.
    await openFolds();
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
    assert.deepEqual(await page.locator('#storyScenes .draftRow .draftContent > textarea').evaluateAll(list => list.map(t => t.value)), ['Every morning, Tom rowed out to the middle of the lake. One day, a golden fish jumped into his boat.']);
    await page.locator('#storyEngine').selectOption('edge');
    await page.locator('#storyVoice').evaluate(e => { e.dispatchEvent(new Event('change')); });
    assert.match(await page.locator('#storyVoice option').first().textContent(), /^Aria \(nữ\) ✓$/, 'kịch bản tiếng Anh: giọng tiếng Anh đứng đầu');
    assert.equal(await page.locator('#storyVoice option').first().evaluate(o => o.parentElement.label), 'Tiếng Anh', 'giọng nhóm theo ngôn ngữ');
    await page.locator('#storyScript').fill('小明划船到湖中央等待日出。有一天，一条金鱼跳进了他的船里，请求他放它回去。小明轻轻地把金鱼放回水中。金鱼绕着小船转了三圈才消失。');
    await page.locator('#storyAnalyze').click();
    await page.waitForFunction(() => !document.getElementById('storyAnalyze').disabled && document.querySelectorAll('#storyScenes .draftRow').length >= 1);
    assert.ok(await page.locator('#storyScenes .draftRow').count() >= 1);
    assert.equal((await page.locator('#storyScenes .draftRow .draftContent > textarea').evaluateAll(list => list.map(t => t.value))).join(''), '小明划船到湖中央等待日出。有一天，一条金鱼跳进了他的船里，请求他放它回去。小明轻轻地把金鱼放回水中。金鱼绕着小船转了三圈才消失。');
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
    // Giọng Việt có sẵn VieNeu (25 giọng, offline, không cần file mẫu), nhóm theo vùng; mặc định giọng kể chuyện.
    await page.locator('#storyEngine').selectOption('preset');
    assert.match(await page.locator('#storyVoiceInfo').textContent(), /^25 giọng Việt có sẵn của VieNeu: miễn phí, chạy offline/);
    assert.deepEqual(await page.locator('#storyVoice optgroup').evaluateAll(g => g.map(x => x.label)), ['Miền Bắc', 'Miền Trung', 'Miền Nam']);
    assert.equal(await page.locator('#storyVoice option').count(), 4);
    assert.equal(await page.locator('#storyVoice').inputValue(), 'Thiện Minh', 'giọng kể chuyện là mặc định');
    assert.equal(await page.locator('#storyVoice option[value="Quang Sơn"]').textContent(), 'Quang Sơn — Nam · Trung · Phong cách tự nhiên');
    assert.equal(await page.locator('#storyVoiceRefresh').isVisible(), false, 'nút tải lại danh sách chỉ có ở giọng Microsoft');
    await page.locator('#storyListen').click();
    await page.waitForFunction(() => window.calls.some(c => c.name === 'storyListen' && c.data.engine === 'preset'));
    assert.equal((await called('storyListen')).at(-1).data.voice, 'Thiện Minh');
    // Giọng Microsoft: nhóm theo ngôn ngữ; nút «Tải lại danh sách giọng» lấy danh sách thật từ Microsoft (thêm giọng, đổi thông báo).
    await page.locator('#storyEngine').selectOption('edge');
    assert.deepEqual(await page.locator('#storyVoice optgroup').evaluateAll(g => g.map(x => x.label)), ['Tiếng Việt', 'Tiếng Anh']);
    assert.match(await page.locator('#storyVoiceInfo').textContent(), /^Giọng Microsoft miễn phí: 3 giọng, nhiều ngôn ngữ.*Đang dùng danh sách có sẵn; bấm «Tải lại danh sách giọng»/);
    assert.equal(await page.locator('#storyVoiceRefresh').isVisible(), true);
    assert.equal(await page.locator('#storyVoiceRefresh').isDisabled(), false);
    await page.locator('#storyVoiceRefresh').click();
    await page.waitForFunction(() => /Danh sách tải từ Microsoft/.test(document.getElementById('storyVoiceInfo').textContent));
    assert.equal((await called('storyRefreshVoices')).length, 1);
    assert.deepEqual(await page.locator('#storyVoice optgroup').evaluateAll(g => g.map(x => x.label)), ['Tiếng Việt', 'Tiếng Anh', 'Tiếng Pháp']);
    assert.match(await page.locator('#storyVoiceInfo').textContent(), /^Giọng Microsoft miễn phí: 4 giọng/);
    assert.match(await page.locator('#toast').textContent(), /Đã tải danh sách giọng Microsoft\./);
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
    await openFolds();
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
    assert.equal(await page.locator('#storyForm').inputValue(), 'người que, đầu tròn trắng', 'hình dạng chuẩn được nhớ sau khi tải lại');
    await page.locator('#languagePicker').selectOption('en');
    await page.waitForFunction(() => document.documentElement.lang === 'en' && document.getElementById('storyExport').textContent === 'Export MP4');
    assert.equal(await page.locator('#headingText').textContent(), 'Story clip workspace');
    assert.match(await page.locator('#storyPanel summary').first().textContent(), /Story & character/);
    assert.equal(await page.locator('#navStory').textContent().then(t => t.replace(/\s+/g, '')), '✎Story3');
    assert.equal(await page.locator('#storyListen').textContent(), '▶ Listen to voice');
    // Giọng mới (VieNeu có sẵn, danh sách Microsoft) cũng có bản tiếng Anh.
    assert.equal(await page.locator('#storyEngine option[value=preset]').textContent(), 'Built-in Vietnamese voices (VieNeu, free, offline)');
    await page.locator('#storyEngine').selectOption('preset');
    assert.match(await page.locator('#storyVoiceInfo').textContent(), /^VieNeu voices are not installed\. Click “Install free voices”/);
    await page.evaluate(() => { Object.assign(window.s.story.voice, { ready: { edge: true, clone: true } }); window.push(); });
    assert.match(await page.locator('#storyVoiceInfo').textContent(), /^25 built-in Vietnamese VieNeu voices: free, run offline on this computer/);
    await page.locator('#storyEngine').selectOption('edge');
    assert.equal(await page.locator('#storyVoiceRefresh').textContent(), '↻ Reload voice list');
    assert.match(await page.locator('#storyVoiceInfo').textContent(), /^Free Microsoft voices: 3 voices, many languages \(✓ = matches the script language\), internet needed when reading\. Using the built-in list; click “Reload voice list” when online to get every voice\.$/);
    await page.locator('#storyVoiceRefresh').click();
    await page.waitForFunction(() => /The list was loaded from Microsoft\.$/.test(document.getElementById('storyVoiceInfo').textContent));
    assert.match(await page.locator('#storyVoiceInfo').textContent(), /^Free Microsoft voices: 4 voices/);
    assert.match(await page.locator('#toast').textContent(), /Microsoft voice list loaded\./);
    assert.equal(await page.evaluate(() => window.studioI18n.t('Chưa tải được danh sách giọng Microsoft (mạng lỗi). Đang dùng danh sách có sẵn.')), 'Could not load the Microsoft voice list (mạng lỗi). Using the built-in list.');
    await page.locator('#storyEngine').selectOption('clone');
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
    // Cảnh báo mốc chuyển động cũng được dịch.
    await page.locator('#storyReply').fill('CẢNH 1\nCÂU: 1-2\nPROMPT: Bối cảnh bến sông lúc bình minh, ánh nắng vàng nhẹ.\n0–5 giây [câu 2]: Mai mỉm cười.\n5–10 giây [câu 1]: Cá vàng nhảy.');
    await page.locator('#storyParse').click();
    await page.waitForFunction(() => /Marks jump back in sentence order \(sentence 2 then sentence 1\); they must follow the narration order\./.test(document.querySelector('#storyScenes .storyWarn')?.textContent || ''));
    assert.match(await page.locator('#storyScenes .storyWarn').first().textContent(), /Time marks look wrong \(this scene's video is \d+ seconds\)/);
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
    assert.equal(analyze.form, 'người que, đầu tròn trắng', 'ô «Hình dạng nhân vật chuẩn» được gửi đi để khóa hình dạng'); assert.equal(analyze.seconds, 10); assert.equal(analyze.aspect, '16:9'); assert.match(analyze.script, /^Ngày xưa/); assert.equal(analyze.character, 'Mai, bé gái tóc đen');
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
    // Mẹo vặt: chế độ riêng. Mỗi bước có prompt ảnh + prompt chuyển động; thêm vào hàng đợi thành việc ảnh (trước) rồi việc clip (sau, phụ thuộc ảnh).
    {
      const tipText = 'Mẹo bóc tỏi nhanh. Đặt tép tỏi lên thớt và đập nhẹ. Vỏ tỏi bong ra ngay. Cho tỏi vào hộp kín và lắc mạnh.';
      await page.locator('#storyScript').fill(''); 
      await page.locator('#modeTip').click();   // hộp thoại xác nhận đổi chế độ tự đồng ý
      assert.equal(await page.locator('#modeTip').getAttribute('aria-pressed'), 'true');
      assert.equal(await page.locator('#modeStory').getAttribute('aria-pressed'), 'false');
      assert.equal(await page.locator('#storyHead').textContent(), '1. Tip (written by Muse, editable)');
      assert.equal(await page.locator('#tipBox').isVisible(), true, 'ô tiêu đề hiện trong chế độ Mẹo vặt');
      assert.equal(await page.locator('#storyCreate').textContent(), '▶ Create images + clips');
      for (const id of ['storyRefRow', 'storyRefPaste', 'storyCharacter', 'storyForm']) assert.equal(await page.locator('#' + id).isVisible(), false, id + ' ẩn trong chế độ Mẹo vặt');
      assert.match(await page.locator('#storyInfo').textContent(), /Enter a tip title, then click “Muse writes the tip and splits scenes”/);
      assert.match(await page.locator('#storyStyle').getAttribute('placeholder'), /Photorealistic by default/);
      assert.equal(await page.evaluate(() => JSON.parse(localStorage.getItem('museStudio.story')).mode), 'tip');
      await page.locator('#storyScript').fill(tipText);
      await page.locator('#storyAnalyze').click();
      await page.waitForFunction(() => !document.getElementById('storyAnalyze').disabled && document.querySelectorAll('#storyScenes .draftRow').length === 2);
      const call = (await called('storyAnalyze')).at(-1).data;
      assert.equal(call.tip, true); assert.equal(call.reference, false);
      assert.equal(await page.locator('#storyScenes .draftRow').first().locator('textarea').count(), 3, 'lời đọc + prompt ảnh + prompt chuyển động');
      const labels = await page.locator('#storyScenes .draftRow').first().locator('label.storyLabel').allTextContents();
      assert.deepEqual(labels, ['Narration', 'Image prompt (first frame)', 'Motion prompt (made from the image)']);
      assert.match(await page.locator('#storyInfo').textContent(), /click Create images \+ clips/);
      if (process.env.TIP_SHOT) { await page.locator('#storyCompose').scrollIntoViewIfNeeded(); await page.screenshot({ path: process.env.TIP_SHOT, clip: { x: 0, y: 0, width: 1450, height: 1500 } }); }
      assert.equal(await page.locator('#storyScenes .draftRow').first().locator('textarea').nth(1).inputValue().then(v => v.startsWith('Tạo ảnh chụp thật cận cảnh')), true);
      // Xóa prompt ảnh của một bước thì báo ngay và không cho thêm vào hàng đợi.
      await openFolds();
      const image2 = page.locator('#storyScenes .draftRow').nth(1).locator('textarea').nth(1);
      const keep = await image2.inputValue();
      await image2.fill('');
      await page.waitForFunction(() => /No image prompt/.test(document.getElementById('storyScenes').textContent));
      const before = (await called('add')).length;
      await page.locator('#storyCommit').click();
      assert.match(await page.locator('#toast').textContent(), /Every step needs an image prompt/);
      assert.equal((await called('add')).length, before, 'chưa gọi thêm vào hàng đợi');
      await image2.fill(keep);
      await page.locator('#storyCommit').click();
      await page.waitForFunction(n => window.calls.filter(c => c.name === 'add').length > n, before);
      const add = (await called('add')).at(-1).data;
      assert.deepEqual(add.map(j => [j.phase, j.number, j.dependsOn || '']), [['image', 1, ''], ['image', 2, ''], ['clip', 1, 'image'], ['clip', 2, 'image']]);
      assert.ok(add.every(j => j.kind === 'story' && /^Truyen-\d{8}-\d{6}$/.test(j.storyId) && j.storyId === add[0].storyId));
      assert.ok(add.slice(0, 2).every(j => /^Tạo ảnh chụp thật cận cảnh/.test(j.prompt) && !j.voiceover && !j.references?.length && !j.image), 'việc ảnh: prompt ảnh, không lời đọc, không ảnh tham chiếu');
      assert.ok(add.slice(2).every(j => /^Bếp gỗ sáng\./.test(j.prompt) && !/\[\s*câu/i.test(j.prompt) && j.voiceover && j.durationSeconds >= 3 && !j.references?.length), 'việc clip: prompt chuyển động bỏ thẻ [câu N], có lời đọc, ảnh sẽ do hàng đợi gắn');
      assert.deepEqual(add.map(j => j.title), ['Cảnh 1 · ảnh', 'Cảnh 2 · ảnh', 'Cảnh 1 · clip', 'Cảnh 2 · clip']);
      // Ghép MP4 chỉ đếm clip (không đếm việc ảnh).
      await page.evaluate(() => { window.s.jobs.filter(j => j.kind === 'story' && j.phase).forEach(j => { j.status = 'completed'; j.output = 'C:\\Videos\\KeChuyen\\x\\' + j.number + (j.phase === 'image' ? '.png' : '.mp4'); }); window.push(); });
      await page.waitForFunction(() => /· 2\/2$/.test([...document.querySelectorAll('#storyPick option')].at(-1)?.textContent || ''));
      assert.equal(await page.locator('#storyExport').isDisabled(), false, 'đủ clip (2/2, không tính 2 việc ảnh) thì xuất MP4 được');
      await page.evaluate(() => { document.getElementById('storyPanel').open = true; });   // sau khi thêm vào hàng đợi khung được thu lại
      // Chỉ nhập TIÊU ĐỀ: Muse viết mẹo theo bước rồi tự chia cảnh; không cần dán gì.
      {
        const writes = async () => (await called('storyAdWrite')).length;
        await page.locator('#tipWrite').click();
        assert.match(await page.locator('#toast').textContent(), /Enter the tip title first/);
        assert.equal(await writes(), 0, 'chưa có tiêu đề thì không gọi Muse');
        assert.equal(await page.locator('#tipMinutes').inputValue(), '2'); assert.equal(await page.locator('#tipSecs').inputValue(), '8'); assert.equal(await page.locator('#tipLanguage').inputValue(), 'vi');
        assert.deepEqual(await page.locator('#tipMinutes option').allTextContents(), ['1 minute', '2 minutes', '3 minutes', '5 minutes', '10 minutes']);
        assert.deepEqual(await page.locator('#tipSecs option').allTextContents(), ['6 seconds', '8 seconds', '10 seconds']);
        assert.match(await page.locator('#tipCount').textContent(), /^≈ 15 scenes \(1 intro \+ 13 steps \+ 1 ending\) = 15 pictures \+ 15 clips, each scene narrated for about 8 seconds\. Creating the pictures and clips uses about 30 Muse generations\.$/);
        await page.locator('#tipTitle').fill('  Mẹo khử mùi tủ lạnh  ');
        await openFolds();
        await page.locator('#tipMinutes').selectOption('3'); await page.locator('#tipSecs').selectOption('6'); await page.locator('#tipLanguage').selectOption('en');
        assert.match(await page.locator('#tipCount').textContent(), /^≈ 30 scenes \(1 intro \+ 28 steps \+ 1 ending\) = 30 pictures \+ 30 clips, each scene narrated for about 6 seconds\. Creating the pictures and clips uses about 60 Muse generations\.$/);
        assert.equal(await page.locator('#tipLanguage option').nth(1).textContent(), 'English — Tiếng Anh', 'tên ngôn ngữ giữ nguyên ở giao diện tiếng Anh');
        await page.evaluate(() => { window.writeDelay = 700; });
        const analyzed = (await called('storyAnalyze')).length;
        await page.locator('#tipWrite').click();   // ô mẹo đang có chữ → hộp thoại xác nhận tự đồng ý
        await page.waitForFunction(() => /Muse is writing the tip/.test(document.getElementById('tipWrite').textContent));
        assert.equal(await page.locator('#tipWrite').isDisabled(), true, 'đang viết thì không bấm được lần nữa');
        await page.waitForFunction(n => window.calls.filter(c => c.name === 'storyAnalyze').length > n && !document.getElementById('storyAnalyze').disabled && document.querySelectorAll('#storyScenes .draftRow').length === 2, analyzed);
        const write = (await called('storyAdWrite')).at(-1).data;
        assert.deepEqual([write.tip, write.tipTitle, write.tipMinutes, write.tipLanguage, write.seconds, write.reference, write.aspect], [true, '  Mẹo khử mùi tủ lạnh  ', 3, 'en', 6, false, '16:9']);
        assert.equal(write.tipMotion, 'gentle', 'mặc định chuyển động nhẹ, ổn định');
        assert.equal(write.tipPrompt, 'en', 'mặc định prompt gửi Muse bằng tiếng Anh');
        assert.equal(write.ad, undefined);
        const script = await page.locator('#storyScript').inputValue();
        assert.match(script, /^Tủ lạnh có mùi thì thử cách này\. Bước 1:/);
        const chain = (await called('storyAnalyze')).at(-1).data;
        assert.equal(chain.script, script, 'chia cảnh ngay sau khi viết, đúng mẹo vừa viết');
        assert.deepEqual([chain.tip, chain.seconds, chain.reference], [true, 6, false]);
        assert.match(await page.locator('#toast').textContent(), /Muse left out step 3: add them to the tip box or write again\./);
        assert.match(await page.locator('#storyInfo').textContent(), /click Create images \+ clips/);
        assert.equal(await writes(), 1);
        assert.equal(await page.evaluate(() => JSON.parse(localStorage.getItem('museStudio.story')).tipTitle), '  Mẹo khử mùi tủ lạnh  ', 'tiêu đề được nhớ');
        assert.equal(await page.locator('#storyCreate').isDisabled(), false);
      }
      // Cây trồng phát triển: chế độ thứ 4, dùng chung quy trình với Mẹo vặt nhưng có tiêu đề/độ dài/số giây riêng (7–10 phút).
      {
        await page.locator('#modePlant').click();   // đang có cảnh của chế độ khác → hộp thoại xác nhận tự đồng ý
        assert.equal(await page.locator('#modePlant').getAttribute('aria-pressed'), 'true');
        for (const id of ['modeTip', 'modeStory', 'modeAd']) assert.equal(await page.locator('#' + id).getAttribute('aria-pressed'), 'false', id + ' không còn được chọn');
        assert.equal(await page.locator('#modePlant').textContent(), 'Growing plants');
        assert.equal(await page.locator('#storyHead').textContent(), '1. Plant guide (written by Muse, editable)');
        assert.equal(await page.locator('#tipBox').isVisible(), true);
        assert.equal(await page.locator('#tipTitleLabel').textContent(), 'What do you want to grow?');
        assert.match(await page.locator('#tipTitle').getAttribute('placeholder'), /Growing tomatoes in a pot from seed to fruit/);
        assert.match(await page.locator('#tipIntro').textContent(), /from preparing the pot and sowing seeds to fruit/);
        // Cây trồng mặc định chạy TỰ ĐỘNG (tick sẵn) và lời đọc mặc định tiếng Anh; bỏ tick để thử từng bước như Mẹo vặt.
        assert.equal(await page.locator('#tipAuto').isChecked(), true, 'cây trồng: tự động làm hết được tick sẵn');
        assert.equal(await page.locator('#tipWrite').textContent(), '▶ Run automatically: write, draw, export MP4');
        assert.equal(await page.locator('#tipLanguage').inputValue(), 'en', 'cây trồng: lời đọc mặc định tiếng Anh');
        await page.locator('#tipAuto').uncheck();
        assert.equal(await page.locator('#tipWrite').textContent(), 'Muse writes the guide and splits scenes');
        assert.equal(await page.locator('#storyCreate').textContent(), '▶ Create images + clips');
        for (const id of ['storyRefRow', 'storyRefPaste', 'storyCharacter', 'storyForm']) assert.equal(await page.locator('#' + id).isVisible(), false, id + ' ẩn trong chế độ Cây trồng');
        assert.match(await page.locator('#storyStyle').getAttribute('placeholder'), /sunny windowsill, terracotta pot/);
        assert.equal(await page.locator('#tipTitle').inputValue(), '', 'tiêu đề cây trồng lưu riêng, không lấy tiêu đề mẹo vặt');
        assert.deepEqual(await page.locator('#tipMinutes option').allTextContents(), ['7 minutes', '8 minutes', '9 minutes', '10 minutes']);
        assert.equal(await page.locator('#tipMinutes').inputValue(), '8'); assert.equal(await page.locator('#tipSecs').inputValue(), '10');
        assert.match(await page.locator('#tipCount').textContent(), /^≈ 48 scenes \(1 intro \+ 46 steps \+ 1 ending\) = 48 pictures \+ 48 clips, each scene narrated for about 10 seconds\. Creating the pictures and clips uses about 96 Muse generations\.$/);
        const before = (await called('storyAdWrite')).length;
        await page.locator('#tipWrite').click();
        assert.match(await page.locator('#toast').textContent(), /Enter the plant or title first/);
        assert.equal((await called('storyAdWrite')).length, before, 'chưa có tiêu đề thì không gọi Muse');
        await page.locator('#tipTitle').fill('Trồng cà chua trong chậu'); await page.locator('#tipMinutes').selectOption('10');
        assert.match(await page.locator('#tipCount').textContent(), /^≈ 60 scenes \(1 intro \+ 58 steps \+ 1 ending\)/);
        const analyzed = (await called('storyAnalyze')).length;
        await page.locator('#tipWrite').click();   // ô bài đang có chữ → hộp thoại xác nhận tự đồng ý
        await page.waitForFunction(n => window.calls.filter(c => c.name === 'storyAnalyze').length > n && !document.getElementById('storyAnalyze').disabled && document.querySelectorAll('#storyScenes .draftRow').length === 2, analyzed);
        const write = (await called('storyAdWrite')).at(-1).data;
        assert.deepEqual([write.tip, write.tipKind, write.tipTitle, write.tipMinutes, write.seconds, write.reference, write.tipLanguage], [true, 'plant', 'Trồng cà chua trong chậu', 10, 10, false, 'en']);
        assert.equal((await called('storyAnalyze')).at(-1).data.tipKind, 'plant', 'chia cảnh cũng biết đây là cây trồng');
        assert.deepEqual(await page.evaluate(() => { const v = JSON.parse(localStorage.getItem('museStudio.story')); return [v.mode, v.plantTipTitle, v.plantTipMinutes, v.tipTitle, v.tipMinutes, v.tipSecs]; }), ['plant', 'Trồng cà chua trong chậu', '10', '  Mẹo khử mùi tủ lạnh  ', '3', '6'], 'mỗi chế độ nhớ riêng, không ghi đè nhau');
        // Cây trồng chạy TỰ ĐỘNG: gõ tên cây (Việt hay Anh) → một nút → viết bài, chia cảnh, vào hàng đợi, tạo ảnh + clip, xong hết thì tự xuất MP4.
        // Chỉ hiện thanh % gọn; bài, danh sách cảnh và nút phân tích được ẩn.
        {
          const asked = []; const rec = d => asked.push(d.message()); page.on('dialog', rec);
          await page.locator('#tipAuto').check();
          await page.evaluate(() => { document.getElementById('storyPanel').open = true; document.getElementById('tipMore').open = true; window.writeDelay = 400; window.analyzeDelay = 400; });
          assert.equal(await page.locator('#tipWrite').textContent(), '▶ Run automatically: write, draw, export MP4');
          for (const id of ['storyScript', 'storyScenes', 'storyAnalyze', 'storyInfo', 'storyCreate', 'storyCommit']) assert.equal(await page.locator('#' + id).isVisible(), false, id + ' được ẩn khi chạy tự động');
          assert.equal(await page.locator('#autoRun').isVisible(), false, 'chưa chạy thì chưa có thanh tiến trình');
          assert.equal(await page.locator('#storyAspect').isVisible(), true, '«Tỉ lệ» nằm trong «Tùy chọn thêm»');
          assert.equal(await page.locator('#tipExtra #storyAspect').count(), 1);
          assert.equal(await page.locator('#tipExtra #storyStyle').count(), 1);
          await page.locator('#storyAspect').selectOption('9:16');
          await page.locator('#tipTitle').fill('Tomato');   // gõ tiếng Anh cũng được
          const adds0 = (await called('add')).length, starts0 = (await called('start')).length, builds0 = (await called('storyBuild')).length, writes0 = (await called('storyAdWrite')).length;
          await page.locator('#tipWrite').click();
          await page.waitForFunction(() => !document.getElementById('autoRun').hidden);
          assert.equal(await page.locator('#tipWrite').isDisabled(), true, 'đang chạy tự động thì không bấm lại');
          assert.equal(await page.locator('#tipWrite').textContent(), 'Running automatically…');
          await page.waitForFunction(n => window.calls.filter(c => c.name === 'start').length > n, starts0);
          assert.equal((await called('storyAdWrite')).length, writes0 + 1);
          assert.equal((await called('storyAdWrite')).at(-1).data.tipTitle, 'Tomato');
          assert.equal((await called('add')).length, adds0 + 1, 'thêm vào hàng đợi đúng một lần');
          assert.ok(!asked.some(m => /^Add \d+ steps/.test(m)), 'chạy tự động không hỏi xác nhận thêm vào hàng đợi: ' + asked.join(' | '));
          const addData = (await called('add')).at(-1).data, sid = addData[0].storyId;
          assert.deepEqual(addData.map(j => [j.phase, j.number]), [['image', 1], ['image', 2], ['clip', 1], ['clip', 2]]);
          assert.equal(await page.locator('#storyPanel').evaluate(d => d.open), true, 'khung vẫn mở để thấy thanh tiến trình');
          await page.waitForFunction(() => /Creating images \+ clips \(0\/4\)/.test(document.getElementById('autoLabel').textContent));
          assert.equal(await page.locator('#autoPct').textContent(), '25%');
          assert.equal(await page.locator('#autoText').evaluate(e => e.classList.contains('warn')), false);
          // Ảnh xong một nửa → thanh tiến lên (25% + 65% × 2/4).
          await page.evaluate(() => { window.s.jobs.filter(j => j.kind === 'story' && j.phase === 'image').forEach(j => { j.status = 'completed'; }); window.push(); });
          await page.waitForFunction(() => /\(2\/4\)/.test(document.getElementById('autoLabel').textContent));
          assert.equal(await page.locator('#autoPct').textContent(), '58%');
          assert.equal((await called('storyBuild')).length, builds0, 'chưa xong clip thì chưa xuất');
          // Clip xong hết → tự xuất MP4 đúng lượt, đúng tỉ lệ đã chọn, các cảnh đúng thứ tự (đồng bộ lời đọc ↔ clip).
          await page.evaluate(() => { window.s.active = false; window.s.jobs.filter(j => j.kind === 'story' && j.phase).forEach(j => { j.status = 'completed'; j.output = 'C:\\Videos\\Cay\\' + j.number + (j.phase === 'image' ? '.png' : '.mp4'); }); window.push(); });
          await page.waitForFunction(n => window.calls.filter(c => c.name === 'storyBuild').length > n, builds0);
          const prep = (await called('storyPrepare')).at(-1).data, build = (await called('storyBuild')).at(-1).data;
          assert.equal(prep.storyId, sid, 'xuất đúng lượt vừa tạo');
          assert.equal(build.aspect, '9:16', 'xuất theo tỉ lệ đã chọn lúc bấm');
          assert.deepEqual(build.scenes.map(sc => sc.id), await page.evaluate(id => window.s.jobs.filter(j => j.kind === 'story' && j.storyId === id).map(j => j.id), sid), 'cảnh gửi đi đúng thứ tự đã chuẩn bị (lời đọc ↔ clip không lệch)');
          await page.waitForFunction(() => /Done: MP4 exported/.test(document.getElementById('autoLabel').textContent));
          assert.equal(await page.locator('#autoPct').textContent(), '100%');
          assert.equal(await page.locator('#tipWrite').isDisabled(), false, 'xong thì bấm chạy tiếp được');
          // Lần chạy 2: Muse chia dở dang → tự «Phân tích tiếp», không cần bấm; rồi hàng đợi dừng giữa chừng → báo rõ, không tự xuất.
          await page.evaluate(() => { window.analyzeStop = true; });
          await page.locator('#tipTitle').fill('Cà chua bi');   // tên tiếng Việt
          const an0 = (await called('storyAnalyze')).length, adds1 = (await called('add')).length, builds1 = (await called('storyBuild')).length;
          await page.locator('#tipWrite').click();
          await page.waitForFunction(n => window.calls.filter(c => c.name === 'add').length > n, adds1);
          await page.evaluate(() => { window.analyzeStop = false; });
          const analyses = (await called('storyAnalyze')).slice(an0);
          assert.equal(analyses.length, 2, 'dừng dở thì tự phân tích tiếp đúng một lần');
          assert.equal(analyses[1].data.resume?.from, 3, 'làm tiếp từ câu Muse đã dừng');
          assert.equal(analyses[0].data.tipKind, 'plant');
          const sid2 = (await called('add')).at(-1).data[0].storyId;
          assert.notEqual(sid2, sid);
          await page.waitForFunction(() => /Creating images \+ clips/.test(document.getElementById('autoLabel').textContent));
          await page.evaluate(id => { window.s.active = false; window.s.jobs.filter(j => j.storyId === id).forEach((j, i) => { j.status = i === 0 ? 'completed' : 'failed'; if (i) j.error = 'Muse báo hết lượt hôm nay.'; }); window.push(); }, sid2);
          await page.waitForFunction(() => /The queue stopped with \d+ scene\(s\) unfinished\. Click “Continue” to run on; the MP4 is exported automatically when done\./.test(document.getElementById('autoLabel').textContent));
          assert.equal(await page.locator('#autoText').evaluate(e => e.classList.contains('warn')), true);
          assert.equal(await page.locator('#autoWhy').textContent(), 'Muse báo hết lượt hôm nay.', 'hiện lý do dừng ngay trên thanh tiến trình');
          assert.equal((await called('storyBuild')).length, builds1, 'còn clip chưa xong thì không tự xuất');
          assert.equal(await page.locator('#tipWrite').isDisabled(), false);
          page.off('dialog', rec);
          // «Chạy tiếp»: đang dừng giữa chừng thì tiếp tục đúng bước dở. KHÔNG viết lại bài, KHÔNG chia lại cảnh, KHÔNG thêm trùng việc vào hàng đợi.
          await page.waitForFunction(() => /^▶ Continue making images \+ clips \(3 scene\(s\) left\)$/.test(document.getElementById('tipWrite').textContent));
          assert.equal(await page.locator('#autoRestart').isVisible(), true, 'có nút làm lại từ đầu riêng');
          assert.equal(await page.locator('#autoRestart').textContent(), 'Start over');
          const jobs0 = await page.evaluate(() => window.s.jobs.length), w0 = (await called('storyAdWrite')).length, a0 = (await called('storyAnalyze')).length, ad0 = (await called('add')).length, st0 = (await called('start')).length, b0 = (await called('storyBuild')).length;
          await page.locator('#tipWrite').click();
          await page.waitForFunction(n => window.calls.filter(c => c.name === 'start').length > n, st0);
          assert.equal((await called('storyAdWrite')).length, w0, 'không viết lại bài');
          assert.equal((await called('storyAnalyze')).length, a0, 'không chia lại cảnh');
          assert.equal((await called('add')).length, ad0, 'không thêm trùng việc vào hàng đợi');
          assert.deepEqual((await called('start')).at(-1).data, { kind: 'story' }, 'chỉ chạy lại hàng đợi kể chuyện');
          await page.waitForFunction(() => /Creating images \+ clips/.test(document.getElementById('autoLabel').textContent));
          assert.equal(await page.locator('#autoWhy').isVisible(), false, 'chạy lại thì xóa dòng lý do cũ');
          assert.equal(await page.locator('#tipWrite').isDisabled(), true);
          assert.equal(await page.evaluate(() => window.s.jobs.length), jobs0, 'số việc trong hàng đợi không đổi');
          await page.evaluate(id => { window.s.active = false; window.s.jobs.filter(j => j.storyId === id).forEach(j => { j.status = 'completed'; j.output = 'C:\\Videos\\Cay\\' + j.number + (j.phase === 'image' ? '.png' : '.mp4'); }); window.push(); }, sid2);
          await page.waitForFunction(n => window.calls.filter(c => c.name === 'storyBuild').length > n, b0);
          assert.equal((await called('storyPrepare')).at(-1).data.storyId, sid2, 'xuất đúng lượt đã chạy tiếp');
          assert.equal((await called('storyBuild')).at(-1).data.aspect, '9:16');
          await page.waitForFunction(() => /Done: MP4 exported/.test(document.getElementById('autoLabel').textContent));
          assert.equal(await page.locator('#tipWrite').textContent(), '▶ Run automatically: write, draw, export MP4', 'xong rồi thì nút về lại «làm tự động» cho cây mới');
          assert.equal(await page.locator('#autoRestart').isVisible(), false);
          // Chia cảnh lỗi ngay từ đầu: bài đã viết được giữ lại, «Chạy tiếp» chỉ chia cảnh (không viết lại), rồi thêm vào hàng đợi đúng một lần.
          await page.evaluate(() => { window.analyzeFail = true; });
          await page.locator('#tipTitle').fill('Cà chua cherry');
          const w1 = (await called('storyAdWrite')).length, a1 = (await called('storyAnalyze')).length, ad1 = (await called('add')).length, st1 = (await called('start')).length;
          await page.locator('#tipWrite').click();
          await page.waitForFunction(() => /Stopped at the scene-splitting step\./.test(document.getElementById('autoLabel').textContent));
          assert.equal(await page.locator('#autoWhy').textContent(), 'Muse không trả lời, thử lại sau.', 'hiện đúng lý do Muse báo');
          assert.equal((await called('storyAdWrite')).length, w1 + 1);
          assert.equal((await called('add')).length, ad1, 'chưa chia được thì chưa thêm gì vào hàng đợi');
          assert.equal(await page.locator('#tipWrite').textContent(), '▶ Continue: split scenes');
          assert.equal(await page.locator('#autoRestart').isVisible(), true);
          await page.evaluate(() => { window.analyzeFail = false; });
          await page.locator('#tipWrite').click();
          await page.waitForFunction(n => window.calls.filter(c => c.name === 'start').length > n, st1);
          assert.equal((await called('storyAdWrite')).length, w1 + 1, 'chia lại cảnh nhưng không viết lại bài');
          assert.equal((await called('storyAnalyze')).length, a1 + 2, 'một lần lỗi + một lần chia lại');
          assert.equal((await called('add')).length, ad1 + 1, 'thêm vào hàng đợi đúng một lần');
          const sid3 = (await called('add')).at(-1).data[0].storyId;
          // Lỗi thêm vào hàng đợi / dừng giữa chừng rồi bấm «Chạy tiếp» lần nữa: vẫn không thêm trùng.
          await page.waitForFunction(() => /Creating images \+ clips/.test(document.getElementById('autoLabel').textContent));
          await page.evaluate(id => { window.s.active = false; window.s.jobs.filter(j => j.storyId === id).forEach(j => { j.status = 'interrupted'; }); window.push(); }, sid3);
          await page.waitForFunction(() => /^▶ Continue making images \+ clips \(2 scene\(s\) left\)$/.test(document.getElementById('tipWrite').textContent));
          const st2 = (await called('start')).length;
          await page.locator('#tipWrite').click();
          await page.waitForFunction(n => window.calls.filter(c => c.name === 'start').length > n, st2);
          assert.equal((await called('add')).length, ad1 + 1, 'bấm «Chạy tiếp» nhiều lần cũng không thêm trùng');
          // «Làm lại từ đầu» mới viết bài mới và thêm lượt mới (có hỏi lại vì tốn thêm lượt Muse).
          await page.evaluate(id => { window.s.active = false; window.s.jobs.filter(j => j.storyId === id).forEach(j => { j.status = 'interrupted'; }); window.push(); }, sid3);
          await page.waitForFunction(() => /^▶ Continue making/.test(document.getElementById('tipWrite').textContent) && !document.getElementById('autoRestart').hidden);
          const asked2 = []; const rec2 = d => asked2.push(d.message()); page.on('dialog', rec2);
          const w2 = (await called('storyAdWrite')).length;
          await page.locator('#autoRestart').click();
          await page.waitForFunction(n => window.calls.filter(c => c.name === 'storyAdWrite').length > n, w2);
          assert.ok(asked2.some(m => /^Starting over writes a new guide/.test(m)), 'hỏi lại trước khi làm lại từ đầu: ' + asked2.join(' | '));
          await page.waitForFunction(n => window.calls.filter(c => c.name === 'add').length > n, ad1 + 1);
          const sid4 = (await called('add')).at(-1).data[0].storyId;
          assert.notEqual(sid4, sid3, 'lượt mới có mã riêng');
          page.off('dialog', rec2);
          // Cho lượt mới chạy hết (xuất MP4) để không dây sang các phần test sau.
          await page.waitForFunction(() => /Creating images \+ clips/.test(document.getElementById('autoLabel').textContent));
          await page.evaluate(id => { window.s.active = false; window.s.jobs.filter(j => j.storyId === id).forEach(j => { j.status = 'completed'; j.output = 'C:\\Videos\\Cay\\' + j.number + (j.phase === 'image' ? '.png' : '.mp4'); }); window.push(); }, sid4);
          await page.waitForFunction(() => /Done: MP4 exported/.test(document.getElementById('autoLabel').textContent));
        }
        // Quay lại Mẹo vặt: tiêu đề, độ dài, số giây của Mẹo vặt vẫn còn nguyên.
        await page.locator('#modeTip').click();
        assert.equal(await page.locator('#tipTitleLabel').textContent(), 'What tip do you want to show?');
        assert.equal(await page.locator('#tipTitle').inputValue(), '  Mẹo khử mùi tủ lạnh  ');
        assert.deepEqual(await page.locator('#tipMinutes option').allTextContents(), ['1 minute', '2 minutes', '3 minutes', '5 minutes', '10 minutes']);
        assert.equal(await page.locator('#tipMinutes').inputValue(), '3'); assert.equal(await page.locator('#tipSecs').inputValue(), '6');
        assert.equal(await page.locator('#modePlant').getAttribute('aria-pressed'), 'false');
        assert.equal((await called('storyAdWrite')).at(-1).data.tipKind, 'plant');
        // Lịch sử minh họa: cùng quy trình ảnh → clip, ảnh là tranh hoạt hình phẳng, giữ nhân vật dẫn chuyện (mô tả + ảnh), riêng tiêu đề/độ dài.
        await page.locator('#modeHist').click();
        for (const id of ['modeTip', 'modeStory', 'modeAd', 'modePlant']) assert.equal(await page.locator('#' + id).getAttribute('aria-pressed'), 'false', id + ' không còn được chọn');
        assert.equal(await page.locator('#modeHist').getAttribute('aria-pressed'), 'true');
        assert.equal(await page.locator('#modeHist').textContent(), 'Illustrated history');
        assert.equal(await page.locator('#storyHead').textContent(), '1. History text (written by Muse, editable)');
        assert.equal(await page.locator('#tipBox').isVisible(), true);
        assert.equal(await page.locator('#tipTitleLabel').textContent(), 'Which history topic do you want to tell?');
        assert.match(await page.locator('#tipTitle').getAttribute('placeholder'), /The history of Vietnam/);
        assert.equal(await page.locator('#tipWrite').textContent(), 'Muse writes the history text and splits scenes');
        assert.equal(await page.locator('#storyCreate').textContent(), '▶ Create images + clips');
        assert.equal(await page.locator('#storyCharacter').isVisible(), true, 'nhân vật dẫn chuyện hiện ở Lịch sử');
        assert.equal(await page.locator('#storyCharLabel').textContent(), 'Guide character (optional)');
        assert.equal(await page.locator('#storyRefRow').isVisible(), true, 'ảnh nhân vật dẫn chuyện (không bắt buộc)');
        assert.equal(await page.locator('#storyForm').isVisible(), false);
        assert.match(await page.locator('#storyStyle').getAttribute('placeholder'), /Flat cartoon illustration by default/);
        assert.equal(await page.locator('#tipMore summary').textContent(), 'More options'); assert.equal(await page.locator('#subMore summary').textContent(), 'Subtitle style (font, size, color, position)');
        assert.equal(await page.locator('#tipMotionLabel').evaluate(l => l.hidden), true, 'lịch sử luôn chuyển động nhẹ, prompt tiếng Anh');
        assert.deepEqual(await page.locator('#tipMinutes option').allTextContents(), ['1 minute', '2 minutes', '3 minutes', '5 minutes', '10 minutes', '15 minutes', '20 minutes', '30 minutes', '45 minutes', '60 minutes', '90 minutes', '120 minutes', '180 minutes']);
        // «Kiểu hình» chỉ có ở Lịch sử: hoạt hình phẳng (mặc định) hoặc ảnh phim tư liệu chân thực màu phục chế; đổi kiểu thì ô phong cách và lời giới thiệu đổi theo.
        assert.equal(await page.locator('#tipLookLabel').isVisible(), true, 'Kiểu hình hiện ở Lịch sử');
        assert.deepEqual(await page.locator('#tipLook option').allTextContents(), ['Flat cartoon illustration', 'Realistic archival-film look (restored colour)']);
        assert.equal(await page.locator('#tipLook').inputValue(), 'cartoon', 'mặc định hoạt hình');
        assert.match(await page.locator('#tipIntro').textContent(), /gets a cartoon illustration/);
        await page.locator('#tipLook').selectOption('film');
        assert.match(await page.locator('#storyStyle').getAttribute('placeholder'), /^Realistic archival-film look with restored colour by default/);
        assert.match(await page.locator('#tipIntro').textContent(), /realistic archival-film picture \(restored colour\)/);
        assert.equal(await page.evaluate(() => JSON.parse(localStorage.getItem('museStudio.story')).histTipLook), 'film', 'kiểu hình được nhớ riêng cho Lịch sử');
        // Lịch sử cho kênh dài: chọn 180 phút (3 giờ) → 1350 cảnh, số lượt Muse hiện đúng; chọn lại 3 phút để các bước sau không đổi.
        await page.locator('#tipMinutes').selectOption('180');
        assert.match(await page.locator('#tipCount').textContent(), /^≈ 1350 scenes \(1 intro \+ 1348 parts \+ 1 ending\) = 1350 pictures \+ 1350 clips, each scene narrated for about 8 seconds\. Creating the pictures and clips uses about 2700 Muse generations\.$/);
        assert.equal(await page.evaluate(() => JSON.parse(localStorage.getItem('museStudio.story')).histTipMinutes), '180');
        await page.locator('#tipMinutes').selectOption('3');
        assert.equal(await page.locator('#tipMinutes').inputValue(), '3'); assert.equal(await page.locator('#tipSecs').inputValue(), '8');
        assert.equal(await page.locator('#tipTitle').inputValue(), '', 'tiêu đề lịch sử lưu riêng');
        assert.match(await page.locator('#tipCount').textContent(), /^≈ 23 scenes \(1 intro \+ 21 parts \+ 1 ending\) = 23 pictures \+ 23 clips, each scene narrated for about 8 seconds\. Creating the pictures and clips uses about 46 Muse generations\.$/);
        assert.match(await page.locator('#storyInfo').textContent(), /Enter a history topic/);
        const histBefore = (await called('storyAdWrite')).length;
        await page.locator('#tipWrite').click();
        assert.match(await page.locator('#toast').textContent(), /Enter the history topic first/);
        assert.equal((await called('storyAdWrite')).length, histBefore);
        await page.locator('#tipTitle').fill('Lịch sử Việt Nam'); await page.locator('#storyCharacter').fill('Cô gái tóc đen búi, áo dài cam');
        const histAnalyzed = (await called('storyAnalyze')).length;
        await page.locator('#tipWrite').click();
        await page.waitForFunction(n => window.calls.filter(c => c.name === 'storyAnalyze').length > n && !document.getElementById('storyAnalyze').disabled && document.querySelectorAll('#storyScenes .draftRow').length === 2, histAnalyzed);
        const histWrite = (await called('storyAdWrite')).at(-1).data;
        assert.deepEqual([histWrite.tip, histWrite.tipKind, histWrite.tipTitle, histWrite.tipMinutes, histWrite.seconds, histWrite.character, histWrite.reference], [true, 'history', 'Lịch sử Việt Nam', 3, 8, 'Cô gái tóc đen búi, áo dài cam', false]);
        assert.equal((await called('storyAnalyze')).at(-1).data.tipKind, 'history');
        assert.equal(histWrite.histLook, 'film', 'kiểu hình gửi cho Muse khi viết bài');
        assert.equal((await called('storyAnalyze')).at(-1).data.histLook, 'film', 'và khi chia cảnh');
        assert.equal((await called('storyAnalyze')).at(-1).data.character, 'Cô gái tóc đen búi, áo dài cam');
        assert.deepEqual(await page.evaluate(() => { const v = JSON.parse(localStorage.getItem('museStudio.story')); return [v.mode, v.histTipTitle, v.plantTipTitle]; }), ['hist', 'Lịch sử Việt Nam', 'Cà chua cherry']);
        // Ảnh nhân vật dẫn chuyện gắn vào các việc ẢNH (không gắn vào clip: clip làm từ chính ảnh đó).
        await page.locator('#storyRefs').click();
        await page.waitForFunction(() => /mai\.png/.test(document.getElementById('storyRefInfo').textContent));
        const histAdds = (await called('add')).length;
        await page.locator('#storyCommit').click();
        await page.waitForFunction(n => window.calls.filter(c => c.name === 'add').length > n, histAdds);
        const histAdd = (await called('add')).at(-1).data;
        assert.deepEqual(histAdd.map(j => [j.phase, j.number, j.dependsOn || '']), [['image', 1, ''], ['image', 2, ''], ['clip', 1, 'image'], ['clip', 2, 'image']]);
        assert.ok(histAdd.slice(0, 2).every(j => j.image === 'C:\\Refs\\mai.png' && j.references.length === 1 && j.references[0] === 'C:\\Refs\\mai.png'), 'việc ảnh mang ảnh nhân vật dẫn chuyện');
        assert.ok(histAdd.slice(2).every(j => !j.references?.length), 'clip không gắn ảnh nhân vật (ảnh do hàng đợi gắn)');
        // Bài lịch sử dài (hơn 200 cảnh): câu hỏi xác nhận nói rõ Muse có thể chạy nhiều giờ đến nhiều ngày; bài ngắn thì không có câu này.
        {
          const asked = []; const rec = d => asked.push(d.message()); page.on('dialog', rec);
          await page.evaluate(() => { window.sceneCount = 210; document.getElementById('storyPanel').open = true; });   // sau «Thêm vào hàng đợi» mục này tự thu lại
          const before = (await called('storyAnalyze')).length;
          await page.locator('#tipWrite').click();
          await page.waitForFunction(n => window.calls.filter(c => c.name === 'storyAnalyze').length > n && !document.getElementById('storyAnalyze').disabled && document.querySelectorAll('#storyScenes .draftRow').length === 210, before);
          await page.evaluate(() => { document.getElementById('storyPanel').open = true; });
          const adds = (await called('add')).length;
          await page.locator('#storyCreate').click();   // «Tạo ảnh + clip» (chạy ngay) mới hỏi xác nhận
          await page.waitForFunction(n => window.calls.filter(c => c.name === 'add').length > n, adds);
          page.off('dialog', rec);
          const question = asked.find(m => /^Add 210 scenes/.test(m));
          assert.ok(question, 'có hỏi xác nhận: ' + asked.join(' | '));
          assert.match(question, /^Add 210 scenes \(210 images \+ 210 clips\) and run now\? Each scene uses 2 Muse generations \(1 image, 1 clip\), so this may use a lot of Muse credits\. This is a long video, so Muse may run for many hours or even days; you can press Stop and continue later\. All images are created first/);
          assert.equal((await called('add')).at(-1).data.length, 420, '210 ảnh + 210 clip vào hàng đợi');
          await page.evaluate(() => { window.sceneCount = 0; });
        }
        await page.evaluate(() => { document.getElementById('storyPanel').open = true; });
        // Về Mẹo vặt: nhân vật, ảnh và tiêu đề của Lịch sử không mang sang.
        await page.locator('#modeTip').click();
        assert.equal(await page.locator('#tipLookLabel').isVisible(), false, 'Kiểu hình chỉ có ở Lịch sử');
        assert.equal(await page.locator('#storyCharacter').isVisible(), false);
        assert.equal(await page.locator('#tipTitle').inputValue(), '  Mẹo khử mùi tủ lạnh  ');
        assert.equal(await page.locator('#modeHist').getAttribute('aria-pressed'), 'false');
        // Viết lại mẹo vặt để có cảnh cho bước kiểm tra chế độ tiếp theo.
        const again = (await called('storyAnalyze')).length;
        await page.locator('#tipWrite').click();
        await page.waitForFunction(n => window.calls.filter(c => c.name === 'storyAnalyze').length > n && !document.getElementById('storyAnalyze').disabled && document.querySelectorAll('#storyScenes .draftRow').length === 2, again);
        assert.equal((await called('storyAdWrite')).at(-1).data.tipKind, 'tip');
        assert.equal((await called('storyAdWrite')).at(-1).data.histLook, undefined, 'mẹo vặt không gửi kiểu hình');
      }
      // Các tab độc lập: chữ, cảnh, tỉ lệ/nhân vật/phong cách riêng từng tab; Muse chạy ở tab nào thì chỉ tab đó thấy tiến độ và nút Dừng.
      {
        const dialogs = []; page.on('dialog', d => dialogs.push(d.message()));
        const rows = () => page.locator('#storyScenes .draftRow').count();
        // Đang ở Mẹo vặt (có 2 cảnh vừa viết). Đặt phong cách riêng cho Mẹo vặt rồi sang Kể chuyện.
        await page.locator('#storyStyle').fill('ảnh chụp thật bếp trắng');
        const tipScript = await page.locator('#storyScript').inputValue();
        assert.ok(tipScript.length > 20 && await rows() === 2);
        await page.locator('#modeStory').click();
        assert.deepEqual(dialogs, [], 'đổi tab không còn hỏi xóa cảnh');
        assert.notEqual(await page.locator('#storyScript').inputValue(), tipScript, 'chữ của Mẹo vặt không sang Kể chuyện');
        assert.notEqual(await page.locator('#storyStyle').inputValue(), 'ảnh chụp thật bếp trắng', 'phong cách của Mẹo vặt không sang Kể chuyện');
        // Kể chuyện: viết kịch bản riêng rồi sang Quảng cáo và quay lại: vẫn nguyên.
        await page.locator('#storyScript').fill('Truyện của riêng tab Kể chuyện.'); await page.locator('#storyStyle').fill('hoạt hình màu nước');
        await page.locator('#modeAd').click();
        assert.equal(await page.locator('#storyScript').inputValue(), '', 'Quảng cáo chưa có lời nào');
        assert.equal(await page.locator('#storyStyle').inputValue(), '');
        assert.equal(await rows(), 0);
        await page.locator('#modeStory').click();
        const storyRows = await rows();   // Kể chuyện giữ các cảnh của chính nó từ phần thử trước
        assert.equal(await page.locator('#storyScript').inputValue(), 'Truyện của riêng tab Kể chuyện.');
        assert.equal(await page.locator('#storyStyle').inputValue(), 'hoạt hình màu nước');
        await page.locator('#modeTip').click();
        assert.equal(await page.locator('#storyScript').inputValue(), tipScript, 'Mẹo vặt giữ nguyên bài và cảnh');
        assert.equal(await page.locator('#storyStyle').inputValue(), 'ảnh chụp thật bếp trắng');
        assert.equal(await rows(), 2, 'cảnh của Mẹo vặt còn nguyên sau khi đi một vòng các tab');
        assert.deepEqual(dialogs, []);
        // Muse đang chạy ở Mẹo vặt: tab khác không thấy tiến độ hay nút Dừng, chỉ báo bận; kết quả về đúng tab Mẹo vặt.
        await page.evaluate(() => { window.writeDelay = 900; window.analyzeDelay = 900; });
        await page.locator('#tipTitle').fill('Mẹo khử mùi tủ lạnh khác'); await page.locator('#tipWrite').click();
        await page.waitForFunction(() => document.getElementById('tipWrite').disabled && !document.getElementById('storyAnalyzeStop').hidden);
        assert.match(await page.locator('#storyInfo').textContent(), /Muse is writing/);
        await page.locator('#modeStory').click();
        assert.equal(await page.locator('#storyAnalyzeStop').isHidden(), true, 'tab khác không có nút Dừng của việc đang chạy ở Mẹo vặt');
        assert.match(await page.locator('#storyInfo').textContent(), /^Muse is busy in the “Tips” tab\. Wait for it to finish, then use this tab\.$/);
        assert.equal(await page.locator('#storyAnalyze').textContent(), 'Analyze with Muse', 'nút Kể chuyện không giả vờ đang chạy');
        assert.equal(await page.locator('#storyAnalyze').isDisabled(), true, 'Muse bận nên chưa bấm được');
        await page.locator('#modeAd').click();
        assert.equal(await page.locator('#storyAnalyzeStop').isHidden(), true);
        assert.match(await page.locator('#storyInfo').textContent(), /Muse is busy in the “Tips” tab/);
        assert.equal(await page.locator('#adQuick').isDisabled(), false, 'quảng cáo nhanh không cần Muse nên vẫn dùng được');
        await page.locator('#modeTip').click();
        assert.equal(await page.locator('#storyAnalyzeStop').isHidden(), false, 'về tab đang chạy thì thấy nút Dừng');
        await page.waitForFunction(() => !document.getElementById('tipWrite').disabled && document.querySelectorAll('#storyScenes .draftRow').length === 2, null, { timeout: 20000 });
        // Chạy ở Mẹo vặt rồi chuyển sang Kể chuyện NGAY khi đang chạy: kết quả không rơi vào Kể chuyện.
        await page.locator('#tipTitle').fill('Mẹo cuối cùng'); await page.locator('#tipWrite').click();
        await page.waitForFunction(() => document.getElementById('tipWrite').disabled);
        await page.locator('#modeStory').click();
        await page.waitForFunction(() => !/busy/.test(document.getElementById('storyInfo').textContent), null, { timeout: 20000 });
        assert.equal(await page.locator('#storyScript').inputValue(), 'Truyện của riêng tab Kể chuyện.', 'bài mẹo mới không chui vào ô Kể chuyện');
        assert.equal(await rows(), storyRows, 'cảnh mới không chui vào Kể chuyện');
        assert.match(await page.locator('#toast').textContent(), /Muse finished in the “Tips” tab/);
        await page.locator('#modeTip').click();
        assert.equal(await rows(), 2, 'cảnh về đúng tab Mẹo vặt');
        assert.deepEqual(dialogs.filter(d => !/Viết mới|Writing a new/.test(d)), []);
      }
      // Đổi lại chế độ Kể chuyện: hỏi trước vì sẽ xóa cảnh, rồi ô ảnh biến mất.
      await page.locator('#modeStory').click();
      assert.equal(await page.locator('#storyRefRow').isVisible(), true);
      assert.equal(await page.locator('#storyCreate').textContent(), '▶ Create clips');
      assert.equal(await page.locator('#tipBox').isVisible(), false, 'ô tiêu đề ẩn ngoài chế độ Mẹo vặt');
    }
    assert.deepEqual(errors, []);
    console.log('PASS: story tab — own jobs/counts/folder, Muse analysis + pasted Muse reply parsing (no-speech rule kept), no quick split, character image on every scene, free voice setup/listen/clone with consent, subtitles on/off + .srt + PNG captions, auto-edit report, export errors, persistence, English labels.');
  } finally { await browser.close(); server.close(); }
})().catch(e => { console.error(e); process.exitCode = 1; });
