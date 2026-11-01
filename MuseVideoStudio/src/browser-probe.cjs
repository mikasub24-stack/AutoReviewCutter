// Serialized helpers execute only in the selected Muse account document.
function prepareBrowserProbe({composerSelector,text}) {
  const visible=e=>e.getClientRects().length&&getComputedStyle(e).visibility!=='hidden';
  const inputs=[...document.querySelectorAll(composerSelector)].filter(visible);
  if(!inputs.length)return false;
  if(inputs.length!==1)throw Error('Có nhiều ô nhập. Mở đúng đoạn chat Muse rồi Test lại.');
  const e=inputs[0];
  const old=(e.value||e.innerText||'').trim();
  if(old&&old!==text)throw Error('Ô chat còn bản nháp. Hãy xử lý bản nháp rồi Test lại.');
  for(let root=e.parentElement,n=0;root&&root!==document.body&&n<4;root=root.parentElement,n++){
    if(root.querySelector('[role="log"],[role="feed"],nav,aside,video'))break;
    if([...root.querySelectorAll('img')].some(visible))throw Error('Ô chat còn ảnh đính kèm. Gỡ ảnh trước khi Test.');
  }
  if(old===text)return true;
  e.focus();
  if(e instanceof HTMLTextAreaElement||e instanceof HTMLInputElement)Object.getOwnPropertyDescriptor(e instanceof HTMLTextAreaElement?HTMLTextAreaElement.prototype:HTMLInputElement.prototype,'value').set.call(e,text);
  else e.textContent=text;
  e.dispatchEvent(new InputEvent('input',{bubbles:true,inputType:'insertText',data:text}));
  return true;
}
function verifyBrowserTest({token,set=false}){
  const key=Symbol.for('MuseVideoStudio.browserReady.v1');
  if(set)globalThis[key]=token;
  return Boolean(token&&globalThis[key]===token);
}
function missingBrowserPrompts({jobs}){
  const norm=x=>String(x||'').replace(/\s+/g,' ').trim();
  const texts=new Set([...document.querySelectorAll('body *')].filter(e=>e.getClientRects().length&&!e.closest('textarea,input,[contenteditable="true"],[role="textbox"],aside,nav,[data-role="assistant"],[data-message-author-role="assistant"]')).map(e=>norm(e.innerText)));
  return jobs.filter(j=>!texts.has(norm(j.prompt))).map(j=>j.id);
}
module.exports={prepareBrowserProbe,verifyBrowserTest,missingBrowserPrompts};
