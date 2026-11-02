# -*- coding: utf-8 -*-
"""Chuyen anh -> video bang Google Vids (tab 'Tao anh dong', mo hinh Omni/Veo) - dieu khien trinh duyet da dang nhap Google, giong cach tool dung Flow.
Khong co API chinh thuc nen phai bam giao dien: moi buoc deu co ma loi rieng + chup man hinh vao thu muc debug de sua nhanh khi Google doi giao dien."""
import os, re, io, time, base64, hashlib, subprocess
from . import flowgen
from .common import DATA_DIR, ffmpeg

CLIPS = os.path.join(DATA_DIR, "cache", "clips")
DEBUG = os.path.join(DATA_DIR, "cache", "vids_debug")
VIDS_NEW = "https://docs.google.com/videos/create"


class Quota(RuntimeError):
    """Het luot tao video AI (hoac bi chan) - dung chuyen dong, de mai lam tiep."""


class Step(RuntimeError):
    pass


R_PANEL = re.compile(r"Đoạn video do AI tạo|AI.generated video|Generate video", re.I)
R_RAIL = re.compile(r"^\s*(Video AI|AI video)\s*$", re.I)
R_ANIM = re.compile(r"^\s*(Tạo ảnh động|Animate image|Animate)\s*$", re.I)
R_ADD = re.compile(r"Thêm hình ảnh|Add (an )?image|Add photo", re.I)
R_UPLOAD = re.compile(r"Tải lên|Upload|Từ máy tính|From (this )?computer|Máy tính", re.I)
R_SEND = re.compile(r"^(Gửi|Tạo|Tạo video|Send|Submit|Generate|Create)$|Gửi lời nhắc|Submit prompt", re.I)
R_BAD = re.compile(r"đã hết|hết lượt|đạt đến giới hạn|đã đạt giới hạn|giới hạn (hàng )?(ngày|tháng)|quá nhiều yêu cầu|daily limit|monthly limit|reached (your|the) (daily|monthly)? ?limit|out of generations|quota|try again (tomorrow|later)|thử lại sau", re.I)
R_FAIL = re.compile(r"không thể tạo|đã xảy ra lỗi|couldn.t generate|something went wrong|vi phạm|violat|blocked|bị chặn|chính sách", re.I)


def _dump(pg, tag):
    try:
        os.makedirs(DEBUG, exist_ok=True)
        pg.screenshot(path=os.path.join(DEBUG, tag + ".png"))
        txt = pg.evaluate("""() => Array.from(document.querySelectorAll('button,[role=button],[role=tab],[role=textbox],[contenteditable],input,video'))
            .slice(0, 200).map(e => e.tagName + ' | ' + (e.getAttribute('aria-label') || '') + ' | ' + (e.innerText || '').slice(0, 50) + ' | ' + (e.getAttribute('placeholder') || '') + ' | ' + (e.currentSrc || '').slice(0, 60)).join('\\n')""")
        open(os.path.join(DEBUG, tag + ".txt"), "w", encoding="utf-8").write(txt)
    except Exception:
        pass


def _tab(fl, url, log):
    """Tab Vids rieng (khong dung chung tab Flow/Gemini)."""
    pg = getattr(fl, "vtab", None)
    try:
        if pg is not None and not pg.is_closed():
            return pg
    except Exception:
        pass
    ctx = fl.page.context
    known = set(id(p) for p in ctx.pages)
    try:
        cs = fl.browser.new_browser_cdp_session()
        cs.send("Target.createTarget", {"url": url})
    except Exception:
        p = ctx.new_page()
        p.goto(url, wait_until="domcontentloaded", timeout=40000)
    t0, got = time.time(), None
    while time.time() - t0 < 25 and got is None:
        for p in ctx.pages:
            if id(p) in known or p is fl.page:
                continue
            try:
                if "docs.google.com" in p.url or "accounts.google" in p.url or p.url.startswith("about:blank"):
                    got = p; break
            except Exception:
                pass
        if got is None:
            fl.page.wait_for_timeout(500)
    if got is None:
        raise Step("không mở được tab Google Vids")
    fl.vtab = got
    return got


def _visible(loc, timeout=1500):
    try:
        loc.first.wait_for(state="visible", timeout=timeout)
        return True
    except Exception:
        return False


def _srcs(pg):
    try:
        return pg.evaluate("() => Array.from(document.querySelectorAll('video')).map(v => ({s: v.currentSrc || v.src || '', d: v.duration || 0}))")
    except Exception:
        return []


def _body(pg):
    try:
        return pg.evaluate("() => document.body.innerText")[:6000]
    except Exception:
        return ""


def _generate(fl, image_path, prompt, url, log, timeout):
    pg = _tab(fl, url, log)
    pg.goto(url, wait_until="domcontentloaded", timeout=60000)         # nap lai trang moi lan -> trang thai sach
    if "accounts.google" in pg.url:
        raise Step("Chưa đăng nhập Google trong trình duyệt của tool (đăng nhập ở cửa sổ vừa mở rồi thử lại)")
    # 1. mo panel Video AI
    t0 = time.time()
    while time.time() - t0 < 60:
        if _visible(pg.get_by_text(R_PANEL), 800):
            break
        rail = pg.get_by_text(R_RAIL)
        if _visible(rail, 800):
            try:
                rail.first.click(timeout=2500)
            except Exception:
                pass
            time.sleep(1.2)
            if _visible(pg.get_by_text(R_PANEL), 1500):
                break
        time.sleep(1.0)
    else:
        raise Step("bước 1: không thấy mục 'Video AI' (chưa mở đúng tài liệu Vids?)")
    # 2. tab 'Tao anh dong'
    tab = pg.get_by_text(R_ANIM)
    if not _visible(tab, 4000):
        raise Step("bước 2: không thấy tab 'Tạo ảnh động'")
    tab.first.click(timeout=3000)
    time.sleep(0.8)
    # 3. them anh
    ok = False
    add = pg.get_by_text(R_ADD)
    if _visible(add, 3000):
        try:
            with pg.expect_file_chooser(timeout=3500) as fc:
                add.first.click(timeout=5000)
            fc.value.set_files(image_path); ok = True
        except Exception:
            time.sleep(0.6)
            up = pg.get_by_text(R_UPLOAD)           # menu nho: Tai len / Drive / ...
            if _visible(up, 2500):
                try:
                    with pg.expect_file_chooser(timeout=3500) as fc:
                        up.first.click(timeout=5000)
                    fc.value.set_files(image_path); ok = True
                except Exception:
                    pass
    if not ok:
        inp = pg.locator("input[type='file']")
        if inp.count():
            inp.first.set_input_files(image_path); ok = True
    if not ok:
        raise Step("bước 3: không tải được ảnh lên")
    time.sleep(3.0)
    # 4. mo ta
    box = None
    for sel in ("[role='textbox'][contenteditable='true']", "div[contenteditable='true']", "textarea", "[contenteditable='true']"):
        loc = pg.locator(sel)
        n = loc.count()
        for i in range(n - 1, -1, -1):
            try:
                if loc.nth(i).is_visible():
                    box = loc.nth(i); break
            except Exception:
                pass
        if box is not None:
            break
    if box is None:
        raise Step("bước 4: không thấy ô nhập mô tả")
    box.click(timeout=3000)
    try:
        box.fill(prompt)
    except Exception:
        pg.keyboard.type(prompt, delay=2)
    time.sleep(0.6)
    base = {x["s"] for x in _srcs(pg)}
    # 5. gui
    sent = False
    btn = pg.get_by_role("button", name=R_SEND)
    for i in range(btn.count() - 1, -1, -1):
        try:
            b = btn.nth(i)
            if b.is_visible() and b.is_enabled():
                b.click(timeout=2500); sent = True; break
        except Exception:
            pass
    if not sent:
        pg.keyboard.press("Control+Enter"); time.sleep(0.4)
        pg.keyboard.press("Enter")
    # 6. cho video
    t0 = time.time()
    last_dump = 0
    while time.time() - t0 < timeout:
        time.sleep(3.0)
        body = _body(pg)
        if R_BAD.search(body):
            _dump(pg, "quota")
            raise Quota("Google Vids báo hết lượt hoặc giới hạn: " + (R_BAD.search(body).group(0)))
        if R_FAIL.search(body) and time.time() - t0 > 12:
            _dump(pg, "fail")
            raise Step("Vids không tạo được clip này (" + R_FAIL.search(body).group(0) + ")")
        for x in _srcs(pg):
            if x["s"] and x["s"] not in base and x["d"] >= 3:
                return pg, x["s"]
        if time.time() - last_dump > 60:
            last_dump = time.time(); _dump(pg, "waiting")
    raise Step("quá thời gian chờ Vids tạo clip")


def _fetch(pg, src, dst):
    if src.startswith("blob:") or src.startswith("data:"):
        b64 = pg.evaluate("""async (src) => { const r = await fetch(src); const b = await r.blob();
            return await new Promise(res => { const f = new FileReader(); f.onload = () => res(f.result.split(',')[1]); f.readAsDataURL(b); }); }""", src)
        data = base64.b64decode(b64)
    else:
        try:
            b64 = pg.evaluate("""async (src) => { const r = await fetch(src, {credentials: 'include'}); const b = await r.blob();
                return await new Promise(res => { const f = new FileReader(); f.onload = () => res(f.result.split(',')[1]); f.readAsDataURL(b); }); }""", src)
            data = base64.b64decode(b64)
        except Exception:
            data = pg.context.request.get(src).body()
    if len(data) < 20000:
        raise Step("tải clip về bị rỗng")
    open(dst, "wb").write(data)


def first_cut(raw, thr=0.32):
    """Thoi diem dau tien clip doi canh (cat sang goc may khac); None neu mot cu may lien."""
    try:
        r = subprocess.run([ffmpeg(), "-v", "info", "-i", raw, "-an", "-vf", "select='gt(scene,%.2f)',showinfo" % thr, "-f", "null", "-"],
                           capture_output=True, text=True, encoding="utf-8", errors="replace", timeout=120)
        ts = [float(m.group(1)) for m in re.finditer(r"pts_time:([0-9.]+)", r.stderr or "")]
        ts = [t for t in ts if t > 0.4]
        return min(ts) if ts else None
    except Exception:
        return None


def _post(raw, dst, secs, log=print):
    """Bo am thanh (tool co giong doc rieng), xoa ngoi sao goc duoi phai, cat dung bang thoi luong cau noi VA dung truoc cho Vids doi canh (phan sau la canh khac/sai)."""
    keep = max(3.0, min(10.0, secs))
    cut = first_cut(raw)
    if cut is not None and cut < keep:
        keep = max(1.5, cut - 0.08)
        log("   Vids chuyển cảnh ở %.1fs → chỉ giữ %.1fs đầu của clip" % (cut, keep))
    vf = "delogo=x=1132:y=572:w=60:h=56"
    r = subprocess.run([ffmpeg(), "-y", "-v", "error", "-i", raw, "-an", "-t", "%.2f" % keep, "-vf", vf, "-c:v", "libx264", "-crf", "19", "-pix_fmt", "yuv420p", dst],
                       capture_output=True, text=True, encoding="utf-8", errors="replace")
    if r.returncode != 0 or not os.path.exists(dst):
        raise Step("ffmpeg xử lý clip lỗi: " + (r.stderr or "")[-160:])


def animate(image_path, prompt, url, browser=0, log=print, secs=6.0, timeout=420):
    """Tra ve duong dan clip mp4 (da cache). Loi: Quota (het luot) | Step (hong o buoc nao)."""
    os.makedirs(CLIPS, exist_ok=True)
    prompt = (prompt + " One single continuous shot, stable framing, no cuts, no scene change. (no speech) (no music) (no sound)").strip()
    key = hashlib.md5(open(image_path, "rb").read() + prompt.encode("utf-8") + b"vids|%.1f" % secs).hexdigest()[:16]
    dst = os.path.join(CLIPS, key + ".mp4")
    if os.path.exists(dst):
        return dst

    def job():
        fl = flowgen._get(log, browser)
        try:
            pg, src = _generate(fl, image_path, prompt, url or VIDS_NEW, log, timeout)
            raw = os.path.join(CLIPS, key + ".raw.mp4")
            _fetch(pg, src, raw)
            _post(raw, dst, secs, log)
            try:
                os.remove(raw)
            except OSError:
                pass
            return dst
        except (Quota, Step):
            raise
        except Exception as e:
            try:
                _dump(fl.vtab, "error")
            except Exception:
                pass
            raise Step("lỗi trình duyệt: " + str(e)[:160])
    try:
        return flowgen._run(job)
    except Step as e:
        raise RuntimeError("Google Vids: %s (ảnh chụp màn hình lưu ở %s)" % (e, DEBUG))


if __name__ == "__main__":      # thu 1 khung: python -m animstudio.vids anh.png "mo ta chuyen dong" [link_vids]
    import sys
    p = animate(sys.argv[1], sys.argv[2] if len(sys.argv) > 2 else "Gentle natural movement.", sys.argv[3] if len(sys.argv) > 3 else "", 0, print, 6.0)
    print("Clip:", p)
