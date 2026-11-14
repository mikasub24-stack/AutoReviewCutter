// Giao diện tab «Kể chuyện». Dùng chung hàng đợi, đăng nhập và tài khoản với hai tab kia.
// Phụ thuộc renderer.js (call, toast, render, state, el, localFileUrl) và story-plan.js.
(function () {
  'use strict';
  const $ = id => document.getElementById(id);
  const KEY = 'museStudio.story';
  const AD = window.storyPlan;
  // Ô chọn của chế độ quảng cáo phải có đủ lựa chọn trước khi nạp giá trị đã lưu.
  $('adTone').replaceChildren(...AD.AD_TONE.map(t => { const o = el('option', '', t.label); o.value = t.id; return o; }));
  $('adLength').replaceChildren(...AD.AD_LENGTHS.map(n => { const o = el('option', '', n + ' giây'); o.value = String(n); return o; }));
  $('tipMinutes').replaceChildren(...AD.TIP_MINUTES.map(n => { const o = el('option', '', n + ' phút'); o.value = String(n); return o; }));
  $('tipSecs').replaceChildren(...AD.TIP_SECS.map(n => { const o = el('option', '', n + ' giây'); o.value = String(n); return o; }));
  /* Phông phụ đề: chỉ liệt kê phông CÓ trên máy (dò bằng đo độ rộng chữ), cộng phông bạn tự thêm từ file. Phông đã lưu luôn được giữ trong danh sách. */
  const SUB_FONT_GROUPS = [
    ['Phổ biến', ['Arial', 'Segoe UI', 'Segoe UI Semibold', 'Tahoma', 'Verdana', 'Trebuchet MS', 'Calibri', 'Candara', 'Corbel', 'Century Gothic', 'Franklin Gothic Medium', 'Bahnschrift', 'Lucida Sans Unicode', 'Microsoft Sans Serif', 'Helvetica', 'Roboto', 'Open Sans', 'Noto Sans']],
    ['Chữ đậm, làm tiêu đề', ['Impact', 'Arial Black', 'Segoe UI Black', 'Arial Narrow', 'Haettenschweiler', 'Franklin Gothic Heavy', 'Rockwell Extra Bold']],
    ['Có chân (sách, điện ảnh)', ['Times New Roman', 'Georgia', 'Cambria', 'Constantia', 'Palatino Linotype', 'Book Antiqua', 'Sitka Text', 'Garamond', 'Bookman Old Style', 'Baskerville Old Face']],
    ['Viết tay, trang trí', ['Comic Sans MS', 'Segoe Print', 'Segoe Script', 'Ink Free', 'Lucida Handwriting', 'Brush Script MT', 'Gabriola', 'Mistral', 'Kristen ITC']],
    ['Chữ đơn cách', ['Consolas', 'Courier New', 'Lucida Console']]
  ];
  const fontProbe = document.createElement('canvas').getContext('2d');
  const fontInstalled = name => {
    const text = 'mmmmmmmmmmlli ẫềợ 0123';
    return ['monospace', 'serif', 'sans-serif'].some(base => {
      fontProbe.font = `72px ${base}`; const w0 = fontProbe.measureText(text).width;
      fontProbe.font = `72px "${name}", ${base}`; return fontProbe.measureText(text).width !== w0;
    });
  };
  const userFonts = new Set();
  function addFontOption(group, name) {
    const select = $('subFont');
    if ([...select.options].some(o => o.value === name)) return;
    let box = [...select.children].find(g => g.tagName === 'OPTGROUP' && g.label === group);
    if (!box) { box = document.createElement('optgroup'); box.label = group; select.append(box); }
    const option = el('option', '', name); option.value = name; box.append(option);
  }
  function buildFontOptions(keep) {
    $('subFont').replaceChildren();
    for (const [group, names] of SUB_FONT_GROUPS) for (const name of names) if (fontInstalled(name) || name === 'Arial') addFontOption(group, name);
    for (const name of userFonts) addFontOption('Phông của bạn', name);
    if (keep && ![...$('subFont').options].some(o => o.value === keep)) addFontOption('Đã lưu', keep);
  }
  try { buildFontOptions((JSON.parse(localStorage.getItem('museStudio.story') || '{}') || {}).subFont); } catch { buildFontOptions(''); }
  const FIELDS = {
    tipMotion: ['tipMotion', 'gentle'], tipPrompt: ['tipPrompt', 'en'],
    adProduct: ['adProduct', ''], adPoints: ['adPoints', ''], adAudience: ['adAudience', ''], adOffer: ['adOffer', ''], adCta: ['adCta', ''],
    adTone: ['adTone', AD.AD_TONE[0].id], adLength: ['adLength', '30'],
    storyEngine: ['engine', 'none'], storyTempo: ['tempo', '1'], storyVol: ['voiceVol', '100'], subFont: ['subFont', 'Arial'], subSize: ['subSize', '54'], subColor: ['subColor', '#ffffff'],
    subOutline: ['subOutline', '#000000'], subPos: ['subPos', 'bottom'], storySfx: ['sfxMode', 'off'], storyName: ['name', ''],
    subOutW: ['subOutW', '16'], subShadow: ['subShadow', 'none'], subGlow: ['subGlow', '#00d0ff'], subBoxColor: ['subBoxColor', '#000000'], subBoxOp: ['subBoxOp', '55']
  };
  const CHECKS = { subOn: ['subOn', true], subSrt: ['subSrt', false], subBox: ['subBox', false], autoExport: ['autoExport', true], subBold: ['subBold', true], subItalic: ['subItalic', false], subCaps: ['subCaps', false] };
  let saved = {}, scenes = [], refs = [], analyzing = false, writing = false, exporting = false, listening = false, voiceSignature = '', windowsAsked = false, lastStory = '', lastVideo = '';
  try { saved = JSON.parse(localStorage.getItem(KEY) || '{}') || {}; } catch { saved = {}; }
  const persist = () => { try { localStorage.setItem(KEY, JSON.stringify(saved)); } catch { /* không lưu được thì bỏ qua */ } };

  for (const [id, [key, fallback]] of Object.entries(FIELDS)) {
    if (saved[key] !== undefined && saved[key] !== null) $(id).value = saved[key]; else $(id).value = fallback;
    $(id).addEventListener('input', () => { saved[key] = $(id).value; persist(); if (id.startsWith('sub')) drawPreview(); });
    $(id).addEventListener('change', () => { saved[key] = $(id).value; persist(); if (id === 'storyEngine') { renderVoice(true); } });
  }
  for (const [id, [key, fallback]] of Object.entries(CHECKS)) {
    $(id).checked = saved[key] === undefined ? fallback : Boolean(saved[key]);
    $(id).addEventListener('change', () => { saved[key] = $(id).checked; persist(); drawPreview(); });
  }

  /* ---------- chế độ: kể chuyện / quảng cáo sản phẩm ---------- */
  let mode = ['ad', 'tip', 'plant', 'hist'].includes(saved.mode) ? saved.mode : 'story';
  /* Mỗi chế độ (tab) có phần làm việc riêng: kịch bản, tỉ lệ, nhân vật, phong cách (lưu lại), cùng cảnh đã chia, chỗ dừng, ảnh tham chiếu
     (giữ trong lúc mở app). Đổi tab không xóa gì và không mang chữ của tab này sang tab kia. */
  const MODES = ['story', 'ad', 'tip', 'plant', 'hist'];
  const MODE_NAME = { story: 'Kể chuyện', ad: 'Quảng cáo sản phẩm', tip: 'Mẹo vặt', plant: 'Cây trồng phát triển', hist: 'Lịch sử minh họa' };
  const PER_MODE = { storyScript: ['script', ''], storyAspect: ['aspect', '16:9'], storyCharacter: ['character', ''], storyForm: ['form', ''], storyStyle: ['style', ''] };
  if (!saved.modes || typeof saved.modes !== 'object') {   // bản cũ dùng chung: chuyển sang từng chế độ
    saved.modes = {};
    for (const m of MODES) saved.modes[m] = { aspect: saved.aspect, character: saved.character, form: saved.form, style: saved.style, ...(m === mode ? { script: saved.script } : {}) };
  }
  const modeVals = m => saved.modes[m] || (saved.modes[m] = {});
  function loadModeFields() { const v = modeVals(mode); for (const [id, [key, fallback]] of Object.entries(PER_MODE)) $(id).value = v[key] ?? fallback; }
  for (const [id, [key]] of Object.entries(PER_MODE)) for (const event of ['input', 'change']) $(id).addEventListener(event, () => { modeVals(mode)[key] = $(id).value; persist(); });
  loadModeFields();
  function setScript(owner, text) { modeVals(owner).script = text; persist(); if (owner === mode) $('storyScript').value = text; }
  const spaces = {};   // phần làm việc của các chế độ đang không mở: { scenes, resume, understood, autoSnap, refs, info }
  // Muse chỉ làm một việc một lúc (chung một cuộc chat): chế độ nào đã bắt đầu thì chế độ đó mới thấy tiến độ và nút Dừng.
  let runMode = typeof saved.runMode === 'string' ? saved.runMode : '', busyHint = false;
  const setRun = m => { runMode = m; if (m) saved.runMode = m; else delete saved.runMode; persist(); };
  let adCamera = (Array.isArray(saved.adCamera) ? saved.adCamera : []).filter(id => AD.AD_CAMERA.some(c => c.id === id)).slice(0, AD.AD_MAX_CAMERA);
  let adLook = AD.AD_LOOK.some(l => l.id === saved.adLook) ? saved.adLook : '';
  // Luôn có một mẫu đang chọn (mặc định mẫu đầu tiên) để thả ảnh vào là ra cảnh ngay.
  let adTemplate = (AD.AD_TEMPLATES.find(t => t.id === saved.adTemplate) || AD.AD_TEMPLATES[0]).id;
  if (!AD.AD_TEMPLATES.some(t => t.id === saved.adTemplate)) {
    const t = AD.AD_TEMPLATES[0];
    adCamera = [...t.camera]; adLook = t.look; $('adTone').value = t.tone; $('adLength').value = String(t.length);
    Object.assign(saved, { adTemplate, adTone: t.tone, adLength: String(t.length), adCamera, adLook }); persist();
  }
  const isAd = () => mode === 'ad';
  // «Cây trồng phát triển» là một kiểu của Mẹo vặt: cùng quy trình ảnh → clip, khác ở cách Muse viết và chia cảnh.
  // «Lịch sử minh họa» cũng cùng quy trình: Muse vẽ một tranh hoạt hình phẳng cho mỗi cảnh rồi cho tranh chuyển động nhẹ thành clip.
  const isTip = () => mode === 'tip' || mode === 'plant' || mode === 'hist';
  const isPlant = () => mode === 'plant';
  const isHist = () => mode === 'hist';
  const TIP_MODES = ['tip', 'plant', 'hist'];
  const KIND_OF = { tip: 'tip', plant: 'plant', hist: 'history' };   // giá trị tipKind gửi cho Muse
  const idleIndex = m => ({ story: 0, ad: 1, tip: 2, plant: 3, hist: 4 })[m] ?? 0;
  // Tiêu đề, độ dài và số giây của «Mẹo vặt» và «Cây trồng phát triển» lưu riêng (cây trồng: 7–10 phút, mỗi ảnh 10 giây).
  // Cây trồng mặc định viết lời đọc, phụ đề và prompt bằng tiếng Anh (nhập tên cây tiếng Việt hay tiếng Anh đều được); các chế độ khác mặc định tiếng Việt.
  const KIND_DEFAULTS = { tip: { tipTitle: '', tipMinutes: '2', tipSecs: '8', tipLanguage: 'vi', tipLook: 'cartoon' }, plant: { tipTitle: '', tipMinutes: '8', tipSecs: '10', tipLanguage: 'en', tipLook: 'cartoon' }, hist: { tipTitle: '', tipMinutes: '3', tipSecs: '8', tipLanguage: 'vi', tipLook: 'cartoon' } };
  const KIND_IDS = ['tipTitle', 'tipMinutes', 'tipSecs', 'tipLanguage', 'tipLook'];
  const kindKey = (id, m) => (m === 'plant' || m === 'hist' ? m + id[0].toUpperCase() + id.slice(1) : id);
  function loadKindFields() {
    const plant = isPlant(), def = KIND_DEFAULTS[TIP_MODES.includes(mode) ? mode : 'tip'], key = TIP_MODES.includes(mode) ? mode : 'tip';
    $('tipMinutes').replaceChildren(...(plant ? AD.PLANT_MINUTES : isHist() ? AD.HIST_MINUTES : AD.TIP_MINUTES).map(n => { const o = el('option', '', n + ' phút'); o.value = String(n); return o; }));
    for (const id of KIND_IDS) {
      const value = saved[kindKey(id, key)];
      $(id).value = value !== undefined && value !== null ? value : def[id];
      if (id !== 'tipTitle' && !$(id).value) $(id).value = def[id];   // giá trị đã lưu không còn trong danh sách (đổi chế độ) thì dùng mặc định
    }
  }
  for (const id of KIND_IDS) for (const event of ['input', 'change']) $(id).addEventListener(event, () => { saved[kindKey(id, TIP_MODES.includes(mode) ? mode : 'tip')] = $(id).value; persist(); });
  const adFields = () => ({ product: $('adProduct').value, points: $('adPoints').value, audience: $('adAudience').value, offer: $('adOffer').value, cta: $('adCta').value, tone: $('adTone').value, length: Number($('adLength').value), camera: [...adCamera], look: adLook, template: adTemplate });
  // Mẹo vặt: mỗi ảnh/clip dài tối đa «Mỗi ảnh chuyển động» giây (ô chọn); các chế độ khác dùng mức tối đa của Muse.
  const capSeconds = () => (isTip() ? Number($('tipSecs').value) || plan().MAX_SECONDS : plan().MAX_SECONDS);
  const tipFields = () => ({ tipTitle: $('tipTitle').value, tipMinutes: Number($('tipMinutes').value), tipLanguage: $('tipLanguage').value, tipMotion: $('tipMotion').value, tipPrompt: $('tipPrompt').value, tipKind: KIND_OF[mode] || 'tip', ...(isHist() ? { histLook: $('tipLook').value } : {}) });
  const options = () => ({ seconds: capSeconds(), reference: refs.length > 0 && !isTip(), aspect: $('storyAspect').value, style: $('storyStyle').value, character: $('storyCharacter').value, form: $('storyForm').value, ...(isAd() ? { ad: adFields() } : {}), ...(isTip() ? { tip: true, ...tipFields() } : {}) });
  const plan = () => window.storyPlan;
  const autoOn = () => isPlant() && $('tipAuto').checked;   // Cây trồng: gõ tên cây, bấm một nút là chạy hết đến khi xuất MP4
  const dims = aspect => aspect === '9:16' ? [1080, 1920] : aspect === '1:1' ? [1080, 1080] : [1920, 1080];
  const baseName = file => String(file || '').split(/[\\/]/).pop();

  /* ---------- 1. kịch bản → cảnh ---------- */
  let warnBoxes = [], checkTimer = 0;
  // Soát lại ngay khi sửa: cảnh báo từng cảnh (lời quá dài, thoại, nhảy thời gian…) và độ khớp với kịch bản gốc.
  function refreshChecks() {
    clearTimeout(checkTimer);
    checkTimer = setTimeout(() => {
      let warnings = [];
      try { warnings = plan().lintScenes(scenes, options()); } catch { warnings = []; }
      let flagged = 0;
      warnBoxes.forEach((box, i) => {
        const list = warnings[i] || [];
        box.hidden = !list.length; box.replaceChildren(...list.map(w => el('div', '', '⚠ ' + w)));
        if (list.length) {
          flagged++;
          const fold = box.closest('.draftRow')?.querySelector('.sceneMore');
          if (fold && !fold.dataset.shown) { fold.open = true; fold.dataset.shown = '1'; }   // cảnh có cảnh báo thì mở sẵn prompt để thấy chỗ cần sửa
        }
      });
      const check = $('storyCheck'), script = $('storyScript').value;
      let result = null;
      if (scenes.length && script.trim() && scenes.some(s => String(s.voiceover || '').trim())) { try { result = plan().checkAgainstScript(script, scenes); } catch { result = null; } }
      const lines = [];
      if (result && result.checked) lines.push(result.ok ? `✓ Lời các cảnh khớp ${Math.round(result.coverage * 100)}% kịch bản gốc, đủ và đúng thứ tự.` : '⚠ Chưa khớp kịch bản gốc:');
      if (result && !result.ok) lines.push(...result.issues.map(x => '• ' + x));
      if (flagged) lines.push(`⚠ ${flagged} cảnh cần xem lại trước khi tạo (mỗi lượt tạo tốn credit Muse).`);
      const sample = scenes.map((s, i) => s.offline ? i + 1 : 0).filter(Boolean);
      if (sample.length) lines.push(`⚠ ${sample.length} cảnh đang dùng prompt mẫu (chưa qua Muse): cảnh ${sample.slice(0, 12).join(', ')}${sample.length > 12 ? '…' : ''}. Bấm «Phân tích bằng Muse» để Muse viết prompt hình đúng truyện, hoặc tự sửa prompt.`);
      check.hidden = !lines.length; check.replaceChildren(...lines.map(line => el('div', '', line)));
      check.classList.toggle('bad', Boolean((result && !result.ok) || flagged || sample.length));
      if (result && !result.ok) { const fix = el('button', 'secondary', 'Sửa lời theo kịch bản gốc'); fix.onclick = alignScript; check.append(fix); }
    }, 250);
  }
  function alignScript() {
    try {
      scenes = plan().alignToScript($('storyScript').value, scenes, options());
      renderScenes();
      toast('Đã sửa lời các cảnh về đúng nguyên văn kịch bản. Câu bị bỏ sót thành cảnh mới.');
    } catch (e) { toast(e.message); }
  }
  // Giây mỗi cảnh tự tính theo lời kể của cảnh đó (3–10 giây), không nhập tay.
  // Cảnh quay quảng cáo từ ảnh (không có lời đọc) giữ số giây cố định của mẫu; có lời đọc thì tính theo lời.
  const secondsOf = scene => (scene.fixedSeconds && !String(scene.voiceover || scene.source || '').trim()) ? scene.fixedSeconds : plan().sceneSeconds(scene.voiceover || scene.source || '', capSeconds());
  const headingText = (scene, index) => `${scene.title || 'Cảnh ' + (index + 1)} · ${secondsOf(scene)} giây`;
  // Muse đã hiểu bài thế nào (tóm tắt, cách minh họa, nhân vật/vai, bối cảnh): hiện để người dùng thấy ngay chỗ Muse hiểu sai.
  let understood = null;   // { summary, approach, cast, setting }
  function renderUnderstanding() {
    const box = $('storyUnderstand'), rows = [['Tóm tắt', understood?.summary], ['Cách minh họa', understood?.approach], [isHist() ? 'Phong cách vẽ và nhân vật cố định' : isTip() ? 'Nơi làm và đồ vật cố định' : 'Nhân vật', understood?.cast], ['Bối cảnh', understood?.setting]].filter(r => r[1]);
    box.hidden = !rows.length || !scenes.length;
    $('storyUnderstandBody').replaceChildren(...rows.flatMap(([label, text]) => [el('h4', '', label), el('p', '', text)]));
  }
  function renderScenes() {
    const box = $('storyScenes');
    renderUnderstanding();
    box.replaceChildren(); warnBoxes = [];
    scenes.forEach((scene, index) => {
      const row = el('div', 'draftRow'), body = el('div', 'draftContent');
      const heading = el('strong', '', headingText(scene, index));
      const tag = el('span', 'storyTag', 'prompt mẫu'); tag.hidden = !scene.offline; tag.title = 'Prompt này do tool ghép từ lời kể, chưa qua Muse';
      body.append(heading, tag);
      const warn = el('div', 'storyWarn'); warn.hidden = true; warnBoxes[index] = warn;
      const voice = el('textarea'); voice.value = scene.voiceover || ''; voice.placeholder = 'Lời đọc của cảnh này'; voice.oninput = () => { scene.voiceover = voice.value; scene.source = voice.value; scene.durationSeconds = secondsOf(scene); heading.textContent = headingText(scene, index); refreshChecks(); };
      const prompt = el('textarea'); prompt.value = scene.prompt || ''; prompt.placeholder = isTip() ? 'Prompt chuyển động gửi Muse' : 'Prompt gửi Muse'; prompt.oninput = () => { scene.prompt = prompt.value; if (scene.offline) { scene.offline = false; tag.hidden = true; } refreshChecks(); };
      // Mẹo vặt: mỗi bước có thêm prompt ẢNH (khung hình đầu); clip được làm từ chính ảnh đó.
      const image = el('textarea'); image.value = scene.image || ''; image.placeholder = 'Prompt ảnh gửi Muse'; image.oninput = () => { scene.image = image.value; if (scene.offline) { scene.offline = false; tag.hidden = true; } refreshChecks(); };
      const tools = el('div', 'draftTools'), remove = el('button', 'secondary', 'Xóa cảnh');
      remove.onclick = () => { scenes.splice(index, 1); scenes.forEach((s, i) => { s.title = 'Cảnh ' + (i + 1); }); renderScenes(); };
      tools.append(remove);
      // Mỗi cảnh chỉ hiện lời đọc cho gọn; prompt ảnh và chuyển động nằm trong mục thu gọn (tự mở khi cảnh có cảnh báo, và luôn mở ở chế độ quảng cáo vì không có lời đọc).
      const more = el('details', 'more sceneMore'); more.open = isAd();
      more.append(el('summary', '', isTip() ? 'Prompt ảnh và chuyển động (sửa nếu cần)' : 'Prompt gửi Muse (sửa nếu cần)'), ...(isTip() ? [el('label', 'storyLabel', 'Prompt ảnh (khung hình đầu)'), image] : []), el('label', 'storyLabel', isTip() ? 'Prompt chuyển động (làm từ ảnh)' : 'Prompt gửi Muse'), prompt);
      body.append(el('label', 'storyLabel', 'Lời đọc'), voice, more, warn, tools);
      row.append(body); box.append(row);
    });
    $('storySceneCount').textContent = scenes.length ? `${scenes.length} cảnh` : '';
    $('adQuick').textContent = scenes.length ? 'Tạo lại cảnh' : 'Tạo quảng cáo từ ảnh';
    $('adQuick').className = scenes.length ? 'secondary' : 'primary';
    renderAnalyze();
    $('storyCommit').disabled = $('storyCreate').disabled = !scenes.length;
    refreshChecks();
  }
  async function copyInstruction() {
    const value = $('storyInstruction').value;
    try { await navigator.clipboard.writeText(value); toast('Đã sao chép yêu cầu. Dán vào khung chat Muse.'); }
    catch { $('storyInstruction').select(); toast('Nhấn Ctrl+C để sao chép yêu cầu rồi dán vào chat Muse.'); }
  }
  // Lượt phân tích dừng giữa chừng (Muse lỗi/không trả lời): giữ các cảnh Muse đã chia, nhớ chỗ dừng và nhân vật đã chốt để làm tiếp.
  // App không tự chia thay Muse.
  let resume = null;   // { script, from, cast, understanding }
  const exportWatch = new Set(), exportDone = new Set(), exportAspect = {};   // tự xuất MP4: lượt đã thấy chạy dở / đã xuất rồi / khung hình lúc tạo
  const exportedOk = new Set();   // truyện đã xuất MP4 THÀNH CÔNG trong lần mở app này (exportDone chỉ nghĩa là «đã xử lý», kể cả khi tắt tự xuất)
  let autoScript = '', pendingExport = null, autoRun = null, exportOk = false, autoWhy = '';   // autoRun: { phase: write|split|make|export|done|stopped|error, id, pct, msg, why }
  // Chạy tự động (Cây trồng): autoScript = bài Muse vừa viết; pendingExport = lượt đang chờ xuất MP4 { id, aspect, armed, since }.
  const canResume = () => Boolean(resume && scenes.length && $('storyScript').value === resume.script);
  async function analyze(fromStart, ctx = null) {
    if (analyzing) return;
    // `ctx` (từ «Muse viết … và chia cảnh») giữ đúng kịch bản và tùy chọn của chế độ đã bắt đầu, kể cả khi bạn đã sang tab khác.
    const owner = ctx?.owner || mode, ownerTip = TIP_MODES.includes(owner);
    const script = ctx ? ctx.script : $('storyScript').value;
    const opts = ctx ? ctx.opts : options();
    if (!script.trim()) return toast(owner === 'ad' ? 'Chưa có lời quảng cáo. Bấm «Muse viết lời quảng cáo» hoặc dán lời vào ô.' : 'Dán câu chuyện trước.');
    if (!ctx && fromStart && scenes.length && !confirm('Phân tích lại từ đầu sẽ thay toàn bộ các cảnh đang có. Tiếp tục?')) return;
    const resuming = !ctx && !fromStart && canResume(), before = resuming ? scenes : [];
    const starter = !runMode; if (starter) setRun(owner);
    analyzing = true; renderAnalyze();
    try {
      const result = await callAuto('storyAnalyze', { script, ...opts, ...(resuming ? { resume: { from: resume.from, cast: resume.cast, understanding: resume.understanding } } : {}) });
      if (result?.scenes?.length) {
        const list = [...before, ...result.scenes].map((s, i) => ({ ...s, title: `Cảnh ${i + 1}` }));
        const u = result.understanding || (resuming ? resume.understanding : null);
        const know = u || result.cast ? { summary: u?.summary || '', approach: u?.approach || '', setting: u?.setting || '', cast: result.cast || (resuming ? resume.cast : '') || '' } : null;
        const stop = result.incomplete; if (stop) autoWhy = stop.message || '';
        const next = stop ? { script, from: stop.from, cast: result.cast || (resuming ? resume.cast : ''), understanding: u || null } : null;
        const info = stop
          ? `Muse đã chia ${list.length} cảnh, dừng ở câu ${stop.from}/${stop.total}. ${stop.message} Bấm «Phân tích tiếp» để Muse làm tiếp từ đó (giữ nguyên các cảnh đã có).`
          : `Muse đã chia ${list.length} cảnh.${result.notes?.length ? ' ' + result.notes.join(' ') : ''} ${ownerTip ? 'Xem lại lời đọc, prompt ảnh và prompt chuyển động, rồi bấm Tạo ảnh + clip.' : 'Xem lại lời đọc và prompt, rồi bấm Tạo clip.'}`;
        if (owner === mode) {
          scenes = list; understood = know; renderScenes(); resume = next;
          $('storyInfo').textContent = info;
          if (stop) toast(`Muse dừng ở câu ${stop.from}/${stop.total}. Bấm «Phân tích tiếp» để làm tiếp.`);
        } else {
          spaces[owner] = { ...spaces[owner], scenes: list, understood: know, resume: next, info };
          toast(`Muse đã xong ở tab «${MODE_NAME[owner]}».`);
        }
      }
    } finally { analyzing = false; if (starter) setRun(''); renderAnalyze(); }
  }
  // Tiến độ lấy từ tiến trình chính (state.story.analyze) nên vẫn đúng khi tải lại giao diện.
  function renderAnalyze() {
    const a = state?.story?.analyze || {}, busy = analyzing || writing || Boolean(a.busy);
    if (!busy && runMode && !analyzing && !writing) setRun('');
    const other = busy && Boolean(runMode) && runMode !== mode, mine = busy && !other;   // other = Muse đang bận ở tab khác
    const writingNow = mine && (writing || (a.busy && a.kind === 'write'));
    $('storyAnalyze').disabled = busy; $('storyAnalyzeAgain').hidden = busy || !canResume(); $('adWrite').disabled = busy; $('tipWrite').disabled = busy || (isPlant() && autoLive()); $('adQuick').disabled = mine; $('storyAnalyzeStop').hidden = !mine;
    $('storyAnalyze').textContent = mine && !writingNow ? 'Muse đang phân tích…' : canResume() ? 'Phân tích tiếp' : 'Phân tích bằng Muse';
    $('adWrite').textContent = writingNow ? 'Muse đang viết…' : 'Muse viết lời quảng cáo';
    const again = isPlant() && autoOn() && !autoLive() && !busy ? autoResume() : null;   // đang dừng giữa chừng: nút thành «Chạy tiếp»
    $('autoRestart').hidden = !again;
    $('tipWrite').textContent = isPlant() && autoLive() ? 'Đang chạy tự động…' : again ? (again.step === 'make' ? `▶ Chạy tiếp tạo ảnh + clip (còn ${again.left} cảnh)` : again.step === 'export' ? '▶ Chạy tiếp: xuất MP4' : '▶ Chạy tiếp: chia cảnh') : writingNow ? (isPlant() || isHist() ? 'Muse đang viết bài…' : 'Muse đang viết mẹo…') : mine ? 'Muse đang chia cảnh…' : isHist() ? 'Muse viết bài lịch sử và chia cảnh' : isPlant() ? (autoOn() ? '▶ Làm tự động: viết, vẽ, xuất MP4' : 'Muse viết bài và chia cảnh') : 'Muse viết mẹo và chia cảnh';
    if (mine && a.progress) $('storyInfo').textContent = a.progress;
    else if (other) { $('storyInfo').textContent = `Muse đang bận ở tab «${MODE_NAME[runMode]}». Chờ xong rồi dùng tab này.`; busyHint = true; }
    else if (busyHint) { busyHint = false; $('storyInfo').textContent = spaces[mode]?.info || IDLE_INFO[idleIndex(mode)]; }   // Muse đã rảnh: bỏ dòng «đang bận»
    renderAutoRun();
  }
  // Quảng cáo nhanh từ ảnh: cảnh quay dựng sẵn theo mẫu, không cần lời đọc hay Muse.
  // Cảnh tự tạo được ghi dấu (autoSnap); đổi ảnh/mẫu/độ dài… thì tạo lại ngay, trừ khi người dùng đã sửa hoặc xóa cảnh.
  let autoSnap = '', autoTimer = 0;
  const sceneSig = () => JSON.stringify(scenes.map(s => [s.title, s.voiceover || '', s.prompt || '']));
  const pristine = () => !scenes.length || sceneSig() === autoSnap;
  function buildAd(manual) {
    if (!refs.length) return toast('Chọn ảnh sản phẩm trước.');
    try {
      scenes = plan().planAdShots(options());
      autoSnap = sceneSig();
      renderScenes();
      const template = plan().AD_TEMPLATES.find(t => t.id === adTemplate);
      $('storyInfo').textContent = `Đã tạo ${scenes.length} cảnh quảng cáo từ ảnh sản phẩm (${template ? 'mẫu «' + template.label + '»' : 'mẫu chung'}). Không có lời đọc nên video giữ tiếng động của clip. Xem lại prompt rồi bấm Tạo clip.`;
      if (manual) $('storyScenes').scrollIntoView({ block: 'start', behavior: 'smooth' });
    } catch (e) { toast(e.message); }
  }
  function quickAd() {
    if (!refs.length) return toast('Chọn ảnh sản phẩm trước.');
    if (!pristine() && !confirm('Tạo lại sẽ thay các cảnh đang có, kể cả phần bạn đã sửa. Tiếp tục?')) return;
    clearTimeout(autoTimer);
    buildAd(true);
  }
  function autoAd(delay = 250) {
    clearTimeout(autoTimer);
    if (!isAd() || !refs.length) return;
    autoTimer = setTimeout(() => {
      if (!isAd() || !refs.length || ((analyzing || writing) && (!runMode || runMode === mode))) return;
      if (!pristine()) { $('storyInfo').textContent = 'Đã đổi tùy chọn. Bấm «Tạo lại cảnh» để áp dụng (sẽ thay các cảnh đang có).'; return; }
      buildAd(false);
    }, delay);
  }
  // Đổi ảnh sản phẩm: tạo lại cảnh; bỏ ảnh thì xóa các cảnh tự tạo chưa sửa.
  // Kể chuyện thường: câu khóa hình dạng chỉ được gắn lúc chia cảnh. Đổi ảnh nhân vật / hình dạng chuẩn SAU đó thì gắn lại (hoặc gỡ) câu khóa ở mọi cảnh đang soạn,
  // không thì prompt không nhắc ảnh tham chiếu và Muse vẽ lúc 2D lúc người thật. Chỉ sửa đúng dòng khóa, phần còn lại của prompt (kể cả chỗ bạn đã sửa) giữ nguyên.
  function relockScenes() {
    if (isTip() || isAd() || !scenes.length || !plan().refreshPrompt) return 0;
    const opts = options();
    let changed = 0;
    for (const scene of scenes) {
      let next = scene.prompt;
      try { next = plan().refreshPrompt(scene.prompt, opts); } catch { continue; }
      if (next && next !== scene.prompt) { scene.prompt = next; changed++; }
    }
    return changed;
  }
  function relockDrafts() {
    const changed = relockScenes();
    if (!changed) return;
    renderScenes();
    $('storyInfo').textContent = refs.length || $('storyForm').value.trim() ? `Đã gắn câu khóa hình dạng nhân vật vào ${changed} cảnh theo ảnh / hình dạng hiện tại.` : `Đã gỡ câu khóa hình dạng nhân vật khỏi ${changed} cảnh (không còn ảnh tham chiếu).`;
  }
  function refsChanged() {
    refInfo();
    relockDrafts();
    if (refs.length) autoAd(60);
    else if (isAd() && autoSnap && scenes.length && sceneSig() === autoSnap) { clearTimeout(autoTimer); scenes = []; autoSnap = ''; renderScenes(); }
  }
  // Muse viết lời quảng cáo từ thông tin sản phẩm; kết quả vào ô lời quảng cáo để người dùng sửa.
  async function writeAd() {
    if (analyzing || writing) return;
    if (!$('adProduct').value.trim()) { $('adMore').open = true; $('adProduct').focus(); return toast('Nhập tên sản phẩm trước.'); }
    if ($('storyScript').value.trim() && !confirm('Ô lời quảng cáo đang có chữ. Viết mới sẽ thay toàn bộ và xóa các cảnh đã chia. Tiếp tục?')) return;
    const owner = mode, opts = options(), starter = !runMode; if (starter) setRun(owner);
    writing = true; renderAnalyze();
    try {
      const result = await call('storyAdWrite', opts);
      if (result?.script) {
        setScript(owner, result.script);
        const info = 'Muse đã viết lời quảng cáo. Đọc và sửa cho đúng ý, rồi bấm «Phân tích bằng Muse» để chia cảnh.';
        if (owner === mode) { scenes = []; resume = null; renderScenes(); $('storyInfo').textContent = info; }
        else spaces[owner] = { ...spaces[owner], scenes: [], resume: null, info };
      }
    } finally { writing = false; if (starter) setRun(''); renderAnalyze(); }
  }
  // Mẹo vặt: nhập tiêu đề → Muse viết mẹo theo bước → tự chia cảnh ngay (không cần dán gì). Xem lại cảnh rồi mới bấm «Tạo ảnh + clip».
  function renderTipCount() {
    let text = '';
    try {
      const tp = plan().tipPlan(options());
      text = `≈ ${tp.total} cảnh (1 mở đầu + ${tp.steps} ${tp.history ? 'đoạn' : 'bước'} + 1 kết) = ${tp.total} ảnh + ${tp.total} clip, mỗi cảnh đọc khoảng ${tp.secs} giây. Tạo ảnh và clip tốn khoảng ${tp.total * 2} lượt Muse.`;
    } catch { text = ''; }
    $('tipCount').textContent = text;
  }
  async function writeTip(o = {}) {
    if (analyzing || writing) return;
    if (!$('tipTitle').value.trim()) { $('tipTitle').focus(); return toast(isHist() ? 'Nhập chủ đề lịch sử trước.' : isPlant() ? 'Nhập loại cây hoặc tiêu đề trước.' : 'Nhập tiêu đề mẹo trước.'); }
    const auto = autoOn();
    // Đang dừng giữa chừng thì «Chạy tiếp» đúng bước dở: không viết lại bài, không chia lại cảnh, không thêm trùng việc vào hàng đợi.
    if (auto && !o.fresh) { const r = autoResume(); if (r) return resumeAuto(r); }
    if (auto && o.fresh && !confirm('Làm lại từ đầu sẽ viết bài mới và thêm một lượt mới vào hàng đợi (tốn thêm lượt Muse). Lượt đang làm dở vẫn nằm trong hàng đợi. Tiếp tục?')) return;
    // Chạy tự động lần trước để lại đúng bài do Muse viết (chưa sửa) và các cảnh đã vào hàng đợi: viết lần mới không cần hỏi lại.
    const untouched = o.fresh || (auto && !scenes.length && $('storyScript').value === autoScript);
    if (!untouched && ($('storyScript').value.trim() || scenes.length) && !confirm(isPlant() || isHist() ? 'Viết mới sẽ thay bài đang có trong ô và xóa các cảnh đã chia. Tiếp tục?' : 'Viết mới sẽ thay mẹo đang có trong ô và xóa các cảnh đã chia. Tiếp tục?')) return;
    const owner = mode, opts = options(), starter = !runMode; if (starter) setRun(owner);
    autoWhy = '';
    if (auto) { autoRun = { phase: 'write', pct: 0 }; plantRunSet({ title: $('tipTitle').value.trim(), stage: 'write', aspect: $('storyAspect').value, id: '' }); renderAutoRun(); }
    writing = true; renderAnalyze();
    let notes = [], script = '';
    try {
      const result = await callAuto('storyAdWrite', opts);
      if (!result?.script) { if (auto) setAuto({ phase: 'error', msg: 'Dừng ở bước viết bài. Bấm «Làm tự động» để chạy lại.', why: autoWhy }); return; }
      script = result.script; setScript(owner, script); if (auto) { autoScript = script; plantRunSet({ stage: 'split' }); autoRun = { ...autoRun, phase: 'split' }; }
      if (owner === mode) { scenes = []; resume = null; understood = null; renderScenes(); }
      else spaces[owner] = { ...spaces[owner], scenes: [], resume: null, understood: null };
      notes = result.notes || [];
    } finally { writing = false; if (starter && !script) setRun(''); renderAnalyze(); }
    try {
      if (owner === mode) $('storyInfo').textContent = owner === 'plant' || owner === 'hist' ? 'Muse đã viết xong bài. Đang nhờ Muse chia cảnh…' : 'Muse đã viết xong mẹo. Đang nhờ Muse chia cảnh…';
      await analyze(false, { owner, script, opts });
    } finally { if (starter) setRun(''); renderAnalyze(); }
    if (notes.length && owner === mode && scenes.length) toast(notes[0]);
    if (auto) await autoAfterSplit(owner);
  }
  // Chạy tự động sau khi chia cảnh: chia tiếp nếu Muse dừng dở, thêm vào hàng đợi, chạy, xong hết thì tự xuất MP4 (không hỏi thêm).
  async function autoAfterSplit(owner) {
    // Muse chia dở dang (dừng giữa chừng) thì tự «Phân tích tiếp» tối đa 3 lần: chế độ tự động không hiện nút này.
    for (let again = 0; again < 3 && owner === mode && scenes.length && resume; again++) await analyze(false);
    if (owner !== mode) { toast('Tự động dừng vì bạn đã đổi tab. Quay lại «Cây trồng phát triển» rồi bấm «Chạy tiếp».'); setAuto({ phase: 'stopped', msg: 'Dừng vì bạn đã đổi tab. Quay lại tab này rồi bấm «Chạy tiếp».' }); }
    else if (!scenes.length) setAuto({ phase: 'error', msg: 'Dừng ở bước chia cảnh. Bài đã viết được giữ lại: bấm «Chạy tiếp» để chia cảnh (không viết lại bài).', why: autoWhy || state?.story?.analyze?.error || '' });
    else if (resume) setAuto({ phase: 'stopped', msg: 'Muse chia cảnh dừng giữa chừng. Bấm «Chạy tiếp» để chia tiếp từ chỗ dừng.', why: autoWhy });
    else {
      await commit(true, { auto: true });
      if (autoRun?.phase === 'split') setAuto({ phase: 'stopped', msg: 'Chưa thêm được vào hàng đợi. Bấm «Chạy tiếp» để thử lại (không chia lại cảnh).', why: autoWhy });
    }
  }
  function ask() {
    try {
      $('storyInstruction').value = plan().buildMuseInstruction($('storyScript').value, options());
      $('storyMuse').open = true; copyInstruction();
    } catch (e) { toast(e.message); }
  }
  function parse() {
    try {
      scenes = plan().scenesFromReply($('storyScript').value, $('storyReply').value, options()).scenes;
      renderScenes();
      $('storyInfo').textContent = `Muse đã chia ${scenes.length} cảnh. Xem phần đối chiếu với kịch bản bên dưới rồi bấm Tạo clip.`;
    } catch (e) { toast(e.message); }
  }

  function chip(item, on, click) {
    const b = el('button', 'chip', item.label); b.type = 'button'; b.setAttribute('aria-pressed', String(on)); b.onclick = click; return b;
  }
  // Chọn mẫu: điền sẵn giọng điệu, độ dài, máy quay, phong cách (vẫn sửa tay được) rồi tạo lại cảnh.
  function pickTemplate(t) {
    adTemplate = t.id; adCamera = [...t.camera]; adLook = t.look;
    $('adTone').value = t.tone; $('adLength').value = String(t.length);
    Object.assign(saved, { adTemplate, adTone: t.tone, adLength: String(t.length), adCamera, adLook });
    persist(); renderChips(); autoAd();
  }
  function renderChips() {
    $('adTemplate').replaceChildren(...AD.AD_TEMPLATES.map(t => chip(t, adTemplate === t.id, () => pickTemplate(t))));
    $('adCamera').replaceChildren(...AD.AD_CAMERA.map(c => chip(c, adCamera.includes(c.id), () => {
      if (adCamera.includes(c.id)) adCamera = adCamera.filter(id => id !== c.id);
      else if (adCamera.length >= AD.AD_MAX_CAMERA) return toast(`Chọn tối đa ${AD.AD_MAX_CAMERA} chuyển động máy quay.`);
      else adCamera = [...adCamera, c.id];
      saved.adCamera = adCamera; persist(); renderChips(); autoAd();
    })));
    $('adLook').replaceChildren(...AD.AD_LOOK.map(l => chip(l, adLook === l.id, () => { adLook = adLook === l.id ? '' : l.id; saved.adLook = adLook; persist(); renderChips(); autoAd(); })));
  }
  // Chữ khác nhau giữa hai chế độ (viết sẵn tiếng Việt để bản dịch giao diện tự áp dụng).
  const MODE_TEXT = [
    ['storyHead', 'text', '1. Câu chuyện', '1. Lời quảng cáo (không bắt buộc)', '1. Mẹo vặt (Muse viết, bạn sửa được)', '1. Bài trồng cây (Muse viết, bạn sửa được)'],
    ['storyScript', 'placeholder', 'Chỉ cần dán nguyên câu chuyện. Muse tự đọc hiểu để chia cảnh và viết prompt hình; giọng đọc sẽ đọc đúng nguyên văn câu chuyện này.', 'Không bắt buộc. Muốn có giọng đọc và phụ đề thì mở «Tùy chỉnh thêm» rồi bấm «Muse viết lời quảng cáo», hoặc tự dán lời quảng cáo vào đây. Giọng đọc sẽ đọc đúng nguyên văn lời này.', 'Đã có sẵn mẹo? Dán vào đây rồi bấm «Phân tích bằng Muse». Chưa có thì nhập tiêu đề ở trên: Muse viết mẹo theo từng bước và hiện ở đây để bạn sửa. Giọng đọc sẽ đọc đúng nguyên văn mẹo này.', 'Đã có sẵn bài? Dán vào đây rồi bấm «Phân tích bằng Muse». Chưa có thì nhập loại cây ở trên: Muse viết bài trồng cây theo từng giai đoạn và hiện ở đây để bạn sửa. Giọng đọc sẽ đọc đúng nguyên văn bài này.'],
    ['storyStyle', 'placeholder', 'Ví dụ: hoạt hình màu nước', 'Ví dụ: hoạt hình màu nước', 'Mặc định là ảnh chụp thật. Ví dụ: ảnh chụp thật, bếp trắng, ánh sáng cửa sổ', 'Mặc định là ảnh chụp thật. Ví dụ: ảnh chụp thật, bệ cửa sổ có nắng, chậu đất nung'],
    ['tipIntro', 'text', 'Chỉ cần nhập tiêu đề: Muse viết mẹo theo từng bước và chia cảnh. Rồi mỗi bước tạo một ảnh chụp thật và cho ảnh đó chuyển động.', 'Chỉ cần nhập tiêu đề: Muse viết mẹo theo từng bước và chia cảnh. Rồi mỗi bước tạo một ảnh chụp thật và cho ảnh đó chuyển động.', 'Chỉ cần nhập tiêu đề: Muse viết mẹo theo từng bước và chia cảnh. Rồi mỗi bước tạo một ảnh chụp thật và cho ảnh đó chuyển động.', 'Chỉ cần nhập loại cây hoặc tiêu đề: Muse viết bài trồng cây từ chuẩn bị chậu, gieo hạt đến ra quả rồi chia cảnh. Mỗi giai đoạn tạo một ảnh chụp thật của chậu cây và cho ảnh đó chuyển động nhẹ.'],
    ['tipTitleLabel', 'text', 'Bạn muốn hướng dẫn mẹo gì?', 'Bạn muốn hướng dẫn mẹo gì?', 'Bạn muốn hướng dẫn mẹo gì?', 'Bạn muốn trồng cây gì?'],
    ['tipTitle', 'placeholder', 'Ví dụ: Mẹo khử mùi tủ lạnh bằng baking soda', 'Ví dụ: Mẹo khử mùi tủ lạnh bằng baking soda', 'Ví dụ: Mẹo khử mùi tủ lạnh bằng baking soda', 'Ví dụ: Trồng cà chua trong chậu từ hạt đến khi ra quả'],
    ['storyCharLabel', 'text', 'Nhân vật chính (không bắt buộc)', 'Người mẫu / người dùng (không bắt buộc)'],
    ['storyCharacter', 'placeholder', 'Để trống nếu không cần. Ví dụ: Mai, bé gái tóc đen, áo dài trắng', 'Để trống nếu không cần. Ví dụ: cô gái 25 tuổi, tóc dài, áo sơ mi trắng'],
    ['storyRefs', 'text', 'Chọn ảnh nhân vật', 'Chọn ảnh sản phẩm'],
    ['storyRefPaste', 'text', 'Dán hoặc kéo ảnh nhân vật chính vào đây. Ảnh này gắn vào mọi cảnh để nhân vật giữ nguyên; nhân vật khác do Muse nhận ra và vẽ cùng hình dạng với nhân vật này (chỉ khác màu áo, giới tính, tóc…).', 'Dán hoặc kéo ảnh sản phẩm vào đây (nên 1–2 ảnh rõ nét, nền sạch). Ảnh gắn vào mọi cảnh để sản phẩm giữ đúng hình dạng và màu sắc.']
  ];
  // Chữ riêng của chế độ «Lịch sử minh họa» (cùng khóa với MODE_TEXT).
  const HIST_TEXT = {
    storyHead: '1. Bài lịch sử (Muse viết, bạn sửa được)',
    storyScript: 'Đã có sẵn bài? Dán vào đây rồi bấm «Phân tích bằng Muse». Chưa có thì nhập chủ đề ở trên: Muse viết bài lịch sử và hiện ở đây để bạn sửa. Giọng đọc sẽ đọc đúng nguyên văn bài này.',
    storyStyle: 'Mặc định là tranh hoạt hình phẳng. Ví dụ: tranh hoạt hình phẳng, màu ấm, nét viền rõ',
    tipIntro: 'Chỉ cần nhập chủ đề lịch sử: Muse viết bài và chia cảnh (chọn độ dài đến 180 phút). Đã có sẵn bài, dài bao nhiêu cũng được, thì dán vào ô bên dưới: số cảnh tự theo độ dài bài. Mỗi cảnh tạo một tranh hoạt hình rồi cho tranh chuyển động nhẹ.',
    tipTitleLabel: 'Bạn muốn kể chủ đề lịch sử gì?',
    tipTitle: 'Ví dụ: Lịch sử Việt Nam từ thời dựng nước đến nay',
    storyCharLabel: 'Nhân vật dẫn chuyện (không bắt buộc)',
    storyCharacter: 'Ví dụ: cô gái tóc đen búi, áo dài cam, nét mặt dịu dàng. Nhân vật này xuất hiện lại ở nhiều cảnh.',
    storyRefs: 'Chọn ảnh nhân vật dẫn chuyện',
    storyRefPaste: 'Dán hoặc kéo ảnh nhân vật dẫn chuyện vào đây (không bắt buộc). Ảnh gắn vào mọi ảnh minh họa để nhân vật giữ nguyên.'
  };
  // «Kiểu hình» của Lịch sử: hoạt hình phẳng (mặc định) hoặc ảnh phim tư liệu chân thực màu phục chế. Hai ô chữ đổi theo kiểu.
  const HIST_FILM_TEXT = {
    storyStyle: 'Mặc định là ảnh phim tư liệu chân thực, màu phục chế. Ví dụ: ảnh phim tư liệu, màu phục chế nhẹ, hạt phim mịn',
    tipIntro: 'Chỉ cần nhập chủ đề lịch sử: Muse viết bài và chia cảnh (chọn độ dài đến 180 phút). Đã có sẵn bài, dài bao nhiêu cũng được, thì dán vào ô bên dưới: số cảnh tự theo độ dài bài. Mỗi cảnh tạo một ảnh phim tư liệu chân thực (màu phục chế) rồi cho ảnh chuyển động nhẹ. Người trong ảnh là người vô danh đúng thời kỳ, đây là cảnh dựng lại để minh họa, không phải ảnh gốc.'
  };
  const histText = id => (isHist() && $('tipLook').value === 'film' && HIST_FILM_TEXT[id] !== undefined ? HIST_FILM_TEXT[id] : HIST_TEXT[id]);
  function applyHistLook() {
    $('tipLookLabel').hidden = !isHist();
    if (!isHist()) return;
    $('storyStyle').placeholder = histText('storyStyle'); $('tipIntro').textContent = histText('tipIntro');
  }
  const IDLE_INFO = ['Dán câu chuyện rồi bấm «Phân tích bằng Muse» (cần đã đăng nhập Muse tài khoản 1). Muse đọc hiểu cả truyện rồi mới chia cảnh và viết prompt hình.', 'Thả ảnh sản phẩm, chọn mẫu: các cảnh quay hiện ngay bên dưới. Muốn có lời đọc thì mở «Tùy chỉnh thêm», viết lời quảng cáo rồi bấm «Phân tích bằng Muse».', 'Nhập tiêu đề mẹo rồi bấm «Muse viết mẹo và chia cảnh» (cần đã đăng nhập Muse tài khoản 1). Muse viết mẹo theo từng bước và chia cảnh; bạn xem lại rồi bấm «Tạo ảnh + clip»: mỗi bước một ảnh chụp thật, rồi ảnh đó chuyển động thành clip.', 'Nhập tên cây (tiếng Việt hay tiếng Anh) rồi bấm «Làm tự động» (cần đã đăng nhập Muse tài khoản 1): Muse viết bài, chia cảnh, tạo ảnh + clip rồi tự xuất MP4. Bỏ tick «Tự động làm hết» nếu muốn xem lại từng bước (bấm «Muse viết bài và chia cảnh», xem lại, rồi «Tạo ảnh + clip»).', 'Nhập chủ đề lịch sử rồi bấm «Muse viết bài lịch sử và chia cảnh» (cần đã đăng nhập Muse tài khoản 1), hoặc dán sẵn bài vào ô rồi bấm «Phân tích bằng Muse». Xem lại cảnh rồi bấm «Tạo ảnh + clip»: mỗi cảnh một tranh hoạt hình cho chuyển động nhẹ.'];
  function applyMode(initial) {
    const ad = isAd(), tip = isTip(), plant = isPlant(), hist = isHist();
    loadKindFields();
    for (const [id, kind, story, adText, tipText, plantText] of MODE_TEXT) {
      if (initial && !ad && !tip) continue;
      const value = hist && HIST_TEXT[id] !== undefined ? histText(id) : plant ? (plantText ?? tipText ?? story) : tip ? (tipText ?? story) : ad ? adText : story;
      if (kind === 'text') $(id).textContent = value; else $(id).placeholder = value;
    }
    $('modeStory').setAttribute('aria-pressed', String(!ad && !tip)); $('modeAd').setAttribute('aria-pressed', String(ad)); $('modeTip').setAttribute('aria-pressed', String(tip && !plant && !hist)); $('modePlant').setAttribute('aria-pressed', String(plant)); $('modeHist').setAttribute('aria-pressed', String(hist));
    // Mẹo vặt không dùng nhân vật: ảnh nào cũng do Muse vẽ từ prompt ảnh của bước.
    // Riêng «Lịch sử minh họa» giữ nhân vật dẫn chuyện (mô tả và ảnh tham chiếu không bắt buộc) để nhân vật lặp lại ở nhiều cảnh.
    for (const id of ['storyRefRow', 'storyRefPaste', 'storyRefInfo']) $(id).hidden = tip && !hist;
    $('storyCharacter').closest('label').hidden = tip && !hist; $('storyForm').closest('label').hidden = tip;
    $('tipAuto').checked = saved.plantAuto !== false; $('tipAutoLabel').hidden = !plant; renderAnalyze();
    applyHistLook();
    $('tipMotionLabel').hidden = hist || plant; $('tipPromptLabel').hidden = hist;   // lịch sử luôn chuyển động nhẹ và prompt tiếng Anh; cây trồng luôn quay time-lapse (cây lớn lên trong clip) nên không có lựa chọn nhẹ / đầy đủ
    $('storyCreate').textContent = tip ? '▶ Tạo ảnh + clip' : '▶ Tạo clip';
    $('adBox').hidden = !ad; $('tipBox').hidden = !tip; $('storyCompose').classList.toggle('adMode', ad);
    // Ô «Tỉ lệ» là một: ở chế độ quảng cáo nằm trong khung quảng cáo, ngược lại về chỗ cũ.
    if (ad) $('adAspectSlot').append($('storyAspectLabel')); else if (tip) $('tipMainRow').insertBefore($('storyAspectLabel'), $('tipLookLabel')); else if (!initial || $('storyAspectLabel').parentElement !== $('storyOptionsRow')) $('storyOptionsRow').prepend($('storyAspectLabel'));
    applyAutoLayout();
    refInfo(); renderTipCount();
    if (!initial || ad || tip) $('storyInfo').textContent = spaces[mode]?.info || IDLE_INFO[idleIndex(mode)];
  }
  function setMode(next) {
    if (mode === next) return;
    // Mỗi chế độ giữ phần làm việc riêng (cảnh, chỗ dừng, ảnh tham chiếu, dòng thông tin): cất phần đang mở, mở phần của chế độ mới.
    const working = analyzing || writing || Boolean(state?.story?.analyze?.busy);
    spaces[mode] = { scenes, resume, understood, autoSnap, refs, info: working || (runMode && runMode !== mode) ? '' : $('storyInfo').textContent };
    clearTimeout(autoTimer);
    mode = next; saved.mode = mode; persist();
    const space = spaces[mode] || {};
    scenes = space.scenes || []; resume = space.resume || null; understood = space.understood || null; autoSnap = space.autoSnap || ''; refs = space.refs || [];
    loadModeFields();
    applyMode(false);
    renderScenes();
    refreshChecks();
    renderAnalyze();
  }

  /* ---------- ảnh nhân vật ---------- */
  function refInfo() {
    if (isTip() && !isHist()) { $('storyRefInfo').textContent = ''; return; }
    $('storyRefInfo').textContent = refs.length ? `Ảnh ${isAd() ? 'sản phẩm' : 'nhân vật'}: ${refs.map(baseName).join(', ')} — gắn vào mọi cảnh.` : isAd() ? 'Chưa chọn ảnh sản phẩm. Nên thêm ảnh rõ nét để sản phẩm trong video giống thật.' : 'Chưa chọn ảnh nhân vật.';
  }
  async function pasteRefs(event) {
    const files = [...(event.clipboardData?.files || event.dataTransfer?.files || [])].filter(f => f.type.startsWith('image/'));
    if (!files.length) return;
    event.preventDefault();
    const paths = [];
    for (const file of files.slice(0, 4)) { const saved_ = await call('pasteReference', { bytes: new Uint8Array(await file.arrayBuffer()), name: file.name }); if (saved_) paths.push(saved_); }
    if (paths.length) { refs = paths; refsChanged(); }
  }

  /* ---------- thêm vào hàng đợi ---------- */
  let lastNewId = '';
  function newStoryId() {
    const d = new Date(), p = n => String(n).padStart(2, '0');
    const base = `Truyen-${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`;
    // Hai lượt trong cùng một giây (máy nhanh / làm lại ngay) không được trùng mã: trùng thì hai truyện dồn chung một thư mục và một nhóm trong hàng đợi.
    const used = new Set([lastNewId, ...(state?.jobs || []).map(j => j.storyId)]);
    let id = base, n = 1;
    while (used.has(id)) id = `${base}-${++n}`;
    return (lastNewId = id);
  }
  /* Tên video / thư mục lấy theo tiêu đề truyện (không còn «Truyen-ngàygiờ»): ô «Tên video» nếu có gõ; chế độ có ô chủ đề thì lấy chủ đề; còn lại lấy dòng đầu kịch bản. */
  const titleOfScript = text => {
    const lines = String(text || '').split(/\r?\n/).map(l => l.replace(/^[\s#>*_\-–—"“”'`]+|[\s*_"“”'`]+$/g, '').replace(/^(?:tiêu đề|tên truyện|title)\s*[:：]\s*/i, '').trim()).filter(Boolean);
    const first = lines[0] || '';
    if (first && first.length <= 70 && !/[.!?…]$/.test(first)) return first;   // dòng đầu ngắn, không kết thúc như một câu: đó là tiêu đề
    const sentence = (first.split(/(?<=[.!?…])\s/)[0] || first).replace(/[.!?…]+$/, '');
    if (sentence.length <= 50) return sentence;
    const cut = sentence.slice(0, 50), at = cut.lastIndexOf(' ');
    return (at > 20 ? cut.slice(0, at) : cut).trim();
  };
  const storyTitle = () => {
    const typed = $('storyName').value.trim();
    if (typed) return typed.slice(0, 60);
    const topic = isTip() ? $('tipTitle').value.trim() : '';
    return (topic || titleOfScript($('storyScript').value)).slice(0, 60).trim();
  };
  // Tên thư mục: không dấu, chỉ chữ số và gạch ngang (tool bỏ mọi ký tự khác khỏi mã truyện).
  const slugTitle = text => {
    const full = String(text || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/đ/g, 'd').replace(/Đ/g, 'D').replace(/[^A-Za-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
    if (full.length <= 40) return full;
    const cut = full.slice(0, 40);
    return (full[40] === '-' ? cut : cut.slice(0, Math.max(cut.lastIndexOf('-'), 12))).replace(/-+$/g, '');   // cắt ở ranh giới từ, không bỏ lửng giữa chữ
  };
  // Tiêu đề của từng truyện đã thêm: tới lúc xuất MP4 (kể cả sau khi mở lại app) vẫn đặt đúng tên.
  const TITLES_KEY = 'museStudio.storyTitles';
  const titleMap = () => { try { return JSON.parse(localStorage.getItem(TITLES_KEY) || '{}') || {}; } catch { return {}; } };
  const rememberTitle = (id, title) => { try { const m = titleMap(); m[id] = title; const keys = Object.keys(m); for (const k of keys.slice(0, Math.max(0, keys.length - 60))) delete m[k]; localStorage.setItem(TITLES_KEY, JSON.stringify(m)); } catch { /* không lưu được thì dùng mã truyện */ } };
  async function commit(startNow, opts = {}) {
    if (!scenes.length) return toast('Chia cảnh trước.');
    if (scenes.some(s => !String(s.prompt || '').trim())) return toast('Cảnh nào cũng cần prompt.');
    if (isTip() && scenes.some(s => !String(s.image || '').trim())) return toast(isHist() ? 'Cảnh nào cũng cần prompt ảnh.' : 'Bước nào cũng cần prompt ảnh.');
    if (startNow) {
      if (state.active || state.starting || state.stopping || state.merging || state.packaging) { autoWhy = 'Hàng đợi đang chạy. Dừng hàng đợi hiện tại trước khi tạo lượt mới.'; return toast(autoWhy); }
      if (!state.settings.output) { autoWhy = 'Chưa chọn thư mục lưu video.'; return toast('Chọn thư mục lưu video trước.'); }
      const question = isTip()
        ? `Thêm ${scenes.length} ${isHist() ? 'cảnh' : 'bước'} (${scenes.length} ảnh + ${scenes.length} clip) và chạy ngay? Mỗi ${isHist() ? 'cảnh' : 'bước'} tốn 2 lượt Muse (1 ảnh, 1 clip) nên có thể dùng nhiều credit Muse.${scenes.length > 200 ? ' Video dài nên Muse có thể chạy nhiều giờ đến nhiều ngày; bạn có thể bấm Dừng và chạy tiếp sau.' : ''} Tool tạo hết ảnh trước, rồi làm clip từ đúng ảnh đó, gửi nguyên prompt đã xem.`
        : `Thêm ${scenes.length} cảnh và chạy toàn bộ clip kể chuyện đang chờ? Tạo video có thể dùng credit Muse. Tool gửi nguyên prompt đã xem, cùng ảnh ${isAd() ? 'sản phẩm' : 'nhân vật'}.`;
      if (!opts.auto && !confirm(question)) return;   // chạy tự động: bạn đã bấm «Làm tự động» (số lượt Muse hiện sẵn dưới ô độ dài) nên không hỏi lại
    }
    relockScenes();   // chốt lần cuối: prompt gửi Muse luôn có câu khóa khi đang có ảnh nhân vật (kể cả ảnh gắn sau khi chia cảnh)
    const aspectNow = $('storyAspect').value;
    const title = storyTitle(), slug = slugTitle(title);
    const free = slug ? await call('storyFreeId', { base: slug }) : null;
    const storyId = typeof free === 'string' && free ? free : newStoryId();
    if (title && !storyId.startsWith('Truyen-')) rememberTitle(storyId, title);
    exportAspect[storyId] = aspectNow; exportWatch.add(storyId);
    const clipPrompt = s => (plan().stripBeatTags ? plan().stripBeatTags(s.prompt) : s.prompt);
    // Mẹo vặt: mỗi bước thành một việc ảnh rồi một việc clip. Tạo hết ảnh trước (ảnh rẻ, hỏng thì dừng sớm), clip chỉ chạy khi ảnh cùng số bước đã lưu.
    const jobs = isTip()
      ? [
        ...scenes.map((s, i) => ({ kind: 'story', storyId, phase: 'image', number: i + 1, title: `${s.title} · ảnh`, source: s.voiceover || s.source || '', prompt: s.image, ...(isHist() && refs.length ? { image: refs[0], references: [...refs] } : {}) })),
        ...scenes.map((s, i) => ({ kind: 'story', storyId, phase: 'clip', dependsOn: 'image', number: i + 1, title: `${s.title} · clip`, source: s.voiceover || s.source || '', voiceover: s.voiceover || '', prompt: clipPrompt(s), durationSeconds: secondsOf(s) }))
      ]
      : scenes.map(s => ({ kind: 'story', storyId, title: s.title, source: s.voiceover || s.source || '', voiceover: s.voiceover || '', prompt: clipPrompt(s), durationSeconds: secondsOf(s), image: refs[0] || '', references: [...refs] }));
    const result = await callAuto('add', jobs);
    if (!result) return;
    scenes = []; renderScenes(); render(result);
    $('storyPick').value = storyId; renderStatus();   // ô «Truyện» chuyển sang truyện mới (không thì «Xuất MP4» tay vẫn ghép truyện cũ)
    await clearOldStories(storyId);
    if (opts.auto) plantRunSet({ stage: 'make', id: storyId, aspect: aspectNow });   // đã vào hàng đợi: lần sau chỉ chạy tiếp, không thêm lại
    if (startNow) {
      const started = await callAuto('start', { kind: 'story' });
      render(started);
      if (opts.auto && !started) setAuto({ phase: 'stopped', id: storyId, msg: 'Các cảnh đã vào hàng đợi nhưng chưa chạy được. Bấm «Chạy tiếp» để chạy (không thêm lại).', why: autoWhy });
      if (opts.auto && started) { pendingExport = { id: storyId, aspect: aspectNow, armed: Boolean(state?.active || state?.starting), since: Date.now() }; setAuto({ phase: 'make', id: storyId }); setTimeout(checkAutoExport, 21000); }   // hàng đợi dừng ngay mà không có cập nhật nào nữa thì vẫn báo
    }
    if (!opts.auto) {   // chạy tự động: giữ khung mở để còn thấy thanh tiến trình
      $('storyPanel').open = false;
      $('queueWorkspace').scrollIntoView({ block: 'start', behavior: 'smooth' });
    }
  }

  /* ---------- giọng ---------- */
  const engine = () => $('storyEngine').value;
  // Ngôn ngữ của kịch bản đang làm (để chọn giọng đúng ngôn ngữ).
  function storyLanguage() {
    const text = scenes.map(s => s.voiceover).filter(Boolean).slice(0, 4).join(' ') || sampleText() || $('storyScript').value;
    try { return plan().detectLanguage(text); } catch { return 'vi'; }
  }
  function voiceChoices(v) {
    const e = engine();
    if (e === 'edge') {
      const lang = storyLanguage();
      const list = [...(v.edgeVoices || [])].sort((a, b) => (b.lang === lang) - (a.lang === lang));
      return list.map(x => [x.id, `${x.name}${x.lang === lang ? ' ✓' : ''}`, x.lang, x.language]);   // nhóm theo ngôn ngữ (optgroup), giọng hợp ngôn ngữ kịch bản đứng đầu
    }
    if (e === 'preset') return (v.presets || []).map(x => [x.name, `${x.name} — ${x.desc}`, 'vi', x.region ? 'Miền ' + x.region : '']);
    if (e === 'clone') return (v.clones || []).map(x => [x.key, x.name]);
    if (e === 'windows') return (v.windowsVoices || []).map(x => [x.name, `${x.name}${x.culture ? ' · ' + x.culture : ''}`]);
    return [];
  }
  function renderVoice(force) {
    const v = state?.story?.voice || {};
    const e = engine();
    if (e === 'windows' && !windowsAsked && !(v.windowsVoices || []).length) { windowsAsked = true; call('storyWindowsVoices').then(r => r && render(r)); }
    const choices = voiceChoices(v);
    const signature = e + JSON.stringify(choices);
    const select = $('storyVoice');
    if (force || signature !== voiceSignature) {
      voiceSignature = signature;
      const remembered = (saved.voices || {})[e];
      const nodes = []; let group = null, groupName;
      for (const [value, label, , groupLabel] of (choices.length ? choices : [[ '', e === 'none' ? '—' : e === 'clone' ? 'Chưa có giọng clone' : e === 'windows' ? 'Không thấy giọng Windows' : 'Chưa có giọng' ]])) {
        const o = el('option', '', label); o.value = value;
        if (groupLabel) {
          if (!group || groupName !== groupLabel) { group = document.createElement('optgroup'); group.label = groupLabel; groupName = groupLabel; nodes.push(group); }
          group.append(o);
        } else { group = null; nodes.push(o); }
      }
      select.replaceChildren(...nodes);
      const remembered_ = choices.find(([value]) => value === remembered);
      // Nhớ giọng đã chọn, trừ khi nó khác ngôn ngữ kịch bản mà đã có giọng hợp ngôn ngữ.
      if (remembered_ && (e !== 'edge' || remembered_[2] === storyLanguage() || !choices.some(c => c[2] === storyLanguage()))) select.value = remembered;
      else if (e === 'clone' && choices.length) select.value = choices[choices.length - 1][0];
      else if (e === 'preset' && choices.length) select.value = (choices.find(c => c[0] === 'Thiện Minh') || choices[0])[0];
      else if (e === 'edge' && choices.length) select.value = choices[0][0];
    }
    select.disabled = !choices.length;
    $('storyListen').disabled = listening || e === 'none' || !choices.length || Boolean(v.setupBusy);
    $('storyListen').textContent = listening ? 'Đang tạo giọng…' : '▶ Nghe thử giọng';
    const ready = v.ready || {};
    $('storySetup').disabled = Boolean(v.setupBusy);
    const catalog = v.catalog || {};
    $('storyVoiceRefresh').hidden = e !== 'edge'; $('storyVoiceRefresh').disabled = !ready.edge || Boolean(catalog.busy || v.setupBusy);
    $('storyVoiceRefresh').textContent = catalog.busy ? 'Đang tải danh sách…' : '↻ Tải lại danh sách giọng';
    $('storySetup').textContent = v.setupBusy ? 'Đang cài giọng…' : (ready.edge || ready.clone) ? 'Cài lại giọng miễn phí' : 'Cài giọng miễn phí';
    $('storySetupStop').hidden = !v.setupBusy;
    let info = '';
    if (v.setupBusy) info = v.setupMessage || 'Đang cài giọng…';
    else if (v.setupError) info = v.setupError;
    else if (e === 'none') info = 'Không lồng tiếng: video giữ tiếng động của clip, phụ đề lấy từ lời đọc của cảnh.';
    else if (e === 'edge' && !ready.edge) info = 'Chưa cài giọng Microsoft. Bấm «Cài giọng miễn phí» (cần Python 3.10–3.13 trên máy và mạng).';
    else if (e === 'preset' && !ready.clone) info = 'Chưa cài giọng VieNeu. Bấm «Cài giọng miễn phí» (cần Python 3.10–3.13 và mạng; lần đầu tải mô hình nên lâu).';
    else if (e === 'preset') info = '25 giọng Việt có sẵn của VieNeu: miễn phí, chạy offline trên máy, không cần file mẫu. Chỉ dành cho tiếng Việt (ngôn ngữ khác dùng giọng Microsoft). Lần nghe/xuất đầu tiên phải tải mô hình nên lâu.';
    else if (e === 'clone' && !ready.clone) info = 'Chưa cài giọng clone. Bấm «Cài giọng miễn phí» (cần Python 3.10–3.13 và mạng; lần đầu tải mô hình nên lâu).';
    else if (e === 'clone' && !choices.length) info = 'Chưa có giọng clone. Mở mục «Clone giọng của bạn» và thêm file ghi âm mẫu.';
    else if (e === 'windows' && v.platform !== 'win32') info = 'Giọng có sẵn chỉ có trên Windows.';
    else if (e === 'windows' && !choices.length) info = 'Windows chưa có giọng đọc nào. Thêm giọng tiếng Việt trong Cài đặt Windows → Ngôn ngữ, hoặc dùng giọng Microsoft.';
    else if (e === 'clone') info = 'Giọng clone chạy ngay trên máy, miễn phí, dành cho tiếng Việt (ngôn ngữ khác dùng giọng Microsoft hoặc giọng Windows). Lần nghe/xuất đầu tiên phải tải mô hình nên lâu.';
    else if (e === 'edge') info = `Giọng Microsoft miễn phí: ${catalog.count || choices.length} giọng, nhiều ngôn ngữ (✓ = hợp ngôn ngữ kịch bản), cần có mạng khi đọc. ${catalog.error ? catalog.error : catalog.live ? 'Danh sách tải từ Microsoft.' : ready.edge ? 'Đang dùng danh sách có sẵn; bấm «Tải lại danh sách giọng» khi có mạng để có đủ giọng.' : ''}`.trim();
    else info = 'Giọng Windows có sẵn, chạy offline. Chất lượng tiếng Việt tùy giọng bạn đã cài.';
    $('storyVoiceInfo').textContent = info;
    const box = $('storyClones');
    const clones = v.clones || [];
    const cloneSig = JSON.stringify(clones);
    if (box.dataset.sig !== cloneSig) {
      box.dataset.sig = cloneSig; box.replaceChildren();
      for (const clone of clones) {
        const line = el('div', 'storyRow'), name = el('span', 'cloneName', clone.name), del = el('button', 'secondary', 'Xóa');
        del.onclick = async () => { if (confirm('Xóa giọng clone này khỏi máy?')) { const r = await call('storyRemoveVoice', clone.key); if (r) render(r); } };
        line.append(name, del); box.append(line);
      }
    }
    $('storyCloneAdd').disabled = !$('storyCloneConsent').checked;
  }
  $('storyVoice').addEventListener('change', () => { saved.voices = { ...(saved.voices || {}), [engine()]: $('storyVoice').value }; persist(); });
  $('storyCloneConsent').addEventListener('change', () => renderVoice());
  $('storySetup').onclick = async () => { const r = await call('storySetupVoice'); if (r) render(r); };
  $('storyVoiceRefresh').onclick = async () => { const r = await call('storyRefreshVoices'); if (r) { render(r); toast('Đã tải danh sách giọng Microsoft.'); } };
  $('storySetupStop').onclick = async () => { const r = await call('storyCancelSetup'); if (r) render(r); };
  $('storyCloneAdd').onclick = async () => {
    const r = await call('storyAddVoice', { name: $('storyCloneName').value, consent: $('storyCloneConsent').checked });
    if (r) {
      render(r);
      const last = (r.story?.voice?.clones || []).at(-1);
      if (last) { $('storyEngine').value = 'clone'; saved.engine = 'clone'; saved.voices = { ...(saved.voices || {}), clone: last.key }; persist(); renderVoice(true); toast('Đã thêm giọng clone. Bấm «Nghe thử giọng» để nghe.'); }
    }
  };
  function sampleText() {
    const typed = scenes.find(s => s.voiceover);
    if (typed) return typed.voiceover;
    const jobs = (state?.jobs || []).filter(j => j.kind === 'story' && j.voiceover);
    const latest = jobs.at(-1);
    const first = latest && jobs.find(j => j.storyId === latest.storyId);
    return first ? first.voiceover : '';
  }
  // Tốc độ 0.5–2× và âm lượng 0–200% của giọng đọc (1 và 100% = giữ nguyên). Áp dụng khi làm giọng: nghe thử và xuất MP4 đều theo đúng mức này.
  const tempoValue = () => { const n = Number($('storyTempo').value); return Number.isFinite(n) && n > 0 ? Math.min(2, Math.max(0.5, n)) : 1; };
  const volumeValue = () => { const n = Number($('storyVol').value); return Number.isFinite(n) ? Math.min(200, Math.max(0, n)) / 100 : 1; };
  const showVoiceLevels = () => { $('storyTempoOut').textContent = tempoValue().toFixed(2) + '×'; $('storyVolOut').textContent = Math.round(volumeValue() * 100) + '%'; };
  for (const id of ['storyTempo', 'storyVol']) $(id).addEventListener('input', showVoiceLevels);
  $('storyVoiceReset').onclick = () => {
    for (const [id, v] of [['storyTempo', '1'], ['storyVol', '100']]) { $(id).value = v; $(id).dispatchEvent(new Event('input')); $(id).dispatchEvent(new Event('change')); }
  };
  showVoiceLevels();
  $('storyListen').onclick = async () => {
    listening = true; renderVoice();
    try {
      const file = await call('storyListen', { engine: engine(), voice: $('storyVoice').value, tempo: $('storyTempo').value, volume: volumeValue(), text: sampleText() });
      if (file) { const audio = $('storyAudio'); audio.src = localFileUrl(file); audio.hidden = false; audio.play().catch(() => {}); }
    } finally { listening = false; renderVoice(); }
  };

  /* ---------- phụ đề ---------- */
  const numberOr = (value, fallback) => { const n = Number(value); return Number.isFinite(n) ? n : fallback; };
  const clamp = (n, lo, hi) => Math.min(hi, Math.max(lo, n));
  function captionOptions() {
    return {
      font: $('subFont').value, size: Math.min(120, Math.max(24, Number($('subSize').value) || 54)), color: $('subColor').value, outline: $('subOutline').value,
      position: $('subPos').value, box: $('subBox').checked,
      outPct: clamp(numberOr($('subOutW').value, 16), 0, 30), shadow: $('subShadow').value, glow: $('subGlow').value,
      boxColor: $('subBoxColor').value, boxOp: clamp(numberOr($('subBoxOp').value, 55), 10, 100),
      bold: $('subBold').checked, italic: $('subItalic').checked, caps: $('subCaps').checked,
      px: clamp(numberOr(saved.subX, 0.5), 0, 1), py: clamp(numberOr(saved.subY, 0.88), 0, 1)
    };
  }
  const hexRgba = (hex, alpha) => { const m = /^#?([0-9a-f]{6})$/i.exec(hex || ''), n = m ? parseInt(m[1], 16) : 0; return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${alpha})`; };
  const fontSpec = (o, size) => `${o.italic ? 'italic ' : ''}${o.bold === false ? 400 : 700} ${size}px "${o.font}", "Segoe UI", Arial, sans-serif`;
  // Phông bạn tự thêm nạp xong rồi mới vẽ (không thì chữ đầu tiên vẽ bằng phông dự phòng).
  const ensureFont = o => (document.fonts && document.fonts.load ? document.fonts.load(fontSpec(o, 40), 'Ngày xưa Ẫ').catch(() => []) : Promise.resolve([]));
  const fontReady = o => { try { return !document.fonts || document.fonts.check(fontSpec(o, 40), 'Ngày xưa Ẫ'); } catch { return true; } };
  function wrap(ctx, value, maxWidth) {
    const words = String(value).split(/\s+/).filter(Boolean), lines = [];
    let line = '';
    // Chữ Hán/Nhật không có khoảng trắng: một «từ» rất dài thì ngắt theo từng ký tự.
    const pieces = [];
    for (const word of words) {
      if (ctx.measureText(word).width <= maxWidth) { pieces.push(word); continue; }
      let part = '';
      for (const ch of Array.from(word)) { if (part && ctx.measureText(part + ch).width > maxWidth) { pieces.push(part); part = ch; } else part += ch; }
      if (part) pieces.push(part);
    }
    for (const word of pieces) {
      const joiner = /[\u3000-\u9fff\uff00-\uffef]$/.test(line) ? '' : ' ';
      const next = line ? line + joiner + word : word;
      if (line && ctx.measureText(next).width > maxWidth) { lines.push(line); line = word; } else line = next;
    }
    if (line) lines.push(line);
    return lines;
  }
  function drawCaption(canvas, value, o, background, guides) {
    const ctx = canvas.getContext('2d'), w = canvas.width, h = canvas.height;
    ctx.clearRect(0, 0, w, h);
    if (background) { const g = ctx.createLinearGradient(0, 0, w, h); g.addColorStop(0, '#3a5877'); g.addColorStop(1, '#1b2836'); ctx.fillStyle = g; ctx.fillRect(0, 0, w, h); }
    const size = Math.round(o.size * Math.min(w, h) / 1080), lineHeight = Math.round(size * 1.3);
    ctx.font = fontSpec(o, size);
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.lineJoin = 'round';
    const text = o.caps ? String(value).toLocaleUpperCase('vi') : String(value);
    const lines = wrap(ctx, text, w * 0.86), block = lines.length * lineHeight, margin = Math.round(h * 0.08);
    const widest = lines.length ? Math.max(...lines.map(l => ctx.measureText(l).width)) : 0, pad = size * (o.shadow === 'glow' ? 0.95 : 0.6);
    // Vị trí: Dưới / Giữa / Trên, hoặc «Tự kéo thả» (px, py = tâm khối chữ theo tỉ lệ khung hình, luôn nằm gọn trong khung).
    let top = o.position === 'top' ? margin : o.position === 'middle' ? (h - block) / 2 : h - margin - block, cx = w / 2;
    if (o.position === 'custom') {
      top = clamp((o.py === undefined ? 0.88 : o.py) * h - block / 2, size * 0.2, Math.max(size * 0.2, h - block - size * 0.2));
      const half = widest / 2 + size * 0.5;
      cx = clamp((o.px === undefined ? 0.5 : o.px) * w, Math.min(half, w / 2), Math.max(w - half, w / 2));
    }
    if (o.box && lines.length) {
      const boxPad = size * 0.45, x = cx - widest / 2 - boxPad, y = top - boxPad * 0.6;
      ctx.fillStyle = hexRgba(o.boxColor || '#000000', (o.boxOp === undefined ? 55 : o.boxOp) / 100); ctx.beginPath();
      if (ctx.roundRect) ctx.roundRect(x, y, widest + boxPad * 2, block + boxPad * 1.2, size * 0.3); else ctx.rect(x, y, widest + boxPad * 2, block + boxPad * 1.2);
      ctx.fill();
    }
    const strokeW = (o.outPct === undefined ? 16 : o.outPct) / 100 * size;
    lines.forEach((line, i) => {
      const y = top + i * lineHeight + lineHeight / 2;
      if (o.shadow === 'glow') { ctx.shadowColor = o.glow || '#00d0ff'; ctx.shadowBlur = size * 0.4; ctx.shadowOffsetX = 0; ctx.shadowOffsetY = 0; }
      else if (o.shadow === 'soft') { ctx.shadowColor = 'rgba(0,0,0,0.7)'; ctx.shadowBlur = size * 0.14; ctx.shadowOffsetX = 0; ctx.shadowOffsetY = size * 0.06; }
      if (strokeW > 0) { ctx.lineWidth = Math.max(1, strokeW); ctx.strokeStyle = o.outline; ctx.strokeText(line, cx, y); }
      ctx.fillStyle = o.color; ctx.fillText(line, cx, y);
      if (o.shadow === 'glow') ctx.fillText(line, cx, y);   // vẽ lần hai cho quầng sáng đậm hơn
      ctx.shadowColor = 'rgba(0,0,0,0)'; ctx.shadowBlur = 0; ctx.shadowOffsetY = 0;
    });
    if (guides?.center) { ctx.save(); ctx.setLineDash([14, 10]); ctx.lineWidth = Math.max(2, h / 360); ctx.strokeStyle = 'rgba(255,255,255,0.6)'; ctx.beginPath(); ctx.moveTo(w / 2, 0); ctx.lineTo(w / 2, h); ctx.stroke(); ctx.restore(); }
    // Vùng chứa chữ (số chẵn, trong khung hình): chỉ vùng này được gửi đi và phủ lên video, nên dựng nhanh hơn nhiều.
    const x0 = Math.max(0, Math.floor(cx - widest / 2 - pad) & ~1), y0 = Math.max(0, Math.floor(top - pad) & ~1);
    const x1 = Math.min(w, Math.ceil(cx + widest / 2 + pad)), y1 = Math.min(h, Math.ceil(top + block + pad));
    return { x: x0, y: y0, w: Math.max(2, (x1 - x0 + 1) & ~1), h: Math.max(2, (y1 - y0 + 1) & ~1), cx, cy: top + block / 2, tx: cx - widest / 2 - size * 0.5, ty: top - size * 0.3, tw: widest + size, th: block + size * 0.6 };
  }
  /* ---------- kiểu phụ đề có sẵn ---------- */
  const SUB_STYLES = [
    { id: 'classic', label: 'Cổ điển', fonts: ['Arial'], o: { color: '#ffffff', outline: '#000000', outPct: 16, shadow: 'none', glow: '#00d0ff', box: false, boxColor: '#000000', boxOp: 55, bold: true, italic: false, caps: false } },
    { id: 'yellow', label: 'Vàng nổi bật', fonts: ['Arial Black', 'Impact', 'Arial'], o: { color: '#ffe033', outline: '#000000', outPct: 18, shadow: 'soft', glow: '#00d0ff', box: false, boxColor: '#000000', boxOp: 55, bold: true, italic: false, caps: false } },
    { id: 'tv', label: 'Truyền hình', fonts: ['Impact', 'Arial Black', 'Arial'], o: { color: '#ffd400', outline: '#b3001b', outPct: 14, shadow: 'soft', glow: '#00d0ff', box: false, boxColor: '#000000', boxOp: 55, bold: false, italic: false, caps: true } },
    { id: 'blackbox', label: 'Hộp đen', fonts: ['Segoe UI Semibold', 'Segoe UI', 'Arial'], o: { color: '#ffffff', outline: '#000000', outPct: 0, shadow: 'none', glow: '#00d0ff', box: true, boxColor: '#000000', boxOp: 72, bold: true, italic: false, caps: false } },
    { id: 'news', label: 'Bản tin', fonts: ['Bahnschrift', 'Segoe UI', 'Arial'], o: { color: '#ffffff', outline: '#000000', outPct: 0, shadow: 'none', glow: '#00d0ff', box: true, boxColor: '#0b3d91', boxOp: 92, bold: true, italic: false, caps: false } },
    { id: 'cinema', label: 'Điện ảnh', fonts: ['Georgia', 'Times New Roman'], o: { color: '#ffffff', outline: '#000000', outPct: 0, shadow: 'soft', glow: '#00d0ff', box: false, boxColor: '#000000', boxOp: 55, bold: false, italic: true, caps: false } },
    { id: 'storybook', label: 'Truyện cổ tích', fonts: ['Georgia', 'Palatino Linotype', 'Times New Roman'], o: { color: '#fff4d6', outline: '#4a2f12', outPct: 14, shadow: 'soft', glow: '#00d0ff', box: true, boxColor: '#2b1a0a', boxOp: 40, bold: true, italic: false, caps: false } },
    { id: 'cartoon', label: 'Hoạt hình', fonts: ['Comic Sans MS', 'Segoe Print', 'Arial'], o: { color: '#fffbe6', outline: '#e0245e', outPct: 24, shadow: 'soft', glow: '#00d0ff', box: false, boxColor: '#000000', boxOp: 55, bold: true, italic: false, caps: false } },
    { id: 'neon', label: 'Neon', fonts: ['Segoe UI', 'Arial'], o: { color: '#e8fdff', outline: '#007a99', outPct: 6, shadow: 'glow', glow: '#00d0ff', box: false, boxColor: '#000000', boxOp: 55, bold: true, italic: false, caps: false } },
    { id: 'minimal', label: 'Tối giản', fonts: ['Segoe UI', 'Arial'], o: { color: '#ffffff', outline: '#000000', outPct: 0, shadow: 'soft', glow: '#00d0ff', box: false, boxColor: '#000000', boxOp: 55, bold: false, italic: false, caps: false } }
  ];
  const STYLE_CONTROLS = { color: 'subColor', outline: 'subOutline', outPct: 'subOutW', shadow: 'subShadow', glow: 'subGlow', boxColor: 'subBoxColor', boxOp: 'subBoxOp' };
  const STYLE_CHECKS = { box: 'subBox', bold: 'subBold', italic: 'subItalic', caps: 'subCaps' };
  let applyingStyle = false;
  const showSubLevels = () => { $('subOutWOut').textContent = numberOr($('subOutW').value, 16) + '%'; $('subBoxOpOut').textContent = numberOr($('subBoxOp').value, 55) + '%'; };
  function markStyle() { for (const b of $('subStyles').children) b.setAttribute('aria-pressed', String(b.dataset.id === saved.subStyle)); }
  const styleFont = style => style.fonts.find(name => [...$('subFont').options].some(o => o.value === name)) || style.fonts.at(-1);
  function applyStyle(style) {
    applyingStyle = true;
    try {
      const font = styleFont(style);
      if (![...$('subFont').options].some(o => o.value === font)) addFontOption('Phổ biến', font);
      $('subFont').value = font; $('subFont').dispatchEvent(new Event('input'));
      for (const [key, id] of Object.entries(STYLE_CONTROLS)) { $(id).value = style.o[key]; $(id).dispatchEvent(new Event('input')); }
      for (const [key, id] of Object.entries(STYLE_CHECKS)) { $(id).checked = Boolean(style.o[key]); $(id).dispatchEvent(new Event('change')); }
    } finally { applyingStyle = false; }
    saved.subStyle = style.id; persist(); markStyle(); showSubLevels(); drawPreview();
  }
  function drawStyleChips() {
    for (const b of $('subStyles').children) {
      const style = SUB_STYLES.find(x => x.id === b.dataset.id);
      drawCaption(b.querySelector('canvas'), 'Phụ đề mẫu', { font: styleFont(style), size: 280, position: 'middle', px: 0.5, py: 0.5, ...style.o }, true);
    }
  }
  function buildStyleChips() {
    $('subStyles').replaceChildren(...SUB_STYLES.map(style => {
      const button = el('button', '', ''), canvas = document.createElement('canvas');
      canvas.width = 300; canvas.height = 96; button.type = 'button'; button.dataset.id = style.id;
      button.append(canvas, document.createTextNode(style.label));
      button.onclick = () => applyStyle(style);
      return button;
    }));
    markStyle(); drawStyleChips();
  }
  // Sửa tay bất kỳ ô nào thì bỏ dấu «đang dùng kiểu có sẵn».
  for (const id of ['subFont', 'subSize', 'subColor', 'subOutline', 'subOutW', 'subShadow', 'subGlow', 'subBoxColor', 'subBoxOp', 'subBold', 'subItalic', 'subCaps', 'subBox']) {
    $(id).addEventListener(['subBold', 'subItalic', 'subCaps', 'subBox'].includes(id) ? 'change' : 'input', () => { if (applyingStyle || !saved.subStyle) return; saved.subStyle = ''; persist(); markStyle(); });
  }
  for (const id of ['subOutW', 'subBoxOp']) $(id).addEventListener('input', showSubLevels);
  /* ---------- phông của bạn (file .ttf .otf .woff) ---------- */
  async function registerFont(font) {
    if (!font || typeof font.family !== 'string' || !font.bytes) return false;
    try {
      const face = new FontFace(font.family, font.bytes instanceof ArrayBuffer || ArrayBuffer.isView(font.bytes) ? font.bytes : new Uint8Array(font.bytes));
      await face.load(); document.fonts.add(face);
      userFonts.add(font.family); addFontOption('Phông của bạn', font.family);
      return true;
    } catch { toast('Không đọc được phông «' + font.family + '». Thử file .ttf hoặc .otf khác.'); return false; }
  }
  $('subAddFont').onclick = async () => {
    const font = await call('storyAddFont');
    if (await registerFont(font)) { $('subFont').value = font.family; $('subFont').dispatchEvent(new Event('input')); drawStyleChips(); toast('Đã thêm phông «' + font.family + '».'); }
  };
  async function loadUserFonts() {
    const list = await call('storyFonts');
    if (!Array.isArray(list) || !list.length) return;
    for (const font of list) await registerFont(font);
    if (saved.subFont && [...$('subFont').options].some(o => o.value === saved.subFont)) $('subFont').value = saved.subFont;
    drawPreview(); drawStyleChips();
  }
  /* ---------- kéo thả vị trí phụ đề ---------- */
  let lastBox = null, guides = null, drag = null;
  const setCustom = box => {
    if (saved.subPos === 'custom' && $('subPos').value === 'custom') return;
    const canvas = $('subPreview');
    saved.subX = box ? box.cx / canvas.width : 0.5; saved.subY = box ? box.cy / canvas.height : 0.88;
    $('subPos').value = 'custom'; saved.subPos = 'custom'; persist();
  };
  const fraction = e => { const r = $('subPreview').getBoundingClientRect(); return { x: (e.clientX - r.left) / r.width, y: (e.clientY - r.top) / r.height }; };
  const moveCaption = (x, y, snap = true) => {
    const snapped = snap && Math.abs(x - 0.5) < 0.015;
    saved.subX = snapped ? 0.5 : clamp(x, 0.02, 0.98); saved.subY = clamp(y, 0.03, 0.97);
    guides = snapped ? { center: true } : null; persist(); drawPreview();
  };
  $('subPreview').addEventListener('pointerdown', e => {
    if (e.button !== 0) return;
    const f = fraction(e), c = $('subPreview'), b = lastBox;
    const inside = Boolean(b) && f.x * c.width >= b.tx && f.x * c.width <= b.tx + b.tw && f.y * c.height >= b.ty && f.y * c.height <= b.ty + b.th;
    setCustom(b);
    drag = { dx: inside ? numberOr(saved.subX, 0.5) - f.x : 0, dy: inside ? numberOr(saved.subY, 0.88) - f.y : 0 };
    try { c.setPointerCapture(e.pointerId); } catch { /* không hỗ trợ thì vẫn kéo được trong khung */ }
    c.classList.add('dragging'); c.focus(); moveCaption(f.x + drag.dx, f.y + drag.dy); e.preventDefault();
  });
  $('subPreview').addEventListener('pointermove', e => { if (!drag) return; const f = fraction(e); moveCaption(f.x + drag.dx, f.y + drag.dy); });
  const endDrag = () => { if (!drag) return; drag = null; guides = null; $('subPreview').classList.remove('dragging'); drawPreview(); };
  $('subPreview').addEventListener('pointerup', endDrag); $('subPreview').addEventListener('pointercancel', endDrag);
  $('subPreview').addEventListener('keydown', e => {
    const dir = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] }[e.key];
    if (!dir) return;
    e.preventDefault(); setCustom(lastBox);
    const step = e.shiftKey ? 0.05 : 0.01;
    moveCaption(numberOr(saved.subX, 0.5) + dir[0] * step, numberOr(saved.subY, 0.88) + dir[1] * step, false);
  });
  $('subResetPos').onclick = () => { $('subPos').value = 'bottom'; saved.subPos = 'bottom'; delete saved.subX; delete saved.subY; persist(); drawPreview(); };
  $('subPos').addEventListener('change', () => { if ($('subPos').value === 'custom') setCustom(lastBox); drawPreview(); });
  function paintPreview() {
    const canvas = $('subPreview'), [w, h] = dims($('storyAspect').value);
    if (canvas.width !== w || canvas.height !== h) { canvas.width = w; canvas.height = h; }
    lastBox = drawCaption(canvas, 'Ngày xưa có một cô bé tên Mai sống ở làng ven sông.', captionOptions(), true, guides);
  }
  function drawPreview() {
    paintPreview();
    const o = captionOptions();
    if (!fontReady(o)) ensureFont(o).then(paintPreview);   // phông chưa nạp xong: vẽ lại ngay khi có
  }
  async function pngOf(canvas) {
    const blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/png'));
    if (!blob) throw Error('Không vẽ được phụ đề.');
    return new Uint8Array(await blob.arrayBuffer());
  }

  /* ---------- xuất MP4 ---------- */
  function groups() {
    const map = new Map();
    for (const job of state?.jobs || []) if (job.kind === 'story' && job.phase !== 'image' && job.storyId) { const g = map.get(job.storyId) || { id: job.storyId, total: 0, done: 0 }; g.total++; if (job.status === 'completed') g.done++; map.set(job.storyId, g); }
    return [...map.values()];
  }
  function currentStory() {
    const list = groups();
    const picked = $('storyPick').value;
    return list.find(g => g.id === picked) || list.at(-1) || null;
  }
  // Thêm truyện mới thì bỏ truyện cũ đã tạo xong và đã xuất MP4 khỏi hàng đợi. Truyện cũ chưa xuất MP4 được giữ lại (xóa là mất khả năng ghép trong app).
  // Cảnh CHƯA xong của truyện đang chọn có ảnh nhân vật đính kèm mà prompt thiếu câu khóa hình dạng (đã thêm vào hàng đợi trước khi có bản sửa này, hoặc ảnh gắn sau khi chia cảnh).
  function relockNeeded(story) {
    if (!story || isAd() || isTip() || !plan().hasShapeLock) return 0;
    return (state?.jobs || []).filter(j => j.kind === 'story' && j.storyId === story.id && !j.phase && j.storyMode !== 'ad'
      && ['pending', 'failed', 'interrupted'].includes(j.status) && (j.image || (j.references || []).length) && !plan().hasShapeLock(j.prompt)).length;
  }
  async function relockQueued() {
    const story = currentStory(); if (!story) return;
    const need = relockNeeded(story);
    if (!need) return toast('Các cảnh chưa xong đã có câu khóa rồi.');
    if (!confirm(`Gắn câu «KHÓA HÌNH DẠNG NHÂN VẬT» vào prompt của ${need} cảnh chưa xong trong truyện ${story.id}? Chỉ thêm một dòng vào prompt, cảnh đã tạo xong không bị đụng tới. Cảnh bị lỗi hoặc bị gián đoạn cần bấm «Gửi lại prompt».`)) return;
    const result = await call('storyRelock', { storyId: story.id, form: $('storyForm').value });
    if (!result) return;
    render(result);
    const r = result.relocked || {};
    toast(r.changed ? `Đã gắn khóa vào ${r.changed} cảnh.` : 'Không có cảnh nào cần gắn thêm.');
  }
  async function clearOldStories(keepId) {
    const old = groups().filter(g => g.id !== keepId && g.total > 0 && g.done === g.total);
    const exported = g => exportedOk.has(g.id) || Boolean(state?.story?.output && state.story.storyId === g.id);
    const gone = old.filter(exported), kept = old.filter(g => !exported(g));
    if (gone.length) { const r = await call('storyClearDone', { ids: gone.map(g => g.id) }); if (r) render(r); }
    if (gone.length || kept.length) {
      const parts = [];
      if (gone.length) parts.push(`Đã dọn ${gone.length} truyện cũ đã xong khỏi hàng đợi (${gone.map(g => g.id).join(', ')}). Video đã tải vẫn còn trong thư mục.`);
      if (kept.length) parts.push(`${kept.map(g => g.id).join(', ')}: chưa xuất MP4 nên được giữ lại.`);
      toast(parts.join(' '));
    }
  }
  async function exportVideo(opts = {}) {
    const story = currentStory();
    if (!story) return toast('Chưa có clip kể chuyện nào trong hàng đợi.');
    if (story.done < story.total) return toast(`Còn ${story.total - story.done} cảnh chưa xong. Chạy hàng đợi cho xong rồi xuất.`);
    exportDone.add(story.id); exportWatch.delete(story.id);   // đã xuất (tay hoặc tự) thì không tự xuất lại lần nữa
    runMax = { id: story.id, v: 0 };
    exportOk = false; exporting = true; renderStatus();
    try {
      const subtitles = $('subOn').checked, srt = $('subSrt').checked, aspect = opts.aspect || $('storyAspect').value;
      const prep = await call('storyPrepare', { storyId: story.id, engine: engine(), voice: $('storyVoice').value, tempo: $('storyTempo').value, volume: volumeValue() });
      if (!prep) return;
      const [w, h] = dims(aspect), canvas = document.createElement('canvas');
      canvas.width = w; canvas.height = h;
      const o = captionOptions(), out = [];
      if (subtitles) await ensureFont(o);
      for (const scene of prep.scenes) {
        const chunks = [];
        // Phụ đề chạy theo độ dài GIỌNG ĐỌC (không tính nhịp lặng cuối) và dịch về đúng chỗ người đọc nghỉ; đoạn cuối giữ đến hết cảnh.
        const spoken = scene.voiceSeconds > 0 ? scene.voiceSeconds : scene.seconds;
        const parts = (subtitles || srt) ? plan().subtitleChunks(scene.text, spoken, { maxChars: aspect === '9:16' ? 48 : 80, pauses: scene.pauses || [] }) : [];
        if (parts.length) parts[parts.length - 1].end = Math.max(parts[parts.length - 1].end, scene.seconds);
        if (parts.length) for (const chunk of parts) {
          let png = null;
          let x = 0, y = 0;
          if (subtitles) {
            const box = drawCaption(canvas, chunk.text, o, false), part = document.createElement('canvas');
            box.w = Math.min(box.w, w - box.x); box.h = Math.min(box.h, h - box.y);
            part.width = box.w; part.height = box.h;
            part.getContext('2d').drawImage(canvas, box.x, box.y, box.w, box.h, 0, 0, box.w, box.h);
            png = await pngOf(part); x = box.x; y = box.y;
          }
          chunks.push({ text: chunk.text, start: chunk.start, end: chunk.end, png, x, y });
        }
        out.push({ id: scene.id, chunks });
      }
      const result = await call('storyBuild', { runId: prep.runId, name: $('storyName').value.trim() || titleMap()[story.id] || story.id, aspect, subtitles, srt, sfx: $('storySfx').value, scenes: out });
      if (result) { exportOk = true; exportedOk.add(story.id); render(result); toast('Đã xuất MP4.'); if (saved.plantRun?.id === story.id) plantRunSet({ stage: 'done' }); }
    } finally { exporting = false; renderStatus(); }
  }
  /* ---------- Cây trồng chạy tự động: bố cục gọn + thanh tiến trình % ---------- */
  const autoLive = () => Boolean(autoRun && ['write', 'split', 'make', 'export'].includes(autoRun.phase));
  // Giống call() nhưng nhớ lý do lỗi để hiện ngay trên thanh tiến trình (chế độ tự động ẩn dòng thông tin).
  async function callAuto(name, data) {
    try { return await window.studio.invoke(name, data); }
    catch (e) { autoWhy = String(e?.message || e).replace(/^Error invoking remote method '[^']+': Error: /, ''); toast(autoWhy); return null; }
  }
  // Bước đang làm của lượt tự động, lưu lại để «Chạy tiếp» đúng chỗ kể cả sau khi mở lại app: { title, stage: write|split|make|done, id, aspect }.
  function plantRunSet(patch) { saved.plantRun = { ...(saved.plantRun || {}), ...patch }; persist(); }
  // Còn việc dở của đúng cây đang nhập thì trả về bước cần chạy tiếp: {step: split|make|export}; không có thì null (làm mới từ đầu).
  function autoResume() {
    const run = saved.plantRun;
    if (!autoOn() || !run || run.title !== $('tipTitle').value.trim()) return null;
    if (run.stage === 'make') {
      const g = run.id && groups().find(x => x.id === run.id);
      if (!g || !g.total) return null;
      return g.done < g.total ? { step: 'make', id: g.id, aspect: run.aspect, left: g.total - g.done } : { step: 'export', id: g.id, aspect: run.aspect };
    }
    if (run.stage === 'split' && ($('storyScript').value.trim() || scenes.length)) return { step: 'split' };
    return null;
  }
  // Lý do clip lỗi (nếu có) để báo trên thanh tiến trình.
  const whyFailed = id => (state?.jobs || []).find(j => j.storyId === id && j.status === 'failed' && j.error)?.error || '';
  async function resumeAuto(r) {
    autoWhy = '';
    if (r.step === 'split') {
      if (!scenes.length && !$('storyScript').value.trim()) return;
      if (autoRun?.id) autoRun = null;
      setAuto({ phase: 'split', msg: '', why: '' });
      if (!scenes.length) await analyze(false, { owner: mode, script: $('storyScript').value, opts: options() });
      return autoAfterSplit(mode);
    }
    if (state.stopping || state.merging || state.packaging) return toast('Hàng đợi đang dừng hoặc đang ghép. Chờ xong rồi bấm «Chạy tiếp».');
    if (autoRun?.id !== r.id) autoRun = null;
    setAuto({ phase: 'make', id: r.id, msg: '', why: '' });
    if (r.step === 'make' && !(state.active || state.starting)) {
      const started = await callAuto('start', { kind: 'story' });   // chạy lại các cảnh lỗi / bị dừng; không thêm việc mới
      if (!started) return setAuto({ phase: 'stopped', msg: 'Chưa chạy tiếp được hàng đợi. Bấm «Chạy tiếp» để thử lại.', why: autoWhy });
      render(started);
    }
    pendingExport = { id: r.id, aspect: r.aspect || $('storyAspect').value, armed: r.step === 'export' || Boolean(state?.active || state?.starting), since: Date.now() };
    setTimeout(checkAutoExport, 21000);
    checkAutoExport();
  }
  function setAuto(next) { autoRun = next ? { ...(autoRun || {}), ...next } : null; renderAutoRun(); renderAnalyze(); }
  // Viết bài 0–15%, chia cảnh 15–25%, tạo ảnh + clip 25–90%, xuất MP4 90–100%.
  function autoPercent(r) {
    const a = state?.story?.analyze || {};
    if (r.phase === 'write') { const m = /(\d+)\/(\d+)/.exec(a.progress || ''); return Math.round(15 * (m ? (Number(m[1]) - 1) / Number(m[2]) : 0)); }
    if (r.phase === 'split') return 15 + Math.round(10 * (a.parts ? Math.max(0, (a.part || 1) - 1) / a.parts : 0));
    if (r.phase === 'make') {
      const jobs = (state?.jobs || []).filter(j => j.kind === 'story' && j.storyId === r.id);
      r.total = jobs.length; r.done = jobs.filter(j => j.status === 'completed').length;
      return r.total ? 25 + Math.round(65 * r.done / r.total) : 25;
    }
    if (r.phase === 'export') return 92;
    if (r.phase === 'done') return 100;
    return r.pct || 0;
  }
  function autoLabel(r) {
    if (r.phase === 'write') return 'Muse đang viết bài…';
    if (r.phase === 'split') return 'Muse đang chia cảnh…';
    if (r.phase === 'make') return `Đang tạo ảnh + clip (${r.done || 0}/${r.total || 0})`;
    if (r.phase === 'export') return 'Đang xuất MP4…';
    if (r.phase === 'done') return 'Xong: MP4 đã xuất';
    return r.msg || 'Đã dừng';
  }
  // Chỉ MỘT thanh tiến trình hiện cùng lúc (trước đây «Làm tự động», khung «Tạo clip / ghép video» và thanh trong mục xuất MP4 cùng chạy, chiếm cả màn hình).
  // Ưu tiên: thanh «Làm tự động» (có chữ lý do khi dừng) > khung dưới ô truyện (luôn thấy dù mục xuất MP4 đang thu gọn) > thanh trong mục xuất MP4. Mỗi thanh vẫn cập nhật số liệu của nó.
  function syncBars() {
    const bars = ['autoRun', 'storyDone', 'runProgress'].map($), first = bars.find(b => b.dataset.want === '1');
    for (const b of bars) b.hidden = b !== first;
  }
  function renderAutoRun() {
    const box = $('autoRun'), r = autoRun;
    box.dataset.want = r && autoOn() ? '1' : ''; syncBars();
    if (!box.dataset.want) return;
    const stuck = r.phase === 'stopped' || r.phase === 'error', p = autoPercent(r);
    if (!stuck) r.pct = r.phase === 'done' ? 100 : Math.max(r.pct || 0, p);   // thanh chỉ tiến, không lùi
    $('autoFill').style.width = (r.pct || 0) + '%'; $('autoBar').setAttribute('aria-valuenow', String(r.pct || 0));
    $('autoPct').textContent = (r.pct || 0) + '%'; $('autoLabel').textContent = autoLabel(r);
    $('autoText').classList.toggle('warn', stuck);
    $('autoWhy').hidden = !(stuck && r.why); $('autoWhy').textContent = stuck && r.why ? r.why : '';
  }
  // Bố cục gọn khi chạy tự động: ẩn ô bài, danh sách cảnh và nút phân tích; «Tỉ lệ» và «Phong cách» chuyển vào «Tùy chọn thêm».
  function applyAutoLayout() {
    const auto = autoOn();
    $('storyPanel').classList.toggle('autoMode', auto);
    if (!isAd()) {
      const aspect = $('storyAspectLabel'), style = $('storyStyle').closest('label'), row = $('storyOptionsRow');
      // «Tỉ lệ» (khung Muse tạo ra) luôn thấy ngay, không giấu trong «Tùy chọn thêm»: ở các chế độ tip nằm cạnh «Độ dài video».
      if (isTip()) { if (aspect.parentElement !== $('tipMainRow')) $('tipMainRow').insertBefore(aspect, $('tipLookLabel')); }
      else if (aspect.parentElement !== row) row.prepend(aspect);
      if (auto) $('tipExtra').append(style);
      else if (style.parentElement !== row) row.insertBefore(style, $('storyForm').closest('label'));
    }
    renderAutoRun();
  }
  // Chạy tự động: khi MỌI clip của lượt vừa tạo đã xong thì tự xuất MP4. Hàng đợi dừng (lỗi / bạn bấm Dừng) mà còn thiếu clip thì thôi, báo rõ.
  // Mọi chế độ: lượt nào đã thấy chạy dở rồi xong hết clip (kể cả bấm «Chạy hàng đợi» tay) thì tự đọc giọng + edit khớp + xuất MP4, giống tab Vẽ bên AnimStudio. Tắt bằng ô «Tự xuất MP4».
  function watchGroups() {
    if (pendingExport || exporting || !state || state.story?.busy) return;
    const on = $('autoExport').checked;
    for (const g of groups()) {
      if (g.total > 0 && g.done < g.total) { exportWatch.add(g.id); continue; }
      if (g.total > 0 && exportWatch.has(g.id) && !exportDone.has(g.id)) {
        exportWatch.delete(g.id); exportDone.add(g.id);   // tắt ô «Tự xuất» vẫn ghi nhận lượt đã xong, để bật lại sau không xuất bù lượt cũ
        if (!on) continue;
        pendingExport = { id: g.id, aspect: exportAspect[g.id] || $('storyAspect').value, armed: true, since: Date.now() };
        return;
      }
    }
  }
  function checkAutoExport() {
    watchGroups();
    const p = pendingExport;
    if (!p || exporting || !state) return;
    const g = groups().find(x => x.id === p.id);
    if (!g) { pendingExport = null; if (autoRun?.id === p.id) setAuto(null); return; }          // lượt đã bị xóa khỏi hàng đợi
    if (g.total > 0 && g.done >= g.total) {
      pendingExport = null; exportDone.add(g.id); exportWatch.delete(g.id);
      const pick = $('storyPick'); if ([...pick.options].some(o => o.value === g.id)) pick.value = g.id;
      toast('Xong hết clip. Đang tự đọc giọng, edit khớp và xuất MP4…');
      if (autoRun?.id === g.id) setAuto({ phase: 'export' });
      autoWhy = '';
      exportVideo({ aspect: p.aspect })
        .catch(e => { autoWhy = e.message; toast(e.message); })
        .then(() => { if (autoRun?.id === g.id && autoRun.phase === 'export') setAuto(exportOk ? { phase: 'done' } : { phase: 'error', msg: 'Xuất MP4 chưa xong. Bấm «Chạy tiếp» để xuất lại (không tạo lại clip).', why: autoWhy || state?.story?.error || '' }); });
      return;
    }
    if (state.active || state.starting) { p.armed = true; return; }
    if (p.armed || Date.now() - p.since > 20000) {
      pendingExport = null;
      toast(`Hàng đợi đã dừng, còn ${g.total - g.done} cảnh chưa xong nên chưa tự xuất MP4. Bấm «Chạy tiếp» để làm tiếp.`);
      if (autoRun?.id === g.id) setAuto({ phase: 'stopped', msg: `Hàng đợi đã dừng, còn ${g.total - g.done} cảnh chưa xong. Bấm «Chạy tiếp» để chạy tiếp, xong sẽ tự xuất MP4.`, why: whyFailed(g.id) });
    }
  }
  /* ---------- Thanh tiến trình % cho MỌI lượt (không chỉ «Làm tự động») ----------
     Tạo clip 0–85%, đọc giọng 85–92%, edit khớp + dựng 92–98%, nối MP4 98–100%.
     Khi ô «Tự đọc giọng…» bật: ẩn nút «Xuất MP4» và dòng hướng dẫn thủ công lúc đang chạy; chỉ hiện lại khi xong hoặc khi kẹt (lỗi / hàng đợi dừng) để làm tay. */
  let runMax = { id: '', v: 0 };
  // Lượt để hiện tiến trình: đang xuất → lượt đang chọn; đang chạy → lượt chạy dở mới nhất (ưu tiên lượt có clip đang làm); không thì lượt mới nhất
  // trong {chạy dở, vừa xuất xong}; không có gì thì lượt đang chọn. Lượt cũ bị bỏ dở lâu rồi không chen vào lượt mới.
  function focusGroup() {
    const list = groups();
    if (exporting) return currentStory();
    const inc = list.filter(x => x.done < x.total && exportWatch.has(x.id));
    if (state?.active || state?.starting) {
      const run = inc.filter(x => (state.jobs || []).some(j => j.storyId === x.id && j.status === 'running'));
      if (run.length || inc.length) return (run.length ? run : inc).at(-1);
    }
    const done = runMax.id && list.find(x => x.id === runMax.id && x.done >= x.total);
    const pool = [inc.at(-1), done].filter(Boolean).sort((a, b) => list.indexOf(a) - list.indexOf(b));
    return pool.at(-1) || currentStory();
  }
  function runInfo() {
    const g = focusGroup(), s = state?.story || {};
    if (!g || !state) return null;
    if (runMax.id !== g.id) runMax = { id: g.id, v: 0 };
    if (exporting || s.busy) {
      const p = String(s.progress || ''), m = /(\d+)\/(\d+)/.exec(p), f = m ? Number(m[1]) / Math.max(1, Number(m[2])) : 0;
      let pct = 85, label = 'Đang đọc giọng…';
      if (/giọng đọc|nạp mô hình/i.test(p)) { pct = 85; label = 'Đang đọc giọng…'; }
      else if (/^Đã đọc/.test(p) && m) { pct = 85 + Math.round(7 * f); label = `Đang đọc giọng ${m[1]}/${m[2]} cảnh`; }
      else if (/đo độ dài|chuẩn bị/i.test(p)) { pct = 92; label = 'Đang đo độ dài lời đọc'; }
      else if (/thông tin các cảnh/i.test(p)) { pct = 93; label = 'Đang edit khớp lời đọc với clip…'; }
      else if (/dựng/i.test(p) && m) { pct = 93 + Math.round(5 * f); label = `Đang edit khớp & dựng ${m[1]}/${m[2]} cảnh`; }
      else if (/nối/i.test(p)) { pct = 98; label = 'Đang nối thành MP4'; }
      else if (p) label = p;
      runMax.v = Math.max(runMax.v, pct);
      return { pct: runMax.v, label, phase: 'export' };
    }
    if (g.done < g.total) {
      const live = Boolean(state.active || state.starting), watching = exportWatch.has(g.id) || pendingExport?.id === g.id;
      if (!live && !watching) return null;
      runMax.v = Math.round(85 * g.done / g.total);
      return live ? { pct: runMax.v, label: `Đang tạo clip ${g.done}/${g.total}`, phase: 'clips' }
        : { pct: runMax.v, label: `Hàng đợi đang dừng · ${g.done}/${g.total} clip. Bấm «Tiếp tục» ở Hàng đợi để làm tiếp`, phase: 'clips', stuck: true };
    }
    if (s.error) return { pct: Math.max(85, runMax.v), label: s.error, phase: 'error', stuck: true };
    if (s.output && (!s.storyId || s.storyId === g.id) && exportDone.has(g.id)) { runMax.v = 100; return { pct: 100, label: 'Xong: ' + baseName(s.output), phase: 'done', done: true }; }
    return null;
  }
  function renderRun() {
    const info = $('autoExport').checked ? runInfo() : null, box = $('runProgress');
    box.dataset.want = info ? '1' : ''; syncBars();
    const running = Boolean(info && !info.stuck && !info.done);
    $('storyExport').hidden = running; $('storyStatus').hidden = running;
    if (!info) return;
    $('runFill').style.width = info.pct + '%'; $('runBar').setAttribute('aria-valuenow', String(info.pct));
    $('runPct').textContent = info.pct + '%'; $('runLabel').textContent = info.label;
    $('runText').classList.toggle('warn', Boolean(info.stuck));
  }
  $('autoExport').addEventListener('change', () => { if (state) renderStatus(); });
  // Thanh tiến trình % nằm NGOÀI các mục thu gọn và LUÔN hiện khi hàng đợi có clip kể chuyện (không phụ thuộc ô «Tự xuất MP4»):
  // tạo clip 0–85%, đọc giọng + edit + nối 85–100%, xong = 100%. Chỉ báo tiến trình, không có nút.
  function renderDone() {
    const box = $('storyDone'), s = state?.story || {}, story = focusGroup();   // lượt đang chạy / vừa xong (không phải lượt chọn cũ trong ô «Truyện»)
    let kind = '';
    if (state && story && story.total > 0 && !$('storyOutput').hidden) {
      if (exporting || s.busy) kind = 'busy';
      else if (story.done < story.total) kind = 'making';
      else if (s.error) kind = 'error';
      else if (s.output && (!s.storyId || s.storyId === story.id)) kind = 'ready';
      else kind = 'todo';
    }
    box.dataset.want = kind ? '1' : ''; syncBars();
    if (!kind) return;
    const live = Boolean(state.active || state.starting);
    let pct = 0, title = '', text = '';
    if (kind === 'making') {
      pct = Math.round(85 * story.done / story.total);
      title = live ? 'Đang tạo clip kể chuyện…' : 'Hàng đợi đang dừng';
      text = live ? `Đang tạo clip ${story.done}/${story.total}` : `Hàng đợi đang dừng · ${story.done}/${story.total} clip. Bấm «Tiếp tục» ở Hàng đợi để làm tiếp`;
    } else if (kind === 'busy') {
      const info = runInfo();
      pct = info ? info.pct : 85; title = 'Đang ghép video hoàn chỉnh…'; text = info?.label || s.progress || 'Đang xử lý…';
    } else if (kind === 'ready') {
      pct = 100; title = '✓ Video hoàn chỉnh đã sẵn sàng'; text = 'Mở mục «Giọng, phụ đề & xuất MP4» để xem video.';
    } else if (kind === 'error') {
      pct = Math.max(85, runMax.v); title = 'Ghép video chưa xong'; text = s.error;
    } else {
      pct = 85; title = 'Clip đã xong hết, chưa ghép thành video hoàn chỉnh'; text = 'Nếu app chưa tự ghép, mở mục «Giọng, phụ đề & xuất MP4» rồi bấm «Xuất MP4».';
    }
    box.classList.toggle('ready', kind === 'ready'); box.classList.toggle('warn', kind === 'error' || kind === 'todo');
    $('sdTitle').textContent = title;
    $('sdFile').textContent = kind === 'ready' ? baseName(s.output) + (s.srt ? ' + ' + baseName(s.srt) : '') : '';
    $('sdText').textContent = text; $('sdText').classList.toggle('warn', kind === 'error');
    $('sdPct').textContent = pct + '%';
    $('sdFill').style.width = pct + '%'; $('sdBar').setAttribute('aria-valuenow', String(pct));
  }
  function notesText(notes) {
    if (!Array.isArray(notes) || !notes.length) return '';
    const cut = notes.reduce((sum, n) => sum + (n.cut || 0), 0), held = notes.filter(n => n.hold > 0.05);
    return `Tự edit: cắt ${cut.toFixed(1)} giây thừa${held.length ? `; ${held.length} cảnh lời dài hơn clip nên giữ khung cuối (cảnh ${held.map(n => n.scene).join(', ')})` : ''}.`;
  }
  function renderStatus() {
    const s = state?.story || {}, list = groups(), story = currentStory();
    const pick = $('storyPick'), sig = list.map(g => g.id).join('|');
    $('storyPickLabel').hidden = list.length < 2;
    if (pick.dataset.sig !== sig) { const keep = pick.value; pick.dataset.sig = sig; pick.replaceChildren(...list.map(g => { const o = el('option', '', g.id); o.value = g.id; return o; })); if (list.some(g => g.id === keep)) pick.value = keep; else if (list.length) pick.value = list.at(-1).id; }
    for (const o of pick.options) { const g = list.find(x => x.id === o.value); if (g) o.textContent = `${g.id} · ${g.done}/${g.total}`; }
    const busy = Boolean(s.busy || exporting);
    $('storyExport').disabled = busy || !story || story.done < story.total;
    $('storyExport').textContent = busy ? 'Đang xuất…' : 'Xuất MP4';
    $('storyStop').hidden = !s.busy;
    $('storyOpen').hidden = !s.output;
    $('storySave').hidden = !s.output;
    let line = '';
    if (s.error && !busy) line = s.error;
    else if (busy) line = s.progress || 'Đang xử lý…';
    else if (s.output) line = `✓ ${baseName(s.output)}${s.srt ? ' + ' + baseName(s.srt) : ''}. ${notesText(s.notes)}`;
    else if (story && story.done < story.total) line = $('autoExport').checked ? `Còn ${story.total - story.done} cảnh chưa có clip. Xong hết clip app sẽ tự đọc giọng, edit khớp và xuất MP4.` : `Còn ${story.total - story.done} cảnh chưa có clip. Chạy hàng đợi cho xong rồi xuất MP4.`;
    else if (story) line = `${story.total} cảnh đã sẵn sàng. Chọn giọng, phụ đề rồi bấm Xuất MP4.`;
    else line = 'Chưa có clip kể chuyện. Chia cảnh và bấm Tạo clip trước.';
    $('storyStatus').textContent = line;
    const need = relockNeeded(story);
    $('storyRelock').hidden = !need;
    if (need) $('storyRelock').textContent = `Gắn khóa ảnh nhân vật cho ${need} cảnh chưa xong`;
    // Xem video đã xuất ngay trong app. Đang xuất thì gỡ khung phát để lần sau nạp lại file mới (kể cả khi trùng tên).
    const video = $('storyVideo'), videoFile = !busy && s.output ? s.output : '';
    if (videoFile !== lastVideo) {
      lastVideo = videoFile; video.pause(); $('storyVideoError').hidden = true;
      if (videoFile) { video.src = localFileUrl(videoFile); video.hidden = false; }
      else { video.removeAttribute('src'); video.load(); video.hidden = true; }
    }
    if (story && story.id !== lastStory) { lastStory = story.id; }
    checkAutoExport();
    renderRun();
    renderDone();
    if (isPlant()) renderAnalyze();   // nhãn «Chạy tiếp (còn N cảnh)» theo hàng đợi
  }

  $('modeStory').onclick = () => setMode('story'); $('modeAd').onclick = () => setMode('ad'); $('modeTip').onclick = () => setMode('tip'); $('modePlant').onclick = () => setMode('plant'); $('modeHist').onclick = () => setMode('hist'); $('adWrite').onclick = writeAd; $('tipWrite').onclick = () => writeTip(); $('autoRestart').onclick = () => writeTip({ fresh: true }); $('adQuick').onclick = quickAd;
  for (const id of ['tipMinutes', 'tipSecs', 'tipLanguage', 'storyAspect']) $(id).addEventListener('change', renderTipCount);
  $('tipLook').addEventListener('change', applyHistLook);
  $('tipAuto').addEventListener('change', () => { saved.plantAuto = $('tipAuto').checked; persist(); applyAutoLayout(); renderAnalyze(); });
  $('storyAnalyze').onclick = () => analyze(false); $('storyAnalyzeAgain').onclick = () => analyze(true); $('storyScript').addEventListener('input', renderAnalyze);
  $('storyAnalyzeStop').onclick = async () => { const r = await call('storyAnalyzeCancel'); if (r) render(r); };
  $('storyAsk').onclick = ask; $('storyCopy').onclick = copyInstruction; $('storyParse').onclick = parse;
  $('storyRefs').onclick = async () => { const files = await call('images', { multiple: true }); if (files?.length) { refs = files; refsChanged(); } };
  $('storyRefsClear').onclick = () => { refs = []; refsChanged(); };
  $('storyRefPaste').onpaste = pasteRefs; $('storyRefPaste').ondragover = e => e.preventDefault(); $('storyRefPaste').ondrop = pasteRefs;
  $('storyCommit').onclick = () => commit(false); $('storyCreate').onclick = () => commit(true);
  $('storyExport').onclick = () => exportVideo();
  $('storyRelock').onclick = relockQueued;
  $('storyStop').onclick = async () => { const r = await call('storyCancel'); if (r) render(r); };
  $('storyOpen').onclick = () => call('storyReveal');
  $('storySave').onclick = async () => { const r = await call('storySave'); if (r && r.file) toast('Đã lưu video: ' + r.file); };
  $('storyVideo').addEventListener('error', () => { if ($('storyVideo').getAttribute('src')) $('storyVideoError').hidden = false; });
  $('storyVideo').addEventListener('loadeddata', () => { $('storyVideoError').hidden = true; });
  $('storyAspect').addEventListener('change', drawPreview);
  for (const id of ['adLength', 'storyAspect']) $(id).addEventListener('change', () => autoAd());
  for (const id of ['adProduct', 'storyStyle', 'storyCharacter']) $(id).addEventListener('input', () => autoAd(500));
  $('storyForm').addEventListener('change', relockDrafts);
  $('adMore').addEventListener('toggle', () => $('storyCompose').classList.toggle('adOpen', $('adMore').open));
  showSubLevels(); buildStyleChips(); loadUserFonts();
  renderChips(); applyMode(true); renderScenes(); drawPreview();

  window.storyUi = {
    render() { renderVoice(); renderStatus(); renderAnalyze(); },
    drawCaption, wrap, titleOfScript, slugTitle, storyTitle, clearOldStories, get scenes() { return scenes; }
  };
})();
