// These functions execute inside the Muse document through either browser
// adapter. Keep every browser helper inside beginTracking's closure so the
// exported function can be serialized without Node imports or outer variables.
function beginTracking({ id, prompt, videoSelector = 'video', messageSelector = '', recover = false, recoverRequireAnchor = false, echoMarker='',echoKey='',echoAliases=[] }) {
  const key = Symbol.for('MuseVideoStudio.promptTrackers.v1');
  const map = globalThis[key] || (globalThis[key] = new Map());
  if (!id || typeof prompt !== 'string' || !prompt.trim()) throw Error('Tác vụ cần mã và prompt đầy đủ.');
  const norm = value => String(value || '').replace(/\s+/g, ' ').trim();
  const wanted = norm(prompt),previous=map.get(id);
  if(previous){
    if(!recover)throw Error('Tác vụ này đã được theo dõi.');
    if(previous.prompt!==wanted)throw Error('Mã lượt gửi đang giữ prompt khác. Không thay thế cảnh đang chờ.');
    if(previous.documentBody===document.body&&document.body.isConnected&&(!recoverRequireAnchor||!previous.recover||previous.recoverRequireAnchor)){
      // Keep the original before-send baseline. Rebuilding it during Continue
      // would turn a merely delayed first echo into arbitrary chat history.
      for(const alias of echoAliases)if(alias)previous.echoAliases.add(alias);
      return {id,phase:'tracking-retained',stage:'Tiếp tục giữ đúng lượt gửi đang chờ',ready:false,progress:null,retained:true};
    }
    previous.observer?.disconnect();map.delete(id);
  }
  const savedAliases=[...new Set([...echoAliases,...(recover&&map.get(id)?.echoAliases?[...map.get(id).echoAliases]:[]),...(echoKey?[echoKey]:[])])];
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
  const source=v=>{if(v.tagName==='A')return v.href;const declared=v.getAttribute('src');if(declared)return new URL(declared,document.baseURI).href;return v.currentSrc||v.querySelector('source[src]')?.src||'';};
  const videoLink=a=>a.tagName==='A'&&(/^video\//i.test(a.type||'')||/\.(mp4|webm)(?:$|[?#])/i.test(a.href)||/\.(mp4|webm)$/i.test(a.getAttribute('download')||''))&&/^(https:|blob:)/i.test(a.href);
  function mediaNodes(root){return [...new Set([...(root.matches?.(videoSelector)?[root]:[]),...root.querySelectorAll(videoSelector),...(videoLink(root)?[root]:[]),...root.querySelectorAll('a[href]')])].filter(v=>v.tagName==='VIDEO'||videoLink(v));}
  // Validate selectors now rather than partially submitting then discovering a
  // malformed configuration. A selector must resolve to actual video elements.
  document.querySelectorAll(videoSelector); if(messageSelector)document.querySelectorAll(messageSelector);
  const s={documentBody:document.body,echoAliases:new Set(savedAliases),id,prompt:wanted,recover,recoverRequireAnchor,videoSelector,messageSelector,baseline:new Set(document.querySelectorAll('*')),baselineSources:new Set(mediaNodes(document).map(source).filter(Boolean)),added:new WeakMap(),textChanged:new WeakMap(),sequence:0,echo:null,echoRoot:null,responseRoot:null,video:null,fingerprint:'',ready:false,menuPending:false,menuBaseline:null};
  s.observer=new MutationObserver(records=>{
    for(const record of records) {
      const seq=++s.sequence;
      for(const node of record.addedNodes||[]) if(node.nodeType===1) {s.added.set(node,seq);for(const child of node.querySelectorAll('*'))s.added.set(child,seq);}
      if(record.type==='characterData' || record.type==='childList')for(let n=record.target.nodeType===1?record.target:record.target.parentElement;n && n!==document.body;n=n.parentElement)s.textChanged.set(n,seq);
    }
  });
  s.observer.observe(document.body,{subtree:true,childList:true,characterData:true});
  const recoveryKeys=new Set(savedAliases);
  const anchorMatches=root=>[root.id,root.getAttribute('data-message-id'),root.getAttribute('data-id')].some(key=>key&&recoveryKeys.has(key))||Boolean(echoMarker&&root.getAttribute('data-muse-studio-attempt')===echoMarker);
  function echoCandidates(all=false) {
    const matches=[...document.body.querySelectorAll('*')].filter(e=>visible(e)&&!composer(e)&&norm(e.innerText ?? e.textContent)===wanted&&(all||recover||!s.baseline.has(e))&&author(e).kind!=='assistant');
    const leaves=matches.filter(e=>!matches.some(other=>other!==e&&e.contains(other)));
    const roots=new Map();
    for(const leaf of leaves) {
      const known=author(leaf);
      let root=(messageSelector?leaf.closest(messageSelector):null)||(known.kind==='user'?known.root:leaf);
      if(!root)continue;
      if(!(messageSelector&&root.matches(messageSelector)) && known.kind==='unknown')while(root.parentElement && root.parentElement!==document.body && norm(root.parentElement.innerText ?? root.parentElement.textContent)===wanted && !root.parentElement.querySelector('video,textarea,[contenteditable="true"]'))root=root.parentElement;
      if(!all&&!recover && s.baseline.has(root))continue;
      roots.set(root,{leaf,root});
    }
    const candidates=[...roots.values()];
    if(all||!recover||(!recoverRequireAnchor&&!echoKey&&!echoMarker))return candidates;
    const anchored=candidates.filter(e=>anchorMatches(e.root));
    return recoverRequireAnchor||anchored.length||echoKey?anchored:candidates;
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
      const freshMedia=mediaNodes(next).some(v=>(recover||(!s.baseline.has(v)&&!s.baselineSources.has(source(v)))));
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
  const playable=v=>videoLink(v)||(v.tagName==='VIDEO'&&/^(https:|blob:)/i.test(source(v)));
  function rememberContext(root){const parents=[];for(let p=root.parentElement,depth=0;p&&p!==document.body&&depth<8;p=p.parentElement,depth++)if(!p.querySelector('textarea,input,[contenteditable="true"],[role="textbox"],nav,aside'))parents.push(p);return parents;}
  function result(phase,stage,root=s.responseRoot) {return {id,phase,stage,responseMatched:Boolean(root?.isConnected&&s.echoRoot&&following(s.echoRoot,root)),echoAliases:[...s.echoAliases],echoMatched:Boolean(s.echo),echoKey:s.echoRoot?.id||s.echoRoot?.getAttribute('data-message-id')||s.echoRoot?.getAttribute('data-id')||'',echoMarker:s.echoRoot?.getAttribute('data-muse-studio-attempt')||'',ready:phase==='ready',progress:progress(root),...(phase==='ready'?{url:source(s.video),fingerprint:s.fingerprint}:{})};}
  s.poll=()=>{
    if(s.echo?.isConnected&&s.echoRoot?.isConnected&&(!s.echoRoot.contains(s.echo)||norm(s.echo.innerText??s.echo.textContent)!==wanted||author(s.echo).kind==='assistant'))throw Error('Tin nhắn của cảnh đã thay đổi. Không lấy video từ câu Test hay cảnh khác.');
    let echoes=echoCandidates();
    if(!s.echo&&!echoes.length&&recover&&!recoverRequireAnchor&&(echoKey||echoMarker)){const exact=echoCandidates(true);if(exact.length===1)echoes=exact;else if(exact.length>1)throw Error('Có nhiều tin nhắn trùng prompt nhưng ID cũ đã thay đổi. Không chọn clip khi chưa xác định được cảnh.');}
    if(!s.echo&&echoes.length>1)throw Error('Có nhiều tin nhắn trùng chính xác prompt. Không xác định được video của tác vụ; hãy dùng chat riêng hoặc xử lý thủ công.');
    if(!s.echo) {
      if(!echoes.length){if(recover&&recoverRequireAnchor)return {...result('recovery-unbound','Chưa xác nhận được tin nhắn của đúng lượt gửi cũ',null),recoveryUnbound:true,historicalEchoCount:echoCandidates(true).length};return result('waiting-prompt','Chờ Muse hiển thị đúng prompt đã gửi');}
      s.echo=echoes[0].leaf;s.echoRoot=echoes[0].root;s.echoRoot.setAttribute('data-muse-studio-attempt',id);s.echoNativeKey=s.echoRoot.id||s.echoRoot.getAttribute('data-message-id')||s.echoRoot.getAttribute('data-id')||'';if(s.echoNativeKey)s.echoAliases.add(s.echoNativeKey);s.echoContexts=rememberContext(s.echoRoot);s.echoEpoch=Math.max(s.added.get(s.echo)||0,s.added.get(s.echoRoot)||0,s.textChanged.get(s.echo)||0);
    }
    if(!s.echo.isConnected||!s.echoRoot.isConnected){
      const all=echoCandidates(true);
      let anchored=all.filter(e=>e.root===s.echoRoot||e.root.getAttribute('data-muse-studio-attempt')===id||(s.echoNativeKey&&[e.root.id,e.root.getAttribute('data-message-id'),e.root.getAttribute('data-id')].includes(s.echoNativeKey)));
      if(!recoverRequireAnchor&&!anchored.length&&all.length===1&&s.echoContexts?.some(parent=>parent.isConnected&&parent.contains(all[0].root)))anchored=all;
      if(anchored.length!==1)return result('waiting-response','Muse đang dựng lại tin nhắn · chờ khôi phục đúng cảnh gốc',null);
      s.echo=anchored[0].leaf;s.echoRoot=anchored[0].root;s.echoContexts=rememberContext(s.echoRoot);s.echoNativeKey=s.echoRoot.id||s.echoRoot.getAttribute('data-message-id')||s.echoRoot.getAttribute('data-id')||'';if(s.echoNativeKey)s.echoAliases.add(s.echoNativeKey);s.echoRoot.setAttribute('data-muse-studio-attempt',id);s.ready=false;s.responseRoot=null;s.video=null;
    }
    const thread=threadRoot(s.echoRoot);if(!thread)return result('waiting-response','Chưa xác định được vùng phản hồi cho prompt này');
    if(s.ready&&(!s.video?.isConnected||!s.responseRoot?.isConnected)){s.ready=false;s.video=null;s.responseRoot=null;}
    if(s.ready&&s.video&&(source(s.video)!==s.fingerprint))throw Error('Kết quả đã thay đổi. Dừng tải để tránh lấy nhầm video.');
    // Every poll, including immediately before download, checks the prompt and
    // response boundaries again. A live DOM node can be recycled for Test or
    // another turn without being disconnected.
    s.ready=false;
    const userRoots=[...thread.querySelectorAll('*')].filter(e=>e!==s.echoRoot&&following(s.echoRoot,e)&&((author(e).kind==='user'&&author(e).root===e)||e.hasAttribute('data-muse-studio-attempt')));
    const echoIds=new Set([...s.echoAliases,s.echoRoot.id,s.echoRoot.getAttribute('data-message-id'),s.echoRoot.getAttribute('data-id')].filter(Boolean));
    const candidates=[];
    for(const video of mediaNodes(thread)) {
      if(!following(s.echoRoot,video))continue;
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
      s.responseRoot=null;s.video=null;
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
    const isDownload=e=>e.matches('a[download]')||exactDownload(e)||Boolean(e.querySelector('svg.lucide-download,.tabler-icon-download,[data-icon="download"],[data-lucide="download"]'));
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
      // Require the menu opened by this clip, including portals/reused popups.
      // Never use a direct download link or guess the second element globally.
      const target=menu[0],controlled=s.menuOpener?.getAttribute('aria-controls');
      if(controlled&&!controlled.split(/\s+/).some(id=>document.getElementById(id)?.contains(target)))throw Error('Lệnh tải không thuộc menu của clip này.');
      const rowChildren=p=>[...p.children].filter(e=>visible(e)&&!e.matches('svg,[aria-hidden="true"],[role="separator"]')&&/[\p{L}\p{N}]/u.test(text(e)));
      let popup=target.closest('[role="menu"]');
      if(!popup){
        for(let p=target.parentElement;p&&p!==document.body;p=p.parentElement){
          if(p.contains(s.video)||p.contains(s.echoRoot)||p.querySelector('textarea,input,video'))break;
          if(rowChildren(p).length>=2){popup=p;break;}
        }
      }
      if(!popup)throw Error('Chưa xác định được dòng thứ hai trong menu của clip.');
      const interactive=[...popup.querySelectorAll('[role="menuitem"],button,a,[role="button"]')].filter(visible);
      const rows=interactive.length?interactive.filter(e=>!interactive.some(parent=>parent!==e&&parent.contains(e))):rowChildren(popup);
      if(rows.length<2||!(rows[1]===target||rows[1].contains(target)))throw Error('Dòng thứ hai của menu chưa phải Tải xuống. Chưa bấm để tránh tải nhầm.');
      if(rows[1].disabled||rows[1].getAttribute('aria-disabled')==='true')return {action:'waiting-menu',clicked:false,needsMenu:true};
      menu[0].click();s.menuPending=false;return {action:'clicked',clicked:true,needsMenu:false};
    }
    let more=[];
    for(let scope=s.responseRoot,depth=0;scope&&scope!==document.body&&depth<4;scope=scope.parentElement,depth++){
      if(scope!==s.responseRoot&&(scope.contains(s.echoRoot)||scope.querySelector('textarea,input,[contenteditable="true"],nav,aside')))break;
      const media=mediaNodes(scope);if(media.length!==1||media[0]!==s.video)break;
      more=[...scope.querySelectorAll('button,[role="button"],div[tabindex],span[tabindex]')].filter(e=>visible(e)&&(/^(?:\.{3}|…|⋯|more(?:\s.*)?|options|menu|thêm|tùy\s*chọn)$/i.test(text(e))||e.getAttribute('aria-haspopup')==='menu'||Boolean(e.querySelector('svg.lucide-ellipsis,svg.lucide-more-horizontal,[data-icon="more-horizontal"],[data-lucide="ellipsis"]'))||[...e.querySelectorAll('svg')].some(svg=>{const dots=[...svg.querySelectorAll('circle')];return dots.length===3&&dots.every(d=>d.getAttribute('cy')===dots[0].getAttribute('cy'));})));
      more=more.filter(e=>!more.some(child=>child!==e&&e.contains(child)));
      if(more.length)break;
    }
    if(more.length>1)throw Error('Có nhiều menu trong phản hồi. Không thể xác định menu tải video.');
    if(more.length===1){s.menuBaseline=new Set(controls());s.menuOpener=more[0];s.menuPending=true;more[0].click();return {action:'waiting-menu',clicked:false,needsMenu:true};}
    throw Error('Chưa thấy menu … của đúng clip. Chưa tải video.');
  };
  const prior=echoCandidates(true).length;s.hadPriorSame=recover?prior>1:prior>0;
  s.probe=()=>{
    const current=s.poll();
    const meaningful=text=>text.length>=3&&/[\p{L}\p{N}]/u.test(text)&&!/^((?:muse )?(?:is )?thinking|đang (?:suy nghĩ|xử lý|trả lời)|loading|typing)[.…\s]*$/i.test(text);
    if(!current.echoMatched)return{echoSeen:false,replySeen:false,message:'Chưa thấy câu test trong chat'};
    if(current.responseMatched&&meaningful(norm(s.responseRoot?.innerText)))return{echoSeen:true,replySeen:true,message:'Muse đã phản hồi câu test',snippet:norm(s.responseRoot.innerText).slice(0,160)};
    for(const scope of rememberContext(s.echoRoot)){
      let branch=s.echoRoot;while(branch.parentElement&&branch.parentElement!==scope)branch=branch.parentElement;
      let next=branch.nextElementSibling;
      for(let n=0;next&&n<4;next=next.nextElementSibling,n++){
        if(author(next).kind==='user')break;
        const text=norm(next.innerText),ref=next.getAttribute('data-response-to')||next.getAttribute('data-parent-message-id');
        if(!meaningful(text)||text===wanted||next.tagName!==branch.tagName||next.matches('nav,aside')||next.querySelector('textarea,input,nav,aside,[data-message-role="user"],[data-role="user"]'))continue;
        if(ref&&![s.echoRoot.id,s.echoRoot.getAttribute('data-message-id'),s.echoRoot.getAttribute('data-id')].includes(ref.replace(/^#/,'')))continue;
        if(!s.baseline.has(next)&&(s.added.get(next)||0)>=s.echoEpoch){s.responseRoot=next;return{echoSeen:true,replySeen:true,message:'Muse đã có phản hồi mới',snippet:text.slice(0,160)};}
      }
    }
    return{echoSeen:true,replySeen:false,message:'Đã thấy câu test · chờ Muse phản hồi mới'};
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
  state?.observer?.disconnect();state?.downloadController?.abort();const stops=globalThis[Symbol.for('MuseVideoStudio.stopRequests.v1')];if(stops)for(const key of stops)if(key.startsWith(id+':'))stops.delete(key);return map?.delete(id)||false;
}
function pollBrowserProbe({id}){const s=globalThis[Symbol.for('MuseVideoStudio.promptTrackers.v1')]?.get(id);if(!s)throw Error('Test không còn gắn với tab này.');return s.probe();}
module.exports={pollBrowserProbe,beginTracking,pollTracking,downloadAction,endTracking};
