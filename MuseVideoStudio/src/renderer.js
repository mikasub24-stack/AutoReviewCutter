const $=id=>document.getElementById(id);
let state,drafts=[],referenceFiles=[],filter='all',dirty=true,committed=false,toastTimer;
const labels={pending:'Đang chờ',running:'Đang xử lý',completed:'Hoàn tất',failed:'Cần kiểm tra',interrupted:'Đã dừng'};
function toast(text){$('toast').textContent=text;$('toast').hidden=false;clearTimeout(toastTimer);toastTimer=setTimeout(()=>$('toast').hidden=true,10000);}
async function call(name,data){try{return await window.studio.invoke(name,data);}catch(e){toast(e.message.replace(/^Error invoking remote method '[^']+': Error: /,''));return null;}}
function el(tag,cls,text){const e=document.createElement(tag);if(cls)e.className=cls;if(text!==undefined)e.textContent=text;return e;}
const refMode=()=>$('referenceMode').value;
function mapped(items){return window.referenceMap.mapReferences(items,referenceFiles,{mode:refMode()});}
function mappingInfo(result){
  let text=refMode()==='none'?'Không dùng ảnh.':refMode()==='shared'?`${referenceFiles.length} ảnh chung cho toàn bộ prompt.`:`${referenceFiles.length} ảnh theo số thứ tự.`;
  if(result?.missing.length)text+=` Chưa có ảnh cho prompt: ${result.missing.slice(0,20).join(', ')}${result.missing.length>20?'…':''}.`;
  if(result?.unmatched.length)text+=` ${result.unmatched.length} ảnh không khớp STT, không tự gán sang cảnh khác.`;
  $('referenceInfo').textContent=text;$('imageFolder').disabled=refMode()!=='numbered';
}
function remapDrafts(){const result=mapped(drafts);drafts=result.items;mappingInfo(result);renderDrafts();}
function prepare(){
  try{
    const text=$('prompts').value,mode=$('importMode').value;
    let items=mode==='script'?window.scriptPlanner.planScript(text,{seconds:Number($('scriptSeconds').value),aspect:$('scriptAspect').value,style:$('scriptStyle').value}):window.promptImport.importPrompts(text,{mode});
    const result=mapped(items);drafts=result.items;dirty=false;committed=false;mappingInfo(result);renderDrafts();
    const duration=drafts.every(j=>j.durationSeconds)?drafts.reduce((a,j)=>a+j.durationSeconds,0):null;
    $('importInfo').textContent=`Đã nhận ${drafts.length} prompt hoàn chỉnh${duration?` · mục tiêu ${Math.floor(duration/60)}:${String(duration%60).padStart(2,'0')}`:''}. Xem/sửa hoặc bấm Tạo video.`;
    return true;
  }catch(e){toast(e.message);return false;}
}
async function create(startNow,fromInput=false){
  if(fromInput&&(dirty||!drafts.length)){
    if(committed&&!dirty)return toast('Nội dung này đã thêm vào hàng đợi. Bấm Đọc / cập nhật danh sách nếu muốn tạo lại.');
    if(!prepare())return;
  }
  if(!drafts.length||drafts.some(d=>!d.prompt.trim()))return toast('Nhập prompt cho từng dòng hoặc xóa dòng trống.');
  if(startNow){
    if(state.active||state.starting||state.merging||state.packaging)return toast('Dừng hàng đợi hiện tại trước khi tạo lượt mới.');
    if(!state.settings.output)return toast('Chọn thư mục lưu video trước.');
    if(!confirm(`Thêm ${drafts.length} prompt và chạy toàn bộ tác vụ đang chờ? Tạo video có thể dùng credit Muse. Tool gửi nguyên prompt đã xem, cùng ảnh tham chiếu của từng cảnh.`))return;
  }
  const result=await call('add',drafts.map(d=>({...d,image:d.references?.[0]||'',references:d.references||[]})));
  if(result){drafts=[];committed=true;dirty=false;renderDrafts();render(result);if(startNow)render(await call('start'));}
}
async function pasteImages(event,target){
  const files=[...(event.clipboardData?.files||event.dataTransfer?.files||[])].filter(f=>f.type.startsWith('image/'));
  if(!files.length)return;event.preventDefault();
  const paths=[];for(const file of files){const saved=await call('pasteReference',{bytes:new Uint8Array(await file.arrayBuffer()),name:file.name});if(saved)paths.push(saved);}
  if(!paths.length)return;
  if(target){target.references=paths;target.image=paths[0];renderDrafts();}
  else{$('referenceMode').value='shared';referenceFiles=[paths[0]];remapDrafts();}
}
function renderDrafts(){
  $('draftRows').replaceChildren();
  drafts.forEach((draft,index)=>{
    const row=el('div','draftRow'),body=el('div','draftContent');
    body.append(el('strong','',`${draft.title||'Prompt '+(index+1)}${draft.durationSeconds?' · '+draft.durationSeconds+' giây':''}`));
    const input=el('textarea');input.value=draft.prompt;input.placeholder='Prompt hoàn chỉnh của cảnh này';input.oninput=()=>draft.prompt=input.value;
    const refs=el('div','referenceList');for(const file of draft.references||[])refs.append(el('span','referenceName',file.split(/[\\/]/).pop()));
    const actions=el('div','draftTools'),attach=el('button','secondary','Ảnh riêng'),clear=el('button','secondary','Bỏ ảnh dòng này'),remove=el('button','secondary','Xóa dòng');
    attach.onclick=async()=>{const files=await call('images',{multiple:true});if(files?.length){draft.references=files;renderDrafts();}};
    clear.onclick=()=>{draft.references=[];renderDrafts();};remove.onclick=()=>{drafts.splice(index,1);renderDrafts();};actions.append(attach,clear,remove);
    const paste=el('div','pasteZone',`Dán ảnh tại đây cho ${draft.title||'prompt '+(index+1)}`);paste.tabIndex=0;paste.onpaste=e=>pasteImages(e,draft);row.onpaste=e=>{if(e.target!==paste)pasteImages(e,draft);};
    body.append(input,refs,actions,paste);row.append(body);$('draftRows').append(row);
  });
  $('commitDrafts').disabled=$('createDrafts').disabled=!drafts.length;
}
function render(next){
  if(!next)return;state=next;const jobs=state.jobs,indexBefore=Number($('accountPicker').value||0),network=state.network||{checking:[],reports:[],errors:[]};
  $('accountPicker').replaceChildren(...Array.from({length:state.settings.accountCount},(_,i)=>{const o=el('option','',`Tài khoản ${i+1}`);o.value=i;return o;}));
  $('accountPicker').value=Math.min(indexBefore,state.settings.accountCount-1);const index=Number($('accountPicker').value);
  const browserName=({builtin:'Trình duyệt tích hợp',chrome:'Google Chrome',edge:'Microsoft Edge',custom:'Chromium tùy chọn'})[state.settings.browserChoice||'builtin'];$('browserInfo').textContent=browserName;
  const account=state.accounts?.find(a=>a.index===index);$('sessionStatus').textContent=account?.warning||(account?.rememberSession?'Cookie phiên lưu mã hóa riêng trên máy.':'Mỗi tài khoản giữ một phiên đăng nhập riêng.');
  $('logoutAccount').textContent=`Đăng xuất TK ${index+1} · ${browserName}`;$('logoutAccount').disabled=state.active||state.starting||state.merging||state.packaging||network.checking.length>0||state.resettingAccounts?.length>0;
  const report=network.reports.find(r=>r.index===index),problem=network.errors.find(r=>r.index===index),checking=network.checking.includes(index);
  $('checkUSA').disabled=checking;$('vpnClient').disabled=state.active||state.starting;
  $('networkStatus').dataset.state=checking?'checking':problem?'error':report?.countryCode==='US'?'us':report?'other':'unchecked';
  $('networkStatus').textContent=checking?'Đang kiểm tra IP của trình duyệt…':problem?problem.message:report?`TK ${index+1}: ${report.countryCode==='US'?'IP Mỹ':'Chưa phải IP Mỹ'} · ${report.ip} · ${report.countryCode}`:'Chưa kiểm tra IP của tài khoản này';
  const license=state.license;
  if(license){const expires=license.expiresAt?new Date(license.expiresAt).toLocaleString('vi-VN'):'';$('licenseSummary').textContent=license.status==='trial'?'Dùng thử đến '+expires:license.message;$('licenseStatus').textContent=license.message+(expires?' Hạn: '+expires:'');$('deviceCode').value=license.device;}
  if(state.payment){$('paymentQR').src=state.payment.qr;$('paymentContent').textContent='Nội dung chuyển khoản: '+state.payment.content;}
  $('parallelInfo').textContent=`${state.settings.accountCount} tài khoản · 1 prompt / tài khoản`;
  $('total').textContent=$('navCount').textContent=$('allCount').textContent=jobs.length;$('folderPath').textContent=state.settings.output||'Chưa chọn thư mục';
  $('queueState').textContent=state.starting?'Đang kiểm tra trước khi chạy':state.active?state.paused?'Đang dừng…':'Đang chạy':'Đã dừng';
  $('start').disabled=state.active||state.starting||state.merging||state.packaging||!jobs.some(j=>j.status==='pending');$('pause').disabled=!state.active&&!state.starting;
  $('clearPending').disabled=!jobs.some(j=>j.status==='pending');$('clearList').disabled=!jobs.length;
  const complete=jobs.length&&jobs.every(j=>j.status==='completed'),busy=state.active||state.starting||state.merging||state.packaging;
  $('mergeNow').disabled=$('packageClips').disabled=busy||!complete;
  $('mergeStatus').textContent=state.mergeError||state.mergeProgress||state.mergedOutput||(state.settings.autoMerge?'Tự nối khi đủ video.':'Chỉ nối khi bạn chọn; giữ clip nguồn.');$('revealMerged').hidden=!state.mergedOutput;
  $('packageStatus').textContent=state.packageError||state.packageProgress||state.editPackageDir||'Xuất clip rời đúng thứ tự để nhập vào CapCut.';$('openPackage').hidden=!state.editPackageDir;
  $('finishMode').textContent='Sau khi tạo xong: '+(state.settings.autoMerge?'Nối MP4':state.settings.autoPackage?'Xuất clip CapCut':'Giữ clip riêng');
  $('summary').textContent=`${jobs.filter(j=>j.status==='completed').length} / ${jobs.length} video hoàn tất`;
  $('jobs').replaceChildren();$('empty').hidden=jobs.length>0;
  for(const j of jobs.filter(j=>filter==='all'||(filter==='failed'?['failed','interrupted'].includes(j.status):j.status===filter))){
    const card=el('article','card'),preview=el('div','preview');
    if(j.image){const img=el('img');img.src='file:///'+j.image.replace(/\\/g,'/').split('/').map(encodeURIComponent).join('/').replace(/^\//,'').replace(/^[A-Za-z]%3A/i,m=>m[0]+':');img.alt='Ảnh tham chiếu';img.onerror=()=>img.replaceWith(el('span','glyph','▧'));preview.append(img);}else preview.append(el('span','glyph','▷'));
    preview.append(el('span','number',j.title||'#'+(jobs.indexOf(j)+1)));const body=el('div','cardBody');body.append(el('span','badge '+j.status,labels[j.status]||j.status),el('p','prompt',j.prompt),el('p','meta',`${j.references?.length||0} ảnh tham chiếu${j.account?' · TK '+j.account:''}${j.durationSeconds?' · '+j.durationSeconds+'s':''}`));if(j.error)body.append(el('p','error',j.error));
    const actions=el('div','cardActions');function action(text,fn){const b=el('button','secondary',text);b.onclick=fn;actions.append(b);}
    if(j.output)action('Mở video',()=>call('reveal',j.id));
    if(['failed','interrupted'].includes(j.status))action('Chạy lại',async()=>{if(confirm('Kiểm tra Muse trước. Chạy lại có thể tạo video trùng nếu tác vụ trước đã gửi.'))render(await call('retry',j.id));});
    if(j.status!=='running'){action('Xóa',async()=>render(await call('remove',j.id)));if(j.status==='pending')action('Đưa về sửa',async()=>{const result=await call('remove',j.id);if(result){drafts.push({...j});renderDrafts();render(result);}});}
    body.append(actions);card.append(preview,body);$('jobs').append(card);
  }
}
$('prompts').oninput=()=>{dirty=true;committed=false;};$('importMode').onchange=()=>{dirty=true;$('rawOptions').hidden=$('importMode').value!=='script';};
$('add').onclick=prepare;$('quickCreate').onclick=()=>create(true,true);$('commitDrafts').onclick=()=>create(false);$('createDrafts').onclick=()=>create(true);
$('newDraft').onclick=()=>{drafts.push({prompt:'',references:[...referenceFiles]});renderDrafts();};
$('referenceMode').onchange=remapDrafts;
$('images').onclick=async()=>{const files=await call('images',{multiple:refMode()==='numbered'});if(files?.length){referenceFiles=files;remapDrafts();}};
$('imageFolder').onclick=async()=>{const files=await call('imageFolder');if(files){referenceFiles=files;remapDrafts();}};
$('clearRefs').onclick=()=>{referenceFiles=[];remapDrafts();};
$('applyRefs').onclick=async()=>{remapDrafts();const result=mapped(state.jobs.filter(j=>j.status==='pending'));mappingInfo(result);render(await call('applyReferences',{assignments:result.items.map(j=>({id:j.id,references:j.references}))}));};
$('referencePaste').onpaste=e=>pasteImages(e);$('referencePaste').ondragover=e=>e.preventDefault();$('referencePaste').ondrop=e=>pasteImages(e);
$('browser').onclick=()=>call('browser',Number($('accountPicker').value));$('accountPicker').onchange=()=>render(state);
$('logoutAccount').onclick=async()=>render(await call('logoutAccount',Number($('accountPicker').value)));
$('start').onclick=async()=>render(await call('start'));$('pause').onclick=async()=>render(await call('stop'));
$('clearPending').onclick=async()=>{if(confirm('Xóa tất cả tác vụ đang chờ? Các clip đã tải vẫn giữ nguyên.'))render(await call('clearPending'));};
$('clearList').onclick=async()=>{if(confirm('Dừng và xóa toàn bộ danh sách tác vụ? File video đã tải không bị xóa. Tác vụ đã gửi có thể còn chạy trên Muse.'))render(await call('clearList'));};
$('folder').onclick=async()=>render(await call('folder'));$('export').onclick=()=>call('export');
$('vpnDownload').onclick=()=>call('vpnDownload');$('vpnClient').onclick=()=>call('openVpnClient');$('checkUSA').onclick=async()=>render(await call('checkUSA',Number($('accountPicker').value)));
$('configure').onclick=()=>{for(const name of ['composer','fileInput','submit','video','attachmentReadySelector','timeoutMinutes','accountCount','ffmpeg','browserChoice','browserPath','vpnProvider','vpnClientPath'])$('settingsForm').elements.namedItem(name).value=state.settings[name]??'';$('settingsForm').elements.namedItem('requireUSA').checked=Boolean(state.settings.requireUSA);$('settingsForm').elements.namedItem('finishAction').value=state.settings.autoMerge?'merge':state.settings.autoPackage?'package':'keep';$('settingsDialog').showModal();};
$('closeSettings').onclick=()=>$('settingsDialog').close();$('settingsForm').onsubmit=async e=>{e.preventDefault();const result=await call('settings',Object.fromEntries(new FormData(e.target)));if(result){render(result);$('settingsDialog').close();toast('Đã lưu cấu hình.');}};
for(const[id,method,name]of[['chooseBrowser','chooseBrowser','browserPath'],['chooseVpnClient','chooseVpnClient','vpnClientPath']])$(id).onclick=async()=>{const file=await call(method);if(file){$('settingsForm').elements.namedItem(name).value=file;if(id==='chooseBrowser')$('settingsForm').elements.namedItem('browserChoice').value='custom';}};
$('chooseFfmpeg').onclick=async()=>{const result=await call('chooseFfmpeg');if(result){render(result);$('settingsForm').elements.namedItem('ffmpeg').value=result.settings.ffmpeg;}};
$('mergeNow').onclick=async()=>render(await call('merge'));$('revealMerged').onclick=()=>call('revealMerged');$('packageClips').onclick=async()=>render(await call('packageClips'));$('openPackage').onclick=()=>call('openPackage');
document.querySelectorAll('[data-filter]').forEach(b=>b.onclick=()=>{filter=b.dataset.filter;document.querySelectorAll('[data-filter]').forEach(x=>x.classList.toggle('active',x===b));render(state);});$('navQueue').onclick=()=>window.scrollTo({top:0,behavior:'smooth'});
window.studio.onUpdate(render);call('state').then(render);renderDrafts();mappingInfo();

$('licenseButton').onclick=()=>$('licenseDialog').showModal();$('closeLicense').onclick=()=>$('licenseDialog').close();$('copyDevice').onclick=async()=>{try{await navigator.clipboard.writeText($('deviceCode').value);toast('Đã sao chép mã máy.');}catch{$('deviceCode').select();toast('Nhấn Ctrl+C để sao chép mã máy.');}};$('activateKey').onclick=async()=>{const result=await call('activateKey',$('activationKey').value.trim());if(result){render(result);toast('Đã kích hoạt key.');}};
