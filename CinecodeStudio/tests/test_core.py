import json
import base64
import io
from pathlib import Path
import sys
import tempfile
import unittest
import wave
from unittest.mock import patch
sys.path.insert(0,str(Path(__file__).resolve().parents[1]))
import core

class CoreTests(unittest.TestCase):
    def test_project_roundtrip_and_relative_assets(self):
        with tempfile.TemporaryDirectory() as td:
            path=Path(td)/'Tiếng Việt.cinecode.json';d=core.demo()
            d['scenes'][0]['image']='ảnh.png';d['music']='nhạc.mp3'
            core.save_project(path,d);restored=core.load_project(path)
            self.assertEqual(restored['title'],d['title'])
            self.assertEqual(restored['scenes'][0]['image'],str(path.parent/'ảnh.png'))
            self.assertEqual(restored['music'],str(path.parent/'nhạc.mp3'))

    def test_script_text_is_not_executable(self):
        with tempfile.TemporaryDirectory() as td:
            d=core.demo();d['scenes'][0]['title']='</script><script>alert(1)</script>'
            html=core.build_html(d,td).read_text(encoding='utf-8')
            self.assertNotIn('</script><script>alert',html)
            self.assertIn('\\u003c/script',html)
            self.assertIn('captureFrame',html)

    def test_invalid_ai_and_finite_durations(self):
        for duration in (0,61,float('nan'),float('inf')):
            with self.assertRaises(ValueError):core.validate({'scenes':[{'duration':duration}]})
        with self.assertRaises(ValueError):core.validate({'scenes':[]})
        d=core.demo();self.assertEqual(core.parse_ai('```json\n'+json.dumps(d)+'\n```'),d)
        with self.assertRaises(ValueError):core.request_ai('x','../../secrets',{})

    def test_missing_image_is_explained(self):
        with tempfile.TemporaryDirectory() as td:
            d=core.demo();d['scenes'][0]['image']=str(Path(td)/'missing.png')
            with self.assertRaisesRegex(ValueError,'Không tìm thấy ảnh'):core.build_html(d,td)

    def test_download_copy_keeps_original_and_supports_same_path(self):
        with tempfile.TemporaryDirectory() as td:
            source=Path(td)/'đã xuất.mp4';source.write_bytes(b'video-content')
            target=Path(td)/'tải video.mp4';target.write_bytes(b'older-copy')
            core.copy_video(source,target)
            self.assertEqual(source.read_bytes(),target.read_bytes())
            self.assertEqual(core.copy_video(source,source),source)
            self.assertEqual(source.read_bytes(),b'video-content')
            self.assertFalse(list(Path(td).glob('.cinecode-copy-*')))

    def test_english_narration_request_and_project(self):
        with patch.object(core,'request_ai',return_value={'candidates':[{'content':{'parts':[{'text':json.dumps(core.demo())}]}}]}) as request:
            data=core.generate('secret','gemini-2.5-flash','A calm morning',30,'Điện ảnh','16:9','English')
            self.assertEqual(core.validate(data)['narrationLanguage'],'English')
            self.assertIn('narration bằng English',request.call_args.args[2]['contents'][0]['parts'][0]['text'])

    def test_tts_audio_and_english_instruction(self):
        buffer=io.BytesIO()
        with wave.open(buffer,'wb') as w:
            w.setnchannels(1);w.setsampwidth(2);w.setframerate(24000);w.writeframes(b'\0'*4800)
        reply={'steps':[{'type':'model_output','content':[{'type':'audio','data':base64.b64encode(buffer.getvalue()).decode()}]}]}
        with tempfile.TemporaryDirectory() as td,patch.object(core,'request_ai',return_value=reply) as request:
            duration=core.synthesize('secret','Hello',Path(td)/'voice.wav',language='English')
            self.assertAlmostEqual(duration,.1)
            self.assertTrue(request.call_args.kwargs['interactions'])
            self.assertIn('English',request.call_args.args[2]['input'][0]['content'][0]['annotations'][0]['style'])
        reply={'candidates':[{'content':{'parts':[{'inlineData':{'mimeType':'audio/L16;codec=pcm;rate=24000','data':base64.b64encode(b'\0'*4800).decode()}}]}}]}
        with tempfile.TemporaryDirectory() as td,patch.object(core,'request_ai',return_value=reply) as request:
            self.assertAlmostEqual(core.synthesize('secret','Hello',Path(td)/'voice.wav',language='English',model='gemini-2.5-flash-preview-tts'),.1)
            self.assertIn('English',request.call_args.args[2]['contents'][0]['parts'][0]['text'])

if __name__=='__main__':unittest.main()
