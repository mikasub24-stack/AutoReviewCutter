# -*- coding: utf-8 -*-
"""Tinh tu the/bieu cam cua mot nhan vat tai thoi diem t (dung chung cho 2D, 3D, nguoi que)."""
import math
from dataclasses import dataclass
from .common import clamp, smooth, h01

# brow: +1 = gian (mep trong ha), -1 = buon/so (mep trong nang); eye: do mo mat; smile: -1..1
EMO = {
    "neutral":   dict(brow=0.0,  brow_h=0.0, eye=1.0,  smile=0.05, lean=0.0,  tilt=0.0,   fidget=0.0, round=0.0),
    "happy":     dict(brow=-0.1, brow_h=0.15, eye=1.0, smile=0.85, lean=-0.03, tilt=0.05,  fidget=0.3, round=0.0),
    "sad":       dict(brow=-0.8, brow_h=-0.1, eye=0.78, smile=-0.7, lean=0.14, tilt=-0.10, fidget=0.0, round=0.0),
    "angry":     dict(brow=0.9,  brow_h=-0.1, eye=0.78, smile=-0.45, lean=0.06, tilt=0.0,  fidget=0.9, round=0.0),
    "scared":    dict(brow=-0.9, brow_h=0.5,  eye=1.35, smile=-0.35, lean=-0.06, tilt=0.0, fidget=1.0, round=0.6),
    "surprised": dict(brow=-0.2, brow_h=0.9,  eye=1.4, smile=0.0, lean=-0.08, tilt=0.0,   fidget=0.4, round=1.0),
    "thinking":  dict(brow=0.35, brow_h=0.3,  eye=0.95, smile=-0.1, lean=0.0, tilt=0.12,  fidget=0.0, round=0.0),
    "whisper":   dict(brow=0.0,  brow_h=0.0,  eye=0.95, smile=0.0, lean=0.05, tilt=0.0,   fidget=0.0, round=0.0),
}


@dataclass
class Pose:
    visible: bool = True
    dx: float = 0.0          # do lech ngang khi di vao (m)
    walk: float = 0.0        # pha buoc chan (0 = dung yen)
    bob: float = 0.0
    amp: float = 0.0         # do mo mieng 0..1
    mouth_w: float = 1.0
    blink: float = 0.0
    brow: float = 0.0
    brow_h: float = 0.0
    eye: float = 1.0
    smile: float = 0.0
    round: float = 0.0
    gaze: float = 0.0        # -1 trai .. +1 phai
    gaze_y: float = 0.0
    lean: float = 0.0
    tilt: float = 0.0
    nod: float = 0.0
    yaw: float = 0.0         # xoay nguoi (3D) theo gaze
    # tay: (nang truoc, dang ngang, gap khuyu) do
    r_arm: tuple = (3.0, 8.0, 10.0)
    l_arm: tuple = (3.0, 8.0, 10.0)
    shake: float = 0.0
    speaking: bool = False
    emo: str = "neutral"


def env_at(line, t):
    e = line.env
    if e is None or len(e) == 0:
        return 0.0
    x = (t - line.start) * 60.0
    i = int(x)
    if i < 0 or i >= len(e) - 1:
        return 0.0
    f = x - i
    return float(e[i] * (1 - f) + e[i + 1] * f)


def pose_at(P, name, t):
    si = P.scene_index(t)
    sc = P.scenes[si]
    info = sc.cast.get(name)
    if info is None or t < info["enter"]:
        return Pose(visible=False)
    seed = h01(name, "pose")
    p = Pose()
    # --- di vao ---
    ep = smooth((t - info["enter"]) / 0.9)
    p.dx = (1.0 - ep) * info["dir"] * (3.2 if P.aspect == "16:9" else 2.2)
    if ep < 1.0:
        p.walk = (t - info["enter"]) * 7.5
    # --- ai dang noi ---
    cur = P.speaking(t)
    spk = cur.speaker if cur is not None else ""
    mine = None
    if cur is not None and cur.speaker == name:
        mine = cur
    emo_name, hold = "neutral", False
    if mine is None:                       # giu bieu cam sau khi noi xong ~1.4s
        for ln in sc.lines:
            if ln.speaker == name and ln.end <= t < ln.end + 1.4:
                emo_name, hold = ln.emotion, True
    else:
        emo_name = mine.emotion
    # nguoi nghe phan ung nhe voi nguoi noi
    if mine is None and not hold and cur is not None and cur.speaker:
        if cur.emotion in ("sad", "angry", "scared", "surprised"):
            emo_name = {"sad": "sad", "angry": "scared", "scared": "scared", "surprised": "surprised"}[cur.emotion]
    E = EMO.get(emo_name, EMO["neutral"])
    p.emo = emo_name
    energy = mine.energy if mine else 1.0
    # --- mieng ---
    if mine is not None:
        a = clamp(env_at(mine, t) * 1.1)
        p.speaking = True
        p.amp = a
        p.mouth_w = 1.0 + 0.45 * math.sin(t * 21 + seed * 9) * a - 0.25 * a
        if mine.question and a > 0.2:
            p.brow_h += 0.25
    # --- mat ---
    ph = (t * 1.0 + seed * 3.7) % 3.6
    p.blink = math.sin(math.pi * ph / 0.14) if ph < 0.14 else 0.0
    for k in ("brow", "brow_h", "eye", "smile", "round"):
        setattr(p, k, E[k] + getattr(p, k) if k in ("brow_h",) else E[k])
    # --- huong nhin ---
    others = [(n, i) for n, i in sc.cast.items() if n != name and t >= i["enter"]]
    tgt = None
    if spk and spk != name and spk in sc.cast:
        tgt = sc.cast[spk]["sx"]
    elif others:
        tgt = min(others, key=lambda o: abs(o[1]["sx"] - info["sx"]))[1]["sx"]
    if tgt is not None:
        p.gaze = clamp((tgt - info["sx"]) * 0.8, -1, 1)
    if emo_name == "thinking":
        p.gaze, p.gaze_y = (-0.6 if info["sx"] >= 0 else 0.6), 0.7
    p.yaw = p.gaze * 0.45
    # --- than/dau ---
    p.bob = 0.008 * math.sin(2 * math.pi * t / 3.1 + seed * 6) + (0.035 * abs(math.sin(p.walk)) if p.walk else 0.0)
    p.lean = E["lean"] * (0.6 + 0.4 * math.sin(t * 0.8 + seed))
    p.tilt = E["tilt"]
    if mine is not None:
        p.nod = 0.05 * p.amp * math.sin(t * 2.6 + seed * 5) * energy
        p.tilt += 0.03 * math.sin(t * 1.7 + seed)
    p.shake = (0.006 if E["fidget"] >= 0.9 and (emo_name == "scared") else 0.0) * math.sin(t * 14)
    # --- tay ---
    idle = math.sin(2 * math.pi * t / 3.5 + seed * 5)
    r = [4 + 2 * idle, 8 + 2 * idle, 10 + 4 * idle]
    l = [4 - 2 * idle, 8 - 2 * idle, 10 - 4 * idle]
    if p.walk:
        sw = math.sin(p.walk)
        r[0], l[0] = 18 * sw, -18 * sw
    if mine is not None:
        g = 0.55 + 0.45 * math.sin(t * 4.1 + seed * 8)
        k = clamp(0.35 + 0.65 * p.amp + 0.25 * (energy - 1.0))
        r = [30 + 60 * g * k, 14 + 24 * k, 40 + 70 * g * k]
        if energy > 1.2 or emo_name in ("angry", "surprised", "scared"):
            l = [25 + 55 * (1 - g) * k, 14 + 24 * k, 40 + 70 * (1 - g) * k]
    if emo_name == "sad":
        r[0], l[0] = r[0] * 0.3, l[0] * 0.3
    if emo_name == "scared" and mine is None:
        r, l = [75, 12, 105], [75, 12, 105]
    if emo_name == "angry" and mine is None:
        r, l = [40, 10, 95], [40, 10, 95]
    p.r_arm, p.l_arm = tuple(r), tuple(l)
    return p
