// Real browser, fake chat page: image replies for the "Tạo ảnh" tab. Does not contact Muse.
const { chromium } = require('playwright-core');
const { beginTracking, pollTracking, readTrackedImage, endTracking } = require('../src/muse-tracker.cjs');
const { sniffImage, decodeDataUrl, saveImageBuffer } = require('../src/image-save.cjs');
const zlib = require('node:zlib');
const crypto = require('node:crypto');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const assert = require('node:assert/strict');

const table = [...Array(256)].map((_, n) => { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c >>> 0; });
const crc32 = buf => { let c = 0xffffffff; for (const b of buf) c = table[(c ^ b) & 0xff] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
function chunk(type, data) { const len = Buffer.alloc(4); len.writeUInt32BE(data.length); const td = Buffer.concat([Buffer.from(type), data]); const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(td)); return Buffer.concat([len, td, crc]); }
// Noisy pixels so the file is a realistic size (a flat colour would compress to a few bytes).
function png(w, h) {
  const stride = w * 3 + 1, raw = crypto.randomBytes(stride * h);
  for (let y = 0; y < h; y++) raw[y * stride] = 0;
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4); ihdr[8] = 8; ihdr[9] = 2;
  return Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), chunk('IHDR', ihdr), chunk('IDAT', zlib.deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]);
}
(async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'muse-image-fixture-'));
  let browser;
  try {
    const files = { old: png(220, 220), ref: png(64, 64), avatar: png(40, 40), slow: png(220, 220), a1: png(220, 220), a2: png(220, 220), swap: png(220, 220), big: png(220, 220), solo: png(220, 220), wide: png(440, 248), tall: png(248, 440), small: png(100, 100), wide2: png(220, 124), wide3: png(220, 124), wide4: png(220, 124), wide5: png(220, 124), wide6: png(220, 124), logo: png(220, 124) };
    browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || '/usr/bin/chromium', headless: true, args: ['--no-sandbox'] });
    const context = await browser.newContext();
    const html = '<!doctype html><html><body><div id="thread" data-chat-thread></div><aside id="unrelated"></aside><textarea id="composer"></textarea></body></html>';
    await context.route('**/*', async route => {
      const name = new URL(route.request().url()).pathname.match(/^\/img\/(\w+)\.png$/)?.[1];
      if (name && files[name]) { if (name === 'slow') await new Promise(r => setTimeout(r, 500)); return route.fulfill({ status: 200, contentType: 'image/png', body: files[name] }); }
      return route.fulfill({ status: 200, contentType: 'text/html', body: html });
    });
    const page = await context.newPage(); await page.goto('https://muse.ai/');
    const reset = async () => { await page.evaluate(() => { const m = globalThis[Symbol.for('MuseVideoStudio.promptTrackers.v1')]; if (m) { for (const s of m.values()) s.observer?.disconnect(); m.clear(); } }); await page.setContent(html); };
    // images: [{src,size,cls}]; role '' = plain div without author markup.
    async function append({ id, role = 'assistant', text = '', images = [], ref = '' }) {
      await page.evaluate(args => {
        const root = document.createElement('article'); root.id = args.id; if (args.role) root.dataset.messageRole = args.role;
        if (args.ref) root.setAttribute('data-response-to', args.ref);
        if (args.text) { const p = document.createElement('p'); p.textContent = args.text; root.append(p); }
        for (const item of args.images) { const img = document.createElement('img'); img.className = item.cls || 'result'; img.width = item.w || item.size; img.height = item.h || item.size; if (item.alt !== undefined) img.alt = item.alt; img.src = item.src; root.append(img); }
        document.getElementById('thread').append(root);
      }, { id, role, text, images, ref });
    }
    const loaded = id => page.waitForFunction(id => { const list = [...document.querySelectorAll(`#${id} img`)]; return list.length && list.every(i => i.complete && i.naturalWidth > 0); }, id);
    const track = (id, prompt, extra = {}) => page.evaluate(beginTracking, { id, prompt, mediaKind: 'image', settleMs: 250, ...extra });
    const poll = id => page.evaluate(pollTracking, { id });
    const waitReady = async id => { for (let i = 0; i < 30; i++) { const s = await poll(id); if (s.ready) return s; await new Promise(r => setTimeout(r, 120)); } throw Error('ảnh không sẵn sàng'); };
    const read = (id, index) => page.evaluate(readTrackedImage, { id, index });
    const bytes = item => decodeDataUrl(item.dataUrl);
    // Never deepEqual large Buffers: a mismatch would try to diff 100 KB of bytes.
    const same = (a, b, message) => assert.ok(Buffer.compare(a, b) === 0, message || 'ảnh đọc về khác ảnh trong trang');

    // A: old result and a reference thumbnail before sending; avatar and thumbnail are never results.
    await append({ id: 'old-reply', images: [{ src: '/img/old.png', size: 220 }] });
    await page.evaluate(() => { const i = document.createElement('img'); i.id = 'preview'; i.src = '/img/ref.png'; i.width = 64; i.height = 64; document.getElementById('unrelated').append(i); });
    await loaded('old-reply');
    await track('a', 'Vẽ con mèo xanh');
    assert.equal((await poll('a')).phase, 'waiting-prompt');
    await append({ id: 'user-a', role: 'user', text: 'Vẽ con mèo xanh', images: [{ src: '/img/ref.png', size: 64, cls: 'thumb' }] });
    let state = await poll('a'); assert.equal(state.ready, false); assert.equal(state.echoMatched, true);
    await append({ id: 'reply-a', ref: 'user-a', text: 'Đang tạo', images: [{ src: '/img/avatar.png', size: 40, cls: 'avatar' }, { src: '/img/slow.png', size: 220 }] });
    state = await poll('a'); assert.equal(state.ready, false); assert.notEqual(state.phase, 'ready');
    await loaded('reply-a');
    state = await poll('a'); assert.equal(state.ready, false, 'chưa qua thời gian ổn định');
    state = await waitReady('a'); assert.equal(state.count, 1); assert.match(state.url, /\/img\/slow\.png$/);
    const slow = await read('a', 0); assert.equal(slow.via, 'fetch'); same(bytes(slow), files.slow);
    await page.evaluate(endTracking, { id: 'a' });

    // B: several pictures in one reply are one result; each is read and saved in order.
    await reset();
    await track('b', 'Hai biến thể');
    await append({ id: 'user-b', role: 'user', text: 'Hai biến thể' });
    await append({ id: 'reply-b', ref: 'user-b', images: [{ src: '/img/a1.png', size: 220 }, { src: '/img/a2.png', size: 220 }, { src: '/img/a1.png', size: 220 }] });
    await loaded('reply-b');
    state = await waitReady('b'); assert.equal(state.count, 2, 'ảnh trùng nguồn chỉ tính một lần');
    const one = await read('b', 0), two = await read('b', 1);
    same(bytes(one), files.a1, 'ảnh thứ nhất'); same(bytes(two), files.a2, 'ảnh thứ hai');
    const out = path.join(dir, 'Anh');
    const job = { id: 'job-b', number: 7 };
    const first = await saveImageBuffer(bytes(one), out, job, { suffix: '_1' }), second = await saveImageBuffer(bytes(two), out, job, { suffix: '_2' });
    assert.equal(path.basename(first), '007_1.png'); assert.equal(path.basename(second), '007_2.png');
    const again = await saveImageBuffer(bytes(one), out, job, { suffix: '_1' }); assert.equal(path.basename(again), '007_1 (2).png', 'không ghi đè ảnh cũ');
    assert.deepEqual((await fs.readdir(out)).filter(f => f.startsWith('.')), [], 'không để file tạm');
    await page.evaluate(endTracking, { id: 'b' });

    // C: pictures spread over two reply blocks fail closed.
    await reset();
    await track('c', 'Hai khối');
    await append({ id: 'user-c', role: 'user', text: 'Hai khối' });
    await append({ id: 'reply-c1', ref: 'user-c', images: [{ src: '/img/a1.png', size: 220 }] });
    await append({ id: 'reply-c2', ref: 'user-c', images: [{ src: '/img/a2.png', size: 220 }] });
    await loaded('reply-c1'); await loaded('reply-c2');
    await assert.rejects(poll('c'), /nhiều khối phản hồi/);
    await page.evaluate(endTracking, { id: 'c' });

    // D: a picture that is replaced after it looked ready is not saved until it settles again.
    await reset();
    await track('d', 'Ảnh đổi');
    await append({ id: 'user-d', role: 'user', text: 'Ảnh đổi' });
    await append({ id: 'reply-d', ref: 'user-d', images: [{ src: '/img/a1.png', size: 220 }] });
    await loaded('reply-d'); state = await waitReady('d'); assert.match(state.url, /a1\.png$/);
    await page.evaluate(() => { document.querySelector('#reply-d img').src = '/img/swap.png'; });
    state = await poll('d'); assert.equal(state.ready, false);
    await loaded('reply-d'); state = await waitReady('d'); assert.match(state.url, /swap\.png$/);
    same(bytes(await read('d', 0)), files.swap);
    await page.evaluate(endTracking, { id: 'd' });

    // E: a text-only reply is never a result.
    await reset();
    await track('e', 'Chỉ chữ');
    await append({ id: 'user-e', role: 'user', text: 'Chỉ chữ' });
    await append({ id: 'reply-e', ref: 'user-e', text: 'Mình chưa vẽ được.' });
    state = await poll('e'); assert.equal(state.ready, false); assert.equal(state.phase, 'rendering');
    await append({ id: 'reply-e2', ref: 'user-e', text: 'Thử lại sau nhé.' });
    state = await poll('e'); assert.equal(state.ready, false);
    await page.evaluate(endTracking, { id: 'e' });

    // F: unmarked markup, a large reference picture inside the user's bubble, picture-only reply.
    await reset();
    await track('f', 'Ảnh không chữ');
    await append({ id: 'user-f', role: 'user', text: 'Ảnh không chữ', images: [{ src: '/img/big.png', size: 220, cls: 'thumb' }] });
    await append({ id: 'reply-f', role: '', images: [{ src: '/img/solo.png', size: 220 }] });
    await loaded('user-f'); await loaded('reply-f');
    state = await waitReady('f'); assert.equal(state.count, 1); assert.match(state.url, /solo\.png$/);
    await page.evaluate(endTracking, { id: 'f' });

    // H: Muse shows a generated picture as a thumbnail (about 220 px wide), so a 16:9 picture is only
    // ~124 px high. It must still be recognised (real run: the picture was in the chat but never saved).
    await track('h', 'Dao và cà rốt trên thớt');
    await append({ id: 'user-h', role: 'user', text: 'Dao và cà rốt trên thớt' });
    await append({ id: 'reply-h', text: 'Xong rồi.', images: [{ src: '/img/wide.png', w: 220, h: 124 }] });
    await loaded('reply-h');
    state = await waitReady('h'); assert.equal(state.count, 1); assert.match(state.url, /wide\.png$/);
    const wide = await read('h', 0); same(bytes(wide), files.wide); assert.deepEqual([wide.width, wide.height], [440, 248], 'báo kích thước thật của ảnh đã lưu');
    await page.evaluate(endTracking, { id: 'h' });
    await track('h2', 'Cảnh dọc');
    await append({ id: 'user-h2', role: 'user', text: 'Cảnh dọc' });
    await append({ id: 'reply-h2', text: 'Xong rồi.', images: [{ src: '/img/tall.png', w: 124, h: 220 }] });
    await loaded('reply-h2');
    state = await waitReady('h2'); assert.match(state.url, /tall\.png$/);
    await page.evaluate(endTracking, { id: 'h2' });
    // A picture that really is tiny is still not a result, and the card says why.
    await track('h3', 'Cảnh nhỏ');
    await append({ id: 'user-h3', role: 'user', text: 'Cảnh nhỏ' });
    await append({ id: 'reply-h3', text: 'Xong rồi.', images: [{ src: '/img/small.png', size: 70 }] });
    await loaded('reply-h3');
    for (let i = 0; i < 4; i++) { state = await poll('h3'); assert.equal(state.ready, false); await new Promise(r => setTimeout(r, 120)); }
    assert.match(`${state.hint || ''} ${state.stage}`, /thấy 1 ảnh nhưng chưa nhận: quá nhỏ \(70×70 px, tối thiểu 80\)/);
    await page.evaluate(endTracking, { id: 'h3' });

    // I: Muse shows the same prompt twice ("not confirmed as sent", then sent again): the one reply after
    // both copies answers this prompt. Another, different message before the reply still blocks it.
    await track('i', 'Rửa cà rốt dưới vòi nước');
    await append({ id: 'user-i1', role: 'user', text: 'Rửa cà rốt dưới vòi nước' });
    await page.waitForTimeout(150);
    state = await poll('i'); assert.equal(state.echoMatched, true);
    await append({ id: 'user-i2', role: 'user', text: 'Rửa cà rốt dưới vòi nước' });
    await append({ id: 'reply-i', text: 'Xong bản mới.', images: [{ src: '/img/wide2.png', w: 220, h: 124 }] });
    await loaded('reply-i');
    state = await waitReady('i'); assert.equal(state.count, 1); assert.match(state.url, /wide2\.png$/);
    await page.evaluate(endTracking, { id: 'i' });
    await track('i2', 'Cắt cà rốt thành khúc');
    await append({ id: 'user-i3', role: 'user', text: 'Cắt cà rốt thành khúc' });
    await page.waitForTimeout(150);
    state = await poll('i2'); assert.equal(state.echoMatched, true);
    await append({ id: 'user-i4', role: 'user', text: 'Một câu khác hẳn' });
    await append({ id: 'reply-i2', text: 'Xong.', images: [{ src: '/img/wide3.png', w: 220, h: 124 }] });
    await loaded('reply-i2');
    for (let k = 0; k < 4; k++) { state = await poll('i2'); assert.equal(state.ready, false); await new Promise(r => setTimeout(r, 120)); }
    await page.evaluate(endTracking, { id: 'i2' });

    // Both copies already on screen at the first look: the first one is this prompt's message.
    await track('i3', 'Đặt cà rốt vào nồi');
    await append({ id: 'user-i5', role: 'user', text: 'Đặt cà rốt vào nồi' });
    await append({ id: 'user-i6', role: 'user', text: 'Đặt cà rốt vào nồi' });
    await append({ id: 'reply-i3', text: 'Xong bản mới.', images: [{ src: '/img/wide4.png', w: 220, h: 124 }] });
    await loaded('reply-i3');
    state = await waitReady('i3'); assert.equal(state.count, 1);
    await page.evaluate(endTracking, { id: 'i3' });
    // A video prompt (or a resumed job) with two identical messages still refuses to guess.
    await track('i4', 'Khuấy nồi canh', { mediaKind: 'video', videoSelector: 'video' });
    await append({ id: 'user-i7', role: 'user', text: 'Khuấy nồi canh' });
    await append({ id: 'user-i8', role: 'user', text: 'Khuấy nồi canh' });
    await assert.rejects(poll('i4'), /nhiều tin nhắn trùng chính xác prompt/);
    await page.evaluate(endTracking, { id: 'i4' });

    // J: the picture's alt text may repeat the prompt ("không logo"), and its address may contain a word
    // like "logo": a result of normal size is still a result. Only small pictures are judged by those words.
    await track('j', 'Đặt khăn lên thớt');
    await append({ id: 'user-j', role: 'user', text: 'Đặt khăn lên thớt' });
    await append({ id: 'reply-j', text: 'Xong.', images: [{ src: '/img/wide5.png', w: 220, h: 124, alt: 'Tạo ảnh chụp thật, không chữ, không số, không logo, không hình mờ' }] });
    await loaded('reply-j');
    state = await waitReady('j'); assert.match(state.url, /wide5\.png$/);
    await page.evaluate(endTracking, { id: 'j' });
    await track('j2', 'Lau mặt bàn');
    await append({ id: 'user-j2', role: 'user', text: 'Lau mặt bàn' });
    await append({ id: 'reply-j2', text: 'Xong.', images: [{ src: '/img/logo.png', w: 220, h: 124, alt: 'icon' }] });
    await loaded('reply-j2');
    state = await waitReady('j2'); assert.match(state.url, /logo\.png$/);
    await page.evaluate(endTracking, { id: 'j2' });
    await track('j3', 'Gấp khăn');
    await append({ id: 'user-j3', role: 'user', text: 'Gấp khăn' });
    await append({ id: 'reply-j3', text: 'Xong.', images: [{ src: '/img/wide6.png', w: 100, h: 100, alt: 'icon' }] });
    await loaded('reply-j3');
    for (let k = 0; k < 3; k++) { state = await poll('j3'); assert.equal(state.ready, false); await new Promise(r => setTimeout(r, 120)); }
    assert.match(`${state.hint || ''} ${state.stage}`, /thấy 1 ảnh nhưng chưa nhận: giống biểu tượng hoặc avatar/);
    await page.evaluate(endTracking, { id: 'j3' });

    // G: the saver only accepts real pictures.
    assert.equal(sniffImage(files.old).extension, '.png');
    assert.equal(sniffImage(Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(32)])).extension, '.jpg');
    assert.equal(sniffImage(Buffer.concat([Buffer.from('RIFF'), Buffer.alloc(4), Buffer.from('WEBPVP8 '), Buffer.alloc(16)])).extension, '.webp');
    assert.equal(sniffImage(Buffer.concat([Buffer.from('GIF89a'), Buffer.alloc(32)])).extension, '.gif');
    assert.equal(sniffImage(Buffer.from('<html>' + 'x'.repeat(2000))), null);
    await assert.rejects(saveImageBuffer(Buffer.from('<html>' + 'x'.repeat(2000)), out, { id: 'x', number: 1 }), /không phải ảnh/);
    await assert.rejects(saveImageBuffer(Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(40)]), out, { id: 'x', number: 1 }), /quá nhỏ/);
    assert.deepEqual((await fs.readdir(out)).filter(f => f.startsWith('.')), []);
    console.log('muse image smoke ok');
  } finally {
    await browser?.close();
    await fs.rm(dir, { recursive: true, force: true });
  }
})().catch(error => { console.error(error); process.exit(1); });
