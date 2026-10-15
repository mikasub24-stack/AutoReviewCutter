#!/usr/bin/env python3
"""Tạo tệp giọng cho app Android từ các tệp WAV mẫu.

Bộ mã hoá giọng (CAM++) chưa có trong audio.cpp nên phải chạy bằng Python (`pip install vieneu`),
một lần, trên CI. App chỉ đọc kết quả:

    <out>/<id>/ref_codes.txt      mỗi dòng 1 khung, các số nguyên cách nhau bằng dấu cách
    <out>/<id>/speaker.emb.txt    1 dòng, 192 số thực cách nhau bằng dấu phẩy
    <out>/voices.txt              id|Tên hiển thị
    <out>/version.txt             mã băm nội dung (đổi khi giọng đổi -> app chép lại giọng)

Cách dùng:
    python tools/make_voices.py --wav-dir voices --out android/app/src/main/assets/voices
"""
from __future__ import annotations

import argparse
import hashlib
import os
import sys
from pathlib import Path

# (id, tên hiển thị, tệp wav) - đúng thứ tự hiện trong app
VOICES = [
    ("ninh_don", "Ninh Đôn", "ninh_don_ref.wav"),
    ("adam", "Adam", "adam.wav"),
    ("tung_dang", "Tùng Đặng", "tung_dang.wav"),
]

BASE_REPO = "pnnbao-ump/VieNeu-TTS-v3-Turbo"
EMB_DIM = 192
ENCODER_PAD_CODE = 455   # khung đệm cuối do bộ mã hoá thêm (giống vieneu_utils.core_utils)


def log(msg: str) -> None:
    print(msg, flush=True)


def materialize_hf_symlinks() -> int:
    """ONNX Runtime bản mới từ chối tệp dữ liệu ngoài (*.data) nếu đường dẫn đi qua liên kết tắt
    ra khỏi thư mục mô hình - đúng kiểu bộ nhớ đệm Hugging Face (snapshots/ -> blobs/).
    Thay mỗi liên kết tắt trong snapshots/ bằng bản sao thật."""
    import shutil
    roots = []
    for env in ("HF_HUB_CACHE", "HUGGINGFACE_HUB_CACHE"):
        if os.environ.get(env):
            roots.append(Path(os.environ[env]))
    hf_home = Path(os.environ.get("HF_HOME") or (Path.home() / ".cache" / "huggingface"))
    roots.append(hf_home / "hub")
    n = 0
    for root in roots:
        if not root.is_dir():
            continue
        for dirpath, _dirs, files in os.walk(root):
            if "snapshots" not in Path(dirpath).parts:
                continue
            for name in files:
                p = Path(dirpath) / name
                if p.is_symlink():
                    target = p.resolve()
                    if target.is_file():
                        p.unlink()
                        shutil.copy2(target, p)
                        n += 1
    log("Đã thay %d liên kết tắt bằng bản sao thật" % n)
    return n


def load_engine(base: str):
    from vieneu import Vieneu
    errors = []
    attempts = [
        dict(mode="v3turbo", backend="onnx", precision="fp32", backbone_repo=base),
        dict(mode="v3turbo", backend="onnx", backbone_repo=base),
        dict(mode="v3turbo"),
    ]
    materialized = False
    for rnd in range(2):
        for kw in attempts:
            try:
                log("Vieneu(%s)" % ", ".join("%s=%r" % kv for kv in kw.items()))
                return Vieneu(**kw)
            except Exception as e:   # noqa: BLE001 - thử cấu hình kế tiếp, in hết lỗi nếu đều hỏng
                errors.append("%s -> %s: %s" % (kw, type(e).__name__, e))
                log("  lỗi: %s: %s" % (type(e).__name__, str(e)[:300]))
        if materialized or "External data path" not in errors[-1]:
            break
        materialize_hf_symlinks()
        materialized = True
    raise RuntimeError("Không khởi tạo được Vieneu:\n" + "\n".join(e[:400] for e in errors))


def strip_pad(codes):
    import numpy as np
    arr = np.asarray(codes)
    if arr.ndim == 2 and arr.shape[0] > 1 and int(arr[-1, 0]) == ENCODER_PAD_CODE:
        return arr[:-1]
    return arr


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--wav-dir", required=True)
    ap.add_argument("--out", required=True)
    ap.add_argument("--base", default=BASE_REPO)
    ap.add_argument("--no-denoise", action="store_true")
    args = ap.parse_args()

    import numpy as np

    wav_dir = Path(args.wav_dir)
    out = Path(args.out)
    out.mkdir(parents=True, exist_ok=True)

    tts = load_engine(args.base)
    h = hashlib.sha256()
    lines = []
    for vid, label, wav in VOICES:
        src = wav_dir / wav
        if not src.is_file():
            log("THIẾU tệp giọng mẫu: %s" % src)
            return 2
        log("== %s (%s)" % (label, src))
        spk, codes = tts.encode_reference(str(src), denoise=not args.no_denoise)
        spk = np.asarray(spk, dtype=np.float64).reshape(-1)
        if spk.size != EMB_DIM:
            log("LỖI: speaker embedding có %d số, cần %d" % (spk.size, EMB_DIM))
            return 3
        if not np.all(np.isfinite(spk)):
            log("LỖI: speaker embedding có giá trị không hợp lệ")
            return 3
        if codes is None:
            log("LỖI: không có ref_codes cho %s" % label)
            return 3
        codes = strip_pad(np.asarray(codes))
        if codes.ndim != 2 or codes.shape[0] < 4:
            log("LỖI: ref_codes có hình dạng lạ: %s" % (codes.shape,))
            return 3
        codes = codes.astype(np.int64)
        d = out / vid
        d.mkdir(parents=True, exist_ok=True)
        np.savetxt(d / "ref_codes.txt", codes, fmt="%d")
        (d / "speaker.emb.txt").write_text(",".join("%.6f" % x for x in spk) + "\n", encoding="utf-8")
        log("   emb=%d số (|v|=%.3f), codes=%s" % (spk.size, float(np.linalg.norm(spk)), codes.shape))
        h.update(vid.encode())
        h.update((d / "ref_codes.txt").read_bytes())
        h.update((d / "speaker.emb.txt").read_bytes())
        lines.append("%s|%s" % (vid, label))

    (out / "voices.txt").write_text("\n".join(lines) + "\n", encoding="utf-8")
    (out / "version.txt").write_text(h.hexdigest()[:16] + "\n", encoding="utf-8")
    log("Đã tạo %d giọng vào %s" % (len(lines), out))
    return 0


if __name__ == "__main__":
    sys.exit(main())
