import http from 'node:http';
import { randomUUID, timingSafeEqual, createHmac } from 'node:crypto';
import { readFile, writeFile, rename, mkdir } from 'node:fs/promises';
import path from 'node:path';

const HOST = process.env.HOST || '127.0.0.1';
const PORT = Number(process.env.PORT || 8787);
const DB = path.resolve(process.env.PAYMENT_DB || './data/orders.json');
const ADMIN_SECRET = process.env.SANDBOX_ADMIN_SECRET || '';
const MODE = process.env.PAYMENT_MODE || 'sandbox';
const BANK_ID = process.env.VIETQR_BANK_ID || '970422'; // MB Bank BIN
const ACCOUNT = process.env.VIETQR_ACCOUNT_NO || '';
const ITEMS = Object.freeze({
  lotus: {name:'Hoa sen ảo', price:10000},
  incense: {name:'Nhang trầm ảo', price:15000},
  lantern: {name:'Hoa đăng ảo', price:20000},
  cushion: {name:'Bồ đoàn trang trí', price:49000}
});
let state = {orders:{}, inventory:{}, processedTransactions:{}};
let pending = Promise.resolve();
const queue = fn => { const result = pending.then(fn); pending = result.catch(()=>{}); return result; };
const now = () => new Date().toISOString();
const equal = (a,b) => { const x=Buffer.from(a||''),y=Buffer.from(b||''); return x.length===y.length && timingSafeEqual(x,y); };
const send=(res,code,body)=>{res.writeHead(code,{'content-type':'application/json; charset=utf-8','cache-control':'no-store','access-control-allow-origin':'*','access-control-allow-headers':'content-type,authorization','access-control-allow-methods':'GET,POST,OPTIONS'});res.end(JSON.stringify(body));};
async function save(){await mkdir(path.dirname(DB),{recursive:true});const tmp=DB+'.tmp';await writeFile(tmp,JSON.stringify(state,null,2),{mode:0o600});await rename(tmp,DB);}
async function load(){try{state=JSON.parse(await readFile(DB,'utf8'));}catch(e){if(e.code!=='ENOENT')throw e;}}
function qrUrl(order){
  if(!ACCOUNT) return null;
  const description=encodeURIComponent(order.transferContent);
  return `https://img.vietqr.io/image/${BANK_ID}-${encodeURIComponent(ACCOUNT)}-compact2.png?amount=${order.amount}&addInfo=${description}`;
}
function complete(order, transactionId){
  if(order.status==='paid') { if(order.transactionId!==transactionId) throw new Error('Order already settled by another transaction'); return {alreadyPaid:true}; }
  if(order.status!=='pending') throw new Error('Order not pending');
  if(state.processedTransactions[transactionId]) throw new Error('Transaction already used');
  order.status='paid';order.paidAt=now();order.transactionId=transactionId;
  state.processedTransactions[transactionId]=order.id;
  const inv=state.inventory[order.playerId] ||= {};
  inv[order.itemId]=(inv[order.itemId]||0)+1;
  return {alreadyPaid:false};
}
async function handler(req,res){
 if(req.method==='OPTIONS')return send(res,204,{});
 const url=new URL(req.url,'http://localhost');
 if(url.pathname==='/health' && req.method==='GET')return send(res,200,{ok:true,mode:MODE,bank:'MB Bank',realPaymentsEnabled:false});
 if(url.pathname==='/api/items' && req.method==='GET')return send(res,200,{items:ITEMS});
 if(MODE!=='sandbox')return send(res,503,{error:'Real payments are disabled until a verified provider integration is implemented'});
 const chunks=[];let size=0;
 for await(const chunk of req){size+=chunk.length;if(size>16384)return send(res,413,{error:'Payload too large'});chunks.push(chunk);}
 let body={};try{if(chunks.length)body=JSON.parse(Buffer.concat(chunks).toString('utf8'));}catch{return send(res,400,{error:'Invalid JSON'});}
 if(url.pathname==='/api/orders' && req.method==='POST'){
   if(typeof body.playerId!=='string'||!/^[-_a-zA-Z0-9]{3,64}$/.test(body.playerId)||!ITEMS[body.itemId])return send(res,400,{error:'Invalid playerId or itemId'});
   return queue(async()=>{
     const id=randomUUID(), item=ITEMS[body.itemId];
     const order={id,playerId:body.playerId,itemId:body.itemId,amount:item.price,status:'pending',createdAt:now(),transferContent:'CV'+id.replaceAll('-','').slice(0,18).toUpperCase()};
     state.orders[id]=order;await save();
     send(res,201,{order,qrUrl:qrUrl(order),sandbox:true,note:!ACCOUNT?'Configure VIETQR_ACCOUNT_NO to display a demo QR. Do not transfer real money in sandbox.':'Demo QR only: no bank reconciliation; do not send money.'});
   });
 }
 const match=url.pathname.match(/^\/api\/orders\/([0-9a-f-]{36})$/);
 if(match && req.method==='GET'){const o=state.orders[match[1]];return o?send(res,200,{order:o}):send(res,404,{error:'Order not found'});}
 const inv=url.pathname.match(/^\/api\/inventory\/([-_a-zA-Z0-9]{3,64})$/);
 if(inv&&req.method==='GET')return send(res,200,{playerId:inv[1],items:state.inventory[inv[1]]||{}});
 if(url.pathname==='/api/sandbox/confirm'&&req.method==='POST'){
   if(!ADMIN_SECRET||!equal(req.headers.authorization?.replace(/^Bearer /,''),ADMIN_SECRET))return send(res,403,{error:'Admin sandbox token required'});
   if(typeof body.orderId!=='string'||typeof body.transactionId!=='string'||!/^[-_a-zA-Z0-9]{6,100}$/.test(body.transactionId))return send(res,400,{error:'Invalid confirmation'});
   return queue(async()=>{
     const order=state.orders[body.orderId];if(!order)return send(res,404,{error:'Order not found'});
     if(body.amount!==order.amount||body.transferContent!==order.transferContent)return send(res,422,{error:'Amount or transfer content mismatch'});
     try{const result=complete(order,body.transactionId);await save();return send(res,200,{ok:true,...result,order});}
     catch(e){return send(res,409,{error:e.message});}
   });
 }
 return send(res,404,{error:'Not found'});
}
await load();
const server=http.createServer((req,res)=>{handler(req,res).catch(e=>{console.error(e);if(!res.headersSent)send(res,500,{error:'Internal error'});});});
server.listen(PORT,HOST,()=>console.log(`Payment sandbox on http://${HOST}:${PORT} (real payments disabled)`));
