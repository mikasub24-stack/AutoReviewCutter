from pathlib import Path
import sys
import tempfile
import threading
import unittest
import wave
from unittest.mock import patch
sys.path.insert(0,str(Path(__file__).resolve().parents[1]))
import core

def speech(key,text,path,**kwargs):
    with wave.open(str(path),'wb') as w:
        w.setnchannels(1);w.setsampwidth(2);w.setframerate(24000);w.writeframes(b'\0'*4800)
    return .1

class AutomaticTests(unittest.TestCase):
    def test_pipeline_preserves_project_audio_and_output(self):
        data=core.demo()
        for scene in data['scenes']:scene['narration']='Hello.'
        with tempfile.TemporaryDirectory() as td:
            output=Path(td)/'video.mp4'
            def render(data,folder,target,*args):
                self.assertTrue(Path(data['voice']).is_file());Path(target).write_bytes(b'finished-mp4')
            with patch.object(core,'generate',return_value=data),patch.object(core,'synthesize',side_effect=speech),patch.object(core,'render',side_effect=render):
                result=core.automatic_video('private-key','writing','tts','Title',12,'Điện ảnh','16:9','English',output,threading.Event())
            saved=core.load_project(result['project'])
            self.assertTrue(Path(saved['voice']).is_file());self.assertEqual(output.read_bytes(),b'finished-mp4')
            self.assertAlmostEqual(sum(s['duration'] for s in saved['scenes']),12)
            self.assertNotIn('private-key',Path(result['project']).read_text())

    def test_cancelled_audio_keeps_existing_recording(self):
        data=core.demo();data['scenes'][0]['narration']='Hello.'
        cancel=threading.Event()
        with tempfile.TemporaryDirectory() as td:
            target=Path(td)/'voice.wav';target.write_bytes(b'existing-recording')
            def cancelled_speech(*args,**kwargs):cancel.set();return speech(*args,**kwargs)
            with patch.object(core,'synthesize',side_effect=cancelled_speech):
                with self.assertRaises(core.TaskCancelled):core.create_narration(data,'key',target,Path(td),'tts',cancel)
            self.assertEqual(target.read_bytes(),b'existing-recording')
            self.assertFalse(target.with_name('voice.working.wav').exists())

if __name__=='__main__':unittest.main()
