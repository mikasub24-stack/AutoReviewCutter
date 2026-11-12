"""Local Wan orchestration. No cloud inference and no global Comfy interrupt."""
from __future__ import annotations
import hashlib
import json
import math
import os
from pathlib import Path
import secrets
import shutil
import subprocess
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
import uuid

VERSION = '0.1.0'
ROOT = Path(getattr(sys, '_MEIPASS', Path(__file__).resolve().parent))
FPS = 24
FRAMES = 121
MODELS = {
    'UNETLoader': ('unet_name', 'wan2.2_ti2v_5B_fp16.safetensors'),
    'CLIPLoader': ('clip_name', 'umt5_xxl_fp8_e4m3fn_scaled.safetensors'),
    'VAELoader': ('vae_name', 'wan2.2_vae.safetensors'),
}
GUIDE = 'https://docs.comfy.org/tutorials/video/wan/wan2_2'
TOPICS = ('Dọn nhà bỏ hoang', 'Sinh tồn trong rừng')
NEGATIVE = ('cartoon, anime, CGI, illustration, low quality, blurry, text, watermark, '
            'extra fingers, deformed hands, duplicate people, changing clothes, '
            'changing architecture, teleportation, magical transformations, flicker')
STORIES = {
    TOPICS[0]: {
        'setting': 'A single abandoned small one-story brick cottage, red tiled roof, two front windows, green wooden door, overgrown garden. One adult woman, dark tied-back hair, beige work shirt, blue work trousers, yellow work gloves. Same woman, clothing, cottage layout and daylight throughout.',
        'opening': 'Establishing view of the cottage before cleaning, accumulated leaves and rubbish, the worker surveys the front entrance.',
        'stages': [
            ['The worker picks up loose litter by hand near the doorway.', 'She puts the collected rubbish into a black bag.'],
            ['She sweeps dry leaves from the entrance with a broom.', 'She carries a filled bag outside, leaving the cleared entrance visible.'],
            ['She wipes dust from the same green front door using a cloth.', 'She cleans one front window with a cloth in slow realistic motions.'],
            ['She scrubs a small area of the front steps with a brush.', 'She rinses the scrubbed area with a bucket of water.'],
            ['She gathers remaining tools beside the clean front steps.', 'She inspects the cleaned entrance; the same cottage structure remains unchanged.'],
        ],
        'ending': 'A steady final view of the same cottage after the gradual cleanup, clean doorway and steps, the worker rests beside her tools. No instant renovation or changes to the building.',
    },
    TOPICS[1]: {
        'setting': 'One adult man with short dark hair, olive green outdoor shirt, brown trousers, sturdy boots. A single forest campsite beside one large mossy boulder, tall pine trees, dry forest floor, soft daylight. Same man, clothing, boulder and campsite throughout.',
        'opening': 'Establishing view of the campsite, the hiker sets down his brown backpack beside the mossy boulder and surveys the ground.',
        'stages': [
            ['He picks small fallen branches off the ground near the boulder.', 'He sorts the collected branches into a neat pile.'],
            ['He clears dry leaves from a small spot next to the boulder.', 'He places two sturdy fallen branches to form the base of a simple shelter.'],
            ['He carefully leans more collected branches on the shelter frame.', 'He places leafy branches on the shelter roof, one branch at a time.'],
            ['He arranges a few stones into a small cooking area on bare ground.', 'He places a metal pot beside his supplies and checks the simple camp.'],
            ['He makes a small controlled campfire inside the stone ring.', 'He puts the metal pot near the small fire and sits beside the shelter.'],
        ],
        'ending': 'A quiet final view of the completed simple forest camp at the same mossy boulder, the man resting beside the shelter, gentle smoke rising from the small campfire.',
    },
}


class Cancelled(Exception): pass


def atomic_json(path, data):
    path = Path(path)
    temp = path.with_suffix('.tmp')
    temp.write_text(json.dumps(data, ensure_ascii=False, indent=2), encoding='utf-8')
    temp.replace(path)


def digest(path):
    h = hashlib.sha256()
    with open(path, 'rb') as stream:
        for block in iter(lambda: stream.read(1024 * 1024), b''): h.update(block)
    return h.hexdigest()


def plan(topic, minutes):
    if topic not in STORIES: raise ValueError('Chọn một chủ đề có trong danh sách.')
    minutes = float(minutes)
    if not math.isfinite(minutes) or not 0.1 <= minutes <= 15:
        raise ValueError('Nhập thời lượng từ 0,1 đến 15 phút.')
    total = round(minutes * 60 * FPS)
    # Each continuation shares its first frame with the previous last frame.
    count = max(1, math.ceil((total - 1) / (FRAMES - 1)))
    story = STORIES[topic]
    scenes = []
    for i in range(count):
        if i == 0: action = story['opening']
        elif i == count - 1: action = story['ending']
        else:
            stage = min(4, int((i - 1) * 5 / max(1, count - 2)))
            choices = story['stages'][stage]
            action = choices[(i - 1) % len(choices)]
        prompt = (f'Photorealistic documentary footage, natural lighting, physically plausible movements. '
                  f'{story["setting"]} {action} '
                  'Continuous action from the input image. Preserve the exact person and location visible in the image. '
                  'Slow, steady camera. No cuts, no time lapse, no sudden changes, no speech.')
        scenes.append({'index': i + 1, 'prompt': prompt, 'seed': secrets.randbits(48)})
    return {'version': VERSION, 'topic': topic, 'minutes': minutes, 'frames': total,
            'fps': FPS, 'width': 832, 'height': 480, 'scene_frames': FRAMES,
            'scenes': scenes, 'reference_policy': 'previous_last_frame',
            'notice': 'Wan tạo hình không có âm thanh. Giữ tham chiếu không bảo đảm nhận dạng tuyệt đối.'}


def new_project(parent, topic, minutes):
    data = plan(topic, minutes)
    folder = Path(parent) / ('Wan-' + time.strftime('%Y%m%d-%H%M%S') + '-' + uuid.uuid4().hex[:6])
    folder.mkdir(parents=True)
    data['id'] = uuid.uuid4().hex
    data['server'] = ''
    atomic_json(folder / 'project.json', data)
    return folder


def ffmpeg():
    bundled = ROOT / 'runtime/ffmpeg.exe'
    if bundled.is_file(): return str(bundled)
    found = shutil.which('ffmpeg')
    if found: return found
    raise RuntimeError('Thiếu FFmpeg trong bộ cài.')


def run_command(command, cancelled, log):
    with open(log, 'ab') as output:
        process = subprocess.Popen(command, stdout=output, stderr=output,
                                   creationflags=getattr(subprocess, 'CREATE_NO_WINDOW', 0))
        try:
            while process.poll() is None:
                if cancelled.wait(.15): raise Cancelled('Đã dừng bước ghép video.')
            if process.returncode: raise RuntimeError('FFmpeg chưa hoàn tất. Xem log: ' + str(log))
        finally:
            if process.poll() is None:
                process.terminate()
                try: process.wait(timeout=5)
                except subprocess.TimeoutExpired: process.kill(); process.wait()


class Comfy:
    def __init__(self, url='http://127.0.0.1:8188'):
        parsed = urllib.parse.urlsplit(url.strip())
        if (parsed.scheme != 'http' or parsed.hostname not in ('localhost', '127.0.0.1', '::1')
                or parsed.username or parsed.password or parsed.query or parsed.fragment or parsed.path not in ('', '/')):
            raise ValueError('Chỉ kết nối ComfyUI trên máy này, ví dụ http://127.0.0.1:8188.')
        self.url = url.strip().rstrip('/')
        # Local connections never go through a corporate/cloud proxy.
        self.opener = urllib.request.build_opener(urllib.request.ProxyHandler({}))

    def request(self, route, data=None, headers=None, binary=False):
        headers = dict(headers or {})
        if data is not None and not isinstance(data, bytes):
            data = json.dumps(data).encode(); headers['Content-Type'] = 'application/json'
        req = urllib.request.Request(self.url + route, data=data, headers=headers)
        try:
            with self.opener.open(req, timeout=15) as response:
                body = response.read()
        except urllib.error.HTTPError as e:
            detail = e.read(4000).decode('utf-8', 'replace')
            raise RuntimeError(f'ComfyUI HTTP {e.code}: {detail}') from e
        except (urllib.error.URLError, TimeoutError, OSError) as e:
            raise RuntimeError('Không kết nối được ComfyUI. Mở ComfyUI rồi thử lại. ' + str(e)) from e
        return body if binary else json.loads(body)

    def preflight(self):
        info = self.request('/object_info')
        required = ['UNETLoader', 'CLIPLoader', 'VAELoader', 'ModelSamplingSD3', 'CLIPTextEncode',
                    'Wan22ImageToVideoLatent', 'KSampler', 'VAEDecodeTiled', 'SaveImage', 'LoadImage']
        missing = [name for name in required if name not in info]
        if missing: raise RuntimeError('ComfyUI thiếu node: ' + ', '.join(missing) + '. Cập nhật ComfyUI bản chính thức.')
        selected = {}
        for node, (field, name) in MODELS.items():
            choices = info[node]['input']['required'][field][0]
            match = next((x for x in choices if x.replace('\\', '/').split('/')[-1] == name), None)
            if not match:
                raise RuntimeError('Chưa có model ' + name + '. Tải đúng bộ Wan 2.2 TI2V 5B theo Hướng dẫn model; sau đó khởi động lại ComfyUI.')
            selected[field] = match
        return selected

    def upload(self, path):
        path = Path(path)
        boundary = 'WanLocal' + uuid.uuid4().hex
        body = (f'--{boundary}\r\nContent-Disposition: form-data; name="image"; filename="reference.png"\r\n'
                'Content-Type: image/png\r\n\r\n').encode() + path.read_bytes() + f'\r\n--{boundary}--\r\n'.encode()
        result = self.request('/upload/image', body, {'Content-Type': 'multipart/form-data; boundary=' + boundary})
        return '/'.join(filter(None, (result.get('subfolder', ''), result['name'])))

    def frames(self, record):
        status = record.get('status', {})
        if status.get('status_str') == 'error':
            raise RuntimeError('Wan render lỗi: ' + json.dumps(status.get('messages', []), ensure_ascii=False)[-2500:])
        frames = record.get('outputs', {}).get('save', {}).get('images', [])
        return frames if status.get('completed') else []

    def find_request(self, marker):
        history = self.request('/history?max_items=300')
        queue = self.request('/queue')
        for prompt_id, item in history.items():
            prompt = item.get('prompt', [])
            if len(prompt) > 3 and prompt[3].get('wanlocal_request') == marker: return prompt_id
        for item in queue.get('queue_running', []) + queue.get('queue_pending', []):
            if len(item) > 3 and item[3].get('wanlocal_request') == marker: return item[1]
        return None

    def wait(self, prompt_id, cancelled, notify):
        started = time.monotonic()
        while True:
            if cancelled.is_set():
                # Remove only our queued job. Do not send global /interrupt:
                # that could stop somebody else's active workflow.
                queue = self.request('/queue')
                if any(x[1] == prompt_id for x in queue.get('queue_pending', [])):
                    self.request('/queue', {'delete': [prompt_id]})
                    raise Cancelled('Đã bỏ cảnh đang chờ. Bấm tiếp tục để tạo lại cảnh này.')
                raise Cancelled('Đã tạm dừng tool. Cảnh đang chạy có thể vẫn hoàn tất trong ComfyUI; mở lại dự án để nhận kết quả.')
            record = self.request('/history/' + urllib.parse.quote(prompt_id, safe='')).get(prompt_id)
            if record:
                frames = self.frames(record)
                if frames: return frames
                if record.get('status', {}).get('completed'):
                    raise RuntimeError('ComfyUI báo xong nhưng không trả khung hình ở node save.')
            queue = self.request('/queue')
            all_tasks = queue.get('queue_running', []) + queue.get('queue_pending', [])
            if not record and not any(x[1] == prompt_id for x in all_tasks):
                raise RuntimeError('Tác vụ không còn trong ComfyUI (có thể đã khởi động lại). Bấm Tạo lại cảnh lỗi để tiếp tục.')
            notify(f'Wan đang render · đã chờ {int(time.monotonic() - started)} giây; chưa có ước tính thời gian.')
            if cancelled.wait(2): continue

    def download(self, description, destination):
        query = urllib.parse.urlencode({key: description[key] for key in ('filename', 'subfolder', 'type') if key in description})
        data = self.request('/view?' + query, binary=True)
        if not data.startswith(b'\x89PNG\r\n\x1a\n'): raise RuntimeError('ComfyUI trả khung hình không phải PNG hợp lệ.')
        target = Path(destination); temp = target.with_suffix('.part'); temp.write_bytes(data); temp.replace(target)


def graph(scene, models, reference=None, prefix='WanLocal'):
    def node(kind, **inputs): return {'class_type': kind, 'inputs': inputs}
    workflow = {
        'unet': node('UNETLoader', unet_name=models['unet_name'], weight_dtype='default'),
        'clip': node('CLIPLoader', clip_name=models['clip_name'], type='wan', device='cpu'),
        'vae': node('VAELoader', vae_name=models['vae_name']),
        'sampling': node('ModelSamplingSD3', model=['unet', 0], shift=8.0),
        'positive': node('CLIPTextEncode', clip=['clip', 0], text=scene['prompt']),
        'negative': node('CLIPTextEncode', clip=['clip', 0], text=NEGATIVE),
        'latent': node('Wan22ImageToVideoLatent', vae=['vae', 0], width=832, height=480, length=FRAMES, batch_size=1),
        'sampler': node('KSampler', model=['sampling', 0], positive=['positive', 0], negative=['negative', 0],
                        latent_image=['latent', 0], seed=scene['seed'], steps=20, cfg=5.0,
                        sampler_name='uni_pc', scheduler='simple', denoise=1.0),
        'decode': node('VAEDecodeTiled', samples=['sampler', 0], vae=['vae', 0], tile_size=256,
                       overlap=64, temporal_size=16, temporal_overlap=4),
        'save': node('SaveImage', images=['decode', 0], filename_prefix=prefix),
    }
    if reference:
        workflow['reference'] = node('LoadImage', image=reference)
        workflow['latent']['inputs']['start_image'] = ['reference', 0]
    return workflow


def valid_artifact(project, scene):
    output = Path(project) / f'canh-{scene["index"]:04}.mp4'
    last = Path(project) / f'tham-chieu-{scene["index"]:04}.png'
    reference_ok = True
    if scene['index'] > 1:
        previous = Path(project) / f'tham-chieu-{scene["index"] - 1:04}.png'
        reference_ok = previous.is_file() and digest(previous) == scene.get('input_reference_sha256')
    return (reference_ok and scene.get('output_sha256') and output.is_file() and last.is_file()
            and digest(output) == scene['output_sha256'] and digest(last) == scene.get('reference_sha256'))


def _generate(project, client, cancelled, notify):
    project = Path(project)
    data = json.loads((project / 'project.json').read_text(encoding='utf-8'))
    if data.get('version') != VERSION: raise ValueError('Phiên bản dự án chưa được hỗ trợ.')
    if data.get('server') and data['server'] != client.url:
        raise ValueError('Dự án đang gắn với ComfyUI ở ' + data['server'] + '. Dùng cùng địa chỉ để nhận tác vụ cũ.')
    ffmpeg_path = ffmpeg()
    models = client.preflight()
    data['server'] = client.url
    save = lambda: atomic_json(project / 'project.json', data)
    save()
    for position, scene in enumerate(data['scenes']):
        if cancelled.is_set(): raise Cancelled('Đã tạm dừng; có thể mở lại dự án để tiếp tục.')
        if valid_artifact(project, scene): continue
        if scene.get('output_sha256'):
            # A previously finished file/reference changed: all dependent output
            # must be regenerated against the current reference, not reused.
            for key in ('prompt_id', 'request_marker', 'output_sha256', 'reference_sha256'):
                scene.pop(key, None)
            save()
        notify(f'Cảnh {position + 1}/{len(data["scenes"])} · Chuẩn bị Wan')
        if not scene.get('prompt_id'):
            if scene.get('request_marker'):
                recovered = client.find_request(scene['request_marker'])
                if recovered: scene['prompt_id'] = recovered; save()
                else: raise RuntimeError('Lần gửi trước chưa xác định đã được nhận. Kiểm tra hàng đợi ComfyUI, rồi bấm Tạo lại cảnh lỗi nếu không có tác vụ này.')
            else:
                reference = None
                if position:
                    reference_path = project / f'tham-chieu-{position:04}.png'
                    reference = client.upload(reference_path)
                    scene['input_reference_sha256'] = digest(reference_path)
                workflow = graph(scene, models, reference, f'WanLocal/{data["id"]}/scene-{position + 1}')
                atomic_json(project / f'workflow-{position + 1:04}.json', workflow)
                scene['request_marker'] = uuid.uuid4().hex
                save()  # Durable intent before a non-idempotent POST.
                result = client.request('/prompt', {'prompt': workflow, 'client_id': data['id'],
                                         'extra_data': {'wanlocal_request': scene['request_marker']}})
                if result.get('error') or result.get('node_errors'):
                    scene.pop('request_marker', None); save()
                    raise RuntimeError('ComfyUI không nhận workflow: ' + json.dumps(result, ensure_ascii=False)[-3000:])
                scene['prompt_id'] = result['prompt_id']; save()
        try:
            frames = client.wait(scene['prompt_id'], cancelled, lambda text: notify(f'Cảnh {position + 1}/{len(data["scenes"])} · {text}'))
        except Cancelled:
            queue = client.request('/queue')
            record = client.request('/history/' + scene['prompt_id'])
            if not record and not any(x[1] == scene['prompt_id'] for x in queue.get('queue_running', []) + queue.get('queue_pending', [])):
                scene.pop('prompt_id', None); scene.pop('request_marker', None); save()
            raise
        if len(frames) != FRAMES:
            raise RuntimeError(f'Wan trả {len(frames)} khung hình, cần {FRAMES}; không ghép video thiếu cảnh.')
        folder = project / f'frames-{position + 1:04}'; folder.mkdir(exist_ok=True)
        for index, frame in enumerate(frames):
            if cancelled.is_set(): raise Cancelled('Đã dừng tải khung hình. Tác vụ vẫn được lưu để tiếp tục.')
            client.download(frame, folder / f'{index:04}.png')
        last = project / f'tham-chieu-{position + 1:04}.png'
        shutil.copy2(folder / f'{FRAMES - 1:04}.png', last)
        if position == 0: shutil.copy2(folder / '0000.png', project / 'tham-chieu-goc.png')
        output = project / f'canh-{position + 1:04}.mp4'
        temporary = output.with_name(output.stem + '.partial.mp4')
        # Subsequent first frames are duplicates of the previous reference.
        start = 1 if position else 0
        command = [ffmpeg_path, '-y', '-framerate', str(FPS), '-start_number', str(start), '-i', str(folder / '%04d.png'),
                   '-frames:v', str(FRAMES - start), '-c:v', 'libx264', '-preset', 'fast', '-crf', '19',
                   '-pix_fmt', 'yuv420p', '-an', str(temporary)]
        run_command(command, cancelled, project / 'ffmpeg.log')
        temporary.replace(output)
        scene['output_sha256'] = digest(output); scene['reference_sha256'] = digest(last); save()
        shutil.rmtree(folder)
        notify(f'Đã lưu cảnh {position + 1}/{len(data["scenes"])} và tham chiếu tự động.')
    listing = project / 'clips.txt'
    listing.write_text(''.join(f"file 'canh-{scene['index']:04}.mp4'\n" for scene in data['scenes']), encoding='utf-8')
    final = project / 'video-hoan-tat.mp4'; temp = project / 'video-hoan-tat.partial.mp4'
    command = [ffmpeg_path, '-y', '-f', 'concat', '-safe', '1', '-i', str(listing)]
    music = project / 'nhac-nen.audio'
    if music.is_file(): command += ['-stream_loop', '-1', '-i', str(music), '-map', '0:v:0', '-map', '1:a:0', '-af', 'volume=0.25', '-c:a', 'aac']
    else: command += ['-an']
    command += ['-frames:v', str(data['frames']), '-c:v', 'libx264', '-preset', 'fast', '-crf', '19', '-pix_fmt', 'yuv420p']
    if music.is_file(): command += ['-t', str(data['frames'] / FPS), '-shortest']
    command += ['-movflags', '+faststart', str(temp)]
    notify('Đang ghép video cuối theo thời lượng đã chọn…')
    run_command(command, cancelled, project / 'ffmpeg.log'); temp.replace(final)
    data['final_sha256'] = digest(final); save()
    return final


def generate(project, client, cancelled, notify):
    """Hold an OS lock across the whole job; released even after a crash."""
    lock_path = Path(project) / '.render.lock'
    with open(lock_path, 'a+b') as lock:
        lock.seek(0); lock.write(b'0'); lock.flush(); lock.seek(0)
        try:
            if os.name == 'nt':
                import msvcrt
                msvcrt.locking(lock.fileno(), msvcrt.LK_NBLCK, 1)
            else:
                import fcntl
                fcntl.flock(lock.fileno(), fcntl.LOCK_EX | fcntl.LOCK_NB)
        except OSError as e:
            raise RuntimeError('Dự án đang được một cửa sổ khác xử lý. Không gửi trùng tác vụ.') from e
        try: return _generate(project, client, cancelled, notify)
        finally:
            lock.seek(0)
            if os.name == 'nt': msvcrt.locking(lock.fileno(), msvcrt.LK_UNLCK, 1)
            else: fcntl.flock(lock.fileno(), fcntl.LOCK_UN)


def reset_failed_scene(project):
    """Explicit user action only: never silently resubmit uncertain jobs."""
    project = Path(project)
    data = json.loads((project / 'project.json').read_text(encoding='utf-8'))
    for scene in data['scenes']:
        if not valid_artifact(project, scene):
            scene.pop('request_marker', None); scene.pop('prompt_id', None)
            atomic_json(project / 'project.json', data)
            return
