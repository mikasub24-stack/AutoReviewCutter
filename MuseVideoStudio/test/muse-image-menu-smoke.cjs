// Real Chromium, fake Muse chat shaped like the owner's screenshots (no data attributes on messages, sidebar, scroll area, composer).
// 1) The same prompt already sits in the chat several times (earlier tries) and Muse rebuilds every message row as new nodes
//    when the reply arrives: the picture must still be bound to the copy that was sent now.
// 2) A picture is downloaded through its right-click menu (emoji row, Trả lời, Chia sẻ, Sao chép, Tải xuống): only the exact
//    "Tải xuống" row is clicked, the second picture of a reply is reachable by index, a wrong row is never clicked.
// Does not contact Muse.
const { chromium } = require('playwright-core');
const crypto = require('node:crypto'), zlib = require('node:zlib'), assert = require('node:assert/strict');
const { beginTracking, pollTracking, downloadAction, endTracking, readTrackedImage } = require('../src/muse-tracker.cjs');
const { triggerDownload } = require('../src/download-trigger.cjs');
const table = [...Array(256)].map((_, n) => { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c >>> 0; });
const crc32 = buf => { let c = 0xffffffff; for (const b of buf) c = table[(c ^ b) & 0xff] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
const chunk = (t, d) => { const l = Buffer.alloc(4); l.writeUInt32BE(d.length); const td = Buffer.concat([Buffer.from(t), d]); const c = Buffer.alloc(4); c.writeUInt32BE(crc32(td)); return Buffer.concat([l, td, c]); };
const png = (w, h) => { const st = w * 3 + 1, raw = crypto.randomBytes(st * h); for (let y = 0; y < h; y++) raw[y * st] = 0; const ih = Buffer.alloc(13); ih.writeUInt32BE(w, 0); ih.writeUInt32BE(h, 4); ih[8] = 8; ih[9] = 2; return Buffer.concat([Buffer.from([0x89,0x50,0x4e,0x47,0x0d,0x0a,0x1a,0x0a]), chunk('IHDR', ih), chunk('IDAT', zlib.deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]); };
const PROMPT = 'Tạo ảnh chụp thật, cận cảnh rõ nét, tỷ lệ 16:9: miếng vải ẩm lau vết bẩn, không chữ, không logo.';
const delay = ms => new Promise(r => setTimeout(r, ms));
const page_html = `<!doctype html><html><body style="margin:0;font:16px sans-serif"><div style="display:flex;height:800px"><nav style="width:70px"><button>chat</button></nav><main style="flex:1;display:flex;flex-direction:column"><div id="scroll" style="flex:1;overflow:auto"><div id="list"></div></div><div><textarea id="composer" style="width:90%"></textarea></div></main></div></body></html>`;
const userRow = () => `<div class="row" style="text-align:right"><div class="bubble" style="display:inline-block">${PROMPT}</div></div>`;
const imgTag = (src, extra = '') => `<img src="${src}" ${extra} style="width:220px;height:124px;border-radius:24px;display:block">`;
const replyRow = (src, extra) => `<div class="row"><div class="bubble">Xong rồi nhé.</div></div><div class="row"><div class="imgwrap">${imgTag(src, extra)}</div></div>`;
(async () => {
  const wide = png(440, 248);
  const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH, headless: true, args: ['--no-sandbox'] });
  const ctx = await browser.newContext({ viewport: { width: 1000, height: 800 } });
  await ctx.route('**/*', r => { const u = new URL(r.request().url()); if (/\.png$/.test(u.pathname)) return r.fulfill({ status: 200, contentType: 'image/png', body: wide }); return r.fulfill({ status: 200, contentType: 'text/html', body: page_html }); });
  const page = await ctx.newPage();
  await page.goto('https://muse.test/');
  const reset = async () => { await page.evaluate(() => { const m = globalThis[Symbol.for('MuseVideoStudio.promptTrackers.v1')]; if (m) { for (const s of m.values()) s.observer?.disconnect(); m.clear(); } }); await page.setContent(page_html); };
  const add = html => page.evaluate(h => document.getElementById('list').insertAdjacentHTML('beforeend', h), html);
  const loaded = () => page.waitForFunction(() => [...document.images].every(i => i.complete && i.naturalWidth));
  const settle = async id => { let state; for (let i = 0; i < 16; i++) { state = await page.evaluate(pollTracking, { id }).catch(e => ({ error: e.message })); if (state.ready || state.error) break; await delay(300); } return state; };

  // ---- 1) identical prompts in history + Muse rebuilds every row as new nodes -------------------------------------------
  for (const copies of [1, 3]) {
    await reset();
    for (let i = 0; i < copies; i++) await add(userRow() + replyRow(`/old${i}.png`));
    await loaded();
    await page.evaluate(beginTracking, { id: 'a', prompt: PROMPT, mediaKind: 'image', settleMs: 300 });
    await add(userRow()); await delay(300);
    let state = await page.evaluate(pollTracking, { id: 'a' });
    assert.equal(state.echoMatched, true, `${copies}: the prompt sent now is seen`);
    // The reply arrives and Muse re-renders the whole list: every row becomes a new node (the old echo node is gone).
    await add(replyRow('/new.png'));
    await page.evaluate(() => { const list = document.getElementById('list'); const html = list.innerHTML; list.innerHTML = ''; list.insertAdjacentHTML('beforeend', html); });
    await loaded();
    state = await settle('a');
    assert.equal(state.error, undefined, `${copies}: ${state.error}`);
    assert.equal(state.ready, true, `${copies}: bound to the new picture after the rows were rebuilt (${state.stage} | ${state.hint})`);
    assert.equal(state.count, 1);
    await page.evaluate(endTracking, { id: 'a' });
  }
  // The stuck card used to hide why: with rows rebuilt and no new prompt copy visible it now says what it sees.
  await reset();
  await add(userRow() + replyRow('/old.png')); await loaded();
  await page.evaluate(beginTracking, { id: 'b', prompt: PROMPT, mediaKind: 'image', settleMs: 300 });
  await add(userRow()); await delay(200); await page.evaluate(pollTracking, { id: 'b' });
  await page.evaluate(() => { const list = document.getElementById('list'); const rows = [...list.querySelectorAll('.row')]; rows[rows.length - 1].remove(); });   // the new copy vanishes
  const lost = await page.evaluate(pollTracking, { id: 'b' });
  assert.equal(lost.ready, false); assert.match(lost.hint || '', /thấy 1 tin nhắn giống prompt, lúc gửi có 1/, 'the card says what the tool sees');
  await page.evaluate(endTracking, { id: 'b' });

  // ---- 3) "Tìm / lưu ảnh đã tạo" (recover): the old marker is gone and the chat holds the prompt three times ----------------
  for (const [label, withReplyOnLast] of [['newest copy has its picture', true], ['newest copy still has no picture', false]]) {
    await reset();
    await add(userRow() + replyRow('/c0.png') + userRow() + replyRow('/c1.png') + userRow() + (withReplyOnLast ? replyRow('/c2.png') : ''));
    await loaded();
    await page.evaluate(beginTracking, { id: 'r', prompt: PROMPT, mediaKind: 'image', recover: true, echoKey: 'old-key', echoMarker: 'old-marker', settleMs: 300 });
    const state = await settle('r');
    if (withReplyOnLast) {
      assert.equal(state.error, undefined, `3 ${label}: ${state.error}`);
      assert.equal(state.ready, true, `3 ${label}: ${state.stage} | ${state.hint}`);
      const item = await page.evaluate(readTrackedImage, { id: 'r', index: 0 });
      assert.match(item.url || '', /\/c2\.png/, '3: the picture after the newest copy is taken, never an older reply');
    } else {
      assert.equal(state.error, undefined, `3 ${label}: ${state.error}`);
      assert.equal(state.ready, false, '3: an older copy\'s picture is never taken for a newer copy without a picture');
    }
    await page.evaluate(endTracking, { id: 'r' });
  }

  // ---- 2) right-click menu ---------------------------------------------------------------------------------------------
  const stopped = () => Object.assign(Error('stopped'), { name: 'AbortError' });
  async function scene(menuScript, { images = 1 } = {}) {
    await reset(); await add(userRow());
    const id = 'm' + Math.random().toString(36).slice(2, 7);
    // begin before the prompt is on screen is not possible here (prompt already added); re-add flow: clear and begin first
    await page.evaluate(() => { document.getElementById('list').innerHTML = ''; });
    await page.evaluate(beginTracking, { id, prompt: PROMPT, mediaKind: 'image', settleMs: 300 });
    await add(userRow()); await delay(200);
    let html = `<div class="row"><div class="bubble">Xong rồi nhé.</div></div><div class="row"><div class="imgwrap" id="wrap">`;
    for (let i = 0; i < images; i++) html += imgTag(`/p${i}.png`, `data-n="${i}"`);
    await add(html + '</div></div>');
    await loaded();
    await page.evaluate(`(()=>{window.__log=[];${menuScript}})()`);
    const state = await settle(id); assert.equal(state.ready, true, state.stage + ' | ' + state.hint + ' | ' + state.error);
    return id;
  }
  const run = (id, extra = {}) => triggerDownload({ id, kind: 'image', signal: { aborted: false }, delay, stopped, abortable: p => p, call: arg => page.evaluate(downloadAction, arg), rightClick: extra.noReal ? undefined : (x, y) => page.mouse.click(x, y, { button: 'right' }), ...extra });
  const log = () => page.evaluate(() => window.__log.slice());
  const kit = `
    window.menuOf=(rows,header)=>{document.getElementById('muse-popup')?.remove();const m=document.createElement('div');m.id='muse-popup';m.style.cssText='position:fixed;left:300px;top:260px;width:210px;background:#fff;border:1px solid #ccc;padding:6px';
      const h=document.createElement('div');h.textContent=header;h.style.color='#777';m.append(h);
      for(const label of rows){if(label==='EMOJI'){const e=document.createElement('div');e.style.cssText='display:flex;gap:4px';for(const ch of ['👍','❤️','😂','😮','😳','🙏','+']){const b=document.createElement('button');b.textContent=ch;b.onclick=()=>window.__log.push('emoji');e.append(b);}m.append(e);continue;}
        const r=document.createElement('div');r.style.cssText='padding:6px;cursor:pointer';r.innerHTML='<svg width="14" height="14"><path d="M1 1h12v12z"/></svg> <span>'+label+'</span>';
        r.onclick=()=>{window.__log.push(label);m.remove();};m.append(r);}
      document.body.append(m);return m;};`;
  const standard = ['EMOJI', 'Trả lời', 'Chia sẻ', 'Sao chép', 'Tải xuống'];

  // 2a) the menu from the owner's screenshot: Download is the 5th row
  let id = await scene(`${kit};document.getElementById('wrap').addEventListener('contextmenu',e=>{e.preventDefault();menuOf(${JSON.stringify(standard)},'Hôm nay lúc 22:25');});`);
  await run(id); assert.deepEqual(await log(), ['Tải xuống'], '2a: only the Tải xuống row clicked (Trả lời / Chia sẻ / Sao chép / emoji untouched)');
  // 2b) the page ignores scripted events: the real mouse right-click route works
  id = await scene(`${kit};document.getElementById('wrap').addEventListener('contextmenu',e=>{if(!e.isTrusted)return;e.preventDefault();menuOf(${JSON.stringify(standard)},'Hôm nay lúc 22:25');});`);
  await run(id); assert.deepEqual(await log(), ['Tải xuống'], '2b: trusted-only page');
  // 2c) menu without "Sao chép" (4 rows) also works
  id = await scene(`${kit};document.getElementById('wrap').addEventListener('contextmenu',e=>{e.preventDefault();menuOf(['EMOJI','Trả lời','Chia sẻ','Tải xuống'],'Hôm nay lúc 22:25');});`);
  await run(id); assert.deepEqual(await log(), ['Tải xuống'], '2c: 4-row menu');
  // 2d) a reply with two pictures: index picks the picture whose menu is opened
  id = await scene(`${kit};for(const img of document.querySelectorAll('#wrap img'))img.addEventListener('contextmenu',e=>{e.preventDefault();e.stopPropagation();window.__log.push('menu-'+img.dataset.n);menuOf(${JSON.stringify(standard)},'Hôm nay lúc 22:25');});`, { images: 2 });
  await run(id, { index: 1 }); assert.deepEqual(await log(), ['menu-1', 'Tải xuống'], '2d: second picture');
  await page.evaluate(() => { window.__log = []; }); await run(id, { index: 0 }); assert.deepEqual(await log(), ['menu-0', 'Tải xuống'], '2d: first picture');
  // 2e) Download in the wrong row (2nd) is never clicked and the error says so; the "…" route is not used for pictures
  id = await scene(`${kit};document.getElementById('wrap').addEventListener('contextmenu',e=>{e.preventDefault();menuOf(['EMOJI','Tải xuống','Chia sẻ','Trả lời','Sao chép'],'Hôm nay lúc 22:25');});`);
  await assert.rejects(run(id), err => { assert.match(err.message, /Chưa bấm được Tải xuống của đúng ảnh/); assert.doesNotMatch(err.message, /nút … cạnh/); assert.match(err.message, /chuột phải vào ảnh/); return true; });
  assert.deepEqual(await log(), [], '2e: nothing clicked');
  // 2f) a pre-existing Download button elsewhere is never used
  id = await scene(`${kit};const old=document.createElement('button');old.textContent='Tải xuống';old.onclick=()=>window.__log.push('WRONG');document.body.append(old);document.getElementById('wrap').addEventListener('contextmenu',e=>{e.preventDefault();menuOf(${JSON.stringify(standard)},'Hôm nay lúc 22:25');});`);
  await run(id); assert.deepEqual(await log(), ['Tải xuống'], '2f: unrelated Download button untouched');
  // 2g) nothing opens: clear failure, nothing clicked
  id = await scene(`document.getElementById('wrap').addEventListener('contextmenu',e=>e.preventDefault());`);
  await assert.rejects(run(id), /Chưa bấm được Tải xuống của đúng ảnh/); assert.deepEqual(await log(), []);
  await browser.close();
  console.log('muse image menu smoke ok (history copies + rebuilt rows, right-click Tải xuống for pictures)');
})().catch(error => { console.error(error); process.exit(1); });
