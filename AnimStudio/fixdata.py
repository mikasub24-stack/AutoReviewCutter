# -*- coding: utf-8 -*-
"""Chep cac FILE DU LIEU (khong phai ma) cua thu vien phu thuoc con THIEU trong ban vua build vao dung cho cua chung.
Vi sao: Nuitka / PyInstaller khong phai luc nao cung dong goi du file du lieu cua thu vien (vd 'sea_g2p.bin' - 62 MB tu dien phien am cua sea-g2p, thu vien ma VieNeu dung)
-> .exe chay giong VieNeu bao 'OSError: The system cannot find the file specified. (os error 2) [tai g2p.py:34 __init__]'.
Cach dung (build.bat goi sau khi build, truoc khi tu kiem tra):  python fixdata.py dist_new\\AnimStudio
  - lay danh sach goi: vieneu + sea_g2p + cac thu vien phu thuoc cua vieneu (nhu collect_deps.py)
  - voi moi goi: file nao khong phai ma (.py .pyc .pyi .pyd .dll .so ...) ma ban build chua co thi chep sang <dist>\\<goi>\\... (Nuitka) hoac <dist>\\_internal\\<goi>\\... (PyInstaller)
  - in ra tung file da chep. Khong bao gio nem loi (co van de thi in cau canh bao, build.bat van chay tiep)."""
import os, sys, shutil

CODE_EXT = {".py", ".pyc", ".pyo", ".pyi", ".pyd", ".dll", ".so", ".dylib", ".exe", ".c", ".h", ".cpp", ".rs", ".lib", ".a"}
SKIP_DIRS = {"__pycache__", "tests", "test", ".git"}
MUST = ("sea_g2p", "vieneu")          # luon xet, du collect_deps khong liet ke
MAX_FILE = 400 * 1024 * 1024
MAX_TOTAL = 1200 * 1024 * 1024


def package_dirs(extra=()):
    """{ten goi: thu muc} cua cac goi can xet (goi da cai trong moi truong build)."""
    import importlib.util as iu
    names = list(MUST) + list(extra)
    try:
        import collect_deps
        import io, contextlib
        buf = io.StringIO()
        with contextlib.redirect_stdout(buf):
            collect_deps.main(["vieneu", "--nuitka", "--list"])          # bo gradio / fastapi... (rat nang, khong dung)
        for m in buf.getvalue().replace("\n", ",").split(","):
            m = m.strip()
            if m and m != "(khong co)" and m not in names:
                names.append(m)
    except Exception:
        pass
    out = {}
    for n in names:
        try:
            sp = iu.find_spec(n)
        except Exception:
            sp = None
        if sp is not None and sp.submodule_search_locations:
            d = list(sp.submodule_search_locations)[0]
            if os.path.isdir(d):
                out[n] = d
    return out


def target_root(dist):
    """Thu muc goc de chep goi vao: Nuitka -> <dist>; PyInstaller 6 -> <dist>\\_internal."""
    i = os.path.join(dist, "_internal")
    return i if os.path.isdir(i) else dist


def missing_files(src_dir, dst_dir):
    """[(duong dan nguon, duong dan dich)] cac file du lieu cua goi chua co o ban build."""
    out = []
    for root, dirs, files in os.walk(src_dir):
        dirs[:] = [d for d in dirs if d not in SKIP_DIRS and not d.endswith((".dist-info", ".egg-info"))]
        for f in files:
            if os.path.splitext(f)[1].lower() in CODE_EXT:
                continue
            s = os.path.join(root, f)
            d = os.path.join(dst_dir, os.path.relpath(s, src_dir))
            try:
                if os.path.getsize(s) > MAX_FILE:
                    continue
                if not os.path.isfile(d):
                    out.append((s, d))
            except OSError:
                continue
    return out


def fix(dist, pkgs=None, log=print):
    """Tra ve (so file chep, danh sach ten goi con thieu du lieu mac du da chep xong = rong)."""
    pkgs = package_dirs() if pkgs is None else pkgs
    root = target_root(dist)
    copied, total = 0, 0
    for name, src in sorted(pkgs.items()):
        for s, d in missing_files(src, os.path.join(root, name)):
            try:
                sz = os.path.getsize(s)
                if total + sz > MAX_TOTAL:
                    log("[fixdata] bo qua %s (qua tong dung luong cho phep)" % os.path.relpath(s, src))
                    continue
                os.makedirs(os.path.dirname(d), exist_ok=True)
                shutil.copy2(s, d)
                total += sz
                copied += 1
                log("[fixdata] chep them %s\\%s (%.1f MB)" % (name, os.path.relpath(s, src), sz / 1048576.0))
            except Exception as e:
                log("[fixdata] KHONG chep duoc %s: %s" % (s, e))
    return copied


def main(argv):
    if not argv:
        print("dung: python fixdata.py <thu muc ban build>")
        return 0
    dist = argv[0]
    if not os.path.isdir(dist):
        print("[fixdata] khong thay thu muc %s" % dist)
        return 0
    try:
        sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
        n = fix(dist)
        print("[fixdata] %s" % ("da chep %d file du lieu con thieu" % n if n else "du file du lieu, khong can chep them"))
    except Exception as e:
        print("[fixdata] canh bao: %s" % e)
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
