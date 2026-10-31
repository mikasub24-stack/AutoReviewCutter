// Real Chromium UI test with mocked IPC; no Muse calls or payments.
const{chromium}=require('playwright-core'),http=require('http'),fs=require('fs/promises'),path=require('path'),assert=require('assert/strict');
const{importPrompts}=require('../src/prompt-import.js');
(async()=>{
 const fixture=process.env.PROMPT_FIXTURE_PATH?await fs.readFile(process.env.PROMPT_FIXTURE_PATH,'utf8'):Array.from({length:60},(_,i)=>`PROMPT ${i+1} — 8 seconds\nVIDEO PROMPT (standalone):\nCharacter: Fictional person.\n\nTIMED ACTIONS: Move smoothly. CAMERA: slow pan. Exactly 8 seconds.\n\nENGLISH VOICEOVER: Narration ${i+1}.`).join('\n');
 const server=http.createServer(async(req,res)=>{const map={'/':'index.html','/style.css':'style.css','/renderer.js':'renderer.js','/script-planner.js':'script-planner.js','/prompt-import.js':'prompt-import.js','/reference-map.js':'reference-map.js'},name=map[req.url];if(!name){res.writeHead(404);return res.end();}res.setHeader('Content-Type',name.endsWith('.js')?'application/javascript':name.endsWith('.css')?'text/css':'text/html');res.end(await fs.readFile(path.join(__dirname,'../src',name)));});
 await new Promise(r=>server.listen(0,'127.0.0.1',r));const browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH||'/usr/bin/chromium',headless:true,args:['--no-sandbox']});
 try{
  const page=await browser.newPage({viewport:{width:1450,height:1100}}),errors=[];page.on('pageerror',e=>errors.push(e.message));page.on('dialog',d=>d.accept());
  await page.addInitScript(()=>{
   const s={jobs:[],active:false,paused:true,network:{checking:[],reports:[],errors:[]},license:{status:'trial',device:'TESTDEVICE',expiresAt:Date.now()+86400000,message:'Dùng thử 24 giờ'},settings:{requireUSA:true,vpnProvider:'windscribe',vpnClientPath:'',browserChoice:'builtin',browserPath:'',output:'C:\\Videos',autoMerge:false,autoPackage:false,ffmpeg:'ffmpeg',accountCount:2,composer:'textarea',fileInput:'input[type=file]',submit:'',video:'video',attachmentReadySelector:'',timeoutMinutes:15}};window.calls=[];let listener,id=0;
   window.studio={onUpdate:fn=>listener=fn,invoke:async(name,data)=>{
    window.calls.push({name,data});
    if(name==='images')return data?.multiple===false?['C:\\Refs\\character.png']:['C:\\Refs\\03.png','C:\\Refs\\01.png','C:\\Refs\\02.png'];
    if(name==='imageFolder')return['C:\\Refs\\02.png','C:\\Refs\\01.png','C:\\Refs\\03.png'];
    if(name==='add')s.jobs.push(...data.map(j=>({...j,id:String(++id),status:'pending'})));
    if(name==='start'){s.active=true;s.paused=false;if(s.jobs.length)s.jobs[0].status='running';}
    if(name==='stop'){s.active=false;s.paused=true;s.jobs.forEach(j=>{if(j.status==='running')j.status='interrupted';});}
    if(name==='clearPending')s.jobs=s.jobs.filter(j=>j.status!=='pending');if(name==='clearList')s.jobs=[];
    if(name==='applyReferences')for(const row of data.assignments){const j=s.jobs.find(j=>j.id===row.id);j.references=row.references;}
    if(name==='settings'){Object.assign(s.settings,data);s.settings.accountCount=Number(data.accountCount);s.settings.autoMerge=data.finishAction==='merge';s.settings.autoPackage=data.finishAction==='package';}
    if(name==='checkUSA')s.network.reports=[{index:data,ip:'203.0.113.8',countryCode:'US',countryName:'United States',observedAt:new Date().toISOString()}];
    return structuredClone(s);
   }};
  });
  await page.goto(`http://127.0.0.1:${server.address().port}/`);
  await page.locator('#prompts').fill(fixture);await page.locator('#images').click();await page.locator('#add').click();
  assert.equal(await page.locator('#draftRows textarea').count(),60);assert.match(await page.locator('#importInfo').textContent(),/8:00/);
  assert.equal(await page.locator('#draftRows textarea').first().inputValue(),importPrompts(fixture)[0].prompt);
  await page.locator('#createDrafts').click();await page.waitForFunction(()=>window.calls.some(c=>c.name==='start'));
  const payload=await page.evaluate(()=>window.calls.find(c=>c.name==='add').data);assert.equal(payload.length,60);assert.ok(payload.every(j=>j.references[0]==='C:\\Refs\\character.png'));assert.equal(payload[0].prompt,importPrompts(fixture)[0].prompt);
  await page.locator('#pause').click();await page.waitForFunction(()=>window.calls.some(c=>c.name==='stop'));assert.match(await page.locator('#queueState').textContent(),/Đã dừng/);
  await page.locator('#clearPending').click();assert.equal(await page.locator('.card').count(),1);await page.locator('#clearList').click();assert.equal(await page.locator('.card').count(),0);
  await page.locator('#prompts').fill('PROMPT 01: First complete motion prompt.\nPROMPT 02: Second motion prompt.\nPROMPT 03: Third motion prompt.');await page.locator('#referenceMode').selectOption('numbered');await page.locator('#imageFolder').click();await page.locator('#add').click();
  assert.equal(await page.locator('#draftRows textarea').count(),3);assert.match(await page.locator('.draftRow').nth(0).locator('.referenceList').textContent(),/01.png/);assert.match(await page.locator('.draftRow').nth(1).locator('.referenceList').textContent(),/02.png/);
  await page.locator('#commitDrafts').click();const second=await page.evaluate(()=>window.calls.filter(c=>c.name==='add').at(-1).data);assert.deepEqual(second.map(j=>j.references[0].split('\\').pop()),['01.png','02.png','03.png']);
  await page.locator('#referenceMode').selectOption('shared');await page.locator('#images').click();await page.locator('#applyRefs').click();const assigned=await page.evaluate(()=>window.calls.find(c=>c.name==='applyReferences').data.assignments);assert.ok(assigned.every(j=>j.references[0].endsWith('character.png')));
  await page.locator('#configure').click();await page.locator('select[name=browserChoice]').selectOption('edge');await page.locator('input[name=accountCount]').fill('3');await page.locator('#settingsForm button[type=submit]').click();await page.locator('#accountPicker').selectOption('2');await page.locator('#logoutAccount').click();assert.equal(await page.evaluate(()=>window.calls.find(c=>c.name==='logoutAccount').data),2);
  assert.equal(await page.locator('#checkUSA').count(),0);assert.equal(await page.locator('[name=requireUSA]').count(),0);await page.locator('#licenseButton').click();assert.match(await page.locator('#licenseStatus').textContent(),/Dùng thử/);assert.equal(await page.locator('.paymentPanel').textContent().then(s=>s.includes('PGD')),false);await page.locator('#closeLicense').click();
  assert.deepEqual(errors,[]);await page.screenshot({path:path.join(__dirname,'../ui-preview.png'),fullPage:true});console.log('PASS: 60 prepared scenes preserved, one shared image, numbered image folder mapping, immediate stop IPC, bulk clear, per-account logout, no IP/VPN UI and trial UI. Mock IPC, no real Muse.');
 }finally{await browser.close();server.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
