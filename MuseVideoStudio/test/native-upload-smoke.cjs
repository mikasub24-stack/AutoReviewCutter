// Executes production native-upload function using real Chromium CDP through a
// small Electron-debugger adapter. Does not connect to Muse or use real accounts.
const {chromium}=require('playwright-core');
const {EventEmitter}=require('node:events');
const fs=require('node:fs/promises'),path=require('node:path'),os=require('node:os'),vm=require('node:vm'),assert=require('node:assert/strict');
const {ensureAttachmentInput}=require('../src/attachment-input.cjs');
const {stoppedError}=require('../src/queue.cjs');
(async()=>{
 const dir=await fs.mkdtemp(path.join(os.tmpdir(),'muse-native-upload-'));let browser;
 try{
  const file=path.join(dir,'reference.png');await fs.writeFile(file,Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR4nGP4z8DwHwAFAAH/iZk9HQAAAABJRU5ErkJggg==','base64'));
  const main=await fs.readFile(path.join(__dirname,'../src/main.cjs'),'utf8');
  const start=main.indexOf('async function upload('),end=main.indexOf('\nconst delay =',start);
  assert.ok(start>=0&&end>start,'Production upload function must be present');const source=main.slice(start,end);
  browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH||'/usr/bin/chromium',headless:true,args:['--no-sandbox']});
  const context=await browser.newContext();
  async function fixture(mode,{abortBefore=false,abortAfterMenu=false}={}){
   const page=await context.newPage();
   await page.setContent(`<form><textarea>Exact scene prompt</textarea><div class="previews"></div><button type="button" aria-label="Attach">+</button></form><script>
    window.applied=[];window.opens=0;window.retained=[];
    function makeInput(){const input=document.createElement('input');input.type='file';input.accept='image/*';input.hidden=true;input.onchange=()=>{window.applied.push([...input.files].map(f=>f.name));};document.querySelector('form').append(input);window.retained.push(input);return input;}
    ${mode==='hidden'?'makeInput();':''}
    document.querySelector('button').onclick=()=>{window.opens++;const menu=document.createElement('div');menu.setAttribute('role','menu');const item=document.createElement('button');item.type='button';item.textContent='Upload image';item.onclick=()=>{const input=makeInput();menu.remove();input.click();${mode==='detached'?'input.remove();':''}};menu.append(item);document.body.append(menu);};
   </script>`);
   const cdp=await context.newCDPSession(page),debug=new EventEmitter(),commands=[];let attached=false;
   debug.attach=()=>{attached=true;};debug.detach=()=>{attached=false;};debug.isAttached=()=>attached;
   debug.sendCommand=async(method,args)=>{commands.push(method);return cdp.send(method,args);};
   cdp.on('Page.fileChooserOpened',params=>debug.emit('message',{},'Page.fileChooserOpened',params));
   const controller=new AbortController();if(abortBefore)controller.abort();
   const upload=vm.runInNewContext(source+';upload',{fs,settings:{fileInput:'input[type=file]',composer:'textarea'},stoppedError,assertMuse:()=>{},ensureAttachmentInput,
    delay:ms=>new Promise(r=>setTimeout(r,ms)),dom:async(_muse,fn,arg)=>{const state=await page.evaluate(fn,arg);if(abortAfterMenu&&state.clicked)controller.abort();return state;}});
   try{
    const pending=upload({webContents:{debugger:debug}},[file],controller.signal);
    if(abortBefore||abortAfterMenu){await assert.rejects(pending,/Đã dừng/);assert.deepEqual(await page.evaluate(()=>window.applied),[]);assert.equal(commands.filter(x=>x==='DOM.setFileInputFiles').length,0);if(abortBefore)assert.equal(await page.evaluate(()=>window.opens),0);}
    else{await pending;assert.deepEqual(await page.evaluate(()=>window.applied),[['reference.png']]);assert.equal(commands.filter(x=>x==='DOM.setFileInputFiles').length,1);assert.equal(await page.evaluate(()=>window.opens),mode==='hidden'?0:1);}
    assert.equal(attached,false);assert.equal(debug.listenerCount('message'),0);
   }finally{await cdp.detach();await page.close();}
  }
  await fixture('hidden');await fixture('mounted');await fixture('detached');await fixture('mounted',{abortBefore:true});await fixture('mounted',{abortAfterMenu:true});
  console.log('PASS: production native upload through real CDP handles hidden, menu-mounted and detached file inputs exactly once; Stop prevents attachment, interception/listeners clean up. No live Muse.');
 }finally{await browser?.close();await fs.rm(dir,{recursive:true,force:true});}
})().catch(e=>{console.error(e);process.exitCode=1;});
