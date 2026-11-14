// Chay TRONG trang Douyin (world MAIN), ngay khi trang bat dau tai.
// Viec duy nhat: "nghe" cac phan hoi JSON ma CHINH trang Douyin vua tai ve (danh sach video, thong tin bo / tap)
// va luu lai o bo nho cua trang (window.__ytAweme). Khong gui di dau, khong tu goi API nao.
(function () {
  if (window.__ytHookV >= 4) return;                    // ban cu (v2) da chay san: nang cap tai cho, giu du lieu da bat
  window.__ytHookV = 4;
  var store = window.__ytAweme = window.__ytAweme || Object.create(null);   // aweme_id -> ban ghi
  window.__ytAwemeN = window.__ytAwemeN || 0;           // tang moi khi co du lieu moi
  window.__ytHookResp = window.__ytHookResp || 0;       // so phan hoi da doc
  var mixes = window.__ytMixes = window.__ytMixes || Object.create(null);   // mix_id -> {id, name, total, got, full}
  var seenUrls = window.__ytUrls = window.__ytUrls || [];                   // cac API da nghe (chi duong dan) - de chan doan

  var WANT = /aweme|\/mix\/|collection|series|playlet|feed|detail/i;
  var SKIP = { video: 1, music: 1, author: 1, statistics: 1, text_extra: 1, cover: 1, images: 1, risk_infos: 1, ad_info: 1 };
  var num = function (v) { var n = Number(v); return isFinite(n) ? n : null; };
  var pick = function () { for (var i = 0; i < arguments.length; i++) { var v = arguments[i]; if (v !== undefined && v !== null && v !== "") return v; } return null; };

  function mixOf(o) {
    var m = o.mix_info || o.mixInfo || o.series_info || o.seriesInfo || o.playlet_info || null;
    if (!m || typeof m !== "object") return null;
    var st = m.statis || m.statistics || {};
    var id = pick(m.mix_id, m.mixId, m.series_id, m.seriesId, m.id);
    if (!id) return null;
    return {
      id: String(id),
      name: String(pick(m.mix_name, m.mixName, m.series_name, m.seriesName, m.name, m.title) || ""),
      cur: num(pick(st.current_episode, m.current_episode, st.currentEpisode, m.currentEpisode, m.episode_number, m.episode)),
      total: num(pick(st.updated_to_episode, m.updated_to_episode, st.updatedToEpisode, m.updatedToEpisode, m.total_episode, m.episode_total, m.total))
    };
  }

  // Media addresses stay bound to the aweme whose native response supplied them.
  function playUrlsOf(v) {
    var out = [], domains = ["douyinvod.com", "douyincdn.com", "douyin.com", "iesdouyin.com", "amemv.com", "snssdk.com", "bytecdn.cn", "bytecdn.com", "zjcdn.com", "pstatp.com", "ibytedtos.com", "byteoversea.com", "bytedance.com", "tiktokcdn.com", "muscdn.com"];
    function add(a) {
      if (!a || !Array.isArray(a.url_list || a.urlList)) return;
      (a.url_list || a.urlList).forEach(function (value) {
        if (typeof value !== "string") return;
        var text = value.indexOf("//") === 0 ? "https:" + value : value.replace(/^http:/i, "https:");
        try {
          var u = new URL(text);
          if (u.protocol === "https:" && !u.username && !u.password && domains.some(function (d) { return u.hostname === d || u.hostname.endsWith("." + d); }) && out.indexOf(text) < 0) out.push(text);
        } catch (e) {}
      });
    }
    add(v.play_addr || v.playAddr);
    (Array.isArray(v.bit_rate || v.bitRate) ? v.bit_rate || v.bitRate : []).forEach(function (b) { if (b) add(b.play_addr || b.playAddr); });
    return out;
  }

  function rec(o) {
    var id = String(pick(o.aweme_id, o.awemeId) || "");
    if (!/^\d{8,}$/.test(id)) return false;
    var v = o.video || {};
    var ms = num(pick(v.duration, o.duration));
    var cover = "";
    try { cover = (v.cover && v.cover.url_list && v.cover.url_list[0]) || (v.origin_cover && v.origin_cover.url_list && v.origin_cover.url_list[0]) || ""; } catch (e) {}
    var au = "";
    try { au = String((o.author && (o.author.sec_uid || o.author.secUid)) || o.sec_uid || ""); } catch (e) {}
    var tags = [];
    try { (o.text_extra || o.textExtra || []).forEach(function (t) { var n = t && (t.hashtag_name || t.hashtagName); if (n) tags.push(String(n)); }); } catch (e) {}
    var r = {
      id: id,
      desc: String(pick(o.desc, o.item_title, o.caption) || ""),
      dur: ms != null ? ms / 1000 : null,
      ts: num(pick(o.create_time, o.createTime)),
      top: !!num(pick(o.is_top, o.isTop)),
      mix: mixOf(o),
      au: au,
      cover: cover,
      playUrls: playUrlsOf(v),
      tags: tags
    };
    var old = store[id];
    if (!old) { store[id] = r; window.__ytAwemeN++; return true; }
    var ch = false;
    for (var k in r) {
      var nv = r[k], ov = old[k];
      var empty = nv === null || nv === "" || (Array.isArray(nv) && !nv.length);
      if (!empty && k === "mix" && ov && typeof ov === "object") {       // giu so thu tu (ord) va so tap da biet
        nv = { id: nv.id, name: nv.name || ov.name || "", cur: nv.cur != null ? nv.cur : ov.cur, total: nv.total != null ? nv.total : ov.total, ord: ov.ord };
      }
      if (!empty && JSON.stringify(nv) !== JSON.stringify(ov)) { old[k] = nv; ch = true; }
    }
    if (ch) window.__ytAwemeN++;
    return ch;
  }

  // Ghi nho 1 bo (合集): ten + tong so tap. Goi cho moi doi tuong co mix_id + mix_name (danh sach bo, mix_info trong video...)
  function noteMix(o) {
    var id = String(pick(o.mix_id, o.mixId, o.series_id, o.seriesId) || "");
    if (!/^\d{6,}$/.test(id)) return false;
    var st = o.statis || o.statistics || {};
    var name = String(pick(o.mix_name, o.mixName, o.series_name, o.seriesName, o.title) || ""), tot = num(pick(st.updated_to_episode, st.updatedToEpisode, o.updated_to_episode, o.total_episode, o.episode_total, o.total));
    var e = mixes[id], ch = false;
    if (!e) { e = mixes[id] = { id: id, name: name, total: tot, got: 0, full: false }; ch = true; }
    else {
      if (name && !e.name) { e.name = name; ch = true; }
      if (tot != null && tot !== e.total) { e.total = tot; ch = true; }
    }
    if (ch) window.__ytAwemeN++;
    return true;
  }

  function walk(o, d) {
    if (!o || typeof o !== "object" || d > 14) return;
    if (Array.isArray(o)) { for (var i = 0; i < o.length; i++) walk(o[i], d + 1); return; }
    if (((o.mix_id || o.mixId) && (o.mix_name || o.mixName)) || ((o.series_id || o.seriesId) && (o.series_name || o.seriesName || o.title))) noteMix(o);
    if (o.aweme_id || o.awemeId) rec(o);
    for (var k in o) { if (SKIP[k]) continue; var c = o[k]; if (c && typeof c === "object") walk(c, d + 1); }
  }

  var apiLog = window.__ytApi = window.__ytApi || Object.create(null);      // duong dan -> {n, q: ten tham so, keys, lists, first} (de chan doan)
  function noteUrl(u) {
    try {
      var full = String(u), p = full.replace(/^https?:\/\/[^/]+/, "").split("?")[0];
      if (seenUrls.length < 40 || seenUrls.indexOf(p) < 0) { seenUrls.push(p); if (seenUrls.length > 60) seenUrls.shift(); }
      var ent = apiLog[p];
      if (!ent) {
        var q = []; try { new URL(full, location.href).searchParams.forEach(function (v, k) { if (q.length < 40) q.push(k); }); } catch (e) {}
        if (Object.keys(apiLog).length > 80) return null;
        ent = apiLog[p] = { n: 0, q: q };
      }
      ent.n++;
      return ent;
    } catch (e) { return null; }
  }
  function shape(j, ent) {          // hinh dang phan hoi: khoa cap 1, cac mang + khoa cua phan tu dau
    try {
      if (!ent || !j || typeof j !== "object" || ent.keys) return;
      ent.keys = Object.keys(j).slice(0, 25); ent.lists = {}; ent.first = {};
      if (j.status_code != null) ent.status = j.status_code;
      var c = 0;
      for (var k in j) {
        var v = j[k];
        if (Array.isArray(v)) {
          ent.lists[k] = v.length;
          if (c++ < 3 && v[0] && typeof v[0] === "object") ent.first[k] = Object.keys(v[0]).slice(0, 40);
        }
      }
    } catch (e) {}
  }
  // Trang bo (douyin.com/collection/ID, /series/ID...): moi phan hoi API cua bo (url co /mix/ /series/ /playlet/) tra ve cac tap THEO THU TU,
  // cac phan hoi den lan luot (trang cuon tai them) => gan ma bo + so thu tu theo thu tu den. Khong can SDK / chu ky nao: chinh trang tu goi.
  var pg = (location.pathname.match(/^\/(?:collection|series|playlet|shortplay|mix)\/(\d{6,})/) || [])[1] || "";
  window.__ytPageGroup = pg;
  var arrive = window.__ytArrive = window.__ytArrive || Object.create(null);    // ma bo -> so tap da nhan
  function tagPage(j, url) {
    var u = String(url || "");
    if (!/\/(?:mix|series|playlet)\//i.test(u)) return;
    var id = (u.match(/[?&](?:mix_id|series_id|collection_id|playlet_id)=(\d{6,})/) || [])[1] || pg;      // uu tien ma trong chinh URL goi API (trang tu chuyen sang /video/... van dung)
    if (!id) return;
    var list = null;
    if (j && typeof j === "object") for (var k in j) if (Array.isArray(j[k]) && j[k].length && j[k][0] && (j[k][0].aweme_id || j[k][0].awemeId || (j[k][0].aweme_info && j[k][0].aweme_info.aweme_id))) { list = j[k]; break; }
    if (!list) return;
    for (var i = 0; i < list.length; i++) {
      var a = list[i] && (list[i].aweme_info || list[i]); if (!a) continue;
      var aid = String(pick(a.aweme_id, a.awemeId) || ""), s2 = store[aid];
      if (!s2 || (s2.mix && s2.mix.id === id && s2.mix.ord)) continue;
      var e = mixes[id];
      s2.mix = { id: id, name: (e && e.name) || (s2.mix && s2.mix.id === id && s2.mix.name) || "", cur: s2.mix && s2.mix.id === id && s2.mix.cur != null ? s2.mix.cur : null, total: e && e.total != null ? e.total : (s2.mix && s2.mix.id === id ? s2.mix.total : null), ord: (arrive[id] = (arrive[id] || 0) + 1) };
      window.__ytAwemeN++;
    }
  }
  function ingestObj(j, ent, url) { try { shape(j, ent); walk(j, 0); tagPage(j, url); window.__ytHookResp++; } catch (e) {} }
  function ingestText(t, ent, url) {
    if (!t || t.length > 12e6 || (t.charCodeAt(0) !== 123 && t.charCodeAt(0) !== 91)) return;
    try { ingestObj(JSON.parse(t), ent, url); } catch (e) {}
  }

  // ---- fetch ----
  try {
    var of = window.fetch;
    if (typeof of === "function") window.fetch = function () {
      var p = of.apply(this, arguments);
      try {
        var a0 = arguments[0], u = typeof a0 === "string" ? a0 : (a0 && a0.url) || String(a0 || "");
        if (WANT.test(u)) { var ent = noteUrl(u); p.then(function (r) { try { r.clone().text().then(function (t) { ingestText(t, ent, u); }, function () {}); } catch (e) {} }, function () {}); }
      } catch (e) {}
      return p;
    };
  } catch (e) {}

  // ---- XHR ----
  try {
    var xo = XMLHttpRequest.prototype.open, xs = XMLHttpRequest.prototype.send;
    XMLHttpRequest.prototype.open = function (m, u) { try { this.__ytu = String(u); } catch (e) {} return xo.apply(this, arguments); };
    XMLHttpRequest.prototype.send = function () {
      try {
        if (WANT.test(this.__ytu || "")) {
          var ent = noteUrl(this.__ytu), self = this;
          this.addEventListener("load", function () {
            try {
              var rt = self.responseType;
              if (rt === "" || rt === "text") ingestText(self.responseText, ent, self.__ytu);
              else if (rt === "json" && self.response) ingestObj(self.response, ent, self.__ytu);
            } catch (e) {}
          });
        }
      } catch (e) {}
      return xs.apply(this, arguments);
    };
  } catch (e) {}

  // ---- du lieu nhung san trong HTML (RENDER_DATA...) ----
  function scanDom() {
    try {
      var s = document.querySelectorAll("script#RENDER_DATA, script[type='application/json']");
      for (var i = 0; i < s.length; i++) {
        var t = s[i].textContent || "";
        if (!t || t.length > 12e6) continue;
        try { if (t.charAt(0) === "%") t = decodeURIComponent(t); } catch (e) {}
        ingestText(t);
      }
    } catch (e) {}
  }
  window.__ytScanDom = scanDom;
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", scanDom); else scanDom();

  // ---- du phong: doc du lieu tu props cua React gan voi tung link video tren trang ----
  function probe(o, d, seen) {
    if (!o || typeof o !== "object" || d > 3 || seen.has(o)) return false;
    seen.add(o);
    if (typeof Node !== "undefined" && o instanceof Node) return false;
    if (o.aweme_id || o.awemeId) { rec(o); return true; }
    var hit = false;
    for (var k in o) {
      if (k === "children" || k === "ref" || k === "key" || k === "_owner") continue;
      var v; try { v = o[k]; } catch (e) { continue; }
      if (v && typeof v === "object" && probe(v, d + 1, seen)) hit = true;
    }
    return hit;
  }
  window.__ytFiber = function () {
    var n = 0;
    try {
      var as = document.querySelectorAll("a[href*='/video/']");
      for (var i = 0; i < as.length && i < 3000; i++) {
        var a = as[i], key = null;
        for (var k in a) if (k.indexOf("__reactFiber$") === 0 || k.indexOf("__reactInternalInstance$") === 0) { key = k; break; }
        if (!key) continue;
        var f = a[key];
        for (var j = 0; f && j < 25; j++, f = f.return) {
          var p = f.memoizedProps;
          if (p && typeof p === "object" && probe(p, 0, new Set())) { n++; break; }
        }
      }
    } catch (e) {}
    return n;
  };

  // =====================================================================================================
  // v3: LAY DANH SACH CAC BO (合集) CUA TAI KHOAN + TUNG TAP THEO DUNG THU TU CUA DOUYIN.
  // Danh sach "作品" tren trang ca nhan khong ghi ten bo / so tap trong tieu de, nen khong the doan dung bo.
  // O day goi chinh API ma trang Douyin dung cho tab 合集 / trang bo, bang fetch CUA TRANG (da dang nhap, SDK cua trang tu ky ten).
  // Chi chay khi nguoi dung bam quet / bam nut; goi cham (0.5-1 giay / lan), tu dung khi gap loi.
  // =====================================================================================================
  var sleep = function (ms) { return new Promise(function (r) { setTimeout(r, ms); }); };
  function cookieOf(name) { try { var m = document.cookie.match(new RegExp("(?:^|;\\s*)" + name + "=([^;]*)")); return m ? decodeURIComponent(m[1]) : ""; } catch (e) { return ""; } }
  function baseParams() {
    var ua = navigator.userAgent || "", cv = (ua.match(/Chrome\/([\d.]+)/) || [])[1] || "124.0.0.0";
    var o = {
      device_platform: "webapp", aid: "6383", channel: "channel_pc_web", version_code: "170400", version_name: "17.4.0", cookie_enabled: "true",
      screen_width: String((screen && screen.width) || 1920), screen_height: String((screen && screen.height) || 1080),
      browser_language: navigator.language || "zh-CN", browser_platform: navigator.platform || "Win32", browser_name: "Chrome", browser_version: cv,
      browser_online: "true", engine_name: "Blink", engine_version: cv, os_name: "Windows", os_version: "10", cpu_core_num: String(navigator.hardwareConcurrency || 8),
      device_memory: String(navigator.deviceMemory || 8), platform: "PC", downlink: "10", effective_type: "4g", round_trip_time: "50"
    };
    var fp = cookieOf("s_v_web_id"); if (fp) { o.verifyFp = fp; o.fp = fp; }
    return o;
  }
  // Goi 1 API cua Douyin. Tra ve {ok, json, why}
  async function call(path, params, J) {
    var q = baseParams(); for (var k in params) q[k] = params[k];
    var qs = []; for (var k2 in q) qs.push(encodeURIComponent(k2) + "=" + encodeURIComponent(q[k2]));
    var url = location.origin + path + "?" + qs.join("&");
    J.calls++;
    var name = path.split("/").slice(-2, -1)[0];
    var viaFetch = async function () {
      var rr = await window.fetch(url, { credentials: "include", headers: { accept: "application/json, text/plain, */*" } });
      return { ok: rr.ok, status: rr.status, text: await rr.text() };
    };
    var viaXhr = function () {
      return new Promise(function (res, rej) {
        var x = new XMLHttpRequest(); x.open("GET", url, true); x.withCredentials = true; x.setRequestHeader("accept", "application/json, text/plain, */*");
        x.onload = function () { res({ ok: x.status >= 200 && x.status < 300, status: x.status, text: x.responseText || "" }); };
        x.onerror = function () { rej(new Error("XHR")); }; x.timeout = 30000; x.ontimeout = x.onerror; x.send();
      });
    };
    // SDK chong bot cua Douyin ky ten (a_bogus...) cho XHR cua trang; fetch co the KHONG duoc ky ("HTTP 403 ... Sign Invalid"). Uu tien XHR, that bai moi thu fetch.
    var order = J.tx === "fetch" ? ["fetch", "xhr"] : ["xhr", "fetch"], errs = [];
    for (var ti = 0; ti < order.length; ti++) {
      var tx = order[ti], got = null;
      try { got = await (tx === "xhr" ? viaXhr() : viaFetch()); } catch (e) { errs.push(tx + ": lỗi mạng"); continue; }
      var jj = null; try { jj = JSON.parse(got.text); } catch (e) {}
      if (got.ok && jj && (jj.status_code == null || jj.status_code === 0)) { J.tx = tx; return { ok: true, json: jj }; }
      errs.push(tx + ": " + (got.ok ? (jj ? "status_code " + jj.status_code : (got.text.length ? "dữ liệu lạ" : "rỗng (có thể bị chặn chống bot)")) : "HTTP " + got.status + " " + got.text.slice(0, 70)));
    }
    J.fail++;
    return { ok: false, why: name + ": " + errs.join(" | ") };
  }
  function addMixItem(id, a, ord) {
    if (!a || typeof a !== "object") return;
    rec(a);
    var s2 = store[String(pick(a.aweme_id, a.awemeId) || "")];
    if (!s2) return;
    var e = mixes[id], own = s2.mix && s2.mix.id === id ? s2.mix : null;
    s2.mix = { id: id, name: (e && e.name) || (own && own.name) || "", cur: own && own.cur != null ? own.cur : null, total: (e && e.total != null ? e.total : (own ? own.total : null)), ord: ord };
    window.__ytAwemeN++;
  }
  async function runMixes(o, J) {
    var m1 = location.pathname.match(/\/user\/([^/?#]+)/), sec = o.sec || (m1 ? m1[1] : "");
    var m2 = location.pathname.match(/\/collection\/(\d{6,})/), m3 = location.search.match(/[?&]mix_id=(\d{6,})/);
    var ids = [], seen = Object.create(null);
    var add = function (id) { if (id && !seen[id]) { seen[id] = 1; ids.push(id); } };
    if (m2) add(m2[1]); if (m3) add(m3[1]);
    // 1) danh sach bo cua tai khoan (tab 合集)
    if (sec && sec !== "self") {
      J.phase = "list";
      var cursor = 0, pages = 0, count = 20, gotList = false;
      while (pages < 25 && !J.stop) {
        var r = await call("/aweme/v1/web/mix/list/", { sec_user_id: sec, count: count, cursor: cursor }, J);
        if (!r.ok) { if (count > 12 && pages === 0) { count = 12; J.notes.push(r.why + " (thử lại với count=12)"); continue; } J.notes.push(r.why); break; }
        var j = r.json, items = j.mix_infos || j.mix_list || j.mixInfos || j.collection_list || [];
        gotList = true; pages++;
        for (var i = 0; i < items.length; i++) { noteMix(items[i]); add(String(pick(items[i].mix_id, items[i].mixId) || "")); }
        if (!j.has_more || !items.length) break;
        cursor = j.cursor != null ? j.cursor : cursor + items.length;
        await sleep(450 + Math.random() * 450);
      }
      J.listOk = gotList;
    }
    // 2) cac bo da thay trong danh sach video cua trang (mix_info)
    if (sec && sec !== "self") for (var aid in store) { var rr = store[aid]; if (rr.mix && rr.mix.id && rr.au === sec) add(rr.mix.id); }
    J.ids = ids.slice(); J.sec = sec;
    J.total = ids.length; J.mixes = ids.length;
    if (!ids.length && !J.notes.length) J.notes.push("không thấy bộ (合集) nào của tài khoản này");
    // 3) tung tap cua tung bo, theo dung thu tu cua bo
    J.phase = "eps";
    for (var n = 0; n < ids.length && !J.stop; n++) {
      var id = ids[n], e = mixes[id] || (mixes[id] = { id: id, name: "", total: null, got: 0, full: false });
      var cur = 0, k = 0, ord = 0, ok = true;
      while (k < 60 && !J.stop) {
        var r2 = await call("/aweme/v1/web/mix/aweme/", { mix_id: id, cursor: cur, count: 20 }, J);
        if (!r2.ok) { ok = false; if (J.notes.length < 6) J.notes.push(r2.why); break; }
        var list = r2.json.aweme_list || r2.json.awemeList || [];
        for (var a = 0; a < list.length; a++) { ord++; addMixItem(id, list[a], ord); }
        k++;
        if (!r2.json.has_more || !list.length) break;
        cur = r2.json.cursor != null ? r2.json.cursor : cur + list.length;
        await sleep(450 + Math.random() * 450);
      }
      e.got = ord; e.full = ok; J.eps += ord; J.done = n + 1;
      if (!ok && J.fail >= 6 && J.done <= J.fail) { J.notes.push("nhiều lỗi liên tiếp, dừng để tránh bị chặn"); break; }
      await sleep(350 + Math.random() * 350);
    }
    J.phase = "done";
  }
  window.__ytMixRun = function (o) {
    var J = window.__ytMixJob;
    if (J && J.running) return false;
    J = window.__ytMixJob = { running: true, phase: "list", done: 0, total: 0, mixes: 0, eps: 0, calls: 0, fail: 0, notes: [], listOk: false, stop: false, t0: Date.now(), href: location.href };
    runMixes(o || {}, J).catch(function (e) { J.notes.push("lỗi: " + (e && e.message || e)); }).then(function () { J.running = false; J.t1 = Date.now(); window.__ytAwemeN++; });
    return true;
  };
  window.__ytMixStop = function () { if (window.__ytMixJob) window.__ytMixJob.stop = true; return true; };
})();
