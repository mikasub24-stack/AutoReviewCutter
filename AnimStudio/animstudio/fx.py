# -*- coding: utf-8 -*-
"""Hieu ung toan khung hinh theo 'cue' (tu loi thoai): no, sam set, sung, lua, tuyet, suong, hoang hon... va rung may."""
import math
import numpy as np
from PIL import Image, ImageDraw, ImageFilter
from .common import clamp, h01


def active(P, t, names=None, kind=None):
    return [c for c in P.cues if c.start <= t <= c.end and (names is None or c.name in names) and (kind is None or c.kind == kind)]


def shake_at(P, t):
    """Do lech camera (met) do no / sung."""
    dx = dy = 0.0
    for c in active(P, t, ("explosion",)):
        a = (1 - (t - c.start) / max(c.end - c.start, 0.1)) ** 2
        dx += 0.09 * a * math.sin(t * 61 + c.seed * 9)
        dy += 0.06 * a * math.sin(t * 73 + c.seed * 5)
    for c in active(P, t, ("gunfire",)):
        dy += 0.012 * math.sin(t * 90)
    return dx, dy


def _screen(a, layer):
    return 255 - (255 - a) * (1 - layer / 255.0)


def apply_fx(img, P, t, sc):
    W, H = img.size
    a = np.asarray(img).astype(np.float32)
    ov = None
    d = None
    draw_img = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    d = ImageDraw.Draw(draw_img, "RGBA")
    add = np.zeros((H, W, 3), np.float32)
    mult = np.ones(3, np.float32)
    # ---- ban dem/hoang hon (cue 'dusk')
    if sc.dusk or active(P, t, ("dusk",)):
        mult = mult * np.array([1.08, 0.92, 0.78], np.float32)
        add[..., 0] += 14
    # ---- thoi tiet
    snow = sc.snow or active(P, t, ("snow",))
    if snow:
        for i in range(90):
            s1, s2, s3 = h01(str(i), "sx"), h01(str(i), "sy"), h01(str(i), "ss")
            x = (s1 * W + math.sin(t * 0.8 + s2 * 9) * 24 * W / 1000) % W
            y = ((s2 + t * (0.08 + 0.1 * s3)) % 1.0) * H
            r = max(1.5, (1.5 + 3 * s3) * W / 1280)
            d.ellipse([x - r, y - r, x + r, y + r], fill=(255, 255, 255, int(150 + 100 * s3)))
        mult = mult * np.array([0.95, 0.98, 1.06], np.float32)
    fog = sc.fog or active(P, t, ("fog",))
    if fog:
        for i in range(5):
            y = H * (0.45 + 0.12 * i)
            x = ((t * (6 + 3 * i) + i * W * 0.37) % (W * 1.6)) - W * 0.3
            d.ellipse([x - W * 0.5, y - H * 0.09, x + W * 0.5, y + H * 0.09], fill=(220, 226, 232, 52))
        add += 12
    if active(P, t, ("wind",)):
        for i in range(26):
            s1, s2, s3 = h01(str(i), "wx"), h01(str(i), "wy"), h01(str(i), "ws")
            x = ((s1 + t * (0.45 + 0.4 * s3)) % 1.2) * W - 0.1 * W
            y = s2 * H + math.sin(t * 3 + s3 * 7) * 14
            L = W * (0.04 + 0.05 * s3)
            d.line([x - L, y, x, y + math.sin(t * 5 + i) * 4], fill=(230, 230, 220, 90), width=max(1, W // 600))
    if active(P, t, ("dust",)):
        for i in range(40):
            s1, s2, s3 = h01(str(i), "dx"), h01(str(i), "dy"), h01(str(i), "ds")
            x = ((s1 + t * 0.2 * s3) % 1.0) * W; y = ((s2 + t * 0.03) % 1.0) * H
            r = max(1, 2 * W / 1280)
            d.ellipse([x - r, y - r, x + r, y + r], fill=(220, 200, 160, 120))
    # ---- lua
    fires = active(P, t, ("fire",))
    if fires:
        k = 0.8 + 0.2 * math.sin(t * 17) * math.sin(t * 5.3)
        yy = np.linspace(0, 1, H)[:, None, None]
        glow = np.clip((yy - 0.45) / 0.55, 0, 1) ** 1.5 * 55 * k
        add += glow * np.array([1.0, 0.45, 0.1], np.float32)
        for i in range(30):
            s1, s2, s3 = h01(str(i), "fx"), h01(str(i), "fy"), h01(str(i), "fs")
            x = (s1 * W + math.sin(t * 1.3 + s2 * 9) * 30) % W
            y = H - ((t * (70 + 90 * s3) * H / 1000 + s2 * H) % H) * 0.8
            r = max(1.5, (1 + 2.2 * s3) * W / 1280)
            d.ellipse([x - r, y - r, x + r, y + r], fill=(255, 170 + int(70 * s3), 70, 220))
    # ---- no
    for c in active(P, t, ("explosion",)):
        u = (t - c.start) / max(c.end - c.start, 0.1)
        cx, cy = W * (0.22 + 0.56 * h01(str(c.seed), "ex")), H * (0.42 + 0.12 * h01(str(c.seed), "ey"))
        R = W * (0.05 + 0.15 * math.sqrt(u))
        fa = int(255 * clamp(1.6 - u * 1.6))
        ow = max(2, W // 260)
        def star(rr, n, jit, rot, fill, outline=True):
            pts = []
            for j in range(n * 2):
                rj = rr * (1.0 if j % 2 == 0 else 0.62) * (1 + jit * (h01(str(j), f"st{c.seed}") - 0.5))
                ang = rot + math.pi * j / n
                pts.append((cx + math.cos(ang) * rj, cy + math.sin(ang) * rj * 0.9))
            d.polygon(pts, fill=fill + (fa,), outline=(30, 20, 24, fa) if outline else None, width=ow)
        # khoi khoi (hoat hinh): may khoi xam vien den
        for j in range(7):
            sx = cx + (j - 3) * R * 0.34 + math.sin(j * 2.1) * R * 0.2
            sy = cy - R * (0.55 + 0.9 * u) - (j % 3) * R * 0.22
            rr = R * (0.42 + 0.1 * (j % 3)) * (0.5 + u)
            sa = int(235 * clamp(u * 4) * (1 - 0.7 * u))
            d.ellipse([sx - rr, sy - rr, sx + rr, sy + rr], fill=(92, 88, 96, sa), outline=(30, 24, 30, sa), width=ow)
        rot = c.seed * 0.7 + u * 0.4
        star(R * 1.05, 11, 0.35, rot, (226, 60, 36))
        star(R * 0.78, 11, 0.3, rot + 0.2, (255, 150, 40))
        star(R * 0.52, 9, 0.25, rot + 0.4, (255, 226, 90))
        star(R * 0.28, 8, 0.2, rot, (255, 252, 226), outline=False)
        add += 255 * clamp(1 - u * 5) * 0.55 * np.array([1.0, 0.85, 0.6], np.float32)
    # ---- sung
    for c in active(P, t, ("gunfire",)):
        ph = (t - c.start) * 11
        if (ph % 1.0) < 0.35 and h01(str(int(ph)), str(c.seed)) > 0.2:
            for j in range(2):
                sx = W * (0.08 + 0.84 * h01(str(int(ph)), f"gx{j}{c.seed}"))
                sy = H * (0.5 + 0.2 * h01(str(int(ph)), f"gy{j}{c.seed}"))
                r = W * 0.025
                d.polygon([(sx, sy - r), (sx + r * 0.3, sy - r * 0.3), (sx + r, sy), (sx + r * 0.3, sy + r * 0.3), (sx, sy + r), (sx - r * 0.3, sy + r * 0.3), (sx - r, sy), (sx - r * 0.3, sy - r * 0.3)], fill=(255, 230, 140, 230))
            add += 40
    # ---- set
    for c in active(P, t, ("thunder",)):
        u = t - c.start
        fl = (1.0 if u < 0.09 else 0.0) + (0.8 if 0.18 < u < 0.26 else 0.0) + (0.3 if 0.26 < u < 0.7 else 0.0) * (1 - u)
        add += 255 * fl * 0.55 * np.array([0.85, 0.9, 1.0], np.float32)
        if u < 0.3:
            x = W * (0.2 + 0.6 * h01(str(c.seed), "bx")); y = 0.0
            pts = [(x, y)]
            for j in range(9):
                x += (h01(str(j), f"bj{c.seed}") - 0.5) * W * 0.09; y += H * 0.07
                pts.append((x, y))
            d.line(pts, fill=(245, 245, 255, 255), width=max(2, W // 300))
    arr = np.asarray(draw_img).astype(np.float32)
    al = arr[..., 3:4] / 255.0
    a = a * mult
    a = a * (1 - al) + arr[..., :3] * al
    a = _screen(a, np.clip(add, 0, 255)) if add.any() else a
    return Image.fromarray(np.clip(a, 0, 255).astype(np.uint8))


# ---------------------------------------------------------------- hieu ung phu NHE cho che do "Flow ve tron khung"
# Chi ap o buoc HOAN THIEN (P.fx_final) - video co ban chi zoom/lia. Tu khoa: 'abc*' = tien to, con lai = nguyen tu.
import re as _re
_KW = {
    "snow": ["tuyết", "snow*", "blizzard", "băng giá", "neige*", "schnee*", "schnei*", "nieve*", "nieva*", "neve", "nevando", "sneeuw*", "снег*", "salju", "下雪", "雪花", "暴雪", "大雪", "风雪", "降雪", "吹雪", "雪が", "눈보라", "폭설", "함박눈", "หิมะ"],
    "fog": ["sương", "mù", "fog*", "mist*", "haze", "khói", "smoke", "brouillard*", "brume", "nebel*", "niebla*", "nevoeiro*", "neblina*", "nebbia*", "туман*", "kabut", "大雾", "浓雾", "雾气", "烟雾", "迷雾", "霧", "안개", "หมอก", "ควัน"],
    "rain": ["mưa", "rain*", "storm*", "bão", "giông", "regn*", "pluie*", "pleut*", "regen*", "lluvia*", "llueve*", "chuva*", "chove*", "pioggia*", "piove", "дожд*", "hujan", "下雨", "大雨", "暴雨", "雨水", "雨滴", "雷雨", "豪雨", "雨が", "폭우", "소나기", "빗물", "ฝนตก", "พายุ"],
    "wind": ["gió", "wind", "winds", "windy", "gale", "vent", "vents", "viento*", "vento*", "ветер", "ветра", "angin", "大风", "狂风", "风暴", "强风", "強風", "暴風", "돌풍", "강풍", "ลมแรง"],
    "dust": ["bụi", "dust*", "cát", "sand*", "sa mạc", "desert*", "poussière*", "sable", "staub", "wüste", "polvo", "desierto", "poeira", "deserto", "пыль", "пыли", "пустын*", "debu", "gurun", "沙尘", "灰尘", "沙漠", "尘土", "砂漠", "砂ぼこり", "먼지", "사막", "ฝุ่น", "ทะเลทราย"],
    "fire": ["lửa", "cháy", "fire*", "flame*", "bonfire", "feu", "feux", "flamme*", "incendie*", "feuer", "flammen", "fuego*", "llamas", "incendio*", "fogo", "chamas", "fuoco", "fiamme", "огонь", "огня", "пламя", "пожар*", "火焰", "大火", "火光", "烈火", "篝火", "火灾", "火事", "炎が", "불길", "화재", "모닥불", "ไฟไหม้", "เปลวไฟ"],
    "blast": ["nổ", "bom", "explo*", "blast*", "bomb*", "pháo kích", "explosion*", "bombe*", "sprengung", "explosión", "explosao", "explosão", "esplosione", "взрыв*", "ledakan", "爆炸", "爆破", "炸弹", "炸彈", "爆発", "폭발", "폭탄", "ระเบิด"],
    "leaf": ["lá rơi", "lá vàng", "mùa thu", "autumn", "falling leaves", "feuilles mortes", "automne", "herbst", "laub", "otoño", "hojas secas", "outono", "autunno", "листопад*", "осен*", "落叶", "秋天", "落ち葉", "紅葉", "낙엽", "단풍", "ใบไม้ร่วง"],
    "firefly": ["đom đóm", "firefl*", "luciole*", "glühwürmchen", "luciérnaga*", "vaga-lume*", "lucciol*", "светлячк*", "萤火虫", "螢火蟲", "蛍", "반딧불", "หิ่งห้อย"],
    "lightning": ["sấm", "chớp", "sét", "lightning", "thunder*", "éclair*", "tonnerre", "blitz*", "donner*", "relámpago*", "trueno*", "raio", "relâmpago*", "trovão", "fulmine", "tuono", "молни*", "гром", "petir", "闪电", "閃電", "雷声", "雷鸣", "打雷", "雷電", "稲妻", "번개", "천둥", "ฟ้าผ่า", "ฟ้าร้อง"],
    "godray": ["nắng", "bình minh", "sunrise", "dawn", "sunlight", "tia sáng", "hoàng hôn", "sunset", "lever du soleil", "coucher du soleil", "rayons de soleil", "sonnenaufgang", "sonnenuntergang", "sonnenlicht", "amanecer", "atardecer", "luz del sol", "nascer do sol", "pôr do sol", "alba", "tramonto", "рассвет*", "закат*", "солнечн*", "matahari terbit", "阳光", "陽光", "日出", "日落", "黄昏", "朝日", "夕日", "夕焼け", "햇빛", "일출", "노을", "พระอาทิตย์ขึ้น", "แสงแดด"],
}


_CJK = _re.compile("[\u0e00-\u0e7f\u1100-\u11ff\u3040-\u30ff\u3400-\u4dbf\u4e00-\u9fff\uac00-\ud7af]")


def _rx(kws):
    """Tu khoa chu Latin / Cyrillic: nguyen tu ('abc*' = tien to). Tu khoa chu Han / Kana / Hangul / Thai (khong co dau cach giua cac tu): khop o bat ky dau."""
    lat = [(_re.escape(k[:-1]) + r"\w*") if k.endswith("*") else _re.escape(k) for k in kws if not _CJK.search(k)]
    cjk = [_re.escape(k) for k in kws if _CJK.search(k)]
    parts = []
    if lat:
        parts.append(r"(?<!\w)(?:" + "|".join(lat) + r")(?!\w)")
    if cjk:
        parts.append("(?:" + "|".join(cjk) + ")")
    return _re.compile("|".join(parts), _re.I)


_RX = {e: _rx(k) for e, k in _KW.items()}
_EFF_CACHE = {}


def weather_on(P):
    """Phu hieu ung theo loi doc: 'auto' / 'on' = bat (khung nao co tu khoa moi phu, xem _KW); 'off' = tat."""
    return getattr(P, "fxmode", "auto") != "off"


def _frame_effects(P, k):
    fr = P.frames
    if k < 0 or k >= len(fr):
        return frozenset()
    f = fr[k]
    key = (id(P), k)
    r = _EFF_CACHE.get(key)
    if r is None:
        try:
            txt = " ".join(l.text for l in P.lines if l.start < f["end"] and l.end > f["start"]) or f["line"].text
        except Exception:
            txt = getattr(f.get("line"), "text", "")
        r = {e for e, rx in _RX.items() if rx.search(txt or "")}
        try:
            sc = P.scenes[min(f.get("scene", 0), len(P.scenes) - 1)]
            if getattr(sc, "snow", False): r.add("snow")
            if getattr(sc, "fog", False): r.add("fog")
            if getattr(sc, "rain", False): r.add("rain")
        except Exception:
            pass
        if len(_EFF_CACHE) > 4000:
            _EFF_CACHE.clear()
        r = _EFF_CACHE[key] = frozenset(r)
    return r


def _strength(P):
    """Do phu 0..100% (mac dinh 40% ~ 1.0). Tran 2.2 de keo toi da van khong lam mat mau anh."""
    return min(2.2, max(0.0, float(getattr(P, "fxamt", 40)) / 40.0))


def light_overlay(img, P, t):
    """Lop phu rat nhe (hat/vet mong, trong suot) theo loi doc cua tung khung; vao/ra mem, hat troi lien tuc giua cac khung."""
    if not weather_on(P):
        return img
    fr = P.frames
    k = 0
    for i, f in enumerate(fr):
        if f["start"] <= t:
            k = i
    f = fr[k]
    if f.get("clip"):                      # clip AI da tu co chuyen dong/thoi tiet: khong phu de khoi chong doi
        return img
    cur = _frame_effects(P, k)
    if not cur:
        return img
    prv, nxt = _frame_effects(P, k - 1), _frame_effects(P, k + 1)
    W, H = img.size
    layer = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    d = ImageDraw.Draw(layer, "RGBA")
    S = W / 1280.0
    str_ = _strength(P)
    warm = 0.0
    flash = 0.0
    ray = 0.0
    for e in cur:
        a_in = 1.0 if (e in prv or k == 0) else clamp((t - f["start"]) / 0.5)
        a_out = 1.0 if (e in nxt or k == len(fr) - 1) else clamp((f["end"] - t) / 0.5)
        m = min(a_in, a_out) * str_
        if m <= 0.01:
            continue
        A = lambda v: max(0, min(255, int(v * m)))
        if e == "snow":
            for i in range(55):
                s1, s2, s3 = h01(str(i), "sx"), h01(str(i), "sy"), h01(str(i), "ss")
                x = (s1 * W + math.sin(t * 0.7 + s2 * 9) * 22 * S) % W
                y = ((s2 + t * (0.05 + 0.07 * s3)) % 1.0) * H
                r = max(1.2, (1.2 + 2.2 * s3) * S)
                d.ellipse([x - r, y - r, x + r, y + r], fill=(255, 255, 255, A(70 + 80 * s3)))
        elif e == "rain":
            for i in range(70):
                s1, s2, s3 = h01(str(i), "rx"), h01(str(i), "ry"), h01(str(i), "rs")
                x = ((s1 + t * 0.12 * (0.6 + s3)) % 1.1) * W
                y = ((s2 + t * (0.9 + 0.5 * s3)) % 1.0) * H
                L = (14 + 16 * s3) * S
                d.line([x, y, x - L * 0.25, y + L], fill=(200, 215, 235, A(70)), width=max(1, int(S)))
        elif e == "fog":
            for i in range(4):
                y = H * (0.5 + 0.1 * i)
                x = ((t * (5 + 2 * i) + i * W * 0.4) % (W * 1.6)) - W * 0.3
                d.ellipse([x - W * 0.5, y - H * 0.08, x + W * 0.5, y + H * 0.08], fill=(225, 230, 235, A(26)))
        elif e == "wind":
            for i in range(14):
                s1, s2, s3 = h01(str(i), "wx"), h01(str(i), "wy"), h01(str(i), "ws")
                x = ((s1 + t * (0.35 + 0.3 * s3)) % 1.2) * W - 0.1 * W
                y = s2 * H + math.sin(t * 2.2 + s3 * 7) * 10 * S
                L = W * (0.03 + 0.04 * s3)
                d.line([x - L, y, x, y + math.sin(t * 3 + i) * 3 * S], fill=(235, 235, 225, A(55)), width=max(1, int(S)))
        elif e == "dust":
            for i in range(32):
                s1, s2, s3 = h01(str(i), "dx"), h01(str(i), "dy"), h01(str(i), "ds")
                x = ((s1 + t * 0.06 * (0.5 + s3)) % 1.0) * W
                y = ((s2 + t * 0.012) % 1.0) * H + math.sin(t * 0.9 + i) * 6 * S
                r = max(1.0, (1 + 1.5 * s3) * S)
                d.ellipse([x - r, y - r, x + r, y + r], fill=(225, 205, 160, A(85)))
        elif e == "fire":
            warm = max(warm, 0.05 * m * (0.85 + 0.15 * math.sin(t * 9) * math.sin(t * 3.1)))
            for i in range(18):
                s1, s2, s3 = h01(str(i), "fx"), h01(str(i), "fy"), h01(str(i), "fs")
                x = (s1 * W + math.sin(t * 1.1 + s2 * 9) * 22 * S) % W
                y = H - ((t * (40 + 50 * s3) * H / 1000 + s2 * H) % H) * 0.7
                r = max(1.0, (0.9 + 1.6 * s3) * S)
                d.ellipse([x - r, y - r, x + r, y + r], fill=(255, 175 + int(60 * s3), 80, A(150)))
        elif e == "blast":
            u = clamp((t - f["start"]) / 0.6)
            warm = max(warm, 0.22 * m * (1 - u) ** 2)
        elif e == "leaf":
            for i in range(14):
                s1, s2, s3 = h01(str(i), "lx"), h01(str(i), "ly"), h01(str(i), "ls")
                x = ((s1 + t * 0.03 * (0.5 + s3)) % 1.0) * W + math.sin(t * 1.3 + i * 2) * 40 * S
                y = ((s2 + t * (0.05 + 0.05 * s3)) % 1.0) * H
                w_, h_ = (5 + 5 * s3) * S, (2.5 + 2 * s3) * S * (0.4 + 0.6 * abs(math.sin(t * 2 + i)))
                col = [(190, 120, 40), (160, 90, 30), (205, 160, 50)][i % 3]
                d.ellipse([x - w_, y - h_, x + w_, y + h_], fill=col + (A(150),))
        elif e == "firefly":
            for i in range(16):
                s1, s2, s3 = h01(str(i), "ffx"), h01(str(i), "ffy"), h01(str(i), "ffs")
                x = (s1 * W + math.sin(t * 0.5 + i * 3) * 50 * S) % W
                y = (0.25 + 0.65 * s2) * H + math.sin(t * 0.7 + i) * 30 * S
                g = 0.5 + 0.5 * math.sin(t * (1.2 + s3) + i * 5)
                r = (2 + 2 * s3) * S
                d.ellipse([x - r * 3, y - r * 3, x + r * 3, y + r * 3], fill=(255, 240, 140, A(30 * g)))
                d.ellipse([x - r, y - r, x + r, y + r], fill=(255, 245, 170, A(180 * g)))
        elif e == "lightning":
            ph = (t * 0.37 + h01(str(k), "lt")) % 1.0
            if ph < 0.06:
                flash = max(flash, 0.28 * m * (1 - ph / 0.06) * (1.0 if int(t * 24) % 3 else 0.5))
        elif e == "godray":
            ray = max(ray, m)
    if ray > 0:
        for j in range(5):
            x0 = W * (0.15 + 0.17 * j) + math.sin(t * 0.25 + j) * 14 * S
            d.polygon([(x0, 0), (x0 + W * 0.05, 0), (x0 + W * 0.30, H), (x0 + W * 0.18, H)], fill=(255, 240, 200, max(0, min(255, int(16 * ray)))))
    out = Image.alpha_composite(img.convert("RGBA"), layer)
    if warm > 0.004:
        out = Image.blend(out, Image.new("RGBA", (W, H), (255, 190, 110, 255)), min(warm, 0.3))
    if flash > 0.004:
        out = Image.blend(out, Image.new("RGBA", (W, H), (235, 240, 255, 255)), min(flash, 0.4))
    return out.convert("RGB")


# ---------------------------------------------------------------- kieu phim (xuoc, bui phim, sepia, VHS) - chi o buoc hoan thien
_VIG = {}
_LOOKS = {   # sat: giu bao nhieu mau, sepia, scr: so vet xuoc, dust: so dom bui, flick, vig, vhs
    "old": dict(sat=0.88, sepia=0.0, scr=2, dust=10, flick=0.012, vig=0.18, vhs=0),
    "war": dict(sat=0.72, sepia=0.0, scr=3, dust=16, flick=0.016, vig=0.26, vhs=0),
    "sepia": dict(sat=0.80, sepia=0.30, scr=1, dust=6, flick=0.008, vig=0.20, vhs=0),
    "vhs": dict(sat=0.95, sepia=0.0, scr=0, dust=2, flick=0.01, vig=0.08, vhs=1),
}


def film_look(img, P, t):
    look = getattr(P, "fxlook", "none")
    cfg = _LOOKS.get(look)
    if not cfg:
        return img
    k = min(1.0, _strength(P) / 1.4)        # tran: keo toi da khong qua tay
    W, H = img.size
    a = np.asarray(img).astype(np.float32)
    if cfg["sat"] < 1:
        g = a.mean(axis=2, keepdims=True)
        sat = 1 - (1 - cfg["sat"]) * k
        a = g + (a - g) * sat
    if cfg["sepia"]:
        g = a.mean(axis=2, keepdims=True)
        tone = g * np.array([1.10, 0.96, 0.78], np.float32)
        a = a * (1 - cfg["sepia"] * k) + tone * (cfg["sepia"] * k)
    a = a * (1 + cfg["flick"] * k * math.sin(t * 7.3) * math.sin(t * 2.9 + 1))
    if cfg["vig"]:
        key = (W, H)
        v = _VIG.get(key)
        if v is None:
            yy, xx = np.mgrid[0:H, 0:W].astype(np.float32)
            r = np.sqrt(((xx - W / 2) / (W / 2)) ** 2 + ((yy - H / 2) / (H / 2)) ** 2) / 1.414
            v = _VIG[key] = np.clip(r, 0, 1)[..., None] ** 2.2
        a = a * (1 - cfg["vig"] * k * v)
    if cfg["vhs"]:
        a[::3] *= 1 - 0.05 * k
        sh = max(1, int(W / 640))
        a[..., 0] = np.roll(a[..., 0], sh, axis=1)
        a[..., 2] = np.roll(a[..., 2], -sh, axis=1)
    out = Image.fromarray(np.clip(a, 0, 255).astype(np.uint8))
    q = int(t * 10)                          # xuoc/bui doi ~10 lan/giay, khong nhap nhay moi khung
    if cfg["scr"] or cfg["dust"]:
        layer = Image.new("RGBA", (W, H), (0, 0, 0, 0))
        d = ImageDraw.Draw(layer, "RGBA")
        for i in range(cfg["scr"]):
            if h01(str(q), "sc%d" % i) < 0.45 * k:
                x = h01(str(q), "scx%d" % i) * W
                y0 = h01(str(q), "scy%d" % i) * H * 0.5
                d.line([x, y0, x + (h01(str(q), "scd%d" % i) - 0.5) * 6, y0 + H * (0.3 + 0.6 * h01(str(q), "scl%d" % i))], fill=(235, 235, 225, int(55 * k)), width=1)
        for i in range(cfg["dust"]):
            if h01(str(q), "du%d" % i) < 0.6 * k:
                x, y = h01(str(q), "dux%d" % i) * W, h01(str(q), "duy%d" % i) * H
                r = max(1.0, (0.6 + 1.8 * h01(str(q), "dur%d" % i)) * W / 1280)
                dark = h01(str(q), "dud%d" % i) < 0.5
                d.ellipse([x - r, y - r, x + r, y + r], fill=((20, 18, 15, int(110 * k)) if dark else (240, 238, 225, int(120 * k))))
        out = Image.alpha_composite(out.convert("RGBA"), layer).convert("RGB")
    return out
