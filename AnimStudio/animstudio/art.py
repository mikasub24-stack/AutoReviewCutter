# -*- coding: utf-8 -*-
"""Phong nen 2D kieu 'cat giay nhieu lop' (paper-cut): 3 thoi dai x 4 loai canh x ngay/dem."""
import math, random
import numpy as np
from PIL import Image, ImageDraw, ImageFilter
from .common import h01

WW, WH, FY = 3200, 1600, 1010

PAL = {
    ("modern", True): dict(sky=((8, 12, 34), (52, 74, 124)), far=(26, 38, 76), mid=(18, 28, 58), near=(12, 18, 42), wall=(40, 52, 92), wall2=(30, 38, 72),
                           floor=(34, 42, 72), floor2=(22, 26, 50), ink=(8, 10, 24), accent=(255, 198, 112), light=(112, 206, 226), tint=(0.72, 0.78, 0.96)),
    ("modern", False): dict(sky=((118, 184, 236), (232, 242, 250)), far=(160, 198, 216), mid=(126, 170, 190), near=(96, 140, 156), wall=(238, 226, 208), wall2=(222, 208, 188),
                            floor=(190, 152, 116), floor2=(166, 130, 98), ink=(50, 56, 72), accent=(255, 214, 150), light=(255, 255, 255), tint=(1.0, 0.99, 0.96)),
    ("ancient", True): dict(sky=((8, 8, 22), (92, 46, 40)), far=(40, 30, 40), mid=(28, 22, 30), near=(18, 14, 20), wall=(70, 52, 46), wall2=(46, 34, 32),
                            floor=(64, 48, 38), floor2=(40, 30, 26), ink=(14, 10, 10), accent=(255, 150, 54), light=(255, 120, 40), tint=(0.86, 0.74, 0.66)),
    ("ancient", False): dict(sky=((120, 178, 214), (250, 222, 170)), far=(150, 150, 160), mid=(112, 120, 100), near=(78, 96, 66), wall=(154, 128, 98), wall2=(124, 100, 78),
                             floor=(150, 124, 84), floor2=(122, 100, 64), ink=(44, 32, 24), accent=(255, 170, 80), light=(255, 240, 200), tint=(1.0, 0.97, 0.9)),
    ("imperial", True): dict(sky=((14, 10, 30), (84, 46, 66)), far=(48, 32, 60), mid=(34, 24, 48), near=(24, 16, 34), wall=(92, 42, 38), wall2=(68, 30, 30),
                            floor=(66, 40, 32), floor2=(48, 28, 24), ink=(18, 10, 12), accent=(255, 172, 72), light=(255, 120, 60), tint=(0.9, 0.78, 0.72)),
    ("imperial", False): dict(sky=((172, 206, 212), (248, 234, 202)), far=(156, 176, 176), mid=(116, 146, 136), near=(76, 106, 94), wall=(224, 198, 152), wall2=(202, 172, 128),
                             floor=(152, 104, 72), floor2=(128, 86, 60), ink=(62, 38, 32), accent=(236, 120, 60), light=(255, 244, 220), tint=(1.0, 0.96, 0.9)),
    ("war", True): dict(sky=((14, 14, 20), (132, 62, 32)), far=(44, 34, 32), mid=(30, 24, 24), near=(18, 15, 15), wall=(66, 63, 52), wall2=(50, 48, 42),
                        floor=(46, 42, 36), floor2=(34, 30, 26), ink=(10, 10, 10), accent=(255, 152, 62), light=(255, 112, 42), tint=(0.84, 0.76, 0.7)),
    ("war", False): dict(sky=((150, 150, 142), (210, 186, 154)), far=(136, 130, 118), mid=(108, 102, 92), near=(78, 74, 66), wall=(152, 146, 128), wall2=(128, 122, 106),
                         floor=(112, 102, 86), floor2=(92, 84, 70), ink=(32, 30, 26), accent=(255, 204, 124), light=(255, 232, 192), tint=(0.94, 0.92, 0.86)),
}


def shade(c, k):
    return tuple(max(0, min(255, int(v * k))) for v in c[:3])


def mixc(a, b, t):
    return tuple(int(a[i] + (b[i] - a[i]) * t) for i in range(3))


def vgrad(w, h, top, bot):
    t = np.linspace(0, 1, max(h, 1))[:, None, None]
    a = np.array(top, np.float32)[None, None, :] * (1 - t) + np.array(bot, np.float32)[None, None, :] * t
    return Image.fromarray(np.repeat(a, w, axis=1).astype(np.uint8))


def layer():
    return Image.new("RGBA", (WW, WH), (0, 0, 0, 0))


class BG:
    def __init__(self, p, night, seed):
        self.p, self.night = p, night
        self.rng = random.Random(seed)
        self.img = Image.new("RGB", (WW, WH), p["wall"])
        self.lights = []

    def fill(self, x0, y0, x1, y1, top, bot):
        self.img.paste(vgrad(int(x1 - x0), int(y1 - y0), top, bot), (int(x0), int(y0)))

    def put(self, L, shadow=(16, 24, 30, 0.5), blur=0):
        if blur:
            L = L.filter(ImageFilter.GaussianBlur(blur))
        a = L.split()[3]
        if shadow:
            dx, dy, b, op = shadow
            s = a.resize((WW // 4, WH // 4)).filter(ImageFilter.GaussianBlur(max(b / 4, 0.5))).resize((WW, WH)).point(lambda v: int(v * op))
            self.img.paste(Image.new("RGB", (WW, WH), shade(self.p["ink"], 0.55)), (dx, dy), s)
        self.img.paste(L.convert("RGB"), (0, 0), a)

    def glow(self, x, y, r, col, k=1.0, flick=True):
        x0, y0, x1, y1 = max(0, int(x - r)), max(0, int(y - r)), min(WW, int(x + r)), min(WH, int(y + r))
        if x1 <= x0 or y1 <= y0:
            return
        yy, xx = np.mgrid[y0:y1, x0:x1]
        d = np.sqrt((xx - x) ** 2 + (yy - y) ** 2) / r
        f = np.clip(1 - d, 0, 1) ** 2 * k
        reg = np.asarray(self.img.crop((x0, y0, x1, y1))).astype(np.float32)
        reg = 255 - (255 - reg) * (1 - f[..., None] * np.array(col, np.float32) / 255)
        self.img.paste(Image.fromarray(np.clip(reg, 0, 255).astype(np.uint8)), (x0, y0))
        if flick:
            self.lights.append((x, y, r, col))

    def floor(self, y0, vp=(1600, 560), lines=22, rows=9, planks=False, c0=None, c1=None, lc=None):
        p = self.p
        c0, c1 = c0 or p["floor"], c1 or p["floor2"]
        self.fill(0, y0, WW, WH, c0, c1)
        L = layer()
        d = ImageDraw.Draw(L)
        lc = lc or shade(c1, 0.72) + (150,)
        for i in range(-lines, lines * 2 + 1):
            xb = i * WW / lines
            xt = vp[0] + (xb - vp[0]) * (y0 - vp[1]) / (WH - vp[1])
            d.line([xt, y0, xb, WH], fill=lc, width=3)
        if not planks:
            for k in range(1, rows + 1):
                y = y0 + (WH - y0) * (k / rows) ** 1.7
                d.line([0, y, WW, y], fill=lc, width=3)
        self.img.paste(L.convert("RGB"), (0, 0), L.split()[3])


# ---------------------------------------------------------------- tien ich ve
def stars(d, rng, n, ymax, col=(255, 255, 240)):
    for _ in range(n):
        x, y = rng.uniform(0, WW), rng.uniform(0, ymax)
        r = rng.choice([1, 1, 2, 2, 3])
        d.ellipse([x - r, y - r, x + r, y + r], fill=col + (int(120 + rng.random() * 135),))


def ridge(rng, base, amp, step=16, seed_off=0.0, rough=1.0):
    ph = [rng.uniform(0, 6.28) for _ in range(5)]
    pts = []
    for x in range(0, WW + step, step):
        y = base - amp * (0.5 * math.sin(x / 520 + ph[0]) + 0.3 * math.sin(x / 230 + ph[1]) + 0.18 * rough * math.sin(x / 97 + ph[2]) + 0.1 * rough * math.sin(x / 41 + ph[3]))
        pts.append((x, y))
    return pts


def mountain(bg, base, amp, col, rng, blur=3, shadow=None, rough=1.0):
    L = layer()
    d = ImageDraw.Draw(L)
    pts = ridge(rng, base, amp, rough=rough)
    d.polygon(pts + [(WW, WH), (0, WH)], fill=col + (255,))
    bg.put(L, shadow=shadow, blur=blur)


def mist(bg, ycen, h, col, a=0.6):
    t = np.linspace(-1, 1, h)
    al = (np.clip(1 - np.abs(t), 0, 1) ** 1.5 * a * 255).astype(np.uint8)
    arr = np.zeros((h, WW, 4), np.uint8)
    arr[..., :3] = np.array(col, np.uint8)
    arr[..., 3] = al[:, None]
    m = Image.fromarray(arr)
    bg.img.paste(m.convert("RGB"), (0, int(ycen - h / 2)), m.split()[3])


def building(d, x, w, top, base, col, rng, wins=None, jag=False, flat=True):
    if jag:
        pts = [(x, base)]
        n = max(3, w // 40)
        for i in range(n + 1):
            pts.append((x + w * i / n, top + rng.uniform(0, 90) * (1 if 0 < i < n else 0.3)))
        pts += [(x + w, base)]
        d.polygon(pts, fill=col + (255,))
    else:
        d.rectangle([x, top, x + w, base], fill=col + (255,))
    if wins:
        wc, prob = wins
        for wy in range(int(top + 30), int(base - 40), 54):
            for wx in range(int(x + 16), int(x + w - 30), 40):
                if rng.random() < prob:
                    d.rectangle([wx, wy, wx + 20, wy + 30], fill=wc + (255,))


def skyline(bg, base, col, rng, hmin, hmax, wmin, wmax, wins=None, jag=False, blur=0, shadow=None):
    L = layer()
    d = ImageDraw.Draw(L)
    x = -50
    while x < WW:
        w = rng.randint(wmin, wmax)
        building(d, x, w, base - rng.randint(hmin, hmax), base + 4, col, rng, wins, jag)
        x += w + rng.randint(-10, 18)
    bg.put(L, shadow=shadow, blur=blur)


def pole_lamp(bg, x, ytop, ybase, col_pole, lamp_col, r=330, k=0.85, arm=70):
    L = layer()
    d = ImageDraw.Draw(L)
    d.rectangle([x - 7, ytop, x + 7, ybase], fill=col_pole + (255,))
    d.rectangle([x - 7, ytop, x + arm, ytop + 10], fill=col_pole + (255,))
    d.polygon([(x + arm - 26, ytop + 10), (x + arm + 26, ytop + 10), (x + arm + 16, ytop + 24), (x + arm - 16, ytop + 24)], fill=col_pole + (255,))
    bg.put(L, shadow=(8, 6, 6, 0.4))
    bg.glow(x + arm, ytop + 40, r, lamp_col, k)


def lantern(bg, x, y, s, col, rope=0, glow=True):
    L = layer()
    d = ImageDraw.Draw(L)
    if rope:
        d.line([x, y - rope, x, y - s * 0.5], fill=(40, 24, 20, 255), width=4)
    d.rectangle([x - s * 0.28, y - s * 0.55, x + s * 0.28, y - s * 0.45], fill=(52, 30, 24, 255))
    d.ellipse([x - s * 0.5, y - s * 0.5, x + s * 0.5, y + s * 0.5], fill=col + (255,), outline=shade(col, 0.6) + (255,), width=3)
    for k in (-0.22, 0.0, 0.22):
        d.arc([x + k * s - s * 0.18, y - s * 0.5, x + k * s + s * 0.18, y + s * 0.5], 90, 270, fill=shade(col, 0.65) + (255,), width=2)
    d.rectangle([x - s * 0.28, y + s * 0.45, x + s * 0.28, y + s * 0.55], fill=(52, 30, 24, 255))
    d.line([x, y + s * 0.55, x, y + s * 0.95], fill=(222, 180, 80, 255), width=3)
    bg.put(L, shadow=None)
    if glow:
        bg.glow(x, y, s * 3.2, mixc(col, (255, 190, 90), 0.5), 0.55)


def pillar(d, x, y0, y1, w, col, cap=None):
    d.rectangle([x - w / 2, y0, x + w / 2, y1], fill=col + (255,))
    d.rectangle([x - w * 0.5, y0, x - w * 0.32, y1], fill=shade(col, 1.18) + (255,))
    d.rectangle([x + w * 0.3, y0, x + w * 0.5, y1], fill=shade(col, 0.78) + (255,))
    if cap:
        d.rectangle([x - w * 0.72, y0, x + w * 0.72, y0 + w * 0.34], fill=cap + (255,))
        d.rectangle([x - w * 0.72, y1 - w * 0.34, x + w * 0.72, y1], fill=cap + (255,))


def roof(d, x0, x1, y, h, col, rim):
    """Mai ngoi cong vut hai dau (y = chan mai, h = chieu cao)."""
    w = x1 - x0
    rl, rr = x0 + w * 0.16, x1 - w * 0.16
    right = [(rr + (x1 + 90 - rr) * t, y - h + h * (1 - (1 - t) ** 2.4)) for t in [i / 20 for i in range(21)]]
    left = [(rl - (rl - (x0 - 90)) * t, y - h + h * (1 - (1 - t) ** 2.4)) for t in [i / 20 for i in range(21)]]
    d.polygon([(rl, y - h)] + right + [(x1 + 90, y + 12)] + [(x0 - 90, y + 12)] + left[::-1], fill=col + (255,))
    for i in range(1, 6):
        yy = y - h + h * i / 6
        d.line([rl - (rl - x0) * i / 6 - 20, yy, rr + (x1 - rr) * i / 6 + 20, yy], fill=shade(col, 0.74) + (255,), width=3)
    d.line([rl, y - h, rr, y - h], fill=rim + (255,), width=10)
    d.line([x0 - 90, y + 8, x1 + 90, y + 8], fill=rim + (255,), width=6)


def sandbags(d, x, y, cols, rows, col, w=96, h=44):
    for r in range(rows):
        off = (r % 2) * w * 0.5
        for c in range(cols):
            cx = x + c * w + off
            cy = y - r * h * 0.82
            d.rounded_rectangle([cx, cy - h, cx + w * 0.96, cy], radius=18, fill=shade(col, 0.92 + 0.12 * ((r * 7 + c * 3) % 5) / 4) + (255,), outline=shade(col, 0.6) + (255,), width=2)


def hedgehog(d, x, y, s, col):
    for a in (35, -35, 90):
        r = math.radians(a)
        dx, dy = math.cos(r) * s, math.sin(r) * s
        d.line([x - dx, y - dy - s * 0.1, x + dx, y + dy - s * 0.1], fill=col + (255,), width=int(s * 0.14))


def smoke(bg, x, y, h, w, col=(30, 28, 28), a=95, blur=22):
    L = layer()
    d = ImageDraw.Draw(L)
    rng = bg.rng
    for i in range(30):
        t = i / 29
        cx = x + rng.uniform(-w, w) * (0.25 + t) + t * w * 0.7
        cy = y - t * h
        r = 38 + t * 110
        d.ellipse([cx - r, cy - r, cx + r, cy + r], fill=col + (a,))
    bg.put(L, shadow=None, blur=blur)


def barbed(d, x0, x1, y, col):
    pts = []
    n = int((x1 - x0) / 36)
    for i in range(n + 1):
        pts.append((x0 + i * 36, y + (14 if i % 2 else -14)))
    d.line(pts, fill=col + (255,), width=3)
    for i in range(0, n, 2):
        d.line([x0 + i * 36 - 8, y - 8, x0 + i * 36 + 8, y + 8], fill=col + (255,), width=3)
        d.line([x0 + i * 36 - 8, y + 8, x0 + i * 36 + 8, y - 8], fill=col + (255,), width=3)


def bulb(bg, x, y, rope_to=0, col=(255, 214, 140)):
    L = layer()
    d = ImageDraw.Draw(L)
    d.line([x, rope_to, x, y - 20], fill=(20, 18, 16, 255), width=4)
    d.polygon([(x - 24, y - 6), (x + 24, y - 6), (x + 12, y - 28), (x - 12, y - 28)], fill=(40, 40, 36, 255))
    d.ellipse([x - 12, y - 8, x + 12, y + 16], fill=col + (255,))
    bg.put(L, shadow=None)
    bg.glow(x, y + 6, 420, col, 0.8)


def tree_round(d, x, y, s, trunk, leaf, rng):
    d.rectangle([x - s * 0.07, y - s * 0.6, x + s * 0.07, y], fill=trunk + (255,))
    for _ in range(7):
        cx, cy, r = x + rng.uniform(-0.35, 0.35) * s, y - s * (0.75 + rng.uniform(-0.1, 0.35)), s * rng.uniform(0.25, 0.4)
        d.ellipse([cx - r, cy - r, cx + r, cy + r], fill=shade(leaf, rng.uniform(0.85, 1.12)) + (255,))


def pine(d, x, y, s, col, rng):
    d.rectangle([x - 6, y - s * 0.25, x + 6, y], fill=shade(col, 0.6) + (255,))
    for i in range(5):
        yy = y - s * 0.2 - i * s * 0.17
        w = s * (0.34 - i * 0.055)
        d.polygon([(x - w, yy), (x + w, yy), (x, yy - s * 0.26)], fill=shade(col, 0.9 + 0.05 * i) + (255,))


def dead_tree(d, x, y, s, col, rng):
    def br(x0, y0, a, l, w, dep):
        x1, y1 = x0 + math.cos(a) * l, y0 - math.sin(a) * l
        d.line([x0, y0, x1, y1], fill=col + (255,), width=max(2, int(w)))
        if dep > 0:
            br(x1, y1, a + rng.uniform(0.3, 0.8), l * 0.72, w * 0.7, dep - 1)
            br(x1, y1, a - rng.uniform(0.3, 0.8), l * 0.7, w * 0.7, dep - 1)
    br(x, y, math.radians(90 + rng.uniform(-8, 8)), s * 0.38, s * 0.07, 4)


def window_city(bg, x0, y0, x1, y1):
    p, rng = bg.p, bg.rng
    bg.fill(x0, y0, x1, y1, p["sky"][0], p["sky"][1])
    L = layer()
    d = ImageDraw.Draw(L)
    for _ in range(26):
        x, y, r = rng.uniform(x0, x1), rng.uniform(y1 - (y1 - y0) * 0.55, y1 - 8), rng.uniform(4, 14)
        c = rng.choice([(255, 214, 140), (150, 220, 240), (255, 150, 140), (255, 240, 200)]) if bg.night else (255, 255, 255)
        d.ellipse([x - r, y - r, x + r, y + r], fill=c + ((190,) if bg.night else (60,)))
    L = L.filter(ImageFilter.GaussianBlur(2.2))
    bg.img.paste(L.convert("RGB"), (0, 0), L.split()[3].crop((0, 0, WW, WH)))


# ================================================================ HIEN DAI
def modern_hall(bg):
    p, rng, night = bg.p, bg.rng, bg.night
    bg.fill(0, 0, WW, FY, p["wall"], p["wall2"])
    L = layer(); d = ImageDraw.Draw(L)
    d.rectangle([0, 0, WW, 150], fill=shade(p["wall2"], 0.72) + (255,))
    for i in range(5):
        pillar(d, 140 + i * 730, 150, FY, 130, shade(p["wall"], 0.92))
    bg.put(L, shadow=(20, 10, 24, 0.35))
    for i in range(4):
        x0 = 330 + i * 730 - 190
        window_city(bg, x0 + 190 - 190 + 30, 250, x0 + 190 + 190 - 30 + 190 - 190, 880) if False else None
    for i in range(4):
        cx = 505 + i * 730
        window_city(bg, cx - 190, 240, cx + 190, 880)
        L = layer(); d = ImageDraw.Draw(L)
        d.rectangle([cx - 200, 230, cx + 200, 890], outline=shade(p["ink"], 1.2) + (255,), width=16)
        d.line([cx, 240, cx, 880], fill=shade(p["ink"], 1.2) + (255,), width=10)
        d.line([cx - 190, 560, cx + 190, 560], fill=shade(p["ink"], 1.2) + (255,), width=10)
        bg.put(L, shadow=(8, 8, 10, 0.4))
        sp = layer(); d = ImageDraw.Draw(sp)
        d.polygon([(cx - 190, 900), (cx + 190, 900), (cx + 330, 1500), (cx - 50, 1500)], fill=p["light"] + (46 if night else 70,))
        bg.img.paste(sp.convert("RGB"), (0, 0), sp.split()[3])
    L = layer(); d = ImageDraw.Draw(L)
    for bx in (260, 1100, 2000, 2850):          # ghe cho
        d.rounded_rectangle([bx - 190, 860, bx + 190, 905], radius=12, fill=shade(p["near"], 1.3) + (255,))
        d.rounded_rectangle([bx - 190, 790, bx + 190, 860], radius=14, fill=shade(p["near"], 1.0) + (255,))
        for lx in (-170, 170):
            d.rectangle([bx + lx - 6, 905, bx + lx + 6, 980], fill=shade(p["ink"], 1.3) + (255,))
    d.rectangle([1530, 170, 1670, 230], fill=shade(p["ink"], 1.4) + (255,))
    bg.put(L, shadow=(10, 12, 14, 0.5))
    bg.floor(FY, vp=(1600, 520))
    for lx in (500, 1600, 2700):
        L = layer(); d = ImageDraw.Draw(L)
        d.line([lx, 150, lx, 300], fill=(30, 30, 40, 255), width=5)
        d.rounded_rectangle([lx - 130, 300, lx + 130, 330], radius=8, fill=(240, 236, 220, 255))
        bg.put(L, shadow=(6, 10, 8, 0.3))
        bg.glow(lx, 330, 520, p["accent"] if night else (255, 255, 240), 0.55 if night else 0.25)
    L = layer(); d = ImageDraw.Draw(L)
    d.ellipse([1560, 178, 1640, 258], fill=(244, 240, 228, 255), outline=(30, 30, 40, 255), width=5)
    d.line([1600, 218, 1600, 190], fill=(30, 30, 40, 255), width=4); d.line([1600, 218, 1620, 226], fill=(30, 30, 40, 255), width=4)
    bg.put(L, shadow=None)


def modern_room(bg):
    p, rng, night = bg.p, bg.rng, bg.night
    bg.fill(0, 0, WW, FY, p["wall"], p["wall2"])
    L = layer(); d = ImageDraw.Draw(L)
    d.rectangle([0, 700, WW, FY], fill=shade(p["wall2"], 0.88) + (255,))
    d.rectangle([0, 692, WW, 708], fill=shade(p["wall"], 1.12) + (255,))
    for x in range(120, WW, 330):
        d.rounded_rectangle([x, 740, x + 270, 960], radius=8, outline=shade(p["wall2"], 0.7) + (255,), width=4)
    bg.put(L, shadow=None)
    window_city(bg, 780, 220, 1420, 760)
    L = layer(); d = ImageDraw.Draw(L)
    d.rectangle([770, 210, 1430, 770], outline=shade(p["wall2"], 0.5) + (255,), width=18)
    d.line([1100, 220, 1100, 760], fill=shade(p["wall2"], 0.5) + (255,), width=12)
    cur = (190, 90, 90) if not night else (110, 70, 110)
    d.polygon([(700, 150), (840, 150), (880, 780), (700, 800)], fill=cur + (255,))
    d.polygon([(1360, 150), (1500, 150), (1500, 800), (1320, 780)], fill=cur + (255,))
    for x in range(715, 860, 36):
        d.line([x, 160, x + 24, 790], fill=shade(cur, 0.8) + (255,), width=4)
    d.rectangle([660, 140, 1540, 168], fill=shade(p["ink"], 1.6) + (255,))
    bg.put(L, shadow=(14, 14, 20, 0.45))
    L = layer(); d = ImageDraw.Draw(L)
    d.rectangle([2060, 240, 2680, 990], fill=shade((120, 82, 56), 0.7 if night else 1.0) + (255,))
    for k in range(4):
        y = 260 + k * 180
        d.rectangle([2080, y, 2660, y + 150], fill=shade((74, 50, 36), 0.7 if night else 1.0) + (255,))
        x = 2090
        while x < 2640:
            w = rng.randint(22, 46); h = rng.randint(100, 142)
            d.rectangle([x, y + 150 - h, x + w, y + 150], fill=rng.choice([(190, 70, 70), (70, 120, 170), (220, 190, 90), (90, 150, 110), (210, 210, 200)]) + (255,))
            x += w + 3
    d.rounded_rectangle([280, 300, 520, 520], radius=6, fill=(240, 232, 214, 255), outline=shade(p["ink"], 1.5) + (255,), width=10)
    d.polygon([(300, 500), (400, 380), (460, 450), (500, 400), (500, 500)], fill=(110, 160, 150, 255))
    d.ellipse([440, 330, 480, 370], fill=(250, 210, 120, 255))
    bg.put(L, shadow=(14, 14, 18, 0.45))
    bg.floor(FY, vp=(1600, 600), planks=True, lines=30)
    L = layer(); d = ImageDraw.Draw(L)
    d.ellipse([1100, 1180, 2300, 1480], fill=shade(p["accent"], 0.7 if night else 0.9) + (255,)); d.ellipse([1170, 1210, 2230, 1450], fill=shade((200, 90, 80), 0.6 if night else 1.0) + (255,))
    bg.put(L, shadow=(0, 8, 10, 0.3))
    L = layer(); d = ImageDraw.Draw(L)
    d.rectangle([1792, 560, 1800, 1010], fill=(40, 40, 46, 255)); d.polygon([(1700, 560), (1890, 560), (1850, 470), (1740, 470)], fill=shade(p["accent"], 0.92) + (255,))
    d.rounded_rectangle([2830, 840, 2930, 1010], radius=14, fill=(180, 100, 70, 255))
    for a, (dx, dy) in enumerate([(-70, -190), (50, -230), (90, -140), (-20, -120), (-90, -90)]):
        d.ellipse([2880 + dx - 40, 840 + dy - 50, 2880 + dx + 40, 840 + dy + 50], fill=shade((70, 150, 90), 0.6 if night else 1.0 + 0.05 * a) + (255,))
    bg.put(L, shadow=(10, 8, 10, 0.4))
    bg.glow(1795, 500, 520, p["accent"], 0.95 if night else 0.3)


def modern_street(bg):
    p, rng, night = bg.p, bg.rng, bg.night
    bg.fill(0, 0, WW, 1010, p["sky"][0], p["sky"][1])
    L = layer(); d = ImageDraw.Draw(L)
    if night:
        stars(d, rng, 120, 500)
        d.ellipse([2400, 150, 2500, 250], fill=(250, 246, 220, 255))
    bg.put(L, shadow=None)
    if night: bg.glow(2450, 200, 380, (210, 220, 255), 0.45, flick=False)
    skyline(bg, 900, p["far"], rng, 260, 640, 130, 260, blur=3)
    skyline(bg, 930, p["mid"], rng, 220, 520, 160, 300, wins=((255, 214, 140) if night else shade(p["sky"][0], 1.1), 0.34 if night else 0.9), shadow=(22, 10, 40, 0.5))
    L = layer(); d = ImageDraw.Draw(L)
    d.rectangle([0, 900, WW, 1010], fill=shade(p["floor"], 1.25) + (255,))
    for x in range(0, WW, 220):
        d.line([x, 900, x - 60, 1010], fill=shade(p["floor"], 1.0) + (255,), width=3)
    bg.put(L, shadow=(0, 6, 8, 0.4))
    bg.floor(1010, vp=(1600, 640), lines=26, rows=7, c0=shade(p["floor"], 1.12), c1=shade(p["floor2"], 0.9))
    L = layer(); d = ImageDraw.Draw(L)
    d.rectangle([0, 1380, WW, 1600], fill=shade(p["floor2"], 0.55) + (255,))
    for x in range(40, WW, 400):
        d.rectangle([x, 1480, x + 220, 1500], fill=(236, 226, 190, 255))
    d.rectangle([0, 1372, WW, 1384], fill=shade(p["floor"], 1.35) + (255,))
    bg.put(L, shadow=(0, -4, 6, 0.4))
    for x in (480, 1500, 2640):
        pole_lamp(bg, x, 410, 1010, shade(p["ink"], 1.7), p["accent"] if night else (255, 250, 230), r=480, k=0.9 if night else 0.18)


def modern_outdoor(bg):
    p, rng, night = bg.p, bg.rng, bg.night
    bg.fill(0, 0, WW, 1010, p["sky"][0], p["sky"][1])
    L = layer(); d = ImageDraw.Draw(L)
    if night:
        stars(d, rng, 160, 600); d.ellipse([560, 180, 700, 320], fill=(250, 246, 222, 255))
    else:
        d.ellipse([2500, 150, 2620, 270], fill=(255, 244, 200, 255))
        for _ in range(7):
            cx, cy = rng.uniform(100, 3000), rng.uniform(120, 480)
            for k in range(5):
                r = rng.uniform(36, 70)
                d.ellipse([cx + k * 56 - r, cy - r * 0.7, cx + k * 56 + r, cy + r * 0.7], fill=(255, 255, 255, 235))
    bg.put(L, shadow=None, blur=2)
    bg.glow(640 if night else 2560, 230, 420, (200, 215, 255) if night else (255, 240, 190), 0.5, flick=False)
    mountain(bg, 760, 230, p["far"], rng, blur=3)
    mountain(bg, 860, 170, p["mid"], rng, blur=1, shadow=(0, 12, 40, 0.4))
    L = layer(); d = ImageDraw.Draw(L)
    for _ in range(18):
        tree_round(d, rng.uniform(0, WW), 960, rng.uniform(300, 480), shade(p["near"], 0.7), shade(p["near"], 1.15), rng)
    bg.put(L, shadow=(14, 10, 20, 0.45))
    bg.fill(0, 950, WW, WH, shade((92, 150, 84) if not night else (28, 56, 56), 1.0), shade((62, 112, 62) if not night else (16, 34, 40), 1.0))
    L = layer(); d = ImageDraw.Draw(L)
    d.polygon([(1450, 950), (1750, 950), (2300, WH), (900, WH)], fill=shade((200, 176, 130) if not night else (88, 86, 96), 1.0) + (255,))
    for x in range(40, WW, 56):
        d.line([x, 940, x, 1006], fill=shade(p["floor"], 1.0) + (255,), width=8)
    d.line([0, 960, WW, 960], fill=shade(p["floor"], 1.0) + (255,), width=8); d.line([0, 990, WW, 990], fill=shade(p["floor"], 1.0) + (255,), width=8)
    bg.put(L, shadow=(6, 8, 8, 0.4))


# ================================================================ CO DAI
def ancient_room(bg):
    p, rng, night = bg.p, bg.rng, bg.night
    bg.fill(0, 0, WW, FY, p["wall"], p["wall2"])
    L = layer(); d = ImageDraw.Draw(L)
    for x in range(0, WW, 120):
        d.line([x, 0, x, FY], fill=shade(p["wall2"], 0.88) + (255,), width=3)
    d.rectangle([0, 0, WW, 140], fill=shade((70, 36, 30), 0.8 if night else 1.0) + (255,))
    for x in (160, 1000, 2200, 3040):
        pillar(d, x, 140, FY, 110, (150, 34, 34) if not night else (112, 26, 28), cap=(214, 170, 70))
    bg.put(L, shadow=(18, 8, 24, 0.4))
    for x0, x1 in ((330, 900), (1300, 1900), (2300, 2900)):
        sc = layer(); d = ImageDraw.Draw(sc)
        d.rectangle([x0, 250, x1, 880], fill=(250, 232, 190, 255) if not night else (255, 205, 130, 255))
        stepx = (x1 - x0) / 5
        for i in range(6):
            d.line([x0 + i * stepx, 250, x0 + i * stepx, 880], fill=(96, 46, 36, 255), width=8)
        for j in range(5):
            d.line([x0, 250 + j * 126, x1, 250 + j * 126], fill=(96, 46, 36, 255), width=8)
        d.rectangle([x0 - 10, 240, x1 + 10, 890], outline=(110, 50, 38, 255), width=16)
        bg.put(sc, shadow=(8, 8, 12, 0.4))
        if night:
            bg.glow((x0 + x1) / 2, 560, (x1 - x0) * 0.9, (255, 150, 70), 0.55)
    L = layer(); d = ImageDraw.Draw(L)
    d.rounded_rectangle([1980, 560, 2120, 700], radius=0, fill=(240, 226, 190, 255))
    bg.put(L, shadow=None)
    bg.floor(FY, vp=(1600, 560), planks=True, lines=26, c0=p["floor"], c1=p["floor2"])
    L = layer(); d = ImageDraw.Draw(L)
    d.ellipse([1000, 1250, 2400, 1560], fill=shade((130, 36, 40), 0.7 if night else 1.0) + (255,)); d.ellipse([1080, 1285, 2320, 1525], outline=(222, 180, 80, 255), width=6)
    d.rectangle([1360, 930, 1840, 1000], fill=shade((82, 46, 30), 0.8) + (255,)); d.rectangle([1380, 1000, 1400, 1050], fill=(60, 34, 24, 255)); d.rectangle([1800, 1000, 1820, 1050], fill=(60, 34, 24, 255))
    bg.put(L, shadow=(0, 8, 10, 0.4))
    for x, y in ((520, 330), (1580, 330), (2620, 330)):
        lantern(bg, x, y, 110, (214, 48, 40), rope=190)


def ancient_hall(bg):
    p, rng, night = bg.p, bg.rng, bg.night
    bg.fill(0, 0, WW, FY, shade(p["wall"], 0.8), p["wall2"])
    L = layer(); d = ImageDraw.Draw(L)
    d.rectangle([0, 0, WW, 190], fill=shade((96, 34, 30), 0.8 if night else 1.0) + (255,))
    for x in range(30, WW, 200):
        d.rectangle([x, 40, x + 150, 150], outline=(222, 176, 76, 255), width=5)
        d.ellipse([x + 55, 70, x + 95, 110], fill=(222, 176, 76, 255))
    d.ellipse([1200, 260, 2000, 860], fill=shade((196, 150, 56), 0.7 if night else 1.0) + (255,), outline=(120, 30, 30, 255), width=14)
    for k in range(3):                              # hoa van rong cach dieu
        d.arc([1280 + k * 60, 340 + k * 60, 1920 - k * 60, 780 - k * 60], 20 + k * 40, 330 - k * 25, fill=(150, 30, 34, 255), width=10)
    bg.put(L, shadow=(14, 12, 30, 0.45))
    L = layer(); d = ImageDraw.Draw(L)
    for i, x in enumerate((260, 760, 2440, 2940)):
        pillar(d, x, 190, FY, 170, (166, 36, 36) if not night else (122, 28, 30), cap=(222, 176, 72))
    bg.put(L, shadow=(22, 10, 30, 0.45))
    L = layer(); d = ImageDraw.Draw(L)
    for k in range(4):                               # bac them ngai vang
        d.rectangle([1100 - k * 60, 860 + k * 36, 2100 + k * 60, 896 + k * 36], fill=shade((150, 30, 34), 1.0 - 0.07 * k) + (255,), outline=(222, 176, 72, 255), width=3)
    d.rectangle([1500, 780, 1700, 870], fill=(222, 176, 72, 255)); d.rectangle([1440, 700, 1760, 790], fill=shade((190, 40, 40), 1.0) + (255,))
    bg.put(L, shadow=(0, 10, 12, 0.4))
    bg.floor(FY, vp=(1600, 540), lines=24, rows=8, c0=shade(p["floor"], 1.0), c1=shade(p["floor2"], 0.9), lc=(222, 176, 72, 110))
    for x in range(470, 2800, 560):
        lantern(bg, x, 360, 130, (214, 44, 38), rope=170)
    L = layer(); d = ImageDraw.Draw(L)
    d.polygon([(1050, 1010), (2150, 1010), (2350, 1600), (850, 1600)], fill=shade((150, 28, 34), 0.7 if night else 1.0) + (150,))
    bg.img.paste(L.convert("RGB"), (0, 0), L.split()[3])


def ancient_street(bg):
    p, rng, night = bg.p, bg.rng, bg.night
    bg.fill(0, 0, WW, 1010, p["sky"][0], p["sky"][1])
    L = layer(); d = ImageDraw.Draw(L)
    if night:
        stars(d, rng, 110, 480); d.ellipse([2250, 150, 2410, 310], fill=(255, 238, 196, 255))
    bg.put(L, shadow=None)
    if night: bg.glow(2330, 230, 480, (255, 220, 160), 0.5, flick=False)
    mountain(bg, 700, 200, p["far"], rng, blur=4)
    mist(bg, 760, 240, mixc(p["sky"][1], p["far"], 0.3), 0.55)
    L = layer(); d = ImageDraw.Draw(L)
    for x0, w, h in ((100, 520, 320), (880, 600, 370), (1720, 520, 300), (2420, 700, 340)):
        d.rectangle([x0, 960 - h * 0.6, x0 + w, 960], fill=shade(p["wall"], 0.82) + (255,))
        d.rectangle([x0 + 30, 960 - h * 0.6 + 40, x0 + w - 30, 960], fill=shade(p["wall2"], 0.8) + (255,))
        for xx in range(int(x0 + 60), int(x0 + w - 60), 130):
            d.rectangle([xx, 960 - h * 0.35, xx + 80, 940], fill=(255, 202, 120, 255) if night else shade(p["sky"][0], 1.0) + (255,), outline=shade(p["ink"], 1.2) + (255,), width=5)
        roof(d, x0, x0 + w, 960 - h * 0.6, h * 0.55, shade((70, 62, 64), 0.8 if night else 1.0), (200, 160, 70))
    bg.put(L, shadow=(16, 12, 30, 0.5))
    bg.floor(1010 - 60, vp=(1600, 700), lines=14, rows=7, c0=shade(p["floor"], 1.0), c1=shade(p["floor2"], 0.8), lc=shade(p["floor2"], 0.55) + (170,))
    L = layer(); d = ImageDraw.Draw(L)
    d.line([0, 340, WW, 440], fill=(40, 24, 20, 255), width=4)
    bg.put(L, shadow=None)
    for x in range(150, WW, 360):
        y = 340 + (x / WW) * 100 + 40 * math.sin(x)
        lantern(bg, x, y, 90, (206, 44, 38), glow=night)
    for x in (60, 3140):
        pass


def ancient_outdoor(bg):
    p, rng, night = bg.p, bg.rng, bg.night
    bg.fill(0, 0, WW, 1010, p["sky"][0], p["sky"][1])
    L = layer(); d = ImageDraw.Draw(L)
    if night: stars(d, rng, 160, 560)
    d.ellipse([2300, 160, 2560, 420], fill=((255, 242, 206) if night else (255, 226, 170)) + (255,))
    bg.put(L, shadow=None)
    bg.glow(2430, 290, 620, (255, 230, 170) if night else (255, 200, 120), 0.6, flick=False)
    cols = [mixc(p["far"], p["sky"][1], 0.55), mixc(p["far"], p["sky"][1], 0.25), p["far"], p["mid"], p["near"]]
    bases = [620, 700, 790, 880, 960]
    for i, (c, b) in enumerate(zip(cols, bases)):
        mountain(bg, b, 230 - i * 22, c, rng, blur=3 - i * 0.5, rough=1.3 - 0.15 * i)
        mist(bg, b + 30, 190, mixc(p["sky"][1], c, 0.2), 0.5)
        if i == 3:
            L = layer(); d = ImageDraw.Draw(L)
            for _ in range(8):
                pine(d, rng.uniform(100, WW - 100), b + 10, rng.uniform(150, 220), shade(c, 0.78), rng)
            roof(d, 560, 800, 700, 80, shade((70, 56, 56), 0.8), (200, 150, 60))
            d.rectangle([590, 730, 770, 830], fill=shade((140, 40, 40), 0.9) + (255,))
            bg.put(L, shadow=None)
    bg.fill(0, 960, WW, WH, shade(p["floor"], 0.95), shade(p["floor2"], 0.85))
    L = layer(); d = ImageDraw.Draw(L)
    for x in range(0, WW, 150):
        d.rounded_rectangle([x, 1010, x + 140, 1090], radius=8, fill=shade(p["floor"], 1.06 + 0.1 * ((x // 150) % 3) / 3) + (255,), outline=shade(p["floor2"], 0.7) + (255,), width=3)
    d.rectangle([0, 960, WW, 1010], fill=shade(p["near"], 0.8) + (255,))
    for x in range(40, WW, 90):                      # tre
        h = rng.uniform(260, 420)
        d.rectangle([x, 970 - h, x + 12, 975], fill=shade((86, 120, 70), 0.6 if night else 1.0) + (255,))
        for k in range(3):
            d.polygon([(x + 12, 970 - h + k * 80), (x + 80, 940 - h + k * 80), (x + 20, 985 - h + k * 80)], fill=shade((96, 140, 76), 0.6 if night else 1.1) + (255,))
    bg.put(L, shadow=(8, 8, 10, 0.4))


# ================================================================ CHIEN TRANH
def war_room(bg):
    p, rng, night = bg.p, bg.rng, bg.night
    bg.fill(0, 0, WW, FY, p["wall"], p["wall2"])
    L = layer(); d = ImageDraw.Draw(L)
    for _ in range(40):                                 # vet nut / bong tuong
        x, y = rng.uniform(0, WW), rng.uniform(0, FY)
        r = rng.uniform(40, 150)
        d.ellipse([x - r, y - r * 0.6, x + r, y + r * 0.6], fill=shade(p["wall2"], rng.uniform(0.82, 1.1)) + (110,))
    d.polygon([(1960, 0), (2400, 0), (2330, 220), (2180, 330), (2100, 210)], fill=shade(p["sky"][1], 0.9) + (255,))   # lo thung tren tran
    d.polygon([(2900, 340), (3200, 300), (3200, 760), (3000, 700), (2960, 520)], fill=mixc(p["sky"][1], p["sky"][0], 0.2) + (255,))
    for x in (340, 1180):
        d.line([x, 0, x, FY], fill=shade(p["ink"], 2.2) + (255,), width=26)
    bg.put(L, shadow=(14, 10, 20, 0.5))
    L = layer(); d = ImageDraw.Draw(L)
    d.rectangle([1500, 280, 2000, 640], fill=(214, 200, 160, 255), outline=(60, 44, 30, 255), width=10)
    d.line([1540, 340, 1700, 460, 1820, 400, 1960, 580], fill=(160, 50, 40, 255), width=6)
    for px, py in ((1540, 340), (1700, 460), (1820, 400), (1960, 580)):
        d.ellipse([px - 10, py - 10, px + 10, py + 10], fill=(40, 40, 120, 255))
    bg.put(L, shadow=(10, 12, 14, 0.5))
    bg.floor(FY, vp=(1600, 640), lines=18, rows=6, c0=p["floor"], c1=p["floor2"])
    L = layer(); d = ImageDraw.Draw(L)
    sandbags(d, 2420, 1010, 6, 4, (150, 134, 98))
    for cx in (520, 700):
        d.rectangle([cx, 880, cx + 150, 1010], fill=(112, 80, 48, 255), outline=(60, 40, 24, 255), width=5); d.line([cx, 940, cx + 150, 940], fill=(60, 40, 24, 255), width=5)
    d.rectangle([2800, 870, 3040, 1010], fill=(60, 66, 52, 255), outline=(30, 34, 26, 255), width=5)
    bg.put(L, shadow=(14, 10, 16, 0.55))
    bulb(bg, 1100, 300, 0); bulb(bg, 2150, 380, 0, col=(255, 190, 110))


def war_hall(bg):
    p, rng, night = bg.p, bg.rng, bg.night
    bg.fill(0, 0, WW, FY, p["wall"], p["wall2"])
    L = layer(); d = ImageDraw.Draw(L)
    for x in range(0, WW, 240):
        d.line([x, 0, x, FY], fill=shade(p["wall2"], 0.85) + (255,), width=5)
    d.rectangle([0, 0, WW, 170], fill=shade(p["ink"], 2.4) + (255,))
    for x in range(100, WW, 460):
        d.rectangle([x, 0, x + 40, FY], fill=shade(p["ink"], 2.8) + (255,))
    bg.put(L, shadow=(14, 10, 20, 0.5))
    L = layer(); d = ImageDraw.Draw(L)
    for bx in (260, 1980):                      # giuong tang
        d.rectangle([bx, 360, bx + 560, 380], fill=(70, 74, 60, 255)); d.rectangle([bx, 640, bx + 560, 660], fill=(70, 74, 60, 255))
        for k in (0, 560):
            d.rectangle([bx + k - 8, 330, bx + k + 8, 1010], fill=(40, 42, 36, 255))
        d.rectangle([bx + 20, 330, bx + 540, 360], fill=(120, 110, 80, 255)); d.rectangle([bx + 20, 610, bx + 540, 640], fill=(100, 92, 70, 255))
    d.rectangle([1100, 850, 1500, 880], fill=(96, 68, 44, 255)); d.rectangle([1120, 880, 1140, 1010], fill=(70, 50, 34, 255)); d.rectangle([1460, 880, 1480, 1010], fill=(70, 50, 34, 255))
    d.polygon([(1130, 850), (1470, 850), (1430, 820), (1170, 820)], fill=(214, 200, 160, 255))
    d.rectangle([2700, 560, 3000, 1010], fill=(70, 76, 60, 255), outline=(30, 34, 26, 255), width=6)
    bg.put(L, shadow=(14, 10, 16, 0.55))
    bg.floor(FY, vp=(1600, 560), lines=16, rows=7, c0=p["floor"], c1=p["floor2"])
    for x in (700, 1600, 2600):
        bulb(bg, x, 330, 0)


def war_street(bg):
    p, rng, night = bg.p, bg.rng, bg.night
    bg.fill(0, 0, WW, 1010, p["sky"][0], p["sky"][1])
    L = layer(); d = ImageDraw.Draw(L)
    if night: stars(d, rng, 60, 380, col=(255, 230, 210))
    bg.put(L, shadow=None)
    bg.glow(1900, 960, 1100, p["accent"], 0.85 if night else 0.3, flick=True)
    smoke(bg, 600, 900, 780, 120, col=shade(p["ink"], 2.0), a=110)
    smoke(bg, 2500, 900, 700, 120, col=shade(p["ink"], 2.2), a=110)
    skyline(bg, 920, p["far"], rng, 240, 520, 140, 280, wins=None, jag=True, blur=3)
    skyline(bg, 960, p["mid"], rng, 220, 560, 160, 300, wins=((255, 150, 70) if night else shade(p["sky"][0], 0.9), 0.1), jag=True, shadow=(24, 10, 40, 0.5))
    if night:
        sl = layer(); d = ImageDraw.Draw(sl)
        d.polygon([(900, 1010), (960, 1010), (1500, 0), (1360, 0)], fill=(240, 240, 210, 40))
        d.polygon([(2300, 1010), (2360, 1010), (1900, 0), (1780, 0)], fill=(240, 240, 210, 36))
        bg.img.paste(sl.convert("RGB"), (0, 0), sl.split()[3])
    bg.floor(960, vp=(1600, 700), lines=10, rows=6, c0=shade(p["floor"], 1.0), c1=shade(p["floor2"], 0.8), lc=shade(p["floor2"], 0.55) + (140,))
    L = layer(); d = ImageDraw.Draw(L)
    for _ in range(46):                                  # da vun / gach vo
        x, y, w = rng.uniform(0, WW), rng.uniform(970, 1590), rng.uniform(14, 70)
        d.polygon([(x, y), (x + w, y - w * 0.3), (x + w * 1.1, y + w * 0.4), (x + w * 0.3, y + w * 0.6)], fill=shade(p["floor2"], rng.uniform(0.6, 1.0)) + (255,))
    for x in (260, 2900):
        hedgehog(d, x, 960, 100, shade(p["ink"], 2.2))
    sandbags(d, 2560, 990, 5, 3, shade((150, 134, 98), 0.75 if night else 1.0))
    dead_tree(d, 1500, 965, 420, shade(p["ink"], 2.2), rng)
    bg.put(L, shadow=(10, 8, 12, 0.5))


def war_outdoor(bg):
    p, rng, night = bg.p, bg.rng, bg.night
    bg.fill(0, 0, WW, 1010, p["sky"][0], p["sky"][1])
    L = layer(); d = ImageDraw.Draw(L)
    if night: stars(d, rng, 90, 420, col=(255, 230, 210))
    bg.put(L, shadow=None)
    bg.glow(800, 880, 900, p["accent"], 0.75 if night else 0.28)
    bg.glow(2500, 900, 700, p["accent"], 0.55 if night else 0.2)
    smoke(bg, 1100, 880, 700, 140, col=shade(p["ink"], 2.2), a=100)
    smoke(bg, 2300, 880, 620, 140, col=shade(p["ink"], 2.2), a=100)
    mountain(bg, 840, 150, p["far"], rng, blur=3)
    mountain(bg, 910, 120, p["mid"], rng, blur=1, shadow=(0, 12, 40, 0.4))
    L = layer(); d = ImageDraw.Draw(L)
    for _ in range(9):
        dead_tree(d, rng.uniform(80, WW - 80), rng.uniform(930, 990), rng.uniform(260, 420), shade(p["ink"], 2.0), rng)
    bg.put(L, shadow=(10, 8, 12, 0.4))
    bg.fill(0, 950, WW, WH, shade(p["floor"], 1.0), shade(p["floor2"], 0.8))
    L = layer(); d = ImageDraw.Draw(L)
    for _ in range(30):                                  # ho bom
        x, y, w = rng.uniform(0, WW), rng.uniform(1040, 1560), rng.uniform(80, 220)
        d.ellipse([x, y, x + w, y + w * 0.28], fill=shade(p["floor2"], 0.62) + (255,))
    d.rectangle([0, 920, WW, 1010], fill=shade(p["floor2"], 0.7) + (255,))
    sandbags(d, -20, 1010, 34, 2, shade((150, 134, 98), 0.78 if night else 1.0))
    barbed(d, 200, 1400, 880, shade(p["ink"], 2.4))
    barbed(d, 1900, 3100, 890, shade(p["ink"], 2.4))
    for x in range(260, 3100, 340):
        d.line([x, 840, x, 960], fill=shade(p["ink"], 2.4) + (255,), width=8)
    bg.put(L, shadow=(8, 8, 10, 0.5))


# ================================================================ NGUOI NGUYEN THUY
def flame(bg, x, y, s, rng=None):
    rng = rng or bg.rng
    L = layer(); d = ImageDraw.Draw(L)
    for k_, (c, sc_) in enumerate((((214, 64, 30), 1.0), ((255, 140, 40), 0.74), ((255, 210, 90), 0.46))):
        for j in range(-1, 2):
            hh = s * sc_ * (1.15 - 0.3 * abs(j) + rng.uniform(-0.05, 0.05))
            w = s * 0.34 * sc_
            cx = x + j * s * 0.26 * sc_
            d.polygon([(cx - w, y), (cx - w * 0.5, y - hh * 0.55), (cx + (j * 0.1) * s, y - hh), (cx + w * 0.5, y - hh * 0.55), (cx + w, y)], fill=c + (255,))
    bg.put(L, shadow=None)
    bg.glow(x, y - s * 0.4, s * 5.5, (255, 150, 60), 0.95)


def campfire(bg, x, y, s):
    L = layer(); d = ImageDraw.Draw(L)
    for i in range(9):
        a = math.pi * i / 8
        d.ellipse([x + math.cos(a) * s * 0.62 - s * 0.14, y + math.sin(a) * s * 0.12 - s * 0.08, x + math.cos(a) * s * 0.62 + s * 0.14, y + math.sin(a) * s * 0.12 + s * 0.1], fill=(96, 90, 88, 255))
    for ang in (-0.5, 0.0, 0.5):
        d.line([x + math.sin(ang) * s * 0.5, y - s * 0.02, x - math.sin(ang) * s * 0.5, y - s * 0.12], fill=(70, 44, 28, 255), width=int(s * 0.1))
    bg.put(L, shadow=(0, 6, 8, 0.4))
    flame(bg, x, y - s * 0.06, s * 0.9)


def cave_paint(d, x, y, s, rng, col=(190, 90, 60)):
    for k_ in range(5):                                              # ban tay
        ax = x + (k_ - 2) * s * 0.07
        d.line([ax, y, ax + (k_ - 2) * s * 0.02, y - s * (0.2 + 0.05 * (k_ in (1, 2, 3)))], fill=col + (255,), width=int(s * 0.05))
    d.ellipse([x - s * 0.1, y - s * 0.02, x + s * 0.1, y + s * 0.15], fill=col + (255,))


def animal_paint(d, x, y, s, col):                                    # bo rung / huou ve tren vach hang
    d.ellipse([x - s * 0.5, y - s * 0.2, x + s * 0.5, y + s * 0.2], fill=col + (255,))
    d.ellipse([x + s * 0.35, y - s * 0.32, x + s * 0.7, y - s * 0.05], fill=col + (255,))
    for lx in (-0.38, -0.2, 0.2, 0.38):
        d.line([x + lx * s, y + s * 0.1, x + lx * s, y + s * 0.5], fill=col + (255,), width=int(s * 0.07))
    d.line([x + s * 0.55, y - s * 0.3, x + s * 0.75, y - s * 0.55, x + s * 0.7, y - s * 0.7], fill=col + (255,), width=int(s * 0.05))
    d.line([x + s * 0.55, y - s * 0.3, x + s * 0.45, y - s * 0.55, x + s * 0.5, y - s * 0.7], fill=col + (255,), width=int(s * 0.05))


def rock_wall(bg, y0, y1, c0, c1, rng, blob=70):
    bg.fill(0, y0, WW, y1, c0, c1)
    L = layer(); d = ImageDraw.Draw(L)
    for _ in range(220):
        x, y = rng.uniform(0, WW), rng.uniform(y0, y1)
        w, h = rng.uniform(60, 260), rng.uniform(30, 120)
        k_ = rng.uniform(0.8, 1.18)
        d.polygon([(x, y), (x + w * 0.4, y - h * 0.5), (x + w, y - h * 0.1), (x + w * 0.8, y + h * 0.5), (x + w * 0.2, y + h * 0.6)], fill=shade(mixc(c0, c1, 0.5), k_) + (90,))
    L = L.filter(ImageFilter.GaussianBlur(3))
    bg.img.paste(L.convert("RGB"), (0, 0), L.split()[3])


def stalactites(bg, y0, col, rng, n=30, hmax=340, up=True):
    L = layer(); d = ImageDraw.Draw(L)
    x = -40
    while x < WW + 40:
        w = rng.uniform(70, 190); h = rng.uniform(70, hmax)
        if up:
            d.polygon([(x, y0), (x + w, y0), (x + w * 0.55, y0 + h)], fill=shade(col, rng.uniform(0.85, 1.15)) + (255,))
        else:
            d.polygon([(x, y0), (x + w, y0), (x + w * 0.5, y0 - h)], fill=shade(col, rng.uniform(0.85, 1.15)) + (255,))
        x += w * rng.uniform(0.6, 1.0)
    bg.put(L, shadow=(0, 18, 20, 0.5))


def prim_room(bg):                                                # hang dong co lua trai
    p, rng, night = bg.p, bg.rng, bg.night
    rock_wall(bg, 0, FY, shade(p["wall"], 0.7), p["wall2"], rng)
    # cua hang: o sang nhin ra ngoai
    L = layer(); d = ImageDraw.Draw(L)
    mouth = [(2280, FY), (2300, 560), (2450, 330), (2700, 230), (2950, 330), (3080, 560), (3100, FY)]
    d.polygon(mouth, fill=(255, 255, 255, 255))
    m = Image.new("L", (WW, WH), 0); ImageDraw.Draw(m).polygon(mouth, fill=255)
    out = vgrad(WW, FY, p["sky"][0], p["sky"][1])
    bg.img.paste(out, (0, 0), m.crop((0, 0, WW, FY)))
    L2 = layer(); d2 = ImageDraw.Draw(L2)
    for b_, c_ in ((880, p["far"]), (950, p["mid"])):
        d2.polygon(ridge(rng, b_, 130) + [(WW, FY), (0, FY)], fill=c_ + (255,))
    d2.rectangle([0, 960, WW, FY], fill=p["near"] + (255,))
    for tx in (2400, 2700, 2900):
        d2.polygon([(tx, 960), (tx + 30, 960), (tx + 15, 700)], fill=shade(p["near"], 0.7) + (255,)); d2.ellipse([tx - 60, 620, tx + 90, 780], fill=shade(p["near"], 1.2) + (255,))
    clipped = Image.new("RGBA", (WW, WH), (0, 0, 0, 0)); clipped.paste(L2, (0, 0), m)
    bg.img.paste(clipped.convert("RGB"), (0, 0), clipped.split()[3])
    if night:
        L3 = layer(); stars(ImageDraw.Draw(L3), rng, 60, 500)
        c3 = Image.new("RGBA", (WW, WH), (0, 0, 0, 0)); c3.paste(L3, (0, 0), m); bg.img.paste(c3.convert("RGB"), (0, 0), c3.split()[3])
    else:
        sh = layer(); ImageDraw.Draw(sh).polygon([(2300, FY), (2900, FY), (1900, 1500), (1300, 1500)], fill=(255, 240, 200, 50)); bg.img.paste(sh.convert("RGB"), (0, 0), sh.split()[3])
    # vien cua hang
    ed = layer(); ImageDraw.Draw(ed).line(mouth, fill=shade(p["wall2"], 0.55) + (255,), width=40, joint="curve")
    bg.put(ed, shadow=(0, 0, 18, 0.6))
    stalactites(bg, -10, shade(p["wall2"], 0.8), rng, hmax=300)
    L = layer(); d = ImageDraw.Draw(L)
    for (x, y, s_) in ((420, 520, 300), (760, 620, 240), (1240, 480, 280)):
        cave_paint(d, x, y, s_, rng, (186, 88, 58))
    animal_paint(d, 920, 420, 230, (170, 78, 52)); animal_paint(d, 330, 780, 190, (210, 170, 120))
    d.line([1500, 300, 1600, 380, 1560, 470], fill=(210, 170, 120, 255), width=18)
    bg.put(L, shadow=None)
    bg.floor(FY, vp=(1600, 500), lines=10, rows=6, c0=shade(p["floor"], 0.9), c1=shade(p["floor2"], 0.8), lc=shade(p["floor2"], 0.7) + (120,))
    L = layer(); d = ImageDraw.Draw(L)
    for _ in range(26):
        x, y, w = rng.uniform(0, WW), rng.uniform(1040, 1580), rng.uniform(40, 150)
        d.polygon([(x, y), (x + w, y - w * 0.25), (x + w * 1.1, y + w * 0.3), (x + w * 0.3, y + w * 0.45)], fill=shade(p["floor2"], rng.uniform(0.6, 0.95)) + (255,))
    for bx in (200, 1900):                                           # chong da
        d.ellipse([bx, 880, bx + 300, 1050], fill=(130, 100, 70, 255)); d.ellipse([bx + 30, 850, bx + 270, 990], fill=(176, 140, 96, 255))
    for k_ in range(6):                                              # xuong
        x = 1080 + k_ * 36; d.line([x, 990, x + 30, 1020], fill=(236, 228, 208, 255), width=9); d.ellipse([x - 8, 984, x + 6, 996], fill=(236, 228, 208, 255))
    bg.put(L, shadow=(8, 8, 10, 0.5))
    campfire(bg, 1560, 1070, 200)


def prim_hall(bg):                                                # dai hang: cot da, duoc, vach ve
    p, rng, night = bg.p, bg.rng, bg.night
    rock_wall(bg, 0, FY, shade(p["wall"], 0.55), shade(p["wall2"], 0.9), rng)
    L = layer(); d = ImageDraw.Draw(L)
    for (x, y, s_) in ((300, 480, 320), (2820, 520, 300)):
        cave_paint(d, x, y, s_, rng, (186, 88, 58))
    animal_paint(d, 760, 400, 260, (200, 160, 110)); animal_paint(d, 2300, 380, 280, (176, 84, 56)); animal_paint(d, 1600, 300, 230, (210, 170, 120))
    bg.put(L, shadow=None)
    stalactites(bg, -10, shade(p["wall2"], 0.75), rng, hmax=460)
    L = layer(); d = ImageDraw.Draw(L)
    for x in (540, 1280, 1980, 2700):                                # cot da (nhu + mang)
        w = rng.uniform(150, 220)
        d.polygon([(x - w * 0.5, 0), (x + w * 0.5, 0), (x + w * 0.3, 500), (x + w * 0.62, FY), (x - w * 0.62, FY), (x - w * 0.3, 500)], fill=shade(p["wall2"], 1.0) + (255,))
        d.polygon([(x - w * 0.5, 0), (x - w * 0.2, 0), (x - w * 0.12, 500), (x - w * 0.3, FY), (x - w * 0.62, FY), (x - w * 0.3, 500)], fill=shade(p["wall2"], 1.18) + (255,))
    bg.put(L, shadow=(22, 12, 30, 0.55))
    L = layer(); d = ImageDraw.Draw(L)
    d.rectangle([0, 0, 0, 0])
    bg.put(L, shadow=None)
    bg.floor(FY, vp=(1600, 520), lines=10, rows=7, c0=shade(p["floor"], 0.9), c1=shade(p["floor2"], 0.75), lc=shade(p["floor2"], 0.6) + (110,))
    L = layer(); d = ImageDraw.Draw(L)
    d.polygon([(1250, 1010), (1950, 1010), (1880, 790), (1320, 790)], fill=(120, 106, 96, 255))     # ngai da
    d.polygon([(1340, 790), (1860, 790), (1840, 560), (1360, 560)], fill=(142, 126, 114, 255))
    for sx in (-1, 1):
        d.polygon([(1600 + sx * 330, 790), (1600 + sx * 430, 640), (1600 + sx * 500, 470), (1600 + sx * 420, 470), (1600 + sx * 360, 640)], fill=(240, 232, 212, 255))   # nga voi
    d.ellipse([1560, 520, 1640, 600], fill=(240, 232, 212, 255)); d.ellipse([1572, 546, 1590, 566], fill=(30, 24, 24, 255)); d.ellipse([1610, 546, 1628, 566], fill=(30, 24, 24, 255))
    for x in (260, 2940):                                            # cot totem so thu
        d.rectangle([x - 18, 520, x + 18, FY], fill=(96, 70, 46, 255)); d.ellipse([x - 54, 420, x + 54, 540], fill=(240, 232, 212, 255))
        d.ellipse([x - 28, 460, x - 6, 490], fill=(30, 24, 24, 255)); d.ellipse([x + 6, 460, x + 28, 490], fill=(30, 24, 24, 255))
    bg.put(L, shadow=(10, 10, 12, 0.5))
    for x in (260, 2940):
        flame(bg, x, 410, 130)
    campfire(bg, 760, 1160, 200); campfire(bg, 2420, 1180, 200)


def prim_street(bg):                                              # bo lac: leu da thu, gia phoi thit, cot totem
    p, rng, night = bg.p, bg.rng, bg.night
    bg.fill(0, 0, WW, 1010, p["sky"][0], p["sky"][1])
    L = layer(); d = ImageDraw.Draw(L)
    if night:
        stars(d, rng, 150, 520); d.ellipse([2500, 150, 2650, 300], fill=(250, 240, 214, 255))
    else:
        d.ellipse([2400, 140, 2560, 300], fill=(255, 240, 180, 255))
    bg.put(L, shadow=None)
    bg.glow(2570 if night else 2480, 220, 420, (240, 230, 190) if night else (255, 220, 140), 0.5, flick=False)
    mountain(bg, 680, 240, p["far"], rng, blur=3)
    L = layer(); d = ImageDraw.Draw(L)                                # nui lua
    d.polygon([(380, 760), (700, 330), (780, 300), (860, 330), (1200, 760)], fill=shade(p["far"], 0.8) + (255,))
    bg.put(L, shadow=None, blur=2)
    if night:
        bg.glow(780, 310, 380, (255, 110, 40), 0.9)
    smoke(bg, 780, 300, 360, 70, col=shade(p["ink"], 2.4), a=110)
    mist(bg, 780, 220, mixc(p["sky"][1], p["far"], 0.2), 0.5)
    mountain(bg, 880, 150, p["mid"], rng, blur=1, shadow=(0, 12, 40, 0.4))
    bg.fill(0, 900, WW, WH, shade(p["near"], 1.15), shade(p["floor2"], 0.9))
    L = layer(); d = ImageDraw.Draw(L)
    for tx, tw, th in ((300, 540, 560), (1140, 620, 640), (2060, 520, 520), (2780, 600, 600)):    # leu da thu
        d.polygon([(tx - tw / 2, 990), (tx, 990 - th), (tx + tw / 2, 990)], fill=shade((176, 130, 86), 0.7 if night else 1.0) + (255,), outline=shade((96, 64, 40), 0.8) + (255,), width=6)
        for q in range(-2, 3):
            d.line([tx, 990 - th, tx + q * tw * 0.2, 990], fill=shade((110, 76, 48), 0.8) + (255,), width=5)
        d.polygon([(tx - tw * 0.1, 990), (tx, 990 - th * 0.38), (tx + tw * 0.1, 990)], fill=(30, 20, 16, 255))
        d.line([tx, 990 - th, tx - 8, 990 - th - 70], fill=(96, 64, 40, 255), width=10)
        d.line([tx, 990 - th, tx + 22, 990 - th - 60], fill=(96, 64, 40, 255), width=10)
        for ox_ in (-1, 0, 1):
            cave_paint(d, tx + ox_ * tw * 0.18, 940 - th * 0.15, 80, rng, (170, 70, 50))
    bg.put(L, shadow=(12, 8, 24, 0.5))
    L = layer(); d = ImageDraw.Draw(L)
    for x in (720, 1700, 2500):                                       # gia phoi thit
        d.line([x - 130, 940, x - 130, 1010], fill=(96, 70, 46, 255), width=14); d.line([x + 130, 940, x + 130, 1010], fill=(96, 70, 46, 255), width=14)
        d.line([x - 140, 944, x + 140, 944], fill=(96, 70, 46, 255), width=12)
        for q in range(-2, 3):
            d.polygon([(x + q * 52 - 18, 950), (x + q * 52 + 18, 950), (x + q * 52 + 12, 1010), (x + q * 52 - 12, 1010)], fill=(170, 70, 60, 255))
    for x in (1500, 3100):                                            # totem
        d.rectangle([x - 22, 560, x + 22, 1010], fill=(110, 78, 50, 255))
        for k_, c_ in enumerate(((190, 80, 54), (240, 220, 180), (80, 120, 150))):
            d.polygon([(x - 50, 600 + k_ * 120), (x + 50, 600 + k_ * 120), (x + 36, 700 + k_ * 120), (x - 36, 700 + k_ * 120)], fill=c_ + (255,))
            d.ellipse([x - 24, 622 + k_ * 120, x - 6, 640 + k_ * 120], fill=(30, 20, 20, 255)); d.ellipse([x + 6, 622 + k_ * 120, x + 24, 640 + k_ * 120], fill=(30, 20, 20, 255))
    bg.put(L, shadow=(8, 8, 10, 0.5))
    L = layer(); d = ImageDraw.Draw(L)
    for _ in range(80):
        x, y = rng.uniform(0, WW), rng.uniform(1030, 1590)
        for g in range(3):
            d.line([x, y, x + rng.uniform(-14, 14), y - rng.uniform(26, 60)], fill=shade((100, 130, 70), rng.uniform(0.6, 1.0) if not night else 0.4) + (255,), width=4)
    bg.put(L, shadow=None)
    campfire(bg, 1300, 1100, 190)


def prim_outdoor(bg):                                             # thao nguyen - nui - nui lua
    p, rng, night = bg.p, bg.rng, bg.night
    bg.fill(0, 0, WW, 1010, p["sky"][0], p["sky"][1])
    L = layer(); d = ImageDraw.Draw(L)
    if night:
        stars(d, rng, 220, 600); d.ellipse([500, 140, 740, 380], fill=(250, 240, 214, 255))
    else:
        d.ellipse([2300, 120, 2560, 380], fill=(255, 238, 170, 255))
        for _ in range(5):
            cx, cy = rng.uniform(100, 3000), rng.uniform(100, 420)
            for k_ in range(5):
                r = rng.uniform(40, 80); d.ellipse([cx + k_ * 62 - r, cy - r * 0.6, cx + k_ * 62 + r, cy + r * 0.6], fill=(255, 255, 255, 220))
    bg.put(L, shadow=None, blur=2)
    bg.glow(620 if night else 2430, 260, 600, (230, 230, 255) if night else (255, 220, 140), 0.55, flick=False)
    mountain(bg, 700, 260, mixc(p["far"], p["sky"][1], 0.5), rng, blur=4)
    L = layer(); d = ImageDraw.Draw(L)                                # nui lua + dong dung nham
    vx = 2100
    d.polygon([(vx - 700, 860), (vx - 90, 360), (vx + 90, 360), (vx + 700, 860)], fill=shade(p["far"], 0.75) + (255,))
    d.polygon([(vx - 90, 360), (vx + 90, 360), (vx + 40, 420), (vx - 30, 400)], fill=(255, 110, 40, 255) if night else (200, 90, 50, 255))
    d.line([vx - 20, 400, vx - 120, 560, vx - 60, 700], fill=(255, 120, 40, 255) if night else (190, 90, 50, 255), width=16)
    d.line([vx + 30, 410, vx + 130, 590, vx + 90, 760], fill=(255, 120, 40, 255) if night else (190, 90, 50, 255), width=12)
    bg.put(L, shadow=None, blur=2)
    if night: bg.glow(vx, 380, 700, (255, 100, 30), 1.0)
    smoke(bg, vx, 360, 520, 100, col=shade(p["ink"], 2.2), a=100)
    mist(bg, 800, 200, mixc(p["sky"][1], p["far"], 0.3), 0.5)
    mountain(bg, 880, 190, p["mid"], rng, blur=1.5, shadow=(0, 12, 40, 0.4))
    L = layer(); d = ImageDraw.Draw(L)                                # dan voi ma mut xa
    for i, mx in enumerate((300, 520, 760)):
        c_ = shade(p["mid"], 0.55)
        d.ellipse([mx - 90, 800, mx + 90, 900], fill=c_ + (255,)); d.ellipse([mx + 50, 780, mx + 120, 860], fill=c_ + (255,))
        d.line([mx + 100, 830, mx + 118, 900, mx + 100, 920], fill=c_ + (255,), width=12)
        d.line([mx + 90, 850, mx + 140, 880, mx + 140, 860], fill=shade((240, 232, 212), 0.6) + (255,), width=6)
        for lx in (-60, -25, 25, 60): d.rectangle([mx + lx - 8, 880, mx + lx + 8, 940], fill=c_ + (255,))
    bg.put(L, shadow=None, blur=1)
    bg.fill(0, 930, WW, WH, shade((150, 140, 80) if not night else (50, 56, 44), 1.0), shade((110, 100, 60) if not night else (28, 32, 28), 1.0))
    L = layer(); d = ImageDraw.Draw(L)
    for x in (260, 1500, 2860):                                        # cay keo (acacia)
        d.line([x, 960, x - 20, 760, x + 40, 640], fill=shade(p["ink"], 2.2) + (255,), width=26)
        d.ellipse([x - 280, 580, x + 360, 700], fill=shade((90, 120, 60), 0.5 if night else 1.0) + (255,))
        d.ellipse([x - 180, 540, x + 280, 640], fill=shade((100, 134, 66), 0.5 if night else 1.1) + (255,))
    for _ in range(7):
        x, y, w = rng.uniform(0, WW), rng.uniform(990, 1040), rng.uniform(100, 280)
        d.polygon([(x, y), (x + w * 0.2, y - w * 0.4), (x + w * 0.7, y - w * 0.3), (x + w, y)], fill=shade((128, 118, 108), 0.5 if night else 1.0) + (255,))
    bg.put(L, shadow=(10, 8, 12, 0.45))
    L = layer(); d = ImageDraw.Draw(L)
    for _ in range(420):
        x, y = rng.uniform(0, WW), rng.uniform(1010, 1600)
        h = rng.uniform(40, 120) * (0.6 + (y - 1010) / 590)
        c_ = shade((176, 160, 90) if rng.random() < 0.6 else (120, 150, 70), 0.45 if night else 1.0)
        for g in range(3):
            d.line([x, y, x + rng.uniform(-24, 24), y - h], fill=c_ + (255,), width=5)
    bg.put(L, shadow=None)


PRIM = {("ancient", "room"): prim_room, ("ancient", "hall"): prim_hall, ("ancient", "street"): prim_street, ("ancient", "outdoor"): prim_outdoor}


BUILD = {("modern", "hall"): modern_hall, ("modern", "room"): modern_room, ("modern", "street"): modern_street, ("modern", "outdoor"): modern_outdoor,
         ("imperial", "hall"): ancient_hall, ("imperial", "room"): ancient_room, ("imperial", "street"): ancient_street, ("imperial", "outdoor"): ancient_outdoor,
         ("war", "hall"): war_hall, ("war", "room"): war_room, ("war", "street"): war_street, ("war", "outdoor"): war_outdoor}

BUILD.update(PRIM)
_cache = {}


def get_bg(era, theme, night, seed=1):
    key = (era, theme, night)
    if key in _cache:
        return _cache[key]
    p = PAL[(era, night)]
    bg = BG(p, night, seed + hash((era, theme)) % 97 * 0 + (1 if night else 2))
    BUILD[(era, theme)](bg)
    if len(_cache) > 4:
        _cache.pop(next(iter(_cache)))
    _cache[key] = bg
    return bg
