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
import re
import time
import tempfile
from email.utils import parsedate_to_datetime
from datetime import datetime, timezone
import urllib.request
import wave
import network

TaskCancelled = network.Cancelled
_perform_request = network.perform

class ApiError(RuntimeError):
    def __init__(self, message, code=None):
        super().__init__(message);self.code=code

ROOT = Path(getattr(sys, '_MEIPASS', Path(__file__).parent))
VERSION = '0.2.0'
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
              'videoLanguage': 'English' if data.get('videoLanguage',data.get('narrationLanguage')) == 'English' else 'Tiếng Việt',
              'music': str(data.get('music', '')), 'voice': str(data.get('voice', '')), 'scenes': []}
    for scene in data['scenes']:
        if not isinstance(scene, dict):
            raise ValueError('Cảnh không hợp lệ.')
        duration = float(scene.get('duration', 5))
        if not math.isfinite(duration) or not 1 <= duration <= 60:
            raise ValueError('Thời lượng mỗi cảnh phải từ 1 đến 60 giây.')
        result['scenes'].append({k: str(scene.get(k, ''))[:5000] for k in ('title', 'text', 'narration', 'image')}
                               | {'duration': duration})
    if sum(s['duration'] for s in result['scenes']) > 600 + 1e-6:
        raise ValueError('Bản đầu hỗ trợ video tối đa 10 phút.')
    return result

def parse_ai(text):
    text = text.strip()
    if text.startswith('```'):
        text = text.split('\n', 1)[1].rsplit('```', 1)[0]
    return validate(json.loads(text))

def service_error(error, key):
    """Keep Google's useful explanation, redact credentials, and classify retry hints."""
    raw = error.read(65536).decode('utf-8', errors='replace')
    try:
        data = json.loads(raw).get('error', {})
        if not isinstance(data, dict): data = {}
    except (ValueError, AttributeError): data = {}
    message = str(data.get('message', '')).replace(key.strip(), '[khóa đã ẩn]')
    message = re.sub(r'AIza[\w-]+', '[khóa đã ẩn]', message)
    message = ' '.join(message.split())[:500]
    daily = any(w in raw.lower() for w in ('perday', 'per_day', 'per day', 'daily'))
    delay = 0.0
    for info in data.get('details', []) if isinstance(data.get('details'), list) else []:
        if isinstance(info, dict):
            match = re.fullmatch(r'(\d+(?:\.\d+)?)s', str(info.get('retryDelay', '')))
            if match: delay = max(delay, float(match[1]))
    retry_after = error.headers.get('Retry-After', '') if error.headers else ''
    try: delay = max(delay, float(retry_after))
    except ValueError:
        try: delay = max(delay, (parsedate_to_datetime(retry_after) - datetime.now(timezone.utc)).total_seconds())
        except (TypeError, ValueError, OverflowError): pass
    if not math.isfinite(delay): delay = 0
    explanations = {
        400: 'Yêu cầu không được Google chấp nhận; xem chi tiết bên dưới.',
        401: 'Google không chấp nhận khóa API. Kiểm tra khóa trong Cài đặt AI.',
        403: 'Tài khoản/dự án chưa được phép dùng API hoặc mô hình này. Kiểm tra quyền và thanh toán trong Google AI Studio.',
        404: 'Google không tìm thấy mô hình hoặc API này. Kiểm tra tên mô hình trong Cài đặt AI.',
        429: 'Đã hết hạn mức trong ngày.' if daily else 'Google đang giới hạn số yêu cầu hoặc hạn mức của dự án.',
        500: 'Gemini gặp lỗi máy chủ tạm thời.',
        502: 'Cổng dịch vụ Gemini tạm thời bị lỗi.',
        503: 'Gemini tạm thời không phục vụ được (máy chủ bận hoặc dịch vụ gián đoạn).',
        504: 'Dịch vụ Gemini chưa phản hồi kịp.'}
    detail = f'Gemini HTTP {error.code} · ' + explanations.get(error.code, 'Google từ chối yêu cầu.')
    if message: detail += '\nGoogle: ' + message
    return detail, delay, daily

def request_ai(key, model, body, interactions=False, cancelled=None, status=None, catalog=False, attempts=3):
    # The key never appears in a URL, a project file, or diagnostic logs.
    if not key.strip():
        raise ValueError('Nhập khóa Gemini trong Cài đặt AI trước.')
    if not model or any(c not in 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789-._' for c in model):
        raise ValueError('Tên mô hình không hợp lệ.')
    endpoint = 'models?pageSize=1000' if catalog else 'interactions' if interactions else 'models/' + model + ':generateContent'
    req = urllib.request.Request('https://generativelanguage.googleapis.com/v1beta/' + endpoint,
          data=None if catalog else json.dumps(body).encode(), headers={'Content-Type': 'application/json', 'x-goog-api-key': key.strip()})
    for attempt in range(attempts):
        if cancelled is not None and cancelled.is_set(): raise TaskCancelled('Đã hủy tác vụ AI.')
        try:
            return _perform_request(req,cancelled)
        except urllib.error.HTTPError as e:
            detail, retry_after, daily = service_error(e, key)
            e.close()
            retryable = e.code in (429, 500, 502, 503, 504) and not daily
            delay = max((2, 5, 10)[attempt], retry_after)
            if retryable and attempt < attempts-1 and delay <= 25:
                if status: status(f'Gemini HTTP {e.code} · chờ {math.ceil(delay)} giây, thử lại lần {attempt+2}/3…')
                if cancelled is not None:
                    if cancelled.wait(delay): raise TaskCancelled('Đã hủy tác vụ AI.') from None
                else: time.sleep(delay)
                continue
            if retryable and attempts>1:
                detail += ('\nĐã thử tối đa 3 lần. Hãy thử lại sau; app giữ nguyên kịch bản hiện tại.'
                           if attempt == 2 else f'\nGoogle yêu cầu chờ {math.ceil(delay)} giây. Hãy thử lại sau thời gian này.')
            raise ApiError(detail + '\nMô hình: ' + model,e.code) from None
        except urllib.error.URLError:
            raise ApiError('Không kết nối được Gemini hoặc yêu cầu đã quá thời gian chờ. Kiểm tra mạng, proxy hoặc chứng chỉ. App không tự gửi lại khi chưa rõ kết quả.') from None

def list_models(key, cancelled=None, status=None):
    result = request_ai(key, 'models', {}, catalog=True, cancelled=cancelled, status=status)
    text, tts = [], []
    for item in result.get('models', []):
        name = str(item.get('name', '')).removeprefix('models/')
        if not re.fullmatch(r'[a-zA-Z0-9._-]+', name): continue
        if 'tts' in name.lower(): tts.append(name)
        elif 'generateContent' in item.get('supportedGenerationMethods', []): text.append(name)
    if not text and not tts: raise ValueError('Google chưa trả model phù hợp. Bạn vẫn có thể nhập tên model thủ công.')
    return sorted(set(text)), sorted(set(tts))

def check_model(key, model, kind, cancelled=None):
    """A real, small request. A catalog listing alone never marks a model ready."""
    try:
        if kind=='text':
            result=request_ai(key,model,{'contents':[{'parts':[{'text':'Return only this JSON: {"ok":true}'}]}],
                'generationConfig':{'responseMimeType':'application/json','maxOutputTokens':1024}},
                cancelled=cancelled,attempts=1)
            text=''.join(p.get('text','') for c in result.get('candidates',[]) for p in c.get('content',{}).get('parts',[]) if not p.get('thought'))
            parsed=json.loads(text)
            if not isinstance(parsed,dict) or parsed.get('ok') is not True:raise ValueError('Model chưa trả đúng nội dung JSON thử.')
        elif kind=='tts':
            with tempfile.TemporaryDirectory(prefix='cinecode-model-test-') as td:
                duration=synthesize(key,'Xin chào.',Path(td)/'test.wav',model=model,cancelled=cancelled,attempts=1)
                if duration<=0:raise ValueError('Model chưa trả âm thanh có thể phát.')
                with wave.open(str(Path(td)/'test.wav'),'rb') as w:
                    if not any(w.readframes(w.getnframes())):raise ValueError('Model trả âm thanh im lặng; chưa xác nhận dùng được.')
        else:raise ValueError('Loại model không hợp lệ.')
        state,label,detail='ready','Dùng được · đã thử thành công','Đã nhận JSON hợp lệ.' if kind=='text' else 'Đã nhận và giải mã được âm thanh.'
    except ApiError as e:
        state,label={401:('denied','Khóa không hợp lệ'),403:('denied','Không có quyền / API chưa bật'),
            404:('missing','Không tìm thấy model'),429:('quota','Đang bị giới hạn / hết hạn mức'),
            500:('busy','Máy chủ lỗi tạm thời · chưa xác nhận'),502:('busy','Dịch vụ bận · chưa xác nhận'),
            503:('busy','Dịch vụ bận 503 · chưa xác nhận'),504:('busy','Dịch vụ quá thời gian chờ')}.get(e.code,('unverified','Chưa dùng được trong lần thử này'))
        detail=str(e)
    except (ValueError,KeyError,TypeError) as e:
        state,label,detail='unverified','Phản hồi chưa tương thích với app',str(e)
    if cancelled is not None and cancelled.is_set():raise TaskCancelled('Đã hủy kiểm tra model.')
    return {'model':model,'kind':kind,'state':state,'label':label,'detail':detail,'checked_at':time.strftime('%H:%M:%S')}

def fit_duration(scenes, duration):
    """Allocate whole 30fps frames, with no silent truncation of a long script."""
    target = round(duration * 30)
    if not len(scenes) * 30 <= target <= len(scenes) * 1800:
        raise ValueError('AI trả thiếu/thừa cảnh cho thời lượng yêu cầu. Hãy thử viết lại kịch bản.')
    weight = sum(s['duration'] for s in scenes)
    ticks = [max(30, min(1800, round(s['duration'] / weight * target))) for s in scenes]
    delta = target - sum(ticks)
    while delta:
        for i in range(len(ticks)):
            if delta > 0 and ticks[i] < 1800: ticks[i] += 1; delta -= 1
            elif delta < 0 and ticks[i] > 30: ticks[i] -= 1; delta += 1
            if not delta: break
    for s, frames in zip(scenes, ticks): s['duration'] = frames / 30

def generate(key, model, brief, duration, style, ratio, language='Tiếng Việt', cancelled=None, status=None):
    if not 3 <= duration <= 600: raise ValueError('Chọn thời lượng từ 3 đến 600 giây.')
    parts = math.ceil(duration / 120)
    scenes, title = [], 'Video của tôi'
    for part in range(parts):
        if cancelled is not None and cancelled.is_set(): raise TaskCancelled('Đã hủy viết kịch bản.')
        seconds = round((part+1)*duration/parts) - round(part*duration/parts)
        budget = min(8, max(3, math.ceil(seconds / 15)))
        if status: status(f'Đang viết phần {part+1}/{parts} · {seconds} giây…')
        context = json.dumps(scenes[-2:], ensure_ascii=False)
        prompt = ('Bạn là biên kịch video. Chỉ trả JSON với title và scenes. '
                  'Mỗi scene có title (ngắn), text (tối đa 20 từ), narration (lời đọc theo ngôn ngữ yêu cầu), duration (1-60 giây). '
                  f'Đây là phần {part+1}/{parts} của video tổng {duration} giây. Phần này dài {seconds} giây, '
                  f'viết từ 3 đến {budget} cảnh. Đây là phim chữ/ảnh với chuyển động đồ họa, '
                  'không tự tạo footage người thật. Không bịa nguồn hay sự kiện. '
                  'Chỉ mở đầu ở phần đầu, chỉ kết luận ở phần cuối; các phần giữa nối tiếp nội dung, không nhắc lại. '
                  'Viết title, text và narration bằng ' + language + ', kể cả tiêu đề toàn video. '
                  'Không trộn hai ngôn ngữ, dù ý tưởng đầu vào dùng ngôn ngữ khác. '
                  'Lời đọc tối đa khoảng 2 từ mỗi giây, ngắn hơn thời lượng cảnh để còn khoảng nghỉ. '
                  'Đầu vào có thể là tiêu đề hoặc kịch bản đầy đủ; nếu đã có kịch bản hãy giữ ý và thứ tự, chia thành cảnh, không bịa thêm. Nội dung yêu cầu:\n' + brief +
                  '\nHai cảnh cuối phần trước (nếu có):\n' + context)
        r = request_ai(key, model, {'contents': [{'parts': [{'text': prompt}]}],
                      'generationConfig': {'responseMimeType': 'application/json'}}, cancelled=cancelled, status=status)
        try:
            data = parse_ai(''.join(p.get('text', '') for p in r['candidates'][0]['content']['parts']))
        except (KeyError, IndexError, json.JSONDecodeError):
            raise ValueError(f'AI trả thiếu nội dung ở phần {part+1}/{parts}. Kịch bản đang mở vẫn được giữ.') from None
        if len(data['scenes']) > budget: raise ValueError('AI trả quá nhiều cảnh. Hãy thử viết lại kịch bản.')
        fit_duration(data['scenes'], seconds)
        if part == 0: title = data['title']
        scenes.extend(data['scenes'])
    return validate(dict(title=title, scenes=scenes, style=style, ratio=ratio, narrationLanguage=language,videoLanguage=language))

def synthesize(key, text, path, voice='Kore', language='Tiếng Việt', model='gemini-3.8-flash-tts', cancelled=None, status=None, attempts=3):
    instruction = 'Read naturally and clearly in English.' if language == 'English' else 'Đọc tiếng Việt tự nhiên, rõ ràng.'
    if not model.startswith('gemini-2.5-'):
        r = request_ai(key, model, {'model': model, 'input': [{'type': 'user_input', 'content': [
            {'type': 'text', 'text': text, 'annotations': [{'type': 'speech_metadata', 'style': instruction}]}]}],
            'response_format': {'type': 'audio'}, 'generation_config': {'speech_config': [{'voice': voice}]}}, interactions=True, cancelled=cancelled, status=status,attempts=attempts)
        blocks = [c for step in r.get('steps', []) if step.get('type') == 'model_output'
                  for c in step.get('content', []) if c.get('type') == 'audio']
        if not blocks: raise ValueError('Gemini chưa trả âm thanh. Kiểm tra mô hình TTS và quyền truy cập.')
        audio = base64.b64decode(blocks[-1]['data'], validate=True)
        ffmpeg = executable('ffmpeg')
        if not ffmpeg: raise RuntimeError('Thiếu FFmpeg để xử lý lời đọc.')
        p = subprocess.run([ffmpeg, '-hide_banner', '-loglevel', 'error', '-y', '-i', 'pipe:0',
                            '-ac', '1', '-ar', '24000', '-c:a', 'pcm_s16le', str(path)],
                           input=audio, capture_output=True, creationflags=getattr(subprocess,'CREATE_NO_WINDOW',0))
        if p.returncode: raise ValueError('Không giải mã được lời đọc từ Gemini.')
        with wave.open(str(path),'rb') as w: return w.getnframes()/w.getframerate()
    r = request_ai(key, model, {
        'contents': [{'parts': [{'text': ('Read naturally and clearly in English:\n' if language == 'English'
                                        else 'Đọc tiếng Việt tự nhiên, rõ ràng:\n') + text}]}],
        'generationConfig': {'responseModalities': ['AUDIO'], 'speechConfig': {
            'voiceConfig': {'prebuiltVoiceConfig': {'voiceName': voice}}}}}, cancelled=cancelled, status=status,attempts=attempts)
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

def copy_video(source, destination):
    source, destination = Path(source), Path(destination)
    if not source.is_file(): raise ValueError('Video không còn ở vị trí đã xuất. Hãy xuất lại hoặc tìm file bạn đã chuyển.')
    if source.resolve() == destination.resolve(): return destination
    with tempfile.NamedTemporaryFile(dir=destination.parent, prefix='.cinecode-copy-', delete=False) as f:
        temporary=Path(f.name)
    try:
        shutil.copy2(source,temporary)
        temporary.replace(destination)
    finally: temporary.unlink(missing_ok=True)
    return destination

def create_narration(data,key,path,folder,model,cancelled,status=None,strict_duration=False,writing_model=None):
    data=copy.deepcopy(validate(data));folder=Path(folder);folder.mkdir(parents=True,exist_ok=True)
    if not any(s['narration'].strip() for s in data['scenes']):raise ValueError('Kịch bản chưa có lời đọc.')
    temporary=Path(path).with_name(Path(path).stem+'.working.wav')
    try:
        with wave.open(str(temporary),'wb') as out:
            out.setnchannels(1);out.setsampwidth(2);out.setframerate(24000)
            for i,scene in enumerate(data['scenes']):
                if cancelled.is_set():raise TaskCancelled('Đã hủy tạo lời đọc.')
                if status:status(f'Đang tạo lời đọc cảnh {i+1}/{len(data["scenes"])}…')
                pcm=b''
                if scene['narration'].strip():
                    part=folder/f'voice-{i}.wav'
                    length=synthesize(key,scene['narration'],part,model=model,language=data['narrationLanguage'],cancelled=cancelled,status=status)
                    if strict_duration and length>scene['duration']*1.22 and writing_model:
                        if status:status(f'Đang rút gọn lời đọc cảnh {i+1} cho vừa thời lượng…')
                        response=request_ai(key,writing_model,{'contents':[{'parts':[{'text':
                            f'Shorten this narration to at most {max(2,int(scene["duration"]*1.5))} words. Keep its meaning and language. Return JSON {{"narration":"..."}} only.\n'+scene['narration']}]}],
                            'generationConfig':{'responseMimeType':'application/json'}},cancelled=cancelled,status=status)
                        text=''.join(p.get('text','') for p in response['candidates'][0]['content']['parts'])
                        shorter=json.loads(text).get('narration','').strip()
                        if not shorter:raise ValueError('AI chưa rút gọn được lời đọc.')
                        scene['narration']=shorter
                        length=synthesize(key,shorter,part,model=model,language=data['narrationLanguage'],cancelled=cancelled,status=status)
                    if strict_duration and length>scene['duration']-.1:
                        factor=length/max(.5,scene['duration']-.1)
                        if factor>1.25:raise ValueError(f'Lời đọc cảnh {i+1} còn quá dài cho thời lượng. Dự án đã được giữ để chỉnh tiếp.')
                        if factor>1:
                            adjusted=folder/f'voice-{i}-fit.wav'
                            run_command([executable('ffmpeg'),'-hide_banner','-nostdin','-y','-i',str(part),'-af',f'atempo={factor}',
                                '-ac','1','-ar','24000','-c:a','pcm_s16le',str(adjusted)],folder/f'voice-{i}-fit.log',cancelled)
                            part=adjusted
                    with wave.open(str(part),'rb') as w:
                        pcm=w.readframes(w.getnframes())
                    if not strict_duration:scene['duration']=max(scene['duration'],len(pcm)/48000+.3)
                if scene['duration']>60:raise ValueError('Lời đọc quá dài. Hãy chia thành nhiều cảnh.')
                frames=round(scene['duration']*24000)
                if len(pcm)>frames*2:raise ValueError('Lời đọc còn dài hơn cảnh; hãy rút gọn trước khi xuất.')
                out.writeframes(pcm+b'\0'*(frames*2-len(pcm)))
        data=validate(data)
        if cancelled.is_set():raise TaskCancelled('Đã hủy tạo lời đọc.')
        temporary.replace(path);data['voice']=str(path)
        return data
    finally:temporary.unlink(missing_ok=True)

def automatic_video(key,writing_model,tts_model,brief,duration,style,ratio,language,output,cancelled,status=None,music=''):
    if cancelled.is_set():raise TaskCancelled('Đã hủy tác vụ tự động.')
    output=Path(output)
    folder=Path(tempfile.mkdtemp(prefix=output.stem+'-project-',dir=output.parent))
    try:
        (folder/'brief.txt').write_text(brief,encoding='utf-8')
        project=folder/'project.cinecode.json'
        if status:status('Bước 1/3 · Viết kịch bản và chia cảnh…')
        data=generate(key,writing_model,brief,duration,style,ratio,language,cancelled,status)
        data['music']=music;save_project(project,data)
        if status:status('Bước 2/3 · Tạo lời đọc…')
        data=create_narration(data,key,folder/'narration.wav',folder,tts_model,cancelled,status,
                              strict_duration=True,writing_model=writing_model)
        save_project(project,data)
        if status:status('Bước 3/3 · Dựng hình và xuất MP4…')
        render(data,folder,output,cancelled,status or (lambda s:None))
        if cancelled.is_set():raise TaskCancelled('Đã hủy tác vụ tự động.')
        return {'data':data,'project':str(project),'output':str(output)}
    except TaskCancelled:raise
    except Exception as e:
        raise RuntimeError(str(e)+'\nDự án/nội dung đã lưu tại: '+str(folder)) from None

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
               '--status', str(folder / 'progress.json'), '--workers', '1', '--format', 'jpeg']
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
        # Some FFmpeg builds emit non-finite samples when normalizing complete silence.
        finite="aeval=exprs='if(isnan(val(ch))+isinf(val(ch)),0,val(ch))':c=same"
        filters.append(tracks + f'amix=inputs={len(inputs)}:normalize=0,loudnorm=I=-14:TP=-1.5:LRA=9,'+finite+',aresample=48000[a]')
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
