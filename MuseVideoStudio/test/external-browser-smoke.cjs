// Real Chromium adapter smoke using intercepted fixture HTML. No Muse service
// request or real credential is used. Linux AES adapter substitutes safeStorage;
// this verifies Chromium APIs, not Windows DPAPI, installed Chrome/Edge, or Muse.
const { chromium } = require('playwright-core');
const { launchExternalBrowser } = require('../src/external-browser.cjs');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const key = crypto.randomBytes(32);
const safeStorage = {
  isEncryptionAvailable: () => true,
  getSelectedStorageBackend: () => 'gnome_libsecret',
  encryptString(text) { const iv=crypto.randomBytes(12),c=crypto.createCipheriv('aes-256-gcm',key,iv),data=Buffer.concat([c.update(text),c.final()]);return Buffer.concat([iv,c.getAuthTag(),data]); },
  decryptString(bytes) { const c=crypto.createDecipheriv('aes-256-gcm',key,bytes.subarray(0,12),{authTagLength:16});c.setAuthTag(bytes.subarray(12,28));return Buffer.concat([c.update(bytes.subarray(28)),c.final()]).toString(); }
};
const fixture = '<!doctype html><html><head><title>Muse adapter fixture</title></head><body><textarea aria-label="Prompt"></textarea><input type="file" multiple><button type="button">Send</button></body></html>';
(async () => {
  const dir=await fs.mkdtemp(path.join(os.tmpdir(),'muse-real-chromium-smoke-'));
  const open = new Set(),contexts=[];
  const engine={launchPersistentContext:async(profile,options)=>{
    const context=await chromium.launchPersistentContext(profile,{...options,args:['--no-sandbox']});
    await context.route('**/*',route=>route.fulfill({status:200,contentType:'text/html',body:fixture}));
    contexts.push(context);return context;
  }};
  const launch = async account => {
    const adapter=await launchExternalBrowser({executablePath:process.env.CHROMIUM_PATH || '/usr/bin/chromium',profileDir:path.join(dir,`account-${account}`),sessionFile:path.join(dir,`account-${account}.enc`),safeStorage,chromium:engine,headless:true});open.add(adapter);return adapter;
  };
  try {
    const first=await launch(1);
    const image=path.join(dir,'reference.png');await fs.writeFile(image,Buffer.from('fixture image bytes'));
    await first.upload('input[type=file]',[image]);
    assert.equal(await first.evaluate(()=>document.querySelector('input').files.length),1);
    assert.equal(await first.evaluate(()=>document.querySelector('input').files[0].name),'reference.png');
    await first.evaluate(()=>{localStorage.setItem('fixture-local','saved');document.cookie='fixture-session=private-test-fixture; Path=/; Secure; SameSite=Lax';});
    assert.ok((await contexts[0].cookies()).some(c=>c.name==='fixture-session'&&c.expires===-1));
    const blob=await first.evaluate(()=>URL.createObjectURL(new Blob([new Uint8Array([0,0,0,24,102,116,121,112,105,115,111,109])],{type:'video/mp4'})));
    const output=path.join(dir,'downloads','blob.mp4');await first.download(blob,output);
    assert.equal((await fs.readFile(output)).toString('ascii',4,8),'ftyp');
    await first.close();open.delete(first);
    const encrypted=await fs.readFile(path.join(dir,'account-1.enc'));assert.equal(encrypted.includes(Buffer.from('private-test-fixture')),false);
    const reopened=await launch(1);
    assert.equal(await reopened.evaluate(()=>localStorage.getItem('fixture-local')),'saved');
    assert.ok((await contexts[1].cookies()).some(c=>c.name==='fixture-session'));
    const separate=await launch(2);
    assert.equal(await separate.evaluate(()=>localStorage.getItem('fixture-local')),null);
    assert.equal((await contexts[2].cookies()).some(c=>c.name==='fixture-session'),false);
    console.log('PASS: real Chromium fixture — file upload, blob MP4 download, localStorage and encrypted session-cookie restore after relaunch, independent account profiles. No live Muse/Windows validation.');
  } finally {
    await Promise.allSettled([...open].map(a=>a.close()));
    await fs.rm(dir,{recursive:true,force:true});
  }
})().catch(e=>{console.error(e.message);process.exitCode=1;});
