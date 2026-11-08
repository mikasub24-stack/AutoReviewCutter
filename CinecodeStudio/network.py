"""Cancellable HTTPS transport. API credentials travel through stdin, never argv/files."""
import io
import json
import os
from pathlib import Path
import re
import subprocess
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
from email.message import Message

class Cancelled(RuntimeError):
    pass

class NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, *args, **kwargs): return None

def restore_stdio():
    # A PyInstaller windowed EXE has sys.stdin/stdout=None even when its caller supplies pipes.
    if os.name=='nt' and (sys.stdin is None or sys.stdout is None):
        import ctypes
        from ctypes import wintypes
        import msvcrt
        get=ctypes.windll.kernel32.GetStdHandle
        get.argtypes=[wintypes.DWORD];get.restype=wintypes.HANDLE
        for name,identifier,flags,mode in [('stdin',-10,os.O_RDONLY,'rb'),('stdout',-11,os.O_WRONLY,'wb')]:
            if getattr(sys,name) is None:
                handle=get(wintypes.DWORD(identifier))
                if not handle or handle==wintypes.HANDLE(-1).value:raise OSError('Missing worker pipe')
                fd=msvcrt.open_osfhandle(handle,flags|os.O_BINARY)
                setattr(sys,name,io.TextIOWrapper(os.fdopen(fd,mode),encoding='utf-8'))

def _stop(process):
    if process.poll() is None: process.kill()
    process.communicate(timeout=3)

def perform(request, cancelled=None, timeout=180, worker_command=None):
    if cancelled is not None and cancelled.is_set(): raise Cancelled('Đã hủy tác vụ AI.')
    command = worker_command or ([sys.executable,'--api-worker'] if getattr(sys,'frozen',False)
                                else [sys.executable,str(Path(__file__).resolve())])
    payload=json.dumps({'url':request.full_url,'data':request.data.decode('utf-8') if request.data else None,
                        'headers':dict(request.header_items()),'timeout':timeout}).encode('utf-8')
    process=subprocess.Popen(command,stdin=subprocess.PIPE,stdout=subprocess.PIPE,stderr=subprocess.PIPE,
                             creationflags=getattr(subprocess,'CREATE_NO_WINDOW',0))
    deadline=time.monotonic()+timeout
    try:
        while True:
            if cancelled is not None and cancelled.is_set():
                _stop(process);raise Cancelled('Đã hủy tác vụ AI.')
            if time.monotonic()>=deadline:
                _stop(process);raise urllib.error.URLError('Request timed out')
            try:
                output,_=process.communicate(input=payload,timeout=.1)
                break
            except subprocess.TimeoutExpired: payload=None
        if cancelled is not None and cancelled.is_set(): raise Cancelled('Đã hủy tác vụ AI.')
        if process.returncode: raise urllib.error.URLError('API worker stopped unexpectedly')
        try: result=json.loads(output)
        except (ValueError,UnicodeError): raise urllib.error.URLError('Invalid API worker response') from None
        if result.get('ok'): return result['data']
        if result.get('kind')=='http':
            headers=Message()
            if result.get('retry'):headers['Retry-After']=result['retry']
            raise urllib.error.HTTPError(request.full_url,result['code'],'Google API error',headers,
                                         io.BytesIO(result['body'].encode('utf-8')))
        raise urllib.error.URLError('API connection failed')
    finally:
        if process.poll() is None:_stop(process)

def worker_main(self_test=False, wait_test=False):
    key=''
    try:
        payload=json.load(sys.stdin)
        if self_test or wait_test:
            if wait_test:time.sleep(120)
            sys.stdout.write(json.dumps({'ok':True,'data':{'transport':'ready'}}));sys.stdout.flush();return
        url=urllib.parse.urlsplit(payload['url'])
        if url.scheme!='https' or url.hostname!='generativelanguage.googleapis.com' or url.port not in (None,443):
            raise ValueError('Unsupported API host')
        headers=payload['headers']
        key=next((v for k,v in headers.items() if k.lower()=='x-goog-api-key'),'')
        request=urllib.request.Request(payload['url'],data=payload['data'].encode() if payload['data'] is not None else None,headers=headers)
        with urllib.request.build_opener(NoRedirect).open(request,timeout=payload['timeout']) as response:
            result={'ok':True,'data':json.load(response)}
    except urllib.error.HTTPError as e:
        body=e.read(65536).decode('utf-8',errors='replace')
        if key:body=body.replace(key,'[khóa đã ẩn]')
        body=re.sub(r'AIza[\w-]+','[khóa đã ẩn]',body)
        result={'ok':False,'kind':'http','code':e.code,'body':body,'retry':e.headers.get('Retry-After','') if e.headers else ''}
        e.close()
    except Exception:
        result={'ok':False,'kind':'network'}
    sys.stdout.write(json.dumps(result,ensure_ascii=True));sys.stdout.flush()

if __name__=='__main__':worker_main()
