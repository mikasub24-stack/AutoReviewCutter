#!/usr/bin/env python3
"""Kiểm tra bộ thư viện .so cho Android: SONAME phải trùng tên tệp, mọi thư viện phụ thuộc (NEEDED)
phải có trong thư mục hoặc là thư viện hệ thống Android. Với --fix sẽ sửa SONAME/NEEDED kiểu
"libX.so.0" -> "libX.so" bằng patchelf (APK chỉ nhận tên dạng lib*.so)."""
from __future__ import annotations

import argparse
import re
import shutil
import subprocess
import sys
from pathlib import Path

SYSTEM = {
    "libc.so", "libm.so", "libdl.so", "liblog.so", "libandroid.so", "libz.so", "libstdc++.so",
    "libEGL.so", "libGLESv2.so", "libvulkan.so", "libOpenSLES.so", "libjnigraphics.so",
    "libnativewindow.so", "libcamera2ndk.so", "libmediandk.so", "libaaudio.so", "libbinder_ndk.so",
}


def readelf_dyn(readelf: str, path: Path):
    out = subprocess.run([readelf, "-d", str(path)], capture_output=True, text=True, check=True).stdout
    soname = None
    needed = []
    for line in out.splitlines():
        m = re.search(r"\(SONAME\)\s+Library soname: \[(.+?)\]", line)
        if m:
            soname = m.group(1)
        m = re.search(r"\(NEEDED\)\s+Shared library: \[(.+?)\]", line)
        if m:
            needed.append(m.group(1))
    return soname, needed


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("dir")
    ap.add_argument("--readelf", default="llvm-readelf")
    ap.add_argument("--fix", action="store_true")
    a = ap.parse_args()

    d = Path(a.dir)
    libs = sorted(d.glob("*.so"))
    if not libs:
        print("Không có .so nào trong", d)
        return 1
    names = {p.name for p in libs}
    info = {p.name: readelf_dyn(a.readelf, p) for p in libs}

    # 1. tên dạng "libX.so.N" (SONAME khác tên tệp) -> sửa
    rename = {}
    for name, (so, _need) in info.items():
        if so and so != name:
            rename[so] = name
    problems = 0
    if rename:
        print("SONAME khác tên tệp:", rename)
        if a.fix:
            pe = shutil.which("patchelf")
            if not pe:
                subprocess.run([sys.executable, "-m", "pip", "install", "--quiet", "patchelf"], check=False)
                pe = shutil.which("patchelf")
            if not pe:
                print("Cần patchelf để sửa")
                return 2
            for p in libs:
                so, need = info[p.name]
                if so and so != p.name:
                    subprocess.run([pe, "--set-soname", p.name, str(p)], check=True)
                for n in need:
                    if n in rename:
                        subprocess.run([pe, "--replace-needed", n, rename[n], str(p)], check=True)
            info = {p.name: readelf_dyn(a.readelf, p) for p in libs}
        else:
            problems += 1

    # 2. NEEDED phải có sẵn
    for name, (so, need) in sorted(info.items()):
        missing = [n for n in need if n not in names and n not in SYSTEM]
        print("%-40s soname=%s needed=%s" % (name, so, need))
        if so and so != name:
            print("   !! SONAME vẫn khác tên tệp")
            problems += 1
        if missing:
            print("   !! thiếu thư viện phụ thuộc:", missing)
            # các biến thể CPU nạp động có thể phụ thuộc libggml-base; chỉ báo lỗi cho thư viện chính
            if not name.startswith("libggml-cpu-"):
                problems += 1
    cpu = [n for n in names if n.startswith("libggml-cpu-")]
    print("Biến thể CPU:", ", ".join(sorted(cpu)) or "(không có)")
    for n in names:
        if re.search(r"\.so\.\d", n):
            print("!! tên không hợp lệ cho APK:", n)
            problems += 1
    if problems:
        print("CÓ %d VẤN ĐỀ" % problems)
        return 3
    print("OK")
    return 0


if __name__ == "__main__":
    sys.exit(main())
