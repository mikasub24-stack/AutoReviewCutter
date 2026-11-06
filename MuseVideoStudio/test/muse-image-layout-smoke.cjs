// Real browser, fake chat page shaped like the real Muse chat seen in the owner's screenshots (no data attributes on messages): sidebar nav, chat column with a scroll area of rows
// (timestamp, user bubble, assistant text bubble, assistant image, assistant text bubble), composer at the bottom, right panel.
const { chromium } = require('playwright-core');
const crypto = require('node:crypto'), zlib = require('node:zlib');
const { beginTracking, pollTracking, readTrackedImage, endTracking } = require('../src/muse-tracker.cjs');
const table = [...Array(256)].map((_, n) => { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c >>> 0; });
const crc32 = buf => { let c = 0xffffffff; for (const b of buf) c = table[(c ^ b) & 0xff] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
const chunk = (t, d) => { const l = Buffer.alloc(4); l.writeUInt32BE(d.length); const td = Buffer.concat([Buffer.from(t), d]); const c = Buffer.alloc(4); c.writeUInt32BE(crc32(td)); return Buffer.concat([l, td, c]); };
const png = (w, h) => { const st = w * 3 + 1, raw = crypto.randomBytes(st * h); for (let y = 0; y < h; y++) raw[y * st] = 0; const ih = Buffer.alloc(13); ih.writeUInt32BE(w, 0); ih.writeUInt32BE(h, 4); ih[8] = 8; ih[9] = 2; return Buffer.concat([Buffer.from([0x89,0x50,0x4e,0x47,0x0d,0x0a,0x1a,0x0a]), chunk('IHDR', ih), chunk('IDAT', zlib.deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]); };
const PROMPT = 'Tạo ảnh chụp thật, cận cảnh rõ nét, tỷ lệ 16:9: dao bếp và củ cà rốt, không chữ, không số, không logo.';
const variants = {
  flat: img => `<div class="row"><div class="bubble">Xong bản mới.</div></div><div class="row"><div class="imgwrap">${img}</div></div><div class="row"><div class="bubble">Bạn cứ gửi tiếp nhé.</div></div>`,
  nested: img => `<div class="grp"><div class="row"><div class="bubble">Xong bản mới.</div></div><div class="row"><div class="imgwrap"><div class="inner">${img}</div></div></div><div class="row"><div class="bubble">Bạn cứ gửi tiếp nhé.</div></div></div>`,
  oneMsg: img => `<div class="msg"><div class="bubble">Xong bản mới.</div>${img}<div class="bubble">Bạn cứ gửi tiếp nhé.</div></div>`,
};
const imgTag = (src, alt) => `<img src="${src}" ${alt === undefined ? '' : `alt="${alt}"`} style="width:220px;height:124px;border-radius:24px;display:block">`;
(async () => {
  const wide = png(440, 248);
  const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH, headless: true, args: ['--no-sandbox'] });
  const results = [];
  const extra = (process.env.EXTRA||'').split(',').filter(Boolean);
  const jobs = []; for (const [name, build] of Object.entries(variants)) for (const alt of [undefined, 'Tạo ảnh chụp thật, không logo']) for (const userWrap of ['plain']) for (const mode of ['history', 'dup', 'logo-url']) jobs.push([name, build, alt, userWrap, mode]);
  for (const [name, build, alt, userWrap, mode] of jobs) {
    const ctx = await browser.newContext(); const page = await ctx.newPage();
    await ctx.route('**/*', r => { const u = new URL(r.request().url()); if (/gen\.png$/.test(u.pathname) || u.pathname === '/old.png') return r.fulfill({ status: 200, contentType: 'image/png', body: wide }); return r.fulfill({ status: 200, contentType: 'text/html', body: '<!doctype html><html><body></body></html>' }); });
    await page.goto('https://muse.test/');
    await page.setContent(`<!doctype html><html><body style="margin:0;font:16px sans-serif"><div style="display:flex;height:800px"><nav style="width:70px"><button>chat</button></nav><main style="flex:1;display:flex;flex-direction:column"><div id="scroll" style="flex:1;overflow:auto"><div id="list" style="padding:20px"><div class="row"><div class="bubble">cũ</div></div></div></div><div style="padding:10px"><textarea id="composer"></textarea></div></main><aside style="width:300px">Muse</aside></div></body></html>`);
    if (mode === 'history') await page.evaluate(h => document.getElementById('list').insertAdjacentHTML('beforeend', h), `<div class="row" style="text-align:right"><div class="bubble" style="display:inline-block">${PROMPT}</div></div>` + build(imgTag('/old.png', alt)));
    if (mode === 'history') await page.waitForFunction(() => [...document.images].every(i => i.complete && i.naturalWidth));
    await page.evaluate(beginTracking, { id: 't', prompt: PROMPT, mediaKind: 'image', settleMs: 300 });
    const userHtml = userWrap === 'plain' ? `<div class="row" style="text-align:right"><div class="bubble" style="display:inline-block">${PROMPT}</div></div>` : `<div class="row"><div><div><div style="text-align:right"><div class="bubble" style="display:inline-block"><span>${PROMPT}</span></div><div class="react">👍</div></div></div></div></div>`;
    await page.evaluate(h => document.getElementById('list').insertAdjacentHTML('beforeend', h), userHtml);
    await page.waitForTimeout(200);
    if (mode === 'dup') { await page.waitForTimeout(1600); await page.evaluate(h => document.getElementById('list').insertAdjacentHTML('beforeend', h), userHtml); await page.waitForTimeout(100); }
    const src = mode === 'logo-url' ? '/assets/logo/gen.png' : '/gen.png';
    let tag = imgTag(src, alt); if (mode === 'lazy') tag = tag.replace('<img ', '<img loading="lazy" '); if (mode === 'link') tag = `<a href="/gen.png">${tag}</a>`;
    await page.evaluate(h => document.getElementById('list').insertAdjacentHTML('beforeend', h), build(tag));
    await page.waitForFunction(() => [...document.images].every(i => i.complete && i.naturalWidth));
    let state; for (let i = 0; i < 12; i++) { state = await page.evaluate(pollTracking, { id: 't' }).catch(e => ({ error: e.message })); if (state.ready || state.error) break; await page.waitForTimeout(300); }
    results.push(`${name.padEnd(7)} ${mode.padEnd(8)} alt=${JSON.stringify(alt)?.slice(0, 12).padEnd(12)} user=${userWrap.padEnd(5)} -> ${state.ready ? 'READY' : state.error ? 'ERROR ' + state.error.slice(0, 80) : 'NOT ready: ' + state.stage + ' | ' + (state.hint || '')}`);
    await ctx.close();
  }
  await browser.close();
  const bad = results.filter(line => !line.endsWith('READY'));
  if (bad.length) { console.error(results.join('\n')); process.exit(1); }
  console.log(`muse image layout smoke ok (${results.length} layouts)`);
})().catch(error => { console.error(error); process.exit(1); });
