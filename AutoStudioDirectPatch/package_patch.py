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
FILES=['appinfo.py','installer.iss','README.txt','HUONG_DAN_2.2.51.txt','ytdl/scantab.py','ytdl/directscan.py','ytdl/download_order.py']
FILES += [str(p.relative_to(SOURCE)).replace('\\','/') for p in sorted((SOURCE/'ytdl/douyin_direct').rglob('*')) if p.is_file() and '__pycache__' not in p.parts]
MAP={name:name for name in FILES}
MAP['tests/test_direct_api.py']='tests_ytdl/test_direct_api.py'
MAP['tests/ui_layout_baseline.json']='tests_ytdl/ui_layout_baseline.json'
report={'version':'2.2.51','base_version':'2.2.50','format':'source_patch_only_no_exe',
        'scope':'Pagination recovery and usable partial results; distinguish native collections from outside posts', 'layout_widget_construction_unchanged':True,
        'offline_tests_run':71,'offline_result':'passed','ui_contract':'passed with theme/downloader test shims',
        'host_os':platform.system(),'full_autostudio_exe_tested':False,'live_douyin_tested':False,
        'live_abogus_acceptance_verified':False,'captcha_solver':False,
        'pagination_tests':'terminal string flags, forward empty pages, alternate cursor, 134-video stalled final page, cycle/empty bounds, no retry of access denial',
        'partial_ui_test':'incomplete profile results remain warned/partial and can download without refetch; no false completion',
        'count_summary_test':'4 native collections (139 videos) + 14 outside videos = 153 videos, not 5 collections',
        'filename_pattern':'Tập 001 - <collection name>',
        'ordering_source':'native collection episode metadata if all unique/valid, otherwise collection endpoint sequence; never user-post dates/IDs',
        'download_handoff_tests':'existing idle row rename, selected episode numbers preserved, scoped queue ordering; active/completed files untouched',
        'direct_scan_user_report':'2.5.49 successfully scans and downloads; 2.2.51 ordering has not been run live by build environment',
        'session_bootstrap':'server-issued SDK token, no sample or random tokens; static upstream template acceptance unverified',
        'network_probe':'SDK connection blocked by execution environment gateway; no authenticated live scan',
        'signer_source_commit':'3c045e11aecd58ab076562f1246931b9dd5d909b',
        'sdk_token_template_source_commit':'7dab3e2ffffaa2535834d28fca99dbc2e89fa9d3',
        'manual_browser_capture_websign_comparison':'exact match, recomputed offline; capture values NOT packaged',
        'manual_browser_capture_abogus_format_comparison':'matches native aid=6383/page_id=6241/SDK=1.0.1.0; no live replay',
        'cookie_or_actual_login_data_in_package':False,
        'source_sha256':{MAP[name]:hashlib.sha256((SOURCE/name).read_bytes()).hexdigest() for name in MAP}}
report_bytes=(json.dumps(report,ensure_ascii=False,indent=2)+'\n').encode()
package=OUT/'AutoStudio_v2.2.51_chi_file_sua.zip'
with zipfile.ZipFile(package,'w',zipfile.ZIP_DEFLATED) as z:
    for name,target in MAP.items():z.write(SOURCE/name,target)
    z.writestr('KIEM_TRA_2.2.51.json',report_bytes)
with zipfile.ZipFile(package) as z:
    assert z.testzip() is None
    assert len(z.namelist())==len(MAP)+1
    assert 'ytdl/core.py' not in z.namelist()
    assert 'ytdl/tab.py' not in z.namelist()
    assert 'ytdl/bridge.py' not in z.namelist()
    for name,target in MAP.items():assert z.read(target)==(SOURCE/name).read_bytes(),target
(OUT/'KIEM_TRA_2.2.51.json').write_bytes(report_bytes)
(OUT/'SHA256SUMS.txt').write_text('\n'.join(hashlib.sha256(p.read_bytes()).hexdigest()+'  '+p.name for p in sorted(OUT.iterdir()) if p.name!='SHA256SUMS.txt')+'\n')
print(package,package.stat().st_size,hashlib.sha256(package.read_bytes()).hexdigest())
