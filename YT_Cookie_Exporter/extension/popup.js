const has = (set, names) => names.some(n => set.has(n));
const GROUPS = [
  { id: "youtube", name: "YouTube", color: "#ff4d4f", domains: ["youtube.com"], origins: ["*://*.youtube.com/*"],
    open: "https://www.youtube.com/", keys: ["LOGIN_INFO", "SAPISID", "__Secure-3PSID"],
    check: s => has(s, ["LOGIN_INFO", "SAPISID", "__Secure-3PSID", "SID"]), okText: "✔ Đã đăng nhập", badText: "Chưa đăng nhập YouTube" },
  { id: "google", name: "Google", color: "#4285f4", domains: ["google.com"], origins: ["*://*.google.com/*"],
    open: "https://accounts.google.com/", keys: ["SID", "SAPISID", "__Secure-3PSID"],
    check: s => has(s, ["SAPISID", "__Secure-3PSID", "SID"]), okText: "✔ Đã đăng nhập", badText: "Chưa đăng nhập Google" },
  { id: "douyin", name: "Douyin (抖音)", color: "#25f4ee", domains: ["douyin.com", "iesdouyin.com"],
    origins: ["*://*.douyin.com/*", "*://*.iesdouyin.com/*"], open: "https://www.douyin.com/",
    keys: ["ttwid", "s_v_web_id", "__ac_nonce", "__ac_signature", "sessionid"],
    check: s => s.has("ttwid") && has(s, ["s_v_web_id", "__ac_signature", "__ac_nonce"]),
    okText: "✔ Đủ cookie chống bot", badText: "Thiếu cookie → mở douyin.com, xem 1 video rồi bấm 🔄" },
  { id: "bilibili", name: "Bilibili", color: "#00a1d6", domains: ["bilibili.com"], origins: ["*://*.bilibili.com/*"],
    open: "https://www.bilibili.com/", keys: ["SESSDATA", "bili_jct", "DedeUserID", "buvid3"],
    check: s => s.has("SESSDATA"), okText: "✔ Đã đăng nhập (tải được chất lượng cao)", badText: "Chưa đăng nhập Bilibili → đăng nhập rồi bấm 🔄 (không đăng nhập vẫn tải được 480p/720p)" },
  { id: "tiktok", name: "TikTok", color: "#fe2c55", domains: ["tiktok.com"], origins: ["*://*.tiktok.com/*"],
    open: "https://www.tiktok.com/", keys: ["ttwid", "sessionid", "tt_chain_token"],
    check: s => s.has("ttwid"), okText: "✔ Có cookie", badText: "Thiếu cookie → mở tiktok.com rồi bấm 🔄" },
];
const $ = id => document.getElementById(id);
const state = {};   // id -> {perm, cookies, checked}
let text = "";

async function getAllSafe(filter) {
  try { return await chrome.cookies.getAll({ ...filter, partitionKey: {} }); }
  catch (e) { try { return await chrome.cookies.getAll(filter); } catch (e2) { return []; } }
}

async function collect(g) {
  const map = new Map();
  for (const d of g.domains) {
    const lists = [await getAllSafe({ domain: d }), await getAllSafe({ url: `https://www.${d}/` }), await getAllSafe({ url: `https://${d}/` })];
    for (const l of lists) for (const c of l) map.set([c.domain, c.path, c.name].join("|"), c);
  }
  return [...map.values()];
}

function toNetscape(cookies) {
  const lines = ["# Netscape HTTP Cookie File", "# Xuat boi YT Cookie Exporter", ""];
  for (const c of cookies) {
    const sub = c.domain.startsWith(".") ? "TRUE" : "FALSE";
    const exp = c.expirationDate ? Math.floor(c.expirationDate) : 0;
    lines.push([(c.httpOnly ? "#HttpOnly_" : "") + c.domain, sub, c.path, c.secure ? "TRUE" : "FALSE", exp, c.name, c.value].join("\t"));
  }
  return lines.join("\n") + "\n";
}

async function refresh() {
  for (const g of GROUPS) {
    const perm = await chrome.permissions.contains({ origins: g.origins }).catch(() => false);
    const cookies = perm ? await collect(g) : [];
    const old = state[g.id];
    state[g.id] = { perm, cookies, checked: old ? old.checked : cookies.length > 0 };
    if (old && old.cookies.length === 0 && cookies.length > 0) state[g.id].checked = true;
  }
  render();
  $("time").textContent = "cập nhật " + new Date().toLocaleTimeString();
}

function render() {
  const box = $("sites");
  box.innerHTML = "";
  let total = 0, sites = 0, all = [];
  for (const g of GROUPS) {
    const s = state[g.id], names = new Set(s.cookies.map(c => c.name));
    const el = document.createElement("div");
    el.className = "site";
    const top = document.createElement("div");
    top.className = "top";
    const cb = document.createElement("input");
    cb.type = "checkbox"; cb.checked = s.checked && s.cookies.length > 0; cb.disabled = !s.cookies.length;
    cb.onchange = () => { s.checked = cb.checked; render(); };
    top.append(cb);
    top.insertAdjacentHTML("beforeend", `<span class="dot" style="background:${g.color}"></span><span class="name">${g.name}</span><span class="count">${s.cookies.length} cookie</span>`);
    const open = document.createElement("a"); open.textContent = "mở trang ↗"; open.onclick = () => chrome.tabs.create({ url: g.open });
    top.append(open);
    el.append(top);
    if (!s.perm) {
      el.insertAdjacentHTML("beforeend", `<span class="badge none">Chưa cấp quyền đọc cookie ${g.name}</span>`);
      const b = document.createElement("button"); b.className = "warn"; b.textContent = "Cấp quyền " + g.name;
      b.onclick = async () => { await chrome.permissions.request({ origins: g.origins }); refresh(); };
      el.append(b);
    } else if (!s.cookies.length) {
      el.insertAdjacentHTML("beforeend", `<span class="badge none">Không có cookie — hãy đăng nhập / mở ${g.name} rồi bấm 🔄</span>`);
    } else {
      const ok = g.check(names);
      el.insertAdjacentHTML("beforeend", `<span class="badge ${ok ? "ok" : "bad"}">${ok ? g.okText : g.badText}</span>`);
      el.insertAdjacentHTML("beforeend", `<div class="chips">${g.keys.map(k => `<span class="chip ${names.has(k) ? "on" : ""}">${names.has(k) ? "✔" : "✘"} ${k}</span>`).join("")}</div>`);
    }
    box.append(el);
    if (s.checked && s.cookies.length) { total += s.cookies.length; sites++; all.push(...s.cookies); }
  }
  text = toNetscape(all);
  $("dl").disabled = $("cp").disabled = !total;
  $("dl").textContent = total ? `⬇ Tải cookies.txt (${sites} trang, ${total} cookie)` : "⬇ Tải cookies.txt";
}

$("reload").onclick = async () => { $("reload").textContent = "⏳ Đang tải lại..."; await refresh(); $("reload").textContent = "🔄 Tải lại cookie"; };
$("dl").onclick = () => {
  const a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob([text], { type: "text/plain" }));
  a.download = "cookies.txt"; a.click();
};
$("cp").onclick = async () => { await navigator.clipboard.writeText(text); $("cp").textContent = "✔ Đã copy"; setTimeout(() => $("cp").textContent = "📋 Copy vào clipboard", 1500); };

let t = null;
chrome.cookies.onChanged.addListener(() => { clearTimeout(t); t = setTimeout(refresh, 700); });
refresh();

// ================= Quet danh sach video / tap cua BO dang mo =================
// Ham chay TRONG trang web (phai tu chua, khong dung bien ngoai).
// Y tuong: khong gom moi link tren trang. Gom video theo tung "danh sach" (khoi chua >= 3 link video, vd bang chon tap cua bo phim,
// cot de xuat, luoi video...) va theo ma bo (mix_id / collection / season). Nguoi dung chon dung danh sach cua bo muon tai.
async function pageScan(maxSeconds) {
  window.__ytStop = false; window.__ytScanning = true; window.__ytClusters = [];
  const isHost = (h, d) => h === d || h.endsWith("." + d);
  const norm = href => {
    try {
      const u = new URL(href, location.href); let m;
      const h = u.hostname;
      if (isHost(h, "douyin.com") && (m = u.pathname.match(/^\/(?:video|note)\/(\d+)/)))
        return { url: "https://www.douyin.com/video/" + m[1], mix: u.searchParams.get("mix_id") || "" };
      if (isHost(h, "tiktok.com") && /\/video\/\d+/.test(u.pathname)) return { url: u.origin + u.pathname, mix: "" };
      if (isHost(h, "youtube.com")) {
        if (u.pathname === "/watch" && u.searchParams.get("v")) return { url: "https://www.youtube.com/watch?v=" + u.searchParams.get("v"), mix: u.searchParams.get("list") || "" };
        if ((m = u.pathname.match(/^\/shorts\/([\w-]+)/))) return { url: "https://www.youtube.com/shorts/" + m[1], mix: "" };
      }
      if (isHost(h, "bilibili.com")) {
        if ((m = u.pathname.match(/^\/video\/((?:BV|av)\w+)/i))) {
          const p = u.searchParams.get("p");
          return { url: "https://www.bilibili.com/video/" + m[1] + (p && p !== "1" ? "?p=" + p : ""), mix: "" };
        }
        if ((m = u.pathname.match(/^\/bangumi\/play\/((?:ep|ss)\d+)/i))) return { url: "https://www.bilibili.com/bangumi/play/" + m[1], mix: "" };
      }
    } catch (e) {}
    return null;
  };
  const clusters = new Map();     // khoa (phan tu khoi hoac 'mix:ID') -> {el, label, items: Map(url -> title)}
  const JUNK = [/^\d+(?:\.\d+)?\s*[万亿wWkK]?$/, /^\d{1,2}:\d{2}(?::\d{2})?$/,
    /^(?:\d+\s*(?:秒|分钟|分鐘|小时|小時|天|周|週|个月|月|年)前|刚刚|剛剛|昨天|前天|\d{1,2}-\d{1,2}|\d{4}-\d{1,2}-\d{1,2}|\d{1,2}月\d{1,2}日)$/];
  const toSec = l => { const m = l.match(/^(?:(\d{1,2}):)?(\d{1,2}):(\d{2})$/); return m ? (+m[1] || 0) * 3600 + +m[2] * 60 + +m[3] : 0; };
  const durOf = a => {
    const find = el => { for (const l of (el.innerText || "").split(/\n+/)) { const v = toSec(l.trim()); if (v) return v; } return 0; };
    let d = find(a);
    if (!d) { const card = a.closest("li,[class*='card' i]"); if (card && card.querySelectorAll("a[href*='/video/']").length <= 1) d = find(card); }
    return d;
  };
  const imgOf = a => {
    const card = a.closest("li,[class*='card' i]"), i = a.querySelector("img") || (card && card.querySelectorAll("a[href*='/video/']").length <= 1 ? card.querySelector("img") : null);
    if (!i) return "";
    const u = i.currentSrc || i.src || i.getAttribute("data-src") || "";
    return /^https?:/.test(u) ? u : "";
  };
  const textOf = a => {
    let lab = a.getAttribute("aria-label") || a.title || "";
    if (!lab) {
      const lines = (a.innerText || "").split(/\n+/).map(x => x.replace(/\s+/g, " ").trim()).filter(Boolean);
      let pin = false; const keep = [];
      for (const l of lines) { if (/^(?:置顶|置頂)$/.test(l)) { pin = true; continue; } if (JUNK.some(r => r.test(l))) continue; keep.push(l); }
      lab = (pin ? "置顶 " : "") + keep.join(" ");
    }
    if (!lab) lab = (a.querySelector("img") || {}).alt || "";
    return lab.replace(/\s+/g, " ").trim().slice(0, 160);
  };
  const labelOf = el => {
    let e = el;
    for (let k = 0; k < 4 && e; k++, e = e.parentElement) {
      const hs = e.querySelectorAll ? e.querySelectorAll("h1,h2,h3,h4,[class*='title' i],[class*='header' i]") : [];
      for (const h of hs) {
        const t = (h.innerText || "").replace(/\s+/g, " ").trim();
        if (t && t.length >= 2 && t.length <= 60 && !h.querySelector("a[href*='video']")) return t;
      }
    }
    return "";
  };
  const collect = () => {
    const anchors = [];
    for (const a of document.querySelectorAll("a[href]")) { const n = norm(a.getAttribute("href")); if (n) anchors.push([a, n]); }
    if (!anchors.length) return;
    const count = new Map();      // phan tu cha -> tap url khac nhau ben trong
    for (const [a, n] of anchors) for (let e = a.parentElement, k = 0; e && k < 12; e = e.parentElement, k++) {
      let st = count.get(e); if (!st) count.set(e, st = new Set()); st.add(n.url);
    }
    for (const [a, n] of anchors) {
      let box = null;
      for (let e = a.parentElement, k = 0; e && k < 12; e = e.parentElement, k++) if ((count.get(e) ? count.get(e).size : 0) >= 3) { box = e; break; }
      const ckey = n.mix ? "mix:" + n.mix : (box || document.body);
      let c = clusters.get(ckey);
      if (!c) { c = { el: box, mix: n.mix, label: "", items: new Map() }; clusters.set(ckey, c); }
      if (!c.label && box) c.label = labelOf(box);
      const t = textOf(a), d = durOf(a), im = imgOf(a), old = c.items.get(n.url);
      if (!old) c.items.set(n.url, { t, d, im });
      else { if (t && t.length > old.t.length) old.t = t; if (d && !old.d) old.d = d; if (im && !old.im) old.im = im; }
    }
    window.__ytClusters = [...clusters.values()].filter(c => c.items.size >= 1)
      .map(c => ({ mix: c.mix, label: c.label, items: [...c.items].map(([url, v]) => ({ url, title: v.t, dur: v.d || 0, img: v.im || "" })) }));
  };
  const scrollers = () => [document.scrollingElement, ...[...document.querySelectorAll("div,main,section,ul")]
    .filter(e => e.scrollHeight > e.clientHeight + 40 && /(auto|scroll)/.test(getComputedStyle(e).overflowY))];
  let idle = 0; const t0 = Date.now();
  const total = () => [...clusters.values()].reduce((s, c) => s + c.items.size, 0);
  collect();
  while (!window.__ytStop && idle < 10 && Date.now() - t0 < maxSeconds * 1000) {
    for (const el of scrollers()) if (el) el.scrollTop = el.scrollHeight;
    window.scrollTo(0, document.body.scrollHeight);
    await new Promise(r => setTimeout(r, 1200));
    const before = total(); collect();
    idle = total() === before ? idle + 1 : 0;
  }
  window.__ytScanning = false;
  return true;
}
function pageRead() { return { clusters: window.__ytClusters || [], scanning: !!window.__ytScanning, href: location.href, title: document.title || "" }; }
function pageStop() { window.__ytStop = true; return true; }
// Chay o world MAIN: doc du lieu bo / tap ma hook.js da bat duoc. Chi gui ve khi co du lieu moi (so n thay doi).
function pageMeta(since, deep) {
  const hooked = !!window.__ytHookV;
  if (hooked && deep) {
    try { if (window.__ytScanDom) window.__ytScanDom(); } catch (e) {}
    try { if (window.__ytFiber) window.__ytFiber(); } catch (e) {}
  }
  const n = hooked ? (window.__ytAwemeN || 0) : 0;
  const out = { hooked, v: window.__ytHookV || 0, n, resp: window.__ytHookResp || 0, count: hooked ? Object.keys(window.__ytAweme).length : 0,
    mixList: hooked ? Object.values(window.__ytMixes || {}).slice(0, 200).map(m => ({ id: m.id, name: m.name, total: m.total })) : [] };
  if (hooked && n !== since) out.meta = Object.assign({}, window.__ytAweme);
  return out;
}

// ---- xu ly o popup: so tap (ca so Trung 一二三…), loc tap gop / quang cao, sap xep ----
const CNN = { "零": 0, "〇": 0, "一": 1, "二": 2, "两": 2, "兩": 2, "三": 3, "四": 4, "五": 5, "六": 6, "七": 7, "八": 8, "九": 9 };
function cnNum(str) {
  if (/^\d+$/.test(str)) return +str;
  let total = 0, cur = 0;
  for (const ch of str) {
    if (ch === "百") { total += (cur || 1) * 100; cur = 0; }
    else if (ch === "十") { total += (cur || 1) * 10; cur = 0; }
    else if (ch in CNN) cur = CNN[ch];
    else return null;
  }
  return total + cur;
}
const NUM = "[0-9零〇一二两兩三四五六七八九十百]+";
const EP_RX = [
  new RegExp("第\\s*(" + NUM + ")\\s*[集话話章回期节節]"),
  new RegExp("(?:^|[\\s，,。:：【\\[(])([一二两兩三四五六七八九十百零〇]+)\\s*[集话話](?![合])"),
  /(?:^|[\s\[(【#_-])(?:tập|tap|ep|episode|e|p)\s*\.?\s*(\d{1,4})(?!\d)/i,
  /(?:^|[\s\[(【])(\d{1,4})\s*[集话話](?![合\w])/,
];
const RANGE1 = new RegExp("(?:第\\s*)?(" + NUM + ")\\s*[集话話期]?\\s*[-~—–－～至到]\\s*(?:第\\s*)?(" + NUM + ")\\s*[集话話期]");
const RANGE2 = /(?:^|[\s\[(【#_])(?:tập|tap|ep|episode|e)\s*\.?\s*(\d{1,4})\s*[-~—–至到]\s*(?:tập|tap|ep|episode|e)?\s*\.?\s*(\d{1,4})(?!\d)/i;
const RE_MERGED = new RegExp("合集|全集|合辑|合輯|合并|合併|完整版|大结局|大結局|一口气|一口氣|连看|連看|全\\s*" + NUM + "\\s*[集话話]|共\\s*" + NUM + "\\s*[集话話]|(?<![第0-9零〇一二两兩三四五六七八九十百])" + NUM + "\\s*[集话話]\\s*全(?![部程])", "i");
function mergedRange(t) {
  for (const rx of [RANGE1, RANGE2]) { const r = t.match(rx); if (r) { const a = cnNum(r[1]), b = cnNum(r[2]); if (a != null && b != null && b > a) return [a, b]; } }
  return null;
}
const RE_AD = /预告|預告|抢先看|搶先看|先行|宣传|宣傳|广告|廣告|花絮|片花|预热|推广|推廣|trailer|teaser|\bpv\b|开播|定档/i;
function cleanPrefix(pre0) {
  pre0 = (pre0 || "").replace(/#\S+/g, " ");
  const q = pre0.match(/《([^》]+)》/) || pre0.match(/【([^】]{2,30})】/);
  let p = q ? q[1] : pre0;
  return p.replace(/[\s#《》「」『』【】\[\]()（）,，。:：|\-_·]+$/g, "").replace(/^[\s#《》「」『』【】\[\]()（）,，。:：|\-_·]+/g, "").trim();
}
const seriesKey = p => (p || "").replace(/[^\p{L}\p{N}]+/gu, "").toLowerCase();
const sameKey = (a, b) => a === b || (Math.min(a.length, b.length) >= 3 && (a.endsWith(b) || b.endsWith(a)));
let awemeMeta = {};      // aweme_id -> {desc, dur, ts, top, mix:{id,name,cur,total}, tags}  (do hook.js bat tu chinh trang Douyin)
const idOf = u => { const m = (u || "").match(/\/video\/(\d+)/); return m ? m[1] : ""; };
const cleanName = n => (n || "").replace(/#\S+/g, " ").replace(/[《》「」『』【】]/g, " ").replace(/\s+/g, " ").trim();
const episodeNumber = value => {
  const n = Number(value);
  return Number.isInteger(n) && n > 0 && n <= 9999 ? n : null;
};
function parseItem(it) {
  const am = metaOf(idOf(it.url)), mx = am && am.mix ? am.mix : null;
  const dom = (it.title || "").replace(/\s+/g, " ").trim();
  let t = am && am.desc ? am.desc.replace(/\s+/g, " ").trim() : dom;      // lay mo ta day du tu API neu co
  const pinned = !!(am && am.top) || /^置顶|^置頂/.test(dom) || /^置顶|^置頂/.test(t);
  t = t.replace(/^(?:置顶|置頂)\s*/, "");
  if (!(am && am.desc)) for (let prev = ""; prev !== t;) {          // bo so luot thich (2.9万, 1234), thoi luong (01:23) dinh o dau ten
    prev = t;
    t = t.replace(/^\d+(?:\.\d+)?[万亿wWkK]?(?=\s|[【《\[(「『#])\s*/, "").replace(/^\d{1,2}:\d{2}(?::\d{2})?\s*/, "");
  }
  t = t.trim();
  let tep = null, mk = null;
  const m0 = (it.url || "").match(/[?&]p=(\d+)/);
  if (m0) tep = +m0[1];
  if (tep == null) for (const rx of EP_RX) { const m = t.match(rx); if (m) { const n = cnNum(m[1]); if (n != null && n > 0) { tep = n; mk = m; break; } } }
  const cur = mx && mx.cur > 0 ? mx.cur : (mx && mx.ord > 0 ? mx.ord : null);   // so tap theo Douyin; khong co thi theo thu tu tap trong bo cua Douyin
  const ep = cur != null ? cur : tep;
  let kind = "ep", range = null;
  range = mergedRange(t);
  if (range || RE_MERGED.test(t)) kind = "merged";
  else if (RE_AD.test(t)) kind = "ad";
  else if (pinned && ep == null && !mx) kind = "ad";
  else if (ep == null) kind = "other";
  let prefix = "";
  if (mk && kind === "ep") prefix = cleanPrefix(t.slice(0, mk.index));
  return { ...it, dur: (am && am.dur) || it.dur || 0, clean: t, ep, tep, kind, range, pinned, prefix, key: seriesKey(prefix),
    cid: "", thumb: (coverSig[idOf(it.url)] || {}).th || "",
    mixId: mx ? mx.id : "", mixName: mx ? cleanName(mx.name) : "", mixTotal: mx && mx.total > 0 ? mx.total : 0, ts: (am && am.ts) || 0, tags: (am && am.tags) || [],
    bad: kind === "merged" ? "tập gộp" : kind === "ad" ? "quảng cáo / trailer" : "" };
}
// ---- Anh bia chi de xem truoc; khong dung mau/bo cuc anh de tach bo ----
// Anh bia cac tap cung 1 bo giong het nhau (cung nen + tieu de bo), chi khac so tap -> giong nhau 86-99%; khac bo chi ~20-35%.
// OCR so tren anh bia (chu cach dieu co vien) sai nhieu nen KHONG doc so: so tap = thu tu dang (cu -> moi) trong tung bo.
const COVER_ORIGINS = ["*://*.douyinpic.com/*", "*://*.byteimg.com/*", "*://*.douyinstatic.com/*", "*://*.pstatp.com/*", "*://*.bytecdn.cn/*", "*://*.tiktokcdn.com/*", "*://*.hdslb.com/*"];
const SW = 24, SH = 32, COVER_T = 0.62, COVER_NEAR = 0.4;
let coverSig = {};                                   // id video -> { s: Uint8Array(SW*SH*3), th: dataURL nho }
let coverStat = { run: false, n: 0, ok: 0, fail: 0, err: "", host: "" };
const covRaw = new Map();                            // id -> url anh bia
async function coverOne(id, url) {
  let r = await fetch(url, { credentials: "omit", referrerPolicy: "no-referrer", cache: "force-cache" });
  if (!r.ok && (r.status === 403 || r.status === 401)) r = await fetch(url, { credentials: "omit", cache: "force-cache" });        // CDN doi Referer -> thu lai kieu thuong
  if (!r.ok) throw new Error("HTTP " + r.status);
  const bmp = await createImageBitmap(await r.blob());
  const mk = (w, h) => { const c = document.createElement("canvas"); c.width = w; c.height = h; return c; };
  const big = mk(SW * 4, SH * 4), g1 = big.getContext("2d"); g1.imageSmoothingQuality = "high"; g1.drawImage(bmp, 0, 0, big.width, big.height);     // thu nho 2 buoc cho muot
  const sm = mk(SW, SH), g2 = sm.getContext("2d", { willReadFrequently: true }); g2.imageSmoothingQuality = "high"; g2.drawImage(big, 0, 0, SW, SH);
  const d = g2.getImageData(0, 0, SW, SH).data, sig = new Uint8Array(SW * SH * 3);
  for (let i = 0, j = 0; i < d.length; i += 4) { sig[j++] = d[i]; sig[j++] = d[i + 1]; sig[j++] = d[i + 2]; }
  const th = mk(40, 53); th.getContext("2d").drawImage(bmp, 0, 0, 40, 53);
  coverSig[id] = { s: sig, th: th.toDataURL("image/jpeg", 0.6) };
  if (bmp.close) bmp.close();
}
function coverIds() {
  covRaw.clear();
  for (const c of clusters) for (const it of c.items) {
    const id = idOf(it.url); if (!id || covRaw.has(id)) continue;
    const u = (awemeMeta[id] && awemeMeta[id].cover) || it.img || (harvestRecs[id] && harvestRecs[id].cover) || "";
    if (/^https?:/.test(u)) covRaw.set(id, u.startsWith("http:") ? "https:" + u.slice(5) : u);
  }
  return [...covRaw.keys()];
}
let covTimer = null;
async function startCovers() {
  if (coverStat.run) return;
  const ids = coverIds().filter(id => !coverSig[id]);
  const nTot = covRaw.size;
  if (!ids.length) { coverStat.n = nTot; coverInfo(); return; }
  coverStat = { run: true, n: nTot, ok: nTot - ids.length, fail: 0, err: "", host: "" };
  let next = 0, stop = false;
  const worker = async () => {
    while (next < ids.length && !stop) {
      const id = ids[next++];
      try { await coverOne(id, covRaw.get(id)); coverStat.ok++; }
      catch (e) {
        coverStat.fail++; coverStat.err = String(e && e.message || e).slice(0, 80);
        try { coverStat.host = new URL(covRaw.get(id)).host; } catch (e2) {}
        if (coverStat.ok === 0 && coverStat.fail >= 6) stop = true;           // 6 anh dau deu loi -> khong co quyen / bi chan, dung som
      }
      if ((coverStat.ok + coverStat.fail) % 12 === 0) { coverInfo(); }
    }
  };
  await Promise.all([worker(), worker(), worker(), worker(), worker(), worker()]);
  coverStat.run = false;
  try { renderScan(false); } catch (e) {}
  coverInfo();
}
function coverInfo() {
  const el = $("coverInfo"); if (!el) return;
  const c = coverStat;
  if (c.run) el.textContent = `⏳ Đang đọc ảnh bìa ${c.ok + c.fail}/${c.n}…`;
  else if (!c.n) el.textContent = "";
  else if (!c.ok) el.textContent = `⚠ Không tải được ảnh bìa (${c.err || "lỗi"}${c.host ? " • " + c.host : ""}) → không có ảnh xem trước; việc gom bộ vẫn hoạt động.`;
  else el.textContent = `🖼 Đã đọc ${c.ok}/${c.n} ảnh bìa${c.fail ? " (" + c.fail + " lỗi)" : ""}` + (covInfoTxt ? " • " + covInfoTxt : "");
}
let covInfoTxt = "";
const simCov = (a, b) => { let k = 0; const n = SW * SH; for (let i = 0; i < a.length; i += 3) { const d = Math.max(Math.abs(a[i] - b[i]), Math.abs(a[i + 1] - b[i + 1]), Math.abs(a[i + 2] - b[i + 2])); if (d < 45) k++; } return k / n; };
let covCache = { key: "", cid: {}, near: {}, info: "" };
// Gan x.cid (ma nhom anh bia) cho cac tap thuong; tap gop / quang cao gan vao nhom giong nhat (neu du giong)
function assignCovers(all) {
  const idOfX = x => idOf(x.url), has = x => coverSig[idOfX(x)];
  const base = all.filter(x => has(x) && x.kind !== "merged" && x.kind !== "ad" && !x.mixId), side = all.filter(x => has(x) && (x.kind === "merged" || x.kind === "ad"));
  const key = base.map(idOfX).join(",") + "|" + side.map(idOfX).join(",");
  if (covCache.key !== key) {
    const par = base.map((_, i) => i), find = i => { while (par[i] !== i) { par[i] = par[par[i]]; i = par[i]; } return i; };
    for (let i = 0; i < base.length; i++) { const a = coverSig[idOfX(base[i])].s; for (let j = i + 1; j < base.length; j++) if (find(i) !== find(j) && simCov(a, coverSig[idOfX(base[j])].s) >= COVER_T) par[find(j)] = find(i); }
    const mem = new Map(); base.forEach((x, i) => { const r = find(i); (mem.get(r) || mem.set(r, []).get(r)).push(x); });
    const cid = {}, near = {}; let nSer = 0;
    for (const arr of mem.values()) if (arr.length >= 2) { const c = "c" + idOfX(arr[0]); nSer++; for (const x of arr) cid[idOfX(x)] = c; }
    for (const x of side) {
      let best = 0, bc = "";
      for (const y of base) { const c = cid[idOfX(y)]; if (!c) continue; const v = simCov(coverSig[idOfX(x)].s, coverSig[idOfX(y)].s); if (v > best) { best = v; bc = c; } }
      if (best >= COVER_NEAR) { cid[idOfX(x)] = bc; near[idOfX(x)] = 1; }
    }
    covCache = { key, cid, near, info: nSer + " bộ giống nhau" };
  }
  covInfoTxt = covCache.info;
  for (const x of all) { const id = idOfX(x); x.cid = covCache.cid[id] || ""; x.thumb = (coverSig[id] || {}).th || ""; }
}
// Gom cac tap thanh tung bo. chrono: tap theo thu tu trang (da dao neu can). Tra ve [{def, items}]
function makeGroups(chrono, split) {
  if (!split) return [{ key: "single", def: "", items: [...chrono] }];
  const official = new Map();
  for (const x of chrono) if (x.mixId) {
    let group = official.get(x.mixId);
    if (!group) official.set(x.mixId, group = { key: "m" + x.mixId, mixId: x.mixId, def: x.mixName || "", total: 0, items: [], viaApi: true });
    group.items.push(x); group.total = Math.max(group.total, x.mixTotal || 0);
    if (!group.def && x.mixName) group.def = x.mixName;
  }
  if (official.size) {
    const rest = chrono.filter(x => !x.mixId);
    if (official.size === 1) {
      const group = [...official.values()][0];
      group.items.push(...rest); group.unassigned = rest.length;
      return [group];
    }
    const groups = [...official.values()], unassigned = [];
    for (const x of rest) {
      const named = seriesKey(x.namedSeries);
      const matches = named ? groups.filter(g => named === seriesKey(g.def)) : [];
      if (matches.length === 1) matches[0].items.push(x); else unassigned.push(x);
    }
    if (unassigned.length) groups.push({ key: "unassigned", def: "Chưa xác định bộ", items: unassigned, unassigned: unassigned.length });
    return groups;
  }
  // Narrative prefixes, episode resets, hashtags and cover images do not prove another series.
  return [{ key: "single", def: "", items: [...chrono] }];
}
const fmtDur = d => Math.floor(d / 60) + ":" + String(Math.round(d % 60)).padStart(2, "0");
// Video dai gap nhieu lan do dai tap thuong (trung vi) => nghi la tap gop du ten khong ghi 合集
function markLongMerged(all) {
  const ds = all.filter(x => x.kind !== "merged" && x.kind !== "ad" && x.dur > 0).map(x => x.dur).sort((a, b) => a - b);
  if (ds.length < 5) return 0;
  const med = ds[ds.length >> 1], lim = Math.max(med * 2.5, med + 240);
  let n = 0;
  for (const x of all) if ((x.kind === "ep" || x.kind === "other") && x.dur >= lim) { x.kind = "merged"; x.autoMerged = true; x.bad = "tập gộp (dài " + fmtDur(x.dur) + ", tập thường ~" + fmtDur(med) + ")"; n++; }
  return n;
}
function stripEp(t) {
  return (t || "").replace(new RegExp("第\\s*" + NUM + "\\s*[集话話章回期节節]", "g"), " ").replace(/(?:tập|tap|ep|episode)\s*\.?\s*\d{1,4}/ig, " ")
    .replace(/#\S+/g, " ").replace(/\s+/g, " ").trim().slice(0, 40);
}
function guessSeries(cl) {
  const cnt = new Map();
  for (const c of cl) for (const it of c.items) { const m = (it.title || "").match(/《([^》]{2,24})》/); if (m) cnt.set(m[1], (cnt.get(m[1]) || 0) + 1); }
  let best = "", n = 0; for (const [k, v] of cnt) if (v > n) { best = k; n = v; }
  return best;
}
const pad = (n, w) => String(n).padStart(w, "0");
const gstate = {};          // khoa bo -> {on, name}
const safe = t => (t || "").replace(/[\\/:*?"<>|\t]/g, " ").replace(/\s+/g, " ").trim();

// ---- gom thanh tung bo (ham thuan, khong dung DOM) ----
function fmtRanges(a) {
  const out = []; let s = null, p = null;
  for (const n of a) { if (s == null) s = p = n; else if (n === p + 1) p = n; else { out.push(s === p ? "" + s : s + "-" + p); s = p = n; } }
  if (s != null) out.push(s === p ? "" + s : s + "-" + p);
  return out.join(", ");
}
// danh so cho video khong co so tap: theo thoi gian dang (cu -> moi); khong co thi theo thu tu trang
function chronological(items, rev) {
  const arr = [...items];
  if (arr.length && arr.every(x => x.ts > 0)) arr.sort((a, b) => a.ts - b.ts || a.pi - b.pi);
  else if (arr.length && arr.every(x => x.mixId && x.mixId === arr[0].mixId && x.mixOrder > 0))
    arr.sort((a, b) => a.mixOrder - b.mixOrder || a.pi - b.pi);
  else if (rev) arr.reverse();
  return arr;
}
function numAuto(items, rev) {
  const arr = [...items];
  if (arr.length && arr.every(x => x.ts > 0)) arr.sort((a, b) => a.ts - b.ts || a.pi - b.pi);
  else if (rev) arr.reverse();
  return arr.map((x, i) => ({ ...x, ep: i + 1, auto: true }));
}
function finishGroup(raw, rev = false) {
  const items = [...raw.items], chronologicalItems = chronological(items, rev);
  const order = new Map(chronologicalItems.map((x, i) => [x.url, i]));
  const numbered = items.filter(x => episodeNumber(x.ep) != null)
    .sort((a, b) => a.ep - b.ep || order.get(a.url) - order.get(b.url));
  const highest = numbered.length ? Math.max(...numbered.map(x => x.ep)) : 0;
  const unknown = numAuto(items.filter(x => episodeNumber(x.ep) == null), rev)
    .map((x, index) => ({ ...x, ep: highest + index + 1, epSource: "auto" }));
  const counts = new Map();
  for (const x of numbered) counts.set(x.ep, (counts.get(x.ep) || 0) + 1);
  const duplicateEpisodes = [...counts].filter(([, n]) => n > 1).map(([n]) => n);
  const missing = [], tail = [], present = new Set(numbered.map(x => x.ep));
  const verified = numbered.length > 0 && !unknown.length
    && new Set(items.filter(x => x.mixId).map(x => x.mixId)).size <= 1;
  if (verified) {
    const first = raw.mixId ? 1 : Math.min(...present), last = Math.max(...present);
    const high = Math.min(9999, Math.max(last, raw.total || 0));
    for (let n = first; n <= high; n++) if (!present.has(n)) (n > last ? tail : missing).push(n);
  }
  const warnings = [];
  if (unknown.length) warnings.push(unknown.length + " video chưa rõ số tập: đánh số tiếp theo thứ tự đăng như trước, không tách thêm bộ");
  if (duplicateEpisodes.length) warnings.push("Giữ các video trùng số tập " + fmtRanges(duplicateEpisodes) + "; chưa xác nhận là bản trùng");
  const titleOnly = numbered.filter(x => x.epSource === "title").length;
  if (titleOnly) warnings.push(titleOnly + " số tập chỉ đọc từ mô tả, chưa xác nhận bằng ảnh bìa / dữ liệu tập");
  if (items.some(x => x.longUnverified)) warnings.push("Có video dài bất thường; chưa tự bỏ vì thời lượng không chứng minh là tập gộp");
  if (raw.unassigned) warnings.push(raw.unassigned + " video chưa có mã bộ; giữ lại để kiểm tra");
  for (const warning of new Set(items.flatMap(x => x.epWarnings || []))) warnings.push(warning);
  return { ...raw, eps: [...numbered, ...unknown], numbered, dups: [], duplicateEpisodes, missing, tail,
    unnumbered: unknown.length, numberingVerified: verified, warnings,
    conflict: raw.mixId ? numbered.filter(x => x.mixId && x.tep != null && x.tep !== x.ep).length : 0 };
}
function videoIdentity(x) {
  const id = idOf(x.url);
  return id ? "douyin:" + id : String(x.url || "");
}
function computeGroups(all, o) {
  // Deduplicate repeated sightings of one URL, never two different videos with the same episode text.
  const unique = new Map();
  for (const source of all) {
    const x = { ...source, pi: unique.size }, identity = videoIdentity(source);
    if (!identity || !x.url) continue;
    const old = unique.get(identity);
    const quality = y => (y.epVerified ? 10000 : 0) + (episodeNumber(y.ep) != null ? 1000 : 0) + (y.clean || "").length;
    if (!old || quality(x) > quality(old)) unique.set(identity, { ...x, pi: old ? old.pi : x.pi });
  }
  const videos = [...unique.values()];
  const regular = videos.filter(x => x.kind === "ep" || x.kind === "other");
  const merged = videos.filter(x => x.kind === "merged"), ads = videos.filter(x => x.kind === "ad");
  const rawGroups = makeGroups(regular, o.split);
  if (!rawGroups.length) rawGroups.push({ key: "single", def: "", items: [] });
  for (const raw of rawGroups) raw.merged = [];
  for (const item of merged) {
    const match = o.split && item.mixId ? rawGroups.find(g => g.mixId === item.mixId) : null;
    // Unassigned compilations are retained as optional rows; no cover-colour assignment.
    (match || rawGroups[0]).merged.push(item);
  }
  const groups = rawGroups.map(raw => finishGroup(raw, o.rev));
  for (let i = 0; i < groups.length; i++) {
    const g = groups[i];
    const st = gstate[g.key] || (gstate[g.key] = { on: true, name: "" });
    g.name = (st.name || g.def || (groups.length === 1 ? o.guess || "" : "Bộ " + (i + 1))).trim();
    g.on = st.on;
    const pre = g.name ? g.name + " - " : "";
    const width = Math.max(2, String(Math.max(0, ...g.eps.map(x => x.ep), g.eps.length)).length);
    const duplicateNumbers = new Set(g.duplicateEpisodes);
    g.lines = g.eps.map((x, index) => {
      const unknown = !!x.auto;
      let name = pre + "Tập " + pad(x.ep, width);
      if (!unknown && duplicateNumbers.has(x.ep)) name += " - Video " + (idOf(x.url) || pad(index + 1, 3));
      if (o.showT && x.clean) name += " - " + safe(x.clean).slice(0, 40);
      return { url: x.url, name, title: x.clean, thumb: x.thumb || "", ep: x.ep, epSource: x.epSource, unverified: unknown };
    });
    g.mlines = [...g.merged].sort((a, b) => (a.range ? a.range[0] : 0) - (b.range ? b.range[0] : 0))
      .map((x, index) => ({ url: x.url, name: pre + "Gộp " + (x.range ? pad(x.range[0], width) + "-" + pad(x.range[1], width) : pad(index + 1, 2)), title: x.clean, merged: true }));
    if (o.takeM) g.lines.push(...g.mlines);
  }
  if (o.takeA && ads.length) {
    const first = groups[0], pre = first.name ? first.name + " - " : "";
    const lines = ads.map((x, index) => ({ url: x.url, name: pre + "Trailer " + pad(index + 1, 2), title: x.clean }));
    if (!o.split) first.lines.push(...lines);
    else groups.push({ key: "kads", name: "Quảng cáo / trailer", on: (gstate.kads || (gstate.kads = { on: true, name: "" })).on,
      eps: [], numbered: [], dups: [], duplicateEpisodes: [], missing: [], tail: [], warnings: [], merged: [], lines, mlines: [], isAds: true });
  }
  return { groups, total: videos.length, withMix: videos.filter(x => x.mixId).length,
    nMix: new Set(videos.filter(x => x.mixId).map(x => x.mixId)).size,
    skippedMerged: o.takeM ? 0 : merged.length, skippedAds: o.takeA ? 0 : ads.length };
}

let clusters = [], scanHref = "", scanTitle = "", revTouched = false, pollTimer = null, curKey = "";
// ---- v2.1: cac bo (合集 / 短剧) -> 1 danh sach gia gom tat ca bo cua tai khoan (moi tap gan ma bo + thu tu cua Douyin) ----
// Douyin chan moi loi goi API tu extension (403 "Sign Invalid"), nen KHONG goi API: bam tab 合集 / 短剧 de CHINH trang tai + ky,
// roi (nen) mo tung trang bo (douyin.com/collection/ID) trong tab an; hook.js doc ket qua trang tu tai ve, gan thu tu theo thu tu den.
const MIX_KEY = "__yt_all";
let mixCluster = null, mixTimer = null, harvestRecs = {}, harvestInfo = null, harvestJob = null, lastDisc = null;
const ownerOf = u => ((u || "").match(/\/user\/([^/?#]+)/) || [])[1] || "";
function withMixCluster(arr) { return mixCluster ? [mixCluster, ...(arr || []).filter(c => c.mix !== MIX_KEY)] : (arr || []); }
// Du lieu 1 tap: uu tien ban lay tu trang bo (co thu tu cua Douyin), bo sung ten / tong tap tu danh sach bo
function metaOf(id) {
  const h = harvestRecs[id], a = awemeMeta[id] || null;
  if (!h) return a;
  const mi = h.mix || {}, hm = (harvestInfo && harvestInfo.mixes && harvestInfo.mixes[mi.id]) || {}, am = a && a.mix && a.mix.id === mi.id ? a.mix : {};
  return { ...(a || {}), ...h, mix: { ...mi, name: mi.name || am.name || hm.name || "", total: mi.total || am.total || hm.total || null, cur: am.cur || mi.cur || 0 } };
}
// Neu API tra tap MOI NHAT truoc (thoi gian giam dan o hau het cap lien ke) thi dao lai thu tu den, de tap 1 dung dau
function fixOrder(recs) {
  const by = {};
  for (const [id, r] of Object.entries(recs || {})) if (r && r.mix && r.mix.id) (by[r.mix.id] = by[r.mix.id] || []).push([id, r]);
  const out = { ...recs };
  for (const arr of Object.values(by)) {
    arr.sort((a, b) => (a[1].mix.ord || 0) - (b[1].mix.ord || 0));
    if (arr.length < 3 || arr.some(([, r]) => r.mix.cur > 0)) continue;
    let down = 0, pairs = 0;
    for (let i = 1; i < arr.length; i++) { const x = arr[i - 1][1].ts, y = arr[i][1].ts; if (x && y && x !== y) { pairs++; if (y < x) down++; } }
    if (pairs >= 2 && down / pairs >= 0.85) arr.forEach(([id, r], i) => { out[id] = { ...r, mix: { ...r.mix, ord: arr.length - i } }; });
  }
  return out;
}
function rebuildMixCluster() {
  const rec = id => metaOf(id);
  const want = new Map();                                              // ma bo -> thu tu hien (danh sach bo cua tai khoan truoc)
  for (const id of ((harvestInfo && harvestInfo.ids) || [])) want.set(id, want.size);
  for (const r of Object.values(harvestRecs)) if (r.mix && r.mix.id && !want.has(r.mix.id)) want.set(r.mix.id, want.size);
  for (const r of Object.values(awemeMeta)) if (r.mix && r.mix.id && !want.has(r.mix.id)) want.set(r.mix.id, want.size);
  const seen = new Set(), rows = [];
  for (const id of [...Object.keys(harvestRecs), ...Object.keys(awemeMeta)]) {
    if (seen.has(id)) continue; seen.add(id);
    const r = rec(id); if (r && r.mix && want.has(r.mix.id)) rows.push({ id, r });
  }
  if (!rows.length) { mixCluster = null; return; }
  rows.sort((a, b) => want.get(a.r.mix.id) - want.get(b.r.mix.id) || (a.r.mix.cur || a.r.mix.ord || 1e9) - (b.r.mix.cur || b.r.mix.ord || 1e9) || (a.r.ts || 0) - (b.r.ts || 0));
  mixCluster = { mix: MIX_KEY, label: "Các bộ (合集) của tài khoản", items: rows.map(({ id, r }) => ({ url: "https://www.douyin.com/video/" + id, title: r.desc || "", dur: r.dur || 0 })) };
}
function mixLine() {
  const j = harvestJob, info = harvestInfo, have = mixCluster ? mixCluster.items.length : 0;
  if (!j && lastDisc && lastDisc.msg) return lastDisc.msg;
  if (!j) return "";
  const sec = Math.max(0, Math.round(((j.t1 || Date.now()) - (j.t0 || Date.now())) / 1000));
  if (j.running) return `⏳ Đang mở từng bộ ở tab nền (giữ trình duyệt mở)… ${j.done}/${j.total} bộ • ${j.got} tập • ${sec}s`;
  const mixes = (info && info.mixes) || {}, bad = Object.entries(mixes).filter(([, m]) => !m.ok).map(([id, m]) => (m.name || id) + ": " + (m.why || "lỗi"));
  const badTxt = bad.length ? ` ⚠ ${bad.length} bộ lỗi: ${bad.slice(0, 2).join(" | ")}` : "";
  const nOk = Object.values(mixes).filter(m => m.ok).length;
  if (!have) return "⚠ Không lấy được tập nào." + (badTxt || " ") + " Bấm F5 tải lại trang rồi thử lại, hoặc bấm “Copy chẩn đoán” gửi cho người hỗ trợ.";
  if (!nOk) { const nm = new Set((mixCluster.items || []).map(x => { const m = metaOf((x.url.match(/(\d+)$/) || [])[1]); return m && m.mix && m.mix.id; }).filter(Boolean)).size; return `✔ Có ${nm} bộ (${have} tập) theo dữ liệu trang; không mở được trang từng bộ.` + badTxt; }
  return `✔ Đã lấy ${nOk} bộ • ${have} tập theo đúng thứ tự của Douyin (${sec}s).` + badTxt;
}
function applyMix(selectIt) {
  rebuildMixCluster();
  clusters = withMixCluster(clusters);
  if (mixCluster && selectIt) curKey = "mix:" + MIX_KEY;
  const el = $("mixInfo"); if (el) el.textContent = mixLine();
  $("getmix").disabled = !!(harvestJob && harvestJob.running);
}
async function loadHarvest() {
  const st = await chrome.storage.local.get(["harvest", "harvestJob"]);
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true }).catch(() => []);
  const owner = ownerOf(tab && tab.url);
  harvestJob = st.harvestJob || null;
  const h = st.harvest;
  if (h && (!owner || !h.owner || h.owner === owner)) { harvestInfo = h; harvestRecs = fixOrder(h.recs || {}); }
  else { harvestInfo = null; harvestRecs = {}; if (harvestJob && harvestJob.owner && owner && harvestJob.owner !== owner) harvestJob = null; }
  return harvestJob;
}
function pollMix() {
  clearInterval(mixTimer);
  let shown = "";
  mixTimer = setInterval(async () => {
    try {
      const j = await loadHarvest();
      const key = j ? j.done + "/" + j.got + "/" + (j.running ? 1 : 0) : "-";
      if (key !== shown) { shown = key; applyMix(true); renderScan(false); }
      if (!j || !j.running) { clearInterval(mixTimer); applyMix(true); renderScan(false); }
    } catch (e) { clearInterval(mixTimer); }
  }, 900);
}
const MIX_PAGE = /^https?:\/\/[^/]*douyin\.com\/(?:user|collection)\//;
// Chay TRONG trang Douyin (world ISOLATED, doc DOM): bam lan luot tab con 合集 -> 短剧 -> 作品; trang tu tai + ky du lieu, ta doc cac link bo hien ra
async function pageDiscover() {
  const vis = e => { const r = e.getBoundingClientRect(); return r.width > 0 && r.height > 0; };
  const find = label => {
    const re = new RegExp("^" + label + "\\s*[\\d.,万wW]*$");
    const c = [...document.querySelectorAll("div,span,li,button,a,p")].filter(e => vis(e) && re.test((e.innerText || "").trim()) && !e.closest("a[href*='/video/']"));
    c.sort((a, b) => a.querySelectorAll("*").length - b.querySelectorAll("*").length);      // lay phan tu sau nhat (chinh la nut tab)
    return c[0] || null;
  };
  const sleepMs = ms => new Promise(r => setTimeout(r, ms));
  const res = { clicked: [], anchors: {} };
  const scrollAll = () => { try { for (const el of [document.scrollingElement, ...[...document.querySelectorAll("div,main,section,ul")].filter(e => e.scrollHeight > e.clientHeight + 40 && /(auto|scroll)/.test(getComputedStyle(e).overflowY))]) if (el) el.scrollTop = el.scrollHeight; } catch (e) {} };
  const grab = label => {
    const found = [];
    for (const a of document.querySelectorAll("a[href]")) {
      const m = (a.getAttribute("href") || "").match(/\/(collection|series|playlet|shortplay|mix)\/(\d{6,})/);
      if (m) {
        const lines = (a.innerText || "").split(/\n+/).map(x => x.trim()).filter(Boolean);
        const meta = /^[\d.,万wW]+\s*(集|个视频|个作品|部|个|更新|播放)?$/;
        const name = (lines.find(x => !meta.test(x)) || "").replace(/\s*\d+\s*(集|个视频|个作品|部)\s*$/, "").slice(0, 40);
        found.push({ kind: m[1], id: m[2], text: name });
      }
    }
    res.anchors[label] = found;
  };
  for (const label of ["合集", "短剧", "作品"]) {
    const el = find(label); if (!el) continue;
    try { el.click(); res.clicked.push(label); } catch (e) {}
    await sleepMs(label === "作品" ? 700 : 3200);
    if (label !== "作品") { for (let k = 0; k < 3; k++) { scrollAll(); await sleepMs(1100); } grab(label); }
  }
  return res;
}
async function startMix(manual) {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab || !MIX_PAGE.test(tab.url || "")) {
    if (manual) $("mixInfo").textContent = "Mở trang cá nhân (douyin.com/user/…) hoặc trang bộ (douyin.com/collection/…) rồi bấm lại.";
    return false;
  }
  const perm = await chrome.permissions.contains({ origins: ["*://*.douyin.com/*"] }).catch(() => false) || await chrome.permissions.request({ origins: ["*://*.douyin.com/*"] }).catch(() => false);
  if (!perm) { lastDisc = { msg: "Cần cấp quyền Douyin (nút “Cấp quyền Douyin” ở trên) để tự mở từng bộ." }; $("mixInfo").textContent = lastDisc.msg; return false; }
  await injectHook();
  lastDisc = { msg: "⏳ Đang bấm tab 合集 / 短剧 để Douyin tự tải danh sách bộ… (giữ tab này, ~12 giây)" };
  $("mixInfo").textContent = lastDisc.msg; $("getmix").disabled = true;
  const onUser = /\/user\//.test(tab.url);
  const disc = onUser ? await runInTab(pageDiscover).catch(() => null) : { clicked: [], anchors: {} };
  await syncMeta(false);
  const items = new Map();
  const add = (id, kind, name, total) => { if (!/^\d{6,}$/.test(id)) return; const o = items.get(id) || { id, kind: kind || "collection", name: "", total: null }; if (name && !o.name) o.name = name; if (total != null) o.total = total; if (kind && kind !== "collection") o.kind = kind; items.set(id, o); };
  const cm = (tab.url.match(/\/collection\/(\d{6,})/) || [])[1]; if (cm) add(cm, "collection", "");
  for (const m of ((hookInfo && hookInfo.mixList) || [])) add(m.id, "collection", m.name, m.total);
  for (const arr of Object.values((disc && disc.anchors) || {})) for (const a of arr) add(a.id, a.kind, a.text);
  const list = [...items.values()].map(o => ({ ...o, url: `https://www.douyin.com/${o.kind}/${o.id}` }));
  lastDisc = { clicked: disc && disc.clicked, found: list.map(x => ({ id: x.id, kind: x.kind, name: x.name })), anchors: disc && disc.anchors && Object.fromEntries(Object.entries(disc.anchors).map(([k, v]) => [k, v.length])) };
  if (!list.length) {
    lastDisc.msg = "⚠ Không thấy bộ nào" + (disc && disc.clicked && disc.clicked.length ? ` ở tab ${disc.clicked.filter(x => x !== "作品").join(" / ") || "合集 / 短剧"}` : " (không tìm thấy tab 合集 / 短剧 trên trang)") + " → chưa xác nhận được bộ trong 合集 / 短剧; sẽ giữ danh sách trong một bộ, không tự tách theo ảnh bìa. Nếu tab 合集 có bộ mà vẫn báo vậy: bấm “Copy chẩn đoán”.";
    $("mixInfo").textContent = lastDisc.msg; $("getmix").disabled = false;
    return false;
  }
  lastDisc.msg = `Tìm thấy ${list.length} bộ: ${list.slice(0, 4).map(x => x.name || x.id).join(", ")}${list.length > 4 ? "…" : ""}. Đang mở từng bộ ở tab nền…`;
  $("mixInfo").textContent = lastDisc.msg;
  await chrome.storage.local.set({ harvestJob: { running: true, done: 0, total: list.length, got: 0, notes: [], t0: Date.now(), owner: ownerOf(tab.url) } });
  chrome.runtime.sendMessage({ type: "harvest", items: list, owner: ownerOf(tab.url) });
  pollMix();
  return true;
}
$("getmix").onclick = () => startMix(true);
$("mixdiag").onclick = async () => {
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    $("mixdiag").textContent = "Đang thu thập…";
    await loadHarvest().catch(() => {});
    await syncMeta(false);
    const urls = await runInTab(() => window.__ytUrls || [], [], "MAIN").catch(() => null);
    const mixes = await runInTab(() => Object.values(window.__ytMixes || {}).slice(0, 40), [], "MAIN").catch(() => null);
    const api = await runInTab(() => window.__ytApi || {}, [], "MAIN").catch(() => null);
    const tabsDom = await runInTab(() => {                       // cau truc tab / link bo that tren trang (de sua neu Douyin doi giao dien)
      const out = { tabs: [], anchors: [] };
      for (const e of document.querySelectorAll("div,span,li,button")) { const t = (e.innerText || "").trim(); if (t.length <= 12 && /^(作品|合集|短剧|喜欢|收藏|推荐|观看历史)/.test(t) && e.children.length <= 2) out.tabs.push({ t, tag: e.tagName, cls: String(e.className || "").slice(0, 40), role: e.getAttribute("role") || "" }); }
      for (const a of document.querySelectorAll("a[href]")) { const h = a.getAttribute("href") || ""; if (/\/(collection|series|playlet|shortplay|mix)\//.test(h)) out.anchors.push(h.slice(0, 70)); }
      out.tabs = out.tabs.slice(0, 12); out.anchors = out.anchors.slice(0, 20); return out;
    }).catch(() => null);
    const ids = Object.keys(awemeMeta), sample = ids.slice(0, 4).map(id => { const r = awemeMeta[id]; return { id, desc: (r.desc || "").slice(0, 30), dur: r.dur, ts: r.ts, mix: r.mix, au: (r.au || "").slice(0, 12) }; });
    const cov = { stat: coverStat, have: Object.keys(coverSig).length, urls: [...covRaw.entries()].slice(0, 3).map(([id, u]) => ({ id, u: u.slice(0, 110) })), groups: (() => { const m = {}; for (const [id, c] of Object.entries(covCache.cid)) m[c] = (m[c] || 0) + 1; return m; })() };
    const hv = harvestInfo ? { owner: harvestInfo.owner, mixes: harvestInfo.mixes, recs: Object.keys(harvestInfo.recs || {}).length } : null;
    const info = { ext: chrome.runtime.getManifest().version, status: $("mixInfo") ? $("mixInfo").textContent : "", discover: lastDisc, job: harvestJob, harvest: hv, covers: cov, tabsDom,
      mixes, api, url: tab && tab.url, hook: Object.assign({}, hookInfo, { meta: undefined }), apiSeen: urls, sample, groups: (() => { try { return buildGroups().groups.map(g => ({ name: g.name, n: g.eps.length, merged: g.merged.length, missing: g.missing.length })); } catch (e) { return String(e); } })(), ua: navigator.userAgent };
    await navigator.clipboard.writeText(JSON.stringify(info, null, 1));
    $("mixdiag").textContent = "Copy chẩn đoán"; flash("mixdiag", "✔ Đã copy chẩn đoán");
  } catch (e) { $("mixdiag").textContent = "Copy chẩn đoán"; $("mixInfo").textContent = "Không copy được chẩn đoán: " + e.message; }
};
async function runInTab(func, args = [], world) {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab) throw new Error("Không có tab đang mở");
  const inj = { target: { tabId: tab.id }, func, args };
  if (world) inj.world = world;
  const r = await chrome.scripting.executeScript(inj);
  return r && r[0] && r[0].result;
}
let hookInfo = null, metaN = -1;
// Dam bao hook.js dang chay trong trang Douyin (neu da dang ky san thi khong lam gi them)
async function injectHook() {
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab || !/^https?:\/\/[^/]*douyin\.com\//.test(tab.url || "")) return;
    await chrome.scripting.executeScript({ target: { tabId: tab.id }, files: ["hook.js"], world: "MAIN" });
  } catch (e) {}
}
async function syncMeta(deep) {
  const m = await runInTab(pageMeta, [metaN, !!deep], "MAIN").catch(() => null);
  if (!m) return false;
  hookInfo = m;
  if (m.meta) { awemeMeta = m.meta; metaN = m.n; return true; }
  return false;
}
const clusterKey = (c, i) => (c.mix ? "mix:" + c.mix : "g" + i);
function score(c) {
  const ps = c.items.map(parseItem);
  return ps.filter(x => x.kind === "ep").length * 3 + c.items.length + (c.mix ? 50 : 0);
}
function buildGroups() {
  const c = clusters.find((c, i) => clusterKey(c, i) === curKey) || clusters[0];
  if (!c) return { groups: [], total: 0, withMix: 0, nMix: 0 };
  let all = c.items.map(parseItem);
  // tap dai bat thuong: so sanh trong tung bo (co ma bo) hoac trong nhom con lai
  const part = new Map();
  for (const x of all) { const k = x.mixId || ""; (part.get(k) || part.set(k, []).get(k)).push(x); }
  for (const arr of part.values()) markLongMerged(arr);
  const f = ($("flt").value || "").trim().toLowerCase();
  if (f) all = all.filter(x => ((x.title || "") + " " + (x.clean || "")).toLowerCase().includes(f));
  return computeGroups(all, { split: $("split").checked, rev: $("rev").checked, takeM: $("takemerged").checked, takeA: $("takead").checked, showT: $("showtitle").checked, guess: guessSeries(clusters) });
}

function renderGroups() {
  const box = $("groups"); box.innerHTML = "";
  const { groups, skippedMerged, skippedAds, total, withMix, nMix } = buildGroups();
  groups.forEach(g => {
    const el = document.createElement("div"); el.className = "grp";
    const top = document.createElement("div"); top.className = "top";
    const cb = document.createElement("input"); cb.type = "checkbox"; cb.checked = g.on;
    cb.onchange = () => { gstate[g.key].on = cb.checked; updTotals(); };
    top.append(cb);
    if (g.isAds) top.insertAdjacentHTML("beforeend", `<b style="flex:1">${g.name}</b>`);
    else {
      const inp = document.createElement("input"); inp.value = g.name; inp.placeholder = "Tên bộ"; inp.className = "gname";
      inp.oninput = () => { gstate[g.key].name = inp.value; refreshPv(); };
      top.append(inp);
    }
    const rng = g.eps.length && !g.loose ? `${g.eps[0].ep}→${g.eps[g.eps.length - 1].ep}` : "";
    top.insertAdjacentHTML("beforeend", `<span class="count">${g.lines.length} video${rng ? " • tập " + rng : ""}${g.total ? " / " + g.total : ""}</span>`);
    el.append(top);
    const pv = document.createElement("div"); pv.className = "gpv"; pv.dataset.key = g.key; el.append(pv);
    const warn = [];

    if (g.viaApi) warn.push("✔ theo dữ liệu bộ của Douyin" + (g.total ? ` (bộ có ${g.total} tập)` : ""));
    if (g.soft) warn.push("gom theo " + g.soft + " — kiểm tra lại");
    if (g.loose) warn.push("Video không có số tập / không thuộc bộ nào — mặc định KHÔNG tải (tick nếu muốn)");
    if (g.missing.length) warn.push("⚠ thiếu tập " + fmtRanges(g.missing.slice(0, 60)) + (g.missing.length > 60 ? "…" : "") + " (cuộn thêm / quét lại)");
    if (g.tail && g.tail.length) warn.push("chưa quét tới tập " + fmtRanges(g.tail) + " (cuộn thêm / quét lại)");
    if (g.unnumbered) warn.push(`${g.unnumbered} video thuộc bộ nhưng không rõ số tập — xếp vào cuối`);
    if (g.conflict) warn.push(`${g.conflict} video có số tập trong tên khác số tập của Douyin (đã dùng số của Douyin)`);
    if (g.merged.length) warn.push(`${g.merged.length} tập gộp ${$("takemerged").checked ? "(sẽ tải)" : "(đã bỏ, không tải)"}: ` + g.merged.map(m => (m.range ? m.range[0] + "-" + m.range[1] : "") + (m.autoMerged ? " [dài bất thường]" : "") + " " + (m.clean || "").slice(0, 16)).join(" | "));
    if (g.warnings) warn.push(...g.warnings);
    if (warn.length) { const w=document.createElement("div"); w.className="gwarn"; w.textContent=[...new Set(warn)].join(" • "); el.append(w); }
    box.append(el);
  });
  refreshPv(groups);
  const notes = [$("split").checked ? "Chỉ tách theo mã bộ Douyin, không tách theo ảnh bìa." : "Đang gom 1 bộ duy nhất; giữ cách xếp tập hiện có."];
  if (skippedAds) notes.push(`${skippedAds} quảng cáo/trailer bị bỏ`);
  $("startn").textContent = notes.join(" • ");
  showMetaInfo(total, withMix, nMix);
  updTotals(groups);
}
function showMetaInfo(total, withMix, nMix) {
  const el = $("metaInfo"); if (!el) return;
  if (!/douyin\.com/.test(scanHref)) { el.textContent = ""; return; }
  if (!hookInfo || !hookInfo.hooked) el.textContent = "⚠ Chưa đọc được dữ liệu bộ của Douyin → đang đoán theo tên tập. Nhấn F5 tải lại trang Douyin rồi quét lại.";
  else if (!hookInfo.count) el.textContent = "Chưa bắt được dữ liệu API (đã nghe " + hookInfo.resp + " phản hồi). Nhấn F5 tải lại trang rồi quét lại — nếu vẫn vậy thì đang đoán theo tên tập.";
  else el.textContent = `Dữ liệu Douyin: ${hookInfo.count} video đã biết • ${withMix}/${total} video trong danh sách này có thông tin bộ${nMix ? " (" + nMix + " bộ)" : ""}`;
}
function refreshPv(gs) {
  const { groups } = gs ? { groups: gs } : buildGroups();
  document.querySelectorAll(".gpv").forEach(pv => {
    const g = groups.find(x => x.key === pv.dataset.key); if (!g) return;
    pv.innerHTML = "";
    const L = g.lines, add = i => {
      const d = document.createElement("div"); d.textContent = L[i].name + "   ⟵ " + (L[i].title || "").slice(0, 28);
      if (L[i].thumb) { const im = document.createElement("img"); im.src = L[i].thumb; im.style.cssText = "height:30px;vertical-align:middle;margin-right:5px;border-radius:3px"; d.prepend(im); d.style.cssText = "height:34px;line-height:34px"; }
      pv.append(d);
    };
    if (L.length <= 6) L.forEach((_, i) => add(i)); else { [0, 1, 2].forEach(add); const d = document.createElement("div"); d.textContent = "…"; pv.append(d); [L.length - 2, L.length - 1].forEach(add); }
  });
  updTotals(groups);
}
function allLines() { const { groups } = buildGroups(); return groups.filter(g => g.on).flatMap(g => g.lines); }
function updTotals(gs) {
  const { groups } = gs ? { groups: gs } : buildGroups();
  const on = groups.filter(g => g.on), n = on.reduce((s, g) => s + g.lines.length, 0);
  $("totals").textContent = n ? `Sẽ copy ${n} link từ ${on.length} bộ` : "Chưa có link";
  $("cplinks").disabled = $("cpplain").disabled = $("dllinks").disabled = !n;
}
function renderScan(scanning) {
  const sel = $("cluster"), keep = curKey;
  sel.innerHTML = "";
  const order = clusters.map((c, i) => [c, i]).sort((a, b) => score(b[0]) - score(a[0]));
  order.forEach(([c, i]) => {
    const o = document.createElement("option"); o.value = clusterKey(c, i);
    const nep = c.items.map(parseItem).filter(x => x.kind === "ep").length;
    const sample = (parseItem(c.items[0] || {}).clean || "").slice(0, 24);
    o.textContent = `${c.label ? "【" + c.label.slice(0, 18) + "】 " : ""}${c.items.length} video (${nep} tập) — ${sample}`;
    sel.append(o);
  });
  const bestKey = order.length ? clusterKey(order[0][0], order[0][1]) : "";
  if (!userPicked || !keep || !clusters.some((c, i) => clusterKey(c, i) === keep)) curKey = bestKey;   // chua tu chon thi luon theo danh sach tot nhat (luc dau co the moi thay danh sach nho)
  sel.value = curKey;
  const all = clusters.reduce((s, c) => s + c.items.length, 0);
  $("scanInfo").textContent = clusters.length ? `Trang có ${clusters.length} danh sách (${all} link)${scanning ? " — đang cuộn tiếp..." : " ✔ đã quét xong"}`
    : (scanning ? "⏳ Đang quét..." : "Chưa thấy video nào trên trang này.");
  renderGroups();
}
const rerender = () => renderScan(false);
let userPicked = false;
$("cluster").onchange = () => { curKey = $("cluster").value; userPicked = true; rerender(); };
for (const id of ["takemerged", "takead", "showtitle", "split", "rev"]) $(id).onchange = rerender;
$("flt").oninput = rerender;
$("scan").onclick = async () => {
  const coverPerm = chrome.permissions.contains({ origins: COVER_ORIGINS }).then(ok => ok || chrome.permissions.request({ origins: COVER_ORIGINS })).catch(() => false);   // phai goi ngay khi bam (can thao tac nguoi dung)
  await coverPerm;
  $("scan").disabled = true; $("scanInfo").textContent = "⏳ Đang cuộn trang để tải hết danh sách (giữ tab này mở)...";
  metaN = -1; userPicked = false; await injectHook(); await syncMeta(true);
  await startMix(false).catch(() => {});                 // trang ca nhan: bam tab 合集 / 短剧 truoc (~12s), mo tung bo o tab nen; xong moi cuon danh sach 作品
  $("scanInfo").textContent = "⏳ Đang cuộn trang để tải hết danh sách (giữ tab này mở)...";
  runInTab(pageScan, [300]).catch(e => { $("scanInfo").textContent = "Lỗi: " + e.message + " (không quét được trang chrome:// hoặc trang chưa tải xong)"; });
  let seen = false, ticks = 0;
  clearInterval(pollTimer);
  pollTimer = setInterval(async () => {
    try {
      const res = await runInTab(pageRead); ticks++;
      if (res.scanning) seen = true;
      await syncMeta(ticks % 3 === 0 || !res.scanning);
      clusters = withMixCluster(res.clusters || []); scanHref = res.href; scanTitle = res.title;
      renderScan(res.scanning);
      if (!res.scanning && (seen || ticks > 5)) { clearInterval(pollTimer); $("scan").disabled = false; startCovers().catch(() => {}); }
    } catch (e) { clearInterval(pollTimer); $("scan").disabled = false; }
  }, 1000);
};
$("stopscan").onclick = () => { runInTab(pageStop).catch(() => {}); chrome.runtime.sendMessage({ type: "stopharvest" }); };
let directMap = {};
const DIRECT_TTL = 2 * 3600 * 1000;
const directOf = u => { const d = directMap[u]; return d && d.cacheVersion === 2 && d.verifiedAwemeId === idOf(u) && Date.now() - d.t < DIRECT_TTL ? d.url : ""; };
const linkText = () => allLines().map(x => x.url + "\t" + x.name + (directOf(x.url) ? "\t" + directOf(x.url) : "")).join("\n");
const flash = (id, txt) => { const el = $(id), o = el.textContent; el.textContent = txt; setTimeout(() => el.textContent = o, 1500); };
$("cplinks").onclick = async () => { await navigator.clipboard.writeText(linkText()); flash("cplinks", "✔ Đã copy"); };
$("cpplain").onclick = async () => { await navigator.clipboard.writeText(allLines().map(x => x.url).join("\n")); flash("cpplain", "✔ Đã copy"); };
$("dllinks").onclick = () => {
  const a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob([linkText() + "\n"], { type: "text/plain" }));
  a.download = "links.txt"; a.click();
};
runInTab(pageRead).then(async res => { if (res && res.clusters && res.clusters.length) { await syncMeta(true); clusters = withMixCluster(res.clusters); scanHref = res.href; renderScan(res.scanning); if (!res.scanning) startCovers().catch(() => {}); } }).catch(() => {});

// ---- lay link tai truc tiep (Douyin) bang trinh duyet cua ban, chay o nen ----
async function refreshDirect() {
  const st = await chrome.storage.local.get(["direct", "grabJob"]);
  directMap = st.direct || {};
  const j = st.grabJob || {};
  const mine = allLines().filter(l => /douyin\.com\/video\//.test(l.url));
  const have = mine.filter(l => directOf(l.url)).length;
  $("directInfo").textContent = j.running ? `⏳ Đang lấy link ${j.done}/${j.total} (mở từng tập ở nền — đừng đóng trình duyệt)…`
    : (mine.length ? `Đã có link trực tiếp: ${have}/${mine.length}` + (have < mine.length ? " — bấm nút để lấy phần còn thiếu" : " ✔ (dùng được ~2 giờ)") : "");
  $("getdirect").disabled = !!j.running || !mine.length;
  $("stopdirect").style.display = j.running ? "" : "none";
}
$("getdirect").onclick = async () => {
  const ok = await chrome.permissions.contains({ origins: ["*://*.douyin.com/*"] }).catch(() => false) || await chrome.permissions.request({ origins: ["*://*.douyin.com/*"] }).catch(() => false);
  if (!ok) { $("directInfo").textContent = "Cần cấp quyền Douyin (nút “Cấp quyền Douyin” ở trên)."; return; }
  const urls = allLines().map(l => l.url).filter(u => /douyin\.com\/video\//.test(u));
  chrome.runtime.sendMessage({ type: "grab", urls });
  setTimeout(refreshDirect, 400);
};
$("stopdirect").onclick = () => chrome.runtime.sendMessage({ type: "stopgrab" });
setInterval(() => { refreshDirect().catch(() => {}); }, 1500);
refreshDirect().catch(() => {});

// ---- mo popup: neu da lay bo xong (hoac dang lay) cho tai khoan nay thi hien lai ngay ----
(async () => {
  try {
    await syncMeta(false);
    const j = await loadHarvest();
    if (!j && !harvestInfo) return;
    applyMix(true); renderScan(false);
    if (j && j.running) pollMix();
  } catch (e) {}
})();
