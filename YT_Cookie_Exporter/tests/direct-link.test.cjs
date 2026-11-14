const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const source = fs.readFileSync(require('node:path').join(__dirname, '../extension/bg.js'), 'utf8');
const hook = fs.readFileSync(require('node:path').join(__dirname, '../extension/hook.js'), 'utf8');
const ID = '7676680132039396650', OTHER = '7676680132039396699';
const MEDIA = 'https://v26-web.douyinvod.com/real.mp4?signature=playwm%2Fabc&x=1';
function metadata(id, url) { return { aweme_id:id, video:{ play_addr:{ url_list:[url] } } }; }
function context(options = {}) {
  const scripts = options.scripts || {};
  const state = options.state || {};
  const window = options.window || {};
  const calls = [];
  const chrome = {
    tabs:{create:async x => (calls.push(['create', x]), {id:4}), get:async () => ({status:'complete'}), remove:async id => calls.push(['remove', id])},
    scripting:{executeScript:async x => (calls.push(['script', x]), [{result:options.result ? options.result(x) : {id:'',urls:[]}}])},
    storage:{local:{get:async () => ({direct:state}), set:async x => { if(x.direct) options.saved = x.direct; }}},
  };
  const c = vm.createContext({URL, Set, window, chrome, Date,
    document:{title:'target page', getElementById:id => scripts[id] ? {textContent:scripts[id]} : null,
      querySelectorAll:() => [{ currentSrc:'https://v26-web.douyinvod.com/recommendation.mp4',src:'',querySelectorAll:()=>[] }]},
    performance:{getEntriesByType:()=>[{name:'https://v26-web.douyinvod.com/preload.mp4'}]},
    calls, console});
  const code = source.slice(source.indexOf('function pageGrab('), source.indexOf('// ---- v2.1:'));
  vm.runInContext('let job={}; const sleep=async()=>{};const saveJob=async()=>{};'+code+'; globalThis.api={pageGrab,directTarget,grabOne,run};', c);
  return {api:c.api, calls, options};
}
test('selects exact requested aweme after earlier recommendation metadata', () => {
  const {api}=context({scripts:{RENDER_DATA:encodeURIComponent(JSON.stringify({feed:[metadata(OTHER,'https://v26-web.douyinvod.com/wrong.mp4'), metadata(ID,MEDIA)]}))}});
  const result=api.pageGrab(ID);
  assert.equal(result.id,ID);assert.equal(result.verifiedAwemeId,ID);
  assert.deepEqual(Array.from(result.urls),[MEDIA]);
});
test('fails closed instead of taking any DOM video or resource timing entry', () => {
  const {api}=context({scripts:{RENDER_DATA:JSON.stringify({feed:[metadata(OTHER,MEDIA)]})}});
  assert.equal(api.pageGrab(ID).urls.length,0);
});
test('uses captured hook media only when the record matches the requested id', () => {
  const {api}=context({window:{__ytAweme:{[ID]:{id:ID,playUrls:[MEDIA]},[OTHER]:{id:OTHER,playUrls:['https://v26-web.douyinvod.com/other.mp4']}}}});
  assert.deepEqual(Array.from(api.pageGrab(ID).urls),[MEDIA]);
  const mismatch=context({window:{__ytAweme:{[ID]:{id:OTHER,playUrls:[MEDIA]}}}});
  assert.equal(mismatch.api.pageGrab(ID).urls.length,0);
});
test('rejects unsafe URLs and lookalike provider hostnames', () => {
  for(const url of ['javascript:alert(1)','https://douyinvod.com.evil.test/a.mp4','https://user:pass@v26-web.douyinvod.com/a','https://127.0.0.1/a']) {
    const {api}=context({scripts:{RENDER_DATA:JSON.stringify(metadata(ID,url))}});
    assert.equal(api.pageGrab(ID).urls.length,0,url);
  }
});
test('grabOne passes target id in MAIN and never rewrites signed playwm text', async () => {
  const {api,calls}=context({result:() => ({id:ID,verifiedAwemeId:ID,urls:[MEDIA]})});
  const result=await api.grabOne('https://www.douyin.com/video/'+ID);
  assert.equal(result.url,MEDIA);assert.equal(result.verifiedAwemeId,ID);assert.equal(result.cacheVersion,2);
  const args=calls.find(x=>x[0]==='script')[1];assert.equal(args.world,'MAIN');assert.equal(args.args[0],ID);
});
test('old cached links and mismatched result ids cannot enter verified direct map', async () => {
  const options={state:{['https://www.douyin.com/video/'+ID]:{url:MEDIA,t:Date.now()}},result:()=>({id:OTHER,verifiedAwemeId:OTHER,urls:[MEDIA]})};
  const {api}=context(options);await api.run(['https://www.douyin.com/video/'+ID]);
  assert.equal(Object.keys(options.saved).length,0);
});
test('a verified cached result is reused only for its exact page id', async () => {
  const url='https://www.douyin.com/video/'+ID;
  const options={state:{[url]:{url:MEDIA,t:Date.now(),verifiedAwemeId:ID,cacheVersion:2}},result:()=>{throw Error('should reuse');}};
  const {api,calls}=context(options);await api.run([url]);assert.equal(calls.length,0);
});
test('invalid or non-Douyin input cannot create background tabs', async () => {
  const {api,calls}=context();
  for(const url of ['http://www.douyin.com/video/'+ID,'https://douyin.com.evil.test/video/'+ID,'https://www.douyin.com/user/'+ID]) assert.equal(await api.grabOne(url),null);
  assert.equal(calls.length,0);
});
test('hook stores native play addresses with the correct aweme record', () => {
  const body=hook.slice(hook.indexOf('  function mixOf('),hook.indexOf('  // Ghi nho 1 bo'));
  const c=vm.createContext({URL,window:{__ytAwemeN:0}});
  vm.runInContext('var store={}; var num=v=>Number.isFinite(Number(v))?Number(v):null; var pick=(...args)=>args.find(v=>v!==undefined&&v!==null&&v!=="");'+body+';globalThis.api={rec,store};',c);
  c.api.rec(metadata(ID,MEDIA));c.api.rec(metadata(OTHER,'javascript:bad'));
  assert.deepEqual(Array.from(c.api.store[ID].playUrls),[MEDIA]);assert.equal(c.api.store[OTHER].playUrls.length,0);
});
