// Real Chromium download fixture. No Muse account or live network requests.
// Requires a local Chromium and FFmpeg; this is intentionally a separate smoke
// check so Windows packaging does not acquire a runtime FFmpeg dependency.
const assert=require('node:assert/strict');
const fs=require('node:fs/promises');
const os=require('node:os');
const path=require('node:path');
const {execFileSync}=require('node:child_process');
const http=require('node:http');
const {chromium}=require('playwright-core');
const {capturePlaywrightDownload,validateVideo}=require('../src/download-capture.cjs');

(async()=>{
  const directory=await fs.mkdtemp(path.join(os.tmpdir(),'muse-real-download-'));
  let browser,server;
  const connections=new Set();
  try {
    const fixture=process.env.MUSE_VIDEO_FIXTURE||path.join(directory,'source.mp4');
    if(!process.env.MUSE_VIDEO_FIXTURE)execFileSync(process.env.FFMPEG||'ffmpeg',['-loglevel','error','-f','lavfi','-i','color=c=blue:s=64x64:d=0.2','-c:v','libx264','-pix_fmt','yuv420p','-y',fixture],{stdio:'pipe'});
    const webmFixture=process.env.MUSE_WEBM_FIXTURE||path.join(directory,'source.webm');
    if(!process.env.MUSE_WEBM_FIXTURE)execFileSync(process.env.FFMPEG||'ffmpeg',['-loglevel','error','-f','lavfi','-i','color=c=blue:s=64x64:d=0.2','-c:v','libvpx-vp9','-pix_fmt','yuv420p','-y',webmFixture],{stdio:'pipe'});
    const bytes=await fs.readFile(fixture),webmBytes=await fs.readFile(webmFixture),requests=[];
    browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH||'/usr/bin/chromium',headless:true,args:['--no-sandbox']});
    const context=await browser.newContext({acceptDownloads:true});
    server=http.createServer((request,response)=>{
      const address=new URL(request.url,'http://localhost');requests.push(address.pathname);
      if(address.pathname==='/slow.mp4') {
        response.writeHead(200,{'content-type':'video/mp4','content-disposition':'attachment; filename="muse-slow.mp4"','content-length':bytes.length*1000});response.write(bytes);return;
      }
      if(address.pathname==='/matched.webm') {
        response.writeHead(200,{'content-type':'video/webm','content-disposition':'attachment; filename="muse-result.webm"','content-length':webmBytes.length});response.end(webmBytes);return;
      }
      if(address.pathname==='/matched.mp4'||address.pathname==='/wrong.mp4') {
        response.writeHead(200,{'content-type':'video/mp4','content-disposition':'attachment; filename="muse-result.mp4"','content-length':bytes.length});response.end(bytes);return;
      }
      if(address.pathname!=='/chat'){response.writeHead(404);response.end();return;}
      response.writeHead(200,{'content-type':'text/html; charset=utf-8'});response.end(`<!doctype html><html><body>
        <article data-result="old"><p>Older response</p><button onclick="this.nextElementSibling.hidden=false">…</button><div hidden role="menu"><a role="menuitem" download href="/wrong.mp4">Tải xuống</a></div></article>
        <article data-result="matched"><p>Result for current prompt</p><button onclick="this.nextElementSibling.hidden=false">…</button><div hidden role="menu"><a role="menuitem" download href="/matched.mp4">Tải xuống</a></div></article>
        <article data-result="webm"><p>WebM result for current prompt</p><button onclick="this.nextElementSibling.hidden=false">…</button><div hidden role="menu"><a role="menuitem" download href="/matched.webm">Tải xuống</a></div></article>
        <a id="slow" download href="/slow.mp4">Slow download fixture</a>
      </body></html>`);
    });
    server.on('connection',socket=>{connections.add(socket);socket.on('close',()=>connections.delete(socket));});
    await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
    const page=await context.newPage();
    await page.goto('http://127.0.0.1:'+server.address().port+'/chat');
    const output=path.join(directory,'download','result.part'),progress=[];
    const initialListeners={download:page.listenerCount('download'),close:page.listenerCount('close')};
    const saved=await capturePlaywrightDownload(page,output,{timeoutMs:10000,onProgress:value=>progress.push(value),trigger:async()=>{
      // The fixture has an older, equally named Download action. Only the
      // result associated with this prompt is allowed to receive the click.
      const result=page.locator('[data-result="matched"]');
      await result.locator('button').click();
      await result.getByRole('menuitem',{name:'Tải xuống'}).click();
    }});
    assert.equal(saved,output);assert.deepEqual(await fs.readFile(output),bytes);
    const info=await validateVideo(output);assert.equal(info.mimeType,'video/mp4');assert.equal(info.size,bytes.length);
    assert.equal(requests.filter(value=>value==='/matched.mp4').length,1);assert.equal(requests.includes('/wrong.mp4'),false);
    assert.equal(page.listenerCount('download'),initialListeners.download);assert.equal(page.listenerCount('close'),initialListeners.close);
    assert.deepEqual(progress.at(-1),{receivedBytes:bytes.length,totalBytes:bytes.length});
    const webmOutput=path.join(directory,'download','webm-result.part');
    await capturePlaywrightDownload(page,webmOutput,{timeoutMs:10000,trigger:async()=>{
      const result=page.locator('[data-result="webm"]');await result.locator('button').click();await result.getByRole('menuitem',{name:'Tải xuống'}).click();
    }});
    assert.deepEqual(await fs.readFile(webmOutput),webmBytes);
    assert.deepEqual(await validateVideo(webmOutput),{extension:'.webm',mimeType:'video/webm',size:webmBytes.length});
    const controller=new AbortController();
    await assert.rejects(capturePlaywrightDownload(page,path.join(directory,'download','aborted.part'),{signal:controller.signal,timeoutMs:10000,trigger:async()=>{
      page.once('download',()=>controller.abort());await page.locator('#slow').click();
    }}),{name:'AbortError'});
    assert.equal(page.listenerCount('download'),initialListeners.download);assert.equal(page.listenerCount('close'),initialListeners.close);
    console.log('PASS real Chromium: scoped menu downloads exact MP4 and WebM, saves and validates video bytes; stopping an in-flight download rejects and cleans listeners.');
  } finally {
    await browser?.close();for(const socket of connections)socket.destroy();if(server)await new Promise(resolve=>server.close(resolve));await fs.rm(directory,{recursive:true,force:true});
  }
})().catch(error=>{console.error(error);process.exitCode=1;});
