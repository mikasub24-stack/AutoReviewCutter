"""Restart only the tool's exact, idle, loopback ComfyUI process on upgrades."""
from __future__ import annotations
import base64
import ctypes
import json
import os
from pathlib import Path
import signal
import subprocess
import time

PROFILE = 'normal-vram-v1'
MANAGED_URL = 'http://127.0.0.1:8189'


def _same_path(left, right):
    return os.path.normcase(os.path.abspath(str(left))) == os.path.normcase(os.path.abspath(str(right)))


def _flag(argv, name):
    values=[]
    for i,part in enumerate(argv):
        if part == name and i+1<len(argv): values.append(argv[i+1])
        elif part.startswith(name+'='): values.append(part.split('=',1)[1])
    return values[0] if len(values)==1 else None


def owned_process(record, folder):
    """Pure identity predicate; a basename or matching port is never sufficient."""
    folder=Path(folder)
    argv=record.get('argv',[])
    if not isinstance(argv,list) or not argv or not isinstance(record.get('pid'),int):return False
    python=folder/'python_embeded/python.exe'; main=folder/'ComfyUI/main.py'
    return (record['pid']>0 and _same_path(record.get('executable',''),python)
            and _same_path(argv[0],python)
            and sum(_same_path(arg,main) for arg in argv[1:] if not arg.startswith('-'))==1
            and _flag(argv,'--port')=='8189' and _flag(argv,'--listen')=='127.0.0.1')


def _windows_argv(command):
    count=ctypes.c_int()
    parse=ctypes.windll.shell32.CommandLineToArgvW
    parse.argtypes=[ctypes.c_wchar_p,ctypes.POINTER(ctypes.c_int)]
    parse.restype=ctypes.POINTER(ctypes.c_wchar_p)
    result=parse(command,ctypes.byref(count))
    if not result:raise OSError('Không đọc được command line của backend.')
    try:return [result[i] for i in range(count.value)]
    finally:
        free=ctypes.windll.kernel32.LocalFree
        free.argtypes=[ctypes.c_void_p];free.restype=ctypes.c_void_p
        free(result)


def _powershell(script, expected=None):
    env=os.environ.copy()
    if expected is not None:
        env['HUNYUAN_EXPECTED_PROCESS']=base64.b64encode(json.dumps(expected).encode()).decode()
    result=subprocess.run(['powershell.exe','-NoProfile','-NonInteractive','-Command',script],
                          capture_output=True,text=True,encoding='utf-8',timeout=25,env=env,
                          creationflags=getattr(subprocess,'CREATE_NO_WINDOW',0))
    if result.returncode:
        raise RuntimeError('Không xác minh/dừng được backend riêng. '+result.stderr[-1000:])
    return result.stdout.strip().lstrip('\ufeff')


def processes():
    if os.name=='nt':
        script=r'''$ErrorActionPreference='Stop'
[Console]::OutputEncoding=[System.Text.UTF8Encoding]::new()
$result=@(Get-CimInstance Win32_Process -Filter "Name='python.exe'" | ForEach-Object {
    [pscustomobject]@{pid=[int]$_.ProcessId;executable=$_.ExecutablePath;commandline=$_.CommandLine;birth=$_.CreationDate.ToUniversalTime().ToString('o')}
})
ConvertTo-Json -InputObject $result -Compress'''
        records=json.loads(_powershell(script) or '[]')
        for record in records:
            record['argv']=_windows_argv(record.get('commandline') or '')
        return records
    records=[]
    for proc in Path('/proc').iterdir():
        if not proc.name.isdigit():continue
        try:
            argv=(proc/'cmdline').read_bytes().decode().rstrip('\0').split('\0')
            stat=(proc/'stat').read_text().rsplit(')',1)[1].split()
            records.append({'pid':int(proc.name),'executable':os.readlink(proc/'exe'),
                            'argv':argv,'birth':stat[19]})
        except (OSError,UnicodeError,IndexError):continue
    return records


def stop_verified(record):
    """Pin a process handle before killing; refuse a reused PID or changed identity."""
    if os.name=='nt':
        script=r'''$ErrorActionPreference='Stop'
$expected=[System.Text.Encoding]::UTF8.GetString([System.Convert]::FromBase64String($env:HUNYUAN_EXPECTED_PROCESS)) | ConvertFrom-Json
$p=Get-Process -Id $expected.pid -ErrorAction SilentlyContinue
if (!$p) { exit 0 }
$null=$p.Handle
$current=Get-CimInstance Win32_Process -Filter ("ProcessId="+[int]$expected.pid)
if (!$current) { exit 0 }
if ($current.ExecutablePath -ine $expected.executable -or $current.CommandLine -cne $expected.commandline -or $current.CreationDate.ToUniversalTime().ToString('o') -cne $expected.birth) { throw 'Process identity changed; refusing to stop a different process' }
$p.Kill()
if (!$p.WaitForExit(10000)) { throw 'Backend has not exited' }'''
        _powershell(script,record)
        return
    if not hasattr(os,'pidfd_open') or not hasattr(signal,'pidfd_send_signal'):
        raise RuntimeError('Không có process handle an toàn; không tự dừng backend.')
    try: handle=os.pidfd_open(record['pid'])
    except ProcessLookupError:return
    try:
        current=next((item for item in processes() if item['pid']==record['pid']),None)
        if current is None:return
        if any(current.get(key)!=record.get(key) for key in ('birth','executable','argv')):
            raise RuntimeError('PID đã đổi; không dừng tiến trình khác.')
        signal.pidfd_send_signal(handle,signal.SIGTERM)
        import select
        poll=select.poll();poll.register(handle,select.POLLIN)
        if not poll.poll(10000):raise RuntimeError('Backend chưa thoát; chưa mở tiến trình mới.')
    finally:os.close(handle)


def _idle(client):
    queue=client.request('/queue')
    if not isinstance(queue,dict) or not all(isinstance(queue.get(key),list) for key in ('queue_running','queue_pending')):
        raise RuntimeError('Không xác minh được hàng đợi; không tự khởi động lại backend.')
    if queue['queue_running'] or queue['queue_pending']:
        raise RuntimeError('ComfyUI còn tác vụ. Bấm Xóa dự án đang tạo (chọn dự án cũ nếu cần), rồi tải/tạo lại để áp dụng tối ưu GPU.')


def ensure_launch_profile(folder, root, client, notify):
    """True = keep/no live server, False = stopped old owned server; caller starts anew."""
    if client.url.rstrip('/')!=MANAGED_URL:
        return True  # An externally configured installation is never restarted here.
    try:
        queue=client.request('/queue')
    except RuntimeError:
        return True  # No reachable server: normal startup handles this case.
    if not isinstance(queue,dict) or not all(isinstance(queue.get(key),list) for key in ('queue_running','queue_pending')):
        raise RuntimeError('Không xác minh được hàng đợi; không tự khởi động lại backend.')
    candidates=[item for item in processes() if owned_process(item,folder)]
    if len(candidates)!=1:
        raise RuntimeError('Cổng 8189 không xác định được đúng backend riêng. Đóng ComfyUI cũ tại cổng này rồi thử lại; tool không dừng tiến trình không rõ nguồn.')
    record=candidates[0]
    try: marker=json.loads((Path(root)/'backend-launch.json').read_text(encoding='utf-8'))
    except (OSError,ValueError):marker={}
    argv=record['argv']
    matches=(marker.get('profile')==PROFILE and marker.get('pid')==record['pid']
             and _same_path(marker.get('executable',''),record['executable'])
             and _same_path(marker.get('main',''),Path(folder)/'ComfyUI/main.py')
             and '--lowvram' not in argv and '--gpu-only' not in argv and '--highvram' not in argv
             and _flag(argv,'--reserve-vram')=='1')
    if matches:return True
    if queue['queue_running'] or queue['queue_pending']:
        raise RuntimeError('ComfyUI còn tác vụ. Bấm Xóa dự án đang tạo rồi tải/tạo lại để áp dụng tối ưu GPU.')
    _idle(client)  # Recheck immediately before closing only the owned process.
    notify('Đang khởi động lại backend riêng với mã hóa chữ trên GPU và offload tự động…')
    stop_verified(record)
    (Path(root)/'backend-launch.json').unlink(missing_ok=True)
    return False
