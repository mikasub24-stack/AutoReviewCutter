"""Desktop orchestration of the original toolkit and the user's own coding agent."""
import hashlib
import json
import os
from pathlib import Path
import re
import shutil
import subprocess
import sys
import time
import core

KIT=core.ROOT/'vendor/cinecode'

def python_runtime():
    bundled=core.ROOT/'runtime/python/python.exe'
    if bundled.is_file():return str(bundled)
    if not getattr(sys,'frozen',False):return sys.executable
    raise RuntimeError('Thiếu Python runtime của bộ cài đầy đủ.')

def environment(pro=False):
    env=os.environ.copy()
    env['PATH']=str(core.ROOT/'runtime')+os.pathsep+str(Path(python_runtime()).parent)+os.pathsep+env.get('PATH','')
    env['PYTHONUTF8']='1';env['PYTHONIOENCODING']='utf-8'
    env.pop('PYTHONHOME',None);env.pop('PYTHONPATH',None)
    if pro:
        for name in ('ANTHROPIC_API_KEY','ANTHROPIC_AUTH_TOKEN','ANTHROPIC_BASE_URL'):env.pop(name,None)
    return env

def agent_command(agent='Claude Code'):
    if agent=='Claude Code':
        candidates=[shutil.which('claude.exe'),shutil.which('claude'),str(Path.home()/'.local/bin/claude.exe')]
        for candidate in filter(None,candidates):
            path=Path(candidate)
            if not path.is_file():continue
            if path.suffix.lower() in ('.exe',''):return [str(path)]
            if path.suffix.lower() in ('.cmd','.bat'):
                package=path.parent/'node_modules/@anthropic-ai/claude-code'
                for native in (package/'bin/claude.exe',package/'cli.exe'):
                    if native.is_file():return [str(native)]
                script=package/'cli.js'
                if script.is_file():return [core.executable('node') or 'node',str(script)]
        raise RuntimeError('Chưa tìm thấy Claude Code. Cài Claude Code chính thức và đăng nhập tài khoản Pro/Max, rồi mở lại app.')
    candidates=[shutil.which('cursor.exe'),str(Path(os.environ.get('LOCALAPPDATA',Path.home()))/'Programs/cursor/Cursor.exe')]
    shim=shutil.which('cursor')
    if shim:
        path=Path(shim)
        if path.suffix.lower()=='.exe':candidates.insert(0,str(path))
        elif len(path.parents)>3:candidates.append(str(path.parents[3]/'Cursor.exe'))
    for candidate in filter(None,candidates):
        if Path(candidate).is_file():return [candidate]
    raise RuntimeError('Chưa tìm thấy Cursor. Cài Cursor chính thức rồi mở lại app.')

def launch_agent(project,agent='Claude Code',login=False):
    project=Path(project).resolve()
    command=agent_command(agent)
    if agent=='Claude Code':
        command+=['auth','login'] if login else ['/cinecode Read .cinecode-ui/START-HERE.md and follow the user brief. Respond in Vietnamese. Use the original Cinecode workflow and tools.']
    else:command += [str(project),'--goto',str(project/'.cinecode-ui/START-HERE.md')]
    return subprocess.Popen(command,cwd=project,env=environment(pro=agent=='Claude Code'),
        creationflags=getattr(subprocess,'CREATE_NEW_CONSOLE',0))

def stop_agent(process):
    if process is None or process.poll() is not None:return
    if os.name=='nt':
        subprocess.run(['taskkill','/PID',str(process.pid),'/T','/F'],capture_output=True,creationflags=getattr(subprocess,'CREATE_NO_WINDOW',0))
    else:process.terminate()
    process.wait(timeout=5)

def slug(text):
    text=re.sub(r'[<>:"/\\|?*\x00-\x1f]','-',text.splitlines()[0] if text.strip() else 'Film').strip(' .')[:75]
    if not text or text.upper().split('.')[0] in ('CON','PRN','AUX','NUL') or re.fullmatch(r'(COM|LPT)[1-9]',text,re.I):text='Film-'+text
    return text

def create_project(parent,brief,mode,route,duration,language,agent,pace,music,attachments=()):
    parent=Path(parent);parent.mkdir(parents=True,exist_ok=True)
    project=parent/slug(brief)
    if project.exists():project=parent/(slug(brief)+'-'+time.strftime('%Y%m%d-%H%M%S'))
    if project.exists():raise RuntimeError('Thư mục dự án đã tồn tại. Hãy chọn tên khác.')
    args=[python_runtime(),str(KIT/'scripts/init_film.py'),str(project),'--title',brief.splitlines()[0][:160]]
    if mode=='Quick':args.append('--quick')
    run=subprocess.run(args,env=environment(),capture_output=True,text=True,encoding='utf-8',errors='replace',creationflags=getattr(subprocess,'CREATE_NO_WINDOW',0))
    if run.returncode:raise RuntimeError('Không khởi tạo được dự án gốc:\n'+(run.stderr+run.stdout)[-2000:])
    skill=project/('.claude' if agent=='Claude Code' else '.cursor')/'skills/cinecode'
    shutil.copytree(KIT,skill)
    media=[]
    destination=project/'assets/user-media';destination.mkdir(parents=True,exist_ok=True)
    for number,source in enumerate(attachments,1):
        source=Path(source)
        if not source.is_file():raise ValueError('Không tìm thấy tài liệu: '+str(source))
        target=destination/f'{number:02}-{source.name}';shutil.copy2(source,target)
        media.append(target.relative_to(project).as_posix())
    control=project/'.cinecode-ui';control.mkdir(exist_ok=True)
    settings={'mode':mode,'route':route,'duration':duration,'language':language,'agent':agent,'pace':pace,'music':music,'attachments':media,
              'upstreamCommit':'67f9807112b97ae253d4a5f0eccaccc46c3b2633'}
    (control/'project.json').write_text(json.dumps(settings,ensure_ascii=False,indent=2),encoding='utf-8')
    task=f'''# Yêu cầu làm phim của người dùng

Bạn đang chạy Cinecode gốc. Đọc skill cinecode, STATE.md và các tài liệu mà skill chỉ dẫn. Giữ đầy đủ công cụ, thư viện style, camera, ánh sáng, mã cảnh, âm thanh, dựng phim và QC gốc. Không thay tác phẩm bằng bộ thẻ chữ hoặc nền mẫu lặp lại.

## Thông số người dùng đã chọn
- Mode: {mode}
- Loại video: {route}
- Thời lượng mong muốn: {duration}
- Ngôn ngữ tiêu đề/chữ/lời đọc: {language}
- Tiến độ: {pace}
- Nhạc: {music}
- Tài liệu/file của người dùng: {json.dumps(media,ensure_ascii=False)}

## Nội dung đầu vào
{brief}

## Cách làm
Giao diện chỉ là lớp điều khiển, không giới hạn cách dựng. Viết mã cảnh mới theo nội dung và chọn kỹ thuật từ toolkit gốc; 2D, 3D, ánh sáng, camera và thiết kế âm thanh theo nhu cầu của phim. Dùng make.py/qc.py và các bước kiểm tra gốc. Khi có lỗi hãy đọc log và sửa đúng cảnh, không hạ về template đơn giản.

Nếu chọn tự động, người dùng yêu cầu làm tiếp đến MP4 và cho phép chọn mặc định cho các quyết định thẩm mỹ chưa nêu; ghi lại các lựa chọn. Vẫn dừng khi thiếu thông tin bắt buộc, cần dịch vụ tính phí chưa được cho phép hoặc cần người dùng xử lý đăng nhập/quyền. Không bịa việc người dùng đã xem hay duyệt bản nháp.

Claude Pro/Max được dùng qua đăng nhập Claude Code, không tự dùng Anthropic API key. Dịch vụ TTS, tạo ảnh/video bên ngoài có tài khoản/hạn mức riêng: chỉ dùng nếu người dùng đã cung cấp/cho phép. Không tự mua dịch vụ. Không tự đăng hoặc gửi phim cho ai.

Khi hoàn tất, đặt MP4 và credits trong thư mục dự án đúng quy trình gốc, ghi đường dẫn vào STATE.md. Giao diện sẽ nhận các MP4 đó để mở/tải. Trả lời và hỏi người dùng bằng tiếng Việt; nội dung phim dùng ngôn ngữ đã chọn.
'''
    (control/'START-HERE.md').write_text(task,encoding='utf-8')
    return project

def tool_command(project,name,args):
    project=Path(project).resolve()
    if name not in ('make.py','qc.py','scene_check.py','validate_shots.py','animatic.py','mix.py','master_audio.py','beat_grid.py','lyrics_align.py','voice_treat.py'):
        raise ValueError('Công cụ không được gọi từ nút giao diện này.')
    script=project/'tools'/name;original=KIT/'scripts'/name
    if not script.is_file():raise ValueError('Dự án chưa có tools/'+name)
    # make.py imports sibling helpers and launches capture.mjs; check that chain too.
    for local in (project/'tools').rglob('*'):
        if local.is_file() and local.suffix.lower() in ('.py','.mjs','.js','.cjs'):
            relative=local.relative_to(project/'tools')
            expected=KIT/'scripts'/relative
            if relative.as_posix()=='type.mjs':expected=KIT/'starter/type.mjs'
            if not expected.is_file() or local.is_symlink() or hashlib.sha256(local.read_bytes()).digest()!=hashlib.sha256(expected.read_bytes()).digest():
                raise ValueError('Công cụ trong dự án đã được chỉnh khác bản gốc: '+str(relative)+'. Hãy mở agent để kiểm tra trước khi chạy.')
    return [python_runtime(),str(script),*args]

def run_step(project,step,cancelled,status):
    project=Path(project)
    command=tool_command(project,'make.py',[step])
    log=project/'logs'/f'desktop-{step}.log';log.parent.mkdir(exist_ok=True)
    status('Đang chạy make.py '+step+' của Cinecode gốc…')
    with log.open('w',encoding='utf-8') as output:
        process=subprocess.Popen(command,cwd=project,env=environment(),stdout=output,stderr=subprocess.STDOUT,creationflags=getattr(subprocess,'CREATE_NO_WINDOW',0))
        while process.poll() is None:
            if cancelled.wait(.2):
                if os.name=='nt':subprocess.run(['taskkill','/PID',str(process.pid),'/T','/F'],capture_output=True,creationflags=getattr(subprocess,'CREATE_NO_WINDOW',0))
                else:process.terminate()
                process.wait();raise core.TaskCancelled('Đã hủy bước dựng phim.')
        if process.returncode:
            raise RuntimeError('Công cụ gốc chưa hoàn tất. Mở agent để sửa theo log:\n'+str(log)+'\n'+log.read_text(encoding='utf-8',errors='replace')[-1600:])
    return project

def outputs(project):
    return sorted(Path(project).glob('*.mp4'),key=lambda p:p.stat().st_mtime,reverse=True)

def diagnostics():
    lines=[]
    for name in ('node','ffmpeg','ffprobe'):
        path=core.executable(name);lines.append(name+': '+(path or 'THIẾU'))
    try:lines.append('Python: '+python_runtime())
    except RuntimeError as e:lines.append(str(e))
    for agent in ('Claude Code','Cursor'):
        try:lines.append(agent+': '+agent_command(agent)[0])
        except RuntimeError:lines.append(agent+': chưa tìm thấy')
    return '\n'.join(lines)
