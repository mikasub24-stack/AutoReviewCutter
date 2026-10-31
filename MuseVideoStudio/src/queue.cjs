const { randomUUID } = require('node:crypto');
function stoppedError(){return Object.assign(Error('Đã dừng trong tool. Prompt đã gửi có thể vẫn tiếp tục trên Muse; kiểm tra trước khi chạy lại.'),{name:'AbortError'});}
function abortable(promise,signal){
  if(signal.aborted){Promise.resolve(promise).catch(()=>{});return Promise.reject(stoppedError());}
  return new Promise((resolve,reject)=>{
    const abort=()=>{cleanup();reject(stoppedError());};
    const cleanup=()=>signal.removeEventListener('abort',abort);
    signal.addEventListener('abort',abort,{once:true});
    Promise.resolve(promise).then(v=>{cleanup();resolve(v);},e=>{cleanup();reject(e);});
  });
}
function resetRunFields(job, stage='pending') {
  Object.assign(job,{stage,stageMessage:'',progress:null,downloadProgress:null,submittedAt:null,mayHaveSubmitted:false,submissionProfileKey:null,submissionSessionId:null,resultReadyAt:null,downloadStartedAt:null,downloadCompletedAt:null,startedAt:null,finishedAt:null,error:'',output:''});
  job.account=undefined;
  return job;
}
class Queue {
  constructor({jobs=[],save,run,notify=()=>{},concurrency=1}){
    this.jobs=jobs.map(j=>({...j,status:j.status==='running'?'interrupted':j.status}));
    this.save=save;this.run=run;this.notify=notify;this.active=false;this.paused=true;this.concurrency=concurrency;this.writes=Promise.resolve();this.controllers=new Map();this.runningPromise=null;
  }
  async publish(){const p=this.writes.then(()=>this.save(this.jobs));this.writes=p.catch(()=>{});await p;this.notify(this.jobs);}
  async add(items){
    if(!Array.isArray(items)||!items.length||items.some(j=>typeof j.prompt!=='string'||!j.prompt.trim()))throw Error('Mỗi tác vụ cần một prompt.');
    this.jobs.push(...items.map(j=>({id:randomUUID(),prompt:j.prompt.trim(),source:typeof j.source==='string'?j.source:'',title:typeof j.title==='string'?j.title:'',number:Number.isInteger(j.number)?j.number:null,voiceover:typeof j.voiceover==='string'?j.voiceover:'',durationSeconds:Number.isFinite(j.durationSeconds)&&j.durationSeconds>0?j.durationSeconds:null,image:j.image||j.references?.[0]||'',references:Array.isArray(j.references)?[...j.references]:j.image?[j.image]:[],status:'pending',stage:'pending',stageMessage:'',progress:null,downloadProgress:null,submittedAt:null,mayHaveSubmitted:false,submissionProfileKey:null,submissionSessionId:null,resultReadyAt:null,downloadStartedAt:null,downloadCompletedAt:null,startedAt:null,finishedAt:null,error:'',output:'',createdAt:Date.now()})));
    await this.publish();
  }
  async retry(id){const j=this.jobs.find(x=>x.id===id);if(!j||!['failed','interrupted'].includes(j.status))throw Error('Chỉ chạy lại tác vụ lỗi hoặc bị gián đoạn.');resetRunFields(j);j.status='pending';await this.publish();}
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
  async executeJob(job, runner, fresh) {
    const controller=new AbortController();this.controllers.set(job.id,controller);
    if(fresh)resetRunFields(job,'starting');
    else Object.assign(job,{stage:'confirming',stageMessage:'',progress:null,downloadProgress:null,downloadStartedAt:null,downloadCompletedAt:null,error:'',output:''});
    job.status='running';job.startedAt=new Date().toISOString();job.finishedAt=null;
    try {
      await this.publish();
      if(controller.signal.aborted)throw stoppedError();
      const output=await abortable(runner(job,controller.signal),controller.signal);
      if(controller.signal.aborted)throw stoppedError();
      if(typeof output!=='string'||!output.trim())throw Error('Chưa xác nhận được tệp video tải xuống.');
      job.output=output;job.status='completed';job.stage='completed';job.stageMessage='Đã tải và lưu video về máy';job.progress=100;
    } catch(error) {
      job.status=controller.signal.aborted||error?.name==='AbortError'?'interrupted':'failed';
      job.stage=job.status;job.error=error?.message||'Không xử lý được tác vụ video.';job.stageMessage=job.error;this.paused=true;
    } finally {job.finishedAt=new Date().toISOString();this.controllers.delete(job.id);}
    await this.publish();
  }
  start(){
    if(this.active)return Promise.resolve();
    if(!Number.isInteger(this.concurrency)||this.concurrency<1)throw Error('Số tác vụ chạy đồng thời phải là số nguyên dương.');
    this.paused=false;this.active=true;
    this.runningPromise=(async()=>{
      const worker=async slot=>{
        while(!this.paused){
          const job=this.jobs.find(x=>x.status==='pending');if(!job)break;
          await this.executeJob(job,(item,signal)=>this.run(item,slot,signal),true);
        }
      };
      try{const results=await Promise.allSettled(Array.from({length:this.concurrency},(_,i)=>worker(i)));const rejected=results.find(r=>r.status==='rejected');if(rejected)throw rejected.reason;}
      finally{this.active=false;}
    })();
    return this.runningPromise;
  }
  recover(id,runner){
    if(this.active)throw Error('Chờ hoặc dừng tác vụ hiện tại trước khi tải lại video.');
    const job=this.jobs.find(item=>item.id===id);
    if(!job||!['failed','interrupted'].includes(job.status))throw Error('Chỉ tải lại video của tác vụ lỗi hoặc bị gián đoạn.');
    if(!job.mayHaveSubmitted&&!job.submittedAt&&!job.resultReadyAt)throw Error('Chưa có thông tin xác nhận prompt đã được gửi. Kiểm tra Muse trước khi thử lại.');
    if(typeof runner!=='function')throw Error('Thiếu thao tác khôi phục tải video.');
    this.paused=false;this.active=true;
    this.runningPromise=(async()=>{
      try{await this.executeJob(job,runner,false);}
      finally{this.active=false;}
    })();
    return this.runningPromise;
  }
}
module.exports={Queue,stoppedError,abortable};
