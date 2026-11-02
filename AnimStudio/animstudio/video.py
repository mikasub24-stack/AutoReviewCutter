# -*- coding: utf-8 -*-
"""Dung khung hinh (2D / 3D / nguoi que), tieu de, phu de, hieu ung phim va ma hoa MP4 bang ffmpeg."""
import os, sys, math, time, subprocess, tempfile, threading
import numpy as np
from PIL import Image, ImageChops, ImageDraw, ImageFilter
from .common import APP_DIR, DATA_DIR, ffmpeg, font, sub_font, text_font, clamp, smooth, fmt_t
from . import langs
from .art import PAL, vgrad, shade, mixc
from .audio import mix, write_wav
from .timeline import split_subs

SPK_COLS = [(255, 214, 90), (120, 220, 255), (255, 140, 150), (150, 255, 170), (210, 170, 255), (255, 176, 90), (240, 240, 250)]
ERA_NAME = {"modern": "HIỆN ĐẠI", "ancient": "NGUYÊN THỦY", "war": "CHIẾN TRANH", "imperial": "PHONG KIẾN"}

_P = None
_cache = {}


def _vignette(W, H):
    k = ("vig", W, H)
    if k not in _cache:
        yy, xx = np.mgrid[0:H, 0:W].astype(np.float32)
        d = np.sqrt(((xx - W / 2) / (W / 2)) ** 2 + ((yy - H / 2) / (H / 2)) ** 2)
        _cache[k] = (1 - 0.34 * np.clip(d - 0.55, 0, 1) ** 1.6)[..., None]
    return _cache[k]


def _grain(W, H, frame):
    k = ("grain", W, H)
    if k not in _cache:
        rng = np.random.RandomState(3)
        _cache[k] = (rng.randn(H + 64, W + 64) * 2.0).astype(np.float32)
    g = _cache[k]
    r = np.random.RandomState(frame % 24)
    ox, oy = r.randint(0, 64), r.randint(0, 64)
    return g[oy:oy + H, ox:ox + W][..., None]


def _wrap(draw, text, fnt, maxw):
    if langs.has_cjk(text):          # chu Han / Nhat khong co dau cach: ngat dong giua cac chu, khong dat dau cau o dau dong
        wd = lambda t: draw.textlength(t, font=fnt)
        lines = langs.wrap_lines(text, wd, maxw) or [text]
        if len(lines) >= 2:             # can bang cac dong (tranh dong cuoi chi con 1-2 chu): thu lai voi be rong ~ tong / so dong
            bw = max(wd(text) / len(lines) * 1.08, max(wd(p) for p, _s in langs.wrap_pieces(text)))
            alt = langs.wrap_lines(text, wd, min(maxw, bw))
            if len(alt) == len(lines):
                lines = alt
        return lines
    words, lines, cur = text.split(), [], ""
    for w in words:
        t = (cur + " " + w).strip()
        if draw.textlength(t, font=fnt) <= maxw or not cur:
            cur = t
        else:
            lines.append(cur)
            cur = w
    if cur:
        lines.append(cur)
    return lines


def _hexrgb(c, default):
    try:
        c = str(c).lstrip("#")
        return tuple(int(c[i:i + 2], 16) for i in (0, 2, 4)) if len(c) == 6 else default
    except Exception:
        return default


def draw_subtitle(img, P, t):
    """Phu de dot len khung. P.sub_style (tab 'Ve ra'): font (id font, '' = mac dinh), pos bottom|middle|top, size (px o 720p), color, scolor (vien), sw (do rong vien px o 720p), bg (nen), bgcolor, round (nen bo tron), weight bold|regular."""
    ln = P.speaking(t)
    if ln is None:
        return
    cue = None
    for a, b, txt in ln.subs:
        if a <= t <= b + 0.05:
            cue = txt
    if cue is None:
        cue = ln.subs[-1][2] if ln.subs else None
    if not cue:
        return
    if langs.font_script(cue, getattr(P, "lang", "")) in langs.NEEDS_RAQM and not langs.raqm():
        return                       # Thai / Hindi / Arap khong co raqm: chu se hien sai (roi rac, khong noi) -> khong chen, nguoi dung dung file .srt
    if img.mode != "RGB":
        _draw_cue(img, P, cue)
        return
    st = getattr(P, "sub_style", None) or {}
    key = (cue, img.size, P.aspect, repr(sorted((str(k_), repr(v_)) for k_, v_ in st.items())))
    L = _SUB_CACHE.get(key)
    if L is None:
        with _SUB_LOCK:
            L = _SUB_CACHE.get(key)
            if L is None:
                L = _sub_layer(P, cue, img.size)
                if len(_SUB_CACHE) >= 16:
                    _SUB_CACHE.clear()
                _SUB_CACHE[key] = L
    if L is False:
        return
    box, A, B = L
    img.paste(ImageChops.add(ImageChops.multiply(img.crop(box), A), B), box[:2])


_SUB_CACHE = {}
_SUB_LOCK = threading.Lock()


def _sub_layer(P, cue, size):
    """Ve phu de MOT LAN len nen den va nen trang, tu do tach ra lop (A, B): khung = nen*A + B (phep ghep 'over' la tuyen tinh theo nen, nen dung cho moi lan ve chong len nhau
    gom ca vien, chu, nen mo). Cac khung sau chi ghep 1 vung nho bang ImageChops (~1 ms) thay vi ve lai chu co vien ~15 ms/khung. Tra ve (box, A, B) hoac False neu khong ve gi."""
    W, H = size
    cb = Image.new("RGB", size, (0, 0, 0))
    cw = Image.new("RGB", size, (255, 255, 255))
    _draw_cue(cb, P, cue)
    _draw_cue(cw, P, cue)
    chg = ImageChops.lighter(cb.convert("L"), ImageChops.invert(cw.convert("L")))
    bb = chg.getbbox()
    if bb is None:
        return False
    box = (max(0, bb[0] - 2), max(0, bb[1] - 2), min(W, bb[2] + 2), min(H, bb[3] + 2))
    cbc, cwc = cb.crop(box), cw.crop(box)
    return box, ImageChops.subtract(cwc, cbc), cbc


SUB_EDGE_H, SUB_EDGE_V = 0.955, 0.90      # phu de 'Duoi' (tab 'Ve ra'): mep duoi cua khoi chu o 95.5% chieu cao (ngang) / 90% (doc, tranh thanh giao dien TikTok/Reels)


def _frac(v, default, lo=0.03, hi=0.97):
    try:
        return max(lo, min(hi, float(v)))
    except (TypeError, ValueError):
        return default


def _draw_cue(img, P, cue):
    st = getattr(P, "sub_style", None) or {}
    W, H = img.size
    base = W if P.aspect == "9:16" else H
    try:
        fs = max(12, int(float(st["size"]) * base / 720.0)) if st.get("size") else max(14, int(base * 0.052))
    except (TypeError, ValueError):
        fs = max(14, int(base * 0.052))
    fnt = sub_font(st.get("font") or "", fs, st.get("weight") != "regular") if st.get("font") else font(fs, "regular" if st.get("weight") == "regular" else "bold")
    if langs.font_script(cue, getattr(P, "lang", "")):          # chu Han / Nhat / Han / Thai / Hindi / Arap: font mac dinh cua tool khong co glyph -> font he thong
        fnt = text_font(st.get("font") or "", fs, st.get("weight") != "regular", cue, getattr(P, "lang", ""))
    d = ImageDraw.Draw(img, "RGBA")
    pos = st.get("pos")
    cx_, maxw = W / 2.0, W * 0.86
    if pos == "custom":                      # tab 'Ve ra': nguoi dung keo phu de toi cho tuy y (px, py = tam khoi chu, ti le 0..1 cua khung)
        cx_ = W * _frac(st.get("px"), 0.5)
        maxw = max(W * 0.30, min(W * 0.86, 2 * min(cx_, W - cx_)))
    lines = _wrap(d, cue, fnt, maxw)
    lh = int(fs * 1.25)
    col = _hexrgb(st.get("color"), (255, 255, 255))
    scol = _hexrgb(st.get("scolor"), (10, 10, 16))
    try:
        sw = max(0, int(round(float(st["sw"]) * base / 720.0))) if st.get("sw") is not None else max(2, fs // 9)
    except (TypeError, ValueError):
        sw = max(2, fs // 9)
    blockh = lh * (len(lines) - 1) + fs * 1.15
    padb = fs * 0.175 if st.get("bg") else 0
    if pos == "bottom":                      # tab 'Ve ra' chon 'Duoi': canh chan DUOI sat day khung (nhieu dong thi moc len tren), khong nam lung chung o 80% chieu cao
        edge = SUB_EDGE_V if P.aspect == "9:16" else SUB_EDGE_H
        ytop = int(H * edge - blockh - padb - sw)
    elif pos == "custom":
        ytop = int(H * _frac(st.get("py"), 0.88) - blockh / 2)
        ytop = max(2 + sw, min(ytop, int(H - blockh - 2 - sw - padb)))          # khong de chu tran ra ngoai khung
    else:
        yfrac = {"top": 0.12, "middle": 0.5}.get(pos, 0.80 if P.aspect == "16:9" else 0.72)
        ytop = int(H * yfrac) - lh * (len(lines) - 1) // 2
    mw = max(d.textlength(l, font=fnt) for l in lines)
    pad = fs * 0.35 if st.get("bg") else 0
    half = mw / 2.0 + pad + sw + 2
    xc = max(half, min(W - half, cx_)) if half * 2 < W else W / 2.0              # tam ngang, keo vao neu chu cham mep khung
    if st.get("bg"):
        x0, x1 = xc - mw / 2 - pad, xc + mw / 2 + pad
        y0, y1 = ytop - pad * 0.5, ytop + lh * (len(lines) - 1) + fs * 1.15 + pad * 0.5
        bc = _hexrgb(st.get("bgcolor"), (0, 0, 0)) + (190,)
        if st.get("round"):
            d.rounded_rectangle([x0, y0, x1, y1], radius=int(fs * 0.45), fill=bc)
        else:
            d.rectangle([x0, y0, x1, y1], fill=bc)
    for i, l in enumerate(lines):
        tw = d.textlength(l, font=fnt)
        d.text((xc - tw / 2, ytop + i * lh), l, font=fnt, fill=col, stroke_width=sw, stroke_fill=scol)


def title_card(P, t, W, H):
    pal = PAL[(P.era, True)]
    k = ("title", W, H, P.era)
    if k not in _cache:
        im = vgrad(W, H, pal["sky"][0], mixc(pal["sky"][1], pal["sky"][0], 0.35))
        _cache[k] = im
    img = _cache[k].copy()
    d = ImageDraw.Draw(img, "RGBA")
    a = clamp(min(t / 0.6, (P.title_dur - t) / 0.6))
    acc = pal["accent"]
    fs = int((W if P.aspect == "9:16" else H) * (0.1 if P.aspect == "9:16" else 0.12))
    fnt = text_font("", fs, True, P.title, getattr(P, "lang", "")) if langs.font_script(P.title, getattr(P, "lang", "")) else font(fs, "bold")
    lines = _wrap(d, P.title, fnt, W * 0.84)
    y = H * 0.44 - len(lines) * fs * 0.6
    ww = W * 0.22 * (0.3 + 0.7 * smooth(t / 1.2))
    d.line([W / 2 - ww, y - fs * 0.35, W / 2 + ww, y - fs * 0.35], fill=acc + (int(255 * a),), width=max(2, fs // 18))
    for l in lines:
        tw = d.textlength(l, font=fnt)
        d.text(((W - tw) / 2, y), l, font=fnt, fill=(255, 255, 255, int(255 * a)))
        y += fs * 1.2
    if P.subtitle:
        sf = text_font("", int(fs * 0.4), False, P.subtitle, getattr(P, "lang", "")) if langs.font_script(P.subtitle, getattr(P, "lang", "")) else font(int(fs * 0.4), "regular")
        for l in _wrap(d, P.subtitle, sf, W * 0.8):
            tw = d.textlength(l, font=sf)
            d.text(((W - tw) / 2, y + fs * 0.2), l, font=sf, fill=acc + (int(255 * a),))
            y += fs * 0.5
    ef = font(int(fs * 0.26), "regular")
    en = ERA_NAME.get(P.era, "")
    tw = d.textlength(en, font=ef)
    d.text(((W - tw) / 2, H * 0.9), en, font=ef, fill=(255, 255, 255, int(120 * a)))
    return img


def render_frame(P, t, W=None, H=None):
    W, H = W or P.W, H or P.H
    if t < P.title_dur and P.title:
        img = title_card(P, t, W, H)
        return img
    cam = P.cam_at(t)
    from . import fx as _fx
    sdx, sdy = _fx.shake_at(P, t)
    cam = (cam[0] + sdx, cam[1] + sdy, cam[2], cam[3])
    if P.mode == "2d":
        from .r2d import render2d
        img = render2d(P, t, cam, W, H)
    else:
        from .r3d import render3d
        img = render3d(P, t, cam, W, H, stick=(P.mode == "stick"))
    si = P.scene_index(t)
    sc = P.scenes[si]
    framed = bool(getattr(P, "frames", None))
    if not framed:
        img = _fx.apply_fx(img, P, t, sc)
    elif getattr(P, "fx_final", False):          # chi video HOAN THIEN moi phu hieu ung; video co ban chi zoom/lia
        img = _fx.light_overlay(img, P, t)
        img = _fx.film_look(img, P, t)
    f = int(t * P.fps)
    fade = min(clamp((t - sc.start) / 0.45), clamp((sc.end + 0.4 - t) / 0.45))
    if P.title and si == 0 and t - P.title_dur < 0.5:
        fade = min(fade, clamp((t - P.title_dur) / 0.5))
    if framed and fade >= 1.0 and img.mode == "RGB":
        pass                                           # khung Flow ve san, khong mo/khong toi goc: giu nguyen anh (khong doi sang float32 ~25MB/khung)
    elif framed:                                       # khung Flow ve san: chi mo/toi dan theo canh -> Image.blend voi nen den (nhanh gap ~80 lan so voi tinh float32 ca khung; lech <= 1 muc mau)
        img = Image.blend(Image.new("RGB", img.size, (0, 0, 0)), img if img.mode == "RGB" else img.convert("RGB"), float(clamp(fade)))
    else:
        a = np.asarray(img).astype(np.float32)
        a = a * _vignette(W, H) + _grain(W, H, f)
        a *= fade
        img = Image.fromarray(np.clip(a, 0, 255).astype(np.uint8))
        del a
    if getattr(P, "burn_subs", True):
        draw_subtitle(img, P, t)
    return img


def _init(proj):
    global _P
    _P = proj


RETRY_SLEEP = 1.5


def _work(i):
    t = i / _P.fps
    for k in range(4):
        try:
            return render_frame(_P, t).tobytes()
        except MemoryError:                            # may het RAM tam thoi: giai phong roi doi thu lai
            import gc
            gc.collect()
            time.sleep(RETRY_SLEEP * (k + 1))
    return render_frame(_P, t).tobytes()


def _slim(P):
    """Ban sao nhe de gui cho tien trinh con (bo am thanh)."""
    import copy
    Q = copy.copy(P)
    Q.lines = []
    for ln in P.lines:
        l2 = copy.copy(ln); l2.audio = None; Q.lines.append(l2)
    byid = {id(a): b for a, b in zip(P.lines, Q.lines)}
    Q.scenes = []
    for s in P.scenes:
        s2 = copy.copy(s); s2.lines = [byid[id(l)] for l in s.lines]; Q.scenes.append(s2)
    if getattr(P, "frames", None):
        Q.frames = [dict(f, line=byid.get(id(f["line"]), f["line"])) for f in P.frames]
    Q.finalize()
    return Q


def write_srt(P, path):
    def tc(x):
        ms = int(round(x * 1000)); h, ms = divmod(ms, 3600000); m, ms = divmod(ms, 60000); s, ms = divmod(ms, 1000)
        return f"{h:02d}:{m:02d}:{s:02d},{ms:03d}"
    n = 0
    with open(path, "w", encoding="utf-8") as f:
        for ln in P.lines:
            for a, b, txt in ln.subs:
                n += 1
                f.write(f"{n}\n{tc(a)} --> {tc(b)}\n{txt}\n\n")


FIRST_WAIT = 75.0        # giay: cho KHUNG DAU (tinh ca luc khoi dong); qua ngan chi lam chuyen sang cach du phong, khong hong gi
NEXT_WAIT = 180.0        # giay: cho moi khung tiep theo
THREAD_WAIT = 60.0       # giay: cho khung dau khi dung bang LUONG


class _PoolStuck(RuntimeError):
    pass


class _Fut:
    def __init__(self, f):
        self.f = f

    def get(self, timeout=None):
        import concurrent.futures as cf, multiprocessing as mp
        try:
            return self.f.result(timeout)
        except cf.TimeoutError:
            raise mp.TimeoutError()


class _TP:
    """Nhom luong don gian, HUY duoc that su (ThreadPool.terminate() cua thu vien khong dung cac khung dang xep hang): khung chua bat dau bi bo,
    khung dang dung chay not roi thoat. Giong giao dien Pool: apply_async(...).get(timeout)."""
    def __init__(self, n):
        from concurrent.futures import ThreadPoolExecutor
        self.ex = ThreadPoolExecutor(max_workers=n, thread_name_prefix="dung")

    def apply_async(self, fn, args):
        return _Fut(self.ex.submit(fn, *args))

    def terminate(self):
        self.ex.shutdown(wait=False, cancel_futures=True)
        for t in list(getattr(self.ex, "_threads", [])):
            try:
                t.join(5)
            except Exception:
                pass


def _mem_note():
    """Dong chu RAM con trong (Windows) de de chan doan khi het bo nho."""
    try:
        if os.name == "nt":
            import ctypes

            class MS(ctypes.Structure):
                _fields_ = [("l", ctypes.c_ulong), ("load", ctypes.c_ulong), ("tp", ctypes.c_ulonglong), ("ap", ctypes.c_ulonglong),
                            ("tpf", ctypes.c_ulonglong), ("apf", ctypes.c_ulonglong), ("tv", ctypes.c_ulonglong), ("av", ctypes.c_ulonglong), ("ae", ctypes.c_ulonglong)]
            m = MS(); m.l = ctypes.sizeof(MS)
            ctypes.windll.kernel32.GlobalMemoryStatusEx(ctypes.byref(m))
            return "RAM trống %.1f/%.1f GB, bộ nhớ ảo trống %.1f GB" % (m.ap / 2**30, m.tp / 2**30, m.apf / 2**30)
        pages, size = os.sysconf("SC_PHYS_PAGES"), os.sysconf("SC_PAGE_SIZE")
        return "RAM tổng %.1f GB" % (pages * size / 2**30)
    except Exception:
        return ""


def _render_iter(Q, total, workers, cancel, say):
    """Sinh bytes tung khung theo thu tu.
    Cach 1 (mac dinh): nhieu LUONG trong tien trinh chinh - chi mot ban sao du an/thu vien trong RAM, khong bat tien trinh con nao (moi tien trinh con cua ban
    dong goi la mot ban AnimStudio day du, ton hang tram MB va co the ket luc khoi dong). numpy/PIL nha GIL nen van nhanh gap nhieu lan 1 luong.
    Cach 2 (du phong): nhieu TIEN TRINH. Ket (khong ra khung nao) hoac het RAM thi thu cach kia / it luong hon.
    Chi giu toi da `workers*3` khung dang xu ly nen bo nho khong phinh ra."""
    import multiprocessing as mp, collections
    got = 0
    plans = [("thread", workers), ("process", max(1, min(workers, 4)))]
    pi = 0
    while pi < len(plans):
        kind, n, = plans[pi]
        pi += 1
        if kind == "process":
            factory = lambda n=n: mp.get_context("spawn").Pool(n, initializer=_init, initargs=(Q,))
            first_wait = FIRST_WAIT
        else:
            factory = lambda n=n: (_init(Q), _TP(n))[1]
            first_wait = THREAD_WAIT
        box = {}

        def run(box=box, factory=factory):
            try:
                box["pool"] = factory()
            except BaseException as e:             # noqa
                box["err"] = e
        threading.Thread(target=run, daemon=True).start()      # Pool(...) co the tu no bi ket -> bat o luong rieng de con canh duoc
        pool, pending, nxt = None, collections.deque(), got
        base, last = got, time.time()
        say("Đang bật %d %s dựng hình… %s" % (n, "tiến trình" if kind == "process" else "luồng", _mem_note()))
        try:
            while got < total:
                if cancel is not None and cancel.is_set():
                    raise RuntimeError("Đã dừng")
                if pool is None:
                    pool = box.get("pool")
                    if pool is None:
                        if "err" in box:
                            raise _PoolStuck("không bật được: %s" % str(box["err"])[:120])
                        if time.time() - last > first_wait:
                            raise _PoolStuck("việc bật các %s không xong sau %d giây" % ("tiến trình" if kind == "process" else "luồng", int(time.time() - last)))
                        time.sleep(0.3)
                        continue
                while nxt < total and len(pending) < n * 3:
                    pending.append(pool.apply_async(_work, (nxt,)))
                    nxt += 1
                try:
                    buf = pending[0].get(timeout=1.0)
                except mp.TimeoutError:
                    if time.time() - last > (first_wait if got == base else NEXT_WAIT):
                        raise _PoolStuck("không có khung nào ra sau %d giây" % int(time.time() - last))
                    continue
                pending.popleft()
                got += 1
                last = time.time()
                yield buf
            return
        except _PoolStuck as e:
            say("⚠ Dựng bằng %s bị kẹt (%s) → thử cách khác." % ("tiến trình" if kind == "process" else "luồng", e))
            if pi >= len(plans):
                raise RuntimeError("Dựng hình bị kẹt: %s" % e)
        except MemoryError:
            if kind == "process" or n > 1:
                nn = max(1, n // 2)
                plans.insert(pi, ("thread", nn))
                say("⚠ Hết RAM với %d %s → giảm xuống %d luồng rồi dựng tiếp. %s" % (n, "tiến trình" if kind == "process" else "luồng", nn, _mem_note()))
                import gc
                gc.collect()
            else:
                raise RuntimeError("Hết RAM khi dựng hình (%s). Hãy đóng bớt Chrome/ứng dụng khác rồi bấm Tiếp tục." % _mem_note())
        finally:
            if pool is not None:
                th_ = threading.Thread(target=lambda p=pool: p.terminate(), daemon=True)             # terminate() cung co the ket -> khong de chan luong chinh
                th_.start()
                th_.join(6)                                    # cho cac khung cua cach cu dung han roi moi sang cach moi (khong chong chat RAM)
    raise RuntimeError("Không dựng được hình")


def _eta(sec):
    sec = int(max(0, round(sec)))
    if sec < 60:
        return "%d giây" % sec
    if sec < 3600:
        return "%d phút %02d giây" % (sec // 60, sec % 60)
    return "%d giờ %02d phút" % (sec // 3600, (sec % 3600) // 60)


class _EncFail(RuntimeError):
    """Bo ma hoa bang card do hoa loi -> dung lai bang CPU (x264)."""


_NVENC = [None]                                # None = chua thu; True/False = ket qua thu 1 lan
ENC_ARGS = {
    "x264": ["-c:v", "libx264", "-preset", "veryfast", "-crf", "22", "-pix_fmt", "yuv420p"],
    "nvenc": ["-c:v", "h264_nvenc", "-preset", "p4", "-rc", "vbr", "-cq", "23", "-b:v", "0", "-pix_fmt", "yuv420p"],
}


def nvenc_ok():
    """Card NVIDIA co ma hoa H.264 (NVENC) dung duoc khong? Thu that bang 1 doan ngan (khong chi doc danh sach); nho ket qua."""
    if _NVENC[0] is None:
        ok = False
        try:
            r = subprocess.run([ffmpeg(), "-v", "error", "-f", "lavfi", "-i", "color=c=black:s=640x360:d=0.3:r=10"] + ENC_ARGS["nvenc"] + ["-f", "null", "-"],
                               capture_output=True, timeout=25, creationflags=0x08000000 if os.name == "nt" else 0)
            ok = r.returncode == 0
        except Exception:
            ok = False
        _NVENC[0] = ok
    return _NVENC[0]


def pick_encoder(gpu=None):
    """'nvenc' neu duoc phep (gpu True/None) va card dung duoc; nguoc lai 'x264'. ANIMSTUDIO_GPU=0 tat han."""
    if gpu is False or os.environ.get("ANIMSTUDIO_GPU") == "0":
        return "x264"
    return "nvenc" if nvenc_ok() else "x264"


def make_video(P, out_path, progress=None, cancel=None, music=True, ambience=True, workers=None, burn_subs=True, srt=True, gpu=None):
    """Dung video. Nen bang card NVIDIA (NVENC) neu may co va dung duoc (gpu=False hoac ANIMSTUDIO_GPU=0 de tat); loi thi tu dung lai bang CPU."""
    enc = pick_encoder(gpu)
    if enc != "x264":
        try:
            if progress:
                progress(0, 1, "Nén video bằng card đồ họa NVIDIA (NVENC)…")
            return _make_video(P, out_path, progress, cancel, music, ambience, workers, burn_subs, srt, enc)
        except _EncFail as e:
            _NVENC[0] = False
            if progress:
                progress(0, 1, "⚠ Nén bằng card đồ họa lỗi (%s) → dựng lại bằng CPU." % str(e)[:120])
    return _make_video(P, out_path, progress, cancel, music, ambience, workers, burn_subs, srt, "x264")


def _make_video(P, out_path, progress, cancel, music, ambience, workers, burn_subs, srt, enc):
    P.burn_subs = burn_subs
    os.makedirs(os.path.dirname(os.path.abspath(out_path)), exist_ok=True)
    tmp = tempfile.mkdtemp(prefix="anim_")
    wav = os.path.join(tmp, "audio.wav")
    say = (lambda m: progress(0, 1, m)) if progress else (lambda m: None)
    t0 = time.time()
    say("Đang trộn âm thanh…")
    write_wav(wav, mix(P, music, ambience))
    total = int(math.ceil(P.total * P.fps))
    say("Đã trộn âm thanh (%.0f giây). Đang bật các tiến trình dựng hình (%d khung)…" % (time.time() - t0, total))
    cmd = [ffmpeg(), "-y", "-f", "rawvideo", "-pix_fmt", "rgb24", "-s", f"{P.W}x{P.H}", "-r", str(P.fps), "-i", "-", "-i", wav,
           ] + ENC_ARGS[enc] + ["-c:a", "aac", "-b:a", "160k",
           "-movflags", "+faststart", "-shortest", out_path]
    flags = 0x08000000 if os.name == "nt" else 0
    proc = subprocess.Popen(cmd, stdin=subprocess.PIPE, stderr=subprocess.PIPE, creationflags=flags)
    errbuf = []
    threading.Thread(target=lambda: errbuf.append(proc.stderr.read()), daemon=True).start()
    workers = workers or max(1, min(os.cpu_count() or 2, 8))
    Q = _slim(P)
    hang_f = None
    try:                                           # neu van ket: ghi ngan xep cua MOI luong vao file de biet ket o dong nao
        import faulthandler
        hang_f = open(os.path.join(DATA_DIR, "video_hang.log"), "w")
        faulthandler.dump_traceback_later(FIRST_WAIT + 90, repeat=False, file=hang_f)
    except Exception:
        hang_f = None
    ok = False
    import collections
    win = collections.deque(maxlen=40)
    try:
        for i, buf in enumerate(_render_iter(Q, total, workers, cancel, say)):
            if i == 0 and hang_f is not None:
                try:
                    import faulthandler
                    faulthandler.cancel_dump_traceback_later()
                except Exception:
                    pass
            if cancel is not None and cancel.is_set():
                raise RuntimeError("Đã dừng")
            try:
                proc.stdin.write(buf)
            except (BrokenPipeError, OSError):
                if enc != "x264" and not (cancel is not None and cancel.is_set()):
                    try:
                        proc.wait(5)
                    except Exception:
                        pass
                    raise _EncFail((errbuf[0].decode("utf-8", "ignore")[-160:] if errbuf else "ffmpeg dừng") or "ffmpeg dừng")
                raise
            if progress and (i % 5 == 0 or i == 0):
                now = time.time()
                win.append((now, i + 1))
                msg = f"Dựng khung hình {i + 1}/{total}"
                if len(win) >= 3 and now - win[0][0] >= 3.0:          # toc do trong ~200 khung gan nhat -> thoi gian con lai
                    fps_ = (i + 1 - win[0][1]) / (now - win[0][0])
                    if fps_ > 0.05:
                        msg += " · %.0f khung/giây · còn ~%s" % (fps_, _eta((total - i - 1) / fps_))
                progress(i + 1, total, msg)
        proc.stdin.close()
        proc.wait()
        ok = proc.returncode == 0
        if not ok:
            msg_ = errbuf[0].decode("utf-8", "ignore")[-300:] if errbuf else ""
            if enc != "x264":
                raise _EncFail(msg_[-160:] or "ffmpeg lỗi")
            raise RuntimeError("ffmpeg lỗi: " + msg_)
        if srt:
            write_srt(P, os.path.splitext(out_path)[0] + ".srt")
        if progress: progress(total, total, "Xong")
    finally:
        if hang_f is not None:
            try:
                import faulthandler
                faulthandler.cancel_dump_traceback_later()
                hang_f.close()
            except Exception:
                pass
        try:
            proc.stdin.close()
        except Exception:
            pass
        if not ok:
            try: proc.kill()
            except Exception: pass
        import shutil
        shutil.rmtree(tmp, ignore_errors=True)
    return out_path


def preview_image(P, t=None, W=None, H=None):
    if t is None:
        t = P.lines[0].start + 0.8 if P.lines else P.title_dur + 1.0
    return render_frame(P, t, W, H)
