/* Tab «Bản đồ lịch sử»: bộ vẽ video bản đồ lên canvas 2D (1920×1080), phong cách riêng «Atlas sống» (bản đồ cổ sống dậy).
   Dùng chung cho khung xem thử trong app và cửa sổ ẩn dựng video; không phụ thuộc Electron.
   Nhận diện: nền giấy da có thớ, biển xanh mực với đường nước kẻ như bản khắc, lãnh thổ lan ra như MỰC LOANG rồi cắm cờ gợn sóng,
   viền vàng dập nổi, năm hiện bằng đồng hồ số cơ học, lời đọc hiện thành thẻ ghi chép sáng từng từ theo giọng, địa cầu nhỏ chỉ vùng đang xem. */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(require('./maphist-plan.js'), require('./maphist-geo.js'), require('./maphist-cartoon.js'), require('./maphist-scenes.js'));
  else root.maphistDraw = factory(root.maphistPlan, root.maphistGeo, root.maphistCartoon, root.maphistScenes);
})(typeof window !== 'undefined' ? window : globalThis, function (Plan, Geo, Cart, Scenes) {
  'use strict';
  const { W, H, CY } = Plan;
  const TAU = Math.PI * 2, DEG = Math.PI / 180;
  const clamp = Plan.clamp, lerp = Plan.lerp, easeInOut = Plan.easeInOut;
  const easeOut = t => 1 - Math.pow(1 - clamp(t, 0, 1), 3);
  const easeBack = t => { t = clamp(t, 0, 1); const c1 = 1.70158, c3 = c1 + 1; return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2); };
  const merY = lat => Math.log(Math.tan(Math.PI / 4 + clamp(lat, -82, 82) * Math.PI / 360));
  const SERIF = '"MapLora", "Lora", Georgia, "DejaVu Serif", serif';
  const INK = '#2a1c10', PAPER = '#f1e6c8', GOLD = '#e6c36a', GOLD_DEEP = '#a47a2c', NAVY = '#10324c';
  const GROW = Plan.TIMING.grow, GROW_DELAY = Plan.TIMING.growDelay;          // thời gian mực loang ra và độ trễ sau khi sang giai đoạn mới
  const FINE_SPAN = 48;                       // zoom gần hơn mức này thì dùng ranh giới tỉnh (độ phân giải cao) thay cho ranh giới nước

  // Màu cờ → màu pigment tô lãnh thổ: chọn màu có sắc (không trắng / đen), pha chút nâu đất cho hợp tông giấy cổ.
  const hexRgb = h => { const m = /^#([0-9a-f]{6})$/i.exec(h || ''); const n = m ? parseInt(m[1], 16) : 0xb5412f; return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; };
  const rgbHex = a => '#' + a.map(v => clamp(Math.round(v), 0, 255).toString(16).padStart(2, '0')).join('');
  function pigment(realm) {
    const list = (realm.colors && realm.colors.length ? realm.colors : [realm.color]).map(hexRgb);
    let best = list[0], score = -1;
    for (const c of list) {
      const mx = Math.max(...c), mn = Math.min(...c), sat = mx ? (mx - mn) / mx : 0, lum = (.3 * c[0] + .59 * c[1] + .11 * c[2]) / 255;
      const s = sat * .8 + (1 - Math.abs(lum - .42)) * .5;
      if (s > score) { score = s; best = c; }
    }
    const earth = [138, 98, 58];
    let out = best.map((v, i) => lerp(v, earth[i], .2));
    const lum = (.3 * out[0] + .59 * out[1] + .11 * out[2]) / 255;
    if (lum > .62) out = out.map(v => v * .72);
    if (lum < .16) out = out.map(v => v * .5 + 40);
    return rgbHex(out);
  }
  const shade = (hex, k) => rgbHex(hexRgb(hex).map(v => k < 0 ? v * (1 + k) : v + (255 - v) * k));

  // Chia tiêu đề thành 1–3 dòng cân đối (ưu tiên ngắt sau : – — ,) rồi chọn cỡ chữ lớn nhất cho vừa maxW; dòng ít hơn được ưu tiên nếu chữ còn đủ to.
  function titleLayout(c, title, maxW) {
    const words = String(title || '').trim().split(/\s+/).filter(Boolean), W100 = s => { c.font = `700 100px ${SERIF}`; return c.measureText(s).width; };
    if (!words.length) return { lines: [''], size: 128 };
    const cuts = n => { const out = []; const go = (from, left, acc) => { if (left === 1) { out.push([...acc, words.slice(from).join(' ')]); return; } for (let i = from + 1; i <= words.length - left + 1; i++) go(i, left - 1, [...acc, words.slice(from, i).join(' ')]); }; go(0, n, []); return out; };
    let best = null;
    for (let n = 1; n <= Math.min(3, words.length); n++) {
      let pick = null;
      for (const lines of cuts(n)) {
        const widest = Math.max(...lines.map(W100)), nice = lines.slice(0, -1).every(l => /[:–—,]$/.test(l));
        const cost = widest * (n > 1 && nice ? .9 : 1);
        if (!pick || cost < pick.cost) pick = { lines, cost, widest };
      }
      const size = Math.min(128, Math.floor(maxW * 100 / pick.widest));
      if (!best || (best.size < 92 && size > best.size)) best = { lines: pick.lines, size };
      if (best.size >= 92) break;
    }
    return { lines: best.lines, size: Math.max(40, best.size) };
  }
  function create({ canvas, geo, makeCanvas, W: width = W, H: height = H }) {
    const ctx = canvas.getContext('2d');
    const mkSize = (w, h) => makeCanvas ? makeCanvas(w, h) : (typeof OffscreenCanvas !== 'undefined' ? new OffscreenCanvas(w, h) : Object.assign(document.createElement('canvas'), { width: w, height: h }));
    const sceneCv = mkSize(width, height), sc = sceneCv.getContext('2d'), landCv = mkSize(width, height), lowCv = mkSize(width >> 1, height >> 1), lowc = lowCv.getContext('2d');
    const oceanCv = mkSize(width, height), oc = oceanCv.getContext('2d');
    let tl = null, curT = 0, minD = 1, oceanReady = false;
    const cache = { key: '', paths: new Map(), landAll: null, landKey: '', moving: null };
    const stats = { frames: 0, ms: 0 };
    const toon = () => Boolean(tl && tl.theme === 'cartoon');   // kiểu «hoạt hình sáng» (maphist-cartoon.js); các kiểu khác dùng «Atlas sống»
    let profile = null, lapAt = 0;   // profile: đối tượng để ghi thời gian từng công đoạn (chỉ dùng khi đo tốc độ)
    const lap = (name, c) => { if (!profile) return; c.getImageData(0, 0, 1, 1); const n = performance.now(); profile[name] = (profile[name] || 0) + n - lapAt; lapAt = n; };

    // ---------- Thớ giấy + nét gạch chéo (tạo một lần) ----------
    const grain = (() => {
      const c = mkSize(256, 256), g = c.getContext('2d'), img = g.createImageData(256, 256);
      let seed = 12345; const rnd = () => (seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296;
      for (let i = 0; i < img.data.length; i += 4) { const v = 118 + rnd() * 120; img.data[i] = img.data[i + 1] = img.data[i + 2] = v; img.data[i + 3] = 255; }
      g.putImageData(img, 0, 0);
      return ctx.createPattern(c, 'repeat');
    })();
    const hatch = (() => {
      const c = mkSize(10, 10), g = c.getContext('2d');
      g.strokeStyle = 'rgba(30,14,4,.2)'; g.lineWidth = 1.6; g.beginPath(); g.moveTo(-2, 12); g.lineTo(12, -2); g.moveTo(-2, 2); g.lineTo(2, -2); g.moveTo(8, 12); g.lineTo(12, 8); g.stroke();
      return ctx.createPattern(c, 'repeat');
    })();

    // ---------- Phép chiếu ----------
    function projector(cam) {
      const S = width / (cam.span * DEG), mx = cam.lon * DEG, my = merY(cam.lat);
      return { S, mx, my, cam, P: (lo, la) => [width / 2 + (lo * DEG - mx) * S, CY - (merY(la) - my) * S] };
    }
    function ensureMerc(r) {
      if (r.mx) return;
      const n = r.pts.length / 2;
      r.mx = new Float32Array(n); r.my = new Float32Array(n);
      for (let i = 0; i < n; i++) { r.mx[i] = r.pts[2 * i] / 100 * DEG; r.my[i] = merY(r.pts[2 * i + 1] / 100); }
    }
    const visible = (bb, pr, pad = 90) => {
      const x0 = width / 2 + (bb[0] * DEG - pr.mx) * pr.S, x1 = width / 2 + (bb[2] * DEG - pr.mx) * pr.S;
      const y0 = CY - (merY(bb[3]) - pr.my) * pr.S, y1 = CY - (merY(bb[1]) - pr.my) * pr.S;
      return x1 > -pad && x0 < width + pad && y1 > -pad && y0 < height + pad;
    };
    // Đường bờ được làm mượt: nối các điểm bằng cung bậc hai qua trung điểm nên không còn góc cạnh răng cưa.
    function addRing(path, r, pr) {
      if (!visible(r.bb, pr)) return;
      ensureMerc(r);
      const { mx, my } = r, n = mx.length, S = pr.S, ox = width / 2 - pr.mx * S, oy = CY + pr.my * S;
      let px = 1e9, py = 1e9, drawn = 0, lx = 0, ly = 0;
      for (let i = 0; i < n; i++) {
        const x = ox + mx[i] * S, y = oy - my[i] * S;
        if (i && i < n - 1 && Math.abs(x - px) + Math.abs(y - py) < minD) continue;
        if (drawn) path.quadraticCurveTo(lx, ly, (x + lx) / 2, (y + ly) / 2); else path.moveTo(x, y);
        lx = x; ly = y; px = x; py = y; drawn++;
      }
      if (drawn > 2) { path.lineTo(lx, ly); path.closePath(); }
    }
    // Hình của một đơn vị ở zoom hiện tại: nước dùng các tỉnh khi zoom gần (nét hơn), vùng tròn dựng từ tâm + bán kính.
    function ringsOf(unit, span) {
      if (unit.kind === 'country' && span <= FINE_SPAN && geo.provinceIndex.has(unit.a3)) {
        if (!unit._fine) unit._fine = geo.provinceIndex.get(unit.a3).flatMap(p => p.rings);
        return unit._fine;
      }
      return unit.rings;
    }
    const blobBox = blob => { const dLat = blob.km / 111, dLon = blob.km / (111 * Math.max(.2, Math.cos(blob.lat * DEG))); return [blob.lon - dLon, blob.lat - dLat, blob.lon + dLon, blob.lat + dLat]; };
    function unitPath(key, pr) {
      const hit = cache.paths.get(key);
      if (hit) return hit;
      const path = new Path2D(), blob = Geo.parseBlob(key);
      if (blob) {
        const dLat = blob.km / 111, dLon = blob.km / (111 * Math.max(.2, Math.cos(blob.lat * DEG)));
        for (let i = 0; i < 64; i++) { const a = i / 64 * TAU, wob = 1 + .06 * Math.sin(a * 5 + blob.lon) + .04 * Math.sin(a * 9 + blob.lat), [x, y] = pr.P(blob.lon + Math.cos(a) * dLon * wob, blob.lat + Math.sin(a) * dLat * wob); i ? path.lineTo(x, y) : path.moveTo(x, y); }
        path.closePath();
      } else {
        const unit = geo.units.get(key);
        if (unit) for (const r of ringsOf(unit, pr.cam.span)) addRing(path, r, pr);
      }
      cache.paths.set(key, path);
      return path;
    }
    const coreBB = unit => unit._core || (unit._core = Geo.coreBox(unit));   // hộp bao phần chính (bỏ đảo xa nhỏ), nhớ lại cho lần sau
    function boxOf(keys, pr, core = false) {
      let a = 1e9, b = 1e9, c = -1e9, d = -1e9;
      for (const key of keys) {
        const blob = Geo.parseBlob(key), unit = blob ? null : geo.units.get(key);
        const box = blob ? blobBox(blob) : unit ? (core ? coreBB(unit) : unit.bb) : null;
        if (!box) continue;
        const [x0, y0] = pr.P(box[0], box[3]), [x1, y1] = pr.P(box[2], box[1]);
        a = Math.min(a, x0, x1); c = Math.max(c, x0, x1); b = Math.min(b, y0, y1); d = Math.max(d, y0, y1);
      }
      return a > c ? null : { x: a, y: b, w: c - a, h: d - b, cx: (a + c) / 2, cy: (b + d) / 2 };
    }
    // Trọng tâm vòng lớn nhất của đơn vị (để cắm cờ).
    function centroidOf(key) {
      const blob = Geo.parseBlob(key);
      if (blob) return [blob.lon, blob.lat];
      const unit = geo.units.get(key);
      if (!unit) return null;
      if (unit._cent) return unit._cent;
      let best = unit.rings[0];
      for (const r of unit.rings) if (r.area > best.area) best = r;
      let a = 0, cx = 0, cy = 0; const p = best.pts, n = p.length / 2;
      for (let i = 0; i < n; i++) { const j = (i + 1) % n, x1 = p[2 * i], y1 = p[2 * i + 1], x2 = p[2 * j], y2 = p[2 * j + 1], f = x1 * y2 - x2 * y1; a += f; cx += (x1 + x2) * f; cy += (y1 + y2) * f; }
      unit._cent = Math.abs(a) < 1 ? [(best.bb[0] + best.bb[2]) / 2, (best.bb[1] + best.bb[3]) / 2] : [cx / (3 * a) / 100, cy / (3 * a) / 100];
      return unit._cent;
    }
    function bigUnit(keys) {
      let best = null, size = -1;
      for (const key of keys) {
        const blob = Geo.parseBlob(key);
        const s = blob ? blob.km * blob.km / 12321 : (geo.units.get(key)?.area || 0);
        if (s > size) { size = s; best = key; }
      }
      return best;
    }

    // ---------- Biển: xanh mực, đường sóng kẻ mảnh, ánh sao lấp lánh ----------
    function ocean(c, t) {
      if (!oceanReady) {
        const g = oc.createLinearGradient(0, 0, 0, height); g.addColorStop(0, '#0d2f49'); g.addColorStop(.5, '#14506c'); g.addColorStop(1, '#0e3b55');
        oc.fillStyle = g; oc.fillRect(0, 0, width, height);
        const r = oc.createRadialGradient(width / 2, height * .5, 60, width / 2, height * .5, width * .65); r.addColorStop(0, 'rgba(120,200,205,.2)'); r.addColorStop(1, 'rgba(0,20,40,0)');
        oc.fillStyle = r; oc.fillRect(0, 0, width, height);
        oc.save(); oc.globalAlpha = .025; oc.fillStyle = grain; oc.fillRect(0, 0, width, height); oc.restore();
        oceanReady = true;
      }
      c.drawImage(oceanCv, 0, 0);
      c.save(); c.strokeStyle = 'rgba(175,220,225,.075)'; c.lineWidth = 1.6;
      const drift = t * 10;
      for (let y = 90, k = 0; y < height; y += 46, k++) {
        c.beginPath();
        for (let x = -20; x <= width + 20; x += 28) { const yy = y + Math.sin((x + drift * (k % 2 ? 1 : -1)) / 90 + k * 1.7) * 5; x === -20 ? c.moveTo(x, yy) : c.lineTo(x, yy); }
        c.stroke();
      }
      c.restore();
    }
    function sparkles(c, t) {
      c.save(); c.fillStyle = '#fff';
      for (let i = 0; i < 40; i++) {
        const a = Math.pow(Math.max(0, Math.sin(t * 1.5 + i * 1.37)), 12);
        if (a < .05) continue;
        const x = (i * 997 + 131) % width, y = (i * 613 + 71) % height, r = 4 + (i % 4) * 2;
        c.globalAlpha = a * .6; c.beginPath(); c.moveTo(x, y - r * 1.8); c.lineTo(x + r * .3, y - r * .3); c.lineTo(x + r * 1.8, y); c.lineTo(x + r * .3, y + r * .3); c.lineTo(x, y + r * 1.8); c.lineTo(x - r * .3, y + r * .3); c.lineTo(x - r * 1.8, y); c.lineTo(x - r * .3, y - r * .3); c.closePath(); c.fill();
      }
      c.restore();
    }
    // Bóng mây trôi chậm trên bản đồ.
    function clouds(c, t) {
      c.save();
      for (let i = 0; i < 6; i++) {
        const x = ((i * 463 + t * (11 + i * 3)) % (width + 900)) - 450, y = 160 + (i * 211) % 760, rx = 260 + (i % 3) * 90, ry = 110 + (i % 2) * 40;
        c.save(); c.translate(x, y); c.scale(rx / ry, 1);
        const g = c.createRadialGradient(0, 0, 0, 0, 0, ry); g.addColorStop(0, 'rgba(10,20,40,.12)'); g.addColorStop(1, 'rgba(10,20,40,0)');
        c.fillStyle = g; c.beginPath(); c.arc(0, 0, ry, 0, TAU); c.fill(); c.restore();
      }
      c.restore();
    }

    // ---------- Đất liền: giấy da, bờ biển nâu mực, hai vòng nước kẻ như bản khắc (lớp được lưu lại khi camera đứng yên) ----------
    function landLayer(pr, low) {
      const key = cache.key + (low ? 'L' : '');
      const target = low ? lowCv : landCv, lc = low ? lowc : landCv.getContext('2d');
      if (cache.landKey === key) return target;
      const all = new Path2D();
      for (const u of geo.countries) {
        if (u.a3 === 'ATA' || !visible(u.bb, pr)) continue;
        all.addPath(unitPath(u.key, pr));
      }
      cache.landAll = all; cache.landKey = key;
      lc.setTransform(1, 0, 0, 1, 0, 0); lc.clearRect(0, 0, width, height);
      if (toon()) { toonLand(lc, all, low); return target; }
      lc.save(); if (low) lc.scale(.5, .5); lc.lineJoin = 'round';
      // đường nước kẻ: vòng mảnh cách bờ 11 px và 24 px (tô dải rộng rồi khoét lõi bằng destination-out)
      for (const [d, a] of [[24, .3], [11, .5]]) {
        lc.strokeStyle = `rgba(190,228,230,${a})`; lc.lineWidth = d * 2 + 1.4; lc.stroke(all);
        lc.globalCompositeOperation = 'destination-out'; lc.lineWidth = d * 2 - 1.4; lc.stroke(all); lc.globalCompositeOperation = 'source-over';
      }
      lc.strokeStyle = 'rgba(160,215,220,.13)'; lc.lineWidth = 34; lc.stroke(all);
      // đất nổi lên khỏi mặt biển: bóng đổ xuống nước + thành đất dày như giấy bồi nhiều lớp
      if (!low) { lc.save(); lc.translate(3, 13); lc.fillStyle = 'rgba(2,12,26,.55)'; lc.shadowColor = 'rgba(0,8,22,.55)'; lc.shadowBlur = 16; lc.fill(all); lc.restore(); }
      lc.save(); lc.translate(0, low ? 6 : 8); lc.fillStyle = '#6b5636'; lc.strokeStyle = '#3d2c17'; lc.lineWidth = 4.5; lc.fill(all); lc.stroke(all); lc.restore();
      if (!low) { lc.save(); lc.translate(0, 4); lc.fillStyle = '#8a7550'; lc.fill(all); lc.restore(); }
      lc.strokeStyle = 'rgba(84,60,34,.9)'; lc.lineWidth = 3.4; lc.stroke(all);
      const g = lc.createLinearGradient(0, 0, 0, height); g.addColorStop(0, '#f1e8cc'); g.addColorStop(1, '#ddcca2');
      lc.fillStyle = g; lc.fill(all);
      if (!low) {
        // ranh giới nước mảnh, mờ; bóng nhẹ dọc bờ (tối dần vào trong) và ánh sáng mềm từ góc trên-trái
        lc.strokeStyle = 'rgba(110,80,46,.3)'; lc.lineWidth = 1.3; lc.stroke(all);
        lc.save(); lc.clip(all);
        for (const [w, a2] of [[30, .05], [18, .06], [9, .07]]) { lc.strokeStyle = `rgba(104,76,42,${a2})`; lc.lineWidth = w; lc.stroke(all); }
        for (const [w, a2, d] of [[20, .12, 6], [9, .2, 3.5]]) { lc.save(); lc.translate(d, d * 1.1); lc.strokeStyle = `rgba(255,252,238,${a2})`; lc.lineWidth = w; lc.stroke(all); lc.restore(); }
        lc.restore();
      }
      lc.restore();
      return target;
    }

    // Đất hoạt hình: xanh lá phẳng, viền xanh đậm mảnh, quầng bọt sáng quanh bờ, bóng nhẹ dưới đất.
    function toonLand(lc, all, low) {
      lc.save(); if (low) lc.scale(.5, .5); lc.lineJoin = 'round';
      for (const [w, a] of [[48, .13], [32, .2], [18, .34]]) { lc.strokeStyle = `rgba(220,246,255,${a})`; lc.lineWidth = w; lc.stroke(all); }
      lc.save(); lc.translate(0, 7); lc.fillStyle = 'rgba(0,70,130,.22)'; lc.fill(all); lc.restore();
      const g = lc.createLinearGradient(0, 0, 0, height); g.addColorStop(0, '#66cb7e'); g.addColorStop(1, '#44a866');
      lc.fillStyle = g; lc.fill(all);
      if (!low) { lc.save(); lc.clip(all); lc.strokeStyle = 'rgba(255,255,255,.16)'; lc.lineWidth = 18; lc.stroke(all); lc.strokeStyle = 'rgba(20,90,50,.14)'; lc.lineWidth = 7; lc.stroke(all); lc.restore(); }
      lc.strokeStyle = '#2b8b55'; lc.lineWidth = 3.2; lc.stroke(all);
      lc.restore();
    }

    // ---------- Lãnh thổ: pigment + gạch chéo + viền vàng dập nổi; mực loang khi mọc ----------
    // Mép mực loang: đường tròn méo bằng vài sóng sin, bán kính r.
    function inkEdge(c, cx, cy, r, seed) {
      c.beginPath();
      const n = 56;
      for (let i = 0; i <= n; i++) {
        const a = i / n * TAU, k = 1 + .13 * Math.sin(a * 3 + seed) + .08 * Math.sin(a * 7 + seed * 2.1) + .045 * Math.sin(a * 13 + seed * .7), rr = Math.max(.1, r * k);
        const x = cx + Math.cos(a) * rr, y = cy + Math.sin(a) * rr;
        i ? c.lineTo(x, y) : c.moveTo(x, y);
      }
      c.closePath();
    }
    function drawGroup(c, keys, realm, pr, { alpha = 1, reveal = null, shadow = true, rise = 1, pop = null } = {}) {
      if (!keys.length || alpha <= 0) return;
      const hot = !!(pop && realm && realm.name === pop.name); realm = popRealm(realm, pop);
      const fill = pigment(realm);
      c.save();
      c.globalAlpha = alpha; c.lineJoin = 'round';
      if (reveal) { inkEdge(c, reveal.cx, reveal.cy, reveal.r, reveal.seed); c.clip(); }
      for (const cluster of clustersOf(keys, pr)) {
        const plain = cluster.keys.filter(k => !k.startsWith('B:')), blobs = cluster.keys.filter(k => k.startsWith('B:')), b = cluster.box;
        const draw = (list, landClip) => {
          if (!list.length) return;
          const all = new Path2D();
          for (const k of list) all.addPath(unitPath(k, pr));
          c.save();
          if (landClip && cache.landAll) c.clip(cache.landAll);
          if (hot && !landClip) popHalo(c, all, pop);
          // khối nổi: bóng đổ xuống biển, rồi thành khối dày dưới lãnh thổ (các lớp dịch xuống), viền mực ở chân khối
          const D = 17 * clamp(rise, 0, 1);
          if (shadow && !landClip && D > .6) {
            c.save(); c.translate(3, D + 8); c.fillStyle = 'rgba(2,10,24,.62)'; c.shadowColor = 'rgba(0,8,22,.55)'; c.shadowBlur = cache.moving ? 0 : 22; c.fill(all); c.restore();
            c.save(); c.translate(0, D); c.strokeStyle = INK; c.lineWidth = 9; c.stroke(all); c.restore();
            const steps = cache.moving ? 3 : 9;
            for (let i = steps; i >= 1; i--) { c.save(); c.translate(0, D * i / steps); c.fillStyle = shade(fill, -.62 + .2 * (1 - i / steps)); c.fill(all); c.restore(); }
          }
          c.strokeStyle = INK; c.lineWidth = 7; c.stroke(all);
          c.save(); c.clip(all);
          const g = c.createLinearGradient(0, b.y, 0, b.y + b.h); g.addColorStop(0, shade(fill, .24)); g.addColorStop(1, shade(fill, -.12));
          c.fillStyle = g; c.fillRect(b.x - 8, b.y - 8, b.w + 16, b.h + 16);
          // dải sáng lướt qua (ánh kim)
          const span = b.w + b.h + 480, pos = ((curT * 120 + b.x) % span) - 240;
          const wv = c.createLinearGradient(b.x + pos - 130, b.y, b.x + pos + 130, b.y + b.h * .7);
          wv.addColorStop(0, 'rgba(255,240,200,0)'); wv.addColorStop(.5, 'rgba(255,240,200,.2)'); wv.addColorStop(1, 'rgba(255,240,200,0)');
          c.fillStyle = wv; c.fillRect(b.x - 8, b.y - 8, b.w + 16, b.h + 16);
          // viền vàng mảnh + bóng mềm dọc mép (tối dần vào trong) + ánh sáng mềm từ góc trên-trái: mặt khối mịn như đất sét
          c.strokeStyle = 'rgba(230,195,106,.9)'; c.lineWidth = 4.5; c.stroke(all);
          for (const [w, a2] of [[34, .05], [20, .07], [10, .09]]) { c.strokeStyle = `rgba(40,14,4,${a2})`; c.lineWidth = w; c.stroke(all); }
          for (const [w, a2, d] of [[22, .13, 7], [10, .22, 4]]) { c.save(); c.translate(d, d * 1.1); c.strokeStyle = `rgba(255,246,220,${a2})`; c.lineWidth = w; c.stroke(all); c.restore(); }
          // mép mực đang loang: vệt tối sẫm chạy theo mép
          if (reveal && reveal.p < 1) { c.save(); c.strokeStyle = `rgba(30,14,6,${.6 * (1 - reveal.p)})`; c.lineWidth = 22; inkEdge(c, reveal.cx, reveal.cy, Math.max(.1, reveal.r - 6), reveal.seed); c.stroke(); c.restore(); }
          c.restore();
          c.restore();
        };
        draw(plain, false);
        draw(blobs, true);
      }
      c.restore();
    }
    // Lãnh thổ hoạt hình: tô đúng lá cờ, viền đen dày, bóng đổ xuống biển, ánh bóng nhẹ; mọc ra như vòng tròn nảy.
    // Ảnh bìa «nổi bản đồ»: thế lực chính đổi sang màu RỰC đặc (không theo màu kịch bản, tránh màu vàng xỉn), có quầng sáng trắng + quầng màu quanh lãnh thổ.
    const popRealm = (realm, pop) => pop && !pop.keep && realm && realm.name === pop.name ? { ...realm, colors: [pop.color], color: pop.color, flag: 'solid' } : realm;
    function popHalo(c, all, pop) {
      c.save(); c.lineJoin = 'round';
      c.shadowColor = pop.glow; c.shadowBlur = 90; c.strokeStyle = pop.glow; c.lineWidth = 46; c.stroke(all); c.stroke(all);
      c.shadowBlur = 26; c.strokeStyle = '#ffffff'; c.lineWidth = 24; c.stroke(all);
      c.restore();
    }
    function toonGroup(c, keys, realm, pr, { alpha = 1, reveal = null, pop = null } = {}) {
      if (!keys.length || alpha <= 0) return;
      const hot = !!(pop && realm && realm.name === pop.name); realm = popRealm(realm, pop);
      c.save(); c.globalAlpha = alpha; c.lineJoin = 'round';
      if (reveal) { inkEdge(c, reveal.cx, reveal.cy, reveal.r, reveal.seed); c.clip(); }
      for (const cluster of clustersOf(keys, pr)) {
        const plain = cluster.keys.filter(k => !k.startsWith('B:')), blobs = cluster.keys.filter(k => k.startsWith('B:')), b = cluster.box;
        const draw = (list, landClip) => {
          if (!list.length) return;
          const all = new Path2D();
          for (const k of list) all.addPath(unitPath(k, pr));
          c.save();
          if (landClip && cache.landAll) c.clip(cache.landAll);
          if (hot && !landClip) popHalo(c, all, pop);
          if (!landClip) { c.save(); c.translate(2, 9); c.fillStyle = 'rgba(0,45,100,.32)'; c.fill(all); c.restore(); }
          c.strokeStyle = INK; c.lineWidth = hot ? 16 : 10; c.stroke(all);
          c.save(); c.clip(all);
          fillFlag(c, realm, { x: b.x - 6, y: b.y - 6, w: b.w + 12, h: b.h + 12, cx: b.cx, cy: b.cy });
          const gl = c.createLinearGradient(b.x, b.y, b.x + b.w * .4, b.y + b.h); gl.addColorStop(0, 'rgba(255,255,255,.22)'); gl.addColorStop(.5, 'rgba(255,255,255,0)'); gl.addColorStop(1, 'rgba(0,0,40,.12)');
          c.fillStyle = gl; c.fillRect(b.x - 8, b.y - 8, b.w + 16, b.h + 16);
          if (!cache.moving) { c.strokeStyle = 'rgba(0,0,30,.13)'; c.lineWidth = 14; c.stroke(all); c.save(); c.translate(2, 3); c.strokeStyle = 'rgba(255,255,255,.2)'; c.lineWidth = 6; c.stroke(all); c.restore(); }
          c.restore();
          c.strokeStyle = INK; c.lineWidth = hot ? 8 : 5; c.stroke(all);
          c.restore();
        };
        draw(plain, false);
        draw(blobs, true);
      }
      c.restore();
    }
    // Gom các đơn vị có hộp bao trên màn hình chạm nhau (nới thêm một chút) thành từng cụm.
    function clustersOf(keys, pr) {
      const items = keys.map(k => ({ key: k, box: boxOf([k], pr) })).filter(x => x.box);
      const group = items.map((_, i) => i), find = i => { while (group[i] !== i) { group[i] = group[group[i]]; i = group[i]; } return i; };
      const gap = 40;
      for (let i = 0; i < items.length; i++) for (let j = i + 1; j < items.length; j++) {
        const a = items[i].box, b = items[j].box;
        if (a.x - gap < b.x + b.w && b.x - gap < a.x + a.w && a.y - gap < b.y + b.h && b.y - gap < a.y + a.h) group[find(i)] = find(j);
      }
      const out = new Map();
      items.forEach((it, i) => { const g = find(i); if (!out.has(g)) out.set(g, []); out.get(g).push(it); });
      return [...out.values()].map(list => ({ keys: list.map(x => x.key), box: boxOf(list.map(x => x.key), pr) }));
    }
    // Chia các đơn vị của giai đoạn hiện tại thành: giữ nguyên / mới thêm (mực loang) / mất đi (mờ dần).
    function partsFor(st) {
      const out = { removed: [], stable: [], added: [] };
      const { era, prev } = st;
      if (!era) return out;
      const owner = new Map();
      if (prev) for (const r of prev.realms) for (const k of r.units) owner.set(k, r);
      const now = new Set();
      for (const r of era.realms) {
        const keep = [], add = [];
        for (const k of r.units) { now.add(k); (owner.get(k)?.name === r.name ? keep : add).push(k); }
        if (keep.length) out.stable.push({ realm: r, keys: keep });
        if (add.length) out.added.push({ realm: r, keys: add });
      }
      if (prev) {
        const gone = new Map();
        for (const [k, r] of owner) if (!now.has(k) || !era.realms.some(x => x.name === r.name && x.units.includes(k))) { if (!gone.has(r)) gone.set(r, []); gone.get(r).push(k); }
        for (const [realm, keys] of gone) out.removed.push({ realm, keys });
      }
      return out;
    }

    // ---------- Chữ ----------
    function text(c, str, x, y, { size = 24, weight = 700, style = '', fill = INK, align = 'center', halo = '', haloW = 5, alpha = 1, spacing = 0 } = {}) {
      c.save(); c.globalAlpha *= alpha; c.font = `${style} ${weight} ${size}px ${SERIF}`.trim(); c.textAlign = align; c.lineJoin = 'round';
      if ('letterSpacing' in c) c.letterSpacing = spacing + 'px';
      if (halo) { c.lineWidth = haloW; c.strokeStyle = halo; c.strokeText(str, x, y); }
      c.fillStyle = fill; c.fillText(str, x, y); c.restore();
    }
    // Nhãn địa danh: thẻ giấy nhỏ viền mực.
    function tag(c, label, x, y, s = 1, size = 20) {
      if (!label) return;
      c.save(); c.translate(x, y); c.scale(s, s); c.font = `700 ${size}px ${SERIF}`;
      const w = c.measureText(label.toUpperCase()).width + 26, h = size + 14;
      c.shadowColor = 'rgba(0,0,0,.35)'; c.shadowBlur = 8; c.shadowOffsetY = 3; c.fillStyle = PAPER; c.beginPath(); c.roundRect(-w / 2, -h / 2, w, h, 4); c.fill();
      c.shadowColor = 'transparent'; c.strokeStyle = INK; c.lineWidth = 2; c.stroke();
      c.strokeStyle = 'rgba(164,122,44,.8)'; c.lineWidth = 1; c.beginPath(); c.roundRect(-w / 2 + 3, -h / 2 + 3, w - 6, h - 6, 2); c.stroke();
      c.fillStyle = INK; c.textAlign = 'center'; c.textBaseline = 'middle'; if ('letterSpacing' in c) c.letterSpacing = '1px'; c.fillText(label.toUpperCase(), 0, 1);
      c.restore();
    }

    // ---------- Cờ cắm trên lãnh thổ ----------
    function fillFlag(c, realm, b) {
      const cols = realm.colors && realm.colors.length ? realm.colors : [realm.color];
      const x = b.x - 2, y = b.y - 2, w = b.w + 4, h = b.h + 4;
      if (realm.flag === 'h' && cols.length > 1) cols.forEach((col, i) => { c.fillStyle = col; c.fillRect(x, y + h * i / cols.length, w, h / cols.length + 1); });
      else if (realm.flag === 'v' && cols.length > 1) cols.forEach((col, i) => { c.fillStyle = col; c.fillRect(x + w * i / cols.length, y, w / cols.length + 1, h); });
      else if (realm.flag === 'disc' && cols.length > 1) { c.fillStyle = cols[0]; c.fillRect(x, y, w, h); c.fillStyle = cols[1]; c.beginPath(); c.arc(b.cx, b.cy, Math.max(10, Math.min(b.w, b.h) * .26), 0, TAU); c.fill(); }
      else if (realm.flag === 'cross' && cols.length > 1) { c.fillStyle = cols[0]; c.fillRect(x, y, w, h); c.fillStyle = cols[1]; const t = Math.max(6, Math.min(b.w, b.h) * .14); c.fillRect(x, b.cy - t / 2, w, t); c.fillRect(b.cx - t * .9, y, t, h); }
      else { c.fillStyle = cols[0] || realm.color; c.fillRect(x, y, w, h); }
    }
    // Mặt trên lá cờ: mắt chớp, đảo nhìn quanh, lông mày + miệng đổi theo tâm trạng (happy, proud, tired, angry, sad, calm).
    const seedOf = str => { let h = 7; for (const ch of String(str || '')) h = (h * 31 + ch.charCodeAt(0)) % 997; return h / 997 * 6.28; };
    function drawFace(c, b, mood, t, seed) {
      if (mood === 'shock') mood = 'sad';   // khung cờ kiểu Atlas cổ chưa có nét choáng
      const e1 = b.x + b.w * .33, e2 = b.x + b.w * .67, ey = b.y + b.h * .43, rx = b.w * .078, ry = b.h * .155;
      const ph = (t + seed * 1.3) % 3.7, blink = ph < .16 ? Math.sin(ph / .16 * Math.PI) : 0;
      const lid = mood === 'tired' ? .5 : mood === 'calm' ? .22 : mood === 'angry' ? .18 : 0, closed = Math.max(blink, lid);
      const lx = Math.sin(t * .85 + seed) * rx * .38, ly = (mood === 'sad' ? .3 : mood === 'tired' ? .22 : Math.cos(t * .55 + seed) * .12) * ry;
      c.save(); c.lineCap = 'round'; c.lineJoin = 'round';
      for (const ex of [e1, e2]) {
        const h = Math.max(1.5, ry * (1 - closed * .9));
        c.save(); c.beginPath(); c.ellipse(ex, ey, rx, h, 0, 0, TAU); c.fillStyle = '#fffdf2'; c.fill(); c.clip();
        c.fillStyle = INK; c.beginPath(); c.arc(ex + lx, ey + ly, rx * .56, 0, TAU); c.fill();
        c.fillStyle = '#fff'; c.beginPath(); c.arc(ex + lx - rx * .18, ey + ly - rx * .2, rx * .17, 0, TAU); c.fill();
        c.restore();
        c.strokeStyle = INK; c.lineWidth = Math.max(2, b.w * .016); c.beginPath(); c.ellipse(ex, ey, rx, h, 0, 0, TAU); c.stroke();
      }
      // lông mày: [độ cao so với mắt, độ nghiêng đầu trong (+ = đầu trong thấp xuống)]
      const brow = { happy: [-.5, -.1], proud: [-.7, -.2], tired: [-.15, .28], angry: [-.2, .9], sad: [-.4, -.75], calm: [-.35, 0] }[mood] || [-.4, 0];
      c.strokeStyle = INK; c.lineWidth = Math.max(2.4, b.w * .022);
      const by = ey - ry + ry * brow[0] * 1.1 - 3;
      for (const [ex, dir] of [[e1, 1], [e2, -1]]) {
        const inner = by + brow[1] * ry * .6, outer = by - brow[1] * ry * .25;
        c.beginPath(); c.moveTo(ex - dir * rx * 1.15, outer); c.quadraticCurveTo(ex, by - (mood === 'happy' || mood === 'proud' ? ry * .25 : 0), ex + dir * rx * 1.15, inner); c.stroke();
      }
      // miệng
      const mx = b.x + b.w * .5, my = b.y + b.h * .76, mw = b.w * (mood === 'happy' ? .12 : .09);
      c.lineWidth = Math.max(2.4, b.w * .02);
      if (mood === 'happy') { c.beginPath(); c.moveTo(mx - mw, my - 2); c.quadraticCurveTo(mx, my + b.h * .3, mx + mw, my - 2); c.closePath(); c.fillStyle = '#5a1810'; c.fill(); c.stroke(); }
      else if (mood === 'angry' || mood === 'sad') { c.beginPath(); c.moveTo(mx - mw, my + 3); c.quadraticCurveTo(mx, my - b.h * .12, mx + mw, my + 3); c.stroke(); }
      else if (mood === 'tired') { c.beginPath(); c.moveTo(mx - mw * .8, my); c.lineTo(mx + mw * .8, my + 1); c.stroke(); }
      else { c.beginPath(); c.moveTo(mx - mw, my - 1); c.quadraticCurveTo(mx, my + b.h * (mood === 'proud' ? .14 : .09), mx + mw * (mood === 'proud' ? 1.15 : 1), my - (mood === 'proud' ? 4 : 1)); c.stroke(); }
      if (mood === 'sad') { const d = (t * .7 + seed) % 1; c.fillStyle = 'rgba(130,200,240,.95)'; c.strokeStyle = INK; c.lineWidth = 1.4; c.beginPath(); c.ellipse(e1 - rx * .3, ey + ry + 3 + d * b.h * .22, rx * .22, rx * .36, 0, 0, TAU); c.fill(); c.stroke(); }
      c.restore();
    }
    // Cột cờ mọc lên, lá cờ mở ra và gợn sóng; cắm xuống thì có vòng bụi lan ra.
    function flagAt(c, x, y, s, realm, t, k) {
      if (k <= 0) return;
      const pole = 118 * s * easeOut(k * 1.6), open = easeOut((k - .35) / .6), fw = 150 * s * open, fh = 92 * s, top = -pole;
      c.save(); c.translate(x, y);
      c.fillStyle = 'rgba(10,6,2,.28)'; c.beginPath(); c.ellipse(0, 4 * s, 22 * s, 7 * s, 0, 0, TAU); c.fill();
      const ring = clamp((k - .2) / .5, 0, 1);
      if (ring > 0 && ring < 1) { c.strokeStyle = `rgba(255,236,190,${.7 * (1 - ring)})`; c.lineWidth = 4 * (1 - ring) + 1; c.beginPath(); c.ellipse(0, 3 * s, 20 * s + ring * 80 * s, 6 * s + ring * 26 * s, 0, 0, TAU); c.stroke(); }
      c.lineCap = 'round'; c.strokeStyle = INK; c.lineWidth = 5.5 * s; c.beginPath(); c.moveTo(0, 0); c.lineTo(0, -pole); c.stroke();
      c.strokeStyle = '#d9d2c0'; c.lineWidth = 2.6 * s; c.beginPath(); c.moveTo(0, 0); c.lineTo(0, -pole); c.stroke();
      c.fillStyle = GOLD; c.strokeStyle = INK; c.lineWidth = 2 * s; c.beginPath(); c.arc(0, -pole - 5 * s, 6.5 * s, 0, TAU); c.fill(); c.stroke();
      if (fw > 4) {
        const slices = 40, sw = fw / slices, amp = 7 * s, flagBox = { x: 0, y: 0, w: fw, h: fh, cx: fw / 2, cy: fh / 2 };
        for (let i = 0; i < slices; i++) {
          const u = i / slices, off = Math.sin(u * 7 - t * 4.2) * amp * (.25 + u), dark = Math.cos(u * 7 - t * 4.2) * .16;
          c.save(); c.beginPath(); c.rect(i * sw, top - 2 * amp - 4, sw + .8, fh + 4 * amp + 8); c.clip();
          c.translate(0, top + off);
          c.save(); c.beginPath(); c.rect(0, 0, fw, fh); c.clip(); fillFlag(c, realm, flagBox); if (realm.face && fw > 80 * s) drawFace(c, { x: 0, y: 0, w: fw, h: fh }, realm.mood, t, seedOf(realm.name)); c.restore();
          c.fillStyle = dark > 0 ? `rgba(0,0,0,${dark})` : `rgba(255,255,255,${-dark * .7})`; c.fillRect(i * sw, 0, sw + .8, fh);
          c.restore();
        }
        c.strokeStyle = INK; c.lineWidth = 2.4 * s; c.beginPath();
        for (let i = 0; i <= slices; i++) { const u = i / slices; c.lineTo(u * fw, top + Math.sin(u * 7 - t * 4.2) * amp * (.25 + u)); }
        for (let i = slices; i >= 0; i--) { const u = i / slices; c.lineTo(u * fw, top + fh + Math.sin(u * 7 - t * 4.2) * amp * (.25 + u)); }
        c.closePath(); c.stroke();
      }
      c.restore();
    }

    // ---------- Ký hiệu địa danh (khắc mực) ----------
    function dot(c, x, y, s, label, kind) {
      c.save(); c.translate(x, y); c.scale(s, s); c.lineJoin = 'round';
      if (kind === 'capital') { c.fillStyle = GOLD; c.strokeStyle = INK; c.lineWidth = 3; c.beginPath(); for (let i = 0; i < 10; i++) { const r = i % 2 ? 7 : 17, a = -Math.PI / 2 + i * Math.PI / 5; c.lineTo(Math.cos(a) * r, Math.sin(a) * r); } c.closePath(); c.fill(); c.stroke(); }
      else { c.fillStyle = PAPER; c.strokeStyle = INK; c.lineWidth = 3.4; c.beginPath(); c.arc(0, 0, 9, 0, TAU); c.fill(); c.stroke(); c.fillStyle = INK; c.beginPath(); c.arc(0, 0, 3.4, 0, TAU); c.fill(); }
      c.restore();
      tag(c, label, x, y + 36 * s, s, 19);
    }
    function temple(c, x, y, s, label) {
      c.save(); c.translate(x, y); c.scale(s, s); c.fillStyle = PAPER; c.strokeStyle = INK; c.lineWidth = 2.6; c.lineJoin = 'round';
      for (let i = 0; i < 4; i++) { const w = 44 - i * 9, h = 9; c.beginPath(); c.rect(-w / 2, -i * h - h, w, h); c.fill(); c.stroke(); }
      c.beginPath(); c.moveTo(0, -48); c.lineTo(-6, -36); c.lineTo(6, -36); c.closePath(); c.fill(); c.stroke(); c.restore();
      tag(c, label, x, y + 26 * s, s, 19);
    }
    function castle(c, x, y, s, label) {
      c.save(); c.translate(x, y); c.scale(s, s); c.fillStyle = PAPER; c.strokeStyle = INK; c.lineWidth = 2.6; c.lineJoin = 'round';
      c.beginPath(); c.rect(-26, -28, 52, 28); c.fill(); c.stroke();
      for (const dx of [-26, -8, 10]) { c.beginPath(); c.rect(dx, -38, 16, 12); c.fill(); c.stroke(); }
      c.fillStyle = INK; c.beginPath(); c.rect(-6, -16, 12, 16); c.fill(); c.restore();
      tag(c, label, x, y + 26 * s, s, 19);
    }
    function battle(c, x, y, s, label, t = 0) {
      c.save(); c.translate(x, y); c.scale(s, s); c.lineCap = 'round'; c.lineJoin = 'round';
      for (let k = 0; k < 2; k++) { const ph = (t * .9 + k * .5) % 1; c.strokeStyle = `rgba(${k ? '255,236,190' : '168,40,28'},${.8 * (1 - ph)})`; c.lineWidth = 2 + 6 * (1 - ph); c.beginPath(); c.arc(0, 0, 24 + ph * 54, 0, TAU); c.stroke(); }
      c.beginPath(); c.arc(0, 0, 24, 0, TAU); c.fillStyle = '#9d2b1f'; c.fill(); c.strokeStyle = INK; c.lineWidth = 4; c.stroke();
      c.strokeStyle = PAPER; c.lineWidth = 5; c.beginPath(); c.moveTo(-11, -11); c.lineTo(11, 11); c.moveTo(11, -11); c.lineTo(-11, 11); c.stroke();
      c.restore();
      tag(c, label, x, y + 52 * s, s, 19);
    }
    function ship(c, x, y, s, flip = 1, t = 0) {
      c.save(); c.translate(x, y + Math.sin(t * 2.4) * 3); c.rotate(Math.sin(t * 1.9) * .05); c.scale(s * flip, s); c.lineJoin = 'round';
      c.fillStyle = '#5e3a1c'; c.strokeStyle = INK; c.lineWidth = 3; c.beginPath(); c.moveTo(-34, 0); c.lineTo(34, 0); c.lineTo(24, 14); c.lineTo(-24, 14); c.closePath(); c.fill(); c.stroke();
      c.beginPath(); c.moveTo(0, 0); c.lineTo(0, -52); c.stroke();
      c.fillStyle = PAPER; c.beginPath(); c.moveTo(3, -50); c.quadraticCurveTo(34, -30, 28, -4); c.lineTo(3, -4); c.closePath(); c.fill(); c.stroke();
      c.fillStyle = '#9d2b1f'; c.beginPath(); c.moveTo(-3, -48); c.quadraticCurveTo(-26, -32, -22, -6); c.lineTo(-3, -6); c.closePath(); c.fill(); c.stroke();
      c.restore();
    }
    function drawMarker(c, m, pr, local, i, t) {
      const delay = Plan.TIMING.marker0 + i * Plan.TIMING.markerStep, k = (local - delay) / .5;
      if (k <= 0) return;
      const s = easeBack(k), [x, y] = pr.P(m.at[0], m.at[1]);
      if (toon()) { toonMarker(c, m, x, y, s, t, k); return; }
      if (m.type === 'temple') temple(c, x, y + 6, 1.1 * s, m.name);
      else if (m.type === 'castle') castle(c, x, y + 6, 1.1 * s, m.name);
      else if (m.type === 'battle') battle(c, x, y, s, m.name, t);
      else if (m.type === 'ship') ship(c, x, y, 1.1 * s, 1, t);
      else dot(c, x, y, s, m.name, m.type);
    }
    // Ký hiệu hoạt hình: huy hiệu kiếm chéo (trận đánh), ghim đỏ (thủ đô), kim tự tháp (đền), pháo đài (thành), thuyền, chấm trắng (thành phố).
    function toonMarker(c, m, x, y, s, t, k) {
      const a = clamp((k - .3) / .5, 0, 1), lab = (dy, size = 22) => { c.save(); c.globalAlpha *= a; Cart.label(c, m.name, x, y + dy, size); c.restore(); };
      if (m.type === 'battle') { Cart.battleMedal(c, x, y - 4, s, t); lab(64); }
      else if (m.type === 'capital') { Cart.pin(c, x, y + 4, s); lab(38); }
      else if (m.type === 'temple') { Cart.pyramid(c, x, y + 8, 1.05 * s); lab(36); }
      else if (m.type === 'castle') { Cart.fort(c, x, y + 8, 1.05 * s); lab(36); }
      else if (m.type === 'ship') Cart.boat(c, x, y, .95 * s, 1, t);
      else { Cart.townDot(c, x, y, s); lab(38); }
    }
    function drawRoute(c, route, pr, local, t) {
      const start = 1.4, grow = clamp((local - start) / 3.2, 0, 1);
      if (grow <= 0) return;
      const pts = route.points.map(p => pr.P(p[0], p[1]));
      const seg = []; let total = 0;
      for (let i = 1; i < pts.length; i++) { const d = Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]); seg.push(d); total += d; }
      let need = total * easeInOut(grow), head = pts[0], heading = 1, angle = 0;
      const arrow = !route.ship, path = new Path2D();
      path.moveTo(pts[0][0], pts[0][1]);
      for (let i = 1; i < pts.length; i++) {
        const d = seg[i - 1], ang = Math.atan2(pts[i][1] - pts[i - 1][1], pts[i][0] - pts[i - 1][0]);
        if (need >= d) { path.lineTo(pts[i][0], pts[i][1]); need -= d; head = pts[i]; heading = Math.sign(pts[i][0] - pts[i - 1][0]) || heading; angle = ang; }
        else { const f = need / d; head = [lerp(pts[i - 1][0], pts[i][0], f), lerp(pts[i - 1][1], pts[i][1], f)]; heading = Math.sign(pts[i][0] - pts[i - 1][0]) || heading; angle = ang; path.lineTo(head[0], head[1]); break; }
      }
      if (toon()) {
        c.save(); c.lineCap = 'round'; c.lineJoin = 'round';
        if (arrow) {
          c.strokeStyle = INK; c.lineWidth = 21; c.stroke(path); c.strokeStyle = '#e8343a'; c.lineWidth = 12; c.stroke(path);
          c.strokeStyle = 'rgba(255,255,255,.75)'; c.lineWidth = 3; c.setLineDash([2, 18]); c.lineDashOffset = -t * 30; c.stroke(path); c.setLineDash([]);
          c.translate(head[0], head[1]); c.rotate(angle); c.fillStyle = '#e8343a'; c.strokeStyle = INK; c.lineWidth = 6;
          c.beginPath(); c.moveTo(30, 0); c.lineTo(-14, -26); c.lineTo(-4, 0); c.lineTo(-14, 26); c.closePath(); c.stroke(); c.fill();
        } else { c.strokeStyle = 'rgba(0,50,100,.3)'; c.lineWidth = 10; c.stroke(path); c.strokeStyle = '#fff'; c.lineWidth = 5.5; c.setLineDash([16, 14]); c.lineDashOffset = -t * 26; c.stroke(path); c.setLineDash([]); }
        c.restore();
        if (route.ship) Cart.boat(c, head[0], head[1] - 6, .95, heading < 0 ? -1 : 1, t);
        return;
      }
      c.save(); c.lineCap = 'round'; c.lineJoin = 'round';
      if (arrow) {
        c.strokeStyle = INK; c.lineWidth = 17; c.stroke(path); c.strokeStyle = '#b8322a'; c.lineWidth = 9; c.stroke(path);
        c.strokeStyle = 'rgba(255,230,180,.7)'; c.lineWidth = 2; c.setLineDash([10, 14]); c.lineDashOffset = -t * 30; c.stroke(path); c.setLineDash([]);
        c.translate(head[0], head[1]); c.rotate(angle); c.fillStyle = '#b8322a'; c.strokeStyle = INK; c.lineWidth = 6;
        c.beginPath(); c.moveTo(28, 0); c.lineTo(-14, -25); c.lineTo(-4, 0); c.lineTo(-14, 25); c.closePath(); c.stroke(); c.fill();
      } else { c.setLineDash([2, 15]); c.strokeStyle = 'rgba(244,232,200,.95)'; c.lineWidth = 5.5; c.lineDashOffset = -t * 20; c.stroke(path); }
      c.restore();
      if (route.ship) ship(c, head[0], head[1] - 6, 1.05, heading < 0 ? -1 : 1, t);
    }
    // Chọn chỗ cắm cờ gần trọng tâm sao cho cả chân cột lẫn lá cờ (lệch phải, phía trên) không đè lên ký hiệu địa danh.
    function clearSpot(x, y, spots, fs, k = 100) {
      const tries = [[0, 0], [-1, 0], [1, 0], [0, -1], [0, 1], [-1.6, 0], [1.6, 0], [-1, -1], [1, -1], [-1, 1], [1, 1]].map(([dx, dy]) => [dx * k, dy * k]);
      let best = [x, y], far = -1;
      for (const [dx, dy] of tries) {
        const bx = x + dx, by = y + dy, fx = bx + 75 * fs, fy = by - 72 * fs;
        let d = 1e9;
        for (const [sx, sy] of spots) d = Math.min(d, Math.hypot(sx - bx, (sy - by) * 1.2) / (46 * fs + 20), Math.hypot(sx - fx, (sy - fy) * 1.2) / (92 * fs + 20));
        if (d >= 1) return [bx, by];
        if (d > far) { far = d; best = [bx, by]; }
      }
      return best;
    }

    // ---------- Giao diện ----------
    // Đồng hồ số cơ học: mỗi chữ số lăn như công tơ mét. yearF có thể lẻ khi đang đếm.
    function odometer(c, yearF, slide) {
      const x0 = 44, y0 = 30 - (1 - slide) * 140, cw = 66, ch = 98, gap = 7, cells = 4, tagW = 90;
      const w = 28 + cells * (cw + gap) + tagW, h = ch + 38;
      c.save(); c.translate(x0, y0);
      c.shadowColor = 'rgba(0,0,0,.45)'; c.shadowBlur = 22; c.shadowOffsetY = 9;
      const brass = c.createLinearGradient(0, 0, 0, h); brass.addColorStop(0, '#f1d98d'); brass.addColorStop(.5, '#c99a43'); brass.addColorStop(1, '#8f6422');
      c.fillStyle = brass; c.strokeStyle = INK; c.lineWidth = 4; c.beginPath(); c.roundRect(0, 0, w, h, 16); c.fill(); c.shadowColor = 'transparent'; c.stroke();
      c.strokeStyle = 'rgba(255,245,200,.6)'; c.lineWidth = 2; c.beginPath(); c.roundRect(5, 5, w - 10, h - 10, 12); c.stroke();
      const v = Math.abs(yearF);
      for (let i = 0; i < cells; i++) {
        const pow = Math.pow(10, cells - 1 - i), x = 16 + i * (cw + gap), y = 19;
        c.save(); c.beginPath(); c.roundRect(x, y, cw, ch, 8); c.clip();
        const bg = c.createLinearGradient(0, y, 0, y + ch); bg.addColorStop(0, '#120c08'); bg.addColorStop(.5, '#34261a'); bg.addColorStop(1, '#120c08');
        c.fillStyle = bg; c.fillRect(x, y, cw, ch);
        // công tơ cơ học: chữ số chỉ lăn khi các chữ số thấp hơn chạy qua 9→0
        const base = Math.floor(v / pow), low = v % pow;
        const frac = clamp(low - (pow - 1), 0, 1), show = base > 0 || i === cells - 1;
        if (show) for (const [off, d] of [[0, base % 10], [1, (base + 1) % 10]]) {
          text(c, String(d), x + cw / 2, y + ch / 2 + (off - easeInOut(frac)) * ch * .9 + 27, { size: 80, weight: 700, fill: '#f6ecd0' });
        }
        const gl = c.createLinearGradient(0, y, 0, y + ch); gl.addColorStop(0, 'rgba(255,255,255,.18)'); gl.addColorStop(.5, 'rgba(255,255,255,0)'); gl.addColorStop(.5, 'rgba(0,0,0,.18)'); gl.addColorStop(1, 'rgba(0,0,0,.45)');
        c.fillStyle = gl; c.fillRect(x, y, cw, ch);
        c.restore();
      }
      const tx = 16 + cells * (cw + gap) + 4;
      c.fillStyle = '#1a1009'; c.beginPath(); c.roundRect(tx, 19 + ch / 2 - 30, tagW - 22, 60, 8); c.fill();
      // «BC / AD» theo ngôn ngữ video; chữ dài hơn (v. Chr., apr. J.-C., до н.э.) thì thu nhỏ cho vừa ô
      const era = Plan.strings(tl.lang)[yearF < 0 ? 'bcTag' : 'adTag'];
      c.save(); c.font = `700 32px ${SERIF}`; const w32 = c.measureText(era).width; c.restore();
      const es = w32 > 58 ? Math.max(14, Math.floor(32 * 58 / w32)) : 32;
      text(c, era, tx + (tagW - 22) / 2, 19 + ch / 2 + 11 - (32 - es) * .34, { size: es, weight: 700, fill: GOLD });
      c.restore();
      return { x: x0, y: y0 + h, w, h };
    }
    // Dải băng ghi tên giai đoạn, trượt từ trái vào.
    function ribbon(c, label, x, y, slide, w0) {
      if (slide <= 0) return;
      c.save(); c.translate(x - (1 - slide) * 460, y);
      const shown = label.toUpperCase(), MAXW = 860;
      let fs = 32; c.font = `700 ${fs}px ${SERIF}`; if ('letterSpacing' in c) c.letterSpacing = '2px';
      let textW = c.measureText(shown).width;
      if (textW + 90 > MAXW) {          // tên dài: thu nhỏ chữ cho vừa dải (dải dài tối đa 860 px), không để tràn ra ngoài khung hình
        fs = Math.max(18, Math.floor(fs * (MAXW - 90) / textW)); c.font = `700 ${fs}px ${SERIF}`; textW = c.measureText(shown).width;
      }
      const tw = Math.min(MAXW, Math.max(w0, textW + 90)), h = 56;
      c.shadowColor = 'rgba(0,0,0,.4)'; c.shadowBlur = 14; c.shadowOffsetY = 6;
      c.fillStyle = NAVY; c.beginPath(); c.moveTo(0, 0); c.lineTo(tw, 0); c.lineTo(tw + 18, h / 2); c.lineTo(tw, h); c.lineTo(0, h); c.lineTo(18, h / 2); c.closePath(); c.fill();
      c.shadowColor = 'transparent'; c.strokeStyle = GOLD; c.lineWidth = 3; c.stroke();
      c.strokeStyle = 'rgba(230,195,106,.5)'; c.lineWidth = 1.2; c.beginPath(); c.moveTo(24, 6); c.lineTo(tw - 6, 6); c.moveTo(24, h - 6); c.lineTo(tw - 6, h - 6); c.stroke();
      c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillStyle = '#f7edd0'; c.fillText(shown, tw / 2 + 4, h / 2 + 2);
      c.restore();
    }
    function population(c, n, x, y, slide) {
      if (!n || slide <= 0) return;
      c.save(); c.globalAlpha = slide; c.translate(x - (1 - slide) * 80, y);
      c.fillStyle = '#f6ecd0'; c.strokeStyle = 'rgba(10,20,34,.85)'; c.lineWidth = 5; c.lineJoin = 'round';
      c.beginPath(); c.arc(14, -22, 7, 0, TAU); c.stroke(); c.fill(); c.beginPath(); c.arc(14, -3, 12, Math.PI, 0); c.stroke(); c.fill();
      text(c, Plan.strings(tl.lang).people(n), 42, 0, { size: 30, weight: 700, style: 'italic', fill: '#f6ecd0', align: 'left', halo: 'rgba(10,20,34,.85)', haloW: 6 });
      c.restore();
    }
    // Đường thời gian mảnh trên đỉnh khung hình: mốc kim cương theo từng giai đoạn chính.
    function rail(c, st, slide) {
      const ms = tl.milestones; if (!ms.length || slide <= 0) return;
      const x0 = 560, x1 = 1590, y = 44 - (1 - slide) * 80, n = ms.length;
      const pos = st.index + clamp(st.local / st.era.dur, 0, 1);
      let k = 0; while (k < n - 1 && pos >= ms[k + 1].era) k++;
      const a = ms[k].era, b = ms[Math.min(k + 1, n - 1)].era, prog = n === 1 ? 1 : (k + (b === a ? 0 : clamp((pos - a) / (b - a), 0, 1))) / (n - 1);
      c.save(); c.lineCap = 'round';
      c.strokeStyle = 'rgba(8,18,30,.7)'; c.lineWidth = 9; c.beginPath(); c.moveTo(x0, y); c.lineTo(x1, y); c.stroke();
      c.strokeStyle = 'rgba(240,226,190,.35)'; c.lineWidth = 3; c.beginPath(); c.moveTo(x0, y); c.lineTo(x1, y); c.stroke();
      c.strokeStyle = GOLD; c.lineWidth = 4; c.beginPath(); c.moveTo(x0, y); c.lineTo(x0 + (x1 - x0) * prog, y); c.stroke();
      ms.forEach((m, i) => {
        const mx = n === 1 ? (x0 + x1) / 2 : x0 + (x1 - x0) * i / (n - 1), on = pos >= m.era;
        c.save(); c.translate(mx, y); c.rotate(Math.PI / 4); c.fillStyle = on ? GOLD : '#51606c'; c.strokeStyle = INK; c.lineWidth = 2.5; c.beginPath(); c.rect(-9, -9, 18, 18); c.fill(); c.stroke(); c.restore();
        text(c, m.label, mx, y + 36, { size: 17, weight: 700, fill: on ? '#f7edd0' : 'rgba(247,237,208,.6)', halo: 'rgba(8,18,30,.85)', haloW: 5 });
      });
      const px = x0 + (x1 - x0) * prog;
      c.fillStyle = '#fff4cf'; c.strokeStyle = INK; c.lineWidth = 3; c.beginPath(); c.arc(px, y, 8 + Math.sin(curT * 4) * 1.2, 0, TAU); c.fill(); c.stroke();
      c.restore();
    }
    // Địa cầu nhỏ (chiếu trực giao) quay về đúng vùng camera đang xem; lãnh thổ hiện tại tô màu.
    function globe(c, cam, era, slide, t) {
      if (slide <= 0) return;
      const R = 92, cx = width - 44 - R - 10, cy = 40 + R + 8 - (1 - slide) * 260, lon0 = cam.lon * DEG, lat0 = clamp(cam.lat, -75, 75) * DEG;
      const sinL = Math.sin(lat0), cosL = Math.cos(lat0);
      const pt = (lon, lat) => {
        const ph = lat * DEG, la = lon * DEG - lon0, cosc = sinL * Math.sin(ph) + cosL * Math.cos(ph) * Math.cos(la);
        let x = R * Math.cos(ph) * Math.sin(la), y = -R * (cosL * Math.sin(ph) - sinL * Math.cos(ph) * Math.cos(la));
        if (cosc < 0) { const m = Math.hypot(x, y) || 1; x = x / m * R; y = y / m * R; }
        return [x, y];
      };
      const facing = bb => { const mlon = (bb[0] + bb[2]) / 2 * DEG - lon0, mlat = (bb[1] + bb[3]) / 2 * DEG; return sinL * Math.sin(mlat) + cosL * Math.cos(mlat) * Math.cos(mlon) > -.35; };
      const pathOf = rings => {
        const p = new Path2D();
        for (const r of rings) {
          if (!facing(r.bb)) continue;
          const n = r.pts.length / 2; let px = 1e9, py = 1e9, drawn = 0;
          for (let i = 0; i < n; i++) {
            const [x, y] = pt(r.pts[2 * i] / 100, r.pts[2 * i + 1] / 100);
            if (i && i < n - 1 && Math.abs(x - px) + Math.abs(y - py) < 1.6) continue;
            drawn ? p.lineTo(x, y) : p.moveTo(x, y); px = x; py = y; drawn++;
          }
          if (drawn > 2) p.closePath();
        }
        return p;
      };
      c.save(); c.translate(cx, cy);
      c.shadowColor = 'rgba(0,0,0,.5)'; c.shadowBlur = 20; c.shadowOffsetY = 8; c.fillStyle = '#0d2f49'; c.beginPath(); c.arc(0, 0, R + 9, 0, TAU); c.fill(); c.shadowColor = 'transparent';
      c.save(); c.beginPath(); c.arc(0, 0, R, 0, TAU); c.clip();
      const sea = c.createRadialGradient(-R * .3, -R * .35, 8, 0, 0, R); sea.addColorStop(0, '#2c7a93'); sea.addColorStop(1, '#0d3350'); c.fillStyle = sea; c.fillRect(-R, -R, R * 2, R * 2);
      const land = new Path2D();
      for (const u of geo.countries) if (u.a3 !== 'ATA') land.addPath(pathOf(u.rings));
      c.fillStyle = '#e4d6b2'; c.fill(land); c.strokeStyle = 'rgba(70,48,26,.8)'; c.lineWidth = .9; c.stroke(land);
      if (era) for (const realm of era.realms) {
        const p = new Path2D();
        for (const k of realm.units.filter(k => !k.startsWith('B:'))) { const u = geo.units.get(k); if (u) p.addPath(pathOf(u.rings)); }
        c.fillStyle = pigment(realm); c.fill(p); c.strokeStyle = GOLD; c.lineWidth = 1.4; c.stroke(p);
        for (const k of realm.units.filter(k => k.startsWith('B:'))) { const b = Geo.parseBlob(k), [x, y] = pt(b.lon, b.lat); c.fillStyle = pigment(realm); c.beginPath(); c.arc(x, y, Math.max(3, b.km / 111 * 1.3), 0, TAU); c.fill(); }
      }
      const sh = c.createRadialGradient(-R * .35, -R * .4, R * .1, 0, 0, R * 1.05); sh.addColorStop(0, 'rgba(255,255,255,.22)'); sh.addColorStop(.6, 'rgba(255,255,255,0)'); sh.addColorStop(1, 'rgba(0,10,30,.5)');
      c.fillStyle = sh; c.fillRect(-R, -R, R * 2, R * 2);
      c.restore();
      c.strokeStyle = '#fff4cf'; c.lineWidth = 2.4; c.beginPath(); c.arc(0, 0, 8 + Math.sin(t * 3) * 1.6, 0, TAU); c.stroke(); c.fillStyle = '#b8322a'; c.beginPath(); c.arc(0, 0, 3.5, 0, TAU); c.fill();
      c.strokeStyle = GOLD; c.lineWidth = 6; c.beginPath(); c.arc(0, 0, R + 4, 0, TAU); c.stroke(); c.strokeStyle = INK; c.lineWidth = 2.5; c.beginPath(); c.arc(0, 0, R + 8, 0, TAU); c.stroke(); c.beginPath(); c.arc(0, 0, R + .5, 0, TAU); c.stroke();
      for (let i = 0; i < 4; i++) { c.save(); c.rotate(i * Math.PI / 2); c.fillStyle = i ? GOLD : '#b8322a'; c.strokeStyle = INK; c.lineWidth = 1.6; c.beginPath(); c.moveTo(0, -R - 18); c.lineTo(5, -R - 6); c.lineTo(-5, -R - 6); c.closePath(); c.fill(); c.stroke(); c.restore(); }
      c.restore();
    }
    // Thẻ lời đọc: tiêu đề nhỏ + câu đang đọc, từng từ sáng lên theo giọng.
    function wrapWords(c, words, maxW) {
      const lines = []; let line = [], w = 0; const space = c.measureText(' ').width;
      for (let i = 0; i < words.length; i++) {
        const ww = c.measureText(words[i].w).width;
        if (line.length && w + space + ww > maxW) { lines.push(line); line = []; w = 0; }
        line.push({ ...words[i], i, width: ww }); w += (line.length > 1 ? space : 0) + ww;
      }
      if (line.length) lines.push(line);
      return lines;
    }
    function captionCard(c, era, sub, slide) {
      if (!sub || slide <= 0) return;
      const w = 1500, x = (width - w) / 2, pad = 54;
      c.save(); c.font = `italic 600 36px ${SERIF}`; if ('letterSpacing' in c) c.letterSpacing = '0px';
      const lines = wrapWords(c, sub.chunk.words, w - pad * 2 - 150), h = 78 + lines.length * 50, y = height - h - 34 + (1 - slide) * (h + 80);
      c.shadowColor = 'rgba(0,0,0,.5)'; c.shadowBlur = 28; c.shadowOffsetY = 12;
      const g = c.createLinearGradient(0, y, 0, y + h); g.addColorStop(0, '#f4ead0'); g.addColorStop(1, '#e3d3a8');
      c.fillStyle = g; c.beginPath(); c.roundRect(x, y, w, h, 10); c.fill(); c.shadowColor = 'transparent';
      c.save(); c.beginPath(); c.roundRect(x, y, w, h, 10); c.clip(); c.globalAlpha = .05; c.fillStyle = grain; c.fillRect(x, y, w, h); c.restore();
      c.strokeStyle = INK; c.lineWidth = 4; c.beginPath(); c.roundRect(x, y, w, h, 10); c.stroke();
      c.strokeStyle = GOLD_DEEP; c.lineWidth = 1.6; c.beginPath(); c.roundRect(x + 8, y + 8, w - 16, h - 16, 6); c.stroke();
      const main = era.realms.find(r => r.face) || era.realms[0];
      c.save(); c.translate(x + 40, y + h / 2 - 34); c.beginPath(); c.roundRect(0, 0, 92, 68, 5); c.save(); c.clip();
      if (main) fillFlag(c, main, { x: 0, y: 0, w: 92, h: 68, cx: 46, cy: 34 }); else { c.fillStyle = '#3d6e91'; c.fillRect(0, 0, 92, 68); }
      const gl = c.createLinearGradient(0, 0, 0, 68); gl.addColorStop(0, 'rgba(255,255,255,.25)'); gl.addColorStop(1, 'rgba(0,0,0,.2)'); c.fillStyle = gl; c.fillRect(0, 0, 92, 68); c.restore();
      c.strokeStyle = INK; c.lineWidth = 3.4; c.stroke(); c.restore();
      const tx = x + pad + 130;
      if (era.caption) text(c, era.caption.toUpperCase().slice(0, 90), tx, y + 38, { size: 17, weight: 700, fill: GOLD_DEEP, align: 'left', spacing: 2.4 });
      c.font = `italic 600 36px ${SERIF}`; if ('letterSpacing' in c) c.letterSpacing = '0px'; c.textBaseline = 'alphabetic'; c.textAlign = 'left';
      const space = c.measureText(' ').width, a = easeOut(sub.entered);
      lines.forEach((line, li) => {
        let px = tx; const py = y + 90 + li * 50;
        for (const word of line) {
          const spoken = word.i < sub.done, current = word.i === sub.done;
          c.globalAlpha = (spoken || current ? 1 : .42) * a;
          c.fillStyle = spoken ? INK : current ? '#9d2b1f' : '#4a3318';
          c.fillText(word.w, px, py - (current ? 2 * Math.sin(sub.within * Math.PI) : 0));
          if (current) { c.fillStyle = 'rgba(157,43,31,.7)'; c.fillRect(px, py + 6, word.width * sub.within, 3); }
          px += word.width + space;
        }
      });
      c.restore();
    }
    // Phủ nhẹ: thớ giấy toàn khung + tối viền, để cả khung hình có chất in ấn.
    function finish(c) {
      c.save(); c.globalAlpha = .02; c.globalCompositeOperation = 'overlay'; c.fillStyle = grain; c.fillRect(0, 0, width, height); c.restore();
      const g = c.createRadialGradient(width / 2, height / 2, height * .42, width / 2, height / 2, height * 1.05); g.addColorStop(0, 'rgba(8,14,28,0)'); g.addColorStop(1, 'rgba(8,14,28,.5)'); c.fillStyle = g; c.fillRect(0, 0, width, height);
    }
    // Hoa văn la bàn (màn hình mở đầu / kết).
    function compass(c, x, y, r, rot, alpha = 1) {
      c.save(); c.globalAlpha *= alpha; c.translate(x, y); c.rotate(rot); c.lineJoin = 'round';
      c.strokeStyle = GOLD; c.lineWidth = 3; c.beginPath(); c.arc(0, 0, r, 0, TAU); c.stroke(); c.lineWidth = 1.5; c.beginPath(); c.arc(0, 0, r * .86, 0, TAU); c.stroke();
      for (let i = 0; i < 16; i++) {
        const long = i % 4 === 0, mid = i % 2 === 0, len = long ? r * .98 : mid ? r * .66 : r * .44, wd = long ? r * .12 : r * .07;
        c.save(); c.rotate(i * Math.PI / 8); c.fillStyle = long ? (i === 0 ? '#b8322a' : GOLD) : 'rgba(244,232,200,.8)'; c.strokeStyle = 'rgba(8,18,30,.9)'; c.lineWidth = 1.6;
        c.beginPath(); c.moveTo(0, -len); c.lineTo(wd, -wd); c.lineTo(0, 0); c.lineTo(-wd, -wd); c.closePath(); c.fill(); c.stroke(); c.restore();
      }
      c.restore();
    }

    // Đôi mắt thế lực: đặt ở trọng tâm phần lớn nhất; nhích sang bên nếu đè lên ký hiệu địa danh.
    function eyeSpot(x, y, spots, R) {
      const step = R * 2.4, tries = [[0, 0], [0, -1], [0, 1], [-1, 0], [1, 0], [-1, -1], [1, -1], [-1, 1], [1, 1]];
      let best = [x, y], far = -1;
      for (const [dx, dy] of tries) {
        const bx = x + dx * step, by = y + dy * step; let d = 1e9;
        for (const [sx, sy] of spots) d = Math.min(d, Math.hypot(sx - bx, (sy - by) * 1.1));
        if (d >= R * 2.6 + 34) return [bx, by];
        if (d > far) { far = d; best = [bx, by]; }
      }
      return best;
    }
    // Biểu cảm theo sự kiện: mất ≥ 20% vùng so với giai đoạn trước -> choáng (đổ mồ hôi); mở rộng mạnh -> cười lớn; còn lại theo mood kịch bản.
    function reaction(r, idx) {
      const prev = idx > 0 ? tl.eras[idx - 1] : null, was = prev && (prev.realms || []).find(x => x.name === r.name);
      if (was && was.units.length >= 3) {
        const a = was.units.length, n = r.units.length;
        if (n <= a * .8) return 'shock';
        if (n >= a * 1.3 + 1) return 'happy';
      }
      return r.mood;
    }
    // Điểm THOÁNG nhất bên trong lãnh thổ (xa mép nhất), chỉ xét trong vùng nhìn thấy của nửa ảnh; né một vòng tròn nếu cần. Cắt tỉa: chỉ tính đầy đủ khi điểm có thể hơn kỷ lục hiện tại.
    function roomySpot(c, r, pr, vis, avoid) {
      const all = new Path2D();
      for (const k of r.units) if (!k.startsWith('B:')) all.addPath(unitPath(k, pr));
      const inside = (x, y) => c.isPointInPath(all, x, y), DIRS = 14;
      const ok = (x, y, d) => { for (let k = 0; k < DIRS; k++) { const a = k / DIRS * TAU; if (!inside(x + Math.cos(a) * d, y + Math.sin(a) * d)) return false; } return true; };
      const b = boxOf(r.units, pr); if (!b) return null;
      const x0 = Math.max(b.x, vis[0]), y0 = Math.max(b.y, vis[1]), x1 = Math.min(b.x + b.w, vis[2]), y1 = Math.min(b.y + b.h, vis[3]);
      if (x1 <= x0 || y1 <= y0) return null;
      const sx = Math.max(8, (x1 - x0) / 24), sy = Math.max(8, (y1 - y0) / 30), mx = (x0 + x1) / 2, my = (y0 + y1) / 2, K = .2; let best = null;
      for (let y = y0; y <= y1; y += sy) for (let x = x0; x <= x1; x += sx) {
        if (avoid && Math.hypot((x - avoid.x) * .8, y - avoid.y) < avoid.r) continue;
        if (!inside(x, y)) continue;
        const pen = K * Math.hypot(x - mx, y - my), need = best ? best.score + pen + 6 : 8;
        if (best && !ok(x, y, need)) continue;
        let rho = best ? need : 0;
        for (let d = best ? need + 6 : 8; d <= 240 && ok(x, y, d); d += 6) rho = d;
        if (!best || rho - pen > best.score) best = { x, y, rho, score: rho - pen };
      }
      return best;
    }
    // Mặt to vẽ thẳng lên lãnh thổ của thế lực pop (ảnh bìa): mắt, lông mày, má hồng, miệng theo mood; đặt ở chỗ thoáng nhất của phần bản đồ nhìn thấy; không kèm tên.
    function popFace(c, r, pr, spots, t, opts) {
      const pop = opts.pops ? opts.pops[r.name] : opts.pop && r.name === opts.pop.name ? opts.pop : null;
      if (!pop || !r.units.length) return;
      const vis = pop.vis || [0, 0, width, height]; let spot = roomySpot(c, r, pr, vis, null);
      if (!spot) {   // lãnh thổ quá nhỏ để lấy điểm thoáng: đặt mặt ở trọng tâm đơn vị lớn nhất
        const k0 = bigUnit(r.units), cl0 = k0 && centroidOf(k0); if (!cl0) return;
        const [x0, y0] = pr.P(cl0[0], cl0[1]); if (x0 < vis[0] || x0 > vis[2] || y0 < vis[1] || y0 > vis[3]) return;
        spot = { x: x0, y: y0, rho: 0 };
      }
      const bx = boxOf(r.units, pr), fit = bx ? Math.min(Math.sqrt(bx.w * bx.h) * .17, Math.min(bx.w, bx.h) * .22) : 0;
      const R = clamp(Math.max(spot.rho / 1.35, fit), pop.minR || 30, pop.maxR || 110);
      spot.x = clamp(spot.x, vis[0] + R * 2.1, vis[2] - R * 2.1); spot.y = clamp(spot.y, vis[1] + R * 1.5, vis[3] - R * 2);
      if (pop.star) popStar(c, r, pr, vis, spot.x, spot.y, R);
      Cart.eyes(c, spot.x, spot.y, R, { mood: pop.mood, t: pop.t == null ? 1.3 : pop.t, seed: seedOf(r.name), k: 1, lid: pop.color });
    }
    // Quốc kỳ Việt Nam: sao vàng 5 cánh trên nền đỏ, đặt chỗ thoáng nhất còn lại (cách xa khuôn mặt).
    const isVietnam = name => /\b(vietnam|viet nam|dai nam|dai viet)\b/.test(String(name || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/đ/gi, 'd').toLowerCase());
    function popStar(c, r, pr, vis, fx, fy, fR) {
      const best = roomySpot(c, r, pr, vis, { x: fx, y: fy, r: fR * 1.7 });
      if (!best || best.rho < 12) return;
      starSpot = { x: best.x, y: best.y, R: clamp(best.rho * .95, 20, fR * 1.4) };   // vẽ sau cùng (sau lớp tối viền) để sao luôn vàng chói
    }
    let starSpot = null;
    function drawStar(c, { x, y, R }) {
      c.save(); c.lineJoin = 'round';
      c.beginPath(); for (let k = 0; k < 10; k++) { const rr = k % 2 ? R * .382 : R, a = -Math.PI / 2 + k / 10 * TAU; c.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr); } c.closePath();
      c.shadowColor = 'rgba(255,240,80,.95)'; c.shadowBlur = 22; c.fillStyle = '#ffee00'; c.fill(); c.shadowColor = 'transparent';
      c.strokeStyle = INK; c.lineWidth = Math.max(4, R * .16); c.stroke();
      c.restore();
    }
    function toonRealm(c, r, pr, spots, local, t, opts, idx = 0) {
      if ((opts.pop || opts.pops) && opts.clean) { popFace(c, r, pr, spots, t, opts); return; }
      if (!r.units.length || opts.clean) return;
      const key2 = bigUnit(r.units), cl = key2 && centroidOf(key2), b = boxOf(r.units, pr);
      if (!cl || !b) return;
      const [x, y] = pr.P(cl[0], cl[1]), ub = boxOf([key2], pr) || b, R = clamp(Math.sqrt(ub.w * ub.h * .5 + b.w * b.h * .5) * .19, 14, 74), k = (local - GROW_DELAY - GROW * .45) / .6;
      if (k <= 0) return;
      const [ax, ay] = eyeSpot(x, y, spots, R), cols = r.colors && r.colors.length ? r.colors : [r.color];
      if (r.face) Cart.eyes(c, ax, ay, R, { mood: reaction(r, idx), t, seed: seedOf(r.name), k: Cart.easeBack(k), lid: cols[0] });
      if (r.name && Math.min(b.w, b.h) > 60 && R >= 18 && k > .7) { c.save(); c.globalAlpha *= clamp((k - .7) / .3, 0, 1); Cart.label(c, r.name, ax, ay + R * 2.7, clamp(R * .62, 15, 28)); c.restore(); }
    }
    // Biển ngả xám xanh ở giai đoạn có trận đánh (chuyển mượt khi sang giai đoạn mới).
    const warOf = e => e && (e.markers || []).some(m => m.type === 'battle') ? .6 : 0;
    function toonTone(st) { return lerp(st.prev ? warOf(st.prev) : warOf(st.era), warOf(st.era), easeOut(clamp(st.local / 1.2, 0, 1))); }
    function toonHud(c, st, t) {
      const S = Plan.strings(tl.lang), outro = st.phase === 'outro', local = st.local, era = st.era, ms = tl.milestones, n = ms.length;
      const pos = outro ? tl.eras.length : st.index + clamp(local / era.dur, 0, 1), top = outro ? 1 : easeOut(local / .8);
      let k = 0; while (k < n - 1 && pos >= ms[k + 1].era) k++;
      const a = n ? ms[k].era : 0, b = n ? ms[Math.min(k + 1, n - 1)].era : 0, prog = n <= 1 ? 1 : (k + (b === a ? 0 : clamp((pos - a) / (b - a), 0, 1))) / (n - 1);
      Cart.timeline(c, { ms, pos, prog, slide: top, t, durOf: i => (tl.eras[i] || {}).dur || 6, startLabel: tl.eras[0] ? tl.eras[0].label : '' });
      const counters = Plan.counterAt(st), yr = Math.round(counters.year == null ? era.year : counters.year), pop = clamp((local - 1.3) / .6, 0, 1);
      Cart.year(c, Math.abs(yr), yr < 0 ? S.bcTag : yr < 1000 ? S.adTag : '', width / 2, 246, { size: 150, pop: pop >= 1 ? 0 : pop, slide: top });
      Cart.population(c, counters.pop, S.est, { en: ',', de: '.' }[tl.lang] || ' ', width / 2, 306, outro ? 1 : easeOut((local - .45) / .6));
      const main = era.realms.find(r => r.face) || era.realms[0], flag = main ? (cc, box) => fillFlag(cc, main, box) : null;
      const maxW = 1180 - (34 + 30 + (flag ? 126 : 6)) - (34 + 36 + (outro ? 70 : 0));
      let title, lines, slide;
      if (outro) { title = S.fav.toLocaleUpperCase(tl.lang); lines = Cart.wrap(c, S.favSub, maxW, 30, 700, Cart.TEXT, 1); slide = clamp((st.p - .02) / .25, 0, 1); }
      else { title = String(era.title || '').toLocaleUpperCase(tl.lang); lines = Cart.wrap(c, era.caption, maxW, 30, 700, Cart.TEXT, 2); slide = clamp((local - .3) / .5, 0, 1) * clamp((era.dur - local) / .3, 0, 1); }
      Cart.scroll(c, width, height, { cx: width / 2, bottom: height - 20, title, lines, flag, slide, arrow: outro ? 1 : 0, t });
      if (outro) Cart.subscribe(c, width, S.sub.toLocaleUpperCase(tl.lang), clamp((st.p - .12) / .3, 0, 1), t);
    }
    // Cảnh minh hoạ có người chèn giữa giai đoạn: khung ảnh nảy ra giữa màn hình, bản đồ tối đi phía sau.
    function toonCutaway(c, st, t) {
      const cut = st.era && st.era.cut;
      if (!cut || !Scenes) return;
      const u = (st.local - cut.at) / cut.dur;
      if (u > 0 && u < 1) Scenes.panel(c, { kind: cut.kind, u, t, shout: cut.shout, cx: width / 2, cy: 618, w: 1400, h: 540, screenW: width, screenH: height });
    }
    // Chữ dán «BOOM!» / «LAND HO!» bật ra cạnh ký hiệu trận đánh / tàu đến (tín hiệu lấy từ Plan.cuesOf).
    function toonStickers(c, st, pr, t) {
      if (tl.stickerCues === undefined) tl.stickerCues = Plan.cuesOf(tl).filter(q => q.kind === 'sticker');
      for (const q of tl.stickerCues) {
        if (q.era !== st.index) continue;
        const m = st.era.markers[q.marker], age = t - q.t, k = clamp(age / .32, 0, 1), fade = clamp((q.dur - age) / .3, 0, 1);
        if (!m || age < 0 || fade <= 0) continue;
        const [mx, my] = pr.P(m.at[0], m.at[1]);
        const x = clamp(mx + 170, 330, width - 330), y = clamp(my - 130, 400, height - 330);
        c.save(); c.globalAlpha = fade; Cart.sticker(c, q.text, x, y, { k, rot: -.08, size: 84, t }); c.restore();
      }
    }
    function toonIntro(c, st, t) {
      const S = Plan.strings(tl.lang), p = st.p, fade = clamp(1 - (p - .76) / .24, 0, 1), out = 1 - easeOut(clamp((p - .76) / .24, 0, 1));   // chữ nhiều lớp: thoát bằng thu nhỏ, không mờ dần (mờ làm lộ các lớp viền)
      c.save();
      const vg = c.createRadialGradient(width / 2, height * .45, 140, width / 2, height * .45, width * .7); vg.addColorStop(0, `rgba(0,50,110,${.34 * fade})`); vg.addColorStop(1, `rgba(0,40,90,${.08 * fade})`);
      c.fillStyle = vg; c.fillRect(0, 0, width, height);
      const fit = Cart.layout(c, tl.title, 1640, { maxLines: 3, maxSize: 160 }), size = fit.size, lh = Math.round(size * 1.06), n = fit.lines.length, y0 = height * .4 - (n - 1) * lh / 2 + size * .3;
      fit.lines.forEach((ln, i) => {
        const kk = Cart.easeBack(clamp(p / .15 - i * .25, 0, 1)); if (kk <= 0) return;
        const g = Cart.pink(c, -size * .8, size * .15);
        c.save(); c.translate(width / 2, y0 + i * lh); c.rotate(-.03 + i * .012); c.scale(kk * out, kk * out);
        Cart.heavy(c, ln, 0, 0, { kind: 'display', size, fill: i % 2 ? g : Cart.CREAM, stroke: Cart.OUT, sw: Math.max(14, size * .2), shadow: { dx: 0, dy: size * .07, color: 'rgba(0,15,50,.45)' } });
        c.restore();
      });
      if (tl.subtitle) {
        const lines = Cart.wrap(c, tl.subtitle, 880, 30, 700, Cart.TEXT, 2);
        Cart.scroll(c, width, height, { cx: width / 2, bottom: height - 70, title: '', lines, flag: null, slide: clamp((p - .3) / .22, 0, 1) * out, t, center: true });
      }
      c.restore();
    }

    // ---------- Một khung hình ----------
    function setTimeline(next) { tl = next; cache.key = ''; cache.paths.clear(); cache.landKey = ''; }
    // opts.bare: chỉ vẽ bản đồ (không đồng hồ năm, thẻ lời đọc, địa cầu) để làm hình mẫu chủ đề và ảnh bìa. opts.shift: dời bản đồ sang phải (tỉ lệ bề rộng); opts.spanMul: thu nhỏ bản đồ (>1).
    function drawFrame(t, opts = {}) {
      const started = typeof performance !== 'undefined' ? performance.now() : Date.now();
      if (profile) lapAt = performance.now();
      const st = Plan.stateAt(tl, t);
      if (opts.cam) st.cam = opts.cam;
      if (opts.shift || opts.spanMul) { const span = st.cam.span * (opts.spanMul || 1); st.cam = { ...st.cam, span, lon: st.cam.lon - span * (opts.shift || 0) }; }
      const cam = st.cam, pr = projector(cam);
      const key = [cam.lon, cam.lat, cam.span].join(',');   // khóa chính xác (không làm tròn): khung vẽ không phụ thuộc khung nào được vẽ trước nó, nên chia khung cho nhiều cửa sổ vẫn ra đúng một hình
      if (cache.key !== key) { cache.key = key; cache.paths.clear(); cache.landKey = ''; }
      const wasMoving = cache.moving; cache.moving = st.moving;
      if (wasMoving !== st.moving) { cache.paths.clear(); cache.landKey = ''; }
      minD = st.moving ? 3 : 2;
      curT = t;
      const cartoon = toon();
      if (cartoon) Cart.sea(sc, width, height, t, toonTone(st)); else { ocean(sc, t); sparkles(sc, t); }
      lap('ocean', sc);
      const land = landLayer(pr, st.moving); lap('landLayer', land.getContext('2d'));
      sc.drawImage(land, 0, 0, width, height); lap('landBlit', sc);
      if (cartoon) Cart.clouds(sc, width, height, t, .38);
      if (st.era) {
        const local = st.local, parts = partsFor(st);
        const g = clamp((local - GROW_DELAY) / GROW, 0, 1), grow = easeOut(g);
        const group = cartoon ? toonGroup : drawGroup;
        for (const p of parts.removed) group(sc, p.keys, p.realm, pr, { alpha: 1 - clamp(local / 1.1, 0, 1), rise: 1 - clamp(local / .9, 0, 1), pop: opts.pop });
        for (const p of parts.stable) group(sc, p.keys, p.realm, pr, { pop: opts.pop });
        for (const p of parts.added) {
          const b = boxOf(p.keys, pr);
          if (!b) continue;
          const first = bigUnit(p.keys), cl = first && centroidOf(first), c0 = cl ? pr.P(cl[0], cl[1]) : [b.cx, b.cy];
          const R = Math.max(Math.hypot(b.w, b.h) * .75, 40);
          group(sc, p.keys, p.realm, pr, { pop: opts.pop, rise: easeOut(clamp(g * 1.25, 0, 1)), reveal: { cx: c0[0], cy: c0[1], r: R * (cartoon ? Cart.easeBack(g) : grow), p: g, seed: (st.index + 1) * 1.7 } });
        }
        if (!cartoon) clouds(sc, t);
        for (const r of st.era.routes) drawRoute(sc, r, pr, local, t);
        st.era.markers.forEach((m, i) => drawMarker(sc, opts.clean ? { ...m, name: '' } : m, pr, local, i, t));
        const spots = st.era.markers.map(m => pr.P(m.at[0], m.at[1]));
        st.era.realms.forEach(r => {
          if (cartoon) { toonRealm(sc, r, pr, spots, local, t, opts, st.index); return; }
          if ((opts.pop || opts.pops) && opts.clean) { popFace(sc, r, pr, spots, t, opts); return; }
          if (!r.units.length) return;
          const key2 = bigUnit(r.units), cl = key2 && centroidOf(key2), b = boxOf(r.units, pr);
          if (!cl || !b) return;
          const [x, y] = pr.P(cl[0], cl[1]), ub = boxOf([key2], pr) || b, fs = clamp(Math.sqrt(ub.w * ub.h) / 260, .45, 1.15);
          const [ax, ay] = clearSpot(x, y, spots, fs, 70 * fs + 20);
          const k = (local - GROW_DELAY - GROW * .6) / 1.3;
          if (r.face && !opts.clean) flagAt(sc, ax, ay + 24 * fs, fs, r, t, k);
          if (r.name && !opts.clean && Math.min(b.w, b.h) > 60 && k > .5) tag(sc, r.name, ax, ay + 24 * fs + (r.face ? 34 * fs + 8 : 0), clamp(easeOut((k - .5) / .5), 0, 1) * clamp(fs + .35, .8, 1.15), clamp(Math.min(b.w, b.h) / 11, 17, 26));
        });
      }
      lap('realms+markers', sc);
      // ghép lên khung ra: thu phóng nhẹ (Ken Burns) rồi vẽ giao diện
      ctx.save();
      const zoom = opts.bare ? 1 : st.phase === 'era' ? 1 + .035 * easeInOut(st.p) : st.phase === 'outro' ? 1.035 : 1;
      ctx.fillStyle = '#000'; ctx.fillRect(0, 0, width, height);
      ctx.translate(width / 2, CY); ctx.scale(zoom, zoom); ctx.translate(-width / 2, -CY);
      ctx.drawImage(sceneCv, 0, 0);
      ctx.restore();
      lap('compose', ctx);
      if (!cartoon) finish(ctx);
      if (opts.bare) { stats.frames++; stats.ms += (typeof performance !== 'undefined' ? performance.now() : Date.now()) - started; return st; }
      if (cartoon && st.era && st.phase === 'era') { toonStickers(ctx, st, pr, t); toonCutaway(ctx, st, t); }
      if (st.phase === 'intro') { if (cartoon) toonIntro(ctx, st, t); else drawIntro(ctx, st, t); }
      else if (st.era && cartoon) toonHud(ctx, st, t);
      else if (st.era) {
        const local = st.local, out = st.phase === 'outro' ? 1 - easeOut(st.p / .4) : 1;
        const counters = Plan.counterAt(st), top = easeOut(local / .8) * out;
        globe(ctx, st.cam, st.era, top, t);
        rail(ctx, st, top);
        const plate = odometer(ctx, counters.yearF, top);
        ribbon(ctx, st.era.title, 44, plate.y + 14, easeOut((local - .2) / .6) * out, plate.w - 40);
        population(ctx, counters.pop, 50, plate.y + 118, easeOut((local - .45) / .6) * out);
        if (st.phase !== 'outro') captionCard(ctx, st.era, Plan.subtitleAt(st.era, local), easeOut((local - .3) / .6) * easeOut(clamp((st.era.dur - local) / .35, 0, 1)));
        else drawOutro(ctx, st);
      }
      lap('hud', ctx);
      const done = typeof performance !== 'undefined' ? performance.now() : Date.now();
      stats.frames++; stats.ms += done - started;
      return st;
    }
    function drawIntro(c, st, t) {
      const a = clamp(1 - (st.p - .74) / .26, 0, 1), rise = easeOut(st.p / .35);
      c.save();
      const vg = c.createRadialGradient(width / 2, height * .5, 120, width / 2, height * .5, width * .62); vg.addColorStop(0, `rgba(6,16,30,${.78 * a})`); vg.addColorStop(1, `rgba(6,16,30,${.3 * a})`);
      c.fillStyle = vg; c.fillRect(0, 0, width, height);
      c.globalAlpha = a;
      const fit = titleLayout(c, tl.title, 1560), size = fit.size, lineH = Math.round(size * 1.12);
      compass(c, width / 2, height * (fit.lines.length >= 3 ? .2 : .27) + (1 - rise) * 30, 74, t * .25, rise);   // tiêu đề 3 dòng thì la bàn lên cao hơn để không chạm chữ
      const y = height * (fit.lines.length === 1 ? .54 : fit.lines.length === 2 ? .58 : .6) + (1 - rise) * 40;   // dòng cuối; các dòng trước nằm phía trên
      fit.lines.forEach((ln, k) => text(c, ln, width / 2, y - (fit.lines.length - 1 - k) * lineH, { size, weight: 700, fill: '#f7edd0', halo: 'rgba(8,18,30,.9)', haloW: Math.max(12, size / 6) }));
      c.strokeStyle = GOLD; c.lineWidth = 3; c.beginPath(); c.moveTo(width / 2 - 360 * rise, y + 36); c.lineTo(width / 2 + 360 * rise, y + 36); c.stroke();
      if (tl.subtitle) {
        let sub = 42; c.font = `italic 600 ${sub}px ${SERIF}`;
        while (c.measureText(tl.subtitle).width > 1700 && sub > 26) { sub -= 2; c.font = `italic 600 ${sub}px ${SERIF}`; }
        text(c, tl.subtitle, width / 2, y + 96, { size: sub, weight: 600, style: 'italic', fill: GOLD, halo: 'rgba(8,18,30,.9)', haloW: 9 });
      }
      c.restore();
    }
    function drawOutro(c, st) {
      const a = easeOut(st.p / .6);
      c.save();
      const vg = c.createRadialGradient(width / 2, height * .5, 120, width / 2, height * .5, width * .62); vg.addColorStop(0, `rgba(6,16,30,${.8 * a})`); vg.addColorStop(1, `rgba(6,16,30,${.35 * a})`);
      c.fillStyle = vg; c.fillRect(0, 0, width, height); c.globalAlpha = a;
      compass(c, width / 2, height * .3, 70, curT * .25);
      text(c, Plan.strings(tl.lang).thanks, width / 2, height * .55, { size: 96, weight: 700, fill: '#f7edd0', halo: 'rgba(8,18,30,.9)', haloW: 16 });
      c.strokeStyle = GOLD; c.lineWidth = 3; c.beginPath(); c.moveTo(width / 2 - 300, height * .55 + 34); c.lineTo(width / 2 + 300, height * .55 + 34); c.stroke();
      if (tl.outro) text(c, tl.outro, width / 2, height * .55 + 100, { size: 44, weight: 600, style: 'italic', fill: GOLD, halo: 'rgba(8,18,30,.9)', haloW: 9 });
      c.restore();
    }
    // Thời điểm trong giai đoạn i khi lãnh thổ đã mọc đủ và máy quay đã dừng.
    function stillTime(i) {
      const e = tl.eras[Math.max(0, Math.min(tl.eras.length - 1, i))];
      return e.start + Math.min(Math.max(.5, e.dur - .8), 6.2);   // máy quay đã bay xong, lãnh thổ đã mọc đủ
    }
    // Hình mẫu chủ đề: chỉ bản đồ của giai đoạn i.
    function drawStill(i, opts = {}) { return drawFrame(stillTime(i), { bare: true, shift: opts.shift || 0, spanMul: opts.spanMul || 1 }); }
    // ---------- Ảnh bìa 16:9 «giật mắt» ----------
    // Bản đồ phóng to vào lãnh thổ chính, màu rực; hai năm RẤT TO viền đen; mặt nhân vật vẽ thẳng lên lãnh thổ.
    const IMPACT = '"MapImpact", "Impact", "Arial Black", "Segoe UI Black", "Inter", "DejaVu Sans", sans-serif';
    const unMer = y => (2 * Math.atan(Math.exp(y)) - Math.PI / 2) / DEG;
    // Chỉnh máy quay cho các ô `keys` vừa khít khung chữ nhật (tx, ty là tâm; tw, th là cỡ), không zoom ra xa quá máy quay của giai đoạn.
    function fitCam(cam, keys, tx, ty, tw, th, minSpan = 0, farMul = 0) {
      let c = { ...cam }; const far = farMul ? Math.min(cam.span * farMul, Math.max(cam.span, 360)) : cam.span * (keys.length > 1 ? 1.35 : 1), near = Math.max(4, minSpan);   // near cố định: giai đoạn cuối có thể có view toàn cầu, nếu giới hạn theo view thì bản đồ nước nhỏ bị bé tí
      for (let it = 0; it < 3; it++) {
        const b0 = boxOf(keys, projector(c), true);
        if (!b0 || b0.w < 1 || b0.h < 1) return c;
        c = { ...c, span: clamp(c.span * Math.max(b0.w / tw, b0.h / th), near, far) };
        const pr = projector(c), b = boxOf(keys, pr, true);
        c = { ...c, lon: c.lon + (b.cx - tx) / pr.S / DEG, lat: unMer(merY(c.lat) + (ty - b.cy) / pr.S) };
      }
      return c;
    }
    // Lõi của một thế lực để lấy khung hình ảnh bìa: bỏ đơn vị có hộp bao vắt kinh tuyến 180 (làm hộp bao phình ra cả thế giới), giữ các đơn vị lớn nhất phủ ~88% diện tích (đủ để không cắt mất đơn vị nào của phần chính).
    function coreKeys(keys) {
      if (keys.length <= 4) return keys;
      const items = keys.map(k => { const u = geo.units.get(k), bb = u && u.bb; return bb ? { k, w: bb[2] - bb[0], a: (bb[2] - bb[0]) * (bb[3] - bb[1]) } : null; }).filter(x => x && x.w <= 150).sort((p, q) => q.a - p.a);
      if (!items.length) return keys;
      const total = items.reduce((t, x) => t + x.a, 0); let acc = 0; const out = [];
      for (const x of items) { out.push(x.k); acc += x.a; if (acc >= total * .88 && out.length >= 3) break; }
      return out;
    }
    let thumbCv = null, thumbCv2 = null;
    function rays(c, x, y, rot, color, alpha, n = 18) {
      c.save(); c.translate(x, y); c.rotate(rot);
      for (let k = 0; k < n; k++) {
        const a0 = k / n * TAU, a1 = a0 + TAU / n * .5, R = Math.hypot(width, height);
        const g = c.createRadialGradient(0, 0, 40, 0, 0, R * .75); g.addColorStop(0, `rgba(${color},${alpha})`); g.addColorStop(1, `rgba(${color},0)`);
        c.fillStyle = g; c.beginPath(); c.moveTo(0, 0); c.lineTo(Math.cos(a0) * R, Math.sin(a0) * R); c.lineTo(Math.cos(a1) * R, Math.sin(a1) * R); c.closePath(); c.fill();
      }
      c.restore();
    }
    // Năm RẤT TO kiểu thumbnail (số + BC/AD nhỏ bên phải), viền đen dày; fit: bề rộng tối đa.
    function bigYear(c, year, cx, baseY, { maxW = 700, maxSize = 250, gold = false, rot = -.03 } = {}) {
      const S = Plan.strings(tl.lang), yr = Math.round(year), num = String(Math.abs(yr)), suf = yr < 0 ? S.bcTag : yr < 1000 ? S.adTag : '';
      const meas = (str, size) => { c.save(); c.font = `900 ${size}px ${IMPACT}`; const w = c.measureText(str).width; c.restore(); return w; };
      const unit = meas(num, 100) + (suf ? meas(suf, 38) + 14 : 0), size = Math.min(maxSize, maxW / unit * 100), sw = size * .2;
      const numW = meas(num, size), sufW = suf ? meas(suf, size * .38) : 0, total = numW + (suf ? sufW + size * .14 : 0);
      c.save(); c.translate(cx, baseY); c.rotate(rot); c.lineJoin = 'round'; c.miterLimit = 2; c.textBaseline = 'alphabetic'; c.textAlign = 'left';
      const parts = [[num, -total / 2, size]]; if (suf) parts.push([suf, -total / 2 + numW + size * .14, size * .38]);
      for (const [str, x, sz] of parts) {
        c.font = `900 ${sz}px ${IMPACT}`;
        c.save(); c.translate(0, sz * .07); c.strokeStyle = 'rgba(0,0,0,.55)'; c.lineWidth = sw * (sz / size) * 1.12; c.shadowColor = 'rgba(0,0,0,.6)'; c.shadowBlur = sz * .12; c.strokeText(str, x, 0); c.restore();
        c.strokeStyle = '#0b0705'; c.lineWidth = sw * (sz / size); c.strokeText(str, x, 0);
        const g = c.createLinearGradient(0, -sz * .78, 0, 0);
        if (gold) { g.addColorStop(0, '#fff27a'); g.addColorStop(.55, '#ffd21f'); g.addColorStop(1, '#ff9d0a'); } else { g.addColorStop(0, '#ffffff'); g.addColorStop(1, '#d9e4f7'); }
        c.fillStyle = g; c.fillText(str, x, 0);
      }
      c.restore();
    }
    // «Trước / Sau» (kiểu thumbnail duy nhất): màn hình chia đôi bằng vết nứt tia sét. Trái = giai đoạn đầu (nhạt, nhân vật bình thản);
    // phải = giai đoạn cuối (rực, nhân vật choáng ngợp, đội vương miện). Hai bên cùng tỉ lệ bản đồ nên thấy lãnh thổ lớn lên; mỗi bên một năm RẤT TO.
    function drawBeforeAfter() {
      const c = ctx, W2 = width, H2 = height, n = tl.eras.length, i0 = 0, i1 = n - 1, e0 = tl.eras[i0], e1 = tl.eras[i1];
      const big = e => (e.realms || []).filter(r => r.units && r.units.length).sort((a, b) => b.units.length - a.units.length)[0] || null;
      const A = big(e1) || big(e0), keys = A ? A.units : [];
      // Thế lực "diễn viên": bên phải là thế lực lớn nhất hiện tại, bên trái là CHÍNH thế lực đó thời xưa (nếu chưa có thì thế lực lớn nhất thời đó).
      const L = A ? (e0.realms || []).find(r => r.name === A.name && r.units && r.units.length) || big(e0) : null;
      const popL = L ? { name: L.name, color: '#2e6bff', glow: '#a8dcff', mood: 'calm', t: 1.3, maxR: 92, vis: [W2 * .03, H2 * .27, W2 * .47, H2 * .97] } : null;
      const popR = A ? { name: A.name, color: '#ff2f3c', glow: '#ffc24a', mood: 'shock', t: 1.3, maxR: 92, vis: [W2 * .53, H2 * .27, W2 * .97, H2 * .97], star: isVietnam(A.name) } : null;   // Việt Nam: có sao vàng của quốc kỳ
      const t0 = stillTime(i0), t1 = stillTime(i1), base = Plan.stateAt(tl, t1).cam;
      // Bên phải: PHÓNG TO vừa khít thế lực hiện tại (phần lãnh thổ chính chiếm ~90% bề rộng nửa ảnh / ~70% chiều cao, như thumbnail «so sánh» của các kênh bản đồ). Bên trái: vừa khít thế lực thời xưa nhưng không nhỏ hơn 27% khung bên phải (xưa nhỏ thì phóng gần hơn, để bản đồ vẫn TO và đọc được).
      const camR = keys.length ? fitCam(base, coreKeys(keys), W2 * .74, H2 * .585, W2 * .45, H2 * .68, 0, 4) : { ...base, span: base.span * .8 };
      const camL = L ? fitCam(base, coreKeys(L.units), W2 * .26, H2 * .585, W2 * .45, H2 * .68, camR.span * .27, 4) : keys.length ? fitCam(base, coreKeys(keys), W2 * .26, H2 * .585, W2 * .45, H2 * .68, 0, 4) : { ...camR };   // chưa có thế lực xưa: cùng vùng đất đó ở nửa trái (đất trống), không phải một vùng khác
      thumbCv = thumbCv || mkSize(W2, H2); thumbCv2 = thumbCv2 || mkSize(W2, H2);
      drawFrame(t0, { bare: true, clean: true, cam: camL, pop: popL });
      { const x = thumbCv.getContext('2d'); x.clearRect(0, 0, W2, H2); x.drawImage(canvas, 0, 0); }
      starSpot = null;
      drawFrame(t1, { bare: true, clean: true, cam: camR, pop: popR });
      { const x = thumbCv2.getContext('2d'); x.clearRect(0, 0, W2, H2); x.drawImage(canvas, 0, 0); }
      // đường nứt: các điểm tâm vết nứt (tỉ lệ khung)
      const P = [[.548, -.03], [.505, .2], [.542, .215], [.488, .47], [.526, .485], [.468, .75], [.502, .765], [.452, 1.03]].map(([x, y]) => [x * W2, y * H2]);
      const crack = () => { c.beginPath(); P.forEach(([x, y], k) => k ? c.lineTo(x, y) : c.moveTo(x, y)); };
      const half = side => { c.beginPath(); c.moveTo(side < 0 ? -20 : W2 + 20, P[0][1]); P.forEach(([x, y]) => c.lineTo(x, y)); c.lineTo(side < 0 ? -20 : W2 + 20, P[P.length - 1][1]); c.closePath(); };
      const sat = toon() ? 1.2 : 1.6;
      c.save(); half(-1); c.clip();   // TRÁI: nhạt, hơi lạnh
      c.filter = 'saturate(.9) contrast(1.06) brightness(.98)'; c.drawImage(thumbCv, 0, 0); c.filter = 'none';
      c.fillStyle = 'rgba(30,70,140,.12)'; c.fillRect(0, 0, W2, H2); c.restore();
      c.save(); half(1); c.clip();   // PHẢI: rực, vầng sáng ấm
      c.filter = `saturate(${sat}) contrast(1.1) brightness(1.02)`; c.drawImage(thumbCv2, 0, 0); c.filter = 'none';
      c.globalCompositeOperation = 'screen'; rays(c, W2 * .74, H2 * .52, .2, '255,230,170', .14);
      const gl = c.createRadialGradient(W2 * .74, H2 * .52, 30, W2 * .74, H2 * .52, W2 * .42); gl.addColorStop(0, 'rgba(255,170,90,.2)'); gl.addColorStop(1, 'rgba(255,120,40,0)');
      c.fillStyle = gl; c.fillRect(0, 0, W2, H2); c.restore();
      // tối viền + tối đỉnh cho năm, tối đáy cho nhân vật
      c.save();
      const vg = c.createRadialGradient(W2 / 2, H2 * .5, H2 * .34, W2 / 2, H2 * .5, W2 * .68); vg.addColorStop(0, 'rgba(0,0,0,0)'); vg.addColorStop(1, 'rgba(4,8,20,.5)');
      c.fillStyle = vg; c.fillRect(0, 0, W2, H2);
      const tg = c.createLinearGradient(0, 0, 0, H2 * .42); tg.addColorStop(0, 'rgba(4,8,20,.55)'); tg.addColorStop(1, 'rgba(4,8,20,0)'); c.fillStyle = tg; c.fillRect(0, 0, W2, H2 * .42);
      const bt = c.createLinearGradient(0, H2 * .62, 0, H2); bt.addColorStop(0, 'rgba(4,8,20,0)'); bt.addColorStop(1, 'rgba(4,8,20,.5)'); c.fillStyle = bt; c.fillRect(0, H2 * .62, W2, H2 * .38);
      c.restore();
      if (starSpot) drawStar(c, starSpot);   // sao vàng quốc kỳ (Việt Nam)
      // vết nứt tia sét: viền đen có quầng vàng, lõi trắng
      c.save(); c.lineJoin = 'miter'; c.miterLimit = 8; c.lineCap = 'butt';
      crack(); c.shadowColor = 'rgba(255,214,80,.95)'; c.shadowBlur = 46; c.strokeStyle = '#0b0705'; c.lineWidth = 50; c.stroke(); c.shadowColor = 'transparent';
      crack(); c.strokeStyle = '#ffffff'; c.lineWidth = 28; c.stroke();
      crack(); c.strokeStyle = '#ffe9a0'; c.lineWidth = 9; c.stroke();
      c.restore();
      // năm RẤT TO hai bên
      bigYear(c, e0.year, W2 * .25, 232, { maxW: W2 * .38, rot: -.035 });
      bigYear(c, e1.year, W2 * .75, 232, { maxW: W2 * .38, gold: true, rot: .03 });
      // mặt nhân vật nằm TRÊN lãnh thổ (popFace): trái bình thản, phải choáng ngợp
    }
    // Ảnh bìa: MỘT kiểu duy nhất «Trước / Sau» (giai đoạn đầu | giai đoạn cuối, bản đồ phóng to vào lãnh thổ chính, năm RẤT TO).
    function drawThumbnail() { drawBeforeAfter(); }
    return { setTimeline, drawFrame, drawStill, drawThumbnail, stillTime, stats, projector, moodOf: (r, idx) => reaction(r, idx), profile: p => { profile = p; }, get timeline() { return tl; } };
  }
  return { create, FONT: SERIF, GROW, FINE_SPAN, pigment, titleLayout };
});
