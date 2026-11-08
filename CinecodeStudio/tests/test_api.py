import io
import json
from pathlib import Path
import sys
import threading
import unittest
import urllib.error
from email.message import Message
from unittest.mock import Mock, patch
sys.path.insert(0,str(Path(__file__).resolve().parents[1]))
import core

def error(code, message='Service unavailable', retry=None):
    headers=Message()
    if retry:headers['Retry-After']=str(retry)
    return urllib.error.HTTPError('https://generativelanguage.googleapis.com/',code,'Error',headers,
                                 io.BytesIO(json.dumps({'error':{'message':message}}).encode()))

class ApiTests(unittest.TestCase):
    def test_503_retry_recovers_with_status_and_redacts_key(self):
        opener=Mock();opener.open.side_effect=[error(503,'Busy secret'),io.StringIO('{"ok":true}')]
        updates=[]
        with patch.object(core.urllib.request,'build_opener',return_value=opener),patch.object(core.time,'sleep') as sleep:
            self.assertEqual(core.request_ai('secret','test-model',{},status=updates.append),{'ok':True})
            self.assertEqual(opener.open.call_count,2);sleep.assert_called_once_with(2)
            self.assertIn('503',updates[0]);self.assertNotIn('secret',' '.join(updates))

    def test_exhausted_503_reports_google_without_key(self):
        opener=Mock();opener.open.side_effect=[error(503,'Busy secret') for _ in range(3)]
        with patch.object(core.urllib.request,'build_opener',return_value=opener),patch.object(core.time,'sleep'):
            with self.assertRaises(RuntimeError) as caught:core.request_ai('secret','test-model',{})
        self.assertNotIn('secret',str(caught.exception));self.assertIn('503',str(caught.exception))
        self.assertIn('3 lần',str(caught.exception));self.assertIn('Google:',str(caught.exception))

    def test_auth_daily_quota_and_long_retry_are_not_retried(self):
        for response in [error(403,'API disabled'),error(429,'GenerateRequestsPerDayPerProject'),error(503,'Busy',30)]:
            opener=Mock();opener.open.side_effect=response
            with patch.object(core.urllib.request,'build_opener',return_value=opener),patch.object(core.time,'sleep') as sleep:
                with self.assertRaises(RuntimeError):core.request_ai('secret','test-model',{})
                self.assertEqual(opener.open.call_count,1);sleep.assert_not_called()

    def test_cancel_interrupts_retry_wait(self):
        opener=Mock();opener.open.side_effect=error(503)
        cancel=Mock();cancel.is_set.return_value=False;cancel.wait.return_value=True
        with patch.object(core.urllib.request,'build_opener',return_value=opener):
            with self.assertRaisesRegex(RuntimeError,'Đã hủy'):core.request_ai('secret','test-model',{},cancelled=cancel)
        self.assertEqual(opener.open.call_count,1)

    def test_model_catalog_uses_get_and_separates_tts(self):
        response={'models':[{'name':'models/my-text','supportedGenerationMethods':['generateContent']},
                            {'name':'models/my-tts'},{'name':'models/embedding','supportedGenerationMethods':['embedContent']} ]}
        opener=Mock();opener.open.return_value=io.StringIO(json.dumps(response))
        with patch.object(core.urllib.request,'build_opener',return_value=opener):
            self.assertEqual(core.list_models('secret'),(['my-text'],['my-tts']))
        req=opener.open.call_args.args[0];self.assertEqual(req.get_method(),'GET')
        self.assertNotIn('secret',req.full_url)

    def test_ten_minute_script_is_chunked_and_frame_exact(self):
        result={'title':'Video dài','scenes':[{'title':f'Cảnh {i}','text':'Nội dung','duration':14} for i in range(8)]}
        response={'candidates':[{'content':{'parts':[{'text':json.dumps(result)}]}}]}
        updates=[]
        with patch.object(core,'request_ai',return_value=response) as request:
            data=core.generate('secret','test-model','Một câu chuyện dài',600,'Điện ảnh','16:9',status=updates.append)
        self.assertEqual(request.call_count,5);self.assertEqual(len(data['scenes']),40)
        self.assertEqual(sum(round(s['duration']*30) for s in data['scenes']),18000)
        self.assertAlmostEqual(sum(s['duration'] for s in data['scenes']),600)
        self.assertIn('5/5',updates[-1])
        self.assertIn('Hai cảnh cuối',request.call_args.args[2]['contents'][0]['parts'][0]['text'])

    def test_ten_minute_cancel_leaves_input_unmodified(self):
        cancel=threading.Event();cancel.set()
        with patch.object(core,'request_ai') as request:
            with self.assertRaisesRegex(RuntimeError,'Đã hủy'):core.generate('secret','test-model','brief',600,'Điện ảnh','16:9',cancelled=cancel)
            request.assert_not_called()

if __name__=='__main__':unittest.main()
