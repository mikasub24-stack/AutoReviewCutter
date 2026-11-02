# -*- coding: utf-8 -*-
"""'AI dao dien canh' cho tab 'Ve ra': AI DOC HIEU truyen, gom cac cau thanh canh THEO Y NGHIA (~6 giay loi doc moi canh,
10 phut ~ 100 canh) va viet mo ta HINH CAN VE cho tung canh. Chay ngam trong job (khong buoc nao tren giao dien, khong hoi gi):
AI loi / khong co AI -> gom cau theo nghia bang quy tac offline (templates.group_cuts), job van chay binh thuong.

plan(script, cfg, ...) -> dict(script=<kich ban moi dong = 1 cau/doan loi>, lines=[{p, t, sc, cmd}], visuals={sc: mo ta}, ai=<so canh do AI chia>, total=<so canh>)
  - mot CANH co the gom nhieu dong kich ban (vd. loi dan + thoai cua nhan vat): moi dong van mot giong doc, nhung CA CANH CHI VE MOT ANH
    (dong dau ve, cac dong con lai dung chung anh) -> shares(...).
"""
import re, json
from . import templates, llm, vplan, langs

CHUNK_WORDS = 520          # so tu toi da moi lan hoi AI (khoang 2 phut loi doc)
MICRO = 3                  # dong <= 3 tu ("Vang.", "Ua?") khong phai la mot canh

SYS = """You are the storyboard director of a narrated, illustrated video. You receive the narration as numbered sentences (a tag in [brackets] marks a character speaking; no tag = the narrator).
Your job: READ and UNDERSTAND what is being said, group CONSECUTIVE sentences into scenes, and describe the one picture to draw for each scene.

SCENES
- Every sentence belongs to exactly one scene. Scenes follow the original order, without gaps or overlaps.
- One scene = one idea / moment / place / action. Start a new scene when the topic, place, time, characters or the point being made changes. Never cut in the middle of one thought.
- Target length: about {T} words of narration per scene (about 6 seconds when read aloud); between {lo} and {hi} words. Very short sentences ("Yes.", "Ủa?", "Thật kỳ lạ.") never form a scene on their own: attach them to the neighbouring scene they belong to.

VISUAL (one per scene, written in English, 1-2 sentences, at most 45 words)
- Describe ONE concrete picture that shows what the narration is talking about at that moment: who is there (recurring characters by name or role, always with the same look), where, what they are doing, their expression, the key objects.
- If the narration explains an idea, opinion or statistic, draw a concrete situation or a visual metaphor that makes the idea easy to see (people, objects, places), never charts, captions or written words.
- Keep recurring characters and places looking identical from scene to scene. Do not mention drawing style (it is added elsewhere). No text, logos or speech bubbles in the picture.

Return ONLY JSON, no commentary:
{{"cast": "one line with the look of any NEW recurring character (age, hair, clothes), empty if none", "scenes": [{{"from": 1, "to": 3, "visual": "..."}}]}}"""


def _norm(s):
    return re.sub(r"\W+", "", str(s or "").lower())


def _words(units, a, b):
    return sum(langs.wcount(u[2]) for u in units[a:b])


def _offline_ranges(units, T):
    """Canh offline cho mot doan cac cau (units = ("say", prefix, cau, brk, lid)): moi dong goc / moi mach loi dan mot nhom, gom theo nghia trong nhom."""
    out, i, n = [], 0, len(units)
    while i < n:
        j = i + 1
        narr = templates.is_narrator(units[i][1])
        while j < n and units[j][1] == units[i][1] and (narr or units[j][4] == units[i][4]):
            j += 1
        for a, b in templates.group_cuts([(u[2], u[3]) for u in units[i:j]], T):
            out.append((i + a, i + b))
        i = j
    return out


def _fix_ranges(rs, n):
    """Ket qua cua AI -> danh sach (a, b) liền nhau phu kin 0..n (sua cho thieu / chong / lon xon); None neu qua te."""
    ok = []
    for r in rs:
        try:
            a, b = int(r[0]) - 1, int(r[1])
        except (TypeError, ValueError, IndexError):
            continue
        if 0 <= a < b <= n:
            ok.append((a, b, r[2] if len(r) > 2 else ""))
    if not ok or len(rs) - len(ok) > max(1, len(rs) // 3):
        return None
    ok.sort(key=lambda x: (x[0], x[1]))
    out, pos = [], 0
    for a, b, v in ok:
        if b <= pos:
            continue
        a = max(a, pos)
        if a > pos:                        # ke ho: noi dai canh truoc (hoac canh dau) cho khop
            if out:
                out[-1] = (out[-1][0], a, out[-1][2])
            else:
                a = 0
        out.append((a, b, v))
        pos = b
    if pos < n:
        if out:
            out[-1] = (out[-1][0], n, out[-1][2])
        else:
            out.append((0, n, ""))
    return out


def _regroup(rs, units, T):
    """AI chia canh qua vun (trung binh < 0.75 T tu/canh, vd. moi cau mot canh): coi moi canh AI la mot khoi, gom cac khoi ke nhau toi ~T tu,
    chi ngat o ranh gioi AI da chon. Mo ta cua canh gop lay tu khoi dai nhat."""
    if not rs or sum(_words(units, a, b) for a, b, _ in rs) / len(rs) >= 0.75 * T:
        return rs
    blocks = [(_words(units, a, b), 0) for a, b, _ in rs]
    pre = [0]
    for w, _ in blocks:
        pre.append(pre[-1] + w)
    n = len(rs)
    INF = float("inf")
    dp, prv = [INF] * (n + 1), [0] * (n + 1)
    dp[0] = 0.0
    for j in range(1, n + 1):
        for i in range(j - 1, -1, -1):
            W = pre[j] - pre[i]
            if W > 1.6 * T and j - i > 1:
                break
            c = dp[i] + 1.6 * ((W - T) / T) ** 2
            if c < dp[j]:
                dp[j], prv[j] = c, i
    cuts, j = [], n
    while j > 0:
        cuts.append((prv[j], j))
        j = prv[j]
    out = []
    for i, j in reversed(cuts):
        big = max(range(i, j), key=lambda k: _words(units, rs[k][0], rs[k][1]))
        out.append((rs[i][0], rs[j - 1][1], rs[big][2]))
    return out


def _tidy(rs, units, T):
    """Chuan hoa do dai: canh qua dai -> cat theo nghia (giu mo ta), canh qua ngan -> gop vao canh ke ben."""
    rs = _regroup(rs, units, T)
    out = []
    for a, b, v in rs:
        if _words(units, a, b) > 1.9 * T and b - a > 1:
            for x, y in templates.group_cuts([(u[2], u[3]) for u in units[a:b]], T):
                out.append((a + x, a + y, v))
        else:
            out.append((a, b, v))
    k = 0
    while k < len(out):
        a, b, v = out[k]
        if _words(units, a, b) < 0.35 * T and len(out) > 1:
            if k > 0 and _words(units, out[k - 1][0], b) <= 2.2 * T:
                out[k - 1] = (out[k - 1][0], b, out[k - 1][2])
                del out[k]
                continue
            if k + 1 < len(out) and _words(units, a, out[k + 1][1]) <= 2.2 * T:
                out[k + 1] = (a, out[k + 1][1], out[k + 1][2] or v)
                del out[k]
                continue
        k += 1
    return out


def _user_msg(units, cast, last_vis):
    body = []
    for i, u in enumerate(units, 1):
        tag = "" if templates.is_narrator(u[1]) else "[" + re.sub(r"[\s:：]+$", "", u[1]) + "] "
        body.append("%d. %s%s" % (i, tag, u[2]))
    head = ""
    if cast:
        head += "Recurring characters so far (keep their look): " + cast[:700] + "\n"
    if last_vis:
        head += "The previous scene (already drawn) showed: " + last_vis[:240] + "\n"
    return head + "Narration sentences:\n" + "\n".join(body)


def _chunks(units):
    """Chia thanh cac phan <= CHUNK_WORDS tu, uu tien cat o cho xuong dong / doan moi."""
    out, cur, w = [], [], 0
    for u in units:
        uw = langs.wcount(u[2])
        if cur and w + uw > CHUNK_WORDS:
            # lui lai tim cho xuong dong gan nhat (trong 40% cuoi) de khong cat giua mot doan
            cut = None
            for k in range(len(cur) - 1, max(0, int(len(cur) * 0.6)) - 1, -1):
                if cur[k][3] >= 1:
                    cut = k
                    break
            if cut:
                out.append(cur[:cut])
                cur = cur[cut:]
                w = sum(langs.wcount(x[2]) for x in cur)
            else:
                out.append(cur)
                cur, w = [], 0
        cur.append(u)
        w += uw
    if cur:
        out.append(cur)
    return out


def _ask_chunk(units, T, cfg, cast, last_vis, log):
    """Hoi AI ve mot phan. Tra ve (ranges, cast_moi); loi thi nem ngoai le."""
    from . import resume
    n = len(units)
    msg = _user_msg(units, cast, last_vis)
    system = SYS.format(T=T, lo=max(6, int(T * 0.6)), hi=int(T * 1.6))
    ck = resume.key("dplan1", T, msg)
    hit = resume.cget(ck)
    if hit and hit.get("scenes"):
        rs = _fix_ranges([(x.get("from"), x.get("to"), x.get("visual", "")) for x in hit["scenes"] if isinstance(x, dict)], n)
        if rs:
            return rs, str(hit.get("cast") or "")
    raw = vplan._ask(cfg, system, msg)
    d = vplan._json(raw, "{", "}")
    sc = d.get("scenes") if isinstance(d, dict) else None
    if not isinstance(sc, list) or not sc:
        raise ValueError("AI không trả về danh sách cảnh")
    rs = _fix_ranges([(x.get("from"), x.get("to"), str(x.get("visual") or "")) for x in sc if isinstance(x, dict)], n)
    if not rs:
        raise ValueError("AI chia cảnh không hợp lệ")
    resume.cput(ck, {"scenes": sc, "cast": str(d.get("cast") or "")})
    return rs, str(d.get("cast") or "")


def plan(script, cfg=None, log=print, wps=None, speed=1.0, marks=True, ask=True):
    """Doc hieu kich ban (DSL) -> canh. cfg['backend'] = 0 hoac ask=False: chi gom theo nghia offline."""
    cfg = cfg or {}
    items = templates.script_units(script, marks)
    say = [(k, it) for k, it in enumerate(items) if it[0] == "say"]
    use_ai = bool(ask and cfg.get("backend"))
    scenes, cast, last_vis, fails, n_ai = [], "", "", 0, 0
    # cac doan lien nhau giua hai dong lenh
    segs, cur = [], []
    for k, it in enumerate(items):
        if it[0] == "cmd":
            if cur:
                segs.append(cur)
            cur = []
        else:
            cur.append((k, it))
    if cur:
        segs.append(cur)
    total_words = sum(langs.wcount(it[2]) for _, it in say)
    done_words = 0
    for seg in segs:
        units = [it for _, it in seg]
        first_k = [k for k, _ in seg]
        off = 0
        for ch in _chunks(units):
            T = templates.target_words(" ".join(u[2] for u in ch), wps, speed)
            rs, err = None, ""
            if use_ai and fails < 2:
                for attempt in range(2):
                    try:
                        rs, c2 = _ask_chunk(ch, T, cfg, cast, last_vis, log)
                        if c2.strip():
                            cast = (cast + " " + c2.strip())[-900:]
                        break
                    except Exception as e:
                        if str(e) == "Đã dừng":
                            raise
                        rs = None
                        err = str(e)[:100]
                if rs is None:
                    fails += 1
                    log("AI chưa chia được một phần truyện (%s) → phần này gom cảnh theo nghĩa bằng quy tắc." % err)
                    if fails >= 2:
                        log("AI vẫn lỗi → các phần còn lại cũng gom theo nghĩa bằng quy tắc (không dừng việc dựng).")
            ai_here = rs is not None
            if rs is None:
                rs = [(a, b, "") for a, b in _offline_ranges(ch, T)]
            rs = _tidy(rs, ch, T)
            for a, b, v in rs:
                scenes.append(dict(units=ch[a:b], visual=(v or "").strip(), k0=first_k[off + a], ai=ai_here))
                if v:
                    last_vis = v
            if ai_here:
                n_ai += len(rs)
            off += len(ch)
            done_words += sum(langs.wcount(u[2]) for u in ch)
            log("  đã hiểu %d/%d từ → %d cảnh" % (done_words, total_words, len(scenes)))
    # ghep thanh dong kich ban theo thu tu, chen lai cac dong lenh
    lines, visuals, ci, sid = [], {}, 0, 0
    cmds = [(k, it[1]) for k, it in enumerate(items) if it[0] == "cmd"]
    for sc in scenes:
        while ci < len(cmds) and cmds[ci][0] < sc["k0"]:
            lines.append(dict(p="", t=cmds[ci][1], sc=-1, cmd=True))
            ci += 1
        sid += 1
        if sc["visual"]:
            visuals[sid] = sc["visual"]
        run = None
        for u in sc["units"]:
            key = (u[1], None if templates.is_narrator(u[1]) else u[4])
            if run is not None and run["key"] == key:
                run["t"] += " " + u[2]
            else:
                run = dict(key=key, p=u[1], t=u[2], sc=sid, cmd=False)
                lines.append(run)
    while ci < len(cmds):
        lines.append(dict(p="", t=cmds[ci][1], sc=-1, cmd=True))
        ci += 1
    for l in lines:
        l.pop("key", None)
    text = "\n".join((l["p"] + " " + l["t"]) if l["p"] else l["t"] for l in lines)
    return dict(script=text, lines=lines, visuals=visuals, ai=n_ai, total=sid)


def align(sc_lines, plan_lines):
    """Cac dong da duoc parse_script (sc.lines) <-> cac dong cua ke hoach (theo noi dung, theo thu tu). Tra ve list id canh cho tung dong (None = khong khop)."""
    cand = [(q, _norm(l["t"])) for q, l in enumerate(plan_lines) if not l.get("cmd")]
    out, p = [None] * len(sc_lines), 0
    for k, ln in enumerate(sc_lines):
        nt = _norm(getattr(ln, "text", ""))
        if not nt:
            continue
        for j in range(p, min(len(cand), p + 8)):
            q, pt = cand[j]
            if pt == nt or (len(nt) >= 12 and len(pt) >= 12 and (pt.startswith(nt[:30]) or nt.startswith(pt[:30]))):
                out[k] = plan_lines[q]["sc"]
                p = j + 1
                break
    return out


def shares(texts, scene_ids=None, micro=MICRO):
    """{chi so dong: chi so dong chu} cho cac dong KHONG ve rieng: (1) dong thuoc cung canh voi dong chu cua canh do (AI chia), (2) dong qua ngan
    (<= micro tu, vd. 'Vang.') dung chung anh voi dong truoc. Dong dau tien luon tu ve."""
    out, scene_master = {}, {}
    for i, t in enumerate(texts):
        sid = scene_ids[i] if scene_ids else None
        tiny = len(re.findall(r"\w+", str(t or ""))) <= micro
        if i > 0 and tiny:
            out[i] = out.get(i - 1, i - 1)
        elif sid is not None and sid in scene_master:
            out[i] = scene_master[sid]
        elif sid is not None:
            scene_master[sid] = i
    return out


def line_visuals(scene_ids, share, visuals):
    """{chi so dong: mo ta hinh} gan mo ta cua moi canh cho dong dau tien cua canh ma thuc su duoc ve."""
    out, used = {}, set()
    for i, sid in enumerate(scene_ids):
        if i in share or sid is None or sid in used or sid not in visuals:
            continue
        out[i] = visuals[sid]
        used.add(sid)
    return out
