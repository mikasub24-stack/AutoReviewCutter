// Ảnh bìa theo chủ đề, vẽ bằng trình duyệt thật: mỗi nhóm chủ đề mẫu ra được JPEG hợp lệ (≤ 1.9 MB, không lỗi trang);
// chiến tranh ra kiểu «Đối đầu» riêng (khác hẳn «Trước / Sau» của cùng kịch bản), độc lập khác kiểu mặc định.
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
    // Trả về { kind, size, sig }: sig = ảnh thu nhỏ 48x27 để so khác biệt giữa các kiểu.
    const shoot = (script, kind) => page.evaluate(async ({ raw, script, kind }) => {
      const geo = maphistGeo.build(raw), n = maphistPlan.normalizeScript(script, geo);
      if (kind) n.script.kind = kind;
      const tl = maphistPlan.compile(n.script, geo, { durations: [], fps: 30 });
      const b64 = await MapRender.thumbnail({ raw, timeline: tl, quality: .9 });
      const bin = atob(b64), bytes = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
      const bmp = await createImageBitmap(new Blob([bytes], { type: 'image/jpeg' })), g = new OffscreenCanvas(48, 27).getContext('2d'); g.drawImage(bmp, 0, 0, 48, 27);
      return { kind: tl.kind, size: bytes.length, head: [bytes[0], bytes[1]], sig: Array.from(g.getImageData(0, 0, 48, 27).data) };
    }, { raw: rawWorld, script, kind });
    const diff = (a, b) => { let t = 0; for (let i = 0; i < a.length; i++) t += Math.abs(a[i] - b[i]); return t / a.length; };
    const shots = {};
    for (const cat of categories) {
      const r = await shoot(JSON.parse(JSON.stringify(cat.sample.script)));
      assert.deepEqual(r.head, [0xff, 0xd8], `${cat.id}: phải là JPEG`);
      assert.ok(r.size > 20000 && r.size <= 1.9 * 1024 * 1024, `${cat.id}: cỡ tệp ${r.size}`);
      assert.equal(r.kind, cat.id, `${cat.id}: kịch bản mẫu của nhóm phải mang đúng dạng chủ đề`);
      shots[cat.id] = r;
    }
    // Cùng kịch bản chiến tranh, ép về dạng chung: ảnh phải khác hẳn kiểu «Đối đầu».
    const warPlain = await shoot(JSON.parse(JSON.stringify(categories.find(c => c.id === 'war').sample.script)), 'country');
    assert.ok(diff(shots.war.sig, warPlain.sig) > 12, `chiến tranh phải ra kiểu riêng (khác ${diff(shots.war.sig, warPlain.sig).toFixed(1)})`);
    const indPlain = await shoot(JSON.parse(JSON.stringify(categories.find(c => c.id === 'independence').sample.script)), 'country');
    assert.ok(diff(shots.independence.sig, indPlain.sig) > 4, `độc lập phải khác kiểu «Trước / Sau» thường (khác ${diff(shots.independence.sig, indPlain.sig).toFixed(1)})`);
    assert.deepEqual(errors, [], errors.join('|'));
    console.log('maphist-thumb-smoke ok', Object.entries(shots).map(([k, v]) => `${k}:${Math.round(v.size / 1024)}KB`).join(' '));
  } finally { await browser.close(); server.close(); }
})().catch(e => { console.error(e); process.exit(1); });
