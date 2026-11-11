// Giao diện tab «Dọn nhà · Sinh tồn». Dùng chung hàng đợi, đăng nhập và tài khoản với các tab khác.
// Phụ thuộc renderer.js (call, toast, state, localFileUrl) và restore-plan.js. Chữ động chọn theo ngôn ngữ giao diện bằng tr(vi, en).
(function () {
  'use strict';
  const $ = id => document.getElementById(id);
  const P = window.restorePlan;
  const KEY = 'museStudio.restore';
  let saved = {};
  try { saved = JSON.parse(localStorage.getItem(KEY) || '{}') || {}; } catch { saved = {}; }
  const persist = () => { try { localStorage.setItem(KEY, JSON.stringify(saved)); } catch { /* không lưu được thì thôi */ } };
  const lang = () => (window.studioI18n && window.studioI18n.language === 'vi' ? 'vi' : 'en');
  const tr = (vi, en) => (lang() === 'vi' ? vi : en);
  const base = file => String(file || '').split(/[\\/]/).pop();

  let theme = P.themeOf(saved.theme).id, photo = '', music = '', shownLang = '', runsKey = '', secsForced = false, secsBefore = '8';

  // ---- ô chọn tĩnh
  function fillSelects() {
    const min = $('restoreMinutes'), secs = $('restoreSecs');
    const minNow = min.value || String(saved.minutes || 2), secNow = secs.value || String(saved.seconds || 8);
    min.replaceChildren(...P.MINUTES.map(m => { const o = document.createElement('option'); o.value = String(m); o.textContent = lang() === 'vi' ? `${m} phút` : `${m} min`; return o; }));
    secs.replaceChildren(...P.SECONDS.map(n => { const o = document.createElement('option'); o.value = String(n); o.textContent = lang() === 'vi' ? `${n} giây` : `${n} s`; return o; }));
    const par = $('restoreParallel'), parNow = par.value || String(saved.parallel || 'auto');
    par.replaceChildren(...['auto', 1, 2, 3, 4, 5, 6, 8, 10].map(v => {
      const o = document.createElement('option'); o.value = String(v);
      o.textContent = v === 'auto' ? tr('Tự động: dùng hết các tài khoản đã cài', 'Automatic: use all the accounts you set up')
        : v === 1 ? tr('1 chuỗi (đồng nhất nhất, chậm)', '1 chain (most consistent, slow)') : tr(`${v} đoạn cùng lúc`, `${v} parts at once`);
      return o;
    }));
    par.value = [...par.options].some(o => o.value === parNow) ? parNow : 'auto';
    min.value = P.MINUTES.includes(Number(minNow)) ? minNow : '2';
    secs.value = P.SECONDS.includes(Number(secNow)) ? secNow : '8';
  }

  // ---- cấu hình đang chọn
  function config() {
    return P.options({
      theme, name: $('restoreName').value, parallel: $('restoreParallel').value, minutes: $('restoreMinutes').value, seconds: $('restoreSecs').value, aspect: $('restoreAspect').value, camera: $('restoreCamera').value, place: $('restorePlace').value,
      person: $('restorePerson').checked, personDesc: $('restorePersonDesc').value, light: $('restoreLight').value, anchor: $('restoreAnchor').checked, faceless: $('restoreFaceless').checked,
      customSteps: $('restoreCustom').value, lang: lang()
    });
  }
  function remember() {
    Object.assign(saved, {
      theme, parallel: $('restoreParallel').value, minutes: Number($('restoreMinutes').value), seconds: Number($('restoreSecs').value), aspect: $('restoreAspect').value, camera: $('restoreCamera').value, place: $('restorePlace').value,
      person: $('restorePerson').checked, personDesc: $('restorePersonDesc').value, light: $('restoreLight').value, anchor: $('restoreAnchor').checked, faceless: $('restoreFaceless').checked,
      custom: $('restoreCustom').value, auto: $('restoreAuto').checked
    });
    persist();
  }

  // ---- chủ đề
  function renderThemes() {
    $('restoreTheme').replaceChildren(...P.THEMES.map(t => {
      const b = document.createElement('button');
      b.type = 'button'; b.className = 'chip'; b.dataset.theme = t.id; b.textContent = P.text(t, lang()).label;
      b.setAttribute('aria-pressed', String(t.id === theme));
      b.onclick = () => { theme = t.id; remember(); renderThemes(); syncTheme(); renderCount(); };
      return b;
    }));
  }
  function syncTheme() {
    const t = P.themeOf(theme), text = P.text(t, lang());
    $('restoreHint').textContent = text.hint;
    $('restorePlace').placeholder = text.placeholder;
    $('restorePlaceLabel').textContent = tr('Mô tả nơi chốn (không bắt buộc nếu đã có ảnh)', 'Describe the place (optional if you chose a photo)');
    const person = $('restorePerson');
    if (t.person) { person.checked = true; person.disabled = true; } else { person.disabled = false; person.checked = saved.person !== false; }
    $('restorePersonDesc').placeholder = t.personDefault;
    $('restorePersonDescLabel').hidden = !person.checked;
    $('restoreFacelessLine').hidden = !person.checked;
    const camera = $('restoreCamera');
    if (t.forceVaried) { camera.value = 'varied'; camera.disabled = true; } else { camera.disabled = false; camera.value = saved.camera === 'fixed' ? 'fixed' : 'varied'; }
    $('restoreCustomLabel').hidden = t.id !== 'custom';
  }
  // Số tài khoản chạy song song thật sự (chế độ «Lần lượt» chỉ dùng 1).
  const accountsNow = () => { const st = (typeof state !== 'undefined' && state && state.settings) || {}; return st.dispatchMode === 'parallel' ? Math.max(1, Number(st.accountCount) || 1) : 1; };
  function renderCount() {
    const secs = $('restoreSecs'), long = Number($('restoreMinutes').value) >= P.LONG_MINUTES;
    // Từ 20 phút ép 10 giây; đổi về số phút ngắn hơn thì trả lại số giây người dùng đã chọn.
    if (long) { if (!secsForced) { secsBefore = secs.value; secsForced = true; } secs.value = '10'; }
    else if (secsForced) { secs.value = secsBefore; secsForced = false; }
    secs.disabled = long;
    const c = config(), n = P.clipCount(c), total = n * c.seconds, mins = (total / 60).toFixed(total % 60 ? 1 : 0);
    let text = tr(`${n} cảnh × ${c.seconds} giây ≈ ${mins} phút. Các cảnh chạy lần lượt vì mỗi cảnh nối tiếp cảnh trước; thời gian tạo phụ thuộc Muse.`,
      `${n} scenes × ${c.seconds} s ≈ ${mins} min. Scenes run one after another because each one continues from the previous; the time depends on Muse.`);
    if (long) text += ' ' + tr('Từ 20 phút tool dùng cảnh 10 giây. Video rất dài có thể chạy nhiều giờ; tool tự thử lại cảnh lỗi nhưng hình có thể lệch dần, nên thử 1–3 phút trước.', 'From 20 minutes the tool uses 10-second scenes. A very long video can run for hours; the tool retries failed scenes by itself, but the picture can drift, so try 1–3 minutes first.');
    if (Number($('restoreMinutes').value) >= P.VERY_LONG_MINUTES) text += ' ' + tr(`⚠ ${n} cảnh nối tiếp là rất nhiều: có thể chạy cả ngày hoặc nhiều ngày, tốn khoảng ${Math.ceil(n * 12 / 1024 * 10) / 10} GB ổ đĩa (tạm tính 12 MB mỗi cảnh) và nhiều lượt Muse. Hình càng về sau càng dễ lệch; nên thử 1–3 phút trước, hoặc làm nhiều video ngắn rồi ghép.`, `⚠ ${n} chained scenes is a lot: it can run for a day or several days, uses about ${Math.ceil(n * 12 / 1024 * 10) / 10} GB of disk (roughly 12 MB per scene) and many Muse credits. The picture drifts more and more; try 1–3 minutes first, or make several short videos and join them.`);
    else if (n > 30) text += ' ' + tr('Video dài: càng nhiều cảnh nối tiếp thì hình càng dễ lệch dần, nên thử 1–3 phút trước.', 'Long video: the more chained scenes, the more the picture can drift; try 1–3 minutes first.');
    const segs = P.segmentsOf(c, accountsNow()).length;
    if (segs > 1) text += ' ' + tr(`Chạy song song ${segs} đoạn trên ${segs} tài khoản (mỗi đoạn khoảng ${Math.ceil(n / segs)} cảnh nối tiếp), nhanh hơn khoảng ${segs} lần. Chỗ nối giữa các đoạn dựng từ ảnh mốc Muse tạo nên nhà và người ở chỗ nối có thể hơi khác một chút (tool làm mờ nhẹ chỗ nối). Chọn «1 chuỗi» nếu cần đồng nhất tuyệt đối.`,
      `Runs ${segs} parts in parallel on ${segs} accounts (about ${Math.ceil(n / segs)} chained scenes each), roughly ${segs}× faster. The joins between parts are built from key images made by Muse, so the house and the person can look slightly different at a join (the tool fades the join). Choose “1 chain” if you need perfect consistency.`);
    else if (accountsNow() > 1 && n >= P.MIN_SEGMENT * 2) text += ' ' + tr('Đang chạy 1 chuỗi nên chỉ dùng 1 tài khoản mỗi lần: rất chậm với video dài.', 'Running a single chain, so only one account is used at a time: very slow for long videos.');
    const names = P.screenConfig(c);
    if (names.length) text += ' ' + (P.problems(c, { hasPhoto: Boolean(photo) }).pop() || '');
    $('restoreCount').textContent = text;
    $('restorePersonDescLabel').hidden = !$('restorePerson').checked;
    $('restoreFacelessLine').hidden = !$('restorePerson').checked;
  }

  // ---- ảnh gốc, nhạc nền
  function renderPhoto() {
    $('restorePhotoName').textContent = photo ? base(photo) : tr('Chưa chọn. Muse sẽ tạo ảnh gốc từ mô tả bên dưới.', 'None chosen. Muse will create the first image from the description below.');
    $('restorePhotoClear').hidden = !photo;
    const img = $('restorePhotoPreview');
    if (photo && typeof localFileUrl === 'function') { img.src = localFileUrl(photo); img.hidden = false; } else { img.removeAttribute('src'); img.hidden = true; }
    $('restorePhoto').textContent = photo ? tr('Đổi ảnh gốc', 'Change photo') : tr('Chọn ảnh gốc', 'Choose photo');
  }
  function renderMusic() {
    $('restoreMusicName').textContent = music ? base(music) : tr('Không nhạc nền (video im lặng).', 'No background music (silent video).');
    $('restoreMusicClear').hidden = !music;
    $('restoreMusic').textContent = music ? tr('Đổi nhạc nền', 'Change music') : tr('Chọn nhạc nền', 'Choose music');
  }

  // ---- tạo cảnh
  async function create() {
    const lic = state && state.license;
    if (!lic || !lic.longTerm) { toast(tr('Tab này chỉ dùng được với gói Năm hoặc Vĩnh viễn.', 'This tab is available with the Year or Lifetime plan only.')); return; }
    const c = config();
    const problems = P.problems(c, { hasPhoto: Boolean(photo) });
    if (problems.length) { toast(problems[0]); return; }
    remember();
    const accounts = accountsNow();
    const jobs = P.buildJobs(c, { storyId: 'x', photo, accounts });
    $('restoreCreate').disabled = true;
    try {
      const result = await call('restoreCreate', { jobs, idBase: P.storyIdBase(c), meta: { name: P.videoTitle(c), aspect: c.aspect, music, seams: P.seamsOf(c, accounts), auto: $('restoreAuto').checked, theme } });
      if (result) {
        toast(result.startError
          ? tr('Đã thêm các cảnh nhưng chưa chạy được: ', 'Scenes added but could not start: ') + result.startError
          : $('restoreAuto').checked ? tr(`Đã thêm ${jobs.filter(j => j.phase === 'clip').length} cảnh và bắt đầu chạy. Video sẽ tự dựng khi xong.`, `Added ${jobs.filter(j => j.phase === 'clip').length} scenes and started. The video builds itself when done.`)
            : tr('Đã thêm các cảnh. Bấm «Chạy hàng đợi» để bắt đầu.', 'Scenes added. Click “Run queue” to start.'));
        $('restoreName').value = '';
        const fresh = await call('state'); if (fresh) render(fresh);
      }
    } finally { $('restoreCreate').disabled = false; }
  }

  // ---- danh sách video đang làm / đã xong
  function runsOf(s) {
    const groups = new Map();
    for (const j of s.jobs || []) if (j.kind === 'restore') { if (!groups.has(j.storyId)) groups.set(j.storyId, []); groups.get(j.storyId).push(j); }
    return [...groups.entries()].map(([id, list]) => ({ id, list })).reverse();
  }
  function renderRuns(s) {
    const info = s.restore || {}, stories = info.stories || {};
    const runs = runsOf(s);
    const key = JSON.stringify([lang(), Boolean(s.active), Boolean(s.starting), info.busy, info.progress, info.error, info.storyId,
      runs.map(r => [r.id, r.list.map(j => j.status + (j.stage || '')), (stories[r.id] || {}).output || ''])]);
    if (key === runsKey) return;
    runsKey = key;
    $('restoreRuns').replaceChildren(...runs.map(({ id, list }) => {
      const meta = stories[id] || {}, clips = list.filter(j => j.phase === 'clip'), done = list.filter(j => j.status === 'completed').length;
      const failed = list.some(j => ['failed', 'interrupted'].includes(j.status)), running = list.some(j => j.status === 'running');
      const allClips = clips.length > 0 && clips.every(j => j.status === 'completed');
      const building = info.busy && info.storyId === id, builtErr = info.error && info.storyId === id;
      const box = document.createElement('div'); box.className = 'restoreRun' + (meta.output ? ' done' : builtErr || failed ? ' error' : '');
      const top = document.createElement('div'); top.className = 'restoreRunTop';
      const title = document.createElement('strong'); title.textContent = meta.name || id;
      const count = document.createElement('span'); count.textContent = tr(`${clips.filter(j => j.status === 'completed').length}/${clips.length} cảnh`, `${clips.filter(j => j.status === 'completed').length}/${clips.length} scenes`);
      top.append(title, count);
      const bar = document.createElement('div'); bar.className = 'autoBar'; bar.setAttribute('role', 'progressbar');
      const fill = document.createElement('i'); fill.style.width = Math.round(100 * done / Math.max(1, list.length)) + '%'; bar.append(fill);
      const text = document.createElement('p'); text.className = 'restoreRunText';
      if (building) text.textContent = info.progress || tr('Đang dựng video…', 'Building the video…');
      else if (builtErr) { text.textContent = tr('Dựng video lỗi: ', 'Video build failed: ') + info.error; text.classList.add('warn'); }
      else if (meta.output) text.textContent = tr('Video hoàn chỉnh: ', 'Finished video: ') + base(meta.output);
      else if (failed) { text.textContent = tr('Có cảnh dở hoặc lỗi. Sửa rồi bấm «Tiếp tục hàng đợi»: các cảnh sau chỉ chạy khi cảnh trước đã xong.', 'A scene is unfinished or failed. Fix it and click “Continue queue”: later scenes only run after the earlier ones are done.'); text.classList.add('warn'); }
      else if (running || s.active || s.starting) text.textContent = tr('Đang tạo các cảnh nối tiếp nhau trên Muse…', 'Creating the connected scenes on Muse…');
      else if (allClips) text.textContent = tr('Đã đủ cảnh. Bấm «Dựng video» để dựng.', 'All scenes are ready. Click “Build video”.');
      else text.textContent = tr('Chờ chạy. Bấm «Chạy hàng đợi» ở dưới.', 'Waiting. Click “Run queue” below.');
      const actions = document.createElement('div'); actions.className = 'restoreRunActions';
      const busy = Boolean(s.active || s.starting), unfinished = list.some(j => ['pending', 'interrupted', 'failed'].includes(j.status));
      if (busy) {
        const stop = document.createElement('button'); stop.type = 'button'; stop.className = 'secondary';
        stop.textContent = tr('Dừng', 'Stop'); stop.disabled = Boolean(s.stopping);
        stop.onclick = async () => { const r = await call('stop'); if (r) { runsKey = ''; render(r); } };
        actions.append(stop);
      } else if (unfinished && !meta.output) {
        const go = document.createElement('button'); go.type = 'button'; go.className = 'primary';
        const started = list.some(j => j.startedAt || ['interrupted', 'failed', 'completed'].includes(j.status));
        go.textContent = started ? tr('Tạo tiếp', 'Continue') : tr('Chạy', 'Run');
        go.disabled = Boolean(s.stopping || s.merging || s.packaging || info.busy);
        go.onclick = async () => { const r = await call('start', { kind: 'restore' }); if (r) { runsKey = ''; render(r); } };
        actions.append(go);
      }
      if (allClips) {
        const build = document.createElement('button'); build.type = 'button'; build.className = 'secondary';
        build.textContent = meta.output ? tr('Dựng lại video', 'Rebuild video') : tr('Dựng video', 'Build video');
        build.disabled = Boolean(s.active || s.starting || info.busy);
        build.onclick = async () => { const r = await call('restoreBuild', { storyId: id, music }); if (r) { runsKey = ''; render(r); } };
        actions.append(build);
      }
      if (meta.output) {
        const saveBtn = document.createElement('button'); saveBtn.type = 'button'; saveBtn.className = 'primary';
        saveBtn.textContent = tr('Lưu video…', 'Save video…');
        saveBtn.onclick = async () => { const r = await call('restoreSave', { storyId: id }); if (r && r.file) toast(tr('Đã lưu video: ', 'Video saved: ') + r.file); };
        actions.append(saveBtn);
        const open = document.createElement('button'); open.type = 'button'; open.className = 'secondary';
        open.textContent = tr('Mở video', 'Show video'); open.onclick = () => call('restoreReveal', { storyId: id });
        actions.append(open);
      }
      const folder = document.createElement('button'); folder.type = 'button'; folder.className = 'secondary';
      folder.textContent = tr('Mở thư mục', 'Open folder'); folder.onclick = () => call('openOutput', { kind: 'restore' });
      actions.append(folder);
      box.append(top, bar, text, actions);
      return box;
    }));
  }

  // ---- khóa theo gói
  function renderLock(s) {
    const ok = Boolean(s.license && s.license.longTerm);
    $('restoreLock').hidden = ok; $('restoreBody').hidden = !ok;
    $('restoreLockText').textContent = tr('Bản dùng thử và gói 30 ngày không dùng được tab này. Nâng cấp lên gói Năm hoặc Vĩnh viễn rồi nhập key mới.', 'The trial and the 30-day plan cannot use this tab. Upgrade to the Year or Lifetime plan and enter the new key.');
  }

  function render(s) {
    if (!s) return;
    if (shownLang !== lang()) { shownLang = lang(); fillSelects(); renderThemes(); syncTheme(); renderPhoto(); renderMusic(); runsKey = ''; }
    renderLock(s);
    renderCount();
    renderRuns(s);
  }

  // ---- khởi tạo
  fillSelects();
  $('restoreAspect').value = ['16:9', '9:16'].includes(saved.aspect) ? saved.aspect : '16:9';
  $('restoreCamera').value = saved.camera === 'fixed' ? 'fixed' : 'varied';
  $('restorePlace').value = saved.place || '';
  $('restorePerson').checked = saved.person !== false;
  $('restorePersonDesc').value = saved.personDesc || '';
  $('restoreLight').value = saved.light || '';
  $('restoreAnchor').checked = Boolean(saved.anchor);
  $('restoreFaceless').checked = Boolean(saved.faceless);
  $('restoreCustom').value = saved.custom || '';
  $('restoreAuto').checked = saved.auto !== false;
  shownLang = lang();
  renderThemes(); syncTheme(); renderPhoto(); renderMusic(); renderCount();

  for (const id of ['restoreMinutes', 'restoreParallel', 'restoreSecs', 'restoreAspect', 'restoreCamera', 'restorePerson', 'restoreFaceless', 'restoreAnchor', 'restoreAuto']) $(id).onchange = () => { remember(); renderCount(); };
  for (const id of ['restorePlace', 'restorePersonDesc', 'restoreLight', 'restoreCustom']) $(id).oninput = () => { remember(); renderCount(); };
  $('restorePhoto').onclick = async () => { const list = await call('images', { multiple: false }); if (list && list[0]) { photo = list[0]; renderPhoto(); } };
  $('restorePhotoClear').onclick = () => { photo = ''; renderPhoto(); };
  $('restoreMusic').onclick = async () => { const file = await call('chooseMusic'); if (file) { music = file; renderMusic(); } };
  $('restoreMusicClear').onclick = () => { music = ''; renderMusic(); };
  $('restoreKey').onclick = () => $('licenseDialog').showModal();
  $('restoreCreate').onclick = create;

  window.restoreUi = { render };
})();
