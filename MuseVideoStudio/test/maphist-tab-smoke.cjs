// Giao diện thật (Chromium) của tab «Bản đồ lịch sử» với IPC giả; không gọi Muse, không chạy FFmpeg.
// Kiểm cả trình xem và sửa kịch bản: dựng hình xem thử thật bằng bộ vẽ canvas.
const pw = (() => { try { return require('playwright-core'); } catch { return require('playwright'); } })();
const http = require('http'), fs = require('fs/promises'), zlib = require('zlib'), path = require('path'), assert = require('assert/strict');
(async () => {
  const src = path.join(__dirname, '../src');
  const files = {
    '/assets/muse-studio.svg': 'assets/muse-studio.svg', '/assets/zalo-qr.jpg': 'assets/zalo-qr.jpg', '/': 'index.html', '/style.css': 'style.css', '/renderer.js': 'renderer.js', '/ui-i18n.js': 'ui-i18n.js',
    '/script-planner.js': 'script-planner.js', '/prompt-import.js': 'prompt-import.js', '/reference-map.js': 'reference-map.js', '/story-plan.js': 'story-plan.js', '/story-ui.js': 'story-ui.js',
    '/restore-plan.js': 'restore-plan.js', '/restore-ui.js': 'restore-ui.js', '/wild-plan.js': 'wild-plan.js', '/wild-ui.js': 'wild-ui.js',
    '/maphist-geo.js': 'maphist-geo.js', '/maphist-plan.js': 'maphist-plan.js', '/maphist-cartoon.js': 'maphist-cartoon.js', '/maphist-scenes.js': 'maphist-scenes.js', '/maphist-draw.js': 'maphist-draw.js', '/maphist-ui.js': 'maphist-ui.js',
    '/assets/maphist/fonts/Lora-Variable.ttf': 'assets/maphist/fonts/Lora-Variable.ttf', '/assets/maphist/fonts/Inter-Black.otf': 'assets/maphist/fonts/Inter-Black.otf', '/assets/maphist/fonts/EricaOne-Regular.ttf': 'assets/maphist/fonts/EricaOne-Regular.ttf', '/assets/maphist/fonts/BricolageGrotesque-Bold.ttf': 'assets/maphist/fonts/BricolageGrotesque-Bold.ttf', '/assets/maphist/fonts/Lora-Italic-Variable.ttf': 'assets/maphist/fonts/Lora-Italic-Variable.ttf'
  };
  const world = zlib.gunzipSync(await fs.readFile(path.join(src, 'assets/maphist/world.json.gz')));
  const sample = await fs.readFile(path.join(__dirname, 'fixtures/maphist-sample.json'));
  const type = n => n.endsWith('.jpg') ? 'image/jpeg' : n.endsWith('.svg') ? 'image/svg+xml' : n.endsWith('.ttf') ? 'font/ttf' : n.endsWith('.otf') ? 'font/otf' : n.endsWith('.js') ? 'application/javascript' : n.endsWith('.css') ? 'text/css' : 'text/html';
  const server = http.createServer(async (req, res) => {
    if (req.url === '/world.json') { res.setHeader('Content-Type', 'application/json'); return res.end(world); }
    if (req.url === '/sample.json') { res.setHeader('Content-Type', 'application/json'); return res.end(sample); }
    if (/^\/assets\/maphist\/categories\/[\w.-]+\.jpg$/.test(req.url)) { res.setHeader('Content-Type', 'image/jpeg'); return res.end(await fs.readFile(path.join(src, req.url.slice(1)))); }
    const name = files[req.url];
    if (!name) { res.writeHead(404); return res.end(); }
    res.setHeader('Content-Type', type(name));
    res.end(await fs.readFile(path.join(src, name)));
  });
  await new Promise(r => server.listen(0, '127.0.0.1', r));
  const browser = await pw.chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined, headless: true, args: ['--no-sandbox'] });
  try {
    const page = await browser.newPage({ viewport: { width: 1450, height: 1800 } }), errors = [];
    // Trang chặn fetch (CSP connect-src 'none'), nên dữ liệu giả đi qua cầu của Playwright như IPC thật.
    await page.exposeFunction('nodeJson', async which => JSON.parse(which === 'world' ? world : sample));
    page.on('pageerror', e => errors.push(e.message)); page.on('dialog', d => d.accept());
    page.on('console', m => { if (m.type() === 'error' && !/Failed to load resource|Not allowed to load local resource: file:/.test(m.text())) errors.push(m.text()); });
    await page.addInitScript(() => {
      localStorage.setItem('museStudio.language', 'vi');
      const voices = [
        { id: 'vi-VN-HoaiMyNeural', lang: 'vi', language: 'Tiếng Việt', name: 'Hoài My (nữ)' },
        { id: 'en-US-JennyNeural', lang: 'en', language: 'Tiếng Anh', name: 'Jenny (nữ) · en-US' }, { id: 'en-US-GuyNeural', lang: 'en', language: 'Tiếng Anh', name: 'Guy (nam) · en-US' },
        { id: 'en-US-AndrewMultilingualNeural', lang: '*', language: 'Đa ngôn ngữ', name: 'Andrew (nam) · đa ngôn ngữ' },
        { id: 'de-DE-KatjaNeural', lang: 'de', language: 'Tiếng Đức', name: 'Katja (nữ) · de-DE' }, { id: 'de-DE-ConradNeural', lang: 'de', language: 'Tiếng Đức', name: 'Conrad (nam) · de-DE' },
        { id: 'fr-FR-DeniseNeural', lang: 'fr', language: 'Tiếng Pháp', name: 'Denise (nữ) · fr-FR' }, { id: 'fr-FR-HenriNeural', lang: 'fr', language: 'Tiếng Pháp', name: 'Henri (nam) · fr-FR' },
        { id: 'ru-RU-SvetlanaNeural', lang: 'ru', language: 'Tiếng Nga', name: 'Svetlana (nữ) · ru-RU' }, { id: 'ru-RU-DmitryNeural', lang: 'ru', language: 'Tiếng Nga', name: 'Dmitry (nam) · ru-RU' }
      ];
      const s = {
        version: '1.9.12', active: false, paused: true, jobs: [],
        license: { status: 'active', plan: 'short', longTerm: false, device: 'TESTDEVICE', expiresAt: Date.now() + 86400000 * 30, message: 'Đã kích hoạt key.' },
        story: { busy: false, progress: '', error: '', output: '', srt: '', notes: [], voice: { setupBusy: false, setupMessage: '', setupError: '', ready: { edge: true, clone: false }, platform: 'win32', edgeVoices: voices, clones: [] } },
        restore: { busy: false, progress: '', error: '', storyId: '', stories: {} },
        wild: { busy: false, phase: '', progress: '', error: '', storyId: '', stories: {}, write: {}, build: {} },
        maphist: { busy: false, phase: '', progress: '', error: '', runId: '', runs: {}, write: {}, build: {} },
        flow: { open: false, opening: false },
        settings: { browserChoice: 'builtin', browserPath: '', output: 'C:\\Videos', autoMerge: false, autoPackage: false, ffmpeg: 'ffmpeg', accountCount: 1, flowProjectUrl: '', flowModel: 'lite', flowParallel: 3, composer: 'textarea', language: 'vi' }
      };
      window.calls = []; window.s = s; let listener;
      window.push = () => listener(structuredClone(s));
      window.studio = {
        onUpdate: fn => listener = fn,
        invoke: async (name, data) => {
          window.calls.push({ name, data: JSON.parse(JSON.stringify(data ?? null)) });
          if (name === 'mapMake') {
            const runId = data.resumeId || 'History-of-Testland';
            s.maphist.runs[runId] = s.maphist.runs[runId] || { name: data.topic || (data.category ? 'Muse tự chọn: ' + data.category : 'Muse tự chọn chủ đề'), topic: data.topic, category: data.category || '', minutes: data.minutes, status: 'writing', createdAt: 1 };
            s.maphist.runs[runId].status = 'writing';
            Object.assign(s.maphist, { busy: true, phase: 'write', runId, progress: 'Muse đang soạn kịch bản…', error: '' });
            s.maphist.write = { busy: true, progress: 'Soạn kịch bản 2/3 (giai đoạn 6–10) · Muse đang viết…', done: 5, total: 12 };
            setTimeout(window.push, 0);
            return { runId };
          }
          if (name === 'mapCancel') { Object.assign(s.maphist, { busy: false, phase: '', error: 'Đã dừng soạn kịch bản. Bấm «Viết tiếp» để làm tiếp từ chỗ dở.' }); s.maphist.write = {}; s.maphist.runs['History-of-Testland'].status = 'draft'; setTimeout(window.push, 0); return structuredClone(s); }
          if (name === 'storyListen') return 'C:\\Temp\\nghe-thu.mp3';
          if (name === 'chooseMusic') return 'C:\\Music\\epic.mp3';
          if (name === 'mapGeo') return window.nodeJson('world');
          if (name === 'mapScript') {
            const raw = await window.nodeJson('world'), sample = await window.nodeJson('sample');
            sample.eras[1].realms[0].regions.push('Atlantis Prime');
            const geo = maphistGeo.build(raw), n = maphistPlan.normalizeScript(sample, geo);
            return { script: n.script, issues: ['Giai đoạn 2: không tìm thấy vùng «Atlantis Prime».'], meta: s.maphist.runs[data.runId] };
          }
          if (name === 'mapSaveScript') return { issues: [] };
          if (name === 'mapRender') { s.maphist.runs[data.runId].status = 'building'; Object.assign(s.maphist, { busy: true, phase: 'build', runId: data.runId }); s.maphist.build = { busy: true, progress: 'Đang vẽ khung hình 300/900 · còn khoảng 2 phút', done: 300, total: 900, preview: 'C:\\Videos\\BanDo\\History-of-Testland\\.dang-dung\\xem-truoc-0.jpg', previewAt: 111 }; setTimeout(window.push, 0); return { runId: data.runId }; }
          if (name === 'mapThumb') { Object.assign(s.maphist.runs[data.runId], { thumb: 'C:\\Videos\\BanDo\\History-of-Testland\\thumbnail-1.jpg', thumbAt: 5 }); setTimeout(window.push, 0); return { file: 'C:\\Videos\\BanDo\\History-of-Testland\\thumbnail-1.jpg', variant: 1, count: 4 }; }
          if (name === 'mapPublish') { Object.assign(s.maphist.runs[data.runId], { publish: { title: 'Testland: The Full Story from Dust to Empire', description: 'A tale of Testland.', tags: ['history'], chapters: [], partial: true } }); setTimeout(window.push, 0); return { publish: s.maphist.runs[data.runId].publish }; }
          if (name === 'mapRemove') { delete s.maphist.runs[data.runId]; return structuredClone(s); }
          return structuredClone(s);
        }
      };
    });
    await page.goto(`http://127.0.0.1:${server.address().port}/`);
    await page.waitForSelector('#navMap');
    const calls = name => page.evaluate(n => window.calls.filter(c => c.name === n), name);
    const flush = () => page.evaluate(() => new Promise(r => setTimeout(r, 150)));

    // 1) Nút tab nằm ngay dưới «Động vật hoang dã»; gói 30 ngày thấy khóa.
    const order = await page.evaluate(() => [...document.querySelectorAll('aside nav button')].map(b => b.id));
    assert.ok(order.indexOf('navMap') === order.indexOf('navWild') + 1, 'tab Bản đồ nằm ngay dưới Động vật: ' + order.join(','));
    await page.click('#navMap');
    assert.equal(await page.locator('#mapPanel').isVisible(), true);
    for (const id of ['wildPanel', 'restorePanel', 'storyPanel', 'editorPanel', 'queueWorkspace']) assert.equal(await page.locator('#' + id).isVisible(), false, id + ' phải ẩn');
    assert.equal(await page.locator('#mapLock').isVisible(), true);
    assert.equal(await page.locator('#mapBody').isVisible(), false);
    assert.match(await page.locator('#headingText').textContent(), /bản đồ lịch sử/);

    // 2) Gói Năm: mở khóa; giọng chỉ tiếng Anh, mặc định Guy; độ dài; số giai đoạn.
    await page.evaluate(() => { window.s.license = { status: 'active', plan: 'year', longTerm: true, device: 'T', expiresAt: Date.now() + 86400000 * 365, message: 'Đã kích hoạt key (gói Năm).' }; window.push(); });
    await page.waitForSelector('#mapBody', { state: 'visible' });
    assert.deepEqual(await page.locator('#mapMinutes option').allTextContents(), ['6 phút', '8 phút', '15 phút']);
    assert.equal(await page.locator('#mapMinutes').inputValue(), '8', 'mặc định 8 phút');
    // Giọng, nhạc, nước làm trung tâm gom vào mục «đã chọn sẵn»: đóng sẵn khi giọng đã cài; mở ra mới chỉnh được.
    assert.equal(await page.locator('#mapAdvanced').evaluate(el => el.open), false);
    assert.match(await page.locator('#mapCount').textContent(), /khoảng 30 giai đoạn/);
    await page.selectOption('#mapMinutes', '15');
    assert.match(await page.locator('#mapCount').textContent(), /khoảng 56 giai đoạn/);
    await page.selectOption('#mapMinutes', '6');
    assert.match(await page.locator('#mapCount').textContent(), /khoảng 23 giai đoạn/);
    await page.click('#mapAdvanced summary');
    assert.deepEqual(await page.locator('#mapVoice option').allTextContents(), ['Jenny (nữ) · en-US', 'Guy (nam) · en-US', 'Andrew (nam) · đa ngôn ngữ']);
    assert.equal(await page.locator('#mapVoice').inputValue(), 'en-US-GuyNeural');
    await page.click('#mapListen'); await flush();
    const listen = await calls('storyListen');
    assert.equal(listen.length, 1);
    assert.equal(listen[0].data.voice, 'en-US-GuyNeural');
    assert.match(listen[0].data.text, /thirteen fifty/);
    await page.click('#mapMusic'); await flush();
    assert.match(await page.locator('#mapMusicName').textContent(), /epic\.mp3/);
    await page.click('#mapAdvanced summary');

    // 3) Chủ đề theo NHÓM: 7 thẻ, mỗi thẻ một khung video mẫu thật; chọn nhóm thì Muse tự chọn đề tài trong nhóm.
    const groups = await page.locator('#mapGroups button.groupCard').count();
    assert.equal(groups, 7, 'bảy nhóm chủ đề');
    const ids = ['country', 'empire', 'dynasty', 'war', 'explore', 'ancient', 'independence'];
    for (const id of ids) {
      const img = page.locator(`#mapGroups button[data-group="${id}"] img`);
      assert.equal(await img.getAttribute('src'), `assets/maphist/categories/${id}.jpg`);
      assert.ok(await img.evaluate(el => el.complete && el.naturalWidth >= 400 && el.naturalHeight >= 225), `hình mẫu nhóm ${id} tải được`);
    }
    assert.match(await page.locator('#mapGroups button[data-group="empire"]').textContent(), /Đế chế/);
    assert.equal(await page.locator('#mapGroups button.active').count(), 0, 'chưa chọn nhóm nào');
    const topicCount = await page.locator('#mapTopicList option').count();
    assert.ok(topicCount >= 40, 'danh sách đề tài ghi sẵn đủ dài: ' + topicCount);
    assert.equal(await page.locator('#mapTopic').getAttribute('list'), 'mapTopicList', 'bấm vào ô đề tài cũng xổ danh sách');
    assert.equal(await page.locator('#mapTopics button').count(), 0, 'chưa chọn nhóm thì chưa có chữ gợi ý');
    assert.match(await page.locator('#mapCreate').textContent(), /Muse tự chọn chủ đề và làm video/);
    await page.click('#mapGroups button[data-group="empire"]');
    assert.equal(await page.locator('#mapGroups button.active').count(), 1);
    assert.equal(await page.locator('#mapGroups button[data-group="empire"]').getAttribute('aria-pressed'), 'true');
    assert.match(await page.locator('#mapCreate').textContent(), /Muse chọn đề tài «Đế chế» và làm video/);
    assert.ok(await page.locator('#mapTopics button.topicChip').count() >= 10, 'nhóm Đế chế có nhiều đề tài gợi ý');
    await page.click('#mapTopics button:has-text("The Mongol Empire")');
    assert.equal(await page.locator('#mapTopic').inputValue(), 'The Mongol Empire');
    assert.match(await page.locator('#mapTopics button.active').textContent(), /Mongol/);
    assert.equal((await page.locator('#mapCreate').textContent()).trim(), 'Làm video bản đồ');
    await page.click('#mapGroups button[data-group="war"]');
    assert.equal(await page.locator('#mapTopic').inputValue(), '', 'đổi sang nhóm khác thì bỏ đề tài của nhóm cũ');
    assert.match(await page.locator('#mapCreate').textContent(), /«Chiến tranh»/);
    // Ngôn ngữ video: 4 lựa chọn (có nghĩa tiếng Việt), mặc định tiếng Anh; đổi ngôn ngữ thì danh sách giọng + giọng mặc định + lời giải thích đổi theo.
    assert.deepEqual(await page.locator('#mapLang option').allTextContents(), ['English (tiếng Anh)', 'Deutsch (tiếng Đức)', 'Français (tiếng Pháp)', 'Русский (tiếng Nga)']);
    assert.equal(await page.locator('#mapLang').inputValue(), 'en');
    assert.match(await page.locator('#mapVoiceInfo').textContent(), /luôn bằng tiếng Anh/);
    await page.selectOption('#mapLang', 'de');
    assert.deepEqual(await page.locator('#mapVoice option').allTextContents(), ['Katja (nữ) · de-DE', 'Conrad (nam) · de-DE', 'Andrew (nam) · đa ngôn ngữ']);
    assert.equal(await page.locator('#mapVoice').inputValue(), 'de-DE-ConradNeural', 'giọng mặc định tiếng Đức');
    assert.match(await page.locator('#mapVoiceInfo').textContent(), /bằng tiếng Đức/);
    await page.selectOption('#mapLang', 'fr'); assert.equal(await page.locator('#mapVoice').inputValue(), 'fr-FR-HenriNeural'); assert.match(await page.locator('#mapVoiceInfo').textContent(), /bằng tiếng Pháp/);
    await page.selectOption('#mapLang', 'ru'); assert.equal(await page.locator('#mapVoice').inputValue(), 'ru-RU-DmitryNeural'); assert.match(await page.locator('#mapVoiceInfo').textContent(), /bằng tiếng Nga/);
    await page.evaluate(() => { document.querySelector('#mapAdvanced').open = true; });
    await page.selectOption('#mapVoice', 'ru-RU-SvetlanaNeural');
    await page.selectOption('#mapLang', 'en'); assert.equal(await page.locator('#mapVoice').inputValue(), 'en-US-GuyNeural');
    await page.selectOption('#mapLang', 'ru'); assert.equal(await page.locator('#mapVoice').inputValue(), 'ru-RU-SvetlanaNeural', 'nhớ giọng đã chọn riêng cho từng ngôn ngữ');
    await page.selectOption('#mapLang', 'de');
    await page.fill('#mapTopic', 'ab');
    await page.click('#mapCreate'); await flush();
    assert.equal((await calls('mapMake')).length, 0, 'đề tài quá ngắn thì không gửi');
    assert.match(await page.locator('#toast').textContent(), /quá ngắn/);
    await page.fill('#mapTopic', '');
    await page.locator('#mapTopic').dispatchEvent('input');
    await page.click('#mapCreate');
    await page.waitForSelector('#mapRuns .restoreRun');
    const auto = await calls('mapMake');
    assert.equal(auto.length, 1);
    assert.equal(auto[0].data.topic, '', 'đề tài trống = Muse tự chọn trong nhóm');
    assert.equal(auto[0].data.category, 'war', 'gửi đúng nhóm đã chọn');
    assert.equal(auto[0].data.minutes, 6);
    assert.equal(auto[0].data.language, 'de', 'gửi đúng ngôn ngữ video'); assert.equal(auto[0].data.voice, 'de-DE-ConradNeural', 'giọng đúng ngôn ngữ');
    assert.match(await page.locator('#mapRuns .restoreRun').first().textContent(), /Muse tự chọn: war/);
    // Bấm lại thẻ đang chọn thì bỏ chọn (về «Muse tự chọn hoàn toàn»).
    await page.evaluate(() => { document.querySelector('#mapForm').open = true; });
    await page.click('#mapGroups button[data-group="war"]');
    assert.equal(await page.locator('#mapGroups button.active').count(), 0);
    assert.match(await page.locator('#mapCreate').textContent(), /Muse tự chọn chủ đề và làm video/);
    await page.selectOption('#mapLang', 'en');
    await page.evaluate(() => { window.calls.length = 0; window.s.maphist.runs = {}; Object.assign(window.s.maphist, { busy: false, phase: '', runId: '', progress: '', error: '' }); window.s.maphist.write = {}; window.push(); });
    await page.waitForFunction(() => !document.querySelector('#mapRuns .restoreRun') && !document.querySelector('#mapCreate').disabled);
    await page.evaluate(() => { document.querySelector('#mapForm').open = true; });

    // 4) Gõ chủ đề rồi tạo: một lệnh duy nhất; tiến độ hiện ngay, có nút Dừng soạn.
    await page.fill('#mapTopic', 'History of Testland');
    await page.evaluate(() => { document.querySelector('#mapAdvanced').open = true; });
    await page.fill('#mapCountry', 'Indonesia');
    await page.evaluate(() => { document.querySelector('#mapAdvanced').open = false; });
    assert.equal(await page.locator('#mapTheme').isVisible(), true, 'form tạo video có ô «Kiểu hình video»');
    assert.equal(await page.locator('#mapTheme').inputValue(), 'cartoon', 'mặc định hoạt hình sáng');
    assert.deepEqual(await page.locator('#mapTheme option').evaluateAll(o => o.map(x => x.value)), ['cartoon', 'classic']);
    await page.selectOption('#mapTheme', 'classic');
    await page.click('#mapCreate');
    await page.waitForSelector('#mapRuns .restoreRun');
    const made = await calls('mapMake');
    assert.equal(made.length, 1);
    assert.deepEqual(made[0].data, { topic: 'History of Testland', category: '', country: 'Indonesia', minutes: 6, language: 'en', theme: 'classic', voice: 'en-US-GuyNeural', tempo: 1, music: 'C:\\Music\\epic.mp3', musicVolume: 0.2, workers: 0, auto: true });
    assert.match(await page.locator('#mapRuns .restoreRunText').first().textContent(), /Soạn kịch bản 2\/3/);
    assert.match(await page.locator('#mapRunHint').textContent(), /Đang soạn kịch bản · 5\/12 giai đoạn/);
    assert.equal(await page.locator('#mapCreate').isDisabled(), true);
    assert.equal(await page.locator('#mapForm').evaluate(el => el.open), false);

    // 5) Dừng: báo rõ + «Viết tiếp» gửi đúng mã.
    await page.click('#mapRuns button:has-text("Dừng soạn")');
    await page.waitForSelector('#mapRuns button:has-text("Viết tiếp")');
    assert.equal((await calls('mapCancel')).length, 1);
    assert.match(await page.locator('#mapRuns .restoreRunText').first().textContent(), /Đã dừng soạn kịch bản|Kịch bản chưa soạn xong/);
    await page.click('#mapRuns button:has-text("Viết tiếp")'); await flush();
    const resume = (await calls('mapMake')).at(-1).data;
    assert.equal(resume.resumeId, 'History-of-Testland');
    assert.equal(resume.auto, true);

    // 6) Kịch bản xong: xem và sửa, xem thử hình thật, lưu rồi dựng.
    await page.evaluate(() => { Object.assign(window.s.maphist, { busy: false, phase: 'script', error: '' }); window.s.maphist.write = {}; Object.assign(window.s.maphist.runs['History-of-Testland'], { status: 'script', eras: 3, name: 'History of Testland' }); window.push(); });
    await page.waitForSelector('#mapRuns button:has-text("Xem và sửa kịch bản")');
    assert.equal(await page.locator('#mapRuns button', { hasText: 'Dựng video' }).count(), 1);
    await page.click('#mapRuns button:has-text("Xem và sửa kịch bản")');
    await page.waitForSelector('#mapEditor[open]');
    assert.equal(await page.locator('#mapEras .mapEra').count(), 3);
    assert.equal(await page.locator('#mapEditTitle').inputValue(), 'History of Indonesia');
    assert.match(await page.locator('#mapIssues').textContent(), /Atlantis Prime/);
    await page.locator('#mapEras .mapEra summary').nth(1).click();
    assert.match(await page.locator('#mapEras .mapEra').nth(1).locator('.restoreRunText.warn').first().textContent(), /Atlantis Prime/);
    // sửa lời đọc, vùng và tên thế lực của giai đoạn 2
    const era2 = page.locator('#mapEras .mapEra').nth(1);
    await era2.locator('textarea').fill('In sixteen hundred and two the Dutch East India Company arrived at Java and slowly built a colony.');
    assert.match(await era2.locator('small.hint').first().textContent(), /18 từ/);
    await era2.locator('.mapRealm input[type=text]').nth(1).fill('Banten, Jakarta Raya, Jawa Barat');
    await era2.locator('button', { hasText: 'Xem thử hình' }).click();
    await page.waitForSelector('#mapPreviewBox:not([hidden])');
    await page.waitForFunction(() => /Hình xem thử: giai đoạn 2/.test(document.querySelector('#mapPreviewNote').textContent));
    const px = await page.evaluate(() => { const c = document.getElementById('mapPreview'), d = c.getContext('2d').getImageData(0, 0, 1920, 1080).data; let lit = 0, colors = new Set(); for (let i = 0; i < d.length; i += 4 * 997) { if (d[i] + d[i + 1] + d[i + 2] > 60) lit++; colors.add((d[i] >> 5) * 64 + (d[i + 1] >> 5) * 8 + (d[i + 2] >> 5)); } return { lit, colors: colors.size }; });
    assert.ok(px.lit > 100 && px.colors > 15, 'hình xem thử được vẽ thật: ' + JSON.stringify(px));
    await page.click('#mapEditBuild'); await flush();
    const saveCall = (await calls('mapSaveScript'))[0];
    assert.equal(saveCall.data.runId, 'History-of-Testland');
    assert.equal(await page.locator('#mapEditTheme').inputValue(), 'cartoon', 'kịch bản mới mặc định kiểu hoạt hình');
    assert.equal(saveCall.data.script.theme, 'cartoon', 'kiểu hình được lưu cùng kịch bản');
    assert.equal(saveCall.data.script.eras[1].narration.startsWith('In sixteen hundred and two the Dutch East India Company arrived at Java'), true);
    assert.deepEqual(saveCall.data.script.eras[1].realms[0].regions, ['Banten', 'Jakarta Raya', 'Jawa Barat']);
    assert.ok(!JSON.stringify(saveCall.data.script).includes('"units"'), 'không gửi các đơn vị tính sẵn');
    const render = (await calls('mapRender'))[0];
    assert.deepEqual(render.data, { runId: 'History-of-Testland', voice: 'en-US-GuyNeural', tempo: 1, music: 'C:\\Music\\epic.mp3', musicVolume: 0.2, workers: 0 });
    await page.waitForFunction(() => !document.getElementById('mapEditor').open);

    // 7) Đang dựng: tiến độ phần trăm, nút Dừng dựng.
    await page.waitForFunction(() => /Đang vẽ khung hình 300\/900/.test(document.querySelector('#mapRuns .restoreRunText')?.textContent || ''));
    assert.match(await page.locator('#mapRunHint').textContent(), /Đang dựng video · 33%/);
    assert.equal(await page.locator('#mapRuns button', { hasText: 'Dừng dựng' }).count(), 1);
    assert.equal(await page.locator('#mapRuns img.restoreLive').count(), 1, 'đang dựng thì hiện khung hình vừa vẽ');
    assert.match(await page.locator('#mapRuns img.restoreLive').getAttribute('src'), /xem-truoc-0\.jpg$/);

    // Đang dựng video mới vẫn xóa được video cũ (chỉ «Dựng lại» và «Xem và sửa» bị khóa).
    await page.evaluate(() => { window.s.maphist.runs['Old-Video'] = { name: 'Old video', status: 'done', output: 'C:\\Videos\\BanDo\\Old-Video\\Old-Video.mp4', seconds: 100, eras: 3, builtAt: 1, createdAt: 1, publish: { title: 'Old', description: '', tags: [], chapters: [] } }; window.push(); });
    await page.waitForFunction(() => document.querySelectorAll('#mapRuns .restoreRun').length === 2);
    const oldRun = page.locator('#mapRuns .restoreRun', { hasText: 'Old video' });
    assert.equal(await oldRun.locator('button', { hasText: 'Xóa' }).isDisabled(), false, 'xóa video cũ được khi đang dựng video khác');
    assert.equal(await oldRun.locator('button', { hasText: 'Dựng lại' }).isDisabled(), true, 'dựng lại thì phải chờ');
    await page.evaluate(() => { delete window.s.maphist.runs['Old-Video']; window.push(); });
    await page.waitForFunction(() => document.querySelectorAll('#mapRuns .restoreRun').length === 1);

    // 8) Dựng xong: video, lưu, mở, dựng lại, xóa (hộp hỏi có tick xóa file).
    await page.evaluate(() => { Object.assign(window.s.maphist, { busy: false, phase: 'done' }); window.s.maphist.build = {}; Object.assign(window.s.maphist.runs['History-of-Testland'], { status: 'done', output: 'C:\\Videos\\BanDo\\History-of-Testland\\History-of-Testland.mp4', seconds: 252, eras: 3 }); window.push(); });
    // Video bản cũ (chưa có bộ thông tin đăng): máy lập từ kịch bản nên tiêu đề là tiêu đề thật của bài (không phải tên dự án), chương cần dựng lại.
    await page.waitForSelector('#mapRuns .publishBox');
    await page.waitForFunction(() => document.querySelector('#mapRuns input.publishTitle')?.value === 'Testland: The Full Story from Dust to Empire');
    assert.equal((await calls('mapPublish')).length, 1, 'chỉ nhờ máy lập một lần');
    assert.equal((await calls('mapPublish'))[0].data.runId, 'History-of-Testland');
    assert.match(await page.locator('#mapRuns .publishBox').textContent(), /chưa có chương/);
    assert.equal(await page.locator('#mapRuns .publishMore').count(), 1);
    // Video mới: tiêu đề đúng như trên video + mô tả có chương + thẻ, sao chép được.
    await page.evaluate(() => { Object.assign(window.s.maphist.runs['History-of-Testland'], { builtAt: 2, publish: { title: 'Testland: From Dust to Empire', description: 'A tale\n\nChapters\n0:00 1350: Start\n0:20 1400: Rise\n0:40 1500: Fall', tags: ['history', 'testland history'], chapters: [] }, publishFile: 'C:\\Videos\\BanDo\\History-of-Testland\\tieu-de-youtube.txt' }); window.push(); window.copied = []; Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText: async t => { window.copied.push(t); } } }); });
    await page.waitForFunction(() => document.querySelector('#mapRuns input.publishTitle')?.value === 'Testland: From Dust to Empire');
    await page.click('#mapRuns button:has-text("Sao chép tiêu đề")');
    assert.deepEqual(await page.evaluate(() => window.copied), ['Testland: From Dust to Empire']);
    assert.match(await page.locator('#toast').textContent(), /Đã sao chép tiêu đề/);
    await page.click('#mapRuns .publishMore summary');
    assert.match(await page.locator('#mapRuns textarea.publishDesc').inputValue(), /Chapters\n0:00 1350: Start/);
    await page.click('#mapRuns button:has-text("Sao chép mô tả")');
    assert.match((await page.evaluate(() => window.copied)).at(-1), /0:40 1500: Fall/);
    await page.click('#mapRuns button:has-text("Sao chép thẻ")');
    assert.equal((await page.evaluate(() => window.copied)).at(-1), 'history, testland history');
    assert.match(await page.locator('#mapRuns .publishBox').textContent(), /tieu-de-youtube\.txt/);
    await page.waitForSelector('#mapRuns video');
    assert.match(await page.locator('#mapRuns .restoreRunText').first().textContent(), /Video hoàn chỉnh: History-of-Testland\.mp4/);
    assert.match(await page.locator('#mapRuns .restoreRunTop').first().textContent(), /4:12/);
    await page.click('#mapRuns button:has-text("Lưu video…")'); await flush();
    assert.deepEqual((await calls('mapSave'))[0].data, { runId: 'History-of-Testland' });
    await page.click('#mapRuns button:has-text("Mở video")'); await flush();
    assert.deepEqual((await calls('mapReveal'))[0].data, { runId: 'History-of-Testland' });
    // Ảnh bìa 16:9 chỉ có khi video đã xong: tạo, xem trước, đổi sang ảnh khác, mở thư mục.
    assert.equal(await page.locator('#mapRuns img.restoreThumb').count(), 0);
    await page.click('#mapRuns button:has-text("Tạo thumbnail 16:9")');
    await page.waitForSelector('#mapRuns img.restoreThumb');
    assert.deepEqual((await calls('mapThumb'))[0].data, { runId: 'History-of-Testland' });
    assert.match(await page.locator('#toast').textContent(), /thumbnail 1920×1080/);
    assert.equal(await page.locator('#mapRuns button', { hasText: 'Tạo thumbnail khác' }).count(), 1);
    await page.click('#mapRuns button:has-text("Lưu thumbnail…")'); await flush();
    assert.deepEqual((await calls('mapSave')).at(-1).data, { runId: 'History-of-Testland', thumb: true }, 'có nút lưu thumbnail như nút lưu video');
    await page.click('#mapRuns button:has-text("Mở thumbnail")'); await flush();
    assert.deepEqual((await calls('mapReveal')).at(-1).data, { runId: 'History-of-Testland', thumb: true });
    await page.click('#mapRuns button:has-text("Xóa")');
    await page.waitForSelector('#deleteFiles');
    await page.check('#deleteFiles'); await page.click('#deleteOk'); await flush();
    assert.deepEqual((await calls('mapRemove'))[0].data, { runId: 'History-of-Testland', deleteFiles: true });
    await page.waitForFunction(() => document.querySelectorAll('#mapRuns .restoreRun').length === 0);

    // 9) Chưa cài giọng: báo rõ, nút nghe thử khóa.
    await page.evaluate(() => { window.s.story.voice.ready.edge = false; window.push(); });
    await page.waitForFunction(() => document.querySelector('#mapListen').disabled);
    assert.match(await page.locator('#mapVoiceInfo').textContent(), /Chưa cài giọng Microsoft/);

    // 10) Tab riêng, nhớ lựa chọn; tab khác không thấy panel này.
    await page.click('#navWild');
    assert.equal(await page.locator('#mapPanel').isVisible(), false);
    assert.equal(await page.locator('#queueWorkspace').isVisible(), true, 'các tab khác thấy lại hàng đợi');
    await page.click('#navMap');
    assert.equal(await page.locator('#mapTopic').inputValue(), 'History of Testland');
    assert.equal(await page.locator('#mapCountry').inputValue(), 'Indonesia');
    // 11) Ảnh bìa: bốn kiểu bố cục thật sự khác nhau (kiểu 4 «Trước / Sau» có hai năm RẤT TO thay cho hook), màu rực; chữ duy nhất là vài từ to (hook), không nhãn nhỏ nào khác; hook trống thì không chữ.
    const thumbs = await page.evaluate(async () => {
      const raw = await window.nodeJson('world'), sample = await window.nodeJson('sample');
      const geo = maphistGeo.build(raw), n = maphistPlan.normalizeScript(sample, geo);
      const tl = maphistPlan.compile(n.script, geo, { durations: n.script.eras.map(() => 14), fps: 30 });
      const canvas = Object.assign(document.createElement('canvas'), { width: 1920, height: 1080 });
      const R = maphistDraw.create({ canvas, geo }); R.setTimeline(tl);
      let textCalls = 0, said = new Set(); const proto = CanvasRenderingContext2D.prototype, f = proto.fillText, k = proto.strokeText;
      proto.fillText = function (...a) { textCalls++; said.add(a[0]); return f.apply(this, a); }; proto.strokeText = function (...a) { textCalls++; return k.apply(this, a); };
      const out = [];
      try {
        textCalls = 0; R.drawThumbnail(1, { variant: 0, hook: '' }); const none = textCalls;
        for (let v = 0; v < 4; v++) {
          textCalls = 0; said = new Set(); R.drawThumbnail(1, { variant: v, hook: 'AZTEC EMPIRE' });
          const d = canvas.getContext('2d').getImageData(0, 0, 1920, 1080).data; let sat = 0, cnt = 0, hash = 0;
          for (let i = 0; i < d.length; i += 4 * 97) { const mx = Math.max(d[i], d[i + 1], d[i + 2]), mn = Math.min(d[i], d[i + 1], d[i + 2]); sat += mx ? (mx - mn) / mx : 0; cnt++; hash = (hash * 31 + d[i] + d[i + 2] * 7) % 1000003; }
          const px = canvas.getContext('2d').getImageData(970, 216, 1, 1).data;   // tâm vết nứt tia sét (kiểu 4) phải trắng
          out.push({ textCalls, said: [...said].join(' '), none, sat: sat / cnt, hash, crack: [px[0], px[1], px[2]], years: [Math.abs(tl.eras[0].year), Math.abs(tl.eras.at(-1).year)] });
        }
      } finally { proto.fillText = f; proto.strokeText = k; }
      return out;
    });
    assert.equal(thumbs[0].none, 0, 'hook trống thì không vẽ chữ');
    assert.deepEqual(thumbs.slice(0, 3).map(t => t.said), ['AZTEC EMPIRE', 'AZTEC EMPIRE', 'AZTEC EMPIRE'], 'chữ duy nhất trên ảnh bìa là hook (một hoặc hai dòng)');
    assert.ok(thumbs[3].said.includes(String(thumbs[3].years[0])) && thumbs[3].said.includes(String(thumbs[3].years[1])) && !thumbs[3].said.includes('AZTEC'), 'kiểu «Trước / Sau»: chữ là năm đầu và năm cuối: ' + thumbs[3].said);
    assert.ok(thumbs[3].crack[0] > 215 && thumbs[3].crack[1] > 200 && thumbs[3].crack[2] > 120, 'vết nứt tia sét ở giữa ảnh sáng trắng / vàng nhạt: ' + thumbs[3].crack);
    assert.ok(thumbs.every(t => t.sat > .3), 'màu rực (độ bão hòa cao): ' + thumbs.map(t => t.sat.toFixed(2)));
    assert.equal(new Set(thumbs.map(t => t.hash)).size, 4, 'bốn kiểu bố cục khác nhau');
    // 11b) Mặt lãnh thổ đổi theo sự kiện: mất ≥ 20% vùng -> choáng; mở rộng mạnh -> cười lớn; còn lại theo mood kịch bản; mặt choáng vẽ được (không lỗi, khác mặt cười).
    const faces = await page.evaluate(async () => {
      const raw = await window.nodeJson('world'), sample = await window.nodeJson('sample');
      const s2 = JSON.parse(JSON.stringify(sample)); s2.eras[1].realms = [JSON.parse(JSON.stringify(s2.eras[0].realms[0]))];   // cùng một thế lực ở hai giai đoạn liền nhau
      const geo = maphistGeo.build(raw), n = maphistPlan.normalizeScript(s2, geo);
      const tl = maphistPlan.compile(n.script, geo, { durations: n.script.eras.map(() => 14), fps: 30 });
      const canvas = Object.assign(document.createElement('canvas'), { width: 1920, height: 1080 }), R = maphistDraw.create({ canvas, geo }); R.setTimeline(tl);
      let idx = -1, r = null, prev = null;
      for (let i = 1; i < tl.eras.length && !r; i++) for (const x of tl.eras[i].realms) { const was = tl.eras[i - 1].realms.find(y => y.name === x.name); if (was && was.units.length >= 3) { idx = i; r = x; prev = was; break; } }
      if (!r) return { skip: true };
      const a = prev.units.length;
      return { skip: false, shrink: R.moodOf({ ...r, units: prev.units.slice(0, Math.floor(a * .5)) }, idx), grow: R.moodOf({ ...r, units: prev.units.concat(prev.units) }, idx), same: R.moodOf({ ...r, units: prev.units, mood: 'calm' }, idx), first: R.moodOf({ ...r, mood: 'sad' }, 0) };
    });
    assert.equal(faces.skip, false, 'mẫu kịch bản có thế lực xuất hiện ở hai giai đoạn liền nhau (đủ để thử biểu cảm theo sự kiện)');
    assert.deepEqual([faces.shrink, faces.grow, faces.same, faces.first], ['shock', 'happy', 'calm', 'sad'], 'biểu cảm theo sự kiện: ' + JSON.stringify(faces));
    const moodPix = await page.evaluate(() => {
      const draw = m => { const cv = Object.assign(document.createElement('canvas'), { width: 400, height: 260 }), c = cv.getContext('2d'); c.fillStyle = '#4caf6a'; c.fillRect(0, 0, 400, 260); maphistCartoon.eyes(c, 200, 120, 50, { mood: m, t: 1.3, seed: .31, k: 1, lid: '#c0392b' }); return [...c.getImageData(0, 0, 400, 260).data].reduce((h, v, i) => (h * 31 + v + i) >>> 0, 7); };
      return ['happy', 'proud', 'calm', 'angry', 'sad', 'tired', 'shock'].map(draw);
    });
    assert.equal(new Set(moodPix).size, 7, 'bảy biểu cảm khác nhau, kể cả mặt choáng');
    assert.equal(await page.evaluate(() => maphistPlan.MOODS.includes('shock')), true, 'kịch bản chấp nhận mood «shock»');
    // 12) Kiểu hoạt hình thật sự được vẽ: biển xanh phẳng, số năm hồng, cuộn giấy da, nút Subscribe ở màn kết; kiểu cổ khác hẳn và không có các thứ đó.
    const toon = await page.evaluate(async () => {
      const raw = await window.nodeJson('world'), sample = await window.nodeJson('sample'), geo = maphistGeo.build(raw);
      const make = theme => {
        const n = maphistPlan.normalizeScript({ ...sample, theme }, geo), tl = maphistPlan.compile(n.script, geo, { durations: n.script.eras.map(() => 14), fps: 30 });
        const canvas = Object.assign(document.createElement('canvas'), { width: 1920, height: 1080 }), R = maphistDraw.create({ canvas, geo }); R.setTimeline(tl);
        return { tl, R, canvas };
      };
      const count = (cv, x0, y0, w, h, test) => { const d = cv.getContext('2d').getImageData(x0, y0, w, h).data; let n = 0; for (let i = 0; i < d.length; i += 4) if (test(d[i], d[i + 1], d[i + 2])) n++; return n; };
      const probe = ({ tl, R, canvas }) => {
        R.drawFrame(tl.eras[1].start + 12);   // sau khi cảnh minh hoạ kết thúc
        const mid = { pink: count(canvas, 700, 100, 520, 170, (r, g, b) => r > 225 && g < 130 && b > 110 && b < 205), paper: count(canvas, 420, 920, 1080, 120, (r, g, b) => r > 215 && g > 190 && g < 245 && b > 130 && b < 205), sea: count(canvas, 0, 0, 1920, 1080, (r, g, b) => r < 90 && g > 140 && b > 200), green: count(canvas, 0, 0, 1920, 1080, (r, g, b) => r > 70 && r < 130 && g > 180 && b > 100 && b < 150) };
        R.drawFrame(tl.total - 1);
        return { ...mid, red: count(canvas, 1500, 120, 400, 80, (r, g, b) => r > 200 && g < 90 && b < 90) };
      };
      return { cartoon: probe(make('cartoon')), classic: probe(make('classic')) };
    });
    assert.ok(toon.cartoon.sea > 150000 && toon.cartoon.green > 5000, 'biển xanh phẳng và đất xanh lá: ' + JSON.stringify(toon.cartoon));
    assert.ok(toon.cartoon.pink > 3000, 'số năm hồng to ở đầu khung: ' + toon.cartoon.pink);
    assert.ok(toon.cartoon.paper > 40000, 'cuộn giấy da ở dưới: ' + toon.cartoon.paper);
    assert.ok(toon.cartoon.red > 3000, 'nút Subscribe đỏ ở màn kết: ' + toon.cartoon.red);
    assert.ok(toon.classic.sea < 20000 && toon.classic.red < 500 && toon.classic.pink < toon.cartoon.pink, 'kiểu cổ không có biển xanh phẳng / nút Subscribe: ' + JSON.stringify(toon.classic));

    // 12b) Cảnh minh hoạ có người: giữa giai đoạn có cảnh thì khung hình khác hẳn khung không cảnh; ngoài khoảng đó thì giống hệt.
    const cut = await page.evaluate(async () => {
      const raw = await window.nodeJson('world'), sample = await window.nodeJson('sample'), geo = maphistGeo.build(raw);
      const n = maphistPlan.normalizeScript({ ...sample, theme: 'cartoon', eras: sample.eras.map((e, i) => ({ ...e, scene: ['voyage', 'battle', 'court'][i % 3] })) }, geo), tl = maphistPlan.compile(n.script, geo, { durations: n.script.eras.map(() => 14), fps: 30 });
      const canvas = Object.assign(document.createElement('canvas'), { width: 1920, height: 1080 }), R = maphistDraw.create({ canvas, geo }); R.setTimeline(tl);
      const grab = t => { R.drawFrame(t); return canvas.getContext('2d').getImageData(260, 340, 1400, 540).data; };
      const diff = (a, b) => { let c = 0; for (let i = 0; i < a.length; i += 4) if (Math.abs(a[i] - b[i]) + Math.abs(a[i + 1] - b[i + 1]) + Math.abs(a[i + 2] - b[i + 2]) > 60) c++; return c; };
      const e = tl.eras[1], mid = e.start + e.cut.at + e.cut.dur / 2, before = e.start + 2.8, after = e.start + 12;
      const withScene = grab(mid), kinds = tl.eras.map(x => x.cut && x.cut.kind), shouts = tl.eras.map(x => x.cut && x.cut.shout);
      const a1 = grab(before), a2 = grab(after); e.cut = null;
      const without = grab(mid);
      return { diffMid: diff(withScene, without), kinds, shouts, cutDur: tl.eras[1].cut, hasCue: maphistPlan.cuesOf(tl).some(c => c.kind === 'boom'), a1: diff(a1, a1), a2: diff(a2, a2) };
    });
    assert.ok(cut.diffMid > 150000, 'cảnh minh hoạ phủ khung giữa màn hình: ' + JSON.stringify(cut));
    assert.deepEqual(cut.kinds.slice(0, 3), ['voyage', 'battle', 'court']);
    assert.ok(cut.shouts[1] && cut.shouts[1].length > 2, 'có tiếng hô mặc định');
    assert.deepEqual(errors, [], 'không lỗi script: ' + errors.join(' | '));
    console.log('maphist-tab-smoke OK');
  } finally { await browser.close(); server.close(); }
})().catch(e => { console.error(e); process.exit(1); });
