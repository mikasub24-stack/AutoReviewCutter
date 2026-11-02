"""Cuu video: ghep cac anh khung da ve (cache/frames) theo thu tu thoi gian tao ra khi khong con ke hoach chia canh cu.
Khop loi noi chi GAN DUNG: chia deu cac khung theo so tu cua loi doc."""
import os, time
from .common import APP_DIR, DATA_DIR
from . import langs

FR = os.path.join(DATA_DIR, "cache", "frames")


def files():
    out = []
    if os.path.isdir(FR):
        for f in os.listdir(FR):
            if f.endswith(".png") and not f.startswith("cast_"):
                p = os.path.join(FR, f)
                out.append((os.path.getmtime(p), p))
    return sorted(out)


def clusters(gap=900):
    cl, cur = [], []
    for t, p in files():
        if cur and t - cur[-1][0] > gap:
            cl.append(cur); cur = []
        cur.append((t, p))
    if cur:
        cl.append(cur)
    return cl


def summary():
    return [dict(idx=i + 1, count=len(c), t0=time.strftime("%d/%m %H:%M", time.localtime(c[0][0])), t1=time.strftime("%H:%M", time.localtime(c[-1][0]))) for i, c in enumerate(clusters())]


def build_frames(P, n, cluster, log=print):
    """Gan n anh dau cua cum 'cluster' (1-based) vao P.frames, chia deu theo so tu cua loi doc."""
    cl = clusters()
    if not cl:
        raise RuntimeError("Không có ảnh khung nào trong bộ nhớ (cache/frames).")
    c = cl[cluster - 1] if 1 <= cluster <= len(cl) else max(cl, key=len)
    if len(c) < n:
        log(f"  cụm ảnh chỉ có {len(c)} ảnh (< {n}); dùng {len(c)} ảnh.")
        n = len(c)
    paths = [p for _, p in c[:n]]
    lines = P.lines
    words = [max(1, langs.wcount(l.text)) for l in lines]
    W = float(sum(words))
    cum = [0.0]
    for w in words:
        cum.append(cum[-1] + w)

    def t_at(x):
        if x <= 0:
            return 0.0
        if x >= W:
            return P.total
        i = max(k for k in range(len(words)) if cum[k] <= x)
        l = lines[i]
        return l.start + (x - cum[i]) / words[i] * max(l.end - l.start, 0.01)

    P.frames = []
    for k, p in enumerate(paths):
        a, b = k * W / n, (k + 1) * W / n
        mid = (a + b) / 2
        li = max(j for j in range(len(words)) if cum[j] <= mid)
        P.frames.append(dict(start=0.0 if k == 0 else t_at(a), end=P.total if k == n - 1 else t_at(b), path=p, line=lines[li], scene=getattr(lines[li], "scene", 0), shot="medium", path2=None))
    P.cues = []
    log(f"Đã ghép {n} ảnh theo thứ tự vẽ vào {len(lines)} câu thoại (khớp lời chỉ gần đúng).")
    return n
