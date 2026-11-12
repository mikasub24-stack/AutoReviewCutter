import hashlib
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
import json
import os
from pathlib import Path
import shutil
import subprocess
import sys
import tempfile
import threading
import unittest
from unittest.mock import Mock, patch
import zipfile
sys.path.insert(0,str(Path(__file__).resolve().parents[1]))
import bootstrap
import engine


class BootstrapTests(unittest.TestCase):
    def test_backend_limits_blas_threads_without_changing_global_environment(self):
        with patch.dict(os.environ,{'OPENBLAS_NUM_THREADS':'64','OMP_NUM_THREADS':'32','PYTHONHOME':'unrelated'}):
            env=bootstrap.backend_environment()
            self.assertEqual(env['OPENBLAS_NUM_THREADS'],'1');self.assertEqual(env['OMP_NUM_THREADS'],'2')
            self.assertNotIn('PYTHONHOME',env)
            self.assertEqual(os.environ['OPENBLAS_NUM_THREADS'],'64')

    def test_managed_backend_launch_disables_pinned_ram_and_async_offload(self):
        with tempfile.TemporaryDirectory() as td:
            root=Path(td);child=Mock();child.pid=123;child.poll.return_value=None
            with patch.object(engine.Comfy,'preflight',side_effect=[RuntimeError('not started'),{}]),patch.object(bootstrap.subprocess,'run',return_value=subprocess.CompletedProcess([],0,'RTX 3060\n','')) as probe,patch.object(bootstrap.subprocess,'Popen',return_value=child) as spawn:
                client=bootstrap.start_backend(root,root,threading.Event(),lambda _:None)
            self.assertEqual(client.url,bootstrap.MANAGED_URL)
            args=spawn.call_args.args[0];env=spawn.call_args.kwargs['env']
            self.assertIn('--disable-pinned-memory',args);self.assertIn('--disable-async-offload',args)
            self.assertIn('--normalvram',args);self.assertIn('--reserve-vram',args);self.assertNotIn('--lowvram',args)
            self.assertEqual(env['OPENBLAS_NUM_THREADS'],'1')
            self.assertEqual(probe.call_args.kwargs['env']['OPENBLAS_NUM_THREADS'],'1')
            bootstrap._children.remove(child)

    def test_startup_memory_error_is_short_and_ignores_old_log_attempts(self):
        with tempfile.TemporaryDirectory() as td:
            path=Path(td)/'comfyui.log';old=b'old unrelated error\n'
            path.write_bytes(old+b'\x1b[32mOpenBLAS error: Memory allocation still failed after 10 retries, giving up.\x1b[0m\n')
            message=bootstrap.startup_error(path,len(old))
            self.assertIn('thiếu bộ nhớ',message);self.assertNotIn('\x1b',message);self.assertLess(len(message),400)
            path.write_bytes(old+b'new failure\n')
            self.assertNotIn('old unrelated',bootstrap.startup_error(path,len(old)))

    def test_metadata_requires_real_lfs_hash_and_size(self):
        text='version https://git-lfs.github.com/spec/v1\r\noid sha256:'+'a'*64+'\r\nsize 2000000\r\n'
        self.assertEqual(bootstrap.parse_pointer(text),('a'*64,2000000))
        for bad in ('<html>login</html>','version https://git-lfs.github.com/spec/v1\nsize 99\n'):
            with self.assertRaises(RuntimeError):bootstrap.parse_pointer(bad)

    def test_download_resumes_verified_object_and_reuses_receipt(self):
        payload=b'known bytes'*120000;calls=[]
        class Handler(BaseHTTPRequestHandler):
            def log_message(self,*_):pass
            def do_GET(self):
                offset=int(self.headers.get('Range','bytes=0-').split('=')[1].split('-')[0]);calls.append(offset)
                self.send_response(206 if offset else 200)
                if offset:self.send_header('Content-Range',f'bytes {offset}-{len(payload)-1}/{len(payload)}')
                self.send_header('Content-Length',str(len(payload)-offset));self.end_headers();self.wfile.write(payload[offset:])
        server=ThreadingHTTPServer(('127.0.0.1',0),Handler);worker=threading.Thread(target=server.serve_forever,daemon=True);worker.start()
        try:
            with tempfile.TemporaryDirectory() as td:
                url=f'http://127.0.0.1:{server.server_port}/model';dest=Path(td)/'model.safetensors';sha=hashlib.sha256(payload).hexdigest()
                part=dest.with_suffix('.safetensors.part');part.write_bytes(payload[:70000])
                engine.atomic_json(part.with_suffix('.download.json'),{'url':url,'sha256':sha,'size':len(payload)})
                bootstrap.download(url,dest,sha,len(payload),threading.Event(),lambda _:None)
                self.assertEqual(calls,[70000]);self.assertEqual(dest.read_bytes(),payload)
                bootstrap.download(url,dest,sha,len(payload),threading.Event(),lambda _:None)
                self.assertEqual(calls,[70000]);self.assertFalse(part.exists())
        finally:server.shutdown();server.server_close();worker.join(timeout=3)

    def test_bad_checksum_never_promotes_download(self):
        import io
        class Response(io.BytesIO):
            status=200
            headers={'Content-Length':'5'}
        with tempfile.TemporaryDirectory() as td:
            target=Path(td)/'python.7z'
            with self.assertRaisesRegex(RuntimeError,'Checksum'):
                bootstrap.download('https://example.test/a',target,'a'*64,5,threading.Event(),lambda _:None,
                                   opener=lambda *a,**k:Response(b'wrong'))
            self.assertFalse(target.exists());self.assertFalse(target.with_suffix('.7z.part').exists())

    def test_complete_unknown_length_part_is_promoted_without_range_416(self):
        with tempfile.TemporaryDirectory() as td:
            dest=Path(td)/'archive.7z';payload=b'finished';sha=hashlib.sha256(payload).hexdigest();url='https://example.test/a'
            part=dest.with_suffix('.7z.part');part.write_bytes(payload)
            engine.atomic_json(part.with_suffix('.download.json'),{'url':url,'sha256':sha,'size':0})
            with patch.object(bootstrap.urllib.request,'urlopen',side_effect=AssertionError('must not request')):
                bootstrap.download(url,dest,sha,0,threading.Event(),lambda _:None,opener=lambda *a,**k:self.fail('network request'))
            self.assertEqual(dest.read_bytes(),payload)

    def test_healthy_existing_comfy_is_used_without_install(self):
        with patch.object(engine.Comfy,'preflight',return_value={}),patch.object(bootstrap,'install') as install:
            client=bootstrap.ensure_ready(Path('/unused'),'http://127.0.0.1:8188',threading.Event(),lambda _:None)
            self.assertEqual(client.url,'http://127.0.0.1:8188');install.assert_not_called()

    def test_windows_extractor_really_unpacks_portable_layout(self):
        extractor=engine.ROOT/'runtime/7z.exe'
        if not extractor.is_file():self.skipTest('Bundled Windows extractor is exercised in Windows CI')
        with tempfile.TemporaryDirectory() as td:
            root=Path(td);archive=root/'fixture.zip'
            with zipfile.ZipFile(archive,'w') as z:
                z.writestr('ComfyUI_windows_portable/python_embeded/python.exe',b'fixture, not executed')
                z.writestr('ComfyUI_windows_portable/ComfyUI/main.py',b'# fixture')
            def download(url,dest,*args):
                if str(dest).endswith('.7z'):return archive
                Path(dest).parent.mkdir(parents=True,exist_ok=True);Path(dest).write_bytes(b'fixture model');return Path(dest)
            with patch.object(bootstrap,'download',side_effect=download),patch.object(bootstrap,'model_metadata',return_value={'url':'fixture','sha256':'a'*64,'size':1}),patch.object(bootstrap.shutil,'disk_usage',return_value=shutil._ntuple_diskusage(80*1024**3,0,80*1024**3)):
                folder=bootstrap._install(root,threading.Event(),lambda _:None)
            self.assertTrue(bootstrap.layout_valid(folder))
            self.assertTrue((folder/'ComfyUI/models/vae/hunyuanvideo15_vae_fp16.safetensors').is_file())


if __name__=='__main__':unittest.main()
