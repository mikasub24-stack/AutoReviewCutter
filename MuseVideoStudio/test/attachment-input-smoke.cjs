// Real Chromium attachment controls and file chooser; all pages served by fixture.
const {chromium}=require('playwright-core');
const assert=require('node:assert/strict'),fs=require('node:fs/promises'),os=require('node:os'),path=require('node:path');
const {launchExternalBrowser}=require('../src/external-browser.cjs');
const {ensureAttachmentInput,composerAttachmentSnapshot}=require('../src/attachment-input.cjs');
const {attachmentState,imageSources}=require('../src/attachment-ready.cjs');
const {beginTracking}=require('../src/muse-tracker.cjs');
const {submitPrompt}=require('../src/submit-prompt.cjs');
(async()=>{
 const dir=await fs.mkdtemp(path.join(os.tmpdir(),'muse-real-attach-'));let adapter,context;
 const html=`<!doctype html><html><body><div data-chat-thread><article>Old conversation</article></div><form><div class="previews"></div><textarea></textarea><button type="button" aria-label="Attach">+</button><button type="button" aria-label="Send">Send</button></form><aside><button>Upload image</button></aside><script>
 window.sent=[];window.opens=0;window.uploads=0;
 document.querySelector('[aria-label=Attach]').onclick=()=>{window.opens++;const menu=document.createElement('div');menu.setAttribute('role','menu');const item=document.createElement('button');item.type='button';item.textContent='Upload image';item.onclick=()=>{const input=document.createElement('input');input.type='file';input.accept='image/*';input.hidden=true;input.onchange=()=>{window.uploads++;for(const f of input.files){const img=document.createElement('img');img.width=32;img.height=32;img.src=URL.createObjectURL(f);document.querySelector('.previews').append(img);}};document.querySelector('form').append(input);menu.remove();input.click();};menu.append(item);document.body.append(menu);};
 document.querySelector('[aria-label=Send]').onclick=()=>{window.sent.push({prompt:document.querySelector('textarea').value,files:[...document.querySelector('input[type=file]').files].map(f=>f.name)});};
 </script></body></html>`;
 try{
  const file=path.join(dir,'reference.png');await fs.writeFile(file,Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR4nGP4z8DwHwAFAAH/iZk9HQAAAABJRU5ErkJggg==','base64'));
  adapter=await launchExternalBrowser({executablePath:process.env.CHROMIUM_PATH||'/usr/bin/chromium',profileDir:path.join(dir,'profile'),sessionFile:path.join(dir,'session.enc'),safeStorage:{isEncryptionAvailable:()=>false},chromium:{launchPersistentContext:async(profile,options)=>{
    context=await chromium.launchPersistentContext(profile,{...options,headless:true,args:[...(options.args||[]),'--no-sandbox']});await context.route('https://muse.ai/**',route=>route.fulfill({contentType:'text/html',body:html}));return context;
  }}});
  const page=context.pages()[0];
  const prompt='Exact scene prompt. Reference image is mandatory.';await page.locator('textarea').fill(prompt);
  assert.equal((await page.evaluate(composerAttachmentSnapshot,{composerSelector:'textarea'})).count,0);
  const before=await page.evaluate(imageSources);
  await adapter.upload('input[type=file]',[file],{composerSelector:'textarea'});
  await page.waitForFunction(()=>{const img=document.querySelector('.previews img');return img?.complete&&img.naturalWidth>0;});
  const snapshot=await page.evaluate(composerAttachmentSnapshot,{composerSelector:'textarea'});assert.equal(snapshot.count,1);assert.equal(snapshot.loaded,true);
  const ready=await page.evaluate(attachmentState,{before,count:1,composerSelector:'textarea',selector:'',submitSelector:''});assert.equal(ready.ready,true);assert.deepEqual(ready.tokens,snapshot.tokens);
  await page.evaluate(beginTracking,{id:'scene',prompt});await page.evaluate(submitPrompt,{id:'scene',composerSelector:'textarea',attachmentTokens:snapshot.tokens});
  assert.deepEqual(await page.evaluate(()=>window.sent),[{prompt,files:['reference.png']}]);assert.equal(await page.evaluate(()=>window.uploads),1);assert.equal(await page.evaluate(()=>window.opens),1);
  // After sending the DOM may unmount the input but keep the same composer.
  await page.evaluate(()=>{document.querySelector('input[type=file]').remove();document.querySelector('.previews').replaceChildren();});
  await adapter.upload('input[type=file]',[file],{composerSelector:'textarea'});assert.equal(await page.evaluate(()=>window.opens),2);assert.equal(await page.evaluate(()=>window.uploads),2);
  // Existing hidden inputs need no attach/menu click.
  await adapter.upload('input[type=file]',[file],{composerSelector:'textarea'});assert.equal(await page.evaluate(()=>window.opens),2);
  await page.evaluate(()=>{const extra=document.createElement('input');extra.type='file';document.querySelector('form').append(extra);});
  await assert.rejects(adapter.upload('input[type=file]',[file],{composerSelector:'textarea'}),/duy nhất/);
  await page.setContent('<form><textarea></textarea><button type="button">+</button><button type="button">+</button></form>');
  await assert.rejects(page.evaluate(ensureAttachmentInput,{composerSelector:'textarea',reset:true}),/nhiều nút/);
  console.log('PASS: real composer + menu creates hidden input, intercepted chooser attaches exact file once, preview tokens match send validation, exact prompt sent, repeated scene reopens menu, existing/ambiguous inputs guarded. No live Muse.');
 }finally{await adapter?.close();await fs.rm(dir,{recursive:true,force:true});}
})().catch(e=>{console.error(e);process.exitCode=1;});
