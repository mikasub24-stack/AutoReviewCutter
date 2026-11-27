// Mục «Tác vụ»: mọi video đã tạo ở các tab (So sánh song song, Động vật hoang dã, Dọn nhà · Sinh tồn, Kể chuyện, Bản đồ lịch sử)
// và hai hàng đợi Tạo video / Tạo ảnh, xong hay còn dở, để mở lại app là thấy ngay và làm tiếp. Chỉ đọc trạng thái đã lưu, không vẽ thẻ cảnh nên nhẹ.
// Phụ thuộc renderer.js (call, toast, setMode, askDelete, localFileUrl). Chữ động chọn theo ngôn ngữ giao diện bằng tr(vi, en).
(function () {
  'use strict';
  const $ = id => document.getElementById(id);
  const lang = () => (window.studioI18n && window.studioI18n.language === 'vi' ? 'vi' : 'en');
  const tr = (vi, en) => (lang() === 'vi' ? vi : en);
  const node = (tag, cls, text) => { const n = document.createElement(tag); if (cls) n.className = cls; if (text != null) n.textContent = text; return n; };
  const button = (text, cls, onclick, disabled, title) => { const b = node('button', cls, text); b.type = 'button'; b.disabled = Boolean(disabled); if (title) b.title = title; if (onclick) b.onclick = onclick; return b; };
  const base = file => String(file || '').split(/[\\/]/).pop();
  const BUSY = ['pending', 'running', 'interrupted', 'failed'];

  // Mỗi nguồn: loại việc trong hàng đợi, tab mở ra, nơi lưu thông tin từng video và các lệnh đã có sẵn ở tab đó.
  const SOURCES = [
    { kind: 'pair', tab: 'pair', label: ['So sánh song song', 'Side-by-side'], metas: s => (s.pair && s.pair.stories) || {}, idKey: 'storyId', reveal: 'pairReveal', save: 'pairSave', remove: 'pairRemove', folder: 'SoSanh', busy: s => s.pair && s.pair.busy ? s.pair.storyId : '' },
    { kind: 'wild', tab: 'wild', label: ['Động vật hoang dã', 'Wildlife'], metas: s => (s.wild && s.wild.stories) || {}, idKey: 'storyId', reveal: 'wildReveal', save: 'wildSave', remove: 'wildRemove', folder: 'DongVat', busy: s => s.wild && s.wild.busy ? s.wild.storyId : '' },
    { kind: 'restore', tab: 'restore', label: ['Dọn nhà · Sinh tồn', 'House cleanup · Survival'], metas: s => (s.restore && s.restore.stories) || {}, idKey: 'storyId', reveal: 'restoreReveal', save: 'restoreSave', remove: 'restoreRemove', folder: 'DonNha', busy: s => s.restore && s.restore.busy ? s.restore.storyId : '' },
    { kind: 'story', tab: 'story', label: ['Kể chuyện', 'Storytelling'], metas: s => (s.settings && s.settings.storyRuns) || {}, idKey: 'storyId', reveal: 'storyReveal', remove: 'storyRemove', folder: 'KeChuyen', busy: s => s.story && s.story.busy ? s.story.storyId : '' }
  ];
  let filter = 'all', lastState = null, listKey = '', videoDialog = null;

  const time = ms => { const d = new Date(ms); return Number.isFinite(ms) && ms > 0 ? d.toLocaleString(lang() === 'vi' ? 'vi-VN' : 'en-US', { hour12: false }) : ''; };
  const titleOf = (meta, id) => String((meta && (meta.name || meta.title || meta.topic)) || id || '').slice(0, 140);

  // Trạng thái của một video: đếm clip (hoặc mọi cảnh nếu chưa có clip), có video dựng xong chưa, còn cảnh nào dở.
  function statusOf(s, jobs, meta, extra) {
    const clips = jobs.filter(j => j.phase === 'clip'), pool = clips.length ? clips : jobs;
    const done = pool.filter(j => j.status === 'completed').length, total = pool.length;
    const running = jobs.some(j => j.status === 'running'), open = jobs.some(j => BUSY.includes(j.status)), failed = jobs.some(j => ['failed', 'interrupted'].includes(j.status));
    const unit = clips.length ? tr('clip', 'clips') : tr('cảnh', 'scenes');
    const counts = total ? `${done}/${total} ${unit}` : '';
    const queueOn = Boolean(s.active || s.starting);
    const output = extra.output || '';
    let kind, label;
    if (output) { kind = 'done'; label = tr('Hoàn thành · video đã dựng', 'Finished · video built'); }
    else if (meta && meta.status === 'writing') { kind = 'open'; label = tr('Dở · kịch bản chưa viết xong', 'Unfinished · script not written yet'); }
    else if (running || (queueOn && open)) { kind = 'run'; label = tr('Đang chạy', 'Running'); }
    else if (failed) { kind = 'open'; label = tr('Dở · có cảnh lỗi hoặc bị dừng', 'Unfinished · some scenes failed or stopped'); }
    else if (total && done === total) { kind = 'ready'; label = extra.noBuild ? tr('Đã xong tất cả', 'All done') : tr('Đủ clip · chưa dựng video', 'All clips done · video not built yet'); }
    else if (total) { kind = 'open'; label = tr('Dở · còn cảnh chưa chạy', 'Unfinished · scenes still to run'); }
    else { kind = 'open'; label = tr('Chưa có cảnh nào', 'No scenes yet'); }
    return { kind, label, counts, done, total, running, open, output, pct: output ? 100 : total ? Math.round(100 * done / total) : 0 };
  }

  function collect(s) {
    const jobs = Array.isArray(s.jobs) ? s.jobs : [], rows = [];
    for (const src of SOURCES) {
      const metas = src.metas(s) || {}, byId = new Map();
      for (const j of jobs) if (j && j.kind === src.kind && j.storyId) { if (!byId.has(j.storyId)) byId.set(j.storyId, []); byId.get(j.storyId).push(j); }
      const ids = new Set([...Object.keys(metas), ...byId.keys()]);
      for (const id of ids) {
        const own = byId.get(id) || [], meta = metas[id] || {};
        const stamps = own.map(j => Number(j.createdAt)).filter(n => n > 0), at = Number(meta.createdAt || meta.builtAt) || (stamps.length ? Math.min(...stamps) : 0);
        rows.push({ src, id, meta, own, at, title: titleOf(meta, id), st: statusOf(s, own, meta, { output: meta.output || '' }) });
      }
    }
    // Hàng đợi Tạo video / Tạo ảnh: không chia theo video nên gom thành một dòng mỗi loại.
    for (const [kind, vi, en] of [['video', 'Hàng đợi tạo video', 'Video queue'], ['image', 'Hàng đợi tạo ảnh', 'Image queue']]) {
      const own = jobs.filter(j => j && j.kind === kind);
      if (!own.length) continue;
      const src = { kind, tab: kind, label: [vi, en], metas: () => ({}), idKey: '', folder: '', noBuild: true, busy: () => '' };
      rows.push({ src, id: kind, meta: {}, own, at: own.reduce((m, j) => Math.max(m, j.createdAt || 0), 0), title: tr(vi, en), st: statusOf(s, own, {}, { output: '', noBuild: true }) });
    }
    // Bản đồ lịch sử: mỗi video một bản ghi riêng (không dùng hàng đợi cảnh).
    const runs = (s.maphist && s.maphist.runs) || {};
    const mapSrc = { kind: 'maphist', tab: 'maphist', label: ['Bản đồ lịch sử', 'History maps'], idKey: 'runId', reveal: 'mapReveal', save: 'mapSave', remove: 'mapRemove', folder: 'BanDo', busy: st => st.maphist && st.maphist.busy ? st.maphist.runId : '' };
    for (const [id, meta] of Object.entries(runs)) {
      const m = meta || {}, finished = m.status === 'done' && m.output;
      const st = { kind: finished ? 'done' : 'open', label: finished ? tr('Hoàn thành · video đã dựng', 'Finished · video built') : (m.error ? tr('Dở · ', 'Unfinished · ') + String(m.error).slice(0, 90) : tr('Dở · chưa dựng xong video', 'Unfinished · video not built yet')), counts: '', done: finished ? 1 : 0, total: 1, running: false, open: !finished, output: finished ? m.output : '', pct: finished ? 100 : 0 };
      rows.push({ src: mapSrc, id, meta: m, own: [], at: Number(m.createdAt || m.builtAt) || 0, title: titleOf(m, id), st });
    }
    // Dở lên đầu, rồi mới nhất lên trước.
    const rank = r => (r.st.kind === 'run' ? 0 : r.st.kind === 'open' ? 1 : r.st.kind === 'ready' ? 2 : 3);
    return rows.sort((a, b) => rank(a) - rank(b) || (b.at - a.at) || a.title.localeCompare(b.title));
  }

  function viewVideo(file, title) {
    if (videoDialog) { try { videoDialog.close(); } catch { /* đã đóng */ } }
    const dlg = node('dialog', 'taskVideoDialog'), head = node('div', 'dialogHeader'), video = document.createElement('video');
    const close = button('✕', 'secondary', () => dlg.close());
    head.append(node('h2', '', title || tr('Xem video', 'Watch video')), close);
    video.controls = true; video.autoplay = true; video.src = window.localFileUrl ? window.localFileUrl(file) : file;
    const note = node('p', 'warn', tr('Không mở được video này. Dùng «Mở thư mục» để kiểm tra file.', 'Cannot open this video. Use “Open folder” to check the file.')); note.hidden = true;
    video.onerror = () => { note.hidden = false; };
    dlg.append(head, video, note);
    dlg.onclose = () => { video.pause(); video.removeAttribute('src'); video.load(); dlg.remove(); if (videoDialog === dlg) videoDialog = null; };
    document.body.append(dlg); videoDialog = dlg; dlg.showModal();
  }

  function rowActions(s, r) {
    const { src, id, meta, st } = r, actions = node('div', 'taskActions');
    const payload = extra => ({ [src.idKey || 'storyId']: id, ...extra });
    const queueOn = Boolean(s.active || s.starting), working = src.busy(s) === id || (st.kind === 'run');
    if (st.kind === 'open' || st.kind === 'ready' || st.kind === 'run') {
      if (src.kind === 'pair' && meta.status === 'writing' && !(s.pair && s.pair.busy)) actions.append(button(tr('Viết tiếp', 'Continue writing'), 'primary', async () => { const res = await call('pairMake', { resumeId: id }); if (res) { setMode('pair'); } }, queueOn));
      else if (r.own.some(j => BUSY.includes(j.status)) && !st.output) {
        const started = r.own.some(j => j.startedAt || ['interrupted', 'failed', 'completed'].includes(j.status));
        actions.append(button(started ? tr('Tạo tiếp', 'Continue making') : tr('Chạy', 'Run'), 'primary', async () => { const res = await call('start', { kind: src.kind }); if (res) window.tasksUi.render(res); }, queueOn, queueOn ? tr('Hàng đợi đang chạy', 'The queue is running') : ''));
      }
    }
    if (st.output) {
      actions.append(button(tr('Xem video', 'Watch video'), 'secondary', () => viewVideo(st.output, r.title)));
      if (src.save) actions.append(button(tr('Lưu video…', 'Save video…'), 'secondary', async () => { const res = await call(src.save, payload()); if (res && res.file) toast(tr('Đã lưu video: ', 'Video saved: ') + res.file); }));
    }
    actions.append(button(tr('Mở tab', 'Open tab'), 'secondary', () => setMode(src.tab), false, tr('Sang tab ', 'Go to the ') + tr(src.label[0], src.label[1])));
    actions.append(button(tr('Mở thư mục', 'Open folder'), 'secondary', async () => {
      const ok = src.reveal ? await call(src.reveal, payload()) : await call('openOutput', { kind: src.kind });
      if (ok === false) toast(tr('Chưa có file hoặc thư mục để mở.', 'There is no file or folder to open yet.'));
    }));
    if (src.remove) actions.append(button(tr('Xóa', 'Delete'), 'secondary taskDelete', async () => {
      const pick = await askDelete({
        title: tr('Xóa video này?', 'Delete this video?'),
        text: tr(`«${r.title}» sẽ bị bỏ khỏi danh sách, kể cả các cảnh và thumbnail của nó.`, `“${r.title}” will be removed from the list, including its scenes and thumbnail.`),
        label: tr(`Xóa luôn file đã tự lưu về máy (thư mục ${src.folder}/${id}: clip, ảnh, video đã dựng)`, `Also delete the files saved on this computer (folder ${src.folder}/${id}: clips, images, built video)`),
        hint: tr('File được chuyển vào Thùng rác nên khôi phục được. Bản bạn đã bấm «Lưu video…» ra nơi khác không bị đụng tới.', 'Files go to the Recycle Bin, so they can be restored. Copies you saved elsewhere with “Save video…” are not touched.')
      });
      if (!pick) return;
      const res = await call(src.remove, payload({ deleteFiles: pick.files }));
      if (res) { listKey = ''; window.tasksUi.render(res); toast(pick.files ? tr('Đã xóa video và chuyển file đã lưu vào Thùng rác.', 'Video deleted; its saved files were moved to the Recycle Bin.') : tr('Đã xóa video khỏi danh sách (file vẫn còn trong thư mục).', 'Video removed from the list (its files are still in the folder).')); }
    }, working, working ? tr('Dừng hàng đợi / chờ xong rồi mới xóa được', 'Stop the queue or wait for it to finish before deleting') : ''));
    return actions;
  }

  function rowNode(s, r) {
    const { st } = r, box = node('div', 'taskRow ' + st.kind);
    const top = node('div', 'taskTop'), name = node('strong', 'taskTitle', r.title), tab = node('span', 'taskTab', tr(r.src.label[0], r.src.label[1]));
    top.append(name, tab);
    const meta = [time(r.at), st.label, st.counts].filter(Boolean).join(' · ');
    const bar = node('div', 'autoBar taskBar'), fill = document.createElement('i'); fill.style.width = st.pct + '%'; bar.append(fill);
    box.append(top, node('p', 'taskMeta', meta), bar);
    if (st.output) box.append(node('p', 'taskFile', base(st.output)));
    box.append(rowActions(s, r));
    return box;
  }

  function render(s) {
    if (!s) return;
    lastState = s;
    let rows;
    try { rows = collect(s); } catch (e) { console.error(e); rows = []; }
    const openN = rows.filter(r => r.st.kind !== 'done').length, doneN = rows.filter(r => r.st.kind === 'done').length;
    const nav = $('navTasksCount');
    if (nav) { nav.textContent = String(rows.length); nav.classList.toggle('hasOpen', openN > 0); nav.title = openN ? tr(`${openN} tác vụ chưa xong`, `${openN} unfinished`) : ''; }
    const list = $('tasksList'), bar = $('tasksBar');
    if (!list || !bar || $('tasksPanel').hidden) return;
    const shown = rows.filter(r => filter === 'all' || (filter === 'done' ? r.st.kind === 'done' : r.st.kind !== 'done'));
    // Chỉ vẽ lại khi dữ liệu hiển thị đổi: tiến độ cảnh đổi liên tục không làm nhấp nháy hay mất nút đang bấm.
    const key = JSON.stringify([lang(), filter, Boolean(s.active || s.starting), Boolean(s.stopping), shown.map(r => [r.src.kind, r.id, r.title, r.at, r.st.kind, r.st.label, r.st.counts, r.st.output, r.st.pct, (r.own.filter(j => j.startedAt).length > 0)])]);
    if (key === listKey) return;
    listKey = key;
    bar.replaceChildren(
      ...[['all', tr('Tất cả', 'All'), rows.length], ['open', tr('Chưa xong', 'Unfinished'), openN], ['done', tr('Hoàn thành', 'Finished'), doneN]].map(([id, text, n]) => {
        const b = button(`${text} (${n})`, 'taskFilter' + (filter === id ? ' active' : ''), () => { filter = id; listKey = ''; render(lastState); });
        b.setAttribute('aria-pressed', String(filter === id)); return b;
      })
    );
    if (!shown.length) {
      list.replaceChildren(node('p', 'taskEmpty', rows.length ? tr('Không có tác vụ nào trong mục này.', 'No tasks in this view.') : tr('Chưa có video nào. Tạo video ở một tab bất kỳ, video sẽ hiện ở đây, dù xong hay còn dở.', 'No videos yet. Make a video in any tab and it will appear here, finished or not.')));
      return;
    }
    list.replaceChildren(...shown.map(r => { try { return rowNode(s, r); } catch (e) { console.error(e); return node('p', 'taskEmpty', r.title); } }));
  }

  window.tasksUi = { render, collect };
})();
