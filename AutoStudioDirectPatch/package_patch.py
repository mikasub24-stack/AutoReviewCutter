from pathlib import Path
import hashlib
import json
import platform
import shutil
import zipfile

ROOT=Path(__file__).resolve().parent
SOURCE=ROOT/'source'
OUT=ROOT/'dist'
OUT.mkdir(exist_ok=True)
FILES=['appinfo.py','installer.iss','README.txt','HUONG_DAN_2.5.47.txt','ytdl/scantab.py','ytdl/directscan.py']
FILES += [str(p.relative_to(SOURCE)).replace('\\','/') for p in sorted((SOURCE/'ytdl/douyin_direct').rglob('*')) if p.is_file() and '__pycache__' not in p.parts]
MAP={name:name for name in FILES}
MAP['tests/test_direct_api.py']='tests_ytdl/test_direct_api.py'
MAP['tests/ui_layout_baseline.json']='tests_ytdl/ui_layout_baseline.json'
report={'version':'2.5.47','base_version':'2.5.45','format':'source_patch_only_no_exe',
        'scope':'Quét bộ Douyin tab beside Tải video', 'layout_widget_construction_unchanged':True,
        'offline_tests_run':37,'offline_result':'passed','ui_contract':'passed with theme/downloader test shims',
        'host_os':platform.system(),'full_autostudio_exe_tested':False,'live_douyin_tested':False,
        'live_abogus_acceptance_verified':False,'captcha_solver':False,
        'signer_source_commit':'7dab3e2ffffaa2535834d28fca99dbc2e89fa9d3',
        'cookie_or_actual_login_data_in_package':False,
        'source_sha256':{MAP[name]:hashlib.sha256((SOURCE/name).read_bytes()).hexdigest() for name in MAP}}
report_bytes=(json.dumps(report,ensure_ascii=False,indent=2)+'\n').encode()
package=OUT/'AutoStudio_v2.5.47_chi_file_sua.zip'
with zipfile.ZipFile(package,'w',zipfile.ZIP_DEFLATED) as z:
    for name,target in MAP.items():z.write(SOURCE/name,target)
    z.writestr('KIEM_TRA_2.5.47.json',report_bytes)
with zipfile.ZipFile(package) as z:
    assert z.testzip() is None
    assert len(z.namelist())==len(MAP)+1
    assert 'ytdl/core.py' not in z.namelist()
    assert 'ytdl/tab.py' not in z.namelist()
    assert 'ytdl/bridge.py' not in z.namelist()
    for name,target in MAP.items():assert z.read(target)==(SOURCE/name).read_bytes(),target
(OUT/'KIEM_TRA_2.5.47.json').write_bytes(report_bytes)
(OUT/'SHA256SUMS.txt').write_text('\n'.join(hashlib.sha256(p.read_bytes()).hexdigest()+'  '+p.name for p in sorted(OUT.iterdir()) if p.name!='SHA256SUMS.txt')+'\n')
print(package,package.stat().st_size,hashlib.sha256(package.read_bytes()).hexdigest())
