// Chromium UI smoke with mocked IPC: nút «Dừng cảnh này» / «Tạo lại ngay» trên thẻ cảnh ĐANG CHẠY (1.6.8). Không gửi gì tới Muse.
const {chromium}=require('playwright-core');
const http=require('node:http'),fs=require('node:fs/promises'),path=require('node:path'),assert=require('node:assert/strict');
const root=path.resolve(__dirname,'../src');
(async()=>{
  const server=http.createServer(async(req,res)=>{const name=req.url==='/'?'index.html':req.url.slice(1);if(!['assets/muse-studio.svg','index.html','style.css','renderer.js','ui-i18n.js','prompt-import.js','reference-map.js','story-plan.js','story-ui.js','script-planner.js'].includes(name)){res.writeHead(404);return res.end();}res.setHeader('Content-Type',name.endsWith('.svg')?'image/svg+xml':name.endsWith('.js')?'application/javascript':name.endsWith('.css')?'text/css':'text/html');res.end(await fs.readFile(path.join(root,name)));});
  await new Promise(r=>server.listen(0,'127.0.0.1',r));
  const browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH||'/usr/bin/chromium',headless:true,args:['--no-sandbox']});
  try{
    const page=await browser.newPage({viewport:{width:1436,height:886}}),errors=[];
    page.on('pageerror',e=>errors.push(e.message));
    const dialogs=[];let accept=true;page.on('dialog',d=>{dialogs.push(d.message());accept?d.accept():d.dismiss();});
    await page.addInitScript(()=>{
      localStorage.setItem('museStudio.language','vi');let listener;window.calls=[];
      window.s={jobs:[
        {id:'stuck',number:1,title:'Cảnh 01',prompt:'p1',references:[],status:'running',stage:'waiting',stageMessage:'Muse chậm hơn thời gian dự kiến · vẫn giữ cảnh này. Đã thấy tin nhắn · chờ Muse phản hồi',startedAt:Date.now()-954000,account:1,mayHaveSubmitted:true,late:true},
        {id:'busy',number:2,title:'Cảnh 02',prompt:'p2',references:[],status:'running',stage:'waiting',stageMessage:'',startedAt:Date.now()-20000,account:2,mayHaveSubmitted:true},
        {id:'done',number:3,title:'Cảnh 03',prompt:'p3',references:[],status:'completed',stage:'completed',output:'C:/Videos/003.mp4',finishedAt:Date.now()},
        {id:'next',number:4,title:'Cảnh 04',prompt:'p4',references:[],status:'pending'}],
        active:true,paused:false,browserTests:[],settings:{output:'C:/Videos',browserChoice:'builtin',browserPath:'',accountCount:2,composer:'textarea',fileInput:'input',submit:'',video:'video',attachmentReadySelector:'',timeoutMinutes:15,ffmpeg:'ffmpeg',autoMerge:false,autoPackage:false}};
      window.push=()=>listener(structuredClone(window.s));
      window.studio={onUpdate:fn=>listener=fn,invoke:async(name,data)=>{window.calls.push({name,data});return structuredClone(window.s);}};
    });
    await page.goto(`http://127.0.0.1:${server.address().port}/`);
    await page.waitForSelector('[data-job-id="stuck"]');
    const btn=(id,label)=>page.locator(`[data-job-id=${id}] .cardActions button`).filter({hasText:label});
    // chỉ cảnh ĐANG CHẠY có 2 nút; cảnh xong / đang chờ thì không
    for(const id of ['stuck','busy']){assert.equal(await btn(id,/^Dừng cảnh này$/).isVisible(),true,id);assert.equal(await btn(id,/^Tạo lại ngay$/).isVisible(),true,id);}
    for(const id of ['done','next']){assert.equal(await btn(id,/^Dừng cảnh này$/).isVisible(),false,id);assert.equal(await btn(id,/^Tạo lại ngay$/).isVisible(),false,id);}
    if(process.env.MUSE_CARD_SHOT)await page.locator('#jobs').screenshot({path:process.env.MUSE_CARD_SHOT});
    // từ chối xác nhận -> không gửi lệnh
    accept=false;await btn('stuck',/^Dừng cảnh này$/).click();
    assert.equal(await page.evaluate(()=>window.calls.filter(c=>c.name==='cancelJob').length),0);
    // đồng ý -> gửi đúng id + mode
    accept=true;await btn('stuck',/^Dừng cảnh này$/).click();
    assert.deepEqual(await page.evaluate(()=>window.calls.filter(c=>c.name==='cancelJob').map(c=>c.data)),[{id:'stuck',mode:'skip'}]);
    await btn('busy',/^Tạo lại ngay$/).click();
    assert.deepEqual(await page.evaluate(()=>window.calls.filter(c=>c.name==='cancelJob').map(c=>c.data)),[{id:'stuck',mode:'skip'},{id:'busy',mode:'again'}]);
    assert.equal(dialogs.length,3);
    // đang dừng cả hàng đợi -> nút khóa
    await page.evaluate(()=>{window.s.stopping=true;window.push();});
    assert.equal(await btn('stuck',/^Dừng cảnh này$/).isDisabled(),true);assert.equal(await btn('busy',/^Tạo lại ngay$/).isDisabled(),true);
    // cảnh đã bị dừng (interrupted) -> hai nút biến mất, hiện «Gửi lại prompt»
    await page.evaluate(()=>{window.s.stopping=false;window.s.active=false;Object.assign(window.s.jobs[0],{status:'interrupted',stage:'interrupted',error:'Đã dừng cảnh này.'});window.push();});
    assert.equal(await btn('stuck',/^Dừng cảnh này$/).isVisible(),false);assert.equal(await btn('stuck',/^Gửi lại prompt$/).isVisible(),true);
    assert.deepEqual(errors,[]);
    await page.screenshot({path:process.env.MUSE_UI_SCREENSHOT||path.join(require('node:os').tmpdir(),'muse-card-cancel.png')});
    console.log('PASS: card-cancel smoke (Dừng cảnh này / Tạo lại ngay chỉ hiện trên cảnh đang chạy, đúng IPC, khóa khi đang dừng cả hàng đợi)');
  }finally{await browser.close();server.close();}
})().catch(e=>{console.error(e);process.exit(1);});
