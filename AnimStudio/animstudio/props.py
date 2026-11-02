# -*- coding: utf-8 -*-
"""HINH MINH HOA CHO CAC KIEU 'VE RA' do AI (Google Flow) ve: ban tay nguoi that cam but, cau be cam but, cau be keo cuon tranh, cuon tranh, tay cam co.
Moi hinh: nho Flow ve tren NEN XANH LA -> tach nen thanh PNG trong suot -> tu tim diem neo (ngon but / ban tay) -> luu o <DATA>/reveal/<ten>.png (+ .json).
Hoac dung anh cua ban (PNG da xoa nen, hoac nen xanh la / trang tron). KHONG co hinh ve san bang code: chua co hinh nao thi hieu ung chay khong co hinh do (va tool tu nho Flow ve o video tiep theo)."""
import io
import json
import os
import numpy as np
from PIL import Image, ImageFilter

from . import common

GREEN = ("Isolated on a perfectly flat solid pure bright green (#00FF00) chroma-key background, no shadow on the background, no floor, no text, no other objects, "
         "and NO green anywhere on the subject itself. Square image.")
# key -> (nhan, ti le, diem neo: 'll' = xa nhat ve duoi-trai, 'ul' = xa nhat ve tren-trai, 'r' = xa nhat ve ben phai, 'top' = giua canh tren; fade = goc co tay ao de lam mo dan: 'ur' tren-phai, 'dr' duoi-phai)
ASSETS = {
    "hand": dict(label="Bàn tay cầm bút (kiểu 'Vẽ tay từng nét bút')", aspect="1:1", anchor="ll", fade="ur",
                 prompt="A photorealistic close-up photograph of a real adult MAN's right hand with light-tan skin holding a black felt-tip marker pen, in the pose of drawing on paper. "
                        "The pen points to the LOWER-LEFT corner of the image with its tip clearly visible; the hand, wrist and a piece of plain light-blue long shirt sleeve come in diagonally from the UPPER-RIGHT corner. "
                        "Natural skin, realistic fingers (exactly five fingers, thumb and index finger pinching the pen), soft even studio lighting. " + GREEN,
                 vi="Ảnh chụp thật, cận cảnh bàn tay phải của một người đàn ông da sáng ngăm đang cầm cây bút lông đen như đang vẽ. Ngòi bút chĩa về góc DƯỚI-TRÁI và thấy rõ; bàn tay, cổ tay và một đoạn tay áo dài xanh nhạt trơn đi chéo từ góc TRÊN-PHẢI vào. "
                        "Đúng 5 ngón, ngón cái và ngón trỏ kẹp bút, ánh sáng đều. Nền xanh lá #00FF00 phẳng, không bóng đổ, không chữ, không vật khác, KHÔNG có màu xanh lá trên tay/áo. Ảnh vuông."),
    "boy": dict(label="Cậu bé cầm bút (kiểu 'Cậu bé cầm bút')", aspect="1:1", anchor="r", fade=False,
                prompt="A cute cartoon boy, about 8 years old, full body entirely inside the frame, side view facing RIGHT, standing on the left part of the image, short spiky BLACK hair, round glasses, bright ORANGE t-shirt, dark navy shorts, red sneakers. "
                       "His right arm is stretched forward holding a big black marker pen pointing forward-down; the pen tip is the RIGHT-MOST point of the whole picture. Colourful flat cartoon style, clean thick dark outline. " + GREEN,
                vi="Cậu bé hoạt hình dễ thương khoảng 8 tuổi, thấy TOÀN THÂN trong khung, nhìn nghiêng sang PHẢI, đứng ở nửa trái ảnh; tóc đen dựng ngắn, đeo kính tròn, áo thun CAM sáng, quần short xanh navy, giày thể thao đỏ. "
                       "Tay phải duỗi thẳng ra trước cầm cây bút lông đen to, ngòi chĩa xuống-phía trước; ngòi bút là điểm xa nhất bên PHẢI của cả bức ảnh. Phong cách hoạt hình màu phẳng, viền đậm sạch. Nền xanh lá #00FF00 phẳng, không bóng đổ, không chữ, KHÔNG có màu xanh lá trên nhân vật. Ảnh vuông."),
    "boyhold": dict(label="Cậu bé kéo cuộn tranh (kiểu 'Mở cuộn tranh')", aspect="1:1", anchor="r", fade=False,
                    prompt="A DIFFERENT cute cartoon boy (not the same as a boy with glasses): about 7 years old, full body entirely inside the frame, side view facing RIGHT, leaning forward and pulling with both arms stretched forward as if dragging something heavy. "
                           "Curly BROWN hair with a red baseball cap, light-blue overalls over a white shirt, brown boots. His two hands are the RIGHT-MOST point of the whole picture and hold nothing. Colourful flat cartoon style, clean thick dark outline. " + GREEN,
                    vi="Một cậu bé hoạt hình KHÁC hẳn (không đeo kính): khoảng 7 tuổi, thấy TOÀN THÂN trong khung, nhìn nghiêng sang PHẢI, người chồm về trước, hai tay duỗi thẳng ra trước như đang kéo một vật nặng. "
                           "Tóc nâu xoăn đội mũ lưỡi trai ĐỎ, yếm quần xanh dương nhạt mặc trong áo trắng, ủng nâu. Hai bàn tay là điểm xa nhất bên PHẢI của bức ảnh và KHÔNG cầm gì. Hoạt hình màu phẳng, viền đậm sạch. Nền xanh lá #00FF00 phẳng, không bóng đổ, không chữ, KHÔNG có màu xanh lá trên nhân vật. Ảnh vuông."),
    "roll": dict(label="Cuộn tranh (kiểu 'Mở cuộn tranh')", aspect="9:16", anchor="top", fade=False,
                 prompt="A tall rolled-up ancient paper scroll standing vertically, front view, cream parchment rolled into a thick cylinder with dark wooden rods and small round knobs on the top and bottom ends, "
                        "filling most of the image height, colourful flat illustration style with a thin dark outline. " + GREEN,
                 vi="Một cuộn tranh giấy cổ dựng đứng, nhìn thẳng từ phía trước: giấy màu kem cuộn thành ống dày, hai đầu trên và dưới có trục gỗ tối màu và núm tròn nhỏ, cao gần hết khung ảnh, phong cách minh họa phẳng viền mảnh tối. Nền xanh lá #00FF00 phẳng, không bóng đổ, không chữ, KHÔNG có màu xanh lá trên cuộn tranh. Ảnh đứng 9:16."),
    "brush": dict(label="Tay cầm cọ (kiểu 'Hiện ảnh bằng nét cọ')", aspect="1:1", anchor="ul", fade="dr",
                  prompt="A flat, straight-on view of a real adult WOMAN's right hand with fair skin and short natural nails, reaching INTO the picture from OUTSIDE the frame like the hand overlay in whiteboard-animation videos: "
                         "the forearm in a plain cream-coloured rolled-up sleeve enters from the LOWER-RIGHT edge of the image (cut off by the image edge), and the hand holds a big round ink paintbrush with a bamboo handle and a black wet-ink tip. "
                         "The brush points inward along the image plane, at a diagonal toward the UPPER-LEFT, with the brush tip clearly visible. "
                         "Everything lies in one flat plane facing the camera, equally sharp: NO depth of field, NO blur, NO perspective, NO foreshortening. "
                         "NO canvas, NO paper, NO table and NO surface anywhere (the brush touches nothing), no cast shadow. Exactly five fingers, flat even soft lighting. " + GREEN,
                  vi="Ảnh nhìn thẳng, phẳng, bàn tay phải của một người phụ nữ da sáng, móng ngắn tự nhiên, THÒ VÀO khung hình từ NGOÀI khung như bàn tay trong các video whiteboard animation: "
                         "cẳng tay mặc tay áo xắn màu kem trơn đi vào từ mép DƯỚI-PHẢI của ảnh (bị mép ảnh cắt ngang), bàn tay cầm cây cọ mực tròn to cán tre, đầu cọ đen ướt mực. "
                         "Cây cọ chĩa vào phía trong khung theo đường chéo về góc TRÊN-TRÁI, thấy rõ đầu cọ. "
                         "Tất cả nằm trên một mặt phẳng hướng về camera, nét đều: KHÔNG xóa phông / mờ chiều sâu, KHÔNG phối cảnh, KHÔNG rút gọn hình. "
                         "KHÔNG có giấy, canvas, bàn hay bề mặt nào trong ảnh (cọ không chạm gì), không bóng đổ. Đúng 5 ngón, ánh sáng phẳng đều. Nền xanh lá #00FF00 phẳng, không chữ, KHÔNG có màu xanh lá trên tay/áo. Ảnh vuông."),
}
KEYS = list(ASSETS)
NEED = {"pen": ("hand",), "boy_pen": ("boy",), "scroll": ("boyhold", "roll"), "brush": ("brush",)}      # hieu ung -> cac hinh AI no can


def folder():
    d = os.path.join(common.DATA_DIR, "reveal")
    os.makedirs(d, exist_ok=True)
    return d


def defaults_dir():
    """Hinh MAC DINH di kem tool (da duyet, chot san): <thu muc cai dat>/reveal_defaults/<ten>.png (+ .json diem neo). Hinh cua nguoi dung (AnimStudioData/reveal) duoc uu tien hon."""
    return os.path.join(common.APP_DIR, "reveal_defaults")


def _user_png(key):
    return os.path.join(common.DATA_DIR, "reveal", key + ".png")


def _where(key):
    """Thu muc dang cung cap hinh `key`: hinh nguoi dung truoc, roi hinh mac dinh di kem; None neu khong co."""
    if key not in ASSETS:
        return None
    for d in (os.path.join(common.DATA_DIR, "reveal"), defaults_dir()):
        if os.path.isfile(os.path.join(d, key + ".png")):
            return d
    return None


def png_path(key):
    d = _where(key)
    return os.path.join(d or os.path.join(common.DATA_DIR, "reveal"), key + ".png")


def meta_path(key):
    d = _where(key)
    return os.path.join(d or os.path.join(common.DATA_DIR, "reveal"), key + ".json")


def exists(key):
    return _where(key) is not None


def state():
    """[{key, label, has, ts}] cho giao dien."""
    out = []
    for k in KEYS:
        ts = 0
        if exists(k):
            try:
                ts = int(os.path.getmtime(png_path(k)))
            except OSError:
                ts = 1
        out.append(dict(key=k, label=ASSETS[k]["label"], has=exists(k), ts=ts, own=os.path.isfile(_user_png(k))))
    return out


def _largest(mask):
    from . import ndi
    lab, n = ndi.label(mask)
    if n <= 1:
        return mask
    cnt = np.bincount(lab.ravel())
    cnt[0] = 0
    return lab == int(cnt.argmax())


def cutout(im, maxh=900):
    """Tach nen: nen xanh la -> chroma key (co khu vien xanh); nen trang / mau tron khac -> loang tu mep. Tra ve anh RGBA da cat sat; ValueError neu khong tach duoc."""
    from . import ndi
    im = im.convert("RGB")
    if im.height > maxh:
        im = im.resize((max(1, int(im.width * maxh / im.height)), maxh), Image.LANCZOS)
    a = np.asarray(im, np.float32)
    H, W = a.shape[:2]
    border = np.concatenate([a[0], a[-1], a[:, 0], a[:, -1]])
    bg = np.median(border, axis=0)
    r, g, b = a[:, :, 0], a[:, :, 1], a[:, :, 2]
    if bg[1] > bg[0] + 40 and bg[1] > bg[2] + 40:                     # nen xanh la
        mx = np.maximum(r, b)
        gn = g - mx
        alpha = np.clip(1.0 - (gn - 22.0) / 80.0, 0.0, 1.0)
        spill = np.clip((gn - 4.0) / 60.0, 0.0, 1.0)                   # khu vien xanh o mep
        a[:, :, 1] = np.where(g > mx, g - gn * spill, g)
    else:                                                              # nen khac: pixel gan mau nen va noi voi mep
        d = np.sqrt(((a - bg[None, None, :]) ** 2).sum(2))
        lab, n = ndi.label(d < 34.0)
        edge = set(np.unique(np.concatenate([lab[0], lab[-1], lab[:, 0], lab[:, -1]])).tolist()) - {0}
        bgm = np.isin(lab, list(edge)) if edge else np.zeros(d.shape, bool)
        alpha = 1.0 - np.asarray(Image.fromarray((bgm * 255).astype(np.uint8)).filter(ImageFilter.GaussianBlur(1.1)), np.float32) / 255.0
    solid = _largest(alpha > 0.5)
    if float(solid.mean()) < 0.02 or float(solid.mean()) > 0.85:
        raise ValueError("Không tách được hình khỏi nền (ảnh không có nền xanh lá / trắng trơn rõ ràng). Thử tạo lại.")
    alpha = alpha * ndi.binary_dilation(solid, iterations=3)           # bo cac dom roi ngoai vat the chinh
    ys, xs = np.nonzero(alpha > 0.05)
    x0, x1, y0, y1 = max(0, int(xs.min()) - 3), min(W, int(xs.max()) + 4), max(0, int(ys.min()) - 3), min(H, int(ys.max()) + 4)
    rgb = np.clip(a[y0:y1, x0:x1], 0, 255).astype(np.uint8)
    out = np.dstack([rgb, np.clip(alpha[y0:y1, x0:x1] * 255 + 0.5, 0, 255).astype(np.uint8)])
    return Image.fromarray(out, "RGBA")


def find_anchor(rgba, mode):
    """Diem neo (x, y) theo anh: 'll' = xa nhat ve duoi-trai, 'ul' = xa nhat ve tren-trai (ngon but / dau co), 'r' = xa nhat ve ben phai (ngon but / ban tay cau be), 'top' = giua canh tren."""
    al = np.asarray(rgba.getchannel("A"), np.uint8)
    ys, xs = np.nonzero(al > 128)
    if len(xs) == 0:
        return rgba.width // 2, 0
    if mode == "top":
        return rgba.width // 2, 0
    xf, yf = xs.astype(np.float32), ys.astype(np.float32)
    sc = {"ll": yf - xf, "ul": -(xf + yf)}.get(mode, xf)                  # 'r' (mac dinh): xa nhat ve phai
    idx = np.argsort(-sc)[:10 if mode in ("ll", "ul") else 14]
    return int(xs[idx].mean()), int(ys[idx].mean())


def save(key, rgba, anchor=None):
    d = folder()
    rgba.save(os.path.join(d, key + ".png"))
    t = anchor or find_anchor(rgba, ASSETS[key]["anchor"])
    json.dump(dict(anchor=[int(t[0]), int(t[1])], size=list(rgba.size)), open(os.path.join(d, key + ".json"), "w", encoding="utf-8"))
    _drop_cache()
    return t


def _drop_cache():
    try:
        from . import sprites
        sprites.clear_cache()
    except Exception:
        pass


def reset(key):
    """Xoa hinh CUA NGUOI DUNG (quay ve hinh mac dinh di kem neu co). Khong dong vao hinh mac dinh."""
    for p in (_user_png(key), os.path.join(common.DATA_DIR, "reveal", key + ".json")):
        try:
            os.remove(p)
        except OSError:
            pass
    _drop_cache()


def load(key):
    """(anh RGBA, (ax, ay)) cua hinh dang dung, hoac None."""
    if not exists(key):
        return None
    try:
        im = Image.open(png_path(key)).convert("RGBA")
        try:
            t = json.load(open(meta_path(key), encoding="utf-8")).get("anchor")
            anc = (int(t[0]), int(t[1]))
        except Exception:
            anc = find_anchor(im, ASSETS[key]["anchor"])
        return im, anc
    except Exception:
        return None


def use_bytes(key, data):
    """Dung anh nguoi dung chon. PNG da co nen trong suot -> giu nguyen; con lai -> tach nen."""
    im = Image.open(io.BytesIO(data))
    im.load()
    if im.mode in ("RGBA", "LA") or "transparency" in im.info:
        rgba = im.convert("RGBA")
        if float((np.asarray(rgba.getchannel("A")) < 250).mean()) > 0.05:
            bb = rgba.getchannel("A").point(lambda v: 255 if v > 12 else 0).getbbox()
            return save(key, rgba.crop(bb) if bb else rgba)
    return save(key, cutout(im))


def make(key, browser=0, log=print):
    """Nho Flow ve hinh `key` roi tach nen + luu (thu toi da 2 lan neu khong tach duoc nen). Can Flow da mo / dang nhap."""
    from . import flowgen
    a = ASSETS[key]
    last = None
    for attempt in range(2):
        log("Đang nhờ AI (Flow) vẽ: %s…" % a["label"])
        im = flowgen.generate(a["prompt"], aspect=a["aspect"], browser=browser, log=log)
        try:
            rgba = cutout(im)
            save(key, rgba)
            log("Xong: %s (%dx%d)." % (a["label"], rgba.width, rgba.height))
            return True
        except ValueError as e:
            last = e
            log("Ảnh chưa tách nền được, vẽ lại lần %d…" % (attempt + 2))
    raise last
