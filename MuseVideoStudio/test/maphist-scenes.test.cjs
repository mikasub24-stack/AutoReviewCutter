// Cảnh minh hoạ có người của tab «Bản đồ lịch sử»: trường scene/shout trong kịch bản, cách chọn cảnh tự động, thời điểm chèn và hiệu ứng âm thanh.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const zlib = require('node:zlib');
const Geo = require('../src/maphist-geo.js');
const Plan = require('../src/maphist-plan.js');
const Scenes = require('../src/maphist-scenes.js');
const { defaultWorkers } = require('../src/maphist-frames.cjs');

const raw = JSON.parse(zlib.gunzipSync(fs.readFileSync(path.join(__dirname, '../src/assets/maphist/world.json.gz'))));
const geo = Geo.build(raw);
const sample = JSON.parse(fs.readFileSync(path.join(__dirname, 'fixtures/maphist-sample.json'), 'utf8'));
const copy = x => JSON.parse(JSON.stringify(x));
const build = (mutate, durations, extra = {}) => {
  const s = copy(sample); while (s.eras.length < 4) s.eras.push(copy(s.eras[s.eras.length % 3])); mutate(s);
  const { script } = Plan.normalizeScript(s, geo);
  return Plan.compile(script, geo, { durations: durations || script.eras.map(() => 14), fps: 30, ...extra });
};

test('cảnh minh hoạ: bảng cảnh của kế hoạch và của bộ vẽ trùng nhau, panel ngoài khoảng 0..1 không vẽ gì', () => {
  assert.deepEqual([...Plan.SCENES].sort(), [...Scenes.KINDS].sort());
  for (const k of Plan.SCENES) assert.equal(typeof Scenes.SCENES[k], 'function', k);
  const calls = [];
  const fake = new Proxy({}, { get: () => () => { calls.push(1); }, set: () => true });
  assert.equal(Scenes.panel(fake, { kind: 'court', u: -.1, t: 0 }), false);
  assert.equal(Scenes.panel(fake, { kind: 'court', u: 1.2, t: 0 }), false);
  assert.equal(Scenes.panel(fake, { kind: 'khong-co', u: .5, t: 0 }), false);
});

test('kịch bản: scene hợp lệ hoặc none được giữ, giá trị lạ bị bỏ; shout cắt ≤ 22 ký tự', () => {
  const { script } = Plan.normalizeScript((() => { const s = copy(sample); s.eras[0].scene = 'battle'; s.eras[1].scene = 'none'; s.eras[2].scene = 'dragon'; s.eras[0].shout = 'X'.repeat(60); return s; })(), geo);
  assert.equal(script.eras[0].scene, 'battle');
  assert.equal(script.eras[1].scene, 'none');
  assert.equal(script.eras[2].scene, '');
  assert.ok(script.eras[0].shout.length <= 22);
});

test('cảnh: Muse chọn cảnh thì dùng đúng cảnh đó, lời hô mặc định theo ngôn ngữ, none tắt cảnh', () => {
  const tl = build(s => { s.eras.forEach((e, i) => { e.scene = ['voyage', 'battle', 'court', 'market', 'build', 'volcano', 'arrival'][i % 7]; }); });
  tl.eras.forEach((e, i) => { if (e.cut) assert.equal(e.cut.kind, ['voyage', 'battle', 'court', 'market', 'build', 'volcano', 'arrival'][i % 7]); });
  assert.ok(tl.eras.filter(e => e.cut).length >= 2, 'có ít nhất vài cảnh');
  const first = tl.eras.find(e => e.cut);
  assert.ok(first.cut.shout && first.cut.shout.length > 2, 'có lời hô mặc định');
  assert.equal(first.cut.chosen, true);
  for (const lang of ['en', 'de', 'fr', 'ru']) {
    const shouts = Plan.strings(lang).shouts;
    for (const k of Plan.SCENES) assert.ok(shouts[k] && shouts[k].length <= 22, `${lang}/${k}`);
  }
  const off = build(s => { s.eras.forEach(e => { e.scene = 'none'; }); });
  assert.ok(off.eras.every(e => e.cut === null), 'none: không cảnh nào');
});

test('cảnh: thời điểm chèn nằm sau khi lãnh thổ mọc xong, đủ ngắn để giai đoạn còn thời gian kết, và giai đoạn quá ngắn thì bỏ cảnh', () => {
  const tl = build(s => { s.eras.forEach(e => { e.scene = 'court'; }); });
  for (const e of tl.eras) {
    if (!e.cut) continue;
    assert.ok(e.cut.at >= Plan.TIMING.growDelay + Plan.TIMING.grow + .7 - 1e-9, 'sau khi mọc xong');
    assert.ok(e.cut.dur >= 2.4 && e.cut.dur <= 3.8 + 1e-9);
    assert.ok(e.cut.at + e.cut.dur <= e.dur - 1.1 + 1e-9, 'còn ≥ 1,1 giây sau cảnh');
  }
  const tiny = build(s => { s.eras.forEach(e => { e.scene = 'court'; }); }, [1, 1, 1, 1], { minEra: 3 });
  assert.ok(tiny.eras.every(e => e.cut === null), 'giai đoạn ngắn: không chèn cảnh');
});

test('cảnh: tự chọn theo biểu tượng/điểm đánh dấu và không lặp liên tiếp cùng một cảnh tự chọn', () => {
  const tl = build(s => { s.eras.forEach(e => { delete e.scene; e.icon = 'crown'; e.markers = []; e.routes = []; }); s.eras[0].icon = 'swords'; });
  assert.equal(tl.eras[0].cut && tl.eras[0].cut.kind, 'battle');
  assert.equal(tl.eras[1].cut && tl.eras[1].cut.kind, 'court');
  assert.equal(tl.eras[1].cut.chosen, false);
  assert.equal(tl.eras[2].cut, null, 'cùng cảnh tự chọn liền kề thì bỏ');
  assert.equal(tl.eras[3].cut && tl.eras[3].cut.kind, 'court');
});

test('cảnh: có tiếng động kèm theo (whoosh vào/ra và âm riêng của từng loại)', () => {
  const tl = build(s => { s.eras.forEach((e, i) => { e.scene = i ? 'market' : 'battle'; }); });
  const cues = Plan.cuesOf(tl);
  const e0 = tl.eras[0], at = e0.start + e0.cut.at;
  assert.ok(cues.some(c => c.kind === 'whoosh' && Math.abs(c.t - at) < 1e-6), 'whoosh khi cảnh hiện');
  assert.ok(cues.some(c => c.kind === 'boom' && c.t > at && c.t < at + e0.cut.dur), 'trận đánh có tiếng nổ');
  const e1 = tl.eras.find((e, i) => i && e.cut);
  assert.ok(cues.some(c => c.kind === 'coin' && c.t > e1.start + e1.cut.at), 'chợ có tiếng xu');
});

test('số cửa sổ vẽ: tự động theo máy, ép được từ 1 đến 16', () => {
  assert.equal(defaultWorkers(16, '', 32), 6);
  assert.equal(defaultWorkers(4, '16', 4), 16);
  assert.equal(defaultWorkers(16, '99', 32), 6, 'quá 16 thì bỏ qua');
  assert.equal(Plan.options({ workers: 5 }).workers, 5);
  assert.equal(Plan.options({ workers: 99 }).workers, 16);
  assert.equal(Plan.options({}).workers, 0, 'mặc định: tự động');
});
