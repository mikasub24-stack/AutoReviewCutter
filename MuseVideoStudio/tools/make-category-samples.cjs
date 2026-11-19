// Vẽ hình mẫu cho từng NHÓM chủ đề của tab «Bản đồ lịch sử»: một khung video thật (có đồng hồ năm, cờ có mặt, thẻ lời đọc) để người dùng
// thấy video nhóm đó trông thế nào. Chạy: node tools/make-category-samples.cjs  (cần Chromium: CHROMIUM_PATH; playwright-core hoặc playwright)
// Đầu vào: tools/maphist-categories.json. Đầu ra: src/assets/maphist/categories/<id>.jpg (800×450)
const fs = require('node:fs'), path = require('node:path'), os = require('node:os'), zlib = require('node:zlib');
const pw = (() => { try { return require('playwright-core'); } catch { return require('playwright'); } })();
const SRC = path.join(__dirname, '../src'), OUT = path.join(SRC, 'assets/maphist/categories');
const VOICE = 9;   // giây lời đọc giả định mỗi giai đoạn: thẻ lời đọc đang tô sáng giữa chừng
(async () => {
  const raw = JSON.parse(zlib.gunzipSync(fs.readFileSync(path.join(SRC, 'assets/maphist/world.json.gz'))));
  const cats = JSON.parse(fs.readFileSync(path.join(__dirname, 'maphist-categories.json'), 'utf8'));
  fs.mkdirSync(OUT, { recursive: true });
  const browser = await pw.chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined, args: ['--no-sandbox', '--allow-file-access-from-files'] });
  try {
    const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
    page.on('pageerror', e => console.log('PAGEERR', e.message));
    const font = f => 'file://' + path.join(SRC, 'assets/maphist/fonts', f).replace(/\\/g, '/');
    const html = path.join(os.tmpdir(), 'maphist-category-samples.html');
    fs.writeFileSync(html, `<!doctype html><meta charset="utf-8"><style>@font-face{font-family:"MapLora";font-weight:400 700;font-style:normal;src:url("${font('Lora-Variable.ttf')}")}@font-face{font-family:"MapLora";font-weight:400 700;font-style:italic;src:url("${font('Lora-Italic-Variable.ttf')}")}html,body{margin:0;background:#000}canvas{display:block}</style><canvas id="c" width="1920" height="1080"></canvas>`);
    await page.goto('file://' + html.replace(/\\/g, '/'));
    for (const f of ['maphist-geo.js', 'maphist-plan.js', 'maphist-draw.js']) await page.addScriptTag({ path: path.join(SRC, f) });
    await page.evaluate(raw => { window.geo = maphistGeo.build(raw); window.cv = document.getElementById('c'); }, raw);
    await page.evaluate(() => Promise.all(['400 40px MapLora', '600 40px MapLora', '700 40px MapLora', 'italic 600 40px MapLora', 'italic 700 40px MapLora'].map(f => document.fonts.load(f))));
    for (const c of cats) {
      const out = await page.evaluate(({ sample, VOICE }) => {
        const n = maphistPlan.normalizeScript(sample.script, geo);
        const tl = maphistPlan.compile(n.script, geo, { durations: n.script.eras.map(() => VOICE), fps: 30 });
        const R = maphistDraw.create({ canvas: cv, geo }); R.setTimeline(tl);
        const e = tl.eras[sample.frame];
        R.drawFrame(e.start + maphistPlan.LEAD + VOICE * .55);
        const small = document.createElement('canvas'); small.width = 800; small.height = 450;
        const x = small.getContext('2d'); x.imageSmoothingQuality = 'high'; x.drawImage(cv, 0, 0, 800, 450);
        return { b64: small.toDataURL('image/jpeg', .84).split(',')[1], issues: n.issues.map(i => i.text) };
      }, { sample: c.sample, VOICE });
      const file = path.join(OUT, c.id + '.jpg');
      fs.writeFileSync(file, Buffer.from(out.b64, 'base64'));
      console.log(c.id, fs.statSync(file).size, out.issues.length ? 'ISSUES ' + out.issues.join(' | ') : '');
    }
  } finally { await browser.close(); }
})().catch(e => { console.error(e); process.exit(1); });
