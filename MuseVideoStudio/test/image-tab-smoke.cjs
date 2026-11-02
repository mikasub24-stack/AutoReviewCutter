// Real Chromium UI test with mocked IPC for the "Tạo ảnh" tab; no Muse calls.
const{chromium}=require('playwright-core'),http=require('http'),fs=require('fs/promises'),path=require('path'),assert=require('assert/strict');
(async()=>{
 const server=http.createServer(async(req,res)=>{const map={'/assets/muse-studio.svg':'assets/muse-studio.svg','/assets/zalo-qr.jpg':'assets/zalo-qr.jpg','/':'index.html','/style.css':'style.css','/renderer.js':'renderer.js','/ui-i18n.js':'ui-i18n.js','/script-planner.js':'script-planner.js','/prompt-import.js':'prompt-import.js','/reference-map.js':'reference-map.js'},name=map[req.url];if(!name){res.writeHead(404);return res.end();}res.setHeader('Content-Type',name.endsWith('.jpg')?'image/jpeg':name.endsWith('.svg')?'image/svg+xml':name.endsWith('.js')?'application/javascript':name.endsWith('.css')?'text/css':'text/html');res.end(await fs.readFile(path.join(__dirname,'../src',name)));});
 await new Promise(r=>server.listen(0,'127.0.0.1',r));const browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH||'/usr/bin/chromium',headless:true,args:['--no-sandbox']});
 try{
  const page=await browser.newPage({viewport:{width:1450,height:1100}}),errors=[];page.on('pageerror',e=>errors.push(e.message));page.on('dialog',d=>d.accept());
  await page.addInitScript(()=>{localStorage.setItem('museStudio.language','vi');
   const done=(kind,n,output,extra={})=>({id:kind+n,kind,status:'completed',stage:'completed',order:n,number:n,prompt:kind+' prompt '+n,title:'Prompt '+n,references:[],output,...extra});
   const s={version:'1.2.0',jobs:[done('video',1,'C:\\Videos\\001.mp4'),{...done('video',2,''),status:'pending',stage:'pending'},done('image',1,'C:\\Videos\\Anh\\001_1.png',{outputs:['C:\\Videos\\Anh\\001_1.png','C:\\Videos\\Anh\\001_2.png']}),{...done('image',2,''),status:'pending',stage:'pending'}],active:false,paused:true,license:{status:'trial',device:'TESTDEVICE',expiresAt:Date.now()+86400000,message:'Dùng thử 24 giờ'},settings:{browserChoice:'builtin',browserPath:'',output:'C:\\Videos',autoMerge:false,autoPackage:false,ffmpeg:'ffmpeg',accountCount:2,composer:'textarea',fileInput:'input[type=file]',submit:'',video:'video',image:'img',attachmentReadySelector:'',timeoutMinutes:15}};
   window.calls=[];let listener,id=100;
   window.studio={onUpdate:fn=>listener=fn,invoke:async(name,data)=>{
    window.calls.push({name,data});
    if(name==='add')s.jobs.push(...data.map(j=>({...j,id:String(++id),status:'pending',stage:'pending'})));
    if(name==='start'){s.active=true;s.paused=false;}
    if(name==='stop'){s.active=false;s.paused=true;}
    return structuredClone(s);
   }};
  });
  await page.goto(`http://127.0.0.1:${server.address().port}/`);
  const cards=()=>page.locator('.card');
  // Video tab is the default and shows only video jobs.
  await page.waitForFunction(()=>document.querySelectorAll('.card').length>0);
  assert.equal(await page.locator('#headingText').textContent(),'Danh sách tạo video');
  assert.equal(await cards().count(),2);assert.equal(await page.locator('#outputTools').isVisible(),true);
  assert.equal(await page.locator('#navCount').textContent(),'2');assert.equal(await page.locator('#navImageCount').textContent(),'2');
  assert.equal(await page.locator('#imagePrefixControl').isVisible(),false);
  assert.match(await page.locator('#summary').textContent(),/^1 \/ 2 video đã lưu$/);
  // Image tab: its own jobs, summary, folder and result picture; no merge/CapCut tools.
  await page.locator('#navImage').click();
  assert.equal(await page.locator('#headingText').textContent(),'Danh sách tạo ảnh');
  assert.equal(await cards().count(),2);assert.equal(await page.locator('#outputTools').isVisible(),false);
  await page.locator('#toggleEditor').click();assert.equal(await page.locator('#imagePrefixControl').isVisible(),true);
  assert.match(await page.locator('#summary').textContent(),/^1 \/ 2 ảnh đã lưu$/);
  assert.equal(await page.locator('#folderPath').textContent(),'C:\\Videos\\Anh');
  assert.match(await page.locator('#footNote').textContent(),/Anh/);
  assert.match(await page.locator('#createDrafts').textContent(),/Tạo ảnh/);
  const photo=page.locator('.card[data-job-id="image1"] img.resultImage');assert.equal(await photo.count(),1);assert.match(await photo.getAttribute('src'),/^file:\/\/\/C:\/Videos\/Anh\/001_1\.png$/);
  assert.equal(await page.locator('.card[data-job-id="image1"] video').count(),0);
  assert.match(await page.locator('.card[data-job-id="image1"] .fileLine').textContent(),/001_1\.png \(\+1 ảnh\)/);
  assert.match(await page.locator('.card[data-job-id="image1"] .stageName').textContent(),/Đã lưu xong ảnh/);
  assert.equal(await page.locator('.card[data-job-id="video1"]').count(),0,'thẻ video không hiện ở tab ảnh');
  assert.equal(await page.locator('#importMode option[value=script]').isDisabled(),true);
  // New image prompts carry kind=image and the optional prefix; Start only asks for image jobs.
  await page.locator('#imagePrefix').fill('Tạo ảnh: ');await page.locator('#importMode').selectOption('lines');
  await page.locator('#prompts').fill('Con mèo xanh\nTạo ảnh: Con chó đỏ');await page.locator('#referenceMode').selectOption('none');await page.locator('#add').click();
  assert.match(await page.locator('#importInfo').textContent(),/Tạo ảnh\.$/);
  await page.locator('#commitDrafts').click();await page.waitForFunction(()=>window.calls.some(c=>c.name==='add'));
  const added=await page.evaluate(()=>window.calls.find(c=>c.name==='add').data);
  assert.deepEqual(added.map(j=>j.kind),['image','image']);assert.deepEqual(added.map(j=>j.prompt),['Tạo ảnh: Con mèo xanh','Tạo ảnh: Con chó đỏ']);
  assert.equal(await cards().count(),4);assert.equal(await page.locator('#navImageCount').textContent(),'4');assert.equal(await page.locator('#navCount').textContent(),'2');
  await page.locator('#start').click();await page.waitForFunction(()=>window.calls.some(c=>c.name==='start'));
  assert.deepEqual(await page.evaluate(()=>window.calls.find(c=>c.name==='start').data),{kind:'image'});
  await page.locator('#openOutput').click();assert.deepEqual(await page.evaluate(()=>window.calls.find(c=>c.name==='openOutput').data),{kind:'image'});
  // Clearing acts on the visible tab only.
  await page.locator('.queueMenu summary').click();await page.locator('#clearPending').click();
  assert.deepEqual(await page.evaluate(()=>window.calls.filter(c=>c.name==='clearPending').at(-1).data),{kind:'image'});
  await page.locator('#clearList').click();assert.deepEqual(await page.evaluate(()=>window.calls.filter(c=>c.name==='clearList').at(-1).data),{kind:'image'});
  // The chosen tab survives a reload; switching back restores the video view.
  await page.reload();await page.waitForFunction(()=>document.querySelectorAll('.card').length>0);
  assert.equal(await page.locator('#headingText').textContent(),'Danh sách tạo ảnh');assert.equal(await page.locator('#imagePrefix').inputValue(),'Tạo ảnh: ');
  await page.locator('#navQueue').click();
  assert.equal(await page.locator('#headingText').textContent(),'Danh sách tạo video');assert.equal(await page.locator('#outputTools').isVisible(),true);assert.equal(await cards().count(),2);
  await page.locator('#start').click();assert.deepEqual(await page.evaluate(()=>window.calls.filter(c=>c.name==='start').at(-1).data),{kind:'video'});
  // English labels exist for the new tab.
  await page.locator('#languagePicker').selectOption('en');await page.locator('#navImage').click();
  assert.equal(await page.locator('#headingText').textContent(),'Image workspace');assert.match(await page.locator('#navImage').textContent(),/Create images/);
  assert.match(await page.locator('#summary').textContent(),/images saved/);assert.match(await page.locator('#footNote').textContent(),/Images are saved/);
  assert.deepEqual(errors,[]);
  console.log('PASS: image tab — own jobs/counts/summary/folder, picture preview, prefix + kind on add, kind on start/open folder, merge tools hidden, tab remembered, English labels.');
 }finally{await browser.close();server.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
