const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { execFile } = require('node:child_process');
const { promisify } = require('node:util');
const { mergeVideos, command } = require('../src/merge.cjs');
const exec = promisify(execFile);
test('merge refuses incomplete projects before running external tools', async () => {
  await assert.rejects(mergeVideos([{status:'failed'}],{output:'unused'}),/tất cả prompt/);
});
test('real FFmpeg merge preserves prompt order, handles mixed dimensions/audio, and keeps sources', async () => {
  const dir=await fs.mkdtemp(path.join(os.tmpdir(),'muse-merge-test-'));
  try {
    const red=path.join(dir,'red.mp4'),blue=path.join(dir,'blue.mp4');
    await command('ffmpeg',['-v','error','-f','lavfi','-i','color=red:s=160x90:r=24:d=0.6','-f','lavfi','-i','sine=frequency=440:duration=0.6','-c:v','libx264','-threads','1','-pix_fmt','yuv420p','-c:a','aac','-shortest',red]);
    await command('ffmpeg',['-v','error','-f','lavfi','-i','color=blue:s=90x160:r=25:d=0.6','-c:v','libx264','-threads','1','-pix_fmt','yuv420p',blue]);
    const final=await mergeVideos([{status:'completed',output:red},{status:'completed',output:blue}],{output:dir,width:160,height:90});
    const info=JSON.parse(await command('ffprobe',['-v','error','-show_format','-show_streams','-of','json',final]));
    assert.ok(Number(info.format.duration)>1.1 && Number(info.format.duration)<1.6);
    assert.ok(info.streams.some(s=>s.codec_type==='audio'));
    assert.equal(info.streams.find(s=>s.codec_type==='video').width,160);
    const pixel=async time=>(await exec('ffmpeg',['-v','error','-ss',time,'-i',final,'-frames:v','1','-vf','crop=2:2:(iw-2)/2:(ih-2)/2','-f','rawvideo','-pix_fmt','rgb24','pipe:1'],{encoding:'buffer'})).stdout;
    const first=await pixel('0.2'),second=await pixel('0.9');
    assert.ok(first[0]>first[2]+100,'first scene is red');assert.ok(second[2]>second[0]+100,'second scene is blue');
    await fs.access(red);await fs.access(blue);
    assert.equal((await fs.readdir(dir)).some(f=>f.startsWith('.muse-merge-')),false);
  } finally {await fs.rm(dir,{recursive:true,force:true});}
});
