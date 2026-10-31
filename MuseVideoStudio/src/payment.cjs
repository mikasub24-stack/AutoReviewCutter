const QR=require('qrcode');
const details={bank:'BIDV',account:'3950588072',name:'TRIEU VAN TINH'};
const field=(id,value)=>id+Buffer.byteLength(value,'utf8').toString().padStart(2,'0')+value;
function crc16(text){let crc=0xffff;for(const b of Buffer.from(text)){crc^=b<<8;for(let i=0;i<8;i++)crc=(crc&0x8000)?((crc<<1)^0x1021)&0xffff:(crc<<1)&0xffff;}return crc.toString(16).toUpperCase().padStart(4,'0');}
function payload(device=''){const consumer=field('00','970418')+field('01',details.account),merchant=field('00','A000000727')+field('01',consumer)+field('02','QRIBFTTA');let s=field('00','01')+field('01','11')+field('38',merchant)+field('53','704')+field('58','VN')+field('59',details.name);if(device)s+=field('62',field('08','MUSE '+device.replace(/[^A-Z0-9]/gi,'').slice(0,24)));s+='6304';return s+crc16(s);}
async function payment(device){return{...details,content:'MUSE '+device,qr:await QR.toDataURL(payload(device),{errorCorrectionLevel:'M',margin:4,width:380})};}
module.exports={details,payload,crc16,payment};
