#!/usr/bin/env python3
"""Tạo danh sách tệp mà app sẽ tải ở lần chạy đầu (assets/files.txt) + tải sẵn vào --data để chạy thử.

Mỗi dòng: tên|url|kích_thước|sha256
Mô hình lấy từ Hugging Face (cố định theo mã commit tại thời điểm dựng); từ điển g2p lấy từ GitHub (cố định theo commit).
"""
from __future__ import annotations

import argparse
import hashlib
import json
import os
import sys
import urllib.request
from pathlib import Path


def load_pins(path: Path) -> dict:
    d = {}
    for line in path.read_text(encoding="utf-8").splitlines():
        line = line.strip()
        if line and not line.startswith("#") and "=" in line:
            k, v = line.split("=", 1)
            d[k.strip()] = v.strip()
    return d


def http_json(url: str):
    req = urllib.request.Request(url, headers={"User-Agent": "ninhdon-ci"})
    with urllib.request.urlopen(req, timeout=60) as r:
        return json.load(r)


def download(url: str, dest: Path) -> tuple[int, str]:
    h = hashlib.sha256()
    n = 0
    req = urllib.request.Request(url, headers={"User-Agent": "ninhdon-ci"})
    with urllib.request.urlopen(req, timeout=120) as r, open(dest, "wb") as f:
        while True:
            b = r.read(1 << 20)
            if not b:
                break
            f.write(b)
            h.update(b)
            n += len(b)
    return n, h.hexdigest()


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--pins", default=str(Path(__file__).with_name("pins.env")))
    ap.add_argument("--data", required=True, help="thư mục lưu mô hình + từ điển đã tải")
    ap.add_argument("--manifest", required=True, help="đường dẫn files.txt cần ghi")
    a = ap.parse_args()

    pins = load_pins(Path(a.pins))
    data = Path(a.data)
    data.mkdir(parents=True, exist_ok=True)

    info = http_json("https://huggingface.co/api/models/" + pins["HF_REPO"])
    rev = info.get("sha")
    if not rev:
        print("Không lấy được mã commit của mô hình:", info)
        return 2
    print("Mô hình", pins["HF_REPO"], "commit", rev)

    model_name = "vieneu-v3-turbo-q8_0.gguf"
    model_url = "https://huggingface.co/%s/resolve/%s/%s" % (pins["HF_REPO"], rev, pins["MODEL_FILE"])
    dict_name = "sea_g2p.bin"
    dict_url = "https://raw.githubusercontent.com/%s/%s/%s" % (
        pins["SEAG2P_REPO"].replace("https://github.com/", "").replace(".git", ""),
        pins["SEAG2P_SHA"], pins["DICT_PATH"])

    lines = []
    for name, url in ((model_name, model_url), (dict_name, dict_url)):
        print("Tải", url)
        size, sha = download(url, data / name)
        print("  ->", name, size, "byte, sha256", sha)
        if size < 1_000_000:
            print("Tệp quá nhỏ, có thể tải sai:", name)
            return 3
        lines.append("%s|%s|%d|%s" % (name, url, size, sha))

    Path(a.manifest).parent.mkdir(parents=True, exist_ok=True)
    Path(a.manifest).write_text("\n".join(lines) + "\n", encoding="utf-8")
    print("Đã ghi", a.manifest)
    return 0


if __name__ == "__main__":
    sys.exit(main())
