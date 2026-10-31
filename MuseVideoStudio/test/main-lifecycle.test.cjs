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

async function boot(userData, { initialCookies = {}, ownsLock = true, cookieReadGate, externalLauncher, browserResolver, networkProbe, licenseGate, logoutResponse=1 } = {}) {
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
    isMinimized() { return false; }
    show() {} focus() {} restore() {}
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
    showMessageBox:async(_parent,options)=>{notices.push(options);return{response:logoutResponse};},
    showMessageBoxSync: options => { notices.push(options); return 1; },
    showSaveDialog: async () => ({ canceled: false, filePath: path.join(userData, 'export.json') })
  };
  const electron = { app, BrowserWindow, safeStorage, dialog,
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
    __dirname: path.dirname(mainPath), Buffer, URL, console, setTimeout, clearTimeout, AbortController
  });
  vm.runInContext(await fs.readFile(mainPath, 'utf8'), context, { filename: mainPath });
  if (ownsLock) await loadedPromise;
  else await new Promise(resolve => setImmediate(resolve));
  assert.deepEqual(errors, []);

  return { handlers, sessions, windows, lifecycle, notices, errors,updates,
    invoke: (name, data, sender = windows[0]?.webContents) => handlers.get(`studio:${name}`)({ sender }, data),
    async stop() {
      let prevented = false;
      app.emit('before-quit', { preventDefault() { prevented = true; } });
      await quitPromise;
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
    assert.equal(first.sessions.size, 2); assert.equal(first.windows.length, 3);
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
test('closing the main window requests full app shutdown instead of abandoning browser windows',async()=>{const dir=await fs.mkdtemp(path.join(os.tmpdir(),'muse-close-'));try{const app=await boot(dir);let prevented=false;app.windows[0].emit('close',{preventDefault(){prevented=true;}});assert.equal(prevented,true);assert.ok(app.lifecycle.includes('quit'));await app.stop();}finally{await fs.rm(dir,{recursive:true,force:true});}});

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
        if(fn.name==='beginTracking'){trackers.push({...arg});return{phase:'waiting-prompt'};}
        if(fn.name==='pollTracking')return ready?{phase:'ready',ready:true,progress:null}:{phase:'rendering',ready:false,progress:37,stage:'Fixture is creating this scene'};
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
    assert.notEqual(result.jobs[0].output,result.jobs[1].output);
    for(const j of result.jobs){assert.deepEqual(await fs.readFile(j.output),fixtureMp4());assert.ok(j.resultReadyAt&&j.downloadCompletedAt);assert.equal(j.output.endsWith('.part'),false);}
    assert.equal((await fs.readdir(dir)).some(file=>file.endsWith('.part')),false);await app.stop();
  }finally{releaseSave();if(app&&!app.lifecycle.includes('quit'))await app.stop();await fs.rm(dir,{recursive:true,force:true});}
});
test('main recovery downloads the existing matched result without submitting any new prompt',{timeout:8000},async()=>{
  const dir=await fs.mkdtemp(path.join(os.tmpdir(),'muse-recover-'));let app,submissions=0,recovered;
  try{
    await fs.writeFile(path.join(dir,'studio.json'),JSON.stringify({configVersion:2,settings:{output:dir,accountCount:1},jobs:[{id:'recover-job',prompt:'Existing exact scene',account:1,status:'interrupted',mayHaveSubmitted:true},{id:'pending-job',prompt:'Later scene',status:'pending'}]}));
    app=await boot(dir,{browserResolver:()=>'/test/chrome',externalLauncher:async()=>({external:true,isDestroyed:()=>false,isSessionEnabled:()=>true,url:()=> 'https://muse.ai/',show:async()=>{},openMuse:async()=>{},close:async()=>{},pressEnter:async()=>submissions++,
      evaluate:async(fn,arg)=>{if(fn.name==='beginTracking')recovered=arg;if(fn.name==='pollTracking')return{phase:'ready',ready:true,progress:null};if(fn.name==='downloadAction')return{action:'clicked',clicked:true,needsMenu:false};return null;},
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
