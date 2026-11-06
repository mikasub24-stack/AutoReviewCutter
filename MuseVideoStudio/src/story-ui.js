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
  const FIELDS = {
    adProduct: ['adProduct', ''], adPoints: ['adPoints', ''], adAudience: ['adAudience', ''], adOffer: ['adOffer', ''], adCta: ['adCta', ''],
    adTone: ['adTone', AD.AD_TONE[0].id], adLength: ['adLength', '30'],
    storyScript: ['script', ''], storyAspect: ['aspect', '16:9'], storyCharacter: ['character', ''], storyForm: ['form', ''], storyStyle: ['style', ''],
    storyEngine: ['engine', 'none'], storyTempo: ['tempo', '1'], subFont: ['subFont', 'Arial'], subSize: ['subSize', '54'], subColor: ['subColor', '#ffffff'],
    subOutline: ['subOutline', '#000000'], subPos: ['subPos', 'bottom'], storySfx: ['sfx', 'low'], storyName: ['name', '']
  };
  const CHECKS = { subOn: ['subOn', true], subSrt: ['subSrt', false], subBox: ['subBox', false] };
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
  let mode = saved.mode === 'ad' ? 'ad' : saved.mode === 'tip' ? 'tip' : 'story';
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
  const isTip = () => mode === 'tip';
  const adFields = () => ({ product: $('adProduct').value, points: $('adPoints').value, audience: $('adAudience').value, offer: $('adOffer').value, cta: $('adCta').value, tone: $('adTone').value, length: Number($('adLength').value), camera: [...adCamera], look: adLook, template: adTemplate });
  const options = () => ({ seconds: plan().MAX_SECONDS, reference: refs.length > 0 && !isTip(), aspect: $('storyAspect').value, style: $('storyStyle').value, character: $('storyCharacter').value, form: $('storyForm').value, ...(isAd() ? { ad: adFields() } : {}), ...(isTip() ? { tip: true } : {}) });
  const plan = () => window.storyPlan;
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
        if (list.length) flagged++;
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
  const secondsOf = scene => (scene.fixedSeconds && !String(scene.voiceover || scene.source || '').trim()) ? scene.fixedSeconds : plan().sceneSeconds(scene.voiceover || scene.source || '', plan().MAX_SECONDS);
  const headingText = (scene, index) => `${scene.title || 'Cảnh ' + (index + 1)} · ${secondsOf(scene)} giây`;
  // Muse đã hiểu bài thế nào (tóm tắt, cách minh họa, nhân vật/vai, bối cảnh): hiện để người dùng thấy ngay chỗ Muse hiểu sai.
  let understood = null;   // { summary, approach, cast, setting }
  function renderUnderstanding() {
    const box = $('storyUnderstand'), rows = [['Tóm tắt', understood?.summary], ['Cách minh họa', understood?.approach], [isTip() ? 'Nơi làm và đồ vật cố định' : 'Nhân vật', understood?.cast], ['Bối cảnh', understood?.setting]].filter(r => r[1]);
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
      body.append(el('label', 'storyLabel', 'Lời đọc'), voice, ...(isTip() ? [el('label', 'storyLabel', 'Prompt ảnh (khung hình đầu)'), image] : []), el('label', 'storyLabel', isTip() ? 'Prompt chuyển động (làm từ ảnh)' : 'Prompt gửi Muse'), prompt, warn, tools);
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
  const canResume = () => Boolean(resume && scenes.length && $('storyScript').value === resume.script);
  async function analyze(fromStart) {
    if (analyzing) return;
    const script = $('storyScript').value;
    if (!script.trim()) return toast(isAd() ? 'Chưa có lời quảng cáo. Bấm «Muse viết lời quảng cáo» hoặc dán lời vào ô.' : 'Dán câu chuyện trước.');
    if (fromStart && scenes.length && !confirm('Phân tích lại từ đầu sẽ thay toàn bộ các cảnh đang có. Tiếp tục?')) return;
    const resuming = !fromStart && canResume(), before = resuming ? scenes : [];
    analyzing = true; renderAnalyze();
    try {
      const result = await call('storyAnalyze', { script, ...options(), ...(resuming ? { resume: { from: resume.from, cast: resume.cast, understanding: resume.understanding } } : {}) });
      if (result?.scenes?.length) {
        scenes = [...before, ...result.scenes].map((s, i) => ({ ...s, title: `Cảnh ${i + 1}` }));
        const u = result.understanding || (resuming ? resume.understanding : null);
        understood = u || result.cast ? { summary: u?.summary || '', approach: u?.approach || '', setting: u?.setting || '', cast: result.cast || (resuming ? resume.cast : '') || '' } : null;
        renderScenes();
        const stop = result.incomplete;
        resume = stop ? { script, from: stop.from, cast: result.cast || (resuming ? resume.cast : ''), understanding: u || null } : null;
        $('storyInfo').textContent = stop
          ? `Muse đã chia ${scenes.length} cảnh, dừng ở câu ${stop.from}/${stop.total}. ${stop.message} Bấm «Phân tích tiếp» để Muse làm tiếp từ đó (giữ nguyên các cảnh đã có).`
          : `Muse đã chia ${scenes.length} cảnh.${result.notes?.length ? ' ' + result.notes.join(' ') : ''} ${isTip() ? 'Xem lại lời đọc, prompt ảnh và prompt chuyển động, rồi bấm Tạo ảnh + clip.' : 'Xem lại lời đọc và prompt, rồi bấm Tạo clip.'}`;
        if (stop) toast(`Muse dừng ở câu ${stop.from}/${stop.total}. Bấm «Phân tích tiếp» để làm tiếp.`);
      }
    } finally { analyzing = false; renderAnalyze(); }
  }
  // Tiến độ lấy từ tiến trình chính (state.story.analyze) nên vẫn đúng khi tải lại giao diện.
  function renderAnalyze() {
    const a = state?.story?.analyze || {}, busy = analyzing || writing || Boolean(a.busy);
    const writingNow = writing || (a.busy && a.kind === 'write');
    $('storyAnalyze').disabled = busy; $('storyAnalyzeAgain').hidden = busy || !canResume(); $('adWrite').disabled = busy; $('adQuick').disabled = busy; $('storyAnalyzeStop').hidden = !busy;
    $('storyAnalyze').textContent = busy && !writingNow ? 'Muse đang phân tích…' : canResume() ? 'Phân tích tiếp' : 'Phân tích bằng Muse';
    $('adWrite').textContent = writingNow ? 'Muse đang viết…' : 'Muse viết lời quảng cáo';
    if (busy && a.progress) $('storyInfo').textContent = a.progress;
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
      if (!isAd() || !refs.length || analyzing || writing) return;
      if (!pristine()) { $('storyInfo').textContent = 'Đã đổi tùy chọn. Bấm «Tạo lại cảnh» để áp dụng (sẽ thay các cảnh đang có).'; return; }
      buildAd(false);
    }, delay);
  }
  // Đổi ảnh sản phẩm: tạo lại cảnh; bỏ ảnh thì xóa các cảnh tự tạo chưa sửa.
  function refsChanged() {
    refInfo();
    if (refs.length) autoAd(60);
    else if (isAd() && autoSnap && scenes.length && sceneSig() === autoSnap) { clearTimeout(autoTimer); scenes = []; autoSnap = ''; renderScenes(); }
  }
  // Muse viết lời quảng cáo từ thông tin sản phẩm; kết quả vào ô lời quảng cáo để người dùng sửa.
  async function writeAd() {
    if (analyzing || writing) return;
    if (!$('adProduct').value.trim()) { $('adMore').open = true; $('adProduct').focus(); return toast('Nhập tên sản phẩm trước.'); }
    if ($('storyScript').value.trim() && !confirm('Ô lời quảng cáo đang có chữ. Viết mới sẽ thay toàn bộ và xóa các cảnh đã chia. Tiếp tục?')) return;
    writing = true; renderAnalyze();
    try {
      const result = await call('storyAdWrite', options());
      if (result?.script) {
        $('storyScript').value = result.script; saved.script = result.script; persist();
        scenes = []; resume = null; renderScenes();
        $('storyInfo').textContent = 'Muse đã viết lời quảng cáo. Đọc và sửa cho đúng ý, rồi bấm «Phân tích bằng Muse» để chia cảnh.';
      }
    } finally { writing = false; renderAnalyze(); }
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
    ['storyHead', 'text', '1. Câu chuyện', '1. Lời quảng cáo (không bắt buộc)', '1. Mẹo vặt (các bước)'],
    ['storyScript', 'placeholder', 'Chỉ cần dán nguyên câu chuyện. Muse tự đọc hiểu để chia cảnh và viết prompt hình; giọng đọc sẽ đọc đúng nguyên văn câu chuyện này.', 'Không bắt buộc. Muốn có giọng đọc và phụ đề thì mở «Tùy chỉnh thêm» rồi bấm «Muse viết lời quảng cáo», hoặc tự dán lời quảng cáo vào đây. Giọng đọc sẽ đọc đúng nguyên văn lời này.', 'Dán nguyên mẹo vặt: mỗi bước một hoặc vài câu ngắn, theo đúng thứ tự. Muse chia mỗi bước thành một cảnh, vẽ ảnh chụp thật cho bước đó rồi cho ảnh chuyển động; giọng đọc sẽ đọc đúng nguyên văn mẹo này.'],
    ['storyStyle', 'placeholder', 'Ví dụ: hoạt hình màu nước', 'Ví dụ: hoạt hình màu nước', 'Mặc định là ảnh chụp thật. Ví dụ: ảnh chụp thật, bếp trắng, ánh sáng cửa sổ'],
    ['storyCharLabel', 'text', 'Nhân vật chính (không bắt buộc)', 'Người mẫu / người dùng (không bắt buộc)'],
    ['storyCharacter', 'placeholder', 'Để trống nếu không cần. Ví dụ: Mai, bé gái tóc đen, áo dài trắng', 'Để trống nếu không cần. Ví dụ: cô gái 25 tuổi, tóc dài, áo sơ mi trắng'],
    ['storyRefs', 'text', 'Chọn ảnh nhân vật', 'Chọn ảnh sản phẩm'],
    ['storyRefPaste', 'text', 'Dán hoặc kéo ảnh nhân vật chính vào đây. Ảnh này gắn vào mọi cảnh để nhân vật giữ nguyên; nhân vật khác do Muse nhận ra và vẽ cùng hình dạng với nhân vật này (chỉ khác màu áo, giới tính, tóc…).', 'Dán hoặc kéo ảnh sản phẩm vào đây (nên 1–2 ảnh rõ nét, nền sạch). Ảnh gắn vào mọi cảnh để sản phẩm giữ đúng hình dạng và màu sắc.']
  ];
  const IDLE_INFO = ['Dán câu chuyện rồi bấm «Phân tích bằng Muse» (cần đã đăng nhập Muse tài khoản 1). Muse đọc hiểu cả truyện rồi mới chia cảnh và viết prompt hình.', 'Thả ảnh sản phẩm, chọn mẫu: các cảnh quay hiện ngay bên dưới. Muốn có lời đọc thì mở «Tùy chỉnh thêm», viết lời quảng cáo rồi bấm «Phân tích bằng Muse».', 'Dán mẹo vặt rồi bấm «Phân tích bằng Muse». Muse chia mỗi bước thành một cảnh: một ảnh chụp thật, rồi ảnh đó thành clip chuyển động. Mỗi bước tốn 2 lượt Muse (1 ảnh + 1 clip).'];
  function applyMode(initial) {
    const ad = isAd(), tip = isTip();
    for (const [id, kind, story, adText, tipText] of MODE_TEXT) {
      if (initial && !ad && !tip) continue;
      const value = tip ? (tipText ?? story) : ad ? adText : story;
      if (kind === 'text') $(id).textContent = value; else $(id).placeholder = value;
    }
    $('modeStory').setAttribute('aria-pressed', String(!ad && !tip)); $('modeAd').setAttribute('aria-pressed', String(ad)); $('modeTip').setAttribute('aria-pressed', String(tip));
    // Mẹo vặt không dùng nhân vật: ảnh nào cũng do Muse vẽ từ prompt ảnh của bước.
    for (const id of ['storyRefRow', 'storyRefPaste', 'storyRefInfo']) $(id).hidden = tip;
    for (const id of ['storyCharacter', 'storyForm']) $(id).closest('label').hidden = tip;
    $('storyCreate').textContent = tip ? '▶ Tạo ảnh + clip' : '▶ Tạo clip';
    $('adBox').hidden = !ad; $('storyCompose').classList.toggle('adMode', ad);
    // Ô «Tỉ lệ» là một: ở chế độ quảng cáo nằm trong khung quảng cáo, ngược lại về chỗ cũ.
    if (ad) $('adAspectSlot').append($('storyAspectLabel')); else if (!initial) $('storyOptionsRow').prepend($('storyAspectLabel'));
    refInfo();
    if (!initial || ad || tip) { const a = state?.story?.analyze || {}; if (!analyzing && !writing && !a.busy) $('storyInfo').textContent = IDLE_INFO[tip ? 2 : ad ? 1 : 0]; }
  }
  function setMode(next) {
    if (mode === next) return;
    // Cảnh của chế độ Mẹo vặt có thêm prompt ảnh; cảnh của chế độ khác thì không: không trộn lẫn.
    const reset = scenes.length > 0 && (next === 'tip' || scenes.some(s => s.image !== undefined));
    if (reset && !confirm('Đổi chế độ sẽ xóa các cảnh đang có (mỗi chế độ chia cảnh khác nhau). Tiếp tục?')) return;
    mode = next; saved.mode = mode; persist();
    if (reset) { scenes = []; resume = null; understood = null; autoSnap = ''; }
    applyMode(false);
    renderScenes();
    refreshChecks();
  }

  /* ---------- ảnh nhân vật ---------- */
  function refInfo() {
    if (isTip()) { $('storyRefInfo').textContent = ''; return; }
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
  function newStoryId() {
    const d = new Date(), p = n => String(n).padStart(2, '0');
    return `Truyen-${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`;
  }
  async function commit(startNow) {
    if (!scenes.length) return toast('Chia cảnh trước.');
    if (scenes.some(s => !String(s.prompt || '').trim())) return toast('Cảnh nào cũng cần prompt.');
    if (isTip() && scenes.some(s => !String(s.image || '').trim())) return toast('Bước nào cũng cần prompt ảnh.');
    if (startNow) {
      if (state.active || state.starting || state.stopping || state.merging || state.packaging) return toast('Dừng hàng đợi hiện tại trước khi tạo lượt mới.');
      if (!state.settings.output) return toast('Chọn thư mục lưu video trước.');
      const question = isTip()
        ? `Thêm ${scenes.length} bước (${scenes.length} ảnh + ${scenes.length} clip) và chạy ngay? Mỗi bước tốn 2 lượt Muse (1 ảnh, 1 clip) nên có thể dùng nhiều credit Muse. Tool tạo hết ảnh trước, rồi làm clip từ đúng ảnh đó, gửi nguyên prompt đã xem.`
        : `Thêm ${scenes.length} cảnh và chạy toàn bộ clip kể chuyện đang chờ? Tạo video có thể dùng credit Muse. Tool gửi nguyên prompt đã xem, cùng ảnh ${isAd() ? 'sản phẩm' : 'nhân vật'}.`;
      if (!confirm(question)) return;
    }
    const storyId = newStoryId();
    const clipPrompt = s => (plan().stripBeatTags ? plan().stripBeatTags(s.prompt) : s.prompt);
    // Mẹo vặt: mỗi bước thành một việc ảnh rồi một việc clip. Tạo hết ảnh trước (ảnh rẻ, hỏng thì dừng sớm), clip chỉ chạy khi ảnh cùng số bước đã lưu.
    const jobs = isTip()
      ? [
        ...scenes.map((s, i) => ({ kind: 'story', storyId, phase: 'image', number: i + 1, title: `${s.title} · ảnh`, source: s.voiceover || s.source || '', prompt: s.image })),
        ...scenes.map((s, i) => ({ kind: 'story', storyId, phase: 'clip', dependsOn: 'image', number: i + 1, title: `${s.title} · clip`, source: s.voiceover || s.source || '', voiceover: s.voiceover || '', prompt: clipPrompt(s), durationSeconds: secondsOf(s) }))
      ]
      : scenes.map(s => ({ kind: 'story', storyId, title: s.title, source: s.voiceover || s.source || '', voiceover: s.voiceover || '', prompt: clipPrompt(s), durationSeconds: secondsOf(s), image: refs[0] || '', references: [...refs] }));
    const result = await call('add', jobs);
    if (!result) return;
    scenes = []; renderScenes(); render(result);
    if (startNow) render(await call('start', { kind: 'story' }));
    $('storyPanel').open = false;
    $('queueWorkspace').scrollIntoView({ block: 'start', behavior: 'smooth' });
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
      return list.map(x => [x.id, `${x.name} · ${x.language}${x.lang === lang ? ' ✓' : ''}`, x.lang]);
    }
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
      select.replaceChildren(...(choices.length ? choices : [[ '', e === 'none' ? '—' : e === 'clone' ? 'Chưa có giọng clone' : e === 'windows' ? 'Không thấy giọng Windows' : 'Chưa có giọng' ]]).map(([value, label]) => { const o = el('option', '', label); o.value = value; return o; }));
      const remembered_ = choices.find(([value]) => value === remembered);
      // Nhớ giọng đã chọn, trừ khi nó khác ngôn ngữ kịch bản mà đã có giọng hợp ngôn ngữ.
      if (remembered_ && (e !== 'edge' || remembered_[2] === storyLanguage() || !choices.some(c => c[2] === storyLanguage()))) select.value = remembered;
      else if (e === 'clone' && choices.length) select.value = choices[choices.length - 1][0];
      else if (e === 'edge' && choices.length) select.value = choices[0][0];
    }
    select.disabled = !choices.length;
    $('storyListen').disabled = listening || e === 'none' || !choices.length || Boolean(v.setupBusy);
    $('storyListen').textContent = listening ? 'Đang tạo giọng…' : '▶ Nghe thử giọng';
    const ready = v.ready || {};
    $('storySetup').disabled = Boolean(v.setupBusy);
    $('storySetup').textContent = v.setupBusy ? 'Đang cài giọng…' : (ready.edge || ready.clone) ? 'Cài lại giọng miễn phí' : 'Cài giọng miễn phí';
    $('storySetupStop').hidden = !v.setupBusy;
    let info = '';
    if (v.setupBusy) info = v.setupMessage || 'Đang cài giọng…';
    else if (v.setupError) info = v.setupError;
    else if (e === 'none') info = 'Không lồng tiếng: video giữ tiếng động của clip, phụ đề lấy từ lời đọc của cảnh.';
    else if (e === 'edge' && !ready.edge) info = 'Chưa cài giọng Microsoft. Bấm «Cài giọng miễn phí» (cần Python 3.10–3.13 trên máy và mạng).';
    else if (e === 'clone' && !ready.clone) info = 'Chưa cài giọng clone. Bấm «Cài giọng miễn phí» (cần Python 3.10–3.13 và mạng; lần đầu tải mô hình nên lâu).';
    else if (e === 'clone' && !choices.length) info = 'Chưa có giọng clone. Mở mục «Clone giọng của bạn» và thêm file ghi âm mẫu.';
    else if (e === 'windows' && v.platform !== 'win32') info = 'Giọng có sẵn chỉ có trên Windows.';
    else if (e === 'windows' && !choices.length) info = 'Windows chưa có giọng đọc nào. Thêm giọng tiếng Việt trong Cài đặt Windows → Ngôn ngữ, hoặc dùng giọng Microsoft.';
    else if (e === 'clone') info = 'Giọng clone chạy ngay trên máy, miễn phí, dành cho tiếng Việt (ngôn ngữ khác dùng giọng Microsoft hoặc giọng Windows). Lần nghe/xuất đầu tiên phải tải mô hình nên lâu.';
    else if (e === 'edge') info = 'Giọng Microsoft miễn phí, nhiều ngôn ngữ (✓ = hợp ngôn ngữ kịch bản), cần có mạng khi đọc.';
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
  $('storyListen').onclick = async () => {
    listening = true; renderVoice();
    try {
      const file = await call('storyListen', { engine: engine(), voice: $('storyVoice').value, tempo: $('storyTempo').value, text: sampleText() });
      if (file) { const audio = $('storyAudio'); audio.src = localFileUrl(file); audio.hidden = false; audio.play().catch(() => {}); }
    } finally { listening = false; renderVoice(); }
  };

  /* ---------- phụ đề ---------- */
  function captionOptions() {
    return { font: $('subFont').value, size: Math.min(120, Math.max(24, Number($('subSize').value) || 54)), color: $('subColor').value, outline: $('subOutline').value, position: $('subPos').value, box: $('subBox').checked };
  }
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
  function drawCaption(canvas, value, o, background) {
    const ctx = canvas.getContext('2d'), w = canvas.width, h = canvas.height;
    ctx.clearRect(0, 0, w, h);
    if (background) { const g = ctx.createLinearGradient(0, 0, w, h); g.addColorStop(0, '#3a5877'); g.addColorStop(1, '#1b2836'); ctx.fillStyle = g; ctx.fillRect(0, 0, w, h); }
    const size = Math.round(o.size * Math.min(w, h) / 1080), lineHeight = Math.round(size * 1.3);
    ctx.font = `700 ${size}px "${o.font}", "Segoe UI", Arial, sans-serif`;
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.lineJoin = 'round';
    const lines = wrap(ctx, value, w * 0.86), block = lines.length * lineHeight, margin = Math.round(h * 0.08);
    const top = o.position === 'top' ? margin : o.position === 'middle' ? (h - block) / 2 : h - margin - block;
    if (o.box && lines.length) {
      const widest = Math.max(...lines.map(l => ctx.measureText(l).width)), pad = size * 0.45, x = (w - widest) / 2 - pad, y = top - pad * 0.6;
      ctx.fillStyle = 'rgba(0,0,0,0.55)'; ctx.beginPath();
      if (ctx.roundRect) ctx.roundRect(x, y, widest + pad * 2, block + pad * 1.2, size * 0.3); else ctx.rect(x, y, widest + pad * 2, block + pad * 1.2);
      ctx.fill();
    }
    lines.forEach((line, i) => {
      const y = top + i * lineHeight + lineHeight / 2;
      ctx.lineWidth = Math.max(2, size * 0.16); ctx.strokeStyle = o.outline; ctx.strokeText(line, w / 2, y);
      ctx.fillStyle = o.color; ctx.fillText(line, w / 2, y);
    });
    // Vùng chứa chữ (số chẵn, trong khung hình): chỉ vùng này được gửi đi và phủ lên video, nên dựng nhanh hơn nhiều.
    const widest = lines.length ? Math.max(...lines.map(l => ctx.measureText(l).width)) : 0, pad = size * 0.6;
    const x0 = Math.max(0, Math.floor((w - widest) / 2 - pad) & ~1), y0 = Math.max(0, Math.floor(top - pad) & ~1);
    const x1 = Math.min(w, Math.ceil((w + widest) / 2 + pad)), y1 = Math.min(h, Math.ceil(top + block + pad));
    return { x: x0, y: y0, w: Math.max(2, (x1 - x0 + 1) & ~1), h: Math.max(2, (y1 - y0 + 1) & ~1) };
  }
  function drawPreview() {
    const canvas = $('subPreview'), [w, h] = dims($('storyAspect').value);
    if (canvas.width !== w || canvas.height !== h) { canvas.width = w; canvas.height = h; }
    drawCaption(canvas, 'Ngày xưa có một cô bé tên Mai sống ở làng ven sông.', captionOptions(), true);
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
  async function exportVideo() {
    const story = currentStory();
    if (!story) return toast('Chưa có clip kể chuyện nào trong hàng đợi.');
    if (story.done < story.total) return toast(`Còn ${story.total - story.done} cảnh chưa xong. Chạy hàng đợi cho xong rồi xuất.`);
    exporting = true; renderStatus();
    try {
      const subtitles = $('subOn').checked, srt = $('subSrt').checked, aspect = $('storyAspect').value;
      const prep = await call('storyPrepare', { storyId: story.id, engine: engine(), voice: $('storyVoice').value, tempo: $('storyTempo').value });
      if (!prep) return;
      const [w, h] = dims(aspect), canvas = document.createElement('canvas');
      canvas.width = w; canvas.height = h;
      const o = captionOptions(), out = [];
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
      const result = await call('storyBuild', { runId: prep.runId, name: $('storyName').value.trim() || story.id, aspect, subtitles, srt, sfx: $('storySfx').value, scenes: out });
      if (result) { render(result); toast('Đã xuất MP4.'); }
    } finally { exporting = false; renderStatus(); }
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
    let line = '';
    if (s.error && !busy) line = s.error;
    else if (busy) line = s.progress || 'Đang xử lý…';
    else if (s.output) line = `✓ ${baseName(s.output)}${s.srt ? ' + ' + baseName(s.srt) : ''}. ${notesText(s.notes)}`;
    else if (story && story.done < story.total) line = `Còn ${story.total - story.done} cảnh chưa có clip. Chạy hàng đợi cho xong rồi xuất MP4.`;
    else if (story) line = `${story.total} cảnh đã sẵn sàng. Chọn giọng, phụ đề rồi bấm Xuất MP4.`;
    else line = 'Chưa có clip kể chuyện. Chia cảnh và bấm Tạo clip trước.';
    $('storyStatus').textContent = line;
    // Xem video đã xuất ngay trong app. Đang xuất thì gỡ khung phát để lần sau nạp lại file mới (kể cả khi trùng tên).
    const video = $('storyVideo'), videoFile = !busy && s.output ? s.output : '';
    if (videoFile !== lastVideo) {
      lastVideo = videoFile; video.pause(); $('storyVideoError').hidden = true;
      if (videoFile) { video.src = localFileUrl(videoFile); video.hidden = false; }
      else { video.removeAttribute('src'); video.load(); video.hidden = true; }
    }
    if (story && story.id !== lastStory) { lastStory = story.id; }
  }

  $('modeStory').onclick = () => setMode('story'); $('modeAd').onclick = () => setMode('ad'); $('modeTip').onclick = () => setMode('tip'); $('adWrite').onclick = writeAd; $('adQuick').onclick = quickAd;
  $('storyAnalyze').onclick = () => analyze(false); $('storyAnalyzeAgain').onclick = () => analyze(true); $('storyScript').addEventListener('input', renderAnalyze);
  $('storyAnalyzeStop').onclick = async () => { const r = await call('storyAnalyzeCancel'); if (r) render(r); };
  $('storyAsk').onclick = ask; $('storyCopy').onclick = copyInstruction; $('storyParse').onclick = parse;
  $('storyRefs').onclick = async () => { const files = await call('images', { multiple: true }); if (files?.length) { refs = files; refsChanged(); } };
  $('storyRefsClear').onclick = () => { refs = []; refsChanged(); };
  $('storyRefPaste').onpaste = pasteRefs; $('storyRefPaste').ondragover = e => e.preventDefault(); $('storyRefPaste').ondrop = pasteRefs;
  $('storyCommit').onclick = () => commit(false); $('storyCreate').onclick = () => commit(true);
  $('storyExport').onclick = exportVideo;
  $('storyStop').onclick = async () => { const r = await call('storyCancel'); if (r) render(r); };
  $('storyOpen').onclick = () => call('storyReveal');
  $('storyVideo').addEventListener('error', () => { if ($('storyVideo').getAttribute('src')) $('storyVideoError').hidden = false; });
  $('storyVideo').addEventListener('loadeddata', () => { $('storyVideoError').hidden = true; });
  $('storyAspect').addEventListener('change', drawPreview);
  for (const id of ['adLength', 'storyAspect']) $(id).addEventListener('change', () => autoAd());
  for (const id of ['adProduct', 'storyStyle', 'storyCharacter']) $(id).addEventListener('input', () => autoAd(500));
  $('adMore').addEventListener('toggle', () => $('storyCompose').classList.toggle('adOpen', $('adMore').open));
  renderChips(); applyMode(true); renderScenes(); drawPreview();

  window.storyUi = {
    render() { renderVoice(); renderStatus(); renderAnalyze(); },
    drawCaption, wrap, get scenes() { return scenes; }
  };
})();
