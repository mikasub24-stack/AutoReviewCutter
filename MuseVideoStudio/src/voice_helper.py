# -*- coding: utf-8 -*-
"""Giọng đọc miễn phí cho tab «Kể chuyện». Chạy trong môi trường Python riêng do app tạo.

Dùng:  python voice_helper.py job.json
job = {"engine": "edge" | "clone" | "preset" | "list", "voice": "...", "ref": "mau.wav", "items": [{"id": "1", "text": "...", "out": "1.mp3"}]}
Mỗi dòng stdout là một JSON: {"event": ...} | {"done": id} | {"error": "..."}.
  edge  : Microsoft Edge TTS (miễn phí, cần mạng), tạo file .mp3
  clone : VieNeu chạy ngay trên máy (miễn phí), nhân bản giọng từ file mẫu, tạo file .wav
  preset: giọng Việt có sẵn của VieNeu (25 giọng, chạy offline, không cần file mẫu), tạo file .wav
  list  : tải danh sách giọng THẬT của Microsoft (edge_tts.list_voices) ghi vào job["out"] (.json)
"""
import asyncio
import json
import os
import re
import sys


def emit(obj):
    sys.stdout.write(json.dumps(obj, ensure_ascii=False) + "\n")
    sys.stdout.flush()


def pieces(text, limit=180):
    """Chia lời đọc thành các đoạn ngắn theo câu để mô hình đọc ổn định."""
    text = re.sub(r"\s+", " ", text).strip()
    out, cur = [], ""
    for sentence in re.split(r"(?<=[.!?…])\s+", text):
        sentence = sentence.strip()
        if not sentence:
            continue
        while len(sentence) > limit:
            cut = sentence.rfind(" ", 0, limit)
            cut = cut if cut > 20 else limit
            if cur:
                out.append(cur)
                cur = ""
            out.append(sentence[:cut].strip())
            sentence = sentence[cut:].strip()
        if not cur:
            cur = sentence
        elif len(cur) + 1 + len(sentence) <= limit:
            cur += " " + sentence
        else:
            out.append(cur)
            cur = sentence
    if cur:
        out.append(cur)
    return out


def run_edge(job):
    import edge_tts

    voice = job["voice"]
    base = float(os.environ.get("VOICE_RETRY_SECONDS", "2"))

    async def one(item):
        last = None
        for attempt in range(4):
            try:
                await edge_tts.Communicate(item["text"], voice).save(item["out"])
                if os.path.exists(item["out"]) and os.path.getsize(item["out"]) > 0:
                    return
                last = "không nhận được âm thanh"
            except Exception as error:  # noqa: BLE001 - báo nguyên nhân thật cho người dùng
                last = str(error) or error.__class__.__name__
            await asyncio.sleep(base + attempt * base * 1.5)
        raise RuntimeError("Microsoft không trả giọng đọc (%s). Kiểm tra mạng và đồng hồ Windows rồi thử lại." % last)

    async def main():
        # Đọc nhiều cảnh cùng lúc (tối đa 4) cho nhanh; mỗi cảnh vẫn ghi vào đúng file của nó.
        gate = asyncio.Semaphore(4)

        async def guarded(item):
            async with gate:
                await one(item)
                emit({"done": item["id"]})

        await asyncio.gather(*(guarded(item) for item in job["items"]))

    asyncio.run(main())


def open_vieneu(preset=False):
    emit({"event": "loading"})
    import numpy as np
    from vieneu import Vieneu

    if preset:
        # 25 giọng có sẵn nằm trong chế độ v3turbo; bản VieNeu cũ không có tham số mode thì dùng mặc định.
        try:
            tts = Vieneu(mode="v3turbo")
        except TypeError:
            tts = Vieneu()
    else:
        tts = Vieneu()
    emit({"event": "loaded"})
    return np, tts


def write_items(np, tts, job, speak):
    """Đọc từng cảnh: chia câu, ghép lại với nhịp nghỉ ngắn, ghi file .wav của cảnh."""
    for item in job["items"]:
        parts = []
        for text in pieces(item["text"]) or [item["text"]]:
            parts.append(np.asarray(speak(text), dtype=np.float32).reshape(-1))
        rate = int(getattr(tts, "sample_rate", 0) or 48000)
        gap = np.zeros(int(rate * 0.12), dtype=np.float32)
        joined = parts[0]
        for part in parts[1:]:
            joined = np.concatenate([joined, gap, part])
        tts.save(joined, item["out"])
        if not os.path.exists(item["out"]) or os.path.getsize(item["out"]) == 0:
            raise RuntimeError("VieNeu không tạo được file âm thanh.")
        emit({"done": item["id"]})


def run_clone(job):
    np, tts = open_vieneu()
    ref, name = job["ref"], job["voice"]
    if not os.path.exists(ref):
        raise RuntimeError("Không thấy file giọng mẫu: " + ref)
    use = {}
    try:
        tts.add_voice(name, ref)
        use = {"voice": name}
    except Exception:  # noqa: BLE001 - bản VieNeu khác: đọc thẳng từ file mẫu
        use = {"ref_audio": ref}

    def speak(text):
        try:
            return tts.infer(text, denoise=True, **use) if "ref_audio" in use else tts.infer(text, **use)
        except TypeError:
            return tts.infer(text, **use)

    write_items(np, tts, job, speak)


def run_preset(job):
    np, tts = open_vieneu(preset=True)
    name = job["voice"]

    def speak(text):
        try:
            return tts.infer(text, voice=name)
        except Exception as error:  # noqa: BLE001 - báo rõ giọng nào không dùng được
            raise RuntimeError("Giọng VieNeu «%s» chưa đọc được: %s" % (name, str(error) or error.__class__.__name__))

    write_items(np, tts, job, speak)


def run_list(job):
    import edge_tts

    rows = asyncio.run(edge_tts.list_voices())
    keep = [
        {"ShortName": r.get("ShortName"), "Gender": r.get("Gender"), "Locale": r.get("Locale"), "Status": r.get("Status") or "GA"}
        for r in (rows or [])
        if isinstance(r, dict) and r.get("ShortName")
    ]
    with open(job["out"], "w", encoding="utf-8") as handle:
        json.dump(keep, handle, ensure_ascii=False)


def main():
    with open(sys.argv[1], encoding="utf-8") as handle:
        job = json.load(handle)
    try:
        if job["engine"] == "edge":
            run_edge(job)
        elif job["engine"] == "clone":
            run_clone(job)
        elif job["engine"] == "preset":
            run_preset(job)
        elif job["engine"] == "list":
            run_list(job)
        else:
            raise RuntimeError("Engine giọng không hợp lệ: " + str(job["engine"]))
        emit({"ok": True})
    except ImportError as error:
        emit({"error": "Thiếu thư viện giọng (%s). Bấm «Cài giọng miễn phí» để cài lại." % error})
        sys.exit(2)
    except Exception as error:  # noqa: BLE001
        emit({"error": str(error) or error.__class__.__name__})
        sys.exit(1)


if __name__ == "__main__":
    main()
