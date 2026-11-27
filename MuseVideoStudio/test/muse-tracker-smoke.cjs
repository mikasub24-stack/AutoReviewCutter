// Real browser / real decoded media fixture. Does not contact Muse or submit jobs.
const { chromium } = require('playwright-core');
const { beginTracking, pollTracking, pollBrowserProbe, downloadAction, answerChoice, endTracking } = require('../src/muse-tracker.cjs');
const { execFile } = require('node:child_process');
const { promisify } = require('node:util');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const assert = require('node:assert/strict');
(async()=>{
  const dir=await fs.mkdtemp(path.join(os.tmpdir(),'muse-tracker-fixture-'));
  let browser;
  try {
    const media=path.join(dir,'clip.webm');
    if(process.env.MUSE_TRACKER_VIDEO_FIXTURE)await fs.copyFile(process.env.MUSE_TRACKER_VIDEO_FIXTURE,media);
    else await promisify(execFile)('ffmpeg',['-v','error','-f','lavfi','-i','color=c=blue:s=160x90:r=15:d=0.6','-c:v','libvpx','-threads','1','-an',media]);
    const bytes=await fs.readFile(media);
    browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH||'/usr/bin/chromium',headless:true,args:['--no-sandbox']});
    const context=await browser.newContext();
    const html='<!doctype html><html><body><div id="thread" data-chat-thread></div><aside id="unrelated"></aside><textarea id="composer"></textarea></body></html>';
    await context.route('**/*',route=>route.fulfill(route.request().url().endsWith('.webm')?{status:200,contentType:'video/webm',body:bytes}:{status:200,contentType:'text/html',body:html}));
    const page=await context.newPage();await page.goto('https://muse.ai/');
    async function reset(){await page.evaluate(()=>{const m=globalThis[Symbol.for('MuseVideoStudio.promptTrackers.v1')];if(m){for(const s of m.values())s.observer?.disconnect();m.clear();}});await page.setContent(html);}
    async function append({id,role='assistant',text='',src='',ref='',parent='thread'}) {
      await page.evaluate(args=>{
        const root=document.createElement('article');root.id=args.id;root.dataset.messageRole=args.role;
        if(args.ref)root.setAttribute('data-response-to',args.ref);
        const p=document.createElement('p');p.textContent=args.text;root.append(p);
        if(args.src){const v=document.createElement('video');v.preload='auto';v.src=args.src;v.width=160;v.height=90;root.append(v);}
        document.getElementById(args.parent).append(root);
      },{id,role,text,src,ref,parent});
    }
    async function ready(id){await page.waitForFunction(id=>{const v=document.querySelector(`#${id} video`);return v&&v.readyState>=2&&v.videoWidth>0&&v.duration>0;},id);}
    // Test must observe a NEW echo and NEW reply in the same thread.
    await append({id:'prior-test',role:'user',text:'Bắt đầu công việc mới nhé'});
    await append({id:'prior-reply',text:'Old ready reply'});
    await page.evaluate(beginTracking,{id:'probe',prompt:'Bắt đầu công việc mới nhé'});
    assert.equal((await page.evaluate(pollBrowserProbe,{id:'probe'})).echoSeen,false);
    await append({id:'probe-echo',role:'user',text:'Bắt đầu công việc mới nhé'});
    assert.equal((await page.evaluate(pollBrowserProbe,{id:'probe'})).replySeen,false);
    await append({id:'sidebar-reply',text:'Unrelated new sidebar reply',parent:'unrelated'});
    assert.equal((await page.evaluate(pollBrowserProbe,{id:'probe'})).replySeen,false);
    await append({id:'probe-reply',text:'Sẵn sàng, bạn muốn làm gì?'});
    assert.equal((await page.evaluate(pollBrowserProbe,{id:'probe'})).replySeen,true);
    await reset();
    // Existing videos, the composer itself, and unrelated global media cannot
    // satisfy a pending prompt. The delayed matching response may complete it.
    await append({id:'old',text:'Older result',src:'/old.webm'});await ready('old');
    await page.locator('#composer').fill('Exact target prompt');
    await page.evaluate(beginTracking,{id:'one',prompt:'Exact target prompt'});
    assert.equal((await page.evaluate(pollTracking,{id:'one'})).phase,'waiting-prompt');
    await append({id:'user-one',role:'user',text:'Exact   target\n prompt'});
    await append({id:'global-result',text:'Unrelated video',src:'/global.webm',parent:'unrelated'});await ready('global-result');
    assert.equal((await page.evaluate(pollTracking,{id:'one'})).ready,false);
    await append({id:'result-one',text:'Creating',ref:'user-one'});
    await page.evaluate(()=>{const p=document.createElement('div');p.setAttribute('role','progressbar');p.setAttribute('aria-valuenow','37');p.setAttribute('aria-valuemax','100');p.style.height='10px';p.textContent='Processing';document.getElementById('result-one').append(p);});
    let state=await page.evaluate(pollTracking,{id:'one'});assert.equal(state.ready,false);assert.equal(state.progress,37);
    await new Promise(resolve=>setTimeout(resolve,60));
    await page.evaluate(()=>{const v=document.createElement('video');v.preload='auto';v.src='/matching.webm';v.width=160;v.height=90;document.getElementById('result-one').append(v);});await ready('result-one');
    state=await page.evaluate(pollTracking,{id:'one'});assert.equal(state.ready,true);assert.equal(state.url,'https://muse.ai/matching.webm');assert.equal(state.progress,37);
    await assert.rejects(page.evaluate(downloadAction,{id:'one'}),/menu …/);
    assert.equal(await page.evaluate(endTracking,{id:'one'}),true);
    // A response for another user prompt and a response appearing before the
    // submitted echo must not be bound to this job.
    await reset();await page.evaluate(beginTracking,{id:'two',prompt:'Target two'});
    await append({id:'u-two',role:'user',text:'Target two'});await append({id:'u-other',role:'user',text:'Other prompt'});await append({id:'wrong-result',src:'/wrong.webm',ref:'u-other'});await ready('wrong-result');
    assert.equal((await page.evaluate(pollTracking,{id:'two'})).ready,false);
    await reset();await page.evaluate(beginTracking,{id:'order',prompt:'Target order'});
    await append({id:'before-echo',src:'/before.webm'});await append({id:'u-order',role:'user',text:'Target order'});await ready('before-echo');assert.equal((await page.evaluate(pollTracking,{id:'order'})).ready,false);
    // Old media reinserted as a new DOM node is still excluded by its source.
    await reset();await append({id:'virtual-old',src:'/same-old.webm'});await ready('virtual-old');await page.evaluate(beginTracking,{id:'virtual',prompt:'Virtual target'});
    await page.evaluate(()=>document.getElementById('virtual-old').remove());await append({id:'u-virtual',role:'user',text:'Virtual target'});await append({id:'virtual-new',src:'/same-old.webm',ref:'u-virtual'});await ready('virtual-new');assert.equal((await page.evaluate(pollTracking,{id:'virtual'})).ready,false);
    // Ambiguous echoes and multiple videos fail closed.
    await reset();await page.evaluate(beginTracking,{id:'ambiguous',prompt:'Repeated exact prompt'});await append({id:'dupe-one',role:'user',text:'Repeated exact prompt'});await append({id:'dupe-two',role:'user',text:'Repeated exact prompt'});
    await assert.rejects(page.evaluate(pollTracking,{id:'ambiguous'}),/nhiều tin nhắn/);
    await reset();await page.evaluate(beginTracking,{id:'multi',prompt:'Multiple video target'});await append({id:'u-multi',role:'user',text:'Multiple video target'});await append({id:'multi-one',src:'/one.webm'});await append({id:'multi-two',src:'/two.webm'});await ready('multi-one');await ready('multi-two');await assert.rejects(page.evaluate(pollTracking,{id:'multi'}),/nhiều video/);
    // A menu download is selected only after clicking the bound result menu;
    // pre-existing Download controls outside it cannot be used accidentally.
    await reset();await page.evaluate(beginTracking,{id:'menu',prompt:'Menu target',messageSelector:'article'});await append({id:'u-menu',role:'user',text:'Menu target'});await append({id:'menu-result',src:'/menu.webm',ref:'u-menu'});await ready('menu-result');
    await page.evaluate(()=>{
      const old=document.createElement('button');old.setAttribute('role','menuitem');old.textContent='Tải xuống';old.onclick=()=>globalThis.__wrongDownload=true;document.body.append(old);
      const more=document.createElement('button');more.textContent='…';more.setAttribute('aria-haspopup','menu');more.onclick=()=>{const menu=document.createElement('div');menu.setAttribute('role','menu');const b=document.createElement('button');b.setAttribute('role','menuitem');b.textContent='Tải xuống';b.onclick=()=>globalThis.__matchedDownload=true;const share=document.createElement('button');share.setAttribute('role','menuitem');share.textContent='Chia sẻ';menu.append(share,b);document.body.append(menu);};document.getElementById('menu-result').append(more);
    });
    const first=await page.evaluate(downloadAction,{id:'menu',phase:'auto'});assert.equal(first.needsMenu,true);assert.equal(first.clicked,false);
    const second=await page.evaluate(downloadAction,{id:'menu',phase:'menu'});assert.equal(second.clicked,true);assert.equal(await page.evaluate(()=>globalThis.__matchedDownload),true);assert.equal(await page.evaluate(()=>Boolean(globalThis.__wrongDownload)),false);
    // Refuse a reordered popup even if its first row says Download. A direct
    // download control in the response must never bypass the clip menu.
    await reset();await page.evaluate(beginTracking,{id:'wrong-row',prompt:'Wrong menu row'});await append({id:'wrong-row-user',role:'user',text:'Wrong menu row'});await append({id:'wrong-row-result',src:'/wrong-row.webm',ref:'wrong-row-user'});await ready('wrong-row-result');
    await page.evaluate(()=>{
      window.wrongRowClicked=false;const root=document.getElementById('wrong-row-result');
      const direct=document.createElement('button');direct.textContent='Download';direct.onclick=()=>window.wrongRowClicked=true;root.append(direct);
      const more=document.createElement('button');more.textContent='…';more.onclick=()=>{const popup=document.createElement('div');popup.setAttribute('role','menu');popup.innerHTML='<button role="menuitem">Tải xuống</button><button role="menuitem">Chia sẻ</button>';popup.firstElementChild.onclick=()=>window.wrongRowClicked=true;document.body.append(popup);};root.append(more);
    });
    assert.equal((await page.evaluate(downloadAction,{id:'wrong-row'})).needsMenu,true);
    await assert.rejects(page.evaluate(downloadAction,{id:'wrong-row',phase:'menu'}),/Dòng thứ hai/);
    assert.equal(await page.evaluate(()=>window.wrongRowClicked),false);
    // Recovery can bind an existing exact unique echo, but does not guess among
    // repeated historical prompts.
    await reset();await append({id:'u-recover',role:'user',text:'Recover exact prompt'});await append({id:'recover-result',src:'/recover.webm',ref:'u-recover'});await ready('recover-result');
    await page.evaluate(beginTracking,{id:'recover',prompt:'Recover exact prompt',recover:true,messageSelector:'article'});assert.equal((await page.evaluate(pollTracking,{id:'recover'})).ready,true);
    await append({id:'u-recover-dupe',role:'user',text:'Recover exact prompt'});assert.equal((await page.evaluate(pollTracking,{id:'recover'})).url,'https://muse.ai/recover.webm');
    const retainedRecovery=await page.evaluate(beginTracking,{id:'recover',prompt:'Recover exact prompt',recover:true,messageSelector:'article'});assert.equal(retainedRecovery.retained,true);assert.equal((await page.evaluate(pollTracking,{id:'recover'})).url,'https://muse.ai/recover.webm');
    await page.evaluate(beginTracking,{id:'ambiguous-history',prompt:'Recover exact prompt',recover:true,messageSelector:'article'});await assert.rejects(page.evaluate(pollTracking,{id:'ambiguous-history'}),/nhiều tin nhắn/);
    // A single fragment may add the user echo and assistant response in one
    // mutation record; DOM order still binds the unique response correctly.
    await reset();await page.evaluate(beginTracking,{id:'fragment',prompt:'One fragment target'});
    await page.evaluate(()=>{const f=document.createDocumentFragment(),u=document.createElement('article'),a=document.createElement('article');u.id='u-fragment';u.dataset.messageRole='user';u.textContent='One fragment target';a.id='fragment-result';a.dataset.messageRole='assistant';const v=document.createElement('video');v.preload='auto';v.src='/fragment.webm';a.append(v);f.append(u,a);document.getElementById('thread').append(f);});await ready('fragment-result');assert.equal((await page.evaluate(pollTracking,{id:'fragment'})).ready,true);
    // Generic nested bubble/action rows (no roles or thread marker) can use the
    // nearest repeated row, while unrelated whole-page media remains excluded.
    await reset();await page.evaluate(()=>{document.getElementById('thread').removeAttribute('data-chat-thread');});await page.evaluate(beginTracking,{id:'generic',prompt:'Generic exact prompt'});
    await page.evaluate(()=>{const row=document.createElement('div');row.className='row';row.id='generic-user';row.innerHTML='<div><p>Generic exact prompt</p></div><div><button>copy</button></div>';document.getElementById('thread').append(row);});
    await page.evaluate(()=>{const row=document.createElement('div');row.className='row';row.id='generic-result';row.innerHTML='<div><video preload="auto" src="/generic.webm"></video></div><div><button>…</button></div>';document.getElementById('thread').append(row);});await ready('generic-result');assert.equal((await page.evaluate(pollTracking,{id:'generic'})).ready,true);
    // Muse can answer with several rows (a sentence, the clip, then a note). The
    // clip still binds to its own prompt; a second clip stays ambiguous.
    const mkRow=(id,html)=>page.evaluate(a=>{const r=document.createElement('div');r.className='row';r.id=a.id;r.innerHTML=a.html;document.getElementById('thread').append(r);},{id,html});
    await reset();await page.evaluate(()=>document.getElementById('thread').removeAttribute('data-chat-thread'));await page.evaluate(beginTracking,{id:'multi-row',prompt:'Multi row prompt'});
    await mkRow('mr-user','<div><p>Multi row prompt</p></div><div><button>copy</button></div>');await mkRow('mr-text','<div><p>Here is the clip you asked for</p></div>');
    let multi=await page.evaluate(pollTracking,{id:'multi-row'});assert.equal(multi.ready,false);assert.equal(multi.responseMatched,false);assert.equal(multi.hint,'chưa thấy video mới trong chat');
    await mkRow('mr-clip','<div><video preload="auto" src="/multi-row.webm"></video></div><div><button>…</button></div>');await mkRow('mr-note','<div><p>Check the length please</p></div>');await ready('mr-clip');
    multi=await page.evaluate(pollTracking,{id:'multi-row'});assert.equal(multi.ready,true);assert.equal(multi.responseMatched,true);assert.equal(multi.url,'https://muse.ai/multi-row.webm');
    await mkRow('mr-clip-2','<div><video preload="auto" src="/multi-row-2.webm"></video></div>');await assert.rejects(page.evaluate(pollTracking,{id:'multi-row'}),/nhiều video/);
    // The reply row can exist before the user's text is finished rendering; the
    // clip still belongs to the prompt that was sent.
    await reset();await page.evaluate(()=>document.getElementById('thread').removeAttribute('data-chat-thread'));await page.evaluate(beginTracking,{id:'late-text',prompt:'Late text prompt'});
    await page.evaluate(()=>{const t=document.getElementById('thread');const u=document.createElement('div');u.className='row';u.id='lt-user';u.innerHTML='<div><p></p></div><div><button>copy</button></div>';const r=document.createElement('div');r.className='row';r.id='lt-clip';r.innerHTML='<div><video preload="auto" src="/late-text.webm"></video></div><div><button>…</button></div>';t.append(u,r);});await ready('lt-clip');
    assert.equal((await page.evaluate(pollTracking,{id:'late-text'})).phase,'waiting-prompt');
    await page.evaluate(()=>{document.querySelector('#lt-user p').textContent='Late text prompt';});
    const lateText=await page.evaluate(pollTracking,{id:'late-text'});assert.equal(lateText.ready,true);assert.equal(lateText.responseMatched,true);
    // Unrecognised, deeply nested chat markup: the new clip after the echo inside the
    // same chat area still binds; a clip outside the chat area or an old one does not,
    // and two new clips fail closed.
    await reset();await page.evaluate(()=>document.getElementById('thread').removeAttribute('data-chat-thread'));
    await page.evaluate(()=>{const t=document.getElementById('thread');const old=document.createElement('div');old.id='deep-old';old.innerHTML='<div><video preload="auto" src="/deep-old.webm"></video></div>';t.append(old);});
    await page.evaluate(beginTracking,{id:'deep',prompt:'Deep nested prompt'});
    await page.evaluate(()=>{const t=document.getElementById('thread');const text=document.createElement('p');text.textContent='Deep nested prompt';const reaction=document.createElement('span');reaction.textContent='👍';let node=document.createElement('div');node.append(text,reaction);for(let i=0;i<8;i++){const w=document.createElement('div');w.append(node);node=w;}node.id='deep-user';t.append(node);const other=document.createElement('video');other.preload='auto';other.src='/deep-outside.webm';document.getElementById('unrelated').append(other);});
    let deep=await page.evaluate(pollTracking,{id:'deep'});assert.equal(deep.ready,false);assert.equal(deep.responseMatched,false);assert.equal(deep.hint,'thấy 1 video mới nhưng chưa gắn được vào đúng prompt');
    await page.evaluate(()=>{const r=document.createElement('div');r.id='deep-clip';r.innerHTML='<div><video preload="auto" src="/deep-clip.webm"></video></div>';document.getElementById('thread').append(r);});await ready('deep-clip');
    deep=await page.evaluate(pollTracking,{id:'deep'});assert.equal(deep.ready,true);assert.equal(deep.responseMatched,true);assert.equal(deep.url,'https://muse.ai/deep-clip.webm');
    await page.evaluate(()=>{const r=document.createElement('div');r.id='deep-clip-2';r.innerHTML='<div><video preload="auto" src="/deep-clip-2.webm"></video></div>';document.getElementById('thread').append(r);});await assert.rejects(page.evaluate(pollTracking,{id:'deep'}),/nhiều video/);
    // Recovery after a restart reads the same multi-row reply, but never past
    // another queued prompt's row.
    await reset();await page.evaluate(()=>document.getElementById('thread').removeAttribute('data-chat-thread'));
    await mkRow('rr-user','<div><p>Recover multi prompt</p></div><div><button>copy</button></div>');await mkRow('rr-text','<div><p>Here you go</p></div>');await mkRow('rr-clip','<div><video preload="auto" src="/recover-multi.webm"></video></div>');
    await mkRow('rr-next','<div><p>Next queued prompt text</p></div><div><button>copy</button></div>');await mkRow('rr-next-clip','<div><video preload="auto" src="/recover-next.webm"></video></div>');await ready('rr-clip');await ready('rr-next-clip');
    await page.evaluate(beginTracking,{id:'rr',prompt:'Recover multi prompt',recover:true,otherPrompts:['Next queued prompt text','Bắt đầu công việc mới nhé']});
    const recovered=await page.evaluate(pollTracking,{id:'rr'});assert.equal(recovered.ready,true);assert.equal(recovered.url,'https://muse.ai/recover-multi.webm');
    await page.evaluate(()=>{const m=globalThis[Symbol.for('MuseVideoStudio.promptTrackers.v1')];for(const s of m.values())s.observer?.disconnect();m.clear();});
    await page.evaluate(beginTracking,{id:'rr-blind',prompt:'Recover multi prompt',recover:true});await assert.rejects(page.evaluate(pollTracking,{id:'rr-blind'}),/nhiều video/);
    await reset();await page.evaluate(beginTracking,{id:'response-selector',prompt:'Response selector target',messageSelector:'.answer'});await append({id:'u-selector',role:'user',text:'Response selector target'});await append({id:'selector-result',src:'/selector.webm',ref:'u-selector'});await page.evaluate(()=>document.getElementById('selector-result').classList.add('answer'));await ready('selector-result');assert.equal((await page.evaluate(pollTracking,{id:'response-selector'})).ready,true);
    // Custom role-less popup reuses hidden DOM and exposes a fresh exact-label
    // span only after the result's own More control. Old visible labels remain.
    await reset();await page.evaluate(beginTracking,{id:'custom-menu',prompt:'Custom menu target'});await append({id:'u-custom-menu',role:'user',text:'Custom menu target'});await append({id:'custom-menu-result',src:'/custom-menu.webm',ref:'u-custom-menu'});await ready('custom-menu-result');
    await page.evaluate(()=>{globalThis.__customRight=false;globalThis.__customWrong=false;const old=document.createElement('div');old.innerHTML='<span>Tải xuống</span>';old.onclick=()=>globalThis.__customWrong=true;document.body.append(old);const popup=document.createElement('div');popup.id='reused-popup';popup.style.display='none';popup.innerHTML='<div><svg width=12 height=12><circle r=4 cx=6 cy=6 /></svg><span>Chia sẻ</span></div><div><svg width=12 height=12><circle r=4 cx=6 cy=6 /></svg><span>Tải xuống</span></div>';popup.lastElementChild.onclick=()=>globalThis.__customRight=true;document.body.append(popup);const more=document.createElement('button');more.textContent='…';more.onclick=()=>popup.style.display='block';document.getElementById('custom-menu-result').append(more);});
    const opened=await page.evaluate(downloadAction,{id:'custom-menu',phase:'auto'});assert.equal(opened.needsMenu,true);const clicked=await page.evaluate(downloadAction,{id:'custom-menu',phase:'menu'});assert.equal(clicked.clicked,true);assert.equal(await page.evaluate(()=>globalThis.__customRight),true);assert.equal(await page.evaluate(()=>globalThis.__customWrong),false);
    // An unknown-author response row can report real DOM progress before a
    // video element exists; no elapsed-time percentage is fabricated.
    await reset();await page.evaluate(()=>document.getElementById('thread').removeAttribute('data-chat-thread'));await page.evaluate(beginTracking,{id:'generic-progress',prompt:'Generic progress target'});
    await page.evaluate(()=>{const u=document.createElement('div');u.innerHTML='<div><p>Generic progress target</p></div><div><button>Copy</button></div>';const r=document.createElement('div');r.innerHTML='<div><div role="progressbar" aria-valuenow="42" aria-valuemax="100">Rendering</div></div><div><button>…</button></div>';document.getElementById('thread').append(u,r);});
    const genericProgress=await page.evaluate(pollTracking,{id:'generic-progress'});assert.equal(genericProgress.ready,false);assert.equal(genericProgress.progress,42);assert.equal(genericProgress.phase,'rendering');
    // Rendered block breaks match original whitespace; metadata-only player
    // need not decode a frame before its download can be taken.
    await reset();await page.evaluate(beginTracking,{id:'blocks',prompt:'First paragraph. Second paragraph.'});
    await page.evaluate(()=>{const u=document.createElement('article');u.dataset.messageRole='user';u.id='u-blocks';u.innerHTML='<p>First paragraph.</p><p>Second paragraph.</p>';document.getElementById('thread').append(u);});
    await append({id:'metadata-only',src:'/metadata.webm',ref:'u-blocks'});await ready('metadata-only');
    await page.evaluate(()=>Object.defineProperty(document.querySelector('#metadata-only video'),'readyState',{get:()=>1}));
    assert.equal((await page.evaluate(pollTracking,{id:'blocks'})).ready,true);
    // Explicit video attachment link with image thumbnail, no HTML video tag.
    await reset();await page.evaluate(beginTracking,{id:'attachment',prompt:'Attachment target'});await append({id:'u-attachment',role:'user',text:'Attachment target'});
    await page.evaluate(()=>{const r=document.createElement('article');r.dataset.messageRole='assistant';r.innerHTML='<a href="/clip.mp4?signature=secret" download="clip.mp4"><img alt="Preview"></a>';document.getElementById('thread').append(r);});
    const attachment=await page.evaluate(pollTracking,{id:'attachment'});assert.equal(attachment.ready,true);assert.match(attachment.url,/clip\.mp4/);await assert.rejects(page.evaluate(downloadAction,{id:'attachment'}),/menu …/);
    // Repeated text in history must not hijack a resumed attempt.
    await reset();await append({id:'u-old-repeat',role:'user',text:'Repeated resume target'});await append({id:'r-old-repeat',src:'/old-repeat.webm',ref:'u-old-repeat'});await ready('r-old-repeat');
    await page.evaluate(beginTracking,{id:'new-attempt',prompt:'Repeated resume target'});await append({id:'u-new-repeat',role:'user',text:'Repeated resume target'});await append({id:'r-new-repeat',src:'/new-repeat.webm',ref:'u-new-repeat'});await ready('r-new-repeat');
    const anchor=await page.evaluate(pollTracking,{id:'new-attempt'});assert.equal(anchor.echoKey,'u-new-repeat');
    await page.evaluate(beginTracking,{id:'new-attempt',prompt:'Repeated resume target',recover:true,echoKey:anchor.echoKey,echoMarker:anchor.echoMarker});
    assert.equal((await page.evaluate(pollTracking,{id:'new-attempt'})).url,'https://muse.ai/new-repeat.webm');
    // Muse resends the clip it already made for the same prompt (same address, new reply under the new copy of the prompt): that is the result.
    await reset();await append({id:'u-resend-old',role:'user',text:'Resent shot'});await append({id:'r-resend-old',src:'/resent.webm',ref:'u-resend-old'});await ready('r-resend-old');
    await page.evaluate(beginTracking,{id:'resend',prompt:'Resent shot'});await append({id:'u-resend-new',role:'user',text:'Resent shot'});
    assert.equal((await page.evaluate(pollTracking,{id:'resend'})).ready,false,'the old clip alone is not a result');
    await append({id:'r-resend-new',src:'/resent.webm',ref:'u-resend-new'});await ready('r-resend-new');
    const resent=await page.evaluate(pollTracking,{id:'resend'});assert.equal(resent.ready,true);assert.equal(resent.url,'https://muse.ai/resent.webm');
    // ...but a clip that sits ABOVE the new copy of the prompt (old rows rebuilt as new nodes) is still never accepted.
    await reset();await append({id:'u-rebuilt-old',role:'user',text:'Rebuilt shot'});await append({id:'r-rebuilt-old',src:'/rebuilt.webm',ref:'u-rebuilt-old'});await ready('r-rebuilt-old');
    await page.evaluate(beginTracking,{id:'rebuilt',prompt:'Rebuilt shot'});await append({id:'u-rebuilt-new',role:'user',text:'Rebuilt shot'});
    await page.evaluate(()=>{const old=document.getElementById('r-rebuilt-old'),fresh=old.cloneNode(true);old.remove();document.getElementById('u-rebuilt-new').before(fresh);});
    assert.equal((await page.evaluate(pollTracking,{id:'rebuilt'})).ready,false,'a rebuilt old row above the new copy is not a result');
    // A React remount of the same message must rebind its stable ID, not fail
    // before the delayed video arrives.
    await reset();await page.evaluate(beginTracking,{id:'remount',prompt:'Remounted original scene'});await append({id:'u-remount',role:'user',text:'Remounted original scene'});
    assert.equal((await page.evaluate(pollTracking,{id:'remount'})).ready,false);
    await page.evaluate(()=>{const old=document.getElementById('u-remount'),fresh=old.cloneNode(true);fresh.removeAttribute('data-muse-studio-attempt');old.replaceWith(fresh);});
    assert.equal((await page.evaluate(pollTracking,{id:'remount'})).ready,false);
    await append({id:'r-remount',src:'/remounted.webm',ref:'u-remount'});await ready('r-remount');assert.equal((await page.evaluate(pollTracking,{id:'remount'})).ready,true);
    // Muse can replace transient DOM IDs while retaining the same chat. A
    // unique exact prompt in that same connected chat must regain its anchor.
    await reset();await page.evaluate(beginTracking,{id:'dynamic-id',prompt:'Dynamic ID scene'});await append({id:'temporary-user-id',role:'user',text:'Dynamic ID scene'});await page.evaluate(pollTracking,{id:'dynamic-id'});
    await page.evaluate(()=>{const old=document.getElementById('temporary-user-id'),fresh=old.cloneNode(true);fresh.id='new-temporary-user-id';fresh.removeAttribute('data-muse-studio-attempt');old.replaceWith(fresh);});
    assert.equal((await page.evaluate(pollTracking,{id:'dynamic-id'})).echoKey,'new-temporary-user-id');
    await append({id:'dynamic-result',src:'/dynamic-id.webm',ref:'temporary-user-id'});await ready('dynamic-result');assert.equal((await page.evaluate(pollTracking,{id:'dynamic-id'})).ready,true);
    // A poster-only video (preload=none) is a downloadable result even before
    // the player loads metadata. The saved bytes are validated by the host.
    await reset();await page.evaluate(beginTracking,{id:'poster-only',prompt:'Poster-only result'});await append({id:'u-poster',role:'user',text:'Poster-only result'});
    await page.evaluate(()=>{const a=document.createElement('article');a.dataset.messageRole='assistant';a.setAttribute('data-response-to','u-poster');a.innerHTML='<video preload="none" src="/poster-result.webm"></video>';document.getElementById('thread').append(a);});
    const poster=await page.evaluate(pollTracking,{id:'poster-only'});assert.equal(poster.ready,true);assert.match(poster.url,/poster-result\.webm$/);
    // A restarted app can have a stale DOM ID but one unique original prompt
    // still visible in the selected account tab. Recover that exact response.
    await reset();await append({id:'new-render-user',role:'user',text:'Unique restart scene'});await append({id:'restart-result',src:'/restarted.webm',ref:'old-render-user'});await ready('restart-result');
    await page.evaluate(beginTracking,{id:'restarted-attempt',prompt:'Unique restart scene',recover:true,echoKey:'old-render-user',echoMarker:'missing-old-marker',echoAliases:['old-render-user']});
    assert.equal((await page.evaluate(pollTracking,{id:'restarted-attempt'})).url,'https://muse.ai/restarted.webm');
    await append({id:'second-identical-turn',role:'user',text:'Unique restart scene'});
    await page.evaluate(beginTracking,{id:'ambiguous-restart',prompt:'Unique restart scene',recover:true,echoKey:'missing-key',echoMarker:'missing-marker'});
    await assert.rejects(page.evaluate(pollTracking,{id:'ambiguous-restart'}),/nhiều tin nhắn/);
    // Automatic Continue requires the original attempt anchor, not a unique
    // historical prompt that happens to have identical text and an old video.
    await reset();await append({id:'old-scene-echo',role:'user',text:'Exact original scene'});await append({id:'old-scene-result',src:'/old-scene.webm',ref:'old-scene-echo'});
    await append({id:'reused-attempt-id',role:'user',text:'Bắt đầu công việc mới nhé'});await append({id:'warmup-reply',text:'Sẵn sàng'});
    await page.evaluate(beginTracking,{id:'strict-resume',prompt:'Exact original scene',recover:true,recoverRequireAnchor:true,echoKey:'reused-attempt-id',echoMarker:'stale-marker'});
    const strictUnbound=await page.evaluate(pollTracking,{id:'strict-resume'});assert.equal(strictUnbound.ready,false);assert.equal(strictUnbound.echoMatched,false);assert.equal(strictUnbound.recoveryUnbound,true);assert.equal(strictUnbound.historicalEchoCount,1);
    await assert.rejects(page.evaluate(downloadAction,{id:'strict-resume'}),/chưa sẵn sàng/);
    // A valid exact attempt anchor still recovers its own existing result.
    await page.evaluate(beginTracking,{id:'strict-good',prompt:'Exact original scene',recover:true,recoverRequireAnchor:true,echoKey:'old-scene-echo'});
    assert.equal((await page.evaluate(pollTracking,{id:'strict-good'})).url,'https://muse.ai/old-scene.webm');
    // Recycling the same connected echo leaf for the warmup must revoke ready,
    // even though its native ID, parent and previously matched video survive.
    await reset();await page.evaluate(beginTracking,{id:'recycled',prompt:'Recycled scene'});await append({id:'recycled-echo',role:'user',text:'Recycled scene'});await append({id:'recycled-result',src:'/recycled.webm',ref:'recycled-echo'});
    assert.equal((await page.evaluate(pollTracking,{id:'recycled'})).ready,true);
    await page.evaluate(()=>document.querySelector('#recycled-echo p').textContent='Bắt đầu công việc mới nhé');
    await assert.rejects(page.evaluate(pollTracking,{id:'recycled'}),/Tin nhắn.*thay đổi/);
    await assert.rejects(page.evaluate(downloadAction,{id:'recycled'}),/Tin nhắn.*thay đổi/);
    // An unknown-role Test message is still an explicit turn boundary through
    // its attempt marker; a later video cannot be assigned to the older scene.
    await reset();await append({id:'bounded-echo',role:'user',text:'Bounded scene'});
    await page.evaluate(()=>{const u=document.createElement('div');u.textContent='Bắt đầu công việc mới nhé';u.setAttribute('data-muse-studio-attempt','other-test');document.getElementById('thread').append(u);});
    await append({id:'later-unrelated-video',src:'/later-warmup.webm'});
    await page.evaluate(beginTracking,{id:'bounded',prompt:'Bounded scene',recover:true,recoverRequireAnchor:true,echoKey:'bounded-echo'});
    assert.equal((await page.evaluate(pollTracking,{id:'bounded'})).ready,false);
    // Moving a once-bound response beyond a newer turn invalidates the cached
    // ready result even if the video and its URL remain unchanged.
    await reset();await page.evaluate(beginTracking,{id:'moved-ready',prompt:'Moved scene'});await append({id:'moved-echo',role:'user',text:'Moved scene'});await append({id:'moved-result',src:'/moved.webm',ref:'moved-echo'});
    assert.equal((await page.evaluate(pollTracking,{id:'moved-ready'})).ready,true);
    await append({id:'later-user-turn',role:'user',text:'Other new scene'});
    await page.evaluate(()=>document.getElementById('thread').append(document.getElementById('moved-result')));
    assert.equal((await page.evaluate(pollTracking,{id:'moved-ready'})).ready,false);
    await assert.rejects(page.evaluate(downloadAction,{id:'moved-ready'}),/chưa sẵn sàng/);
    // Stop/Continue of an unacknowledged current send must retain its original
    // baseline, so historical identical text cannot become the new attempt.
    await reset();await append({id:'historical-delayed-echo',role:'user',text:'Delayed current scene'});await append({id:'historical-delayed-video',src:'/historical-delayed.webm',ref:'historical-delayed-echo'});
    await page.evaluate(beginTracking,{id:'delayed-current',prompt:'Delayed current scene'});
    assert.equal((await page.evaluate(pollTracking,{id:'delayed-current'})).echoMatched,false);
    const retainedUnacked=await page.evaluate(beginTracking,{id:'delayed-current',prompt:'Delayed current scene',recover:true,recoverRequireAnchor:true});
    assert.equal(retainedUnacked.retained,true);
    const stillUnacked=await page.evaluate(pollTracking,{id:'delayed-current'});assert.equal(stillUnacked.ready,false);assert.equal(stillUnacked.echoMatched,false);
    await append({id:'actual-delayed-echo',role:'user',text:'Delayed current scene'});await append({id:'actual-delayed-video',src:'/actual-delayed.webm',ref:'actual-delayed-echo'});
    const deliveredLater=await page.evaluate(pollTracking,{id:'delayed-current'});assert.equal(deliveredLater.echoKey,'actual-delayed-echo');assert.equal(deliveredLater.url,'https://muse.ai/actual-delayed.webm');
    // A different prompt cannot reuse that attempt ID, even for recovery.
    await assert.rejects(page.evaluate(beginTracking,{id:'delayed-current',prompt:'Another scene',recover:true,recoverRequireAnchor:true}),/prompt khác/);
    // Asking for strict recovery must not retain a previous permissive manual
    // historical selection or treat its newly planted marker as send proof.
    await reset();await append({id:'manual-old-echo',role:'user',text:'Manual historical scene'});await append({id:'manual-old-video',src:'/manual-historical.webm',ref:'manual-old-echo'});
    await page.evaluate(beginTracking,{id:'manual-upgrade',prompt:'Manual historical scene',recover:true});
    assert.equal((await page.evaluate(pollTracking,{id:'manual-upgrade'})).ready,true);
    const upgraded=await page.evaluate(beginTracking,{id:'manual-upgrade',prompt:'Manual historical scene',recover:true,recoverRequireAnchor:true,echoKey:'missing-current-attempt'});
    assert.notEqual(upgraded.retained,true);
    assert.equal((await page.evaluate(pollTracking,{id:'manual-upgrade'})).recoveryUnbound,true);
    await reset();await page.evaluate(beginTracking,{id:'svg-menu',prompt:'New clip with adjacent menu',messageSelector:'.bubble'});
    await append({id:'svg-user',role:'user',text:'New clip with adjacent menu'});
    await append({id:'svg-result',src:'/svg-menu.webm',ref:'svg-user'});
    await page.evaluate(()=>{
      document.getElementById('svg-user').classList.add('bubble');
      const result=document.getElementById('svg-result'),video=result.querySelector('video'),bubble=document.createElement('div');bubble.className='bubble';result.append(bubble);bubble.append(video);
      const button=document.createElement('button');button.innerHTML='<svg width="20" height="20"><circle cx="4" cy="10" r="1"/><circle cx="10" cy="10" r="1"/><circle cx="16" cy="10" r="1"/></svg>';
      button.onclick=()=>{const menu=document.createElement('div');menu.innerHTML='<div>Chia sẻ</div><div>Tải xuống</div>';menu.lastElementChild.onclick=()=>window.svgDownloaded=true;document.body.append(menu);};result.append(button);
    });
    assert.equal((await page.evaluate(pollTracking,{id:'svg-menu'})).ready,true);
    assert.equal((await page.evaluate(downloadAction,{id:'svg-menu'})).needsMenu,true);
    assert.equal((await page.evaluate(downloadAction,{id:'svg-menu',phase:'menu'})).clicked,true);
    assert.equal(await page.evaluate(()=>window.svgDownloaded),true);
    // Muse asks "send the clip again or create a new one?" for a prompt it has already made. Answering shows up as a bubble: part of this same
    // turn, so the clip that follows it is still this prompt's result; a genuinely different message still is not.
    const card=(id,labels)=>page.evaluate(a=>{const r=document.createElement('article');r.id=a.id;r.dataset.messageRole='assistant';const p=document.createElement('p');p.textContent='Bạn đã có clip này rồi. Muốn làm gì tiếp?';r.append(p);const row=document.createElement('div');for(const l of a.labels){const b=document.createElement('button');b.textContent=l;b.dataset.label=l;row.append(b);}r.append(row);document.getElementById('thread').append(r);},{id,labels});
    await reset();await page.evaluate(beginTracking,{id:'choice-1',prompt:'Choice scene one'});await append({id:'u-ch1',role:'user',text:'Choice scene one'});await card('card-1',['Gửi lại clip vừa tạo','Tạo một clip mới…']);
    let cs=await page.evaluate(pollTracking,{id:'choice-1'});assert.equal(cs.ready,false);assert.deepEqual(cs.choice,{answered:false},'thấy câu hỏi chưa ai trả lời');
    await append({id:'ch1-reply',role:'user',text:'Tạo một clip mới…'});await append({id:'ch1-result',src:'/choice-one.webm',ref:'u-ch1'});await ready('ch1-result');
    cs=await page.evaluate(pollTracking,{id:'choice-1'});assert.equal(cs.ready,true,'lượt chọn không phải tin nhắn khác');assert.equal(cs.url,'https://muse.ai/choice-one.webm');assert.equal(cs.choice,undefined);
    // Any wording: the bubble repeats the label of one of the buttons of a card with several buttons.
    await reset();await page.evaluate(beginTracking,{id:'choice-2',prompt:'Choice scene two'});await append({id:'u-ch2',role:'user',text:'Choice scene two'});await card('card-2',['Giữ bản cũ','Làm bản khác']);
    assert.equal((await page.evaluate(pollTracking,{id:'choice-2'})).choice,undefined,'nhãn lạ thì tool không tự bấm');
    await append({id:'ch2-reply',role:'user',text:'Làm bản khác'});await append({id:'ch2-result',src:'/choice-two.webm',ref:'u-ch2'});await ready('ch2-result');
    assert.equal((await page.evaluate(pollTracking,{id:'choice-2'})).ready,true);
    // A lone button is not a question: a bubble repeating it is another message and still blocks the clip behind it.
    await reset();await page.evaluate(beginTracking,{id:'choice-3',prompt:'Choice scene three'});await append({id:'u-ch3',role:'user',text:'Choice scene three'});await card('card-3',['Tiếp tục']);
    await append({id:'ch3-reply',role:'user',text:'Tiếp tục'});await append({id:'ch3-result',src:'/choice-three.webm',ref:'u-ch3'});await ready('ch3-result');
    assert.equal((await page.evaluate(pollTracking,{id:'choice-3'})).ready,false);
    // A different message after the card is never treated as the answer.
    await reset();await page.evaluate(beginTracking,{id:'choice-4',prompt:'Choice scene four'});await append({id:'u-ch4',role:'user',text:'Choice scene four'});await card('card-4',['Gửi lại clip vừa tạo','Tạo một clip mới…']);
    await append({id:'ch4-other',role:'user',text:'Một cảnh hoàn toàn khác'});await append({id:'ch4-result',src:'/choice-four.webm',ref:'u-ch4'});await ready('ch4-result');
    assert.equal((await page.evaluate(pollTracking,{id:'choice-4'})).ready,false);
    // The tool answers the card itself: one click on the right button, once per card, and the clip Muse then sends is the result.
    const wire=(resendOrFresh)=>page.evaluate(which=>{globalThis.__picked=[];for(const b of document.querySelectorAll('#thread button')){b.onclick=()=>{globalThis.__picked.push(b.dataset.label);const u=document.createElement('article');u.id='pick-user';u.dataset.messageRole='user';u.textContent=b.dataset.label;document.getElementById('thread').append(u);const a=document.createElement('article');a.id='pick-result';a.dataset.messageRole='assistant';a.setAttribute('data-response-to','u-ch5');a.innerHTML='<video preload="auto" src="/'+which+'.webm" width=160 height=90></video>';document.getElementById('thread').append(a);};}},resendOrFresh);
    for(const [pick,label,file] of [['resend','Gửi lại clip vừa tạo','picked-resend'],['fresh','Tạo một clip mới…','picked-fresh']]){
      await reset();await page.evaluate(beginTracking,{id:'choice-5',prompt:'Choice scene five'});await append({id:'u-ch5',role:'user',text:'Choice scene five'});await card('card-5',['Gửi lại clip vừa tạo','Tạo một clip mới…']);await wire(file);
      assert.deepEqual((await page.evaluate(pollTracking,{id:'choice-5'})).choice,{answered:false});
      assert.deepEqual(await page.evaluate(answerChoice,{id:'choice-5',pick}),{answered:true,pick});
      assert.deepEqual(await page.evaluate(()=>globalThis.__picked),[label],`chỉ bấm đúng nút «${label}», đúng một lần`);
      await ready('pick-result');cs=await page.evaluate(pollTracking,{id:'choice-5'});assert.equal(cs.ready,true);assert.equal(cs.url,`https://muse.ai/${file}.webm`);
      assert.deepEqual(await page.evaluate(answerChoice,{id:'choice-5',pick}),{answered:false,reason:'không có câu hỏi'},'câu hỏi đã trả lời thì không bấm lại');
    }
    // Never click when it is not a card with both options, when a clip already follows it, or when nothing is tracked.
    await reset();await page.evaluate(beginTracking,{id:'choice-6',prompt:'Choice scene six'});await append({id:'u-ch6',role:'user',text:'Choice scene six'});await card('card-6',['Gửi lại clip vừa tạo']);
    await page.evaluate(()=>{globalThis.__stray=0;for(const b of document.querySelectorAll('#thread button'))b.onclick=()=>globalThis.__stray++;});
    assert.equal((await page.evaluate(answerChoice,{id:'choice-6',pick:'resend'})).answered,false);assert.equal(await page.evaluate(()=>globalThis.__stray),0,'thiếu một lựa chọn thì không bấm gì');
    await reset();await page.evaluate(beginTracking,{id:'choice-7',prompt:'Choice scene seven'});await card('card-7',['Gửi lại clip vừa tạo','Tạo một clip mới…']);
    assert.equal((await page.evaluate(answerChoice,{id:'choice-7',pick:'resend'})).answered,false,'chưa thấy tin nhắn của prompt thì không bấm');
    await append({id:'u-ch7',role:'user',text:'Choice scene seven'});await card('card-7b',['Gửi lại clip vừa tạo','Tạo một clip mới…']);
    await page.evaluate(()=>{globalThis.__stray=0;for(const b of document.querySelectorAll('#card-7b button'))b.onclick=()=>globalThis.__stray++;});
    await append({id:'ch7-result',src:'/choice-seven.webm',ref:'u-ch7'});
    assert.equal((await page.evaluate(answerChoice,{id:'choice-7',pick:'fresh'})).answered,false,'đã có clip sau câu hỏi thì thôi');assert.equal(await page.evaluate(()=>globalThis.__stray),0);
    await assert.rejects(page.evaluate(answerChoice,{id:'khong-co',pick:'resend'}),/Không có trạng thái theo dõi/);
    // Muse sends the clip it already made (same address) after the answer: still this prompt's result.
    await reset();await append({id:'u-cr-old',role:'user',text:'Choice resent scene'});await append({id:'r-cr-old',src:'/choice-resent.webm',ref:'u-cr-old'});await ready('r-cr-old');
    await page.evaluate(beginTracking,{id:'choice-8',prompt:'Choice resent scene'});await append({id:'u-cr-new',role:'user',text:'Choice resent scene'});await card('card-8',['Gửi lại clip vừa tạo','Tạo một clip mới…']);
    assert.equal((await page.evaluate(pollTracking,{id:'choice-8'})).ready,false,'clip cũ một mình chưa phải kết quả');
    await append({id:'cr-reply',role:'user',text:'Gửi lại clip vừa tạo'});await append({id:'r-cr-new',src:'/choice-resent.webm',ref:'u-cr-new'});await ready('r-cr-new');
    cs=await page.evaluate(pollTracking,{id:'choice-8'});assert.equal(cs.ready,true);assert.equal(cs.url,'https://muse.ai/choice-resent.webm');
    // Muse "hatch" markup, as seen in a real chat export: reference picture above a plain user bubble, reply = text bubble + a clip
    // in its own wrapper; no roles, no thread marker. The same prompt can sit in the chat several times (earlier sends), and Muse can
    // swap the bubble it showed while sending for a rebuilt one: the clip for the copy sent now must still be found, an older reply never.
    await page.evaluate(()=>{document.getElementById('unrelated').innerHTML='<video autoplay muted loop data-hatch-avatar-layer src="/avatar.webm" width="120" height="120"></video>';});
    const HATCH='Look: clean 3D-rendered animation.\nOne single scene only: no split screen.\nAudio: only soft room tone.';
    const PIXEL='data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==';
    const hatchUser=(id,busy=false)=>page.evaluate(a=>{const row=document.createElement('div');row.className='flex w-full flex-col items-end';row.id=a.id;row.innerHTML='<div class="relative flex w-full flex-col items-end"><div class="flex shrink-0"><button type="button"><img alt="" src="'+a.pixel+'" width="120" height="68"></button></div><div class="relative"><div class="relative max-w-[520px]"><div class="hatch-chat-groupable-bubble bg-chat-user-bubble" aria-busy="'+a.busy+'"><span class="sr-only" data-copy-exclude></span><p class="whitespace-pre-wrap"></p></div></div></div></div>';row.querySelector('p').textContent=a.text;document.getElementById('thread').append(row);},{id,busy,pixel:PIXEL,text:HATCH});
    const hatchBot=(id,src)=>page.evaluate(a=>{const row=document.createElement('div');row.className='flex w-full flex-col items-start';row.id=a.id;row.innerHTML='<div class="hatch-chat-groupable-bubble"><p>Done — another take</p></div><div data-testid="hatch-chat-attachment-presentation-video"><span class="contents"><span class="inline-grid"><div role="button" tabindex="0" data-hatch-video-wrapper data-hatch-video-src="'+a.src+'" class="hatch-chat-groupable-bubble group"><div class="relative h-full w-full"><video playsinline loop src="'+a.src+'" width="160" height="90"></video></div><img alt="" aria-hidden="true" src="'+a.pixel+'" width="160" height="90"></div></span></span></div>';document.getElementById('thread').append(row);},{id,src,pixel:PIXEL});
    const hatchPrior=async n=>{for(let i=1;i<=n;i++){await hatchUser('hu-old'+i);await hatchBot('hb-old'+i,'/hatch-old'+i+'.webm');await ready('hb-old'+i);}};
    const rebuild=prefix=>page.evaluate(prefix=>{const list=document.getElementById('thread');const kids=[...list.children];list.innerHTML='';kids.forEach((k,i)=>{const c=k.cloneNode(true);c.id=prefix+i;list.append(c);});},prefix);
    const settled=()=>page.waitForFunction(()=>[...document.querySelectorAll('#thread video')].every(v=>v.readyState>=2));
    const hatchReset=async()=>{await reset();await page.evaluate(()=>{document.getElementById('thread').removeAttribute('data-chat-thread');document.getElementById('unrelated').innerHTML='<video autoplay muted loop data-hatch-avatar-layer src="/avatar.webm" width="120" height="120"></video>';});};
    // 1. Two earlier sends with their clips, the new copy's reply is a new clip.
    await hatchReset();await hatchPrior(2);await page.evaluate(beginTracking,{id:'hatch-1',prompt:HATCH});await hatchUser('hu-new',true);
    assert.equal((await page.evaluate(pollTracking,{id:'hatch-1'})).ready,false);
    await hatchBot('hb-new','/hatch-new-1.webm');await ready('hb-new');
    let hs=await page.evaluate(pollTracking,{id:'hatch-1'});assert.equal(hs.ready,true);assert.equal(hs.url,'https://muse.ai/hatch-new-1.webm');
    // 2. Muse swaps the bubble it showed while sending for a rebuilt one (new id) with earlier copies in the chat: no stall.
    await hatchReset();await hatchPrior(2);await page.evaluate(beginTracking,{id:'hatch-2',prompt:HATCH});await hatchUser('hu-tmp',true);await page.evaluate(pollTracking,{id:'hatch-2'});
    await page.evaluate(()=>document.getElementById('hu-tmp').remove());await hatchUser('hu-real');
    hs=await page.evaluate(pollTracking,{id:'hatch-2'});assert.equal(hs.phase,'waiting-response');assert.equal(hs.echoMatched,true);assert.ok(!/dựng lại/.test(hs.stage),'phải nhận lại đúng tin nhắn mới nhất: '+hs.stage);
    await hatchBot('hb-new','/hatch-new-2.webm');await ready('hb-new');
    hs=await page.evaluate(pollTracking,{id:'hatch-2'});assert.equal(hs.ready,true,'clip của bản vừa gửi phải được nhận');assert.equal(hs.url,'https://muse.ai/hatch-new-2.webm');
    // 3. The whole list rebuilt as new nodes (all ids new), old clips keep their addresses: only the clip after the newest copy counts.
    await hatchReset();await hatchPrior(2);await page.evaluate(beginTracking,{id:'hatch-3',prompt:HATCH});await hatchUser('hu-tmp3',true);await page.evaluate(pollTracking,{id:'hatch-3'});
    await rebuild('hu-rebuilt-');await settled();
    hs=await page.evaluate(pollTracking,{id:'hatch-3'});assert.equal(hs.ready,false);assert.ok(!/dựng lại/.test(hs.stage),hs.stage);
    await hatchBot('hb-new','/hatch-new-3.webm');await ready('hb-new');
    hs=await page.evaluate(pollTracking,{id:'hatch-3'});assert.equal(hs.ready,true);assert.equal(hs.url,'https://muse.ai/hatch-new-3.webm');
    // 4. Rebuilt before the first poll: every copy looks new, yet exactly one more than before sending is the newest.
    await hatchReset();await hatchPrior(2);await page.evaluate(beginTracking,{id:'hatch-4',prompt:HATCH});await hatchUser('hu-new4',true);await rebuild('hu-rb4-');await settled();
    assert.equal((await page.evaluate(pollTracking,{id:'hatch-4'})).ready,false);
    await hatchBot('hb-new','/hatch-new-4.webm');await ready('hb-new');
    hs=await page.evaluate(pollTracking,{id:'hatch-4'});assert.equal(hs.ready,true);assert.equal(hs.url,'https://muse.ai/hatch-new-4.webm');
    // 5. Two new identical copies after sending: nobody can tell which is ours, so it still fails closed.
    await hatchReset();await hatchPrior(1);await page.evaluate(beginTracking,{id:'hatch-5',prompt:HATCH});await hatchUser('hu-n5a',true);await hatchUser('hu-n5b',true);
    await assert.rejects(page.evaluate(pollTracking,{id:'hatch-5'}),/nhiều tin nhắn/);
    // 6. After the swap, the late reply of an EARLIER copy is never taken as this prompt's clip.
    await hatchReset();await hatchPrior(2);await page.evaluate(beginTracking,{id:'hatch-6',prompt:HATCH});await hatchUser('hu-tmp6',true);await page.evaluate(pollTracking,{id:'hatch-6'});
    await page.evaluate(()=>document.getElementById('hu-tmp6').remove());await hatchUser('hu-real6');await page.evaluate(pollTracking,{id:'hatch-6'});
    await page.evaluate(()=>{const c=document.getElementById('hb-old1').cloneNode(true);c.id='hb-late';document.getElementById('thread').insertBefore(c,document.getElementById('hu-old2'));});await settled();
    assert.equal((await page.evaluate(pollTracking,{id:'hatch-6'})).ready,false,'phản hồi muộn của bản cũ không phải kết quả');
    // 7. Muse sends the clip it already made (same address) under the newest copy, after the swap: still this prompt's result.
    await hatchReset();await hatchPrior(2);await page.evaluate(beginTracking,{id:'hatch-7',prompt:HATCH});await hatchUser('hu-tmp7',true);await page.evaluate(pollTracking,{id:'hatch-7'});
    await page.evaluate(()=>document.getElementById('hu-tmp7').remove());await hatchUser('hu-real7');
    await hatchBot('hb-resent','/hatch-old2.webm');await ready('hb-resent');
    hs=await page.evaluate(pollTracking,{id:'hatch-7'});assert.equal(hs.ready,true);assert.equal(hs.url,'https://muse.ai/hatch-old2.webm');
    // Muse answers in plain text and no clip will ever follow: "prompt vẫn như cũ" (already made) or "chưa làm được từ khung hình này" (cannot make it
    // from this frame). The tracker must say so, but never for a normal reply, for the prompt's own words, or for a refusal that sits before this prompt.
    const hatchText=(id,text)=>page.evaluate(a=>{const row=document.createElement('div');row.className='flex w-full flex-col items-start';row.id=a.id;row.innerHTML='<div class="hatch-chat-groupable-bubble"><p></p></div>';row.querySelector('p').textContent=a.text;document.getElementById('thread').append(row);},{id,text});
    const HATCH_LONG=HATCH+'\nCHARACTERS (identical in every shot, never change): one student, same prompt as before in every scene. Please send an edited version only if the room changes.';
    const refusal=async(label,text,expected)=>{
      await hatchReset();await hatchPrior(1);
      await page.evaluate(({id,prompt})=>{globalThis.__p=prompt;},{id:'x',prompt:HATCH_LONG});
      await page.evaluate(beginTracking,{id:'refuse-'+label,prompt:HATCH_LONG});
      await page.evaluate(a=>{const row=document.createElement('div');row.className='flex w-full flex-col items-end';row.id='hu-ref-'+a.label;row.innerHTML='<div class="hatch-chat-groupable-bubble bg-chat-user-bubble"><p></p></div>';row.querySelector('p').textContent=a.text;document.getElementById('thread').append(row);},{label,text:HATCH_LONG});
      await page.evaluate(pollTracking,{id:'refuse-'+label});
      if(text)await hatchText('hb-ref-'+label,text);
      const r=await page.evaluate(pollTracking,{id:'refuse-'+label});
      assert.equal(r.ready,false,label);assert.equal(r.refused,expected,label+': '+JSON.stringify({stage:r.stage,refused:r.refused}));
      return r;
    };
    await refusal('vi-repeat','Prompt này vẫn như cũ nên mình chưa tạo được. Bạn gửi bản đã chỉnh lại thì mình làm ngay.','repeat');
    await refusal('vi-frame','Clip mốc 46 bên trái vẫn chưa làm được từ khung hình này. Bạn gửi một khung hình đầu tiên khác cho mốc này, hoặc mình làm mốc khác trước nhé.','blocked');
    await refusal('en-repeat',"This prompt is the same as before, so I haven't made it. Send me an edited version and I'll start right away.",'repeat');
    await refusal('en-frame',"I still can't make the clip from this frame. Please send me a different first frame for this milestone.",'blocked');
    await refusal('normal-reply','Done — another take of the same clip, starting exactly from your frame.',undefined);
    await refusal('no-reply',null,undefined);
    // a refusal followed by a clip is not a refusal: the clip is the result
    await refusal('then-clip','Prompt này vẫn như cũ nên mình chưa tạo được.','repeat');
    await hatchBot('hb-after-refusal','/hatch-after-refusal.webm');await ready('hb-after-refusal');
    hs=await page.evaluate(pollTracking,{id:'refuse-then-clip'});assert.equal(hs.ready,true);assert.equal(hs.refused,undefined);
    // a refusal that belongs to an earlier send (before this prompt) is not this prompt's answer
    await hatchReset();await hatchText('hb-old-refusal','Prompt này vẫn như cũ nên mình chưa tạo được. Bạn gửi bản đã chỉnh lại thì mình làm ngay.');
    await page.evaluate(beginTracking,{id:'refuse-old',prompt:HATCH_LONG});
    await page.evaluate(a=>{const row=document.createElement('div');row.className='flex w-full flex-col items-end';row.id='hu-ref-old';row.innerHTML='<div class="hatch-chat-groupable-bubble bg-chat-user-bubble"><p></p></div>';row.querySelector('p').textContent=a.text;document.getElementById('thread').append(row);},{text:HATCH_LONG});
    hs=await page.evaluate(pollTracking,{id:'refuse-old'});assert.equal(hs.echoMatched,true);assert.equal(hs.refused,undefined,'câu từ chối của lượt trước không tính');
    console.log('PASS: real Chromium decoded-video tracker fixture — exact prompt binding, delayed result/progress, old/unrelated/wrong/out-of-order media rejection, ambiguity fail-closed, scoped menu download and unique recovery. No live Muse requests.');
  } finally {if(browser)await browser.close();await fs.rm(dir,{recursive:true,force:true});}
})().catch(error=>{console.error(error);process.exitCode=1;});
