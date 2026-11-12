const { app, BrowserWindow, ipcMain, dialog, shell, session, safeStorage, Menu } = require('electron');
const fs = require('node:fs/promises');
const path = require('node:path');
const { Queue,stoppedError,abortable } = require('./queue.cjs');
const {saveOrderedOutput}=require('./ordered-output.cjs');
const {lockInput}=require('./locked-input.cjs');
const {browserStop}=require('./browser-stop.cjs');
const {prepareBrowserProbe,clearBrowserProbeDraft}=require('./browser-probe.cjs');
const {chatDiagnostics}=require('./chat-diagnostics.cjs');
const {submitPrompt}=require('./submit-prompt.cjs');
const {ensureAttachmentInput,composerAttachmentSnapshot}=require('./attachment-input.cjs');
const {imageSources,attachmentState}=require('./attachment-ready.cjs');
const {beginTracking,pollTracking,downloadAction,endTracking,readTrackedImage}=require('./muse-tracker.cjs');
const { decodeDataUrl,saveImageBuffer,sniffImage } = require('./image-save.cjs');
const {captureElectronDownload,validateVideo}=require('./download-capture.cjs');
const {triggerDownload}=require('./download-trigger.cjs');
const {createLicense,deviceCode}=require('./license.cjs');
const {payment}=require('./payment.cjs');
const {createVoiceService}=require('./story-voice.cjs');
const {createStoryService,storyFolder,freeStoryId}=require('./story-service.cjs');
const {restoreFolder,extractLastFrame,frameSimilarity,assembleRestore,MUSIC_EXT}=require('./restore-render.cjs');
const restorePlan=require('./restore-plan.js');
const {createStoryAnalyzer}=require('./story-analyze.cjs');
let licenseManager,paymentDetails,voiceService,storyService,storyAnalyzer;
const { mergeVideos, checkTools } = require('./merge.cjs');
const { exportEditPackage } = require('./edit-package.cjs');
const { createSessionStore } = require('./session-store.cjs');
const { resolveBrowser } = require('./browser-discovery.cjs');
const { launchExternalBrowser } = require('./external-browser.cjs');
const { startFlowBrowser, FLOW_URL } = require('./flow-browser.cjs');
const { createFlowRunner } = require('./flow-runner.cjs');
const flowDriver = require('./flow-driver.cjs');
const { createHash,randomUUID } = require('node:crypto');
const ownsInstance = app.requestSingleInstanceLock({appId:'local.musevideostudio.app'});
if (!ownsInstance) app.quit();
let pendingFocus=false,closePrompt=null;
function focusMain(){if(flushingQuit)return;if(!main||main.isDestroyed()){pendingFocus=true;return;}if(main.isMinimized())main.restore();main.show();main.focus();pendingFocus=false;}
app.on('second-instance',focusMain);
let packaging = false, packageProgress = '', editPackageDir = '', packageError = '';
let merging = false, mergeProgress = '', mergedOutput = '', mergeError = '';
let main, queue, settings, stateFile;
const browsers = new Map(), profiles = new Map(), opening = new Map(), externalLaunches = new Map(), browserWarnings = new Map();
let quitAllowed = false, flushingQuit = false, starting = false, runEpoch=0, nextAccount=0,stopping=false;
let testing=false,probeController,probeSettled,startError='';
const probeMutations=new Set();
async function probeMutation(promise){probeMutations.add(promise);try{return await promise;}finally{probeMutations.delete(promise);}}
const browserTests=new Map();
const nextDispatchAt=new Map();
const MAX_ACCOUNTS = 10;
const resettingAccounts = new Set(), accountResets = new Map();
const defaults = { language:'en', accountSessionIds:{}, dispatchMode:'parallel', cooldownSeconds:3, messageSelector:'', stopSelector:'', attachmentReadySelector:'', browserChoice: 'builtin', browserPath: '', output: '', autoMerge: false, autoPackage: false, ffmpeg: 'ffmpeg', restoreStories: {}, accountCount: 2, composer: 'textarea, [contenteditable="true"][role="textbox"], [contenteditable="true"][data-placeholder]', fileInput: 'input[type="file"]', submit: '', video: 'video', image: 'img', timeoutMinutes: 15, flowProjectUrl: '', flowParallel: 3, flowModel: 'lite' };
function ui(vi,en){return settings?.language==='vi'?vi:en;}
async function atomic(file, data) { await fs.writeFile(file + '.tmp', JSON.stringify(data, null, 2)); await fs.rename(file + '.tmp', file); }
function snapshot() {
  return {version:app.getVersion?.()||require('../package.json').version,jobs:queue.jobs,resting:queue.exhaustedAccounts().sort((a,b)=>a-b),restingUntil:queue.exhausted.size?queue.nextExhaustedAt():0,settings,license:licenseManager?.status(),payment:paymentDetails,starting,stopping,testing,startError,browserTests:Array.from({length:settings.accountCount},(_,index)=>{const t=browserTests.get(index),live=Boolean(t?.browser&&t.browser===browsers.get(index)&&!t.browser.isDestroyed()),status=t?.status==='ready'&&!live?'stale':t?.status||'not-tested';return {index,status,message:status==='stale'?'Trình duyệt đã đóng hoặc đổi · Test lại':t?.message||'Câu bắt đầu: tùy chọn',echoSeen:live&&Boolean(t?.echoSeen),replySeen:live&&Boolean(t?.replySeen)};}),resettingAccounts:[...resettingAccounts],active:queue.active,paused:queue.paused,merging,mergeProgress,mergedOutput,mergeError,packaging,packageProgress,editPackageDir,packageError,restore:{...restoreState,stories:settings.restoreStories||{}},story:{...(storyService?.status()||{}),analyze:storyAnalyzer?.status()||{},voice:voiceService?.status()||{}},
    flow:{open:Boolean(flowBrowser&&!flowBrowser.isClosed()),opening:Boolean(flowLaunch)},
    accounts:Array.from({length:Math.max(settings.accountCount,MAX_ACCOUNTS)},(_,index)=>{
      const browser=browsers.get(index),external=settings.browserChoice !== 'builtin';
      return {index,opened:Boolean(browser && !browser.isDestroyed()),rememberSession:external ? Boolean(browser?.external && browser.isSessionEnabled()) : profiles.get(index)?.store.isEnabled() || false,warning:external ? browserWarnings.get(index) || '' : profiles.get(index)?.warning || ''};
    })};
}

function notify() { if (main && !main.isDestroyed()) main.webContents.send('studio:update', snapshot()); }
let stateWrites = Promise.resolve();
async function save() { const data = JSON.parse(JSON.stringify({ jobs: queue.jobs, settings, mergedOutput, mergeError, editPackageDir, packageError, configVersion: 2, dispatchRevision: 1 })); const write = stateWrites.then(() => atomic(stateFile, data)); stateWrites = write.catch(() => {}); await write; }
function assertMuse(muse) {
  if (!muse || muse.isDestroyed()) throw Error('Mở Muse và đăng nhập trước khi chạy.');
  const u = new URL(muse.external ? muse.url() : muse.webContents.getURL());
  if (u.protocol !== 'https:' || !(u.hostname === 'muse.ai' || u.hostname.endsWith('.muse.ai'))) throw Error('Hãy mở trang chat trên muse.ai.');
}
async function dom(muse, fn, arg, timeoutMs=20000) {
  assertMuse(muse);let timer;
  const pending=muse.external?muse.evaluate(fn,arg):muse.webContents.executeJavaScript(`(${fn.toString()})(${JSON.stringify(arg)})`,true);
  try{return await Promise.race([pending,new Promise((_,reject)=>{timer=setTimeout(()=>reject(Object.assign(Error('Trang Muse không phản hồi tạm thời; đang chờ kết nối lại.'),{code:'MUSE_DOM_TIMEOUT'})),timeoutMs);timer.unref?.();})]);}
  finally{clearTimeout(timer);}
}
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
// Chạy hàng đợi chỉ dùng các tài khoản trong "Chạy song song" (accountCount);
// đăng nhập / mở / đăng xuất thì được dùng cả 10 tài khoản để đăng nhập sẵn.
function validAccount(index) {
  if(!Number.isInteger(index) || index<0 || index>=settings.accountCount) throw Error('Tài khoản không hợp lệ.');
}
function validLoginAccount(index) {
  if(!Number.isInteger(index) || index<0 || index>=MAX_ACCOUNTS) throw Error('Tài khoản không hợp lệ.');
}
function accountProfileKey(index) {
  const type=settings.browserChoice==='custom'?'custom-'+createHash('sha256').update(resolveBrowser({choice:'custom',customPath:settings.browserPath})).digest('hex').slice(0,16):settings.browserChoice;
  return `${type}/account-${index+1}`;
}
function sessionId(key) {
  if(!settings.accountSessionIds||Array.isArray(settings.accountSessionIds)||typeof settings.accountSessionIds!=='object')settings.accountSessionIds={};
  return settings.accountSessionIds[key] || (settings.accountSessionIds[key]=randomUUID());
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
  validLoginAccount(index);
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
      const muse=new BrowserWindow({icon:path.join(__dirname,'assets','muse-studio.png'),width:1250,height:850,title:ui(`Muse — Tài khoản ${index+1}`,`Muse — Account ${index+1}`),webPreferences:{session:profile.session,backgroundThrottling:false,nodeIntegration:false,contextIsolation:true,sandbox:true}});
      muse.setMenu(null);muse.setMenuBarVisibility(false);
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
  return testing || queue.active || starting || stopping || merging || packaging || opening.size || externalLaunches.size || Boolean(storyAnalyzer?.busy);
}
function logoutAccount(index) {
  validLoginAccount(index);
  if(flushingQuit || accountOperationBusy() || resettingAccounts.size) throw Error('Chờ hàng đợi và các thao tác trình duyệt hoàn tất trước khi đăng xuất.');
  resettingAccounts.add(index);notify();
  const task=(async()=>{
    const browserName=({builtin:'Trình duyệt tích hợp',chrome:'Google Chrome',edge:'Microsoft Edge',custom:'Trình duyệt tùy chọn'})[settings.browserChoice];
    const choice=await dialog.showMessageBox(main,{type:'warning',buttons:settings.language==='vi'?['Hủy','Đăng xuất tài khoản này']:['Cancel','Sign out of this account'],defaultId:0,cancelId:0,message:ui(`Đăng xuất ${browserName} — Tài khoản ${index+1}?`,`Sign out of ${browserName} — Account ${index+1}?`),detail:ui('Chỉ xóa dữ liệu đăng nhập trong hồ sơ riêng của tài khoản này do Muse Studio quản lý. Các tài khoản khác, trình duyệt cá nhân và video đã tải vẫn được giữ nguyên.','Only this app-managed account profile is cleared. Other accounts, personal browsers and saved videos are preserved.')});
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
    const key=accountProfileKey(index);sessionId(key);settings.accountSessionIds[key]=randomUUID();await save();
    return snapshot();
  })();
  accountResets.set(index,task);
  return task.finally(()=>{accountResets.delete(index);resettingAccounts.delete(index);notify();});
}

async function upload(muse, files, signal) {
  const check=()=>{if(signal?.aborted)throw stoppedError();};
  await Promise.all(files.map(file => fs.access(file)));check();assertMuse(muse);
  if(muse.external) return muse.upload(settings.fileInput,files,{composerSelector:settings.composer,signal});
  const debug=muse.webContents.debugger;
  if(debug.isAttached())throw Error('Đóng DevTools của cửa sổ Muse trước khi tải ảnh.');
  debug.attach('1.3');
  let chooser;const onMessage=(_event,method,params)=>{if(method==='Page.fileChooserOpened')chooser=params;};
  debug.on('message',onMessage);
  try{
    await debug.sendCommand('Page.enable');check();
    await debug.sendCommand('Page.setInterceptFileChooserDialog',{enabled:true});check();
    const deadline=Date.now()+8000;let reset=true;
    while(Date.now()<deadline){
      check();const state=await dom(muse,ensureAttachmentInput,{composerSelector:settings.composer,fileInputSelector:settings.fileInput,reset});reset=false;check();
      if(chooser?.backendNodeId){await debug.sendCommand('DOM.setFileInputFiles',{files,backendNodeId:chooser.backendNodeId});check();return;}
      if(state.ready){
        const {root}=await debug.sendCommand('DOM.getDocument');check();
        const {nodeIds}=await debug.sendCommand('DOM.querySelectorAll',{nodeId:root.nodeId,selector:settings.fileInput});check();
        if(nodeIds.length!==1)throw Error('Không xác định được ô tải ảnh duy nhất trong Muse.');
        await debug.sendCommand('DOM.setFileInputFiles',{files,nodeId:nodeIds[0]});check();return;
      }
      await delay(250);
    }
    throw Error('Chưa mở được ô tải ảnh. Kiểm tra nút + / đính kèm trong Muse; prompt chưa được gửi.');
  }finally{
    try{await debug.sendCommand('Page.setInterceptFileChooserDialog',{enabled:false});}catch{}
    debug.removeListener('message',onMessage);
    if(debug.isAttached())debug.detach();
  }
}

const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
async function rightClickAt(muse,x,y) {
  if(muse.external){await muse.rightClick?.(x,y);return;}
  const contents=muse.webContents;contents.focus?.();
  contents.sendInputEvent({type:'mouseMove',x,y});
  contents.sendInputEvent({type:'mouseDown',x,y,button:'right',clickCount:1});
  contents.sendInputEvent({type:'mouseUp',x,y,button:'right',clickCount:1});
}
function triggerTrackedDownload(muse,id,signal,extra={}) {
  return triggerDownload({id,signal,delay,stopped:stoppedError,abortable,call:arg=>dom(muse,downloadAction,arg),rightClick:(x,y)=>rightClickAt(muse,x,y),...extra});
}
// Thư mục lưu clip: kể chuyện → KeChuyen/<truyện>, dọn nhà → DonNha/<truyện>, còn lại → thư mục lưu chung.
const jobFolder=job=>job.kind==='story'?storyFolder(settings.output,job.storyId):job.kind==='restore'?restoreFolder(settings.output,job.storyId):settings.output;
// Tab «Dọn nhà · Sinh tồn»: ảnh đầu của cảnh kế tiếp là khung cuối THẬT của clip này.
async function saveLastFrame(job,clip){
  const out=path.join(restoreFolder(settings.output,job.storyId),'khung-cuoi',String(job.number).padStart(3,'0')+'-cuoi.png');
  return extractLastFrame({ffmpeg:settings.ffmpeg,clip,out});
}
// Giữ đồng nhất: khung ĐẦU của clip phải giống ảnh đã đưa cho Muse (khung cuối clip trước). Nếu Muse bỏ qua ảnh và dựng cảnh / nhà / người khác thì tự tạo lại
// (tối đa DRIFT_TRIES lần để khỏi tốn lượt vô hạn; hết lần thì giữ clip và ghi chú). Không so được (thiếu FFmpeg…) thì không chặn.
const DRIFT_MIN=0.4,DRIFT_TRIES=2;
async function restoreFrameGuard(job,clip){
  const ref=job.references?.[0]||job.image;
  if(!ref)return;
  let sim;
  try{sim=await frameSimilarity({ffmpeg:settings.ffmpeg||'ffmpeg',clip,image:ref});}catch{return;}
  job.startMatch=Math.round(sim*100)/100;
  if(sim>=DRIFT_MIN){delete job.driftNote;return;}
  if((job.driftTries||0)>=DRIFT_TRIES){job.driftNote=`Khung đầu chỉ giống ảnh đưa vào ${Math.round(sim*100)}%: cảnh này có thể lệch so với cảnh trước.`;return;}
  job.driftTries=(job.driftTries||0)+1;
  await fs.rm(clip,{force:true}).catch(()=>{});
  throw Error(`Cảnh không bắt đầu từ ảnh đã đưa (giống ${Math.round(sim*100)}%): Muse đã dựng cảnh hoặc người khác. Tự tạo lại lần ${job.driftTries}/${DRIFT_TRIES}.`);
}
async function download(muse,job,signal) {
  const outputDir=jobFolder(job);
  const temporary=path.join(outputDir,`.muse-${job.id}-${randomUUID().slice(0,8)}.part`);
  await fs.mkdir(outputDir,{recursive:true});
  let lastNotify=0;
  const options={signal,trigger:()=>triggerTrackedDownload(muse,job.trackerId||job.id,signal),onProgress:progress=>{
    if(signal.aborted)return;job.downloadProgress=progress;
    if(Date.now()-lastNotify>300){lastNotify=Date.now();notify();}
  }};
  try{
    if(muse.external)await muse.captureDownload(temporary,options);
    else await captureElectronDownload(muse.webContents,temporary,options);
    if(signal.aborted)throw stoppedError();
    return await finishVideoFile(job,temporary,outputDir,signal);
  }catch(error){await fs.rm(temporary,{force:true}).catch(()=>{});throw error;}
}
// Đuôi chung của mọi cách tải clip (Muse hoặc Flow): kiểm tra tệp, lưu đúng số thứ tự, kiểm tra khung đầu và lấy khung cuối cho cảnh kế.
async function finishVideoFile(job,temporary,outputDir,signal){
  const format=await validateVideo(temporary);
  if(signal.aborted)throw stoppedError();
  const target=await saveOrderedOutput(temporary,outputDir,job,format.extension);
  job.downloadCompletedAt=new Date().toISOString();
  if(job.kind==='restore'&&job.phase==='clip')await restoreFrameGuard(job,target);
  if(job.kind==='restore')job.lastFrame=await saveLastFrame(job,target);
  return target;
}
const imageDirectory=()=>path.join(settings.output,'Anh');
// Việc «ảnh» của chế độ Mẹo vặt (nằm trong hàng đợi kể chuyện): ảnh lưu cạnh clip của truyện, thư mục «anh».
const isPhoto=job=>job.kind==='image'||job.phase==='image';
const photoDirectory=job=>job.kind==='story'?path.join(storyFolder(settings.output,job.storyId),'anh'):job.kind==='restore'?path.join(restoreFolder(settings.output,job.storyId),'anh'):imageDirectory();
async function fetchImageInMain(muse,url,signal){
  // Built-in browser only: the main process reads the picture with the account's own
  // cookies, which also works when the page's CSP blocks fetch() to the image CDN.
  if(muse.external||!/^https:/i.test(url||'')||typeof muse.webContents?.session?.fetch!=='function')return null;
  const controller=new AbortController(),abort=()=>controller.abort();signal?.addEventListener('abort',abort,{once:true});
  const timer=setTimeout(abort,60000);timer.unref?.();
  try{const response=await muse.webContents.session.fetch(url,{signal:controller.signal});if(!response.ok)throw Error('HTTP '+response.status);return Buffer.from(await response.arrayBuffer());}
  finally{clearTimeout(timer);signal?.removeEventListener('abort',abort);}
}
// A picture is saved the way a person does it: right-click it in the chat, then "Tải xuống".
// That gives Muse's own full-size file. The file is checked by its first bytes before it is kept.
async function downloadImageByMenu(muse,job,signal,index,directory) {
  const temporary=path.join(directory,`.muse-${job.id}-${randomUUID().slice(0,8)}.part`);
  const options={signal,timeoutMs:60000,trigger:()=>triggerTrackedDownload(muse,job.trackerId||job.id,signal,{kind:'image',index})};
  try{
    if(muse.external)await muse.captureDownload(temporary,options);
    else await captureElectronDownload(muse.webContents,temporary,options);
    if(signal.aborted)throw stoppedError();
    const {size}=await fs.stat(temporary);
    if(size>62914560)throw Error('Ảnh tải về lớn hơn giới hạn.');
    return await fs.readFile(temporary);
  }finally{await fs.rm(temporary,{force:true}).catch(()=>{});}
}
// Fallback: read the picture as shown in the chat (its own link, else the displayed copy).
async function readShownImage(muse,job,signal,index) {
  const item=await abortable(dom(muse,readTrackedImage,{id:job.trackerId||job.id,index},90000),signal);
  if(item?.changed)throw Error('Ảnh trong phản hồi vừa thay đổi; kiểm tra lại trước khi lưu.');
  let buffer=null;
  if(item?.dataUrl)buffer=decodeDataUrl(item.dataUrl);
  else buffer=await abortable(fetchImageInMain(muse,item?.url,signal),signal).catch(()=>null);
  if(!buffer)throw Error('Không đọc được ảnh từ Muse'+(item?.errors?.length?' ('+item.errors.join('; ')+')':'')+'.');
  return buffer;
}
async function saveImages(muse,job,signal,count) {
  const directory=photoDirectory(job),saved=[];
  await fs.mkdir(directory,{recursive:true});
  for(let index=0;index<count;index++){
    if(signal.aborted)throw stoppedError();
    job.stage='downloading';job.stageMessage=`Đang bấm chuột phải → Tải xuống${count>1?` (ảnh ${index+1}/${count})`:''}`;notify();
    let buffer=null;const notes=[];
    try{
      buffer=await downloadImageByMenu(muse,job,signal,index,directory);
      if(!sniffImage(buffer)){notes.push('tệp tải xuống không phải ảnh');buffer=null;}
    }catch(e){if(signal.aborted||e?.name==='AbortError')throw e;notes.push('menu chuột phải: '+e.message);}
    if(!buffer){
      job.stageMessage='Menu Tải xuống chưa dùng được · đọc ảnh đang hiện trong chat';notify();
      try{buffer=await readShownImage(muse,job,signal,index);}
      catch(e){if(signal.aborted||e?.name==='AbortError')throw e;throw Error(`${e.message} Ảnh chưa được lưu. (${notes.join('; ')})`);}
    }
    saved.push(await saveImageBuffer(buffer,directory,job,{suffix:count>1?'_'+(index+1):''}));
  }
  job.outputs=saved;job.downloadCompletedAt=new Date().toISOString();
  return saved[0];
}
function transientDOM(error){return error?.code==='MUSE_DOM_TIMEOUT'||/Execution context was destroyed|context.*destroyed|Target closed|navigation|not respond|chưa phản hồi/i.test(error?.message||'');}
// ---- Google Flow (Veo 3.1): trình duyệt riêng (Chrome/Edge mở bình thường, tool nối vào bằng cổng gỡ lỗi), người dùng đăng nhập Google một lần.
let flowBrowser=null,flowLaunch=null;
function flowExecutable(){
  const choice=settings.browserChoice==='builtin'?'chrome':settings.browserChoice;
  try{return resolveBrowser({choice,customPath:settings.browserPath});}
  catch(e){
    if(settings.browserChoice==='builtin'){try{return resolveBrowser({choice:'edge'});}catch{}}
    throw Error('Flow cần Google Chrome hoặc Microsoft Edge (trình duyệt Chromium khác như Cốc Cốc thì chọn «Đường dẫn tùy chọn» trong Cài đặt). '+e.message);
  }
}
async function ensureFlowBrowser(){
  if(flowBrowser&&!flowBrowser.isClosed())return flowBrowser;
  if(flowLaunch)return flowLaunch;
  flowLaunch=(async()=>{
    const browser=await startFlowBrowser({executablePath:flowExecutable(),profileDir:path.join(app.getPath('userData'),'flow-profile'),url:settings.flowProjectUrl||FLOW_URL,onClosed:()=>{flowBrowser=null;notify();}});
    if(flushingQuit){await browser.close();return null;}
    flowBrowser=browser;notify();return browser;
  })();
  try{return await flowLaunch;}finally{flowLaunch=null;notify();}
}
flowDriver.configure({debugDir:path.join(app.getPath('userData'),'flow-debug')});
const flowRunner=createFlowRunner({driver:flowDriver,getPage:async()=>{const browser=await ensureFlowBrowser();if(!browser)throw stoppedError();return browser.page();}});
// Lưu kết quả Flow: video đi qua đúng đuôi xử lý như Muse (kiểm tra, đánh số, khung cuối); ảnh lưu vào thư mục «anh» của truyện.
async function storeFlowOutput(job,capture,signal){
  const photo=isPhoto(job),directory=photo?photoDirectory(job):jobFolder(job);
  await fs.mkdir(directory,{recursive:true});
  const temporary=path.join(directory,`.flow-${job.id}-${randomUUID().slice(0,8)}.part`);
  try{
    await capture(temporary);
    if(signal.aborted)throw stoppedError();
    if(!photo)return await finishVideoFile(job,temporary,directory,signal);
    const buffer=await fs.readFile(temporary);
    if(buffer.length>62914560)throw Error('Ảnh tải về lớn hơn giới hạn.');
    if(!sniffImage(buffer))throw Error('Tệp Flow tải về không phải ảnh.');
    const saved=await saveImageBuffer(buffer,directory,job,{suffix:''});
    job.outputs=[saved];job.downloadCompletedAt=new Date().toISOString();
    return saved;
  }finally{await fs.rm(temporary,{force:true}).catch(()=>{});}
}
async function runFlowJob(job,worker,signal,{recover=false}={}){
  const check=()=>{if(signal.aborted)throw stoppedError();};
  check();
  if(!recover)await abortable(licenseManager.requireLongTerm(),signal);
  if(!settings.output)throw Error('Chọn thư mục lưu video trước.');
  if(!/^https:\/\/flow\.google\.com\/(?:[a-z-]+\/)?project\/[\w-]+/i.test(settings.flowProjectUrl||''))throw Error('Dán đường dẫn dự án Flow (dạng flow.google.com/project/…) vào Cài đặt → Google Flow. Tạo sẵn một dự án trống trong Flow rồi copy đường dẫn trên thanh địa chỉ.');
  job.account=0;job.mayHaveSubmitted=false;
  const stage=(value,message)=>{check();job.stage=value;job.stageMessage=message;notify();};
  const output=await flowRunner.run(job,{signal,stage,save:()=>save(),model:settings.flowModel,aspect:job.aspect,projectUrl:settings.flowProjectUrl,timeoutMinutes:settings.timeoutMinutes,store:capture=>storeFlowOutput(job,capture,signal)});
  return output;
}
async function runJob(job,worker,signal,{recover=false}={}) {
  if(job.provider==='flow')return runFlowJob(job,worker,signal,{recover});
  const pinned=recover||Boolean(job.resumeMode);
  const rest=job.kind==='restore'?queue.exhaustedAccounts():[];   // tài khoản đang nghỉ vì hết hạn mức thì bỏ qua (nếu còn tài khoản khác)
  const pickNext=()=>{for(let tries=0;tries<settings.accountCount;tries++){const next=nextAccount++%settings.accountCount;if(!(job.avoidAccounts||[]).includes(next+1)&&!rest.includes(next+1))return next;}return nextAccount++%settings.accountCount;};
  const slot=pinned&&job.account?Number(job.account)-1:settings.dispatchMode==='parallel'?worker:pickNext();
  validAccount(slot);
  const muse=browsers.get(slot),check=()=>{if(signal.aborted)throw stoppedError();},step=p=>abortable(p,signal);
  check();job.account=slot+1;assertMuse(muse);muse.pinPage?.(job.id);
  const profileKey=accountProfileKey(slot),currentSession=sessionId(profileKey);
  if(recover&&((job.submissionProfileKey&&job.submissionProfileKey!==profileKey)||(job.submissionSessionId&&job.submissionSessionId!==currentSession)))throw Error('Mở lại đúng trình duyệt và phiên tài khoản đã gửi prompt.');
  if(!recover)await step(job.kind==='restore'?licenseManager.requireLongTerm():licenseManager.ensureAllowed());
  if(!settings.output)throw Error('Chọn thư mục lưu video trước.');
  const stage=(value,message)=>{check();job.stage=value;job.stageMessage=message;notify();};
  const input=recover?(job.lockedInput||{prompt:job.prompt,references:[]}):await step(lockInput(job,path.join(app.getPath('userData'),'locked-references')));
  const prompt=input.prompt,references=input.references.map(r=>r.path);
  const receipt=job.submissionReceipt;
  if(!recover){
    if(job.trackerId){void dom(muse,endTracking,{id:job.trackerId}).catch(()=>{});}
    job.trackerId=randomUUID();job.outputs=[];job.echoKey='';job.echoMarker='';job.echoAliases=[];job.acknowledgedAt=null;job.confirmedResponseAt=null;job.submissionReceipt=null;job.submissionProtocol=null;job.resultReadyAt=null;job.downloadStartedAt=null;job.downloadCompletedAt=null;job.late=false;job.mayHaveSubmitted=false;job.submittedAt=null;job.remoteStop=null;
    await step(save());check();
    const wait=(nextDispatchAt.get(slot)||0)-Date.now();if(wait>0){stage('cooldown','Chờ lượt gửi tiếp theo');await step(delay(wait));}
    while(true){
      check();let widget;
      try{widget=await step(dom(muse,browserStop,{composerSelector:settings.composer,selector:settings.stopSelector||'',trackerId:job.trackerId}));}
      catch(e){if(!transientDOM(e))throw e;stage('preparing','Muse đang lag · chờ ô soạn thảo sẵn sàng');await step(delay(2000));continue;}
      if(widget?.state!=='generating')break;
      stage('preparing','Muse còn hoàn tất phản hồi trước · chưa gửi prompt mới');await step(delay(1000));
    }
    const before=references.length?await step(dom(muse,imageSources,null)):[];
    stage('entering','Đang nhập đúng prompt đã khóa vào ô chat');
    const composerDeadline=Date.now()+45000;let draft;
    while(true){
    draft=await step(dom(muse,({selector,prompt})=>{
      const list=[...document.querySelectorAll(selector)].filter(e=>e.getClientRects().length);
      if(!list.length)return{notReady:true};
      if(list.length!==1)throw Error('Không xác định được ô nhập prompt duy nhất.');
      const e=list[0],old=(e.value||e.innerText||'').trim();
      if(old){if(old===prompt.trim())return{reused:true};throw Error('Ô Muse còn bản nháp khác cảnh này. Tool giữ nguyên để tránh gửi nhầm prompt.');}
      e.focus();
      if(e instanceof HTMLTextAreaElement||e instanceof HTMLInputElement)Object.getOwnPropertyDescriptor(e instanceof HTMLTextAreaElement?HTMLTextAreaElement.prototype:HTMLInputElement.prototype,'value').set.call(e,prompt);
      else e.textContent=prompt;
      e.dispatchEvent(new InputEvent('input',{bubbles:true,inputType:'insertText',data:prompt}));return{reused:false};
    },{selector:settings.composer,prompt}));
    if(!draft?.notReady)break;
    if(Date.now()>composerDeadline)throw Error('Chưa thấy ô chat Muse. Đăng nhập trong trình duyệt rồi bấm Tiếp tục.');
    stage('preparing','Chờ ô chat Muse tải xong · đăng nhập nếu cần; chưa gửi cảnh');await step(delay(500));
    }
    if(references.length){
      stage('uploading','Đang kiểm tra ảnh đã khóa trong ô soạn thảo');
      const attached=await step(dom(muse,composerAttachmentSnapshot,{composerSelector:settings.composer}));
      const reuseImages=Boolean(attached?.count);
      if(reuseImages&&(attached.count!==references.length||JSON.stringify(attached.tokens)!==JSON.stringify(job.preparedTokens||[])))throw Error('Ô chat còn ảnh khác hoặc chưa xác minh được ảnh đã khóa. Gỡ ảnh đó trước khi tiếp tục.');
      if(!reuseImages){stage('uploading','Đang đính kèm '+references.length+' ảnh tham chiếu đã khóa');await step(upload(muse,references,signal));}
      const deadline=Date.now()+180000;let stable=0,ready=false;
      while(Date.now()<deadline){
        check();let state;
        try{state=await step(dom(muse,attachmentState,{before:reuseImages?[]:before,count:references.length,selector:settings.attachmentReadySelector,submitSelector:settings.submit,composerSelector:settings.composer}));}
        catch(e){if(!transientDOM(e))throw e;await step(delay(1000));continue;}
        if(state?.ready){
          if(reuseImages&&JSON.stringify(state.tokens)!==JSON.stringify(job.preparedTokens||[]))throw Error('Ảnh trong bản nháp chưa khớp bản đã khóa. Xóa bản nháp này trước khi tiếp tục.');
          if(!stable)stable=Date.now();if(Date.now()-stable>=1000){job.preparedTokens=state.tokens;ready=true;break;}
        }else stable=0;
        await step(delay(350));
      }
      if(!ready)throw Error('Ảnh tham chiếu chưa sẵn sàng; tool chưa gửi prompt.');
    }else job.preparedTokens=[];
    await step(save());
  }
  const trackerId=job.trackerId||job.id;
  try{
    await step(dom(muse,beginTracking,{id:trackerId,prompt,mediaKind:isPhoto(job)?'image':'video',imageSelector:settings.image||'img',videoSelector:settings.video,messageSelector:settings.messageSelector,recover,echoKey:recover?job.echoKey||receipt?.echoKey:'',echoMarker:recover?job.echoMarker||receipt?.echoMarker:'',echoAliases:recover?[...new Set([...(job.echoAliases||[]),receipt?.echoKey].filter(Boolean))]:[],otherPrompts:recover?[...queue.jobs.filter(j=>j.id!==job.id).map(j=>j.lockedInput?.prompt||j.prompt),'Bắt đầu công việc mới nhé'].filter(Boolean):[]}));
    if(!recover){
      stage('submitting','Đang gửi đúng prompt và ảnh đã khóa');
      job.submissionProfileKey=profileKey;job.submissionSessionId=currentSession;job.submissionProtocol=1;job.mayHaveSubmitted=true;job.submittedAt=null;await step(save());check();
      try{const sent=await step(dom(muse,submitPrompt,{id:trackerId,selector:settings.submit,composerSelector:settings.composer,attachmentTokens:job.preparedTokens}));if(!sent?.clicked)throw Error('Chưa bấm được Gửi. Cảnh chưa gửi; bấm Tiếp tục để gửi lại.');job.submittedAt=new Date().toISOString();await step(save());}
      catch(e){if(signal.aborted)throw e;if(!transientDOM(e)){job.mayHaveSubmitted=false;await step(save());throw e;}stage('confirming','Muse đang lag · chờ xác nhận, không bấm Gửi lần nữa');}
    }
    const warnAt=Date.now()+settings.timeoutMinutes*60000,image=isPhoto(job);
    let warned=false,observedEcho=false;
    // A picture is saved only after Muse's own "generating" state has ended, so a
    // preview that is replaced by the final render is never stored.
    const stillGenerating=async()=>{
      if(!image)return false;
      try{return (await step(dom(muse,browserStop,{composerSelector:settings.composer,selector:settings.stopSelector||'',trackerId})))?.state==='generating';}
      catch(e){if(!transientDOM(e))throw e;return true;}
    };
    stage(recover?'recovering':'confirming',recover?'Kiểm tra bằng chứng cảnh đã gửi trước khi lấy kết quả':'Chưa xác nhận Muse nhận prompt');
    while(true){
      check();let result;
      try{result=await step(dom(muse,pollTracking,{id:trackerId}));}
      catch(e){if(!transientDOM(e))throw e;stage(observedEcho?'waiting':recover?'recovering':'confirming',observedEcho?'Trang Muse đang lag · giữ đúng cảnh đã gửi, chưa có video để tải':'Trang Muse đang lag · chưa xác nhận tin nhắn prompt, chưa có video để tải');await step(delay(2000));continue;}
      if(result.error)throw Error(result.error);
      observedEcho=Boolean(result.echoMatched);
      if(result.echoMatched&&!recover&&!job.submissionReceipt){job.submissionReceipt={version:1,attemptId:trackerId,promptHash:input.promptHash,referenceHashes:input.references.map(r=>r.sha256),echoKey:result.echoKey||'',echoMarker:result.echoMarker||trackerId,observedAt:new Date().toISOString()};await step(save());}

      if(result.echoMatched&&(!job.acknowledgedAt||(result.echoKey&&job.echoKey!==result.echoKey))){job.acknowledgedAt=job.acknowledgedAt||new Date().toISOString();job.echoAliases=result.echoAliases||[];job.echoKey=result.echoKey||'';job.echoMarker=result.echoMarker||trackerId;await step(save());}
      if(result.responseMatched&&!job.confirmedResponseAt){job.confirmedResponseAt=new Date().toISOString();await step(save());}
      job.progress=result.echoMatched&&result.responseMatched&&Number.isFinite(result.progress)?result.progress:null;
      let holding=false;
      if(result.ready&&result.echoMatched&&result.responseMatched&&!(holding=await stillGenerating())){
        job.resultReadyAt=new Date().toISOString();job.downloadStartedAt=new Date().toISOString();
        stage('downloading',image?'Đúng phản hồi của cảnh này · đang lưu ảnh về máy':'Đúng phản hồi của cảnh này · đang lưu video về máy');await step(save());
        try{
          const output=image?await step(saveImages(muse,job,signal,result.count||1)):await step(download(muse,job,signal));nextDispatchAt.set(slot,Date.now()+settings.cooldownSeconds*1000);return output;
        }catch(e){check();stage('downloading',(image?'Chưa lưu được ảnh · giữ đúng kết quả và thử lại: ':'Chưa lưu được video · giữ đúng kết quả và thử tải lại: ')+e.message);await step(delay(5000));continue;}
      }
      if(!warned&&Date.now()>warnAt){warned=true;job.late=true;}
      stage(!result.echoMatched?'confirming':'waiting',(job.late?'Muse chậm hơn thời gian dự kiến · vẫn giữ cảnh này; bấm «Dừng cảnh này» hoặc «Tạo lại ngay» nếu không muốn chờ nữa. ':'')+(!result.echoMatched?'Chưa thấy đúng prompt trong chat Muse':!result.responseMatched?'Đã thấy tin nhắn · chờ Muse phản hồi'+(result.hint?' ('+result.hint+')':''):holding?'Ảnh đã hiện · chờ Muse tạo xong rồi mới lưu':result.stage||(image?'Chờ đúng ảnh của prompt':'Chờ đúng video của prompt')));
      await step(delay(1500));
    }
  }finally{
    if(!signal.aborted&&job.downloadCompletedAt){void dom(muse,endTracking,{id:trackerId}).catch(()=>{});muse.releasePage?.(job.id);}
  }
}
async function testBrowsers(){
  if(accountOperationBusy()||resettingAccounts.size)throw Error('Dừng thao tác hiện tại trước khi Test trình duyệt.');
  testing=true;let finishProbe;probeSettled=new Promise(resolve=>{finishProbe=resolve;});startError='';probeController=new AbortController();const signal=probeController.signal;notify();
  try{
    await Promise.all(Array.from({length:settings.accountCount},async(_,index)=>{
      const entry={index,status:'opening',message:'Đang mở Muse',id:randomUUID(),token:randomUUID(),mayHaveSubmitted:false};browserTests.set(index,entry);notify();
      const check=()=>{if(signal.aborted)throw stoppedError();};
      const step=p=>abortable(p,signal);
      try{
        await step(probeMutation(openMuse(index)));check();const muse=browsers.get(index);entry.browser=muse;
        entry.status='checking';entry.message='Đang kiểm tra ô chat';notify();
        const widget=await step(dom(muse,browserStop,{composerSelector:settings.composer,selector:settings.stopSelector||''}));
        if(widget?.state==='generating')throw Error('Muse còn xử lý. Bấm Dừng hoặc chờ phản hồi xong rồi Test lại.');
        const text='Bắt đầu công việc mới nhé';
        const composerDeadline=Date.now()+45000;
        entry.prepared=true;
        while(!await step(probeMutation(dom(muse,prepareBrowserProbe,{id:entry.id,composerSelector:settings.composer,text})))){check();if(Date.now()>composerDeadline)throw Error('Chưa thấy ô chat. Đăng nhập Muse rồi bấm Test tất cả trình duyệt lại.');entry.message='Chờ ô chat · đăng nhập Muse nếu cần';notify();await step(delay(600));}
        entry.status='sending';entry.message='Đang gửi câu bắt đầu';notify();
        entry.mayHaveSubmitted=true;
        const result=await step(probeMutation(dom(muse,submitPrompt,{id:entry.id,selector:settings.submit,composerSelector:settings.composer,attachmentTokens:[]})));
        if(!result?.clicked)throw Error('Chưa bấm được nút Gửi của Muse.');
        entry.status='sent';entry.message='Đã gửi câu bắt đầu';
      }catch(e){entry.status=signal.aborted?'canceled':'failed';entry.message=signal.aborted?'Đã dừng Test':e.message;}
      finally{if(entry.browser){if(signal.aborted&&entry.prepared){await Promise.allSettled([...probeMutations]);await dom(entry.browser,clearBrowserProbeDraft,{composerSelector:settings.composer,text:'Bắt đầu công việc mới nhé'}).catch(()=>{});}void dom(entry.browser,endTracking,{id:entry.id}).catch(()=>{});}notify();}
    }));
  }finally{testing=false;probeController=null;finishProbe();if(!starting&&!queue.active&&!flushingQuit){main?.show();main?.focus();}notify();}
  return snapshot();
}
// Bấm nút Dừng của chính Muse cho một cảnh đã gửi (tối đa ~6,5 giây); kết quả ghi vào job.remoteStop. Dùng cho «Dừng» cả hàng đợi và cho nút «Dừng / Tạo lại» riêng từng cảnh.
async function remoteStopJob(job){
  if(!job.mayHaveSubmitted){job.remoteStop={state:'not-sent'};return;}
  const muse=browsers.get(Number(job.account)-1),args={composerSelector:settings.composer,selector:settings.stopSelector||'',trackerId:job.trackerId||job.id,requestId:(job.stopRequestId=randomUUID())};
  try{
    const end=Date.now()+6500;
    let request=true,clicked=false;
    while(Date.now()<end){
      const observed=await dom(muse,browserStop,{...args,request},2000);job.remoteStop=observed;notify();
      if(['confirmed','ui-stopped','completed','ambiguous','chat-changed'].includes(observed.state))break;
      if(observed.clicked)clicked=true;
      if(observed.state==='unavailable'&&clicked)break;
      request=!clicked;
      await delay(400);
    }

  }catch{job.remoteStop={state:'unavailable',clicked:false};}
  job.stageMessage=['confirmed','ui-stopped'].includes(job.remoteStop.state)?'Đã bấm dừng trong Muse · Tiếp tục sẽ gửi lại cảnh đã khóa':job.remoteStop.state==='completed'?'Video đã có · Tiếp tục sẽ tải về':'Chưa xác nhận dừng trên Muse · Tiếp tục sẽ chờ/lấy kết quả, không gửi trùng';
}
async function stopAll(){
  if(stopping){while(stopping)await delay(50);return snapshot();}
  storyAnalyzer?.cancel();
  stopping=true;lastStopAt=Date.now();clearTimeout(quotaTimer);quotaTimer=null;clearInterval(rebalanceTimer);rebalanceTimer=null;runEpoch++;starting=false;probeController?.abort();queue.pause();
  const probes=[...browserTests.values()].filter(t=>testing&&t.mayHaveSubmitted&&t.status!=='ready').map(t=>({id:t.id,trackerId:t.id,account:t.index+1,mayHaveSubmitted:true}));
  const jobs=[...queue.jobs.filter(j=>!probes.some(t=>t.account===j.account)&&(j.status==='running'||(['failed','interrupted'].includes(j.status)&&j.mayHaveSubmitted&&!['confirmed','ui-stopped'].includes(j.remoteStop?.state)))),...probes];notify();
  const requests=jobs.map(remoteStopJob);
  try{await queue.stop();await Promise.allSettled(requests);for(const job of jobs){job.error='';job.stageMessage=job.provider==='flow'?(job.flowCard?'Đã dừng · cảnh đã gửi vào Flow được giữ, Tiếp tục sẽ nối lại và tải về, không gửi trùng':'Đã dừng · cảnh chưa gửi vào Flow'):['confirmed','ui-stopped'].includes(job.remoteStop?.state)?'Đã dừng trong Muse · Tiếp tục sẽ gửi lại cảnh đã khóa':job.remoteStop?.state==='completed'?'Clip đã có · Tiếp tục sẽ tải về':'Chưa xác nhận dừng trên Muse · Tiếp tục sẽ chờ đúng kết quả, không gửi trùng';}await save();}
  finally{stopping=false;notify();}
  return snapshot();
}

async function mergeProject() {
  if (queue.active || starting || merging || packaging) throw Error('Chờ xử lý hiện tại hoàn tất trước khi nối.');
  if (!settings.output) throw Error('Chọn thư mục lưu video trước.');
  merging = true; mergeProgress = 'Chuẩn bị nối video…'; mergeError = ''; notify();
  try {
    mergedOutput = await mergeVideos(JSON.parse(JSON.stringify(queue.jobs.filter(j=>j.kind==='video'))), { output: settings.output, ffmpeg: settings.ffmpeg, onProgress: text => { mergeProgress=text;notify(); } });
    mergeProgress = 'Video tổng đã hoàn tất';
  } catch(e) { mergeError=e.message;mergeProgress='Nối video chưa hoàn tất'; }
  finally { merging=false;await save();notify(); }
}
const FONT_EXT=new Set(['.ttf','.otf','.woff','.woff2']),FONT_MAX=25*1024*1024;
const fontDirectory=()=>path.join(app.getPath('userData'),'subtitle-fonts');
const fontSignature=buffer=>{const tag=buffer.subarray(0,4).toString('latin1');return tag==='OTTO'||tag==='true'||tag==='wOFF'||tag==='wOF2'||tag==='ttcf'||(buffer[0]===0&&buffer[1]===1&&buffer[2]===0&&buffer[3]===0);};
const fontFamily=file=>path.parse(file).name.replace(/[\u0000-\u001f"\\]/g,'').trim().slice(0,60)||'Phong-cua-ban';
async function listUserFonts(){
  let names=[];try{names=await fs.readdir(fontDirectory());}catch{return [];}
  const out=[];
  for(const name of names.filter(n=>FONT_EXT.has(path.extname(n).toLowerCase())).sort()){
    try{const file=path.join(fontDirectory(),name),stat=await fs.stat(file);if(!stat.isFile()||stat.size>FONT_MAX)continue;const bytes=await fs.readFile(file);if(fontSignature(bytes))out.push({family:fontFamily(name),bytes});}catch{}
  }
  return out;
}
async function addUserFont(source){
  const extension=path.extname(source).toLowerCase();
  if(!FONT_EXT.has(extension))throw Error('Chỉ nhận file phông .ttf, .otf, .woff hoặc .woff2.');
  const stat=await fs.stat(source);
  if(!stat.isFile()||stat.size<1000||stat.size>FONT_MAX)throw Error('File phông phải nhỏ hơn 25 MB.');
  const bytes=await fs.readFile(source);
  if(!fontSignature(bytes))throw Error('File này không phải phông chữ hợp lệ.');
  await fs.mkdir(fontDirectory(),{recursive:true});
  const family=fontFamily(source);
  await fs.writeFile(path.join(fontDirectory(),family+extension),bytes);
  return {family,bytes};
}
// ---- Tab «Dọn nhà · Sinh tồn»: dựng các clip đã xong thành một video, tự động khi hàng đợi xong (không cần bấm gì).
let restoreState={busy:false,progress:'',error:'',storyId:''};
const restoreClips=storyId=>queue.jobs.filter(j=>j.kind==='restore'&&j.phase==='clip'&&j.storyId===storyId).sort((a,b)=>(a.number||0)-(b.number||0));
const restoreDone=clips=>clips.length>0&&clips.every(j=>j.status==='completed'&&j.output);
function pruneRestoreStories(){
  const ids=new Set(queue.jobs.filter(j=>j.kind==='restore').map(j=>j.storyId));
  const all=settings.restoreStories||(settings.restoreStories={});
  for(const id of Object.keys(all))if(!ids.has(id))delete all[id];
}
async function freeRestoreId(base){
  const root=String(base||'').replace(/[^\w-]/g,'').slice(0,40).replace(/^-+|-+$/g,'')||'DonNha';
  const used=new Set(queue.jobs.map(j=>j.storyId).filter(Boolean));
  for(let n=1;n<=999;n++){
    const id=n===1?root:`${root}-${n}`;
    if(used.has(id))continue;
    try{await fs.access(restoreFolder(settings.output,id));continue;}catch{}
    return id;
  }
  return `${root}-${Date.now().toString(36)}`;
}
// Dựng video chỉ cần FFmpeg: đóng hết cửa sổ / tab trình duyệt (Muse, Chrome/Edge do tool mở, Flow) để nhường RAM. Chạy tiếp thì tool tự mở lại.
async function closeAllBrowsers(){
  await Promise.allSettled([...opening.values(),...externalLaunches.values(),flowLaunch].filter(Boolean));
  const closing=[];
  for(const [index,browser] of [...browsers.entries()]){
    if(!browser)continue;
    try{if(!browser.isDestroyed()){const r=browser.close();if(r&&typeof r.then==='function')closing.push(r.catch(()=>{}));}}catch{}
    browsers.delete(index);
  }
  if(flowBrowser&&!flowBrowser.isClosed()){closing.push(flowBrowser.close().catch(()=>{}));}
  await Promise.allSettled(closing);
  flowBrowser=null;notify();
}
async function buildRestoreStory(storyId){
  const meta=settings.restoreStories?.[storyId];
  if(!meta)throw Error('Không thấy thông tin video này.');
  const clips=restoreClips(storyId);
  if(!restoreDone(clips))throw Error('Chỉ dựng video khi mọi cảnh đã xong.');
  restoreState={busy:true,progress:'Đang đóng trình duyệt để nhường RAM…',error:'',storyId};notify();
  try{
    await licenseManager.requireLongTerm();
    await closeAllBrowsers().catch(()=>{});
    restoreState.progress='Chuẩn bị dựng video…';notify();
    const file=await assembleRestore({clips:clips.map(j=>j.output),dir:restoreFolder(settings.output,storyId),name:meta.name||storyId,ffmpeg:settings.ffmpeg,aspect:meta.aspect,music:meta.music,seams:meta.seams,onProgress:t=>{restoreState.progress=t;notify();}});
    Object.assign(meta,{output:file,builtAt:Date.now(),clipSig:clips.map(j=>j.output).join('|')});
    restoreState={busy:false,progress:'Video đã dựng xong',error:'',storyId};
  }catch(e){restoreState={busy:false,progress:'',error:e.message,storyId};}
  finally{await save();notify();}
}
// Truyện tạo lúc ít tài khoản (hoặc 1 chuỗi) chỉ có vài cảnh chạy được cùng lúc. Trước khi chạy / tiếp tục: chia lại phần CHƯA LÀM thành đủ số đoạn bằng số ô đang bật.
async function resegmentRestore(want){
  if(!(want>1))return 0;
  const stories=new Map();
  for(const job of queue.jobs)if(job.kind==='restore'&&job.storyId){if(!stories.has(job.storyId))stories.set(job.storyId,[]);stories.get(job.storyId).push(job);}
  let added=0;
  for(const [storyId,list] of stories){
    if(Number(settings.restoreStories?.[storyId]?.parallel)>0)continue;   // người dùng đã tự chọn số đoạn: giữ nguyên
    let plan=null;
    try{plan=restorePlan.resegment(list,want);}catch{plan=null;}
    if(!plan)continue;
    const targets=plan.changes.map(ch=>({ch,job:queue.jobs.find(j=>j.id===ch.id)}));
    if(targets.some(({job})=>!job||job.status!=='pending'||job.resumeMode))continue;
    for(const {ch,job} of targets){job.needs=ch.needs;job.refList=ch.refList;job.prompt=ch.prompt;}
    const meta=settings.restoreStories?.[storyId];
    if(meta)meta.seams=plan.seams.map(Number).filter(n=>Number.isInteger(n)&&n>0&&n<1000).slice(0,20);
    await queue.add(plan.images);
    added+=plan.images.length;
  }
  if(added)await save();
  return added;
}
// Sau khi hàng đợi chạy xong: truyện nào đủ cảnh và chưa dựng đúng bản clip này thì dựng.
async function buildRestoreStories({auto=false}={}){
  if(restoreState.busy||merging||packaging)return;
  for(const [storyId,meta] of Object.entries(settings.restoreStories||{})){
    const clips=restoreClips(storyId);
    if(!restoreDone(clips))continue;
    if(auto&&(!meta.auto||meta.clipSig===clips.map(j=>j.output).join('|')))continue;
    await buildRestoreStory(storyId);
  }
}
// Video dài chạy nhiều giờ: một cảnh lỗi (mạng, Muse báo bận…) không được làm đứng cả chuỗi. Cảnh lỗi tự thử lại tối đa 3 lần, mỗi lần chờ 90 giây.
// Không thử lại lỗi giấy phép / thiếu FFmpeg (thử lại cũng vô ích), và không đụng việc người dùng đã bấm Dừng (cảnh «bị gián đoạn», không phải «lỗi»).
const RESTORE_RETRIES=3,RESTORE_RETRY_WAIT=90000;
let restoreRetrying=false,lastStopAt=0;
// Mọi tài khoản đều hết hạn mức: hàng đợi tạm dừng; hẹn giờ tự chạy lại khi tài khoản đầu tiên hết nghỉ (không cần ai bấm). Bấm Dừng thì hủy hẹn.
let quotaTimer=null,rebalanceTimer=null,rebalancing=false;
function restoreQuotaResume(){
  if(quotaTimer||flushingQuit||!queue.paused||!queue.allExhausted())return;
  if(!queue.jobs.some(j=>j.kind==='restore'&&j.status==='pending'))return;
  const wait=Math.max(5000,queue.nextExhaustedAt()-Date.now()+5000),t0=Date.now();
  quotaTimer=setTimeout(async()=>{
    quotaTimer=null;
    if(flushingQuit||lastStopAt>=t0||queue.active||starting)return;
    try{await handlers.start({kind:'restore',auto:true});}catch{/* lần dừng kế tiếp sẽ hẹn lại */}
  },wait);
  notify();
}
async function restoreAutoRetry({retry,start}){
  if(restoreRetrying||stopping||flushingQuit||queue.active||starting||merging||packaging)return;
  const job=queue.jobs.find(j=>j.kind==='restore'&&j.status==='failed'&&(j.autoRetries||0)<RESTORE_RETRIES&&!/gói Năm|Vĩnh viễn|FFmpeg|ffprobe|key/i.test(j.error||''));
  if(!job||lastStopAt>=(Date.parse(job.finishedAt||'')||0))return;       // người dùng đã bấm Dừng sau khi cảnh lỗi: để yên
  restoreRetrying=true;
  try{
    job.autoRetries=(job.autoRetries||0)+1;
    const why=job.error,t0=Date.now();
    // Muse chặn vì nội dung (người nổi tiếng, nhân vật, chính sách…): gửi lại y nguyên vẫn bị chặn, nên đổi sang prompt an toàn hơn (người nhỏ / sau lưng, rồi bỏ hẳn người).
    const blocked=restorePlan.isPolicyError(why);
    if(blocked)await queue.editPrompt(job.id,restorePlan.safeRetryPrompt(job.prompt,job.autoRetries,{image:job.phase==='image'})).catch(()=>{});
    job.stageMessage=blocked
      ?`Muse chặn cảnh này vì nội dung: tự đổi prompt an toàn hơn và thử lại lần ${job.autoRetries}/${RESTORE_RETRIES} sau ${RESTORE_RETRY_WAIT/1000} giây · ${why}`
      :`Cảnh lỗi: tự thử lại lần ${job.autoRetries}/${RESTORE_RETRIES} sau ${RESTORE_RETRY_WAIT/1000} giây · ${why}`;notify();
    await delay(RESTORE_RETRY_WAIT);
    if(stopping||flushingQuit||queue.active||starting||job.status!=='failed'||lastStopAt>=t0)return;
    const failedOn=Number(job.account)||0;   // thử lại ở tài khoản khác nếu có
    if(failedOn&&settings.accountCount>1)job.avoidAccounts=[...new Set([...(job.avoidAccounts||[]),failedOn])];
    await retry(job.id);
    await start();
  }catch(e){job.stageMessage='Tự thử lại không được: '+e.message;}
  finally{restoreRetrying=false;notify();}
}
function invalidateOutputs() {
  mergedOutput='';mergeProgress='';mergeError='';editPackageDir='';packageProgress='';packageError='';
}
async function packageProject() {
  if (queue.active || starting || merging || packaging) throw Error('Chờ xử lý hiện tại hoàn tất trước khi xuất clip.');
  if (!settings.output) throw Error('Chọn thư mục lưu video trước.');
  packaging=true;packageError='';packageProgress='Chuẩn bị gói clip rời…';notify();
  try {
    editPackageDir = await exportEditPackage(JSON.parse(JSON.stringify(queue.jobs.filter(j=>j.kind==='video'))), {output:settings.output,onProgress:text=>{packageProgress=text;notify();}});
    packageProgress='Đã xuất clip theo thứ tự để nhập vào CapCut';
  } catch(e) { packageError=e.message;packageProgress='Xuất clip chưa hoàn tất'; }
  finally {packaging=false;await save();notify();}
}
app.whenReady().then(async () => {
  if (!ownsInstance) return;
  app.setAppUserModelId?.('local.musevideostudio.app');
  Menu.setApplicationMenu(null);
  stateFile = path.join(app.getPath('userData'), 'studio.json');
  let stored = {};
  try { stored = JSON.parse(await fs.readFile(stateFile, 'utf8')); } catch (e) { if (e.code !== 'ENOENT') throw e; }
  settings = { ...defaults, ...stored.settings };
  // Upgrade the old sequential default once; later explicit choices persist.
  if(stored.dispatchRevision!==1)settings.dispatchMode='parallel';
  // Discard obsolete IP/VPN preferences from v0.5 so they cannot gate login.
  for(const key of ['requireUSA','vpnProvider','vpnClientPath'])delete settings[key];
  await fs.mkdir(app.getPath('userData'),{recursive:true});
  const device=deviceCode();licenseManager=await createLicense({file:path.join(app.getPath('userData'),'license.enc'),safeStorage,device,publicKey:await fs.readFile(path.join(__dirname,'license-public.pem'),'utf8')});paymentDetails=await payment(device);
  // v0.2 changes the default to separate clips, including upgrades from v0.1.
  if (stored.configVersion !== 2) { settings.autoMerge = false; settings.autoPackage = false; }
  mergedOutput = stored.mergedOutput || ''; mergeError = stored.mergeError || '';
  editPackageDir = stored.editPackageDir || ''; packageError = stored.packageError || '';
  queue = new Queue({ jobs: stored.jobs || [], save, run: runJob, notify, accounts: () => settings.accountCount });
  voiceService=createVoiceService({dataDir:app.getPath('userData'),getFfmpeg:()=>settings.ffmpeg,notify});await voiceService.load();voiceService.refreshCatalog().catch(()=>{});
  storyService=createStoryService({getSettings:()=>settings,getJobs:()=>queue.jobs,voice:voiceService,ensureAllowed:()=>licenseManager.ensureAllowed(),notify,userDataDir:app.getPath('userData')});
  storyAnalyzer=createStoryAnalyzer({dom,openMuse,getMuse:index=>browsers.get(index),getSettings:()=>settings,delay,notify,isBusy:()=>accountOperationBusy()||resettingAccounts.size>0,ensureAllowed:()=>licenseManager.ensureAllowed()});
  await save();
  main = new BrowserWindow({ icon:path.join(__dirname,'assets','muse-studio.png'), width: 1450, height: 950, minWidth: 1000, minHeight: 700, backgroundColor: '#101114', webPreferences: { preload: path.join(__dirname, 'preload.cjs'), nodeIntegration: false, contextIsolation: true, sandbox: true } });
  main.setMenu(null);main.setMenuBarVisibility(false);
  main.on('close',event=>{
    if(quitAllowed)return;
    event.preventDefault();if(flushingQuit||closePrompt)return;
    closePrompt=dialog.showMessageBox(main,{type:'question',title:settings.language==='vi'?'Thoát Muse Video Studio?':'Exit Muse Video Studio?',message:settings.language==='vi'?'Bạn muốn thoát hẳn ứng dụng?':'Exit the application completely?',detail:settings.language==='vi'?'Thoát hẳn sẽ dừng hàng đợi, lưu tiến trình và đóng các trình duyệt do ứng dụng mở.':'This stops the queue, saves progress and closes app-managed browsers.',buttons:settings.language==='vi'?['Thoát hẳn','Ở lại']:['Exit completely','Stay'],defaultId:1,cancelId:1,noLink:true})
      .then(result=>{if(result.response===0&&!flushingQuit)app.quit();})
      .catch(()=>{if(!main.isDestroyed())main.focus();})
      .finally(()=>{closePrompt=null;});
  });
  main.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  main.webContents.on('will-navigate', e => e.preventDefault());
  const handlers = {
    state: () => snapshot(),
    // Tab «Kể chuyện»: giọng miễn phí + ghép MP4.
    storySetupVoice:async()=>{voiceService.setup().then(()=>voiceService.refreshCatalog()).catch(()=>{}).finally(notify);notify();return snapshot();},
    storyRefreshVoices:async()=>{await voiceService.refreshCatalog({force:true});return snapshot();},
    storyCancelSetup:async()=>{voiceService.cancelSetup();return snapshot();},
    storyWindowsVoices:async()=>{await voiceService.listWindowsVoices();return snapshot();},
    storyAddVoice:async data=>{
      const picked=await dialog.showOpenDialog(main,{title:ui('Chọn file ghi âm giọng mẫu','Choose a voice sample'),properties:['openFile'],filters:[{name:ui('Ghi âm / video','Audio / video'),extensions:['wav','mp3','m4a','aac','ogg','flac','mp4','mov','webm']}]});
      if(picked.canceled||!picked.filePaths[0])return snapshot();
      await voiceService.addClone({name:data?.name,source:picked.filePaths[0],consent:data?.consent===true});return snapshot();
    },
    storyRemoveVoice:async key=>{await voiceService.removeClone(String(key||''));return snapshot();},
    storyListen:async data=>voiceService.preview({engine:String(data?.engine||''),voice:String(data?.voice||''),text:String(data?.text||''),tempo:Number(data?.tempo)||1,volume:data?.volume===undefined?1:Number(data.volume)}),
    storyPrepare:async data=>storyService.prepare({storyId:String(data?.storyId||''),engine:String(data?.engine||'none'),voice:String(data?.voice||''),tempo:Number(data?.tempo)||1,volume:data?.volume===undefined?1:Number(data.volume)}),
    storyBuild:async data=>{await storyService.build({runId:String(data?.runId||''),name:String(data?.name||''),aspect:String(data?.aspect||'16:9'),subtitles:data?.subtitles!==false,srt:data?.srt===true,sfx:String(data?.sfx||'off'),scenes:Array.isArray(data?.scenes)?data.scenes:[]});return snapshot();},
    storyCancel:async()=>{storyService.cancel();return snapshot();},
    storyAnalyze:async data=>{
      try{return await storyAnalyzer.run({script:String(data?.script||''),options:{seconds:Number(data?.seconds),reference:Boolean(data?.reference),aspect:String(data?.aspect||'16:9'),style:String(data?.style||''),character:String(data?.character||''),form:String(data?.form||''),ad:data?.ad,tip:data?.tip===true,tipKind:['plant','history'].includes(data?.tipKind)?data.tipKind:'tip',tipMotion:data?.tipMotion==='full'?'full':'gentle',tipPrompt:data?.tipPrompt==='vi'?'vi':'en',histLook:data?.histLook==='film'?'film':'cartoon'},resume:data?.resume&&{from:Number(data.resume.from),cast:String(data.resume.cast||''),understanding:data.resume.understanding&&typeof data.resume.understanding==='object'?{summary:String(data.resume.understanding.summary||''),approach:String(data.resume.understanding.approach||''),setting:String(data.resume.understanding.setting||'')}:null}});}
      finally{if(!starting&&!queue.active&&!flushingQuit&&main&&!main.isDestroyed()){main.show();main.focus();}}
    },
    storyAdWrite:async data=>{
      try{return await storyAnalyzer.writeScript({options:{seconds:Number(data?.seconds)||10,reference:Boolean(data?.reference),aspect:String(data?.aspect||'16:9'),style:String(data?.style||''),character:String(data?.character||''),ad:data?.ad,tip:Boolean(data?.tip),tipTitle:String(data?.tipTitle||''),tipMinutes:Number(data?.tipMinutes)||2,tipLanguage:String(data?.tipLanguage||'vi'),tipKind:['plant','history'].includes(data?.tipKind)?data.tipKind:'tip',tipMotion:data?.tipMotion==='full'?'full':'gentle',tipPrompt:data?.tipPrompt==='vi'?'vi':'en',histLook:data?.histLook==='film'?'film':'cartoon'}});}
      finally{if(!starting&&!queue.active&&!flushingQuit&&main&&!main.isDestroyed()){main.show();main.focus();}}
    },
    storyAnalyzeCancel:async()=>{storyAnalyzer.cancel();return snapshot();},
    // Phông phụ đề do bạn tự thêm: sao chép vào thư mục dữ liệu của app, lần sau mở app tự nạp lại.
    storyFonts:async()=>listUserFonts(),
    storyAddFont:async()=>{
      const picked=await dialog.showOpenDialog(main,{title:ui('Chọn file phông chữ (.ttf, .otf, .woff, .woff2)','Choose a font file (.ttf, .otf, .woff, .woff2)'),properties:['openFile'],filters:[{name:ui('Phông chữ','Fonts'),extensions:['ttf','otf','woff','woff2']}]});
      if(picked.canceled||!picked.filePaths?.[0])return null;
      return addUserFont(picked.filePaths[0]);
    },
    // Thêm truyện mới thì dọn truyện cũ đã xong và đã xuất MP4 khỏi hàng đợi (clip đã tải vẫn nằm trong thư mục).
    storyClearDone:async data=>{
      const ids=(Array.isArray(data?.ids)?data.ids:[]).map(String).filter(Boolean).slice(0,200);
      if(ids.length)await queue.removeFinishedStories(ids);
      await save();notify();return snapshot();
    },
    storyFreeId:async data=>freeStoryId(String(data?.base||''),{output:settings.output,jobs:queue.jobs}),
    storyReveal:async()=>{const out=storyService.status().output;if(out)shell.showItemInFolder(out);return true;},
    // «Tải video»: hộp «Lưu như…» để chọn nơi lưu một bản sao MP4 (kèm .srt cùng tên nếu có và chưa có file trùng).
    storySave:async()=>{
      const st=storyService.status(),out=st.output;if(!out)return false;
      const picked=await dialog.showSaveDialog(main,{title:ui('Tải video về','Save video'),defaultPath:path.join(app.getPath('downloads'),path.basename(out)),filters:[{name:'MP4',extensions:['mp4']}]});
      if(picked.canceled||!picked.filePath)return false;
      const dest=/\.mp4$/i.test(picked.filePath)?picked.filePath:picked.filePath+'.mp4';
      if(path.resolve(dest).toLowerCase()!==path.resolve(out).toLowerCase())await fs.copyFile(out,dest);
      let srt='';
      if(st.srt){const to=dest.replace(/\.mp4$/i,'.srt');try{await fs.copyFile(st.srt,to,fs.constants.COPYFILE_EXCL);srt=to;}catch{/* đã có file .srt trùng tên hoặc không đọc được: bỏ qua, không ghi đè */}}
      shell.showItemInFolder(dest);return{file:dest,srt};
    },
    language:async value=>{if(!['vi','en'].includes(value))throw Error('Unsupported language');settings.language=value;await save();notify();return snapshot();},
    testBrowsers,
    openOutput:async data=>{if(!settings.output)throw Error('Chọn thư mục lưu video trước.');const folder=data?.kind==='image'?imageDirectory():data?.kind==='story'?path.join(settings.output,'KeChuyen'):data?.kind==='restore'?path.join(settings.output,'DonNha'):settings.output;await fs.mkdir(folder,{recursive:true});const error=await shell.openPath(folder);if(error)throw Error(error);},
    activateKey:async token=>{await licenseManager.activate(token);notify();return snapshot();},
    add: async data => { if (merging || packaging) throw Error('Chờ xử lý đầu ra xong trước khi thêm prompt.'); if(Array.isArray(data)&&data.some(j=>j?.kind==='restore'))await licenseManager.requireLongTerm(); if(!(Array.isArray(data)&&data.length&&data.every(j=>j?.kind==='image'||j?.kind==='story'||j?.kind==='restore')))invalidateOutputs(); await queue.add(data); return snapshot(); },
    retryDownload: async id=>{
      if(stopping||queue.active||merging||packaging||starting||resettingAccounts.size)throw Error('Chờ xử lý hiện tại hoàn tất.');
      invalidateOutputs();queue.recover(id,(job,signal)=>runJob(job,0,signal,{recover:true})).catch(e=>dialog.showErrorBox(ui('Lấy video đã tạo','Recover existing video'),e.message)).finally(notify);return snapshot();
    },
    regenerate: async id=>{
      if(accountOperationBusy()||resettingAccounts.size)throw Error('Chờ hoặc dừng tác vụ hiện tại trước khi tạo lại.');
      const job=queue.jobs.find(j=>j.id===id);if(!job||job.status!=='completed'||!job.output)throw Error('Chỉ tạo lại cảnh đã hoàn thành.');
      const index=Math.max(0,Number(job.account||1)-1);validAccount(index);
      const epoch=runEpoch;starting=true;notify();
      try{
        await licenseManager.ensureAllowed();await openMuse(index);
        if(epoch!==runEpoch||flushingQuit||stopping)return snapshot();
        if(job.kind==='video')invalidateOutputs();queue.regenerate(id).catch(e=>dialog.showErrorBox(ui('Tạo lại','Regenerate'),e.message)).finally(notify);
      }finally{starting=false;notify();}
      return snapshot();
    },
    // Nút riêng trên thẻ cảnh đang chạy: 'skip' = dừng cảnh này (các cảnh khác chạy tiếp), 'again' = dừng rồi gửi lại ngay.
    cancelJob: async data => {
      const id=String(data?.id||''),mode=data?.mode==='again'||data?.mode==='other'?data.mode:'skip';
      if(stopping||merging||packaging)throw Error('Chờ xử lý hiện tại hoàn tất.');
      const job=queue.jobs.find(j=>j.id===id);
      if(!job||job.status!=='running')throw Error('Cảnh này không còn đang chạy.');
      if(mode==='other'&&settings.accountCount<2)throw Error('Cần chạy song song từ 2 tài khoản trở lên để chuyển cảnh sang tài khoản khác.');
      if(job.kind==='video')invalidateOutputs();
      const hold=remoteStopJob(job);
      await queue.cancelJob(id,mode,hold);
      browsers.get(Number(job.account)-1)?.releasePage?.(id);
      notify();return snapshot();
    },
    // Thêm video làm tay cho một cảnh chưa xong (vd tạo ở tài khoản khác rồi tải lên): sao chép vào thư mục lưu, đặt tên theo số cảnh.
    attachVideo: async data => {
      const id=String(data?.id||'');
      if(stopping||merging||packaging)throw Error('Chờ xử lý hiện tại hoàn tất.');
      const find=()=>{const j=queue.jobs.find(x=>x.id===id);if(!j||j.kind==='image'||isPhoto(j))throw Error('Chỉ thêm video cho cảnh video.');if(j.status==='completed')throw Error('Cảnh này đã có video. Bấm «Tạo lại» nếu muốn làm lại.');return j;};
      find();
      if(!settings.output)throw Error('Chọn thư mục lưu video trước.');
      const picked=await dialog.showOpenDialog(main,{title:ui('Chọn video của cảnh này (MP4 hoặc WebM)','Choose the video for this scene (MP4 or WebM)'),properties:['openFile'],filters:[{name:ui('Video MP4 / WebM','MP4 / WebM video'),extensions:['mp4','webm']}]});
      if(picked.canceled||!picked.filePaths?.[0])return snapshot();
      let job=find();
      if(job.kind==='restore')await licenseManager.requireLongTerm();
      const outputDir=jobFolder(job);
      await fs.mkdir(outputDir,{recursive:true});
      const temporary=path.join(outputDir,`.muse-${job.id}-${randomUUID().slice(0,8)}.part`);
      let target='';
      try{
        // Sao chép (không di chuyển) để file gốc của người dùng còn nguyên.
        await fs.copyFile(picked.filePaths[0],temporary,fs.constants.COPYFILE_EXCL);
        let format;
        try{format=await validateVideo(temporary);}catch{throw Error('File này không phải video MP4 / WebM hợp lệ hoặc bị hỏng. Chọn file khác.');}
        target=await saveOrderedOutput(temporary,outputDir,job,format.extension);
        job=find();
        if(job.status==='running'){
          // Cảnh còn đang chờ Muse: dừng ở Muse rồi mới thay bằng video đã chọn.
          const hold=remoteStopJob(job);
          await queue.cancelJob(id,'skip',hold);
          browsers.get(Number(job.account)-1)?.releasePage?.(id);
        }
        invalidateOutputs();
        const lastFrame=job.kind==='restore'?await saveLastFrame(job,target):'';
        await queue.attachManual(id,target);
        if(lastFrame){const done=queue.jobs.find(j=>j.id===id);if(done)done.lastFrame=lastFrame;}
      }catch(error){
        await fs.rm(temporary,{force:true}).catch(()=>{});
        if(target)await fs.rm(target,{force:true}).catch(()=>{});
        throw error;
      }
      notify();return snapshot();
    },
    editPrompt: async data => {
      const id=String(data?.id||''),prompt=String(data?.prompt??''),resend=data?.resend===true;
      if(stopping||merging||packaging)throw Error('Chờ xử lý hiện tại hoàn tất.');
      const job=queue.jobs.find(j=>j.id===id);
      if(!job)throw Error('Không tìm thấy cảnh này.');
      if(job.status==='running'){
        if(!resend)throw Error('Cảnh đang chạy. Chọn «Lưu và gửi lại ngay» để dừng rồi gửi prompt mới.');
        if(job.kind==='video')invalidateOutputs();
        await queue.cancelJob(id,'again',remoteStopJob(job),prompt);
      }else{
        const browser=browsers.get(Number(job.account)-1);
        await queue.editPrompt(id,prompt);
        if(resend&&['failed','interrupted'].includes(job.status)){if(job.kind==='video')invalidateOutputs();await queue.retry(id);browser?.releasePage?.(id);}
      }
      return snapshot();
    },
    retry: async id => { if (merging || packaging) throw Error('Đang xử lý đầu ra video.'); const target=queue.jobs.find(j=>j.id===id),browser=browsers.get(Number(target?.account)-1);if(target?.kind==='video')invalidateOutputs(); await queue.retry(id);browser?.releasePage?.(id); return snapshot(); },
    remove: async id => { if (merging || packaging) throw Error('Đang xử lý đầu ra video.'); const removed=queue.jobs.find(j=>j.id===id);if(removed?.kind==='video')invalidateOutputs(); await queue.remove(id);browsers.get(Number(removed?.account)-1)?.releasePage?.(id);if(removed?.trackerId)void dom(browsers.get(Number(removed.account)-1),endTracking,{id:removed.trackerId}).catch(()=>{}); return snapshot(); },
    browser: async index => { await openMuse(Number(index ?? 0)); return true; },
    diagnostics: async index=>{
      index=Number(index??0);validLoginAccount(index);const muse=browsers.get(index);assertMuse(muse);
      const jobs=queue.jobs.filter(j=>j.account===index+1).slice(-8);
      const structure=await dom(muse,chatDiagnostics,{jobs:jobs.map(j=>({id:j.id,prompt:j.lockedInput?.prompt||j.prompt,number:j.number})),composerSelector:settings.composer});
      const result=await dialog.showSaveDialog(main,{defaultPath:`Muse-chat-diagnostics-TK${index+1}.json`,filters:[{name:'Thông tin lỗi',extensions:['json']}]});
      if(result.canceled)return false;
      await atomic(result.filePath,{version:app.getVersion?.()||'0.7.1',account:index+1,jobs:jobs.map(j=>({id:j.id,title:j.title,number:j.number,status:j.status,stage:j.stage,error:j.error,submittedAt:j.submittedAt,remoteStop:j.remoteStop,trackerId:j.trackerId,echoKey:j.echoKey,echoMarker:j.echoMarker,acknowledgedAt:j.acknowledgedAt,promptHash:j.lockedInput?.promptHash,referenceHashes:j.lockedInput?.references.map(r=>r.sha256)})),structure});
      shell.showItemInFolder?.(result.filePath);return true;
    },
    logoutAccount: async index => {await logoutAccount(Number(index??0));return snapshot();},
    start: async data => {
      const kind=data?.kind==='image'?'image':data?.kind==='story'?'story':data?.kind==='restore'?'restore':'video';
      if(merging || packaging) throw Error('Đang xử lý đầu ra video.');
      if(storyAnalyzer?.busy) throw Error('Muse đang phân tích câu chuyện. Chờ xong hoặc bấm Dừng phân tích.');
      if(resettingAccounts.size) throw Error('Chờ đăng xuất tài khoản hoàn tất trước khi chạy.');
            if(queue.active || starting || stopping) return snapshot();
      const epoch=runEpoch;starting=true;startError='';notify();
      try {
        if(testing){probeController?.abort();await Promise.allSettled([...probeMutations]);await probeSettled;}
        if(epoch!==runEpoch || flushingQuit)return snapshot();
        if(kind==='restore'){await licenseManager.requireLongTerm();await checkTools(settings.ffmpeg).catch(()=>{throw Error('Tab «Dọn nhà · Sinh tồn» cần FFmpeg để nối cảnh và dựng video. Chọn ffmpeg.exe (cùng thư mục ffprobe.exe) ở «Kết nối & cài đặt».');});}
        else await licenseManager.ensureAllowed();
        if(epoch!==runEpoch || flushingQuit)return snapshot();
        const pendingRestore=kind==='restore'?queue.jobs.filter(j=>j.kind==='restore'&&j.status!=='completed'):[];
        const flowMode=pendingRestore.some(j=>j.provider==='flow');
        const thumbOnly=pendingRestore.length>0&&pendingRestore.every(j=>j.phase==='image'&&j.number>=restorePlan.THUMB_NUMBER);   // chỉ còn việc tạo thumbnail: mở 1 trình duyệt là đủ
        if(flowMode&&pendingRestore.some(j=>j.provider!=='flow'))throw Error('Hàng đợi đang có cảnh chạy bằng Flow lẫn cảnh chạy bằng Muse. Chạy xong hoặc xóa một loại trước.');
        if(flowMode){await ensureFlowBrowser();if(epoch!==runEpoch||flushingQuit)return snapshot();}
        else await Promise.all(Array.from({length:thumbOnly?1:settings.accountCount},async(_,index)=>{
          if(epoch!==runEpoch||flushingQuit)return;
          if(opening.has(index))await opening.get(index);
          const browser=browsers.get(index);if(!browser||browser.isDestroyed()||!browser.museStarted)await openMuse(index);
          if(epoch!==runEpoch||flushingQuit)return;assertMuse(browsers.get(index));
        }));
        if(epoch!==runEpoch||flushingQuit)return snapshot();
        if(settings.autoMerge&&kind==='video') await checkTools(settings.ffmpeg);
        if(epoch!==runEpoch || flushingQuit || queue.active || merging || packaging || resettingAccounts.size) return snapshot();
        const unavailable=queue.jobs.find(j=>j.kind===kind&&j.account>settings.accountCount&&(['failed','interrupted'].includes(j.status)||j.resumeMode));
        if(unavailable)throw Error('Cảnh đang dở gắn với tài khoản '+unavailable.account+'. Chọn đủ tài khoản trước khi Tiếp tục.');
        queue.prepareResume(kind);
        if(!data?.auto)queue.exhausted.clear();   // người dùng bấm chạy tay: thử lại mọi tài khoản, kể cả tài khoản đang nghỉ
        queue.concurrency=flowMode?settings.flowParallel:thumbOnly?1:settings.dispatchMode==='parallel'?settings.accountCount:1;
        if(kind==='restore'&&queue.concurrency>1){try{const n=await resegmentRestore(queue.concurrency);if(n)notify();}catch{}}
        // Đang chạy mà có ô rảnh (đoạn của ô đó đã xong, đoạn khác còn dài): chia nốt phần còn lại của đoạn dài cho ô rảnh, để các ô «xoay vòng» sang chỗ còn việc.
        clearInterval(rebalanceTimer);rebalanceTimer=null;
        if(kind==='restore'&&queue.concurrency>1){
          const lane=queue.concurrency;
          rebalanceTimer=setInterval(async()=>{
            if(!queue.active||queue.paused||rebalancing||flushingQuit)return;
            if(queue.jobs.filter(j=>j.kind==='restore'&&j.status==='running').length>=lane)return;
            rebalancing=true;
            try{const n=await resegmentRestore(lane);if(n)notify();}catch{}finally{rebalancing=false;}
          },15000);
        }
        queue.start(kind).then(async()=>{
          clearInterval(rebalanceTimer);rebalanceTimer=null;
          const videos=queue.jobs.filter(j=>j.kind==='video');
          if(kind==='video' && !queue.paused && videos.length && videos.every(j=>j.status==='completed')) {
            if(settings.autoMerge) await mergeProject();else if(settings.autoPackage) await packageProject();
          }
          if(kind==='restore' && !queue.paused && !flushingQuit) await buildRestoreStories({auto:true});
          if(kind==='restore' && queue.paused && !flushingQuit){ void restoreAutoRetry({retry:id=>handlers.retry(id),start:()=>handlers.start({kind:'restore',auto:true})}); restoreQuotaResume(); }
        }).catch(e=>dialog.showErrorBox(ui('Lỗi xử lý hàng đợi','Queue processing error'),e.message)).finally(notify);
        return snapshot();
      } catch(e){startError=e.message;throw e;} finally {if(epoch===runEpoch)starting=false;notify();}
    },
    // Tab «Dọn nhà · Sinh tồn»: thêm các cảnh (đã lập sẵn ở giao diện), nhớ cách dựng video, rồi tự chạy nếu được chọn.
    restoreCreate: async data => {
      if(merging||packaging)throw Error('Chờ xử lý đầu ra xong trước khi thêm cảnh.');
      await licenseManager.requireLongTerm();
      if(!settings.output)throw Error('Chọn thư mục lưu video trước.');
      const jobs=Array.isArray(data?.jobs)?JSON.parse(JSON.stringify(data.jobs)):[];
      if(!jobs.length||jobs.length>1000||jobs.some(j=>!j||j.kind!=='restore'||typeof j.prompt!=='string'))throw Error('Không có cảnh hợp lệ để thêm.');
      const meta=data?.meta||{};
      const storyId=await freeRestoreId(String(data?.idBase||'DonNha'));
      const folder=restoreFolder(settings.output,storyId);
      // Ảnh gốc của người dùng: sao chép vào thư mục video để xóa / đổi tên ảnh sau này không làm hỏng các cảnh sau.
      const photos=new Map();
      for(const j of jobs)for(const r of j.refList||[])if(r?.file&&!photos.has(r.file)){
        if(typeof r.file!=='string'||!/\.(png|jpe?g|webp)$/i.test(r.file))throw Error('Ảnh gốc phải là PNG, JPG hoặc WEBP.');
        const stat=await fs.stat(r.file).catch(()=>null);
        if(!stat?.isFile()||stat.size>62914560)throw Error('Không đọc được ảnh gốc (hoặc ảnh lớn hơn 60 MB).');
        await fs.mkdir(path.join(folder,'anh'),{recursive:true});
        const copy=path.join(folder,'anh','000-goc'+path.extname(r.file).toLowerCase());
        await fs.copyFile(r.file,copy);photos.set(r.file,copy);
      }
      for(const j of jobs){j.storyId=storyId;for(const r of j.refList||[])if(r?.file)r.file=photos.get(r.file);}
      for(const j of jobs){const first=(j.refList||[]).find(r=>r.file);if(first&&!j.needs?.length)j.references=[first.file];}
      let music='';
      if(typeof meta.music==='string'&&meta.music){
        if(!MUSIC_EXT.has(path.extname(meta.music).toLowerCase())||!(await fs.stat(meta.music).catch(()=>null))?.isFile())throw Error('Không đọc được tệp nhạc nền.');
        await fs.mkdir(folder,{recursive:true});
        music=path.join(folder,'nhac-nen'+path.extname(meta.music).toLowerCase());await fs.copyFile(meta.music,music);
      }
      const all=settings.restoreStories||(settings.restoreStories={});
      all[storyId]={name:String(meta.name||storyId).slice(0,120),aspect:['16:9','9:16'].includes(meta.aspect)?meta.aspect:'16:9',music,seams:Array.isArray(meta.seams)?meta.seams.map(Number).filter(n=>Number.isInteger(n)&&n>0&&n<1000).slice(0,20):[],auto:meta.auto!==false,theme:String(meta.theme||'').slice(0,40),parallel:Number(meta.parallel)>0?Math.min(10,Math.round(Number(meta.parallel))):0,createdAt:Date.now()};
      for(const id of Object.keys(all).slice(0,Math.max(0,Object.keys(all).length-40)))delete all[id];
      await queue.add(jobs);
      await save();notify();
      let startError2='';
      if(all[storyId].auto&&!queue.active&&!starting){try{await handlers.start({kind:'restore'});}catch(e){startError2=e.message;}}
      return {storyId,startError:startError2};
    },
    // Dựng (lại) video từ các cảnh đã xong, ví dụ sau khi «Tạo lại» một cảnh.
    restoreBuild: async data => {
      if(queue.active||starting||merging||packaging||restoreState.busy)throw Error('Chờ xử lý hiện tại hoàn tất.');
      const meta=settings.restoreStories?.[String(data?.storyId||'')];
      if(!meta)throw Error('Không thấy video này.');
      if(typeof data?.music==='string'&&(data.music===''||MUSIC_EXT.has(path.extname(data.music).toLowerCase()))){
        if(data.music){if(!(await fs.stat(data.music).catch(()=>null))?.isFile())throw Error('Không đọc được tệp nhạc nền.');
          const copy=path.join(restoreFolder(settings.output,data.storyId),'nhac-nen'+path.extname(data.music).toLowerCase());await fs.mkdir(path.dirname(copy),{recursive:true});await fs.copyFile(data.music,copy);meta.music=copy;}
        else meta.music='';
      }
      await buildRestoreStory(String(data.storyId));
      return snapshot();
    },
    // «Lưu video…»: hộp «Lưu như…» để chọn nơi lưu và đặt tên cho bản sao MP4 hoàn chỉnh.
    restoreSave: async data => {
      const out=settings.restoreStories?.[String(data?.storyId||'')]?.output;
      if(!out||!await fs.stat(out).then(s=>s.isFile(),()=>false))throw Error(ui('Chưa có video hoàn chỉnh để lưu.','There is no finished video to save yet.'));
      const picked=await dialog.showSaveDialog(main,{title:ui('Lưu video về','Save video'),defaultPath:path.join(app.getPath('downloads'),path.basename(out)),filters:[{name:'MP4',extensions:['mp4']}]});
      if(picked.canceled||!picked.filePath)return false;
      const dest=/\.mp4$/i.test(picked.filePath)?picked.filePath:picked.filePath+'.mp4';
      if(path.resolve(dest).toLowerCase()!==path.resolve(out).toLowerCase())await fs.copyFile(out,dest);
      shell.showItemInFolder(dest);return{file:dest};
    },
    // «Tạo thumbnail 16:9»: gửi prompt cho Muse vẽ ảnh thumbnail «trước / sau» từ ảnh gốc và khung cuối của video (việc ảnh số THUMB_NUMBER trong hàng đợi).
    restoreThumb: async data => {
      const storyId=String(data?.storyId||''),meta=settings.restoreStories?.[storyId];
      if(!meta)throw Error(ui('Không thấy video này.','This video was not found.'));
      if(queue.active||starting||merging||packaging||restoreState.busy)throw Error(ui('Chờ xử lý hiện tại hoàn tất.','Wait for the current work to finish.'));
      const clips=restoreClips(storyId);
      if(!restoreDone(clips))throw Error(ui('Chỉ tạo thumbnail khi mọi cảnh đã xong.','Create the thumbnail once every scene is done.'));
      const exists=async f=>Boolean(f)&&await fs.stat(f).then(x=>x.isFile()&&x.size>0,()=>false);
      let before=clips[0].references?.[0]||clips[0].refList?.find(r=>r.file)?.file||'';
      if(!await exists(before)){const base=queue.jobs.find(j=>j.kind==='restore'&&j.storyId===storyId&&j.phase==='image'&&j.number===1);before=base?.output||'';}
      if(!await exists(before))throw Error(ui('Không thấy ảnh gốc của video này để làm ảnh «trước».','The original photo of this video is missing, so there is no “before” picture.'));
      const last=clips[clips.length-1];let after=last.lastFrame||'';
      if(!await exists(after))after=await extractLastFrame({ffmpeg:settings.ffmpeg,clip:last.output,out:path.join(restoreFolder(settings.output,storyId),'thumb-sau.png')});
      const old=queue.jobs.find(j=>j.kind==='restore'&&j.storyId===storyId&&j.phase==='image'&&j.number===restorePlan.THUMB_NUMBER);
      if(old)await queue.remove(old.id);
      await queue.add([{kind:'restore',storyId,phase:'image',number:restorePlan.THUMB_NUMBER,title:'Thumbnail 16:9',prompt:restorePlan.thumbnailPrompt({title:meta.name,lang:settings.language==='en'?'en':'vi'}),references:[before,after],refList:[{file:before},{file:after}],needs:[]}]);
      await save();notify();
      await handlers.start({kind:'restore'});
      return snapshot();
    },
    // «Lưu thumbnail…»: hộp «Lưu như…» để chọn nơi lưu bản sao ảnh thumbnail.
    restoreThumbSave: async data => {
      const job=queue.jobs.find(j=>j.kind==='restore'&&j.storyId===String(data?.storyId||'')&&j.phase==='image'&&j.number===restorePlan.THUMB_NUMBER);
      const out=job?.status==='completed'?job.output:'';
      if(!out||!await fs.stat(out).then(s=>s.isFile(),()=>false))throw Error(ui('Chưa có ảnh thumbnail để lưu.','There is no thumbnail to save yet.'));
      const ext=path.extname(out).toLowerCase()||'.png',name=(settings.restoreStories?.[job.storyId]?.name||job.storyId).replace(/[\\/:*?"<>|]+/g,' ').trim().slice(0,60)||'thumbnail';
      const picked=await dialog.showSaveDialog(main,{title:ui('Lưu thumbnail về','Save thumbnail'),defaultPath:path.join(app.getPath('downloads'),name+' - thumbnail'+ext),filters:[{name:ui('Ảnh','Image'),extensions:[ext.slice(1)]}]});
      if(picked.canceled||!picked.filePath)return false;
      const dest=path.extname(picked.filePath).toLowerCase()===ext?picked.filePath:picked.filePath+ext;
      if(path.resolve(dest).toLowerCase()!==path.resolve(out).toLowerCase())await fs.copyFile(out,dest);
      shell.showItemInFolder(dest);return{file:dest};
    },
    restoreReveal: async data => { const out=settings.restoreStories?.[String(data?.storyId||'')]?.output;if(out)shell.showItemInFolder(out);return true; },
    chooseMusic: async () => { const r=await dialog.showOpenDialog(main,{properties:['openFile'],filters:[{name:ui('Nhạc nền','Background music'),extensions:['mp3','wav','m4a','aac','ogg','flac']}]});return r.canceled?'':r.filePaths[0]; },
    merge: async () => { await mergeProject(); return snapshot(); },
    packageClips: async () => { await packageProject(); return snapshot(); },
    openPackage: () => { if(editPackageDir) return shell.openPath(editPackageDir); },
    revealMerged: () => { if(mergedOutput) shell.showItemInFolder(mergedOutput); },
    chooseBrowser: async () => {
      const result=await dialog.showOpenDialog(main,{properties:['openFile'],title:ui('Chọn Chrome, Edge hoặc trình duyệt Chromium (.exe)','Choose Chrome, Edge or another Chromium executable')});
      return result.canceled ? '' : result.filePaths[0];
    },
    chooseFfmpeg: async () => {
      if(queue.active || merging || packaging) throw Error('Chờ xử lý hoàn tất trước khi đổi FFmpeg.');
      const r=await dialog.showOpenDialog(main,{properties:['openFile'],title:ui('Chọn ffmpeg.exe (ffprobe.exe phải ở cùng thư mục)','Choose ffmpeg.exe (ffprobe.exe must be alongside it)')});
      if(!r.canceled){await checkTools(r.filePaths[0]);settings.ffmpeg=r.filePaths[0];await save();notify();}return snapshot();
    },
    pause: stopAll,
    stop: stopAll,
    clearPending: async data=>{if(merging||packaging)throw Error('Chờ xử lý đầu ra hoàn tất.');const kind=data?.kind==='image'?'image':data?.kind==='story'?'story':data?.kind==='restore'?'restore':data?.kind==='video'?'video':'';if(kind==='video'||kind==='')invalidateOutputs();await queue.clearPending(kind);return snapshot();},
    clearList: async data=>{if(stopping||merging||packaging)throw Error('Chờ xử lý đầu ra hoàn tất.');const kind=data?.kind==='image'?'image':data?.kind==='story'?'story':data?.kind==='restore'?'restore':data?.kind==='video'?'video':'';await stopAll();for(const job of queue.jobs.filter(j=>!kind||j.kind===kind)){browsers.get(Number(job.account)-1)?.releasePage?.(job.id);if(job.trackerId)void dom(browsers.get(Number(job.account)-1),endTracking,{id:job.trackerId}).catch(()=>{});}await queue.clearAll(kind);if(kind==='video'||kind==='')invalidateOutputs();if(kind==='restore'||kind==='')pruneRestoreStories();await save();notify();return snapshot();},
    applyReferences: async data=>{
      if(data?.assignments){for(const row of data.assignments){const j=queue.jobs.find(x=>x.id===row.id&&x.status==='pending'&&!x.lockedInput);if(j){if(!Array.isArray(row.references)||row.references.some(x=>typeof x!=='string'))throw Error('Ảnh không hợp lệ.');j.references=[...row.references];j.image=j.references[0]||'';}}await queue.publish();}
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
      if (testing || stopping || resettingAccounts.size || queue.active || starting || opening.size || externalLaunches.size || merging || packaging) throw Error('Chờ tác vụ hiện tại kết thúc trước khi đổi cài đặt.');
      for (const k of ['composer','fileInput','submit','video']) { if (typeof data[k] !== 'string' || data[k].length > 2000) throw Error('Selector không hợp lệ.'); }
      if (!data.composer.trim() || !data.fileInput.trim() || !data.video.trim()) throw Error('Không được để trống selector bắt buộc.');
      const image=typeof data.image==='string'&&data.image.trim()?data.image.trim():settings.image||'img';
      if(image.length>2000)throw Error('Selector ảnh kết quả quá dài.');
      const stopSelector=typeof data.stopSelector==='string'?data.stopSelector.trim():settings.stopSelector;
      if(stopSelector.length>2000)throw Error('Selector nút dừng quá dài.');
      const dispatchMode=data.dispatchMode ?? settings.dispatchMode,cooldownSeconds=Number(data.cooldownSeconds ?? settings.cooldownSeconds),messageSelector=typeof data.messageSelector==='string'?data.messageSelector.trim():settings.messageSelector;
      if(!['sequential','parallel'].includes(dispatchMode))throw Error('Chọn chế độ chạy hợp lệ.');
      if(!Number.isFinite(cooldownSeconds)||cooldownSeconds<0||cooldownSeconds>120)throw Error('Khoảng nghỉ từ 0–120 giây.');
      if(messageSelector.length>2000)throw Error('Selector phản hồi quá dài.');
      const attachmentReadySelector=typeof data.attachmentReadySelector==='string'?data.attachmentReadySelector.trim():settings.attachmentReadySelector;
      if(attachmentReadySelector.length>2000)throw Error('Selector ảnh quá dài.');
      const minutes = Number(data.timeoutMinutes); if (!Number.isFinite(minutes) || minutes < 1 || minutes > 120) throw Error('Ngưỡng báo Muse chậm phải từ 1–120 phút.');
      const accountCount = Number(data.accountCount); if (!Number.isInteger(accountCount) || accountCount < 1 || accountCount > 10) throw Error('Chọn từ 1–10 tài khoản.');
      const flowProjectUrl=typeof data.flowProjectUrl==='string'?data.flowProjectUrl.trim():settings.flowProjectUrl;
      if(flowProjectUrl&&!/^https:\/\/flow\.google\.com\/(?:[a-z-]+\/)?project\/[\w-]+/i.test(flowProjectUrl))throw Error('Đường dẫn dự án Flow phải dạng https://flow.google.com/project/… (copy từ thanh địa chỉ khi đang mở dự án).');
      const flowParallel=data.flowParallel==null?settings.flowParallel:Number(data.flowParallel);
      if(!Number.isInteger(flowParallel)||flowParallel<1||flowParallel>6)throw Error('Số clip Flow chạy cùng lúc từ 1–6.');
      const flowModel=data.flowModel??settings.flowModel;
      if(!['lite','fast','quality'].includes(flowModel))throw Error('Chọn mô hình Veo hợp lệ (Lite, Fast hoặc Quality).');
      if(typeof data.ffmpeg !== 'string' || !data.ffmpeg.trim()) throw Error('Nhập đường dẫn FFmpeg hoặc ffmpeg nếu đã thêm vào PATH.');
      if (!['keep','package','merge'].includes(data.finishAction)) throw Error('Chọn cách xử lý sau khi tạo video.');
      const browserChoice=data.browserChoice ?? settings.browserChoice,browserPath=typeof data.browserPath === 'string' ? data.browserPath.trim() : settings.browserPath;
      if(!['builtin','chrome','edge','custom'].includes(browserChoice)) throw Error('Trình duyệt không hợp lệ.');
      if(browserChoice !== settings.browserChoice || browserPath !== settings.browserPath) {
        if(opening.size || [...browsers.values()].some(browser=>!browser.isDestroyed())) throw Error('Đóng các cửa sổ tài khoản trước khi đổi trình duyệt.');
        resolveBrowser({choice:browserChoice,customPath:browserPath});
        browserWarnings.clear();
      }
      settings = { ...settings, image, stopSelector, dispatchMode,cooldownSeconds,messageSelector, attachmentReadySelector, browserChoice, browserPath, autoMerge: data.finishAction === 'merge', autoPackage: data.finishAction === 'package', ffmpeg: data.ffmpeg.trim(), accountCount, flowProjectUrl, flowParallel, flowModel, composer: data.composer, fileInput: data.fileInput, submit: data.submit, video: data.video, timeoutMinutes: minutes }; await save(); notify(); return snapshot();
    },
    // Chỉ cập nhật phần cài đặt Google Flow (không đụng cài đặt Muse).
    flowSettings: async data => {
      const url=typeof data?.flowProjectUrl==='string'?data.flowProjectUrl.trim():settings.flowProjectUrl;
      if(url&&!/^https:\/\/flow\.google\.com\/(?:[a-z-]+\/)?project\/[\w-]+/i.test(url))throw Error('Đường dẫn dự án Flow phải dạng https://flow.google.com/project/… (copy từ thanh địa chỉ khi đang mở dự án).');
      const parallel=data?.flowParallel==null?settings.flowParallel:Number(data.flowParallel);
      if(!Number.isInteger(parallel)||parallel<1||parallel>6)throw Error('Số clip Flow chạy cùng lúc từ 1–6.');
      const model=data?.flowModel??settings.flowModel;
      if(!['lite','fast','quality'].includes(model))throw Error('Chọn mô hình Veo hợp lệ.');
      if(queue.active&&(url!==settings.flowProjectUrl||model!==settings.flowModel))throw Error('Dừng hàng đợi trước khi đổi dự án hoặc mô hình Flow.');
      settings={...settings,flowProjectUrl:url,flowParallel:parallel,flowModel:model};await save();notify();return snapshot();
    },
    // Mở (hoặc đưa lên trước) cửa sổ Chrome/Edge của Flow để đăng nhập Google một lần.
    flowOpen: async () => { await licenseManager.requireLongTerm();const browser=await ensureFlowBrowser();if(browser){const page=await browser.page();await page.bringToFront().catch(()=>{});}return snapshot(); },
    reveal: id => { const j = queue.jobs.find(j => j.id === id); if (j?.output||j?.previousOutput) shell.showItemInFolder(j.output||j.previousOutput); },
    export: async () => { const r = await dialog.showSaveDialog(main, { defaultPath: 'muse-project.json', filters: [{ name: 'JSON', extensions: ['json'] }] }); if (!r.canceled) await atomic(r.filePath, { jobs: queue.jobs }); }
  };
  for (const [name, handler] of Object.entries(handlers)) ipcMain.handle('studio:' + name, (event, data) => { if (event.sender !== main.webContents) throw Error('Unauthorized window'); return handler(data); });
  await main.loadFile(path.join(__dirname, 'index.html'));
  if(pendingFocus)focusMain();
}).catch(e => { dialog.showErrorBox(ui('Không thể mở ứng dụng','Unable to open application'), e.message); app.quit(); });
app.on('window-all-closed', () => app.quit());
app.on('before-quit', event => {
  if (!ownsInstance || quitAllowed) return;
  event.preventDefault();
  if (flushingQuit) return;
  flushingQuit=true;runEpoch++;starting=false;main?.hide?.();
  (async () => {
    if(queue)await stopAll();
    const closingExternal=Promise.allSettled([...browsers.values()].filter(browser=>browser.external&&!browser.isDestroyed()).map(browser=>browser.close()));
    for(const browser of browsers.values())if(!browser.external&&!browser.isDestroyed())browser.destroy();
    await Promise.allSettled([...accountResets.values()]);
    await Promise.allSettled([flowLaunch,flowBrowser?.close()].filter(Boolean));
    await Promise.allSettled([...externalLaunches.values()]);
    const externalResults=await closingExternal;
    const results = await Promise.allSettled([...profiles.values()].map(async profile=>{
      await profile.ready;
      const results = await Promise.allSettled([profile.store.dispose(), Promise.resolve().then(()=>profile.session.flushStorageData())]);
      if(results.some(r=>r.status==='rejected')) throw Error('Chưa lưu đủ dữ liệu phiên.');
    }));
    results.push(...externalResults);
    if (queue && stateFile) { try { await save(); } catch { results.push({status:'rejected'}); } }
    if (results.some(r=>r.status==='rejected')) dialog.showMessageBoxSync({type:'warning',message:ui('Một số dữ liệu hoặc phiên đăng nhập chưa lưu được. Có thể cần đăng nhập lại khi mở app.','Some session data could not be saved. You may need to sign in again after restarting.'),buttons:[ui('Đóng ứng dụng','Close application')]});
    quitAllowed=true;app.quit();
  })().catch(()=>{quitAllowed=true;app.quit();});
});
