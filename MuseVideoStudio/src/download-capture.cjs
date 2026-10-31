const fs = require('node:fs/promises');
const path = require('node:path');

function stopped() { return Object.assign(Error('Đã dừng tải video.'), {name:'AbortError'}); }
function progress(callback, value) { try { callback?.(value); } catch {} }
function cancel(item) { try { Promise.resolve(item?.cancel()).catch(() => {}); } catch {} }

// The caller owns the prompt/result binding and supplies the click operation.
// Install the browser listener first: downloads can start synchronously on click.
async function capturePlaywrightDownload(page, target, {signal, trigger, onProgress, timeoutMs=180000} = {}) {
  if (signal?.aborted) throw stopped();
  if (typeof trigger !== 'function') throw Error('Chưa có thao tác tải video.');
  await fs.mkdir(path.dirname(target), {recursive:true});
  if (signal?.aborted) throw stopped();
  return new Promise((resolve,reject) => {
    let settled=false, item, timer;
    const cleanup=() => {
      clearTimeout(timer); page.removeListener('download',onDownload); page.removeListener('close',onClose);
      signal?.removeEventListener('abort',onAbort);
    };
    const finish=(error) => {
      if(settled)return;
      settled=true;cleanup();
      if(error){cancel(item);reject(error);}else resolve(target);
    };
    const onAbort=()=>finish(stopped());
    const onClose=()=>finish(Error('Trình duyệt đã đóng khi tải video.'));
    function onDownload(download) {
      if(settled||item)return;
      item=download;page.removeListener('download',onDownload);
      if(signal?.aborted){finish(stopped());return;}
      progress(onProgress,{receivedBytes:0,totalBytes:0});
      (async()=>{
        await item.saveAs(target);
        if(settled)return;
        if(await item.failure())throw Error('Tải video chưa hoàn tất.');
        const {size}=await fs.stat(target);
        if(settled)return;
        progress(onProgress,{receivedBytes:size,totalBytes:size});finish();
      })().catch(()=>finish(signal?.aborted?stopped():Error('Không lưu được video. Kiểm tra mục tải xuống trong Muse; tool chưa gửi lại prompt.')));
    }
    page.on('download',onDownload);page.once('close',onClose);
    signal?.addEventListener('abort',onAbort,{once:true});
    timer=setTimeout(()=>finish(Error('Hết thời gian tải video. Kiểm tra mục tải xuống trong Muse.')),timeoutMs);
    if(signal?.aborted){onAbort();return;}
    Promise.resolve().then(()=>{if(!settled)return trigger();}).catch(error=>finish(error));
  });
}

async function captureElectronDownload(contents, target, {signal, trigger, onProgress, timeoutMs=180000} = {}) {
  if(signal?.aborted)throw stopped();
  if(typeof trigger!=='function')throw Error('Chưa có thao tác tải video.');
  await fs.mkdir(path.dirname(target),{recursive:true});
  if(signal?.aborted)throw stopped();
  const session=contents.session;
  return new Promise((resolve,reject)=>{
    let settled=false,item,timer;
    const cleanup=()=>{
      clearTimeout(timer);session.removeListener('will-download',onDownload);contents.removeListener('destroyed',onClose);
      signal?.removeEventListener('abort',onAbort);
      item?.removeListener('updated',onUpdated);item?.removeListener('done',onDone);
    };
    const finish=error=>{
      if(settled)return;
      settled=true;cleanup();
      if(error){cancel(item);reject(error);}else resolve(target);
    };
    const onAbort=()=>finish(stopped());
    const onClose=()=>finish(Error('Trình duyệt đã đóng khi tải video.'));
    function onUpdated() {
      try { progress(onProgress,{receivedBytes:item.getReceivedBytes(),totalBytes:item.getTotalBytes()}); } catch {}
    }
    function onDone(_event,state) {
      if(state!=='completed'){finish(signal?.aborted?stopped():Error('Tải video chưa hoàn tất.'));return;}
      onUpdated();finish();
    }
    function onDownload(_event,download,sourceContents) {
      // A persistent partition can serve multiple windows. Never capture a
      // sibling window's download just because it shares this session.
      if(settled||item||sourceContents!==contents)return;
      item=download;session.removeListener('will-download',onDownload);
      if(signal?.aborted){finish(stopped());return;}
      try {
        item.on('updated',onUpdated);item.once('done',onDone);
        item.setSavePath(target);onUpdated();
      } catch {finish(Error('Không lưu được video vào thư mục đã chọn.'));}
    }
    session.on('will-download',onDownload);contents.once('destroyed',onClose);
    signal?.addEventListener('abort',onAbort,{once:true});
    timer=setTimeout(()=>finish(Error('Hết thời gian tải video. Kiểm tra mục tải xuống trong Muse.')),timeoutMs);
    if(signal?.aborted){onAbort();return;}
    Promise.resolve().then(()=>{if(!settled)return trigger();}).catch(error=>finish(error));
  });
}

async function validateWebm(handle,size) {
  let elements=0;
  const videoTracks=new Set(),blockTracks=new Set(),trackNumbers=new Set();
  async function read(position,length) {
    if(length<1||length>256||position<0||position+length>size)throw Error('Invalid EBML read');
    const bytes=Buffer.alloc(length),result=await handle.read(bytes,0,length,position);
    if(result.bytesRead!==length)throw Error('Truncated EBML');
    return bytes;
  }
  async function vint(position,end,id=false) {
    if(position>=end)throw Error('Missing EBML integer');
    const first=(await read(position,1))[0];let length=1,marker=0x80;
    while(length<=8&&!(first&marker)){length++;marker>>=1;}
    if(length>(id?4:8)||position+length>end)throw Error('Invalid EBML integer');
    const bytes=await read(position,length);let value=BigInt(id?bytes[0]:bytes[0]&(marker-1));
    for(let index=1;index<length;index++)value=(value<<8n)|BigInt(bytes[index]);
    const unknown=!id&&value===(1n<<BigInt(length*7))-1n;
    if(value>BigInt(Number.MAX_SAFE_INTEGER)&&!unknown)throw Error('EBML integer too large');
    return{value:unknown?null:Number(value),length,unknown};
  }
  async function element(position,end,allowUnknown=false) {
    if(++elements>100000)throw Error('Too many EBML elements');
    const id=await vint(position,end,true),length=await vint(position+id.length,end);
    const data=position+id.length+length.length;
    if(length.unknown&&!allowUnknown)throw Error('Unknown EBML child length');
    const next=length.unknown?end:data+length.value;
    if(next>end||next<data)throw Error('Truncated EBML element');
    return{id:id.value,data,end:next,unknown:length.unknown};
  }
  async function uint(item) {
    const length=item.end-item.data;if(length<1||length>8)throw Error('Invalid EBML unsigned integer');
    const bytes=await read(item.data,length);let value=0n;
    for(const byte of bytes)value=(value<<8n)|BigInt(byte);
    if(value>BigInt(Number.MAX_SAFE_INTEGER))throw Error('EBML unsigned integer too large');
    return Number(value);
  }
  async function track(entry) {
    let number,type,codec='';
    for(let position=entry.data;position<entry.end;){
      const child=await element(position,entry.end);position=child.end;
      if(child.id===0xD7)number=await uint(child);
      if(child.id===0x83)type=await uint(child);
      if(child.id===0x86)codec=(await read(child.data,child.end-child.data)).toString('ascii');
    }
    if(!number||trackNumbers.has(number))throw Error('Invalid WebM track');
    trackNumbers.add(number);
    if(type===1&&['V_VP8','V_VP9','V_AV1'].includes(codec))videoTracks.add(number);
  }
  async function block(item) {
    const number=await vint(item.data,item.end);
    // TrackNumber, signed timecode, flags, then at least one frame byte.
    if(number.unknown||!number.value||item.end-item.data<=number.length+3)throw Error('Incomplete WebM block');
    blockTracks.add(number.value);
  }
  async function cluster(item) {
    for(let position=item.data;position<item.end;){
      const child=await element(position,item.end);position=child.end;
      if(child.id===0xA3)await block(child);
      if(child.id===0xA0)for(let at=child.data;at<child.end;){
        const grouped=await element(at,child.end);at=grouped.end;if(grouped.id===0xA1)await block(grouped);
      }
    }
  }
  const header=await element(0,size);if(header.id!==0x1A45DFA3)throw Error('Missing EBML header');
  let doctype='';
  for(let position=header.data;position<header.end;){
    const child=await element(position,header.end);position=child.end;
    if(child.id===0x4282)doctype=(await read(child.data,child.end-child.data)).toString('ascii');
  }
  if(doctype!=='webm')throw Error('Not a WebM document');
  let segmentFound=false;
  for(let position=header.end;position<size;){
    const segment=await element(position,size,true);position=segment.end;
    if(segment.id===0xEC||segment.id===0xBF){if(segment.unknown)throw Error('Unknown padding size');continue;}
    if(segment.id!==0x18538067||segmentFound)throw Error('Invalid WebM segment');
    segmentFound=true;
    for(let at=segment.data;at<segment.end;){
      const child=await element(at,segment.end);at=child.end;
      if(child.id===0x1654AE6B)for(let cursor=child.data;cursor<child.end;){
        const entry=await element(cursor,child.end);cursor=entry.end;if(entry.id===0xAE)await track(entry);
      }
      if(child.id===0x1F43B675)await cluster(child);
    }
  }
  if(!segmentFound||![...videoTracks].some(number=>blockTracks.has(number)))throw Error('Missing WebM video frames');
}

// Inspect container headers through seeks, including videos with a large mdat
// before moov. HTML responses and audio-only MP4/WebM files are not videos.
async function validateVideo(target) {
  const handle=await fs.open(target,'r');
  try {
    const {size}=await handle.stat();
    if(!size||!Number.isSafeInteger(size))throw Error('Invalid size');
    const signature=Buffer.alloc(4);if((await handle.read(signature,0,4,0)).bytesRead!==4)throw Error('Truncated video');
    if(signature.readUInt32BE(0)===0x1A45DFA3){await validateWebm(handle,size);return{extension:'.webm',mimeType:'video/webm',size};}
    let boxes=0,brand=false,media=false,video=false;
    async function read(position,length) {
      const bytes=Buffer.alloc(length),result=await handle.read(bytes,0,length,position);
      if(result.bytesRead!==length)throw Error('Truncated box');
      return bytes;
    }
    async function scan(start,end,ancestors=[]) {
      let position=start;
      while(position<end) {
        if(++boxes>100000||end-position<8)throw Error('Invalid boxes');
        const head=await read(position,8);let length=head.readUInt32BE(0),header=8;
        const type=head.toString('ascii',4,8);
        if(length===1) {
          if(end-position<16)throw Error('Truncated extended box');
          const extended=(await read(position+8,8)).readBigUInt64BE(0);
          if(extended>BigInt(Number.MAX_SAFE_INTEGER))throw Error('Box too large');
          length=Number(extended);header=16;
        } else if(length===0)length=end-position;
        if(length<header||length>end-position)throw Error('Truncated box');
        const data=position+header,next=position+length;
        if(!ancestors.length&&type==='ftyp'&&next-data>=8)brand=true;
        if(!ancestors.length&&type==='mdat'&&next>data)media=true;
        if(type==='hdlr'&&ancestors.join('/')==='moov/trak/mdia'&&next-data>=12) {
          if((await read(data+8,4)).toString('ascii')==='vide')video=true;
        }
        if((!ancestors.length&&type==='moov')||(ancestors.join('/')==='moov'&&type==='trak')||(ancestors.join('/')==='moov/trak'&&type==='mdia'))await scan(data,next,[...ancestors,type]);
        position=next;
      }
    }
    await scan(0,size);
    if(!brand||!media||!video)throw Error('Missing video track');
    return {extension:'.mp4',mimeType:'video/mp4',size};
  } catch {
    throw Error('Tệp tải về chưa phải video MP4/WebM đầy đủ. Kiểm tra video trong Muse trước khi gửi lại prompt.');
  } finally {await handle.close();}
}

module.exports={capturePlaywrightDownload,captureElectronDownload,validateVideo};
