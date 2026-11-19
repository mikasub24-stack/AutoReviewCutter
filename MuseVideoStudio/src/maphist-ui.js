// Giao diện tab «Bản đồ lịch sử»: gõ chủ đề → Muse soạn kịch bản tiếng Anh → (xem, sửa được) → dựng video bản đồ động có giọng đọc + nhạc.
// Phụ thuộc renderer.js (call, toast, localFileUrl, askDelete, el) và maphist-geo/plan/draw.js.
(function () {
  'use strict';
  const $ = id => document.getElementById(id);
  const Plan = window.maphistPlan, Geo = window.maphistGeo, Draw = window.maphistDraw;
  const KEY = 'museStudio.maphist';
  let saved = {};
  try { saved = JSON.parse(localStorage.getItem(KEY) || '{}') || {}; } catch { saved = {}; }
  const persist = () => { try { localStorage.setItem(KEY, JSON.stringify(saved)); } catch { /* không lưu được thì thôi */ } };
  const base = file => String(file || '').split(/[\\/]/).pop();
  const MINUTES = Plan.LENGTHS;
  const CATS = Plan.CATEGORIES;
  const ALL_VALID = id => (CATS.some(c => c.id === id) ? id : '');
  const ALL_TOPICS = [...new Set(CATS.flatMap(c => c.topics))];
  const SAMPLE = 'In the year thirteen fifty, a great kingdom rose from the sea and ruled the islands for generations.';
  const live = Object.assign(document.createElement('img'), { className: 'restoreLive', alt: 'Khung hình đang vẽ' });
  let liveAt = 0, category = ALL_VALID(saved.category), thumbBusy = '', advancedShown = false, shownVoiceKey = '', runsKey = '', listening = false, audio = null, lastState = null, music = saved.music || '';
  const node = (tag, cls, text) => { const n = document.createElement(tag); if (cls) n.className = cls; if (text != null) n.textContent = text; return n; };
  const button = (text, cls, onclick, disabled) => { const b = node('button', cls, text); b.type = 'button'; b.disabled = Boolean(disabled); b.onclick = onclick; return b; };
  const refresh = async () => { runsKey = ''; const st = await call('state'); if (st) render(st); };

  // ---- ô chọn tĩnh + cấu hình
  function fillSelects() {
    $('mapMinutes').replaceChildren(...MINUTES.map(m => { const o = document.createElement('option'); o.value = String(m); o.textContent = `${m} phút`; return o; }));
    $('mapMinutes').value = MINUTES.includes(Number(saved.minutes)) ? String(saved.minutes) : String(Plan.DEFAULT_MINUTES);
  }
  const tempo = () => Math.min(1.2, Math.max(0.8, Number($('mapTempo').value) || 1));
  const musicVolume = () => Math.min(0.6, Math.max(0, Number($('mapMusicVol').value) || 0.2));
  const config = () => Plan.options({ topic: $('mapTopic').value, category, country: $('mapCountry').value, minutes: $('mapMinutes').value });
  function renderCount() {
    const c = config(), n = Plan.eraCount(c.minutes);
    $('mapCount').textContent = `Video khoảng ${c.minutes} phút = khoảng ${n} giai đoạn (mỗi giai đoạn ~${Plan.ERA_SECONDS} giây). Dựng trên máy bạn: khoảng ${Math.max(2, Math.round(c.minutes * 1.8))}–${Math.max(4, Math.round(c.minutes * 3.5))} phút tùy cấu hình máy (có card đồ họa thì nhanh hơn).`;
  }
  // ---- nhóm chủ đề (thẻ có khung video mẫu) + đề tài gợi ý bằng chữ của nhóm đang chọn
  function groupOf(topic) { return CATS.find(c => c.topics.includes(topic)) || null; }
  function renderGroups() {
    const box = $('mapGroups');
    if (!box.childElementCount) {
      box.append(...CATS.map(c => {
        const card = button('', 'groupCard', () => pickGroup(c.id)), img = document.createElement('img');
        card.dataset.group = c.id; img.src = 'assets/maphist/categories/' + c.id + '.jpg'; img.alt = ''; img.width = 400; img.height = 225;
        card.append(img, node('strong', 'groupName', c.label), node('span', 'groupDesc', c.desc));
        return card;
      }));
    }
    for (const card of box.children) { const on = card.dataset.group === category; card.classList.toggle('active', on); card.setAttribute('aria-pressed', String(on)); }
  }
  function renderTopics() {
    const box = $('mapTopics'), cur = $('mapTopic').value.trim(), group = CATS.find(c => c.id === category);
    const list = $('mapTopicList');
    if (!list.childElementCount) list.replaceChildren(...ALL_TOPICS.map(t => { const o = document.createElement('option'); o.value = t; return o; }));
    if (!group) box.replaceChildren(node('span', 'hint', 'Chọn một nhóm ở trên để xem các đề tài gợi ý, hoặc gõ đề tài của riêng bạn.'));
    else {
      const chips = group.topics.map(t => { const b = button(t, 'topicChip' + (t === cur ? ' active' : ''), () => pickTopic(t)); b.dataset.topic = t; return b; });
      box.replaceChildren(node('span', 'hint', `Đề tài gợi ý của nhóm «${group.label}» (bấm để chọn):`), ...chips);
    }
    $('mapCreate').textContent = cur ? 'Làm video bản đồ' : group ? `Muse chọn đề tài «${group.label}» và làm video` : 'Muse tự chọn chủ đề và làm video';
  }
  function pickGroup(id) {
    category = category === id ? '' : id;
    const cur = $('mapTopic').value.trim(), own = groupOf(cur);
    if (own && own.id !== category) $('mapTopic').value = '';     // đề tài của nhóm khác thì bỏ, tránh nhầm
    remember(); renderGroups(); renderTopics(); renderCount();
  }
  function pickTopic(t) { $('mapTopic').value = t; remember(); renderTopics(); renderCount(); }
  function renderMusic() {
    $('mapMusicName').textContent = music ? 'Nhạc nền: ' + base(music) : 'Không nhạc nền (chỉ có giọng đọc).';
    $('mapMusicClear').hidden = !music;
  }

  // ---- giọng đọc tiếng Anh (giọng Microsoft miễn phí, dùng chung bộ làm giọng của Muse Studio)
  function voiceChoices(v) {
    const list = [...(v.edgeVoices || [])].filter(x => x.lang === 'en' || x.lang === '*');
    list.sort((a, b) => (b.lang === 'en') - (a.lang === 'en'));
    return list;
  }
  function renderVoice(s) {
    const v = (s && s.story && s.story.voice) || {}, ready = v.ready || {};
    const choices = voiceChoices(v), key = choices.map(x => x.id).join(',');
    const select = $('mapVoice');
    if (key !== shownVoiceKey) {
      shownVoiceKey = key;
      select.replaceChildren(...(choices.length ? choices.map(x => { const o = document.createElement('option'); o.value = x.id; o.textContent = x.name; return o; }) : [Object.assign(document.createElement('option'), { value: '', textContent: 'Chưa có giọng' })]));
      const pick = choices.find(x => x.id === saved.voice) || choices.find(x => x.id === 'en-US-GuyNeural') || choices[0];
      select.value = pick ? pick.id : '';
    }
    select.disabled = !choices.length;
    $('mapListen').disabled = listening || !ready.edge || !choices.length || Boolean(v.setupBusy);
    $('mapListen').textContent = listening ? 'Đang tạo giọng…' : '▶ Nghe thử giọng';
    $('mapSetup').disabled = Boolean(v.setupBusy);
    $('mapSetup').textContent = v.setupBusy ? 'Đang cài giọng…' : ready.edge ? 'Cài lại giọng miễn phí' : 'Cài giọng miễn phí';
    let info;
    if (v.setupBusy) info = v.setupMessage || 'Đang cài giọng…';
    else if (v.setupError) info = v.setupError;
    else if (!ready.edge) info = 'Chưa cài giọng Microsoft. Bấm «Cài giọng miễn phí» (cần Python 3.10–3.13 trên máy và có mạng), đợi cài xong rồi làm video.';
    else info = 'Lời đọc và chữ trên video luôn bằng tiếng Anh (làm cho khán giả nước ngoài). Cần có mạng lúc đọc.';
    $('mapVoiceInfo').textContent = info;
    if (v.ready && !ready.edge && !advancedShown) { advancedShown = true; $('mapAdvanced').open = true; }
  }

  // ---- khóa theo gói
  function renderLock(s) {
    const ok = Boolean(s.license && s.license.longTerm);
    $('mapLock').hidden = ok; $('mapBody').hidden = !ok;
    $('mapLockText').textContent = 'Bản dùng thử và gói 30 ngày không dùng được tab này. Nâng cấp lên gói Năm hoặc Vĩnh viễn rồi nhập key mới.';
  }

  // ---- danh sách video
  const STATUS = { writing: 'Đang soạn kịch bản', draft: 'Kịch bản chưa xong', script: 'Kịch bản đã sẵn sàng', building: 'Đang dựng video', done: 'Đã dựng xong' };
  function runsOf(s) {
    const runs = (s.maphist && s.maphist.runs) || {};
    return Object.entries(runs).map(([id, meta]) => ({ id, meta })).sort((a, b) => (b.meta.createdAt || 0) - (a.meta.createdAt || 0));
  }
  // Tiêu đề đăng YouTube: luôn hiện ngay dưới video đã dựng xong, có nút sao chép; mô tả (có chương) và thẻ ở mục bên dưới.
  function copyButton(label, value, done) {
    return button(label, 'secondary', async () => {
      try { await navigator.clipboard.writeText(value); toast(done); } catch { toast('Không sao chép được. Hãy chọn chữ rồi nhấn Ctrl+C.'); }
    });
  }
  function publishBox(meta) {
    const p = meta.publish, title = (p && p.title) || meta.name || '', box = node('div', 'publishBox');
    const input = node('input', 'publishTitle'); input.type = 'text'; input.readOnly = true; input.value = title; input.onfocus = () => input.select();
    const row = node('div', 'publishRow'); row.append(input, copyButton('Sao chép tiêu đề', title, 'Đã sao chép tiêu đề.'));
    box.append(node('strong', 'publishHead', 'Tiêu đề đăng YouTube (đúng như trên video)'), row);
    if (p) {
      const more = node('details', 'publishMore'), desc = node('textarea', 'publishDesc'), tags = node('textarea', 'publishTags');
      desc.readOnly = true; desc.rows = 9; desc.value = p.description || ''; tags.readOnly = true; tags.rows = 2; tags.value = (p.tags || []).join(', ');
      more.append(node('summary', '', 'Mô tả (có chương) và thẻ'), desc, copyButton('Sao chép mô tả', desc.value, 'Đã sao chép mô tả.'), tags, copyButton('Sao chép thẻ', tags.value, 'Đã sao chép thẻ.'));
      box.append(more);
      if (meta.publishFile) box.append(node('small', 'hint', 'Cả ba đã được lưu trong file tieu-de-youtube.txt cạnh video (bấm «Mở video» để tới thư mục).'));
    } else box.append(node('small', 'hint', 'Video này dựng bằng bản cũ nên chưa có mô tả và chương. Bấm «Dựng lại» để có đủ.'));
    return box;
  }
  function renderRuns(s) {
    const info = s.maphist || {}, runs = runsOf(s), write = info.write || {}, build = info.build || {};
    const key = JSON.stringify([Boolean(s.active), Boolean(s.starting), Boolean(s.merging), info.busy, info.phase, info.progress, info.error, info.runId, write.progress, write.done, write.total, build.progress, build.done, build.total, build.previewAt || 0,
      thumbBusy, runs.map(r => [r.id, r.meta.status || '', r.meta.output || '', r.meta.builtAt || 0, r.meta.error || '', r.meta.name || '', r.meta.thumb || '', r.meta.thumbAt || 0])]);
    if (key === runsKey) return;
    runsKey = key;
    const hint = $('mapRunHint');
    if (info.busy && info.phase === 'write') hint.textContent = `Đang soạn kịch bản · ${write.done || 0}/${write.total || '?'} giai đoạn`;
    else if (info.busy && info.phase === 'build') hint.textContent = build.total ? `Đang dựng video · ${Math.round(100 * (build.done || 0) / build.total)}%` : 'Đang dựng video';
    hint.hidden = !info.busy; $('mapIdleHint').hidden = Boolean(info.busy);
    $('mapRuns').replaceChildren(...runs.map(({ id, meta }) => {
      const mine = info.runId === id, writing = mine && info.busy && info.phase === 'write', building = mine && info.busy && info.phase === 'build';
      const err = !info.busy && mine && info.error ? info.error : meta.error || '';
      const box = node('div', 'restoreRun' + (meta.status === 'done' ? ' done' : err ? ' error' : ''));
      const top = node('div', 'restoreRunTop'), title = node('strong', '', meta.name || id);
      top.append(title, node('span', '', writing ? 'Đang soạn kịch bản' : building ? 'Đang dựng video' : (STATUS[meta.status] || '') + (meta.eras ? ` · ${meta.eras} giai đoạn` : '') + (meta.seconds ? ` · ${Math.floor(meta.seconds / 60)}:${String(meta.seconds % 60).padStart(2, '0')}` : '')));
      const bar = node('div', 'autoBar'); bar.setAttribute('role', 'progressbar');
      const fill = document.createElement('i');
      const pct = writing ? (write.done || 0) / Math.max(1, write.total || 1) : building ? (build.done || 0) / Math.max(1, build.total || 1) : meta.status === 'done' ? 1 : 0;
      fill.style.width = Math.round(100 * pct) + '%'; bar.append(fill);
      const text = node('p', 'restoreRunText');
      if (writing) text.textContent = write.progress || info.progress || 'Muse đang soạn kịch bản…';
      else if (building) text.textContent = build.progress || info.progress || 'Đang dựng video…';
      else if (err) { text.textContent = err; text.classList.add('warn'); }
      else if (meta.status === 'done') text.textContent = 'Video hoàn chỉnh: ' + base(meta.output) + '.';
      else if (meta.status === 'draft') { text.textContent = 'Kịch bản chưa soạn xong. Bấm «Viết tiếp» để Muse làm tiếp từ chỗ dở (phần đã soạn được giữ lại).'; text.classList.add('warn'); }
      else if (meta.status === 'script') text.textContent = 'Kịch bản đã sẵn sàng. Bấm «Xem và sửa kịch bản» để kiểm tra, hoặc «Dựng video» để làm luôn.';
      const extra = [];
      // Vẽ tới đâu hiện tới đó: khung hình vừa vẽ xong (một thẻ img dùng lại, đổi nguồn khi có khung mới nên không nháy).
      if (building && build.preview) { if (liveAt !== build.previewAt) { live.src = localFileUrl(build.preview); liveAt = build.previewAt; } extra.push(live); } else liveAt = 0;
      if (meta.output && meta.status === 'done' && !building) extra.push(publishBox(meta));
      if (meta.output && meta.status === 'done' && !building) { const video = node('video', 'restoreVideo'); video.controls = true; video.preload = 'metadata'; video.src = localFileUrl(meta.output); extra.push(video); }
      if (meta.thumb && meta.status === 'done' && !building) { const img = node('img', 'restoreThumb'); img.alt = 'Thumbnail 16:9'; img.src = localFileUrl(meta.thumb) + '?v=' + (meta.thumbAt || 0); extra.push(img); }
      const actions = node('div', 'restoreRunActions');
      const busy = Boolean(info.busy || s.active || s.starting || s.merging || s.packaging);
      if (writing || building) actions.append(button(writing ? 'Dừng soạn' : 'Dừng dựng', 'secondary', async () => { const r = await call('mapCancel'); if (r) { runsKey = ''; render(r); } }));
      else {
        if (meta.status === 'draft') actions.append(button('Viết tiếp', 'primary', async () => { const r = await call('mapMake', { resumeId: id, auto: $('mapAuto').checked, voice: $('mapVoice').value }); if (r) await refresh(); }, busy));
        if (['script', 'done'].includes(meta.status)) {
          actions.append(button(meta.status === 'done' ? 'Dựng lại' : 'Dựng video', meta.status === 'done' ? 'secondary' : 'primary', async () => {
            const r = await call('mapRender', { runId: id, voice: $('mapVoice').value, tempo: tempo(), music, musicVolume: musicVolume() });
            if (r) await refresh();
          }, busy));
          actions.append(button('Xem và sửa kịch bản', 'secondary', () => openEditor(id), busy));
        }
        if (meta.status === 'done') {
          actions.append(button('Lưu video…', 'primary', async () => { const r = await call('mapSave', { runId: id }); if (r && r.file) toast('Đã lưu video: ' + r.file); }));
          actions.append(button('Mở video', 'secondary', () => call('mapReveal', { runId: id })));
          actions.append(button(thumbBusy === id ? 'Đang tạo thumbnail…' : meta.thumb ? 'Tạo thumbnail khác' : 'Tạo thumbnail 16:9', 'secondary', async () => {
            thumbBusy = id; runsKey = ''; render(lastState);
            try { const r = await call('mapThumb', { runId: id }); if (r) toast(`Đã tạo thumbnail 1920×1080 (ảnh ${r.variant}/${r.count}). Bấm lại để đổi sang ảnh khác.`); }
            finally { thumbBusy = ''; await refresh(); }
          }, busy || Boolean(thumbBusy)));
          if (meta.thumb) actions.append(button('Lưu thumbnail…', 'primary', async () => { const r = await call('mapSave', { runId: id, thumb: true }); if (r && r.file) toast('Đã lưu thumbnail: ' + r.file); }), button('Mở thumbnail', 'secondary', () => call('mapReveal', { runId: id, thumb: true })));
        } else actions.append(button('Mở thư mục', 'secondary', () => call('mapReveal', { runId: id })));
        const del = button('Xóa', 'secondary', async () => {
          const pick = await askDelete({
            title: 'Xóa video bản đồ này?',
            text: `«${meta.name || id}» sẽ bị bỏ khỏi danh sách.`,
            label: `Xóa luôn file đã lưu về máy (thư mục BanDo/${id}: kịch bản, lời đọc, video)`,
            hint: 'File được chuyển vào Thùng rác nên khôi phục được. Bản bạn đã bấm «Lưu video…» ra nơi khác không bị đụng tới.'
          });
          if (!pick) return;
          const r = await call('mapRemove', { runId: id, deleteFiles: pick.files });
          if (r) { runsKey = ''; render(r); toast(pick.files ? 'Đã xóa video và chuyển file đã lưu vào Thùng rác.' : 'Đã xóa video khỏi danh sách (file vẫn còn trong thư mục).'); }
        }, busy);
        actions.append(del);
      }
      box.append(top, bar, text, ...extra, actions);
      return box;
    }));
  }

  // ---- tạo video
  async function create() {
    const c = config();
    const bad = Plan.problems(c);
    if (bad.length) { toast(bad[0]); $('mapTopic').focus(); return; }
    $('mapCreate').disabled = true;
    try {
      const fresh = await call('mapMake', { topic: c.topic, category: c.category, country: c.country, minutes: c.minutes, voice: $('mapVoice').value, tempo: tempo(), music, musicVolume: musicVolume(), auto: $('mapAuto').checked });
      if (fresh) {
        $('mapForm').open = false;
        toast(!c.topic ? 'Muse đang chọn chủ đề và soạn kịch bản. Tên video sẽ hiện ở danh sách ngay khi có dàn ý.' : $('mapAuto').checked ? 'Muse đang soạn kịch bản. Các bước sau (vẽ bản đồ, giọng đọc, nhạc) tự chạy, bạn không cần bấm gì thêm.' : 'Muse đang soạn kịch bản. Xong bạn bấm «Xem và sửa kịch bản» để kiểm tra rồi mới dựng.');
        await refresh();
      }
    } finally { $('mapCreate').disabled = Boolean(lastState && createBlocked(lastState)); }
  }

  // ---- trình xem và sửa kịch bản
  let edit = null, geoCache = null, previewDraw = null;
  async function loadGeo() {
    if (geoCache) return geoCache;
    const raw = await call('mapGeo');
    if (!raw) return null;
    geoCache = Geo.build(raw);
    return geoCache;
  }
  const textInput = (value, placeholder, onChange, cls) => { const i = node('input', cls || ''); i.type = 'text'; i.value = value == null ? '' : value; i.placeholder = placeholder || ''; i.maxLength = 400; i.oninput = () => onChange(i.value); return i; };
  const field = (label, control) => { const l = node('label', 'mapField'); l.append(node('span', '', label), control); return l; };
  function eraCard(era, i) {
    const card = node('details', 'mapEra');
    const head = node('summary', '', ''), refreshHead = () => { head.textContent = `${i + 1}. ${Plan.yearLabel(era.year)} · ${era.title || '(chưa có tên)'}`; };
    refreshHead(); card.append(head);
    const row = node('div', 'mapRow');
    const year = node('input'); year.type = 'number'; year.value = era.year; year.oninput = () => { const n = Number(year.value); if (Number.isFinite(n)) era.year = Math.round(n); refreshHead(); };
    const pop = node('input'); pop.type = 'number'; pop.min = '0'; pop.value = era.population || ''; pop.oninput = () => { era.population = Math.max(0, Number(pop.value) || 0); };
    row.append(field('Năm (số âm = trước Công nguyên)', year), field('Tên giai đoạn (tiếng Anh)', textInput(era.title, '', v => { era.title = v; refreshHead(); })), field('Dân số (người, bỏ trống nếu không rõ)', pop));
    card.append(row, field('Câu chữ trên thẻ (tiếng Anh, ngắn)', textInput(era.caption, '', v => { era.caption = v; })));
    const nar = node('textarea'); nar.value = era.narration || ''; nar.maxLength = 1200; nar.rows = 4;
    const count = node('small', 'hint', ''), showCount = () => { count.textContent = `${Plan.words(nar.value)} từ · khoảng ${Math.round(Plan.speakSeconds(nar.value))} giây khi đọc`; };
    nar.oninput = () => { era.narration = nar.value; showCount(); }; showCount();
    card.append(field('Lời đọc (tiếng Anh, giọng kể chuyện)', nar), count);
    // thế lực + vùng tô
    const realms = node('div', 'mapRealms'), drawRealms = () => {
      realms.replaceChildren(node('strong', '', 'Thế lực hiện trên bản đồ'), ...era.realms.map((r, k) => {
        const line = node('div', 'mapRealm');
        const regions = textInput((r.regions || []).join(', '), 'Tên nước hoặc tỉnh, cách nhau bằng dấu phẩy', v => { r.regions = v.split(',').map(x => x.trim()).filter(Boolean); delete r.unknown; });
        const mood = node('select'); for (const m of Plan.MOODS) { const o = document.createElement('option'); o.value = m; o.textContent = { happy: 'Vui', proud: 'Tự hào', tired: 'Mệt', angry: 'Giận', sad: 'Buồn', calm: 'Bình thản' }[m]; mood.append(o); }
        mood.value = r.mood || 'happy'; mood.onchange = () => { r.mood = mood.value; };
        const color = node('input'); color.type = 'color'; color.value = r.colors && r.colors[0] && /^#[0-9a-f]{6}$/i.test(r.colors[0]) ? r.colors[0] : (r.color || '#b5412f'); color.oninput = () => { r.color = color.value; r.colors = [color.value]; r.flag = 'solid'; };
        const face = node('input'); face.type = 'checkbox'; face.checked = r.face !== false; face.onchange = () => { r.face = face.checked; };
        const faceLabel = node('label', 'checkLine'); faceLabel.append(face, node('span', '', 'Lá cờ có mặt'));
        const rm = button('✕', 'secondary', () => { era.realms.splice(k, 1); drawRealms(); });
        line.append(textInput(r.name, 'Tên (tiếng Anh)', v => { r.name = v; }, 'mapRealmName'), regions, mood, color, faceLabel, rm);
        if (r.unknown && r.unknown.length) line.append(node('p', 'restoreRunText warn', 'Không tìm thấy trên bản đồ: ' + r.unknown.join(', ') + '. Sửa tên cho khớp tên nước/tỉnh trong dữ liệu (tên tiếng Anh hoặc tên bản địa).'));
        return line;
      }), button('+ Thêm thế lực', 'secondary', () => { era.realms.push({ name: 'New realm', regions: [], circles: [], color: Plan.PALETTE[era.realms.length % Plan.PALETTE.length], colors: [Plan.PALETTE[era.realms.length % Plan.PALETTE.length]], flag: 'solid', mood: 'calm', face: false }); drawRealms(); }));
    };
    drawRealms(); card.append(realms);
    if (era.markers && era.markers.length) {
      const marks = node('div', 'mapRealms'), drawMarks = () => {
        marks.replaceChildren(node('strong', '', 'Địa danh'), ...era.markers.map((m, k) => { const line = node('div', 'mapRealm'); line.append(textInput(m.name, 'Tên địa danh', v => { m.name = v; }), node('small', 'hint', m.type), button('✕', 'secondary', () => { era.markers.splice(k, 1); drawMarks(); })); return line; }));
      };
      drawMarks(); card.append(marks);
    }
    const acts = node('div', 'restoreRunActions');
    acts.append(button('Xem thử hình', 'secondary', () => preview(i)), button('Xóa giai đoạn này', 'secondary', () => { if (edit.script.eras.length <= 1) return toast('Kịch bản cần ít nhất một giai đoạn.'); edit.script.eras.splice(i, 1); drawEditor(); }));
    card.append(acts);
    return card;
  }
  function eraTemplate(prev) {
    return { year: prev ? prev.year + 50 : 1000, title: 'New era', caption: '', narration: '', population: 0, icon: 'star', realms: prev ? JSON.parse(JSON.stringify(prev.realms)).map(r => { delete r.unknown; return r; }) : [], markers: [], routes: [], view: null };
  }
  function drawEditor() {
    const s = edit.script;
    $('mapEditTitle').value = s.title || ''; $('mapEditSubtitle').value = s.subtitle || '';
    const issues = $('mapIssues'); issues.hidden = !edit.issues.length;
    issues.replaceChildren(node('strong', '', `Cần kiểm tra (${edit.issues.length})`), ...edit.issues.slice(0, 40).map(x => node('div', '', x)));
    $('mapEras').replaceChildren(...s.eras.map(eraCard), button('+ Thêm giai đoạn cuối', 'secondary', () => { s.eras.push(eraTemplate(s.eras[s.eras.length - 1])); drawEditor(); }));
  }
  async function preview(i) {
    const geo = await loadGeo();
    if (!geo || !edit) return;
    const status = $('mapPreviewNote');
    try {
      const { script } = Plan.normalizeScript(JSON.parse(JSON.stringify(edit.script)), geo);
      const tl = Plan.compile(script, geo, { durations: [], fps: 30 });
      const cv = $('mapPreview');
      if (!previewDraw || previewDraw.geo !== geo) previewDraw = { geo, lib: Draw.create({ canvas: cv, geo }) };
      previewDraw.lib.setTimeline(tl);
      await document.fonts.load('700 40px MapLora');
      const e = tl.eras[Math.min(i, tl.eras.length - 1)];
      const t = e.start + Math.min(e.dur - 1.2, 7);
      previewDraw.lib.drawFrame(t);
      status.textContent = `Hình xem thử: giai đoạn ${i + 1} (${e.label}).`;
      $('mapPreviewBox').hidden = false;
      $('mapPreviewBox').scrollIntoView({ block: 'nearest' });
    } catch (error) { status.textContent = 'Không dựng được hình xem thử: ' + error.message; $('mapPreviewBox').hidden = false; }
  }
  function collect() { edit.script.title = $('mapEditTitle').value; edit.script.subtitle = $('mapEditSubtitle').value; return JSON.parse(JSON.stringify(edit.script, (k, v) => (k === 'units' ? undefined : v))); }
  async function saveEdit() {
    const r = await call('mapSaveScript', { runId: edit.runId, script: collect() });
    if (r) { edit.issues = r.issues || []; drawEditor(); toast(edit.issues.length ? `Đã lưu kịch bản. Còn ${edit.issues.length} chỗ cần kiểm tra.` : 'Đã lưu kịch bản.'); }
    return r;
  }
  async function openEditor(runId) {
    const r = await call('mapScript', { runId });
    if (!r || !r.script) { if (r) toast('Chưa có kịch bản để sửa.'); return; }
    edit = { runId, script: r.script, issues: r.issues || [] };
    for (const era of edit.script.eras) for (const realm of era.realms) delete realm.units;
    $('mapPreviewBox').hidden = true;
    drawEditor();
    $('mapEditor').showModal();
  }
  $('mapEditClose').onclick = () => $('mapEditor').close();
  $('mapEditSave').onclick = saveEdit;
  $('mapEditBuild').onclick = async () => {
    if (!edit) return;
    const saved1 = await saveEdit();
    if (!saved1) return;
    const r = await call('mapRender', { runId: edit.runId, voice: $('mapVoice').value, tempo: tempo(), music, musicVolume: musicVolume() });
    if (r) { $('mapEditor').close(); await refresh(); toast('Đang dựng video. Có thể theo dõi tiến độ ở danh sách.'); }
  };

  const createBlocked = s => Boolean(((s && s.maphist) || {}).busy || (s && (s.active || s.starting || s.merging || s.packaging)));
  function render(s) {
    if (!s) return;
    lastState = s;
    renderLock(s);
    renderVoice(s);
    renderCount();
    $('mapCreate').disabled = createBlocked(s);
    renderRuns(s);
  }

  // ---- khởi tạo
  fillSelects();
  $('mapTopic').value = saved.topic || '';
  $('mapCountry').value = saved.country || '';
  $('mapTempo').value = String(saved.tempo || 1);
  $('mapMusicVol').value = String(saved.musicVolume == null ? 0.2 : saved.musicVolume);
  $('mapAuto').checked = saved.auto !== false;
  const showTempo = () => { $('mapTempoOut').textContent = tempo().toFixed(2) + '×'; };
  showTempo(); renderMusic(); renderCount(); renderGroups(); renderTopics();
  const remember = () => { saved = { ...saved, topic: $('mapTopic').value, category, country: $('mapCountry').value, minutes: $('mapMinutes').value, tempo: tempo(), musicVolume: musicVolume(), music, voice: $('mapVoice').value, auto: $('mapAuto').checked }; persist(); };
  $('mapMinutes').onchange = () => { remember(); renderCount(); };
  $('mapTopic').oninput = () => { remember(); renderCount(); renderTopics(); };
  $('mapCountry').oninput = remember;
  $('mapTempo').oninput = () => { showTempo(); remember(); };
  $('mapMusicVol').oninput = remember;
  $('mapAuto').onchange = remember;
  $('mapVoice').onchange = remember;
  $('mapTopic').addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); create(); } });
  $('mapCreate').onclick = create;
  $('mapKey').onclick = () => $('licenseDialog').showModal();
  $('mapSetup').onclick = async () => { const r = await call('storySetupVoice'); if (r) render(r); };
  $('mapMusic').onclick = async () => { const file = await call('chooseMusic'); if (file) { music = file; renderMusic(); remember(); } };
  $('mapMusicClear').onclick = () => { music = ''; renderMusic(); remember(); };
  $('mapListen').onclick = async () => {
    listening = true; renderVoice(lastState);
    try {
      const file = await call('storyListen', { engine: 'edge', voice: $('mapVoice').value, tempo: tempo(), volume: 1, text: SAMPLE });
      if (file) { audio = audio || new Audio(); audio.src = localFileUrl(file); audio.play().catch(() => {}); }
    } finally { listening = false; renderVoice(lastState); }
  };
  window.mapUi = { render };
})();
