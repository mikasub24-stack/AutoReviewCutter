// Muse tự đọc hiểu câu chuyện NGAY TRONG APP: gửi yêu cầu vào khung chat Muse (tài khoản 1), chờ Muse viết xong,
// đọc trả lời, rồi ghép với lời thật của truyện. Muse chỉ quyết định ranh giới cảnh và viết prompt hình;
// lời đọc luôn lấy nguyên văn từ truyện nên không thể bị Muse sửa.
const { randomBytes } = require('node:crypto');
const { prepareBrowserProbe, clearBrowserProbeDraft } = require('./browser-probe.cjs');
const { submitPrompt } = require('./submit-prompt.cjs');
const { browserStop } = require('./browser-stop.cjs');
const { readChatReply, endTextAsk } = require('./muse-text.cjs');
const defaultPlan = require('./story-plan.js');

const CHUNK_SCENES = 8;           // số cảnh dự kiến mỗi lượt hỏi Muse (trả lời đủ ngắn, ít sai)
const IDLE_WAIT_MS = 180000;      // chờ chat Muse rảnh trước khi gửi
const COMPOSER_WAIT_MS = 45000;   // chờ ô chat sẵn sàng (đăng nhập)
const ECHO_WAIT_MS = 90000;       // sau khi bấm Gửi, chờ tin nhắn hiện trong chat
const REPLY_WAIT_MS = 8 * 60000;  // tối đa chờ Muse viết xong một lượt
const STABLE_MS = 10000;          // Muse ngừng viết và chữ không đổi từng ấy thì coi như xong (khi Muse quên mốc kết thúc)

const infra = message => Object.assign(Error(message), { infra: true });
const friendly = message => /bản nháp/.test(message) ? 'Ô chat Muse còn bản nháp. Xóa bản nháp trong Muse tài khoản 1 rồi bấm Phân tích lại.' : /ảnh đính kèm/.test(message) ? 'Ô chat Muse còn ảnh đính kèm. Gỡ ảnh trong Muse tài khoản 1 rồi bấm Phân tích lại.' : message.replace(/ ?Test( tất cả trình duyệt)? lại\.?/, ' Phân tích lại.');
const transient = error => error?.code === 'MUSE_DOM_TIMEOUT' || /Execution context was destroyed|context.*destroyed|Target closed|navigation|not respond|chưa phản hồi/i.test(error?.message || '');

function createStoryAnalyzer({ plan = defaultPlan, dom, openMuse, getMuse, getSettings, delay, notify = () => {}, isBusy = () => false, ensureAllowed = async () => {}, timing = {} }) {
  const t = { idle: IDLE_WAIT_MS, composer: COMPOSER_WAIT_MS, echo: ECHO_WAIT_MS, reply: REPLY_WAIT_MS, stable: STABLE_MS, poll: 1500, ...timing };
  const state = { busy: false, kind: '', progress: '', error: '', part: 0, parts: 0 };
  let controller = null;

  const say = (progress, extra = {}) => { Object.assign(state, { progress }, extra); notify(); };
  const status = () => ({ busy: state.busy, kind: state.kind, progress: state.progress, error: state.error, part: state.part, parts: state.parts });
  const check = signal => { if (signal.aborted) throw Object.assign(Error('Đã dừng phân tích.'), { name: 'AbortError' }); };
  const wait = async (ms, signal) => { const end = Date.now() + ms; while (Date.now() < end) { check(signal); await delay(Math.min(250, end - Date.now())); } check(signal); };
  const call = (muse, fn, arg, signal) => { check(signal); return dom(muse, fn, arg); };

  // Gửi một yêu cầu vào chat Muse và trả về văn bản trả lời.
  async function ask(muse, instruction, marker, signal, label) {
    const s = getSettings(), id = `ask-${marker}`;
    const stopArgs = request => ({ composerSelector: s.composer, selector: s.stopSelector || '', trackerId: id, request });
    const endMarker = `MSEND${marker}`, doneMarker = `MSDONE${marker}`;
    let submitted = false;
    try {
      // 1. Chat đang bận (Muse còn trả lời hoặc tạo video trước đó) → chờ, không chen vào.
      const idleBy = Date.now() + t.idle;
      while (true) {
        let widget;
        try { widget = await call(muse, browserStop, stopArgs(false), signal); } catch (e) { if (!transient(e)) throw e; await wait(1500, signal); continue; }
        if (widget?.state !== 'generating') break;
        if (Date.now() > idleBy) throw infra('Chat Muse đang bận quá lâu. Chờ Muse xong việc hiện tại rồi bấm Phân tích lại.');
        say(`${label} · Muse còn đang xử lý việc trước, chờ rảnh rồi mới gửi…`);
        await wait(1000, signal);
      }
      // 2. Nhập yêu cầu vào ô chat.
      const composerBy = Date.now() + t.composer;
      while (true) {
        let ready;
        try { ready = await call(muse, prepareBrowserProbe, { id, composerSelector: s.composer, text: instruction }, signal); }
        catch (e) { if (!transient(e)) throw infra(friendly(e.message)); await wait(1000, signal); continue; }
        if (ready) break;
        if (Date.now() > composerBy) throw infra('Chưa thấy ô chat Muse. Đăng nhập Muse tài khoản 1 trong cửa sổ Muse rồi bấm Phân tích lại.');
        say(`${label} · chờ ô chat Muse (đăng nhập nếu cần)…`);
        await wait(600, signal);
      }
      // 3. Gửi.
      say(`${label} · đang gửi cho Muse…`);
      submitted = true;
      const sent = await call(muse, submitPrompt, { id, selector: s.submit, composerSelector: s.composer, attachmentTokens: [] }, signal);
      if (!sent?.clicked) throw infra('Chưa bấm được nút Gửi của Muse.');
      // 4. Chờ Muse viết xong.
      const sentAt = Date.now();
      let last = '', changedAt = Date.now(), seen = false;
      while (true) {
        check(signal);
        let reply, widget;
        try { reply = await call(muse, readChatReply, { endMarker, doneMarker }, signal); widget = await call(muse, browserStop, stopArgs(false), signal); }
        catch (e) { if (!transient(e)) throw e; await wait(2000, signal); continue; }
        if (!reply.echo) {
          if (Date.now() - sentAt > t.echo) throw infra('Không thấy yêu cầu hiện trong chat Muse. Mở cửa sổ Muse tài khoản 1 xem Muse có nhận tin nhắn không.');
        } else {
          seen = true;
          if (reply.done) return reply.text;   // Muse đã ghi mốc kết thúc (nếu trả lời rỗng, phần tách sẽ báo và hỏi lại)
          if (reply.text !== last) { last = reply.text; changedAt = Date.now(); }
          const lines = (reply.text.match(/^[\t ]*(?:\*\*|#+\s*)?(?:cảnh|scene)\s*\d+/gim) || []).length;
          say(`${label} · Muse đang viết${lines ? ` (đã ${lines} cảnh)` : ''}…`);
          if (widget?.state !== 'generating' && last && Date.now() - changedAt >= t.stable) return last;
        }
        if (Date.now() - sentAt > t.reply) {
          if (seen && last) return last;
          throw infra('Muse trả lời quá lâu. Thử lại.');
        }
        await wait(t.poll, signal);
      }
    } catch (error) {
      // Hủy giữa chừng: dừng Muse đang viết nếu đã gửi, rồi dọn.
      if (submitted && signal.aborted) await dom(muse, browserStop, stopArgs(true)).catch(() => {});
      throw error;
    } finally {
      await dom(muse, endTextAsk, { id }).catch(() => {});
      // Yêu cầu chưa được Muse nhận mà vẫn nằm trong ô chat → gỡ đi, không để lại bản nháp của tool.
      await dom(muse, clearBrowserProbeDraft, { composerSelector: s.composer, text: instruction }).catch(() => {});
    }
  }

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
      if (!config.ad && !understanding) {
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
    plan.buildAdScriptInstruction(config);   // báo lỗi thiếu tên sản phẩm trước khi mở Muse
    if (isBusy()) throw Error('Dừng hàng đợi và các thao tác trình duyệt trước khi nhờ Muse viết lời quảng cáo.');
    await ensureAllowed();
    controller = new AbortController();
    const signal = controller.signal;
    const label = 'Viết lời quảng cáo';
    Object.assign(state, { busy: true, kind: 'write', error: '', progress: 'Đang mở Muse…', part: 0, parts: 1 });
    notify();
    try {
      await openMuse(0);
      check(signal);
      const muse = getMuse(0);
      if (!muse) throw infra('Chưa mở được Muse tài khoản 1.');
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
      if (error.name !== 'AbortError') error.message = String(error.message).replace('bấm Phân tích lại.', 'bấm «Muse viết lời quảng cáo» lại.');
      state.error = error.name === 'AbortError' ? '' : error.message;
      throw error;
    } finally {
      state.busy = false; controller = null;
      notify();
    }
  }

  function cancel() { controller?.abort(); }
  return { run, writeScript, cancel, status, chunkRanges, get busy() { return state.busy; } };
}

module.exports = { createStoryAnalyzer };
