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
