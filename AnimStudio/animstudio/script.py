# -*- coding: utf-8 -*-
"""Phan tich kich ban dang chu thanh nhan vat / canh / loi thoai.

Cu phap (tat ca deu tuy chon, tool tu doan):
  @title Ten phim | Dong phu
  @lang vi            (hoac en, zh, tw, hk, ja, ko, th, id, ms, fr, de, es, pt, it, ru, hi, ar, tr; mac dinh tu nhan)
  @char Lan: nu, tre   |  @char Ong Sau: nam, gia  |  @char Be Ti: be trai
  [Canh: ga tau dem mua | Lan, Ong Sau]      (phan sau | la dan nhan vat, tuy chon)
  Lan (buon): Chi oi...
  Dan: Mot dem mua...      (dong khong co ten = loi dan)
"""
import re
from dataclasses import dataclass, field
from .common import detect_lang
from . import langs

NARRATORS = {"dẫn", "dẫn chuyện", "người dẫn", "người dẫn chuyện", "lời dẫn", "narrator", "nar", "voice over", "voiceover",
             "vo", "n", "dan", "dan chuyen", "nguoi dan chuyen",
             # nhan loi dan o cac ngon ngu khac (Trung / Nhat / Han / Thai / Nga / Au)
             "旁白", "旁白者", "解说", "解說", "叙述者", "敘述者", "叙述", "敘述", "画外音", "畫外音", "ナレーション", "ナレーター", "語り", "語り手", "ナレ",
             "나레이션", "내레이션", "내레이터", "나레이터", "해설", "해설자", "ผู้บรรยาย", "บรรยาย", "рассказчик", "диктор", "закадровый голос",
             "narrateur", "voix off", "narrador", "narración", "voz en off", "narratore", "erzähler", "sprecher", "narasi", "narator", "pencerita",
             "सूत्रधार", "कथावाचक", "الراوي", "راوي", "anlatıcı", "anlatici"}

EMO_MAP = {
    "vui": "happy", "vui vẻ": "happy", "cười": "happy", "happy": "happy", "smile": "happy", "joy": "happy",
    "buồn": "sad", "khóc": "sad", "sad": "sad", "cry": "sad", "crying": "sad",
    "giận": "angry", "tức": "angry", "tức giận": "angry", "quát": "angry", "angry": "angry", "mad": "angry",
    "sợ": "scared", "sợ hãi": "scared", "hoảng": "scared", "run": "scared", "scared": "scared", "afraid": "scared", "fear": "scared",
    "ngạc nhiên": "surprised", "bất ngờ": "surprised", "sốc": "surprised", "surprised": "surprised", "shock": "surprised",
    "suy nghĩ": "thinking", "nghĩ": "thinking", "băn khoăn": "thinking", "thinking": "thinking", "hmm": "thinking",
    "thì thầm": "whisper", "whisper": "whisper", "bình thường": "neutral", "neutral": "neutral",
}

THEMES = [  # (theme, tu khoa) - 4 loai canh; thoi dai (era) quyet dinh dien mao
    ("hall", ["ga ", "ga,", "sân ga", "nhà ga", "station", "platform", "phòng chờ", "waiting room", "văn phòng", "office",
              "công ty", "company", "trường", "school", "lớp", "class", "bệnh viện", "hospital", "họp", "meeting",
              "cung", "điện", "đình", "chùa", "temple", "palace", "triều", "throne", "ngai", "đại sảnh", "hall",
              "hầm", "bunker", "chỉ huy", "command", "doanh trại", "barracks", "trại", "camp", "tòa", "court",
              "đại hang", "hang lớn", "cavern", "đại hội bộ lạc"]),
    ("street", ["bộ lạc", "tribe", "bản làng", "trại bộ lạc", "đường", "phố", "ngõ", "hẻm", "street", "road", "alley", "city", "thành phố", "cầu", "bridge", "chợ",
                "market", "đổ nát", "ruins", "town", "thị trấn", "cổng thành", "gate"]),
    ("outdoor", ["rừng", "forest", "công viên", "park", "vườn", "garden", "biển", "beach", "đồng", "field", "núi", "mountain",
                 "làng", "village", "quê", "sân", "yard", "hồ", "lake", "sông", "river", "chiến hào", "trench",
                 "chiến trường", "battlefield", "mặt trận", "front", "thung lũng", "valley", "đèo", "pass", "thảo nguyên", "savanna", "hoang dã", "wild", "vách núi", "cliff", "núi lửa", "volcano"]),
    ("room", ["hang động", "trong hang", "cave", "hang ", "phòng", "room", "nhà", "house", "home", "bếp", "kitchen", "bedroom", "quán", "cafe", "café", "trọ", "inn", "tent", "lều"]),
]
ERA_KW = {
    "ancient": ["nguyên thủy", "người tiền sử", "tiền sử", "bộ lạc", "thủ lĩnh bộ lạc", "tộc trưởng", "hang động", "trong hang", "ăn lông ở lỗ", "voi ma mút",
                "ma mút", "mammoth", "thợ săn", "săn bắt", "giáo đá", "rìu đá", "đá cuội", "thảo nguyên", "caveman", "cave", "prehistoric", "tribe", "tribal",
                "stone age", "hunter", "spear", "primitive", "sabertooth", "dinosaur", "khủng long", "bầy sói", "thần lửa", "nhóm lửa", "thú dữ"],
    "imperial": ["vua", "hoàng đế", "hoàng hậu", "hoàng tử", "công chúa", "triều đình", "cung điện", "cung đình", "đại hiệp", "nương nương",
                 "thái giám", "emperor", "king", "queen", "prince", "princess", "dynasty", "samurai", "mandarin", "palace", "empress", "knight", "kingdom"],
    "war": ["chiến tranh", "chiến trường", "chiến hào", "lính", "bộ đội", "súng", "đạn", "pháo", "bom", "tiền tuyến", "mặt trận",
            "đại đội", "trung đội", "chiến sĩ", "tướng", "war", "soldier", "battle", "gun", "trench", "bomb", "army", "sergeant",
            "captain", "front line", "artillery", "bunker", "hầm", "tiếng nổ", "đoàn lính", "quân địch", "địch", "đồn", "tiểu đội", "bom đạn"],
}


def detect_era(text):
    t = " " + text.lower() + " "
    sc = {e: sum(t.count(k) for k in kws) for e, kws in ERA_KW.items()}
    if any(k in t for k in ("nguyên thủy", "tiền sử", "bộ lạc", "hang động", "ma mút", "mammoth", "caveman", "prehistoric", "stone age", "ăn lông ở lỗ")):
        return "ancient"
    # truyen co Trung Hoa (Tam Quoc, Han, Duong...): ten tuong / chuc quan / trieu dai dac trung -> cung dinh phuong Dong, KHONG nham la chien tranh the gioi
    if sum(t.count(k) for k in _HIST_MARK + tuple(_TQ_MALE) + _TQ_FEM_NAMES) >= 2:
        return "imperial"
    best = max(sc, key=sc.get)
    if sc["war"] >= 1 and any(k in t for k in ("lính", "chiến tranh", "chiến sĩ", "bộ đội", "soldier", "tiếng nổ", "súng", "pháo", "chiến trường", "war ")):
        return "war"
    return best if sc[best] >= 2 else "modern"


def guess_scene(desc):
    d = " " + desc.lower() + " "
    theme = "room"
    for th, kws in THEMES:
        if any(k in d for k in kws):
            theme = th
            break
    night = any(k in d for k in NIGHT_KW) and not any(k in d for k in DAY_KW)
    rain = any(k in d for k in RAIN_KW)
    return theme, night, rain


NIGHT_KW = ["đêm", "tối", "khuya", "night", "midnight", "dark", "evening", "hoàng hôn", "dusk"]
RAIN_KW = ["mưa", "rain", "storm", "bão", "sấm", "thunder"]
SNOW_KW = ["tuyết", "snow", "blizzard", "băng giá", "frozen"]
FOG_KW = ["sương", "mù", "fog", "mist", "khói", "smoke", "haze"]
DUSK_KW = ["hoàng hôn", "chiều tà", "dusk", "sunset", "bình minh", "dawn", "sunrise"]
DAY_KW = ["sáng", "morning", "trưa", "noon", "ban ngày", "daytime", "nắng", "sunny"]


def guess_weather(desc):
    d = " " + desc.lower() + " "
    return any(k in d for k in SNOW_KW), any(k in d for k in FOG_KW), any(k in d for k in DUSK_KW)


EMO_WORDS = [
    ("scared", ["cứu", "sợ", "hoảng", "trời ơi", "chết", "help", "afraid", "scared", "run!", "hide", "trốn", "đừng giết"]),
    ("angry", ["đồ khốn", "im đi", "câm", "tức", "giận", "dám", "khốn", "damn", "shut up", "how dare", "idiot", "liar"]),
    ("sad", ["khóc", "buồn", "nhớ", "mất", "xin lỗi", "đau", "sorry", "miss you", "lost", "goodbye", "tạm biệt", "cry"]),
    ("happy", ["haha", "tuyệt", "vui", "yêu", "cảm ơn", "thích", "great", "wonderful", "love", "thank", "yay", "hurray", "hạnh phúc"]),
    ("surprised", ["sao cơ", "thật sao", "không thể", "what?!", "really?", "no way", "ôi", "wow", "hả"]),
    ("thinking", ["hmm", "để xem", "có lẽ", "không biết", "maybe", "perhaps", "let me think", "tôi nghĩ"]),
]


def auto_emotion(text):
    t = text.lower()
    for emo, kws in EMO_WORDS:
        if any(k in t for k in kws):
            return emo
    if "?!" in t or "!?" in t:
        return "surprised"
    if t.count("!") >= 2:
        return "angry"
    return "neutral"


FX_RE = re.compile(r"\{([^{}]*)\}")


def take_fx(s):
    out = []
    for m in FX_RE.finditer(s):
        body = re.sub(r"^\s*(fx|hiệu ứng|effect|effects|sfx)\s*[:：]\s*", "", m.group(1), flags=re.I)
        out += [x.strip().lower() for x in re.split(r"[,;|]", body) if x.strip()]
    return FX_RE.sub("", s).strip(), out


def guess_look(name, attrs=""):
    """gender 'm'/'f', age 'adult'/'child'/'old'."""
    s = (name + " " + attrs).lower()
    g, a = None, "adult"
    toks = re.split(r"[\s,;/]+", s)
    if any(k in s for k in ("bé", "em bé", "trẻ em", "child", "kid", "cậu bé", "cô bé", "baby", "boy", "girl", "thằng", "con bé")):
        a = "child"
    if any(k in s for k in ("già", "old", "elder", "ông", "bà ", "bà", "grand", "cụ", "bác")):
        a = "old"
    if any(t in toks for t in ("nữ", "nu", "female", "f", "girl", "gái", "woman", "lady", "mrs", "mom", "mother", "mẹ", "má",
                               "chị", "cô", "bà", "grandma", "she", "bé gái")) or "con gái" in s or "bé gái" in s:
        g = "f"
    if any(t in toks for t in ("nam", "male", "m", "boy", "trai", "man", "mr", "dad", "father", "bố", "ba", "cha", "anh",
                               "chú", "ông", "grandpa", "he", "sir")) or "bé trai" in s:
        g = "m" if g is None or "trai" in s else g
    if g is None and re.search(r"\b(chị|cô|bà|mẹ|má|mom|mrs|ms|miss|lady)\b", s):
        g = "f"
    return g, a


# ---------------------------------------------------------------- gioi tinh theo ten (Han-Viet / Tam Quoc) + khai bao 'Nhan vat: A, B'
_FEM_PHRASES = ("phu nhân", "công chúa", "hoàng hậu", "thái hậu", "tiểu thư", "cô nương", "nương nương", "điêu thuyền", "đại kiều", "tiểu kiều", "thượng hương",
                "nguyệt anh", "văn cơ", "chân mật", "tào tiết", "xuân hoa", "mi phu", "cam phu")
_FEM_TOK = {"thị", "nương", "nàng", "bà", "cô", "chị", "mẹ", "má", "mrs", "ms", "miss", "lady", "queen", "princess", "hậu"}
_MALE_TOK = {"vương", "đế", "hầu", "công", "tướng", "ông", "chú", "bác", "ngài", "sir", "mr", "king", "prince", "lord", "hoàng", "chúa", "thái", "đại"}
_TQ_MALE = {"tào tháo", "lưu bị", "quan vũ", "quan vân trường", "trương phi", "gia cát lượng", "khổng minh", "triệu vân", "mã siêu", "hoàng trung", "ngụy diên", "khương duy",
            "tôn quyền", "chu du", "lỗ túc", "lục tốn", "cam ninh", "lã bố", "đổng trác", "viên thiệu", "viên thuật", "tư mã ý", "tư mã chiêu", "hạ hầu đôn", "hạ hầu uyên",
            "tào phi", "tào nhân", "tào hồng", "tuân úc", "quách gia", "giả hủ", "trình dục", "từ thứ", "bàng thống", "lưu thiện", "lưu biểu", "lưu chương", "hoàng cái",
            "lữ mông", "điển vi", "hứa chử", "trương liêu", "từ hoảng", "nghiêm nhan", "văn sửu", "nhan lương", "hoa hùng", "hán hiến đế", "tôn kiên", "tôn sách"}
_TQ_FEM_NAMES = ("điêu thuyền", "đại kiều", "tiểu kiều", "tôn thượng hương", "hoàng nguyệt anh", "chân mật", "thái văn cơ")
_HIST_MARK = ("tam quốc", "đông hán", "tây hán", "thừa tướng", "chúa công", "tướng quân", "quân sư", "hoàng đế", "triều đình", "thái thú", "bái kiến", "khăn vàng",
              "xích bích", "nhà hán", "nhà đường", "nhà tống", "nhà minh", "nhà thanh", "chiến quốc", "xuân thu", "tần thủy hoàng", "ngũ hổ tướng", "tam anh")
_M_PRON = re.compile(r"(?<![\wÀ-ỹ])(?:chàng|hắn|ngài|gã|lão|ông|y)(?![\wÀ-ỹ])")
_F_PRON = re.compile(r"(?<![\wÀ-ỹ])(?:nàng|bà|cô|chị|thị)(?![\wÀ-ỹ])")


def name_gender(name, text="", hist=None):
    """'m' / 'f' / None (khong chac) theo ten Han-Viet, danh xung (phu nhan, cong chua...), dai tu ngay sau ten (nang / chang / han...) va boi canh co dai."""
    nl = " ".join(str(name).lower().split())
    if not nl:
        return None
    if any(p in nl for p in _FEM_PHRASES) or set(nl.split()) & _FEM_TOK:
        return "f"
    if nl in _TQ_MALE:
        return "m"
    f = m = 0
    low = (text or "").lower()
    for mm in re.finditer(r"(?<![\wÀ-ỹ])" + re.escape(nl) + r"(?![\wÀ-ỹ])", low):
        seg = re.split(r"[.!?…\n]", low[mm.end(): mm.end() + 200])
        seg = " ".join(seg[:2])
        f += len(_F_PRON.findall(seg)); m += len(_M_PRON.findall(seg))
    if f > m:
        return "f"
    if m > f:
        return "m"
    try:
        from .actions import FEM_NAMES
        if nl.split()[-1].capitalize() in FEM_NAMES:
            return "f"
    except Exception:
        pass
    if set(nl.split()) & _MALE_TOK:
        return "m"
    if hist is None:
        hist = any(k in low for k in _HIST_MARK) or any(k in low for k in _TQ_MALE)
    if hist and 2 <= len(nl.split()) <= 4:
        return "m"                            # truyen co (Tam Quoc...): ten 2-4 chu khong co dau hieu nu thi la nam, khong xen ke nam/nu nua
    return None


_CAST_RE = re.compile(r"^(?:@\s*)?(?:các\s+)?(?:nhân vật|danh sách nhân vật|characters?|cast)(?:\s+(?:gồm|là|chính|chính là|trong truyện))?\s*[:：]\s*(.*)$", re.I)
_BULLET = re.compile(r"^\s*(?:[-–—•*·]|\d{1,2}[.)])\s+(.+)$")


def _split_cast(s):
    parts, buf, depth = [], "", 0
    for ch in s:
        if ch in "([（":
            depth += 1
        elif ch in ")]）":
            depth = max(0, depth - 1)
        if depth == 0 and ch in ",;、，；":
            parts.append(buf); buf = ""
        else:
            buf += ch
    parts.append(buf)
    out = []
    for p in parts:
        for q in re.split(r"\s+(?:và|and|&)\s+", p.strip()) if depth == 0 else [p]:
            q = re.sub(r"^\s*(?:[-–—•*·]|\d{1,2}[.)])\s*", "", q).strip().strip(".")
            if not q:
                continue
            m = re.match(r"^([^()（）:：\-–—]{1,40}?)\s*(?:[(（]([^)）]*)[)）]|\s[-–—]\s(.+)|[:：]\s*(.+))?$", q)
            if m and m.group(1).strip():
                out.append((m.group(1).strip(), (m.group(2) or m.group(3) or m.group(4) or "").strip()))
    return out


def take_cast(text):
    """Tach cac dong khai bao 'Nhan vat: Tao Thao, Luu Bi' (hoac danh sach gach dau dong ben duoi) ra khoi van ban.
    Tra ve ([(ten, mo ta)], van_ban_con_lai): dong nay KHONG duoc doc len va ten duoc dung lam nhan vat that."""
    lines = str(text or "").replace("\r", "").split("\n")
    keep, cast, i = [], [], 0
    while i < len(lines):
        m = _CAST_RE.match(lines[i].strip())
        if not m:
            keep.append(lines[i]); i += 1
            continue
        rest = m.group(1).strip()
        items = _split_cast(rest) if rest else []
        i += 1
        if not rest:
            while i < len(lines) and _BULLET.match(lines[i]):
                items += _split_cast(_BULLET.match(lines[i]).group(1))
                i += 1
        cast += items
    return cast, "\n".join(keep)


@dataclass
class Character:
    name: str
    gender: str = "m"
    age: str = "adult"
    voice: str = ""          # ten giong (tuy chon, GUI sua duoc)
    look_seed: str = ""
    attrs: str = ""
    same_as: str = ""       # cung mot nguoi o do tuoi khac (vd 'Minh (lon)' same_as 'Minh (nho)')


@dataclass
class Line:
    speaker: str             # "" = loi dan
    text: str
    emotion: str = "neutral"
    scene: int = 0
    fx: list = field(default_factory=list)
    acts: list = field(default_factory=list)
    ins: object = None
    present: list = field(default_factory=list)
    shot: str = ""
    motion: str = ""


@dataclass
class SceneDef:
    desc: str
    theme: str
    night: bool
    rain: bool
    cast: list = field(default_factory=list)
    snow: bool = False
    fog: bool = False
    dusk: bool = False
    fx: list = field(default_factory=list)
    place_t: object = None


@dataclass
class Script:
    title: str = ""
    subtitle: str = ""
    lang: str = "vi"
    era: str = "modern"
    chars: dict = field(default_factory=dict)
    scenes: list = field(default_factory=list)
    lines: list = field(default_factory=list)


def _scene_header(s):
    m = re.match(r"^\[\s*(?:cảnh|canh|scene|bối cảnh|setting)\s*[:：]?\s*(.*?)\s*\]$", s, re.I)
    if m:
        return m.group(1)
    m = re.match(r"^@(?:scene|canh|cảnh)\s+(.*)$", s, re.I)
    if m:
        return m.group(1)
    m = re.match(r"^-{3,}\s*(.+?)\s*-{0,}$", s)
    if m:
        return m.group(1)
    m = re.match(r"^\[\s*((?:INT|EXT)\.?[^\]]*)\]$", s, re.I)
    return m.group(1) if m else None


_ZH_SAY = re.compile("(?:(?:笑|哭|怒|叹|大声|轻声|低声|小声|高兴地|生气地|着急地|惊讶地|平静地)(?:着|道|地)?)?(?:回答道|回答|说道|问道|答道|喊道|叫道|笑道|怒道|叹道|说|问|答|喊|叫|道)$")
_ZH_PRON = {"他", "她", "它", "我", "你", "他们", "她们", "它们", "我们", "你们", "咱们", "大家", "他俩", "她俩"}


def _zh_speaker(name):
    """Ten nguoi noi trong cau tieng Trung kieu "老人笑着说：" -> "老人". Dai tu (他 / 她 / 我...) -> "" (khong phai ten nhan vat: ca dong doc nhu loi dan)."""
    n = _ZH_SAY.sub("", name).strip()
    n = n or name
    return "" if n in _ZH_PRON else n


DLG = re.compile(r"^([^:：\[\(\n]{1,40}?)\s*(?:[\(\[]([^\)\]]{1,30})[\)\]])?\s*[:：]\s*(.+)$")


def parse_script(text, lang="auto"):
    sc = Script()
    text = text.replace("﻿", "").replace("\r", "")
    declared = {}
    era_forced = None
    cast_decl, text = take_cast(text)           # 'Nhan vat: A, B' -> khai bao nhan vat that (khong doc len, khong thanh nguoi noi ten 'Nhan vat')
    raw = [l.strip() for l in text.split("\n")]
    # pass 1: khai bao nhan vat de nhan ten dung
    for nm_, at_ in cast_decl:
        declared.setdefault(nm_, at_)
    for l in raw:
        m = re.match(r"^@char\s+([^:：]+?)\s*[:：]\s*(.*)$", l, re.I) or re.match(r"^@char\s+(\S.*)$", l, re.I)
        if m:
            nm = m.group(1).strip()
            declared[nm] = m.group(2).strip() if m.lastindex and m.lastindex >= 2 else ""
    auto_i = [0]
    hist_ = any(k in text.lower() for k in _HIST_MARK)

    def get_char(name):
        if name in sc.chars:
            return sc.chars[name]
        attrs = declared.get(name, "")
        g, a = guess_look(name, attrs)
        if g is None:
            g = name_gender(name, text, hist_)
        if g is None:
            g = "m" if auto_i[0] % 2 == 0 else "f"
            auto_i[0] += 1
        sc.chars[name] = Character(name, g, a, look_seed=name, attrs=attrs)
        return sc.chars[name]

    for nm in declared:
        get_char(nm)
    cur_scene = None

    def new_scene(desc, cast=None, fx=None):
        th, night, rain = guess_scene(desc)
        snow, fog, dusk = guess_weather(desc)
        sc.scenes.append(SceneDef(desc, th, night, rain, cast or [], snow, fog, dusk, list(fx or [])))
        return len(sc.scenes) - 1

    pending_fx = []
    for l in raw:
        if not l or l.startswith("#") or l.startswith("//"):
            continue
        if not l.startswith("@"):
            l, fx_ = take_fx(l)
            if not l:
                pending_fx += fx_
                continue
        else:
            fx_ = []
        m = re.match(r"^@title\s+(.*)$", l, re.I)
        if m:
            parts = [p.strip() for p in m.group(1).split("|")]
            sc.title, sc.subtitle = parts[0], (parts[1] if len(parts) > 1 else "")
            continue
        m = re.match(r"^@lang\s+(\w+)", l, re.I)
        if m:
            lang = m.group(1).lower()[:2]
            continue
        m = re.match(r"^@(?:era|thoi ?dai|thời ?đại)\s+(\S+)", l, re.I)
        if m:
            v = m.group(1).lower()
            era_forced = ("imperial" if v.startswith(("imp", "phong", "dyn", "cung", "triều", "royal")) else
                          "ancient" if v.startswith(("anc", "cổ", "co", "cod", "ngu", "nguy", "pre", "tiền", "tien", "cave", "prim", "stone")) else
                          "war" if v.startswith(("war", "chi", "chiến")) else "modern")
            continue
        if re.match(r"^@char\b", l, re.I):
            continue
        hd = _scene_header(l)
        if hd is not None:
            desc, _, cast = hd.partition("|")
            cur_scene = new_scene(desc.strip(), [c.strip() for c in cast.split(",") if c.strip()], fx_ + pending_fx)
            pending_fx = []
            for c in sc.scenes[cur_scene].cast:
                get_char(c)
            continue
        if cur_scene is None:
            cur_scene = new_scene("")
        m = DLG.match(l)
        if m:
            name, emo, body = m.group(1).strip(), (m.group(2) or "").strip().lower(), m.group(3).strip()
            if re.search("[\u4e00-\u9fff]", name) and name not in sc.chars and name.lower() not in NARRATORS:
                name = _zh_speaker(name)          # "老人笑着说：..." -> nhan vat "老人" (bo dong tu noi); "他说：..." (dai tu) -> khong phai ten nguoi
            words = name.split()
            uncased = name[:1].isalpha() and not name[:1].islower() and not name[:1].isupper() and len(name) <= 12          # chu Han / Nhat / Han / Thai...: khong co chu hoa
            ok = (bool(name) and len(words) <= 4 and not re.search(r"[.,!?;…。，、！？；]", re.sub(r"\b(Mr|Mrs|Ms|Dr|Sgt|Capt|Col|Lt|Gen)\.", r"\1", name))
                  and (name in sc.chars or name.lower() in NARRATORS or name[:1].isupper() or name.isupper() or uncased))
            if ok:
                spk = "" if name.lower() in NARRATORS else name
                if spk:
                    get_char(spk)
                    if spk not in sc.scenes[cur_scene].cast:
                        sc.scenes[cur_scene].cast.append(spk)
                e_ = EMO_MAP.get(emo) or (auto_emotion(body) if spk else "neutral")
                sc.lines.append(Line(spk, body, e_, cur_scene, fx_ + pending_fx))
                pending_fx = []
                continue
        sc.lines.append(Line("", l, "neutral", cur_scene, fx_ + pending_fx))
        pending_fx = []
    sc.lang = lang if langs.known(lang) else detect_lang(" ".join(l_.text for l_ in sc.lines) or text)          # chi xet loi doc (nhan "Dẫn:" / ten nhan vat khong tinh)
    sc.era = era_forced or detect_era(text)
    # bo canh rong
    used = {ln.scene for ln in sc.lines}
    if len(used) < len(sc.scenes):
        remap, new = {}, []
        for i, s in enumerate(sc.scenes):
            if i in used:
                remap[i] = len(new)
                new.append(s)
        sc.scenes = new
        for ln in sc.lines:
            ln.scene = remap[ln.scene]
    return sc
