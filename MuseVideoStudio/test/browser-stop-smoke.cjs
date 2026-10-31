const{chromium}=require('playwright-core'),assert=require('node:assert/strict');const{browserStop}=require('../src/browser-stop.cjs');
(async()=>{const b=await chromium.launch({executablePath:process.env.CHROMIUM_PATH||'/usr/bin/chromium',headless:true,args:['--no-sandbox']});try{
 const p=await b.newPage();await p.setContent('<nav><button aria-label="Stop">Stop</button></nav><article id="response"></article><form><textarea></textarea><button type="button" aria-label="Stop generating" id="stop">■</button></form>');
 await p.evaluate(()=>{globalThis.clicks=0;globalThis[Symbol.for('MuseVideoStudio.promptTrackers.v1')]=new Map([['attempt',{poll:()=>({ready:false}),responseRoot:document.getElementById('response')}]]);document.getElementById('stop').onclick=()=>{globalThis.clicks++;document.getElementById('stop').hidden=true;document.getElementById('response').textContent='Generation canceled';};});
 const args={composerSelector:'textarea',trackerId:'attempt'};assert.equal((await p.evaluate(browserStop,{...args,request:true})).state,'requested');assert.equal((await p.evaluate(browserStop,args)).state,'confirmed');assert.equal(await p.evaluate(()=>globalThis.clicks),1);
 assert.equal((await p.evaluate(browserStop,{composerSelector:'textarea',trackerId:'missing'})).state,'unavailable');
 await p.evaluate(()=>{globalThis[Symbol.for('MuseVideoStudio.promptTrackers.v1')].get('attempt').poll=()=>({ready:true});document.getElementById('stop').hidden=false;});
 assert.equal((await p.evaluate(browserStop,{...args,requestId:'second-gesture',request:true})).state,'completed');assert.equal(await p.evaluate(()=>globalThis.clicks),2);
 await p.evaluate(()=>{globalThis[Symbol.for('MuseVideoStudio.promptTrackers.v1')].get('attempt').poll=()=>({ready:false});document.getElementById('stop').hidden=false;document.getElementById('response').textContent='Creating';document.getElementById('stop').onclick=()=>{};});
 assert.equal((await p.evaluate(browserStop,{...args,requestId:'third-gesture',request:true})).state,'requested');assert.equal((await p.evaluate(browserStop,{...args,requestId:'third-gesture'})).state,'generating');
 console.log('PASS: only active composer Stop clicked; cancellation observed, missing stop not confirmed, completed video preserved, lagging stop remains unconfirmed.');
}finally{await b.close();}})().catch(e=>{console.error(e);process.exitCode=1;});
