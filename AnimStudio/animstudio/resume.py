"""Tam dung khi loi + tiep tuc dung cho (khong lam lai tu dau) + cache ket qua AI tren dia.

HOOK[0] do webui dat: callable(what, err, skip, kind) -> "retry" | "skip".
Khong co HOOK (chay bang dong lenh) -> tra ve "skip"/None nhu cu."""
import os, json, hashlib
from .common import APP_DIR, DATA_DIR

HOOK = [None]
SALT = [""]
AI_DIR = os.path.join(DATA_DIR, "cache", "ai")


def ask(what, err, skip=False, kind="flow"):
    """Hoi nguoi dung khi mot buoc loi. Tra ve 'retry' hoac 'skip' (None neu khong co UI)."""
    h = HOOK[0]
    if not h:
        return None
    return h(what, str(err)[:300], bool(skip), kind)


def key(*parts):
    if SALT[0]:
        parts = (SALT[0],) + tuple(parts)
    return hashlib.md5(json.dumps(parts, ensure_ascii=False, default=str).encode("utf-8")).hexdigest()[:20]


def cget(k):
    try:
        with open(os.path.join(AI_DIR, k + ".json"), encoding="utf-8") as f:
            return json.load(f)
    except Exception:
        return None


def cput(k, v):
    try:
        os.makedirs(AI_DIR, exist_ok=True)
        tmp = os.path.join(AI_DIR, k + ".json.tmp")
        with open(tmp, "w", encoding="utf-8") as f:
            json.dump(v, f, ensure_ascii=False)
        os.replace(tmp, os.path.join(AI_DIR, k + ".json"))
    except Exception:
        pass
