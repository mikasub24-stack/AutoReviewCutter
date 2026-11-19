/* Tab «Bản đồ lịch sử»: cảnh minh hoạ hoạt hình có người (tàu ra khơi, đến bờ, trận đánh, vua và triều đình, chợ, xây dựng, núi lửa).
   Vẽ hoàn toàn bằng canvas 2D (không ảnh ngoài), phong cách phẳng viền chàm giống phần còn lại của kiểu «Hoạt hình sáng».
   Mỗi cảnh vẽ vào khung w×h theo thời gian t (giây) và tiến độ u (0..1) của cảnh; panel() bọc cảnh trong khung ảnh nảy ra / thu vào. */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(require('./maphist-cartoon.js'));
  else root.maphistScenes = factory(root.maphistCartoon);
})(typeof window !== 'undefined' ? window : globalThis, function (Cart) {
  'use strict';
  const TAU = Math.PI * 2, OUT = '#1a1446';
  const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
  const lerp = (a, b, k) => a + (b - a) * k;
  const KINDS = ['voyage', 'arrival', 'battle', 'court', 'market', 'build', 'volcano'];
  const SKIN = ['#ffd2a6', '#f3b98a', '#d99a6c', '#b87a50', '#8d5a37'];

  // ---------- Nét vẽ ----------
  const ink = (c, w = 5) => { c.strokeStyle = OUT; c.lineWidth = w; c.lineJoin = 'round'; c.lineCap = 'round'; };
  function fs(c, fill, w = 5) { c.fillStyle = fill; c.fill(); ink(c, w); c.stroke(); }
  function rr(c, x, y, w, h, r) { c.beginPath(); c.moveTo(x + r, y); c.arcTo(x + w, y, x + w, y + h, r); c.arcTo(x + w, y + h, x, y + h, r); c.arcTo(x, y + h, x, y, r); c.arcTo(x, y, x + w, y, r); c.closePath(); }
  function ellipse(c, x, y, rx, ry, rot = 0) { c.beginPath(); c.ellipse(x, y, rx, ry, rot, 0, TAU); }
  function grad(c, y0, y1, a, b, mid) { const g = c.createLinearGradient(0, y0, 0, y1); g.addColorStop(0, a); if (mid) g.addColorStop(.5, mid); g.addColorStop(1, b); return g; }
  const rnd = seed => { const x = Math.sin(seed * 127.1 + 311.7) * 43758.5453; return x - Math.floor(x); };

  // ---------- Nền ----------
  function sky(c, w, h, top, bottom) { c.fillStyle = grad(c, 0, h, top, bottom); c.fillRect(0, 0, w, h); }
  function sun(c, x, y, r, t) {
    c.save(); c.translate(x, y);
    c.rotate(t * .25); c.fillStyle = 'rgba(255,240,150,.55)';
    for (let i = 0; i < 12; i++) { c.rotate(TAU / 12); c.beginPath(); c.moveTo(r * 1.15, -r * .1); c.lineTo(r * 1.7 + (i % 2) * r * .35, 0); c.lineTo(r * 1.15, r * .1); c.closePath(); c.fill(); }
    c.restore();
    ellipse(c, x, y, r, r); fs(c, '#ffd93d', 5);
    ellipse(c, x - r * .28, y - r * .28, r * .32, r * .22, -.6); c.fillStyle = 'rgba(255,255,255,.55)'; c.fill();
  }
  function cloud(c, x, y, s, fill = '#fff') {
    c.beginPath();
    c.arc(x, y, 30 * s, Math.PI * .5, Math.PI * 1.5); c.arc(x + 34 * s, y - 24 * s, 38 * s, Math.PI, Math.PI * 1.9); c.arc(x + 82 * s, y - 8 * s, 30 * s, Math.PI * 1.35, Math.PI * .5);
    c.closePath(); fs(c, fill, 4);
  }
  function drift(w, t, speed, off, span = 420) { return ((off + t * speed) % (w + span)) - span / 2; }
  function hills(c, w, baseY, amp, fill, seed = 1, wl = 360) {
    c.beginPath(); c.moveTo(-10, baseY + 400);
    for (let x = -10; x <= w + 10; x += 20) c.lineTo(x, baseY - amp * (.5 + .5 * Math.sin(x / wl * TAU + seed)) - amp * .35 * Math.sin(x / (wl * .43) + seed * 2));
    c.lineTo(w + 10, baseY + 400); c.closePath(); fs(c, fill, 5);
  }
  function waves(c, w, h, y0, t, cols, amp = 14) {
    cols.forEach((col, k) => {
      const y = y0 + k * 46, ph = t * (1.1 + k * .25) * (k % 2 ? -1 : 1);
      c.beginPath(); c.moveTo(-10, h + 10);
      for (let x = -10; x <= w + 10; x += 16) c.lineTo(x, y + Math.sin(x / 90 + ph + k) * amp * (1 - k * .12));
      c.lineTo(w + 10, h + 10); c.closePath(); fs(c, col, 4);
    });
  }
  function gull(c, x, y, s, t, seed) {
    const f = Math.sin(t * 7 + seed) * .5;
    ink(c, 4 * s); c.beginPath(); c.moveTo(x - 24 * s, y + 4 * s - f * 10 * s); c.quadraticCurveTo(x - 10 * s, y - 14 * s - f * 10 * s, x, y); c.quadraticCurveTo(x + 10 * s, y - 14 * s + f * 10 * s, x + 24 * s, y + 4 * s + f * 10 * s); c.stroke();
  }
  function palm(c, x, y, s, t) {
    c.save(); c.translate(x, y); c.scale(s, s);
    c.beginPath(); c.moveTo(-9, 0); c.quadraticCurveTo(-4, -90, 16 + Math.sin(t * 1.3) * 3, -170); c.lineTo(30 + Math.sin(t * 1.3) * 3, -170); c.quadraticCurveTo(10, -80, 12, 0); c.closePath(); fs(c, '#b7814a', 5);
    for (let i = 0; i < 6; i++) {
      const a = -Math.PI / 2 + (i - 2.5) * .62 + Math.sin(t * 1.6 + i) * .06;
      c.save(); c.translate(24, -170); c.rotate(a);
      c.beginPath(); c.moveTo(0, 0); c.quadraticCurveTo(50, -42, 112, 2); c.quadraticCurveTo(52, -14, 0, 0); c.closePath(); fs(c, i % 2 ? '#37b36b' : '#2e9e5e', 4);
      c.restore();
    }
    ellipse(c, 14, -166, 11, 11); fs(c, '#8a5a2b', 4); ellipse(c, 34, -160, 10, 10); fs(c, '#8a5a2b', 4);
    c.restore();
  }

  // ---------- Người ----------
  const lite = (hex, k) => Cart.mixHex(hex, '#ffffff', k), dark = (hex, k) => Cart.mixHex(hex, '#10104a', k);
  const smooth = v => v * v * (3 - 2 * v);
  // Người hoạt hình dễ thương nhìn thẳng (đầu to, mắt to có ánh sáng, má hồng), chân đứng ở (x, y), cao khoảng 180·s.
  // o: skin, cloth, pants, hat, hair, hold, armL, armR (góc từ trục thẳng xuống, dương = giơ ra ngoài), walk (pha bước), dir (1 / -1: lật ngang), mood, beard, cape, run, sit.
  function human(c, x, y, s, o = {}) {
    const skin = o.skin || SKIN[0], cloth = o.cloth || '#ff6b6b', pants = o.pants || '#3b4a8a', dir = o.dir || 1, walk = o.walk || 0, mood = o.mood || 'happy';
    const bob = Math.abs(Math.sin(walk)) * (o.run ? 9 : o.sit ? 0 : 3.2) + (o.bob ? Math.abs(o.bob) * 4 : 0), breathe = 1 + Math.sin(walk * 1.7) * .014;
    const lw = 5;
    // bóng dưới chân
    c.save(); c.translate(x, y); c.scale(1, .22); c.fillStyle = 'rgba(0,20,70,.25)'; c.beginPath(); c.arc(0, 0, 48 * s, 0, TAU); c.fill(); c.restore();
    c.save(); c.translate(x, y - bob * s); c.scale(dir * s, s * breathe);
    const sway = Math.sin(walk) * (o.run ? 12 : 5);
    // áo choàng sau lưng
    if (o.cape) { c.beginPath(); c.moveTo(-30, -102); c.bezierCurveTo(-58 - Math.abs(sway), -70, -52 - sway, -30, -44 - sway * .6, -8); c.lineTo(44 + sway * .6, -8); c.bezierCurveTo(52 + sway, -30, 58 + Math.abs(sway), -70, 30, -102); c.closePath(); fs(c, o.cape, lw); c.fillStyle = dark(o.cape, .25); c.globalAlpha = .35; c.fillRect(-4, -100, 8, 90); c.globalAlpha = 1; }
    // chân (ngắn, dày) + giày
    if (!o.sit) for (const side of [-1, 1]) {
      const lift = Math.max(0, Math.sin(walk + (side > 0 ? 0 : Math.PI))) * (o.run ? 14 : 5), fx = side * 16 + side * sway * .25;
      c.beginPath(); c.moveTo(side * 13, -56); c.lineTo(fx, -12 - lift); c.lineCap = 'round'; c.strokeStyle = OUT; c.lineWidth = 28; c.stroke(); c.strokeStyle = pants; c.lineWidth = 19; c.stroke();
      ellipse(c, fx + side * 2, -8 - lift, 20, 11); fs(c, '#6a3b1f', 4.5); ellipse(c, fx + side * 2 - 5, -12 - lift, 8, 3.2); c.fillStyle = 'rgba(255,255,255,.35)'; c.fill();
    } else for (const side of [-1, 1]) { ellipse(c, side * 20, -22, 20, 11); fs(c, '#6a3b1f', 4.5); rr(c, side * 20 - 12, -52, 24, 34, 10); fs(c, pants, 4.5); }
    // thân
    rr(c, -29, -108, 58, 62, 24); c.save(); c.clip(); c.fillStyle = grad(c, -108, -46, lite(cloth, .28), cloth); c.fillRect(-30, -110, 60, 66); c.fillStyle = dark(cloth, .2); c.globalAlpha = .45; c.fillRect(12, -110, 20, 66); c.restore(); rr(c, -29, -108, 58, 62, 24); ink(c, lw); c.stroke();
    rr(c, -29, -74, 58, 11, 4); fs(c, '#ffd23f', 3.5); rr(c, -7, -76, 14, 15, 3); fs(c, '#fff3a8', 3);
    const back = o.armL == null ? .35 + Math.sin(walk) * .18 : o.armL, front = o.armR == null ? .35 - Math.sin(walk) * .18 : o.armR;
    const arm = (side, ang) => {
      const sx = side * 28, sy = -94, len = 42, hx = sx + side * Math.sin(ang) * len, hy = sy + Math.cos(ang) * len;
      c.beginPath(); c.moveTo(sx, sy); c.lineTo(hx, hy); c.lineCap = 'round'; c.strokeStyle = OUT; c.lineWidth = 26; c.stroke(); c.strokeStyle = cloth; c.lineWidth = 17; c.stroke();
      c.strokeStyle = lite(cloth, .3); c.lineWidth = 5; c.beginPath(); c.moveTo(sx - side * 3, sy - 2); c.lineTo(hx - side * 3, hy - 2); c.stroke();
      ellipse(c, hx, hy, 12, 12); fs(c, skin, 4);
      return [hx, hy, ang];
    };
    const hb = arm(-1, back);
    if (o.shield) shieldAt(c, hb[0] - 8, hb[1] - 14, o.shield);
    // đầu to
    const hy = -140;
    for (const side of [-1, 1]) { ellipse(c, side * 43, hy + 6, 9, 11); fs(c, skin, 4); }
    ellipse(c, 0, hy, 46, 42); c.fillStyle = (() => { const g = c.createRadialGradient(-12, hy - 14, 4, 0, hy, 56); g.addColorStop(0, lite(skin, .45)); g.addColorStop(.55, skin); g.addColorStop(1, dark(skin, .12)); return g; })(); c.fill(); ink(c, lw); c.stroke();
    for (const side of [-1, 1]) { ellipse(c, side * 28, hy + 14, 10, 6.5); c.fillStyle = 'rgba(255,96,120,.5)'; c.fill(); }
    // mắt to + ánh sáng
    const b = Math.pow(Math.max(0, Math.sin(walk * .37 + (o.seed || 0) * 5)), 36), eh = (mood === 'scared' ? 13 : 11) * (1 - .92 * b), ew = mood === 'scared' ? 9 : 8.5;
    for (const side of [-1, 1]) {
      const ex = side * 16, ey = hy - 2;
      ellipse(c, ex, ey, ew, Math.max(1.2, eh)); c.fillStyle = OUT; c.fill();
      if (eh > 4) { ellipse(c, ex - 2.8, ey - 4, 3.6, 4); c.fillStyle = '#fff'; c.fill(); ellipse(c, ex + 3, ey + 4, 1.8, 1.8); c.fillStyle = 'rgba(255,255,255,.85)'; c.fill(); }
    }
    ink(c, 4);
    if (mood === 'angry') { c.beginPath(); c.moveTo(-28, hy - 20); c.lineTo(-7, hy - 12); c.moveTo(28, hy - 20); c.lineTo(7, hy - 12); c.stroke(); ellipse(c, 0, hy + 24, 11, 8); fs(c, '#7a1f2f', 3.5); c.fillStyle = '#fff'; c.fillRect(-7, hy + 17, 14, 4); }
    else if (mood === 'scared') { c.beginPath(); c.moveTo(-26, hy - 20); c.quadraticCurveTo(-16, hy - 27, -7, hy - 21); c.moveTo(26, hy - 20); c.quadraticCurveTo(16, hy - 27, 7, hy - 21); c.stroke(); ellipse(c, 0, hy + 24, 7, 10); fs(c, '#7a1f2f', 3.5); }
    else if (mood === 'calm') { c.beginPath(); c.moveTo(-26, hy - 17); c.quadraticCurveTo(-16, hy - 21, -7, hy - 17); c.moveTo(26, hy - 17); c.quadraticCurveTo(16, hy - 21, 7, hy - 17); c.stroke(); c.beginPath(); c.arc(0, hy + 16, 9, .25, Math.PI - .25); c.stroke(); }
    else { c.beginPath(); c.moveTo(-26, hy - 18); c.quadraticCurveTo(-16, hy - 24, -7, hy - 18); c.moveTo(26, hy - 18); c.quadraticCurveTo(16, hy - 24, 7, hy - 18); c.stroke(); c.beginPath(); c.moveTo(-14, hy + 15); c.quadraticCurveTo(0, hy + 36, 14, hy + 15); c.quadraticCurveTo(0, hy + 20, -14, hy + 15); c.closePath(); fs(c, '#8a2036', 3.5); c.save(); c.clip(); ellipse(c, 0, hy + 31, 8, 6); c.fillStyle = '#ff7b93'; c.fill(); c.restore(); c.beginPath(); c.moveTo(-14, hy + 15); c.quadraticCurveTo(0, hy + 36, 14, hy + 15); ink(c, 3.5); c.stroke(); }
    ellipse(c, 0, hy + 7, 3.4, 2.6); c.fillStyle = dark(skin, .22); c.fill();
    // râu
    if (o.beard) { c.beginPath(); c.moveTo(-42, hy + 4); c.bezierCurveTo(-48, hy + 40, -22, hy + 74, 0, hy + 74); c.bezierCurveTo(22, hy + 74, 48, hy + 40, 42, hy + 4); c.bezierCurveTo(30, hy + 24, 16, hy + 22, 0, hy + 20); c.bezierCurveTo(-16, hy + 22, -30, hy + 24, -42, hy + 4); c.closePath(); fs(c, o.beardColor || '#f4f4fb', 4.5); ellipse(c, -11, hy + 17, 12, 6, .3); fs(c, '#fff', 3.5); ellipse(c, 11, hy + 17, 12, 6, -.3); fs(c, '#fff', 3.5); if (mood !== 'angry' && mood !== 'scared') { c.beginPath(); c.moveTo(-9, hy + 26); c.quadraticCurveTo(0, hy + 36, 9, hy + 26); ink(c, 3.5); c.stroke(); } }
    // mũ / tóc
    const hat = o.hat || 'none', hc = o.hatColor;
    if (hat === 'helmet') { c.beginPath(); c.arc(0, hy - 16, 49, Math.PI, TAU); c.lineTo(49, hy - 14); c.lineTo(-49, hy - 14); c.closePath(); fs(c, hc || '#c3cbe0', lw); c.fillStyle = 'rgba(255,255,255,.4)'; ellipse(c, -18, hy - 46, 14, 6, -.5); c.fill(); rr(c, -6, hy - 72, 12, 30, 5); fs(c, '#e84a5f', 3.5); rr(c, -51, hy - 24, 102, 13, 5); fs(c, dark(hc || '#c3cbe0', .25), 3.5); }
    else if (hat === 'crown') { c.beginPath(); c.moveTo(-32, hy - 30); c.lineTo(-36, hy - 74); c.lineTo(-17, hy - 54); c.lineTo(0, hy - 82); c.lineTo(17, hy - 54); c.lineTo(36, hy - 74); c.lineTo(32, hy - 30); c.closePath(); fs(c, '#ffd23f', lw); rr(c, -33, hy - 38, 66, 11, 4); fs(c, '#ffb81f', 3.5); for (const [gx, gc] of [[-16, '#ff4f9f'], [0, '#46c2ff'], [16, '#ff4f9f']]) { ellipse(c, gx, hy - 33, 4.5, 4.5); c.fillStyle = gc; c.fill(); } ellipse(c, 0, hy - 76, 5, 5); c.fillStyle = '#fff'; c.fill(); }
    else if (hat === 'turban') { ellipse(c, 0, hy - 36, 50, 27); fs(c, hc || '#fff3d6', lw); c.save(); ellipse(c, 0, hy - 36, 50, 27); c.clip(); ink(c, 3.5); for (let k = -2; k <= 2; k++) { c.beginPath(); c.moveTo(-52, hy - 36 + k * 10); c.quadraticCurveTo(0, hy - 24 + k * 10, 52, hy - 48 + k * 10); c.stroke(); } c.restore(); ellipse(c, 0, hy - 58, 8, 8); fs(c, '#e84a5f', 3.5); }
    else if (hat === 'cap') { c.beginPath(); c.arc(0, hy - 18, 48, Math.PI * 1.02, TAU - .02); c.closePath(); fs(c, hc || '#2f9e6a', lw); rr(c, -38, hy - 26, 76, 13, 6); fs(c, dark(hc || '#2f9e6a', .2), 4); ellipse(c, 0, hy - 64, 6, 6); fs(c, lite(hc || '#2f9e6a', .4), 3); }
    else if (hat === 'hood') { c.beginPath(); c.moveTo(-54, hy + 20); c.bezierCurveTo(-60, hy - 60, 60, hy - 60, 54, hy + 20); c.quadraticCurveTo(46, hy - 4, 36, hy - 22); c.quadraticCurveTo(0, hy - 38, -36, hy - 22); c.quadraticCurveTo(-46, hy - 4, -54, hy + 20); c.closePath(); fs(c, hc || '#6a4a9a', lw); }
    else { c.beginPath(); c.moveTo(-47, hy + 4); c.bezierCurveTo(-56, hy - 62, 56, hy - 62, 47, hy + 4); c.quadraticCurveTo(40, hy - 22, 22, hy - 25); c.quadraticCurveTo(10, hy - 12, -4, hy - 27); c.quadraticCurveTo(-26, hy - 14, -47, hy + 4); c.closePath(); fs(c, o.hair || '#5a3a22', lw); c.fillStyle = 'rgba(255,255,255,.28)'; ellipse(c, -20, hy - 40, 16, 6, -.4); c.fill(); }
    // tay trước + đồ cầm
    const h2 = arm(1, front);
    drawHold(c, o.hold, h2[0], h2[1], h2[2], walk);
    c.restore();
  }
  function drawHold(c, hold, hx, hy, ang, walk) {
    if (!hold) return;
    const kind = typeof hold === 'string' ? hold : hold.kind, col = (hold && hold.color) || '#e84a5f';
    c.save(); c.translate(hx, hy);
    if (kind === 'spear') { c.rotate(.1 + Math.sin(walk * .9) * .03); c.beginPath(); c.moveTo(0, 70); c.lineTo(0, -150); ink(c, 11); c.stroke(); c.strokeStyle = '#b97c40'; c.lineWidth = 6; c.stroke(); c.beginPath(); c.moveTo(0, -186); c.lineTo(14, -148); c.lineTo(-14, -148); c.closePath(); fs(c, '#e6ecfa', 4.5); }
    else if (kind === 'sword') { c.rotate(.5 + Math.sin(walk * 1.4) * .32); rr(c, -6, -112, 12, 104, 4); fs(c, '#eef3ff', 4); c.fillStyle = 'rgba(120,150,220,.35)'; c.fillRect(1, -108, 4, 96); rr(c, -20, -12, 40, 11, 4); fs(c, '#ffd23f', 4); rr(c, -5, -3, 10, 26, 4); fs(c, '#8a5a2b', 4); }
    else if (kind === 'flag') { c.rotate(.04); c.beginPath(); c.moveTo(0, 70); c.lineTo(0, -230); ink(c, 11); c.stroke(); c.strokeStyle = '#b97c40'; c.lineWidth = 6; c.stroke(); const f = Math.sin(walk * 1.3) * 12; c.beginPath(); c.moveTo(4, -226); c.bezierCurveTo(48, -242 + f, 84, -204 - f, 136, -224 + f); c.lineTo(136, -150 + f); c.bezierCurveTo(84, -132 - f, 48, -172 + f, 4, -154); c.closePath(); fs(c, col, 5); ellipse(c, 70, -190, 15, 15); c.fillStyle = 'rgba(255,255,255,.88)'; c.fill(); }
    else if (kind === 'sack') { ellipse(c, 4, 4, 36, 33); fs(c, '#d2ac6c', 5); c.beginPath(); c.moveTo(-10, -22); c.lineTo(4, -38); c.lineTo(18, -22); c.closePath(); fs(c, '#d2ac6c', 4.5); }
    else if (kind === 'scroll') { rr(c, -12, -44, 24, 66, 10); fs(c, '#fff4c2', 4.5); ellipse(c, 0, -44, 13, 6); fs(c, '#ecd68e', 3.5); ellipse(c, 0, 22, 13, 6); fs(c, '#ecd68e', 3.5); }
    else if (kind === 'basket') { c.beginPath(); c.moveTo(-32, -14); c.lineTo(-24, 36); c.lineTo(24, 36); c.lineTo(32, -14); c.closePath(); fs(c, '#dba85e', 5); ellipse(c, -12, -20, 14, 14); fs(c, '#ff5a5a', 4); ellipse(c, 12, -22, 14, 14); fs(c, '#ffc83d', 4); ellipse(c, 0, -32, 14, 14); fs(c, '#6ccf6a', 4); }
    else if (kind === 'hammer') { c.rotate(.2 + Math.sin(walk * 1.8) * .55); c.beginPath(); c.moveTo(0, 28); c.lineTo(0, -64); ink(c, 11); c.stroke(); c.strokeStyle = '#b97c40'; c.lineWidth = 6; c.stroke(); rr(c, -26, -92, 52, 32, 7); fs(c, '#a3b0cc', 5); }
    else if (kind === 'goblet') { c.beginPath(); c.moveTo(-17, -42); c.lineTo(17, -42); c.quadraticCurveTo(15, -10, 0, -8); c.quadraticCurveTo(-15, -10, -17, -42); c.closePath(); fs(c, '#ffd23f', 4.5); rr(c, -4, -10, 8, 20, 3); fs(c, '#ffd23f', 3.5); }
    c.restore();
  }
  function shieldAt(c, x, y, col) { ellipse(c, x, y, 32, 40); fs(c, col, 5.5); ellipse(c, x, y, 13, 16); fs(c, '#ffd23f', 4); c.fillStyle = 'rgba(255,255,255,.3)'; ellipse(c, x - 12, y - 14, 6, 10, .5); c.fill(); }

  // ---------- Đồ vật & hiệu ứng ----------
  const smoothstep = smooth;
  function puff(c, x, y, r, a = 1, fill = '#fff') { c.save(); c.globalAlpha = Math.max(0, a); ellipse(c, x, y, r, r * .82); c.fillStyle = fill; c.fill(); ink(c, 3); c.stroke(); c.restore(); }
  function spark(c, x, y, r, rot, fill = '#ffe14a') { c.save(); c.translate(x, y); c.rotate(rot); c.beginPath(); for (let k = 0; k < 8; k++) { const q = k % 2 ? r * .4 : r; c.lineTo(Math.cos(k / 8 * TAU) * q, Math.sin(k / 8 * TAU) * q); } c.closePath(); fs(c, fill, 3); c.restore(); }
  function glow(c, x, y, r, col = '255,220,120', a = .5) { const g = c.createRadialGradient(x, y, 0, x, y, r); g.addColorStop(0, `rgba(${col},${a})`); g.addColorStop(1, `rgba(${col},0)`); c.fillStyle = g; c.fillRect(x - r, y - r, r * 2, r * 2); }
  function flame(c, x, y, s, t, seed = 0) {
    const f = 1 + Math.sin(t * 11 + seed * 3) * .13, wd = 1 + Math.sin(t * 7 + seed) * .09;
    c.save(); c.translate(x, y); c.scale(s * wd, s * f);
    c.beginPath(); c.moveTo(0, 0); c.bezierCurveTo(-24, -4, -22, -34, 0, -66); c.bezierCurveTo(22, -34, 24, -4, 0, 0); c.closePath(); fs(c, '#ff8a2b', 4);
    c.beginPath(); c.moveTo(0, -2); c.bezierCurveTo(-12, -4, -11, -20, 0, -38); c.bezierCurveTo(11, -20, 12, -4, 0, -2); c.closePath(); c.fillStyle = '#ffd25a'; c.fill();
    c.restore();
  }
  function barrel(c, x, y, s) {
    c.save(); c.translate(x, y); c.scale(s, s);
    c.beginPath(); c.moveTo(-34, -78); c.quadraticCurveTo(-48, -39, -34, 0); c.lineTo(34, 0); c.quadraticCurveTo(48, -39, 34, -78); c.closePath(); fs(c, '#b9773f', 5);
    c.save(); c.clip(); c.fillStyle = 'rgba(255,255,255,.2)'; c.fillRect(-26, -80, 10, 82); c.fillStyle = '#6b6f8f'; c.fillRect(-52, -62, 104, 9); c.fillRect(-52, -18, 104, 9); c.restore();
    ellipse(c, 0, -78, 34, 10); fs(c, '#d99a58', 4.5); c.restore();
  }
  function crate(c, x, y, s, col = '#c98d4c') {
    c.save(); c.translate(x, y); c.scale(s, s); rr(c, -38, -72, 76, 72, 6); fs(c, col, 5);
    c.beginPath(); c.moveTo(-34, -68); c.lineTo(34, -4); c.moveTo(34, -68); c.lineTo(-34, -4); ink(c, 3.5); c.stroke();
    rr(c, -38, -72, 76, 72, 6); ink(c, 5); c.stroke(); c.restore();
  }
  function lantern(c, x, y, s, t, seed = 0) {
    const f = .8 + Math.sin(t * 9 + seed * 2) * .12;
    glow(c, x, y + 26 * s, 70 * s, '255,214,110', .55 * f);
    c.save(); c.translate(x, y); c.scale(s, s); c.beginPath(); c.moveTo(0, -30); c.lineTo(0, 0); ink(c, 4); c.stroke();
    rr(c, -16, 0, 32, 46, 9); fs(c, '#ffe08a', 4.5); rr(c, -20, -6, 40, 10, 4); fs(c, '#e84a5f', 3.5); rr(c, -20, 42, 40, 9, 4); fs(c, '#e84a5f', 3.5);
    c.fillStyle = 'rgba(255,255,255,.7)'; ellipse(c, -4, 18, 4, 9); c.fill(); c.restore();
  }
  function bunting(c, x0, y0, x1, y1, t, cols, n = 9, sag = 34, fl = 17) {
    const pt = k => [lerp(x0, x1, k), lerp(y0, y1, k) + Math.sin(k * Math.PI) * sag + Math.sin(t * 2 + k * 6) * 2];
    ink(c, 4); c.beginPath(); for (let i = 0; i <= 24; i++) { const p = pt(i / 24); i ? c.lineTo(p[0], p[1]) : c.moveTo(p[0], p[1]); } c.stroke();
    for (let i = 0; i < n; i++) { const p = pt((i + .5) / n), sw = Math.sin(t * 3 + i) * 3; c.beginPath(); c.moveTo(p[0] - fl, p[1]); c.lineTo(p[0] + fl, p[1]); c.lineTo(p[0] + sw, p[1] + fl * 2.2); c.closePath(); fs(c, cols[i % cols.length], 3.5); }
  }
  function cannon(c, x, y, s, dir, fire = 0) {
    c.save(); c.translate(x, y); c.scale(dir * s, s);
    c.beginPath(); c.moveTo(-54, -34); c.lineTo(56, -62); c.lineTo(56, -30); c.lineTo(-54, -6); c.closePath(); fs(c, '#4b5578', 5);
    c.fillStyle = 'rgba(255,255,255,.2)'; c.beginPath(); c.moveTo(-40, -30); c.lineTo(50, -55); c.lineTo(50, -49); c.lineTo(-40, -24); c.closePath(); c.fill();
    rr(c, 46, -68, 20, 42, 6); fs(c, '#6a7599', 4.5); ellipse(c, -56, -20, 15, 15); fs(c, '#4b5578', 4);
    rr(c, -42, -22, 78, 16, 5); fs(c, '#8a5a2b', 4.5);
    ellipse(c, -4, -2, 30, 30); fs(c, '#a8683a', 5); ellipse(c, -4, -2, 9, 9); fs(c, '#ffd23f', 3.5);
    for (let k = 0; k < 4; k++) { const a = k * Math.PI / 4; c.beginPath(); c.moveTo(-4 - Math.cos(a) * 28, -2 - Math.sin(a) * 28); c.lineTo(-4 + Math.cos(a) * 28, -2 + Math.sin(a) * 28); ink(c, 3.5); c.stroke(); }
    if (fire > 0) { glow(c, 90, -46, 90 * fire + 20, '255,200,80', .8 * fire); spark(c, 84, -46, 46 * fire + 10, fire * 3, '#fff3a8'); spark(c, 84, -46, 30 * fire, -fire * 2, '#ff8a2b'); }
    c.restore();
  }
  function dolphin(c, x, y, s, ang) {
    c.save(); c.translate(x, y); c.rotate(ang); c.scale(s, s);
    c.beginPath(); c.moveTo(-76, 0); c.lineTo(-122, -30); c.quadraticCurveTo(-106, 0, -122, 30); c.closePath(); fs(c, '#4a86d6', 5);
    c.beginPath(); c.moveTo(-82, 2); c.bezierCurveTo(-40, -56, 44, -56, 88, -16); c.quadraticCurveTo(116, -10, 90, 4); c.bezierCurveTo(44, 38, -40, 34, -82, 2); c.closePath(); fs(c, '#5b9be8', 5);
    c.save(); c.clip(); c.fillStyle = '#e6f2ff'; ellipse(c, 10, 30, 110, 22); c.fill(); c.fillStyle = 'rgba(255,255,255,.3)'; ellipse(c, -10, -28, 60, 8, -.1); c.fill(); c.restore();
    c.beginPath(); c.moveTo(-20, -36); c.lineTo(-2, -66); c.lineTo(20, -34); c.closePath(); fs(c, '#4a86d6', 4.5);
    c.beginPath(); c.moveTo(20, 12); c.lineTo(2, 44); c.lineTo(38, 20); c.closePath(); fs(c, '#4a86d6', 4);
    ellipse(c, 62, -12, 6, 6); c.fillStyle = OUT; c.fill(); ellipse(c, 60, -14, 2, 2); c.fillStyle = '#fff'; c.fill();
    c.beginPath(); c.arc(80, 0, 14, .2, 1.2); ink(c, 3); c.stroke();
    c.restore();
  }
  function castle(c, x, y, s, col, roof, t) {
    c.save(); c.translate(x, y); c.scale(s, s);
    for (const tx of [-86, 86]) { rr(c, tx - 26, -160, 52, 160, 6); fs(c, col, 5); c.beginPath(); c.moveTo(tx - 38, -158); c.lineTo(tx, -226); c.lineTo(tx + 38, -158); c.closePath(); fs(c, roof, 5); rr(c, tx - 7, -126, 14, 30, 6); fs(c, '#2b2f66', 3.5); }
    rr(c, -66, -124, 132, 124, 6); fs(c, lite(col, .12), 5);
    for (let k = 0; k < 5; k++) { rr(c, -62 + k * 26, -142, 16, 20, 3); fs(c, lite(col, .12), 4); }
    c.beginPath(); c.moveTo(-24, 0); c.lineTo(-24, -52); c.quadraticCurveTo(0, -84, 24, -52); c.lineTo(24, 0); c.closePath(); fs(c, '#6b3f26', 5);
    c.beginPath(); c.moveTo(86, -226); c.lineTo(86, -258); ink(c, 4); c.stroke();
    const f = Math.sin(t * 5) * 6; c.beginPath(); c.moveTo(86, -258); c.bezierCurveTo(100, -266 + f, 112, -250 - f, 126, -258 + f); c.lineTo(126, -240 + f); c.bezierCurveTo(112, -232 - f, 100, -246 + f, 86, -238); c.closePath(); fs(c, '#e84a5f', 3.5);
    c.restore();
  }
  function tent(c, x, y, s, col) {
    c.save(); c.translate(x, y); c.scale(s, s);
    c.beginPath(); c.moveTo(-96, 0); c.lineTo(0, -126); c.lineTo(96, 0); c.closePath(); fs(c, col, 5);
    c.save(); c.clip(); c.fillStyle = 'rgba(255,255,255,.6)'; for (const k of [-60, -12, 36]) c.fillRect(k, -130, 24, 140); c.restore();
    c.beginPath(); c.moveTo(-26, 0); c.lineTo(0, -66); c.lineTo(26, 0); c.closePath(); fs(c, '#3a2a5a', 4.5);
    c.beginPath(); c.moveTo(0, -126); c.lineTo(0, -156); ink(c, 4); c.stroke(); c.beginPath(); c.moveTo(0, -156); c.lineTo(34, -146); c.lineTo(0, -136); c.closePath(); fs(c, '#ffd23f', 3.5);
    c.restore();
  }
  function house(c, x, y, s, wall, roof, t, smoke) {
    c.save(); c.translate(x, y); c.scale(s, s);
    rr(c, 36, -150, 24, 50, 4); fs(c, '#9a6a4a', 4);
    rr(c, -64, -96, 128, 96, 8); fs(c, wall, 5);
    c.beginPath(); c.moveTo(-80, -92); c.lineTo(0, -160); c.lineTo(80, -92); c.closePath(); fs(c, roof, 5);
    rr(c, -16, -56, 32, 56, 12); fs(c, '#7a4a2a', 4); for (const wx of [-48, 30]) { rr(c, wx, -78, 22, 24, 4); fs(c, '#ffe9a0', 3.5); c.beginPath(); c.moveTo(wx + 11, -78); c.lineTo(wx + 11, -54); c.moveTo(wx, -66); c.lineTo(wx + 22, -66); ink(c, 2.5); c.stroke(); }
    c.restore();
    if (smoke) for (let k = 0; k < 3; k++) { const ph = (t * .4 + k / 3) % 1; puff(c, x + 48 * s + Math.sin(ph * 6 + k) * 10 * s, y - 154 * s - ph * 90 * s, (10 + ph * 18) * s, (1 - ph) * .8, '#f1f1f7'); }
  }
  function tree(c, x, y, s, t, fill = '#3fae6a') {
    c.save(); c.translate(x, y); c.scale(s, s); const sw = Math.sin(t * 1.5 + x) * 3;
    rr(c, -10, -90, 20, 90, 6); fs(c, '#8a5a2b', 4.5);
    for (const [dx, dy, r] of [[-26, -108, 34], [26, -112, 34], [0, -140, 40]]) { ellipse(c, dx + sw, dy, r, r * .9); fs(c, fill, 4.5); }
    c.fillStyle = 'rgba(255,255,255,.22)'; ellipse(c, -10 + sw, -150, 18, 8, -.3); c.fill(); c.restore();
  }
  function cat(c, x, y, s, t, col = '#ff9a3c') {
    c.save(); c.translate(x, y); c.scale(s, s);
    c.beginPath(); c.moveTo(18, -6); c.quadraticCurveTo(54 + Math.sin(t * 3) * 8, -8, 44, -48 + Math.sin(t * 3) * 6); ink(c, 13); c.stroke(); c.strokeStyle = col; c.lineWidth = 7; c.stroke();
    ellipse(c, 0, -22, 24, 24); fs(c, col, 4.5);
    for (const sd of [-1, 1]) { c.beginPath(); c.moveTo(sd * 6, -66); c.lineTo(sd * 20, -86); c.lineTo(sd * 24, -60); c.closePath(); fs(c, col, 4); }
    ellipse(c, 0, -58, 21, 18); fs(c, col, 4.5);
    const bl = Math.pow(Math.max(0, Math.sin(t * 1.1 + x)), 30);
    for (const sd of [-1, 1]) { ellipse(c, sd * 8, -60, 3.2, 4.6 * (1 - .9 * bl)); c.fillStyle = OUT; c.fill(); }
    ellipse(c, 0, -52, 3, 2.2); c.fillStyle = '#ff7b93'; c.fill();
    c.restore();
  }
  function crab(c, x, y, s, t) {
    c.save(); c.translate(x, y); c.scale(s, s); const k = Math.sin(t * 9);
    for (const sd of [-1, 1]) for (let j = 0; j < 3; j++) { c.beginPath(); c.moveTo(sd * 14, -6 + j * 4); c.lineTo(sd * (30 + j * 4), 6 + j * 3 + k * sd * 2); ink(c, 3.5); c.stroke(); }
    for (const sd of [-1, 1]) { c.beginPath(); c.moveTo(sd * 16, -12); c.lineTo(sd * 30, -26 + Math.sin(t * 5 + sd) * 4); ink(c, 3.5); c.stroke(); ellipse(c, sd * 33, -30 + Math.sin(t * 5 + sd) * 4, 10, 9); fs(c, '#ff6a5a', 4); }
    ellipse(c, 0, -10, 24, 16); fs(c, '#ff7a6a', 4.5);
    for (const sd of [-1, 1]) { ellipse(c, sd * 8, -28, 4.5, 4.5); fs(c, '#fff', 2.5); ellipse(c, sd * 8, -28, 1.8, 1.8); c.fillStyle = OUT; c.fill(); }
    c.restore();
  }
  function hut(c, x, y, s, t) {
    c.save(); c.translate(x, y); c.scale(s, s);
    rr(c, -52, -70, 104, 70, 8); fs(c, '#d9a066', 5);
    c.beginPath(); c.moveTo(-76, -64); c.lineTo(0, -138); c.lineTo(76, -64); c.closePath(); fs(c, '#e8c76a', 5);
    c.save(); c.clip(); ink(c, 2.5); for (let k = -3; k <= 3; k++) { c.beginPath(); c.moveTo(k * 22, -138); c.lineTo(k * 30, -60); c.stroke(); } c.restore();
    c.beginPath(); c.arc(0, -30, 18, Math.PI, TAU); c.lineTo(18, 0); c.lineTo(-18, 0); c.closePath(); fs(c, '#5a3a22', 4.5);
    c.restore();
    for (let k = 0; k < 3; k++) { const ph = (t * .35 + k / 3 + x * .01) % 1; puff(c, x + Math.sin(ph * 5 + k) * 12 * s, y - 140 * s - ph * 80 * s, (9 + ph * 16) * s, (1 - ph) * .75, '#f4f4fa'); }
  }
  function lighthouse(c, x, y, s, t) {
    c.save(); c.translate(x, y); c.scale(s, s);
    c.beginPath(); c.moveTo(-34, 0); c.lineTo(-22, -150); c.lineTo(22, -150); c.lineTo(34, 0); c.closePath(); fs(c, '#fff', 5);
    c.save(); c.clip(); c.fillStyle = '#e84a5f'; c.fillRect(-40, -120, 80, 28); c.fillRect(-40, -56, 80, 28); c.restore();
    rr(c, -30, -178, 60, 28, 6); fs(c, '#ffd23f', 4.5);
    c.beginPath(); c.moveTo(-34, -178); c.lineTo(0, -214); c.lineTo(34, -178); c.closePath(); fs(c, '#e84a5f', 4.5);
    glow(c, 0, -164, 100, '255,235,140', .5 + Math.sin(t * 3) * .15);
    c.restore();
  }
  function vignette(c, w, h) {
    const g = c.createRadialGradient(w / 2, h * .48, h * .32, w / 2, h * .48, w * .64); g.addColorStop(0, 'rgba(10,10,70,0)'); g.addColorStop(1, 'rgba(10,10,70,.3)');
    c.fillStyle = g; c.fillRect(0, 0, w, h);
    c.fillStyle = 'rgba(255,255,255,.1)'; c.beginPath(); c.moveTo(0, 0); c.lineTo(w * .5, 0); c.lineTo(0, h * .46); c.closePath(); c.fill();
  }

  // ---------- Tàu ----------
  // o: sail, flag, seed, fore (buồm mũi, mặc định có), lookout (người trên đài quan sát), cargo (hàng trên boong).
  function ship(c, x, y, s, t, o = {}) {
    const seed = o.seed || 0, rock = Math.sin(t * 1.5 + seed) * .045, sail = o.sail || '#fff7e0', flag = o.flag || '#e84a5f';
    c.save(); c.translate(x, y + Math.sin(t * 1.9 + seed) * 6 * s); c.rotate(rock); c.scale(s, s);
    if (o.fore !== false) {
      rr(c, 118, -236, 9, 206, 3); fs(c, '#8a5a2b', 4);
      rr(c, 64, -226, 118, 8, 4); fs(c, '#8a5a2b', 3.5);
      const b2 = 10 + Math.sin(t * 2.4 + 1) * 5;
      c.beginPath(); c.moveTo(68, -218); c.bezierCurveTo(58, -170, 58, -130, 68, -96); c.quadraticCurveTo(122, -80 + b2, 176, -96); c.bezierCurveTo(186 + b2 * .3, -130, 186 + b2 * .3, -170, 178, -218); c.closePath(); fs(c, sail, 4.5);
      c.save(); c.clip(); c.fillStyle = flag; c.fillRect(64, -168, 124, 14); c.restore();
      c.beginPath(); c.moveTo(122, -236); c.lineTo(150 + Math.sin(t * 6) * 5, -228); c.lineTo(122, -218); c.closePath(); fs(c, flag, 3.5);
    }
    rr(c, -5, -300, 10, 290, 3); fs(c, '#8a5a2b', 4.5);
    rr(c, -118, -278, 236, 9, 4); fs(c, '#8a5a2b', 4);
    const bill = 18 + Math.sin(t * 2.1) * 6, body = () => { c.beginPath(); c.moveTo(-112, -268); c.bezierCurveTo(-96, -190, -96, -120, -108, -72); c.quadraticCurveTo(0, -50 + bill, 108, -72); c.bezierCurveTo(96 + bill * .4, -120, 96 + bill * .4, -190, 112, -268); c.closePath(); };
    body(); fs(c, sail, 5);
    c.save(); body(); c.clip(); c.fillStyle = flag; c.fillRect(-9, -268, 18, 220); c.fillRect(-112, -190, 224, 18); c.fillStyle = 'rgba(255,255,255,.35)'; c.fillRect(-90, -262, 22, 190); c.fillStyle = 'rgba(40,60,140,.12)'; c.fillRect(54, -262, 60, 200); c.restore();
    body(); ink(c, 5); c.stroke();
    const f = Math.sin(t * 5) * 8;
    c.beginPath(); c.moveTo(4, -300); c.bezierCurveTo(30, -312 + f, 50, -290 - f, 78, -304 + f); c.lineTo(78, -270 + f); c.bezierCurveTo(50, -258 - f, 30, -280 + f, 4, -268); c.closePath(); fs(c, flag, 4);
    if (o.bunting !== false) bunting(c, 2, -292, o.fore === false ? 186 : 124, o.fore === false ? -50 : -232, t, ['#ffd23f', '#4aa3ff', '#ff6b6b', '#6ccf6a'], 6, 8, 11);
    // thân tàu
    c.beginPath(); c.moveTo(-170, -34); c.lineTo(190, -34); c.quadraticCurveTo(170, 44, 110, 62); c.lineTo(-100, 62); c.quadraticCurveTo(-158, 34, -170, -34); c.closePath(); fs(c, '#a8683a', 5.5);
    c.save(); c.clip(); c.fillStyle = '#7d4a26'; c.fillRect(-200, 12, 420, 14); c.fillStyle = '#ffd23f'; c.fillRect(-200, -22, 420, 8); c.fillStyle = 'rgba(255,255,255,.16)'; c.fillRect(-200, -34, 420, 7); c.strokeStyle = 'rgba(60,30,10,.35)'; c.lineWidth = 2.5; for (let k = -170; k < 190; k += 46) { c.beginPath(); c.moveTo(k, 26); c.lineTo(k + 12, 62); c.stroke(); } c.restore();
    for (let k = 0; k < 5; k++) { ellipse(c, -110 + k * 58, 4, 9, 9); fs(c, '#2b2f66', 3.5); ellipse(c, -113 + k * 58, 1, 3, 3); c.fillStyle = 'rgba(255,255,255,.6)'; c.fill(); }
    c.beginPath(); c.moveTo(-170, -34); c.lineTo(190, -34); ink(c, 5.5); c.stroke();
    // mũi tàu
    c.beginPath(); c.moveTo(190, -34); c.quadraticCurveTo(222, -44, 224, -78); c.quadraticCurveTo(206, -70, 176, -62); c.closePath(); fs(c, '#8a5a2b', 4.5); ellipse(c, 218, -72, 9, 9); fs(c, '#ffd23f', 3.5);
    if (o.cargo !== false) { barrel(c, -150, -34, .56); crate(c, -108, -34, .5, '#d3a15c'); crate(c, -108, -70, .42, '#c98d4c'); barrel(c, 158, -34, .5); }
    if (o.lookout) { human(c, 0, -222, .4, { skin: SKIN[2], cloth: '#ff8a5b', hat: 'cap', hatColor: '#3b82f6', armR: 2.8 + Math.sin(t * 5) * .35, armL: .5, walk: t * 1.4, mood: 'happy', seed: 7 }); rr(c, -28, -222, 56, 32, 8); fs(c, '#a8683a', 4.5); c.save(); rr(c, -28, -222, 56, 32, 8); c.clip(); c.strokeStyle = 'rgba(60,30,10,.4)'; c.lineWidth = 3; for (let k = -18; k <= 18; k += 12) { c.beginPath(); c.moveTo(k, -222); c.lineTo(k, -190); c.stroke(); } c.restore(); }
    for (let k = 0; k <= 8; k++) { rr(c, -160 + k * 44, -64, 6, 32, 2); fs(c, '#8a5a2b', 3); }
    rr(c, -166, -70, 360, 8, 3); fs(c, '#8a5a2b', 3.5);
    c.restore();
  }

  // ---------- Các cảnh ----------
  const star = (c, x, y, r, t, i) => spark(c, x, y, r, t * 2 + i, i % 2 ? '#ffe14a' : '#fff3a8');
  const SCENES = {
    voyage(c, w, h, t, u) {
      sky(c, w, h, '#4db6ff', '#e4f7ff');
      sun(c, w * .84, h * .17, 58, t);
      for (let i = 0; i < 4; i++) cloud(c, drift(w, t, 12 + i * 4, i * 380, 300), 70 + (i % 3) * 62, 1.05 - i * .1);
      hills(c, w, h * .5, 20, '#a6e0cf', 5, 640);
      lighthouse(c, w * .1, h * .5, .8, t);
      hills(c, w, h * .56, 26, '#7fd3a2', 3, 520);
      [[18, .3, 0, '#ffb02e'], [28, .22, 1, '#8b5cf6']].forEach(([sp, k, i, fl]) => ship(c, drift(w, t, sp, i * 640 + 150, 420), h * (.555 + i * .006), k, t, { seed: i + 4, fore: false, flag: fl, cargo: false, bunting: false }));
      waves(c, w, h, h * .56, t, ['#2fa8e8', '#1f8fd6', '#1778c2', '#1566a8'], 12);
      c.save(); ink(c, 3); c.strokeStyle = 'rgba(255,255,255,.75)'; for (let i = 0; i < 16; i++) { const x = ((rnd(i) * w + t * (14 + i % 4 * 5)) % (w + 60)) - 30, y = h * (.62 + rnd(i + 3) * .34), a = Math.max(0, Math.sin(t * 2.4 + i * 1.7)); c.globalAlpha = a * .8; c.beginPath(); c.moveTo(x - 14, y); c.lineTo(x + 14, y); c.stroke(); } c.restore();
      const k = 1.1, sx = lerp(w * .3, w * .5, smooth(u)), sy = h * .72;
      c.save(); c.globalAlpha = .65; for (let j = 0; j < 8; j++) { ellipse(c, sx - 190 - j * 52, sy + 66 + Math.sin(t * 3 + j) * 3, 38 - j * 3, 7); c.fillStyle = '#fff'; c.fill(); } c.restore();
      ship(c, sx, sy, k, t, { flag: '#e84a5f', lookout: true });
      const rock = Math.sin(t * 1.9) * 6 * k, deckY = sy - 34 * k + rock;
      [[-92, 'cap', '#2f9e6a', '#ff8a5b', 2.6, 0], [-26, 'none', '#3b82f6', '#4aa3ff', 1.9, 0], [44, 'turban', '#ffd23f', '#a46bff', 1.4, 1], [112, 'hood', '#e84a5f', '#ffd23f', 2.7, 0]].forEach(([dx, hat, hc, cl, arm, bd], i) => human(c, sx + dx * k, deckY + 4, .76, { skin: SKIN[(i + 1) % 5], cloth: cl, hat, hatColor: hc, hair: ['#3a2416', '#221410', '#7a4a22', '#2a1a10'][i], beard: !!bd, hold: i === 2 ? 'scroll' : null, armR: arm + Math.sin(t * 4.2 + i) * (arm > 2 ? .4 : .08), armL: .5, walk: t * 1.6 + i, mood: i === 1 ? 'calm' : 'happy', seed: i }));
      for (let j = 0; j < 6; j++) { const ph = (t * 1.3 + j * .17) % 1; puff(c, sx + 224 * k * .98 + ph * 40, sy + 48 - Math.sin(ph * Math.PI) * 30, 7 + ph * 9, (1 - ph) * .9); }
      [[.66, w * .08, .5], [.85, w * .62, .62]].forEach(([off, x0, sc], i) => { const p = (t * .26 + off) % 1; if (p > .86) return; const x = lerp(x0, x0 + w * .28, p), a = Math.sin(p * Math.PI), y = h * .86 - a * 170; c.save(); c.globalAlpha = Math.min(1, a * 4); dolphin(c, x, y, .68 - i * .06, -Math.cos(p * Math.PI) * .9); c.restore(); if (p < .12 || p > .78) { const q = p < .5 ? p / .12 : (p - .78) / .08; ellipse(c, x, h * .86, 30 + q * 70, 8 + q * 14); c.save(); c.globalAlpha = Math.max(0, 1 - q); ink(c, 4); c.strokeStyle = '#fff'; c.stroke(); c.restore(); } });
      for (let i = 0; i < 4; i++) gull(c, drift(w, t, 36 + i * 11, i * 330 + 120, 200), 70 + i * 40 + Math.sin(t * 2 + i) * 14, 1.1 - i * .08, t, i);
    },
    arrival(c, w, h, t, u) {
      sky(c, w, h, '#7fd4ff', '#fff2c9');
      sun(c, w * .12, h * .2, 54, t);
      cloud(c, drift(w, t, 12, 300, 300), 90, 1.2); cloud(c, drift(w, t, 9, 900, 300), 160, .9); cloud(c, drift(w, t, 7, 1500, 300), 60, .8);
      hills(c, w, h * .44, 54, '#b9dcec', 7, 900);
      waves(c, w, h, h * .5, t, ['#4fc3f7', '#2fa8e8'], 10);
      const island = () => { c.beginPath(); c.moveTo(w * .4, h + 10); c.quadraticCurveTo(w * .48, h * .6, w * .66, h * .56); c.quadraticCurveTo(w * .9, h * .54, w + 10, h * .6); c.lineTo(w + 10, h + 10); c.closePath(); };
      island(); fs(c, '#ffe29a', 5.5);
      c.save(); island(); c.clip(); hills(c, w, h * .56, 26, '#52c27b', 1.3, 600); c.restore(); island(); ink(c, 5.5); c.stroke();
      c.beginPath(); c.moveTo(w * .44, h + 10); c.quadraticCurveTo(w * .52, h * .68, w * .7, h * .64); c.quadraticCurveTo(w * .92, h * .62, w + 10, h * .7); c.lineTo(w + 10, h + 10); c.closePath(); fs(c, '#ffe29a', 5.5);
      hut(c, w * .7, h * .6, .9, t); hut(c, w * .87, h * .57, .8, t + 1);
      palm(c, w * .56, h * .78, 1.0, t); palm(c, w * .95, h * .78, 1.25, t + 1); palm(c, w * .62, h * .64, .75, t + 2);
      const sx = lerp(w * .0, w * .24, 1 - Math.pow(1 - u, 2)) + 150, shipY = h * .62;
      ship(c, sx, shipY, 1.0, t, { flag: '#3b82f6', seed: 2, lookout: true });
      const bowX = sx + 200, deckY = shipY - 34, landX = bowX + 120, landY = h * .84;
      c.save(); c.translate(bowX, deckY); c.rotate(Math.atan2(landY - deckY, landX - bowX)); const L = Math.hypot(landX - bowX, landY - deckY); rr(c, 0, -7, L, 14, 4); fs(c, '#b9773f', 4.5); c.restore();
      const pp = (t * .22) % 1; human(c, lerp(bowX, landX, pp), lerp(deckY, landY, pp) + 4, .5, { skin: SKIN[2], cloth: '#9b6bff', hat: 'hood', hatColor: '#7a52c7', hold: 'sack', armR: .5, walk: t * 4, mood: 'happy', seed: 11 });
      bunting(c, w * .52, h * .52, w * .98, h * .48, t, ['#ff6b6b', '#ffd23f', '#4aa3ff', '#6ccf6a'], 9, 26, 14);
      c.beginPath(); c.moveTo(w * .76, h * .88); c.lineTo(w * .7, h * .92); c.moveTo(w * .76, h * .88); c.lineTo(w * .82, h * .92); ink(c, 9); c.stroke(); c.strokeStyle = '#8a5a2b'; c.lineWidth = 5; c.stroke();
      glow(c, w * .76, h * .82, 90, '255,190,90', .5); flame(c, w * .76, h * .89, 1.1, t, 1); flame(c, w * .745, h * .89, .75, t, 2); flame(c, w * .775, h * .89, .8, t, 3);
      [[.62, 'turban', '#ffd23f', .9, 1], [.7, 'none', '#ff6b6b', .96, 0], [.82, 'cap', '#4aa3ff', .9, 0], [.9, 'hood', '#9b6bff', .96, 0]].forEach(([fx, hat, cl, sc, beard], i) => human(c, w * fx, h * (.84 + (i % 2) * .07), sc * .72, { skin: SKIN[(i + 2) % 5], cloth: cl, hat, hatColor: cl, beard: !!beard, armR: 2.7 + Math.sin(t * 4.5 + i * 1.3) * .45, armL: 2.5 + Math.cos(t * 4.5 + i) * .45, mood: 'happy', seed: i, walk: t * 1.4 + i, bob: Math.abs(Math.sin(t * 5 + i)), hair: ['#3a2416', '#221410', '#7a4a22', '#2a1a10'][i] }));
      human(c, w * .66, h * .93, .46, { skin: SKIN[1], cloth: '#ff8a5b', hat: 'none', armR: 2.8, armL: 2.8, mood: 'happy', walk: t * 6, bob: 3, hair: '#3a2416', seed: 9 });
      crab(c, w * .5 + Math.sin(t * .7) * 70, h * .9, .7, t);
      for (let i = 0; i < 22; i++) { const ph = (t * .22 + rnd(i) * .9) % 1, x = w * (.5 + rnd(i + 2) * .5) + Math.sin(ph * 9 + i) * 30, y = -20 + ph * h * 1.0; c.save(); c.translate(x, y); c.rotate(t * 2 + i); c.fillStyle = ['#ff6b6b', '#ffd23f', '#4aa3ff', '#6ccf6a', '#ff8ad8'][i % 5]; c.fillRect(-6, -3, 12, 6); c.restore(); }
      for (let i = 0; i < 4; i++) gull(c, drift(w, t, 34 + i * 9, i * 360, 200), 70 + i * 40, 1, t, i + 3);
    },
    battle(c, w, h, t, u) {
      sky(c, w, h, '#ffb36b', '#ffe9b0');
      sun(c, w * .5, h * .24, 66, t * .3);
      cloud(c, drift(w, t, 10, 100, 300), 70, 1.2, '#fff0e0'); cloud(c, drift(w, t, 8, 800, 300), 130, 1, '#fff0e0');
      hills(c, w, h * .46, 36, '#c4d98a', 6, 820);
      castle(c, w * .15, h * .52, .78, '#d9c4a3', '#c7455a', t);
      tent(c, w * .82, h * .54, .72, '#e8b866'); tent(c, w * .93, h * .55, .6, '#e86a6a');
      hills(c, w, h * .54, 30, '#9ccf6a', 2, 700);
      c.fillStyle = grad(c, h * .55, h, '#7bc65a', '#4fa046'); c.fillRect(0, h * .55, w, h);
      ink(c, 5); c.beginPath(); c.moveTo(0, h * .55); c.lineTo(w, h * .55); c.stroke();
      c.fillStyle = 'rgba(255,255,255,.14)'; for (let i = 0; i < 18; i++) { ellipse(c, rnd(i) * w, h * (.6 + rnd(i + 4) * .4), 26 + rnd(i + 8) * 20, 5); c.fill(); }
      const adv = smooth(Math.min(1, u * 2.6)), armies = [[-1, '#3a7bff', '#2a58c8', '#cfd8ee', '#ff5a5f', 0], [1, '#e84a5f', '#b5283e', '#e9d5a0', '#ffd23f', .25]];
      armies.forEach(([side, cl, shield, hatCol, flag, off], a) => {
        const ph = (t * .55 + off) % 1, fire = Math.max(0, 1 - ph * 5), cx = w * (.5 + side * .2), cy = h * .64;
        cannon(c, cx, cy, .7, -side, fire);
        for (let q = 0; q < 4; q++) { const p2 = ph * 1.6 - q * .1; if (p2 > 0 && p2 < .8) puff(c, cx - side * (46 + p2 * 60), cy - 46 - p2 * 50, 12 + p2 * 30, (1 - p2 / .8) * .85, '#f4f4fa'); }
        if (ph < .5) { const k = ph / .5, bx = lerp(cx - side * 46, w * (.5 - side * .14), k), by = cy - 46 - Math.sin(k * Math.PI) * 150; ellipse(c, bx, by, 13, 13); fs(c, '#2b2f66', 3.5); for (let q = 1; q < 4; q++) { const k2 = Math.max(0, k - q * .03); puff(c, lerp(cx - side * 46, w * (.5 - side * .14), k2), cy - 46 - Math.sin(k2 * Math.PI) * 150, 8 - q, (1 - q / 4) * .6, '#dfe2ee'); } }
        human(c, w * (.5 + side * .46), h * .72, .72, { skin: SKIN[a + 1], cloth: cl, hat: 'crown', dir: -side, hold: { kind: 'flag', color: flag }, armR: .4, walk: t * 1.2, mood: 'happy', seed: 9 + a });
        for (let r = 0; r < 2; r++) human(c, w * (.5 + side * (.3 - adv * .05 + r * .1)), h * .74, .66, { skin: SKIN[(r + a + 2) % 5], cloth: cl, hat: 'helmet', hatColor: hatCol, dir: -side, hold: r ? 'sword' : 'spear', shield, armR: r ? 2.1 : 1.0, armL: .9, walk: t * 4 + r * 1.7 + a, mood: 'angry', seed: r + a * 4 + 20 });
        for (let r = 0; r < 3; r++) {
          const px = w * (.5 + side * (.26 - adv * .09 + r * .085)), py = h * (.86 + (r % 2) * .07);
          human(c, px, py, .88, { skin: SKIN[(r + a) % 5], cloth: cl, hat: 'helmet', hatColor: hatCol, dir: -side, hold: r % 2 ? 'sword' : 'spear', shield, armR: r % 2 ? 2.1 + Math.sin(t * 7 + r) * .25 : 1.0, armL: .9, walk: t * 4.2 + r * 1.3 + a, mood: 'angry', seed: r + a * 4 });
        }
      });
      for (let i = 0; i < 7; i++) { const side = i % 2 ? 1 : -1, p = (t * .65 + i * .157) % 1, x0 = w * (.5 + side * .3), x1 = w * (.5 - side * .22), x = lerp(x0, x1, p), y = h * .5 - Math.sin(p * Math.PI) * 190 + p * 40, dx = x1 - x0, dy = -Math.cos(p * Math.PI) * Math.PI * 190 + 40, a = Math.atan2(dy, dx); c.save(); c.translate(x, y); c.rotate(a); ink(c, 3.5); c.beginPath(); c.moveTo(-26, 0); c.lineTo(14, 0); c.stroke(); c.beginPath(); c.moveTo(14, -6); c.lineTo(26, 0); c.lineTo(14, 6); c.closePath(); fs(c, '#e6ecfa', 2.5); c.beginPath(); c.moveTo(-26, 0); c.lineTo(-34, -6); c.moveTo(-26, 0); c.lineTo(-34, 6); ink(c, 3); c.stroke(); c.restore(); }
      for (let i = 0; i < 7; i++) { const ph = (t * 1.2 + i * .15) % 1, r = 26 + ph * 54; puff(c, w * .5 + (rnd(i) - .5) * 190, h * .9 - ph * 70, r, (1 - ph) * .9); }
      const hit = Math.max(0, Math.sin(t * 7));
      for (let i = 0; i < 9; i++) { const a = i / 9 * TAU + t * 3, d = 34 + hit * 44 + (i % 3) * 14; star(c, w * .5 + Math.cos(a) * d, h * .78 + Math.sin(a) * d * .7, 15, t, i); }
    },
    court(c, w, h, t, u) {
      c.fillStyle = grad(c, 0, h, '#5a3da8', '#a77be0'); c.fillRect(0, 0, w, h);
      for (const [wx, i] of [[w * .18, 0], [w * .82, 1]]) {
        c.beginPath(); c.moveTo(wx - 46, 250); c.lineTo(wx - 46, 110); c.arc(wx, 110, 46, Math.PI, 0); c.lineTo(wx + 46, 250); c.closePath(); c.fillStyle = grad(c, 60, 250, '#ffd986', '#ff9ac1'); c.fill(); ink(c, 6); c.stroke();
        c.save(); c.clip(); c.strokeStyle = 'rgba(60,30,110,.55)'; c.lineWidth = 4; c.beginPath(); c.moveTo(wx, 60); c.lineTo(wx, 252); c.moveTo(wx - 50, 150); c.lineTo(wx + 50, 150); c.moveTo(wx - 50, 200); c.lineTo(wx + 50, 200); c.stroke(); c.restore();
        c.save(); c.globalAlpha = .1 + Math.sin(t * 1.2 + i) * .03; c.fillStyle = '#fff6c8'; c.beginPath(); c.moveTo(wx - 40, 190); c.lineTo(wx + 40, 190); c.lineTo(wx + (i ? 170 : 120) * (i ? -1 : 1) + 0, h * .9); c.lineTo(wx + (i ? 20 : -90) * (i ? -1 : 1), h * .9); c.closePath(); c.fill(); c.restore();
      }
      for (const x of [w * .09, w * .27, w * .73, w * .91]) { rr(c, x - 36, 36, 72, h - 96, 10); fs(c, '#f1e4c4', 5); c.fillStyle = 'rgba(150,120,70,.25)'; rr(c, x + 6, 44, 14, h - 112, 6); c.fill(); rr(c, x - 50, 24, 100, 28, 8); fs(c, '#e3cf9b', 5); rr(c, x - 50, h - 78, 100, 24, 8); fs(c, '#e3cf9b', 5); }
      for (const x of [w * .27, w * .73]) { rr(c, x - 6, 198, 12, 34, 3); fs(c, '#6a4a2a', 3.5); glow(c, x, 180, 80, '255,190,90', .5); flame(c, x, 198, .8, t, x); }
      for (const [bx, em] of [[w * .355, '#ffd23f'], [w * .645, '#4aa3ff']]) { c.beginPath(); c.moveTo(bx - 40, 0); c.lineTo(bx + 40, 0); c.lineTo(bx + 40, 200); c.lineTo(bx, 230 + Math.sin(t * 1.4 + bx) * 3); c.lineTo(bx - 40, 200); c.closePath(); fs(c, '#d93a5b', 5); ellipse(c, bx, 92, 20, 20); fs(c, em, 4); spark(c, bx, 92, 12, t, '#fff'); }
      for (const cx2 of [w * .3, w * .7]) { c.beginPath(); c.moveTo(cx2, 0); c.lineTo(cx2, 44); ink(c, 4); c.stroke(); ellipse(c, cx2, 62, 62, 12); fs(c, '#ffc83d', 4.5); glow(c, cx2, 56, 110, '255,214,110', .45 + Math.sin(t * 6) * .06); for (let k = -1; k <= 1; k++) { rr(c, cx2 + k * 34 - 5, 40, 10, 22, 3); fs(c, '#fff', 3); flame(c, cx2 + k * 34, 40, .38, t, k + cx2); } }
      c.beginPath(); c.moveTo(w * .36, 0); c.quadraticCurveTo(w * .5, 110, w * .64, 0); c.closePath(); c.save(); c.globalAlpha = .0; c.fill(); c.restore();
      c.fillStyle = grad(c, h * .74, h, '#8d6bc9', '#6c4aa8'); c.fillRect(0, h * .74, w, h);
      c.save(); c.beginPath(); c.rect(0, h * .74, w, h); c.clip(); let yy = h * .74, rh = 20, row = 0; while (yy < h) { for (let xx = -((row % 2) * rh * 1.4); xx < w; xx += rh * 2.8) { if ((Math.floor(xx / (rh * 2.8)) + row) % 2) { c.fillStyle = 'rgba(255,255,255,.1)'; c.fillRect(xx, yy, rh * 2.8, rh); } } yy += rh; rh *= 1.22; row++; } c.restore();
      ink(c, 5); c.beginPath(); c.moveTo(0, h * .74); c.lineTo(w, h * .74); c.stroke();
      c.beginPath(); c.moveTo(w * .42, h * .74); c.lineTo(w * .58, h * .74); c.lineTo(w * .74, h + 10); c.lineTo(w * .26, h + 10); c.closePath(); fs(c, '#e23a56', 5);
      c.save(); c.clip(); c.strokeStyle = '#ffd23f'; c.lineWidth = 6; c.beginPath(); c.moveTo(w * .425, h * .74); c.lineTo(w * .275, h + 10); c.moveTo(w * .575, h * .74); c.lineTo(w * .725, h + 10); c.stroke(); c.restore();
      glow(c, w * .5, h * .5, 280, '255,214,120', .22);
      rr(c, w * .5 - 120, h * .1, 240, h * .64, 44); fs(c, '#ffc83d', 6); rr(c, w * .5 - 86, h * .18, 172, h * .46, 30); fs(c, '#e23a56', 5); ellipse(c, w * .5, h * .1, 24, 24); fs(c, '#ffd23f', 4);
      c.save(); c.fillStyle = '#ffe9a0'; for (const [dx, dy] of [[-60, 120], [60, 120], [0, 170], [-40, 220], [40, 220]]) { ellipse(c, w * .5 + dx, h * .18 + dy * .8, 6, 6); c.fill(); } c.restore();
      const rise = smooth(Math.min(1, u * 3));
      human(c, w * .5, h * .7, 1.32, { skin: SKIN[1], cloth: '#d93a5b', hat: 'crown', beard: true, cape: '#7a1fa2', hold: 'goblet', sit: true, armR: 1.55 + Math.sin(t * 2.2) * .12, armL: .5, walk: t * .8, mood: 'happy', seed: 1 });
      rr(c, w * .5 - 142, h * .66, 284, 54, 14); fs(c, '#e8a82a', 5); rr(c, w * .5 - 142, h * .66, 284, 14, 8); fs(c, '#ffd23f', 4);
      // rương báu
      c.save(); c.translate(w * .055, h * .84); rr(c, -52, -46, 104, 46, 8); fs(c, '#b9773f', 5); rr(c, -52, -64, 104, 24, 10); fs(c, '#d99a58', 5); for (let k = 0; k < 5; k++) { ellipse(c, -34 + k * 17, -66, 11, 7); fs(c, '#ffd23f', 3); } rr(c, -8, -50, 16, 18, 4); fs(c, '#ffd23f', 3.5); spark(c, 30 + Math.sin(t * 3) * 6, -82 - Math.abs(Math.sin(t * 2)) * 10, 11, t * 2, '#fff'); c.restore();
      human(c, w * .46, h * .945, .5, { skin: SKIN[2], cloth: '#ff6bb5', hat: 'hood', hatColor: '#ffd23f', armR: 2.9 + Math.sin(t * 6) * .5, armL: 2.7 + Math.cos(t * 6) * .5, walk: t * 6, bob: 3, mood: 'happy', seed: 12 });
      [[.17, 'turban', '#2f9e6a', 1], [.83, 'hood', '#3b82f6', -1]].forEach(([fx, hat, cl, dir], i) => human(c, w * fx, h * .9, .98 * (.9 + rise * .1), { skin: SKIN[(i + 2) % 5], cloth: cl, hat, hatColor: cl, dir, hold: 'scroll', armR: 1.3 + Math.sin(t * 2.6 + i) * .14, armL: .4, walk: t * .9 + i, mood: 'happy', seed: 3 + i }));
      [[.33, 1], [.67, -1]].forEach(([fx, dir], i) => human(c, w * fx, h * .86, .92, { skin: SKIN[i], cloth: '#4a63c8', hat: 'helmet', dir, hold: 'spear', armR: .8, armL: .4, walk: t * .7 + i * 2, mood: 'calm', seed: 6 + i }));
      [[.4, 1], [.6, -1]].forEach(([fx, dir], i) => human(c, w * fx, h * .74, .64, { skin: SKIN[(i + 3) % 5], cloth: ['#ff8a5b', '#6ccf6a'][i], hat: ['cap', 'turban'][i], hatColor: ['#2f9e6a', '#fff3d6'][i], dir, armR: 2.4 + Math.sin(t * 3 + i) * .3, armL: .5, walk: t + i, mood: 'happy', seed: 14 + i }));
      for (let i = 0; i < 12; i++) { const ph = (t * .8 + i * .31) % 1; c.save(); c.globalAlpha = Math.sin(ph * Math.PI); c.translate(w * (.28 + rnd(i) * .44), h * (.12 + rnd(i + 5) * .5)); c.rotate(t); c.fillStyle = '#fff6b0'; c.beginPath(); for (let k = 0; k < 8; k++) { const r = k % 2 ? 4 : 14; c.lineTo(Math.cos(k / 8 * TAU) * r, Math.sin(k / 8 * TAU) * r); } c.closePath(); c.fill(); c.restore(); }
    },
    market(c, w, h, t, u) {
      sky(c, w, h, '#8fd8ff', '#fff4d6');
      sun(c, w * .5, h * .12, 40, t * .5); cloud(c, drift(w, t, 10, 200, 300), 80, 1.1); cloud(c, drift(w, t, 7, 900, 300), 120, .8);
      [[.05, .56, '#ffb38a', '#d9534f'], [.22, .66, '#8fd3c4', '#4aa3ff'], [.5, .5, '#ffd68a', '#e84a5f'], [.74, .62, '#c7a8ff', '#e8a82a'], [.95, .54, '#ffb38a', '#6ccf6a']].forEach(([fx, hh, wall, roof], i) => house(c, w * fx, h * .62, 1.0 + hh * .55, wall, roof, t, i % 2 === 0));
      c.fillStyle = grad(c, h * .6, h, '#e8cf98', '#cfae6a'); c.fillRect(0, h * .6, w, h);
      ink(c, 5); c.beginPath(); c.moveTo(0, h * .6); c.lineTo(w, h * .6); c.stroke();
      c.fillStyle = 'rgba(120,80,30,.14)'; for (let i = 0; i < 34; i++) { ellipse(c, rnd(i) * w, h * (.64 + rnd(i + 7) * .36), 20 + rnd(i + 3) * 16, 6); c.fill(); }
      bunting(c, -10, h * .12, w * .5, h * .22, t, ['#e84a5f', '#ffd23f', '#3b82f6', '#2fb36a'], 12, 38, 16); bunting(c, w * .5, h * .22, w + 10, h * .1, t, ['#ff8a5b', '#a46bff', '#ffd23f', '#4aa3ff'], 12, 38, 16);
      [[.2, '#e84a5f'], [.5, '#3b82f6'], [.8, '#2fb36a']].forEach(([fx, col], i) => {
        const x = w * fx, y = h * .64;
        rr(c, x - 102, y - 40, 8, 120, 3); fs(c, '#8a5a2b', 3.5); rr(c, x + 94, y - 40, 8, 120, 3); fs(c, '#8a5a2b', 3.5);
        c.beginPath(); c.moveTo(x - 126, y - 36); c.lineTo(x + 126, y - 36); c.lineTo(x + 108, y - 92); c.lineTo(x - 108, y - 92); c.closePath(); fs(c, '#fff', 5);
        c.save(); c.clip(); c.fillStyle = col; for (let k = 0; k < 6; k += 2) c.fillRect(x - 130 + k * 42, y - 100, 42, 80); c.restore();
        c.beginPath(); c.moveTo(x - 126, y - 36); c.lineTo(x + 126, y - 36); ink(c, 5); c.stroke();
        for (let k = 0; k < 6; k++) { ellipse(c, x - 105 + k * 42, y - 33, 9, 7); fs(c, col, 3); }
        lantern(c, x - 70, y - 34, .7, t, i); lantern(c, x + 70, y - 34, .7, t, i + 3);
        human(c, x, y + 118, .98, { skin: SKIN[(i + 1) % 5], cloth: [col, '#ffd23f', '#ff8a5b'][i], hat: ['cap', 'turban', 'hood'][i], hatColor: col, armR: 2.6 + Math.sin(t * 3.2 + i * 2) * .5, armL: .5, walk: t * 1.3 + i, mood: 'happy', seed: i });
        rr(c, x - 108, y + 40, 216, 96, 8); fs(c, '#b9773f', 5); rr(c, x - 112, y + 34, 224, 16, 6); fs(c, '#d99a58', 4);
        for (let k = 0; k < 5; k++) { ellipse(c, x - 72 + k * 36, y + 30, 15, 15); fs(c, ['#ff5a5a', '#ffc83d', '#6ccf6a', '#ff8a2b', '#b36bff'][(k + i) % 5], 3.5); }
        barrel(c, x - 154, y + 112, .62); crate(c, x + 156, y + 112, .6, '#d3a15c'); crate(c, x + 156, y + 76, .46, '#c98d4c');
      });
      cat(c, w * .5 - 154, h * .64 + 112 - 48, .56, t, '#ff9a3c');
      for (let i = 0; i < 4; i++) { const x = (rnd(i + 20) * w + Math.sin(t * .4 + i) * 40 + t * 12 * (i % 2 ? 1 : -1) + w * 2) % w, y = h * (.88 + (i % 2) * .04), pk = Math.max(0, Math.sin(t * 4 + i * 2)); c.save(); c.translate(x, y); ellipse(c, 0, 0, 13, 9); fs(c, '#b8c2d9', 3.5); ellipse(c, 13, -9 + pk * 8, 6, 6); fs(c, '#a2aec9', 3); c.beginPath(); c.moveTo(18, -8 + pk * 8); c.lineTo(25, -5 + pk * 8); ink(c, 3); c.strokeStyle = '#ffb02e'; c.stroke(); c.restore(); }
      [[0, .78, 'basket', '#4aa3ff', 'none'], [1, .72, 'sack', '#ff6b6b', 'cap'], [2, .84, null, '#a46bff', 'hood']].forEach(([off, sc2, hold, cl, hat], i) => { const dir = i % 2 ? -1 : 1, x = ((off * w * .33 + t * (34 + i * 9) * dir + w * 2) % (w + 240)) - 120; human(c, x, h * (.9 + (i % 2) * .02), sc2, { skin: SKIN[(i * 2) % 5], cloth: cl, hat, hatColor: '#ffd23f', dir, hold, armR: .5, walk: t * 5 + i, mood: 'happy', seed: i + 4, hair: '#3a2416' }); });
      human(c, ((w * .1 + t * 55) % (w + 160)) - 80, h * .94, .46, { skin: SKIN[1], cloth: '#ffd23f', hat: 'none', armR: 2.7, armL: 2.7, walk: t * 7, bob: 3, mood: 'happy', hair: '#221410', seed: 20 });
      for (let i = 0; i < 5; i++) { const ph = (t * .9 + i * .21) % 1; c.save(); c.globalAlpha = Math.sin(Math.min(1, ph * 1.2) * Math.PI * .5) * (1 - ph); c.translate(w * (.2 + i * .15), h * .5 - ph * 80); ellipse(c, 0, 0, 16, 16); fs(c, '#ffd23f', 4); heavyChar(c, '$', 0, 8, 20); c.restore(); }
    },
    build(c, w, h, t, u) {
      sky(c, w, h, '#ffcf70', '#fff1c8');
      sun(c, w * .86, h * .18, 56, t);
      cloud(c, drift(w, t, 9, 150, 300), 80, 1.1, '#fff8e6'); cloud(c, drift(w, t, 6, 800, 300), 130, .8, '#fff8e6');
      hills(c, w, h * .6, 30, '#f3d79a', 4, 900);
      for (const [fx, sc] of [[.12, .5], [.24, .34], [.9, .42]]) { c.beginPath(); c.moveTo(w * fx - 130 * sc, h * .62); c.lineTo(w * fx, h * .62 - 200 * sc); c.lineTo(w * fx + 130 * sc, h * .62); c.closePath(); fs(c, '#efc47a', 4.5); }
      c.fillStyle = grad(c, h * .64, h, '#f1cf86', '#d5aa5c'); c.fillRect(0, h * .64, w, h); ink(c, 5); c.beginPath(); c.moveTo(0, h * .64); c.lineTo(w, h * .64); c.stroke();
      palm(c, w * .04, h * .74, .8, t); palm(c, w * .99, h * .72, 1.0, t + 2);
      const base = 500, rows = 7, done = lerp(3, rows, clamp(u * 1.2, 0, 1)), cx = w * .56, by = h * .8, rh = 56;
      for (let r = 0; r < Math.ceil(done); r++) {
        const wr = base * (1 - r / rows), part = smooth(Math.min(1, done - r));
        c.save(); c.translate(0, (1 - part) * -34);
        const x0 = cx - wr / 2, x1 = cx + wr / 2, nx0 = cx - (base * (1 - (r + 1) / rows)) / 2, nx1 = cx + (base * (1 - (r + 1) / rows)) / 2, y = by - r * rh;
        c.beginPath(); c.moveTo(x0, y); c.lineTo(x1, y); c.lineTo(nx1, y - rh); c.lineTo(nx0, y - rh); c.closePath(); fs(c, r % 2 ? '#f0c777' : '#e8b866', 5);
        c.save(); c.clip(); c.strokeStyle = 'rgba(150,100,40,.35)'; c.lineWidth = 2.5; for (let k = 1; k < 7; k++) { c.beginPath(); c.moveTo(x0 + (x1 - x0) * k / 7, y); c.lineTo(nx0 + (nx1 - nx0) * k / 7, y - rh); c.stroke(); } c.restore();
        c.beginPath(); c.moveTo(x1, y); c.lineTo(nx1, y - rh); c.lineTo(nx1 + 24, y - rh + 8); c.lineTo(x1 + 24, y + 8); c.closePath(); fs(c, '#c9944a', 4.5);
        c.restore();
      }
      // cần trục gỗ
      const ax = cx + 190, topY = by - 330, armX = cx - 30, swing = Math.sin(t * 1.5) * 14;
      for (const dx of [-60, 60]) { c.beginPath(); c.moveTo(ax + dx, by + 10); c.lineTo(ax, topY); ink(c, 13); c.stroke(); c.strokeStyle = '#b97c40'; c.lineWidth = 7; c.stroke(); }
      c.beginPath(); c.moveTo(ax, topY); c.lineTo(armX, topY + 26); ink(c, 13); c.stroke(); c.strokeStyle = '#b97c40'; c.lineWidth = 7; c.stroke();
      const dropY = lerp(topY + 120, by - 110, .5 + Math.sin(t * .7) * .4);
      c.beginPath(); c.moveTo(armX, topY + 26); c.lineTo(armX + swing * .6, dropY); ink(c, 4.5); c.stroke();
      c.save(); c.translate(armX + swing * .6, dropY); c.rotate(swing * .004); rr(c, -34, 0, 68, 46, 7); fs(c, '#e8b866', 5); c.beginPath(); c.moveTo(-30, 0); c.lineTo(0, -14); c.lineTo(30, 0); ink(c, 4); c.stroke(); c.restore();
      ellipse(c, armX, topY + 26, 11, 11); fs(c, '#6b6f8f', 4);
      const k = (t * .3) % 1, bx = lerp(w * .08, w * .34, k), by2 = lerp(h * .88, h * .62, k);
      c.beginPath(); c.moveTo(w * .03, h * .9); c.lineTo(w * .4, h * .6); c.lineTo(w * .43, h * .62); c.lineTo(w * .06, h * .94); c.closePath(); fs(c, '#b9773f', 5);
      c.save(); c.translate(bx, by2 - 4); c.rotate(-.6); rr(c, -36, -48, 72, 48, 7); fs(c, '#e8b866', 5); c.restore();
      [0, 1].forEach(i => human(c, bx - 96 - i * 92, by2 + 34 + i * 18, .74, { skin: SKIN[(i + 1) % 5], cloth: ['#ff8a5b', '#3b82f6'][i], hat: 'cap', hatColor: '#fff3d6', armR: 1.5 + Math.sin(t * 5 + i) * .25, armL: 1.5 - Math.sin(t * 5 + i) * .25, walk: t * 5 + i, run: true, mood: 'angry', seed: i }));
      human(c, w * .06, h * .93, .84, { skin: SKIN[3], cloth: '#7a52c7', hat: 'turban', hatColor: '#ffd23f', beard: true, hold: 'scroll', armR: 1.3 + Math.sin(t * 2) * .1, armL: .4, walk: t * .8, mood: 'calm', seed: 15 });
      human(c, w * .2, h * .95, .7, { skin: SKIN[2], cloth: '#4aa3ff', hat: 'cap', hatColor: '#fff3d6', hold: 'sack', armR: .5, walk: t * 3, mood: 'happy', seed: 16 });
      [[.76, 'hammer', 0], [.9, 'hammer', 1]].forEach(([fx, hold, i]) => human(c, w * fx, h * .93, .86, { skin: SKIN[i + 2], cloth: ['#e84a5f', '#4aa3ff'][i], hat: 'turban', hatColor: '#fff3d6', hold, armR: 1.9, armL: .6, walk: t * 2.4 + i * 2, mood: 'happy', seed: i + 5 }));
      crate(c, w * .655, h * .965, .56, '#e8b866'); crate(c, w * .7, h * .965, .56, '#efc47a'); crate(c, w * .677, h * .965 - 38, .46, '#e8b866');
      for (let i = 0; i < 8; i++) { const ph = (t * 1.1 + i * .13) % 1; puff(c, w * (.66 + rnd(i) * .3), h * .9 - ph * 70, 18 + ph * 26, (1 - ph) * .75, '#fff6e0'); }
    },
    volcano(c, w, h, t, u) {
      const shake = Math.sin(t * 38) * 2.5, flash = Math.max(0, Math.sin(t * 3.1) * Math.sin(t * 7.3) - .5) / .5;
      c.save(); c.translate(shake, Math.cos(t * 33) * 2);
      sky(c, w, h, '#5b2a63', '#ff9a52');
      glow(c, w * .51, h * .3, 360, '255,150,60', .5 + Math.sin(t * 4) * .06);
      hills(c, w, h * .56, 70, '#7a3f78', 3, 900);
      const pulse = 1 + Math.sin(t * 5) * .04;
      for (let i = 0; i < 5; i++) { const ph = (t * .35 + i * .22) % 1; ellipse(c, w * .5 + Math.sin(ph * 5 + i) * 70, h * .34 - ph * h * .34, 70 + ph * 130, 52 + ph * 74); c.fillStyle = `rgba(${70 + ph * 40},${55 + ph * 30},${75 + ph * 30},${1 - ph * .6})`; c.fill(); ink(c, 4); c.stroke(); }
      if (flash > 0) { c.fillStyle = `rgba(255,255,255,${flash * .22})`; c.fillRect(-10, -10, w + 20, h + 20); const lx = w * (.3 + rnd(Math.floor(t * 3.1)) * .4); c.beginPath(); c.moveTo(lx, 0); for (let k = 1; k < 6; k++) c.lineTo(lx + (k % 2 ? -26 : 22) + Math.sin(k * 9 + lx) * 12, k * h * .1); ink(c, 12); c.stroke(); c.strokeStyle = `rgba(255,248,170,${.5 + flash * .5})`; c.lineWidth = 6; c.stroke(); }
      cloud(c, drift(w, t, 8, 100, 300), 70, 1.2, '#ffd7b0');
      c.beginPath(); c.moveTo(w * .1, h * .74); c.lineTo(w * .4, h * .3); c.lineTo(w * .46, h * .26); c.lineTo(w * .56, h * .26); c.lineTo(w * .62, h * .3); c.lineTo(w * .92, h * .74); c.closePath(); fs(c, '#7a4a3a', 6);
      c.save(); c.clip(); c.fillStyle = '#5c3428'; c.beginPath(); c.moveTo(w * .5, h * .26); c.lineTo(w * .95, h * .8); c.lineTo(w * .62, h * .8); c.closePath(); c.fill(); c.strokeStyle = 'rgba(40,16,10,.35)'; c.lineWidth = 4; for (const [a, b] of [[.34, .5], [.46, .6], [.58, .55], [.66, .62]]) { c.beginPath(); c.moveTo(w * a, h * .72); c.lineTo(w * (a + .05), h * b); c.stroke(); } c.restore();
      ellipse(c, w * .51, h * .265, 56 * pulse, 14); fs(c, '#ff6a1f', 5);
      for (const [dx, wd, side] of [[-.02, 24, -1], [.03, 18, 1], [.07, 14, 1]]) { const len = h * (.18 + .08 * Math.sin(t * 2 + dx * 40) + .2 * u); c.beginPath(); c.moveTo(w * (.5 + dx), h * .27); c.quadraticCurveTo(w * (.5 + dx * 2.6) + Math.sin(t * 3) * 10, h * .27 + len * .6, w * (.5 + dx * 3.8), h * .27 + len); ink(c, wd + 8); c.stroke(); c.strokeStyle = '#ff7a2b'; c.lineWidth = wd; c.stroke(); c.strokeStyle = '#ffd25a'; c.lineWidth = wd * .4; c.stroke(); }
      for (const [x1, x2, wd] of [[.4, .22, 22], [.62, .8, 20]]) { c.beginPath(); c.moveTo(w * (x1 < .5 ? .47 : .56), h * .28); c.bezierCurveTo(w * x1, h * .45, w * (x1 + (x2 - x1) * .3), h * .6, w * x2, h * .76); ink(c, wd + 8); c.stroke(); c.strokeStyle = '#ff6a1f'; c.lineWidth = wd; c.stroke(); c.save(); c.setLineDash([26, 40]); c.lineDashOffset = -t * 90; c.strokeStyle = '#ffd25a'; c.lineWidth = wd * .45; c.stroke(); c.restore(); }
      for (let i = 0; i < 18; i++) { const ph = (t * .9 + i * .131) % 1, a = -Math.PI / 2 + (rnd(i) - .5) * 1.7, d = 40 + ph * (240 + rnd(i + 3) * 220); c.save(); c.globalAlpha = 1 - ph * .9; ellipse(c, w * .51 + Math.cos(a) * d * .8, h * .26 + Math.sin(a) * d + ph * ph * 300, 9 + rnd(i) * 7, 9 + rnd(i) * 7); fs(c, i % 3 ? '#ff7a2b' : '#ffd25a', 3.5); c.restore(); }
      c.fillStyle = grad(c, h * .74, h, '#4f8a3c', '#37692c'); c.fillRect(-10, h * .74, w + 20, h); ink(c, 5); c.beginPath(); c.moveTo(-10, h * .74); c.lineTo(w + 10, h * .74); c.stroke();
      house(c, w * .1, h * .8, .95, '#f2d6a8', '#c7455a', t, false); house(c, w * .9, h * .8, .85, '#e8c9a0', '#8a5a9a', t, false);
      for (const hx of [w * .1, w * .9]) { glow(c, hx, h * .6, 110, '255,120,40', .55); flame(c, hx - 24, h * .8 - 140 * .9, 1.0, t, hx); flame(c, hx + 18, h * .8 - 126 * .9, .8, t, hx + 2); for (let k = 0; k < 3; k++) { const ph = (t * .5 + k / 3 + hx * .01) % 1; puff(c, hx + Math.sin(ph * 6 + k) * 14, h * .8 - 170 - ph * 100, 12 + ph * 22, (1 - ph) * .7, '#8a7a88'); } }
      tree(c, w * .24, h * .82, .8, t, '#3fae6a'); tree(c, w * .76, h * .82, .75, t, '#3fae6a');
      glow(c, w * .24, h * .72, 80, '255,120,40', .5); flame(c, w * .24, h * .78, .95, t, 4); flame(c, w * .245 + 30, h * .79, .7, t, 5);
      [[0, .78, 'hood', null], [1, .84, 'turban', 'basket'], [2, .76, 'cap', 'sack'], [3, .7, 'none', null], [4, .8, 'hood', null]].forEach(([i, sc2, hat, hold]) => { const dir = i % 2 ? -1 : 1, x = ((w * (.04 + i * .21) + t * (150 + i * 20) * dir + w * 2) % (w + 280)) - 120, y = h * (.9 + (i % 2) * .06); human(c, x, y, sc2, { skin: SKIN[(i + 1) % 5], cloth: ['#4aa3ff', '#ffd23f', '#ff6b6b', '#6ccf6a', '#a46bff'][i], hat, hatColor: '#fff3d6', dir, hold, armR: 2.7 + Math.sin(t * 9 + i) * .35, armL: 2.5 + Math.cos(t * 9 + i) * .35, walk: t * 8 + i, run: true, mood: 'scared', seed: i, hair: '#3a2416' }); });
      c.restore();
    }
  };
  function heavyChar(c, ch, x, y, size) { Cart.heavy(c, ch, x, y, { kind: 'label', size, align: 'center', fill: '#a8731a', stroke: '#a8731a', sw: 0 }); }

  // ---------- Khung ảnh nảy ra / thu vào + chữ dán ----------
  // opts: kind, u (0..1), t, shout, cx, cy, w, h.  Trả về false nếu chưa/không vẽ gì.
  function panel(c, { kind, u, t, shout = '', cx = 960, cy = 618, w = 1400, h = 540, screenW = 1920, screenH = 1080 }) {
    const scene = SCENES[kind];
    if (!scene || u < 0 || u > 1) return false;
    const IN = .14, OUTK = .12;
    const kin = clamp(u / IN, 0, 1), kout = clamp((1 - u) / OUTK, 0, 1);
    const scale = Cart.easeBack(kin) * (.86 + .14 * Math.sqrt(kout)) * (kout < 1 ? .98 + .02 * kout : 1);
    if (scale <= .01) return false;
    // làm tối bản đồ phía sau
    c.save(); c.fillStyle = `rgba(10,20,80,${.4 * Math.min(clamp(u / IN, 0, 1), kout)})`; c.fillRect(0, 0, screenW, screenH); c.restore();
    c.save(); c.translate(cx, cy + (1 - Math.min(kin, kout)) * 40); c.rotate(-.012 + Math.sin(t * .8) * .004 + (1 - kin) * -.08 + (1 - kout) * .06); c.scale(scale, scale);
    // viền: bóng, khung trắng, viền chàm
    rr(c, -w / 2 - 6, -h / 2 + 12, w + 12, h + 12, 44); c.fillStyle = 'rgba(0,10,60,.38)'; c.fill();
    rr(c, -w / 2 - 20, -h / 2 - 20, w + 40, h + 40, 52); c.fillStyle = '#fff'; c.fill(); ink(c, 9); c.stroke();
    c.save(); rr(c, -w / 2, -h / 2, w, h, 36); c.clip();
    c.translate(-w / 2, -h / 2);
    const su = clamp((u - IN * .5) / (1 - IN * .5), 0, 1), z = 1.05 + .035 * su;
    c.save(); c.translate(w / 2, h / 2); c.scale(z, z); c.translate(-w / 2 + lerp(-22, 22, su), -h / 2 + lerp(-7, 7, su));   // máy quay trôi chậm và hơi zoom vào
    scene(c, w, h, t, su);
    c.restore();
    vignette(c, w, h);
    c.restore();
    rr(c, -w / 2, -h / 2, w, h, 36); ink(c, 8); c.stroke();
    c.restore();
    if (shout) {
      const k = clamp((u - .1) / .1, 0, 1) * clamp((1 - u) / .08, 0, 1);
      if (k > 0) {
        let size = 78, wide = 0;
        for (; size > 36; size -= 4) { wide = Cart.measure(c, shout, size, 'display') + size * 1.5; if (wide <= 520) break; }
        Cart.sticker(c, shout, cx + w / 2 - Math.max(210, wide / 2 + 30), cy - h / 2 + 12, { k, rot: .07, size, t });
      }
    }
    return true;
  }

  return { KINDS, SCENES, panel, human, ship, SKIN };
});
