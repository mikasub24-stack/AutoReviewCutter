const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const D = require('../src/flow-driver.cjs');

const chromiumPath = process.env.CHROMIUM_PATH || undefined;
const hasFfmpeg = spawnSync('ffmpeg', ['-version']).status === 0;
const opts = { skip: !hasFfmpeg && 'cần ffmpeg để tạo clip thử' };

async function setup() {
  const { chromium } = require('playwright-core');
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'flowdrv-'));
  const clip = n => { const f = path.join(dir, `c${n}.mp4`); const r = spawnSync('ffmpeg', ['-y', '-v', 'error', '-f', 'lavfi', '-i', `testsrc=size=320x180:rate=24:duration=${1 + n * 0.2}`, '-pix_fmt', 'yuv420p', f]); assert.equal(r.status, 0, String(r.stderr)); return f; };
  const png = path.join(dir, 'frame.png');
  assert.equal(spawnSync('ffmpeg', ['-y', '-v', 'error', '-f', 'lavfi', '-i', 'testsrc=size=320x180:rate=1', '-frames:v', '1', png]).status, 0);
  const html = await fs.readFile(path.join(__dirname, 'fixtures', 'fake-flow.html'));
  const clips = {}; for (let n = 1; n <= 4; n++) clips[n] = clip(n);
  const http = require('node:http');
  const server = http.createServer(async (req, res) => {
    const u = new URL(req.url, 'http://x');
    const dl = u.searchParams.get('dl');
    const send = async (type, file, name) => { const body = await fs.readFile(file); res.writeHead(200, { 'content-type': dl ? 'application/octet-stream' : type, 'content-length': body.length, ...(dl ? { 'content-disposition': `attachment; filename=${name}` } : {}) }); res.end(body); };
    if (u.pathname.startsWith('/project/')) { res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' }); return res.end(html); }
    const m = /^\/clip(\d+)\.mp4$/.exec(u.pathname);
    if (m && clips[m[1]]) return send('video/mp4', clips[m[1]], 'flow.mp4');
    if (u.pathname === '/img.png') return send('image/png', png, 'flow.png');
    res.writeHead(404); res.end();
  });
  await new Promise(r => server.listen(0, '127.0.0.1', r));
  const base = `http://127.0.0.1:${server.address().port}`;
  const browser = await chromium.launch({ executablePath: chromiumPath });
  const context = await browser.newContext({ acceptDownloads: true, viewport: { width: 1280, height: 800 } });
  const page = await context.newPage();
  D.configure({ debugDir: path.join(dir, 'debug') });
  return { dir, png, page, browser, clips, url: base + '/project/test-123', close: async () => { await browser.close(); server.close(); await fs.rm(dir, { recursive: true, force: true }); } };
}
async function waitDone(page, card, ms = 20000) {
  const end = Date.now() + ms; let s;
  while (Date.now() < end) { s = await D.status(page, card); if (s.state !== 'generating') return s; await new Promise(r => setTimeout(r, 200)); }
  throw Error('quá thời gian: ' + JSON.stringify(s));
}
const log = page => page.evaluate(() => window.state.log);

test('Flow driver: một clip video — chọn Khung hình / Fast / 8 giây, thêm ảnh khung đầu, gửi, chờ xong, tải 720p đúng thẻ', opts, async () => {
  const t = await setup();
  try {
    await D.ensureReady(t.page, { projectUrl: t.url });
    const card = await D.submit(t.page, { kind: 'video', prompt: 'Clean the room fast', startFrame: t.png, aspect: '16:9', seconds: 8, model: 'fast' });
    assert.ok(card.id);
    const first = await D.status(t.page, { ...card, kind: 'video' });
    assert.ok(['generating', 'done'].includes(first.state));
    const done = await waitDone(t.page, { ...card, kind: 'video' });
    assert.equal(done.state, 'done');
    assert.match(done.src, /clip1\.mp4/);
    const target = path.join(t.dir, 'out', 'clip.mp4');
    await D.download(t.page, { ...card, kind: 'video' }, target, { kind: 'video' });
    assert.deepEqual(await fs.readFile(target), await fs.readFile(t.clips[1]));
    const l = await log(t.page);
    assert.ok(l.includes('menu:Khung hình'));
    assert.ok(l.includes('model:Veo 3.1 - Fast'), l.join(' | '));
    assert.ok(l.some(x => x.startsWith('upload:frame.png')));
    assert.ok(l.some(x => /^submit:Clean the room fast:Veo 3.1 - Fast:8 giây:video$/.test(x)), l.join(' | '));
    assert.ok(l.includes('dl:720p:1'));
  } finally { await t.close(); }
});

test('Flow driver: hai clip gửi liên tiếp rồi chờ song song — mỗi thẻ tải đúng clip của nó', opts, async () => {
  const t = await setup();
  try {
    await D.ensureReady(t.page, { projectUrl: t.url });
    const a = { ...(await D.submit(t.page, { kind: 'video', prompt: 'A scene', startFrame: t.png, aspect: '16:9', seconds: 8, model: 'lite' })), kind: 'video' };
    const b = { ...(await D.submit(t.page, { kind: 'video', prompt: 'B scene', startFrame: t.png, aspect: '9:16', seconds: 8, model: 'lite' })), kind: 'video' };
    assert.notEqual(a.id, b.id);
    const [da, db] = await Promise.all([waitDone(t.page, a), waitDone(t.page, b)]);
    assert.equal(da.state, 'done'); assert.equal(db.state, 'done');
    const fa = path.join(t.dir, 'a.mp4'), fb = path.join(t.dir, 'b.mp4');
    await D.download(t.page, b, fb, { kind: 'video' });   // tải cái gửi sau trước: thẻ nằm ở đầu lưới
    await D.download(t.page, a, fa, { kind: 'video' });
    assert.deepEqual(await fs.readFile(fa), await fs.readFile(t.clips[1]));
    assert.deepEqual(await fs.readFile(fb), await fs.readFile(t.clips[2]));
  } finally { await t.close(); }
});

test('Flow driver: Flow từ chối cảnh thì báo lỗi kèm lý do', opts, async () => {
  const t = await setup();
  try {
    await D.ensureReady(t.page, { projectUrl: t.url });
    const card = { ...(await D.submit(t.page, { kind: 'video', prompt: 'BLOCKME please', startFrame: t.png, aspect: '16:9', seconds: 8, model: 'lite' })), kind: 'video' };
    const s = await waitDone(t.page, card);
    assert.equal(s.state, 'failed');
    assert.match(s.error, /vi phạm chính sách/);
  } finally { await t.close(); }
});

test('Flow driver: ảnh mốc — chế độ Hình ảnh, thêm ảnh tham chiếu bằng nút +, tải ảnh', opts, async () => {
  const t = await setup();
  try {
    await D.ensureReady(t.page, { projectUrl: t.url });
    const card = { ...(await D.submit(t.page, { kind: 'image', prompt: 'Edit the photo', references: [t.png], aspect: '9:16', seconds: 0, model: 'lite' })), kind: 'image' };
    const done = await waitDone(t.page, card);
    assert.equal(done.state, 'done');
    const target = path.join(t.dir, 'img.png');
    await D.download(t.page, card, target, { kind: 'image' });
    assert.deepEqual(await fs.readFile(target), await fs.readFile(t.png));
    const l = await log(t.page);
    assert.ok(l.includes('menu:Hình ảnh') && l.includes('added:ref'), l.join(' | '));
    assert.ok(l.some(x => /^submit:Edit the photo:.*:image$/.test(x)), l.join(' | '));
  } finally { await t.close(); }
});

test('Flow driver: thiếu ảnh khung thì từ chối; chưa có dự án thì báo; lỗi bước nào cũng lưu ảnh chụp + cấu trúc trang để sửa', opts, async () => {
  const t = await setup();
  try {
    await assert.rejects(D.ensureReady(t.page, { projectUrl: '' }), /đường dẫn dự án/);
    await D.ensureReady(t.page, { projectUrl: t.url });
    await assert.rejects(D.submit(t.page, { kind: 'video', prompt: 'x', startFrame: '', aspect: '16:9', seconds: 8, model: 'lite' }), /khung đầu/);
    // Làm hỏng giao diện: bỏ ô «Bắt đầu» → báo lỗi bước kèm đường dẫn báo lỗi.
    await t.page.evaluate(() => document.getElementById('slotStart').remove());
    await assert.rejects(D.submit(t.page, { kind: 'video', prompt: 'x', startFrame: t.png, aspect: '16:9', seconds: 8, model: 'lite' }), /thêm ảnh khung đầu.*flow-debug|thêm ảnh khung đầu.*debug/s);
    const files = await fs.readdir(path.join(t.dir, 'debug'));
    assert.ok(files.some(f => f.endsWith('.png')) && files.some(f => f.endsWith('.txt')));
    const txt = await fs.readFile(path.join(t.dir, 'debug', files.find(f => f.endsWith('.txt'))), 'utf8');
    assert.match(txt, /ULTRA|Khung hình|arrow_forward/);
  } finally { await t.close(); }
});
