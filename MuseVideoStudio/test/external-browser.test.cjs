const { test } = require('node:test');
const assert = require('node:assert/strict');
const { EventEmitter } = require('node:events');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const crypto = require('node:crypto');
const { launchExternalBrowser } = require('../src/external-browser.cjs');
const key = crypto.randomBytes(32);
const storage = {
  isEncryptionAvailable: () => true,
  encryptString(text) { const iv=crypto.randomBytes(12),c=crypto.createCipheriv('aes-256-gcm',key,iv),data=Buffer.concat([c.update(text),c.final()]);return Buffer.concat([iv,c.getAuthTag(),data]); },
  decryptString(bytes) { const c=crypto.createDecipheriv('aes-256-gcm',key,bytes.subarray(0,12),{authTagLength:16});c.setAuthTag(bytes.subarray(12,28));return Buffer.concat([c.update(bytes.subarray(28)),c.final()]).toString(); }
};
class FakePage extends EventEmitter {
  constructor(events) {
    super();this.events=events;this.address='about:blank';this.closed=false;this.inputCount=1;this.multiple='';this.visible=true;this.enabled=true;this.bodyText=JSON.stringify({success:true,ip:'203.0.113.10',country_code:'US',country:'United States'});this.responseStatus=200;
    this.keyboard={press:async key=>events.push(['press',key])};
  }
  url(){return this.address;} isClosed(){return this.closed;}
  async goto(url,options){this.events.push(['goto',url,options]);if(this.failGoto)throw Error('network private details');if(this.hangGoto)return new Promise(()=>{});this.address=this.redirect || url;return {status:()=>this.responseStatus};}
  async close(){this.closed=true;this.events.push(['page-close']);this.emit('close');}
  async bringToFront(){this.events.push(['show']);}
  locator(selector){return {count:async()=>this.inputCount,getAttribute:async()=>this.multiple,setInputFiles:async files=>this.events.push(['upload',selector,files]),isVisible:async()=>this.visible,isEnabled:async()=>this.enabled,click:async()=>this.events.push(['click',selector]),innerText:async()=>{if(this.failRead)throw Error('private read detail');return this.bodyText;}};}
  async evaluate(fn,arg){this.events.push(['evaluate',arg]);if(typeof arg==='string' && /^(https:|blob:)/.test(arg))return;return fn(arg);}
  waitForEvent(name,options){this.events.push(['wait',name,options]);return this.downloadPromise || Promise.resolve({saveAs:async target=>{this.events.push(['download',target]);await fs.writeFile(target,'test mp4');},failure:async()=>null});}
}
class FakeContext extends EventEmitter {
  constructor(){super();this.events=[];this.page=new FakePage(this.events);this.values=[];this.closed=false;this.closes=0;this.list=[this.page];this.probeConfig={};}
  pages(){return [...this.list];}
  async newPage(){const page=new FakePage([]);Object.assign(page,this.probeConfig);this.list.push(page);this.emit('page',page);return page;} setDefaultTimeout(value){this.events.push(['timeout',value]);}
  async cookies(){if(this.closed)throw Error('context closed');this.events.push(['cookies']);return structuredClone(this.values);}
  async addCookies(cookies){this.events.push(['restore',cookies]);this.values.push(...cookies.map(c=>({...c,expires:-1})));}
  async close(){this.events.push(['close']);this.closed=true;this.closes++;for(const p of this.list)p.closed=true;this.emit('close');}
}
async function setup(options = {}) {
  const dir=await fs.mkdtemp(path.join(os.tmpdir(),'muse-external-test-'));
  const context=new FakeContext(),launches=[];
  const chromium={launchPersistentContext:async(profile,config)=>{launches.push({profile,config});return context;}};
  const config={executablePath:process.execPath,profileDir:path.join(dir,'profile'),sessionFile:path.join(dir,'session.enc'),safeStorage:storage,chromium,...options};
  return {dir,context,launches,config,cleanup:async adapter=>{if(adapter)await adapter.close();await fs.rm(dir,{recursive:true,force:true});}};
}
test('launches a dedicated persistent browser with bounded startup, restores encrypted session before navigation', async () => {
  const t=await setup();let adapter;
  try {
    const cookie={domain:'muse.ai',hostOnly:true,path:'/',name:'__Host-login',value:'test-private-session',session:true,secure:true,httpOnly:true,sameSite:'lax'};
    await fs.writeFile(t.config.sessionFile,storage.encryptString(JSON.stringify({version:1,cookies:[cookie]})));
    adapter=await launchExternalBrowser(t.config);
    assert.equal(t.launches[0].profile,await fs.realpath(t.config.profileDir));assert.equal(t.launches[0].config.timeout,30000);assert.equal(t.launches[0].config.headless,false);
    assert.equal(t.launches[0].config.acceptDownloads,true);assert.equal(adapter.external,true);assert.equal(adapter.isSessionEnabled(),true);
    assert.ok(t.context.events.findIndex(e=>e[0]==='restore')<t.context.events.findIndex(e=>e[0]==='goto'));
    assert.equal(adapter.url(),'https://muse.ai/');assert.equal(t.context.values[0].name,'__Host-login');assert.equal(t.context.values[0].domain,'muse.ai');
  } finally {await t.cleanup(adapter);}
});
test('independent profiles do not share cookie jars and backups exclude unrelated or persistent cookies', async () => {
  const a=await setup(),b=await setup();let first,second;
  try {
    first=await launchExternalBrowser(a.config);second=await launchExternalBrowser(b.config);
    a.context.values=[{domain:'muse.ai',path:'/',name:'session',value:'private-test-a',expires:-1,sameSite:'Strict',secure:true,httpOnly:true},{domain:'unrelated.test',name:'other',value:'other',expires:-1},{domain:'.muse.ai',name:'persistent',value:'persistent',expires:9999999999}];
    await first.flush();await second.flush();
    const bytes=await fs.readFile(a.config.sessionFile);assert.equal(bytes.includes(Buffer.from('private-test-a')),false);
    assert.deepEqual(JSON.parse(storage.decryptString(bytes)).cookies.map(c=>c.name),['session']);
    assert.equal(JSON.parse(storage.decryptString(await fs.readFile(b.config.sessionFile))).cookies.length,0);
    assert.notEqual(a.launches[0].profile,b.launches[0].profile);
  } finally {await a.cleanup(first);await b.cleanup(second);}
});
test('refuses an existing unmarked personal browser directory before launch', async () => {
  const t=await setup();
  try {await fs.mkdir(t.config.profileDir);await fs.writeFile(path.join(t.config.profileDir,'Local State'),'personal');await assert.rejects(launchExternalBrowser(t.config),/Chrome cá nhân/);assert.equal(t.launches.length,0);}
  finally {await t.cleanup();}
});
test('all automation requires a Muse HTTPS origin and cannot run on an impostor domain', async () => {
  const t=await setup();let adapter;
  try {
    adapter=await launchExternalBrowser(t.config);t.context.page.address='https://muse.ai.evil.test/chat';
    await assert.rejects(async()=>adapter.evaluate(()=>42),/muse.ai/);await assert.rejects(adapter.pressEnter(),/muse.ai/);
    await assert.rejects(adapter.upload('input',[]),/muse.ai/);await assert.rejects(adapter.click('button'),/muse.ai/);await assert.rejects(adapter.download('https://cdn.test/a.mp4',path.join(t.dir,'out.mp4')),/muse.ai/);
    t.context.page.address='http://muse.ai/';await assert.rejects(async()=>adapter.evaluate(()=>42),/muse.ai/);
    t.context.page.address='https://chat.muse.ai/chat';assert.equal(await adapter.evaluate(()=>42),42);
  } finally {await t.cleanup(adapter);}
});
test('uploads only through one unique file input and validates multiple references support', async () => {
  const t=await setup();let adapter;
  try {
    adapter=await launchExternalBrowser(t.config);const files=[path.join(t.dir,'a.png'),path.join(t.dir,'b.png')];await Promise.all(files.map(f=>fs.writeFile(f,'test')));
    t.context.page.inputCount=2;await assert.rejects(adapter.upload('input',files),/duy nhất/);
    t.context.page.inputCount=1;t.context.page.multiple=null;await assert.rejects(adapter.upload('input',files),/một ảnh/);
    t.context.page.multiple='';await adapter.upload('input',files);assert.deepEqual(t.context.events.find(e=>e[0]==='upload')[2],files);
    await adapter.pressEnter();assert.deepEqual(t.context.events.find(e=>e[0]==='press'),['press','Enter']);
  } finally {await t.cleanup(adapter);}
});
test('download waits for the browser download event and saves to the requested path', async () => {
  const t=await setup();let adapter;
  try {
    adapter=await launchExternalBrowser(t.config);const target=path.join(t.dir,'video','out.mp4');
    assert.equal(await adapter.download('blob:https://muse.ai/test-video',target),target);assert.equal(await fs.readFile(target,'utf8'),'test mp4');
    await assert.rejects(adapter.download('javascript:document.cookie',target),/HTTPS/);
    await assert.rejects(adapter.download('blob:https://unrelated.test/id',target),/HTTPS/);
  } finally {await t.cleanup(adapter);}
});
test('close persists session before stopping context and no cookie reads occur afterwards', async () => {
  const t=await setup();let adapter;
  try {
    adapter=await launchExternalBrowser(t.config);t.context.values=[{domain:'muse.ai',path:'/',name:'session',value:'before-close-test',expires:-1,sameSite:'Lax'}];
    await adapter.close();assert.equal(adapter.isDestroyed(),true);assert.equal(t.context.closes,1);
    assert.equal(JSON.parse(storage.decryptString(await fs.readFile(t.config.sessionFile))).cookies[0].value,'before-close-test');
    const count=t.context.events.filter(e=>e[0]==='cookies').length;t.context.page.emit('response',{});await new Promise(r=>setTimeout(r,200));await adapter.flush();assert.equal(t.context.events.filter(e=>e[0]==='cookies').length,count);
  } finally {await t.cleanup(adapter);}
});
test('failed initial navigation closes the launched context without leaking remote error details', async () => {
  const t=await setup();
  try {t.context.page.failGoto=true;await assert.rejects(launchExternalBrowser(t.config),e=>/Không mở được/.test(e.message)&&!e.message.includes('private details'));assert.equal(t.context.closes,1);}
  finally {await t.cleanup();}
});

test('show allows manually re-focusing identity-provider login while automation remains guarded', async () => {
  const t=await setup();let adapter;
  try {
    adapter=await launchExternalBrowser(t.config);t.context.page.address='https://accounts.example.test/sign-in';
    await adapter.show();assert.ok(t.context.events.some(e=>e[0]==='show'));await assert.rejects(adapter.pressEnter(),/muse.ai/);
  } finally {await t.cleanup(adapter);}
});
test('concurrent closes share one promise and close the context only once', async () => {
  const t=await setup();let adapter;
  try {
    adapter=await launchExternalBrowser(t.config);const first=adapter.close(),second=adapter.close();assert.equal(first,second);await Promise.all([first,second]);assert.equal(t.context.closes,1);
  } finally {await t.cleanup(adapter);}
});

test('deferred browser can open Muse directly without an IP-country request',async()=>{const t=await setup({deferMuseNavigation:true});let adapter;try{adapter=await launchExternalBrowser(t.config);assert.equal(t.context.events.some(e=>e[0]==='goto'),false);assert.equal(adapter.checkNetwork,undefined);await adapter.openMuse();assert.equal(adapter.url(),'https://muse.ai/');assert.ok(t.context.events.filter(e=>e[0]==='goto').every(e=>e[1]==='https://muse.ai/'));}finally{await t.cleanup(adapter);}});
test('clearLogin removes only the selected app-owned account profile and encrypted backup',async()=>{const a=await setup(),b=await setup();let first,second;try{first=await launchExternalBrowser(a.config);second=await launchExternalBrowser(b.config);await first.flush();await second.flush();await first.clearLogin();await assert.rejects(fs.access(a.config.profileDir));await assert.rejects(fs.access(a.config.sessionFile));await fs.access(b.config.profileDir);await fs.access(b.config.sessionFile);assert.equal(second.isDestroyed(),false);}finally{await a.cleanup(first);await b.cleanup(second);}});
test('clearLogin refuses a replaced unmarked personal folder',async()=>{const t=await setup();let adapter;try{adapter=await launchExternalBrowser(t.config);await fs.rename(t.config.profileDir,t.config.profileDir+'-original');await fs.mkdir(t.config.profileDir);await fs.writeFile(path.join(t.config.profileDir,'Local State'),'keep-personal');await assert.rejects(adapter.clearLogin(),/Chưa xóa/);assert.equal(await fs.readFile(path.join(t.config.profileDir,'Local State'),'utf8'),'keep-personal');}finally{await t.cleanup(adapter);}});

test('profile reset supports a legitimate parent directory alias without allowing a profile symlink',async()=>{const t=await setup();let adapter;try{const real=path.join(t.dir,'real-parent'),alias=path.join(t.dir,'parent-alias');await fs.mkdir(real);await fs.symlink(real,alias,process.platform==='win32'?'junction':'dir');t.config.profileDir=path.join(alias,'owned-profile');t.config.sessionFile=path.join(alias,'session.enc');adapter=await launchExternalBrowser(t.config);await adapter.flush();await adapter.clearLogin();await assert.rejects(fs.access(path.join(real,'owned-profile')));await assert.rejects(fs.access(path.join(real,'session.enc')));}finally{await t.cleanup(adapter);}});
test('clearLogin removes only the selected owned profile and encrypted session backup', async () => {
  const a=await setup({deferMuseNavigation:true}),b=await setup({deferMuseNavigation:true});let first,second;
  try {
    first=await launchExternalBrowser(a.config);second=await launchExternalBrowser(b.config);
    await fs.writeFile(path.join(a.config.profileDir,'browser-storage'),'selected');await fs.writeFile(path.join(b.config.profileDir,'browser-storage'),'other account');await first.flush();await second.flush();
    assert.equal(await first.clearLogin(),true);assert.equal(first.isDestroyed(),true);await assert.rejects(fs.access(a.config.profileDir));await assert.rejects(fs.access(a.config.sessionFile));
    assert.equal(await fs.readFile(path.join(b.config.profileDir,'browser-storage'),'utf8'),'other account');await fs.access(b.config.sessionFile);assert.equal(second.isDestroyed(),false);assert.equal(a.context.page.events.some(e=>e[0]==='goto'),false);
  } finally {await a.cleanup(first);await b.cleanup(second);}
});
test('clearLogin refuses unmarked or symlink profiles without deleting original data', async () => {
  for(const mode of ['unmarked','symlink']) {
    const t=await setup({deferMuseNavigation:true});let adapter;
    try {
      adapter=await launchExternalBrowser(t.config);await adapter.close();
      const original=path.join(t.dir,'personal');await fs.mkdir(original);await fs.writeFile(path.join(original,'original'),'keep');
      await fs.rm(t.config.profileDir,{recursive:true,force:true});
      if(mode==='symlink')await fs.symlink(original,t.config.profileDir,'dir');else{await fs.mkdir(t.config.profileDir);await fs.writeFile(path.join(t.config.profileDir,'original'),'keep');}
      await assert.rejects(adapter.clearLogin(),/Chưa xóa/);assert.equal(await fs.readFile(path.join(original,'original'),'utf8'),'keep');await fs.access(t.config.profileDir);
    } finally {await t.cleanup(adapter);}
  }
});
test('partial profile cleanup can be retried without ownership marker if directory identity is unchanged', async () => {
  const t=await setup({deferMuseNavigation:true});let adapter;const remove=fs.rm;
  try {
    adapter=await launchExternalBrowser(t.config);await fs.writeFile(path.join(t.config.profileDir,'remaining'),'keep until retry');
    fs.rm=async(directory,options)=>{if(directory===t.config.profileDir){await fs.unlink(path.join(directory,'.muse-studio-profile'));throw Error('fixture busy profile');}return remove(directory,options);};
    await assert.rejects(adapter.clearLogin(),/Chưa xóa/);await fs.access(path.join(t.config.profileDir,'remaining'));
    fs.rm=remove;assert.equal(await adapter.clearLogin(),true);await assert.rejects(fs.access(t.config.profileDir));await assert.rejects(fs.access(t.config.sessionFile));
  } finally {fs.rm=remove;await t.cleanup(adapter);}
});
test('clearLogin waits for an in-flight cookie backup after the external browser was closed', async () => {
  const t=await setup({deferMuseNavigation:true});let adapter,release;
  try {
    adapter=await launchExternalBrowser(t.config);const original=t.context.cookies.bind(t.context);
    t.context.cookies=async()=>{const values=await original();await new Promise(resolve=>release=resolve);return values;};
    const saving=adapter.flush();await new Promise(resolve=>setImmediate(resolve));await t.context.close();
    let done=false;const clearing=adapter.clearLogin().then(value=>{done=true;return value;});await new Promise(resolve=>setImmediate(resolve));assert.equal(done,false);
    release();await saving;assert.equal(await clearing,true);await assert.rejects(fs.access(t.config.sessionFile));await new Promise(resolve=>setTimeout(resolve,200));await assert.rejects(fs.access(t.config.sessionFile));
  } finally {if(release)release();await t.cleanup(adapter);}
});
