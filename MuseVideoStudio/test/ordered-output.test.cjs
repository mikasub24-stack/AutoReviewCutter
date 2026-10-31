const{test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs/promises'),os=require('node:os'),path=require('node:path');
const{saveOrderedOutput,sceneNumber}=require('../src/ordered-output.cjs'),{Queue}=require('../src/queue.cjs');
test('parallel results keep prompt numbers regardless of completion order and preserve existing files',async t=>{
 const dir=await fs.mkdtemp(path.join(os.tmpdir(),'muse-numbered-'));t.after(()=>fs.rm(dir,{recursive:true,force:true}));
 const first=path.join(dir,'one.part'),second=path.join(dir,'two.part');await fs.writeFile(first,'scene one');await fs.writeFile(second,'scene two');
 const two=await saveOrderedOutput(second,dir,{number:2},'.mp4'),one=await saveOrderedOutput(first,dir,{number:1},'.mp4');assert.equal(path.basename(two),'002.mp4');assert.equal(path.basename(one),'001.mp4');
 await fs.writeFile(first,'new attempt');const duplicate=await saveOrderedOutput(first,dir,{number:1},'.mp4');assert.equal(path.basename(duplicate),'001 (2).mp4');assert.equal(await fs.readFile(one,'utf8'),'scene one');assert.equal(await fs.readFile(duplicate,'utf8'),'new attempt');
});
test('unnumbered scenes retain their order after deletion and app restart',async()=>{
 const q=new Queue({save:async()=>{},run:async()=>''});await q.add([{prompt:'a'},{prompt:'b'}]);await q.remove(q.jobs[0].id);const restored=new Queue({jobs:q.jobs,save:async()=>{},run:async()=>''});await restored.add([{prompt:'c'}]);assert.deepEqual(restored.jobs.map(sceneNumber),[2,3]);assert.equal(sceneNumber({number:12,order:1}),12);
});
