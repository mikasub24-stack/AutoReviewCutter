const { randomUUID, createHash } = require('node:crypto');
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
const kindOf=k=>k==='image'?'image':k==='story'?'story':k==='restore'?'restore':k==='wild'?'wild':'video';
// Hai tab chạy chuỗi cảnh nối khung cuối (Dọn nhà · Sinh tồn, Động vật hoang dã) dùng chung luật hết hạn mức / chạy song song theo chuỗi.
const chained=j=>j.kind==='restore'||j.kind==='wild';
// Tab «Dọn nhà · Sinh tồn» (kind 'restore'): cảnh k chỉ chạy sau cảnh k-1, và ảnh đầu của nó là KHUNG CUỐI THẬT của cảnh k-1.
//   needs   = [{phase,number}]            những việc cùng truyện phải xong trước
//   refList = [{file}|{phase,number,part}] ảnh đính kèm: tệp có sẵn, ảnh đã lưu của việc đó, hoặc khung cuối (part:'lastFrame') của clip đó
const PHASES=['image','clip'];
function sanitizeNeeds(list){return Array.isArray(list)?list.filter(n=>n&&PHASES.includes(n.phase)&&Number.isInteger(n.number)).slice(0,6).map(n=>({phase:n.phase,number:n.number})):[];}
function sanitizeRefs(list){
  if(!Array.isArray(list))return [];
  const out=[];
  for(const r of list.slice(0,6)){
    if(r&&typeof r.file==='string'&&r.file.trim())out.push({file:r.file});
    else if(r&&PHASES.includes(r.phase)&&Number.isInteger(r.number))out.push(r.part==='lastFrame'?{phase:r.phase,number:r.number,part:'lastFrame'}:{phase:r.phase,number:r.number});
  }
  return out;
}
// Việc «ảnh» của chế độ Mẹo vặt nằm trong hàng đợi kể chuyện nhưng xử lý như tác vụ ảnh.
const isPhoto=j=>j.kind==='image'||j.phase==='image';
function resetRunFields(job, stage='pending') {
  Object.assign(job,{stage,stageMessage:'',progress:null,downloadProgress:null,submissionProtocol:null,submissionReceipt:null,acknowledgedAt:null,confirmedResponseAt:null,submittedAt:null,mayHaveSubmitted:false,submissionProfileKey:null,submissionSessionId:null,resultReadyAt:null,downloadStartedAt:null,downloadCompletedAt:null,startedAt:null,finishedAt:null,error:'',output:'',lastFrame:''});
  job.account=undefined;
  return job;
}
const PROMPT_MAX=20000;
// Muse báo tài khoản hết lượt / hạn mức tạo video (chưa có chữ chính xác của Muse nên nhận theo nhiều cách nói).
const QUOTA=/hết (lượt|hạn mức)|hạn mức|đã đạt giới hạn|vượt (quá )?giới hạn|đã dùng hết|daily (limit|quota)|usage limit|generation limit|limit (has been )?reached|reached (your|the|today'?s?)\b.{0,40}\blimit|quota|out of (credits|generations)|no (credits|generations) (left|remaining)|too many (requests|videos|generations)|rate limit|try again (tomorrow|later)|come back (tomorrow|later)|quay lại (sau|vào ngày mai)/i;
const QUOTA_REST_MS=3*3600*1000,QUOTA_MAX_MOVES=40;
function checkPrompt(value){
  const text=String(value??'').trim();
  if(!text)throw Error('Prompt không được để trống.');
  if(text.length>PROMPT_MAX)throw Error('Prompt quá dài (tối đa '+PROMPT_MAX+' ký tự).');
  return text;
}
// Đổi prompt của một cảnh: cập nhật cả bản đã khóa (ảnh tham chiếu giữ nguyên), nếu không lần chạy sau vẫn gửi lại prompt cũ.
function applyPrompt(job,text){
  job.prompt=text;
  if(job.lockedInput)job.lockedInput={...job.lockedInput,prompt:text,promptHash:createHash('sha256').update(text).digest('hex')};
}
class Queue {
  constructor({jobs=[],save,run,notify=()=>{},concurrency=1,accounts=null,gateWaitMs}){
    this.jobs=jobs.map((j,index)=>({...j,kind:kindOf(j.kind),order:Number.isSafeInteger(j.order)&&j.order>0?j.order:index+1,status:j.status==='running'?'interrupted':j.status}));
    this.save=save;this.run=run;this.notify=notify;this.active=false;this.paused=true;this.kind=null;this.concurrency=concurrency;this.writes=Promise.resolve();this.controllers=new Map();this.cancels=new Map();this.runningPromise=null;
    this.accounts=accounts;this.exhausted=new Map();if(gateWaitMs!==undefined)this.gateWaitMs=gateWaitMs;
  }
  // Tab «Dọn nhà · Sinh tồn»: tài khoản báo hết hạn mức tạo video thì nghỉ một lúc, cảnh đó tự chuyển sang tài khoản khác (không dừng hàng đợi, không bắt bấm tay).
  accountTotal(){return Math.max(1,Number(typeof this.accounts==='function'?this.accounts():this.accounts)||this.concurrency||1);}
  exhaustedAccounts(){const now=Date.now();for(const [a,t] of this.exhausted)if(t<=now)this.exhausted.delete(a);return [...this.exhausted.keys()];}
  isExhausted(account){return this.exhaustedAccounts().includes(Number(account));}
  allExhausted(){return this.exhaustedAccounts().length>=this.accountTotal();}
  nextExhaustedAt(){return Math.min(...this.exhausted.values());}
  async publish(){const p=this.writes.then(()=>this.save(this.jobs));this.writes=p.catch(()=>{});await p;this.notify(this.jobs);}
  async add(items){
    if(!Array.isArray(items)||!items.length||items.some(j=>typeof j.prompt!=='string'||!j.prompt.trim()))throw Error('Mỗi tác vụ cần một prompt.');
    const batchKind=kindOf(items[0]?.kind),nextOrder=Math.max(0,...this.jobs.filter(j=>j.kind===batchKind).map(j=>j.order||0));
    this.jobs.push(...items.map((j,index)=>({order:nextOrder+index+1,id:randomUUID(),kind:kindOf(j.kind),storyId:typeof j.storyId==='string'?j.storyId.replace(/[^\w-]/g,'').slice(0,60):'',prompt:j.prompt.trim(),source:typeof j.source==='string'?j.source:'',phase:j.phase==='image'||j.phase==='clip'?j.phase:'',dependsOn:j.dependsOn==='image'?'image':'',title:typeof j.title==='string'?j.title:'',number:Number.isInteger(j.number)?j.number:null,voiceover:typeof j.voiceover==='string'?j.voiceover:'',durationSeconds:Number.isFinite(j.durationSeconds)&&j.durationSeconds>0?j.durationSeconds:null,image:j.image||j.references?.[0]||'',references:Array.isArray(j.references)?[...j.references]:j.image?[j.image]:[],needs:sanitizeNeeds(j.needs),refList:sanitizeRefs(j.refList),status:'pending',stage:'pending',stageMessage:'',progress:null,downloadProgress:null,submissionProtocol:null,submissionReceipt:null,acknowledgedAt:null,confirmedResponseAt:null,submittedAt:null,mayHaveSubmitted:false,submissionProfileKey:null,submissionSessionId:null,resultReadyAt:null,downloadStartedAt:null,downloadCompletedAt:null,startedAt:null,finishedAt:null,error:'',output:'',...(j.provider==='flow'?{provider:'flow'}:{}),...(j.storyMode==='ad'?{storyMode:'ad'}:{}),...(['16:9','9:16','1:1'].includes(j.aspect)?{aspect:j.aspect}:{}),createdAt:Date.now()})));
    await this.publish();
  }
  // Sửa prompt của cảnh chưa chạy / lỗi / bị gián đoạn. Cảnh đang chạy thì sửa qua cancelJob(…,'again',…,prompt) để dừng rồi gửi lại.
  async editPrompt(id,prompt){
    const job=this.jobs.find(j=>j.id===id);
    if(!job)throw Error('Không tìm thấy cảnh này.');
    if(job.status==='completed')throw Error('Cảnh đã xong. Dùng «Tạo lại» nếu muốn làm lại.');
    if(job.status==='running')throw Error('Cảnh đang chạy. Chọn «Lưu và gửi lại ngay» để dừng rồi gửi prompt mới.');
    const text=checkPrompt(prompt);
    if(text===job.prompt)return false;
    applyPrompt(job,text);
    // Prompt cũ có thể đã gửi tới Muse: bản mới không khớp tin nhắn cũ nên bỏ dấu vết gửi, lần chạy sau gửi bản mới.
    if(job.mayHaveSubmitted||job.submittedAt||job.resultReadyAt){const status=job.status;delete job.resumeMode;resetRunFields(job,status);job.status=status;}
    if(['failed','interrupted'].includes(job.status)){job.error='Đã sửa prompt. Bấm «Gửi lại prompt» để chạy lại.';job.stageMessage=job.error;}
    await this.publish();
    return true;
  }
  // Cảnh ĐÃ XONG: đổi prompt (cả bản đã khóa, ảnh tham chiếu giữ nguyên) nhưng KHÔNG đụng video đã có; lần «Tạo lại» sau gửi prompt mới.
  async restylePrompt(id,prompt){
    const job=this.jobs.find(j=>j.id===id);
    if(!job)throw Error('Không tìm thấy cảnh này.');
    if(job.status!=='completed')throw Error('Chỉ đổi prompt của cảnh đã xong bằng cách này.');
    const text=checkPrompt(prompt);
    if(text===job.prompt)return false;
    applyPrompt(job,text);
    await this.publish();
    return true;
  }
  // Dừng một cảnh CHƯA chạy (đang chờ trong hàng đợi) để sửa prompt / ảnh rồi tạo lại sau: thành «Đã dừng», hàng đợi bỏ qua nó, các cảnh khác chạy tiếp.
  async holdJob(id){
    const j=this.jobs.find(x=>x.id===id);
    if(!j||j.status!=='pending')throw Error('Chỉ dừng được cảnh đang chờ. Cảnh đang chạy dùng «Dừng cảnh này».');
    if(j.mayHaveSubmitted||j.submittedAt||j.resultReadyAt)throw Error('Cảnh này đã gửi tới Muse, hãy bấm «Dừng cảnh này» khi nó chạy.');
    j.status='interrupted';j.stage='interrupted';j.error='Đã dừng cảnh này. Sửa prompt (nếu cần) rồi bấm «Gửi lại prompt» để tạo lại.';j.stageMessage=j.error;
    await this.publish();
    return true;
  }
  async retry(id){const j=this.jobs.find(x=>x.id===id);if(!j||!['failed','interrupted'].includes(j.status))throw Error('Chỉ chạy lại tác vụ lỗi hoặc bị gián đoạn.');delete j.resumeMode;resetRunFields(j);j.status='pending';await this.publish();}
  async remove(id){if(this.jobs.find(j=>j.id===id)?.status==='running')throw Error('Dừng tác vụ trước khi xóa.');this.jobs=this.jobs.filter(j=>j.id!==id);await this.publish();}
  async clearPending(kind){this.jobs=this.jobs.filter(j=>(kind&&j.kind!==kind)||j.status!=='pending'||j.mayHaveSubmitted);await this.publish();}
  // Dọn truyện cũ: chỉ bỏ truyện mà MỌI việc (kể cả việc ảnh) đã xong; truyện còn dở được giữ nguyên. Trả về số việc đã bỏ. File video đã tải không bị xóa.
  async removeFinishedStories(ids){
    const want=new Set([...ids].map(String));
    const finished=new Set([...want].filter(id=>{const own=this.jobs.filter(j=>j.kind==='story'&&j.storyId===id);return own.length>0&&own.every(j=>j.status==='completed');}));
    const before=this.jobs.length;
    this.jobs=this.jobs.filter(j=>!(j.kind==='story'&&finished.has(j.storyId)));
    if(this.jobs.length!==before)await this.publish();
    return before-this.jobs.length;
  }
  async clearAll(kind){await this.stop();this.jobs=kind?this.jobs.filter(j=>j.kind!==kind):[];await this.publish();}
  async applyReferences(files){
    if(!Array.isArray(files)||files.some(x=>typeof x!=='string'||!x))throw Error('Ảnh tham chiếu không hợp lệ.');
    for(const j of this.jobs)if(j.kind!=='story'&&!chained(j)&&j.status==='pending'&&!j.lockedInput){j.references=[...files];j.image=files[0]||'';}
    await this.publish();
  }
  // Clip của chế độ Mẹo vặt (dependsOn:'image') chỉ chạy sau khi ảnh cùng số cảnh trong cùng truyện đã lưu xong.
  imageOf(job){return job.dependsOn==='image'?this.jobs.find(d=>d!==job&&d.kind===job.kind&&d.storyId===job.storyId&&d.phase==='image'&&d.number===job.number):null;}
  // 'ready' = chạy được; 'wait' = ảnh đang được tạo (chờ); 'blocked' = ảnh chưa xong và chưa ai đang tạo (không chạy).
  depJob(job,n){return this.jobs.find(d=>d!==job&&d.kind===job.kind&&d.storyId===job.storyId&&(d.phase||'')===n.phase&&d.number===n.number)||null;}
  // Clip kể chuyện chuỗi: sẵn sàng khi MỌI việc cần có đã xong (và có khung cuối nếu cần); chờ khi có việc đang chạy; ngược lại bị chặn.
  chainGate(job){
    const deps=job.needs.map(n=>({n,d:this.depJob(job,n)}));
    const ok=({n,d})=>Boolean(d&&d.status==='completed'&&d.output&&(!job.refList?.some(r=>r.phase===n.phase&&r.number===n.number&&r.part==='lastFrame')||d.lastFrame));
    if(deps.every(ok))return 'ready';
    return deps.some(({d})=>d&&d.status==='running')?'wait':'blocked';
  }
  gate(job){
    if(job.needs?.length)return this.chainGate(job);
    if(job.dependsOn!=='image')return 'ready';
    const image=this.imageOf(job);
    if(image&&image.status==='completed'&&image.output)return 'ready';
    return image&&image.status==='running'?'wait':'blocked';
  }
  // Gắn ảnh đã tạo làm ảnh tham chiếu của clip. Prompt đã có thể gửi với ảnh cũ thì giữ nguyên bản đã khóa.
  attachImage(job){
    if(job.refList?.length){
      const refs=job.refList.map(r=>{
        if(r.file)return r.file;
        const d=this.depJob(job,r);
        return d?(r.part==='lastFrame'?d.lastFrame:d.output):'';
      });
      if(refs.some(x=>!x))return;
      if(refs.length===job.references?.length&&refs.every((x,i)=>x===job.references[i]))return;
      job.references=refs;job.image=refs[0];
      if(!job.mayHaveSubmitted)delete job.lockedInput;
      return;
    }
    const image=this.imageOf(job);
    if(!image||!image.output)return;
    if(job.references?.length===1&&job.references[0]===image.output&&job.image===image.output)return;
    job.references=[image.output];job.image=image.output;
    if(!job.mayHaveSubmitted)delete job.lockedInput;
  }
  // Cảnh được người dùng thêm video làm tay (tự tạo ở nơi khác rồi tải lên): đánh dấu đã xong, không gửi gì tới Muse.
  async attachManual(id,output){
    const job=this.jobs.find(j=>j.id===id);
    if(!job||job.kind==='image'||isPhoto(job))throw Error('Chỉ thêm video cho cảnh video.');
    if(job.status==='running')throw Error('Dừng cảnh này trước khi thêm video.');
    if(job.status==='completed')throw Error('Cảnh này đã có video.');
    if(typeof output!=='string'||!output.trim())throw Error('Thiếu đường dẫn video.');
    delete job.resumeMode;delete job.avoidAccounts;delete job.late;
    Object.assign(job,{status:'completed',stage:'completed',stageMessage:'Đã thêm video thủ công',progress:100,downloadProgress:null,error:'',output,outputs:[output],manual:true,finishedAt:new Date().toISOString()});
    await this.publish();
  }
  // Dừng RIÊNG một cảnh đang chạy mà không dừng cả hàng đợi.
  //   mode 'again': bỏ lượt chờ này và đưa cảnh về «đang chờ» để gửi lại ngay (worker rảnh sẽ nhặt lại đúng cảnh này, vì cảnh đứng đầu hàng).
  //   mode 'other': như 'again' nhưng gửi sang tài khoản KHÁC (tài khoản hiện tại hết lượt tạo video / lỗi). Cảnh nhớ tài khoản cần tránh trong avoidAccounts;
  //                 khi đã tránh hết mọi tài khoản đang chạy thì bỏ qua danh sách này (thử lại từ đầu).
  //   mode 'skip' : bỏ lượt chờ, cảnh thành «bị gián đoạn» (vẫn lấy lại video đã tạo được / gửi lại sau); các cảnh khác chạy tiếp.
  // hold: Promise (vd lệnh bấm Dừng trong Muse) phải xong trước khi trả chỗ cho cảnh kế tiếp. Xong khi cảnh đã rời trạng thái «đang chạy».
  async cancelJob(id,mode='skip',hold=null,prompt=null){
    const job=this.jobs.find(j=>j.id===id),controller=this.controllers.get(id);
    if(!job||job.status!=='running'||!controller)throw Error('Cảnh này không còn đang chạy.');
    if(this.cancels.has(id))return;
    const next=prompt===null||prompt===undefined?null:checkPrompt(prompt);
    this.cancels.set(id,{mode:mode==='again'||mode==='other'?mode:'skip',hold:hold||Promise.resolve(),prompt:next});
    controller.abort();
    while(this.controllers.has(id))await new Promise(r=>setTimeout(r,20));
  }
  pause(){this.paused=true;}
  async stop(){this.paused=true;for(const c of this.controllers.values())c.abort();if(this.runningPromise)await this.runningPromise;}
  async executeJob(job, runner, fresh) {
    const controller=new AbortController();this.controllers.set(job.id,controller);
    if(fresh)resetRunFields(job,'starting');
    else Object.assign(job,{stage:'confirming',stageMessage:'',progress:null,downloadProgress:null,downloadStartedAt:null,downloadCompletedAt:null,error:'',output:'',lastFrame:''});
    job.status='running';job.startedAt=new Date().toISOString();job.finishedAt=null;
    try {
      await this.publish();
      if(controller.signal.aborted)throw stoppedError();
      const output=await abortable(runner(job,controller.signal),controller.signal);
      if(controller.signal.aborted)throw stoppedError();
      const photo=isPhoto(job);
      if(typeof output!=='string'||!output.trim())throw Error(photo?'Chưa xác nhận được tệp ảnh đã lưu.':'Chưa xác nhận được tệp video tải xuống.');
      job.output=output;job.status='completed';delete job.avoidAccounts;job.stage='completed';job.stageMessage=photo?'Đã lưu ảnh về máy':'Đã tải và lưu video về máy';job.progress=100;
    } catch(error) {
      const cancel=this.cancels.get(job.id);
      if(cancel){
        // Dừng RIÊNG cảnh này (nút trên thẻ): hàng đợi KHÔNG tạm dừng, tab / tài khoản còn lại chạy tiếp.
        // Đợi lệnh bấm Dừng trong Muse xong rồi mới trả chỗ, để lượt gửi kế tiếp không bấm nhầm vào cảnh mới.
        try{await cancel.hold;}catch{}
        this.cancels.delete(job.id);
        if(cancel.mode==='again'||cancel.mode==='other'){
          const from=Number(job.account)||0;
          delete job.resumeMode;delete job.late;resetRunFields(job);job.status='pending';
          if(cancel.prompt)applyPrompt(job,cancel.prompt);
          if(cancel.mode==='other'&&from)job.avoidAccounts=[...new Set([...(job.avoidAccounts||[]),from])];
        }
        else{job.status='interrupted';job.stage='interrupted';job.error='Đã dừng cảnh này. Bấm «Tìm / tải video đã tạo» để lấy kết quả nếu Muse đã làm xong, hoặc «Gửi lại prompt».';job.stageMessage=job.error;}
      }else if(chained(job)&&Number(job.account)>0&&!controller.signal.aborted&&error?.name!=='AbortError'&&QUOTA.test(error?.message||'')&&(job.quotaMoves||0)<QUOTA_MAX_MOVES){
        // Tài khoản hết hạn mức: nghỉ tài khoản đó, đưa cảnh về «đang chờ» để tài khoản khác nhận. Hết mọi tài khoản thì tạm dừng (main tự chạy lại khi có tài khoản hết nghỉ).
        const from=Number(job.account),why=error.message;
        this.exhausted.set(from,Date.now()+QUOTA_REST_MS);
        job.quotaMoves=(job.quotaMoves||0)+1;
        delete job.resumeMode;delete job.late;resetRunFields(job);job.status='pending';
        job.avoidAccounts=[...new Set([...(job.avoidAccounts||[]),from])];
        if(this.allExhausted()){this.paused=true;job.stageMessage=`Mọi tài khoản đã hết hạn mức tạo video: tự chạy lại khi có tài khoản dùng được · ${why}`;}
        else job.stageMessage=`Tài khoản ${from} hết hạn mức tạo video: tự chuyển cảnh này sang tài khoản khác · ${why}`;
      }else{
        job.status=controller.signal.aborted||error?.name==='AbortError'?'interrupted':'failed';
        job.stage=job.status;job.error=error?.message||(isPhoto(job)?'Không xử lý được tác vụ ảnh.':'Không xử lý được tác vụ video.');job.stageMessage=job.error;this.paused=true;
      }
    } finally {job.finishedAt=job.status==='pending'?null:new Date().toISOString();this.controllers.delete(job.id);this.cancels.delete(job.id);}
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
  // Cảnh bấm «Thử tài khoản khác» tránh tài khoản vừa hỏng. Khi mọi tài khoản đang chạy đều nằm trong danh sách thì thôi tránh (thử lại từ đầu).
  avoids(job,slot){
    const list=job.avoidAccounts;
    if(!Array.isArray(list)||!list.length||this.concurrency<2)return false;
    for(let account=1;account<=this.concurrency;account++)if(!list.includes(account))return list.includes(slot+1);
    return false;
  }
  start(kind){
    if(this.active)return Promise.resolve();
    this.kind=kind==='image'||kind==='video'||kind==='story'||kind==='restore'||kind==='wild'?kind:null;
    if(!Number.isInteger(this.concurrency)||this.concurrency<1)throw Error('Số tác vụ chạy đồng thời phải là số nguyên dương.');
    this.paused=false;this.active=true;
    this.runningPromise=(async()=>{
      const worker=async slot=>{
        while(!this.paused){
          let job=null,waiting=false,resting=false;
          for(const x of this.jobs){
            if(x.status!=='pending'||(this.kind&&x.kind!==this.kind)||!(!x.resumeMode||this.concurrency===1||x.account===slot+1||!x.account||(chained(x)&&this.isExhausted(x.account)))||this.avoids(x,slot))continue;
            if(chained(x)&&this.concurrency>1&&this.isExhausted(slot+1)&&!this.allExhausted()){resting=true;continue;}
            const gate=this.gate(x);
            if(gate==='ready'){job=x;break;}
            if(gate==='wait')waiting=true;
          }
          // Worker rảnh không thoát khi tài khoản khác còn đang chạy cảnh: cảnh đó có thể bị chuyển sang tài khoản này («Thử tài khoản khác»).
          if(!job){
            const busy=this.concurrency>1&&this.jobs.some(x=>x.status==='running'&&(!this.kind||x.kind===this.kind));
            if((waiting||busy||(resting&&busy))&&!this.paused){await new Promise(r=>setTimeout(r,this.gateWaitMs??300));continue;}
            break;
          }
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
    if(job.dependsOn==='image'||job.refList?.length){job.mayHaveSubmitted=false;job.lockedInput&&delete job.lockedInput;this.attachImage(job);}
    this.paused=false;this.active=true;
    this.runningPromise=(async()=>{
      try{await this.executeJob(job,(item,signal)=>this.run(item,Math.max(0,Number(item.account||1)-1),signal),false);if(job.status==='completed')delete job.resumeMode;}
      finally{this.active=false;}
    })();
    return this.runningPromise;
  }
}
module.exports={Queue,stoppedError,abortable,QUOTA};
