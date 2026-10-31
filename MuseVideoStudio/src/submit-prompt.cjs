// Serialized into the account's document; no Node dependencies.
function submitPrompt({id,selector='',composerSelector}) {
  const state=globalThis[Symbol.for('MuseVideoStudio.promptTrackers.v1')]?.get(id);
  if(!state)throw Error('Tác vụ đã dừng; không gửi prompt.');
  const visible=e=>e.getClientRects().length&&getComputedStyle(e).visibility!=='hidden';
  const enabled=e=>!e.disabled&&e.getAttribute('aria-disabled')!=='true';
  let targets=[];
  if(selector)targets=[...document.querySelectorAll(selector)].filter(visible);
  else {
    const composers=[...document.querySelectorAll(composerSelector)].filter(visible);
    if(composers.length!==1)throw Error('Không xác định được ô soạn thảo duy nhất để gửi.');
    const input=composers[0];
    const isSend=button=>{
      const label=[button.getAttribute('aria-label'),button.getAttribute('title'),button.getAttribute('data-testid'),button.getAttribute('data-icon'),button.textContent].filter(Boolean).join(' ').trim();
      if(/(?:^|[\s_-])(?:send|submit|gửi|arrow[-_ ]?up|paper[-_ ]?plane)(?:$|[\s_-])/i.test(label)||button.matches('[type="submit"]'))return true;
      if(button.querySelector('svg.lucide-arrow-up,svg.lucide-send,[data-icon="arrow-up"],[data-lucide="arrow-up"],.tabler-icon-arrow-up,.icon-arrow-up'))return true;
      // Lucide ArrowUp: unlabelled send arrow used by some chat composers.
      const paths=[...button.querySelectorAll('svg path')].map(p=>(p.getAttribute('d')||'').replace(/[\s,]/g,'').toLowerCase());
      return paths.some(p=>p==='m127v14'||p==='m1219v-14'||p==='m1219v5')&&paths.some(p=>p==='m5127-777'||p==='m512l7-77 7'.replace(/ /g,''));
    };
    for(let scope=input.parentElement,depth=0;scope&&scope!==document.body&&depth<7;scope=scope.parentElement,depth++) {
      // Never select a Send/Share action belonging to chat history or sidebar.
      if(scope.querySelector('video,[role="log"],[role="feed"],nav,aside'))break;
      const found=[...scope.querySelectorAll('button,[role="button"],input[type="submit"]')].filter(e=>visible(e)&&isSend(e));
      if(found.length){targets=found;break;}
    }
  }
  if(targets.length!==1)throw Error('Chưa nhận diện được nút Gửi duy nhất của Muse. Prompt vẫn ở ô soạn thảo; tool chưa gửi tiếp. Chọn nút Gửi trong cài đặt hoặc xuất thông tin lỗi.');
  if(!enabled(targets[0]))throw Error('Nút Gửi của Muse chưa sẵn sàng. Chờ ảnh tải xong rồi thử lại.');
  targets[0].click();return {clicked:true,method:'button'};
}
module.exports={submitPrompt};
