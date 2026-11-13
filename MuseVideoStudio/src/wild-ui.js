// Giao diện tab «Động vật hoang dã»: gõ tên con vật → mọi bước sau tự chạy ở nền (kịch bản, ảnh và clip, thuyết minh, dựng phim).
// Dùng chung đăng nhập Muse, tài khoản và bộ ghép video với các tab khác, nhưng có việc, thư mục (DongVat) và hàng đợi riêng.
// Phụ thuộc renderer.js (call, toast, localFileUrl) và wild-plan.js.
(function () {
  'use strict';
  const $ = id => document.getElementById(id);
  const P = window.wildPlan;
  const KEY = 'museStudio.wild';
  let saved = {};
  try { saved = JSON.parse(localStorage.getItem(KEY) || '{}') || {}; } catch { saved = {}; }
  const persist = () => { try { localStorage.setItem(KEY, JSON.stringify(saved)); } catch { /* không lưu được thì thôi */ } };
  const base = file => String(file || '').split(/[\\/]/).pop();

  const SAMPLES = {
    vi: 'Giữa thảo nguyên bao la, một đàn cầy mangut bắt đầu ngày mới.', en: 'On the vast savanna, a pack of mongooses begins a new day.',
    es: 'En la inmensa sabana, una manada de mangostas comienza un nuevo día.', fr: 'Dans la vaste savane, une troupe de mangoustes commence une nouvelle journée.',
    de: 'In der weiten Savanne beginnt ein Rudel Mangusten den neuen Tag.', pt: 'Na vasta savana, um bando de mangustos começa um novo dia.',
    id: 'Di sabana yang luas, sekawanan luwak memulai hari baru.', it: 'Nella vasta savana, un branco di manguste inizia un nuovo giorno.',
    ru: 'В бескрайней саванне стая мангустов начинает новый день.', zh: '在辽阔的草原上，一群獴开始了新的一天。', ja: '広大なサバンナで、マングースの群れが新しい一日を始めます。',
    ko: '드넓은 사바나에서 몽구스 무리가 새로운 하루를 시작합니다.', th: 'บนทุ่งหญ้าสะวันนาอันกว้างใหญ่ ฝูงพังพอนเริ่มต้นวันใหม่', ar: 'في السافانا الواسعة، يبدأ قطيع النمس يومًا جديدًا.', hi: 'विशाल सवाना में नेवलों का झुंड एक नए दिन की शुरुआत करता है।'
  };
  let shownVoiceKey = '', runsKey = '', listening = false, audio = null, lastState = null;

  // ---- ô chọn tĩnh
  function fillSelects() {
    const min = $('wildMinutes'), lang = $('wildLang');
    min.replaceChildren(...P.MINUTES.map(m => { const o = document.createElement('option'); o.value = String(m); o.textContent = `${m} phút`; return o; }));
    const order = ['vi', 'en', ...Object.keys(P.LANGS).filter(c => c !== 'vi' && c !== 'en')];
    lang.replaceChildren(...order.map(code => { const o = document.createElement('option'); o.value = code; o.textContent = P.LANGS[code][0].toUpperCase() + P.LANGS[code].slice(1); return o; }));
    min.value = P.MINUTES.includes(Number(saved.minutes)) ? String(saved.minutes) : '20';
    lang.value = P.LANGS[saved.lang] ? saved.lang : 'vi';
  }
  const config = () => P.options({ topic: $('wildTopic').value, signature: $('wildSignature').value, minutes: $('wildMinutes').value, lang: $('wildLang').value, aspect: $('wildAspect').value });
  const tempo = () => Math.min(1.3, Math.max(0.8, Number($('wildTempo').value) || 1));

  function renderCount() {
    const c = config();
    $('wildCount').textContent = `Phim khoảng ${c.minutes} phút = khoảng ${c.scenes} cảnh (mỗi cảnh ${c.seconds} giây) và khoảng ${Math.round(c.scenes * 0.3)} ảnh mốc. Tạo ảnh và clip trên Muse mất nhiều giờ: cứ để máy chạy, tool tự thử lại cảnh lỗi và tự dựng phim khi đủ cảnh.`;
  }

  // ---- giọng thuyết minh (giọng Microsoft miễn phí, cùng bộ làm giọng dùng chung của Muse Studio)
  function voiceChoices(v, lang) {
    const list = [...(v.edgeVoices || [])].filter(x => x.lang === lang || x.lang === '*');
    list.sort((a, b) => (b.lang === lang) - (a.lang === lang));
    return list;
  }
  function renderVoice(s) {
    const v = (s && s.story && s.story.voice) || {}, lang = $('wildLang').value, ready = v.ready || {};
    const choices = voiceChoices(v, lang);
    const key = lang + '|' + choices.map(x => x.id).join(',');
    const select = $('wildVoice');
    if (key !== shownVoiceKey) {
      shownVoiceKey = key;
      select.replaceChildren(...(choices.length ? choices.map(x => { const o = document.createElement('option'); o.value = x.id; o.textContent = `${x.name}${x.lang === lang ? ' ✓' : ''}`; return o; }) : [Object.assign(document.createElement('option'), { value: '', textContent: 'Chưa có giọng cho ngôn ngữ này' })]));
      const remembered = (saved.voices || {})[lang];
      select.value = choices.some(x => x.id === remembered) ? remembered : (choices[0] ? choices[0].id : '');
    }
    select.disabled = !choices.length;
    $('wildListen').disabled = listening || !ready.edge || !choices.length || Boolean(v.setupBusy);
    $('wildListen').textContent = listening ? 'Đang tạo giọng…' : '▶ Nghe thử giọng';
    $('wildSetup').disabled = Boolean(v.setupBusy);
    $('wildSetup').textContent = v.setupBusy ? 'Đang cài giọng…' : ready.edge ? 'Cài lại giọng miễn phí' : 'Cài giọng miễn phí';
    let info;
    if (v.setupBusy) info = v.setupMessage || 'Đang cài giọng…';
    else if (v.setupError) info = v.setupError;
    else if (!ready.edge) info = 'Chưa cài giọng Microsoft. Bấm «Cài giọng miễn phí» (cần Python 3.10–3.13 trên máy và có mạng), đợi cài xong rồi làm phim.';
    else info = `Giọng Microsoft miễn phí (✓ = đúng ngôn ngữ thuyết minh). Cần có mạng lúc đọc. Phim có khoảng 80% cảnh có lời, các cảnh còn lại để nghe tiếng thiên nhiên.`;
    $('wildVoiceInfo').textContent = info;
  }

  // ---- tạo phim
  async function create() {
    const c = config();
    if (!c.topic) { toast('Nhập tên con vật hoặc chủ đề (ví dụ: Cầy mangut và rắn hổ mang).'); $('wildTopic').focus(); return; }
    $('wildCreate').disabled = true;
    try {
      const fresh = await call('wildMake', { topic: c.topic, signature: c.signature, minutes: c.minutes, lang: c.lang, aspect: c.aspect, sfx: $('wildSfx').value, voice: { engine: 'edge', voice: $('wildVoice').value, tempo: tempo(), volume: 1 } });
      if (fresh) { $('wildForm').open = false; toast('Muse đang viết kịch bản phim. Các bước sau tự chạy, bạn không cần bấm gì thêm.'); runsKey = ''; const state = await call('state'); if (state) render(state); }
    } finally { $('wildCreate').disabled = false; }
  }

  // ---- danh sách phim
  function runsOf(s) {
    const ids = new Set(Object.keys((s.wild && s.wild.stories) || {}));
    for (const j of s.jobs || []) if (j.kind === 'wild' && j.storyId) ids.add(j.storyId);
    return [...ids].map(id => ({ id, list: (s.jobs || []).filter(j => j.kind === 'wild' && j.storyId === id), meta: ((s.wild && s.wild.stories) || {})[id] || {} }))
      .sort((a, b) => (b.meta.createdAt || 0) - (a.meta.createdAt || 0));
  }
  const button = (text, cls, onclick, disabled) => { const b = document.createElement('button'); b.type = 'button'; b.className = cls; b.textContent = text; b.disabled = Boolean(disabled); b.onclick = onclick; return b; };

  function renderRuns(s) {
    const info = s.wild || {}, runs = runsOf(s), write = info.write || {}, build = info.build || {};
    const key = JSON.stringify([Boolean(s.active), Boolean(s.starting), Boolean(s.stopping), info.busy, info.phase, info.progress, info.error, info.storyId, write.progress, write.done, write.total, build.progress,
      runs.map(r => [r.id, r.meta.status || '', r.meta.output || '', r.meta.builtAt || 0, r.list.map(j => j.status + (j.stage || ''))])]);
    if (key === runsKey) return;
    runsKey = key;
    const live = runs.find(r => r.list.some(j => ['pending', 'running', 'interrupted', 'failed'].includes(j.status)) || r.meta.status === 'writing');
    const hint = $('wildRunHint');
    if (info.busy && info.phase === 'write') hint.textContent = `Đang viết kịch bản · ${write.done || 0}/${write.total || '?'} cảnh`;
    else if (info.busy && info.phase === 'build') hint.textContent = 'Đang lồng tiếng và dựng phim';
    else if (live && live.list.length) { const clips = live.list.filter(j => j.phase === 'clip'), done = clips.filter(j => j.status === 'completed').length; hint.textContent = `${s.active || s.starting ? 'Đang chạy' : 'Tạm dừng'} · ${done}/${clips.length} cảnh`; }
    hint.hidden = !(live || info.busy); $('wildIdleHint').hidden = Boolean(live || info.busy);
    $('wildRuns').replaceChildren(...runs.map(({ id, list, meta }) => {
      const clips = list.filter(j => j.phase === 'clip'), doneClips = clips.filter(j => j.status === 'completed').length;
      const doneAll = list.filter(j => j.status === 'completed').length;
      const failed = list.some(j => ['failed', 'interrupted'].includes(j.status)), running = list.some(j => j.status === 'running');
      const allClips = clips.length > 0 && clips.every(j => j.status === 'completed');
      const mine = info.storyId === id;
      const writing = mine && info.busy && info.phase === 'write', building = mine && info.busy && info.phase === 'build';
      const err = mine && info.error ? info.error : '';
      const box = document.createElement('div'); box.className = 'restoreRun' + (meta.output ? ' done' : err || failed ? ' error' : '');
      const top = document.createElement('div'); top.className = 'restoreRunTop';
      const title = document.createElement('strong'); title.textContent = meta.name || id;
      const count = document.createElement('span');
      count.textContent = clips.length ? `${doneClips}/${clips.length} cảnh` : meta.status === 'writing' ? 'Đang lập kịch bản' : '';
      top.append(title, count);
      const bar = document.createElement('div'); bar.className = 'autoBar'; bar.setAttribute('role', 'progressbar');
      const fill = document.createElement('i');
      fill.style.width = Math.round(100 * (clips.length ? doneAll / Math.max(1, list.length) : writing ? (write.done || 0) / Math.max(1, write.total || 1) : 0)) + '%'; bar.append(fill);
      const text = document.createElement('p'); text.className = 'restoreRunText';
      if (writing) text.textContent = write.progress || info.progress || 'Muse đang viết kịch bản…';
      else if (building) text.textContent = build.progress || info.progress || 'Đang lồng tiếng và dựng phim…';
      else if (err) { text.textContent = err; text.classList.add('warn'); }
      else if (meta.output) text.textContent = 'Phim hoàn chỉnh: ' + base(meta.output) + '. Xem file ghi chú đăng video (ghi-chu-dang-video.txt) trong cùng thư mục.';
      else if (meta.status === 'writing') { text.textContent = 'Kịch bản chưa viết xong. Bấm «Viết tiếp» để Muse làm tiếp từ chỗ dở (phần đã viết được giữ lại).'; text.classList.add('warn'); }
      else if (failed) { text.textContent = 'Có cảnh dở hoặc lỗi. Tool tự thử lại vài lần; nếu vẫn lỗi hãy sửa rồi bấm «Tạo tiếp»: các cảnh nối tiếp chỉ chạy khi cảnh trước đã xong.'; text.classList.add('warn'); }
      else if (running || s.active || s.starting) text.textContent = 'Đang tạo ảnh và các cảnh nối tiếp nhau trên Muse…';
      else if (allClips) text.textContent = 'Đã đủ cảnh. Bấm «Dựng phim» để lồng tiếng và dựng.';
      else text.textContent = 'Chờ chạy. Bấm «Chạy hàng đợi» ở dưới.';
      const extra = [];
      if (meta.output && !building) { const video = document.createElement('video'); video.className = 'restoreVideo'; video.controls = true; video.preload = 'metadata'; video.src = localFileUrl(meta.output); extra.push(video); }
      const actions = document.createElement('div'); actions.className = 'restoreRunActions';
      const queueBusy = Boolean(s.active || s.starting), anyBusy = queueBusy || Boolean(info.busy) || Boolean(s.merging || s.packaging);
      if (writing) actions.append(button('Dừng viết', 'secondary', async () => { const r = await call('wildCancel'); if (r) { runsKey = ''; render(r); } }));
      else if (queueBusy) actions.append(button('Dừng', 'secondary', async () => { const r = await call('stop'); if (r) { runsKey = ''; render(r); } }, s.stopping));
      else if (meta.status === 'writing' && !info.busy) actions.append(button('Viết tiếp', 'primary', async () => { const r = await call('wildMake', { resumeId: id }); if (r) { runsKey = ''; const st = await call('state'); if (st) render(st); } }, anyBusy));
      else if (list.some(j => ['pending', 'interrupted', 'failed'].includes(j.status)) && !meta.output) {
        const started = list.some(j => j.startedAt || ['interrupted', 'failed', 'completed'].includes(j.status));
        actions.append(button(started ? 'Tạo tiếp' : 'Chạy', 'primary', async () => { const r = await call('start', { kind: 'wild' }); if (r) { runsKey = ''; render(r); } }, anyBusy));
      }
      if (allClips && !queueBusy) actions.append(button(meta.output ? 'Dựng lại phim' : 'Dựng phim', meta.output ? 'secondary' : 'primary', async () => {
        const r = await call('wildBuild', { storyId: id, sfx: $('wildSfx').value, voice: { engine: 'edge', voice: $('wildVoice').value || (meta.voice && meta.voice.voice) || '', tempo: tempo(), volume: 1 } });
        if (r) { runsKey = ''; render(r); }
      }, anyBusy));
      if (meta.output) actions.append(button('Lưu video…', 'primary', async () => { const r = await call('wildSave', { storyId: id }); if (r && r.file) toast('Đã lưu video: ' + r.file); }));
      if (meta.output) actions.append(button('Mở video', 'secondary', () => call('wildReveal', { storyId: id })));
      actions.append(button('Mở thư mục', 'secondary', () => call('openOutput', { kind: 'wild' })));
      box.append(top, bar, text, ...extra, actions);
      return box;
    }));
  }

  // ---- khóa theo gói
  function renderLock(s) {
    const ok = Boolean(s.license && s.license.longTerm);
    $('wildLock').hidden = ok; $('wildBody').hidden = !ok;
    $('wildLockText').textContent = 'Bản dùng thử và gói 30 ngày không dùng được tab này. Nâng cấp lên gói Năm hoặc Vĩnh viễn rồi nhập key mới.';
  }

  function render(s) {
    if (!s) return;
    lastState = s;
    renderLock(s);
    renderVoice(s);
    renderCount();
    const info = s.wild || {};
    $('wildCreate').disabled = Boolean(info.busy || s.active || s.starting || s.merging || s.packaging);
    renderRuns(s);
  }

  // ---- khởi tạo
  fillSelects();
  $('wildTopic').value = saved.topic || '';
  $('wildSignature').value = saved.signature || '';
  $('wildAspect').value = P.ASPECTS.includes(saved.aspect) ? saved.aspect : '16:9';
  $('wildSfx').value = saved.sfx === 'low' ? 'low' : 'mid';
  $('wildTempo').value = String(saved.tempo || 1);
  const showTempo = () => { $('wildTempoOut').textContent = tempo().toFixed(2) + '×'; };
  showTempo();
  renderCount();
  const remember = () => { saved = { ...saved, topic: $('wildTopic').value, signature: $('wildSignature').value, minutes: $('wildMinutes').value, lang: $('wildLang').value, aspect: $('wildAspect').value, sfx: $('wildSfx').value, tempo: tempo() }; persist(); };
  for (const id of ['wildMinutes', 'wildAspect', 'wildSfx']) $(id).onchange = () => { remember(); renderCount(); };
  $('wildTopic').oninput = () => { remember(); renderCount(); };
  $('wildSignature').oninput = remember;
  $('wildTempo').oninput = () => { showTempo(); remember(); };
  $('wildLang').onchange = () => { remember(); shownVoiceKey = ''; renderVoice(lastState); renderCount(); };
  $('wildVoice').onchange = () => { saved.voices = { ...(saved.voices || {}), [$('wildLang').value]: $('wildVoice').value }; persist(); };
  $('wildTopic').addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); create(); } });
  $('wildCreate').onclick = create;
  $('wildKey').onclick = () => $('licenseDialog').showModal();
  $('wildSetup').onclick = async () => { const r = await call('storySetupVoice'); if (r) render(r); };
  $('wildListen').onclick = async () => {
    listening = true; renderVoice(lastState);
    try {
      const file = await call('storyListen', { engine: 'edge', voice: $('wildVoice').value, tempo: tempo(), volume: 1, text: SAMPLES[$('wildLang').value] || SAMPLES.en });
      if (file) { audio = audio || new Audio(); audio.src = localFileUrl(file); audio.play().catch(() => {}); }
    } finally { listening = false; renderVoice(lastState); }
  };
  window.wildUi = { render };
})();
