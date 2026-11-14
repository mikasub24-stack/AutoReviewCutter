// Lay link video Douyin truc tiep bang chinh trinh duyet cua ban (da dang nhap, da qua chong bot).
// Chay o nen de dong popup van tiep tuc.
let job = { running: false, done: 0, total: 0, ok: 0, stop: false };
const sleep = ms => new Promise(r => setTimeout(r, ms));
const saveJob = () => chrome.storage.local.set({ grabJob: job });

// ---- Dang ky script "nghe" du lieu bo / tap cua Douyin (hook.js), chay ngay khi trang Douyin bat dau tai ----
const HOOK_ID = "ythook";
const HOOK_MATCHES = ["*://*.douyin.com/*"];
async function ensureHook(force) {
  try {
    const ok = await chrome.permissions.contains({ origins: HOOK_MATCHES });
    const cur = await chrome.scripting.getRegisteredContentScripts({ ids: [HOOK_ID] }).catch(() => []);
    if (!ok) { if (cur.length) await chrome.scripting.unregisterContentScripts({ ids: [HOOK_ID] }); return; }
    if (cur.length && !force) return;
    if (cur.length) await chrome.scripting.unregisterContentScripts({ ids: [HOOK_ID] });
    await chrome.scripting.registerContentScripts([{
      id: HOOK_ID, js: ["hook.js"], matches: HOOK_MATCHES, runAt: "document_start", world: "MAIN", allFrames: false, persistAcrossSessions: true
    }]);
  } catch (e) { /* khong dang ky duoc thi popup se tu chen hook.js luc quet */ }
}
chrome.runtime.onInstalled.addListener(() => ensureHook(true));
chrome.runtime.onStartup.addListener(() => ensureHook(false));
chrome.permissions.onAdded.addListener(() => ensureHook(false));
chrome.permissions.onRemoved.addListener(() => ensureHook(false));
ensureHook(false);

// Ham chay TRONG trang video Douyin (phai tu chua)
function pageGrab(expectedId) {
  const id = String(expectedId || "");
  if (!/^\d{8,}$/.test(id)) return { id: "", urls: [], title: document.title || "" };
  const urls = [], seen = new Set();
  // Only media URL fields of this exact aweme are trusted. Resource timing and
  // arbitrary <video> nodes can be recommendation/preload clips, so never use them.
  const norm = value => {
    if (typeof value !== "string" || !value) return "";
    const text = value.startsWith("//") ? "https:" + value : value.replace(/^http:/i, "https:");
    try {
      const u = new URL(text), domains = ["douyinvod.com", "douyincdn.com", "douyin.com", "iesdouyin.com", "amemv.com", "snssdk.com", "bytecdn.cn", "bytecdn.com", "zjcdn.com", "pstatp.com", "ibytedtos.com", "byteoversea.com", "bytedance.com", "tiktokcdn.com", "muscdn.com"];
      if (u.protocol !== "https:" || u.username || u.password || !domains.some(d => u.hostname === d || u.hostname.endsWith("." + d))) return "";
      return text;
    } catch (e) { return ""; }
  };
  const add = values => { for (const value of values || []) { const u = norm(value); if (u && !urls.includes(u)) urls.push(u); } };
  const media = video => {
    if (!video || typeof video !== "object") return;
    const direct = video.play_addr || video.playAddr;
    if (direct) add(direct.url_list || direct.urlList);
    const rates = video.bit_rate || video.bitRate || [];
    if (Array.isArray(rates)) for (const rate of [...rates].sort((a, b) => (+b.bit_rate || +b.bitRate || 0) - (+a.bit_rate || +a.bitRate || 0))) {
      const address = rate && (rate.play_addr || rate.playAddr);
      if (address) add(address.url_list || address.urlList);
    }
  };
  function walk(o, depth) {
    if (depth > 40 || !o || typeof o !== "object" || seen.has(o)) return;
    seen.add(o);
    const ownId = o.aweme_id != null ? o.aweme_id : o.awemeId;
    if (ownId != null && String(ownId) === id) media(o.video);
    for (const k of Object.keys(o)) if (o[k] && typeof o[k] === "object") walk(o[k], depth + 1);
  }
  try {
    const saved = window.__ytAweme && window.__ytAweme[id];
    if (saved && String(saved.id) === id && Array.isArray(saved.playUrls)) add(saved.playUrls);
  } catch (e) {}
  for (const scriptId of ["RENDER_DATA", "__NEXT_DATA__", "SIGI_STATE"]) {
    try {
      const script = document.getElementById(scriptId);
      if (script && script.textContent && script.textContent.length <= 8 * 1024 * 1024) {
        let parsed;
        try { parsed = JSON.parse(script.textContent); } catch (e) { parsed = JSON.parse(decodeURIComponent(script.textContent)); }
        walk(parsed, 0);
      }
    } catch (e) {}
  }
  try { for (const key of ["_ROUTER_DATA", "__INITIAL_STATE__", "__SSR_DATA__", "__NEXT_DATA__"]) walk(window[key], 0); } catch (e) {}
  return { id: urls.length ? id : "", verifiedAwemeId: urls.length ? id : "", urls, title: document.title || "" };
}

function directTarget(url) {
  try {
    const u = new URL(url);
    return u.protocol === "https:" && (u.hostname === "douyin.com" || u.hostname.endsWith(".douyin.com"))
      ? (u.pathname.match(/^\/video\/(\d{8,})\/?$/) || [])[1] || "" : "";
  } catch (e) { return ""; }
}

async function waitComplete(tabId, ms) {
  const t0 = Date.now();
  while (Date.now() - t0 < ms) {
    try { const t = await chrome.tabs.get(tabId); if (t.status === "complete") return true; } catch (e) { return false; }
    await sleep(500);
  }
  return false;
}

async function grabOne(url) {
  const expectedId = directTarget(url);
  if (!expectedId) return null;
  let tab = null;
  try {
    tab = await chrome.tabs.create({ url, active: false });
    await waitComplete(tab.id, 25000);
    for (let k = 0; k < 10; k++) {
      let res = null;
      try { const r = await chrome.scripting.executeScript({ target: { tabId: tab.id }, world: "MAIN", func: pageGrab, args: [expectedId] }); res = r && r[0] && r[0].result; } catch (e) {}
      if (res && res.id === expectedId && res.verifiedAwemeId === expectedId && res.urls && res.urls.length) {
        const good = res.urls.find(u => !/playwm/.test(u)) || res.urls[0];
        return { url: good, verifiedAwemeId: expectedId, cacheVersion: 2 };
      }
      await sleep(1000);
    }
    return null;
  } finally {
    if (tab) try { await chrome.tabs.remove(tab.id); } catch (e) {}
  }
}

async function run(urls) {
  job = { running: true, done: 0, total: urls.length, ok: 0, stop: false };
  await saveJob();
  const st = await chrome.storage.local.get("direct");
  const map = st.direct || {};
  for (const u of urls) {
    if (job.stop) break;
    const old = map[u];
    if (!old || old.cacheVersion !== 2 || old.verifiedAwemeId !== directTarget(u) || Date.now() - old.t > 2 * 3600 * 1000) {
      const d = await grabOne(u);
      if (d && d.verifiedAwemeId === directTarget(u)) map[u] = { ...d, t: Date.now() }; else delete map[u];
      await chrome.storage.local.set({ direct: map });
      await sleep(1200);
    }
    job.done++; if (map[u]) job.ok++;
    await saveJob();
  }
  job.running = false;
  await saveJob();
}

// ---- v2.1: lay tung BO (合集 / series) bang cach mo trang bo trong tab nen: CHINH trang Douyin tu goi + ky API, hook.js chi doc ket qua ----
let hjob = { running: false, done: 0, total: 0, got: 0, notes: [], stop: false, t0: 0 };
const hsave = () => chrome.storage.local.set({ harvestJob: hjob });
function pageHarvest(id) {          // chay TRONG trang bo (world MAIN): cuon de tai them tap, tra ve cac tap da gan ma bo nay
  try {
    const sc = [document.scrollingElement, ...[...document.querySelectorAll("div,main,section,ul")].filter(e => e.scrollHeight > e.clientHeight + 40 && /(auto|scroll)/.test(getComputedStyle(e).overflowY))];
    for (const el of sc) if (el) el.scrollTop = el.scrollHeight;
    window.scrollTo(0, document.body.scrollHeight);
  } catch (e) {}
  const store = window.__ytAweme || {}, recs = {}; let n = 0;
  for (const k in store) { const r = store[k]; if (r && r.mix && r.mix.id === id) { recs[k] = r; n++; } }
  const m = (window.__ytMixes || {})[id] || {};
  return { n, recs, name: m.name || "", total: m.total != null ? m.total : null, hooked: !!window.__ytHookV, resp: window.__ytHookResp || 0 };
}
// Tab nen bi Chrome tam dung ve do hoa (khong cuon tai them duoc) -> mo cua so NHO khong chiem tieu diem; neu khong mo duoc cua so thi dung tab nen
async function openHarvest(url) {
  try {
    const w = await chrome.windows.create({ url, type: "popup", focused: false, width: 520, height: 460 });
    const t = w && w.tabs && w.tabs[0];
    if (t) return { id: t.id, win: w.id };
  } catch (e) {}
  const t = await chrome.tabs.create({ url, active: false });
  return { id: t.id, win: null };
}
async function closeHarvest(h) {
  if (!h) return;
  try { if (h.win != null) await chrome.windows.remove(h.win); else await chrome.tabs.remove(h.id); } catch (e) { try { await chrome.tabs.remove(h.id); } catch (e2) {} }
}
async function harvestOne(it) {
  let tab = null; const out = { id: it.id, name: it.name || "", total: it.total != null ? it.total : null, recs: {}, got: 0, ok: false, why: "" };
  try {
    tab = await openHarvest(it.url);
    await waitComplete(tab.id, 30000);
    let last = -1, stable = 0, hooked = true; const t0 = Date.now();
    while (Date.now() - t0 < 75000 && !hjob.stop) {
      let r = null;
      try { const x = await chrome.scripting.executeScript({ target: { tabId: tab.id }, world: "MAIN", func: pageHarvest, args: [it.id] }); r = x && x[0] && x[0].result; } catch (e) {}
      if (r) {
        hooked = r.hooked; if (r.name && !out.name) out.name = r.name; if (r.total != null) out.total = r.total;
        if (r.n === last) stable++; else { stable = 0; last = r.n; out.recs = r.recs; out.got = r.n; }
        if (out.total && r.n >= out.total) break;
        if (r.n > 0 && stable >= 4) break;
        if (r.n === 0 && stable >= 12) break;
      }
      await sleep(1300);
    }
    out.ok = out.got > 0;
    if (!out.ok) out.why = hooked ? "trang bộ không tải ra tập nào (hết 15 giây)" : "script đọc dữ liệu chưa chạy trong trang (cần cấp quyền Douyin rồi Reload extension)";
  } catch (e) { out.why = String(e && e.message || e); }
  finally { await closeHarvest(tab); }
  return out;
}
async function harvestRun(items, owner) {
  items = (items || []).slice(0, 80);
  hjob = { running: true, done: 0, total: items.length, got: 0, notes: [], stop: false, t0: Date.now(), owner: owner || "" };
  await hsave();
  const res = { owner: owner || "", t: Date.now(), ids: items.map(x => x.id), mixes: {}, recs: {} };
  let next = 0;
  const worker = async () => {
    while (next < items.length && !hjob.stop) {
      const it = items[next++];
      const o = await harvestOne(it);
      res.mixes[o.id] = { name: o.name || it.name || "", total: o.total, got: o.got, ok: o.ok, why: o.why };
      for (const k in o.recs) res.recs[k] = o.recs[k];
      hjob.done++; hjob.got += o.got; if (!o.ok && hjob.notes.length < 5) hjob.notes.push((o.name || it.name || o.id) + ": " + o.why);
      await hsave(); await chrome.storage.local.set({ harvest: res });
      await sleep(600);
    }
  };
  await Promise.all([worker(), worker()]);
  hjob.running = false; hjob.t1 = Date.now();
  await hsave(); await chrome.storage.local.set({ harvest: res });
}

chrome.runtime.onMessage.addListener((msg, sender, send) => {
  if (msg && msg.type === "harvest") { const was = hjob.running; if (!was) harvestRun(msg.items, msg.owner); send({ started: !was }); return false; }
  if (msg && msg.type === "stopharvest") { hjob.stop = true; send({ ok: true }); return false; }
  if (msg && msg.type === "grab") { if (!job.running) run(msg.urls || []); send({ started: !job.running }); }
  else if (msg && msg.type === "stopgrab") { job.stop = true; send({ ok: true }); }
  else if (msg && msg.type === "ensurehook") { ensureHook(false).then(() => send({ ok: true })); return true; }
  return false;
});
