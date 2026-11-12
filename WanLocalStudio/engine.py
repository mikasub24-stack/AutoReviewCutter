"""Local Hunyuan orchestration. No cloud inference and no global Comfy interrupt."""
from __future__ import annotations
from contextlib import contextmanager
import hashlib
import json
import math
import os
from pathlib import Path
import secrets
import shutil
import struct
import subprocess
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
import uuid
import hunyuan
import portrait
import backend_control
from progress import ProgressMonitor

VERSION = '0.3.3'
ROOT = (Path(sys.executable).resolve().parent if '__compiled__' in globals()
        else Path(getattr(sys, '_MEIPASS', Path(__file__).resolve().parent)))
FPS = 24
FRAMES = 121
WIDTH, HEIGHT = 1280, 720
OUTPUT_WIDTH, OUTPUT_HEIGHT = 1280, 720
TOPICS = ('Dọn nhà bỏ hoang', 'Sinh tồn trong rừng')
CHARACTER = ('One attractive adult East Asian woman, exactly 24 years old, fair skin, oval face, brown eyes, '
             'long straight black hair in a high ponytail. She wears the same fitted black thin-strap athletic crop top, '
             'high-waisted black gym leggings and white trainers in every shot. Natural realistic face and skin texture. '
             'Preserve her identity, facial features, hair and outfit from the reference image.')
NEGATIVE = ('cartoon, anime, CGI, illustration, low quality, blurry, text, watermark, '
            'extra fingers, deformed hands, duplicate people, changing clothes, '
            'changing architecture, teleportation, magical transformations, flicker')
STORIES = {
    TOPICS[0]: {
        'setting': CHARACTER + ' A single abandoned small one-story brick cottage, red tiled roof, two front windows, green wooden door, overgrown garden beside a pine forest. Same woman, cottage layout and daylight throughout.',
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
        'setting': CHARACTER + ' A single forest campsite beside one large mossy boulder near a small cottage with a green door, tall pine trees, dry forest floor, soft daylight. Same woman, clothing, boulder and campsite throughout.',
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
for _story in STORIES.values():
    # Both genres share the same reusable opening and character; no new actor.
    _story['opening'] = ('The same woman stands by a green wooden gate at the edge of a pine forest, '
                         'with a small brick cottage behind her. Her face is clearly visible. '
                         'She looks around, then prepares to begin work. Natural full-body documentary shot.')
    _story['ending'] = _story['ending'].replace('the man', 'the woman')
    _story['stages'] = [[action.replace('He ', 'She ')
                        .replace('his ', 'her ').replace(' he ', ' she ') for action in stage]
                       for stage in _story['stages']]


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


def plan(topic, minutes, backend=hunyuan.BACKEND):
    if backend != hunyuan.BACKEND: raise ValueError('Model chưa được hỗ trợ.')
    if topic not in STORIES: raise ValueError('Chọn một chủ đề có trong danh sách.')
    minutes = float(minutes)
    if not math.isfinite(minutes) or not 0.1 <= minutes <= 60:
        raise ValueError('Nhập thời lượng từ 0,1 đến 60 phút.')
    total = round(minutes * 60 * FPS)
    # Each continuation shares its first frame with the previous last frame.
    transition = 6
    count = 1 + math.ceil(max(0, total - FRAMES) / (FRAMES - 1 - transition))
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
    return {'version': VERSION, 'backend':backend,'topic': topic, 'minutes': minutes, 'frames': total,
            'fps': FPS, 'width': WIDTH, 'height':HEIGHT, 'scene_frames': FRAMES,
            'output_width': OUTPUT_WIDTH, 'output_height': OUTPUT_HEIGHT, 'output_policy': 'native_center_crop',
            'scenes': scenes, 'reference_policy': 'persistent_character_and_previous_last_frame',
            'character': CHARACTER, 'transition_frames': transition, 'steps':50,
            'notice': 'Hunyuan tạo hình không có âm thanh. Giữ tham chiếu không bảo đảm nhận dạng tuyệt đối.'}


def new_project(parent, topic, minutes, profile_dir=None, backend=hunyuan.BACKEND, portrait_first=False):
    data = plan(topic, minutes,backend)
    data['portrait_first']=portrait_first
    folder = Path(parent) / ('Hunyuan-' + time.strftime('%Y%m%d-%H%M%S') + '-' + uuid.uuid4().hex[:6])
    folder.mkdir(parents=True)
    data['id'] = uuid.uuid4().hex
    data['server'] = ''
    if profile_dir:
        data['profile_dir'] = str(Path(profile_dir))
        reference = Path(profile_dir) / 'reference.png'
        if reference.is_file(): shutil.copy2(reference, folder / 'nhan-vat-goc.png')
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
                if cancelled.wait(.15): raise Cancelled('Đã tạm dừng bước đang chạy; dữ liệu đã tải vẫn được giữ.')
            if process.returncode: raise RuntimeError('Bước xử lý chưa hoàn tất. Xem log: ' + str(log))
        finally:
            if process.poll() is None:
                process.terminate()
                try: process.wait(timeout=5)
                except subprocess.TimeoutExpired: process.kill(); process.wait()


class Comfy:
    def __init__(self, url='http://127.0.0.1:8188',backend=hunyuan.BACKEND,need_t2v=False):
        parsed = urllib.parse.urlsplit(url.strip())
        if (parsed.scheme != 'http' or parsed.hostname not in ('localhost', '127.0.0.1', '::1')
                or parsed.username or parsed.password or parsed.query or parsed.fragment or parsed.path not in ('', '/')):
            raise ValueError('Chỉ kết nối ComfyUI trên máy này, ví dụ http://127.0.0.1:8188.')
        self.url = url.strip().rstrip('/')
        self.backend=backend;self.need_t2v=need_t2v
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
        return hunyuan.select_models(info,self.need_t2v)

    def upload(self, path):
        path = Path(path)
        boundary = 'HunyuanLocal' + uuid.uuid4().hex
        body = (f'--{boundary}\r\nContent-Disposition: form-data; name="image"; filename="reference.png"\r\n'
                'Content-Type: image/png\r\n\r\n').encode() + path.read_bytes() + f'\r\n--{boundary}--\r\n'.encode()
        result = self.request('/upload/image', body, {'Content-Type': 'multipart/form-data; boundary=' + boundary})
        return '/'.join(filter(None, (result.get('subfolder', ''), result['name'])))

    def frames(self, record):
        status = record.get('status', {})
        if status.get('status_str') == 'error':
            raise RuntimeError('Hunyuan render lỗi: ' + json.dumps(status.get('messages', []), ensure_ascii=False)[-2500:])
        frames = record.get('outputs', {}).get('save', {}).get('images', [])
        return frames if status.get('completed') else []

    def find_request(self, marker):
        history = self.request('/history?max_items=300')
        queue = self.request('/queue')
        for prompt_id, item in history.items():
            prompt = item.get('prompt', [])
            if len(prompt) > 3 and (prompt[3].get('hunyuanlocal_request') or prompt[3].get('wanlocal_request')) == marker: return prompt_id
        for item in queue.get('queue_running', []) + queue.get('queue_pending', []):
            if len(item) > 3 and (item[3].get('hunyuanlocal_request') or item[3].get('wanlocal_request')) == marker: return item[1]
        return None

    def wait(self, prompt_id, cancelled, notify):
        started = time.monotonic()
        monitor=getattr(self,'progress_monitor',None)
        if monitor:monitor.bind(prompt_id)
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
            state=monitor.snapshot() if monitor else {}
            description=monitor.describe() if monitor else None
            elapsed=int(time.monotonic()-started)
            message=(description+f' · đã chờ {elapsed} giây') if description else f'Đang chờ tiến độ từ ComfyUI · {elapsed} giây (chưa có số bước thực)'
            fraction=state.get('value',0)/state['maximum'] if state.get('maximum') else None
            notify({'type':'progress','status':message,'fraction':fraction})
            if cancelled.wait(2): continue

    def download(self, description, destination):
        query = urllib.parse.urlencode({key: description[key] for key in ('filename', 'subfolder', 'type') if key in description})
        data = self.request('/view?' + query, binary=True)
        if not data.startswith(b'\x89PNG\r\n\x1a\n'): raise RuntimeError('ComfyUI trả khung hình không phải PNG hợp lệ.')
        target = Path(destination); temp = target.with_suffix('.part'); temp.write_bytes(data); temp.replace(target)


graph = hunyuan.graph


def valid_artifact(project, scene):
    output = Path(project) / f'canh-{scene["index"]:04}.mp4'
    last = Path(project) / f'tham-chieu-{scene["index"]:04}.png'
    reference_ok = True
    if scene['index'] > 1:
        previous = Path(project) / f'tham-chieu-{scene["index"] - 1:04}.png'
        reference_ok = previous.is_file() and digest(previous) == scene.get('input_reference_sha256')
    return (reference_ok and scene.get('output_sha256') and output.is_file() and last.is_file()
            and digest(output) == scene['output_sha256'] and digest(last) == scene.get('reference_sha256'))


def geometry(data):
    width, height = int(data.get('width', 832)), int(data.get('height', 480))
    out_width, out_height = int(data.get('output_width', width)), int(data.get('output_height', height))
    alignment=16
    if (width % alignment or height % alignment or min(width, height, out_width, out_height) <= 0
            or out_width > width or out_height > height or out_width % 2 or out_height % 2):
        raise ValueError('Kích thước dự án không hợp lệ; bản này chỉ cắt ảnh gốc, không upscale.')
    return width, height, out_width, out_height


def png_dimensions(path):
    with Path(path).open('rb') as file: header = file.read(24)
    if len(header) != 24 or header[:8] != b'\x89PNG\r\n\x1a\n' or header[12:16] != b'IHDR':
        raise RuntimeError('Khung PNG không có thông tin kích thước hợp lệ.')
    return struct.unpack('>II', header[16:24])


_encoders = {}


def encoder_options(executable):
    if executable not in _encoders:
        try:
            probe = subprocess.run([executable, '-v', 'error', '-f', 'lavfi', '-i', 'color=s=64x64:r=24',
                                    '-frames:v', '1', '-c:v', 'h264_nvenc', '-f', 'null', '-'],
                                   capture_output=True, timeout=12,
                                   creationflags=getattr(subprocess, 'CREATE_NO_WINDOW', 0))
            available = probe.returncode == 0
        except (OSError, subprocess.TimeoutExpired): available = False
        _encoders[executable] = (['-c:v', 'h264_nvenc', '-preset', 'p4', '-cq', '20', '-b:v', '0'] if available
                                else ['-c:v', 'libx264', '-preset', 'fast', '-crf', '18'])
    return list(_encoders[executable])


def edit_sequence(project, data, executable, codec, cancelled, notify):
    """Small bounded-memory transitions; never open every clip at once."""
    overlap = int(data.get('transition_frames', 0))
    files = [project / f'canh-{scene["index"]:04}.mp4' for scene in data['scenes']]
    listing = project / 'clips.txt'
    if not overlap or len(files) == 1:
        listing.write_text(''.join(f"file '{p.name}'\n" for p in files), encoding='utf-8')
        return listing
    parts = project / 'edit'; parts.mkdir(exist_ok=True)
    entries = []
    for i, source in enumerate(files):
        length = FRAMES if i == 0 else FRAMES - 1
        start = overlap if i else 0
        end = length - overlap if i < len(files)-1 else length
        body = parts / f'body-{i:04}.mp4'
        notify(f'Tự dựng cảnh {i+1}/{len(files)} · Cắt nhịp và nối chuyển cảnh')
        run_command([executable, '-y', '-i', str(source), '-vf',
                     f'trim=start_frame={start}:end_frame={end},setpts=PTS-STARTPTS',
                     '-an', *codec, '-pix_fmt', 'yuv420p', str(body)], cancelled, project / 'ffmpeg.log')
        entries.append(f"file 'edit/{body.name}'\n")
        if i == len(files)-1: continue
        blend = parts / f'blend-{i:04}.mp4'
        weight = f'min(1,T*{FPS}/{overlap-1})'
        expression = f'A*(1-{weight})+B*{weight}'
        graph = (f'[0:v]trim=start_frame={length-overlap}:end_frame={length},setpts=PTS-STARTPTS[a];'
                 f'[1:v]trim=start_frame=0:end_frame={overlap},setpts=PTS-STARTPTS[b];'
                 f"[a][b]blend=all_expr='{expression}'[out]")
        run_command([executable, '-y', '-i', str(source), '-i', str(files[i+1]), '-filter_complex', graph,
                     '-map', '[out]', '-frames:v', str(overlap), '-an', *codec, '-pix_fmt', 'yuv420p', str(blend)],
                    cancelled, project / 'ffmpeg.log')
        entries.append(f"file 'edit/{blend.name}'\n")
    listing.write_text(''.join(entries), encoding='utf-8')
    return listing


def _generate(project, client, cancelled, notify):
    project = Path(project)
    data = json.loads((project / 'project.json').read_text(encoding='utf-8'))
    if data.get('backend') != hunyuan.BACKEND:
        raise ValueError('Bản này chỉ tạo Hunyuan mới. Dự án Wan cũ không được tiếp tục.')
    width, height, out_width, out_height = geometry(data)
    if (data.get('server') and data['server'] != client.url
            and any(scene.get('prompt_id') or scene.get('request_marker') for scene in data['scenes'] if not valid_artifact(project, scene))):
        raise ValueError('Dự án đang gắn với ComfyUI ở ' + data['server'] + '. Dùng cùng địa chỉ để nhận tác vụ cũ.')
    ffmpeg_path = ffmpeg()
    backend=hunyuan.BACKEND
    profile = Path(data['profile_dir']) if data.get('profile_dir') else None
    if profile and not (project / 'nhan-vat-goc.png').exists() and (profile / 'reference.png').is_file():
        shutil.copy2(profile / 'reference.png', project / 'nhan-vat-goc.png')
    client.backend=backend;client.need_t2v=backend==hunyuan.BACKEND and not (project/'nhan-vat-goc.png').is_file()
    models = client.preflight()
    if data.get('portrait_first') and not (project/'nhan-vat-goc.png').is_file() and not any(s.get('prompt_id') or s.get('request_marker') for s in data['scenes']):
        portrait.ensure(project,data,client,models,cancelled,notify,width,height,profile)
    codec = encoder_options(ffmpeg_path)
    notify(f'Độ phân giải sinh gốc: {width}×{height} · Xuất {out_width}×{out_height} (không upscale)')
    notify('Mã hóa MP4: ' + ('GPU NVIDIA NVENC' if 'h264_nvenc' in codec else 'CPU (NVENC chưa dùng được; model sinh vẫn dùng GPU)'))
    def upload_reference(path):
        name=client.upload(path)
        data.setdefault('uploaded_inputs',[]).append(name)
        atomic_json(project/'project.json',data)
        return name
    identity_reference=None
    notify('Model: HunyuanVideo 1.5 · 720p · FP8 · 50 bước')
    data['server'] = client.url
    save = lambda: atomic_json(project / 'project.json', data)
    save()
    for position, scene in enumerate(data['scenes']):
        if cancelled.is_set(): raise Cancelled('Đã tạm dừng; có thể mở lại dự án để tiếp tục.')
        if valid_artifact(project, scene):
            notify({'scene':position+1,'total':len(data['scenes']),'image':str(project/f'tham-chieu-{position+1:04}.png'),'clip':str(project/f'canh-{position+1:04}.mp4')})
            continue
        if scene.get('output_sha256'):
            # A previously finished file/reference changed: all dependent output
            # must be regenerated against the current reference, not reused.
            for key in ('prompt_id', 'request_marker', 'output_sha256', 'reference_sha256'):
                scene.pop(key, None)
            save()
        notify(f'Cảnh {position + 1}/{len(data["scenes"])} · Chuẩn bị model')
        if not scene.get('prompt_id'):
            if scene.get('request_marker'):
                recovered = client.find_request(scene['request_marker'])
                if recovered: scene['prompt_id'] = recovered; save()
                else: raise RuntimeError('Lần gửi trước chưa xác định đã được nhận. Kiểm tra hàng đợi ComfyUI, rồi bấm Tạo lại cảnh lỗi nếu không có tác vụ này.')
            else:
                reference = None
                if position:
                    reference_path = project / f'tham-chieu-{position:04}.png'
                    reference = upload_reference(reference_path)
                    scene['input_reference_sha256'] = digest(reference_path)
                elif (project / 'nhan-vat-goc.png').is_file():
                    reference = upload_reference(project / 'nhan-vat-goc.png')
                    scene['character_reference_sha256'] = digest(project / 'nhan-vat-goc.png')
                if identity_reference is None and (project/'nhan-vat-goc.png').is_file():
                    identity_reference=upload_reference(project/'nhan-vat-goc.png')
                workflow=hunyuan.graph(scene,models,reference,identity_reference,
                    f'HunyuanLocal/{data["id"]}/scene-{position+1}',data.get('steps',50),width,height)
                atomic_json(project / f'workflow-{position + 1:04}.json', workflow)
                scene['request_marker'] = uuid.uuid4().hex
                save()  # Durable intent before a non-idempotent POST.
                result = client.request('/prompt', {'prompt': workflow, 'client_id': data['id'],
                                         'extra_data': {'hunyuanlocal_request': scene['request_marker']}})
                if result.get('error') or result.get('node_errors'):
                    scene.pop('request_marker', None); save()
                    raise RuntimeError('ComfyUI không nhận workflow: ' + json.dumps(result, ensure_ascii=False)[-3000:])
                scene['prompt_id'] = result['prompt_id']; save()
        try:
            frames = client.wait(scene['prompt_id'], cancelled, lambda text: notify(dict(text,status=f'Cảnh {position+1}/{len(data["scenes"])} · '+text['status']) if isinstance(text,dict) else f'Cảnh {position+1}/{len(data["scenes"])} · {text}'))
        except Cancelled:
            queue = client.request('/queue')
            record = client.request('/history/' + scene['prompt_id'])
            if not record and not any(x[1] == scene['prompt_id'] for x in queue.get('queue_running', []) + queue.get('queue_pending', [])):
                scene.pop('prompt_id', None); scene.pop('request_marker', None); save()
            raise
        if len(frames) != FRAMES:
            raise RuntimeError(f'Model trả {len(frames)} khung hình, cần {FRAMES}; không ghép video thiếu cảnh.')
        folder = project / f'frames-{position + 1:04}'; folder.mkdir(exist_ok=True)
        for index, frame in enumerate(frames):
            if cancelled.is_set(): raise Cancelled('Đã dừng tải khung hình. Tác vụ vẫn được lưu để tiếp tục.')
            client.download(frame, folder / f'{index:04}.png')
            if png_dimensions(folder / f'{index:04}.png') != (width, height):
                raise RuntimeError(f'Model trả khung không đúng {width}×{height}; dừng để tránh xuất nhầm độ phân giải.')
        last = project / f'tham-chieu-{position + 1:04}.png'
        shutil.copy2(folder / f'{FRAMES - 1:04}.png', last)
        if position == 0: shutil.copy2(folder / '0000.png', project / 'tham-chieu-goc.png')
        output = project / f'canh-{position + 1:04}.mp4'
        temporary = output.with_name(output.stem + '.partial.mp4')
        # Subsequent first frames are duplicates of the previous reference.
        start = 1 if position else 0
        command = [ffmpeg_path, '-y', '-framerate', str(FPS), '-start_number', str(start), '-i', str(folder / '%04d.png'),
                   '-frames:v', str(FRAMES - start), '-vf',
                   f'crop={out_width}:{out_height}:(iw-{out_width})/2:(ih-{out_height})/2,setsar=1', *codec,
                   '-pix_fmt', 'yuv420p', '-an', str(temporary)]
        run_command(command, cancelled, project / 'ffmpeg.log')
        temporary.replace(output)
        scene['output_sha256'] = digest(output); scene['reference_sha256'] = digest(last); save()
        if position==0 and not (project/'nhan-vat-goc.png').is_file():
            shutil.copy2(project/'tham-chieu-goc.png',project/'nhan-vat-goc.png')
        if position == 0 and profile and not (profile / 'reference.png').exists():
            profile.mkdir(parents=True, exist_ok=True)
            temporary_reference = profile / 'reference.tmp'
            shutil.copy2(project / 'tham-chieu-goc.png', temporary_reference)
            temporary_reference.replace(profile / 'reference.png')
            atomic_json(profile / 'profile.json', {'description': data.get('character', CHARACTER),
                        'sha256': digest(profile / 'reference.png'), 'source_project': str(project),
                        'identity_guaranteed': False})
            shutil.copy2(profile / 'reference.png', project / 'nhan-vat-goc.png')
            notify('Đã lưu nhân vật gốc; video sau tự dùng lại ảnh này.')
        shutil.rmtree(folder)
        notify({'scene':position+1,'total':len(data['scenes']),'image':str(last),'clip':str(output)})
        notify(f'Đã lưu cảnh {position + 1}/{len(data["scenes"])} và tham chiếu tự động.')
    listing = edit_sequence(project, data, ffmpeg_path, codec, cancelled, notify)
    final = project / 'video-hoan-tat.mp4'; temp = project / 'video-hoan-tat.partial.mp4'
    command = [ffmpeg_path, '-y', '-f', 'concat', '-safe', '1', '-i', str(listing)]
    music = project / 'nhac-nen.audio'
    duration = data['frames'] / FPS
    if music.is_file(): command += ['-stream_loop', '-1', '-i', str(music), '-map', '0:v:0', '-map', '1:a:0', '-af', f'volume=0.25,afade=t=in:d=0.5,afade=t=out:st={max(0,duration-1)}:d=1', '-c:a', 'aac']
    else: command += ['-an']
    command += ['-frames:v', str(data['frames']), *codec, '-pix_fmt', 'yuv420p']
    if music.is_file(): command += ['-t', str(data['frames'] / FPS), '-shortest']
    command += ['-movflags', '+faststart', str(temp)]
    notify('Đang ghép video cuối theo thời lượng đã chọn…')
    run_command(command, cancelled, project / 'ffmpeg.log'); temp.replace(final)
    data['final_sha256'] = digest(final); save()
    return final


@contextmanager
def project_lock(project):
    """Hold an OS lock across generation or cleanup."""
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
        try: yield
        finally:
            lock.seek(0)
            if os.name == 'nt': msvcrt.locking(lock.fileno(), msvcrt.LK_UNLCK, 1)
            else: fcntl.flock(lock.fileno(), fcntl.LOCK_UN)


def generate(project, client, cancelled, notify):
    with project_lock(project):
        monitor=None
        if isinstance(client,Comfy):
            data=json.loads((Path(project)/'project.json').read_text(encoding='utf-8'))
            monitor=ProgressMonitor(client.url,data['id']).start();monitor.ready.wait(.5)
            client.progress_monitor=monitor
        try:return _generate(project,client,cancelled,notify)
        finally:
            if monitor:monitor.close();client.progress_monitor=None


def delete_project(project, client, notify, managed_comfy=None, extra_prompt_ids=()):
    """Explicit user deletion. Target only this project's jobs/files, never clear a queue."""
    project=Path(project)
    if project.is_symlink():raise ValueError('Không xóa thư mục liên kết.')
    manifest=project/'project.json'
    data=json.loads(manifest.read_text(encoding='utf-8'))
    if not isinstance(data.get('scenes'),list) or not isinstance(data.get('id'),str) or len(data['id'])!=32 or any(c not in '0123456789abcdef' for c in data['id']) or data.get('topic') not in TOPICS:
        raise ValueError('Không phải dự án do tool tạo.')
    with project_lock(project):
        backend_stopped=False
        ids=set(extra_prompt_ids)
        if any(not isinstance(pid,str) or not pid for pid in ids):raise ValueError('Mã tác vụ khôi phục không hợp lệ.')
        for scene in data['scenes']+[data.get('portrait_request',{})]:
            pid=scene.get('prompt_id')
            if not pid and scene.get('request_marker'):pid=client.find_request(scene['request_marker'])
            if pid:ids.add(pid)
        if ids:
            notify('Đang dừng tác vụ và xóa hàng đợi của dự án…')
            client.request('/queue',{'delete':sorted(ids)})
            for pid in ids:client.request('/interrupt',{'prompt_id':pid})
            deadline=time.monotonic()+20
            while True:
                queue=client.request('/queue')
                active=queue.get('queue_running',[])+queue.get('queue_pending',[])
                if not any(item[1] in ids for item in active):break
                if time.monotonic()>deadline:
                    if managed_comfy:
                        backend_stopped=backend_control.stop_project_backend(Path(managed_comfy).parent,client,ids,notify)
                        if backend_stopped:break
                    raise RuntimeError('Tác vụ chưa dừng; chưa xóa dữ liệu. Backend có tác vụ khác hoặc không do tool quản lý nên không được đóng.')
                time.sleep(.5)
        # Exact managed output prefix, not user-selected arbitrary filesystem paths.
        if managed_comfy and data.get('id'):
            root=Path(managed_comfy)/'output'
            for prefix in ('HunyuanLocal','WanLocal'):
                folder=root/prefix/str(data['id'])
                if folder.resolve().is_relative_to(root.resolve()) and folder.resolve().parent == (root/prefix).resolve() and not folder.is_symlink() and folder.is_dir():
                    shutil.rmtree(folder)
        if managed_comfy:
            input_root=(Path(managed_comfy)/'input').resolve()
            for name in data.get('uploaded_inputs',[]):
                image=input_root/name
                if image.resolve().is_relative_to(input_root) and not image.is_symlink() and image.is_file():image.unlink()
        profile=Path(data['profile_dir']) if data.get('profile_dir') else None
        if profile and (profile/'profile.json').is_file():
            saved=json.loads((profile/'profile.json').read_text(encoding='utf-8'))
            reference=profile/'reference.png'
            if saved.get('source_project')==str(project) and reference.is_file() and digest(reference)==saved.get('sha256'):
                reference.unlink();(profile/'profile.json').unlink()
        if ids and not backend_stopped:client.request('/history',{'delete':sorted(ids)})
        for child in project.iterdir():
            if child.name in ('.render.lock','project.json'):continue
            if child.is_dir() and not child.is_symlink():shutil.rmtree(child)
            else:child.unlink()
    (project/'.render.lock').unlink(missing_ok=True)
    (project/'project.json').unlink()
    project.rmdir()
    return 'Đã xóa dự án, các cảnh và dữ liệu tạo dở. Model dùng chung được giữ.'


def reset_failed_scene(project):
    """Explicit user action only: never silently resubmit uncertain jobs."""
    project = Path(project)
    data = json.loads((project / 'project.json').read_text(encoding='utf-8'))
    if data.get('portrait_first') and not (project/'nhan-vat-goc.png').is_file() and data.get('portrait_request'):
        data['portrait_request'].pop('request_marker',None);data['portrait_request'].pop('prompt_id',None)
        atomic_json(project/'project.json',data);return
    for scene in data['scenes']:
        if not valid_artifact(project, scene):
            scene.pop('request_marker', None); scene.pop('prompt_id', None)
            atomic_json(project / 'project.json', data)
            return
