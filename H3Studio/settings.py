"""Public preferences + Windows DPAPI protected credentials, never in film projects."""
import base64
import ctypes
from ctypes import wintypes
import json
import os
from engine import APP_HOME, DEFAULTS, atomic_json


def protect(value, decrypt=False):
    class Blob(ctypes.Structure):
        _fields_ = [('size', wintypes.DWORD), ('data', ctypes.POINTER(ctypes.c_ubyte))]
    buf = ctypes.create_string_buffer(value)
    src = Blob(len(value), ctypes.cast(buf, ctypes.POINTER(ctypes.c_ubyte)))
    dst = Blob()
    fn = ctypes.windll.crypt32.CryptUnprotectData if decrypt else ctypes.windll.crypt32.CryptProtectData
    if not fn(ctypes.byref(src), None, None, None, None, 1, ctypes.byref(dst)):
        raise OSError('Windows không mã hóa/giải mã được API key.')
    try:
        return ctypes.string_at(dst.data, dst.size)
    finally:
        ctypes.windll.kernel32.LocalFree(dst.data)


def load():
    path = APP_HOME / 'settings.json'
    try:
        data = json.loads(path.read_text(encoding='utf-8'))
    except (OSError, ValueError):
        return DEFAULTS.copy(), {}
    secrets = {}
    if os.name == 'nt' and data.get('credentials'):
        try:
            secrets = json.loads(protect(base64.b64decode(data['credentials']), True))
        except (OSError, ValueError):
            pass
    return {**DEFAULTS, **data.get('preferences', {})}, secrets


def save(preferences, secrets):
    data = {'preferences': {k: v for k, v in preferences.items() if k in DEFAULTS}}
    if os.name == 'nt':
        data['credentials'] = base64.b64encode(protect(json.dumps(secrets).encode())).decode()
    atomic_json(APP_HOME / 'settings.json', data)
