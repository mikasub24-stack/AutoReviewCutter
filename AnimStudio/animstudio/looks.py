# -*- coding: utf-8 -*-
"""Dien mao nhan vat theo thoi dai (hien dai / co dai / chien tranh) va vai (dan thuong, quan, vua, linh, si quan)."""
from .common import h01
from . import langs

SKINS_ASIA = [(246, 214, 186), (238, 200, 164), (226, 180, 140), (206, 156, 114)]
SKINS_ALL = SKINS_ASIA + [(172, 118, 84), (128, 86, 62), (250, 226, 208)]
HAIRS = [(26, 22, 28), (44, 32, 30), (74, 50, 36), (112, 72, 40), (170, 130, 70), (110, 40, 36), (54, 58, 78)]
HAIRS_ASIA = HAIRS[:3]

ROLE_KW = [
    ("royal", ["thủ lĩnh", "tộc trưởng", "chief", "vua", "hoàng đế", "hoàng hậu", "hoàng tử", "công chúa", "king", "queen", "prince", "princess", "emperor",
               "empress", "nương nương", "bệ hạ", "thái hậu", "chúa"]),
    ("officer", ["tướng", "chỉ huy", "đại tá", "trung tá", "thiếu tá", "đại úy", "trung úy", "thiếu úy", "general", "captain",
                 "colonel", "commander", "major", "lieutenant", "officer", "sergeant", "sarge", "trung sĩ", "đồn trưởng"]),
    ("soldier", ["thợ săn", "hunter", "chiến binh", "warrior", "lính", "bộ đội", "chiến sĩ", "soldier", "private", "trooper", "binh", "tiểu đội", "du kích", "pvt"]),
    ("noble", ["pháp sư", "thầy cúng", "shaman", "quan", "thượng thư", "đại thần", "thừa tướng", "minister", "lord", "lady", "công tử", "tiểu thư", "hiệp",
               "knight", "samurai", "thầy", "sư", "tể tướng", "mandarin", "scholar", "nho"]),
]

def pick(lst, s, salt):
    return lst[int(h01(s, salt) * len(lst)) % len(lst)]


def shade_skin(c, k):
    return tuple(int(v * k) for v in c)


def role_of(name, era, ch, idx):
    s = " " + (name + " " + getattr(ch, "attrs", "")).lower() + " "
    for r, kws in ROLE_KW:
        if any(k in s for k in kws):
            if era == "modern" and r in ("royal", "noble"):
                return "civil"
            if era == "ancient":
                return {"royal": "chief", "officer": "chief", "soldier": "hunter", "noble": "shaman"}[r]
            if era == "imperial" and r in ("soldier", "officer"):
                return "guard" if r == "soldier" else "officer"
            return r
    if era == "war":
        return "soldier" if (ch.gender == "m" and ch.age == "adult") else "civil"
    if era == "ancient":
        return "tribe"
    if era == "imperial":
        return "commoner"
    return "civil"


def make_looks(script):
    out = {}
    era = script.era
    asia = script.lang in langs.ASIA or era == "imperial"
    for i, (nm, ch) in enumerate(script.chars.items()):
        sd = ch.look_seed or nm
        role = role_of(nm, era, ch, i)
        L = dict(role=role, era=era, gender=ch.gender, age=ch.age)
        L["skin"] = pick(SKINS_ASIA if asia else SKINS_ALL, sd, "skin")
        L["hair"] = pick(HAIRS_ASIA if (asia and ch.age != "child") else HAIRS, sd, "hair")
        if ch.age == "old":
            L["hair"] = (214, 214, 220)
        L["glasses"] = h01(sd, "gl") > 0.72 and era == "modern"
        L["beard"] = ch.gender == "m" and (ch.age == "old" or ((era == "ancient") or (era == "imperial" and role in ("noble", "royal")) and h01(sd, "bd") > 0.4))
        L["seed"] = h01(sd, "seed")
        fem = ch.gender == "f"
        if era == "modern":
            tops = [(214, 86, 72), (52, 120, 170), (236, 186, 70), (80, 160, 120), (150, 90, 170), (232, 232, 226), (60, 70, 92), (230, 120, 150)]
            bots = [(50, 58, 84), (70, 70, 76), (116, 92, 72), (40, 50, 60), (88, 100, 130)]
            L["top"], L["bottom"] = pick(tops, sd, "top"), pick(bots, sd, "bot")
            L["shoes"] = pick([(236, 236, 232), (40, 40, 48), (150, 70, 60)], sd, "sh")
            L["style"] = "dress" if fem and h01(sd, "dr") > 0.55 else "casual"
            L["hair_style"] = ("long" if h01(sd, "hs") > 0.4 else "bob") if fem else ("short" if h01(sd, "hs") > 0.2 else "spiky")
            if ch.age == "child":
                L["hair_style"] = "pig" if fem else "short"
            if ch.age == "old":
                L["hair_style"] = "bun" if fem else "bald"
            L["accent"] = pick([(255, 196, 80), (90, 200, 200), (240, 110, 110)], sd, "ac")
            L["scarf"] = h01(sd, "sc") > 0.7
        elif era == "ancient":                     # nguoi nguyen thuy: da thu, xuong, long vu
            furs = [(236, 148, 44), (236, 148, 44), (214, 120, 40), (176, 128, 80), (120, 86, 56)]
            L["style"] = "fur"
            L["top"] = pick(furs, sd, "fur")
            L["trim"] = (232, 224, 204)
            L["bottom"] = L["skin"] = shade_skin(L["skin"], 0.92)
            L["shoes"] = shade_skin(L["skin"], 0.8)
            L["spots"] = L["top"][0] > 200
            L["hair"] = pick([(24, 20, 20), (52, 36, 28), (84, 56, 36)], sd, "ph")
            L["hair_style"] = ("braids" if fem else "wild") if ch.age != "child" else "wild"
            if ch.age == "old":
                L["hair"] = (214, 214, 220); L["beard"] = ch.gender == "m"
            L["hat"] = {"chief": "skull", "shaman": "feather", "hunter": "headband"}.get(role, "headband" if h01(sd, "hb") > 0.6 else "")
            L["gear"] = role in ("hunter", "chief")           # giao
            L["weapon"] = "spear" if role == "hunter" else "club" if role == "chief" else "staff" if role == "shaman" else ""
            L["necklace"] = True
            L["accent"] = (240, 150, 60)
            L["fur_cape"] = role == "chief"
        elif era == "imperial":
            L["style"] = "robe"
            if role == "royal":
                L["top"], L["trim"] = ((218, 164, 40), (150, 24, 30)) if not fem else ((176, 30, 46), (232, 190, 70))
                L["hat"] = "crown"
            elif role in ("noble", "officer"):
                L["top"] = pick([(32, 62, 112), (122, 28, 40), (36, 90, 80), (70, 50, 110)], sd, "top")
                L["trim"] = (222, 184, 90)
                L["hat"] = "helm" if role == "officer" else ("official" if not fem else "")
            elif role == "guard":
                L["top"], L["trim"], L["hat"] = (110, 44, 40), (200, 160, 70), "helm"
            else:
                L["top"] = pick([(126, 94, 62), (72, 104, 112), (150, 110, 70), (94, 112, 84)] if not fem else
                                [(184, 76, 86), (70, 122, 132), (206, 154, 74), (122, 92, 150)], sd, "top")
                L["trim"] = (232, 214, 170)
                L["hat"] = "nonla" if (not fem or h01(sd, "nl") > 0.5) and ch.age != "child" and h01(sd, "hat") > 0.45 else ""
                if role == "commoner" and not fem:
                    L["style"] = "tunic"
            L["bottom"] = (52, 46, 44)
            L["shoes"] = (36, 30, 30)
            L["hair_style"] = ("bun_pin" if fem else "topknot") if ch.age != "child" else "tufts"
            if role == "royal" and fem:
                L["hair_style"] = "bun_pin"
            L["accent"] = L["trim"]
        else:  # war
            if role == "soldier":
                L["top"], L["bottom"], L["hat"] = (84, 94, 58), (70, 78, 50), "helmet"
                L["style"], L["gear"] = "uniform", True
            elif role == "officer":
                L["top"], L["bottom"], L["hat"] = (132, 120, 84), (112, 102, 72), "cap"
                L["style"], L["gear"] = "uniform", False
            else:
                L["top"] = pick([(110, 100, 88), (96, 92, 100), (130, 110, 90), (84, 96, 90)], sd, "top")
                L["bottom"] = pick([(60, 56, 54), (74, 66, 58)], sd, "bot")
                L["style"], L["gear"] = ("dress" if fem and ch.age != "child" else "casual"), False
                L["hat"] = "scarfhead" if fem and h01(sd, "sf") > 0.4 else ("flatcap" if ch.gender == "m" and h01(sd, "fc") > 0.5 else "")
            L["shoes"] = (44, 36, 30)
            L["hair_style"] = ("bob" if fem else "short") if ch.age != "child" else ("pig" if fem else "short")
            if ch.age == "old":
                L["hair_style"] = "bun" if fem else "bald"
            L["accent"] = (230, 170, 60)
            L["soot"] = True
        out[nm] = L
    return out
