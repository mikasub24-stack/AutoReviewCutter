const{test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs/promises'),path=require('node:path'),os=require('node:os');
const{lockInput}=require('../src/locked-input.cjs');const{Queue}=require('../src/queue.cjs');
test('locked prompt and image bytes survive source edits; tampered cache is refused',async t=>{
 const dir=await fs.mkdtemp(path.join(os.tmpdir(),'muse-locked-'));t.after(()=>fs.rm(dir,{recursive:true,force:true}));const source=path.join(dir,'source.png');await fs.writeFile(source,'original image bytes');
 const job={prompt:'Original complete scene',references:[source]},locked=await lockInput(job,path.join(dir,'cache'));
 await fs.writeFile(source,'changed after queue started');job.prompt='edited later';assert.equal((await lockInput(job,path.join(dir,'cache'))).prompt,'Original complete scene');assert.equal(await fs.readFile(locked.references[0].path,'utf8'),'original image bytes');
 await fs.writeFile(locked.references[0].path,'tampered');await assert.rejects(lockInput(job,path.join(dir,'cache')),/bị thay đổi/);
});
test('bulk references cannot modify a locked paused task and resume keeps its account',async()=>{
 const q=new Queue({save:async()=>{},concurrency:2,jobs:[{id:'paused',status:'interrupted',prompt:'one',account:2,mayHaveSubmitted:true,lockedInput:{prompt:'one',references:[]},references:['old.png'],remoteStop:{state:'unavailable'}},{id:'new',status:'pending',prompt:'two',references:[]}],run:async(job,slot)=>{if(job.id==='paused'){assert.equal(slot,1);assert.equal(job.resumeMode,'resubmit');assert.equal(job.account,2);assert.deepEqual(job.references,['old.png']);}return job.id+'.mp4';}});
 q.prepareResume();await q.applyReferences(['replacement.png']);await q.start();assert.ok(q.jobs.every(j=>j.status==='completed'));
});
test('Continue resubmits unfinished scenes even when remote stop is uncertain',()=>{
 const q=new Queue({save:async()=>{},run:async()=>'',jobs:[{id:'a',status:'interrupted',account:1,mayHaveSubmitted:true,remoteStop:{state:'confirmed'}},{id:'b',status:'interrupted',account:2,mayHaveSubmitted:true,remoteStop:{state:'requested'}}]});q.prepareResume();assert.deepEqual(q.jobs.map(j=>j.resumeMode),['resubmit','resubmit']);
});

test('ten parallel scenes safely share one complete locked reference file',async t=>{
 const dir=await fs.mkdtemp(path.join(os.tmpdir(),'muse-shared-cache-'));t.after(()=>fs.rm(dir,{recursive:true,force:true}));const source=path.join(dir,'shared.png'),bytes=Buffer.alloc(1024*1024,7),cache=path.join(dir,'cache');await fs.writeFile(source,bytes);
 const inputs=await Promise.all(Array.from({length:10},(_,i)=>lockInput({prompt:'Scene '+i,references:[source]},cache)));
 assert.equal((await fs.readdir(cache)).length,1);assert.equal(new Set(inputs.map(i=>i.references[0].path)).size,1);assert.deepEqual(await fs.readFile(inputs[0].references[0].path),bytes);assert.equal(new Set(inputs.map(i=>i.promptHash)).size,10);
});
