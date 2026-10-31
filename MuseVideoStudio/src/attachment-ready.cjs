function imageSources(){const keys=globalThis.__museStudioImageKeys||(globalThis.__museStudioImageKeys=new WeakMap());return [...document.querySelectorAll('img')].filter(e=>e.getClientRects().length).map(e=>{if(!keys.has(e))keys.set(e,'muse-'+Date.now()+'-'+Math.random());return keys.get(e)+'|'+(e.currentSrc||e.src);});}
function attachmentState({before,count,selector,submitSelector}){
  const keys=globalThis.__museStudioImageKeys||(globalThis.__museStudioImageKeys=new WeakMap());
  const visible=e=>e.getClientRects().length>0;
  const input=document.querySelector('input[type=file]');
  const scope=input?.closest('form')||document;
  const busy=[...scope.querySelectorAll('[aria-busy="true"], [role="progressbar"], [data-state="uploading"], progress')].some(visible);
  const send=submitSelector?[...document.querySelectorAll(submitSelector)].filter(visible):[...scope.querySelectorAll('button')].filter(e=>visible(e)&&/^(send|gửi)(\s|$)/i.test((e.getAttribute('aria-label')||e.getAttribute('title')||e.textContent||'').trim()));
  const sendReady=!send.length?!submitSelector:send.length===1&&!send[0].disabled&&send[0].getAttribute('aria-disabled')!=='true';
  const attached=selector?[...document.querySelectorAll(selector)].some(visible):[...document.querySelectorAll('img')].filter(e=>visible(e)&&(e.currentSrc||e.src)&&!before.includes((keys.get(e)||(keys.set(e,'muse-'+Date.now()+'-'+Math.random()),keys.get(e)))+'|'+(e.currentSrc||e.src))).length>=count;
  return {ready:attached&&!busy&&sendReady,attached,busy,sendReady};
}
module.exports={imageSources,attachmentState};
