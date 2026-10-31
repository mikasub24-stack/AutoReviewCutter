const {test}=require('node:test');
const assert=require('node:assert/strict');
const {EventEmitter}=require('node:events');
const fs=require('node:fs/promises');
const os=require('node:os');
const path=require('node:path');
const {capturePlaywrightDownload,captureElectronDownload,validateVideo}=require('../src/download-capture.cjs');

async function targetFor(t) {
  const directory=await fs.mkdtemp(path.join(os.tmpdir(),'muse-download-capture-'));
  t.after(()=>fs.rm(directory,{recursive:true,force:true}));
  return path.join(directory,'clips','video.part');
}
function gate() {let resolve;return{promise:new Promise(r=>resolve=r),resolve:()=>resolve()};}
function itemFor(data=Buffer.from('video fixture')) {
  return {cancelled:0,cancel:async function(){this.cancelled++;},failure:async()=>null,saveAs:async target=>fs.writeFile(target,data)};
}
function contentsFor() {const contents=new EventEmitter();contents.session=new EventEmitter();return contents;}
function electronItem() {
  const item=new EventEmitter();item.cancelled=0;item.cancel=()=>item.cancelled++;
  item.getReceivedBytes=()=>7;item.getTotalBytes=()=>20;item.setSavePath=target=>{item.target=target;};return item;
}
test('Playwright capture installs listener before synchronous download click and waits for actual saved file',async t=>{
  const page=new EventEmitter(),target=await targetFor(t),entered=gate(),save=gate(),progress=[];
  const item=itemFor();item.saveAs=async file=>{entered.resolve();await save.promise;await fs.writeFile(file,'real result');};
  let finished=false;
  const pending=capturePlaywrightDownload(page,target,{trigger:()=>{assert.equal(page.listenerCount('download'),1);page.emit('download',item);},onProgress:value=>progress.push(value)}).then(value=>{finished=true;return value;});
  await entered.promise;assert.equal(finished,false);assert.equal(page.listenerCount('download'),0);
  save.resolve();assert.equal(await pending,target);assert.equal(await fs.readFile(target,'utf8'),'real result');
  assert.deepEqual(progress,[{receivedBytes:0,totalBytes:0},{receivedBytes:11,totalBytes:11}]);
  assert.equal(page.listenerCount('close'),0);
});
test('Playwright stop before an event rejects promptly, removes listener, and ignores later download',async t=>{
  const page=new EventEmitter(),target=await targetFor(t),controller=new AbortController(),entered=gate();
  const pending=capturePlaywrightDownload(page,target,{signal:controller.signal,trigger:()=>entered.resolve()});
  await entered.promise;controller.abort();await assert.rejects(pending,{name:'AbortError'});
  const late=itemFor();page.emit('download',late);assert.equal(late.cancelled,0);
  assert.equal(page.listenerCount('download'),0);assert.equal(page.listenerCount('close'),0);await assert.rejects(fs.access(target));
});
test('Playwright stop during a stalled save cancels only the captured download',async t=>{
  const page=new EventEmitter(),target=await targetFor(t),controller=new AbortController(),entered=gate(),item=itemFor();
  item.saveAs=()=>{entered.resolve();return new Promise(()=>{});};
  const pending=capturePlaywrightDownload(page,target,{signal:controller.signal,trigger:()=>page.emit('download',item)});
  await entered.promise;controller.abort();await assert.rejects(pending,{name:'AbortError'});assert.equal(item.cancelled,1);assert.equal(page.listenerCount('close'),0);
});
test('Playwright capture rejects failed download and preserves a preexisting output',async t=>{
  const page=new EventEmitter(),target=await targetFor(t),item=itemFor();await fs.mkdir(path.dirname(target),{recursive:true});await fs.writeFile(target,'existing clip');
  item.saveAs=async()=>{throw Error('private signed URL detail');};
  await assert.rejects(capturePlaywrightDownload(page,target,{trigger:()=>page.emit('download',item)}),error=>/Không lưu được/.test(error.message)&&!error.message.includes('private'));
  assert.equal(await fs.readFile(target,'utf8'),'existing clip');assert.equal(page.listenerCount('download'),0);
});
test('trigger failure and timeout clean pending Playwright listeners',async t=>{
  const page=new EventEmitter(),target=await targetFor(t);
  await assert.rejects(capturePlaywrightDownload(page,target,{trigger:()=>{throw Error('Scoped response is ambiguous');}}),/ambiguous/);
  assert.equal(page.listenerCount('download'),0);
  await assert.rejects(capturePlaywrightDownload(page,target,{trigger:()=>{},timeoutMs:10}),/Hết thời gian/);
  assert.equal(page.listenerCount('download'),0);assert.equal(page.listenerCount('close'),0);
});
test('closed browser rejects pending capture and an already aborted request never clicks',async t=>{
  const page=new EventEmitter(),target=await targetFor(t),controller=new AbortController();let clicked=0;
  await assert.rejects(capturePlaywrightDownload(page,target,{trigger:()=>page.emit('close')}),/đã đóng/);
  controller.abort();await assert.rejects(capturePlaywrightDownload(page,target,{signal:controller.signal,trigger:()=>clicked++}),{name:'AbortError'});assert.equal(clicked,0);
});
test('Electron capture excludes sibling windows and reports real received bytes until done',async t=>{
  const contents=contentsFor(),target=await targetFor(t),item=electronItem(),sibling=electronItem(),entered=gate(),progress=[];let completed=false;
  const pending=captureElectronDownload(contents,target,{onProgress:value=>progress.push(value),trigger:()=>{
    contents.session.emit('will-download',{},sibling,{});assert.equal(sibling.target,undefined);
    contents.session.emit('will-download',{},item,contents);entered.resolve();
  }}).then(value=>{completed=true;return value;});
  await entered.promise;assert.equal(item.target,target);assert.equal(completed,false);assert.equal(contents.session.listenerCount('will-download'),0);
  item.emit('updated',{},'progressing');assert.deepEqual(progress.at(-1),{receivedBytes:7,totalBytes:20});
  item.emit('done',{},'completed');assert.equal(await pending,target);assert.equal(item.cancelled,0);
  assert.equal(item.listenerCount('updated'),0);assert.equal(item.listenerCount('done'),0);assert.equal(contents.listenerCount('destroyed'),0);
});
test('Electron stop cancels the selected item and removes session listeners immediately',async t=>{
  const contents=contentsFor(),target=await targetFor(t),item=electronItem(),controller=new AbortController(),entered=gate();
  const pending=captureElectronDownload(contents,target,{signal:controller.signal,trigger:()=>{contents.session.emit('will-download',{},item,contents);entered.resolve();}});
  await entered.promise;controller.abort();await assert.rejects(pending,{name:'AbortError'});assert.equal(item.cancelled,1);
  item.emit('done',{},'completed');assert.equal(contents.session.listenerCount('will-download'),0);assert.equal(item.listenerCount('done'),0);
});
test('Electron cancellation, failed trigger, and close never mark output completed',async t=>{
  const contents=contentsFor(),target=await targetFor(t),item=electronItem();
  await assert.rejects(captureElectronDownload(contents,target,{trigger:()=>{contents.session.emit('will-download',{},item,contents);item.emit('done',{},'cancelled');}}),/chưa hoàn tất/);
  await assert.rejects(captureElectronDownload(contents,target,{trigger:()=>{throw Error('No scoped download menu');}}),/No scoped/);
  await assert.rejects(captureElectronDownload(contents,target,{trigger:()=>contents.emit('destroyed')}),/đã đóng/);
  assert.equal(contents.session.listenerCount('will-download'),0);assert.equal(contents.listenerCount('destroyed'),0);
});

function box(type,...parts) {const body=Buffer.concat(parts),head=Buffer.alloc(8);head.writeUInt32BE(body.length+8);head.write(type,4);return Buffer.concat([head,body]);}
function mp4(handler='vide') {
  return Buffer.concat([box('ftyp',Buffer.from('isom\0\0\0\0isom')),box('mdat',Buffer.from([1,2,3])),box('moov',box('trak',box('mdia',box('hdlr',Buffer.alloc(8),Buffer.from(handler),Buffer.alloc(12)))))]);
}
test('video validation accepts an MP4 video track with metadata after media bytes',async t=>{
  const target=await targetFor(t);await fs.mkdir(path.dirname(target),{recursive:true});await fs.writeFile(target,mp4());
  assert.deepEqual(await validateVideo(target),{extension:'.mp4',mimeType:'video/mp4',size:mp4().length});
});
test('video validation rejects HTML, audio-only MP4, truncated containers, and header-only stubs',async t=>{
  const target=await targetFor(t);await fs.mkdir(path.dirname(target),{recursive:true});
  for(const bytes of [Buffer.from('<html>login required</html>'),mp4('soun'),mp4().subarray(0,mp4().length-1),box('ftyp',Buffer.from('isom\0\0\0\0'))]) {
    await fs.writeFile(target,bytes);await assert.rejects(validateVideo(target),/chưa phải video MP4/);
  }
});

function ebml(id,body,unknown=false) {
  let hexadecimal=id.toString(16);if(hexadecimal.length%2)hexadecimal='0'+hexadecimal;
  let length=1;while(BigInt(body.length)>=(1n<<BigInt(length*7))-1n)length++;
  const size=Buffer.alloc(unknown?8:length);let value=BigInt(body.length)|(1n<<BigInt(length*7));
  for(let index=length-1;index>=0;index--){size[index]=Number(value&255n);value>>=8n;}
  if(unknown){size.fill(255);size[0]=1;}
  return Buffer.concat([Buffer.from(hexadecimal,'hex'),size,body]);
}
function webm({type=1,codec='V_VP9',unknown=false,media=true,frameTrack=1,doctype='webm',group=false}={}) {
  const track=ebml(0xAE,Buffer.concat([ebml(0xD7,Buffer.from([1])),ebml(0x83,Buffer.from([type])),ebml(0x86,Buffer.from(codec))]));
  let block=ebml(group?0xA1:0xA3,Buffer.from([0x80|frameTrack,0,0,0x80,1,2,3]));
  if(group)block=ebml(0xA0,block);
  const segment=Buffer.concat([ebml(0x1654AE6B,track),...(media?[ebml(0x1F43B675,block)]:[])]);
  return Buffer.concat([ebml(0x1A45DFA3,ebml(0x4282,Buffer.from(doctype))),ebml(0x18538067,segment,unknown)]);
}
test('video validation recognizes VP8/VP9/AV1 WebM and unknown-size Segment with real video-track blocks',async t=>{
  const target=await targetFor(t);await fs.mkdir(path.dirname(target),{recursive:true});
  for(const options of [{codec:'V_VP8'},{codec:'V_VP9',unknown:true},{codec:'V_AV1',group:true}]) {
    const bytes=webm(options);await fs.writeFile(target,bytes);
    assert.deepEqual(await validateVideo(target),{extension:'.webm',mimeType:'video/webm',size:bytes.length});
  }
});
test('WebM validation rejects audio-only, missing or mismatched media, unsupported codec, and truncation',async t=>{
  const target=await targetFor(t);await fs.mkdir(path.dirname(target),{recursive:true});
  const complete=webm(),unknown=webm({unknown:true});
  for(const bytes of [webm({type:2,codec:'A_OPUS'}),webm({media:false}),webm({frameTrack:2}),webm({codec:'V_FAKE'}),webm({doctype:'matroska'}),complete.subarray(0,complete.length-1),unknown.subarray(0,unknown.length-1)]) {
    await fs.writeFile(target,bytes);await assert.rejects(validateVideo(target),/chưa phải video MP4\/WebM/);
  }
});
