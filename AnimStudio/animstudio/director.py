# -*- coding: utf-8 -*-
"""'Dao dien' tu dong: doc truyen/loi thoai -> hieu ung, thu vat, phuong tien, thoi tiet, am thanh phu hop.
Co 2 phan: (1) nhan biet tu khoa trong tung cau (offline); (2) doi truyen van xuoi thanh kich ban (offline, hoac AI online trong llm.py)."""
import re
from . import langs
from .script import guess_scene, guess_weather, auto_emotion, NARRATORS

EXTRAS = ["wolf", "mammoth", "sabertooth", "deer", "bear", "eagle", "bird", "plane", "tank", "car", "train", "cat", "dog"]
FX = ["rain", "snow", "fog", "thunder", "explosion", "gunfire", "fire", "wind", "dust", "dusk", "night"]
ALL = set(EXTRAS) | set(FX)
ALIAS = {"sấm": "thunder", "sét": "thunder", "nổ": "explosion", "pháo": "explosion", "bom": "explosion", "súng": "gunfire", "mưa": "rain", "tuyết": "snow",
         "sương": "fog", "mù": "fog", "lửa": "fire", "gió": "wind", "bụi": "dust", "sói": "wolf", "voi": "mammoth", "ma mút": "mammoth", "hổ": "sabertooth",
         "hươu": "deer", "nai": "deer", "gấu": "bear", "đại bàng": "eagle", "chim": "bird", "máy bay": "plane", "xe tăng": "tank", "xe": "car",
         "tàu": "train", "mèo": "cat", "chó": "dog", "explode": "explosion", "bomb": "explosion", "shoot": "gunfire", "storm": "thunder", "lightning": "thunder",
         "mammoth": "mammoth", "tiger": "sabertooth"}


def W(words):
    return r"(?<!\w)(?:" + "|".join(words) + r")(?!\w)"


RULES = [  # (ten, regex, chi_ap_dung_cho_thoi_dai hoac None)
    ("explosion", W(["pháo kích", "nổ", "bom", "đạn pháo", "quả pháo", "explosion", "explode[sd]?", "bomb(?:s|ing)?", "shell(?:s|ing)?", "blast", "boom", "incoming"]), None),
    ("gunfire", W(["tiếng súng", "nổ súng", "bắn", "súng máy", "đạn", "gunshots?", "gunfire", "shoot(?:ing)?", "machine gun", "rifles?", "fire at"]), ("war", "modern", "imperial")),
    ("thunder", W(["sấm", "sét", "chớp", "thunder", "lightning", "thunderstorm"]), None),
    ("rain", W(["mưa", "rain(?:ing|y)?", "drizzle"]), None),
    ("snow", W(["tuyết", "snow(?:ing|y)?", "blizzard"]), None),
    ("fog", W(["sương mù", "sương", "fog(?:gy)?", "mist(?:y)?"]), None),
    ("fire", W(["lửa", "cháy", "ngọn lửa", "đống lửa", "đuốc", "fires?", "burning", "flames?", "campfire", "torch(?:es)?", "ember[s]?"]), None),
    ("wind", W(["gió", "bão", "wind(?:y)?", "gale"]), None),
    ("wolf", W(["sói", "bầy sói", "wolf", "wolves", "howl(?:ed|ing)?"]), None),
    ("mammoth", W(["ma mút", "voi ma mút", "mammoths?"]), ("ancient",)),
    ("sabertooth", W(["hổ răng kiếm", "sabre|saber[- ]?tooth(?:ed)?", "sabertooth tiger"]), ("ancient",)),
    ("deer", W(["hươu", "nai", "deer", "stag", "antlers?"]), None),
    ("bear", W(["gấu", "bears?", "grizzly"]), None),
    ("eagle", W(["đại bàng", "chim ưng", "diều hâu", "eagles?", "hawks?"]), None),
    ("bird", W(["chim", "đàn chim", "birds?", "flock", "sparrows?"]), None),
    ("plane", W(["máy bay", "phi cơ", "phi công", "planes?", "bombers?", "aircraft", "airplanes?", "fighters?", "dogfight"]), ("war", "modern")),
    ("tank", W(["xe tăng", "thiết giáp", "tanks?", "armou?red"]), ("war",)),
    ("car", W(["ô tô", "xe hơi", "xe tải", "xe jeep", "xe", "cars?", "trucks?", "jeeps?", "taxi"]), ("war", "modern")),
    ("train", W(["tàu hỏa", "đoàn tàu", "tàu", "trains?", "locomotive"]), ("war", "modern")),
    ("cat", W(["mèo", "cats?", "kittens?"]), ("modern", "war", "imperial")),
    ("dog", W(["chó", "dogs?", "puppy"]), None),
]
RULES = [(n, re.compile(rx, re.I), eras) for n, rx, eras in RULES]


def canon(name):
    n = name.strip().lower()
    n = ALIAS.get(n, n)
    return n if n in ALL else None


def detect_fx(text, era):
    """Tra ve danh sach ten hieu ung / thu / vat the xuat hien trong cau (theo thoi dai)."""
    out = []
    t = text.lower()
    for n, rx, eras in RULES:
        if eras and era not in eras:
            continue
        if rx.search(t):
            out.append(n)
    return out


# ------------------------------------------------------------------ truyen van xuoi -> kich ban
def looks_like_script(text):
    lines = [l.strip() for l in text.replace("\r", "").split("\n") if l.strip() and not l.strip().startswith(("#", "//"))]
    if not lines:
        return True
    n = 0
    for l in lines:
        if l.startswith("@") or l.startswith("[") or re.match(r"^-{3,}", l) or re.match(r"^[^:：\[\(\n]{1,40}?\s*(?:[\(\[][^\)\]]{1,30}[\)\]])?\s*[:：]\s*\S", l):
            n += 1
    return n / len(lines) >= 0.4


SPEECH_VERBS = ["cất tiếng", "lên tiếng", "ra lệnh", "đáp lời", "tuyên bố", "nói", "hỏi", "đáp", "trả lời", "hét", "quát", "thì thầm", "kêu", "gào", "reo", "cười", "thở dài", "lẩm bẩm", "bảo", "la",
                # van phong co / lich su (Tam Quoc...): tau, bam, thua, phan, can, khuyen, than, mang...
                "bẩm", "tâu", "thưa", "phán", "khuyên", "can", "than", "thán", "mắng", "chửi", "thét", "nạt", "rống", "trách", "khấn", "hô", "dặn", "ngâm", "nhủ", "gọi",
                "said", "asked", "replied", "shouted", "whispered", "cried", "yelled", "answered", "murmured", "exclaimed", "called", "muttered", "sighed"]
VERB_EMO = {"mắng": "angry", "chửi": "angry", "thét": "angry", "nạt": "angry", "rống": "angry", "trách": "angry", "than": "sad", "thán": "sad",
            "hét": "angry", "quát": "angry", "gào": "angry", "la": "angry", "shouted": "angry", "yelled": "angry", "thì thầm": "whisper", "whispered": "whisper", "murmured": "whisper",
            "lẩm bẩm": "whisper", "muttered": "whisper", "reo": "happy", "cười": "happy", "cried": "sad", "thở dài": "sad", "sighed": "sad", "exclaimed": "surprised"}
QUOTE_RE = re.compile(r"[“\"«‘]([^”\"»’]{1,600})[”\"»’]")
UP = "A-ZÀÁẢÃẠĂẰẮẲẴẶÂẦẤẨẪẬĐÈÉẺẼẸÊỀẾỂỄỆÌÍỈĨỊÒÓỎÕỌÔỒỐỔỖỘƠỜỚỞỠỢÙÚỦŨỤƯỪỨỬỮỰỲÝỶỸỴ"
NAME_RE = r"((?:[" + UP + r"][\wÀ-ỹ'’-]*)(?:\s+[" + UP + r"][\wÀ-ỹ'’-]*){0,2})"
PRON = {"anh", "cô", "chị", "ông", "bà", "cậu", "he", "she", "they", "nó", "hắn", "ông ấy", "bà ấy", "anh ấy", "cô ấy"}
STOP_CAP = {"Và", "Nhưng", "Rồi", "Khi", "Sau", "Trong", "Một", "The", "And", "But", "Then", "When", "After", "In", "A", "An", "He", "She", "They", "It", "Cả", "Mọi", "Có", "Đó", "Đêm", "Ngày", "Sáng", "Tối"}


# tu viet hoa dau cau KHONG phai ten nguoi ('Phia sau co tieng quat...', 'Lua chay ngut troi, Tao Thao quat...')
_SENT_COMMON = set("""Phía Trên Dưới Bên Giữa Ngoài Trong Cuối Đầu Bỗng Chợt Rồi Từ Ở Tại Vào Lúc Khi Sau Trước Nhưng Còn Thế Hôm Tuần Tháng Năm Ngày Mỗi Đột Thì Mà
Lửa Hỏa Kiếm Đao Thương Cung Tên Ngựa Quân Binh Tướng Thành Trận Khói Gió Mưa Đất Nước Máu Giặc Địch Tiếng Ánh Bóng Mặt Tay Chân Mắt Cờ Trống Giáp Mũi Lưỡi Trướng Doanh Trại
Cổng Tường Thuyền Sông Núi Rừng Đường Cầu Đèn Đuốc Sấm Sét Chớp Bụi Tuyết Sương Mây Trăng Sao Ngọn Đám Đoàn Toán Bọn Lũ Người Hắn Chàng Nàng Ngài Vị Kẻ""".split())
_COMMON = frozenset()          # tu viet hoa dang chu thuong cung co trong truyen (danh tu thuong): dat boi story_to_dsl


def _common_caps(text):
    low = set(re.findall(r"(?<![\wÀ-ỹ])[a-zà-ỹ]+", text))
    caps = set(re.findall(r"(?<![\wÀ-ỹ])[" + UP + r"][a-zà-ỹ]+", text))
    try:
        from .actions import FEM_NAMES
    except Exception:
        FEM_NAMES = set()
    return frozenset(w for w in caps if w.lower() in low and w not in FEM_NAMES)


def _clean_name(name, adjacent):
    """Bo tu dau cau/danh tu thuong o dau ten; ten 1 chu ma khong sat dong tu noi ('Lua chay..., X quat') thi chi nhan neu khong la danh tu thuong."""
    ws = [w for w in name.split()]
    while ws and (ws[0] in STOP_CAP or ws[0] in _SENT_COMMON):
        ws = ws[1:]
    while ws and ws[-1] in STOP_CAP:
        ws = ws[:-1]
    if not ws:
        return None
    if len(ws) == 1 and (ws[0] in _SENT_COMMON or (not adjacent and ws[0] in _COMMON)):
        return None
    return " ".join(ws)


def _speaker_near(outside, last):
    vs = "|".join(sorted(map(re.escape, SPEECH_VERBS), key=len, reverse=True))
    verb = None
    name = None
    tail = re.compile(r"((?:\s+[^“”\"«».!?]{0,45}?)?)\s+(" + vs + r")(?!\w)")
    for nm in re.finditer(NAME_RE, outside):
        t = tail.match(outside, nm.end())
        if not t:
            continue
        adjacent = len(t.group(1).split()) <= 1          # 'Lan noi' / 'Lan khe noi'
        cand = _clean_name(nm.group(1).strip(" ,."), adjacent)
        if cand:
            name, verb = cand, t.group(2)
            break
    if name is None:
        m = re.search(r"(?:" + vs + r")\s+" + NAME_RE, outside)
        if m:
            name = _clean_name(m.group(1), True)
        vm = re.search(r"(" + vs + r")(?!\w)", outside)
        verb = vm.group(1) if vm else None
    return name, verb


MAX_SCENE = 450          # ~30 giay loi doc: truyen dai thi tu chia them canh de nen thay doi theo noi dung



TITLE_RE = re.compile(r"^\s*(?:tiêu đề|tiêu de|tựa đề|tựa|tên video|tên truyện|title|标题|標題|题目|題目|タイトル|제목)\s*[:：]\s*(\S.*?)\s*$", re.I)
MENTION_BEFORE = re.compile(r"(?:câu|cụm từ|cụm|từ|chữ|khẩu hiệu|slogan|mang tên|tên là|có tên|tên|gọi là|gọi|tựa|nhãn|thuật ngữ|kiểu|như|dòng chữ|bài|chương trình|khóa học|cuốn|sách|phim|hashtag|mệnh đề|nhan đề|biệt danh|hai chữ|ba chữ|chữ|từ khóa|danh xưng|phrase|word|term|called|named|titled|slogan)\s*$", re.I)


def strip_title(text):
    """'Tieu de: ...' o dong dau tien la TIEU DE video (khong doc, khong ve). Tra ve (tieu_de, phan_con_lai)."""
    lines = str(text or "").replace("\r", "").split("\n")
    for k, l in enumerate(lines):
        if not l.strip():
            continue
        m = TITLE_RE.match(l)
        if m:
            return m.group(1).strip(), "\n".join(lines[k + 1:]).lstrip("\n")
        break
    return "", str(text or "")


def _is_mention(sent, qm):
    """Cum trong ngoac kep chi la TEN / thuat ngu / cum nhac lai (cau "thay doi tu duy", sach mang ten "..."), khong phai loi nguoi nao noi."""
    before = sent[:qm.start()].rstrip()
    q = qm.group(1).strip()
    if MENTION_BEFORE.search(before.lower()):
        return True
    nw = len(q.split())
    after = sent[qm.end():].strip()
    at_start = not before or before[-1:] in ".!?…:;—-"
    if at_start or before.endswith((",", "，")):
        return False
    tail = re.sub(r"[\W]+$", "", before.lower())
    speech_before = bool(re.search(r"(?:" + "|".join(SPEECH_VERBS) + r")(?:\s+(?:lên|rằng|ra|to|nhỏ|khẽ|lớn|thêm|tiếp|là))?$", tail))
    speech_after = bool(re.match(r"^[,\s]*(?:" + "|".join(SPEECH_VERBS) + r")(?!\w)", after, re.I))
    if speech_before or speech_after:
        return False
    if len(re.findall(r"\w+", after)) >= 2:
        return True                                     # cum nam GIUA cau ke, khong co dong tu noi canh: ten / thuat ngu / cum nhac lai
    return nw <= 3 or (nw >= 2 and bool(re.fullmatch(r"[\W\d]*(?:[" + UP + r"][\w\-’']*\s*){2,}[\W]*", q)) and not re.search(r"[.!?…]$", q))


def _generic_lang(c):
    """Ngon ngu KHONG dung chu Latin (Trung / Nhat / Han / Thai / Nga / Hindi / A Rap / Hy Lap / Do Thai / Bengal...): khong ap quy tac nhan dien nguoi noi cua tieng Viet."""
    return bool(c) and c in langs.POOL and langs.script_class(c) != "latin"


_GENERIC_LANGS = {c for c in langs.ORDER if langs.script_class(c) != "latin"}


def _story_generic(text, title, lang):
    """Truyen van xuoi chu KHONG phai Latin (Trung / Nhat / Han / Thai / Nga / Hindi / Arap): tach cau theo dau cau cua ngon ngu do, tat ca la LOI DAN
    (tool khong doan duoc ten nguoi noi o cac ngon ngu nay; muon nhieu giong thi viet dang 'Ten: thoai'). Chia canh theo so 'tu' (chu Han / Kana: moi chu 1 don vi)."""
    lg = lang if lang in langs.POOL else langs.detect(text)
    lim = max(60, int(langs.wps(lg) * 30))               # ~30 giay loi doc moi canh
    out = ["@title " + title] if title else []
    cur, first = 0, True
    for para in [p.strip() for p in re.split(r"\n\s*\n|\n", text) if p.strip()]:
        sents = langs.split_sentences(para)
        if not sents:
            continue
        pu = langs.wcount(para)
        if first or cur >= lim or (cur >= lim * 0.55 and cur + pu > lim * 1.3):
            out.append("[Cảnh: " + sents[0][:120] + "]")
            cur, first = 0, False
        cur += pu
        buf = ""
        for st in sents:
            if buf and langs.wcount(buf + st) > lim / 4.0:
                out.append("Dẫn: " + buf)
                buf = st
            else:
                buf = (buf + ("" if langs.has_cjk(buf[-1:] + st[:1]) and not (buf[-1:].isspace()) else " ") + st) if buf else st
        if buf:
            out.append("Dẫn: " + buf)
    return "\n".join(out)


def story_to_dsl(text, lang="auto"):
    """Doi doan van ke chuyen (co thoai trong ngoac kep) thanh kich ban dang 'Ten (cam xuc): thoai'. Chi dung quy tac - chat luong vua phai."""
    text = text.replace("\r", "")
    ttl_, text = strip_title(text)
    if langs.has_cjk(text) or _generic_lang(lang) or _generic_lang(langs.detect(text)):
        return _story_generic(text, ttl_, lang)
    blank_sep = bool(re.search(r"\n\s*\n", text))
    # van ban theo dong (khong dau cau): moi dong la mot cau; "Gru het len: Chay di!" -> thoai co ngoac kep
    lines_ = [l.strip() for l in text.split("\n")]
    fixed = []
    for l in lines_:
        if not l:
            fixed.append(l); continue
        m = None if re.search(r"[\"“”«»‘’]", l) else re.match(r"^(.{0,60}?(?:" + "|".join(SPEECH_VERBS) + r")[^:]{0,25}):\s*(.+)$", l)
        if m:
            l = f"{m.group(1)}: “{m.group(2).strip()}”"
        elif not re.search(r"[.!?…”\"]$", l) and len(l.split()) >= 4:
            l += "."
        fixed.append(l)
    text = "\n".join(fixed)
    global _COMMON
    _COMMON = _common_caps(text)
    paras = [p.strip() for p in re.split(r"\n\s*\n|\n", text) if p.strip()]
    out, speakers, last_spk, prev_spk = [], [], None, None
    cur_sig = None
    cur_place = None
    cur_len = 0
    from .chargen import detect_place
    from .script import detect_era
    era_g = detect_era(text)
    title = ""
    if ttl_:
        title = ttl_
        out.append(f"@title {title}")
    elif blank_sep and paras and len(paras[0]) < 70 and not re.search(r"[.!?…”\"]$", paras[0]):
        title = paras.pop(0)
        out.append(f"@title {title}")
    # tach doan thanh cac khoi: doan khong thoai -> tung cau; doan co thoai -> cat tai cho doi dia diem
    exp = []
    for p in paras:
        sents = [x for x in re.split(r"(?<=[.!?…”\"])\s+(?=[" + UP + r"“\"])", p) if x.strip()]
        if not QUOTE_RE.search(p):
            exp.extend(sents); continue
        chunk, cp = [], None
        for st in sents:
            pl = detect_place(era_g, st)
            if chunk and pl and cp and pl[0] != cp[0]:
                exp.append(" ".join(chunk)); chunk, cp = [], None
            chunk.append(st); cp = pl or cp
        if chunk:
            exp.append(" ".join(chunk))
    paras = exp
    for pi, para in enumerate(paras):
        th, night, rain = guess_scene(para)
        sig = (th, night, rain)
        has_loc = th != "room" or re.search(r"(?<!\w)(phòng|nhà|room|house|home)(?!\w)", para.lower())
        tmark = re.search(r"(sáng hôm sau|đêm đó|tối hôm đó|hôm sau|next morning|that night|the next day|meanwhile|ngày hôm sau|một tuần sau)", para.lower())
        has_q = bool(QUOTE_RE.search(para))
        place = detect_place(era_g, para)
        moved = bool(place and cur_place and place[0] != cur_place[0])
        # canh chi doi khi that su doi dia diem / nhay thoi gian VA canh hien tai da du dai (>= ~8 giay loi doc); cac cau ngan gop chung 1 canh
        if cur_sig is None or ((moved or tmark) and cur_len >= 120) or cur_len >= MAX_SCENE:
            cur_len = 0
            first = re.split(r"(?<=[.!?…])\s", para)[0]
            out.append(f"[Cảnh: {first[:120]}]")
            cur_sig = sig
            cur_place = place or cur_place
        if place and not cur_place:
            cur_place = place
        cur_len += len(para)
        first_sent = True
        para_start = True
        for sent in re.split(r"(?<=[.!?…])\s+(?=[" + UP + r"“\"«])", para):
            pos, narr = 0, []
            quotes = [q_ for q_ in QUOTE_RE.finditer(sent) if not _is_mention(sent, q_)]
            if not quotes:
                narr.append(sent)
            else:
                for qi, qm in enumerate(quotes):
                    before = sent[pos:qm.start()]
                    after = sent[qm.end():quotes[qi + 1].start()] if qi + 1 < len(quotes) else sent[qm.end():]
                    name, verb = _speaker_near(before + " " + after, last_spk)
                    if name is None or name.lower() in PRON:
                        if name is None and not (first_sent and qi == 0 and pi >= 0 and out and out[-1].startswith("Dẫn")) and not (first_sent and qi == 0 and para_start):
                            name = last_spk                               # cau thoai noi tiep cua cung nguoi
                        else:
                            name = prev_spk if prev_spk and prev_spk != last_spk else last_spk
                    if name is None:
                        name = f"Nhân vật {len(speakers) + 1}"
                    if name not in speakers:
                        speakers.append(name)
                    prev_spk, last_spk = last_spk, name
                    desc = (before + " " + after).strip(" ,.:;—-")
                    if len(desc) > 6 and not re.search(r"^[\W]*(" + "|".join(SPEECH_VERBS) + r")", desc):
                        narr_txt = re.sub(NAME_RE + r"\s+(?:\w+\s+)?(?:" + "|".join(SPEECH_VERBS) + r")[^,.]*[,.:]?", "", desc).strip(" ,.:;")
                    emo = VERB_EMO.get(verb or "", None) or auto_emotion(qm.group(1))
                    out.append(f"{name} ({emo}): {qm.group(1).strip()}")
                    pos = qm.end()
                rest = sent[pos:].strip()
                if len(rest) > 25:
                    narr.append(rest)
                pre = sent[:quotes[0].start()].strip()
                if len(pre) > 30 and not _speaker_near(pre, None)[0]:
                    narr.insert(0, pre)
            first_sent = False
            para_start = False
            for n_ in narr:
                n_ = n_.strip()
                if n_:
                    out.append(f"Dẫn: {n_}")
    # gop cac cau dan lien tiep cho ngan
    merged = []
    for l in out:
        if l.startswith("Dẫn:") and merged and merged[-1].startswith("Dẫn:") and len(merged[-1]) + len(l) < 200:
            merged[-1] += " " + l[4:].strip()
        else:
            merged.append(l)
    return "\n".join(merged)


def prepare_text(text, lang="auto"):
    """Neu da la kich ban thi giu nguyen; neu la truyen van xuoi thi doi bang quy tac (offline).
    Dong 'Nhan vat: Tao Thao, Luu Bi' (khai bao nhan vat) duoc tach ra truoc va dua vao dau kich ban duoi dang '@char' (khong bi doc len)."""
    from .script import take_cast
    decl, rest = take_cast(text)
    out = _prepare_text(rest if decl else text, lang)
    if not decl:
        return out
    head = "\n".join("@char " + n + ((": " + a) if a else "") for n, a in decl)
    m = re.match(r"^(@title[^\n]*\n)", out)
    return (m.group(1) + head + "\n" + out[m.end():]) if m else head + "\n" + out


def _prepare_text(text, lang="auto"):
    if not looks_like_script(text):
        return story_to_dsl(text, lang)
    ttl_, text = strip_title(text)
    vs = "|".join(SPEECH_VERBS)

    def unq(t):
        t = t.strip()
        return t[1:-1].strip() if len(t) > 2 and t[0] in "“\"«" and t[-1] in "”\"»" and not re.search("[“”\"«»]", t[1:-1]) else t

    def fix(l):
        m = re.match(r"^\s*" + NAME_RE + r"\s+(" + vs + r")(?!\w)[^:()]{0,25}:\s*(.+)$", l)
        if m and "(" not in l.split(":")[0]:
            emo = VERB_EMO.get(m.group(2), None) or auto_emotion(m.group(3))
            return f"{m.group(1)} ({emo}): {unq(m.group(3))}"
        # van ke + loi thoai trong ngoac kep tren MOT dong: 'Tao Thao ngoi trong truong, nhin ban do roi hoi: "..."' -> loi dan + 'Tao Thao (cam xuc): ...'
        m = re.match(r"^\s*" + NAME_RE + r"\s+([^:“\"«»]{1,80}?(?<![\wÀ-ỹ])(" + vs + r")(?!\w)[^:()“\"«»]{0,25}):\s*[“\"«](.+?)[”\"»]\s*$", l)
        if m and "(" not in l.split(":")[0]:
            nm_ = _clean_name(m.group(1).strip(" ,."), len(m.group(2).split()) <= 3)
            if nm_:
                pre = re.sub(r"[,;]?\s*(?:rồi|và|bèn|liền|sau đó)?\s*(?:" + vs + r")(?!\w)[^,.:]*$", "", m.group(1) + " " + m.group(2)).strip(" ,;")
                emo = VERB_EMO.get(m.group(3), None) or auto_emotion(m.group(4))
                dq = f"Dẫn: {pre}.\n" if len(pre.split()) >= 4 else ""
                return f"{dq}{nm_} ({emo}): {m.group(4).strip()}"
        return l
    lines = [fix(l) for l in text.split("\n")]
    # kich ban dai khong co [Canh:] -> tu chia canh theo do dai (moi canh ~MAX_SCENE ky tu), canh lay noi dung cua chinh cac dong do
    body = [l for l in lines if l.strip() and not l.strip().startswith(("@", "["))]
    MAX_SCENE = 130 if langs.is_cjk_text(text) else globals()["MAX_SCENE"]          # chu Han / Nhat / Han: ~130 chu = 30 giay loi doc
    if not any(l.strip().startswith("[") for l in lines) and sum(len(l) for l in body) > MAX_SCENE * 1.4:
        out, acc = [], 0
        for l in lines:
            if l.strip() and not l.strip().startswith(("@", "[")):
                if acc == 0 or acc >= MAX_SCENE:
                    txt = re.sub(r"^[^:]{1,40}:\s*", "", l).strip()
                    out.append(f"[Cảnh: {txt[:120]}]"); acc = 0
                acc += len(l)
            out.append(l)
        return ("@title " + ttl_ + "\n" if ttl_ else "") + "\n".join(out)
    return ("@title " + ttl_ + "\n" if ttl_ else "") + "\n".join(lines)
