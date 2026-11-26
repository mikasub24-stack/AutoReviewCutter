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
    // ---- Thumbnail 16:9: 4 kiểu, JPEG 1920×1080 ≤ 1,9 MB (kể cả khung hình nhiễu nặng), nhiều ngôn ngữ, dữ liệu lạ, ảnh hỏng
    const Hud = require('../src/pair-hud.js');
    const jpegSize = url => {
      assert.match(url, /^data:image\/jpeg;base64,/);
      const b = Buffer.from(url.split(',')[1], 'base64');
      assert.deepEqual([b[0], b[1]], [0xff, 0xd8]);
      for (let i = 2; i < b.length - 9;) {
        if (b[i] !== 0xff) { i++; continue; }
        const m = b[i + 1];
        if (m >= 0xc0 && m <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(m)) return { w: b.readUInt16BE(i + 7), h: b.readUInt16BE(i + 5), bytes: b.length };
        i += 2 + b.readUInt16BE(i + 2);
      }
      throw Error('không thấy SOF');
    };
    const frames = await page.evaluate(() => {
      const make = (w, h, hue, noise) => {
        const c = document.createElement('canvas'); c.width = w; c.height = h; const x = c.getContext('2d');
        const g = x.createLinearGradient(0, 0, w, h); g.addColorStop(0, `hsl(${hue},70%,55%)`); g.addColorStop(1, `hsl(${hue + 60},60%,25%)`); x.fillStyle = g; x.fillRect(0, 0, w, h);
        x.fillStyle = '#fff'; x.beginPath(); x.arc(w * .5, h * .45, h * .18, 0, 7); x.fill();
        if (noise) { const d = x.getImageData(0, 0, w, h); for (let i = 0; i < d.data.length; i += 4) { d.data[i] = Math.random() * 255; d.data[i + 1] = Math.random() * 255; d.data[i + 2] = Math.random() * 255; } x.putImageData(d, 0, 0); }
        return c.toDataURL('image/jpeg', .95);
      };
      return { l: make(1280, 1280, 20, false), r: make(1280, 720, 190, false), noisyL: make(1280, 1280, 0, true), noisyR: make(1280, 1280, 0, true) };
    });
    const thumbOpts = (extra = {}) => ({ variant: 0, leftImage: frames.l, rightImage: frames.r, title: 'The Same Child, Two Fathers: Yelling vs Listening', left: 'RAISED WITH YELLING', right: 'RAISED WITH LISTENING', meter: 'CONFIDENCE', leftScore: 22, rightScore: 90, lang: 'en', ...extra });
    const thumb = o => page.evaluate(o => PairHud.thumb(o), o);
    assert.deepEqual([Hud.THUMB.W, Hud.THUMB.H, Hud.THUMB.STYLES], [1920, 1080, 4]);
    const styleHashes = new Set();
    for (let v = 0; v < Hud.THUMB.STYLES; v++) {
      const url = await thumb(thumbOpts({ variant: v }));
      const info = jpegSize(url);
      assert.deepEqual([info.w, info.h], [1920, 1080], `kiểu ${v}`);
      assert.ok(info.bytes <= Hud.THUMB.MAX_BYTES, `kiểu ${v} nặng ${info.bytes}`);
      styleHashes.add(hash(url));
      if (process.env.THUMB_OUT) await fs.writeFile(path.join(process.env.THUMB_OUT, `thumb-${v}.jpg`), Buffer.from(url.split(',')[1], 'base64'));
    }
    assert.equal(styleHashes.size, 4, '4 kiểu cho 4 hình khác nhau');
    assert.equal(hash(await thumb(thumbOpts({ variant: 0 }))), hash(await thumb(thumbOpts({ variant: 4 }))), 'kiểu 5 vòng lại kiểu 1');
    assert.equal(hash(await thumb(thumbOpts({ variant: 1 }))), hash(await thumb(thumbOpts({ variant: -3 }))), 'số âm vẫn về đúng kiểu');
    for (let v = 0; v < 4; v++) {
      const info = jpegSize(await thumb(thumbOpts({ variant: v, leftImage: frames.noisyL, rightImage: frames.noisyR })));
      assert.ok(info.bytes <= Hud.THUMB.MAX_BYTES, `nhiễu nặng kiểu ${v}: ${info.bytes} byte`);
      assert.deepEqual([info.w, info.h], [1920, 1080]);
    }
    const langs = { ar: 'من الطفل نفسه إلى أبوين مختلفين', zh: '同一个孩子，两种父亲', th: 'เด็กคนเดียวกัน พ่อสองแบบ', ja: '同じ子ども、二人の父親', ru: 'Один ребёнок, два отца', hi: 'एक ही बच्चा, दो पिता', ko: '같은 아이, 두 아버지', vi: 'Cùng một đứa trẻ, hai người cha' };
    const langHashes = new Set();
    for (const [lang, text] of Object.entries(langs)) for (let v = 0; v < 4; v++) {
      const url = await thumb(thumbOpts({ variant: v, lang, title: text, left: text.slice(0, 10), right: text.slice(-9) }));
      assert.deepEqual([jpegSize(url).w, jpegSize(url).h], [1920, 1080], `${lang}/${v}`);
      if (v === 0) langHashes.add(hash(url));
    }
    assert.equal(langHashes.size, Object.keys(langs).length, 'mỗi ngôn ngữ ra hình khác nhau');
    for (let v = 0; v < 4; v++) for (const extra of [
      { title: 'A'.repeat(300), left: 'x'.repeat(300), right: '' },
      { title: '', left: '', right: '' },
      { title: '<img src=x onerror="window.pwned=2">'.repeat(10), left: '<b>x</b>', right: '\u0000‮\n\t' },
      { leftScore: NaN, rightScore: undefined },
      { leftScore: 250, rightScore: -40 },
      { meter: '' }
    ]) assert.deepEqual([jpegSize(await thumb(thumbOpts({ variant: v, ...extra }))).w], [1920], `dữ liệu lạ kiểu ${v}`);
    assert.equal(await page.evaluate(() => window.pwned), undefined, 'thumbnail không chạy mã trong dữ liệu');
    await assert.rejects(thumb(thumbOpts({ leftImage: 'data:image/jpeg;base64,AAAA' })), /Không đọc được khung hình/);
    await assert.rejects(thumb(thumbOpts({ rightImage: '' })), /Không đọc được khung hình/);
    // Dấu ✓ xanh (bên đúng) / ✗ đỏ (bên sai): có trên thumbnail mọi kiểu và trên lớp nền video; đo màu thật dưới dấu gạch trong huy hiệu ở hai góc.
    const pixel = (url, x, y) => page.evaluate(async ({ url, x, y }) => { const img = new Image(); img.src = url; await img.decode(); const c = document.createElement('canvas'); c.width = img.width; c.height = img.height; const g = c.getContext('2d'); g.drawImage(img, 0, 0); return Array.from(g.getImageData(x, y, 1, 1).data); }, { url, x, y });
    const isRed = ([r, g, b]) => r > 150 && r > g + 70 && r > b + 60, isGreen = ([r, g, b]) => g > 110 && g > r + 60 && g > b + 20;
    for (let v = 0; v < Hud.THUMB.STYLES; v++) {
      const right = await thumb(thumbOpts({ variant: v, verdict: 'R' })), left = await thumb(thumbOpts({ variant: v, verdict: 'L' })), none = await thumb(thumbOpts({ variant: v })), junk = await thumb(thumbOpts({ variant: v, verdict: 'X' }));
      assert.equal(new Set([hash(right), hash(left), hash(none)]).size, 3, `kiểu ${v}: có dấu, đổi bên, không dấu đều khác nhau`);
      assert.equal(hash(junk), hash(none), `kiểu ${v}: kết luận lạ bị bỏ qua`);
      assert.ok(isRed(await pixel(right, 118, 194)) && isGreen(await pixel(right, 1920 - 118, 194)), `kiểu ${v}: bên phải đúng thì ✗ đỏ ở góc trái, ✓ xanh ở góc phải`);
      assert.ok(isGreen(await pixel(left, 118, 194)) && isRed(await pixel(left, 1920 - 118, 194)), `kiểu ${v}: bên trái đúng thì ✓ xanh ở góc trái, ✗ đỏ ở góc phải`);
    }
    for (const layout of ['side', 'stack']) {
      await init({ ...base, layout });
      const plain = await page.evaluate(() => PairHud.base());
      await init({ ...base, layout, verdict: 'R' });
      const marked = await page.evaluate(() => PairHud.base());
      assert.deepEqual(size(marked), size(plain), `${layout}: kích thước lớp nền không đổi`);
      assert.notEqual(hash(marked), hash(plain), `${layout}: lớp nền có thêm dấu ✓ ✗`);
      await init({ ...base, layout, verdict: 'L' });
      assert.notEqual(hash(await page.evaluate(() => PairHud.base())), hash(marked), `${layout}: đổi bên thì dấu đổi`);
      await init({ ...base, layout, verdict: 'X' });
      assert.equal(hash(await page.evaluate(() => PairHud.base())), hash(plain), `${layout}: kết luận lạ bị bỏ qua`);
    }
    assert.equal(Hud.hookOf('The Same Child, Two Fathers: Yelling vs Listening'), 'The Same Child, Two Fathers');
    assert.equal(Hud.hookOf('Short'), 'Short');
    assert.equal(Hud.hookOf('A: B'), 'A: B', 'vế đầu quá ngắn: giữ nguyên');
    assert.equal(Hud.hookOf('Why one calm word beats ten loud ones in every home'), 'Why one calm word beats ten loud ones in every home', 'không có dấu tách: giữ nguyên');
    assert.equal(Hud.hookOf('x'.repeat(60) + ': y'), 'x'.repeat(60) + ': y', 'vế đầu quá dài: giữ nguyên');
    assert.equal(Hud.hookOf(null), '');
    assert.equal(errors.length, 0, errors.join('\n'));
    console.log('pair hud smoke ok');
  } finally { await browser.close(); server.close(); }
})().catch(e => { console.error(e); process.exit(1); });
