"""Best-effort local GPU and backend evidence; never treats missing telemetry as failure."""
from __future__ import annotations
import csv
from datetime import datetime, timezone
import json
import math
import os
from pathlib import Path
import platform
import re
import shutil
import subprocess
import threading
import time

MAX_LOG_BYTES = 20 * 1024
_ANSI = re.compile(r'\x1b(?:\[[0-?]*[ -/]*[@-~]|\][^\x07]*(?:\x07|\x1b\\))')
_SECRET = re.compile(r'(?i)(?:authorization\s*:|bearer\s+\S+|(?:api[_-]?key|access[_-]?token|refresh[_-]?token|password|secret|cookie|token)\s*[=:]\s*\S+)')


def _utc(timestamp=None):
    return datetime.fromtimestamp(time.time() if timestamp is None else timestamp, timezone.utc).isoformat(timespec='seconds')


def _clean(text):
    text = _ANSI.sub('', text)
    text = ''.join(ch for ch in text if ch in '\n\t' or ord(ch) >= 32)
    return '\n'.join('[redacted sensitive log line]' if _SECRET.search(line) else line for line in text.splitlines())


class GPUProbe:
    """Throttle actual nvidia-smi calls; consumers should use this off the UI thread."""
    def __init__(self, minimum_interval=5.0):
        self.minimum_interval = max(1.0, float(minimum_interval))
        self._last = float('-inf')
        self._value = None
        self._lock = threading.Lock()

    def snapshot(self, force=False):
        with self._lock:
            now = time.monotonic()
            if not force and self._value is not None and now - self._last < self.minimum_interval:
                return json.loads(json.dumps(self._value))
            self._last = now
            result = {'status': 'unknown', 'sampled_at_utc': _utc(), 'devices': []}
            executable = shutil.which('nvidia-smi')
            if not executable and os.name == 'nt':
                candidate = Path(os.environ.get('SystemRoot', r'C:\Windows')) / 'System32/nvidia-smi.exe'
                if candidate.is_file(): executable = str(candidate)
            if not executable:
                result['reason'] = 'nvidia-smi unavailable; GPU activity is not established.'
            else:
                try:
                    completed = subprocess.run(
                        [executable, '--query-gpu=name,memory.total,memory.used,utilization.gpu',
                         '--format=csv,noheader,nounits'],
                        capture_output=True, text=True, encoding='utf-8', errors='replace', timeout=3,
                        shell=False, creationflags=getattr(subprocess, 'CREATE_NO_WINDOW', 0))
                    if completed.returncode:
                        result['reason'] = 'nvidia-smi did not return GPU statistics.'
                    else:
                        for row in csv.reader(completed.stdout.splitlines()):
                            if len(row) != 4: continue
                            name = row[0].strip()
                            if not name: continue
                            values = []
                            for field in row[1:]:
                                try:
                                    value = float(field.strip())
                                    values.append(value if math.isfinite(value) and value >= 0 else None)
                                except ValueError: values.append(None)
                            if any(v is not None and v < 0 for v in values): continue
                            result['devices'].append({'name': name, 'memory_total_mb': values[0],
                                                      'memory_used_mb': values[1], 'gpu_utilization_percent': values[2]})
                        if result['devices']: result['status'] = 'available'
                        else: result['reason'] = 'No recognized GPU statistics; GPU activity is not established.'
                except (OSError, subprocess.TimeoutExpired):
                    result['reason'] = 'GPU statistics unavailable or timed out; generation may still be running.'
            self._value = result
            return json.loads(json.dumps(result))


_probe = GPUProbe()


def gpu_snapshot(force=False):
    return _probe.snapshot(force=force)


def read_backend_log(asset_root, max_lines=20, max_bytes=MAX_LOG_BYTES):
    """Last bounded bytes only. Its timestamp is evidence, not proof of the active job."""
    path = Path(asset_root) / 'comfyui.log'
    result = {'available': False, 'current_session_verified': False,
              'note': 'Saved backend log tail; lines may belong to an earlier session.', 'lines': []}
    try:
        with path.open('rb') as stream:
            stream.seek(0, 2)
            size = stream.tell()
            limit = min(MAX_LOG_BYTES, max(1, int(max_bytes)))
            stream.seek(max(0, size - limit))
            raw = stream.read(limit)
            stat = os.fstat(stream.fileno())
        lines = _clean(raw.decode('utf-8', 'replace')).splitlines()
        result.update({'available': True, 'modified_at_utc': _utc(stat.st_mtime),
                       'size_bytes': size, 'lines': lines[-min(20, max(1, int(max_lines))):]})
    except OSError:
        result['note'] = 'No readable managed backend log; an external ComfyUI may store its log elsewhere.'
    return result


def collect(asset_root, version='unknown', force_gpu=False):
    return {'app_version': str(version), 'created_at_utc': _utc(),
            'platform': platform.system() + ' ' + platform.release(), 'python': platform.python_version(),
            'gpu': gpu_snapshot(force=force_gpu), 'backend_log': read_backend_log(asset_root),
            'interpretation': 'GPU utilization is one sample. Missing telemetry does not establish a failed render.'}


def export(asset_root, project=None, version='unknown', destination=None):
    """Export selected diagnostics only: no environment/configuration or credentials."""
    report = collect(asset_root, version)
    target = Path(destination) if destination else Path(project if project is not None else asset_root) / 'chan-doan-gpu.json'
    target.parent.mkdir(parents=True, exist_ok=True)
    temporary = target.with_suffix(target.suffix + '.tmp')
    temporary.write_text(json.dumps(report, indent=2, ensure_ascii=False), encoding='utf-8')
    temporary.replace(target)
    return target


def describe(report):
    """Compact Vietnamese status suitable for the tool's diagnostic panel."""
    gpu = report.get('gpu', report)
    if gpu.get('status') != 'available':
        return 'Chưa đọc được hoạt động GPU; chưa thể kết luận tác vụ bị lỗi.'
    values = []
    for device in gpu.get('devices', []):
        used, total, utilization = (device.get(k) for k in ('memory_used_mb', 'memory_total_mb', 'gpu_utilization_percent'))
        memory = f'{used / 1024:.1f}/{total / 1024:.1f} GB VRAM' if used is not None and total is not None else 'VRAM: chưa đọc được'
        activity = f'GPU {utilization:g}%' if utilization is not None else 'GPU: chưa đọc được mức dùng'
        values.append(f'{device["name"]} · {memory} · {activity}')
    return '\n'.join(values)
