# -*- coding: utf-8 -*-
"""build.bat goi file nay: in ra MOT CHUOI ngan (hash) dac trung cho 'moi truong dich' = ban Python + ban Nuitka + he dieu hanh/kien truc.
build.bat so voi chuoi luu trong nuitka_build\\build_sig.txt: giong nhau thi GIU thu muc nuitka_build va chi dich lai nhung module doi (build nhanh);
khac (doi Python / nang cap Nuitka) hoac khong doc duoc thi dich lai tu dau. Khong doc duoc Nuitka -> in rong (build.bat dich lai tu dau)."""
import hashlib, platform, sys


def sig():
    try:
        try:
            from importlib import metadata as md
            nv = md.version("nuitka")
        except Exception:
            nv = ""
        if not nv:
            return ""
        raw = "|".join([sys.version, sys.executable.lower(), platform.platform(), platform.machine(), nv])
        return hashlib.sha1(raw.encode("utf-8", "replace")).hexdigest()[:16]
    except Exception:
        return ""


if __name__ == "__main__":
    print(sig())
