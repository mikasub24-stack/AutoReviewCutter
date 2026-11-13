// Muse tự đọc hiểu câu chuyện NGAY TRONG APP: gửi yêu cầu vào khung chat Muse (tài khoản 1), chờ Muse viết xong,
// đọc trả lời, rồi ghép với lời thật của truyện. Muse chỉ quyết định ranh giới cảnh và viết prompt hình;
// lời đọc luôn lấy nguyên văn từ truyện nên không thể bị Muse sửa.
const { randomBytes } = require('node:crypto');
const { createMuseAsk, infra } = require('./muse-ask.cjs');
const defaultPlan = require('./story-plan.js');

const CHUNK_SCENES = 8;           // số cảnh dự kiến mỗi lượt hỏi Muse (trả lời đủ ngắn, ít sai)

function createStoryAnalyzer({ plan = defaultPlan, dom, openMuse, getMuse, getSettings, delay, notify = () => {}, isBusy = () => false, ensureAllowed = async () => {}, timing = {} }) {
  const state = { busy: false, kind: '', progress: '', error: '', part: 0, parts: 0 };
  let controller = null;

  const say = (progress, extra = {}) => { Object.assign(state, { progress }, extra); notify(); };
  const status = () => ({ busy: state.busy, kind: state.kind, progress: state.progress, error: state.error, part: state.part, parts: state.parts });
  const check = signal => { if (signal.aborted) throw Object.assign(Error('Đã dừng phân tích.'), { name: 'AbortError' }); };
  const wait = async (ms, signal) => { const end = Date.now() + ms; while (Date.now() < end) { check(signal); await delay(Math.min(250, end - Date.now())); } check(signal); };
  const call = (muse, fn, arg, signal) => { check(signal); return dom(muse, fn, arg); };

  // Gửi một yêu cầu vào chat Muse và trả về văn bản trả lời (bộ gửi dùng chung ở muse-ask.cjs).
  const { ask } = createMuseAsk({ dom, getSettings, delay, say: (...a) => say(...a), timing });

  // Chia câu chuyện thành các lượt hỏi, mỗi lượt khoảng CHUNK_SCENES cảnh (theo độ dài lời đọc).
  function chunkRanges(units, config) {
    const language = plan.detectLanguage(units.map(u => u.text).join(' '));
    const limit = plan.charsPerSecond(language) * config.seconds * 0.9;
    const budget = limit * CHUNK_SCENES;
    const ranges = [];
    let start = 1, size = 0;
    units.forEach((unit, index) => {
      const len = Array.from(unit.text).length + 1;
      if (index + 1 > start && size + len > budget) { ranges.push([start, index]); start = index + 1; size = 0; }
      size += len;
    });
    ranges.push([start, units.length]);
    return ranges;
  }

  // Muse đọc hiểu cả bài TRƯỚC khi chia cảnh (tóm tắt, cách minh họa, nhân vật/vai, bối cảnh). Bài dài thì đọc từng phần, mỗi phần cập nhật hiểu biết đã có.
  // Trả lời hỏng khuôn hai lần thì trả null (làm theo cách cũ: mỗi lượt chia cảnh kèm truyện làm ngữ cảnh), không tự bịa phần đọc hiểu.
  async function understandStory({ muse, script, config, units, signal }) {
    const parts = plan.understandRanges(units);
    let understanding = null, cast = '';
    for (let k = 0; k < parts.length; k++) {
      const label = parts.length > 1 ? `Đọc hiểu truyện ${k + 1}/${parts.length}` : 'Đọc hiểu truyện';
      let got = null;
      for (let attempt = 0; attempt < 2 && !got; attempt++) {
        const marker = randomBytes(3).toString('hex');
        say(`${label} · chuẩn bị yêu cầu…`);
        const instruction = plan.buildUnderstandInstruction(script, config, { units, range: parts[k], part: k + 1, parts: parts.length, understanding, cast, marker });
        let reply;
        try { reply = await ask(muse, instruction, marker, signal, label); }
        catch (e) { if (!e.infra || attempt) throw e; await wait(2000, signal); continue; }
        try { got = plan.parseUnderstanding(reply); } catch { /* hỏi lại một lần */ }
      }
      if (!got) return null;
      understanding = { summary: got.summary, approach: got.approach, setting: got.setting };
      cast = got.cast || cast;
    }
    say('Đọc hiểu truyện · xong');
    return { understanding, cast };
  }

  // `resume` = { from, cast, understanding }: làm tiếp từ câu `from` (sau khi một lượt trước đó dừng giữa chừng), giữ nhân vật đã chốt.
  async function run({ script, options: input = {}, resume = null }) {
    if (state.busy) throw Error('Muse đang phân tích. Chờ xong hoặc bấm Dừng.');
    const config = plan.options(input);
    if (typeof script !== 'string' || !script.trim()) throw Error('Dán kịch bản trước khi nhờ Muse đọc.');
    const units = plan.storyUnits(script, config);
    let ranges = chunkRanges(units, config), startCast = '', startUnderstanding = null;
    if (resume) {
      const at = Number(resume.from);
      if (!Number.isInteger(at) || at < 1 || at > units.length) throw Error('Không làm tiếp được vì vị trí dừng không khớp kịch bản. Bấm phân tích lại từ đầu.');
      ranges = ranges.filter(([, to]) => to >= at).map(([a, b]) => [Math.max(a, at), b]);
      startCast = String(resume.cast || '').slice(0, 4000);
      const u = resume.understanding;
      if (u && typeof u === 'object' && String(u.summary || '').trim()) startUnderstanding = { summary: String(u.summary).slice(0, 4000), approach: String(u.approach || '').slice(0, 3000), setting: String(u.setting || '').slice(0, 1500) };
    }
    if (isBusy()) throw Error('Dừng hàng đợi và các thao tác trình duyệt trước khi nhờ Muse phân tích.');
    await ensureAllowed();
    controller = new AbortController();
    const signal = controller.signal;
    Object.assign(state, { busy: true, kind: 'analyze', error: '', progress: 'Đang mở Muse…', part: 0, parts: ranges.length });
    notify();
    const notes = [];
    try {
      await openMuse(0);
      check(signal);
      const muse = getMuse(0);
      if (!muse) throw infra('Chưa mở được Muse tài khoản 1.');
      let cast = startCast, understanding = startUnderstanding, stop = null;
      // Truyện (không phải quảng cáo): Muse đọc hiểu cả bài trước, rồi mới chia cảnh theo hiểu biết đó.
      // Mẹo vặt ngắn và rõ ràng từng bước nên bỏ lượt đọc hiểu riêng (đỡ tốn lượt Muse); lượt chia bước đã tự đọc cả mẹo.
      if (!config.ad && !config.tip && !understanding) {
        const read = await understandStory({ muse, script, config, units, signal });
        if (read) { understanding = read.understanding; if (!cast) cast = read.cast; }
        else notes.push('Muse chưa đọc hiểu được cả bài (trả lời sai khuôn) nên các lượt chia cảnh chỉ kèm truyện làm ngữ cảnh.');
      }
      const all = [];
      for (let i = 0; i < ranges.length; i++) {
        const [from, to] = ranges[i];
        const label = ranges.length > 1 ? `Phần ${i + 1}/${ranges.length}` : 'Phân tích';
        try {
          say(`${label} · chuẩn bị yêu cầu…`, { part: i + 1 });
          const ask1 = (list, extra = {}) => {
            const marker = randomBytes(3).toString('hex');
            const instruction = plan.buildMuseInstruction(script, config, { units, ranges: list, cast, understanding, part: i + 1, parts: ranges.length, marker, ...extra });
            return ask(muse, instruction, marker, signal, label);
          };
          let scenes = null;
          for (let attempt = 0; attempt < 2 && !scenes; attempt++) {
            let reply;
            try { reply = await ask1([[from, to]]); }
            catch (e) { if (!e.infra || attempt) throw e; await wait(2000, signal); continue; }
            try {
              const got = plan.scenesFromReply(script, reply, config, { from, to });
              if (!got.scenes.length) throw Error('Trả lời không có số câu.');
              if (got.cast) cast = got.cast;
              scenes = got.scenes;
            } catch (e) {
              // Không tự chia thay Muse: trả lời hỏng hai lần thì dừng lượt này (các phần đã xong được giữ để làm tiếp).
              if (attempt) throw Error('Muse trả lời không đúng khuôn (không thấy số câu và prompt cho từng cảnh).');
            }
          }
          // Câu Muse bỏ sót hoặc chia sai (cảnh mẫu) → hỏi lại đúng những câu đó, tối đa 3 đoạn mỗi phần.
          const runs = [];
          scenes.forEach((scene, index) => {
            if (!scene.offline || !scene.units) return;
            const run = runs.at(-1);
            if (run && run.end === index - 1) { run.end = index; run.to = scene.units[1]; } else runs.push({ from: scene.units[0], to: scene.units[1], start: index, end: index });
          });
          if (runs.length) {
            say(`${label} · hỏi lại Muse ${Math.min(runs.length, 3)} đoạn còn thiếu…`);
            for (const run of runs.slice(0, 3).reverse()) {
              try {
                const reply = await ask1([[run.from, run.to]]);
                const got = plan.scenesFromReply(script, reply, config, { from: run.from, to: run.to });
                if (got.cast) cast = got.cast;
                if (got.scenes.length) scenes.splice(run.start, run.end - run.start + 1, ...got.scenes);
              } catch (e) {
                if (e.name === 'AbortError') throw e;
                if (e.infra) break;   // Muse không trả lời: dừng ở câu còn thiếu, ngay bên dưới
                /* trả lời hỏng: thử đoạn khác */
              }
            }
          }
          // Truyện bị chia vụn (nhiều cảnh liền nhau ngắn hơn ~70% clip mà gộp lại vẫn vừa một clip) → nhờ Muse gộp đúng những dải đó, mỗi phần tối đa 4 dải
          // (dải gộp được nhiều cảnh nhất trước). Chỉ nhận bản mới khi ít cảnh hơn và Muse chia đúng khuôn; Muse thấy đổi địa điểm / thời gian thì giữ nguyên.
          if (!config.ad && !config.tip && !scenes.some(s => s.offline) && typeof plan.shortRuns === 'function') {
            const runs = plan.shortRuns(scenes, config).sort((x, y) => y.gain - x.gain || x.start - y.start).slice(0, 4).sort((x, y) => y.start - x.start);
            if (runs.length) {
              say(`${label} · gộp ${runs.reduce((n, r) => n + r.count, 0)} cảnh quá ngắn…`);
              for (const run of runs) {
                try {
                  const old = scenes.slice(run.start, run.end + 1);
                  const reply = await ask1([[run.from, run.to]], { fix: plan.shortFix(old, config) });
                  const got = plan.scenesFromReply(script, reply, config, { from: run.from, to: run.to });
                  if (got.cast) cast = got.cast;
                  if (got.scenes.length && got.scenes.length < old.length && !got.scenes.some(s => s.offline)) scenes.splice(run.start, old.length, ...got.scenes);
                } catch (e) {
                  if (e.name === 'AbortError') throw e;
                  if (e.infra) break;   // Muse không trả lời: giữ các cảnh cũ
                  /* trả lời hỏng: giữ bản cũ */
                }
              }
            }
          }
          // Cảnh Muse ghi mốc chuyển động sai (đảo thứ tự câu, thiếu câu, nhắc câu ngoài cảnh) → hỏi lại đúng những cảnh đó một lần,
          // chỉ nhận bản mới khi không tệ hơn bản cũ. Muse không ghi số câu thì không có gì để kiểm, không hỏi lại.
          if (!scenes.some(s => s.offline) && typeof plan.motionIssues === 'function') {
            const hard = scene => plan.motionIssues(scene, config).filter(x => x.hard);
            const hardCount = list => list.reduce((n, s) => n + hard(s).length, 0);
            const bad = [];
            scenes.forEach((scene, index) => {
              const issues = hard(scene);
              if (!issues.length || !scene.units) return;
              const run = bad.at(-1), item = { scene, issues };
              if (run && run.end === index - 1) { run.end = index; run.to = scene.units[1]; run.items.push(item); } else bad.push({ from: scene.units[0], to: scene.units[1], start: index, end: index, items: [item] });
            });
            if (bad.length) {
              say(`${label} · soát lại chuyển động ${bad.reduce((n, r) => n + r.items.length, 0)} cảnh…`);
              for (const run of bad.slice(0, 3).reverse()) {
                try {
                  const fix = run.items.map(({ scene, issues }) => `- Cảnh gồm câu ${scene.units[0] === scene.units[1] ? scene.units[0] : `${scene.units[0]}–${scene.units[1]}`} (video ${scene.durationSeconds} giây): ${issues.map(x => x.text).join(' ')}`).join('\n');
                  const reply = await ask1([[run.from, run.to]], { fix });
                  const got = plan.scenesFromReply(script, reply, config, { from: run.from, to: run.to });
                  if (got.cast) cast = got.cast;
                  const old = scenes.slice(run.start, run.end + 1);
                  if (got.scenes.length && !got.scenes.some(s => s.offline) && hardCount(got.scenes) <= hardCount(old)) scenes.splice(run.start, run.end - run.start + 1, ...got.scenes);
                } catch (e) {
                  if (e.name === 'AbortError') throw e;
                  if (e.infra) break;   // Muse không trả lời: giữ bản cũ, cảnh báo ở từng cảnh
                  /* trả lời hỏng: giữ bản cũ */
                }
              }
            }
          }
          // Câu nào Muse vẫn chưa chia đúng thì KHÔNG tự chia thay Muse: giữ các cảnh đúng phía trước, dừng tại câu đó để làm tiếp.
          const missing = scenes.findIndex(s => s.offline);
          if (missing !== -1) {
            const at = scenes[missing].units?.[0] || from;
            all.push(...scenes.slice(0, missing));
            if (!all.length) throw Error(`Muse chưa chia được đoạn bắt đầu từ câu ${at}.`);
            stop = { from: at, message: `Muse chưa chia đúng đoạn từ câu ${at}.` };
            break;
          }
          all.push(...scenes);
          say(`${label} · xong ${all.length} cảnh`);
        } catch (e) {
          // Đã có ít nhất một phần xong thì giữ lại và dừng tại đầu phần lỗi để làm tiếp; chưa có gì thì báo lỗi.
          if (e.name === 'AbortError' || !all.length) throw e;
          stop = { from: ranges[i][0], message: e.message };
          break;
        }
      }
      const motionLeft = typeof plan.motionIssues === 'function' ? all.filter(s => plan.motionIssues(s, config).some(x => x.hard)).length : 0;
      if (motionLeft) notes.push(`Còn ${motionLeft} cảnh có mốc chuyển động lệch thứ tự câu hoặc thiếu câu (xem ⚠ ở từng cảnh).`);
      const final = all.map((scene, index) => ({ ...scene, title: `Cảnh ${index + 1}` }));
      say(stop ? `Muse đã chia ${final.length} cảnh, dừng ở câu ${stop.from}` : `Muse đã chia ${final.length} cảnh`);
      return { scenes: final, cast, understanding, notes, ...(stop ? { incomplete: { from: stop.from, total: units.length, message: stop.message } } : {}) };
    } catch (error) {
      state.error = error.name === 'AbortError' ? '' : error.message;
      throw error;
    } finally {
      state.busy = false; controller = null;
      notify();
    }
  }

  // Chế độ quảng cáo: nhờ Muse VIẾT lời quảng cáo từ thông tin sản phẩm. Kết quả đưa vào ô kịch bản để người dùng sửa.
  async function writeScript({ options: input = {} }) {
    if (state.busy) throw Error('Muse đang làm việc. Chờ xong hoặc bấm Dừng.');
    const config = plan.options(input);
    const tip = Boolean(config.tip);
    if (tip) plan.buildTipScriptInstruction(config); else plan.buildAdScriptInstruction(config);   // báo lỗi thiếu tiêu đề / tên sản phẩm trước khi mở Muse
    if (isBusy()) throw Error(`Dừng hàng đợi và các thao tác trình duyệt trước khi nhờ Muse viết ${tip ? 'mẹo' : 'lời quảng cáo'}.`);
    await ensureAllowed();
    controller = new AbortController();
    const signal = controller.signal;
    const plant = tip && config.tipKind === 'plant', history = tip && config.tipKind === 'history';
    const label = history ? 'Viết bài lịch sử' : plant ? 'Viết bài trồng cây' : tip ? 'Viết mẹo vặt' : 'Viết lời quảng cáo';
    Object.assign(state, { busy: true, kind: 'write', error: '', progress: 'Đang mở Muse…', part: 0, parts: 1 });
    notify();
    try {
      await openMuse(0);
      check(signal);
      const muse = getMuse(0);
      if (!muse) throw infra('Chưa mở được Muse tài khoản 1.');
      if (tip) {
        const result = await writeTip(muse, config, signal, label);
        if (!result.stopped) say(history ? `Muse đã viết xong bài lịch sử (${result.steps} đoạn)` : `Muse đã viết xong ${plant ? 'bài trồng cây' : 'mẹo vặt'} (${result.steps} bước)`);
        // Bài lịch sử không có nhãn «Bước k:» (nhãn chỉ để soát đủ mục): bỏ đi để lời đọc là bài kể liền mạch.
        return { script: history ? plan.stripStepLabels(result.script) : result.script, notes: result.notes };
      }
      let script = '';
      for (let attempt = 0; attempt < 2 && !script; attempt++) {
        const marker = randomBytes(3).toString('hex');
        say(`${label} · chuẩn bị yêu cầu…`);
        let reply;
        try { reply = await ask(muse, plan.buildAdScriptInstruction(config, { marker }), marker, signal, label); }
        catch (e) { if (!e.infra || attempt) throw e; await wait(2000, signal); continue; }
        try { script = plan.scriptFromReply(reply); }
        catch (e) { if (attempt) throw e; }
      }
      say('Muse đã viết xong lời quảng cáo');
      return { script };
    } catch (error) {
      if (error.name !== 'AbortError') error.message = String(error.message).replace('bấm Phân tích lại.', tip ? 'bấm «Muse viết mẹo» lại.' : 'bấm «Muse viết lời quảng cáo» lại.');
      state.error = error.name === 'AbortError' ? '' : error.message;
      throw error;
    } finally {
      state.busy = false; controller = null;
      notify();
    }
  }

  // Mẹo vặt từ tiêu đề: viết theo từng phần (≤16 mục mỗi lượt), phần sau xem lại phần đã viết để nối tiếp; mỗi phần soát đủ bước, hỏi lại một lần nếu thiếu.
  async function writeTip(muse, config, signal, label) {
    const tp = plan.tipPlan(config);
    const parts = plan.tipParts(tp), notes = [], missing = [], long = [];
    let written = '', stopped = null;
    for (let index = 0; index < parts.length; index++) {
      const part = parts[index], partLabel = parts.length > 1 ? `${label} ${index + 1}/${parts.length}` : label;
      let best = null, fix = '';
      try {
        for (let attempt = 0; attempt < 2; attempt++) {
          check(signal);
          const marker = randomBytes(3).toString('hex');
          say(`${partLabel} · chuẩn bị yêu cầu…`);
          let reply;
          try { reply = await ask(muse, plan.buildTipScriptInstruction(config, { marker, part, parts: parts.length, number: index + 1, written, fix }), marker, signal, partLabel); }
          catch (e) { if (!e.infra || attempt) throw e; await wait(2000, signal); continue; }
          let text;
          try { text = plan.tipTrim(plan.tipScriptFromReply(reply), tp, part); }
          catch (e) { if (attempt) { if (best) break; throw e; } fix = ''; continue; }
          const issues = plan.tipCheck(text, tp, part);
          const score = issues.missing.length * 3 + issues.long.length + (issues.noIntro ? 2 : 0) + (issues.noEnd ? 2 : 0);
          if (!best || score < best.score) best = { text, issues, score };
          if (issues.ok) break;
          fix = plan.tipFix(issues, tp);
        }
        if (!best) throw Error('Muse chưa viết mẹo. Bấm «Muse viết mẹo» lại.');
        const wanted = Math.min(part[1], tp.total - 1) - Math.max(part[0], 2) + 1;
        if (wanted > 0 && best.issues.missing.length * 2 > wanted) throw Error(`Muse viết thiếu nhiều bước (thiếu ${best.issues.missing.length}/${wanted} bước ở phần ${index + 1}). Bấm «Muse viết mẹo» lại.`);
        missing.push(...best.issues.missing); long.push(...best.issues.long);
        written = written ? written + '\n' + best.text : best.text;
      } catch (error) {
        // Bài lịch sử dài: lỗi giữa chừng (không phải bấm Dừng) thì giữ phần đã viết thay vì mất cả bài.
        if (!tp.history || error.name === 'AbortError' || !written) throw error;
        stopped = { number: index + 1, parts: parts.length };
        say(`Muse dừng ở phần ${stopped.number}/${stopped.parts}, giữ phần đã viết`);
        break;
      }
    }
    // Một ghi chú duy nhất (thiếu bước được ưu tiên hơn bước dài) để giao diện hiện gọn và dịch được.
    if (tp.history) {
      if (missing.length) notes.push(`Muse còn thiếu ${missing.length} đoạn của bài: bổ sung vào ô bài hoặc bấm viết lại.`);
      else if (long.length) notes.push(`${long.length} đoạn hơi dài, có thể bị chia thành 2 cảnh.`);
    } else if (missing.length) notes.push(`Muse còn thiếu ${missing.map(k => 'bước ' + k).join(', ')}: bổ sung vào ô mẹo hoặc bấm viết lại.`);
    else if (long.length) notes.push(`${long.map(k => 'Bước ' + k).join(', ')} hơi dài, có thể bị chia thành 2 cảnh.`);
    if (stopped) notes.unshift(`Muse dừng ở phần ${stopped.number}/${stopped.parts} nên bài mới có phần đầu. Dán nốt phần còn lại vào cuối ô bài hoặc bấm viết lại.`);
    return { script: written, steps: tp.steps, notes, stopped: Boolean(stopped) };
  }

  function cancel() { controller?.abort(); }
  return { run, writeScript, cancel, status, chunkRanges, get busy() { return state.busy; } };
}

module.exports = { createStoryAnalyzer };
