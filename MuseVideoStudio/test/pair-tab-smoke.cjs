// Giao diện thật (Chromium) của tab «So sánh song song» với IPC giả; không gọi Muse, không chạy FFmpeg.
const pw = (() => { try { return require('playwright-core'); } catch { return require('playwright'); } })();
const http = require('http'), fs = require('fs/promises'), path = require('path'), assert = require('assert/strict');
(async () => {
  const files = { '/assets/muse-studio.svg': 'assets/muse-studio.svg', '/assets/zalo-qr.jpg': 'assets/zalo-qr.jpg', '/': 'index.html', '/style.css': 'style.css', '/renderer.js': 'renderer.js', '/ui-i18n.js': 'ui-i18n.js', '/script-planner.js': 'script-planner.js', '/prompt-import.js': 'prompt-import.js', '/reference-map.js': 'reference-map.js', '/story-plan.js': 'story-plan.js', '/story-ui.js': 'story-ui.js', '/restore-plan.js': 'restore-plan.js', '/restore-ui.js': 'restore-ui.js', '/wild-plan.js': 'wild-plan.js', '/wild-ui.js': 'wild-ui.js', '/pair-plan.js': 'pair-plan.js', '/pair-ui.js': 'pair-ui.js' };
  const server = http.createServer(async (req, res) => {
    const name = files[req.url];
    if (!name) { res.writeHead(404); return res.end(); }
    res.setHeader('Content-Type', name.endsWith('.jpg') ? 'image/jpeg' : name.endsWith('.svg') ? 'image/svg+xml' : name.endsWith('.js') ? 'application/javascript' : name.endsWith('.css') ? 'text/css' : 'text/html');
    res.end(await fs.readFile(path.join(__dirname, '../src', name)));
  });
  await new Promise(r => server.listen(0, '127.0.0.1', r));
  const browser = await pw.chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined, headless: true, args: ['--no-sandbox'] });
  try {
    const page = await browser.newPage({ viewport: { width: 1450, height: 1900 } }), errors = [];
    page.on('pageerror', e => errors.push(e.message)); page.on('dialog', d => d.accept());
    await page.addInitScript(() => {
      if (!sessionStorage.getItem('fresh')) { localStorage.removeItem('museStudio.pair'); sessionStorage.setItem('fresh', '1'); }
      localStorage.setItem('museStudio.language', localStorage.getItem('testLang') || 'vi');
      const voices = [
        { id: 'vi-VN-HoaiMyNeural', lang: 'vi', language: 'Tiếng Việt', name: 'Hoài My (nữ)' },
        { id: 'en-US-JennyNeural', lang: 'en', language: 'Tiếng Anh', name: 'Jenny (nữ) · en-US' }, { id: 'en-US-GuyNeural', lang: 'en', language: 'Tiếng Anh', name: 'Guy (nam) · en-US' },
        { id: 'ja-JP-NanamiNeural', lang: 'ja', language: 'Tiếng Nhật', name: 'Nanami (nữ)' },
        { id: 'en-US-AndrewMultilingualNeural', lang: '*', language: 'Đa ngôn ngữ', name: 'Andrew (nam) · đa ngôn ngữ' }
      ];
      const s = {
        version: '1.15.2', active: false, paused: true, jobs: [],
        license: { status: 'active', plan: 'short', longTerm: false, device: 'TESTDEVICE', expiresAt: Date.now() + 86400000 * 30, message: 'Đã kích hoạt key.' },
        story: { busy: false, progress: '', error: '', output: '', srt: '', notes: [], voice: { setupBusy: false, setupMessage: '', setupError: '', ready: { edge: true, clone: false }, platform: 'win32', edgeVoices: voices, clones: [] } },
        restore: { busy: false, progress: '', error: '', storyId: '', stories: {} },
        wild: { busy: false, phase: '', progress: '', error: '', storyId: '', stories: {}, write: {}, build: {} },
        pair: { busy: false, phase: '', progress: '', error: '', storyId: '', stories: {}, write: {} },
        flow: { open: false, opening: false },
        settings: { browserChoice: 'builtin', browserPath: '', output: 'C:\\Videos', autoMerge: false, autoPackage: false, ffmpeg: 'ffmpeg', accountCount: 1, flowProjectUrl: '', flowModel: 'lite', flowParallel: 3, composer: 'textarea', fileInput: 'input[type=file]', submit: 'button[type=submit]' }
      };
      window.calls = []; window.s = s; let listener;
      window.push = () => listener(structuredClone(s));
      window.studio = {
        onUpdate: fn => listener = fn,
        invoke: async (name, data) => {
          window.calls.push({ name, data: JSON.parse(JSON.stringify(data ?? null)) });
          if (name === 'pairMake') {
            const storyId = data.resumeId || 'SS-Raised-with-Yelling';
            s.pair.stories[storyId] = s.pair.stories[storyId] || { topic: data.topic, name: data.topic, status: 'writing', minutes: data.minutes, lang: data.lang, createdAt: 1 };
            Object.assign(s.pair, { busy: true, phase: 'write', storyId, progress: 'Muse đang lập kịch bản…', error: '' });
            s.pair.write = { busy: true, progress: 'Viết kịch bản 2/9 (mốc 17–24) · Muse đang viết…', done: 16, total: 66 };
            setTimeout(window.push, 0);
            return { storyId };
          }
          if (name === 'pairCancel') { Object.assign(s.pair, { busy: false, phase: '', error: 'Đã dừng viết kịch bản. Bấm «Viết tiếp» để làm tiếp từ chỗ dở.' }); s.pair.write = { busy: false }; setTimeout(window.push, 0); return structuredClone(s); }
          if (name === 'pairPublish') {
            const publish = { title: 'The Same Child, Two Fathers: Yelling vs Listening', description: 'The Same Child\n\nChapters:\n0:00 Intro\n1:07 AGE 3\n2:07 AGE 6\n\n#TwoPaths #LifeLessons', hashtags: ['#TwoPaths', '#LifeLessons'], tags: ['the same child', 'life lessons'], chapters: [{}, {}, {}], partial: false };
            Object.assign(s.pair.stories[data.storyId], { publish, publishFile: 'C:\\Videos\\SoSanh\\x\\tieu-de-youtube.txt' });
            setTimeout(window.push, 0);
            return { publish };
          }
          if (name === 'pairThumb') {
            window.thumbN = (window.thumbN || 0) + 1;
            const file = 'C:\\Videos\\SoSanh\\' + data.storyId + '\\thumbnail-' + window.thumbN + '.jpg';
            Object.assign(s.pair.stories[data.storyId], { thumb: file, thumbAt: window.thumbN });
            setTimeout(window.push, 0);
            return { file, variant: window.thumbN, count: 4 };
          }
          if (name === 'storyListen') return 'C:\\Temp\\nghe-thu.mp3';
          return structuredClone(s);
        }
      };
    });
    await page.goto(`http://127.0.0.1:${server.address().port}/`);
    await page.waitForSelector('#navPair');
    const calls = name => page.evaluate(n => window.calls.filter(c => c.name === n), name);
    const flush = () => page.evaluate(() => new Promise(r => setTimeout(r, 120)));

    // 1) Nút tab nằm ngay dưới «Động vật hoang dã»; gói 30 ngày thấy khóa.
    const order = await page.evaluate(() => [...document.querySelectorAll('aside nav button')].map(b => b.id));
    assert.ok(order.indexOf('navPair') === order.indexOf('navWild') + 1, 'tab So sánh nằm ngay dưới Động vật: ' + order.join(','));
    assert.match(await page.locator('#navPair').textContent(), /So sánh song song/);
    await page.click('#navPair');
    assert.equal(await page.locator('#pairPanel').isVisible(), true);
    for (const id of ['restorePanel', 'wildPanel', 'storyPanel']) assert.equal(await page.locator('#' + id).isVisible(), false, 'không dính panel ' + id);
    assert.equal(await page.locator('#pairLock').isVisible(), true, 'gói 30 ngày thấy khóa');
    assert.equal(await page.locator('#pairBody').isVisible(), false);
    assert.match(await page.locator('#headingText').textContent(), /video so sánh song song/);
    assert.match(await page.locator('#folderPath').textContent(), /SoSanh$/);

    // 2) Gói Năm: mở khóa, mặc định là tiếng Anh, 9 phút, chia đôi ngang; đủ 15 ngôn ngữ.
    await page.evaluate(() => { window.s.license = { status: 'active', plan: 'year', longTerm: true, device: 'T', expiresAt: Date.now() + 86400000 * 365, message: 'Đã kích hoạt key (gói Năm).' }; window.push(); });
    await page.waitForSelector('#pairBody', { state: 'visible' });
    assert.deepEqual(await page.locator('#pairMinutes option').allTextContents(), ['1 phút (chạy thử, ít clip)', '3 phút (chạy thử, ít clip)', '5 phút (chạy thử, ít clip)', '8 phút', '9 phút', '10 phút']);
    assert.equal(await page.locator('#pairMinutes').inputValue(), '9');
    assert.equal(await page.locator('#pairLang option').count(), 15, 'đủ 15 ngôn ngữ');
    assert.equal(await page.locator('#pairLang').inputValue(), 'en', 'mặc định tiếng Anh');
    assert.equal(await page.locator('#pairLayout').inputValue(), 'side');
    assert.match(await page.locator('#pairCount').textContent(), /khoảng 9 phút = 66 mốc → 66 ảnh nền chung \+ 132 clip/);
    await page.selectOption('#pairMinutes', '1');
    assert.match(await page.locator('#pairCount').textContent(), /khoảng 1 phút = 7 mốc → 7 ảnh nền chung \+ 14 clip/);
    await page.selectOption('#pairMinutes', '9');

    // 3) Chủ đề trống = Muse tự chọn; có chip gợi ý theo ngôn ngữ video; nút tạo đổi nhãn.
    assert.equal(await page.locator('#pairTopic').inputValue(), '');
    assert.match(await page.locator('#pairCreate').textContent(), /Muse tự chọn chủ đề và làm video/);
    assert.equal(await page.locator('#pairTopics .topicChip.active').count(), 1);
    assert.match(await page.locator('#pairTopics .topicChip.active').textContent(), /Để Muse tự chọn/);
    const chips = await page.locator('#pairTopics .topicChip').allTextContents();
    assert.equal(chips.length, 15, '1 chip tự chọn + 14 gợi ý');
    assert.ok(chips.some(c => /father who yells and a father who listens/.test(c)), 'gợi ý bằng tiếng Anh khi video tiếng Anh');
    await page.click('#pairTopics .topicChip[data-topic="yell"]');
    assert.equal(await page.locator('#pairTopic').inputValue(), 'The same child: a father who yells and a father who listens');
    assert.equal(await page.locator('#pairLeft').inputValue(), 'RAISED WITH YELLING');
    assert.equal(await page.locator('#pairRight').inputValue(), 'RAISED WITH LISTENING');
    assert.match(await page.locator('#pairCreate').textContent(), /Làm video tự động/);
    // đổi ngôn ngữ sang tiếng Việt: chủ đề và nhãn (chưa sửa) đổi theo bản tiếng Việt
    await page.selectOption('#pairLang', 'vi');
    assert.match(await page.locator('#pairTopic').inputValue(), /cha hay quát|bố hay quát|la mắng|quát/i, 'chủ đề gợi ý đổi sang tiếng Việt: ' + await page.locator('#pairTopic').inputValue());
    assert.notEqual(await page.locator('#pairLeft').inputValue(), 'RAISED WITH YELLING');
    // đổi lại tiếng Anh; nhãn đã sửa tay thì giữ nguyên
    await page.selectOption('#pairLang', 'en');
    assert.equal(await page.locator('#pairLeft').inputValue(), 'RAISED WITH YELLING');
    await page.fill('#pairLeft', 'RAISED WITH SHOUTS');
    await page.selectOption('#pairLang', 'vi');
    assert.equal(await page.locator('#pairLeft').inputValue(), 'RAISED WITH SHOUTS', 'nhãn đã sửa tay không bị đổi');
    await page.selectOption('#pairLang', 'en');

    // 4) Giọng: giọng đúng ngôn ngữ đứng đầu (✓), thêm giọng đa ngôn ngữ; nghe thử đúng câu của ngôn ngữ.
    assert.deepEqual(await page.locator('#pairVoice option').allTextContents(), ['Jenny (nữ) · en-US ✓', 'Guy (nam) · en-US ✓', 'Andrew (nam) · đa ngôn ngữ']);
    assert.equal(await page.locator('#pairVoice').inputValue(), 'en-US-GuyNeural', 'giọng mặc định của tiếng Anh (người dẫn chuyện nam)');
    await page.selectOption('#pairLang', 'ja');
    assert.deepEqual(await page.locator('#pairVoice option').allTextContents(), ['Nanami (nữ) ✓', 'Andrew (nam) · đa ngôn ngữ']);
    await page.click('#pairListen');
    await flush();
    const listen = await calls('storyListen');
    assert.equal(listen.length, 1);
    assert.equal(listen[0].data.engine, 'edge');
    assert.equal(listen[0].data.voice, 'ja-JP-NanamiNeural');
    assert.match(listen[0].data.text, /同じ部屋/);
    await page.selectOption('#pairLang', 'es');
    assert.deepEqual(await page.locator('#pairVoice option').allTextContents(), ['Andrew (nam) · đa ngôn ngữ'], 'chỉ còn giọng đa ngôn ngữ cho ngôn ngữ chưa có giọng riêng');
    await page.selectOption('#pairLang', 'en');
    await page.selectOption('#pairVoice', 'en-US-JennyNeural');
    await page.selectOption('#pairLang', 'ja'); await page.selectOption('#pairLang', 'en');
    assert.equal(await page.locator('#pairVoice').inputValue(), 'en-US-JennyNeural', 'nhớ giọng đã chọn cho từng ngôn ngữ');

    // 5) Tạo video với chủ đề: một lệnh duy nhất với đủ lựa chọn; tiến độ viết kịch bản hiện ngay, có nút Dừng viết.
    await page.fill('#pairTempo', '1.1');
    await page.selectOption('#pairLayout', 'stack');
    await page.click('#pairCreate');
    await page.waitForSelector('#pairRuns .restoreRun');
    const made = await calls('pairMake');
    assert.equal(made.length, 1);
    assert.deepEqual(made[0].data, { topic: 'The same child: a father who yells and a father who listens', left: 'RAISED WITH SHOUTS', right: 'RAISED WITH LISTENING', minutes: 9, lang: 'en', layout: 'stack', voice: { voice: 'en-US-JennyNeural', tempo: 1.1 }, music: '', musicVolume: 0.15 });
    assert.match(await page.locator('#pairRuns .restoreRunText').first().textContent(), /Viết kịch bản 2\/9/);
    assert.match(await page.locator('#pairRunHint').textContent(), /Đang viết kịch bản · 16\/66 mốc/);
    assert.equal(await page.locator('#pairCreate').isDisabled(), true, 'đang làm video thì không tạo thêm');
    assert.equal(await page.locator('#pairForm').evaluate(el => el.open), false, 'thu gọn phần nhập để thấy tiến độ');
    assert.equal(await page.locator('#pairRuns button', { hasText: 'Dừng viết' }).count(), 1);

    // 6) Dừng giữa chừng: báo rõ và cho «Viết tiếp»; Viết tiếp gửi đúng mã.
    await page.click('#pairRuns button:has-text("Dừng viết")');
    await page.waitForSelector('#pairRuns button:has-text("Viết tiếp")');
    assert.equal((await calls('pairCancel')).length, 1);
    assert.match(await page.locator('#pairRuns .restoreRunText').first().textContent(), /Đã dừng viết kịch bản/);
    await page.click('#pairRuns button:has-text("Viết tiếp")');
    await flush();
    const made2 = await calls('pairMake');
    assert.equal(made2.length, 2);
    assert.deepEqual(made2[1].data, { resumeId: 'SS-Raised-with-Yelling' });
    await page.evaluate(() => { Object.assign(window.s.pair, { busy: false, phase: '', error: '' }); window.s.pair.write = {}; window.push(); });

    // 7) Đã viết xong: ảnh mốc và hai clip mỗi mốc trong hàng đợi riêng; thanh tiến độ; nút chạy.
    await page.evaluate(() => {
      const jobs = []; let n = 0;
      const add = (phase, number, status) => jobs.push({ id: String(++n), kind: 'pair', storyId: 'SS-Raised-with-Yelling', phase, number, title: `${phase} ${number}`, prompt: 'p', status, stage: status, order: n, references: [], needs: [], refList: [] });
      add('image', 901, 'completed'); add('image', 902, 'completed');
      for (let i = 1; i <= 4; i++) add('clip', i, i <= 2 ? 'completed' : 'pending');
      window.s.jobs = jobs; window.s.pair.stories['SS-Raised-with-Yelling'].status = 'queued'; window.s.pair.stories['SS-Raised-with-Yelling'].name = 'Raised with Yelling vs Listening';
      window.push();
    });
    await page.waitForFunction(() => /2\/4 clip/.test(document.querySelector('#pairRuns .restoreRunTop')?.textContent || ''));
    assert.match(await page.locator('#pairRuns .restoreRunTop').first().textContent(), /Raised with Yelling vs Listening/);
    assert.equal(await page.locator('#navPairCount').textContent(), '6', 'đếm cả ảnh nền và clip của tab này');
    assert.equal(await page.locator('#navWildCount').textContent(), '0', 'không lẫn vào tab Động vật');
    assert.equal(await page.locator('#navCount').textContent(), '0', 'không lẫn vào tab Tạo video');
    assert.equal(await page.locator('#pairRuns button', { hasText: 'Tạo tiếp' }).count(), 1);
    assert.equal(await page.locator('#pairRuns button', { hasText: 'Dựng video' }).count(), 0, 'chưa đủ clip thì chưa dựng');
    await page.click('#pairRuns button:has-text("Tạo tiếp")');
    await flush();
    assert.deepEqual((await calls('start')).at(-1).data, { kind: 'pair' });
    assert.equal(await page.locator('#total').textContent(), '6', 'hàng đợi chung chỉ hiện việc của tab này');

    // 8) Có clip lỗi: báo rõ cách xử lý.
    await page.evaluate(() => { window.s.jobs[3].status = 'failed'; window.s.jobs[3].stage = 'failed'; window.push(); });
    await page.waitForFunction(() => /dở hoặc lỗi/.test(document.querySelector('#pairRuns .restoreRunText')?.textContent || ''));
    assert.match(await page.locator('#pairRuns .restoreRunText').first().textContent(), /tự thử lại vài lần/);

    // 9) Đủ clip: nút Dựng video gửi đúng mã, giọng, nhạc; dựng xong có video, ảnh bìa và nút lưu / mở.
    await page.evaluate(() => { window.s.jobs.forEach(j => { j.status = 'completed'; j.stage = 'completed'; }); window.push(); });
    await page.waitForSelector('#pairRuns button:has-text("Dựng video")');
    // Thông tin đăng YouTube: tự lập khi đủ clip; tiêu đề, mô tả, hashtag, thẻ tag đều hiện sẵn kèm nút sao chép.
    await page.context().grantPermissions(['clipboard-read', 'clipboard-write'], { origin: 'http://127.0.0.1:' + server.address().port });
    await page.waitForSelector('#pairRuns .publishBox textarea.publishDesc');
    assert.equal((await calls('pairPublish')).length, 1, 'tự nhờ máy lập gói đăng đúng một lần');
    assert.deepEqual((await calls('pairPublish'))[0].data, { storyId: 'SS-Raised-with-Yelling' });
    assert.equal(await page.locator('#pairRuns .publishBox input.publishTitle').inputValue(), 'The Same Child, Two Fathers: Yelling vs Listening');
    assert.match(await page.locator('#pairRuns .publishBox textarea.publishDesc').inputValue(), /Chapters:\n0:00 Intro/);
    assert.equal(await page.locator('#pairRuns .publishBox textarea[aria-label="Hashtag"]').inputValue(), '#TwoPaths #LifeLessons');
    assert.equal(await page.locator('#pairRuns .publishBox textarea[aria-label^="Thẻ tag"]').inputValue(), 'the same child, life lessons');
    for (const [btn, want] of [['Sao chép tiêu đề', 'The Same Child, Two Fathers: Yelling vs Listening'], ['Sao chép hashtag', '#TwoPaths #LifeLessons'], ['Sao chép thẻ tag', 'the same child, life lessons']]) {
      await page.click(`#pairRuns .publishBox button:has-text("${btn}")`);
      assert.equal(await page.evaluate(() => navigator.clipboard.readText()), want, btn);
    }
    await page.click('#pairRuns .publishBox button:has-text("Sao chép mô tả")');
    assert.match(await page.evaluate(() => navigator.clipboard.readText()), /^The Same Child\n\nChapters:/);
    assert.match(await page.locator('#toast').textContent(), /Đã sao chép mô tả/);
    // Dữ liệu lạ làm hỏng một thẻ: thẻ đó thành thẻ tối thiểu kèm lý do, không làm mất danh sách; sửa dữ liệu thì thẻ đầy đủ trở lại.
    const goodPublish = await page.evaluate(() => window.s.pair.stories['SS-Raised-with-Yelling'].publish);
    await page.evaluate(() => { window.s.pair.stories['SS-Raised-with-Yelling'].publish = { title: 'x', tags: 'không phải mảng' }; window.push(); });
    await page.waitForSelector('#pairRuns .restoreRun.error .restoreRunText.warn:has-text("Không hiển thị đầy đủ được thẻ video này")');
    assert.equal(await page.locator('#pairRuns .restoreRun').count(), 1);
    assert.equal(await page.locator('#pairRuns button', { hasText: 'Tạo thumbnail 16:9' }).count(), 1, 'thẻ tối thiểu vẫn tạo thumbnail được');
    await page.evaluate(g => { window.s.pair.stories['SS-Raised-with-Yelling'].publish = g; window.push(); }, goodPublish);
    await page.waitForSelector('#pairRuns .publishBox textarea.publishDesc');
    assert.equal(await page.locator('#pairRuns .restoreRun.error').count(), 0);
    // Thumbnail: nút hiện ngay khi đủ clip (chưa cần dựng video); chưa có ảnh thì chưa có nút lưu / mở.
    assert.equal(await page.locator('#pairRuns button', { hasText: 'Tạo thumbnail 16:9' }).count(), 1);
    assert.equal(await page.locator('#pairRuns button', { hasText: 'Lưu thumbnail…' }).count(), 0);
    assert.equal(await page.locator('#pairRuns img.restoreThumb').count(), 0);
    await page.click('#pairRuns button:has-text("Tạo thumbnail 16:9")');
    await page.waitForSelector('#pairRuns img.restoreThumb', { state: 'attached' });
    assert.deepEqual((await calls('pairThumb')).map(c => c.data), [{ storyId: 'SS-Raised-with-Yelling' }]);
    assert.match(await page.locator('#toast').textContent(), /Đã tạo thumbnail 1920×1080 \(ảnh 1\/4\)\. Bấm lại để đổi sang kiểu khác\./);
    assert.match(await page.locator('#pairRuns img.restoreThumb').getAttribute('src'), /thumbnail-1\.jpg\?v=1$/);
    assert.equal(await page.locator('#pairRuns button', { hasText: 'Tạo thumbnail khác' }).count(), 1, 'đã có ảnh thì nút đổi thành «Tạo thumbnail khác»');
    await page.click('#pairRuns button:has-text("Tạo thumbnail khác")');
    await page.waitForFunction(() => /thumbnail-2\.jpg/.test(document.querySelector('#pairRuns img.restoreThumb')?.getAttribute('src') || ''));
    assert.equal((await calls('pairThumb')).length, 2);
    await page.click('#pairRuns button:has-text("Lưu thumbnail…")');
    await flush();
    assert.deepEqual((await calls('pairSave')).at(-1).data, { storyId: 'SS-Raised-with-Yelling', thumb: true });
    await page.click('#pairRuns button:has-text("Mở thumbnail")');
    await flush();
    assert.deepEqual((await calls('pairReveal')).at(-1).data, { storyId: 'SS-Raised-with-Yelling', thumb: true });
    await page.evaluate(() => { Object.assign(window.s.pair, { busy: true, phase: 'thumb', storyId: 'SS-Raised-with-Yelling', progress: 'Đang tạo thumbnail…' }); window.push(); });
    await page.waitForFunction(() => document.querySelector('#pairRunHint')?.textContent === 'Đang tạo thumbnail');
    assert.equal(await page.locator('#pairRuns button', { hasText: 'Tạo thumbnail khác' }).isDisabled(), true, 'đang bận thì khóa nút');
    assert.equal(await page.locator('#pairRuns button', { hasText: 'Dựng video' }).isDisabled(), true);
    await page.evaluate(() => { Object.assign(window.s.pair, { busy: false, phase: '', progress: '' }); window.push(); });
    await page.waitForFunction(() => !document.querySelector('#pairRuns button')?.closest('.restoreRun')?.querySelector('button:disabled'));
    await page.click('#pairRuns button:has-text("Dựng video")');
    await flush();
    const built = await calls('pairBuild');
    assert.equal(built.length, 1);
    assert.deepEqual(built[0].data, { storyId: 'SS-Raised-with-Yelling', voice: { voice: 'en-US-JennyNeural', tempo: 1.1 }, music: '' });
    await page.evaluate(() => { Object.assign(window.s.pair, { busy: true, phase: 'build', storyId: 'SS-Raised-with-Yelling', progress: 'Đang dựng mốc 12/66…' }); window.push(); });
    await page.waitForFunction(() => /Đang dựng mốc 12\/66/.test(document.querySelector('#pairRuns .restoreRunText')?.textContent || ''));
    assert.equal(await page.locator('#pairRuns button', { hasText: 'Dừng dựng' }).count(), 1);
    await page.evaluate(() => {
      Object.assign(window.s.pair, { busy: false, phase: 'done', progress: '' });
      Object.assign(window.s.pair.stories['SS-Raised-with-Yelling'], { output: 'C:\\Videos\\SoSanh\\SS-Raised-with-Yelling\\Raised with Yelling.mp4', cover: 'C:\\Videos\\SoSanh\\SS-Raised-with-Yelling\\cover.jpg', seconds: 543, builtAt: 5 });
      window.push();
    });
    await page.waitForSelector('#pairRuns video');
    assert.match(await page.locator('#pairRuns .restoreRunText').first().textContent(), /Video hoàn chỉnh \(9 phút 3 giây\): Raised with Yelling\.mp4.*ghi-chu-dang-video\.txt/);
    await page.click('#pairRuns button:has-text("Lưu video…")');
    await flush();
    assert.deepEqual((await calls('pairSave')).find(c => !c.data.thumb).data, { storyId: 'SS-Raised-with-Yelling' });
    await page.click('#pairRuns button:has-text("Mở video")');
    await flush();
    assert.deepEqual((await calls('pairReveal')).find(c => !c.data.thumb).data, { storyId: 'SS-Raised-with-Yelling' });
    await page.click('#pairRuns button:has-text("Mở thư mục")');
    await flush();
    assert.deepEqual((await calls('openOutput')).at(-1).data, { kind: 'pair' });
    assert.equal(await page.locator('#pairRuns button', { hasText: 'Dựng lại video' }).count(), 1, 'có video rồi vẫn dựng lại được (đổi giọng, nhạc)');

    // 10) Nhạc nền: chọn / bỏ; chưa cài giọng thì báo rõ, nghe thử khóa, cài giọng gọi bộ cài dùng chung.
    await page.click('#pairForm > summary');
    assert.equal(await page.locator('#pairForm').evaluate(el => el.open), true);
    await page.evaluate(() => { const o = window.studio.invoke; window.studio.invoke = async (n, d) => n === 'chooseMusic' ? 'C:\\Music\\piano.mp3' : o(n, d); });
    await page.click('#pairMusic');
    await page.waitForFunction(() => /piano\.mp3/.test(document.querySelector('#pairMusicName').textContent));
    assert.equal(await page.locator('#pairMusicClear').isHidden(), false);
    await page.click('#pairMusicClear');
    assert.match(await page.locator('#pairMusicName').textContent(), /Không nhạc nền/);
    await page.evaluate(() => { window.s.story.voice.ready.edge = false; window.push(); });
    await page.waitForFunction(() => document.querySelector('#pairListen').disabled);
    assert.match(await page.locator('#pairVoiceInfo').textContent(), /Chưa cài giọng Microsoft/);
    await page.click('#pairSetup');
    await flush();
    assert.equal((await calls('storySetupVoice')).length, 1);

    // 11) Tab riêng: các tab khác không hiện panel này; lựa chọn được nhớ khi mở lại.
    await page.click('#navRestore');
    assert.equal(await page.locator('#pairPanel').isVisible(), false);
    await page.click('#navWild');
    assert.equal(await page.locator('#pairPanel').isVisible(), false);
    await page.click('#navPair');
    assert.equal(await page.locator('#pairTopic').inputValue(), 'The same child: a father who yells and a father who listens');
    assert.equal(await page.locator('#pairLeft').inputValue(), 'RAISED WITH SHOUTS');
    assert.equal(await page.locator('#pairLang').inputValue(), 'en');
    assert.equal(await page.locator('#pairLayout').inputValue(), 'stack');

    // 12) Tạo không chủ đề: gửi topic rỗng để Muse tự chọn.
    await page.evaluate(() => { window.s.pair.stories = {}; window.s.jobs = []; window.s.pair.write = {}; window.s.story.voice.ready.edge = true; window.push(); });
    await flush();
    await page.click('#pairTopics .topicChip:has-text("Để Muse tự chọn")');
    assert.equal(await page.locator('#pairTopic').inputValue(), '');
    assert.equal(await page.locator('#pairLeft').inputValue(), '');
    await page.click('#pairCreate');
    await flush();
    const made3 = await calls('pairMake');
    assert.equal(made3.at(-1).data.topic, '');
    assert.equal(made3.at(-1).data.lang, 'en');
    assert.equal(made3.at(-1).data.left, '');

    // 13) Giao diện tiếng Anh: nhãn tĩnh được dịch, không còn chữ tiếng Việt trong panel.
    await page.evaluate(() => localStorage.setItem('testLang', 'en'));
    await page.reload();
    await page.waitForSelector('#navPair');
    await page.click('#navPair');
    assert.match(await page.locator('#navPair').textContent(), /Side-by-side/);
    assert.match(await page.locator('#pairCreate').textContent(), /Let Muse choose the topic and make the video|Make the video automatically/);
    const vi = await page.evaluate(() => {
      const out = [], w = document.createTreeWalker(document.getElementById('pairPanel'), NodeFilter.SHOW_TEXT);
      for (let n; n = w.nextNode();) if (/[ăâđêôơưáàảãạấầẩẫậắằẳẵặéèẻẽẹếềểễệíìỉĩịóòỏõọốồổỗộớờởỡợúùủũụứừửữựýỳỷỹỵ]/i.test(n.nodeValue)) out.push(n.nodeValue.trim());
      for (const e of document.querySelectorAll('#pairPanel [placeholder],#pairPanel [aria-label],#pairPanel [title]')) for (const a of ['placeholder', 'aria-label', 'title']) if (/[ăâđêôơưáàảãạấầẩẫậắằẳẵặ]/i.test(e.getAttribute(a) || '')) out.push(a + ':' + e.getAttribute(a));
      return out;
    });
    assert.deepEqual(vi.filter(t => !/^(Nanami|Jenny|Guy|Andrew|Hoài My|Português)/.test(t) && !/đa ngôn ngữ/.test(t)), [], 'còn chữ tiếng Việt chưa dịch trong tab So sánh song song');

    assert.equal(errors.length, 0, errors.join('\n'));
    console.log('pair tab smoke ok');
  } finally { await browser.close(); server.close(); }
})().catch(e => { console.error(e); process.exit(1); });
