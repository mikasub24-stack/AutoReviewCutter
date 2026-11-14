import copy
import json
import os
from pathlib import Path
import subprocess
import sys
import tempfile
import threading
import unittest
from unittest.mock import patch
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from engine import *


def plan():
    return {'title': 'Test', 'characters': [{'name': 'Lan', 'description': 'Adult woman', 'voice': 'calm adult female'}],
            'scenes': [{'prompt': 'Lan enters a room', 'dialogue': 'Lan: Xin chào.', 'seconds': 5, 'characters': ['Lan']}]}


class FakeHttp:
    def __init__(self):
        self.calls = []
        self.submissions = 0
    def check(self):
        pass
    def json(self, url, data=None, key='', **kw):
        self.calls.append((url, copy.deepcopy(data)))
        if url.endswith('getJsonApiFormat'):
            return {'code': 0, 'data': {'prompt': '{}'}}
        if url.endswith('/create'):
            self.submissions += 1
            return {'code': 0, 'data': {'taskId': 'existing-task'}}
        if url.endswith('/status'):
            return {'code': 0, 'data': 'SUCCESS'}
        if url.endswith('/outputs'):
            return {'code': 0, 'data': [{'fileType': 'mp4', 'nodeId': '14', 'fileUrl': 'https://example.test/result.mp4'}]}
        raise AssertionError(url)
    def upload(self, *a, **kw):
        return {'code': 0, 'data': {'fileName': 'test.png'}}
    def download(self, url, path):
        Path(path).parent.mkdir(parents=True, exist_ok=True)
        Path(path).write_bytes(b'\x00\x00\x00\x20ftyp' + b'0' * 100)


class EngineTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.root = Path(self.tmp.name)
    def tearDown(self):
        self.tmp.cleanup()
    def project(self):
        p = Project(self.root / 'project', plan())
        p.save()
        image = self.root / 'image.png'; image.write_bytes(b'test')
        p.asset('character:Lan', image)
        return p
    def runner(self, http=None):
        return Runner({}, {'rh_key': 'TEST_ONLY'}, http=http or FakeHttp())
    def test_project_roundtrip(self):
        p = self.project()
        p.data['jobs']['1'] = {'task_id': 'old'}; p.save()
        self.assertEqual(Project(p.folder).data['jobs']['1']['task_id'], 'old')
        self.assertNotIn('TEST_ONLY', p.path.read_text())
    def test_path_escape_rejected(self):
        p = self.project()
        with self.assertRaises(ValueError): p.file('../secret.txt')
    def test_invalid_character_rejected(self):
        data = plan(); data['scenes'][0]['characters'] = ['Other']
        with self.assertRaises(ValueError): validate_plan(data)
    def test_too_long_scene_rejected(self):
        data = plan(); data['scenes'][0]['seconds'] = 20
        with self.assertRaises(ValueError): validate_plan(data)
    def test_reference_graph_binds_voices_and_faces(self):
        data = validate_plan(plan()); data.update(ratio='9:16', resolution='640p')
        graph = build_graph(data['scenes'][0], data, DEFAULTS, ['face.png'], ['voice.wav'], 7)
        self.assertEqual(graph['5']['inputs']['ref_images.ref_image_0'], ['20', 0])
        self.assertEqual(graph['5']['inputs']['ref_audios.ref_audio_0'], ['40', 0])
        self.assertLess(graph['5']['inputs']['width'], graph['5']['inputs']['height'])
        self.assertEqual(graph['5']['inputs']['length'] % 17, 5)
        self.assertEqual(graph['6']['inputs']['noise_seed'], 7)
    def test_url_credentials_rejected(self):
        with self.assertRaises(ValueError): validate_url('https://user:pass@example.com')
        with self.assertRaises(ValueError): validate_url('http://example.com')
        self.assertEqual(validate_url('http://127.0.0.1:8188', True), 'http://127.0.0.1:8188')
    def test_provider_error_does_not_echo_secret(self):
        with self.assertRaises(RuntimeError) as caught: unpack_rh({'code': 401, 'msg': 'API key TEST_ONLY invalid'})
        self.assertNotIn('TEST_ONLY', str(caught.exception))
    def test_submit_and_resume_without_rebilling(self):
        p = self.project(); http = FakeHttp(); runner = self.runner(http)
        runner.run(p)
        self.assertEqual(http.submissions, 1)
        self.assertEqual(Project(p.folder).data['jobs']['1']['task_id'], 'existing-task')
        runner.run(p)
        self.assertEqual(http.submissions, 1)
    def test_resume_existing_task_does_not_submit(self):
        p = self.project(); http = FakeHttp()
        p.data['jobs']['1'] = {'task_id': 'old', 'provider': 'RunningHub', 'base': DEFAULTS['rh_url']}; p.save()
        self.runner(http).run(p)
        self.assertEqual(http.submissions, 0)
        self.assertTrue(p.file(p.data['jobs']['1']['file']).exists())
    def test_lost_submit_response_keeps_uncertain_intent(self):
        p = self.project(); http = FakeHttp()
        original = http.json
        def request(url, *a, **kw):
            if url.endswith('/create'): raise TimeoutError('response lost')
            return original(url, *a, **kw)
        http.json = request
        with self.assertRaises(TimeoutError): self.runner(http).run(p)
        self.assertTrue(Project(p.folder).data['jobs']['1']['submit_uncertain'])
        http2 = FakeHttp()
        with self.assertRaisesRegex(ValueError, 'mất phản hồi'): self.runner(http2).run(p)
        self.assertEqual(http2.submissions, 0)
    def test_endpoint_change_cannot_duplicate_job(self):
        p = self.project()
        p.data['jobs']['1'] = {'task_id': 'old', 'provider': 'RunningHub', 'base': 'https://other.example'}
        http = FakeHttp()
        with self.assertRaises(ValueError): self.runner(http).run(p)
        self.assertEqual(http.submissions, 0)
    def test_missing_cloud_key_fails_before_spend(self):
        with self.assertRaisesRegex(ValueError, 'API key RunningHub'):
            Runner({}, {}).preflight()
    def test_failed_task_never_auto_resubmits(self):
        http = FakeHttp(); original = http.json
        http.json = lambda url, *a, **kw: {'code': 0, 'data': 'FAILED'} if url.endswith('/status') else original(url, *a, **kw)
        p = self.project()
        with self.assertRaises(ValueError): self.runner(http).run(p)
        self.assertEqual(http.submissions, 1)
        with self.assertRaises(ValueError): self.runner(http).run(p)
        self.assertEqual(http.submissions, 1)
    def test_stop_is_responsive_while_waiting(self):
        stop = threading.Event(); stop.set()
        with self.assertRaises(Stopped): Runner({}, {}, stop).pause(5)
    def test_multiple_video_outputs_not_guessed(self):
        http = FakeHttp(); original = http.json
        http.json = lambda url, *a, **kw: {'code': 0, 'data': [{'fileType': 'mp4', 'nodeId': '2'}, {'fileType': 'mp4', 'nodeId': '3'}]} if url.endswith('/outputs') else original(url, *a, **kw)
        with self.assertRaises(ValueError): self.runner(http).poll('old')
    def test_comfy_missing_node_fails(self):
        http = FakeHttp(); http.json = lambda *a, **kw: {}
        with self.assertRaisesRegex(ValueError, 'node'):
            Runner({'provider': 'ComfyUI'}, {}, http=http).preflight()
    def test_json_fence(self):
        self.assertEqual(parse_json_text('```json\n{"a":1}\n```'), {'a': 1})
    def test_real_render_with_silent_and_speaking_clips(self):
        p = self.project()
        p.data['scenes'].append({'id': 2, 'title': 'Two', 'prompt': 'test', 'dialogue': '', 'seconds': 5, 'characters': [], 'continuity': ''})
        for number in (1, 2):
            output = p.folder / f'clip{number}.mp4'
            args = [ffmpeg_exe(), '-y', '-f', 'lavfi', '-i', 'color=c=blue:s=128x72:r=24:d=0.5']
            if number == 1: args += ['-f', 'lavfi', '-i', 'sine=frequency=440:duration=0.5']
            subprocess.run(args + ['-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-shortest', str(output)], check=True, capture_output=True, timeout=25)
            p.data['jobs'][str(number)] = {'file': output.name}
        music = p.folder / 'music.wav'
        subprocess.run([ffmpeg_exe(), '-y', '-f', 'lavfi', '-i', 'sine=frequency=220:duration=1', str(music)], check=True, capture_output=True, timeout=15)
        p.data['music'] = music.name
        (p.folder / 'phu-de.srt').write_text('1\n00:00:00,000 --> 00:00:00,900\nXin chào!\n', encoding='utf-8')
        p.data['subtitles'] = 'phu-de.srt'
        result = render(p)
        self.assertGreater(result.stat().st_size, 1000)
        probe = subprocess.run([ffmpeg_exe(), '-i', str(result)], capture_output=True, timeout=10)
        self.assertIn(b'Audio:', probe.stderr)
        self.assertIn(b'1152x640', probe.stderr)
        self.assertEqual(p.data['output'], 'phim-hoan-chinh.mp4')
    def test_transcription_requires_key(self):
        with self.assertRaisesRegex(ValueError, 'API key'):
            transcribe(self.project(), DEFAULTS, {})

    def test_refuse_incomplete_final_export(self):
        with self.assertRaisesRegex(ValueError, 'chưa có video'): render(self.project())


if __name__ == '__main__':
    unittest.main()
