// Thử luồng «Muse tự phân tích truyện» với trang chat Muse GIẢ (Chromium thật, không phải Muse thật):
// gửi yêu cầu qua ô chat, chờ trả lời đang được viết dần, đọc trả lời, ghép với lời thật của truyện.
const { chromium } = require('playwright-core');
const assert = require('node:assert/strict');
const plan = require('../src/story-plan.js');
const { createStoryAnalyzer } = require('../src/story-analyze.cjs');

const PAGE = `<!doctype html><meta charset="utf-8"><style>#log{white-space:pre-wrap}[data-role]{margin:6px;padding:4px;border:1px solid #ccc}</style>
<main><div id="log"></div><form><textarea id="box" placeholder="Nhắn tin"></textarea><button type="button" id="send" aria-label="Send">↑</button><button type="button" id="stop" aria-label="Stop generating" hidden>■</button></form></main>
<script>
  window.stopClicks = 0; window.sent = [];
  const log = document.getElementById('log'), box = document.getElementById('box'), stop = document.getElementById('stop');
  let busyUntil = 0, aborted = false;
  stop.onclick = () => { window.stopClicks++; aborted = true; };
  window.mode = { ignoreSend: false, streamMs: 400, busyMs: 0 };
  if (window.mode.busyMs) {}
  window.startBusy = ms => { stop.hidden = false; setTimeout(() => { stop.hidden = true; }, ms); };
  document.getElementById('send').onclick = async () => {
    const text = box.value; if (!text.trim() || window.mode.ignoreSend) return;
    box.value = ''; window.sent.push(text);
    const user = document.createElement('div'); user.setAttribute('data-role', 'user'); user.textContent = text; log.append(user);
    const bot = document.createElement('div'); bot.setAttribute('data-role', 'assistant'); log.append(bot);
    const reply = await window.museBrain(text);
    aborted = false; stop.hidden = false;
    const words = reply.split(/(?<=\\s)/), per = Math.max(1, Math.ceil(words.length / 12));
    for (let i = 0; i < words.length && !aborted; i += per) { bot.textContent += words.slice(i, i + per).join(''); await new Promise(r => setTimeout(r, window.mode.streamMs / 12)); }
    stop.hidden = true;
  };
</script>`;

const tale = 'Ngày xưa có một cô bé tên Mai sống ở làng ven sông. Mỗi sáng, em dắt trâu ra đồng. Một hôm, em nhặt được chiếc hộp gỗ cũ bên bờ nước, bên trong là một chiếc chìa khóa nhỏ. Em hoảng hốt nhìn quanh, rồi mỉm cười. Bà Ba từ xa gọi em về ăn cơm.';
const cfg = { seconds: 10, aspect: '16:9', character: 'Mai, bé gái tóc đen' };

// «Muse» giả: đọc yêu cầu, gom câu đánh số theo số giây, viết prompt, kết thúc bằng mốc MSDONE.
function brain(behavior = {}) {
  const asked = [];
  const fn = async text => {
    const units = [...text.matchAll(/^\[(\d+)\] \(([\d.]+) giây\) (.+)$/gm)].map(m => ({ n: Number(m[1]), s: Number(m[2]), t: m[3] }));
    const done = (text.match(/MSDONE([0-9a-f]{6})/) || [])[1];
    asked.push({ text, units: units.map(u => u.n), hasCast: /NHÂN VẬT ĐÃ CHỐT/.test(text), done });
    if (behavior.onAsk) await behavior.onAsk(asked.length);
    if (behavior.garbage) return 'Xin lỗi, mình không hiểu yêu cầu này.';
    let list = units;
    if (behavior.skip && asked.length === 1) list = units.filter(u => !behavior.skip.includes(u.n));
    const groups = []; let cur = [];
    for (const u of list) { if (cur.length && (cur.reduce((x, y) => x + y.s, 0) + u.s > 9 || u.n !== cur.at(-1).n + 1)) { groups.push(cur); cur = []; } cur.push(u); }
    if (cur.length) groups.push(cur);
    const lines = [];
    if (!/NHÂN VẬT ĐÃ CHỐT/.test(text)) lines.push('NHÂN VẬT: Mai – theo ảnh tham chiếu; Bà Ba – 60 tuổi, tóc bạc búi, áo bà ba nâu');
    groups.forEach((g, i) => {
      if (behavior.legacy) { lines.push(`CẢNH ${i + 1}`, `LỜI: ${g.map(u => u.t).join(' ')}`, `PROMPT: Mô tả hình cho cảnh ${i + 1}: Mai đứng bên sông, nét mặt ngạc nhiên, gió thổi nhẹ qua tóc.`); return; }
      lines.push(`CẢNH ${i + 1}`, `CÂU: ${g[0].n}${g.length > 1 ? '-' + g.at(-1).n : ''}`, `PROMPT: 0–3 giây: Mai đứng bên sông (câu ${g.map(u => u.n).join(',')}). 3–10 giây: nét mặt ngạc nhiên, gió thổi nhẹ qua tóc.`);
    });
    if (!behavior.noDone) lines.push(`MSDONE${done}`);
    return lines.join('\n');
  };
  fn.asked = asked;
  return fn;
}

(async () => {
  const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || '/usr/bin/chromium', headless: true, args: ['--no-sandbox'] });
  const settings = { composer: 'textarea', submit: '', stopSelector: '', language: 'vi' };
  let passed = 0;
  const ok = name => { passed++; console.log('ok -', name); };
  async function session(behavior, timing = {}, setup) {
    const page = await browser.newPage();
    const museBrain = brain(behavior);
    await page.exposeFunction('museBrain', museBrain);
    await page.setContent(PAGE);
    if (setup) await setup(page);
    const progress = [];
    const analyzer = createStoryAnalyzer({
      dom: (muse, fn, arg) => muse.evaluate(fn, arg), openMuse: async () => {}, getMuse: () => page, getSettings: () => settings,
      delay: ms => new Promise(r => setTimeout(r, ms)), notify: () => { const p = analyzer?.status().progress; if (p && progress.at(-1) !== p) progress.push(p); },
      timing: { poll: 60, stable: 400, echo: 1200, reply: 8000, idle: 4000, composer: 1500, ...timing }
    });
    return { page, analyzer, museBrain, progress };
  }

  try {
    // 1. Truyện ngắn: một lượt, lời đọc nguyên văn, prompt từ Muse, nhân vật được chốt.
    {
      const { page, analyzer, museBrain, progress } = await session({});
      const r = await analyzer.run({ script: tale, options: cfg });
      assert.equal(museBrain.asked.length, 1);
      assert.deepEqual(museBrain.asked[0].units, [1, 2, 3, 4, 5]);
      assert.match(museBrain.asked[0].text, /MSEND[0-9a-f]{6}$/);
      assert.equal(r.scenes.map(s => s.voiceover).join(' '), tale);
      assert.ok(r.scenes.every(s => !s.offline && s.prompt.includes(plan.NO_SPEECH) && /Mai đứng bên sông/.test(s.prompt)));
      assert.deepEqual(r.scenes.map(s => s.units), [[1, 2], [3, 4], [5, 5]]);
      assert.match(r.cast, /Bà Ba – 60 tuổi/);
      assert.deepEqual(r.notes, []);
      assert.equal(await page.evaluate(() => (globalThis[Symbol.for('MuseVideoStudio.promptTrackers.v1')] || new Map()).size), 0, 'dọn mốc theo dõi trong trang');
      assert.equal(await page.inputValue('#box'), '', 'ô chat trống sau khi gửi');
      assert.ok(progress.some(p => /Muse đang viết/.test(p)) && progress.some(p => /xong 3 cảnh/.test(p)), 'có tiến độ: ' + progress.join(' | '));
      assert.equal(analyzer.status().busy, false);
      assert.equal(await page.evaluate(() => window.stopClicks), 0, 'không bấm Dừng khi chạy bình thường');
      await page.close(); ok('truyện ngắn: một lượt, lời đúng nguyên văn, prompt từ Muse');
    }
    // 2. Muse bỏ sót câu 3 → app hỏi lại đúng câu đó, không để mất lời.
    {
      const { page, analyzer, museBrain } = await session({ skip: [3] });
      const r = await analyzer.run({ script: tale, options: cfg });
      assert.equal(museBrain.asked.length, 2);
      assert.deepEqual(museBrain.asked[1].units, [3], 'hỏi lại chỉ câu bị bỏ sót');
      assert.match(museBrain.asked[1].text, /NGỮ CẢNH/);
      assert.equal(r.scenes.map(s => s.voiceover).join(' '), tale);
      assert.ok(r.scenes.every(s => !s.offline), 'câu hỏi lại đã có prompt từ Muse');
      assert.deepEqual(r.scenes.map(s => s.units), [[1, 2], [3, 3], [4, 5]]);
      await page.close(); ok('Muse bỏ sót câu: hỏi lại đúng câu đó');
    }
    // 3. Truyện dài → nhiều lượt, mỗi lượt chỉ vài cảnh, nhân vật đã chốt chuyển sang lượt sau, đủ chữ đúng thứ tự.
    {
      const long = Array.from({ length: 40 }, (_, i) => `Câu số ${i + 1}: Mai đi qua cánh đồng ${i + 1} và nhìn về phía con sông xa.`).join(' ');
      const { page, analyzer, museBrain, progress } = await session({}, { reply: 20000 });
      const r = await analyzer.run({ script: long, options: cfg });
      assert.ok(museBrain.asked.length >= 3, 'số lượt ' + museBrain.asked.length);
      const asked = museBrain.asked.flatMap(a => a.units);
      assert.deepEqual(asked, Array.from({ length: 40 }, (_, i) => i + 1), 'mỗi câu được hỏi đúng một lần, đúng thứ tự');
      assert.equal(museBrain.asked[0].hasCast, false);
      assert.ok(museBrain.asked.slice(1).every(a => a.hasCast), 'nhân vật đã chốt đi theo các lượt sau');
      assert.ok(museBrain.asked.every(a => a.text.includes('Câu số 40:')), 'mỗi lượt đều kèm cả truyện làm ngữ cảnh');
      assert.equal(r.scenes.map(s => s.voiceover).join(' '), long);
      assert.ok(progress.some(p => /^Phần 2\/\d+ · /.test(p)));
      assert.deepEqual(r.scenes.map(s => s.title), r.scenes.map((_, i) => `Cảnh ${i + 1}`));
      assert.ok(r.scenes.every(s => plan.estimateSeconds(s.voiceover) <= 10));
      await page.close(); ok('truyện dài: nhiều lượt, nhân vật chốt chuyển tiếp, đủ chữ đúng thứ tự');
    }
    // 4. Muse quên mốc kết thúc → app chờ chữ ổn định rồi dùng.
    {
      const { page, analyzer } = await session({ noDone: true });
      const r = await analyzer.run({ script: tale, options: cfg });
      assert.equal(r.scenes.map(s => s.voiceover).join(' '), tale);
      await page.close(); ok('Muse quên mốc kết thúc: vẫn lấy được trả lời khi Muse ngừng viết');
    }
    // 5. Muse chép «LỜI» thay vì số câu → lời vẫn được sửa về nguyên văn.
    {
      const { page, analyzer } = await session({ legacy: true });
      const r = await analyzer.run({ script: tale, options: cfg });
      assert.equal(r.scenes.map(s => s.voiceover).join(' '), tale);
      assert.ok(r.scenes.every(s => /Mô tả hình cho cảnh/.test(s.prompt)));
      await page.close(); ok('Muse chép LỜI: vẫn đọc đúng nguyên văn truyện');
    }
    // 6. Muse trả lời linh tinh hai lần → dùng chia nhanh cho đoạn đó, có ghi chú, vẫn đủ lời.
    {
      const { page, analyzer, museBrain } = await session({ garbage: true });
      const r = await analyzer.run({ script: tale, options: cfg });
      assert.equal(museBrain.asked.length, 2, 'thử lại một lần');
      assert.equal(r.scenes.map(s => s.voiceover).join(' '), tale);
      assert.ok(r.scenes.every(s => s.offline));
      assert.match(r.notes.join(' '), /dùng chia nhanh/);
      await page.close(); ok('Muse trả lời không đúng khuôn: dùng chia nhanh, vẫn đủ lời');
    }
    // 7. Chat Muse đang bận (còn nút Dừng) → chờ rảnh mới gửi.
    {
      const { page, analyzer, museBrain, progress } = await session({}, {}, p => p.evaluate(() => window.startBusy(700)));
      const r = await analyzer.run({ script: tale, options: cfg });
      assert.equal(r.scenes.map(s => s.voiceover).join(' '), tale);
      assert.ok(progress.some(p => /chờ rảnh/.test(p)), 'báo đang chờ Muse rảnh: ' + progress.join(' | '));
      assert.equal(museBrain.asked.length, 1);
      await page.close(); ok('chat Muse đang bận: chờ rảnh rồi mới gửi');
    }
    // 8. Muse không nhận tin nhắn → báo lỗi rõ, không treo.
    {
      const { page, analyzer } = await session({}, { echo: 600 }, p => p.evaluate(() => { window.mode.ignoreSend = true; }));
      await assert.rejects(analyzer.run({ script: tale, options: cfg }), /Không thấy yêu cầu hiện trong chat Muse/);
      assert.equal(analyzer.status().busy, false);
      assert.match(analyzer.status().error, /Không thấy yêu cầu/);
      await page.close(); ok('Muse không nhận tin: báo lỗi rõ rồi nhả trạng thái bận');
    }
    // 9. Ô chat còn bản nháp khác → không ghi đè, báo rõ.
    {
      const { page, analyzer } = await session({}, {}, p => p.fill('#box', 'bản nháp của người dùng'));
      await assert.rejects(analyzer.run({ script: tale, options: cfg }), /còn bản nháp/);
      assert.equal(await page.inputValue('#box'), 'bản nháp của người dùng', 'không xóa bản nháp của người dùng');
      await page.close(); ok('ô chat có bản nháp: không ghi đè');
    }
    // 10. Không có ô chat (chưa đăng nhập) → báo đăng nhập.
    {
      const { page, analyzer } = await session({}, { composer: 500 }, p => p.evaluate(() => { document.getElementById('box').remove(); }));
      await assert.rejects(analyzer.run({ script: tale, options: cfg }), /Đăng nhập Muse tài khoản 1/);
      await page.close(); ok('chưa đăng nhập: báo cách xử lý');
    }
    // 11. Hủy giữa chừng khi Muse đang viết → bấm Dừng trên Muse, nhả trạng thái bận.
    {
      const { page, analyzer } = await session({}, { reply: 20000 }, p => p.evaluate(() => { window.mode.streamMs = 6000; }));
      const running = analyzer.run({ script: tale, options: cfg });
      const settled = running.then(() => 'done', e => e.name);
      await page.waitForFunction(() => window.sent.length === 1, null, { timeout: 5000 });
      await new Promise(r => setTimeout(r, 500));
      analyzer.cancel();
      assert.equal(await settled, 'AbortError');
      assert.equal(analyzer.status().busy, false);
      assert.equal(analyzer.status().error, '', 'hủy không phải lỗi');
      assert.ok(await page.evaluate(() => window.stopClicks) >= 1, 'đã bấm Dừng trên Muse');
      await page.close(); ok('hủy phân tích: dừng Muse đang viết');
    }
    // 11b. Phần sau Muse ngừng nhận tin → giữ phần đã xong, phần còn lại dùng chia nhanh (không mất hết).
    {
      const long = Array.from({ length: 40 }, (_, i) => `Câu số ${i + 1}: Mai đi qua cánh đồng ${i + 1} và nhìn về phía con sông xa.`).join(' ');
      let target;
      const { page, analyzer, museBrain } = await session({ onAsk: n => n === 1 && target.evaluate(() => { window.mode.ignoreSend = true; }) }, { echo: 500, reply: 20000 });
      target = page;
      const r = await analyzer.run({ script: long, options: cfg });
      assert.equal(r.scenes.map(s => s.voiceover).join(' '), long, 'vẫn đủ lời dù Muse ngừng giữa chừng');
      assert.ok(r.scenes.some(s => !s.offline) && r.scenes.some(s => s.offline), 'phần đầu do Muse, phần sau là chia nhanh');
      assert.ok(r.scenes.findIndex(s => s.offline) > 0 && r.scenes.slice(r.scenes.findIndex(s => s.offline)).every(s => s.offline), 'các cảnh mẫu nằm liền ở cuối');
      assert.match(r.notes.join(' '), /Các phần còn lại dùng chia nhanh/);
      await page.close(); ok('Muse ngừng nhận tin ở phần sau: giữ phần đã xong, phần còn lại chia nhanh');
    }
    // 11c. Hỏi lại câu thiếu mà Muse không nhận tin → giữ cảnh mẫu, không mất kết quả.
    {
      let target;
      const { page, analyzer, museBrain } = await session({ skip: [3], onAsk: n => n === 1 && target.evaluate(() => { window.mode.ignoreSend = true; }) }, { echo: 500 });
      target = page;
      const r = await analyzer.run({ script: tale, options: cfg });
      assert.equal(r.scenes.map(s => s.voiceover).join(' '), tale);
      assert.deepEqual(r.scenes.map(s => Boolean(s.offline)), [false, true, false]);
      assert.match(r.notes.join(' '), /không trả lời khi hỏi lại/);
      await page.close(); ok('hỏi lại câu thiếu thất bại: giữ cảnh mẫu, không mất kết quả');
    }
    // 12. Đang bận thì không chạy hai lần; kịch bản rỗng báo lỗi.
    {
      const { page, analyzer } = await session({}, { reply: 20000 }, p => p.evaluate(() => { window.mode.streamMs = 3000; }));
      const first = analyzer.run({ script: tale, options: cfg });
      await new Promise(r => setTimeout(r, 200));
      await assert.rejects(analyzer.run({ script: tale, options: cfg }), /đang phân tích/);
      analyzer.cancel(); await first.catch(() => {});
      await assert.rejects(analyzer.run({ script: '   ', options: cfg }), /Dán kịch bản/);
      await page.close(); ok('không chạy trùng; kịch bản rỗng báo lỗi');
    }
  } finally { await browser.close(); }
  console.log(`PASS: ${passed} story analysis scenarios against a fake Muse chat page (not the real Muse).`);
})().catch(e => { console.error(e); process.exitCode = 1; });
