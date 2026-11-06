// These functions execute inside the Muse document through either browser
// adapter. Keep every browser helper inside beginTracking's closure so the
// exported function can be serialized without Node imports or outer variables.
function beginTracking({ id, prompt, videoSelector = 'video', messageSelector = '', recover = false, recoverRequireAnchor = false, echoMarker='',echoKey='',echoAliases=[],otherPrompts=[],mediaKind='video',imageSelector='',settleMs=3000 }) {
  const key = Symbol.for('MuseVideoStudio.promptTrackers.v1');
  const map = globalThis[key] || (globalThis[key] = new Map());
  if (!id || typeof prompt !== 'string' || !prompt.trim()) throw Error('Tác vụ cần mã và prompt đầy đủ.');
  const norm = value => String(value || '').replace(/\s+/g, ' ').trim();
  const wanted = norm(prompt),previous=map.get(id);
  const others=[...new Set((Array.isArray(otherPrompts)?otherPrompts:[]).map(norm).filter(p=>p.length>=8&&p!==wanted))];
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
  // Muse can show the same prompt twice ("not confirmed as sent", then sent again). The reply to the
  // second copy still answers this prompt, so for pictures it does not count as another message.
  const resend = e => imageMode && norm(e.innerText ?? e.textContent) === wanted;
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
  const imageMode=mediaKind==='image',imageSel=imageSelector||'img';
  const source=v=>{if(v.tagName==='IMG')return v.currentSrc||v.src||'';if(v.tagName==='A')return v.href;const declared=v.getAttribute('src');if(declared)return new URL(declared,document.baseURI).href;return v.currentSrc||v.querySelector('source[src]')?.src||'';};
  const videoLink=a=>a.tagName==='A'&&(/^video\//i.test(a.type||'')||/\.(mp4|webm)(?:$|[?#])/i.test(a.href)||/\.(mp4|webm)$/i.test(a.getAttribute('download')||''))&&/^(https:|blob:)/i.test(a.href);
  // Avatars, icons and emoji are not results of a prompt. Muse shows a generated picture
  // as a thumbnail (about 220 px wide, so a 16:9 picture is only about 124 px high),
  // which is why the floor is low: the picture must still follow this prompt's message.
  const IMG_MIN=80,IMG_NATURAL_MIN=96;
  // The name/alt checks only apply to small pictures: a result is never an icon or avatar, and its
  // alt text may legitimately contain those words (it can repeat the prompt, e.g. "no logo").
  const imageSource=(src,small=true)=>/^(https:|blob:|data:image\/(?:png|jpe?g|webp|gif);)/i.test(src)&&!/\.svg(?:$|[?#])/i.test(src)&&!(small&&/(?:^|[\/_.-])(?:avatar|emoji|sprite|favicon|logo)(?:[\/_.-]|$)/i.test(src));
  const SMALL_SIDE=140;
  // Why a picture near this prompt is not accepted as its result ('' = usable).
  function imageWhy(v){
    if(v.tagName!=='IMG')return 'không phải thẻ ảnh';
    const src=source(v);
    if(!/^(https:|blob:|data:image\/(?:png|jpe?g|webp|gif);)/i.test(src))return 'nguồn ảnh lạ ('+(src.match(/^[a-z]+:/i)?.[0]||'trống')+')';
    if(/\.svg(?:$|[?#])/i.test(src))return 'ảnh vector';
    if(!visible(v))return 'đang ẩn';
    if(composer(v))return 'nằm trong ô soạn thảo';
    const r=v.getBoundingClientRect();
    if(r.width<IMG_MIN||r.height<IMG_MIN)return `quá nhỏ (${Math.round(r.width)}×${Math.round(r.height)} px, tối thiểu ${IMG_MIN})`;
    if(Math.max(r.width,r.height)<SMALL_SIDE&&(/avatar|emoji|icon|logo/i.test(v.getAttribute('alt')||'')||!imageSource(src,true)))return 'giống biểu tượng hoặc avatar';
    if(v.complete&&v.naturalWidth>0&&(v.naturalWidth<IMG_NATURAL_MIN||v.naturalHeight<IMG_NATURAL_MIN))return `ảnh thật chỉ ${v.naturalWidth}×${v.naturalHeight} px`;
    return '';
  }
  const imageUsable=v=>!imageWhy(v);
  // Pictures that look like a result but are not accepted, for the card's hint.
  function tinyImages(){
    return [...document.querySelectorAll(imageSel)].filter(v=>v.tagName==='IMG'&&s.echoRoot?.isConnected&&following(s.echoRoot,v)&&!s.echoRoot.contains(v)&&!s.baselineSources.has(source(v))&&imageWhy(v)&&visible(v)&&!composer(v));
  }
  function imageNodes(root){return [...new Set([...(root.matches?.(imageSel)?[root]:[]),...root.querySelectorAll(imageSel)])].filter(imageUsable);}
  function mediaNodes(root){
    if(imageMode)return imageNodes(root);
    return [...new Set([...(root.matches?.(videoSelector)?[root]:[]),...root.querySelectorAll(videoSelector),...(videoLink(root)?[root]:[]),...root.querySelectorAll('a[href]')])].filter(v=>v.tagName==='VIDEO'||videoLink(v));
  }
  // Validate selectors now rather than partially submitting then discovering a
  // malformed configuration. A selector must resolve to actual video elements.
  document.querySelectorAll(imageMode?imageSel:videoSelector); if(messageSelector)document.querySelectorAll(messageSelector);
  const baselineMedia=imageMode?[...document.querySelectorAll('img')].map(source):mediaNodes(document).map(source);
  const s={documentBody:document.body,echoAliases:new Set(savedAliases),id,prompt:wanted,recover,recoverRequireAnchor,videoSelector,messageSelector,mediaKind,baseline:new Set(document.querySelectorAll('*')),baselineSources:new Set(baselineMedia.filter(Boolean)),added:new WeakMap(),textChanged:new WeakMap(),sequence:0,echo:null,echoRoot:null,responseRoot:null,video:null,images:[],imageSig:'',imageSince:0,fingerprint:'',ready:false,menuPending:false,menuBaseline:null};
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
      if(!(messageSelector&&root.matches(messageSelector)) && known.kind==='unknown')while(root.parentElement && root.parentElement!==document.body && norm(root.parentElement.innerText ?? root.parentElement.textContent)===wanted && !root.parentElement.querySelector('video,textarea,[contenteditable="true"]') && !(imageMode&&imageNodes(root.parentElement).length))root=root.parentElement;
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
    s.genericResponseRoot=null;s.genericSpan=null;
    let branch=root;
    for(let parent=root.parentElement,depth=0;parent && parent!==document.body && depth<5;branch=parent,parent=parent.parentElement,depth++) {
      if(parent.querySelector('textarea,input,[contenteditable="true"],[role="textbox"],nav,aside'))continue;
      const filled=n=>Boolean(norm(n.textContent)||n.querySelector('video,progress,[role="progressbar"],button,a'));
      let next=branch.nextElementSibling;
      while(next&&!filled(next))next=next.nextElementSibling;
      if(!next||next.tagName!==branch.tagName)continue;
      // Muse may answer with several rows (a sentence, the clip, then a note). In a
      // live send only this prompt is in flight in this window, so every new row
      // after its echo belongs to its reply: look through the next few rows, and
      // stop at another prompt's row, a different kind of element or the composer.
      // Recovery has no before-send baseline, so it also stops at any row that
      // shows another queued prompt (or the Test sentence), never reading past it.
      let found=null;const span=[];
      for(let rows=0;next&&rows<12;next=next.nextElementSibling){
        if(!filled(next))continue;
        rows++;
        if(next.tagName!==branch.tagName||next.hasAttribute('data-muse-studio-attempt')||next.querySelector('[data-muse-studio-attempt],textarea,input,[contenteditable="true"],[role="textbox"]'))break;
        if(recover){const text=norm(next.textContent);if(others.some(p=>text.includes(p)))break;}
        span.push(next);
        const freshMedia=mediaNodes(next).some(v=>(recover||(!s.baseline.has(v)&&!s.baselineSources.has(source(v)))));
        const actualProgress=next.querySelector('progress,[role="progressbar"],[aria-valuenow]');
        if(!found&&(freshMedia||actualProgress))found=next;
      }
      // Only clips inside these rows can belong to this prompt; rows past the stop
      // point are other turns. Two clips inside them stay ambiguous and fail closed.
      if(found){s.genericResponseRoot=found;s.genericSpan=span;return parent;}
    }
    return null;
  }
  // Short reason shown on the card while no reply is bound to this prompt, so a
  // stuck scene says what the tool can and cannot see in the chat.
  function tinyHint(){
    if(!imageMode||!s.echoRoot?.isConnected)return '';
    const tiny=tinyImages();
    if(!tiny.length||imageNodes(document).some(v=>following(s.echoRoot,v)&&!s.echoRoot.contains(v)&&!s.baselineSources.has(source(v))))return '';
    return `thấy ${tiny.length} ảnh nhưng chưa nhận: ${imageWhy(tiny[0])}`;
  }
  function hint(){
    const small=tinyHint();if(small)return small;
    const fresh=(imageMode?imageNodes(document):[...document.querySelectorAll('video')]).filter(v=>s.echoRoot?.isConnected&&following(s.echoRoot,v)&&(!imageMode||!s.echoRoot.contains(v))&&(recover||(!s.baseline.has(v)&&!s.baselineSources.has(source(v))))).length;
    const why=Object.entries(s.reject||{}).map(([k,n])=>k+' '+n).join(', '),noun=imageMode?'ảnh':'video';
    return fresh?`thấy ${fresh} ${noun} mới nhưng chưa gắn được vào đúng prompt${why?' ('+why+')':''}`:`chưa thấy ${noun} mới trong chat`;
  }
  function lca(a,b){const up=new Set();for(let n=a;n;n=n.parentElement)up.add(n);for(let n=b;n;n=n.parentElement)if(up.has(n))return n;return null;}
  // Markup-independent chat area: the nearest scrolling ancestor of the echo, limited
  // to ancestors that hold no composer, nav or aside.
  function chatBound(){
    let bound=null;
    for(let n=s.echoRoot.parentElement;n&&n!==document.body&&n!==document.documentElement;n=n.parentElement){
      if(n.querySelector('textarea,input,[contenteditable="true"],[role="textbox"],nav,aside'))break;
      bound=n;
    }
    if(!bound)return null;
    for(let n=s.echoRoot.parentElement;n&&bound.contains(n);n=n.parentElement){
      if(/auto|scroll|overlay/.test(getComputedStyle(n).overflowY)&&n.scrollHeight>n.clientHeight+2)return n;
    }
    return bound;
  }
  // Used when the row structure of the chat is not recognised: any new clip that
  // follows this prompt's echo inside the same chat area belongs to it. Only one
  // prompt is in flight per window; two clips stay ambiguous and fail closed.
  function fallbackCandidates(note){
    const found=[];
    if(!s.echoRoot?.isConnected)return found;
    const bound=chatBound();if(!bound)return found;
    const users=[...bound.querySelectorAll('*')].filter(e=>e!==s.echoRoot&&following(s.echoRoot,e)&&author(e).kind==='user'&&author(e).root===e&&!resend(e));
    const ids=new Set([...s.echoAliases,s.echoRoot.id,s.echoRoot.getAttribute('data-message-id'),s.echoRoot.getAttribute('data-id')].filter(Boolean));
    for(const video of mediaNodes(bound)){
      if(!following(s.echoRoot,video)||s.echoRoot.contains(video)||composer(video))continue;
      if(!recover&&(s.baseline.has(video)||s.baselineSources.has(source(video))))continue;
      const common=lca(s.echoRoot,video);
      if(!common||!bound.contains(common)){note('ngoài vùng chat');continue;}
      let root=video,first=s.echoRoot;
      while(root.parentElement&&root.parentElement!==common)root=root.parentElement;
      while(first.parentElement&&first.parentElement!==common)first=first.parentElement;
      if(root.parentElement!==common||first.parentElement!==common||root===first||root.contains(s.echo)){note('không rõ khối');continue;}
      if(users.some(user=>following(user,video))){note('sau tin nhắn khác');continue;}
      const owner=video.closest('[data-response-to],[data-parent-message-id],[data-prompt-id]'),ref=owner&&(owner.getAttribute('data-response-to')||owner.getAttribute('data-parent-message-id')||owner.getAttribute('data-prompt-id'));
      if(ref&&!ids.has(ref.replace(/^#/,''))){note('khác ID prompt');continue;}
      let blocked=false;
      for(let n=first.nextElementSibling;n;n=n.nextElementSibling){
        if(n.hasAttribute('data-muse-studio-attempt')||n.querySelector('[data-muse-studio-attempt]')){blocked=true;break;}
        if(recover&&others.length&&others.some(p=>norm(n.textContent).includes(p))){blocked=true;break;}
        if(n===root)break;
      }
      if(blocked){note('sau prompt khác');continue;}
      found.push({video,root});
    }
    return found;
  }

  function responseRoot(video,thread) {
    if(messageSelector)return video.closest(messageSelector);
    if(s.genericResponseRoot?.contains(video))return s.genericResponseRoot;
    const a=author(video);if(a.kind==='user')return null;if(a.kind==='assistant'&&thread.contains(a.root))return a.root;
    let branch=video;while(branch.parentElement&&branch.parentElement!==thread)branch=branch.parentElement;
    return branch.parentElement===thread?branch:null;
  }
  function progress(root,textual=true) {
    if(!root)return null;
    for(const e of root.querySelectorAll('progress,[role="progressbar"],[aria-valuenow]'))if(visible(e)){
      const raw=e.tagName==='PROGRESS'?(e.hasAttribute('value')?e.value:NaN):Number(e.getAttribute('aria-valuenow'));
      const max=e.tagName==='PROGRESS'?e.max:Number(e.getAttribute('aria-valuemax')||100),min=e.tagName==='PROGRESS'?0:Number(e.getAttribute('aria-valuemin')||0);
      if(Number.isFinite(raw)&&Number.isFinite(max)&&max>min&&raw>=min&&raw<=max)return Math.round((raw-min)/(max-min)*100);
    }
    if(!textual)return null;
    const values=[...root.querySelectorAll('*')].filter(e=>visible(e)&&e.children.length===0).map(e=>norm(e.textContent)).filter(t=>t.length<=80).map(t=>t.match(/(?:^|\s)(\d{1,3}(?:[.,]\d+)?)\s*%/)).filter(Boolean).map(m=>Number(m[1].replace(',','.'))).filter(v=>v>=0&&v<=100);
    return new Set(values).size===1?values[0]:null;
  }
  const playable=v=>imageMode?(v.tagName==='IMG'&&v.complete&&v.naturalWidth>=IMG_NATURAL_MIN&&v.naturalHeight>=IMG_NATURAL_MIN&&imageSource(source(v),false)):videoLink(v)||(v.tagName==='VIDEO'&&/^(https:|blob:)/i.test(source(v)));
  function rememberContext(root){const parents=[];for(let p=root.parentElement,depth=0;p&&p!==document.body&&depth<8;p=p.parentElement,depth++)if(!p.querySelector('textarea,input,[contenteditable="true"],[role="textbox"],nav,aside'))parents.push(p);return parents;}
  function result(phase,stage,root=s.responseRoot) {return {id,phase,stage,responseMatched:Boolean(root?.isConnected&&s.echoRoot&&following(s.echoRoot,root)),echoAliases:[...s.echoAliases],echoMatched:Boolean(s.echo),echoKey:s.echoRoot?.id||s.echoRoot?.getAttribute('data-message-id')||s.echoRoot?.getAttribute('data-id')||'',echoMarker:s.echoRoot?.getAttribute('data-muse-studio-attempt')||'',ready:phase==='ready',progress:progress(root),...(phase==='ready'?{url:source(s.video),fingerprint:s.fingerprint,...(imageMode?{count:s.images.length}:{})}:{})};}
  s.poll=()=>{
    if(s.echo?.isConnected&&s.echoRoot?.isConnected&&(!s.echoRoot.contains(s.echo)||norm(s.echo.innerText??s.echo.textContent)!==wanted||author(s.echo).kind==='assistant'))throw Error('Tin nhắn của cảnh đã thay đổi. Không lấy video từ câu Test hay cảnh khác.');
    let echoes=echoCandidates();
    if(!s.echo&&!echoes.length&&recover&&!recoverRequireAnchor&&(echoKey||echoMarker)){const exact=echoCandidates(true);if(exact.length===1)echoes=exact;else if(exact.length>1)throw Error('Có nhiều tin nhắn trùng prompt nhưng ID cũ đã thay đổi. Không chọn clip khi chưa xác định được cảnh.');}
    if(!s.echo&&echoes.length>1&&!(imageMode&&!recover&&echoes.every(e=>resend(e.leaf)||resend(e.root))))throw Error('Có nhiều tin nhắn trùng chính xác prompt. Không xác định được video của tác vụ; hãy dùng chat riêng hoặc xử lý thủ công.');
    if(!s.echo) {
      if(!echoes.length){if(recover&&recoverRequireAnchor)return {...result('recovery-unbound','Chưa xác nhận được tin nhắn của đúng lượt gửi cũ',null),recoveryUnbound:true,historicalEchoCount:echoCandidates(true).length};return result('waiting-prompt','Chờ Muse hiển thị đúng prompt đã gửi');}
      s.echo=echoes[0].leaf;s.echoRoot=echoes[0].root;s.echoRoot.setAttribute('data-muse-studio-attempt',id);s.echoNativeKey=s.echoRoot.id||s.echoRoot.getAttribute('data-message-id')||s.echoRoot.getAttribute('data-id')||'';if(s.echoNativeKey)s.echoAliases.add(s.echoNativeKey);s.echoContexts=rememberContext(s.echoRoot);s.echoEpoch=Math.max(s.added.get(s.echo)||0,s.added.get(s.echoRoot)||0);
    }
    if(!s.echo.isConnected||!s.echoRoot.isConnected){
      const all=echoCandidates(true);
      let anchored=all.filter(e=>e.root===s.echoRoot||e.root.getAttribute('data-muse-studio-attempt')===id||(s.echoNativeKey&&[e.root.id,e.root.getAttribute('data-message-id'),e.root.getAttribute('data-id')].includes(s.echoNativeKey)));
      if(!recoverRequireAnchor&&!anchored.length&&all.length===1&&s.echoContexts?.some(parent=>parent.isConnected&&parent.contains(all[0].root)))anchored=all;
      if(anchored.length!==1)return result('waiting-response','Muse đang dựng lại tin nhắn · chờ khôi phục đúng cảnh gốc',null);
      s.echo=anchored[0].leaf;s.echoRoot=anchored[0].root;s.echoContexts=rememberContext(s.echoRoot);s.echoNativeKey=s.echoRoot.id||s.echoRoot.getAttribute('data-message-id')||s.echoRoot.getAttribute('data-id')||'';if(s.echoNativeKey)s.echoAliases.add(s.echoNativeKey);s.echoRoot.setAttribute('data-muse-studio-attempt',id);s.ready=false;s.responseRoot=null;s.video=null;
    }
    const thread=threadRoot(s.echoRoot);
    if(s.ready&&(!s.video?.isConnected||!s.responseRoot?.isConnected)){s.ready=false;s.video=null;s.responseRoot=null;}
    if(s.ready&&s.video&&!imageMode&&(source(s.video)!==s.fingerprint))throw Error('Kết quả đã thay đổi. Dừng tải để tránh lấy nhầm video.');
    // Every poll, including immediately before download, checks the prompt and
    // response boundaries again. A live DOM node can be recycled for Test or
    // another turn without being disconnected.
    s.ready=false;
    const userRoots=thread?[...thread.querySelectorAll('*')].filter(e=>e!==s.echoRoot&&following(s.echoRoot,e)&&((author(e).kind==='user'&&author(e).root===e&&!resend(e))||e.hasAttribute('data-muse-studio-attempt'))):[];
    const echoIds=new Set([...s.echoAliases,s.echoRoot.id,s.echoRoot.getAttribute('data-message-id'),s.echoRoot.getAttribute('data-id')].filter(Boolean));
    const candidates=[],reject={};const note=k=>{reject[k]=(reject[k]||0)+1;};s.reject=reject;
    for(const video of (thread?mediaNodes(thread):[])) {
      if(!following(s.echoRoot,video))continue;
      if(imageMode&&s.echoRoot.contains(video))continue;
      if(s.genericSpan&&!s.genericSpan.some(row=>row.contains(video))){note('ngoài vùng trả lời');continue;}
      if(!recover&&(s.baseline.has(video)||s.baselineSources.has(source(video))))continue;
      const root=responseRoot(video,thread);
      if(!root||root.contains(s.echo)||!following(s.echoRoot,root)){note('không rõ khối');continue;}
      if(userRoots.some(user=>following(user,video))){note('sau tin nhắn khác');continue;}
      if(!recover&&(s.baseline.has(root)||(s.added.get(root)||0)<s.echoEpoch)){note('khối cũ');continue;}
      const ref=root.getAttribute('data-response-to')||root.getAttribute('data-parent-message-id')||root.getAttribute('data-prompt-id');
      if(ref&&!echoIds.has(ref.replace(/^#/,''))){note('khác ID prompt');continue;}
      candidates.push({video,root});
    }
    if(!candidates.length)candidates.push(...fallbackCandidates(note));
    if(imageMode){
      // A reply may hold several pictures (variants), but they must all sit in one
      // response block; pictures spread over several blocks fail closed.
      if(new Set(candidates.map(c=>c.root)).size>1)throw Error('Có ảnh nằm ở nhiều khối phản hồi sau prompt này. Dừng để tránh gán hoặc lưu nhầm ảnh.');
      const seen=new Set(),unique=candidates.filter(c=>{const key=source(c.video);if(seen.has(key))return false;seen.add(key);return true;});candidates.splice(0,candidates.length,...unique);
    }else if(candidates.length>1)throw Error('Có nhiều video sau prompt này. Dừng để tránh gán hoặc tải nhầm kết quả.');
    if(!candidates.length) {
      s.responseRoot=null;s.video=null;
      if(!thread)return {...result('waiting-response','Chưa xác định được vùng phản hồi cho prompt này'),hint:hint()};
      if(s.genericResponseRoot && author(s.genericResponseRoot).kind!=='user' && (recover || (!s.baseline.has(s.genericResponseRoot)&&(s.added.get(s.genericResponseRoot)||0)>=s.echoEpoch))) {
        s.responseRoot=s.genericResponseRoot;return result('rendering','Muse đang xử lý prompt này'+(tinyHint()?' · '+tinyHint():''),s.genericResponseRoot);
      }
      const possible=[...thread.querySelectorAll(messageSelector||'*')].filter(root=>{
        const a=author(root),ref=root.getAttribute('data-response-to')||root.getAttribute('data-parent-message-id')||root.getAttribute('data-prompt-id');
        return a.kind==='assistant'&&a.root===root&&!root.contains(s.echo)&&following(s.echoRoot,root)&&!userRoots.some(user=>following(user,root))&&(recover||(!s.baseline.has(root)&&(s.added.get(root)||0)>=s.echoEpoch))&&(!ref||echoIds.has(ref.replace(/^#/,'')));
      });
      if(possible.length===1){s.responseRoot=possible[0];return result('rendering','Muse đang xử lý prompt này'+(tinyHint()?' · '+tinyHint():''),possible[0]);}
      return {...result('waiting-response','Đang chờ video phản hồi cho đúng prompt này'),hint:hint()};
    }
    s.video=candidates[0].video;s.responseRoot=candidates[0].root;
    if(imageMode){
      const images=candidates.map(c=>c.video);s.images=images;s.video=images[0];
      for(const image of images)if(!image.complete&&image.loading==='lazy')image.loading='eager';
      if(!images.every(playable))return result('rendering','Muse đang tạo hoặc tải ảnh');
      const percent=progress(s.responseRoot,false);
      if(percent!==null&&percent<100)return result('rendering','Muse đang tạo ảnh · '+percent+'%');
      const signature=images.map(source).join('|');
      if(signature!==s.imageSig){s.imageSig=signature;s.imageSince=Date.now();}
      if(Date.now()-s.imageSince<settleMs)return result('rendering','Ảnh đã hiện · chờ ổn định trước khi lưu');
      s.ready=true;s.fingerprint=signature;
      return result('ready','Ảnh của prompt đã sẵn sàng lưu');
    }
    if(!playable(s.video))return result('rendering','Muse đang tạo hoặc tải dữ liệu video');
    s.ready=true;s.fingerprint=source(s.video);
    return result('ready','Video của prompt đã sẵn sàng tải');
  };
  // Opening the clip's menu. Muse offers two routes: the "…" button beside the clip
  // (Download = 2nd row) and a right-click on the clip (Download = 4th row, after the
  // emoji row, Reply and Share). `soft` makes menu-specific problems return a note so
  // the caller can try the other route; binding problems (poll above) always throw.
  s.download=({phase='auto',soft=false}={})=>{
    if(imageMode)throw Error('Cảnh tạo ảnh lưu ảnh trực tiếp, không dùng menu tải video.');
    s.poll();if(!s.ready||!s.responseRoot?.isConnected)throw Error('Video gắn với prompt chưa sẵn sàng tải.');
    const menuFail=message=>{if(soft)return {action:'failed',clicked:false,needsMenu:false,failed:true,note:message};throw Error(message);};
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
    const box=e=>e.getBoundingClientRect();
    const MOUSE_IN=['pointerover','pointerenter','mouseover','mouseenter','pointermove','mousemove'];
    const fire=(el,type,init)=>{const C=type.startsWith('pointer')&&typeof PointerEvent==='function'?PointerEvent:MouseEvent;el.dispatchEvent(new C(type,{bubbles:true,cancelable:true,composed:true,view:window,...init}));};
    // A person's click is pointerdown, mousedown, pointerup, mouseup, click; some menus
    // (Radix, Fluent) open on pointerdown alone, so a bare element.click() is not enough.
    function press(el,button=0) {
      el.scrollIntoView?.({block:'nearest',inline:'nearest',behavior:'instant'});
      const r=box(el),x=Math.round(r.left+r.width/2),y=Math.round(r.top+r.height/2),hit=document.elementFromPoint(x,y),t=hit&&(el.contains(hit)||hit.contains(el))?hit:el;
      const base={clientX:x,clientY:y,screenX:x,screenY:y,button,pointerId:1,pointerType:'mouse',isPrimary:true,detail:1},held=button===2?2:1;
      for(const type of MOUSE_IN)fire(t,type,{...base,buttons:0});
      fire(t,'pointerdown',{...base,buttons:held});fire(t,'mousedown',{...base,buttons:held});
      if(button===2)fire(t,'contextmenu',{...base,buttons:2});
      fire(t,'pointerup',{...base,buttons:0});fire(t,'mouseup',{...base,buttons:0});
      if(button===0)el.click();
    }
    // Toolbars that appear on hover: send the hover events a pointer would.
    function hover() {
      let depth=0;
      for(let n=s.video;n&&n!==document.body&&depth<8;n=n.parentElement,depth++){
        if(n.contains(s.echoRoot)||n.querySelector('textarea,input,[contenteditable="true"]'))break;
        const r=box(n);if(!r.width||!r.height)continue;
        for(const type of MOUSE_IN)fire(n,type,{clientX:Math.round(r.left+r.width/2),clientY:Math.round(r.top+r.height/2),pointerId:1,pointerType:'mouse',isPrimary:true,buttons:0});
      }
    }
    const INTERACTIVE='button,a,[role="button"],[role="menuitem"],[tabindex]:not([tabindex="-1"]),[aria-haspopup]';
    const sizeOk=r=>r.width>=8&&r.height>=8&&r.width<=96&&r.height<=96;
    const DOT_TEXT=/^(?:\.{3}|…|⋯|···|•••|⋮|︙|more[_\s-]?(?:horiz|vert)(?:ontal|ical)?|ellipsis|more(?:\s.*)?|options?|menu|thêm|tùy\s*chọn|khác)$/i;
    const DOT_NAME=/(?:^|[^a-z])(?:more|ellipsis|kebab|meatball|overflow|dots?|three[-_ ]?dots?)(?:$|[^a-z])|morehoriz|morevert|more-horizontal|more-vertical/i;
    const nameOf=e=>[typeof e.className==='string'?e.className:e.className?.baseVal,e.getAttribute('data-icon'),e.getAttribute('data-lucide'),e.getAttribute('data-testid'),e.id].filter(Boolean).join(' ');
    // Three small shapes in a line, or one path made of three sub-shapes, is a "…" glyph.
    function dotGlyph(svg) {
      const sr=box(svg),span=Math.max(sr.width,sr.height);if(!span)return false;
      const parts=[...svg.querySelectorAll('circle,ellipse,rect,path,use')].map(n=>({n,r:box(n)})).filter(p=>p.r.width>0&&p.r.height>0);
      if(parts.length===3&&parts.every(p=>p.r.width<=span*0.45&&p.r.height<=span*0.45)){
        const cy=parts.map(p=>p.r.top+p.r.height/2),cx=parts.map(p=>p.r.left+p.r.width/2);
        const flat=a=>Math.max(...a)-Math.min(...a)<=1.5,spread=a=>Math.max(...a)-Math.min(...a)>=2;
        if((flat(cy)&&spread(cx))||(flat(cx)&&spread(cy)))return true;
      }
      if(parts.length===1&&parts[0].n.tagName.toLowerCase()==='path'&&((parts[0].n.getAttribute('d')||'').match(/[Mm]/g)||[]).length>=3){
        const r=parts[0].r;if(r.width>=r.height*2.2||r.height>=r.width*2.2)return true;
      }
      return false;
    }
    function clickable(e) {
      const n=e.closest(INTERACTIVE);if(n&&sizeOk(box(n)))return n;
      for(let p=e,d=0;p&&p!==s.responseRoot&&d<4;p=p.parentElement,d++)if(sizeOk(box(p))&&getComputedStyle(p).cursor==='pointer')return p;
      return e;
    }
    function moreButtons(scope) {
      const found=new Set();
      for(const e of scope.querySelectorAll('*')){
        if(!visible(e)||e.closest('video')||s.video.contains(e)||e.closest('svg')&&e.tagName.toLowerCase()!=='svg')continue;
        const r=box(e);if(!sizeOk(r))continue;
        const haspopup=e.getAttribute('aria-haspopup');
        const svgs=e.tagName.toLowerCase()==='svg'?[e]:[...e.querySelectorAll('svg')];
        if((haspopup&&haspopup!=='false')||DOT_TEXT.test(text(e))||DOT_NAME.test(nameOf(e))||(svgs.length===1&&dotGlyph(svgs[0])))found.add(clickable(e));
      }
      const list=[...found].filter(e=>!(e.closest('svg')&&e.tagName.toLowerCase()!=='svg'));
      return list.filter(e=>!list.some(o=>o!==e&&o.contains(e)));
    }
    // Rows of a popup as lines of text/icons (works for plain divs and for role="menuitem"
    // alike). A timestamp header such as "Hôm nay lúc 15:18" is not a row.
    const META=/^(?:hôm nay|hôm qua|today|yesterday)\b|\b\d{1,2}[:h.]\d{2}\b/i;
    function menuRows(popup) {
      // Explicit ARIA menu items are the rows, one each, however they are laid out.
      const aria=[...popup.querySelectorAll('[role="menuitem"]')].filter(visible);
      const ariaRows=aria.filter(e=>!aria.some(o=>o!==e&&o.contains(e)));
      if(ariaRows.length>=2)return ariaRows.map(e=>({cy:box(e).top,h:box(e).height,items:[e],text:norm(e.textContent)}));
      const leaves=[...popup.querySelectorAll('*')].filter(e=>visible(e)&&(!e.children.length||e.matches('button,a,[role="menuitem"],[role="button"]'))&&(norm(e.textContent)||e.matches('svg,img,canvas')||e.querySelector('svg,img,canvas')));
      const items=leaves.filter(e=>!leaves.some(o=>o!==e&&e.contains(o)&&!e.matches('button,a,[role="menuitem"],[role="button"]'))).map(e=>({e,r:box(e)})).filter(p=>p.r.width>0&&p.r.height>0).sort((a,b)=>(a.r.top+a.r.height/2)-(b.r.top+b.r.height/2)||a.r.left-b.r.left);
      const rows=[];
      for(const p of items){
        const cy=p.r.top+p.r.height/2,last=rows[rows.length-1];
        if(last&&Math.abs(cy-last.cy)<=Math.max(8,Math.min(p.r.height,last.h)*0.6)){last.items.push(p.e);last.text+=' '+norm(p.e.textContent);}
        else rows.push({cy,h:p.r.height,items:[p.e],text:norm(p.e.textContent)});
      }
      return rows.filter(row=>row.items.some(e=>e.closest('button,a,[role="menuitem"],[role="button"]'))||!(META.test(row.text.trim())&&row.text.length<48));
    }
    const popupLike='[role="menu"],[role="dialog"],[role="listbox"],[data-radix-popper-content-wrapper],[class*="popover" i],[class*="dropdown" i],[class*="context-menu" i],[class*="contextmenu" i]';
    function popupOf(target) {
      const named=target.closest(popupLike);
      if(named&&!named.contains(s.video)&&!named.contains(s.echoRoot))return named;
      let popup=null;
      for(let p=target.parentElement;p&&p!==document.body;p=p.parentElement){
        if(p.contains(s.video)||p.contains(s.echoRoot)||p.querySelector('textarea,input,video'))break;
        if(box(p).height>640)break;
        if(menuRows(p).length>=2)popup=p;
      }
      return popup;
    }
    function mediaHost() {
      for(let n=s.video;n&&n!==document.body;n=n.parentElement){
        const r=box(n);if(visible(n)&&r.width>=40&&r.height>=40)return n;
        if(n===s.responseRoot)break;
      }
      return null;
    }
    function closeMenus() {
      s.menuPending=false;s.menuBaseline=null;s.menuOpener=null;s.menuKind='';
      for(const t of [document.activeElement||document.body,document])for(const type of ['keydown','keyup'])t.dispatchEvent(new KeyboardEvent(type,{key:'Escape',code:'Escape',keyCode:27,which:27,bubbles:true,cancelable:true}));
    }
    if(phase==='reset'){closeMenus();return {action:'reset',clicked:false,needsMenu:false};}
    if(phase==='inspect'){
      const near=[];
      for(let scope=s.responseRoot,depth=0;scope&&scope!==document.body&&depth<3;scope=scope.parentElement,depth++){
        if(scope!==s.responseRoot&&(scope.contains(s.echoRoot)||scope.querySelector('textarea,input,[contenteditable="true"],nav,aside')))break;
        for(const e of scope.querySelectorAll('button,a,[role],[tabindex],svg,i')){
          if(!visible(e)||!sizeOk(box(e)))continue;
          const label=`${e.tagName.toLowerCase()}${nameOf(e)?'.'+nameOf(e).replace(/\s+/g,'.').slice(0,28):''}${text(e).length<=14&&text(e)?'['+text(e)+']':''}`;
          if(!near.includes(label))near.push(label);
        }
        if(near.length)break;
      }
      return {action:'inspect',clicked:false,needsMenu:false,near:near.slice(0,10)};
    }
    if(phase==='context'||phase==='point') {
      const host=mediaHost();if(!host)return menuFail('Chưa thấy vùng video để bấm chuột phải.');
      host.scrollIntoView?.({block:'center',inline:'center',behavior:'instant'});
      s.menuBaseline=new Set(controls());s.menuKind='context';s.menuOpener=null;s.menuPending=true;
      if(phase==='point'){const r=box(host);return {action:'point',clicked:false,needsMenu:true,point:{x:Math.round(r.left+r.width/2),y:Math.round(r.top+r.height/2)}};}
      press(host,2);return {action:'waiting-menu',clicked:false,needsMenu:true,kind:'context'};
    }
    if(phase==='menu'||s.menuPending) {
      if(!s.menuPending||!s.menuBaseline)return menuFail('Chưa mở menu của video này.');
      const menu=controls().filter(e=>isDownload(e)&&!s.menuBaseline.has(e));
      if(menu.length>1)return menuFail('Có nhiều lệnh tải mới xuất hiện. Không thể chọn an toàn.');
      if(!menu.length)return {action:'waiting-menu',clicked:false,needsMenu:true};
      // Require the menu opened by this clip, including portals/reused popups.
      // Never use a direct download link or guess the row globally.
      const target=menu[0],controlled=s.menuOpener?.getAttribute('aria-controls'),context=s.menuKind==='context';
      if(controlled&&!controlled.split(/\s+/).some(id=>document.getElementById(id)?.contains(target)))return menuFail('Lệnh tải không thuộc menu của clip này.');
      const popup=popupOf(target);
      if(!popup)return menuFail(context?'Chưa xác định được menu chuột phải của clip.':'Chưa xác định được dòng thứ hai trong menu của clip.');
      const rows=menuRows(popup),index=rows.findIndex(row=>row.items.some(e=>e===target||e.contains(target)||target.contains(e)));
      // "…" menu: Download is the 2nd row. Right-click menu: 4th row (after emoji row,
      // Reply, Share), or the last row when Muse drops one of them.
      const right=context?(index===3||(index>=2&&index===rows.length-1)):index===1;
      if(!right)return menuFail(context?'Dòng thứ tư của menu chuột phải chưa phải Tải xuống. Chưa bấm để tránh tải nhầm.':'Dòng thứ hai của menu chưa phải Tải xuống. Chưa bấm để tránh tải nhầm.');
      if(target.disabled||target.getAttribute('aria-disabled')==='true')return {action:'waiting-menu',clicked:false,needsMenu:true};
      press(target);s.menuPending=false;return {action:'clicked',clicked:true,needsMenu:false};
    }
    hover();
    let more=[];
    for(let scope=s.responseRoot,depth=0;scope&&scope!==document.body&&depth<4;scope=scope.parentElement,depth++){
      if(scope!==s.responseRoot&&(scope.contains(s.echoRoot)||scope.querySelector('textarea,input,[contenteditable="true"],nav,aside')))break;
      const media=mediaNodes(scope);if(media.length!==1||media[0]!==s.video)break;
      more=moreButtons(scope);
      if(more.length)break;
    }
    if(more.length>1){
      const tops=[...new Set(more.map(e=>Math.round(box(e).top/12)))];
      if(tops.length>1)return menuFail('Có nhiều menu trong phản hồi. Không thể xác định menu tải video.');
      more=[more.sort((a,b)=>box(a).left-box(b).left).pop()];
    }
    if(more.length===1){s.menuBaseline=new Set(controls());s.menuOpener=more[0];s.menuKind='more';s.menuPending=true;press(more[0]);return {action:'waiting-menu',clicked:false,needsMenu:true,kind:'more'};}
    return menuFail('Chưa thấy menu … của đúng clip. Chưa tải video.');
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
function downloadAction({id,phase='auto',soft=false}) {
  const state=globalThis[Symbol.for('MuseVideoStudio.promptTrackers.v1')]?.get(id);
  if(!state)throw Error('Không có video đã gắn với tác vụ này.');
  return state.download({phase,soft});
}
// Reads the bytes of one picture that poll() bound to this prompt. The binding is
// checked again first, so a picture that changed meanwhile is never saved.
async function readTrackedImage({id,index=0,maxBytes=62914560}) {
  const s=globalThis[Symbol.for('MuseVideoStudio.promptTrackers.v1')]?.get(id);
  if(!s||s.mediaKind!=='image')throw Error('Không có ảnh đã gắn với tác vụ này.');
  const now=s.poll();
  if(!now.ready)return {changed:true,count:0,message:now.stage};
  const count=s.images.length,img=s.images[index];
  if(!img||!img.isConnected)return {changed:true,count};
  const shown=img.currentSrc||img.src||'';
  const link=img.closest('a[href]')?.href||'';
  const full=/^(https:|blob:)/i.test(link)&&/\.(png|jpe?g|webp|gif)(?:$|[?#])/i.test(link)?link:'';
  const errors=[];
  const asData=blob=>new Promise((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(reader.result);reader.onerror=()=>reject(reader.error||Error('Không đọc được ảnh'));reader.readAsDataURL(blob);});
  for(const url of [...new Set([full,shown].filter(Boolean))]) {
    try{
      if(/^data:image\//i.test(url))return {count,url:url.slice(0,80),dataUrl:url,via:'data',width:img.naturalWidth,height:img.naturalHeight};
      const response=await fetch(url,{credentials:'include'});
      if(!response.ok)throw Error('HTTP '+response.status);
      const blob=await response.blob();
      if(blob.size>maxBytes)throw Error('Ảnh lớn hơn giới hạn');
      return {count,url,dataUrl:await asData(blob),via:'fetch',width:img.naturalWidth,height:img.naturalHeight};
    }catch(e){errors.push(String(e?.message||e).slice(0,120));}
  }
  try{
    const canvas=document.createElement('canvas');canvas.width=img.naturalWidth;canvas.height=img.naturalHeight;
    canvas.getContext('2d').drawImage(img,0,0);
    return {count,url:shown,dataUrl:canvas.toDataURL('image/png'),via:'canvas',width:img.naturalWidth,height:img.naturalHeight};
  }catch(e){errors.push('canvas: '+String(e?.message||e).slice(0,80));}
  return {count,url:full||shown,failed:true,errors};
}
function endTracking({id}) {
  const map=globalThis[Symbol.for('MuseVideoStudio.promptTrackers.v1')],state=map?.get(id);
  state?.observer?.disconnect();state?.downloadController?.abort();const stops=globalThis[Symbol.for('MuseVideoStudio.stopRequests.v1')];if(stops)for(const key of stops)if(key.startsWith(id+':'))stops.delete(key);return map?.delete(id)||false;
}
function pollBrowserProbe({id}){const s=globalThis[Symbol.for('MuseVideoStudio.promptTrackers.v1')]?.get(id);if(!s)throw Error('Test không còn gắn với tab này.');return s.probe();}
module.exports={pollBrowserProbe,beginTracking,pollTracking,downloadAction,endTracking,readTrackedImage};
