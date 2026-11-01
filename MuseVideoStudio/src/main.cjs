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
const {beginTracking,pollTracking,downloadAction,endTracking}=require('./muse-tracker.cjs');
const {captureElectronDownload,validateVideo}=require('./download-capture.cjs');
const {createLicense,deviceCode}=require('./license.cjs');
const {payment}=require('./payment.cjs');
let licenseManager,paymentDetails;
const { mergeVideos, checkTools } = require('./merge.cjs');
const { exportEditPackage } = require('./edit-package.cjs');
const { createSessionStore } = require('./session-store.cjs');
const { resolveBrowser } = require('./browser-discovery.cjs');
const { launchExternalBrowser } = require('./external-browser.cjs');
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
const resettingAccounts = new Set(), accountResets = new Map();
const defaults = { language:'en', accountSessionIds:{}, dispatchMode:'parallel', cooldownSeconds:3, messageSelector:'', stopSelector:'', attachmentReadySelector:'', browserChoice: 'builtin', browserPath: '', output: '', autoMerge: false, autoPackage: false, ffmpeg: 'ffmpeg', accountCount: 2, composer: 'textarea, [contenteditable="true"][role="textbox"], [contenteditable="true"][data-placeholder]', fileInput: 'input[type="file"]', submit: '', video: 'video', timeoutMinutes: 15 };
function ui(vi,en){return settings?.language==='vi'?vi:en;}
async function atomic(file, data) { await fs.writeFile(file + '.tmp', JSON.stringify(data, null, 2)); await fs.rename(file + '.tmp', file); }
function snapshot() {
  return {version:app.getVersion?.()||require('../package.json').version,jobs:queue.jobs,settings,license:licenseManager?.status(),payment:paymentDetails,starting,stopping,testing,startError,browserTests:Array.from({length:settings.accountCount},(_,index)=>{const t=browserTests.get(index),live=Boolean(t?.browser&&t.browser===browsers.get(index)&&!t.browser.isDestroyed()),status=t?.status==='ready'&&!live?'stale':t?.status||'not-tested';return {index,status,message:status==='stale'?'Trình duyệt đã đóng hoặc đổi · Test lại':t?.message||'Câu bắt đầu: tùy chọn',echoSeen:live&&Boolean(t?.echoSeen),replySeen:live&&Boolean(t?.replySeen)};}),resettingAccounts:[...resettingAccounts],active:queue.active,paused:queue.paused,merging,mergeProgress,mergedOutput,mergeError,packaging,packageProgress,editPackageDir,packageError,
    accounts:Array.from({length:settings.accountCount},(_,index)=>{
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
function validAccount(index) {
  if(!Number.isInteger(index) || index<0 || index>=settings.accountCount) throw Error('Tài khoản không hợp lệ.');
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
  return testing || queue.active || starting || stopping || merging || packaging || opening.size || externalLaunches.size;
}
function logoutAccount(index) {
  validAccount(index);
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
async function triggerTrackedDownload(muse,id,signal) {
  const check=()=>{if(signal.aborted)throw stoppedError();};
  check();let action=await abortable(dom(muse,downloadAction,{id,phase:'auto'}),signal);
  if(action.clicked && !action.needsMenu)return;
  const deadline=Date.now()+6000;
  while(action.needsMenu && Date.now()<deadline){
    await abortable(delay(200),signal);check();
    action=await abortable(dom(muse,downloadAction,{id,phase:'menu'}),signal);
    if(action.clicked && !action.needsMenu)return;
  }
  throw Error('Chưa tìm thấy nút tải của đúng video. Mở phản hồi Muse, rồi bấm Lấy video đã tạo; không cần gửi lại prompt.');
}
async function download(muse,job,signal) {
  const temporary=path.join(settings.output,`.muse-${job.id}-${randomUUID().slice(0,8)}.part`);
  await fs.mkdir(settings.output,{recursive:true});
  let lastNotify=0;
  const options={signal,trigger:()=>triggerTrackedDownload(muse,job.trackerId||job.id,signal),onProgress:progress=>{
    if(signal.aborted)return;job.downloadProgress=progress;
    if(Date.now()-lastNotify>300){lastNotify=Date.now();notify();}
  }};
  try{
    if(muse.external)await muse.captureDownload(temporary,options);
    else await captureElectronDownload(muse.webContents,temporary,options);
    if(signal.aborted)throw stoppedError();
    const format=await validateVideo(temporary);
    if(signal.aborted)throw stoppedError();
    const target=await saveOrderedOutput(temporary,settings.output,job,format.extension);
    job.downloadCompletedAt=new Date().toISOString();return target;
  }catch(error){await fs.rm(temporary,{force:true}).catch(()=>{});throw error;}
}
function transientDOM(error){return error?.code==='MUSE_DOM_TIMEOUT'||/Execution context was destroyed|context.*destroyed|Target closed|navigation|not respond|chưa phản hồi/i.test(error?.message||'');}
async function runJob(job,worker,signal,{recover=false}={}) {
  const pinned=recover||Boolean(job.resumeMode);
  const slot=pinned&&job.account?Number(job.account)-1:settings.dispatchMode==='parallel'?worker:nextAccount++%settings.accountCount;
  validAccount(slot);
  const muse=browsers.get(slot),check=()=>{if(signal.aborted)throw stoppedError();},step=p=>abortable(p,signal);
  check();job.account=slot+1;assertMuse(muse);muse.pinPage?.(job.id);
  const profileKey=accountProfileKey(slot),currentSession=sessionId(profileKey);
  if(recover&&((job.submissionProfileKey&&job.submissionProfileKey!==profileKey)||(job.submissionSessionId&&job.submissionSessionId!==currentSession)))throw Error('Mở lại đúng trình duyệt và phiên tài khoản đã gửi prompt.');
  if(!recover)await step(licenseManager.ensureAllowed());
  if(!settings.output)throw Error('Chọn thư mục lưu video trước.');
  const stage=(value,message)=>{check();job.stage=value;job.stageMessage=message;notify();};
  const input=recover?(job.lockedInput||{prompt:job.prompt,references:[]}):await step(lockInput(job,path.join(app.getPath('userData'),'locked-references')));
  const prompt=input.prompt,references=input.references.map(r=>r.path);
  const receipt=job.submissionReceipt;
  if(!recover){
    if(job.trackerId){void dom(muse,endTracking,{id:job.trackerId}).catch(()=>{});}
    job.trackerId=randomUUID();job.echoKey='';job.echoMarker='';job.echoAliases=[];job.acknowledgedAt=null;job.confirmedResponseAt=null;job.submissionReceipt=null;job.submissionProtocol=null;job.resultReadyAt=null;job.downloadStartedAt=null;job.downloadCompletedAt=null;job.late=false;job.mayHaveSubmitted=false;job.submittedAt=null;job.remoteStop=null;
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
    await step(dom(muse,beginTracking,{id:trackerId,prompt,videoSelector:settings.video,messageSelector:settings.messageSelector,recover,echoKey:recover?job.echoKey||receipt?.echoKey:'',echoMarker:recover?job.echoMarker||receipt?.echoMarker:'',echoAliases:recover?[...new Set([...(job.echoAliases||[]),receipt?.echoKey].filter(Boolean))]:[]}));
    if(!recover){
      stage('submitting','Đang gửi đúng prompt và ảnh đã khóa');
      job.submissionProfileKey=profileKey;job.submissionSessionId=currentSession;job.submissionProtocol=1;job.mayHaveSubmitted=true;job.submittedAt=null;await step(save());check();
      try{const sent=await step(dom(muse,submitPrompt,{id:trackerId,selector:settings.submit,composerSelector:settings.composer,attachmentTokens:job.preparedTokens}));if(!sent?.clicked)throw Error('Chưa bấm được Gửi. Cảnh chưa gửi; bấm Tiếp tục để gửi lại.');job.submittedAt=new Date().toISOString();await step(save());}
      catch(e){if(signal.aborted)throw e;if(!transientDOM(e)){job.mayHaveSubmitted=false;await step(save());throw e;}stage('confirming','Muse đang lag · chờ xác nhận, không bấm Gửi lần nữa');}
    }
    const warnAt=Date.now()+settings.timeoutMinutes*60000;
    let warned=false,observedEcho=false;
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
      if(result.ready&&result.echoMatched&&result.responseMatched){
        job.resultReadyAt=new Date().toISOString();job.downloadStartedAt=new Date().toISOString();
        stage('downloading','Đúng phản hồi của cảnh này · đang lưu video về máy');await step(save());
        try{
          const output=await step(download(muse,job,signal));nextDispatchAt.set(slot,Date.now()+settings.cooldownSeconds*1000);return output;
        }catch(e){check();stage('downloading','Chưa lưu được video · giữ đúng kết quả và thử tải lại: '+e.message);await step(delay(5000));continue;}
      }
      if(!warned&&Date.now()>warnAt){warned=true;job.late=true;}
      stage(!result.echoMatched?'confirming':'waiting',(job.late?'Muse chậm hơn thời gian dự kiến · vẫn giữ cảnh này. ':'')+(!result.echoMatched?'Chưa thấy đúng prompt trong chat Muse':!result.responseMatched?'Đã thấy tin nhắn · chờ Muse phản hồi':result.stage||'Chờ đúng video của prompt'));
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
async function stopAll(){
  if(stopping){while(stopping)await delay(50);return snapshot();}
  stopping=true;runEpoch++;starting=false;probeController?.abort();queue.pause();
  const probes=[...browserTests.values()].filter(t=>testing&&t.mayHaveSubmitted&&t.status!=='ready').map(t=>({id:t.id,trackerId:t.id,account:t.index+1,mayHaveSubmitted:true}));
  const jobs=[...queue.jobs.filter(j=>!probes.some(t=>t.account===j.account)&&(j.status==='running'||(['failed','interrupted'].includes(j.status)&&j.mayHaveSubmitted&&!['confirmed','ui-stopped'].includes(j.remoteStop?.state)))),...probes];notify();
  const requests=jobs.map(async job=>{
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
  });
  try{await queue.stop();await Promise.allSettled(requests);for(const job of jobs){job.error='';job.stageMessage=['confirmed','ui-stopped'].includes(job.remoteStop?.state)?'Đã dừng trong Muse · Tiếp tục sẽ gửi lại cảnh đã khóa':job.remoteStop?.state==='completed'?'Clip đã có · Tiếp tục sẽ tải về':'Chưa xác nhận dừng trên Muse · Tiếp tục sẽ chờ đúng kết quả, không gửi trùng';}await save();}
  finally{stopping=false;notify();}
  return snapshot();
}

async function mergeProject() {
  if (queue.active || starting || merging || packaging) throw Error('Chờ xử lý hiện tại hoàn tất trước khi nối.');
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
  if (queue.active || starting || merging || packaging) throw Error('Chờ xử lý hiện tại hoàn tất trước khi xuất clip.');
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
  queue = new Queue({ jobs: stored.jobs || [], save, run: runJob, notify });
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
    language:async value=>{if(!['vi','en'].includes(value))throw Error('Unsupported language');settings.language=value;await save();notify();return snapshot();},
    testBrowsers,
    openOutput:async()=>{if(!settings.output)throw Error('Chọn thư mục lưu video trước.');await fs.mkdir(settings.output,{recursive:true});const error=await shell.openPath(settings.output);if(error)throw Error(error);},
    activateKey:async token=>{await licenseManager.activate(token);notify();return snapshot();},
    add: async data => { if (merging || packaging) throw Error('Chờ xử lý đầu ra xong trước khi thêm prompt.'); invalidateOutputs(); await queue.add(data); return snapshot(); },
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
        invalidateOutputs();queue.regenerate(id).catch(e=>dialog.showErrorBox(ui('Tạo lại','Regenerate'),e.message)).finally(notify);
      }finally{starting=false;notify();}
      return snapshot();
    },
    retry: async id => { if (merging || packaging) throw Error('Đang xử lý đầu ra video.'); const browser=browsers.get(Number(queue.jobs.find(j=>j.id===id)?.account)-1);invalidateOutputs(); await queue.retry(id);browser?.releasePage?.(id); return snapshot(); },
    remove: async id => { if (merging || packaging) throw Error('Đang xử lý đầu ra video.'); const removed=queue.jobs.find(j=>j.id===id);invalidateOutputs(); await queue.remove(id);browsers.get(Number(removed?.account)-1)?.releasePage?.(id);if(removed?.trackerId)void dom(browsers.get(Number(removed.account)-1),endTracking,{id:removed.trackerId}).catch(()=>{}); return snapshot(); },
    browser: async index => { await openMuse(Number(index ?? 0)); return true; },
    diagnostics: async index=>{
      index=Number(index??0);validAccount(index);const muse=browsers.get(index);assertMuse(muse);
      const jobs=queue.jobs.filter(j=>j.account===index+1).slice(-8);
      const structure=await dom(muse,chatDiagnostics,{jobs:jobs.map(j=>({id:j.id,prompt:j.lockedInput?.prompt||j.prompt,number:j.number})),composerSelector:settings.composer});
      const result=await dialog.showSaveDialog(main,{defaultPath:`Muse-chat-diagnostics-TK${index+1}.json`,filters:[{name:'Thông tin lỗi',extensions:['json']}]});
      if(result.canceled)return false;
      await atomic(result.filePath,{version:app.getVersion?.()||'0.7.1',account:index+1,jobs:jobs.map(j=>({id:j.id,title:j.title,number:j.number,status:j.status,stage:j.stage,error:j.error,submittedAt:j.submittedAt,remoteStop:j.remoteStop,trackerId:j.trackerId,echoKey:j.echoKey,echoMarker:j.echoMarker,acknowledgedAt:j.acknowledgedAt,promptHash:j.lockedInput?.promptHash,referenceHashes:j.lockedInput?.references.map(r=>r.sha256)})),structure});
      shell.showItemInFolder?.(result.filePath);return true;
    },
    logoutAccount: async index => {await logoutAccount(Number(index??0));return snapshot();},
    start: async () => {
      if(merging || packaging) throw Error('Đang xử lý đầu ra video.');
      if(resettingAccounts.size) throw Error('Chờ đăng xuất tài khoản hoàn tất trước khi chạy.');
            if(queue.active || starting || stopping) return snapshot();
      const epoch=runEpoch;starting=true;startError='';notify();
      try {
        if(testing){probeController?.abort();await Promise.allSettled([...probeMutations]);await probeSettled;}
        if(epoch!==runEpoch || flushingQuit)return snapshot();
        await licenseManager.ensureAllowed();
        if(epoch!==runEpoch || flushingQuit)return snapshot();
        await Promise.all(Array.from({length:settings.accountCount},async(_,index)=>{
          if(epoch!==runEpoch||flushingQuit)return;
          if(opening.has(index))await opening.get(index);
          const browser=browsers.get(index);if(!browser||browser.isDestroyed()||!browser.museStarted)await openMuse(index);
          if(epoch!==runEpoch||flushingQuit)return;assertMuse(browsers.get(index));
        }));
        if(epoch!==runEpoch||flushingQuit)return snapshot();
        if(settings.autoMerge) await checkTools(settings.ffmpeg);
        if(epoch!==runEpoch || flushingQuit || queue.active || merging || packaging || resettingAccounts.size) return snapshot();
        const unavailable=queue.jobs.find(j=>j.account>settings.accountCount&&(['failed','interrupted'].includes(j.status)||j.resumeMode));
        if(unavailable)throw Error('Cảnh đang dở gắn với tài khoản '+unavailable.account+'. Chọn đủ tài khoản trước khi Tiếp tục.');
        queue.prepareResume();
        queue.concurrency=settings.dispatchMode==='parallel'?settings.accountCount:1;
        queue.start().then(async()=>{
          if(!queue.paused && queue.jobs.length && queue.jobs.every(j=>j.status==='completed')) {
            if(settings.autoMerge) await mergeProject();else if(settings.autoPackage) await packageProject();
          }
        }).catch(e=>dialog.showErrorBox(ui('Lỗi xử lý hàng đợi','Queue processing error'),e.message)).finally(notify);
        return snapshot();
      } catch(e){startError=e.message;throw e;} finally {if(epoch===runEpoch)starting=false;notify();}
    },
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
    clearPending: async()=>{if(merging||packaging)throw Error('Chờ xử lý đầu ra hoàn tất.');invalidateOutputs();await queue.clearPending();return snapshot();},
    clearList: async()=>{if(stopping||merging||packaging)throw Error('Chờ xử lý đầu ra hoàn tất.');await stopAll();for(const job of queue.jobs){browsers.get(Number(job.account)-1)?.releasePage?.(job.id);if(job.trackerId)void dom(browsers.get(Number(job.account)-1),endTracking,{id:job.trackerId}).catch(()=>{});}await queue.clearAll();invalidateOutputs();await save();notify();return snapshot();},
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
      if(typeof data.ffmpeg !== 'string' || !data.ffmpeg.trim()) throw Error('Nhập đường dẫn FFmpeg hoặc ffmpeg nếu đã thêm vào PATH.');
      if (!['keep','package','merge'].includes(data.finishAction)) throw Error('Chọn cách xử lý sau khi tạo video.');
      const browserChoice=data.browserChoice ?? settings.browserChoice,browserPath=typeof data.browserPath === 'string' ? data.browserPath.trim() : settings.browserPath;
      if(!['builtin','chrome','edge','custom'].includes(browserChoice)) throw Error('Trình duyệt không hợp lệ.');
      if(browserChoice !== settings.browserChoice || browserPath !== settings.browserPath) {
        if(opening.size || [...browsers.values()].some(browser=>!browser.isDestroyed())) throw Error('Đóng các cửa sổ tài khoản trước khi đổi trình duyệt.');
        resolveBrowser({choice:browserChoice,customPath:browserPath});
        browserWarnings.clear();
      }
      settings = { ...settings, stopSelector, dispatchMode,cooldownSeconds,messageSelector, attachmentReadySelector, browserChoice, browserPath, autoMerge: data.finishAction === 'merge', autoPackage: data.finishAction === 'package', ffmpeg: data.ffmpeg.trim(), accountCount, composer: data.composer, fileInput: data.fileInput, submit: data.submit, video: data.video, timeoutMinutes: minutes }; await save(); notify(); return snapshot();
    },
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
