// Serialized helpers: scoped composer controls only, no Node dependencies.
function ensureAttachmentInput({composerSelector,fileInputSelector='input[type="file"]',reset=false}) {
  const visible=e=>Boolean(e?.isConnected&&e.getClientRects().length&&getComputedStyle(e).visibility!=='hidden');
  const enabled=e=>!e.disabled&&e.getAttribute('aria-disabled')!=='true';
  if(reset)delete globalThis[Symbol.for('MuseVideoStudio.attachmentOpener.v1')];
  const inputs=[...document.querySelectorAll(fileInputSelector)];
  if(inputs.length>1)throw Error('Có nhiều ô tải ảnh; chưa chọn để tránh gửi nhầm. Chọn selector ô tải ảnh trong cài đặt.');
  if(inputs.length===1){if(inputs[0].tagName!=='INPUT'||inputs[0].type!=='file')throw Error('Selector tải ảnh không trỏ tới ô chọn tệp.');return{ready:true,clicked:false,message:'Đã tìm thấy ô tải ảnh'};}
  const composers=[...document.querySelectorAll(composerSelector)].filter(visible);
  if(composers.length!==1)throw Error('Không xác định được ô chat duy nhất để mở đính kèm.');
  const composer=composers[0],key=Symbol.for('MuseVideoStudio.attachmentOpener.v1');
  const text=e=>(e.getAttribute('aria-label')||e.getAttribute('title')||e.textContent||'').replace(/\s+/g,' ').trim();
  const isAttach=e=>{
    if(/^(?:\+|attach(?:ments?| files?| photos?| images?)?|add (?:attachments?|files?|photos?|images?)|upload(?: files?| photos?| images?)?|đính kèm(?: tệp| ảnh)?|thêm(?: tệp| ảnh)?|tải (?:tệp|ảnh) lên)$/i.test(text(e)))return true;
    if(text(e))return false;
    if(e.querySelector('svg.lucide-plus,svg.lucide-paperclip,[data-icon="plus"],[data-icon="paperclip"],[data-lucide="plus"],[data-lucide="paperclip"]'))return true;
    const paths=[...e.querySelectorAll('svg path')].map(p=>(p.getAttribute('d')||'').replace(/[\s,]/g,'').toLowerCase());
    return paths.includes('m125v14')&&paths.includes('m512h14');
  };
  let state=globalThis[key];
  if(!state||state.composer!==composer){state={composer,opened:false,menuClicked:false,beforeVisible:new Set()};globalThis[key]=state;}
  const controls=()=>[...document.querySelectorAll('button,[role="button"],[role="menuitem"],label[for]')].filter(visible);
  if(state.opened){
    const fileLabel=e=>/^(?:upload|tải lên|tải (?:ảnh|tệp|file|hình ảnh) lên)$/i.test(text(e))||/^(?:(?:upload|attach|add|choose|select)(?: (?:a|an|local))? (?:files?|photos?|images?)(?: (?:and|&) (?:files?|photos?|images?))?(?: from (?:your )?(?:computer|device))?|(?:files?|photos?|images?)(?: (?:and|&) (?:files?|photos?|images?))?|(?:tải lên|tải|chọn|đính kèm|thêm) (?:tệp|file|ảnh|hình ảnh)(?: (?:và|&) (?:tệp|file|ảnh|hình ảnh))?(?: từ (?:máy tính|thiết bị))?)$/i.test(text(e));
    const targets=controls().filter(e=>!state.beforeVisible.has(e)&&fileLabel(e)&&enabled(e));
    // A menuitem wrapper and a nested button represent one action.
    const unique=targets.filter(e=>!targets.some(child=>child!==e&&e.contains(child)));
    if(unique.length>1)throw Error('Menu có nhiều lệnh tải ảnh/tệp. Chưa chọn để tránh gửi nhầm.');
    if(unique.length===1&&!state.menuClicked){state.menuClicked=true;unique[0].click();return{ready:false,clicked:true,message:'Đã chọn tải ảnh/tệp · chờ ô tải ảnh'};}
    return{ready:false,clicked:false,message:state.menuClicked?'Chờ ô tải ảnh xuất hiện':'Chờ mục tải ảnh/tệp trong menu đính kèm'};
  }
  for(let root=composer.parentElement,depth=0;root&&root!==document.body&&depth<7;root=root.parentElement,depth++){
    if(root.querySelector('video,[role="log"],[role="feed"],nav,aside'))break;
    const found=[...root.querySelectorAll('button,[role="button"]')].filter(e=>visible(e)&&enabled(e)&&isAttach(e));
    if(found.length>1)throw Error('Có nhiều nút đính kèm cạnh ô chat. Chưa bấm để tránh chọn nhầm.');
    if(found.length===1){state.beforeVisible=new Set(controls());state.opened=true;found[0].click();return{ready:false,clicked:true,message:'Đã mở menu đính kèm · chờ ô tải ảnh'};}
  }
  return{ready:false,clicked:false,message:'Chưa nhận diện được nút + / đính kèm cạnh ô chat'};
}
function composerAttachmentSnapshot({composerSelector}) {
  const visible=e=>Boolean(e?.isConnected&&e.getClientRects().length&&getComputedStyle(e).visibility!=='hidden');
  const composers=[...document.querySelectorAll(composerSelector)].filter(visible);
  if(composers.length!==1)throw Error('Không xác định được ô chat duy nhất để kiểm tra ảnh.');
  let scope=composers[0].parentElement;
  for(let root=scope,depth=0;root&&root!==document.body&&depth<7;root=root.parentElement,depth++){
    if(root.querySelector('video,[role="log"],[role="feed"],nav,aside'))break;
    scope=root;if(root.querySelector('img'))break;
  }
  const keys=globalThis.__museStudioImageKeys||(globalThis.__museStudioImageKeys=new WeakMap());
  const previews=[...scope.querySelectorAll('img')].filter(visible);
  const tokens=previews.map(e=>{if(!keys.has(e))keys.set(e,'muse-'+Date.now()+'-'+Math.random());return keys.get(e)+'|'+(e.currentSrc||e.src);});
  return{count:previews.length,tokens,loaded:previews.every(e=>e.complete&&e.naturalWidth>0)};
}
module.exports={ensureAttachmentInput,composerAttachmentSnapshot};
