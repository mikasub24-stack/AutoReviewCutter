const { randomUUID } = require('node:crypto');
function stoppedError(){return Object.assign(Error('Đã dừng trong tool. Prompt đã gửi có thể vẫn tiếp tục trên Muse; kiểm tra trước khi chạy lại.'),{name:'AbortError'});}
function abortable(promise,signal){
  if(signal.aborted)return Promise.reject(stoppedError());
  return new Promise((resolve,reject)=>{
    const abort=()=>{cleanup();reject(stoppedError());};
    const cleanup=()=>signal.removeEventListener('abort',abort);
    signal.addEventListener('abort',abort,{once:true});
    Promise.resolve(promise).then(v=>{cleanup();resolve(v);},e=>{cleanup();reject(e);});
  });
}
class Queue {
  constructor({jobs=[],save,run,notify=()=>{},concurrency=1}){
    this.jobs=jobs.map(j=>({...j,status:j.status==='running'?'interrupted':j.status}));
    this.save=save;this.run=run;this.notify=notify;this.active=false;this.paused=true;this.concurrency=concurrency;this.writes=Promise.resolve();this.controllers=new Map();this.runningPromise=null;
  }
  async publish(){const p=this.writes.then(()=>this.save(this.jobs));this.writes=p.catch(()=>{});await p;this.notify(this.jobs);}
  async add(items){
    if(!Array.isArray(items)||!items.length||items.some(j=>typeof j.prompt!=='string'||!j.prompt.trim()))throw Error('Mỗi tác vụ cần một prompt.');
    this.jobs.push(...items.map(j=>({id:randomUUID(),prompt:j.prompt.trim(),source:typeof j.source==='string'?j.source:'',title:typeof j.title==='string'?j.title:'',number:Number.isInteger(j.number)?j.number:null,voiceover:typeof j.voiceover==='string'?j.voiceover:'',durationSeconds:Number.isFinite(j.durationSeconds)&&j.durationSeconds>0?j.durationSeconds:null,image:j.image||j.references?.[0]||'',references:Array.isArray(j.references)?[...j.references]:j.image?[j.image]:[],status:'pending',error:'',output:'',createdAt:Date.now()})));
    await this.publish();
  }
  async retry(id){const j=this.jobs.find(x=>x.id===id);if(!j||!['failed','interrupted'].includes(j.status))throw Error('Chỉ chạy lại tác vụ lỗi hoặc bị gián đoạn.');j.status='pending';j.error='';j.account=undefined;await this.publish();}
  async remove(id){if(this.jobs.find(j=>j.id===id)?.status==='running')throw Error('Dừng tác vụ trước khi xóa.');this.jobs=this.jobs.filter(j=>j.id!==id);await this.publish();}
  async clearPending(){this.jobs=this.jobs.filter(j=>j.status!=='pending');await this.publish();}
  async clearAll(){await this.stop();this.jobs=[];await this.publish();}
  async applyReferences(files){
    if(!Array.isArray(files)||files.some(x=>typeof x!=='string'||!x))throw Error('Ảnh tham chiếu không hợp lệ.');
    for(const j of this.jobs)if(j.status==='pending'){j.references=[...files];j.image=files[0]||'';}
    await this.publish();
  }
  pause(){this.paused=true;}
  async stop(){this.paused=true;for(const c of this.controllers.values())c.abort();if(this.runningPromise)await this.runningPromise;}
  start(){
    if(this.active)return Promise.resolve();
    this.paused=false;this.active=true;
    this.runningPromise=(async()=>{
      const worker=async slot=>{
        while(!this.paused){
          const j=this.jobs.find(x=>x.status==='pending');if(!j)break;
          const controller=new AbortController();this.controllers.set(j.id,controller);j.status='running';j.error='';
          try{
            await this.publish();
            if(controller.signal.aborted)throw stoppedError();
            const output=await abortable(this.run(j,slot,controller.signal),controller.signal);
            if(controller.signal.aborted)throw stoppedError();j.output=output;j.status='completed';
          }catch(e){j.status=controller.signal.aborted||e.name==='AbortError'?'interrupted':'failed';j.error=e.message;this.paused=true;}
          finally{this.controllers.delete(j.id);}
          await this.publish();
        }
      };
      try{const results=await Promise.allSettled(Array.from({length:this.concurrency},(_,i)=>worker(i)));const rejected=results.find(r=>r.status==='rejected');if(rejected)throw rejected.reason;}
      finally{this.active=false;}
    })();
    return this.runningPromise;
  }
}
module.exports={Queue,stoppedError,abortable};
