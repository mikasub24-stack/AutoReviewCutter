/* Tab «Bản đồ lịch sử»: kiểu «hoạt hình sáng» (cartoon) — biển xanh phẳng, đất xanh lá, thế lực có đôi mắt to, số năm vàng,
   thanh thời gian có huy hiệu, cuộn giấy ở dưới, chữ dán, nút Subscribe. Chỉ chứa các hàm vẽ thuần trên canvas 2D (không phụ thuộc bản đồ),
   nên dùng chung cho khung xem thử, cửa sổ ẩn dựng video và kiểm thử. maphist-draw.js gọi các hàm này khi timeline.theme === 'cartoon'. */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.maphistCartoon = factory();
})(typeof window !== 'undefined' ? window : globalThis, function () {
  'use strict';
  const TAU = Math.PI * 2;
  const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
  const lerp = (a, b, t) => a + (b - a) * t;
  const easeOut = t => 1 - Math.pow(1 - clamp(t, 0, 1), 3);
  const easeBack = t => { t = clamp(t, 0, 1); const c1 = 1.9, c3 = c1 + 1; return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2); };
  const HEAVY = '"MapImpact","Impact","Arial Black","Segoe UI Black","Inter","DejaVu Sans",sans-serif';
  const TEXT = '"MapLora","Lora",Georgia,"DejaVu Serif",serif';
  const INK = '#171009', GOLD = '#ffd23f', GOLD_DEEP = '#f0a500', BROWN = '#4a2c0e';
  const hexRgb = h => { const m = /^#([0-9a-f]{6})$/i.exec(h || ''); const n = m ? parseInt(m[1], 16) : 0; return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; };
  const mixHex = (a, b, k) => { const x = hexRgb(a), y = hexRgb(b); return 'rgb(' + x.map((v, i) => Math.round(v + (y[i] - v) * k)).join(',') + ')'; };
  const lum = hex => { const [r, g, b] = hexRgb(hex); return (.3 * r + .59 * g + .11 * b) / 255; };

  // ---------- Chữ ----------
  // Chữ dày viền đậm. fill có thể là màu hoặc CanvasGradient; shadow = { dx, dy, color } đổ bóng cùng viền.
  function heavy(c, str, x, y, o = {}) {
    const { size = 40, fill = '#fff', stroke = INK, sw = 0, align = 'center', spacing = 0, shadow = null, base = 'alphabetic', alpha = 1, font = HEAVY, weight = 900, style = '' } = o;
    c.save(); c.globalAlpha *= alpha; c.font = `${style} ${weight} ${size}px ${font}`.trim(); c.textAlign = align; c.textBaseline = base; c.lineJoin = 'round'; c.miterLimit = 2;
    if ('letterSpacing' in c) c.letterSpacing = spacing + 'px';
    if (shadow) { c.save(); c.translate(shadow.dx || 0, shadow.dy || 0); c.fillStyle = c.strokeStyle = shadow.color; if (sw) { c.lineWidth = sw; c.strokeText(str, x, y); } c.fillText(str, x, y); c.restore(); }
    if (sw) { c.lineWidth = sw; c.strokeStyle = stroke; c.strokeText(str, x, y); }
    c.fillStyle = fill; c.fillText(str, x, y); c.restore();
  }
  function measure(c, str, size, weight = 900, font = HEAVY, spacing = 0, style = '') {
    c.save(); c.font = `${style} ${weight} ${size}px ${font}`.trim(); if ('letterSpacing' in c) c.letterSpacing = spacing + 'px'; const w = c.measureText(str).width; c.restore(); return w;
  }
  function wrap(c, str, maxW, size, weight = 600, font = TEXT, maxLines = 2) {
    const words = String(str || '').trim().split(/\s+/).filter(Boolean), lines = [];
    let line = '';
    for (const w of words) {
      const next = line ? line + ' ' + w : w;
      if (line && measure(c, next, size, weight, font) > maxW) { lines.push(line); line = w; } else line = next;
    }
    if (line) lines.push(line);
    if (lines.length > maxLines) { const keep = lines.slice(0, maxLines); let last = keep[maxLines - 1]; while (last.length > 3 && measure(c, last + '…', size, weight, font) > maxW) last = last.slice(0, -1); keep[maxLines - 1] = last.replace(/[\s,;:]+$/, '') + '…'; return keep; }
    return lines;
  }
  const groupDigits = (n, sep) => String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, sep);


  // Chia tiêu đề thành 1–3 dòng cân đối bằng chữ dày; chọn cỡ chữ lớn nhất cho vừa maxW (ít dòng hơn được ưu tiên nếu chữ còn đủ to).
  function layout(c, title, maxW, { maxLines = 3, maxSize = 150, minSize = 56 } = {}) {
    const words = String(title || '').trim().split(/\s+/).filter(Boolean);
    if (!words.length) return { lines: [''], size: maxSize };
    const W100 = s => measure(c, s, 100), cuts = n => { const out = []; const go = (from, left, acc) => { if (left === 1) { out.push([...acc, words.slice(from).join(' ')]); return; } for (let i = from + 1; i <= words.length - left + 1; i++) go(i, left - 1, [...acc, words.slice(from, i).join(' ')]); }; go(0, n, []); return out; };
    let best = null;
    for (let n = 1; n <= Math.min(maxLines, words.length); n++) {
      let pick = null;
      for (const lines of cuts(n)) { const widest = Math.max(...lines.map(W100)), nice = lines.slice(0, -1).every(l => /[:–—,]$/.test(l)), cost = widest * (n > 1 && nice ? .92 : 1); if (!pick || cost < pick.cost) pick = { lines, cost, widest }; }
      const size = Math.min(maxSize, Math.floor(maxW * 100 / pick.widest));
      if (!best || (best.size < 96 && size > best.size)) best = { lines: pick.lines, size };
      if (best.size >= 96) break;
    }
    return { lines: best.lines, size: Math.max(minSize, best.size) };
  }

  // ---------- Biển ----------
  // Biển xanh phẳng có chút chuyển sắc, vệt sóng trắng nhỏ trôi chậm. tone 0..1: pha xám xanh cho giai đoạn chiến tranh.
  function sea(c, w, h, t, tone = 0) {
    const g = c.createLinearGradient(0, 0, 0, h); g.addColorStop(0, mixHex('#3bbaf2', '#82b4cf', tone)); g.addColorStop(1, mixHex('#1d9bdf', '#5d98bd', tone));
    c.fillStyle = g; c.fillRect(0, 0, w, h);
    const r = c.createRadialGradient(w * .5, h * .45, 40, w * .5, h * .45, w * .62); r.addColorStop(0, 'rgba(255,255,255,.13)'); r.addColorStop(1, 'rgba(255,255,255,0)');
    c.fillStyle = r; c.fillRect(0, 0, w, h);
    c.save(); c.lineCap = 'round'; c.lineWidth = 4;
    for (let row = 0; row < 9; row++) for (let i = 0; i < 9; i++) {
      const seed = row * 17 + i * 31, x0 = ((i * 262 + (row % 2) * 131 + (seed % 90) + t * (9 + (row % 3) * 4)) % (w + 300)) - 150, y0 = 64 + row * 118 + ((seed * 7) % 46);
      const a = .13 + .11 * Math.sin(t * 1.3 + seed);
      if (a < .04) continue;
      c.strokeStyle = `rgba(255,255,255,${a})`; c.beginPath(); c.moveTo(x0, y0); c.quadraticCurveTo(x0 + 16, y0 - 10, x0 + 32, y0); c.quadraticCurveTo(x0 + 48, y0 + 10, x0 + 64, y0); c.stroke();
    }
    c.restore();
  }
  // Mây phẳng trôi chậm trên mặt biển (rất nhạt, nằm dưới các thế lực).
  function clouds(c, w, h, t, alpha = .5) {
    c.save(); c.fillStyle = `rgba(255,255,255,${alpha})`;
    for (let i = 0; i < 5; i++) {
      const x = ((i * 523 + t * (13 + i * 3)) % (w + 700)) - 350, y = 150 + (i * 197) % 760, s = .8 + (i % 3) * .3;
      c.save(); c.translate(x, y); c.scale(s, s);
      c.beginPath(); c.arc(0, 0, 44, 0, TAU); c.arc(52, -16, 54, 0, TAU); c.arc(112, 0, 42, 0, TAU); c.roundRect(-44, 0, 200, 40, 20); c.fill(); c.restore();
    }
    c.restore();
  }
  function rainCloud(c, x, y, s, t, k = 1) {
    if (k <= 0) return;
    c.save(); c.translate(x, y + Math.sin(t * 1.4) * 4); c.scale(s * k, s * k); c.lineJoin = 'round';
    c.fillStyle = '#7b8794'; c.strokeStyle = INK; c.lineWidth = 6;
    c.beginPath(); c.moveTo(-60, 28); c.arc(-46, 6, 30, Math.PI * .5, Math.PI * 1.15); c.arc(-8, -22, 40, Math.PI * 1.05, Math.PI * 1.9); c.arc(40, -2, 32, Math.PI * 1.55, Math.PI * .45); c.lineTo(-60, 28); c.closePath(); c.fill(); c.stroke();
    c.strokeStyle = 'rgba(180,225,255,.9)'; c.lineWidth = 4; c.lineCap = 'round';
    for (let i = 0; i < 4; i++) { const ph = (t * 1.6 + i * .27) % 1; c.beginPath(); c.moveTo(-38 + i * 26, 40 + ph * 26); c.lineTo(-42 + i * 26, 52 + ph * 26); c.stroke(); }
    c.restore();
  }

  // ---------- Đôi mắt to của thế lực ----------
  // R = bán kính mỗi mắt; k = độ phóng ra (đã easeBack); lid = màu mí (lấy từ màu cờ).
  function eyes(c, x, y, R, o = {}) {
    const { mood = 'happy', t = 0, seed = 0, k = 1, lid = '#c0392b' } = o;
    if (k <= 0.01) return;
    const iris = ['#2f78c4', '#4a2f1c', '#2a8a57', '#6a4aa8'][Math.floor(seed * 10) % 4];
    const ph = (t + seed * 1.3) % 3.9, blink = ph < .15 ? Math.sin(ph / .15 * Math.PI) : 0;
    const lx = Math.sin(t * .9 + seed) * R * .2, ly = Math.cos(t * .6 + seed) * R * .1 + (mood === 'sad' || mood === 'tired' ? R * .2 : 0);
    const lidFill = lum(lid) > .85 ? '#9aa3ad' : lid;
    c.save(); c.translate(x, y + Math.sin(t * 2.3 + seed) * R * .04); c.scale(k, k); c.lineJoin = 'round'; c.lineCap = 'round';
    const gap = R * 1.04, lw = Math.max(2.6, R * .13);
    for (const sx of [-1, 1]) {
      const ex = sx * gap, inner = -sx;      // inner = hướng về giữa hai mắt
      const ry = Math.max(R * .09, R * (1 - blink * .93));
      c.save(); c.translate(ex, 0);
      c.beginPath(); c.ellipse(0, 0, R, ry, 0, 0, TAU); c.fillStyle = '#fff'; c.fill(); c.save(); c.clip();
      const sh = c.createLinearGradient(0, -R, 0, R); sh.addColorStop(0, 'rgba(60,80,110,.22)'); sh.addColorStop(.35, 'rgba(60,80,110,0)'); c.fillStyle = sh; c.fillRect(-R, -R, R * 2, R * 2);
      c.fillStyle = iris; c.beginPath(); c.arc(lx, ly, R * .56, 0, TAU); c.fill();
      c.fillStyle = '#0a0f1a'; c.beginPath(); c.arc(lx, ly, R * .32, 0, TAU); c.fill();
      c.fillStyle = '#fff'; c.beginPath(); c.arc(lx - R * .18, ly - R * .2, R * .16, 0, TAU); c.fill(); c.beginPath(); c.arc(lx + R * .16, ly + R * .18, R * .07, 0, TAU); c.fill();
      // mí mắt theo tâm trạng: [độ cao mép mí phía trong, phía ngoài] (đơn vị R, âm = lên cao)
      const lids = { angry: [.1, -.7], tired: [-.15, .12], sad: [-.72, .02], calm: [-.5, -.5], proud: [-.62, -.62] }[mood];
      if (lids && ry > R * .3) {
        c.beginPath(); c.moveTo(inner * R * 1.3, lids[0] * R); c.lineTo(-inner * R * 1.3, lids[1] * R); c.lineTo(-inner * R * 1.3, -R * 1.4); c.lineTo(inner * R * 1.3, -R * 1.4); c.closePath();
        c.fillStyle = lidFill; c.fill(); c.strokeStyle = INK; c.lineWidth = lw; c.beginPath(); c.moveTo(inner * R * 1.3, lids[0] * R); c.lineTo(-inner * R * 1.3, lids[1] * R); c.stroke();
      }
      c.restore();
      c.beginPath(); c.ellipse(0, 0, R, ry, 0, 0, TAU); c.strokeStyle = INK; c.lineWidth = lw; c.stroke();
      if (mood === 'happy' || mood === 'proud') { c.beginPath(); c.moveTo(-R * .95, -R * (1.28 - (mood === 'proud' ? .1 : 0))); c.quadraticCurveTo(0, -R * 1.78, R * .95, -R * 1.3 - (sx > 0 && mood === 'proud' ? R * .16 : 0)); c.lineWidth = lw * 1.1; c.stroke(); }
      if (mood === 'sad') { const d = (t * .7 + seed) % 1; c.fillStyle = 'rgba(150,215,255,.95)'; c.lineWidth = lw * .5; c.beginPath(); c.ellipse(inner * R * .4, R + 4 + d * R * .8, R * .13, R * .22, 0, 0, TAU); c.fill(); c.stroke(); }
      c.restore();
    }
    const my = R * 1.62, mw = R * .62;
    c.strokeStyle = INK; c.lineWidth = lw; c.fillStyle = '#7a1f16';
    if (mood === 'happy') {
      c.beginPath(); c.moveTo(-mw, my - 2); c.quadraticCurveTo(0, my + R * .95, mw, my - 2); c.closePath(); c.fill(); c.save(); c.clip();
      c.fillStyle = '#fff'; c.fillRect(-mw, my - 4, mw * 2, R * .24); c.fillStyle = '#ff7a8a'; c.beginPath(); c.ellipse(0, my + R * .62, mw * .5, R * .28, 0, 0, TAU); c.fill(); c.restore();
      c.beginPath(); c.moveTo(-mw, my - 2); c.quadraticCurveTo(0, my + R * .95, mw, my - 2); c.closePath(); c.stroke();
    } else if (mood === 'angry' || mood === 'sad') { c.beginPath(); c.moveTo(-mw, my + R * .12); c.quadraticCurveTo(0, my - R * .28, mw, my + R * .12); c.stroke(); }
    else if (mood === 'tired') { c.beginPath(); c.moveTo(-mw * .7, my); c.lineTo(mw * .7, my + 2); c.stroke(); }
    else { c.beginPath(); c.moveTo(-mw, my); c.quadraticCurveTo(0, my + R * (mood === 'proud' ? .42 : .3), mw * (mood === 'proud' ? 1.2 : 1), my - (mood === 'proud' ? R * .14 : 0)); c.stroke(); }
    c.restore();
  }

  // ---------- Huy hiệu trên thanh thời gian ----------
  const ICONS = {
    sail(c) { c.beginPath(); c.moveTo(-17, 6); c.lineTo(17, 6); c.lineTo(11, 15); c.lineTo(-11, 15); c.closePath(); c.fill(); c.beginPath(); c.moveTo(1, -18); c.lineTo(14, 3); c.lineTo(1, 3); c.closePath(); c.fill(); c.beginPath(); c.moveTo(-2, -12); c.lineTo(-13, 3); c.lineTo(-2, 3); c.closePath(); c.fill(); },
    crown(c) { c.beginPath(); c.moveTo(-15, 11); c.lineTo(-18, -9); c.lineTo(-8, 0); c.lineTo(0, -14); c.lineTo(8, 0); c.lineTo(18, -9); c.lineTo(15, 11); c.closePath(); c.fill(); },
    swords(c) { c.lineCap = 'round'; c.strokeStyle = c.fillStyle; c.lineWidth = 5; c.beginPath(); c.moveTo(-14, -14); c.lineTo(11, 11); c.moveTo(14, -14); c.lineTo(-11, 11); c.stroke(); c.lineWidth = 4; c.beginPath(); c.moveTo(-15, 5); c.lineTo(-5, 15); c.moveTo(15, 5); c.lineTo(5, 15); c.stroke(); },
    star(c) { c.beginPath(); for (let i = 0; i < 10; i++) { const r = i % 2 ? 7.5 : 18, a = -Math.PI / 2 + i * Math.PI / 5; c.lineTo(Math.cos(a) * r, Math.sin(a) * r + 1); } c.closePath(); c.fill(); },
    flag(c) { c.fillRect(-12, -17, 4, 34); c.beginPath(); c.moveTo(-8, -16); c.quadraticCurveTo(2, -10, 8, -16); c.quadraticCurveTo(14, -19, 17, -15); c.lineTo(17, 0); c.quadraticCurveTo(11, 3, 8, -1); c.quadraticCurveTo(2, -5, -8, 0); c.closePath(); c.fill(); },
    scroll(c) { c.beginPath(); c.roundRect(-12, -14, 24, 28, 3); c.fill(); c.beginPath(); c.ellipse(-12, -14, 4, 4, 0, 0, TAU); c.ellipse(12, 14, 4, 4, 0, 0, TAU); c.fill(); c.globalCompositeOperation = 'destination-out'; c.fillRect(-7, -6, 14, 3); c.fillRect(-7, 0, 14, 3); c.fillRect(-7, 6, 9, 3); c.globalCompositeOperation = 'source-over'; },
    castle(c) { c.beginPath(); c.rect(-16, -4, 32, 20); c.fill(); for (const dx of [-16, -6, 4, 12]) c.fillRect(dx, -12, 5, 9); c.globalCompositeOperation = 'destination-out'; c.beginPath(); c.moveTo(-5, 16); c.lineTo(-5, 7); c.arc(0, 7, 5, Math.PI, 0); c.lineTo(5, 16); c.fill(); c.globalCompositeOperation = 'source-over'; },
    person(c) { c.beginPath(); c.arc(0, -8, 8, 0, TAU); c.fill(); c.beginPath(); c.moveTo(-15, 17); c.quadraticCurveTo(-15, 2, 0, 2); c.quadraticCurveTo(15, 2, 15, 17); c.closePath(); c.fill(); },
    rocket(c) { c.beginPath(); c.moveTo(0, -18); c.quadraticCurveTo(11, -6, 8, 10); c.lineTo(-8, 10); c.quadraticCurveTo(-11, -6, 0, -18); c.fill(); c.beginPath(); c.moveTo(-8, 3); c.lineTo(-16, 15); c.lineTo(-7, 11); c.closePath(); c.moveTo(8, 3); c.lineTo(16, 15); c.lineTo(7, 11); c.closePath(); c.fill(); c.beginPath(); c.moveTo(-4, 13); c.lineTo(0, 20); c.lineTo(4, 13); c.closePath(); c.fill(); }
  };
  const ICON_NAMES = Object.keys(ICONS);
  function medal(c, x, y, r, icon, { on = true, pulse = 0 } = {}) {
    const s = 1 + .32 * Math.sin(clamp(pulse, 0, 1) * Math.PI);
    c.save(); c.translate(x, y); c.scale(s, s); c.lineJoin = 'round';
    c.fillStyle = 'rgba(0,30,60,.28)'; c.beginPath(); c.ellipse(0, r * .22 + 2, r * 1.02, r * .96, 0, 0, TAU); c.fill();
    const rim = c.createLinearGradient(-r, -r, r, r); rim.addColorStop(0, on ? '#ffe688' : '#9a9886'); rim.addColorStop(1, on ? '#d89000' : '#5b594a');
    c.fillStyle = rim; c.strokeStyle = '#2f1b0a'; c.lineWidth = 4; c.beginPath(); c.arc(0, 0, r, 0, TAU); c.fill(); c.stroke();
    const face = c.createLinearGradient(0, -r, 0, r); face.addColorStop(0, on ? '#ffd84e' : '#807e6a'); face.addColorStop(1, on ? '#f2a900' : '#615f4f');
    c.fillStyle = face; c.strokeStyle = on ? 'rgba(120,70,0,.55)' : 'rgba(30,28,20,.5)'; c.lineWidth = 2; c.beginPath(); c.arc(0, 0, r * .8, 0, TAU); c.fill(); c.stroke();
    c.strokeStyle = 'rgba(255,255,255,.5)'; c.lineWidth = 3; c.beginPath(); c.arc(0, 0, r * .66, Math.PI * 1.08, Math.PI * 1.55); c.stroke();
    c.scale(r / 35 * .9, r / 35 * .9); c.fillStyle = on ? BROWN : 'rgba(25,24,18,.62)';
    c.save(); (ICONS[icon] || ICONS.star)(c); c.restore();
    c.restore();
  }
  // Thanh thời gian trên đỉnh: nền nâu, phần đã qua vàng, núm trắng, các huy hiệu có năm nhỏ phía trên.
  function timeline(c, { ms, pos, prog, slide, t, durOf, startLabel = '', x0 = 345, x1 = 1575, y = 97, r = 32 }) {
    if (!ms.length || slide <= 0) return;
    const n = ms.length, pad = 27, mx = i => n === 1 ? (x0 + x1) / 2 : x0 + pad + (x1 - x0 - pad * 2) * i / (n - 1), px = x0 + pad + (x1 - x0 - pad * 2) * prog;
    c.save(); c.translate(0, -(1 - slide) * 150); c.lineCap = 'round';
    if (startLabel) heavy(c, startLabel, x0 - 16, y + 8, { size: 22, align: 'right', sw: 7, spacing: 0 });
    c.strokeStyle = 'rgba(0,30,60,.3)'; c.lineWidth = 20; c.beginPath(); c.moveTo(x0, y + 4); c.lineTo(x1, y + 4); c.stroke();
    c.strokeStyle = '#25140a'; c.lineWidth = 17; c.beginPath(); c.moveTo(x0, y); c.lineTo(x1, y); c.stroke();
    c.strokeStyle = '#4a2d17'; c.lineWidth = 11; c.beginPath(); c.moveTo(x0, y); c.lineTo(x1, y); c.stroke();
    const gold = c.createLinearGradient(0, y - 6, 0, y + 6); gold.addColorStop(0, '#ffe27a'); gold.addColorStop(1, '#f0a500');
    c.strokeStyle = gold; c.lineWidth = 11; c.beginPath(); c.moveTo(x0, y); c.lineTo(Math.max(x0 + 1, px), y); c.stroke();
    c.strokeStyle = 'rgba(255,255,255,.45)'; c.lineWidth = 2.5; c.beginPath(); c.moveTo(x0 + 4, y - 2.5); c.lineTo(Math.max(x0 + 5, px - 3), y - 2.5); c.stroke();
    ms.forEach((m, i) => {
      const on = pos >= m.era - 1e-6, since = (pos - m.era) * (durOf ? durOf(m.era) : 6), x = mx(i);
      c.strokeStyle = on ? '#f2b705' : '#4a2d17'; c.lineWidth = 4; c.beginPath(); c.moveTo(x, y - 12); c.lineTo(x, y); c.stroke();
      medal(c, x, y - 46, r, m.icon, { on, pulse: on && since < .7 ? since / .7 : 0 });
      heavy(c, m.label, x, 14, { size: 15, sw: 5, alpha: on ? 1 : .75 });
    });
    c.fillStyle = '#fff'; c.strokeStyle = INK; c.lineWidth = 3.4; c.beginPath(); c.roundRect(px - 6.5, y - 19, 13, 38, 6.5); c.fill(); c.stroke();
    c.restore();
  }

  // ---------- Số năm + dân số ----------
  function year(c, value, suffix, cx, baseY, { size = 150, pop = 0, slide = 1 } = {}) {
    if (slide <= 0) return;
    const str = String(value), dw = measure(c, '0', size) * .96, sufSize = size * .4, sufW = suffix ? measure(c, suffix, sufSize) : 0, gap = suffix ? size * .14 : 0;
    const total = str.length * dw + (suffix ? gap + sufW : 0), s = 1 + .1 * Math.sin(clamp(pop, 0, 1) * Math.PI);
    c.save(); c.translate(cx, baseY - (1 - slide) * 260); c.scale(s, s); c.globalAlpha *= clamp(slide * 1.4, 0, 1);
    const left = -total / 2, gold = c.createLinearGradient(0, -size * .78, 0, 0); gold.addColorStop(0, '#ffe566'); gold.addColorStop(.55, GOLD); gold.addColorStop(1, GOLD_DEEP);
    const glyphs = [...str].map((ch, i) => [ch, left + i * dw + dw / 2, 0, size, 'center']);
    if (suffix) glyphs.push([suffix, left + str.length * dw + gap, 0, sufSize, 'left']);
    for (const [ch, x, y, sz, al] of glyphs) heavy(c, ch, x, y, { size: sz, align: al, fill: 'rgba(0,25,60,.35)', stroke: 'rgba(0,25,60,.35)', sw: sz * .2, shadow: null, alpha: 1 });
    for (const [ch, x, y, sz, al] of glyphs) heavy(c, ch, x + 0, y - 5, { size: sz, align: al, fill: '#fff', stroke: '#fff', sw: sz * .17 });
    for (const [ch, x, y, sz, al] of glyphs) heavy(c, ch, x, y - 5, { size: sz, align: al, fill: gold, stroke: '#8a5200', sw: Math.max(2, sz * .02) });
    c.restore();
  }
  function person(c, x, y, s, fill = '#fff') {
    c.save(); c.translate(x, y); c.scale(s, s); c.lineJoin = 'round'; c.fillStyle = fill; c.strokeStyle = INK; c.lineWidth = 5;
    c.beginPath(); c.arc(0, -17, 9, 0, TAU); c.stroke(); c.fill(); c.beginPath(); c.moveTo(-15, 4); c.quadraticCurveTo(-15, -6, 0, -6); c.quadraticCurveTo(15, -6, 15, 4); c.closePath(); c.stroke(); c.fill();
    c.restore();
  }
  function population(c, n, est, sep, cx, y, slide = 1) {
    if (!n || slide <= 0) return;
    const str = groupDigits(n, sep), size = 50, w = measure(c, str, size), ew = measure(c, est, 24), total = 44 + w + 10 + ew;
    c.save(); c.globalAlpha *= clamp(slide * 1.3, 0, 1); c.translate(cx - total / 2, y + (1 - slide) * -60);
    person(c, 16, 14, 1.15);
    heavy(c, str, 44, 0, { size, align: 'left', sw: 9, shadow: { dx: 0, dy: 4, color: 'rgba(0,25,60,.3)' } });
    heavy(c, est, 44 + w + 10, 0, { size: 24, align: 'left', sw: 6 });
    c.restore();
  }

  // ---------- Cuộn giấy ----------
  // Giấy da giữa hai trục gỗ: cờ trong khung trắng, tên in đậm giãn chữ, dòng chú thích. slide 0..1 (nảy lên từ dưới).
  function scroll(c, w, h, { cx, bottom, w: bw = 1180, title = '', lines = [], flag = null, slide = 1, arrow = 0, t = 0, center = false }) {
    if (slide <= 0) return;
    if (center && !title && !flag && lines.length) { const widest = Math.max(...lines.map(l => measure(c, l, 30, 700, TEXT))); bw = Math.min(bw, Math.max(520, widest + 2 * (34 + 54))); }
    const roll = 34, titleSize = 44, capSize = 30;
    let ts = titleSize;
    const hasFlag = Boolean(flag), leftPad = roll + 30 + (hasFlag ? 94 + 32 : 6), rightPad = roll + 36 + (arrow ? 70 : 0), maxW = bw - leftPad - rightPad;
    if (title) { const tw = measure(c, title, ts, 900, HEAVY, 5); if (tw > maxW) ts = Math.max(24, Math.floor(ts * maxW / tw)); }
    const bh = Math.max(150, 44 + (title ? ts + 14 : 0) + lines.length * (capSize + 8) + 30), y = bottom - bh;
    const off = (1 - easeOut(slide)) * (bh + 40);
    c.save(); c.translate(cx - bw / 2, y + off); c.globalAlpha *= clamp(slide * 1.5, 0, 1); c.lineJoin = 'round';
    c.fillStyle = 'rgba(0,30,60,.3)'; c.beginPath(); c.ellipse(bw / 2, bh + 4, bw / 2 - 20, 14, 0, 0, TAU); c.fill();
    const paper = c.createLinearGradient(0, 0, 0, bh); paper.addColorStop(0, '#f6e6b8'); paper.addColorStop(1, '#e8d09a');
    c.fillStyle = paper; c.strokeStyle = '#6b4520'; c.lineWidth = 4; c.beginPath(); c.rect(roll - 6, 6, bw - roll * 2 + 12, bh - 12); c.fill(); c.stroke();
    const fold = c.createLinearGradient(roll, 0, roll + 60, 0); fold.addColorStop(0, 'rgba(110,70,20,.28)'); fold.addColorStop(1, 'rgba(110,70,20,0)');
    c.fillStyle = fold; c.fillRect(roll - 4, 8, 60, bh - 16); const fold2 = c.createLinearGradient(bw - roll, 0, bw - roll - 60, 0); fold2.addColorStop(0, 'rgba(110,70,20,.28)'); fold2.addColorStop(1, 'rgba(110,70,20,0)'); c.fillStyle = fold2; c.fillRect(bw - roll - 56, 8, 60, bh - 16);
    c.strokeStyle = 'rgba(140,95,40,.45)'; c.lineWidth = 2; c.beginPath(); c.rect(roll + 12, 18, bw - roll * 2 - 24, bh - 36); c.stroke();
    for (const rx of [0, bw - roll]) {
      const wood = c.createLinearGradient(rx, 0, rx + roll, 0); wood.addColorStop(0, '#6b3f1c'); wood.addColorStop(.35, '#b87938'); wood.addColorStop(.7, '#8a5326'); wood.addColorStop(1, '#52300f');
      c.fillStyle = wood; c.strokeStyle = '#2f1a08'; c.lineWidth = 4; c.beginPath(); c.roundRect(rx, -4, roll, bh + 8, 11); c.fill(); c.stroke();
      c.fillStyle = '#d9a24f'; c.strokeStyle = '#2f1a08'; c.lineWidth = 3; c.beginPath(); c.ellipse(rx + roll / 2, -4, roll / 2 - 1, 8, 0, 0, TAU); c.fill(); c.stroke(); c.beginPath(); c.ellipse(rx + roll / 2, bh + 4, roll / 2 - 1, 8, 0, 0, TAU); c.fill(); c.stroke();
    }
    let tx = roll + 30;
    if (hasFlag) {
      const fw = 94, fh = 66, fy = bh / 2 - fh / 2;
      c.save(); c.translate(tx, fy); c.fillStyle = '#fff'; c.strokeStyle = INK; c.lineWidth = 4; c.beginPath(); c.roundRect(-4, -4, fw + 8, fh + 8, 6); c.fill(); c.stroke(); c.beginPath(); c.rect(0, 0, fw, fh); c.save(); c.clip(); flag(c, { x: 0, y: 0, w: fw, h: fh, cx: fw / 2, cy: fh / 2 });
      const gl = c.createLinearGradient(0, 0, 0, fh); gl.addColorStop(0, 'rgba(255,255,255,.28)'); gl.addColorStop(.5, 'rgba(255,255,255,0)'); gl.addColorStop(1, 'rgba(0,0,0,.14)'); c.fillStyle = gl; c.fillRect(0, 0, fw, fh); c.restore(); c.strokeStyle = INK; c.lineWidth = 3; c.strokeRect(0, 0, fw, fh); c.restore();
      tx += fw + 32;
    }
    const titleH = title ? ts + 14 : 0, linesH = lines.length * (capSize + 8), top0 = (bh - titleH - linesH) / 2;
    if (title) heavy(c, title, tx, top0 + ts * .86, { size: ts, align: 'left', fill: '#3a2210', stroke: '#3a2210', sw: 0, spacing: 5 });
    lines.forEach((ln, i) => heavy(c, ln, center && !title && !flag ? bw / 2 : tx, top0 + titleH + i * (capSize + 8) + capSize * .82, { size: capSize, align: center && !title && !flag ? 'center' : 'left', fill: '#4f351b', stroke: '#4f351b', sw: 0, font: TEXT, weight: 700 }));
    if (arrow) {
      const ax = bw - roll - 70, ay = bh / 2 + Math.sin(t * 5) * 7;
      c.fillStyle = '#e8343a'; c.strokeStyle = INK; c.lineWidth = 4; c.beginPath(); c.moveTo(ax - 12, ay - 22); c.lineTo(ax + 12, ay - 22); c.lineTo(ax + 12, ay); c.lineTo(ax + 26, ay); c.lineTo(ax, ay + 28); c.lineTo(ax - 26, ay); c.lineTo(ax - 12, ay); c.closePath(); c.fill(); c.stroke();
    }
    c.restore();
    return { height: bh, top: y };
  }

  // ---------- Ký hiệu trên bản đồ ----------
  function label(c, str, x, y, size = 24) { if (str) heavy(c, String(str).toUpperCase(), x, y, { size, sw: size * .3, spacing: 1.5 }); }
  function pin(c, x, y, s = 1) {
    c.save(); c.translate(x, y); c.scale(s, s); c.lineJoin = 'round';
    c.fillStyle = 'rgba(0,30,60,.25)'; c.beginPath(); c.ellipse(0, 2, 12, 5, 0, 0, TAU); c.fill();
    c.fillStyle = '#e8343a'; c.strokeStyle = INK; c.lineWidth = 4; c.beginPath(); c.moveTo(0, 0); c.bezierCurveTo(-6, -14, -19, -22, -19, -36); c.arc(0, -36, 19, Math.PI, 0); c.bezierCurveTo(19, -22, 6, -14, 0, 0); c.closePath(); c.fill(); c.stroke();
    c.fillStyle = '#fff'; c.beginPath(); c.arc(0, -36, 7.5, 0, TAU); c.fill(); c.lineWidth = 2.6; c.stroke();
    c.fillStyle = 'rgba(255,255,255,.4)'; c.beginPath(); c.ellipse(-8, -46, 4, 7, -.5, 0, TAU); c.fill();
    c.restore();
  }
  function battleMedal(c, x, y, s, t = 0) {
    c.save(); c.translate(x, y); c.scale(s, s); c.lineCap = 'round'; c.lineJoin = 'round';
    for (let k = 0; k < 2; k++) { const ph = (t * .9 + k * .5) % 1; c.strokeStyle = `rgba(232,52,58,${.75 * (1 - ph)})`; c.lineWidth = 2 + 6 * (1 - ph); c.beginPath(); c.arc(0, 0, 30 + ph * 46, 0, TAU); c.stroke(); }
    c.fillStyle = 'rgba(0,30,60,.25)'; c.beginPath(); c.ellipse(0, 5, 30, 28, 0, 0, TAU); c.fill();
    c.fillStyle = '#fff'; c.strokeStyle = '#e8343a'; c.lineWidth = 5; c.beginPath(); c.arc(0, 0, 28, 0, TAU); c.fill(); c.stroke(); c.strokeStyle = INK; c.lineWidth = 3; c.beginPath(); c.arc(0, 0, 32, 0, TAU); c.stroke();
    c.strokeStyle = '#7b8794'; c.lineWidth = 6; c.beginPath(); c.moveTo(-14, -14); c.lineTo(14, 14); c.moveTo(14, -14); c.lineTo(-14, 14); c.stroke();
    c.strokeStyle = INK; c.lineWidth = 2; c.beginPath(); c.moveTo(-14, -14); c.lineTo(14, 14); c.moveTo(14, -14); c.lineTo(-14, 14); c.stroke();
    c.strokeStyle = '#a0522d'; c.lineWidth = 5; c.beginPath(); c.moveTo(-16, 8); c.lineTo(-8, 16); c.moveTo(16, 8); c.lineTo(8, 16); c.stroke();
    c.restore();
  }
  function townDot(c, x, y, s) {
    c.save(); c.translate(x, y); c.scale(s, s); c.fillStyle = 'rgba(0,30,60,.25)'; c.beginPath(); c.ellipse(0, 4, 14, 8, 0, 0, TAU); c.fill();
    c.fillStyle = '#fff'; c.strokeStyle = INK; c.lineWidth = 4.5; c.beginPath(); c.arc(0, 0, 11, 0, TAU); c.fill(); c.stroke(); c.fillStyle = '#e8343a'; c.beginPath(); c.arc(0, 0, 4.4, 0, TAU); c.fill(); c.restore();
  }
  function pyramid(c, x, y, s) {
    c.save(); c.translate(x, y); c.scale(s, s); c.lineJoin = 'round'; c.strokeStyle = INK; c.lineWidth = 3.4;
    c.fillStyle = 'rgba(0,30,60,.22)'; c.beginPath(); c.ellipse(0, 3, 36, 8, 0, 0, TAU); c.fill();
    const cols = ['#e8b25a', '#f2c46d', '#f8d58a', '#ffe3a0'];
    for (let i = 0; i < 4; i++) { const w = 62 - i * 14, h = 12; c.fillStyle = cols[i]; c.beginPath(); c.rect(-w / 2, -i * h - h, w, h); c.fill(); c.stroke(); }
    c.fillStyle = '#e8343a'; c.beginPath(); c.moveTo(0, -62); c.lineTo(-7, -48); c.lineTo(7, -48); c.closePath(); c.fill(); c.stroke(); c.restore();
  }
  function fort(c, x, y, s) {
    c.save(); c.translate(x, y); c.scale(s, s); c.lineJoin = 'round'; c.strokeStyle = INK; c.lineWidth = 3.4;
    c.fillStyle = 'rgba(0,30,60,.22)'; c.beginPath(); c.ellipse(0, 3, 38, 8, 0, 0, TAU); c.fill();
    c.fillStyle = '#c9d2dc'; c.beginPath(); c.rect(-30, -34, 60, 34); c.fill(); c.stroke();
    for (const dx of [-30, -10, 10]) { c.beginPath(); c.rect(dx, -46, 20, 13); c.fill(); c.stroke(); }
    c.fillStyle = '#6b4520'; c.beginPath(); c.moveTo(-8, 0); c.lineTo(-8, -14); c.arc(0, -14, 8, Math.PI, 0); c.lineTo(8, 0); c.closePath(); c.fill(); c.stroke();
    c.fillStyle = '#e8343a'; c.beginPath(); c.moveTo(0, -46); c.lineTo(0, -66); c.lineTo(16, -60); c.lineTo(0, -54); c.closePath(); c.fill(); c.stroke(); c.restore();
  }
  // Thuyền buồm hoạt hình (có hai thủy thủ nhỏ).
  function boat(c, x, y, s, flip = 1, t = 0, sail = '#fff') {
    c.save(); c.translate(x, y + Math.sin(t * 2.4) * 3); c.rotate(Math.sin(t * 1.9) * .05); c.scale(s * flip, s); c.lineJoin = 'round'; c.lineCap = 'round';
    c.fillStyle = 'rgba(0,50,100,.25)'; c.beginPath(); c.ellipse(0, 20, 46, 7, 0, 0, TAU); c.fill();
    c.strokeStyle = INK; c.lineWidth = 3.4; c.strokeStyle = INK; c.beginPath(); c.moveTo(0, 0); c.lineTo(0, -62); c.stroke();
    c.fillStyle = sail; c.beginPath(); c.moveTo(3, -60); c.quadraticCurveTo(40, -38, 33, -6); c.lineTo(3, -6); c.closePath(); c.fill(); c.stroke();
    c.fillStyle = '#e8343a'; c.beginPath(); c.moveTo(-3, -56); c.quadraticCurveTo(-28, -38, -24, -8); c.lineTo(-3, -8); c.closePath(); c.fill(); c.stroke();
    c.fillStyle = '#8a4b1f'; c.beginPath(); c.moveTo(-42, -2); c.lineTo(42, -2); c.quadraticCurveTo(38, 18, 24, 18); c.lineTo(-24, 18); c.quadraticCurveTo(-38, 18, -42, -2); c.closePath(); c.fill(); c.stroke();
    c.strokeStyle = '#c47a3a'; c.lineWidth = 3; c.beginPath(); c.moveTo(-34, 6); c.lineTo(34, 6); c.stroke();
    for (const hx of [-14, 12]) { c.fillStyle = '#f2c79b'; c.strokeStyle = INK; c.lineWidth = 2.6; c.beginPath(); c.arc(hx, -10, 6.5, 0, TAU); c.fill(); c.stroke(); c.fillStyle = hx < 0 ? '#2f78c4' : '#e8343a'; c.beginPath(); c.arc(hx, -12.5, 6.8, Math.PI, 0); c.fill(); c.stroke(); }
    c.restore();
  }

  // ---------- Chữ dán (sticker) và nút Subscribe ----------
  function sticker(c, str, x, y, { k = 1, rot = -.07, size = 84, a = '#ffd23f', b = '#ff6a2b', t = 0 } = {}) {
    if (k <= 0) return;
    const w = measure(c, str, size) + size * .9, h = size * 1.5, sc = easeBack(k) * (1 + .03 * Math.sin(t * 9));
    c.save(); c.translate(x, y); c.rotate(rot + Math.sin(t * 7) * .015); c.scale(sc, sc); c.lineJoin = 'round';
    const spikes = 16, rx = w / 2 + 34, ry = h / 2 + 26;
    const burst = () => { c.beginPath(); for (let i = 0; i < spikes * 2; i++) { const ang = i / (spikes * 2) * TAU, f = i % 2 ? .82 : 1; c.lineTo(Math.cos(ang) * rx * f, Math.sin(ang) * ry * f); } c.closePath(); };
    c.fillStyle = 'rgba(0,30,60,.3)'; c.save(); c.translate(6, 9); burst(); c.fill(); c.restore();
    const g = c.createLinearGradient(0, -ry, 0, ry); g.addColorStop(0, a); g.addColorStop(1, b);
    c.fillStyle = g; c.strokeStyle = INK; c.lineWidth = 8; burst(); c.fill(); c.stroke();
    heavy(c, str, 0, size * .34, { size, fill: '#fff', stroke: INK, sw: size * .2, shadow: { dx: 0, dy: 5, color: 'rgba(0,0,0,.35)' } });
    c.restore();
  }
  function subscribe(c, w, str, k, t = 0) {
    if (k <= 0) return;
    const size = 28, tw = measure(c, str, size, 900, HEAVY, 1), bw = tw + 96, bh = 62, x = w - 36 - bw, y = 124, s = easeBack(k) * (1 + .04 * Math.sin(t * 6));
    c.save(); c.translate(x + bw / 2, y + bh / 2); c.scale(s, s); c.translate(-bw / 2, -bh / 2); c.lineJoin = 'round';
    c.fillStyle = 'rgba(0,30,60,.3)'; c.beginPath(); c.roundRect(0, 6, bw, bh, 16); c.fill();
    const g = c.createLinearGradient(0, 0, 0, bh); g.addColorStop(0, '#ff4b4b'); g.addColorStop(1, '#d4161d');
    c.fillStyle = g; c.strokeStyle = INK; c.lineWidth = 5; c.beginPath(); c.roundRect(0, 0, bw, bh, 16); c.fill(); c.stroke();
    c.fillStyle = '#fff'; c.beginPath(); c.moveTo(26, 18); c.lineTo(26, bh - 18); c.lineTo(48, bh / 2); c.closePath(); c.fill(); c.lineWidth = 2.4; c.stroke();
    heavy(c, str, 62, bh / 2 + 10, { size, align: 'left', sw: 0, fill: '#fff', spacing: 1 });
    c.restore();
  }

  return { HEAVY, TEXT, INK, GOLD, ICON_NAMES, mixHex, lum, heavy, measure, wrap, layout, groupDigits, sea, clouds, rainCloud, eyes, medal, timeline, year, person, population, scroll, label, pin, battleMedal, townDot, pyramid, fort, boat, sticker, subscribe, easeBack };
});
