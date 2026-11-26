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
// Thứ tự chọn: tài khoản đang mở và rảnh → tài khoản rảnh đã đăng nhập sẵn (canOpen) để app tự mở thêm cửa sổ → tài khoản 1 nếu rảnh.
function pickAccount({ taken, isOpen, canOpen = () => false, max = 10 }) {
  for (let i = 0; i < max; i++) if (!taken.has(i) && isOpen(i)) return i;
  for (let i = 0; i < max; i++) if (!taken.has(i) && canOpen(i)) return i;
  return taken.has(0) ? -1 : 0;
}
const NONE_FREE = 'Mọi tài khoản Muse đang mở đều bận. Chờ xong hoặc đăng nhập thêm một tài khoản Muse khác rồi thử lại.';
// Lấy tài khoản Muse cho một lượt việc: có leaseAccount thì thuê tài khoản rảnh (tài khoản 1 bận thì dùng tài khoản khác);
// không có thì dùng tài khoản 1 và từ chối khi hàng đợi hay thao tác khác đang chạy. Trả về {index, release()} hoặc null.
async function acquireAccount({ leaseAccount = null, isBusy = () => false, ensureAllowed = async () => {}, owner, busyMessage }) {
  if (leaseAccount) {
    await ensureAllowed();
    const lease = leaseAccount(owner);
    if (!lease) throw Error(NONE_FREE);
    return lease;
  }
  if (isBusy()) throw Error(busyMessage);
  await ensureAllowed();
  return null;
}
module.exports = { takenAccounts, pickAccount, acquireAccount, NONE_FREE };
