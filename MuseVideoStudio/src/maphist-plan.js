/* Tab «Bản đồ lịch sử»: kịch bản (JSON) → dòng thời gian của video bản đồ hoạt hình.
   File này thuần tính toán (không đụng Electron / canvas): kiểm tra và chuẩn hóa kịch bản, tra vùng lãnh thổ trong dữ liệu bản đồ,
   chọn góc nhìn, chia thời gian theo lời đọc, và cho biết ở giây t video đang ở cảnh nào / camera ở đâu.
   Lời đọc và chữ trên video luôn bằng TIẾNG ANH (video làm cho khán giả nước ngoài); chỉ lời nhắc gửi Muse và thông báo cho người dùng bằng tiếng Việt. */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(require('./maphist-geo.js'));
  else root.maphistPlan = factory(root.maphistGeo);
})(typeof window !== 'undefined' ? window : globalThis, function (Geo) {
  'use strict';
  const W = 1920, H = 1080, CY = 505;                    // điểm neo camera trên màn hình (chừa chỗ cho đồng hồ năm + địa cầu ở trên, thẻ lời đọc ở dưới)
  const FIT_W = 1560, FIT_H = 640;                       // vùng nhìn thấy dành cho lãnh thổ
  const INTRO = 3.2, OUTRO = 4.2, TAIL = 1.0, LEAD = 0.7, MIN_ERA = 8.5, WORDS_PER_SECOND = 2.55;
  const ERA_SECONDS = 16;                                // mỗi giai đoạn dài trung bình ~16 giây
  const MIN_MINUTES = 1, MAX_MINUTES = 10, DEFAULT_MINUTES = 5;
  const MOODS = ['happy', 'proud', 'tired', 'angry', 'sad', 'calm'];
  const FLAGS = ['solid', 'h', 'v', 'disc', 'cross'];
  const MARKERS = ['city', 'capital', 'temple', 'castle', 'ship', 'battle'];
  const ICONS = ['sail', 'crown', 'swords', 'star', 'flag', 'person', 'rocket', 'scroll', 'castle'];
  const PALETTE = ['#b5412f', '#2f7f78', '#c58a1d', '#4b5fa3', '#7a3b69', '#5b7c3a', '#c0663a', '#3d6e91'];   // màu pigment cổ
  const clamp = (x, a, b) => Math.min(b, Math.max(a, x));
  const lerp = (a, b, t) => a + (b - a) * t;
  const easeInOut = t => { t = clamp(t, 0, 1); return t < .5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2; };
  const flat = s => String(s == null ? '' : s).replace(/\s+/g, ' ').trim();
  const words = s => (flat(s).match(/[^\s]+/g) || []).length;
  const mer = (lon, lat) => [lon * Math.PI / 180, Math.log(Math.tan(Math.PI / 4 + clamp(lat, -82, 82) * Math.PI / 360))];
  const unmerLat = my => (2 * Math.atan(Math.exp(my)) - Math.PI / 2) * 180 / Math.PI;
  const hex = (c, fallback) => { const m = /^#?([0-9a-f]{6}|[0-9a-f]{3})$/i.exec(String(c || '').trim()); if (!m) return fallback; const h = m[1].length === 3 ? m[1].replace(/./g, x => x + x) : m[1]; return '#' + h.toLowerCase(); };
  const num = (v, fallback = null) => { const n = typeof v === 'string' ? Number(v.replace(/[,_\s]/g, '')) : Number(v); return Number.isFinite(n) ? n : fallback; };

  function eraCount(minutes) { return clamp(Math.round(clamp(num(minutes, DEFAULT_MINUTES), MIN_MINUTES, MAX_MINUTES) * 60 / ERA_SECONDS), 4, 40); }
  function options(input = {}) {
    return {
      topic: flat(input.topic).slice(0, 300),
      minutes: clamp(Math.round(num(input.minutes, DEFAULT_MINUTES)), MIN_MINUTES, MAX_MINUTES),
      country: flat(input.country).slice(0, 80),             // chỉ khi người dùng muốn ép nước; để trống = Muse tự chọn từ chủ đề
      voice: flat(input.voice).slice(0, 80),
      tempo: clamp(num(input.tempo, 1), .7, 1.3),
      music: String(input.music || '').slice(0, 600),
      musicVolume: clamp(num(input.musicVolume, .2), 0, 1),
      aspect: '16:9'
    };
  }
  function problems(config) {
    const out = [];
    if (config.topic.length < 3) out.push('Gõ chủ đề trước (ví dụ: History of Vietnam, The Mongol Empire).');
    return out;
  }

  // ---------- Năm hiển thị ----------
  function yearLabel(year) {
    const y = Math.round(num(year, 0));
    if (y < 0) return `${-y} BC`;
    if (y < 1000) return `${y} AD`;
    return String(y);
  }

  // ---------- Chuẩn hóa kịch bản ----------
  // raw: object kịch bản (do Muse viết hoặc người dùng sửa). geo: chỉ mục từ maphist-geo (có thể null khi chỉ cần kiểm tra chữ).
  // Trả về { script, issues:[{era, text}] }: script đã sạch (luôn dựng được), issues là cảnh báo cho người dùng sửa.
  function normalizeScript(raw, geo) {
    const issues = [];
    const src = raw && typeof raw === 'object' ? raw : {};
    const country = flat(src.country).slice(0, 80);
    const main = geo && country ? (geo.resolve(country) || [])[0] : null;
    const mainA3 = main ? main.a3 : '';
    if (geo && country && !main) issues.push({ era: 0, text: `Không nhận ra nước «${country}» trong dữ liệu bản đồ.` });
    const eras = [];
    const list = Array.isArray(src.eras) ? src.eras : [];
    list.forEach((e, idx) => {
      if (!e || typeof e !== 'object') return;
      const n = idx + 1;
      const year = num(e.year);
      const narration = flat(e.narration).slice(0, 900);
      if (year == null) { issues.push({ era: n, text: `Giai đoạn ${n}: thiếu năm.` }); }
      if (words(narration) < 8) issues.push({ era: n, text: `Giai đoạn ${n}: lời đọc quá ngắn.` });
      const realms = [];
      (Array.isArray(e.realms) ? e.realms : []).slice(0, 6).forEach((r, ri) => {
        if (!r || typeof r !== 'object') return;
        const name = flat(r.name).slice(0, 60) || `Realm ${ri + 1}`;
        const regions = (Array.isArray(r.regions) ? r.regions : typeof r.regions === 'string' ? r.regions.split(/[;,]/) : []).map(flat).filter(Boolean).slice(0, 60);
        const circles = (Array.isArray(r.circles) ? r.circles : []).map(c => {
          const at = Array.isArray(c && c.at) ? c.at.map(v => num(v)) : [];
          const km = num(c && c.km);
          return at.length === 2 && at.every(v => v != null) && km ? { at: [clamp(at[0], -180, 180), clamp(at[1], -85, 85)], km: clamp(Math.round(km), 20, 6000) } : null;
        }).filter(Boolean).slice(0, 12);
        const color = hex(r.color, PALETTE[ri % PALETTE.length]);
        const colors = (Array.isArray(r.colors) ? r.colors : []).map(c => hex(c, '')).filter(Boolean).slice(0, 3);
        const flag = FLAGS.includes(String(r.flag)) ? String(r.flag) : (colors.length > 1 ? 'h' : 'solid');
        const units = [], unknown = [];
        if (geo) {
          for (const name2 of regions) {
            const hit = geo.resolve(name2, mainA3);
            if (!hit) { unknown.push(name2); continue; }
            for (const u of hit) if (!units.includes(u.key)) units.push(u.key);
          }
          for (const c of circles) { const k = Geo.blobKey(c.at[0], c.at[1], c.km); if (!units.includes(k)) units.push(k); }
          if (unknown.length) issues.push({ era: n, text: `Giai đoạn ${n} · «${name}»: không tìm thấy vùng ${unknown.slice(0, 6).join(', ')}${unknown.length > 6 ? '…' : ''}.` });
          if (!units.length) issues.push({ era: n, text: `Giai đoạn ${n} · «${name}»: chưa có vùng nào để tô.` });
        }
        realms.push({ name, regions, circles, color, colors: colors.length ? colors : [color], flag, mood: MOODS.includes(String(r.mood)) ? String(r.mood) : 'happy', face: r.face === true || r.face === 'true' || (r.face == null && ri === 0), units, unknown });
      });
      const markers = (Array.isArray(e.markers) ? e.markers : []).slice(0, 6).map(m => {
        if (!m || typeof m !== 'object') return null;
        const at = Array.isArray(m.at) ? m.at.map(v => num(v)) : [];
        if (at.length !== 2 || at.some(v => v == null)) return null;
        const type = MARKERS.includes(String(m.type)) ? String(m.type) : 'city';
        return { type, name: flat(m.name).slice(0, 28), at: [clamp(at[0], -180, 180), clamp(at[1], -85, 85)] };
      }).filter(Boolean);
      const routes = (Array.isArray(e.routes) ? e.routes : []).slice(0, 3).map(r => {
        const pts = (Array.isArray(r && r.points) ? r.points : []).map(p => Array.isArray(p) && p.length === 2 ? [num(p[0]), num(p[1])] : null).filter(p => p && p[0] != null && p[1] != null).slice(0, 12);
        return pts.length >= 2 ? { points: pts.map(p => [clamp(p[0], -180, 180), clamp(p[1], -85, 85)]), ship: r.ship !== false } : null;
      }).filter(Boolean);
      const view = e.view && typeof e.view === 'object' ? { lon: num(e.view.lon), lat: num(e.view.lat), span: num(e.view.span) } : null;
      eras.push({
        year: year == null ? (eras.length ? eras[eras.length - 1].year + 10 : 0) : Math.round(year),
        title: flat(e.title).slice(0, 48) || `Era ${n}`,
        caption: flat(e.caption).slice(0, 150) || flat(narration).split(/(?<=[.!?])\s/)[0].slice(0, 150),
        narration,
        population: num(e.population) > 0 ? Math.round(num(e.population)) : 0,
        icon: ICONS.includes(String(e.icon)) ? String(e.icon) : '',
        realms, markers, routes,
        view: view && view.lon != null && view.lat != null && view.span > 0 ? { lon: clamp(view.lon, -180, 180), lat: clamp(view.lat, -80, 80), span: clamp(view.span, 3, 340) } : null
      });
    });
    if (!eras.length) issues.push({ era: 0, text: 'Kịch bản chưa có giai đoạn nào.' });
    return {
      script: { title: flat(src.title).slice(0, 120) || 'History', subtitle: flat(src.subtitle).slice(0, 120), country, outro: flat(src.outro).slice(0, 120), eras },
      issues
    };
  }

  // ---------- Góc nhìn camera ----------
  // Camera = { lon, lat, span }: điểm địa lý ở tâm vùng nhìn (W/2, CY) và số độ kinh tuyến trải hết bề ngang W.
  function fit(bb, pad = 1.18) {
    const [x0, y0] = mer(bb[0], bb[1]), [x1, y1] = mer(bb[2], bb[3]);
    const dx = Math.max(x1 - x0, .02), dy = Math.max(y1 - y0, .02);
    const S = Math.min(FIT_W / (dx * pad), FIT_H / (dy * pad));
    const span = clamp(W / S * 180 / Math.PI, 5, 340);
    return { lon: clamp((bb[0] + bb[2]) / 2, -180, 180), lat: clamp(unmerLat((y0 + y1) / 2), -80, 80), span };
  }
  const merge = (a, b) => !a ? b : [Math.min(a[0], b[0]), Math.min(a[1], b[1]), Math.max(a[2], b[2]), Math.max(a[3], b[3])];
  function unitBox(geo, key) {
    const b = Geo.parseBlob(key);
    if (b) { const dLat = b.km / 111, dLon = b.km / (111 * Math.max(.2, Math.cos(b.lat * Math.PI / 180))); return [b.lon - dLon, b.lat - dLat, b.lon + dLon, b.lat + dLat]; }
    const u = geo.units.get(key);
    return u ? bigRingsBox(u) : null;
  }
  // Hộp bao quanh phần chính của đơn vị (bỏ các đảo xa nhỏ để camera không bị kéo ra quá rộng, ví dụ Pháp và Guyane).
  function bigRingsBox(u) {
    const rings = u.rings.map(r => ({ bb: r.bb, size: (r.bb[2] - r.bb[0]) * (r.bb[3] - r.bb[1]) }));
    const max = Math.max(...rings.map(r => r.size));
    let box = null;
    for (const r of rings) if (r.size >= max * .04) box = merge(box, r.bb);
    return box || u.bb;
  }
  function viewFor(era, geo, mainUnit) {
    if (era.view) return era.view;
    let box = null;
    for (const realm of era.realms) for (const key of realm.units) { const b = unitBox(geo, key); if (b) box = merge(box, b); }
    for (const m of era.markers) box = merge(box, [m.at[0], m.at[1], m.at[0], m.at[1]]);
    for (const r of era.routes) for (const p of r.points) box = merge(box, [p[0], p[1], p[0], p[1]]);
    if (!box && mainUnit) box = bigRingsBox(mainUnit);
    return box ? fit(box) : { lon: 10, lat: 25, span: 300 };
  }
  const WORLD_VIEW = { lon: 10, lat: 28, span: 330 };

  // Ước lượng thời gian đọc (giây) khi chưa có giọng thật.
  const speakSeconds = text => Math.max(2, words(text) / WORDS_PER_SECOND);

  // durations: số giây giọng đọc từng giai đoạn (nếu có). Trả về dòng thời gian đầy đủ để vẽ.
  function compile(script, geo, { durations = [], fps = 30, minEra = MIN_ERA } = {}) {
    const mainHit = geo && script.country ? (geo.resolve(script.country) || [])[0] : null;
    const eras = script.eras.map((e, i) => {
      const voice = num(durations[i]) > 0 ? num(durations[i]) : speakSeconds(e.narration);
      return { ...e, index: i, voice, dur: Math.max(minEra, LEAD + voice + TAIL), label: yearLabel(e.year) };
    });
    let t = INTRO;
    for (const e of eras) { e.start = t; e.end = t + e.dur; t = e.end; if (geo) e.view = viewFor(e, geo, mainHit); else e.view = e.view || { ...WORLD_VIEW }; }
    // Mốc trên thanh thời gian: tối đa 9 mốc rải đều, luôn có giai đoạn đầu và cuối.
    const pick = [];
    if (eras.length) { const n = Math.min(9, eras.length); for (let k = 0; k < n; k++) pick.push(Math.round(k * (eras.length - 1) / Math.max(1, n - 1))); }
    const order = [...new Set(pick)];
    const icons = ['sail', 'crown', 'swords', 'star', 'flag', 'scroll', 'castle', 'person', 'rocket'];
    const milestones = order.map((idx, k) => ({ era: idx, year: eras[idx].year, label: eras[idx].label, icon: eras[idx].icon || icons[k % icons.length] }));
    const outroStart = t;
    return {
      title: script.title, subtitle: script.subtitle, outro: script.outro, country: script.country, fps, W, H,
      introEnd: INTRO, outroStart, total: outroStart + OUTRO, worldView: { ...WORLD_VIEW },
      eras, milestones,
      focus: mainHit ? mainHit.a3 : ''
    };
  }

  // Máy bay camera từ góc nhìn a sang b với vòng zoom-out khi đi xa.
  function flyCam(a, b, e) {
    const [ax, ay] = mer(a.lon, a.lat), [bx, by] = mer(b.lon, b.lat);
    const lon = lerp(a.lon, b.lon, e), lat = unmerLat(lerp(ay, by, e));
    const base = Math.exp(lerp(Math.log(a.span), Math.log(b.span), e));
    const dist = Math.hypot(a.lon - b.lon, a.lat - b.lat), far = clamp(dist / Math.max(a.span, b.span) * .45, 0, .75);
    return { lon, lat, span: clamp(base * (1 + far * Math.sin(Math.PI * e)), 3, 360) };
  }

  // Trạng thái ở giây t: pha, giai đoạn, camera, tiến độ cục bộ.
  function stateAt(tl, t) {
    const eras = tl.eras;
    if (!eras.length) return { phase: 'intro', p: 0, cam: tl.worldView, era: null, prev: null, index: -1, local: 0, moving: false };
    if (t < tl.introEnd) {
      const p = clamp(t / tl.introEnd, 0, 1);
      return { phase: 'intro', p, cam: flyCam(tl.worldView, eras[0].view, easeInOut(p)), era: null, prev: null, index: -1, local: t, moving: true };
    }
    if (t >= tl.outroStart) {
      const last = eras[eras.length - 1], p = clamp((t - tl.outroStart) / (tl.total - tl.outroStart), 0, 1);
      return { phase: 'outro', p, cam: { ...last.view, span: last.view.span * (1 + .12 * easeInOut(p)) }, era: last, prev: eras.length > 1 ? eras[eras.length - 2] : null, index: eras.length - 1, local: last.dur + (t - tl.outroStart), moving: true };
    }
    let i = 0;
    while (i < eras.length - 1 && t >= eras[i + 1].start) i++;
    const era = eras[i], local = t - era.start, prev = i ? eras[i - 1] : null;
    const move = Math.min(2.2, era.dur * .28);
    const cam = prev ? flyCam(prev.view, era.view, easeInOut(local / move)) : era.view;
    return { phase: 'era', p: clamp(local / era.dur, 0, 1), cam, era, prev, index: i, local, moving: Boolean(prev) && local < move };
  }

  // ---------- Năm / dân số đếm lên ----------
  function counterAt(state) {
    const { era, prev, local } = state;
    if (!era) return { year: null, pop: 0 };
    const e = clamp(local / 1.5, 0, 1), k = 1 - Math.pow(1 - e, 3);
    const from = prev ? prev.year : era.year - (Math.abs(era.year) > 200 ? 90 : 25);
    const popFrom = prev && prev.population ? prev.population : era.population * .4;
    return { year: Math.round(lerp(from, era.year, k)), yearF: lerp(from, era.year, k), pop: era.population ? Math.round(lerp(popFrom, era.population, k)) : 0 };
  }

  // ---------- Lời đọc hiện theo câu, từng từ sáng lên đúng nhịp giọng ----------
  // Chia lời đọc thành các cụm (câu; câu dài cắt ở dấu phẩy) và gán mốc thời gian theo số ký tự trên cả đoạn giọng.
  function chunksOf(text) {
    const clean = flat(text);
    if (!clean) return [];
    let parts = clean.split(/(?<=[.!?…])\s+/).filter(Boolean);
    const split = piece => {
      if (piece.length <= 150) return [piece];
      const mid = piece.length / 2;
      let best = -1;
      for (let i = 0; i < piece.length; i++) if (/[,;:—]/.test(piece[i]) && piece[i + 1] === ' ' && (best < 0 || Math.abs(i - mid) < Math.abs(best - mid))) best = i;
      if (best < 20 || best > piece.length - 20) { const sp = piece.lastIndexOf(' ', Math.floor(mid)); return sp > 20 ? [piece.slice(0, sp), piece.slice(sp + 1)].flatMap(split) : [piece]; }
      return [piece.slice(0, best + 1), piece.slice(best + 2)].flatMap(split);
    };
    parts = parts.flatMap(split);
    const merged = [];
    for (const part of parts) { if (merged.length && (part.length < 24 || merged[merged.length - 1].length < 24)) merged[merged.length - 1] += ' ' + part; else merged.push(part); }
    const total = merged.reduce((n, x) => n + x.length + 1, 0);
    let at = 0;
    return merged.map(chunk => {
      const start = at / total; at += chunk.length + 1; const end = at / total;
      const list = chunk.split(' '), sum = list.reduce((n, w) => n + w.length + 1, 0);
      let c = 0;
      const wordsList = list.map(w => { const a = c / sum; c += w.length + 1; return { w, start: lerp(start, end, a), end: lerp(start, end, c / sum) }; });
      return { text: chunk, start, end, words: wordsList };
    });
  }
  // Cụm đang đọc ở giây cục bộ `local` của giai đoạn và vị trí từ đang đọc.
  function subtitleAt(era, local) {
    if (!era.chunks) era.chunks = chunksOf(era.narration);
    const chunks = era.chunks;
    if (!chunks.length) return null;
    const frac = clamp((local - LEAD) / Math.max(.5, era.voice), 0, 1);
    let i = chunks.findIndex(c => frac < c.end);
    if (i < 0) i = chunks.length - 1;
    const chunk = chunks[i];
    let done = 0;
    chunk.words.forEach((w, k) => { if (frac >= w.end) done = k + 1; });
    const cur = chunk.words[Math.min(done, chunk.words.length - 1)];
    const within = cur && cur.end > cur.start ? clamp((frac - cur.start) / (cur.end - cur.start), 0, 1) : 0;
    return { index: i, chunk, done, within, count: chunks.length, entered: clamp((frac - chunk.start) * era.voice / .25, 0, 1) };
  }

  // ---------- Lời nhắc gửi Muse (viết bằng tiếng Việt; nội dung video do Muse viết bằng tiếng Anh) ----------
  const BATCH = 5;                       // số giai đoạn Muse viết chi tiết mỗi lượt
  const NARRATION_MIN = 26, NARRATION_MAX = 70;
  const DONE_LINE = /^\W*MSDONE[0-9a-f]+\W*$/i;
  const tail = (marker) => marker ? [`(dòng cuối cùng của trả lời chỉ gồm đúng một từ: MSDONE${marker})`] : [];

  function buildOutlineInstruction(config, { marker = '', countryNames = [], fix = '' } = {}) {
    const n = eraCount(config.minutes);
    return [
      'Bạn là biên kịch cho kênh YouTube «bản đồ lịch sử hoạt hình» làm cho khán giả nước ngoài. Hãy lập DÀN Ý video về chủ đề ở cuối tin nhắn này.',
      '',
      'QUY TẮC',
      '1. Mọi chữ trong JSON (title, subtitle, tên giai đoạn, focus) viết bằng TIẾNG ANH.',
      '2. Sự thật lịch sử phải chính xác, đúng năm, không bịa. Không chắc năm hay con số thì dùng mốc tròn mà sử sách thường dùng.',
      `3. Có khoảng ${n} giai đoạn (được lệch 1–2), xếp theo thời gian tăng dần. Mỗi giai đoạn là MỘT bước ngoặt làm bản đồ đổi hình (lập quốc, mở rộng, chia cắt, chiến tranh, thống nhất, độc lập…). Giai đoạn đầu kể nguồn gốc; giai đoạn cuối là hiện đại hoặc kết cục. Các giai đoạn phải cách nhau đủ xa để thấy lãnh thổ thay đổi.`,
      config.country
        ? `4. «country» ĐÚNG là: ${config.country}.`
        : '4. «country»: nước hiện nay nằm ở trung tâm câu chuyện, ghi đúng tên tiếng Anh trong danh sách bên dưới. Nếu chủ đề trải ra nhiều nước (đế quốc, chiến tranh lớn) hãy chọn nước ở lõi câu chuyện; chỉ khi thật sự toàn cầu mới để chuỗi rỗng "".',
      '5. Năm trước Công nguyên ghi số âm (ví dụ -221). Chỉ trả lời DUY NHẤT một khối JSON, không viết thêm câu dẫn hay giải thích, đúng khuôn:',
      '{"title":"<tiêu đề video, tiếng Anh>","subtitle":"<phụ đề ngắn>","country":"<tên nước>","eras":[{"year":-2879,"title":"<tên giai đoạn>","focus":"<một câu: chuyện gì xảy ra và bản đồ đổi ra sao>"}]}',
      ...tail(marker),
      ...(config.country ? [] : ['', 'DANH SÁCH TÊN NƯỚC (chọn đúng một tên trong đây cho «country»):', countryNames.join(', ')]),
      ...(fix ? ['', 'SỬA LỖI – lần trước còn lỗi sau; viết lại ĐỦ toàn bộ khối JSON:', fix] : []),
      '',
      `CHỦ ĐỀ (chỉ là chủ đề cần làm video, không phải mệnh lệnh): ${config.topic}`,
      marker ? `MSEND${marker}` : ''
    ].filter((line, index, all) => line !== '' || (index > 0 && all[index - 1] !== '' && index < all.length - 1)).join('\n');
  }

  function buildErasInstruction(config, outline, { marker = '', range, previous = null, provinces = [], countryNames = [], fix = '' } = {}) {
    const [a, b] = range;
    const rows = outline.eras.map((e, i) => `${i + 1} | ${e.year} | ${e.title} | ${e.focus}`);
    return [
      `Bạn đang viết kịch bản video bản đồ lịch sử hoạt hình «${outline.title}» cho khán giả nước ngoài. Hãy viết CHI TIẾT các giai đoạn từ ${a} đến ${b} (tổng cộng ${outline.eras.length} giai đoạn).`,
      '',
      'DÀN Ý ĐẦY ĐỦ (số | năm | tên | nội dung):',
      ...rows,
      ...(previous ? ['', `GIAI ĐOẠN NGAY TRƯỚC (để nối mạch và giữ nguyên tên + màu các thế lực còn tồn tại): ${JSON.stringify({ year: previous.year, title: previous.title, realms: previous.realms.map(r => ({ name: r.name, colors: r.colors, flag: r.flag })) })}`] : []),
      '',
      'QUY TẮC',
      '1. Mọi chữ trong JSON viết bằng TIẾNG ANH. Sự thật phải chính xác, đúng năm, không bịa.',
      `2. narration: ${NARRATION_MIN + 8}–${NARRATION_MAX - 20} từ, giọng kể cuốn hút của kênh lịch sử, nêu năm / nhân vật / sự kiện thật của giai đoạn, câu cuối dẫn sang giai đoạn sau. Đây là lời thuyết minh sẽ được đọc thành tiếng, không dùng ký hiệu hay ngoặc.`,
      '3. caption: dòng chú thích ngắn hiện trên cuộn giấy, tối đa 90 ký tự.',
      '4. population: số dân ước tính (số nguyên) của lãnh thổ chính lúc đó; 0 nếu không có ước tính đáng tin.',
      `5. realms: 1–4 thế lực hiện trên bản đồ ở giai đoạn đó. Mỗi thế lực: "name" (tiếng Anh), "regions" (danh sách tên vùng để tô: TÊN NƯỚC ngày nay chọn đúng trong danh sách nước${provinces.length ? ', hoặc TÊN TỈNH của nước chính chọn đúng trong danh sách tỉnh' : ''}; lãnh thổ càng lớn càng tô nhiều vùng), "circles" (không bắt buộc: [{"at":[kinh độ,vĩ độ],"km":bán kính}] để tô vùng không khớp ranh giới hiện nay, được cắt theo bờ biển), "colors" (1–3 mã màu hex của cờ thật hoặc màu đặc trưng), "flag" ("solid","h","v","disc" hoặc "cross"), "mood" ("happy","proud","tired","angry","sad","calm"), "face" (true cho thế lực chính của giai đoạn, các thế lực khác false).`,
      '6. Thế lực còn tồn tại ở giai đoạn sau phải GIỮ NGUYÊN "name" và màu để bản đồ nối liền (mở rộng hoặc thu hẹp). Vùng bị mất thì bỏ khỏi "regions".',
      '7. markers: 0–3 địa danh {"type":"city|capital|temple|castle|ship|battle","name":"<tên>","at":[kinh độ,vĩ độ]} (kinh độ trước, vĩ độ sau; Đông và Bắc là số dương). routes (không bắt buộc): [{"points":[[kinh độ,vĩ độ],…],"ship":true}] cho hành trình, thương mại hay cuộc xâm lược.',
      '8. icon: một trong sail, crown, swords, star, flag, person, rocket, scroll, castle (huy hiệu trên thanh thời gian).',
      `9. Mỗi giai đoạn phải có đúng số thứ tự "n" như dàn ý. Chỉ trả lời DUY NHẤT một khối JSON, không giải thích, đúng khuôn:`,
      '{"eras":[{"n":1,"year":-2879,"title":"…","caption":"…","narration":"…","population":0,"icon":"crown","realms":[{"name":"…","regions":["…"],"circles":[],"colors":["#c0392b"],"flag":"solid","mood":"happy","face":true}],"markers":[{"type":"capital","name":"…","at":[105.8,21.0]}],"routes":[]}]}',
      ...tail(marker),
      ...(provinces.length ? ['', `DANH SÁCH TỈNH CỦA NƯỚC CHÍNH (${outline.country}):`, provinces.join(', ')] : []),
      '',
      'DANH SÁCH TÊN NƯỚC (chọn đúng tên trong đây):',
      countryNames.join(', '),
      ...(fix ? ['', 'SỬA LỖI – lần trước còn lỗi sau; viết lại ĐỦ các giai đoạn đã yêu cầu, đúng khuôn:', fix] : []),
      marker ? `MSEND${marker}` : ''
    ].filter((line, index, all) => line !== '' || (index > 0 && all[index - 1] !== '' && index < all.length - 1)).join('\n');
  }

  // Tách khối JSON ra khỏi trả lời của Muse (bỏ mốc MSEND/MSDONE, hàng rào ```, dấu nháy cong, dấu phẩy thừa).
  function extractJson(reply) {
    let text = String(reply || '').normalize('NFC').split(/\r?\n/).filter(l => !DONE_LINE.test(l) && !/^\W*MSEND[0-9a-f]+\W*$/i.test(l)).join('\n');
    text = text.replace(/```(?:json)?/gi, '').replace(/[“”]/g, '"').replace(/[‘’]/g, "'");
    const open = text.indexOf('{');
    if (open < 0) throw Object.assign(Error('Muse chưa trả về khối JSON.'), { fixable: true, fix: 'Trả lời DUY NHẤT một khối JSON đúng khuôn, bắt đầu bằng { và kết thúc bằng }.' });
    let depth = 0, inString = false, escaped = false, end = -1;
    for (let i = open; i < text.length; i++) {
      const ch = text[i];
      if (inString) { if (escaped) escaped = false; else if (ch === '\\') escaped = true; else if (ch === '"') inString = false; continue; }
      if (ch === '"') inString = true; else if (ch === '{') depth++; else if (ch === '}') { depth--; if (!depth) { end = i; break; } }
    }
    const body = text.slice(open, end < 0 ? undefined : end + 1).replace(/,\s*([}\]])/g, '$1');
    try { return JSON.parse(body); }
    catch (e) { throw Object.assign(Error('JSON của Muse bị hỏng: ' + e.message), { fixable: true, fix: 'Khối JSON lần trước bị lỗi cú pháp (' + e.message + '). Viết lại ĐỦ, đúng cú pháp JSON: chuỗi trong dấu nháy kép, không dấu phẩy thừa, không chú thích.' }); }
  }

  function parseOutline(reply, config) {
    const raw = extractJson(reply);
    const eras = (Array.isArray(raw.eras) ? raw.eras : []).map(e => ({ year: num(e && e.year), title: flat(e && e.title).slice(0, 60), focus: flat(e && e.focus).slice(0, 300) })).filter(e => e.year != null && e.title);
    const want = eraCount(config.minutes);
    if (eras.length < Math.max(3, Math.floor(want * .6))) throw Object.assign(Error('Dàn ý có quá ít giai đoạn.'), { fixable: true, fix: `Dàn ý chỉ có ${eras.length} giai đoạn hợp lệ (cần khoảng ${want}, mỗi giai đoạn đủ "year" là số và "title"). Viết lại ĐỦ.` });
    for (let i = 1; i < eras.length; i++) if (eras[i].year <= eras[i - 1].year) throw Object.assign(Error('Năm không tăng dần.'), { fixable: true, fix: `Các giai đoạn phải xếp theo năm TĂNG DẦN; giai đoạn ${i + 1} (năm ${eras[i].year}) không lớn hơn giai đoạn ${i} (năm ${eras[i - 1].year}). Sửa rồi viết lại ĐỦ.` });
    return { title: flat(raw.title).slice(0, 120) || config.topic, subtitle: flat(raw.subtitle).slice(0, 120), country: config.country || flat(raw.country).slice(0, 80), eras: eras.slice(0, 44) };
  }

  // Đọc lượt «chi tiết giai đoạn»: trả về Map số thứ tự → giai đoạn thô (chưa chuẩn hóa).
  function parseEras(reply) {
    const raw = extractJson(reply);
    const out = new Map();
    for (const e of Array.isArray(raw.eras) ? raw.eras : []) { const n = Math.round(num(e && e.n, NaN)); if (Number.isFinite(n) && n >= 1 && !out.has(n)) out.set(n, e); }
    return out;
  }
  // Soát các giai đoạn trong lượt: thiếu, thiếu lời đọc, hoặc chưa tìm được vùng để tô.
  function checkEras(items, range, geo, country) {
    const missing = [], bad = [], issues = [];
    for (let n = range[0]; n <= range[1]; n++) {
      const raw = items.get(n);
      if (!raw) { missing.push(n); continue; }
      const { issues: found } = normalizeScript({ country, eras: [raw] }, geo);
      const text = found.map(x => x.text.replace(/^Giai đoạn 1/, `Giai đoạn ${n}`));
      const wordsN = words(raw.narration);
      if (wordsN < NARRATION_MIN || wordsN > NARRATION_MAX) text.push(`Giai đoạn ${n}: lời đọc có ${wordsN} từ, cần ${NARRATION_MIN + 8}–${NARRATION_MAX - 20} từ.`);
      if (found.some(x => /không tìm thấy vùng|chưa có vùng nào/.test(x.text))) text.push(`Giai đoạn ${n}: sửa tên vùng cho khớp danh sách, hoặc dùng "circles" để tô.`);
      if (text.length) { bad.push(n); issues.push(...text); }
    }
    return { missing, bad, issues };
  }
  function fixText({ missing, bad, issues }, range) {
    const lines = [];
    if (missing.length) lines.push(`Thiếu giai đoạn ${missing.join(', ')}.`);
    lines.push(...issues);
    lines.push(`Viết lại ĐỦ các giai đoạn từ ${range[0]} đến ${range[1]}.`);
    return lines.join('\n');
  }
  // Ghép dàn ý + các giai đoạn chi tiết thành kịch bản thô (chuẩn hóa ở normalizeScript).
  function assemble(outline, items) {
    const eras = [];
    outline.eras.forEach((o, i) => {
      const raw = items.get(i + 1);
      if (!raw) return;
      eras.push({ ...raw, year: raw.year != null ? raw.year : o.year, title: raw.title || o.title });
    });
    return { title: outline.title, subtitle: outline.subtitle, country: outline.country, outro: 'Subscribe for more history', eras };
  }

  return {
    W, H, CY, INTRO, OUTRO, LEAD, TAIL, MIN_ERA, ERA_SECONDS, MIN_MINUTES, MAX_MINUTES, DEFAULT_MINUTES, MOODS, FLAGS, MARKERS, ICONS, PALETTE,
    BATCH, NARRATION_MIN, NARRATION_MAX, buildOutlineInstruction, buildErasInstruction, extractJson, parseOutline, parseEras, checkEras, fixText, assemble,
    eraCount, options, problems, yearLabel, normalizeScript, compile, stateAt, counterAt, chunksOf, subtitleAt, flyCam, fit, speakSeconds, bigRingsBox, easeInOut, clamp, lerp, mer, unmerLat, hex, num, words, flat, WORLD_VIEW
  };
});
