const { spawn } = require('node:child_process');
const fs = require('node:fs/promises');
const path = require('node:path');
function command(executable, args, timeout = 900000) {
  return new Promise((resolve, reject) => {
    const child = spawn(executable, args, { windowsHide: true, shell: false });
    let stdout = '', stderr = '', timedOut = false;
    const timer = setTimeout(() => { timedOut = true; child.kill(); }, timeout);
    child.stdout.on('data', b => stdout = (stdout + b).slice(-1000000));
    child.stderr.on('data', b => stderr = (stderr + b).slice(-16000));
    child.once('error', e => { clearTimeout(timer); reject(Error(`Không mở được ${path.basename(executable)}: ${e.message}. Chọn FFmpeg và ffprobe trong Cài đặt.`)); });
    child.once('close', code => {
      clearTimeout(timer);
      if (timedOut) reject(Error('FFmpeg vượt thời gian xử lý.'));
      else if (code !== 0) reject(Error(`${path.basename(executable)} thất bại (${code}): ${stderr}`));
      else resolve(stdout);
    });
  });
}
function tools(ffmpeg = 'ffmpeg') {
  const ffprobe = path.dirname(ffmpeg) === '.' ? (process.platform === 'win32' ? 'ffprobe.exe' : 'ffprobe') : path.join(path.dirname(ffmpeg), process.platform === 'win32' ? 'ffprobe.exe' : 'ffprobe');
  return { ffmpeg, ffprobe };
}
async function checkTools(ffmpeg) {
  const t = tools(ffmpeg); await command(t.ffmpeg, ['-version'], 15000); await command(t.ffprobe, ['-version'], 15000); return t;
}
async function mergeVideos(jobs, { output, ffmpeg = 'ffmpeg', width = 1920, height = 1080, onProgress = () => {} }) {
  if (!jobs.length || jobs.some(j => j.status !== 'completed' || !j.output)) throw Error('Chỉ nối khi tất cả prompt đã có video hoàn tất.');
  const t = await checkTools(ffmpeg);
  await fs.mkdir(output, { recursive: true });
  const temp = await fs.mkdtemp(path.join(output, '.muse-merge-'));
  const final = path.join(output, `Muse_Final_${path.basename(temp).replace('.muse-merge-','')}.mp4`);
  try {
    for (let i = 0; i < jobs.length; i++) {
      onProgress(`Chuẩn hóa cảnh ${i + 1}/${jobs.length}`);
      await fs.access(jobs[i].output);
      const info = JSON.parse(await command(t.ffprobe, ['-v','error','-show_streams','-show_format','-of','json',jobs[i].output]));
      if (!info.streams.some(s => s.codec_type === 'video')) throw Error(`Cảnh ${i + 1} không có luồng video.`);
      const hasAudio = info.streams.some(s => s.codec_type === 'audio');
      const args = ['-hide_banner','-loglevel','error','-nostdin','-i',jobs[i].output];
      if (!hasAudio) args.push('-f','lavfi','-i','anullsrc=r=48000:cl=stereo');
      args.push('-map','0:v:0','-map',hasAudio ? '0:a:0' : '1:a:0',
        '-vf',`scale=${width}:${height}:force_original_aspect_ratio=decrease,pad=${width}:${height}:(ow-iw)/2:(oh-ih)/2,setsar=1,fps=30,format=yuv420p,setpts=PTS-STARTPTS`,
        '-af','asetpts=PTS-STARTPTS,apad','-c:v','libx264','-threads','2','-preset','fast','-crf','20','-c:a','aac','-ar','48000','-ac','2','-b:a','192k','-shortest',
        path.join(temp, `clip-${i}.mp4`));
      await command(t.ffmpeg, args);
    }
    // Relative generated filenames avoid concat-list path escaping and keep prompt order.
    await fs.writeFile(path.join(temp,'clips.txt'), jobs.map((_,i) => `file 'clip-${i}.mp4'`).join('\n'));
    onProgress('Đang nối video theo thứ tự prompt…');
    const staging = path.join(temp,'final.mp4');
    await command(t.ffmpeg, ['-hide_banner','-loglevel','error','-nostdin','-f','concat','-safe','1','-i',path.join(temp,'clips.txt'),'-c','copy','-movflags','+faststart',staging]);
    const result = JSON.parse(await command(t.ffprobe, ['-v','error','-show_format','-show_streams','-of','json',staging]));
    if (!(Number(result.format.duration) > 0) || !result.streams.some(s=>s.codec_type==='video')) throw Error('Video ghép chưa hợp lệ.');
    await fs.rename(staging,final); return final;
  } finally { await fs.rm(temp, { recursive: true, force: true }); }
}
module.exports = { mergeVideos, checkTools, command };
