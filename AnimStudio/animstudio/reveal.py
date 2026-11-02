# -*- coding: utf-8 -*-
"""Hieu ung 'VE RA' khi vao moi khung hinh (tab 'Ve ra'): khung Google Flow da ve xong hien dan len nhu dang duoc ve. 15 kieu (11 kieu theo danh sach hieu ung cua TW StoryFlow + xe giay, truot giay, mo vong tron, rem soc).
 - HUONG MO: hieu ung co huong (khong phai mo mai tu mot ben) tu doi huong theo tung khung: trai->phai, phai->trai, tren->xuong, duoi->len (compose(..., dirn='auto'|'lr'|'rl'|'tb'|'bt')).
   Cach lam: moi hieu ung duoc viet 1 lan theo huong trai->phai; huong khac = lat/xoay anh vao, chay hieu ung, lat/xoay anh ra; hinh (tay, cau be, co) duoc dan SAU, o vi tri da quy doi, khong bi xoay.
 - 'pen' / 'outline': tach net cua CHINH anh (lam manh -> cat thanh tung net -> ve het chu / vat nay sang chu / vat khac), ngon but chay doc net.
     'pen' ("Ve tay tung net but") = ban tay ve TUNG NET MUC (dung mau that cua anh) theo thu tu net that va TUNG VAT (_cell_groups / _next_part: vat lon gan giua truoc, roi sang vat gan nhat, KHONG quet theo hang / cot; ve xong ca vat moi sang vat ke),
         xong net cua mot vat thi TO MAU ngay nhung vung vua ve (pen_plan / _pen_frame: fill_plan(new, st, None, ce) chia vung theo khuc ve; to tung MANG nho, xem _patch_fill) roi moi sang vat ke. Mau chi hien dung cho tay vua ve, mep theo vien net
         (KHONG chia khung vuong, KHONG quet ca man hinh). Luc ve TRANH DUOC CO NHO CO DINH (~94-97%, can giua, le trang BANG NHAU 4 phia: _pen_geom / _pen_shrunk); ban tay tu XOAY quanh ngon but (_Sprites fit=True: goc nho nhat de
         tay nam TRON trong man hinh, ve sat mep tren / phai thi tay xoay xuong / sang trai) o ca 4 huong; ve xong tay rut ra, tranh GIU NGUYEN co nho CO DINH (khong phong to / zoom), xem pen_hold. Chi anh khong co net nao (nen phang) moi dung but quet tung dai mau.
     'outline' ("Ve vien -> len mau", CO ban tay) = HAI GIAI DOAN: (1) ban tay ve HET net vien theo thu tu net that; (2) roi to MAU tung vung (vung = mang cung mau gioi han boi net vien, mep to SAC, khong loang);
         vung trang (nen giay) khong can to. Anh den trang / net chi chi co khoi den dac thi gan het thoi gian la ve net, vung den duoc do day sau cung. Ve het = dung anh moi; tay rut ra.
 - Cac kieu con lai: mat na hien dan (zig-zag, co, muc loang, theo vung...). Hinh ban tay / cau be / cuon tranh / co: TOAN BO do AI ve (props.py); chua co hinh nao thi hieu ung chay khong co hinh do.
 - 'none' chi la noi bo (tab kieu cu: giu nguyen kieu hoa tan cu), khong nam trong danh sach chon.
 - Moi kieu = 1 'truong thoi diem hien' T (0..1) cho tung diem anh -> mat na mem, ghep anh cu / anh moi. Truong chi phu thuoc kich thuoc nen duoc nho.
 - Chi dung numpy + Pillow (+ ndi: scipy hoac OpenCV)."""
import hashlib
import math
import threading
import numpy as np
from PIL import Image, ImageFilter, ImageOps

from . import sprites

EFFECTS = [
    ("pen", "Vẽ tay từng nét bút"),
    ("boy_pen", "Cậu bé cầm bút — vẽ từng hàng, ảnh hiện dần theo nét cọ"),
    ("scroll", "Cậu bé mở cuộn tranh — kéo từ trái sang phải"),
    ("outline", "Vẽ viền → lên màu"),
    ("brush", "Hiện ảnh bằng nét cọ"),
    ("ink", "Hiện dần bằng nét mực cổ"),
    ("regions", "Hiện lần lượt theo vùng/đối tượng"),
    ("tear", "Xé giấy — xé tờ cũ để lộ tranh mới"),
    ("slide", "Trượt giấy — tranh mới trượt đè lên tranh cũ"),
    ("iris", "Mở vòng tròn — vòng tròn loe dần để lộ tranh"),
    ("blinds", "Rèm sọc — các thanh rèm lần lượt mở ra"),
    ("black", "Hiện dần từ nền đen"),
    ("fade", "Mờ dần nhẹ"),
    ("flash", "Nhấn mạnh: chớp sáng + zoom"),
    ("cut", "Không hiệu ứng"),
]
KEYS = ["none"] + [k for k, _ in EFFECTS]
PICKABLE = [k for k, _ in EFFECTS]
PAPER = (251, 249, 243)                        # nen giay trang cua kieu ve tay
GRAPHITE = (46, 46, 54)                         # mau net but
HAND_H = 0.38                                   # chieu cao ban tay / tay cam co so voi khung hinh
SCROLL_BOY_H = 0.24                             # cau be keo cuon tranh
BOY_H = 0.17                                    # chieu cao cau be so voi khung hinh (be vua phai, de nhin; truoc day 0.10 chay nhun nhay nen roi mat)
BOY_ROW = 1.45                                  # chieu cao 1 hang quet = 1,45 lan chieu cao cau be (khung 16:9 ~ 4 hang)
NB = 7                                          # so dai quet (zig-zag) cua kieu ban tay / cau be
BRUSH_NB = 5                                    # so net co ngang (le -> net cuoi ket thuc o ben phai, tay rut ra tu goc duoi-phai)
DIRS = ("lr", "rl", "tb", "bt")                 # trai->phai, phai->trai, tren->xuong, duoi->len
AUTO_SEQ = ("lr", "tb", "rl", "bt", "tb", "rl", "lr", "bt")        # che do tu dong: khung thu k lay huong thu k (khong bao gio 2 khung lien tiep cung huong, ke ca khi quay vong)
DIRECTIONAL = frozenset(("pen", "boy_pen", "scroll", "outline", "brush", "regions", "tear", "slide", "iris", "blinds"))   # cac kieu con lai (muc, mo dan, chop...) khong co huong
HORIZ_ONLY = frozenset(("scroll",))             # cuon tranh chi keo ngang
_FIELDS = {}
_KL = {}                                        # khoa theo (loai cache, khoa anh): nhieu luong dung chung cung mot anh thi chi MOT luong tinh (cac luong con lai cho roi dung ket qua)
_KL_G = threading.Lock()


def _klock(name, k):
    lk = _KL.get((name, k))
    if lk is None:
        with _KL_G:
            if len(_KL) > 400:
                _KL.clear()
            lk = _KL.setdefault((name, k), threading.Lock())
    return lk


_SK = {}
_RG = {}
_IA = {}
_SG = {}
_ST = {}


def clamp(x, a=0.0, b=1.0):
    return a if x < a else b if x > b else x


def smooth(u):
    u = clamp(u)
    return u * u * (3 - 2 * u)


def pick(kind):
    return kind if kind in KEYS else "none"


def _grid(W, H):
    return np.linspace(0.0, 1.0, W, dtype=np.float32)[None, :], np.linspace(0.0, 1.0, H, dtype=np.float32)[:, None]


def _sweep(W, H, nb, bristle):
    """Truong thoi diem cua nhung NET QUET ngang noi tiep nhau (zig-zag): moi net la 1 dai cao H/nb, dau net TRON nhu dau co/dau but da (hinh ban nguyet),
    nen cho nao co di qua thi cho do hien ra dung vao luc do. bristle=True: mep sau dau co co soi long (soi lag ra sau, dai ngan khac nhau).
    Tra ve (T, sw, rx): rx = ban kinh ngang cua dau (px)."""
    xn, yn = _grid(W, H)
    rx = 0.6 * H / float(nb)
    rnd = np.random.RandomState(11 + nb)
    warp = (0.10 * np.sin(xn * 5.3 + 0.7) + 0.05 * np.sin(xn * 13.0 + 2.1)) if bristle else 0.0     # ranh gioi giua cac net hoi uon luon
    yb = yn * nb + warp
    band = np.clip(np.floor(yb), 0, nb - 1).astype(np.int32)
    frac = np.clip(yb - band, 0.0, 1.0)
    dy = frac * 2.0 - 1.0
    c = np.sqrt(np.maximum(0.0, 1.0 - dy * dy))                  # do nhon cua dau co: giua dai di truoc, hai mep dai bi tre
    xx = np.broadcast_to(xn * W, (H, W))
    xx = np.where(band % 2 == 0, xx, W - xx)                     # net le chay nguoc lai (zig-zag)
    s = (xx - rx * c + rx) / float(W + rx)
    if bristle:                                                    # soi long: moi hang diem anh (theo y) tre mot do khac nhau, thinh thoang co soi tre rat dai (co kho)
        k = np.ones(5, np.float32) / 5.0
        n1 = np.convolve(rnd.rand(H + 8).astype(np.float32), k, "same")[4:H + 4]
        n1 = (n1 - n1.min()) / max(float(np.ptp(n1)), 1e-6)
        n2 = np.convolve(rnd.rand(H + 24).astype(np.float32), np.ones(13, np.float32) / 13.0, "same")[12:H + 12]
        n2 = (n2 - n2.min()) / max(float(np.ptp(n2)), 1e-6)
        lag = 0.006 * n1 + 0.045 * np.maximum(0.0, n2 - 0.55) / 0.45
        s = s + lag[:, None]
    T = (band + np.clip(s, 0.0, 1.0)) / float(nb)
    return T, (0.0025 if bristle else 0.004), rx


def sweep_pos(p, W, H, nb=BRUSH_NB, lead=0.0):
    """Vi tri dau co/dau but (x, y) o tien do p (0..1) cua cac net quet; dau chay tu ngoai khung vao va ra ngoai khung o cuoi moi net.
    lead = 0: tam dau; lead = 1: mep truoc nhat cua net (cho nay dang hien ra); dau but/co duoc dat o khoang 0.7."""
    t = clamp(p) * nb * 0.9999
    band = int(t)
    u = t - band
    rx = 0.6 * H / float(nb)
    x = -rx + u * (W + rx) + lead * rx
    return (x if band % 2 == 0 else W - x), (band + 0.5) / nb * H


def field(kind, W, H, seed=0):
    """(T, sw): T = thoi diem (0..1) moi diem anh duoc hien; sw = do mem cua mep."""
    key = (kind, W, H, seed if kind == "ink" else 0)
    r = _FIELDS.get(key)
    if r is not None:
        return r
    xn, yn = _grid(W, H)
    if kind == "wipe":                                           # trai -> phai
        T, sw = np.broadcast_to(xn, (H, W)), 0.06
    elif kind == "brush":                                        # net co tron, co chay den dau hien den do (khong con hien tung mang mem)
        T, sw, _rx = _sweep(W, H, BRUSH_NB, True)
    elif kind == "sweep":                                        # nhu tren nhung theo so dai NB, mep gon (to mau bang but)
        T, sw, _rx = _sweep(W, H, NB, False)
    elif kind == "zig":                                          # tung dai ngang, di zig-zag (mep mem)
        nb = NB
        band = np.minimum((yn * nb).astype(np.int32), nb - 1)
        xdir = np.where(band % 2 == 0, xn, 1.0 - xn)
        T = (band + xdir) / float(nb)
        sw = 0.5 / nb
    elif kind == "ink":                                          # mac loang tu vai diem, mep loang lo
        rnd = np.random.RandomState(seed & 0x7FFFFFFF)
        seeds = rnd.rand(4, 2)
        asp = W / float(H)
        d = None
        for sx, sy in seeds:
            dd = np.sqrt(((xn - sx) * asp) ** 2 + (yn - sy) ** 2)
            d = dd if d is None else np.minimum(d, dd)
        d = d / max(float(d.max()), 1e-6)
        noise = rnd.rand(9, 16).astype(np.float32)
        noise = np.asarray(Image.fromarray(noise, "F").resize((W, H), Image.BICUBIC), np.float32)
        noise = (noise - noise.min()) / max(float(np.ptp(noise)), 1e-6)
        T, sw = 0.62 * d + 0.38 * noise, 0.16
    else:
        T, sw = np.zeros((H, W), np.float32), 0.1
    T = np.ascontiguousarray(np.clip(T, 0.0, 1.0), dtype=np.float32)          # p=0 -> khong hien gi, p=1 -> hien het (ke ca mep co rung)
    if len(_FIELDS) > 40:
        _FIELDS.clear()
    _FIELDS[key] = (T, sw)
    return T, sw


def mask(kind, p, W, H, seed=0):
    """Mat na 0..1 (HxW) o tien do p (0..1). p=0 -> toan 0, p=1 -> toan 1."""
    T, sw = field(kind, W, H, seed)
    return np.clip((p * (1.0 + sw) - T) / max(sw, 1e-3), 0.0, 1.0)


def _mix(old, new, m):
    """Ghep anh cu / anh moi theo mat na m (HxW, 0..1). Dung Image.composite voi mat na 8 bit (nhanh hon ~40 lan so voi tinh bang float; lech toi da 1 muc mau)."""
    if old.mode != "RGB":
        old = old.convert("RGB")
    if new.mode != "RGB":
        new = new.convert("RGB")
    mm = np.multiply(m, 255.0, dtype=np.float32)
    mm += 0.5
    np.clip(mm, 0.0, 255.0, out=mm)
    return Image.composite(new, old, Image.fromarray(mm.astype(np.uint8), "L"))


def _key(im):
    """Dau van tay anh (kich thuoc + hash ban thu nho). Nho ngay tren DOI TUONG anh (thuoc tinh _ak; anh dan xuat nhu resize/lat/copy la doi tuong moi nen khong thua huong nham),
    nen goi nhieu lan trong 1 khung chi tinh 1 lan."""
    k = getattr(im, "_ak", None)
    if k is None:
        k = (im.size, hashlib.md5(im.resize((48, 27), Image.BILINEAR).tobytes()).hexdigest())
        try:
            im._ak = k
        except Exception:
            pass
    return k


def key_copy(src, dst):
    """Chep dau van tay da tinh cua src sang dst (dst la ban sao giong het src)."""
    k = getattr(src, "_ak", None)
    if k is not None:
        try:
            dst._ak = k
        except Exception:
            pass
    return dst


def ink_alpha(img):
    """Do dam net (0..1, HxW) cua toan anh: net rat toi + duong vien. Nho theo anh."""
    k = ("ia",) + _key(img)
    r = _IA.get(k)
    if r is not None:
        return r
    with _klock("ia", k):
        return _ink_alpha(img, k)


def _ink_alpha(img, k):
    r = _IA.get(k)
    if r is not None:
        return r
    g = ImageOps.autocontrast(img.convert("L").filter(ImageFilter.GaussianBlur(0.7)))
    ga = np.asarray(g, np.float32)
    e = np.array(g.filter(ImageFilter.FIND_EDGES), np.float32)
    e[:2, :] = e[-2:, :] = 0.0                                       # Pillow de nguyen vien anh khi loc -> khong co net gia o mep khung
    e[:, :2] = e[:, -2:] = 0.0
    ink = np.maximum(np.clip(e * 3.2 / 255.0, 0.0, 1.0), np.clip((95.0 - ga) / 60.0, 0.0, 1.0)).astype(np.float32)
    if len(_IA) > 6:
        _IA.clear()
    _IA[k] = ink
    return ink


LINE_R = 3.0                                    # nua be rong net but (tinh theo anh rong 640): net day hon chi giu VIEN day ~LINE_R, ruot khoi dac de buoc to mau lap day
_LA = {}


def line_art(img):
    """Do dam NET (0..1, HxW) de but ke: nhu ink_alpha nhung CHI GIU net manh va VIEN cua khoi dac. Khoi den dac (toc, quan, giay...) bi khoet ruot, chi con vien day ~LINE_R px (theo anh 640)
    -> but chi ke duong vien, ruot do buoc 'to mau' lap day (khong con canh ca khoi den hien ra cung luc). Nho theo anh."""
    k = ("la",) + _key(img)
    r = _LA.get(k)
    if r is not None:
        return r
    with _klock("la", k):
        return _line_art(img, k)


def _line_art(img, k):
    r = _LA.get(k)
    if r is not None:
        return r
    from . import ndi
    ink = ink_alpha(img)
    dark = ink > 0.42
    if dark.any():
        rr = max(1.5, LINE_R * img.size[0] / 640.0)
        dt = ndi.distance_transform_edt(dark)
        w = np.clip((rr + 1.5 - dt) / 1.5, 0.0, 1.0).astype(np.float32)           # 1 trong ~rr tinh tu mep khoi, ve 0 o sau hon
        lb, nl = ndi.label(dark)                                                  # chu / net den DAY NHUNG MANH (be day <= ~2.5*rr, vd chu tieu de) = but ve nguyen net, KHONG khoet ruot (khoet se ra chu rong, vo)
        if nl:
            ii = np.nonzero(dark.ravel())[0]
            ll = lb.ravel()[ii]
            o = np.argsort(ll, kind="stable")
            ls, ds = ll[o], dt.ravel()[ii][o]
            st_ = np.concatenate([[0], np.nonzero(np.diff(ls))[0] + 1])
            mx = np.zeros(nl + 1, np.float32)
            mx[ls[st_]] = np.maximum.reduceat(ds, st_)
            thin = (mx[lb] <= 2.5 * rr) & dark
            w = np.where(thin, 1.0, w).astype(np.float32)
        ink = np.where(dark, ink * w, ink).astype(np.float32)
    if len(_LA) > 6:
        _LA.clear()
    _LA[k] = ink
    return ink


def paper_of(img):
    """Mau nen giay khi ve: neu anh co nen sang dong deu (vd nen trang) thi dung dung mau do (khong bi chuyen mau luc len mau), con lai dung giay kem."""
    sg = _seg(img)
    bg = sg["bg"]
    if float(bg.mean()) > 215:
        sm_ = sg["sm"]
        border = np.concatenate([sm_[0], sm_[-1], sm_[:, 0], sm_[:, -1]])
        if sg["uniform"] or float((np.abs(border - bg).sum(1) < 40).mean()) >= 0.6:       # nen sang: phan lon vien anh la mau nen (vat o sat mep khong lam mat nen trang)
            return tuple(int(round(v)) for v in bg)
    return PAPER


def pencil(img):
    """Ban phac thao: nen giay + net chi den tu duong vien / net toi cua anh. Nho theo anh (khong tinh lai moi khung)."""
    k = _key(img)
    r = _SK.get(k)
    if r is not None:
        return r
    with _klock("sk", k):
        return _pencil(img, k)


def _pencil(img, k):
    r = _SK.get(k)
    if r is not None:
        return r
    ink = line_art(img)
    mm = np.multiply(ink, 255.0, dtype=np.float32)               # ghep nen giay + net chi bang Image.composite (mat na 8 bit): nhanh hon ~30 lan so voi tinh float 3 kenh
    mm += 0.5
    np.clip(mm, 0.0, 255.0, out=mm)
    r = Image.composite(Image.new("RGB", img.size, GRAPHITE), Image.new("RGB", img.size, tuple(paper_of(img))), Image.fromarray(mm.astype(np.uint8), "L"))
    if len(_SK) > 6:
        _SK.clear()
    _SK[k] = r
    return r


def _thin(bw, max_iter=30):
    """Lam manh net ve 1 diem anh (Zhang-Suen, vector hoa)."""
    img = bw.astype(np.uint8)
    for _ in range(max_iter):
        changed = False
        for step in (0, 1):
            P = np.pad(img, 1)
            p2, p3, p4, p5 = P[:-2, 1:-1], P[:-2, 2:], P[1:-1, 2:], P[2:, 2:]
            p6, p7, p8, p9 = P[2:, 1:-1], P[2:, :-2], P[1:-1, :-2], P[:-2, :-2]
            B = p2 + p3 + p4 + p5 + p6 + p7 + p8 + p9
            A = ((p2 == 0) & (p3 == 1)).astype(np.uint8) + ((p3 == 0) & (p4 == 1)) + ((p4 == 0) & (p5 == 1)) + ((p5 == 0) & (p6 == 1)) \
                + ((p6 == 0) & (p7 == 1)) + ((p7 == 0) & (p8 == 1)) + ((p8 == 0) & (p9 == 1)) + ((p9 == 0) & (p2 == 1))
            c = ((p2 * p4 * p6) == 0) & ((p4 * p6 * p8) == 0) if step == 0 else ((p2 * p4 * p8) == 0) & ((p2 * p6 * p8) == 0)
            m = (img == 1) & (B >= 2) & (B <= 6) & (A == 1) & c
            if m.any():
                img[m] = 0
                changed = True
        if not changed:
            break
    return img.astype(bool)


def zig_pos(s, W, H, nb=NB):
    """Vi tri (x, y) tren duong quet zig-zag o tien do s (0..1)."""
    t = clamp(s) * nb * 0.9999
    band = int(t)
    u = t - band
    return (u if band % 2 == 0 else 1.0 - u) * W, (band + 0.5) / nb * H


def _seg(new):
    """Tach doi tuong (vung khac nen) o do phan giai nho. Tra ve dict: bg, uniform, rank (0 = nen, 1..n theo thu tu trai->phai), n, kich thuoc nho. Nho theo anh."""
    k = _key(new)
    r = _SG.get(k)
    if r is not None:
        return r
    with _klock("sg", k):
        return _seg_calc(new, k)


def _seg_calc(new, k):
    r = _SG.get(k)
    if r is not None:
        return r
    from . import ndi
    W, H = new.size
    sw_, sh_ = 192, max(48, int(round(192.0 * H / W)))
    sm = np.asarray(new.resize((sw_, sh_), Image.BILINEAR), np.float32)
    border = np.concatenate([sm[0], sm[-1], sm[:, 0], sm[:, -1]])
    bg = np.median(border, axis=0)
    uniform = float(border.std(0).mean()) < 16
    fg = np.abs(sm - bg).sum(2) > 60
    fg = ndi.binary_opening(fg, iterations=1)
    dil = ndi.binary_dilation(fg, iterations=3)
    lab, n = ndi.label(dil)
    comps = []
    for i in range(1, int(n) + 1):
        m = lab == i
        if int(m.sum()) >= 0.004 * sw_ * sh_:
            ys, xs = np.nonzero(m)
            comps.append((float(xs.mean()), float(ys.mean()), i))
    comps.sort(key=lambda c: (int(c[0] // (sw_ / 4.0)), c[1]))
    rank = np.zeros((sh_, sw_), np.int32)
    for r_, (_cx, _cy, i) in enumerate(comps):
        rank[lab == i] = r_ + 1
    r = dict(bg=bg, uniform=uniform, lab=lab, comps=comps, rank=rank, n=len(comps), sw=sw_, sh=sh_, sm=sm)
    if len(_SG) > 6:
        _SG.clear()
    _SG[k] = r
    return r


def regions(new):
    """(T, base): T = thoi diem hien cua tung vung/doi tuong (0 = nen), base = mau nen phang neu nen dong deu (None = khong dung duoc). Nho theo anh."""
    k = _key(new)
    r = _RG.get(k)
    if r is not None:
        return r
    with _klock("rg", k):
        return _regions(new, k)


def _regions(new, k):
    r = _RG.get(k)
    if r is not None:
        return r
    W, H = new.size
    sg = _seg(new)
    sw_, sh_, comps, lab, sm, bg, uniform = sg["sw"], sg["sh"], sg["comps"], sg["lab"], sg["sm"], sg["bg"], sg["uniform"]
    T = np.zeros((sh_, sw_), np.float32)
    if len(comps) < 2:                                          # khong tach duoc doi tuong -> chia 4 cot
        xs = np.arange(sw_)[None, :].repeat(sh_, 0)
        col = np.minimum((xs * 4) // sw_, 3)
        T = (0.12 + 0.88 * (col + 0.5) / 4.0).astype(np.float32)
        T = T * (np.abs(sm - bg).sum(2) > 25) if uniform else T
    else:
        nc = len(comps)
        groups = min(nc, 12)
        for r_, (cx, cy, i) in enumerate(comps):
            m = lab == i
            ys, xs = np.nonzero(m)
            d = np.hypot(xs - cx, ys - cy)
            d = d / max(float(d.max()), 1.0)
            g = int(r_ * groups / nc)
            s0, s1 = 0.12 + 0.88 * g / groups, 0.12 + 0.88 * (g + 1) / groups
            T[m] = s0 + (s1 - s0) * 0.8 * d
    full = np.asarray(Image.fromarray(T.astype(np.float32), "F").resize((W, H), Image.BILINEAR), np.float32)
    base = tuple(int(v) for v in bg) if uniform else None
    r = (full, base)
    if len(_RG) > 6:
        _RG.clear()
    _RG[k] = r
    return r


_NB8 = ((0, 1), (1, 0), (0, -1), (-1, 0), (1, 1), (1, -1), (-1, 1), (-1, -1))       # uu tien lang gieng 4 huong


def strokes(new, order="nn"):
    """Thu tu NET VE that cua anh: tach net (lam manh), cat thanh tung net lien tuc (giua cac nga re), roi ve lan luot net gan nhat tiep theo bat dau tu goc tren-trai
    -> but di het vat nay moi sang vat khac; ngon but chay doc net, nhac but giua cac net. Tra ve dict(T = thoi diem hien cua tung diem anh (HxW, 0..1), pts = (M,2) toa do
    ngon but theo thoi gian, M) hoac None neu anh khong co net. Nho theo anh."""
    k = _key(new) if order == "nn" else _key(new) + (order,)
    if k in _ST:
        return _ST[k]
    with _klock("st", k):
        if k in _ST:
            return _ST[k]
        return _strokes(new, k, order)


KEEP_W, KEEP_H = 2.0, 1.7                       # 've tay': vat (cac net noi voi nhau) nho hon ~48% x 58% khung thi GIU NGUYEN la mot vat (ve xong ca vat roi moi to mau), lon hon thi chia theo CELL_W x CELL_H
CELL_W, CELL_H = 0.24, 0.34                     # 've tay': moi "goc anh" / vat (nhom net ve lien tiep) rong toi da 24% x cao 34% khung hinh (nho -> moi khuc la MOT vat, tay ve xong vat nay moi sang vat khac)


def _row_order(boxes):
    """Thu tu doc cac hop (x0, y0, x1, y1): tung hang tu tren xuong, trong hang tu trai sang phai. Tra ve danh sach chi so."""
    rem = set(range(len(boxes)))
    seq = []
    while rem:
        seed = min(rem, key=lambda i: (boxes[i][1], boxes[i][0]))
        sy0, sy1 = boxes[seed][1], boxes[seed][3]
        sh = max(1.0, float(sy1 - sy0))
        row = [i for i in rem if min(boxes[i][3], sy1) - max(boxes[i][1], sy0) >= 0.5 * min(sh, float(boxes[i][3] - boxes[i][1]))] or [seed]
        row.sort(key=lambda i: boxes[i][0])
        seq.extend(row)
        rem -= set(row)
    return seq


def _split_cells(content, ws, hs, cw=CELL_W, ch=CELL_H, box0=None):
    """Chia vung co noi dung (bool HxW) thanh cac 'goc anh' khong lon qua cw x ch khung hinh: chia doi lien tiep o cho IT noi dung nhat gan giua (cat qua khoang trong giua cac vat neu co)
    -> danh sach hop (x0, y0, x1, y1) khong chong nhau."""
    out = []

    def tight(x0, y0, x1, y1):
        sub = content[y0:y1, x0:x1]
        if not sub.any():
            return None
        ry, rx = sub.any(1), sub.any(0)
        return (x0 + int(rx.argmax()), y0 + int(ry.argmax()), x0 + len(rx) - int(rx[::-1].argmax()), y0 + len(ry) - int(ry[::-1].argmax()))

    def rec(box, depth):
        t = tight(*box)
        if t is None:
            return
        x0, y0, x1, y1 = t
        w, h = x1 - x0, y1 - y0
        if (w <= cw * ws and h <= ch * hs) or depth >= 6 or (w < 6 and h < 6):
            out.append(t)
            return
        axis = 0 if w / (cw * ws) >= h / (ch * hs) else 1
        span = w if axis == 0 else h
        o = x0 if axis == 0 else y0
        lo, hi = o + int(0.30 * span), o + max(int(0.70 * span), int(0.30 * span) + 2)
        best, bc = (lo + hi) // 2, 1e18
        for c in range(lo, hi):
            strip = content[y0:y1, c:c + 2] if axis == 0 else content[c:c + 2, x0:x1]
            cost = float(strip.mean()) + 0.35 * abs((c - o) / float(span) - 0.5)
            if cost < bc:
                best, bc = c, cost
        if axis == 0:
            rec((x0, y0, best, y1), depth + 1); rec((best, y0, x1, y1), depth + 1)
        else:
            rec((x0, y0, x1, best), depth + 1); rec((x0, best, x1, y1), depth + 1)

    rec(box0 if box0 is not None else (0, 0, ws, hs), 0)
    return out


def _cell_groups(paths, xs, ys, sk, ws, hs, gid=None):
    """'Ve tay': chia cac net thanh tung VAT (nhom net) -> tay ve xong vat nay moi sang vat khac, khong chay ca man hinh. Vat = cac net NOI VOI NHAU (gid): vat nho (vua mot cell) giu NGUYEN, de ve XONG ca
    vat roi moi to mau; khoi net lon (ca dam dong, ca dai nui noi lien nhieu vat) thi chia nho theo cho IT net nhat (_split_cells). Chi dung de GOM net (khong hien ra tren hinh). Tra ve danh sach cac
    mang chi so net (KHONG co thu tu ve: thu tu chon luc ve, xem _next_part: vat lon truoc, roi sang vat gan nhat, khong quet theo hang / theo cot)."""
    from . import ndi as _ndi
    cw, ch = CELL_W, CELL_H
    S = len(paths)
    if gid is None:
        gid = np.zeros(S, np.int32)
    mx = np.array([xs[p[len(p) // 2]] for p in paths], np.float64)
    my = np.array([ys[p[len(p) // 2]] for p in paths], np.float64)
    dil = max(2, int(0.02 * ws))
    groups = []
    for g in np.unique(gid):
        idx = np.nonzero(gid == g)[0].astype(np.int64)
        allv = np.concatenate([paths[i] for i in idx])
        gx0, gx1, gy0, gy1 = int(xs[allv].min()), int(xs[allv].max()) + 1, int(ys[allv].min()), int(ys[allv].max()) + 1
        if len(idx) == 1 or ((gx1 - gx0) <= KEEP_W * cw * ws and (gy1 - gy0) <= KEEP_H * ch * hs):      # vat vua mot cell: giu nguyen
            groups.append(idx)
            continue
        m = np.zeros((hs, ws), bool)
        m[ys[allv], xs[allv]] = True
        content = _ndi.binary_dilation(m, iterations=dil)
        boxes = _split_cells(content, ws, hs, cw, ch)
        f = 1.0
        while len(boxes) < 2 and f > 0.2 and (gx1 - gx0 > 0.1 * ws or gy1 - gy0 > 0.1 * hs):
            f *= 0.7
            nb = []
            for b in boxes:
                kids = _split_cells(content, ws, hs, CELL_W * f, CELL_H * f, b)
                nb.extend(kids if kids else [b])
            boxes = nb
        if len(boxes) <= 1:
            groups.append(idx)
            continue
        owner = np.zeros(len(idx), np.int64)
        for k, i in enumerate(idx):
            best, bd = 0, 1e18
            for bi, (x0, y0, x1, y1) in enumerate(boxes):
                d = max(0.0, x0 - mx[i], mx[i] - (x1 - 1)) ** 2 + max(0.0, y0 - my[i], my[i] - (y1 - 1)) ** 2
                if d < bd:
                    best, bd = bi, d
                    if d == 0.0:
                        break
            owner[k] = best
        for bi in range(len(boxes)):
            gg = idx[owner == bi]
            if len(gg):
                groups.append(gg)
    # net CHI TIET nam gon trong khung cua mot vat (cua so, mat, hoa van...) du khong cham net vien thi van thuoc ve vat do -> ve cung luc vat do, roi moi to mau (khong de net chi tiet bi bo lai ve sau)
    G = len(groups)
    if G > 1:
        bb = np.zeros((G, 4), np.float64)
        for gi, gg in enumerate(groups):
            allv = np.concatenate([paths[i] for i in gg])
            bb[gi] = (xs[allv].min(), ys[allv].min(), xs[allv].max() + 1, ys[allv].max() + 1)
        area = (bb[:, 2] - bb[:, 0]) * (bb[:, 3] - bb[:, 1])
        lim = (KEEP_W * cw * ws) * (KEEP_H * ch * hs)
        mg = max(2.0, 0.01 * ws)
        parent = list(range(G))

        def find(i):
            while parent[i] != i:
                parent[i] = parent[parent[i]]
                i = parent[i]
            return i
        for i in np.argsort(area):
            ok = (area > area[i]) & (area <= lim) & (bb[:, 0] - mg <= bb[i, 0]) & (bb[:, 1] - mg <= bb[i, 1]) & (bb[:, 2] + mg >= bb[i, 2]) & (bb[:, 3] + mg >= bb[i, 3])
            if ok.any():
                j = int(np.argmin(np.where(ok, area, np.inf)))
                parent[find(int(i))] = find(j)
        merged = {}
        for gi in range(G):
            merged.setdefault(find(gi), []).append(groups[gi])
        groups = [np.concatenate(v).astype(np.int64) for v in merged.values()]
    return groups


def _pick_nn(cand, A, B, cur_pt, gid, cur_g):
    """Chon net tiep theo: net co dau gan ngon but nhat (ve noi lien tuc, khong quet theo hang / cot); con net cua cung vat dang ve thi ve not truoc. Tra ve (chi so net, co dao chieu khong)."""
    dA = np.hypot(A[cand, 0] - cur_pt[0], A[cand, 1] - cur_pt[1])
    dB = np.hypot(B[cand, 0] - cur_pt[0], B[cand, 1] - cur_pt[1])
    d = np.minimum(dA, dB)
    same = gid[cand] == cur_g
    if same.any():
        d = np.where(same, d, np.inf)
    k = int(np.argmin(d))
    return int(cand[k]), bool(dB[k] < dA[k])


def _next_part(parts, left, alive, A, B, size, pcen, cur_pt, ws, hs):
    """Chon vat (nhom net) ve TIEP THEO nhu nguoi that: vat dau tien = vat LON, gan giua tranh; sau do sang vat GAN ngon but nhat (uu tien vat lon hon mot chut) -> thu tu ve tan ra tu vat chinh,
    khong quet tu tren xuong / trai sang phai. Tra ve chi so vat trong parts."""
    smax = max(float(size[i]) for i in left) or 1.0
    best, bc = None, 1e18
    for i in left:
        cand = parts[i][alive[parts[i]]]
        if not len(cand):
            continue
        rel = float(size[i]) / smax
        if cur_pt is None:
            cx = float(pcen[i][0]) / ws - 0.5
            cy = float(pcen[i][1]) / hs - 0.5
            c = -rel * (1.0 - 0.8 * min(1.0, math.hypot(cx, cy) / 0.6))
        else:
            d = float(np.minimum(np.hypot(A[cand, 0] - cur_pt[0], A[cand, 1] - cur_pt[1]), np.hypot(B[cand, 0] - cur_pt[0], B[cand, 1] - cur_pt[1])).min())
            c = d / (0.4 + math.sqrt(rel))
        if c < bc:
            best, bc = i, c
    return best


def _strokes(new, k, order="nn"):
    W, H = new.size
    ws = min(W, 640)
    sc = ws / float(W)
    hs = max(8, int(round(H * sc)))
    small = new if ws == W else new.resize((ws, hs), Image.LANCZOS)
    ink_s = line_art(small)
    sk = _thin(ink_s > 0.42)
    ys, xs = np.nonzero(sk)
    n = len(ys)
    res = None
    if n >= 40:
        idx = np.full((hs + 2, ws + 2), -1, np.int32)
        idx[ys + 1, xs + 1] = np.arange(n)
        nbrs = [[] for _ in range(n)]
        for dy, dx in _NB8:
            nb = idx[ys + 1 + dy, xs + 1 + dx]
            for v in np.nonzero(nb >= 0)[0].tolist():
                nbrs[v].append(int(nb[v]))
        junction = [len(a) >= 3 for a in nbrs]
        seg_of = [-1] * n
        paths = []
        for v0 in range(n):                                              # cac net = thanh phan lien thong sau khi bo nga re
            if junction[v0] or seg_of[v0] >= 0:
                continue
            comp = [v0]
            seg_of[v0] = len(paths)
            i = 0
            while i < len(comp):
                v = comp[i]; i += 1
                for u in nbrs[v]:
                    if not junction[u] and seg_of[u] < 0:
                        seg_of[u] = len(paths)
                        comp.append(u)
            if len(comp) < 2:                                            # net rat ngan van giu (chu nho: A, H, N, Đ... toan doan ngan giua cac nga re) - bo di thi chu bi mat net, chi hien ra o cuoi
                continue
            ends = [v for v in comp if sum(1 for u in nbrs[v] if seg_of[u] == seg_of[v0]) <= 1]
            cur = ends[0] if ends else comp[0]                           # net hoc (vong kin) thi bat dau o diem bat ky
            path, seen = [cur], {cur}
            while True:
                nxt = next((u for u in nbrs[cur] if seg_of[u] == seg_of[v0] and u not in seen), None)
                if nxt is None:
                    break
                path.append(nxt); seen.add(nxt); cur = nxt
            paths.append(path)
        S = len(paths)
        if S:
            A = np.array([[xs[p[0]], ys[p[0]]] for p in paths], np.float32)
            B = np.array([[xs[p[-1]], ys[p[-1]]] for p in paths], np.float32)
            alive = np.ones(S, bool)
            from . import ndi as _ndi
            cl, _nc = _ndi.label(_ndi.binary_dilation(sk, iterations=1))                  # "chu / vat" = cac net noi voi nhau: ve XONG ca chu/vat nay roi moi sang chu/vat khac (khong bo do net)
            gid = np.array([int(cl[ys[p[0]], xs[p[0]]]) for p in paths], np.int32)
            cur_g = -1
            corner = np.minimum(A[:, 0] + 0.4 * A[:, 1], B[:, 0] + 0.4 * B[:, 1])
            first = int(np.argmin(corner))                                      # bat dau o goc tren-trai
            cur_pt = None
            px, py, node_pos = [], [], np.full(n, -1, np.int32)
            last = None
            parts, pptr = None, 0
            sb_raw, pend_raw = [], {}
            if order == "tour":                                                  # 've tay': ve tung VAT (nhom net) mot: vat lon gan giua truoc, roi sang vat gan nhat (khong quet theo hang / cot)
                parts = _cell_groups(paths, xs, ys, sk, ws, hs, gid)
                zid = np.zeros(S, np.int32)
                psize = np.zeros(len(parts), np.float64)
                pcen = np.zeros((len(parts), 2), np.float64)
                for ui, pr in enumerate(parts):
                    zid[pr] = ui
                    allv_ = np.concatenate([paths[q_] for q_ in pr])
                    psize[ui] = float(len(allv_))
                    pcen[ui] = (float(xs[allv_].mean()), float(ys[allv_].mean()))
                left, cur_part, pptr = list(range(len(parts))), None, -1
            for step in range(S):
                if parts is not None:
                    if cur_part is None or not alive[parts[cur_part]].any():
                        cur_part = _next_part(parts, left, alive, A, B, psize, pcen, cur_pt, ws, hs)
                        left.remove(cur_part)
                        pptr += 1                                                # thu tu ghe tham (moc het vat o pend_raw theo thu tu ve)
                    cand = parts[cur_part][alive[parts[cur_part]]]
                    if cur_pt is None:
                        j = int(cand[np.argmin(corner[cand])])
                        rev = bool(B[j, 0] + 0.4 * B[j, 1] < A[j, 0] + 0.4 * A[j, 1])
                    else:
                        j, rev = _pick_nn(cand, A, B, cur_pt, gid, cur_g)
                elif cur_pt is None:
                    j = first
                    rev = bool(B[j, 0] + 0.4 * B[j, 1] < A[j, 0] + 0.4 * A[j, 1])
                else:
                    dA = np.hypot(A[:, 0] - cur_pt[0], A[:, 1] - cur_pt[1])
                    dB = np.hypot(B[:, 0] - cur_pt[0], B[:, 1] - cur_pt[1])
                    dm = np.where(alive, np.minimum(dA, dB), np.inf)
                    if cur_g >= 0:
                        same = alive & (gid == cur_g)
                        if same.any():
                            dm = np.where(same, dm, np.inf)                      # con net cua cung chu / vat thi ve not truoc
                    j = int(np.argmin(dm))
                    rev = bool(dB[j] < dA[j])
                alive[j] = False
                cur_g = int(gid[j])
                path = paths[j][::-1] if rev else paths[j]
                for v in path:
                    x, y = float(xs[v]), float(ys[v])
                    if last is not None:
                        dist = math.hypot(x - last[0], y - last[1])
                        if dist > 2.6:                                   # nhac but: ngon but di chuyen tren giay (khong de net)
                            kk = int(min(12, max(2, dist / 5.0)))
                            for t in range(1, kk):
                                px.append(last[0] + (x - last[0]) * t / kk); py.append(last[1] + (y - last[1]) * t / kk)
                    node_pos[v] = len(px)
                    px.append(x); py.append(y)
                    last = (x, y)
                cur_pt = last
                sb_raw.append(len(px) - 1)
                if parts is not None:
                    pend_raw[pptr] = len(px) - 1
            M = len(px)
            if M >= 40:
                Ts = np.full((hs, ws), np.inf, np.float32)
                val = node_pos >= 0
                Ts[ys[val], xs[val]] = node_pos[val] / float(M - 1)
                near = ink_s > 0.12
                from . import ndi
                onsk = np.isfinite(Ts)
                dist, (iy, ix) = ndi.distance_transform_edt(~onsk, return_indices=True)
                fill = ~onsk & near & (dist <= 2.0 * LINE_R * ws / 640.0 + 3.0)   # net day / nga re: lay thoi diem cua diem NET GAN NHAT (khong lan ca khoi nhu truoc)
                Ts[fill] = Ts[iy, ix][fill]
                Zs = np.full((hs, ws), np.inf, np.float32)                       # Z = thoi diem ve XONG chu / vat chua net do (de vung ruot khong bi bo trong khi tay da roi di)
                zg = zid if parts is not None else gid
                gend = {}
                for pi, pth in enumerate(paths):
                    g = int(zg[pi]); npv = node_pos[pth]
                    gend[g] = max(gend.get(g, 0.0), float(npv.max()) / float(M - 1))
                zt = np.full(n, np.inf, np.float32)
                for pi, pth in enumerate(paths):
                    zt[pth] = gend[int(zg[pi])]
                Zs[ys[val], xs[val]] = zt[val]
                Zs[fill] = Zs[iy, ix][fill]
                seeds = np.isfinite(Ts)                                          # diem nam tren net (hoac sat net day): dung de tinh "cach net bao xa / net gan nhat ve luc nao"
                Ts[~np.isfinite(Ts)] = 1.0
                Zs[~np.isfinite(Zs)] = 1.0
                Tf = Ts if ws == W else np.asarray(Image.fromarray(Ts, "F").resize((W, H), Image.NEAREST), np.float32)
                Zf = Zs if ws == W else np.asarray(Image.fromarray(Zs, "F").resize((W, H), Image.NEAREST), np.float32)
                Sf = seeds if ws == W else np.asarray(Image.fromarray(seeds.astype(np.uint8) * 255, "L").resize((W, H), Image.NEAREST)) > 0
                res = dict(T=Tf, pts=np.stack([np.array(px), np.array(py)], 1) / sc, M=M, seed=Sf, Z=Zf, ord=order,
                           sb=np.array(sb_raw, np.float64) / float(M - 1), pend=np.array([pend_raw[i] for i in sorted(pend_raw)], np.float64) / float(M - 1))
    if len(_ST) > 4:
        _ST.clear()
    _ST[k] = res
    return res


def pen_at(st, p, win=6):
    """Vi tri ngon but (x, y) o tien do p (0..1) cua duong ve, lam muot theo vai diem gan nhat."""
    M = st["M"]
    i = int(clamp(p) * (M - 1))
    seg = st["pts"][max(0, i - win):i + 1]
    return float(seg[:, 0].mean()), float(seg[:, 1].mean())


def line_mask(st, s, sw=0.006):
    """Mat na net da ve xong o tien do s (0..1) cua duong but; mep mem ngay sau ngon but."""
    return np.clip((s * (1.0 + sw) - st["T"]) / sw, 0.0, 1.0)


_OF = {}
BOLD_R = 0.030                                  # ban kinh net but DAM (ti le chieu rong khung hinh): net but to, mang mau that cua anh
FILL_LAG, FILL_SPREAD, FILL_D0 = 0.05, 0.15, 0.16      # 've vien': mau len sau net vien FILL_LAG (don vi thoi gian ve net), vung xa net toi FILL_SPREAD nua; FILL_D0 = khoang cach (ti le chieu rong) ma mau lan het


def stroke_fields(new, st):
    """Voi MOI diem anh: Tn = thoi diem (0..1, theo duong but) ma net GAN NHAT cua diem do duoc ve; dn = khoang cach toi net do (ti le chieu rong khung); wob = nhiu mem 0..1 (cho mep net but khong deu nhu ve tay).
    Dung de net but dam / mau len dung cho vua duoc but di qua. Tinh o do phan giai thap roi phong to; nho theo anh. None neu anh khong co net."""
    if st is None or st.get("seed") is None:
        return None
    k = ("of", st.get("ord")) + _key(new)
    r = _OF.get(k)
    if r is not None:
        return r
    with _klock("of", k):
        r = _OF.get(k)
        if r is not None:
            return r
        from . import ndi
        W, H = new.size
        ws = min(W, 480)
        hs = max(8, int(round(H * ws / float(W))))
        if ws != W:
            T_ = np.asarray(Image.fromarray(st["T"], "F").resize((ws, hs), Image.NEAREST), np.float32)
            sd = np.asarray(Image.fromarray(st["seed"].astype(np.uint8) * 255, "L").resize((ws, hs), Image.NEAREST)) > 0
        else:
            T_, sd = st["T"], st["seed"]
        if not sd.any():
            return None
        dist, (iy, ix) = ndi.distance_transform_edt(~sd, return_indices=True)
        Tn = np.ascontiguousarray(T_[iy, ix], dtype=np.float32)
        Zn = None
        if st.get("Z") is not None:
            Z_ = st["Z"] if ws == W else np.asarray(Image.fromarray(st["Z"], "F").resize((ws, hs), Image.NEAREST), np.float32)
            Zn = np.ascontiguousarray(Z_[iy, ix], dtype=np.float32)
        dn = (dist / float(ws)).astype(np.float32)
        rnd = np.random.RandomState(int(hashlib.md5(repr(_key(new)).encode()).hexdigest()[:8], 16))
        wob = np.asarray(Image.fromarray(rnd.rand(7, 12).astype(np.float32), "F").resize((ws, hs), Image.BICUBIC), np.float32)
        wob = np.clip((wob - wob.min()) / max(float(np.ptp(wob)), 1e-6), 0.0, 1.0)
        if ws != W:
            Tn = np.asarray(Image.fromarray(Tn, "F").resize((W, H), Image.BILINEAR), np.float32)
            if Zn is not None:
                Zn = np.asarray(Image.fromarray(Zn, "F").resize((W, H), Image.BILINEAR), np.float32)
            dn = np.asarray(Image.fromarray(dn, "F").resize((W, H), Image.BILINEAR), np.float32)
            wob = np.asarray(Image.fromarray(wob, "F").resize((W, H), Image.BILINEAR), np.float32)
        r = dict(Tn=Tn, dn=dn, wob=wob, Zn=Zn)
        if len(_OF) > 3:
            _OF.clear()
        _OF[k] = r
        return r


def bold_cover(f):
    """Mat na (0..1) vung ma cac net but DAM di qua: dai rong quanh net, mep hoi long chong nhu ve tay. Gan 1 trong dai, ve 0 ngoai dai."""
    R = BOLD_R * (0.72 + 0.56 * f["wob"])
    return np.clip((R - f["dn"]) / (0.35 * R), 0.0, 1.0).astype(np.float32)


_PF = {}
PEN_SPREAD, PEN_D0 = 0.05, 0.10                 # 've tay': vung xa net (khong nam trong dai net but) hien tre hon net gan nhat toi PEN_SPREAD; PEN_D0 = khoang cach (ti le chieu rong khung) ma do tre dat toi da


def pen_field(new, f):
    """Cho 've tay': (cov, Tc). cov = vung can hien (dai net but dam + moi phan anh khac mau giay: phan trung mau giay khong can hien), Tc = thoi diem (theo duong but) hien cua tung diem:
    net gan nhat ve toi dau thi o do hien, vung xa net hien tre hon mot chut (toi da PEN_SPREAD) -> ve het net la ra du anh, khong can quet them. Nho theo anh."""
    k = ("pf",) + _key(new)
    r = _PF.get(k)
    if r is not None:
        return r
    with _klock("pf", k):
        r = _PF.get(k)
        if r is not None:
            return r
        cb = bold_cover(f)
        a = np.asarray(new if new.mode == "RGB" else new.convert("RGB"), np.int16)
        content = (np.abs(a - np.array(paper_of(new), np.int16)).max(-1) > 14).astype(np.float32)
        cov = np.maximum(cb, content)
        Tc = (f["Tn"] + PEN_SPREAD * np.clip(f["dn"] / PEN_D0, 0.0, 1.0)).astype(np.float32)
        if f.get("Zn") is not None:
            Tc = np.minimum(Tc, np.maximum(f["Zn"], f["Tn"])).astype(np.float32)      # tay ve xong chu / vat nao thi chu / vat do day du mau, khong con lo trang sau lung tay
        r = (cov, Tc)
        if len(_PF) > 2:
            _PF.clear()
        _PF[k] = r
        return r


_FP = {}
FILL_SW = 0.0008                                # do mem mep to mau (don vi thoi gian to): rat nho = mep SAC theo vung, khong loang
FILL_TRAVEL = 0.14                              # ti le thoi gian moi vung danh cho viec tay di chuyen sang vung ke tiep
FILL_ANG = -0.35                                # goc net to (rad): to cac duong chéo nhe ca tay hay to


FILL_PATCH = 5.0                                # to mau: moi vung chia thanh ~5 mang (vung nho: 1 mang), toi da FILL_PMAX mang
FILL_PMAX = 14
FILL_ANGS = (-0.35, 0.55, 1.35, -1.05)          # huong cac duong to trong tung mang (rad): doi huong tu mang nay sang mang khac -> khong con "keo ngang tu trai sang phai, tu tren xuong"


def _patch_fill(xs, ys, hs, entry, seed):
    """To MAU nhu nguoi that to tay: vung duoc chia thanh cac MANG nho (k-means, mang gan deu nhau), tay to xong mang nay (vai duong to ngan qua lai, huong khac nhau moi mang) roi NHAY sang mang gan nhat
    chua to -> mau hien tung mang mot, khong co mep quet dai chay ngang qua vung. Tra ve (z = thu tu to 0..1 cua tung diem, P = duong di cua ngon but (KP, 2)). entry = cho tay dang dung (de bat dau o mang gan do)."""
    n = len(xs)
    xf, yf = xs.astype(np.float64), ys.astype(np.float64)
    sd = float(np.clip(math.sqrt(n / FILL_PATCH), 0.05 * hs, 0.16 * hs))
    K = int(np.clip(round(n / (sd * sd)), 1, FILL_PMAX))
    if K > 1:
        sub = np.arange(0, n, max(1, n // 3000))
        sx, sy = xf[sub], yf[sub]
        i0 = int(np.argmin((sx - entry[0]) ** 2 + (sy - entry[1]) ** 2))
        C = [(sx[i0], sy[i0])]
        dmin = (sx - sx[i0]) ** 2 + (sy - sy[i0]) ** 2
        for _ in range(K - 1):
            j = int(np.argmax(dmin))
            C.append((sx[j], sy[j]))
            dmin = np.minimum(dmin, (sx - sx[j]) ** 2 + (sy - sy[j]) ** 2)
        C = np.array(C, np.float64)
        for _ in range(6):
            a = ((sx[:, None] - C[None, :, 0]) ** 2 + (sy[:, None] - C[None, :, 1]) ** 2).argmin(1)
            for c in range(K):
                m = a == c
                if m.any():
                    C[c] = (sx[m].mean(), sy[m].mean())
        lab = ((xf[:, None] - C[None, :, 0]) ** 2 + (yf[:, None] - C[None, :, 1]) ** 2).argmin(1)
    else:
        lab = np.zeros(n, np.int64)
    cnt = np.bincount(lab, minlength=K)
    ids = [c for c in range(K) if cnt[c] > 0]
    cen = {c: (float(xf[lab == c].mean()), float(yf[lab == c].mean())) for c in ids}
    order, cur = [], (float(entry[0]), float(entry[1]))
    left = list(ids)
    rnd = np.random.RandomState(1000 + int(seed) * 7 + n % 997)           # co dinh theo vung (khong nhay giua cac khung hinh)
    while left:                                                          # mang ke tiep = mot trong 3 mang gan ngon but nhat (hay chon mang gan nhat, doi khi bo qua): khong di theo hang nhu quet
        left.sort(key=lambda c: (cen[c][0] - cur[0]) ** 2 + (cen[c][1] - cur[1]) ** 2)
        c = left.pop(int(rnd.choice(min(3, len(left)), p=[0.55, 0.30, 0.15][:min(3, len(left))] if len(left) >= 3 else None)))
        order.append(c)
        cur = cen[c]
    z = np.zeros(n, np.float32)
    done = 0
    for r, c in enumerate(order):
        m = np.nonzero(lab == c)[0]
        th = FILL_ANGS[(int(seed) * 3 + r) % len(FILL_ANGS)]
        cs, sn = math.cos(th), math.sin(th)
        u = xf[m] * cs + yf[m] * sn
        v = -xf[m] * sn + yf[m] * cs
        v0, vh = float(v.min()), float(v.max() - v.min() + 1.0)
        wb = float(np.clip(vh / 3.0, 0.02 * hs, 0.05 * hs))               # mang nho: ~3 duong to ngan
        nb = max(1, int(math.ceil(vh / wb)))
        b = np.minimum(((v - v0) / wb).astype(np.int32), nb - 1)
        a = (u - u.min()) / max(float(u.max() - u.min()), 1.0)
        a = np.where(b % 2 == 1, 1.0 - a, a)
        zl = (b + a) / nb
        z[m] = ((done + zl * len(m)) / float(n)).astype(np.float32)
        done += len(m)
    KP = int(np.clip(len(order) * 22 + 28, 28, 300))
    bi = np.minimum((z * KP).astype(np.int32), KP - 1)
    c_ = np.bincount(bi, minlength=KP).astype(np.float64)
    px_ = np.bincount(bi, weights=xf, minlength=KP)
    py_ = np.bincount(bi, weights=yf, minlength=KP)
    have = c_ > 0
    idx = np.arange(KP)
    P = np.stack([np.interp(idx, idx[have], px_[have] / c_[have]), np.interp(idx, idx[have], py_[have] / c_[have])], 1)
    if len(P) > 5:                                                       # lam muot nhe duong di cua tay
        Q = P.copy()
        Q[2:-2] = (P[:-4] + P[1:-3] + P[2:-2] + P[3:-1] + P[4:]) / 5.0
        P = Q
    return z, P


def fill_plan(new, st, paper=None, ce=None):
    """KE HOACH TO MAU (giai doan 2 cua 've tay'): sau khi ve het net vien, tay quay lai to MAU TUNG VUNG. Vung = mang lien thong cung mau, bi cac net vien ngan cach (nhu to tranh).
    Moi vung duoc to bang cac duong to qua lai (zig-zag) ben trong vung, mep to SAC va dung ngay tai net vien (khong loang ra ngoai vung). Vung trung mau giay (nen trang) khong can to.
    Tra ve dict: T (HxW, thoi diem to cua tung diem, 0..1; -1 = khong can to), n = so vung can to, A/M/B = thoi diem bat dau / bat dau to / ket thuc moi vung,
    paths = duong di cua ngon but trong tung vung (toa do anh), chroma = ti le cong viec to la vung CO MAU (0 = anh den trang), wfrac = ti le dien tich anh can to. None neu khong tach duoc vung. Nho theo anh."""
    if st is None:
        return None
    k = ("fp", paper, None if ce is None else tuple(round(float(v), 4) for v in ce)) + _key(new)
    if k in _FP:
        return _FP[k]
    with _klock("fp", k):
        if k in _FP:
            return _FP[k]
        r = _fill_plan(new, st, k, paper, ce)
        if len(_FP) > 40:
            _FP.clear()
        _FP[k] = r
        return r


def _fill_plan(new, st, k, paper_c=None, ce=None):
    from . import ndi
    W, H = new.size
    ws = min(W, 480)
    hs = max(8, int(round(H * ws / float(W))))
    sc = ws / float(W)
    small = new if ws == W else new.resize((ws, hs), Image.BOX)
    sm = np.asarray(small, np.float32)
    # net vien (o do phan giai nho) CHI de loai khoi viec do mau: pixel net khong tu thanh vung rieng, no theo mau vung ke ben (net vien that ra moi chi la ranh gioi giua cac vung mau)
    dark = Image.fromarray((line_art(new) > 0.42).astype(np.uint8) * 255, "L")
    ln = np.asarray(dark if ws == W else dark.resize((ws, hs), Image.BOX)) > 70
    free = ~ln
    if int(free.sum()) < 60:
        return None
    # chia mau: k-means nho (khoi tao co dinh theo do sang -> ket qua on dinh), lam muot nhan de het lom dom
    pix = sm[free]
    K = 9
    order = np.argsort(pix @ np.array([0.299, 0.587, 0.114], np.float32))
    C = pix[order[(np.linspace(0.03, 0.97, K) * (len(order) - 1)).astype(int)]].astype(np.float32)
    sub = pix[::max(1, len(pix) // 20000)]
    for _ in range(8):
        a = ((sub[:, None, :] - C[None, :, :]) ** 2).sum(2).argmin(1)
        for c in range(K):
            m = a == c
            if m.any():
                C[c] = sub[m].mean(0)
    lab = ((sm.reshape(-1, 1, 3) - C[None, :, :]) ** 2).sum(2).argmin(1).reshape(hs, ws)
    _d0, (jy, jx) = ndi.distance_transform_edt(ln, return_indices=True)
    lab = lab[jy, jx]                                                    # pixel net vien lay nhan cua pixel khong-net gan nhat
    score = np.stack([ndi.gaussian_filter((lab == c).astype(np.float32), 1.2) for c in range(K)])
    lab = score.argmax(0)
    # vung = thanh phan lien thong cua tung nhom mau
    rid = np.zeros((hs, ws), np.int32)
    off = 0
    for c in range(K):
        L, n = ndi.label(lab == c)
        if n:
            nz = L > 0
            rid[nz] = L[nz] + off
            off += int(n)
    cnt = np.bincount(rid.ravel(), minlength=off + 1)
    cnt[0] = 0
    amin = max(30, int(0.0010 * ws * hs))
    keep = [int(i) for i in np.argsort(-cnt)[:48] if cnt[i] >= amin]
    if not keep:
        return None
    remap = np.zeros(off + 1, np.int32)
    for j, i in enumerate(keep):
        remap[i] = j + 1
    core = remap[rid]                                                    # chi cac vung du lon; manh nho = 0 -> theo vung gan nhat
    _d, (iy, ix) = ndi.distance_transform_edt(core == 0, return_indices=True)
    full = core[iy, ix]
    paper = np.array(paper_of(new) if paper_c is None else paper_c, np.float32)
    nreg = len(keep)
    info = []
    for j in range(nreg):
        m = core == j + 1
        ys, xs = np.nonzero(m)
        col = np.median(sm[m], axis=0)
        border = bool(ys.min() <= 1 or xs.min() <= 1 or ys.max() >= hs - 2 or xs.max() >= ws - 2)
        info.append(dict(j=j + 1, area=int(m.sum()), cx=float(xs.mean()), cy=float(ys.mean()), col=col,
                         blank=bool(np.abs(col - paper).max() <= 24.0), border=border, sat=float(col.max() - col.min())))
    work = [d for d in info if not d["blank"]]
    T = np.full((hs, ws), -1.0, np.float32)
    plan = dict(T=None, n=0, A=np.zeros(0), M=np.zeros(0), B=np.zeros(0), paths=[], chroma=0.0, wfrac=0.0, ck=np.zeros(0, np.int32), E=np.zeros(1))
    if work:
        atot = float(sum(d["area"] for d in work))
        if ce is not None:                                               # 've tay': moi vung bi chia theo "khuc" ve (net nao ve luc nao) -> mau chi hien o cho tay vua ve, vung nho (1 vat) khong bi cat
            nck = len(ce) - 1
            tn_ = stroke_fields(new, st)["Tn"]                           # thoi diem ve cua net GAN NHAT (moi diem anh, ke ca ruot vung)
            tk = tn_ if tn_.shape == (hs, ws) else np.asarray(Image.fromarray(tn_, "F").resize((ws, hs), Image.NEAREST), np.float32)
            ckm = np.clip(np.searchsorted(ce, tk, "right") - 1, 0, nck - 1).astype(np.int32)
            pieces = []
            for d in work:
                m = full == d["j"]
                cnt = np.bincount(ckm[m], minlength=nck).astype(np.float64)
                dom = int(np.clip(np.searchsorted(ce, float(np.percentile(tk[m], 85)), "right") - 1, 0, nck - 1))      # vung chi to khi phan lon net quanh no da ve xong
                if d["area"] < 0.12 * ws * hs:                           # vat / vung nho: to tron trong mot khuc (khong cat doi)
                    keep_c = [dom]
                else:                                                    # vung nen lon (troi, dat...): to dan theo cho tay vua ve
                    keep_c = [c for c in range(nck) if cnt[c] >= max(40.0, 0.08 * d["area"])] or [dom]
                lut = np.array([min(keep_c, key=lambda kc: abs(kc - c)) for c in range(nck)], np.int32)
                cm = lut[ckm]
                for c in keep_c:
                    mm = m & (cm == c)
                    na = int(mm.sum())
                    if na <= 0:
                        continue
                    ys_, xs_ = np.nonzero(mm)
                    pieces.append(dict(d, area=na, cx=float(xs_.mean()), cy=float(ys_.mean()), ck=c, sel=mm))
            work = pieces
        zs, paths = {}, {}
        for wi_, d in enumerate(work):
            d["id"] = wi_

        def visit(d, cur):
            """Tinh thu tu to + duong di cua tay trong vung d (bat dau o mang gan cho tay dang dung `cur`); tra ve cho tay luc to xong vung (toa do nho)."""
            ys, xs = np.nonzero(d["sel"]) if ce is not None else np.nonzero(full == d["j"])
            z, P = _patch_fill(xs, ys, hs, cur, d["id"])
            zs[d["id"]] = (ys, xs, z)
            paths[d["id"]] = (P + 0.5) / sc
            e = paths[d["id"]][-1] * sc
            return (float(e[0]), float(e[1]))
        if ce is None:
            # thu tu to: tung vung gan nhat tiep theo (tay khong nhay xa); nen lon cham man hinh to SAU CUNG
            p0 = st["pts"][-1] * sc
            back = [d for d in work if d["border"] and d["area"] > 0.18 * atot]
            rest = [d for d in work if d not in back]
            seq, cur = [], (float(p0[0]), float(p0[1]))
            for pool in (rest, sorted(back, key=lambda d: d["area"])):
                pool = list(pool)
                while pool:
                    d = min(pool, key=lambda d: (d["cx"] - cur[0]) ** 2 + (d["cy"] - cur[1]) ** 2)
                    pool.remove(d)
                    seq.append(d)
                    cur = visit(d, cur)
        else:                                                            # theo tung khuc ve: xong khuc nao to het mau khuc do (vung gan nhat truoc, bat dau tu cho but vua ve xong)
            seq = []
            for c in range(len(ce) - 1):
                pool = [d for d in work if d["ck"] == c]
                e0 = st["pts"][int(clamp(float(ce[c + 1])) * (st["M"] - 1))] * sc
                cur = (float(e0[0]), float(e0[1]))
                while pool:
                    d = min(pool, key=lambda d: (d["cx"] - cur[0]) ** 2 + (d["cy"] - cur[1]) ** 2)
                    pool.remove(d)
                    seq.append(d)
                    cur = visit(d, cur)
        wgt = np.array([0.03 + math.sqrt(d["area"] / atot) for d in seq], np.float64)
        edges = np.concatenate([[0.0], np.cumsum(wgt) / wgt.sum()])
        A, M, B = edges[:-1], edges[:-1] + FILL_TRAVEL * (edges[1:] - edges[:-1]), edges[1:]
        for i, d in enumerate(seq):
            ys, xs, z = zs[d["id"]]
            T[ys, xs] = (M[i] + (B[i] - M[i]) * z).astype(np.float32)
        chroma = sum(w for w, d in zip(wgt, seq) if d["sat"] > 30.0) / float(wgt.sum())
        plan = dict(T=None, n=len(seq), A=A, M=M, B=B, paths=[paths[d["id"]] for d in seq], chroma=float(chroma),
                    wfrac=float(atot) / float(hs * ws), ck=np.array([d.get("ck", 0) for d in seq], np.int32), E=np.zeros(1))
        if ce is not None:                                               # E[c] = thoi diem to (0..1) luc bat dau khuc c
            cnts = np.bincount(plan["ck"], minlength=len(ce) - 1).cumsum()
            plan["E"] = np.concatenate([[0.0], edges[cnts]])
    if ce is not None and ws != W:                                       # 've tay': phong to chi noi suy giua cac diem can to (khong tron voi -1 cua vung khong to -> khong ra vien mong som hien o ria vung trang)
        vm = (T >= 0.0).astype(np.float32)
        a_ = np.asarray(Image.fromarray(np.where(T >= 0.0, T, 0.0).astype(np.float32), "F").resize((W, H), Image.BILINEAR), np.float32)
        b_ = np.asarray(Image.fromarray(vm, "F").resize((W, H), Image.BILINEAR), np.float32)
        plan["T"] = np.where(b_ > 0.5, a_ / np.maximum(b_, 1e-3), -1.0).astype(np.float32)
    else:
        plan["T"] = T if ws == W else np.asarray(Image.fromarray(T, "F").resize((W, H), Image.BILINEAR), np.float32)
    return plan


def fill_pos(fp, tau, p0):
    """Vi tri ngon but (x, y) o thoi diem to tau (0..1): luc dau di tu p0 (diem but vua ve xong) toi vung dau tien, roi di theo cac duong to cua tung vung."""
    n = fp["n"]
    if n == 0:
        return p0
    t = clamp(tau)
    i = int(np.clip(np.searchsorted(fp["A"], t, "right") - 1, 0, n - 1))
    P = fp["paths"][i]
    prev = p0 if i == 0 else fp["paths"][i - 1][-1]
    if t < fp["M"][i]:
        f = smooth((t - fp["A"][i]) / max(float(fp["M"][i] - fp["A"][i]), 1e-6))
        return float(prev[0] + (P[0][0] - prev[0]) * f), float(prev[1] + (P[0][1] - prev[1]) * f)
    z = clamp((t - fp["M"][i]) / max(float(fp["B"][i] - fp["M"][i]), 1e-6)) * (len(P) - 1)
    j = int(z)
    j2 = min(j + 1, len(P) - 1)
    f = z - j
    return float(P[j][0] + (P[j2][0] - P[j][0]) * f), float(P[j][1] + (P[j2][1] - P[j][1]) * f)


_BP = {}                                        # ke hoach cau be (truong hien + hinh hoc cac hang quet), nho theo kich thuoc


def boy_plan(W, H, ref=None, sprext=None):
    """KE HOACH 'cau be cam but': cau be quet TUNG HANG ngang (hang le quet nguoc lai), moi hang la mot net co TRON hien dan, ngon but di sat mep truoc cua net -> anh hien ra dung noi cau be vua ve.
    Ket thuc moi hang cau be di HAN ra ngoai khung roi moi quay dau / sang hang ke (khong ai thay cau be lat nguoi), nen khong nhay, khong giat.
    ref = chieu cao khung goc (khi anh bi xoay 90 do de doi huong mo thi hang van cao bang cau be / khung goc); sprext = canh DAI NHAT cua hinh cau be (px; khi mo theo chieu doc be di theo chieu cao) de biet phai di xa bao nhieu moi khuat han.
    Tra ve dict(T = thoi diem hien cua tung diem anh (HxW, 0..1), nb = so hang, rx = ban kinh dau co, L = quang duong ngon but moi hang, ext = doan di them ra ngoai khung)."""
    ref = float(ref or H)
    row = max(1.0, BOY_ROW * BOY_H * ref)                               # chieu cao 1 hang ~ 1,45 lan cau be
    nb = int(max(2, min(14, round(H / row))))
    rx = 0.6 * H / float(nb)
    ext = float(sprext if sprext else BOY_H * ref * 1.1) + rx               # di them ra ngoai khung de cau be khuat han (than be nam ben trai ngon but)
    k = (int(W), int(H), nb, int(round(rx)), int(round(ext)))
    r = _BP.get(k)
    if r is not None:
        return r
    xn, yn = _grid(W, H)
    warp = 0.07 * np.sin(xn * 5.3 + 0.7) + 0.035 * np.sin(xn * 13.0 + 2.1)       # ranh gioi giua cac hang hoi uon luon cho giong tay ve
    yb = yn * nb + warp
    band = np.clip(np.floor(yb), 0, nb - 1).astype(np.int32)
    frac = np.clip(yb - band, 0.0, 1.0)
    dy = frac * 2.0 - 1.0
    c = np.sqrt(np.maximum(0.0, 1.0 - dy * dy))                                   # dau co tron: giua hang di truoc, hai mep hang tre
    xx = np.broadcast_to(xn * W, (H, W))
    xx = np.where(band % 2 == 0, xx, W - xx)                                      # hang le chay nguoc lai
    L = W + 2.0 * rx + ext
    s = (xx - rx * c + rx) / L
    T = np.ascontiguousarray((band + np.clip(s, 0.0, 1.0)) / float(nb), dtype=np.float32)
    res = dict(T=T, nb=nb, rx=rx, L=L, ext=ext, W=W, H=H)
    if len(_BP) > 4:
        _BP.clear()
    _BP[k] = res
    return res


def boy_mask(pl, s, sw=0.004):
    """Mat na hien (0..1) o tien do s (0..1) cua toan bo cac hang; mep net co hoi mem."""
    return np.clip((s * (1.0 + sw) - pl["T"]) / sw, 0.0, 1.0)


def boy_at(pl, s):
    """(x, y_ngon_but, huong, u, hang) cua cau be o tien do s: huong = +1 dang quet sang phai / -1 sang trai; u = tien do trong hang (0..1). Ngon but nam sat mep truoc cua net co."""
    t = clamp(s) * pl["nb"] * 0.99999
    band = int(t)
    u = t - band
    x = -pl["rx"] + u * pl["L"] + 0.7 * pl["rx"]
    if band % 2:
        x = pl["W"] - x
    return x, (band + 0.5) / pl["nb"] * pl["H"], (1 if band % 2 == 0 else -1), u, band


def _lerp(a, b, u):
    return a[0] + (b[0] - a[0]) * u, a[1] + (b[1] - a[1]) * u


def _prep_old(old, size, paper=False):
    W, H = size
    if paper:
        return Image.new("RGB", size, PAPER)
    if old is None:
        return Image.new("RGB", size, PAPER)
    return old if old.size == size else old.resize(size, Image.BILINEAR)


# ---------------------------------------------------------------- huong mo (trai->phai, phai->trai, tren->xuong, duoi->len)
def dir_of(kind, dirn="auto", k=0):
    """Huong mo thuc su cua khung thu k: 'lr' | 'rl' | 'tb' | 'bt'. dirn='auto' -> doi huong theo tung khung; kieu khong co huong (muc, mo dan...) luon tra 'lr'.
    Cuon tranh chi keo ngang: tb -> lr, bt -> rl, tu dong thi trai->phai roi phai->trai xen ke."""
    kind = pick(kind)
    if kind not in DIRECTIONAL:
        return "lr"
    if kind in HORIZ_ONLY:
        if dirn in ("lr", "tb"):
            return "lr"
        if dirn in ("rl", "bt"):
            return "rl"
        return "lr" if int(k) % 2 == 0 else "rl"
    return dirn if dirn in DIRS else AUTO_SEQ[int(k) % len(AUTO_SEQ)]


def _fw(im, d):
    """Anh goc -> anh o khong gian 'chuan' (hieu ung viet theo huong trai->phai)."""
    if d == "lr":
        return im
    if d == "rl":
        return ImageOps.mirror(im)
    t = im.transpose(Image.TRANSPOSE)
    return t if d == "tb" else ImageOps.mirror(t)


def _bk(im, d):
    """Nguoc lai cua _fw."""
    if d == "lr":
        return im
    if d == "rl":
        return ImageOps.mirror(im)
    return im.transpose(Image.TRANSPOSE) if d == "tb" else ImageOps.mirror(im).transpose(Image.TRANSPOSE)


def _pt(x, y, d, Wo, Ho):
    """Diem o khong gian chuan -> diem tren anh goc (Wo x Ho)."""
    if d == "rl":
        return Wo - x, y
    if d == "tb":
        return y, x
    if d == "bt":
        return y, Ho - x
    return x, y


def _vec(dx, dy, d):
    """Vector o khong gian chuan -> vector tren anh goc."""
    if d == "rl":
        return -dx, dy
    if d == "tb":
        return dy, dx
    if d == "bt":
        return dy, -dx
    return dx, dy


FIT_STEP = 3.0                                  # ban tay tu xoay de nam trong khung: buoc goc (do)
FIT_ALPHA = 40                                  # chi tinh phan ban tay nhin thay duoc (goc canh tay mo dan thi khong tinh)
_HX = {}                                        # bang do tran theo goc xoay cua tung hinh tay
_HR = {}                                        # hinh tay da xoay (nho)


def _hand_table(sp):
    """Voi hinh (anh, (ax, ay)): bang goc xoay (-180..180 do, THEO CHIEU KIM DONG quanh ngon but) -> do tay thoi ra trai / phai / tren / duoi ngon but (px, chi phan nhin thay)."""
    img, (ax, ay) = sp
    r = _HX.get(id(img))
    if r is not None and r[0] is img and r[1] == (ax, ay):
        return r[2:]
    al = np.asarray(img.getchannel("A"))[::2, ::2]
    ys, xs = np.nonzero(al > FIT_ALPHA)
    vx, vy = xs.astype(np.float32) * 2 - ax, ys.astype(np.float32) * 2 - ay
    ang = np.arange(-180.0, 180.0 + 1e-6, FIT_STEP)
    th = np.radians(ang)[:, None]
    xr, yr = vx[None, :] * np.cos(th) - vy[None, :] * np.sin(th), vx[None, :] * np.sin(th) + vy[None, :] * np.cos(th)
    if vx.size == 0:
        z = np.zeros(len(ang), np.float32); tb = (ang, z, z, z, z)
    else:
        tb = (ang, np.maximum(0, -xr.min(1)) + 2, np.maximum(0, xr.max(1)) + 2, np.maximum(0, -yr.min(1)) + 2, np.maximum(0, yr.max(1)) + 2)
    if len(_HX) > 8:
        _HX.clear()
    _HX[id(img)] = (img, (ax, ay)) + tb
    return tb


def _hand_fit_angle(sp, x, y, W, H, m):
    """Goc xoay NHO NHAT (do, theo chieu kim dong, quanh ngon but o (x, y)) de ban tay nam tron trong khung W x H (chua le m px). Khong goc nao vua thi chon goc tran it nhat."""
    ang, L, R, U, D = _hand_table(sp)
    ov = np.maximum(0, m - (x - L)) + np.maximum(0, (x + R) - (W - m)) + np.maximum(0, m - (y - U)) + np.maximum(0, (y + D) - (H - m))
    ok = np.nonzero(ov <= 0.5)[0]
    if len(ok):
        return float(ang[ok[int(np.argmin(np.abs(ang[ok]) + 1e-3 * (ang[ok] < 0)))]])
    return float(ang[int(np.argmin(ov + 1e-3 * np.abs(ang)))])


def _hand_rot(sp, a):
    """Xoay hinh (anh, (ax, ay)) `a` do THEO CHIEU KIM DONG quanh diem neo (ngon but); tra ve hinh moi + diem neo moi (nho trong bo nho)."""
    if abs(a) < 1e-6:
        return sp
    img, (ax, ay) = sp
    k = (id(img), round(a, 2))
    r = _HR.get(k)
    if r is not None and r[0] is img:
        return r[1]
    w, h = img.size
    R = int(math.ceil(math.hypot(max(ax, w - ax), max(ay, h - ay)))) + 2
    pad = Image.new("RGBA", (2 * R + 1, 2 * R + 1), (0, 0, 0, 0))
    pad.paste(img, (R - ax, R - ay))
    f = np.asarray(pad, np.float32)
    al = f[..., 3:4] / 255.0
    pm = np.concatenate([f[..., :3] * al, f[..., 3:4]], -1)                   # nhan san alpha: xoay khong bi vien den
    ch = [Image.fromarray(np.clip(pm[..., i] + 0.5, 0, 255).astype(np.uint8)).rotate(-a, Image.BICUBIC, center=(R, R)) for i in range(4)]
    g = np.stack([np.asarray(c, np.float32) for c in ch], -1)
    A = g[..., 3:4] / 255.0
    rgb = np.where(A > 0.004, g[..., :3] / np.maximum(A, 0.004), 0.0)
    out = Image.fromarray(np.clip(np.concatenate([rgb, g[..., 3:4]], -1) + 0.5, 0, 255).astype(np.uint8), "RGBA")
    bb = out.getchannel("A").getbbox()
    if bb is None:
        res = (out, (R, R))
    else:
        res = (out.crop(bb), (R - bb[0], R - bb[1]))
    if len(_HR) > 160:
        _HR.clear()
    _HR[k] = (img, res)
    return res


class _Sprites:
    """Gom cac hinh (tay, cau be, co, cuon tranh) hieu ung muon dan, roi dan len anh KET QUA o vi tri da quy doi ve anh goc (hinh khong bi xoay; chi lat guong khi mo tu phai sang trai).
    Rieng ban tay 've tay' (fit=True): tu xoay quanh ngon but, goc nho nhat de tay nam tron trong khung (ve sat mep tren / phai thi tay xoay xuong / sang trai thay vi tran ra ngoai man hinh)."""

    def __init__(self):
        self.items = []

    def __call__(self, out, sp, x, y, shadow=True, face=None, away=None, vel=None, fit=False):
        """face: +1/-1 cho nhan vat huong theo chieu chay (None = hinh tuy huong: chi lat khi mo tu phai sang trai); away = (f, ux, uy): tay o ngoai khung, lech f*(ux*W, uy*H)."""
        if sp is not None:
            self.items.append((sp, x, y, shadow, face, away, vel, fit))

    def flush(self, out, d, tw, th):
        Wo, Ho = out.size
        for sp, x, y, shadow, face, away, vel, fit in self.items:
            ax = ay = 0.0
            if away:
                ax, ay = _vec(away[0] * away[1] * tw, away[0] * away[2] * th, d)
            xo, yo = _pt(x, y, d, Wo, Ho)
            if face is None:
                fo = -1 if d == "rl" else 1
            elif d == "rl":
                fo = -face
            elif d in ("tb", "bt"):
                vx = _vec(vel[0], vel[1], d)[0] if vel else 0.0
                fo = -1 if vx < -0.5 else 1
            else:
                fo = face
            sp2 = sprites.flip(sp) if fo < 0 else sp
            if fit:
                sp2 = _hand_rot(sp2, _hand_fit_angle(sp2, xo, yo, Wo, Ho, 0.012 * min(Wo, Ho) + 4))
            sprites.paste(out, sp2[0], xo + ax, yo + ay, sp2[1][0], sp2[1][1], shadow)


# ---------------------------------------------------------------- thoi luong tu dong theo do dai cau
AUTO_FRAC = {"pen": 0.72, "boy_pen": 0.75, "outline": 0.55, "scroll": 0.45, "brush": 0.50, "ink": 0.30, "regions": 0.35,
             "tear": 0.28, "slide": 0.25, "iris": 0.28, "blinds": 0.30, "black": 0.22, "fade": 0.20, "flash": 0.20}
AUTO_RANGE = {"pen": (2.5, 10.0), "boy_pen": (3.0, 9.0), "outline": (1.8, 6.5), "scroll": (1.5, 5.0), "brush": (1.5, 5.5)}


def auto_dur(kind, d):
    """Thoi gian hieu ung (giay) tu dong theo do dai cua khung (d giay): cau dai -> ve cham, cau ngan -> ve nhanh; kieu ve tay can nhieu thoi gian hon kieu mo nhanh.
    Luon <= 60% do dai khung de phan con lai giu nguyen hinh (rieng 've tay' va 'cau be cam but' <= 80%: anh day net can nhieu thoi gian de thay ro tung vat duoc ve roi to mau)."""
    lo, hi = AUTO_RANGE.get(kind, (0.8, 3.5))
    v = max(lo, min(hi, AUTO_FRAC.get(kind, 0.3) * float(d)))
    return max(0.3, min(v, (0.8 if kind in ("pen", "boy_pen") else 0.6) * float(d)))


# ---------------------------------------------------------------- cac kieu moi
_JG = {}


def _noise1d(n, spacing, rnd):
    """Nhieu 1 chieu mem (n diem, cac diem chot cach nhau `spacing`), gia tri -1..1."""
    spacing = max(1.0, spacing)
    xs = np.arange(0.0, n + spacing + 1.0, spacing)
    return np.interp(np.arange(n), xs, rnd.rand(len(xs)) * 2.0 - 1.0).astype(np.float32)


def _jag(n, seed):
    """Duong xe rach: do lech (-1..1) cua mep giay theo tung hang diem (nhieu tang: rang cua to, vua, nho). Nho."""
    key = (n, seed)
    r = _JG.get(key)
    if r is None:
        rnd = np.random.RandomState(seed)
        j = 0.55 * _noise1d(n, n / 14.0, rnd) + 0.30 * _noise1d(n, n / 48.0, rnd) + 0.15 * _noise1d(n, n / 150.0, rnd)
        r = np.clip(j / max(float(np.abs(j).max()), 1e-6), -1.0, 1.0).astype(np.float32)
        if len(_JG) > 24:
            _JG.clear()
        _JG[key] = r
    return r


def _shade(out, f):
    """Nhan anh (PIL) voi he so sang f (HxW hoac HxWx1) -> anh PIL."""
    a = np.asarray(out, np.float32) * (f if f.ndim == 3 else f[:, :, None])
    return Image.fromarray(np.clip(a + 0.5, 0, 255).astype(np.uint8))


def _tear(q, old, new):
    """Xe giay: to giay cu bi xe rach tu trai sang phai de lo tranh moi; mep rach ram ram co vien giay trang va bong do len tranh moi."""
    W, H = new.size
    p = 0.85 * q + 0.15 * smooth(q)
    amp = 0.024 * W
    front = -1.5 * amp + p * (W + 3.0 * amp)
    xs = np.arange(W, dtype=np.float32)[None, :]
    xf = (front + amp * _jag(H, 5)).astype(np.float32)[:, None]
    m = np.clip(xf - xs + 0.5, 0.0, 1.0)                                  # 1 = da lo tranh moi
    lipw = 0.012 * W * (0.45 + 0.55 * (_jag(H, 9) * 0.5 + 0.5))           # vien giay cu bi lat len (rong hep khong deu)
    lip = np.clip(xf + lipw[:, None] - xs + 0.5, 0.0, 1.0) - m
    out = np.asarray(_mix(old, new, m), np.float32)
    paper = np.array((250, 248, 242), np.float32)[None, None, :]
    la = (0.92 * lip)[:, :, None]
    out = out * (1.0 - la) + paper * la
    shw = 0.04 * W
    sh = np.clip(1.0 - (xf - xs) / shw, 0.0, 1.0) ** 2 * m                # bong cua to giay dang lat len, do xuong tranh moi
    out = out * (1.0 - 0.34 * sh[:, :, None])
    ahead = np.clip(1.0 - (xs - xf - lipw[:, None]) / (0.07 * W), 0.0, 1.0) * (1.0 - m) * (1.0 - lip)
    out = out * (1.0 - 0.10 * ahead[:, :, None])                          # giay cu cong len gan mep rach: toi nhe
    return Image.fromarray(np.clip(out + 0.5, 0, 255).astype(np.uint8))


def _slide(q, old, new):
    """Truot giay: tranh moi truot tu trai sang de len tranh cu (tranh cu bi day nhe theo, toi dan), co bong ngay mep truot."""
    W, H = new.size
    p = 0.8 * (1.0 - (1.0 - q) ** 3) + 0.2 * smooth(q)
    x = int(round(W * p))
    sh = int(round(0.16 * W * p))
    base = Image.new("RGB", (W, H), (0, 0, 0))
    base.paste(old, (sh, 0))
    a = np.asarray(base, np.float32)
    a[:, x:] *= (1.0 - 0.20 * p)
    swd = max(0, min(W - x, int(0.08 * W)))
    if swd > 0:
        g = (1.0 - np.linspace(0.0, 1.0, swd, dtype=np.float32)) ** 2
        a[:, x:x + swd] *= (1.0 - 0.50 * min(1.0, q * 12.0) * g)[None, :, None]            # bong do dan ra luc moi bat dau truot
    base = Image.fromarray(np.clip(a + 0.5, 0, 255).astype(np.uint8))
    if x > 0:
        base.paste(new, (x - W, 0))
        ln = np.asarray(base.crop((max(0, x - 2), 0, x, H)), np.float32)           # mep truot sang nhe
        base.paste(Image.fromarray(np.clip(ln * 0.6 + 255 * 0.4, 0, 255).astype(np.uint8)), (max(0, x - 2), 0))
    return base


_DIST = {}


def _iris(q, old, new):
    """Mo vong tron: vong tron tu mep trai loe dan ra phu het khung, vien vong toi nhe."""
    W, H = new.size
    cx, cy = 0.18 * W, 0.5 * H
    R = math.hypot(max(cx, W - cx), max(cy, H - cy)) * 1.01
    p = 0.85 * q + 0.15 * smooth(q)
    r = R * p
    key = (W, H)
    d = _DIST.get(key)
    if d is None:
        yy, xx = np.mgrid[0:H, 0:W].astype(np.float32)
        d = np.hypot(xx - np.float32(cx), yy - np.float32(cy)).astype(np.float32)
        if len(_DIST) > 4:
            _DIST.clear()
        _DIST[key] = d
    soft = max(2.0, 0.003 * W)
    m = np.clip((r - d) / soft, 0.0, 1.0)
    out = _mix(old, new, m)
    ring = np.exp(-(((d - r) / max(2.0, 0.007 * W)) ** 2)) * min(1.0, p * 10.0, (1.0 - p) * 10.0)
    outer = np.clip(1.0 - (d - r) / (0.05 * W), 0.0, 1.0) ** 2 * (d >= r) * min(1.0, p * 10.0)
    return _shade(out, 1.0 - 0.38 * ring - 0.22 * outer)


BLIND_N = 10


def _blinds(q, old, new):
    """Rem soc: anh chia thanh 10 thanh doc, tung thanh XOAY LAT lan luot tu trai sang phai (tranh cu thu hep lai thanh khe sang mau, roi tranh moi mo rong ra), thanh sau lat tre hon thanh truoc mot chut."""
    W, H = new.size
    n = BLIND_N
    p = 0.9 * q + 0.1 * smooth(q)
    out = old.copy()
    back = Image.new("RGB", (1, 1), (214, 216, 222))
    for i in range(n):
        x0, x1 = int(round(i * W / float(n))), int(round((i + 1) * W / float(n)))
        w = x1 - x0
        f = smooth(clamp((p * 1.55 - 0.55 * i / (n - 1)) / 1.0))        # tien do lat cua thanh i (0..1)
        if f <= 0.0:
            continue
        if f >= 1.0:
            out.paste(new.crop((x0, 0, x1, H)), (x0, 0))
            continue
        out.paste(back.resize((w, H)), (x0, 0))                         # mat sau thanh rem khi dang xoay
        src, u = (old, 1.0 - 2.0 * f) if f < 0.5 else (new, 2.0 * f - 1.0)
        nw = max(1, int(round(w * u)))
        if u > 0.0:
            sl = src.crop((x0, 0, x1, H)).resize((nw, H), Image.BILINEAR)
            sh = 0.80 + 0.20 * u                                         # thanh nghieng thi toi hon chut
            sl = Image.fromarray(np.clip(np.asarray(sl, np.float32) * sh + 0.5, 0, 255).astype(np.uint8))
            out.paste(sl, (x0 + (w - nw) // 2, 0))
    return out


def compose(kind, q, old, new, k=0, dirn="auto"):
    """Ghep ra khung hinh o tien do q (0..1) cua hieu ung. old = anh khung truoc (None = nen giay). Tra ve anh RGB cung kich thuoc voi new.
    k = so thu tu khung (de doi huong / mang muc), dirn = 'auto' | 'lr' | 'rl' | 'tb' | 'bt' (chi tac dung len cac kieu co huong, xem DIRECTIONAL)."""
    kind = pick(kind)
    if kind in ("none", "cut"):
        return new
    W, H = new.size
    q = clamp(q)
    if q >= 1.0:
        if kind == "pen":                                             # 've tay' co thu nho: khung cuoi giu nguyen tranh co nho (co dinh)
            h = pen_hold(new, dir_of(kind, dirn, k))
            if h is not None:
                return h
        return new
    d = dir_of(kind, dirn, k)
    col = _Sprites()
    gm = _pen_geom(new, d) if kind == "pen" else None                     # 've tay': tranh co nho co dinh, can giua, le trang deu (tay tu xoay de khong tran ra ngoai man hinh)
    if d == "lr":
        out = _native(kind, q, old, new, k, col, H, gm)
        col.flush(out, "lr", W, H)
        return out
    old_t, new_t = _fw(_prep_old(old, (W, H)), d), _fw(new, d)
    out = _bk(_native(kind, q, old_t, new_t, k, col, H, gm), d)
    col.flush(out, d, new_t.size[0], new_t.size[1])
    return out


def _native(kind, q, old, new, k, put, ref, gm=None):
    """Hieu ung o khong gian chuan (mo tu TRAI sang PHAI, tu TREN xuong). put(out, hinh, x, y, ...) chi ghi nho hinh de dan sau (xem _Sprites); ref = chieu cao khung goc (co hinh)."""
    W, H = new.size
    p = smooth(q)
    if kind == "black":
        return Image.blend(Image.new("RGB", (W, H), (0, 0, 0)), new, p)
    old = _prep_old(old, (W, H))
    if kind == "fade":
        return Image.blend(old, new, p)
    if kind == "flash":
        a = smooth(q / 0.12)
        s = 1.0 + 0.14 * (1.0 - smooth(min(1.0, q * 1.4))) ** 2
        z = new if s < 1.002 else new.resize((int(W * s + 0.5), int(H * s + 0.5)), Image.BILINEAR).crop(((int(W * s + 0.5) - W) // 2, (int(H * s + 0.5) - H) // 2, (int(W * s + 0.5) - W) // 2 + W, (int(H * s + 0.5) - H) // 2 + H))
        out = Image.blend(old, z, a)
        f = max(0.0, 1.0 - q * 2.6) ** 2 * 0.72
        return Image.blend(out, Image.new("RGB", (W, H), (255, 255, 255)), f) if f > 0.003 else out
    if kind == "brush":                                               # co quet tung net tron noi tiep nhau: co di qua dau hien dung dau do
        pb = clamp(0.88 * q + 0.12 * p)
        out = _mix(old, new, mask("brush", pb, W, H))
        bh = sprites.brush_hand(int(ref * HAND_H))                      # tay cam co (AI ve) chay dung theo mep truoc cua net co
        if bh is not None:
            x, y = sweep_pos(pb, W, H, BRUSH_NB, lead=0.7)
            f = 1.0 - smooth(q / 0.06) + smooth((q - 0.93) / 0.07)       # vao tu goc duoi-phai, ve xong thi rut ra
            put(out, bh, x + 2 * math.sin(q * 90), y + 3 * math.sin(q * 61), away=(f, 0.28, 0.38))
        return out
    if kind == "ink":
        m = mask("ink", p, W, H, seed=k * 31 + 7)
        out = _mix(old, new, m)
        edge = (4.0 * m * (1.0 - m))[:, :, None]                      # vien muc dam o mep loang
        return Image.fromarray(np.clip(np.asarray(out, np.float32) * (1.0 - 0.30 * edge) + 0.5, 0, 255).astype(np.uint8))
    if kind == "regions":
        T, base = regions(new)
        l0 = _mix(old, Image.new("RGB", (W, H), base), np.full((H, W), smooth(q / 0.10), np.float32)) if base is not None else old
        sw = 0.06
        m = np.clip((q * (1.0 + sw) - T) / sw, 0.0, 1.0)
        return _mix(l0, new, m)
    if kind == "tear":
        return _tear(q, old, new)
    if kind == "slide":
        return _slide(q, old, new)
    if kind == "iris":
        return _iris(q, old, new)
    if kind == "blinds":
        return _blinds(q, old, new)
    if kind == "scroll":
        return _scroll(q, old, new, put, ref)
    # --- cac kieu ve tren giay trang: pen / boy_pen / outline
    if kind == "boy_pen":                                             # cau be cam but quet TUNG HANG (co tron), net den dau anh hien den do; ra han ngoai khung moi doi chieu, khong nhun nhay
        qin, qa = 0.05, 0.92
        lead = Image.blend(old, Image.new("RGB", (W, H), paper_of(new)), smooth(q / qin))      # don sach giay truoc khi be vao
        s = clamp((q - qin) / (qa - qin))
        bsp = sprites.boy(max(24, int(ref * BOY_H)), "pen")
        pl = boy_plan(W, H, ref, max(bsp[0].size) if bsp is not None else None)
        out = _mix(lead, new, boy_mask(pl, s))
        if bsp is not None and 0.0 < s < 1.0:
            bx, by, face, u, _band = boy_at(pl, s)
            hop = abs(math.sin(math.pi * 4.0 * u)) * H * 0.004                    # buoc chan nhe theo nhip di (vai buoc moi hang), khong nay len
            put(out, bsp, bx, by - hop, face=face, vel=(float(face), 0.0))
        return out
    paper = Image.new("RGB", (W, H), paper_of(new))
    lead = Image.blend(old, paper, smooth(q / 0.06))                  # don sach giay truoc khi ve
    qin, qb = 0.06, 0.93                                               # don giay | ve | (tay) rut ra
    if kind == "pen":                                                 # VE TAY TUNG NET: tung goc anh mot (ve net muc -> to mau goc do, roi sang goc ke)
        if gm is not None:                                            # tranh co nho giua giay, le trang deu quanh (tay tu xoay de khong bi cat o mep man hinh)
            plan = pen_plan(gm["ns"])
            if plan is not None:
                return _pen_shrunk(q, lead, new, put, sprites.hand_pen(int(ref * PEN_HAND_H)), qin, qb, gm, plan)
        plan = pen_plan(new)
        if plan is not None:
            return _pen_frame(q, lead, new, put, sprites.hand_pen(int(ref * PEN_HAND_H)), qin, qb, plan)
    st = strokes(new, "tour" if kind == "pen" else "nn")                 # ve tay: thu tu theo dau di ngan nhat (tung goc anh); ve vien: thu tu cu
    f = stroke_fields(new, st)
    if kind == "outline":                                             # VE VIEN -> LEN MAU: ban tay ve het net vien truoc, roi to mau tung vung
        if f is None:                                                 # anh khong co net ro (nen phang): quet mau tu trai sang phai
            return _mix(lead, new, mask("wipe", smooth(clamp((q - qin) / (1.0 - qin))), W, H))
        return _outline_fill(q, lead, new, st, put, sprites.hand_pen(int(ref * HAND_H)), qin, qb)     # co ban tay cam but nhu 've tay'; ve het net vien roi to mau
    # kind == "pen": ban tay cam but ve TUNG NET theo duong net that; moi net but mang dung MAU that cua anh (net co mau thi co mau, net den thi den); ve het cac net la xong (khong quet them)
    hand = sprites.hand_pen(int(ref * HAND_H))                          # ban tay AI ve (None = chua co: van ve net, khong co tay)
    wob = (2 * math.sin(q * 90), 3 * math.sin(q * 61))
    if f is None:                                                     # anh khong co net: but quet tung dai mau that
        s = clamp((q - qin) / (qb - qin))
        out = _mix(lead, new, mask("sweep", s, W, H))
        if q < qb:
            x, y = sweep_pos(s, W, H, NB, lead=0.7)
            put(out, hand, x + wob[0], y + wob[1], away=(1.0 - smooth(q / qin), 0.28, -0.38))
            return out
        u = (q - qb) / (1.0 - qb)
        x, y = sweep_pos(1.0, W, H, NB, lead=0.7)
        if u < 1.0:
            put(out, hand, x + 2, y, away=(smooth(u), 0.25, -0.35))
        return out
    # Co net: but ve TUNG NET theo thu tu net that, ve het cac net la XONG (khong quet ngang man hinh them): moi net ve toi dau thi dai quanh net (va phan anh gan net do) hien dung mau that toi do
    cov, Tc = pen_field(new, f)
    s = clamp((q - qin) / (qb - qin))
    if q >= qb:                                                       # ve xong: da hien du anh hoan chinh, tay rut ra
        u = (q - qb) / (1.0 - qb)
        if u >= 1.0:
            return new.copy()
        out = new.copy()
        x, y = pen_at(st, 1.0)
        put(out, hand, x + wob[0], y + wob[1], away=(smooth(u), 0.28, -0.38))
        return out
    e = (0.8 * s + 0.2 * smooth(s)) * (1.0 + PEN_SPREAD + 0.012)       # tien do duong but (vuot 1 chut o cuoi de nhung vung xa net cung hien kip)
    vis = (cov > 0.5) & (e >= Tc)                                     # net ve SAC: cho nao but da qua thi hien du mau that, mep gon (khong mo / khong loang nhu khoi)
    m = np.asarray(Image.fromarray(vis.astype(np.uint8) * 255, "L").filter(ImageFilter.GaussianBlur(0.7)), np.float32) / 255.0
    out = _mix(lead, new, m)
    x, y = pen_at(st, min(1.0, e))
    put(out, hand, x + wob[0], y + wob[1], away=(1.0 - smooth(q / qin), 0.28, -0.38))     # tay tho vao tu ngoai khung (goc tren-phai) luc don giay
    return out


PEN_K = 2600                                    # 've tay': so diem net trung binh moi "khuc" ve (khuc = mot cum net ke nhau; ve net xong khuc nao thi to mau khuc do)
PEN_TR = 0.07                                   # ti le thoi gian moi khuc danh cho viec tay di chuyen sang khuc ke
_CL = {}


def _chunk_edges(st):
    """Chia duong but thanh cac KHUC lien tiep = tung GOC ANH (nhom net ve lien tiep, xem _cell_groups): tra ve moc thoi diem 0 = e0 < e1 < ... < eK = 1. Goc qua nho (it net) gop vao goc ke;
    thieu goc (anh it net / mot nhom duy nhat) thi chia deu theo so net."""
    pend = np.asarray(st.get("pend", []), np.float64)
    sb = np.asarray(st.get("sb", []), np.float64)
    pts = [0.0]
    for v in pend[:-1]:
        v = float(v)
        if v - pts[-1] >= 0.04 and v <= 0.96:
            pts.append(v)
    pts.append(1.0)
    if len(pts) < 5:                                                      # it goc qua: chia them cho moi khuc ve vua phai (khong ve het roi moi to mau ca anh)
        K = int(np.clip(round(st["M"] / float(PEN_K)), 5, 10))
        pts = [0.0]
        for i in range(1, K):
            t = i / float(K)
            c = float(sb[int(np.argmin(np.abs(sb - t)))]) if len(sb) else t
            if c - pts[-1] >= 0.3 / K and c <= 1.0 - 0.3 / K:
                pts.append(c)
        pts.append(1.0)
    return np.array(pts, np.float64)


def pen_plan(new):
    """KE HOACH 'VE TAY TUNG NET BUT': theo duong but that (tung vat / dong chu, tu tren xuong, trai sang phai) chia thanh cac KHUC; moi khuc tay ve net muc cua cac net trong khuc (thay ro tung net),
    roi TO MAU nhung vung vua ve (mep sac theo net vien), xong moi sang khuc ke. Mau chi hien o cho tay vua ve, khong chia khung. None neu anh khong co net. Nho theo anh."""
    k = ("pp",) + _key(new)
    r = _CL.get(k, False)
    if r is not False:
        return r
    with _klock("pp", k):
        r = _CL.get(k, False)
        if r is not False:
            return r
        r = _pen_plan(new)
        if len(_CL) > 2:
            _CL.clear()
        _CL[k] = r
        return r


def _pen_plan(new):
    st = strokes(new, "tour")
    if st is None or st.get("seed") is None:
        return None
    ce = _chunk_edges(st)
    nck = len(ce) - 1
    fp = fill_plan(new, st, None, ce)
    nf = fp["n"] if fp is not None else 0
    p1 = 1.0 if nf == 0 else float(np.clip(0.92 - 1.6 * fp["wfrac"], 0.5, 0.9))
    E = fp["E"] if nf else np.zeros(nck + 1)
    wi = np.diff(ce) * p1
    wf = np.diff(E) * (1.0 - p1) if nf else np.zeros(nck)
    w = (wi + wf) / (1.0 - PEN_TR)
    paper = tuple(paper_of(new))
    la = line_art(new)
    ink = Image.composite(new, Image.new("RGB", new.size, paper), Image.fromarray(np.clip(la * 255.0 + 0.5, 0, 255).astype(np.uint8), "L"))
    return dict(st=st, ce=ce, fp=fp, nf=nf, E=E, p1=p1, ink=ink, share=(wi / (1.0 - PEN_TR) + PEN_TR * w) / w,
                edges=np.concatenate([[0.0], np.cumsum(w) / w.sum()]))


def _chunk_fill_pos(fp, c, tau, p0):
    """Vi tri ngon but luc to mau cua khuc c o thoi diem to tau: tu cho but vua ve xong (p0) toi vung dau cua khuc, roi theo duong to cua tung vung."""
    ck = fp["ck"]
    i0, i1 = int(np.searchsorted(ck, c, "left")), int(np.searchsorted(ck, c, "right"))
    if i1 <= i0:
        return p0
    t = clamp(tau, float(fp["A"][i0]), float(fp["B"][i1 - 1]))
    i = int(np.clip(np.searchsorted(fp["A"], t, "right") - 1, i0, i1 - 1))
    P = fp["paths"][i]
    prev = p0 if i == i0 else fp["paths"][i - 1][-1]
    if t < fp["M"][i]:
        f = smooth((t - fp["A"][i]) / max(float(fp["M"][i] - fp["A"][i]), 1e-6))
        return float(prev[0] + (P[0][0] - prev[0]) * f), float(prev[1] + (P[0][1] - prev[1]) * f)
    z = clamp((t - fp["M"][i]) / max(float(fp["B"][i] - fp["M"][i]), 1e-6)) * (len(P) - 1)
    j = int(z)
    j2 = min(j + 1, len(P) - 1)
    f = z - j
    return float(P[j][0] + (P[j2][0] - P[j][0]) * f), float(P[j][1] + (P[j2][1] - P[j][1]) * f)


def _pen_end(plan):
    """Vi tri ngon but luc ve + to xong het."""
    st, fp, ce = plan["st"], plan["fp"], plan["ce"]
    pe = pen_at(st, 1.0)
    if not plan["nf"]:
        return pe
    last = int(plan["fp"]["ck"][-1])
    return _chunk_fill_pos(fp, last, 1.0, pe)


def _pen_frame(q, lead, new, put, hand, qin, qb, plan):
    """'Ve tay tung net but': tay ve net muc tung khuc (thay ro tung net), to mau cho cho vua ve, roi sang khuc ke; ve het la xong (khong quet them, khong chia khung)."""
    W, H = new.size
    st, fp, ce, E, ink = plan["st"], plan["fp"], plan["ce"], plan["E"], plan["ink"]
    wob = (2 * math.sin(q * 90), 3 * math.sin(q * 61))
    qe = qb - 0.04
    away_in = (1.0 - smooth(q / qin), 0.28, -0.38)
    if q >= qb:
        return new.copy()
    if q < qin:                                                       # don giay, tay tho vao tu ngoai khung
        out = lead.copy()
        x, y = pen_at(st, 0.0)
        put(out, hand, x + wob[0], y + wob[1], away=away_in)
        return out
    if q >= qe:                                                       # ve xong: tay rut ra
        u = smooth((q - qe) / (qb - qe))
        out = new.copy() if plan["nf"] else Image.blend(_mix(lead, ink, line_mask(st, 1.0)), new, u)
        x, y = _pen_end(plan)
        put(out, hand, x, y, away=(u, 0.28, -0.38))
        return out
    s = clamp((q - qin) / (qe - qin))
    edges, share = plan["edges"], plan["share"]
    nck = len(ce) - 1
    c = int(np.clip(np.searchsorted(edges, s, "right") - 1, 0, nck - 1))
    u = clamp((s - edges[c]) / max(1e-9, edges[c + 1] - edges[c]))
    tr = PEN_TR if c > 0 else 0.0
    ci = float(share[c])
    pe_c = pen_at(st, float(ce[c + 1]))
    if u < tr:                                                        # tay di tu cho vua to xong sang cho bat dau ve khuc nay
        s_ink, tau = float(ce[c]), float(E[c])
        a = _chunk_end_pos(plan, c - 1)
        b = pen_at(st, float(ce[c]))
        f = smooth(u / tr)
        pos = (a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f)
    elif u < ci:                                                      # ve net muc cua khuc
        s_ink = float(ce[c]) + float(ce[c + 1] - ce[c]) * (u - tr) / max(1e-9, ci - tr)
        tau = float(E[c])
        pos = pen_at(st, s_ink)
    else:                                                             # to mau nhung vung vua ve
        s_ink = float(ce[c + 1])
        tau = float(E[c]) + float(E[c + 1] - E[c]) * (u - ci) / max(1e-9, 1.0 - ci)
        pos = _chunk_fill_pos(fp, c, tau, pe_c) if plan["nf"] else pe_c
    out = _mix(lead, ink, line_mask(st, s_ink))
    if plan["nf"] and tau > 0.0:
        out = _mix(out, new, np.clip((tau + FILL_SW - fp["T"]) / FILL_SW, 0.0, 1.0) * (fp["T"] >= 0.0))
    put(out, hand, pos[0] + 0.5 * wob[0], pos[1] + 0.5 * wob[1], away=(0.0, 0.28, -0.38))
    return out


def _chunk_end_pos(plan, c):
    """Vi tri ngon but luc khuc c ve + to xong."""
    st, fp, ce = plan["st"], plan["fp"], plan["ce"]
    pe = pen_at(st, float(ce[c + 1]))
    return _chunk_fill_pos(fp, c, 1.0, pe) if plan["nf"] else pe


PEN_HAND_H = 0.32                               # 've tay': chieu cao ban tay (ti le chieu cao khung)
PEN_MARGIN = 0.03                               # 've tay': le trang quanh tranh luc ve, BANG NHAU ca 4 phia (ti le canh ngan cua khung; 540p ~ 16 px, 1080p ~ 32 px)
_PG = {}
_PH = {}


def _pen_geom(new, d):
    """'Ve tay': tranh duoc CO NHO CO DINH, can GIUA, chua le trang BANG NHAU (px) 4 phia (PEN_MARGIN) tren nen giay; ve xong van giu nguyen (khong phong to, khong zoom). Ban tay cam but khong nam trong le nay ma tu XOAY quanh ngon but
    de luon nam trong man hinh (xem _Sprites, fit=True). Tra ve dict(ns = tranh thu nho o khong gian chuan, off = vi tri (x, y) cua no trong khung, o khong gian chuan, s = ti le thu nho, pos = vi tri o khong gian xuat,
    ns_out = tranh thu nho o khong gian xuat) hoac None (chua co hinh tay thi khong thu nho, ve day khung nhu cu). Nho theo anh + huong."""
    W, H = new.size
    hand = sprites.hand_pen(int(H * PEN_HAND_H))
    k = ("pg", d, PEN_HAND_H, PEN_MARGIN, None if hand is None else (hand[0].size, hand[1])) + _key(new)       # hinh tay doi (nguoi dung thay hinh) -> tinh lai
    r = _PG.get(k, False)
    if r is not False:
        return r
    r = None
    if hand is not None:
        m_ = max(1, int(round(PEN_MARGIN * min(W, H))))                          # le BANG NHAU (px) o ca 4 phia; tranh gian ngang / doc khong qua ~3% (khong nhin thay)
        sw_, sh_ = max(8, W - 2 * m_), max(8, H - 2 * m_)
        ox, oy = m_, m_
        s = min(sw_ / float(W), sh_ / float(H))
        nsx = new.resize((sw_, sh_), Image.LANCZOS)
        if d == "lr":
            off = (ox, oy)
        elif d == "rl":
            off = (W - (ox + sw_), oy)
        elif d == "tb":
            off = (oy, ox)
        else:
            off = (H - (oy + sh_), ox)
        r = dict(ns=_fw(nsx, d), off=off, s=s, pos=(ox, oy), ns_out=nsx)
    if len(_PG) > 6:
        _PG.clear()
    _PG[k] = r
    return r


def pen_hold(new, d):
    """'Ve tay': khung HOAN CHINH sau khi ve xong = tranh co nho CO DINH (cung co + vi tri voi luc ve) nam tren nen giay; giu nguyen den het khung (khong phong to, khong zoom). None neu khong co thu nho
    (chua co hinh tay) -> dung chinh anh. Tra ve ban sao (an toan de ve phu de len)."""
    gm = _pen_geom(new, d)
    if gm is None:
        return None
    k = ("ph", d) + _key(new) + (gm["ns_out"].size, gm["pos"])
    r = _PH.get(k)
    if r is None:
        r = Image.new("RGB", new.size, tuple(paper_of(gm["ns_out"])))
        r.paste(gm["ns_out"], gm["pos"])
        if len(_PH) > 6:
            _PH.clear()
        _PH[k] = r
    return r.copy()


def _pen_shrunk(q, lead, new, put, hand, qin, qb, gm, plan):
    """'Ve tay' khi tranh duoc thu nho (xem _pen_geom): ve tren tranh nho nam tren giay; ve xong tay rut ra, tranh GIU NGUYEN co nho (co dinh, khong phong to / zoom)."""
    W, H = new.size
    ns, (ox, oy) = gm["ns"], gm["off"]
    nw, nh = ns.size
    st = plan["st"]
    paper = tuple(paper_of(ns))
    wob = (2 * math.sin(q * 90), 3 * math.sin(q * 61))
    canvas = Image.new("RGB", (W, H), paper)
    if q >= qb:                                                       # ve xong, tay da rut ra: tranh nho dung yen
        canvas.paste(ns, (ox, oy))
        return canvas
    if q < qin:                                                       # don giay, tay tho vao tu ngoai khung
        out = lead.copy()
        x, y = pen_at(st, 0.0)
        put(out, hand, ox + x + wob[0], oy + y + wob[1], away=(1.0 - smooth(q / qin), 0.28, -0.38), fit=True)
        return out

    def put2(o, sp, x, y, **kw):
        put(canvas, sp, ox + x, oy + y, fit=True, **kw)
    frame = _pen_frame(q, Image.new("RGB", (nw, nh), paper), ns, put2, hand, qin, qb, plan)
    canvas.paste(frame, (ox, oy))
    return canvas


def _outline_fill(q, lead, new, st, put, hand, qin, qb):
    """'Ve vien -> len mau': HAI GIAI DOAN. (1) Ve HET net vien theo thu tu net that (tung vat mot). (2) Roi TO MAU tung vung (mep sac, dung ngay net vien, khong loang). Anh khong co vung nao can to (den trang) thi ve het net la xong.
    hand = hinh ban tay (None = khong co tay, dung cho 'Ve vien -> len mau'); phan dau hai giai doan dung chung cho moi hinh nay."""
    W, H = new.size
    wob = (2 * math.sin(q * 90), 3 * math.sin(q * 61))
    fp = fill_plan(new, st)
    nf = fp["n"] if fp is not None else 0
    qe = qb - 0.04                                                    # ket thuc to mau; qe..qb: tay rut ra
    p1 = 1.0 if nf == 0 else float(np.clip(0.92 - 1.6 * fp["wfrac"], 0.5, 0.9))   # ti le thoi gian danh cho ve net: anh net den trang (it vung can to) thi gan het thoi gian la ve net; anh nhieu mau thi nua dau ve net, nua sau to mau
    q1 = qin + (qe - qin) * p1                                        # het net vien
    pe = pen_at(st, 1.0)
    away_in = (1.0 - smooth(q / qin), 0.28, -0.38)                    # tay tho vao tu ngoai khung (goc tren-phai) luc don giay
    if q >= qb:
        return new.copy()                                             # mau da lap day het; tay da rut ra
    if q < q1:                                                        # --- giai doan 1: ve net vien
        e = clamp((q - qin) / (q1 - qin))
        out = _mix(lead, pencil(new), line_mask(st, e))
        x, y = pen_at(st, e)
        put(out, hand, x + wob[0], y + wob[1], away=away_in)
        return out
    base = pencil(new)
    if nf and q < qe:                                                 # --- giai doan 2: to mau tung vung
        tau = (q - q1) / (qe - q1) * (1.0 + 2.0 * FILL_SW)
        out = _mix(base, new, np.clip((tau - fp["T"]) / FILL_SW, 0.0, 1.0))
        x, y = fill_pos(fp, tau, pe)
        put(out, hand, x + 0.4 * wob[0], y + 0.4 * wob[1], away=(0.0, 0.28, -0.38))
        return out
    u = smooth((q - qe) / (qb - qe))                                  # --- tay rut ra
    out = new.copy() if nf else Image.blend(base, new, u)             # (anh khong co vung can to: net chuyen dan sang anh that)
    x, y = fill_pos(fp, 1.0, pe) if nf else pe
    put(out, hand, x, y, away=(u, 0.28, -0.38))
    return out




def _scroll(q, old, new, put, ref):
    """Cau be keo cuon tranh tu trai sang phai: phia sau cuon la anh cu, phia truoc (ben trai) la tranh moi da mo."""
    W, H = new.size
    p = smooth(q)
    rh = int(ref * 0.94)
    roll = sprites.scroll_roll(rh)
    cx = roll[1][0] if roll is not None else 0
    x = -cx + (W + 2 * cx) * p                                        # tam cuon: tu ngoai trai -> ngoai phai
    m = np.zeros((H, W), np.float32)
    ex = int(max(0, min(W, x)))
    m[:, :ex] = 1.0
    out = _mix(old, new, m)
    if ex > 4:                                                         # bong cua cuon do len tranh vua mo
        a = np.asarray(out, np.float32)
        wd = min(ex, int(W * 0.05))
        g = np.linspace(0.0, 1.0, wd, dtype=np.float32)[None, :, None]
        a[:, ex - wd:ex] *= (1.0 - 0.28 * g)
        out = Image.fromarray(np.clip(a + 0.5, 0, 255).astype(np.uint8))
    put(out, roll, x, H * 0.03, shadow=False)
    put(out, sprites.boy(int(ref * SCROLL_BOY_H), "hold"), x - 2, H * 0.80 + 3 * math.sin(q * 50))
    return out
