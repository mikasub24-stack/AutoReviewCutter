// Vẽ hình mẫu (480×270) cho từng chủ đề gợi ý của tab «Bản đồ lịch sử» bằng chính bộ vẽ của video.
// Chạy: node tools/make-topic-thumbs.cjs   (cần Chromium: CHROMIUM_PATH; playwright-core hoặc playwright)
// Đầu vào: tools/maphist-topics.json. Đầu ra: src/assets/maphist/topics/<slug>.jpg
const fs = require('node:fs'), path = require('node:path'), zlib = require('node:zlib');
const pw = (() => { try { return require('playwright-core'); } catch { return require('playwright'); } })();
const SRC = path.join(__dirname, '../src'), OUT = path.join(SRC, 'assets/maphist/topics');
const slug = name => String(name).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
(async () => {
  const raw = JSON.parse(zlib.gunzipSync(fs.readFileSync(path.join(SRC, 'assets/maphist/world.json.gz'))));
  const spec = JSON.parse(fs.readFileSync(path.join(__dirname, 'maphist-topics.json'), 'utf8'));
  fs.mkdirSync(OUT, { recursive: true });
  const browser = await pw.chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined, args: ['--no-sandbox', '--allow-file-access-from-files'] });
  try {
    const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
    page.on('pageerror', e => console.log('PAGEERR', e.message));
    const font = f => 'file://' + path.join(SRC, 'assets/maphist/fonts', f).replace(/\\/g, '/');
    const html = path.join(require('node:os').tmpdir(), 'maphist-topic-thumbs.html');
    fs.writeFileSync(html, `<!doctype html><meta charset="utf-8"><style>@font-face{font-family:"MapLora";font-weight:400 700;font-style:normal;src:url("${font('Lora-Variable.ttf')}")}@font-face{font-family:"MapLora";font-weight:400 700;font-style:italic;src:url("${font('Lora-Italic-Variable.ttf')}")}html,body{margin:0;background:#000}canvas{display:block}</style><canvas id="c" width="1920" height="1080"></canvas>`);
    await page.goto('file://' + html.replace(/\\/g, '/'));
    for (const f of ['maphist-geo.js', 'maphist-plan.js', 'maphist-draw.js']) await page.addScriptTag({ path: path.join(SRC, f) });
    await page.evaluate(raw => { window.geo = maphistGeo.build(raw); window.cv = document.getElementById('c'); }, raw);
    await page.evaluate(() => Promise.all(['400 40px MapLora', '600 40px MapLora', '700 40px MapLora', 'italic 600 40px MapLora'].map(f => document.fonts.load(f))));
    for (const t of spec) {
      const short = t.topic.replace(/^(The |History of |Rise and Fall of )/, '');
      const realms = [{ name: short, regions: t.regions, colors: t.colors, flag: t.flag, mood: t.mood, face: true }, ...(t.realms2 || []).map(r => ({ face: false, ...r }))];
      const script = { title: t.topic, country: t.country, eras: [{ year: 1000, title: short, caption: short, narration: 'A great story begins here and the map changes forever after it.', population: 0, icon: 'crown', realms, markers: t.markers || [], routes: t.routes || [], view: t.view || null }] };
      const b64 = await page.evaluate(script => {
        const n = maphistPlan.normalizeScript(script, geo);
        const tl = maphistPlan.compile(n.script, geo, { durations: [], fps: 30 });
        const R = maphistDraw.create({ canvas: cv, geo }); R.setTimeline(tl);
        R.drawStill(0);
        const small = document.createElement('canvas'); small.width = 480; small.height = 270;
        const c = small.getContext('2d'); c.imageSmoothingQuality = 'high'; c.drawImage(cv, 0, 0, 480, 270);
        return small.toDataURL('image/jpeg', .8).split(',')[1];
      }, script);
      const file = path.join(OUT, slug(t.topic) + '.jpg');
      fs.writeFileSync(file, Buffer.from(b64, 'base64'));
      console.log(slug(t.topic), fs.statSync(file).size);
    }
  } finally { await browser.close(); }
})().catch(e => { console.error(e); process.exit(1); });
