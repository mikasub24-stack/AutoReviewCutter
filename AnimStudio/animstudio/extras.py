# -*- coding: utf-8 -*-
"""Thu vat, phuong tien, vat the phu (2D kieu chibi vien den; 3D khoi da giac) xuat hien theo loi thoai."""
import math
import numpy as np
from PIL import Image, ImageDraw
from .common import h01, clamp
from .art import shade, mixc

INK = (22, 18, 26)

# ten -> (kich thuoc met, kieu di chuyen, toc do m/s, do cao so voi mat dat)
INFO = {
    "mammoth": (1.9, "walk", 0.55, 0.0), "wolf": (0.9, "walk", 1.1, 0.0), "sabertooth": (1.2, "walk", 0.9, 0.0), "deer": (1.0, "walk", 0.9, 0.0),
    "bear": (1.2, "walk", 0.7, 0.0), "cat": (0.4, "walk", 0.6, 0.0), "dog": (0.6, "walk", 1.0, 0.0),
    "eagle": (1.4, "fly", 1.4, 2.6), "bird": (0.35, "flock", 1.8, 2.3), "plane": (2.6, "fly", 2.4, 2.9),
    "tank": (2.4, "walk", 0.6, 0.0), "car": (2.0, "walk", 2.2, 0.0), "train": (7.0, "walk", 1.6, 0.0),
}


class C:
    def __init__(self, S, w_m, h_m):
        self.S, self.o = S, max(2, int(S * 0.011))
        W, H = int(w_m * S), int(h_m * S)
        self.im = Image.new("RGBA", (W, H), (0, 0, 0, 0))
        self.d = ImageDraw.Draw(self.im)
        self.ox, self.oy = W / 2, H - 0.05 * S

    def p(self, x, y):
        return (self.ox + x * self.S, self.oy - y * self.S)

    def ell(self, x, y, rx, ry, col, ink=True):
        cx, cy = self.p(x, y)
        rx, ry = rx * self.S, ry * self.S
        if ink:
            self.d.ellipse([cx - rx - self.o, cy - ry - self.o, cx + rx + self.o, cy + ry + self.o], fill=INK + (255,))
        self.d.ellipse([cx - rx, cy - ry, cx + rx, cy + ry], fill=col + (255,))

    def poly(self, pts, col, ink=True):
        self.d.polygon([self.p(*q) for q in pts], fill=col + (255,), outline=INK + (255,) if ink else None, width=self.o)

    def chain(self, a, b, w0, w1, col):
        for fill, e in ((INK, self.o), (col, 0)):
            ax, ay = self.p(*a); bx, by = self.p(*b)
            r0, r1 = w0 * self.S / 2 + e, w1 * self.S / 2 + e
            dx, dy = bx - ax, by - ay
            L = math.hypot(dx, dy) or 1
            nx, ny = -dy / L, dx / L
            self.d.polygon([(ax + nx * r0, ay + ny * r0), (bx + nx * r1, by + ny * r1), (bx - nx * r1, by - ny * r1), (ax - nx * r0, ay - ny * r0)], fill=fill + (255,))
            self.d.ellipse([ax - r0, ay - r0, ax + r0, ay + r0], fill=fill + (255,))
            self.d.ellipse([bx - r1, by - r1, bx + r1, by + r1], fill=fill + (255,))

    def line(self, pts, w, col):
        self.d.line([self.p(*q) for q in pts], fill=col + (255,), width=max(1, int(w * self.S)), joint="curve")


def _face(c, x, y, r, mouth=True):
    c.ell(x, y, r * 0.16, r * 0.24, INK, ink=False)
    c.ell(x - r * 0.03, y + r * 0.08, r * 0.05, r * 0.07, (255, 255, 255), ink=False)
    if mouth:
        pts = [(x - r * 0.15 + i * r * 0.05, y - r * 0.4 - r * 0.07 * math.sin(math.pi * i / 6)) for i in range(7)]
        c.line(pts, r * 0.05, (120, 40, 50))


def _quad(c, body, belly, bl, bh, legh, phase, head_r, head_dx, head_dy, ears="round", tail="short", spots=None, **kw):
    legs = []
    for i, lx in enumerate((-0.62, -0.28, 0.3, 0.64)):
        sw = math.sin(phase + (0 if i % 2 == 0 else math.pi)) * 0.12 * bl
        legs.append(((lx * bl, legh + 0.02), (lx * bl + sw, 0.02)))
    for a, b in legs[::2]:                          # chan sau
        c.chain(a, b, bl * 0.2, bl * 0.17, shade(body, 0.8))
    if tail == "bushy":
        c.chain((-bl * 0.9, legh + bh * 1.3), (-bl * 1.35, legh + bh * 1.4 + 0.1 * math.sin(phase)), bl * 0.14, bl * 0.24, body)
    elif tail == "short":
        c.chain((-bl * 0.95, legh + bh * 1.25), (-bl * 1.15, legh + bh * 1.5), bl * 0.07, bl * 0.05, body)
    elif tail == "long":
        c.chain((-bl * 0.95, legh + bh * 1.2), (-bl * 1.5, legh + bh * 0.8 + 0.1 * math.sin(phase)), bl * 0.09, bl * 0.05, body)
    c.ell(0, legh + bh, bl, bh, body)
    c.ell(0, legh + bh * 0.55, bl * 0.8, bh * 0.55, belly, ink=False)
    if spots:
        for (sx, sy, sr) in spots:
            c.ell(sx * bl, legh + bh * (1 + sy), sr * bl, sr * bl * 0.8, shade(body, 0.55), ink=False)
    for a, b in legs[1::2]:                         # chan truoc
        c.chain(a, b, bl * 0.2, bl * 0.17, body)
    hx, hy = bl * head_dx, legh + bh + bh * head_dy
    if ears == "point":
        for s_, off in ((-1, 0.0), (1, 0.55)):
            c.poly([(hx - head_r * 0.7 + off * head_r, hy + head_r * 0.7), (hx - head_r * 0.35 + off * head_r, hy + head_r * 1.5), (hx + head_r * 0.0 + off * head_r, hy + head_r * 0.8)], body)
    c.ell(hx, hy, head_r, head_r * 0.9, body)
    if kw.get("snout"):
        c.ell(hx + head_r * 0.85, hy - head_r * 0.2, head_r * 0.55, head_r * 0.38, belly)
        c.ell(hx + head_r * 1.3, hy - head_r * 0.05, head_r * 0.12, head_r * 0.1, INK, ink=False)
    _face(c, hx + head_r * 0.28, hy + head_r * 0.12, head_r)
    if ears == "round":
        c.ell(hx - head_r * 0.35, hy + head_r * 0.85, head_r * 0.3, head_r * 0.3, body)
    return hx, hy


def draw_extra(name, S, t, seed=0):
    """Tra ve (anh RGBA, ox, oy) - mep duoi giua than tai (ox, oy), huong sang phai."""
    k = INFO[name][0]
    ph = t * (6.0 if name not in ("mammoth", "tank", "train") else 3.2) + seed
    if name in ("eagle", "bird"):
        c = C(S, k * 1.4, k * 1.0)
        c.ox, c.oy = c.im.width / 2, c.im.height * 0.5
        flap = math.sin(ph * 1.6)
        col = (92, 62, 44) if name == "eagle" else (80, 150, 220)
        for s_ in (-1, 1):
            c.poly([(0, 0.0), (s_ * k * 0.62, k * 0.3 * flap + 0.05), (s_ * k * 0.55, k * 0.3 * flap - 0.12), (s_ * k * 0.15, -0.1)], shade(col, 0.85 if s_ < 0 else 1.0))
        c.ell(0, 0, k * 0.2, k * 0.12, col)
        c.ell(k * 0.2, k * 0.06, k * 0.09, k * 0.09, (245, 245, 245) if name == "eagle" else col)
        c.poly([(k * 0.27, k * 0.07), (k * 0.4, k * 0.03), (k * 0.27, 0.0)], (250, 200, 60))
        c.ell(k * 0.22, k * 0.09, k * 0.015, k * 0.02, INK, ink=False)
        return c.im, c.ox, c.oy
    if name == "plane":
        c = C(S, k * 1.3, k * 0.7)
        c.ox, c.oy = c.im.width / 2, c.im.height * 0.5
        oc = (96, 108, 70)
        c.poly([(-k * 0.45, 0.0), (-k * 0.62, k * 0.2), (-k * 0.5, k * 0.2), (-k * 0.3, 0.05)], oc)
        c.ell(0, 0, k * 0.5, k * 0.1, oc)
        c.poly([(-k * 0.1, 0.02), (k * 0.1, 0.02), (-k * 0.05, -k * 0.34), (-k * 0.22, -k * 0.34)], shade(oc, 0.8))
        c.ell(k * 0.14, k * 0.06, k * 0.1, k * 0.06, (170, 210, 235))
        c.ell(k * 0.5, 0, k * 0.03, k * 0.1, (210, 210, 210), ink=False)
        for i in range(2):
            a = ph * 9 + i * math.pi
            c.line([(k * 0.5, math.sin(a) * k * 0.12), (k * 0.5, -math.sin(a) * k * 0.12)], 0.03, (200, 200, 200))
        c.ell(-k * 0.02, k * 0.015, k * 0.07, k * 0.07, (210, 60, 50), ink=False)
        return c.im, c.ox, c.oy
    c = C(S, k * 2.0 if name != "train" else k * 1.15, k * 1.35 if name != "train" else 1.4)
    if name == "tank":
        oc = (96, 106, 66)
        c.poly([(-k * 0.5, 0.16), (k * 0.5, 0.16), (k * 0.42, 0.34 * k), (-k * 0.4, 0.34 * k)], oc)
        c.poly([(-k * 0.22, 0.34 * k), (k * 0.2, 0.34 * k), (k * 0.14, 0.52 * k), (-k * 0.14, 0.52 * k)], shade(oc, 1.1))
        c.chain((k * 0.12, 0.44 * k), (k * 0.66, 0.46 * k), 0.07 * k, 0.06 * k, shade(oc, 0.8))
        c.poly([(-k * 0.55, 0.0), (k * 0.55, 0.0), (k * 0.6, 0.2 * k), (-k * 0.6, 0.2 * k)], (52, 54, 44))
        for i in range(5):
            c.ell(-k * 0.46 + i * k * 0.23, 0.095 * k, 0.07 * k, 0.07 * k, (110, 114, 96))
        c.ell(k * 0.0, 0.43 * k, 0.03 * k, 0.03 * k, (230, 200, 70), ink=False)
        return c.im, c.ox, c.oy
    if name == "car":
        col = [(214, 70, 60), (60, 120, 200), (240, 190, 60), (90, 170, 120)][int(seed * 7) % 4]
        c.poly([(-k * 0.5, 0.1), (k * 0.5, 0.1), (k * 0.5, 0.26 * k), (k * 0.2, 0.3 * k), (-k * 0.5, 0.3 * k)], col)
        c.poly([(-k * 0.3, 0.3 * k), (k * 0.1, 0.3 * k), (k * 0.0, 0.5 * k), (-k * 0.22, 0.5 * k)], col)
        c.poly([(-k * 0.26, 0.32 * k), (k * 0.06, 0.32 * k), (-k * 0.0, 0.46 * k), (-k * 0.2, 0.46 * k)], (170, 215, 240), ink=False)
        for wx in (-0.3, 0.3):
            c.ell(k * wx, 0.12 * k, 0.1 * k, 0.1 * k, (36, 34, 40)); c.ell(k * wx, 0.12 * k, 0.04 * k, 0.04 * k, (200, 200, 200), ink=False)
        c.ell(k * 0.48, 0.2 * k, 0.03 * k, 0.03 * k, (255, 240, 160), ink=False)
        return c.im, c.ox, c.oy
    if name == "train":
        col = (70, 110, 170)
        for i in range(3):
            x0 = -0.3 * k + i * 0.3 * k
        c2 = C(S, k * 1.1, 1.5)
        n = 3
        for i in range(n):
            x = (i - 1) * 2.1
            c2.poly([(x - 1.0, 0.2), (x + 1.0, 0.2), (x + 1.0, 1.2), (x - 1.0, 1.2)], col if i else (190, 60, 50))
            for j in range(3):
                c2.poly([(x - 0.8 + j * 0.55, 0.65), (x - 0.4 + j * 0.55, 0.65), (x - 0.4 + j * 0.55, 1.05), (x - 0.8 + j * 0.55, 1.05)], (255, 232, 160), ink=False)
            c2.ell(x - 0.55, 0.2, 0.14, 0.14, (40, 40, 44)); c2.ell(x + 0.55, 0.2, 0.14, 0.14, (40, 40, 44))
        return c2.im, c2.ox, c2.oy
    # ---- thu bon chan ----
    sw = ph
    if name == "mammoth":
        body = (126, 88, 58)
        hx, hy = _quad(c, body, shade(body, 0.8), 0.55 * k, 0.32 * k, 0.2 * k, sw * 0.6, 0.27 * k, 0.9, 0.2, ears="none", tail="short")
        c.ell(hx - 0.1 * k, hy - 0.05, 0.14 * k, 0.2 * k, shade(body, 0.85))
        pts = [(hx + 0.22 * k, hy - 0.08), (hx + 0.38 * k, hy - 0.26 * k), (hx + 0.34 * k, hy - 0.42 * k + 0.04 * math.sin(sw))]
        for a, b in zip(pts, pts[1:]):
            c.chain(a, b, 0.14 * k, 0.1 * k, body)
        c.chain((hx + 0.15 * k, hy - 0.22 * k), (hx + 0.55 * k, hy - 0.2 * k), 0.07 * k, 0.03 * k, (245, 238, 220))
        c.chain((hx + 0.15 * k, hy - 0.2 * k), (hx + 0.5 * k, hy - 0.05 * k), 0.06 * k, 0.025 * k, (245, 238, 220))
        for i in range(8):                        # long xu
            x = -0.5 * k + i * 0.14 * k
            c.poly([(x, 0.28 * k), (x + 0.07 * k, 0.28 * k), (x + 0.035 * k, 0.17 * k)], body, ink=False)
    elif name == "wolf":
        _quad(c, (150, 150, 162), (230, 230, 236), 0.4 * k, 0.17 * k, 0.17 * k, sw, 0.14 * k, 1.0, 0.45, ears="point", tail="bushy", snout=True)
    elif name == "sabertooth":
        hx, hy = _quad(c, (236, 168, 70), (250, 224, 170), 0.46 * k, 0.2 * k, 0.17 * k, sw, 0.16 * k, 1.0, 0.35, ears="round", tail="long", snout=True,
                       spots=[(-0.3, 0.3, 0.05), (0.0, 0.5, 0.05), (0.3, 0.2, 0.05), (-0.1, -0.2, 0.04)])
        c.poly([(hx + 0.2 * k, hy - 0.13 * k), (hx + 0.26 * k, hy - 0.13 * k), (hx + 0.23 * k, hy - 0.32 * k)], (250, 248, 240))
    elif name == "deer":
        hx, hy = _quad(c, (178, 122, 72), (240, 220, 190), 0.38 * k, 0.15 * k, 0.28 * k, sw, 0.11 * k, 0.95, 0.9, ears="point", tail="short", snout=True,
                       spots=[(-0.2, 0.3, 0.035), (0.1, 0.4, 0.035), (0.3, 0.1, 0.03)])
        c.chain((hx, hy + 0.1 * k), (hx - 0.1 * k, hy + 0.3 * k), 0.02 * k, 0.02 * k, (120, 84, 56))
        for s_ in (-1, 1):
            c.chain((hx - 0.03 * k, hy + 0.12 * k), (hx - 0.1 * k + s_ * 0.1 * k, hy + 0.42 * k), 0.02 * k, 0.015 * k, (120, 84, 56))
    elif name == "bear":
        _quad(c, (118, 76, 50), (150, 104, 74), 0.5 * k, 0.32 * k, 0.12 * k, sw * 0.7, 0.2 * k, 0.9, 0.35, ears="round", tail="short", snout=True)
    elif name == "cat":
        _quad(c, (240, 170, 80), (252, 230, 190), 0.34 * k, 0.2 * k, 0.1 * k, sw, 0.18 * k, 0.9, 0.3, ears="point", tail="long")
    elif name == "dog":
        hx, hy = _quad(c, (200, 150, 96), (250, 230, 200), 0.38 * k, 0.18 * k, 0.14 * k, sw, 0.15 * k, 0.95, 0.3, ears="none", tail="bushy", snout=True)
        c.ell(hx - 0.08 * k, hy + 0.08 * k, 0.05 * k, 0.1 * k, (140, 90, 56))
    return c.im, c.ox, c.oy


# ------------------------------------------------------------ 3D
def build_extra_3d(S, name, pos, face, t, seed=0):
    """Dung khoi da giac cho thu/phuong tien. pos=(x,y,z); face=+1 nhin sang phai (+x), -1 sang trai."""
    from .r3d import sphere, box, I3, Ry
    k = INFO[name][0]
    px, py, pz = pos
    R = Ry(0.0 if face > 0 else math.pi)
    ph = t * 5 + seed
    P = lambda v: R @ np.asarray(v, float) + np.array([px, py, pz])
    cols = {"mammoth": (126, 88, 58), "wolf": (150, 150, 162), "sabertooth": (236, 168, 70), "deer": (178, 122, 72), "bear": (118, 76, 50), "cat": (240, 170, 80), "dog": (200, 150, 96)}
    if name in cols:
        c = cols[name]
        bl, bh, lg = {"mammoth": (1.0, 0.8, 0.6), "wolf": (0.45, 0.25, 0.35), "sabertooth": (0.55, 0.3, 0.38), "deer": (0.45, 0.22, 0.6), "bear": (0.6, 0.45, 0.3), "cat": (0.22, 0.12, 0.15), "dog": (0.3, 0.17, 0.25)}[name]
        S.add(sphere(P([0, lg + bh, 0]), (bl, bh, bh * 0.8), R, 10, 6), c, 1)
        for i, (lx, lz) in enumerate(((-0.6, -0.2), (-0.6, 0.2), (0.6, -0.2), (0.6, 0.2))):
            sw = math.sin(ph + (0 if (i % 2 == 0) else math.pi)) * 0.15 * bl
            S.limb(P([lx * bl, lg + bh * 0.4, lz * bh]), P([lx * bl + sw, 0.03, lz * bh]), bl * 0.12, bl * 0.1, shade(c, 0.85), layer=1, n=6, caps=False)
        hd = P([bl * 1.0, lg + bh * 1.4, 0])
        S.add(sphere(hd, (bh * 0.55, bh * 0.5, bh * 0.5), R, 8, 5), c, 1)
        S.add(sphere(P([bl * 1.1 + bh * 0.35, lg + bh * 1.4 + 0.02, 0.1 * bh]), 0.04 * bl + 0.02, I3, 5, 3), (24, 22, 30), 2)
        if name == "mammoth":
            S.limb(P([bl * 1.15, lg + bh * 1.2, 0]), P([bl * 1.5, lg + 0.2, 0]), bh * 0.2, bh * 0.1, c, layer=1, n=6)
            for sz in (-1, 1):
                S.limb(P([bl * 1.1, lg + bh * 1.2, sz * bh * 0.25]), P([bl * 1.55, lg + bh * 1.0, sz * bh * 0.4]), 0.06, 0.02, (245, 238, 220), layer=1, n=5)
        if name in ("wolf", "deer", "cat"):
            S.add(box(P([bl * 0.95, lg + bh * 1.9, 0.1 * bh]), (0.05, 0.12, 0.03), R), c, 1)
        if name == "deer":
            for sz in (-1, 1):
                S.limb(P([bl * 0.95, lg + bh * 1.9, sz * 0.05]), P([bl * 0.85, lg + bh * 3.1, sz * 0.25]), 0.02, 0.012, (120, 84, 56), layer=1, n=4, caps=False)
        return
    if name == "tank":
        S.add(box(P([0, 0.35, 0]), (2.0, 0.5, 1.1), R), (96, 106, 66), 1)
        S.add(box(P([0, 0.7, 0]), (0.9, 0.35, 0.8), R), (110, 120, 76), 1)
        S.limb(P([0.3, 0.72, 0]), P([1.4, 0.76, 0]), 0.07, 0.06, (80, 88, 56), layer=1, n=6)
        for sz in (-1, 1):
            S.add(box(P([0, 0.17, sz * 0.58]), (2.1, 0.34, 0.2), R), (52, 54, 44), 1)
        return
    if name == "car":
        c = [(214, 70, 60), (60, 120, 200), (240, 190, 60), (90, 170, 120)][int(seed * 7) % 4]
        S.add(box(P([0, 0.45, 0]), (2.0, 0.5, 0.9), R), c, 1)
        S.add(box(P([-0.1, 0.85, 0]), (1.0, 0.4, 0.8), R), c, 1)
        for lx in (-0.65, 0.65):
            for sz in (-1, 1):
                S.add(sphere(P([lx, 0.2, sz * 0.45]), (0.22, 0.22, 0.1), R, 8, 4), (36, 34, 40), 1)
        return
    if name == "train":
        for i in range(3):
            x = (i - 1) * 2.2
            S.add(box(P([x, 0.9, 0]), (2.0, 1.4, 1.2), R), (190, 60, 50) if i == 0 else (70, 110, 170), 1)
            S.add(box(P([x, 1.0, 0.61]), (1.5, 0.4, 0.04), R), (255, 232, 160), 1, emis=0.9)
        return
    if name == "plane":
        oc = (96, 108, 70)
        S.add(sphere(P([0, 0, 0]), (1.2, 0.22, 0.22), R, 10, 5), oc, 1)
        S.add(box(P([0, 0, 0]), (0.5, 0.04, 2.6), R), oc, 1)
        S.add(box(P([-1.0, 0.25, 0]), (0.3, 0.5, 0.05), R), oc, 1)
        return
    if name in ("eagle", "bird"):
        c = (92, 62, 44) if name == "eagle" else (80, 150, 220)
        fl = math.sin(ph * 1.6) * 0.3
        S.add(sphere(P([0, 0, 0]), (k * 0.2, k * 0.1, k * 0.1), R, 6, 4), c, 1)
        for sz in (-1, 1):
            S.add(box(P([0, fl * k * 0.5, sz * k * 0.35]), (k * 0.2, 0.02, k * 0.6), R @ np.array([[1, 0, 0], [0, math.cos(sz * fl), -math.sin(sz * fl)], [0, math.sin(sz * fl), math.cos(sz * fl)]])), shade(c, 0.9), 1)
