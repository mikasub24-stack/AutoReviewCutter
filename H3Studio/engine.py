"""H3 Studio: persistent production projects, cloud jobs, local final edit."""
import base64
import copy
import json
import math
import mimetypes
import os
from pathlib import Path
import shutil
import subprocess
import threading
import time
import urllib.error
import urllib.parse
import urllib.request
import uuid

VERSION = '0.1.0'
APP_HOME = Path(os.environ.get('LOCALAPPDATA', Path.home() / '.local/share')) / 'H3Studio'
ROOT = Path(__file__).resolve().parent
NO_WINDOW = subprocess.CREATE_NO_WINDOW if os.name == 'nt' else 0
DEFAULTS = dict(provider='RunningHub', rh_url='https://www.runninghub.cn', workflow_id='2097511747551842305',
                comfy_url='http://127.0.0.1:8188', llm_url='https://api.openai.com/v1', llm_model='gpt-4.1-mini',
                image_url='https://api.openai.com/v1', image_model='gpt-image-1',
                asr_url='https://api.openai.com/v1', asr_model='whisper-1',
                unet='minimax_h3_ref2va_pruned_int8_convrot.safetensors',
                clip='qwen3vl_32b_minimax_h3_nvfp4_awq.safetensors',
                video_vae='minimax_h3_video_vae_int8_convrot.safetensors', audio_vae='minimax_h3_audio_vae_fp32.safetensors', steps=20)


class Stopped(Exception):
    pass


def atomic_json(path, data):
    path = Path(path)
    path.parent.mkdir(parents=True, exist_ok=True)
    tmp = path.with_suffix(path.suffix + '.tmp')
    tmp.write_text(json.dumps(data, ensure_ascii=False, indent=2), encoding='utf-8')
    os.replace(tmp, path)


def resource_path(name):
    return ROOT / name


def validate_url(url, local=False):
    p = urllib.parse.urlparse(url)
    if p.username or p.password or p.query or p.fragment:
        raise ValueError('Địa chỉ máy chủ không được chứa mật khẩu, query hoặc fragment.')
    if p.scheme != 'https' and not (local and p.scheme == 'http' and p.hostname in ('127.0.0.1', 'localhost', '::1')):
        raise ValueError('Dùng HTTPS; HTTP chỉ dành cho ComfyUI trên localhost.')
    if not p.hostname:
        raise ValueError('Địa chỉ máy chủ chưa hợp lệ.')
    return url.rstrip('/')


class NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        # Never forward Authorization/API bodies to a redirected server.
        raise ValueError('Máy chủ chuyển hướng API. Hãy nhập địa chỉ API chính xác trong Kết nối.')


class Http:
    def __init__(self, stop=None):
        self.stop = stop or threading.Event()

    def check(self):
        if self.stop.is_set():
            raise Stopped('Đã dừng tại máy; tác vụ cloud đã gửi vẫn được ghi nhớ để kiểm tra lại.')

    def json(self, url, data=None, key='', method=None, raw=None, content_type=None, text=False):
        self.check()
        headers = {'Accept': 'application/json', 'User-Agent': 'H3Studio/0.1'}
        if key:
            headers['Authorization'] = 'Bearer ' + key
        if data is not None:
            raw = json.dumps(data, ensure_ascii=False).encode()
            content_type = 'application/json'
        if content_type:
            headers['Content-Type'] = content_type
        req = urllib.request.Request(url, data=raw, headers=headers, method=method or ('POST' if raw is not None else 'GET'))
        try:
            with urllib.request.build_opener(NoRedirect).open(req, timeout=45) as r:
                payload = r.read(12 * 1024 * 1024 + 1)
                if len(payload) > 12 * 1024 * 1024:
                    raise ValueError('Phản hồi API quá lớn.')
                result = payload.decode('utf-8') if text else json.loads(payload)
        except urllib.error.HTTPError as e:
            # Avoid logging a body that may echo API keys or signed reference URLs.
            raise RuntimeError(f'API trả HTTP {e.code}. Kiểm tra quyền model, số dư và địa chỉ máy chủ.') from None
        return result

    def upload(self, url, path, key='', fields=None, text=False):
        path = Path(path)
        if path.stat().st_size > 30 * 1024 * 1024:
            raise ValueError('Mỗi ảnh/âm thanh tham chiếu tối đa 30 MB.')
        boundary = 'H3Studio' + uuid.uuid4().hex
        chunks = []
        for name, value in (fields or {}).items():
            chunks.append(f'--{boundary}\r\nContent-Disposition: form-data; name="{name}"\r\n\r\n{value}\r\n'.encode())
        mime = mimetypes.guess_type(path.name)[0] or 'application/octet-stream'
        field = 'image' if '/upload/image' in url else 'file'
        chunks.append(f'--{boundary}\r\nContent-Disposition: form-data; name="{field}"; filename="ref{path.suffix.lower()}"\r\nContent-Type: {mime}\r\n\r\n'.encode())
        chunks.extend((path.read_bytes(), f'\r\n--{boundary}--\r\n'.encode()))
        return self.json(url, key=key, raw=b''.join(chunks), content_type='multipart/form-data; boundary=' + boundary, text=text)

    def download(self, url, path):
        self.check()
        if urllib.parse.urlparse(url).scheme != 'https':
            raise ValueError('Link tải cloud phải dùng HTTPS.')
        path = Path(path)
        path.parent.mkdir(parents=True, exist_ok=True)
        tmp = path.with_suffix(path.suffix + '.part')
        with urllib.request.urlopen(urllib.request.Request(url, headers={'User-Agent': 'H3Studio/0.1'}), timeout=45) as r, tmp.open('wb') as f:
            total = 0
            while True:
                self.check()
                block = r.read(1024 * 1024)
                if not block:
                    break
                total += len(block)
                if total > 1024 * 1024 * 1024:
                    raise ValueError('Một file kết quả vượt 1 GB.')
                f.write(block)
        if not total:
            raise ValueError('File tải về rỗng.')
        os.replace(tmp, path)
        return str(path)


def unpack_rh(result):
    if not isinstance(result, dict) or result.get('code', 0) not in (0, '0', None):
        code = result.get('code', '?') if isinstance(result, dict) else '?'
        raise RuntimeError(f'RunningHub từ chối yêu cầu (mã {code}). Kiểm tra API key, quyền workflow và số dư trên tài khoản.')
    return result.get('data', result)


def parse_json_text(text):
    text = text.strip()
    if text.startswith('```'):
        text = text.split('\n', 1)[1].rsplit('```', 1)[0]
    return json.loads(text)


def validate_plan(plan):
    if not isinstance(plan, dict) or not isinstance(plan.get('scenes'), list) or not 1 <= len(plan['scenes']) <= 240:
        raise ValueError('Kịch bản cần từ 1 đến 240 cảnh.')
    characters = plan.setdefault('characters', [])
    if not isinstance(characters, list) or len(characters) > 7:
        raise ValueError('Mỗi dự án tối đa 7 nhân vật chính.')
    names = set()
    for ch in characters:
        if not isinstance(ch, dict) or not isinstance(ch.get('name'), str) or not ch['name'].strip() or ch['name'] in names:
            raise ValueError('Tên nhân vật phải khác nhau và không để trống.')
        names.add(ch['name'])
        ch.setdefault('description', '')
        ch.setdefault('voice', '')
    for i, scene in enumerate(plan['scenes'], 1):
        if not isinstance(scene, dict) or not isinstance(scene.get('prompt'), str) or not scene['prompt'].strip():
            raise ValueError(f'Cảnh {i} thiếu mô tả hình ảnh.')
        seconds = float(scene.get('seconds', 8))
        if not 4 <= seconds <= 15:
            raise ValueError(f'Cảnh {i}: H3 cần 4–15 giây mỗi đoạn.')
        cast = scene.get('characters', [])
        if not isinstance(cast, list) or not set(cast).issubset(names):
            raise ValueError(f'Cảnh {i}: nhân vật chưa có trong danh sách.')
        scene.update(id=i, seconds=seconds, characters=cast)
        scene.setdefault('title', f'Cảnh {i:02}')
        scene.setdefault('dialogue', '')
        scene.setdefault('continuity', '')
    plan.setdefault('title', 'Phim mới')
    return plan


class Project:
    def __init__(self, folder, data=None):
        self.folder = Path(folder).resolve()
        self.path = self.folder / 'project.json'
        self.data = data if data is not None else json.loads(self.path.read_text(encoding='utf-8'))
        self.data.setdefault('jobs', {})
        self.data.setdefault('assets', {})
        self.data.setdefault('ratio', '16:9')
        self.data.setdefault('resolution', '640p')
        validate_plan(self.data)

    def save(self):
        atomic_json(self.path, self.data)

    def asset(self, key, source):
        source = Path(source)
        target = self.folder / 'assets' / (uuid.uuid4().hex + source.suffix.lower())
        target.parent.mkdir(parents=True, exist_ok=True)
        shutil.copy2(source, target)
        self.data['assets'][key] = str(target.relative_to(self.folder))
        self.save()

    def file(self, relative):
        path = (self.folder / relative).resolve()
        if not path.is_relative_to(self.folder):
            raise ValueError('Đường dẫn trong dự án nằm ngoài thư mục dự án.')
        return path


def dimensions(resolution, ratio):
    w, h = {'640p': (1152, 640), '768p': (1344, 768)}[resolution]
    return (h, w) if ratio == '9:16' else (w, h)


def build_graph(scene, project, settings, images, audio, seed):
    """Native reference graph, based on the official ComfyUI H3 template."""
    width, height = dimensions(project['resolution'], project['ratio'])
    frames = round(float(scene['seconds']) * 24)
    length = frames + (5 - frames % 17) % 17
    def n(kind, **inputs):
        return {'class_type': kind, 'inputs': inputs}
    graph = {
        '1': n('UNETLoader', unet_name=settings['unet'], weight_dtype='default'),
        '2': n('CLIPLoader', clip_name=settings['clip'], type='minimax', device='default'),
        '3': n('VAELoader', vae_name=settings['video_vae']),
        '4': n('VAELoader', vae_name=settings['audio_vae']),
        '5': n('MiniMaxH3ReferenceToVideo', clip=['2', 0], vae=['3', 0], audio_vae=['4', 0],
               prompt=scene['prompt'], width=width, height=height, length=length, ref_image_size='match'),
        '6': n('RandomNoise', noise_seed=seed),
        '7': n('KSamplerSelect', sampler_name='res_multistep'),
        '8': n('BasicScheduler', model=['1', 0], scheduler='beta', steps=int(settings.get('steps', 20)), denoise=1.0),
        '9': n('BasicGuider', model=['1', 0], conditioning=['5', 0]),
        '10': n('SamplerCustomAdvanced', noise=['6', 0], guider=['9', 0], sampler=['7', 0], sigmas=['8', 0], latent_image=['5', 1]),
        '11': n('VAEDecode', samples=['10', 0], vae=['3', 0]),
        '12': n('VAEDecodeAudio', samples=['10', 0], vae=['4', 0]),
        '13': n('CreateVideo', images=['11', 0], audio=['12', 0], fps=24),
        '14': n('SaveVideo', video=['13', 0], filename_prefix='H3Studio/scene', format='mp4', codec='h264'),
    }
    for i, name in enumerate(images[:9]):
        node = str(20 + i)
        graph[node] = n('LoadImage', image=name)
        graph['5']['inputs'][f'ref_images.ref_image_{i}'] = [node, 0]
    for i, name in enumerate(audio[:3]):
        node = str(40 + i)
        graph[node] = n('LoadAudio', audio=name)
        graph['5']['inputs'][f'ref_audios.ref_audio_{i}'] = [node, 0]
    return graph


class Runner:
    def __init__(self, settings, secrets, stop=None, emit=None, http=None):
        self.settings = {**DEFAULTS, **settings}
        self.secrets = secrets
        self.stop = stop or threading.Event()
        self.http = http or Http(self.stop)
        self.emit = emit or (lambda *a: None)
        self.uploaded = {}

    def pause(self, seconds):
        if self.stop.wait(seconds):
            raise Stopped('Đã dừng chờ tại máy. Tác vụ đã gửi được lưu; tiếp tục sẽ kiểm tra lại, không gửi trùng.')

    def plan(self, idea, minutes, language, style, ratio):
        base = validate_url(self.settings['llm_url'])
        key = self.secrets.get('llm_key', '')
        if not key:
            raise ValueError('Vào Kết nối để nhập API key viết kịch bản, hoặc nhập dự án JSON có sẵn.')
        target = round(float(minutes) * 60)
        if not 5 <= target <= 1200:
            raise ValueError('Chọn thời lượng từ 5 giây đến 20 phút.')
        system = '''You are a short-film director. Return ONLY a JSON object with title, characters, scenes.
characters: array (max 7) of {name, description, voice}; description is an English full-body character design prompt including face, age, outfit and shoes. voice is a fixed voice description.
scenes: ordered array of {title, seconds, prompt, dialogue, characters:[character names], continuity}.
Each scene must be 4 to 15 seconds, contain one clear action or short dialogue, and logically follow the previous ending.
Use dialogue with exact speaker names, distinguish spoken lines, internal monologue (no mouth movement), and voiceover.
Video prompt in English, dialogue in the requested language. No music or generated text/subtitles. Vary shot sizes, keep lighting and geography within a scene. Stable outfits and faces. Do not claim perfect continuity.
Only create the requested story, not generic motivational filler. Target the requested total duration. End at a coherent story beat.
The user may supply a script; preserve their dialogue and story. Do not invent unnamed major characters.'''
        body = dict(model=self.settings['llm_model'], messages=[{'role': 'system', 'content': system},
                    {'role': 'user', 'content': f'Language: {language}; style: {style}; aspect: {ratio}; target duration {target} seconds.\nStory/script:\n{idea}'}],
                    response_format={'type': 'json_object'}, max_tokens=min(30000, max(4000, target * 35)))
        result = self.http.json(base + '/chat/completions', body, key)
        try:
            return validate_plan(parse_json_text(result['choices'][0]['message']['content']))
        except (KeyError, IndexError, TypeError, json.JSONDecodeError) as e:
            raise ValueError('AI chưa trả kịch bản JSON hợp lệ. Thử đổi model có hỗ trợ JSON.') from e

    def image(self, prompt, path):
        key = self.secrets.get('image_key', '')
        if not key:
            raise ValueError('Chưa có API key tạo ảnh. Bạn có thể thêm ảnh nhân vật có sẵn trong tab Nhân vật.')
        result = self.http.json(validate_url(self.settings['image_url']) + '/images/generations',
                                dict(model=self.settings['image_model'], prompt=prompt, n=1, size='1024x1024'), key)
        item = result.get('data', [{}])[0]
        path = Path(path)
        path.parent.mkdir(parents=True, exist_ok=True)
        if item.get('b64_json'):
            path.write_bytes(base64.b64decode(item['b64_json'], validate=True))
        elif item.get('url'):
            self.http.download(item['url'], path)
        else:
            raise ValueError('API tạo ảnh chưa trả ảnh. Kiểm tra model tạo ảnh trong Kết nối.')
        return path

    def ensure_assets(self, project):
        for ch in project.data['characters']:
            key = 'character:' + ch['name']
            if key in project.data['assets'] and project.file(project.data['assets'][key]).exists():
                continue
            self.emit('status', 'Tạo ảnh tham chiếu: ' + ch['name'])
            name = 'assets/' + uuid.uuid4().hex + '.png'
            self.image(ch['description'] + '. Character reference sheet: full body front view, neutral expression, plain white background. Keep hands and shoes visible. No text.', project.file(name))
            project.data['assets'][key] = name
            project.save()
            self.emit('assets', None)

    def backend(self):
        if self.settings['provider'] == 'RunningHub':
            return validate_url(self.settings['rh_url']), self.secrets.get('rh_key', '')
        return validate_url(self.settings['comfy_url'], local=True), ''

    def preflight(self):
        base, key = self.backend()
        if self.settings['provider'] == 'RunningHub':
            if not key:
                raise ValueError('Chưa có API key RunningHub. Nhập trong Kết nối; không cần gửi key trong chat.')
            data = unpack_rh(self.http.json(base + '/api/openapi/getJsonApiFormat',
                            {'apiKey': key, 'workflowId': self.settings['workflow_id']}, key))
            if not isinstance(data, dict) or not data.get('prompt'):
                raise ValueError('Tài khoản chưa đọc được workflow RunningHub đã chọn.')
            return 'Đã đọc workflow qua RunningHub. Chưa sinh video, chưa xác nhận model trên GPU hoặc giá chạy.'
        info = self.http.json(base + '/object_info')
        required = ['MiniMaxH3ReferenceToVideo', 'CreateVideo', 'VAEDecodeAudio']
        missing = [name for name in required if name not in info]
        if missing:
            raise ValueError('ComfyUI chưa có node: ' + ', '.join(missing))
        for node, field, configured in [('UNETLoader', 'unet_name', 'unet'), ('CLIPLoader', 'clip_name', 'clip')]:
            choices = info.get(node, {}).get('input', {}).get('required', {}).get(field, [[]])[0]
            if self.settings[configured] not in choices:
                raise ValueError('ComfyUI chưa có model: ' + self.settings[configured])
        return 'ComfyUI có node H3 và model đã chọn. Tạo thử một cảnh để kiểm tra inference.'

    def upload(self, path):
        path = Path(path)
        cache_key = (str(path), path.stat().st_mtime_ns)
        if cache_key in self.uploaded:
            return self.uploaded[cache_key]
        base, key = self.backend()
        if self.settings['provider'] == 'RunningHub':
            result = unpack_rh(self.http.upload(base + '/openapi/v2/media/upload/binary', path, key))
            name = result['fileName']
        else:
            if path.suffix.lower() in ('.mp3', '.wav'):
                raise ValueError('Upload âm thanh tự động hiện chỉ có trên RunningHub. Với ComfyUI, hãy dùng ảnh tham chiếu.')
            result = self.http.upload(base + '/upload/image', path, fields={'overwrite': 'true'})
            name = (result.get('subfolder', '').strip('/') + '/' + result['name']).lstrip('/')
        self.uploaded[cache_key] = name
        return name

    def refs(self, scene, project):
        images, audio, descriptions = [], [], []
        for name in scene['characters']:
            ch = next(c for c in project.data['characters'] if c['name'] == name)
            ref = project.data['assets'].get('character:' + name)
            if not ref:
                raise ValueError('Thiếu ảnh tham chiếu của ' + name)
            images.append(self.upload(project.file(ref)))
            descriptions.append(f'<Picture {len(images)}> defines the exact face, hairstyle and outfit of {name}. Voice: {ch["voice"]}.')
            voice = project.data['assets'].get('voice:' + name)
            if voice and len(audio) < 3:
                audio.append(self.upload(project.file(voice)))
                descriptions.append(f'<Audio {len(audio)}> is the voice reference for {name}.')
        scene_copy = copy.deepcopy(scene)
        scene_copy['prompt'] = '\n'.join(descriptions) + '\n' + scene['prompt'] + '\nContinuity: ' + scene['continuity'] + '\nDialogue (preserve words and speaker): ' + scene['dialogue'] + '\nNo subtitles, no text overlays, no background music.'
        return scene_copy, images, audio

    def submit(self, graph):
        base, key = self.backend()
        if self.settings['provider'] == 'RunningHub':
            data = unpack_rh(self.http.json(base + '/task/openapi/create',
                    dict(apiKey=key, workflowId=self.settings['workflow_id'], workflow=json.dumps(graph),
                         nodeInfoList=[], addMetadata=False), key))
            return str(data['taskId'])
        result = self.http.json(base + '/prompt', {'prompt': graph, 'client_id': 'h3studio-' + uuid.uuid4().hex})
        if result.get('node_errors'):
            raise ValueError('ComfyUI từ chối graph: ' + ', '.join(result['node_errors']))
        return str(result['prompt_id'])

    def poll(self, task, provider=None, base=None):
        current_base, key = self.backend()
        base = base or current_base
        provider = provider or self.settings['provider']
        if provider == 'RunningHub':
            req = {'apiKey': key, 'taskId': task}
            status = str(unpack_rh(self.http.json(base + '/task/openapi/status', req, key))).lower()
            if status in ('failed', 'failure', 'cancelled', 'canceled'):
                raise ValueError('Tác vụ H3 lỗi hoặc đã bị hủy. Xem chi tiết trong RunningHub; app không tự gửi lại để tránh tính phí trùng.')
            if status == 'success':
                outputs = unpack_rh(self.http.json(base + '/task/openapi/outputs', req, key))
                videos = [o for o in outputs if o.get('fileType', '').lower() == 'mp4']
                chosen = next((o for o in videos if str(o.get('nodeId')) == '14'), None)
                if not chosen and len(videos) == 1:
                    chosen = videos[0]
                if not chosen:
                    raise ValueError('Chưa có một MP4 đầu ra xác định. Giữ task ID để kiểm tra lại; không tự tạo lại.')
                return chosen['fileUrl']
            return None
        history = self.http.json(base + '/history/' + urllib.parse.quote(task, safe=''))
        if task not in history:
            return None
        item = history[task]
        if item.get('status', {}).get('status_str') == 'error':
            raise ValueError('ComfyUI báo lỗi inference. Xem console ComfyUI; app giữ ID, không tự chạy lại.')
        output = item.get('outputs', {}).get('14', {})
        for values in output.values():
            if isinstance(values, list):
                for obj in values:
                    if isinstance(obj, dict) and str(obj.get('filename', '')).endswith('.mp4'):
                        return base + '/view?' + urllib.parse.urlencode({k: obj[k] for k in ('filename', 'subfolder', 'type') if k in obj})
        if item.get('status', {}).get('completed'):
            raise ValueError('ComfyUI đã hoàn tất nhưng chưa có MP4 ở node SaveVideo.')
        return None

    def run(self, project, selected=None):
        self.preflight()
        self.ensure_assets(project)
        for scene in project.data['scenes']:
            if selected is not None and scene['id'] != selected:
                continue
            self.http.check()
            key = str(scene['id'])
            job = project.data['jobs'].get(key, {})
            if job.get('file') and project.file(job['file']).exists():
                continue
            base, _ = self.backend()
            if job.get('task_id') and (job.get('provider') != self.settings['provider'] or job.get('base') != base):
                raise ValueError('Cảnh còn task ở kết nối cũ. Chọn lại nhà cung cấp và máy chủ ban đầu để kiểm tra, tránh gửi trùng.')
            if not job.get('task_id'):
                self.emit('status', f'Cảnh {key}: chuẩn bị ảnh và gửi H3…')
                prepared, images, audio = self.refs(scene, project)
                seed = uuid.uuid4().int % (2**48)
                graph = build_graph(prepared, project.data, self.settings, images, audio, seed)
                # Persist intent first: a lost submit response must not trigger automatic duplicate billing.
                if job.get('submit_uncertain'):
                    raise ValueError('Lần gửi trước mất phản hồi. Kiểm tra lịch sử cloud và nhập task ID trong project.json trước khi tiếp tục; không tự gửi trùng.')
                job = {'provider': self.settings['provider'], 'base': base, 'seed': seed, 'submit_uncertain': True}
                project.data['jobs'][key] = job
                project.save()
                task = self.submit(graph)
                job.update(task_id=task, submit_uncertain=False)
                project.save()
            start = time.monotonic()
            while True:
                self.http.check()
                self.emit('status', f'Cảnh {key}/{len(project.data["scenes"])} · Cloud đang xử lý · {round(time.monotonic()-start)} giây chờ')
                url = self.poll(job['task_id'], job['provider'], job['base'])
                if url:
                    break
                if time.monotonic() - start > 7200:
                    raise ValueError('Đã chờ 2 giờ. Task ID được giữ; bấm Tiếp tục để kiểm tra, không tạo lại.')
                self.pause(5)
            relative = f'clips/canh-{scene["id"]:04}-{uuid.uuid4().hex[:10]}.mp4'
            destination = project.file(relative)
            if url.startswith('http://') and self.settings['provider'] == 'ComfyUI':
                # Local ComfyUI only, host is validated and response stays in the configured origin.
                self.download_local(url, destination)
            else:
                self.http.download(url, destination)
            if destination.stat().st_size < 32:
                raise ValueError('Video đầu ra quá nhỏ; giữ task ID để lấy lại.')
            job['file'] = relative
            project.save()
            self.emit('scene', scene['id'])
        self.emit('status', 'Các cảnh đã sẵn sàng. Chọn Ghép & xuất MP4 để hoàn thiện.')

    def download_local(self, url, destination):
        base, _ = self.backend()
        if not url.startswith(base + '/view?'):
            raise ValueError('Đầu ra ComfyUI không thuộc máy chủ đã chọn.')
        destination.parent.mkdir(parents=True, exist_ok=True)
        tmp = destination.with_suffix('.part')
        with urllib.request.urlopen(url, timeout=45) as r, tmp.open('wb') as f:
            while True:
                self.http.check()
                chunk = r.read(1024 * 1024)
                if not chunk:
                    break
                f.write(chunk)
        os.replace(tmp, destination)


def transcribe(project, settings, secrets, stop=None, emit=None, http=None):
    stop = stop or threading.Event()
    emit = emit or (lambda *a: None)
    if not secrets.get('asr_key'):
        raise ValueError('Nhập API key nhận dạng âm thanh ở Kết nối để tạo phụ đề từ giọng nói thực.')
    if not project.data.get('output'):
        raise ValueError('Ghép phim trước khi nhận dạng phụ đề.')
    emit('status', 'Nhận dạng lời nói thực để tạo phụ đề…')
    audio = project.folder / 'edit' / 'nhan-dang.mp3'
    audio.parent.mkdir(exist_ok=True)
    run_process([ffmpeg_exe(), '-y', '-i', str(project.file(project.data['output'])), '-vn',
                 '-ac', '1', '-ar', '16000', '-c:a', 'libmp3lame', '-b:a', '64k', str(audio)], stop)
    result = (http or Http(stop)).upload(validate_url(settings['asr_url']) + '/audio/transcriptions', audio,
                secrets['asr_key'], fields={'model': settings['asr_model'], 'response_format': 'srt'}, text=True)
    if not isinstance(result, str) or '-->' not in result:
        raise ValueError('API âm thanh chưa trả phụ đề SRT hợp lệ. Kiểm tra model/response_format.')
    target = project.folder / 'phu-de.srt'
    target.write_text(result, encoding='utf-8')
    project.data['subtitles'] = target.name
    project.save()
    emit('status', 'Đã có phụ đề từ âm thanh thực. Có thể sửa phu-de.srt rồi xuất lại phim.')
    return target


def ffmpeg_exe():
    local = ROOT / 'runtime/ffmpeg.exe'
    found = str(local) if local.exists() else shutil.which('ffmpeg')
    if not found:
        raise ValueError('Không tìm thấy FFmpeg trong bộ cài.')
    return found


def run_process(args, stop, cwd=None):
    with subprocess.Popen(args, stdout=subprocess.DEVNULL, stderr=subprocess.PIPE, creationflags=NO_WINDOW, cwd=cwd) as proc:
        # A temporary file avoids a full stderr pipe blocking a long encode.
        while True:
            try:
                _, err = proc.communicate(timeout=0.25)
                break
            except subprocess.TimeoutExpired:
                if stop.is_set():
                    proc.terminate()
                    try:
                        proc.communicate(timeout=3)
                    except subprocess.TimeoutExpired:
                        proc.kill(); proc.communicate()
                    raise Stopped('Đã dừng xuất video. Các clip gốc vẫn được giữ.')
        if proc.returncode:
            raise RuntimeError('FFmpeg chưa xuất được video: ' + err.decode('utf-8', 'replace')[-1400:])


def render(project, stop=None, emit=None):
    stop = stop or threading.Event()
    emit = emit or (lambda *a: None)
    width, height = dimensions(project.data['resolution'], project.data['ratio'])
    work = project.folder / 'edit'
    work.mkdir(exist_ok=True)
    normalized = []
    for scene in project.data['scenes']:
        source = project.data['jobs'].get(str(scene['id']), {}).get('file')
        if not source or not project.file(source).is_file():
            raise ValueError(f'Cảnh {scene["id"]} chưa có video. Chưa thể xuất phim đầy đủ.')
        emit('status', f'Chuẩn hóa hình và âm lượng cảnh {scene["id"]}…')
        target = work / f'{scene["id"]:04}.mp4'
        # Missing sound gets a silent stereo track so mixed imported clips concatenate correctly.
        probe = subprocess.run([ffmpeg_exe(), '-hide_banner', '-i', str(project.file(source))],
                               capture_output=True, timeout=20, creationflags=NO_WINDOW)
        has_audio = b'Audio:' in probe.stderr
        args = [ffmpeg_exe(), '-y', '-i', str(project.file(source))]
        if not has_audio:
            args += ['-f', 'lavfi', '-i', 'anullsrc=r=48000:cl=stereo']
        args += ['-map', '0:v:0', '-map', '0:a:0' if has_audio else '1:a:0']
        # Keep native speech; never stretch the clip to the planned duration.
        run_process(args + [
                     '-vf', f'scale={width}:{height}:force_original_aspect_ratio=decrease,pad={width}:{height}:(ow-iw)/2:(oh-ih)/2,setsar=1,fps=24',
                     '-c:v', 'libx264', '-preset', 'fast', '-crf', '18', '-pix_fmt', 'yuv420p',
                     '-af', 'loudnorm=I=-16:TP=-1.5:LRA=9', '-c:a', 'aac', '-ar', '48000', '-ac', '2', '-shortest', str(target)], stop)
        normalized.append(target)
    # All clips use the same format; concatenation preserves dialogue timing and avoids repeating fades.
    playlist = work / 'concat.txt'
    playlist.write_text('\n'.join("file '" + p.name + "'" for p in normalized), encoding='utf-8')
    result = project.folder / 'phim-hoan-chinh.mp4'
    tmp = project.folder / 'phim-hoan-chinh.tmp.mp4'
    run_process([ffmpeg_exe(), '-y', '-f', 'concat', '-safe', '1', '-i', str(playlist), '-c', 'copy', '-movflags', '+faststart', str(tmp)], stop)
    music = project.data.get('music')
    if music:
        mixed = project.folder / 'phim-nhac.tmp.mp4'
        emit('status', 'Trộn nhạc nền, tự hạ nhạc khi có tiếng nói…')
        run_process([ffmpeg_exe(), '-y', '-i', str(tmp), '-stream_loop', '-1', '-i', str(project.file(music)),
                     '-filter_complex', '[1:a]volume=0.16[bg];[0:a]asplit=2[voice][sc];[bg][sc]sidechaincompress=threshold=0.03:ratio=8:attack=20:release=300[duck];[voice][duck]amix=inputs=2:duration=first:normalize=0[outa]',
                     '-map', '0:v:0', '-map', '[outa]', '-c:v', 'copy', '-c:a', 'aac', '-shortest', '-movflags', '+faststart', str(mixed)], stop)
        os.replace(mixed, tmp)
    subtitles = project.data.get('subtitles')
    if subtitles:
        # The generated fixed filename avoids FFmpeg filter path escaping on Windows.
        source_srt = project.file(subtitles)
        fixed_srt = project.folder / 'phu-de.srt'
        if source_srt != fixed_srt:
            shutil.copy2(source_srt, fixed_srt)
        subtitled = project.folder / 'phim-phu-de.tmp.mp4'
        emit('status', 'Gắn phụ đề vào hình…')
        run_process([ffmpeg_exe(), '-y', '-i', str(tmp), '-vf', 'subtitles=phu-de.srt:force_style=FontName=Arial',
                     '-c:v', 'libx264', '-preset', 'fast', '-crf', '18', '-c:a', 'copy', '-movflags', '+faststart', str(subtitled)], stop, cwd=project.folder)
        os.replace(subtitled, tmp)
    os.replace(tmp, result)
    project.data['output'] = str(result.relative_to(project.folder))
    project.save()
    emit('status', 'Đã xuất MP4. Bạn có thể xem hoặc Lưu như.')
    return result
