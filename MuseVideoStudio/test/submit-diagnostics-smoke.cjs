const{chromium}=require('playwright-core');
const assert=require('node:assert/strict');
const{submitPrompt}=require('../src/submit-prompt.cjs');
const{chatDiagnostics}=require('../src/chat-diagnostics.cjs');
(async()=>{
 const browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH||'/usr/bin/chromium',headless:true,args:['--no-sandbox']});
 try{
  const page=await browser.newPage();
  await page.setContent(`<aside><button>Send invite</button></aside><div role="log"><button>Send</button></div><form><textarea>PRIVATE_PROMPT_SECRET</textarea><button type="button" id="plus">+</button><button type="button" id="send"><svg><path d="m5 12 7-7 7 7"/><path d="M12 19V5"/></svg></button></form>`);
  await page.evaluate(()=>{globalThis[Symbol.for('MuseVideoStudio.promptTrackers.v1')]=new Map([['one',{prompt:'PRIVATE_PROMPT_SECRET'}]]);globalThis.sent=0;document.getElementById('send').onclick=()=>{globalThis.sent++;document.querySelector('textarea').value='';};});
  assert.equal((await page.evaluate(submitPrompt,{id:'one',composerSelector:'textarea'})).clicked,true);assert.equal(await page.evaluate(()=>globalThis.sent),1);assert.equal(await page.locator('textarea').inputValue(),'');
  await page.locator('textarea').fill('PRIVATE_PROMPT_SECRET');await page.locator('#send').evaluate(e=>e.disabled=true);
  await assert.rejects(page.evaluate(submitPrompt,{id:'one',composerSelector:'textarea'}),/chưa sẵn sàng/);assert.equal(await page.locator('textarea').inputValue(),'PRIVATE_PROMPT_SECRET');
  await page.locator('#send').evaluate(e=>{e.disabled=false;const second=e.cloneNode(true);second.id='second-send';e.parentElement.append(second);});
  await assert.rejects(page.evaluate(submitPrompt,{id:'one',composerSelector:'textarea'}),/duy nhất/);assert.equal(await page.evaluate(()=>globalThis.sent),1);
  await assert.rejects(page.evaluate(submitPrompt,{id:'missing',composerSelector:'textarea'}),/đã dừng/);
  await page.evaluate(()=>{const a=document.createElement('a');a.href='https://example.test/file.mp4?token=SECRET_TOKEN';a.title='PRIVATE_PROMPT_SECRET';a.innerHTML='<img alt="PRIVATE_PROMPT_SECRET">';document.body.append(a);});
  const report=await page.evaluate(chatDiagnostics,{jobs:[{id:'job',prompt:'PRIVATE_PROMPT_SECRET'}],composerSelector:'textarea'}),json=JSON.stringify(report);
  assert.ok(report.composers.length);assert.ok(report.media.length);assert.equal(json.includes('PRIVATE_PROMPT_SECRET'),false);assert.equal(json.includes('SECRET_TOKEN'),false);assert.equal(json.includes('https://'),false);
  console.log('PASS: actual Muse-style send arrow clicked once, draft preserved for disabled/ambiguous controls, canceled token blocked, diagnostic input/prompt/URL redaction.');
 }finally{await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
