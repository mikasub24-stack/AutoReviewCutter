import base64
import hashlib
import json
from pathlib import Path
import socket
import struct
import sys
import threading
import time
import unittest
from unittest.mock import patch
sys.path.insert(0,str(Path(__file__).resolve().parents[1]))
from progress import ProgressMonitor,ProtocolError,_WebSocket


def frame(value,opcode=1,fin=True):
    payload=value.encode() if isinstance(value,str) else value
    head=bytes([(128 if fin else 0)|opcode])
    if len(payload)<126:head+=bytes([len(payload)])
    elif len(payload)<65536:head+=b'\x7e'+struct.pack('!H',len(payload))
    else:head+=b'\x7f'+struct.pack('!Q',len(payload))
    return head+payload


def event(kind,prompt='mine',**values):
    return json.dumps({'type':kind,'data':dict(prompt_id=prompt,**values)})


class MockServer:
    def __init__(self,handler):
        self.handler=handler;self.error=None;self.ready=threading.Event();self.closed=threading.Event()
        self.server=socket.socket();self.server.bind(('127.0.0.1',0));self.server.listen(1);self.server.settimeout(3)
        self.url=f'http://127.0.0.1:{self.server.getsockname()[1]}'
        self.thread=threading.Thread(target=self.run,daemon=True);self.thread.start()
    def run(self):
        try:
            sock,_=self.server.accept()
            with sock:
                sock.settimeout(3);request=bytearray()
                while b'\r\n\r\n' not in request:request.extend(sock.recv(4096))
                self.request=bytes(request).decode();self.handler(sock,self.request,self.ready)
        except Exception as exc:self.error=exc
        finally:self.closed.set();self.server.close()
    def join(self):
        self.thread.join(4)
        if self.error:raise self.error


def upgrade(sock,request,extra=b''):
    key=next(x.split(':',1)[1].strip() for x in request.split('\r\n') if x.lower().startswith('sec-websocket-key:'))
    accept=base64.b64encode(hashlib.sha1((key+'258EAFA5-E914-47DA-95CA-C5AB0DC85B11').encode()).digest()).decode()
    sock.sendall((f'HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Accept: {accept}\r\n\r\n').encode()+extra)


class ProgressTests(unittest.TestCase):
    def test_fragment_ping_binary_and_own_prompt_are_handled_on_real_socket(self):
        pong=[]
        def handler(sock,request,ready):
            message=event('progress',node='sampler',value=3,max=12)
            upgrade(sock,request,frame(b'preview ignored',2)+frame(message[:24],1,False))
            sock.sendall(frame(b'test-ping',9)+frame(message[24:],0,True))
            response=sock.recv(128);pong.append(response)
            sock.sendall(frame(event('progress',prompt='other',node='sampler',value=99,max=100)))
            ready.set();time.sleep(.2)
        server=MockServer(handler);monitor=ProgressMonitor(server.url,'project with space').start();monitor.bind('mine')
        self.assertTrue(server.ready.wait(3));time.sleep(.05)
        snapshot=monitor.snapshot();description=monitor.describe();monitor.close();server.join()
        self.assertEqual(snapshot['value'],3);self.assertEqual(snapshot['maximum'],12)
        self.assertIn('3/12',description);self.assertIn('25%',description)
        self.assertIn('clientId=project+with+space',server.request)
        self.assertTrue(pong[0][0]==0x8a and pong[0][1]&0x80)
        mask=pong[0][2:6];body=pong[0][6:];self.assertEqual(bytes(x^mask[i%4] for i,x in enumerate(body)),b'test-ping')

    def test_invalid_upgrade_cannot_supply_progress(self):
        def handler(sock,request,ready):
            sock.sendall(b'HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Accept: wrong\r\n\r\n')
            ready.set()
        server=MockServer(handler);monitor=ProgressMonitor(server.url,'project').start();monitor.bind('mine')
        self.assertTrue(server.ready.wait(3));server.closed.wait(2);time.sleep(.05)
        self.assertEqual(monitor.snapshot(),{});self.assertIsNone(monitor.describe());monitor.close();server.join()

    def test_masks_on_server_frames_are_rejected(self):
        def handler(sock,request,ready):
            upgrade(sock,request,b'\x81\x80'+b'1234');ready.set()
        server=MockServer(handler);stopped=threading.Event();ws=_WebSocket(server.url,'project',stopped)
        try:
            with self.assertRaises(ProtocolError):ws.message()
        finally:ws.close();server.join()

    def test_ambiguous_reconnect_events_and_malformed_values_are_not_progress(self):
        monitor=ProgressMonitor('http://127.0.0.1:8189','project');monitor.bind('mine')
        monitor._event(json.dumps({'type':'executing','data':{'node':'sampler'}}))
        monitor._event('not json')
        self.assertIsNone(monitor.describe())
        monitor._event(event('executing',node='positive'))
        self.assertIn('Mã hóa mô tả',monitor.describe())
        for invalid in ('ten',True,-2,999):monitor._event(event('progress',node='sampler',value=invalid,max=12))
        self.assertNotIn('value',monitor.snapshot())
        monitor._event(event('progress',node='sampler',value=4,max=12));self.assertEqual(monitor.snapshot()['value'],4)
        monitor._event(event('executing',node='decode'));self.assertNotIn('value',monitor.snapshot())
        self.assertEqual(monitor.describe(),'Giải mã khung hình')

    def test_events_received_before_post_response_are_retained_until_bind(self):
        monitor=ProgressMonitor('http://127.0.0.1:8189','project');monitor.bind('old')
        monitor._event(event('executing',prompt='new',node='positive'))
        self.assertEqual(monitor.snapshot(),{})
        monitor.bind('new');self.assertIn('Mã hóa mô tả',monitor.describe())

    def test_eta_uses_last_observation_and_disappears_when_stale(self):
        monitor=ProgressMonitor('http://127.0.0.1:8189','project');monitor.bind('mine')
        with patch('progress.time.monotonic',return_value=100):
            monitor._event(event('progress',node='sampler',value=1,max=12))
        with patch('progress.time.monotonic',return_value=120):
            monitor._event(event('progress',node='sampler',value=3,max=12))
        with patch('progress.time.monotonic',return_value=121):
            self.assertIn('còn 1.5 phút',monitor.describe())
        with patch('progress.time.monotonic',return_value=125):
            self.assertIn('còn 1.5 phút',monitor.describe())
        with patch('progress.time.monotonic',return_value=155):
            description=monitor.describe()
            self.assertNotIn('ước tính',description)
            self.assertIn('35 giây trước',description)
            self.assertIn('3/12',description)

    def test_monitor_connection_failure_is_optional_and_close_is_fast(self):
        unused=socket.socket();unused.bind(('127.0.0.1',0));port=unused.getsockname()[1];unused.close()
        monitor=ProgressMonitor(f'http://127.0.0.1:{port}','project').start();monitor.bind('mine')
        time.sleep(.05);started=time.monotonic();monitor.close()
        self.assertLess(time.monotonic()-started,1.2);self.assertIsNone(monitor.describe())


if __name__=='__main__':unittest.main()
