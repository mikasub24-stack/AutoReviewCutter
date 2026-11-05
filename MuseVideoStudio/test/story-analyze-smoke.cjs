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
const adCfg = { seconds: 10, aspect: '9:16', ad: { product: 'Bình giữ nhiệt Aqua 500ml', points: 'Giữ nóng 12 giờ\nNắp chống tràn', audience: 'Dân văn phòng', cta: 'Bấm vào giỏ hàng để xem chi tiết', tone: 'warm', length: 30, camera: ['macro', 'orbit'], look: 'ugc' } };

// «Muse» giả: đọc yêu cầu, gom câu đánh số theo số giây, viết prompt, kết thúc bằng mốc MSDONE.
function brain(behavior = {}) {
  const asked = [], understood = [];
  const fn = async text => {
    // Yêu cầu ĐỌC HIỂU (trước khi chia cảnh): trả lời tóm tắt, cách minh họa, nhân vật, bối cảnh.
    if (/^ĐỌC HIỂU/m.test(text) && /^BÀI ĐỌC/m.test(text)) {
      const done0 = (text.match(/MSDONE([0-9a-f]{6})/) || [])[1];
      const lines = text.split('\n').filter(l => /^\[\d+\] /.test(l));
      understood.push({ text, sentences: lines.length, first: Number((lines[0].match(/^\[(\d+)\]/) || [])[1]), hasPrev: /ĐÃ HIỂU TỪ CÁC PHẦN TRƯỚC/.test(text), fresh: /BỎ QUA hết/.test(text) });
      if (behavior.onUnderstand) await behavior.onUnderstand(understood.length);
      if (behavior.garbage || behavior.understandGarbage) return 'Xin lỗi, mình không hiểu yêu cầu này.';
      return ['TÓM TẮT: Mai sống ở làng ven sông, nhặt được hộp gỗ có chìa khóa, rồi bà Ba gọi về ăn cơm.', 'CÁCH MINH HỌA: Truyện kể nhẹ nhàng; dựng đúng diễn biến ở làng ven sông.', 'NHÂN VẬT: Mai – theo ảnh tham chiếu; Bà Ba – 60 tuổi, tóc bạc búi, áo bà ba nâu', 'BỐI CẢNH: Làng ven sông, buổi sáng.', ...(behavior.noDone ? [] : [`MSDONE${done0}`])].join('\n');
    }
    const units = [...text.matchAll(/^\[(\d+)\] \(([\d.]+) giây\) (.+)$/gm)].map(m => ({ n: Number(m[1]), s: Number(m[2]), t: m[3] }));
    const done = (text.match(/MSDONE([0-9a-f]{6})/) || [])[1];
    asked.push({ text, units: units.map(u => u.n), hasCast: /NHÂN VẬT ĐÃ CHỐT/.test(text), hasUnderstanding: /HIỂU BIẾT VỀ CẢ BÀI/.test(text), fresh: /BỎ QUA hết/.test(text), done });
    if (behavior.onAsk) await behavior.onAsk(asked.length);
    // Yêu cầu VIẾT lời quảng cáo (chế độ quảng cáo): trả lời có lời dẫn, nhãn, emoji, hashtag, ngoặc ghi chú như Muse thật hay làm.
    if (/THÔNG TIN SẢN PHẨM/.test(text)) {
      asked.at(-1).adScript = true;
      if (behavior.adReply) return behavior.adReply(asked.filter(a => a.adScript).length, done);
      return ['Dạ, đây là kịch bản bạn cần:', 'KỊCH BẢN:', 'Sáng nào cũng lạnh tay? 😍', '(nhạc nền nhẹ)', 'Bình Aqua giữ nóng 12 giờ. #binhgiunhiet', 'Mở đầu: Nắp chống tràn, bỏ vào túi thoải mái.', 'Bấm vào giỏ hàng để xem chi tiết.', `MSDONE${done}`].join('\n');
    }
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
  fn.asked = asked; fn.understood = understood;
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
      assert.equal(museBrain.understood.length, 1, 'Muse đọc hiểu cả bài trước khi chia cảnh');
      assert.equal(museBrain.understood[0].sentences, 5);
      assert.ok(museBrain.understood[0].fresh && museBrain.asked[0].fresh, 'dặn Muse bỏ qua truyện/yêu cầu cũ trong cuộc trò chuyện');
      assert.equal(museBrain.asked.length, 1);
      assert.equal(museBrain.asked[0].hasUnderstanding && museBrain.asked[0].hasCast, true, 'lượt chia cảnh mang theo phần đã hiểu và nhân vật đã chốt');
      assert.match(museBrain.asked[0].text, /CÁCH MINH HỌA: Truyện kể nhẹ nhàng/);
      assert.match(r.understanding.summary, /Mai sống ở làng ven sông/);
      assert.match(r.understanding.approach, /dựng đúng diễn biến/);
      assert.match(r.understanding.setting, /Làng ven sông/);
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
      assert.ok(progress.some(p => /^Đọc hiểu truyện · /.test(p)) && progress.some(p => p === 'Đọc hiểu truyện · xong'), 'tiến độ đọc hiểu: ' + progress.join(' | '));
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
      assert.equal(museBrain.understood.length, 1, 'truyện vừa: đọc hiểu một lượt');
      assert.ok(museBrain.asked.every(a => a.hasCast && a.hasUnderstanding), 'nhân vật đã chốt và phần đã hiểu đi theo MỌI lượt chia cảnh, kể cả lượt đầu');
      assert.ok(museBrain.asked.every(a => a.text.includes('Câu số 40:')), 'mỗi lượt đều kèm cả truyện làm ngữ cảnh');
      assert.equal(r.scenes.map(s => s.voiceover).join(' '), long);
      assert.ok(progress.some(p => /^Phần 2\/\d+ · /.test(p)));
      assert.deepEqual(r.scenes.map(s => s.title), r.scenes.map((_, i) => `Cảnh ${i + 1}`));
      assert.ok(r.scenes.every(s => plan.estimateSeconds(s.voiceover) <= 10));
      await page.close(); ok('truyện dài: nhiều lượt, nhân vật chốt chuyển tiếp, đủ chữ đúng thứ tự');
    }
    // 3b. Truyện RẤT dài (hơn 100 cảnh theo thời lượng): không giới hạn; Muse vẫn được hỏi từng lượt, app không chia nhanh trước.
    {
      const long = Array.from({ length: 170 }, (_, i) => `Câu số ${i + 1}: Mai đi qua cánh đồng ${i + 1} và nhìn về phía con sông xa, nơi gió thổi nhẹ.`).join(' ');
      assert.ok(plan.planStory(long, cfg).length > 100, 'truyện thử phải hơn 100 cảnh');
      const { page, analyzer, museBrain } = await session({}, { reply: 20000 });
      // Trước khi Muse đọc, app không được tự chia cảnh: nếu gọi chia nhanh thì test này hỏng.
      const quickSplit = plan.planStory; plan.planStory = () => { throw Error('chia nhanh chạy trước khi Muse phân tích'); };
      let r; try { r = await analyzer.run({ script: long, options: cfg }); } finally { plan.planStory = quickSplit; }
      assert.deepEqual(museBrain.asked.flatMap(a => a.units), Array.from({ length: 170 }, (_, i) => i + 1), 'mỗi câu được hỏi đúng một lần');
      assert.ok(museBrain.asked.length > 10, 'nhiều lượt: ' + museBrain.asked.length);
      assert.ok(museBrain.understood.length >= 2, 'bài dài: đọc hiểu theo từng phần ' + museBrain.understood.length);
      assert.equal(museBrain.understood[0].hasPrev, false);
      assert.ok(museBrain.understood.slice(1).every(u => u.hasPrev), 'phần sau cập nhật hiểu biết của phần trước');
      assert.equal(museBrain.understood.reduce((n, u) => n + u.sentences, 0), 170, 'mỗi câu được đọc hiểu đúng một lần');
      assert.ok(museBrain.asked.every(a => a.hasUnderstanding && a.hasCast), 'mọi lượt chia cảnh của bài dài đều mang phần đã hiểu');
      assert.equal(r.scenes.map(s => s.voiceover).join(' '), long);
      assert.ok(r.scenes.length > 100 && r.scenes.every(s => !s.offline));
      await page.close(); ok('truyện hơn 100 cảnh: không bị chặn, Muse phân tích từng lượt, đủ chữ đúng thứ tự');
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
    // 6. Muse trả lời linh tinh hai lần → dừng và báo rõ; app KHÔNG tự chia cảnh thay Muse.
    {
      const { page, analyzer, museBrain } = await session({ garbage: true });
      await assert.rejects(analyzer.run({ script: tale, options: cfg }), /Muse trả lời không đúng khuôn/);
      assert.equal(museBrain.asked.length, 2, 'thử lại một lần');
      assert.equal(museBrain.understood.length, 2, 'đọc hiểu cũng chỉ thử lại một lần');
      assert.equal(analyzer.status().busy, false);
      assert.match(analyzer.status().error, /không đúng khuôn/);
      await page.close(); ok('Muse trả lời không đúng khuôn: báo lỗi, không tự chia thay Muse');
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
    // 11b. Phần sau Muse ngừng nhận tin → giữ phần Muse đã chia (không có cảnh chia nhanh), nhớ chỗ dừng; làm tiếp từ đó đủ truyện.
    {
      const long = Array.from({ length: 40 }, (_, i) => `Câu số ${i + 1}: Mai đi qua cánh đồng ${i + 1} và nhìn về phía con sông xa.`).join(' ');
      let target;
      const first = await session({ onAsk: n => n === 1 && target.evaluate(() => { window.mode.ignoreSend = true; }) }, { echo: 500, reply: 20000 });
      target = first.page;
      const r = await first.analyzer.run({ script: long, options: cfg });
      assert.ok(r.incomplete && r.incomplete.total === 40 && r.incomplete.from > 1 && r.incomplete.from <= 40, 'dừng giữa chừng: ' + JSON.stringify(r.incomplete));
      assert.match(r.incomplete.message, /Không thấy yêu cầu hiện trong chat Muse/);
      assert.ok(r.scenes.length > 0 && r.scenes.every(s => !s.offline), 'chỉ có cảnh do Muse chia, không có cảnh chia nhanh');
      assert.equal(r.scenes.at(-1).units[1], r.incomplete.from - 1, 'các cảnh đã có kết thúc ngay trước chỗ dừng');
      assert.match(r.cast, /Bà Ba/, 'nhân vật đã chốt được trả về để làm tiếp');
      await first.page.close();
      // Làm tiếp khi Muse ổn: bắt đầu đúng ở chỗ dừng, mang theo nhân vật đã chốt, ghép lại đủ truyện.
      const second = await session({}, { reply: 20000 });
      assert.ok(r.understanding && r.understanding.summary && r.understanding.approach, 'phần đã hiểu được trả về để làm tiếp');
      const r2 = await second.analyzer.run({ script: long, options: cfg, resume: { from: r.incomplete.from, cast: r.cast, understanding: r.understanding } });
      assert.equal(second.museBrain.understood.length, 0, 'làm tiếp: không đọc hiểu lại, dùng phần đã hiểu');
      assert.equal(second.museBrain.asked[0].units[0], r.incomplete.from);
      assert.ok(second.museBrain.asked.every(a => a.hasCast && a.hasUnderstanding), 'nhân vật đã chốt và phần đã hiểu đi theo mọi lượt khi làm tiếp');
      assert.equal(r2.incomplete, undefined);
      assert.equal([...r.scenes, ...r2.scenes].map(s => s.voiceover).join(' '), long, 'ghép hai lượt vẫn đủ truyện đúng thứ tự');
      await second.page.close(); ok('Muse ngừng giữa chừng: giữ phần Muse đã chia, làm tiếp từ chỗ dừng, không chia nhanh');
    }
    // 11c. Hỏi lại câu thiếu mà Muse không nhận tin → giữ các cảnh đúng phía trước, dừng tại câu thiếu (không có cảnh mẫu).
    {
      let target;
      const { page, analyzer } = await session({ skip: [3], onAsk: n => n === 1 && target.evaluate(() => { window.mode.ignoreSend = true; }) }, { echo: 500 });
      target = page;
      const r = await analyzer.run({ script: tale, options: cfg });
      assert.equal(r.incomplete.from, 3);
      assert.deepEqual(r.scenes.map(s => s.units), [[1, 2]]);
      assert.ok(r.scenes.every(s => !s.offline));
      assert.equal(r.scenes.map(s => s.voiceover).join(' '), plan.storyUnits(tale, cfg).slice(0, 2).map(u => u.text).join(' '));
      await page.close(); ok('hỏi lại câu thiếu thất bại: dừng tại câu thiếu, không tự chia thay Muse');
    }
    // 11d. Làm tiếp với vị trí dừng sai → báo rõ, không gọi Muse.
    {
      const { page, analyzer, museBrain } = await session({});
      await assert.rejects(analyzer.run({ script: tale, options: cfg, resume: { from: 99, cast: '' } }), /Không làm tiếp được/);
      await assert.rejects(analyzer.run({ script: tale, options: cfg, resume: { from: 0, cast: '' } }), /Không làm tiếp được/);
      assert.equal(museBrain.asked.length, 0); assert.equal(analyzer.status().busy, false);
      await page.close(); ok('làm tiếp với vị trí sai: báo rõ, không hỏi Muse');
    }
    // 11e. Đọc hiểu hỏng khuôn hai lần → không dừng cả phân tích: vẫn chia cảnh bằng Muse (kèm truyện làm ngữ cảnh), có ghi chú.
    {
      const { page, analyzer, museBrain } = await session({ understandGarbage: true });
      const r = await analyzer.run({ script: tale, options: cfg });
      assert.equal(museBrain.understood.length, 2);
      assert.equal(r.understanding, null);
      assert.equal(r.notes.length, 1);
      assert.match(r.notes[0], /chưa đọc hiểu được cả bài/);
      assert.equal(museBrain.asked[0].hasUnderstanding, false);
      assert.equal(museBrain.asked[0].hasCast, false, 'không có nhân vật chốt từ bước đọc hiểu thì Muse tự chốt ở lượt chia cảnh');
      assert.equal(r.scenes.map(s => s.voiceover).join(' '), tale);
      assert.ok(r.scenes.every(s => !s.offline));
      assert.match(r.cast, /Bà Ba/);
      await page.close(); ok('đọc hiểu hỏng: vẫn chia cảnh bằng Muse, ghi chú rõ, không tự bịa');
    }
    // 11f. Bài nói / châm biếm (không phải truyện kể): yêu cầu đọc hiểu và chia cảnh đều dặn dựng TÌNH HUỐNG, vai cố định, không dựng ẩn dụ theo nghĩa đen.
    {
      const essay = ['TẠI SAO CÓ NHỮNG NGƯỜI SỐNG HAI MẶT NHƯNG MẶT NÀO CŨNG DÀY?', 'Trước mặt bạn, họ cười như vừa trúng số.', 'Sau lưng bạn, họ nói như thể bạn vừa đào mả tổ nhà họ lên.', 'Gặp thì tay bắt mặt mừng.', 'Quay lưng thì mồm bắt đầu tăng ca.', '"Sao mày lại nghĩ xấu về tao như thế?"', 'Ngọt đến mức kiến nghe xong cũng phải đi xét nghiệm tiểu đường.', 'Ví dụ trong công ty.', 'Có một người đồng nghiệp vừa được sếp khen.'].join('\n');
      const { page, analyzer, museBrain } = await session({});
      const r = await analyzer.run({ script: essay, options: cfg });
      const read = museBrain.understood[0].text, split = museBrain.asked[0].text;
      assert.match(read, /đây là truyện kể hay bài nói\/bình luận\/châm biếm/);
      assert.match(read, /vai cố định/);
      assert.match(read, /không dựng theo nghĩa đen/);
      assert.match(split, /BÀI NÓI \/ BÌNH LUẬN \/ CHÂM BIẾM/);
      assert.match(split, /dựng đúng TÌNH HUỐNG/);
      assert.match(split, /bối cảnh phải đúng nơi bài nói tới/);
      assert.match(split, /THAY ĐỔI rõ giữa các mốc/);
      assert.match(split, /mở đầu bằng bối cảnh cụ thể/);
      assert.equal(r.scenes.map(s => s.voiceover).join(' '), essay.replace(/\n/g, ' '));
      await page.close(); ok('bài nói/châm biếm: yêu cầu dặn dựng tình huống, vai cố định, bối cảnh đúng nơi, chuyển động rõ');
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
    // 13. Chế độ quảng cáo: Muse VIẾT lời quảng cáo từ thông tin sản phẩm; kết quả sạch, chỉ gửi một lần.
    const AD_SCRIPT = 'Sáng nào cũng lạnh tay?\nBình Aqua giữ nóng 12 giờ.\nNắp chống tràn, bỏ vào túi thoải mái.\nBấm vào giỏ hàng để xem chi tiết.';
    {
      const { page, analyzer, museBrain, progress } = await session({});
      const running = analyzer.writeScript({ options: adCfg });
      await new Promise(r => setTimeout(r, 120));
      assert.equal(analyzer.status().busy, true);
      assert.equal(analyzer.status().kind, 'write');
      const r = await running;
      assert.equal(r.script, AD_SCRIPT, 'bỏ lời dẫn, nhãn, emoji, hashtag, ghi chú trong ngoặc, mốc MSDONE');
      assert.equal(museBrain.asked.length, 1);
      const text = museBrain.asked[0].text;
      assert.match(text, /Sản phẩm: Bình giữ nhiệt Aqua 500ml/);
      assert.match(text, /- Giữ nóng 12 giờ\n- Nắp chống tràn/);
      assert.match(text, /Bấm vào giỏ hàng để xem chi tiết/);
      assert.match(text, /KHÔNG nhắc đến giá/, 'không đưa giá thì dặn Muse không nhắc giá');
      assert.match(text, /MSEND[0-9a-f]{6}$/);
      assert.equal(await page.inputValue('#box'), '', 'ô chat trống sau khi gửi');
      assert.ok(progress.some(p => /^Viết lời quảng cáo · Muse đang viết/.test(p)), 'tiến độ: ' + progress.join(' | '));
      assert.equal(analyzer.status().busy, false);
      assert.equal(await page.evaluate(() => window.stopClicks), 0);
      await page.close(); ok('quảng cáo: Muse viết lời, kết quả được làm sạch');
    }
    // 14. Muse trả lời rỗng lần đầu → hỏi lại một lần rồi lấy được lời.
    {
      const { page, analyzer, museBrain } = await session({ adReply: (n, done) => (n === 1 ? `MSDONE${done}` : `KỊCH BẢN:\n${AD_SCRIPT}\nMSDONE${done}`) });
      const r = await analyzer.writeScript({ options: adCfg });
      assert.equal(r.script, AD_SCRIPT);
      assert.equal(museBrain.asked.filter(a => a.adScript).length, 2);
      await page.close(); ok('quảng cáo: trả lời rỗng thì hỏi lại một lần');
    }
    // 14b. Rỗng cả hai lần → báo lỗi rõ, nhả trạng thái bận.
    {
      const { page, analyzer } = await session({ adReply: (n, done) => `MSDONE${done}` });
      await assert.rejects(analyzer.writeScript({ options: adCfg }), /Muse chưa viết lời quảng cáo/);
      assert.equal(analyzer.status().busy, false);
      await page.close(); ok('quảng cáo: Muse không viết được thì báo lỗi, không treo');
    }
    // 15. Thiếu tên sản phẩm → báo ngay, không mở Muse, không gửi gì.
    {
      const { page, analyzer, museBrain } = await session({});
      await assert.rejects(analyzer.writeScript({ options: { ...adCfg, ad: { ...adCfg.ad, product: '  ' } } }), /Nhập tên sản phẩm/);
      await assert.rejects(analyzer.writeScript({ options: cfg }), /Nhập tên sản phẩm/, 'không ở chế độ quảng cáo cũng không viết được');
      assert.equal(museBrain.asked.length, 0);
      assert.equal(await page.evaluate(() => window.sent.length), 0);
      await page.close(); ok('quảng cáo: thiếu tên sản phẩm thì không gửi gì cho Muse');
    }
    // 16. Chuỗi đầy đủ: viết lời → chia cảnh. Lời giữ nguyên văn; yêu cầu chia cảnh mang thông tin sản phẩm, máy quay, phong cách.
    {
      const { page, analyzer, museBrain } = await session({});
      const written = await analyzer.writeScript({ options: adCfg });
      const r = await analyzer.run({ script: written.script, options: { ...adCfg, reference: true } });
      assert.equal(r.scenes.map(s => s.voiceover).join(' '), written.script.replace(/\n/g, ' '));
      const ask = museBrain.asked.at(-1).text;
      assert.match(ask, /QUẢNG CÁO sản phẩm/);
      assert.match(ask, /ảnh tham chiếu đính kèm là sản phẩm thật/);
      assert.match(ask, /Chuyển động máy quay đã chọn: cận cảnh chi tiết \(macro\)/);
      assert.match(ask, /Phong cách quảng cáo: phong cách review đời thường/);
      assert.match(ask, /Sản phẩm: Bình giữ nhiệt Aqua 500ml/);
      assert.ok(r.scenes.every(s => !s.offline && s.prompt.includes(plan.NO_SPEECH)));
      await page.close(); ok('quảng cáo: viết lời rồi chia cảnh, lời đúng nguyên văn');
    }
    // 17. Đang viết thì không chạy phân tích trùng; hủy được.
    {
      const { page, analyzer } = await session({}, { reply: 20000 }, p => p.evaluate(() => { window.mode.streamMs = 4000; }));
      const first = analyzer.writeScript({ options: adCfg });
      const settled = first.then(() => 'done', e => e.name);
      await new Promise(r => setTimeout(r, 300));
      await assert.rejects(analyzer.run({ script: tale, options: cfg }), /đang phân tích/);
      await assert.rejects(analyzer.writeScript({ options: adCfg }), /đang làm việc/);
      analyzer.cancel();
      assert.equal(await settled, 'AbortError');
      assert.equal(analyzer.status().busy, false);
      assert.equal(analyzer.status().error, '');
      await page.close(); ok('quảng cáo: không chạy trùng; hủy được');
    }
  } finally { await browser.close(); }
  console.log(`PASS: ${passed} story analysis scenarios against a fake Muse chat page (not the real Muse).`);
})().catch(e => { console.error(e); process.exitCode = 1; });
