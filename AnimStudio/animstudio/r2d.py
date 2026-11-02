# -*- coding: utf-8 -*-
"""Che do 2D: nhan vat 'cat giay' thanh manh, trang phuc theo thoi dai, anh sang vien (rim light)."""
import math
import numpy as np
from PIL import Image, ImageDraw, ImageFilter
from .common import clamp, h01
from . import art
from .art import PAL, WW, WH, shade, mixc

PPM = 300.0          # pixel / met cua the gioi 2D
FEET_Y = 1150.0
CX0 = 1600.0
INK = (34, 28, 36)


class Cv:
    """Khung ve: toa do met (y huong len, goc o ban chan) -> pixel sprite."""
    def __init__(self, S, W, H, ox, oy):
        self.S, self.o = S, max(1, int(S * 0.0065))
        self.im = Image.new("RGBA", (W, H), (0, 0, 0, 0))
        self.d = ImageDraw.Draw(self.im)
        self.ox, self.oy = ox, oy
        self.ink, self.wmul = None, 1.0

    def p(self, x, y=None):
        if y is None:
            x, y = x
        return (self.ox + x * self.S, self.oy - y * self.S)

    def poly(self, pts, col, halo=True):
        pp = [self.p(q) for q in pts]
        self.d.polygon(pp, fill=col + (255,), outline=((self.ink or shade(col, 0.55)) + (255,)) if halo else None, width=self.o)

    def ell(self, cx, cy, rx, ry, col, halo=True):
        x, y = self.p(cx, cy)
        rx, ry = rx * self.S, ry * self.S
        if halo:
            self.d.ellipse([x - rx - self.o, y - ry - self.o, x + rx + self.o, y + ry + self.o], fill=(self.ink or shade(col, 0.55)) + (255,))
        self.d.ellipse([x - rx, y - ry, x + rx, y + ry], fill=col + (255,))

    def chain(self, pts, widths, col, halo=True):
        """Chi/than thon dan: halo (vien toi) cua ca chuoi truoc, roi to mau."""
        for fill, e in (((self.ink or shade(col, 0.55)), self.o), (col, 0)) if halo else ((col, 0),):
            for i in range(len(pts) - 1):
                ax, ay = self.p(pts[i]); bx, by = self.p(pts[i + 1])
                r0, r1 = widths[i] * self.wmul * self.S / 2 + e, widths[i + 1] * self.wmul * self.S / 2 + e
                dx, dy = bx - ax, by - ay
                L = math.hypot(dx, dy) or 1
                nx, ny = -dy / L, dx / L
                self.d.polygon([(ax + nx * r0, ay + ny * r0), (bx + nx * r1, by + ny * r1), (bx - nx * r1, by - ny * r1), (ax - nx * r0, ay - ny * r0)], fill=fill + (255,))
                self.d.ellipse([ax - r0, ay - r0, ax + r0, ay + r0], fill=fill + (255,))
                self.d.ellipse([bx - r1, by - r1, bx + r1, by + r1], fill=fill + (255,))

    def line(self, pts, w, col):
        self.d.line([self.p(q) for q in pts], fill=col + (255,), width=max(1, int(w * self.S)), joint="curve")


def arm_pts(sh, ang, side, seg=(0.30, 0.27)):
    """Hai doan tay (truoc -> khuyu -> co tay) tu goc vai; ang=(nang truoc, dang ngang, gap khuyu) do."""
    fw, ab, el = ang
    t1 = math.radians(ab + 0.35 * fw)
    t2 = t1 - math.radians(el * 1.12)
    e = (sh[0] + side * math.sin(t1) * seg[0], sh[1] - math.cos(t1) * seg[0])
    w = (e[0] + side * math.sin(t2) * seg[1], e[1] - math.cos(t2) * seg[1])
    return [sh, e, w], t2


def draw_character(L, pose, S, k_light, tint, accent):
    """Ve nhan vat vao sprite RGBA (da khu rang cua), tra ve (anh, ox, oy) - goc ban chan trong anh."""
    age, fem = L["age"], L["gender"] == "f"
    era, role = L["era"], L["role"]
    k = {"child": 0.62, "old": 0.95}.get(age, 0.94 if fem else 1.0) * 0.80           # than nho kieu chibi
    hs = (1.2 if age == "child" else 1.0) * 3.5                                      # dau rat to
    W, H = int(2.5 * S), int(2.7 * S)
    cv = Cv(S, W, H, W / 2, H - 0.18 * S)
    cv.ink, cv.o, cv.wmul = (22, 18, 26), max(2, int(S * 0.0105)), 1.35
    skin, hair = mixc(L["skin"], (255, 255, 255), 0.4 if era == "ancient" else 0.93), L["hair"]
    top, bottom, shoes = L.get("top", (120, 120, 120)), L.get("bottom", (60, 60, 70)), L.get("shoes", (40, 40, 40))
    trim = L.get("trim", shade(top, 1.25))
    style = L.get("style", "casual")
    p = pose
    bob = p.bob
    hip_y = 0.68 * k
    sh_y = hip_y + 0.42 * k
    sh_x = (0.165 if fem else 0.205) * k * 1.4
    hip_x = (0.16 if fem else 0.15) * k * 1.3
    lean = p.lean * 0.18 + (0.05 if age == "old" else 0)
    sh_dx = lean
    shk = p.shake
    hy = sh_y + 0.045 * k + 0.115 * k * hs
    hx = sh_dx * 1.4 + p.tilt * 0.10 + shk
    hy += bob * 0.6
    # --------- phia sau ---------
    if L.get("gear") and style == "uniform":                                                   # ba lo
        cv.poly([(-0.17 * k + sh_dx, sh_y + 0.02), (0.17 * k + sh_dx, sh_y + 0.02), (0.15 * k, hip_y - 0.08), (-0.15 * k, hip_y - 0.08)], shade(top, 0.7))
    hair_back(cv, L, hx, hy, k, hs, hair, p)
    # --------- chan / vay ---------
    walk = math.sin(p.walk) if p.walk else 0.0
    long_robe = style in ("robe",)
    if long_robe:
        sway = 0.025 * walk
        cv.poly([(-hip_x * 1.0, hip_y + bob), (hip_x * 1.0, hip_y + bob), (0.30 * k + sway, 0.06 * k), (-0.30 * k + sway, 0.06 * k)], bottom if role == "commoner" and False else shade(top, 0.82))
        for sx in (-1, 1):
            f = 0.045 * k * (1 + (walk * sx))
            cv.chain([(sx * 0.12 * k, 0.07 * k), (sx * 0.13 * k, 0.03 * k)], [0.11 * k, 0.12 * k], shoes)
        cv.line([(0, hip_y - 0.05), (0.02 * k + sway * 0.5, 0.10 * k)], 0.004, shade(top, 0.62))
        cv.poly([(-0.30 * k + sway, 0.10 * k), (0.30 * k + sway, 0.10 * k), (0.30 * k + sway, 0.06 * k), (-0.30 * k + sway, 0.06 * k)], trim)
    else:
        for sx in (-1, 1):
            sw = walk * sx
            hipp = (sx * hip_x * 0.55, hip_y + bob)
            foot = (sx * 0.095 * k + sw * 0.16 * k, 0.045 * k + max(0.0, sw) * 0.07 * k)
            knee = ((hipp[0] + foot[0]) / 2 + sx * 0.012, (hipp[1] + foot[1]) / 2 + 0.01 + max(0.0, sw) * 0.04)
            if style == "dress" and not fem:
                pass
            cv.chain([hipp, knee, foot], [0.125 * k, 0.095 * k, 0.075 * k], bottom if style != "dress" else skin)
            fx, fy = foot
            cv.ell(fx + sx * 0.025 * k, fy - 0.03 * k, 0.07 * k, 0.034 * k, shoes)
        if style == "dress":
            cv.poly([(-hip_x * 0.9, hip_y + bob + 0.02), (hip_x * 0.9, hip_y + bob + 0.02), (0.27 * k + 0.02 * walk, 0.42 * k), (-0.27 * k + 0.02 * walk, 0.42 * k)], shade(top, 0.9))
            cv.poly([(-0.27 * k + 0.02 * walk, 0.44 * k), (0.27 * k + 0.02 * walk, 0.44 * k), (0.27 * k + 0.02 * walk, 0.40 * k), (-0.27 * k + 0.02 * walk, 0.40 * k)], trim if era != "modern" else shade(top, 0.7))
    # --------- than ---------
    tl, tr = -sh_x + sh_dx, sh_x + sh_dx
    wst = (0.135 if fem else 0.15) * k * 1.35
    body = [(tl, sh_y + bob), (tr, sh_y + bob), (wst + sh_dx * 0.4, hip_y + bob + 0.04 * k), (-wst + sh_dx * 0.4, hip_y + bob + 0.04 * k)]
    if fem:
        body = [(tl, sh_y + bob), (tr, sh_y + bob), (wst * 0.85 + sh_dx * 0.5, hip_y + 0.2 * k + bob), (hip_x + sh_dx * 0.3, hip_y + bob + 0.03 * k), (-hip_x + sh_dx * 0.3, hip_y + bob + 0.03 * k), (-wst * 0.85 + sh_dx * 0.5, hip_y + 0.2 * k + bob)]
    if long_robe:
        body = [(tl, sh_y + bob), (tr, sh_y + bob), (wst + 0.02, hip_y + bob), (-wst - 0.02, hip_y + bob)]
        cv.poly(body, top)
        cv.poly([(tl, sh_y + bob), (tl * 0.15 + 0.0, sh_y + bob), (0.0 + sh_dx * 0.4, hip_y + 0.02 + bob), (-wst - 0.02, hip_y + bob)], shade(top, 0.9), halo=False)
        # co ao cheo (giao linh) + dai lung
        cv.line([(-0.07 * k + sh_dx, sh_y + bob + 0.01), (0.10 * k + sh_dx * 0.5, hip_y + 0.15 * k + bob)], 0.026 * k, trim)
        cv.poly([(-wst - 0.025, hip_y + bob + 0.06 * k), (wst + 0.025, hip_y + bob + 0.06 * k), (wst + 0.025, hip_y + bob - 0.01 * k), (-wst - 0.025, hip_y + bob - 0.01 * k)], shade(trim, 0.9) if role != "commoner" else (130, 60, 50))
        if role in ("royal", "noble", "officer"):
            cv.ell(0, hip_y + 0.02 * k + bob, 0.04 * k, 0.04 * k, trim)
            cv.poly([(tl, sh_y + bob), (tl + 0.03, sh_y + bob), (-0.02, hip_y + bob), (-0.05, hip_y + bob)], trim, halo=False)
            cv.poly([(tr, sh_y + bob), (tr - 0.03, sh_y + bob), (0.02, hip_y + bob), (0.05, hip_y + bob)], trim, halo=False)
    elif style == "fur":
        cv.poly(body, skin)
        if L.get("fur_cape"):
            cv.poly([(tl - 0.1 * k, sh_y + bob + 0.02), (tr + 0.1 * k, sh_y + bob + 0.02), (tr + 0.13 * k, sh_y - 0.3 * k + bob), (0.06 * k, sh_y - 0.36 * k + bob), (-0.06 * k, sh_y - 0.3 * k + bob), (tl - 0.13 * k, sh_y - 0.34 * k + bob)], shade(top, 0.78))
        cv.poly([(tl, sh_y + bob), (tl + 0.13 * k, sh_y + bob), (wst + 0.012, hip_y + 0.34 * k + bob), (-wst - 0.012, hip_y + 0.34 * k + bob)], top)
        cv.poly([(-hip_x * 1.05, hip_y + 0.36 * k + bob), (hip_x * 1.05, hip_y + 0.36 * k + bob), (0.27 * k + 0.02 * walk, 0.52 * k), (-0.27 * k + 0.02 * walk, 0.52 * k)], top)
        hem = [(0.27 * k + 0.02 * walk - i * 0.0675 * k, 0.52 * k - (0.055 * k if i % 2 else 0)) for i in range(9)]
        cv.poly([(0.27 * k, 0.52 * k)] + hem[1:] + [(-0.27 * k, 0.52 * k)], top, halo=False)
        cv.line([(-hip_x * 1.05, hip_y + 0.1 * k + bob), (hip_x * 1.05, hip_y + 0.1 * k + bob)], 0.016 * k, (70, 46, 30))
        if L.get("spots"):
            for (sx_, sy_, r_) in ((-0.08, 0.18, 0.03), (0.05, 0.1, 0.025), (0.0, 0.3, 0.03), (-0.12, 0.42, 0.028), (0.12, 0.4, 0.03), (0.0, 0.62, 0.03), (0.15, 0.64, 0.025)):
                cv.ell(sx_ * k, hip_y + (sy_ - 0.0) * k * 1.0 - 0.0 + bob - 0.1 * k, r_ * k, r_ * 0.8 * k, shade(top, 0.55), halo=False)
        if L.get("fur_cape"):
            cv.ell(sh_dx, sh_y - 0.01 + bob, sh_x * 1.55, 0.085 * k, trim)
        for i in range(9):                                       # chuoi vong xuong
            a_ = math.pi * (0.1 + 0.8 * i / 8)
            cv.ell(sh_dx + math.cos(a_) * 0.1 * k, sh_y - 0.03 + bob - math.sin(a_) * 0.075 * k, 0.014 * k, 0.019 * k, (240, 232, 214) if i != 4 else (200, 70, 50), halo=False)
        wp = L.get("weapon")
        if wp == "spear":
            cv.line([(-0.46 * k, 0.0), (-0.46 * k, 2.0 * k)], 0.018 * k, (120, 86, 56))
            cv.poly([(-0.46 * k - 0.04 * k, 1.98 * k), (-0.46 * k + 0.04 * k, 1.98 * k), (-0.46 * k, 2.16 * k)], (150, 150, 156))
        elif wp == "club":
            cv.line([(0.46 * k, 0.0), (0.5 * k, 1.5 * k)], 0.04 * k, (110, 80, 52))
            cv.ell(0.5 * k, 1.56 * k, 0.07 * k, 0.1 * k, (96, 70, 46))
        elif wp == "staff":
            cv.line([(0.46 * k, 0.0), (0.46 * k, 1.9 * k)], 0.022 * k, (96, 70, 46))
            cv.ell(0.46 * k, 1.96 * k, 0.05 * k, 0.06 * k, (240, 232, 214))
            for j, c_ in enumerate(((210, 60, 50), (60, 150, 200))):
                cv.ell(0.46 * k + (j - 0.5) * 0.06 * k, 1.78 * k, 0.012 * k, 0.05 * k, c_, halo=False)
    else:
        cv.poly(body, top)
        if era == "modern" and L.get("scarf"):
            cv.ell(sh_dx, sh_y + 0.02, 0.15 * k, 0.045 * k, accent)
        if style == "uniform":
            cv.poly([(-0.16 * k + sh_dx, hip_y + 0.05 + bob), (0.16 * k + sh_dx, hip_y + 0.05 + bob), (0.16 * k + sh_dx, hip_y + 0.12 + bob), (-0.16 * k + sh_dx, hip_y + 0.12 + bob)], (62, 44, 30))   # that lung
            cv.ell(0.0 + sh_dx * 0.5, hip_y + 0.085 + bob, 0.025 * k, 0.03 * k, (220, 190, 80))
            cv.line([(sh_dx * 0.7, sh_y + bob - 0.02), (sh_dx * 0.4, hip_y + 0.1 + bob)], 0.01, shade(top, 0.62))
            for q in (-1, 1):
                cv.poly([(q * 0.08 * k + sh_dx * 0.6, sh_y - 0.14 + bob), (q * 0.14 * k + sh_dx * 0.6, sh_y - 0.14 + bob), (q * 0.14 * k + sh_dx * 0.6, sh_y - 0.22 + bob), (q * 0.08 * k + sh_dx * 0.6, sh_y - 0.22 + bob)], shade(top, 1.18), halo=False)
            if role == "officer":
                cv.ell(-0.09 * k, sh_y - 0.17, 0.018 * k, 0.018 * k, (240, 200, 70)); cv.ell(-0.05 * k, sh_y - 0.17, 0.018 * k, 0.018 * k, (210, 60, 50))
        if style == "tunic":
            cv.poly([(tl, sh_y + bob), (tr, sh_y + bob), (wst + 0.03, hip_y + bob - 0.15), (-wst - 0.03, hip_y + bob - 0.15)], shade(top, 0.92), halo=False)
        if style == "casual" and era == "modern" and h01(L["seed"], "stripe") > 0.65:
            for yy in (0.1, 0.22, 0.34):
                cv.line([(tl * 0.9 + 0.0, sh_y - yy * k), (tr * 0.9, sh_y - yy * k)], 0.018 * k, shade(top, 1.25))
    if L.get("gear") and style == "uniform":                                                    # sung deo cheo
        cv.line([(-0.26 * k, sh_y - 0.30 * k), (0.28 * k, hip_y - 0.35 * k)], 0.028 * k, (50, 38, 28))
        cv.line([(-0.30 * k, sh_y - 0.34 * k), (-0.22 * k, sh_y - 0.26 * k)], 0.04 * k, (50, 38, 28))
    # --------- co + dau ---------
    cv.chain([(sh_dx * 0.9, sh_y + 0.02 + bob), (hx * 0.8, sh_y + 0.075 * k + bob)], [0.08 * k, 0.075 * k], shade(skin, 0.9))
    if long_robe or style == "uniform" or era == "modern":
        cv.poly([(-0.07 * k + sh_dx, sh_y + bob + 0.03), (0.07 * k + sh_dx, sh_y + bob + 0.03), (sh_dx, sh_y + bob - 0.07)], shade(top, 1.2) if not long_robe else trim, halo=False)
    # --------- tay ---------
    for side, ang in ((1, p.r_arm), (-1, p.l_arm)):
        shp = (side * sh_x * 0.92 + sh_dx, sh_y - 0.03 + bob)
        pts, t2 = arm_pts(shp, ang, side, (0.23 * k, 0.21 * k))
        if long_robe:
            w0 = 0.085 * k
            cv.chain(pts, [w0, 0.11 * k, 0.17 * k], shade(top, 1.0))
            cv.chain([pts[2], (pts[2][0] + side * math.sin(t2) * 0.03, pts[2][1] - math.cos(t2) * 0.03)], [0.17 * k, 0.17 * k], trim)
            hp = (pts[2][0] + side * math.sin(t2) * 0.08, pts[2][1] - math.cos(t2) * 0.08)
        else:
            sl = skin if style == "fur" else top
            sleeve_w = [0.095 * k, 0.082 * k, 0.07 * k]
            cv.chain(pts, sleeve_w, sl)
            hp = (pts[2][0] + side * math.sin(t2) * 0.06, pts[2][1] - math.cos(t2) * 0.06)
            if style in ("dress",) or era == "modern" and L.get("style") == "casual" and h01(L["seed"], "sleeve") > 0.5:
                # tay ngan: phan cang tay lo da
                mid = ((pts[1][0] + pts[2][0]) / 2, (pts[1][1] + pts[2][1]) / 2)
                cv.chain([mid, pts[2]], [0.068 * k, 0.062 * k], skin)
        cv.ell(hp[0], hp[1], 0.072 * k, 0.074 * k, (252, 250, 246))
    # --------- sung truong ---------
    # (ve truoc dau)
    # --------- dau ---------
    face(cv, L, p, hx, hy, k, hs, skin, hair)
    hair_front(cv, L, hx, hy, k, hs, hair, p)
    hat(cv, L, hx, hy, k, hs, p)
    # --------- anh sang ---------
    return finish(cv, S, tint, accent, k_light)


def face(cv, L, p, hx, hy, k, hs, skin, hair):
    rx, ry = 0.114 * k * hs, 0.118 * k * hs
    cv.ell(hx - rx * 0.98, hy - 0.005 * k, 0.018 * k * hs, 0.028 * k * hs, shade(skin, 0.95))
    cv.ell(hx + rx * 0.98, hy - 0.005 * k, 0.018 * k * hs, 0.028 * k * hs, shade(skin, 0.95))
    cv.ell(hx, hy, rx, ry, skin)
    cv.ell(hx, hy - ry * 0.55, rx * 0.86, ry * 0.5, skin, halo=False)    # ham nhon nhe
    gx = p.gaze * 0.022 * k * hs
    fx = hx + gx
    ey = hy - 0.004 * k * hs + p.gaze_y * 0.012 * k
    ex = 0.052 * k * hs
    eo = clamp(p.eye * (1 - p.blink * 0.92), 0.04, 1.5)
    ink = (28, 24, 34)
    for sx in (-1, 1):
        x = fx + sx * ex
        if p.smile > 0.6 and p.blink < 0.5 and p.round < 0.3:         # mat cuoi ^^
            pts_ = [(x + (i / 6 - 0.5) * 0.06 * k * hs, ey + 0.012 * k * hs * (1 - (i / 3 - 1) ** 2)) for i in range(7)]
            cv.line(pts_, 0.0085 * k * hs, ink)
        elif p.round > 0.3:                                           # mat tron (so hai/ngac nhien)
            cv.ell(x, ey, 0.027 * k * hs, 0.032 * k * hs * eo, (250, 250, 250), halo=True)
            cv.ell(x + p.gaze * 0.006 * k, ey, 0.011 * k * hs, 0.013 * k * hs, ink, halo=False)
        else:
            w, h = 0.024 * k * hs, 0.05 * k * hs * eo
            cv.ell(x, ey, w, h, ink, halo=False)
        # long may
        b = hair if L["age"] != "old" else (160, 160, 168)
        yb = ey + 0.052 * k * hs + p.brow_h * 0.022 * k + p.brow * 0.0
        yi = yb - 0.016 * k * p.brow
        yo = yb + 0.008 * k * p.brow
        bx0, bx1 = fx + sx * 0.02 * k * hs, fx + sx * 0.075 * k * hs
        pts = [(bx0, yi + 0.006 * k), (bx1, yo + 0.006 * k), (bx1, yo - 0.002 * k), (bx0, yi - 0.004 * k)]
        cv.poly(pts, shade(b, 0.82) if sum(b) > 120 else b, halo=False)
    # mui
    # ma
    if True:
        for sx in (-1, 1):
            cv.ell(fx + sx * 0.082 * k * hs, ey - 0.032 * k * hs, 0.022 * k * hs, 0.013 * k * hs, mixc(skin, (240, 120, 120), 0.45), halo=False)
    # mieng
    my = hy - 0.068 * k * hs
    sm = p.smile if p.smile < -0.1 else max(p.smile, 0.5)
    mw = 0.04 * k * hs * (1.0 + 0.6 * sm) * clamp(p.mouth_w, 0.6, 1.5)
    a = p.amp
    if a > 0.06 or p.round > 0.6:
        oh = (0.006 + 0.036 * a + 0.014 * p.round) * k * hs
        cv.ell(fx, my, mw * (0.75 if p.round > 0.6 else 0.9), oh, (84, 28, 40), halo=False)
        if oh > 0.016 * k:
            cv.ell(fx, my - oh * 0.42, mw * 0.5, oh * 0.4, (226, 110, 120), halo=False)
        if oh > 0.012 * k and p.round < 0.6:
            cv.poly([(fx - mw * 0.75, my + oh * 0.55), (fx + mw * 0.75, my + oh * 0.55), (fx + mw * 0.6, my + oh * 0.12), (fx - mw * 0.6, my + oh * 0.12)], (246, 244, 240), halo=False)
    elif sm > 0.25:                                          # cuoi toe hinh chu D (kieu sticker)
        n_ = 12
        top_ = [(fx + (i / n_ * 2 - 1) * mw, my + 0.004 * k * hs) for i in range(n_ + 1)]
        bot_ = [(fx + (1 - i / n_ * 2) * mw, my + 0.004 * k * hs - 0.05 * k * hs * (1 - (1 - i / n_ * 2) ** 2) * (0.55 + 0.45 * sm)) for i in range(n_ + 1)]
        cv.poly(top_ + bot_, (92, 30, 44))
        cv.ell(fx, my - 0.026 * k * hs * (0.55 + 0.45 * sm), mw * 0.5, 0.012 * k * hs, (232, 110, 124), halo=False)
    else:
        pts = [(fx + (i / 5 - 1) * mw, my + 0.016 * k * hs * p.smile * (i / 5 - 1) ** 2 - 0.004 * k * hs * p.smile) for i in range(11)]
        cv.line(pts, 0.0065 * k * hs, (140, 56, 66))


def hair_back(cv, L, hx, hy, k, hs, hair, p):
    st = L.get("hair_style", "short")
    rx, ry = 0.114 * k * hs, 0.118 * k * hs
    if st in ("long",):
        cv.poly([(hx - rx * 1.15, hy + 0.02), (hx + rx * 1.15, hy + 0.02), (hx + rx * 1.3, hy - 0.42 * k), (hx - rx * 1.3, hy - 0.42 * k)], hair)
        cv.ell(hx, hy + 0.02, rx * 1.18, ry * 1.12, hair)
    elif st == "bob":
        cv.poly([(hx - rx * 1.15, hy + 0.02), (hx + rx * 1.15, hy + 0.02), (hx + rx * 1.2, hy - 0.16 * k), (hx - rx * 1.2, hy - 0.16 * k)], hair)
        cv.ell(hx, hy + 0.02, rx * 1.18, ry * 1.1, hair)
    elif st == "pig":
        for s in (-1, 1):
            cv.chain([(hx + s * rx * 1.1, hy - 0.04), (hx + s * rx * 1.7, hy - 0.2 * k)], [0.05 * k, 0.07 * k], hair)
    elif st == "wild":
        pts = [(hx - rx * 1.55, hy - ry * 0.7), (hx - rx * 1.7, hy + ry * 0.2), (hx - rx * 1.3, hy + ry * 0.9), (hx - rx * 0.9, hy + ry * 1.5), (hx - rx * 0.3, hy + ry * 1.25), (hx + rx * 0.3, hy + ry * 1.6),
               (hx + rx * 0.9, hy + ry * 1.4), (hx + rx * 1.35, hy + ry * 0.9), (hx + rx * 1.7, hy + ry * 0.1), (hx + rx * 1.5, hy - ry * 0.8), (hx + rx * 0.9, hy - ry * 1.0), (hx - rx * 0.9, hy - ry * 1.0)]
        cv.poly(pts, hair)
    elif st == "braids":
        cv.poly([(hx - rx * 1.2, hy + 0.02), (hx + rx * 1.2, hy + 0.02), (hx + rx * 1.35, hy - 0.45 * k), (hx - rx * 1.35, hy - 0.45 * k)], hair)
        cv.ell(hx, hy + 0.02, rx * 1.2, ry * 1.12, hair)
    elif st in ("bun", "bun_pin"):
        cv.ell(hx, hy + ry * 1.0, 0.07 * k * hs, 0.06 * k * hs, hair)
    elif st == "ponytail":
        cv.chain([(hx + rx, hy), (hx + rx * 1.8, hy - 0.2)], [0.05, 0.04], hair)
    if st in ("long", "bob", "bun_pin", "bun") and L["era"] == "imperial" and st != "bob":
        cv.poly([(hx - rx * 1.15, hy + 0.02), (hx + rx * 1.15, hy + 0.02), (hx + rx * 1.35, hy - 0.5 * k), (hx - rx * 1.35, hy - 0.5 * k)], hair) if st == "long" else None


def hair_front(cv, L, hx, hy, k, hs, hair, p):
    st = L.get("hair_style", "short")
    rx, ry = 0.114 * k * hs, 0.118 * k * hs
    if st == "bald":
        for s in (-1, 1):
            cv.ell(hx + s * rx * 0.98, hy + 0.02 * k, 0.018 * k, 0.05 * k, hair, halo=False)
        return
    top_y = hy + ry
    cap = [(hx - rx * 1.06, hy + ry * 0.12)]
    for i in range(0, 13):
        a = math.pi - math.pi * i / 12
        cap.append((hx + math.cos(a) * rx * 1.08, hy + ry * 0.12 + math.sin(a) * ry * 1.0))
    cap.append((hx + rx * 1.06, hy + ry * 0.12))
    # tran toc (phan tren)
    fr = [(hx + rx * 1.06, hy + ry * 0.1), (hx + rx * 0.55, hy + ry * 0.62), (hx + rx * 0.05 + p.gaze * 0.01, hy + ry * 0.5),
          (hx - rx * 0.5, hy + ry * 0.64), (hx - rx * 1.06, hy + ry * 0.1)]
    fr = [(x, hy + ry * 0.1 + (y - hy - ry * 0.1) * 1.45) for (x, y) in fr]
    if st in ("spiky", "wild"):
        fr = [(hx + rx * 1.06, hy + ry * 0.1), (hx + rx * 0.7, hy + ry * 0.45), (hx + rx * 0.4, hy + ry * 0.3), (hx + rx * 0.1, hy + ry * 0.55), (hx - rx * 0.25, hy + ry * 0.32), (hx - rx * 0.6, hy + ry * 0.5), (hx - rx * 1.06, hy + ry * 0.1)]
    if st in ("topknot", "tufts") and L["era"] == "imperial":
        fr = [(hx + rx * 1.06, hy + ry * 0.1), (hx + rx * 0.8, hy + ry * 0.8), (hx - rx * 0.8, hy + ry * 0.8), (hx - rx * 1.06, hy + ry * 0.1)]
    cv.poly(cap[:0] + [(hx + math.cos(math.pi * i / 12) * rx * 1.08, hy + ry * 0.12 + math.sin(math.pi * i / 12) * ry * 1.0) for i in range(13)] + [(x, y) for (x, y) in fr[::-1][:0]], hair)
    cv.poly(fr, hair, halo=False)
    cv.poly([(hx - rx * 1.06, hy + ry * 0.1), (hx - rx * 0.93, hy - ry * 0.35), (hx - rx * 0.98, hy + ry * 0.1)], hair, halo=False)
    cv.poly([(hx + rx * 1.06, hy + ry * 0.1), (hx + rx * 0.93, hy - ry * 0.35), (hx + rx * 0.98, hy + ry * 0.1)], hair, halo=False)
    if st == "braids":
        for sd_ in (-1, 1):
            cv.chain([(hx + sd_ * rx * 1.05, hy - 0.04 * k), (hx + sd_ * rx * 1.35, hy - 0.25 * k), (hx + sd_ * rx * 1.25, hy - 0.5 * k)], [0.05 * k, 0.045 * k, 0.035 * k], hair)
            cv.ell(hx + sd_ * rx * 1.25, hy - 0.52 * k, 0.02 * k, 0.025 * k, (240, 232, 214), halo=False)
    if st == "topknot":
        cv.ell(hx, top_y + 0.045 * k, 0.045 * k, 0.05 * k, hair)
        cv.line([(hx - 0.07 * k, top_y + 0.05 * k), (hx + 0.07 * k, top_y + 0.05 * k)], 0.012 * k, (210, 170, 70))
    elif st == "bun_pin":
        cv.ell(hx, top_y + 0.05 * k, 0.062 * k, 0.05 * k, hair)
        cv.line([(hx - 0.1 * k, top_y + 0.06 * k), (hx + 0.1 * k, top_y + 0.08 * k)], 0.008 * k, (230, 190, 80))
        cv.ell(hx + 0.1 * k, top_y + 0.08 * k, 0.014 * k, 0.014 * k, (214, 60, 60), halo=False)
    elif st == "bun":
        cv.ell(hx, top_y + 0.03 * k, 0.055 * k, 0.045 * k, hair)
    elif st == "tufts":
        for s in (-1, 1):
            cv.ell(hx + s * rx * 0.8, top_y - 0.01, 0.04 * k * hs, 0.04 * k * hs, hair)
    if L.get("glasses"):
        for s in (-1, 1):
            x, y = hx + s * 0.047 * k * hs + p.gaze * 0.022 * k * hs, hy - 0.006 * k * hs
            cv.d.ellipse([cv.p(x, y)[0] - 0.036 * cv.S * k * hs, cv.p(x, y)[1] - 0.036 * cv.S * k * hs, cv.p(x, y)[0] + 0.036 * cv.S * k * hs, cv.p(x, y)[1] + 0.036 * cv.S * k * hs], outline=(30, 30, 40, 255), width=max(2, int(0.006 * cv.S)))
        cv.line([(hx - 0.011 * k + p.gaze * 0.022 * k, hy), (hx + 0.011 * k + p.gaze * 0.022 * k, hy)], 0.006 * k, (30, 30, 40))
    if L.get("beard") and L["era"] != "modern":
        old = L["age"] == "old"
        bc = (232, 232, 238) if old else shade(L["hair"], 1.0)
        ln_ = (0.30 if old else 0.2) * k
        yt = hy - ry * 0.80
        cv.poly([(hx - rx * 0.9, hy - ry * 0.3), (hx - rx * 0.78, yt), (hx + rx * 0.78, yt), (hx + rx * 0.9, hy - ry * 0.3),
                 (hx + rx * 0.5, hy - ry - ln_ * 0.6), (hx, hy - ry - ln_), (hx - rx * 0.5, hy - ry - ln_ * 0.6)], bc)
        my = hy - 0.068 * k * hs
        cv.poly([(hx - 0.06 * k, my + 0.026 * k), (hx + 0.06 * k, my + 0.026 * k), (hx + 0.03 * k, my + 0.012 * k), (hx - 0.03 * k, my + 0.012 * k)], bc, halo=False)
        if p.amp > 0.06:
            cv.ell(hx + p.gaze * 0.022 * k * hs, my, 0.026 * k, (0.006 + 0.034 * p.amp) * k, (84, 28, 40), halo=False)


def hat(cv, L, hx, hy, k, hs, p):
    h = L.get("hat", "")
    rx, ry = 0.114 * k * hs, 0.118 * k * hs
    ty = hy + ry
    if h == "helmet":
        c = L["top"]; c = shade(c, 1.05)
        cv.poly([(hx - rx * 1.3, hy + ry * 0.38)] + [(hx + math.cos(math.pi - math.pi * i / 14) * rx * 1.28, hy + ry * 0.38 + math.sin(math.pi * i / 14) * ry * 1.05) for i in range(15)] + [(hx + rx * 1.3, hy + ry * 0.38)], c)
        cv.poly([(hx - rx * 1.5, hy + ry * 0.4), (hx + rx * 1.5, hy + ry * 0.4), (hx + rx * 1.3, hy + ry * 0.26), (hx - rx * 1.3, hy + ry * 0.26)], shade(c, 0.8))
        cv.ell(hx, hy + ry * 0.78, 0.018 * k, 0.018 * k, (220, 70, 60), halo=False)
    elif h == "cap":
        c = L["top"]
        cv.poly([(hx - rx * 1.2, hy + ry * 0.38), (hx + rx * 1.2, hy + ry * 0.38), (hx + rx * 1.1, hy + ry * 0.95), (hx, hy + ry * 1.05), (hx - rx * 1.1, hy + ry * 0.95)], c)
        cv.poly([(hx - rx * 1.25, hy + ry * 0.4), (hx + rx * 1.25, hy + ry * 0.4), (hx + rx * 1.35, hy + ry * 0.26), (hx - rx * 1.35, hy + ry * 0.26)], (40, 30, 24))
        cv.ell(hx, hy + ry * 0.62, 0.02 * k, 0.02 * k, (230, 190, 70), halo=False)
    elif h == "flatcap":
        cv.poly([(hx - rx * 1.15, hy + ry * 0.35), (hx + rx * 1.15, hy + ry * 0.35), (hx + rx * 0.9, hy + ry * 0.85), (hx - rx * 0.9, hy + ry * 0.85)], (86, 78, 70))
    elif h == "scarfhead":
        c = (150, 90, 84)
        cv.poly([(hx - rx * 1.12, hy - ry * 0.2), (hx + rx * 1.12, hy - ry * 0.2), (hx + rx * 1.1, hy + ry * 0.55), (hx, hy + ry * 1.12), (hx - rx * 1.1, hy + ry * 0.55)], c)
        cv.poly([(hx - rx * 0.7, hy + ry * 0.22), (hx + rx * 0.7, hy + ry * 0.22), (hx + rx * 0.4, hy + ry * 0.06), (hx - rx * 0.4, hy + ry * 0.06)], c, halo=False)
    elif h == "skull":                                              # mu so thu cua thu linh
        b = (238, 230, 212)
        cv.poly([(hx - rx * 1.25, hy + ry * 0.2), (hx + rx * 1.25, hy + ry * 0.2), (hx + rx * 1.2, hy + ry * 0.95), (hx + rx * 0.4, hy + ry * 1.3), (hx - rx * 0.4, hy + ry * 1.3), (hx - rx * 1.2, hy + ry * 0.95)], b)
        for sd_ in (-1, 1):
            cv.chain([(hx + sd_ * rx * 1.2, hy + ry * 0.85), (hx + sd_ * rx * 1.9, hy + ry * 1.3), (hx + sd_ * rx * 1.7, hy + ry * 2.1)], [0.05 * k, 0.04 * k, 0.012 * k], b)
            cv.ell(hx + sd_ * rx * 0.55, hy + ry * 0.62, 0.02 * k, 0.026 * k, (40, 30, 30), halo=False)
    elif h == "feather":
        cv.line([(hx - rx * 1.1, hy + ry * 0.45), (hx + rx * 1.1, hy + ry * 0.45)], 0.03 * k, (150, 60, 50))
        for j, c_ in enumerate(((214, 60, 50), (240, 190, 60), (70, 150, 200), (214, 60, 50), (240, 190, 60))):
            a_ = (j - 2) * 0.28
            cv.chain([(hx + math.sin(a_) * rx * 0.5, hy + ry * 0.55), (hx + math.sin(a_) * rx * 1.9, hy + ry * 0.55 + math.cos(a_) * ry * 1.7)], [0.026 * k, 0.05 * k], c_)
    elif h == "headband":
        cv.line([(hx - rx * 1.08, hy + ry * 0.42), (hx + rx * 1.08, hy + ry * 0.42)], 0.026 * k, (150, 60, 50))
        cv.chain([(hx + rx * 0.9, hy + ry * 0.5), (hx + rx * 1.5, hy + ry * 1.5)], [0.02 * k, 0.045 * k], (240, 190, 60))
    elif h == "nonla":
        c = (214, 190, 120)
        cv.poly([(hx, ty + 0.17 * k), (hx - 0.31 * k, hy + ry * 0.28), (hx + 0.31 * k, hy + ry * 0.28)], c)
        for i in range(1, 5):
            yy = hy + ry * 0.28 + (ty + 0.17 * k - hy - ry * 0.28) * i / 5
            ww = 0.31 * k * (1 - i / 5)
            cv.line([(hx - ww, yy), (hx + ww, yy)], 0.004 * k, shade(c, 0.78))
        cv.line([(hx - 0.1 * k, hy + ry * 0.2), (hx - 0.07 * k, hy - ry * 0.7)], 0.006 * k, (150, 40, 40))
        cv.line([(hx + 0.1 * k, hy + ry * 0.2), (hx + 0.07 * k, hy - ry * 0.7)], 0.006 * k, (150, 40, 40))
    elif h == "official":                                         # mu quan: canh chuon
        c = (24, 22, 30)
        cv.poly([(hx - rx * 1.05, hy + ry * 0.2), (hx + rx * 1.05, hy + ry * 0.2), (hx + rx * 0.95, hy + ry * 1.55), (hx - rx * 0.95, hy + ry * 1.55)], c)
        for s in (-1, 1):
            cv.poly([(hx + s * rx * 0.9, hy + ry * 1.0), (hx + s * rx * 3.0, hy + ry * 1.1), (hx + s * rx * 3.0, hy + ry * 0.85), (hx + s * rx * 0.9, hy + ry * 0.8)], c)
        cv.line([(hx - rx, hy + ry * 0.35), (hx + rx, hy + ry * 0.35)], 0.014 * k, (222, 184, 90))
    elif h == "crown":
        g = (232, 190, 72)
        cv.poly([(hx - rx * 1.05, hy + ry * 0.35), (hx + rx * 1.05, hy + ry * 0.35), (hx + rx * 1.15, hy + ry * 1.7), (hx + rx * 0.4, hy + ry * 1.25), (hx, hy + ry * 1.85), (hx - rx * 0.4, hy + ry * 1.25), (hx - rx * 1.15, hy + ry * 1.7)], g)
        cv.ell(hx, hy + ry * 0.75, 0.022 * k, 0.026 * k, (200, 40, 50), halo=False)
        cv.line([(hx - rx * 1.05, hy + ry * 0.35), (hx + rx * 1.05, hy + ry * 0.35)], 0.012 * k, (160, 100, 40))
        if L["gender"] == "m":
            for s in (-1, 1):
                for j in range(4):
                    cv.ell(hx + s * (rx * 1.15 + 0.02 * j), hy + ry * 0.3 - 0.05 * j * k, 0.012 * k, 0.012 * k, (240, 230, 200), halo=False)
    elif h == "helm":                                              # mu tuong co dai
        c = (176, 150, 70)
        cv.poly([(hx - rx * 1.2, hy + ry * 0.3)] + [(hx + math.cos(math.pi - math.pi * i / 14) * rx * 1.2, hy + ry * 0.3 + math.sin(math.pi * i / 14) * ry * 1.15) for i in range(15)] + [(hx + rx * 1.2, hy + ry * 0.3)], c)
        cv.poly([(hx - 0.012, hy + ry * 1.4), (hx + 0.012, hy + ry * 1.4), (hx + 0.045, hy + ry * 2.1), (hx - 0.045, hy + ry * 2.2)], (200, 40, 40))
        cv.poly([(hx - rx * 1.3, hy + ry * 0.34), (hx + rx * 1.3, hy + ry * 0.34), (hx + rx * 1.2, hy + ry * 0.2), (hx - rx * 1.2, hy + ry * 0.2)], shade(c, 0.78))


def finish(cv, S, tint, rim, side):
    """Ap anh sang: do bien thien nhe + vien sang (rim) phia nguon sang + toi nhe phia doi dien + nhuom mau canh."""
    bb = cv.im.getbbox()
    if bb is None:
        bb = (0, 0, 2, 2)
    bb = (max(0, bb[0] - 4), max(0, bb[1] - 4), min(cv.im.width, bb[2] + 4), min(cv.im.height, bb[3] + 4))
    cv.crop_off = (bb[0], bb[1])
    a = np.asarray(cv.im.crop(bb)).astype(np.float32)
    al = a[..., 3]
    h, w = al.shape
    xs = np.linspace(-1, 1, w)[None, :]
    ys = np.linspace(0, 1, h)[:, None]
    light = 1.07 - 0.12 * xs * side - 0.12 * ys
    rgb = a[..., :3] * light[..., None] * (1 - (1 - np.array(tint, np.float32)) * 0.5)[None, None, :]
    m = al > 128
    d = max(2, int(S * 0.011))
    sh = np.zeros_like(m)
    if side >= 0:
        sh[d:, d:] = m[:-d, :-d]         # canh tren-trai
        sh2 = np.zeros_like(m); sh2[:-d, :-d] = m[d:, d:]
    else:
        sh[d:, :-d] = m[:-d, d:]
        sh2 = np.zeros_like(m); sh2[:-d, d:] = m[d:, :-d]
    r = m & ~sh
    rgb[r] = rgb[r] * 0.9 + np.array(rim, np.float32) * 0.08
    s2 = m & ~sh2
    rgb[s2] *= 0.92
    a[..., :3] = np.clip(rgb, 0, 255)
    return Image.fromarray(a.astype(np.uint8)), cv.crop_off, (cv.ox, cv.oy)


# ---------------------------------------------------------------- khung hinh
def _crop_box(cam, W, H):
    fx, fh, zoom, az = (float(v) for v in cam)
    bh = 3.6 / zoom * PPM
    bw = bh * W / H
    if bh > WH:
        bh, bw = WH, WH * W / H
    if bw > WW:
        bw, bh = WW, WW * H / W
    cx = CX0 + fx * PPM
    cy = FEET_Y - fh * PPM
    l = clamp(cx - bw / 2, 0, WW - bw)
    t = clamp(cy - bh / 2, 0, WH - bh)
    return l, t, l + bw, t + bh


def _particles(img, P, sc, t, W, H, ppm):
    era, night = sc.era, sc.night
    d = ImageDraw.Draw(img, "RGBA")
    n = 38
    for i in range(n):
        s1, s2, s3 = h01(str(i), "px"), h01(str(i), "py"), h01(str(i), "ps")
        if sc.rain:
            continue
        if era == "war" and night:                      # tan lua bay len
            x = (s1 * W + math.sin(t * 0.8 + s3 * 9) * 30 * W / 1000) % W
            y = H - ((t * (60 + 90 * s3) * H / 1000 + s2 * H) % H)
            r = max(1, int(1.2 + 2.6 * s3) * W // 1280 + 1)
            d.ellipse([x - r, y - r, x + r, y + r], fill=(255, 170 + int(60 * s3), 70, int(140 * (0.4 + 0.6 * s3))))
        elif era == "ancient":                           # tan lua bay + bui
            x = (s1 * W + math.sin(t * 0.7 + s3 * 9) * 26 * W / 1000) % W
            y = H - ((t * (40 + 70 * s3) * H / 1000 + s2 * H) % H)
            r = max(1, int((1 + 2.4 * s3) * W / 1280) + 1)
            col = (255, 170 + int(60 * s3), 70, int(150 * (0.4 + 0.6 * s3))) if night else (230, 210, 170, 90)
            d.ellipse([x - r, y - r, x + r, y + r], fill=col)
        elif era == "imperial":                           # canh hoa roi / dom dom
            x = (s1 * W + (t * 30 * s3 + math.sin(t * 1.3 + s2 * 6) * 40) * W / 1000) % W
            y = ((t * (28 + 40 * s3) * H / 1000 + s2 * H) % H)
            r = max(2, int((3 + 4 * s3) * W / 1280))
            col = (255, 214, 140, 150) if night else (255, 190, 200, 190)
            d.ellipse([x - r, y - r * 0.6, x + r, y + r * 0.6], fill=col)
        elif era == "modern" and (night or s3 > 0.6):    # bui sang nhe
            x = (s1 * W + math.sin(t * 0.5 + s2 * 6) * 20) % W
            y = (s2 * H - t * 8 * s3 * H / 1000) % H
            r = max(1, int((1 + 2 * s3) * W / 1280))
            d.ellipse([x - r, y - r, x + r, y + r], fill=(255, 244, 220, int(70 + 70 * s3)))
    if sc.rain:
        ln = int(H * 0.05)
        for i in range(120):
            s1, s2, s3 = h01(str(i), "rx"), h01(str(i), "ry"), h01(str(i), "rs")
            sp = 1.6 + s3
            x = (s1 * (W + 80) - t * 60 * W / 1000 * sp * 0.2) % (W + 80) - 40
            y = ((s2 + t * sp * 0.9) % 1.0) * (H + ln) - ln
            d.line([x, y, x - ln * 0.18, y + ln], fill=(200, 215, 235, int(70 + 80 * s3)), width=max(1, W // 700))



_BGC = {}


def _load_bg(path, size):
    k = (path, size)
    if k not in _BGC:
        _BGC.clear()
        _BGC[k] = Image.open(path).convert("RGB").resize(size, Image.LANCZOS)
    return _BGC[k]


_SPR = {}


def _load_spr(path):
    if path not in _SPR:
        if len(_SPR) > 24:
            _SPR.pop(next(iter(_SPR)))
        _SPR[path] = Image.open(path).convert("RGBA")
    return _SPR[path]


def _spr_height(L):
    return {"child": 1.0, "old": 1.35}.get(L["age"], 1.5)



_RIG = {}


def _rig_cuts(spr, key):
    """Tim dong co (cat dau/than) va dong hong (cat chan) tren sprite nguoi. Tra ve (neck_y, hip_y, midx) theo ti le."""
    if key in _RIG:
        return _RIG[key]
    a = np.asarray(spr)[..., 3] > 40
    H, W = a.shape
    rows = a.sum(1).astype(float)
    ys = np.where(rows > 0)[0]
    out = None
    if len(ys) > 20:
        y0, y1 = ys[0], ys[-1]
        h = y1 - y0 + 1
        lo, hi = int(y0 + h * 0.30), int(y0 + h * 0.62)
        seg = np.convolve(rows, np.ones(5) / 5, "same")
        hw = seg[y0:int(y0 + h * 0.30)].max() if h else 1
        ny = lo + int(np.argmin(seg[lo:hi]))
        neck = ny if seg[ny] < 0.85 * hw else int(y0 + h * 0.52)
        cols = np.where(a[int(y0 + h * 0.8):y1].any(0))[0]
        mid = int((cols[0] + cols[-1]) / 2) if len(cols) else W // 2
        out = (neck, int(y0 + h * 0.80), mid, y0, y1)
    _RIG[key] = out
    return out


def _rig_compose(spr, key, t, amp, env_pulse, walk, nod, seed):
    """Ghep dau / than / hai chan thanh khung hoat canh: dau gat theo loi noi, than tho, chan buoc luan phien."""
    cuts = _rig_cuts(spr, key)
    if not cuts:
        return spr
    W, H = spr.size
    neck, hip, mid, y0, y1 = cuts
    pad = int(0.18 * H)
    cv = Image.new("RGBA", (W + 2 * pad, H + 2 * pad), (0, 0, 0, 0))
    legs = spr.crop((0, hip, W, H))
    torso = spr.crop((0, neck, W, hip))
    head = spr.crop((0, 0, W, neck))
    # chan: buoc luan phien khi di
    ph = math.sin(walk) if walk else 0.0
    for side, (x0, x1) in enumerate(((0, mid), (mid, W))):
        part = legs.crop((x0, 0, x1, legs.height))
        sgn = 1 if side == 0 else -1
        lift = max(0.0, ph * sgn) * 0.07 * H if walk else 0.0
        ang = ph * sgn * 16 if walk else 0.0
        if walk and ang:
            tmp = Image.new("RGBA", (part.width + 40, part.height + 40), (0, 0, 0, 0))
            tmp.paste(part, (20, 20))
            tmp = tmp.rotate(ang, resample=Image.BICUBIC, center=(tmp.width / 2, 20))
            cv.paste(tmp, (pad + x0 - 20, pad + hip - 20 - int(lift)), tmp)
        else:
            cv.paste(part, (pad + x0, pad + hip), part)
    breath = 0.012 * H * math.sin(t * 2.2 + seed * 6)
    sway = 0.012 * W * math.sin(t * 1.7 + seed * 5) + (0.02 * W * ph if walk else 0)
    # than
    tb = torso.resize((torso.width, max(2, int(torso.height * (1 + 0.025 * amp * env_pulse)))), Image.BICUBIC)
    ty = pad + hip - tb.height - int(breath)
    cv.paste(tb, (pad + int(sway * 0.5), ty), tb)
    # dau: gat theo nhip noi, nghieng nhe, "nay" khi noi
    hang = nod * 10 + 4.0 * math.sin(t * 1.9 + seed * 3) + (1.6 * math.sin(t * 2.4 + seed) * amp)
    hs = 1.0 + (0.018 * env_pulse - 0.009) * amp          # dau phong/xep nhip nhu mo mieng
    hh = max(2, int(head.height * hs))
    hd = head.resize((head.width, hh), Image.BICUBIC)
    hy = ty - hh + int(0.04 * H) - int(abs(math.sin(t * 2.4 + seed)) * 0.006 * H * amp)
    tmp = Image.new("RGBA", (hd.width + 2 * pad, hd.height + 2 * pad), (0, 0, 0, 0))
    tmp.paste(hd, (pad, pad))
    tmp = tmp.rotate(hang, resample=Image.BICUBIC, center=(pad + hd.width / 2, pad + hd.height))
    cv.paste(tmp, (int(sway) - pad + pad, hy - pad + pad - 0), tmp)
    return cv.crop(cv.getbbox() or (0, 0, cv.width, cv.height))


def draw_sprite_char(P, n, pose, L, ppm, t, tint):
    """Nhan vat sticker (AI/thu vien) -> (anh RGBA, neo chan x, neo chan y). Hoat anh kieu 'roi': nhun, nghieng, nay khi noi."""
    from .chargen import VAR
    d = P.sprites[n]
    path = d.get(VAR.get(pose.emo, "neutral")) or d.get("neutral") or next(iter(d.values()))
    from . import actions as _ac
    akey = _ac.act_key(P, n, t)
    act_spr = False
    if akey in ("run", "walk"):
        pass
    elif akey and d.get("act:" + akey):
        path = d["act:" + akey]
        act_spr = True
    base = _load_spr(path)
    hm = _spr_height(L) * (1.0 if base.height >= base.width * 0.55 else 0.8)
    th = max(8, int(hm * ppm))
    sc = th / base.height
    tw = max(4, int(base.width * sc))
    spr = base.resize((tw, th), Image.LANCZOS)
    if base.height >= base.width * 0.55 and not act_spr:
        sd = h01(n, "rg")
        amp0 = pose.amp if pose.speaking else 0.0
        pulse = 0.5 + 0.5 * math.sin(t * 3.6 + sd * 6)
        spr = _rig_compose(spr, (path, th), t, amp0, pulse, pose.walk, pose.nod, sd)
        tw, th = spr.size
    if akey and not act_spr and _ac.KEYS.get(akey, (None, None))[1]:
        ov = _ac.prop_overlay(_ac.KEYS[akey][1], spr.size)
        spr = spr.copy(); spr.alpha_composite(ov)
    if pose.gaze < -0.35:
        spr = spr.transpose(Image.FLIP_LEFT_RIGHT)
    sp = math.sin(t * 2.6 + h01(n, "sp"))
    amp = pose.amp if pose.speaking else 0.0
    sy = 1.0 + 0.012 * math.sin(t * 2.0 + h01(n, "br") * 6) + 0.02 * amp * (0.5 + 0.5 * sp)
    sx = 1.0 - (sy - 1.0) * 0.8
    hop = (abs(math.sin(pose.walk)) * 0.07 * th) if pose.walk else 0.0
    ang = pose.tilt * 22 + 1.8 * math.sin(t * 1.6 + h01(n, "tl") * 6) + (5 * math.sin(pose.walk) if pose.walk else 0) + (1.0 * math.sin(t * 2.2 + 1) * amp)
    if pose.shake:
        ang += pose.shake * 120
    spr = spr.resize((max(4, int(tw * sx)), max(8, int(th * sy))), Image.BICUBIC)
    pad = int(0.25 * max(spr.size))
    cv = Image.new("RGBA", (spr.width + 2 * pad, spr.height + 2 * pad), (0, 0, 0, 0))
    cv.paste(spr, (pad, pad))
    cv = cv.rotate(ang, resample=Image.BICUBIC, center=(cv.width / 2, pad + spr.height))
    a = np.asarray(cv).astype(np.float32)
    a[..., :3] = np.clip(a[..., :3] * (1 - (1 - np.array(tint, np.float32)) * 0.45)[None, None, :], 0, 255)
    cv = Image.fromarray(a.astype(np.uint8))
    return cv, cv.width / 2, pad + spr.height + hop


EX_LIB = {"wolf": ("stone_soi", 0.85), "mammoth": ("stone_voi_ma_mut", 2.3), "sabertooth": ("stone_ho_rang_kiem", 1.1), "deer": ("stone_huou_duc", 1.3),
          "bear": ("stone_gau", 1.4), "eagle": ("stone_dai_bang", 0.8), "bird": ("stone_chim_xanh", 0.3)}


def _extra_lib(P, name):
    if not getattr(P, "sprites", None) or name not in EX_LIB:
        return None
    import os
    from .chargen import LIB
    f = os.path.join(LIB, EX_LIB[name][0] + ".png")
    return _load_spr(f) if os.path.exists(f) else None


def _extra_sprite(base, name, ppm, t, mv):
    hm = EX_LIB[name][1]
    th = max(6, int(hm * ppm)); tw = max(4, int(base.width * th / base.height))
    spr = base.resize((tw, th), Image.LANCZOS)
    hop = abs(math.sin(t * 5.0)) * 0.05 * th if mv == "walk" else 0.0
    ang = 2.5 * math.sin(t * 5.0) if mv == "walk" else 4 * math.sin(t * 6.0)
    pad = int(0.2 * max(spr.size))
    cv = Image.new("RGBA", (spr.width + 2 * pad, spr.height + 2 * pad), (0, 0, 0, 0)); cv.paste(spr, (pad, pad))
    cv = cv.rotate(ang, resample=Image.BICUBIC, center=(cv.width / 2, pad + spr.height))
    return cv, cv.width / 2, pad + spr.height + hop


_FR_CACHE = {}


_CLIPS = {}


import threading as _th
_CLIP_LOCK = _th.Lock()
_MISS = object()


def _clip_frames(path, W, H):
    """Giai ma clip thanh mang khung (cache toi da 3 clip). Co khoa: nhieu luong dung chung khong giai ma trung nhau."""
    key = (path, W, H)
    c = _CLIPS.get(key, _MISS)
    if c is _MISS:
        with _CLIP_LOCK:
            c = _CLIPS.get(key, _MISS)
            if c is _MISS:
                c = _clip_decode(path, W, H, key)         # loi giai ma cung duoc nho (None) -> khong chay lai ffmpeg moi khung
    return c


def _clip_decode(path, W, H, key):
    c = None
    if True:
        import subprocess
        from .common import ffmpeg
        w, h = (768, 432) if W >= H else (432, 768)
        try:
            out = subprocess.run([ffmpeg(), "-v", "error", "-i", path, "-vf", f"fps=16,scale={w}:{h}:force_original_aspect_ratio=increase,crop={w}:{h}", "-f", "rawvideo", "-pix_fmt", "rgb24", "-"],
                                 capture_output=True, timeout=120).stdout
            n = len(out) // (w * h * 3)
            c = np.frombuffer(out, np.uint8)[: n * w * h * 3].reshape(n, h, w, 3) if n else None
        except Exception:
            c = None
        if len(_CLIPS) >= 3:
            _CLIPS.clear()
        _CLIPS[key] = c
    return c


def _clip_img(path, local, W, H, zoom, px, py):
    c = _clip_frames(path, W, H)
    if c is None or not len(c):
        return None
    n = len(c)
    k = int(max(local, 0.0) * 16)
    k = min(k, n - 1)                                        # chay xuoi MOT lan roi giu khung cuoi (khong chay nguoc: tien la tien)
    im = Image.fromarray(c[k])
    sc_ = max(W / im.width, H / im.height)            # clip nho hon khung -> phong len phu kin khung truoc khi cat (khong thi bi vien den, hinh nho)
    im = im.resize((max(W, int(im.width * sc_ + 0.5)), max(H, int(im.height * sc_ + 0.5))), Image.BICUBIC)
    return _fr_crop(im, W, H, zoom, px, py)


_FR_LOCK = _th.Lock()
_RV_CROP = {}                                        # khung 'dang ve ra' (may dung yen) -> chi cat 1 lan, cac khung sau dung lai (cache cua reveal.py nho theo anh)


INSET_TOP = 0.03        # le tren khi thu anh canh vao khung (ti le chieu cao); le duoi lon hon de chua cho phu de


def _inset_img(src, W, H, ins):
    """Thu anh canh con 'ins' (vd 0.88) khung hinh, dat can giua ngang, sat len tren (chua le duoi cho phu de), phan le to bang mau nen cua chinh anh (nen sang) -> khong bi lo vien."""
    import numpy as np
    w, h = max(2, int(W * ins)), max(2, int(H * ins))
    s = max(w / float(src.width), h / float(src.height))
    big = src.resize((max(w, int(src.width * s + 0.5)), max(h, int(src.height * s + 0.5))), Image.LANCZOS)
    ox, oy = (big.width - w) // 2, (big.height - h) // 2
    art = big.crop((ox, oy, ox + w, oy + h))
    th = np.asarray(src.resize((64, 64), Image.BOX), np.float32)
    edge = np.concatenate([th[:2].reshape(-1, 3), th[-2:].reshape(-1, 3), th[:, :2].reshape(-1, 3), th[:, -2:].reshape(-1, 3)])
    bg = tuple(int(v) for v in np.median(edge, axis=0))
    if sum(bg) / 3.0 < 200:                                            # anh co vien toi / nen mau dam: dung giay trang cua kieu ve tay
        bg = (251, 249, 243)
    out = Image.new("RGB", (W, H), bg)
    out.paste(art, ((W - w) // 2, min(int(H * INSET_TOP), H - h)))
    return out


def _fr_base(path, W, H, ins=0.0):
    """Anh khung phong vua khit khung hinh (nho). Co khoa: nhieu luong cung can mot anh thi chi doc + phong 1 lan. ins>0: thu anh vao trong khung (tab 'Ve ra')."""
    key = (path, W, H, ins)
    im = _FR_CACHE.get(key)
    if im is None:
        with _FR_LOCK:
            im = _FR_CACHE.get(key)
            if im is None:
                src = Image.open(path).convert("RGB")
                if 0.3 < ins < 1.0:
                    im = _inset_img(src, W, H, ins)
                else:
                    s = max(W / src.width, H / src.height) * 1.0
                    im = src.resize((max(W, int(src.width * s)), max(H, int(src.height * s))), Image.LANCZOS)
                while len(_FR_CACHE) > 24:                                   # bo anh cu nhat (khong xoa sach -> khong doc lai hang loat)
                    try:
                        del _FR_CACHE[next(iter(_FR_CACHE))]
                    except (StopIteration, KeyError, RuntimeError):
                        break
                _FR_CACHE[key] = im
    return im


def _fr_img(path, W, H, zoom, px, py, ins=0.0):
    return _fr_crop(_fr_base(path, W, H, ins), W, H, zoom, px, py)


def _fr_img_hold(path, W, H, zoom, px, py, ins=0.0):
    """Nhu _fr_img nhung nho ket qua cho cac khung cung may (luc hieu ung 've ra' chay, may dung yen): tra ve BAN SAO (nguoi goi co the ve de len),
    ban sao mang san dau van tay anh (reveal._key) nen cac cache net ve / but chi tinh 1 lan cho ca doan hieu ung."""
    key = (path, W, H, round(zoom, 5), round(px, 5), round(py, 5), ins)
    im = _RV_CROP.get(key)
    if im is None:
        im = _fr_img(path, W, H, zoom, px, py, ins)
        from . import reveal
        reveal._key(im)
        if len(_RV_CROP) >= 3:
            try:
                del _RV_CROP[next(iter(_RV_CROP))]
            except (StopIteration, KeyError, RuntimeError):
                pass
        _RV_CROP[key] = im
    from . import reveal
    return reveal.key_copy(im, im.copy())


def _fr_crop(im, W, H, zoom, px, py):
    cw, chh = W / zoom, H / zoom
    x0 = (im.width - cw) / 2 + px * (im.width - cw) / 2
    y0 = (im.height - chh) / 2 + py * (im.height - chh) / 2
    if im.size == (W, H) and abs(cw - W) < 1e-6 and abs(chh - H) < 1e-6 and abs(x0) < 1e-6 and abs(y0) < 1e-6:
        return im.copy()                                                    # khong zoom, khong lia: khong can lay mau lai
    # cat theo nua diem anh (khong lam tron so nguyen) -> zoom/lia muot, khong giat tung buoc. resize(box=) nhanh gap ~4 lan transform(AFFINE, BICUBIC), cung chat luong
    x0 = max(0.0, min(x0, im.width - cw)); y0 = max(0.0, min(y0, im.height - chh))
    return im.resize((W, H), Image.BICUBIC, box=(x0, y0, min(float(im.width), x0 + cw), min(float(im.height), y0 + chh)))


def render_frames(P, t, W, H):
    """Che do 'Flow ve tron khung': hien khung cua nhip dang doc, may day vao/lia cham, nhip theo tieng noi, chuyen khung mo nhe."""
    from .pose import env_at
    fr = P.frames
    ins = float(getattr(P, "inset", 0.0) or 0.0)                  # tab 'Ve ra': canh thu nho vao trong khung (khong tran het), chua le duoi cho phu de
    k = 0
    for i, f in enumerate(fr):
        if f["start"] <= t:
            k = i
    f = fr[k]
    t0 = fr[k]["start"] if k else 0.0
    d = max(f["end"] - f["start"], 1.0)
    shot = f.get("shot", "medium")
    mode = getattr(P, "camfx", "auto")
    strg = float(getattr(P, "camstr", 1.0))
    shake_on = bool(getattr(P, "camshake", False))
    rv = getattr(P, "revfx", "none")                             # hieu ung 'VE RA' (reveal.py): khung moi hien dan len tren khung truoc (khung dau: tren nen giay)
    t_rv, rd, rv_on = f["start"], 0.0, False
    if rv != "none":
        from . import reveal
        if getattr(P, "revauto", False):                          # thoi gian ve tu dong theo do dai cau (cau dai ve cham, cau ngan ve nhanh)
            if k == 0:                                           # khung dau: bat dau ve tu giay 0 (khong de man hinh giay trang cho den khi nguoi doc mo mieng)
                t_rv, d_rv = 0.0, max(f["end"], 1.0)
            else:
                d_rv = d
            rd = reveal.auto_dur(rv, d_rv)
        else:
            rd = min(float(getattr(P, "revdur", 1.5)), 0.6 * d)
        rv_on = rd > 0.05 and t - t_rv < rd
    pen_fix = False                                              # 've tay': tranh co nho CO DINH tren giay (le trang deu) -> may dung yen, khong zoom / lia suot khung
    if rv != "none" and not f.get("clip"):
        from . import reveal as _rv
        if _rv.pick(rv) == "pen":
            _b = _fr_base(f["path"], W, H, ins)
            pen_fix = _rv._pen_geom(_b, _rv.dir_of("pen", getattr(P, "revdir", "auto"), k)) is not None
    # luc hieu ung dang ve, may DUNG YEN o vi tri se co khi ve xong (roi chay tiep dung lich cu, khong giat): tranh moi khung la mot anh khac -> tinh lai net ve moi khung (cham gap 10 lan)
    tc = (t_rv + rd) if rv_on else t
    u = clamp((tc - t0) / d)
    e = u * u * (3 - 2 * u)
    Z = 0.12 * strg
    px = py = 0.0
    if pen_fix:
        zoom, shake_on = 1.0, False
    elif f.get("clip"):                      # da co chuyen dong AI: giu nguyen; het clip thi giu khung cuoi + zoom rat nhe de khong khung tinh
        zoom, shake_on = 1.0, False
        try:
            cc = _clip_frames(f["clip"], W, H)
            cdur = (len(cc) / 16.0) if cc is not None else 0.0
            if cdur and (t - f["start"]) > cdur and d > cdur + 0.3:
                u2 = clamp((t - f["start"] - cdur) / (d - cdur))
                zoom = 1.0 + 0.5 * Z * (u2 * u2 * (3 - 2 * u2))
        except Exception:
            pass
    else:
        if mode == "auto":
            mode = ("zoomin", "zoomout", "panr", "panl", "diag")[k % 5]
            if shot in ("insert", "pov"):
                mode = "zoomin"
        if mode == "zoomin":
            zoom = 1.0 + Z * e
        elif mode == "zoomout":
            zoom = 1.0 + Z * (1 - e)
        elif mode in ("panr", "panl", "pan"):
            zoom = 1.0 + 0.7 * Z
            px = (-0.85 + 1.7 * e) * (1 if (mode == "panr" or (mode == "pan" and k % 2 == 0)) else -1)
        elif mode == "diag":
            zoom = 1.0 + Z * e
            px, py = (-0.5 + e) * 0.8, (0.4 - 0.8 * e)
        else:                               # none / shake
            zoom = 1.0
        if shake_on:
            zoom = max(zoom, 1.035)
    if shake_on:                           # rung nhe kieu may cam tay: bien do nho, cham, mem
        sh = math.sin(2 * math.pi * 0.9 * tc) + 0.5 * math.sin(2 * math.pi * 1.7 * tc + 1.3)
        sv = math.sin(2 * math.pi * 1.1 * tc + 0.6) + 0.5 * math.sin(2 * math.pi * 2.1 * tc + 2.0)
        px += 0.16 * sh
        py += 0.16 * sv
    px, py = max(-1.0, min(1.0, px)), max(-1.0, min(1.0, py))
    env = env_at(f["line"], t)
    use = f["path"]
    if f.get("path2") and env > 0.3 and int(t * 3.5) % 2 == 0:       # nhep mieng cham, khong nhap nhay
        use = f["path2"]
    img = None
    if f.get("clip"):
        img = _clip_img(f["clip"], t - f["start"], W, H, zoom, px, py)
    if img is None:
        img = (_fr_img_hold if rv_on else _fr_img)(use, W, H, zoom, px, py, ins)
    if rv_on:
        old = _fr_img(fr[k - 1]["path"], W, H, 1.0, 0.0, 0.0, ins) if k else None
        if old is not None and pen_fix:                           # khung truoc dang hien tranh co nho (ve tay) -> nen cu cung la tranh co nho
            old = reveal.pen_hold(old, reveal.dir_of("pen", getattr(P, "revdir", "auto"), k - 1)) or old
        return reveal.compose(rv, (t - t_rv) / rd, old, img, k, getattr(P, "revdir", "auto"))
    if pen_fix:                                                  # ve xong: giu nguyen tranh co nho (khong zoom / lia), tay da rut ra
        return reveal.pen_hold(_fr_base(use, W, H, ins), reveal.dir_of("pen", getattr(P, "revdir", "auto"), k))
    if k and t - f["start"] < 0.45:                              # chuyen khung: cat nhanh, hoa tan rat ngan
        g = fr[k - 1]
        old = _fr_img(g["path"], W, H, 1.0, 0.0, 0.0, ins)
        u_ = clamp((t - f["start"]) / 0.45)
        img = Image.blend(old, img, u_ * u_ * (3 - 2 * u_))          # hoa tan mem, de chiu
    return img


def render2d(P, t, cam, W=None, H=None):
    W, H = W or P.W, H or P.H
    if getattr(P, "frames", None):
        return render_frames(P, t, W, H)
    if getattr(P, "sprites", None):                 # nhan vat sticker thap hon nhan vat ve bang code -> ha tam may
        cam = (cam[0], float(cam[1]) - 0.40, float(cam[2]) * 0.92, cam[3])
    si = P.scene_index(t)
    sc = P.scenes[si]
    bg = art.get_bg(sc.era, sc.theme, sc.night, seed=7)
    pal = bg.p
    l, tp, r, b = _crop_box(cam, W, H)
    bgimg = bg.img
    ab = getattr(P, "scene_bgs", {}).get(si)
    if ab:
        bgimg = _load_bg(ab, bg.img.size)
    img = bgimg.resize((W, H), Image.BICUBIC if (r - l) < W else Image.LANCZOS, box=(l, tp, r, b))
    sc_px = W / (r - l)
    ppm = PPM * sc_px
    # anh sang chap chon cua den (nhap nhay nhe)
    from .pose import pose_at
    drawn = []
    names = [n for n in sc.cast if t >= sc.cast[n]["enter"]]
    names.sort(key=lambda n: sc.cast[n]["sx"])
    ss = 2 if ppm * 2 <= 760 else 1
    lightside = 1 if pal["accent"] is not None and ((si % 2) == 0) else -1
    from .extras import draw_extra, INFO
    for c in P.cues:
        if c.kind != "extra" or not (c.start <= t <= c.end):
            continue
        u = (t - c.start) / max(c.end - c.start, 0.1)
        wx = c.x0 + (c.x1 - c.x0) * u
        k0, mv, spd, hgt = INFO[c.name]
        sc_e = 1.0 - 0.1 * c.lane if mv == "walk" else 1.0
        wy = hgt + (0.12 * math.sin(t * 1.3 + c.seed) if mv != "walk" else 0.0)
        lane_up = (0.07 + 0.22 * c.lane) if mv == "walk" else 0.0
        e_ss = 2 if ppm * 2 <= 700 else 1
        offs = [(0.0, 0.0)] if c.name != "bird" else [(-0.8, 0.1), (0.0, 0.0), (0.7, -0.15), (-0.3, -0.35), (1.3, 0.25)]
        for j, (ox_, oy_) in enumerate(offs):
            lib = _extra_lib(P, c.name)
            if lib is not None:
                spr, ax, ay = _extra_sprite(lib, c.name, ppm * sc_e, t + j * 0.37, mv)
                e_ss = 1
            else:
                spr, ax, ay = draw_extra(c.name, ppm * e_ss * sc_e, t + j * 0.37, c.seed * 0.13 + j)
            if e_ss > 1:
                spr = spr.resize((max(1, spr.width // e_ss), max(1, spr.height // e_ss)), Image.LANCZOS)
                ax, ay = ax / e_ss, ay / e_ss
            if c.x1 < c.x0:
                spr = spr.transpose(Image.FLIP_LEFT_RIGHT); ax = spr.width - ax
            X = (CX0 + (wx + ox_) * PPM - l) * sc_px
            Y = (FEET_Y - (wy + oy_ + lane_up) * PPM - tp) * sc_px
            if -spr.width < X < W + spr.width:
                al = spr.split()[3].point(lambda v: int(v * clamp(min(u * 10, (1 - u) * 10, 1.0))))
                img.paste(spr.convert("RGB"), (int(X - ax), int(Y - ay)), al)
    for n in names:
        pose = pose_at(P, n, t)
        if not pose.visible:
            continue
        L = P.looks[n]
        info = sc.cast[n]
        from . import actions as _A
        _ak, _u = _A.act_state(P, n, t)
        _trav = 0.0
        if _ak in _A.MOVE:
            _dir = 1 if info.get("idx", 0) % 2 == 0 else -1
            _trav = (_u - 0.5) * (2.6 if _ak == "run" else 1.6) * _dir
            pose.walk = t * (11.0 if _ak == "run" else 7.0)
            pose.gaze = _dir * 0.8
        wx = info["sx"] + pose.dx + _trav
        X = (CX0 + wx * PPM - l) * sc_px
        Y = (FEET_Y - tp) * sc_px
        S = ppm * ss
        if X < -2.4 * ppm or X > W + 2.4 * ppm:
            continue
        if getattr(P, "sprites", None) and n in P.sprites:
            sprite, ox, oy = draw_sprite_char(P, n, pose, L, ppm, t, pal["tint"])
        else:
            sprite, (cx0, cy0), (fox, foy) = draw_character(L, pose, S, lightside, pal["tint"], mixc(pal["accent"], (255, 255, 255), 0.15))
            if ss > 1:
                sprite = sprite.resize((max(1, sprite.width // ss), max(1, sprite.height // ss)), Image.LANCZOS)
            ox, oy = (fox - cx0) / ss, (foy - cy0) / ss
        # bong duoi chan
        sh_w = 0.42 * ppm * (0.62 if L["age"] == "child" else 1.0)
        shl = Image.new("RGBA", (int(sh_w * 2.6), int(sh_w * 0.8)), (0, 0, 0, 0))
        ImageDraw.Draw(shl).ellipse([sh_w * 0.3, sh_w * 0.2, sh_w * 2.3, sh_w * 0.6], fill=(0, 0, 0, 110))
        shl = shl.filter(ImageFilter.GaussianBlur(max(1.0, sh_w * 0.07)))
        img.paste(shl.convert("RGB"), (int(X - shl.width / 2), int(Y - shl.height * 0.52)), shl.split()[3])
        img.paste(sprite.convert("RGB"), (int(X - ox), int(Y - oy)), sprite.split()[3])
    for ins in getattr(P, "inserts", []):
        if ins["start"] <= t <= ins["end"]:
            u = min(1.0, (t - ins["start"]) / 0.45, (ins["end"] - t) / 0.35)
            e = clamp(u)
            e = e * e * (3 - 2 * e)
            pic = Image.open(ins["path"]).convert("RGB")
            prog = (t - ins["start"]) / max(ins["end"] - ins["start"], 0.5)
            z = 1.0 + 0.06 * prog                                    # zoom cham ben trong khung
            cw, ch_ = int(pic.width / z), int(pic.height / z)
            pic = pic.crop(((pic.width - cw) // 2, (pic.height - ch_) // 2, (pic.width + cw) // 2, (pic.height + ch_) // 2))
            pw = int((0.40 if W > H else 0.80) * W * (0.88 + 0.12 * e))
            ph = int(pw * pic.height / pic.width)
            pic = pic.resize((pw, ph), Image.LANCZOS).convert("RGBA")
            rad = max(8, int(pw * 0.05))
            mask = Image.new("L", pic.size, 0); ImageDraw.Draw(mask).rounded_rectangle([0, 0, pw - 1, ph - 1], rad, fill=255)
            bd = 5
            card = Image.new("RGBA", (pw + 2 * bd, ph + 2 * bd), (0, 0, 0, 0))
            ImageDraw.Draw(card).rounded_rectangle([0, 0, card.width - 1, card.height - 1], rad + bd, fill=(255, 255, 255, 255))
            card.paste(pic, (bd, bd), mask)
            fy = 4 * math.sin(t * 1.6)                                # troi nhe
            px = int(W * (0.73 if W > H else 0.5) - card.width / 2 + (1 - e) * W * 0.12)
            py = int(H * (0.21 if W > H else 0.20) - card.height / 2 + fy)
            sh = Image.new("RGBA", (card.width + 60, card.height + 60), (0, 0, 0, 0))
            ImageDraw.Draw(sh).rounded_rectangle([30, 38, card.width + 30, card.height + 38], rad + bd, fill=(0, 0, 0, int(120 * e)))
            sh = sh.filter(ImageFilter.GaussianBlur(14))
            img.paste(sh.convert("RGB"), (px - 30, py - 30), sh.split()[3])
            al = card.split()[3].point(lambda v: int(v * e))
            img.paste(card.convert("RGB"), (px, py), al)
            break
    # anh sang tran nhe tu den (nhap nhay) - don gian: glow phu len khung
    _particles(img, P, sc, t, W, H, ppm)
    return img
