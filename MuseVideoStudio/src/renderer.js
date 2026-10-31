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

const jobCards=new Map();
const stageLabels={preparing:'Chuẩn bị tác vụ',uploading:'Đang tải ảnh tham chiếu',submitting:'Đang gửi prompt',confirming:'Đang xác nhận Muse đã nhận prompt',waiting:'Đang chờ Muse tạo video',downloading:'Đang tải video về máy',cooldown:'Nghỉ trước lượt tiếp theo'};
function localFileUrl(file){
  if(typeof file!=='string'||!file)return '';
  const normalized=file.replace(/\\/g,'/');
  const encode=segment=>encodeURIComponent(segment);
  if(/^[A-Za-z]:\//.test(normalized))return 'file:///'+normalized.slice(0,2)+'/'+normalized.slice(3).split('/').map(encode).join('/');
  if(normalized.startsWith('//')){const [host,...parts]=normalized.slice(2).split('/');if(!host||!/^[\w.-]+$/.test(host))return '';return 'file://'+host+'/'+parts.map(encode).join('/');}
  if(normalized.startsWith('/'))return 'file://'+normalized.split('/').map(encode).join('/');
  return '';
}
function text(node,value){const next=value==null?'':String(value);if(node.textContent!==next)node.textContent=next;}
function timeValue(value){if(typeof value==='number'&&Number.isFinite(value))return value;const parsed=typeof value==='string'?Date.parse(value):NaN;return Number.isFinite(parsed)?parsed:null;}
function elapsedText(job){
  const started=timeValue(job.startedAt);if(started===null)return '';
  const finished=timeValue(job.finishedAt??job.completedAt);
  if(job.status!=='running'&&finished===null)return '';
  const seconds=Math.max(0,Math.floor(((finished??Date.now())-started)/1000));
  return `Đã xử lý ${Math.floor(seconds/60)}:${String(seconds%60).padStart(2,'0')}`;
}
function bytesText(bytes){if(!Number.isFinite(bytes)||bytes<0)return '';if(bytes<1024)return `${Math.round(bytes)} B`;if(bytes<1048576)return `${(bytes/1024).toFixed(1)} KB`;return `${(bytes/1048576).toFixed(1)} MB`;}
function updateElapsed(row){text(row.elapsed,elapsedText(row.job));row.elapsed.hidden=!row.elapsed.textContent;}
function makeCard(id){
  const card=el('article','card');card.dataset.jobId=id;
  const preview=el('div','preview'),media=el('div','previewMedia'),number=el('span','number'),mediaLabel=el('span','mediaLabel');preview.append(media,number,mediaLabel);
  const body=el('div','cardBody'),badge=el('span','badge'),title=el('h3','jobTitle'),prompt=el('p','prompt'),meta=el('p','meta');
  const stage=el('div','jobStage'),stageName=el('strong','stageName'),stageMessage=el('p','stageMessage'),observed=el('div','observedProgress'),progress=el('progress','jobProgress'),progressText=el('span','progressText'),elapsed=el('span','elapsed');
  progress.max=100;observed.append(progress,progressText);stage.append(stageName,stageMessage,observed,elapsed);
  const source=el('details','jobSource'),sourceTitle=el('summary','','Nội dung gốc'),sourceBody=el('p');source.append(sourceTitle,sourceBody);
  const error=el('p','error'),actions=el('div','cardActions');
  const row={card,preview,media,number,mediaLabel,body,badge,title,prompt,meta,stage,stageName,stageMessage,observed,progress,progressText,elapsed,source,sourceBody,error,actions,job:null,mediaKey:null};
  function action(label,fn){const button=el('button','secondary',label);button.onclick=fn;actions.append(button);return button;}
  row.reveal=action('Mở vị trí video',()=>call('reveal',row.job.id));
  row.recover=action('Tìm / tải video đã tạo',async()=>render(await call('retryDownload',row.job.id)));
  row.recover.title='Tìm kết quả từ prompt đã gửi, không gửi lại prompt mới.';
  row.retry=action('Gửi lại prompt',async()=>{if(confirm('Kiểm tra Muse trước. Gửi lại prompt có thể tạo video trùng nếu tác vụ trước đã gửi.'))render(await call('retry',row.job.id));});
  row.remove=action('Xóa',async()=>render(await call('remove',row.job.id)));
  row.edit=action('Đưa về sửa',async()=>{const result=await call('remove',row.job.id);if(result){drafts.push({...row.job});renderDrafts();render(result);}});
  body.append(badge,title,prompt,meta,stage,source,error,actions);card.append(preview,body);return row;
}
function updateMedia(row,job){
  const output=localFileUrl(job.output),image=localFileUrl(job.image||job.references?.[0]);
  const key=output?'video:'+output:image?'image:'+image:'empty';
  text(row.mediaLabel,output?'Video đã tải':image?'Ảnh tham chiếu':'Chưa có video');
  if(row.mediaKey===key)return;
  const previousVideo=row.media.querySelector('video');if(previousVideo)previousVideo.pause();
  row.media.replaceChildren();row.mediaKey=key;row.preview.classList.toggle('hasVideo',Boolean(output));
  if(output){
    const video=el('video','resultVideo');video.controls=true;video.preload='metadata';video.playsInline=true;video.src=output;video.setAttribute('aria-label',`Video ${job.title||'kết quả'}`);
    const note=el('span','mediaError','Không mở được video này. Dùng “Mở vị trí video” để kiểm tra file.');note.hidden=true;
    video.onerror=()=>{note.hidden=false;};row.media.append(video,note);
  }else if(image){
    const img=el('img');img.src=image;img.alt='Ảnh tham chiếu';img.onerror=()=>img.replaceWith(el('span','glyph','▧'));row.media.append(img);
  }else row.media.append(el('span','glyph','▷'));
}
function updateCard(row,job,index){
  row.job=job;updateMedia(row,job);
  text(row.number,'#'+(index+1));text(row.title,job.title||`Prompt ${index+1}`);row.card.setAttribute('aria-label',`${job.title||'Prompt '+(index+1)} · ${labels[job.status]||job.status}`);
  row.badge.className='badge '+job.status;text(row.badge,labels[job.status]||job.status);text(row.prompt,job.prompt);
  text(row.meta,`${job.references?.length||0} ảnh tham chiếu${job.account?' · TK '+job.account:''}${job.durationSeconds?' · '+job.durationSeconds+'s':''}`);
  const active=job.status==='running';
  const stageName=job.status==='completed'?'Đã lưu video':stageLabels[job.stage]||labels[job.status]||'Đang chờ';
  text(row.stageName,stageName);row.stage.classList.toggle('active',active);
  text(row.stageMessage,job.stageMessage||'');row.stageMessage.hidden=!row.stageMessage.textContent;
  let observed=null,label='';
  const bytes=job.downloadProgress;
  if(job.stage==='downloading'&&bytes&&Number.isFinite(bytes.receivedBytes)&&bytes.receivedBytes>=0){
    label=`Đã tải ${bytesText(bytes.receivedBytes)}`;
    if(Number.isFinite(bytes.totalBytes)&&bytes.totalBytes>0){observed=Math.min(100,100*bytes.receivedBytes/bytes.totalBytes);label+=` / ${bytesText(bytes.totalBytes)} · ${observed.toFixed(0)}%`;}
  }else if(job.status==='running'&&['waiting','confirming'].includes(job.stage)&&typeof job.progress==='number'&&Number.isFinite(job.progress)&&job.progress>=0&&job.progress<=100){observed=job.progress;label=`Muse: ${job.progress.toFixed(0)}%`;}
  row.observed.hidden=!label;row.progress.hidden=observed===null;if(observed!==null)row.progress.value=observed;text(row.progressText,label);
  updateElapsed(row);
  const source=typeof job.source==='string'?job.source.trim():'';row.source.hidden=!source||source===job.prompt?.trim();text(row.sourceBody,source);
  text(row.error,job.error||'');row.error.hidden=!job.error;
  row.reveal.hidden=!job.output;
  const recoverable=['failed','interrupted'].includes(job.status)&&Boolean(job.mayHaveSubmitted||job.submittedAt||job.resultReadyAt);
  row.recover.hidden=!recoverable;row.recover.disabled=Boolean(state.active||state.starting||state.merging||state.packaging);
  row.retry.hidden=!['failed','interrupted'].includes(job.status);row.remove.hidden=job.status==='running';row.edit.hidden=job.status!=='pending';
  row.card.hidden=!(filter==='all'||(filter==='failed'?['failed','interrupted'].includes(job.status):job.status===filter));
}
function renderJobs(jobs){
  const ids=new Set(jobs.map(job=>job.id));
  for(const [id,row]of jobCards)if(!ids.has(id)){row.media.querySelector('video')?.pause();row.card.remove();jobCards.delete(id);}
  let cursor=$('jobs').firstElementChild;
  jobs.forEach((job,index)=>{
    let row=jobCards.get(job.id);if(!row){row=makeCard(job.id);jobCards.set(job.id,row);}
    updateCard(row,job,index);
    // Leave existing cards in place on progress updates: moving a video node
    // through a detached fragment can reset its playback in Chromium.
    if(row.card===cursor)cursor=cursor.nextElementSibling;else $('jobs').insertBefore(row.card,cursor);
  });
  $('empty').hidden=jobs.length>0;
}
setInterval(()=>{for(const row of jobCards.values())if(row.job?.status==='running')updateElapsed(row);},1000);

function render(next){
  if(!next)return;state=next;const jobs=state.jobs,indexBefore=Number($('accountPicker').value||0);
  $('accountPicker').replaceChildren(...Array.from({length:state.settings.accountCount},(_,i)=>{const o=el('option','',`Tài khoản ${i+1}`);o.value=i;return o;}));
  $('accountPicker').value=Math.min(indexBefore,state.settings.accountCount-1);const index=Number($('accountPicker').value);
  const browserName=({builtin:'Trình duyệt tích hợp',chrome:'Google Chrome',edge:'Microsoft Edge',custom:'Chromium tùy chọn'})[state.settings.browserChoice||'builtin'];$('browserInfo').textContent=browserName;
  const account=state.accounts?.find(a=>a.index===index);$('sessionStatus').textContent=account?.warning||(account?.rememberSession?'Cookie phiên lưu mã hóa riêng trên máy.':'Mỗi tài khoản giữ một phiên đăng nhập riêng.');
  $('logoutAccount').textContent=`Đăng xuất TK ${index+1} · ${browserName}`;$('logoutAccount').disabled=state.active||state.starting||state.merging||state.packaging||state.resettingAccounts?.length>0;
  const license=state.license;
  if(license){const expires=license.expiresAt?new Date(license.expiresAt).toLocaleString('vi-VN'):'';$('licenseSummary').textContent=license.status==='trial'?'Dùng thử đến '+expires:license.message;$('licenseStatus').textContent=license.message+(expires?' Hạn: '+expires:'');$('deviceCode').value=license.device;}
  if(state.payment){$('paymentQR').src=state.payment.qr;$('paymentContent').textContent='Nội dung chuyển khoản: '+state.payment.content;}
  $('parallelInfo').textContent=state.settings.dispatchMode==='parallel'?`${state.settings.accountCount} tài khoản · 1 prompt / tài khoản`:'Lần lượt · tải xong từng video mới gửi tiếp';
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
  renderJobs(jobs);
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
$('configure').onclick=()=>{for(const name of ['composer','fileInput','submit','video','attachmentReadySelector','messageSelector','timeoutMinutes','accountCount','ffmpeg','browserChoice','browserPath','dispatchMode','cooldownSeconds'])$('settingsForm').elements.namedItem(name).value=state.settings[name]??(name==='dispatchMode'?'sequential':name==='cooldownSeconds'?3:'');$('settingsForm').elements.namedItem('finishAction').value=state.settings.autoMerge?'merge':state.settings.autoPackage?'package':'keep';$('settingsDialog').showModal();};
$('closeSettings').onclick=()=>$('settingsDialog').close();$('settingsForm').onsubmit=async e=>{e.preventDefault();const result=await call('settings',Object.fromEntries(new FormData(e.target)));if(result){render(result);$('settingsDialog').close();toast('Đã lưu cấu hình.');}};
for(const[id,method,name]of[['chooseBrowser','chooseBrowser','browserPath']])$(id).onclick=async()=>{const file=await call(method);if(file){$('settingsForm').elements.namedItem(name).value=file;if(id==='chooseBrowser')$('settingsForm').elements.namedItem('browserChoice').value='custom';}};
$('chooseFfmpeg').onclick=async()=>{const result=await call('chooseFfmpeg');if(result){render(result);$('settingsForm').elements.namedItem('ffmpeg').value=result.settings.ffmpeg;}};
$('mergeNow').onclick=async()=>render(await call('merge'));$('revealMerged').onclick=()=>call('revealMerged');$('packageClips').onclick=async()=>render(await call('packageClips'));$('openPackage').onclick=()=>call('openPackage');
document.querySelectorAll('[data-filter]').forEach(b=>b.onclick=()=>{filter=b.dataset.filter;document.querySelectorAll('[data-filter]').forEach(x=>x.classList.toggle('active',x===b));render(state);});$('navQueue').onclick=()=>window.scrollTo({top:0,behavior:'smooth'});
window.studio.onUpdate(render);call('state').then(render);renderDrafts();mappingInfo();

$('licenseButton').onclick=()=>$('licenseDialog').showModal();$('closeLicense').onclick=()=>$('licenseDialog').close();$('copyDevice').onclick=async()=>{try{await navigator.clipboard.writeText($('deviceCode').value);toast('Đã sao chép mã máy.');}catch{$('deviceCode').select();toast('Nhấn Ctrl+C để sao chép mã máy.');}};$('activateKey').onclick=async()=>{const result=await call('activateKey',$('activationKey').value.trim());if(result){render(result);toast('Đã kích hoạt key.');}};
