import json
from pathlib import Path
import subprocess
import sys
import tempfile
import threading
import time
import unittest
import urllib.request
from unittest.mock import patch
sys.path.insert(0,str(Path(__file__).resolve().parents[1]))
import network

class NetworkTests(unittest.TestCase):
    def test_cancel_stops_a_worker_waiting_for_a_server_and_reaps_it(self):
        with tempfile.TemporaryDirectory() as td:
            marker=Path(td)/'waiting'
            code="import sys,time,pathlib;sys.stdin.buffer.read();pathlib.Path(sys.argv[1]).write_text('started');time.sleep(120)"
            cancel=threading.Event();errors=[];processes=[]
            original=subprocess.Popen
            def spawn(*args,**kwargs):
                process=original(*args,**kwargs);processes.append(process);return process
            def task():
                try:network.perform(urllib.request.Request('https://generativelanguage.googleapis.com/test',data=json.dumps({'prompt':'x'*200000}).encode()),cancel,
                                    worker_command=[sys.executable,'-c',code,str(marker)])
                except Exception as e:errors.append(e)
            with patch.object(network.subprocess,'Popen',side_effect=spawn):
                worker=threading.Thread(target=task);worker.start()
                deadline=time.monotonic()+10
                while not marker.exists() and time.monotonic()<deadline:time.sleep(.02)
                self.assertTrue(marker.exists(),'Fixture did not reach blocked server wait')
                started=time.monotonic();cancel.set();worker.join(3)
                self.assertFalse(worker.is_alive(),'Cancellation still waiting on a network response')
                self.assertLess(time.monotonic()-started,3)
            self.assertIsInstance(errors[0],network.Cancelled)
            self.assertIsNotNone(processes[0].poll(),'API process was left running')

    def test_key_is_only_in_stdin_and_success_response_roundtrips(self):
        code="import sys,json;p=json.load(sys.stdin);assert any(k.lower()=='x-goog-api-key' for k in p['headers']);print(json.dumps({'ok':True,'data':{'answer':'OK'}}))"
        command=[sys.executable,'-c',code]
        req=urllib.request.Request('https://generativelanguage.googleapis.com/test',data=b'{}',headers={'x-goog-api-key':'private-key'})
        self.assertEqual(network.perform(req,worker_command=command),{'answer':'OK'})
        self.assertTrue(all('private-key' not in part for part in command))

if __name__=='__main__':unittest.main()
