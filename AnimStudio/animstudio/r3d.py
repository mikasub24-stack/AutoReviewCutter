# -*- coding: utf-8 -*-
"""Che do 3D va Nguoi que 3D: bo ve da giac thuan numpy + Pillow (khong can GPU / Blender)."""
import math, random
import numpy as np
from PIL import Image, ImageDraw, ImageChops
from .common import clamp, h01
from .art import PAL, shade, mixc, vgrad

FOV = math.radians(38)
LIGHT = np.array([-0.45, 0.78, 0.55]); LIGHT /= np.linalg.norm(LIGHT)


def Rx(a):
    c, s = math.cos(a), math.sin(a); return np.array([[1, 0, 0], [0, c, -s], [0, s, c]])
def Ry(a):
    c, s = math.cos(a), math.sin(a); return np.array([[c, 0, s], [0, 1, 0], [-s, 0, c]])
def Rz(a):
    c, s = math.cos(a), math.sin(a); return np.array([[c, -s, 0], [s, c, 0], [0, 0, 1]])
I3 = np.eye(3)


# ------------------------------------------------------------ luoi da giac
class Mesh:
    __slots__ = ("V", "F", "col", "layer", "emis", "axis", "two")

    def __init__(self, V, F, col, layer=1, emis=0.0, axis=None, two=False):
        self.V, self.F, self.col, self.layer, self.emis, self.axis, self.two = V, F, col, layer, emis, axis, two


def sphere(c, r, R=I3, nu=10, nv=6, lat=(0.0, math.pi)):
    rx, ry, rz = r if hasattr(r, "__len__") else (r, r, r)
    th = np.linspace(lat[0], lat[1], nv + 1)
    ph = np.linspace(0, 2 * math.pi, nu, endpoint=False)
    T, P = np.meshgrid(th, ph, indexing="ij")
    V = np.stack([rx * np.sin(T) * np.cos(P), ry * np.cos(T), rz * np.sin(T) * np.sin(P)], -1).reshape(-1, 3)
    V = V @ R.T + np.asarray(c, float)
    F = []
    for i in range(nv):
        for j in range(nu):
            a, b = i * nu + j, i * nu + (j + 1) % nu
            F.append((a, b, b + nu, a + nu))
    return V, np.array(F)


def box(c, s, R=I3):
    x, y, z = s[0] / 2, s[1] / 2, s[2] / 2
    V = np.array([[-x, -y, -z], [x, -y, -z], [x, y, -z], [-x, y, -z], [-x, -y, z], [x, -y, z], [x, y, z], [-x, y, z]], float) @ R.T + np.asarray(c, float)
    F = np.array([(0, 1, 2, 3), (4, 5, 6, 7), (0, 1, 5, 4), (3, 2, 6, 7), (0, 3, 7, 4), (1, 2, 6, 5)])
    return V, F


def loft(rings, n=12, R=I3, origin=(0, 0, 0)):
    """rings = [(y, rx, rz, cx, cz)] -> mat tron/ elip chong len nhau."""
    ph = np.linspace(0, 2 * math.pi, n, endpoint=False)
    V = []
    for (y, rx, rz, cx, cz) in rings:
        V.append(np.stack([cx + rx * np.cos(ph), np.full(n, y), cz + rz * np.sin(ph)], -1))
    V = np.concatenate(V) @ R.T + np.asarray(origin, float)
    F = []
    for i in range(len(rings) - 1):
        for j in range(n):
            a, b = i * n + j, i * n + (j + 1) % n
            F.append((a, b, b + n, a + n))
    return V, np.array(F)


def limb(a, b, r0, r1, n=8):
    if not isinstance(n, int):
        n = 8
    a, b = np.asarray(a, float), np.asarray(b, float)
    d = b - a
    L = np.linalg.norm(d) or 1e-6
    d = d / L
    u = np.cross(d, [0, 0, 1.0])
    if np.linalg.norm(u) < 1e-3:
        u = np.cross(d, [1.0, 0, 0])
    u /= np.linalg.norm(u)
    v = np.cross(d, u)
    ph = np.linspace(0, 2 * math.pi, n, endpoint=False)
    ring = lambda p, r: p + r * (np.outer(np.cos(ph), u) + np.outer(np.sin(ph), v))
    V = np.concatenate([ring(a, r0), ring(b, r1)])
    F = np.array([(j, (j + 1) % n, n + (j + 1) % n, n + j) for j in range(n)])
    return V, F


class Scene3D:
    def __init__(self):
        self.m = []
        self.lights = []

    def add(self, vf, col, layer=1, emis=0.0, axis=None, two=False):
        V, F = vf
        self.m.append(Mesh(np.asarray(V, float), np.asarray(F), col, layer, emis, axis, two))

    def limb(self, a, b, r0, r1, col, layer=2, n=8, caps=True):
        self.add(limb(a, b, r0, r1, n), col, layer, axis=(np.asarray(a, float), np.asarray(b, float)))
        if caps:
            self.add(sphere(a, r0, nu=n, nv=4), col, layer)
            self.add(sphere(b, r1, nu=n, nv=4), col, layer)

    def extend(self, other):
        self.m += other.m
        self.lights += other.lights


# ------------------------------------------------------------ nhan vat 3D
def build_character(S, L, pose, X, stick=False, fix_col=None):
    age, fem, era, role = L["age"], L["gender"] == "f", L["era"], L["role"]
    k = {"child": 0.62, "old": 0.95}.get(age, 0.94 if fem else 1.0)
    hs = 1.4 if age == "child" else 1.0
    p = pose
    skin, hair = L["skin"], L["hair"]
    top, bottom, shoes = L.get("top", (120, 120, 120)), L.get("bottom", (60, 60, 70)), L.get("shoes", (40, 40, 40))
    trim = L.get("trim", shade(top, 1.25))
    style = L.get("style", "casual")
    if stick:
        c = fix_col
        top = bottom = skin = c
        shoes = c
    R0 = Ry(p.yaw * 0.6)
    base = np.array([X + p.dx * 0, 0.0, 0.0])
    W = lambda v: R0 @ np.asarray(v, float) + base
    hip_y = 0.90 * k + p.bob
    sh_h = 0.53 * k
    sh_x = (0.17 if fem else 0.205) * k
    Rt = Rx(p.lean * 0.9 + (0.08 if age == "old" else 0)) @ Rz(p.tilt * 0.3)
    pel = np.array([0, hip_y, 0.0])
    T = lambda v: W(pel + Rt @ np.asarray(v, float))
    walk = math.sin(p.walk) if p.walk else 0.0
    rl = 0.026 if stick else 1.0
    # ---- chan ----
    robe = style == "robe"
    for sx in (-1, 1):
        sw = walk * sx * 0.55
        hip = W([sx * 0.085 * k, hip_y, 0])
        th = 0.44 * k
        kn = hip + R0 @ np.array([0, -th * math.cos(sw), th * math.sin(sw)])
        bend = max(0.0, sw) * 0.9
        an = kn + R0 @ np.array([0, -0.43 * k * math.cos(bend), -0.43 * k * math.sin(bend) + 0.43 * k * math.sin(sw) * 0.0])
        an[1] = max(an[1], 0.06 * k)
        if not robe:
            col = bottom if style != "dress" else skin
            S.limb(hip, kn, (0.068 if not stick else rl) * k, (0.056 if not stick else rl) * k, col, n=8)
            S.limb(kn, an, (0.056 if not stick else rl) * k, (0.044 if not stick else rl) * k, col, n=8)
        if not stick:
            S.add(box(an + R0 @ np.array([0, -0.03 * k, 0.05 * k]), (0.1 * k, 0.07 * k, 0.24 * k), R0), shoes, 2)
        else:
            S.limb(an, an + R0 @ np.array([0, 0, 0.1 * k]), rl, rl, fix_col, n=6, caps=False)
    # ---- than ----
    if stick:
        S.limb(W(pel), T([0, sh_h, 0]), 0.03, 0.03, fix_col, n=6)
        S.limb(T([-sh_x, sh_h - 0.01, 0]), T([sh_x, sh_h - 0.01, 0]), 0.026, 0.026, fix_col, n=6)
    else:
        wi = 0.135 if fem else 0.15
        rings = [(0.0, wi * k, 0.09 * k, 0, 0), (0.22 * k, (wi - 0.01) * k, 0.085 * k, 0, 0), (0.42 * k, (sh_x - 0.01) * 1.0, 0.1 * k, 0, 0.0), (sh_h, sh_x * 0.98, 0.085 * k, 0, 0)]
        if robe:
            rings = [(0.0, 0.17 * k, 0.11 * k, 0, 0), (0.22 * k, 0.15 * k, 0.1 * k, 0, 0), (0.42 * k, sh_x, 0.11 * k, 0, 0), (sh_h, sh_x * 0.98, 0.09 * k, 0, 0)]
        V, F = loft(rings, 12, Rt, pel)
        V = (R0 @ V.T).T + base
        S.add((V, F), skin if style == "fur" else top, 2, axis=(W(pel), T([0, sh_h, 0])))
        if robe:   # tà áo dài tới gót
            V, F = loft([(-0.0, 0.18 * k, 0.12 * k, 0, 0), (-0.40 * k, 0.24 * k, 0.15 * k, 0, 0), (-0.84 * k, 0.30 * k, 0.18 * k, 0, 0)], 14, I3, pel)
            V = (R0 @ V.T).T + base
            S.add((V, F), shade(top, 0.9), 2, axis=(W(pel), W(pel + [0, -0.84 * k, 0])))
            V, F = loft([(0.0, 0.18 * k, 0.115 * k, 0, 0), (0.07 * k, 0.185 * k, 0.12 * k, 0, 0)], 12, Rt, pel + Rt @ [0, 0.0, 0])
            V = (R0 @ V.T).T + base
            S.add((V, F), trim, 2, axis=(W(pel), T([0, 0.07 * k, 0])))
            V, F = loft([(-0.84 * k, 0.30 * k, 0.18 * k, 0, 0), (-0.80 * k, 0.31 * k, 0.19 * k, 0, 0)], 14, I3, pel)
            V = (R0 @ V.T).T + base
            S.add((V, F), trim, 2, axis=(W(pel), W(pel + [0, -0.84 * k, 0])))
        elif style == "dress":
            V, F = loft([(0.0, 0.15 * k, 0.1 * k, 0, 0), (-0.25 * k, 0.22 * k, 0.15 * k, 0, 0), (-0.48 * k, 0.28 * k, 0.18 * k, 0, 0)], 14, I3, pel)
            V = (R0 @ V.T).T + base
            S.add((V, F), shade(top, 0.92), 2, axis=(W(pel), W(pel + [0, -0.48 * k, 0])))
        elif style == "fur":
            V, F = loft([(sh_h * 0.9, sh_x * 1.0, 0.098 * k, 0, 0), (0.42 * k, sh_x * 0.98, 0.108 * k, 0, 0), (0.0, 0.158 * k, 0.1 * k, 0, 0)], 12, Rt, pel)
            V = (R0 @ V.T).T + base
            S.add((V, F), top, 2, axis=(W(pel), T([0, sh_h, 0])))
            V, F = loft([(0.02, 0.16 * k, 0.1 * k, 0, 0), (-0.22 * k, 0.22 * k, 0.14 * k, 0, 0), (-0.45 * k, 0.27 * k, 0.17 * k, 0, 0)], 12, I3, pel)
            V = (R0 @ V.T).T + base
            S.add((V, F), top, 2, axis=(W(pel), W(pel + [0, -0.45 * k, 0])))
            if L.get("spots"):
                for q in range(7):
                    ang = -0.9 + q * 0.3
                    S.add(sphere(T([0.2 * k * math.sin(ang), 0.15 * k + 0.05 * k * (q % 3), 0.118 * k * math.cos(ang)]), (0.03 * k, 0.025 * k, 0.012 * k), R0 @ Rt, 6, 3), shade(top, 0.5), 3)
            for q in range(9):                                    # vong xuong
                a_ = math.pi * (0.12 + 0.76 * q / 8)
                S.add(sphere(T([math.cos(a_) * 0.1 * k, sh_h + 0.01 - math.sin(a_) * 0.05 * k, 0.1 * k]), 0.016 * k, I3, 5, 3), (240, 232, 214) if q != 4 else (200, 70, 50), 3)
            if L.get("fur_cape"):
                S.add(sphere(T([0, sh_h - 0.02, 0]), (sh_x * 1.5, 0.07 * k, 0.15 * k), R0 @ Rt, 10, 4), trim, 3)
            wp = L.get("weapon")
            if wp:
                bx = W([-0.5 * k, 0, 0.05])
                top_y = {"spear": 2.0, "club": 1.5, "staff": 1.9}[wp] * k
                S.limb(bx, bx + [0, top_y, 0], 0.02, 0.02, (120, 86, 56), layer=2, n=6, caps=False)
                if wp == "spear":
                    S.add(sphere(bx + [0, top_y + 0.08, 0], (0.035, 0.12, 0.012), I3, 6, 4), (150, 150, 158), 2)
                else:
                    S.add(sphere(bx + [0, top_y, 0], 0.07, I3, 6, 4), (240, 232, 214) if wp == "staff" else (96, 70, 46), 2)
        elif style == "uniform":
            V, F = loft([(0.0, 0.158 * k, 0.098 * k, 0, 0), (0.06 * k, 0.16 * k, 0.1 * k, 0, 0)], 12, Rt, pel)
            V = (R0 @ V.T).T + base
            S.add((V, F), (62, 44, 30), 2, axis=(W(pel), T([0, 0.06 * k, 0])))
            if L.get("gear"):
                S.add(box(W(pel + Rt @ [0, 0.3 * k, -0.15 * k]), (0.26 * k, 0.34 * k, 0.12 * k), R0 @ Rt), shade(top, 0.7), 2)
    # ---- co, dau ----
    neck_top = T([0, sh_h + 0.06 * k, 0])
    if not stick:
        S.limb(T([0, sh_h - 0.02, 0]), neck_top, 0.04 * k, 0.04 * k, shade(skin, 0.92), n=6, caps=False)
    Rh = R0 @ Rt @ Rx(p.nod) @ Rz(p.tilt * 0.7) @ Ry(p.gaze * 0.28)
    hrad = np.array([0.098, 0.122, 0.108]) * k * hs
    hc = neck_top + R0 @ Rt @ np.array([0, 0.105 * k * hs, 0.0])
    S.add(sphere(hc, hrad, Rh, 12, 8), skin, 2)
    # mat, may, mieng
    surf = lambda x, y: np.array([x * hrad[0], y * hrad[1], hrad[2] * math.sqrt(max(0.05, 1 - x * x - y * y))])
    ink = (24, 22, 30)
    eo = clamp(p.eye * (1 - p.blink * 0.92), 0.06, 1.5)
    for sx in (-1, 1):
        pe = surf(sx * 0.42 + p.gaze * 0.04, 0.12 + p.gaze_y * 0.1)
        if p.round > 0.3:
            S.add(sphere(hc + Rh @ (pe * 1.0), (0.027 * k * hs, 0.03 * k * hs * eo, 0.012 * k * hs), Rh, 8, 4), (248, 248, 248), 3)
            S.add(sphere(hc + Rh @ (pe * 1.01 + [p.gaze * 0.006, 0, 0.004]), (0.012 * k * hs, 0.014 * k * hs, 0.008 * k * hs), Rh, 6, 3), ink, 3)
        else:
            S.add(sphere(hc + Rh @ (pe * 1.0), (0.0145 * k * hs, 0.021 * k * hs * eo, 0.01 * k * hs), Rh, 8, 4), ink, 3)
        pb = surf(sx * 0.44, 0.12 + 0.36 + 0.06 * p.brow_h)
        ang = -sx * p.brow * 0.35 * -1
        S.add(box(hc + Rh @ pb * 1.0, (0.06 * k * hs, 0.011 * k * hs, 0.012 * k * hs), Rh @ Rz(ang * sx * -1 * -1)), shade(hair if L["age"] != "old" else (180, 180, 190), 0.8), 3)
        if p.smile > 0.4 or age == "child":
            pc = surf(sx * 0.6, -0.15)
            S.add(sphere(hc + Rh @ (pc * 1.0), (0.02 * k * hs, 0.012 * k * hs, 0.006 * k * hs), Rh, 6, 3), mixc(skin, (240, 110, 110), 0.5), 3)
    pm = surf(0.0, -0.45)
    mw = 0.03 * k * hs * (1 + 0.5 * p.smile) * clamp(p.mouth_w, 0.6, 1.5)
    if p.amp > 0.06 or p.round > 0.6:
        oh = (0.006 + 0.036 * p.amp + 0.012 * p.round) * k * hs
        S.add(box(hc + Rh @ (pm * 1.0 + [0, 0, 0.002]), (mw * 1.5, oh, 0.01 * k), Rh), (92, 28, 40), 3)
    else:
        S.add(box(hc + Rh @ (pm * 1.0 + [0, 0.004 * p.smile * k, 0.002]), (mw * 1.6, 0.007 * k * hs, 0.008 * k), Rh @ Rz(0)), (150, 60, 70), 3)
    S.add(sphere(hc + Rh @ surf(0, -0.05) * 1.0 + Rh @ [0, 0, 0.004], (0.012 * k * hs, 0.012 * k * hs, 0.016 * k * hs), Rh, 6, 3), shade(skin, 0.9), 3)
    for sx in (-1, 1):
        S.add(sphere(hc + Rh @ [sx * hrad[0] * 0.98, 0, -0.005], (0.012 * k * hs, 0.026 * k * hs, 0.018 * k * hs), Rh, 6, 3), shade(skin, 0.95), 2)
    # ---- toc ----
    hst = L.get("hair_style", "short")
    if stick:
        pass
    elif hst != "bald":
        rr = hrad * np.array([1.06, 1.05, 1.07])
        S.add(sphere(hc + Rh @ [0, 0.012 * k, -0.012 * k], rr, Rh, 12, 6, lat=(0, 1.25)), hair, 3)
        S.add(sphere(hc + Rh @ [0, -0.03 * k, -0.06 * k], rr * np.array([0.95, 0.92, 0.8]), Rh, 12, 6, lat=(1.2, 2.2)), hair, 2)
        if hst in ("long",):
            S.add(box(hc + Rh @ [0, -0.2 * k, -0.07 * k], (0.22 * k, 0.4 * k, 0.07 * k), Rh), hair, 2)
        if hst in ("topknot", "bun_pin", "bun"):
            S.add(sphere(hc + Rh @ [0, hrad[1] * 1.05, -0.01 * k], (0.05 * k, 0.05 * k, 0.05 * k), Rh, 8, 5), hair, 3)
            if hst == "bun_pin":
                S.add(box(hc + Rh @ [0, hrad[1] * 1.05, -0.01 * k], (0.16 * k, 0.01 * k, 0.01 * k), Rh @ Rz(0.2)), (232, 190, 80), 3)
        if hst == "wild":
            for q in range(7):
                a_ = -1.2 + q * 0.4
                S.add(sphere(hc + Rh @ [math.sin(a_) * hrad[0] * 1.15, hrad[1] * (0.7 + 0.35 * math.cos(a_)), -0.02 * k], (0.045 * k, 0.07 * k, 0.045 * k), Rh @ Rz(-a_ * 0.5), 6, 4), hair, 3)
            S.add(sphere(hc + Rh @ [0, -0.06 * k, -0.07 * k], (hrad[0] * 1.35, hrad[1] * 1.05, hrad[2] * 0.9), Rh, 10, 5), hair, 2)
        if hst == "braids":
            S.add(box(hc + Rh @ [0, -0.2 * k, -0.07 * k], (0.22 * k, 0.4 * k, 0.07 * k), Rh), hair, 2)
            for sx in (-1, 1):
                S.limb(hc + Rh @ [sx * hrad[0] * 1.05, -0.02, 0.0], hc + Rh @ [sx * hrad[0] * 1.2, -0.38 * k, 0.03 * k], 0.026 * k, 0.02 * k, hair, layer=3, n=6)
        if hst == "pig":
            for sx in (-1, 1):
                S.add(sphere(hc + Rh @ [sx * hrad[0] * 1.35, 0.0, -0.01], (0.05 * k, 0.07 * k, 0.05 * k), Rh, 8, 5), hair, 3)
    if L.get("beard") and not stick and era != "modern":
        old = age == "old"
        S.add(sphere(hc + Rh @ [0, -hrad[1] * 0.78, hrad[2] * 0.38], (hrad[0] * 0.78, 0.1 * k, hrad[2] * 0.62), Rh, 10, 5), (232, 232, 238) if old else shade(hair, 1.0), 3)
    # ---- mu non ----
    hat = L.get("hat", "")
    top_c = hc + R0 @ Rt @ [0, hrad[1] * 0.9, 0]
    if hat == "helmet":
        S.add(sphere(hc + Rh @ [0, 0.01, 0], hrad * np.array([1.2, 1.15, 1.2]), Rh, 12, 6, lat=(0, 1.45)), top, 3)
        V, F = loft([(0, 0.16 * k, 0.17 * k, 0, 0), (0.012, 0.16 * k, 0.17 * k, 0, 0)], 14, Rh, hc + Rh @ [0, hrad[1] * 0.3, 0.0])
        S.add((V, F), shade(top, 0.8), 3, axis=(hc, hc + [0, 0.01, 0]), two=True)
    elif hat == "cap":
        S.add(sphere(hc + Rh @ [0, 0.02, 0], hrad * np.array([1.12, 1.1, 1.14]), Rh, 12, 6, lat=(0, 1.4)), top, 3)
        S.add(box(hc + Rh @ [0, hrad[1] * 0.35, hrad[2] * 1.02], (0.2 * k, 0.012 * k, 0.1 * k), Rh), (40, 30, 24), 3)
    elif hat == "flatcap":
        S.add(sphere(hc + Rh @ [0, 0.03 * k, 0], hrad * np.array([1.1, 0.7, 1.15]), Rh, 12, 5, lat=(0, 1.5)), (86, 78, 70), 3)
    elif hat == "scarfhead":
        S.add(sphere(hc + Rh @ [0, 0.01, -0.005], hrad * np.array([1.12, 1.1, 1.12]), Rh, 12, 6, lat=(0, 1.55)), (150, 90, 84), 3)
    elif hat == "skull":
        S.add(sphere(hc + Rh @ [0, 0.02, 0], hrad * np.array([1.18, 1.1, 1.18]), Rh, 12, 6, lat=(0, 1.35)), (238, 230, 212), 3)
        for sx in (-1, 1):
            S.limb(hc + Rh @ [sx * hrad[0] * 1.05, hrad[1] * 0.8, 0], hc + Rh @ [sx * hrad[0] * 1.9, hrad[1] * 1.5, 0], 0.035 * k, 0.012 * k, (238, 230, 212), layer=3, n=6)
    elif hat == "feather":
        S.add(box(hc + Rh @ [0, hrad[1] * 0.5, 0], (hrad[0] * 2.15, 0.03 * k, hrad[2] * 2.1), Rh), (150, 60, 50), 3)
        for j, c_ in enumerate(((214, 60, 50), (240, 190, 60), (70, 150, 200), (214, 60, 50), (240, 190, 60))):
            a_ = (j - 2) * 0.3
            S.limb(hc + Rh @ [math.sin(a_) * 0.05, hrad[1] * 0.55, -0.02], hc + Rh @ [math.sin(a_) * 0.2, hrad[1] * 0.55 + 0.28 * k, -0.02], 0.022 * k, 0.03 * k, c_, layer=3, n=5)
    elif hat == "headband":
        S.add(box(hc + Rh @ [0, hrad[1] * 0.45, 0.0], (hrad[0] * 2.12, 0.025 * k, hrad[2] * 2.1), Rh), (150, 60, 50), 3)
        S.limb(hc + Rh @ [hrad[0] * 0.9, hrad[1] * 0.5, 0], hc + Rh @ [hrad[0] * 1.4, hrad[1] * 0.5 + 0.2 * k, 0], 0.012 * k, 0.03 * k, (240, 190, 60), layer=3, n=5)
    elif hat == "nonla":
        V, F = loft([(0.0, 0.34 * k, 0.34 * k, 0, 0), (0.17 * k, 0.0, 0.0, 0, 0)], 16, Rh, hc + Rh @ [0, hrad[1] * 0.35, 0.0])
        S.add((V, F), (214, 190, 120), 3, axis=(hc + Rh @ [0, hrad[1] * 0.35, 0], hc + Rh @ [0, hrad[1] * 0.35 + 0.17 * k, 0]), two=True)
    elif hat == "official":
        S.add(box(hc + Rh @ [0, hrad[1] * 1.1, 0], (0.2 * k, 0.13 * k, 0.2 * k), Rh), (24, 22, 30), 3)
        for sx in (-1, 1):
            S.add(box(hc + Rh @ [sx * 0.2 * k, hrad[1] * 1.15, -0.04 * k], (0.22 * k, 0.014 * k, 0.05 * k), Rh), (24, 22, 30), 3)
    elif hat == "crown":
        V, F = loft([(0, 0.105 * k, 0.11 * k, 0, 0), (0.07 * k, 0.11 * k, 0.115 * k, 0, 0)], 14, Rh, hc + Rh @ [0, hrad[1] * 0.75, 0])
        S.add((V, F), (232, 190, 72), 3, axis=(hc, hc + [0, 0.1, 0]), two=True)
        for j in range(5):
            a = j * 2 * math.pi / 5
            V, F = loft([(0, 0.022 * k, 0.022 * k, 0, 0), (0.07 * k, 0.0, 0.0, 0, 0)], 6, Rh, hc + Rh @ [0.1 * k * math.cos(a), hrad[1] * 0.75 + 0.07 * k, 0.1 * k * math.sin(a)])
            S.add((V, F), (240, 200, 80), 3, axis=(hc, hc + [0, 0.1, 0]))
    elif hat == "helm":
        S.add(sphere(hc + Rh @ [0, 0.01, 0], hrad * np.array([1.2, 1.18, 1.2]), Rh, 12, 6, lat=(0, 1.45)), (176, 150, 70), 3)
        S.add(box(hc + Rh @ [0, hrad[1] * 1.3, 0], (0.025 * k, 0.12 * k, 0.05 * k), Rh @ Rx(-0.2)), (200, 40, 40), 3)
    # ---- tay ----
    for side, ang in ((1, p.r_arm), (-1, p.l_arm)):
        fw, ab, el = (math.radians(a) for a in ang)
        fw *= 0.92
        sh = T([side * sh_x * 0.94, sh_h - 0.03 * k, 0])
        u = np.array([side * math.sin(ab) * math.cos(fw), -math.cos(ab) * math.cos(fw), math.sin(fw)])
        u /= np.linalg.norm(u)
        u = R0 @ Rt @ u
        el_pt = sh + u * 0.29 * k
        f = Rx(-el) @ (np.linalg.inv(R0 @ Rt) @ u)
        f = R0 @ Rt @ f
        f = f + R0 @ [-side * 0.22 * math.sin(el), 0, 0]
        f /= np.linalg.norm(f)
        wr = el_pt + f * 0.26 * k
        if robe and not stick:
            S.limb(sh, el_pt, 0.052 * k, 0.07 * k, top, n=8, caps=True)
            S.limb(el_pt, wr, 0.07 * k, 0.095 * k, top, n=8, caps=False)
            S.limb(wr - f * 0.02 * k, wr + f * 0.02 * k, 0.098 * k, 0.098 * k, trim, n=8, caps=False)
        elif stick:
            S.limb(sh, el_pt, rl, rl, fix_col, n=6)
            S.limb(el_pt, wr, rl, rl, fix_col, n=6)
        else:
            sl = L.get("style")
            S.limb(sh, el_pt, 0.048 * k, 0.042 * k, skin if style == "fur" else top, n=8)
            S.limb(el_pt, wr, 0.042 * k, 0.036 * k, (skin if style == "fur" else top) if (era != "modern" or h01(L["seed"], "sl") > 0.5) else skin, n=8, caps=False)
        if not stick:
            S.add(sphere(wr + f * 0.03 * k, 0.04 * k, I3, 8, 5), skin, 2)
        else:
            S.add(sphere(wr + f * 0.02, 0.03, I3, 6, 4), fix_col, 2)
    if L.get("gear") and style == "uniform" and not stick:                        # sung
        S.add(box(T([0.02, 0.35 * k, 0.15 * k]), (0.04 * k, 0.04 * k, 0.9 * k), R0 @ Rt @ Rx(0.0) @ Rz(0.0) @ Rx(0.0) @ Ry(0.0) @ Rz(0.0)), (50, 38, 28), 2)
    if stick:
        S.add(sphere(hc, hrad * 0.95, I3, 10, 6), fix_col, 2)


# ------------------------------------------------------------ phong nen 3D

def prim_scene(S, theme, P, night, rng):
    """Nguoi nguyen thuy: hang dong, dai hang, bo lac, thao nguyen + nui lua."""
    fire_col = (255, 150, 50)

    def fire(x, z, s=1.0):
        for j, (h, r) in enumerate(((0.8, 0.28), (0.55, 0.2), (0.3, 0.12))):
            S.add(loft([(0.1, r * s, r * s, x, z), (0.1 + h * s, 0.0, 0.0, x, z)], 7), [(214, 64, 30), (255, 150, 40), (255, 215, 100)][j], 1, emis=1.0, axis=((x, 0.1, z), (x, 0.1 + h * s, z)))
        for ang in (0.0, 1.0, 2.1):
            S.add(limb((x + math.cos(ang) * 0.45 * s, 0.06, z + math.sin(ang) * 0.45 * s), (x - math.cos(ang) * 0.45 * s, 0.12, z - math.sin(ang) * 0.45 * s), 0.05, 0.05, (80, 52, 34)), (80, 52, 34), 1)
        for a in range(8):
            S.add(sphere((x + math.cos(a * 0.8) * 0.62 * s, 0.1, z + math.sin(a * 0.8) * 0.62 * s), (0.14, 0.1, 0.14), I3, 6, 3), (110, 106, 102), 1)
        S.lights.append((np.array([x, 0.6, z]), fire_col, 4.6 * s, 0.9 if night else 0.45))

    def rock(x, y, z, r, col=None):
        S.add(sphere((x, y, z), (r, r * 0.7, r * 0.9), Ry(rng.uniform(0, 3)), 7, 4), col or shade(P["wall"], rng.uniform(0.7, 1.0)), 1)

    wall = P["wall"]
    if theme in ("room", "hall"):
        wz = -4.0 if theme == "room" else -6.0
        S.add(box((0, 3, wz - 0.3), (60, 6.5, 0.6)), shade(wall, 1.05), 0)
        for sx in (-1, 1):
            S.add(box((sx * 9, 3, wz / 2), (0.6, 6.5, abs(wz) + 3)), shade(wall, 0.6), 0)
        S.add(box((0, 6.2, wz / 2), (60, 0.6, abs(wz) + 6)), shade(wall, 0.45), 0)
        for _ in range(60):
            rock(rng.uniform(-14, 14), rng.uniform(0.3, 5.5), wz + rng.uniform(0.0, 0.4), rng.uniform(0.5, 1.4), shade(wall, rng.uniform(0.8, 1.3)))
        for _ in range(26):                                         # nhu da
            x = rng.uniform(-12, 12); hh = rng.uniform(0.7, 2.2)
            S.add(loft([(6.0, 0.35, 0.35, x, wz + rng.uniform(0.2, 2.5)), (6.0 - hh, 0.0, 0.0, x, wz + 0.5)], 6), shade(wall, 0.8), 0)
        if theme == "room":
            S.add(box((5.3, 1.7, wz + 0.3), (2.4, 3.4, 0.2)), P["sky"][1] if not night else (30, 20, 40), 0, emis=0.9 if not night else 0.3)
            fire(0.0, -0.8)
            for bx in (-4.2, 2.8):
                rock(bx, 0.4, -2.0, 0.9)
            for a in range(6):
                S.add(box((-1.8 + a * 0.12, 0.05, -0.2), (0.05, 0.04, 0.22), Ry(a)), (236, 228, 208), 1)
        else:
            for x in (-6.5, -2.5, 2.5, 6.5):
                S.add(loft([(0, 1.1, 0.9, x, wz + 1.5), (3, 0.6, 0.5, x, wz + 1.5), (6.2, 1.0, 0.8, x, wz + 1.5)], 8), shade(wall, 0.85), 1, axis=((x, 0, wz + 1.5), (x, 6.2, wz + 1.5)))
            S.add(box((0, 0.5, wz + 1.2), (3.0, 1.0, 1.6)), (120, 106, 96), 1); S.add(box((0, 1.4, wz + 1.2), (2.0, 0.9, 1.2)), (142, 126, 114), 1)
            for sx in (-1, 1):
                S.add(limb((sx * 1.7, 1.0, wz + 1.2), (sx * 2.2, 2.6, wz + 1.2), 0.18, 0.04, (240, 232, 212)), (240, 232, 212), 1)
            fire(-3.4, -1.0); fire(3.4, -1.0)
            for x in (-8, 8):
                S.add(limb((x, 0, wz + 2.0), (x, 2.6, wz + 2.0), 0.1, 0.1, (110, 78, 50)), (110, 78, 50), 1)
                S.add(sphere((x, 2.8, wz + 2.0), (0.3, 0.26, 0.28), I3, 8, 5), (240, 232, 212), 1)
                S.lights.append((np.array([x, 3.2, wz + 2.0]), fire_col, 3.2, 0.7))
    elif theme == "street":
        for i, x in enumerate((-9, -4.5, 4.8, 9.5, -14, 14)):
            z = -6.5 - (i % 2) * 2.5
            S.add(loft([(0, 1.9, 1.9, x, z), (3.4, 0.12, 0.12, x, z)], 8), shade((176, 130, 86), 0.7 if night else 1.0), 1, axis=((x, 0, z), (x, 3.4, z)))
            S.add(box((x, 0.8, z + 1.5), (0.8, 1.5, 0.1)), (30, 20, 16), 1)
        for x in (-1.8, 6.5):
            S.add(limb((x, 0, -4.5), (x, 3.0, -4.5), 0.2, 0.2, (110, 78, 50)), (110, 78, 50), 1)
            for k_, c_ in enumerate(((190, 80, 54), (240, 220, 180), (80, 120, 150))):
                S.add(box((x, 0.6 + k_ * 0.9, -4.3), (0.9, 0.75, 0.5)), c_, 1)
        fire(0.0, -3.0, 1.1)
        S.add(loft([(0, 14, 9, -3, -30), (5, 4, 3, -3, -30), (8, 1.4, 1.0, -3, -30)], 10), shade(P["far"], 0.8), 0)
        S.add(sphere((-3, 8, -30), (1.6, 0.4, 1.2), I3, 8, 3), (255, 110, 40), 0, emis=1.0)
        S.lights.append((np.array([-3.0, 8.0, -30.0]), (255, 110, 40), 18, 0.9 if night else 0.3))
    else:   # outdoor
        S.add(loft([(0, 30, 22, 8, -34), (9, 8, 6, 8, -34), (15, 2.2, 1.8, 8, -34)], 12), shade(P["far"], 0.8), 0)
        S.add(sphere((8, 15.2, -34), (2.4, 0.6, 1.9), I3, 8, 3), (255, 110, 40), 0, emis=1.0)
        S.lights.append((np.array([8.0, 15.0, -34.0]), (255, 100, 30), 22, 1.0 if night else 0.35))
        for i in range(8):
            x = -50 + i * 14 + rng.uniform(-3, 3); h_ = rng.uniform(6, 12)
            S.add(loft([(0, 10, 7, x, -40), (h_, 1.5, 1.0, x, -40)], 8), P["far"] if i % 2 else P["mid"], 0)
        for x, z in ((-7, -8), (3, -11), (9, -7)):
            S.add(limb((x, 0, z), (x + 0.3, 2.4, z), 0.2, 0.12, shade(P["ink"], 2.2)), shade(P["ink"], 2.2), 1)
            S.add(sphere((x + 0.3, 2.7, z), (2.0, 0.35, 1.6), I3, 10, 4), shade((90, 124, 60), 0.5 if night else 1.0), 1)
        for i in range(60):
            x, z = rng.uniform(-12, 12), -rng.uniform(1.5, 12)
            S.add(limb((x, 0, z), (x + rng.uniform(-0.15, 0.15), rng.uniform(0.4, 0.9), z), 0.025, 0.004, shade((176, 160, 90), 0.5 if night else 1.0), ), (150, 140, 80), 1) if False else None
            S.add(loft([(0, 0.07, 0.03, x, z), (rng.uniform(0.4, 0.9), 0.0, 0.0, x, z)], 4), shade((176, 160, 90) if i % 3 else (120, 150, 70), 0.5 if night else 1.0), 1)
        for i, mx in enumerate((-9, -6.5, -4.5)):
            col = shade(P["mid"], 0.5)
            S.add(sphere((mx, 1.3, -16), (1.4, 1.0, 0.8), I3, 8, 5), col, 1); S.add(sphere((mx + 1.3, 1.5, -16), (0.6, 0.6, 0.5), I3, 8, 4), col, 1)
        for _ in range(7):
            rock(rng.uniform(-8, 8), 0.2, -rng.uniform(2, 8), rng.uniform(0.4, 1.0), shade((128, 118, 108), 0.6 if night else 1.0))


def build_scene(era, theme, night, rain, seed=1):
    pal = PAL[(era, night)]
    S = Scene3D()
    rng = random.Random(hash((era, theme, night)) % 9999 + seed)
    P = pal
    W_ = 48
    # san (tam kiem soat bang day dai de co chieu sau)
    fl = P["floor"]
    for i in range(-30, 12):
        c = shade(fl, 1.0 if i % 2 else 0.92) if era != "war" else shade(fl, rng.uniform(0.85, 1.08))
        S.add(box((0, -0.05, i * 1.0), (W_ * 2, 0.1, 1.0)), c, 0)
    if era == "ancient":
        prim_scene(S, theme, P, night, rng)
        return S
    walls = theme in ("room", "hall")
    wz = -3.6 if theme == "room" else -5.2
    wall = P["wall"]
    ink = P["ink"]
    emis_c = mixc(P["accent"], (255, 255, 255), 0.3)

    def lamp(x, y, z, col=None, r=2.6, k=0.8):
        S.lights.append((np.array([x, y, z]), col or P["accent"], r, k))

    if walls:
        S.add(box((0, 2.5, wz - 0.15), (60, 5.0, 0.3)), wall, 0)
        S.add(box((0, 0.55, wz + 0.02), (60, 1.1, 0.06)), shade(wall, 0.84), 0)
        S.add(box((0, 5.1, wz + 1.5), (60, 0.2, 3.5)), shade(wall, 0.6), 0)
        for sx in (-1, 1):
            S.add(box((sx * 9, 2.5, wz / 2), (0.3, 5, abs(wz) + 2)), shade(wall, 0.85), 0)
    # ---- mau theo thoi dai ----
    if theme == "room":
        if era == "modern":
            S.add(box((-1.7, 1.9, wz + 0.05), (1.7, 1.5, 0.05)), P["sky"][1] if not night else (30, 50, 100), 0, emis=0.9 if night else 0.5)
            S.add(box((-1.7, 1.9, wz + 0.09), (1.8, 0.08, 0.06)), ink, 1); S.add(box((-1.7, 1.9, wz + 0.09), (0.07, 1.6, 0.06)), ink, 1)
            S.add(box((-1.7, 1.9, wz + 0.09), (1.8, 1.6, 0.04)), (0, 0, 0), 0, emis=0.0) if False else None
            S.add(box((-2.7, 1.8, wz + 0.25), (0.45, 2.2, 0.15)), (150, 80, 110) if night else (190, 90, 90), 1)
            S.add(box((-0.7, 1.8, wz + 0.25), (0.45, 2.2, 0.15)), (150, 80, 110) if night else (190, 90, 90), 1)
            S.add(box((2.2, 1.1, wz + 0.4), (1.9, 2.1, 0.5)), (110, 76, 54) if not night else (74, 52, 40), 1)
            for r_ in range(4):
                for c_ in range(10):
                    S.add(box((1.4 + c_ * 0.17, 0.5 + r_ * 0.5, wz + 0.7), (0.12, 0.38, 0.1)), rng.choice([(190, 70, 70), (70, 120, 170), (220, 190, 90), (90, 150, 110)]), 1)
            S.add(limb((0.7, 0, wz + 0.8), (0.7, 1.55, wz + 0.8), 0.02, 0.02, 0) if False else (np.zeros((1, 3)), np.zeros((1, 4), int)), (0, 0, 0), 0)
            S.add(loft([(0, 0.02, 0.02, 0, 0), (1.5, 0.02, 0.02, 0, 0)], 6, I3, (0.7, 0, wz + 0.8)), (40, 40, 46), 1)
            S.add(loft([(1.4, 0.3, 0.3, 0, 0), (1.7, 0.16, 0.16, 0, 0)], 10, I3, (0.7, 0, wz + 0.8)), mixc(P["accent"], (255, 255, 255), 0.4), 1, emis=1.0)
            lamp(0.7, 1.55, wz + 0.8, r=3.5, k=1.0 if night else 0.3)
            S.add(sphere((0, 0.02, -0.4), (1.7, 0.02, 1.1), I3, 18, 3), shade((190, 90, 80), 0.6 if night else 1.0), 1)
            S.add(sphere((4.2, 0.4, wz + 0.8), (0.35, 0.4, 0.35), I3, 8, 5), (180, 100, 70), 1)
            S.add(sphere((4.2, 1.0, wz + 0.8), (0.55, 0.6, 0.55), I3, 10, 6), shade((70, 150, 90), 0.6 if night else 1.0), 1)
        elif era == "imperial":
            for sx in (-3.6, 3.6):
                S.add(loft([(0, 0.2, 0.2, 0, 0), (4.6, 0.2, 0.2, 0, 0)], 12, I3, (sx, 0, wz + 0.5)), (150, 34, 34), 1, axis=((sx, 0, wz + 0.5), (sx, 4.6, wz + 0.5)))
                S.add(box((sx, 4.5, wz + 0.5), (0.6, 0.25, 0.6)), (214, 170, 70), 1)
            for cx in (-1.8, 0.0, 1.8):
                S.add(box((cx, 2.1, wz + 0.05), (1.6, 2.0, 0.05)), (255, 210, 130) if night else (250, 232, 190), 0, emis=0.95)
                for q in range(-2, 3):
                    S.add(box((cx + q * 0.32, 2.1, wz + 0.09), (0.04, 2.0, 0.04)), (96, 46, 36), 1)
                for q in range(-2, 3):
                    S.add(box((cx, 2.1 + q * 0.4, wz + 0.09), (1.6, 0.04, 0.04)), (96, 46, 36), 1)
                if night: lamp(cx, 2.1, wz + 1.0, (255, 150, 70), 3.2, 0.55)
            S.add(sphere((0, 0.02, -0.4), (1.9, 0.02, 1.2), I3, 18, 3), shade((130, 36, 40), 0.8 if night else 1.0), 1)
            for lx in (-2.8, 0.9, 2.8):
                S.add(sphere((lx, 3.3, wz + 1.2), (0.28, 0.34, 0.28), I3, 10, 6), (214, 48, 40), 1, emis=0.8)
                lamp(lx, 3.3, wz + 1.2, (255, 130, 60), 2.6, 0.6)
        else:
            S.add(box((-2.3, 1.8, wz + 0.1), (1.5, 1.1, 0.1)), (210, 196, 158), 1)
            S.add(box((0.3, 1.6, wz + 0.1), (1.7, 1.2, 0.08)), (214, 200, 160), 1)
            S.add(box((-2.0, 0.25, wz + 0.8), (0.5, 0.5, 0.5)), (112, 80, 48), 1); S.add(box((-1.3, 0.25, wz + 0.8), (0.5, 0.5, 0.5)), (112, 80, 48), 1)
            for r_ in range(3):
                for c_ in range(6):
                    S.add(sphere((2.4 + c_ * 0.5 + (r_ % 2) * 0.25, 0.14 + r_ * 0.26, wz + 1.0), (0.26, 0.14, 0.16), I3, 8, 4), shade((150, 134, 98), 0.8 + 0.1 * ((r_ + c_) % 3)), 1)
            for bx in (-1.2, 2.2):
                S.add(loft([(0, 0.01, 0.01, 0, 0), (2.6, 0.01, 0.01, 0, 0)], 4, I3, (bx, 2.4, wz + 1.2)), (20, 20, 20), 1) if False else None
                S.add(sphere((bx, 3.4, wz + 1.2), 0.1, I3, 8, 5), (255, 220, 150), 1, emis=1.0)
                lamp(bx, 3.4, wz + 1.2, (255, 200, 120), 3.6, 0.9)
    elif theme == "hall":
        if era == "modern":
            for i in range(4):
                cx = -6.4 + i * 4.3
                S.add(box((cx, 2.6, wz + 0.05), (2.1, 3.0, 0.05)), P["sky"][1] if not night else (36, 56, 110), 0, emis=0.85)
                S.add(box((cx, 2.6, wz + 0.1), (0.08, 3.1, 0.06)), ink, 1); S.add(box((cx, 2.6, wz + 0.1), (2.2, 0.08, 0.06)), ink, 1)
                S.add(box((cx + 2.15, 2.5, wz + 0.3), (0.6, 5.0, 0.5)), shade(wall, 0.9), 1)
                S.add(box((cx, 0.35, wz + 0.8), (2.0, 0.1, 0.55)), shade(P["near"], 1.3), 1); S.add(box((cx, 0.62, wz + 0.55), (2.0, 0.5, 0.1)), shade(P["near"], 1.0), 1)
                S.add(box((cx, 4.4, wz + 1.0), (1.4, 0.08, 0.3)), (244, 240, 224), 1, emis=1.0)
                lamp(cx, 4.3, wz + 1.0, P["accent"] if night else (255, 255, 240), 3.8, 0.7 if night else 0.2)
        elif era == "imperial":
            for sx in (-6, -3.2, 3.2, 6):
                S.add(loft([(0, 0.34, 0.34, 0, 0), (4.8, 0.34, 0.34, 0, 0)], 14, I3, (sx, 0, wz + 1.2)), (166, 36, 36), 1, axis=((sx, 0, wz + 1.2), (sx, 4.8, wz + 1.2)))
                S.add(box((sx, 4.7, wz + 1.2), (0.95, 0.4, 0.95)), (222, 176, 72), 1); S.add(box((sx, 0.2, wz + 1.2), (0.95, 0.4, 0.95)), (222, 176, 72), 1)
            S.add(sphere((0, 2.5, wz + 0.1), (1.9, 1.9, 0.1), I3, 24, 8), (196, 150, 56), 1, emis=0.2)
            for k_ in range(4):
                S.add(box((0, 0.1 + k_ * 0.18, wz + 1.6 - k_ * 0.35), (4.2 - k_ * 0.5, 0.18, 0.7)), shade((150, 28, 34), 1.0 - 0.06 * k_), 1)
            S.add(box((0, 1.3, wz + 0.9), (1.0, 0.8, 0.9)), (190, 40, 40), 1); S.add(box((0, 1.0, wz + 0.9), (1.2, 0.2, 0.9)), (222, 176, 72), 1)
            S.add(box((0, 0.01, 0.8), (2.4, 0.04, 14)), shade((150, 28, 34), 0.8 if night else 1.0), 1)
            for lx in (-4.6, -1.8, 1.8, 4.6):
                S.add(sphere((lx, 3.5, wz + 2.2), (0.3, 0.38, 0.3), I3, 10, 6), (214, 44, 38), 1, emis=0.85)
                lamp(lx, 3.5, wz + 2.2, (255, 130, 60), 2.8, 0.6)
        else:
            for sx in (-6, -2, 2, 6):
                S.add(box((sx, 2.5, wz + 0.3), (0.2, 5, 0.35)), shade(P["ink"], 2.8), 1)
            for bx in (-5.5, 5.0):
                for lv in (0.5, 1.6):
                    S.add(box((bx, lv, wz + 1.0), (2.4, 0.08, 1.0)), (70, 74, 60), 1)
                    S.add(box((bx, lv + 0.1, wz + 1.0), (2.2, 0.1, 0.9)), (120, 110, 80), 1)
                for q in (-1.2, 1.2): S.add(box((bx + q, 1.0, wz + 1.0), (0.08, 2.2, 0.08)), (40, 42, 36), 1)
            S.add(box((0, 0.8, wz + 1.2), (1.8, 0.08, 0.9)), (96, 68, 44), 1)
            for q in (-0.8, 0.8): S.add(box((q, 0.4, wz + 1.2), (0.08, 0.8, 0.08)), (70, 50, 34), 1)
            S.add(box((0, 0.86, wz + 1.2), (1.2, 0.02, 0.6)), (214, 200, 160), 1)
            for lx in (-3.6, 0.0, 3.6):
                S.add(sphere((lx, 3.6, wz + 1.0), 0.1, I3, 8, 5), (255, 220, 150), 1, emis=1.0)
                lamp(lx, 3.6, wz + 1.0, (255, 200, 120), 3.6, 0.9)
    elif theme == "street":
        for sd in (0, 1):
            for i in range(14):
                x = -18 + i * 3.4 + rng.uniform(-0.3, 0.3)
                z = -7 - sd * 8 - rng.uniform(0, 1.5)
                if era == "modern":
                    h = rng.uniform(4, 11) + sd * 3
                    S.add(box((x, h / 2, z), (3.0, h, 3.0)), shade(P["mid"] if sd == 0 else P["far"], rng.uniform(0.85, 1.1)), 0)
                    for wy in np.arange(1.2, h - 0.5, 1.1):
                        for wx in (-0.9, 0.0, 0.9):
                            if rng.random() < (0.45 if night else 0.9):
                                S.add(box((x + wx, wy, z + 1.52), (0.5, 0.55, 0.04)), (255, 214, 140) if night else (200, 230, 245), 0, emis=0.9 if night else 0.3)
                elif era == "imperial":
                    h = rng.uniform(2.5, 3.6)
                    S.add(box((x, h / 2, z), (3.0, h, 2.6)), shade(P["wall"], rng.uniform(0.78, 0.95)), 0)
                    S.add(loft([(h, 2.5, 2.1, 0, 0), (h + 1.3, 1.0, 0.5, 0, 0)], 4, Ry(math.pi / 4), (x, 0, z)), (70, 62, 66), 0, axis=((x, h, z), (x, h + 1.3, z)))
                    S.add(box((x, h + 0.02, z), (3.8, 0.1, 3.2)), (200, 160, 70), 0)
                    S.add(box((x, 1.3, z + 1.32), (0.8, 0.9, 0.04)), (255, 202, 120) if night else (190, 210, 214), 0, emis=0.8 if night else 0.2)
                    if sd == 0:
                        S.add(sphere((x, 3.1, z + 1.8), (0.2, 0.26, 0.2), I3, 8, 5), (214, 44, 38), 1, emis=0.85)
                        if night: lamp(x, 3.1, z + 1.8, (255, 130, 60), 2.0, 0.5)
                else:
                    h = rng.uniform(3, 10)
                    S.add(box((x, h / 2, z), (3.0, h, 3.0)), shade(P["mid"] if sd == 0 else P["far"], rng.uniform(0.8, 1.05)), 0)
                    S.add(box((x + rng.uniform(-0.8, 0.8), h, z), (1.6, rng.uniform(0.3, 0.9), 2.4), Rz(rng.uniform(-0.5, 0.5))), shade(P["mid"], 0.7), 0)
                    for _ in range(4):
                        if rng.random() < 0.7:
                            S.add(box((x + rng.uniform(-1, 1), rng.uniform(1, h - 1), z + 1.52), (0.5, 0.6, 0.04)), (255, 150, 70) if night and rng.random() < 0.3 else shade(P["ink"], 1.5), 0, emis=0.7 if night else 0.0)
        if era == "war":
            for hx in (-3.6, 4.4):
                for a_ in (0.0, 1.0, 2.0):
                    S.add(box((hx, 0.5, -1.4), (0.08, 1.1, 0.08), Ry(0.6) @ Rz(a_ * 1.05)), shade(ink, 2.2), 1)
            for r_ in range(3):
                for c_ in range(6):
                    S.add(sphere((3.0 + c_ * 0.5 + (r_ % 2) * 0.25, 0.14 + r_ * 0.26, -2.6), (0.26, 0.14, 0.16), I3, 8, 4), shade((150, 134, 98), 0.8 + 0.1 * ((r_ + c_) % 3)), 1)
            lamp(0, 2.5, -10, P["accent"], 14, 0.9 if night else 0.3)
            lamp(-9, 3.0, -9, P["accent"], 10, 0.6 if night else 0.2)
        else:
            for lx in (-6, 0.5, 7):
                S.add(loft([(0, 0.05, 0.05, 0, 0), (4.0, 0.04, 0.04, 0, 0)], 6, I3, (lx, 0, -3.4)), shade(ink, 1.7), 1, axis=((lx, 0, -3.4), (lx, 4, -3.4)))
                S.add(sphere((lx, 4.05, -3.4), (0.28, 0.14, 0.28), I3, 8, 4), (255, 240, 200), 1, emis=1.0)
                lamp(lx, 4.0, -3.4, P["accent"] if night else (255, 250, 230), 4.6, 0.9 if night else 0.2)
    else:   # outdoor
        for i in range(10):
            x = -44 + i * 10 + rng.uniform(-3, 3)
            hgt = rng.uniform(5, 11)
            col = P["far"] if i % 2 else P["mid"]
            S.add(loft([(0, 9, 6, 0, 0), (hgt * 0.5, 5.5, 3.5, 0, 0), (hgt, 1.2, 0.8, 0, 0)], 10, I3, (x, 0, -28 - rng.uniform(0, 6))), col, 0, axis=((x, 0, -30), (x, hgt, -30)))
        for i in range(16):
            x = rng.uniform(-14, 14)
            z = -rng.uniform(5, 14)
            if era == "war":
                S.add(limb((x, 0, z), (x, rng.uniform(2.5, 4), z), 0.12, 0.04, shade(ink, 2.4)), shade(ink, 2.4), 1)
                for b_ in range(3):
                    y0 = rng.uniform(1.5, 3)
                    S.add(limb((x, y0, z), (x + rng.uniform(-1, 1), y0 + rng.uniform(0.5, 1.2), z), 0.05, 0.015, shade(ink, 2.4)), shade(ink, 2.4), 1)
            elif era == "imperial":
                hh = rng.uniform(3, 5)
                S.add(loft([(0.5, 0.9, 0.9, 0, 0), (hh * 0.6, 0.5, 0.5, 0, 0), (hh, 0.0, 0.0, 0, 0)], 8, I3, (x, 0, z)), shade((60, 100, 80), 0.6 if night else 1.0), 1, axis=((x, 0, z), (x, hh, z)))
                S.add(limb((x, 0, z), (x, 0.6, z), 0.08, 0.08, (80, 56, 40)), (80, 56, 40), 1)
            else:
                S.add(limb((x, 0, z), (x, 1.5, z), 0.14, 0.1, (96, 70, 50)), (96, 70, 50), 1)
                S.add(sphere((x, 2.6, z), (1.3, 1.2, 1.3), I3, 10, 6), shade((70, 150, 80), 0.5 if night else 1.0), 1)
        if era == "war":
            for r_ in range(2):
                for c_ in range(30):
                    S.add(sphere((-14 + c_ * 0.5 + (r_ % 2) * 0.25, 0.14 + r_ * 0.26, -3.2), (0.26, 0.14, 0.17), I3, 8, 4), shade((150, 134, 98), 0.75 + 0.1 * ((r_ + c_) % 3)), 1)
            lamp(-6, 2.0, -26, P["accent"], 26, 1.0 if night else 0.35)
            lamp(10, 2.0, -26, P["accent"], 20, 0.8 if night else 0.3)
        elif era == "imperial":
            S.lights.append((np.array([8, 9, -30.0]), (255, 230, 170), 20, 0.7))
            S.add(box((-7, 0.9, -5.0), (0.2, 1.6, 0.2)), (150, 34, 34), 1)
            S.add(box((-7, 2.0, -5.0), (3.0, 0.2, 2.5), Rz(0.0)), (70, 56, 56), 1)
        else:
            S.add(box((0, 0.02, -4.2), (3.0, 0.03, 30), Ry(0.0)), shade((200, 176, 130), 0.5 if night else 1.0), 1)
    return S


_scene_cache = {}


def get_scene(era, theme, night, rain):
    k = (era, theme, night)
    if k not in _scene_cache:
        if len(_scene_cache) > 3:
            _scene_cache.pop(next(iter(_scene_cache)))
        _scene_cache[k] = build_scene(era, theme, night, rain)
    return _scene_cache[k]


# ------------------------------------------------------------ ve
_glow_cache = {}


def _glow_sprite(n):
    if n not in _glow_cache:
        yy, xx = np.mgrid[-n:n + 1, -n:n + 1]
        d = np.sqrt(xx * xx + yy * yy) / n
        _glow_cache[n] = (np.clip(1 - d, 0, 1) ** 2).astype(np.float32)
    return _glow_cache[n]


def add_glow(img, x, y, r, col, k):
    r = int(r)
    if r < 4 or r > 1500:
        return
    x, y = int(x), int(y)
    x0, y0, x1, y1 = max(0, x - r), max(0, y - r), min(img.width, x + r + 1), min(img.height, y + r + 1)
    if x1 <= x0 or y1 <= y0:
        return
    n = max(r // 4, 4)
    sp = _glow_sprite(n)
    sp = np.asarray(Image.fromarray((sp * 255).astype(np.uint8)).resize((2 * r + 1, 2 * r + 1), Image.BILINEAR)).astype(np.float32) / 255
    sp = sp[y0 - (y - r):y1 - (y - r), x0 - (x - r):x1 - (x - r)]
    reg = np.asarray(img.crop((x0, y0, x1, y1))).astype(np.float32)
    reg = 255 - (255 - reg) * (1 - sp[..., None] * k * np.array(col, np.float32) / 255)
    img.paste(Image.fromarray(np.clip(reg, 0, 255).astype(np.uint8)), (x0, y0))


STICK_COLS = [(255, 214, 90), (120, 220, 255), (255, 130, 140), (150, 255, 170), (210, 160, 255), (255, 170, 80), (240, 240, 250)]


def render3d(P, t, cam, W=None, H=None, stick=False):
    W, H = W or P.W, H or P.H
    from .pose import pose_at
    si = P.scene_index(t)
    sc = P.scenes[si]
    pal = PAL[(sc.era, sc.night)]
    scene = Scene3D()
    base = get_scene(sc.era, sc.theme, sc.night, sc.rain)
    scene.extend(base)
    fx, fh, zoom, az = (float(v) for v in cam)
    names = [n for n in sc.cast if t >= sc.cast[n]["enter"]]
    for n in names:
        pose = pose_at(P, n, t)
        if not pose.visible:
            continue
        col = STICK_COLS[list(P.script.chars).index(n) % len(STICK_COLS)] if stick else None
        build_character(scene, P.looks[n], pose, sc.cast[n]["sx"] + pose.dx, stick, col)
    from .extras import build_extra_3d, INFO
    for c in P.cues:
        if c.kind == "extra" and c.start <= t <= c.end:
            u = (t - c.start) / max(c.end - c.start, 0.1)
            k0, mv, spd, hgt = INFO[c.name]
            wx = c.x0 + (c.x1 - c.x0) * u
            build_extra_3d(scene, c.name, (wx, hgt, -(2.2 + c.lane * 1.5)), 1 if c.x1 >= c.x0 else -1, t, c.seed * 0.13)
    # camera
    dist = (3.6 / zoom) / (2 * math.tan(FOV / 2))
    tgt = np.array([fx, fh, 0.0])
    pos = tgt + np.array([math.sin(az) * dist, 0.22 + dist * 0.045, math.cos(az) * dist])
    fwd = tgt - pos; fwd /= np.linalg.norm(fwd)
    right = np.cross(fwd, [0, 1, 0]); right /= np.linalg.norm(right)
    up = np.cross(right, fwd)
    f = (H / 2) / math.tan(FOV / 2)
    ss = 2 if W * H <= 1_000_000 else 1
    Ws, Hs = W * ss, H * ss
    # nen troi
    sky = vgrad(W, H, pal["sky"][0], pal["sky"][1]).convert("RGB")
    rngs = random.Random(5)
    if sc.night:
        dsk = ImageDraw.Draw(sky)
        for _ in range(120):
            x, y = rngs.uniform(0, W), rngs.uniform(0, H * 0.5)
            dsk.ellipse([x - 1, y - 1, x + 1, y + 1], fill=(255, 255, 240))
    img = sky.resize((Ws, Hs), Image.BILINEAR)
    # gom mesh
    allV, allF, cols, lay, emis, ins, twos = [], [], [], [], [], [], []
    off = 0
    for m in scene.m:
        V, F = m.V, m.F
        if len(F) == 0:
            continue
        allV.append(V); allF.append(F + off); off += len(V)
        cols.append(np.tile(np.array(m.col, np.float32), (len(F), 1)))
        lay.append(np.full(len(F), m.layer)); emis.append(np.full(len(F), m.emis, np.float32)); twos.append(np.full(len(F), m.two))
        if m.axis is not None:
            a, b = (np.asarray(q, float) for q in m.axis)
            c = V[F].mean(1)
            ab = b - a
            tt = np.clip(((c - a) @ ab) / max(float(ab @ ab), 1e-9), 0, 1)
            ins.append(a + tt[:, None] * ab)
        else:
            ins.append(np.tile(V.mean(0), (len(F), 1)))
    V = np.concatenate(allV); F = np.concatenate(allF); cols = np.concatenate(cols); lay = np.concatenate(lay)
    emis = np.concatenate(emis); ins = np.concatenate(ins); twos = np.concatenate(twos)
    rel = V - pos
    xc, yc, zc = rel @ right, rel @ up, rel @ fwd
    zc_s = np.maximum(zc, 0.05)
    sx_ = Ws / 2 + f * ss * xc / zc_s
    sy_ = Hs / 2 - f * ss * yc / zc_s
    PV = F  # (M,4)
    ok = (zc[PV] > 0.1).all(1)
    p3 = V[PV]
    n = np.cross(p3[:, 1] - p3[:, 0], p3[:, 2] - p3[:, 0])
    bad = np.linalg.norm(n, axis=1) < 1e-9
    n2 = np.cross(p3[:, 2] - p3[:, 0], p3[:, 3] - p3[:, 0])
    n = np.where(bad[:, None], n2, n)
    nl = np.linalg.norm(n, axis=1, keepdims=True)
    n = n / np.maximum(nl, 1e-9)
    cen = p3.mean(1)
    outv = cen - ins
    flip = np.einsum("ij,ij->i", n, outv) < 0
    n[flip & ~twos] *= -1
    vdir = cen - pos
    toward = np.einsum("ij,ij->i", n, vdir) > 0       # mat huong ra xa camera
    n = np.where((twos & toward)[:, None], -n, n)
    keep = ok & (twos | ~toward) & (nl[:, 0] > 1e-9)
    dif = np.clip(n @ LIGHT, 0, 1)
    tint = np.array(pal["tint"], np.float32)
    amb = 0.5 if not sc.night else 0.44
    shade_ = (amb + (1 - amb) * dif)[:, None]
    lit = cols * shade_ * tint
    ndv = np.abs(np.einsum("ij,ij->i", n, vdir / np.maximum(np.linalg.norm(vdir, axis=1, keepdims=True), 1e-9)))
    rim = ((1 - ndv) ** 2.5 * 0.55)[:, None] * (lay >= 2)[:, None] * np.array(mixc(pal["accent"], (255, 255, 255), 0.3), np.float32)
    lit = lit + rim * 0.22
    lit = np.where(emis[:, None] > 0, cols * (0.6 + 0.6 * emis[:, None]), lit)
    # suong mu theo do sau
    fogc = np.array(mixc(pal["sky"][1], pal["far"], 0.5), np.float32)
    dep = zc[PV].mean(1)
    fk = np.clip((dep - dist * 1.4) / 26.0, 0, 0.85)[:, None]
    lit = lit * (1 - fk) + fogc * fk
    lit = np.clip(lit, 0, 255)
    order = np.lexsort((-dep, lay))
    order = order[keep[order]]
    dr = ImageDraw.Draw(img)
    pts = np.stack([sx_[PV], sy_[PV]], -1)
    lit_i = lit.astype(np.uint8)
    glowed = False
    for idx in order:
        if lay[idx] >= 2 and not glowed:
            for (lp, lc, lr, lk) in scene.lights:
                r_ = lp - pos
                z_ = r_ @ fwd
                if z_ > 0.3:
                    gx, gy = Ws / 2 + f * ss * (r_ @ right) / z_, Hs / 2 - f * ss * (r_ @ up) / z_
                    add_glow(img, gx, gy, lr * f * ss / z_, lc, lk)
            dr = ImageDraw.Draw(img)
            glowed = True
        q = pts[idx]
        c = lit_i[idx]
        dr.polygon([tuple(v) for v in q], fill=(int(c[0]), int(c[1]), int(c[2])))
    if not glowed:
        for (lp, lc, lr, lk) in scene.lights:
            r_ = lp - pos
            z_ = r_ @ fwd
            if z_ > 0.3:
                add_glow(img, Ws / 2 + f * ss * (r_ @ right) / z_, Hs / 2 - f * ss * (r_ @ up) / z_, lr * f * ss / z_, lc, lk)
    if ss > 1:
        img = img.resize((W, H), Image.LANCZOS)
    # mua, hat bui
    from .r2d import _particles
    _particles(img, P, sc, t, W, H, 1.0)
    return img
