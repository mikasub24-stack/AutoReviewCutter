# -*- coding: utf-8 -*-
"""build.bat goi file nay: in ra SO LUONG TIEN TRINH bien dich C (--jobs) hop ly theo RAM trong con trong luc nay.
Moi tien trinh gcc -O3 cua module lon (playwright, pycapcut, yt_dlp, onnxruntime...) an ~2-3 GB RAM; chay bang so nhan CPU tren may it RAM thi het RAM -> may
chuyen sang dung o cung (moi module dich hang chuc phut) roi gcc bi giet -> Nuitka bao 'Failed unexpectedly in Scons C backend compilation'.
Dung:  python buildjobs.py          -> in 1 so nguyen (>=1)
       python buildjobs.py --info   -> in them dong giai thich (stderr)"""
import os, sys

GB_PER_JOB = 3.0        # RAM can cho moi tien trinh bien dich (module lon nhat)
MAX_JOBS = 8


def mem_gb():
    """(tong, con trong) GB bo nho vat ly; None neu khong doc duoc (khong phai Windows)."""
    try:
        import ctypes

        class MS(ctypes.Structure):
            _fields_ = [("dwLength", ctypes.c_ulong), ("dwMemoryLoad", ctypes.c_ulong), ("ullTotalPhys", ctypes.c_ulonglong), ("ullAvailPhys", ctypes.c_ulonglong),
                        ("ullTotalPageFile", ctypes.c_ulonglong), ("ullAvailPageFile", ctypes.c_ulonglong), ("ullTotalVirtual", ctypes.c_ulonglong),
                        ("ullAvailVirtual", ctypes.c_ulonglong), ("ullAvailExtendedVirtual", ctypes.c_ulonglong)]
        m = MS(); m.dwLength = ctypes.sizeof(MS)
        if not ctypes.windll.kernel32.GlobalMemoryStatusEx(ctypes.byref(m)):
            return None
        return m.ullTotalPhys / 2.0 ** 30, m.ullAvailPhys / 2.0 ** 30
    except Exception:
        return None


def pick(cpus, mem, gb_per_job=GB_PER_JOB):
    """cpus: so nhan; mem: (tong, con trong) GB hoac None. Tra ve so tien trinh."""
    cpus = max(1, int(cpus or 1))
    if not mem:
        return max(1, min(cpus, 4))                    # khong biet RAM: than trong
    tot, av = mem
    usable = min(av, tot * 0.8)                        # RAM con trong, nhung khong qua 80% tong (de may con chay duoc)
    return max(1, min(cpus, MAX_JOBS, int(usable // gb_per_job)))


if __name__ == "__main__":
    cpus = os.cpu_count() or 1
    try:
        cpus = int(os.environ.get("NUMBER_OF_PROCESSORS") or cpus)
    except ValueError:
        pass
    mem = mem_gb()
    j = pick(cpus, mem)
    if "--info" in sys.argv:
        sys.stderr.write("[RAM] %s | %d nhan CPU -> bien dich song song %d tien trinh (moi tien trinh ~%.0f GB RAM)\n"
                         % (("tong %.1f GB, con trong %.1f GB" % mem) if mem else "khong doc duoc", cpus, j, GB_PER_JOB))
    print(j)
