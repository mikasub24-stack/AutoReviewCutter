import json
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
import sys
import tempfile
import threading
import unittest
sys.path.insert(0,str(Path(__file__).resolve().parents[1]))
import engine
from test_engine import PNG, metadata


class LocalHTTPTests(unittest.TestCase):
    def test_real_http_preflight_upload_submit_history_and_download(self):
        seen=[]
        class Handler(BaseHTTPRequestHandler):
            def log_message(self,*args):pass
            def reply(self,value,binary=False):
                data=value if binary else json.dumps(value).encode()
                self.send_response(200);self.send_header('Content-Length',str(len(data)));self.end_headers();self.wfile.write(data)
            def do_GET(self):
                seen.append(('GET',self.path))
                if self.path=='/object_info':self.reply(metadata())
                elif self.path=='/history/test-id':
                    self.reply({'test-id':{'status':{'completed':True,'status_str':'success'},'outputs':{'save':{'images':[{'filename':'frame.png','subfolder':'WanLocal/test','type':'output'}]}}}})
                elif self.path.startswith('/view?'):self.reply(PNG,True)
                else:self.send_error(404)
            def do_POST(self):
                body=self.rfile.read(int(self.headers['Content-Length']));seen.append(('POST',self.path,body))
                if self.path=='/upload/image':self.reply({'name':'uploaded.png','subfolder':'local'})
                elif self.path=='/prompt':self.reply({'prompt_id':'test-id'})
                else:self.send_error(404)
        server=ThreadingHTTPServer(('127.0.0.1',0),Handler)
        thread=threading.Thread(target=server.serve_forever,daemon=True);thread.start()
        try:
            client=engine.Comfy(f'http://127.0.0.1:{server.server_port}')
            with tempfile.TemporaryDirectory() as td:
                image=Path(td)/'input.png';image.write_bytes(PNG)
                models=client.preflight();ref=client.upload(image)
                self.assertEqual(ref,'local/uploaded.png')
                workflow=engine.graph(engine.plan(engine.TOPICS[0],.1)['scenes'][0],models,ref)
                result=client.request('/prompt',{'prompt':workflow,'client_id':'project','extra_data':{'wanlocal_request':'unique'}})
                frames=client.wait(result['prompt_id'],threading.Event(),lambda _:None)
                target=Path(td)/'download.png';client.download(frames[0],target)
                self.assertEqual(target.read_bytes(),PNG)
            upload=next(x[2] for x in seen if x[:2]==('POST','/upload/image'))
            self.assertIn(PNG,upload)
            request=json.loads(next(x[2] for x in seen if x[:2]==('POST','/prompt')))
            self.assertEqual(request['prompt']['reference']['inputs']['image'],'local/uploaded.png')
        finally:server.shutdown();server.server_close();thread.join(timeout=3)


if __name__=='__main__':unittest.main()
