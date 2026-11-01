// Production main + ten isolated Chromium documents. All network is fixture-only.
const {chromium}=require('playwright-core');
const {EventEmitter}=require('node:events');
const {createRequire}=require('node:module');
const crypto=require('node:crypto'),fs=require('node:fs/promises'),os=require('node:os'),path=require('node:path'),vm=require('node:vm'),assert=require('node:assert/strict');
const {capturePlaywrightDownload}=require('../src/download-capture.cjs');
const mainPath=path.resolve(__dirname,'../src/main.cjs'),localRequire=createRequire(mainPath);
async function until(check,message,ms=20000){const end=Date.now()+ms;while(!await check()){if(Date.now()>end)throw Error(message);await new Promise(r=>setTimeout(r,25));}}
(async()=>{
 const dir=await fs.mkdtemp(path.join(os.tmpdir(),'muse-ten-sessions-'));let browser,app,quit,mainWindow;
 let releaseSave;const saveGate=new Promise(r=>releaseSave=r),pages=[],sent=[],downloads=[],errors=[],handlers=new Map();
 try{
  const png=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=','base64');
  const image=path.join(dir,'shared.png');await fs.writeFile(image,png);
  const referenceBytes=Array.from({length:10},(_,i)=>Buffer.concat([png,Buffer.from(`scene-reference-${i}`)]));
  const images=await Promise.all(referenceBytes.map(async(bytes,i)=>{const file=path.join(dir,`scene-${i}.png`);await fs.writeFile(file,bytes);return file;}));
  const jobs=Array.from({length:10},(_,i)=>({id:`scene-${i}`,order:i+1,number:i+1,prompt:`Scene ${i+1}. Exact camera motion.\nKeep this prompt unchanged.`,references:[images[i],image],status:'pending'}));
  await fs.writeFile(path.join(dir,'studio.json'),JSON.stringify({configVersion:2,dispatchRevision:1,settings:{output:dir,accountCount:10,browserChoice:'chrome',dispatchMode:'parallel',cooldownSeconds:0,composer:'textarea',fileInput:'input[type=file]',video:'video'},jobs}));
  const media=await fs.readFile(path.join(__dirname,'fixtures/solid-blue.webm'));
  browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH||'/usr/bin/chromium',headless:true,args:['--no-sandbox']});
  let loaded;const ready=new Promise(r=>loaded=r);app=new EventEmitter();app.requestSingleInstanceLock=()=>true;app.whenReady=()=>Promise.resolve();app.getPath=()=>dir;quit=new Promise(r=>app.quit=r);
  class Window extends EventEmitter{
   constructor(){super();this.webContents=new EventEmitter();this.webContents.setWindowOpenHandler=()=>{};this.webContents.send=()=>{};mainWindow=this;}
   setMenu(){}setMenuBarVisibility(){}isDestroyed(){return false;}show(){}focus(){}hide(){}async loadFile(){loaded();}
  }
  const key=crypto.randomBytes(32),safeStorage={isEncryptionAvailable:()=>true,getSelectedStorageBackend:()=> 'fixture-keyring'};
  safeStorage.encryptString=text=>{const iv=crypto.randomBytes(12),c=crypto.createCipheriv('aes-256-gcm',key,iv),bytes=Buffer.concat([c.update(text,'utf8'),c.final()]);return Buffer.concat([iv,c.getAuthTag(),bytes]);};
  safeStorage.decryptString=bytes=>{const d=crypto.createDecipheriv('aes-256-gcm',key,bytes.subarray(0,12));d.setAuthTag(bytes.subarray(12,28));return Buffer.concat([d.update(bytes.subarray(28)),d.final()]).toString();};
  async function launch({profileDir}){
   const slot=Number(path.basename(profileDir).split('-').pop())-1,context=await browser.newContext({acceptDownloads:true});
   await context.route('**/*',route=>route.fulfill(route.request().url().endsWith('.webm')?{status:200,contentType:'video/webm',body:media}:{status:200,contentType:'text/html',body:'<div class="messages" data-chat-thread></div><form><textarea></textarea><input type="file" multiple hidden><div id="previews"></div><button type="button" aria-label="Send">Send</button></form>'}));
   const page=await context.newPage();await page.addInitScript(bytes=>{window.fixtureMedia=bytes;},Array.from(media));pages[slot]=page;let closed=false;
   return {external:true,isDestroyed:()=>closed,isSessionEnabled:()=>true,url:()=>page.url(),show:async()=>{},pinPage:()=>{},releasePage:()=>{},close:async()=>{closed=true;},
    openMuse:async()=>{
     await page.goto('https://muse.ai/');await page.evaluate(()=>{
      window.sent=[];window.trace=[];window.warmups=[];
      window.bubble=(id,role,text)=>{const e=document.createElement('article');e.id=id;e.dataset.messageRole=role;const p=document.createElement('p');p.textContent=text;e.append(p);document.querySelector('.messages').append(e);return e;};
      const input=document.querySelector('input'),composer=document.querySelector('textarea');
      input.onchange=async()=>{window.uploadBytes=await Promise.all(Array.from(input.files).map(async file=>Array.from(new Uint8Array(await file.arrayBuffer()))));for(const file of input.files){const img=document.createElement('img');img.src=URL.createObjectURL(file);img.width=40;img.height=40;document.getElementById('previews').append(img);}window.trace.push('upload');};
      document.querySelector('button').onclick=()=>{
       const text=composer.value;composer.value='';
       if(text==='Bắt đầu công việc mới nhé'){window.warmups.push(text);return;}
       window.sent.push({text,files:Array.from(input.files).map(f=>f.name)});window.trace.push('send');window.bubble('scene-user','user',text);document.getElementById('previews').replaceChildren();input.value='';
      };
     });
    },evaluate:(fn,arg)=>page.evaluate(fn,arg),upload:async(selector,files)=>page.locator(selector).setInputFiles(files),
    captureDownload:async(target,options)=>{
     downloads.push(slot);await capturePlaywrightDownload(page,target,options);
     // The browser has saved its temporary file, but publishing it is held.
     await saveGate;
    }
   };
  }
  const electron={app,Menu:{setApplicationMenu(){}},BrowserWindow:Window,safeStorage,session:{},shell:{openPath:async()=>'',showItemInFolder(){}},dialog:{showErrorBox:(title,message)=>{errors.push({title,message});loaded();},showMessageBoxSync:()=>1},ipcMain:{handle:(name,fn)=>handlers.set(name,fn)}};
  const sandbox=vm.createContext({require:name=>name==='electron'?electron:name==='./external-browser.cjs'?{launchExternalBrowser:launch}:name==='./browser-discovery.cjs'?{resolveBrowser:()=>'/fixture/chrome'}:localRequire(name),__dirname:path.dirname(mainPath),Buffer,URL,console,setTimeout,clearTimeout,AbortController});
  vm.runInContext(await fs.readFile(mainPath,'utf8'),sandbox,{filename:mainPath});await ready;
  const invoke=(name,data)=>handlers.get('studio:'+name)({sender:mainWindow.webContents},data),state=()=>invoke('state');
  await invoke('testBrowsers');assert.equal(pages.length,10);assert.equal(state().active,false);assert.equal(state().testing,false);
  for(const page of pages){assert.deepEqual(await page.evaluate(()=>window.warmups),['Bắt đầu công việc mới nhé']);assert.deepEqual(await page.evaluate(()=>window.sent),[]);}
  assert.ok(state().jobs.every(j=>j.status==='pending'));assert.equal(downloads.length,0);
  await invoke('start');
  // All ten must upload and send before any result exists: serial dispatch fails.
  await until(async()=>{const rows=await Promise.all(pages.map(p=>p.evaluate(()=>window.sent)));return rows.every(r=>r.length===1);},'Ten sessions did not send concurrently');
  assert.equal(downloads.length,0);assert.ok(state().jobs.every(j=>j.status==='running'));
  for(let i=0;i<10;i++){
   const result=await pages[i].evaluate(()=>({sent:window.sent,bytes:window.uploadBytes,trace:window.trace}));sent.push(result.sent[0]);
   assert.equal(result.sent[0].text,jobs[i].prompt);assert.equal(result.sent[0].files.length,2);assert.deepEqual(Buffer.from(result.bytes[0]),referenceBytes[i]);assert.deepEqual(Buffer.from(result.bytes[1]),png);assert.deepEqual(result.trace,['upload','send']);
  }
  // Each page includes a wrong old clip and a direct-download decoy.
  for(let i=9;i>=0;i--)await pages[i].evaluate(i=>{
   const old=document.createElement('article');old.dataset.messageRole='assistant';old.innerHTML='<a href="/old.webm" type="video/webm">Old</a><button>…</button>';old.querySelector('button').onclick=()=>window.trace.push('WRONG');document.querySelector('.messages').prepend(old);
   const root=window.bubble('scene-result','assistant','Created clip');root.setAttribute('data-response-to','scene-user');
   const a=document.createElement('a');a.href=`/clip-${i}.webm`;a.type='video/webm';a.textContent='Download';a.onclick=()=>window.trace.push('WRONG');root.append(a);
   const more=document.createElement('button');more.textContent='…';more.setAttribute('aria-controls','clip-menu');more.onclick=()=>{
    window.trace.push('menu');const menu=document.createElement('div');menu.id='clip-menu';menu.setAttribute('role','menu');menu.innerHTML='<button role="menuitem">Chia sẻ</button>';
    const row=document.createElement('a');row.setAttribute('role','menuitem');row.href=URL.createObjectURL(new Blob([new Uint8Array(window.fixtureMedia)],{type:'video/webm'}));row.download=`clip-${i}.webm`;row.textContent='Tải xuống';row.onclick=()=>window.trace.push('second-row');menu.append(row);document.body.append(menu);
   };root.append(more);
  },i);
  await until(()=>downloads.length===10,'Ten clip downloads did not start');
  await until(async()=>{const files=await fs.readdir(dir);return files.filter(f=>f.endsWith('.part')).length===10;},'Temporary files missing');
  assert.ok(state().jobs.every(j=>j.status==='running'&&!j.output&&!j.downloadCompletedAt),'Must not complete before publishing saved files');
  releaseSave();await until(()=>!state().active,'Ten videos did not complete');
  for(let i=0;i<10;i++){
   const job=state().jobs[i];assert.equal(job.status,'completed');assert.equal(job.output,path.join(dir,String(i+1).padStart(3,'0')+'.webm'));assert.deepEqual(await fs.readFile(job.output),media);assert.ok(job.downloadCompletedAt);
   assert.deepEqual(await pages[i].evaluate(()=>window.trace),['upload','send','menu','second-row']);
  }
  assert.deepEqual(errors,[]);app.emit('before-quit',{preventDefault(){}});await quit;app=null;
  console.log('PASS: ten isolated sessions send fixed Test sentence only, then concurrently upload distinct per-scene + shared images and exact prompts; correct clip menus and second rows only; no completion before saved video publication. No live Muse accounts.');
 }finally{releaseSave();if(app&&quit){app.emit('before-quit',{preventDefault(){}});await quit;}if(browser)await browser.close();await fs.rm(dir,{recursive:true,force:true});}
})().catch(e=>{console.error(e);process.exitCode=1;});
