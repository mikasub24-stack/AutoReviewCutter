const { test } = require('node:test');
const assert = require('node:assert/strict');
const { EventEmitter } = require('node:events');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const crypto = require('node:crypto');
const { createSessionStore } = require('../src/session-store.cjs');
// Real encryption in the test adapter; production receives Electron safeStorage.
const key = crypto.randomBytes(32);
const storage = {
  isEncryptionAvailable: () => true,
  encryptString(text) { const iv = crypto.randomBytes(12); const c = crypto.createCipheriv('aes-256-gcm',key,iv); const bytes = Buffer.concat([c.update(text,'utf8'),c.final()]); return Buffer.concat([iv,c.getAuthTag(),bytes]); },
  decryptString(bytes) { const c = crypto.createDecipheriv('aes-256-gcm',key,bytes.subarray(0,12),{authTagLength:16}); c.setAuthTag(bytes.subarray(12,28)); return Buffer.concat([c.update(bytes.subarray(28)),c.final()]).toString('utf8'); }
};
function jar(initial = []) {
  let values = structuredClone(initial), set = [];
  const cookies = new EventEmitter();
  cookies.get = async () => structuredClone(values);
  cookies.flushStore = async () => {};
  cookies.set = async cookie => { set.push(cookie); };
  return { session: { cookies }, set, replace: value => { values=structuredClone(value); } };
}
const muse = { domain:'muse.ai',hostOnly:true,path:'/',name:'login',value:'test-private-cookie-value',session:true,secure:true,httpOnly:true,sameSite:'lax' };
test('remembered session is encrypted, scoped to Muse, and preserves host-only cookie semantics', async () => {
  const dir=await fs.mkdtemp(path.join(os.tmpdir(),'muse-session-test-'));
  try {
    const file=path.join(dir,'account-1.enc');
    const first=jar([muse,{...muse,domain:'other.test'},{...muse,name:'persistent',session:false,expirationDate:9999999999}]);
    const store=createSessionStore({session:first.session,safeStorage:storage,file,platform:'win32'});
    await store.flush();
    const bytes=await fs.readFile(file);assert.equal(bytes.includes(Buffer.from(muse.value)),false);
    const second=jar();const restored=createSessionStore({session:second.session,safeStorage:storage,file,platform:'win32'});
    assert.deepEqual(await restored.restore(),{available:true,enabled:true,restored:1,error:''});assert.equal(second.set.length,1);
    assert.equal(second.set[0].url,'https://muse.ai/');assert.equal(second.set[0].domain,undefined);assert.equal(second.set[0].expirationDate,undefined);assert.equal(second.set[0].httpOnly,true);
  } finally { await fs.rm(dir,{recursive:true,force:true}); }
});
test('logout replaces encrypted backup with empty cookie set; removed cookies are not resurrected', async () => {
  const dir=await fs.mkdtemp(path.join(os.tmpdir(),'muse-session-test-'));
  try {
    const file=path.join(dir,'account-1.enc'),first=jar([muse]);
    const store=createSessionStore({session:first.session,safeStorage:storage,file,platform:'win32'});store.start();await store.flush();
    first.replace([]);first.session.cookies.emit('changed',{},muse,'explicit',true);await store.flush();
    const second=jar();await createSessionStore({session:second.session,safeStorage:storage,file,platform:'win32'}).restore();assert.equal(second.set.length,0);await store.dispose();
  } finally { await fs.rm(dir,{recursive:true,force:true}); }
});
test('separate account files restore independent sessions and never overwrite native cookies', async () => {
  const dir=await fs.mkdtemp(path.join(os.tmpdir(),'muse-session-test-'));
  try {
    for(const n of [1,2]) { const j=jar([{...muse,value:`account-${n}`}]);await createSessionStore({session:j.session,safeStorage:storage,file:path.join(dir,`${n}.enc`),platform:'win32'}).flush(); }
    const j=jar();await createSessionStore({session:j.session,safeStorage:storage,file:path.join(dir,'2.enc'),platform:'win32'}).restore();assert.equal(j.set[0].value,'account-2');
    const native=jar([{...muse,value:'newer-native',session:false,expirationDate:9999999999}]);await createSessionStore({session:native.session,safeStorage:storage,file:path.join(dir,'1.enc'),platform:'win32'}).restore();assert.equal(native.set.length,0);
  } finally { await fs.rm(dir,{recursive:true,force:true}); }
});
test('does not fall back to plaintext when OS encryption is unavailable or basic_text', async () => {
  const dir=await fs.mkdtemp(path.join(os.tmpdir(),'muse-session-test-'));
  try {
    const file=path.join(dir,'private.enc'),j=jar([muse]);
    const noStorage={...storage,isEncryptionAvailable:()=>false};
    const store=createSessionStore({session:j.session,safeStorage:noStorage,file,platform:'win32'});assert.deepEqual(await store.restore(),{available:false,enabled:false,restored:0,error:''});await store.flush();await assert.rejects(fs.access(file));
    const basic=createSessionStore({session:j.session,safeStorage:{...storage,getSelectedStorageBackend:()=> 'basic_text'},file,platform:'linux'});await basic.flush();await assert.rejects(fs.access(file));
  } finally { await fs.rm(dir,{recursive:true,force:true}); }
});
test('corrupted cookie backup errors contain no secret contents', async () => {
  const dir=await fs.mkdtemp(path.join(os.tmpdir(),'muse-session-test-'));
  try {
    const file=path.join(dir,'private.enc');await fs.writeFile(file,Buffer.from(muse.value));const j=jar();
    const store=createSessionStore({session:j.session,safeStorage:storage,file,platform:'win32'});
    const restored=await store.restore();assert.equal(restored.enabled,false);assert.equal(restored.error.includes(muse.value),false);
    await store.flush();assert.equal((await fs.readFile(file)).toString(),muse.value);
  } finally { await fs.rm(dir,{recursive:true,force:true}); }
});

test('one rejected cookie does not prevent restoring another and the original backup stays untouched', async () => {
  const dir=await fs.mkdtemp(path.join(os.tmpdir(),'muse-session-test-'));
  try {
    const file=path.join(dir,'private.enc');const before=storage.encryptString(JSON.stringify({version:1,cookies:[muse,{...muse,name:'second'}]}));await fs.writeFile(file,before);
    const j=jar();const originalSet=j.session.cookies.set;j.session.cookies.set=async cookie=>{if(cookie.name==='login')throw Error('private token invalid');return originalSet(cookie);};
    const store=createSessionStore({session:j.session,safeStorage:storage,file,platform:'win32'});const result=await store.restore();assert.equal(result.restored,1);assert.equal(result.enabled,false);assert.equal(j.set[0].name,'second');await store.flush();assert.deepEqual(await fs.readFile(file),before);
  } finally { await fs.rm(dir,{recursive:true,force:true}); }
});

test('native cookie flush failure still saves encrypted backup and a later retry recovers', async () => {
  const dir=await fs.mkdtemp(path.join(os.tmpdir(),'muse-session-test-'));
  try {
    const file=path.join(dir,'private.enc'),j=jar([muse]);let fail=true;
    j.session.cookies.flushStore=async()=>{if(fail)throw Error('native failure');};
    const store=createSessionStore({session:j.session,safeStorage:storage,file,platform:'win32'});
    await assert.rejects(store.flush(),/Chưa lưu/);
    const encrypted=await fs.readFile(file);assert.equal(encrypted.includes(Buffer.from(muse.value)),false);
    assert.equal(JSON.parse(storage.decryptString(encrypted)).cookies.length,1);
    fail=false;j.replace([]);await store.flush();assert.equal(JSON.parse(storage.decryptString(await fs.readFile(file))).cookies.length,0);
  } finally {await fs.rm(dir,{recursive:true,force:true});}
});
test('encrypted backup failure does not prevent native cookie flush', async () => {
  const dir=await fs.mkdtemp(path.join(os.tmpdir(),'muse-session-test-'));
  try {
    const j=jar([muse]);let native=0;j.session.cookies.flushStore=async()=>{native++;};
    const badStorage={...storage,encryptString:()=>{throw Error('private encryption detail');}};
    const store=createSessionStore({session:j.session,safeStorage:badStorage,file:path.join(dir,'private.enc'),platform:'win32'});
    await assert.rejects(store.flush(),e=>e.message.includes('Chưa lưu')&&!e.message.includes('private encryption detail'));assert.equal(native,1);
  } finally {await fs.rm(dir,{recursive:true,force:true});}
});
