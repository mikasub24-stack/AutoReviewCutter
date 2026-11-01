// Real DOM handshake fixture. No Muse service/account is contacted.
const {chromium}=require('playwright-core');
const assert=require('node:assert/strict');
const {prepareBrowserProbe,verifyBrowserTest}=require('../src/browser-probe.cjs');
const {beginTracking,pollBrowserProbe,endTracking}=require('../src/muse-tracker.cjs');
const {submitPrompt}=require('../src/submit-prompt.cjs');
(async()=>{
 const browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH||'/usr/bin/chromium',headless:true,args:['--no-sandbox']});
 try{
  const page=await browser.newPage();
  await page.setContent('<main><div class="messages"><div>Old user</div><div>Old reply</div></div><form><textarea></textarea><button aria-label="Send" type="button">↑</button></form></main><aside>Unrelated</aside>');
  await page.evaluate(()=>{document.querySelector('button').onclick=()=>{const e=document.querySelector('textarea'),bubble=document.createElement('div');bubble.textContent=e.value;document.querySelector('.messages').append(bubble);e.value='';};});
  const text='Bắt đầu công việc mới nhé';
  await page.locator('textarea').fill('Unsent private draft');
  await assert.rejects(page.evaluate(prepareBrowserProbe,{composerSelector:'textarea',text}),/bản nháp/);
  assert.equal(await page.locator('textarea').inputValue(),'Unsent private draft');
  await page.locator('textarea').fill('');
  await page.evaluate(()=>{const img=document.createElement('img');img.src='data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10"></svg>';document.querySelector('form').append(img);});
  await assert.rejects(page.evaluate(prepareBrowserProbe,{composerSelector:'textarea',text}),/ảnh đính kèm/);
  await page.evaluate(()=>document.querySelector('form img').remove());
  assert.equal(await page.evaluate(prepareBrowserProbe,{composerSelector:'textarea',text}),true);
  await page.evaluate(beginTracking,{id:'probe',prompt:text});
  assert.equal((await page.evaluate(pollBrowserProbe,{id:'probe'})).echoSeen,false);
  await page.evaluate(submitPrompt,{id:'probe',composerSelector:'textarea'});
  assert.equal((await page.evaluate(pollBrowserProbe,{id:'probe'})).echoSeen,true);
  assert.equal((await page.evaluate(pollBrowserProbe,{id:'probe'})).replySeen,false);
  await page.evaluate(()=>document.querySelector('aside').append(' New sidebar update'));
  assert.equal((await page.evaluate(pollBrowserProbe,{id:'probe'})).replySeen,false);
  await page.evaluate(()=>{const e=document.createElement('div');e.textContent='…';document.querySelector('.messages').append(e);});
  assert.equal((await page.evaluate(pollBrowserProbe,{id:'probe'})).replySeen,false);
  await page.evaluate(()=>document.querySelector('.messages').lastElementChild.textContent='Sẵn sàng, bắt đầu nhé!');
  assert.equal((await page.evaluate(pollBrowserProbe,{id:'probe'})).replySeen,true);
  assert.equal(await page.evaluate(verifyBrowserTest,{token:'same-document'}),false);
  await page.evaluate(verifyBrowserTest,{token:'same-document',set:true});
  assert.equal(await page.evaluate(verifyBrowserTest,{token:'same-document'}),true);
  await page.evaluate(endTracking,{id:'probe'});await page.goto('about:blank');
  assert.equal(await page.evaluate(verifyBrowserTest,{token:'same-document'}),false);
  console.log('PASS: warmup sends only fixed sentence, preserves draft/attachments, requires fresh inline echo and meaningful reply, ignores sidebar/typing indicator, invalidates after navigation. No live Muse.');
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
