# -*- coding: utf-8 -*-
"""Nguon giong doc: Microsoft online (edge-tts), VieNeu local (tuy chon), va giong thu (khong can mang)."""
import os, sys, re, io, math, wave, struct, json, time, asyncio, tempfile, subprocess, shutil, unicodedata, traceback, threading, zipfile
import urllib.request, urllib.error
from xml.sax.saxutils import escape as _xesc
import numpy as np
from .common import APP_DIR, DATA_DIR, ffmpeg, detect_lang, h01

SR = 24000

from . import langs as _lg

# Giong tu dong cho tung ngon ngu (vi, en, zh, tw, hk, ja, ko, th, id, ms, fr, de, es, pt, it, ru, hi, ar, tr): xem langs.py
EDGE_VOICES = {c: {"f": list(_lg.POOL[c]["f"]), "m": list(_lg.POOL[c]["m"])} for c in _lg.ORDER}
NARRATOR_VOICE = {c: _lg.NARRATOR[c] for c in _lg.ORDER}
# narrator: "" (tu dong) | khoa giong clone (voices/*.wav) | "vp:<ten>" giong co san VieNeu | "az:<ShortName>" Azure | "ms:<ShortName>" Microsoft online
# auto: "" | "vieneu" | "azure"  -> moi nhan vat tu chon giong theo gioi tinh trong nguon do
VOICE_CHOICE = {"narrator": "", "chars": "auto", "auto": ""}

# 25 giong co san cua VieNeu v3 (khop assets/voices_v3_turbo.json cua thu vien): (ten, mo ta, gioi tinh m/f, vung). Thu tu = thu tu thu vien hien thi.
VIENEU_PRESETS = [
    ("Adam bựa", "Nam · Bắc · Phong cách tự nhiên", "m", "Bắc"), ("Trúc Ly", "Nữ · Bắc · Phong cách tự nhiên", "f", "Bắc"),
    ("Thiện Minh", "Nam · Bắc · Phong cách kể chuyện", "m", "Bắc"), ("Mai Anh", "Nữ · Bắc · Phong cách tin tức", "f", "Bắc"),
    ("Hải Đăng", "Nam · Bắc · Phong cách tự nhiên", "m", "Bắc"), ("Thùy Dung", "Nữ · Nam · Phong cách tin tức", "f", "Nam"),
    ("Thiền Tâm Đức", "Nam · Bắc · Phong cách kể chuyện", "m", "Bắc"), ("Ngọc Huyền", "Nữ · Bắc · Giọng đọc tự nhiên", "f", "Bắc"),
    ("Quang Sơn", "Nam · Trung · Phong cách tự nhiên", "m", "Trung"), ("Ngọc Trân", "Nữ · Trung · Phong cách tự nhiên", "f", "Trung"),
    ("Minh Đức", "Nam · Bắc · Phong cách tin tức", "m", "Bắc"), ("Phạm Tuyên", "Nam · Bắc · Phong cách tự nhiên", "m", "Bắc"),
    ("Thái Sơn", "Nam · Nam · Phong cách kể chuyện", "m", "Nam"), ("Xuân Vĩnh", "Nam · Bắc · Phong cách tự nhiên", "m", "Bắc"),
    ("Thanh Bình", "Nam · Bắc · Phong cách kể chuyện", "m", "Bắc"), ("Ngọc Linh", "Nữ · Bắc · Phong cách kể chuyện", "f", "Bắc"),
    ("Đoan Trang", "Nữ · Bắc · Phong cách tự nhiên", "f", "Bắc"), ("Thục Đoan", "Nữ · Nam · Phong cách kể chuyện", "f", "Nam"),
    ("Minh Triết", "Nam · Nam · Phong cách tin tức", "m", "Nam"), ("Mỹ Duyên", "Nữ · Nam · Phong cách đọc truyện", "f", "Nam"),
    ("Quỳnh Anh", "Nữ · Bắc · Phong cách đọc truyện", "f", "Bắc"), ("Đức Trí", "Nam · Nam · Phong cách đọc truyện", "m", "Nam"),
    ("Kim Thanh", "Nữ · Nam · Phong cách đọc truyện", "f", "Nam"), ("Adam", "Nam · Nam · Giọng đọc tự nhiên", "m", "Nam"),
    ("Quốc Tuấn", "Nam · Bắc · Phong cách tự nhiên", "m", "Bắc"),
]
VIENEU_NARRATOR = "Thiện Minh"          # giong ke chuyen mac dinh khi de "Tu dong" voi nguon VieNeu


def vieneu_pool(g):
    return [n for n, _d, gg, _r in VIENEU_PRESETS if gg == g]


# Giong Microsoft (Edge online / Azure dung chung ten giong Neural): (ShortName, nhan); MS_GROUP: ShortName -> nhom (ngon ngu)
_VT = _lg.voice_table()
MS_VOICES = [(v, lab) for v, lab, _g in _VT]
MS_GROUP = {v: g for v, _lab, g in _VT}


def refresh_voices():
    """Dung lai bang giong theo danh sach hien tai cua langs.py (sau khi nap danh sach giong that cua Microsoft). Cap nhat TAI CHO de cac module da import van thay ban moi."""
    for c in _lg.ORDER:
        d = EDGE_VOICES.setdefault(c, {"f": [], "m": []})
        d["f"][:] = _lg.POOL[c]["f"]
        d["m"][:] = _lg.POOL[c]["m"]
        NARRATOR_VOICE[c] = _lg.NARRATOR[c]
    vt = _lg.voice_table()
    MS_VOICES[:] = [(v, lab) for v, lab, _g in vt]
    MS_GROUP.clear()
    MS_GROUP.update({v: g for v, _lab, g in vt})


# ---- danh sach giong THAT cua Microsoft (edge-tts list_voices): luu 'AnimStudioData/ms_voices.json', nap khi mo app, tai moi sau 3 ngay (nen, khong lam cham luc mo)
CAT_FILE = os.path.join(DATA_DIR, "ms_voices.json")
CAT_TTL = 3 * 86400
CATALOG = dict(state="none", t=0.0, n=0, err="")          # none | cache | live | error
_CAT_DONE = threading.Event()
_CAT_THREAD = [None]


def _cat_rows(raw):
    return [dict(ShortName=r.get("ShortName"), Gender=r.get("Gender"), Locale=r.get("Locale"), Status=r.get("Status") or "GA")
            for r in (raw or []) if isinstance(r, dict) and r.get("ShortName")]


def catalog_load_cache():
    """Nap danh sach giong da luu (nhanh). Tra ve tuoi cua ban luu (giay) hoac None neu khong co / hong."""
    try:
        with open(CAT_FILE, "r", encoding="utf-8") as f:
            j = json.load(f)
        n = _lg.apply_catalog(j.get("rows") or [])
        if n:
            refresh_voices()
            CATALOG.update(state="cache", t=float(j.get("t") or 0), n=n, err="")
            return max(0.0, time.time() - float(j.get("t") or 0))
    except Exception:
        pass
    return None


def _list_voices_net():
    from . import edgeupdate
    et = edgeupdate.get()
    if et is None:
        import edge_tts as et
    return asyncio.run(et.list_voices())


def catalog_fetch():
    """Tai danh sach giong tu Microsoft, nap vao langs + luu file. Tra ve so giong (0 = that bai, giu danh sach cu)."""
    try:
        rows = _cat_rows(_list_voices_net())
        n = _lg.apply_catalog(rows)
        if not n:
            raise RuntimeError("danh sách giọng tải về rỗng / sai")
        refresh_voices()
        CATALOG.update(state="live", t=time.time(), n=n, err="")
        try:
            os.makedirs(os.path.dirname(CAT_FILE), exist_ok=True)
            tmp = CAT_FILE + ".tmp"
            with open(tmp, "w", encoding="utf-8") as f:
                json.dump(dict(t=time.time(), rows=rows), f, ensure_ascii=False)
            os.replace(tmp, CAT_FILE)
        except Exception:
            pass
        return n
    except Exception as e:
        CATALOG["err"] = str(e)[:160]
        if CATALOG["state"] == "none":
            CATALOG["state"] = "error"
        return 0
    finally:
        _CAT_DONE.set()


def catalog_start():
    """Mo app: nap ban luu ngay; thieu hoac cu (> 3 ngay) thi tai moi trong luong nen. An toan khi goi nhieu lan."""
    if _CAT_THREAD[0] is not None and _CAT_THREAD[0].is_alive():
        return
    age = catalog_load_cache()
    if age is not None and age < CAT_TTL:
        _CAT_DONE.set()
        return
    if age is not None:
        _CAT_DONE.set()                                  # co ban cu: dung ngay, tai moi o nen
    else:
        _CAT_DONE.clear()                                # chua co gi: trang web cho toi 2 giay (catalog_wait)
    th = threading.Thread(target=catalog_fetch, daemon=True)
    _CAT_THREAD[0] = th
    th.start()


def catalog_wait(sec=2.0):
    """Cho toi da 'sec' giay cho danh sach giong san sang (dung luc trang web hoi danh sach giong lan dau)."""
    if _CAT_THREAD[0] is None and not _CAT_DONE.is_set():          # chua tung bat dau tai (vd chay thu): khong cho
        return False
    return _CAT_DONE.wait(max(0.0, sec))


PRETTY = {"tungdang": "Tùng Đặng", "adam": "Adam", "vn": "Giọng Việt của tôi (VN)", "en": "Giọng Anh của tôi (EN)"}


def user_voice_dir():
    """Giong ban TU THEM trong giao dien (o 'Nhan ban giong'): AnimStudioData\\voices (ghi duoc ke ca khi tool cai trong Program Files)."""
    return os.path.join(DATA_DIR, "voices")


def custom_voices():
    """Giong cua nguoi dung: voices/*.wav canh chuong trinh + giong tu them (AnimStudioData\\voices). Ten file = khoa giong. Tra ve [(khoa, ten hien thi, duong dan)]."""
    out, seen = [], set()
    for d, pretty in ((os.path.join(APP_DIR, "voices"), True), (user_voice_dir(), False)):
        if os.path.isdir(d):
            for f in sorted(os.listdir(d)):
                if f.lower().endswith(".wav"):
                    k = os.path.splitext(f)[0]
                    if k in seen:
                        continue
                    seen.add(k)
                    out.append((k, PRETTY.get(k.lower(), k) if pretty else k, os.path.join(d, f)))
    return out


CLONE_MAX_BYTES = 25 * 1024 * 1024
CLONE_MIN_SEC, CLONE_MAX_SEC, CLONE_SR = 3.0, 20.0, 24000


def clone_key(name):
    """Ten giong -> khoa an toan (chu, so, dau cach, gach). Khong cho ':' (de khong lan voi tien to vp: / az: / ms:)."""
    k = re.sub(r"[^\w \-]", "", str(name or ""), flags=re.UNICODE).replace("_", " ")
    k = " ".join(k.split())[:40].strip(" -")
    if not k or k.lower() in ("auto", "vp", "az", "ms"):
        raise ValueError("Hãy đặt tên cho giọng (chữ, số, dấu cách; tối đa 40 ký tự).")
    return k


def _clone_decode(data):
    """Byte file am thanh bat ky (wav / mp3 / m4a / ogg / flac...) -> (mang float32 don kenh, tan so). WAV 16-bit doc thang; dinh dang khac nho ffmpeg."""
    try:
        with wave.open(io.BytesIO(data), "rb") as w:
            if w.getsampwidth() == 2 and w.getnframes() > 0:
                raw = np.frombuffer(w.readframes(w.getnframes()), dtype="<i2").astype(np.float32) / 32768.0
                ch = max(1, w.getnchannels())
                if ch > 1:
                    raw = raw[: len(raw) // ch * ch].reshape(-1, ch).mean(axis=1)
                return raw, w.getframerate()
    except Exception:
        pass
    d = tempfile.mkdtemp(prefix="anim_clone_")
    try:
        src, dst = os.path.join(d, "in.bin"), os.path.join(d, "out.wav")
        with open(src, "wb") as f:
            f.write(data)
        r = subprocess.run([ffmpeg(), "-y", "-v", "error", "-i", src, "-vn", "-t", str(int(CLONE_MAX_SEC) + 5), "-ac", "1", "-ar", str(CLONE_SR), "-c:a", "pcm_s16le", dst],
                           capture_output=True, text=True, timeout=120)
        if r.returncode != 0 or not os.path.isfile(dst):
            raise ValueError("Không đọc được file âm thanh này (thử .wav hoặc .mp3). " + (r.stderr or "")[-120:])
        with wave.open(dst, "rb") as w:
            raw = np.frombuffer(w.readframes(w.getnframes()), dtype="<i2").astype(np.float32) / 32768.0
            return raw, w.getframerate()
    except (OSError, subprocess.SubprocessError) as e:
        raise ValueError("Không đọc được file âm thanh này (%s)." % str(e)[:80])
    finally:
        shutil.rmtree(d, ignore_errors=True)


def clone_add(data, name):
    """Them mot giong de NHAN BAN tu file mau: chuan hoa ve wav don kenh 24 kHz (toi da 20 giay) luu o AnimStudioData\\voices\\<ten>.wav. Tra ve khoa giong."""
    if not data or len(data) > CLONE_MAX_BYTES:
        raise ValueError("File trống hoặc quá lớn (tối đa 25MB).")
    key = clone_key(name)
    if key in [k for k, _l, _p in custom_voices()]:
        raise ValueError("Đã có giọng tên «%s». Hãy đặt tên khác hoặc xóa giọng cũ trước." % key)
    a, sr = _clone_decode(data)
    a = np.asarray(a, dtype=np.float32).reshape(-1)
    if len(a) and sr != CLONE_SR:
        a = np.interp(np.linspace(0, len(a) - 1, max(1, int(len(a) * CLONE_SR / float(sr)))), np.arange(len(a)), a).astype(np.float32)
    nz = np.where(np.abs(a) > 0.01)[0]
    if len(nz):
        a = a[max(0, nz[0] - int(0.1 * CLONE_SR)): nz[-1] + int(0.2 * CLONE_SR)]
    a = a[: int(CLONE_MAX_SEC * CLONE_SR)]
    sec = len(a) / float(CLONE_SR)
    if len(nz) == 0 or sec < CLONE_MIN_SEC:
        raise ValueError("Mẫu quá ngắn hoặc gần như im lặng (%.1f giây). Cần ít nhất %d giây tiếng nói rõ, tốt nhất 6–15 giây, một người nói, không nhạc nền." % (sec if len(nz) else 0.0, int(CLONE_MIN_SEC)))
    pk = float(np.max(np.abs(a)))
    if pk > 0:
        a = a * (0.9 / pk)
    d = user_voice_dir()
    os.makedirs(d, exist_ok=True)
    path = os.path.join(d, key + ".wav")
    with wave.open(path + ".tmp", "wb") as w:
        w.setnchannels(1); w.setsampwidth(2); w.setframerate(CLONE_SR)
        w.writeframes((np.clip(a, -1, 1) * 32767).astype("<i2").tobytes())
    os.replace(path + ".tmp", path)
    return key


def clone_delete(key):
    """Xoa giong tu them (chi trong AnimStudioData\\voices; giong dat tay canh chuong trinh khong dong vao). True = da xoa."""
    k = str(key or "")
    if not k or k != os.path.basename(k) or any(c in k for c in "\\/:"):
        return False
    p = os.path.join(user_voice_dir(), k + ".wav")
    if os.path.isfile(p):
        os.remove(p)
        return True
    return False


PROVIDERS = ["Microsoft online (hơn 70 ngôn ngữ: Việt, Anh, Trung, Nhật, Hàn…)", "VieNeu local (tiếng Việt, giọng mẫu của bạn)", "Giọng thử (không cần mạng)",
             "Azure TTS V1 (Microsoft Azure Speech, cần key)"]
AZURE_IDX = 3


def assign_voices(script, lines_lang):
    """Chon giong cho tung nhan vat (neu GUI chua dat) -> {name: dict(name, rate, pitch)}."""
    out, used = {}, {"f": {}, "m": {}}
    lang = script.lang if script.lang in EDGE_VOICES else "en"
    auto = VOICE_CHOICE.get("auto") or ""
    use_pre = auto == "vieneu" and lang == "vi"          # VieNeu chi doc tieng Viet: ngon ngu khac van dung giong Microsoft
    for nm, ch in script.chars.items():
        g = ch.gender if ch.gender in ("m", "f") else "m"
        pool = EDGE_VOICES[lang][g]
        i = used[g].get(lang, 0)
        used[g][lang] = i + 1
        if use_pre:
            pp = vieneu_pool(g)
            out[nm] = dict(name=ch.voice if ch.voice in pp else pp[i % len(pp)], rate=0, pitch=0, preset=True)
            continue
        v = ch.voice or pool[i % len(pool)]
        rate, pitch = 0, 0
        if i >= len(pool):      # ngon ngu it giong (Viet, Nhat, Han...) -> doi cao do de phan biet nhan vat
            k = i - len(pool) + 1
            pitch = (6 * ((k + 1) // 2)) * (1 if k % 2 else -1)
        if ch.age == "child":
            pitch, rate = pitch + 38, rate + 6
        elif ch.age == "old":
            pitch, rate = pitch - 14, rate - 10
        out[nm] = dict(name=v, rate=rate, pitch=pitch)
    out[""] = dict(name=VIENEU_NARRATOR, rate=0, pitch=0, preset=True) if use_pre else dict(name=NARRATOR_VOICE[lang], rate=-4, pitch=0)
    nar = VOICE_CHOICE.get("narrator") or ""
    if nar in [k for k, _l, _p in custom_voices()]:     # chon giong nao thi moi dong (loi dan + nhan vat) deu dung giong do
        for nm in list(out):
            out[nm] = dict(name=nar, rate=0, pitch=0, custom=True)
    elif nar[:3] in ("vp:", "az:", "ms:") and nar[3:]:
        for nm in list(out):
            out[nm] = dict(name=nar[3:], rate=0, pitch=0, forced=True, **({"preset": True} if nar[:3] == "vp:" else {}))
    return out


def load_wav(path):
    with wave.open(path, "rb") as w:
        n, ch, sw, sr = w.getnframes(), w.getnchannels(), w.getsampwidth(), w.getframerate()
        raw = w.readframes(n)
    a = np.frombuffer(raw, dtype="<i2").astype(np.float32) / 32768 if sw == 2 else np.zeros(0, np.float32)
    if ch > 1:
        a = a.reshape(-1, ch).mean(axis=1)
    if sr != SR and len(a):
        a = np.interp(np.linspace(0, len(a) - 1, int(len(a) * SR / sr)), np.arange(len(a)), a).astype(np.float32)
    return a


class Provider:
    def synth(self, text, voice, emotion="neutral", energy=1.0):
        raise NotImplementedError

def edge_version():
    """Phien ban thu vien edge-tts dang dung ('' neu khong biet)."""
    try:
        from . import edgeupdate
        return edgeupdate.version()
    except Exception:
        return ""


def refresh_edge(prov):
    """Sau khi tai duoc edge-tts moi: nguon giong dang dung (EdgeProvider / HybridProvider) chuyen sang ban moi ngay, khong can khoi dong lai."""
    try:
        from . import edgeupdate
        m = edgeupdate.get()
        ep = prov if isinstance(prov, EdgeProvider) else getattr(prov, "edge", None)
        if m is not None and isinstance(ep, EdgeProvider):
            ep.edge_tts = m
            return True
    except Exception:
        pass
    return False


class VoiceBusy(RuntimeError):
    """Giong online tam thoi khong tra am thanh (loi phia may chu / mang): doi mot luc roi thu lai thi thuong duoc."""
    transient = True


def edge_transient(e):
    """Loi nay co kha nang tu het neu doi roi thu lai (Microsoft 'khong tra am thanh', mat mang, qua tai) -> khac 403 / sai ten giong."""
    s = " ".join(str(e).split()).lower()
    return (type(e).__name__ == "NoAudioReceived" or any(k in s for k in (
        "no audio was received", "cannot connect", "getaddrinfo", "name or service", "timed out", "timeout", "connection reset",
        "connection closed", "server disconnected", "temporarily", "429", "503", "502", "504", "service unavailable")))


def edge_error(e):
    """Thong bao loi Microsoft online (edge-tts) de hieu duoc: 403 = Microsoft tu choi (thu vien cu hoac dong ho may lech), khong cat mat dau URL."""
    s = " ".join(str(e).split())
    v = edge_version()
    if "403" in s or "Invalid response status" in s:
        return ("Microsoft từ chối kết nối giọng đọc (lỗi 403). Thường do thư viện edge-tts trong bản này đã cũ" + (" (đang là " + v + ")" if v else "")
                + " hoặc đồng hồ Windows lệch giờ. Tool đã tự thử tải edge-tts mới nhất (cần có mạng). Nếu vẫn lỗi: bật 'Đặt giờ tự động' trong Windows hoặc chạy lại build.bat. Trong lúc đó có thể chọn giọng VieNeu (tiếng Việt) hoặc giọng clone.")
    if "no audio was received" in s.lower() or type(e).__name__ == "NoAudioReceived":
        return ("Microsoft nhận câu nhưng không trả về âm thanh (\"No audio was received\"). Đây là lỗi bên máy chủ giọng Microsoft, "
                "thường chập chờn từng lúc hoặc chỉ với một giọng, không phải do file của bạn" + (" (edge-tts " + v + ")" if v else "") + ". "
                "Tool đã thử lại nhiều lần và vẫn giữ đúng giọng bạn chọn (không tự đổi giọng). Cách xử lý: đợi vài phút rồi bấm làm tiếp (các câu đã đọc được lưu, không phải đọc lại), "
                "hoặc tự chọn giọng khác ở mục Giọng đọc, hoặc dùng giọng VieNeu / giọng clone (chạy trên máy bạn, không qua Microsoft).")
    if "Cannot connect" in s or "getaddrinfo" in s or "Name or service" in s or "timed out" in s.lower():
        return "Không kết nối được Microsoft (kiểm tra mạng / VPN / tường lửa): " + s[:120]
    return "edge-tts lỗi: " + s[:200]


_BAD_CP = {0x20E3, 0x200B, 0x200C, 0x200D, 0x200E, 0x200F, 0x2060, 0xFEFF, 0x00AD}
_MD_SYMS = str.maketrans({c: " " for c in "*_~`#|^\\[]{}<>=•●▪■□◆◇★☆→←↑↓►◄✔✘✓✗"})
_QUOTES = str.maketrans({"“": '"', "”": '"', "„": '"', "‘": "'", "’": "'", "‚": "'", "«": '"', "»": '"', "–": ", ", "—": ", ", "…": "...", " ": " "})


def edge_clean(text):
    """Chuan hoa cau gui Microsoft: NFC, bo emoji / ky hieu dieu khien / dau markdown (Microsoft doc khong ra tieng, doi khi tra 'No audio'). Tra ve (van ban sach, so ky tu da bo)."""
    t = unicodedata.normalize("NFC", str(text or "")).translate(_QUOTES)
    out, removed = [], 0
    for ch in t:
        cp = ord(ch)
        cat = unicodedata.category(ch)
        if ch in "\r\n\t":
            out.append(" ")
        elif cp in _BAD_CP or 0xFE00 <= cp <= 0xFE0F or cat in ("So", "Sk", "Cc", "Cf", "Cs", "Co", "Cn"):
            removed += 1
        else:
            out.append(ch)
    t = "".join(out).translate(_MD_SYMS)
    t = re.sub(r"\.{4,}", "...", t)
    t = re.sub(r"\s+", " ", t).strip()
    return t, removed


def edge_speakable(text):
    """Co it nhat mot chu / so thi Microsoft moi doc ra tieng; chi con dau cham cau thi no tra 'No audio was received'."""
    return any(ch.isalnum() for ch in text)


def edge_pieces(text, limit=70):
    """Tach cau dai thanh cac doan ngan theo dau cau (thu doc tung doan khi ca cau bi Microsoft bo qua). Tra ve [] neu khong tach duoc.
    Chu Han / Kana / Hangul viet lien khong co dau cach sau dau cau -> tach bang langs.split_sentences, cat o dau phay (，、)."""
    cjk = _lg.has_cjk(text)
    if cjk:
        limit = max(24, limit // 2)
        parts = _lg.split_sentences(text)
    else:
        parts = [p.strip() for p in re.split(r"(?<=[.!?;:])\s+", text) if p.strip()]
    out = []
    for p in parts:
        if len(p) > limit and cjk:
            out.extend(_lg.cut_clauses(p, limit))
        elif len(p) > limit and "," in p:
            cur = ""
            for q in re.split(r"(?<=,)\s+", p):
                if cur and len(cur) + len(q) > limit:
                    out.append(cur.strip()); cur = q
                else:
                    cur = (cur + " " + q).strip()
            if cur:
                out.append(cur)
        else:
            out.append(p)
    minlen = 5 if cjk else 12
    merged = []
    for p in out:                                  # doan qua ngan (<12 ky tu; chu Han / Kana: <5) dinh vao doan ke ben cho khong bi Microsoft bo qua
        if merged and (len(p) < minlen or len(merged[-1]) < minlen):
            merged[-1] = merged[-1] + ("" if cjk else " ") + p
        else:
            merged.append(p)
    merged = [p for p in merged if edge_speakable(p)]
    return merged if len(merged) > 1 else []


def edge_label(name):
    d = dict(MS_VOICES).get(name)
    return d.split(" — ")[0] if d else name


class EdgeProvider(Provider):
    """Microsoft online. LUON dung dung giong da chon (khong tu doi sang giong khac). Moi cau: thu lai co cho doi -> thu doc tung doan ngan.
    Loi tam thoi cua Microsoft nem VoiceBusy de tien trinh cho vai chuc giay roi lam tiep (cau da doc nam trong cache)."""
    WAITS = (1.0, 2.5)

    def __init__(self, warn=None):
        from . import edgeupdate
        edge_tts = edgeupdate.get()          # ban moi nhat (da tai ve) hoac ban dong goi san
        if edge_tts is None:
            import edge_tts
        self.edge_tts = edge_tts
        self.warn = warn if warn is not None else []
        self.fell_back = False

    def _one(self, text, name, rate, pitch, variant, d):
        mp3, wav = os.path.join(d, "a.mp3"), os.path.join(d, "a.wav")
        for f in (mp3, wav):
            try:
                os.remove(f)
            except OSError:
                pass

        async def go():
            kw = dict(rate=f"{rate:+d}%", pitch=f"{pitch:+d}Hz") if variant == 0 else (dict(rate=f"{rate:+d}%") if variant == 1 else {})
            c = self.edge_tts.Communicate(text, name, **kw)
            await c.save(mp3)
        asyncio.run(go())
        if not os.path.isfile(mp3) or os.path.getsize(mp3) < 200:
            raise RuntimeError("No audio was received (file giọng rỗng)")
        r = subprocess.run([ffmpeg(), "-y", "-i", mp3, "-ar", str(SR), "-ac", "1", wav], capture_output=True)
        if r.returncode != 0:
            raise RuntimeError("ffmpeg không đọc được file giọng")
        return load_wav(wav)

    def _try(self, text, name, rate, pitch, d, n):
        """Thu n lan (doi rate/pitch, nghi 1 -> 2.5 giay giua cac lan). Tra ve am thanh hoac nem loi cuoi."""
        last = None
        for k in range(n):
            try:
                a = self._one(text, name, rate, pitch, min(k, 2), d)
                if len(a) < int(0.05 * SR):
                    raise RuntimeError("No audio was received (am thanh rong)")
                return a
            except Exception as e:
                last = e
                if k < n - 1:
                    time.sleep(self.WAITS[min(k, len(self.WAITS) - 1)])
        raise last

    def _pieces(self, pieces, name, rate, pitch, d):
        gap = np.zeros(int(0.14 * SR), np.float32)
        out = []
        for p in pieces:
            if out:
                out.append(gap)
            out.append(self._try(p, name, rate, pitch, d, 2))
        return np.concatenate(out).astype(np.float32)

    def synth(self, text, voice, emotion="neutral", energy=1.0):
        self.fell_back = False
        rate = voice.get("rate", 0) + {"sad": -8, "angry": 6, "scared": 8, "happy": 4, "whisper": -10}.get(emotion, 0) \
            + (4 if energy > 1.2 else 0)
        pitch = voice.get("pitch", 0) + {"sad": -6, "angry": 3, "scared": 8, "happy": 4, "surprised": 6}.get(emotion, 0)
        clean, _rm = edge_clean(text)
        if not edge_speakable(clean):                 # cau chi co dau cham / ky hieu ("...", emoji): Microsoft khong doc duoc -> nghi ngan thay vi loi
            return np.zeros(int(0.4 * SR), np.float32)
        name = voice["name"]
        d = tempfile.mkdtemp(prefix="edge_")
        try:
            err = None
            try:
                return self._try(clean, name, rate, pitch, d, 3)
            except Exception as e:
                err = e
            pcs = edge_pieces(clean)
            if pcs and edge_transient(err):
                try:
                    return self._pieces(pcs, name, rate, pitch, d)
                except Exception as e:
                    err = e
            msg = edge_error(err)
            raise (VoiceBusy(msg) if edge_transient(err) else RuntimeError(msg))
        finally:
            shutil.rmtree(d, ignore_errors=True)

    def diagnose(self, names=("vi-VN-HoaiMyNeural", "vi-VN-NamMinhNeural", "en-US-AriaNeural")):
        """Thu moi giong 1 cau ngan: de biet Microsoft dang hong het hay chi hong mot giong. Tra ve [(giong, True/False, loi ngan)]."""
        res = []
        d = tempfile.mkdtemp(prefix="edge_")
        try:
            for nm in names:
                txt = "Xin chào các bạn." if nm.startswith("vi-") else "Hello everyone."
                try:
                    self._try(txt, nm, 0, 0, d, 1)
                    res.append((nm, True, ""))
                except Exception as e:
                    res.append((nm, False, " ".join(str(e).split())[:80] or type(e).__name__))
        finally:
            shutil.rmtree(d, ignore_errors=True)
        return res


def edge_report(res):
    """Ket qua diagnose -> mot dong de doc: giong nao chay, giong nao khong."""
    v = edge_version()
    ok = [edge_label(n) for n, o, _ in res if o]
    bad = [edge_label(n) for n, o, _ in res if not o]
    s = "Thử nhanh Microsoft" + (" (edge-tts " + v + ")" if v else "") + ": "
    if ok and bad:
        return s + "chạy được " + ", ".join(ok) + "; KHÔNG chạy " + ", ".join(bad) + ". Nếu muốn dùng ngay, hãy tự chọn một giọng đang chạy được ở mục Giọng đọc."
    if ok:
        return s + "cả " + ", ".join(ok) + " đều chạy tốt (lỗi chỉ ở câu vừa đọc)."
    return s + "cả " + ", ".join(bad) + " đều không trả âm thanh — máy chủ giọng Microsoft đang lỗi hoặc bị chặn mạng; đợi vài phút hoặc dùng VieNeu / giọng clone."


def _pcm_from_riff(data):
    """Azure tra WAV (riff-24khz-16bit-mono-pcm). Doc tay: kich thuoc chunk 'data' co the la 0 / 0xFFFFFFFF khi stream -> lay phan con lai."""
    if data[:4] != b"RIFF":
        raise RuntimeError("Azure trả dữ liệu không phải WAV (%d byte)." % len(data))
    pos, rate = 12, SR
    while pos + 8 <= len(data):
        cid, size = data[pos:pos + 4], struct.unpack("<I", data[pos + 4:pos + 8])[0]
        if cid == b"fmt " and pos + 16 <= len(data):
            rate = struct.unpack("<I", data[pos + 12:pos + 16])[0]
        if cid == b"data":
            body = data[pos + 8:]
            if 0 < size <= len(body):
                body = body[:size]
            body = body[:len(body) // 2 * 2]
            a = np.frombuffer(body, dtype="<i2").astype(np.float32) / 32768
            if rate != SR and len(a):
                a = np.interp(np.linspace(0, len(a) - 1, int(len(a) * SR / rate)), np.arange(len(a)), a).astype(np.float32)
            return a
        pos += 8 + size + (size & 1)
    raise RuntimeError("Azure trả WAV không có phần âm thanh.")


AZURE_BASE = [None]          # chi de kiem thu: dia chi may chu gia thay cho https://<vung>.tts.speech.microsoft.com


def _azure_base(region):
    return AZURE_BASE[0] or "https://%s.tts.speech.microsoft.com" % region


REGION_RE = re.compile(r"^[a-z0-9][a-z0-9\-]{1,30}$")


def azure_cfg():
    """(key, region) tu config.json (nguoi dung nhap trong giao dien) hoac bien moi truong AZURE_SPEECH_KEY / AZURE_SPEECH_REGION."""
    try:
        from . import llm
        c = llm.load_cfg()
    except Exception:
        c = {}
    key = (c.get("azure_key") or "").strip()
    if key:                                   # key nguoi dung nhap trong giao dien di kem vung da luu cung no
        region = c.get("azure_region") or os.environ.get("AZURE_SPEECH_REGION") or "southeastasia"
    else:                                     # chua nhap: lay bien moi truong (key + vung cung nhau)
        key = (os.environ.get("AZURE_SPEECH_KEY") or "").strip()
        region = os.environ.get("AZURE_SPEECH_REGION") or c.get("azure_region") or "southeastasia"
    return key, region.strip().lower()


def _azure_http(url, key, data=None, headers=None, timeout=60):
    h = {"Ocp-Apim-Subscription-Key": key, "User-Agent": "AnimStudio"}
    h.update(headers or {})
    req = urllib.request.Request(url, data=data, headers=h, method="POST" if data is not None else "GET")
    with urllib.request.urlopen(req, timeout=timeout) as r:
        return r.read()


def azure_voices(key, region):
    """Danh sach giong cua tai khoan Azure (tieng Viet truoc, roi tieng Anh, Trung, Nhat, Han...): [[ShortName, nhan, gioi tinh m/f, locale], ...]. Nem RuntimeError (thong bao tieng Viet)."""
    if not key:
        raise RuntimeError("Chưa nhập key Azure Speech.")
    if not REGION_RE.match(region or ""):
        raise RuntimeError("Vùng (region) Azure không hợp lệ, ví dụ: southeastasia, eastasia, eastus.")
    try:
        raw = _azure_http(_azure_base(region) + "/cognitiveservices/voices/list", key, timeout=30)
        rows = json.loads(raw.decode("utf-8"))
    except urllib.error.HTTPError as e:
        raise RuntimeError(_azure_err(e))
    except Exception as e:
        raise RuntimeError("Không kết nối được Azure (%s). Kiểm tra mạng và vùng." % str(e)[:100])
    out = []
    for v in rows if isinstance(rows, list) else []:
        loc = str(v.get("Locale") or "")
        if _lg.lang_of_voice(loc + "-x-Neural") == "":
            continue
        if "Neural" not in str(v.get("VoiceType") or "Neural"):
            continue
        g = "f" if str(v.get("Gender", "")).lower().startswith("f") else "m"
        nm = v.get("LocalName") or v.get("DisplayName") or v.get("ShortName")
        out.append([v.get("ShortName"), "%s — %s · %s" % (nm, "Nữ" if g == "f" else "Nam", loc), g, loc])
    out.sort(key=lambda r: (_lg.ORDER.index(_lg.lang_of_voice(r[3] + "-x-Neural")), r[3], r[0]))
    return out


def _azure_err(e):
    body = ""
    try:
        body = e.read().decode("utf-8", "ignore")[:160]
    except Exception:
        pass
    if e.code in (401, 403):
        return "Azure từ chối key hoặc vùng (HTTP %d). Kiểm tra lại key và vùng (region) của tài nguyên Speech." % e.code
    if e.code == 429:
        return "Azure báo quá nhiều yêu cầu / hết hạn mức (HTTP 429)."
    return "Azure lỗi HTTP %d: %s" % (e.code, body)


class AzureProvider(Provider):
    """Azure Speech (REST v1): POST SSML toi https://<vung>.tts.speech.microsoft.com/cognitiveservices/v1, nhan WAV 24 kHz. Khong can them thu vien."""
    def __init__(self, key=None, region=None):
        k, r = azure_cfg()
        self.key, self.region = (key or k).strip(), (region or r).strip().lower()
        if not self.key:
            raise RuntimeError("Chưa nhập key Azure Speech (mục «Azure TTS V1» ở phần Video).")
        if not REGION_RE.match(self.region):
            raise RuntimeError("Vùng (region) Azure không hợp lệ: %r" % self.region)
        self.url = _azure_base(self.region) + "/cognitiveservices/v1"

    @staticmethod
    def ssml(text, voice, rate=0, pitch=0):
        name = voice["name"]
        lang = "-".join(name.split("-")[:2]) if name.count("-") >= 2 else "vi-VN"
        t = _xesc(text.replace("…", "...").strip() or ".")
        pros = ""
        if rate or pitch:
            pros = "<prosody%s%s>%s</prosody>" % (' rate="%+d%%"' % rate if rate else "", ' pitch="%+dHz"' % pitch if pitch else "", t)
        return ("<speak version='1.0' xml:lang='%s' xmlns='http://www.w3.org/2001/10/synthesis'><voice name='%s'>%s</voice></speak>"
                % (lang, _xesc(name), pros or t))

    def synth(self, text, voice, emotion="neutral", energy=1.0):
        rate = voice.get("rate", 0) + {"sad": -8, "angry": 6, "scared": 8, "happy": 4, "whisper": -10}.get(emotion, 0) + (4 if energy > 1.2 else 0)
        pitch = voice.get("pitch", 0) + {"sad": -6, "angry": 3, "scared": 8, "happy": 4, "surprised": 6}.get(emotion, 0)
        body = self.ssml(text, voice, rate, pitch).encode("utf-8")
        hdr = {"Content-Type": "application/ssml+xml", "X-Microsoft-OutputFormat": "riff-24khz-16bit-mono-pcm"}
        last = None
        for k in range(4):
            try:
                return _pcm_from_riff(_azure_http(self.url, self.key, body, hdr, timeout=60))
            except urllib.error.HTTPError as e:
                last = RuntimeError(_azure_err(e))
                if e.code not in (429, 500, 502, 503, 504):
                    raise last
            except RuntimeError:
                raise
            except Exception as e:
                last = RuntimeError("Azure lỗi mạng: %s" % str(e)[:100])
            time.sleep(1.5 + 2 * k)
        raise last


class FakeProvider(Provider):
    """Giong thu: am thanh giong tieng noi (cac am tiet) de xem truoc hinh anh, khong can mang."""
    def synth(self, text, voice, emotion="neutral", energy=1.0):
        words = max(1, _lg.wcount(text))
        dur = max(0.8, words * (0.24 if _lg.has_cjk(text) else 0.34) + len(text) * 0.012)
        n = int(dur * SR)
        t = np.arange(n) / SR
        f0 = 118 + 85 * h01(voice.get("name", ""), "f0") + voice.get("pitch", 0) * 0.8
        syl = 4.2 + 0.4 * math.sin(h01(text) * 6)
        env = np.clip(np.sin(np.pi * ((t * syl) % 1.0)) ** 0.6, 0, 1)
        gate = (np.sin(2 * np.pi * (t * 0.5 + h01(text))) > -0.85).astype(np.float32)  # nhung quang nghi nho
        w = np.zeros(n, np.float32)
        for k in range(1, 8):
            w += (np.sin(2 * np.pi * f0 * k * t + 0.4 * np.sin(2 * np.pi * 5 * t)) / k).astype(np.float32)
        a = w * env * gate * 0.22
        fade = min(n // 10, 600)
        a[:fade] *= np.linspace(0, 1, fade)
        a[-fade:] *= np.linspace(1, 0, fade)
        return a.astype(np.float32)


def vieneu_env():
    """VieNeu tai model qua HuggingFace. Trong .exe khong cua so den, bo tai Rust (hf-xet) va thanh tien trinh (tqdm) hay loi / ghi ra tay cam khong co that
    -> tat chung truoc khi nap thu vien (setdefault: nguoi dung da dat bien nay thi giu nguyen)."""
    for k, v in (("HF_HUB_DISABLE_XET", "1"), ("HF_HUB_DISABLE_PROGRESS_BARS", "1"), ("HF_HUB_DISABLE_SYMLINKS_WARNING", "1"),
                 ("HF_HUB_DISABLE_TELEMETRY", "1"), ("TOKENIZERS_PARALLELISM", "false")):
        os.environ.setdefault(k, v)


def err_where(e, n=2):
    """'file.py:123 ham' cua n khung trong cung (noi loi that su xay ra), de biet thu vien nao / file nao bi loi. Duong dan rut gon tu ten goi cuoi (site-packages\\...)."""
    out = []
    try:
        for fs in traceback.extract_tb(e.__traceback__)[-n:]:
            f = fs.filename.replace("\\", "/")
            i = f.lower().rfind("site-packages/")
            f = f[i + 14:] if i >= 0 else f.rsplit("/", 1)[-1]
            out.append("%s:%s %s" % (f, fs.lineno, fs.name))
    except Exception:
        pass
    return " <- ".join(reversed(out))


def vieneu_error(e):
    """Thong bao loi giong VieNeu: loai loi + noi xay ra + goi y. Ghi them toan bo traceback vao nhat ky (AnimStudioData\\animstudio.log khi chay .exe)."""
    msg = (type(e).__name__ + ": " + " ".join(str(e).split()))[:200]
    where = err_where(e)
    if where:
        msg += " [tại " + where + "]"
    low = str(e).lower()
    if "os error 2" in low or "winerror 2" in low or "no such file" in low or "cannot find the file" in low or isinstance(e, FileNotFoundError):
        msg += (" — thư viện VieNeu không thấy một file nó cần (thường: bản .exe thiếu file dữ liệu của thư viện phụ, hoặc model tải về chưa xong). "
                "Chạy lại build.bat bản mới; nếu vẫn lỗi, gửi file AnimStudioData\\animstudio.log.")
    try:
        sys.stderr.write("[VieNeu] " + "".join(traceback.format_exception(type(e), e, e.__traceback__))[-3000:] + "\n")
        sys.stderr.flush()
    except Exception:
        pass
    return msg[:520]


G2P_BIN = "sea_g2p.bin"
_G2P_LOCK = threading.Lock()


def _http_get(url, to=None, timeout=60):
    """GET: tra ve bytes, hoac (co 'to') ghi thang xuong tep roi tra ve so byte. Co the thay trong test."""
    import urllib.request
    req = urllib.request.Request(url, headers={"User-Agent": "AnimStudio"})
    with urllib.request.urlopen(req, timeout=timeout) as r:
        if to is None:
            return r.read()
        n = 0
        with open(to, "wb") as f:
            while True:
                b = r.read(1 << 20)
                if not b:
                    return n
                f.write(b)
                n += len(b)


def _download_g2p_bin(dst, ver=""):
    """sea_g2p.bin khong co trong ban .exe -> tai goi (wheel) sea-g2p tu PyPI roi lay tep nay ra (mot lan, ~vai chuc MB). Nem RuntimeError neu khong tai duoc."""
    info = json.loads(_http_get("https://pypi.org/pypi/sea-g2p/json", timeout=30).decode("utf-8", "ignore"))
    urls = (info.get("releases") or {}).get(ver) or info.get("urls") or []
    wheels = [u for u in urls if u.get("packagetype") == "bdist_wheel" and u.get("url")]
    if not wheels:
        raise RuntimeError("PyPI không có bản sea-g2p để lấy file dữ liệu")
    wheels.sort(key=lambda u: (0 if "win_amd64" in u.get("filename", "") else 1, int(u.get("size") or 0)))
    os.makedirs(os.path.dirname(dst), exist_ok=True)
    tmp_whl, tmp_bin = dst + ".whl.tmp", dst + ".tmp"
    try:
        _http_get(wheels[0]["url"], to=tmp_whl, timeout=180)
        with zipfile.ZipFile(tmp_whl) as z:
            nm = next((n for n in z.namelist() if n.replace("\\", "/").endswith("/" + G2P_BIN) or n == G2P_BIN), None)
            if nm is None:
                raise RuntimeError("gói sea-g2p tải về không chứa %s" % G2P_BIN)
            with z.open(nm) as src, open(tmp_bin, "wb") as out:
                shutil.copyfileobj(src, out, 1 << 20)
        if os.path.getsize(tmp_bin) < (1 << 20):
            raise RuntimeError("file %s tải về quá nhỏ (hỏng)" % G2P_BIN)
        os.replace(tmp_bin, dst)
    finally:
        for f in (tmp_whl, tmp_bin):
            try:
                os.remove(f)
            except OSError:
                pass
    return dst


def ensure_g2p_data():
    """VieNeu dung thu vien phien am sea_g2p can file du lieu sea_g2p.bin canh ma cua no. Ban .exe build thieu file nay -> 'OSError ... (os error 2) [tai g2p.py:34 __init__]'.
    Ham nay: co file thi thoi; thieu thi tim ban sao (AnimStudioData\\vieneu_data, canh chuong trinh), khong co thi TAI tu PyPI mot lan, roi chi cho sea_g2p dung file do.
    Nem RuntimeError (tieng Viet) neu van khong co. Khong co sea_g2p (ban VieNeu khac) -> khong lam gi."""
    import importlib.util as iu
    try:
        sp = iu.find_spec("sea_g2p")
    except Exception:
        sp = None
    if sp is None or not sp.origin:
        return ""
    pkg = os.path.dirname(os.path.abspath(sp.origin))
    want = os.path.join(pkg, G2P_BIN)
    if os.path.isfile(want):
        return ""
    with _G2P_LOCK:
        if os.path.isfile(want):
            return ""
        keep = os.path.join(DATA_DIR, "vieneu_data", G2P_BIN)
        alt = next((c for c in (keep, os.path.join(APP_DIR, "sea_g2p", G2P_BIN), os.path.join(APP_DIR, "_internal", "sea_g2p", G2P_BIN)) if os.path.isfile(c) and os.path.getsize(c) > (1 << 20)), "")
        if not alt:
            try:
                sys.stderr.write("[VieNeu] thieu %s canh sea_g2p (%s) -> dang tai tu PyPI...\n" % (G2P_BIN, pkg))
                ver = ""
                try:
                    import importlib.metadata as md
                    ver = md.version("sea-g2p")
                except Exception:
                    pass
                alt = _download_g2p_bin(keep, ver)
            except Exception as e:
                raise RuntimeError("bản .exe thiếu file dữ liệu %s của thư viện sea_g2p và tool không tải bù được (%s: %s). Chạy lại build.bat bản mới "
                                   "(đã có bước chép đủ file dữ liệu), hoặc kiểm tra mạng rồi thử lại." % (G2P_BIN, type(e).__name__, " ".join(str(e).split())[:120]))
        try:
            shutil.copy2(alt, want)                          # thu muc cai dat ghi duoc: dat luon canh ma
            return ""
        except OSError:
            pass
        try:                                                 # khong ghi duoc (vd Program Files): chi cho sea_g2p doc file o cho khac
            import sea_g2p.g2p as _g
            orig = _g._RustG2P

            def patched(path, *a, **k):
                return orig(path if os.path.isfile(path) else alt, *a, **k)
            _g._RustG2P = patched
        except Exception as e:
            raise RuntimeError("không nạp được %s cho sea_g2p (%s)" % (G2P_BIN, e))
    return ""


class VieneuProvider(Provider):
    """Dung ref\\*.wav hoac voices\\*.wav canh file chay (ten file = ten giong)."""
    def __init__(self, nano=False):
        vieneu_env()
        ensure_g2p_data()
        from vieneu import Vieneu
        self.tts = Vieneu(mode="v3nano" if nano else "v3turbo")
        self.sr = getattr(self.tts, "sample_rate", None) or (24000 if nano else 48000)
        self.refs, self.enrolled = {}, set()
        for p in (user_voice_dir(), os.path.join(APP_DIR, "voices"), os.path.join(APP_DIR, "ref")):         # giong tu them o giao dien (AnimStudioData\\voices) + file dat tay canh chuong trinh
            if os.path.isdir(p):
                for f in sorted(os.listdir(p)):
                    if f.lower().endswith(".wav"):
                        self.refs.setdefault(os.path.splitext(f)[0], os.path.join(p, f))

    def list_names(self):
        return list(self.refs)

    def synth(self, text, voice, emotion="neutral", energy=1.0):
        name = voice["name"]
        if voice.get("preset"):                      # giong co san cua VieNeu (khong can file mau)
            a = np.asarray(self.tts.infer(text, voice=name), dtype=np.float32).reshape(-1)
            if self.sr != SR and len(a):
                a = np.interp(np.linspace(0, len(a) - 1, int(len(a) * SR / self.sr)), np.arange(len(a)), a).astype(np.float32)
            return a
        path = self.refs.get(name) or next(iter(self.refs.values()), None)
        if path is None:
            raise RuntimeError("Chưa có file mẫu .wav trong thư mục 'voices' cạnh chương trình.")
        try:
            if name not in self.enrolled:
                self.tts.add_voice(name, path)
                self.enrolled.add(name)
            a = self.tts.infer(text, voice=name, denoise=True)
        except TypeError:
            a = self.tts.infer(text, voice=name)
        except Exception:
            a = self.tts.infer(text, ref_audio=path)
        a = np.asarray(a, dtype=np.float32).reshape(-1)
        if self.sr != SR and len(a):
            a = np.interp(np.linspace(0, len(a) - 1, int(len(a) * SR / self.sr)), np.arange(len(a)), a).astype(np.float32)
        return a


class HybridProvider(Provider):
    """Giong Microsoft online + giong cua ban (nhan ban tu voices/*.wav bang VieNeu). Dung DUNG giong da chon: giong VieNeu / clone khong chay duoc thi bao loi ro ly do,
    KHONG tu doc thay bang giong Microsoft."""
    def __init__(self):
        self.warn = []
        self.edge = EdgeProvider(self.warn)
        self.mine = None
        self.mine_err = ""
        self.fell_back = False

    def _custom(self):
        if self.mine is None and not self.mine_err:
            try:
                self.mine = VieneuProvider()
            except ImportError as e:
                self.mine_err = "chưa cài / chưa nạp được thư viện vieneu (" + str(e)[:120] + ((" [tại " + err_where(e) + "]") if err_where(e) else "") + "). Chạy lại build.bat; nếu vẫn báo thiếu thì dùng Python 3.11 hoặc 3.12"
            except Exception as e:
                self.mine_err = vieneu_error(e)
        return self.mine

    def synth(self, text, voice, emotion="neutral", energy=1.0):
        self.fell_back = False
        if voice.get("custom") or voice.get("preset"):
            p = self._custom()
            if p is not None:
                try:
                    return p.synth(text, voice, emotion, energy)
                except Exception as e:
                    self.mine_err = vieneu_error(e)
            raise RuntimeError(f"Giọng VieNeu / clone «{voice.get('name', '')}» chưa chạy được: {self.mine_err or 'thiếu thư viện vieneu'}. "
                               "Tool không tự đổi sang giọng khác; hãy cài VieNeu (chạy lại build.bat) hoặc chọn giọng Microsoft ở mục Giọng đọc.")
        return self.edge.synth(text, voice, emotion, energy)

    def clone_problem(self):
        """Ly do giong clone / giong VieNeu khong dung duoc ('' = dung duoc hoac chua thu)."""
        return self.mine_err


def make_provider(kind):
    if kind == PROVIDERS[0]:
        return HybridProvider()
    if kind == PROVIDERS[1]:
        return VieneuProvider()
    if kind == PROVIDERS[AZURE_IDX]:
        return AzureProvider()
    return FakeProvider()


def line_lang(text, project_lang_forced=None):
    return project_lang_forced or detect_lang(text)
