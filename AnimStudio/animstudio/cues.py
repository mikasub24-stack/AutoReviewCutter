# -*- coding: utf-8 -*-
"""Tu cau thoai / mo ta canh -> danh sach cue (hieu ung, thu vat, phuong tien) co thoi gian cu the."""
from .director import detect_fx, canon, EXTRAS
from .common import h01
from .timeline import Cue

WEATHER = {"rain", "snow", "fog", "wind", "dusk", "dust"}
EVENTS = {"explosion": 1.8, "gunfire": 2.4, "thunder": 1.4}
ERA_OK = {"mammoth": ("ancient",), "sabertooth": ("ancient",), "tank": ("war",), "plane": ("war", "modern"), "train": ("war", "modern"), "car": ("war", "modern")}


def _names(texts, explicit, era):
    out = []
    for n in list(explicit):
        c = canon(n)
        if c and c not in out:
            out.append(c)
    for t in texts:
        for n in detect_fx(t, era):
            if n not in out:
                out.append(n)
    return out


def build_cues(P, script):
    cues, era = [], P.era
    n_seed = [0]

    def dup(kw):
        for c in cues:
            if c.name == kw["name"] and c.kind == kw["kind"] and c.scene == kw["scene"]:
                if kw["name"] in WEATHER or kw["name"] == "fire":
                    return True
                if kw["name"] in EVENTS:
                    if abs(c.start - kw["start"]) < 1.0:
                        return True
                elif c.start < kw["end"] and kw["start"] < c.end:
                    return True
        return False

    def add(**kw):
        if dup(kw):
            return
        n_seed[0] += 1
        cues.append(Cue(seed=n_seed[0], **kw))

    for si, sc in enumerate(P.scenes):
        sd = script.scenes[si]
        side = 1 if si % 2 == 0 else -1
        spread = 4.0 if P.aspect == "16:9" else 3.0
        # --- tu mo ta canh: nen tang suot canh
        base = _names([sd.desc], sd.fx, era)
        for n in base:
            if n in ("rain",):
                continue
            if n in WEATHER or n == "fire":
                add(kind="fx", name=n, start=sc.start, end=sc.end, scene=si, sound=(n == "fire" or n == "wind"), gain=0.35)
            elif n in EVENTS:
                add(kind="fx", name=n, start=sc.start + 1.0, end=sc.start + 1.0 + EVENTS[n], scene=si)
            elif n in EXTRAS and (n not in ERA_OK or era in ERA_OK[n]):
                add(kind="extra", name=n, start=sc.start + 0.8, end=min(sc.end, sc.start + 9.0), scene=si, x0=-side * spread, x1=side * spread, lane=0.3)
        # --- tu tung cau
        for ln in sc.lines:
            li = script.lines[P.lines.index(ln)] if ln in P.lines else None
            names = _names([ln.text], li.fx if li else [], era)
            for n in names:
                if n in WEATHER:
                    if n == "rain" and sc.rain:
                        continue
                    add(kind="fx", name=n, start=ln.start, end=sc.end, scene=si, sound=n == "wind", gain=0.35)
                elif n == "fire":
                    add(kind="fx", name="fire", start=ln.start, end=ln.end + 3.0, scene=si, gain=0.4)
                elif n in EVENTS:
                    t0 = ln.start + 0.3
                    add(kind="fx", name=n, start=t0, end=t0 + EVENTS[n], scene=si, gain=0.7)
                    if n == "explosion" and (ln.end - ln.start) > 2.5:
                        add(kind="fx", name=n, start=t0 + 1.8, end=t0 + 1.8 + EVENTS[n], scene=si, gain=0.6)
                elif n in EXTRAS:
                    if n in ERA_OK and era not in ERA_OK[n] and n not in (li.fx if li else []):
                        continue
                    dur = max(5.0, min(12.0, ln.end - ln.start + 3.5))
                    flip = 1 if h01(ln.text, "dir") > 0.5 else -1
                    add(kind="extra", name=n, start=max(sc.start, ln.start - 0.3), end=ln.start - 0.3 + dur, scene=si, x0=-flip * spread, x1=flip * spread, lane=0.2 + 0.2 * (len(cues) % 3))
        # --- nen sinh dong theo thoi dai / canh (khong can tu khoa)
        t = sc.start + 4.0
        k = 0
        while t < sc.end - 3.0:
            k += 1
            if era == "modern" and sd.theme == "street" and not any(c.name == "car" for c in cues if c.scene == si):
                add(kind="extra", name="car", start=t, end=t + 5.0, scene=si, x0=-side * (spread + 1) * (-1) ** k, x1=side * (spread + 1) * (-1) ** k, lane=0.9, gain=0.25)
            if era == "war" and sd.theme in ("outdoor", "street"):
                add(kind="fx", name="explosion", start=t + 1.0, end=t + 2.4, scene=si, sound=True, gain=0.22) if k % 2 == 1 else None
                if k % 3 == 0 and sd.theme == "outdoor":
                    add(kind="extra", name="plane", start=t, end=t + 9.0, scene=si, x0=-side * (spread + 1), x1=side * (spread + 1), lane=2.0, gain=0.2)
            if era == "ancient" and sd.theme == "outdoor" and k % 2 == 1:
                add(kind="extra", name="bird", start=t, end=t + 8.0, scene=si, x0=-side * (spread + 1), x1=side * (spread + 1), lane=1.0, gain=0.2)
            t += 7.5
    P.cues = cues
