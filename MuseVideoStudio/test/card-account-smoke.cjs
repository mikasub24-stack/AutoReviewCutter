// Chromium UI smoke with mocked IPC: (1) dải «Đang làm» liệt kê từng cảnh đang chạy, bấm để nhảy tới đúng thẻ, cảnh quá ngưỡng báo chậm có ⚠;
// (2) ô chọn tài khoản cạnh «Thử TK khác» (thẻ đang chạy) và «Tạo lại» (thẻ khác), gửi đúng dữ liệu IPC. Không gửi gì tới Muse.
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
    const dialogs=[];page.on('dialog',d=>{dialogs.push(d.message());d.accept();});
    await page.addInitScript(()=>{
      localStorage.setItem('museStudio.language','vi');let listener;window.calls=[];
      const many=Array.from({length:120},(_,i)=>({id:'s'+(i+1),number:i+1,title:'Cảnh '+String(i+1).padStart(3,'0'),prompt:'p'+(i+1),references:[],status:'completed',stage:'completed',output:'C:/Videos/'+(i+1)+'.mp4',finishedAt:Date.now(),account:(i%5)+1}));
      Object.assign(many[43],{status:'running',stage:'waiting',output:'',startedAt:Date.now()-20*60000,account:3,mayHaveSubmitted:true});   // kẹt 20 phút (quá ngưỡng 15)
      Object.assign(many[99],{status:'running',stage:'waiting',output:'',startedAt:Date.now()-45000,account:5,mayHaveSubmitted:true});
      window.s={jobs:many,active:true,paused:false,browserTests:[],resting:[],settings:{output:'C:/Videos',browserChoice:'builtin',browserPath:'',accountCount:5,composer:'textarea',fileInput:'input',submit:'',video:'video',attachmentReadySelector:'',timeoutMinutes:15,ffmpeg:'ffmpeg',autoMerge:false,autoPackage:false,dispatchMode:'parallel',cooldownSeconds:3,language:'vi'},accounts:[],version:'test'};
      window.push=()=>listener(structuredClone(window.s));
      window.studio={onUpdate:fn=>listener=fn,invoke:async(name,data)=>{window.calls.push({name,data});return structuredClone(window.s);}};
    });
    await page.addInitScript(()=>{localStorage.setItem('museStudio.mode','video');});
    await page.goto(`http://127.0.0.1:${server.address().port}/`);
    await page.waitForSelector('[data-job-id="s44"]');
    const calls=name=>page.evaluate(n=>window.calls.filter(c=>c.name===n).map(c=>c.data),name);

    // ---- dải «Đang làm»
    const chips=page.locator('#runningNow .runChip');
    assert.equal(await chips.count(),2);
    assert.equal(await page.locator('#runningNow').isVisible(),true);
    const texts=await chips.allTextContents();
    assert.match(texts[0],/^⚠ #44 · TK 3 · 2\d:\d\d$/,texts[0]);
    assert.match(texts[1],/^#100 · TK 5 · 0:\d\d$/,texts[1]);
    assert.equal(await chips.nth(0).evaluate(e=>e.classList.contains('slow')),true,'quá ngưỡng báo chậm thì tô đỏ');
    assert.equal(await chips.nth(1).evaluate(e=>e.classList.contains('slow')),false);
    // bấm chip -> thẻ đó nằm trong khung nhìn và được nháy sáng
    const inView=id=>page.evaluate(i=>{const c=document.querySelector(`[data-job-id=${i}]`).getBoundingClientRect(),g=document.getElementById('jobs').getBoundingClientRect();return Math.abs(c.top-g.top)<=4&&g.top>=0&&g.top<innerHeight-60;},id);   // đầu thẻ nằm ở đầu danh sách, danh sách đang hiện trên màn hình
    await chips.nth(1).click();
    await page.waitForFunction(()=>document.querySelector('[data-job-id=s100]').classList.contains('flash'));
    await page.waitForTimeout(2200);
    assert.equal(await inView('s100'),true,'đầu thẻ #100 phải lên đầu danh sách sau khi bấm chip');
    await page.locator('#runningCount').click();
    await page.waitForFunction(()=>document.querySelector('[data-job-id=s44]').classList.contains('flash'));
    await page.waitForTimeout(2200);
    assert.equal(await inView('s44'),true,'bấm «2 đang làm» nhảy tới cảnh đầu tiên đang chạy');
    // thời gian chạy nhích theo từng giây, cảnh xong thì chip biến mất
    const before=(await chips.nth(1).textContent());await page.waitForTimeout(2100);
    assert.notEqual(await chips.nth(1).textContent(),before,'đồng hồ trên chip tiếp tục chạy');
    await page.evaluate(()=>{Object.assign(window.s.jobs[99],{status:'completed',stage:'completed',output:'C:/Videos/100.mp4',finishedAt:Date.now()});window.push();});
    await page.waitForFunction(()=>document.querySelectorAll('#runningNow .runChip').length===1);
    await page.evaluate(()=>{Object.assign(window.s.jobs[99],{status:'running',stage:'waiting',output:'',startedAt:Date.now()-45000});window.push();});
    await page.waitForFunction(()=>document.querySelectorAll('#runningNow .runChip').length===2);

    // ---- «Thử TK khác» + ô chọn TK trên thẻ đang chạy
    const sel=id=>page.locator(`[data-job-id=${id}] .previewActions select.acctSel`);
    assert.equal(await sel('s44').isVisible(),true);
    assert.deepEqual(await sel('s44').locator('option').allTextContents(),['Sang TK: tự chọn','Sang TK 1','Sang TK 2','Sang TK 4','Sang TK 5'],'không liệt kê chính TK 3 đang kẹt');
    const other=id=>page.locator(`[data-job-id=${id}] .previewActions button`).filter({hasText:/^Thử TK khác$/});
    await other('s44').click();   // để mặc định: như trước
    await sel('s44').selectOption('5');
    await other('s44').click();
    assert.deepEqual(await calls('cancelJob'),[{id:'s44',mode:'other'},{id:'s44',mode:'other',account:5}]);
    assert.match(dialogs.at(-1),/TK 3 .* sang TK 5/,'câu hỏi xác nhận nêu rõ TK nguồn và TK đích');
    // đẩy trạng thái mới (tiến độ) không làm mất lựa chọn đang chọn
    await page.evaluate(()=>{window.s.jobs[43].stageMessage='đang chờ';window.push();});
    assert.equal(await sel('s44').inputValue(),'5','cập nhật tiến độ không đặt lại ô chọn TK');

    // ---- «Tạo lại» + ô chọn TK trên thẻ đã xong / lỗi
    const redo=id=>page.locator(`[data-job-id=${id}] .cardActions button`).filter({hasText:/^Tạo lại$/});
    const sel2=id=>page.locator(`[data-job-id=${id}] .cardActions select.acctSel`);
    await page.locator('[data-job-id=s7]').scrollIntoViewIfNeeded();
    assert.equal(await sel2('s7').isVisible(),true);
    assert.deepEqual(await sel2('s7').locator('option').allTextContents(),['Chạy ở TK 2 (cũ)','Chạy ở TK 1','Chạy ở TK 3','Chạy ở TK 4','Chạy ở TK 5']);
    await redo('s7').click();
    assert.deepEqual((await calls('regenerate')).at(-1),'s7','không chọn TK thì gửi như cũ (chỉ id)');
    await sel2('s7').selectOption('4');
    await redo('s7').click();
    assert.deepEqual((await calls('regenerate')).at(-1),{id:'s7',account:4});
    // cảnh lỗi cũng có ô chọn; đặt ngay cạnh «Tạo lại»
    await page.evaluate(()=>{Object.assign(window.s.jobs[9],{status:'failed',stage:'failed',error:'lỗi',output:''});window.s.active=false;window.push();});
    assert.equal(await sel2('s10').isVisible(),true);
    assert.equal(await page.evaluate(()=>{const s=document.querySelector('[data-job-id=s10] .cardActions select.acctSel');return s.nextElementSibling?.textContent;}),'Tạo lại','ô chọn nằm ngay trước nút «Tạo lại»');
    // cảnh chờ gắn TK đích hiện trong dòng thông tin
    await page.evaluate(()=>{Object.assign(window.s.jobs[43],{status:'pending',stage:'',wantAccount:4});window.push();});
    assert.match(await page.locator('[data-job-id=s44] .meta').textContent(),/sẽ chạy ở TK 4/);
    // chỉ 1 tài khoản: không có ô chọn
    await page.evaluate(()=>{window.s.settings.accountCount=1;window.push();});
    assert.equal(await page.locator('select.acctSel:visible').count(),0);
    await page.evaluate(()=>{window.s.settings.accountCount=5;window.push();});

    // ---- tiếng Anh
    await page.evaluate(()=>window.studioI18n.setLanguage('en'));
    await page.waitForTimeout(300);
    assert.match(await page.locator('#runningNow').textContent(),/Processing:/);
    assert.match(await page.locator('#runningNow .runChip').first().textContent(),/#100 · Account 5 · \d+:\d\d/);
    assert.deepEqual(await sel2('s7').locator('option').allTextContents(),['Run on account 2 (previous)','Run on account 1','Run on account 3','Run on account 4','Run on account 5']);
    assert.equal(await sel('s100').locator('option').first().textContent(),'Move to: any account');
    assert.deepEqual(errors,[]);
    console.log('PASS: card-account smoke (dải Đang làm + nhảy tới thẻ + ⚠ quá hạn; ô chọn TK cho «Thử TK khác» / «Tạo lại», đúng IPC, không mất lựa chọn khi cập nhật, EN)');
  }finally{await browser.close();server.close();}
})().catch(e=>{console.error(e);process.exit(1);});
