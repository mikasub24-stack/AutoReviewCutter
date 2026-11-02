# -*- coding: utf-8 -*-
"""Tao nhan vat (va nen) theo phong cach sticker chibi cua bo mau, cho BAT KY truyen/kich ban nao.
Thu tu: (1) AI ve online -> tach nen -> cache; (2) thu vien nhan vat mau gan nhat; (3) ve bang code (r2d)."""
import os, re, io, json, hashlib, urllib.request, urllib.parse, urllib.error, base64, random
import numpy as np
from PIL import Image
from . import ndi, langs
from .common import APP_DIR, DATA_DIR

LIB = os.path.join(APP_DIR, "characters")
CACHE = os.path.join(DATA_DIR, "cache", "chars")

STYLE = ("cute chibi sticker character, full body, standing, big round head with pure white face, thick uniform black outline, "
         "two simple black oval eyes, big open happy smile with red mouth, pink blush cheeks, white mitten hands, small body, "
         "flat colors, clean vector sticker illustration, plain pure white background, one single character only, no text, no shadow")
ERA_STYLE = {
    "modern": "cute simple sticker character, full body, big round head with pure WHITE blank face (NO skin tone, no nose, no shading), simple black oval dot eyes, big open red smile, thick black outline, simple small body with slim limbs, white mitten hands, plain modern everyday clothes or job outfit (shirt, tie, jacket, skirt), clean flat colors, vector sticker, plain white background, one character, no text, no frame, no border",
    "war": "cute chibi sticker character, full body, big round head with pure WHITE blank face, simple black oval eyes, big open red smile, thick black outline, small body, white mitten hands, detailed World War II era gear and clothes (olive uniform, helmets, leather, canvas bags), slightly grungy colors, plain white background, one character, no text, no frame, no border",
    "ancient": "cute chibi sticker character, full body, big round head, light skin, big happy laughing face with blush, thick brown-black outline, prehistoric stone age person: leopard-spot orange fur dress, fur trims, bone necklace, bone hair accessory, wild messy hair, wooden club or stone spear, fur boots, plain white background, no text, no frame, no border",
}
ERA_TXT = {"modern": "modern day", "ancient": "prehistoric stone age caveman era, animal fur clothes, leopard-spot fur, bone accessories, wild messy hair",
           "war": "World War II era 1940s, military or civilian clothes of the time", "imperial": "ancient East Asian imperial court"}
MOOD = {"act": "", "neutral": "happy smile", "happy": "laughing with eyes closed ^ ^, joyful pose", "sad": "sad crying face, tears, drooping pose",
        "angry": "angry face, furrowed brows, shouting open mouth, clenched fists", "scared": "terrified shocked face, trembling pose",
        "surprised": "surprised wide open mouth, hands on cheeks", "thinking": "thinking pose, hand on chin, tilted head", "whisper": "calm gentle smile"}
VAR = {"neutral": "neutral", "happy": "neutral", "whisper": "neutral", "thinking": "neutral", "sad": "sad", "angry": "angry", "scared": "scared", "surprised": "scared"}

ROLE_EN = [  # (tu khoa vi/en, mo ta trang phuc tieng Anh)
    (["bác sĩ", "doctor"], "doctor in white coat with stethoscope"), (["y tá", "nurse", "nữ y tá"], "nurse with white cap and red cross, clipboard"),
    (["giáo viên", "cô giáo", "thầy giáo", "teacher"], "teacher with pointer and book"), (["đầu bếp", "chef", "cook"], "chef with white hat, apron and pan"),
    (["cảnh sát", "police"], "police officer in navy uniform and cap"), (["công an"], "police officer in uniform"),
    (["nông dân", "farmer"], "farmer with straw hat, overalls and pitchfork"), (["thợ máy", "mechanic", "thợ sửa"], "mechanic in blue overalls with wrench"),
    (["công nhân", "worker", "xây dựng"], "construction worker with yellow helmet and orange vest"), (["lập trình", "programmer", "developer", "coder"], "programmer with glasses and hoodie and laptop"),
    (["shipper", "giao hàng", "delivery"], "delivery rider with yellow helmet and scooter"), (["học sinh", "sinh viên", "student"], "student with backpack"),
    (["doanh nhân", "giám đốc", "sếp", "boss", "businessman", "nhân viên", "office"], "office worker in white shirt and tie"),
    (["họa sĩ", "painter", "artist"], "painter with beret, palette and brush"), (["nhiếp ảnh", "photographer"], "photographer with camera"),
    (["ca sĩ", "guitar", "musician"], "musician with guitar"), (["pha chế", "barista"], "barista with apron and coffee cup"),
    (["phi công", "pilot"], "WWII pilot with leather jacket, aviator helmet and goggles"), (["sĩ quan", "chỉ huy", "officer", "commander", "captain", "tướng", "general"], "WWII army officer with peaked cap and binoculars"),
    (["lính", "soldier", "bộ đội", "private", "trooper", "infantry"], "WWII infantry soldier with olive helmet, backpack and rifle"),
    (["quân y", "medic"], "WWII combat medic with red cross helmet and medical bag"), (["liên lạc", "radio", "operator"], "WWII radio operator with headphones and radio set"),
    (["thợ săn", "hunter", "chiến binh", "warrior"], "caveman hunter with wooden spear, leopard fur skirt"), (["thủ lĩnh", "tộc trưởng", "chief"], "caveman chief with wooden club, beard, bone necklace, leopard fur"),
    (["pháp sư", "thầy cúng", "shaman"], "cave shaman with feather headdress, staff and bone necklace"),
    (["vua", "king", "hoàng đế", "emperor"], "ancient emperor with golden crown and robe"), (["hoàng hậu", "queen", "công chúa", "princess"], "ancient empress with ornate hair and silk dress"),
    (["quan ", "minister", "mandarin", "đại thần"], "ancient court official with hat and robe"),
    (["mẹ", "mother", "mom"], "mother"), (["bố", "ba ", "cha ", "father", "dad"], "father"),
]
LIB_ROLE = {  # tu khoa -> ten file thu vien (khong hau to .png)
    "bác sĩ": "job_bac_si", "doctor": "job_bac_si", "y tá": "job_y_ta", "nurse": "job_y_ta", "giáo viên": "job_giao_vien", "cô giáo": "job_giao_vien", "teacher": "job_giao_vien",
    "đầu bếp": "job_dau_bep", "chef": "job_dau_bep", "cảnh sát": "job_canh_sat", "công an": "job_canh_sat", "police": "job_canh_sat", "nông dân": "job_nong_dan", "farmer": "job_nong_dan",
    "thợ máy": "job_tho_may", "mechanic": "job_tho_may", "công nhân": "job_tho_xay_dung", "worker": "job_tho_xay_dung", "lập trình": "job_lap_trinh_vien", "programmer": "job_lap_trinh_vien",
    "shipper": "job_shipper", "học sinh": "modern_hs_nu", "student": "job_hoc_sinh", "doanh nhân": "job_doanh_nhan", "giám đốc": "job_doanh_nhan", "boss": "job_doanh_nhan",
    "họa sĩ": "job_hoa_si", "nhiếp ảnh": "job_nhiep_anh", "guitar": "job_nghe_si_guitar", "pha chế": "job_barista",
    "phi công": "war_phi_cong", "pilot": "war_phi_cong", "sĩ quan": "war_si_quan", "officer": "war_si_quan", "chỉ huy": "war_si_quan", "tướng": "war_si_quan", "lính": "war_linh_bo_binh", "soldier": "war_linh_bo_binh",
    "bộ đội": "war_linh_bo_binh", "y tá": "war_nu_y_ta", "nurse": "war_nu_y_ta", "quân y": "war_quan_y", "medic": "war_quan_y", "liên lạc": "war_lien_lac_vo_tuyen", "radio": "war_lien_lac_vo_tuyen",
    "thợ săn": "stone_thanh_nien_nam", "hunter": "stone_thanh_nien_nam", "chiến binh": "stone_dan_ong", "warrior": "stone_dan_ong", "thủ lĩnh": "stone_dan_ong", "chief": "stone_dan_ong", "tộc trưởng": "stone_ong_lao", "pháp sư": "stone_ong_lao", "shaman": "stone_ong_lao",
}
# (era, gender, age) -> danh sach file mac dinh
LIB_DEF = {
    ("modern", "m", "adult"): ["modern_nam_cong_so", "modern_thanh_nien_balo", "modern_thanh_nien_hoodie", "job_doanh_nhan"], ("modern", "f", "adult"): ["modern_nu_cong_so", "modern_co_gai", "job_giao_vien"],
    ("modern", "m", "old"): ["modern_ong_kinh"], ("modern", "f", "old"): ["modern_ba_cu"], ("modern", "m", "child"): ["modern_be_trai_va_be_gai"], ("modern", "f", "child"): ["modern_be_trai_va_be_gai"],
    ("war", "m", "adult"): ["war_linh_bo_binh", "war_lien_lac_ngam", "war_tho_sua_chua"], ("war", "f", "adult"): ["war_nguoi_me", "war_cong_nhan_nu", "war_nu_y_ta"],
    ("war", "m", "old"): ["war_ong_cu"], ("war", "f", "old"): ["war_nguoi_me"], ("war", "m", "child"): ["war_tre_so_tan"], ("war", "f", "child"): ["war_tre_so_tan"],
    ("ancient", "m", "adult"): ["stone_dan_ong", "stone_thanh_nien_nam"], ("ancient", "f", "adult"): ["stone_phu_nu", "stone_thanh_nien_nu"],
    ("ancient", "m", "old"): ["stone_ong_lao"], ("ancient", "f", "old"): ["stone_ba_lao"], ("ancient", "m", "child"): ["stone_be_trai"], ("ancient", "f", "child"): ["stone_be_gai_va_em_be"],
}


PTPL = [("", "")]   # mau prompt (tab Ve ra): (tieng Viet, tieng Anh) them vao CUOI prompt moi khung; ("", "") = khong them (du an cu giu nguyen)
ART = ["sticker"]    # phong cach ve: "2d" (nhan vat 2D hoat hinh) | "stick" (nguoi que) | "sticker" (chibi sticker cu - du an cu)
STICK_STYLE = ("simple STICK FIGURE character, full body, standing, plain white round head with two small black dot eyes and a small line mouth, "
               "body, arms and legs drawn as thin uniform black lines, no fingers, minimal, flat 2D, clean vector, plain pure white background, one single character only, no text, no shadow")
DD_STYLE = ("CINEMATIC 2D illustrated cartoon character, full body, standing, detailed expressive face with eyes nose and mouth, bold outlines, rich colours with cinematic lighting and soft shading, "
            "dramatic animated-film / graphic-novel look (NOT 3D, NOT photorealistic, NOT chibi sticker), plain pure white background, one single character only, no text, no frame")
STYLE_LOCK = {
    "stick": " STYLE LOCK: STICK FIGURE only (round head, line body and limbs), no skin shading, no realistic details, no clothes drawn as detailed art; accessories/outfit hints only as simple shapes on the stick body.",
    "2d": " STYLE LOCK: cinematic 2D illustrated cartoon character (bold outlines, rich colours, cinematic lighting); NOT 3D, NOT photorealistic, NOT chibi sticker, NOT stick figure.",
}
FRAME_STYLE = {
    "stick": ("PHONG CÁCH BẮT BUỘC: nhân vật là NGƯỜI QUE đơn giản y hệt ảnh đính kèm (đầu tròn, thân và tay chân là nét thẳng), không đổ bóng nhân vật; nền và đồ vật vẽ phẳng, gọn, viền đậm, cùng một kiểu minh họa 2D. ",
              "REQUIRED STYLE: characters are simple STICK FIGURES exactly like the attached image (round head, line body and limbs), no shading on characters; background and props in clean flat 2D illustration with bold outlines, one consistent look. "),
    "2d": ("PHONG CÁCH BẮT BUỘC: 2D điện ảnh — nhân vật vẽ ĐÚNG như ảnh đính kèm (cùng khuôn mặt, tỉ lệ, nét viền, cách tô màu, ánh sáng); nền và đồ vật cùng kiểu 2D điện ảnh đó, KHÔNG thực tế như ảnh chụp, KHÔNG 3D, KHÔNG người que. ",
           "REQUIRED STYLE: cinematic 2D — characters drawn EXACTLY like the attached images (same face, proportions, outline, colouring, lighting); background and props in the same cinematic 2D look, NOT photo-realistic, NOT 3D, NOT stick figures. "),
}


# KHOA THE LOAI: moi thoi dai co bo nhan dang rieng (do, vat dung, kien truc) va LIET KE nhung thu cam xuat hien -> khung khong troi sang thoi khac
ERA_LOCK = {
    "modern": ("KHÓA THỂ LOẠI HIỆN ĐẠI: trang phục, nhà cửa, xe cộ, đồ vật theo đời sống hiện đại. TUYỆT ĐỐI không có yếu tố người nguyên thủy/hang động, thời chiến tranh, cung đình/cổ trang hay giả tưởng. ",
               "GENRE LOCK = MODERN: modern-day clothes, buildings, vehicles and objects. ABSOLUTELY NO prehistoric/cave people, wartime/military-1940s, ancient-palace or fantasy elements. "),
    "war": ("KHÓA THỂ LOẠI CHIẾN TRANH: bối cảnh chiến tranh thế giới thứ hai thập niên 1940 — quân phục, mũ sắt, vũ khí, xe quân sự, nhà cửa thời đó, màu hơi xám bụi. TUYỆT ĐỐI không có công nghệ hiện đại (điện thoại, máy tính), không người nguyên thủy, không cổ trang. ",
            "GENRE LOCK = WAR: World War II 1940s — period uniforms, helmets, weapons, military vehicles, period buildings, slightly dusty grey palette. ABSOLUTELY NO modern tech (phones, computers), no prehistoric people, no ancient costumes. "),
    "ancient": ("KHÓA THỂ LOẠI NGƯỜI NGUYÊN THỦY: thời tiền sử — váy/áo da thú, vũ khí đá và gậy gỗ, hang động, lửa trại, thú rừng (voi ma mút...), thiên nhiên hoang dã. TUYỆT ĐỐI không có đồ kim loại, nhà xây, đồ điện, chữ viết hiện đại. ",
                "GENRE LOCK = PREHISTORIC: stone age — animal-fur clothes, stone and wooden tools, caves, campfire, wild animals (mammoths...), untouched wilderness. ABSOLUTELY NO metal objects, built houses, electric devices or modern writing. "),
    "imperial": ("KHÓA THỂ LOẠI CUNG ĐÌNH: phương Đông cổ — trang phục triều đình, cung điện, đồ gỗ sơn son. Không có công nghệ hiện đại. ",
                 "GENRE LOCK = IMPERIAL: ancient East Asian court — court costumes, palaces, lacquered wood. No modern technology. "),
}


def _char_style(era):
    if ART[0] == "stick":
        return STICK_STYLE
    if ART[0] == "2d":
        return DD_STYLE
    return ERA_STYLE.get(era, STYLE)


SALT = [""]          # doi khi "tao lai tu dau": moi khoa cache khac -> ve lai het, khong dung anh cu


def _hash(*a):
    if SALT[0]:
        a = (SALT[0],) + tuple(a)
    return hashlib.md5("|".join(map(str, a)).encode("utf-8")).hexdigest()[:16]


def role_text(name, attrs):
    s = " " + (name + " " + attrs).lower() + " "
    for kws, en in ROLE_EN:
        if any(k in s for k in kws):
            return en
    return ""


# ---- MOI NHAN VAT MOT KIEU RIENG (tranh cac nhan vat Flow ve giong het nhau): moi nhan vat duoc gan 1 "dau an" khac nhau trong cung truyen (toc, mau ao, phu kien, dang nguoi)
DIVERSE = [False]
SIG = {}            # ten nhan vat -> doan mo ta them vao prompt ve nhan vat (chi khi DIVERSE)
_HAIR = {"m": ["short neat black hair", "messy curly dark-brown hair", "spiky black hair", "side-parted slicked-back hair", "buzz cut", "long hair tied in a small ponytail", "puffy afro hair",
               "bald head with a thick moustache", "wavy light-brown hair", "crew cut with sideburns"],
         "f": ["long straight black hair", "ponytail tied with a ribbon", "short bob cut with bangs", "two buns on top of the head", "twin braids", "long wavy brown hair", "short pixie cut",
               "high bun", "curly shoulder-length hair", "half-up hair with a hairclip"],
         "mo": ["bald head with a white beard", "combed-back white hair", "thin grey hair with a moustache"], "fo": ["grey hair in a bun", "short curly white hair", "long white hair in a braid"]}
_COLORS = ["red", "royal blue", "sunny yellow", "emerald green", "purple", "orange", "teal", "hot pink", "brown", "navy blue", "maroon", "olive green"]
_COLORS_OLD = ["leopard-spot orange", "dark brown", "grey", "dark red", "tan", "moss green"]
_GARMENT = {"m": ["shirt", "hoodie", "polo shirt", "sweater", "jacket"], "f": ["dress", "blouse", "sweater", "jacket", "tunic top"]}
_ACC = {"m": ["round glasses", "a baseball cap", "a scarf", "a small backpack", "a bow tie", "a wristwatch", "a beanie hat", "a necktie", "", "", ""],
        "f": ["round glasses", "a scarf", "a small backpack", "a headband", "a wristwatch", "big earrings", "a beanie hat", "a necklace", "", "", ""]}
_ACC_OLD = ["a bone necklace", "a feather headband", "a stone pendant", "", ""]
_BUILD = ["tall and slim", "short and a bit round", "average build", "tall with broad shoulders", "small and skinny", "slightly chubby"]
_GIVEN = {"hair": ("tóc", "hair", "hói", "bald", "đầu trọc", "râu", "beard"), "color": ("đỏ", "xanh", "vàng", "tím", "cam", "hồng", "nâu", "trắng", "đen", "xám", "red", "blue", "yellow", "green", "purple", "orange", "pink", "brown", "white", "black", "grey", "gray"),
          "acc": ("kính", "glasses", "mũ", "hat", "cap", "khăn", "scarf", "balo", "backpack", "nơ", "tie")}


def _pick_distinct(pool, name, tag, used):
    """Chon 1 phan tu cua pool khac cac nhan vat truoc (xoay vong neu het), cung ten -> luon cung ket qua."""
    start = int(hashlib.md5((tag + "|" + name).encode("utf-8")).hexdigest()[:8], 16) % len(pool)
    for k in range(len(pool)):
        i = (start + k) % len(pool)
        if i not in used:
            used.add(i)
            return pool[i]
    used.clear()
    used.add(start)
    return pool[start]


def assign_signatures(script):
    """Gan cho tung nhan vat cua truyen mot kieu rieng (toc, mau ao, phu kien, dang nguoi), khong trung nhau. Khong bat DIVERSE -> khong lam gi (du an cu giu nguyen anh da ve)."""
    SIG.clear()
    if not DIVERSE[0]:
        return
    era = getattr(script, "era", "modern")
    used = {"hair": set(), "color": set(), "acc": set(), "build": set()}
    chars = list(script.chars.items())
    for nm, ch in [c for c in chars if not getattr(c[1], "same_as", "")] + [c for c in chars if getattr(c[1], "same_as", "")]:
        base = getattr(ch, "same_as", "") or ""
        if base and base in SIG:                        # cung mot nguoi o tuoi khac: giu kieu cua ban goc
            SIG[nm] = SIG[base]
            continue
        low = " " + (nm + " " + (ch.attrs or "")).lower() + " "
        given = {k: any(w in low for w in ws) for k, ws in _GIVEN.items()}
        role = bool(role_text(nm, ch.attrs))
        parts = []
        old = ch.age == "old"
        if not given["hair"]:
            parts.append(_pick_distinct(_HAIR[(ch.gender if ch.gender in ("m", "f") else "m") + ("o" if old else "")], nm, "hair", used["hair"]))
        if era == "modern" and not role and not old and not given["color"]:
            c = _pick_distinct(_COLORS, nm, "color", used["color"])
            parts.append("wearing a %s %s" % (c, _GARMENT["f" if ch.gender == "f" else "m"][int(hashlib.md5(nm.encode("utf-8")).hexdigest()[:4], 16) % 5]))
        elif era == "ancient" and not given["color"]:
            parts.append("%s fur clothes" % _pick_distinct(_COLORS_OLD, nm, "color", used["color"]))
        if not given["acc"] and not role and era in ("modern", "ancient"):
            a = _pick_distinct(_ACC["f" if ch.gender == "f" else "m"] if era == "modern" else _ACC_OLD, nm, "acc", used["acc"])
            if a:
                parts.append("with " + a)
        if ch.age == "child":
            parts.append("small child proportions")
        else:
            parts.append(_pick_distinct(_BUILD, nm, "build", used["build"]) + " body")
        SIG[nm] = "DISTINCT LOOK (must differ clearly from the other characters of this story): " + ", ".join(parts)


def build_prompt(name, ch, era, mood="neutral"):
    role = role_text(name, ch.attrs)
    g = "girl/woman" if ch.gender == "f" else "boy/man"
    age = {"child": "small child", "old": "elderly grandfather/grandmother with white or grey hair"}.get(ch.age, "adult")
    extra = ch.attrs if not role else ""
    parts = [_char_style(era), f"{age} {g}", role or "", extra if re.search(r"[A-Za-z]", extra or "") else "", SIG.get(name, "") if DIVERSE[0] else "", ERA_TXT.get(era, ""), MOOD.get(mood, MOOD["neutral"])]
    if ART[0] in ("2d", "stick") and era in ERA_LOCK:
        parts.append(ERA_LOCK[era][1])
    return ", ".join(p for p in parts if p)


# ------------------------------------------------------------ tach nen
def cutout(im, thr=34):
    a = np.asarray(im.convert("RGB")).astype(int)
    bg = np.median(np.concatenate([a[:4].reshape(-1, 3), a[-4:].reshape(-1, 3), a[:, :4].reshape(-1, 3), a[:, -4:].reshape(-1, 3)]), axis=0)
    near = np.abs(a - bg).max(axis=2) < thr
    lab, n = ndi.label(near)
    border = set(np.unique(np.concatenate([lab[0], lab[-1], lab[:, 0], lab[:, -1]]))) - {0}
    fg = ~np.isin(lab, list(border))
    fg = ndi.binary_opening(fg, iterations=1)
    lab, n = ndi.label(ndi.binary_dilation(fg, iterations=3))
    if n == 0:
        return None
    sz = np.bincount(lab.ravel()); sz[0] = 0
    fg &= (lab == sz.argmax())
    ys, xs = np.where(fg)
    if len(ys) < 2000:
        return None
    x0, x1, y0, y1 = xs.min(), xs.max() + 1, ys.min(), ys.max() + 1
    al = ndi.gaussian_filter(fg[y0:y1, x0:x1].astype(float), 0.8)
    return Image.fromarray(np.dstack([a[y0:y1, x0:x1].astype(np.uint8), (np.clip(al * 1.4, 0, 1) * 255).astype(np.uint8)]), "RGBA")


# ------------------------------------------------------------ nguon AI online
def _get(url, timeout=120, headers=None):
    req = urllib.request.Request(url, headers=dict({"User-Agent": "AnimStudio"}, **(headers or {})))
    with urllib.request.urlopen(req, timeout=timeout) as r:
        return r.read()


def _multipart(fields, files):
    bd = "----AnimStudio" + os.urandom(8).hex(); out = b""
    for k, v in fields.items():
        out += f"--{bd}\r\nContent-Disposition: form-data; name=\"{k}\"\r\n\r\n{v}\r\n".encode()
    for k, (fn, data) in files.items():
        out += f"--{bd}\r\nContent-Disposition: form-data; name=\"{k}\"; filename=\"{fn}\"\r\nContent-Type: image/png\r\n\r\n".encode() + data + b"\r\n"
    return out + f"--{bd}--\r\n".encode(), "multipart/form-data; boundary=" + bd


def _gemini(prompt, cfg, ref_path=None, aspect=None):
    """Google Gemini 'Nano Banana' (generateContent). Co anh mau -> ve nhan vat moi cung phong cach."""
    model = cfg.get("img_model") or "gemini-2.5-flash-image"
    if model.startswith("gpt") or model.startswith("dall"):
        model = "gemini-2.5-flash-image"
    parts = [{"text": prompt}]
    if ref_path:
        parts.append({"inline_data": {"mime_type": "image/png", "data": base64.b64encode(open(ref_path, "rb").read()).decode()}})
    gc = {"responseModalities": ["IMAGE"]}
    if aspect in ("16:9", "9:16", "1:1", "4:3", "3:4"):
        gc["imageConfig"] = {"aspectRatio": aspect}
    body = json.dumps({"contents": [{"parts": parts}], "generationConfig": gc}).encode()
    url = f"https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent"
    req = urllib.request.Request(url, body, {"Content-Type": "application/json", "x-goog-api-key": cfg.get("img_key", "")})
    try:
        d = json.loads(urllib.request.urlopen(req, timeout=240).read().decode())
    except urllib.error.HTTPError as e:
        raise RuntimeError("Gemini HTTP %s: %s" % (e.code, e.read().decode("utf-8", "ignore")[:200]))
    for c in d.get("candidates", []):
        for pt in c.get("content", {}).get("parts", []):
            inl = pt.get("inlineData") or pt.get("inline_data")
            if inl and inl.get("data"):
                return Image.open(io.BytesIO(base64.b64decode(inl["data"]))).convert("RGB")
    raise RuntimeError("Gemini khong tra ve anh (co the het han muc mien phi / bi chan noi dung)")


def _fit_aspect(im, aspect, tol=0.04):
    """Anh Gemini web co the khong dung ti le khung yeu cau: khong cat noi dung, chi them vien cung mau nen (trung vi mau mep anh) cho du ti le."""
    try:
        a, b = [float(x) for x in str(aspect or "16:9").split(":")]
        tgt = a / b
    except Exception:
        return im
    w, h = im.size
    cur = w / float(h)
    if abs(cur - tgt) / tgt <= tol:
        return im
    arr = np.asarray(im.convert("RGB"))
    edge = np.concatenate([arr[0, :, :], arr[-1, :, :], arr[:, 0, :], arr[:, -1, :]], axis=0)
    col = tuple(int(v) for v in np.median(edge, axis=0))
    if cur < tgt:
        nw, nh = int(round(h * tgt)), h
    else:
        nw, nh = w, int(round(w / tgt))
    out = Image.new("RGB", (nw, nh), col)
    out.paste(im.convert("RGB"), ((nw - w) // 2, (nh - h) // 2))
    return out


_REF_Q = ("Image 1 is the REFERENCE character. Image 2 is a newly generated frame. Is the main character in Image 2 EXACTLY the same character as in Image 1: "
          "same head shape, face, hair, outfit, colours and body proportions? Ignore the pose, expression, camera angle, background, props, line thickness and image size. "
          "If the character is missing, redesigned, simplified, recoloured, or replaced by a stick figure or a different person, it is DIFFERENT. "
          "Reply on ONE line: SAME, or DIFFERENT: <what differs, max 15 words>.")


def _ref_same_many(frame_paths, ref_path, cfg):
    """Tab 'Ve ra': Gemini (TAB trinh duyet) NHIN anh tham chieu + tung khung va tra loi nhan vat trong khung co GIONG HET khong.
    -> list (ok, ly_do) cung thu tu. Loi / tra loi la -> (True, 'khong ...') de khong bao gio chan viec ve."""
    from . import flowgen
    jobs = [dict(kind="text", prompt=_REF_Q, files=[ref_path, fp]) for fp in frame_paths]
    try:
        res = flowgen.gemini_many(jobs, int(cfg.get("flow_tabs") or 1), cfg.get("browser", 0), log=cfg.get("log") or print, timeout=150)
    except Exception as e:
        if str(e) == "Đã dừng":
            raise
        return [(True, "không kiểm tra được (%s)" % str(e)[:80])] * len(frame_paths)
    out = []
    for r in res:
        if isinstance(r, Exception) or not str(r or "").strip():
            out.append((True, "không kiểm tra được (%s)" % (str(r)[:80] if r else "Gemini không trả lời")))
            continue
        txt = " ".join(str(r).split())
        m = re.search(r"\b(SAME|DIFFERENT)\b", txt, re.I)
        if not m:
            out.append((True, "không hiểu câu trả lời của AI kiểm tra"))
        elif m.group(1).upper() == "SAME":
            out.append((True, ""))
        else:
            tail = txt[m.end():].lstrip(" :-—")
            out.append((False, tail[:140] or "khác nhân vật gốc"))
    return out


def fetch_image(prompt, cfg, w=768, h=1024, seed=1, era=None, ref_path=None):
    b = cfg.get("img_backend", 0)
    if b == 4:       # Google Flow (Nano Banana) qua Chrome cua ban
        from . import flowgen
        vi = (cfg.get("lang") or "vi") == "vi"
        if ref_path:     # bien the (bieu cam / hanh dong / do tuoi khac): giu nguyen nhan vat da duoc duyet
            fr = ("Vẽ lại CHÍNH XÁC nhân vật trong ảnh đính kèm (cùng khuôn mặt, kiểu tóc, trang phục, màu sắc, tỉ lệ cơ thể, phong cách vẽ), chỉ thay đổi như mô tả bên dưới. Nền trắng trơn, một nhân vật, không chữ, không khung, không viền. " if vi else
                  "Redraw EXACTLY the same character as in the attached image (same face, hair, outfit, colours, proportions, art style), only change what is described. Plain white background, one character, no text, no frame, no border. ")
            return flowgen.generate(fr + prompt, ref=ref_path, aspect="3:4", browser=cfg.get("browser", 0))
        ref = os.path.join(LIB, "ref", (era or "") + ".png")
        has = bool(era) and os.path.exists(ref) and ART[0] == "sticker"
        lock = (" KHÓA PHONG CÁCH: kiểu sticker LINE đơn giản, khuôn mặt tròn TRẮNG trơn, hai chấm mắt đen hình bầu dục, miệng cười đỏ to, tay chân mảnh, bàn tay găng trắng, màu phẳng. KHÔNG vẽ kiểu anime/kawaii chi tiết, KHÔNG mặt màu da, không mũi, không lông mày." if vi else
                " STYLE LOCK: simple LINE-sticker look, perfectly WHITE blank round face with two plain black oval dot eyes and a big open red smile, thin simple limbs, white mitten hands, flat colours. It must NOT be a cute detailed anime/kawaii chibi, NOT skin-coloured face, no nose, no eyebrows shading, no realistic hair highlights.") if era == "modern" else ""
        if ART[0] in STYLE_LOCK:
            lock = STYLE_LOCK[ART[0]]
        if has:
            pr = (("Ảnh đính kèm CHỈ dùng làm mẫu PHONG CÁCH VẼ (tỉ lệ đầu–thân, độ dày nét viền, kiểu khuôn mặt, bàn tay găng, cách tô màu). KHÔNG sao chép các nhân vật trong ảnh. Hãy vẽ MỘT nhân vật HOÀN TOÀN MỚI như mô tả, nền trắng trơn, không chữ, không khung, không viền." if vi else
                   "The attached image only shows the ART STYLE to follow (chibi sticker: same head-to-body proportions, outline thickness, face design, mitten hands, rendering). Do NOT copy those characters. Draw ONE COMPLETELY NEW character as described, on a plain white background, no text, no frame, no border.") + lock + " " + prompt)
        else:
            pr = prompt + (lock if ART[0] in STYLE_LOCK else "")
        return flowgen.generate(pr, ref=ref if has else None, aspect="16:9" if w > h else "3:4", browser=cfg.get("browser", 0))
    if b == 3:
        ref = os.path.join(LIB, "ref", (era or "") + ".png")
        pr = ("Look at the reference sticker sheet and draw ONE NEW character in EXACTLY the same art style, proportions, outline thickness and face design. " + prompt) if era and os.path.exists(ref) else prompt
        return _gemini(pr, cfg, ref if era and os.path.exists(ref) else None)
    if b == 2 and era and os.path.exists(os.path.join(LIB, "ref", era + ".png")):
        # co anh mau: gui cho model sua anh -> ve nhan vat moi DUNG form bo mau
        base = (cfg.get("img_url") or "https://api.openai.com/v1").rstrip("/")
        ref = open(os.path.join(LIB, "ref", era + ".png"), "rb").read()
        pr = "Look at the reference sticker sheet. Draw ONE NEW character in EXACTLY the same art style, proportions, outline thickness, face design and rendering as the characters in the sheet. " + prompt
        body, ct = _multipart({"model": cfg.get("img_model") or "gpt-image-1", "prompt": pr, "size": "1024x1024", "n": "1"}, {"image[]": ("ref.png", ref)})
        req = urllib.request.Request(base + "/images/edits", body, {"Content-Type": ct, "Authorization": "Bearer " + cfg.get("img_key", "")})
        d = json.loads(urllib.request.urlopen(req, timeout=240).read().decode())["data"][0]
        data = base64.b64decode(d["b64_json"]) if d.get("b64_json") else _get(d["url"])
        return Image.open(io.BytesIO(data)).convert("RGB")
    if b == 1:       # Pollinations (mien phi, khong key)
        q = urllib.parse.quote(prompt)
        data = _get(f"https://image.pollinations.ai/prompt/{q}?width={w}&height={h}&seed={seed}&nologo=true&model=flux")
    elif b == 2:     # OpenAI tuong thich /images/generations
        base = (cfg.get("img_url") or "https://api.openai.com/v1").rstrip("/")
        body = json.dumps({"model": cfg.get("img_model") or "gpt-image-1", "prompt": prompt, "size": "1024x1024", "n": 1}).encode()
        req = urllib.request.Request(base + "/images/generations", body, {"Content-Type": "application/json", "Authorization": "Bearer " + cfg.get("img_key", "")})
        d = json.loads(urllib.request.urlopen(req, timeout=180).read().decode())["data"][0]
        data = base64.b64decode(d["b64_json"]) if d.get("b64_json") else _get(d["url"])
    else:
        raise RuntimeError("no image backend")
    return Image.open(io.BytesIO(data)).convert("RGB")


def _retrying(what, fn, skip=False):
    """Chay fn; loi -> tam dung hoi nguoi dung Thu lai (tiep tuc dung cho) thay vi huy ca job."""
    from . import resume
    while True:
        try:
            return fn()
        except Exception as e:
            if str(e) == "Đã dừng":
                raise
            r = resume.ask(what, e, skip, "flow")
            if r == "retry":
                continue
            if r == "skip":
                return None
            raise


def ai_character(name, ch, era, mood, cfg, log=print, base=None, extra="", label=None):
    return _retrying(f"Flow vẽ nhân vật {label or name}", lambda: _ai_character(name, ch, era, mood, cfg, log, base, extra, label))


def _ai_character(name, ch, era, mood, cfg, log=print, base=None, extra="", label=None):
    """Ve nhan vat moi theo form mau. mood != neutral -> dung anh neutral da duoc duyet lam goc de giu nguyen nhan vat. Loi -> RuntimeError (khong tu thay bang thu vien)."""
    redo = (cfg.get("redo") or {}).get(label or name, 0)
    key = _hash("v2", cfg.get("img_backend"), build_prompt(name, ch, era, mood), ch.look_seed or name, redo, extra)
    path = os.path.join(CACHE, key + ".png")
    raw = os.path.join(CACHE, key + "_raw.png")
    if os.path.exists(path):
        return path
    last = ""
    for attempt in range(3):
        try:
            seed = int(_hash(name, attempt, redo), 16) % 100000
            im = fetch_image(build_prompt(name, ch, era, mood) + (", " + extra if extra else ""), cfg, seed=seed, era=era, ref_path=base if mood != "neutral" else None)
            c = cutout(im)
            if c is None:
                last = "không tách được nền ảnh"
                continue
            os.makedirs(CACHE, exist_ok=True)
            im.save(raw)
            c.thumbnail((640, 900))
            c.save(path)
            return path
        except Exception as e:
            last = str(e)[:160]
            log(f"  AI vẽ '{name}' lỗi (lần {attempt + 1}): {last}")
    raise RuntimeError(f"Flow không vẽ được nhân vật '{name}': {last}")


def raw_of(path):
    r = path[:-4] + "_raw.png"
    return r if os.path.exists(r) else None


# ------------------------------------------------------------ thu vien mau
def vary(path, name, era, used_paths):
    """Cung mot mau thu vien nhung nhan vat khac nhau -> doi mau ao/quan (khong dong vao da, vien, toc den) de khong bi lap."""
    import colorsys
    key = _hash("var2", path, name)
    out = os.path.join(CACHE, "v_" + key + ".png")
    if os.path.exists(out):
        return out
    im = Image.open(path).convert("RGBA"); a = np.asarray(im).astype(np.float32) / 255
    mx, mn = a[..., :3].max(2), a[..., :3].min(2)
    sat = (mx - mn) / np.maximum(mx, 1e-3)
    r, g, b = a[..., 0], a[..., 1], a[..., 2]
    hue = np.zeros_like(mx)
    d = np.maximum(mx - mn, 1e-4)
    hue = np.where(mx == r, ((g - b) / d) % 6, np.where(mx == g, (b - r) / d + 2, (r - g) / d + 4)) / 6.0
    keep = (hue < 0.15) | (hue > 0.92)          # da, mieng do, go, nau, long -> giu nguyen
    mask = (sat > 0.28) & (mx > 0.25) & ~keep
    shift = ((int(key, 16) % 13) - 6) / 100.0 if era != "ancient" else 0.0
    if abs(shift) < 0.015:
        shift = 0.05
    if shift == 0.0:
        return path
    h2 = (hue + shift) % 1.0
    v = mx
    i = np.floor(h2 * 6).astype(int) % 6; f = h2 * 6 - np.floor(h2 * 6)
    p_, q_, t_ = v * (1 - sat), v * (1 - f * sat), v * (1 - (1 - f) * sat)
    rgb = np.stack([np.choose(i, [v, q_, p_, p_, t_, v]), np.choose(i, [t_, v, v, q_, p_, p_]), np.choose(i, [p_, p_, t_, v, v, q_])], -1)
    a[..., :3] = np.where(mask[..., None], rgb, a[..., :3])
    os.makedirs(CACHE, exist_ok=True)
    Image.fromarray((a * 255).astype(np.uint8), "RGBA").save(out)
    return out


def custom_variants(name):
    out = {}
    d = os.path.join(LIB, "custom")
    for v in ("sad", "angry", "scared"):
        for ext in (".png", ".jpg", ".jpeg", ".webp"):
            f = os.path.join(d, f"{name}_{v}{ext}")
            if os.path.exists(f):
                c = custom_pick(f"{name}_{v}", None)
                if c:
                    out[v] = c
    return out


def custom_pick(name, ch):
    """Anh ban tu tao (vd. bang Nano Banana tren web, mien phi) bo vao characters/custom/: ten file chua ten nhan vat hoac nghe."""
    d = os.path.join(LIB, "custom")
    if not os.path.isdir(d):
        return ""
    key = re.sub(r"[^a-z0-9]+", "", _ascii(name))
    for f in sorted(os.listdir(d)):
        if f.lower().endswith((".png", ".jpg", ".jpeg", ".webp")):
            fk = re.sub(r"[^a-z0-9]+", "", _ascii(os.path.splitext(f)[0]))
            if fk and (fk == key or (fk in key and "_" not in f) or (key in fk and not re.search(r"(sad|angry|scared)$", fk))):
                out = os.path.join(CACHE, "c_" + _hash(f, os.path.getmtime(os.path.join(d, f))) + ".png")
                if not os.path.exists(out):
                    im = Image.open(os.path.join(d, f))
                    c = im if (im.mode == "RGBA" and im.getchannel("A").getextrema()[0] < 250) else cutout(im)
                    if c is None:
                        continue
                    os.makedirs(CACHE, exist_ok=True); c.thumbnail((640, 900)); c.save(out)
                return out
    return ""


def _ascii(s):
    import unicodedata
    return unicodedata.normalize("NFD", s.lower().replace("đ", "d")).encode("ascii", "ignore").decode()


def lib_pick(name, ch, era, used):
    s = " " + (name + " " + ch.attrs).lower() + " "
    for kw, f in LIB_ROLE.items():
        if kw in s and os.path.exists(os.path.join(LIB, f + ".png")) and f not in used:
            if (era == "war" and f.startswith(("stone", "job"))) or (era == "ancient" and not f.startswith("stone")):
                continue
            used.add(f)
            return os.path.join(LIB, f + ".png")
    cand = LIB_DEF.get((era if era in ("modern", "war", "ancient") else "modern", ch.gender, ch.age), []) or LIB_DEF[("modern", ch.gender, "adult")]
    cand = [c for c in cand if os.path.exists(os.path.join(LIB, c + ".png"))]
    if not cand:
        return ""
    free = [c for c in cand if c not in used] or cand
    i = int(_hash(name), 16) % len(free)
    used.add(free[i])
    return os.path.join(LIB, free[i] + ".png")


# ------------------------------------------------------------ dieu phoi
def _ensure_base(script):
    """Neu truyen khong co nhan vat (chi loi dan): tu suy ra nhan vat tu mo ta de van co hinh."""
    if script.chars:
        return
    from .script import Character
    era = script.era
    txt = " ".join(l.text for l in script.lines) + " " + " ".join(s.desc for s in script.scenes)
    found = []
    for kws, en in ROLE_EN:
        for k in kws:
            if k.strip() and k in " " + txt.lower() + " " and k.strip() not in ("mẹ", "bố", "ba", "cha", "vua", "quan"):
                found.append(k.strip()); break
    base = {"ancient": ["Thợ săn", "Phụ nữ"], "war": ["Lính", "Y tá"], "imperial": ["Quan", "Dân"], "modern": ["Anh", "Cô"]}.get(era, ["Anh", "Cô"])
    names = (found[:2] + base)[:2] if found else base
    for i, n in enumerate(names):
        n = n[:1].upper() + n[1:]
        if n in script.chars:
            n += " " + str(i + 1)
        fem = any(k in n.lower() for k in ("y tá", "phụ nữ", "cô", "bà", "chị", "nurse", "woman", "girl", "mẹ"))
        script.chars[n] = Character(n, "f" if (fem or (i == 1 and n in ("Cô", "Phụ nữ"))) else "m", "adult", look_seed=n, attrs=n)
    for sd in script.scenes:
        if not sd.cast:
            lt = " " + (sd.desc + " " + " ".join(l.text for l in script.lines if script.scenes.index(sd) == l.scene)).lower() + " "
            hit = [n for n in script.chars if " " + n.lower() in lt.replace(",", " ").replace(".", " ")]
            prev = script.scenes[script.scenes.index(sd) - 1].cast if script.scenes.index(sd) else []
            sd.cast = hit or list(prev) or list(script.chars)
    return


CTX = {}


def ensure_cast(script, beats=True):
    """Nhan vat chinh (neu thieu) + nhan vat phu theo loi ke + gan nguoi vao canh + ke hoach hanh dong.
    beats=False (tab 'Ve ra'): GIU NGUYEN cac dong da gom thanh canh, khong tach lai moi cau thanh mot nhip."""
    from . import actions
    try:
        if beats:
            actions.split_beats(script)
    except Exception as e:
        print("beats:", e)
    try:
        from .script import Character
        for nm, g in actions.infer_names(script):
            script.chars[nm] = Character(nm, g, "adult", look_seed=nm, attrs=nm)
    except Exception as e:
        print("names:", e)
    _ensure_base(script)
    try:
        actions.fix_genders(script)
        actions.extras(script)
        actions.add_named_to_scenes(script)
        prev = []
        for sd in script.scenes:
            if not sd.cast:
                sd.cast = list(prev) or list(script.chars)[:2]
            prev = sd.cast
        actions.plan(script)
    except Exception as e:      # khong de loi phu lam hong ca job
        print("actions:", e)


def prepare_characters(script, cfg=None, log=print):
    """Tra ve {ten: {'neutral': path, 'sad': path,...}}. Co AI/Flow: ve MOI tung nhan vat (loi -> RuntimeError); co buoc duyet. Khong AI: anh tu bo vao characters/custom, roi thu vien mau."""
    cfg = cfg or {}
    era = script.era
    assign_signatures(script)
    out, used, used_paths = {}, set(), set()
    emos_used = {}
    for ln in script.lines:
        if ln.speaker:
            emos_used.setdefault(ln.speaker, set()).add(VAR.get(ln.emotion, "neutral"))
    use_ai = bool(cfg.get("img_backend"))
    if use_ai:
        rounds = 0
        while True:
            for nm, ch in script.chars.items():
                d = out.setdefault(nm, {})
                if "neutral" in d:
                    continue
                base_nm = getattr(ch, "same_as", "") or ""
                if base_nm and base_nm in script.chars and base_nm != nm:
                    if "neutral" not in out.setdefault(base_nm, {}):
                        log(f"Flow đang vẽ nhân vật mới: {base_nm}…")
                        out[base_nm]["neutral"] = ai_character(base_nm, script.chars[base_nm], era, "neutral", cfg, log)
                    vi = (cfg.get("lang") or "vi") == "vi"
                    ex = (f"Cùng MỘT người với nhân vật trong ảnh nhưng ở độ tuổi/giai đoạn khác: {ch.attrs}. Giữ nét đặc trưng (kiểu tóc, màu chủ đạo, phụ kiện) để nhận ra là cùng một người." if vi else
                          f"The SAME person as in the image but at a different age/stage: {ch.attrs}. Keep recognisable traits (hair style, main colours, accessories).")
                    log(f"Flow đang vẽ {nm} (cùng người với {base_nm})…")
                    d["neutral"] = ai_character(nm, ch, era, "act", cfg, log, base=raw_of(out[base_nm]["neutral"]), extra=ex, label=nm)
                    continue
                log(f"Flow đang vẽ nhân vật mới: {nm}…")
                d["neutral"] = ai_character(nm, ch, era, "neutral", cfg, log)
            rev = cfg.get("review")
            redo = rev({n: d["neutral"] for n, d in out.items()}) if rev else []
            rounds += 1
            if not redo or rounds > 6:
                break
            cfg.setdefault("redo", {})
            for n in redo:
                cfg["redo"][n] = cfg["redo"].get(n, 0) + 1
                out[n] = {}
        if cfg.get("variants", True):
            for nm, ch in script.chars.items():
                base = raw_of(out[nm]["neutral"])
                for v in sorted(emos_used.get(nm, set()) - {"neutral"}):
                    log(f"Flow đang vẽ biểu cảm {v} của {nm}…")
                    out[nm][v] = ai_character(nm, ch, era, v, cfg, log, base=base)
        if cfg.get("actions", True):
            from . import actions
            todo = actions.needed(script, int(cfg.get("max_actions", 9999)))
            rounds = 0
            while todo:
                for nm, key in todo:
                    en, _p = actions.KEYS[key]
                    tag = "act:" + key
                    if tag in out[nm]:
                        continue
                    log(f"Flow đang vẽ hành động '{key}' của {nm}…")
                    try:
                        ctx = CTX.get((nm, key), "")
                        vi = (cfg.get("lang") or "vi") == "vi"
                        if vi:
                            ex = ("Tư thế/hành động: " + en + (" (" + en + ")" if False else "") + (f". Khoảnh khắc truyện: \"{ctx[:200]}\"" if ctx else "") +
                                  ". Thấy rõ toàn thân, đôi tay và đạo cụ, giữ y nguyên trang phục và khuôn mặt, biểu cảm khớp với hành động.")
                        else:
                            ex = ("Pose/action: " + en + (f". Story moment: \"{ctx[:200]}\"" if ctx else "") + ". Full body, hands and prop clearly visible, keep exactly the same outfit and face, expression matching the action.")
                        out[nm][tag] = ai_character(nm, script.chars[nm], era, "act", cfg, log, base=raw_of(out[nm]["neutral"]), extra=ex, label=f"{nm} · {key}")
                    except Exception as e:
                        log(f"  bỏ qua hành động {key} của {nm}: {str(e)[:100]}")
                rev = cfg.get("review")
                shown = {f"{nm} · {key}": out[nm]["act:" + key] for nm, key in todo if "act:" + key in out[nm]}
                redo = rev(shown) if (rev and shown) else []
                rounds += 1
                if not redo or rounds > 4:
                    break
                cfg.setdefault("redo", {})
                for lab in redo:
                    cfg["redo"][lab] = cfg["redo"].get(lab, 0) + 1
                    nm, key = [x.strip() for x in lab.split("·")]
                    out[nm].pop("act:" + key, None)
        return out
    for nm, ch in script.chars.items():
        d = {}
        cp = custom_pick(nm, ch)
        if cp:
            d["neutral"] = cp
            d.update(custom_variants(nm))
        if "neutral" not in d and cfg.get("use_lib", True):
            p = lib_pick(nm, ch, era, used)
            if p:
                if p in used_paths:
                    p = vary(p, nm, era, used_paths)
                used_paths.add(p)
                d["neutral"] = p
        if d:
            out[nm] = d
    return out


# (ten hien thi, tu khoa, mo ta tieng Anh, trong nha?) -- thu tu = do uu tien khi hoa diem
LOCS = {
    "modern": [
        ("văn phòng", ["văn phòng", "công ty", "đồng nghiệp", "sếp", "họp", "cuộc họp", "office", "meeting room", "coworker", "boss", "deadline", "nhân viên"], "a modern open-plan office interior: rows of desks with computers, office chairs, big windows, shelves, a meeting table", 1),
        ("lớp học", ["lớp học", "trường", "thầy", "cô giáo", "giáo viên", "học sinh", "bảng đen", "giờ học", "sân trường", "school", "classroom", "teacher", "student", "lecture"], "a school classroom interior: blackboard, rows of wooden desks and chairs, windows, bookshelves, a teacher's desk", 1),
        ("quán cà phê", ["quán cà phê", "cà phê", "cafe", "café", "barista", "trà sữa", "coffee", "tiệm bánh", "bakery"], "a cozy coffee shop interior: counter with espresso machine, menu board, small tables and chairs, pendant lamps, pastry display", 1),
        ("bệnh viện", ["bệnh viện", "phòng khám", "phẫu thuật", "cấp cứu", "hospital", "clinic", "emergency room", "ward"], "a hospital corridor and patient ward interior: beds, white walls, medical equipment, signs", 1),
        ("nhà bếp", ["nhà bếp", "bếp", "nấu ăn", "kitchen", "cooking", "nấu cơm"], "a home kitchen interior: counter, stove, fridge, cabinets, dining table", 1),
        ("phòng ngủ", ["phòng ngủ", "giường", "bedroom", "ngủ dậy", "thức dậy"], "a cozy bedroom interior: bed, wardrobe, desk, window with curtains", 1),
        ("phòng khách", ["phòng khách", "trong nhà", "về nhà", "ở nhà", "sofa", "living room", "at home", "căn hộ", "apartment", "phòng trọ"], "a cozy living room interior: sofa, coffee table, TV, bookshelf, window", 1),
        ("nhà hàng", ["nhà hàng", "quán ăn", "bữa tối", "restaurant", "dinner", "buffet", "quán nhậu"], "a restaurant interior: set tables, chairs, warm lights, a kitchen pass-through", 1),
        ("ga tàu", ["nhà ga", "sân ga", "ga tàu", "tàu hỏa", "train station", "platform", "metro", "tàu điện"], "a train station platform: tracks, benches, departure board, pillars, a train", 0),
        ("sân bay", ["sân bay", "máy bay", "airport", "terminal", "check-in"], "an airport terminal interior: big windows with planes, check-in counters, seats", 1),
        ("siêu thị", ["siêu thị", "cửa hàng", "chợ", "mua sắm", "supermarket", "store", "shop", "market", "mall", "trung tâm thương mại"], "a supermarket interior: shelves of goods, shopping carts, checkout counters", 1),
        ("thư viện", ["thư viện", "library"], "a quiet library interior: tall bookshelves, reading tables, lamps", 1),
        ("phòng tập", ["phòng gym", "tập gym", "phòng tập", "gym", "fitness"], "a gym interior: weights, treadmills, mirrors", 1),
        ("sân thượng", ["sân thượng", "mái nhà", "rooftop"], "a city rooftop terrace at the edge of tall buildings, railings, water tank, skyline", 0),
        ("bãi biển", ["bãi biển", "biển", "bờ biển", "beach", "sea", "ocean"], "a sunny beach with sand, waves, palm trees and a horizon", 0),
        ("rừng", ["khu rừng", "rừng", "forest", "woods", "cắm trại", "camping"], "a lush forest with tall trees, a dirt path and bushes", 0),
        ("núi", ["núi", "đồi", "mountain", "hill", "đỉnh"], "green mountains and hills with a winding path, blue sky", 0),
        ("công viên", ["công viên", "park", "vườn", "garden", "sân chơi", "playground"], "a city park with trees, benches, a path, lawn and flowers", 0),
        ("đường phố", ["đường phố", "ngoài đường", "vỉa hè", "ngã tư", "phố", "street", "sidewalk", "crosswalk", "bus stop", "trạm xe buýt", "đường"], "a busy city street: buildings on both sides, sidewalk, road with crosswalk, traffic lights, shops", 0),
    ],
    "war": [
        ("chiến hào", ["chiến hào", "trench", "hố", "tuyến đầu", "mặt trận", "front line"], "a World War II trench with sandbags, barbed wire, mud, and smoky sky", 0),
        ("hầm chỉ huy", ["hầm", "bunker", "sở chỉ huy", "command", "bản đồ", "phòng chỉ huy"], "a WWII underground command bunker interior: wooden table with maps, lamp, radio, sandbag walls", 1),
        ("bệnh xá", ["bệnh xá", "quân y", "y tá", "trạm cứu thương", "field hospital", "nurse", "medic", "thương binh"], "a WWII field hospital tent interior: cots, red cross supplies, lanterns", 1),
        ("sân bay", ["sân bay", "phi công", "airfield", "pilot", "máy bay"], "a WWII airfield: runway, hangar, propeller planes, wind sock", 0),
        ("ga tàu", ["nhà ga", "ga tàu", "tàu hỏa", "station", "train"], "a WWII railway station with steam train, sandbags and posters", 0),
        ("làng cháy", ["ngôi làng", "làng", "village", "ngôi nhà cháy", "đổ nát", "ruins", "thị trấn"], "a ruined burned village with broken houses, smoke, rubble, bare trees", 0),
        ("rừng", ["rừng", "forest", "jungle", "bìa rừng"], "a dark war-time forest with fog, broken trees and a muddy path", 0),
        ("thành phố đổ nát", ["thành phố", "phố", "city", "street", "đường"], "a bombed city street: damaged buildings, rubble, barricades, smoke", 0),
        ("nhà", ["trong nhà", "căn phòng", "phòng", "home", "room", "nhà"], "a humble 1940s home interior with wooden furniture, an oil lamp and a radio", 1),
    ],
    "ancient": [
        ("hang động", ["hang", "cave", "trong hang", "hang động"], "a prehistoric cave interior: rock walls with hand-print paintings, a campfire, furs, bones", 1),
        ("núi lửa", ["núi lửa", "volcano", "dung nham", "lava"], "a prehistoric volcano landscape with lava glow, ash sky, rocks", 0),
        ("sông", ["sông", "suối", "hồ", "river", "lake", "thác", "waterfall"], "a prehistoric river valley with big rocks, ferns, tall cliffs and clear water", 0),
        ("tuyết", ["tuyết", "băng", "snow", "ice", "ice age", "kỷ băng hà"], "an ice-age snowy tundra with snow-covered rocks, pine trees and a pale sky", 0),
        ("làng bộ lạc", ["bộ lạc", "làng", "tribe", "village", "lều", "tent", "lửa trại", "campfire", "trại"], "a prehistoric tribal camp with hide tents, a big campfire, drying racks, totem poles", 0),
        ("rừng", ["rừng", "forest", "jungle", "cây"], "a dense prehistoric jungle with giant ferns and ancient trees", 0),
        ("thảo nguyên", ["thảo nguyên", "đồng cỏ", "savanna", "plain", "săn", "hunt"], "a wide prehistoric savanna with tall grass, distant mountains and a big sky", 0),
    ],
}


def scene_override(cfg, i, era):
    """Nguoi dung chon dia diem / go mo ta rieng cho canh i -> (ten, mo ta_en, trong_nha) hoac None."""
    lst = cfg.get("scene_cfg") or []
    if i >= len(lst) or not lst[i]:
        return None
    o = lst[i]
    if (o.get("custom") or "").strip():
        return (o["custom"].strip()[:80], o["custom"].strip()[:300], 0)
    if o.get("place"):
        for name, kws, en, indoor in LOCS.get(era, LOCS["modern"]):
            if name == o["place"]:
                return (name, en, indoor)
    return None


def place_names(era):
    return [x[0] for x in LOCS.get(era, LOCS["modern"])]


GENERIC_KW = {"trường", "đường", "phố", "nhà", "biển", "núi", "cây", "hang", "bếp", "ga", "chợ", "họp", "rừng", "làng", "hầm", "sông", "phòng", "street", "road", "home", "school", "cave", "room"}


def _kw_weight(k):
    k = k.strip().lower()
    if " " in k:
        return 2.5
    if k in GENERIC_KW:
        return 0.6
    return 1.0 + (0.5 if len(k) >= 7 else 0.0)


def detect_place(era, text):
    """Doan boi canh (trong nha / ngoai troi) tu doan truyen cua canh. Tra ve (ten, mo ta_en, trong_nha) hoac None."""
    t = " " + text.lower() + " "
    best = None
    for name, kws, en, indoor in LOCS.get(era, LOCS["modern"]):
        n = sum(t.count(k.lower()) * _kw_weight(k) for k in kws)
        if n and (best is None or n > best[0]):
            best = (n, name, en, indoor)
    return best[1:] if best else None


def ai_background(desc, era, night, cfg, log=print, redo=0, flags=None, override=None):
    return _retrying("Flow vẽ nền cảnh", lambda: _ai_background(desc, era, night, cfg, log, redo, flags, override))


def _ai_background(desc, era, night, cfg, log=print, redo=0, flags=None, override=None):
    flags = flags or {}
    place = override or detect_place(era, desc)
    base = {"modern": "modern day", "ancient": "prehistoric stone age", "war": "World War II 1940s", "imperial": "ancient East Asian"}.get(era, "")
    if place:
        name, en, indoor = place
        where = f"{en}"
        floor = "empty floor/ground in the lower third so characters can stand there" if indoor else "empty open ground in the lower third so characters can stand there"
        log(f"  Cảnh này {'(bạn chọn)' if override else 'nhận diện là'}: {name}")
    else:
        where = f"an everyday {base} scene matching this story moment: {desc[:200]}"
        floor = "empty open ground in the lower third"
    mood = []
    if night:
        mood.append("night time, dark blue lighting with warm lamps")
    elif flags.get("dusk"):
        mood.append("sunset golden hour")
    else:
        mood.append("daytime, bright")
    if flags.get("rain"):
        mood.append("raining, wet ground")
    if flags.get("snow"):
        mood.append("snowing")
    if flags.get("fog"):
        mood.append("foggy")
    story = " ".join(desc.split())[:700]
    vi = (cfg.get("lang") or "vi") == "vi"
    if vi:
        base_v = {"modern": "hiện đại", "ancient": "thời tiền sử, người nguyên thủy", "war": "chiến tranh thế giới thứ hai, thập niên 1940", "imperial": "cung đình phương Đông cổ"}.get(era, "")
        mood_v = {"night time, dark blue lighting with warm lamps": "ban đêm, ánh sáng xanh tối với đèn vàng ấm", "sunset golden hour": "hoàng hôn vàng cam", "daytime, bright": "ban ngày, sáng sủa",
                  "raining, wet ground": "đang mưa, mặt đất ướt", "snowing": "đang có tuyết rơi", "foggy": "sương mù"}
        pr = (f"Tranh nền hoạt hình 2D toàn cảnh (16:9, nét viền đậm, màu phẳng sạch). Hãy vẽ ĐÚNG và CỤ THỂ bối cảnh mà đoạn truyện này mô tả: \"{story}\". "
              f"Vẽ chi tiết mọi địa điểm, đồ vật, nội thất, thời tiết và thời gian trong ngày mà đoạn truyện nhắc đến hoặc ngụ ý, để bức tranh chỉ có thể thuộc về đoạn này. "
              f"Gợi ý loại địa điểm (chỉ để tham khảo, chi tiết trong đoạn truyện luôn được ưu tiên): {where}. Thời kỳ: {base_v}. Ánh sáng: {', '.join(mood_v.get(m, m) for m in mood)}. "
              f"Không có nhân vật, không có người, không chữ, không logo. Chừa khoảng sàn/nền trống ở phần dưới để nhân vật đứng.")
    else:
        pr = (f"Wide panoramic 2D cartoon background illustration (16:9, thick dark outlines, clean flat colours). Draw the EXACT, SPECIFIC setting described by this story passage: \"{story}\". "
              f"Include every concrete place detail, object, furniture, weather and time of day that the passage mentions or clearly implies, drawn in detail so the picture could only belong to this passage. "
              f"General type of place (only a hint; the passage's own details always win): {where}. Era: {base}. Lighting: {', '.join(mood)}. "
              f"No characters, no people, no text, no logos. {floor}.")
    key = _hash("bg5", cfg.get("img_backend"), pr, redo)
    path = os.path.join(DATA_DIR, "cache", "bg", key + ".png")
    if os.path.exists(path):
        return path
    try:
        im = fetch_image(pr, cfg, w=1536, h=768, seed=int(key, 16) % 99999)
        os.makedirs(os.path.dirname(path), exist_ok=True)
        im.save(path)
        return path
    except Exception as e:
        raise RuntimeError("Flow không vẽ được nền cảnh: " + str(e)[:160])


def attach(P, script, cfg=None, log=print):
    """Gan nhan vat sticker (+ nen AI) vao project (chi che do 2D dung)."""
    cfg = cfg or {}
    if P.mode != "2d" or cfg.get("style", "sticker") != "sticker":
        return
    if cfg.get("frames") and cfg.get("img_backend"):
        cfg = dict(cfg, variants=False, actions=False)
    P.sprites = {} if cfg.get("draw_mode") else prepare_characters(script, cfg, log)          # tab 'Ve ra': khong co nhan vat mau, chi anh tham chieu + prompt chung
    if cfg.get("frames") and cfg.get("img_backend"):
        make_frames(P, script, cfg, log)
        if not cfg.get("extras_later"):
            make_motion(P, script, cfg, log)
        P.cues = []            # bo hieu ung/am thanh phu tu dong (gay roi, rung)
        return
    try:
        make_inserts(P, script, cfg, log)
    except Exception as e:
        log(f"  hình chèn lỗi: {str(e)[:100]}")
    for i in range(len(P.scenes)):
        cb = custom_bg(i, len(P.scenes))
        if cb:
            P.scene_bgs[i] = cb
    if cfg.get("ai_bg") and cfg.get("img_backend"):
        todo = [i for i in range(len(P.scenes)) if i not in P.scene_bgs]
        redo_n, seen = {}, {}
        for rnd in range(7):
            for i in todo:
                sc = P.scenes[i]
                log(f"Flow đang vẽ nền cảnh {i + 1}/{len(P.scenes)}…")
                txt = " ".join(l.text for l in sc.lines)[:700]
                ov = scene_override(cfg, i, sc.era) or (getattr(script.scenes[i], "place_t", None) if i < len(script.scenes) else None)
                fl = dict(rain=sc.rain, snow=sc.snow, fog=sc.fog, dusk=sc.dusk)
                rk = (txt, sc.night, tuple(fl.values()), redo_n.get(i, 0))
                if rk in seen and not redo_n.get(i):
                    P.scene_bgs[i] = P.scene_bgs[seen[rk]]       # cung dia diem + cung gio/thoi tiet da ve -> dung lai
                    continue
                P.scene_bgs[i] = ai_background((sc.desc + ". " + txt).strip(), sc.era, sc.night, cfg, log, redo=redo_n.get(i, 0), flags=fl, override=ov)
                seen.setdefault(rk, i)
            rev = cfg.get("review")
            redo = rev({f"Cảnh {i + 1}": P.scene_bgs[i] for i in sorted(P.scene_bgs) if i in set(range(len(P.scenes)))}) if rev else []
            todo = [int(n.split()[-1]) - 1 for n in redo if n.startswith("Cảnh ")]
            if not todo:
                break
            for i in todo:
                redo_n[i] = redo_n.get(i, 0) + 1


SHOT_VI = {"wide": "toàn cảnh (thấy rõ cả địa điểm)", "medium": "trung cảnh", "close": "cận cảnh khuôn mặt, biểu cảm rõ", "close-up": "cận cảnh khuôn mặt, biểu cảm rõ", "insert": "cận cảnh vật/màn hình chiếm TOÀN khung hình", "pov": "góc nhìn thứ nhất (POV), thấy bàn tay người nhìn"}


def frame_prompt(script, ln, sd, names, cfg, sheet=False):
    vi = (cfg.get("lang") or "vi") == "vi"
    asp = cfg.get("aspect", "16:9")
    era = {"modern": ("hiện đại", "modern day"), "ancient": ("thời tiền sử", "prehistoric stone age"), "war": ("chiến tranh thế giới thứ hai, thập niên 1940", "World War II 1940s"),
           "imperial": ("cung đình phương Đông cổ", "ancient East Asia")}.get(script.era, ("", ""))
    shot = (ln.shot or "medium").lower()
    setting = (sd.place_t[1] if sd.place_t and len(sd.place_t) > 1 and sd.place_t[1] else sd.desc)[:420]
    who = []
    if sheet and len(names) > 1:
        parts = [f"{n} ({script.chars[n].attrs[:80]})" for n in names]
        who.append(("ảnh đính kèm số 1 là bảng nhân vật, các nhân vật xếp từ TRÁI sang PHẢI lần lượt là: " + "; ".join(parts)) if vi else
                   ("attached image #1 is a character sheet; the characters from LEFT to RIGHT are: " + "; ".join(parts)))
    else:
        for k, n in enumerate(names):
            ch = script.chars[n]
            who.append(f"ảnh đính kèm số {k + 1} là {n} ({ch.attrs[:90]})" if vi else f"attached image #{k + 1} is {n} ({ch.attrs[:90]})")
    act = ""
    for _, _, actor, key in getattr(ln, "acts", []) or []:
        from . import actions
        en = actions.KEYS.get(key, (None, None))[0]
        if en:
            act = f"{actor}: {en}" if key.startswith("ai:") else f"{actor}"
            break
    ins = getattr(ln, "ins", None)
    mood = "ban đêm, ánh sáng điện ảnh" if sd.night else ("hoàng hôn" if sd.dusk else "ban ngày")
    if vi:
        p = (f"Một KHUNG HÌNH phim hoạt hình 2D điện ảnh, tỉ lệ {asp}, nét viền đậm, bố cục đẹp, mọi thứ (nhân vật, nền, đồ vật, ánh sáng) vẽ HÒA CÙNG MỘT phong cách như một cảnh phim hoàn chỉnh. "
             f"Cỡ cảnh: {SHOT_VI.get(shot, 'trung cảnh')}. Bối cảnh CỤ THỂ: {setting}. Thời gian/ánh sáng: {mood}. Thời kỳ: {era[0]}. "
             f"Khoảnh khắc truyện cần minh họa ĐÚNG: \"{ln.text[:300]}\". ")
        if who:
            p += "Nhân vật trong khung (dùng ĐÚNG các nhân vật trong ảnh đính kèm, giữ nguyên khuôn mặt, kiểu tóc, trang phục và kiểu vẽ): " + "; ".join(who) + ". "
        if act:
            p += f"Hành động đang diễn ra: {act}. Nhân vật tương tác tự nhiên với đồ vật xung quanh. "
        if ins and shot in ("insert", "pov"):
            p += f"CHỦ THỂ CHÍNH chiếm toàn khung hình: {ins} (có thể thấy một bàn tay đơn giản cầm vật). Bố cục sạch, chữ rõ ràng. "
        elif ins:
            p += f"Trong khung phải thấy rõ: {ins}. "
        p += "Không chèn chữ phụ đề, không viền khung, không logo thật; chữ trên biển/màn hình (nếu có) là tiếng Việt đúng chính tả."
        if ART[0] in FRAME_STYLE:
            p += " " + FRAME_STYLE[ART[0]][0]
        if ART[0] in FRAME_STYLE and script.era in ERA_LOCK:      # chi du an phong cach moi (du an cu giu nguyen de khong ve lai)
            p += " " + ERA_LOCK[script.era][0]
    else:
        p = (f"One cinematic 2D cartoon FILM FRAME, aspect {asp}, bold outlines, beautiful composition; characters, background, props and lighting all drawn in ONE unified style like a finished film shot. "
             f"Shot size: {shot}. SPECIFIC setting: {setting}. Time/lighting: {'night, cinematic light' if sd.night else ('sunset' if sd.dusk else 'daytime')}. Era: {era[1]}. "
             f"The story moment to illustrate EXACTLY: \"{ln.text[:300]}\". ")
        if who:
            p += "Characters in the frame (use EXACTLY the characters of the attached images, keep face, hair, outfit and drawing style): " + "; ".join(who) + ". "
        if act:
            p += f"Action happening: {act}. Characters interact naturally with the objects around them. "
        if ins and shot in ("insert", "pov"):
            p += f"MAIN SUBJECT filling the whole frame: {ins} (a simple hand may hold it). Clean composition, clear legible text. "
        elif ins:
            p += f"Clearly visible in the frame: {ins}. "
        p += "No subtitles, no border, no real logos; any sign/screen text must be short, correctly spelled %s." % (langs.name_en(cfg.get("lang")) if langs.known(cfg.get("lang")) else "English")
        if ART[0] in FRAME_STYLE:
            p += " " + FRAME_STYLE[ART[0]][1]
        if ART[0] in FRAME_STYLE and script.era in ERA_LOCK:      # chi du an phong cach moi (du an cu giu nguyen de khong ve lai)
            p += " " + ERA_LOCK[script.era][1]
    if PTPL[0][0 if vi else 1]:
        p += " " + PTPL[0][0 if vi else 1]
    if ART[0] == "stick":
        p = (p.replace("phim hoạt hình 2D điện ảnh", "minh họa 2D phẳng").replace("ánh sáng điện ảnh", "ánh sáng đơn giản")
              .replace("One cinematic 2D cartoon FILM FRAME", "One flat 2D illustration FRAME").replace("cinematic light", "simple light"))
    return p


def _stop(cfg):
    ev = cfg.get("cancel")
    if ev is not None and ev.is_set():
        raise RuntimeError("Đã dừng")


def _cast_sheet(paths):
    """Ghep anh nhan vat canh nhau (trai -> phai) thanh mot anh de chi phai dinh kem mot lan len Flow."""
    out = os.path.join(DATA_DIR, "cache", "frames", "cast_" + _hash("sheet1", [os.path.basename(p) + str(os.path.getmtime(p)) for p in paths]) + ".png")
    if os.path.exists(out):
        return out
    ims = []
    for p in paths:
        im = Image.open(p).convert("RGBA")
        bg = Image.new("RGBA", im.size, (255, 255, 255, 255)); bg.alpha_composite(im)
        im = bg.convert("RGB")
        h = 640
        ims.append(im.resize((max(1, int(im.width * h / im.height)), h), Image.LANCZOS))
    sheet = Image.new("RGB", (sum(i.width for i in ims) + 20 * (len(ims) + 1), 680), "white")
    x = 20
    for im in ims:
        sheet.paste(im, (x, 20)); x += im.width + 20
    os.makedirs(os.path.dirname(out), exist_ok=True)
    sheet.save(out)
    return out


def make_frames(P, script, cfg, log=print):
    """Flow ve tron TUNG KHUNG cho moi nhip (nen + nhan vat + hanh dong + do vat cung mot net ve)."""
    from . import flowgen, resume
    n = len(P.lines)
    if n != len(script.lines):
        raise RuntimeError("số câu không khớp (%d/%d)" % (n, len(script.lines)))
    os.makedirs(os.path.join(DATA_DIR, "cache", "frames"), exist_ok=True)
    paths, redo_n, first_of_scene = {}, {}, {}
    prog = cfg.get("progress") or (lambda *a: None)
    for i0 in range(n):
        prog(i0, n, script.lines[i0].text, None, "pending")
    # tab 'Ve ra': canh co the gom nhieu dong (loi dan + thoai; dong qua ngan nhu "Vang.") -> chi dong DAU cua canh duoc ve, cac dong con lai dung chung anh. share = {dong: dong chu}
    share = {}
    if cfg.get("draw_mode"):
        for k_, v_ in (cfg.get("share") or {}).items():
            try:
                k_, v_ = int(k_), int(v_)
            except (TypeError, ValueError):
                continue
            if 0 < k_ < n and 0 <= v_ < k_:
                share[k_] = v_
    visuals = {int(k): v for k, v in (cfg.get("visuals") or {}).items() if str(k).lstrip("-").isdigit()}
    own = set()                                  # dong chung anh nhung nguoi dung bam ve lai RIENG
    todo = [i for i in range(n) if i not in share]
    ieng = cfg.get("img_engine") if cfg.get("img_engine") in ("gemini", "chatgpt") else "flow"
    gem = ieng != "flow"                                # tab 'Ve ra': Gemini / ChatGPT -> ve bang TAB cua trinh duyet (tai khoan dang nhap, khong API); Flow -> ve bang Flow
    eng = {"gemini": "Gemini", "chatgpt": "ChatGPT"}.get(ieng, "Flow")
    chat_draw = flowgen.chatgpt_draw if ieng == "chatgpt" else flowgen.gemini_draw
    chat_many = flowgen.chatgpt_many if ieng == "chatgpt" else flowgen.gemini_many
    tabs = int(cfg.get("flow_tabs") or 1)
    log(f"Vẽ khung bằng {tabs} tab {eng}" + (" song song" if tabs > 1 else " (một tab)"))
    asp_ = cfg.get("aspect", "16:9")

    def gen_one(pr_, refs_):
        if gem:
            return _fit_aspect(chat_draw(pr_, refs=refs_, aspect=asp_, browser=cfg.get("browser", 0)), asp_)
        return flowgen.generate(pr_, refs=refs_, aspect=asp_, browser=cfg.get("browser", 0))

    ALT = {}
    LANG = []

    def build(i):
        ln = script.lines[i]
        if cfg.get("draw_mode"):             # tab 'Ve ra': prompt chung + cau cua canh + cau ke tiep, kem anh tham chieu cho MOI canh (neu co)
            from . import templates
            ref = cfg.get("refimg") or ""
            ovr = (cfg.get("prompt_ovr") or {}).get(i)
            nx_ = next((script.lines[j].text for j in range(i + 1, n) if j not in share or j in own), "")
            cur_ = " ".join([ln.text] + [script.lines[j].text for j in range(i + 1, n) if share.get(j) == i and j not in own])          # canh gom nhieu dong: loi cua ca canh
            if not LANG:                                             # ngon ngu chu trong anh = ngon ngu CA KICH BAN (khong doi theo tung cau)
                LANG.append(templates.detect_lang(" ".join(str(l.text or "") for l in script.lines)))
            prd = ovr or templates.scene_prompt(cfg.get("common") or "", cur_, nx_, bool(ref), visuals.get(i, ""), LANG[0])
            ALT[i] = "" if ovr else templates.scene_prompt_short(cfg.get("common") or "", cur_, nx_, bool(ref), visuals.get(i, ""), LANG[0])          # cach thu khi Flow bao 'Khong thanh cong' (khong dung neu nguoi dung tu sua prompt)
            if isinstance(cfg.get("prompts"), dict):
                cfg["prompts"][i] = prd
            refd = [ref] if ref else []
            kd = _hash("frd3", prd, [os.path.basename(r) for r in refd], redo_n.get(i, 0), cfg.get("aspect"))
            return prd, refd, os.path.join(DATA_DIR, "cache", "frames", kd + ".png")
        sd = script.scenes[ln.scene]
        names = [x for x in (ln.present or sd.cast) if x in script.chars and x in P.sprites][:3]
        if ln.speaker and ln.speaker in P.sprites and ln.speaker not in names:
            names = ([ln.speaker] + names)[:3]
        sheet = len(names) > 1
        pr = frame_prompt(script, ln, sd, names, cfg, sheet=sheet)
        refs = []
        for x in names:
            pth = P.sprites[x].get("neutral")
            refs.append(raw_of(pth) or pth)
        if sheet:
            refs = [_cast_sheet(refs)]
        fs = first_of_scene.get(ln.scene)
        if fs is not None and fs != i and fs in paths and len(refs) < 4:
            refs.append(paths[fs])
            pr += (" Ảnh đính kèm cuối cùng là khung trước của CÙNG cảnh này: giữ nguyên địa điểm, đồ đạc và ánh sáng." if (cfg.get("lang") or "vi") == "vi"
                   else " The last attached image is the previous frame of the SAME scene: keep the same place, furniture and lighting.")
        key = _hash("fr1", pr, [os.path.basename(r) for r in refs], redo_n.get(i, 0), cfg.get("aspect"))
        newp = os.path.join(DATA_DIR, "cache", "frames", key + ".png")
        if sheet or fs == 0:                      # tuong thich: khung da ve bang ban cu (moi nhan vat 1 anh tham chieu) thi dung lai, khong ve lai
            pr0 = frame_prompt(script, ln, sd, names, cfg, sheet=False)
            refs0 = [(raw_of(P.sprites[x].get("neutral")) or P.sprites[x].get("neutral")) for x in names]
            if fs and fs != i and fs in paths and len(refs0) < 4:
                refs0.append(paths[fs])
                pr0 += (" Ảnh đính kèm cuối cùng là khung trước của CÙNG cảnh này: giữ nguyên địa điểm, đồ đạc và ánh sáng." if (cfg.get("lang") or "vi") == "vi"
                        else " The last attached image is the previous frame of the SAME scene: keep the same place, furniture and lighting.")
            k0 = _hash("fr1", pr0, [os.path.basename(r) for r in refs0], redo_n.get(i, 0), cfg.get("aspect"))
            p0 = os.path.join(DATA_DIR, "cache", "frames", k0 + ".png")
            if os.path.exists(p0):
                return pr0, refs0, p0
        return pr, refs, newp

    def draw_parallel(todo_):
        """Ve song song tren nhieu tab Flow: truoc het khung dau moi canh, sau do cac khung con lai (can anh dau canh lam tham chieu)."""
        firsts, rest, seen_sc = [], [], set()
        carry = {}                                       # khung loi chua gui lai: chi so -> ly do
        auto_n = [0]                                     # so vong TU thu lai cac khung loi (dinh anh mau / 2 anh moi / Flow khong nhan chu) - khong can nguoi dung bam
        for i in todo_:
            sc_ = script.lines[i].scene
            if cfg.get("draw_mode"):             # tab 'Ve ra': cac khung doc lap (cung 1 anh tham chieu) -> ve tat ca song song ngay, khong cho khung dau
                rest.append(i)
            elif sc_ not in first_of_scene and sc_ not in seen_sc:
                firsts.append(i); seen_sc.add(sc_)
            else:
                rest.append(i)
        for phase in (firsts, rest):
            left = list(phase)
            while left:
                jobs, idx = [], []
                for i in left:
                    pr, refs, path = build(i)
                    if os.path.exists(path):
                        paths[i] = path; prog(i, n, script.lines[i].text, path, "done")
                        first_of_scene.setdefault(script.lines[i].scene, i)
                        continue
                    jobs.append(dict(prompt=pr, refs=refs, aspect=asp_, files=refs, kind="image", alt=ALT.get(i) or "")); idx.append((i, path))
                    prog(i, n, script.lines[i].text, None, "drawing")
                if not jobs:
                    break
                log(f"{eng} đang vẽ {len(jobs)} khung song song ({tabs} tab)…")
                _t = __import__("time").time()
                def _on_done(j, im, idx=idx):
                    i_, p_ = idx[j]
                    if gem:
                        im = _fit_aspect(im, asp_)
                    im.save(p_); paths[i_] = p_
                    prog(i_, n, script.lines[i_].text, p_, "done")
                    first_of_scene.setdefault(script.lines[i_].scene, i_)
                def _more(idx=idx, jobs=jobs):
                    nj = []
                    for i_ in (cfg.get("redo_poll")() if cfg.get("redo_poll") else []):
                        if not (0 <= i_ < n):
                            continue
                        redo_n[i_] = redo_n.get(i_, 0) + 1
                        paths.pop(i_, None)
                        if i_ in share:
                            own.add(i_)
                        pr_, refs_, path_ = build(i_)
                        idx.append((i_, path_))
                        nj.append(dict(prompt=pr_, refs=refs_, aspect=asp_, files=refs_, kind="image", alt=ALT.get(i_) or ""))
                        prog(i_, n, script.lines[i_].text, None, "drawing")
                    return nj
                _kw_ = dict(draw=True) if (cfg.get("draw_mode") and not gem) else {}      # chi tab 'Ve ra' dung cach gui Flow rieng (flowgen _submit_draw); tab Story giu cach cu
                res = (chat_many if gem else flowgen.generate_many)(jobs, tabs, cfg.get("browser", 0), on_done=_on_done, more=_more, **_kw_)
                failed, errs_ = [], {}
                for (i, path), r in zip(idx, res):
                    if not isinstance(r, Exception) and r is not None and i in paths and os.path.exists(path):
                        continue                                  # da luu + bao ngay luc anh xong
                    if isinstance(r, Exception) or r is None:
                        errs_[i] = r
                        failed.append((i, str(r)[:150]))
                        log(f"  khung {i + 1} lỗi: {str(r)[:120]}")
                        continue
                    (_fit_aspect(r, asp_) if gem else r).save(path); paths[i] = path
                    prog(i, n, script.lines[i].text, path, "done")
                    first_of_scene.setdefault(script.lines[i].scene, i)
                for i, _ in idx:
                    if i in paths:
                        carry.pop(i, None)
                for i, e_ in failed:
                    if i not in paths:                            # khung da ve lai thanh cong qua 'Ve lai ngay' thi khong tinh la loi
                        carry[i] = e_; prog(i, n, script.lines[i].text, None, "error", e_)
                log(f"  xong {len(jobs) - len(carry)}/{len(jobs)} khung sau {int(__import__('time').time() - _t)} giây")
                if not carry:
                    break
                if cfg.get("draw_mode") and not gem and auto_n[0] < 2 and all(                       # loi 'phia tool' (khong dinh duoc anh mau / 2 anh moi / Flow khong nhan chu): tu gui lai TAT CA khung do, khong hoi
                        isinstance(errs_.get(i_), (flowgen.RefAttachError, flowgen.Ambiguous, flowgen.PromptNotEntered)) for i_ in carry):
                    auto_n[0] += 1
                    log(f"Tự thử lại {len(carry)} khung lỗi (vòng {auto_n[0]}/2) — mở lại các tab, tải lại ảnh tham chiếu, không cần bấm gì…")
                    left = sorted(carry)
                    continue
                items_ = sorted(carry.items())
                act = resume.ask(f"{eng} vẽ {len(items_)} khung (khung {items_[0][0] + 1}…)", items_[0][1], bool(paths), "flow")
                if act == "retry":
                    pick = []
                    for i_ in (cfg.get("redo_poll")() if cfg.get("redo_poll") else []):    # bam "Tao lai" o tung khung: chi gui lai nhung khung do
                        if 0 <= i_ < n and i_ not in pick:
                            pick.append(i_)
                    for i_ in pick:
                        if i_ not in carry:                       # khung da co anh ma nguoi dung muon ve lai -> doi khoa luu tam de khong lay lai anh cu
                            redo_n[i_] = redo_n.get(i_, 0) + 1
                            paths.pop(i_, None)
                            if i_ in share:
                                own.add(i_)
                    left = sorted(set(pick) | set(carry))              # bam "Tao lai" o 1 khung loi = gui lai CA cac khung loi con lai (khong phai bam tung khung)
                    continue
                if act == "skip" and paths:
                    for i in list(carry):
                        near = [k for k in paths if k < i]
                        paths[i] = paths[max(near)] if near else next(iter(paths.values()))
                        prog(i, n, script.lines[i].text, paths[i], "done")
                    break
                raise RuntimeError(f"{eng} không vẽ được khung {items_[0][0] + 1}: {items_[0][1]}")

    # ---- tab 'Ve ra': MOI KHUNG VE XONG DA DUOC LUU THEO SO KHUNG trong du an (frame_idx) -> mo lai / Tiep tuc / Hoan thanh video thi lay dung anh do,
    #      khong phu thuoc khoa cache theo prompt (khung ve lai 'Tao lai' co khoa khac) va khong bao gio bi anh cu / anh gan nhat de len
    fidx = cfg.get("frame_idx") if cfg.get("draw_mode") else None
    if isinstance(fidx, dict) and fidx:
        import re as _re0, shutil as _sh0, filecmp as _fc0
        nrm = lambda s: " ".join(_re0.findall(r"\w+", (s or "").lower()))
        kept = 0
        for i0 in range(n):
            if i0 in share:
                continue
            e_ = fidx.get(str(i0))
            if not (isinstance(e_, (list, tuple)) and len(e_) == 2 and e_[1] and os.path.isfile(e_[1])):
                continue
            if nrm(e_[0]) != nrm(script.lines[i0].text):                # kich ban doi cau o vi tri nay -> de buoc khop theo noi dung xu ly
                continue
            dst_ = build(i0)[2]
            try:
                if os.path.abspath(dst_) != os.path.abspath(e_[1]) and (not os.path.exists(dst_) or not _fc0.cmp(e_[1], dst_, shallow=False)):
                    _sh0.copyfile(e_[1], dst_)
                kept += 1
            except Exception:
                pass
        if kept:
            log(f"Giữ lại {kept}/{n} ảnh đã vẽ trước đó (lưu theo từng khung) → không vẽ lại các khung này.")

    # ---- kich ban doc lai co the chia cau khac: tu khop ANH DA VE (theo noi dung cau) voi cau moi, de khong ve lai
    fmap =[(t, p) for t, p in (cfg.get("frame_map") or []) if p and os.path.isfile(p)]
    if fmap:
        import re as _re, shutil as _sh
        tok = lambda s: set(_re.findall(r"\w+", (s or "").lower()))
        otok = [tok(t) for t, _ in fmap]
        ptr, adopted = 0, 0
        for i0 in range(n):
            if i0 in share:
                continue
            _p = build(i0)[2]
            if os.path.exists(_p):
                continue
            a_ = tok(script.lines[i0].text)
            if len(a_) < 2:
                continue
            best, bi = 0.0, -1
            for j in range(max(0, ptr - 3), min(len(fmap), ptr + 60)):
                b_ = otok[j]
                if not b_:
                    continue
                inter = len(a_ & b_)
                sc_ = max(inter / len(a_ | b_), (inter / min(len(a_), len(b_))) * 0.9 if min(len(a_), len(b_)) >= 4 else 0)
                sc_ -= 0.002 * abs(j - ptr)
                if sc_ > best:
                    best, bi = sc_, j
            if bi >= 0 and best >= 0.5:
                try:
                    _sh.copyfile(fmap[bi][1], _p)
                    adopted += 1
                    ptr = bi
                except Exception:
                    pass
        if adopted:
            log(f"Khớp {adopted}/{n} câu mới với ảnh đã vẽ trước đó (theo nội dung câu) → không phải vẽ lại các khung này.")

    # ---- kiem tra khung da ve san trong bo nho (de chay lai khong ve lai) va hoi nguoi dung neu con thieu
    have = 0
    nd = n - len(share)                          # so anh phai ve (dong chung anh khong tinh)
    for i0 in range(n):
        if i0 in share:
            continue
        _p = build(i0)[2]
        if os.path.exists(_p):
            paths[i0] = _p; first_of_scene.setdefault(script.lines[i0].scene, i0); have += 1
            prog(i0, n, script.lines[i0].text, _p, "done")
    filled = set()
    if 0 < have < nd:
        log(f"Đã có sẵn {have}/{nd} khung khớp trong bộ nhớ; còn {nd - have} khung chưa vẽ.")
        act = resume.ask(f"Đã có {have}/{nd} khung; còn thiếu {nd - have} khung", "Chọn: vẽ tiếp các khung thiếu, hoặc dựng video ngay (khung thiếu dùng lại khung gần nhất).", True, "missing")
        if act == "skip":
            for i0 in range(n):
                if i0 not in paths and i0 not in share:
                    near = [k for k in paths if k < i0] or [k for k in paths if k > i0]
                    paths[i0] = paths[max(near) if near and near[0] < i0 else min(near)]
                    filled.add(i0)
                    prog(i0, n, script.lines[i0].text, paths[i0], "done")
            log(f"Dựng video ngay: {len(filled)} khung thiếu dùng lại khung gần nhất.")
    todo = [i for i in todo if i not in filled]
    seq_redo = []

    def fill_shared():
        """Dong chung anh dung lai anh cua dong chu (cap nhat khi dong chu duoc ve lai); dong nguoi dung ve lai rieng thi giu anh rieng."""
        for i_, m_ in sorted(share.items()):
            if i_ in own and i_ in paths:
                continue
            if m_ in paths and paths.get(i_) != paths[m_]:
                paths[i_] = paths[m_]
                prog(i_, n, script.lines[i_].text, paths[m_], "done")

    for rnd in range(6):
        if tabs > 1:
            draw_parallel(todo)
        for i in (todo if tabs <= 1 else []):
            _stop(cfg)
            if i in filled:
                continue
            ln = script.lines[i]
            pr, refs, path = build(i)
            if not os.path.exists(path):
                log(f"{eng} đang vẽ khung {i + 1}/{n}: {ln.text[:50]}…")
                prog(i, n, ln.text, None, "drawing")
                while True:
                  last = ""
                  for attempt in range(3):
                    try:
                        _t = __import__("time").time()
                        im = gen_one(pr, refs)
                        im.save(path); last = ""
                        log(f"  khung {i + 1} xong sau {int(__import__('time').time() - _t)} giây")
                        break
                    except Exception as e:
                        if str(e) == "Đã dừng":
                            raise
                        last = str(e)[:150]
                        log(f"  khung {i + 1} lỗi (lần {attempt + 1}): {last}")
                  if last:
                      # dung tai day, cho nguoi dung bam Thu lai (cac khung truoc da luu, khong ve lai)
                      can_skip = bool(paths)
                      prog(i, n, ln.text, None, "error", last)
                      act = resume.ask(f"{eng} vẽ khung {i + 1}/{n}", last, can_skip, "api" if gem else "flow")
                      if act == "retry":
                          for k_ in (cfg.get("redo_poll")() if cfg.get("redo_poll") else []):      # "Tao lai" bam luc dang dung: khung nay duoc gui lai ngay; khung khac da co anh thi ve lai o cuoi
                              if k_ != i and k_ in paths:
                                  seq_redo.append(k_)
                          prog(i, n, ln.text, None, "drawing")
                          continue
                      if act == "skip" and can_skip:
                          log(f"  khung {i + 1}: bỏ qua, dùng lại khung trước")
                          path = paths[max(k for k in paths if k < i)] if any(k < i for k in paths) else next(iter(paths.values()))
                          break
                      raise RuntimeError(f"{eng} không vẽ được khung {i + 1}: {last}")
                  break
            paths[i] = path
            prog(i, n, ln.text, path, "done")
            first_of_scene.setdefault(ln.scene, i)
        fill_shared()
        rev = cfg.get("review")
        redo = rev({f"Khung {i + 1}": paths[i] for i in sorted(paths)}) if rev else []
        todo = [int(x.split()[-1]) - 1 for x in redo if x.startswith("Khung")]
        for i_ in (cfg.get("redo_poll")() if cfg.get("redo_poll") else []) + seq_redo:      # khung bam "Ve lai" khi vua ve xong het
            if i_ not in todo and 0 <= i_ < n:
                todo.append(i_)
        seq_redo.clear()
        if not todo:
            break
        for i in todo:
            redo_n[i] = redo_n.get(i, 0) + 1
            paths.pop(i, None)
            if i in share:
                own.add(i)
            prog(i, n, script.lines[i].text, None, "pending")
            if first_of_scene.get(script.lines[i].scene) == i:
                first_of_scene.pop(script.lines[i].scene, None)
    fill_shared()
    for i_ in sorted(share):                      # dong chu khong co anh (bo qua khung loi...) -> lay anh gan nhat
        if i_ not in paths and paths:
            near = [k for k in paths if k < i_] or list(paths)
            paths[i_] = paths[max(near)]
    P.frames = []
    for i, ln in enumerate(P.lines):
        P.frames.append(dict(start=ln.start, end=ln.end, path=paths[i], line=ln, scene=script.lines[i].scene, shot=(script.lines[i].shot or "medium").lower(), path2=None))
    if cfg.get("mouth", True) and not cfg.get("extras_later"):
        make_mouth(P, script, cfg, log)


def make_mouth(P, script, cfg, log=print):
    """Khung 'mieng mo' cho cac nhip thoai: dong/mo mieng theo tieng noi (tuy chon, ton them 1 luot Flow moi cau thoai)."""
    from . import flowgen
    n = len(P.frames)
    vi = (cfg.get("lang") or "vi") == "vi"
    for i, f in enumerate(P.frames):
        _stop(cfg)
        sl = script.lines[i]
        if not sl.speaker or f["shot"] in ("insert", "pov", "wide"):
            continue
        pr = (f"Vẽ lại CHÍNH XÁC khung hình đính kèm, giữ nguyên MỌI thứ (bố cục, nhân vật, nền, màu, nét vẽ), chỉ khác duy nhất: miệng của {sl.speaker} đang mở như đang nói." if vi else
              f"Redraw EXACTLY the attached frame keeping EVERYTHING identical (composition, characters, background, colours, line style); the only difference: {sl.speaker}'s mouth is open as if speaking.")
        key = _hash("mo1", pr, os.path.basename(f["path"]))
        path = os.path.join(DATA_DIR, "cache", "frames", key + ".png")
        if not os.path.exists(path):
            log(f"Flow đang vẽ khung miệng mở {i + 1}/{n}…")
            try:
                flowgen.generate(pr, ref=f["path"], aspect=cfg.get("aspect", "16:9"), browser=cfg.get("browser", 0)).save(path)
            except Exception as e:
                if str(e) == "Đã dừng":
                    raise
                log(f"  bỏ qua khung miệng mở {i + 1}: {str(e)[:100]}")
                continue
        f["path2"] = path



def _fill_motion(script, idx, cfg, log=print, LN=None):
    LN = LN or (lambda i: script.lines[i])
    """Khung chua co mo ta chuyen dong: nho AI viet 1 cau tieng Anh khop dung loi noi (cache, goi theo lo)."""
    import json as _j
    from . import llm, resume
    lc = cfg.get("llm") or {}
    need = [i for i in idx if not (getattr(LN(i), "motion", "") or "").strip()]
    if not need or not lc.get("backend"):
        if need:
            log("  (không có AI để viết mô tả chuyển động → dùng câu thoại + cảm xúc làm mô tả)")
            for i in need:
                sl = LN(i)
                sl.motion = {"angry": "Angry, tense gestures, leaning forward.", "sad": "Sad, slow movement, head lowered.", "happy": "Cheerful, lively gestures, smiling.",
                             "scared": "Frightened, trembling, stepping back.", "surprised": "Startled, jumps slightly, eyes wide."}.get(getattr(sl, "emotion", ""), "")
        return
    for s0 in range(0, len(need), 12):
        part = need[s0:s0 + 12]
        items = [{"i": i, "speaker": getattr(LN(i), "speaker", "") or "narrator", "emotion": getattr(LN(i), "emotion", "neutral"), "text": LN(i).text[:260]} for i in part]
        ck = resume.key("motionfill", lc.get("backend"), items)
        got = resume.cget(ck)
        if got is None:
            user = ("For each spoken line of a 2D cartoon below, write ONE English sentence (max 25 words) describing the exact physical movement, gesture and facial expression the on-screen "
                    "character(s) perform WHILE saying it, matching its meaning and emotion. For narration, animate what the narration describes (objects, crowd, nature, camera). "
                    "Only motion, no dialogue text, no new objects/scene change. Answer ONLY a JSON object mapping the id to the sentence, e.g. {\"3\": \"...\"}.\n\n" + _j.dumps(items, ensure_ascii=False))
            try:
                r = llm.call(lc, user)
                a_, b_ = r.index("{"), r.rindex("}")
                got = _j.loads(r[a_:b_ + 1])
                resume.cput(ck, got)
            except Exception as e:
                log("  AI viết mô tả chuyển động lỗi, dùng câu thoại làm mô tả: " + str(e)[:80])
                got = {}
        for i in part:
            v = str(got.get(str(i)) or "").strip()
            if v:
                LN(i).motion = v[:300]


def make_motion(P, script, cfg, log=print):
    """Chuyen mot so khung thanh clip chuyen dong bang Google Vids ("Tao anh dong"). Loi -> hoi Thu lai/Bo qua, khong lam hong job."""
    from . import resume, actions, vids
    mode = cfg.get("motion") or "off"
    if mode == "off" or not P.frames:
        return
    def LN(i):      # che do cuu: so khung != so cau -> dung chinh cau gan voi khung
        return P.frames[i].get("line") if len(P.frames) != len(script.lines) and P.frames[i].get("line") is not None else script.lines[i]
    idx = []
    for i, f in enumerate(P.frames):
        sl = LN(i)
        if mode == "all" or getattr(sl, "acts", None) or getattr(sl, "ins", None) or f["shot"] in ("insert", "pov") or (getattr(sl, "motion", "") and f["shot"] != "wide"):
            idx.append(i)
    mx = int(cfg.get("motion_max") or 15)
    if mode != "all" and len(idx) > mx:                      # giu cac khung deu nhau trong truyen
        step = len(idx) / mx
        idx = [idx[int(k * step)] for k in range(mx)]
    log(f"Chuyển động AI (Google Vids): {len(idx)} khung sẽ được làm thành clip…")
    _fill_motion(script, idx, cfg, log, LN)
    for n, i in enumerate(idx):
        _stop(cfg)
        f, sl = P.frames[i], LN(i)
        act = ""
        for _, _, actor, key in getattr(sl, "acts", []) or []:
            en = actions.KEYS.get(key, (None, None))[0]
            if en:
                act = en; break
        mo = (getattr(sl, "motion", "") or "").strip()
        said = " ".join((getattr(sl, "text", "") or "").split())[:200]
        safe = cfg.get("motion_safe", True) is not False
        clear = (cfg.get("motion_lvl") or "clear") == "clear"
        prompt = (("Clearly visible, deliberate movement that illustrates the spoken line; forward motion stays forward, never reverses or loops backward. " if (safe and clear) else "") +
                  ("Keep every face, eye, hair, clothing and body shape EXACTLY identical to the image: no morphing, no face change, no extra limbs; only small, subtle, natural movement. " if safe else "") +
                  "2D cartoon animation, exactly the same art style, characters and background as the image. " +
                  (f"The scene illustrates this spoken line (the motion MUST match its meaning): \"{said}\". " if said else "") +
                  (f"Motion: {mo} " if mo else (f"Action: {act}. " if act else "")) +
                  ("Close-up of an object or screen, subtle hand movement, soft glow. " if f["shot"] in ("insert", "pov") and not mo else ("" if mo else "Characters move naturally and expressively, ")) +
                  "Gentle camera movement, smooth motion, no scene change, no new objects.")
        while True:
            try:
                log(f"Google Vids đang tạo chuyển động {n + 1}/{len(idx)} (khung {i + 1})…")
                f["clip"] = vids.animate(f["path"], prompt, cfg.get("vids_url") or vids.VIDS_NEW, cfg.get("browser", 0), log, secs=max(3.0, f["end"] - f["start"] + 0.5))
                break
            except Exception as e:
                if str(e) == "Đã dừng":
                    raise
                if type(e).__name__ == "Quota":
                    log(f"⚠ {e} → dừng tạo chuyển động ở khung {i + 1}. Các clip đã tạo được giữ lại; mai bấm 🎞 Hoàn thiện video để làm tiếp.")
                    return
                r = resume.ask(f"Google Vids tạo chuyển động khung {i + 1}", e, True, "vids")
                if r == "retry":
                    continue
                log(f"  khung {i + 1}: bỏ qua chuyển động ({str(e)[:100]})")
                break


def ai_insert(key, en, ctx, era, cfg, log=print, redo=0):
    return _retrying("Flow vẽ hình chèn", lambda: _ai_insert(key, en, ctx, era, cfg, log, redo))


def _ai_insert(key, en, ctx, era, cfg, log=print, redo=0):
    """Hinh chen: can canh vat/man hinh dung voi cau dang doc (dien thoai, tin nhan Messenger, thu...)."""
    base = {"modern": "modern day", "ancient": "prehistoric", "war": "World War II 1940s", "imperial": "ancient East Asian"}.get(era, "")
    vi = (cfg.get("lang") or "vi") == "vi"
    ctxs = ' '.join(ctx.split())[:260]
    if vi:
        pr = (f"Hình minh họa cận cảnh CAO CẤP, sang trọng và bóng bẩy (phong cách illustration kỹ thuật số hiện đại: gradient mềm, ánh sáng điện ảnh, bóng đổ tinh tế, độ sâu trường ảnh nhẹ, bố cục sạch và đẹp, màu sắc hài hòa) về: {en}. "
              f"Khoảnh khắc truyện mà hình này minh họa: \"{ctxs}\". Nếu có chữ trên màn hình/đồ vật thì viết bằng TIẾNG VIỆT, ngắn gọn, đúng chính tả, dễ đọc. "
              f"Chỉ vẽ vật/màn hình này lấp đầy khung hình, không có người, không dùng logo thật.")
    else:
        pr = (f"PREMIUM, luxurious, polished close-up illustration (modern digital illustration: soft gradients, cinematic lighting, subtle shadows, light depth of field, clean elegant composition, harmonious colours) of {en}. "
              f"Story moment it illustrates: \"{ctxs}\". Any on-screen text must be short, correctly spelled ENGLISH. Show only this object/screen filling the frame, no people, no real brand logos.")
    k = _hash("ins3", cfg.get("img_backend"), pr, redo)
    path = os.path.join(DATA_DIR, "cache", "ins", k + ".png")
    if os.path.exists(path):
        return path
    if not cfg.get("img_backend"):
        from . import actions
        return actions.fallback_insert(key, path)
    im = fetch_image(pr, cfg, w=1536, h=768, seed=int(k, 16) % 99999)
    os.makedirs(os.path.dirname(path), exist_ok=True)
    im.save(path)
    return path


def make_inserts(P, script, cfg, log=print):
    from . import actions
    P.inserts = []
    if cfg.get("inserts", True) is False:
        return
    cap = int(cfg.get("max_inserts", 9999))
    items = []
    for ln in P.lines:
        r = ("ai", ln.ins) if getattr(ln, "ins", None) else actions.insert_for(ln.text)
        if r and len(items) < cap:
            items.append((ln, r[0], r[1]))
    redo_n = {}
    paths = {}
    for rnd in range(5):
        for j, (ln, key, en) in enumerate(items):
            if j in paths and not redo_n.get(j):
                continue
            log(f"{'Flow' if cfg.get('img_backend') else 'Tool'} đang vẽ hình chèn {j + 1}/{len(items)} ({key})…")
            try:
                paths[j] = ai_insert(key, en, ln.text, script.era, cfg, log, redo_n.get(j, 0))
            except Exception as e:
                log(f"  bỏ qua hình chèn {key}: {str(e)[:100]}")
                paths.pop(j, None)
        rev = cfg.get("review")
        redo = rev({f"Hình chèn {j + 1}": p for j, p in sorted(paths.items())}) if (rev and paths) else []
        todo = [int(n.split()[-1]) - 1 for n in redo if n.startswith("Hình chèn")]
        if not todo:
            break
        for j in todo:
            redo_n[j] = redo_n.get(j, 0) + 1
    for j, (ln, key, en) in enumerate(items):
        if j in paths:
            P.inserts.append(dict(start=ln.start - 0.1, end=ln.end + 0.4, path=paths[j], key=key))


# ------------------------------------------------------------ goi prompt de ve tren web (Nano Banana / Flow...) va nhan lai
BG_DIR = os.path.join(APP_DIR, "backgrounds", "custom")


def custom_bg(i, n_scenes):
    """Anh nen ban tu tao: backgrounds/custom/scene_01.png ... (hoac 1.png). Tra ve duong dan da cat ti le 2:1."""
    if not os.path.isdir(BG_DIR):
        return ""
    for f in os.listdir(BG_DIR):
        b = os.path.splitext(f)[0].lower()
        if f.lower().endswith((".png", ".jpg", ".jpeg", ".webp")) and re.fullmatch(r"(scene|canh|bg)?[_ -]?0*%d" % (i + 1), b):
            src = os.path.join(BG_DIR, f)
            out = os.path.join(DATA_DIR, "cache", "bg", "c_" + _hash(f, os.path.getmtime(src)) + ".png")
            if not os.path.exists(out):
                im = Image.open(src).convert("RGB"); w, h = im.size
                if w / h > 2.0:
                    nw = int(h * 2.0); im = im.crop(((w - nw) // 2, 0, (w - nw) // 2 + nw, h))
                else:
                    nh = int(w / 2.0); im = im.crop((0, (h - nh) // 2, w, (h - nh) // 2 + nh))
                os.makedirs(os.path.dirname(out), exist_ok=True); im.save(out)
            return out
    return ""


def prompt_pack(script, outdir, log=print):
    """Ghi danh sach nhan vat/canh can ve + prompt san de dan vao Nano Banana (web). Anh ve xong bo vao characters/custom, backgrounds/custom."""
    import shutil
    os.makedirs(outdir, exist_ok=True)
    era = script.era if script.era in ERA_STYLE else "modern"
    ref = os.path.join(LIB, "ref", era + ".png")
    if os.path.exists(ref):
        shutil.copy(ref, os.path.join(outdir, "ANH_MAU_dinh_kem_%s.png" % era))
    L = ["=== CÁCH LÀM ===",
         "1) Mở Nano Banana (web), chọn tỉ lệ 3:4 hoặc 1:1 cho NHÂN VẬT; 16:9 cho NỀN.",
         "2) Với mỗi mục NHÂN VẬT: đính kèm ảnh ANH_MAU_dinh_kem_%s.png rồi dán prompt. Lưu ảnh nền trắng với đúng TÊN FILE ghi bên dưới" % era,
         "   vào thư mục characters/custom/ của AnimStudio.",
         "3) Với mỗi mục NỀN: dán prompt, lưu đúng tên (scene_01.png...) vào thư mục backgrounds/custom/.",
         "4) Bấm TẠO VIDEO: ảnh nào có sẽ được dùng; thiếu ảnh -> tự dùng thư viện mẫu/nền vẽ sẵn.", "", "=== NHÂN VẬT ==="]
    for nm, ch in script.chars.items():
        L += ["", f"[{nm}]  ->  lưu thành: {nm}.png", "PROMPT: Look at the attached reference sticker sheet and draw ONE NEW character in EXACTLY the same art style, proportions, outline thickness and face design. " + build_prompt(nm, ch, era, "neutral")]
        for v in sorted({VAR.get(l.emotion, "neutral") for l in script.lines if l.speaker == nm} - {"neutral"}):
            L += [f"  (biểu cảm {v}) lưu thành: {nm}_{v}.png  -- thêm vào prompt: {MOOD.get(v, '')}"]
    L += ["", "=== NỀN (mỗi cảnh) ==="]
    for i, sd in enumerate(script.scenes):
        night = "night time" if sd.night else "daytime"
        ERA_BG = {"modern": "modern city", "ancient": "prehistoric wilderness, mountains, savanna, cave, volcano", "war": "World War II battlefield ruins, smoke", "imperial": "ancient East Asian palace"}
        L += ["", f"[Cảnh {i + 1}]  ->  lưu thành: scene_{i + 1:02d}.png", f"PROMPT: wide panoramic 2D cartoon background, flat colors, thick soft outlines, no characters, no text, {ERA_BG.get(era, '')}, {sd.desc}, {night}, empty open ground in the lower third"]
    path = os.path.join(outdir, "DANH_SACH_ANH_CAN_VE.txt")
    open(path, "w", encoding="utf-8").write("\n".join(L))
    return path
