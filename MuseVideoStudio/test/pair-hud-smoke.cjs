// Bộ vẽ chữ canvas thật (Chromium): kích thước ảnh theo bố cục, pin chạy đủ khung, nhiều ngôn ngữ, dữ liệu lạ không làm hỏng trang.
const pw = (() => { try { return require('playwright-core'); } catch { return require('playwright'); } })();
const http = require('http'), fs = require('fs/promises'), path = require('path'), assert = require('assert/strict'), crypto = require('crypto');
(async () => {
  const src = path.join(__dirname, '../src');
  const server = http.createServer(async (req, res) => {
    const f = path.join(src, decodeURIComponent(req.url.split('?')[0]).replace(/^\//, '') || 'pair-hud.html');
    if (!f.startsWith(src)) { res.writeHead(403); return res.end(); }
    try { const b = await fs.readFile(f); res.setHeader('Content-Type', f.endsWith('.ttf') ? 'font/ttf' : f.endsWith('.js') ? 'application/javascript' : 'text/html'); res.end(b); } catch { res.writeHead(404); res.end(); }
  });
  await new Promise(r => server.listen(0, '127.0.0.1', r));
  const browser = await pw.chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined, headless: true, args: ['--no-sandbox'] });
  try {
    const page = await browser.newPage(), errors = [];
    page.on('pageerror', e => errors.push(e.message));
    await page.goto(`http://127.0.0.1:${server.address().port}/pair-hud.html`);
    assert.equal(await page.evaluate(() => PairHud.ready()), true);
    const rect = r => [r.w, r.h];
    const size = url => { assert.match(url, /^data:image\/png;base64,/); const b = Buffer.from(url.split(',')[1], 'base64'); return [b.readUInt32BE(16), b.readUInt32BE(20)]; };
    const hash = url => crypto.createHash('sha1').update(url).digest('hex');
    const init = (o) => page.evaluate(o => PairHud.init(o), o);
    const base = { title: 'Raised with yelling and raised with listening', left: 'RAISED WITH YELLING', right: 'RAISED WITH LISTENING', meter: 'CONFIDENCE', total: 66, lang: 'en', tagline: 'SAME CHILD, TWO PATHS', lessonsTitle: 'WHAT WE LEARNED' };
    for (const [layout, dims] of [['side', [1920, 1080]], ['stack', [1080, 1920]]]) {
      await init({ ...base, layout });
      const geo = require('../src/pair-hud.js').geometry(layout), rect = r => [r.w, r.h];
      for (const [name, call, want] of [['base', () => PairHud.base(), dims], ['tag', () => PairHud.tag(7, 'AGE 12'), rect(geo.tag)], ['caption', () => PairHud.caption('He stops raising his hand in class.'), rect(geo.caption)], ['intro', () => PairHud.intro(), dims]]) {
        const url = await page.evaluate(call);
        assert.deepEqual(size(url), want, `${layout}/${name}`);
      }
      const seq = await page.evaluate(() => PairHud.meterSeq('L', 100, 60));
      assert.equal(seq.length, 24, 'pin chạy: 4 khung đứng yên + 20 khung chạy');
      assert.ok(seq.every(u => size(u).join() === rect(geo.meter.L).join()), 'pin trái đúng kích thước khung');
      assert.deepEqual(size((await page.evaluate(() => PairHud.meterSeq('R', 100, 90)))[0]), rect(geo.meter.R));
      assert.notEqual(hash(seq[0]), hash(seq[23]), 'đầu và cuối khác nhau');
      assert.equal(hash(seq[0]), hash(seq[3]), '4 khung đầu đứng yên');
      assert.equal((await page.evaluate(() => PairHud.meterSeq('R', 98, 98))).length, 1, 'không đổi thì chỉ một khung');
      const outro = await page.evaluate(() => PairHud.outro(['Stay calm before you speak', 'Ask before you judge', 'Praise the effort'], 'Every child is shaped by the voices they hear.'));
      assert.ok(outro.length >= 3 && outro.every(u => size(u).join() === dims.join()), `${layout} outro ${outro.length} lớp`);
      assert.equal(new Set(outro.map(hash)).size, outro.length, 'mỗi lớp khác nhau (bài học hiện dần)');
    }
    // nhiều ngôn ngữ (chữ Latinh, Cyrillic, Hán, Ả Rập, Devanagari, Thái, Nhật, Hàn): vẽ không lỗi và ra ảnh khác nhau
    const samples = { en: 'He stops raising his hand.', vi: 'Cậu bé thôi giơ tay phát biểu.', ru: 'Он перестаёт поднимать руку.', zh: '他不再举手发言。', ar: 'يتوقف عن رفع يده في الصف.', hi: 'वह कक्षा में हाथ उठाना बंद कर देता है।', th: 'เขาเลิกยกมือในห้องเรียน', ja: '彼は授業で手を挙げなくなる。', ko: '그는 수업 중에 손을 들지 않는다.' };
    const hashes = new Set();
    for (const [lang, text] of Object.entries(samples)) {
      await init({ ...base, layout: 'side', lang, title: text, left: text.slice(0, 14), right: text.slice(0, 12) });
      const url = await page.evaluate(t => PairHud.caption(t), text);
      assert.deepEqual(size(url), rect(require('../src/pair-hud.js').geometry('side').caption));
      hashes.add(hash(url));
    }
    assert.equal(hashes.size, Object.keys(samples).length, 'mỗi ngôn ngữ ra hình khác nhau');
    // dữ liệu lạ (rất dài, thẻ HTML, ký tự điều khiển, chuỗi rỗng) không làm hỏng trang
    await init({ ...base, layout: 'side', title: '<img src=x onerror="window.pwned=1">'.repeat(20), left: '', right: 'x'.repeat(300) });
    for (const text of ['', '<b>x</b>'.repeat(50), 'A'.repeat(600), '\u0000‮\n\t' + 'مرحبا']) assert.deepEqual(size(await page.evaluate(t => PairHud.caption(t), text)), rect(require('../src/pair-hud.js').geometry('side').caption));
    await page.evaluate(() => PairHud.intro());
    assert.equal(await page.evaluate(() => window.pwned), undefined, 'không chạy mã trong dữ liệu');
    assert.equal(errors.length, 0, errors.join('\n'));
    console.log('pair hud smoke ok');
  } finally { await browser.close(); server.close(); }
})().catch(e => { console.error(e); process.exit(1); });
