// Vẽ song song bằng trình duyệt thật: mỗi cửa sổ vẽ phần khung của mình qua MapRender.run; gộp lại phải ra CÙNG MỘT HÌNH với một cửa sổ vẽ cả video
// (so từng khung sau khi giải mã JPEG, cho phép lệch nhiễu ≤ 3/255 do bộ vẽ canvas có thể đổi giữa GPU và CPU sau vài khung).
const pw = (() => { try { return require('playwright-core'); } catch { return require('playwright'); } })();
const http = require('http'), fs = require('fs/promises'), zlib = require('zlib'), path = require('path'), assert = require('assert/strict');
(async () => {
  const src = path.join(__dirname, '../src');
  const world = zlib.gunzipSync(await fs.readFile(path.join(src, 'assets/maphist/world.json.gz')));
  const categories = JSON.parse(await fs.readFile(path.join(__dirname, '../tools/maphist-categories.json'), 'utf8'));
  const type = n => n.endsWith('.ttf') ? 'font/ttf' : n.endsWith('.otf') ? 'font/otf' : n.endsWith('.js') ? 'application/javascript' : 'text/html';
  const server = http.createServer(async (req, res) => {
    if (req.url === '/world.json') { res.setHeader('Content-Type', 'application/json'); return res.end(world); }
    const name = req.url === '/' ? 'maphist-render.html' : req.url.slice(1);
    if (!/^(maphist-[a-z]+\.(js|html)|assets\/maphist\/fonts\/[\w.-]+\.(ttf|otf))$/.test(name)) { res.writeHead(404); return res.end(); }
    res.setHeader('Content-Type', type(name));
    res.end(await fs.readFile(path.join(src, name)));
  });
  await new Promise(r => server.listen(0, '127.0.0.1', r));
  const base = `http://127.0.0.1:${server.address().port}`;
  const browser = await pw.chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined, headless: true, args: ['--no-sandbox'] });
  try {
    const rawWorld = JSON.parse(world.toString('utf8'));
    for (const theme of ['cartoon', 'classic']) {
      const script = JSON.parse(JSON.stringify(categories.find(c => c.id === 'country').sample.script)); script.theme = theme; script.eras = script.eras.slice(0, 1);
      // Một cửa sổ = một trang riêng với cầu nối giả: mỗi khung được băm ngay trong trang.
      const render = async (worker, workers) => {
        const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
        const errors = []; page.on('pageerror', e => errors.push(e.message));
        await page.goto(base + '/');
        await page.waitForFunction('window.__mapRenderReady===true');
        const out = await page.evaluate(async ({ raw, script, worker, workers }) => {
          const geo = maphistGeo.build(raw), n = maphistPlan.normalizeScript(script, geo);
          const tl = maphistPlan.compile(n.script, geo, { durations: [1.5], fps: 30 });
          const hashes = {};
          const sig = async buf => { const bmp = await createImageBitmap(new Blob([buf], { type: 'image/jpeg' })); const g = new OffscreenCanvas(32, 18).getContext('2d'); g.imageSmoothingQuality = 'high'; g.drawImage(bmp, 0, 0, 32, 18); bmp.close(); return Array.from(g.getImageData(0, 0, 32, 18).data); };
          window.maphistBridge = { frame: async (i, buf) => { hashes[i] = await sig(buf); return { stop: false }; } };
          await MapRender.init({ raw, timeline: tl });
          const r = await MapRender.run({ fps: 30, quality: .92, worker, workers, chunk: 24 });
          return { hashes, frames: r.frames, total: Math.ceil(tl.total * 30), stopped: r.stopped };
        }, { raw: rawWorld, script, worker, workers });
        await page.close();
        assert.deepEqual(errors, [], 'không lỗi trong trang vẽ');
        return out;
      };
      const solo = await render(0, 1);
      assert.equal(solo.stopped, false);
      assert.equal(Object.keys(solo.hashes).length, solo.total, 'một cửa sổ vẽ đủ mọi khung');
      for (const workers of [2, 3]) {
        const parts = []; for (let w = 0; w < workers; w++) parts.push(await render(w, workers));
        const merged = {}; let count = 0;
        for (const p of parts) for (const [i, h] of Object.entries(p.hashes)) { assert.ok(!(i in merged), `khung ${i} chỉ do một cửa sổ vẽ`); merged[i] = h; count++; }
        assert.equal(count, solo.total, `${workers} cửa sổ vẽ đủ ${solo.total} khung`);
        const far = (a, b) => a.reduce((m, v, k) => Math.max(m, Math.abs(v - b[k])), 0);
        const bad = []; let worst = 0; for (let i = 0; i < solo.total; i++) { const d = far(merged[i], solo.hashes[i]); worst = Math.max(worst, d); if (d > 3) bad.push(i); }
        assert.deepEqual(bad, [], `[${theme}] khung khác nhau giữa ${workers} cửa sổ và một cửa sổ (lệch lớn nhất ${worst})`);
        assert.ok(far(solo.hashes[0], solo.hashes[Math.floor(solo.total / 2)]) > 20, 'các khung khác nhau thật (phép so không rỗng)');
      }
      console.log(theme, 'OK:', solo.total, 'khung cùng một hình giữa 1, 2 và 3 cửa sổ');
    }
  } finally { await browser.close(); server.close(); }
  console.log('maphist-parallel-smoke OK');
})().catch(e => { console.error(e); process.exit(1); });
