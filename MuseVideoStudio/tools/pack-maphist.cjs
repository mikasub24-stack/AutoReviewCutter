// Đóng gói dữ liệu bản đồ cho tab «Bản đồ lịch sử» (chạy tay khi cần cập nhật, kết quả được commit):
//   node tools/pack-maphist.cjs <thư mục natural-earth-vector/geojson>
// Nguồn: Natural Earth (public domain, https://www.naturalearthdata.com): ne_50m_admin_0_countries + ne_10m_admin_1_states_provinces.
// Chỉ giữ vòng ngoài của từng đa giác, làm gọn (Douglas–Peucker), làm tròn 0,01° (~1 km), bỏ đảo nhỏ; ghi dạng số nguyên nén gzip.
const fs = require('node:fs');
const path = require('node:path');
const zlib = require('node:zlib');
const dir = process.argv[2];
if (!dir) throw Error('Cần đường dẫn thư mục geojson của natural-earth-vector.');
const read = name => JSON.parse(fs.readFileSync(path.join(dir, name), 'utf8')).features;

function simplify(points, tol) {   // Douglas–Peucker (lặp, không đệ quy sâu)
  if (points.length < 5) return points;
  const keep = new Uint8Array(points.length); keep[0] = keep[points.length - 1] = 1;
  const stack = [[0, points.length - 1]];
  while (stack.length) {
    const [a, b] = stack.pop();
    let max = 0, at = -1;
    const [ax, ay] = points[a], [bx, by] = points[b], dx = bx - ax, dy = by - ay, len = dx * dx + dy * dy;
    for (let i = a + 1; i < b; i++) {
      const [px, py] = points[i];
      let d;
      if (!len) d = Math.hypot(px - ax, py - ay);
      else { const t = Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / len)); d = Math.hypot(px - (ax + t * dx), py - (ay + t * dy)); }
      if (d > max) { max = d; at = i; }
    }
    if (max > tol && at > 0) { keep[at] = 1; stack.push([a, at], [at, b]); }
  }
  return points.filter((_, i) => keep[i]);
}
const area = ring => { let s = 0; for (let i = 0; i < ring.length; i++) { const [x1, y1] = ring[i], [x2, y2] = ring[(i + 1) % ring.length]; s += x1 * y2 - x2 * y1; } return Math.abs(s / 2); };
function pack(geometry, tol, minArea) {
  const polys = geometry.type === 'Polygon' ? [geometry.coordinates] : geometry.coordinates, out = [];
  let biggest = null;
  for (const poly of polys) {
    const ring = poly[0], a = area(ring);
    if (!biggest || a > biggest.a) biggest = { a, ring };
    if (a < minArea) continue;
    const s = simplify(ring, tol);
    if (s.length < 4) continue;
    out.push(s.flatMap(([x, y]) => [Math.round(x * 100), Math.round(y * 100)]));
  }
  if (!out.length && biggest) out.push(simplify(biggest.ring, tol).flatMap(([x, y]) => [Math.round(x * 100), Math.round(y * 100)]));   // đảo quốc rất nhỏ vẫn có một mảnh
  return out;
}
const countries = read('ne_50m_admin_0_countries.geojson').map(f => ({ n: f.properties.NAME, a: f.properties.ADM0_A3, p: pack(f.geometry, .03, .004) }));
const admin1 = {};
for (const f of read('ne_10m_admin_1_states_provinces.geojson')) {
  const a3 = f.properties.adm0_a3, name = f.properties.name || f.properties.name_en;
  if (!a3 || !name) continue;
  const p = pack(f.geometry, .012, .0006);
  if (p.length) (admin1[a3] = admin1[a3] || []).push({ n: name, p });
}
const world = { v: 1, source: 'Natural Earth (public domain)', countries, admin1 };
const json = JSON.stringify(world);
const out = path.join(__dirname, '../src/assets/maphist/world.json.gz');
fs.writeFileSync(out, zlib.gzipSync(json, { level: 9 }));
console.log('countries', countries.length, 'countries with provinces', Object.keys(admin1).length, 'json MB', (json.length / 1e6).toFixed(2), 'gz MB', (fs.statSync(out).size / 1e6).toFixed(2));
