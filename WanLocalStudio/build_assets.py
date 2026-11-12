"""Small build assets and a reproducible list of shipped file hashes."""
import hashlib
import importlib.metadata
import json
import os
from pathlib import Path
import sys

if '--manifest' in sys.argv:
    root=Path(sys.argv[-1])
    files={str(p.relative_to(root)).replace('\\','/'):hashlib.sha256(p.read_bytes()).hexdigest()
           for p in root.rglob('*') if p.is_file() and p.name!='BuildManifest.json'}
    data={'version':'0.2.0','sourceCommit':os.environ.get('GITHUB_SHA','local'),'files':files,
          'python':sys.version,'gpuInferenceTested':False,'referencePolicy':'persistent_character_and_previous_last_frame',
          'fullModelDownloadTested':False,'comfyPortable':'v0.45.0 NVIDIA CUDA 12.6',
          'codeSigned':False,'browserDownloadVerdict':'unverified'}
    (root/'BuildManifest.json').write_text(json.dumps(data,indent=2),encoding='utf-8')
else:
    from PIL import Image,ImageDraw
    root=Path(__file__).resolve().parent
    icon=Image.new('RGBA',(256,256),(11,18,32,255));draw=ImageDraw.Draw(icon)
    draw.rounded_rectangle((12,12,244,244),radius=52,fill=(41,170,144))
    draw.line([(46,78),(76,182),(128,113),(180,182),(210,78)],fill=(9,28,43),width=21,joint='curve')
    icon.save(root/'icon.ico',sizes=[(16,16),(32,32),(48,48),(64,64),(128,128),(256,256)])
    licenses=root/'runtime/licenses';licenses.mkdir(parents=True,exist_ok=True)
    for package in ('customtkinter','darkdetect','Pillow','imageio-ffmpeg','pyinstaller'):
        dist=importlib.metadata.distribution(package)
        for item in dist.files:
            source=dist.locate_file(item)
            if source.is_file() and any(term in str(item).lower() for term in ('license','copying','notice')):
                (licenses/(package+'-'+Path(str(item)).name)).write_bytes(source.read_bytes())
