import base64
import json
import os
from pathlib import Path
import shutil
import subprocess
import sys
import tempfile
import threading
import unittest
from unittest.mock import patch
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
import engine

PNG = base64.b64decode('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a0gAAAABJRU5ErkJggg==')


def metadata():
    info={kind:{'input':{'required':{}}} for kind in ['ModelSamplingSD3','CLIPTextEncode','Wan22ImageToVideoLatent','KSampler','VAEDecodeTiled','SaveImage','LoadImage']}
    for kind,(field,name) in engine.MODELS.items():info[kind]={'input':{'required':{field:[[name]]}}}
    return info


class FakeComfy:
    url='http://127.0.0.1:8188'
    def __init__(self):self.sent=[];self.uploaded=[];self.history={}
    def preflight(self):return {field:name for field,name in engine.MODELS.values()}
    def upload(self,path):self.uploaded.append(Path(path).read_bytes());return 'reference.png'
    def request(self,route,data=None):
        if route=='/prompt':
            self.sent.append(data);pid=str(len(self.sent));self.history[pid]=data
            return {'prompt_id':pid}
        raise AssertionError(route)
    def wait(self,pid,cancelled,notify):return [{'filename':f'{i}.png'} for i in range(engine.FRAMES)]
    def download(self,description,path):Path(path).write_bytes(PNG)


class EngineTests(unittest.TestCase):
    def test_duration_plan_covers_requested_frames_and_uses_stable_setting(self):
        for minutes in (.1,1,10,15):
            data=engine.plan(engine.TOPICS[0],minutes)
            self.assertGreaterEqual(len(data['scenes'])*(engine.FRAMES-1)+1,data['frames'])
            self.assertIn(engine.STORIES[engine.TOPICS[0]]['setting'],data['scenes'][-1]['prompt'])
        self.assertEqual(len(engine.plan(engine.TOPICS[0],1)['scenes']),12)
        for bad in ('nan','inf','-1','0','16'):
            with self.assertRaises(ValueError):engine.plan(engine.TOPICS[0],bad)

    def test_loopback_only_and_missing_models_are_actionable(self):
        for url in ['https://127.0.0.1:8188','http://example.com','http://127.0.0.1.evil.test','http://user:secret@localhost:8188']:
            with self.assertRaises(ValueError):engine.Comfy(url)
        client=engine.Comfy()
        with patch.object(client,'request',return_value=metadata()):self.assertEqual(client.preflight()['vae_name'],'wan2.2_vae.safetensors')
        info=metadata();info['UNETLoader']['input']['required']['unet_name']=[[]]
        with patch.object(client,'request',return_value=info):
            with self.assertRaisesRegex(RuntimeError,'wan2.2_ti2v_5B'):client.preflight()

    def test_graph_uses_optional_reference_and_cpu_text_encoder(self):
        scene=engine.plan(engine.TOPICS[0],.1)['scenes'][0];models=FakeComfy().preflight()
        empty=engine.graph(scene,models)
        self.assertNotIn('start_image',empty['latent']['inputs'])
        linked=engine.graph(scene,models,'uploaded.png')
        self.assertEqual(linked['latent']['inputs']['start_image'],['reference',0])
        self.assertEqual(linked['clip']['inputs']['device'],'cpu')
        self.assertEqual(linked['decode']['class_type'],'VAEDecodeTiled')
        self.assertEqual(linked['save']['class_type'],'SaveImage')

    def test_journal_reference_chain_and_resume_do_not_duplicate_render(self):
        with tempfile.TemporaryDirectory() as td:
            project=engine.new_project(td,engine.TOPICS[0],.1);client=FakeComfy()
            commands=[]
            def encode(command,cancelled,log):
                commands.append(command);Path(command[-1]).write_bytes(b'encoded video')
            with patch.object(engine,'ffmpeg',return_value='ffmpeg'),patch.object(engine,'run_command',side_effect=encode):
                final=engine.generate(project,client,threading.Event(),lambda _:None)
                self.assertTrue(final.is_file());self.assertEqual(len(client.sent),2)
                self.assertEqual(client.uploaded,[PNG]);self.assertTrue((project/'tham-chieu-goc.png').is_file())
                engine.generate(project,client,threading.Event(),lambda _:None)
                self.assertEqual(len(client.sent),2)
                self.assertFalse((project/'frames-0001').exists())
            first=client.sent[0]['prompt'];second=client.sent[1]['prompt']
            self.assertNotIn('reference',first);self.assertEqual(second['reference']['inputs']['image'],'reference.png')
            self.assertIn('-frames:v',commands[-1]);self.assertIn('144',commands[-1])

    def test_uncertain_post_persists_intent_and_is_not_automatically_repeated(self):
        class Failing(FakeComfy):
            def request(self,route,data=None):raise RuntimeError('connection lost after send')
            def find_request(self,marker):return None
        with tempfile.TemporaryDirectory() as td,patch.object(engine,'ffmpeg',return_value='ffmpeg'):
            project=engine.new_project(td,engine.TOPICS[1],.1);client=Failing()
            with self.assertRaisesRegex(RuntimeError,'connection lost'):engine.generate(project,client,threading.Event(),lambda _:None)
            saved=json.loads((project/'project.json').read_text(encoding='utf-8'))
            self.assertTrue(saved['scenes'][0]['request_marker'])
            with self.assertRaisesRegex(RuntimeError,'Lần gửi trước'):engine.generate(project,client,threading.Event(),lambda _:None)

    def test_cancel_does_not_interrupt_someone_elses_running_job(self):
        client=engine.Comfy();called=[];cancelled=threading.Event();cancelled.set()
        def respond(route,data=None):called.append((route,data));return {'queue_running':[[0,'someone-else',{},{}]],'queue_pending':[[1,'mine',{},{}]]}
        with patch.object(client,'request',side_effect=respond):
            with self.assertRaises(engine.Cancelled):client.wait('mine',cancelled,lambda _:None)
        self.assertEqual(called,[('/queue',None),('/queue',{'delete':['mine']})])

    def test_real_ffmpeg_assembly_has_exact_duration(self):
        encoder=shutil.which('ffmpeg')
        if not encoder:
            candidate=engine.ROOT/'runtime/ffmpeg.exe'
            encoder=str(candidate) if candidate.is_file() else None
        if not encoder:self.skipTest('FFmpeg unavailable')
        with tempfile.TemporaryDirectory() as td:
            # Real 480p synthetic frames exercise FFmpeg only, not GPU inference.
            project=engine.new_project(td,engine.TOPICS[0],.1)
            image=Path(td)/'frame.png'
            subprocess.run([encoder,'-y','-f','lavfi','-i','color=c=green:s=832x480','-frames:v','1',str(image)],check=True,capture_output=True)
            class Frames(FakeComfy):
                def download(self,description,path):shutil.copy2(image,path)
            with patch.object(engine,'ffmpeg',return_value=encoder):
                result=engine.generate(project,Frames(),threading.Event(),lambda _:None)
            decoded=subprocess.run([encoder,'-i',str(result),'-map','0:v:0','-f','framemd5','-'],check=True,capture_output=True,text=True)
            lines=[x for x in decoded.stdout.splitlines() if x and not x.startswith('#')]
            self.assertEqual(len(lines),144)
            self.assertGreater(result.stat().st_size,1000)


if __name__=='__main__':unittest.main()
