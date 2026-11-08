"""Vietnamese desktop front end; declarative scenes, Cinecode capture backend."""
import base64
import copy
import json
import math
import os
from pathlib import Path
import shutil
import subprocess
import sys
import urllib.request
import wave

ROOT = Path(getattr(sys, '_MEIPASS', Path(__file__).parent))
VERSION = '0.1.0'
STYLES = {'Điện ảnh': ['#091321', '#67e8d2'], 'Ấm áp': ['#261b22', '#ffc58e'],
          'Giải thích': ['#101832', '#a0b5ff']}

def validate(data):
    if not isinstance(data, dict) or not isinstance(data.get('scenes'), list):
        raise ValueError('Kịch bản phải có danh sách scenes.')
    if not 1 <= len(data['scenes']) <= 40:
        raise ValueError('Mỗi video cần từ 1 đến 40 cảnh.')
    result = {'title': str(data.get('title', 'Video của tôi'))[:200],
              'style': data.get('style') if data.get('style') in STYLES else 'Điện ảnh',
              'ratio': data.get('ratio') if data.get('ratio') in ('16:9', '9:16', '1:1') else '16:9',
              'narrationLanguage': 'English' if data.get('narrationLanguage') == 'English' else 'Tiếng Việt',
              'music': str(data.get('music', '')), 'voice': str(data.get('voice', '')), 'scenes': []}
    for scene in data['scenes']:
        if not isinstance(scene, dict):
            raise ValueError('Cảnh không hợp lệ.')
        duration = float(scene.get('duration', 5))
        if not math.isfinite(duration) or not 1 <= duration <= 60:
            raise ValueError('Thời lượng mỗi cảnh phải từ 1 đến 60 giây.')
        result['scenes'].append({k: str(scene.get(k, ''))[:5000] for k in ('title', 'text', 'narration', 'image')}
                               | {'duration': duration})
    if sum(s['duration'] for s in result['scenes']) > 600:
        raise ValueError('Bản đầu hỗ trợ video tối đa 10 phút.')
    return result

def parse_ai(text):
    text = text.strip()
    if text.startswith('```'):
        text = text.split('\n', 1)[1].rsplit('```', 1)[0]
    return validate(json.loads(text))

def request_ai(key, model, body):
    # The key never appears in a URL, a project file, or diagnostic logs.
    if not key.strip():
        raise ValueError('Nhập khóa Gemini trong Cài đặt AI trước.')
    if not model or any(c not in 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789-._' for c in model):
        raise ValueError('Tên mô hình không hợp lệ.')
    req = urllib.request.Request('https://generativelanguage.googleapis.com/v1beta/models/' + model + ':generateContent',
          data=json.dumps(body).encode(), headers={'Content-Type': 'application/json', 'x-goog-api-key': key.strip()})
    try:
        with urllib.request.urlopen(req, timeout=180) as r:
            return json.load(r)
    except urllib.error.HTTPError as e:
        # Provider response bodies can echo request data; keep the error message bounded and private.
        raise RuntimeError(f'Gemini trả lỗi HTTP {e.code}. Kiểm tra khóa, mô hình, hạn mức và kết nối.') from None

def generate(key, model, brief, duration, style, ratio, language='Tiếng Việt'):
    prompt = ('Bạn là biên kịch video tiếng Việt. Chỉ trả JSON với title và scenes. '
              'Mỗi scene có title (ngắn), text (tối đa 20 từ), narration (lời đọc tiếng Việt), duration (1-60 giây). '
              'Tổng duration đúng ' + str(duration) + ' giây, 3-12 cảnh. Đây là phim chữ/ảnh với chuyển động đồ họa, '
              'không tự tạo footage người thật. Không bịa nguồn hay sự kiện. '
              'Viết narration bằng ' + language + '. Nội dung yêu cầu:\n' + brief)
    r = request_ai(key, model, {'contents': [{'parts': [{'text': prompt}]}],
                  'generationConfig': {'responseMimeType': 'application/json'}})
    try:
        data = parse_ai(''.join(p.get('text', '') for p in r['candidates'][0]['content']['parts']))
    except (KeyError, IndexError):
        raise ValueError('AI chưa trả kịch bản. Hãy thử nội dung khác.') from None
    data.update(style=style, ratio=ratio, narrationLanguage=language)
    return data

def synthesize(key, text, path, voice='Kore', language='Tiếng Việt'):
    r = request_ai(key, 'gemini-2.5-flash-preview-tts', {
        'contents': [{'parts': [{'text': ('Read naturally and clearly in English:\n' if language == 'English'
                                        else 'Đọc tiếng Việt tự nhiên, rõ ràng:\n') + text}]}],
        'generationConfig': {'responseModalities': ['AUDIO'], 'speechConfig': {
            'voiceConfig': {'prebuiltVoiceConfig': {'voiceName': voice}}}}})
    try:
        audio = next(p['inlineData'] for p in r['candidates'][0]['content']['parts'] if 'inlineData' in p)
        if not audio.get('mimeType', '').startswith('audio/L16'):
            raise ValueError('Gemini trả định dạng âm thanh chưa hỗ trợ.')
        pcm = base64.b64decode(audio['data'], validate=True)
        rate = int(audio['mimeType'].split('rate=')[1].split(';')[0])
        if rate != 24000 or len(pcm) % 2:
            raise ValueError('Thông số âm thanh chưa hỗ trợ.')
    except (KeyError, IndexError, StopIteration):
        raise ValueError('AI chưa trả lời đọc. Kiểm tra quyền dùng mô hình TTS.') from None
    with wave.open(str(path), 'wb') as w:
        w.setnchannels(1); w.setsampwidth(2); w.setframerate(rate); w.writeframes(pcm)
    return len(pcm) / 2 / rate

def demo():
    return validate({'title': 'Một phút bình yên', 'scenes': [
        {'title': 'Chậm lại một chút', 'text': 'Giữa những ngày vội vã, hãy dành một khoảng lặng cho mình.', 'duration': 4},
        {'title': 'Nhìn điều giản dị', 'text': 'Một tia nắng. Một tách trà. Một lời hỏi thăm.', 'duration': 4},
        {'title': 'Bắt đầu từ hôm nay', 'text': 'Bình yên đôi khi chỉ là một hơi thở thật sâu.', 'duration': 4}]})

def load_project(path):
    path = Path(path)
    data = validate(json.loads(path.read_text(encoding='utf-8')))
    for scene in data['scenes']:
        if scene['image'] and not Path(scene['image']).is_absolute():
            scene['image'] = str(path.parent / scene['image'])
    for k in ('music', 'voice'):
        if data[k] and not Path(data[k]).is_absolute(): data[k] = str(path.parent / data[k])
    return data

def save_project(path, data):
    path = Path(path)
    tmp = path.with_suffix('.tmp')
    tmp.write_text(json.dumps(validate(data), ensure_ascii=False, indent=2), encoding='utf-8')
    tmp.replace(path)

def build_html(data, folder, preview=False):
    data = copy.deepcopy(validate(data))
    folder = Path(folder); folder.mkdir(parents=True, exist_ok=True)
    for scene in data['scenes']:
        if scene['image']:
            p = Path(scene['image'])
            suffix = p.suffix.lower()
            if suffix not in ('.png', '.jpg', '.jpeg', '.webp') or not p.is_file():
                raise ValueError('Không tìm thấy ảnh PNG/JPG/WebP: ' + str(p))
            if p.stat().st_size > 30 * 1024 * 1024: raise ValueError('Ảnh lớn hơn 30 MB.')
            mime = 'jpeg' if suffix in ('.jpg', '.jpeg') else suffix[1:]
            scene['image'] = 'data:image/' + mime + ';base64,' + base64.b64encode(p.read_bytes()).decode()
    source = (ROOT / 'film.html').read_text(encoding='utf-8')
    # Escape HTML delimiters too: AI/user text is data, never script or markup.
    payload = json.dumps(data, ensure_ascii=False).replace('<', '\\u003c').replace('>', '\\u003e').replace('&', '\\u0026')
    source = source.replace('__PROJECT_JSON__', payload)
    out = folder / ('preview.html' if preview else 'film.html')
    out.write_text(source, encoding='utf-8')
    return out

def executable(name):
    bundled = ROOT / 'runtime' / (name + '.exe')
    return str(bundled) if bundled.is_file() else shutil.which(name)

def run_command(args, log, cancelled):
    env = os.environ.copy()
    env['PATH'] = str(ROOT / 'runtime') + os.pathsep + env.get('PATH', '')
    with log.open('w', encoding='utf-8') as f:
        p = subprocess.Popen(args, stdout=f, stderr=subprocess.STDOUT, env=env,
                             creationflags=getattr(subprocess, 'CREATE_NO_WINDOW', 0))
        while p.poll() is None:
            if cancelled.wait(.2):
                if os.name == 'nt':
                    subprocess.run(['taskkill', '/PID', str(p.pid), '/T', '/F'], capture_output=True)
                else:
                    p.terminate()
                p.wait(); raise RuntimeError('Đã hủy xuất video.')
        if p.returncode:
            detail = log.read_text(encoding='utf-8', errors='replace')[-1800:]
            raise RuntimeError('Xuất video thất bại. Xem nhật ký: ' + str(log) + '\n' + detail)

def render(data, folder, output, cancelled, status=lambda s: None):
    data = validate(data); folder = Path(folder)
    html = build_html(data, folder)
    node, ffmpeg = executable('node'), executable('ffmpeg')
    if not node or not ffmpeg: raise RuntimeError('Thiếu Node/FFmpeg. Hãy dùng bộ cài đầy đủ.')
    picture = folder / 'picture.mp4'
    status('Đang dựng khung hình… Có thể mất vài phút.')
    command = [node, str(ROOT / 'vendor/capture.mjs'), '--url', str(html), '--video', str(picture),
               '--status', str(folder / 'progress.json'), '--workers', '1']
    if os.environ.get('CINECODE_CAPTURE_FLAGS'): command += ['--flags', os.environ['CINECODE_CAPTURE_FLAGS']]
    run_command(command, folder / 'render.log', cancelled)
    status('Đang ghép âm thanh và hoàn thiện…')
    duration = sum(s['duration'] for s in data['scenes'])
    args = [ffmpeg, '-hide_banner', '-nostdin', '-y', '-i', str(picture)]
    inputs = []
    for kind in ('voice', 'music'):
        if data[kind]:
            if not Path(data[kind]).is_file(): raise ValueError('Không tìm thấy âm thanh: ' + data[kind])
            if kind == 'music': args += ['-stream_loop', '-1']
            args += ['-i', data[kind]]; inputs.append(kind)
    if inputs:
        filters = []
        for i, kind in enumerate(inputs, 1):
            gain = .22 if kind == 'music' and 'voice' in inputs else 1
            filters.append(f'[{i}:a]aresample=48000,volume={gain},apad,atrim=0:{duration}[a{i}]')
        tracks = ''.join(f'[a{i}]' for i in range(1, len(inputs) + 1))
        filters.append(tracks + f'amix=inputs={len(inputs)}:normalize=0,loudnorm=I=-14:TP=-1.5:LRA=9[a]')
        args += ['-filter_complex', ';'.join(filters), '-map', '0:v', '-map', '[a]', '-c:a', 'aac', '-b:a', '192k']
    else: args += ['-an']
    # Write a temporary output so an interrupted job cannot replace a finished video.
    temp = Path(output).with_name(Path(output).stem + '.working.mp4')
    args += ['-c:v', 'copy', '-t', str(duration), '-movflags', '+faststart', str(temp)]
    try:
        run_command(args, folder / 'audio.log', cancelled)
        temp.replace(output)
    finally:
        temp.unlink(missing_ok=True)
    return Path(output)
