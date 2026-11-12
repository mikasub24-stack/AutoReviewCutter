import json
from pathlib import Path
import sys
import tempfile
import threading
import unittest
from unittest.mock import patch
sys.path.insert(0,str(Path(__file__).resolve().parents[1]))
import engine
import bootstrap
import hunyuan
from test_engine import FakeComfy,PNG


class CleanupTests(unittest.TestCase):
    def test_delete_targets_own_queue_files_and_profile_not_other_projects(self):
        with tempfile.TemporaryDirectory() as td:
            root=Path(td);project=engine.new_project(root,engine.TOPICS[0],.1)
            other=engine.new_project(root,engine.TOPICS[1],.1)
            data=json.loads((project/'project.json').read_text());data['scenes'][0]['prompt_id']='mine'
            data['uploaded_inputs']=['own.png','../../escape.png']
            profile=root/'character';profile.mkdir();(profile/'reference.png').write_bytes(PNG)
            engine.atomic_json(profile/'profile.json',{'source_project':str(project),'sha256':engine.digest(profile/'reference.png')})
            data['profile_dir']=str(profile);engine.atomic_json(project/'project.json',data)
            managed=root/'ComfyUI';output=managed/'output/HunyuanLocal'/data['id'];output.mkdir(parents=True);(output/'frame.png').write_bytes(PNG)
            (managed/'input').mkdir();(managed/'input/own.png').write_bytes(PNG);(managed/'input/other.png').write_bytes(PNG)
            escape=root/'escape.png';escape.write_bytes(PNG)
            calls=[]
            class Client:
                def request(self,route,value=None):
                    calls.append((route,value))
                    if route=='/queue' and value is None:return {'queue_running':[[0,'unrelated',{},{}]],'queue_pending':[]}
                    return {}
            engine.delete_project(project,Client(),lambda _:None,managed)
            self.assertFalse(project.exists());self.assertTrue(other.exists());self.assertFalse(output.exists())
            self.assertFalse((managed/'input/own.png').exists());self.assertTrue((managed/'input/other.png').exists());self.assertTrue(escape.exists())
            self.assertFalse((profile/'reference.png').exists())
            self.assertIn(('/interrupt',{'prompt_id':'mine'}),calls)
            self.assertNotIn(('/interrupt',{}),calls)
            self.assertIn(('/queue',{'delete':['mine']}),calls)

    def test_explicit_delete_can_stop_only_owned_stuck_backend_after_interrupt(self):
        with tempfile.TemporaryDirectory() as td:
            project=engine.new_project(td,engine.TOPICS[0],.1)
            data=json.loads((project/'project.json').read_text());data['portrait_request']={'prompt_id':'stuck'}
            engine.atomic_json(project/'project.json',data)
            calls=[]
            class Client:
                url=bootstrap.MANAGED_URL
                def request(self,route,value=None):
                    calls.append((route,value))
                    if route=='/queue' and value is None:return {'queue_running':[[0,'stuck',{},{}]],'queue_pending':[]}
                    return {}
            managed=Path(td)/'portable/ComfyUI'
            with patch.object(engine.time,'monotonic',side_effect=[0,21]),patch.object(engine.backend_control,'stop_project_backend',return_value=True) as stop:
                engine.delete_project(project,Client(),lambda _:None,managed)
            self.assertFalse(project.exists());self.assertEqual(stop.call_args.args[0],managed.parent)
            self.assertEqual(stop.call_args.args[2],{'stuck'})
            self.assertFalse(any(route=='/history' for route,_ in calls))

    def test_recovered_queue_id_is_stopped_even_when_manifest_lost_post_response(self):
        with tempfile.TemporaryDirectory() as td:
            project=engine.new_project(td,engine.TOPICS[0],.1);calls=[]
            class Client:
                def request(self,route,value=None):
                    calls.append((route,value))
                    return {'queue_running':[],'queue_pending':[]} if route=='/queue' else {}
            engine.delete_project(project,Client(),lambda _:None,extra_prompt_ids=['recovered-id'])
            self.assertFalse(project.exists())
            self.assertIn(('/interrupt',{'prompt_id':'recovered-id'}),calls)
            self.assertIn(('/queue',{'delete':['recovered-id']}),calls)

    def test_locked_project_is_not_deleted(self):
        with tempfile.TemporaryDirectory() as td:
            project=engine.new_project(td,engine.TOPICS[0],.1)
            with engine.project_lock(project):
                with self.assertRaises(RuntimeError):engine.delete_project(project,object(),lambda _:None)
            self.assertTrue((project/'project.json').is_file())

    def test_preview_emits_finished_scene_before_final_render(self):
        with tempfile.TemporaryDirectory() as td:
            project=engine.new_project(td,engine.TOPICS[0],.1);events=[]
            def encode(command,*args):
                if str(command[-1]).endswith('video-hoan-tat.partial.mp4'):
                    self.assertEqual(len([x for x in events if isinstance(x,dict)]),2)
                Path(command[-1]).write_bytes(b'video')
            with patch.object(engine,'ffmpeg',return_value='fixture'),patch.object(engine,'run_command',side_effect=encode):
                engine.generate(project,FakeComfy(),threading.Event(),events.append)
            previews=[x for x in events if isinstance(x,dict)]
            self.assertEqual([x['scene'] for x in previews],[1,2])
            self.assertTrue(all(Path(x['image']).is_file() and Path(x['clip']).is_file() for x in previews))

    def test_wan_projects_are_rejected_before_any_model_loading(self):
        with tempfile.TemporaryDirectory() as td:
            project=engine.new_project(td,engine.TOPICS[0],.1)
            data=json.loads((project/'project.json').read_text());data.pop('backend');engine.atomic_json(project/'project.json',data)
            with self.assertRaisesRegex(ValueError,'Wan cũ'):
                engine.generate(project,object(),threading.Event(),lambda _:None)
            with self.assertRaises(ValueError):engine.plan(engine.TOPICS[0],.1,'wan')

    def test_remove_only_obsolete_wan_model_names(self):
        with tempfile.TemporaryDirectory() as td:
            models=bootstrap.layout(td)/'ComfyUI/models'
            old=models/'vae/wan2.2_vae.safetensors';old.parent.mkdir(parents=True);old.write_bytes(b'old')
            keep=models/'vae'/hunyuan.VAE;keep.write_bytes(b'new')
            custom=models/'vae/my-private-model.safetensors';custom.write_bytes(b'private')
            with patch.dict(bootstrap.os.environ,{'LOCALAPPDATA':td}),patch.object(engine.Comfy,'request',return_value={'queue_running':[],'queue_pending':[]}):
                bootstrap.remove_wan_models(td,lambda _:None)
            self.assertFalse(old.exists());self.assertTrue(keep.exists());self.assertTrue(custom.exists())


if __name__=='__main__':unittest.main()
