process.env.MUSE_NOTIFY_MS = '0';   // mỗi lần đổi trạng thái đều phải thấy được (mặc định app gom ~4 lần/giây)
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

async function boot(userData, { initialCookies = {}, ownsLock = true, cookieReadGate, externalLauncher, browserResolver, networkProbe, licenseGate, longTerm, wildWriterFactory, pairWriterFactory, pairHudFactory, voiceServiceFactory, domTimeoutMs=20000, logoutResponse=1,closeResponse=1,closeGate } = {}) {
  const handlers = new Map(), sessions = new Map(), windows = [], errors = [], notices = [], trashed = [];
  const lifecycle = [],updates=[];
  let loaded, quit;
  const loadedPromise = new Promise(resolve => { loaded = resolve; });
  const quitPromise = new Promise(resolve => { quit = resolve; });
  const app = new EventEmitter();
  app.requestSingleInstanceLock = () => ownsLock;
  app.whenReady = () => Promise.resolve();
  app.getPath = name => { assert.ok(['userData', 'downloads'].includes(name), name); return name === 'downloads' ? path.join(userData, 'Downloads') : userData; };
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
    shell: { showItemInFolder() {}, openPath: async () => '', openExternal: async()=>{}, trashItem: async target => { trashed.push(target); } },
    ipcMain: { handle: (name, handler) => handlers.set(name, handler) }
  };
  const context = vm.createContext({
    require: name => {
      if(name === 'electron') return electron;
      if(name==='./license.cjs' && licenseGate){const real=localRequire(name);return{...real,createLicense:async options=>{const manager=await real.createLicense(options),ensure=manager.ensureAllowed;manager.ensureAllowed=async()=>{licenseGate.entered();await licenseGate.wait;return ensure();};return manager;}};}
      if(name==='./license.cjs' && longTerm){const real=localRequire(name);return{...real,createLicense:async options=>{const manager=await real.createLicense(options);manager.requireLongTerm=async()=>manager.ensureAllowed();return manager;}};}
      if(name==='./wild-write.cjs' && wildWriterFactory)return{createWildWriter:wildWriterFactory};
      if(name==='./pair-write.cjs' && pairWriterFactory)return{createPairWriter:pairWriterFactory};
      if(name==='./pair-hud-window.cjs' && pairHudFactory)return{createWindowHud:pairHudFactory};
      if(name==='./story-voice.cjs' && voiceServiceFactory){const real=localRequire(name);return{...real,createVoiceService:voiceServiceFactory};}
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

  return { app,handlers, sessions, windows, lifecycle, notices, errors,updates,trashed,
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
    assert.equal(first.invoke('state').accounts.slice(0, 2).every(account => account.rememberSession), true);
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

test('login accounts 1–10 can be opened before parallel run count is raised',{timeout:8000},async()=>{
 const dir=await fs.mkdtemp(path.join(os.tmpdir(),'muse-login-ten-'));await fs.writeFile(path.join(dir,'studio.json'),JSON.stringify({settings:{output:dir,accountCount:2},configVersion:2}));const opened=[];let app;
 try{
  app=await boot(dir,{browserResolver:()=>'/test/chrome',externalLauncher:async options=>{let closed=false;opened.push(options.profileDir);return{external:true,isDestroyed:()=>closed,isSessionEnabled:()=>true,url:()=> 'https://muse.ai/',show:async()=>{},openMuse:async()=>{},evaluate:async()=>null,close:async()=>{closed=true;}};}});
  await app.invoke('settings',{...app.invoke('state').settings,accountCount:2,browserChoice:'chrome',output:dir,finishAction:'keep'});
  assert.equal(app.invoke('state').accounts.length,10);
  await app.invoke('browser',9);await app.invoke('browser',4);
  assert.deepEqual(opened.map(p=>path.basename(p)),['account-10','account-5']);
  await assert.rejects(app.invoke('browser',10),/Tài khoản không hợp lệ/);
  await assert.rejects(app.invoke('browser',-1),/Tài khoản không hợp lệ/);
  assert.equal(app.invoke('state').settings.accountCount,2);
  assert.ok(app.invoke('state').accounts[9].opened);
  await app.stop();
 }finally{if(app&&!app.lifecycle.includes('quit'))await app.stop();await fs.rm(dir,{recursive:true,force:true});}
});

test('stop IPC interrupts a waiting browser job without sending another prompt',{timeout:5000},async()=>{
 const dir=await fs.mkdtemp(path.join(os.tmpdir(),'muse-stop-'));await fs.writeFile(path.join(dir,'studio.json'),JSON.stringify({settings:{output:dir},configVersion:2}));let reached,submitted=0;const waiting=new Promise(r=>reached=r);
 try{const app=await boot(dir,{browserResolver:()=>'/test/chrome',externalLauncher:async()=>{let closed=false;return{external:true,isDestroyed:()=>closed,isSessionEnabled:()=>true,url:()=> 'https://muse.ai/',show:async()=>{},openMuse:async()=>{},evaluate:async()=>{reached();return new Promise(()=>{});},pressEnter:async()=>submitted++,close:async()=>{closed=true;}};}});
 await app.invoke('settings',{...app.invoke('state').settings,requireUSA:false,output:dir,accountCount:1,browserChoice:'chrome',finishAction:'keep'});await app.invoke('browser',0);await app.invoke('add',[{prompt:'original complete scene'},{prompt:'next scene'}]);await app.invoke('start');await waiting;
 const stopped=await app.invoke('stop');assert.equal(stopped.active,false);assert.deepEqual(Array.from(stopped.jobs,j=>j.status),['interrupted','pending']);assert.equal(submitted,0);await app.invoke('clearPending');assert.equal(app.invoke('state').jobs.length,1);await app.invoke('clearList');assert.equal(app.invoke('state').jobs.length,0);await app.stop();
 }finally{await fs.rm(dir,{recursive:true,force:true});}
});

test('storyRelock gắn khóa hình dạng vào cảnh CHƯA xong có ảnh nhân vật, không đụng cảnh xong / quảng cáo / mẹo / không ảnh',{timeout:8000},async()=>{
  const dir=await fs.mkdtemp(path.join(os.tmpdir(),'muse-relock-'));
  const AUDIO='Audio: no speech, no dialogue, no singing, no narration, no mumbling, no murmuring, no whispering, no humming, no laughing out loud, no human voice or vocal sound of any kind, and no music, no sound effects, no ambient noise - the video must be completely silent with no audio at all. Characters may still open their mouths, laugh, gossip, shout and show every facial expression and gesture visually so that the spoken lines are clearly expressed, but with no sound whatsoever.';
  const prompt=n=>`Video khung NGANG 16:9 (widescreen).\nKhung hình ngang 16:9, cảnh số ${n}, người dẫn chuyện đứng bên bàn chỉ vào bản đồ.\n${AUDIO}`;
  const base={kind:'story',storyId:'Truyen-A',image:'/refs/nv.png',references:['/refs/nv.png'],error:'',output:''};
  const seed=[
    {...base,id:'pending-ref',prompt:prompt(1),status:'pending',order:1},
    {...base,id:'failed-ref',prompt:prompt(2),status:'failed',order:2,error:'Muse báo lỗi'},
    {...base,id:'done-ref',prompt:prompt(3),status:'completed',order:3,output:'/o/3.mp4'},
    {...base,id:'no-ref',prompt:prompt(4),status:'pending',order:4,image:'',references:[]},
    {...base,id:'ad-ref',prompt:prompt(5),status:'pending',order:5,storyMode:'ad'},
    {...base,id:'tip-clip',prompt:prompt(6),status:'pending',order:6,phase:'clip',dependsOn:'image'},
    {...base,id:'other-story',prompt:prompt(7),status:'pending',order:7,storyId:'Truyen-B'}
  ];
  await fs.writeFile(path.join(dir,'studio.json'),JSON.stringify({settings:{output:dir},configVersion:2,jobs:seed}));
  try{
    const app=await boot(dir);
    const before=Object.fromEntries(app.invoke('state').jobs.map(j=>[j.id,j.prompt]));
    const result=await app.invoke('storyRelock',{storyId:'Truyen-A',form:''});
    const after=Object.fromEntries(result.jobs.map(j=>[j.id,j]));
    const locked=id=>/^KHÓA HÌNH DẠNG NHÂN VẬT \(bắt buộc\):/m.test(after[id].prompt);
    assert.equal(locked('pending-ref'),true,'cảnh chờ có ảnh được gắn khóa');
    assert.equal(locked('failed-ref'),true,'cảnh lỗi có ảnh được gắn khóa');
    assert.match(after['failed-ref'].error,/Đã sửa prompt/,'cảnh lỗi báo cần gửi lại prompt');
    assert.equal(after['failed-ref'].status,'failed');
    for(const id of ['done-ref','no-ref','ad-ref','tip-clip','other-story'])assert.equal(after[id].prompt,before[id],id+' giữ nguyên');
    assert.equal(JSON.stringify(result.relocked),JSON.stringify({changed:2,skipped:1,total:4}));
    assert.ok(after['pending-ref'].prompt.includes(AUDIO)&&after['pending-ref'].prompt.startsWith('Video khung NGANG 16:9 (widescreen).'),'phần còn lại của prompt giữ nguyên');
    assert.equal(after['pending-ref'].prompt.split('\n').filter(l=>/^KHÓA/.test(l)).length,1);
    const again=await app.invoke('storyRelock',{storyId:'Truyen-A',form:''});
    assert.equal(again.relocked.changed,0,'chạy lại không đổi gì');
    await assert.rejects(()=>app.invoke('storyRelock',{storyId:''}),/Chọn truyện/);
    // add() nhớ cảnh quảng cáo để lần sau không gắn nhầm
    const added=await app.invoke('add',[{kind:'story',storyId:'Truyen-C',storyMode:'ad',prompt:prompt(8),image:'/refs/sp.png'},{kind:'story',storyId:'Truyen-C',prompt:prompt(9),image:'/refs/nv.png'}]);
    const ads=added.jobs.filter(j=>j.storyId==='Truyen-C');
    assert.equal(JSON.stringify(ads.map(j=>j.storyMode||'')),JSON.stringify(['ad','']));
    const adResult=await app.invoke('storyRelock',{storyId:'Truyen-C',form:''});
    assert.equal(adResult.relocked.total,1,'cảnh quảng cáo không nằm trong phạm vi');
    await app.stop();
  }finally{await fs.rm(dir,{recursive:true,force:true});}
});

test('storyRelock với kiểu hình 2D + includeDone: cảnh xong đổi prompt (video giữ nguyên, prompt đã khóa đổi theo) để «Tạo lại» gửi prompt mới',{timeout:8000},async()=>{
  const dir=await fs.mkdtemp(path.join(os.tmpdir(),'muse-restyle-'));
  const AUDIO='Audio: no speech, no dialogue, no singing, no narration, no mumbling, no murmuring, no whispering, no humming, no laughing out loud, no human voice or vocal sound of any kind, and no music, no sound effects, no ambient noise - the video must be completely silent with no audio at all.';
  const prompt=n=>`Video khung NGANG 16:9 (widescreen).\nKhung hình ngang 16:9, cảnh số ${n}, người dẫn chuyện đứng bên bàn chỉ vào bản đồ.\n${AUDIO}`;
  const base={kind:'story',storyId:'Truyen-A',image:'/refs/nv.png',references:['/refs/nv.png'],error:''};
  const lockedOf=p=>({prompt:p,promptHash:'h',references:[{path:'/x.png',sha256:'s',name:'nv.png'}],lockedAt:'2026-01-01T00:00:00.000Z'});
  const seed=[
    {...base,id:'done',prompt:prompt(1),status:'completed',order:1,output:'/o/1.mp4',lockedInput:lockedOf(prompt(1))},
    {...base,id:'pend',prompt:prompt(2),status:'pending',order:2,output:''}
  ];
  await fs.writeFile(path.join(dir,'studio.json'),JSON.stringify({settings:{output:dir},configVersion:2,jobs:seed}));
  try{
    const app=await boot(dir);
    const plain=await app.invoke('storyRelock',{storyId:'Truyen-A',form:'',refLook:'flat2d'});
    const plainJobs=Object.fromEntries(plain.jobs.map(j=>[j.id,j]));
    assert.equal(plainJobs.done.prompt,prompt(1),'không includeDone: cảnh xong giữ nguyên');
    assert.match(plainJobs.pend.prompt,/^KIỂU HÌNH \(bắt buộc/m,'cảnh chờ nhận câu kiểu hình');
    const result=await app.invoke('storyRelock',{storyId:'Truyen-A',form:'',refLook:'flat2d',includeDone:true});
    const after=Object.fromEntries(result.jobs.map(j=>[j.id,j]));
    assert.equal(after.done.status,'completed');assert.equal(after.done.output,'/o/1.mp4','video đã có giữ nguyên');
    assert.match(after.done.prompt,/^KIỂU HÌNH \(bắt buộc/m);assert.match(after.done.prompt,/^KHÓA HÌNH DẠNG NHÂN VẬT[^\n]*hoạt hình 2D phẳng/m);
    assert.equal(after.done.lockedInput.prompt,after.done.prompt,'prompt đã khóa đổi theo, «Tạo lại» gửi bản mới');
    assert.equal(after.done.lockedInput.references.length,1,'ảnh tham chiếu đã khóa giữ nguyên');
    assert.equal(JSON.stringify(result.relocked),JSON.stringify({changed:1,skipped:0,total:2}));
    const again=await app.invoke('storyRelock',{storyId:'Truyen-A',form:'',refLook:'flat2d',includeDone:true});
    assert.equal(again.relocked.changed,0,'chạy lại không đổi gì');
    await app.stop();
  }finally{await fs.rm(dir,{recursive:true,force:true});}
});

test('xóa cảnh / truyện kể chuyện khỏi danh sách thì file trong KeChuyen vào Thùng rác; cảnh khác tab và file ngoài KeChuyen không bị đụng',{timeout:8000},async()=>{
  const dir=await fs.mkdtemp(path.join(os.tmpdir(),'muse-trash-'));
  const root=path.join(dir,'KeChuyen'),A=path.join(root,'Truyen-A'),B=path.join(root,'Truyen-B'),D=path.join(root,'Truyen-D');
  for(const folder of [A,B,D])await fs.mkdir(folder,{recursive:true});
  await fs.writeFile(path.join(dir,'ngoai.mp4'),'x');
  for(const file of [path.join(A,'001.mp4'),path.join(A,'002.mp4'),path.join(B,'001.mp4'),path.join(D,'002.mp4')])await fs.writeFile(file,'clip');
  const job=(id,kind,storyId,output,order)=>({id,kind,storyId,status:'completed',stage:'completed',prompt:'p '+id,output,order,references:[],image:''});
  const seed=[
    job('a1','story','Truyen-A',path.join(A,'001.mp4'),1),job('a2','story','Truyen-A',path.join(A,'002.mp4'),2),
    job('b1','story','Truyen-B',path.join(B,'001.mp4'),3),
    job('d1','story','Truyen-D',path.join(dir,'ngoai.mp4'),4),job('d2','story','Truyen-D',path.join(D,'002.mp4'),5),
    job('v1','video','',path.join(dir,'ngoai.mp4'),6)
  ];
  await fs.writeFile(path.join(dir,'studio.json'),JSON.stringify({settings:{output:dir},configVersion:2,jobs:seed}));
  try{
    const app=await boot(dir);
    await app.invoke('remove','a1');
    assert.equal(JSON.stringify(app.trashed),JSON.stringify([path.join(A,'001.mp4')]),'cảnh không phải cuối: chỉ clip của cảnh vào Thùng rác');
    await app.invoke('remove','a2');
    assert.equal(JSON.stringify(app.trashed.slice(1)),JSON.stringify([A]),'cảnh cuối: cả thư mục truyện vào Thùng rác (không lẻ từng file)');
    const before=app.trashed.length;
    await app.invoke('remove','d1');
    assert.equal(app.trashed.length,before,'file nằm ngoài KeChuyen không bao giờ bị đụng');
    await app.invoke('remove','v1');
    assert.equal(app.trashed.length,before,'cảnh của tab khác không bị xóa file');
    const cleared=await app.invoke('clearList',{kind:'story'});
    assert.equal(JSON.stringify(app.trashed.slice(before).sort()),JSON.stringify([B,D].sort()),'xóa danh sách kể chuyện: thư mục các truyện còn lại vào Thùng rác');
    assert.equal(cleared.jobs.filter(j=>j.kind==='story').length,0);
    assert.equal(await fs.readFile(path.join(dir,'ngoai.mp4'),'utf8'),'x','file ngoài KeChuyen còn nguyên');
    await app.stop();
  }finally{await fs.rm(dir,{recursive:true,force:true});}
});

test('«xóa luôn file đã tự lưu» ở MỌI tab: chỉ khi deleteFiles:true, chỉ file trong thư mục lưu, vào Thùng rác; video thêm tay và file ngoài thư mục không bị đụng',{timeout:8000},async()=>{
  const dir=await fs.mkdtemp(path.join(os.tmpdir(),'muse-trash-all-'));
  const outside=await fs.mkdtemp(path.join(os.tmpdir(),'muse-outside-'));
  const R=path.join(dir,'DonNha','R1'),W=path.join(dir,'DongVat','W1'),S=path.join(dir,'KeChuyen','S1'),Img=path.join(dir,'Anh');
  for(const folder of [R,W,S,Img])await fs.mkdir(folder,{recursive:true});
  const files={v1:path.join(dir,'v1.mp4'),v2:path.join(dir,'v2.mp4'),v3:path.join(dir,'v3.mp4'),v4:path.join(dir,'v4.mp4'),v5:path.join(dir,'v5.mp4'),manual:path.join(dir,'tay.mp4'),
    i1:path.join(Img,'i1.png'),i2:path.join(Img,'i2.png'),r1:path.join(R,'001.mp4'),r2:path.join(R,'002.mp4'),w1:path.join(W,'001.mp4'),s1:path.join(S,'001.mp4'),out:path.join(outside,'ngoai.mp4')};
  for(const f of Object.values(files))await fs.writeFile(f,'x');
  const job=(id,kind,storyId,output,order,extra={})=>({id,kind,storyId,status:'completed',stage:'completed',prompt:'p '+id,output,order,references:[],image:'',...extra});
  const seed=[
    job('v1','video','',files.v1,1),job('v2','video','',files.v2,2),job('v3','video','',files.v3,3),job('v4','video','',files.v4,4),job('v5','video','',files.v5,5,{previousOutputs:[files.v5.replace('v5','v5-cu')]}),
    job('m1','video','',files.manual,6,{manual:true,outputs:[files.manual]}),job('o1','video','',files.out,7),
    job('i1','image','',files.i1,8),job('i2','image','',files.i2,9),
    job('r1','restore','R1',files.r1,10,{phase:'clip',number:1}),job('r2','restore','R1',files.r2,11,{phase:'clip',number:2}),
    job('w1','wild','W1',files.w1,12,{phase:'clip',number:1}),
    job('s1','story','S1',files.s1,13)
  ];
  await fs.writeFile(path.join(dir,'studio.json'),JSON.stringify({settings:{output:dir},configVersion:2,jobs:seed}));
  try{
    const app=await boot(dir);
    await app.invoke('remove','v1');
    await app.invoke('remove',{id:'v2',deleteFiles:false});
    assert.equal(app.trashed.length,0,'xóa kiểu cũ (chỉ id) hoặc deleteFiles:false: không đụng tới file');
    const r=await app.invoke('remove',{id:'v3',deleteFiles:true});
    assert.deepEqual(app.trashed,[files.v3],'tab Video: deleteFiles:true chuyển file của tác vụ vào Thùng rác');
    assert.equal(r.removed.trashed,1);assert.equal(r.jobs.some(j=>j.id==='v3'),false);
    await app.invoke('remove',{id:'m1',deleteFiles:true});
    await app.invoke('remove',{id:'o1',deleteFiles:true});
    assert.deepEqual(app.trashed,[files.v3],'video người dùng tự thêm và file nằm ngoài thư mục lưu không bao giờ bị đụng');
    await app.invoke('remove',{id:'r1',deleteFiles:true});
    assert.deepEqual(app.trashed.slice(1),[files.r1],'tab Dọn nhà: xóa một cảnh kèm file chỉ chuyển clip của cảnh đó');
    await app.invoke('remove',{id:'v5',deleteFiles:true});
    assert.deepEqual(app.trashed.slice(2),[files.v5],'file đã bị xóa từ trước (previousOutputs không còn trên đĩa) thì bỏ qua, không lỗi');
    const base=app.trashed.length;
    const imgs=await app.invoke('clearList',{kind:'image',deleteFiles:true});
    assert.deepEqual(app.trashed.slice(base).sort(),[files.i1,files.i2].sort(),'xóa danh sách Ảnh + deleteFiles: ảnh đã lưu vào Thùng rác');
    assert.equal(imgs.jobs.some(j=>j.kind==='image'),false);assert.equal(imgs.jobs.some(j=>j.id==='v4'),true,'tab khác giữ nguyên');
    const b2=app.trashed.length;
    await app.invoke('clearList',{kind:'restore',deleteFiles:true});
    assert.deepEqual(app.trashed.slice(b2),[R],'xóa danh sách Dọn nhà + deleteFiles: cả thư mục DonNha/<video> vào Thùng rác');
    const b3=app.trashed.length;
    await app.invoke('clearList',{kind:'wild',deleteFiles:false});
    assert.equal(app.trashed.length,b3,'deleteFiles:false thì giữ thư mục');
    await app.invoke('clearList',{kind:'story',deleteFiles:false});
    assert.equal(app.trashed.length,b3,'Kể chuyện cũng giữ file khi bỏ tick');
    const b4=app.trashed.length;
    await app.invoke('clearList',{kind:'video',deleteFiles:true});
    assert.deepEqual(app.trashed.slice(b4),[files.v4],'xóa danh sách Video + deleteFiles: chỉ file còn lại của tab Video');
    for(const keep of [files.v1,files.v2,files.manual,files.out,files.w1,files.s1])assert.equal(await fs.readFile(keep,'utf8'),'x');
    await app.stop();
  }finally{await fs.rm(dir,{recursive:true,force:true});await fs.rm(outside,{recursive:true,force:true});}
});

test('«Truyện đã tạo»: storyRemove bỏ cả truyện, chỉ chuyển KeChuyen/<truyện> vào Thùng rác khi deleteFiles:true; truyện không có thì báo lỗi; bản ghi mà file video đã mất được dọn',{timeout:8000},async()=>{
  const dir=await fs.mkdtemp(path.join(os.tmpdir(),'muse-story-runs-'));
  const root=path.join(dir,'KeChuyen'),A=path.join(root,'Truyen-A'),B=path.join(root,'Truyen-B'),C=path.join(root,'Truyen-C');
  for(const folder of [A,B,C])await fs.mkdir(folder,{recursive:true});
  const finalB=path.join(B,'video-b.mp4');
  for(const file of [path.join(A,'001.mp4'),path.join(A,'002.mp4'),path.join(B,'001.mp4'),finalB,path.join(C,'001.mp4')])await fs.writeFile(file,'x');
  const job=(id,storyId,output,order,status='completed')=>({id,kind:'story',storyId,status,stage:status,prompt:'p '+id,output,order,references:[],image:''});
  const seed=[job('a1','Truyen-A',path.join(A,'001.mp4'),1),job('a2','Truyen-A',path.join(A,'002.mp4'),2),job('c1','Truyen-C',path.join(C,'001.mp4'),3,'pending')];
  // Truyện B đã xuất MP4 và hàng đợi đã dọn: chỉ còn bản ghi
  await fs.writeFile(path.join(dir,'studio.json'),JSON.stringify({settings:{output:dir,storyRuns:{'Truyen-B':{output:finalB,srt:'',name:'B',builtAt:1},'Truyen-X':{output:path.join(dir,'khong-con.mp4'),srt:'',name:'X',builtAt:2}}},configVersion:2,jobs:seed}));
  try{
    const app=await boot(dir);
    await new Promise(r=>setTimeout(r,60));
    const first=app.invoke('state');
    assert.deepEqual(Object.keys(first.settings.storyRuns),['Truyen-B'],'bản ghi mà file video đã mất thì được dọn khi mở app');
    await assert.rejects(()=>app.invoke('storyRemove',{storyId:'Khong-co',deleteFiles:true}),/Không thấy|not found/);
    assert.equal(app.trashed.length,0);
    const kept=await app.invoke('storyRemove',{storyId:'Truyen-A',deleteFiles:false});
    assert.equal(app.trashed.length,0,'bỏ tick: chỉ bỏ khỏi danh sách, file còn nguyên');
    assert.equal(kept.jobs.some(j=>j.storyId==='Truyen-A'),false);
    assert.equal(await fs.readFile(path.join(A,'001.mp4'),'utf8'),'x');
    const gone=await app.invoke('storyRemove',{storyId:'Truyen-B',deleteFiles:true});
    assert.deepEqual(app.trashed,[B],'tick: cả thư mục KeChuyen/<truyện> vào Thùng rác');
    assert.equal(gone.removed.trashed,1);assert.equal(gone.settings.storyRuns['Truyen-B'],undefined,'bản ghi video bị bỏ');
    assert.equal(gone.jobs.some(j=>j.storyId==='Truyen-C'),true,'truyện khác không bị đụng');
    await app.stop();
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

test('Muse hỏi «gửi lại clip hay tạo mới»: tool tự trả lời (không bấm thì clip không bao giờ về), rồi tải đúng clip',{timeout:30000},async()=>{
 const dir=await fs.mkdtemp(path.join(os.tmpdir(),'muse-choice-card-'));let app,sent=0,answers=0,answered=false;const picks=[];
 try{
  await fs.writeFile(path.join(dir,'studio.json'),JSON.stringify({configVersion:2,settings:{output:dir,accountCount:1,cooldownSeconds:0}}));
  app=await boot(dir,{browserResolver:()=>'/test/chrome',externalLauncher:async()=>({external:true,isDestroyed:()=>false,isSessionEnabled:()=>true,url:()=> 'https://muse.ai/',openMuse:async()=>{},show:async()=>{},close:async()=>{},evaluate:async(fn,arg)=>{
   if(fn.name==='submitPrompt'){sent++;return{clicked:true};}
   if(fn.name==='answerChoice'){answers++;picks.push(arg.pick);if(answers===1)return{answered:false,reason:'chưa thấy nút'};answered=true;return{answered:true,pick:arg.pick};}
   if(fn.name==='pollTracking')return answered?{phase:'ready',ready:true,echoMatched:true,responseMatched:true,progress:null}:{phase:'waiting-response',ready:false,echoMatched:true,responseMatched:false,progress:null,choice:{answered:false}};
   if(fn.name==='downloadAction')return{action:'clicked',clicked:true};return null;
  },captureDownload:async(target,{trigger})=>{await trigger();await fs.writeFile(target,fixtureMp4());}})});
  await app.invoke('settings',{...app.invoke('state').settings,browserChoice:'chrome',finishAction:'keep'});await app.invoke('browser',0);await app.invoke('add',[{prompt:'Scene already made once'}]);await app.invoke('start');
  await until(()=>!app.invoke('state').active,20000);
  assert.equal(sent,1,'chỉ gửi prompt một lần, không gửi đi gửi lại');
  assert.deepEqual(picks,['resend','resend'],'lần đầu bấm chưa được thì thử lại; cảnh chưa từng tạo thì chọn «gửi lại clip vừa tạo»');
  assert.equal(app.invoke('state').jobs[0].status,'completed');
  assert.ok(app.updates.some(rows=>rows.some(j=>/bấm một lựa chọn/.test(j.stageMessage||''))),'khi chưa bấm được thì cảnh nói rõ Muse đang hỏi và cần bấm tay');
  assert.ok(app.updates.some(rows=>rows.some(j=>/Gửi lại clip vừa tạo/.test(j.stageMessage||''))),'báo tool đã chọn gì');
  await app.stop();
 }finally{if(app&&!app.lifecycle.includes('quit'))await app.stop();await fs.rm(dir,{recursive:true,force:true});}
});

test('Muse từ chối prompt đã làm («vẫn như cũ»): tool gửi lại bản có dòng biến thể ngay trong chat, rồi tải đúng clip',{timeout:40000},async()=>{
 const dir=await fs.mkdtemp(path.join(os.tmpdir(),'muse-repeat-refusal-'));let app,last='';const prompts=[];
 try{
  await fs.writeFile(path.join(dir,'studio.json'),JSON.stringify({configVersion:2,settings:{output:dir,accountCount:1,cooldownSeconds:0}}));
  app=await boot(dir,{browserResolver:()=>'/test/chrome',externalLauncher:async()=>({external:true,isDestroyed:()=>false,isSessionEnabled:()=>true,url:()=> 'https://muse.ai/',openMuse:async()=>{},show:async()=>{},close:async()=>{},evaluate:async(fn,arg)=>{
   if(fn.name==='beginTracking'){last=arg.prompt;prompts.push(arg.prompt);return{};}
   if(fn.name==='submitPrompt')return{clicked:true};
   if(fn.name==='pollTracking')return /VARIATION 2:/.test(last)?{phase:'ready',ready:true,echoMatched:true,responseMatched:true,progress:null}:{phase:'waiting-response',ready:false,echoMatched:true,responseMatched:false,progress:null,refused:'repeat',reply:'Prompt này vẫn như cũ nên mình chưa tạo được.'};
   if(fn.name==='downloadAction')return{action:'clicked',clicked:true};return null;
  },captureDownload:async(target,{trigger})=>{await trigger();await fs.writeFile(target,fixtureMp4());}})});
  await app.invoke('settings',{...app.invoke('state').settings,browserChoice:'chrome',finishAction:'keep'});await app.invoke('browser',0);await app.invoke('add',[{prompt:'Line one of the scene\nLine two of the scene'}]);await app.invoke('start');
  await until(()=>!app.invoke('state').active,35000);
  assert.equal(prompts.length,3,'bản gốc + hai bản biến thể');
  assert.equal(prompts[0],'Line one of the scene\nLine two of the scene');
  assert.match(prompts[1],/^Line one of the scene\nLine two of the scene\nVARIATION 1: /);
  assert.match(prompts[2],/^Line one of the scene\nLine two of the scene\nVARIATION 2: /);assert.equal(prompts[2].match(/VARIATION/g).length,1,'dòng biến thể cũ được thay, không chồng lên nhau');
  assert.equal(app.invoke('state').jobs[0].status,'completed');
  assert.ok(app.updates.some(rows=>rows.some(j=>/giống lần gửi trước/.test(j.stageMessage||'')&&/biến thể/.test(j.stageMessage||''))),'cảnh nói rõ vì sao gửi lại');
  assert.ok(app.updates.some(rows=>rows.some(j=>/Muse vừa nói: «Prompt này vẫn như cũ nên mình chưa tạo được\.»/.test(j.stageMessage||''))),'thẻ cảnh hiện nguyên văn câu Muse vừa nói');
  await app.stop();
 }finally{if(app&&!app.lifecycle.includes('quit'))await app.stop();await fs.rm(dir,{recursive:true,force:true});}
});

test('Muse vẫn từ chối sau hai bản biến thể: cảnh báo lỗi rõ ràng, không chờ mãi, prompt giữ bản biến thể mới để thử lại',{timeout:50000},async()=>{
 const dir=await fs.mkdtemp(path.join(os.tmpdir(),'muse-repeat-refusal-fail-'));let app,sent=0;
 try{
  await fs.writeFile(path.join(dir,'studio.json'),JSON.stringify({configVersion:2,settings:{output:dir,accountCount:1,cooldownSeconds:0}}));
  app=await boot(dir,{browserResolver:()=>'/test/chrome',externalLauncher:async()=>({external:true,isDestroyed:()=>false,isSessionEnabled:()=>true,url:()=> 'https://muse.ai/',openMuse:async()=>{},show:async()=>{},close:async()=>{},evaluate:async(fn,arg)=>{
   if(fn.name==='submitPrompt'){sent++;return{clicked:true};}
   if(fn.name==='pollTracking')return{phase:'waiting-response',ready:false,echoMatched:true,responseMatched:false,progress:null,refused:'repeat'};
   return null;
  }})});
  await app.invoke('settings',{...app.invoke('state').settings,browserChoice:'chrome',finishAction:'keep'});await app.invoke('browser',0);await app.invoke('add',[{prompt:'Scene that Muse keeps refusing'}]);await app.invoke('start');
  await until(()=>!app.invoke('state').active,45000);
  const job=app.invoke('state').jobs[0];
  assert.equal(sent,3,'ba lần gửi rồi dừng, không gửi vô hạn');assert.equal(job.status,'failed');assert.match(job.error,/giống lần gửi trước/);assert.match(job.error,/Thử lại/);
  assert.match(job.prompt,/VARIATION 3: /);assert.equal(job.prompt.match(/VARIATION/g).length,1);
  await app.stop();
 }finally{if(app&&!app.lifecycle.includes('quit'))await app.stop();await fs.rm(dir,{recursive:true,force:true});}
});

test('Muse không làm được clip từ khung hình này: cảnh báo lỗi (kiểu bị chặn nội dung) thay vì chờ mãi, không gửi lại y nguyên prompt bị từ chối',{timeout:30000},async()=>{
 const dir=await fs.mkdtemp(path.join(os.tmpdir(),'muse-frame-refusal-'));let app,last='';const prompts=[];
 try{
  await fs.writeFile(path.join(dir,'studio.json'),JSON.stringify({configVersion:2,settings:{output:dir,accountCount:1,cooldownSeconds:0}}));
  app=await boot(dir,{browserResolver:()=>'/test/chrome',externalLauncher:async()=>({external:true,isDestroyed:()=>false,isSessionEnabled:()=>true,url:()=> 'https://muse.ai/',openMuse:async()=>{},show:async()=>{},close:async()=>{},evaluate:async(fn,arg)=>{
   if(fn.name==='beginTracking'){last=arg.prompt;prompts.push(arg.prompt);return{};}
   if(fn.name==='submitPrompt')return{clicked:true};
   if(fn.name==='pollTracking')return /Refused frame/.test(last)?{phase:'waiting-response',ready:false,echoMatched:true,responseMatched:false,progress:null,refused:'blocked'}:{phase:'ready',ready:true,echoMatched:true,responseMatched:true,progress:null};
   if(fn.name==='downloadAction')return{action:'clicked',clicked:true};return null;
  },captureDownload:async(target,{trigger})=>{await trigger();await fs.writeFile(target,fixtureMp4());}})});
  await app.invoke('settings',{...app.invoke('state').settings,browserChoice:'chrome',finishAction:'keep'});await app.invoke('browser',0);await app.invoke('add',[{prompt:'Refused frame scene'},{prompt:'Normal scene'}]);await app.invoke('start');
  await until(()=>!app.invoke('state').active,25000);
  const jobs=app.invoke('state').jobs;
  assert.equal(prompts.filter(p=>/Refused frame/.test(p)).length,1,'không gửi lại y nguyên prompt bị từ chối');
  assert.equal(jobs[0].status,'failed');assert.match(jobs[0].error,/từ chối làm clip từ khung hình này/);assert.match(jobs[0].error,/khung hình đầu tiên khác/);
  await app.stop();
 }finally{if(app&&!app.lifecycle.includes('quit'))await app.stop();await fs.rm(dir,{recursive:true,force:true});}
});

test('Continue resends an uncertain original attempt; transfer retries do not send it again',{timeout:30000},async()=>{
 const dir=await fs.mkdtemp(path.join(os.tmpdir(),'muse-retry-transfer-'));let app,recovering=false,sent=0,downloads=0;const attempts=[];
 try{
  await fs.writeFile(path.join(dir,'studio.json'),JSON.stringify({configVersion:2,settings:{output:dir,accountCount:1,cooldownSeconds:0}}));
  app=await boot(dir,{browserResolver:()=>'/test/chrome',externalLauncher:async()=>({external:true,isDestroyed:()=>false,isSessionEnabled:()=>true,url:()=> 'https://muse.ai/',openMuse:async()=>{},show:async()=>{},close:async()=>{},evaluate:async(fn,arg)=>{
   if(fn.name==='beginTracking'){attempts.push(arg);if(arg.recover)recovering=true;return{};}
   if(fn.name==='submitPrompt'){sent++;return{clicked:true};}
   if(fn.name==='browserStop')return{state:'unavailable',clicked:false};
   if(fn.name==='pollTracking')return sent>=2?{phase:'ready',ready:true,echoMatched:true,responseMatched:true,progress:null}:new Promise(()=>{});
   if(fn.name==='downloadAction')return{action:'clicked',clicked:true};return null;
  },captureDownload:async(target,{trigger})=>{await trigger();downloads++;if(downloads===1)throw Error('Server transfer is not ready yet');await fs.writeFile(target,fixtureMp4());}})});
  await app.invoke('settings',{...app.invoke('state').settings,browserChoice:'chrome',finishAction:'keep'});await app.invoke('browser',0);await app.invoke('add',[{prompt:'Original pending result'},{prompt:'Later scene'}]);await app.invoke('start');await until(()=>sent===1);
  await app.invoke('stop');assert.equal(app.invoke('state').jobs[0].remoteStop.state,'unavailable');await app.invoke('start');await until(()=>downloads===1);
  assert.equal(sent,2);assert.equal(app.invoke('state').jobs[0].status,'running');assert.equal(app.invoke('state').jobs[1].status,'pending');assert.equal(attempts[1].recover,false);assert.notEqual(attempts[1].id,attempts[0].id);
  await until(()=>!app.invoke('state').active,10000);assert.equal(sent,3);assert.equal(downloads,3);assert.ok(app.invoke('state').jobs.every(j=>j.status==='completed'));await app.stop();
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

for(const persisted of ['tentative-send','stale-receipt','pending-recovery'])test(`Continue sends a NEW attempt for ${persisted}; false Send cannot poll or download`,{timeout:8000},async()=>{
 const dir=await fs.mkdtemp(path.join(os.tmpdir(),'muse-continue-new-'));let app,clicked=false,sends=0,polls=0,downloads=0,draft='';const attempts=[];
 const prompt='Keep the original scene prompt',oldAttempt='obsolete-attempt';
 try{
  const lockedInput={prompt,promptHash:crypto.createHash('sha256').update(prompt).digest('hex'),references:[]};
  const job={id:'unfinished',prompt,lockedInput,status:persisted==='pending-recovery'?'pending':'interrupted',resumeMode:'recover',account:1,mayHaveSubmitted:true,submissionProtocol:1,trackerId:oldAttempt,echoKey:'old-user',echoMarker:oldAttempt,resultReadyAt:'2026-01-01T00:00:00Z'};
  if(persisted==='stale-receipt')job.submissionReceipt={version:1,attemptId:oldAttempt,promptHash:lockedInput.promptHash,referenceHashes:[],echoKey:'old-user'};
  await fs.writeFile(path.join(dir,'studio.json'),JSON.stringify({configVersion:2,dispatchRevision:1,settings:{output:dir,browserChoice:'chrome',accountCount:1,cooldownSeconds:0},jobs:[job,{id:'completed',prompt:'Keep saved scene',status:'completed',output:'existing.mp4'}]}));
  app=await boot(dir,{browserResolver:()=>'/test/chrome',externalLauncher:async()=>({external:true,isDestroyed:()=>false,isSessionEnabled:()=>true,url:()=> 'https://muse.ai/',openMuse:async()=>{},show:async()=>{},close:async()=>{},evaluate:async(fn,arg)=>{
   if(fn.name==='browserStop')return{state:'unavailable',clicked:false};
   if(fn.name==='beginTracking'){assert.equal(arg.recover,false);assert.notEqual(arg.id,oldAttempt);attempts.push(arg.id);return{};}
   if(fn.name==='submitPrompt'){assert.equal(draft,prompt);sends++;return{clicked};}
   if(fn.name==='pollTracking'){polls++;assert.equal(clicked,true);return{ready:true,echoMatched:true,responseMatched:true,echoKey:'new-user'};}
   if(fn.name==='downloadAction')return{clicked:true};
   if(arg?.prompt&&!arg?.id)draft=arg.prompt;
   return null;
  },captureDownload:async(target,{trigger})=>{downloads++;await trigger();await fs.writeFile(target,fixtureMp4());}})});
  await app.invoke('start');await until(()=>!app.invoke('state').active);
  assert.equal(sends,1);assert.equal(polls,0);assert.equal(downloads,0);assert.equal(app.invoke('state').jobs[0].status,'failed');assert.equal(app.invoke('state').jobs[0].mayHaveSubmitted,false);
  clicked=true;await app.invoke('start');await until(()=>!app.invoke('state').active);
  assert.equal(sends,2);assert.equal(downloads,1);assert.notEqual(attempts[0],attempts[1]);assert.equal(app.invoke('state').jobs[0].status,'completed');assert.equal(app.invoke('state').jobs[1].output,'existing.mp4');await app.stop();
 }finally{if(app&&!app.lifecycle.includes('quit'))await app.stop();await fs.rm(dir,{recursive:true,force:true});}
});

test('Regenerate IPC submits only the selected completed scene and saves a new file without replacing its old video',{timeout:8000},async()=>{
 const dir=await fs.mkdtemp(path.join(os.tmpdir(),'muse-regenerate-'));let app,uploads=0;const sent=[],slots=[];
 const old=path.join(dir,'001.mp4');await fs.writeFile(old,fixtureMp4());
 try{
  await fs.writeFile(path.join(dir,'studio.json'),JSON.stringify({configVersion:2,dispatchRevision:1,settings:{output:dir,browserChoice:'chrome',accountCount:2,cooldownSeconds:0},jobs:[{id:'done',number:1,prompt:'Selected original scene',status:'completed',account:2,output:old},{id:'keep',number:2,prompt:'Other completed',status:'completed',output:'keep.mp4'},{id:'pending',number:3,prompt:'Do not send',status:'pending'}]}));
  app=await boot(dir,{browserResolver:()=>'/test/chrome',externalLauncher:async({profileDir})=>{slots.push(path.basename(profileDir));let draft='';return{external:true,isDestroyed:()=>false,isSessionEnabled:()=>true,url:()=> 'https://muse.ai/',openMuse:async()=>{},show:async()=>{},close:async()=>{},evaluate:async(fn,arg)=>{
   if(fn.name==='browserStop')return{state:'confirmed'};
   if(fn.name==='beginTracking'){assert.equal(arg.recover,false);return{};}
   if(fn.name==='submitPrompt'){sent.push(draft);return{clicked:true};}
   if(fn.name==='pollTracking')return{ready:true,echoMatched:true,responseMatched:true};
   if(fn.name==='downloadAction')return{clicked:true};if(arg?.prompt&&!arg?.id)draft=arg.prompt;return null;
  },captureDownload:async(target,{trigger})=>{await trigger();await fs.writeFile(target,fixtureMp4());}};}});
  await app.invoke('regenerate','done');await until(()=>!app.invoke('state').active);
  assert.deepEqual(sent,['Selected original scene']);assert.deepEqual(slots,['account-2']);
  const jobs=app.invoke('state').jobs;assert.equal(jobs[0].output,path.join(dir,'001 (2).mp4'));assert.equal(jobs[0].previousOutput,old);assert.deepEqual(await fs.readFile(old),fixtureMp4());assert.deepEqual(await fs.readFile(jobs[0].output),fixtureMp4());
  assert.equal(jobs[1].output,'keep.mp4');assert.equal(jobs[1].status,'completed');assert.equal(jobs[2].status,'pending');await app.stop();
 }finally{if(app&&!app.lifecycle.includes('quit'))await app.stop();await fs.rm(dir,{recursive:true,force:true});}
});

test('Regenerate IPC with a chosen account runs the scene on that account (TK 1 instead of its old TK 2) and rejects accounts outside the running browsers',{timeout:8000},async()=>{
 const dir=await fs.mkdtemp(path.join(os.tmpdir(),'muse-regenerate-acct-'));let app,uploads=0;const sent=[],slots=[];
 const old=path.join(dir,'001.mp4');await fs.writeFile(old,fixtureMp4());
 try{
  await fs.writeFile(path.join(dir,'studio.json'),JSON.stringify({configVersion:2,dispatchRevision:1,settings:{output:dir,browserChoice:'chrome',accountCount:2,cooldownSeconds:0},jobs:[{id:'done',number:1,prompt:'Selected original scene',status:'completed',account:2,output:old},{id:'keep',number:2,prompt:'Other completed',status:'completed',output:'keep.mp4'},{id:'pending',number:3,prompt:'Do not send',status:'pending'}]}));
  app=await boot(dir,{browserResolver:()=>'/test/chrome',externalLauncher:async({profileDir})=>{slots.push(path.basename(profileDir));let draft='';return{external:true,isDestroyed:()=>false,isSessionEnabled:()=>true,url:()=> 'https://muse.ai/',openMuse:async()=>{},show:async()=>{},close:async()=>{},evaluate:async(fn,arg)=>{
   if(fn.name==='browserStop')return{state:'confirmed'};
   if(fn.name==='beginTracking'){assert.equal(arg.recover,false);return{};}
   if(fn.name==='submitPrompt'){sent.push(draft);return{clicked:true};}
   if(fn.name==='pollTracking')return{ready:true,echoMatched:true,responseMatched:true};
   if(fn.name==='downloadAction')return{clicked:true};if(arg?.prompt&&!arg?.id)draft=arg.prompt;return null;
  },captureDownload:async(target,{trigger})=>{await trigger();await fs.writeFile(target,fixtureMp4());}};}});
  await assert.rejects(async()=>app.invoke('regenerate',{id:'done',account:3}),/Chọn tài khoản từ 1 đến 2/);
  assert.equal(app.invoke('state').jobs[0].account,2,'bị từ chối thì không đổi TK của cảnh');
  await app.invoke('regenerate',{id:'done',account:1});await until(()=>!app.invoke('state').active);
  assert.deepEqual(sent,['Selected original scene']);assert.deepEqual(slots,['account-1']);assert.equal(app.invoke('state').jobs[0].account,1);
  const jobs=app.invoke('state').jobs;assert.equal(jobs[0].output,path.join(dir,'001 (2).mp4'));assert.equal(jobs[0].previousOutput,old);assert.deepEqual(await fs.readFile(old),fixtureMp4());assert.deepEqual(await fs.readFile(jobs[0].output),fixtureMp4());
  assert.equal(jobs[1].output,'keep.mp4');assert.equal(jobs[1].status,'completed');assert.equal(jobs[2].status,'pending');await app.stop();
 }finally{if(app&&!app.lifecycle.includes('quit'))await app.stop();await fs.rm(dir,{recursive:true,force:true});}
});

test('image tab saves the replied pictures through the right-click Tải xuống menu under Anh by scene number, waits for Muse to stop generating, and leaves video scenes alone',{timeout:12000},async()=>{
  const dir=await fs.mkdtemp(path.join(os.tmpdir(),'muse-image-run-'));
  const picture=seed=>Buffer.concat([Buffer.from([0x89,0x50,0x4e,0x47,0x0d,0x0a,0x1a,0x0a]),Buffer.alloc(3000,seed)]);
  const dataUrl=seed=>'data:image/png;base64,'+picture(seed).toString('base64');
  let app,generating=false,downloads=0,reads=[],menuIndex=-1;const sent=[],trackers=[],menuCalls=[];
  try{
    await fs.writeFile(path.join(dir,'studio.json'),JSON.stringify({configVersion:2,settings:{output:dir,accountCount:1,cooldownSeconds:0}}));
    app=await boot(dir,{browserResolver:()=>'/test/chrome',externalLauncher:async()=>{
      let closed=false,draft='';return{external:true,isDestroyed:()=>closed,isSessionEnabled:()=>true,url:()=> 'https://muse.ai/',show:async()=>{},openMuse:async()=>{},
      evaluate:async(fn,arg)=>{
        if(fn.name==='submitPrompt'){sent.push(draft);generating=sent.length===1;return{clicked:true};}
        if(fn.name==='beginTracking'){trackers.push({...arg});return{phase:'waiting-prompt'};}
        if(fn.name==='pollTracking')return{phase:'ready',ready:true,echoMatched:true,responseMatched:true,progress:null,count:sent.length===1?2:1};
        if(fn.name==='browserStop')return{state:generating?'generating':'idle'};
        if(fn.name==='downloadAction'){menuCalls.push([arg.phase,arg.index]);menuIndex=arg.index;return{clicked:true,needsMenu:false};}
        if(fn.name==='readTrackedImage'){reads.push(arg.index);return{count:sent.length===1?2:1,url:'https://muse.ai/'+arg.index+'.png',dataUrl:dataUrl(arg.index+(sent.length===1?1:9)),via:'fetch'};}
        if(arg?.prompt && !arg?.id)draft=arg.prompt;return null;
      },pressEnter:async()=>{sent.push(draft);},
      captureDownload:async(target,{trigger})=>{downloads++;await trigger();await fs.writeFile(target,picture(menuIndex+(sent.length===1?1:9)));},
      close:async()=>{closed=true;}};
    }});
    await app.invoke('settings',{...app.invoke('state').settings,browserChoice:'chrome',finishAction:'keep'});await app.invoke('browser',0);
    await app.invoke('add',[{prompt:'Video scene stays pending.',number:1}]);
    await app.invoke('add',[{kind:'image',prompt:'Picture one: a blue cat.',number:1},{kind:'image',prompt:'Picture two: a red dog.',number:2}]);
    assert.deepEqual([...app.invoke('state').jobs.map(j=>j.kind)],['video','image','image']);
    await app.invoke('start',{kind:'image'});
    await until(()=>sent.length===1).catch(e=>{throw Error(e.message+' '+JSON.stringify(app.invoke('state').jobs.map(j=>[j.kind,j.status,j.stage,j.stageMessage,j.error])))});await new Promise(r=>setTimeout(r,250));
    assert.deepEqual(reads,[],'chưa lưu ảnh khi Muse còn đang tạo');assert.equal(app.invoke('state').jobs[1].status,'running');
    generating=false;await until(()=>!app.invoke('state').active);
    const result=app.invoke('state');
    assert.deepEqual(sent,['Picture one: a blue cat.','Picture two: a red dog.']);
    assert.deepEqual([...result.jobs.map(j=>j.status)],['pending','completed','completed']);
    assert.equal(downloads,3);assert.deepEqual(reads,[],'ảnh lưu bằng menu Tải xuống, không đọc thẻ ảnh');assert.deepEqual(menuCalls,[['context',0],['context',1],['context',0]],'chuột phải thẳng vào ảnh, không dùng nút … của video');assert.equal(trackers.length,2);
    assert.ok(trackers.every(t=>t.mediaKind==='image'&&t.imageSelector==='img'));
    assert.deepEqual((await fs.readdir(path.join(dir,'Anh'))).sort(),['001_1.png','001_2.png','002.png']);
    assert.equal(path.basename(result.jobs[1].output),'001_1.png');assert.deepEqual([...result.jobs[1].outputs.map(f=>path.basename(f))],['001_1.png','001_2.png']);
    assert.deepEqual(await fs.readFile(result.jobs[1].outputs[1]),picture(2));assert.deepEqual(await fs.readFile(result.jobs[2].output),picture(9));
    assert.equal(result.jobs[1].stageMessage,'Đã lưu ảnh về máy');
    assert.equal((await fs.readdir(dir)).some(f=>/\.(mp4|webm|part)$/.test(f)),false,'không có file video/tạm ở thư mục video');
    assert.equal((await fs.readdir(path.join(dir,'Anh'))).some(f=>f.endsWith('.part')),false);
    await app.stop();
  }finally{if(app&&!app.lifecycle.includes('quit'))await app.stop();await fs.rm(dir,{recursive:true,force:true});}
});
test('image save falls back to the picture shown in the chat when the right-click menu cannot be used or gives a file that is not a picture',{timeout:15000},async()=>{
  const dir=await fs.mkdtemp(path.join(os.tmpdir(),'muse-image-fallback-'));
  const picture=seed=>Buffer.concat([Buffer.from([0x89,0x50,0x4e,0x47,0x0d,0x0a,0x1a,0x0a]),Buffer.alloc(3000,seed)]);
  let app,mode='no-menu',reads=0;const sent=[];
  try{
    await fs.writeFile(path.join(dir,'studio.json'),JSON.stringify({configVersion:2,settings:{output:dir,accountCount:1,cooldownSeconds:0}}));
    app=await boot(dir,{browserResolver:()=>'/test/chrome',externalLauncher:async()=>{
      let closed=false,draft='';return{external:true,isDestroyed:()=>closed,isSessionEnabled:()=>true,url:()=> 'https://muse.ai/',show:async()=>{},openMuse:async()=>{},
      evaluate:async(fn,arg)=>{
        if(fn.name==='submitPrompt'){sent.push(draft);return{clicked:true};}
        if(fn.name==='beginTracking')return{phase:'waiting-prompt'};
        if(fn.name==='pollTracking')return{phase:'ready',ready:true,echoMatched:true,responseMatched:true,progress:null,count:1};
        if(fn.name==='browserStop')return{state:'idle'};
        if(fn.name==='downloadAction')return mode==='no-menu'?(arg.phase==='inspect'||arg.phase==='reset'?{near:[]}:{failed:true,note:'chưa thấy menu'}):{clicked:true,needsMenu:false};
        if(fn.name==='readTrackedImage'){reads++;return{count:1,url:'https://muse.ai/shown.png',dataUrl:'data:image/png;base64,'+picture(5).toString('base64'),via:'fetch'};}
        if(arg?.prompt && !arg?.id)draft=arg.prompt;return null;
      },pressEnter:async()=>{sent.push(draft);},
      captureDownload:async(target,{trigger})=>{await trigger();await fs.writeFile(target,Buffer.from('<html>Tải xuống mở ra trang web'+' '.repeat(3000)));},
      close:async()=>{closed=true;}};
    }});
    await app.invoke('settings',{...app.invoke('state').settings,browserChoice:'chrome',finishAction:'keep'});await app.invoke('browser',0);
    await app.invoke('add',[{kind:'image',prompt:'Picture without a usable menu.',number:1}]);await app.invoke('start',{kind:'image'});
    await until(()=>!app.invoke('state').active,12000);
    let jobs=app.invoke('state').jobs;assert.equal(jobs[0].status,'completed');assert.equal(reads,1,'menu không dùng được → đọc ảnh đang hiện');
    assert.deepEqual(await fs.readFile(jobs[0].output),picture(5));
    mode='html-download';
    await app.invoke('add',[{kind:'image',prompt:'Picture whose download is a web page.',number:2}]);await app.invoke('start',{kind:'image'});
    await until(()=>!app.invoke('state').active,12000);
    jobs=app.invoke('state').jobs;assert.equal(jobs[1].status,'completed');assert.equal(reads,2,'tệp tải xuống không phải ảnh → không lưu, đọc ảnh đang hiện');
    assert.deepEqual((await fs.readdir(path.join(dir,'Anh'))).sort(),['001.png','002.png']);
    assert.equal((await fs.readdir(path.join(dir,'Anh'))).some(f=>f.endsWith('.part')),false);
    assert.equal(sent.length,2,'không gửi lại prompt khi chỉ lưu ảnh');
    await app.stop();
  }finally{if(app&&!app.lifecycle.includes('quit'))await app.stop();await fs.rm(dir,{recursive:true,force:true});}
});
test('image result that cannot be read is retried, never saved as a broken file',{timeout:12000},async()=>{
  const dir=await fs.mkdtemp(path.join(os.tmpdir(),'muse-image-bad-'));
  let app,attempts=0;const sent=[];
  try{
    await fs.writeFile(path.join(dir,'studio.json'),JSON.stringify({configVersion:2,settings:{output:dir,accountCount:1,cooldownSeconds:0}}));
    app=await boot(dir,{browserResolver:()=>'/test/chrome',externalLauncher:async()=>{
      let closed=false,draft='';return{external:true,isDestroyed:()=>closed,isSessionEnabled:()=>true,url:()=> 'https://muse.ai/',show:async()=>{},openMuse:async()=>{},
      evaluate:async(fn,arg)=>{
        if(fn.name==='submitPrompt'){sent.push(draft);return{clicked:true};}
        if(fn.name==='beginTracking')return{phase:'waiting-prompt'};
        if(fn.name==='pollTracking')return{phase:'ready',ready:true,echoMatched:true,responseMatched:true,progress:null,count:1};
        if(fn.name==='readTrackedImage'){attempts++;return attempts===1?{count:1,url:'https://muse.ai/expired.png',dataUrl:'data:text/html;base64,'+Buffer.from('<html>expired link'+' '.repeat(2000)).toString('base64'),via:'fetch'}:{count:1,url:'https://muse.ai/ok.png',failed:true,errors:['HTTP 403']};}
        if(arg?.prompt && !arg?.id)draft=arg.prompt;return null;
      },pressEnter:async()=>{sent.push(draft);},close:async()=>{closed=true;}};
    }});
    await app.invoke('settings',{...app.invoke('state').settings,browserChoice:'chrome',finishAction:'keep'});await app.invoke('browser',0);
    await app.invoke('add',[{kind:'image',prompt:'Picture that cannot be read.',number:1}]);await app.invoke('start',{kind:'image'});
    await until(()=>attempts>=2,9000);
    const job=app.invoke('state').jobs[0];assert.equal(job.status,'running');assert.match(job.stageMessage,/Chưa lưu được ảnh/);assert.equal(sent.length,1,'không gửi lại prompt');
    assert.deepEqual(await fs.readdir(path.join(dir,'Anh')).catch(()=>[]),[]);
    await app.invoke('stop');
  }finally{if(app&&!app.lifecycle.includes('quit'))await app.stop();await fs.rm(dir,{recursive:true,force:true});}
});

test('story tab runs only its own scenes, saves clips under KeChuyen/<truyện> by scene number, and never touches the video tab or its merge',{timeout:12000},async()=>{
  const dir=await fs.mkdtemp(path.join(os.tmpdir(),'muse-story-run-'));
  let app;const sent=[],trackers=[];
  try{
    await fs.writeFile(path.join(dir,'studio.json'),JSON.stringify({configVersion:2,settings:{output:dir,accountCount:1,cooldownSeconds:0}}));
    app=await boot(dir,{browserResolver:()=>'/test/chrome',externalLauncher:async()=>{
      let closed=false,draft='';return{external:true,isDestroyed:()=>closed,isSessionEnabled:()=>true,url:()=> 'https://muse.ai/',show:async()=>{},openMuse:async()=>{},
      evaluate:async(fn,arg)=>{
        if(fn.name==='submitPrompt'){sent.push(draft);return{clicked:true};}
        if(fn.name==='beginTracking'){trackers.push({...arg});return{phase:'waiting-prompt'};}
        if(fn.name==='pollTracking')return{phase:'ready',ready:true,echoMatched:true,responseMatched:true,progress:null};
        if(fn.name==='downloadAction')return{action:'clicked',clicked:true,needsMenu:false};
        if(arg?.prompt && !arg?.id)draft=arg.prompt;return null;
      },pressEnter:async()=>{sent.push(draft);},
      captureDownload:async(target,{trigger,onProgress})=>{await trigger();await fs.writeFile(target,fixtureMp4());onProgress({receivedBytes:80,totalBytes:80});},
      close:async()=>{closed=true;}};
    }});
    await app.invoke('settings',{...app.invoke('state').settings,browserChoice:'chrome',finishAction:'merge'});await app.invoke('browser',0);
    await app.invoke('add',[{prompt:'Video tab scene stays pending.',number:1}]);
    await app.invoke('add',[{kind:'story',storyId:'Truyen-01',prompt:'Story scene one.',voiceover:'Lời cảnh một.'},{kind:'story',storyId:'Truyen-01',prompt:'Story scene two.',voiceover:'Lời cảnh hai.'}]);
    assert.deepEqual([...app.invoke('state').jobs.map(j=>j.kind)],['video','story','story']);
    await app.invoke('start',{kind:'story'});await until(()=>!app.invoke('state').active&&app.invoke('state').jobs[2].status==='completed');
    const result=app.invoke('state');
    assert.deepEqual(sent,['Story scene one.','Story scene two.']);
    assert.deepEqual([...result.jobs.map(j=>j.status)],['pending','completed','completed']);
    assert.ok(trackers.every(t=>t.mediaKind==='video'));
    assert.deepEqual((await fs.readdir(path.join(dir,'KeChuyen','Truyen-01'))).sort(),['001.mp4','002.mp4']);
    assert.equal(path.basename(path.dirname(result.jobs[1].output)),'Truyen-01');
    assert.equal(result.jobs[1].voiceover,'Lời cảnh một.');
    assert.equal((await fs.readdir(dir)).some(f=>/\.(mp4|webm|part)$/.test(f)),false,'không có clip hay file tạm ở thư mục video');
    assert.equal(result.mergedOutput,'','không tự nối: tab Kể chuyện không dùng chức năng nối của tab video');
    assert.ok(result.story&&result.story.voice&&Array.isArray(result.story.voice.clones));
    await app.invoke('clearList',{kind:'story'});assert.deepEqual([...app.invoke('state').jobs.map(j=>j.kind)],['video']);
    await app.stop();
  }finally{if(app&&!app.lifecycle.includes('quit'))await app.stop();await fs.rm(dir,{recursive:true,force:true});}
});

test('Mẹo vặt: ảnh từng bước lưu vào KeChuyen/<truyện>/anh trước, rồi clip được gửi kèm đúng ảnh của bước đó; ghép MP4 chỉ tính clip',{timeout:25000},async()=>{
  const dir=await fs.mkdtemp(path.join(os.tmpdir(),'muse-tip-run-'));
  const picture=seed=>Buffer.concat([Buffer.from([0x89,0x50,0x4e,0x47,0x0d,0x0a,0x1a,0x0a]),Buffer.alloc(3000,seed)]);
  let app;const sent=[],trackers=[],uploads=[];
  try{
    await fs.writeFile(path.join(dir,'studio.json'),JSON.stringify({configVersion:2,settings:{output:dir,accountCount:1,cooldownSeconds:0}}));
    app=await boot(dir,{browserResolver:()=>'/test/chrome',externalLauncher:async()=>{
      let closed=false,draft='';return{external:true,isDestroyed:()=>closed,isSessionEnabled:()=>true,url:()=> 'https://muse.ai/',show:async()=>{},openMuse:async()=>{},
      evaluate:async(fn,arg)=>{
        if(fn.name==='submitPrompt'){sent.push(draft);return{clicked:true};}
        if(fn.name==='beginTracking'){trackers.push({...arg});return{phase:'waiting-prompt'};}
        if(fn.name==='pollTracking')return{phase:'ready',ready:true,echoMatched:true,responseMatched:true,progress:null,count:1};
        if(fn.name==='browserStop')return{state:'idle'};
        if(fn.name==='readTrackedImage')return{count:1,url:'https://muse.ai/'+sent.length+'.png',dataUrl:'data:image/png;base64,'+picture(sent.length).toString('base64'),via:'fetch'};
        if(fn.name==='imageSources')return[];
        if(fn.name==='composerAttachmentSnapshot')return{count:0,tokens:[]};
        if(fn.name==='attachmentState')return{ready:true,tokens:['tok-'+sent.length]};
        if(fn.name==='downloadAction')return{action:'clicked',clicked:true,needsMenu:false};
        if(arg?.prompt && !arg?.id)draft=arg.prompt;return null;
      },pressEnter:async()=>{sent.push(draft);},
      upload:async(selector,files)=>{uploads.push(await Promise.all(files.map(f=>fs.readFile(f))));},
      captureDownload:async(target,{trigger,onProgress})=>{await trigger();await fs.writeFile(target,fixtureMp4());onProgress({receivedBytes:80,totalBytes:80});},
      close:async()=>{closed=true;}};
    }});
    await app.invoke('settings',{...app.invoke('state').settings,browserChoice:'chrome',finishAction:'keep'});await app.invoke('browser',0);
    const id='Truyen-tip';
    await app.invoke('add',[
      {kind:'story',storyId:id,phase:'image',number:1,title:'Cảnh 1 · ảnh',prompt:'Ảnh bước 1',source:'Đập nhẹ tỏi.'},
      {kind:'story',storyId:id,phase:'image',number:2,title:'Cảnh 2 · ảnh',prompt:'Ảnh bước 2',source:'Lắc hộp.'},
      {kind:'story',storyId:id,phase:'clip',dependsOn:'image',number:1,title:'Cảnh 1 · clip',prompt:'Clip bước 1',voiceover:'Đập nhẹ tỏi.',durationSeconds:4},
      {kind:'story',storyId:id,phase:'clip',dependsOn:'image',number:2,title:'Cảnh 2 · clip',prompt:'Clip bước 2',voiceover:'Lắc hộp.',durationSeconds:4}]);
    await app.invoke('start',{kind:'story'});
    await until(()=>!app.invoke('state').active&&app.invoke('state').jobs.length===4&&app.invoke('state').jobs.every(j=>j.status==='completed'),20000).catch(e=>{throw Error(e.message+' '+JSON.stringify(app.invoke('state').jobs.map(j=>[j.phase,j.number,j.status,j.stage,j.stageMessage,j.error])))});
    const result=app.invoke('state');
    assert.deepEqual(sent,['Ảnh bước 1','Ảnh bước 2','Clip bước 1','Clip bước 2'],'ảnh trước, clip sau, đúng thứ tự bước');
    assert.deepEqual(trackers.map(t=>t.mediaKind),['image','image','video','video']);
    assert.deepEqual((await fs.readdir(path.join(dir,'KeChuyen',id,'anh'))).sort(),['001.png','002.png']);
    assert.deepEqual((await fs.readdir(path.join(dir,'KeChuyen',id))).sort(),['001.mp4','002.mp4','anh']);
    assert.equal((await fs.readdir(path.join(dir,'Anh')).catch(()=>[])).length,0,'ảnh mẹo vặt không lẫn vào thư mục của tab Tạo ảnh');
    assert.equal(uploads.length,2,'chỉ clip mới đính kèm ảnh');
    assert.deepEqual(uploads[0][0],picture(1),'clip 1 gửi kèm ảnh bước 1');assert.deepEqual(uploads[1][0],picture(2),'clip 2 gửi kèm ảnh bước 2');
    assert.equal(result.jobs[2].references[0],result.jobs[0].output);assert.equal(result.jobs[3].references[0],result.jobs[1].output);
    assert.equal(result.jobs[0].stageMessage,'Đã lưu ảnh về máy');assert.equal(result.jobs[2].stageMessage,'Đã tải và lưu video về máy');
    assert.equal((await fs.readdir(dir)).some(f=>/\.(mp4|webm|part|png)$/.test(f)),false,'không có file lạc ở thư mục video');
    await app.stop();
  }finally{if(app&&!app.lifecycle.includes('quit'))await app.stop();await fs.rm(dir,{recursive:true,force:true});}
});

test('story writer handler passes the tip fields through (tip mode asks for a title, not a product name)',{timeout:12000},async()=>{
  const dir=await fs.mkdtemp(path.join(os.tmpdir(),'muse-tip-write-'));
  let app;
  try{
    await fs.writeFile(path.join(dir,'studio.json'),JSON.stringify({configVersion:2,settings:{output:dir,accountCount:1,cooldownSeconds:0}}));
    app=await boot(dir,{browserResolver:()=>'/test/chrome'});
    // Chế độ Mẹo vặt: thiếu tiêu đề báo ngay (trước khi mở Muse). Không có cờ tip thì vẫn là chế độ quảng cáo.
    await assert.rejects(app.invoke('storyAdWrite',{tip:true,tipTitle:'   ',tipMinutes:2,tipLanguage:'vi',seconds:8,aspect:'16:9'}),/Nhập tiêu đề mẹo/);
    await assert.rejects(app.invoke('storyAdWrite',{tipTitle:'Mẹo khử mùi tủ lạnh',seconds:8,aspect:'16:9'}),/Nhập tên sản phẩm/);
    assert.equal(app.invoke('state').story.analyze?.busy||false,false,'không treo trạng thái bận');
    await app.stop();
  }finally{if(app&&!app.lifecycle.includes('quit'))await app.stop();await fs.rm(dir,{recursive:true,force:true});}
});

// ---- Tab «Động vật hoang dã»: Muse (giả) viết kịch bản → việc vào hàng đợi riêng → dựng phim thật bằng FFmpeg.
const wildFfmpeg = require('node:child_process').spawnSync('ffmpeg', ['-version']).status === 0 && require('node:child_process').spawnSync('ffprobe', ['-version']).status === 0;
const wildPlanModule = require('../src/wild-plan.js');
test('tab Động vật hoang dã: chỉ gói Năm / Vĩnh viễn; thiếu tên hoặc thư mục thì không làm gì', async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'muse-wild-guard-'));
  let app;
  try {
    await fs.writeFile(path.join(dir, 'studio.json'), JSON.stringify({ configVersion: 2, settings: { output: dir, accountCount: 1 } }));
    app = await boot(dir);
    await assert.rejects(app.invoke('wildMake', { topic: 'Cầy mangut' }), /gói Năm|Vĩnh viễn/i);
    assert.deepEqual(Object.keys(app.invoke('state').wild || {}).includes('stories'), true);
    assert.equal(Object.keys((await app.invoke('state')).wild.stories).length, 0, 'không lưu gì khi bị khóa');
    await app.stop();
  } finally { if (app && !app.lifecycle.includes('quit')) await app.stop(); await fs.rm(dir, { recursive: true, force: true }); }
});

test('tab Động vật hoang dã: viết kịch bản → 130 cảnh + ảnh vào hàng đợi riêng, thư mục DongVat → dựng phim và ghi chú', { skip: !wildFfmpeg && 'cần ffmpeg + ffprobe', timeout: 180000 }, async () => {
  const { fakeMuse } = require('./fixtures/wild-fake-muse.cjs');
  const { createWildWriter } = require('../src/wild-write.cjs');
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'muse-wild-run-'));
  let app;
  try {
    await fs.writeFile(path.join(dir, 'studio.json'), JSON.stringify({ configVersion: 2, settings: { output: dir, accountCount: 1, cooldownSeconds: 0 } }));
    const fake = fakeMuse();
    app = await boot(dir, { longTerm: true, wildWriterFactory: options => createWildWriter({ ...options, ask: fake.ask, delay: async () => {} }) });
    await assert.rejects(app.invoke('wildMake', { topic: '   ' }), /Nhập tên con vật/);
    await assert.rejects(app.invoke('wildMake', { topic: 'Cầy mangut', voice: { engine: 'edge', voice: '' } }), /Chọn giọng thuyết minh/);
    await assert.rejects(app.invoke('wildMake', { topic: 'Cầy mangut', voice: { engine: 'edge', voice: 'vi-VN-HoaiMyNeural' } }), /Chưa cài giọng Microsoft/);
    assert.equal(fake.log.bible, 0, 'lỗi đầu vào thì chưa gửi gì cho Muse');

    const made = await app.invoke('wildMake', { topic: 'Cầy mangut', signature: 'điệu múa tán tỉnh; xây tổ', minutes: 20, lang: 'vi', aspect: '16:9', voice: { engine: 'none' } });
    assert.equal(made.storyId, 'DV-Cay-mangut');
    await assert.rejects(app.invoke('wildMake', { topic: 'Sư tử', voice: { engine: 'none' } }), /Đang làm phim|Hàng đợi đang chạy/);
    await until(() => app.invoke('state').wild.stories['DV-Cay-mangut']?.status === 'queued', 20000);
    await until(() => { const s = app.invoke('state'); return !s.starting && !s.active; }, 90000);   // viết xong thì tự chạy hàng đợi (ở đây không có Muse thật nên dừng ngay); chờ hết hẳn để việc tự dựng phim sau hàng đợi không đụng nút «Dựng phim» của test
    await new Promise(r => setTimeout(r, 150));
    const state = await app.invoke('state');
    const mine = state.jobs.filter(j => j.kind === 'wild');
    assert.equal(state.jobs.length, mine.length, 'không có việc của tab khác');
    const clips = mine.filter(j => j.phase === 'clip'), images = mine.filter(j => j.phase === 'image');
    assert.equal(clips.length, 130);
    assert.ok(images.length >= 3 + 1 + 1, 'ảnh nhân vật, ảnh mốc, ảnh bìa');
    assert.ok(mine.every(j => j.storyId === 'DV-Cay-mangut' && j.status !== undefined));
    assert.equal(clips[1].needs[0].number, 1, 'cảnh nối tiếp chờ cảnh trước');
    assert.equal(state.wild.stories['DV-Cay-mangut'].name, 'Cầy mangut');
    assert.equal(state.wild.stories['DV-Cay-mangut'].sceneCount, 130);
    const draft = JSON.parse(await fs.readFile(path.join(dir, 'DongVat', 'DV-Cay-mangut', 'kich-ban.json'), 'utf8'));
    assert.equal(draft.final, true);
    assert.equal(draft.scenes.length, 130);
    assert.equal(fake.log.bible, 1);
    // Khoảnh khắc người dùng muốn có đi vào lời nhắc lập hồ sơ (dưới dạng dữ liệu); các lượt viết chương nhắc khoảnh khắc đặc sắc của chương.
    assert.ok(fake.log.instructions[0].includes('KHOẢNH KHẮC NGƯỜI LÀM PHIM MUỐN CÓ') && fake.log.instructions[0].includes('điệu múa tán tỉnh; xây tổ'));
    assert.ok(fake.log.instructions.some(t => t.includes('KHOẢNH KHẮC ĐẶC SẮC CỦA CHƯƠNG NÀY (bắt buộc kể trọn)')), 'lượt viết chương có khoảnh khắc đặc sắc');

    // Clip làm tay: mỗi cảnh một file 1 giây rồi báo đã xong; dựng phim thật.
    const folder = path.join(dir, 'DongVat', 'DV-Cay-mangut');
    await fs.mkdir(folder, { recursive: true });
    const sample = path.join(dir, 'mau.mp4');
    await require('../src/merge.cjs').command('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-y', '-f', 'lavfi', '-i', 'testsrc=size=320x180:rate=30:duration=1', '-pix_fmt', 'yuv420p', sample], 60000);
    for (const job of clips) { const file = path.join(folder, String(job.number).padStart(3, '0') + '.mp4'); await fs.copyFile(sample, file); Object.assign(job, { status: 'completed', output: file }); }
    for (const job of images) Object.assign(job, { status: 'completed', output: sample });
    const built = await app.invoke('wildBuild', { storyId: 'DV-Cay-mangut' });
    assert.ok(built);
    await until(() => app.invoke('state').wild.stories['DV-Cay-mangut']?.status === 'built', 150000);
    const done = (await app.invoke('state')).wild;
    assert.equal(done.error, '');
    const out = done.stories['DV-Cay-mangut'].output;
    assert.ok(out.startsWith(folder), 'video nằm trong thư mục DongVat của phim');
    const probe = require('node:child_process').spawnSync('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', out]);
    assert.ok(Math.abs(Number(String(probe.stdout).trim()) - 130) < 3, 'phim dài đúng tổng 130 clip × 1 giây');
    const notes = await fs.readFile(path.join(folder, 'ghi-chu-dang-video.txt'), 'utf8');
    assert.match(notes, /SỰ THẬT MÀ PHIM DÙNG/);
    assert.match(notes, /nội dung bị thay đổi hoặc tổng hợp/);
    // tab Kể chuyện không bị đụng tới
    await assert.rejects(fs.access(path.join(dir, 'KeChuyen')));
    await app.stop();
  } finally { if (app && !app.lifecycle.includes('quit')) await app.stop(); await fs.rm(dir, { recursive: true, force: true }); }
});

// ---- Tab «So sánh song song»
const pairPlanModule = require('../src/pair-plan.js');
const pngPixel = (() => {
  const zlib = require('node:zlib');
  const chunk = (type, data) => { const body = Buffer.concat([Buffer.from(type), data]), out = Buffer.alloc(12 + data.length); out.writeUInt32BE(data.length, 0); body.copy(out, 4); out.writeUInt32BE(zlib.crc32(body) >>> 0, 8 + data.length); return out; };
  const header = Buffer.alloc(13); header.writeUInt32BE(1, 0); header.writeUInt32BE(1, 4); header.set([8, 6, 0, 0, 0], 8);
  return 'data:image/png;base64,' + Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), chunk('IHDR', header), chunk('IDAT', zlib.deflateSync(Buffer.from([0, 255, 80, 40, 128]))), chunk('IEND', Buffer.alloc(0))]).toString('base64');
})();
const jpegPixel = 'data:image/jpeg;base64,/9j/4AAQSkZJRgABAgAAAQABAAD//gAQTGF2YzYwLjMxLjEwMgD/2wBDAAgKCgsKCw0NDQ0NDRAPEBAQEBAQEBAQEBASEhIVFRUSEhIQEBISFBQVFRcXFxUVFRUXFxkZGR4eHBwjIyQrKzP/xACZAAACAwEBAAAAAAAAAAAAAAAHBgUAAQQCAQAABwEBAAAAAAAAAAAAAAAABQYHBAgDAgEQAAECBAQEAgsBAAAAAAAAAAECEQUEAwAhEsIGEzFDg2FRQnMjoXFjMjSyUjNBEQACAQIEAgcFBQkBAAAAAAABAgMEERIAIQUTBkSDQ4LBwyJhMVFBFHEHMjNSI7K0FjR1gWRzNf/AABEIABIAIAMBEgACEgADEgD/2gAMAwEAAhEDEQA/AB5s6TTOzVZC/oSELWHIJAzBgw/0kPywdi9uGyoFNStSYmFrolK6QACVLzYKfF0Ae++FpVq6mJG/Cod2F7EgYRYfaSL+7S+uSb+YqOhqAZI6g+hk9CodSVPzkGnpOZE++y8v7LuFRBpUSyU1PAxUOsbuJmLsGYD0xo5XRhjw4lK3zhzPsVUdselxwY/qoJ74nw4YoqhCL8O97yrbS1gdcq0cJJoE4/002yRLb05NLppRUlwUZnzKWObcmpnyuwe2osasiKEVQiqqgBVABAAA0AA9wGUNtPOu2VDMqw1gLYbXSL2/Cc5U/NcaRJQRxqqIiyqqqAqqoEQCqBoABoANBlG8yc37dVvCqRVYMPExYkiAOLBa1pj+k3vbJUjfQ7mm1uP7glKdSkgorukqBZKGxb5nhdZ9v7Tu+OXK237vd3ZXYT0FjY/mT/K/+v7cp7m7ofX+XnKvkHMf030t48HEvxvT+PBa2DifA3zP7Inqk3QmkVCVLpGiMx9JKs+Vy+KgxctybmXtR2tGpaComlTCKyxX4OXhBJbJxHzZ1o/YMz2cwVb1MKrISzRkjF8VNrXN9Tobn7Pnmc+zVO1K7TPCwNvyyx91/wBSLlxN25dptk3GaekRYoK1UbgqdI5Yy/EwLhASIh0KqGNmxABVAGVxutJJvaUzU5VAnEvxSVPqwWtgD/DXIegSik1lJJBBpEEFiCMzEHzvzBOv29VklcSpiIJBBYgjQgi2oz5X9n3vDJfytHHNHXxyIsiOsSOjgMrqwlBVlNwQRoQdCM6co9M6jzMzsb6Hc03Y30O5pt/6DtO745FB2nd8clXN3Q+v8vI5u6H1/l5PMb6Hc03Y30O5pule39p3fHI2/tO745anm7ofX+Xkc3dD6/y89+1EhMkAAB7GXOAbEpUSfiTifG92r9mn1Mt+Bt82AWko7AD9kDppqVUk/wCTqc9Sf0tH/wAl/dXM+CSSXmDmNpHZyK50BYliFSWZEW5+SqAqj3BQANM50n/vcx/3Cb+IqM//2Q==';
const fakeHudFactory = log => () => ({
  thumb: async o => { log.push(['thumb', o.variant, o.title, o.leftImage.slice(0, 23), o.rightImage.slice(0, 23), o.leftScore, o.rightScore, o.lang]); return jpegPixel; },
  init: async o => { log.push(['init', o.layout, o.lang]); log.push(['title', o.title]); }, base: async () => pngPixel, tag: async () => pngPixel, caption: async () => pngPixel,
  meterSeq: async (side, from, to) => from === to ? [pngPixel] : Array.from({ length: 24 }, () => pngPixel), intro: async () => pngPixel, outro: async lessons => [pngPixel, ...lessons.map(() => pngPixel)], close: () => { log.push(['close']); }
});

test('tab So sánh song song: chỉ gói Năm / Vĩnh viễn; không lưu gì khi bị khóa', async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'muse-pair-guard-'));
  let app;
  try {
    await fs.writeFile(path.join(dir, 'studio.json'), JSON.stringify({ configVersion: 2, settings: { output: dir, accountCount: 1 } }));
    app = await boot(dir);
    await assert.rejects(app.invoke('pairMake', { topic: 'Sleep', minutes: 1 }), /gói Năm|Vĩnh viễn/i);
    assert.equal(Object.keys((await app.invoke('state')).pair.stories).length, 0);
    await app.stop();
  } finally { if (app && !app.lifecycle.includes('quit')) await app.stop(); await fs.rm(dir, { recursive: true, force: true }); }
});

test('tab So sánh song song: Muse tự chọn chủ đề → kịch bản → ảnh nền + 2 clip mỗi mốc vào hàng đợi riêng → dựng video, ghi chú, dọn danh sách', { skip: !wildFfmpeg && 'cần ffmpeg + ffprobe', timeout: 240000 }, async () => {
  const { fakeMuse } = require('./fixtures/pair-fake-muse.cjs');
  const { createPairWriter } = require('../src/pair-write.cjs');
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'muse-pair-run-'));
  let app;
  const hudLog = [];
  try {
    await fs.writeFile(path.join(dir, 'studio.json'), JSON.stringify({ configVersion: 2, settings: { output: dir, accountCount: 1, cooldownSeconds: 0 } }));
    let failing = true;
    const fake = fakeMuse({ total: 7, topic: 'Sleeping on time and staying up late', bad: n => failing && n === 3 ? 'short' : '' });
    // Giọng đọc giả: «đã cài» khi voiceReady = true; mỗi đoạn là một tiếng bíp 1,2 giây (đủ để kiểm tra phần trộn âm thanh bằng ffmpeg thật).
    let voiceReady = false;
    const voiceLog = [];
    const voiceServiceFactory = options => {
      const real = require('../src/story-voice.cjs').createVoiceService(options);
      return { ...real,
        status: () => ({ ...real.status(), ready: { ...real.status().ready, edge: voiceReady } }),
        synth: async ({ voice, items, dir, volume }) => {
          voiceLog.push({ voice, ids: items.map(i => i.id), volume });
          await fs.mkdir(dir, { recursive: true });
          const out = [];
          for (const item of items) {
            const file = path.join(dir, `${item.id}.wav`);
            const r = require('node:child_process').spawnSync('ffmpeg', ['-v', 'error', '-y', '-f', 'lavfi', '-i', 'sine=frequency=330:duration=1.2:sample_rate=24000', file]);
            assert.equal(r.status, 0, String(r.stderr));
            out.push({ id: item.id, file, seconds: 1.2 });
          }
          return out;
        } };
    };
    const bootOpts = { longTerm: true, voiceServiceFactory, domTimeoutMs: 300, pairWriterFactory: options => createPairWriter({ ...options, ask: fake.ask, delay: async () => {} }), pairHudFactory: fakeHudFactory(hudLog) };
    app = await boot(dir, bootOpts);
    await assert.rejects(app.invoke('pairMake', { topic: '', minutes: 1, voice: { voice: 'en-US-GuyNeural' } }), /Chưa cài giọng Microsoft/);
    assert.equal(fake.log.bible, 0, 'lỗi đầu vào thì chưa gửi gì cho Muse');
    await assert.rejects(app.invoke('pairMake', { topic: '', minutes: 1, voice: { voice: '' } }), /Chưa cài giọng Microsoft/, 'không chọn giọng cũng không được dựng video câm');
    await assert.rejects(app.invoke('pairMake', { topic: '', minutes: 1, music: path.join(dir, 'x.txt'), voice: { voice: '' } }), /Nhạc nền phải là/);
    assert.equal(Object.keys((await app.invoke('state')).pair.stories).length, 0, 'lỗi đầu vào thì không lưu video dở');

    voiceReady = true;
    // Lần 1: Muse viết sai mốc 3 → dừng đúng chỗ, giữ nháp, hỏi «Viết tiếp».
    const made = await app.invoke('pairMake', { topic: '', minutes: 1, lang: 'en', layout: 'side', voice: { voice: '' } });
    assert.equal(made.storyId, 'SS-phim');
    await until(() => { const p = app.invoke('state').pair; return !p.busy && p.error; }, 30000);
    let state = await app.invoke('state');
    assert.match(state.pair.error, /Viết tiếp/);
    assert.equal(state.pair.stories['SS-phim'].status, 'writing');
    assert.equal(state.jobs.filter(j => j.kind === 'pair').length, 0, 'chưa có việc khi kịch bản chưa đủ');
    let draft1;
    for (let i = 0; i < 50; i++) { draft1 = await fs.readFile(path.join(dir, 'SoSanh', 'SS-phim', 'kich-ban.json'), 'utf8').then(JSON.parse, () => null); if (draft1 && draft1.beats.length) break; await new Promise(r => setTimeout(r, 100)); }
    assert.ok(!draft1.final && draft1.beats.length >= 2, 'giữ các mốc đã viết');
    const askedBefore = fake.log.bible;

    // Lần 2: «Viết tiếp» không hỏi lại hồ sơ, đủ 7 mốc → 7 ảnh + 14 clip, tự chạy hàng đợi.
    failing = false;
    await app.invoke('pairMake', { resumeId: 'SS-phim' });
    await until(() => app.invoke('state').pair.stories['SS-phim']?.status === 'queued', 30000);
    assert.equal(fake.log.bible, askedBefore, 'không hỏi lại hồ sơ');
    await until(() => { const s = app.invoke('state'); return !s.starting && !s.active; }, 90000);
    await new Promise(r => setTimeout(r, 150));
    state = await app.invoke('state');
    const mine = state.jobs.filter(j => j.kind === 'pair');
    assert.equal(state.jobs.length, mine.length, 'không có việc của tab khác');
    const clips = mine.filter(j => j.phase === 'clip'), images = mine.filter(j => j.phase === 'image');
    assert.equal(images.length, 7);
    assert.equal(clips.length, 14);
    assert.ok(mine.every(j => j.storyId === 'SS-phim'));
    assert.equal(JSON.stringify(clips.slice(0, 2).map(j => j.number)), '[1,2]');
    assert.equal(JSON.stringify(clips[0].needs), JSON.stringify([{ phase: 'image', number: 1 }]), 'clip chờ ảnh nền của mốc');
    assert.equal(state.pair.stories['SS-phim'].name, 'Sleeping on time and staying up late');
    assert.equal(state.pair.stories['SS-phim'].beatCount, 7);
    const folder = path.join(dir, 'SoSanh', 'SS-phim');
    const draft = JSON.parse(await fs.readFile(path.join(folder, 'kich-ban.json'), 'utf8'));
    assert.equal(draft.final, true);
    assert.equal(draft.script.beats.length, 7);
    assert.match(fake.log.instructions[0], /TỰ CHỌN một chủ đề/);
    await assert.rejects(app.invoke('pairBuild', { storyId: 'SS-phim' }), /Chờ xử lý|clip đã xong/, 'chưa đủ clip thì chưa dựng');
    await assert.rejects(app.invoke('pairThumb', { storyId: 'SS-phim' }), /Chỉ tạo thumbnail khi mọi clip đã xong|Create the thumbnail once every clip is done/, 'chưa đủ clip thì chưa làm thumbnail');
    await assert.rejects(app.invoke('pairThumb', { storyId: 'khong-co' }), /Không thấy video này|This video was not found/);

    // Clip làm tay: mỗi clip một file 1 giây rồi báo đã xong; dựng video thật (chữ canvas giả).
    await fs.mkdir(folder, { recursive: true });
    const sample = path.join(dir, 'mau.mp4');
    await require('../src/merge.cjs').command('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-y', '-f', 'lavfi', '-i', 'testsrc=size=320x180:rate=30:duration=1', '-pix_fmt', 'yuv420p', sample], 60000);
    for (const job of clips) { const file = path.join(folder, String(job.number).padStart(3, '0') + '.mp4'); await fs.copyFile(sample, file); Object.assign(job, { status: 'completed', output: file }); }
    for (const job of images) Object.assign(job, { status: 'completed', output: sample });
    // Thumbnail 16:9: làm được ngay khi đủ clip (chưa cần dựng video); mỗi lần bấm một kiểu khác, vòng lại sau 4 kiểu.
    const jpegBytes = Buffer.from(jpegPixel.split(',')[1], 'base64');
    const t1 = await app.invoke('pairThumb', { storyId: 'SS-phim' });
    assert.deepEqual([t1.variant, t1.count], [1, 4]);
    assert.ok(t1.file.startsWith(folder) && /thumbnail-1\.jpg$/.test(t1.file), t1.file);
    assert.deepEqual(await fs.readFile(t1.file), jpegBytes);
    const t2 = await app.invoke('pairThumb', { storyId: 'SS-phim' });
    assert.deepEqual([t2.variant, t2.count], [2, 4]);
    assert.notEqual(t2.file, t1.file);
    const thumbCalls = hudLog.filter(x => x[0] === 'thumb');
    assert.deepEqual(thumbCalls.map(x => x[1]), [0, 1], 'kiểu 1 rồi kiểu 2');
    assert.ok(thumbCalls.every(x => x[3] === 'data:image/jpeg;base64,' && x[4] === 'data:image/jpeg;base64,' && x[7] === 'en'), 'khung hình thật lấy từ clip trái / phải');
    assert.equal(thumbCalls[1][5], draft.script.beats.at(-1).leftScore, 'kiểu «Điểm cuối» dùng điểm của mốc cuối');
    assert.ok(thumbCalls[0][2] && thumbCalls[0][2] === draft.script.title);
    const afterThumb = (await app.invoke('state')).pair;
    assert.equal(afterThumb.busy, false);
    assert.equal(afterThumb.stories['SS-phim'].thumb, t2.file);
    assert.ok(hudLog.filter(x => x[0] === 'close').length >= 2, 'đóng cửa sổ vẽ sau mỗi thumbnail');
    const savedThumb = await app.invoke('pairSave', { storyId: 'SS-phim', thumb: true });
    assert.ok(/\.jpg$/.test(savedThumb.file));
    assert.deepEqual(await fs.readFile(savedThumb.file), jpegBytes);
    assert.equal(await app.invoke('pairReveal', { storyId: 'SS-phim', thumb: true }), true);
    for (let i = 0; i < 2; i++) await app.invoke('pairThumb', { storyId: 'SS-phim' });
    assert.equal((await app.invoke('pairThumb', { storyId: 'SS-phim' })).variant, 1, 'xoay vòng sau 4 kiểu');
    assert.ok(await app.invoke('pairBuild', { storyId: 'SS-phim', voice: { voice: '' } }));
    await until(() => app.invoke('state').pair.stories['SS-phim']?.status === 'built', 180000);
    const done = (await app.invoke('state')).pair;
    assert.equal(done.error, '');
    const meta = done.stories['SS-phim'];
    assert.ok(meta.output.startsWith(folder), 'video nằm trong thư mục SoSanh của video');
    assert.ok((await fs.stat(meta.cover)).size > 500, 'có ảnh bìa');
    const probe = require('node:child_process').spawnSync('ffprobe', ['-v', 'error', '-show_entries', 'format=duration:stream=width,height', '-of', 'json', meta.output]);
    const info = JSON.parse(String(probe.stdout));
    assert.deepEqual([info.streams[0].width, info.streams[0].height], [1920, 1080]);
    const audioProbe = require('node:child_process').spawnSync('ffprobe', ['-v', 'error', '-select_streams', 'a', '-show_entries', 'stream=codec_name', '-of', 'csv=p=0', meta.output]);
    assert.match(String(audioProbe.stdout), /aac/, 'video có tiếng (giọng đọc + nhạc + hiệu ứng)');
    assert.ok(voiceLog.length >= 1 && voiceLog[0].voice === 'en-US-GuyNeural', 'không chọn giọng thì dùng giọng mặc định của ngôn ngữ video: ' + JSON.stringify(voiceLog[0]));
    assert.ok(voiceLog[0].ids.includes('intro') && voiceLog[0].ids.includes('b1'), 'đọc cả mở đầu lẫn từng mốc');
    const autoMusic = (await fs.readdir(folder)).filter(n => /^nhac-nen-tu-dong-(warm|calm|lofi)\.wav$/.test(n));
    assert.equal(autoMusic.length, 1, 'tự tạo đúng một bản nhạc nền miễn bản quyền cho video: ' + autoMusic);
    assert.ok(Math.abs(Number(info.format.duration) - meta.seconds) < 0.5);
    assert.ok(Math.abs(meta.seconds - (4.5 + 8 + 7 * 2)) < 1, 'mở đầu + 7 mốc (mỗi mốc ≥ 2 giây) + kết: ' + meta.seconds);
    assert.deepEqual(hudLog.filter(x => x[0] === 'init'), [['init', 'side', 'en']]);
    assert.deepEqual(hudLog.filter(x => x[0] === 'title').map(x => x[1]), [draft.script.title], 'thẻ mở đầu in đúng tiêu đề kịch bản');
    assert.equal(meta.videoTitle, draft.script.title, 'nhớ tên đang in trong video');
    assert.ok(hudLog.some(x => x[0] === 'close'), 'đóng cửa sổ vẽ chữ sau khi dựng');
    const notes = await fs.readFile(path.join(folder, 'ghi-chu-dang-video.txt'), 'utf8');
    assert.match(notes, /LỜI ĐỌC:/);
    assert.match(notes, /nội dung bị thay đổi hoặc tổng hợp/);
    await assert.rejects(fs.access(path.join(dir, 'KeChuyen')));
    await assert.rejects(fs.access(path.join(dir, 'DongVat')));

    // Thông tin đăng YouTube: lập ngay khi dựng xong từ kịch bản và mốc giờ thật của video; có file tieu-de-youtube.txt cạnh video.
    assert.deepEqual(meta.timeline.map(x => x.number), [1, 2, 3, 4, 5, 6, 7]);
    assert.ok(meta.timeline.every((x, i) => i === 0 || x.start > meta.timeline[i - 1].start), 'mốc giờ tăng dần');
    assert.ok(meta.outroStart > meta.timeline.at(-1).start && meta.outroStart < meta.seconds);
    assert.equal(meta.publish.title, draft.script.title);
    assert.ok(meta.publish.description.startsWith(draft.script.title) && meta.publish.description.includes(draft.script.closing));
    assert.ok(meta.publish.hashtags.length >= 3 && meta.publish.hashtags.every(h => /^#\S+$/u.test(h)));
    assert.ok(meta.publish.tags.length >= 5 && meta.publish.tags.join(', ').length <= 450);
    assert.ok(Array.isArray(meta.publish.chapters));
    assert.equal(meta.publishFile, path.join(folder, 'tieu-de-youtube.txt'));
    assert.equal(await fs.readFile(meta.publishFile, 'utf8'), meta.publish.text);
    const pub1 = await app.invoke('pairPublish', { storyId: 'SS-phim' });
    assert.deepEqual(pub1.publish, meta.publish, 'có sẵn thì trả lại, không lập lại');
    assert.equal((await app.invoke('pairPublish', { storyId: 'SS-phim', force: true })).publish.title, draft.script.title);
    await assert.rejects(app.invoke('pairPublish', { storyId: 'khong-co' }), /Không thấy video này|This video was not found/);
    // Gói đăng đã nằm trong thông tin video mà giao diện đọc.
    const publishSaved = (await app.invoke('state')).pair.stories['SS-phim'].publish;
    assert.equal(publishSaved.title, draft.script.title);

    // Đổi tiêu đề: cập nhật kịch bản đã lưu, tên video, gói đăng và file ghi chú; thẻ mở đầu trong video đổi khi dựng lại.
    const oldTitle = draft.script.title, newTitle = '  From the First Cry   to Forgiveness: Yelling vs Listening (Age 0–30)  ';
    await assert.rejects(app.invoke('pairRetitle', { storyId: 'SS-phim', title: '   ' }), /không được để trống|cannot be empty/);
    await assert.rejects(app.invoke('pairRetitle', { storyId: 'SS-phim', title: 'x'.repeat(101) }), /tối đa 100|at most 100/);
    await assert.rejects(app.invoke('pairRetitle', { storyId: 'khong-co', title: 'abc' }), /Không thấy video này|This video was not found/);
    const re = await app.invoke('pairRetitle', { storyId: 'SS-phim', title: newTitle });
    const wantTitle = 'From the First Cry to Forgiveness: Yelling vs Listening (Age 0–30)';
    assert.equal(re.title, wantTitle);
    const m2 = (await app.invoke('state')).pair.stories['SS-phim'];
    assert.deepEqual([m2.name, m2.title, m2.publish.title], [wantTitle, wantTitle, wantTitle]);
    assert.ok(m2.publish.description.startsWith(wantTitle + '\n'), 'mô tả đổi theo tiêu đề');
    assert.equal(m2.videoTitle, oldTitle, 'video vẫn in tên cũ cho tới khi dựng lại');
    assert.equal(m2.output, meta.output, 'đổi tiêu đề không đụng video đã dựng');
    assert.equal(JSON.parse(await fs.readFile(path.join(folder, 'kich-ban.json'), 'utf8')).script.title, wantTitle);
    assert.match(await fs.readFile(path.join(folder, 'tieu-de-youtube.txt'), 'utf8'), new RegExp('^TITLE\\n' + wantTitle.replace(/[()]/g, '\\$&') + '\\n'));
    assert.match(await fs.readFile(path.join(folder, 'ghi-chu-dang-video.txt'), 'utf8'), /From the First Cry to Forgiveness/);

    // Dựng lại (ví dụ đổi nhạc): vẫn ra video mới, không đè video cũ.
    const first = meta.output;
    await app.invoke('pairBuild', { storyId: 'SS-phim', voice: { voice: '' } });
    await until(() => { const m = app.invoke('state').pair.stories['SS-phim']; return m.status === 'built' && m.output !== first; }, 180000);
    const latest = app.invoke('state').pair.stories['SS-phim'];
    assert.ok(latest.publish.title && latest.timeline.length === 7, 'dựng lại thì lập lại gói đăng');
    assert.equal(latest.publish.title, wantTitle, 'gói đăng giữ tiêu đề mới sau khi dựng lại');
    assert.equal(latest.videoTitle, wantTitle, 'dựng lại thì thẻ mở đầu in tiêu đề mới');
    assert.deepEqual(hudLog.filter(x => x[0] === 'title').map(x => x[1]), [oldTitle, wantTitle]);

    // Thẻ video không được biến mất: mất thông tin video (pairStories) nhưng còn việc trong hàng đợi + kịch bản + video trong thư mục → khôi phục khi mở lại.
    await app.stop();
    const saved = JSON.parse(await fs.readFile(path.join(dir, 'studio.json'), 'utf8'));
    assert.ok(saved.settings.pairStories['SS-phim'], 'đã lưu thông tin video');
    delete saved.settings.pairStories;
    await fs.writeFile(path.join(dir, 'studio.json'), JSON.stringify(saved));
    app = await boot(dir, bootOpts);
    state = await app.invoke('state');
    const back = state.pair.stories['SS-phim'];
    assert.ok(back, 'thẻ video trở lại');
    assert.deepEqual([back.status, back.lang, back.layout, back.name], ['built', 'en', 'side', wantTitle], 'khôi phục đúng tiêu đề đã đổi');
    assert.equal(back.output, latest.output, 'lấy lại đúng video dựng mới nhất, không nhầm clip 001.mp4');
    assert.ok(back.cover && (await fs.stat(back.cover)).size > 500, 'lấy lại ảnh bìa');
    assert.equal(state.jobs.filter(j => j.kind === 'pair' && j.storyId === 'SS-phim').length, 21);
    const pubBack = await app.invoke('pairPublish', { storyId: 'SS-phim' });
    assert.equal(pubBack.publish.title, wantTitle);
    assert.equal(pubBack.publish.partial, true, 'chưa biết mốc giờ nên chưa có chương');
    assert.equal(typeof (await app.invoke('pairThumb', { storyId: 'SS-phim' })).file, 'string', 'thẻ khôi phục vẫn tạo thumbnail được');

    // Xóa một video (mục «Tác vụ»): bỏ việc + thông tin video của đúng video đó; mặc định giữ file trong thư mục.
    await assert.rejects(app.invoke('pairRemove', { storyId: 'khong-co' }), /Không thấy video này|This video was not found/);
    const removedPair = await app.invoke('pairRemove', { storyId: 'SS-phim' });
    assert.equal(removedPair.pair.stories['SS-phim'], undefined, 'thông tin video đã gỡ');
    assert.equal(removedPair.jobs.filter(j => j.kind === 'pair' && j.storyId === 'SS-phim').length, 0, 'việc của video đã gỡ');
    assert.equal(removedPair.removed.trashed, false);
    assert.ok((await fs.stat(folder)).isDirectory(), 'không tick xóa file thì thư mục vẫn còn');

    // Xóa danh sách tab này: việc và video bị gỡ, tab khác không bị đụng.
    await app.invoke('clearList', { kind: 'pair', deleteFiles: false });
    state = await app.invoke('state');
    assert.equal(state.jobs.filter(j => j.kind === 'pair').length, 0);
    assert.equal(Object.keys(state.pair.stories).length, 0);
    await app.stop();
  } finally { if (app && !app.lifecycle.includes('quit')) await app.stop(); await fs.rm(dir, { recursive: true, force: true }); }
});
