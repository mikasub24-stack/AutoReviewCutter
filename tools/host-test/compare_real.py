#!/usr/bin/env python3
"""So bộ đổi tốc độ với atempo của ffmpeg trên giọng nói thật (voices/*.wav).
Đo: độ dài, cao độ, độ "tuần hoàn" của âm hữu thanh (giảm nhiều = nghe rè/vọng), tương quan đường bao năng lượng."""
import subprocess, sys, os, tempfile, wave
import numpy as np

root = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
out = sys.argv[1]
os.makedirs(out, exist_ok=True)

def read(p):
    with wave.open(p) as w:
        sr = w.getframerate(); x = np.frombuffer(w.readframes(w.getnframes()), dtype="<i2").astype(np.float64)
    return sr, x

def f0_track(x, sr):
    win = int(0.04 * sr); hop = int(0.01 * sr); lmin = sr // 400; lmax = sr // 70
    mx = np.abs(x).max()
    t, f, v = [], [], []
    for s in range(0, len(x) - win - lmax, hop):
        a = x[s:s + win]
        e = np.sqrt(np.mean(a * a))
        t.append((s + win / 2) / sr)
        if e < 0.05 * mx:
            f.append(0); v.append(0); continue
        # tự tương quan chuẩn hoá
        seg = x[s:s + win + lmax]
        best, bl = -1, 0
        ea = np.dot(a, a)
        for lag in range(lmin, lmax + 1):
            b = seg[lag:lag + win]
            c = np.dot(a, b) / np.sqrt(ea * np.dot(b, b) + 1)
            if c > best: best, bl = c, lag
        f.append(sr / bl if best > 0.5 else 0); v.append(best)
    return np.array(t), np.array(f), np.array(v)

def envelope(x, sr, ms=20):
    n = int(sr * ms / 1000)
    m = len(x) // n
    return np.sqrt((x[:m * n].reshape(m, n) ** 2).mean(axis=1))

def resample_env(e, m):
    return np.interp(np.linspace(0, len(e) - 1, m), np.arange(len(e)), e)

rows = []
for name in ["ninh_don_ref", "adam", "tung_dang"]:
    src = os.path.join(root, "voices", name + ".wav")
    for sr_target in (24000, 48000):
        base = os.path.join(out, f"{name}_{sr_target}.wav")
        subprocess.run(["ffmpeg", "-y", "-v", "error", "-i", src, "-ar", str(sr_target), "-ac", "1", "-c:a", "pcm_s16le", base], check=True)
        sr, x = read(base)
        t0, f0, v0 = f0_track(x, sr)
        vm = f0 > 0
        med0 = np.median(f0[vm]); voice0 = v0[vm].mean()
        for sp in (0.6, 0.8, 1.25, 1.5, 1.8):
            mine = os.path.join(out, f"{name}_{sr_target}_mine_{sp}.wav")
            ref = os.path.join(out, f"{name}_{sr_target}_atempo_{sp}.wav")
            subprocess.run(["java", "-cp", sys.argv[2], "StretchCli", base, mine, str(sp)], check=True, stderr=subprocess.DEVNULL)
            subprocess.run(["ffmpeg", "-y", "-v", "error", "-i", base, "-filter:a", f"atempo={sp}", "-c:a", "pcm_s16le", ref], check=True)
            res = {}
            for tag, p in (("mine", mine), ("atempo", ref)):
                s2, y = read(p)
                t1, f1, v1 = f0_track(y, s2)
                m1 = f1 > 0
                res[tag] = dict(dur=len(y) / s2, med=np.median(f1[m1]), voice=v1[m1].mean(), y=y)
            ea = envelope(res["mine"]["y"], sr); eb = envelope(res["atempo"]["y"], sr)
            m = min(len(ea), len(eb))
            corr = np.corrcoef(ea[:m], eb[:m])[0, 1]
            # so với bản gốc đã co/giãn đường bao tuyến tính
            eo = resample_env(envelope(x, sr), len(ea))
            corr_o = np.corrcoef(ea[:len(eo)], eo[:len(ea)])[0, 1]
            rows.append((name, sr_target, sp, len(x) / sr / sp, res["mine"]["dur"], res["atempo"]["dur"], med0,
                         res["mine"]["med"], res["atempo"]["med"], voice0, res["mine"]["voice"], res["atempo"]["voice"], corr, corr_o))

print(f"{'giọng':13}{'Hz':>6}{'tốc độ':>7} | {'dài mong':>8}{'mine':>7}{'atempo':>7} | {'f0 gốc':>7}{'mine':>7}{'atempo':>7} | {'tuầnhoàn gốc':>12}{'mine':>6}{'atempo':>7} | {'ĐBnăng lượng mine~atempo':>25}")
bad = 0
for r in rows:
    print(f"{r[0]:13}{r[1]:>6}{r[2]:>7} | {r[3]:8.2f}{r[4]:7.2f}{r[5]:7.2f} | {r[6]:7.1f}{r[7]:7.1f}{r[8]:7.1f} | {r[9]:12.3f}{r[10]:6.3f}{r[11]:7.3f} | {r[12]:25.3f}")
    if abs(r[4] / r[3] - 1) > 0.005: bad += 1; print("   !! độ dài lệch")
    if abs(r[7] / r[6] - 1) > 0.05: bad += 1; print("   !! cao độ lệch")
    if r[10] < r[9] - 0.12: bad += 1; print("   !! tuần hoàn giảm nhiều")
    if r[12] < 0.85: bad += 1; print("   !! đường bao khác atempo")
print("TỔNG: %d dòng, %d cảnh báo" % (len(rows), bad))
sys.exit(1 if bad else 0)
