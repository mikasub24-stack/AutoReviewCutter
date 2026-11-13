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
    const btn=(id,label)=>page.locator(`[data-job-id=${id}] .previewActions button`).filter({hasText:label});
    // chỉ cảnh ĐANG CHẠY có 2 nút; cảnh xong / đang chờ thì không
    for(const id of ['stuck','busy']){assert.equal(await btn(id,/^Dừng cảnh này$/).isVisible(),true,id);assert.equal(await btn(id,/^Tạo lại ngay$/).isVisible(),true,id);}
    assert.equal(await btn('done',/^Dừng cảnh này$/).isVisible(),false);
    for(const id of ['done','next'])assert.equal(await btn(id,/^Tạo lại ngay$/).isVisible(),false,id);
    // cảnh ĐANG CHỜ (chưa chạy) cũng có «Dừng cảnh này» để giữ lại sửa / tạo lại sau; không có «Tạo lại ngay»
    assert.equal(await btn('next',/^Dừng cảnh này$/).isVisible(),true);
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
    // «Thử TK khác»: chỉ cảnh đang chạy, và chỉ khi có từ 2 tài khoản; gửi mode 'other'
    for(const id of ['stuck','busy'])assert.equal(await btn(id,/^Thử TK khác$/).isVisible(),true,id);
    for(const id of ['done','next'])assert.equal(await btn(id,/^Thử TK khác$/).isVisible(),false,id);
    await btn('stuck',/^Thử TK khác$/).click();
    assert.deepEqual(await page.evaluate(()=>window.calls.filter(c=>c.name==='cancelJob').pop().data),{id:'stuck',mode:'other'});
    assert.equal(dialogs.length,4);
    // dừng cảnh đang chờ: hỏi xác nhận, gọi holdJob với id (không gọi cancelJob)
    const cancels=()=>page.evaluate(()=>window.calls.filter(c=>c.name==='cancelJob').length);
    const cancelsBefore=await cancels();
    accept=false;await btn('next',/^Dừng cảnh này$/).click();
    assert.equal(await page.evaluate(()=>window.calls.filter(c=>c.name==='holdJob').length),0,'từ chối xác nhận thì không gửi lệnh');
    accept=true;await btn('next',/^Dừng cảnh này$/).click();
    assert.deepEqual(await page.evaluate(()=>window.calls.filter(c=>c.name==='holdJob').map(c=>c.data)),['next']);
    assert.equal(await cancels(),cancelsBefore,'cảnh chờ không đi qua cancelJob');
    // cảnh đã dừng: hiện «Gửi lại prompt» để tạo lại sau, hết nút Dừng
    await page.evaluate(()=>{Object.assign(window.s.jobs[3],{status:'interrupted',stage:'interrupted',error:'Đã dừng cảnh này.'});window.push();});
    await page.waitForFunction(()=>![...document.querySelectorAll('[data-job-id=next] .previewActions button')].some(b=>/^Dừng cảnh này$/.test(b.textContent)&&!b.hidden));
    assert.equal(await page.locator('[data-job-id=next] button').filter({hasText:/^Gửi lại prompt$/}).first().isVisible(),true);
    await page.evaluate(()=>{Object.assign(window.s.jobs[3],{status:'pending',stage:'',error:''});window.push();});
    await page.evaluate(()=>{window.s.settings.accountCount=1;window.push();});
    await page.waitForFunction(()=>![...document.querySelectorAll('[data-job-id=stuck] .previewActions button')].some(b=>/Thử TK khác/.test(b.textContent)&&!b.hidden));
    await page.evaluate(()=>{window.s.settings.accountCount=2;window.push();});
    // «Tải video lên»: hiện ở cảnh chưa xong (kể cả đang chạy), không hiện ở cảnh đã xong; cảnh đang chạy hỏi xác nhận trước
    const up=id=>page.locator(`[data-job-id=${id}] .previewActions button`).filter({hasText:/^Tải video lên$/});
    for(const id of ['stuck','busy','next'])assert.equal(await up(id).isVisible(),true,id);
    assert.equal(await up('done').isVisible(),false);
    const before=dialogs.length;
    accept=false;await up('stuck').click();
    assert.equal(await page.evaluate(()=>window.calls.filter(c=>c.name==='attachVideo').length),0,'từ chối xác nhận thì chưa mở hộp chọn file');
    accept=true;await up('stuck').click();
    await up('next').click();
    assert.deepEqual(await page.evaluate(()=>window.calls.filter(c=>c.name==='attachVideo').map(c=>c.data)),[{id:'stuck'},{id:'next'}]);
    assert.equal(dialogs.length,before+2,'cảnh đang chạy hỏi xác nhận, cảnh đang chờ thì không');
    // đang dừng cả hàng đợi -> nút khóa
    await page.evaluate(()=>{window.s.stopping=true;window.push();});
    assert.equal(await btn('stuck',/^Dừng cảnh này$/).isDisabled(),true);assert.equal(await btn('busy',/^Tạo lại ngay$/).isDisabled(),true);
    // cảnh đã bị dừng (interrupted) -> hai nút biến mất, hiện «Gửi lại prompt»
    await page.evaluate(()=>{window.s.stopping=false;window.s.active=false;Object.assign(window.s.jobs[0],{status:'interrupted',stage:'interrupted',error:'Đã dừng cảnh này.'});window.push();});
    assert.equal(await btn('stuck',/^Dừng cảnh này$/).isVisible(),false);assert.equal(await page.locator('[data-job-id=stuck] .cardActions button').filter({hasText:/^Gửi lại prompt$/}).isVisible(),true);
    // «Sửa prompt» ngay cạnh nhãn trạng thái: mọi cảnh chưa xong có nút; cảnh xong thì không.
    const edit=id=>page.locator(`[data-job-id=${id}] .cardHead .miniBtn`), panel=id=>page.locator(`[data-job-id=${id}] .promptEditor`);
    const pbtn=(id,label)=>panel(id).locator('button').filter({hasText:label});
    const editCalls=()=>page.evaluate(()=>window.calls.filter(c=>c.name==='editPrompt').map(c=>c.data));
    for(const id of ['stuck','busy','next'])assert.equal(await edit(id).isVisible(),true,id+' có nút Sửa prompt');
    assert.equal(await edit('done').isVisible(),false,'cảnh đã xong không sửa prompt');
    assert.equal(await page.locator('[data-job-id=next] .cardHead .badge').isVisible(),true,'nút nằm cùng hàng với nhãn trạng thái');
    // Cảnh chưa chạy: chỉ «Lưu» (và Hủy), ô hiện prompt hiện tại.
    await edit('next').click();
    assert.equal(await panel('next').locator('textarea').inputValue(),'p4');
    assert.equal(await pbtn('next',/^Lưu$/).isVisible(),true);assert.equal(await pbtn('next',/^Lưu và gửi lại ngay$/).isVisible(),false);assert.equal(await pbtn('next',/^Hủy$/).isVisible(),true);
    await panel('next').locator('textarea').fill('  p4 mới  ');
    await page.evaluate(()=>window.push());   // cập nhật trạng thái đang gõ dở: không bị ghi đè
    assert.equal(await panel('next').locator('textarea').inputValue(),'  p4 mới  ');
    await pbtn('next',/^Lưu$/).click();
    assert.deepEqual(await editCalls(),[{id:'next',prompt:'p4 mới',resend:false}]);
    assert.equal(await panel('next').isVisible(),false,'lưu xong thì đóng ô sửa');
    // Hủy không gửi gì; prompt rỗng bị từ chối ngay trong giao diện.
    await edit('next').click();await panel('next').locator('textarea').fill('   ');await pbtn('next',/^Lưu$/).click();
    assert.equal((await editCalls()).length,1);assert.match(await page.locator('#toast').textContent(),/Prompt không được để trống/);
    await pbtn('next',/^Hủy$/).click();assert.equal(await panel('next').isVisible(),false);assert.equal((await editCalls()).length,1);
    // Cảnh đang chạy: chỉ «Lưu và gửi lại ngay», hỏi xác nhận; từ chối thì không gửi lệnh.
    await edit('busy').click();
    assert.equal(await pbtn('busy',/^Lưu$/).isVisible(),false);assert.equal(await pbtn('busy',/^Lưu và gửi lại ngay$/).isVisible(),true);
    await panel('busy').locator('textarea').fill('p2 an toàn');
    if(process.env.MUSE_EDIT_SHOT)await page.locator('#jobs').screenshot({path:process.env.MUSE_EDIT_SHOT});
    accept=false;await pbtn('busy',/^Lưu và gửi lại ngay$/).click();assert.equal((await editCalls()).length,1,'từ chối xác nhận thì chưa gửi');
    accept=true;await pbtn('busy',/^Lưu và gửi lại ngay$/).click();
    assert.deepEqual((await editCalls()).at(-1),{id:'busy',prompt:'p2 an toàn',resend:true});
    // Cảnh bị gián đoạn: cả «Lưu» và «Lưu và gửi lại ngay».
    await edit('stuck').click();
    assert.equal(await pbtn('stuck',/^Lưu$/).isVisible(),true);assert.equal(await pbtn('stuck',/^Lưu và gửi lại ngay$/).isVisible(),true);
    await panel('stuck').locator('textarea').fill('p1 sửa');await pbtn('stuck',/^Lưu và gửi lại ngay$/).click();
    assert.deepEqual((await editCalls()).at(-1),{id:'stuck',prompt:'p1 sửa',resend:true});
    // Cảnh vừa xong khi đang sửa: ô sửa tự đóng, nút biến mất.
    await edit('next').click();assert.equal(await panel('next').isVisible(),true);
    await page.evaluate(()=>{Object.assign(window.s.jobs[3],{status:'completed',stage:'completed',output:'C:/Videos/004.mp4'});window.push();});
    assert.equal(await panel('next').isVisible(),false);assert.equal(await edit('next').isVisible(),false);
    assert.deepEqual(errors,[]);
    // «Bỏ khỏi video» (1.9.1): chỉ trên cảnh dọn nhà ĐÃ XONG; đã bỏ thì đổi nhãn, ghi rõ trên thẻ; gửi đúng storyId + số cảnh.
    const page2=await browser.newPage({viewport:{width:1436,height:886}}),errors2=[];
    page2.on('pageerror',e=>errors2.push(e.message));page2.on('dialog',d=>d.accept());
    await page2.addInitScript(()=>{
      localStorage.setItem('museStudio.language','vi');localStorage.setItem('museStudio.mode','restore');let listener;window.calls=[];
      window.s={jobs:[
        {id:'r1',kind:'restore',phase:'clip',storyId:'S1',number:1,title:'Cảnh 1',prompt:'p',references:[],status:'completed',stage:'completed',output:'C:/Videos/S1/001.mp4'},
        {id:'r2',kind:'restore',phase:'clip',storyId:'S1',number:2,title:'Cảnh 2',prompt:'p',references:[],status:'completed',stage:'completed',output:'C:/Videos/S1/002.mp4'},
        {id:'r3',kind:'restore',phase:'clip',storyId:'S1',number:3,title:'Cảnh 3',prompt:'p',references:[],status:'running',stage:'waiting',startedAt:Date.now()},
        {id:'r4',kind:'restore',phase:'image',storyId:'S1',number:1,title:'Ảnh',prompt:'p',references:[],status:'completed',stage:'completed',output:'C:/Videos/S1/img.png'}],
        active:false,paused:false,browserTests:[],restore:{busy:false,stories:{S1:{name:'S1',excluded:[2]}}},settings:{output:'C:/Videos',browserChoice:'builtin',browserPath:'',accountCount:1,composer:'textarea',fileInput:'input',submit:'',video:'video',attachmentReadySelector:'',timeoutMinutes:15,ffmpeg:'ffmpeg',autoMerge:false,autoPackage:false}};
      window.push=()=>listener(structuredClone(window.s));
      window.studio={onUpdate:fn=>listener=fn,invoke:async(name,data)=>{window.calls.push({name,data});return structuredClone(window.s);}};
    });
    await page2.goto(`http://127.0.0.1:${server.address().port}/`);
    await page2.waitForSelector('[data-job-id="r1"]');
    const ex=id=>page2.locator(`[data-job-id=${id}] .cardActions button`).filter({hasText:/^(Bỏ khỏi video|Đưa lại vào video)$/});
    assert.equal(await ex('r1').isVisible(),true,'cảnh dọn nhà đã xong có nút');
    assert.equal((await ex('r1').textContent()).trim(),'Bỏ khỏi video');
    assert.equal((await ex('r2').textContent()).trim(),'Đưa lại vào video','cảnh đã bỏ đổi nhãn');
    assert.match(await page2.locator('[data-job-id=r2] .fileLine').textContent(),/đang bỏ khỏi video/);
    assert.equal(await page2.locator('[data-job-id=r1] .fileLine').textContent().then(t=>/đang bỏ khỏi video/.test(t)),false);
    assert.equal(await ex('r3').isVisible(),false,'cảnh đang chạy chưa có clip: không có nút');
    assert.equal(await ex('r4').isVisible(),false,'ảnh nền không phải cảnh clip');
    await ex('r1').click();await ex('r2').click();
    assert.deepEqual(await page2.evaluate(()=>window.calls.filter(c=>c.name==='restoreExclude').map(c=>c.data)),[{storyId:'S1',number:1,exclude:true},{storyId:'S1',number:2,exclude:false}]);
    await page2.evaluate(()=>{window.s.active=true;window.push();});
    assert.equal(await ex('r1').isDisabled(),true,'đang chạy hàng đợi thì khóa nút');
    // Tiếng Anh: nhãn được dịch một lần và KHÔNG bị đặt lại mỗi lần cập nhật (đặt lại sẽ bắt bộ dịch dịch lại hàng trăm thẻ liên tục; CI Windows từng kẹt vì vậy).
    await page2.evaluate(()=>window.studioI18n.setLanguage('en'));
    await page2.waitForFunction(()=>[...document.querySelectorAll('[data-job-id=r1] .cardActions button')].some(b=>b.textContent.trim()==='Leave out of video'));
    const mutations=await page2.evaluate(async()=>{
      const btn=[...document.querySelectorAll('[data-job-id=r1] .cardActions button')].find(b=>b.textContent.trim()==='Leave out of video');
      let n=0;const mo=new MutationObserver(list=>{n+=list.length;});mo.observe(btn,{childList:true,characterData:true,subtree:true,attributes:false});
      for(let i=0;i<5;i++){window.push();await new Promise(r=>setTimeout(r,30));}
      await new Promise(r=>setTimeout(r,100));mo.disconnect();return n;
    });
    assert.equal(mutations,0,'nhãn nút không bị ghi lại khi cập nhật');
    // Hiệu năng giao diện tiếng Anh: thêm 420 thẻ cảnh rồi cập nhật liên tục KHÔNG được dịch lại cả trang mỗi lần
    // (trước đây mỗi lần đổi giao diện đi lại toàn bộ chữ của trang: bấm «Tạo ảnh + clip» cho 210 cảnh mất hơn 20 giây và làm test Windows quá hạn 30 giây).
    const walks=await page2.evaluate(async()=>{
      const many=[];for(let i=1;i<=420;i++)many.push({id:'m'+i,kind:'restore',phase:i%2?'clip':'image',storyId:'S1',number:i,title:'Cảnh '+i,prompt:'Prompt dài số '+i,references:[],status:'completed',stage:'completed',output:'C:/Videos/S1/'+i+'.mp4'});
      window.s.jobs=window.s.jobs.concat(many);window.s.active=false;
      const original=document.createTreeWalker.bind(document);let whole=0,partial=0;
      document.createTreeWalker=(root,...rest)=>{if(root===document.body)whole++;else partial++;return original(root,...rest);};
      for(let i=0;i<6;i++){window.push();await Promise.resolve();await new Promise(r=>setTimeout(r,0));}
      document.createTreeWalker=original;
      return {whole,partial};
    });
    assert.equal(walks.whole,0,'cập nhật thẻ không được dịch lại cả trang');
    assert.ok(walks.partial>0,'phần mới thêm vẫn được dịch');
    assert.equal(await page2.locator('.card').count()>=424,true);
    assert.match(await page2.locator('[data-job-id=m1] .cardActions').textContent(),/Leave out of video/,'thẻ thêm sau vẫn được dịch');
    assert.deepEqual(errors2,[]);
    await page2.close();
    await page.screenshot({path:process.env.MUSE_UI_SCREENSHOT||path.join(require('node:os').tmpdir(),'muse-card-cancel.png')});
    console.log('PASS: card-cancel smoke (Dừng cảnh này / Tạo lại ngay chỉ hiện trên cảnh đang chạy, đúng IPC, khóa khi đang dừng cả hàng đợi)');
  }finally{await browser.close();server.close();}
})().catch(e=>{console.error(e);process.exit(1);});
