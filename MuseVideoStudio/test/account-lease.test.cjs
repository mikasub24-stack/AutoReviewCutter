// Viết kịch bản (So sánh, Hoang dã) và phân tích / viết (Kể chuyện) dùng tài khoản Muse rảnh khi tài khoản 1 bận,
// thay vì đòi dừng hàng đợi rồi luôn dùng tài khoản 1.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { takenAccounts, pickAccount, acquireAccount, NONE_FREE } = require('../src/account-pick.cjs');
const { createPairWriter } = require('../src/pair-write.cjs');
const { createWildWriter } = require('../src/wild-write.cjs');
const { fakeMuse: pairFake } = require('./fixtures/pair-fake-muse.cjs');
const { fakeMuse: wildFake } = require('./fixtures/wild-fake-muse.cjs');

const open = list => i => list.includes(i);

test('chọn tài khoản: đang mở và rảnh → đã đăng nhập sẵn (tự mở thêm) → tài khoản 1 nếu rảnh', () => {
  // Hàng đợi còn việc: hai tài khoản song song đều bận; chưa có tài khoản nào khác đang mở nhưng tài khoản 3 đã đăng nhập sẵn.
  const jobs = [{ status: 'running', account: 1 }, { status: 'pending' }];
  const taken = takenAccounts({ queueActive: true, jobs, accountCount: 2 });
  assert.equal(pickAccount({ taken, isOpen: open([0, 1]) }), -1, 'chưa đăng nhập tài khoản nào khác thì báo bận');
  assert.equal(pickAccount({ taken, isOpen: open([0, 1]), canOpen: open([2]) }), 2, 'tài khoản 3 đã đăng nhập sẵn thì tự mở');
  assert.equal(pickAccount({ taken, isOpen: open([0, 1, 4]), canOpen: open([2]) }), 4, 'tài khoản đang mở và rảnh được ưu tiên hơn tài khoản phải mở thêm');
  // Không có hàng đợi: tài khoản 1 rảnh thì dùng như trước.
  assert.equal(pickAccount({ taken: takenAccounts({}), isOpen: open([]), canOpen: open([]) }), 0);
  assert.equal(pickAccount({ taken: takenAccounts({}), isOpen: open([]), canOpen: open([1]) }), 1, 'tài khoản đã đăng nhập sẵn được chọn trước tài khoản 1 chưa mở');
  // Tài khoản đang được thuê thì không thuê lần nữa, kể cả khi đã đăng nhập sẵn.
  assert.equal(pickAccount({ taken: takenAccounts({ leases: [0, 2] }), isOpen: open([0]), canOpen: open([2, 3]) }), 3);
});

test('acquireAccount: có leaseAccount thì thuê tài khoản rảnh; hết tài khoản rảnh thì báo rõ; không có thì giữ cách cũ', async () => {
  const lease = { index: 2, release() {} };
  assert.equal(await acquireAccount({ leaseAccount: o => (o === 'pair' ? lease : null), owner: 'pair' }), lease);
  await assert.rejects(acquireAccount({ leaseAccount: () => null, owner: 'pair' }), e => e.message === NONE_FREE && /Mọi tài khoản Muse đang mở đều bận/.test(e.message));
  let allowed = 0;
  await assert.rejects(acquireAccount({ leaseAccount: () => lease, ensureAllowed: async () => { allowed++; throw Error('Cần gói Năm'); }, owner: 'pair' }), /Cần gói Năm/);
  assert.equal(allowed, 1);
  // Không có leaseAccount (cách cũ): bận thì từ chối, rảnh thì dùng tài khoản 1 (null).
  await assert.rejects(acquireAccount({ isBusy: () => true, busyMessage: 'Dừng hàng đợi …' }), /Dừng hàng đợi/);
  assert.equal(await acquireAccount({ isBusy: () => false }), null);
});

const leaseOf = index => { const log = { released: 0, owners: [] }; return { log, lease: owner => { log.owners.push(owner); return { index, release() { log.released++; } }; } }; };

test('viết kịch bản So sánh song song: tài khoản 1 bận thì viết bằng tài khoản được thuê, rồi trả tài khoản', async () => {
  const { log, lease } = leaseOf(1), seen = [];
  let w;
  w = createPairWriter({ ask: pairFake({ total: 7 }).ask, delay: async () => {}, leaseAccount: lease, isBusy: () => true, notify: () => seen.push(w.status().progress) });
  const result = await w.write({ options: { topic: 'Spending vs saving', minutes: 1 } });
  assert.equal(result.script.beats.length, 7);
  assert.deepEqual(log.owners, ['pair']);
  assert.equal(log.released, 1, 'trả tài khoản sau khi viết xong');
  assert.ok(seen.includes('Đang mở Muse (tài khoản 2)…'), 'báo đang dùng tài khoản 2');
  // Hết tài khoản rảnh: báo rõ, không gọi Muse; lần sau vẫn viết được.
  let asked = 0;
  const none = createPairWriter({ ask: async () => { asked++; return ''; }, delay: async () => {}, leaseAccount: () => null, isBusy: () => true });
  await assert.rejects(none.write({ options: { topic: 'x', minutes: 1 } }), /Mọi tài khoản Muse đang mở đều bận/);
  assert.equal(asked, 0);
  assert.equal(none.status().busy, false);
  // Viết lỗi giữa chừng vẫn trả tài khoản.
  const bad = leaseOf(2);
  const failing = createPairWriter({ ask: async () => { throw Error('Muse hỏng'); }, delay: async () => {}, leaseAccount: bad.lease });
  await assert.rejects(failing.write({ options: { topic: 'x', minutes: 1 } }), /Muse hỏng/);
  assert.equal(bad.log.released, 1, 'lỗi giữa chừng vẫn trả tài khoản');
});

test('viết kịch bản Động vật hoang dã: cũng dùng tài khoản được thuê và trả lại', async () => {
  const { log, lease } = leaseOf(3), seen = [];
  let w;
  w = createWildWriter({ ask: wildFake({}).ask, delay: async () => {}, leaseAccount: lease, isBusy: () => true, notify: () => seen.push(w.status().progress) });
  const result = await w.write({ options: { topic: 'Cầy mangut', minutes: 5 } });
  assert.ok(result.scenes.length > 0);
  assert.deepEqual(log.owners, ['wild']);
  assert.equal(log.released, 1);
  assert.ok(seen.includes('Đang mở Muse (tài khoản 4)…'));
});

test('main.cjs: mọi trình viết / phân tích đều nhận leaseAccount, tài khoản 1 không còn bị coi là bận vì việc ở tài khoản khác', () => {
  const main = fs.readFileSync(path.join(__dirname, '../src/main.cjs'), 'utf8');
  for (const name of ['createStoryAnalyzer', 'createWildWriter', 'createPairWriter', 'createMapWriter']) {
    assert.match(main, new RegExp(name + '\\(\\{[^}]*leaseAccount:owner=>leaseMuseAccount\\(owner\\)'), name);
  }
  assert.doesNotMatch(main, /accountOneBusy: Boolean\(storyAnalyzer/, 'không đánh dấu tài khoản 1 bận theo trình viết nữa');
  assert.match(main, /canOpen: hasSavedLogin/);
  for (const f of ['pair-write', 'wild-write', 'story-analyze']) {
    const src = fs.readFileSync(path.join(__dirname, `../src/${f}.cjs`), 'utf8');
    assert.doesNotMatch(src, /openMuse\(0\)/, f + ' không còn mở cứng tài khoản 1');
    assert.match(src, /lease\.release\(\)/, f + ' trả tài khoản');
  }
});
