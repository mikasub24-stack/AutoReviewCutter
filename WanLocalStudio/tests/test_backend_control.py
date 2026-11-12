import json
from pathlib import Path
import sys
import tempfile
import subprocess
import time
import unittest
from unittest.mock import patch
sys.path.insert(0,str(Path(__file__).resolve().parents[1]))
import backend_control as control


class BackendControlTests(unittest.TestCase):
    def record(self, folder, **changes):
        result={'pid':12345,'executable':str(folder/'python_embeded/python.exe'),
                'argv':[str(folder/'python_embeded/python.exe'),'-s',str(folder/'ComfyUI/main.py'),'--listen','127.0.0.1','--port','8189','--lowvram'], 'birth':'123'}
        result.update(changes);return result

    def client(self, busy=False, url=control.MANAGED_URL):
        class Client:
            def __init__(self):self.url=url;self.calls=[]
            def request(self, route):
                self.calls.append(route)
                return {'queue_running':[[0,'active',{},{}]] if busy else [],'queue_pending':[]}
        return Client()

    def test_ownership_requires_exact_install_main_and_loopback_port(self):
        with tempfile.TemporaryDirectory() as td:
            folder=Path(td);record=self.record(folder)
            self.assertTrue(control.owned_process(record,folder))
            self.assertFalse(control.owned_process(self.record(folder,executable='/other/python.exe'),folder))
            for argv in ([record['argv'][0],'/other/main.py','--listen','127.0.0.1','--port','8189'],
                         [record['argv'][0],record['argv'][2],'--listen','0.0.0.0','--port','8189'],
                         [record['argv'][0],record['argv'][2],'--listen','127.0.0.1','--port','8188']):
                self.assertFalse(control.owned_process(self.record(folder,argv=argv),folder))

    def test_upgrade_stops_only_exact_idle_backend_after_queue_recheck(self):
        with tempfile.TemporaryDirectory() as td:
            folder=Path(td);client=self.client();record=self.record(folder)
            with patch.object(control,'processes',return_value=[record,self.record(Path('/other'))]),patch.object(control,'stop_verified') as stop:
                self.assertFalse(control.ensure_launch_profile(folder,folder,client,lambda _:None))
                stop.assert_called_once_with(record)
                self.assertEqual(client.calls,['/queue','/queue'])

    def test_busy_or_unknown_server_is_never_stopped(self):
        with tempfile.TemporaryDirectory() as td:
            folder=Path(td)
            for busy,records in ((True,[self.record(folder)]),(False,[]),(False,[self.record(Path('/other'))])):
                with patch.object(control,'processes',return_value=records),patch.object(control,'stop_verified') as stop:
                    with self.assertRaises(RuntimeError):control.ensure_launch_profile(folder,folder,self.client(busy),lambda _:None)
                    stop.assert_not_called()

    def test_queue_that_becomes_busy_during_identity_check_is_not_stopped(self):
        with tempfile.TemporaryDirectory() as td:
            folder=Path(td);client=self.client()
            def request(route):
                client.calls.append(route)
                return {'queue_running':[] if len(client.calls)==1 else [[0,'new',{},{}]],'queue_pending':[]}
            client.request=request
            with patch.object(control,'processes',return_value=[self.record(folder)]),patch.object(control,'stop_verified') as stop:
                with self.assertRaises(RuntimeError):control.ensure_launch_profile(folder,folder,client,lambda _:None)
                stop.assert_not_called()

    def test_matching_current_profile_needs_no_restart(self):
        with tempfile.TemporaryDirectory() as td:
            folder=Path(td);record=self.record(folder)
            record['argv']=record['argv'][:-1]+['--reserve-vram','1']
            (folder/'backend-launch.json').write_text(json.dumps({'profile':control.PROFILE,'pid':record['pid'],
                'executable':record['executable'],'main':str(folder/'ComfyUI/main.py')}))
            with patch.object(control,'processes',return_value=[record]),patch.object(control,'stop_verified') as stop:
                self.assertTrue(control.ensure_launch_profile(folder,folder,self.client(),lambda _:None))
                stop.assert_not_called()

    def test_delete_fallback_stops_backend_only_when_all_jobs_belong_to_project(self):
        with tempfile.TemporaryDirectory() as td:
            folder=Path(td);client=self.client(True);record=self.record(folder)
            with patch.object(control,'processes',return_value=[record]),patch.object(control,'stop_verified') as stop:
                self.assertTrue(control.stop_project_backend(folder,client,{'active','finished'},lambda _:None))
                stop.assert_called_once_with(record)
                self.assertEqual(client.calls,['/queue','/queue'])

    def test_delete_fallback_does_not_stop_for_other_jobs_external_servers_or_unknown_owner(self):
        with tempfile.TemporaryDirectory() as td:
            folder=Path(td)
            cases=[(self.client(True),{'another'},[self.record(folder)]),
                   (self.client(True,url='http://127.0.0.1:8188'),{'active'},[self.record(folder)]),
                   (self.client(True),{'active'},[self.record(Path('/other'))]),
                   (self.client(True),set(),[self.record(folder)])]
            for client,ids,records in cases:
                with self.subTest(url=client.url,ids=ids),patch.object(control,'processes',return_value=records),patch.object(control,'stop_verified') as stop:
                    with self.assertRaises(RuntimeError):control.stop_project_backend(folder,client,ids,lambda _:None)
                    stop.assert_not_called()

    def test_delete_fallback_rechecks_queue_and_refuses_a_new_unrelated_job(self):
        with tempfile.TemporaryDirectory() as td:
            folder=Path(td);client=self.client(True)
            def request(route):
                client.calls.append(route)
                ids=['mine'] if len(client.calls)==1 else ['mine','another-project']
                return {'queue_running':[[i,pid,{},{}] for i,pid in enumerate(ids)],'queue_pending':[]}
            client.request=request
            with patch.object(control,'processes',return_value=[self.record(folder)]),patch.object(control,'stop_verified') as stop:
                with self.assertRaises(RuntimeError):control.stop_project_backend(folder,client,{'mine'},lambda _:None)
                stop.assert_not_called()

    def test_delete_fallback_leaves_idle_backend_running(self):
        with patch.object(control,'processes') as listing,patch.object(control,'stop_verified') as stop:
            self.assertFalse(control.stop_project_backend('/unused',self.client(),{'mine'},lambda _:None))
            listing.assert_not_called();stop.assert_not_called()

    def test_process_handle_stops_only_the_owned_test_child(self):
        if control.os.name!='nt' and not hasattr(control.os,'pidfd_open'):
            self.skipTest('Process handle not supported on this platform')
        child=subprocess.Popen([sys.executable,'-c','import time; time.sleep(60)'])
        unrelated=subprocess.Popen([sys.executable,'-c','import time; time.sleep(60)'])
        try:
            record=None
            for _ in range(10):
                record=next((item for item in control.processes() if item['pid']==child.pid),None)
                if record:break
                time.sleep(.1)
            self.assertIsNotNone(record)
            control.stop_verified(record)
            child.wait(timeout=10)
            self.assertIsNone(unrelated.poll())
        finally:
            for process in (child,unrelated):
                if process.poll() is None:process.terminate()
                process.wait(timeout=10)

    def test_external_comfy_is_never_enumerated_or_restarted(self):
        with patch.object(control,'processes') as listing,patch.object(control,'stop_verified') as stop:
            self.assertTrue(control.ensure_launch_profile('/unused','/unused',self.client(url='http://127.0.0.1:8188'),lambda _:None))
            listing.assert_not_called();stop.assert_not_called()


if __name__=='__main__':unittest.main()
