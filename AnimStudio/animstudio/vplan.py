# -*- coding: utf-8 -*-
"""'Dao dien hinh anh' bang AI (Gemini / Claude / OpenAI / Pollinations).
Buoc 1: doc CA truyen -> danh sach nhan vat (gom ca ban nho/lon cua cung mot nguoi).
Buoc 2: doc TUNG CAU -> tach thanh 1..n nhip (cau dai co the nhieu canh), moi nhip: noi chon cu the, ai co mat, ai lam gi voi vat gi, hinh chen.
Moi mo ta duoc viet bang NGON NGU CUA KICH BAN (Viet -> Viet, Anh -> Anh) de Flow ve dung chu/ngu canh."""
import json, re
from . import llm, langs
from .script import SceneDef, Character, Line, guess_scene, guess_weather, guess_look

LANGNAME = dict(langs.NAME_EN)          # ten ngon ngu bang tieng Anh gui cho AI (vi, en, zh, ja, ko... xem langs.py)

CAST_SYS = """You are the casting director of a 2D cartoon built from a story. Read the whole story and list EVERY on-screen character that is needed to show it faithfully.
Rules: a first-person narrator ('mình', 'tôi', 'I') becomes a character (name him/her by the narrator's name, or 'Mình'/'Tôi'/'Narrator'). Groups ('hai đứa', 'bạn bè', 'đồng nghiệp') become individual characters (at least the ones that matter). If the same person appears at different ages (child -> adult), create SEPARATE entries, e.g. 'Mình (nhỏ)' and 'Mình (lớn)', and set same_as of the later one to the first one's name. Names are short (max 20 chars).
Write the 'look' in {L}: a concrete visual description (age, hair, outfit, accessories, personality cue). Return ONLY valid JSON:
{"characters":[{"name":"...","gender":"m|f","age":"child|teen|adult|old","look":"...","same_as":""}]}"""

BEAT_SYS = """You are the visual director of a 2D cartoon. You receive numbered lines of a story and the cast list. For EVERY line decide what must be DRAWN so that the picture matches exactly what is being said while that line is read aloud.
Pace like a fast YouTube cartoon: the picture changes every 3-5 seconds of speech. Split every line into BEATS of roughly {BW} words (about {BS} seconds) in reading order, at natural clause breaks; a short sentence stays 1 beat. Vary the framing from beat to beat (wide establishing shot of the place, medium, face close-up for emotion/dialogue, 'insert' full-screen close-up of an object/screen/list/document/product/phone message, 'pov' first-person view, hands holding an item). Use 'insert' whenever the words mention a phone/message/form/list/photo/item/money. 'text' of the beats must be exact consecutive pieces of the original line, together covering all of it.
Return ONLY a JSON array, one object per line:
{"i": line number, "beats":[{
 "text": "exact piece of the line",
 "new_scene": true if place or time differs from the previous beat (or very first beat),
 "setting": "VERY specific description (in {L}) of the background for this moment: exact place, furniture/objects/landmarks, time of day, weather, mood. Never generic ('a room', 'a street'). Repeat the same setting text while the place stays the same.",
 "place": "short name of the place in {L}",
 "indoor": true/false,
 "present": ["names of the cast members visible in this beat (use cast names exactly)"],
 "actor": "cast name of the person doing the visible action ('' if none)",
 "action": "(in {L}) the pose/action drawn for the actor INCLUDING prop and facial expression, e.g. cầm điện thoại bằng hai tay, ngón cái lướt màn hình, mặt buồn. '' if none",
 "shot": "wide|medium|close-up|insert|pov (camera framing that best shows this beat)",
 "move": "none|walk|run",
 "motion": "(ALWAYS in English, 1-2 short sentences) the exact physical movement that should animate in this still picture WHILE these words are spoken, matching their meaning and emotion: who does what with which body part (e.g. 'the man slowly lifts his phone and scrolls with his thumb, his shoulders slump', 'both women laugh and clap, hair bouncing', 'rain falls, he walks forward'). For insert shots describe the screen/object motion (e.g. 'new message bubbles pop up one by one, screen glows').",
 "insert": "(in {L}) a close-up picture to show when the beat is about a specific screen/object (phone screen with a Facebook Messenger chat with Vietnamese messages, contact list, old photo, letter, cake, bill...). '' if none"}]}
Output valid JSON only."""


def _ask(cfg, system, user, json_mode=False):
    b = cfg.get("backend", 0)
    if b == 1:
        return llm._chat_pollinations(system, user, cfg.get("model") or "openai")
    if b == 2:
        return llm._chat_claude(cfg.get("key", ""), cfg.get("model", ""), system, user)
    if b == 3:
        return llm._chat_openai(cfg.get("url", ""), cfg.get("key", ""), cfg.get("model", ""), system, user)
    if b == 4:
        return llm._chat_gemini(cfg.get("key", ""), cfg.get("model", ""), system, user, json_mode=True)
    if b == 5:
        from . import flowgen
        return flowgen.gemini_ask(system, user, cfg.get("browser", 0))
    raise RuntimeError("no backend")


def _json(s, open_ch="[", close_ch="]"):
    s = llm.clean(s)
    a, b = s.find(open_ch), s.rfind(close_ch)
    if a < 0 or b < a:
        raise ValueError("không có JSON")
    return json.loads(s[a:b + 1])


def _adopt_old(cfg, script, cast, lines):
    """Neu truoc do da co ke hoach DAY DU (do ban cu luu) thi dung lai nguyen ve de cac khung da ve (cung prompt) khop va khong phai ve lai.
    Uu tien ban cu nhat day du: 'plan' (truoc khi co chuyen dong) roi 'plan2'."""
    from . import resume
    if cfg.get("beat", "fine") != "fine":
        return
    chunks = []
    for st in range(0, len(lines), 18):
        part = lines[st:st + 18]
        body = "\n".join("%d. %s%s" % (i, ("[" + l.speaker + "] ") if l.speaker else "", l.text) for i, l in part)
        usr = "Era: %s\nCast:\n%s\nStory lines:\n%s" % (script.era, cast, body)
        chunks.append((usr, resume.key("plan2", cfg.get("backend"), cfg.get("beat", "fine"), usr)))
    for fam in ("plan", "plan2"):
        olds = [resume.cget(resume.key(fam, cfg.get("backend"), u)) for u, _ in chunks]
        if chunks and all(olds):
            for (u, ck), o in zip(chunks, olds):
                resume.cput(ck, o)
            return


def _legacy(cfg, usr, ck):
    """Ban truoc chua co tuy chon 'beat' (tuong duong 'fine'): neu co ket qua cu thi dung lai de khong phai hoi Gemini va ve lai khung."""
    from . import resume
    if cfg.get("beat", "fine") == "fine" and resume.cget(ck) is None:
        old = resume.cget(resume.key("plan2", cfg.get("backend"), usr))
        if old:
            resume.cput(ck, old)


def _beat_sys(cfg, L):
    bw, bs = {"fast": ("18-28", "6-9"), "mid": ("12-20", "4-7")}.get(cfg.get("beat", "fine"), ("8-14", "3-5"))
    return BEAT_SYS.replace("{L}", L).replace("{BW}", bw).replace("{BS}", bs).replace("the picture changes every 3-5 seconds of speech", "the picture changes every %s seconds of speech" % bs)


def get_cast(script, cfg, log, ask, cache_only=False):
    L = LANGNAME.get(script.lang, "Vietnamese")
    story = "\n".join(l.text for l in script.lines)[:14000]
    from . import resume
    ck = resume.key("cast", cfg.get("backend"), script.era, story)
    hit = resume.cget(ck)
    if hit:
        log("AI chọn nhân vật: dùng kết quả đã lưu.")
        return hit
    if cache_only:
        return []
    while True:
        log("AI đang chọn nhân vật cho truyện…")
        err = ""
        for attempt in range(2):
            try:
                r = ask(cfg, CAST_SYS.replace("{L}", L), "Era: %s\nStory:\n%s" % (script.era, story))
                d = _json(r, "{", "}")
                out = [c for c in d.get("characters", []) if isinstance(c, dict) and c.get("name")]
                if out:
                    resume.cput(ck, out)
                    return out
                err = "AI không trả về nhân vật"
            except Exception as e:
                err = str(e)[:140]
                log("  AI chọn nhân vật lỗi: " + err)
                if err == "Đã dừng":
                    raise
        if resume.ask("Gemini/AI chọn nhân vật", err, True, "gemini") != "retry":
            return []


def get_plan(script, cfg, log, ask):
    L = LANGNAME.get(script.lang, "Vietnamese")
    cast = "\n".join("- %s (%s, %s): %s" % (n, c.gender, c.age, c.attrs[:120]) for n, c in script.chars.items())
    plan, err = {}, ""
    lines = list(enumerate(script.lines))
    from . import resume
    _adopt_old(cfg, script, cast, lines)
    # ---- chay song song nhieu tab Gemini (neu bat) cho cac nhom chua co trong cache
    ntab = int(cfg.get("tabs", 1) or 1)
    if cfg.get("backend") == 5 and ntab > 1:
        pend = []
        for st in range(0, len(lines), 18):
            part = lines[st:st + 18]
            body = "\n".join("%d. %s%s" % (i, ("[" + l.speaker + "] ") if l.speaker else "", l.text) for i, l in part)
            usr = "Era: %s\nCast:\n%s\nStory lines:\n%s" % (script.era, cast, body)
            ck = resume.key("plan2", cfg.get("backend"), cfg.get("beat", "fine"), usr)
            if resume.cget(ck) is None:
                pend.append((part, usr, ck))
        if pend:
            from . import flowgen
            log("AI đạo diễn: gửi %d nhóm câu qua %d tab Gemini cùng lúc…" % (len(pend), min(ntab, len(pend))))
            try:
                res = flowgen.gemini_ask_multi(_beat_sys(cfg, L), [p[1] for p in pend], cfg.get("browser", 0), ntab, log)
            except Exception as e:
                if str(e) == "Đã dừng":
                    raise
                log("  gửi song song lỗi: %s → làm tuần tự" % str(e)[:100])
                res = []
            for (part, usr, ck), r in zip(pend, res):
                try:
                    if isinstance(r, Exception):
                        raise r
                    got = [o for o in _json(r) if isinstance(o, dict) and isinstance(o.get("i"), int)]
                    if not got:
                        raise ValueError("AI không trả về kế hoạch")
                    resume.cput(ck, got)
                except Exception as e:
                    log("  nhóm câu %d–%d lỗi: %s (sẽ thử lại riêng)" % (part[0][0] + 1, part[-1][0] + 1, str(e)[:100]))
    for st in range(0, len(lines), 18):
        part = lines[st:st + 18]
        body = "\n".join("%d. %s%s" % (i, ("[" + l.speaker + "] ") if l.speaker else "", l.text) for i, l in part)
        from . import resume
        usr = "Era: %s\nCast:\n%s\nStory lines:\n%s" % (script.era, cast, body)
        ck = resume.key("plan2", cfg.get("backend"), cfg.get("beat", "fine"), usr)
        hit = resume.cget(ck)
        if hit:
            log("AI đạo diễn câu %d–%d: dùng kết quả đã lưu." % (part[0][0] + 1, part[-1][0] + 1))
            for o in hit:
                plan[o["i"]] = o
            continue
        done = False
        while not done:
            log("AI đạo diễn hình ảnh: câu %d–%d/%d…" % (part[0][0] + 1, part[-1][0] + 1, len(lines)))
            for attempt in range(2):
                try:
                    r = ask(cfg, _beat_sys(cfg, L), usr)
                    got = [o for o in _json(r) if isinstance(o, dict) and isinstance(o.get("i"), int)]
                    if not got:
                        raise ValueError("AI không trả về kế hoạch")
                    for o in got:
                        plan[o["i"]] = o
                    resume.cput(ck, got)
                    done = True
                    break
                except Exception as e:
                    err = str(e)[:140]
                    log("  AI đạo diễn lỗi: " + err)
                    if err == "Đã dừng":
                        raise
            if not done and resume.ask("Gemini/AI đạo diễn câu %d–%d" % (part[0][0] + 1, part[-1][0] + 1), err, True, "gemini") != "retry":
                log("  → dùng nhận diện offline cho các câu này")
                break
    return plan


def _norm(s):
    return re.sub(r"\s+", " ", s or "").strip()


def _split_ok(orig, beats):
    if len(beats) < 2:
        return False
    o = _norm(orig)
    pos, tot = 0, 0
    for b in beats:
        t = _norm(b.get("text"))
        if len(t) < 3:
            return False
        k = o.find(t[:14], max(0, pos - 2))
        if k < 0:
            return False
        pos = k + len(t); tot += len(t)
    return 0.85 <= tot / max(len(o), 1) <= 1.15


def apply(script, cfg, log=print, ask=None):
    """Ap dung ke hoach AI: nhan vat, chia nhip/canh, nen cu the, hanh dong, hinh chen. Tra ve so cau AI hieu."""
    from . import actions
    ask = ask or (lambda c, s, u: _ask(c, s, u))
    lang = script.lang if script.lang in LANGNAME else "vi"
    # ---- nhan vat
    cast = get_cast(script, cfg, log, ask, cache_only=bool(cfg.get("skip_cast")))
    if cfg.get("skip_cast") and not cast:
        log("Chế độ khung 16:9: bỏ bước AI chọn nhân vật (Flow vẽ trọn từng khung), dùng nhân vật nhận diện từ truyện.")
    if cast:
        names = [str(c["name"]).strip()[:24] for c in cast]
        for s in {l.speaker for l in script.lines if l.speaker}:
            if s in names:
                continue
            cand = [c for c in cast if str(c["name"]).strip().lower().startswith(s.lower())]
            if cand:                                           # 'Lan' trong thoai = ban 'Lan (lon)' do AI chon
                pick = next((c for c in cand if c.get("age") not in ("child",)), cand[0])
                tgt = str(pick["name"]).strip()[:24]
                for l in script.lines:
                    if l.speaker == s:
                        l.speaker = tgt
        speakers = {l.speaker for l in script.lines if l.speaker}
        keep = {n: c for n, c in script.chars.items() if n in speakers}
        script.chars = keep
        for c in cast:
            n = str(c["name"]).strip()[:24]
            if n in script.chars:
                script.chars[n].attrs = script.chars[n].attrs or str(c.get("look", ""))
                continue
            age = {"teen": "adult"}.get(c.get("age"), c.get("age"))
            age = age if age in ("child", "adult", "old") else "adult"
            g = c.get("gender") if c.get("gender") in ("m", "f") else (guess_look(n)[0] or "m")
            look = str(c.get("look", ""))
            if c.get("age") == "teen":
                look = ("teenager, " if lang == "en" else "thiếu niên, ") + look
            script.chars[n] = Character(n, g, age, look_seed=n, attrs=look or n, same_as=str(c.get("same_as") or ""))
        log("Nhân vật AI chọn: " + ", ".join(script.chars))
    plan = get_plan(script, cfg, log, ask)
    if not plan:
        return 0
    old_scenes = script.scenes
    scenes, lines = [], []
    prev_orig, prev_present, understood = None, [], 0
    for i, ln in enumerate(script.lines):
        p = plan.get(i)
        beats = []
        if p:
            understood += 1
            beats = [b for b in (p.get("beats") or []) if isinstance(b, dict)]
            if not beats and (p.get("setting") or p.get("action")):
                beats = [p]                                      # AI tra theo dang phang
        if len(beats) > 1 and not _split_ok(ln.text, beats):
            beats = beats[:1]
        if not beats:
            beats = [{}]
            keep_acts = list(getattr(ln, "acts", []) or [])
        else:
            keep_acts = []
        for bi, b in enumerate(beats):
            text = _norm(b.get("text")) if (len(beats) > 1 and b.get("text")) else ln.text
            orig = ln.scene
            o = old_scenes[orig] if orig < len(old_scenes) else None
            new = not scenes or (orig != prev_orig and bi == 0) or bool(b.get("new_scene"))
            if new:
                st = (b.get("setting") or "").strip()
                desc = (st + " — " + text) if st else text
                th, night, rain = guess_scene(desc)
                snow, fog, dusk = guess_weather(desc)
                sd = SceneDef(desc, th, night, rain, [], snow, fog, dusk, list(o.fx) if (o and orig != prev_orig and bi == 0) else [])
                sd.place_t = ((b.get("place") or "cảnh")[:40], st, 1 if b.get("indoor") else 0) if st else (scenes[-1].place_t if scenes else None)
                scenes.append(sd)
            prev_orig = orig
            sd = scenes[-1]
            present = [n for n in (b.get("present") or []) if n in script.chars]
            actor = (b.get("actor") or "").strip()
            if actor and actor not in script.chars:
                g = guess_look(actor)[0] or "m"
                script.chars[actor] = Character(actor, g, "adult", look_seed=actor, attrs=actor)
            if actor and actor in script.chars and actor not in present:
                present.append(actor)
            if ln.speaker and ln.speaker in script.chars and ln.speaker not in present:
                present.append(ln.speaker)
            for n in present:
                if n not in sd.cast:
                    sd.cast.append(n)
            nl = Line(ln.speaker, text, ln.emotion, len(scenes) - 1, list(ln.fx) if bi == 0 else [])
            nl.acts = list(keep_acts)
            nl.present = list(present)
            nl.shot = str(b.get("shot") or "")[:20]
            nl.motion = str(b.get("motion") or "")[:300]
            nl.ins = getattr(ln, "ins", None) if not p else None
            act = (b.get("action") or "").strip()
            mv = (b.get("move") or "none").strip().lower()
            if actor and actor in script.chars:
                if act:
                    key = "ai:%08d" % (sum(map(ord, act)) * 7919 % 10 ** 8)
                    actions.KEYS[key] = (act, actions.prop_from_text(act))
                    nl.acts = [(0.0, 1.0, actor, key)]
                elif mv in ("walk", "run"):
                    nl.acts = [(0.0, 1.0, actor, mv)]
            ins = (b.get("insert") or "").strip()
            if ins:
                nl.ins = ins
            lines.append(nl)
    for sd in scenes:
        if not sd.cast:
            sd.cast = list(scenes[scenes.index(sd) - 1].cast) if scenes.index(sd) else list(script.chars)[:2]
    script.scenes, script.lines = scenes, lines
    return understood
