"""Generate and journal one native Hunyuan T2V portrait before video sampling."""
from pathlib import Path
import secrets
import shutil
import uuid


def ensure(project, data, client, models, cancelled, notify, width, height, profile=None):
    """Create one frame, not a 121-frame T2V clip. Caller must hold project lock."""
    import engine
    import hunyuan
    project = Path(project)
    target = project / 'nhan-vat-goc.png'
    if target.is_file():
        notify({'type': 'portrait', 'image': str(target)})
        return target
    if any(scene.get('prompt_id') or scene.get('request_marker') for scene in data.get('scenes', [])):
        raise RuntimeError('Còn tác vụ cảnh cũ đang chờ; chưa tạo ảnh nhân vật khác cho dự án này.')
    if cancelled.is_set(): raise engine.Cancelled('Đã tạm dừng trước khi tạo ảnh nhân vật.')
    request = data.setdefault('portrait_request', {'seed': secrets.randbits(48)})
    request.setdefault('seed', secrets.randbits(48))
    save = lambda: engine.atomic_json(project / 'project.json', data)
    notify('Tạo ảnh nhân vật mới · Hunyuan T2V 1 khung hình, chưa tạo clip 121 khung.')
    if not request.get('prompt_id'):
        if request.get('request_marker'):
            recovered = client.find_request(request['request_marker'])
            if not recovered:
                raise RuntimeError('Lần gửi ảnh nhân vật trước chưa xác định đã được nhận. Kiểm tra hàng đợi rồi dùng Tạo lại cảnh lỗi nếu tác vụ đã mất.')
            request['prompt_id'] = recovered
            save()
        else:
            prompt = (engine.CHARACTER + ' Photorealistic documentary still image. '
                      'Medium waist-up shot, front three-quarter view. Her complete face is large, '
                      'clearly visible and sharply in focus, natural eyes, realistic skin detail. '
                      'She stands still outside a small one-story brick cottage with a green door, '
                      'pine trees in the background, soft natural daylight. The same black gym outfit '
                      'is clearly visible. Stable composition, natural proportions, no text or watermark.')
            scene = {'prompt': prompt, 'seed': request['seed']}
            workflow = hunyuan.graph(scene, models, prefix=f'HunyuanLocal/{data["id"]}/portrait',
                                     steps=50, width=width, height=height, frames=1)
            engine.atomic_json(project / 'workflow-nhan-vat.json', workflow)
            request['request_marker'] = uuid.uuid4().hex
            save()  # Persist before the non-idempotent POST.
            result = client.request('/prompt', {'prompt': workflow, 'client_id': data['id'],
                                    'extra_data': {'hunyuanlocal_request': request['request_marker']}})
            if result.get('error') or result.get('node_errors'):
                request.pop('request_marker', None)
                save()
                raise RuntimeError('ComfyUI không nhận workflow ảnh nhân vật: ' + str(result)[-3000:])
            request['prompt_id'] = result['prompt_id']
            save()
    try:
        frames = client.wait(request['prompt_id'], cancelled, lambda text: notify(dict(text,status='Ảnh nhân vật · '+text['status']) if isinstance(text,dict) else 'Ảnh nhân vật · '+str(text)))
    except engine.Cancelled:
        queue = client.request('/queue')
        record = client.request('/history/' + request['prompt_id'])
        active = queue.get('queue_running', []) + queue.get('queue_pending', [])
        if not record and not any(item[1] == request['prompt_id'] for item in active):
            request.pop('prompt_id', None)
            request.pop('request_marker', None)
            save()
        raise
    if len(frames) != 1:
        raise RuntimeError(f'Model ảnh nhân vật trả {len(frames)} khung, cần đúng 1 khung.')
    if cancelled.is_set(): raise engine.Cancelled('Đã tạm dừng trước khi nhận ảnh nhân vật; tác vụ được lưu để tiếp tục.')
    temporary = project / 'nhan-vat-pending.png'
    client.download(frames[0], temporary)
    if engine.png_dimensions(temporary) != (width, height):
        temporary.unlink(missing_ok=True)
        raise RuntimeError(f'Ảnh nhân vật không đúng {width}×{height}; chưa dùng làm tham chiếu.')
    temporary.replace(target)
    request['image_sha256'] = engine.digest(target)
    request['completed'] = True
    save()
    if profile is not None:
        profile = Path(profile)
        profile.mkdir(parents=True, exist_ok=True)
        # Another completed Hunyuan profile is not overwritten.
        if not (profile / 'reference.png').exists():
            staged = profile / ('reference-' + uuid.uuid4().hex + '.tmp')
            try:
                shutil.copy2(target, staged)
                staged.replace(profile / 'reference.png')
            finally:
                staged.unlink(missing_ok=True)
            engine.atomic_json(profile / 'profile.json', {'description': data.get('character', engine.CHARACTER),
                               'sha256': request['image_sha256'], 'source_project': str(project),
                               'identity_guaranteed': False, 'generator': 'HunyuanVideo 1.5 T2V single frame'})
    notify({'type': 'portrait', 'image': str(target)})
    notify('Đã tạo và lưu ảnh nhân vật mới; chuyển sang I2V để tạo video.')
    return target
