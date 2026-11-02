# -*- coding: utf-8 -*-
"""Hinh cho cac hieu ung 'Ve ra' (reveal.py): ban tay cam but, cau be cam but / keo cuon tranh, cuon tranh, tay cam co.
TAT CA do AI (Google Flow) ve va duoc luu o props.py (khong co hinh ve bang code): chua co hinh nao thi ham tra ve None va hieu ung chay khong co hinh do.
Moi ham tra ve (anh RGBA, (ax, ay)) voi (ax, ay) la DIEM NEO (ngon but / ban tay cau be / giua canh tren cuon tranh) theo anh, hoac None."""
import os
import numpy as np
from PIL import Image, ImageFilter, ImageOps

_CACHE = {}


def clear_cache():
    _CACHE.clear()


def _real(key, h, fade=None):
    """Hinh do AI ve / do ban chon (props.py) cao h px, hoac None neu chua co. fade='ur' / 'dr': lam mo dan goc tren-phai / duoi-phai (cho co tay ao) de khong bi cat cut."""
    from . import props as _props
    if not _props.exists(key):
        return None
    try:
        mt = os.path.getmtime(_props.png_path(key))
    except OSError:
        return None
    ck = ("real", key, h, mt, fade)
    if ck in _CACHE:
        return _CACHE[ck]
    r = _props.load(key)
    if r is None:
        return None
    im, (tx, ty) = r
    sc = h / float(im.height)
    im = im.resize((max(1, int(im.width * sc)), max(1, int(h))), Image.LANCZOS)
    if fade:                                                          # tay ao bi mep anh cat ngang -> mo dan ve phia 2 mep do thay vi cat cut
        w, hh = im.size
        yy, xx = np.mgrid[0:hh, 0:w]
        dy = yy if fade == "ur" else (hh - 1 - yy)                    # khoang cach toi mep tren (tay vao tu tren-phai) / mep duoi (tay vao tu duoi-phai)
        d = np.minimum(w - 1 - xx, dy).astype(np.float32)
        t = np.clip(d / (0.14 * min(w, hh)), 0.0, 1.0)
        al = np.asarray(im.getchannel("A"), np.float32) * (t * t * (3 - 2 * t))
        im.putalpha(Image.fromarray(np.clip(al + 0.5, 0, 255).astype(np.uint8)))
    res = (im, (int(tx * sc), int(ty * sc)))
    if len(_CACHE) > 14:
        _CACHE.clear()
    _CACHE[ck] = res
    return res


def hand_pen(h=220):
    """Ban tay cam but (canh tay vao tu goc tren-phai), ngon but huong xuong-trai; (ax, ay) = ngon but. None neu chua co hinh AI."""
    return _real("hand", h, fade="ur")


def brush_hand(h=220):
    """Tay cam co (kieu net co): dau co o goc TREN-TRAI, tay ao di vao tu goc DUOI-PHAI. None neu chua co hinh AI."""
    return _real("brush", h, fade="dr")


def boy(h=320, mode="pen"):
    """Cau be nhin sang phai: mode='pen' cam but (neo = ngon but), mode='hold' keo cuon tranh (neo = ban tay). None neu chua co hinh AI."""
    return _real("boy" if mode == "pen" else "boyhold", h)


def scroll_roll(h, w=None):
    """Cuon tranh dung cao h px: (anh RGBA, (tam x, 0)). None neu chua co hinh AI."""
    r = _real("roll", h)
    return None if r is None else (r[0], (r[0].width // 2, 0))


def flip(sp):
    """Lat guong hinh (anh, (ax, ay)) theo chieu ngang (cau be chay nguoc lai) -> diem neo cung lat theo."""
    if sp is None:
        return None
    return ImageOps.mirror(sp[0]), (sp[0].width - 1 - sp[1][0], sp[1][1])


def paste(base, spr, x, y, ax=0, ay=0, shadow=True):
    """Dan hinh RGBA len base sao cho diem neo (ax, ay) cua hinh roi vao (x, y). Chi xu ly phan nam trong khung (nhanh khi hinh to / tran ra ngoai)."""
    x0, y0 = int(round(x - ax)), int(round(y - ay))
    hh = spr.height
    W, H = base.size
    m = 30
    sx0, sy0 = max(0, -x0 - m), max(0, -y0 - m)
    sx1, sy1 = min(spr.width, W - x0 + m), min(spr.height, H - y0 + m)
    if sx1 <= sx0 or sy1 <= sy0:
        return base
    if (sx0, sy0, sx1, sy1) != (0, 0, spr.width, spr.height):
        spr = spr.crop((sx0, sy0, sx1, sy1))
        x0, y0 = x0 + sx0, y0 + sy0
    if shadow:
        k = max(0.18, min(1.0, hh / 400.0))                          # bong theo co hinh (hinh nho thi bong nho)
        sh = Image.new("RGBA", spr.size, (0, 0, 0, 0))
        sh.putalpha(spr.getchannel("A").point(lambda a: int(a * 0.28)))
        sh = sh.filter(ImageFilter.GaussianBlur(max(1.0, 5 * k)))
        base.paste(sh, (x0 + int(8 * k), y0 + int(10 * k)), sh)
    base.paste(spr, (x0, y0), spr)
    return base
