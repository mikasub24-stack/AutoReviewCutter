// Real browser / real decoded media fixture. Does not contact Muse or submit jobs.
const { chromium } = require('playwright-core');
const { beginTracking, pollTracking, pollBrowserProbe, downloadAction, endTracking } = require('../src/muse-tracker.cjs');
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
    await reset();await page.evaluate(beginTracking,{id:'response-selector',prompt:'Response selector target',messageSelector:'.answer'});await append({id:'u-selector',role:'user',text:'Response selector target'});await append({id:'selector-result',src:'/selector.webm',ref:'u-selector'});await page.evaluate(()=>document.getElementById('selector-result').classList.add('answer'));await ready('selector-result');assert.equal((await page.evaluate(pollTracking,{id:'response-selector'})).ready,true);
    // Custom role-less popup reuses hidden DOM and exposes a fresh exact-label
    // span only after the result's own More control. Old visible labels remain.
    await reset();await page.evaluate(beginTracking,{id:'custom-menu',prompt:'Custom menu target'});await append({id:'u-custom-menu',role:'user',text:'Custom menu target'});await append({id:'custom-menu-result',src:'/custom-menu.webm',ref:'u-custom-menu'});await ready('custom-menu-result');
    await page.evaluate(()=>{globalThis.__customRight=false;globalThis.__customWrong=false;const old=document.createElement('div');old.innerHTML='<span>Tải xuống</span>';old.onclick=()=>globalThis.__customWrong=true;document.body.append(old);const popup=document.createElement('div');popup.id='reused-popup';popup.style.display='none';popup.innerHTML='<div><span>Chia sẻ</span></div><div><span>Tải xuống</span></div>';popup.lastElementChild.onclick=()=>globalThis.__customRight=true;document.body.append(popup);const more=document.createElement('button');more.textContent='…';more.onclick=()=>popup.style.display='block';document.getElementById('custom-menu-result').append(more);});
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
    console.log('PASS: real Chromium decoded-video tracker fixture — exact prompt binding, delayed result/progress, old/unrelated/wrong/out-of-order media rejection, ambiguity fail-closed, scoped menu download and unique recovery. No live Muse requests.');
  } finally {if(browser)await browser.close();await fs.rm(dir,{recursive:true,force:true});}
})().catch(error=>{console.error(error);process.exitCode=1;});
