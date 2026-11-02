# -*- coding: utf-8 -*-
"""Tien ich dung chung: font, toan hoc, tim ffmpeg, nhan dien ngon ngu."""
import os, sys, re, math, zlib, shutil, unicodedata
from functools import lru_cache
from PIL import Image, ImageDraw, ImageFont

# Chay tu ma nguon / tu PyInstaller (sys.frozen) / tu ban bien dich Nuitka (bien __compiled__ co o moi module da dich)
COMPILED = "__compiled__" in globals()
FROZEN = bool(getattr(sys, "frozen", False)) or COMPILED
# Thu muc chua tai nguyen (characters/, backgrounds/, voices/, samples/). Bien moi truong ANIMSTUDIO_HOME (neu dat) tro sang thu muc khac (dung khi kiem thu).
EMBEDDED = bool(os.environ.get("ANIMSTUDIO_HOME"))
if getattr(sys, "frozen", False):
    _EXE_DIR = os.path.dirname(os.path.abspath(sys.executable))
elif COMPILED:
    _EXE_DIR = os.path.dirname(os.path.abspath(sys.argv[0] or sys.executable))
else:
    _EXE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
APP_DIR = os.environ.get("ANIMSTUDIO_HOME") or _EXE_DIR
os.environ["PATH"] = APP_DIR + os.pathsep + os.environ.get("PATH", "")

# Du lieu nguoi dung (anh da ve, giong, du an, cau hinh) nam NGOAI thu muc cai dat de cap nhat/giai nen ban moi khong mat.
DATA_DIR = os.environ.get("ANIMSTUDIO_DATA") or os.path.join(os.path.expanduser("~"), "AnimStudioData")


def _migrate():
    if EMBEDDED:
        return
    try:
        os.makedirs(DATA_DIR, exist_ok=True)
        par = os.path.dirname(APP_DIR)
        sibs = []
        try:
            for d in os.listdir(par):
                p = os.path.join(par, d)
                if p != APP_DIR and os.path.isdir(p) and "anim" in d.lower():
                    sibs.append(p)
        except Exception:
            pass
        sibs.sort(key=lambda p: os.path.getmtime(p), reverse=True)
        for nm in ("cache", "projects", "chrome_profile", "config.json"):
            dst = os.path.join(DATA_DIR, nm)
            for base in [APP_DIR] + sibs:
                src = os.path.join(base, nm)
                if not os.path.exists(src):
                    continue
                try:
                    if os.path.isfile(src):
                        if not os.path.exists(dst):
                            shutil.move(src, dst)
                        continue
                    # GOP thu muc: chi chuyen cac file chua co o dich (khong ghi de), de cache cu khong bi bo roi khi dich da ton tai
                    for dp, dns, fns in os.walk(src):
                        rel = os.path.relpath(dp, src)
                        td = dst if rel == "." else os.path.join(dst, rel)
                        os.makedirs(td, exist_ok=True)
                        for fn in fns:
                            t = os.path.join(td, fn)
                            sp = os.path.join(dp, fn)
                            try:
                                # ket qua AI (cache/ai): ban CU HON thang -> cac anh da ve tu ban do, de khong phai doc/ve lai
                                older = nm == "cache" and rel.replace("\\", "/") == "ai" and os.path.exists(t) and os.path.getmtime(sp) < os.path.getmtime(t)
                                if not os.path.exists(t) or older:
                                    shutil.move(sp, t) if not older else (os.replace(sp, t))
                            except Exception:
                                pass
                except Exception:
                    pass
    except Exception:
        pass


_migrate()

# Luu anh NGUYEN TU (ghi file tam roi doi ten): mat dien giua luc ghi khong de lai anh hong trong cache.
from PIL import Image as _PI
_orig_save = _PI.Image.save


def _atomic_save(self, fp, format=None, **params):
    if isinstance(fp, (str, os.PathLike)):
        fp = os.fspath(fp)
        ext = os.path.splitext(fp)[1].lower()
        fmt = format or _PI.registered_extensions().get(ext)
        tmp = fp + ".tmp_save"
        try:
            _orig_save(self, tmp, format=fmt, **params)
            os.replace(tmp, fp)
        finally:
            if os.path.exists(tmp):
                try:
                    os.remove(tmp)
                except OSError:
                    pass
        return
    return _orig_save(self, fp, format=format, **params)


_PI.Image.save = _atomic_save

_REG = ["C:/Windows/Fonts/segoeui.ttf", "C:/Windows/Fonts/arial.ttf", "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf",
        "/Library/Fonts/Arial.ttf", "/System/Library/Fonts/Supplemental/Arial.ttf"]
_BLD = ["C:/Windows/Fonts/segoeuib.ttf", "C:/Windows/Fonts/arialbd.ttf", "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf",
        "/Library/Fonts/Arial Bold.ttf", "/System/Library/Fonts/Supplemental/Arial Bold.ttf"]
_SER = ["C:/Windows/Fonts/georgiab.ttf", "C:/Windows/Fonts/timesbd.ttf", "/usr/share/fonts/truetype/dejavu/DejaVuSerif-Bold.ttf"]


@lru_cache(maxsize=64)
def font(size, kind="regular"):
    cands = {"regular": _REG, "bold": _BLD, "serif": _SER}[kind]
    for p in cands:
        if os.path.exists(p):
            try:
                return ImageFont.truetype(p, int(size))
            except Exception:
                pass
    return ImageFont.load_default()


# ---- Phu de: chon font chu (tab 'Ve ra'). Chi liet ke font CO TREN MAY (Windows co san Segoe UI, Arial, Tahoma...) + font .ttf/.otf nguoi dung bo vao thu muc <du lieu>/fonts.
# (id, ten hien thi, duong dan ban thuong, duong dan ban dam). Co ca duong dan Linux/macOS de chay thu duoc ngoai Windows.
_FD = "C:/Windows/Fonts/"
_LX = "/usr/share/fonts/truetype/"
SUB_FONTS = [
    ("segoe", "Segoe UI", [_FD + "segoeui.ttf"], [_FD + "segoeuib.ttf"]),
    ("arial", "Arial", [_FD + "arial.ttf", _LX + "liberation/LiberationSans-Regular.ttf", "/Library/Fonts/Arial.ttf"], [_FD + "arialbd.ttf", _LX + "liberation/LiberationSans-Bold.ttf", "/Library/Fonts/Arial Bold.ttf"]),
    ("tahoma", "Tahoma", [_FD + "tahoma.ttf"], [_FD + "tahomabd.ttf"]),
    ("verdana", "Verdana", [_FD + "verdana.ttf"], [_FD + "verdanab.ttf"]),
    ("calibri", "Calibri", [_FD + "calibri.ttf", _LX + "crosextra/Carlito-Regular.ttf"], [_FD + "calibrib.ttf", _LX + "crosextra/Carlito-Bold.ttf"]),
    ("trebuchet", "Trebuchet MS", [_FD + "trebuc.ttf"], [_FD + "trebucbd.ttf"]),
    ("times", "Times New Roman", [_FD + "times.ttf", _LX + "liberation/LiberationSerif-Regular.ttf"], [_FD + "timesbd.ttf", _LX + "liberation/LiberationSerif-Bold.ttf"]),
    ("georgia", "Georgia", [_FD + "georgia.ttf"], [_FD + "georgiab.ttf"]),
    ("comic", "Comic Sans MS", [_FD + "comic.ttf"], [_FD + "comicbd.ttf"]),
    ("consolas", "Consolas", [_FD + "consola.ttf"], [_FD + "consolab.ttf"]),
    ("dejavu", "DejaVu Sans", [_LX + "dejavu/DejaVuSans.ttf"], [_LX + "dejavu/DejaVuSans-Bold.ttf"]),
    # --- font DA NGON NGU: moi font ve duoc chu cua mot (nhom) ngon ngu; chi hien o danh sach neu may co that. Phu de co chu khac ma font dang chon khong co -> tu doi sang font dung chu do (xem text_font)
    ("msyh", "Microsoft YaHei (Trung giản thể)", [_FD + "msyh.ttc", _FD + "msyh.ttf"], [_FD + "msyhbd.ttc", _FD + "msyhbd.ttf"]),
    ("msjh", "Microsoft JhengHei (Trung phồn thể)", [_FD + "msjh.ttc", _FD + "msjh.ttf"], [_FD + "msjhbd.ttc", _FD + "msjhbd.ttf"]),
    ("simhei", "SimHei (Trung, nét đậm)", [_FD + "simhei.ttf"], []),
    ("simsun", "SimSun (Trung, kiểu Tống)", [_FD + "simsun.ttc#0"], []),
    ("kaiti", "KaiTi (Trung, kiểu thư pháp)", [_FD + "simkai.ttf"], []),
    ("yugothic", "Yu Gothic (Nhật)", [_FD + "YuGothR.ttc#0", _FD + "yugothic.ttf"], [_FD + "YuGothB.ttc#0", _FD + "YuGothB.ttc"]),
    ("meiryo", "Meiryo (Nhật)", [_FD + "meiryo.ttc#0"], [_FD + "meiryob.ttc#0"]),
    ("msgothic", "MS Gothic (Nhật)", [_FD + "msgothic.ttc#0"], []),
    ("malgun", "Malgun Gothic (Hàn)", [_FD + "malgun.ttf"], [_FD + "malgunbd.ttf"]),
    ("gulim", "Gulim (Hàn)", [_FD + "gulim.ttc#0"], []),
    ("leelawadee", "Leelawadee UI (Thái, Lào)", [_FD + "LeelawUI.ttf"], [_FD + "LeelaUIb.ttf"]),
    ("nirmala", "Nirmala UI (Hindi, Bengal, Tamil, Telugu, Gujarat, Kannada, Malayalam, Sinhala…)", [_FD + "Nirmala.ttf", _FD + "Nirmala.ttc#0"], [_FD + "NirmalaB.ttf", _FD + "NirmalaB.ttc#0"]),
    ("myanmar", "Myanmar Text (Myanmar)", [_FD + "mmrtext.ttf"], [_FD + "mmrtextb.ttf"]),
    ("khmerui", "Khmer UI (Khmer)", [_FD + "KhmerUI.ttf"], [_FD + "KhmerUIb.ttf"]),
    ("laoui", "Lao UI (Lào)", [_FD + "LaoUI.ttf"], [_FD + "LaoUIb.ttf"]),
    ("ebrima", "Ebrima (Ethiopia, châu Phi)", [_FD + "ebrima.ttf"], [_FD + "ebrimabd.ttf"]),
    ("sylfaen", "Sylfaen (Georgia, Armenia, Hy Lạp)", [_FD + "sylfaen.ttf"], []),
    ("noto", "Noto Sans (nhiều ngôn ngữ)", [_LX + "noto/NotoSans-Regular.ttf", "/usr/share/fonts/noto/NotoSans-Regular.ttf", "/usr/share/fonts/google-noto/NotoSans-Regular.ttf"],
     [_LX + "noto/NotoSans-Bold.ttf", "/usr/share/fonts/noto/NotoSans-Bold.ttf", "/usr/share/fonts/google-noto/NotoSans-Bold.ttf"]),
    ("notocjk_sc", "Noto Sans CJK SC (Trung giản thể)", ["/usr/share/fonts/opentype/noto/NotoSansCJK-Regular.ttc#2", "/usr/share/fonts/truetype/noto/NotoSansCJK-Regular.ttc#2"],
     ["/usr/share/fonts/opentype/noto/NotoSansCJK-Bold.ttc#2", "/usr/share/fonts/truetype/noto/NotoSansCJK-Bold.ttc#2"]),
    ("notocjk_tc", "Noto Sans CJK TC (Trung phồn thể)", ["/usr/share/fonts/opentype/noto/NotoSansCJK-Regular.ttc#3", "/usr/share/fonts/truetype/noto/NotoSansCJK-Regular.ttc#3"],
     ["/usr/share/fonts/opentype/noto/NotoSansCJK-Bold.ttc#3", "/usr/share/fonts/truetype/noto/NotoSansCJK-Bold.ttc#3"]),
    ("notocjk_jp", "Noto Sans CJK JP (Nhật)", ["/usr/share/fonts/opentype/noto/NotoSansCJK-Regular.ttc#0", "/usr/share/fonts/truetype/noto/NotoSansCJK-Regular.ttc#0"],
     ["/usr/share/fonts/opentype/noto/NotoSansCJK-Bold.ttc#0", "/usr/share/fonts/truetype/noto/NotoSansCJK-Bold.ttc#0"]),
    ("notocjk_kr", "Noto Sans CJK KR (Hàn)", ["/usr/share/fonts/opentype/noto/NotoSansCJK-Regular.ttc#1", "/usr/share/fonts/truetype/noto/NotoSansCJK-Regular.ttc#1"],
     ["/usr/share/fonts/opentype/noto/NotoSansCJK-Bold.ttc#1", "/usr/share/fonts/truetype/noto/NotoSansCJK-Bold.ttc#1"]),
]
# nhom chu ma font ve duoc (chi de hien thi / loc; ma nhom theo langs.font_script)
FONT_SCRIPTS = {"msyh": ["zh"], "msjh": ["tw", "hk"], "simhei": ["zh"], "simsun": ["zh"], "kaiti": ["zh"], "yugothic": ["ja"], "meiryo": ["ja"], "msgothic": ["ja"], "malgun": ["ko"], "gulim": ["ko"],
                "leelawadee": ["th", "lo"], "nirmala": ["hi", "bn", "ta", "te", "gu", "kn", "ml", "si"], "myanmar": ["my"], "khmerui": ["km"], "laoui": ["lo"], "ebrima": ["am"],
                "sylfaen": ["ka", "hy", "el"], "segoe": ["el", "he", "ar", "hy", "ka"], "arial": ["el", "he", "ar"], "tahoma": ["th", "el", "he", "ar"], "times": ["el", "he", "ar"],
                "noto": ["el", "he", "ar", "hy", "ka"], "notocjk_sc": ["zh"], "notocjk_tc": ["tw", "hk"], "notocjk_jp": ["ja"], "notocjk_kr": ["ko"]}
USER_FONT_DIR = os.path.join(DATA_DIR, "fonts")
BUNDLED_FONT_DIR = os.path.join(APP_DIR, "fonts")        # font di kem tool (Bangers, ban OFL): <thu muc cai dat>/fonts — may nao cung co, khong can cai
BUNDLED_FONTS = [("bangers", "Bangers", "Bangers-Regular.ttf")]


def bundled_font_path(fid):
    """Duong dan file font di kem tool theo id ('' neu khong co)."""
    for k_, _l, fn in BUNDLED_FONTS:
        if k_ == fid:
            p_ = os.path.join(BUNDLED_FONT_DIR, fn)
            return p_ if os.path.isfile(p_) else ""
    return ""


def _split_idx(p):
    """'C:/Windows/Fonts/msyh.ttc#1' -> ('C:/Windows/Fonts/msyh.ttc', 1) (file .ttc chua nhieu font: #chi so)."""
    if "#" in p:
        a, _h, b = p.rpartition("#")
        if b.isdigit():
            return a, int(b)
    return p, 0


def _first_exist(paths):
    for p_ in paths:
        if os.path.isfile(_split_idx(p_)[0]):
            return p_
    return ""


def _open_font(p, size):
    path, idx = _split_idx(p)
    return ImageFont.truetype(path, int(size), index=idx)


def user_fonts():
    """[(ten file, duong dan)] cac font .ttf/.otf nguoi dung tu bo vao <du lieu>/fonts."""
    try:
        return [(f, os.path.join(USER_FONT_DIR, f)) for f in sorted(os.listdir(USER_FONT_DIR)) if f.lower().endswith((".ttf", ".otf")) and os.path.isfile(os.path.join(USER_FONT_DIR, f))]
    except OSError:
        return []


def sub_fonts():
    """Danh sach font dung duoc cho phu de: [{id, label, user, bold}] (font he thong co that tren may + font cua nguoi dung)."""
    out = []
    for fid, label, reg, bld in SUB_FONTS:
        if _first_exist(reg):
            out.append(dict(id=fid, label=label, user=False, bold=bool(_first_exist(bld)), sc=FONT_SCRIPTS.get(fid, [])))
    for k_, label, _fn in BUNDLED_FONTS:
        if bundled_font_path(k_):
            out.append(dict(id=k_, label=label, user=False, bold=False, bundled=True, sc=[]))
    for fn, _p in user_fonts():
        out.append(dict(id="u:" + fn, label=os.path.splitext(fn)[0], user=True, bold=False, sc=[]))
    return out


@lru_cache(maxsize=64)
def sub_font(fid, size, bold=True):
    """Font phu de theo id ('' / khong tim thay -> font mac dinh cua tool, giong truoc day)."""
    fid = str(fid or "")
    try:
        if fid.startswith("u:"):
            p_ = os.path.join(USER_FONT_DIR, os.path.basename(fid[2:]))
            if os.path.isfile(p_):
                return ImageFont.truetype(p_, int(size))
        elif bundled_font_path(fid):
            return ImageFont.truetype(bundled_font_path(fid), int(size))
        else:
            for k_, _l, reg, bld in SUB_FONTS:
                if k_ == fid:
                    p_ = (_first_exist(bld) if bold else "") or _first_exist(reg)
                    if p_:
                        return _open_font(p_, size)
    except Exception:
        pass
    return font(size, "bold" if bold else "regular")


# ---- Font cho chu Han / Nhat / Han / Thai / Hindi / Arap (Segoe UI va Arial KHONG co cac chu nay -> hien o vuong). (duong dan, chi so trong file .ttc)
_NT = ["/usr/share/fonts/opentype/noto/", "/usr/share/fonts/truetype/noto/"]
_SCRIPT_FONTS = {
    "zh": ([(_FD + "msyh.ttc", 0), (_FD + "msyh.ttf", 0), (_FD + "Deng.ttf", 0), (_FD + "simsun.ttc", 0)] + [(d + "NotoSansCJK-Regular.ttc", 2) for d in _NT]
           + [("/System/Library/Fonts/PingFang.ttc", 0)],
           [(_FD + "msyhbd.ttc", 0), (_FD + "msyhbd.ttf", 0), (_FD + "Dengb.ttf", 0), (_FD + "simsun.ttc", 0)] + [(d + "NotoSansCJK-Bold.ttc", 2) for d in _NT]
           + [("/System/Library/Fonts/PingFang.ttc", 0)]),
    "tw": ([(_FD + "msjh.ttc", 0), (_FD + "mingliu.ttc", 0)] + [(d + "NotoSansCJK-Regular.ttc", 3) for d in _NT] + [("/System/Library/Fonts/PingFang.ttc", 0)],
           [(_FD + "msjhbd.ttc", 0), (_FD + "mingliu.ttc", 0)] + [(d + "NotoSansCJK-Bold.ttc", 3) for d in _NT] + [("/System/Library/Fonts/PingFang.ttc", 0)]),
    "hk": ([(_FD + "msjh.ttc", 0), (_FD + "mingliu.ttc", 0)] + [(d + "NotoSansCJK-Regular.ttc", 4) for d in _NT] + [("/System/Library/Fonts/PingFang.ttc", 0)],
           [(_FD + "msjhbd.ttc", 0), (_FD + "mingliu.ttc", 0)] + [(d + "NotoSansCJK-Bold.ttc", 4) for d in _NT] + [("/System/Library/Fonts/PingFang.ttc", 0)]),
    "ja": ([(_FD + "YuGothR.ttc", 0), (_FD + "meiryo.ttc", 0), (_FD + "msgothic.ttc", 0)] + [(d + "NotoSansCJK-Regular.ttc", 0) for d in _NT]
           + [("/System/Library/Fonts/Hiragino Sans GB.ttc", 0), ("/System/Library/Fonts/ヒラギノ角ゴシック W3.ttc", 0)],
           [(_FD + "YuGothB.ttc", 0), (_FD + "meiryob.ttc", 0), (_FD + "msgothic.ttc", 0)] + [(d + "NotoSansCJK-Bold.ttc", 0) for d in _NT]
           + [("/System/Library/Fonts/ヒラギノ角ゴシック W6.ttc", 0)]),
    "ko": ([(_FD + "malgun.ttf", 0), (_FD + "gulim.ttc", 0)] + [(d + "NotoSansCJK-Regular.ttc", 1) for d in _NT] + [("/System/Library/Fonts/AppleSDGothicNeo.ttc", 0)],
           [(_FD + "malgunbd.ttf", 0), (_FD + "gulim.ttc", 0)] + [(d + "NotoSansCJK-Bold.ttc", 1) for d in _NT] + [("/System/Library/Fonts/AppleSDGothicNeo.ttc", 0)]),
    "th": ([(_FD + "LeelawUI.ttf", 0), (_FD + "leelawui.ttf", 0), (_FD + "tahoma.ttf", 0), ("/usr/share/fonts/truetype/tlwg/Loma.ttf", 0)],
           [(_FD + "LeelaUIb.ttf", 0), (_FD + "leelauib.ttf", 0), (_FD + "tahomabd.ttf", 0), ("/usr/share/fonts/truetype/tlwg/Loma-Bold.ttf", 0)]),
    "hi": ([(_FD + "Nirmala.ttf", 0), (_FD + "Nirmala.ttc", 0), (_FD + "mangal.ttf", 0), ("/usr/share/fonts/truetype/lohit-devanagari/Lohit-Devanagari.ttf", 0)],
           [(_FD + "NirmalaB.ttf", 0), (_FD + "NirmalaB.ttc", 0), (_FD + "mangalb.ttf", 0), ("/usr/share/fonts/truetype/lohit-devanagari/Lohit-Devanagari.ttf", 0)]),
    "ar": ([(_FD + "segoeui.ttf", 0), (_FD + "tahoma.ttf", 0), (_FD + "arial.ttf", 0), ("/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf", 0)],
           [(_FD + "segoeuib.ttf", 0), (_FD + "tahomabd.ttf", 0), (_FD + "arialbd.ttf", 0), ("/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf", 0)]),
}


# --- chu viet con lai (1.3.6): Hy Lap, Do Thai, An Do (Bengal, Tamil, Telugu, Gujarat, Kannada, Malayalam, Sinhala), Myanmar, Khmer, Lao, Georgia, Armenia, Ethiopia.
# Windows: Segoe UI / Nirmala UI / Myanmar Text / Khmer UI / Lao UI / Sylfaen / Ebrima (co san tu Windows 8/10); Linux / macOS: Noto Sans <chu> neu co. Moi muc (duong dan, chi so).
_NOTO_DIRS = ["/usr/share/fonts/truetype/noto/", "/usr/share/fonts/opentype/noto/", "/usr/share/fonts/noto/", "/usr/share/fonts/google-noto/", "/usr/share/fonts/truetype/google-noto/"]


def _noto(name, bold=False):
    return [(d + "NotoSans%s-%s.ttf" % (name, "Bold" if bold else "Regular"), 0) for d in _NOTO_DIRS]


def _win(*names):
    return [(_FD + n, 0) for n in names]


_DJV = [("/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf", 0)]
_DJVB = [("/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf", 0)]
_SCRIPT_FONTS.update({
    "el": (_win("segoeui.ttf", "arial.ttf", "tahoma.ttf", "times.ttf") + _noto("") + _DJV, _win("segoeuib.ttf", "arialbd.ttf", "tahomabd.ttf", "timesbd.ttf") + _noto("", True) + _DJVB),
    "he": (_win("segoeui.ttf", "arial.ttf", "tahoma.ttf", "david.ttf") + _noto("Hebrew") + _DJV, _win("segoeuib.ttf", "arialbd.ttf", "tahomabd.ttf", "davidbd.ttf") + _noto("Hebrew", True) + _DJVB),
    "bn": (_win("Nirmala.ttf", "vrinda.ttf") + _noto("Bengali") + [("/usr/share/fonts/truetype/lohit-bengali/Lohit-Bengali.ttf", 0)], _win("NirmalaB.ttf", "vrindab.ttf") + _noto("Bengali", True)),
    "ta": (_win("Nirmala.ttf", "latha.ttf") + _noto("Tamil"), _win("NirmalaB.ttf", "lathab.ttf") + _noto("Tamil", True)),
    "te": (_win("Nirmala.ttf", "gautami.ttf") + _noto("Telugu"), _win("NirmalaB.ttf", "gautamib.ttf") + _noto("Telugu", True)),
    "gu": (_win("Nirmala.ttf", "shruti.ttf") + _noto("Gujarati"), _win("NirmalaB.ttf", "shrutib.ttf") + _noto("Gujarati", True)),
    "kn": (_win("Nirmala.ttf", "tunga.ttf") + _noto("Kannada"), _win("NirmalaB.ttf", "tungab.ttf") + _noto("Kannada", True)),
    "ml": (_win("Nirmala.ttf", "kartika.ttf") + _noto("Malayalam"), _win("NirmalaB.ttf", "kartikab.ttf") + _noto("Malayalam", True)),
    "si": (_win("Nirmala.ttf", "iskpota.ttf") + _noto("Sinhala"), _win("NirmalaB.ttf", "iskpotab.ttf") + _noto("Sinhala", True)),
    "my": (_win("mmrtext.ttf") + _noto("Myanmar"), _win("mmrtextb.ttf") + _noto("Myanmar", True)),
    "km": (_win("KhmerUI.ttf", "daunpenh.ttf") + _noto("Khmer"), _win("KhmerUIb.ttf", "daunpenh.ttf") + _noto("Khmer", True)),
    "lo": (_win("LaoUI.ttf", "dokchamp.ttf", "LeelawUI.ttf") + _noto("Lao"), _win("LaoUIb.ttf", "dokchamp.ttf", "LeelaUIb.ttf") + _noto("Lao", True)),
    "ka": (_win("sylfaen.ttf", "segoeui.ttf") + _noto("Georgian"), _win("sylfaen.ttf", "segoeuib.ttf") + _noto("Georgian", True)),
    "hy": (_win("sylfaen.ttf", "segoeui.ttf") + _noto("Armenian"), _win("sylfaen.ttf", "segoeuib.ttf") + _noto("Armenian", True)),
    "am": (_win("ebrima.ttf", "nyala.ttf") + _noto("Ethiopic"), _win("ebrimabd.ttf", "nyala.ttf") + _noto("Ethiopic", True)),
})
# hai tieng cung chu voi tieng khac: Urdu / Pashto / Ba Tu dung chu A Rap, Marathi / Nepal dung chu Devanagari (xem langs.font_script)


def script_font_path(script, bold=True):
    """(duong dan, chi so) font he thong cho nhom chu nay, hoac None neu may khong co font nao."""
    reg, bld = _SCRIPT_FONTS.get(script, ([], []))
    for p, i in (bld + reg) if bold else (reg + bld):
        if os.path.isfile(p):
            return p, i
    return None


@lru_cache(maxsize=64)
def script_font(script, size, bold=True):
    """Font ve duoc nhom chu nay (chu Han / Kana / Hangul / Thai / Devanagari / Arap), None neu may khong co."""
    r = script_font_path(script, bold)
    if not r:
        return None
    try:
        return ImageFont.truetype(r[0], int(size), index=r[1])
    except Exception:
        return None


_NOTDEF = "\U0010FFFF"


@lru_cache(maxsize=8192)
def _has_glyph(font_obj, ch):
    """Font co ve duoc ky tu nay khong (khong phai o vuong 'thieu chu')? So hinh ve cua ky tu voi hinh ve cua ma khong ton tai (.notdef)."""
    try:
        bb = font_obj.getbbox(ch)
        if not bb or bb[2] - bb[0] <= 0 or bb[3] - bb[1] <= 0:
            return False                                      # khong ve gi (khong phai dau cach / ky tu dieu khien) = thieu
        nb = font_obj.getbbox(_NOTDEF)
        if tuple(bb) != tuple(nb):
            return True
        w, h = bb[2] + 2, bb[3] + 2
        a = Image.new("L", (w, h), 0); ImageDraw.Draw(a).text((0, 0), ch, font=font_obj, fill=255)
        b = Image.new("L", (w, h), 0); ImageDraw.Draw(b).text((0, 0), _NOTDEF, font=font_obj, fill=255)
        return a.tobytes() != b.tobytes()
    except Exception:
        return True                                           # khong kiem tra duoc: coi nhu co (giu font nguoi dung chon)


def font_covers(font_obj, text):
    """Font ve DU moi ky tu (chu thuong, dau thanh) cua doan van nay? Ky tu ASCII / khoang trang / ky tu dieu khien (noi chu, huong chu) khong xet."""
    seen = set()
    for ch in str(text or ""):
        o = ord(ch)
        if o < 0x250 or ch in seen or ch.isspace() or unicodedata.category(ch) in ("Cc", "Cf"):
            continue
        seen.add(ch)
        if not _has_glyph(font_obj, ch):
            return False
    return True


def text_font(fid, size, bold, text, hint=""):
    """Font cho mot doan chu phu de. Chu Latin / Cyrillic: font nguoi dung chon nhu cu. Chu khac (Han / Nhat / Han / Thai / A Rap / Hindi / Hy Lap / Do Thai / Bengal / Myanmar...):
    dung font da chon NEU no ve du moi chu cua doan van (vd chon Microsoft YaHei cho tieng Trung, hoac font .ttf cua ban), khong du thi TU DOI sang font he thong dung chu do."""
    from . import langs
    sc = langs.font_script(text, hint)
    f = sub_font(fid, size, bold)
    if not sc or font_covers(f, text):
        return f
    g = script_font(sc, int(size), bool(bold))
    return g if g is not None else f


def ffmpeg():
    f = os.environ.get("ANIMSTUDIO_FFMPEG")
    if f and os.path.isfile(f):
        return f
    return shutil.which("ffmpeg") or "ffmpeg"


def clamp(x, a=0.0, b=1.0):
    return a if x < a else b if x > b else x


def lerp(a, b, t):
    return a + (b - a) * t


def smooth(t):
    t = clamp(t)
    return t * t * (3 - 2 * t)


def h01(s, salt=""):
    """So ngau nhien co dinh 0..1 tu chuoi."""
    return (zlib.crc32((str(s) + str(salt)).encode("utf-8")) & 0xFFFFFF) / 0xFFFFFF


def pick(lst, s, salt=""):
    return lst[int(h01(s, salt) * len(lst)) % len(lst)]


VI_CHARS = set("àáảãạăằắẳẵặâầấẩẫậèéẻẽẹêềếểễệìíỉĩịòóỏõọôồốổỗộơờớởỡợùúủũụưừứửữựỳýỷỹỵđ"
               "ÀÁẢÃẠĂẰẮẲẴẶÂẦẤẨẪẬÈÉẺẼẸÊỀẾỂỄỆÌÍỈĨỊÒÓỎÕỌÔỒỐỔỖỘƠỜỚỞỠỢÙÚỦŨỤƯỪỨỬỮỰỲÝỶỸỴĐ")


def detect_lang(text):
    """Ngon ngu cua doan van theo chu viet: vi, en, zh, ja, ko, th, ru, hi, ar (xem langs.py). Chu Latin khac (Phap, Duc...) tinh la 'en' — hay chon ngon ngu bang tay."""
    from . import langs
    return langs.detect(text)


def fmt_t(s):
    s = int(max(0, s))
    return f"{s // 3600}:{(s % 3600) // 60:02d}:{s % 60:02d}" if s >= 3600 else f"{s // 60}:{s % 60:02d}"
