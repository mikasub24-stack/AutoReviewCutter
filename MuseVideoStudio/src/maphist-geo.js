/* Tab «Bản đồ lịch sử»: dữ liệu bản đồ thế giới (Natural Earth, phạm vi công cộng) đã nén trong assets/maphist/world.json.gz.
   File này chỉ dựng chỉ mục từ dữ liệu đã giải nén và tra tên vùng; chạy được cả ở tiến trình chính lẫn trong cửa sổ dựng video.
   Đơn vị lãnh thổ (unit): «C:IDN» = cả nước; «A:IDN:7» = tỉnh số 7 của nước đó; «B:lon,lat,km» = vùng tròn cắt theo bờ biển. */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.maphistGeo = factory();
})(typeof window !== 'undefined' ? window : globalThis, function () {
  'use strict';
  const SCALE = 100;
  const norm = s => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/g, 'd').replace(/Đ/g, 'd').toLowerCase()
    .replace(/\bis\b\.?/g, 'islands').replace(/\brep\b\.?/g, 'republic').replace(/\bdem\b\.?/g, 'democratic').replace(/\bst\b\.?/g, 'saint').replace(/\bherz\b\.?/g, 'herzegovina')
    .replace(/\bbarb\b\.?/g, 'barbuda').replace(/\bgren\b\.?/g, 'grenadines').replace(/\bvin\b\.?/g, 'vincent').replace(/\bter\b\.?/g, 'territory').replace(/\bn\b\.?(?=\s)/g, 'north').replace(/\bs\b\.?(?=\s)/g, 'south')
    .replace(/\bw\b\.?(?=\s)/g, 'west').replace(/\beq\b\.?/g, 'equatorial').replace(/\bcentral african republic\b/, 'central african republic')
    .replace(/[^a-z0-9]+/g, ' ').replace(/\b(the|of)\b/g, ' ').replace(/\s+/g, ' ').trim();
  // Tên thường gặp trong kịch bản lịch sử → tên trong dữ liệu.
  const ALIASES = {
    usa: 'USA', us: 'USA', 'united states': 'USA', america: 'USA', uk: 'GBR', britain: 'GBR', 'great britain': 'GBR', england: 'GBR', scotland: 'GBR', wales: 'GBR', 'northern ireland': 'GBR',
    russian: 'RUS', 'russian federation': 'RUS', 'soviet union': 'RUS', ussr: 'RUS', burma: 'MMR', 'czech republic': 'CZE', 'ivory coast': 'CIV', 'east timor': 'TLS', swaziland: 'SWZ', macedonia: 'MKD',
    'viet nam': 'VNM', 'democratic republic congo': 'COD', 'dr congo': 'COD', drc: 'COD', 'congo kinshasa': 'COD', 'congo brazzaville': 'COG', 'republic congo': 'COG', 'south korea': 'KOR', korea: 'KOR', 'republic korea': 'KOR',
    'north korea': 'PRK', holland: 'NLD', 'the netherlands': 'NLD', persia: 'IRN', siam: 'THA', ceylon: 'LKA', 'cape verde': 'CPV', palestine: 'PSX', 'west bank': 'PSX', gaza: 'PSX', 'bosnia': 'BIH', 'bosnia herzegovina': 'BIH',
    'uae': 'ARE', emirates: 'ARE', 'taiwan': 'TWN', 'hong kong': 'HKG', 'sao tome': 'STP', 'timor leste': 'TLS', turkiye: 'TUR', czechoslovakia: 'CZE', yugoslavia: 'SRB', 'ottoman empire': 'TUR', 'dominican republic': 'DOM', 'central african republic': 'CAF'
  };

  // raw: nội dung world.json đã giải nén. Trả về chỉ mục dùng để vẽ và tra tên.
  function build(raw) {
    const ringsOf = polys => (polys || []).map(flat => {
      const pts = Int32Array.from(flat);
      let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9;
      for (let i = 0; i < pts.length; i += 2) { const x = pts[i], y = pts[i + 1]; if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
      let a = 0;
      for (let i = 0, n = pts.length / 2; i < n; i++) { const j = (i + 1) % n; a += pts[2 * i] * pts[2 * j + 1] - pts[2 * j] * pts[2 * i + 1]; }
      const midLat = (y0 + y1) / 2 / SCALE;
      return { pts, bb: [x0 / SCALE, y0 / SCALE, x1 / SCALE, y1 / SCALE], area: Math.abs(a) / 2 / (SCALE * SCALE) * Math.cos(midLat * Math.PI / 180) };
    });
    const box = rings => { let a = 1e9, b = 1e9, c = -1e9, d = -1e9; for (const r of rings) { a = Math.min(a, r.bb[0]); b = Math.min(b, r.bb[1]); c = Math.max(c, r.bb[2]); d = Math.max(d, r.bb[3]); } return [a, b, c, d]; };
    const size = rings => rings.reduce((sum, r) => sum + r.area, 0);
    const units = new Map(), countries = [], byA3 = new Map(), byName = new Map(), provinceIndex = new Map();
    for (const c of raw.countries || []) {
      const rings = ringsOf(c.p);
      if (!rings.length) continue;
      const u = { key: 'C:' + c.a, kind: 'country', a3: c.a, name: c.n, rings, bb: box(rings), area: size(rings) };
      units.set(u.key, u); countries.push(u); byA3.set(c.a, u);
      byName.set(norm(c.n), u);
    }
    for (const [name, a3] of Object.entries(ALIASES)) if (byA3.has(a3) && !byName.has(norm(name))) byName.set(norm(name), byA3.get(a3));
    for (const [a3, list] of Object.entries(raw.admin1 || {})) {
      const rows = [];
      list.forEach((p, i) => {
        const rings = ringsOf(p.p);
        if (!rings.length) return;
        const u = { key: `A:${a3}:${i}`, kind: 'province', a3, name: p.n, rings, bb: box(rings), area: size(rings) };
        units.set(u.key, u); rows.push(u);
      });
      provinceIndex.set(a3, rows);
    }
    const provinceByName = new Map(), provinceNames = new Map();
    for (const [a3, rows] of provinceIndex) {
      const m = new Map();
      for (const u of rows) { const n = norm(u.name); if (n && !m.has(n)) m.set(n, u); }
      provinceByName.set(a3, m);
      provinceNames.set(a3, rows.map(u => u.name));
    }
    // Tra «Tên» → danh sách đơn vị. Thứ tự: «Nước/Tỉnh» → tỉnh của nước chính → nước → tỉnh ở nước bất kỳ (nếu chỉ có một nơi mang tên đó).
    function resolve(text, mainA3 = '') {
      const raw0 = String(text || '').trim();
      if (!raw0) return null;
      const slash = raw0.split('/').map(s => s.trim()).filter(Boolean);
      if (slash.length === 2) {
        const c = byName.get(norm(slash[0]));
        const p = c && provinceByName.get(c.a3)?.get(norm(slash[1]));
        if (p) return [p];
        if (c && norm(slash[1]) === norm(c.name)) return [c];
      }
      const n = norm(slash[slash.length - 1] || raw0);
      if (!n) return null;
      const main = mainA3 ? provinceByName.get(mainA3) : null;
      if (main?.has(n)) return [main.get(n)];
      if (byName.has(n)) return [byName.get(n)];
      const hits = [];
      for (const m of provinceByName.values()) if (m.has(n)) hits.push(m.get(n));
      if (hits.length === 1) return hits;
      // Gần đúng: tên nước/tỉnh chứa hoặc nằm trong tên đã gõ (≥ 5 ký tự), chỉ nhận khi duy nhất.
      if (n.length >= 5) {
        const near = [];
        const pools = [...(main ? [main] : []), byName];
        for (const pool of pools) { for (const [k, u] of pool) if (k.length >= 5 && (k.includes(n) || n.includes(k)) && !near.includes(u)) near.push(u); if (near.length) break; }
        if (near.length === 1) return near;
      }
      return null;
    }
    return { units, countries, provinceIndex, provinceNames, byA3, resolve, norm, SCALE, countryNames: countries.map(c => c.name).sort() };
  }

  // Khóa vùng tròn: «B:lon,lat,km».
  const blobKey = (lon, lat, km) => `B:${Math.round(lon * 100) / 100},${Math.round(lat * 100) / 100},${Math.round(km)}`;
  function parseBlob(key) { const m = /^B:(-?[\d.]+),(-?[\d.]+),(\d+)$/.exec(key || ''); return m ? { lon: Number(m[1]), lat: Number(m[2]), km: Number(m[3]) } : null; }

  // Hộp bao [lon0, lat0, lon1, lat1] của PHẦN CHÍNH một đơn vị: các vòng lớn nhất cộng lại phủ ≥ share diện tích (bỏ đảo xa nhỏ xíu như Ogasawara của Nhật,
  // vùng hải ngoại của Pháp...). Dùng để phóng ảnh bìa vào đúng phần lãnh thổ chính chứ không bị đảo xa kéo ra xa và lệch tâm.
  function coreBox(unit, share = .96) {
    const rings = unit.rings.length > 1 ? unit.rings.slice().sort((p, q) => q.area - p.area) : unit.rings, total = rings.reduce((t, r) => t + r.area, 0);
    let a = 1e9, b = 1e9, c = -1e9, d = -1e9, acc = 0;
    for (const r of rings) {
      a = Math.min(a, r.bb[0]); b = Math.min(b, r.bb[1]); c = Math.max(c, r.bb[2]); d = Math.max(d, r.bb[3]); acc += r.area;
      if (acc >= total * share) break;
    }
    return a > c ? unit.bb : [a, b, c, d];
  }

  // Như coreBox nhưng cho CẢ NHÓM đơn vị (một thế lực gồm nhiều tỉnh): gom mọi vòng của cả nhóm, vòng lớn nhất trước, lấy đến khi phủ ≥ share TỔNG diện tích.
  // (Tính từng tỉnh riêng thì đảo xa của một tỉnh lớn hơn 4% diện tích tỉnh đó — như quần đảo Amami của Kagoshima — vẫn kéo hộp bao xuống tận Okinawa.)
  function coreBoxOf(units, share = .96) {
    const rings = []; let total = 0;
    for (const u of units) for (const r of u.rings) { rings.push(r); total += r.area; }
    rings.sort((p, q) => q.area - p.area);
    let a = 1e9, b = 1e9, c = -1e9, d = -1e9, acc = 0;
    for (const r of rings) {
      a = Math.min(a, r.bb[0]); b = Math.min(b, r.bb[1]); c = Math.max(c, r.bb[2]); d = Math.max(d, r.bb[3]); acc += r.area;
      if (acc >= total * share) break;
    }
    return a > c ? null : [a, b, c, d];
  }

  return { build, norm, blobKey, parseBlob, coreBox, coreBoxOf, ALIASES, SCALE };
});
