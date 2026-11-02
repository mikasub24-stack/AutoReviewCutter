const fs=require('node:fs/promises'),path=require('node:path');
function sceneNumber(job){
 if(Number.isSafeInteger(job.number)&&job.number>0)return job.number;
 if(Number.isSafeInteger(job.order)&&job.order>0)return job.order;
 throw Error('Cảnh chưa có số thứ tự để lưu video.');
}
async function saveOrderedOutput(temporary,directory,job,extension,{extensions=['.mp4','.webm'],suffix=''}={}){
 if(!extensions.includes(extension))throw Error(extensions.includes('.png')?'Định dạng ảnh không hợp lệ.':'Định dạng video không hợp lệ.');
 const stem=String(sceneNumber(job)).padStart(3,'0')+suffix;
 // Exclusive creation preserves videos from prior runs and other accounts.
 // Duplicate numbers keep the scene prefix rather than random task IDs.
 for(let copy=1;copy<=10000;copy++){
  const destination=path.join(directory,stem+(copy===1?'':` (${copy})`)+extension);
  try{await fs.copyFile(temporary,destination,fs.constants.COPYFILE_EXCL);await fs.unlink(temporary).catch(()=>{});return destination;}
  catch(e){if(e.code!=='EEXIST')throw e;}
 }
 throw Error('Quá nhiều file trùng số cảnh trong thư mục lưu.');
}
module.exports={sceneNumber,saveOrderedOutput};
