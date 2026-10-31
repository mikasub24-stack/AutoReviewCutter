// These functions execute inside the Muse document through either browser
// adapter. Keep every browser helper inside beginTracking's closure so the
// exported function can be serialized without Node imports or outer variables.
function beginTracking({ id, prompt, videoSelector = 'video', messageSelector = '', recover = false }) {
  const key = Symbol.for('MuseVideoStudio.promptTrackers.v1');
  const map = globalThis[key] || (globalThis[key] = new Map());
  if (!id || typeof prompt !== 'string' || !prompt.trim()) throw Error('Tác vụ cần mã và prompt đầy đủ.');
  if (map.has(id)) { if (!recover) throw Error('Tác vụ này đã được theo dõi.'); map.get(id).observer?.disconnect(); map.delete(id); }
  const norm = value => String(value || '').replace(/\s+/g, ' ').trim();
  const wanted = norm(prompt);
  const visible = e => Boolean(e?.isConnected && e.getClientRects().length && getComputedStyle(e).visibility !== 'hidden');
  const following = (a,b) => Boolean(a?.isConnected && b?.isConnected && !(a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_DISCONNECTED) && (a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING));
  const composer = e => Boolean(e.closest('textarea,input,[contenteditable="true"],[role="textbox"]'));
  function author(e) {
    for(let n=e;n && n!==document.body;n=n.parentElement) {
      const values=[n.getAttribute('data-role'),n.getAttribute('data-author'),n.getAttribute('data-message-role'),n.getAttribute('data-message-author-role'),n.getAttribute('data-sender')].filter(Boolean).map(norm);
      if(values.some(v=>/^(user|human|me)$/i.test(v)))return {kind:'user',root:n};
      if(values.some(v=>/^(assistant|model|bot|muse)$/i.test(v)))return {kind:'assistant',root:n};
      const classes=typeof n.className==='string'?n.className:'';
      if(/(?:^|\s)(?:user-message|message-user|human-message)(?:\s|$)/i.test(classes))return {kind:'user',root:n};
      if(/(?:^|\s)(?:assistant-message|message-assistant|bot-message)(?:\s|$)/i.test(classes))return {kind:'assistant',root:n};
    }
    return {kind:'unknown',root:null};
  }
  const source = v => v.currentSrc || v.getAttribute('src') || '';
  // Validate selectors now rather than partially submitting then discovering a
  // malformed configuration. A selector must resolve to actual video elements.
  document.querySelectorAll(videoSelector); if(messageSelector)document.querySelectorAll(messageSelector);
  const s={id,prompt:wanted,recover,videoSelector,messageSelector,baseline:new Set(document.querySelectorAll('*')),baselineSources:new Set([...document.querySelectorAll(videoSelector)].map(source).filter(Boolean)),added:new WeakMap(),textChanged:new WeakMap(),sequence:0,echo:null,echoRoot:null,responseRoot:null,video:null,fingerprint:'',ready:false,menuPending:false,menuBaseline:null};
  s.observer=new MutationObserver(records=>{
    for(const record of records) {
      const seq=++s.sequence;
      for(const node of record.addedNodes||[]) if(node.nodeType===1) {s.added.set(node,seq);for(const child of node.querySelectorAll('*'))s.added.set(child,seq);}
      if(record.type==='characterData' || record.type==='childList')for(let n=record.target.nodeType===1?record.target:record.target.parentElement;n && n!==document.body;n=n.parentElement)s.textChanged.set(n,seq);
    }
  });
  s.observer.observe(document.body,{subtree:true,childList:true,characterData:true});
  function echoCandidates() {
    const matches=[...document.body.querySelectorAll('*')].filter(e=>visible(e)&&!composer(e)&&norm(e.textContent)===wanted&&(recover||!s.baseline.has(e))&&author(e).kind!=='assistant');
    const leaves=matches.filter(e=>!matches.some(other=>other!==e&&e.contains(other)));
    const roots=new Map();
    for(const leaf of leaves) {
      const known=author(leaf);
      let root=(messageSelector?leaf.closest(messageSelector):null)||(known.kind==='user'?known.root:leaf);
      if(!root)continue;
      if(!(messageSelector&&root.matches(messageSelector)) && known.kind==='unknown')while(root.parentElement && root.parentElement!==document.body && norm(root.parentElement.textContent)===wanted && !root.parentElement.querySelector('video,textarea,[contenteditable="true"]'))root=root.parentElement;
      if(!recover && s.baseline.has(root))continue;
      roots.set(root,{leaf,root});
    }
    return [...roots.values()];
  }
  function threadRoot(root) {
    const known=root.parentElement?.closest('[role="log"],[role="feed"],[data-chat-thread],[data-testid="conversation"],[data-testid="messages"],.messages,.conversation');
    if(known && known!==document.body)return known;
    if((messageSelector&&root.matches(messageSelector)) || author(root).kind==='user')return root.parentElement!==document.body?root.parentElement:null;
    // Unknown chat markup: find the nearest repeated sibling row containing the
    // next response, rather than expanding to document/body/app-wide media.
    // A row for a different prompt before the video blocks this fallback.
    s.genericResponseRoot=null;
    let branch=root;
    for(let parent=root.parentElement,depth=0;parent && parent!==document.body && depth<5;branch=parent,parent=parent.parentElement,depth++) {
      if(parent.querySelector('textarea,input,[contenteditable="true"],[role="textbox"],nav,aside'))continue;
      let next=branch.nextElementSibling;
      while(next&&!norm(next.textContent)&&!next.querySelector('video,progress,[role="progressbar"],button,a'))next=next.nextElementSibling;
      if(!next||next.tagName!==branch.tagName)continue;
      const freshMedia=[...next.querySelectorAll(videoSelector)].some(v=>v.tagName==='VIDEO'&&(recover||(!s.baseline.has(v)&&!s.baselineSources.has(source(v)))));
      const actualProgress=next.querySelector('progress,[role="progressbar"],[aria-valuenow]');
      if(freshMedia||actualProgress){s.genericResponseRoot=next;return parent;}
    }
    return null;
  }

  function responseRoot(video,thread) {
    if(messageSelector)return video.closest(messageSelector);
    if(s.genericResponseRoot?.contains(video))return s.genericResponseRoot;
    const a=author(video);if(a.kind==='user')return null;if(a.kind==='assistant'&&thread.contains(a.root))return a.root;
    let branch=video;while(branch.parentElement&&branch.parentElement!==thread)branch=branch.parentElement;
    return branch.parentElement===thread?branch:null;
  }
  function progress(root) {
    if(!root)return null;
    for(const e of root.querySelectorAll('progress,[role="progressbar"],[aria-valuenow]'))if(visible(e)){
      const raw=e.tagName==='PROGRESS'?(e.hasAttribute('value')?e.value:NaN):Number(e.getAttribute('aria-valuenow'));
      const max=e.tagName==='PROGRESS'?e.max:Number(e.getAttribute('aria-valuemax')||100),min=e.tagName==='PROGRESS'?0:Number(e.getAttribute('aria-valuemin')||0);
      if(Number.isFinite(raw)&&Number.isFinite(max)&&max>min&&raw>=min&&raw<=max)return Math.round((raw-min)/(max-min)*100);
    }
    const values=[...root.querySelectorAll('*')].filter(e=>visible(e)&&e.children.length===0).map(e=>norm(e.textContent)).filter(t=>t.length<=80).map(t=>t.match(/(?:^|\s)(\d{1,3}(?:[.,]\d+)?)\s*%/)).filter(Boolean).map(m=>Number(m[1].replace(',','.'))).filter(v=>v>=0&&v<=100);
    return new Set(values).size===1?values[0]:null;
  }
  const playable=v=>v.readyState>=2&&v.videoWidth>0&&Number.isFinite(v.duration)&&v.duration>0&&Boolean(source(v));
  function result(phase,stage,root=s.responseRoot) {return {id,phase,stage,ready:phase==='ready',progress:progress(root),...(phase==='ready'?{url:source(s.video),fingerprint:s.fingerprint}:{})};}
  s.poll=()=>{
    const echoes=echoCandidates();
    if(echoes.length>1)throw Error('Có nhiều tin nhắn trùng chính xác prompt. Không xác định được video của tác vụ; hãy dùng chat riêng hoặc xử lý thủ công.');
    if(!s.echo) {
      if(!echoes.length)return result('waiting-prompt','Chờ Muse hiển thị đúng prompt đã gửi');
      s.echo=echoes[0].leaf;s.echoRoot=echoes[0].root;s.echoEpoch=Math.max(s.added.get(s.echo)||0,s.added.get(s.echoRoot)||0,s.textChanged.get(s.echo)||0);
    }
    if(!s.echo.isConnected||!s.echoRoot.isConnected)throw Error('Tin nhắn prompt đã rời khỏi trang. Dừng theo dõi để tránh gán nhầm video.');
    const thread=threadRoot(s.echoRoot);if(!thread)return result('waiting-response','Chưa xác định được vùng phản hồi cho prompt này');
    if(s.ready) {
      const videos=[...(s.responseRoot.tagName==='VIDEO'&&s.responseRoot.matches(videoSelector)?[s.responseRoot]:[]),...s.responseRoot.querySelectorAll(videoSelector)].filter(v=>v.tagName==='VIDEO');
      if(!s.video.isConnected||videos.length!==1||videos[0]!==s.video||source(s.video)!==s.fingerprint)throw Error('Kết quả đã thay đổi hoặc không còn duy nhất. Dừng tải để tránh lấy nhầm video.');
      return playable(s.video)?result('ready','Video của prompt đã sẵn sàng tải'):result('rendering','Đang chờ dữ liệu video có thể phát');
    }
    const userRoots=[...thread.querySelectorAll('*')].filter(e=>author(e).kind==='user'&&author(e).root===e&&e!==s.echoRoot&&following(s.echoRoot,e));
    const echoIds=new Set([s.echoRoot.id,s.echoRoot.getAttribute('data-message-id'),s.echoRoot.getAttribute('data-id')].filter(Boolean));
    const candidates=[];
    for(const video of thread.querySelectorAll(videoSelector)) {
      if(video.tagName!=='VIDEO'||!following(s.echoRoot,video))continue;
      if(!recover&&(s.baseline.has(video)||s.baselineSources.has(source(video))))continue;
      const root=responseRoot(video,thread);
      if(!root||root.contains(s.echo)||!following(s.echoRoot,root))continue;
      if(userRoots.some(user=>following(user,video)))continue;
      if(!recover&&(s.baseline.has(root)||(s.added.get(root)||0)<s.echoEpoch))continue;
      const ref=root.getAttribute('data-response-to')||root.getAttribute('data-parent-message-id')||root.getAttribute('data-prompt-id');
      if(ref&&!echoIds.has(ref.replace(/^#/,'')))continue;
      candidates.push({video,root});
    }
    if(candidates.length>1)throw Error('Có nhiều video sau prompt này. Dừng để tránh gán hoặc tải nhầm kết quả.');
    if(!candidates.length) {
      if(s.genericResponseRoot && author(s.genericResponseRoot).kind!=='user' && (recover || (!s.baseline.has(s.genericResponseRoot)&&(s.added.get(s.genericResponseRoot)||0)>=s.echoEpoch))) {
        s.responseRoot=s.genericResponseRoot;return result('rendering','Muse đang xử lý prompt này',s.genericResponseRoot);
      }
      const possible=[...thread.querySelectorAll(messageSelector||'*')].filter(root=>{
        const a=author(root),ref=root.getAttribute('data-response-to')||root.getAttribute('data-parent-message-id')||root.getAttribute('data-prompt-id');
        return a.kind==='assistant'&&a.root===root&&!root.contains(s.echo)&&following(s.echoRoot,root)&&!userRoots.some(user=>following(user,root))&&(recover||(!s.baseline.has(root)&&(s.added.get(root)||0)>=s.echoEpoch))&&(!ref||echoIds.has(ref.replace(/^#/,'')));
      });
      if(possible.length===1){s.responseRoot=possible[0];return result('rendering','Muse đang xử lý prompt này',possible[0]);}
      return result('waiting-response','Đang chờ video phản hồi cho đúng prompt này');
    }
    s.video=candidates[0].video;s.responseRoot=candidates[0].root;
    if(!playable(s.video))return result('rendering','Muse đang tạo hoặc tải dữ liệu video');
    s.ready=true;s.fingerprint=source(s.video);
    return result('ready','Video của prompt đã sẵn sàng tải');
  };
  s.download=({phase='auto'}={})=>{
    s.poll();if(!s.ready||!s.responseRoot?.isConnected)throw Error('Video gắn với prompt chưa sẵn sàng tải.');
    const text=e=>norm(e.getAttribute('aria-label')||e.getAttribute('title')||e.textContent);
    const exactDownload=e=>/^(?:download(?:\s+(?:video|file))?|tải\s*(?:xuống|video))$/i.test(text(e));
    const isDownload=e=>e.matches('a[download]')||exactDownload(e);
    function controls(scope=document) {
      const raw=[...scope.querySelectorAll('[role="menuitem"],button,a,[role="button"],div,span')].filter(e=>visible(e)&&(e.matches('[role="menuitem"],button,a,[role="button"]')||exactDownload(e)));
      const normalized=[...new Set(raw.map(e=>{
        const interactive=e.closest('button,a,[role="button"],[role="menuitem"]');
        return interactive&&scope.contains(interactive)&&visible(interactive)&&isDownload(interactive)?interactive:e;
      }))];
      // One custom clickable div may wrap an exact-label span. Click its leaf so
      // bubbling reaches the handler, while retaining actual button ancestors.
      return normalized.filter(e=>e.matches('button,a,[role="button"],[role="menuitem"]')||!normalized.some(child=>child!==e&&e.contains(child)&&isDownload(child)));
    }
    if(phase==='menu'||s.menuPending) {
      if(!s.menuPending||!s.menuBaseline)throw Error('Chưa mở menu của video này.');
      const menu=controls().filter(e=>isDownload(e)&&!s.menuBaseline.has(e));
      if(menu.length>1)throw Error('Có nhiều lệnh tải mới xuất hiện. Không thể chọn an toàn.');
      if(!menu.length)return {action:'waiting-menu',clicked:false,needsMenu:true};
      menu[0].click();s.menuPending=false;return {action:'clicked',clicked:true,needsMenu:false};
    }
    const direct=controls(s.responseRoot).filter(isDownload);
    if(direct.length>1)throw Error('Phản hồi có nhiều nút tải. Không thể xác định nút đúng.');
    if(direct.length===1){direct[0].click();return {action:'clicked',clicked:true,needsMenu:false};}
    const more=[...s.responseRoot.querySelectorAll('button,[role="button"]')].filter(e=>visible(e)&&(/^(?:\.{3}|…|⋯|more(?:\s.*)?|options|menu|thêm|tùy\s*chọn)$/i.test(text(e))||e.getAttribute('aria-haspopup')==='menu'));
    if(more.length>1)throw Error('Có nhiều menu trong phản hồi. Không thể xác định menu tải video.');
    if(more.length===1){s.menuBaseline=new Set(controls());s.menuPending=true;more[0].click();return {action:'waiting-menu',clicked:false,needsMenu:true};}
    return {action:'source',clicked:false,needsMenu:false,url:source(s.video)};
  };
  map.set(id,s);
  return {id,phase:'waiting-prompt',stage:'Đã chụp trạng thái trước khi gửi prompt',ready:false,progress:null};
}
function pollTracking({id}) {
  const state=globalThis[Symbol.for('MuseVideoStudio.promptTrackers.v1')]?.get(id);
  if(!state)throw Error('Không có trạng thái theo dõi cho tác vụ này.');
  return state.poll();
}
function downloadAction({id,phase='auto'}) {
  const state=globalThis[Symbol.for('MuseVideoStudio.promptTrackers.v1')]?.get(id);
  if(!state)throw Error('Không có video đã gắn với tác vụ này.');
  return state.download({phase});
}
function endTracking({id}) {
  const map=globalThis[Symbol.for('MuseVideoStudio.promptTrackers.v1')],state=map?.get(id);
  state?.observer?.disconnect();state?.downloadController?.abort();return map?.delete(id)||false;
}
module.exports={beginTracking,pollTracking,downloadAction,endTracking};
