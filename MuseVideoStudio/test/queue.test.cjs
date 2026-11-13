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

test('Regenerate runs only the chosen completed scene and preserves previous video paths',async()=>{
 let release;const gate=new Promise(r=>release=r),ran=[];
 const q=new Queue({save:async()=>{},jobs:[{id:'done',status:'completed',prompt:'Original scene',number:1,account:2,output:'001.mp4',lockedInput:{prompt:'Original scene',references:[]}},{id:'kept',status:'completed',prompt:'Keep',output:'002.mp4'},{id:'pending',status:'pending',prompt:'Not selected'}],run:async(job,slot)=>{ran.push(job.id);assert.equal(slot,1);assert.equal(job.resumeMode,'resubmit');await gate;return '001 (2).mp4';}});
 const run=q.regenerate('done');await new Promise(r=>setImmediate(r));
 assert.equal(q.jobs[0].previousOutput,'001.mp4');assert.deepEqual(q.jobs[0].previousOutputs,['001.mp4']);assert.equal(q.jobs[0].status,'running');
 assert.throws(()=>q.regenerate('kept'),/Chờ/);release();await run;
 assert.deepEqual(ran,['done']);assert.equal(q.jobs[0].output,'001 (2).mp4');assert.equal(q.jobs[1].output,'002.mp4');assert.equal(q.jobs[2].status,'pending');
});

test('a failed Regenerate preserves previous output and never dispatches other scenes',async()=>{
 const q=new Queue({save:async()=>{},jobs:[{id:'done',status:'completed',prompt:'One scene',output:'old.mp4'},{id:'other',status:'completed',prompt:'Other scene',output:'other.mp4'},{id:'pending',status:'pending',prompt:'Later'}],run:async job=>{assert.equal(job.id,'done');throw Error('Generation failed');}});
 await q.regenerate('done');assert.equal(q.jobs[0].status,'failed');assert.equal(q.jobs[0].output,'');assert.equal(q.jobs[0].previousOutput,'old.mp4');assert.deepEqual(q.jobs[0].previousOutputs,['old.mp4']);assert.equal(q.jobs[1].status,'completed');assert.equal(q.jobs[1].output,'other.mp4');assert.equal(q.jobs[2].status,'pending');
});

test('image and video tabs share one queue but each start only runs its own kind',async()=>{
 const calls=[];
 const q=new Queue({save:async()=>{},run:async j=>{calls.push(j.kind+':'+j.prompt);return j.kind==='image'?j.prompt+'.png':j.prompt+'.mp4';}});
 await q.add([{prompt:'clip one'},{prompt:'clip two'}]);
 await q.add([{kind:'image',prompt:'pic one'},{kind:'image',prompt:'pic two'}]);
 assert.deepEqual(q.jobs.map(j=>j.kind),['video','video','image','image']);
 assert.deepEqual(q.jobs.map(j=>j.order),[1,2,1,2],'ảnh đánh số riêng, không nối tiếp số video');
 await q.start('image');
 assert.deepEqual(calls,['image:pic one','image:pic two']);
 assert.deepEqual(q.jobs.map(j=>j.status),['pending','pending','completed','completed']);
 assert.equal(q.jobs[2].stageMessage,'Đã lưu ảnh về máy');
 await q.start('video');
 assert.deepEqual(q.jobs.map(j=>j.status),['completed','completed','completed','completed']);
});
test('Continue for one tab never revives or reruns failed jobs of the other tab',async()=>{
 const calls=[];
 const q=new Queue({save:async()=>{},run:async j=>{calls.push(j.prompt);return 'x.png';},jobs:[
  {id:'v',kind:'video',status:'failed',prompt:'video failed',order:1,mayHaveSubmitted:true},
  {id:'i',kind:'image',status:'failed',prompt:'image failed',order:1,mayHaveSubmitted:true},
  {id:'old',status:'interrupted',prompt:'saved by an older version',order:2}]});
 assert.deepEqual(q.jobs.map(j=>j.kind),['video','image','video'],'việc cũ không có loại được coi là video');
 q.prepareResume('image');
 assert.deepEqual(q.jobs.map(j=>j.status),['failed','pending','interrupted']);
 await q.start('image');
 assert.deepEqual(calls,['image failed']);
 assert.deepEqual(q.jobs.map(j=>j.status),['failed','completed','interrupted']);
});
test('clearing one tab removes only that tab\'s pending scenes or list',async()=>{
 const q=new Queue({save:async()=>{},run:async()=>'x'});
 await q.add([{prompt:'video pending'}]);await q.add([{kind:'image',prompt:'image pending'},{kind:'image',prompt:'image two'}]);
 await q.clearPending('image');assert.deepEqual(q.jobs.map(j=>j.prompt),['video pending']);
 await q.add([{kind:'image',prompt:'image again'}]);
 await q.clearAll('video');assert.deepEqual(q.jobs.map(j=>j.prompt),['image again']);
 await q.clearAll();assert.equal(q.jobs.length,0);
});

// ---- Chế độ Mẹo vặt: mỗi bước = việc «ảnh» rồi việc «clip» làm từ chính ảnh đó ----
const tipJobs = (n, story = 'Truyen-tip') => [
  ...Array.from({ length: n }, (_, i) => ({ kind: 'story', storyId: story, phase: 'image', number: i + 1, prompt: 'ảnh ' + (i + 1) })),
  ...Array.from({ length: n }, (_, i) => ({ kind: 'story', storyId: story, phase: 'clip', dependsOn: 'image', number: i + 1, prompt: 'clip ' + (i + 1) }))
];
test('Mẹo vặt: clip chạy sau ảnh và nhận đúng ảnh của bước đó làm ảnh tham chiếu', async () => {
  const seen = [];
  const q = new Queue({ ...base, run: async j => { seen.push([j.phase, j.number, [...(j.references || [])]]); return j.phase === 'image' ? `C:/out/anh/00${j.number}.png` : `C:/out/00${j.number}.mp4`; } });
  await q.add(tipJobs(3)); await q.start('story');
  assert.deepEqual(seen.map(x => x.slice(0, 2)), [['image', 1], ['image', 2], ['image', 3], ['clip', 1], ['clip', 2], ['clip', 3]]);
  assert.deepEqual(seen.filter(x => x[0] === 'clip').map(x => x[2]), [['C:/out/anh/001.png'], ['C:/out/anh/002.png'], ['C:/out/anh/003.png']]);
  assert.deepEqual(seen.filter(x => x[0] === 'image').map(x => x[2]), [[], [], []]);
  assert.ok(q.jobs.every(j => j.status === 'completed'));
  assert.equal(q.jobs[3].image, 'C:/out/anh/001.png');
});
test('Mẹo vặt: ảnh lỗi thì dừng hẳn, không tạo clip nào (không tốn lượt video)', async () => {
  const ran = [];
  const q = new Queue({ ...base, run: async j => { ran.push(j.phase + j.number); if (j.phase === 'image' && j.number === 2) throw Error('Muse không tạo ảnh'); return j.phase === 'image' ? `a${j.number}.png` : `c${j.number}.mp4`; } });
  await q.add(tipJobs(3)); await q.start('story');
  assert.deepEqual(ran, ['image1', 'image2']);
  assert.deepEqual(q.jobs.map(j => j.status), ['completed', 'failed', 'pending', 'pending', 'pending', 'pending']);
  assert.equal(q.paused, true);
  // Tiếp tục: ảnh 2 làm lại, rồi mới đến các clip.
  q.run = async j => { ran.push(j.phase + j.number); return j.phase === 'image' ? `a${j.number}.png` : `c${j.number}.mp4`; };
  q.prepareResume('story'); await q.start('story');
  assert.deepEqual(ran.slice(2), ['image2', 'image3', 'clip1', 'clip2', 'clip3']);
  assert.ok(q.jobs.every(j => j.status === 'completed'));
});
test('Mẹo vặt: clip chưa có ảnh xong thì không bao giờ chạy (kể cả khi chỉ còn clip trong hàng đợi)', async () => {
  let ran = 0;
  const q = new Queue({ ...base, run: async () => { ran++; return 'x.mp4'; } });
  await q.add([{ kind: 'story', storyId: 'T', phase: 'clip', dependsOn: 'image', number: 1, prompt: 'clip 1' }]);
  await q.start('story');
  assert.equal(ran, 0); assert.equal(q.jobs[0].status, 'pending'); assert.equal(q.active, false);
});
test('Mẹo vặt: nhiều tài khoản song song — clip đợi ảnh đang tạo, không bao giờ chạy trước ảnh', async () => {
  const order = [], releases = new Map();
  const q = new Queue({ ...base, concurrency: 2, run: j => new Promise(resolve => { order.push('start ' + j.phase + j.number); releases.set(j.phase + j.number, () => { order.push('end ' + j.phase + j.number); resolve(j.phase === 'image' ? `a${j.number}.png` : `c${j.number}.mp4`); }); }) });
  q.gateWaitMs = 5;
  await q.add(tipJobs(1)); const running = q.start('story');
  await new Promise(r => setTimeout(r, 40));
  assert.deepEqual(order, ['start image1']);   // tài khoản thứ hai chờ, chưa gửi clip
  releases.get('image1')();
  await new Promise(r => setTimeout(r, 60));
  assert.deepEqual(order, ['start image1', 'end image1', 'start clip1']);
  releases.get('clip1')(); await running;
  assert.ok(q.jobs.every(j => j.status === 'completed'));
});
test('Mẹo vặt: song song mà ảnh lỗi thì tài khoản đang chờ clip dừng theo, không treo', async () => {
  const q = new Queue({ ...base, concurrency: 2, run: async j => { await new Promise(r => setTimeout(r, 20)); throw Error('hỏng'); } });
  q.gateWaitMs = 5;
  await q.add(tipJobs(1));
  await Promise.race([q.start('story'), new Promise((_, rej) => setTimeout(() => rej(Error('hàng đợi bị treo')), 2000))]);
  assert.deepEqual(q.jobs.map(j => j.status), ['failed', 'pending']); assert.equal(q.active, false);
});
test('Mẹo vặt: tạo lại ảnh rồi tạo lại clip thì clip dùng ảnh mới, không dùng bản đã khóa cũ', async () => {
  const seen = [];
  const q = new Queue({ ...base, run: async j => { seen.push([j.phase, [...(j.references || [])]]); return j.phase === 'image' ? `a${seen.length}.png` : `c${seen.length}.mp4`; } });
  await q.add(tipJobs(1)); await q.start('story');
  q.jobs[1].lockedInput = { prompt: 'clip 1', references: [{ path: 'locked-old.png' }] };
  await q.regenerate(q.jobs[0].id);                       // ảnh mới
  assert.equal(q.jobs[0].output, 'a3.png');
  await q.regenerate(q.jobs[1].id);                       // clip làm lại từ ảnh mới
  assert.deepEqual(seen.at(-1), ['clip', ['a3.png']]);
  assert.equal(q.jobs[1].lockedInput, undefined);
});
test('Mẹo vặt: việc ảnh/clip giữ nguyên phase và dependsOn khi lưu và nạp lại', async () => {
  const saved = [];
  const q = new Queue({ ...base, save: async jobs => saved.push(JSON.parse(JSON.stringify(jobs))), run: async () => 'x' });
  await q.add(tipJobs(1));
  const again = new Queue({ ...base, jobs: saved.at(-1), run: async () => 'x' });
  assert.deepEqual(again.jobs.map(j => [j.phase, j.dependsOn, j.number]), [['image', '', 1], ['clip', 'image', 1]]);
});
// ---- Nút riêng trên thẻ cảnh: «Dừng cảnh này» / «Tạo lại ngay» (1.6.8) ----
test('Dừng cảnh này: chỉ cảnh đó bị gián đoạn, hàng đợi KHÔNG tạm dừng, tab còn lại chạy tiếp các cảnh sau', async () => {
  const hung = []; const done = [];
  const q = new Queue({ ...base, concurrency: 2, run: async (j, slot, signal) => {
    if (j.prompt === 'stuck') return new Promise((_, rej) => signal.addEventListener('abort', () => rej(Object.assign(Error('x'), { name: 'AbortError' }))));
    hung.push(slot); await new Promise(r => setTimeout(r, 5)); done.push(j.prompt); return j.prompt + '.mp4';
  } });
  await q.add(['stuck', 'b', 'c', 'd'].map(prompt => ({ prompt })));
  const running = q.start();
  await new Promise(r => setTimeout(r, 30));
  const stuck = q.jobs[0]; assert.equal(stuck.status, 'running');
  await q.cancelJob(stuck.id, 'skip');
  await running;
  assert.equal(stuck.status, 'interrupted'); assert.match(stuck.error, /Đã dừng cảnh này/);
  assert.deepEqual(q.jobs.slice(1).map(j => j.status), ['completed', 'completed', 'completed']);
  assert.equal(q.active, false);
});
test('Dừng cảnh này: chỉ một worker chạy cảnh còn lại, nó dừng thì tab kia vẫn tiếp tục (không bị paused)', async () => {
  const q = new Queue({ ...base, concurrency: 2, run: async (j, slot, signal) => {
    if (j.prompt === 'stuck') return new Promise((_, rej) => signal.addEventListener('abort', () => rej(Object.assign(Error('x'), { name: 'AbortError' }))));
    await new Promise(r => setTimeout(r, 40)); return j.prompt + '.mp4';
  } });
  await q.add(['stuck', 'b', 'c'].map(prompt => ({ prompt })));
  const running = q.start(); await new Promise(r => setTimeout(r, 15));
  await q.cancelJob(q.jobs[0].id, 'skip');
  assert.equal(q.paused, false);
  await running;
  assert.deepEqual(q.jobs.map(j => j.status), ['interrupted', 'completed', 'completed']);
});
test('Tạo lại ngay: cảnh về hàng đợi và được gửi lại ngay (đúng 1 lần nữa), các cảnh khác không bị đụng', async () => {
  const calls = []; let first = true;
  const q = new Queue({ ...base, concurrency: 2, run: async (j, slot, signal) => {
    calls.push(j.prompt);
    if (j.prompt === 'stuck' && first) { first = false; return new Promise((_, rej) => signal.addEventListener('abort', () => rej(Object.assign(Error('x'), { name: 'AbortError' })))); }
    await new Promise(r => setTimeout(r, 5)); return j.prompt + '.mp4';
  } });
  await q.add(['stuck', 'b', 'c'].map(prompt => ({ prompt })));
  const running = q.start(); await new Promise(r => setTimeout(r, 20));
  const id = q.jobs[0].id; q.jobs[0].mayHaveSubmitted = true; q.jobs[0].late = true;
  await q.cancelJob(id, 'again');
  await running;
  assert.deepEqual(q.jobs.map(j => j.status), ['completed', 'completed', 'completed']);
  assert.equal(calls.filter(p => p === 'stuck').length, 2);
  assert.equal(calls.filter(p => p === 'b').length, 1); assert.equal(calls.filter(p => p === 'c').length, 1);
  assert.equal(q.jobs[0].late, undefined); assert.equal(q.jobs[0].error, '');
});
test('Thử TK khác: cảnh kẹt ở TK 1 (hết lượt) được gửi sang TK 2 dù TK 2 đã rảnh từ lâu, không quay lại TK 1', async () => {
  const calls = [];
  const q = new Queue({ ...base, concurrency: 2, run: async (j, slot, signal) => {
    calls.push([j.prompt, slot, j.account]);
    if (slot === 0) return new Promise((_, rej) => signal.addEventListener('abort', () => rej(Object.assign(Error('x'), { name: 'AbortError' }))));
    await new Promise(r => setTimeout(r, 5)); return j.prompt + '.mp4';
  } });
  await q.add([{ prompt: 'stuck' }]);
  const running = q.start(); await new Promise(r => setTimeout(r, 40));
  const job = q.jobs[0]; assert.equal(job.status, 'running'); job.account = 1; job.mayHaveSubmitted = true; job.late = true;
  await q.cancelJob(job.id, 'other');
  assert.equal(q.paused, false);
  await running;
  assert.equal(job.status, 'completed');
  assert.deepEqual(calls.map(c => c[1]), [0, 1], 'lần hai chạy ở slot 1 (TK 2)');
  assert.equal(job.avoidAccounts, undefined, 'xong thì xóa danh sách tránh');
  assert.equal(job.error, ''); assert.equal(q.active, false);
});
test('Thử TK khác: cảnh khác vẫn chạy bình thường; khi đã tránh hết mọi tài khoản thì thử lại từ đầu; 1 tài khoản thì không kẹt', async () => {
  const q = new Queue({ ...base, concurrency: 2, run: async () => 'ok.mp4' });
  const job = { avoidAccounts: [1] };
  assert.equal(q.avoids(job, 0), true); assert.equal(q.avoids(job, 1), false);
  assert.equal(q.avoids({ avoidAccounts: [1, 2] }, 0), false, 'tránh hết thì bỏ qua');
  assert.equal(q.avoids({ avoidAccounts: [1, 2] }, 1), false);
  assert.equal(q.avoids({}, 0), false);
  const one = new Queue({ ...base, concurrency: 1, run: async () => 'ok.mp4' });
  assert.equal(one.avoids({ avoidAccounts: [1] }, 0), false, 'chỉ 1 tài khoản: không có chỗ khác để chuyển');
  const slots = [];
  const two = new Queue({ ...base, concurrency: 2, run: async (j, slot, signal) => {
    slots.push([j.prompt, slot]);
    if (j.prompt === 'stuck' && slot === 1 && slots.filter(x => x[0] === 'stuck').length === 1) return new Promise((_, rej) => signal.addEventListener('abort', () => rej(Object.assign(Error('x'), { name: 'AbortError' }))));
    await new Promise(r => setTimeout(r, 20)); return j.prompt + '.mp4';
  } });
  await two.add(['a', 'stuck', 'b', 'c'].map(prompt => ({ prompt })));
  const run2 = two.start(); await new Promise(r => setTimeout(r, 10));
  const stuck = two.jobs.find(j => j.prompt === 'stuck'); stuck.account = 2;
  await two.cancelJob(stuck.id, 'other');
  await run2;
  assert.deepEqual(two.jobs.map(j => j.status), ['completed', 'completed', 'completed', 'completed']);
  assert.deepEqual(slots.filter(x => x[0] === 'stuck').map(x => x[1]), [1, 0], 'kẹt ở TK 2 thì lần sau sang TK 1');
});
test('Tải video lên: cảnh chưa xong thành «đã xong» với file người dùng chọn, không gửi gì tới Muse; cảnh đang chạy / đã xong / ảnh bị từ chối', async () => {
  const ran = [];
  const q = new Queue({ ...base, concurrency: 1, run: async j => { ran.push(j.prompt); return j.prompt + '.mp4'; } });
  await q.add([{ prompt: 'a', kind: 'story', number: 1 }, { prompt: 'b', kind: 'story', number: 2 }]);
  const [a, b] = q.jobs;
  Object.assign(a, { status: 'interrupted', error: 'hết lượt', resumeMode: 'resubmit', avoidAccounts: [1], late: true, account: 1, mayHaveSubmitted: true });
  await q.attachManual(a.id, 'C:/Videos/KeChuyen/001.mp4');
  assert.equal(a.status, 'completed'); assert.equal(a.output, 'C:/Videos/KeChuyen/001.mp4'); assert.deepEqual(a.outputs, ['C:/Videos/KeChuyen/001.mp4']);
  assert.equal(a.error, ''); assert.equal(a.progress, 100); assert.equal(a.manual, true);
  assert.equal(a.resumeMode, undefined); assert.equal(a.avoidAccounts, undefined); assert.equal(a.late, undefined);
  await assert.rejects(() => q.attachManual(a.id, 'x.mp4'), /đã có video/);
  await assert.rejects(() => q.attachManual('khong-co', 'x.mp4'), /Chỉ thêm video/);
  b.status = 'running';
  await assert.rejects(() => q.attachManual(b.id, 'x.mp4'), /Dừng cảnh này trước/);
  b.status = 'pending';
  await assert.rejects(() => q.attachManual(b.id, ''), /Thiếu đường dẫn/);
  await q.attachManual(b.id, 'C:/Videos/KeChuyen/002.mp4');
  await q.start(); assert.deepEqual(ran, [], 'cảnh đã có video thủ công không bị chạy lại');
  const photo = new Queue({ ...base, concurrency: 1, run: async () => 'x' });
  await photo.add([{ prompt: 'i', kind: 'image' }]);
  await assert.rejects(() => photo.attachManual(photo.jobs[0].id, 'x.png'), /Chỉ thêm video/);
});
test('removeFinishedStories: chỉ bỏ truyện đã xong hết, giữ truyện còn dở / chưa có / loại khác', async () => {
  let saved = 0;
  const q = new Queue({ ...base, save: async () => { saved++; }, concurrency: 1, run: async () => 'x' });
  await q.add([
    { prompt: 'a1', kind: 'story', storyId: 'Xong', number: 1 }, { prompt: 'a2', kind: 'story', storyId: 'Xong', number: 2 },
    { prompt: 'b1', kind: 'story', storyId: 'Do', number: 1 }, { prompt: 'b2', kind: 'story', storyId: 'Do', number: 2 },
    { prompt: 'c1', kind: 'video', storyId: 'Xong' }, { prompt: 'solo' }]);
  for (const j of q.jobs.filter(j => j.storyId === 'Xong' && j.kind === 'story')) j.status = 'completed';
  q.jobs.find(j => j.prompt === 'b1').status = 'completed';
  const n = saved;
  assert.equal(await q.removeFinishedStories(['Do', 'khong-co']), 0, 'còn một cảnh chưa xong → giữ nguyên'); assert.equal(saved, n, 'không đổi gì thì không lưu');
  assert.equal(await q.removeFinishedStories(['Xong']), 2); assert.ok(saved > n);
  assert.deepEqual(q.jobs.map(j => j.prompt).sort(), ['b1', 'b2', 'c1', 'solo'], 'chỉ bỏ cảnh kể chuyện của truyện đã xong');
  assert.equal(await q.removeFinishedStories([]), 0);
});
test('Sửa prompt: cảnh chờ / lỗi đổi prompt và bản đã khóa, bỏ dấu vết gửi cũ; cảnh đang chạy sửa qua «gửi lại ngay»; cảnh xong và prompt rỗng bị từ chối', async () => {
  const sent = []; let first = true;
  const q = new Queue({ ...base, concurrency: 1, run: async (j, slot, signal) => {
    sent.push((j.lockedInput || j).prompt);
    if (first) { first = false; return new Promise((_, rej) => signal.addEventListener('abort', () => rej(Object.assign(Error('x'), { name: 'AbortError' })))); }
    return 'ok.mp4';
  } });
  await q.add([{ prompt: 'cũ', kind: 'story', number: 1 }, { prompt: 'khác', kind: 'story', number: 2 }, { prompt: 'xong', kind: 'story', number: 3 }]);
  const [a, b, c] = q.jobs;
  // chờ chạy: đổi prompt, cắt khoảng trắng; giống bản cũ thì không làm gì
  assert.equal(await q.editPrompt(b.id, '  mới  '), true); assert.equal(b.prompt, 'mới'); assert.equal(await q.editPrompt(b.id, 'mới'), false);
  await assert.rejects(() => q.editPrompt(b.id, '   '), /không được để trống/);
  await assert.rejects(() => q.editPrompt(b.id, 'x'.repeat(20001)), /quá dài/);
  await assert.rejects(() => q.editPrompt('khong-co', 'x'), /Không tìm thấy/);
  // lỗi đã từng gửi + đã khóa: prompt, bản khóa đổi cùng nhau (ảnh tham chiếu giữ), dấu vết gửi cũ bị bỏ, vẫn «lỗi» chờ bấm Gửi lại
  Object.assign(b, { status: 'failed', stage: 'failed', error: 'blocked', mayHaveSubmitted: true, submittedAt: 'x', resumeMode: 'recover', lockedInput: { prompt: 'mới', promptHash: 'h', references: [{ path: 'r.png', sha256: 's', name: 'r.png' }], lockedAt: 't' } });
  assert.equal(await q.editPrompt(b.id, 'an toàn'), true);
  assert.equal(b.prompt, 'an toàn'); assert.equal(b.lockedInput.prompt, 'an toàn'); assert.notEqual(b.lockedInput.promptHash, 'h'); assert.deepEqual(b.lockedInput.references.map(r => r.path), ['r.png']);
  assert.equal(b.mayHaveSubmitted, false); assert.equal(b.submittedAt, null); assert.equal(b.resumeMode, undefined); assert.equal(b.status, 'failed'); assert.match(b.error, /Đã sửa prompt/);
  await q.retry(b.id); assert.equal(b.status, 'pending');
  c.status = 'completed'; await assert.rejects(() => q.editPrompt(c.id, 'x'), /đã xong/); c.status = 'pending';
  // đang chạy: sửa trực tiếp bị từ chối; qua cancelJob(…,'again',…,prompt) thì dừng rồi gửi lại ĐÚNG prompt mới (kể cả bản đã khóa)
  const running = q.start(); await new Promise(r => setTimeout(r, 20));
  assert.equal(a.status, 'running'); await assert.rejects(() => q.editPrompt(a.id, 'x'), /đang chạy/);
  a.lockedInput = { prompt: 'cũ', promptHash: 'h', references: [], lockedAt: 't' };
  await q.cancelJob(a.id, 'again', null, '  sửa khi chạy  ');
  await running;
  assert.equal(a.prompt, 'sửa khi chạy'); assert.equal(a.lockedInput.prompt, 'sửa khi chạy');
  assert.equal(sent[0], 'cũ'); assert.equal(sent.at(-1) !== 'cũ', true); assert.ok(sent.includes('sửa khi chạy'), 'lần gửi lại dùng prompt mới: ' + sent);
  assert.equal(a.status, 'completed');
});
test('Dừng / Tạo lại riêng cảnh: đợi lệnh dừng trong Muse xong rồi mới trả chỗ cho lượt gửi sau', async () => {
  const order = []; let first = true;
  const q = new Queue({ ...base, concurrency: 1, run: async (j, slot, signal) => {
    order.push('run:' + j.prompt);
    if (first) { first = false; return new Promise((_, rej) => signal.addEventListener('abort', () => rej(Object.assign(Error('x'), { name: 'AbortError' })))); }
    return 'ok.mp4';
  } });
  await q.add([{ prompt: 'one' }]);
  const running = q.start(); await new Promise(r => setTimeout(r, 15));
  const hold = new Promise(r => setTimeout(() => { order.push('muse-stopped'); r(); }, 60));
  await q.cancelJob(q.jobs[0].id, 'again', hold);
  await running;
  assert.deepEqual(order, ['run:one', 'muse-stopped', 'run:one']);
  assert.equal(q.jobs[0].status, 'completed');
});
test('cancelJob từ chối cảnh không đang chạy; «Dừng» toàn hàng đợi vẫn tạm dừng như cũ', async () => {
  const q = new Queue({ ...base, run: (j, s, signal) => new Promise((_, rej) => signal.addEventListener('abort', () => rej(Object.assign(Error('x'), { name: 'AbortError' })))) });
  await q.add([{ prompt: 'a' }, { prompt: 'b' }]);
  await assert.rejects(q.cancelJob(q.jobs[0].id, 'skip'), /không còn đang chạy/);
  const running = q.start(); await new Promise(r => setTimeout(r, 15));
  await q.stop(); await running;
  assert.equal(q.paused, true); assert.deepEqual(q.jobs.map(j => j.status), ['interrupted', 'pending']);
});
test('holdJob: dừng cảnh đang chờ → «Đã dừng», hàng đợi bỏ qua, các cảnh khác chạy; sửa prompt + gửi lại thì chạy lại sau', async () => {
  const ran = [];
  const q = new Queue({ ...base, run: async j => { ran.push(j.prompt); return '/out/' + j.prompt + '.mp4'; } });
  await q.add([{ prompt: 'a' }, { prompt: 'b' }, { prompt: 'c' }]);
  const b = q.jobs[1];
  await q.holdJob(b.id);
  assert.equal(b.status, 'interrupted'); assert.match(b.error, /Đã dừng/);
  await assert.rejects(q.holdJob(b.id), /Chỉ dừng được cảnh đang chờ/);
  await q.start();
  assert.deepEqual(ran, ['a', 'c'], 'cảnh đã dừng không chạy');
  assert.deepEqual(q.jobs.map(j => j.status), ['completed', 'interrupted', 'completed']);
  await q.editPrompt(b.id, 'b sửa'); await q.retry(b.id);
  await q.start();
  assert.deepEqual(ran, ['a', 'c', 'b sửa']); assert.equal(b.status, 'completed');
  await assert.rejects(q.holdJob(b.id), /Chỉ dừng được cảnh đang chờ/);
});
test('10 trình duyệt chạy song song: dừng / tạo lại MỘT cảnh kẹt không ảnh hưởng 9 tab còn lại', async () => {
  const slotsSeen = new Set(); let stuckSlot = -1;
  const q = new Queue({ ...base, concurrency: 10, run: async (j, slot, signal) => {
    slotsSeen.add(slot);
    if (j.prompt === 'stuck') { stuckSlot = slot; return new Promise((_, rej) => signal.addEventListener('abort', () => rej(Object.assign(Error('x'), { name: 'AbortError' })))); }
    await new Promise(r => setTimeout(r, 25)); return j.prompt + '.mp4';
  } });
  await q.add(['a', 'b', 'stuck', 'c', 'd', 'e', 'f', 'g', 'h', 'i', 'j', 'k', 'l', 'm', 'n', 'o', 'p', 'q', 'r', 's'].map(prompt => ({ prompt })));
  const running = q.start(); await new Promise(r => setTimeout(r, 12));
  assert.equal(q.jobs.filter(j => j.status === 'running').length, 10);
  await q.cancelJob(q.jobs[2].id, 'skip');
  await running;
  assert.equal(slotsSeen.size, 10);
  assert.equal(q.jobs[2].status, 'interrupted');
  assert.equal(q.jobs.filter(j => j.status === 'completed').length, 19);
  assert.equal(q.paused, false);
});
// ---- Tab «Dọn nhà · Sinh tồn»: cảnh nối cảnh, mỗi cảnh bắt đầu từ KHUNG CUỐI THẬT của cảnh trước ----
const chain = (storyId, photo, n = 3) => {
  const items = [];
  if (!photo) items.push({ kind: 'restore', storyId, phase: 'image', number: 1, prompt: 'base', references: [] });
  for (let k = 1; k <= n; k++) items.push({
    kind: 'restore', storyId, phase: 'clip', number: k, prompt: 'clip' + k,
    needs: k === 1 ? (photo ? [] : [{ phase: 'image', number: 1 }]) : [{ phase: 'clip', number: k - 1 }],
    refList: k === 1 ? [photo ? { file: photo } : { phase: 'image', number: 1 }] : [{ phase: 'clip', number: k - 1, part: 'lastFrame' }]
  });
  return items;
};
test('restore: cảnh k chỉ chạy sau cảnh k-1 và nhận khung cuối của nó làm ảnh đầu (kể cả khi chạy 3 trình duyệt)', async () => {
  const seen = []; let running = 0, maxRunning = 0;
  const q = new Queue({ ...base, concurrency: 3, run: async j => {
    running++; maxRunning = Math.max(maxRunning, running);
    seen.push({ p: j.prompt, refs: [...j.references] });
    await new Promise(r => setTimeout(r, 15)); running--;
    if (j.phase === 'clip') j.lastFrame = `/f/${j.number}-cuoi.png`;
    return j.phase === 'image' ? '/a/001.png' : `/v/00${j.number}.mp4`;
  } });
  await q.add(chain('S1', ''));
  await q.start('restore');
  assert.deepEqual(seen.map(x => x.p), ['base', 'clip1', 'clip2', 'clip3']);
  assert.equal(maxRunning, 1, 'chuỗi nối tiếp: không bao giờ hai cảnh của cùng một truyện chạy cùng lúc');
  assert.deepEqual(seen.map(x => x.refs), [[], ['/a/001.png'], ['/f/1-cuoi.png'], ['/f/2-cuoi.png']]);
  assert.ok(q.jobs.every(j => j.status === 'completed'));
});
test('restore: có ảnh gốc của người dùng thì cảnh 1 dùng đúng tệp đó; hai truyện chạy song song', async () => {
  const seen = {}; let running = 0, maxRunning = 0;
  const q = new Queue({ ...base, concurrency: 2, run: async j => {
    running++; maxRunning = Math.max(maxRunning, running);
    (seen[j.storyId] ||= []).push(j.references[0]);
    await new Promise(r => setTimeout(r, 20)); running--;
    j.lastFrame = `/f/${j.storyId}${j.number}.png`; return `/v/${j.storyId}${j.number}.mp4`;
  } });
  await q.add([...chain('A', '/p/a.png', 2), ...chain('B', '/p/b.png', 2)]);
  await q.start('restore');
  assert.deepEqual(seen.A, ['/p/a.png', '/f/A1.png']); assert.deepEqual(seen.B, ['/p/b.png', '/f/B1.png']);
  assert.equal(maxRunning, 2, 'hai truyện khác nhau dùng được hai trình duyệt');
});
test('restore: cảnh giữa chuỗi lỗi thì cảnh sau KHÔNG chạy; thiếu khung cuối cũng không chạy', async () => {
  let calls = [];
  const q = new Queue({ ...base, concurrency: 2, run: async j => { calls.push(j.prompt); if (j.prompt === 'clip2') throw Error('hết lượt'); j.lastFrame = '/f.png'; return '/v.mp4'; } });
  await q.add(chain('S2', '/p.png', 3));
  await q.start('restore');
  assert.deepEqual(calls, ['clip1', 'clip2']);
  assert.deepEqual(q.jobs.map(j => j.status), ['completed', 'failed', 'pending']);
  const q2 = new Queue({ ...base, run: async j => '/v.mp4' });   // không ai ghi lastFrame
  await q2.add(chain('S3', '/p.png', 2)); await q2.start('restore');
  assert.deepEqual(q2.jobs.map(j => j.status), ['completed', 'pending'], 'không có khung cuối thì cảnh sau bị chặn, không gửi ảnh sai');
});
test('restore: tab khác không chạy việc của restore; applyReferences không đụng cảnh restore; dữ liệu needs/refList được lọc', async () => {
  const q = new Queue({ ...base, run: async () => '/x.mp4' });
  await q.add([...chain('S4', '/p.png', 1), { prompt: 'video thường' }]);
  await q.applyReferences(['/shared.png']);
  assert.deepEqual(q.jobs[0].references, [], 'cảnh restore giữ ảnh riêng');
  assert.equal(q.jobs[1].image, '/shared.png');
  await q.start('video');
  assert.deepEqual(q.jobs.map(j => j.status), ['pending', 'completed']);
  const q3 = new Queue({ ...base, run: async () => '/x' });
  await q3.add([{ kind: 'restore', storyId: 'Z', phase: 'clip', number: 1, prompt: 'p', needs: [{ phase: 'hack', number: 1 }, { phase: 'clip', number: 'x' }, null, { phase: 'clip', number: 2 }], refList: [{ file: '' }, { phase: 'clip', number: 2, part: 'zzz' }, { evil: 1 }] }]);
  assert.deepEqual(q3.jobs[0].needs, [{ phase: 'clip', number: 2 }]); assert.deepEqual(q3.jobs[0].refList, [{ phase: 'clip', number: 2 }]);
});

// ---- Tab «Dọn nhà · Sinh tồn»: tài khoản hết hạn mức thì cảnh tự chuyển sang tài khoản khác ----
const solo = (storyId, n = 3) => Array.from({ length: n }, (_, k) => ({ kind: 'restore', storyId, phase: 'clip', number: k + 1, prompt: `${storyId}-${k + 1}`, needs: k ? [{ phase: 'clip', number: k }] : [], refList: k ? [{ phase: 'clip', number: k, part: 'lastFrame' }] : [{ file: '/p.png' }] }));
test('restore: tài khoản 1 báo hết hạn mức → cảnh chuyển sang tài khoản khác, tài khoản 1 nghỉ, hàng đợi không dừng', async () => {
  const used = [];
  let limited = false;
  const q = new Queue({ ...base, concurrency: 2, accounts: 2, gateWaitMs: 5, run: async (j, slot) => {
    j.account = slot + 1; used.push([j.prompt, slot + 1]);
    await new Promise(r => setTimeout(r, 10));
    if (slot === 0 && !limited) { limited = true; throw Error('You have reached your daily limit for video generation.'); }
    j.lastFrame = `/f/${j.prompt}.png`; return `/v/${j.prompt}.mp4`;
  } });
  await q.add([...solo('A'), ...solo('B')]);
  await q.start('restore');
  assert.ok(q.jobs.every(j => j.status === 'completed'), q.jobs.map(j => j.status).join());
  assert.equal(q.paused, false, 'không tạm dừng khi còn tài khoản khác');
  const failedJob = q.jobs.find(j => j.quotaMoves);
  assert.ok(failedJob && failedJob.quotaMoves === 1);
  assert.deepEqual(failedJob.avoidAccounts === undefined ? [] : failedJob.avoidAccounts, [], 'xong thì bỏ danh sách tránh');
  assert.equal(q.isExhausted(1), true, 'tài khoản 1 đang nghỉ');
  const after = used.slice(used.findIndex(([, a], i) => a === 1 && i >= 0) + 1);
  assert.ok(after.every(([, a]) => a === 2), 'sau khi hết hạn mức chỉ tài khoản 2 chạy: ' + JSON.stringify(used));
});
test('restore: mọi tài khoản hết hạn mức → tạm dừng, cảnh vẫn «đang chờ», có giờ hết nghỉ; bấm chạy tay thì thử lại', async () => {
  let blocked = true; const used = [];
  const q = new Queue({ ...base, concurrency: 2, accounts: 2, gateWaitMs: 5, run: async (j, slot) => {
    j.account = slot + 1; used.push(slot + 1);
    await new Promise(r => setTimeout(r, 5));
    if (blocked) throw Error('Hết hạn mức tạo video hôm nay, quay lại vào ngày mai.');
    j.lastFrame = '/f.png'; return '/v/' + j.prompt + '.mp4';
  } });
  await q.add([...solo('A', 2), ...solo('B', 2)]);
  await q.start('restore');
  assert.equal(q.paused, true);
  assert.ok(q.allExhausted());
  assert.ok(q.jobs.filter(j => j.status === 'pending').length >= 2 && !q.jobs.some(j => j.status === 'failed'), q.jobs.map(j => j.status).join());
  assert.ok(q.nextExhaustedAt() > Date.now() + 3600 * 1000);
  assert.ok(q.jobs.some(j => /Mọi tài khoản đã hết hạn mức/.test(j.stageMessage)), 'có dòng báo mọi tài khoản đã hết hạn mức');
  blocked = false; q.exhausted.clear();   // người dùng bấm chạy tay
  await q.start('restore');
  assert.ok(q.jobs.every(j => j.status === 'completed'));
});
test('restore: lỗi thường (không phải hết hạn mức) vẫn dừng hàng đợi như cũ; tab khác không bao giờ tự chuyển tài khoản', async () => {
  const q = new Queue({ ...base, concurrency: 2, accounts: 2, run: async j => { j.account = 1; throw Error('Mạng bị ngắt.'); } });
  await q.add(solo('A', 1));
  await q.start('restore');
  assert.equal(q.jobs[0].status, 'failed'); assert.equal(q.paused, true); assert.equal(q.exhausted.size, 0);
  const v = new Queue({ ...base, concurrency: 2, accounts: 2, run: async j => { j.account = 1; throw Error('Daily limit reached'); } });
  await v.add([{ kind: 'video', prompt: 'v1' }]);
  await v.start('video');
  assert.equal(v.jobs[0].status, 'failed', 'tab Video giữ hành vi cũ');
  assert.equal(v.exhausted.size, 0);
});

test('add giữ nhãn provider «flow» và tỉ lệ khung hình của cảnh (không giữ giá trị lạ)', async () => {
  const q = new Queue({ ...base });
  await q.add([
    { kind: 'restore', storyId: 'S', phase: 'clip', number: 1, prompt: 'a', provider: 'flow', aspect: '9:16' },
    { kind: 'restore', storyId: 'S', phase: 'clip', number: 2, prompt: 'b', provider: 'evil', aspect: 'x' },
    { kind: 'restore', storyId: 'S', phase: 'clip', number: 3, prompt: 'c' }
  ]);
  assert.deepEqual(q.jobs.map(j => [j.provider, j.aspect]), [['flow', '9:16'], [undefined, undefined], [undefined, undefined]]);
});

test('restore: cảnh dở gắn với tài khoản đang nghỉ (hết hạn mức) được tài khoản khác nhận, không kẹt chờ', async () => {
  const ran = [];
  const q = new Queue({ ...base, concurrency: 3, accounts: 3, gateWaitMs: 5, run: async (j, slot) => { ran.push([j.number, slot + 1]); j.lastFrame = '/f.png'; return `/v/${j.number}.mp4`; } });
  await q.add([
    { kind: 'restore', storyId: 'S', phase: 'clip', number: 1, prompt: 'a' },
    { kind: 'restore', storyId: 'S', phase: 'clip', number: 2, prompt: 'b' }
  ]);
  Object.assign(q.jobs[0], { account: 1, resumeMode: 'resubmit' });
  q.exhausted.set(1, Date.now() + 3600000);
  await q.start('restore');
  assert.ok(q.jobs.every(j => j.status === 'completed'), 'không kẹt');
  assert.ok(ran.every(([, account]) => account !== 1), 'tài khoản 1 đang nghỉ nên không chạy');
});

test('video tạo lúc 3 tài khoản, giờ chạy 5 trình duyệt: chia lại phần chưa làm rồi chạy đủ 5 cảnh cùng lúc, xong hết, đúng thứ tự nối', async () => {
  const P = require('../src/restore-plan.js');
  const cfg = P.options({ theme: 'house_full', minutes: 15, seconds: 8 });
  const q = new Queue({ ...base, concurrency: 5, accounts: 5, gateWaitMs: 2, run: async (j, slot) => {
    j.account = slot + 1; running++; max = Math.max(max, running);
    await new Promise(r => setTimeout(r, 3));
    running--; order.push(j);
    if (j.phase === 'clip') j.lastFrame = `/f/${j.number}.png`;
    return j.phase === 'image' ? `/i/${j.number}.png` : `/v/${j.number}.mp4`;
  } });
  let running = 0, max = 0; const order = [];
  await q.add(P.buildJobs(cfg, { storyId: 'S', photo: '/p.jpg', accounts: 3 }));
  const clips = q.jobs.filter(j => j.phase === 'clip');
  q.jobs.filter(j => j.phase === 'image').forEach(j => Object.assign(j, { status: 'completed', output: `/i/${j.number}.png` }));
  clips.slice(0, 13).forEach(j => Object.assign(j, { status: 'completed', output: `/v/${j.number}.mp4`, lastFrame: `/f/${j.number}.png` }));
  Object.assign(clips[13], { status: 'interrupted', account: 2 });   // đang chạy thì bấm Dừng
  const plan = P.resegment(q.jobs, 5);
  assert.ok(plan && plan.images.length === 2);
  for (const ch of plan.changes) Object.assign(q.jobs.find(j => j.number === ch.number && j.phase === 'clip'), { needs: ch.needs, refList: ch.refList, prompt: ch.prompt });
  await q.add(plan.images);
  q.prepareResume('restore');
  await q.start('restore');
  assert.ok(q.jobs.every(j => j.status === 'completed'), 'xong hết: ' + JSON.stringify(q.jobs.filter(j => j.status !== 'completed').map(j => j.phase + j.number + ':' + j.status)));
  assert.equal(max, 5, 'đủ 5 cảnh chạy cùng lúc');
  const at = j => order.indexOf(j);
  for (const j of q.jobs.filter(x => x.phase === 'clip' && x.number > 1)) {
    const need = j.needs[0], dep = q.jobs.find(d => d.phase === need.phase && d.number === need.number);
    if (!j.startedAt || at(j) < 0) continue;        // cảnh đã xong từ trước thì không chạy lại
    assert.ok(at(dep) < 0 || at(dep) < at(j), `cảnh ${j.number} chạy sau việc nó cần`);
  }
});

test('xoay vòng ô rảnh: đoạn khác đã xong mà một chuỗi còn dài thì chia nốt phần còn lại cho các ô rảnh, vẫn đúng thứ tự nối', async () => {
  const P = require('../src/restore-plan.js');
  const cfg = P.options({ theme: 'house_full', minutes: 15, seconds: 8 });
  let running = 0, max = 0; const order = [];
  const q = new Queue({ ...base, concurrency: 5, accounts: 5, gateWaitMs: 2, run: async (j, slot) => {
    j.account = slot + 1; running++; max = Math.max(max, running);
    await new Promise(r => setTimeout(r, 4));
    running--; order.push(j);
    if (j.phase === 'clip') j.lastFrame = `/f/${j.number}.png`;
    return j.phase === 'image' ? `/i/${j.number}.png` : `/v/${j.number}.mp4`;
  } });
  await q.add(P.buildJobs(cfg, { storyId: 'S', photo: '/p.jpg', accounts: 2 }));   // 2 đoạn: #1–#57 và #58–#113
  const clips = q.jobs.filter(j => j.phase === 'clip');
  q.jobs.filter(j => j.phase === 'image').forEach(j => Object.assign(j, { status: 'completed', output: `/i/${j.number}.png` }));
  clips.slice(0, 20).concat(clips.slice(57)).forEach(j => Object.assign(j, { status: 'completed', output: `/v/${j.number}.mp4`, lastFrame: `/f/${j.number}.png` }));   // đoạn 2 xong hết, đoạn 1 còn 37 cảnh nối tiếp
  let splits = 0;
  const rebalancer = setInterval(async () => {
    if (!q.active || q.paused) return;
    const list = q.jobs.filter(j => j.storyId === 'S');
    const plan = P.resegment(list, 5);
    if (!plan) return;
    for (const ch of plan.changes) Object.assign(q.jobs.find(j => j.id === ch.id), { needs: ch.needs, refList: ch.refList, prompt: ch.prompt });
    splits += plan.images.length;
    await q.add(plan.images);
  }, 3);
  await q.start('restore');
  clearInterval(rebalancer);
  assert.ok(q.jobs.every(j => j.status === 'completed'), 'xong hết');
  assert.ok(splits >= 2, 'đã chia nốt phần còn lại: ' + splits);
  assert.ok(max >= 3, 'có ít nhất 3 ô cùng làm: ' + max);
  const at = j => order.indexOf(j);
  for (const j of q.jobs.filter(x => x.phase === 'clip' && at(x) >= 0)) {
    const need = j.needs[0], dep = q.jobs.find(d => d.phase === need.phase && d.number === need.number);
    assert.ok(at(dep) < 0 || at(dep) < at(j), `cảnh ${j.number} chạy sau việc nó cần`);
  }
});
