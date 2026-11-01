// Integration of main.cjs with mocked Electron surfaces, real filesystem state,
// and real encryption through a test adapter. No Muse or Windows login is used.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { EventEmitter } = require('node:events');
const { createRequire } = require('node:module');
const crypto = require('node:crypto');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const vm = require('node:vm');

const mainPath = path.resolve(__dirname, '../src/main.cjs');
const localRequire = createRequire(mainPath);
const key = crypto.randomBytes(32);
const safeStorage = {
  isEncryptionAvailable: () => true,
  getSelectedStorageBackend: () => 'test-encrypted-keyring',
  encryptString(text) {
    const iv = crypto.randomBytes(12), cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
    const bytes = Buffer.concat([cipher.update(text, 'utf8'), cipher.final()]);
    return Buffer.concat([iv, cipher.getAuthTag(), bytes]);
  },
  decryptString(bytes) {
    const decipher = crypto.createDecipheriv('aes-256-gcm', key, bytes.subarray(0, 12));
    decipher.setAuthTag(bytes.subarray(12, 28));
    return Buffer.concat([decipher.update(bytes.subarray(28)), decipher.final()]).toString('utf8');
  }
};

async function boot(userData, { initialCookies = {}, ownsLock = true, cookieReadGate, externalLauncher, browserResolver, networkProbe, licenseGate, domTimeoutMs=20000, logoutResponse=1,closeResponse=1,closeGate } = {}) {
  const handlers = new Map(), sessions = new Map(), windows = [], errors = [], notices = [];
  const lifecycle = [],updates=[];
  let loaded, quit;
  const loadedPromise = new Promise(resolve => { loaded = resolve; });
  const quitPromise = new Promise(resolve => { quit = resolve; });
  const app = new EventEmitter();
  app.requestSingleInstanceLock = () => ownsLock;
  app.whenReady = () => Promise.resolve();
  app.getPath = name => { assert.equal(name, 'userData'); return userData; };
  app.quit = () => { lifecycle.push('quit'); quit(); };

  function accountSession(partition) {
    if (sessions.has(partition)) return sessions.get(partition);
    const values = structuredClone(initialCookies[partition] || []);
    const cookies = new EventEmitter();
    cookies.get = async () => {
      if (cookieReadGate) { cookieReadGate.entered(); await cookieReadGate.wait; }
      return structuredClone(values);
    };
    cookies.flushStore = async () => { lifecycle.push(`cookies-flushed:${partition}`); };
    cookies.set = async details => {
      lifecycle.push(`cookie-restored:${partition}`);
      values.push({ ...details, domain: details.domain || new URL(details.url).hostname, hostOnly: !details.domain, session: true });
    };
    const session = { partition, cookies, values,
      flushStorageData: () => { lifecycle.push(`storage-flushed:${partition}`); },clearStorageData:async()=>{values.splice(0);lifecycle.push(`cleared:${partition}`);},clearCache:async()=>{}
    };
    sessions.set(partition, session); return session;
  }

  class BrowserWindow extends EventEmitter {
    constructor(options) {
      super(); this.options = options; this.destroyed = false; this.loadedCookies = [];
      const contents = new EventEmitter();
      contents.session = options.webPreferences.session;
      contents.send = (_channel,state) => {updates.push(JSON.parse(JSON.stringify(state.jobs||[])));};
      contents.setWindowOpenHandler = handler => { this.openHandler = handler; };
      contents.getURL = () => this.url || '';
      this.webContents = contents; windows.push(this);
    }
    destroy(){this.destroyed=true;this.emit('closed');}
    isDestroyed() { return this.destroyed; }
    isMinimized() { return Boolean(this.minimized); }
    setMenu(value){this.menu=value;}setMenuBarVisibility(value){this.menuVisible=value;}
    show(){this.shown=(this.shown||0)+1;}focus(){this.focused=(this.focused||0)+1;}restore(){this.minimized=false;this.restored=true;}
    async loadFile() {
      // The renderer can issue IPC immediately at load time.
      assert.ok(handlers.has('studio:state'));
      loaded();
    }
    async loadURL(url) {
      this.url = url;
      this.loadedCookies = structuredClone(this.webContents.session.values);
      lifecycle.push(`page-loaded:${this.webContents.session.partition}`);
    }
  }

  const dialog = {
    showErrorBox: (title, message) => { errors.push({ title, message }); loaded(); },
    showMessageBox:async(_parent,options)=>{notices.push(options);if(['Thoát Muse Video Studio?','Exit Muse Video Studio?'].includes(options.title)){if(closeGate)await closeGate;return{response:closeResponse};}return{response:logoutResponse};},
    showMessageBoxSync: options => { notices.push(options); return 1; },
    showSaveDialog: async () => ({ canceled: false, filePath: path.join(userData, 'export.json') })
  };
  const electron = { app, BrowserWindow, safeStorage, dialog,Menu:{setApplicationMenu:value=>{lifecycle.push(value===null?'menu-removed':'menu-set');}},
    session: { fromPartition: accountSession },
    shell: { showItemInFolder() {}, openPath: async () => '', openExternal: async()=>{} },
    ipcMain: { handle: (name, handler) => handlers.set(name, handler) }
  };
  const context = vm.createContext({
    require: name => {
      if(name === 'electron') return electron;
      if(name==='./license.cjs' && licenseGate){const real=localRequire(name);return{...real,createLicense:async options=>{const manager=await real.createLicense(options),ensure=manager.ensureAllowed;manager.ensureAllowed=async()=>{licenseGate.entered();await licenseGate.wait;return ensure();};return manager;}};}
      if(name === './electron-network-check.cjs') return {checkElectronNetwork:networkProbe || (async()=>({ip:'203.0.113.9',countryCode:'US',countryName:'United States',observedAt:new Date().toISOString()}))};
      if(name === './external-browser.cjs' && externalLauncher) return {launchExternalBrowser:externalLauncher};
      if(name === './browser-discovery.cjs' && browserResolver) return {resolveBrowser:browserResolver};
      return localRequire(name);
    },
    __dirname: path.dirname(mainPath), Buffer, URL, console, setTimeout:(fn,ms,...args)=>setTimeout(fn,ms===20000?domTimeoutMs:ms,...args), clearTimeout, AbortController
  });
  vm.runInContext(await fs.readFile(mainPath, 'utf8'), context, { filename: mainPath });
  if (ownsLock) await loadedPromise;
  else await new Promise(resolve => setImmediate(resolve));
  assert.deepEqual(errors, []);

  return { app,handlers, sessions, windows, lifecycle, notices, errors,updates,
    invoke: (name, data, sender = windows[0]?.webContents) => {
      return handlers.get(`studio:${name}`)({ sender }, data);
    },
    async stop() {
      let prevented = false;const priorQuits=lifecycle.filter(x=>x==='quit').length;
      app.emit('before-quit', { preventDefault() { prevented = true; } });
      if(prevented)await until(()=>lifecycle.filter(x=>x==='quit').length>priorQuits);else await quitPromise;
      assert.equal(prevented, ownsLock);
      return lifecycle;
    }
  };
}

function cookie(value) {
  return { domain: 'muse.ai', hostOnly: true, path: '/', name: 'login', value,
    session: true, secure: true, httpOnly: true, sameSite: 'lax' };
}

test('main startup keeps clips by default, maps finish modes, and registers sender-scoped IPC before renderer load', async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'muse-main-test-'));
  try {
    const app = await boot(dir);
    assert.equal(app.windows.length, 1);
    const initial = app.invoke('state');
    assert.equal(initial.settings.autoMerge, false); assert.equal(initial.settings.autoPackage, false);
    assert.throws(() => app.invoke('state', undefined, {}), /Unauthorized window/);
    for (const mode of ['package', 'merge', 'keep']) {
      const settings = { ...initial.settings, finishAction: mode };
      const state = await app.invoke('settings', settings);
      assert.equal(state.settings.autoMerge, mode === 'merge');
      assert.equal(state.settings.autoPackage, mode === 'package');
    }
    await app.stop();
    const saved = JSON.parse(await fs.readFile(path.join(dir, 'studio.json'), 'utf8'));
    assert.equal(saved.configVersion, 2); assert.equal(saved.settings.autoMerge, false);
    assert.equal(saved.settings.autoPackage, false);
  } finally { await fs.rm(dir, { recursive: true, force: true }); }
});

test('main retains independent encrypted sessions on graceful quit and restores each before Muse page load', async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'muse-main-test-'));
  try {
    const values = ['test-account-one', 'test-account-two'];
    const first = await boot(dir, { initialCookies: {
      'persist:muse-account-1': [cookie(values[0])],
      'persist:muse-account-2': [cookie(values[1])]
    } });
    await first.invoke('browser', 0); await first.invoke('browser', 1);
    assert.equal(first.sessions.size, 2); assert.equal(first.windows.length, 3);assert.equal(first.windows[1].options.webPreferences.backgroundThrottling,false);assert.equal(first.windows[2].options.webPreferences.backgroundThrottling,false);
    assert.notEqual(first.windows[1].webContents.session, first.windows[2].webContents.session);
    assert.equal(first.invoke('state').accounts.every(account => account.rememberSession), true);
    const publicState = JSON.stringify(first.invoke('state'));
    values.forEach(value => assert.equal(publicState.includes(value), false));
    await first.invoke('export');
    const exported = await fs.readFile(path.join(dir, 'export.json'), 'utf8');
    values.forEach(value => assert.equal(exported.includes(value), false));
    const lifecycle = await first.stop();
    for (const n of [1, 2]) {
      assert.ok(lifecycle.indexOf(`cookies-flushed:persist:muse-account-${n}`) < lifecycle.indexOf('quit'));
      assert.ok(lifecycle.indexOf(`storage-flushed:persist:muse-account-${n}`) < lifecycle.indexOf('quit'));
      const bytes = await fs.readFile(path.join(dir, 'account-sessions', `account-${n}.enc`));
      values.forEach(value => assert.equal(bytes.includes(Buffer.from(value)), false));
    }
    const second = await boot(dir);
    await second.invoke('browser', 0); await second.invoke('browser', 1);
    assert.equal(second.windows[1].loadedCookies[0].value, values[0]);
    assert.equal(second.windows[2].loadedCookies[0].value, values[1]);
    for (const n of [1, 2]) {
      assert.ok(second.lifecycle.indexOf(`cookie-restored:persist:muse-account-${n}`) < second.lifecycle.indexOf(`page-loaded:persist:muse-account-${n}`));
    }
    await second.stop();
  } finally { await fs.rm(dir, { recursive: true, force: true }); }
});

test('second app instance exits without loading a renderer or modifying the data directory', async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'muse-main-test-'));
  try {
    const second = await boot(dir, { ownsLock: false });
    assert.equal(second.windows.length, 0); assert.equal(second.handlers.size, 0);
    assert.deepEqual(await fs.readdir(dir), []);
    assert.equal(second.lifecycle.includes('quit'), true);
  } finally { await fs.rm(dir, { recursive: true, force: true }); }
});


test('quit during pending account restore waits for it and does not open a new Muse window', async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'muse-main-test-'));
  let release;
  const gate = new Promise(resolve => { release = resolve; });
  try {
    await fs.mkdir(path.join(dir, 'account-sessions'));
    await fs.writeFile(path.join(dir, 'account-sessions', 'account-1.enc'), safeStorage.encryptString(JSON.stringify({ version: 1, cookies: [cookie('test-pending-account')] })));
    let entered;
    const reading = new Promise(resolve => { entered = resolve; });
    const app = await boot(dir, { cookieReadGate: { entered, wait: gate } });
    const opening = app.invoke('browser', 0);
    await reading;
    const stopping = app.stop();
    await new Promise(resolve => setImmediate(resolve));
    assert.equal(app.lifecycle.includes('quit'), false);
    release();
    await opening; await stopping;
    assert.equal(app.windows.length, 1, 'only main window exists; account UI must not open during quit');
  } finally { release(); await fs.rm(dir, { recursive: true, force: true }); }
});

test('main routes selected external browser to independent app profiles and refuses changing live browsers', async()=>{
  const dir=await fs.mkdtemp(path.join(os.tmpdir(),'muse-main-external-'));
  const launches=[],adapters=[];
  try {
    const app=await boot(dir,{browserResolver:()=>'/test/chrome',externalLauncher:async options=>{
      launches.push(options);let closed=false;
      const adapter={external:true,checkNetwork:async()=>({ip:'203.0.113.9',countryCode:'US',countryName:'United States',observedAt:new Date().toISOString()}),openMuse:async()=>{},isDestroyed:()=>closed,isSessionEnabled:()=>true,url:()=> 'https://muse.ai/',show:async()=>{},close:async()=>{closed=true;}};
      adapters.push(adapter);return adapter;
    }});
    const initial=app.invoke('state');
    await app.invoke('settings',{...initial.settings,browserChoice:'chrome',finishAction:'keep'});
    await app.invoke('browser',0);await app.invoke('browser',1);
    assert.equal(launches.length,2);assert.equal(app.sessions.size,0);
    assert.equal(launches[0].executablePath,'/test/chrome');
    assert.equal(launches[0].profileDir,path.join(dir,'external-browser-profiles','chrome','account-1'));
    assert.equal(launches[1].profileDir,path.join(dir,'external-browser-profiles','chrome','account-2'));
    assert.notEqual(launches[0].sessionFile,launches[1].sessionFile);
    await assert.rejects(app.invoke('settings',{...initial.settings,browserChoice:'edge',finishAction:'keep'}),/Đóng các cửa sổ/);
    assert.equal(app.invoke('state').settings.browserChoice,'chrome');
    await app.stop();assert.ok(adapters.every(a=>a.isDestroyed()));
  } finally {await fs.rm(dir,{recursive:true,force:true});}
});
test('quit during external browser launch waits and closes the late browser instead of orphaning it',async()=>{
  const dir=await fs.mkdtemp(path.join(os.tmpdir(),'muse-main-external-'));
  let release,entered,closed=false;
  const gate=new Promise(r=>release=r),started=new Promise(r=>entered=r);
  try {
    const app=await boot(dir,{browserResolver:()=>'/test/edge',externalLauncher:async()=>{
      entered();await gate;return {external:true,isDestroyed:()=>closed,isSessionEnabled:()=>true,close:async()=>{closed=true;}};
    }});
    await app.invoke('settings',{...app.invoke('state').settings,browserChoice:'edge',finishAction:'keep'});
    const opening=app.invoke('browser',0);await started;
    const quitting=app.stop();await new Promise(r=>setImmediate(r));
    assert.equal(app.lifecycle.includes('quit'),false);release();await opening;await quitting;
    assert.equal(closed,true);assert.equal(app.windows.length,1);
  } finally {release();await fs.rm(dir,{recursive:true,force:true});}
});

test('legacy USA preference is removed and native Muse login does not check geolocation',async()=>{const dir=await fs.mkdtemp(path.join(os.tmpdir(),'muse-no-geo-'));let probes=0;try{await fs.writeFile(path.join(dir,'studio.json'),JSON.stringify({configVersion:2,settings:{requireUSA:true,vpnProvider:'windscribe',vpnClientPath:'C:/old-vpn.exe'}}));const app=await boot(dir,{networkProbe:async()=>{probes++;throw Error('IP endpoint unavailable');}});assert.equal(app.invoke('state').settings.requireUSA,undefined);assert.equal(app.invoke('state').settings.vpnProvider,undefined);assert.equal(app.invoke('state').network,undefined);await app.invoke('browser',0);assert.equal(probes,0);assert.equal(app.windows[1].url,'https://muse.ai/');assert.equal(app.handlers.has('studio:checkUSA'),false);await app.stop();const saved=JSON.parse(await fs.readFile(path.join(dir,'studio.json'),'utf8'));assert.equal(saved.settings.requireUSA,undefined);}finally{await fs.rm(dir,{recursive:true,force:true});}});
test('logout resets only selected native account and keeps the other login and downloaded files',async()=>{
 const dir=await fs.mkdtemp(path.join(os.tmpdir(),'muse-logout-'));try{
  const app=await boot(dir,{initialCookies:{'persist:muse-account-1':[cookie('one')],'persist:muse-account-2':[cookie('two')]}});await app.invoke('browser',0);await app.invoke('browser',1);
  await app.invoke('logoutAccount',0);assert.equal(app.sessions.get('persist:muse-account-1').values.length,0);assert.equal(app.sessions.get('persist:muse-account-2').values[0].value,'two');assert.equal(app.windows[1].isDestroyed(),true);assert.equal(app.windows[2].isDestroyed(),false);await assert.rejects(fs.access(path.join(dir,'account-sessions','account-1.enc')));await app.stop();
 }finally{await fs.rm(dir,{recursive:true,force:true});}
});
test('cancel logout preserves the selected profile',async()=>{const dir=await fs.mkdtemp(path.join(os.tmpdir(),'muse-logout-'));try{const app=await boot(dir,{logoutResponse:0,initialCookies:{'persist:muse-account-1':[cookie('one')]}});await app.invoke('browser',0);await app.invoke('logoutAccount',0);assert.equal(app.windows[1].isDestroyed(),false);assert.equal(app.sessions.get('persist:muse-account-1').values.length,1);await app.stop();}finally{await fs.rm(dir,{recursive:true,force:true});}});
test('closing main asks once; Stay preserves windows and queue, Exit requests app shutdown',async()=>{
 const dir=await fs.mkdtemp(path.join(os.tmpdir(),'muse-close-'));let app,release;
 try{
  const gate=new Promise(r=>release=r);app=await boot(dir,{closeResponse:1,closeGate:gate});await app.invoke('language','vi');await app.invoke('browser',0);await app.invoke('add',[{prompt:'Keep this pending scene'}]);
  let prevented=0;app.windows[0].emit('close',{preventDefault(){prevented++;}});app.windows[0].emit('close',{preventDefault(){prevented++;}});
  assert.equal(prevented,2);assert.equal(app.notices.length,1);assert.deepEqual(Array.from(app.notices[0].buttons),['Thoát hẳn','Ở lại']);assert.equal(app.notices[0].defaultId,1);assert.equal(app.notices[0].cancelId,1);assert.equal(app.lifecycle.includes('quit'),false);
  release();await new Promise(r=>setImmediate(r));assert.equal(app.lifecycle.includes('quit'),false);assert.equal(app.windows[1].isDestroyed(),false);assert.equal(app.invoke('state').jobs.length,1);await app.stop();
  app=await boot(dir,{closeResponse:0});app.windows[0].emit('close',{preventDefault(){}});await until(()=>app.lifecycle.includes('quit'));await app.stop();
 }finally{release?.();if(app&&!app.lifecycle.includes('quit'))await app.stop();await fs.rm(dir,{recursive:true,force:true});}
});
test('opening again restores and focuses the sole main window; all native windows have no menu',async()=>{
 const dir=await fs.mkdtemp(path.join(os.tmpdir(),'muse-single-window-'));let app;
 try{
  app=await boot(dir);app.windows[0].minimized=true;app.app.emit('second-instance');app.app.emit('second-instance');
  assert.equal(app.windows.length,1);assert.equal(app.windows[0].restored,true);assert.equal(app.windows[0].focused,2);assert.equal(app.lifecycle.includes('menu-removed'),true);
  await app.invoke('browser',0);await app.invoke('browser',0);assert.equal(app.windows.length,2);
  for(const window of app.windows){assert.equal(window.menu,null);assert.equal(window.menuVisible,false);}await app.stop();
 }finally{if(app&&!app.lifecycle.includes('quit'))await app.stop();await fs.rm(dir,{recursive:true,force:true});}
});

test('stop IPC interrupts a waiting browser job without sending another prompt',{timeout:5000},async()=>{
 const dir=await fs.mkdtemp(path.join(os.tmpdir(),'muse-stop-'));await fs.writeFile(path.join(dir,'studio.json'),JSON.stringify({settings:{output:dir},configVersion:2}));let reached,submitted=0;const waiting=new Promise(r=>reached=r);
 try{const app=await boot(dir,{browserResolver:()=>'/test/chrome',externalLauncher:async()=>{let closed=false;return{external:true,isDestroyed:()=>closed,isSessionEnabled:()=>true,url:()=> 'https://muse.ai/',show:async()=>{},openMuse:async()=>{},evaluate:async()=>{reached();return new Promise(()=>{});},pressEnter:async()=>submitted++,close:async()=>{closed=true;}};}});
 await app.invoke('settings',{...app.invoke('state').settings,requireUSA:false,output:dir,accountCount:1,browserChoice:'chrome',finishAction:'keep'});await app.invoke('browser',0);await app.invoke('add',[{prompt:'original complete scene'},{prompt:'next scene'}]);await app.invoke('start');await waiting;
 const stopped=await app.invoke('stop');assert.equal(stopped.active,false);assert.deepEqual(Array.from(stopped.jobs,j=>j.status),['interrupted','pending']);assert.equal(submitted,0);await app.invoke('clearPending');assert.equal(app.invoke('state').jobs.length,1);await app.invoke('clearList');assert.equal(app.invoke('state').jobs.length,0);await app.stop();
 }finally{await fs.rm(dir,{recursive:true,force:true});}
});

function fixtureMp4(){
  const box=(type,data)=>{const head=Buffer.alloc(8);head.writeUInt32BE(data.length+8);head.write(type,4);return Buffer.concat([head,data]);};
  const hdlr=Buffer.alloc(12);hdlr.write('vide',8);
  return Buffer.concat([box('ftyp',Buffer.from('isom0000')),box('moov',box('trak',box('mdia',box('hdlr',hdlr)))),box('mdat',Buffer.from('fixture media'))]);
}
async function until(predicate,timeout=7000){const end=Date.now()+timeout;while(!predicate()){if(Date.now()>end)throw Error('Timed out waiting for fixture');await new Promise(r=>setTimeout(r,10));}}
test('main binds each prompt transaction and waits for validated saved video before dispatching the next',{timeout:12000},async()=>{
  const dir=await fs.mkdtemp(path.join(os.tmpdir(),'muse-transaction-'));
  let app,ready=false,saveEntered=false,releaseSave;const saveGate=new Promise(r=>releaseSave=r),sent=[],trackers=[];
  try{
    await fs.writeFile(path.join(dir,'studio.json'),JSON.stringify({configVersion:2,settings:{output:dir,accountCount:1,cooldownSeconds:0}}));
    app=await boot(dir,{browserResolver:()=>'/test/chrome',externalLauncher:async()=>{
      let closed=false,draft='';return{external:true,isDestroyed:()=>closed,isSessionEnabled:()=>true,url:()=> 'https://muse.ai/',show:async()=>{},openMuse:async()=>{},
      evaluate:async(fn,arg)=>{
        if(fn.name==='submitPrompt'){sent.push(draft);return{clicked:true};}
        if(fn.name==='beginTracking'){trackers.push({...arg});return{phase:'waiting-prompt'};}
        if(fn.name==='pollTracking')return ready?{phase:'ready',ready:true,echoMatched:true,responseMatched:true,progress:null}:{phase:'rendering',ready:false,echoMatched:true,responseMatched:true,progress:37,stage:'Fixture is creating this scene'};
        if(fn.name==='downloadAction')return{action:'clicked',clicked:true,needsMenu:false};
        if(arg?.prompt && !arg?.id)draft=arg.prompt;return null;
      },pressEnter:async()=>{sent.push(draft);},
      captureDownload:async(target,{trigger,onProgress})=>{await trigger();saveEntered=true;if(sent.length===1)await saveGate;await fs.writeFile(target,fixtureMp4());onProgress({receivedBytes:80,totalBytes:80});},
      close:async()=>{closed=true;}};
    }});
    await app.invoke('settings',{...app.invoke('state').settings,browserChoice:'chrome',finishAction:'keep'});await app.invoke('browser',0);
    await app.invoke('add',[{prompt:'Exact scene one. Camera pans left.',number:1},{prompt:'Exact scene two. Camera pans right.',number:2}]);await app.invoke('start');
    await until(()=>sent.length===1);await until(()=>app.updates.some(rows=>rows[0]?.progress===37));
    assert.deepEqual(sent,['Exact scene one. Camera pans left.']);assert.equal(app.invoke('state').jobs[1].status,'pending');assert.equal(app.invoke('state').jobs[0].stage,'waiting');
    ready=true;await until(()=>saveEntered);assert.equal(sent.length,1);assert.equal(app.invoke('state').jobs[0].status,'running');assert.equal(app.invoke('state').jobs[1].status,'pending');
    releaseSave();await until(()=>!app.invoke('state').active);
    const result=app.invoke('state');assert.deepEqual(sent,['Exact scene one. Camera pans left.','Exact scene two. Camera pans right.']);assert.ok(result.jobs.every(j=>j.status==='completed'));
    assert.equal(trackers.length,2);assert.equal(trackers[0].prompt,sent[0]);assert.equal(trackers[1].prompt,sent[1]);assert.equal(trackers[0].recover,false);
    assert.notEqual(result.jobs[0].output,result.jobs[1].output);assert.equal(path.basename(result.jobs[0].output),'001.mp4');assert.equal(path.basename(result.jobs[1].output),'002.mp4');
    for(const j of result.jobs){assert.deepEqual(await fs.readFile(j.output),fixtureMp4());assert.ok(j.resultReadyAt&&j.downloadCompletedAt);assert.equal(j.output.endsWith('.part'),false);}
    assert.equal((await fs.readdir(dir)).some(file=>file.endsWith('.part')),false);await app.stop();
  }finally{releaseSave();if(app&&!app.lifecycle.includes('quit'))await app.stop();await fs.rm(dir,{recursive:true,force:true});}
});
test('main recovery downloads the existing matched result without submitting any new prompt',{timeout:8000},async()=>{
  const dir=await fs.mkdtemp(path.join(os.tmpdir(),'muse-recover-'));let app,submissions=0,recovered;
  try{
    await fs.writeFile(path.join(dir,'studio.json'),JSON.stringify({configVersion:2,settings:{output:dir,accountCount:1},jobs:[{id:'recover-job',prompt:'Existing exact scene',account:1,status:'interrupted',mayHaveSubmitted:true},{id:'pending-job',prompt:'Later scene',status:'pending'}]}));
    app=await boot(dir,{browserResolver:()=>'/test/chrome',externalLauncher:async()=>({external:true,isDestroyed:()=>false,isSessionEnabled:()=>true,url:()=> 'https://muse.ai/',show:async()=>{},openMuse:async()=>{},close:async()=>{},pressEnter:async()=>submissions++,
      evaluate:async(fn,arg)=>{if(fn.name==='beginTracking')recovered=arg;if(fn.name==='pollTracking')return{phase:'ready',ready:true,echoMatched:true,responseMatched:true,progress:null};if(fn.name==='downloadAction')return{action:'clicked',clicked:true,needsMenu:false};return null;},
      captureDownload:async(target,{trigger})=>{await trigger();await fs.writeFile(target,fixtureMp4());}
    })});
    await app.invoke('settings',{...app.invoke('state').settings,browserChoice:'chrome',finishAction:'keep'});await app.invoke('browser',0);await app.invoke('retryDownload','recover-job');await until(()=>!app.invoke('state').active);
    assert.equal(recovered.recover,true);assert.equal(recovered.prompt,'Existing exact scene');assert.equal(submissions,0);assert.equal(app.invoke('state').jobs[0].status,'completed');assert.equal(app.invoke('state').jobs[1].status,'pending');await app.stop();
  }finally{if(app&&!app.lifecycle.includes('quit'))await app.stop();await fs.rm(dir,{recursive:true,force:true});}
});

test('stop while license preflight is pending invalidates the start instead of dispatching later',{timeout:5000},async()=>{
  const dir=await fs.mkdtemp(path.join(os.tmpdir(),'muse-preflight-stop-'));let release,entered,app;
  const wait=new Promise(r=>release=r),started=new Promise(r=>entered=r);
  try{
    app=await boot(dir,{licenseGate:{entered,wait}});await app.invoke('add',[{prompt:'Do not submit after stop'}]);
    const pending=app.invoke('start');await started;assert.equal(app.invoke('state').starting,true);
    await assert.rejects(app.invoke('packageClips'),/Chờ xử lý/);
    const stopped=await app.invoke('stop');assert.equal(stopped.active,false);release();await pending;
    assert.equal(app.invoke('state').active,false);assert.equal(app.invoke('state').jobs[0].status,'pending');assert.equal(app.errors.length,0);await app.stop();
  }finally{release();if(app&&!app.lifecycle.includes('quit'))await app.stop();await fs.rm(dir,{recursive:true,force:true});}
});
test('recovery refuses a different browser profile before searching or downloading',{timeout:5000},async()=>{
 const dir=await fs.mkdtemp(path.join(os.tmpdir(),'muse-profile-recovery-'));let app;
 try{
  await fs.writeFile(path.join(dir,'studio.json'),JSON.stringify({configVersion:2,settings:{output:dir,accountCount:1},jobs:[{id:'old-chrome',prompt:'Existing scene',account:1,status:'interrupted',mayHaveSubmitted:true,submissionProfileKey:'chrome/account-1'}]}));
  app=await boot(dir);await app.invoke('browser',0);await app.invoke('retryDownload','old-chrome');await until(()=>!app.invoke('state').active);
  assert.equal(app.invoke('state').jobs[0].status,'failed');assert.match(app.invoke('state').jobs[0].error,/đúng trình duyệt/);assert.equal(app.invoke('state').jobs[0].output,'');await app.stop();
 }finally{if(app&&!app.lifecycle.includes('quit'))await app.stop();await fs.rm(dir,{recursive:true,force:true});}
});

test('unresponsive Muse DOM stays waiting and Stop leaves next prompt pending',{timeout:5000},async()=>{
 const dir=await fs.mkdtemp(path.join(os.tmpdir(),'muse-dom-timeout-'));let app,submitted=0;
 try{
  await fs.writeFile(path.join(dir,'studio.json'),JSON.stringify({configVersion:2,settings:{output:dir,accountCount:1}}));
  app=await boot(dir,{domTimeoutMs:25,browserResolver:()=>'/test/chrome',externalLauncher:async()=>({external:true,isDestroyed:()=>false,isSessionEnabled:()=>true,url:()=> 'https://muse.ai/',show:async()=>{},openMuse:async()=>{},close:async()=>{},evaluate:async()=>new Promise(()=>{}),pressEnter:async()=>submitted++})});
  await app.invoke('settings',{...app.invoke('state').settings,browserChoice:'chrome',finishAction:'keep'});await app.invoke('browser',0);await app.invoke('add',[{prompt:'First scene'},{prompt:'Second scene'}]);await app.invoke('start');await until(()=>app.invoke('state').jobs[0].stageMessage?.includes('lag'));
  const state=app.invoke('state');assert.equal(state.jobs[0].status,'running');assert.equal(state.jobs[1].status,'pending');assert.equal(submitted,0);const stopped=await app.invoke('stop');assert.equal(stopped.jobs[0].status,'interrupted');assert.equal(stopped.active,false);await app.stop();
 }finally{if(app&&!app.lifecycle.includes('quit'))await app.stop();await fs.rm(dir,{recursive:true,force:true});}
});

test('upgrade enables parallel accounts once and preserves later explicit sequential choice',async()=>{
 const dir=await fs.mkdtemp(path.join(os.tmpdir(),'muse-parallel-upgrade-'));let app;
 try{
  await fs.writeFile(path.join(dir,'studio.json'),JSON.stringify({configVersion:2,settings:{accountCount:2,dispatchMode:'sequential'},jobs:[{id:'kept-job',prompt:'Keep this scene',status:'pending'}]}));
  app=await boot(dir);let state=app.invoke('state');assert.equal(state.settings.dispatchMode,'parallel');assert.equal(state.settings.accountCount,2);assert.equal(state.jobs[0].id,'kept-job');
  await app.invoke('settings',{...state.settings,dispatchMode:'sequential',finishAction:'keep'});await app.stop();
  assert.equal(JSON.parse(await fs.readFile(path.join(dir,'studio.json'),'utf8')).dispatchRevision,1);
  app=await boot(dir);assert.equal(app.invoke('state').settings.dispatchMode,'sequential');await app.stop();
 }finally{if(app&&!app.lifecycle.includes('quit'))await app.stop();await fs.rm(dir,{recursive:true,force:true});}
});
test('two account browsers submit together and the faster account takes the next scene independently',{timeout:12000},async()=>{
 const dir=await fs.mkdtemp(path.join(os.tmpdir(),'muse-parallel-browsers-'));let app,release;const slow=new Promise(r=>release=r),sent=[[],[]],busy=[0,0];let launched=0,slowDownloading=false;
 try{
  await fs.writeFile(path.join(dir,'studio.json'),JSON.stringify({configVersion:2,settings:{output:dir,accountCount:2,cooldownSeconds:0}}));
  app=await boot(dir,{browserResolver:()=>'/test/chrome',externalLauncher:async()=>{
   const slot=launched++;let draft='';return{external:true,isDestroyed:()=>false,isSessionEnabled:()=>true,url:()=> 'https://muse.ai/',show:async()=>{},openMuse:async()=>{},close:async()=>{},evaluate:async(fn,arg)=>{
    if(fn.name==='submitPrompt'){assert.equal(busy[slot],0);busy[slot]++;sent[slot].push(draft);return{clicked:true};}
    if(fn.name==='pollTracking')return{phase:'ready',ready:true,echoMatched:true,responseMatched:true,progress:null};
    if(fn.name==='downloadAction')return{action:'clicked',clicked:true,needsMenu:false};
    if(arg?.prompt&&!arg?.id)draft=arg.prompt;return null;
   },captureDownload:async(target,{trigger})=>{await trigger();if(slot===0){slowDownloading=true;await slow;}await fs.writeFile(target,fixtureMp4());busy[slot]--;}};
  }});
  await app.invoke('settings',{...app.invoke('state').settings,browserChoice:'chrome',finishAction:'keep'});await app.invoke('browser',0);await app.invoke('browser',1);
  await app.invoke('add',[{prompt:'Scene one'},{prompt:'Scene two'},{prompt:'Scene three'}]);await app.invoke('start');
  await until(()=>slowDownloading&&app.invoke('state').jobs[2].status==='completed');
  assert.deepEqual(sent,[['Scene one'],['Scene two','Scene three']]);assert.equal(app.invoke('state').jobs[0].status,'running');assert.equal(app.invoke('state').active,true);assert.deepEqual(Array.from(app.invoke('state').jobs,j=>j.account),[1,2,2]);
  release();await until(()=>!app.invoke('state').active);assert.ok(app.invoke('state').jobs.every(j=>j.status==='completed'));assert.deepEqual(busy,[0,0]);await app.stop();
 }finally{release();if(app&&!app.lifecycle.includes('quit'))await app.stop();await fs.rm(dir,{recursive:true,force:true});}
});

test('Stop clicks Muse cancellation and Continue resubmits the same locked scene before the next scene',{timeout:10000},async()=>{
 const dir=await fs.mkdtemp(path.join(os.tmpdir(),'muse-remote-stop-'));let app,draft='',stopClicks=0;const sent=[],attempts=[];
 try{
  await fs.writeFile(path.join(dir,'studio.json'),JSON.stringify({configVersion:2,settings:{output:dir,accountCount:1,cooldownSeconds:0}}));
  app=await boot(dir,{browserResolver:()=>'/test/chrome',externalLauncher:async()=>({external:true,isDestroyed:()=>false,isSessionEnabled:()=>true,url:()=> 'https://muse.ai/',openMuse:async()=>{},show:async()=>{},close:async()=>{},evaluate:async(fn,arg)=>{
   if(fn.name==='beginTracking'){attempts.push(arg);return{};}
   if(fn.name==='submitPrompt'){sent.push(draft);return{clicked:true};}
   if(fn.name==='browserStop'){if(arg.request){stopClicks++;return{state:'requested',clicked:true};}return{state:'confirmed',clicked:false};}
   if(fn.name==='pollTracking')return sent.length===1?new Promise(()=>{}):{phase:'ready',ready:true,echoMatched:true,responseMatched:true,echoKey:'new-reply',progress:null};
   if(fn.name==='downloadAction')return{action:'clicked',clicked:true};if(arg?.prompt&&!arg?.id)draft=arg.prompt;return null;
  },captureDownload:async(target,{trigger})=>{await trigger();await fs.writeFile(target,fixtureMp4());}})});
  await app.invoke('settings',{...app.invoke('state').settings,browserChoice:'chrome',finishAction:'keep'});await app.invoke('browser',0);await app.invoke('add',[{prompt:'Locked original scene'},{prompt:'Next scene'}]);await app.invoke('start');await until(()=>sent.length===1);
  const stopped=await app.invoke('stop');assert.equal(stopClicks,1);assert.equal(stopped.stopping,false);assert.equal(stopped.jobs[0].remoteStop.state,'confirmed');assert.equal(stopped.jobs[0].status,'interrupted');assert.equal(stopped.jobs[1].status,'pending');
  await app.invoke('start');await until(()=>!app.invoke('state').active);assert.deepEqual(sent,['Locked original scene','Locked original scene','Next scene']);assert.notEqual(attempts[0].id,attempts[1].id);assert.equal(attempts[1].recover,false);assert.ok(app.invoke('state').jobs.every(j=>j.status==='completed'));await app.stop();
 }finally{if(app&&!app.lifecycle.includes('quit'))await app.stop();await fs.rm(dir,{recursive:true,force:true});}
});
test('a temporary DOM timeout while Muse creates does not fail, resend or dispatch another prompt',{timeout:10000},async()=>{
 const dir=await fs.mkdtemp(path.join(os.tmpdir(),'muse-slow-generation-'));let app,sent=0,polls=0;
 try{
  await fs.writeFile(path.join(dir,'studio.json'),JSON.stringify({configVersion:2,settings:{output:dir,accountCount:1,cooldownSeconds:0}}));
  app=await boot(dir,{browserResolver:()=>'/test/chrome',externalLauncher:async()=>({external:true,isDestroyed:()=>false,isSessionEnabled:()=>true,url:()=> 'https://muse.ai/',openMuse:async()=>{},show:async()=>{},close:async()=>{},evaluate:async(fn)=>{
   if(fn.name==='submitPrompt'){sent++;return{clicked:true};}
   if(fn.name==='pollTracking'){polls++;if(polls===1)throw Object.assign(Error('temporary lag'),{code:'MUSE_DOM_TIMEOUT'});return{phase:'ready',ready:true,echoMatched:true,responseMatched:true,progress:null};}
   if(fn.name==='downloadAction')return{action:'clicked',clicked:true};return null;
  },captureDownload:async(target,{trigger})=>{await trigger();await fs.writeFile(target,fixtureMp4());}})});
  await app.invoke('settings',{...app.invoke('state').settings,browserChoice:'chrome',finishAction:'keep'});await app.invoke('browser',0);await app.invoke('add',[{prompt:'Slow scene'},{prompt:'Later scene'}]);await app.invoke('start');await until(()=>polls===1);
  assert.equal(app.invoke('state').jobs[0].status,'running');assert.equal(app.invoke('state').jobs[1].status,'pending');assert.equal(sent,1);
  await until(()=>!app.invoke('state').active);assert.ok(app.invoke('state').jobs.every(j=>j.status==='completed'));assert.equal(sent,2);assert.equal(app.updates.some(rows=>rows.some(j=>j.status==='failed')),false);await app.stop();
 }finally{if(app&&!app.lifecycle.includes('quit'))await app.stop();await fs.rm(dir,{recursive:true,force:true});}
});

test('uncertain remote stop resumes the original attempt and retries downloading without resending',{timeout:30000},async()=>{
 const dir=await fs.mkdtemp(path.join(os.tmpdir(),'muse-retry-transfer-'));let app,recovering=false,sent=0,downloads=0;const attempts=[];
 try{
  await fs.writeFile(path.join(dir,'studio.json'),JSON.stringify({configVersion:2,settings:{output:dir,accountCount:1,cooldownSeconds:0}}));
  app=await boot(dir,{browserResolver:()=>'/test/chrome',externalLauncher:async()=>({external:true,isDestroyed:()=>false,isSessionEnabled:()=>true,url:()=> 'https://muse.ai/',openMuse:async()=>{},show:async()=>{},close:async()=>{},evaluate:async(fn,arg)=>{
   if(fn.name==='beginTracking'){attempts.push(arg);if(arg.recover)recovering=true;return{};}
   if(fn.name==='submitPrompt'){sent++;return{clicked:true};}
   if(fn.name==='browserStop')return{state:'unavailable',clicked:false};
   if(fn.name==='pollTracking')return recovering?{phase:'ready',ready:true,echoMatched:true,responseMatched:true,progress:null}:new Promise(()=>{});
   if(fn.name==='downloadAction')return{action:'clicked',clicked:true};return null;
  },captureDownload:async(target,{trigger})=>{await trigger();downloads++;if(downloads===1)throw Error('Server transfer is not ready yet');await fs.writeFile(target,fixtureMp4());}})});
  await app.invoke('settings',{...app.invoke('state').settings,browserChoice:'chrome',finishAction:'keep'});await app.invoke('browser',0);await app.invoke('add',[{prompt:'Original pending result'},{prompt:'Later scene'}]);await app.invoke('start');await until(()=>sent===1);
  await app.invoke('stop');assert.equal(app.invoke('state').jobs[0].remoteStop.state,'unavailable');await app.invoke('start');await until(()=>downloads===1);
  assert.equal(sent,1);assert.equal(app.invoke('state').jobs[0].status,'running');assert.equal(app.invoke('state').jobs[1].status,'pending');assert.equal(attempts[1].recover,true);assert.equal(attempts[1].id,attempts[0].id);
  await until(()=>!app.invoke('state').active,10000);assert.equal(sent,2);assert.equal(downloads,3);assert.ok(app.invoke('state').jobs.every(j=>j.status==='completed'));await app.stop();
 }finally{if(app&&!app.lifecycle.includes('quit'))await app.stop();await fs.rm(dir,{recursive:true,force:true});}
});


test('one warmup sends to ten browsers and finishes without any reply; only Start sends video prompts',{timeout:12000},async()=>{
 const dir=await fs.mkdtemp(path.join(os.tmpdir(),'muse-test-handshake-'));let app,launched=0;const sent=[],begins=[];
 try{
  await fs.writeFile(path.join(dir,'studio.json'),JSON.stringify({configVersion:2,settings:{output:dir}}));
  app=await boot(dir,{browserResolver:()=>'/test/chrome',externalLauncher:async()=>{
   const index=launched++;return{external:true,isDestroyed:()=>false,isSessionEnabled:()=>true,url:()=> 'https://muse.ai/',show:async()=>{},openMuse:async()=>{},close:async()=>{},evaluate:async(fn,arg)=>{
    if(fn.name==='browserStop')return {state:'confirmed',clicked:false};
    if(fn.name==='prepareBrowserProbe'){assert.equal(arg.text,'Bắt đầu công việc mới nhé');begins.push({index,id:arg.id,prompt:arg.text});return true;}
    if(fn.name==='missingBrowserPrompts')return [];
    if(fn.name==='beginTracking'){begins.push({index,...arg});return {};}
    if(fn.name==='submitPrompt'){sent.push({index,id:arg.id});return {clicked:true};}
    if(fn.name==='pollBrowserProbe')throw Error('Warmup must not wait for Muse reply');
    if(fn.name==='verifyBrowserTest')return true;
    if(fn.name==='pollTracking')return {phase:'waiting-prompt',ready:false,echoMatched:false};
    return null;
   }};
  }});
  await app.invoke('settings',{...app.invoke('state').settings,accountCount:10,browserChoice:'chrome',output:dir,cooldownSeconds:0,finishAction:'keep'});
  await assert.rejects(app.invoke('settings',{...app.invoke('state').settings,accountCount:11,finishAction:'keep'}),/1–10/);
  await app.invoke('add',Array.from({length:12},(_,i)=>({prompt:'Video scene '+(i+1)})));
  await app.invoke('testBrowsers');
  assert.equal(launched,10);assert.equal(app.invoke('state').accounts.length,10);
  assert.equal(app.invoke('state').active,false);assert.ok(app.invoke('state').jobs.every(j=>j.status==='pending'));
  assert.equal(app.invoke('state').testing,false);assert.ok(app.invoke('state').browserTests.every(t=>t.status==='sent'));
  assert.equal(sent.length,10);assert.ok(begins.every(b=>b.prompt==='Bắt đầu công việc mới nhé'));
  await app.invoke('start');await until(()=>sent.length===20);
  assert.equal(app.invoke('state').jobs.filter(j=>j.status==='running').length,10);
  assert.equal(app.invoke('state').jobs.filter(j=>j.status==='pending').length,2);
  assert.ok(app.invoke('state').jobs.filter(j=>j.status==='running').every(j=>!j.acknowledgedAt));
  await app.invoke('stop');await app.stop();
 }finally{if(app&&!app.lifecycle.includes('quit'))await app.stop();await fs.rm(dir,{recursive:true,force:true});}
});

test('ready without current prompt and response evidence never enters download',{timeout:10000},async()=>{
 const dir=await fs.mkdtemp(path.join(os.tmpdir(),'muse-send-phases-'));let app,echo=false,response=false,downloads=0,polls=0;
 try{
  await fs.writeFile(path.join(dir,'studio.json'),JSON.stringify({configVersion:2,settings:{output:dir,accountCount:1,cooldownSeconds:0}}));
  app=await boot(dir,{browserResolver:()=>'/test/chrome',externalLauncher:async()=>({external:true,isDestroyed:()=>false,isSessionEnabled:()=>true,url:()=> 'https://muse.ai/',openMuse:async()=>{},show:async()=>{},close:async()=>{},evaluate:async(fn)=>{
   if(fn.name==='submitPrompt')return{clicked:true};
   if(fn.name==='browserStop')return{state:'confirmed',clicked:false};
   if(fn.name==='pollTracking'){polls++;return{phase:'ready',ready:true,echoMatched:echo,responseMatched:response,echoKey:echo?'current-scene':'',progress:100};}
   if(fn.name==='downloadAction')return{action:'clicked',clicked:true};return null;
  },captureDownload:async(target,{trigger})=>{downloads++;await trigger();await fs.writeFile(target,fixtureMp4());}})});
  await app.invoke('settings',{...app.invoke('state').settings,browserChoice:'chrome',finishAction:'keep'});await app.invoke('browser',0);await app.invoke('add',[{prompt:'Exact current scene'}]);await app.invoke('start');
  await until(()=>polls===1);assert.equal(downloads,0);assert.equal(app.invoke('state').jobs[0].stage,'confirming');assert.equal(app.invoke('state').jobs[0].resultReadyAt,null);assert.equal(app.invoke('state').jobs[0].progress,null);
  echo=true;await until(()=>polls>=2&&app.invoke('state').jobs[0].stage==='waiting');assert.equal(downloads,0);assert.equal(app.invoke('state').jobs[0].stage,'waiting');assert.ok(app.invoke('state').jobs[0].submissionReceipt);assert.equal(app.invoke('state').jobs[0].progress,null);
  response=true;await until(()=>!app.invoke('state').active);assert.equal(downloads,1);assert.equal(app.invoke('state').jobs[0].status,'completed');await app.stop();
 }finally{if(app&&!app.lifecycle.includes('quit'))await app.stop();await fs.rm(dir,{recursive:true,force:true});}
});

test('rejected Send validation stays unsent and Continue retries sending instead of recovering a video',{timeout:5000},async()=>{
 const dir=await fs.mkdtemp(path.join(os.tmpdir(),'muse-send-retry-'));let app,sends=0,fail=true;
 try{
  await fs.writeFile(path.join(dir,'studio.json'),JSON.stringify({configVersion:2,settings:{output:dir,accountCount:1,cooldownSeconds:0}}));
  app=await boot(dir,{browserResolver:()=>'/test/chrome',externalLauncher:async()=>({external:true,isDestroyed:()=>false,isSessionEnabled:()=>true,url:()=> 'https://muse.ai/',openMuse:async()=>{},show:async()=>{},close:async()=>{},evaluate:async(fn)=>{
   if(fn.name==='submitPrompt'){if(fail)throw Error('Nút Gửi chưa sẵn sàng; chưa gửi prompt.');sends++;return{clicked:true};}
   if(fn.name==='browserStop')return{state:'confirmed',clicked:false};
   if(fn.name==='pollTracking')return{phase:'ready',ready:true,echoMatched:true,responseMatched:true};
   if(fn.name==='downloadAction')return{action:'clicked',clicked:true};return null;
  },captureDownload:async(target,{trigger})=>{await trigger();await fs.writeFile(target,fixtureMp4());}})});
  await app.invoke('settings',{...app.invoke('state').settings,browserChoice:'chrome',finishAction:'keep'});await app.invoke('browser',0);await app.invoke('add',[{prompt:'Scene must be sent first'}]);await app.invoke('start');await until(()=>!app.invoke('state').active);
  assert.equal(app.invoke('state').jobs[0].mayHaveSubmitted,false);assert.equal(app.invoke('state').jobs[0].status,'failed');assert.equal(sends,0);
  fail=false;await app.invoke('start');await until(()=>!app.invoke('state').active);assert.equal(sends,1);assert.equal(app.invoke('state').jobs[0].status,'completed');await app.stop();
 }finally{if(app&&!app.lifecycle.includes('quit'))await app.stop();await fs.rm(dir,{recursive:true,force:true});}
});


test('Start needs no Test, opens accounts, waits for composer, and failed warmup never blocks Continue',{timeout:8000},async()=>{
 const dir=await fs.mkdtemp(path.join(os.tmpdir(),'muse-optional-warmup-'));let app,launched=0,send=0,draftAttempts=0;
 try{
  await fs.writeFile(path.join(dir,'studio.json'),JSON.stringify({configVersion:2,settings:{output:dir,accountCount:1,cooldownSeconds:0}}));
  app=await boot(dir,{browserResolver:()=>'/test/chrome',externalLauncher:async()=>{launched++;return{external:true,isDestroyed:()=>false,isSessionEnabled:()=>true,url:()=> 'https://muse.ai/',openMuse:async()=>{},show:async()=>{},close:async()=>{},evaluate:async(fn,arg)=>{
   if(fn.name==='prepareBrowserProbe')throw Error('Optional warmup cannot find its send control');
   if(fn.name==='submitPrompt'){send++;return{clicked:true};}
   if(fn.name==='browserStop')return{state:'confirmed',clicked:false};
   if(fn.name==='pollTracking')return{phase:'waiting-prompt',echoMatched:false,ready:false};
   if(arg?.prompt&&!arg?.id){draftAttempts++;return draftAttempts<3?{notReady:true}:{reused:false};}return null;
  }};}});
  await app.invoke('settings',{...app.invoke('state').settings,browserChoice:'chrome',finishAction:'keep'});await app.invoke('add',[{prompt:'Send without testing first'}]);
  await app.invoke('start');await until(()=>send===1);assert.equal(launched,1);assert.ok(draftAttempts>=3);assert.equal(app.invoke('state').browserTests[0].status,'not-tested');
  await app.invoke('stop');await app.invoke('testBrowsers');assert.equal(app.invoke('state').browserTests[0].status,'failed');
  await app.invoke('start');await until(()=>send===2);assert.equal(app.invoke('state').active,true);await app.invoke('stop');await app.stop();
 }finally{if(app&&!app.lifecycle.includes('quit'))await app.stop();await fs.rm(dir,{recursive:true,force:true});}
});

test('Start ends warmup safely without waiting for reply or overlapping composer writes',{timeout:8000},async()=>{
 const dir=await fs.mkdtemp(path.join(os.tmpdir(),'muse-warmup-handoff-'));let app,release,preparing=false,sends=0,cleared=false;
 const gate=new Promise(r=>release=r);
 try{
  await fs.writeFile(path.join(dir,'studio.json'),JSON.stringify({configVersion:2,settings:{output:dir,accountCount:1,cooldownSeconds:0}}));
  app=await boot(dir,{browserResolver:()=>'/test/chrome',externalLauncher:async()=>({external:true,isDestroyed:()=>false,isSessionEnabled:()=>true,url:()=> 'https://muse.ai/',openMuse:async()=>{},show:async()=>{},close:async()=>{},evaluate:async(fn,arg)=>{
   if(fn.name==='prepareBrowserProbe'){preparing=true;await gate;return true;}
   if(fn.name==='clearBrowserProbeDraft'){cleared=true;return true;}
   if(fn.name==='submitPrompt'){assert.equal(cleared,true);sends++;return{clicked:true};}
   if(fn.name==='browserStop')return{state:'confirmed',clicked:false};
   if(fn.name==='pollTracking')return{phase:'waiting-prompt',echoMatched:false,ready:false};
   return null;
  }})});
  await app.invoke('settings',{...app.invoke('state').settings,browserChoice:'chrome',finishAction:'keep'});await app.invoke('add',[{prompt:'Scene after canceling warmup'}]);
  const warmup=app.invoke('testBrowsers');await until(()=>preparing);const start=app.invoke('start');await new Promise(r=>setTimeout(r,30));assert.equal(sends,0);
  release();await warmup;await start;await until(()=>sends===1);assert.equal(app.invoke('state').testing,false);await app.invoke('stop');await app.stop();
 }finally{release();if(app&&!app.lifecycle.includes('quit'))await app.stop();await fs.rm(dir,{recursive:true,force:true});}
});

test('interface language defaults to English, persists Vietnamese and localizes exit options',async()=>{
 const dir=await fs.mkdtemp(path.join(os.tmpdir(),'muse-languages-'));let app;
 try{
  app=await boot(dir);assert.equal(app.invoke('state').settings.language,'en');app.windows[0].emit('close',{preventDefault(){}});await new Promise(r=>setImmediate(r));
  assert.deepEqual(Array.from(app.notices[0].buttons),['Exit completely','Stay']);assert.equal(app.lifecycle.includes('quit'),false);
  await assert.rejects(app.invoke('language','fr'),/Unsupported/);await app.invoke('language','vi');await app.stop();
  app=await boot(dir);assert.equal(app.invoke('state').settings.language,'vi');app.windows[0].emit('close',{preventDefault(){}});await new Promise(r=>setImmediate(r));assert.deepEqual(Array.from(app.notices[0].buttons),['Thoát hẳn','Ở lại']);await app.stop();
 }finally{if(app&&!app.lifecycle.includes('quit'))await app.stop();await fs.rm(dir,{recursive:true,force:true});}
});
