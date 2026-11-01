// Production main.cjs + real Chromium DOM and local media. No live Muse requests.
const {chromium}=require('playwright-core');
const {EventEmitter}=require('node:events');
const {createRequire}=require('node:module');
const crypto=require('node:crypto'),fs=require('node:fs/promises'),os=require('node:os'),path=require('node:path'),vm=require('node:vm'),assert=require('node:assert/strict');
const {capturePlaywrightDownload}=require('../src/download-capture.cjs');
const {lockInput}=require('../src/locked-input.cjs');
const mainPath=path.resolve(__dirname,'../src/main.cjs'),localRequire=createRequire(mainPath);
const pause=ms=>new Promise(r=>setTimeout(r,ms));
async function until(check,message,ms=15000){const end=Date.now()+ms;while(!await check()){if(Date.now()>end)throw Error(message);await pause(25);}}
(async()=>{
 const dir=await fs.mkdtemp(path.join(os.tmpdir(),'muse-scene-flow-'));let browser,app,closed=false,shutdown,mainWindow,quitWait;
 try{
  const prompt='Photorealistic 4K. Emily places the pot on the island. Camera slowly pushes in. Exactly 8 seconds.';
  const image=path.join(dir,'reference.png'),png=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=','base64');await fs.writeFile(image,png);
  const job={id:'restored-scene',number:1,order:1,prompt,references:[image],image,status:'interrupted',account:1,trackerId:'old-attempt',mayHaveSubmitted:true,submittedAt:'2026-10-30T01:00:00.000Z',acknowledgedAt:'2026-10-30T01:00:01.000Z',resultReadyAt:'2026-10-30T01:00:02.000Z',echoKey:'historical-user',echoMarker:'old-attempt',remoteStop:{state:'unavailable'}};
  await lockInput(job,path.join(dir,'locked-references'));
  await fs.writeFile(image,Buffer.from('The source was edited after this scene was locked.'));
  await fs.writeFile(path.join(dir,'studio.json'),JSON.stringify({configVersion:2,dispatchRevision:1,settings:{output:dir,accountCount:1,browserChoice:'chrome',cooldownSeconds:0,composer:'textarea',fileInput:'input[type=file]',video:'video'},jobs:[job]}));
  const media=await fs.readFile(path.join(__dirname,'fixtures/solid-blue.webm'));
  browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH||'/usr/bin/chromium',headless:true,args:['--no-sandbox']});
  const context=await browser.newContext({acceptDownloads:true});
  await context.route('**/*',route=>{const u=route.request().url();return route.fulfill(u.endsWith('.webm')?{status:200,contentType:'video/webm',body:media}:{status:200,contentType:'text/html',body:'<!doctype html><html><body><div class="messages" data-chat-thread></div><form><textarea></textarea><input type="file" accept="image/*" hidden><div id="previews"></div><button type="button" aria-label="Send">Send</button></form></body></html>'});});
  const page=await context.newPage();
  const downloads=[],updates=[],errors=[],handlers=new Map();let loadMain;
  const loaded=new Promise(r=>loadMain=r),quit=new Promise(r=>shutdown=r);quitWait=quit;
  app=new EventEmitter();app.requestSingleInstanceLock=()=>true;app.whenReady=()=>Promise.resolve();app.getPath=()=>dir;app.quit=()=>shutdown();
  class Window extends EventEmitter{
   constructor(){super();this.webContents=new EventEmitter();this.webContents.setWindowOpenHandler=()=>{};this.webContents.send=(_name,state)=>updates.push(structuredClone(state.jobs));mainWindow=this;}
   setMenu(){}setMenuBarVisibility(){}isDestroyed(){return false;}show(){}focus(){}hide(){}async loadFile(){loadMain();}
  }
  const cipherKey=crypto.randomBytes(32),safeStorage={isEncryptionAvailable:()=>true,getSelectedStorageBackend:()=> 'test-keyring'};
  // Real encryption is used by the production trial manager; no owner key is involved.
  safeStorage.encryptString=text=>{const iv=crypto.randomBytes(12),c=crypto.createCipheriv('aes-256-gcm',cipherKey,iv),bytes=Buffer.concat([c.update(text,'utf8'),c.final()]);return Buffer.concat([iv,c.getAuthTag(),bytes]);};
  safeStorage.decryptString=bytes=>{const d=crypto.createDecipheriv('aes-256-gcm',cipherKey,bytes.subarray(0,12));d.setAuthTag(bytes.subarray(12,28));return Buffer.concat([d.update(bytes.subarray(28)),d.final()]).toString();};
  const adapter={external:true,isDestroyed:()=>closed,isSessionEnabled:()=>true,url:()=>page.url(),show:async()=>{},openMuse:async()=>{
   await page.goto('https://muse.ai/');
   await page.evaluate(({prompt})=>{
    window.trace=[];window.sceneSent=[];window.fixturePrompt=prompt;
    const thread=document.querySelector('.messages');
    function bubble(id,role,text){const root=document.createElement('article');root.id=id;root.dataset.messageRole=role;const p=document.createElement('p');p.textContent=text;root.append(p);thread.append(root);return root;}
    window.addBubble=bubble;
    bubble('historical-user','user',prompt);
    const old=bubble('historical-reply','assistant','An old result from a different attempt');old.setAttribute('data-response-to','historical-user');
    const oldVideo=document.createElement('a');oldVideo.href='/old.webm';oldVideo.type='video/webm';oldVideo.download='old.webm';oldVideo.textContent='Download';old.append(oldVideo);
    const composer=document.querySelector('textarea'),input=document.querySelector('input[type=file]'),button=document.querySelector('button');
    composer.addEventListener('input',()=>window.trace.push({type:'input',text:composer.value}));
    input.addEventListener('change',async()=>{
     window.trace.push({type:'upload',name:input.files[0]?.name,bytes:Array.from(new Uint8Array(await input.files[0].arrayBuffer()))});
     const img=document.createElement('img');img.src=URL.createObjectURL(input.files[0]);img.style.cssText='width:40px;height:40px';document.getElementById('previews').append(img);
    });
    button.onclick=()=>{
     if(button.getAttribute('aria-label')==='Stop'){button.setAttribute('aria-label','Send');button.textContent='Send';return;}
     const text=composer.value,files=Array.from(input.files).map(f=>f.name);composer.value='';
     if(text==='Bắt đầu công việc mới nhé'){bubble('warmup-user','user',text);window.trace.push({type:'warmup'});return;}
     window.sceneSent.push({text,files});window.trace.push({type:'send',text,files});document.getElementById('previews').replaceChildren();input.value='';button.setAttribute('aria-label','Stop');button.textContent='Stop';
    };
   },{prompt});
  },evaluate:(fn,arg)=>page.evaluate(fn,arg),upload:async(selector,files)=>{await page.locator(selector).setInputFiles(files);},pinPage:()=>{},releasePage:()=>{},captureDownload:async(target,options)=>{downloads.push(target);await page.evaluate(()=>window.trace.push({type:'download'}));return capturePlaywrightDownload(page,target,options);},close:async()=>{closed=true;}};
  const electron={app,Menu:{setApplicationMenu(){}},BrowserWindow:Window,safeStorage,session:{},shell:{openPath:async()=>'',showItemInFolder:()=>{}},dialog:{showErrorBox:(title,message)=>{errors.push({title,message});loadMain();},showMessageBoxSync:()=>1},ipcMain:{handle:(name,fn)=>handlers.set(name,fn)}};
  const sandbox=vm.createContext({require:name=>name==='electron'?electron:name==='./external-browser.cjs'?{launchExternalBrowser:async()=>adapter}:name==='./browser-discovery.cjs'?{resolveBrowser:()=>'/fixture/chrome'}:localRequire(name),__dirname:path.dirname(mainPath),Buffer,URL,console,setTimeout,clearTimeout,AbortController});
  vm.runInContext(await fs.readFile(mainPath,'utf8'),sandbox,{filename:mainPath});await loaded;assert.deepEqual(errors,[]);
  const invoke=(name,data)=>handlers.get('studio:'+name)({sender:mainWindow.webContents},data),state=()=>invoke('state');
  await invoke('testBrowsers');
  assert.equal(state().active,false);assert.equal(state().jobs[0].status,'interrupted');assert.equal(downloads.length,0);assert.equal((await page.evaluate(()=>window.sceneSent)).length,0);assert.ok(state().browserTests.every(t=>t.status==='sent'));
  // An earlier failed upload may have left exact text but no attached image.
  // Reusing that text must still perform a real upload before clicking Send.
  await page.locator('textarea').fill(prompt);
  assert.equal(await page.locator('#previews img').count(),0);
  await invoke('start');
  await until(()=>page.evaluate(()=>window.sceneSent.length===1),'Continue did not upload and send the restored exact prompt');
  const sent=await page.evaluate(()=>window.sceneSent);assert.equal(sent[0].text,prompt);assert.equal(sent[0].files.length,1);assert.equal(downloads.length,0);assert.ok(!['waiting','downloading','completed'].includes(state().jobs[0].stage),'Cannot claim generation/download before exact echo');
  const upload=await page.evaluate(()=>window.trace.find(t=>t.type==='upload'));assert.deepEqual(Buffer.from(upload.bytes),png);
  await page.evaluate(()=>{window.addBubble('current-scene-user','user',window.fixturePrompt);window.trace.push({type:'echo'});});
  await until(()=>state().jobs[0].acknowledgedAt,'Exact prompt echo was not recorded');assert.equal(downloads.length,0);
  await page.evaluate(()=>{const root=window.addBubble('current-scene-reply','assistant','Creating your new video');root.setAttribute('data-response-to','current-scene-user');const progress=document.createElement('progress');progress.max=100;progress.value=37;root.append(progress);window.trace.push({type:'reply'});});
  await until(()=>state().jobs[0].stage==='waiting','Fresh reply must show waiting for generation');assert.equal(downloads.length,0);assert.equal(state().jobs[0].status,'running');
  await page.evaluate(()=>{const root=document.getElementById('current-scene-reply');root.querySelector('progress').remove();const a=document.createElement('a');a.href='/new.webm';a.type='video/webm';a.download='new.webm';a.textContent='Download';root.append(a);window.trace.push({type:'media'});document.querySelector('button').setAttribute('aria-label','Send');document.querySelector('button').textContent='Send';});
  await until(()=>state().jobs[0].status==='completed','New result did not download and complete');assert.equal(downloads.length,1);assert.equal(state().jobs[0].output,path.join(dir,'001.webm'));assert.deepEqual(await fs.readFile(state().jobs[0].output),media);
  const trace=await page.evaluate(()=>window.trace),index=type=>trace.findIndex(t=>t.type===type);
  assert.ok(index('upload')<index('send')&&index('send')<index('echo')&&index('echo')<index('reply')&&index('reply')<index('media')&&index('media')<index('download'),JSON.stringify(trace.map(t=>t.type)));
  assert.ok(updates.some(rows=>rows[0]?.stage==='uploading'));assert.ok(updates.some(rows=>rows[0]?.stage==='submitting'));assert.ok(updates.some(rows=>rows[0]?.stage==='confirming'));assert.ok(updates.some(rows=>rows[0]?.stage==='waiting'));assert.ok(updates.some(rows=>rows[0]?.stage==='downloading'));assert.deepEqual(errors,[]);
  app.emit('before-quit',{preventDefault(){}});await quit;
  console.log('PASS: production main + Chromium restores stale acknowledged job, opening sentence completes without a reply, Continue uploads locked reference even with a matching image-less draft and sends exact prompt, then confirms echo, waits for NEW generation and saves only its video. No live Muse.');
 }finally{if(app&&quitWait){app.emit('before-quit',{preventDefault(){}});await quitWait;}if(browser)await browser.close();await fs.rm(dir,{recursive:true,force:true});}
})().catch(e=>{console.error(e);process.exitCode=1;});
