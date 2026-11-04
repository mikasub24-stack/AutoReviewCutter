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
    assert.equal(await page.locator('#storyHead').textContent(), '1. Lời quảng cáo');
    assert.equal(await page.locator('#storyRefs').textContent(), 'Chọn ảnh sản phẩm');
    assert.match(await page.locator('#storyCharLabel').textContent(), /Người mẫu/);
    assert.match(await page.locator('#storyRefPaste').textContent(), /ảnh sản phẩm/);
    assert.match(await page.locator('#storyRefInfo').textContent(), /Chưa chọn ảnh sản phẩm/);
    assert.match(await page.locator('#storyInfo').textContent(), /Muse viết lời quảng cáo/);
    assert.equal(await page.locator('#adTone option').count(), 5);
    assert.deepEqual(await page.locator('#adLength option').allTextContents(), ['15 giây', '30 giây', '45 giây', '60 giây']);
    assert.equal(await page.locator('#adLength').inputValue(), '30');
    assert.equal(await page.locator('#adCamera .chip').count(), 9);
    assert.equal(await page.locator('#adLook .chip').count(), 6);

    // 3. Chọn máy quay (tối đa 3) và phong cách.
    const chip = (box, text) => page.locator(`#${box} .chip:has-text("${text}")`);
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
    assert.deepEqual(write.ad, { product: 'Bình giữ nhiệt Aqua 500ml', points: 'Giữ nóng 12 giờ\nNắp chống tràn', audience: 'Dân văn phòng', offer: '', cta: 'Bấm vào giỏ hàng để xem chi tiết', tone: 'warm', length: 45, camera: ['macro', 'orbit'], look: 'ugc' });
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
    assert.equal(await page.locator('#storyHead').textContent(), '1. Lời quảng cáo');
    assert.equal(await page.locator('#adProduct').inputValue(), 'Bình giữ nhiệt Aqua 500ml');
    assert.equal(await page.locator('#adPoints').inputValue(), 'Giữ nóng 12 giờ\nNắp chống tràn');
    assert.equal(await page.locator('#adTone').inputValue(), 'warm');
    assert.equal(await page.locator('#adLength').inputValue(), '45');
    assert.deepEqual(await page.locator('#adCamera .chip[aria-pressed=true]').allTextContents(), ['Cận cảnh chi tiết', 'Xoay quanh']);
    assert.deepEqual(await page.locator('#adLook .chip[aria-pressed=true]').allTextContents(), ['Review đời thường']);

    // 12. Tiếng Anh: nút chuyển chế độ, nhãn, chip, độ dài, nút viết lời, gợi ý và thông báo đều được dịch.
    await page.locator('#languagePicker').selectOption('en');
    await page.waitForFunction(() => document.documentElement.lang === 'en' && document.getElementById('adWrite').textContent === 'Muse writes the ad script');
    assert.equal(await page.locator('#modeAd').textContent(), 'Product ad');
    assert.equal(await page.locator('#modeStory').textContent(), 'Story');
    assert.equal(await page.locator('#storyHead').textContent(), '1. Ad script');
    assert.equal(await page.locator('#storyRefs').textContent(), 'Choose product image');
    assert.match(await page.locator('#storyCharLabel').textContent(), /Model \/ user \(optional\)/);
    assert.match(await page.locator('label:has(#adProduct)').textContent(), /Product name/);
    assert.match(await page.locator('label:has(#adPoints)').textContent(), /Selling points \(one per line\)/);
    assert.deepEqual(await page.locator('#adLength option').allTextContents(), ['15 seconds', '30 seconds', '45 seconds', '60 seconds']);
    assert.deepEqual(await page.locator('#adCamera .chip').allTextContents(), ['Macro close-up', 'Dolly in', 'Pull back', 'Orbit', 'Pan', 'Top-down', 'Slow motion', 'Handheld', 'Static']);
    assert.deepEqual(await page.locator('#adLook .chip').allTextContents(), ['TV commercial', 'Cinematic', 'Everyday review (UGC)', 'Minimal, plain background', 'Bright and young', 'Luxury']);
    assert.equal(await page.locator('#adTone option').first().textContent(), 'Enthusiastic, persuasive');
    assert.match(await page.locator('#storyRefInfo').textContent(), /No product image chosen/);
    assert.equal(await page.locator('#adProduct').getAttribute('placeholder'), 'e.g. Aqua 500 ml thermos bottle');
    assert.match(await page.locator('#storyScript').getAttribute('placeholder'), /Click “Muse writes the ad script” above/);
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
    console.log('PASS: product-ad mode — mode switch and texts, camera/look chips (max 3 cameras), product fields persisted, Muse ad-script request data + busy state + errors, overwrite confirm, quick-split ad prompt, ad data only in ad mode, product image on every scene, English labels. Mock IPC; Muse replies are canned by the test, not the real Muse.');
  } finally { await browser.close(); server.close(); }
})().catch(e => { console.error(e); process.exitCode = 1; });
