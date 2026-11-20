// Chọn tài khoản Muse rảnh để viết kịch bản khi tài khoản khác đang bận.
// Hàng đợi còn việc chờ (hoặc có việc đang chạy mà chưa biết tài khoản) thì mọi tài khoản trong «Chạy song song» đều bận;
// hết việc chờ thì chỉ những tài khoản đang chạy việc mới bận. Tài khoản đang mở thì ưu tiên; không có thì dùng tài khoản 1 nếu nó rảnh.
function takenAccounts({ leases = [], accountOneBusy = false, queueActive = false, jobs = [], accountCount = 1 }) {
  const taken = new Set(leases);
  if (accountOneBusy) taken.add(0);
  if (queueActive) {
    const running = jobs.filter(job => job.status === 'running'), pending = jobs.some(job => job.status === 'pending');
    if (pending || running.some(job => !(Number(job.account) > 0))) for (let i = 0; i < accountCount; i++) taken.add(i);
    else for (const job of running) taken.add(Number(job.account) - 1);
  }
  return taken;
}
function pickAccount({ taken, isOpen, max = 10 }) {
  for (let i = 0; i < max; i++) if (!taken.has(i) && isOpen(i)) return i;
  return taken.has(0) ? -1 : 0;
}
module.exports = { takenAccounts, pickAccount };
