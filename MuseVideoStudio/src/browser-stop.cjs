// Runs only inside the selected account page. A missing/ambiguous stop button
// never counts as a confirmed remote cancellation.
function browserStop({composerSelector,selector='',trackerId,requestId='',request=false}){
 const state=globalThis[Symbol.for('MuseVideoStudio.promptTrackers.v1')]?.get(trackerId);
 const stopMap=globalThis[Symbol.for('MuseVideoStudio.stopRequests.v1')]||(globalThis[Symbol.for('MuseVideoStudio.stopRequests.v1')]=new Set());
 const stopKey=trackerId+':'+requestId;if(request&&stopMap.has(stopKey))request=false;
 if(state?.echoRoot&&!state.echoRoot.isConnected)return{state:'chat-changed',clicked:false};
 let tracked;try{tracked=state?.poll();}catch{}
 const visible=e=>e.getClientRects().length&&getComputedStyle(e).visibility!=='hidden';
 const stopLabel=e=>/^(?:stop(?: generating| generation| response)?|cancel(?: generation)?|dừng(?: tạo| tạo video| trả lời| phản hồi| chạy)?|ngừng(?: tạo| trả lời)?|hủy(?: tác vụ| tạo video)?)$/i.test((e.getAttribute('aria-label')||e.getAttribute('title')||e.textContent||'').trim());
 const isStop=e=>{
  if(stopLabel(e)||e.querySelector('.lucide-square,.lucide-stop-circle,[data-icon="stop"]'))return true;
  if((e.getAttribute('aria-label')||e.textContent||'').trim())return false;
  const svg=e.querySelector('svg'),rect=svg?.querySelectorAll('rect');
  return rect?.length===1&&!svg.querySelector('path,line,polyline,circle')&&['5,5,14,14','6,6,12,12','7,7,10,10'].includes(['x','y','width','height'].map(k=>rect[0].getAttribute(k)).join(','));
 };
 let found=[];
 if(selector)found=[...document.querySelectorAll(selector)].filter(visible);
 else{
  const composers=[...document.querySelectorAll(composerSelector)].filter(visible);
  if(composers.length!==1)return{state:'unavailable',clicked:false};
  for(let root=composers[0].parentElement,depth=0;root&&root!==document.body&&depth<7;root=root.parentElement,depth++){
   if(root.querySelector('video,[role="log"],[role="feed"],nav,aside'))break;
   found=[...root.querySelectorAll('button,[role="button"]')].filter(e=>visible(e)&&isStop(e));if(found.length)break;
  }
 }
 if(found.length>1)return{state:'ambiguous',clicked:false};
 if(found.length===1){if(request&&!found[0].disabled&&found[0].getAttribute('aria-disabled')!=='true'){found[0].click();if(state)state.stopClicked=true;stopMap.add(stopKey);return{state:tracked?.ready?'completed':'requested',clicked:true};}return{state:'generating',clicked:false};}
 if(tracked?.ready)return{state:'completed',clicked:false};
 if(state?.stopClicked||stopMap.has(stopKey)){
  const text=state.responseRoot?.innerText||'';
  if(/(?:generation (?:cancelled|canceled|stopped)|stopped generating|đã (?:dừng|hủy)|bạn đã dừng)/i.test(text))return{state:'confirmed',clicked:false};
  // The composer becoming idle confirms the UI has stopped; the server may
  // still return an old response, so the next attempt uses a new prompt anchor.
  return{state:'ui-stopped',clicked:false};
 }
 return{state:'unavailable',clicked:false};
}
module.exports={browserStop};
