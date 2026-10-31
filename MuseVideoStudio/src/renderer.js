const $ = id => document.getElementById(id);
let state, images = [], drafts = [{prompt:'', references:[]}], filter = 'all', toastTimer;
const labels = { pending: 'Đang chờ', running: 'Đang tạo video', completed: 'Hoàn tất', failed: 'Cần kiểm tra', interrupted: 'Bị gián đoạn' };
function toast(message) { $('toast').textContent = message; $('toast').hidden = false; clearTimeout(toastTimer); toastTimer = setTimeout(() => $('toast').hidden = true, 10000); }
async function call(name, data) { try { return await window.studio.invoke(name, data); } catch(e) { toast(e.message.replace(/^Error invoking remote method '[^']+': Error: /,'')); return null; } }
function el(tag, cls, text) { const e = document.createElement(tag); if (cls) e.className = cls; if (text !== undefined) e.textContent = text; return e; }
function render(next) {
  if (!next) return; state = next;
  const jobs = state.jobs;
  const selected = $('accountPicker').value;
  $('accountPicker').replaceChildren(...Array.from({length:state.settings.accountCount},(_,i)=> { const o=el('option','',`Tài khoản ${i+1}`);o.value=i;return o; }));
  $('accountPicker').value = Number(selected) < state.settings.accountCount ? selected || '0' : '0';
  const account = state.accounts?.find(a=>a.index === Number($('accountPicker').value));
  $('sessionStatus').textContent = account?.warning || (account?.rememberSession ? 'Cookie phiên lưu mã hóa riêng cho tài khoản này trên máy.' : 'Mỗi tài khoản giữ một phiên đăng nhập riêng.');
  $('browserInfo').textContent = ({builtin:'Trình duyệt tích hợp',chrome:'Google Chrome',edge:'Microsoft Edge',custom:'Chromium tùy chọn'})[state.settings.browserChoice || 'builtin'];
  $('parallelInfo').textContent = `${state.settings.accountCount} tài khoản · 1 tác vụ / tài khoản`;
  $('total').textContent = $('navCount').textContent = $('allCount').textContent = jobs.length;
  $('folderPath').textContent = state.settings.output || 'Chưa chọn thư mục';
  $('queueState').textContent = state.active ? state.paused ? 'Sẽ dừng sau tác vụ hiện tại' : 'Đang xử lý hàng đợi' : 'Hàng đợi đang dừng';
  $('start').disabled = state.active || state.merging || state.packaging || !jobs.some(j => j.status === 'pending');
  $('pause').disabled = !state.active;
  $('mergeStatus').textContent = state.mergeError || state.mergeProgress || (state.mergedOutput ? state.mergedOutput : state.settings.autoMerge ? 'Tự nối khi toàn bộ prompt hoàn tất · Cần FFmpeg và ffprobe.' : 'Tự nối đang tắt; có thể nối thủ công khi đủ video.');
  $('revealMerged').hidden = !state.mergedOutput;
  $('mergeNow').disabled = state.active || state.merging || state.packaging || !jobs.length || jobs.some(j=>j.status !== 'completed');
  $('packageStatus').textContent = state.packageError || state.packageProgress || state.editPackageDir || 'Clip được sao chép và đánh số theo prompt để nhập vào CapCut, giữ nguyên video nguồn.';
  $('packageClips').disabled = state.active || state.merging || state.packaging || !jobs.length || jobs.some(j=>j.status !== 'completed');
  $('openPackage').hidden = !state.editPackageDir;
  $('finishMode').textContent = 'Sau khi tạo xong: ' + (state.settings.autoMerge ? 'Nối thành MP4' : state.settings.autoPackage ? 'Xuất clip cho CapCut' : 'Giữ clip riêng');
  $('summary').textContent = `${jobs.filter(j => j.status === 'completed').length} / ${jobs.length} video hoàn tất`;
  const shown = jobs.filter(j => filter === 'all' || (filter === 'failed' ? ['failed','interrupted'].includes(j.status) : j.status === filter));
  $('jobs').replaceChildren(); $('empty').hidden = jobs.length > 0;
  for (const j of shown) {
    const card = el('article','card'), preview = el('div','preview');
    if (j.image) { const img = el('img'); img.src = 'file:///' + j.image.replace(/\\/g,'/').split('/').map(encodeURIComponent).join('/').replace(/^\//,'').replace(/^[A-Za-z]%3A/i, m=>m[0]+':'); img.onerror=()=>{img.replaceWith(el('span','glyph','▧'));}; img.alt = 'Ảnh nguồn'; preview.append(img); }
    else preview.append(el('span','glyph','▷'));
    preview.append(el('span','number','#' + (jobs.indexOf(j) + 1)));
    const body = el('div','cardBody'); body.append(el('span','badge ' + j.status,labels[j.status] || j.status),el('p','prompt',j.prompt),el('p','meta',`${j.references?.length || (j.image ? 1 : 0)} ảnh tham chiếu${j.account ? ' · Tài khoản ' + j.account : ''}`));
    if (j.error) body.append(el('p','error',j.error));
    const actions = el('div','cardActions');
    function button(text, action) { const b = el('button','secondary',text); b.onclick = action; actions.append(b); }
    if (j.output) button('▱ Mở vị trí video', () => call('reveal',j.id));
    if (['failed','interrupted'].includes(j.status)) button('↻ Chạy lại', async () => {
      if (confirm('Kiểm tra video đã tạo trên Muse trước. Chạy lại có thể tạo video trùng và dùng thêm lượt tạo. Tiếp tục?')) render(await call('retry',j.id));
    });
    if (j.status !== 'running') button('Xóa',async () => render(await call('remove',j.id)));
    body.append(actions); card.append(preview,body); $('jobs').append(card);
  }
}
$('browser').onclick = () => call('browser',Number($('accountPicker').value));
$('folder').onclick = async () => render(await call('folder'));
$('export').onclick = () => call('export');
$('images').onclick = async () => { const chosen = await call('images'); if (chosen) { images = chosen; $('imageInfo').textContent = images.length ? `${images.length} ảnh đã chọn` : 'Không có ảnh'; } };
$('add').onclick = async () => {
  const prompts = $('prompts').value.split(/\r?\n/).map(x => x.trim()).filter(Boolean);
  if (!prompts.length) return toast('Nhập ít nhất một prompt.');
  if (images.length > 1 && images.length !== prompts.length) return toast('Số ảnh phải bằng số prompt, hoặc chọn một ảnh dùng chung.');
  drafts = drafts.filter(d=>d.prompt.trim() || d.references.length);
  drafts.push(...prompts.map((prompt,i)=>({prompt,references:images.length===1 ? [images[0]] : images[i] ? [images[i]] : []})));
  $('prompts').value=''; images=[]; $('imageInfo').textContent='Không bắt buộc'; renderDrafts();
};
$('start').onclick = async () => {
  if (!state.settings.output) return toast('Chọn thư mục lưu video trước khi chạy.');
  if (confirm('Bạn đã đăng nhập và mở đúng chat Muse cho tất cả tài khoản đã cấu hình? Tool sẽ gửi các prompt đang chờ và có thể dùng lượt tạo/credit của tài khoản. Bản tích hợp trình duyệt chưa được kiểm chứng; nên thử một tác vụ trước.')) render(await call('start'));
};
$('pause').onclick = async () => render(await call('pause'));
document.querySelectorAll('[data-filter]').forEach(b => b.onclick = () => { filter = b.dataset.filter; document.querySelectorAll('[data-filter]').forEach(x => x.classList.toggle('active',x === b)); render(state); });
$('navQueue').onclick = () => window.scrollTo({top:0,behavior:'smooth'});
$('configure').onclick = () => { for (const key of ['composer','fileInput','submit','video','timeoutMinutes','accountCount','ffmpeg','browserChoice','browserPath']) $('settingsForm').elements.namedItem(key).value = state.settings[key]; $('settingsForm').elements.namedItem('finishAction').value = state.settings.autoMerge ? 'merge' : state.settings.autoPackage ? 'package' : 'keep'; $('settingsDialog').showModal(); };
$('closeSettings').onclick = () => $('settingsDialog').close();
$('settingsForm').onsubmit = async e => { e.preventDefault(); const data = Object.fromEntries(new FormData(e.target)); const result = await call('settings',data); if(result) { render(result); $('settingsDialog').close(); toast('Đã lưu cấu hình.'); } };
window.studio.onUpdate(render);
call('state').then(render);

function renderDrafts() {
  $('draftRows').replaceChildren();
  drafts.forEach((draft,index)=>{
    const row=el('div','draftRow'), content=el('div','draftContent');
    const label=el('strong','',`PROMPT ${index+1}${draft.title ? ' · '+draft.title : ''}`), input=el('textarea');
    input.value=draft.prompt;input.placeholder='Nhập prompt cho video này…';input.oninput=()=>draft.prompt=input.value;
    const refs=el('div','referenceList');
    for(const ref of draft.references) refs.append(el('span','referenceName',ref.split(/[\\/]/).pop()));
    const tools=el('div','draftTools');
    const attach=el('button','secondary','▧ Ảnh tham chiếu riêng');attach.onclick=async()=>{const files=await call('images');if(files?.length){draft.references=files;renderDrafts();}};
    const clear=el('button','secondary','Bỏ ảnh');clear.onclick=()=>{draft.references=[];renderDrafts();};
    const remove=el('button','secondary','Xóa dòng');remove.onclick=()=>{drafts.splice(index,1);renderDrafts();};
    tools.append(attach,clear,remove);content.append(label,input,refs,tools);row.append(content);$('draftRows').append(row);
  });
  $('commitDrafts').disabled=!drafts.length;
  $('createDrafts').disabled=!drafts.length;
}
$('newDraft').onclick=()=>{drafts.push({prompt:'',references:[]});renderDrafts();};
async function submitDrafts(startNow) {
  if(!drafts.length || drafts.some(d=>!d.prompt.trim())) return toast('Điền prompt cho từng dòng hoặc xóa dòng trống.');
  if(startNow) {
    if(state.active || state.merging || state.packaging) return toast('Chờ hàng đợi hiện tại dừng trước khi tạo lượt mới.');
    if(!state.settings.output) return toast('Chọn thư mục lưu video trước khi tạo.');
    if(!confirm('Thêm các dòng này và chạy toàn bộ prompt đang chờ? Hãy đăng nhập, mở đúng chat Muse cho từng tài khoản trước. Việc tạo video có thể dùng credit của tài khoản.')) return;
  }
  const result=await call('add',drafts.map(d=>({prompt:d.prompt,image:d.references[0]||'',references:d.references,source:d.source||'',title:d.title||''})));
  if(result){drafts=[{prompt:'',references:[]}];renderDrafts();render(result);if(startNow)render(await call('start'));}
}
$('commitDrafts').onclick=()=>submitDrafts(false);
$('createDrafts').onclick=()=>submitDrafts(true);

renderDrafts();

$('mergeNow').onclick=async()=>render(await call('merge'));
$('revealMerged').onclick=()=>call('revealMerged');
$('chooseFfmpeg').onclick=async()=>{const result=await call('chooseFfmpeg');if(result){render(result);$('settingsForm').elements.namedItem('ffmpeg').value=result.settings.ffmpeg;}};

$('packageClips').onclick=async()=>render(await call('packageClips'));
$('openPackage').onclick=()=>call('openPackage');

$('accountPicker').onchange=()=>render(state);

$('chooseBrowser').onclick=async()=>{const file=await call('chooseBrowser');if(file){$('settingsForm').elements.namedItem('browserPath').value=file;$('settingsForm').elements.namedItem('browserChoice').value='custom';}};

$('planScript').onclick=()=>{
  try {
    const scenes=window.scriptPlanner.planScript($('scriptInput').value,{mode:$('scriptMode').value,seconds:Number($('scriptSeconds').value),aspect:$('scriptAspect').value,style:$('scriptStyle').value,maxChars:Number($('scriptMaxChars').value)});
    drafts=drafts.filter(d=>d.prompt.trim() || d.references.length);
    drafts.push(...scenes.map(scene=>({...scene,references:[]})));
    renderDrafts();
    $('scriptResult').textContent=`Đã thêm ${scenes.length} cảnh vào các dòng prompt bên dưới. Kiểm tra và đính kèm ảnh riêng trước khi đưa vào hàng đợi.`;
    $('draftRows').scrollIntoView({behavior:'smooth',block:'start'});
  } catch(e) {toast(e.message);}
};
