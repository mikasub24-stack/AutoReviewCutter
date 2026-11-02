# -*- coding: utf-8 -*-
"""Hanh dong + dao cu theo loi ke, va nhan vat phu tu van ban.

plan(script)   : gan cho moi Line danh sach (f0, f1, nguoi_lam, khoa_hanh_dong) theo tung menh de.
extras(script) : them nhan vat phu (me, co giao, sep, khach...) co nhac trong truyen va dua vao canh co nhac.
act_key(P, ten, t): hanh dong dang dien ra cua nhan vat tai thoi diem t.
"""
import re
from . import langs
from PIL import Image, ImageDraw

# khoa -> (tu khoa, mo ta tieng Anh cho Flow (None = chi chuyen dong, khong can ve), dao cu)
ACTIONS = [
    ("phone_call", ["gọi điện", "gọi cho", "alo", "a lô", "nghe máy", "bốc máy", "nhấc máy", "áp điện thoại", "phone call", "calls ", "called ", "answers the phone", "on the phone"],
     "holding a smartphone against the ear with one hand, talking on the phone, other arm relaxed", "phone_ear"),
    ("phone_look", ["điện thoại", "nhắn tin", "lướt", "màn hình", "smartphone", "texting", "scrolls", "his phone", "her phone", "the phone", "tin nhắn"],
     "holding a smartphone in both hands in front of the chest, looking down at the screen", "phone"),
    ("laptop", ["laptop", "máy tính", "gõ phím", "bàn phím", "typing", "computer", "code"],
     "standing and typing on an open laptop held in the arms", "laptop"),
    ("drink", ["uống", "cà phê", "trà ", "ly nước", "cốc", "coffee", "drinks", "sips", "tea "],
     "holding a cup with both hands raised to the mouth, drinking", "cup"),
    ("eat", ["ăn ", "bữa cơm", "bữa ăn", "nhai", "húp", "eats", "eating", "meal"],
     "holding a bowl in one hand and chopsticks in the other, eating", "bowl"),
    ("write", ["viết", "ghi chép", "ký tên", "ký vào", "ghi lại", "writes", "writing", "signs"],
     "holding a notebook in one hand and writing with a pen in the other", "book"),
    ("read", ["đọc sách", "đọc thư", "đọc báo", "đọc tài liệu", "mở sách", "lật", "reads", "reading", "letter"],
     "holding an open book or letter with both hands in front of the chest, reading", "book"),
    ("photo", ["chụp ảnh", "máy ảnh", "quay phim", "camera", "takes a photo"],
     "holding a camera up to the eye, taking a photo", "camera"),
    ("umbrella", ["che ô", "cầm ô", "giương ô", "chiếc ô", "cây dù", "umbrella"],
     "holding an open umbrella over the head with one hand", "umbrella"),
    ("bag", ["xách", "túi", "balo", "ba lô", "vali", "bag", "suitcase", "backpack"],
     "holding a bag in one hand, walking pose", "bag"),
    ("shoot", ["nổ súng", "bắn", "nhắm súng", "giương súng", "chĩa súng", "shoots", "fires", "aims", "opens fire"],
     "aiming a rifle forward with both hands, shooting stance", "rifle"),
    ("salute", ["chào kiểu quân đội", "kính chào", "chào cờ", "salute"],
     "standing straight and saluting with the right hand at the forehead", None),
    ("hide", ["nấp", "cúi thấp", "ẩn nấp", "núp", "trốn sau", "ducks", "takes cover", "crouch"],
     "crouching low behind cover, hands covering the head", None),
    ("walk", ["đi bộ", "bước đi", "đi về", "đi tới", "bước vào", "walks", "walked"], None, None),
    ("run", ["chạy", "lao tới", "lao đi", "phóng đi", "vụt", "runs", "ran ", "rushes", "sprints"], None, None),
    ("point", ["chỉ tay", "chỉ vào", "chỉ về", "points", "pointing"],
     "pointing forward with the arm fully extended and one finger", None),
    ("wave", ["vẫy", "vẫy tay", "vẫy chào", "waves", "waving"],
     "waving one hand high in the air, smiling", None),
    ("hug", ["ôm chầm", "ôm lấy", "ôm chặt", "hugs", "embraces"],
     "arms wrapped around in a tight hug, eyes closed", None),
    ("knock", ["gõ cửa", "bấm chuông", "knocks"],
     "raising one fist to knock on a door", None),
    ("throw", ["ném", "quăng", "throws", "hurls"],
     "throwing a stone with a raised arm in mid-throw", "stone"),
    ("spear", ["giáo", "săn", "phóng lao", "spear", "hunts"],
     "gripping a long wooden spear raised in both hands, hunting stance", "spear"),
    ("fire", ["nhóm lửa", "đốt lửa", "đống lửa", "campfire", "lights a fire"],
     "kneeling and tending a small campfire", "fire"),
    ("carry", ["vác", "khiêng", "cõng", "bế ", "carries", "carrying"],
     "carrying a heavy load on the shoulder with both hands", None),
    ("cook", ["nấu", "xào", "chiên", "bếp", "cooks", "cooking"],
     "holding a frying pan in one hand and a spatula in the other, cooking", "pan"),
    ("radio", ["bộ đàm", "vô tuyến", "máy bộ đàm", "radio"],
     "holding a radio handset against the ear, speaking into it", "phone_ear"),
    ("bandage", ["băng bó", "sơ cứu", "bandages", "first aid"],
     "bending forward with a roll of bandage in both hands, treating a wound", None),
    ("bow", ["cúi chào", "cúi đầu", "cúi người", "bows"],
     "bowing politely with the upper body bent forward", None),
    ("shake_hand", ["bắt tay", "shakes hands"],
     "extending one hand forward for a handshake, smiling", None),
    ("clap", ["vỗ tay", "claps", "applaud"],
     "clapping hands together in front of the chest, joyful", None),
    ("hold_head", ["ôm đầu", "ôm mặt", "bịt tai", "holds his head", "covers"],
     "both hands holding the head in shock or panic", None),
]
KEYS = {k: (en, prop) for k, _, en, prop in ACTIONS}
SELF_ONLY = {"phone_call", "radio", "wave", "point"}      # trong loi thoai, nguoi noi lam hanh dong nay
MOTION_ONLY = {"run"}

PRONOUN_NAMES = {"anh", "cô", "chị", "em", "ông", "bà", "bé", "bạn", "chú", "bác", "cậu", "dì", "thím"}


def _name_pos(clause, names):
    low = clause.lower()
    best = None
    for n in names:
        nl = n.lower()
        if nl in PRONOUN_NAMES and len(nl) < 3:
            continue
        for m in re.finditer(r"(?<!\w)" + re.escape(nl) + r"(?!\w)", low):
            if best is None or m.start() < best[0]:
                best = (m.start(), n)
            break
    return best[1] if best else None


def _clauses(text):
    parts = [p.strip() for p in re.split(r"(?<=[\.\!\?;…])\s+|,\s+|\s+(?:rồi|sau đó|và sau đó|then|and then)\s+", text) if p and p.strip()]
    return parts or [text]


_RX = {}


def _rx(k):
    k = k.strip()
    if k not in _RX:
        _RX[k] = re.compile(r"(?<!\w)" + re.escape(k) + r"(?!\w)")
    return _RX[k]


def detect(clause):
    low = clause.lower()
    for key, kws, _, _ in ACTIONS:
        if any(_rx(k).search(low) for k in kws):
            return key
    return None


STOP_NAMES = set("""Sáng Trưa Chiều Tối Đêm Khuya Sau Trước Khi Lúc Rồi Nhưng Và Một Hôm Ngày Năm Cô Anh Chị Ông Bà Mẹ Bố Em Họ Nó Tôi Thế Trong Ở Tại Đến Cả Mọi Có Không Nhà Quán Trường Phòng Hà Sài Huế Đà Việt Mỹ Pháp Nhật Trung Bác Chú Cậu Dì Thím
Mỗi Nhiều Những Các Đó Này Kia Vì Nếu Dù Tuy Còn Cũng Đã Đang Sẽ Vừa Chợt Bỗng Đột Thì Mà Ai Gì Sao Đây Hôm Tuần Tháng Mùa Thứ Lần Rất Quá Thật Hay Hoặc Với Cho Của Bên Giữa Ngoài Trên Dưới Phía Cuối Đầu Lại Vẫn Chỉ Mới Nhìn Nghe
Alo Ơi Ừ Vâng Dạ Ôi Ê Này Nhé Thôi Được Xin Chào Cảm Ừm Hmm Ha Hả Trời Úi Á Ối Hello Hi Oh Wow Hey Okay Ok
The A An He She They It We In On At Then When After Before But And Suddenly Later Meanwhile That This There His Her Their Our If As While One Two Every Some Maybe Finally Once I You Yes No So""".split())
FEM_NAMES = set("Lan Hoa Mai Linh Hương Trang Thảo Ngọc Nga Thu Lệ Hạnh Phượng Yến Nhung Trâm Vy My Quỳnh Thủy Thuỷ Hằng Loan Oanh Huyền Châu Diệp Chi Uyên Anna Mary Emma Lisa Sarah Kate Lucy Anh_f".split())


def gender_of(name, text):
    """Gioi tinh tu ten quen thuoc + dai tu o dau cau ke tiep ('Lan cui dau. Co ...')."""
    if name in FEM_NAMES:
        return "f"
    f = m = 0
    sents = re.split(r"(?<=[\.\!\?…])\s+", text)
    for i, st in enumerate(sents[:-1]):
        if re.match(r"\W*" + re.escape(name) + r"\b", st):
            nx = sents[i + 1].lower().lstrip(" \"“")
            if re.match(r"(cô|chị|bà|she|her)\b", nx):
                f += 1
            elif re.match(r"(anh|ông|chú|cậu|he|his)\b", nx):
                m += 1
    return "f" if f > m else "m"


def fix_genders(script):
    text = " ".join(l.text for l in script.lines if not l.speaker)
    for n, ch in script.chars.items():
        if ch.attrs or n in ("Sếp",) or ch.age != "adult":
            continue
        if re.fullmatch(r"[A-ZÀ-Ỹ][a-zà-ỹ]{1,9}", n):
            ch.gender = gender_of(n, text)


# Danh tu thuong hay dung dau cau trong truyen co / chien tranh (khong bao gio la ten nguoi): "Lua chay ngut troi...", "Kiem quang loe len..."
COMMON_CAP = set("""Lửa Hỏa Kiếm Đao Thương Cung Tên Ngựa Quân Binh Tướng Thành Trận Khói Gió Mưa Đất Nước Máu Giặc Địch Tiếng Ánh Bóng Mặt Tay Chân Mắt Tim
Cờ Trống Tiễn Giáp Mũi Lưỡi Chiến Trướng Doanh Trại Cổng Tường Thuyền Sông Núi Rừng Đường Cầu Đèn Đuốc Sấm Sét Chớp Bụi Tuyết Sương Mây Trăng Sao Mặt Trời Ngọn Đám Đoàn Toán Bọn Lũ
Ba Bốn Năm Sáu Bảy Tám Chín Mười Hai Người Hắn Chàng Nàng Ngài Vị Kẻ Bầu Không Khí Cả""".split())
# tien to / tu bao ten DIA DANH, to chuc, tran danh (khong phai nguoi): 'o Xich Bich', 'tran Xich Bich', 'giac Khan Vang', 'quan Tao Thao'
PLACE_PRE = {"ở", "tại", "đến", "về", "vào", "qua", "từ", "tới", "xuống", "lên", "ra", "trong", "ngoài", "thành", "châu", "quận", "sông", "núi", "đèo", "nước", "quân", "nhà",
             "triều", "đất", "vùng", "miền", "phía", "bên", "đồn", "trại", "trận", "cuộc", "giặc", "phe", "đạo", "bọn", "lũ", "đội", "binh", "thời", "kế", "quê", "cổng", "đô", "phủ", "huyện", "tỉnh", "xứ", "in", "at", "to", "from", "of"}
PLACE_FIRST = {"Đông", "Tây", "Nam", "Bắc", "Giang", "Thành", "Châu", "Quận", "Sơn", "Hà"}
_VNLET = "A-Za-zÀ-ỹĐđ"
_UPC = "A-ZÀÁẢÃẠĂẰẮẲẴẶÂẦẤẨẪẬĐÈÉẺẼẸÊỀẾỂỄỆÌÍỈĨỊÒÓỎÕỌÔỒỐỔỖỘƠỜỚỞỠỢÙÚỦŨỤƯỪỨỬỮỰỲÝỶỸỴ"
_MW_NAME = re.compile(r"(?<![\wÀ-ỹ])([" + _UPC + r"][a-zà-ỹ]{1,9}(?:\s+[" + _UPC + r"][a-zà-ỹ]{1,9}){1,2})(?![\wÀ-ỹ])")
_LEAD_WORDS = ("và", "rồi", "thì", "khi", "lúc", "còn", "nhưng", "and", "then", "when", "while", "bỗng", "chợt", "lúc đó", "bấy giờ", "sau đó", "tuy nhiên")


def _is_common_word(w, text):
    """Tu viet hoa dau cau nhung la danh tu thuong: dang chu thuong cua no cung xuat hien trong truyen ('Lua chay' / 'ngon lua')."""
    return w in COMMON_CAP or w in STOP_NAMES or bool(re.search(r"(?<![\wÀ-ỹ])" + re.escape(w.lower()) + r"(?![\wÀ-ỹ])", text))


def infer_names(script, limit=6):
    """Ten rieng viet hoa xuat hien trong loi ke (truyen khong chia thoai) -> [(ten, gioi)].
    Nhan ten 2-3 chu (Tao Thao, Luu Bi, Gia Cat Luong) o BAT KY cho nao trong cau; ten 1 chu chi nhan khi dung dau cau lam chu ngu VA
    khong phai danh tu thuong (Lua, Kiem, Hoa...: dang viet thuong cua no cung co trong truyen)."""
    text = " ".join(l.text for l in script.lines if not l.speaker)
    known = {k.lower() for k in script.chars}
    cnt = {}
    # ---- ten nhieu chu
    for m in _MW_NAME.finditer(text):
        ws = m.group(1).split()
        while ws and (ws[0] in STOP_NAMES or ws[0] in COMMON_CAP or ws[0].lower() in _LEAD_WORDS):
            ws = ws[1:]
        while ws and (ws[-1] in STOP_NAMES or ws[-1] in COMMON_CAP):
            ws = ws[:-1]
        if len(ws) < 2 or ws[0] in PLACE_FIRST:
            continue
        nm = " ".join(ws)
        if nm.lower() in known or any(nm.lower() == k or nm.lower() in k.split(" (")[0] for k in known):
            continue
        seg_ = text[max(0, m.start() - 24):m.start()]
        pw = [] if re.search(r"[,.;:!?…\"“”()\n]\s*$", seg_) else re.findall(r"[\wÀ-ỹ]+", seg_.lower())
        if pw and pw[-1] in PLACE_PRE:                    # 'o Xich Bich', 'giac Khan Vang', 'quan Tao Thao': dia danh / to chuc, khong phai nguoi
            continue
        cnt[nm] = cnt.get(nm, 0) + 1
    # ---- ten 1 chu
    LEAD = ("và", "rồi", "thì", "khi", "lúc", "còn", "nhưng", "and", "then", "when", "while")
    one = {}
    for m in re.finditer(r"([A-ZÀ-Ỹ][a-zà-ỹ]{1,9})(?=\s+[a-zà-ỹ(])", text):
        w = m.group(1)
        if w in STOP_NAMES or w in script.chars or w.lower() in known:
            continue
        before = text[:m.start()].rstrip(" ")
        prev = before[-1:] if before else ""
        lastw = re.findall(r"\w+", before[-12:])
        ok = (not before) or prev in ".!?;,:\"“”«»\n" or (lastw and lastw[-1].lower() in LEAD)
        if not ok:
            continue
        one[w] = one.get(w, 0) + 1
    for m in re.finditer(r"(?<=\s)([A-ZÀ-Ỹ][a-zà-ỹ]{1,9})(?=\s+[a-zà-ỹ])", text):
        w = m.group(1)
        if w in one:
            one[w] += 1
    for w, c in one.items():
        if any(w in nm.split() for nm in cnt):          # 'Luu' trong 'Luu Bi' (da co ten day du): bo
            continue
        if _is_common_word(w, text) and w not in FEM_NAMES:
            continue
        cnt[w] = c
    out = []
    for w, c in sorted(cnt.items(), key=lambda kv: (-kv[1], kv[0])):
        if c < 2:
            continue
        from .script import name_gender
        g = name_gender(w, text) or ("f" if gender_of(w, text) == "f" else "m")
        out.append((w, g))
        if len(out) >= limit:
            break
    return out


def plan(script):
    """Gan ln.acts = [(f0, f1, nguoi, khoa)] cho tung dong. Tra ve so hanh dong."""
    names = list(script.chars)
    n_act = 0
    last_actor = {}
    for ln in script.lines:
        ln.acts = []
        text = ln.text or ""
        cl = _clauses(text)
        tot = sum(len(c) for c in cl) or 1
        pos = 0
        cast = script.scenes[ln.scene].cast if ln.scene < len(script.scenes) else []
        for c in cl:
            f0, f1 = pos / tot, (pos + len(c)) / tot
            pos += len(c)
            key = detect(c)
            if not key:
                continue
            if ln.speaker:
                if key not in SELF_ONLY:
                    continue
                actor = ln.speaker
            else:
                actor = _name_pos(c, names) or last_actor.get(ln.scene) or (cast[0] if cast else (names[0] if names else ""))
            if not actor or actor not in script.chars:
                continue
            last_actor[ln.scene] = actor
            ln.acts.append((f0, f1, actor, key))
            n_act += 1
            if ln.scene < len(script.scenes) and actor not in script.scenes[ln.scene].cast:
                script.scenes[ln.scene].cast.append(actor)
    return n_act


def needed(script, cap=9999):
    """Danh sach (nguoi, khoa) can ve sprite hanh dong (thu tu xuat hien, toi da cap)."""
    out = []
    for ln in script.lines:
        for _, _, actor, key in getattr(ln, "acts", []):
            if KEYS[key][0] and (actor, key) not in out:
                out.append((actor, key))
                try:
                    from .chargen import CTX
                    CTX[(actor, key)] = ln.text
                except Exception:
                    pass
    return out[:cap]


def act_key(P, name, t):
    for ln in P.lines:
        acts = getattr(ln, "acts", None)
        if not acts or not (ln.start - 0.15 <= t <= ln.end + 0.5):
            continue
        u = (t - ln.start) / max(ln.end - ln.start, 0.3)
        for f0, f1, actor, key in acts:
            if actor == name and f0 - 0.04 <= u <= f1 + 0.04 + (0.5 / max(ln.end - ln.start, 0.3)):
                return key
    return None


# ------------------------------------------------------------------ nhan vat phu
EXTRA_ROLES = [  # (ten hien thi, regex, gioi, tuoi, mo ta tieng Anh cho Flow)
    ("Mẹ", r"\b(mẹ|má|mẫu thân|mother|mom)\b", "f", "adult", "mother, warm kind face"),
    ("Bố", r"\b(bố|ba của|cha|tía|father|dad)\b", "m", "adult", "father"),
    ("Bà", r"\b(bà nội|bà ngoại|bà cụ|grandmother|grandma)\b", "f", "old", "grandmother"),
    ("Ông", r"\b(ông nội|ông ngoại|ông cụ|grandfather|grandpa)\b", "m", "old", "grandfather"),
    ("Cô giáo", r"\b(cô giáo|giáo viên|teacher)\b", "f", "adult", "teacher with pointer and book"),
    ("Thầy giáo", r"\b(thầy giáo|thầy)\b", "m", "adult", "male teacher with pointer and book"),
    ("Sếp", r"\b(sếp|giám đốc|ông chủ|trưởng phòng|boss|manager)\b", "m", "adult", "boss in dark suit and tie"),
    ("Bà chủ", r"\b(bà chủ|chủ quán|chủ tiệm|chủ nhà)\b", "f", "adult", "shop owner woman with apron"),
    ("Đồng nghiệp", r"\b(đồng nghiệp|colleague|coworker)\b", "f", "adult", "office worker colleague"),
    ("Bác sĩ", r"\b(bác sĩ|doctor)\b", "m", "adult", "doctor in white coat with stethoscope"),
    ("Y tá", r"\b(y tá|nurse)\b", "f", "adult", "nurse with white cap"),
    ("Khách", r"\b(khách hàng|khách|customer|client)\b", "m", "adult", "customer"),
    ("Bạn", r"\b(bạn thân|người bạn|bạn bè|cô bạn|cậu bạn|friend)\b", "f", "adult", "friend"),
    ("Cảnh sát", r"\b(cảnh sát|công an|police)\b", "m", "adult", "police officer in uniform"),
    ("Tên cướp", r"\b(tên cướp|kẻ trộm|tên trộm|tên côn đồ|thief|robber)\b", "m", "adult", "masked thief in dark clothes"),
    ("Đứa trẻ", r"\b(đứa trẻ|đứa bé|em bé|cậu bé|cô bé|con nhỏ|child|kid)\b", "m", "child", "small child"),
    ("Người qua đường", r"\b(mọi người|đám đông|đám người|dân làng|người dân|khán giả|crowd|villagers)\b", "f", "adult", "passer-by"),
    ("Lính", r"\b(người lính|tên lính|lính địch|lính|bộ đội|đồng đội|soldier)\b", "m", "adult", "soldier"),
    ("Thợ săn", r"\b(thợ săn|người săn|hunter)\b", "m", "adult", "hunter"),
    ("Thủ lĩnh", r"\b(thủ lĩnh|tộc trưởng|chief)\b", "m", "old", "tribal chief"),
]
PHONE_CTX = ("gọi", "alo", "điện thoại", "nhắn tin", "phone", "call")


def extras(script, max_extra=12):
    """Them nhan vat phu co nhac trong truyen (khong thay the nhan vat da co) va xep vao dung canh."""
    from .script import Character
    era = script.era
    existing = " ".join(n.lower() for n in script.chars)
    scene_txt = []
    for si, sd in enumerate(script.scenes):
        body = " ".join(l.text for l in script.lines if l.scene == si and not l.speaker) + " " + sd.desc
        # chi xet doan ke / mo ta (khong xet loi thoai nhan vat goi "me oi"), va bo cau goi dien
        parts = [p for p in re.split(r"(?<=[\.\!\?])\s+", body) if not any(k in p.lower() for k in PHONE_CTX)]
        scene_txt.append(" " + " ".join(parts).lower() + " ")
    added = 0
    for name, rx, g, age, en in EXTRA_ROLES:
        if added >= max_extra:
            break
        if name.lower() in existing or any(name.lower() in n.lower() or n.lower() in name.lower() for n in script.chars):
            continue
        if era == "war" and name in ("Cô giáo", "Thầy giáo", "Sếp", "Đồng nghiệp", "Khách", "Bà chủ"):
            continue
        if era == "ancient" and name not in ("Mẹ", "Bố", "Bà", "Ông", "Đứa trẻ", "Thợ săn", "Thủ lĩnh", "Người qua đường"):
            continue
        hits = [si for si, tx in enumerate(scene_txt) if re.search(rx, tx)]
        if not hits:
            continue
        script.chars[name] = Character(name, g, age, look_seed=name, attrs=en)
        added += 1
        for si in hits:
            if name not in script.scenes[si].cast:
                script.scenes[si].cast.append(name)
    return added


def add_named_to_scenes(script):
    """Nhan vat da co ten xuat hien trong van ban cua canh nhung chua nam trong cast -> them vao."""
    for si, sd in enumerate(script.scenes):
        body = (sd.desc + " " + " ".join(l.text for l in script.lines if l.scene == si)).lower()
        for n in script.chars:
            nl = n.lower()
            if nl in PRONOUN_NAMES or n in sd.cast:
                continue
            if re.search(r"(?<!\w)" + re.escape(nl) + r"(?!\w)", body):
                sd.cast.append(n)
    for sd in script.scenes:                      # toi da 5 nguoi / canh
        if len(sd.cast) > 8:
            sd.cast = sd.cast[:8]


# ------------------------------------------------------------------ dao cu ve bang code (khi khong co Flow)
def prop_overlay(prop, size, flip=False):
    """Anh RGBA cung kich thuoc sprite voi dao cu o vi tri tay (don gian, de nhin)."""
    W, H = size
    im = Image.new("RGBA", size, (0, 0, 0, 0))
    d = ImageDraw.Draw(im)
    ol = (30, 30, 36, 255)
    u = H / 100.0
    if prop in ("phone_ear",):
        u *= 1.7
        x, y = W * 0.74, H * 0.16
        d.rounded_rectangle([x - 3 * u, y, x + 3 * u, y + 11 * u], 1.5 * u, fill=(40, 44, 56, 255), outline=ol, width=max(1, int(u * 0.6)))
        d.rectangle([x - 2 * u, y + 1.5 * u, x + 2 * u, y + 8 * u], fill=(120, 190, 255, 255))
    elif prop == "phone":
        x, y = W * 0.5, H * 0.46
        d.rounded_rectangle([x - 4 * u, y, x + 4 * u, y + 14 * u], 1.8 * u, fill=(40, 44, 56, 255), outline=ol, width=max(1, int(u * 0.6)))
        d.rectangle([x - 3 * u, y + 1.5 * u, x + 3 * u, y + 11 * u], fill=(120, 190, 255, 255))
    elif prop == "laptop":
        x, y = W * 0.5, H * 0.50
        d.polygon([(x - 14 * u, y + 10 * u), (x + 14 * u, y + 10 * u), (x + 10 * u, y), (x - 10 * u, y)], fill=(200, 205, 215, 255), outline=ol)
        d.rectangle([x - 9 * u, y + 1 * u, x + 9 * u, y + 8 * u], fill=(90, 150, 230, 255))
    elif prop == "cup":
        x, y = W * 0.5, H * 0.33
        d.rounded_rectangle([x - 4 * u, y, x + 4 * u, y + 9 * u], 1.2 * u, fill=(250, 250, 250, 255), outline=ol, width=max(1, int(u * 0.6)))
        d.arc([x + 3 * u, y + 2 * u, x + 8 * u, y + 7 * u], -90, 90, fill=ol, width=max(1, int(u * 0.6)))
    elif prop == "bowl":
        x, y = W * 0.5, H * 0.44
        d.pieslice([x - 7 * u, y - 5 * u, x + 7 * u, y + 7 * u], 0, 180, fill=(250, 250, 250, 255), outline=ol)
    elif prop == "book":
        x, y = W * 0.5, H * 0.46
        d.polygon([(x - 12 * u, y + 10 * u), (x, y + 7 * u), (x + 12 * u, y + 10 * u), (x + 12 * u, y), (x, y - 3 * u), (x - 12 * u, y)], fill=(250, 244, 224, 255), outline=ol)
        d.line([x, y - 3 * u, x, y + 7 * u], fill=ol, width=max(1, int(u * 0.5)))
    elif prop == "camera":
        x, y = W * 0.5, H * 0.14
        d.rounded_rectangle([x - 9 * u, y, x + 9 * u, y + 12 * u], 2 * u, fill=(60, 60, 68, 255), outline=ol)
        d.ellipse([x - 4 * u, y + 2.5 * u, x + 4 * u, y + 10 * u], fill=(150, 200, 255, 255), outline=ol)
    elif prop == "umbrella":
        x, y = W * 0.5, H * -0.0
        d.pieslice([x - 26 * u, y - 4 * u, x + 26 * u, y + 28 * u], 180, 360, fill=(220, 70, 70, 255), outline=ol)
        d.line([x, y + 12 * u, x, y + 30 * u], fill=ol, width=max(1, int(u * 0.8)))
    elif prop == "bag":
        x, y = W * 0.86, H * 0.55
        d.rounded_rectangle([x - 7 * u, y, x + 7 * u, y + 14 * u], 2 * u, fill=(200, 120, 70, 255), outline=ol)
        d.arc([x - 4 * u, y - 5 * u, x + 4 * u, y + 3 * u], 180, 360, fill=ol, width=max(1, int(u * 0.6)))
    elif prop == "rifle":
        d.line([W * 0.15, H * 0.52, W * 0.95, H * 0.40], fill=(70, 50, 36, 255), width=max(2, int(u * 2)))
        d.line([W * 0.55, H * 0.46, W * 0.95, H * 0.40], fill=(40, 40, 44, 255), width=max(2, int(u * 1.4)))
    elif prop == "spear":
        d.line([W * 0.9, H * 0.02, W * 0.9, H * 0.98], fill=(120, 84, 48, 255), width=max(2, int(u * 1.6)))
        d.polygon([(W * 0.9, -H * 0.0), (W * 0.9 - 2 * u, H * 0.07), (W * 0.9 + 2 * u, H * 0.07)], fill=(220, 220, 225, 255))
    elif prop == "stone":
        x, y = W * 0.82, H * 0.12
        d.ellipse([x - 3 * u, y - 3 * u, x + 3 * u, y + 3 * u], fill=(130, 130, 136, 255), outline=ol)
    elif prop == "pan":
        x, y = W * 0.84, H * 0.50
        d.ellipse([x - 7 * u, y - 3 * u, x + 7 * u, y + 3 * u], fill=(60, 60, 66, 255), outline=ol)
        d.line([x - 7 * u, y, x - 17 * u, y + 2 * u], fill=ol, width=max(1, int(u)))
    elif prop == "fire":
        x, y = W * 0.5, H * 0.90
        d.polygon([(x - 6 * u, y + 8 * u), (x, y - 8 * u), (x + 6 * u, y + 8 * u)], fill=(255, 150, 40, 255))
        d.polygon([(x - 3 * u, y + 8 * u), (x, y - 1 * u), (x + 3 * u, y + 8 * u)], fill=(255, 220, 90, 255))
    if flip:
        im = im.transpose(Image.FLIP_LEFT_RIGHT)
    return im


# ------------------------------------------------------------------ chia canh theo tung cau
TIME_RX = re.compile(r"^\s*(lớn lên|khi lớn|hồi nhỏ|ngày xưa|thời đi học|sau này|bây giờ|hiện tại|giờ đây|đi làm|năm \d+ tuổi|lên (cấp|đại học|lớp)|sáng|trưa|chiều|tối|đêm|khuya|hôm sau|ngày hôm sau|hôm đó|ngày hôm đó|mấy ngày|vài ngày|năm sau|tuần sau|tháng sau|sau \d|sau vài|sau ít|nhiều năm|morning|evening|night|the next|next day|later that|weeks later|years later)", re.I)


def _sentences(text):
    cjk = langs.has_cjk(text)             # chu Han / Nhat / Han: cau ket thuc bang 。！？ khong co dau cach sau do; cau ngan hon vi moi chu mang nhieu nghia
    parts = langs.split_sentences(text) if cjk else [p.strip() for p in re.split(r"(?<=[\.\!\?…])\s+", text) if p and p.strip()]
    out = []
    for p in parts:
        if out and (len(out[-1]) < (8 if cjk else 22) or len(p) < (5 if cjk else 14)):
            out[-1] += ("" if cjk and langs.has_cjk(out[-1][-1:] + p[:1]) else " ") + p
        else:
            out.append(p)
    return out or [text]


def split_beats(script):
    """Moi cau = mot nhip: cau ke duoc tach rieng; doi dia diem / moc thoi gian -> canh moi voi nen ve theo CHINH cau do."""
    from .script import SceneDef, Line, guess_scene, guess_weather
    from .chargen import detect_place
    era = script.era
    new_lines = []
    for ln in script.lines:
        if ln.speaker:
            new_lines.append((ln, ln.text))
            continue
        for i, sx in enumerate(_sentences(ln.text)):
            new_lines.append((ln, sx))
    scenes, lines = [], []
    cur_place, prev_orig = None, None
    for ln, tx in new_lines:
        pl = detect_place(era, tx)
        pname = pl[0] if pl else None
        orig = ln.scene
        first = not scenes
        boundary = first or orig != prev_orig
        if not boundary:
            if pname and pname != cur_place:
                boundary = True
            elif (not ln.speaker) and TIME_RX.search(tx) and len(lines) and lines[-1].scene == len(scenes) - 1 and \
                    sum(1 for x in lines if x.scene == len(scenes) - 1) >= 1:
                boundary = True
        if boundary:
            o = script.scenes[orig] if orig < len(script.scenes) else None
            desc = tx
            th, night, rain = guess_scene(desc)
            snow, fog, dusk = guess_weather(desc)
            sd = SceneDef(desc, th, night, rain, list(o.cast) if o else [], snow, fog, dusk, list(o.fx) if (o and orig != prev_orig) else [])
            sd.place_t = pl
            scenes.append(sd)
            cur_place = pname or cur_place
        elif pname:
            cur_place = pname
        prev_orig = orig
        nl = Line(ln.speaker, tx, ln.emotion, len(scenes) - 1, list(ln.fx) if tx == ln.text or True else [])
        lines.append(nl)
    script.scenes, script.lines = scenes, lines
    for sd in scenes:
        if getattr(sd, "place_t", None) is None:       # nen ke thua cua canh truoc
            pass
    last = None
    for sd in scenes:
        if sd.place_t is None:
            sd.place_t = last
        else:
            last = sd.place_t
    return len(scenes)


# ------------------------------------------------------------------ hinh chen (man hinh dien thoai, tin nhan, thu...)
INSERTS = [  # (khoa, tu khoa, mo ta tieng Anh)
    ("messenger", ["messenger", "facebook", "fb ", "inbox"], "a smartphone screen showing a blue Facebook-Messenger-style chat app: colourful message bubbles, round avatars, a blue send arrow and a red unread badge"),
    ("zalo", ["zalo"], "a smartphone screen showing a blue Zalo-style chat app with message bubbles, round avatars and unread badges"),
    ("chat", ["tin nhắn", "nhắn tin", "đoạn chat", "chat ", "seen", "đã xem", "không trả lời", "nhắn cho", "text message", "texting"], "a smartphone screen showing a chat app with message bubbles, the last bubbles unanswered, a 'seen' mark and a typing indicator"),
    ("missed", ["cuộc gọi nhỡ", "gọi nhỡ", "missed call", "không nghe máy", "không bắt máy"], "a smartphone screen with a red missed-call notification and a contact avatar"),
    ("social", ["story", "bài đăng", "status", "đăng ảnh", "lượt thích", "bình luận", "newsfeed", "bảng tin", "instagram", "tiktok", "like ", "comment"], "a smartphone screen showing a social media feed post with a photo, heart and like icons and comments"),
    ("email", ["email", "e-mail", "thư điện tử", "hộp thư"], "a laptop screen showing an email inbox with unread mails"),
    ("letter", ["bức thư", "lá thư", "thiệp", "lời nhắn", "letter"], "a handwritten letter on a desk with an envelope"),
    ("photo", ["bức ảnh", "tấm ảnh", "ảnh cũ", "album", "ảnh chụp chung", "ảnh tốt nghiệp", "photo album"], "an old photo album open on a table showing a group photo of smiling classmates"),
    ("cake", ["sinh nhật", "bánh kem", "birthday"], "a birthday cake with lit candles on a table"),
    ("money", ["lương", "hóa đơn", "tiền thuê", "nợ", "salary", "bill", "invoice"], "a desk with bills, invoices and a calculator"),
    ("calendar", ["lịch hẹn", "deadline", "lịch trình", "kỳ thi", "thời khóa biểu"], "a wall calendar with circled dates and a ticking alarm clock"),
]


def insert_for(text):
    low = " " + text.lower() + " "
    for key, kws, en in INSERTS:
        if any(k in low for k in kws):
            return key, en
    return None


def fallback_insert(key, path, size=(1280, 720)):
    """Hinh chen ve bang code (khi khong co Flow): dien thoai bong bay voi nen gradient, avatar, bong bong chat."""
    import os, numpy as np
    W, H = size
    yy = np.linspace(0, 1, H)[:, None]; xx = np.linspace(0, 1, W)[None, :]
    g = np.zeros((H, W, 3), np.float32)
    c0, c1 = np.array([30, 40, 90]), np.array([130, 90, 200])
    for k in range(3):
        g[..., k] = c0[k] + (c1[k] - c0[k]) * (0.5 * yy + 0.5 * xx)
    im = Image.fromarray(g.astype(np.uint8), "RGB").convert("RGBA")
    d = ImageDraw.Draw(im)
    pw, ph = int(H * 0.50), int(H * 0.92)
    x0, y0 = (W - pw) // 2, (H - ph) // 2
    sh = Image.new("RGBA", im.size, (0, 0, 0, 0)); ImageDraw.Draw(sh).rounded_rectangle([x0 + 10, y0 + 26, x0 + pw + 10, y0 + ph + 26], 48, fill=(0, 0, 0, 120))
    from PIL import ImageFilter
    im.alpha_composite(sh.filter(ImageFilter.GaussianBlur(18)))
    d = ImageDraw.Draw(im)
    d.rounded_rectangle([x0, y0, x0 + pw, y0 + ph], 48, fill=(18, 18, 24, 255))
    d.rounded_rectangle([x0 + 12, y0 + 12, x0 + pw - 12, y0 + ph - 12], 38, fill=(255, 255, 255, 255))
    blue = (0, 132, 255) if key in ("messenger", "chat", "zalo", "ai") else (120, 90, 200)
    d.rounded_rectangle([x0 + 12, y0 + 12, x0 + pw - 12, y0 + 100], 38, fill=blue); d.rectangle([x0 + 12, y0 + 60, x0 + pw - 12, y0 + 100], fill=blue)
    d.ellipse([x0 + 30, y0 + 28, x0 + 84, y0 + 82], fill=(255, 214, 170, 255), outline=(255, 255, 255, 255), width=3)
    d.rounded_rectangle([x0 + 96, y0 + 36, x0 + 220, y0 + 52], 7, fill=(255, 255, 255, 255)); d.rounded_rectangle([x0 + 96, y0 + 60, x0 + 170, y0 + 70], 5, fill=(200, 225, 255, 255))
    y = y0 + 124
    for side, w in [(0, 0.55), (1, 0.62), (0, 0.40), (1, 0.72), (1, 0.46), (0, 0.50), (1, 0.30)]:
        bw = int((pw - 90) * w); bx = x0 + 52 if side == 0 else x0 + pw - 30 - bw
        if side == 0:
            d.ellipse([x0 + 24, y + 6, x0 + 46, y + 28], fill=(255, 190, 140, 255))
        d.rounded_rectangle([bx, y, bx + bw, y + 44], 22, fill=(235, 238, 244, 255) if side == 0 else blue)
        d.rounded_rectangle([bx + 16, y + 14, bx + bw - 16, y + 22], 4, fill=(190, 196, 208, 255) if side == 0 else (170, 210, 255, 255))
        d.rounded_rectangle([bx + 16, y + 28, bx + int(bw * 0.6), y + 34], 3, fill=(205, 210, 220, 255) if side == 0 else (150, 195, 255, 255))
        y += 60
        if y > y0 + ph - 120:
            break
    d.rounded_rectangle([x0 + 34, y0 + ph - 84, x0 + pw - 34, y0 + ph - 34], 25, outline=(200, 204, 214, 255), width=3, fill=(246, 247, 250, 255))
    d.ellipse([x0 + pw - 70, y0 + ph - 78, x0 + pw - 40, y0 + ph - 40], fill=blue)
    d.ellipse([x0 + pw - 62, y0 - 18, x0 + pw + 8, y0 + 52], fill=(240, 50, 60, 255), outline=(255, 255, 255, 255), width=4)
    os.makedirs(os.path.dirname(path), exist_ok=True)
    im.convert("RGB").save(path)
    return path


MOVE = {"run", "walk"}


def act_state(P, name, t):
    """(khoa, tien do 0..1 trong menh de) hoac (None, 0)."""
    for ln in P.lines:
        acts = getattr(ln, "acts", None)
        if not acts or not (ln.start - 0.15 <= t <= ln.end + 0.5):
            continue
        d = max(ln.end - ln.start, 0.3)
        u = (t - ln.start) / d
        for f0, f1, actor, key in acts:
            if actor == name and f0 - 0.04 <= u <= f1 + 0.04 + 0.5 / d:
                return key, max(0.0, min(1.0, (u - f0) / max(f1 - f0, 0.05)))
    return None, 0.0


PROP_WORDS = [("phone", ["điện thoại", "smartphone", "phone", "messenger", "nhắn tin"]), ("cup", ["cốc", "ly ", "tách", "cup", "mug", "coffee", "cà phê"]),
              ("book", ["sách", "vở", "sổ", "book", "notebook", "thư", "letter"]), ("bag", ["túi", "cặp", "balo", "bag", "backpack"]),
              ("umbrella", ["ô ", "dù", "umbrella"]), ("laptop", ["laptop", "máy tính"]), ("camera", ["máy ảnh", "camera"])]


def prop_from_text(t):
    low = " " + t.lower() + " "
    for p, kws in PROP_WORDS:
        if any(k in low for k in kws):
            return p
    return None
