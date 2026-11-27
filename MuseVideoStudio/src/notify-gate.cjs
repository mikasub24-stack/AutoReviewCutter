// Gom các lần báo trạng thái sang giao diện: mỗi lần là cả bản chụp trạng thái (hàng MB khi có vài trăm cảnh) và giao diện vẽ lại từ đầu,
// mà một cảnh đang chạy đổi trạng thái vài lần mỗi giây. Lần đầu gửi ngay; các lần sau trong vòng minMs gộp thành một lần gửi muộn
// (bản chụp lúc đó, luôn là trạng thái mới nhất). minMs = 0 → gửi mọi lần như cũ.
function createGate(send, { minMs = 250, now = Date.now, setTimer = setTimeout, clearTimer = clearTimeout } = {}) {
  let last = -Infinity, timer = null;
  const flush = () => { timer = null; last = now(); send(); };
  const gate = () => {
    if (!(minMs > 0)) { send(); return; }
    const wait = minMs - (now() - last);
    if (wait <= 0) { if (timer) { clearTimer(timer); timer = null; } flush(); }
    else if (!timer) { timer = setTimer(flush, wait); timer.unref?.(); }
  };
  gate.flushNow = () => { if (timer) { clearTimer(timer); timer = null; } flush(); };
  gate.pending = () => timer !== null;
  return gate;
}
module.exports = { createGate };
