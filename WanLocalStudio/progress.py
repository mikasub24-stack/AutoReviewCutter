"""Optional, loopback-only ComfyUI WebSocket telemetry; never owns render jobs.

Protocol verified against ComfyUI v0.45.0 server.py (/ws) and main.py's
progress hook. The normal HTTP history/queue API remains authoritative.
"""
from __future__ import annotations
import base64
import hashlib
import json
import os
import socket
import struct
import threading
import time
import urllib.parse


class ProtocolError(ValueError):
    pass


class _WebSocket:
    """Small RFC6455 client for JSON telemetry, with no proxy or dependencies."""
    def __init__(self, url, client_id, stopped, timeout=2):
        parsed=urllib.parse.urlsplit(url)
        if parsed.scheme!='http' or parsed.hostname not in ('127.0.0.1','localhost','::1') or parsed.username or parsed.password:
            raise ValueError('Telemetry only supports local ComfyUI.')
        self.stopped=stopped;self.buffer=bytearray();self.fragment=None;self.fragments=bytearray()
        self.socket=socket.create_connection((parsed.hostname,parsed.port or 80),timeout=timeout)
        self.socket.settimeout(.4)
        key=base64.b64encode(os.urandom(16)).decode()
        host=parsed.netloc
        path='/ws?'+urllib.parse.urlencode({'clientId':client_id})
        request=(f'GET {path} HTTP/1.1\r\nHost: {host}\r\nUpgrade: websocket\r\nConnection: Upgrade\r\n'
                 f'Sec-WebSocket-Key: {key}\r\nSec-WebSocket-Version: 13\r\n\r\n')
        try:
            self.socket.sendall(request.encode('ascii'))
            deadline=time.monotonic()+timeout
            while b'\r\n\r\n' not in self.buffer:
                if len(self.buffer)>16384:raise ProtocolError('Oversized WebSocket headers')
                if stopped.is_set() or time.monotonic()>deadline:raise TimeoutError('WebSocket upgrade timed out')
                try:chunk=self.socket.recv(4096)
                except socket.timeout:continue
                if not chunk:raise EOFError('WebSocket upgrade closed')
                self.buffer.extend(chunk)
            raw,tail=bytes(self.buffer).split(b'\r\n\r\n',1);self.buffer=bytearray(tail)
            lines=raw.decode('latin-1').split('\r\n');headers={}
            for line in lines[1:]:
                if ':' not in line:raise ProtocolError('Invalid WebSocket headers')
                name,value=line.split(':',1);headers[name.lower()]=value.strip()
            accept=base64.b64encode(hashlib.sha1((key+'258EAFA5-E914-47DA-95CA-C5AB0DC85B11').encode()).digest()).decode()
            if (len(lines[0].split())<2 or lines[0].split()[1]!='101' or headers.get('sec-websocket-accept')!=accept
                    or headers.get('upgrade','').lower()!='websocket' or 'upgrade' not in headers.get('connection','').lower()):
                raise ProtocolError('Invalid WebSocket upgrade')
        except BaseException:
            self.close();raise

    def close(self):
        try:self.socket.shutdown(socket.SHUT_RDWR)
        except OSError:pass
        self.socket.close()

    def _read(self, count):
        while len(self.buffer)<count:
            if self.stopped.is_set():raise EOFError('Monitor closed')
            try:chunk=self.socket.recv(min(65536,count-len(self.buffer)))
            except socket.timeout:continue
            if not chunk:raise EOFError('WebSocket closed')
            self.buffer.extend(chunk)
        result=bytes(self.buffer[:count]);del self.buffer[:count];return result

    def _control(self, opcode, payload):
        mask=os.urandom(4)
        body=bytes(value^mask[index%4] for index,value in enumerate(payload))
        self.socket.sendall(bytes([0x80|opcode,0x80|len(payload)])+mask+body)

    def message(self):
        while True:
            first,second=self._read(2);fin=bool(first&0x80);opcode=first&15
            if first&0x70 or second&0x80:raise ProtocolError('Unsupported WebSocket flags')
            length=second&127
            if length==126:length=struct.unpack('!H',self._read(2))[0]
            elif length==127:length=struct.unpack('!Q',self._read(8))[0]
            if length>8*1024*1024:raise ProtocolError('Oversized telemetry frame')
            if opcode>=8 and (not fin or length>125):raise ProtocolError('Invalid control frame')
            payload=self._read(length)
            if opcode==8:raise EOFError('WebSocket closed')
            if opcode==9:self._control(10,payload);continue
            if opcode==10:continue
            if opcode in (1,2):
                if self.fragment is not None:raise ProtocolError('Interleaved fragments')
                if fin:
                    if opcode==1:return payload.decode('utf-8')
                    continue  # Binary previews are deliberately not retained.
                self.fragment=opcode;self.fragments=bytearray(payload)
            elif opcode==0:
                if self.fragment is None:raise ProtocolError('Unexpected continuation')
                self.fragments.extend(payload)
                if len(self.fragments)>8*1024*1024:raise ProtocolError('Oversized fragmented message')
                if fin:
                    kind=self.fragment;self.fragment=None;message=bytes(self.fragments);self.fragments.clear()
                    if kind==1:return message.decode('utf-8')
            else:raise ProtocolError('Unknown WebSocket opcode')


class ProgressMonitor:
    """Best-effort observer, bound to one prompt. Errors never escape its thread.

    Start before submitting /prompt with the same client_id. Call bind(prompt_id)
    after the POST response, then describe() while polling HTTP history. Always
    close() when leaving generation. snapshot() exposes only real observed data.
    """
    def __init__(self, url, client_id):
        self.url=url;self.client_id=str(client_id);self.stopped=threading.Event();self.ready=threading.Event()
        self.lock=threading.Lock();self.target=None;self.records={};self.connection=None;self.thread=None

    def start(self):
        if self.thread is None:
            self.thread=threading.Thread(target=self._listen,daemon=True,name='ComfyProgress');self.thread.start()
        return self

    def bind(self, prompt_id):
        with self.lock:
            self.target=str(prompt_id)
            # A project can have many scenes: discard all other prompt records.
            self.records={self.target:self.records[self.target]} if self.target in self.records else {}

    def close(self):
        self.stopped.set()
        connection=self.connection
        if connection:connection.close()
        if self.thread and self.thread is not threading.current_thread():self.thread.join(timeout=1)

    def snapshot(self):
        with self.lock:return dict(self.records.get(self.target,{}))

    def describe(self):
        value=self.snapshot()
        if not value:return None
        node=value.get('node')
        names={'unet':'Đọc model Hunyuan','clip':'Nạp bộ mã hóa văn bản','positive':'Mã hóa mô tả',
               'negative':'Mã hóa điều kiện','vision_loader':'Nạp bộ tham chiếu','vision':'Phân tích ảnh tham chiếu',
               'condition':'Chuẩn bị ảnh đầu vào','sampler':'Sinh chuyển động','decode':'Giải mã khung hình',
               'save':'Lưu khung hình','latent':'Chuẩn bị khung hình'}
        stage=names.get(node,'Đang xử lý node '+str(node)[:80] if node is not None else 'ComfyUI đang thực thi')
        age=max(0,time.monotonic()-value.get('updated',time.monotonic()))
        maximum=value.get('maximum');step=value.get('value')
        if maximum and step is not None:
            stage+=f' · bước {step:g}/{maximum:g} ({step/maximum:.0%})'
            started=value.get('step_started');first=value.get('first_value')
            # Estimate only after at least two measured sampling steps. This is
            # sampling time remaining, never a promised whole-project ETA.
            if node=='sampler' and started and first is not None and step-first>=2 and age<=10:
                remaining=max(0,value['updated']-started)/(step-first)*(maximum-step)
                stage+=f' · ước tính còn {remaining/60:.1f} phút cho bước sinh này'
        if age>15:stage+=f' · lần cập nhật gần nhất {int(age)} giây trước'
        return stage

    def _event(self, message):
        try:event=json.loads(message)
        except (ValueError,TypeError):return
        if not isinstance(event,dict) or event.get('type') not in ('execution_start','executing','progress'):
            return
        data=event.get('data')
        if not isinstance(data,dict) or not data.get('prompt_id'):return
        prompt=str(data['prompt_id'])
        with self.lock:
            record=self.records.setdefault(prompt,{})
            if len(self.records)>8:
                self.records.pop(next(iter(self.records)))
            if event['type']=='execution_start':record.clear()
            node=data.get('node')
            if node is not None and not isinstance(node,str):return
            if 'node' in data and node!=record.get('node'):
                record.clear();record['node']=node
            record['updated']=time.monotonic()
            if event['type']=='progress':
                value,maximum=data.get('value'),data.get('max')
                if (isinstance(value,(int,float)) and not isinstance(value,bool)
                        and isinstance(maximum,(int,float)) and not isinstance(maximum,bool)
                        and 0<maximum<1e9 and 0<=value<=maximum):
                    if 'step_started' not in record or value<record.get('value',0):
                        record['step_started']=time.monotonic();record['first_value']=value
                    record['value']=value;record['maximum']=maximum

    def _listen(self):
        while not self.stopped.is_set():
            try:
                self.connection=_WebSocket(self.url,self.client_id,self.stopped)
                self.ready.set()
                while not self.stopped.is_set():self._event(self.connection.message())
            except (OSError,ValueError,EOFError,UnicodeError):
                pass
            finally:
                if self.connection:self.connection.close();self.connection=None
            if self.stopped.wait(2):break
