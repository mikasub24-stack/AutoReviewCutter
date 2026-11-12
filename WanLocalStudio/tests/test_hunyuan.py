import json
from pathlib import Path
import sys
import tempfile
import threading
import unittest
from unittest.mock import patch
sys.path.insert(0,str(Path(__file__).resolve().parents[1]))
import engine
import hunyuan
from test_engine import FakeComfy, blank_png


def model_info():
    names=['UNETLoader','DualCLIPLoader','VAELoader','CLIPVisionLoader','CLIPVisionEncode',
           'HunyuanVideo15ImageToVideo','EmptyHunyuanVideo15Latent','ModelSamplingSD3',
           'CLIPTextEncode','KSampler','VAEDecodeTiled','SaveImage','LoadImage']
    data={name:{'input':{'required':{}}} for name in names}
    data['UNETLoader']['input']['required']['unet_name']=[[hunyuan.I2V,hunyuan.T2V]]
    data['DualCLIPLoader']['input']['required'].update({'clip_name1':[[hunyuan.QWEN]],'clip_name2':[[hunyuan.BYT5]]})
    data['VAELoader']['input']['required']['vae_name']=[[hunyuan.VAE]]
    data['CLIPVisionLoader']['input']['required']['clip_name']=[[hunyuan.VISION]]
    return data


class HunyuanTests(unittest.TestCase):
    def test_model_download_catalog_matches_official_templates(self):
        urls={}
        for kind in ('i2v','t2v'):
            template=json.loads((engine.ROOT/f'vendor/hunyuan15-official-{kind}-template.json').read_text(encoding='utf-8'))
            for node in template['nodes']:
                for model in node.get('properties',{}).get('models',[]):urls[model['name']]=model['url']
        for item in hunyuan.sources(True):
            repo,directory,name=item[:3]
            path=item[3] if len(item)>3 else f'split_files/{directory}/{name}'
            self.assertEqual('https://huggingface.co/'+repo+'/resolve/main/'+path,urls[name])
        self.assertNotIn(hunyuan.T2V,[x[2] for x in hunyuan.sources(False)])

    def test_i2v_graph_uses_hunyuan_vision_full_time_and_official_sampler(self):
        data=engine.plan(engine.TOPICS[0],.1,hunyuan.BACKEND)
        models=hunyuan.select_models(model_info())
        flow=hunyuan.graph(data['scenes'][0],models,'last-frame.png','clean-character.png')
        self.assertEqual(engine.geometry(data),(1280,720,1280,720))
        self.assertEqual(flow['unet']['inputs']['unet_name'],hunyuan.I2V)
        self.assertEqual(flow['unet']['inputs']['weight_dtype'],'fp8_e4m3fn')
        self.assertEqual(flow['condition']['class_type'],'HunyuanVideo15ImageToVideo')
        self.assertEqual(flow['condition']['inputs']['start_image'],['reference',0])
        self.assertEqual(flow['vision']['inputs']['image'],['identity',0])
        self.assertEqual(flow['sampler']['inputs']['latent_image'],['condition',2])
        self.assertEqual(flow['sampler']['inputs']['steps'],50)
        self.assertEqual(flow['sampler']['inputs']['cfg'],6)
        self.assertEqual(flow['sampler']['inputs']['sampler_name'],'euler')
        self.assertEqual(flow['sampling']['inputs']['shift'],7)
        self.assertEqual(flow['decode']['inputs']['temporal_size'],4096)
        self.assertNotIn('Wan22ImageToVideoLatent',[x['class_type'] for x in flow.values()])

    def test_initial_generation_requires_a_real_t2v_checkpoint(self):
        scene=engine.plan(engine.TOPICS[0],.1,hunyuan.BACKEND)['scenes'][0]
        with self.assertRaises(RuntimeError):hunyuan.graph(scene,hunyuan.select_models(model_info()))
        flow=hunyuan.graph(scene,hunyuan.select_models(model_info(),True))
        self.assertEqual(flow['unet']['inputs']['unet_name'],hunyuan.T2V)
        self.assertEqual(flow['latent']['class_type'],'EmptyHunyuanVideo15Latent')
        self.assertEqual(flow['sampling']['inputs']['shift'],9)

    def test_new_hunyuan_project_runs_reference_journal_without_wan_nodes(self):
        class Client(FakeComfy):
            def preflight(self):return hunyuan.select_models(model_info(),self.need_t2v)
            def download(self,description,path):Path(path).write_bytes(blank_png(1280,720))
        with tempfile.TemporaryDirectory() as td:
            profile=Path(td)/'character';profile.mkdir();(profile/'reference.png').write_bytes(blank_png(1280,736))
            project=engine.new_project(td,engine.TOPICS[0],.1,profile,hunyuan.BACKEND);client=Client()
            def encode(command,cancelled,log):Path(command[-1]).write_bytes(b'encoded video')
            with patch.object(engine,'ffmpeg',return_value='fixture'),patch.object(engine,'run_command',side_effect=encode):
                result=engine.generate(project,client,threading.Event(),lambda _:None)
            self.assertTrue(result.is_file());self.assertEqual(len(client.sent),2)
            for request in client.sent:
                self.assertEqual(request['prompt']['unet']['inputs']['unet_name'],hunyuan.I2V)
                self.assertEqual(request['prompt']['condition']['inputs']['height'],720)
            self.assertEqual(engine.png_dimensions(profile/'reference.png'),(1280,736))


if __name__=='__main__':unittest.main()
