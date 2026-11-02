# -*- coding: utf-8 -*-
"""Tu tai ban edge-tts MOI NHAT (thu vien giong Microsoft online) khi dang chay, khong can build lai exe.

- Tai tu PyPI (chi goi edge-tts, chi tai file https://files.pythonhosted.org/..., kiem tra sha256 PyPI cong bo) roi giai nen vao
  <du lieu>/vendor/edge_tts/<phien ban>/ . Moi lan can giong, get() tra ve ban MOI HON giua ban da dong goi trong exe va ban da tai.
- Ban da tai duoc nap duoi ten rieng 'edge_tts_live' (khong dung ten 'edge_tts' de khong bi lan voi ban dong goi trong exe).
- Moi loi (mat mang, file hong, ban moi khong chay duoc) -> im lang dung ban dong goi san. Khong bao gio lam hong giong dang chay duoc.
- check_async(): kiem tra ngam luc mo app (toi da 1 lan / 6 gio). update(force=True): kiem tra ngay (khi Microsoft bao 403)."""
import os, sys, io, re, json, time, zipfile, hashlib, shutil, threading, importlib.util, urllib.request
from .common import DATA_DIR

VENDOR = os.path.join(DATA_DIR, "vendor", "edge_tts")
STATE = os.path.join(DATA_DIR, "vendor", "edge_tts_state.json")
PYPI = "https://pypi.org/pypi/edge-tts/json"
ALLOWED = ("https://files.pythonhosted.org/",)
ALIAS = "edge_tts_live"
EVERY = 6 * 3600
STATUS = dict(state="idle", current="", latest="", msg="")
_LOCK = threading.RLock()                 # cache + nap module (ngan)
_NET = threading.Lock()                   # chi mot lan kiem tra / tai tai mot thoi diem (khong chan get())
_CACHE = {"mod": None, "ver": "", "key": None}


def vtuple(v):
    nums = re.findall(r"\d+", str(v or ""))[:4]
    return tuple(int(x) for x in nums) if nums else (0,)


def _bundled():
    """(module, phien_ban) cua ban dong goi san trong exe / cai bang pip; (None, '') neu khong co."""
    try:
        import edge_tts as m
    except Exception:
        return None, ""
    v = ""
    try:
        import importlib.metadata as md
        v = md.version("edge-tts")
    except Exception:
        v = str(getattr(m, "__version__", "") or "")
    return m, v


def _local_versions():
    out = []
    try:
        for d in os.listdir(VENDOR):
            p = os.path.join(VENDOR, d)
            if os.path.isfile(os.path.join(p, "edge_tts", "__init__.py")):
                out.append((vtuple(d), d, p))
    except OSError:
        pass
    return sorted(out, reverse=True)


def _load_dir(path, alias=ALIAS):
    pkg = os.path.join(path, "edge_tts")
    with _LOCK:
        for k in [k for k in sys.modules if k == alias or k.startswith(alias + ".")]:
            del sys.modules[k]
        spec = importlib.util.spec_from_file_location(alias, os.path.join(pkg, "__init__.py"), submodule_search_locations=[pkg])
        m = importlib.util.module_from_spec(spec)
        sys.modules[alias] = m
        try:
            spec.loader.exec_module(m)
            if not hasattr(m, "Communicate"):
                raise ImportError("thieu Communicate")
        except Exception:
            for k in [k for k in sys.modules if k == alias or k.startswith(alias + ".")]:
                del sys.modules[k]
            raise
    return m


def get():
    """Module edge_tts se dung: ban da tai neu MOI HON ban dong goi (va nap duoc), nguoc lai ban dong goi. None neu khong co ban nao."""
    with _LOCK:
        b, bv = _bundled()
        loc = _local_versions()
        key = (bv, loc[0][1] if loc else "")
        if _CACHE["key"] == key and _CACHE["mod"] is not None:
            return _CACHE["mod"]
        mod, ver = b, bv
        for t, name, path in loc:
            if b is not None and t <= vtuple(bv):
                break
            try:
                mod, ver = _load_dir(path), name
                break
            except Exception:
                continue                             # ban tai ve hong -> thu ban cu hon / ban dong goi
        _CACHE.update(mod=mod, ver=ver, key=key)
        STATUS["current"] = ver
        return mod


def version():
    """Phien ban edge-tts dang duoc dung ('' neu khong co)."""
    get()
    return _CACHE["ver"] or ""


def _ctx():
    try:
        import ssl
        try:
            import certifi
            return ssl.create_default_context(cafile=certifi.where())
        except Exception:
            return ssl.create_default_context()
    except Exception:
        return None


def _open(url, timeout):
    req = urllib.request.Request(url, headers={"User-Agent": "AnimStudio-edge-update"})
    ctx = _ctx()
    return urllib.request.urlopen(req, timeout=timeout, context=ctx) if (ctx is not None and url.startswith("https:")) else urllib.request.urlopen(req, timeout=timeout)


def latest(timeout=12):
    """{'version', 'url', 'sha256'} cua ban wheel moi nhat tren PyPI."""
    with _open(PYPI, timeout) as r:
        d = json.loads(r.read().decode("utf-8"))
    ver = str(d["info"]["version"])
    files = d.get("urls") or d.get("releases", {}).get(ver) or []
    best = None
    for f in files:
        n = str(f.get("filename") or "")
        if f.get("packagetype") == "bdist_wheel" and n.endswith("-none-any.whl") and not f.get("yanked"):
            best = f
            break
    if not best:
        raise RuntimeError("PyPI khong co ban wheel thuan Python cua edge-tts")
    return dict(version=ver, url=str(best["url"]), sha256=str((best.get("digests") or {}).get("sha256") or "").lower())


def _install(info, timeout=60):
    url, want = info["url"], info["sha256"]
    if not url.startswith(ALLOWED) or not re.fullmatch(r"[0-9a-f]{64}", want or ""):
        raise RuntimeError("nguon tai khong hop le")
    with _open(url, timeout) as r:
        data = r.read(30 * 1024 * 1024 + 1)
    if len(data) > 30 * 1024 * 1024:
        raise RuntimeError("file qua lon")
    if hashlib.sha256(data).hexdigest() != want:
        raise RuntimeError("sai sha256, bo qua file tai ve")
    ver = re.sub(r"[^0-9A-Za-z.+-]", "", info["version"])
    if not ver:
        raise RuntimeError("phien ban khong hop le")
    tmp = os.path.join(os.path.dirname(VENDOR), "tmp_" + ver + "_" + str(os.getpid()))
    shutil.rmtree(tmp, ignore_errors=True)
    os.makedirs(tmp, exist_ok=True)
    try:
        z = zipfile.ZipFile(io.BytesIO(data))
        n_ok = 0
        for zi in z.infolist():
            nm = zi.filename.replace("\\", "/")
            if not nm.startswith("edge_tts/") or nm.endswith("/"):
                continue
            parts = nm.split("/")
            if any(p in ("", ".", "..") for p in parts) or ":" in nm or zi.file_size > 5 * 1024 * 1024:
                raise RuntimeError("file trong goi khong an toan")
            dst = os.path.join(tmp, *parts)
            os.makedirs(os.path.dirname(dst), exist_ok=True)
            with open(dst, "wb") as fh:
                fh.write(z.read(zi))
            n_ok += 1
        if not n_ok or not os.path.isfile(os.path.join(tmp, "edge_tts", "__init__.py")):
            raise RuntimeError("goi khong co edge_tts")
        _load_dir(tmp, ALIAS + "_probe")                 # thu nap that su truoc khi dung (hong -> bo)
        for k in [k for k in sys.modules if k == ALIAS + "_probe" or k.startswith(ALIAS + "_probe.")]:
            del sys.modules[k]
        final = os.path.join(VENDOR, ver)
        os.makedirs(VENDOR, exist_ok=True)
        shutil.rmtree(final, ignore_errors=True)
        os.replace(tmp, final)
        return final
    finally:
        shutil.rmtree(tmp, ignore_errors=True)


def _state():
    try:
        return json.load(open(STATE, encoding="utf-8"))
    except Exception:
        return {}


def _save_state(**kw):
    try:
        s = _state()
        s.update(kw)
        os.makedirs(os.path.dirname(STATE), exist_ok=True)
        with open(STATE, "w", encoding="utf-8") as fh:
            json.dump(s, fh)
    except Exception:
        pass


def update(force=False, log=None, timeout=12):
    """Kiem tra + tai ban moi neu co. force=False: bo qua neu da kiem tra trong 6 gio qua. Tra ve (da_doi: bool, thong_bao: str). Khong bao gio nem loi."""
    log = log or (lambda m: None)
    if not force and time.time() - float(_state().get("checked") or 0) < EVERY:
        return False, "da kiem tra gan day"
    if not _NET.acquire(blocking=False):
        return False, "dang kiem tra"
    try:
        STATUS.update(state="checking", msg="")
        try:
            before = version()
            info = latest(timeout)
            _save_state(checked=time.time(), latest=info["version"])
            STATUS["latest"] = info["version"]
            if before and vtuple(info["version"]) <= vtuple(before):
                STATUS.update(state="ok", msg="edge-tts %s la ban moi nhat" % before)
                return False, STATUS["msg"]
            log("Đang tải edge-tts %s (đang dùng %s)…" % (info["version"], before or "chưa có"))
            _install(info)
            with _LOCK:
                _CACHE["key"] = None
            now = version()
            if vtuple(now) >= vtuple(info["version"]):
                STATUS.update(state="updated", msg="Đã cập nhật edge-tts %s → %s" % (before or "?", now))
                return True, STATUS["msg"]
            STATUS.update(state="error", msg="da tai edge-tts %s nhung chua nap duoc" % info["version"])
            return False, STATUS["msg"]
        except Exception as e:
            STATUS.update(state="error", msg=(type(e).__name__ + ": " + str(e))[:160])
            return False, STATUS["msg"]
    finally:
        _NET.release()


def check_async(log=None):
    """Luc mo app: kiem tra ngam (toi da 1 lan / 6 gio), khong chan giao dien, khong bao loi."""
    if os.environ.get("ANIMSTUDIO_NO_UPDATE"):
        return None
    t = threading.Thread(target=lambda: update(False, log), daemon=True, name="edge-update")
    t.start()
    return t
