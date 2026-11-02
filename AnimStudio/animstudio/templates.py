# -*- coding: utf-8 -*-
"""MAU PROMPT (tab 'Ve ra'): moi mau la mot doan chi dan phong cach / bo cuc them vao CUOI prompt gui Google Flow cho tung khung. Khong doi nhan vat (nhan vat van giu dung nhu anh dinh kem).
Danh sach mau + goi y hop voi tung hieu ung ve. Chu trong anh do Flow tu ve (de sai chinh ta tieng Viet) -> mau yeu cau chu NGAN, nen nho kiem tra anh o buoc duyet hinh."""
import re
from . import langs

REF_WHITEBOARD = """STYLE: Classic whiteboard doodle explainer drawn with a black marker on a clean white board. No color.

BACKGROUND: Pure white (#FFFFFF) edge to edge. No paper texture, tint, vignette, drop shadows, glows, frames or background scenery.

DRAWING: Smooth black marker outlines of even medium thickness. Draw the real object, action or relationship of the scene; use simple expressive stick figures or round-headed people only when a person helps the meaning. Use only the few directly related elements needed to tell one clear idea (object focus, cause and effect, before and after, choice, growth or a simple process). Use arrows or motion lines only when they explain something.

TEXT (optional): Words only support the drawing, like a teacher's labels on an illustration: use them when a few words make the meaning clearer. Choose one form: one key idea of 2 to 6 words, or 1 to 3 short labels of 1 to 3 words naming parts of the drawing. Keep all visible text under 10 words in total. Say the meaning in your own short words; never write the SCENE SCRIPT or NEARBY SCRIPT sentences on the image, not even a long part of them. Write every word in the same language as the SCENE SCRIPT, whatever that language is, never translated, and preserve names, numbers, spelling and diacritics. Do not invent facts. If the picture is clear without words, use no text.

STYLE GUIDANCE: Keep the drawing primarily black marker on white, with no gray, filled black areas, shading or gradients. Simple symbols such as ?, !, %, a currency sign or a clock face may appear when they help explain the scene. Prefer a spacious single illustration over a dense infographic, collage or comic panel. Avoid photorealism, 3D, logos and watermarks."""

# ---- Cac mau con lai: viet lai theo CUNG CAU TRUC voi mau whiteboard cua tool tham chieu (STYLE / BACKGROUND / bo cuc / TEXT / STYLE GUIDANCE).
# LUU Y: chi mau whiteboard la nguyen van cua tool tham chieu; cac mau khac do tu viet theo cau truc do, nen thay bang nguyen van neu co.
def _text_rule(extra):
    return ("TEXT (optional): Words only support the drawing, like a teacher's labels on an illustration. " + extra + " "
            "Say the meaning in your own short words; never write the CURRENT SCENE NARRATION or NEXT SCENE NARRATION sentences on the image, not even a long part of them. "
            "Write every word in the same language as the CURRENT SCENE NARRATION, whatever that language is, never translated, and preserve names, numbers, spelling and diacritics. "
            "Do not invent facts. If the picture is clear without words, use no text.")


def _compose(style, background, layout_name, layout, text, guidance):
    return "\n\n".join(["STYLE: " + style, "BACKGROUND: " + background, layout_name + ": " + layout, _text_rule(text), "STYLE GUIDANCE: " + guidance])


_WHITE = "Pure white (#FFFFFF) edge to edge. No paper texture, tint, vignette, drop shadows, glows, frames or background scenery."
_MARKER = "Classic whiteboard doodle explainer drawn with a black marker on a clean white board. At most one accent color, used only for the single most important element."
_GUIDE_BW = ("Keep the drawing primarily black marker on white, with no gray, filled black areas, shading or gradients. Prefer a spacious single illustration over a dense infographic, collage or comic panel. "
             "Avoid photorealism, 3D, logos and watermarks.")

FULL = {
    "whiteboard": REF_WHITEBOARD,
    "story_color": _compose(
        "Colorful storytelling cartoon illustration with bold dark outlines and bright flat colors, like a children's picture-book page.",
        "Soft pastel background (one light flat color or a very gentle two-tone) with only a few simple scene details such as a ground line or one or two props. No photo textures, frames or borders.",
        "DRAWING", "Draw the real object, action or relationship of the scene with expressive cartoon characters and clear emotions. Tell one clear idea per image: one main subject plus a few directly related elements, in a spacious composition. Use arrows or motion lines only when they explain something.",
        "Use words only when a few of them make the meaning clearer: one key idea of 2 to 6 words, or 1 to 3 short labels of 1 to 3 words. Keep all visible text under 10 words in total.",
        "Flat colors with clean even outlines; no realistic shading, no gradients on characters. Avoid photorealism, 3D, logos and watermarks."),
    "whiteboard_color": _compose(
        "Colorful whiteboard doodle explainer: clean, confident black marker outlines of even thickness filled with bright flat colors, like a hand-colored doodle. Every frame of the video uses this same full-color style.",
        _WHITE,
        "DRAWING", "Draw the real object, action or relationship of the scene with expressive cartoon characters and clear emotions. One main subject plus a few directly related elements, in a spacious composition with lots of white space. "
                   "Fill objects, props, clothes and secondary people with natural bright flat colors (skin tones, clothing, food, plants, small scene details); never leave a whole picture black and white or gray. "
                   "A main character given in an attached reference image keeps exactly its own design and colors. Use arrows or motion lines only when they explain something.",
        "Use words only when a few of them make the meaning clearer: one key idea of 2 to 6 words, or 1 to 3 short labels of 1 to 3 words. Keep all visible text under 10 words in total.",
        "Flat colors with clean even black outlines on pure white; no realistic shading, no gradients, no textures, no colored or gray backgrounds. Avoid photorealism, 3D, logos and watermarks."),
    "cause_effect": _compose(
        _MARKER, _WHITE,
        "LAYOUT (CAUSE -> EFFECT)", "Left third: a simple drawing of the cause. Middle: one large bold arrow pointing to the right. Right third: a simple drawing of the effect. Draw only the real objects needed to see the cause and the result; use simple stick figures or round-headed people only when a person helps the meaning.",
        "Choose one form: no text, or one label of 1 to 3 words above the cause and one above the effect. Keep all visible text under 8 words in total.",
        _GUIDE_BW),
    "compare": _compose(
        _MARKER, _WHITE,
        "LAYOUT (SPLIT-SCREEN COMPARISON)", "A thin vertical divider splits the frame in two equal halves. Left half: the WRONG / BEFORE version marked with a red cross. Right half: the RIGHT / AFTER version marked with a green check mark. Both halves show the same subject so the difference is obvious at a glance.",
        "Choose one form: no text, or one label of 1 to 3 words at the top of each half. Keep all visible text under 8 words in total.",
        _GUIDE_BW + " Only the cross and the check mark may use color."),
    "steps": _compose(
        _MARKER, _WHITE,
        "LAYOUT (STEP-BY-STEP PROCESS)", "3 to 4 steps arranged from left to right (from top to bottom if the frame is vertical), each numbered 1, 2, 3 in a small circle and joined to the next by an arrow. One simple drawing per step showing the real object or action.",
        "One label of 1 to 3 words under each step is allowed. Keep all visible text under 12 words in total.",
        _GUIDE_BW),
    "facts": _compose(
        _MARKER, _WHITE,
        "LAYOUT (NUMBERS & FACTS)", "One HUGE bold number, percentage or short figure taken from the narration (never invented) as the hero of the frame, centered, with one small simple illustration next to it that shows what the number measures.",
        "The number itself is the main text. Add at most one label of 1 to 4 words. Keep all other text out of the image.",
        _GUIDE_BW),
    "ancient": _compose(
        "Prehistoric and ancient-world explainer drawn with loose, rough black ink brush strokes, like a simple cave or old ink drawing. At most one earthy accent color (ochre or brick red) for the single most important element.",
        _WHITE,
        "DRAWING", "Draw the real object, action or relationship of the scene with primitive-looking people, animals, tools, fire, huts, weapons or ancient buildings as the story needs. No modern technology. One clear idea per image, spacious composition.",
        "Choose one form: no text, or 1 to 3 short labels of 1 to 3 words. Keep all visible text under 10 words in total.",
        "Rough, confident ink strokes of uneven thickness; no gray wash, shading or gradients. Avoid photorealism, 3D, logos and watermarks."),
    "timeline": _compose(
        _MARKER, _WHITE,
        "LAYOUT (HISTORICAL TIMELINE)", "One horizontal axis with 3 to 5 milestones. Each milestone has a small simple drawing and a year or number taken from the narration (never invented). The milestone being told in the current scene is the largest and is highlighted with the accent color.",
        "Years or short numbers are the main text; add at most one label of 1 to 3 words per milestone. Keep all visible text under 14 words in total.",
        _GUIDE_BW),
    "mindmap": _compose(
        _MARKER, _WHITE,
        "LAYOUT (MIND MAP)", "The central idea drawn in the middle inside a circle. 3 to 5 branches radiate outward, each ending in a short keyword (1 to 3 words) next to a tiny simple icon.",
        "Keywords are the main text. Write them LARGE and clearly legible. Keep all visible text under 14 words in total.",
        _GUIDE_BW),
    "illus_notes": _compose(
        _MARKER, _WHITE,
        "LAYOUT (ILLUSTRATION + KEY POINT + NOTE)", "About 70% of the frame is one clear illustration of the scene. One short key-point line of 2 to 6 words is written large at the top. One small explanatory line of up to 10 words is written at the bottom.",
        "The key-point line and the explanatory line are the only text. Keep all visible text under 16 words in total.",
        _GUIDE_BW),
}

# (key, nhan hien thi, [hieu ung nen dung], chi dan tieng Viet, chi dan tieng Anh)
TEMPLATES = [
    ("whiteboard", "Whiteboard đen trắng · Nền trắng · nét mực đen", ["pen", "outline", "ink"],
     "Phong cách bảng trắng (whiteboard): vẽ tay bằng bút lông đen, nét mực đen đơn giản, NỀN TRẮNG TINH, gần như không tô màu (chỉ tối đa một màu nhấn nhỏ), ít chi tiết, nhiều khoảng trắng, không đổ bóng.",
     "Whiteboard doodle style: hand-drawn black marker line art, simple black ink lines, PURE WHITE background, almost no colour fills (at most one small accent colour), minimal detail, lots of white space, no shading."),
    ("whiteboard_color", "Whiteboard màu · Nền trắng · tô màu phẳng", ["pen", "outline", "brush"],
     "Phong cách bảng trắng MÀU: nét bút lông đen đều và gọn trên NỀN TRẮNG TINH, các vật và người phụ được TÔ MÀU PHẲNG tươi sáng, không đổ bóng, không chuyển màu; nhân vật chính giữ đúng như ảnh đính kèm.",
     "Colour whiteboard style: clean even black marker outlines on a PURE WHITE background, objects and secondary people filled with bright FLAT colours, no shading or gradients; the main character stays exactly as in the attached reference."),
    ("story_color", "Hoạt hình màu kể chuyện · Nền màu nhạt · nét viền đậm", ["boy_pen", "brush", "fade", "flash"],
     "Hoạt hình màu kể chuyện: nét viền đậm, màu phẳng tươi sáng, nền màu nhạt (pastel) có vài chi tiết cảnh, bố cục rõ ràng như một trang truyện tranh.",
     "Colourful storytelling cartoon: bold outlines, bright flat colours, soft pastel background with a few scene details, clear composition like a picture-book page."),
    ("cause_effect", "Nguyên nhân → Kết quả · Nền trắng · mũi tên", ["pen", "outline", "regions"],
     "Bố cục NGUYÊN NHÂN → KẾT QUẢ: nền trắng, bên trái là nguyên nhân, mũi tên lớn ở giữa, bên phải là kết quả; mỗi bên một biểu tượng/minh họa đơn giản, rõ ràng; có thể thêm nhãn rất ngắn (tối đa 3 từ, đúng chính tả).",
     "CAUSE → EFFECT layout: white background, the cause on the left, a large arrow in the middle, the effect on the right; one simple clear illustration/icon per side; optional very short labels (max 3 words, correctly spelled)."),
    ("compare", "So sánh Đúng/Sai · Trước/Sau · chia đôi khung", ["regions", "scroll", "brush"],
     "Bố cục SO SÁNH chia đôi khung hình: nửa trái là SAI / TRƯỚC (có dấu ✗ đỏ), nửa phải là ĐÚNG / SAU (có dấu ✓ xanh lá); hai nửa cùng chủ thể để thấy khác biệt; nền trắng sạch, ít chữ.",
     "SPLIT-SCREEN COMPARISON layout: left half is WRONG / BEFORE (red ✗ mark), right half is RIGHT / AFTER (green ✓ mark); the same subject on both halves to show the difference; clean white background, very little text."),
    ("steps", "Quy trình từng bước · Nền trắng · đánh số 1-2-3", ["pen", "regions", "scroll"],
     "Bố cục QUY TRÌNH TỪNG BƯỚC: nền trắng, các bước đánh số 1-2-3 sắp từ trái sang phải nối bằng mũi tên, mỗi bước một biểu tượng đơn giản; chữ ngắn, đúng chính tả.",
     "STEP-BY-STEP PROCESS layout: white background, steps numbered 1-2-3 from left to right joined by arrows, one simple icon per step; short, correctly spelled text."),
    ("facts", "Con số & sự thật · Nền trắng · chữ số lớn", ["flash", "black", "pen"],
     "Phong cách CON SỐ & SỰ THẬT: nền trắng, một CON SỐ hoặc cụm số rất lớn, đậm làm nhân vật chính của khung, kèm một biểu tượng minh họa nhỏ; không chữ thừa.",
     "NUMBERS & FACTS style: white background, one HUGE bold number (or short figure) as the hero of the frame with one small illustrative icon; no extra text."),
    ("ancient", "Tiền sử & cổ đại · Nền trắng · nét mực chấm phá", ["ink", "scroll", "brush"],
     "Phong cách TIỀN SỬ & CỔ ĐẠI: nền giấy cổ màu kem, nét mực chấm phá như tranh vẽ tay cũ, màu đất (nâu, đỏ gạch, vàng đất), bối cảnh đơn giản, không công nghệ hiện đại.",
     "PREHISTORIC & ANCIENT style: aged cream paper background, loose ink-brush strokes like an old hand drawing, earthy colours (brown, brick red, ochre), simple scene, no modern technology."),
    ("timeline", "Dòng thời gian lịch sử · Nền trắng · mốc năm", ["scroll", "regions", "pen"],
     "Bố cục DÒNG THỜI GIAN: nền trắng, một trục ngang với các mốc; mỗi mốc có một biểu tượng nhỏ và một con số năm (đúng, không bịa); sự kiện đang kể ở mốc lớn nhất.",
     "TIMELINE layout: white background, a horizontal axis with milestones; each milestone has a small icon and a year number (correct, not invented); the event being told is the largest milestone."),
    ("mindmap", "Sơ đồ ý chính · Nền trắng · chữ lớn", ["pen", "outline", "regions"],
     "Bố cục SƠ ĐỒ Ý CHÍNH: nền trắng, ý trung tâm ở giữa, các nhánh tỏa ra tới từ khóa ngắn; chữ LỚN, dễ đọc, đúng chính tả tiếng Việt; biểu tượng đơn giản.",
     "MIND-MAP layout: white background, the central idea in the middle with branches radiating to short keywords; LARGE, legible, correctly spelled text; simple icons."),
    ("illus_notes", "Minh họa + ý chính + giải thích", ["fade", "boy_pen", "brush"],
     "Bố cục MINH HỌA + Ý CHÍNH + GIẢI THÍCH: phần lớn khung là tranh minh họa; một dòng ý chính ngắn nổi bật phía trên; một dòng giải thích nhỏ phía dưới (chữ ngắn, đúng chính tả).",
     "ILLUSTRATION + KEY POINT + EXPLANATION layout: most of the frame is the illustration; one short highlighted key-point line on top; one small explanatory line at the bottom (short, correctly spelled text)."),
]
BY_KEY = {t[0]: t for t in TEMPLATES}
OVERRIDE_VI = "MẪU PHONG CÁCH (ghi đè mô tả nền / bố cục / màu ở trên nếu khác nhau; nhân vật vẫn giữ ĐÚNG như ảnh đính kèm): "
OVERRIDE_EN = "STYLE TEMPLATE (overrides the background / layout / colour description above if they differ; characters still look EXACTLY like the attached images): "


def full_text(key):
    """Prompt CHUNG day du cua mot mau (hien trong khung 'Prompt chung cho moi canh', sua duoc). Whiteboard = nguyen van mau cua tool tham chieu; cac mau khac viet lai cung cau truc."""
    return FULL.get(key, "")


def common_prompt(o):
    """Prompt chung cho moi canh cua tab 'Ve ra': noi dung o khung prompt (nguoi dung co the da sua), khong co thi lay theo mau da chon."""
    txt = str(o.get("ptpl_text") or "").strip()
    if txt:
        return txt[:6000]
    return full_text((o.get("ptpl") or "").strip())


# Anh nhan vat tham chieu: MOI canh phai ve DUNG nhan vat do (muc uu tien cao nhat, ghi de moi doan mo ta kieu nguoi que / mau o prompt chung).
REF_CLAUSE = ("REFERENCE IMAGE (HIGHEST PRIORITY, overrides any other style text in this prompt about stick figures, people, colours or \"no color\"): the attached image shows THE character of this video (if it is a model sheet with several views, poses or expressions, they are all the SAME single character). "
              "The main figure of this scene MUST be exactly this character, recreated faithfully from the attached image: identical face, head shape, hair, body proportions, outfit, colours and line style, "
              "the same in every scene. Do NOT redesign, restyle, simplify, age, recolour or replace it with a stick figure or a generic person. "
              "Change only its pose, expression and action so it acts out the CURRENT SCENE NARRATION. "
              "Copy nothing else from the attached image (not its background, layout, pose or text). "
              "If a second person is needed, draw them in the same drawing style but clearly different from this character.")
REF_LEAD = "The attached image is the CHARACTER REFERENCE: the main figure of this picture must look exactly like the character in the attached image (details under REFERENCE IMAGE below)."
REF_REMIND = "REMINDER: the character in this image must look exactly like the character in the attached reference image."


_VI = re.compile("[àáạảãâầấậẩẫăằắặẳẵèéẹẻẽêềếệểễìíịỉĩòóọỏõôồốộổỗơờớợởỡùúụủũưừứựửữỳýỵỷỹđ]", re.I)


def detect_lang(text):
    """'vi' (co dau tieng Viet) | 'en' (chi chu cai ASCII) | ma ngon ngu khac nhan ra qua chu viet ('zh' 'ja' 'ko' 'th' 'ru' 'hi' 'ar') | 'other' | '' (khong du chu de doan)."""
    t = str(text or "")
    letters = re.findall(r"[^\W\d_]", t)
    if len(letters) < (3 if langs.has_cjk(t) else 8):
        return ""
    d = langs.detect(t)
    if d == "vi":
        return "vi"
    if d == "en":
        return "en" if sum(1 for c in letters if ord(c) < 128) / float(len(letters)) >= 0.97 else "other"
    return d if d in langs.POOL else "other"


_TEXT_NOTE = {"zh": " Use simplified Chinese characters.", "tw": " Use traditional Chinese characters.", "hk": " Use traditional Chinese characters.",
              "ja": " Use natural Japanese (kanji and kana).", "ko": " Use Hangul."}


def lang_clause(lang):
    """Cau lenh BAT BUOC ve ngon ngu chu viet TRONG ANH: Gemini/Flow nhan prompt tieng Anh nen hay tu viet nhan tieng Anh du kich ban la tieng Viet."""
    if lang == "vi":
        return ("TEXT LANGUAGE (mandatory): the narration is VIETNAMESE, so every word written inside the picture (titles, captions, labels, speech bubbles, signs) MUST be Vietnamese with all diacritics (ă â ê ô ơ ư đ and tone marks). "
                "Never write English words. If no text is needed, write none.")
    if lang == "en":
        return ("TEXT LANGUAGE (mandatory): the narration is ENGLISH, so every word written inside the picture (titles, captions, labels, speech bubbles, signs) MUST be English. "
                "Never write Vietnamese or any other language. If no text is needed, write none.")
    if langs.known(lang):
        nm = langs.name_en(lang)
        return ("TEXT LANGUAGE (mandatory): the narration is %s, so every word written inside the picture (titles, captions, labels, speech bubbles, signs) MUST be %s, in its own correct script and spelling."
                % (nm.upper(), nm) + _TEXT_NOTE.get(lang, "") + " Never write English or Vietnamese words. If no text is needed, write none.")
    if lang == "other":
        return ("TEXT LANGUAGE (mandatory): every word written inside the picture (titles, captions, labels, speech bubbles, signs) MUST be in the SAME language and script as the narration, never translated and never English unless the narration is English. "
                "If no text is needed, write none.")
    return ""


def lang_remind(lang):
    r = {"vi": "REMINDER: any text inside the image must be VIETNAMESE (with diacritics), never English.",
         "en": "REMINDER: any text inside the image must be ENGLISH.",
         "other": "REMINDER: any text inside the image must be in the same language as the narration."}.get(lang, "")
    if not r and langs.known(lang):
        r = "REMINDER: any text inside the image must be %s, never English." % langs.name_en(lang).upper()
    return r


def scene_prompt(common, text, nxt="", has_ref=False, visual="", lang=None):
    """Prompt gui Flow cho MOT canh, theo dung kieu tool tham chieu: prompt chung + (neu co anh tham chieu) chi dan dung anh + CURRENT SCENE NARRATION / SUBTITLE (cau cua canh) + NEXT SCENE NARRATION (cau ke tiep, chi de hieu mach truyen)."""
    p = (REF_LEAD + "\n\n") if has_ref else ""              # chi dan nhan vat dat o DAU prompt (prompt chung dai kieu 'nguoi que' khong de len anh mau)
    p += (common.strip() + "\n\n") if (common or "").strip() else ""
    if has_ref:
        p += REF_CLAUSE + "\n\n"
    if lang is None:
        lang = detect_lang(str(text or "") + " " + str(nxt or ""))
    lc = lang_clause(lang)
    p += (lc + "\n\n") if lc else ""
    p += "CURRENT SCENE NARRATION / SUBTITLE: " + " ".join(str(text or "").split())[:600]
    vis = " ".join(str(visual or "").split())[:700]
    if vis:                                   # AI da doc hieu truyen: canh nay can ve cai gi
        p += "\nWHAT TO DRAW IN THIS SCENE: " + vis
    nx = " ".join(str(nxt or "").split())[:400]
    if nx:
        p += "\nNEXT SCENE NARRATION: " + nx
    if has_ref:
        p += "\n\n" + REF_REMIND
    lr = lang_remind(lang)
    if lr:
        p += "\n" + lr
    return p


REF_SHORT = ("Draw ONE picture of the scene below. The main character must look exactly like the character in the attached reference image "
             "(same face, head, hair, outfit, colours and line style); change only its pose, expression and action. Do not copy the reference's layout, background or any text.")


def scene_prompt_short(common, text, nxt="", has_ref=False, visual="", lang=None):
    """Ban NGAN cua scene_prompt (cach thu khi Flow bao 'Khong thanh cong' voi ban day du): bo cac khoi chi dan dai ve anh mau, giu prompt chung (kieu ve) va loi cua canh."""
    p = (REF_SHORT + "\n\n") if has_ref else ""
    cm = " ".join(str(common or "").split())
    if len(cm) > 500:                                    # cat o cuoi CAU, khong cat giua tu
        cut = cm[:500]; k = max(cut.rfind(". "), cut.rfind("; "))
        cm = cut[:k + 1] if k >= 200 else cut.rsplit(" ", 1)[0]
    if cm:
        p += cm + "\n\n"
    if lang is None:
        lang = detect_lang(str(text or "") + " " + str(nxt or ""))
    p += "SCENE: " + " ".join(str(text or "").split())[:400]
    vis = " ".join(str(visual or "").split())[:400]
    if vis:
        p += "\nWHAT TO DRAW: " + vis
    lr = lang_remind(lang)
    if lr:
        p += "\n" + lr
    return p


def choices():
    """[(key, nhan)] cho o chon; '' = tu nhap prompt."""
    return [("", "— Tự nhập prompt —")] + [(t[0], t[1]) for t in TEMPLATES]


SUGGEST = {"pen": "whiteboard", "boy_pen": "story_color", "scroll": "ancient", "outline": "whiteboard", "brush": "story_color", "ink": "ancient",
           "regions": "cause_effect", "tear": "illus_notes", "slide": "story_color", "iris": "illus_notes", "blinds": "cause_effect", "black": "facts", "fade": "illus_notes", "flash": "facts", "cut": ""}


def suggest(effect):
    """Mau goi y cho mot hieu ung ('' = khong goi y -> tu nhap)."""
    return SUGGEST.get(effect, "")


def resolve(o):
    """(vi, en) can them vao cuoi prompt khung, tu cai dat giao dien: o['ptpl'] = key mau, hoac '' + o['ptpl_text'] = prompt tu nhap. ('', '') = khong them gi."""
    key = (o.get("ptpl") or "").strip()
    if key in BY_KEY:
        t = BY_KEY[key]
        return OVERRIDE_VI + t[3], OVERRIDE_EN + t[4]
    txt = " ".join(str(o.get("ptpl_text") or "").split())[:600]
    if txt:
        return OVERRIDE_VI + txt, OVERRIDE_EN + txt
    return "", ""


# ---- Chia loi ke thanh canh cho tab 'Ve ra': MOI CAU = 1 CANH (tu nhan dien); che do cu theo so ky tu van con cho du an / kiem thu cu.
_ABBR = {"tp", "dr", "mr", "mrs", "ms", "ts", "pgs", "gs", "ths", "st", "vs", "no", "ông", "bà"}


def _sentences(para):
    if langs.has_cjk(para):          # chu Han / Nhat / Han: cau ket thuc bang 。！？ va khong co dau cach sau do
        return langs.split_sentences(para)
    out, cur = [], []
    for tok in para.split():
        cur.append(tok)
        core = tok.rstrip("”\"')]»")
        if core and core[-1] in ".!?…" and core.rstrip(".!?…").lower() not in _ABBR:
            out.append(" ".join(cur)); cur = []
    if cur:
        out.append(" ".join(cur))
    return out


def _cut_long(s, maxc):
    """Cau qua dai (> 1.8 maxc) thi cat o dau phay / cham phay gan giua nhat (moi nua >= 20 ky tu)."""
    if langs.has_cjk(s):             # chu Han / Nhat / Han: ~25 chu moi canh 6 giay; cau dai hon ~100 chu thi cat o dau phay (，、)
        return langs.cut_clauses(s, int(min(maxc * 1.8, 100)))
    if len(s) <= maxc * 1.8:
        return [s]
    mid, best = len(s) / 2.0, None
    for i, ch in enumerate(s):
        if ch in ",;:" and i + 1 < len(s) and s[i + 1] == " " and 20 <= i + 1 <= len(s) - 20:
            if best is None or abs(i - mid) < abs(best - mid):
                best = i
    if best is None:
        return [s]
    return _cut_long(s[:best + 1].strip(), maxc) + _cut_long(s[best + 1:].strip(), maxc)


SCENE_SECS = 6.0                  # moi canh ~6 giay loi doc (10 phut ~ 100 canh)
WPS_DEFAULT = dict(langs.WPS)      # tu / giay o toc do 1.0 (chu Han / Kana / Hangul / Thai: ky tu / giay) — xem langs.py

_STOP = frozenset("và là của có một những các cho với không được này đó khi thì mà để trong ra vào đã sẽ rất cũng như nó anh em tôi bạn ta họ người cái việc ở từ lại đang vẫn còn nhưng nên vì bị bằng theo về nếu hay hoặc cả mọi đều cùng lên xuống the a an of to in and is are was were it that this for on with as at by he she they we you i".split())
_SHIFT = re.compile(r"^\W*(một hôm|hôm sau|sáng hôm sau|ngày hôm sau|hôm đó|hôm nay|sau đó|sau khi|thế rồi|cho đến khi|lúc ấy|khi ấy|lúc đó|trong khi đó|ở một|vào năm|năm \d|đầu tiên|trước hết|thứ nhất|thứ hai|thứ ba|thứ tư|tiếp theo|tiếp đến|cuối cùng|bước \d|chương|phần \d|mở đầu|kết luận|tóm lại|ngày xưa|ngày nay|hiện nay|ngày \d|đêm |tối |sáng |chiều |khuya|một là|hai là|ví dụ|chẳng hạn|meanwhile|later|the next|first|second|third|finally|next|in \d{3,4}|once upon|for example|one day"
                    r"|第二天|后来|後來|然后|然後|接着|接著|与此同时|與此同時|有一天|从前|從前|首先|其次|最后|最後|总之|總之|例如|比如|翌日|その後|ある日|昔々|むかしむかし|まず|次に|最後に|例えば|一方|その頃"
                    r"|다음 날|그 후|어느 날|옛날에|먼저|다음으로|마지막으로|예를 들어|한편"
                    r"|однажды|на следующий день|потом|затем|наконец|например|plus tard|le lendemain|un jour|ensuite|enfin|par exemple|zuerst|dann|später|am nächsten tag|eines tages|zum beispiel"
                    r"|luego|al día siguiente|un día|por ejemplo|depois|no dia seguinte|certo dia|por exemplo|poi|il giorno dopo|un giorno|infine|ad esempio|pada suatu hari|keesokan harinya|kemudian|suatu hari)", re.I)
_CONT = re.compile(r"^\W*(và |nhưng |vì vậy|vì thế|do đó|bởi vậy|cho nên|thế nên|tuy nhiên|ngoài ra|hơn nữa|đồng thời|thêm vào đó|cũng |còn |mà |nên |vậy |and |but |so |therefore|however|also|because|which|that is|thus"
                  r"|并且|並且|而且|但是|可是|所以|因此|然而|另外|同时|同時|于是|於是|不过|不過|そして|しかし|だから|それで|また|さらに|けれども|でも|그리고|하지만|그래서|그러나|또한|그런데"
                  r"|и |но |а |поэтому|однако|et |mais |donc |car |und |aber |also |pero |sin embargo|ma |però|dan |tetapi|jadi)", re.I)


def target_words(text="", wps=None, speed=1.0, lang=None):
    """So tu moi canh de loi doc ~SCENE_SECS giay (theo toc do doc cua ngon ngu + toc do nguoi dung chon)."""
    from .common import detect_lang
    lg = lang if lang in WPS_DEFAULT else detect_lang(text or "")
    w = (wps or {}).get(lg) or WPS_DEFAULT.get(lg, 4.6)
    try:
        sp = max(0.5, float(speed or 1.0))
    except (TypeError, ValueError):
        sp = 1.0
    return max(8, int(round(w * sp * SCENE_SECS)))


def _tok(s):
    s = s.lower()
    if langs.has_cjk(s):             # chu Han / Nhat / Han: lay cap 2 chu lien nhau lam "tu" (khong co dau cach de tach)
        runs = re.findall("[\u3400-\u4dbf\u4e00-\u9fff\u3040-\u30ff\uac00-\ud7af]+", s)
        return {r[i:i + 2] for r in runs for i in range(len(r) - 1)} | {w for w in re.findall(r"[a-z0-9]{2,}", s) if w not in _STOP}
    return {w for w in re.findall(r"\w+", s) if len(w) >= 2 and w not in _STOP}


_HAN_KANA = re.compile("[\u3400-\u4dbf\u4e00-\u9fff\u3040-\u30ff]")


def _join(parts):
    """Noi cac cau: bang dau cach, tru chu Han / Kana (viet lien, khong dau cach giua cac cau)."""
    out = ""
    for p in parts:
        if out and not (_HAN_KANA.search(out[-1:]) and _HAN_KANA.search(p[:1]) or (out[-1:] in "。！？" and _HAN_KANA.search(p[:1]))):
            out += " "
        out += p
    return out


def group_sentences(units, T):
    """Nhu group_cuts nhung tra ve chuoi (cac cau cua moi canh noi bang dau cach; chu Han / Kana noi lien)."""
    return [_join(u[0] for u in units[i:j]) for i, j in group_cuts(units, T)]


def group_cuts(units, T):
    """Gom cac cau thanh canh THEO NGHIA (offline, du phong khi khong co AI): moi canh ~T tu; chi ngat o cho doi y: co tu chuyen y
    ("Mot hom", "Sau do", "Thu nhat"...), it tu chung voi cau truoc, hoac xuong dong / doan moi; khong ngat truoc tu noi tiep ("Va", "Nhung", "Vi vay").
    units = [(cau, brk)] brk = 0 cung dong, 1 xuong dong, 2 doan moi (dong trong). Tra ve list (i, j): canh = units[i:j]."""
    n = len(units)
    if n == 0:
        return []
    ws = [langs.wcount(u[0]) for u in units]
    pre = [0]
    for w in ws:
        pre.append(pre[-1] + w)
    toks = [_tok(u[0]) for u in units]

    def coh(k):                                  # do lien quan noi dung giua 2 cau quanh cho ngat k (truoc cau k)
        A = toks[max(0, k - 2)] | toks[k - 1] if k >= 1 else set()
        B = toks[k] | (toks[k + 1] if k + 1 < n else set())
        if not A or not B:
            return 0.0
        return len(A & B) / (len(A) * len(B)) ** 0.5

    bc = [0.0] * (n + 1)
    for k in range(1, n):
        c = 0.3 + 1.2 * coh(k)
        t = units[k][0]
        if _CONT.match(t):
            c += 1.4
        if _SHIFT.match(t):
            c -= 0.9
        c -= {0: 0.0, 1: 0.5, 2: 1.5}.get(units[k][1], 0.0)
        bc[k] = max(-1.8, c)
    hard = 1.8 * T
    INF = float("inf")
    dp = [INF] * (n + 1)
    prv = [0] * (n + 1)
    dp[0] = 0.0
    for j in range(1, n + 1):
        i = j - 1
        while i >= 0:
            W = pre[j] - pre[i]
            if W > hard and j - i > 1:
                break
            seg = 1.6 * ((W - T) / T) ** 2 + (1.5 if W < 0.45 * T else 0.0)
            c = dp[i] + seg + (bc[i] if i > 0 else 0.0)
            if c < dp[j]:
                dp[j], prv[j] = c, i
            i -= 1
    cuts, j = [], n
    while j > 0:
        cuts.append((prv[j], j))
        j = prv[j]
    return list(reversed(cuts))


def split_scenes(text, maxc=None, wps=None, speed=1.0):
    """Loi ke -> danh sach canh. Moi dong la ranh gioi cung.
    maxc = None / 0 (MAC DINH): gom cau thanh canh THEO NGHIA, moi canh ~6 giay loi doc (group_sentences). maxc = so (cu / kiem thu): gop cau toi maxc ky tu."""
    try:
        maxc = int(maxc) if maxc not in (None, "", 0, "0") else 0
    except (TypeError, ValueError):
        maxc = 0
    if maxc:
        maxc = max(30, min(400, maxc))
    out = []
    for para in [p.strip() for p in str(text or "").replace("\r", "").split("\n") if p.strip()]:
        sents = [c for x in _sentences(para) for c in _cut_long(x, maxc or 220)]
        if not maxc:
            out += group_sentences([(x, 0) for x in sents], target_words(para, wps, speed))
            continue
        cur = ""
        for s_ in sents:
            if cur and len(cur) + 1 + len(s_) > maxc:
                out.append(cur)
                cur = s_
            else:
                cur = _join([cur, s_]) if cur else s_
        if cur:
            out.append(cur)
    return out


def draw_script(text, maxc=None):
    """Kich ban 'Dan: ...' (loi dan) cho tab 'Ve ra', moi dong la mot canh (khung)."""
    return "\n".join("Dẫn: " + x for x in split_scenes(text, maxc))


_DSL_LINE = re.compile(r"^([^:：\[\(\n@#/]{1,40}?\s*(?:[\(\[][^\)\]]{1,30}[\)\]])?\s*[:：])\s*(\S.*)$")


def is_narrator(prefix):
    p = re.sub(r"[\s:：]+$", "", str(prefix or "")).strip().lower()
    p = re.sub(r"\s*[\(\[].*$", "", p).strip()
    if p in ("", "dẫn truyện", "kể", "nd"):
        return True
    try:
        from .script import NARRATORS
        return p in NARRATORS
    except Exception:
        return p in ("dẫn", "lời dẫn", "người dẫn", "narrator")


def script_units(script, marks=True):
    """Kich ban DSL -> danh sach don vi theo thu tu: ("cmd", dong_lenh) hoac ("say", prefix, cau, brk, lid).
    brk: 0 = cung dong voi cau truoc, 1 = dong moi, 2 = sau dong trong (doan moi); lid = so thu tu dong goc (de khong gop thoai cua 2 dong khac nhau)."""
    out, blank, lid = [], False, 0
    for raw in str(script or "").replace("\r", "").split("\n"):
        s_ = raw.strip()
        if not s_:
            blank = True
            continue
        if s_.startswith(("@", "[", "#", "//")) or re.match(r"^-{3,}", s_):
            if not marks and re.match(r"^\[\s*(?:cảnh|canh|scene)\b", s_, re.I):
                continue                                 # moc canh do bo nhan dien tu chen theo do dai: khong phai ranh gioi that
            out.append(("cmd", s_))
            blank = False
            continue
        m = _DSL_LINE.match(s_)
        prefix, body = (re.sub(r"\s+", " ", m.group(1).strip()), m.group(2)) if m else ("Dẫn:", s_)
        lid += 1
        for k, x in enumerate([c for y in _sentences(body) for c in _cut_long(y, 220)]):
            out.append(("say", prefix, x, ((2 if blank else 1) if k == 0 else 0), lid))
        blank = False
    return out


def refine_script(script, maxc=None, wps=None, speed=1.0, marks=True):
    """Kich ban (da qua bo nhan dien cua tab Tao Video Story: loi dan / nhan vat / thoai) -> kich ban moi dong = mot canh (khong co AI: gom cau theo nghia).
    MAC DINH (maxc rong): cac dong LOI DAN lien nhau duoc gom thanh canh ~6 giay loi doc moi canh; thoai cua nhan vat: moi dong van la mot canh (moi nguoi mot giong),
    nhung ben trong dong dai thi gom cau theo nghia. Dong lenh (@..., [Canh: ...], ---, #) giu nguyen va ngat mach. maxc = so ky tu: che do cu."""
    return "\n".join(p + " " + t if p else t for p, t, _ in offline_lines(script, maxc, wps, speed, marks))


def offline_lines(script, maxc=None, wps=None, speed=1.0, marks=True):
    """Nhu refine_script nhung tra ve [(prefix, van_ban, kieu)] kieu = 'say' | 'cmd' (dong lenh: prefix rong)."""
    out = []
    run = [None, []]                       # [prefix, [(cau, brk)]] dong loi dan dang gom

    def flush():
        if run[0] is not None and run[1]:
            T = target_words(" ".join(u[0] for u in run[1]), wps, speed)
            out.extend((run[0], c, "say") for c in group_sentences(run[1], T))
        run[0], run[1] = None, []

    items = script_units(script, marks)
    i = 0
    while i < len(items):
        it = items[i]
        if it[0] == "cmd":
            flush()
            out.append(("", it[1], "cmd"))
            i += 1
            continue
        _, prefix, sent, brk, lid = it
        if maxc:                           # che do cu theo so ky tu: moi dong goc cat theo so ky tu
            j = i
            body = []
            while j < len(items) and items[j][0] == "say" and items[j][4] == lid:
                body.append(items[j][2])
                j += 1
            out.extend((prefix, c, "say") for c in split_scenes(" ".join(body), maxc))
            i = j
            continue
        if is_narrator(prefix):
            if run[0] is not None and run[0] != prefix:
                flush()
            run[0] = prefix
            run[1].append((sent, brk if run[1] else 0))
            i += 1
            continue
        j = i
        sents = []
        while j < len(items) and items[j][0] == "say" and items[j][4] == lid:
            sents.append((items[j][2], 0))
            j += 1
        flush()
        out.extend((prefix, c, "say") for c in group_sentences(sents, target_words(" ".join(x[0] for x in sents), wps, speed)))
        i = j
    flush()
    return out

