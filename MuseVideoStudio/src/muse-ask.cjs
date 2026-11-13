// Gửi một yêu cầu vào khung chat Muse (tài khoản 1) rồi chờ Muse viết xong và đọc trả lời.
// Dùng chung cho các tab nhờ Muse viết chữ (Kể chuyện, Động vật hoang dã); không giữ trạng thái giao diện riêng.
const { prepareBrowserProbe, clearBrowserProbeDraft } = require('./browser-probe.cjs');
const { submitPrompt } = require('./submit-prompt.cjs');
const { browserStop } = require('./browser-stop.cjs');
const { readChatReply, endTextAsk } = require('./muse-text.cjs');

const IDLE_WAIT_MS = 180000;      // chờ chat Muse rảnh trước khi gửi
const COMPOSER_WAIT_MS = 45000;   // chờ ô chat sẵn sàng (đăng nhập)
const ECHO_WAIT_MS = 90000;       // sau khi bấm Gửi, chờ tin nhắn hiện trong chat
const REPLY_WAIT_MS = 8 * 60000;  // tối đa chờ Muse viết xong một lượt
const STABLE_MS = 10000;          // Muse ngừng viết và chữ không đổi từng ấy thì coi như xong (khi Muse quên mốc kết thúc)
const infra = message => Object.assign(Error(message), { infra: true });
const friendly = message => /bản nháp/.test(message) ? 'Ô chat Muse còn bản nháp. Xóa bản nháp trong Muse tài khoản 1 rồi bấm Phân tích lại.' : /ảnh đính kèm/.test(message) ? 'Ô chat Muse còn ảnh đính kèm. Gỡ ảnh trong Muse tài khoản 1 rồi bấm Phân tích lại.' : message.replace(/ ?Test( tất cả trình duyệt)? lại\.?/, ' Phân tích lại.');
const transient = error => error?.code === 'MUSE_DOM_TIMEOUT' || /Execution context was destroyed|context.*destroyed|Target closed|navigation|not respond|chưa phản hồi/i.test(error?.message || '');

// `say(text)` nhận dòng tiến độ; `timing` ghi đè các mốc chờ (dùng trong test).
function createMuseAsk({ dom, getSettings, delay, say = () => {}, timing = {} }) {
  const t = { idle: IDLE_WAIT_MS, composer: COMPOSER_WAIT_MS, echo: ECHO_WAIT_MS, reply: REPLY_WAIT_MS, stable: STABLE_MS, poll: 1500, ...timing };
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

  return { ask, check, wait, call };
}

module.exports = { createMuseAsk, infra, transient, friendly };
