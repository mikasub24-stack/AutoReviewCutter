// Tab «So sánh song song»: vẽ lớp chữ / đồ họa phủ lên video bằng canvas (chạy trong cửa sổ ẩn hoặc trình duyệt kiểm thử).
// Mỗi lớp là một PNG trong suốt, ffmpeg phủ lên hai clip: nền chung (nhãn hai bên, đường chia), huy hiệu mốc + tiến độ,
// phụ đề, thanh pin của từng bên (chuỗi khung để pin tụt dần), thẻ mở đầu và thẻ bài học.
// `geometry(layout)` dùng chung với bộ dựng (Node) để đặt đúng vị trí từng lớp.
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.PairHud = factory();
})(typeof window !== 'undefined' ? window : globalThis, function () {
  'use strict';
  // Baloo 2 (đi kèm app) vẽ chữ Latinh, tiếng Việt và Devanagari; các chữ khác (Nga, Hy Lạp, Ả Rập, Thái, Nhật, Hàn, Trung) lấy font có sẵn của hệ điều hành.
  const FONT = '"PairRound", "Baloo 2", "Segoe UI", "Leelawadee UI", "Nirmala UI", "Microsoft YaHei UI", "Yu Gothic UI", "Malgun Gothic", "Noto Sans", "Noto Sans CJK SC", "Noto Sans Thai", "Noto Sans Arabic", system-ui, sans-serif';
  const SIDE = {
    L: { a: '#ffb347', b: '#ff4d6d', glow: 'rgba(255,110,70,.65)', soft: 'rgba(255,120,80,.18)' },
    R: { a: '#37e8cf', b: '#3b8dff', glow: 'rgba(60,200,255,.6)', soft: 'rgba(60,200,255,.16)' }
  };
  const METER_FPS = 10, METER_HOLD = 4, METER_MOVE = 20;   // 0,4 giây đứng yên rồi 2 giây chạy
  const METER_FRAMES = METER_HOLD + METER_MOVE;
  const clamp = (n, lo, hi) => Math.min(hi, Math.max(lo, n));

  function geometry(layout) {
    if (layout === 'stack') {
      return {
        layout: 'stack', W: 1080, H: 1920,
        half: { L: { x: 0, y: 0, w: 1080, h: 960 }, R: { x: 0, y: 960, w: 1080, h: 960 } },
        label: { L: { cx: 540, cy: 62, maxW: 940 }, R: { cx: 540, cy: 1040, maxW: 940 } },
        meter: { L: { x: 24, y: 806, w: 1032, h: 132 }, R: { x: 24, y: 1632, w: 1032, h: 132 } },
        caption: { x: 34, y: 1762, w: 1012, h: 156 },
        tag: { x: 0, y: 900, w: 1080, h: 120 }
      };
    }
    return {
      layout: 'side', W: 1920, H: 1080,
      half: { L: { x: 0, y: 0, w: 960, h: 1080 }, R: { x: 960, y: 0, w: 960, h: 1080 } },
      label: { L: { cx: 480, cy: 62, maxW: 640 }, R: { cx: 1440, cy: 62, maxW: 640 } },
      meter: { L: { x: 32, y: 774, w: 896, h: 136 }, R: { x: 992, y: 774, w: 896, h: 136 } },
      caption: { x: 94, y: 904, w: 1732, h: 156 },
      tag: { x: 800, y: 0, w: 320, h: 1080 }
    };
  }

  // ---------- Công cụ vẽ ----------
  let geo = geometry('side'), spec = { title: '', left: '', right: '', meter: '', total: 1, lang: 'en', tagline: 'ONE PERSON · TWO PATHS', lessonsTitle: 'WHAT TO TAKE AWAY' };
  function canvas(w, h) {
    const c = document.createElement('canvas');
    c.width = w; c.height = h;
    const ctx = c.getContext('2d');
    ctx.textBaseline = 'alphabetic'; ctx.lineJoin = 'round'; ctx.lineCap = 'round';
    return { c, ctx };
  }
  const png = c => c.toDataURL('image/png');
  const rr = (ctx, x, y, w, h, r) => { ctx.beginPath(); ctx.roundRect(x, y, w, h, Math.min(r, w / 2, h / 2)); };
  const font = (weight, size) => `${weight} ${Math.round(size)}px ${FONT}`;
  const lerp = (a, b, t) => a + (b - a) * t;
  const ease = t => 1 - Math.pow(1 - clamp(t, 0, 1), 3);

  function fitSize(ctx, text, weight, size, maxW, min = 16) {
    let s = size;
    ctx.font = font(weight, s);
    while (s > min && ctx.measureText(text).width > maxW) { s -= 2; ctx.font = font(weight, s); }
    return s;
  }
  // Chữ tượng hình / chữ Thái không có dấu cách giữa các từ: tách theo từng ký tự; chữ có dấu cách thì tách theo từ (từ quá dài cũng tách theo ký tự).
  const NO_SPACE = /[\u0e00-\u0e7f\u3000-\u30ff\u3400-\u9fff\uac00-\ud7af\uff00-\uffef]/;
  function tokensOf(ctx, text, maxW) {
    const out = [];
    String(text).split(/\s+/).filter(Boolean).forEach((w, i) => {
      if (NO_SPACE.test(w) || ctx.measureText(w).width > maxW * .8) Array.from(w).forEach((ch, k) => out.push({ t: ch, sp: k === 0 && i > 0 }));
      else out.push({ t: w, sp: i > 0 });
    });
    return out;
  }
  // Chia chữ thành tối đa maxLines dòng, thu nhỏ cỡ chữ đến khi vừa; dòng cuối quá ngắn thì chia lại cho đều.
  function wrapText(ctx, text, weight, size, maxW, maxLines, min = 20) {
    const full = String(text).replace(/\s+/g, ' ').trim();
    const greedy = limit => {
      const lines = [];
      let line = '';
      for (const tok of tokensOf(ctx, full, maxW)) {
        const next = line ? line + (tok.sp ? ' ' : '') + tok.t : tok.t;
        if (line && ctx.measureText(next).width > limit) { lines.push(line); line = tok.t; } else line = next;
      }
      if (line) lines.push(line);
      return lines;
    };
    const fits = lines => lines.every(l => ctx.measureText(l).width <= maxW + 1);
    for (let s = size; s >= min; s -= 2) {
      ctx.font = font(weight, s);
      let lines = greedy(maxW);
      if (lines.length > maxLines || !fits(lines)) continue;
      if (lines.length > 1) {
        const total = ctx.measureText(full).width;
        for (let k = 1; k <= 6; k++) {
          const balanced = greedy(Math.min(maxW, total / lines.length * (1 + k * .04)));
          if (balanced.length <= lines.length && fits(balanced)) { lines = balanced; break; }
        }
      }
      return { lines, size: s };
    }
    ctx.font = font(weight, min);
    const lines = greedy(maxW);
    while (lines.length > maxLines) { const last = lines.pop(); lines[lines.length - 1] += ' ' + last; }
    return { lines, size: min };
  }
  const PAD = 16;   // lề trong của dải meter / phụ đề để bóng đổ không bị cắt
  const glass = (ctx, x, y, w, h, r, { alpha = .6, edge = .16, blur = 28, drop = 8 } = {}) => {
    ctx.save();
    ctx.shadowColor = 'rgba(0,0,0,.45)'; ctx.shadowBlur = blur; ctx.shadowOffsetY = drop;
    rr(ctx, x, y, w, h, r);
    const g = ctx.createLinearGradient(0, y, 0, y + h);
    g.addColorStop(0, `rgba(22,28,46,${alpha})`); g.addColorStop(1, `rgba(8,11,22,${Math.min(.92, alpha + .14)})`);
    ctx.fillStyle = g; ctx.fill();
    ctx.restore();
    ctx.save();
    rr(ctx, x + .75, y + .75, w - 1.5, h - 1.5, r);
    ctx.strokeStyle = `rgba(255,255,255,${edge})`; ctx.lineWidth = 1.5; ctx.stroke();
    // vệt sáng mảnh ở mép trên cho cảm giác kính
    const shine = ctx.createLinearGradient(x, y, x + w, y);
    shine.addColorStop(0, 'rgba(255,255,255,0)'); shine.addColorStop(.5, 'rgba(255,255,255,.28)'); shine.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.beginPath(); ctx.moveTo(x + r, y + 1.2); ctx.lineTo(x + w - r, y + 1.2); ctx.strokeStyle = shine; ctx.lineWidth = 2; ctx.stroke();
    ctx.restore();
  };
  const textShadow = (ctx, blur = 10, a = .55) => { ctx.shadowColor = `rgba(0,0,0,${a})`; ctx.shadowBlur = blur; ctx.shadowOffsetY = 2; };

  // Chữ trong viên thuốc có nền gradient của một bên.
  function capsule(ctx, text, { cx, cy, maxW, side, size = 34, height = 64, weight = 800 }) {
    const s = fitSize(ctx, text, weight, size, maxW - 70, 18);
    const w = Math.min(maxW, ctx.measureText(text).width + 70), x = cx - w / 2, y = cy - height / 2, col = SIDE[side];
    ctx.save();
    ctx.shadowColor = col.glow; ctx.shadowBlur = 26;
    rr(ctx, x, y, w, height, height / 2);
    const g = ctx.createLinearGradient(x, y, x + w, y + height);
    g.addColorStop(0, col.a); g.addColorStop(1, col.b);
    ctx.fillStyle = g; ctx.fill();
    ctx.restore();
    ctx.save();
    rr(ctx, x + 1, y + 1, w - 2, height / 2, height / 2);   // phản chiếu nửa trên
    ctx.fillStyle = 'rgba(255,255,255,.16)'; ctx.fill();
    ctx.font = font(weight, s); ctx.fillStyle = '#fff'; ctx.textAlign = 'center'; textShadow(ctx, 8, .45);
    ctx.fillText(text, cx, cy + s * .34);
    ctx.restore();
    return { x, y, w, h: height };
  }

  // ---------- Nền chung ----------
  function drawBase() {
    const { W, H } = geo, { c, ctx } = canvas(W, H);
    const top = ctx.createLinearGradient(0, 0, 0, geo.layout === 'stack' ? 240 : 230);
    top.addColorStop(0, 'rgba(0,0,0,.62)'); top.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = top; ctx.fillRect(0, 0, W, geo.layout === 'stack' ? 240 : 230);
    const bottomH = geo.layout === 'stack' ? 420 : 400;
    const bot = ctx.createLinearGradient(0, H - bottomH, 0, H);
    bot.addColorStop(0, 'rgba(0,0,0,0)'); bot.addColorStop(1, 'rgba(0,0,0,.68)');
    ctx.fillStyle = bot; ctx.fillRect(0, H - bottomH, W, bottomH);
    if (geo.layout === 'stack') {
      const mid = ctx.createLinearGradient(0, 940, 0, 980);
      mid.addColorStop(0, 'rgba(0,0,0,0)'); mid.addColorStop(.5, 'rgba(0,0,0,.45)'); mid.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = mid; ctx.fillRect(0, 930, W, 60);
    }
    // đường chia mờ (phần sáng lên theo tiến độ nằm ở lớp huy hiệu)
    ctx.save();
    ctx.strokeStyle = 'rgba(255,255,255,.5)'; ctx.lineWidth = 3; ctx.shadowColor = 'rgba(255,255,255,.45)'; ctx.shadowBlur = 18;
    ctx.beginPath();
    if (geo.layout === 'stack') { ctx.moveTo(0, 960); ctx.lineTo(W, 960); } else { ctx.moveTo(W / 2, 0); ctx.lineTo(W / 2, H); }
    ctx.stroke();
    ctx.restore();
    capsule(ctx, spec.left, { ...geo.label.L, side: 'L' });
    capsule(ctx, spec.right, { ...geo.label.R, side: 'R' });
    return png(c);
  }

  // ---------- Huy hiệu mốc + tiến độ (dải đặt trên đường chia) ----------
  function drawTag(number, label) {
    const { w, h } = geo.tag, { c, ctx } = canvas(w, h), frac = clamp(number / Math.max(1, spec.total), 0, 1);
    const stack = geo.layout === 'stack';
    // phần đường chia đã đi qua: sáng và có ánh
    ctx.save();
    ctx.lineWidth = 6; ctx.shadowColor = 'rgba(255,214,102,.9)'; ctx.shadowBlur = 16;
    const grad = stack ? ctx.createLinearGradient(0, 0, w, 0) : ctx.createLinearGradient(0, 0, 0, h);
    grad.addColorStop(0, '#ffd166'); grad.addColorStop(1, '#ff9f1c');
    ctx.strokeStyle = grad;
    ctx.beginPath();
    if (stack) { ctx.moveTo(0, h / 2); ctx.lineTo(w * frac, h / 2); } else { ctx.moveTo(w / 2, 0); ctx.lineTo(w / 2, h * frac); }
    ctx.stroke();
    ctx.restore();
    // huy hiệu
    const cx = stack ? w / 2 : w / 2, cy = stack ? h / 2 : 62, bh = 62;
    const s = fitSize(ctx, label, 800, 32, w - 120, 18), bw = Math.min(w - 40, Math.max(150, ctx.measureText(label).width + 64));
    ctx.save();
    ctx.shadowColor = 'rgba(255,170,40,.85)'; ctx.shadowBlur = 28;
    rr(ctx, cx - bw / 2, cy - bh / 2, bw, bh, bh / 2);
    const g = ctx.createLinearGradient(0, cy - bh / 2, 0, cy + bh / 2);
    g.addColorStop(0, '#ffe08a'); g.addColorStop(1, '#ff9f1c');
    ctx.fillStyle = g; ctx.fill();
    ctx.restore();
    ctx.save();
    ctx.font = font(800, s); ctx.textAlign = 'center'; ctx.fillStyle = '#3a2200';
    ctx.fillText(label, cx, cy + s * .34);
    ctx.restore();
    // đếm mốc nhỏ: dưới huy hiệu (hai cột) hoặc bên phải huy hiệu (hai tầng, dưới huy hiệu là nhãn bên dưới)
    ctx.save();
    ctx.font = font(700, 22); ctx.fillStyle = 'rgba(255,255,255,.92)'; textShadow(ctx, 8, .8);
    if (stack) { ctx.textAlign = 'left'; ctx.fillText(`${number}/${spec.total}`, cx + bw / 2 + 18, cy + 8); }
    else { ctx.textAlign = 'center'; ctx.fillText(`${number}/${spec.total}`, cx, cy + bh / 2 + 28); }
    ctx.restore();
    return png(c);
  }

  // ---------- Phụ đề ----------
  function drawCaption(text) {
    const W0 = geo.caption.w, H0 = geo.caption.h, { c, ctx } = canvas(W0, H0), w = W0 - 2 * PAD, h = H0 - 2 * PAD;
    ctx.translate(PAD, PAD);
    glass(ctx, 0, 0, w, h, 36, { alpha: .62, blur: 14, drop: 4 });
    const { lines, size } = wrapText(ctx, String(text || ''), 800, geo.layout === 'stack' ? 40 : 44, w - 130, 2, 24);
    ctx.save();
    ctx.font = font(800, size); ctx.textAlign = 'center'; ctx.fillStyle = '#fff'; textShadow(ctx, 6, .5);
    const lh = size * 1.12, y0 = h / 2 - ((lines.length - 1) * lh) / 2 + size * .33;
    lines.forEach((l, i) => ctx.fillText(l, w / 2, y0 + i * lh));
    ctx.restore();
    // hai chấm màu hai bên ở mép phụ đề
    for (const [side, x] of [['L', 44], ['R', w - 44]]) {
      ctx.save(); ctx.fillStyle = SIDE[side].a; ctx.shadowColor = SIDE[side].glow; ctx.shadowBlur = 14;
      ctx.beginPath(); ctx.arc(x, h / 2, 9, 0, Math.PI * 2); ctx.fill(); ctx.restore();
    }
    return png(c);
  }

  // ---------- Thanh pin ----------
  const levelColor = v => v >= 60 ? ['#7dffc8', '#18c98a'] : v >= 35 ? ['#ffe27a', '#ffae1a'] : ['#ff8f9b', '#ff3b52'];
  function drawMeter(side, value, previous) {
    const W0 = geo.meter[side].w, H0 = geo.meter[side].h, { c, ctx } = canvas(W0, H0), w = W0 - 2 * PAD, h = H0 - 2 * PAD, v = clamp(value, 0, 100), col = SIDE[side];
    ctx.translate(PAD, PAD);
    glass(ctx, 0, 0, w, h, 30, { alpha: .6, blur: 14, drop: 4 });
    // vạch màu của bên ở mép trái panel
    ctx.save(); rr(ctx, 0, 0, 12, h, 6); const eg = ctx.createLinearGradient(0, 0, 0, h); eg.addColorStop(0, col.a); eg.addColorStop(1, col.b); ctx.fillStyle = eg; ctx.fill(); ctx.restore();
    ctx.save();
    ctx.font = font(700, 25); ctx.fillStyle = 'rgba(255,255,255,.82)'; ctx.textAlign = 'left'; textShadow(ctx, 6, .5);
    const name = spec.meter || '';
    ctx.fillText(name, 40, 36);
    ctx.restore();
    // pin
    const bx = 40, by = 50, bw = w - 40 - 190, bh = 36;
    ctx.save();
    rr(ctx, bx, by, bw, bh, 12); ctx.fillStyle = 'rgba(255,255,255,.1)'; ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,.7)'; ctx.lineWidth = 3; ctx.stroke();
    rr(ctx, bx + bw + 4, by + 9, 9, bh - 18, 4); ctx.fillStyle = 'rgba(255,255,255,.7)'; ctx.fill();
    ctx.restore();
    const fillW = Math.max(0, (bw - 10) * v / 100), [c1, c2] = levelColor(v);
    if (fillW > 1) {
      ctx.save();
      rr(ctx, bx + 5, by + 5, bw - 10, bh - 10, 8); ctx.clip();
      ctx.shadowColor = c2; ctx.shadowBlur = 18;
      const g = ctx.createLinearGradient(0, by, 0, by + bh); g.addColorStop(0, c1); g.addColorStop(1, c2);
      ctx.fillStyle = g; rr(ctx, bx + 5, by + 5, Math.max(8, fillW), bh - 10, 8); ctx.fill();
      ctx.shadowBlur = 0;
      ctx.fillStyle = 'rgba(255,255,255,.28)'; ctx.fillRect(bx + 5, by + 5, Math.max(8, fillW), (bh - 10) * .4);
      ctx.restore();
    }
    // vạch chia mỗi 10%
    ctx.save(); ctx.strokeStyle = 'rgba(0,0,0,.28)'; ctx.lineWidth = 2;
    for (let i = 1; i < 10; i++) { const x = bx + 5 + (bw - 10) * i / 10; ctx.beginPath(); ctx.moveTo(x, by + 8); ctx.lineTo(x, by + bh - 8); ctx.stroke(); }
    ctx.restore();
    // số %
    ctx.save();
    ctx.font = font(800, 62); ctx.textAlign = 'right'; ctx.fillStyle = c2; ctx.shadowColor = c2; ctx.shadowBlur = 16;
    const label = `${Math.round(v)}%`;
    ctx.fillText(label, w - 28, h - 22);
    const labelW = ctx.measureText(label).width;
    ctx.restore();
    // mũi tên chiều thay đổi, nằm ngay trước số %
    if (Number.isFinite(previous) && Math.round(previous) !== Math.round(v)) {
      const up = v > previous;
      ctx.save();
      ctx.fillStyle = up ? '#7dffc8' : '#ff6b7d'; ctx.shadowColor = ctx.fillStyle; ctx.shadowBlur = 10;
      const ax = w - 28 - labelW - 24, ay = h - 50;
      ctx.beginPath();
      if (up) { ctx.moveTo(ax, ay - 14); ctx.lineTo(ax - 14, ay + 8); ctx.lineTo(ax + 14, ay + 8); } else { ctx.moveTo(ax, ay + 14); ctx.lineTo(ax - 14, ay - 8); ctx.lineTo(ax + 14, ay - 8); }
      ctx.closePath(); ctx.fill();
      ctx.restore();
    }
    return png(c);
  }
  // Chuỗi khung pin: đứng yên rồi chạy từ `from` đến `to` (làm chậm dần cuối). from == to → một khung.
  function meterSeq(side, from, to) {
    if (Math.round(from) === Math.round(to)) return [drawMeter(side, to)];
    const out = [];
    for (let i = 0; i < METER_FRAMES; i++) {
      const t = i < METER_HOLD ? 0 : (i - METER_HOLD + 1) / METER_MOVE;
      out.push(drawMeter(side, lerp(from, to, ease(t)), from));
    }
    return out;
  }

  // ---------- Thẻ mở đầu / bài học ----------
  const tagline = () => spec.tagline;
  function drawIntro() {
    const { W, H } = geo, { c, ctx } = canvas(W, H), stack = geo.layout === 'stack';
    const cw = stack ? W - 100 : 1500, ch = stack ? 760 : 560, cx = (W - cw) / 2, cy = (H - ch) / 2 - (stack ? 40 : 10);
    glass(ctx, cx, cy, cw, ch, 48, { alpha: .66, edge: .22 });
    ctx.save();
    ctx.font = font(700, stack ? 30 : 32); ctx.textAlign = 'center'; ctx.fillStyle = 'rgba(255,214,102,.95)'; textShadow(ctx, 8, .5);
    ctx.fillText(tagline(), W / 2, cy + 82);
    ctx.restore();
    const { lines, size } = wrapText(ctx, spec.title, 800, stack ? 88 : 96, cw - 140, 3, 40);
    ctx.save();
    ctx.font = font(800, size); ctx.textAlign = 'center'; ctx.fillStyle = '#fff'; textShadow(ctx, 14, .6);
    const lh = size * 1.1, y0 = cy + ch * .44 - ((lines.length - 1) * lh) / 2 + size * .3;
    lines.forEach((l, i) => ctx.fillText(l, W / 2, y0 + i * lh));
    ctx.restore();
    const my = cy + ch - 92;
    if (stack) {
      capsule(ctx, spec.left, { cx: W / 2, cy: my - 40, maxW: cw - 120, side: 'L', size: 34, height: 66 });
      capsule(ctx, spec.right, { cx: W / 2, cy: my + 46, maxW: cw - 120, side: 'R', size: 34, height: 66 });
    } else {
      capsule(ctx, spec.left, { cx: W / 2 - 360, cy: my, maxW: 640, side: 'L', size: 36, height: 70 });
      capsule(ctx, spec.right, { cx: W / 2 + 360, cy: my, maxW: 640, side: 'R', size: 36, height: 70 });
      ctx.save();
      ctx.font = font(800, 34); ctx.textAlign = 'center'; ctx.fillStyle = '#fff'; textShadow(ctx, 8, .6);
      ctx.fillText('VS', W / 2, my + 12);
      ctx.restore();
    }
    return png(c);
  }
  function check(ctx, x, y, r, color) {
    ctx.save();
    ctx.fillStyle = color; ctx.shadowColor = color; ctx.shadowBlur = 14;
    ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill();
    ctx.shadowBlur = 0; ctx.strokeStyle = '#08121c'; ctx.lineWidth = r * .24;
    ctx.beginPath(); ctx.moveTo(x - r * .42, y + r * .02); ctx.lineTo(x - r * .1, y + r * .34); ctx.lineTo(x + r * .46, y - r * .32); ctx.stroke();
    ctx.restore();
  }
  // Các lớp của thẻ bài học: [khung nền + tiêu đề, từng bài học…, câu cuối]; mỗi lớp là ảnh đủ khung hình.
  function drawOutro(lessons, closing) {
    const { W, H } = geo, stack = geo.layout === 'stack', out = [];
    const cw = stack ? W - 100 : 1500, rows = Math.max(1, lessons.length), rowH = stack ? 104 : 92;
    const ch = 220 + rows * rowH + (closing ? (stack ? 190 : 150) : 30), cx = (W - cw) / 2, cy = (H - ch) / 2;
    {
      const { c, ctx } = canvas(W, H);
      glass(ctx, cx, cy, cw, ch, 48, { alpha: .68, edge: .22 });
      ctx.save();
      ctx.font = font(800, 62); ctx.textAlign = 'center'; ctx.fillStyle = '#ffd166'; textShadow(ctx, 12, .55);
      ctx.fillText(spec.lessonsTitle, W / 2, cy + 108);
      ctx.restore();
      out.push(png(c));
    }
    lessons.forEach((text, i) => {
      const { c, ctx } = canvas(W, H), y = cy + 190 + i * rowH + rowH / 2;
      const side = i % 2 ? 'R' : 'L';
      check(ctx, cx + 92, y, 26, SIDE[side].a);
      const { lines, size } = wrapText(ctx, text, 800, stack ? 44 : 50, cw - 260, 2, 26);
      ctx.save();
      ctx.font = font(800, size); ctx.textAlign = 'left'; ctx.fillStyle = '#fff'; textShadow(ctx, 8, .5);
      const lh = size * 1.1, y0 = y - ((lines.length - 1) * lh) / 2 + size * .33;
      lines.forEach((l, k) => ctx.fillText(l, cx + 150, y0 + k * lh));
      ctx.restore();
      out.push(png(c));
    });
    if (closing) {
      const { c, ctx } = canvas(W, H), y = cy + 190 + rows * rowH + (stack ? 110 : 76);
      const { lines, size } = wrapText(ctx, closing, 800, stack ? 54 : 58, cw - 180, 2, 28);
      ctx.save();
      const g = ctx.createLinearGradient(cx, 0, cx + cw, 0); g.addColorStop(0, SIDE.L.a); g.addColorStop(1, SIDE.R.a);
      ctx.fillStyle = g; ctx.font = font(800, size); ctx.textAlign = 'center'; ctx.shadowColor = 'rgba(0,0,0,.6)'; ctx.shadowBlur = 10;
      const lh = size * 1.12, y0 = y - ((lines.length - 1) * lh) / 2 + size * .3;
      lines.forEach((l, i) => ctx.fillText(l, W / 2, y0 + i * lh));
      ctx.restore();
      out.push(png(c));
    }
    return out;
  }

  // ---------- Giao diện gọi từ bộ dựng ----------
  function init(options = {}) {
    geo = geometry(options.layout);
    spec = { title: String(options.title || ''), left: String(options.left || ''), right: String(options.right || ''), meter: String(options.meter || ''), total: Math.max(1, Number(options.total) || 1), lang: String(options.lang || 'en'), tagline: String(options.tagline || 'ONE PERSON · TWO PATHS'), lessonsTitle: String(options.lessonsTitle || 'WHAT TO TAKE AWAY') };
    return { W: geo.W, H: geo.H };
  }
  async function ready() {
    if (typeof document === 'undefined') return false;
    if (document.fonts && document.fonts.load) await Promise.all(['800 40px PairRound', '700 40px PairRound'].map(f => document.fonts.load(f, 'ĂÂÊÔƠƯĐ ăâêôơưđ ạảấầẩẫậắằẳẵặ')));
    return true;
  }

  return {
    METER_FPS, METER_HOLD, METER_FRAMES, SIDE, geometry, init, ready,
    base: drawBase, tag: drawTag, caption: drawCaption, meter: drawMeter, meterSeq, intro: drawIntro, outro: drawOutro
  };
});
