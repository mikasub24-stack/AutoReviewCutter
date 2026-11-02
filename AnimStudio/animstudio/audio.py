# -*- coding: utf-8 -*-
"""Phan tich bien do (khop mieng), tao am nen (mua, khong khi, nhac nhe) va tron am thanh."""
import wave
import numpy as np
from .tts import SR


def envelope(sig, fps=60):
    """Bien do theo khung 1/60s, chuan hoa 0..1 (dung de dieu khien do mo mieng)."""
    if len(sig) == 0:
        return np.zeros(2, np.float32)
    hop = SR // fps
    n = len(sig) // hop + 2
    pad = np.zeros(n * hop, np.float32)
    pad[:len(sig)] = sig
    rms = np.sqrt((pad.reshape(n, hop) ** 2).mean(axis=1))
    ref = np.percentile(rms[rms > 1e-4], 85) if np.any(rms > 1e-4) else 1.0
    e = np.clip(rms / max(ref, 1e-4), 0, 1.15)
    e[e < 0.06] = 0.0
    k = np.array([0.25, 0.5, 0.25], np.float32)
    e = np.convolve(e, k, mode="same")
    return np.clip(e, 0, 1).astype(np.float32)


def _noise_loop(seconds, kind, seed):
    """Nhieu vong lap lien mach (tao bang FFT nen noi dau cuoi khop)."""
    n = int(seconds * SR)
    rng = np.random.RandomState(seed)
    spec = np.fft.rfft(rng.randn(n))
    f = np.fft.rfftfreq(n, 1 / SR)
    f[0] = 1
    if kind == "rain":
        g = np.where(f > 1200, 1.0, (f / 1200) ** 3) * (1 / np.sqrt(np.maximum(f, 1) / 1000))
    else:  # room tone / gio nhe
        g = 1 / np.maximum(f, 20) ** 1.2
        g[f > 900] *= (900 / f[f > 900]) ** 3
    x = np.fft.irfft(spec * g, n).astype(np.float32)
    x /= (np.abs(x).max() + 1e-9)
    if kind == "rain":
        am = 0.75 + 0.25 * np.sin(2 * np.pi * np.arange(n) / n * 3 + 1.3)
        x *= am.astype(np.float32)
    return x


def _pad_loop(seconds, minor):
    n = int(seconds * SR)
    t = np.arange(n) / SR
    base = 110.0 * (2 ** (3 / 12))
    notes = [1.0, 1.1892 if minor else 1.2599, 1.4983, 2.0]
    x = np.zeros(n, np.float32)
    for i, r in enumerate(notes):
        f = round(base * r * seconds) / seconds        # so chu ky nguyen -> lap lien mach
        lfo = 0.6 + 0.4 * np.sin(2 * np.pi * (1 + i) / seconds * t + i)
        x += (np.sin(2 * np.pi * f * t) * lfo / (i + 1.5)).astype(np.float32)
    return x / (np.abs(x).max() + 1e-9)


def build_bed(proj, rain_db=-27, room_db=-36, music_db=-30, music=True, ambience=True):
    n = int(proj.total * SR) + SR
    bed = np.zeros(n, np.float32)
    if not (music or ambience):
        return bed
    loops = {}
    for sc in proj.scenes:
        a, b = int(sc.start * SR), min(n, int((sc.end + 0.5) * SR))
        if b <= a:
            continue
        seg = np.zeros(b - a, np.float32)
        parts = []
        if ambience:
            parts.append(("rain" if sc.rain else "room", 10 ** ((rain_db if sc.rain else room_db) / 20)))
        if music:
            parts.append(("pad_min" if sc.night else "pad_maj", 10 ** (music_db / 20)))
        for kind, gain in parts:
            if kind not in loops:
                loops[kind] = _noise_loop(12.0, kind, 7) if kind in ("rain", "room") else _pad_loop(16.0, kind == "pad_min")
            lp = loops[kind]
            reps = int(np.ceil(len(seg) / len(lp)))
            seg += np.tile(lp, reps)[:len(seg)] * gain
        fi = min(len(seg) // 2, int(0.6 * SR))
        seg[:fi] *= np.linspace(0, 1, fi)
        seg[-fi:] *= np.linspace(1, 0, fi)
        bed[a:b] += seg
    # an dan o dau/cuoi toan phim
    f = min(n // 2, SR)
    bed[:f] *= np.linspace(0, 1, f)
    bed[-f:] *= np.linspace(1, 0, f)
    return bed


def mix(proj, music=True, ambience=True):
    n = int(proj.total * SR) + SR
    out = build_bed(proj, music=music, ambience=ambience)[:n].copy()
    voice = np.zeros(n, np.float32)
    for ln in proj.lines:
        a = int(ln.start * SR)
        s = ln.audio
        b = min(n, a + len(s))
        voice[a:b] += s[:b - a]
    # tao khoang lang nho cho giong: ha am nen khi co loi noi (ducking)
    env = np.abs(voice)
    k = SR // 20
    env = np.convolve(env, np.ones(k, np.float32) / k, mode="same")
    duck = 1 - 0.45 * np.clip(env * 12, 0, 1)
    out = out * duck + voice
    if getattr(proj, "cues", None):
        out = out + sfx_track(proj)[:n]
    pk = float(np.abs(out).max())
    if pk > 0.95:
        out *= 0.95 / pk
    return out


def write_wav(path, sig):
    with wave.open(path, "wb") as w:
        w.setnchannels(1)
        w.setsampwidth(2)
        w.setframerate(SR)
        w.writeframes((np.clip(sig, -1, 1) * 32767).astype("<i2").tobytes())


# ------------------------------------------------------------ am thanh hieu ung (tong hop, khong can file)
def _lp(x, k):
    c = np.cumsum(np.insert(x, 0, 0))
    k = max(1, int(k))
    if len(x) <= k:
        return x
    y = ((c[k:] - c[:-k]) / k).astype(np.float32)
    return np.concatenate([y, np.full(len(x) - len(y), y[-1], np.float32)])


def sfx(name, dur, seed=0):
    rng = np.random.RandomState(seed + 11)
    n = int(max(dur, 0.2) * SR)
    t = np.arange(n) / SR
    if name == "explosion":
        x = _lp(rng.randn(n).astype(np.float32), 40) * 6 + 0.8 * np.sin(2 * np.pi * (60 - 30 * np.minimum(t, 1.5) / 1.5) * t)
        return (x * np.exp(-t * 2.2) * 0.9).astype(np.float32)
    if name == "gunfire":
        x = np.zeros(n, np.float32)
        for i in range(int(dur / 0.14)):
            a = int(i * 0.14 * SR + rng.randint(0, 800)); b = min(n, a + int(0.06 * SR))
            if b > a:
                seg = rng.randn(b - a).astype(np.float32) * np.exp(-np.arange(b - a) / (0.012 * SR))
                x[a:b] += _lp(seg, 4) * 2.2
        return np.clip(x * 0.6, -1, 1)
    if name == "thunder":
        x = _lp(rng.randn(n).astype(np.float32), 60) * 9
        env = np.exp(-t * 0.9) * (0.6 + 0.4 * np.sin(2 * np.pi * 1.7 * t + 1))
        return (x * env * (1 - np.exp(-t * 30))).astype(np.float32) * 0.9
    if name in ("wolf", "mammoth", "eagle", "cat", "dog", "bear", "sabertooth", "deer"):
        f0, f1, mid = {"wolf": (320, 300, 560), "mammoth": (110, 150, 260), "eagle": (1700, 1500, 2300), "cat": (500, 450, 800), "dog": (250, 200, 380),
                       "bear": (90, 80, 150), "sabertooth": (140, 120, 220), "deer": (400, 380, 520)}[name]
        L = min(dur, 2.4 if name in ("wolf", "mammoth") else 0.9)
        m = int(L * SR); tt = np.arange(m) / SR
        u = tt / L
        f = f0 + (mid - f0) * np.sin(np.pi * np.minimum(u * 1.3, 1) * 0.5) ** 2 + (f1 - mid) * np.clip((u - 0.6) / 0.4, 0, 1)
        ph = 2 * np.pi * np.cumsum(f + 8 * np.sin(2 * np.pi * 5.5 * tt)) / SR
        w = sum(np.sin(ph * h) / h for h in (1, 2, 3)) * np.sin(np.pi * u) ** 0.7
        x = np.zeros(n, np.float32); x[:m] = (w * 0.35).astype(np.float32)
        return x
    if name in ("plane", "tank", "car", "train"):
        base = {"plane": 85, "tank": 50, "car": 120, "train": 70}[name]
        ph = 2 * np.pi * base * t
        w = (np.sin(ph) + 0.5 * np.sin(2 * ph) + 0.3 * np.sign(np.sin(ph * 1.01))) * 0.3 + _lp(rng.randn(n).astype(np.float32), 8) * 1.2
        env = np.sin(np.pi * np.clip(t / dur, 0, 1)) ** 1.2
        if name == "train":
            w = w * (0.6 + 0.4 * (np.sin(2 * np.pi * 4.2 * t) > 0))
        return (w * env * 0.4).astype(np.float32)
    if name == "fire":
        x = np.zeros(n, np.float32)
        for i in range(int(dur * 14)):
            a = rng.randint(0, max(1, n - 400)); x[a:a + 60] += rng.randn(60).astype(np.float32) * rng.uniform(0.2, 1.0)
        x += _lp(rng.randn(n).astype(np.float32), 30) * 1.5
        return (x * 0.18 * np.minimum(1, np.minimum(t * 3, (dur - t) * 3 + 0.1))).astype(np.float32)
    if name == "wind":
        x = _lp(rng.randn(n).astype(np.float32), 10) * 3
        return (x * (0.5 + 0.5 * np.sin(2 * np.pi * 0.4 * t)) * 0.2 * np.sin(np.pi * np.clip(t / dur, 0, 1))).astype(np.float32)
    if name == "bird":
        x = np.zeros(n, np.float32)
        for i in range(int(dur * 2.2)):
            a = rng.randint(0, max(1, n - int(0.2 * SR))); m = int(0.12 * SR); tt = np.arange(m) / SR
            x[a:a + m] += (np.sin(2 * np.pi * (3200 + 1400 * np.sin(tt * 40)) * tt) * np.sin(np.pi * tt / 0.12) * 0.12).astype(np.float32)
        return x
    return np.zeros(n, np.float32)


def sfx_track(proj):
    n = int(proj.total * SR) + SR
    out = np.zeros(n, np.float32)
    for c in proj.cues:
        if c.name in ("rain", "snow", "fog", "dusk", "night", "dust") or not c.sound:
            continue
        a = int(c.start * SR)
        s = sfx(c.name, min(c.end - c.start, 6.0 if c.name != "fire" else (c.end - c.start)), c.seed)
        b = min(n, a + len(s))
        if b > a:
            out[a:b] += s[:b - a] * c.gain
    return out
