"""Managed, resumable ComfyUI portable installation. Never modifies system Python."""
from __future__ import annotations
import hashlib
import json
import os
from pathlib import Path
import re
import shutil
import subprocess
import time
import urllib.error
import urllib.request
import engine
import hunyuan

COMFY_VERSION = 'v0.45.0'
COMFY_URL = 'https://github.com/Comfy-Org/ComfyUI/releases/download/v0.45.0/ComfyUI_windows_portable_nvidia_cu126.7z'
COMFY_SHA = 'e7d1be2bd81deec3f46a89e29b8c6826f45c05609f29d6681d7876f687d69d29'
MANAGED_URL = 'http://127.0.0.1:8189'
_children = []


def backend_environment():
    env = os.environ.copy()
    env.pop('PYTHONHOME', None); env.pop('PYTHONPATH', None)
    # Apply before either torch/NumPy import. Only the child gets these values.
    env.update({'OPENBLAS_NUM_THREADS': '1', 'OPENBLAS_DEFAULT_NUM_THREADS': '1',
                'GOTO_NUM_THREADS': '1', 'OMP_NUM_THREADS': '2', 'MKL_NUM_THREADS': '2',
                'NUMEXPR_NUM_THREADS': '2', 'BLIS_NUM_THREADS': '1', 'VECLIB_MAXIMUM_THREADS': '2',
                'PYTHONUTF8': '1', 'NO_COLOR': '1'})
    return env


def memory_status():
    if os.name != 'nt': return None
    import ctypes
    class Status(ctypes.Structure):
        _fields_ = [('length',ctypes.c_ulong),('load',ctypes.c_ulong),
                    ('total_ram',ctypes.c_ulonglong),('free_ram',ctypes.c_ulonglong),
                    ('total_commit',ctypes.c_ulonglong),('free_commit',ctypes.c_ulonglong),
                    ('total_virtual',ctypes.c_ulonglong),('free_virtual',ctypes.c_ulonglong),
                    ('extended',ctypes.c_ulonglong)]
    value = Status(); value.length = ctypes.sizeof(value)
    if not ctypes.windll.kernel32.GlobalMemoryStatusEx(ctypes.byref(value)): return None
    return {'free_ram': value.free_ram, 'free_commit': value.free_commit}


def startup_error(log_path, offset):
    with Path(log_path).open('rb') as file:
        file.seek(0,2); end = file.tell()
        file.seek(max(offset,end-8192)); text = file.read().decode('utf-8','replace')
    text = re.sub(r'\x1b\[[0-?]*[ -/]*[@-~]', '', text)
    if 'OpenBLAS' in text and ('Memory allocation' in text or 'memory' in text.lower()):
        return ('ComfyUI thiếu bộ nhớ khi khởi tạo OpenBLAS. Đã giới hạn luồng và tắt ghim RAM; '
                'nếu vẫn lỗi, đóng bớt ứng dụng và kiểm tra bộ nhớ ảo Windows. Log: ' + str(log_path))
    lines = [line.strip() for line in text.splitlines() if line.strip()]
    tail = '\n'.join(lines[-4:])[-450:]
    return 'ComfyUI chưa mở được. ' + tail + '\nLog: ' + str(log_path)


def default_root():
    return Path(os.environ.get('LOCALAPPDATA', Path.home())) / 'WanLocalStudioData'


def check_cancel(cancelled):
    if cancelled.is_set(): raise engine.Cancelled('Đã tạm dừng cài/tải. Lần sau tool sẽ tải tiếp dữ liệu còn thiếu.')


def sha256(path, cancelled):
    h = hashlib.sha256()
    with Path(path).open('rb') as stream:
        for block in iter(lambda: stream.read(8 * 1024 * 1024), b''):
            check_cancel(cancelled); h.update(block)
    return h.hexdigest()


def parse_pointer(text):
    text = text.replace('\r\n', '\n')
    if not text.startswith('version https://git-lfs.github.com/spec/v1'):
        raise RuntimeError('Nguồn model chưa trả Git LFS metadata để xác minh file. Chưa tải model.')
    digest = re.search(r'^oid sha256:([a-f0-9]{64})$', text, re.M)
    size = re.search(r'^size ([0-9]+)$', text, re.M)
    if not digest or not size or int(size[1]) < 1024 * 1024:
        raise RuntimeError('Metadata model không hợp lệ.')
    return digest[1], int(size[1])


def model_metadata(repo, directory, name, remote_path=None):
    path = remote_path or f'split_files/{directory}/{name}'
    request = urllib.request.Request(f'https://huggingface.co/{repo}/raw/main/{path}', headers={'User-Agent': 'WanLocalStudio/0.2'})
    with urllib.request.urlopen(request, timeout=25) as response:
        text = response.read(4096).decode('utf-8')
        revision = response.headers.get('x-repo-commit', 'main')
    digest, size = parse_pointer(text)
    if not re.fullmatch(r'[a-f0-9]{40}', revision): revision = 'main'
    return {'url': f'https://huggingface.co/{repo}/resolve/{revision}/{path}', 'sha256': digest, 'size': size}


def receipt_valid(destination, metadata):
    receipt = destination.with_suffix(destination.suffix + '.verified.json')
    try:
        info = json.loads(receipt.read_text(encoding='utf-8')); stat = destination.stat()
        return (info['sha256'] == metadata['sha256'] and info['size'] == stat.st_size
                and info['mtime_ns'] == stat.st_mtime_ns
                and (not metadata.get('size') or stat.st_size == metadata['size']))
    except (OSError, ValueError, KeyError): return False


def download(url, destination, expected_sha, expected_size, cancelled, notify, opener=urllib.request.urlopen):
    """Resume only the same pinned object; hash before any promotion/execution."""
    destination = Path(destination); destination.parent.mkdir(parents=True, exist_ok=True)
    meta = {'url': url, 'sha256': expected_sha, 'size': expected_size}
    if receipt_valid(destination, meta): return destination
    if destination.is_file():
        notify('Kiểm tra SHA-256: ' + destination.name)
        if (not expected_size or destination.stat().st_size == expected_size) and sha256(destination, cancelled) == expected_sha:
            write_receipt(destination, meta); return destination
    part = destination.with_suffix(destination.suffix + '.part')
    journal = part.with_suffix('.download.json')
    try: previous = json.loads(journal.read_text(encoding='utf-8'))
    except (OSError, ValueError): previous = None
    if previous != meta:
        part.unlink(missing_ok=True); engine.atomic_json(journal, meta)
    if not expected_size and part.is_file() and sha256(part, cancelled) == expected_sha:
        part.replace(destination); write_receipt(destination, meta); journal.unlink(missing_ok=True)
        return destination
    for attempt in range(4):
        check_cancel(cancelled)
        offset = part.stat().st_size if part.is_file() else 0
        if expected_size and offset > expected_size: part.unlink(); offset = 0
        if expected_size and offset == expected_size: break
        headers = {'User-Agent': 'WanLocalStudio/0.2', 'Accept-Encoding': 'identity'}
        if offset: headers['Range'] = f'bytes={offset}-'
        request = urllib.request.Request(url, headers=headers)
        try:
            with opener(request, timeout=25) as response:
                status = response.status
                if status == 206:
                    content_range = re.fullmatch(r'bytes (\d+)-(\d+)/(\d+)', response.headers.get('Content-Range', ''))
                    if not content_range or int(content_range[1]) != offset:
                        raise RuntimeError('Máy chủ trả sai phần tải tiếp; dữ liệu chưa được ghép.')
                    total = int(content_range[3])
                elif status == 200:
                    # Server ignored Range: restart instead of appending the whole file.
                    offset = 0; total = int(response.headers.get('Content-Length', 0))
                else: raise RuntimeError(f'Máy chủ tải trả HTTP {status}.')
                if expected_size and total and total != expected_size:
                    raise RuntimeError('Dung lượng file tải không khớp metadata chính thức.')
                if expected_size: total = expected_size
                remaining = max(0, total - offset)
                if total and shutil.disk_usage(destination.parent).free < remaining + 1024**3:
                    raise RuntimeError('Không đủ ổ trống để tải file: ' + destination.name)
                last_notice = 0
                with part.open('ab' if offset else 'wb') as stream:
                    while True:
                        check_cancel(cancelled)
                        block = response.read(1024 * 1024)
                        if not block: break
                        stream.write(block); offset += len(block)
                        if time.monotonic() - last_notice > .4:
                            percent = f' / {total / 1024**3:.2f} GB ({offset / total:.0%})' if total else ''
                            notify(f'Đang tải {destination.name}: {offset / 1024**3:.2f} GB{percent}')
                            last_notice = time.monotonic()
                if total and offset != total: raise OSError('Kết nối kết thúc khi file chưa tải đủ.')
            break
        except urllib.error.HTTPError as e:
            if e.code not in (408, 429, 500, 502, 503, 504) or attempt == 3:
                raise RuntimeError(f'Tải {destination.name} bị từ chối HTTP {e.code}; dữ liệu tải dở được giữ lại.') from e
        except (urllib.error.URLError, TimeoutError, OSError):
            if attempt == 3: raise RuntimeError('Kết nối tải bị ngắt. Bấm lại để tải tiếp: ' + destination.name)
        if cancelled.wait(min(2**attempt, 8)): check_cancel(cancelled)
    notify('Kiểm tra SHA-256: ' + destination.name)
    if sha256(part, cancelled) != expected_sha:
        part.unlink(missing_ok=True)
        raise RuntimeError('Checksum không khớp. Đã bỏ file tải lỗi, chưa sử dụng: ' + destination.name)
    part.replace(destination); write_receipt(destination, meta); journal.unlink(missing_ok=True)
    return destination


def write_receipt(path, meta):
    stat = path.stat()
    engine.atomic_json(path.with_suffix(path.suffix + '.verified.json'),
                       {'sha256': meta['sha256'], 'size': stat.st_size, 'mtime_ns': stat.st_mtime_ns})


def layout(root):
    return Path(root) / ('ComfyUI-' + COMFY_VERSION) / 'ComfyUI_windows_portable'


def layout_valid(folder):
    return (folder / 'python_embeded/python.exe').is_file() and (folder / 'ComfyUI/main.py').is_file()


def install(root, cancelled, notify, backend=hunyuan.BACKEND,need_t2v=False):
    if os.name != 'nt': raise RuntimeError('Cài tự động này dành cho Windows x64 có NVIDIA.')
    root = Path(root); root.mkdir(parents=True, exist_ok=True)
    # Lock the shared install as well as individual video projects.
    import msvcrt
    with (root / '.install.lock').open('a+b') as lock:
        lock.write(b'0'); lock.flush(); lock.seek(0)
        try: msvcrt.locking(lock.fileno(), msvcrt.LK_NBLCK, 1)
        except OSError as e: raise RuntimeError('Một cửa sổ khác đang cài/tải bộ Wan. Chờ cửa sổ đó hoàn tất.') from e
        try: return _install(root, cancelled, notify,backend,need_t2v)
        finally: lock.seek(0); msvcrt.locking(lock.fileno(), msvcrt.LK_UNLCK, 1)


def _install(root, cancelled, notify,backend=hunyuan.BACKEND,need_t2v=False):
    folder = layout(root)
    if not layout_valid(folder):
        if shutil.disk_usage(root).free < 40 * 1024**3:
            raise RuntimeError('Lần cài đầu cần khoảng 40 GB ổ trống. Chọn ổ lưu dữ liệu khác trong Cài đặt.')
        archive = download(COMFY_URL, root / 'downloads/ComfyUI-nvidia-cu126.7z', COMFY_SHA, 0, cancelled, notify)
        extractor = engine.ROOT / 'runtime/7z.exe'
        if not extractor.is_file(): raise RuntimeError('Bộ cài thiếu trình giải nén 7-Zip.')
        stage = root / ('staging-' + COMFY_VERSION)
        stage.mkdir(exist_ok=True)
        notify('Đang giải nén ComfyUI và Python/CUDA riêng cho tool…')
        engine.run_command([str(extractor), 'x', '-y', '-aoa', '-o' + str(stage), str(archive)], cancelled, root / 'setup.log')
        if not layout_valid(stage / 'ComfyUI_windows_portable'):
            raise RuntimeError('Gói portable chưa có đủ Python/ComfyUI sau giải nén. Xem setup.log.')
        destination = root / ('ComfyUI-' + COMFY_VERSION)
        if destination.exists():
            destination.rename(root / ('incomplete-' + str(int(time.time()))))
        stage.rename(destination)
    cache = root / 'models-manifest.json'
    try: entries = json.loads(cache.read_text(encoding='utf-8'))
    except (OSError, ValueError): entries = {}
    sources=hunyuan.sources(need_t2v)
    for source in sources:
        repo,directory,name=source[:3]
        check_cancel(cancelled)
        if name not in entries:
            notify('Lấy thông tin model chính thức: ' + name)
            entries[name] = model_metadata(repo,directory,name,*source[3:])
            engine.atomic_json(cache, entries)
    remaining=0
    for source in sources:
        _,directory,name=source[:3];item=entries[name]
        target=folder/'ComfyUI/models'/directory/name
        if not receipt_valid(target,item):
            part=target.with_suffix(target.suffix+'.part')
            remaining+=max(0,item['size']-(part.stat().st_size if part.is_file() else 0))
    notify(f'Dữ liệu model còn tải khoảng {remaining/1024**3:.1f} GB.')
    if shutil.disk_usage(root).free < remaining+4*1024**3:
        raise RuntimeError(f'Cần thêm khoảng {remaining/1024**3+4:.1f} GB trống để tải bộ model. Chọn ổ nhiều chỗ hơn trong Cài đặt.')
    for source in sources:
        _,directory,name=source[:3]
        item = entries[name]
        download(item['url'], folder / 'ComfyUI/models' / directory / name,
                 item['sha256'], item['size'], cancelled, notify)
    return folder


def start_backend(folder, root, cancelled, notify,backend=hunyuan.BACKEND,need_t2v=False):
    client = engine.Comfy(MANAGED_URL,backend,need_t2v)
    try: client.preflight(); return client
    except Exception: pass
    folder = Path(folder); root = Path(root)
    notify('Đang kiểm tra GPU NVIDIA/CUDA…')
    env = backend_environment()
    memory = memory_status()
    if memory: notify(f'RAM trống: {memory["free_ram"]/1024**3:.1f} GB · Bộ nhớ cấp phát trống: {memory["free_commit"]/1024**3:.1f} GB')
    python = folder / 'python_embeded/python.exe'
    test = subprocess.run([str(python), '-I', '-c', 'import torch; print(torch.cuda.get_device_name(0) if torch.cuda.is_available() else "NO_CUDA"); raise SystemExit(0 if torch.cuda.is_available() else 2)'],
                          capture_output=True, text=True, timeout=90, env=env,
                          creationflags=getattr(subprocess, 'CREATE_NO_WINDOW', 0))
    check_cancel(cancelled)
    if test.returncode:
        raise RuntimeError('Chưa dùng được GPU CUDA. Kiểm tra driver NVIDIA. ' + (test.stdout + test.stderr)[-1500:])
    notify('GPU: ' + test.stdout.strip() + ' · Đang mở ComfyUI riêng của tool…')
    log = (root / 'comfyui.log').open('ab')
    log_offset = log.tell()
    try:
        child = subprocess.Popen([str(python), '-s', str(folder / 'ComfyUI/main.py'), '--windows-standalone-build',
                                  '--listen', '127.0.0.1', '--port', '8189', '--lowvram', '--preview-method', 'none',
                                  '--disable-pinned-memory', '--disable-async-offload'],
                                 cwd=folder, env=env, stdout=log, stderr=log,
                                 creationflags=getattr(subprocess, 'CREATE_NO_WINDOW', 0))
    finally: log.close()
    _children.append(child)
    deadline = time.monotonic() + 240
    while time.monotonic() < deadline:
        check_cancel(cancelled)
        if child.poll() is not None:
            raise RuntimeError(startup_error(root / 'comfyui.log', log_offset))
        try: client.preflight(); return client
        except RuntimeError: pass
        if cancelled.wait(2): check_cancel(cancelled)
    raise RuntimeError('ComfyUI chưa sẵn sàng sau 4 phút. Log: ' + str(root / 'comfyui.log'))


def ensure_ready(root, preferred, cancelled, notify,backend=hunyuan.BACKEND,need_t2v=False):
    remove_wan_models(root,notify)
    client = engine.Comfy(preferred,backend,need_t2v)
    try: client.preflight(); return client
    except Exception: pass
    try:
        managed = engine.Comfy(MANAGED_URL,backend,need_t2v); managed.preflight(); return managed
    except Exception: pass
    folder = install(root, cancelled, notify,backend,need_t2v)
    return start_backend(folder, root, cancelled, notify,backend,need_t2v)


def remove_wan_models(root, notify):
    folder=layout(root)/'ComfyUI/models'
    old=[folder/'diffusion_models/wan2.2_ti2v_5B_fp16.safetensors',
         folder/'text_encoders/umt5_xxl_fp8_e4m3fn_scaled.safetensors',
         folder/'vae/wan2.2_vae.safetensors']
    profile=Path(os.environ.get('LOCALAPPDATA',Path.home()))/'WanLocalStudio/character'
    for name in ('reference.png','reference.tmp','profile.json'):
        path=profile/name
        if path.is_file() and not path.is_symlink():path.unlink()
    if not any(path.with_name(path.name+suffix).exists() for path in old for suffix in ('','.part')):return
    client=engine.Comfy(MANAGED_URL)
    try: queue=client.request('/queue')
    except RuntimeError:queue={}
    if queue.get('queue_running') or queue.get('queue_pending'):
        raise RuntimeError('Wan cũ còn tác vụ. Dùng Xóa dự án đang tạo, chọn dự án cũ rồi tải Hunyuan lại.')
    for path in old:
        if path.is_symlink():continue
        for suffix in ('','.part','.verified.json','.part.download.json'):
            path.with_name(path.name+suffix).unlink(missing_ok=True)
    notify('Đã bỏ các file model Wan cũ của tool. Chỉ dùng Hunyuan.')
