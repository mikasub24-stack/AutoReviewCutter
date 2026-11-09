"""Exercise original project initialization and the actual Three.js engine, not the legacy template."""
from pathlib import Path
import subprocess
import sys
import tempfile
sys.path.insert(0,str(Path(__file__).resolve().parents[1]))
import core
import upstream

with tempfile.TemporaryDirectory(prefix='cinecode-original-') as td:
    project=upstream.create_project(td,'Original engine test','Film','Phim / hoạt hình','4 giây','English','Claude Code','Duyệt từng giai đoạn','Không nhạc')
    command=[core.executable('node'),str(project/'tools/capture.mjs'),'--url',str(project/'engine/scene.html'),
             '--frames','0,24','--out',str(project/'review/original-3d'),'--format','jpeg',
             '--params','w=480&h=270&samples=1','--flags','--use-angle=swiftshader --enable-unsafe-swiftshader']
    process=subprocess.run(command,cwd=project,env=upstream.environment(),capture_output=True,text=True,encoding='utf-8',errors='replace')
    if process.returncode:
        detail=(process.stdout+process.stderr)[-7000:].replace('%','%25').replace('\r','%0D').replace('\n','%0A')
        print('::error title=Original Three.js engine::'+detail)
        raise SystemExit(1)
    assert 'three.js r' in process.stdout,process.stdout
    assert len(list((project/'review/original-3d').glob('*.jpg')))==2
    print('Original Film project, native tool files and Three.js lighting/camera render PASS')
