// Điều khiển trang Google Flow (flow.google.com) bằng Playwright, như một người dùng: chọn chế độ, thêm ảnh khung đầu, nhập câu lệnh, gửi,
// chờ thẻ video tạo xong, tải 720p gốc. Nút nhận theo CHỮ trên giao diện (Việt / Anh) và theo tên biểu tượng Material (add, close, more_vert,
// arrow_forward) — các biểu tượng không đổi theo ngôn ngữ. Khi một bước lỗi, driver tự lưu ảnh chụp + bản đồ nút của trang vào thư mục báo lỗi.
const fs = require('node:fs/promises');
const path = require('node:path');
const { randomUUID } = require('node:crypto');

const RE = {
  modeImage: /^(hình ảnh|image|images)$/i,
  modeVideo: /^video$/i,
  frames: /^(khung hình|frames?|frames to video)$/i,
  cost: /(quá trình tạo sẽ tốn|will cost|generation will use|this will use)/i,
  startSlot: /^(bắt đầu|start|first frame)$/i,
  frameDialog: /(chọn một hình ảnh khung|choose a frame|select a frame)/i,
  upload: /(tải nội dung|tải lên|upload)/i,
  addToPrompt: /^(thêm vào câu lệnh|add to prompt)$/i,
  download: /^(tải xuống|download)$/i,
  original: /(kích thước gốc|original size|original)/i,
  failed: /(không thể tạo|không tạo được|tạo không thành công|thất bại|bị chặn|vi phạm|chính sách|không phù hợp|failed|couldn.?t (generate|create)|blocked|violat|policy|something went wrong|đã xảy ra lỗi)/i,
  noCredits: /(hết tín dụng|không đủ tín dụng|out of credits|not enough credits|insufficient credits)/i,
  signIn: /(sign in|đăng nhập)/i
};
const MODEL_RE = { lite: /veo 3\.1\s*[-–—]?\s*lite/i, fast: /veo 3\.1\s*[-–—]?\s*fast/i, quality: /veo 3\.1\s*[-–—]?\s*quality/i };
const stopped = () => Object.assign(Error('Đã dừng.'), { name: 'AbortError' });
const sleep = ms => new Promise(r => setTimeout(r, ms));
let debugDir = '';
function configure(options = {}) { if (typeof options.debugDir === 'string') debugDir = options.debugDir; }

async function mapOfPage(page) {
  return page.evaluate(() => {
    const seen = new Map();
    document.querySelectorAll('button,[role=button],[role=tab],[role=menuitem],[role=option],[role=combobox],[role=dialog],[role=menu],textarea,input,[contenteditable],[aria-label],video,img').forEach(e => {
      const r = e.getBoundingClientRect(), file = e.tagName === 'INPUT' && e.type === 'file';
      if ((!r.width || !r.height) && !file) return;
      const text = (e.innerText || e.value || '').trim().replace(/\s+/g, ' ').slice(0, 40);
      const key = [e.tagName.toLowerCase(), e.getAttribute('role') || '', (e.getAttribute('aria-label') || '').slice(0, 40), text, e.id || '', e.getAttribute('type') || '', String(e.className && e.className.baseVal !== undefined ? e.className.baseVal : e.className).split(' ').slice(0, 2).join('.')].join(' | ');
      const v = seen.get(key);
      if (v) v.n++; else seen.set(key, { n: 1, p: Math.round(r.x) + ',' + Math.round(r.y) });
    });
    return [...seen].map(([k, v]) => v.n + 'x | ' + k + ' | ' + v.p).join('\n');
  });
}
// Lưu ảnh chụp + bản đồ nút khi một bước lỗi. Không bao giờ ném lỗi.
async function diagnose(page, step, error) {
  if (!debugDir) return '';
  try {
    await fs.mkdir(debugDir, { recursive: true });
    const base = path.join(debugDir, `${new Date().toISOString().replace(/[:.]/g, '-')}-${step}`);
    const lines = [`step: ${step}`, `error: ${error && error.message}`, `url: ${page.url()}`, '', await mapOfPage(page).catch(e => 'map failed: ' + e.message)];
    await fs.writeFile(base + '.txt', lines.join('\n'));
    await page.screenshot({ path: base + '.png' }).catch(() => {});
    return base;
  } catch { return ''; }
}
async function guarded(page, step, fn) {
  try { return await fn(); }
  catch (e) {
    if (e && (e.name === 'AbortError' || e.code === 'FLOW_NOTICE')) throw e;
    const file = await diagnose(page, step, e);
    const err = Error(`Flow: bước «${step}» chưa làm được (${String(e.message).split('\n')[0].slice(0, 200)}).${file ? ' Đã lưu ảnh chụp và cấu trúc trang tại ' + file + '.txt/.png để sửa.' : ''}`);
    err.cause = e; throw err;
  }
}

const vis = locator => locator.filter({ visible: true });
const promptBox = page => vis(page.locator('div[role="textbox"], .ProseMirror[contenteditable="true"]')).first();
const barOf = page => promptBox(page).locator('xpath=ancestor::*[.//button[@type="submit"]][1]');
const submitButton = page => vis(barOf(page).locator('button[type="submit"]')).first();
const settingsButton = page => vis(barOf(page).locator('button').filter({ hasText: /crop_\d+_\d+/ })).last();
const costText = page => vis(page.getByText(RE.cost)).first();
const menuRoot = page => page.locator('div').filter({ has: page.getByText(RE.cost) }).filter({ has: page.getByText(/^16:9$/) }).last();

async function ensureReady(page, { projectUrl } = {}) {
  if (!projectUrl) throw Error('Chưa có đường dẫn dự án Flow trong Cài đặt.');
  const base = new URL(projectUrl);
  const here = (() => { try { return new URL(page.url()); } catch { return null; } })();
  if (!here || here.origin !== base.origin || !here.pathname.startsWith(base.pathname.replace(/\/+$/, ''))) {
    await page.goto(projectUrl, { waitUntil: 'domcontentloaded', timeout: 45000 });
  }
  const box = promptBox(page);
  try { await box.waitFor({ state: 'visible', timeout: 45000 }); }
  catch (e) {
    const onSignIn = /accounts\.google\.com/.test(page.url()) || await vis(page.getByText(RE.signIn)).count().catch(() => 0) > 0;
    const err = Error(onSignIn ? 'Chưa đăng nhập Google trong cửa sổ Flow. Đăng nhập (gói Ultra) rồi bấm Tiếp tục.' : 'Chưa thấy ô nhập câu lệnh của Flow (trang chưa tải xong hoặc đã đổi giao diện).');
    err.code = onSignIn ? 'FLOW_NOTICE' : undefined;
    if (!onSignIn) { await diagnose(page, 'ensureReady', err); }
    throw err;
  }
}

async function openSettings(page) {
  if (await costText(page).count()) return;
  await settingsButton(page).click();
  await costText(page).waitFor({ state: 'visible', timeout: 10000 });
}
async function closeSettings(page) {
  for (let i = 0; i < 3 && await costText(page).count(); i++) {
    await page.keyboard.press('Escape');
    await sleep(250);
    if (await costText(page).count()) await page.mouse.click(Math.round((page.viewportSize()?.width || 1200) * 0.8), 120).catch(() => {});
    await sleep(250);
  }
}
async function clickIn(root, re, what, { last = true } = {}) {
  const target = vis(root.getByText(re));
  const n = await target.count();
  if (!n) throw Error(`không thấy nút «${what}»`);
  await (last ? target.last() : target.first()).click();
  await sleep(200);
}

async function applyOptions(page, spec) {
  await openSettings(page);
  const root = menuRoot(page);
  await clickIn(root, spec.kind === 'image' ? RE.modeImage : RE.modeVideo, spec.kind === 'image' ? 'Hình ảnh' : 'Video');
  if (spec.kind === 'video') await clickIn(menuRoot(page), RE.frames, 'Khung hình');
  await clickIn(menuRoot(page), spec.aspect === '9:16' ? /^9:16$/ : /^16:9$/, spec.aspect);
  if (spec.kind === 'video') {
    const want = MODEL_RE[spec.model] || MODEL_RE.lite;
    const current = menuRoot(page).getByText(/veo 3\.1/i);
    const label = ((await vis(current).first().textContent().catch(() => '')) || '').trim();
    if (!want.test(label)) {
      await vis(current).first().click();
      await sleep(300);
      const option = vis(page.getByText(want));
      if (!await option.count()) throw Error('không thấy mô hình ' + spec.model + ' trong danh sách');
      await option.last().click();
      await sleep(300);
    }
    const secs = Number(spec.seconds) || 8;
    await clickIn(menuRoot(page), new RegExp(`^${secs}\\s*(giây|s|sec|seconds)$`, 'i'), secs + ' giây');
  }
  await clickIn(menuRoot(page), /^x1$/i, 'x1');
  await closeSettings(page);
}

async function clearPrompt(page) {
  const box = promptBox(page);
  await box.click();
  await page.keyboard.press('Control+A');
  await page.keyboard.press('Backspace');
}
async function typePrompt(page, text) {
  const box = promptBox(page);
  await box.click();
  await page.keyboard.insertText(String(text));
  await sleep(300);
  const typed = ((await box.innerText()) || '').replace(/\s+/g, ' ').trim();
  if (typed.length < Math.min(20, String(text).trim().length)) throw Error('ô câu lệnh chưa nhận chữ');
}

const uploadButton = page => vis(page.locator('button').filter({ hasText: RE.upload }).or(page.locator('button[aria-label*="ải nội dung" i], button[aria-label*="pload" i]'))).first();
const addToPromptButton = page => vis(page.locator('button').filter({ hasText: RE.addToPrompt })).first();

// Mở hộp chọn (ô khung đầu hoặc nút +), tải tệp lên, chọn ảnh vừa tải và «Thêm vào câu lệnh».
async function pickUploadedFile(page, file, opener) {
  await opener.click();
  const upload = uploadButton(page);
  await upload.waitFor({ state: 'visible', timeout: 15000 });
  const [chooser] = await Promise.all([page.waitForEvent('filechooser', { timeout: 15000 }), upload.click()]);
  await chooser.setFiles(file);
  const deadline = Date.now() + 90000;
  let lastClick = 0, added = false;
  while (Date.now() < deadline) {
    const add = addToPromptButton(page);
    if (await add.count() && await add.isEnabled().catch(() => false)) { await add.click(); added = true; break; }
    if (Date.now() - lastClick > 3000) {
      // Ảnh vừa tải nằm đầu danh sách (sắp xếp «Gần đây»): bấm vào để hiện bản xem trước và nút «Thêm vào câu lệnh».
      const item = vis(page.locator('img').filter({ visible: true })).first();
      if (await item.count()) { await item.click().catch(() => {}); lastClick = Date.now(); }
    }
    await sleep(500);
  }
  if (!added) throw Error('ảnh tải lên chưa sẵn sàng để thêm vào câu lệnh');
  await upload.waitFor({ state: 'hidden', timeout: 15000 }).catch(() => {});
  await sleep(500);
}
async function attachFrame(page, file) {
  const slot = vis(barOf(page).getByText(RE.startSlot)).first();
  if (!await slot.count()) throw Error('không thấy ô «Bắt đầu» (chưa ở chế độ Khung hình)');
  await pickUploadedFile(page, file, slot);
}
async function attachReference(page, file) {
  const add = vis(barOf(page).locator('button').filter({ hasText: /^add$/ })).first();
  if (!await add.count()) throw Error('không thấy nút + thêm ảnh');
  await pickUploadedFile(page, file, add);
}

// Các thẻ kết quả trong lưới: thẻ = tổ tiên gần nhất (kích thước hợp lý, nằm ngoài thanh nhập lệnh, thanh bên và hộp thoại) của video / ảnh / vòng chờ / nút ⋮.
function collectTiles({ failedSrc } = {}) {
  const failedRe = failedSrc ? new RegExp(failedSrc, 'i') : null;
  const bar = document.querySelector('[role=textbox], .ProseMirror')?.closest('div:has(button[type=submit])');
  const inside = (el, root) => root && root.contains(el);
  const seeds = [...document.querySelectorAll('video, img, [role=progressbar], mat-progress-spinner, mat-spinner, mat-progress-bar, [class*="progress" i], [class*="spinner" i], [class*="generating" i], button')]
    .filter(el => el.tagName !== 'BUTTON' || (el.textContent || '').trim() === 'more_vert');
  // chữ phần trăm / chữ báo lỗi nằm trong thẻ đang tạo hoặc thẻ lỗi
  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  for (let node = walker.nextNode(); node; node = walker.nextNode()) {
    const t = node.nodeValue.trim();
    if (t && (/^\d{1,3}\s*%$/.test(t) || (failedRe && failedRe.test(t)))) seeds.push(node.parentElement);
  }
  const tiles = new Set();
  for (const seed of seeds) {
    if (!seed || inside(seed, bar) || seed.closest('[role=dialog], .cdk-overlay-container, header, nav, aside')) continue;
    let el = seed;
    for (let i = 0; i < 8 && el; i++, el = el.parentElement) {
      const r = el.getBoundingClientRect();
      if (r.width >= 140 && r.width <= 1000 && r.height >= 90 && r.height <= 800 && r.left > 200) { tiles.add(el); break; }
    }
  }
  // chỉ giữ thẻ ngoài cùng (bỏ thẻ nằm trong thẻ khác)
  const list = [...tiles].filter(t => ![...tiles].some(o => o !== t && o.contains(t)));
  list.sort((a, b) => { const x = a.getBoundingClientRect(), y = b.getBoundingClientRect(); return Math.abs(x.top - y.top) > 20 ? x.top - y.top : x.left - y.left; });
  return list.map(t => {
    const video = t.querySelector('video'), img = t.querySelector('img');
    const text = (t.textContent || '').replace(/\s+/g, ' ').replace(/more_vert/g, '').trim();
    if (!t.dataset.museFlow) t.dataset.museFlow = 'f' + Math.random().toString(36).slice(2, 10);
    return { mark: t.dataset.museFlow, text: text.slice(0, 300), video: video ? (video.currentSrc || video.src || (video.querySelector('source') || {}).src || '') : '', videoReady: video ? video.readyState >= 1 : false,
      img: img ? img.currentSrc || img.src || '' : '', imgReady: img ? img.complete && img.naturalWidth > 0 : false, pct: (/(\d{1,3})\s*%/.exec(text) || [])[1] || '' };
  });
}
const tilesOf = page => page.evaluate(collectTiles, { failedSrc: RE.failed.source });

async function submit(page, spec, { signal } = {}) {
  const check = () => { if (signal?.aborted) throw stopped(); };
  check();
  await guarded(page, 'chọn chế độ', () => applyOptions(page, spec));
  check();
  await guarded(page, 'xóa câu lệnh cũ', () => clearPrompt(page));
  if (spec.kind === 'video') {
    if (!spec.startFrame) throw Error('Cảnh video của Flow cần ảnh khung đầu.');
    await guarded(page, 'thêm ảnh khung đầu', () => attachFrame(page, spec.startFrame));
  } else {
    for (const file of (spec.references || []).slice(0, 3)) await guarded(page, 'thêm ảnh tham chiếu', () => attachReference(page, file));
  }
  check();
  await guarded(page, 'nhập câu lệnh', () => typePrompt(page, spec.prompt));
  check();
  const before = new Set((await tilesOf(page)).map(t => t.mark));
  const noCredits = await vis(page.getByText(RE.noCredits)).count().catch(() => 0);
  if (noCredits) { const e = Error('Flow báo hết tín dụng. Chờ tín dụng làm mới (hoặc mua thêm) rồi bấm Tiếp tục.'); e.code = 'FLOW_NOTICE'; throw e; }
  await guarded(page, 'bấm tạo', async () => {
    const button = submitButton(page);
    if (!await button.isEnabled()) throw Error('nút tạo đang bị khóa (thiếu ảnh khung hoặc câu lệnh)');
    await button.click();
  });
  // thẻ mới xuất hiện (thường ở đầu lưới)
  const deadline = Date.now() + 90000;
  while (Date.now() < deadline) {
    check();
    const tiles = await tilesOf(page);
    const fresh = tiles.find(t => !before.has(t.mark));
    if (fresh) return { id: fresh.mark };
    await sleep(700);
  }
  const err = Error('Đã bấm tạo nhưng chưa thấy thẻ mới trong Flow.');
  await diagnose(page, 'thẻ mới', err);
  throw err;
}

async function findTile(page, card) {
  const tiles = await tilesOf(page);
  return tiles.find(t => t.mark === card.id) || (card.src ? tiles.find(t => t.video === card.src || t.img === card.src) : null) || null;
}
async function status(page, card) {
  const tile = await findTile(page, card);
  if (!tile) {
    const err = Error('Flow không còn thẻ của cảnh này (đã bị xóa hoặc trang đã tải lại).');
    await diagnose(page, 'mất thẻ', err);
    return { state: 'failed', error: err.message };
  }
  const image = card.kind === 'image';
  const ready = image ? tile.imgReady : tile.videoReady && tile.video;
  if (ready && !tile.pct) return { state: 'done', src: image ? tile.img : tile.video };
  if (RE.failed.test(tile.text) && !tile.pct) return { state: 'failed', error: 'Flow không tạo được cảnh này: «' + tile.text.slice(0, 160) + '»' };
  return { state: 'generating', progress: tile.pct ? Number(tile.pct) : undefined };
}

async function download(page, card, target, { kind = 'video', signal } = {}) {
  if (signal?.aborted) throw stopped();
  return guarded(page, 'tải xuống', async () => {
    const handle = await page.evaluateHandle(mark => document.querySelector(`[data-muse-flow="${mark}"]`), card.id);
    let tile = handle.asElement();
    if (!tile) { const found = await findTile(page, card); if (found) tile = (await page.evaluateHandle(mark => document.querySelector(`[data-muse-flow="${mark}"]`), found.mark)).asElement(); }
    if (!tile) throw Error('không thấy thẻ để tải');
    await tile.scrollIntoViewIfNeeded();
    await tile.hover();
    const markOf = await tile.getAttribute('data-muse-flow');
    const more = page.locator(`[data-muse-flow="${markOf}"] button`).filter({ hasText: /^more_vert$/ }).first();
    await more.waitFor({ state: 'visible', timeout: 10000 });
    await more.click();
    const item = vis(page.getByText(RE.download)).last();
    await item.waitFor({ state: 'visible', timeout: 10000 });
    await item.hover();
    await item.click().catch(() => {});
    const option = vis(page.getByText(kind === 'image' ? RE.original : /^720p$/)).first();
    await option.waitFor({ state: 'visible', timeout: 10000 });
    await fs.mkdir(path.dirname(target), { recursive: true });
    const [download] = await Promise.all([page.waitForEvent('download', { timeout: 180000 }), option.click()]);
    await download.saveAs(target);
    const failure = await download.failure();
    if (failure) throw Error('tải xuống bị lỗi: ' + failure);
    await page.keyboard.press('Escape').catch(() => {});
    return target;
  });
}

module.exports = { configure, ensureReady, submit, status, download, tilesOf, mapOfPage, diagnose, RE, collectTiles };
