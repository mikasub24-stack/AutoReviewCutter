const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { planScript } = require('../src/script-planner.js');
const compact = value => value.replace(/\s/g, '');
function preserved(script, scenes) {
  assert.equal(compact(scenes.map(scene => scene.source).join('')), compact(script));
}

test('auto keeps numbered Vietnamese/English headings with their scene body exactly once', () => {
  const script = 'Cảnh 1: Chú mèo nhìn ra cửa sổ.\nÁnh sáng ban mai.\n\nScene 2 — Chú mèo nhảy xuống.\n\n[Cảnh 3]\nChú mèo đi tới chiếc ghế.';
  const scenes = planScript(script);
  assert.deepEqual(scenes.map(scene => scene.title), ['Cảnh 1', 'Scene 2', 'Cảnh 3']);
  assert.ok(scenes[0].source.includes('Ánh sáng ban mai.'));
  assert.equal(scenes[0].prompt.split('Cảnh 1').length - 1, 1);
  assert.equal(scenes[2].prompt.split('[Cảnh 3]').length - 1, 1);
  preserved(script, scenes);
});

test('auto retains a script introduction before explicit scenes', () => {
  const script = 'Một ngày của chú mèo.\n\nCảnh 1: Buổi sáng.\nCảnh 2: Buổi tối.';
  const scenes = planScript(script);
  assert.equal(scenes[0].title, 'Mở đầu');
  preserved(script, scenes);
});

test('paragraph mode and auto recognize CRLF, CR, blank lines and content order', () => {
  const script = 'Cô gái ngồi đọc sách.\r\n\r\nCon mèo nằm bên cạnh.\r\rMột chiếc lá rơi.';
  for (const mode of ['auto','paragraphs']) {
    const scenes = planScript(script, { mode });
    assert.equal(scenes.length, 3); preserved(script, scenes);
    assert.ok(scenes.every(scene => !scene.source.includes('\r')));
  }
});

test('sentence mode avoids decimal and list-number fragments', () => {
  const script = '1. Chú mèo nặng 3.5 kg.\n2. Nó nhảy qua ghế! Sau đó nó ngủ?';
  const scenes = planScript(script, { mode: 'sentences' });
  assert.equal(scenes.length, 3);
  assert.ok(scenes[0].source.startsWith('1. Chú mèo'));
  assert.ok(scenes[0].source.includes('3.5'));
  assert.ok(scenes[1].source.startsWith('2. Nó'));
  preserved(script, scenes);
});

test('long paragraphs split into bounded scenes without losing or duplicating content', () => {
  const script = Array.from({length:8},(_,i)=>`Câu chuyện thứ ${i + 1} mô tả chú mèo đi quanh căn phòng và nhìn ra cửa sổ.`).join(' ');
  const scenes = planScript(script, { maxChars: 100 });
  assert.ok(scenes.length > 1);
  assert.ok(scenes.every(scene => Array.from(scene.source).length <= 100));
  preserved(script, scenes);
});

test('long unpunctuated content and single tokens are split without truncation or broken Unicode', () => {
  const script = '😀'.repeat(13) + ' mèo chạy trong vườn '.repeat(20);
  const scenes = planScript(script, { maxChars: 10 });
  assert.ok(scenes.every(scene => Array.from(scene.source).length <= 10));
  assert.ok(scenes.every(scene => !scene.source.includes('\ufffd')));
  preserved(script, scenes);
});

test('long explicit scenes keep headings once while splitting the content', () => {
  const script = 'Cảnh 1: ' + 'Chú mèo bước đi thật chậm trong căn phòng. '.repeat(9);
  const scenes = planScript(script, { maxChars: 80 });
  assert.ok(scenes.length > 1);
  assert.equal(scenes.map(s=>s.source).join('').split('Cảnh 1').length - 1, 1);
  assert.ok(scenes.every(s=>s.title.startsWith('Cảnh 1 · phần ')));
  preserved(script, scenes);
});

test('duration, aspect and style are included without claiming translation or an AI call', () => {
  const scenes = planScript('Chú mèo ngủ bên cửa sổ.', { seconds: 8, aspect: '9:16', style: 'Hoạt hình 2D' });
  assert.match(scenes[0].prompt, /8 giây, tỷ lệ 9:16/);
  assert.match(scenes[0].prompt, /Phong cách hình ảnh: Hoạt hình 2D/);
  assert.ok(scenes[0].prompt.includes(scenes[0].source));
});

test('empty, invalid settings and more than 100 scenes produce actionable errors', () => {
  assert.throws(()=>planScript('  '),/Dán kịch bản/);
  assert.throws(()=>planScript('Một cảnh.',{mode:'ai'}),/cách chia cảnh/);
  assert.throws(()=>planScript('Một cảnh.',{seconds:0}),/Thời lượng/);
  assert.throws(()=>planScript('Một cảnh.',{maxChars:0}),/Giới hạn/);
  assert.throws(()=>planScript(Array.from({length:101},(_,i)=>`Cảnh ${i + 1}: Nội dung.`).join('\n')),/hơn 100 cảnh/);
});

test('UMD browser export works without CommonJS or network access', () => {
  const context = vm.createContext({ window: {} });
  vm.runInContext(fs.readFileSync(path.resolve(__dirname,'../src/script-planner.js'),'utf8'), context);
  const scenes = context.window.scriptPlanner.planScript('Chú mèo nhìn lên.');
  assert.equal(scenes.length, 1); assert.equal(scenes[0].source,'Chú mèo nhìn lên.');
});
