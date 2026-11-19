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
    '/maphist-geo.js': 'maphist-geo.js', '/maphist-plan.js': 'maphist-plan.js', '/maphist-draw.js': 'maphist-draw.js', '/maphist-ui.js': 'maphist-ui.js',
    '/assets/maphist/fonts/Lora-Variable.ttf': 'assets/maphist/fonts/Lora-Variable.ttf', '/assets/maphist/fonts/Lora-Italic-Variable.ttf': 'assets/maphist/fonts/Lora-Italic-Variable.ttf'
  };
  const world = zlib.gunzipSync(await fs.readFile(path.join(src, 'assets/maphist/world.json.gz')));
  const sample = await fs.readFile(path.join(__dirname, 'fixtures/maphist-sample.json'));
  const type = n => n.endsWith('.jpg') ? 'image/jpeg' : n.endsWith('.svg') ? 'image/svg+xml' : n.endsWith('.ttf') ? 'font/ttf' : n.endsWith('.js') ? 'application/javascript' : n.endsWith('.css') ? 'text/css' : 'text/html';
  const server = http.createServer(async (req, res) => {
    if (req.url === '/world.json') { res.setHeader('Content-Type', 'application/json'); return res.end(world); }
    if (req.url === '/sample.json') { res.setHeader('Content-Type', 'application/json'); return res.end(sample); }
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
        { id: 'en-US-AndrewMultilingualNeural', lang: '*', language: 'Đa ngôn ngữ', name: 'Andrew (nam) · đa ngôn ngữ' }
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
            s.maphist.runs[runId] = s.maphist.runs[runId] || { name: data.topic, topic: data.topic, minutes: data.minutes, status: 'writing', createdAt: 1 };
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
          if (name === 'mapRender') { s.maphist.runs[data.runId].status = 'building'; Object.assign(s.maphist, { busy: true, phase: 'build', runId: data.runId }); s.maphist.build = { busy: true, progress: 'Đang vẽ khung hình 300/900 · còn khoảng 2 phút', done: 300, total: 900 }; setTimeout(window.push, 0); return { runId: data.runId }; }
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
    assert.deepEqual(await page.locator('#mapMinutes option').allTextContents(), ['2 phút', '3 phút', '4 phút', '5 phút', '6 phút', '8 phút']);
    assert.equal(await page.locator('#mapMinutes').inputValue(), '4');
    assert.deepEqual(await page.locator('#mapVoice option').allTextContents(), ['Jenny (nữ) · en-US', 'Guy (nam) · en-US', 'Andrew (nam) · đa ngôn ngữ']);
    assert.equal(await page.locator('#mapVoice').inputValue(), 'en-US-GuyNeural');
    assert.match(await page.locator('#mapCount').textContent(), /khoảng 15 giai đoạn/);
    await page.selectOption('#mapMinutes', '8');
    assert.match(await page.locator('#mapCount').textContent(), /khoảng 30 giai đoạn/);
    await page.selectOption('#mapMinutes', '4');
    await page.click('#mapListen'); await flush();
    const listen = await calls('storyListen');
    assert.equal(listen.length, 1);
    assert.equal(listen[0].data.voice, 'en-US-GuyNeural');
    assert.match(listen[0].data.text, /thirteen fifty/);
    await page.click('#mapMusic'); await flush();
    assert.match(await page.locator('#mapMusicName').textContent(), /epic\.mp3/);

    // 3) Chưa gõ chủ đề thì không gửi gì.
    await page.click('#mapCreate'); await flush();
    assert.equal((await calls('mapMake')).length, 0);
    assert.match(await page.locator('#toast').textContent(), /Nhập chủ đề/);

    // 4) Gõ chủ đề rồi tạo: một lệnh duy nhất; tiến độ hiện ngay, có nút Dừng soạn.
    await page.fill('#mapTopic', 'History of Testland');
    await page.fill('#mapCountry', 'Indonesia');
    await page.click('#mapCreate');
    await page.waitForSelector('#mapRuns .restoreRun');
    const made = await calls('mapMake');
    assert.equal(made.length, 1);
    assert.deepEqual(made[0].data, { topic: 'History of Testland', country: 'Indonesia', minutes: 4, voice: 'en-US-GuyNeural', tempo: 1, music: 'C:\\Music\\epic.mp3', musicVolume: 0.2, auto: true });
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
    assert.equal(saveCall.data.script.eras[1].narration.startsWith('In sixteen hundred and two the Dutch East India Company arrived at Java'), true);
    assert.deepEqual(saveCall.data.script.eras[1].realms[0].regions, ['Banten', 'Jakarta Raya', 'Jawa Barat']);
    assert.ok(!JSON.stringify(saveCall.data.script).includes('"units"'), 'không gửi các đơn vị tính sẵn');
    const render = (await calls('mapRender'))[0];
    assert.deepEqual(render.data, { runId: 'History-of-Testland', voice: 'en-US-GuyNeural', tempo: 1, music: 'C:\\Music\\epic.mp3', musicVolume: 0.2 });
    await page.waitForFunction(() => !document.getElementById('mapEditor').open);

    // 7) Đang dựng: tiến độ phần trăm, nút Dừng dựng.
    await page.waitForFunction(() => /Đang vẽ khung hình 300\/900/.test(document.querySelector('#mapRuns .restoreRunText')?.textContent || ''));
    assert.match(await page.locator('#mapRunHint').textContent(), /Đang dựng video · 33%/);
    assert.equal(await page.locator('#mapRuns button', { hasText: 'Dừng dựng' }).count(), 1);

    // 8) Dựng xong: video, lưu, mở, dựng lại, xóa (hộp hỏi có tick xóa file).
    await page.evaluate(() => { Object.assign(window.s.maphist, { busy: false, phase: 'done' }); window.s.maphist.build = {}; Object.assign(window.s.maphist.runs['History-of-Testland'], { status: 'done', output: 'C:\\Videos\\BanDo\\History-of-Testland\\History-of-Testland.mp4', seconds: 252, eras: 3 }); window.push(); });
    await page.waitForSelector('#mapRuns video');
    assert.match(await page.locator('#mapRuns .restoreRunText').first().textContent(), /Video hoàn chỉnh: History-of-Testland\.mp4/);
    assert.match(await page.locator('#mapRuns .restoreRunTop').first().textContent(), /4:12/);
    await page.click('#mapRuns button:has-text("Lưu video…")'); await flush();
    assert.deepEqual((await calls('mapSave'))[0].data, { runId: 'History-of-Testland' });
    await page.click('#mapRuns button:has-text("Mở video")'); await flush();
    assert.deepEqual((await calls('mapReveal'))[0].data, { runId: 'History-of-Testland' });
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
    assert.deepEqual(errors, [], 'không lỗi script: ' + errors.join(' | '));
    console.log('maphist-tab-smoke OK');
  } finally { await browser.close(); server.close(); }
})().catch(e => { console.error(e); process.exit(1); });
