const fs=require('node:fs/promises'),path=require('node:path'),{createHash}=require('node:crypto');
async function lockInput(job,directory){
 if(job.lockedInput){
  for(const r of job.lockedInput.references){const bytes=await fs.readFile(r.path);if(createHash('sha256').update(bytes).digest('hex')!==r.sha256)throw Error('Bản ảnh đã khóa bị thay đổi. Dừng để tránh gửi sai tham chiếu.');}
  return job.lockedInput;
 }
 const prompt=job.prompt,references=[];await fs.mkdir(directory,{recursive:true});
 for(const file of job.references?.length?job.references:job.image?[job.image]:[]){
  const bytes=await fs.readFile(file);if(bytes.length>32*1024*1024)throw Error('Ảnh tham chiếu vượt 32 MB.');
  const sha256=createHash('sha256').update(bytes).digest('hex'),ext=path.extname(file).toLowerCase();
  const destination=path.join(directory,sha256+ext);
  try{await fs.writeFile(destination,bytes,{flag:'wx'});}catch(e){if(e.code!=='EEXIST')throw e;const saved=await fs.readFile(destination);if(createHash('sha256').update(saved).digest('hex')!==sha256)throw Error('Bộ nhớ ảnh tham chiếu không khớp.');}
  references.push({path:destination,sha256,name:path.basename(file)});
 }
 job.lockedInput={prompt,promptHash:createHash('sha256').update(prompt).digest('hex'),references,lockedAt:new Date().toISOString()};
 return job.lockedInput;
}
module.exports={lockInput};
