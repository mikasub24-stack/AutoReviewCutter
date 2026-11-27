// Khung hình VIDEO theo chủ đề, vẽ bằng trình duyệt thật: mỗi dạng chủ đề (Đế chế, Triều đại, Chiến tranh, Khám phá, Cổ đại, Độc lập) phải ra khung hình
// KHÁC dạng «Nước» thường của cùng kịch bản (camera / hiệu ứng / cảnh riêng), không lỗi trang.
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
    const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
    const errors = []; page.on('pageerror', e => errors.push(e.message));
    await page.goto(base + '/');
    await page.waitForFunction('window.__mapRenderReady===true');
    // sig: ảnh thu nhỏ 48x27 của khung giữa giai đoạn 2 (đủ lâu để lãnh thổ mọc xong); kind ép dạng.
    const shoot = (script, kind) => page.evaluate(async ({ raw, script, kind }) => {
      const geo = maphistGeo.build(raw), n = maphistPlan.normalizeScript(script, geo);
      if (kind) n.script.kind = kind;
      const tl = maphistPlan.compile(n.script, geo, { durations: n.script.eras.map(() => 30), fps: 30 });
      await MapRender.init({ raw, timeline: tl });
      const e = tl.eras[Math.min(1, tl.eras.length - 1)], bytes = await MapRender.frame(e.start + e.dur * .7, .8);
      const bmp = await createImageBitmap(new Blob([bytes], { type: 'image/jpeg' })), g = new OffscreenCanvas(48, 27).getContext('2d'); g.drawImage(bmp, 0, 0, 48, 27);
      return { kind: tl.kind, size: bytes.length, head: [bytes[0], bytes[1]], sig: Array.from(g.getImageData(0, 0, 48, 27).data), span: Math.round(e.view.span) };
    }, { raw: rawWorld, script, kind });
    const diff = (a, b) => { let t = 0; for (let i = 0; i < a.length; i++) t += Math.abs(a[i] - b[i]); return t / a.length; };
    const out = [];
    for (const cat of categories) {
      if (cat.id === 'country') continue;
      const own = await shoot(JSON.parse(JSON.stringify(cat.sample.script)), '');
      const plain = await shoot(JSON.parse(JSON.stringify(cat.sample.script)), 'country');
      assert.deepEqual(own.head, [0xff, 0xd8], `${cat.id}: phải là JPEG`);
      assert.equal(own.kind, cat.id);
      const d = diff(own.sig, plain.sig);
      assert.ok(d > 3, `${cat.id}: khung hình video phải khác dạng «Nước» thường (khác ${d.toFixed(1)})`);
      out.push(`${cat.id}:${d.toFixed(0)}`);
    }
    assert.deepEqual(errors, [], errors.join('|'));
    console.log('maphist-kinds-smoke ok', out.join(' '));
  } finally { await browser.close(); server.close(); }
})().catch(e => { console.error(e); process.exit(1); });
