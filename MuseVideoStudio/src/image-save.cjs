const fs=require('node:fs/promises'),path=require('node:path'),{randomUUID}=require('node:crypto');
const {saveOrderedOutput}=require('./ordered-output.cjs');
const IMAGE_EXTENSIONS=['.png','.jpg','.webp','.gif'];
// Identify the picture by its first bytes, never by the URL or the declared type:
// an expired link often returns an HTML/JSON error page with a 200 status.
function sniffImage(buffer){
  if(!Buffer.isBuffer(buffer)||buffer.length<16)return null;
  if(buffer.subarray(0,8).equals(Buffer.from([0x89,0x50,0x4e,0x47,0x0d,0x0a,0x1a,0x0a])))return {extension:'.png',mime:'image/png'};
  if(buffer[0]===0xff&&buffer[1]===0xd8&&buffer[2]===0xff)return {extension:'.jpg',mime:'image/jpeg'};
  if(buffer.subarray(0,4).toString('latin1')==='GIF8')return {extension:'.gif',mime:'image/gif'};
  if(buffer.subarray(0,4).toString('latin1')==='RIFF'&&buffer.subarray(8,12).toString('latin1')==='WEBP')return {extension:'.webp',mime:'image/webp'};
  return null;
}
function decodeDataUrl(text){
  const match=/^data:([^;,]*)((?:;[^;,]*)*),([\s\S]*)$/.exec(String(text||''));
  if(!match)throw Error('Dữ liệu ảnh không hợp lệ.');
  return /;base64/i.test(match[2])?Buffer.from(match[3],'base64'):Buffer.from(decodeURIComponent(match[3]),'latin1');
}
async function saveImageBuffer(buffer,directory,job,{suffix=''}={}){
  const kind=sniffImage(buffer);
  if(!kind)throw Error('Dữ liệu tải về không phải ảnh PNG/JPG/WEBP/GIF. Chưa lưu để tránh file hỏng.');
  if(buffer.length<1024)throw Error('Ảnh tải về quá nhỏ ('+buffer.length+' byte). Chưa lưu để tránh ảnh giữ chỗ.');
  await fs.mkdir(directory,{recursive:true});
  const temporary=path.join(directory,`.muse-${job.id}-${randomUUID().slice(0,8)}.part`);
  await fs.writeFile(temporary,buffer);
  try{return await saveOrderedOutput(temporary,directory,job,kind.extension,{extensions:IMAGE_EXTENSIONS,suffix});}
  catch(error){await fs.rm(temporary,{force:true}).catch(()=>{});throw error;}
}
module.exports={sniffImage,decodeDataUrl,saveImageBuffer,IMAGE_EXTENSIONS};
