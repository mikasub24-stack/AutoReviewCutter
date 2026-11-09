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
_agent_version_cache={}
CLAUDE_DESKTOP='Claude Desktop (Code)'

def agent_settings_path():
    return Path(os.environ.get('LOCALAPPDATA',Path.home()))/'CinecodeStudio/agents.json'

def saved_claude_path():
    try:return str(json.loads(agent_settings_path().read_text(encoding='utf-8')).get('claudeCode',''))
    except (OSError,ValueError,AttributeError):return ''

def saved_agent_settings():
    try:
        data=json.loads(agent_settings_path().read_text(encoding='utf-8'))
        return data if isinstance(data,dict) else {}
    except (OSError,ValueError):return {}

def _save_agent_path(field,path,preferred):
    target=agent_settings_path();target.parent.mkdir(parents=True,exist_ok=True)
    data=saved_agent_settings();data[field]=os.path.abspath(os.fspath(path));data['preferredAgent']=preferred
    temporary=target.with_suffix('.tmp');temporary.write_text(json.dumps(data,ensure_ascii=False,indent=2),encoding='utf-8');temporary.replace(target)
    return data[field]

def _claude_prefix(path):
    path=Path(path)
    if not path.is_file():return None
    parts=[part.lower() for part in path.parts]
    if 'anthropicclaude' in parts and not any(part in ('claude-code','native-binary') for part in parts):return None
    if path.parent.name.lower()=='windowsapps' and path.name.lower()=='claude.exe':return None
    if path.parent.name.lower()=='claude' and path.parent.parent.name.lower()=='programs':return None
    if any(word in path.name.lower() for word in ('setup','installer')):return None
    if path.name.lower()=='cli.js':return [core.executable('node') or 'node',str(path)]
    if path.suffix.lower() in ('.exe',''):return [str(path)]
    if path.suffix.lower() in ('.cmd','.bat'):
        package=path.parent/'node_modules/@anthropic-ai/claude-code'
        for native in (package/'bin/claude.exe',package/'cli.exe'):
            if native.is_file():return [str(native)]
        script=package/'cli.js'
        if script.is_file():return [core.executable('node') or 'node',str(script)]
    return None

def claude_version(command):
    signature=tuple((str(p),Path(p).stat().st_mtime_ns,Path(p).stat().st_size) for p in command if Path(p).is_file())
    cache=(tuple(command),signature)
    if cache in _agent_version_cache:return _agent_version_cache[cache]
    try:
        result=subprocess.run([*command,'--version'],capture_output=True,text=True,encoding='utf-8',errors='replace',timeout=6,
                              creationflags=getattr(subprocess,'CREATE_NO_WINDOW',0))
    except (OSError,subprocess.TimeoutExpired):return None
    text=(result.stdout+'\n'+result.stderr).strip()
    if result.returncode or 'claude code' not in text.lower():return None
    version=' '.join(text.split())[:180];_agent_version_cache[cache]=version
    return version

def claude_candidates():
    home=Path.home();roaming=Path(os.environ.get('APPDATA',home/'AppData/Roaming'));local=Path(os.environ.get('LOCALAPPDATA',home/'AppData/Local'))
    candidates=[saved_claude_path(),shutil.which('claude.exe'),shutil.which('claude'),
                home/'.local/bin/claude.exe',roaming/'npm/claude.cmd',
                local/'Microsoft/WinGet/Links/claude.exe',local/'Programs/ClaudeCode/claude.exe',
                Path(os.environ.get('ProgramFiles',r'C:\Program Files'))/'ClaudeCode/claude.exe']
    for root in (home/'.vscode/extensions',home/'.cursor/extensions',home/'.vscode-insiders/extensions'):
        if root.is_dir():
            for extension in sorted(root.glob('anthropic.claude-code-*'),reverse=True)[:6]:
                candidates.extend([extension/'resources/native-binary/claude.exe',extension/'resources/claude-code/cli.js'])
    winget=local/'Microsoft/WinGet/Packages'
    if winget.is_dir():
        for package in winget.glob('Anthropic.ClaudeCode*'):
            candidates.extend([package/'claude.exe',package/'bin/claude.exe'])
    desktop=local/'AnthropicClaude'
    if desktop.is_dir():
        for version in sorted(desktop.glob('app-*'),reverse=True)[:4]:
            candidates.extend([version/'resources/claude-code/cli.js',version/'resources/claude-code/bin/claude.exe',
                               version/'resources/app.asar.unpacked/node_modules/@anthropic-ai/claude-code/bin/claude.exe'])
    seen=set()
    for candidate in filter(None,candidates):
        value=str(candidate)
        if value.lower() not in seen:seen.add(value.lower());yield Path(value)

def choose_claude(path):
    prefix=_claude_prefix(path)
    if prefix is None:raise ValueError('Chọn file Claude Code đã cài (claude.exe hoặc claude.cmd). File Claude Desktop hoặc bộ cài không phải CLI cần dùng.')
    version=claude_version(prefix)
    if not version:raise ValueError('File này chưa được xác nhận là Claude Code qua --version. Đường dẫn chưa được lưu. Hãy chọn đúng CLI, không chọn app chat Desktop hoặc bộ cài.')
    selected=_save_agent_path('claudeCode',path,'Claude Code')
    return {'path':selected,'version':version}

def choose_desktop(path):
    path=Path(path)
    if not path.is_file() or path.suffix.lower()!='.exe' or 'claude' not in path.name.lower() or any(w in path.name.lower() for w in ('setup','installer')):
        raise ValueError('Chọn file Claude Desktop đã cài (Claude.exe), không chọn bộ cài.')
    return {'path':_save_agent_path('claudeDesktop',path,CLAUDE_DESKTOP),'version':'Claude Desktop; mở chế độ Code trong ứng dụng'}

def desktop_command():
    local=Path(os.environ.get('LOCALAPPDATA',Path.home()/'AppData/Local'))
    candidates=[saved_agent_settings().get('claudeDesktop'),local/'AnthropicClaude/claude.exe',local/'Programs/Claude/Claude.exe']
    root=local/'AnthropicClaude'
    if root.is_dir():candidates.extend(path/'claude.exe' for path in sorted(root.glob('app-*'),reverse=True))
    for candidate in filter(None,candidates):
        path=Path(candidate)
        if path.is_file():return [str(path)]
    raise RuntimeError('Chưa dò được Claude Desktop trong thư mục cài đặt phổ biến. Nếu dùng Claude Code CLI, chọn file claude.exe/claude.cmd đã cài.')

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
    if agent==CLAUDE_DESKTOP:return desktop_command()
    if agent=='Claude Code':
        for path in claude_candidates():
            prefix=_claude_prefix(path)
            if prefix and claude_version(prefix):return prefix
        raise RuntimeError('Chưa dò được Claude Code CLI. Nếu đã cài, bấm Chọn Claude Code đã cài để trỏ tới file, không cần cài lại. Vị trí thường gặp: %USERPROFILE%\\.local\\bin\\claude.exe hoặc %APPDATA%\\npm\\claude.cmd; bản extension nằm trong .vscode/extensions hoặc .cursor/extensions.')
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
        command+=['auth','login'] if login else ['/cinecode Read STATE.md first and resume existing work. Read .cinecode-ui/START-HERE.md and follow the user brief. Do not restart an existing film unless requested. Respond in Vietnamese. Use the original Cinecode workflow and tools.']
    elif agent=='Cursor':command += [str(project),'--goto',str(project/'.cinecode-ui/START-HERE.md')]
    return subprocess.Popen(command,cwd=project,env=environment(pro=agent.startswith('Claude')),
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

def connect_existing_project(project,agent):
    project=Path(project)
    if not (project/'STATE.md').is_file():raise ValueError('Dự án gốc cần có STATE.md.')
    skill=project/('.cursor' if agent=='Cursor' else '.claude')/'skills/cinecode'
    if not skill.exists():shutil.copytree(KIT,skill)
    control=project/'.cinecode-ui';control.mkdir(exist_ok=True)
    task=control/'START-HERE.md'
    if not task.exists():task.write_text('Tiếp tục dự án Cinecode gốc này từ STATE.md. Giữ nguyên kịch bản, cảnh, style và các phần đã được người dùng duyệt. Dùng skill cinecode đầy đủ. Hỏi người dùng bằng tiếng Việt nếu thiếu thông tin bắt buộc. Không tự khởi tạo lại phim.',encoding='utf-8')

def create_project(parent,brief,mode,route,duration,language,agent,pace,music,attachments=()):
    parent=Path(parent);parent.mkdir(parents=True,exist_ok=True)
    project=parent/slug(brief)
    if project.exists():project=parent/(slug(brief)+'-'+time.strftime('%Y%m%d-%H%M%S'))
    if project.exists():raise RuntimeError('Thư mục dự án đã tồn tại. Hãy chọn tên khác.')
    args=[python_runtime(),str(KIT/'scripts/init_film.py'),str(project),'--title',brief.splitlines()[0][:160]]
    if mode=='Quick':args.append('--quick')
    run=subprocess.run(args,env=environment(),capture_output=True,text=True,encoding='utf-8',errors='replace',creationflags=getattr(subprocess,'CREATE_NO_WINDOW',0))
    if run.returncode:raise RuntimeError('Không khởi tạo được dự án gốc:\n'+(run.stderr+run.stdout)[-2000:])
    skill=project/('.cursor' if agent=='Cursor' else '.claude')/'skills/cinecode'
    shutil.copytree(KIT,skill)
    media=[]
    destination=project/'assets/user-media';destination.mkdir(parents=True,exist_ok=True)
    for number,source in enumerate(attachments,1):
        source=Path(source)
        if not source.is_file():raise ValueError('Không tìm thấy tài liệu: '+str(source))
        target=destination/f'{number:02}-{source.name}';shutil.copy2(source,target)
        media.append(target.relative_to(project).as_posix())
    control=project/'.cinecode-ui';control.mkdir(exist_ok=True)
    settings={'mode':mode,'route':route,'duration':duration,'language':language,'agent':agent,'pace':pace,'music':music,'attachments':media,'brief':brief,
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
    for agent in ('Claude Code',CLAUDE_DESKTOP,'Cursor'):
        try:
            command=agent_command(agent);lines.append(agent+': '+' | '.join(command))
            if agent=='Claude Code':lines.append('Phiên bản CLI: '+str(claude_version(command)))
        except RuntimeError:lines.append(agent+': chưa tìm thấy')
    selected=saved_claude_path()
    if selected:lines.append('Đường dẫn CLI đã lưu: '+selected)
    lines.append('Vị trí CLI phổ biến: %USERPROFILE%\\.local\\bin hoặc %APPDATA%\\npm; extension: .vscode/extensions, .cursor/extensions.')
    return '\n'.join(lines)
