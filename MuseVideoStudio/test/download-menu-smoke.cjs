// Real Chromium + decoded video fixture. Rebuilds the two Muse menus seen on the real app:
//   "…" beside the clip  -> [Hôm nay lúc 14:59] Trả lời / Tải xuống   (Download = 2nd row)
//   right-click the clip -> [Hôm nay lúc 15:18] emoji row / Trả lời / Chia sẻ / Tải xuống   (4th row)
// and checks that the clip is downloaded from either, and that a wrong row is never clicked.
// Does not contact Muse.
const { chromium } = require('playwright-core');
const { beginTracking, downloadAction } = require('../src/muse-tracker.cjs');
const { triggerDownload } = require('../src/download-trigger.cjs');
const { execFile } = require('node:child_process');
const { promisify } = require('node:util');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const assert = require('node:assert/strict');
(async()=>{
  const dir=await fs.mkdtemp(path.join(os.tmpdir(),'muse-download-menu-'));
  let browser;
  try {
    const media=path.join(dir,'clip.webm');
    if(process.env.MUSE_TRACKER_VIDEO_FIXTURE)await fs.copyFile(process.env.MUSE_TRACKER_VIDEO_FIXTURE,media);
    else await promisify(execFile)('ffmpeg',['-v','error','-f','lavfi','-i','color=c=blue:s=240x135:r=15:d=0.6','-c:v','libvpx','-threads','1','-an',media]);
    const bytes=await fs.readFile(media);
    browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH||'/usr/bin/chromium',headless:true,args:['--no-sandbox']});
    const context=await browser.newContext({viewport:{width:900,height:700}});
    const html='<!doctype html><html><body style="font:14px sans-serif"><div id="thread" data-chat-thread></div><textarea id="composer"></textarea></body></html>';
    await context.route('**/*',route=>route.fulfill(route.request().url().endsWith('.webm')?{status:200,contentType:'video/webm',body:bytes}:{status:200,contentType:'text/html',body:html}));
    const page=await context.newPage();await page.goto('https://muse.ai/');
    const stopped=()=>Object.assign(Error('stopped'),{name:'AbortError'});
    const delay=ms=>new Promise(r=>setTimeout(r,ms));
    let n=0;
    // Builds: user echo + assistant message holding the clip, then lets `ui` add Muse's menus.
    async function scene(ui,{noRightClick=false}={}) {
      const id='t'+(++n),prompt='Scene '+n;
      await page.evaluate(()=>{const m=globalThis[Symbol.for('MuseVideoStudio.promptTrackers.v1')];if(m){for(const s of m.values())s.observer?.disconnect();m.clear();}});
      await page.setContent(html);
      await page.evaluate(beginTracking,{id,prompt,messageSelector:'article'});
      await page.evaluate(({prompt})=>{
        const u=document.createElement('article');u.id='user';u.dataset.messageRole='user';u.textContent=prompt;document.getElementById('thread').append(u);
      },{prompt});
      await page.evaluate(()=>{
        const a=document.createElement('article');a.id='reply';a.dataset.messageRole='assistant';a.setAttribute('data-response-to','user');a.style.cssText='margin:30px;width:300px';
        const p=document.createElement('p');p.textContent='Here is the clip.';a.append(p);
        const v=document.createElement('video');v.preload='auto';v.src='/clip.webm';v.width=240;v.height=135;a.append(v);
        document.getElementById('thread').append(a);window.__log=[];
      });
      await page.waitForFunction(()=>{const v=document.querySelector('#reply video');return v&&v.readyState>=2&&v.videoWidth>0&&v.duration>0;});
      await page.evaluate('('+ui+')()');
      return id;
    }
    const run=(id,extra={})=>triggerDownload({id,signal:{aborted:false},delay,stopped,abortable:p=>p,call:arg=>page.evaluate(downloadAction,arg),rightClick:extra.noReal?undefined:(x,y)=>page.mouse.click(x,y,{button:'right'})});
    const clicked=()=>page.evaluate(()=>window.__log.slice());
    // Shared bits of Muse's look, injected into the page.
    const kit=`
      window.menuOf=(rows,header)=>{const m=document.createElement('div');m.id='muse-popup';m.style.cssText='position:fixed;left:200px;top:260px;width:210px;background:#fff;border:1px solid #ccc;padding:6px';
        const h=document.createElement('div');h.textContent=header;h.style.color='#777';m.append(h);
        for(const [label,cls] of rows){if(label==='EMOJI'){const e=document.createElement('div');e.style.cssText='display:flex;gap:4px';for(const ch of ['👍','❤️','😂','😮','😳','🙏','+']){const b=document.createElement('button');b.textContent=ch;b.onclick=()=>window.__log.push('emoji');e.append(b);}m.append(e);continue;}
          const r=document.createElement(cls==='button'?'button':'div');r.style.cssText='padding:6px;cursor:pointer;display:block;width:100%;text-align:left;border:0;background:none';r.innerHTML='<svg width="14" height="14"><path d="M1 1h12v12z"/></svg> <span>'+label+'</span>';r.onclick=()=>window.__log.push(label);m.append(r);}
        document.body.append(m);return m;};
      window.closeOnOutside=()=>{};
      window.toolbar=(root,onDots)=>{const bar=document.createElement('div');bar.className='msg-actions';bar.style.cssText='display:flex;gap:6px;margin-top:4px';
        const mk=(svg,fn)=>{const d=document.createElement('div');d.className='ic';d.style.cssText='width:22px;height:22px;display:flex;align-items:center;justify-content:center';d.innerHTML=svg;if(fn)fn(d);return d;};
        bar.append(mk('<svg width="18" height="18" viewBox="0 0 18 18"><circle cx="9" cy="9" r="7" fill="none" stroke="#000"/><path d="M6 11q3 3 6 0" fill="none" stroke="#000"/></svg>',d=>d.onclick=()=>window.__log.push('react')));
        bar.append(mk('<svg width="18" height="18" viewBox="0 0 18 18"><path d="M3 9v6h12V9M9 2v9M6 5l3-3 3 3" fill="none" stroke="#000"/></svg>',d=>d.onclick=()=>window.__log.push('share-icon')));
        bar.append(mk('<svg width="18" height="18" viewBox="0 0 18 18"><circle cx="3" cy="9" r="1.5"/><circle cx="9" cy="9" r="1.5"/><circle cx="15" cy="9" r="1.5"/></svg>',onDots));
        root.append(bar);};
    `;
    // 1) "…" is a plain div icon (no role, no label) that opens on pointerdown only; menu rows are plain divs under a timestamp.
    let id=await scene(`()=>{${kit};const a=document.getElementById('reply');
      toolbar(a,d=>{d.onpointerdown=()=>{if(!document.getElementById('muse-popup'))menuOf([['Trả lời'],['Tải xuống']],'Hôm nay lúc 14:59');};});}`);
    await run(id);assert.deepEqual(await clicked(),['Tải xuống'],'1: plain-div … opens on pointerdown, Download (2nd row, under a timestamp header) clicked, nothing else');
    // 2) toolbar exists only while hovered (JS), same menu.
    id=await scene(`()=>{${kit};const a=document.getElementById('reply');
      a.addEventListener('mouseenter',()=>{if(!a.querySelector('.msg-actions'))toolbar(a,d=>{d.onclick=()=>menuOf([['Trả lời','button'],['Tải xuống','button']],'Hôm nay lúc 14:59');});});}`);
    await run(id);assert.deepEqual(await clicked(),['Tải xuống'],'2: hover-only toolbar revealed by hover events, then Download clicked');
    // 3) no "…" at all, right-click opens the 4-row menu (emoji row, Trả lời, Chia sẻ, Tải xuống).
    id=await scene(`()=>{${kit};const a=document.getElementById('reply');
      a.addEventListener('contextmenu',e=>{e.preventDefault();menuOf([['EMOJI'],['Trả lời'],['Chia sẻ'],['Tải xuống']],'Hôm nay lúc 15:18');});}`);
    await run(id);assert.deepEqual(await clicked(),['Tải xuống'],'3: right-click menu: Download is the 4th row; Reply/Share/emoji untouched');
    // 4) menu items are role=menuitem buttons.
    id=await scene(`()=>{${kit};const a=document.getElementById('reply');
      a.addEventListener('contextmenu',e=>{e.preventDefault();const m=menuOf([['EMOJI'],['Trả lời','button'],['Chia sẻ','button'],['Tải xuống','button']],'Hôm nay lúc 15:18');m.setAttribute('role','menu');m.querySelectorAll('button').forEach(b=>{if(b.textContent.length>2)b.setAttribute('role','menuitem');});});}`);
    await run(id);assert.deepEqual(await clicked(),['Tải xuống'],'4: role=menu / menuitem version of the right-click menu');
    // 5) the page ignores scripted events (isTrusted check): the real mouse right-click is the route that works.
    id=await scene(`()=>{${kit};const a=document.getElementById('reply');
      a.addEventListener('contextmenu',e=>{if(!e.isTrusted)return;e.preventDefault();menuOf([['EMOJI'],['Trả lời'],['Chia sẻ'],['Tải xuống']],'Hôm nay lúc 15:18');});}`);
    await run(id);assert.deepEqual(await clicked(),['Tải xuống'],'5: trusted-only page: real right-click route downloads');
    // 6) "…" opens a menu whose first row is Download -> refused; the right-click route is then used and is correct.
    id=await scene(`()=>{${kit};const a=document.getElementById('reply');
      toolbar(a,d=>{d.onclick=()=>{if(!document.getElementById('muse-popup'))menuOf([['Tải xuống'],['Trả lời']],'Hôm nay lúc 14:59');};});
      a.addEventListener('contextmenu',e=>{e.preventDefault();menuOf([['EMOJI'],['Trả lời'],['Chia sẻ'],['Tải xuống']],'Hôm nay lúc 15:18');});}`);
    await run(id);assert.deepEqual(await clicked(),['Tải xuống'],'6: wrong-row "…" menu refused without clicking, right-click menu used');
    // 7) every menu has Download in the wrong row -> nothing clicked, clear error naming each route.
    id=await scene(`()=>{${kit};const a=document.getElementById('reply');
      toolbar(a,d=>{d.onclick=()=>{if(!document.getElementById('muse-popup'))menuOf([['Tải xuống'],['Trả lời']],'Hôm nay lúc 14:59');};});
      a.addEventListener('contextmenu',e=>{e.preventDefault();menuOf([['EMOJI'],['Tải xuống'],['Chia sẻ'],['Trả lời']],'Hôm nay lúc 15:18');});}`);
    await assert.rejects(run(id),/nút … cạnh video.*Dòng thứ hai.*chuột phải vào video.*Dòng thứ tư/s,'7: all routes refused with a readable reason');
    assert.deepEqual(await clicked(),[],'7: a Download in the wrong row is never clicked');
    // 8) nothing opens anything -> error lists what is next to the clip so the selector can be tuned.
    id=await scene(`()=>{${kit};const a=document.getElementById('reply');toolbar(a,d=>{d.onclick=()=>window.__log.push('dots-did-nothing');});}`);
    await assert.rejects(run(id),/Chưa tìm thấy nút tải của đúng video[\s\S]*Biểu tượng gần clip/,'8: unknown UI gives a diagnostic message');
    assert.ok(!(await clicked()).includes('Tải xuống'),'8: no download click');
    // 9) direct (non-soft) calls keep the old strict messages.
    id=await scene(`()=>{}`);
    await assert.rejects(page.evaluate(downloadAction,{id,phase:'auto'}),/menu …/,'9: strict mode still throws when there is no …');
    // 10) a Download link that already sits elsewhere on the page is never used.
    id=await scene(`()=>{${kit};const old=document.createElement('button');old.textContent='Tải xuống';old.onclick=()=>window.__log.push('WRONG-direct');document.body.append(old);
      document.getElementById('reply').addEventListener('contextmenu',e=>{e.preventDefault();menuOf([['EMOJI'],['Trả lời'],['Chia sẻ'],['Tải xuống']],'Hôm nay lúc 15:18');});}`);
    await run(id);assert.deepEqual(await clicked(),['Tải xuống'],'10: pre-existing Download control outside the clip menu untouched');
    console.log('PASS: download routes ("…" 2nd row, right-click 4th row, real right-click) — plain-div / hover-only / role=menu menus, wrong rows refused, diagnostics on failure.');
  } finally { await browser?.close(); await fs.rm(dir,{recursive:true,force:true}); }
})().catch(error=>{console.error(error);process.exit(1);});
