const { randomUUID } = require('node:crypto');
function stoppedError(){return Object.assign(Error('Đã dừng trong tool. Đang kiểm tra trạng thái dừng trên Muse; bấm Tiếp tục để xử lý cảnh đang dở.'),{name:'AbortError'});}
function abortable(promise,signal){
  if(signal.aborted){Promise.resolve(promise).catch(()=>{});return Promise.reject(stoppedError());}
  return new Promise((resolve,reject)=>{
    const abort=()=>{cleanup();reject(stoppedError());};
    const cleanup=()=>signal.removeEventListener('abort',abort);
    signal.addEventListener('abort',abort,{once:true});
    Promise.resolve(promise).then(v=>{cleanup();resolve(v);},e=>{cleanup();reject(e);});
  });
}
const kindOf=k=>k==='image'?'image':k==='story'?'story':'video';
// Việc «ảnh» của chế độ Mẹo vặt nằm trong hàng đợi kể chuyện nhưng xử lý như tác vụ ảnh.
const isPhoto=j=>j.kind==='image'||j.phase==='image';
function resetRunFields(job, stage='pending') {
  Object.assign(job,{stage,stageMessage:'',progress:null,downloadProgress:null,submissionProtocol:null,submissionReceipt:null,acknowledgedAt:null,confirmedResponseAt:null,submittedAt:null,mayHaveSubmitted:false,submissionProfileKey:null,submissionSessionId:null,resultReadyAt:null,downloadStartedAt:null,downloadCompletedAt:null,startedAt:null,finishedAt:null,error:'',output:''});
  job.account=undefined;
  return job;
}
class Queue {
  constructor({jobs=[],save,run,notify=()=>{},concurrency=1}){
    this.jobs=jobs.map((j,index)=>({...j,kind:kindOf(j.kind),order:Number.isSafeInteger(j.order)&&j.order>0?j.order:index+1,status:j.status==='running'?'interrupted':j.status}));
    this.save=save;this.run=run;this.notify=notify;this.active=false;this.paused=true;this.kind=null;this.concurrency=concurrency;this.writes=Promise.resolve();this.controllers=new Map();this.runningPromise=null;
  }
  async publish(){const p=this.writes.then(()=>this.save(this.jobs));this.writes=p.catch(()=>{});await p;this.notify(this.jobs);}
  async add(items){
    if(!Array.isArray(items)||!items.length||items.some(j=>typeof j.prompt!=='string'||!j.prompt.trim()))throw Error('Mỗi tác vụ cần một prompt.');
    const batchKind=kindOf(items[0]?.kind),nextOrder=Math.max(0,...this.jobs.filter(j=>j.kind===batchKind).map(j=>j.order||0));
    this.jobs.push(...items.map((j,index)=>({order:nextOrder+index+1,id:randomUUID(),kind:kindOf(j.kind),storyId:typeof j.storyId==='string'?j.storyId.replace(/[^\w-]/g,'').slice(0,60):'',prompt:j.prompt.trim(),source:typeof j.source==='string'?j.source:'',phase:j.phase==='image'||j.phase==='clip'?j.phase:'',dependsOn:j.dependsOn==='image'?'image':'',title:typeof j.title==='string'?j.title:'',number:Number.isInteger(j.number)?j.number:null,voiceover:typeof j.voiceover==='string'?j.voiceover:'',durationSeconds:Number.isFinite(j.durationSeconds)&&j.durationSeconds>0?j.durationSeconds:null,image:j.image||j.references?.[0]||'',references:Array.isArray(j.references)?[...j.references]:j.image?[j.image]:[],status:'pending',stage:'pending',stageMessage:'',progress:null,downloadProgress:null,submissionProtocol:null,submissionReceipt:null,acknowledgedAt:null,confirmedResponseAt:null,submittedAt:null,mayHaveSubmitted:false,submissionProfileKey:null,submissionSessionId:null,resultReadyAt:null,downloadStartedAt:null,downloadCompletedAt:null,startedAt:null,finishedAt:null,error:'',output:'',createdAt:Date.now()})));
    await this.publish();
  }
  async retry(id){const j=this.jobs.find(x=>x.id===id);if(!j||!['failed','interrupted'].includes(j.status))throw Error('Chỉ chạy lại tác vụ lỗi hoặc bị gián đoạn.');delete j.resumeMode;resetRunFields(j);j.status='pending';await this.publish();}
  async remove(id){if(this.jobs.find(j=>j.id===id)?.status==='running')throw Error('Dừng tác vụ trước khi xóa.');this.jobs=this.jobs.filter(j=>j.id!==id);await this.publish();}
  async clearPending(kind){this.jobs=this.jobs.filter(j=>(kind&&j.kind!==kind)||j.status!=='pending'||j.mayHaveSubmitted);await this.publish();}
  async clearAll(kind){await this.stop();this.jobs=kind?this.jobs.filter(j=>j.kind!==kind):[];await this.publish();}
  async applyReferences(files){
    if(!Array.isArray(files)||files.some(x=>typeof x!=='string'||!x))throw Error('Ảnh tham chiếu không hợp lệ.');
    for(const j of this.jobs)if(j.kind!=='story'&&j.status==='pending'&&!j.lockedInput){j.references=[...files];j.image=files[0]||'';}
    await this.publish();
  }
  // Clip của chế độ Mẹo vặt (dependsOn:'image') chỉ chạy sau khi ảnh cùng số cảnh trong cùng truyện đã lưu xong.
  imageOf(job){return job.dependsOn==='image'?this.jobs.find(d=>d!==job&&d.kind===job.kind&&d.storyId===job.storyId&&d.phase==='image'&&d.number===job.number):null;}
  // 'ready' = chạy được; 'wait' = ảnh đang được tạo (chờ); 'blocked' = ảnh chưa xong và chưa ai đang tạo (không chạy).
  gate(job){
    if(job.dependsOn!=='image')return 'ready';
    const image=this.imageOf(job);
    if(image&&image.status==='completed'&&image.output)return 'ready';
    return image&&image.status==='running'?'wait':'blocked';
  }
  // Gắn ảnh đã tạo làm ảnh tham chiếu của clip. Prompt đã có thể gửi với ảnh cũ thì giữ nguyên bản đã khóa.
  attachImage(job){
    const image=this.imageOf(job);
    if(!image||!image.output)return;
    if(job.references?.length===1&&job.references[0]===image.output&&job.image===image.output)return;
    job.references=[image.output];job.image=image.output;
    if(!job.mayHaveSubmitted)delete job.lockedInput;
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
      const photo=isPhoto(job);
      if(typeof output!=='string'||!output.trim())throw Error(photo?'Chưa xác nhận được tệp ảnh đã lưu.':'Chưa xác nhận được tệp video tải xuống.');
      job.output=output;job.status='completed';job.stage='completed';job.stageMessage=photo?'Đã lưu ảnh về máy':'Đã tải và lưu video về máy';job.progress=100;
    } catch(error) {
      job.status=controller.signal.aborted||error?.name==='AbortError'?'interrupted':'failed';
      job.stage=job.status;job.error=error?.message||(isPhoto(job)?'Không xử lý được tác vụ ảnh.':'Không xử lý được tác vụ video.');job.stageMessage=job.error;this.paused=true;
    } finally {job.finishedAt=new Date().toISOString();this.controllers.delete(job.id);}
    await this.publish();
  }
  prepareResume(kind){
    if(this.active)throw Error('Hàng đợi vẫn đang chạy.');
    for(const j of this.jobs)if((!kind||j.kind===kind)&&(['failed','interrupted'].includes(j.status)||(j.status==='pending'&&j.resumeMode))){
      // Continue explicitly starts a new attempt for unfinished scenes. Only
      // the separate Recover video action may reuse a previous result.
      j.resumeMode='resubmit';
      j.status='pending';j.error='';
    }
  }
  start(kind){
    if(this.active)return Promise.resolve();
    this.kind=kind==='image'||kind==='video'||kind==='story'?kind:null;
    if(!Number.isInteger(this.concurrency)||this.concurrency<1)throw Error('Số tác vụ chạy đồng thời phải là số nguyên dương.');
    this.paused=false;this.active=true;
    this.runningPromise=(async()=>{
      const worker=async slot=>{
        while(!this.paused){
          let job=null,waiting=false;
          for(const x of this.jobs){
            if(x.status!=='pending'||(this.kind&&x.kind!==this.kind)||!(!x.resumeMode||this.concurrency===1||x.account===slot+1||!x.account))continue;
            const gate=this.gate(x);
            if(gate==='ready'){job=x;break;}
            if(gate==='wait')waiting=true;
          }
          if(!job){if(waiting&&!this.paused){await new Promise(r=>setTimeout(r,this.gateWaitMs??300));continue;}break;}
          this.attachImage(job);
          const resume=job.resumeMode;await this.executeJob(job,(item,signal)=>this.run(item,slot,signal),!resume);
          if(job.status==='completed')delete job.resumeMode;
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
  regenerate(id){
    if(this.active)throw Error('Chờ hoặc dừng tác vụ hiện tại trước khi tạo lại.');
    const job=this.jobs.find(item=>item.id===id);
    if(!job||job.status!=='completed'||!job.output)throw Error('Chỉ tạo lại cảnh đã hoàn thành.');
    job.previousOutputs=[...new Set([...(job.previousOutputs||[]),job.output])];
    job.previousOutput=job.output;job.resumeMode='resubmit';
    if(job.dependsOn==='image'){job.mayHaveSubmitted=false;job.lockedInput&&delete job.lockedInput;this.attachImage(job);}
    this.paused=false;this.active=true;
    this.runningPromise=(async()=>{
      try{await this.executeJob(job,(item,signal)=>this.run(item,Math.max(0,Number(item.account||1)-1),signal),false);if(job.status==='completed')delete job.resumeMode;}
      finally{this.active=false;}
    })();
    return this.runningPromise;
  }
}
module.exports={Queue,stoppedError,abortable};
