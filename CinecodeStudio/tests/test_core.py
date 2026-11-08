import json
from pathlib import Path
import sys
import tempfile
import unittest
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

    def test_english_narration_request_and_project(self):
        with patch.object(core,'request_ai',return_value={'candidates':[{'content':{'parts':[{'text':json.dumps(core.demo())}]}}]}) as request:
            data=core.generate('secret','gemini-2.5-flash','A calm morning',30,'Điện ảnh','16:9','English')
            self.assertEqual(core.validate(data)['narrationLanguage'],'English')
            self.assertIn('narration bằng English',request.call_args.args[2]['contents'][0]['parts'][0]['text'])

if __name__=='__main__':unittest.main()
