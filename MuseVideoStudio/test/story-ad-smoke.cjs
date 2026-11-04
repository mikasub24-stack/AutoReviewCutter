// Real Chromium UI test with mocked IPC for the «Quảng cáo sản phẩm» mode of the "Kể chuyện" tab.
// No Muse calls: the replies from Muse are canned by this test. It only proves the screen, the data it sends and the texts.
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
    const page = await browser.newPage({ viewport: { width: 1450, height: 1700 } }), errors = [], dialogs = [];
    page.on('pageerror', e => errors.push(e.message)); page.on('dialog', d => { dialogs.push(d.message()); d.accept(); });
    await page.addInitScript(() => {
      if (!localStorage.getItem('museStudio.language')) localStorage.setItem('museStudio.language', 'vi');
      const s = {
        version: '1.3.0', active: false, paused: true, jobs: [],
        license: { status: 'trial', device: 'TESTDEVICE', expiresAt: Date.now() + 86400000, message: 'Dùng thử 24 giờ' },
        story: { busy: false, progress: '', error: '', output: '', srt: '', notes: [], voice: { setupBusy: false, setupMessage: '', setupError: '', ready: { edge: false, clone: false }, platform: 'win32', edgeVoices: [], windowsVoices: [], clones: [] } },
        settings: { browserChoice: 'builtin', browserPath: '', output: 'C:\\Videos', autoMerge: false, autoPackage: false, ffmpeg: 'ffmpeg', accountCount: 2, composer: 'textarea', fileInput: 'input[type=file]', submit: '', video: 'video', image: 'img', attachmentReadySelector: '', timeoutMinutes: 15 }
      };
      window.calls = []; window.s = s; window.writeDelay = 500; let listener, id = 100;
      window.push = () => listener(structuredClone(s));
      window.AD_SCRIPT = 'Sáng nào cũng lạnh tay?\nBình Aqua giữ nóng 12 giờ.\nBấm vào giỏ hàng để xem chi tiết.';
      window.studio = {
        onUpdate: fn => listener = fn,
        invoke: async (name, data) => {
          window.calls.push({ name, data });
          if (name === 'storyAdWrite') {
            s.story.analyze = { busy: true, kind: 'write', progress: 'Viết lời quảng cáo · Muse đang viết…', part: 0, parts: 1, error: '' }; listener(structuredClone(s));
            await new Promise(r => setTimeout(r, window.writeDelay));
            s.story.analyze = { busy: false, kind: 'write', progress: 'Muse đã viết xong lời quảng cáo', part: 0, parts: 1, error: '' }; listener(structuredClone(s));
            if (window.writeFail) throw Error("Error invoking remote method 'studio:storyAdWrite': Error: Muse chưa viết lời quảng cáo. Bấm viết lại.");
            return { script: window.AD_SCRIPT };
          }
          if (name === 'storyAnalyze') {
            const units = data.script.split(/\n+/);
            return { scenes: [{ title: 'Cảnh 1', source: units.slice(0, 2).join(' '), voiceover: units.slice(0, 2).join(' '), visual: '', prompt: 'Cận cảnh bình Aqua bốc khói trên bàn làm việc, ánh sáng sớm.\nAudio: no speech, no dialogue, no singing, no narration, no lip movement - characters stay silent with mouths closed.' }, { title: 'Cảnh 2', source: units[2], voiceover: units[2], visual: '', prompt: 'Bàn tay đặt bình Aqua vào giỏ hàng, máy quay lùi xa.\nAudio: no speech, no dialogue, no singing, no narration, no lip movement - characters stay silent with mouths closed.' }], cast: '', notes: [] };
          }
          if (name === 'images') return ['C:\\Refs\\aqua.png'];
          if (name === 'add') s.jobs.push(...data.map(j => ({ ...j, id: String(++id), status: 'pending', stage: 'pending', order: s.jobs.length + 1 })));
          if (name === 'start') { s.active = true; s.paused = false; }
          return structuredClone(s);
        }
      };
    });
    await page.goto(`http://127.0.0.1:${server.address().port}/`);
    await page.waitForFunction(() => document.querySelectorAll('#navStory').length > 0);
    await page.locator('#navStory').click();
    const called = name => page.evaluate(n => window.calls.filter(c => c.name === n), name);

    // 1. Mặc định là chế độ kể chuyện; ô quảng cáo ẩn.
    assert.equal(await page.locator('#adBox').isHidden(), true);
    assert.equal(await page.locator('#modeStory').getAttribute('aria-pressed'), 'true');
    assert.equal(await page.locator('#storyHead').textContent(), '1. Câu chuyện');
    assert.equal(await page.locator('#storyRefs').textContent(), 'Chọn ảnh nhân vật');

    // 2. Chuyển sang quảng cáo: ô sản phẩm hiện, chữ đổi theo ngữ cảnh sản phẩm.
    await page.locator('#modeAd').click();
    assert.equal(await page.locator('#adBox').isVisible(), true);
    assert.equal(await page.locator('#modeAd').getAttribute('aria-pressed'), 'true');
    assert.equal(await page.locator('#storyHead').textContent(), '1. Lời quảng cáo (không bắt buộc)');
    assert.equal(await page.locator('#storyRefs').textContent(), 'Chọn ảnh sản phẩm');
    assert.match(await page.locator('#storyCharLabel').textContent(), /Người mẫu/);
    assert.match(await page.locator('#storyRefPaste').textContent(), /ảnh sản phẩm/);
    assert.match(await page.locator('#storyRefInfo').textContent(), /Chưa chọn ảnh sản phẩm/);
    assert.match(await page.locator('#storyInfo').textContent(), /các cảnh quay hiện ngay bên dưới/);
    // Ảnh sản phẩm lên đầu, rồi khung quảng cáo (có ô Tỉ lệ), rồi mới tới ô lời quảng cáo.
    const top = async sel => (await page.locator(sel).boundingBox()).y;
    assert.ok(await top('#storyRefs') < await top('#adTemplate') && await top('#adTemplate') < await top('#adQuick') && await top('#adQuick') < await top('#storyScenes'), 'thứ tự: ảnh → mẫu → nút → các cảnh');
    assert.equal(await page.locator('#adBox #storyAspect').count(), 1, 'ô Tỉ lệ nằm trong khung quảng cáo');
    assert.equal(await page.locator('.adMore').evaluate(e => e.open), false, 'thông tin thêm để Muse viết lời được thu gọn');
    assert.equal(await page.locator('#adTone option').count(), 5);
    assert.deepEqual(await page.locator('#adLength option').allTextContents(), ['15 giây', '30 giây', '45 giây', '60 giây']);
    assert.equal(await page.locator('#adLength').inputValue(), '30');
    assert.equal(await page.locator('#adCamera .chip').count(), 9);
    assert.equal(await page.locator('#adLook .chip').count(), 6);
    // Mặc định: mẫu đầu tiên đã chọn và điền sẵn các ô; máy quay/phong cách/lời đọc cất trong «Tùy chỉnh thêm».
    const pressed = box => page.locator(`#${box} .chip[aria-pressed=true]`).allTextContents();
    assert.deepEqual(await pressed('adTemplate'), ['Giới thiệu sản phẩm']);
    assert.equal(await page.locator('#adTone').inputValue(), 'expert');
    assert.equal(await page.locator('#adCamera .chip[aria-pressed=true]').count(), 2);
    assert.deepEqual(await pressed('adLook'), ['Quảng cáo TVC']);
    for (const sel of ['#adCamera', '#adLook', '#adProduct', '#adWrite', '#storyScript', '#storyOptionsRow', '#storyAnalyze', '#storySplit', '#storyMuse']) assert.equal(await page.locator(sel).isHidden(), true, sel + ' phải được cất khi chưa mở «Tùy chỉnh thêm»');
    for (const sel of ['#adTemplate', '#adLength', '#storyAspect', '#adQuick', '#storyInfo', '#storyScenes']) assert.equal(await page.locator(sel).evaluate(e => e.getClientRects().length > 0 || e.id === 'storyScenes'), true, sel);
    // Chế độ kể chuyện không bị ảnh hưởng: ô câu chuyện luôn hiện.
    await page.locator('#modeStory').click();
    assert.equal(await page.locator('#storyScript').isVisible(), true); assert.equal(await page.locator('#storyAnalyze').isVisible(), true);
    await page.locator('#modeAd').click();
    assert.equal(await page.locator('#storyScript').isHidden(), true);
    // Mở «Tùy chỉnh thêm» thì hiện ra; để mở cho các bước sau.
    await page.evaluate(() => { document.querySelector('.adMore').open = true; });
    await page.locator('#storyScript').waitFor({ state: 'visible' });
    for (const sel of ['#adCamera', '#adProduct', '#storyAnalyze', '#storySplit', '#storyOptionsRow']) assert.equal(await page.locator(sel).isVisible(), true, sel);
    await page.evaluate(() => { document.querySelector('.adMore').open = false; });
    await page.locator('#storyScript').waitFor({ state: 'hidden' });
    await page.evaluate(() => { document.querySelector('.adMore').open = true; });
    await page.locator('#storyScript').waitFor({ state: 'visible' });

    // 3. Chọn máy quay (tối đa 3) và phong cách.
    const chip = (box, text) => page.locator(`#${box} .chip:has-text("${text}")`);
    for (const t of await pressed('adCamera')) await chip('adCamera', t).click();
    assert.equal(await page.locator('#adCamera .chip[aria-pressed=true]').count(), 0, 'bỏ hết máy quay của mẫu');
    for (const t of ['Cận cảnh chi tiết', 'Xoay quanh', 'Từ trên cao']) await chip('adCamera', t).click();
    assert.equal(await page.locator('#adCamera .chip[aria-pressed=true]').count(), 3);
    await chip('adCamera', 'Lia ngang').click();
    assert.match(await page.locator('#toast').textContent(), /Chọn tối đa 3 chuyển động máy quay/);
    assert.equal(await page.locator('#adCamera .chip[aria-pressed=true]').count(), 3, 'chip thứ 4 không được chọn');
    await chip('adCamera', 'Từ trên cao').click();
    assert.equal(await page.locator('#adCamera .chip[aria-pressed=true]').count(), 2, 'bấm lại thì bỏ chọn');
    await chip('adLook', 'Review đời thường').click();
    await chip('adLook', 'Điện ảnh').click();
    assert.equal(await page.locator('#adLook .chip[aria-pressed=true]').count(), 1, 'phong cách chỉ chọn một');
    assert.equal(await page.locator('#adLook .chip[aria-pressed=true]').textContent(), 'Điện ảnh');
    await chip('adLook', 'Điện ảnh').click();
    assert.equal(await page.locator('#adLook .chip[aria-pressed=true]').count(), 0, 'bấm lại thì bỏ chọn');
    await chip('adLook', 'Review đời thường').click();
    assert.equal(await page.locator('#storyScenes .draftRow').count(), 0, 'chưa có ảnh thì chưa tự tạo cảnh');

    // 4. Thiếu tên sản phẩm → báo, không gọi Muse.
    await page.locator('#adWrite').click();
    assert.match(await page.locator('#toast').textContent(), /Nhập tên sản phẩm trước/);
    assert.equal((await called('storyAdWrite')).length, 0);
    assert.equal(await page.evaluate(() => document.activeElement.id), 'adProduct');

    // 5. Muse viết lời: dữ liệu gửi đủ thông tin; trong lúc viết nút khóa; kết quả vào ô lời quảng cáo để sửa.
    await page.locator('#adProduct').fill('Bình giữ nhiệt Aqua 500ml');
    await page.locator('#adPoints').fill('Giữ nóng 12 giờ\nNắp chống tràn');
    await page.locator('#adAudience').fill('Dân văn phòng');
    await page.locator('#adCta').fill('Bấm vào giỏ hàng để xem chi tiết');
    await page.locator('#adTone').selectOption('warm');
    await page.locator('#adLength').selectOption('45');
    await page.locator('#storyRefs').click();
    assert.match(await page.locator('#storyRefInfo').textContent(), /Ảnh sản phẩm: aqua\.png — gắn vào mọi cảnh/);
    // Ảnh vào là ra cảnh luôn (45 giây = 5 cảnh × 9 giây), không cần bấm gì.
    await page.waitForFunction(() => document.querySelectorAll('#storyScenes .draftRow').length === 5);
    assert.equal(await page.locator('#adQuick').textContent(), 'Tạo lại cảnh');
    assert.equal((await called('storyAnalyze')).length, 0, 'tự tạo cảnh không gọi Muse');
    await page.locator('#adWrite').click();
    await page.waitForFunction(() => document.getElementById('adWrite').disabled);
    assert.equal(await page.locator('#adWrite').textContent(), 'Muse đang viết…');
    assert.equal(await page.locator('#storyAnalyze').isDisabled(), true);
    assert.equal(await page.locator('#storyAnalyze').textContent(), 'Phân tích bằng Muse', 'đang viết lời thì nút phân tích không báo «đang phân tích»');
    assert.equal(await page.locator('#storySplit').isDisabled(), true);
    assert.equal(await page.locator('#storyAnalyzeStop').isVisible(), true);
    assert.match(await page.locator('#storyInfo').textContent(), /Viết lời quảng cáo · Muse đang viết/);
    await page.waitForFunction(() => !document.getElementById('adWrite').disabled);
    assert.equal(await page.locator('#storyScript').inputValue(), await page.evaluate(() => window.AD_SCRIPT));
    assert.equal(await page.locator('#adWrite').textContent(), 'Muse viết lời quảng cáo');
    assert.match(await page.locator('#storyInfo').textContent(), /Muse đã viết lời quảng cáo\. Đọc và sửa/);
    const write = (await called('storyAdWrite')).at(-1).data;
    assert.equal(write.reference, true); assert.equal(write.seconds, 10); assert.equal(write.aspect, '16:9');
    assert.deepEqual(write.ad, { product: 'Bình giữ nhiệt Aqua 500ml', points: 'Giữ nóng 12 giờ\nNắp chống tràn', audience: 'Dân văn phòng', offer: '', cta: 'Bấm vào giỏ hàng để xem chi tiết', tone: 'warm', length: 45, camera: ['macro', 'orbit'], look: 'ugc', template: 'intro' });
    assert.equal(dialogs.length, 0, 'ô trống thì không hỏi xác nhận');

    // 6. Viết lại khi ô đã có chữ → hỏi xác nhận, thay lời, xóa cảnh cũ.
    await page.locator('#storyScript').fill(await page.evaluate(() => window.AD_SCRIPT) + ' Sửa tay thêm một câu.');
    await page.locator('#storySplit').click();
    assert.ok(await page.locator('#storyScenes .draftRow').count() >= 1);
    await page.locator('#adWrite').click();
    await page.waitForFunction(() => document.getElementById('storyScript').value === window.AD_SCRIPT);
    assert.equal(dialogs.length, 1);
    assert.match(dialogs[0], /đang có chữ\. Viết mới sẽ thay toàn bộ và xóa các cảnh đã chia/);
    assert.equal(await page.locator('#storyScenes .draftRow').count(), 0, 'lời mới → cảnh cũ bị xóa');

    // 7. Chia nhanh trong chế độ quảng cáo: prompt mẫu mang thông tin sản phẩm, máy quay, phong cách, ảnh sản phẩm.
    await page.locator('#storySplit').click();
    const quick = await page.locator('#storyScenes .draftRow').nth(0).locator('textarea').nth(1).inputValue();
    assert.match(quick, /^Tạo video quảng cáo sản phẩm dài \d+ giây, tỷ lệ 16:9/);
    assert.match(quick, /Sản phẩm quảng cáo: Bình giữ nhiệt Aqua 500ml/);
    assert.match(quick, /Máy quay \(chọn hợp với cảnh\): cận cảnh chi tiết \(macro\)[^\n]*; máy quay xoay chậm quanh sản phẩm/);
    assert.match(quick, /Phong cách quảng cáo: review đời thường \(UGC\)/);
    assert.match(quick, /Sản phẩm giữ đúng hình dạng, màu sắc, chất liệu và bao bì như trong ảnh tham chiếu/);
    assert.doesNotMatch(quick, /Nhân vật chính giữ đúng khuôn mặt/);
    assert.match(quick, /Audio: no speech/);

    // 8. Phân tích bằng Muse: gửi kèm thông tin quảng cáo; ở chế độ kể chuyện thì KHÔNG gửi.
    await page.locator('#storyAnalyze').click();
    await page.waitForFunction(() => document.querySelectorAll('#storyScenes .draftRow').length === 2);
    const analyze = (await called('storyAnalyze')).at(-1).data;
    assert.equal(analyze.ad.product, 'Bình giữ nhiệt Aqua 500ml'); assert.deepEqual(analyze.ad.camera, ['macro', 'orbit']); assert.equal(analyze.ad.look, 'ugc'); assert.equal(analyze.reference, true);
    await page.locator('#modeStory').click();
    assert.equal(await page.locator('#adBox').isHidden(), true);
    assert.equal(await page.locator('#storyHead').textContent(), '1. Câu chuyện');
    assert.match(await page.locator('#storyRefInfo').textContent(), /Ảnh nhân vật: aqua\.png/);
    assert.equal(await page.locator('#storyOptionsRow #storyAspect').count(), 1, 'về chế độ kể chuyện thì ô Tỉ lệ về chỗ cũ');
    assert.equal(await page.locator('#adBox #storyAspect').count(), 0);
    await page.locator('#storyAnalyze').click();
    await page.waitForFunction(() => window.calls.filter(c => c.name === 'storyAnalyze').length === 2);
    assert.equal('ad' in (await called('storyAnalyze')).at(-1).data, false, 'chế độ kể chuyện không gửi thông tin quảng cáo');
    await page.waitForFunction(() => !document.getElementById('storyAnalyze').disabled);
    await page.locator('#modeAd').click();

    // 9. Thêm vào hàng đợi: ảnh sản phẩm gắn vào mọi cảnh; hỏi xác nhận nói «ảnh sản phẩm».
    dialogs.length = 0;
    await page.locator('#storyCreate').click();
    await page.waitForFunction(() => window.calls.some(c => c.name === 'start'));
    assert.match(dialogs[0], /ảnh sản phẩm\.$/);
    const add = (await called('add')).at(-1).data;
    assert.equal(add.length, 2);
    assert.ok(add.every(j => j.kind === 'story' && j.references.length === 1 && j.references[0] === 'C:\\Refs\\aqua.png' && j.image === 'C:\\Refs\\aqua.png'));
    assert.ok(add.every(j => /no speech/.test(j.prompt)));

    // 9b. Mẫu quảng cáo dựng sẵn + «Tạo quảng cáo từ ảnh»: chỉ cần ảnh sản phẩm, không cần lời.
    await page.evaluate(() => { document.getElementById('storyPanel').open = true; });
    assert.equal(await page.locator('#adTemplate .chip').count(), 6);
    await page.locator('#adTemplate .chip:has-text("Review sản phẩm")').click();
    assert.equal(await page.locator('#adTone').inputValue(), 'warm'); assert.equal(await page.locator('#adLength').inputValue(), '30');
    assert.deepEqual(await pressed('adCamera'), ['Cận cảnh chi tiết', 'Cầm tay']); assert.deepEqual(await pressed('adLook'), ['Review đời thường']);
    await page.locator('#adTemplate .chip:has-text("Khuyến mãi nhanh")').click();
    assert.equal(await page.locator('#adTone').inputValue(), 'fun'); assert.equal(await page.locator('#adLength').inputValue(), '15');
    assert.deepEqual(await pressed('adCamera'), ['Tiến sát', 'Quay chậm']); assert.deepEqual(await pressed('adLook'), ['Tươi sáng, trẻ trung']);
    assert.deepEqual(await pressed('adTemplate'), ['Khuyến mãi nhanh'], 'chỉ một mẫu được chọn');
    await page.locator('#adTemplate .chip:has-text("Khuyến mãi nhanh")').click();
    assert.deepEqual(await pressed('adTemplate'), ['Khuyến mãi nhanh'], 'luôn có một mẫu: bấm lại vẫn giữ');
    assert.equal(await page.locator('#adLength').inputValue(), '15');
    await page.locator('#adTemplate .chip:has-text("Cao cấp, tinh tế")').click();
    assert.deepEqual(await pressed('adCamera'), ['Lùi xa', 'Xoay quanh', 'Quay chậm']);
    // Chưa có ảnh → nhắc, không tạo gì.
    await page.locator('#storyRefsClear').click();
    await page.locator('#adQuick').click();
    assert.match(await page.locator('#toast').textContent(), /Chọn ảnh sản phẩm trước/);
    assert.equal(await page.locator('#storyScenes .draftRow').count(), 0);
    await page.locator('#storyRefs').click();
    // Chọn ảnh là cảnh tự ra: 30 giây = 5 cảnh × 6 giây; không có lời đọc, không bị nhắc «prompt mẫu»; số giây cố định.
    await page.waitForFunction(() => document.querySelectorAll('#storyScenes .draftRow').length === 5);
    assert.deepEqual(await page.locator('#storyScenes .draftRow strong').allTextContents(), ['Cảnh 1 · 6 giây', 'Cảnh 2 · 6 giây', 'Cảnh 3 · 6 giây', 'Cảnh 4 · 6 giây', 'Cảnh 5 · 6 giây']);
    assert.match(await page.locator('#storyInfo').textContent(), /Đã tạo 5 cảnh quảng cáo từ ảnh sản phẩm \(mẫu «Cao cấp, tinh tế»\)\. Không có lời đọc nên video giữ tiếng động của clip/);
    assert.deepEqual(await page.locator('#storyScenes .draftRow textarea:nth-of-type(1)').evaluateAll(l => l.map(t => t.value)), ['', '', '', '', ''], 'không có lời đọc');
    const shot = await page.locator('#storyScenes .draftRow').nth(0).locator('textarea').nth(1).inputValue();
    assert.match(shot, /^Tạo video quảng cáo sản phẩm dài 6 giây, tỷ lệ 16:9/); assert.match(shot, /Sản phẩm quảng cáo: Bình giữ nhiệt Aqua 500ml/);
    assert.match(shot, /Máy quay \(chọn hợp với cảnh\): chuyển động quay chậm[^\n]*; máy quay xoay chậm[^\n]*; máy quay lùi ra từ từ/);
    assert.match(shot, /Phong cách quảng cáo: sang trọng/); assert.match(shot, /như trong ảnh tham chiếu/); assert.match(shot, /Audio: no speech/);
    assert.equal(await page.locator('#storyScenes .storyTag:visible').count(), 0);
    await page.waitForTimeout(400);
    assert.doesNotMatch(await page.locator('#storyCheck').textContent(), /prompt mẫu|Chưa khớp/);
    // 15 giây = 3 cảnh × 5 giây.
    await page.locator('#adLength').selectOption('15');
    await page.waitForFunction(() => document.querySelectorAll('#storyScenes .draftRow').length === 3);
    assert.deepEqual(await page.locator('#storyScenes .draftRow strong').allTextContents(), ['Cảnh 1 · 5 giây', 'Cảnh 2 · 5 giây', 'Cảnh 3 · 5 giây']);
    // Thêm lời đọc vào một cảnh → số giây của cảnh đó tính theo lời.
    await page.locator('#storyScenes .draftRow').nth(0).locator('textarea').nth(0).fill('Bình Aqua giữ nóng 12 giờ.');
    assert.equal(await page.locator('#storyScenes .draftRow strong').nth(0).textContent(), 'Cảnh 1 · 3 giây');
    await page.locator('#storyScenes .draftRow').nth(0).locator('textarea').nth(0).fill('');
    assert.equal(await page.locator('#storyScenes .draftRow strong').nth(0).textContent(), 'Cảnh 1 · 5 giây', 'xóa lời thì về số giây của mẫu');
    // Đã sửa tay một cảnh → đổi tùy chọn KHÔNG tự ghi đè; chỉ báo, bấm «Tạo lại cảnh» mới thay (có hỏi).
    await page.locator('#storyScenes .draftRow').nth(0).locator('textarea').nth(1).fill('Cảnh do tôi sửa tay');
    await page.locator('#adLength').selectOption('30');
    await page.waitForFunction(() => /Đã đổi tùy chọn\. Bấm «Tạo lại cảnh»/.test(document.getElementById('storyInfo').textContent));
    await page.waitForTimeout(400);
    assert.equal(await page.locator('#storyScenes .draftRow').count(), 3);
    assert.equal(await page.locator('#storyScenes .draftRow').nth(0).locator('textarea').nth(1).inputValue(), 'Cảnh do tôi sửa tay');
    dialogs.length = 0;
    await page.locator('#adQuick').click();
    await page.waitForFunction(() => document.querySelectorAll('#storyScenes .draftRow').length === 5);
    assert.equal(dialogs.length, 1); assert.match(dialogs[0], /Tạo lại sẽ thay các cảnh đang có, kể cả phần bạn đã sửa/);
    assert.doesNotMatch(await page.locator('#storyScenes .draftRow').nth(0).locator('textarea').nth(1).inputValue(), /do tôi sửa tay/);
    // Chưa sửa gì thì nút «Tạo lại cảnh» không hỏi; đổi lại 15 giây → 3 cảnh tự cập nhật.
    dialogs.length = 0;
    await page.locator('#adQuick').click();
    assert.equal(dialogs.length, 0);
    await page.locator('#adLength').selectOption('15');
    await page.waitForFunction(() => document.querySelectorAll('#storyScenes .draftRow').length === 3);
    // Bỏ ảnh → các cảnh tự tạo (chưa sửa) biến mất; chọn lại ảnh → hiện lại.
    await page.locator('#storyRefsClear').click();
    await page.waitForFunction(() => document.querySelectorAll('#storyScenes .draftRow').length === 0);
    assert.equal(await page.locator('#adQuick').textContent(), 'Tạo quảng cáo từ ảnh');
    await page.locator('#storyRefs').click();
    await page.waitForFunction(() => document.querySelectorAll('#storyScenes .draftRow').length === 3);
    // Đổi mẫu cũng tự tạo lại ngay (chưa sửa): Cao cấp, 15 giây vẫn 3 cảnh nhưng prompt đổi theo mẫu.
    const before = await page.locator('#storyScenes .draftRow').nth(0).locator('textarea').nth(1).inputValue();
    await page.locator('#adTemplate .chip:has-text("Mở hộp, nhìn kỹ")').click();
    await page.waitForFunction(() => document.getElementById('adLength').value === '30' && document.querySelectorAll('#storyScenes .draftRow').length === 5);
    assert.match(await page.locator('#storyInfo').textContent(), /mẫu «Mở hộp, nhìn kỹ»/);
    await page.locator('#adTemplate .chip:has-text("Cao cấp, tinh tế")').click();
    await page.locator('#adLength').selectOption('15');
    await page.waitForFunction(() => document.querySelectorAll('#storyScenes .draftRow').length === 3);
    assert.equal(await page.locator('#storyScenes .draftRow').nth(0).locator('textarea').nth(1).inputValue(), before, 'cùng mẫu + cùng tùy chọn → cùng prompt');
    // Thêm vào hàng đợi: không lời, đúng số giây, ảnh sản phẩm gắn vào mọi cảnh.
    await page.evaluate(() => { window.s.active = false; window.s.paused = true; window.push(); });
    const startsBefore = (await called('start')).length;
    await page.locator('#storyCreate').click();
    await page.waitForFunction(n => window.calls.filter(c => c.name === 'start').length === n + 1, startsBefore);
    const shots = (await called('add')).at(-1).data;
    assert.equal(shots.length, 3);
    assert.ok(shots.every(j => j.kind === 'story' && j.voiceover === '' && j.source === '' && j.durationSeconds === 5 && j.references.join() === 'C:\\Refs\\aqua.png' && /no speech/.test(j.prompt)));

    // 10. Lỗi từ Muse hiện rõ, nút không bị kẹt.
    await page.evaluate(() => { window.writeFail = true; document.getElementById('storyPanel').open = true; });
    await page.locator('#storyScript').fill('');
    await page.locator('#adWrite').click();
    await page.waitForFunction(() => /Muse chưa viết lời quảng cáo/.test(document.getElementById('toast').textContent));
    assert.equal(await page.locator('#adWrite').isDisabled(), false);
    assert.equal(await page.locator('#storyScript').inputValue(), '', 'lỗi thì không đụng đến ô lời');
    await page.evaluate(() => { window.writeFail = false; });

    // 11. Nhớ mọi thứ sau khi mở lại app.
    await page.reload();
    await page.waitForFunction(() => document.querySelectorAll('#navStory').length > 0);
    assert.equal(await page.locator('#adBox').isVisible(), true, 'nhớ chế độ quảng cáo');
    assert.equal(await page.locator('#storyHead').textContent(), '1. Lời quảng cáo (không bắt buộc)');
    assert.equal(await page.locator('#adProduct').inputValue(), 'Bình giữ nhiệt Aqua 500ml');
    assert.equal(await page.locator('#adPoints').inputValue(), 'Giữ nóng 12 giờ\nNắp chống tràn');
    assert.equal(await page.locator('#adTone').inputValue(), 'premium');
    assert.equal(await page.locator('#adLength').inputValue(), '15', 'độ dài chọn gần nhất được nhớ');
    assert.equal(await page.locator('#storyScript').isHidden(), true, 'mở lại app thì «Tùy chỉnh thêm» đóng, ô lời được cất');
    assert.deepEqual(await page.locator('#adTemplate .chip[aria-pressed=true]').allTextContents(), ['Cao cấp, tinh tế']);
    assert.deepEqual(await page.locator('#adCamera .chip[aria-pressed=true]').allTextContents(), ['Lùi xa', 'Xoay quanh', 'Quay chậm']);
    assert.deepEqual(await page.locator('#adLook .chip[aria-pressed=true]').allTextContents(), ['Sang trọng']);

    // 12. Tiếng Anh: nút chuyển chế độ, nhãn, chip, độ dài, nút viết lời, gợi ý và thông báo đều được dịch.
    await page.locator('#languagePicker').selectOption('en');
    await page.waitForFunction(() => document.documentElement.lang === 'en' && document.getElementById('adWrite').textContent === 'Muse writes the ad script');
    assert.equal(await page.locator('#modeAd').textContent(), 'Product ad');
    assert.equal(await page.locator('#modeStory').textContent(), 'Story');
    assert.equal(await page.locator('#storyHead').textContent(), '1. Ad script (optional)');
    assert.equal(await page.locator('#storyRefs').textContent(), 'Choose product image');
    assert.match(await page.locator('#storyCharLabel').textContent(), /Model \/ user \(optional\)/);
    assert.match(await page.locator('label:has(#adProduct)').textContent(), /Product name/);
    assert.match(await page.locator('label:has(#adPoints)').textContent(), /Selling points \(one per line\)/);
    assert.deepEqual(await page.locator('#adLength option').allTextContents(), ['15 seconds', '30 seconds', '45 seconds', '60 seconds']);
    assert.deepEqual(await page.locator('#adCamera .chip').allTextContents(), ['Macro close-up', 'Dolly in', 'Pull back', 'Orbit', 'Pan', 'Top-down', 'Slow motion', 'Handheld', 'Static']);
    assert.deepEqual(await page.locator('#adTemplate .chip').allTextContents(), ['Product intro', 'Product review', 'Problem → solution', 'Quick promo', 'Unboxing', 'Premium']);
    assert.equal(await page.locator('#adQuick').textContent(), 'Create ad from photo');
    assert.match(await page.locator('.adMore summary').textContent(), /More options: product name, camera, look, narration \(optional\)/);
    assert.deepEqual(await page.locator('#adLook .chip').allTextContents(), ['TV commercial', 'Cinematic', 'Everyday review (UGC)', 'Minimal, plain background', 'Bright and young', 'Luxury']);
    assert.equal(await page.locator('#adTone option').first().textContent(), 'Enthusiastic, persuasive');
    assert.match(await page.locator('#storyRefInfo').textContent(), /No product image chosen/);
    assert.equal(await page.locator('#adProduct').getAttribute('placeholder'), 'e.g. Aqua 500 ml thermos bottle');
    assert.match(await page.locator('#storyScript').getAttribute('placeholder'), /^Optional\. For a voice and subtitles, open “More options” and click “Muse writes the ad script”/);
    // Đang viết (kể cả khi giao diện vừa tải lại): nút và tiến độ đúng, có dịch tiếng Anh.
    await page.evaluate(() => { window.s.story.analyze = { busy: true, kind: 'write', progress: 'Viết lời quảng cáo · Muse đang viết…', part: 0, parts: 1, error: '' }; window.push(); });
    await page.waitForFunction(() => document.getElementById('adWrite').disabled);
    assert.equal(await page.locator('#adWrite').textContent(), 'Muse is writing…');
    assert.equal(await page.locator('#storyAnalyze').textContent(), 'Analyze with Muse');
    assert.equal(await page.locator('#storyInfo').textContent(), 'Writing the ad script · Muse is writing…');
    await page.evaluate(() => { window.s.story.analyze = { busy: true, kind: 'write', progress: 'Viết lời quảng cáo · chuẩn bị yêu cầu…', part: 0, parts: 1, error: '' }; window.push(); });
    await page.waitForFunction(() => /preparing the request/.test(document.getElementById('storyInfo').textContent));
    await page.evaluate(() => { window.s.story.analyze = { busy: false, kind: 'write', progress: '', part: 0, parts: 0, error: '' }; window.push(); });
    await page.waitForFunction(() => !document.getElementById('adWrite').disabled);
    // Chuyển lại chế độ kể chuyện bằng tiếng Anh.
    await page.locator('#modeStory').click();
    assert.equal(await page.locator('#storyHead').textContent(), '1. Story');
    assert.equal(await page.locator('#storyRefs').textContent(), 'Choose character image');
    assert.deepEqual(errors, []);
    console.log('PASS: product-ad mode — photo-first layout, 6 ready-made templates (fill tone/length/camera/look), photo in → shots appear at once and follow template/length/camera/look changes unless edited by hand («Tạo lại cảnh» asks first); extra options folded away; (3–6 fixed-length shots, no narration, queued with the product image), mode switch and texts, camera/look chips (max 3 cameras), product fields persisted, Muse ad-script request data + busy state + errors, overwrite confirm, quick-split ad prompt, ad data only in ad mode, product image on every scene, English labels. Mock IPC; Muse replies are canned by the test, not the real Muse.');
  } finally { await browser.close(); server.close(); }
})().catch(e => { console.error(e); process.exitCode = 1; });
