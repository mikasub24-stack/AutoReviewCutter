# -*- coding: utf-8 -*-
"""build.bat goi khi Nuitka bao loi: in thong tin de biet vi sao (RAM, o cung, noi dung nuitka-crash-report.xml) - ban chup man hinh phan nay gui lai.
Dung:  python buildfail.py [thu_muc_build]"""
import os, re, sys, shutil


def free_gb(path):
    try:
        return shutil.disk_usage(path).free / 2.0 ** 30
    except Exception:
        return None


def report_hints(xml_text):
    """Lay vai dong quan trong tu nuitka-crash-report.xml (loi gcc, het bo nho, file bi giu...). Tra ve list dong."""
    out, seen = [], set()
    pats = re.compile(r"(error:|fatal error|out of memory|virtual memory|cannot allocate|killed|no space left|WinError|PermissionError|Access is denied|Errno|cc1\.exe|collect2|ld returned|undefined reference|Exception)", re.I)
    for ln in re.split(r"[\r\n]+", re.sub(r"<[^>]+>", "\n", xml_text or "")):         # moi the xml / dong la mot dong rieng
        t = ln.strip()
        if t and pats.search(t) and t[:160] not in seen:
            seen.add(t[:160]); out.append(t[:220])
        if len(out) >= 14:
            break
    return out


def main():
    base = sys.argv[1] if len(sys.argv) > 1 else "."
    print("---------------- CHAN DOAN LOI BUILD ----------------")
    try:
        from buildjobs import mem_gb
        m = mem_gb()
        if m:
            print("RAM: tong %.1f GB, con trong luc nay %.1f GB" % m)
            if m[1] < 4:
                print("  -> RAM con it: dong trinh duyet / app nang roi build lai (build.bat tu giam so tien trinh theo RAM).")
    except Exception:
        pass
    for label, p in (("O dang build", os.path.abspath(base)), ("O %LOCALAPPDATA% (Nuitka + trinh bien dich)", os.environ.get("LOCALAPPDATA") or "")):
        if p:
            g = free_gb(p)
            if g is not None:
                print("%s: con trong %.1f GB%s" % (label, g, "   <-- THIEU: can it nhat ~10 GB trong" if g < 10 else ""))
    cr = os.path.join(base, "nuitka-crash-report.xml")
    if os.path.isfile(cr):
        try:
            txt = open(cr, encoding="utf-8", errors="replace").read()
            hs = report_hints(txt)
            if hs:
                print("Dong dang chu y trong nuitka-crash-report.xml:")
                for h in hs:
                    print("   " + h)
        except Exception:
            pass
    print("Neu loi la 'WinError 32' / 'Access is denied': them thu muc nay + %LOCALAPPDATA%\\Nuitka vao ngoai le Windows Defender, hoac dat thu muc o duong dan ngan vd E:\\AnimStudio.")
    print("Muon ep so tien trinh: set JOBS=2 roi chay lai build.bat (JOBS=1 la cham nhung it ton RAM nhat).")
    print("-----------------------------------------------------")


if __name__ == "__main__":
    main()
