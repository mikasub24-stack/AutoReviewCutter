const fs=require('node:fs/promises'),crypto=require('node:crypto'),os=require('node:os');
const{execFileSync}=require('node:child_process');
const DAY=86400000;
function deviceCode(){let raw;try{if(process.platform==='win32')raw=execFileSync('reg.exe',['query','HKLM\\SOFTWARE\\Microsoft\\Cryptography','/v','MachineGuid'],{encoding:'utf8',windowsHide:true,timeout:5000}).match(/MachineGuid\s+REG_SZ\s+(\S+)/)?.[1];}catch{}return crypto.createHash('sha256').update('MuseVideoStudio|'+(raw||`${os.platform()}|${os.hostname()}|${os.arch()}`)).digest('hex').slice(0,24).toUpperCase();}
function verifyToken(token,{publicKey,device,now=Date.now()}){
 try{if(typeof token!=='string'||token.length>4096)throw Error();const parts=token.trim().split('.');if(parts.length!==2)throw Error();const bytes=Buffer.from(parts[0],'base64url');if(!crypto.verify(null,bytes,publicKey,Buffer.from(parts[1],'base64url')))throw Error();const data=JSON.parse(bytes.toString());if(data.product!=='MuseVideoStudio'||data.device!==device||!Number.isFinite(data.expiresAt)||data.expiresAt<=now||!Number.isFinite(data.issuedAt)||data.issuedAt>now+120000)throw Error();return data;}catch{throw Error('Key không hợp lệ, hết hạn hoặc không dành cho máy này.');}
}
async function createLicense({file,safeStorage,device,publicKey,now=()=>Date.now()}){
 let data,invalid=false;
 const available=()=>safeStorage.isEncryptionAvailable()&&!(process.platform==='linux'&&safeStorage.getSelectedStorageBackend?.()==='basic_text');
 async function save(){if(!available())throw Error('Chưa có mã hóa hệ điều hành để lưu dùng thử/key.');await fs.writeFile(file+'.tmp',safeStorage.encryptString(JSON.stringify(data)),{mode:0o600});await fs.rename(file+'.tmp',file);}
 try{const bytes=await fs.readFile(file);if(!available())invalid=true;else{data=JSON.parse(safeStorage.decryptString(bytes));if(data.version!==1||data.device!==device||!Number.isFinite(data.trialStartedAt)||!Number.isFinite(data.lastSeen)||data.lastSeen<data.trialStartedAt)invalid=true;}}
 catch(e){if(e.code==='ENOENT'){data={version:1,device,trialStartedAt:now(),lastSeen:now(),token:''};if(available())await save();}else invalid=true;}
 function status(){
  if(!available())return{status:'unavailable',device,expiresAt:null,message:'Máy chưa hỗ trợ lưu mã hóa dùng thử/key.'};
  if(invalid||!data)return{status:'locked',device,expiresAt:null,message:'Dữ liệu dùng thử không hợp lệ. Cần chủ phần mềm hỗ trợ.'};
  if(now()<data.lastSeen-120000)return{status:'locked',device,expiresAt:null,message:'Giờ hệ thống lùi so với lần dùng trước. Kiểm tra lại ngày giờ.'};
  if(data.token){try{const license=verifyToken(data.token,{publicKey,device,now:now()});return{status:'active',device,expiresAt:license.expiresAt,message:'Đã kích hoạt key.'};}catch{}}
  const expiresAt=data.trialStartedAt+DAY;
  return{status:now()<expiresAt?'trial':'expired',device,expiresAt,message:now()<expiresAt?'Đang dùng thử 24 giờ.':'Hết 24 giờ dùng thử. Nhập key để tiếp tục tạo video.'};
 }
 return{
  status,
  async ensureAllowed(){const s=status();if(!['active','trial'].includes(s.status))throw Error(s.message);data.lastSeen=Math.max(data.lastSeen,now());await save();return s;},
  async activate(token){verifyToken(token,{publicKey,device,now:now()});if(!available())throw Error('Chưa có mã hóa hệ điều hành.');data={version:1,device,trialStartedAt:data?.trialStartedAt||now(),lastSeen:now(),token:token.trim()};invalid=false;await save();return status();}
 };
}
module.exports={createLicense,verifyToken,deviceCode,DAY};
