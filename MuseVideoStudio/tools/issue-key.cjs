// Owner only: private signing key must NEVER be committed or shipped in the app.
const fs=require('node:fs'),crypto=require('node:crypto');
const[file,device,daysText='30']=process.argv.slice(2),days=Number(daysText);
if(!file||!device||!Number.isFinite(days)||days<=0||days>3650){console.error('Usage: node tools/issue-key.cjs <PRIVATE.pem> <DEVICE_CODE> [days]');process.exit(1);}
const now=Date.now(),data={product:'MuseVideoStudio',device:device.trim().toUpperCase(),issuedAt:now,expiresAt:now+days*86400000};
const bytes=Buffer.from(JSON.stringify(data));console.log(bytes.toString('base64url')+'.'+crypto.sign(null,bytes,fs.readFileSync(file)).toString('base64url'));
