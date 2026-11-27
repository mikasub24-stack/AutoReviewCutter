// Giao diện thật (Chromium) của mục «Tác vụ» và nạp video lười ở thẻ cảnh, IPC giả; không gọi Muse, không chạy FFmpeg.
const pw = (() => { try { return require('playwright-core'); } catch { return require('playwright'); } })();
const http = require('http'), fs = require('fs/promises'), path = require('path'), assert = require('assert/strict');
(async () => {
  const names = ['story-plan.js', 'story-ui.js', 'restore-plan.js', 'restore-ui.js', 'wild-plan.js', 'wild-ui.js', 'pair-plan.js', 'pair-ui.js', 'tasks-ui.js', 'script-planner.js', 'prompt-import.js', 'reference-map.js', 'ui-i18n.js', 'renderer.js', 'style.css'];
  const files = { '/assets/muse-studio.svg': 'assets/muse-studio.svg', '/assets/zalo-qr.jpg': 'assets/zalo-qr.jpg', '/': 'index.html' };
  for (const n of names) files['/' + n] = n;
  const server = http.createServer(async (req, res) => {
    const name = files[req.url.split('?')[0]];
    if (!name) { res.writeHead(404); return res.end(); }
    res.setHeader('Content-Type', name.endsWith('.jpg') ? 'image/jpeg' : name.endsWith('.svg') ? 'image/svg+xml' : name.endsWith('.js') ? 'application/javascript' : name.endsWith('.css') ? 'text/css' : 'text/html');
    res.end(await fs.readFile(path.join(__dirname, '../src', name)));
  });
  await new Promise(r => server.listen(0, '127.0.0.1', r));
  const browser = await pw.chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined, headless: true, args: ['--no-sandbox'] });
  try {
    const page = await browser.newPage({ viewport: { width: 1450, height: 900 } }), errors = [];
    page.on('pageerror', e => errors.push(e.message)); page.on('dialog', d => d.accept());
    await page.addInitScript(() => {
      localStorage.setItem('museStudio.language', 'vi');
      const mk = (kind, storyId, n, status, extra = {}) => Array.from({ length: n }, (_, i) => ({ id: `${storyId}-${i + 1}`, kind, storyId, phase: 'clip', number: i + 1, title: `Mốc ${i + 1}`, prompt: 'p', status: typeof status === 'function' ? status(i) : status, stage: 'x', order: i + 1, references: [], needs: [], refList: [], createdAt: 1700000000000 + i, startedAt: 1700000000000, output: typeof status === 'function' || status === 'completed' ? `C:\\Videos\\SoSanh\\${storyId}\\${String(i + 1).padStart(3, '0')}.mp4` : '', ...extra }));
      const s = {
        version: '1.15.12', active: false, paused: true,
        jobs: [
          ...mk('pair', 'SS-Done', 4, 'completed'),
          ...mk('pair', 'SS-Open', 132, i => (i < 130 ? 'completed' : 'failed')),
          ...mk('wild', 'DV-Ready', 6, 'completed'),
          ...mk('restore', 'DN-Done', 3, 'completed'),
          ...mk('video', 'x', 2, 'pending', { storyId: '' })
        ],
        license: { status: 'active', plan: 'forever', longTerm: true, device: 'T', expiresAt: 0, message: 'ok' },
        story: { busy: false, progress: '', error: '', output: '', srt: '', notes: [], voice: { setupBusy: false, setupMessage: '', setupError: '', ready: { edge: true, clone: false }, platform: 'win32', edgeVoices: [], clones: [] } },
        restore: { busy: false, progress: '', error: '', storyId: '', stories: { 'DN-Done': { name: 'Dọn nhà xong', output: 'C:\\Videos\\DonNha\\DN-Done\\video.mp4', createdAt: 1700000500000 } } },
        wild: { busy: false, phase: '', progress: '', error: '', storyId: '', stories: { 'DV-Ready': { name: 'Phim cáo', createdAt: 1700000400000 } }, write: {}, build: {} },
        pair: { busy: false, phase: '', progress: '', error: '', storyId: '', write: {}, stories: {
          'SS-Done': { name: 'Video so sánh đã dựng', output: 'C:\\Videos\\SoSanh\\SS-Done\\video.mp4', createdAt: 1700000300000 },
          'SS-Open': { name: 'Video dở 130/132', status: 'queued', createdAt: 1700000600000 },
          'SS-Writing': { name: 'Kịch bản dở', status: 'writing', createdAt: 1700000100000 }
        } },
        maphist: { busy: false, runId: '', runs: { 'M-1': { title: 'Bản đồ Anh', status: 'done', output: 'C:\\Videos\\BanDo\\M-1\\video.mp4', createdAt: 1700000200000 }, 'M-2': { title: 'Bản đồ dở', status: 'script', createdAt: 1700000250000 } }, write: {}, build: {} },
        flow: { open: false, opening: false },
        settings: { browserChoice: 'builtin', browserPath: '', output: 'C:\\Videos', autoMerge: false, autoPackage: false, ffmpeg: 'ffmpeg', accountCount: 1, flowProjectUrl: '', flowModel: 'lite', flowParallel: 3, composer: 'textarea', fileInput: 'input[type=file]', video: 'video', image: 'img', storyRuns: {} }
      };
      window.calls = []; window.s = s; let listener;
      window.push = () => listener(structuredClone(s));
      window.studio = {
        onUpdate: fn => listener = fn,
        invoke: async (name, data) => {
          window.calls.push({ name, data: JSON.parse(JSON.stringify(data ?? null)) });
          if (name === 'pairRemove') {
            delete s.pair.stories[data.storyId]; s.jobs = s.jobs.filter(j => !(j.kind === 'pair' && j.storyId === data.storyId));
            return structuredClone(s);
          }
          if (name === 'start') { s.active = true; return structuredClone(s); }
          return structuredClone(s);
        }
      };
    });
    await page.goto(`http://127.0.0.1:${server.address().port}/`);
    await page.waitForSelector('#navTasks');
    const calls = name => page.evaluate(n => window.calls.filter(c => c.name === n), name);
    const flush = () => page.evaluate(() => new Promise(r => setTimeout(r, 150)));
    await page.evaluate(() => window.push()); await flush();

    // 1) Mục «Tác vụ» nằm đầu thanh bên, hiện số tác vụ và đánh dấu có việc dở.
    assert.equal(await page.locator('nav button').first().getAttribute('id'), 'navTasks');
    await page.click('#navTasks'); await flush();
    assert.equal(await page.locator('#tasksPanel').isVisible(), true);
    assert.equal(await page.locator('#queueWorkspace').isVisible(), false, 'danh sách cảnh bị ẩn khi xem Tác vụ');
    assert.equal(await page.locator('#jobs > *').count(), 0, 'không vẽ thẻ cảnh khi xem Tác vụ');
    const rows = await page.locator('#tasksList .taskRow').allInnerTexts();
    assert.equal(rows.length, 8, 'pair ×3, wild, restore, 2 bản đồ, 1 hàng đợi video: ' + rows.length);
    const titles = await page.locator('#tasksList .taskTitle').allTextContents();
    assert.ok(titles.includes('Video dở 130/132') && titles.includes('Video so sánh đã dựng') && titles.includes('Kịch bản dở') && titles.includes('Phim cáo') && titles.includes('Bản đồ Anh') && titles.includes('Bản đồ dở') && titles.includes('Hàng đợi tạo video'), titles.join(' | '));
    const open = await page.locator('#tasksList .taskRow', { hasText: 'Video dở 130/132' }).innerText();
    assert.match(open, /130\/132 clip/); assert.match(open, /Dở · có cảnh lỗi/);
    assert.match(await page.locator('#tasksList .taskRow', { hasText: 'Video so sánh đã dựng' }).innerText(), /Hoàn thành · video đã dựng/);
    assert.match(await page.locator('#tasksList .taskRow', { hasText: 'Phim cáo' }).innerText(), /Đủ clip · chưa dựng video/);
    assert.match(await page.locator('#tasksList .taskRow', { hasText: 'Kịch bản dở' }).innerText(), /kịch bản chưa viết xong/);
    assert.equal(await page.locator('#navTasksCount').evaluate(n => n.classList.contains('hasOpen')), true);
    // Dở lên đầu, đã hoàn thành xuống cuối.
    const kinds = await page.locator('#tasksList .taskRow').evaluateAll(n => n.map(x => x.className.replace('taskRow ', '')));
    assert.ok(kinds.indexOf('done') > kinds.lastIndexOf('open'), 'việc dở nằm trước việc đã xong: ' + kinds.join(','));

    // 2) Bộ lọc.
    await page.click('.taskFilter:has-text("Hoàn thành")'); await flush();
    assert.equal(await page.locator('#tasksList .taskRow.done').count(), await page.locator('#tasksList .taskRow').count());
    await page.click('.taskFilter:has-text("Chưa xong")'); await flush();
    assert.equal(await page.locator('#tasksList .taskRow.done').count(), 0);
    await page.click('.taskFilter:has-text("Tất cả")'); await flush();

    // 3) Nút: Tạo tiếp, Mở thư mục, Xem video, Xóa, Mở tab.
    const openRow = page.locator('#tasksList .taskRow', { hasText: 'Video dở 130/132' });
    await openRow.locator('button:has-text("Tạo tiếp")').click(); await flush();
    assert.deepEqual((await calls('start')).at(-1).data, { kind: 'pair' });
    await page.evaluate(() => { window.s.active = false; window.push(); }); await flush();
    await openRow.locator('button:has-text("Mở thư mục")').click(); await flush();
    assert.deepEqual((await calls('pairReveal')).at(-1).data, { storyId: 'SS-Open' });
    const doneRow = page.locator('#tasksList .taskRow', { hasText: 'Video so sánh đã dựng' });
    await doneRow.locator('button:has-text("Xem video")').click(); await flush();
    assert.match(await page.locator('.taskVideoDialog video').getAttribute('src'), /^file:\/\/\/C:\/Videos\/SoSanh\/SS-Done\/video\.mp4$/);
    await page.click('.taskVideoDialog button:has-text("✕")'); await flush();
    assert.equal(await page.locator('.taskVideoDialog').count(), 0, 'đóng hộp xem video thì gỡ khỏi trang');
    await doneRow.locator('button:has-text("Lưu video")').click(); await flush();
    assert.deepEqual((await calls('pairSave')).at(-1).data, { storyId: 'SS-Done' });
    await doneRow.locator('button:has-text("Xóa")').click();
    await page.waitForSelector('#deleteOk'); await page.click('#deleteOk'); await flush();
    assert.deepEqual((await calls('pairRemove')).at(-1).data, { storyId: 'SS-Done', deleteFiles: false });
    await page.waitForFunction(() => ![...document.querySelectorAll('#tasksList .taskRow')].some(r => r.textContent.includes('Video so sánh đã dựng')), null, { timeout: 15000 });   // danh sách vẽ lại sau lời gọi xóa: chờ, không đếm ngay
    assert.equal(await page.locator('#tasksList .taskRow', { hasText: 'Video so sánh đã dựng' }).count(), 0, 'video đã xóa biến khỏi danh sách');
    await page.locator('#tasksList .taskRow', { hasText: 'Phim cáo' }).locator('button:has-text("Mở tab")').click(); await flush();
    assert.equal(await page.locator('#wildPanel').isVisible(), true);
    assert.equal(await page.locator('#tasksPanel').isVisible(), false);

    // 4) Nạp video lười: tab So sánh có 132 thẻ clip đã xong nhưng chỉ vài video được nạp (gần vùng nhìn thấy), không phải cả trăm.
    await page.click('#navPair'); await flush(); await page.waitForTimeout(400);
    const cards = await page.locator('#jobs .resultVideo').count();
    const loaded = await page.locator('#jobs video[src]').count();
    assert.ok(cards >= 130, 'có đủ thẻ video: ' + cards);
    assert.ok(loaded > 0 && loaded <= 30, `chỉ nạp video gần vùng nhìn thấy: ${loaded}/${cards}`);
    // Kéo xuống cuối: video ở xa được nhả, số video đang nạp vẫn nhỏ.
    await page.evaluate(() => { const box = document.querySelector('#jobs').closest('.queueWorkspace, main, section') || document.scrollingElement; for (const el of [document.scrollingElement, document.querySelector('main'), document.querySelector('#jobs')]) if (el) el.scrollTop = el.scrollHeight; });
    await page.waitForTimeout(600);
    assert.ok(await page.locator('#jobs video[src]').count() <= 30, 'kéo xuống vẫn không nạp cả trăm video');

    // 5) Quay lại Tác vụ: thẻ cảnh bị gỡ, video được nhả hết.
    await page.click('#navTasks'); await flush();
    assert.equal(await page.locator('#jobs video[src]').count(), 0);
    assert.deepEqual(errors, [], errors.join('\n'));
    console.log('tasks-smoke ok');
  } finally { await browser.close(); server.close(); }
})().catch(e => { console.error(e); process.exit(1); });
