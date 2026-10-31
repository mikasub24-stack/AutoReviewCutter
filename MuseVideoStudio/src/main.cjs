const { app, BrowserWindow, ipcMain, dialog, shell, session, safeStorage } = require('electron');
const fs = require('node:fs/promises');
const path = require('node:path');
const { Queue,stoppedError,abortable } = require('./queue.cjs');
const {imageSources,attachmentState}=require('./attachment-ready.cjs');
const {createLicense,deviceCode}=require('./license.cjs');
const {payment}=require('./payment.cjs');
let licenseManager,paymentDetails;
const { mergeVideos, checkTools } = require('./merge.cjs');
const { exportEditPackage } = require('./edit-package.cjs');
const { createSessionStore } = require('./session-store.cjs');
const { resolveBrowser } = require('./browser-discovery.cjs');
const { launchExternalBrowser } = require('./external-browser.cjs');
const { createHash,randomUUID } = require('node:crypto');
const ownsInstance = app.requestSingleInstanceLock();
if (!ownsInstance) app.quit();
app.on('second-instance', () => { if(main && !main.isDestroyed()) { if(main.isMinimized()) main.restore(); main.show(); main.focus(); } });
let packaging = false, packageProgress = '', editPackageDir = '', packageError = '';
let merging = false, mergeProgress = '', mergedOutput = '', mergeError = '';
let main, queue, settings, stateFile;
const browsers = new Map(), profiles = new Map(), opening = new Map(), externalLaunches = new Map(), browserWarnings = new Map();
let quitAllowed = false, flushingQuit = false, starting = false, runEpoch=0;
const resettingAccounts = new Set(), accountResets = new Map();
const defaults = { attachmentReadySelector:'', browserChoice: 'builtin', browserPath: '', output: '', autoMerge: false, autoPackage: false, ffmpeg: 'ffmpeg', accountCount: 2, composer: 'textarea, [contenteditable="true"][role="textbox"], [contenteditable="true"][data-placeholder]', fileInput: 'input[type="file"]', submit: '', video: 'video', timeoutMinutes: 15 };
async function atomic(file, data) { await fs.writeFile(file + '.tmp', JSON.stringify(data, null, 2)); await fs.rename(file + '.tmp', file); }
function snapshot() {
  return {jobs:queue.jobs,settings,license:licenseManager?.status(),payment:paymentDetails,starting,resettingAccounts:[...resettingAccounts],active:queue.active,paused:queue.paused,merging,mergeProgress,mergedOutput,mergeError,packaging,packageProgress,editPackageDir,packageError,
    accounts:Array.from({length:settings.accountCount},(_,index)=>{
      const browser=browsers.get(index),external=settings.browserChoice !== 'builtin';
      return {index,opened:external ? Boolean(browser?.external && !browser.isDestroyed()) : profiles.has(index),rememberSession:external ? Boolean(browser?.external && browser.isSessionEnabled()) : profiles.get(index)?.store.isEnabled() || false,warning:external ? browserWarnings.get(index) || '' : profiles.get(index)?.warning || ''};
    })};
}

function notify() { if (main && !main.isDestroyed()) main.webContents.send('studio:update', snapshot()); }
let stateWrites = Promise.resolve();
async function save() { const data = JSON.parse(JSON.stringify({ jobs: queue.jobs, settings, mergedOutput, mergeError, editPackageDir, packageError, configVersion: 2 })); const write = stateWrites.then(() => atomic(stateFile, data)); stateWrites = write.catch(() => {}); await write; }
function assertMuse(muse) {
  if (!muse || muse.isDestroyed()) throw Error('Mở Muse và đăng nhập trước khi chạy.');
  const u = new URL(muse.external ? muse.url() : muse.webContents.getURL());
  if (u.protocol !== 'https:' || !(u.hostname === 'muse.ai' || u.hostname.endsWith('.muse.ai'))) throw Error('Hãy mở trang chat trên muse.ai.');
}
async function dom(muse, fn, arg) { assertMuse(muse); if(muse.external) return muse.evaluate(fn,arg); return muse.webContents.executeJavaScript(`(${fn.toString()})(${JSON.stringify(arg)})`, true); }
async function prepareNativeProfile(index) {
  let profile=profiles.get(index);
  if(!profile) {
    const accountSession=session.fromPartition(`persist:muse-account-${index+1}`);
    profile={session:accountSession,store:null,warning:''};
    profile.store=createSessionStore({session:accountSession,safeStorage,file:path.join(app.getPath('userData'),'account-sessions',`account-${index+1}.enc`),onError:message=>{profile.warning=message;notify();}});
    profiles.set(index,profile);
    profile.ready=(async()=>{
      const status=await profile.store.restore();
      profile.warning=status.error || (!status.available ? 'Máy chưa hỗ trợ lưu mã hóa cookie phiên; cookie có thời hạn vẫn được lưu trong hồ sơ.' : '');
      profile.store.start();
    })();
  }
  await profile.ready;return profile;
}
function validAccount(index) {
  if(!Number.isInteger(index) || index<0 || index>=settings.accountCount) throw Error('Tài khoản không hợp lệ.');
}
async function ensureExternalBrowser(index) {
  const existing=browsers.get(index);
  if(existing?.external && !existing.isDestroyed()) return existing;
  if(externalLaunches.has(index)) return externalLaunches.get(index);
  const executablePath=resolveBrowser({choice:settings.browserChoice,customPath:settings.browserPath});
  const key=settings.browserChoice==='custom' ? 'custom-'+createHash('sha256').update(executablePath).digest('hex').slice(0,16) : settings.browserChoice;
  const launch=(async()=>{
    const browser=await launchExternalBrowser({executablePath,profileDir:path.join(app.getPath('userData'),'external-browser-profiles',key,`account-${index+1}`),sessionFile:path.join(app.getPath('userData'),'external-account-sessions',key,`account-${index+1}.enc`),safeStorage,deferMuseNavigation:true,onWarning:message=>{browserWarnings.set(index,message);notify();},onClosed:()=>notify()});
    if(flushingQuit) {await browser.close();return null;}
    browsers.set(index,browser);return browser;
  })();
  externalLaunches.set(index,launch);
  try{return await launch;}finally{externalLaunches.delete(index);}
}
async function openMuse(index = 0) {
  validAccount(index);
  if(resettingAccounts.size) throw Error('Chờ đăng xuất tài khoản hoàn tất trước khi mở Muse.');
  if(opening.has(index)) return opening.get(index);
  const task=(async()=>{
    try {
      const existing=browsers.get(index);
      if(existing && !existing.isDestroyed() && existing.museStarted) {
        if(!flushingQuit) await existing.show();return;
      }
      if(settings.browserChoice!=='builtin') {
        const browser=await ensureExternalBrowser(index);
        if(!browser || flushingQuit) return;
        if(flushingQuit) return;
        await browser.openMuse();browser.museStarted=true;notify();return;
      }
      const profile=await prepareNativeProfile(index);
      if(flushingQuit) return;
      if(flushingQuit) return;
      const muse=new BrowserWindow({width:1250,height:850,title:`Muse — Tài khoản ${index+1}`,webPreferences:{session:profile.session,nodeIntegration:false,contextIsolation:true,sandbox:true}});
      browsers.set(index,muse);muse.museStarted=true;
      muse.webContents.setWindowOpenHandler(()=>({action:'deny'}));
      muse.on('closed',()=>{if(flushingQuit || resettingAccounts.has(index))return;profile.store.flush().catch(()=>{profile.warning='Chưa lưu được phiên đăng nhập.';notify();});});
      await muse.loadURL('https://muse.ai/');notify();
    } catch(e) {if(!flushingQuit) throw e;}
  })();
  opening.set(index,task);
  try{await task;}finally{opening.delete(index);}
}

function accountOperationBusy() {
  return queue.active || starting || merging || packaging || opening.size || externalLaunches.size;
}
function logoutAccount(index) {
  validAccount(index);
  if(flushingQuit || accountOperationBusy() || resettingAccounts.size) throw Error('Chờ hàng đợi, kiểm tra mạng và các thao tác trình duyệt hoàn tất trước khi đăng xuất.');
  resettingAccounts.add(index);notify();
  const task=(async()=>{
    const browserName=({builtin:'Trình duyệt tích hợp',chrome:'Google Chrome',edge:'Microsoft Edge',custom:'Trình duyệt tùy chọn'})[settings.browserChoice];
    const choice=await dialog.showMessageBox(main,{type:'warning',buttons:['Hủy','Đăng xuất tài khoản này'],defaultId:0,cancelId:0,message:`Đăng xuất ${browserName} — Tài khoản ${index+1}?`,detail:'Chỉ xóa dữ liệu đăng nhập trong hồ sơ riêng của tài khoản này do Muse Studio quản lý. Các tài khoản khác, trình duyệt cá nhân và video đã tải vẫn được giữ nguyên.'});
    if(choice.response!==1) return snapshot();
    if(flushingQuit || accountOperationBusy()) throw Error('Ứng dụng đang bận. Hãy thử đăng xuất lại sau khi thao tác hiện tại hoàn tất.');
    if(settings.browserChoice!=='builtin') {
      const browser=await ensureExternalBrowser(index);
      if(!browser) throw Error('Không mở được hồ sơ tài khoản để đăng xuất.');
      await browser.clearLogin();
      browsers.delete(index);browserWarnings.delete(index);
    } else {
      const browser=browsers.get(index),profile=profiles.get(index);
      if(browser && !browser.external && !browser.isDestroyed()) browser.destroy();
      const selectedSession=profile?.session || session.fromPartition(`persist:muse-account-${index+1}`);
      if(profile) {
        await profile.ready;
        // dispose detaches cookie observers before its final serialized flush.
        // Even if that flush fails, continue clearing and deleting this backup.
        try {await profile.store.dispose();} catch {}
      }
      const clearResults=await Promise.allSettled([selectedSession.clearStorageData(),selectedSession.clearCache()]);
      try {await selectedSession.cookies.flushStore();} catch {clearResults.push({status:'rejected'});}
      try {selectedSession.flushStorageData();} catch {clearResults.push({status:'rejected'});}
      const backup=path.join(app.getPath('userData'),'account-sessions',`account-${index+1}.enc`);
      const deleteResults=await Promise.allSettled([fs.rm(backup,{force:true}),fs.rm(backup+'.tmp',{force:true})]);
      browsers.delete(index);profiles.delete(index);
      if([...clearResults,...deleteResults].some(result=>result.status==='rejected')) throw Error('Chưa xóa được đầy đủ dữ liệu đăng nhập của tài khoản đã chọn. Vui lòng thử lại.');
    }
    return snapshot();
  })();
  accountResets.set(index,task);
  return task.finally(()=>{accountResets.delete(index);resettingAccounts.delete(index);notify();});
}

async function upload(muse, files) {
  await Promise.all(files.map(file => fs.access(file))); assertMuse(muse);
  if(muse.external) return muse.upload(settings.fileInput,files);
  const debug = muse.webContents.debugger;
  if (debug.isAttached()) throw Error('Đóng DevTools của cửa sổ Muse trước khi tải ảnh.');
  debug.attach('1.3');
  try {
    const { root } = await debug.sendCommand('DOM.getDocument');
    const { nodeIds } = await debug.sendCommand('DOM.querySelectorAll', { nodeId: root.nodeId, selector: settings.fileInput });
    if (nodeIds.length !== 1) throw Error('Không xác định được ô tải ảnh. Mở nút + trên Muse hoặc chỉnh CSS selector ô tải ảnh.');
    await debug.sendCommand('DOM.setFileInputFiles', { files, nodeId: nodeIds[0] });
  } finally { debug.detach(); }
}
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
async function download(muse, url, job, signal) {
  const target = path.join(settings.output, `muse-${job.id}.mp4`);
  await fs.mkdir(settings.output, { recursive: true });
  if(muse.external) {await muse.download(url,target,{signal});await validateMp4(target);return target;}
  const session = muse.webContents.session;
  return new Promise((resolve, reject) => {
    let timer, item;
    function cleanup() { clearTimeout(timer); session.removeListener('will-download', onDownload); signal?.removeEventListener('abort',cancel); }
    function cancel(){item?.cancel();cleanup();reject(stoppedError());}
    signal?.addEventListener('abort',cancel,{once:true});
    function onDownload(event, candidate, contents) {
      if (contents !== muse.webContents || candidate.getURLChain()[0] !== url) return;
      if(signal?.aborted){candidate.cancel();cleanup();return;}
      item = candidate; item.setSavePath(target);
      item.once('done', async (_, status) => {
        cleanup();
        if (status !== 'completed') { reject(Error('Tải video chưa hoàn tất: ' + status)); return; }
        try {
          await validateMp4(target);
          resolve(target);
        } catch (e) { reject(e); }
      });
    }
    session.on('will-download', onDownload);
    timer = setTimeout(() => { cleanup(); item?.cancel(); reject(Error('Hết thời gian tải video.')); }, 180000);
    try { muse.webContents.downloadURL(url); } catch (e) { cleanup(); reject(e); }
  });
}
async function validateMp4(target) {
  const stat=await fs.stat(target),fd=await fs.open(target),bytes=Buffer.alloc(12);
  try {await fd.read(bytes,0,12,0);} finally {await fd.close();}
  if(!stat.size || bytes.toString('ascii',4,8)!=='ftyp') throw Error('Kết quả tải về không phải MP4 hợp lệ. Kiểm tra video trong Muse.');
}
async function runJob(job,slot,signal) {
  const muse=browsers.get(slot),check=()=>{if(signal.aborted)throw stoppedError();},step=promise=>abortable(promise,signal);
  check();job.account=slot+1;assertMuse(muse);
  await step(licenseManager.ensureAllowed());check();
  check();
  if(!settings.output)throw Error('Chọn thư mục lưu video trước.');
  const references=job.references?.length?job.references:job.image?[job.image]:[];
  let previous=await step(dom(muse,selector=>[...document.querySelectorAll(selector)].map(v=>v.currentSrc||v.src).filter(Boolean),settings.video));
  const before=references.length?await step(dom(muse,imageSources,null)):[];
  check();job.stage='preparing';notify();
  await step(dom(muse,({selector,prompt})=>{
    const list=[...document.querySelectorAll(selector)].filter(e=>e.getClientRects().length);
    if(list.length!==1)throw Error('Không xác định được ô nhập prompt duy nhất.');
    const e=list[0];if((e.value||e.innerText||'').trim())throw Error('Ô Muse còn bản nháp. Kiểm tra và xóa bản nháp trước khi chạy lại.');
    e.focus();
    if(e instanceof HTMLTextAreaElement||e instanceof HTMLInputElement)Object.getOwnPropertyDescriptor(e instanceof HTMLTextAreaElement?HTMLTextAreaElement.prototype:HTMLInputElement.prototype,'value').set.call(e,prompt);
    else e.textContent=prompt;
    e.dispatchEvent(new InputEvent('input',{bubbles:true,inputType:'insertText',data:prompt}));
  },{selector:settings.composer,prompt:job.prompt}));
  if(references.length){
    check();job.stage='uploading';notify();await step(upload(muse,references));
    const deadline=Date.now()+90000;let stable=0,ready=false;
    while(Date.now()<deadline){
      check();const state=await step(dom(muse,attachmentState,{before,count:references.length,selector:settings.attachmentReadySelector,submitSelector:settings.submit}));
      if(state.ready){if(!stable)stable=Date.now();if(Date.now()-stable>=1000){ready=true;break;}}else stable=0;
      await step(delay(250));
    }
    if(!ready)throw Error('Chưa xác nhận được ảnh tham chiếu sẵn sàng trong Muse. Kiểm tra ô đính kèm hoặc cấu hình selector ảnh sẵn sàng; tool chưa gửi prompt.');

  }
  check();previous=[...new Set([...previous,...await step(dom(muse,selector=>[...document.querySelectorAll(selector)].map(v=>v.currentSrc||v.src).filter(Boolean),settings.video))])];
  check();job.stage='submitting';job.mayHaveSubmitted=true;await step(save());check();
  if(settings.submit)await step(dom(muse,selector=>{const a=[...document.querySelectorAll(selector)].filter(e=>e.getClientRects().length);if(a.length!==1||a[0].disabled)throw Error('Nút gửi chưa sẵn sàng.');a[0].click();},settings.submit));
  else if(muse.external)await step(muse.pressEnter());
  else {muse.webContents.sendInputEvent({type:'keyDown',keyCode:'Return'});muse.webContents.sendInputEvent({type:'keyUp',keyCode:'Return'});}
  job.stage='waiting';notify();const deadline=Date.now()+settings.timeoutMinutes*60000;
  while(Date.now()<deadline){
    await step(delay(1500));check();
    const url=await step(dom(muse,({selector,previous})=>{const v=[...document.querySelectorAll(selector)].find(v=>{const src=v.currentSrc||v.src;return src&&!previous.includes(src)&&v.readyState>=2&&v.videoWidth>0&&v.duration>0&&Number.isFinite(v.duration);});return v?v.currentSrc||v.src:null;},{selector:settings.video,previous}));
    if(url){check();job.stage='downloading';notify();return step(download(muse,url,job,signal));}
  }
  throw Error('Hết thời gian chờ video mới. Kiểm tra Muse trước khi chạy lại.');
}

async function mergeProject() {
  if (queue.active || merging || packaging) throw Error('Chờ xử lý hiện tại hoàn tất trước khi nối.');
  if (!settings.output) throw Error('Chọn thư mục lưu video trước.');
  merging = true; mergeProgress = 'Chuẩn bị nối video…'; mergeError = ''; notify();
  try {
    mergedOutput = await mergeVideos(JSON.parse(JSON.stringify(queue.jobs)), { output: settings.output, ffmpeg: settings.ffmpeg, onProgress: text => { mergeProgress=text;notify(); } });
    mergeProgress = 'Video tổng đã hoàn tất';
  } catch(e) { mergeError=e.message;mergeProgress='Nối video chưa hoàn tất'; }
  finally { merging=false;await save();notify(); }
}
function invalidateOutputs() {
  mergedOutput='';mergeProgress='';mergeError='';editPackageDir='';packageProgress='';packageError='';
}
async function packageProject() {
  if (queue.active || merging || packaging) throw Error('Chờ xử lý hiện tại hoàn tất trước khi xuất clip.');
  if (!settings.output) throw Error('Chọn thư mục lưu video trước.');
  packaging=true;packageError='';packageProgress='Chuẩn bị gói clip rời…';notify();
  try {
    editPackageDir = await exportEditPackage(JSON.parse(JSON.stringify(queue.jobs)), {output:settings.output,onProgress:text=>{packageProgress=text;notify();}});
    packageProgress='Đã xuất clip theo thứ tự để nhập vào CapCut';
  } catch(e) { packageError=e.message;packageProgress='Xuất clip chưa hoàn tất'; }
  finally {packaging=false;await save();notify();}
}
app.whenReady().then(async () => {
  if (!ownsInstance) return;
  stateFile = path.join(app.getPath('userData'), 'studio.json');
  let stored = {};
  try { stored = JSON.parse(await fs.readFile(stateFile, 'utf8')); } catch (e) { if (e.code !== 'ENOENT') throw e; }
  settings = { ...defaults, ...stored.settings };
  // Discard obsolete IP/VPN preferences from v0.5 so they cannot gate login.
  for(const key of ['requireUSA','vpnProvider','vpnClientPath'])delete settings[key];
  await fs.mkdir(app.getPath('userData'),{recursive:true});
  const device=deviceCode();licenseManager=await createLicense({file:path.join(app.getPath('userData'),'license.enc'),safeStorage,device,publicKey:await fs.readFile(path.join(__dirname,'license-public.pem'),'utf8')});paymentDetails=await payment(device);
  // v0.2 changes the default to separate clips, including upgrades from v0.1.
  if (stored.configVersion !== 2) { settings.autoMerge = false; settings.autoPackage = false; }
  mergedOutput = stored.mergedOutput || ''; mergeError = stored.mergeError || '';
  editPackageDir = stored.editPackageDir || ''; packageError = stored.packageError || '';
  queue = new Queue({ jobs: stored.jobs || [], save, run: runJob, notify });
  await save();
  main = new BrowserWindow({ width: 1450, height: 950, minWidth: 1000, minHeight: 700, backgroundColor: '#101114', webPreferences: { preload: path.join(__dirname, 'preload.cjs'), nodeIntegration: false, contextIsolation: true, sandbox: true } });
  main.on('close',event=>{if(!quitAllowed){event.preventDefault();app.quit();}});
  main.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  main.webContents.on('will-navigate', e => e.preventDefault());
  const handlers = {
    state: () => snapshot(),
    activateKey:async token=>{await licenseManager.activate(token);notify();return snapshot();},
    add: async data => { if (merging || packaging) throw Error('Chờ xử lý đầu ra xong trước khi thêm prompt.'); invalidateOutputs(); await queue.add(data); return snapshot(); },
    retry: async id => { if (merging || packaging) throw Error('Đang xử lý đầu ra video.'); invalidateOutputs(); await queue.retry(id); return snapshot(); },
    remove: async id => { if (merging || packaging) throw Error('Đang xử lý đầu ra video.'); invalidateOutputs(); await queue.remove(id); return snapshot(); },
    browser: async index => { await openMuse(Number(index ?? 0)); return true; },
    logoutAccount: async index => {await logoutAccount(Number(index??0));return snapshot();},
    start: async () => {
      if(merging || packaging) throw Error('Đang xử lý đầu ra video.');
      if(resettingAccounts.size) throw Error('Chờ đăng xuất tài khoản hoàn tất trước khi chạy.');
      if(queue.active || starting) return snapshot();
      await licenseManager.ensureAllowed();
      const epoch=runEpoch;starting=true;notify();
      try {
        for(let i=0;i<settings.accountCount;i++) {if(epoch!==runEpoch)return snapshot();assertMuse(browsers.get(i));}
        if(settings.autoMerge) await checkTools(settings.ffmpeg);
        if(epoch!==runEpoch || flushingQuit || queue.active) return snapshot();
        queue.concurrency=settings.accountCount;
        queue.start().then(async()=>{
          if(!queue.paused && queue.jobs.length && queue.jobs.every(j=>j.status==='completed')) {
            if(settings.autoMerge) await mergeProject();else if(settings.autoPackage) await packageProject();
          }
        }).catch(e=>dialog.showErrorBox('Lỗi xử lý hàng đợi',e.message)).finally(notify);
        return snapshot();
      } finally {starting=false;notify();}
    },
    merge: async () => { await mergeProject(); return snapshot(); },
    packageClips: async () => { await packageProject(); return snapshot(); },
    openPackage: () => { if(editPackageDir) return shell.openPath(editPackageDir); },
    revealMerged: () => { if(mergedOutput) shell.showItemInFolder(mergedOutput); },
    chooseBrowser: async () => {
      const result=await dialog.showOpenDialog(main,{properties:['openFile'],title:'Chọn Chrome, Edge hoặc trình duyệt Chromium (.exe)'});
      return result.canceled ? '' : result.filePaths[0];
    },
    chooseFfmpeg: async () => {
      if(queue.active || merging || packaging) throw Error('Chờ xử lý hoàn tất trước khi đổi FFmpeg.');
      const r=await dialog.showOpenDialog(main,{properties:['openFile'],title:'Chọn ffmpeg.exe (ffprobe.exe phải ở cùng thư mục)'});
      if(!r.canceled){await checkTools(r.filePaths[0]);settings.ffmpeg=r.filePaths[0];await save();notify();}return snapshot();
    },
    pause: () => {queue.pause();notify();return snapshot();},
    stop: async()=>{runEpoch++;starting=false;await queue.stop();notify();return snapshot();},
    clearPending: async()=>{if(merging||packaging)throw Error('Chờ xử lý đầu ra hoàn tất.');invalidateOutputs();await queue.clearPending();return snapshot();},
    clearList: async()=>{if(merging||packaging)throw Error('Chờ xử lý đầu ra hoàn tất.');runEpoch++;starting=false;await queue.clearAll();invalidateOutputs();await save();notify();return snapshot();},
    applyReferences: async data=>{
      if(data?.assignments){for(const row of data.assignments){const j=queue.jobs.find(x=>x.id===row.id&&x.status==='pending');if(j){if(!Array.isArray(row.references)||row.references.some(x=>typeof x!=='string'))throw Error('Ảnh không hợp lệ.');j.references=[...row.references];j.image=j.references[0]||'';}}await queue.publish();}
      else await queue.applyReferences(data?.files||[]);return snapshot();
    },
    images: async options=>{const r=await dialog.showOpenDialog(main,{properties:options?.multiple===false?['openFile']:['openFile','multiSelections'],filters:[{name:'Ảnh',extensions:['png','jpg','jpeg','webp']}]});return r.canceled?[]:r.filePaths;},
    imageFolder: async()=>{const r=await dialog.showOpenDialog(main,{properties:['openDirectory']});if(r.canceled)return[];const entries=await fs.readdir(r.filePaths[0],{withFileTypes:true});return entries.filter(e=>e.isFile()&&/\.(png|jpe?g|webp)$/i.test(e.name)).map(e=>path.join(r.filePaths[0],e.name));},
    pasteReference: async data=>{
      const bytes=Buffer.from(data?.bytes||[]);if(!bytes.length||bytes.length>32*1024*1024)throw Error('Ảnh dán cần nhỏ hơn 32 MB.');
      const ext=bytes.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10]))?'.png':bytes[0]===255&&bytes[1]===216?'.jpg':bytes.toString('ascii',0,4)==='RIFF'&&bytes.toString('ascii',8,12)==='WEBP'?'.webp':'';
      if(!ext)throw Error('Chỉ nhận ảnh PNG, JPEG hoặc WebP.');
      const folder=path.join(app.getPath('userData'),'reference-imports');await fs.mkdir(folder,{recursive:true});const name=typeof data.name==='string'?data.name.split(/[\\/]/).pop().replace(/\.[^.]+$/,'').replace(/[^\p{L}\p{N}_-]/gu,'_').slice(0,60):'image';const file=path.join(folder,name+'_'+randomUUID()+ext);await fs.writeFile(file,bytes,{flag:'wx'});return file;
    },
    folder: async () => { if (queue.active || merging || packaging) throw Error('Chờ hàng đợi dừng trước khi đổi thư mục.'); const r = await dialog.showOpenDialog(main, { properties: ['openDirectory','createDirectory'] }); if (!r.canceled) { settings.output = r.filePaths[0]; await save(); notify(); } return snapshot(); },
    settings: async data => {
      if (resettingAccounts.size || queue.active || starting || opening.size || externalLaunches.size || merging || packaging) throw Error('Chờ tác vụ hiện tại kết thúc trước khi đổi cài đặt.');
      for (const k of ['composer','fileInput','submit','video']) { if (typeof data[k] !== 'string' || data[k].length > 2000) throw Error('Selector không hợp lệ.'); }
      if (!data.composer.trim() || !data.fileInput.trim() || !data.video.trim()) throw Error('Không được để trống selector bắt buộc.');
      const attachmentReadySelector=typeof data.attachmentReadySelector==='string'?data.attachmentReadySelector.trim():settings.attachmentReadySelector;
      if(attachmentReadySelector.length>2000)throw Error('Selector ảnh quá dài.');
      const minutes = Number(data.timeoutMinutes); if (!Number.isFinite(minutes) || minutes < 1 || minutes > 120) throw Error('Thời gian chờ phải từ 1–120 phút.');
      const accountCount = Number(data.accountCount); if (!Number.isInteger(accountCount) || accountCount < 1 || accountCount > 4) throw Error('Chọn từ 1–4 tài khoản.');
      if(typeof data.ffmpeg !== 'string' || !data.ffmpeg.trim()) throw Error('Nhập đường dẫn FFmpeg hoặc ffmpeg nếu đã thêm vào PATH.');
      if (!['keep','package','merge'].includes(data.finishAction)) throw Error('Chọn cách xử lý sau khi tạo video.');
      const browserChoice=data.browserChoice ?? settings.browserChoice,browserPath=typeof data.browserPath === 'string' ? data.browserPath.trim() : settings.browserPath;
      if(!['builtin','chrome','edge','custom'].includes(browserChoice)) throw Error('Trình duyệt không hợp lệ.');
      if(browserChoice !== settings.browserChoice || browserPath !== settings.browserPath) {
        if(opening.size || [...browsers.values()].some(browser=>!browser.isDestroyed())) throw Error('Đóng các cửa sổ tài khoản trước khi đổi trình duyệt.');
        resolveBrowser({choice:browserChoice,customPath:browserPath});
        browserWarnings.clear();
      }
      settings = { ...settings, attachmentReadySelector, browserChoice, browserPath, autoMerge: data.finishAction === 'merge', autoPackage: data.finishAction === 'package', ffmpeg: data.ffmpeg.trim(), accountCount, composer: data.composer, fileInput: data.fileInput, submit: data.submit, video: data.video, timeoutMinutes: minutes }; await save(); notify(); return snapshot();
    },
    reveal: id => { const j = queue.jobs.find(j => j.id === id); if (j?.output) shell.showItemInFolder(j.output); },
    export: async () => { const r = await dialog.showSaveDialog(main, { defaultPath: 'muse-project.json', filters: [{ name: 'JSON', extensions: ['json'] }] }); if (!r.canceled) await atomic(r.filePath, { jobs: queue.jobs }); }
  };
  for (const [name, handler] of Object.entries(handlers)) ipcMain.handle('studio:' + name, (event, data) => { if (event.sender !== main.webContents) throw Error('Unauthorized window'); return handler(data); });
  await main.loadFile(path.join(__dirname, 'index.html'));
}).catch(e => { dialog.showErrorBox('Không thể mở ứng dụng', e.message); app.quit(); });
app.on('window-all-closed', () => app.quit());
app.on('before-quit', event => {
  if (!ownsInstance || quitAllowed) return;
  event.preventDefault();
  if (flushingQuit) return;
  flushingQuit=true;runEpoch++;starting=false;main?.hide?.();
  (async () => {
    if(queue)await queue.stop();
    const closingExternal=Promise.allSettled([...browsers.values()].filter(browser=>browser.external&&!browser.isDestroyed()).map(browser=>browser.close()));
    for(const browser of browsers.values())if(!browser.external&&!browser.isDestroyed())browser.destroy();
    await Promise.allSettled([...accountResets.values()]);
    await Promise.allSettled([...externalLaunches.values()]);
    const externalResults=await closingExternal;
    const results = await Promise.allSettled([...profiles.values()].map(async profile=>{
      await profile.ready;
      const results = await Promise.allSettled([profile.store.dispose(), Promise.resolve().then(()=>profile.session.flushStorageData())]);
      if(results.some(r=>r.status==='rejected')) throw Error('Chưa lưu đủ dữ liệu phiên.');
    }));
    results.push(...externalResults);
    if (queue && stateFile) { try { await save(); } catch { results.push({status:'rejected'}); } }
    if (results.some(r=>r.status==='rejected')) dialog.showMessageBoxSync({type:'warning',message:'Một số dữ liệu hoặc phiên đăng nhập chưa lưu được. Có thể cần đăng nhập lại khi mở app.',buttons:['Đóng ứng dụng']});
    quitAllowed=true;app.quit();
  })().catch(()=>{quitAllowed=true;app.quit();});
});
