import json
from pathlib import Path
import sys
import tempfile
import threading
import unittest
from unittest.mock import patch
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
import engine
import hunyuan
import portrait
from test_engine import blank_png, metadata, FakeComfy


class PortraitClient:
    def __init__(self): self.posts=[]; self.recovered=None; self.wait_calls=[]; self.active=True
    def request(self, route, data=None):
        if route=='/prompt':
            self.posts.append(data)
            return {'prompt_id':'portrait-id'}
        if route=='/queue':return {'queue_running':[[0,'portrait-id',{},{}]] if self.active else [],'queue_pending':[]}
        if route=='/history/portrait-id':return {}
        raise AssertionError(route)
    def find_request(self, marker):return self.recovered
    def wait(self, pid, cancelled, notify):
        self.wait_calls.append(pid)
        if cancelled.is_set():raise engine.Cancelled('paused')
        return [{'filename':'portrait.png'}]
    def download(self, frame, target):Path(target).write_bytes(blank_png(1280,720))


class PortraitTests(unittest.TestCase):
    def setup_project(self, root):
        project=engine.new_project(root, engine.TOPICS[0], .1)
        data=json.loads((project/'project.json').read_text())
        data['portrait_first']=True
        return project,data,hunyuan.select_models(metadata(),True)

    def test_complete_new_project_creates_one_portrait_then_only_i2v_video(self):
        class Client(FakeComfy):
            def wait(self,pid,cancelled,notify):
                flow=self.history[pid]['prompt']
                count=flow.get('latent',{}).get('inputs',{}).get('length',121)
                return [{'filename':f'{i}.png'} for i in range(count)]
        with tempfile.TemporaryDirectory() as td:
            profile=Path(td)/'profile'
            project=engine.new_project(td,engine.TOPICS[0],.1,profile,portrait_first=True)
            client=Client();events=[]
            def encode(command,*args):Path(command[-1]).write_bytes(b'video')
            with patch.object(engine,'ffmpeg',return_value='fixture'),patch.object(engine,'run_command',side_effect=encode):
                result=engine.generate(project,client,threading.Event(),events.append)
            self.assertTrue(result.exists());self.assertEqual(len(client.sent),3)
            self.assertEqual(client.sent[0]['prompt']['latent']['inputs']['length'],1)
            for sent in client.sent[1:]:
                self.assertEqual(sent['prompt']['unet']['inputs']['unet_name'],hunyuan.I2V)
            pictures=[x for x in events if isinstance(x,dict)]
            self.assertEqual(pictures[0]['type'],'portrait')
            self.assertEqual([x['scene'] for x in pictures[1:]],[1,2])
            saved=json.loads((project/'project.json').read_text())
            self.assertEqual(saved['portrait_request']['image_sha256'],engine.digest(profile/'reference.png'))

    def test_reset_targets_unconfirmed_portrait_without_resetting_video(self):
        with tempfile.TemporaryDirectory() as td:
            project,data,_=self.setup_project(td)
            data['portrait_request']={'seed':123,'request_marker':'uncertain','prompt_id':'missing'}
            engine.atomic_json(project/'project.json',data)
            engine.reset_failed_scene(project)
            saved=json.loads((project/'project.json').read_text())
            self.assertEqual(saved['portrait_request'],{'seed':123})

    def test_single_frame_native_portrait_is_saved_and_not_generated_twice(self):
        with tempfile.TemporaryDirectory() as td:
            project,data,models=self.setup_project(td);client=PortraitClient();events=[];profile=Path(td)/'character'
            image=portrait.ensure(project,data,client,models,threading.Event(),events.append,1280,720,profile)
            flow=client.posts[0]['prompt']
            self.assertEqual(flow['latent']['inputs']['length'],1)
            self.assertEqual(flow['latent']['inputs']['width'],1280);self.assertEqual(flow['latent']['inputs']['height'],720)
            self.assertEqual(flow['sampler']['inputs']['steps'],50);self.assertEqual(flow['sampler']['inputs']['cfg'],6)
            self.assertEqual(flow['sampling']['inputs']['shift'],9)
            self.assertEqual(flow['unet']['inputs']['unet_name'],hunyuan.T2V)
            self.assertIn('complete face',flow['positive']['inputs']['text'])
            self.assertTrue(image.is_file());self.assertEqual((profile/'reference.png').read_bytes(),image.read_bytes())
            saved=json.loads((project/'project.json').read_text());self.assertTrue(saved['portrait_request']['completed'])
            self.assertEqual(saved['portrait_request']['prompt_id'],'portrait-id')
            self.assertTrue(any(isinstance(x,dict) and x.get('type')=='portrait' for x in events))
            portrait.ensure(project,data,client,models,threading.Event(),lambda _:None,1280,720,profile)
            self.assertEqual(len(client.posts),1)

    def test_uncertain_post_is_journaled_and_never_repeated_without_recovery(self):
        class Failing(PortraitClient):
            def request(self, route, data=None):
                if route=='/prompt':self.posts.append(data);raise RuntimeError('connection lost')
                return super().request(route,data)
        with tempfile.TemporaryDirectory() as td:
            project,data,models=self.setup_project(td);client=Failing()
            with self.assertRaisesRegex(RuntimeError,'connection lost'):
                portrait.ensure(project,data,client,models,threading.Event(),lambda _:None,1280,720)
            self.assertTrue(json.loads((project/'project.json').read_text())['portrait_request']['request_marker'])
            with self.assertRaisesRegex(RuntimeError,'chưa xác định'):
                portrait.ensure(project,data,client,models,threading.Event(),lambda _:None,1280,720)
            self.assertEqual(len(client.posts),1)
            client.recovered='portrait-id'
            portrait.ensure(project,data,client,models,threading.Event(),lambda _:None,1280,720)
            self.assertEqual(len(client.posts),1);self.assertTrue((project/'nhan-vat-goc.png').is_file())

    def test_cancelled_running_portrait_keeps_job_for_resume(self):
        class Pause(PortraitClient):
            def wait(self, pid, cancelled, notify):raise engine.Cancelled('paused')
        with tempfile.TemporaryDirectory() as td:
            project,data,models=self.setup_project(td);client=Pause()
            with self.assertRaises(engine.Cancelled):portrait.ensure(project,data,client,models,threading.Event(),lambda _:None,1280,720)
            self.assertEqual(data['portrait_request']['prompt_id'],'portrait-id')
            resumed=PortraitClient()
            portrait.ensure(project,data,resumed,models,threading.Event(),lambda _:None,1280,720)
            self.assertEqual(resumed.posts,[]);self.assertEqual(resumed.wait_calls,['portrait-id'])

    def test_cancelled_removed_portrait_clears_only_lost_request(self):
        class Pause(PortraitClient):
            active=False
            def __init__(self):super().__init__();self.active=False
            def wait(self, pid, cancelled, notify):raise engine.Cancelled('paused')
        with tempfile.TemporaryDirectory() as td:
            project,data,models=self.setup_project(td);client=Pause()
            with self.assertRaises(engine.Cancelled):portrait.ensure(project,data,client,models,threading.Event(),lambda _:None,1280,720)
            self.assertNotIn('prompt_id',data['portrait_request']);self.assertNotIn('request_marker',data['portrait_request'])
            self.assertIn('seed',data['portrait_request'])

    def test_pending_video_is_not_silently_given_another_reference(self):
        with tempfile.TemporaryDirectory() as td:
            project,data,models=self.setup_project(td);data['scenes'][0]['request_marker']='uncertain'
            client=PortraitClient()
            with self.assertRaisesRegex(RuntimeError,'Còn tác vụ cảnh cũ'):
                portrait.ensure(project,data,client,models,threading.Event(),lambda _:None,1280,720)
            self.assertFalse(client.posts)

    def test_wrong_size_or_multiple_frames_are_not_saved_as_portrait(self):
        class Wrong(PortraitClient):
            def download(self, frame, target):Path(target).write_bytes(blank_png(832,480))
        with tempfile.TemporaryDirectory() as td:
            project,data,models=self.setup_project(td)
            with self.assertRaisesRegex(RuntimeError,'không đúng'):
                portrait.ensure(project,data,Wrong(),models,threading.Event(),lambda _:None,1280,720)
            self.assertFalse((project/'nhan-vat-goc.png').exists())


if __name__=='__main__':unittest.main()
