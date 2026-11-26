// Giao diện tab «So sánh song song»: một nhân vật, hai con đường. Chọn chủ đề (hoặc để trống cho Muse tự chọn), ngôn ngữ, giọng đọc;
// mọi bước sau tự chạy ở nền (kịch bản, ảnh nền chung, hai clip mỗi mốc, lồng tiếng, chữ canvas, âm thanh, dựng video).
// Dùng chung đăng nhập Muse, tài khoản và hàng đợi với các tab khác, nhưng có việc, thư mục (SoSanh) và danh sách riêng.
// Phụ thuộc renderer.js (call, toast, localFileUrl) và pair-plan.js.
(function () {
  'use strict';
  const $ = id => document.getElementById(id);
  const P = window.pairPlan;
  const KEY = 'museStudio.pair';
  let saved = {};
  try { saved = JSON.parse(localStorage.getItem(KEY) || '{}') || {}; } catch { saved = {}; }
  const persist = () => { try { localStorage.setItem(KEY, JSON.stringify(saved)); } catch { /* không lưu được thì thôi */ } };
  const base = file => String(file || '').split(/[\\/]/).pop();

  // Câu nghe thử giọng, đúng ngôn ngữ video.
  const SAMPLES = {
    en: 'Same room. Same child. Two very different paths.', vi: 'Cùng một căn phòng, cùng một đứa trẻ, nhưng hai con đường rất khác nhau.',
    es: 'La misma habitación, el mismo niño, dos caminos muy distintos.', pt: 'O mesmo quarto, a mesma criança, dois caminhos muito diferentes.',
    fr: 'La même pièce, le même enfant, deux chemins très différents.', de: 'Derselbe Raum, dasselbe Kind, zwei ganz verschiedene Wege.',
    id: 'Ruangan yang sama, anak yang sama, dua jalan yang sangat berbeda.', ru: 'Одна комната, один ребёнок, два совершенно разных пути.',
    tr: 'Aynı oda, aynı çocuk, iki çok farklı yol.', hi: 'वही कमरा, वही बच्चा, लेकिन दो बिल्कुल अलग रास्ते।',
    ar: 'الغرفة نفسها والطفل نفسه، لكن طريقان مختلفان تمامًا.', th: 'ห้องเดียวกัน เด็กคนเดียวกัน แต่เป็นสองเส้นทางที่ต่างกันมาก',
    ja: '同じ部屋、同じ子ども。でも、まったく違う二つの道。', ko: '같은 방, 같은 아이, 하지만 전혀 다른 두 갈래 길.', zh: '同一个房间，同一个孩子，却走上两条截然不同的路。'
  };
  let thumbBusy = '', shownVoiceKey = '', runsKey = '', listening = false, audio = null, lastState = null, music = saved.music || '';

  const lang = () => ($('pairLang') && P.LANGUAGES.some(l => l.id === $('pairLang').value)) ? $('pairLang').value : 'en';
  const tempo = () => Math.min(1.3, Math.max(0.8, Number($('pairTempo').value) || 1));
  const config = () => P.options({ topic: $('pairTopic').value, left: $('pairLeft').value, right: $('pairRight').value, minutes: $('pairMinutes').value, lang: lang(), layout: $('pairLayout').value });

  // ---- ô chọn tĩnh
  function fillSelects() {
    $('pairMinutes').replaceChildren(...P.MINUTES.map(m => { const o = document.createElement('option'); o.value = String(m); o.textContent = m < 8 ? `${m} phút (chạy thử, ít clip)` : `${m} phút`; return o; }));
    $('pairLang').replaceChildren(...P.LANGUAGES.map(l => { const o = document.createElement('option'); o.value = l.id; o.textContent = l.label; return o; }));
    $('pairMinutes').value = P.MINUTES.includes(Number(saved.minutes)) ? String(saved.minutes) : '9';
    $('pairLang').value = P.LANGUAGES.some(l => l.id === saved.lang) ? saved.lang : 'en';
    $('pairLayout').value = P.LAYOUTS.includes(saved.layout) ? saved.layout : 'side';
  }
  function renderCount() {
    const c = config();
    $('pairCount').textContent = `Video khoảng ${c.minutes} phút = ${c.beats} mốc → ${c.beats} ảnh nền chung + ${c.clips} clip (mỗi clip ${c.seconds} giây, hai clip mỗi mốc). Tạo ảnh và clip trên Muse mất nhiều giờ: cứ để máy chạy, tool tự thử lại clip lỗi và tự dựng video khi đủ clip.`;
    $('pairCreate').textContent = c.topic ? 'Làm video tự động' : 'Muse tự chọn chủ đề và làm video';
  }

  // ---- chủ đề gợi ý
  const topicText = (preset, id) => (P.topicPreset(preset.id, id) || {}).topic || '';
  function presetOf(text) {
    const t = String(text || '').trim();
    return t ? P.TOPICS.find(x => P.topicPreset(x.id, 'en').topic === t || P.topicPreset(x.id, 'vi').topic === t) : null;
  }
  function applyPreset(preset, id) {
    const p = P.topicPreset(preset.id, id);
    $('pairTopic').value = p.topic; $('pairLeft').value = p.left; $('pairRight').value = p.right;
    remember(); renderTopics(); renderCount();
  }
  function renderTopics() {
    const box = $('pairTopics'), cur = presetOf($('pairTopic').value);
    const chips = [];
    const auto = button('🎲 Để Muse tự chọn', 'topicChip' + (!$('pairTopic').value.trim() ? ' active' : ''), () => { $('pairTopic').value = ''; $('pairLeft').value = ''; $('pairRight').value = ''; remember(); renderTopics(); renderCount(); });
    chips.push(auto);
    for (const t of P.TOPICS) { const b = button(topicText(t, lang()), 'topicChip' + (cur && cur.id === t.id ? ' active' : ''), () => applyPreset(t, lang())); b.dataset.topic = t.id; chips.push(b); }
    box.replaceChildren(Object.assign(document.createElement('span'), { className: 'hint', textContent: 'Chủ đề gợi ý (bấm để chọn). Nhãn hai bên điền sẵn nếu có; để trống thì Muse tự viết đúng ngôn ngữ video:' }), ...chips);
  }

  // ---- giọng đọc (giọng Microsoft miễn phí, cùng bộ làm giọng dùng chung của Muse Studio)
  function voiceChoices(v, id) {
    const list = [...(v.edgeVoices || [])].filter(x => x.lang === id || x.lang === '*');
    list.sort((a, b) => (b.lang === id) - (a.lang === id));
    return list;
  }
  function renderVoice(s) {
    const v = (s && s.story && s.story.voice) || {}, id = lang(), ready = v.ready || {};
    const choices = voiceChoices(v, id), key = id + '|' + choices.map(x => x.id).join(','), select = $('pairVoice');
    if (key !== shownVoiceKey) {
      shownVoiceKey = key;
      select.replaceChildren(...(choices.length ? choices.map(x => { const o = document.createElement('option'); o.value = x.id; o.textContent = `${x.name}${x.lang === id ? ' ✓' : ''}`; return o; }) : [Object.assign(document.createElement('option'), { value: '', textContent: 'Chưa có giọng cho ngôn ngữ này' })]));
      const remembered = (saved.voices || {})[id], preferred = P.langOf(id).voice;
      select.value = choices.some(x => x.id === remembered) ? remembered : choices.some(x => x.id === preferred) ? preferred : (choices[0] ? choices[0].id : '');
    }
    select.disabled = !choices.length;
    $('pairListen').disabled = listening || !ready.edge || !choices.length || Boolean(v.setupBusy);
    $('pairListen').textContent = listening ? 'Đang tạo giọng…' : '▶ Nghe thử giọng';
    $('pairSetup').disabled = Boolean(v.setupBusy);
    $('pairSetup').textContent = v.setupBusy ? 'Đang cài giọng…' : ready.edge ? 'Cài lại giọng miễn phí' : 'Cài giọng miễn phí';
    let info;
    if (v.setupBusy) info = v.setupMessage || 'Đang cài giọng…';
    else if (v.setupError) info = v.setupError;
    else if (!ready.edge) info = 'Chưa cài giọng Microsoft. Bấm «Cài giọng miễn phí» (cần Python 3.10–3.13 trên máy và có mạng), đợi cài xong rồi làm video.';
    else info = 'Giọng Microsoft miễn phí (✓ = đúng ngôn ngữ video). Cần có mạng lúc đọc. Mỗi mốc có một đoạn lời dẫn kể điều xảy ra ở bên trái rồi bên phải.';
    $('pairVoiceInfo').textContent = info;
  }
  function renderMusic() {
    $('pairMusicName').textContent = music ? 'Nhạc nền: ' + base(music) : 'Nhạc nền tự động (miễn bản quyền, tool tự tạo), nhỏ đi khi có lời đọc.';
    $('pairMusicClear').hidden = !music;
  }

  // ---- tạo video
  async function create() {
    const c = config();
    $('pairCreate').disabled = true;
    try {
      const fresh = await call('pairMake', { topic: c.topic, left: c.left, right: c.right, minutes: c.minutes, lang: c.lang, layout: c.layout, voice: { voice: $('pairVoice').value, tempo: tempo(), volume: Number($('pairVoiceVol').value) }, music, musicVolume: Number($('pairMusicVol').value) });
      if (fresh) { $('pairForm').open = false; toast(c.topic ? 'Muse đang viết kịch bản. Các bước sau tự chạy, bạn không cần bấm gì thêm.' : 'Muse đang chọn chủ đề và viết kịch bản. Các bước sau tự chạy, bạn không cần bấm gì thêm.'); runsKey = ''; const state = await call('state'); if (state) render(state); }
    } finally { $('pairCreate').disabled = Boolean(lastState && createBlocked(lastState)); }
  }

  // ---- danh sách video
  function runsOf(s) {
    const ids = new Set(Object.keys((s.pair && s.pair.stories) || {}));
    for (const j of s.jobs || []) if (j && j.kind === 'pair' && j.storyId) ids.add(j.storyId);
    return [...ids].map(id => ({ id, list: (s.jobs || []).filter(j => j && j.kind === 'pair' && j.storyId === id), meta: ((s.pair && s.pair.stories) || {})[id] || {} }))
      .sort((a, b) => (b.meta.createdAt || 0) - (a.meta.createdAt || 0));
  }
  const button = (text, cls, onclick, disabled) => { const b = document.createElement('button'); b.type = 'button'; b.className = cls; b.textContent = text; b.disabled = Boolean(disabled); if (onclick) b.onclick = onclick; return b; };

  // ---- thông tin đăng YouTube: tiêu đề, mô tả (có chương), hashtag, thẻ tag; mỗi phần có nút sao chép
  const node = (tag, cls, text) => { const n = document.createElement(tag); if (cls) n.className = cls; if (text != null) n.textContent = text; return n; };
  function copyButton(label, value, done) {
    return button(label, 'secondary', async () => {
      try { await navigator.clipboard.writeText(typeof value === 'function' ? value() : value); toast(done); } catch { toast('Không sao chép được. Hãy chọn chữ rồi nhấn Ctrl+C.'); }
    });
  }
  const publishAsked = new Set();
  const titleEdits = new Map();   // tiêu đề đang gõ dở theo từng video: giữ nguyên khi danh sách vẽ lại
  function publishBox(meta, id) {
    const p = meta.publish, box = node('div', 'publishBox');
    // Chưa có gói đăng (video làm bằng bản cũ): nhờ máy lập từ kịch bản đã lưu, không cần Muse.
    if (!p && !publishAsked.has(id)) {
      publishAsked.add(id);
      Promise.resolve().then(() => window.studio.invoke('pairPublish', { storyId: id })).then(() => { runsKey = ''; return window.studio.invoke('state'); }).then(st => { if (st) render(st); }).catch(() => {});
    }
    if (!p) { box.append(node('small', 'hint', 'Đang lập tiêu đề, mô tả, hashtag và thẻ tag từ kịch bản…')); return box; }
    box.append(node('strong', 'publishHead', 'Thông tin đăng YouTube (đúng như trên video)'));
    const field = (label, value, rows, copyLabel, done, edit) => {
      const wrap = node('div', 'publishRow'), area = rows ? node('textarea', rows > 4 ? 'publishDesc' : 'publishTags') : node('input', 'publishTitle');
      if (rows) { area.rows = rows; } else { area.type = 'text'; }
      area.setAttribute('aria-label', label);
      const col = node('div', 'publishField'); col.append(node('small', 'hint', label), area);
      if (!edit) { area.readOnly = true; area.value = value; area.onfocus = () => area.select(); wrap.append(col, copyButton(copyLabel, value, done)); return wrap; }
      // Tiêu đề sửa được: «Lưu tiêu đề» đổi kịch bản đã lưu, mô tả và file ghi chú; thẻ mở đầu trong video đổi khi dựng lại.
      area.maxLength = 100; area.dataset.titleFor = id; area.value = titleEdits.has(id) ? titleEdits.get(id) : value;
      const changed = () => { const t = area.value.replace(/\s+/g, ' ').trim(); return Boolean(t) && t !== value; };
      const save = button('Lưu tiêu đề', 'primary', async () => {
        const r = await call('pairRetitle', { storyId: id, title: area.value });
        if (r) { titleEdits.delete(id); toast('Đã đổi tiêu đề. Bấm «Dựng lại video» để thẻ mở đầu trong video cũng đổi tên.'); runsKey = ''; const st = await call('state'); if (st) render(st); }
      }, !changed());
      area.oninput = () => { titleEdits.set(id, area.value); save.disabled = !changed(); };
      wrap.append(col, copyButton(copyLabel, () => area.value.trim(), done), save);
      return wrap;
    };
    const tags = (p.tags || []).join(', '), hashtags = (p.hashtags || []).join(' ');
    box.append(
      field('Tiêu đề video', p.title || '', 0, 'Sao chép tiêu đề', 'Đã sao chép tiêu đề.', true),
      field('Mô tả video' + (p.chapters && p.chapters.length ? ' (có chương theo giờ)' : ''), p.description || '', 9, 'Sao chép mô tả', 'Đã sao chép mô tả.'),
      field('Hashtag', hashtags, 2, 'Sao chép hashtag', 'Đã sao chép hashtag.'),
      field('Thẻ tag (dán vào ô «Thẻ» của YouTube)', tags, 3, 'Sao chép thẻ tag', 'Đã sao chép thẻ tag.')
    );
    if (meta.output && meta.videoTitle && meta.videoTitle !== (meta.name || p.title)) box.append(node('small', 'hint', 'Thẻ mở đầu trong video vẫn hiện tên cũ. Bấm «Dựng lại video» để đổi.'));
    else box.append(node('small', 'hint', 'Sửa tiêu đề rồi bấm «Lưu tiêu đề»: mô tả và file ghi chú đổi theo.'));
    if ((p.title || '').length > 70) box.append(node('small', 'hint', 'Tiêu đề hơi dài: YouTube thường chỉ hiện khoảng 60–70 ký tự.'));
    if (p.partial || !(p.chapters && p.chapters.length)) box.append(node('small', 'hint', 'Video này dựng bằng bản cũ hoặc quá ngắn nên chưa có chương theo giờ. Bấm «Dựng lại video» để mô tả có chương đúng giờ.'));
    else if (meta.publishFile) box.append(node('small', 'hint', 'Cả bốn phần cũng được lưu trong file tieu-de-youtube.txt cạnh video.'));
    box.append(node('small', 'hint', 'Hình ảnh do AI tạo: khi đăng hãy bật mục «nội dung bị thay đổi hoặc tổng hợp».'));
    return box;
  }
  function fallbackCard({ id, list, meta }, error) {
    const box = node('div', 'restoreRun error'), top = node('div', 'restoreRunTop');
    top.append(node('strong', '', (meta && (meta.name || meta.title)) || id), node('span', '', `${(list || []).filter(j => j.phase === 'clip' && j.status === 'completed').length}/${(list || []).filter(j => j.phase === 'clip').length} clip`));
    const text = node('p', 'restoreRunText warn', 'Không hiển thị đầy đủ được thẻ video này' + (error && error.message ? ` (${error.message})` : '') + '. Các nút bên dưới vẫn dùng được.');
    const actions = node('div', 'restoreRunActions');
    actions.append(
      button('Tạo thumbnail 16:9', 'secondary', async () => { const r = await call('pairThumb', { storyId: id }); if (r) toast(`Đã tạo thumbnail 1920×1080 (ảnh ${r.variant}/${r.count}). Bấm lại để đổi sang kiểu khác.`); }),
      button('Mở thư mục', 'secondary', () => call('openOutput', { kind: 'pair' }))
    );
    box.append(top, text, actions);
    return box;
  }
  function renderRuns(s) {
    const info = s.pair || {}, runs = runsOf(s), write = info.write || {};
    const key = JSON.stringify([Boolean(s.active), Boolean(s.starting), Boolean(s.stopping), info.busy, info.phase, info.progress, info.error, info.storyId, write.progress, write.done, write.total, thumbBusy,
      runs.map(r => [r.id, r.meta.status || '', r.meta.output || '', r.meta.builtAt || 0, r.meta.name || '', r.meta.thumb || '', r.meta.thumbAt || 0, r.meta.publish ? r.meta.publish.title + (r.meta.publish.chapters || []).length : '', r.meta.videoTitle || '', r.list.map(j => j.status + (j.stage || ''))])]);
    if (key === runsKey) return;
    const live = runs.find(r => r.list.some(j => ['pending', 'running', 'interrupted', 'failed'].includes(j.status)) || r.meta.status === 'writing');
    const hint = $('pairRunHint');
    if (info.busy && info.phase === 'write') hint.textContent = `Đang viết kịch bản · ${write.done || 0}/${write.total || '?'} mốc`;
    else if (info.busy && info.phase === 'build') hint.textContent = 'Đang lồng tiếng và dựng video';
    else if (info.busy && info.phase === 'thumb') hint.textContent = 'Đang tạo thumbnail';
    else if (live && live.list.length) { const clips = live.list.filter(j => j.phase === 'clip'), done = clips.filter(j => j.status === 'completed').length; hint.textContent = `${s.active || s.starting ? 'Đang chạy' : 'Tạm dừng'} · ${done}/${clips.length} clip`; }
    hint.hidden = !(live || info.busy); $('pairIdleHint').hidden = Boolean(live || info.busy);
    const build = ({ id, list, meta }) => {
      const clips = list.filter(j => j.phase === 'clip'), doneClips = clips.filter(j => j.status === 'completed').length, doneAll = list.filter(j => j.status === 'completed').length;
      const failed = list.some(j => ['failed', 'interrupted'].includes(j.status)), running = list.some(j => j.status === 'running');
      const allClips = clips.length > 0 && clips.every(j => j.status === 'completed');
      const mine = info.storyId === id, writing = mine && info.busy && info.phase === 'write', building = mine && info.busy && info.phase === 'build';
      const err = mine && info.error ? info.error : '';
      const box = document.createElement('div'); box.className = 'restoreRun' + (meta.output ? ' done' : err || failed ? ' error' : '');
      const top = document.createElement('div'); top.className = 'restoreRunTop';
      const title = document.createElement('strong'); title.textContent = meta.name || (meta.status === 'writing' ? (meta.topic ? meta.topic : 'Muse đang chọn chủ đề…') : id);
      const count = document.createElement('span');
      count.textContent = clips.length ? `${doneClips}/${clips.length} clip` : meta.status === 'writing' ? 'Đang lập kịch bản' : '';
      top.append(title, count);
      const bar = document.createElement('div'); bar.className = 'autoBar'; bar.setAttribute('role', 'progressbar');
      const fill = document.createElement('i');
      fill.style.width = Math.round(100 * (meta.output ? 1 : clips.length ? doneAll / Math.max(1, list.length) : writing ? (write.done || 0) / Math.max(1, write.total || 1) : 0)) + '%'; bar.append(fill);
      const text = document.createElement('p'); text.className = 'restoreRunText';
      if (writing) text.textContent = write.progress || info.progress || 'Muse đang viết kịch bản…';
      else if (building) text.textContent = info.progress || 'Đang lồng tiếng và dựng video…';
      else if (err) { text.textContent = err; text.classList.add('warn'); }
      else if (meta.output) text.textContent = `Video hoàn chỉnh${meta.seconds ? ` (${Math.floor(meta.seconds / 60)} phút ${Math.round(meta.seconds % 60)} giây)` : ''}: ${base(meta.output)}. Xem file ghi chú đăng video (ghi-chu-dang-video.txt) trong cùng thư mục.`;
      else if (meta.status === 'writing') { text.textContent = 'Kịch bản chưa viết xong. Bấm «Viết tiếp» để Muse làm tiếp từ chỗ dở (phần đã viết được giữ lại).'; text.classList.add('warn'); }
      else if (failed) { text.textContent = 'Có clip dở hoặc lỗi. Tool tự thử lại vài lần; nếu vẫn lỗi hãy bấm «Tạo tiếp». Clip chỉ chạy khi ảnh nền của mốc đó đã xong.'; text.classList.add('warn'); }
      else if (running || s.active || s.starting) text.textContent = 'Đang tạo ảnh nền chung và hai clip của từng mốc trên Muse…';
      else if (allClips) text.textContent = 'Đã đủ clip. Bấm «Dựng video» để lồng tiếng, thêm chữ và âm thanh rồi dựng.';
      else if (doneClips || list.some(j => j.status === 'completed')) text.textContent = 'Đang tạm dừng. Bấm «Tạo tiếp» để chạy nốt các clip còn lại.';
      else text.textContent = 'Chờ chạy. Bấm «Chạy» để bắt đầu tạo ảnh nền và clip.';
      const extra = [];
      if (meta.output && !building) {
        const video = document.createElement('video'); video.className = 'restoreVideo'; video.controls = true; video.preload = 'metadata';
        if (meta.cover) video.poster = localFileUrl(meta.cover);
        video.src = localFileUrl(meta.output); extra.push(video);
      }
      if (meta.thumb && !building) {
        const img = document.createElement('img'); img.className = 'restoreThumb'; img.alt = 'Thumbnail 16:9';
        img.src = localFileUrl(meta.thumb) + '?v=' + (meta.thumbAt || 0); img.onerror = () => { img.hidden = true; }; extra.push(img);
      }
      const actions = document.createElement('div'); actions.className = 'restoreRunActions';
      const queueBusy = Boolean(s.active || s.starting), anyBusy = queueBusy || Boolean(info.busy) || Boolean(s.merging || s.packaging);
      if (writing) actions.append(button('Dừng viết', 'secondary', async () => { const r = await call('pairCancel'); if (r) { runsKey = ''; render(r); } }));
      else if (building) actions.append(button('Dừng dựng', 'secondary', async () => { const r = await call('pairCancel'); if (r) { runsKey = ''; render(r); } }));
      else if (queueBusy) actions.append(button('Dừng', 'secondary', async () => { const r = await call('stop'); if (r) { runsKey = ''; render(r); } }, s.stopping));
      else if (meta.status === 'writing' && !info.busy) actions.append(button('Viết tiếp', 'primary', async () => { const r = await call('pairMake', { resumeId: id }); if (r) { runsKey = ''; const st = await call('state'); if (st) render(st); } }, anyBusy));
      else if (list.some(j => ['pending', 'interrupted', 'failed'].includes(j.status)) && !meta.output) {
        const started = list.some(j => j.startedAt || ['interrupted', 'failed', 'completed'].includes(j.status));
        actions.append(button(started ? 'Tạo tiếp' : 'Chạy', 'primary', async () => { const r = await call('start', { kind: 'pair' }); if (r) { runsKey = ''; render(r); } }, anyBusy));
      }
      if (allClips && !queueBusy && !building) actions.append(button(meta.output ? 'Dựng lại video' : 'Dựng video', meta.output ? 'secondary' : 'primary', async () => {
        const r = await call('pairBuild', { storyId: id, voice: { voice: $('pairVoice').value || (meta.voice && meta.voice.voice) || '', tempo: tempo(), volume: Number($('pairVoiceVol').value) }, music, musicVolume: Number($('pairMusicVol').value) });
        if (r) { runsKey = ''; render(r); }
      }, anyBusy));
      if (allClips && !building) actions.append(button(thumbBusy === id ? 'Đang tạo thumbnail…' : meta.thumb ? 'Tạo thumbnail khác' : 'Tạo thumbnail 16:9', 'secondary', async () => {
        thumbBusy = id; runsKey = ''; render(lastState);
        try { const r = await call('pairThumb', { storyId: id }); if (r) toast(`Đã tạo thumbnail 1920×1080 (ảnh ${r.variant}/${r.count}). Bấm lại để đổi sang kiểu khác.`); }
        finally { thumbBusy = ''; runsKey = ''; const st = await call('state'); if (st) render(st); }
      }, anyBusy || Boolean(thumbBusy)));
      if (meta.thumb) actions.append(button('Lưu thumbnail…', 'primary', async () => { const r = await call('pairSave', { storyId: id, thumb: true }); if (r && r.file) toast('Đã lưu thumbnail: ' + r.file); }), button('Mở thumbnail', 'secondary', () => call('pairReveal', { storyId: id, thumb: true })));
      if (meta.output) actions.append(button('Lưu video…', 'primary', async () => { const r = await call('pairSave', { storyId: id }); if (r && r.file) toast('Đã lưu video: ' + r.file); }));
      if (meta.output) actions.append(button('Mở video', 'secondary', () => call('pairReveal', { storyId: id })));
      actions.append(button('Mở thư mục', 'secondary', () => call('openOutput', { kind: 'pair' })));
      if (!building && !writing && (meta.output || allClips) && list.length) extra.push(publishBox(meta, id));
      box.append(top, bar, text, ...extra, actions);
      return box;
    };
    // Một thẻ lỗi không được làm mất cả danh sách: thẻ hỏng được thay bằng thẻ tối thiểu (vẫn tạo thumbnail / dựng / mở thư mục được) kèm lý do.
    const ae = document.activeElement, keep = ae && ae.dataset && ae.dataset.titleFor ? { id: ae.dataset.titleFor, a: ae.selectionStart, b: ae.selectionEnd } : null;
    $('pairRuns').replaceChildren(...runs.map(r => { try { return build(r); } catch (e) { console.error(e); return fallbackCard(r, e); } }));
    if (keep) { const n = [...$('pairRuns').querySelectorAll('input.publishTitle')].find(x => x.dataset.titleFor === keep.id); if (n) { n.focus(); try { n.setSelectionRange(keep.a, keep.b); } catch { /* không có vùng chọn */ } } }
    runsKey = key;
  }

  // ---- khóa theo gói
  function renderLock(s) {
    const ok = Boolean(s.license && s.license.longTerm);
    $('pairLock').hidden = ok; $('pairBody').hidden = !ok;
    $('pairLockText').textContent = 'Bản dùng thử và gói 30 ngày không dùng được tab này. Nâng cấp lên gói Năm hoặc Vĩnh viễn rồi nhập key mới.';
  }
  const createBlocked = s => Boolean(((s && s.pair) || {}).busy || (s && (s.active || s.starting || s.merging || s.packaging)));
  function render(s) {
    if (!s) return;
    lastState = s;
    // Mỗi phần chạy riêng: một phần lỗi (ví dụ danh sách giọng) không được làm mất danh sách video bên dưới.
    for (const step of [() => renderLock(s), () => renderVoice(s), renderCount, () => { $('pairCreate').disabled = createBlocked(s); }, () => renderRuns(s)]) {
      try { step(); } catch (e) { console.error(e); }
    }
  }

  // ---- khởi tạo
  fillSelects();
  $('pairTopic').value = saved.topic || ''; $('pairLeft').value = saved.left || ''; $('pairRight').value = saved.right || '';
  $('pairTempo').value = String(saved.tempo || 1);
  $('pairMusicVol').value = String(saved.musicVol == null ? 0.15 : saved.musicVol);
  $('pairVoiceVol').value = String(saved.voiceVol == null ? 1 : saved.voiceVol);
  const showVolumes = () => { $('pairVoiceVolOut').textContent = Math.round(Number($('pairVoiceVol').value) * 100) + '%'; $('pairMusicVolOut').textContent = Math.round(Number($('pairMusicVol').value) * 100) + '%'; };
  const showTempo = () => { $('pairTempoOut').textContent = tempo().toFixed(2) + '×'; };
  showTempo(); showVolumes(); renderMusic(); renderTopics(); renderCount();
  function remember() { saved = { ...saved, topic: $('pairTopic').value, left: $('pairLeft').value, right: $('pairRight').value, minutes: $('pairMinutes').value, lang: lang(), layout: $('pairLayout').value, tempo: tempo(), music, musicVol: Number($('pairMusicVol').value), voiceVol: Number($('pairVoiceVol').value) }; persist(); }
  for (const id of ['pairMinutes', 'pairLayout']) $(id).onchange = () => { remember(); renderCount(); };
  $('pairTopic').oninput = () => { remember(); renderTopics(); renderCount(); };
  $('pairLeft').oninput = remember; $('pairRight').oninput = remember;
  $('pairTempo').oninput = () => { showTempo(); remember(); };
  $('pairMusicVol').oninput = () => { showVolumes(); remember(); };
  $('pairVoiceVol').oninput = () => { showVolumes(); remember(); };
  $('pairLang').onchange = () => {
    // Chủ đề đang là bản gợi ý của ngôn ngữ cũ (nhãn chưa sửa) thì đổi sang bản của ngôn ngữ mới.
    const was = presetOf($('pairTopic').value);
    if (was) { const old = ['en', 'vi'].map(l => P.topicPreset(was.id, l)).find(p => p.topic === $('pairTopic').value.trim()); const l = $('pairLeft').value.trim(), r = $('pairRight').value.trim(); if (old && (!l || l === old.left) && (!r || r === old.right)) applyPreset(was, lang()); }
    remember(); shownVoiceKey = ''; renderVoice(lastState); renderTopics(); renderCount();
  };
  $('pairVoice').onchange = () => { saved.voices = { ...(saved.voices || {}), [lang()]: $('pairVoice').value }; persist(); };
  $('pairTopic').addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); create(); } });
  $('pairCreate').onclick = create;
  $('pairKey').onclick = () => $('licenseDialog').showModal();
  $('pairSetup').onclick = async () => { const r = await call('storySetupVoice'); if (r) render(r); };
  $('pairMusic').onclick = async () => { const file = await call('chooseMusic'); if (file) { music = file; remember(); renderMusic(); } };
  $('pairMusicClear').onclick = () => { music = ''; remember(); renderMusic(); };
  $('pairListen').onclick = async () => {
    listening = true; renderVoice(lastState);
    try {
      const file = await call('storyListen', { engine: 'edge', voice: $('pairVoice').value, tempo: tempo(), volume: 1, text: SAMPLES[lang()] || SAMPLES.en });
      if (file) { audio = audio || new Audio(); audio.src = localFileUrl(file); audio.play().catch(() => {}); }
    } finally { listening = false; renderVoice(lastState); }
  };
  window.pairUi = { render };
})();
