"""Record the actual binaries and pinned dependencies, without user data or secrets."""
import hashlib
import importlib.metadata
import json
import os
from pathlib import Path
import subprocess
import sys

root=Path(sys.argv[1]).resolve()
files=[]
for p in sorted(root.rglob('*')):
    if p.is_file() and p.name!='BuildManifest.json':
        with p.open('rb') as file: digest=hashlib.file_digest(file,'sha256').hexdigest()
        files.append({'path':p.relative_to(root).as_posix(),'bytes':p.stat().st_size,
                      'sha256':digest})
manifest={'version':'0.2.1','sourceCommit':os.environ.get('GITHUB_SHA','local'),
          'sourceRepository':'https://github.com/mikasub24-stack/AutoReviewCutter',
          'python':sys.version,'packager':'PyInstaller '+importlib.metadata.version('pyinstaller'),
          'upx':False,'onefile':False,'authenticode':'NotSigned; no publisher certificate configured',
          'browserReputation':'Not verified. Defender results do not establish a browser verdict.',
          'node':subprocess.check_output([str(root/'_internal/runtime/node.exe'),'--version'],text=True).strip(),
          'ffmpeg':subprocess.check_output([str(root/'_internal/runtime/ffmpeg.exe'),'-version'],text=True).splitlines()[0],
          'dependencies':{name:importlib.metadata.version(name) for name in
                          ['pyinstaller','imageio-ffmpeg','customtkinter','Pillow','darkdetect','packaging','pefile','pywin32-ctypes']},
          'files':files}
(root/'BuildManifest.json').write_text(json.dumps(manifest,ensure_ascii=False,indent=2),encoding='utf-8')
