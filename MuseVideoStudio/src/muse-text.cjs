// Chạy trong trang Muse (qua dom()), không dùng biến ngoài. Đọc TRẢ LỜI VĂN BẢN của Muse cho một yêu cầu phân tích truyện.
// Yêu cầu kết thúc bằng một từ mốc duy nhất (MSEND…); trả lời kết thúc bằng mốc khác (MSDONE…).
// Mốc là chữ + số thuần để không bị markdown biến đổi.
function readChatReply({ endMarker, doneMarker }) {
  const text = String(document.body.innerText || '');
  const at = text.lastIndexOf(endMarker);
  // Chưa thấy mốc cuối yêu cầu trong trang = Muse chưa hiện tin nhắn của mình.
  if (at < 0) return { echo: false, text: '', done: false };
  const rest = text.slice(at + endMarker.length);
  const end = rest.indexOf(doneMarker);
  if (end >= 0) return { echo: true, text: rest.slice(0, end).trim(), done: true };
  return { echo: true, text: rest.trim(), done: false };
}
// Gỡ mốc theo dõi trong trang sau khi xong (hoặc khi hủy).
function endTextAsk({ id }) {
  const map = globalThis[Symbol.for('MuseVideoStudio.promptTrackers.v1')];
  return Boolean(map && map.delete(id));
}
module.exports = { readChatReply, endTextAsk };
