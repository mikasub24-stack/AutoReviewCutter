// Real browser / real decoded media fixture. Does not contact Muse or submit jobs.
const { chromium } = require('playwright-core');
const { beginTracking, pollTracking, downloadAction, endTracking } = require('../src/muse-tracker.cjs');
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
    await promisify(execFile)('ffmpeg',['-v','error','-f','lavfi','-i','color=c=blue:s=160x90:r=15:d=0.6','-c:v','libvpx','-threads','1','-an',media]);
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
    assert.equal((await page.evaluate(downloadAction,{id:'one'})).url,'https://muse.ai/matching.webm');
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
      const more=document.createElement('button');more.textContent='…';more.setAttribute('aria-haspopup','menu');more.onclick=()=>{const menu=document.createElement('div');menu.setAttribute('role','menu');const b=document.createElement('button');b.setAttribute('role','menuitem');b.textContent='Tải xuống';b.onclick=()=>globalThis.__matchedDownload=true;menu.append(b);document.body.append(menu);};document.getElementById('menu-result').append(more);
    });
    const first=await page.evaluate(downloadAction,{id:'menu',phase:'auto'});assert.equal(first.needsMenu,true);assert.equal(first.clicked,false);
    const second=await page.evaluate(downloadAction,{id:'menu',phase:'menu'});assert.equal(second.clicked,true);assert.equal(await page.evaluate(()=>globalThis.__matchedDownload),true);assert.equal(await page.evaluate(()=>Boolean(globalThis.__wrongDownload)),false);
    // Recovery can bind an existing exact unique echo, but does not guess among
    // repeated historical prompts.
    await reset();await append({id:'u-recover',role:'user',text:'Recover exact prompt'});await append({id:'recover-result',src:'/recover.webm',ref:'u-recover'});await ready('recover-result');
    await page.evaluate(beginTracking,{id:'recover',prompt:'Recover exact prompt',recover:true,messageSelector:'article'});assert.equal((await page.evaluate(pollTracking,{id:'recover'})).ready,true);
    await append({id:'u-recover-dupe',role:'user',text:'Recover exact prompt'});await assert.rejects(page.evaluate(pollTracking,{id:'recover'}),/nhiều tin nhắn/);
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
    await page.evaluate(()=>{globalThis.__customRight=false;globalThis.__customWrong=false;const old=document.createElement('div');old.innerHTML='<span>Tải xuống</span>';old.onclick=()=>globalThis.__customWrong=true;document.body.append(old);const popup=document.createElement('div');popup.id='reused-popup';popup.style.display='none';popup.innerHTML='<div><span>Tải xuống</span></div>';popup.firstElementChild.onclick=()=>globalThis.__customRight=true;document.body.append(popup);const more=document.createElement('button');more.textContent='…';more.onclick=()=>popup.style.display='block';document.getElementById('custom-menu-result').append(more);});
    const opened=await page.evaluate(downloadAction,{id:'custom-menu',phase:'auto'});assert.equal(opened.needsMenu,true);const clicked=await page.evaluate(downloadAction,{id:'custom-menu',phase:'menu'});assert.equal(clicked.clicked,true);assert.equal(await page.evaluate(()=>globalThis.__customRight),true);assert.equal(await page.evaluate(()=>globalThis.__customWrong),false);
    // An unknown-author response row can report real DOM progress before a
    // video element exists; no elapsed-time percentage is fabricated.
    await reset();await page.evaluate(()=>document.getElementById('thread').removeAttribute('data-chat-thread'));await page.evaluate(beginTracking,{id:'generic-progress',prompt:'Generic progress target'});
    await page.evaluate(()=>{const u=document.createElement('div');u.innerHTML='<div><p>Generic progress target</p></div><div><button>Copy</button></div>';const r=document.createElement('div');r.innerHTML='<div><div role="progressbar" aria-valuenow="42" aria-valuemax="100">Rendering</div></div><div><button>…</button></div>';document.getElementById('thread').append(u,r);});
    const genericProgress=await page.evaluate(pollTracking,{id:'generic-progress'});assert.equal(genericProgress.ready,false);assert.equal(genericProgress.progress,42);assert.equal(genericProgress.phase,'rendering');
    console.log('PASS: real Chromium decoded-video tracker fixture — exact prompt binding, delayed result/progress, old/unrelated/wrong/out-of-order media rejection, ambiguity fail-closed, scoped menu download and unique recovery. No live Muse requests.');
  } finally {if(browser)await browser.close();await fs.rm(dir,{recursive:true,force:true});}
})().catch(error=>{console.error(error.message);process.exitCode=1;});
