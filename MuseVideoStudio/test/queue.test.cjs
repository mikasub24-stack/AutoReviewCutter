const { test } = require('node:test');
const assert = require('node:assert/strict');
const { Queue } = require('../src/queue.cjs');
const base = { save: async () => {} };
test('executes in order and persists completed outputs', async () => {
  const calls = [], saved = [];
  const q = new Queue({ ...base, save: async jobs => saved.push(JSON.parse(JSON.stringify(jobs))), run: async j => { calls.push(j.prompt); return j.prompt + '.mp4'; } });
  await q.add([{prompt:'one'},{prompt:'two'}]); await q.start();
  assert.deepEqual(calls,['one','two']); assert.equal(q.jobs[1].output,'two.mp4'); assert.equal(saved.at(-1)[1].status,'completed');
});
test('failure stops queue without submitting next job; explicit retry is required', async () => {
  const q = new Queue({ ...base, run: async () => { throw Error('timeout'); } });
  await q.add([{prompt:'one'},{prompt:'two'}]); await q.start();
  assert.deepEqual(q.jobs.map(j => j.status),['failed','pending']); assert.equal(q.paused,true); assert.equal(q.active,false);
  await q.retry(q.jobs[0].id); assert.equal(q.jobs[0].status,'pending');
});
test('pause finishes current job and does not start another', async () => {
  let finish; const q = new Queue({ ...base, run: () => new Promise(r => finish = r) });
  await q.add([{prompt:'one'},{prompt:'two'}]); const running = q.start();
  await new Promise(r => setImmediate(r)); q.pause(); finish('first.mp4'); await running;
  assert.deepEqual(q.jobs.map(j => j.status),['completed','pending']);
});
test('restoring marks in-flight job interrupted and never silently reruns', () => {
  const q = new Queue({ ...base, jobs: [{id:'a',status:'running',prompt:'p'}] }); assert.equal(q.jobs[0].status,'interrupted'); assert.equal(q.paused,true);
});
test('concurrent start calls cannot submit the same job twice', async () => {
  let calls=0, finish; const q=new Queue({...base,run:()=>{calls++;return new Promise(r=>finish=r);}});
  await q.add([{prompt:'one'}]);const first=q.start();await new Promise(r=>setImmediate(r));await q.start();finish('a.mp4');await first;assert.equal(calls,1);
});
test('invalid bulk input is rejected without partial mutation', async () => {
  const q=new Queue({...base,run:async()=>''}); await assert.rejects(q.add([{prompt:'ok'},{prompt:' '} ])); assert.equal(q.jobs.length,0);
});
test('parallel accounts receive distinct jobs and never overlap within an account', async () => {
  const active=new Set(), seen=[], inFlight=[];
  const q=new Queue({...base,concurrency:2,run:async(j,slot)=>{
    assert.equal(active.has(slot),false);active.add(slot);seen.push([j.prompt,slot]);inFlight.push(active.size);
    await new Promise(r=>setTimeout(r,5));active.delete(slot);return j.prompt+'.mp4';
  }});
  await q.add(['a','b','c','d'].map(prompt=>({prompt})));await q.start();
  assert.equal(new Set(seen.map(([p])=>p)).size,4);assert.equal(Math.max(...inFlight),2);
  assert.equal(q.jobs.every(j=>j.status==='completed'),true);
});
test('parallel error stops new dispatch while another in-flight job finishes', async () => {
  const q=new Queue({...base,concurrency:2,run:async(j,slot)=>{
    if(slot===0)throw Error('account limit');await new Promise(r=>setTimeout(r,5));return 'ok.mp4';
  }});
  await q.add(['a','b','c'].map(prompt=>({prompt})));await q.start();
  assert.deepEqual(q.jobs.map(j=>j.status),['failed','completed','pending']);assert.equal(q.paused,true);
});
test('each prompt keeps its own reference files in persisted state', async () => {
  let stored;const q=new Queue({...base,save:async jobs=>stored=JSON.parse(JSON.stringify(jobs)),run:async()=>''});
  await q.add([{prompt:'one',references:['one.png','style.png']},{prompt:'two',references:['two.png']}]);
  assert.deepEqual(stored.map(j=>j.references),[['one.png','style.png'],['two.png']]);
});
test('stop interrupts all active workers immediately even while run is waiting; pending jobs are untouched',async()=>{
 const q=new Queue({...base,concurrency:2,run:(_j,_slot,signal)=>new Promise(()=>{assert.equal(signal.aborted,false);})});
 await q.add(['a','b','c'].map(prompt=>({prompt})));const work=q.start();await new Promise(r=>setImmediate(r));
 await Promise.race([q.stop(),new Promise((_,reject)=>setTimeout(()=>reject(Error('stop did not interrupt')),300))]);await work;
 assert.deepEqual(q.jobs.map(j=>j.status),['interrupted','interrupted','pending']);assert.equal(q.active,false);
});
test('bulk delete pending keeps completed outputs; clearAll stops active job and removes list only',async()=>{
 const q=new Queue({...base,jobs:[{id:'done',prompt:'old',status:'completed',output:'keep.mp4'}],run:()=>new Promise(()=>{})});await q.add([{prompt:'a'},{prompt:'b'}]);await q.clearPending();assert.equal(q.jobs.length,1);assert.equal(q.jobs[0].output,'keep.mp4');
 await q.add([{prompt:'c'}]);const work=q.start();await new Promise(r=>setImmediate(r));await q.clearAll();await work;assert.equal(q.jobs.length,0);
});
test('bulk reference changes affect pending jobs only',async()=>{const q=new Queue({...base,jobs:[{id:'done',status:'completed',references:['old.png']}],run:async()=>''});await q.add([{prompt:'a'}]);await q.applyReferences(['common.png']);assert.deepEqual(q.jobs[0].references,['old.png']);assert.deepEqual(q.jobs[1].references,['common.png']);});

test('sequential default never submits the next prompt until the current confirmed download finishes',async()=>{
 const calls=[],saved=[];let confirmDownload;
 const downloaded=new Promise(resolve=>confirmDownload=resolve);
 const q=new Queue({...base,save:async jobs=>saved.push(JSON.parse(JSON.stringify(jobs))),run:async job=>{
  calls.push(job.prompt);job.submittedAt=new Date().toISOString();job.mayHaveSubmitted=true;
  job.stage='waiting_result';
  if(job.prompt==='one'){
   job.resultReadyAt=new Date().toISOString();job.stage='downloading';job.downloadStartedAt=new Date().toISOString();
   await downloaded;job.downloadCompletedAt=new Date().toISOString();
  }
  return job.prompt+'.mp4';
 }});
 await q.add([{prompt:'one'},{prompt:'two'}]);const work=q.start();await new Promise(resolve=>setImmediate(resolve));
 assert.deepEqual(calls,['one']);assert.equal(q.concurrency,1);
 assert.deepEqual(q.jobs.map(j=>j.status),['running','pending']);assert.equal(q.jobs[0].stage,'downloading');
 assert.equal(q.jobs[0].finishedAt,null);assert.equal(q.jobs[0].output,'');
 assert.ok(Number.isFinite(Date.parse(q.jobs[0].startedAt)));
 confirmDownload();await work;
 assert.deepEqual(calls,['one','two']);assert.equal(q.jobs[0].stage,'completed');assert.equal(q.jobs[0].progress,100);
 assert.ok(Date.parse(q.jobs[0].finishedAt)>=Date.parse(q.jobs[0].downloadCompletedAt));
 const firstCompleted=saved.findIndex(jobs=>jobs[0].status==='completed');
 const secondRunning=saved.findIndex(jobs=>jobs[1].status==='running');assert.ok(firstCompleted>=0&&secondRunning>firstCompleted);
});

test('retry and a fresh run clear stale transaction stages while preserving script and references',async()=>{
 const job={id:'retry',status:'failed',prompt:'source prompt',source:'narration',title:'Cảnh 1',number:1,voiceover:'voice',durationSeconds:10,references:['one.png'],image:'one.png',account:2,
  stage:'downloading',stageMessage:'old download',progress:75,downloadProgress:{receivedBytes:12,totalBytes:16},submittedAt:'2025-01-01T00:00:00Z',mayHaveSubmitted:true,resultReadyAt:'old-result',downloadStartedAt:'old-download',downloadCompletedAt:'old-completion',startedAt:'old-start',finishedAt:'old-finish',output:'partial.mp4',error:'old error'};
 let inspected=false;
 const q=new Queue({...base,jobs:[job],run:async current=>{
  inspected=true;assert.equal(current.stage,'starting');assert.equal(current.stageMessage,'');assert.equal(current.progress,null);assert.equal(current.downloadProgress,null);
  for(const field of ['submittedAt','resultReadyAt','downloadStartedAt','downloadCompletedAt','finishedAt'])assert.equal(current[field],null);
  assert.equal(current.mayHaveSubmitted,false);assert.equal(current.account,undefined);assert.equal(current.output,'');assert.equal(current.error,'');
  assert.ok(Number.isFinite(Date.parse(current.startedAt)));assert.equal(current.source,'narration');assert.deepEqual(current.references,['one.png']);
  return 'new.mp4';
 }});
 await q.retry('retry');assert.equal(q.jobs[0].startedAt,null);assert.equal(q.jobs[0].stage,'pending');
 await q.start();assert.equal(inspected,true);assert.equal(q.jobs[0].output,'new.mp4');assert.ok(Number.isFinite(Date.parse(q.jobs[0].finishedAt)));
});

test('failed download preserves submission evidence, pauses dispatch, and records finish time',async()=>{
 const q=new Queue({...base,run:async job=>{job.mayHaveSubmitted=true;job.submittedAt='2026-01-01T00:00:00Z';job.stage='downloading';throw Error('MP4 not validated');}});
 await q.add([{prompt:'one'},{prompt:'two'}]);await q.start();
 assert.deepEqual(q.jobs.map(job=>job.status),['failed','pending']);assert.equal(q.jobs[0].mayHaveSubmitted,true);
 assert.equal(q.jobs[0].stage,'failed');assert.equal(q.jobs[0].error,'MP4 not validated');assert.equal(q.jobs[0].output,'');
 assert.ok(Number.isFinite(Date.parse(q.jobs[0].finishedAt)));assert.equal(q.paused,true);
});

test('recovery keeps transaction evidence, invokes only its runner, and never dispatches pending prompts',async()=>{
 let originalRuns=0,release;
 const q=new Queue({...base,jobs:[{id:'recover',prompt:'already sent',status:'interrupted',account:2,mayHaveSubmitted:true,submittedAt:'2026-01-01T00:00:00Z',resultReadyAt:'2026-01-01T00:00:05Z'},{id:'next',prompt:'not sent',status:'pending'}],run:async()=>{originalRuns++;return 'unexpected.mp4';}});
 const work=q.recover('recover',async(job,signal)=>{
  assert.equal(job.account,2);assert.equal(job.mayHaveSubmitted,true);assert.equal(job.submittedAt,'2026-01-01T00:00:00Z');assert.equal(job.resultReadyAt,'2026-01-01T00:00:05Z');
  assert.equal(job.stage,'confirming');assert.equal(signal.aborted,false);await new Promise(resolve=>release=resolve);return 'recovered.mp4';
 });
 await new Promise(resolve=>setImmediate(resolve));assert.equal(q.active,true);assert.equal(q.jobs[1].status,'pending');
 assert.throws(()=>q.recover('recover',async()=>''),/Chờ hoặc dừng/);
 release();await work;
 assert.equal(q.jobs[0].status,'completed');assert.equal(q.jobs[0].output,'recovered.mp4');assert.equal(q.jobs[1].status,'pending');assert.equal(originalRuns,0);assert.equal(q.active,false);
});

test('stop interrupts recovery immediately and leaves the original submission available for a later recovery',async()=>{
 const q=new Queue({...base,jobs:[{id:'recover',prompt:'already sent',status:'failed',mayHaveSubmitted:true,submittedAt:'2026-01-01T00:00:00Z'},{id:'next',status:'pending',prompt:'not sent'}],run:async()=>{throw Error('must not dispatch');}});
 let observedSignal;
 const work=q.recover('recover',async(_job,signal)=>{observedSignal=signal;await new Promise(()=>{});});
 await new Promise(resolve=>setImmediate(resolve));await q.stop();await work;
 assert.equal(observedSignal.aborted,true);assert.equal(q.jobs[0].status,'interrupted');assert.equal(q.jobs[0].stage,'interrupted');assert.equal(q.jobs[0].mayHaveSubmitted,true);
 assert.ok(Number.isFinite(Date.parse(q.jobs[0].finishedAt)));assert.equal(q.jobs[1].status,'pending');assert.equal(q.active,false);
});

test('recovery rejects unsent pending or completed jobs, and empty outputs never complete a job',async()=>{
 const q=new Queue({...base,jobs:[{id:'unsent',status:'failed',prompt:'unsent'},{id:'done',status:'completed',mayHaveSubmitted:true,output:'done.mp4'}],run:async()=>undefined});
 assert.throws(()=>q.recover('unsent',async()=>''),/Chưa có thông tin/);
 assert.throws(()=>q.recover('done',async()=>''),/tác vụ lỗi/);
 await q.add([{prompt:'new'}]);await q.start();assert.equal(q.jobs[2].status,'failed');assert.match(q.jobs[2].error,/Chưa xác nhận/);
});
