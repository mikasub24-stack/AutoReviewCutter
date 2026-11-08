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
