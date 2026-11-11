// Giao diện thật (Chromium) của tab «Dọn nhà · Sinh tồn» với IPC giả; không gọi Muse, không chạy FFmpeg.
const pw = (() => { try { return require('playwright-core'); } catch { return require('playwright'); } })();
const http = require('http'), fs = require('fs/promises'), path = require('path'), assert = require('assert/strict');
(async () => {
  const files = { '/assets/muse-studio.svg': 'assets/muse-studio.svg', '/assets/zalo-qr.jpg': 'assets/zalo-qr.jpg', '/': 'index.html', '/style.css': 'style.css', '/renderer.js': 'renderer.js', '/ui-i18n.js': 'ui-i18n.js', '/script-planner.js': 'script-planner.js', '/prompt-import.js': 'prompt-import.js', '/reference-map.js': 'reference-map.js', '/story-plan.js': 'story-plan.js', '/story-ui.js': 'story-ui.js', '/restore-plan.js': 'restore-plan.js', '/restore-ui.js': 'restore-ui.js' };
  const server = http.createServer(async (req, res) => {
    const name = files[req.url];
    if (!name) { res.writeHead(404); return res.end(); }
    res.setHeader('Content-Type', name.endsWith('.jpg') ? 'image/jpeg' : name.endsWith('.svg') ? 'image/svg+xml' : name.endsWith('.js') ? 'application/javascript' : name.endsWith('.css') ? 'text/css' : 'text/html');
    res.end(await fs.readFile(path.join(__dirname, '../src', name)));
  });
  await new Promise(r => server.listen(0, '127.0.0.1', r));
  const browser = await pw.chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined, headless: true, args: ['--no-sandbox'] });
  try {
    const page = await browser.newPage({ viewport: { width: 1450, height: 1500 } }), errors = [];
    page.on('pageerror', e => errors.push(e.message)); page.on('dialog', d => d.accept());
    await page.addInitScript(() => {
      localStorage.setItem('museStudio.language', localStorage.getItem('testLang') || 'vi');
      const s = {
        version: '1.7.10', active: false, paused: true, jobs: [],
        license: { status: 'active', plan: 'short', longTerm: false, device: 'TESTDEVICE', expiresAt: Date.now() + 86400000 * 30, message: 'Đã kích hoạt key.' },
        story: { busy: false, progress: '', error: '', output: '', srt: '', notes: [], voice: { setupBusy: false, setupMessage: '', setupError: '', ready: { edge: false, clone: false }, platform: 'win32', edgeVoices: [], clones: [] } },
        restore: { busy: false, progress: '', error: '', storyId: '', stories: {} },
        settings: { browserChoice: 'builtin', browserPath: '', output: 'C:\\Videos', autoMerge: false, autoPackage: false, ffmpeg: 'ffmpeg', accountCount: 1, composer: 'textarea', fileInput: 'input[type=file]', submit: 'button[type=submit]' }
      };
      window.calls = []; window.s = s; let listener, id = 100;
      window.push = () => listener(structuredClone(s));
      window.studio = {
        onUpdate: fn => listener = fn,
        invoke: async (name, data) => {
          window.calls.push({ name, data: JSON.parse(JSON.stringify(data ?? null)) });
          if (name === 'restoreCreate') {
            const storyId = 'Don-nha-1';
            s.jobs.push(...data.jobs.map((j, i) => ({ ...j, storyId, id: String(++id), status: 'pending', stage: 'pending', order: i + 1 })));
            s.restore.stories[storyId] = { ...data.meta };
            return { storyId, count: data.jobs.length };
          }
          if (name === 'images') return ['C:\\Refs\\nha.jpg'];
          if (name === 'chooseMusic') return 'C:\\Music\\nen.mp3';
          return structuredClone(s);
        }
      };
    });
    await page.goto(`http://127.0.0.1:${server.address().port}/`);
    await page.waitForSelector('#navRestore');
    const calls = name => page.evaluate(n => window.calls.filter(c => c.name === n), name);

    // 1) Gói 30 ngày: có tab nhưng bị khóa, không có ô tạo cảnh.
    await page.click('#navRestore');
    assert.equal(await page.locator('#restorePanel').isVisible(), true);
    assert.equal(await page.locator('#restoreLock').isVisible(), true, 'gói 30 ngày thấy khóa');
    assert.equal(await page.locator('#restoreBody').isVisible(), false);
    assert.match(await page.locator('#restoreLockText').textContent(), /gói Năm hoặc Vĩnh viễn/);

    // 2) Gói Năm: mở khóa.
    await page.evaluate(() => { window.s.license = { status: 'active', plan: 'year', longTerm: true, device: 'T', expiresAt: Date.now() + 86400000 * 365, message: 'Đã kích hoạt key (gói Năm).' }; window.push(); });
    await page.waitForSelector('#restoreBody', { state: 'visible' });
    assert.equal(await page.locator('#restoreLock').isVisible(), false);

    // Chủ đề: «cả ngôi nhà» đứng đầu và được chọn sẵn; có đủ 9 chủ đề.
    const chips = await page.$$eval('#restoreTheme .chip', els => els.map(e => [e.dataset.theme, e.getAttribute('aria-pressed')]));
    assert.equal(chips.length, 9);
    assert.deepEqual(chips[0], ['house_full', 'true']);
    assert.match(await page.locator('#restoreHint').textContent(), /TOÀN CẢNH/);
    // Nhà đi từ ngoài vào trong: không cho cố định một góc.
    await page.evaluate(() => { document.getElementById('restoreMore').open = true; });
    assert.equal(await page.locator('#restoreCamera').isDisabled(), true);
    assert.equal(await page.locator('#restoreCamera').inputValue(), 'varied');
    // Mặc định: có người, có mặt, một cảnh dài 8 giây, ngang 16:9.
    assert.equal(await page.locator('#restorePerson').isChecked(), true);
    assert.equal(await page.locator('#restoreFaceless').isChecked(), false);
    assert.equal(await page.locator('#restoreAspect').inputValue(), '16:9');

    // Số phút → số cảnh.
    const minutes = await page.$$eval('#restoreMinutes option', els => els.map(e => e.value));
    assert.deepEqual(minutes, ['1', '2', '3', '5', '8', '10', '15', '20', '30', '40', '45', '50', '60', '90', '120']);
    await page.selectOption('#restoreMinutes', '5');
    assert.match(await page.locator('#restoreCount').textContent(), /38 cảnh × 8 giây ≈ 5,1 phút|38 cảnh × 8 giây ≈ 5\.1 phút/);
    await page.selectOption('#restoreMinutes', '30');
    assert.equal(await page.locator('#restoreSecs').inputValue(), '10');
    assert.equal(await page.locator('#restoreSecs').isDisabled(), true, 'từ 20 phút ép 10 giây');
    assert.match(await page.locator('#restoreCount').textContent(), /180 cảnh × 10 giây ≈ 30 phút/);
    await page.selectOption('#restoreMinutes', '45');
    assert.match(await page.locator('#restoreCount').textContent(), /270 cảnh × 10 giây ≈ 45 phút/);
    await page.selectOption('#restoreMinutes', '120');
    const long = await page.locator('#restoreCount').textContent();
    assert.match(long, /720 cảnh × 10 giây ≈ 120 phút/);
    assert.match(long, /720 cảnh nối tiếp là rất nhiều/);
    assert.match(long, /GB ổ đĩa/);

    // Chạy song song: ô chọn mặc định «Tự động»; một tài khoản thì 1 chuỗi, nhiều tài khoản (chế độ song song) thì chia đoạn.
    assert.deepEqual(await page.$$eval('#restoreParallel option', els => els.map(e => e.value)), ['auto', '1', '2', '3', '4', '5', '6', '8', '10']);
    assert.equal(await page.locator('#restoreParallel').inputValue(), 'auto');
    await page.selectOption('#restoreMinutes', '30');
    assert.doesNotMatch(await page.locator('#restoreCount').textContent(), /Chạy song song/);
    await page.evaluate(() => { window.s.settings.dispatchMode = 'parallel'; window.s.settings.accountCount = 3; window.push(); });
    await page.waitForFunction(() => /Chạy song song 3 đoạn trên 3 tài khoản/.test(document.getElementById('restoreCount').textContent));
    await page.selectOption('#restoreParallel', '1');
    assert.match(await page.locator('#restoreCount').textContent(), /Đang chạy 1 chuỗi/);
    await page.selectOption('#restoreParallel', 'auto');
    await page.evaluate(() => { window.s.settings.dispatchMode = 'sequential'; window.s.settings.accountCount = 1; window.push(); });
    await page.waitForFunction(() => !/Chạy song song/.test(document.getElementById('restoreCount').textContent));
    await page.selectOption('#restoreMinutes', '120');

    // Chủ đề sinh tồn: người luôn có, không tắt được; chủ đề khác cho cố định góc quay.
    await page.click('#restoreTheme [data-theme="cabin"]');
    assert.equal(await page.locator('#restorePerson').isChecked(), true);
    assert.equal(await page.locator('#restorePerson').isDisabled(), true);
    assert.equal(await page.locator('#restoreCamera').isDisabled(), false);
    await page.click('#restoreTheme [data-theme="house_full"]');
    assert.equal(await page.locator('#restorePerson').isDisabled(), false);

    // Chặn tên người nổi tiếng / nhân vật: cảnh báo ngay khi gõ, và không tạo cảnh.
    await page.fill('#restorePlace', 'phòng khách có poster Spider-Man và Trump');
    assert.match(await page.locator('#restoreCount').textContent(), /người nổi tiếng hoặc nhân vật có bản quyền/);
    await page.selectOption('#restoreMinutes', '2');
    await page.click('#restoreCreate');
    assert.equal((await calls('restoreCreate')).length, 0, 'bị chặn, chưa gọi restoreCreate');
    await page.fill('#restorePlace', 'căn nhà gạch hai tầng trên đồi, cỏ cao quá đầu');
    assert.doesNotMatch(await page.locator('#restoreCount').textContent(), /người nổi tiếng/);

    // Người trong video: ô chọn hiện ngay ở màn hình chính, mặc định NỮ; chọn Nam / Giống ảnh gốc đổi mô tả; «giống ảnh» mà chưa có ảnh thì không tạo.
    assert.equal(await page.locator('#restoreWho').isVisible(), true, 'ô chọn người nằm ở màn hình chính, không giấu trong Tùy chọn thêm');
    assert.equal(await page.locator('#restoreWho').inputValue(), 'female');
    assert.deepEqual(await page.$$eval('#restoreWho option', els => els.map(e => e.value)), ['female', 'male', 'photo']);
    assert.match(await page.locator('#restorePersonDesc').getAttribute('placeholder'), /woman/);
    await page.selectOption('#restoreWho', 'male');
    assert.match(await page.locator('#restorePersonDesc').getAttribute('placeholder'), /\bman\b/);
    await page.selectOption('#restoreWho', 'photo');
    assert.match(await page.locator('#restorePersonDesc').getAttribute('placeholder'), /attached reference photo/);
    await page.click('#restoreCreate');
    await page.waitForTimeout(200);
    assert.equal((await calls('restoreCreate')).length, 0, 'giống người trong ảnh mà chưa chọn ảnh thì bị chặn');
    await page.selectOption('#restoreWho', 'female');
    await page.evaluate(() => { document.getElementById('restorePerson').checked = false; document.getElementById('restorePerson').dispatchEvent(new Event('change')); });
    assert.equal(await page.locator('#restoreWho').isVisible(), false, 'tắt «có người» thì ẩn ô chọn người');
    await page.evaluate(() => { document.getElementById('restorePerson').checked = true; document.getElementById('restorePerson').dispatchEvent(new Event('change')); });
    assert.equal(await page.locator('#restoreWho').isVisible(), true);

    // Ảnh gốc + nhạc nền.
    await page.click('#restorePhoto');
    await page.waitForFunction(() => /nha\.jpg/.test(document.getElementById('restorePhotoName').textContent));
    await page.click('#restoreMusic');
    await page.waitForFunction(() => /nen\.mp3/.test(document.getElementById('restoreMusicName').textContent));

    // Tạo cảnh: đúng 15 cảnh, cảnh 1 từ ảnh, cảnh sau lấy khung cuối cảnh trước, meta đúng.
    await page.selectOption('#restoreAspect', '9:16');
    await page.fill('#restoreName', 'Nhà ma thành biệt thự');
    await page.click('#restoreCreate');
    await page.waitForFunction(() => window.calls.some(c => c.name === 'restoreCreate'));
    const [create] = await calls('restoreCreate');
    assert.equal(create.data.jobs.length, 15);
    assert.ok(create.data.jobs.every(j => j.kind === 'restore' && j.phase === 'clip' && j.prompt.includes('căn nhà gạch hai tầng') && j.prompt.includes('LOCKED')), 'mọi cảnh có sổ cảnh giống nhau');
    assert.deepEqual(create.data.jobs[0].refList, [{ file: 'C:\\Refs\\nha.jpg' }]);
    assert.deepEqual(create.data.jobs[1].refList, [{ phase: 'clip', number: 1, part: 'lastFrame' }]);
    assert.equal(create.data.meta.aspect, '9:16');
    assert.ok(create.data.jobs.every(j => /woman/.test(j.prompt)), 'mặc định người nữ ở mọi cảnh');
    assert.equal(create.data.meta.name, 'Nhà ma thành biệt thự');
    assert.match(create.data.idBase, /^Nha-ma-thanh-biet-thu/);
    assert.equal(await page.locator('#restoreName').inputValue(), '', 'ô tên được xóa sau khi tạo');
    assert.equal(create.data.meta.music, 'C:\\Music\\nen.mp3');
    assert.equal(create.data.meta.auto, true);
    assert.match(create.data.jobs[0].prompt, /aspect ratio 9:16/);
    assert.match(create.data.jobs[3].prompt, /căn nhà gạch hai tầng/);

    // Nút chung như tab Truyện: «Chạy hàng đợi / Tiếp tục» và «Dừng» vẫn có ở tab này, gửi kind=restore.
    await page.evaluate(() => window.push());
    assert.equal(await page.locator('#start').isVisible(), true);
    assert.equal(await page.locator('#pause').isVisible(), true);
    await page.click('#start');
    await page.waitForFunction(() => window.calls.some(c => c.name === 'start'));
    assert.equal((await calls('start')).at(-1).data.kind, 'restore');
    await page.evaluate(() => { window.s.active = true; window.s.paused = false; window.push(); });
    await page.waitForSelector('#restoreRuns button:has-text("Dừng")');
    await page.click('#restoreRuns button:has-text("Dừng")');
    await page.waitForFunction(() => window.calls.some(c => c.name === 'stop'));
    await page.evaluate(() => { window.s.active = false; window.s.paused = true; window.s.jobs[0].status = 'failed'; window.s.jobs[0].startedAt = new Date().toISOString(); window.push(); });
    await page.waitForSelector('#restoreRuns button:has-text("Tạo tiếp")');
    await page.click('#restoreRuns button:has-text("Tạo tiếp")');
    await page.waitForFunction(() => window.calls.filter(c => c.name === 'start').length >= 2);
    assert.equal((await calls('start')).at(-1).data.kind, 'restore');
    await page.evaluate(() => { window.s.jobs[0].status = 'pending'; window.push(); });

    // Thẻ chạy: tiến độ, nút dựng video khi đủ cảnh.
    await page.evaluate(() => { for (const j of window.s.jobs) { j.status = 'completed'; j.output = 'C:\\Videos\\DonNha\\Don-nha-1\\' + j.number + '.mp4'; } window.push(); });
    await page.waitForSelector('#restoreRuns .restoreRun');
    assert.match(await page.locator('#restoreRuns .restoreRun').first().textContent(), /15\/15 cảnh/);
    assert.match(await page.locator('#restoreRuns').textContent(), /Dựng video/);
    // Sau khi dựng xong: nút «Lưu video…» mở hộp lưu (IPC restoreSave) và báo nơi đã lưu.
    await page.evaluate(() => { window.s.restore.stories['Don-nha-1'].output = 'C:\\Videos\\DonNha\\Don-nha-1\\Nha ma.mp4'; window.push(); });
    await page.waitForSelector('#restoreRuns button:has-text("Lưu video…")');
    await page.evaluate(() => { const original = window.studio.invoke; window.studio.invoke = async (n, d) => n === 'restoreSave' ? (window.calls.push({ name: n, data: d }), { file: 'D:\\Video của tôi\\Nhà mới.mp4' }) : original(n, d); });
    await page.click('#restoreRuns button:has-text("Lưu video…")');
    await page.waitForFunction(() => window.calls.some(c => c.name === 'restoreSave'));
    assert.equal((await calls('restoreSave'))[0].data.storyId, 'Don-nha-1');
    await page.waitForFunction(() => /Nhà mới\.mp4/.test(document.body.textContent));
    await page.evaluate(() => { delete window.s.restore.stories['Don-nha-1'].output; window.push(); });
    await page.click('#restoreRuns button:has-text("Dựng video")');
    await page.waitForFunction(() => window.calls.some(c => c.name === 'restoreBuild'));
    assert.equal((await calls('restoreBuild'))[0].data.storyId, 'Don-nha-1');

    // Tạo khi có 3 tài khoản chạy song song: chia đoạn, có ảnh mốc, meta.seams đúng, mọi cảnh gắn cùng sổ cảnh.
    await page.evaluate(() => { window.s.jobs.length = 0; window.s.settings.dispatchMode = 'parallel'; window.s.settings.accountCount = 3; window.push(); });
    await page.selectOption('#restoreMinutes', '10');
    await page.waitForFunction(() => /Chạy song song 3 đoạn/.test(document.getElementById('restoreCount').textContent));
    await page.click('#restoreCreate');
    await page.waitForFunction(() => window.calls.filter(c => c.name === 'restoreCreate').length >= 2);
    const par = (await calls('restoreCreate')).at(-1).data;
    assert.equal(par.meta.seams.length, 2, 'ba đoạn thì có hai chỗ nối');
    assert.equal(par.jobs.filter(j => j.phase === 'image').length, 2, 'hai ảnh mốc cho hai đoạn sau (ảnh gốc có sẵn nên không tạo ảnh nền)');
    assert.equal(par.jobs.filter(j => j.phase === 'clip').length, 75);
    assert.ok(par.jobs.every(j => j.kind === 'restore'));
    const firstOfSegment = par.jobs.find(j => j.phase === 'clip' && j.number === par.meta.seams[0] + 1);
    assert.ok(firstOfSegment.needs.some(n => n.phase === 'image'), 'đầu đoạn 2 chờ ảnh mốc, không chờ khung cuối của clip trước');
    assert.ok(!firstOfSegment.needs.some(n => n.phase === 'clip'));

    // Tiếng Anh: chữ động đổi theo ngôn ngữ.
    await page.evaluate(() => { localStorage.setItem('testLang', 'en'); });
    await page.reload();
    await page.waitForSelector('#navRestore');
    await page.click('#navRestore');
    await page.waitForSelector('#restoreTheme .chip');
    assert.match(await page.locator('#restoreTheme .chip').first().textContent(), /^Abandoned house · the whole house/);
    assert.match(await page.locator('#restoreHint').textContent(), /WIDE view/);
    assert.match(await page.locator('#navRestore').textContent(), /House cleanup · Survival/);
    assert.match(await page.locator('#restoreCount').textContent(), /\d+ scenes × \d+ s/);
    assert.match(await page.locator('#restoreCreate').textContent(), /Create and run automatically/);
    assert.match(await page.locator('#restoreFacelessLine').textContent(), /Hide the face/);
    assert.equal(errors.length, 0, errors.join('\n'));
    console.log('restore tab smoke ok');
  } finally { await browser.close(); server.close(); }
})().catch(e => { console.error(e); process.exit(1); });
