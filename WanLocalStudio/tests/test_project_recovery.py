import json
from pathlib import Path
import sys
import tempfile
import unittest
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
import project_recovery as recovery


def project(root, name='Hunyuan-20260101', project_id='a'*32, **extra):
    path = Path(root) / name
    path.mkdir(parents=True)
    data = {'id': project_id, 'topic': recovery.TOPICS[0], 'scenes': [{}],
            'server': 'http://127.0.0.1:8189', **extra}
    (path/'project.json').write_text(json.dumps(data), encoding='utf-8')
    return path


def queue(pid='running-id', prompt=None, extra=None, running=True):
    task = [0, pid, {} if prompt is None else prompt, {} if extra is None else extra]
    return {'queue_running': [task] if running else [], 'queue_pending': [] if running else [task]}


class RecoveryTests(unittest.TestCase):
    def test_032_migration_recovers_active_queue_without_any_remembered_path(self):
        with tempfile.TemporaryDirectory() as td:
            path = project(td)
            found = recovery.discover([td], queues=[('http://127.0.0.1:8189', queue(extra={'client_id':'a'*32}))])
            self.assertEqual([x['path'] for x in found], [path])
            self.assertTrue(found[0]['running']); self.assertEqual(found[0]['prompt_ids'], ['running-id'])

    def test_custom_root_pending_and_running_are_deduplicated(self):
        with tempfile.TemporaryDirectory() as td:
            root = Path(td)/'custom'; path = project(root, scenes=[{'prompt_id':'running-id'}], portrait_request={'prompt_id':'pending-id'})
            running = queue(); running['queue_pending'] = queue('pending-id',running=False)['queue_pending']
            found = recovery.discover([root,root], active_path=path, queues=[('http://127.0.0.1:8189', running)])
            self.assertEqual(len(found),1); self.assertTrue(found[0]['pending']);self.assertTrue(found[0]['running'])
            self.assertEqual(found[0]['prompt_ids'],['pending-id','running-id'])

    def test_uncertain_request_marker_and_exact_save_prefix_are_recovered(self):
        with tempfile.TemporaryDirectory() as td:
            first = project(td, request_marker='unused', scenes=[{'request_marker':'own-marker'}])
            second = project(td,'Wan-old','b'*32)
            tasks = queue(extra={'hunyuanlocal_request':'own-marker'})
            tasks['queue_pending'] = queue('other',prompt={'save':{'class_type':'SaveImage','inputs':{'filename_prefix':'WanLocal/'+'b'*32+'/scene-1'}}},running=False)['queue_pending']
            found = recovery.discover([td], queues=[('http://127.0.0.1:8189',tasks)])
            self.assertEqual({x['path'] for x in found},{first,second})

    def test_unrelated_jobs_or_other_servers_never_choose_a_random_project(self):
        with tempfile.TemporaryDirectory() as td:
            project(td)
            wrong_prefix = {'save':{'class_type':'SaveImage','inputs':{'filename_prefix':'Other/'+'a'*32+'/scene'}}}
            for url, tasks in [('http://127.0.0.1:8189',queue(prompt=wrong_prefix)),
                               ('http://127.0.0.1:8190',queue(extra={'client_id':'a'*32})),
                               ('http://remote.invalid:8189',queue(extra={'client_id':'a'*32}))]:
                self.assertEqual(recovery.discover([td], queues=[(url,tasks)]),[])

    def test_only_unfinished_remembered_project_can_be_fallback(self):
        with tempfile.TemporaryDirectory() as td:
            active = project(td)
            completed = project(td,'Hunyuan-complete','b'*32,final_sha256='f'*64)
            (completed/'video-hoan-tat.mp4').write_bytes(b'done')
            self.assertEqual(recovery.discover([td]),[])
            self.assertEqual(recovery.discover([td],active_path=completed),[])
            found = recovery.discover([td],active_path=active)
            self.assertEqual(found[0]['path'],active); self.assertFalse(found[0]['matched_queue'])

    def test_remembered_paused_project_is_not_replaced_by_other_windows_running_job(self):
        with tempfile.TemporaryDirectory() as td:
            paused=project(td,'Hunyuan-paused','a'*32)
            running=project(td,'Hunyuan-running','b'*32)
            found=recovery.discover([td],active_path=paused,queues=[('http://127.0.0.1:8189',queue(extra={'client_id':'b'*32}))])
            self.assertEqual({x['path'] for x in found},{paused,running})
            selected=next(x for x in found if x['path']==paused)
            self.assertFalse(selected['matched_queue'])

    def test_nested_directories_and_linked_projects_outside_root_are_not_scanned(self):
        with tempfile.TemporaryDirectory() as td:
            root = Path(td)/'root'; root.mkdir()
            outside = project(Path(td)/'outside')
            project(root/'nested')
            try:
                (root/'linked').symlink_to(outside,target_is_directory=True)
            except OSError:
                pass
            q = [('http://127.0.0.1:8189',queue(extra={'client_id':'a'*32}))]
            self.assertEqual(recovery.discover([root],queues=q),[])
            self.assertEqual(recovery.discover([root],active_path=root/'linked',queues=q),[])

    def test_invalid_or_oversized_manifest_is_ignored(self):
        with tempfile.TemporaryDirectory() as td:
            path = project(td,project_id='../not-valid')
            q = [('http://127.0.0.1:8189',queue(extra={'client_id':'../not-valid'}))]
            self.assertEqual(recovery.discover([td],active_path=path,queues=q),[])
            (path/'project.json').write_bytes(b' '* (recovery.MAX_MANIFEST_BYTES+1))
            self.assertIsNone(recovery.read_project(path))


if __name__ == '__main__':
    unittest.main()
