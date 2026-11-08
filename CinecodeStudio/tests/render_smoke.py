"""Real browser/ffmpeg test, including motion, Unicode paths and mixed audio."""
import json
import os
from pathlib import Path
import struct
import subprocess
import sys
import tempfile
import threading
import traceback
import wave
from unittest.mock import patch
sys.path.insert(0,str(Path(__file__).resolve().parents[1]))
import core

def report_error(kind, value, tb):
    detail=''.join(traceback.format_exception(kind,value,tb))
    print('::error title=Cinecode real render::'+detail.replace('%','%25').replace('\r','%0D').replace('\n','%0A'),flush=True)
    sys.__excepthook__(kind,value,tb)
sys.excepthook=report_error

with tempfile.TemporaryDirectory(prefix='cinecode-tiếng-Việt-') as td:
    folder=Path(td);data=core.demo();data['scenes']=data['scenes'][:1];data['scenes'][0]['duration']=1
    data['scenes'][0]['title']='Tiếng Việt: Bình yên';data['ratio']='9:16'
    wav=folder/'nhạc.wav'
    with wave.open(str(wav),'wb') as w:
        import math
        w.setnchannels(1);w.setsampwidth(2);w.setframerate(24000)
        w.writeframes(b''.join(struct.pack('<h',int(2000*math.sin(i*.0576))) for i in range(24000)))
    data.update(music=str(wav),voice=str(wav));output=folder/'kết quả.mp4'
    core.render(data,folder,output,threading.Event(),print)
    # Decode the complete output with the bundled encoder; no extra ffprobe installation required.
    probe=subprocess.run([core.executable('ffmpeg'),'-hide_banner','-i',str(output),'-f','null','-'],
                         capture_output=True, text=True, encoding='utf-8', errors='replace')
    assert probe.returncode==0,probe.stderr
    assert '720x1280' in probe.stderr,probe.stderr
    assert 'Audio: aac' in probe.stderr,probe.stderr
    assert 'Duration: 00:00:01.' in probe.stderr,probe.stderr
    html=core.build_html(data,folder)
    cmd=[core.executable('node'),str(core.ROOT/'vendor/capture.mjs'),'--url',str(html),'--verify']
    if os.environ.get('CINECODE_CAPTURE_FLAGS'):cmd+=['--flags',os.environ['CINECODE_CAPTURE_FLAGS']]
    subprocess.run(cmd,check=True)
    print('RENDER PASS: Unicode path, portrait MP4, audio mix, deterministic frames')
    long=core.demo();long['scenes']=[dict(long['scenes'][i%3],duration=15) for i in range(40)]
    html=core.build_html(long,folder/'long')
    cmd=[core.executable('node'),str(core.ROOT/'vendor/capture.mjs'),'--url',str(html),'--probe']
    if os.environ.get('CINECODE_CAPTURE_FLAGS'):cmd+=['--flags',os.environ['CINECODE_CAPTURE_FLAGS']]
    probe=subprocess.run(cmd,check=True,capture_output=True,text=True,encoding='utf-8')
    assert '18000 frames' in probe.stdout,probe.stdout
    frames=folder/'long-frames'
    cmd=[core.executable('node'),str(core.ROOT/'vendor/capture.mjs'),'--url',str(html),
         '--frames','0,9000,17999','--out',str(frames),'--format','jpeg']
    if os.environ.get('CINECODE_CAPTURE_FLAGS'):cmd+=['--flags',os.environ['CINECODE_CAPTURE_FLAGS']]
    subprocess.run(cmd,check=True)
    assert len(list(frames.glob('*.jpg')))==3
    print('LONG TIMELINE PASS: 600 seconds, 18000 frames, first/middle/last frames captured')
    automatic=core.demo();automatic['scenes']=automatic['scenes'][:1]
    automatic['scenes'][0].update(duration=1,narration='Hello.')
    def speech(key,text,path,**kwargs):
        with wave.open(str(path),'wb') as w:w.setnchannels(1);w.setsampwidth(2);w.setframerate(24000);w.writeframes(b'\0'*4800)
        return .1
    with patch.object(core,'generate',return_value=automatic),patch.object(core,'synthesize',side_effect=speech):
        result=core.automatic_video('test-key','test-writing','test-tts','Title',15,'Điện ảnh','16:9','English',folder/'auto.mp4',threading.Event(),print)
    assert Path(result['output']).is_file() and Path(result['project']).is_file()
    assert Path(core.load_project(result['project'])['voice']).is_file()
    print('AUTOMATIC PASS: fixture AI, real audio assembly, real Chromium render and MP4 export')
