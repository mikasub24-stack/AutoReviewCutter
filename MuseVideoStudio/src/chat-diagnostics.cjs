// Structural diagnostics only: no cookies, storage, input values, prompts or URLs.
function chatDiagnostics({jobs=[],composerSelector='textarea'}) {
  const norm=s=>String(s||'').replace(/\s+/g,' ').trim();
  const visible=e=>Boolean(e.getClientRects().length);
  function node(e){
    const data={tag:e.tagName,visible:visible(e),attributeNames:[...e.attributes].map(a=>a.name).filter(n=>!/^on/i.test(n))};
    for(const key of ['role','class','aria-label','title','data-testid','data-role','data-message-role','data-message-author-role','type','aria-haspopup'])if(e.hasAttribute(key)){const value=e.getAttribute(key);data[key]=['aria-label','title'].includes(key)?(/^(?:send(?: message)?|gửi(?: tin nhắn)?|download(?: video| file)?|tải xuống|more(?: options)?|thêm|menu|submit|close|đóng|…|arrow[- ]up|share|chia sẻ)$/i.test(value)?value.slice(0,80):'[label omitted]'):value.slice(0,200);}
    if(e.tagName==='VIDEO'){data.readyState=e.readyState;data.preload=e.preload;data.width=e.videoWidth;data.duration=Number.isFinite(e.duration)?e.duration:null;data.hasSource=Boolean(e.currentSrc||e.getAttribute('src'));}
    if(e.tagName==='A'){data.download=e.hasAttribute('download');data.videoType=/^video\//i.test(e.type||'');try{const u=new URL(e.href);data.scheme=u.protocol;data.extension=u.pathname.match(/\.[a-z0-9]{2,5}$/i)?.[0]||'';}catch{}}
    return data;
  }
  function tree(e,depth=0,budget={left:180}){if(!e||budget.left--<=0)return null;const r=node(e);if(depth<4)r.children=[...e.children].filter(c=>!['SCRIPT','STYLE','NOSCRIPT'].includes(c.tagName)).map(c=>tree(c,depth+1,budget)).filter(Boolean);return r;}
  function trail(e){const out=[];for(let i=0;e&&i<6;i++,e=e.parentElement)out.push(node(e));return out;}
  const all=[...document.querySelectorAll('body *')].filter(e=>!e.closest('script,style,textarea,input,[contenteditable="true"],[role="textbox"]'));
  const matches=jobs.slice(-8).map(job=>{
    const wanted=norm(job.prompt),found=all.filter(e=>norm(e.innerText??e.textContent)===wanted);
    const leaves=found.filter(e=>!found.some(child=>child!==e&&e.contains(child))).slice(0,3);
    return {id:job.id,number:job.number,renderedMatches:leaves.length,plainTextMatches:all.filter(e=>norm(e.textContent)===wanted).length,contexts:leaves.map(e=>({ancestors:trail(e),nearby:tree(e.parentElement?.parentElement)}))};
  });
  let composers=[];try{composers=[...document.querySelectorAll(composerSelector)].filter(visible).map(e=>({ancestors:trail(e),controls:tree(e.parentElement?.parentElement)}));}catch{}
  const media=[...document.querySelectorAll('video,iframe,a[download],a[type^="video/"],img')].filter(visible).slice(-60).map(e=>({ancestors:trail(e),context:tree(e.parentElement)}));
  return {schema:1,counts:{videos:document.querySelectorAll('video').length,images:document.images.length,iframes:document.querySelectorAll('iframe').length},composers,matches,media};
}
module.exports={chatDiagnostics};
