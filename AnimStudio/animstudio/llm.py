# -*- coding: utf-8 -*-
"""AI doc truyen (online) -> kich ban AnimStudio. Co du phong offline. Chi dung urllib."""
import json, re, os, urllib.request, urllib.error
from .common import APP_DIR, DATA_DIR
from .script import parse_script
from .director import prepare_text, looks_like_script, EXTRAS, FX

CFG = os.path.join(DATA_DIR, "config.json")
BACKENDS = ["Quy tắc offline (không cần mạng)", "Miễn phí online (Pollinations, không cần key)", "Claude (API key)", "OpenAI / tương thích (URL + key)", "Gemini (API key miễn phí từ aistudio.google.com)", "Gemini qua trình duyệt (dùng tài khoản của bạn, không cần key)"]

SYSTEM = """Bạn là đạo diễn. Hãy chuyển TRUYỆN người dùng đưa thành KỊCH BẢN theo đúng cú pháp sau, chỉ trả về kịch bản, không giải thích, không markdown.

Cú pháp:
@title Tên tiếng Việt | English Title
@era ancient|war|modern|imperial      (ancient = người nguyên thủy ăn lông ở lỗ; war = chiến tranh thế giới; modern = hiện đại; imperial = cung đình cổ)
@lang vi|en
@char Tên: mô tả ngắn (nam/nữ, tuổi, nghề: thợ săn, thủ lĩnh, lính, sĩ quan, bác sĩ...)
[Cảnh: mô tả nơi chốn, thời gian, thời tiết | Tên1, Tên2]
Tên (cảm xúc): lời thoại
Lời dẫn: câu dẫn truyện (dòng không có tên = người dẫn)
{fx: tên1, tên2}   (đặt ở dòng riêng ngay trước câu nó áp dụng, hoặc cuối câu)

cảm xúc: vui, buồn, giận, sợ, ngạc nhiên, nghiêm túc, bình thường.
Hiệu ứng/vật thể hợp lệ cho {fx}: %s.
Quy tắc: mỗi cảnh là một địa điểm/thời điểm; tách cảnh khi đổi nơi; câu ngắn (dưới 25 từ) để dễ đọc; chuyển văn xuôi thành thoại + lời dẫn; thêm {fx} chỉ khi truyện thật sự có (mưa, nổ, sói, voi ma mút, xe tăng...); giữ nguyên ngôn ngữ truyện.""" % ", ".join(EXTRAS + FX)


def load_cfg():
    try:
        return json.load(open(CFG, encoding="utf-8"))
    except Exception:
        return {}


def save_cfg(d):
    try:
        os.makedirs(os.path.dirname(CFG), exist_ok=True)
        json.dump(d, open(CFG, "w", encoding="utf-8"), ensure_ascii=False, indent=1)
    except Exception:
        pass


def _post(url, headers, body, timeout=120):
    req = urllib.request.Request(url, json.dumps(body).encode("utf-8"), dict(headers, **{"Content-Type": "application/json"}))
    try:
        with urllib.request.urlopen(req, timeout=timeout) as r:
            return json.loads(r.read().decode("utf-8"))
    except urllib.error.HTTPError as e:
        raise RuntimeError("HTTP %s: %s" % (e.code, e.read().decode("utf-8", "ignore")[:300]))


def _chat_openai(base, key, model, system, user):
    url = base.rstrip("/")
    if not url.endswith("/chat/completions"):
        url += "/chat/completions"
    h = {"Authorization": "Bearer " + key} if key else {}
    d = _post(url, h, {"model": model, "temperature": 0.4, "messages": [{"role": "system", "content": system}, {"role": "user", "content": user}]})
    m = (d.get("choices") or [{}])[0].get("message") or {}
    txt = m.get("content") or m.get("reasoning_content") or ""
    if isinstance(txt, list):
        txt = "".join(x.get("text", "") for x in txt if isinstance(x, dict))
    if not txt.strip():
        raise RuntimeError("AI trả về nội dung rỗng")
    return txt


def _chat_pollinations(system, user, model="openai"):
    """Pollinations: thu endpoint kieu OpenAI, loi thi thu endpoint van ban thuan."""
    try:
        return _chat_openai("https://text.pollinations.ai/openai", "", model, system, user)
    except Exception as e1:
        req = urllib.request.Request("https://text.pollinations.ai/", json.dumps({"messages": [{"role": "system", "content": system}, {"role": "user", "content": user}], "model": model, "jsonMode": False}).encode("utf-8"),
                                     {"Content-Type": "application/json"})
        try:
            with urllib.request.urlopen(req, timeout=150) as r:
                t = r.read().decode("utf-8", "ignore")
            try:
                j = json.loads(t)
                if isinstance(j, dict):
                    t = j.get("content") or (j.get("choices") or [{}])[0].get("message", {}).get("content") or t
            except Exception:
                pass
            if t.strip():
                return t
        except Exception as e2:
            raise RuntimeError("Pollinations lỗi: %s | %s" % (str(e1)[:100], str(e2)[:100]))
        raise RuntimeError("Pollinations lỗi: " + str(e1)[:150])


def _chat_gemini(key, model, system, user, json_mode=False):
    last = ""
    for m in [x for x in [model, "gemini-2.0-flash", "gemini-2.5-flash", "gemini-1.5-flash"] if x]:
        body = {"systemInstruction": {"parts": [{"text": system}]}, "contents": [{"role": "user", "parts": [{"text": user}]}],
                "generationConfig": {"temperature": 0.4, "maxOutputTokens": 8192}}
        if json_mode:
            body["generationConfig"]["responseMimeType"] = "application/json"
        try:
            d = _post("https://generativelanguage.googleapis.com/v1beta/models/%s:generateContent?key=%s" % (m, key), {}, body, timeout=180)
            parts = ((d.get("candidates") or [{}])[0].get("content") or {}).get("parts") or []
            t = "".join(p.get("text", "") for p in parts)
            if t.strip():
                return t
            last = "Gemini trả về rỗng"
        except Exception as e:
            last = str(e)[:200]
            if "API key" in last or "403" in last or "400" in last and "key" in last.lower():
                break
    raise RuntimeError("Gemini lỗi: " + last)


def _chat_claude(key, model, system, user):
    d = _post("https://api.anthropic.com/v1/messages", {"x-api-key": key, "anthropic-version": "2023-06-01"},
              {"model": model or "claude-sonnet-4-5", "max_tokens": 8000, "system": system, "messages": [{"role": "user", "content": user}]})
    return "".join(b.get("text", "") for b in d["content"])


def call(cfg, user):
    b = cfg.get("backend", 0)
    if b == 1:
        return _chat_pollinations(SYSTEM, user, cfg.get("model") or "openai")
    if b == 4:
        return _chat_gemini(cfg.get("key", ""), cfg.get("model", ""), SYSTEM, user)
    if b == 5:
        from . import flowgen
        return flowgen.gemini_ask(SYSTEM, user, cfg.get("browser", 0))
    if b == 2:
        return _chat_claude(cfg.get("key", ""), cfg.get("model", ""), SYSTEM, user)
    if b == 3:
        return _chat_openai(cfg.get("url", ""), cfg.get("key", ""), cfg.get("model", ""), SYSTEM, user)
    raise RuntimeError("no backend")


def chunks(text, n=6000):
    paras, cur, out = re.split(r"\n\s*\n|\n", text), "", []
    for p in paras:
        if len(cur) + len(p) > n and cur:
            out.append(cur); cur = ""
        cur += p + "\n"
    if cur.strip():
        out.append(cur)
    return out


def clean(s):
    s = re.sub(r"^```\w*\s*|\s*```\s*$", "", s.strip(), flags=re.M)
    return s.strip()


def story_to_script(text, cfg=None, log=print):
    """Tra ve (kich_ban, ghi_chu). Luon co ket qua: loi mang -> dung quy tac offline."""
    cfg = cfg or load_cfg()
    if looks_like_script(text):
        return prepare_text(text), "Đã là kịch bản, giữ nguyên."
    if not cfg.get("backend"):
        return prepare_text(text), "Dùng quy tắc offline."
    parts, out, note = chunks(text), [], "AI online"
    for i, c in enumerate(parts):
        from . import resume
        ck = resume.key("story", cfg.get("backend"), i, c)
        hit = resume.cget(ck)
        if hit:
            log("AI đọc phần %d/%d: dùng kết quả đã lưu." % (i + 1, len(parts)))
            out.append(hit["r"]); continue
        while True:
            log("AI đang đọc phần %d/%d…" % (i + 1, len(parts)))
            try:
                r = clean(call(cfg, c if i == 0 else "(Phần tiếp theo của cùng truyện, giữ nguyên nhân vật; không lặp lại @char đã có)\n\n" + c))
                parse_script(r)
                if not re.search(r"^\s*\S.*:\s*\S", r, re.M):
                    raise ValueError("kết quả không có thoại")
                out.append(r); resume.cput(ck, {"r": r})
                break
            except Exception as e:
                log("AI lỗi (%s)" % str(e)[:120])
                if str(e) == "Đã dừng":
                    raise
                if resume.ask("Gemini/AI đọc truyện phần %d/%d" % (i + 1, len(parts)), e, True, "gemini") == "retry":
                    continue
                log("→ dùng quy tắc offline cho phần này")
                out.append(prepare_text(c)); note = "AI lỗi một phần, đã dự phòng offline"
                break
    if len(out) > 1:   # gop: chi giu @ dau tien o phan dau, bo @title/@era/@lang lap
        merged = [out[0]]
        for r in out[1:]:
            merged.append("\n".join(l for l in r.splitlines() if not re.match(r"\s*@(title|era|lang)\b", l)))
        out = merged
    res = "\n".join(out)
    try:
        parse_script(res)
    except Exception:
        return prepare_text(text), "Kịch bản AI không hợp lệ, dùng quy tắc offline."
    return res, note
