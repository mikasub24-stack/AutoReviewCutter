// Giao diện thật (Chromium) của tab «Động vật hoang dã» với IPC giả; không gọi Muse, không chạy FFmpeg.
const pw = (() => { try { return require('playwright-core'); } catch { return require('playwright'); } })();
const http = require('http'), fs = require('fs/promises'), path = require('path'), assert = require('assert/strict');
(async () => {
  const files = { '/assets/muse-studio.svg': 'assets/muse-studio.svg', '/assets/zalo-qr.jpg': 'assets/zalo-qr.jpg', '/': 'index.html', '/style.css': 'style.css', '/renderer.js': 'renderer.js', '/ui-i18n.js': 'ui-i18n.js', '/script-planner.js': 'script-planner.js', '/prompt-import.js': 'prompt-import.js', '/reference-map.js': 'reference-map.js', '/story-plan.js': 'story-plan.js', '/story-ui.js': 'story-ui.js', '/restore-plan.js': 'restore-plan.js', '/restore-ui.js': 'restore-ui.js', '/wild-plan.js': 'wild-plan.js', '/wild-ui.js': 'wild-ui.js' };
  const server = http.createServer(async (req, res) => {
    const name = files[req.url];
    if (!name) { res.writeHead(404); return res.end(); }
    res.setHeader('Content-Type', name.endsWith('.jpg') ? 'image/jpeg' : name.endsWith('.svg') ? 'image/svg+xml' : name.endsWith('.js') ? 'application/javascript' : name.endsWith('.css') ? 'text/css' : 'text/html');
    res.end(await fs.readFile(path.join(__dirname, '../src', name)));
  });
  await new Promise(r => server.listen(0, '127.0.0.1', r));
  const browser = await pw.chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined, headless: true, args: ['--no-sandbox'] });
  try {
    const page = await browser.newPage({ viewport: { width: 1450, height: 1700 } }), errors = [];
    page.on('pageerror', e => errors.push(e.message)); page.on('dialog', d => d.accept());
    await page.addInitScript(() => {
      localStorage.setItem('museStudio.language', localStorage.getItem('testLang') || 'vi');
      const voices = [
        { id: 'vi-VN-HoaiMyNeural', lang: 'vi', language: 'Tiếng Việt', name: 'Hoài My (nữ)' }, { id: 'vi-VN-NamMinhNeural', lang: 'vi', language: 'Tiếng Việt', name: 'Nam Minh (nam)' },
        { id: 'en-US-JennyNeural', lang: 'en', language: 'Tiếng Anh', name: 'Jenny (nữ) · en-US' }, { id: 'en-US-AndrewMultilingualNeural', lang: '*', language: 'Đa ngôn ngữ', name: 'Andrew (nam) · đa ngôn ngữ' }
      ];
      const s = {
        version: '1.9.0', active: false, paused: true, jobs: [],
        license: { status: 'active', plan: 'short', longTerm: false, device: 'TESTDEVICE', expiresAt: Date.now() + 86400000 * 30, message: 'Đã kích hoạt key.' },
        story: { busy: false, progress: '', error: '', output: '', srt: '', notes: [], voice: { setupBusy: false, setupMessage: '', setupError: '', ready: { edge: true, clone: false }, platform: 'win32', edgeVoices: voices, clones: [] } },
        restore: { busy: false, progress: '', error: '', storyId: '', stories: {} },
        wild: { busy: false, phase: '', progress: '', error: '', storyId: '', stories: {}, write: {}, build: {} },
        flow: { open: false, opening: false },
        settings: { browserChoice: 'builtin', browserPath: '', output: 'C:\\Videos', autoMerge: false, autoPackage: false, ffmpeg: 'ffmpeg', accountCount: 1, flowProjectUrl: '', flowModel: 'lite', flowParallel: 3, composer: 'textarea', fileInput: 'input[type=file]', submit: 'button[type=submit]' }
      };
      window.calls = []; window.s = s; let listener, id = 100;
      window.push = () => listener(structuredClone(s));
      window.studio = {
        onUpdate: fn => listener = fn,
        invoke: async (name, data) => {
          window.calls.push({ name, data: JSON.parse(JSON.stringify(data ?? null)) });
          if (name === 'wildMake') {
            const storyId = data.resumeId || 'DV-Cay-mangut';
            s.wild.stories[storyId] = s.wild.stories[storyId] || { topic: data.topic, name: data.topic, status: 'writing', minutes: data.minutes, createdAt: 1 };
            Object.assign(s.wild, { busy: true, phase: 'write', storyId, progress: 'Muse đang lập kịch bản…', error: '' });
            s.wild.write = { busy: true, progress: 'Viết kịch bản 3/14 (cảnh 21–30, chương 3: Săn mồi) · Muse đang viết (đã 4 cảnh)…', done: 20, total: 130 };
            setTimeout(window.push, 0);
            return { storyId };
          }
          if (name === 'wildCancel') { Object.assign(s.wild, { busy: false, phase: '', error: 'Đã dừng viết kịch bản. Bấm «Viết tiếp» để làm tiếp từ chỗ dở.' }); s.wild.write = { busy: false }; setTimeout(window.push, 0); return structuredClone(s); }
          if (name === 'storyListen') return 'C:\\Temp\\nghe-thu.mp3';
          return structuredClone(s);
        }
      };
    });
    await page.goto(`http://127.0.0.1:${server.address().port}/`);
    await page.waitForSelector('#navWild');
    const calls = name => page.evaluate(n => window.calls.filter(c => c.name === n), name);
    const flush = () => page.evaluate(() => new Promise(r => setTimeout(r, 120)));

    // 1) Nút tab nằm ngay dưới «Dọn nhà · Sinh tồn»; gói 30 ngày thấy khóa.
    const order = await page.evaluate(() => [...document.querySelectorAll('aside nav button')].map(b => b.id));
    assert.ok(order.indexOf('navWild') === order.indexOf('navRestore') + 1, 'tab Động vật nằm ngay dưới Dọn nhà: ' + order.join(','));
    assert.match(await page.locator('#navWild').textContent(), /Động vật hoang dã/);
    await page.click('#navWild');
    assert.equal(await page.locator('#wildPanel').isVisible(), true);
    assert.equal(await page.locator('#restorePanel').isVisible(), false, 'không dính panel các tab khác');
    assert.equal(await page.locator('#storyPanel').isVisible(), false);
    assert.equal(await page.locator('#wildLock').isVisible(), true, 'gói 30 ngày thấy khóa');
    assert.equal(await page.locator('#wildBody').isVisible(), false);
    assert.match(await page.locator('#headingText').textContent(), /phim động vật hoang dã/);
    assert.match(await page.locator('#folderPath').textContent(), /DongVat$/);

    // 2) Gói Năm: mở khóa, ô chọn đủ giá trị mặc định.
    await page.evaluate(() => { window.s.license = { status: 'active', plan: 'year', longTerm: true, device: 'T', expiresAt: Date.now() + 86400000 * 365, message: 'Đã kích hoạt key (gói Năm).' }; window.push(); });
    await page.waitForSelector('#wildBody', { state: 'visible' });
    assert.deepEqual(await page.locator('#wildMinutes option').allTextContents(), ['15 phút', '20 phút', '25 phút']);
    assert.equal(await page.locator('#wildMinutes').inputValue(), '20');
    assert.equal((await page.locator('#wildLang option').allTextContents())[0], 'Tiếng Việt');
    assert.equal(await page.locator('#wildLang').inputValue(), 'vi');
    assert.equal(await page.locator('#wildAspect').inputValue(), '16:9');
    assert.match(await page.locator('#wildCount').textContent(), /khoảng 130 cảnh \(mỗi cảnh 10 giây\)/);
    await page.selectOption('#wildMinutes', '15');
    assert.match(await page.locator('#wildCount').textContent(), /khoảng 122 cảnh \(mỗi cảnh 8 giây\)/);
    await page.selectOption('#wildMinutes', '20');
    // giọng: giọng đúng ngôn ngữ đứng đầu, thêm giọng đa ngôn ngữ
    assert.deepEqual(await page.locator('#wildVoice option').allTextContents(), ['Hoài My (nữ) ✓', 'Nam Minh (nam) ✓', 'Andrew (nam) · đa ngôn ngữ']);
    assert.equal(await page.locator('#wildVoice').inputValue(), 'vi-VN-HoaiMyNeural');
    await page.selectOption('#wildLang', 'en');
    assert.deepEqual(await page.locator('#wildVoice option').allTextContents(), ['Jenny (nữ) · en-US ✓', 'Andrew (nam) · đa ngôn ngữ']);
    await page.selectOption('#wildLang', 'vi');
    assert.equal(await page.locator('#wildListen').isDisabled(), false);
    await page.click('#wildListen');
    await flush();
    const listen = await calls('storyListen');
    assert.equal(listen.length, 1);
    assert.equal(listen[0].data.engine, 'edge');
    assert.match(listen[0].data.text, /cầy mangut/);

    // 3) Chưa gõ tên thì không gửi gì.
    await page.click('#wildCreate');
    await flush();
    assert.equal((await calls('wildMake')).length, 0, 'chưa nhập tên thì không tạo');
    assert.match(await page.locator('#toast').textContent(), /Nhập tên con vật/);

    // 4) Gõ tên rồi tạo: một lệnh duy nhất với đủ lựa chọn; tiến độ viết kịch bản hiện ngay, có nút Dừng viết.
    await page.fill('#wildTopic', 'Cầy mangut và rắn hổ mang');
    await page.fill('#wildSignature', 'điệu múa tán tỉnh; xây tổ');
    await page.selectOption('#wildSfx', 'low');
    await page.click('#wildCreate');
    await page.waitForSelector('#wildRuns .restoreRun');
    const made = await calls('wildMake');
    assert.equal(made.length, 1);
    assert.deepEqual(made[0].data, { topic: 'Cầy mangut và rắn hổ mang', signature: 'điệu múa tán tỉnh; xây tổ', minutes: 20, lang: 'vi', aspect: '16:9', sfx: 'low', voice: { engine: 'edge', voice: 'vi-VN-HoaiMyNeural', tempo: 1, volume: 1 } });
    assert.match(await page.locator('#wildRuns .restoreRunText').first().textContent(), /Viết kịch bản 3\/14/);
    assert.match(await page.locator('#wildRunHint').textContent(), /Đang viết kịch bản · 20\/130 cảnh/);
    assert.equal(await page.locator('#wildCreate').isDisabled(), true, 'đang làm phim thì không tạo thêm');
    assert.equal(await page.locator('#wildForm').evaluate(el => el.open), false, 'thu gọn phần nhập để thấy tiến độ');
    assert.equal(await page.locator('#wildRuns button', { hasText: 'Dừng viết' }).count(), 1);

    // 5) Dừng giữa chừng: báo rõ và cho «Viết tiếp»; Viết tiếp gửi đúng mã phim.
    await page.click('#wildRuns button:has-text("Dừng viết")');
    await page.waitForSelector('#wildRuns button:has-text("Viết tiếp")');
    assert.equal((await calls('wildCancel')).length, 1);
    assert.match(await page.locator('#wildRuns .restoreRunText').first().textContent(), /Đã dừng viết kịch bản/);
    await page.click('#wildRuns button:has-text("Viết tiếp")');
    await flush();
    const made2 = await calls('wildMake');
    assert.equal(made2.length, 2);
    assert.deepEqual(made2[1].data, { resumeId: 'DV-Cay-mangut' });
    await page.evaluate(() => { Object.assign(window.s.wild, { busy: false, phase: '', error: '' }); window.s.wild.write = {}; window.push(); });

    // 6) Đã viết xong: ảnh mốc và clip trong hàng đợi riêng; đếm cảnh, thanh tiến độ, nút chạy.
    await page.evaluate(() => {
      const jobs = [];
      let n = 0;
      const add = (phase, number, status) => jobs.push({ id: String(++n), kind: 'wild', storyId: 'DV-Cay-mangut', phase, number, title: `Cảnh ${number}`, prompt: 'p', status, stage: status, order: n, references: [], needs: [], refList: [] });
      add('image', 901, 'completed'); add('image', 1, 'completed');
      for (let i = 1; i <= 4; i++) add('clip', i, i <= 2 ? 'completed' : 'pending');
      window.s.jobs = jobs; window.s.wild.stories['DV-Cay-mangut'].status = 'queued'; window.s.wild.stories['DV-Cay-mangut'].name = 'Cầy mangut: người gác hang';
      window.push();
    });
    await page.waitForFunction(() => /2\/4 cảnh/.test(document.querySelector('#wildRuns .restoreRunTop')?.textContent || ''));
    assert.match(await page.locator('#wildRuns .restoreRunTop').first().textContent(), /Cầy mangut: người gác hang/);
    assert.match(await page.locator('#navWildCount').textContent(), /^6$/, 'đếm cả ảnh mốc và clip của tab này');
    assert.equal(await page.locator('#navRestoreCount').textContent(), '0', 'không lẫn vào tab Dọn nhà');
    assert.equal(await page.locator('#navCount').textContent(), '0', 'không lẫn vào tab Tạo video');
    assert.equal(await page.locator('#wildRuns button', { hasText: 'Tạo tiếp' }).count(), 1);
    assert.equal(await page.locator('#wildRuns button', { hasText: 'Dựng phim' }).count(), 0, 'chưa đủ cảnh thì chưa dựng');
    await page.click('#wildRuns button:has-text("Tạo tiếp")');
    await flush();
    assert.deepEqual((await calls('start')).at(-1).data, { kind: 'wild' });
    // hàng đợi chung chỉ hiện việc của tab này
    assert.equal(await page.locator('#total').textContent(), '6');

    // 7) Có cảnh lỗi: báo rõ cách xử lý.
    await page.evaluate(() => { window.s.jobs[3].status = 'failed'; window.s.jobs[3].stage = 'failed'; window.push(); });
    await page.waitForFunction(() => /dở hoặc lỗi/.test(document.querySelector('#wildRuns .restoreRunText')?.textContent || ''));
    assert.match(await page.locator('#wildRuns .restoreRunText').first().textContent(), /tự thử lại vài lần/);

    // 8) Đủ cảnh: nút Dựng phim gửi đúng mã phim, giọng và nền tiếng; dựng xong có video và nút mở.
    await page.evaluate(() => { window.s.jobs.forEach(j => { j.status = 'completed'; j.stage = 'completed'; }); window.push(); });
    await page.waitForSelector('#wildRuns button:has-text("Dựng phim")');
    await page.click('#wildRuns button:has-text("Dựng phim")');
    await flush();
    const built = await calls('wildBuild');
    assert.equal(built.length, 1);
    assert.deepEqual(built[0].data, { storyId: 'DV-Cay-mangut', sfx: 'low', voice: { engine: 'edge', voice: 'vi-VN-HoaiMyNeural', tempo: 1, volume: 1 } });
    await page.evaluate(() => { Object.assign(window.s.wild, { busy: true, phase: 'build', storyId: 'DV-Cay-mangut' }); window.s.wild.build = { busy: true, progress: 'Đang dựng 40/130 cảnh…' }; window.push(); });
    await page.waitForFunction(() => /Đang dựng 40\/130/.test(document.querySelector('#wildRuns .restoreRunText')?.textContent || ''));
    await page.evaluate(() => { Object.assign(window.s.wild, { busy: false, phase: 'done' }); window.s.wild.build = {}; window.s.wild.stories['DV-Cay-mangut'].output = 'C:\\Videos\\DongVat\\DV-Cay-mangut\\Cay mangut.mp4'; window.s.wild.stories['DV-Cay-mangut'].builtAt = 5; window.s.wild.stories['DV-Cay-mangut'].status = 'built'; window.push(); });
    await page.waitForSelector('#wildRuns video');
    assert.match(await page.locator('#wildRuns .restoreRunText').first().textContent(), /Phim hoàn chỉnh: Cay mangut\.mp4.*ghi-chu-dang-video\.txt/);
    // «Lưu video…» chỉ hiện khi phim đã dựng xong và gửi đúng mã phim.
    await page.click('#wildRuns button:has-text("Lưu video…")');
    await flush();
    assert.deepEqual((await calls('wildSave'))[0].data, { storyId: 'DV-Cay-mangut' });
    await page.click('#wildRuns button:has-text("Mở video")');
    await flush();
    assert.deepEqual((await calls('wildReveal'))[0].data, { storyId: 'DV-Cay-mangut' });
    await page.click('#wildRuns button:has-text("Mở thư mục")');
    await flush();
    assert.deepEqual((await calls('openOutput')).at(-1).data, { kind: 'wild' });

    // 9) Chưa cài giọng: báo rõ, nút nghe thử khóa; bấm cài giọng gọi bộ cài dùng chung.
    await page.click('#wildForm > summary');   // phần nhập đã thu gọn khi bắt đầu chạy: bấm tiêu đề để mở lại
    assert.equal(await page.locator('#wildForm').evaluate(el => el.open), true);
    await page.evaluate(() => { window.s.story.voice.ready.edge = false; window.push(); });
    await page.waitForFunction(() => document.querySelector('#wildListen').disabled);
    assert.match(await page.locator('#wildVoiceInfo').textContent(), /Chưa cài giọng Microsoft/);
    await page.click('#wildSetup');
    await flush();
    assert.equal((await calls('storySetupVoice')).length, 1);

    // 10) Tab riêng: các tab khác không hiện panel này; ghi nhớ lựa chọn khi mở lại.
    await page.click('#navRestore');
    assert.equal(await page.locator('#wildPanel').isVisible(), false);
    await page.click('#navStory');
    assert.equal(await page.locator('#wildPanel').isVisible(), false);
    await page.click('#navWild');
    assert.equal(await page.locator('#wildTopic').inputValue(), 'Cầy mangut và rắn hổ mang');
    assert.equal(await page.locator('#wildSignature').inputValue(), 'điệu múa tán tỉnh; xây tổ', 'ô khoảnh khắc đặc sắc được nhớ');

    // 11) Giao diện tiếng Anh: nhãn tĩnh được dịch.
    await page.evaluate(() => localStorage.setItem('testLang', 'en'));
    await page.reload();
    await page.waitForSelector('#navWild');
    await page.click('#navWild');
    assert.match(await page.locator('#navWild').textContent(), /Wildlife/);
    assert.match(await page.locator('#wildCreate').textContent(), /Make the movie automatically/);

    assert.equal(errors.length, 0, errors.join('\n'));
    console.log('wild tab smoke ok');
  } finally { await browser.close(); server.close(); }
})().catch(e => { console.error(e); process.exit(1); });
