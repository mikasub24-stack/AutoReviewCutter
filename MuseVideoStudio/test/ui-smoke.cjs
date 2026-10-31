// UI-only smoke test with a mocked IPC bridge; does not connect to Muse.
const { chromium } = require('playwright-core');
const http = require('node:http');
const fs = require('node:fs/promises');
const path = require('node:path');
const assert = require('node:assert/strict');
(async () => {
  const server = http.createServer(async(req,res)=>{
    const files={'/':'index.html','/style.css':'style.css','/renderer.js':'renderer.js','/script-planner.js':'script-planner.js'};
    const file=files[req.url];if(!file){res.writeHead(404);res.end();return;}
    res.setHeader('Content-Type',file.endsWith('.css')?'text/css':file.endsWith('.js')?'application/javascript':'text/html');
    res.end(await fs.readFile(path.resolve(__dirname,'../src',file)));
  });
  await new Promise(r=>server.listen(0,'127.0.0.1',r));
  const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || '/usr/bin/chromium', headless: true, args: ['--no-sandbox'] });
  try {
    const page = await browser.newPage({ viewport: { width: 1450, height: 1200 } });
    const errors = []; page.on('pageerror', e => errors.push(e.message));
    await page.addInitScript(() => {
      let listener; let imageCall=0;
      const state={jobs:[],active:false,paused:true,settings:{browserChoice:'builtin',browserPath:'',output:'C:\\Videos',autoMerge:false,autoPackage:false,ffmpeg:'ffmpeg',accountCount:2,composer:'textarea',fileInput:'input[type=file]',submit:'',video:'video',timeoutMinutes:15}};
      window.testCalls=[];
      window.completeJobs=()=>{state.jobs=state.jobs.map(j=>({...j,status:'completed',output:'C:\\Videos\\'+j.id+'.mp4'}));listener(structuredClone(state));};
      window.studio={onUpdate:fn=>listener=fn,invoke:async(name,data)=>{
        window.testCalls.push({name,data});
        if(name==='start') return structuredClone(state);
        if(name==='images') return ++imageCall===1 ? ['C:\\References\\one.png','C:\\References\\style.png'] : ['C:\\References\\two.png'];
        if(name==='add') state.jobs.push(...data.map((j,i)=>({...j,id:String(i),status:'pending'})));
        if(name==='settings') { Object.assign(state.settings,data);state.settings.accountCount=Number(data.accountCount);state.settings.autoMerge=data.finishAction==='merge';state.settings.autoPackage=data.finishAction==='package'; }
        if(name==='packageClips') {state.editPackageDir='C:\\Videos\\CapCut_Clips_test';state.packageProgress='Đã xuất clip';}
        if(['state','add','settings','packageClips'].includes(name)) return structuredClone(state);
        return true;
      }};
    });
    await page.goto(`http://127.0.0.1:${server.address().port}/`);
    await page.locator('#draftRows textarea').fill('Animate character one');
    await page.locator('#draftRows button').filter({hasText:'Ảnh tham chiếu riêng'}).click();
    await page.locator('#newDraft').click();
    await page.locator('#draftRows textarea').nth(1).fill('Animate character two');
    await page.locator('#draftRows .draftRow').nth(1).getByText('Ảnh tham chiếu riêng').click();
    await page.locator('#commitDrafts').click();
    const calls=await page.evaluate(()=>window.testCalls);
    const added=calls.find(c=>c.name==='add').data;
    assert.deepEqual(added.map(j=>j.references),[['C:\\References\\one.png','C:\\References\\style.png'],['C:\\References\\two.png']]);
    assert.equal(await page.locator('.card').count(),2);
    await page.locator('#configure').click();
    assert.equal(await page.locator('select[name=finishAction]').inputValue(),'keep');
    await page.locator('select[name=finishAction]').selectOption('package');
    assert.equal(await page.locator('select[name=browserChoice]').inputValue(),'builtin');
    await page.locator('select[name=browserChoice]').selectOption('edge');
    await page.locator('input[name=accountCount]').fill('3');
    await page.locator('#settingsForm button[type=submit]').click();
    assert.equal(await page.locator('#accountPicker option').count(),3);
    assert.equal(await page.locator('#browserInfo').textContent(),'Microsoft Edge');
    await page.locator('#accountPicker').selectOption('2');await page.locator('#browser').click();
    assert.equal(await page.evaluate(()=>window.testCalls.find(c=>c.name==='browser').data),2);
    assert.match(await page.locator('#finishMode').textContent(),/Xuất clip cho CapCut/);
    assert.equal(await page.locator('#packageClips').isDisabled(),true);
    await page.evaluate(()=>window.completeJobs());
    assert.equal(await page.locator('#packageClips').isDisabled(),false);
    await page.locator('#packageClips').click();
    assert.equal(await page.locator('#openPackage').isVisible(),true);
    await page.locator('#openPackage').click();
    assert.ok(await page.evaluate(()=>window.testCalls.some(c=>c.name==='openPackage')));
    await page.locator('#scriptInput').fill('Cảnh 1: Đầu bếp mở cửa quán.\n\nCảnh 2: Cận cảnh món ăn nóng.');
    await page.locator('#scriptSeconds').fill('8');
    await page.locator('#scriptAspect').selectOption('9:16');
    await page.locator('#planScript').click();
    assert.equal(await page.locator('#draftRows textarea').count(),2);
    assert.match(await page.locator('#draftRows textarea').first().inputValue(),/8 giây, tỷ lệ 9:16/);
    assert.match(await page.locator('#draftRows textarea').nth(1).inputValue(),/Cận cảnh món ăn/);
    page.once('dialog',dialog=>dialog.accept());
    await page.locator('#createDrafts').click();
    await page.waitForFunction(()=>window.testCalls.some(c=>c.name==='start'));
    const generated=await page.evaluate(()=>window.testCalls.filter(c=>c.name==='add').at(-1).data);
    assert.equal(generated.length,2);
    assert.match(generated[0].source,/Đầu bếp/);
    assert.equal(await page.locator('.card').count(),4);
    assert.deepEqual(errors,[]);
    await page.screenshot({path:path.resolve(__dirname,'../ui-preview.png'),fullPage:true});
    console.log('PASS: per-prompt references, queue cards, account settings and selected account dispatch, keep/package output modes, browser choice, script planning and create-to-queue dispatch (mock bridge).');
  } finally { await browser.close(); server.close(); }
})().catch(e=>{console.error(e);process.exitCode=1;});
