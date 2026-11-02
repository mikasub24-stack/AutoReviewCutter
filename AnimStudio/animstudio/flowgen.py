# -*- coding: utf-8 -*-
"""Gui prompt sang Google Flow (Nano Banana) bang chinh Chrome cua ban, lay anh ve cho AnimStudio.
Chay Chrome that voi cong debug (de dang nhap Google binh thuong), roi dieu khien bang Playwright (CDP).
LUU Y: giao dien Flow co the doi -> moi buoc deu co phuong an du phong va ghi anh chup/DOM vao cache/flow_debug de chinh lai."""
import hashlib, math, os, re, sys, io, time, base64, subprocess, shutil, json
from PIL import Image, ImageChops, ImageStat
from .common import APP_DIR, DATA_DIR

import threading
ABORT = threading.Event()          # dat khi nguoi dung bam "mo lai Flow" luc dang cho dang nhap
FLOW_URL = "https://labs.google/fx/tools/flow"
HIDE = [False]          # True = cua so Flow dang duoc dua RA NGOAI man hinh (khong thu nho: cua so thu nho thi Chrome dung ve -> tab dung hinh)
JOBLOG = [None]         # ham ghi nhat ky cua cong viec dang chay (webui.jlog): moi thong bao cua Flow/tab hien o khung tien trinh
CHROME_FLAGS = ["--disable-background-timer-throttling", "--disable-renderer-backgrounding",
                "--disable-backgrounding-occluded-windows", "--disable-features=CalculateNativeWinOcclusion"]   # tab nen / cua so an khong bi Chrome lam cham


def _say(base, msg):
    try:
        base(msg)
    except Exception:
        pass
    j = JOBLOG[0]
    if j is not None:
        try:
            j(msg)
        except Exception:
            pass


def _ticks(page, ms=2000):
    """True neu trang dang 'chay' that (requestAnimationFrame van duoc goi). Tab bi an / cua so thu nho thi KHONG chay -> Playwright bam/nhap bi treo 30s."""
    try:
        return bool(page.evaluate("""ms => new Promise(res => { const t = setTimeout(() => res(false), ms);
            requestAnimationFrame(() => requestAnimationFrame(() => { clearTimeout(t); res(true); })); })""", ms))
    except Exception:
        return False


def _keepalive_page(page):
    try:
        s = page.context.new_cdp_session(page)
        for m, a_ in (("Emulation.setFocusEmulationEnabled", {"enabled": True}), ("Page.setWebLifecycleState", {"state": "active"})):
            try:
                s.send(m, a_)
            except Exception:
                pass
    except Exception:
        pass


def _front(page):
    """Dua tab len truoc (kich hoat tab trong cua so; cua so an dang nam NGOAI man hinh nen khong lam nhay cua so len)."""
    try:
        page.bring_to_front()
    except Exception:
        pass
    _keepalive_page(page)


def _click_or_focus(loc, timeout=6000):
    """Bam vao o nhap; neu tab khong hien (bam bi treo) thi chi focus bang JS, KHONG de treo 30 giay."""
    try:
        loc.click(timeout=timeout)
        return True
    except Exception:
        pass
    try:
        loc.focus(timeout=3000)
        return True
    except Exception:
        pass
    try:
        loc.evaluate("e => e.focus()")
        return True
    except Exception:
        return False

PORT = 9223
PROFILE = os.path.join(DATA_DIR, "chrome_profile")
DEBUG = os.path.join(DATA_DIR, "cache", "flow_debug")


BROWSERS = ["Tự động (Chrome → Cốc Cốc → Edge → Brave)", "Google Chrome", "Cốc Cốc", "Microsoft Edge", "Brave"]


def browser_paths(choice=0):
    env = [os.environ.get(k, "") for k in ("PROGRAMFILES", "PROGRAMFILES(X86)", "LOCALAPPDATA")]
    def win(*rel):
        return [os.path.join(b, *rel) for b in env if b]
    P = {1: win("Google", "Chrome", "Application", "chrome.exe") + ["/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"] + [shutil.which(x) or "" for x in ("google-chrome", "chromium", "chromium-browser")],
         2: win("CocCoc", "Browser", "Application", "browser.exe"),
         3: win("Microsoft", "Edge", "Application", "msedge.exe") + ["/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge"],
         4: win("BraveSoftware", "Brave-Browser", "Application", "brave.exe")}
    order = [choice] if choice in P else [1, 2, 3, 4]
    return [p for k in order for p in P[k] if p]


def find_chrome(choice=0):
    for p in browser_paths(choice):
        if os.path.exists(p):
            return p
    return ""


class Ambiguous(RuntimeError):
    pass


class RefAttachError(RuntimeError):
    """Khong dinh duoc anh tham chieu vao khung soan (Flow/Gemini): KHONG ve tiep, vi se ra nhan vat sai."""
    pass


class PromptNotEntered(RuntimeError):
    """Tab Ve ra: Flow khong nhan prompt (o nhap/nut gui khong phan hoi) nen KHONG gui. Khong phai loi tab: gui lai khung nay, khong tai lai trang."""
    pass


class FlowFail(RuntimeError):
    """Flow hien o 'Khong thanh cong' (khong tao duoc anh, khong tinh phi): gui lai, tu lan 2 thu anh tham chieu nhe hon."""
    pass


LITE_SIDE = 1280


def lite_ref(path, side=LITE_SIDE):
    """Ban NHE cua anh tham chieu (JPEG nen tren nen trang, canh dai <= side) de thu lai khi Flow bao 'Khong thanh cong' voi anh goc (to / PNG nang / co kenh trong suot).
    Loi -> tra ve anh goc."""
    try:
        os.makedirs(os.path.join(DATA_DIR, "cache", "flowref"), exist_ok=True)
        st = os.stat(path)
        out = os.path.join(DATA_DIR, "cache", "flowref", hashlib.md5(("%s|%s|%s|%s" % (path, st.st_size, st.st_mtime, side)).encode("utf-8")).hexdigest()[:16] + ".jpg")
        if not os.path.exists(out):
            im = Image.open(path)
            im.load()
            if im.mode in ("RGBA", "LA", "P"):
                im = im.convert("RGBA")
                bg = Image.new("RGBA", im.size, (255, 255, 255, 255)); bg.alpha_composite(im); im = bg
            im = im.convert("RGB")
            if max(im.size) > side:
                k = side / float(max(im.size))
                im = im.resize((max(1, int(im.width * k)), max(1, int(im.height * k))), Image.LANCZOS)
            im.save(out, "JPEG", quality=90)
        return out
    except Exception:
        return path


def crop_ref(path, out_side=1024):
    """Cach thu khi Flow bao 'Khong thanh cong' voi ANH SHEET nhieu dang/nhieu mat: cat RIENG mot nhan vat (hinh dau tien theo thu tu doc: tren-trai), phong to, nen trang, JPEG.
    Khong nhan ra duoc hinh rieng (anh chi co 1 nhan vat / loi) -> tra ve None."""
    try:
        import numpy as np
        from collections import deque
        os.makedirs(os.path.join(DATA_DIR, "cache", "flowref"), exist_ok=True)
        st = os.stat(path)
        out = os.path.join(DATA_DIR, "cache", "flowref", "crop_" + hashlib.md5(("%s|%s|%s|%s" % (path, st.st_size, st.st_mtime, out_side)).encode("utf-8")).hexdigest()[:16] + ".jpg")
        if os.path.exists(out):
            return out
        im = Image.open(path); im.load()
        if im.mode in ("RGBA", "LA", "P"):
            im = im.convert("RGBA"); bg = Image.new("RGBA", im.size, (255, 255, 255, 255)); bg.alpha_composite(im); im = bg
        im = im.convert("RGB")
        W, H = im.size
        k = 900.0 / max(W, H) if max(W, H) > 900 else 1.0
        sm = im.convert("L").resize((max(1, int(W * k)), max(1, int(H * k))), Image.BILINEAR)
        sw, sh = sm.size
        bgv = float(np.percentile(np.asarray(sm), 90))                       # mau nen (trang / xam nhat)
        mask = (np.asarray(sm).astype(np.float32) < bgv - 28).astype(np.uint8) * 255
        r = max(2, int(max(sw, sh) / 450))                                   # noi cac net ve cua CUNG mot hinh (nho thoi: lon se dinh ca cac hinh voi nhau)
        from PIL import ImageFilter
        dil = Image.fromarray(mask).filter(ImageFilter.MaxFilter(2 * r + 1))
        g = np.asarray(dil.resize((max(1, sw // 3), max(1, sh // 3)), Image.NEAREST)) > 0
        gh, gw = g.shape
        lab = np.zeros((gh, gw), dtype=np.int32); comps = []
        for y0 in range(gh):
            for x0 in range(gw):
                if g[y0, x0] and not lab[y0, x0]:
                    cid = len(comps) + 1; lab[y0, x0] = cid; dq = deque([(y0, x0)]); x1 = x2 = x0; y1 = y2 = y0; n = 0
                    while dq:
                        y, x = dq.popleft(); n += 1
                        x1 = min(x1, x); x2 = max(x2, x); y1 = min(y1, y); y2 = max(y2, y)
                        for dy, dx in ((1, 0), (-1, 0), (0, 1), (0, -1)):
                            yy, xx = y + dy, x + dx
                            if 0 <= yy < gh and 0 <= xx < gw and g[yy, xx] and not lab[yy, xx]:
                                lab[yy, xx] = cid; dq.append((yy, xx))
                    comps.append((n, x1, y1, x2, y2))
        if len(comps) < 3:
            return None                                                      # 1-2 hinh: khong phai sheet
        big = max(c[0] for c in comps)
        cand = [c for c in comps if c[0] >= big * 0.25 and (c[3] - c[1] + 1) * 3 >= sw * 0.06 and (c[4] - c[2] + 1) * 3 >= sh * 0.12]
        if not cand:
            return None
        ymin = min(c[2] for c in cand)
        top = [c for c in cand if c[2] <= ymin + max(2, gh * 0.06)]
        c = min(top, key=lambda c: c[1])                                     # hang tren cung, trai nhat
        bx1, by1, bx2, by2 = (c[1] * 3) / k, (c[2] * 3) / k, ((c[3] + 1) * 3) / k, ((c[4] + 1) * 3) / k
        mx, my = (bx2 - bx1) * 0.08 + 6, (by2 - by1) * 0.06 + 6
        box = (max(0, int(bx1 - mx)), max(0, int(by1 - my)), min(W, int(bx2 + mx)), min(H, int(by2 + 4)))          # day sat net ve: khong lay nhan chu ben duoi
        if (box[2] - box[0]) * (box[3] - box[1]) >= W * H * 0.55 or (box[2] - box[0]) < 40 or (box[3] - box[1]) < 40:
            return None
        cr = im.crop(box)
        f = out_side / float(max(cr.size))
        cr = cr.resize((max(1, int(cr.width * f)), max(1, int(cr.height * f))), Image.LANCZOS)
        cr.save(out, "JPEG", quality=92)
        return out
    except Exception:
        return None


_VSTART = {}          # (ten anh mau) -> cach ve da ra anh gan nhat tren Flow: cac khung sau bat dau tu cach do, khong phai chiu lai 2-3 lan loi


def _job_refs(job):
    return [x for x in ([job.get("ref")] if job.get("ref") else []) + list(job.get("refs") or []) if x]


def ref_key(job):
    return tuple(sorted(os.path.basename(x) for x in _job_refs(job)))


_LADDER = {}
FAIL_COOL, FAIL_COOL_MAX = 6.0, 120.0    # giay nghi sau 'Khong thanh cong' lien tiep: 6, 12, 24, 48, 96, 120 (tu lan thu 2) — Flow tu choi lien tiep thi don dap them chi lam no khoa them
LIMIT_COOL, LIMIT_COOL_MAX = 45.0, 300.0 # Flow bao han muc / reCAPTCHA / hoat dong bat thuong: nghi 45, 90, 180, 300... giay (doi anh mau khong giup)
FLOW_GAP = float(os.environ.get("ANIMSTUDIO_FLOW_GAP", "5"))   # giay toi thieu giua 2 lan GUI len Flow (tinh ca nhieu tab): gui don dap thi Flow bao 'Khong thanh cong'
FLOW_GAP_MAX = 90.0                                              # loi thi gian cach tu tang (x1.6), ra anh thi rut lai (x0.85) ve FLOW_GAP
_FGAP = {}                                                       # nho gian cach da hoc giua cac dot ve trong cung phien
FAIL_STOP, LIMIT_STOP = 8, 5             # tu choi lien tiep ngan nay lan (khong xong khung nao) thi DUNG ca dot de khong dot them va khong bi khoa them
VNAME ={"full": "ảnh mẫu gốc", "lite": "ảnh mẫu bản nhẹ", "short": "lời nhắc ngắn", "crop": "cắt riêng một nhân vật"}


def ladder(job):
    """Cac cach ve thu lan luot khi Flow bao 'Khong thanh cong': full (anh goc + loi nhac day du) -> lite (anh nhe) -> short (anh nhe + loi nhac ngan) -> crop (cat rieng 1 nhan vat tu sheet + loi nhac ngan)."""
    refs = _job_refs(job)
    try:
        key = (tuple((r, os.stat(r).st_mtime) for r in refs), bool(job.get("alt")))
    except Exception:
        key = (tuple(refs), bool(job.get("alt")))
    if key in _LADDER:
        return list(_LADDER[key])
    L = ["full", "lite"]
    if job.get("alt"):
        L.append("short")
    try:
        if any(crop_ref(r) for r in refs):
            L.append("crop")
    except Exception:
        pass
    _LADDER[key] = L
    return list(L)


def variant_prompt(job, v):
    return (job.get("alt") or job["prompt"]) if v in ("short", "crop") else job["prompt"]


DUP_SAME = 4.0        # do lech trung binh (0..255) cua anh thu nho 48x48 de coi 2 o anh la CUNG MOT buc tranh (ban mo / ban cuoi)
REF_SAME = 8.0        # do lech trung binh (0..255) cua anh thu nho 48x48 de coi 'la chinh anh mau vua tai len'


def ref_thumb(im, n=48):
    """Anh thu nho xam n x n (nen trang) de so sanh 'co phai chinh anh mau khong' — chiu duoc viec Flow nen lai / doi kich thuoc."""
    if im.mode not in ("RGB", "RGBA", "L"):
        im = im.convert("RGBA")
    k = max(1, min(im.width, im.height) // (n * 2))            # thu nho nhanh truoc (anh mau co the vai chuc trieu diem anh)
    if k > 1:
        im = im.reduce(k)
    if im.mode == "RGBA":
        bg = Image.new("RGBA", im.size, (255, 255, 255, 255)); bg.alpha_composite(im); im = bg
    return im.convert("L").resize((n, n), Image.BILINEAR)


REF_LAX = os.environ.get("ANIMSTUDIO_REF_LAX") == "1"     # =1: dinh anh loi van gui (hanh vi cu); mac dinh: bao loi, khong ve nham
ATT_TRIES = 3          # dinh anh tham chieu loi: tu tai len lai + dinh lai NGAY tren tab do, toi da bay nhieu lan moi khung (khong tai lai trang)
REF_TRIES = 5          # moi khung duoc gui lai bay nhieu luot (moi luot da gom ATT_TRIES lan dinh) truoc khi bao loi
REF_STOP = 8           # loi dinh anh lien tiep bay nhieu luot (cac khung/tab khac cung khong gui duoc) thi moi dung han


def is_ref_error(msg):
    """Loi 'khong dinh duoc anh tham chieu' (loi cua tool, KHONG phai trang Flow hong) -> khong can tai lai trang."""
    return "Không đính được ảnh tham chiếu" in str(msg)


class Flow:
    def __init__(self, url=FLOW_URL, log=print, launch_path=None, browser=0):
        self.browser_choice = browser
        url = os.environ.get("ANIMSTUDIO_FLOW_URL", url)          # (chi de kiem thu)
        launch_path = launch_path or os.environ.get("ANIMSTUDIO_BROWSER_EXE")
        self.url, self.pw, self.browser, self.page, self.proc = url, None, None, None, None
        self.log = lambda m, _b=log: _say(_b, m)          # vua cap nhat trang thai Flow, vua ghi vao khung tien trinh cua cong viec
        self.launch_path = launch_path     # chi dung de test (chromium cua playwright)
        self.seen = set()
        self.aspect_set = None

    # ---------------------------------------------------------------- ket noi
    def start(self, login_wait=300):
        from playwright.sync_api import sync_playwright
        self.pw = sync_playwright().start()
        if self.launch_path:
            self.browser = self.pw.chromium.launch(executable_path=self.launch_path, args=["--no-sandbox"])
            self.page = self.browser.new_page()
        else:
            try:
                self.browser = self.pw.chromium.connect_over_cdp(f"http://127.0.0.1:{PORT}")
            except Exception:
                exe = find_chrome(self.browser_choice)
                if not exe:
                    raise RuntimeError("Không tìm thấy trình duyệt đã chọn (%s). Hãy chọn trình duyệt khác hoặc cài Chrome." % BROWSERS[self.browser_choice])
                os.makedirs(PROFILE, exist_ok=True)
                self.proc = subprocess.Popen([exe, f"--remote-debugging-port={PORT}", f"--user-data-dir={PROFILE}", "--no-first-run"] + CHROME_FLAGS + [self.url])
                for _ in range(40):
                    time.sleep(0.5)
                    try:
                        self.browser = self.pw.chromium.connect_over_cdp(f"http://127.0.0.1:{PORT}"); break
                    except Exception:
                        pass
                if not self.browser:
                    raise RuntimeError("Không kết nối được Chrome (cổng %d)." % PORT)
            ctx = self.browser.contexts[0]
            self.page = next((p for p in ctx.pages if "labs.google" in p.url), None) or ctx.new_page()
        if "labs.google" not in self.page.url:
            self.page.goto(self.url)
        self.log("Đang mở Google Flow… nếu chưa đăng nhập, hãy đăng nhập Google trong cửa sổ Chrome vừa mở.")
        self._wait_ready(login_wait)

    def stop(self, kill=False):
        try:
            if self.pw:
                self.pw.stop()
        except Exception:
            pass
        if kill and self.proc is not None:
            try:
                self.proc.terminate()
            except Exception:
                pass

    def shutdown(self):
        """DONG HAN trinh duyet ve (moi tab Flow / Gemini / ChatGPT) de giai phong RAM + CPU sau khi ve xong. Dang nhap van con (luu trong ho so rieng cua tool). True neu da dong."""
        try:
            if self.launch_path:
                self.browser.close()
            else:
                self.browser.new_browser_cdp_session().send("Browser.close")
        except Exception:
            pass
        try:
            if self.alive():                                   # lenh dong khong co tac dung -> dong tung tab
                for ctx in list(self.browser.contexts):
                    for pg in list(ctx.pages):
                        try:
                            pg.close()
                        except Exception:
                            pass
        except Exception:
            pass
        self.stop(kill=True)
        return not self.alive()

    def alive(self):
        try:
            return self.page is not None and not self.page.is_closed() and bool(self.page.url)
        except Exception:
            return False

    def _win(self, page=None):
        pg = page or self.page
        sess = pg.context.new_cdp_session(pg)
        return sess, sess.send("Browser.getWindowForTarget")["windowId"]

    def focus(self, force=False):
        """Hien cua so Flow tro lai tren man hinh (dung khi can dang nhap / xu ly loi)."""
        if HIDE[0] and not force:
            return
        was_hidden = HIDE[0]
        if force:
            HIDE[0] = False
        try:
            self.page.bring_to_front()
        except Exception:
            pass
        try:
            sess, wid = self._win()
            b = {"windowState": "normal"}
            sv = getattr(Flow, "_saved_bounds", None)
            cur = sess.send("Browser.getWindowBounds", {"windowId": wid})["bounds"]
            if was_hidden or (cur.get("left") is not None and cur.get("left") < -2000):
                sess.send("Browser.setWindowBounds", {"windowId": wid, "bounds": b})
                b2 = dict(sv) if sv else {"left": 60, "top": 40, "width": 1280, "height": 800}
                b2["windowState"] = "normal"
                sess.send("Browser.setWindowBounds", {"windowId": wid, "bounds": b2})
            else:
                sess.send("Browser.setWindowBounds", {"windowId": wid, "bounds": b})
        except Exception:
            pass

    def hide(self):
        """An cua so Flow bang cach dua no RA NGOAI man hinh (KHONG thu nho: cua so thu nho thi Chrome ngung ve -> Playwright bam/nhap bi treo,
        chi 1 tab gui duoc). Co kiem tra: neu trang van khong 'chay' khi cua so o ngoai man hinh thi tu hien lai de khong bi treo."""
        try:
            sess, wid = self._win()
            cur = sess.send("Browser.getWindowBounds", {"windowId": wid})["bounds"]
            if cur.get("windowState") != "normal":
                sess.send("Browser.setWindowBounds", {"windowId": wid, "bounds": {"windowState": "normal"}})
                cur = sess.send("Browser.getWindowBounds", {"windowId": wid})["bounds"]
            if cur.get("left") is not None and cur.get("left") > -2000:
                Flow._saved_bounds = {k: cur[k] for k in ("left", "top", "width", "height") if k in cur}
            try:
                sess.send("Emulation.setFocusEmulationEnabled", {"enabled": True})
            except Exception:
                pass
            sess.send("Browser.setWindowBounds", {"windowId": wid, "bounds": {"left": -20000, "top": -20000}})
        except Exception:
            return False
        HIDE[0] = True
        self.page.wait_for_timeout(400)
        if not _ticks(self.page, 2500):
            self.log("  ⚠ Chrome không chạy được khi cửa sổ nằm ngoài màn hình → hiện cửa sổ Flow lại để vẽ không bị treo. "
                     "(Muốn ẩn được: đóng hẳn cửa sổ Chrome của AnimStudio rồi mở lại để nhận cấu hình mới.)")
            self.focus(force=True)
            return False
        return True

    def _wake(self, page, lazy=False):
        """Dam bao tab 'chay' duoc truoc khi thao tac. Tab nen -> dua len truoc. Neu cua so an lam tab dung -> hien cua so lai.
        lazy=True: tab da chay thi KHONG keo cua so len truoc (khong gianh phim/chuot cua ban)."""
        if (lazy or HIDE[0]) and _ticks(page, 1500):
            return True
        _front(page)
        if _ticks(page, 2500):
            return True
        if HIDE[0]:
            self.log("  ⚠ tab đứng khi cửa sổ bị ẩn → hiện cửa sổ Flow lại")
            self.focus(force=True)
            _front(page)
            return _ticks(page, 2500)
        return False

    # ---------------------------------------------------------------- tim o nhap
    def _box(self):
        pg = self.page
        best = None
        for sel in ("textarea", "[contenteditable='true']", "[role='textbox']", "input[type='text']"):
            loc = pg.locator(sel)
            for i in range(min(loc.count(), 8)):
                el = loc.nth(i)
                try:
                    bb = el.bounding_box()
                    if el.is_visible() and bb and bb["width"] > 200:
                        if best is None or bb["y"] > best[0]:       # o prompt nam o day man hinh; bo qua o tim kiem tren cung
                            best = (bb["y"], el)
                except Exception:
                    pass
        return best[1] if best else None

    def _composer(self, box=None):
        """Khung soan prompt o day man hinh Flow (chua o nhap, nut +, chip model, nut gui). Moi thao tac bam nut chi trong khung nay."""
        box = box or self._box()
        if box is None:
            return None
        try:
            h = box.evaluate_handle("""el => { let n = el; for (let i = 0; i < 8; i++) { n = n.parentElement; if (!n) break;
                    if (n.querySelectorAll('button,[role=button]').length >= 3 && n.getBoundingClientRect().width > 300) return n; }
                    return el.parentElement; }""")
            return h.as_element()
        except Exception:
            return None

    def _buttons(self, comp):
        out = []
        for el in comp.query_selector_all("button,[role=button]"):
            try:
                bb = el.bounding_box()
                if bb and bb["width"] > 4 and el.is_visible():
                    out.append((bb["x"], bb["y"], el, (el.inner_text() or "").strip()))
            except Exception:
                pass
        return sorted(out, key=lambda t: t[0])

    def _click_text(self, pattern, timeout=1500, scope=None):
        pg = scope or self.page
        for loc in (pg.get_by_role("button", name=re.compile(pattern, re.I)), pg.get_by_text(re.compile(pattern, re.I))):
            try:
                if loc.count() and loc.first.is_visible():
                    loc.first.click(timeout=timeout); return True
            except Exception:
                pass
        return False

    def _open_project(self):
        """Dang o man hinh chinh Flow (da dang nhap, chua co o nhap prompt) -> bam 'Du an moi' / 'New project' de vao khung tao anh. Chi bam nut, khong bam thanh cong cu."""
        pg = self.page
        pats = (r"^\s*\+?\s*(dự án mới|new project)\s*$", r"(dự án mới|new project)", r"(tạo bằng flow|create with flow|bắt đầu tạo|start creating|get started|bắt đầu|dùng thử|try flow|launch flow)")
        for pat in pats:
            for role in ("button", "link"):
                try:
                    loc = pg.get_by_role(role, name=re.compile(pat, re.I))
                    for i in range(min(loc.count(), 4)):
                        el = loc.nth(i)
                        if el.is_visible():
                            self.log("Đang tạo dự án mới trên Flow…")
                            el.click(timeout=2000); return True
                except Exception:
                    pass
            try:
                loc = pg.get_by_text(re.compile(pat, re.I))
                for i in range(min(loc.count(), 4)):
                    el = loc.nth(i)
                    if el.is_visible():
                        self.log("Đang tạo dự án mới trên Flow…")
                        el.click(timeout=2000); return True
            except Exception:
                pass
        return False

    def _wait_ready(self, wait):
        t0 = time.time(); last_try = 0.0; tries = 0
        while time.time() - t0 < wait:
            if ABORT.is_set():
                raise RuntimeError("Đã hủy, đang mở lại Flow")
            if self._box() is not None:
                return
            url = ""
            try:
                url = self.page.url or ""
            except Exception:
                pass
            on_login = "accounts.google" in url or "signin" in url or "ServiceLogin" in url
            in_proj = bool(getattr(self, "_draw_mode", False)) and "/project/" in url          # tab 'Ve ra': dang o trong du an thi KHONG tu bam 'Du an moi' / ve trang chu
            if not on_login and not in_proj and time.time() - t0 > 4 and time.time() - last_try > 4 and tries < 12:
                last_try = time.time(); tries += 1
                if self._open_project():              # tu vao du an moi, doi o nhap prompt xuat hien
                    time.sleep(3)
            time.sleep(1.2)
        self.dump("not_ready")
        raise RuntimeError("Không thấy ô nhập prompt của Flow (chưa đăng nhập? giao diện đổi?). Đã lưu ảnh chụp vào " + DEBUG)

    def _close_popups(self):
        try:
            self.page.keyboard.press("Escape"); time.sleep(0.3)
        except Exception:
            pass

    # ---------------------------------------------------------------- cai dat
    # Nut KHONG BAO GIO duoc bam khi tim o chon ti le (gui / them / tai len / mic / xoa...). Chi ap dung cho nut chua ro la o model.
    _ASP_SKIP = re.compile(r"(\bsend\b|\bsubmit\b|\bcreate\b|\bgenerate\b|\btạo\b|\bgửi\b|arrow_(forward|upward)|\badd\b|^\s*\+\s*$|\bthêm\b|upload|\btải\b|attach|đính kèm|\bmic\b|voice|giọng|\bxóa\b|remove|delete|\bclose\b|đóng|\bclear\b|undo|redo|\bcopy\b|sao chép)", re.I)
    _ASP_MODEL = re.compile(r"nano|banana|imagen|veo|gemini|x\s?\d", re.I)
    _ASP_HINT = re.compile(r"(\d{1,2}\s*:\s*\d{1,2}|aspect|ratio|tỉ lệ|tỷ lệ|crop|landscape|portrait|square|ngang|dọc|vuông|khung hình|model|mô hình)", re.I)
    _ASP_WEAK = re.compile(r"(cài đặt|settings?|\btune\b|options?|tùy chọn|\bimage\b|ảnh|hình ảnh|\bvideo\b|expand_more|arrow_drop_down|keyboard_arrow)", re.I)

    def _asp_scopes(self, comp):
        """Khung soan, roi toi da 3 tang cha (neu nho): giao dien Flow moi co the dat nut model o hang ben canh o nhap, ngoai khung nho nhat."""
        out = [comp]
        try:
            for _ in range(3):
                h = out[-1].evaluate_handle("""el => { const p = el.parentElement; if (!p || p === document.body) return null;
                    const r = p.getBoundingClientRect(), n = p.querySelectorAll('button,[role=button]').length;
                    return (r.height <= 340 && n <= 30 && r.width >= 300) ? p : null; }""").as_element()
                if h is None:
                    break
                out.append(h)
        except Exception:
            pass
        return out

    def _asp_candidates(self, comp):
        """Cac nut co the la o model/ti le trong khung soan, xep tu kha nang cao den thap: [(diem, nhan, nut)]."""
        cands, seen = [], set()
        for scope in self._asp_scopes(comp):
            for x, y, el, txt in self._buttons(scope):
                key = (round(x), round(y))
                if key in seen:
                    continue
                seen.add(key)
                try:
                    aria = " ".join(filter(None, (el.get_attribute("aria-label"), el.get_attribute("title"))))
                except Exception:
                    aria = ""
                lab = re.sub(r"\s+", " ", (txt + " " + aria)).strip()
                if self._ASP_MODEL.search(lab):
                    score = 3
                elif self._ASP_SKIP.search(lab):
                    continue
                elif self._ASP_HINT.search(lab):
                    score = 2
                elif self._ASP_WEAK.search(lab):
                    score = 1
                else:
                    score = 0
                cands.append((score, x, lab, el))
        cands.sort(key=lambda t: (-t[0], t[1]))
        low = [c for c in cands if c[0] == 0][2:]           # nut khong co dau hieu gi: chi thu toi da 2 cai
        cands = [c for c in cands if c not in low]
        return [(sc, lab, el) for sc, _x, lab, el in cands]

    def _asp_find(self, pattern, chip, flags=re.I):
        """Phan tu dang hien, nam gan nut vua bam (menu bay ra o gan do), khong phai o nhap va khong nam trong chinh nut do."""
        try:
            cb = chip.bounding_box() or {}
        except Exception:
            cb = {}
        loc = self.page.get_by_text(re.compile(pattern, flags))
        try:
            n = min(loc.count(), 14)
        except Exception:
            return None
        for i in range(n):
            el = loc.nth(i)
            try:
                if not el.is_visible():
                    continue
                bb = el.bounding_box()
                if not bb:
                    continue
                if cb and (abs((bb["x"] + bb["width"] / 2) - (cb["x"] + cb["width"] / 2)) > 700 or abs(bb["y"] - cb["y"]) > 520):
                    continue
                if el.evaluate("e => !!e.closest('textarea,input,[contenteditable=true],[role=textbox]')"):
                    continue
                if chip.evaluate("(c, e) => c.contains(e)", el):
                    continue
                return el
            except Exception:
                continue
        return None

    def _pick_ratio(self, ratio):
        """Chon ti le trong menu cua nut model. Tra ve 'dung' / 'gan' (Flow khong co dung ti le, lay huong gan nhat) / 'san' (nut da hien dung ti le)."""
        comp = self._composer()
        if comp is None:
            raise RuntimeError("không thấy khung soạn prompt")
        a, b = [int(v) for v in str(ratio).split(":")]
        tok = rf"(?<![\d:]){a}\s*:\s*{b}(?![\d:])"
        near = (r"portrait|dọc|(?<![\d:])9\s*:\s*16(?![\d:])" if a < b else r"landscape|ngang|(?<![\d:])16\s*:\s*9(?![\d:])" if a > b else r"square|vuông|(?<![\d:])1\s*:\s*1(?![\d:])")
        cands = self._asp_candidates(comp)
        try:
            os.makedirs(DEBUG, exist_ok=True)
            open(os.path.join(DEBUG, "aspect_buttons.txt"), "w", encoding="utf-8").write("\n".join("%d | %s" % (sc, lab[:80]) for sc, lab, _ in cands) or "(khong co nut nao)")
        except Exception:
            pass
        if not cands:
            raise RuntimeError("không thấy nút nào trong khung soạn")
        tried = 0
        for sc, lab, chip in cands[:6]:
            if sc >= 2 and re.search(tok, lab):
                return "sẵn"                                     # nut model da ghi dung ti le
            try:
                chip.click(timeout=2000)
            except Exception:
                continue
            tried += 1; time.sleep(0.6)
            hit, kind = self._asp_find(tok, chip), "đúng"
            if hit is None:
                hit, kind = self._asp_find(near, chip), "gần"
            if hit is None:
                if tried == 1:
                    self.dump("aspect_open", comp_html=True)    # chup luc menu dang mo: de chinh lai khi Flow doi giao dien
                self._close_popups(); time.sleep(0.3)
                continue
            try:
                hit.click(timeout=1500)
            except Exception:
                self._close_popups(); continue
            time.sleep(0.4)
            one = self._asp_find(r"^\s*x?\s*1\s*$", chip)      # 1 anh moi lan gui (menu co the da dong sau khi chon ti le: khong sao)
            if one is not None:
                try:
                    one.click(timeout=1500)
                except Exception:
                    pass
            return kind
        raise RuntimeError("đã thử %d nút nhưng không thấy lựa chọn tỉ lệ" % tried)

    def set_aspect(self, ratio):
        """Chon ti le khung trong menu cua nut model o khung soan. Khong bao gio bam nut tren thanh cong cu (loc/che do xem/cai dat) va nut gui/them/tai len."""
        if self.aspect_set == ratio:
            return
        fails = self.__dict__.setdefault("_asp_fail", {})
        if fails.get(ratio, 0) >= 2:                           # da thu 2 lan khong duoc: khong bam thu tung anh nua
            return
        why, res = "", None
        try:
            res = self._pick_ratio(ratio)
        except Exception as e:
            why = str(e)[:90]
        self._close_popups()
        if res:
            self.aspect_set = ratio; fails.pop(ratio, None)
            if res == "gần":
                self.log(f"  (Flow không có tỉ lệ {ratio}: chọn khung gần nhất cùng hướng)")
            return
        fails[ratio] = fails.get(ratio, 0) + 1
        self.aspect_set = None
        self.log(f"  (không chọn được tỉ lệ {ratio}: {why or 'không thấy ô chọn tỉ lệ'}; dùng mặc định{' — không thử lại' if fails[ratio] >= 2 else ''})")
        self.dump("aspect", comp_html=True)

    def _upload_btn(self):
        """Nut tai file len trong hop chon '+' ('Tai noi dung len'). KHONG nham voi muc 'Tep tai len' (menu du an / danh muc trong hop chon: bam vao do chi doi man hinh)."""
        pg = self.page
        for pat in (r"(tải nội dung|tải tệp lên|upload file|from device|upload from)", r"^\s*(tải lên|upload)\s*$", r"^\s*[a-z_]*\s*(tải lên|upload)"):
            loc = pg.get_by_text(re.compile(pat, re.I))
            for i in range(min(loc.count(), 6)):
                try:
                    if loc.nth(i).is_visible():
                        return loc.nth(i)
                except Exception:
                    continue
        return None

    # ---------------------------------------------------------------- anh tham chieu: dinh VA KIEM CHUNG da hien o khung soan
    _JS_ROOT = """(box) => { let root = box;
        for (let i = 0; i < 10; i++) { const p = root.parentElement;
            if (!p || p === document.body || p === document.documentElement) break;
            if (p.getBoundingClientRect().height > Math.max(innerHeight * 0.5, 320)) break; root = p; }
        return root; }"""
    JS_COMP_SIG = """(box, wantHtml) => { const root = (""" + _JS_ROOT + """)(box);
        const big = (e, m) => { const r = e.getBoundingClientRect(); return r.width >= m && r.height >= m; };
        let thumbs = 0;
        root.querySelectorAll('img,video').forEach(e => { if (big(e, 14)) thumbs++; });
        root.querySelectorAll('div,span,figure,a,li,button').forEach(e => { if (e.querySelector('img,video')) return;
            const bg = getComputedStyle(e).backgroundImage; if (bg && bg !== 'none' && /url\\(/.test(bg) && big(e, 24)) thumbs++; });
        const o = {thumbs: thumbs, h: Math.round(root.getBoundingClientRect().height), btns: root.querySelectorAll('button,[role=button]').length};
        if (wantHtml) o.html = root.outerHTML.slice(0, 40000);
        return o; }"""
    JS_RM_MARK = """(box) => { const root = (""" + _JS_ROOT + """)(box);
        const pat = /(xóa|bỏ|gỡ|loại|remove|delete|close|đóng|clear|dismiss|hủy|cancel)/i;
        const imgs = Array.from(root.querySelectorAll('img,video')).filter(e => { const r = e.getBoundingClientRect(); return r.width >= 14 && r.height >= 14; });
        for (const im of imgs) { let e = im;
            for (let k = 0; k < 4 && e; k++, e = e.parentElement) {
                for (const b of e.querySelectorAll('button,[role=button]')) { const r = b.getBoundingClientRect();
                    const t = (b.getAttribute('aria-label') || '') + ' ' + (b.title || '') + ' ' + (b.innerText || '');
                    if (pat.test(t) && r.width > 0 && r.width <= 64 && r.height <= 64) { b.setAttribute('data-anim-rm', '1'); return true; } }
                if (e === root) break; } }
        return false; }"""
    JS_PASTE_FLOW = """(arr) => { const box = document.querySelector("textarea, [contenteditable='true'], [role='textbox']");
        if (!box) return false; box.focus(); const dt = new DataTransfer();
        for (const a of arr) { const bin = atob(a.b64); const u8 = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) u8[i] = bin.charCodeAt(i); dt.items.add(new File([u8], a.name, {type: a.type})); }
        box.dispatchEvent(new ClipboardEvent('paste', {clipboardData: dt, bubbles: true, cancelable: true})); return true; }"""
    _RM_PAT = re.compile(r"(xóa|bỏ|gỡ|loại|remove|delete|close|đóng|clear|dismiss|hủy|cancel)", re.I)

    def _comp_sig(self, html=False):
        """Dau van tay khung soan: so anh nho (chip nguyen lieu), chieu cao, so nut. None = khong do duoc."""
        try:
            box = self._box()
            if box is None:
                return None
            return box.evaluate(self.JS_COMP_SIG, bool(html))
        except Exception:
            return None

    @staticmethod
    def _sig_grew(a, b):
        """True: khung soan co them anh dinh kem. False: khong doi. None: khong do duoc."""
        if not a or not b:
            return None
        return bool(b["thumbs"] > a["thumbs"] or b["h"] >= a["h"] + 20 or b["btns"] > a["btns"])

    def _picker_open(self):
        try:
            ph = self.page.get_by_placeholder(re.compile(r"(tìm kiếm thành phần|search)", re.I))
            return ph.count() > 0 and ph.first.is_visible()
        except Exception:
            return False

    def _click_add(self):
        """Bam 'Them vao cau lenh' neu hop chon dang hien nut do."""
        try:
            loc = self.page.get_by_text(re.compile(r"(thêm vào câu lệnh|add to prompt)", re.I))
            for i in range(min(loc.count(), 4)):
                if loc.nth(i).is_visible():
                    loc.nth(i).click(timeout=2000)
                    return True
        except Exception:
            pass
        return False

    def _settle(self, base, wait=9.0):
        """Doi anh hien o khung soan (bam 'Them vao cau lenh' khi hop chon hien nut). True = da thay; False = khong; None = khong kiem chung duoc."""
        t0, added = time.time(), False
        while time.time() - t0 < wait:
            if ABORT.is_set():
                raise RuntimeError("Đã dừng")
            if self._click_add():
                added = True; time.sleep(0.7)
            if added or time.time() - t0 > 3.0 or not self._picker_open():       # o tim kiem luon hien (khong phai hop chon) thi sau 3 giay van kiem tra
                r = self._sig_grew(base, self._comp_sig())
                if r is None or r:
                    return r
            time.sleep(0.6)
        self._close_popups()
        try:
            if self._picker_open():
                self.page.keyboard.press("Escape")
        except Exception:
            pass
        time.sleep(0.6)
        return self._sig_grew(base, self._comp_sig())

    def _plus_button(self, comp, box=None):
        """Nut '+' (them anh) o cung hang voi o nhap, ben trai nhat. Bo qua nut xoa cua chip anh nam phia tren o nhap."""
        btns = self._buttons(comp)
        try:
            bb = (box or self._box()).bounding_box()
        except Exception:
            bb = None
        cand = []
        for x, y, el, txt in btns:
            try:
                lab = (txt or "") + " " + (el.get_attribute("aria-label") or "")
                if self._RM_PAT.search(lab):
                    continue
                b2 = el.bounding_box()
                if bb and b2 and b2["y"] + b2["height"] / 2 < bb["y"]:
                    continue                                   # nam phia tren o nhap = nut cua chip anh, khong phai '+'
            except Exception:
                pass
            cand.append(el)
        return cand[0] if cand else (btns[0][2] if btns else None)

    JS_LOADING = """() => { let n = 0; for (const e of document.querySelectorAll('div,span,p')) { if (e.children.length) continue; const t = (e.textContent || '').trim();
        if (/^\\d{1,3}\\s*%$/.test(t)) { const r = e.getBoundingClientRect(); if (r.width > 0 && r.height > 0) n++; } } return n; }"""

    def _pump(self):
        """Tab NAY dang cho (tai len / ve / gui): nhan luon anh cac TAB KHAC da ve xong (hook do _generate_many gan; chi tab 'Ve ra'). Tu gioi han >= 2 giay / lan, khong long nhau."""
        h = self.__dict__.get("_idle_hook")
        if h is None or self.__dict__.get("_pumping"):
            return
        now = time.time()
        if now - self.__dict__.get("_pump_t", 0.0) < 2.0:
            return
        self._pump_t = now
        self._pumping = True
        try:
            h()
        except Exception:
            pass
        finally:
            self._pumping = False

    def _wait_idle(self, maxw=75):
        """Cho Flow ve XONG khung dang chay trong du an nay (o anh con hien '45%'...) roi moi gui khung ke: gui chong khi khung truoc con dang ve thi khung sau hay bi 'Khong thanh cong'."""
        t0, shown = time.time(), False
        while time.time() - t0 < maxw:
            if ABORT.is_set():
                raise RuntimeError("Đã dừng")
            try:
                n = int(self.page.evaluate(self.JS_LOADING) or 0)
            except Exception:
                return True
            if n <= 0:
                return True
            if not shown:
                shown = True
                self.log("  tab này còn %d ô ảnh đang vẽ — chờ Flow vẽ xong rồi mới gửi khung kế" % n)
            self._pump()
            self.page.wait_for_timeout(1500)
        self.log("  (Flow vẫn báo đang vẽ sau %ds — gửi tiếp)" % maxw)
        return False

    def _clear_ingredients(self):
        """Go anh dinh kem con sot lai o khung soan tu lan gui truoc (neu Flow giu lai), de moi khung chi mang dung anh tham chieu cua no."""
        s0 = self._comp_sig()
        if not s0 or s0["thumbs"] <= 0:
            return
        pg = self.page
        box = self._box()
        for _ in range(min(8, s0["thumbs"] + 2)):
            try:
                if not box.evaluate(self.JS_RM_MARK):
                    break
                pg.locator("[data-anim-rm='1']").first.click(timeout=1500)
                time.sleep(0.4)
            except Exception:
                break
            finally:
                try:
                    pg.evaluate("() => document.querySelectorAll('[data-anim-rm]').forEach(e => e.removeAttribute('data-anim-rm'))")
                except Exception:
                    pass
        s1 = self._comp_sig()
        if s1 and s1["thumbs"] < s0["thumbs"]:
            self.log("  đã gỡ %d ảnh đính kèm cũ ở khung soạn" % (s0["thumbs"] - s1["thumbs"]))

    # ---------------------------------------------------------------- anh mau o Flow: moi tab CHI TAI LEN 1 LAN; cac khung sau bam '+' roi chon lai dung anh do (khong up lai -> khong day thu vien o anh trung)
    def _page_url(self):
        try:
            return (self.page.url or "").split("#")[0].split("?")[0]
        except Exception:
            return ""

    def _refstate(self):
        """Cac anh mau da tai len o TUNG tab (theo trang + duong dan du an). Tab mo lai / vao du an khac thi tinh lai tu dau."""
        st = self.__dict__.setdefault("_refup", {})
        cur = st.get(id(self.page))
        if cur is None or cur[0] is not self.page:
            cur = (self.page, {})
            st[id(self.page)] = cur
        return cur[1]

    def _picker_input(self):
        """O tim kiem trong hop chon '+' (o thap nhat tren man hinh = gan khung soan nhat)."""
        try:
            loc = self.page.get_by_placeholder(re.compile(r"(tìm kiếm thành phần|search)", re.I))
            best = None
            for i in range(min(loc.count(), 4)):
                el = loc.nth(i)
                if el.is_visible():
                    bb = el.bounding_box()
                    if bb and (best is None or bb["y"] > best[0]):
                        best = (bb["y"], el)
            return best[1] if best else None
        except Exception:
            return None

    _JS_PROOT = """(inp) => { const hasBox = n => !!n.querySelector("textarea,[contenteditable='true'],[role='textbox']"); let root = inp;
        for (let i = 0; i < 10; i++) { const p = root.parentElement;
            if (!p || p === document.body || p === document.documentElement || hasBox(p) || p.getBoundingClientRect().width > innerWidth * 0.95) break; root = p; }
        return root; }"""
    # Hop chon that cua Flow: cot trai = danh muc (Tat ca / Hinh anh / ... / Tep tai len), giua = danh sach o (anh nho + ten dang ma UUID), phai = ANH XEM TRUOC to + nut 'Them vao cau lenh'.
    JS_PICK_STATE = """(inp) => { document.querySelectorAll('[data-anim-pick]').forEach(e => e.removeAttribute('data-anim-pick'));
        const root = (""" + _JS_PROOT + """)(inp), rows = []; let prev = null, pa = 0;
        const src = e => e.currentSrc || e.src || '';
        const nameOf = e => { let a = e; for (let k = 0; k < 4 && a && a !== root; k++, a = a.parentElement) { if (a.querySelectorAll('img').length > 1) break;
            const t = (a.innerText || '').trim(); if (t) return t.split('\\n')[0].slice(0, 80); } return ''; };
        root.querySelectorAll('img').forEach(e => { const r = e.getBoundingClientRect(); if (r.width < 24 || r.height < 24 || r.bottom <= 0 || r.top >= innerHeight) return;
            if (Math.max(r.width, r.height) >= 200) { if (r.width * r.height > pa) { pa = r.width * r.height; prev = e; } }
            else if (rows.length < 14) { e.setAttribute('data-anim-pick', rows.length); rows.push({i: rows.length, src: src(e), nw: e.naturalWidth, nh: e.naturalHeight, name: nameOf(e)}); } });
        return {rows: rows, prev: prev ? {src: src(prev), ok: !!(prev.complete && prev.naturalWidth > 20), nw: prev.naturalWidth, nh: prev.naturalHeight} : null}; }"""
    JS_PICK_CAT = """(inp) => { document.querySelectorAll('[data-anim-cat]').forEach(e => e.removeAttribute('data-anim-cat')); const root = (""" + _JS_PROOT + """)(inp);
        for (const e of root.querySelectorAll('*')) { if (e.children.length) continue; const t = (e.textContent || '').trim();
            if (/^(tệp tải lên|uploads?|uploaded files?|your uploads)$/i.test(t)) { const r = e.getBoundingClientRect(); if (r.width > 0 && r.height > 0) { e.setAttribute('data-anim-cat', '1'); return true; } } }
        return false; }"""
    JS_CHIP_SRCS = """(box) => { const root = (""" + _JS_ROOT + """)(box);
        return Array.from(root.querySelectorAll('img')).filter(e => { const r = e.getBoundingClientRect(); return r.width >= 14 && r.height >= 14; }).map(e => e.currentSrc || e.src).filter(Boolean); }"""
    JS_CHIP_LOADED = """(box) => { const root = (""" + _JS_ROOT + """)(box);
        const im = Array.from(root.querySelectorAll('img')).filter(e => { const r = e.getBoundingClientRect(); return r.width >= 14 && r.height >= 14; });
        return im.length > 0 && im.every(e => e.complete && e.naturalWidth > 0); }"""
    JS_UPLOADING = """() => { let n = 0; for (const e of document.querySelectorAll('div,span,p')) { if (e.children.length) continue; const t = (e.textContent || '').trim();
            if (/^\\d{1,3}\\s*%$/.test(t)) { const r = e.getBoundingClientRect(); if (r.width > 0 && r.height > 0) n++; } }
        for (const e of document.querySelectorAll('[role=progressbar],progress')) { const r = e.getBoundingClientRect(); if (r.width > 0 && r.height > 0) n++; }
        return n; }"""
    REUSE_SAME = 5.0       # KHONG biet ten file da tai: do lech toi da (anh xem truoc / o nho vs anh mau) de coi la CHINH anh mau (chat: 2 anh mau gan giong nhau khong duoc nham)
    REUSE_SANE = 12.0      # DA biet ten file da tai (tim dung o theo ten): chi kiem tra lai xem anh xem truoc co khop khong

    def _thumb_diff(self, src, want):
        """Do lech (0..255) giua anh o duong dan src va anh mau 'want' (thu nho xam). None = khong tai/doc duoc."""
        try:
            return float(ImageStat.Stat(ImageChops.difference(ref_thumb(self._download(src)), want)).mean[0])
        except Exception:
            return None

    def _chip_ok(self, want):
        """Sau khi chon lai: anh dinh o khung soan co dung la anh mau khong? Sai han -> False (khong de ve nham nhan vat). Khong doc duoc anh -> coi la dung."""
        try:
            box = self._box()
            srcs = box.evaluate(self.JS_CHIP_SRCS) if box is not None else []
        except Exception:
            return True
        seen = False
        for s in srcs[:6]:
            d = self._thumb_diff(s, want)
            if d is None:
                continue
            seen = True
            if d <= 30:
                return True
        return not seen

    def _wait_chip_loaded(self, maxw=10.0):
        """Cho anh chip o khung soan hien xong (khong con khung giu cho) roi moi dan prompt / gui."""
        t0 = time.time()
        while time.time() - t0 < maxw:
            try:
                box = self._box()
                if box is None or box.evaluate(self.JS_CHIP_LOADED):
                    return True
            except Exception:
                return True
            self._pump()
            time.sleep(0.5)
        return False

    def _wait_uploaded(self, maxw=45.0):
        """Sau khi chon file: cho Flow tai len XONG (het % / thanh tien trinh, on dinh 2 nhip) roi moi bam 'Them vao cau lenh' — bam som thi chip la khung giu cho, gui di Flow bao 'Khong thanh cong'."""
        t0, calm = time.time(), 0
        time.sleep(1.0)
        while time.time() - t0 < maxw:
            if ABORT.is_set():
                raise RuntimeError("Đã dừng")
            try:
                busy = self.page.evaluate(self.JS_UPLOADING)
            except Exception:
                return
            calm = 0 if busy else calm + 1
            if calm >= 2:
                return
            self._pump()
            time.sleep(0.8)
        self.log("  (Flow tải ảnh mẫu lên lâu hơn %ds — vẫn tiếp tục)" % int(maxw))

    def _picker_names(self):
        """Ten (ma) cac file dang liet ke trong hop chon '+'."""
        inp = self._picker_input()
        if inp is None:
            return []
        try:
            rows = (inp.evaluate(self.JS_PICK_STATE) or {}).get("rows") or []
        except Exception:
            return []
        return [r.get("name") for r in rows if r.get("name")]

    @staticmethod
    def _uid_same(a, b):
        a, b = (a or "").strip().rstrip("….").lower(), (b or "").strip().rstrip("….").lower()
        n = min(len(a), len(b))
        return n >= 8 and a[:n] == b[:n]

    def _attach_existing(self, path, uid=""):
        """Anh mau DA tai len o tab nay: bam '+', mo muc 'Tep tai len', chon DUNG o da tai (theo ma ten Flow dat luc tai len; khong biet ma thi so sanh anh xem truoc ben phai voi anh mau),
        kiem tra anh xem truoc, 'Them vao cau lenh'. True/None = da dinh; False = khong chon duoc / chon sai (caller se tai len lai)."""
        pg = self.page
        try:
            with Image.open(path) as im_:
                want = ref_thumb(im_); wsz = im_.size
        except Exception:
            return False
        self._close_popups()
        base = self._comp_sig()
        comp = self._composer()
        plus = self._plus_button(comp) if comp is not None else None
        if plus is None:
            return False
        try:
            plus.click(timeout=2500)
        except Exception:
            self._close_popups(); return False
        inp = None
        for _ in range(14):
            pg.wait_for_timeout(300)
            inp = self._picker_input()
            if inp is not None:
                break
        if inp is None:
            self._close_popups(); return False

        def state():
            try:
                return inp.evaluate(self.JS_PICK_STATE) or {"rows": [], "prev": None}
            except Exception:
                return {"rows": [], "prev": None}

        def prev_diff(st):
            pv = st.get("prev")
            return self._thumb_diff(pv["src"], want) if pv and pv.get("ok") else None

        def click_marked(attr):
            el = pg.locator('[%s]' % attr).first
            try:
                el.scroll_into_view_if_needed(timeout=1500)
            except Exception:
                pass
            bb = el.bounding_box()
            if not bb:
                return False
            pg.mouse.click(bb["x"] + bb["width"] / 2.0, bb["y"] + bb["height"] / 2.0)
            return True

        def size_err(o):
            try:
                return abs(math.log(float(o["nw"] * o["nh"]) / float(wsz[0] * wsz[1]))) if o and o.get("nw") and o.get("nh") else 0.5
            except Exception:
                return 0.5
        found = False
        try:
            pg.wait_for_timeout(500)
            try:
                if inp.evaluate(self.JS_PICK_CAT) and click_marked('data-anim-cat="1"'):
                    pg.wait_for_timeout(800)                               # muc 'Tep tai len' trong hop chon (chi cac file da tai len, khong lan anh da ve)
            except Exception:
                pass
            st = state(); rows = st.get("rows") or []
            if uid:                                                        # 1) biet ma file da tai len luc dau: chon dung o do (khong nham sang anh khac gan giong)
                for r_ in rows:
                    if self._uid_same(r_.get("name"), uid) and click_marked('data-anim-pick="%d"' % r_["i"]):
                        pg.wait_for_timeout(700)
                        d = prev_diff(state())
                        if d is None or d <= self.REUSE_SANE:
                            found = True
                        break
            if not found:                                                  # 2) khong biet ma / khong thay: bam tung o, xem anh xem truoc khop nhat (nguong chat)
                st = state(); rows = st.get("rows") or []
                unknown, cands, last = 0, [], None
                for r_ in rows[:10]:
                    if not click_marked('data-anim-pick="%d"' % r_["i"]):
                        continue
                    last = r_["i"]
                    pg.wait_for_timeout(700)
                    st2 = state(); d = prev_diff(st2)
                    pv = st2.get("prev") if d is not None else r_
                    if d is None:
                        d = self._thumb_diff(r_.get("src") or "", want) if r_.get("src") else None
                    if d is None:
                        unknown += 1
                    elif d <= self.REUSE_SAME:
                        cands.append((round(size_err(pv), 2), d, r_["i"]))
                        if cands[-1][0] < 0.03 and d < 1.5:
                            break                                          # dung ca kich thuoc goc va hinh -> chinh la anh nay
                if cands:
                    best = min(cands)
                    if last != best[2]:                                    # nhieu o giong nhau (anh goc / ban nhe): chon lai o khop kich thuoc nhat
                        click_marked('data-anim-pick="%d"' % best[2]); pg.wait_for_timeout(600)
                    found = True
                elif unknown and len(rows) == 1 and not uid:
                    found = True                                           # chi co 1 file da tai len o tab nay va khong doc duoc anh de doi chieu -> chinh la anh mau
        except Exception:
            self._close_popups(); return False
        if not found:
            self._close_popups(); return False
        r = self._settle(base)
        if r is False:
            self._close_popups(); return False
        if r and not self._chip_ok(want):
            self.log("  (ảnh vừa chọn lại ở khung soạn không đúng ảnh mẫu → gỡ ra, tải ảnh mẫu lên lại)")
            try:
                self._clear_ingredients()
            except Exception:
                pass
            return False
        return True

    @staticmethod
    def _file_key(path):
        """Dau van tay anh mau: ten file + noi dung (doi anh khac / sua anh -> khoa khac -> tai anh moi len)."""
        h = hashlib.md5()
        with open(path, "rb") as f_:
            for chunk in iter(lambda: f_.read(1 << 20), b""):
                h.update(chunk)
        return (os.path.basename(path), h.hexdigest())

    def attach(self, path):
        """Flow: MOI TAB CHI TAI MOI ANH MAU LEN 1 LAN. Khung dau tai len; cac khung sau chon lai dung anh da tai len (khong tai lai). Anh mau MOI (doi anh / anh sua) -> nhan ra la anh khac -> tai anh moi len roi dung anh moi.
        Chon lai khong duoc thi tai len lai (an toan hon ve sai nhan vat). True = da dinh, False = that bai."""
        if not path or not os.path.isfile(path):
            return True
        try:
            key = self._file_key(path)
        except Exception:
            return self._attach_upload(path)
        up, url = self._refstate(), self._page_url()
        rec = up.get(key)
        if rec and rec.get("url") == url:
            if self._attach_existing(path, rec.get("uid") or ""):
                self._wait_chip_loaded()
                return True
            self.log("  (không chọn lại được ảnh mẫu đã tải ở tab này → tải lên lại)")
        elif up and not rec:
            self.log("  (ảnh mẫu mới — khác ảnh đã dùng ở tab này → tải ảnh mới lên)")
        self._uid_new = []
        ok = self._attach_upload(path)
        if ok:
            up[key] = dict(url=url, uid=(self._uid_new[0] if len(self._uid_new) == 1 else ""))
            self._wait_chip_loaded()
        return ok

    def _attach_upload(self, path):
        """Tai anh len + dinh vao khung soan Flow roi KIEM CHUNG anh da hien o khung (dem chip anh / chieu cao khung). Thu lan luot: nut '+' -> Tai len, o file san co, dan (paste); toi da 2 vong.
        True = da dinh (hoac khong kiem chung duoc), False = that bai (da luu debug/attach.png + attach.html)."""
        pg = self.page
        self._close_popups()
        base = self._comp_sig()
        errs = []

        def via_plus():
            comp = self._composer()
            plus = self._plus_button(comp) if comp is not None else None
            if plus is None:
                raise RuntimeError("không thấy nút +")
            plus.click(timeout=2500); time.sleep(0.5)               # chi bam MOT lan (bam lan nua se dong hop chon)
            self._pk_before = self._picker_names()                  # cac file da co trong hop chon (de biet ma cua file vua tai len)
            up = self._upload_btn()
            if up is not None:
                with pg.expect_file_chooser(timeout=4000) as fc:
                    up.click(timeout=5000)
                fc.value.set_files(path)
                return
            inp = pg.locator("input[type='file']")
            if not inp.count():
                raise RuntimeError("hộp chọn không có nút tải lên")
            inp.first.set_input_files(path)

        def via_input():
            inp = pg.locator("input[type='file']")
            if not inp.count():
                raise RuntimeError("không có ô chọn file")
            inp.first.set_input_files(path)

        def via_paste():
            ext = os.path.splitext(path)[1].lower()
            arr = [dict(name=os.path.basename(path), type="image/jpeg" if ext in (".jpg", ".jpeg") else "image/webp" if ext == ".webp" else "image/png",
                        b64=base64.b64encode(open(path, "rb").read()).decode())]
            if not pg.evaluate(self.JS_PASTE_FLOW, arr):
                raise RuntimeError("không thấy ô nhập để dán")

        for rnd in range(2):
            for name, fn in (("+", via_plus), ("ô file", via_input), ("dán", via_paste)):
                if rnd and name == "dán":
                    continue
                try:
                    fn()
                except Exception as e:
                    errs.append("%s: %s" % (name, str(e)[:60]))
                    self._close_popups()
                    continue
                self._wait_uploaded()                                   # cho Flow tai len XONG roi moi 'Them vao cau lenh'
                if name == "+":
                    try:
                        before_ = getattr(self, "_pk_before", []) or []
                        self._uid_new = [n_ for n_ in self._picker_names() if not any(self._uid_same(n_, b_) for b_ in before_)]
                    except Exception:
                        self._uid_new = []
                r = self._settle(base)
                if r is None:
                    self.log("  (không kiểm chứng được ảnh mẫu đã vào khung soạn — vẫn gửi)")
                    return True
                if r:
                    if errs:
                        self.log("  (đính được ảnh mẫu bằng cách '%s' sau khi các cách trước không vào khung: %s)" % (name, "; ".join(errs)[:160]))
                    return True
                errs.append("%s: đã tải nhưng ảnh không hiện ở khung soạn" % name)
                self._close_popups()
            time.sleep(1.5)
        self.log("  (không đính được ảnh mẫu vào Flow: %s)" % "; ".join(errs[-3:])[:200])
        self.dump("attach", comp_html=True)
        self._close_popups()
        return False

    # ---------------------------------------------------------------- ve anh
    # ---------------------------------------------------------------- nhan ra o 'Khong thanh cong' cua Flow (khong cho het gio)
    JS_FAILS = """() => { const pat = /(không thành công|không tạo được hình ảnh|failed to generate|generation failed|couldn.?t (create|generate)|unsuccessful)/i;
        let n = 0, t = '';                                           // chi duyet nut CHU (khong tinh bo cuc / innerText tung phan tu) -> nhe, khong lam cham trang Flow
        const w = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
        for (let x = w.nextNode(); x; x = w.nextNode()) { const v = x.nodeValue; if (!v || v.length > 200 || !pat.test(v)) continue;
            const e = x.parentElement; if (!e) continue; const r = e.getBoundingClientRect(); if (r.width < 8 || r.height < 8) continue;
            n++; if (!t) t = v.trim(); }
        return {n: n, t: t}; }"""

    def _fail_scan(self):
        try:
            return self.page.evaluate(self.JS_FAILS)
        except Exception:
            return None

    def _arm_fail(self):
        """Goi NGAY TRUOC khi bam gui: ghi so o 'Khong thanh cong' dang co (cua lan truoc) de chi tinh o MOI."""
        r = self._fail_scan()
        self._fail0 = r["n"] if r else None
        self._fail_hits = 0
        self._fail_text = ""

    def _flow_failed(self):
        """Ten loi Flow bao (chuoi) neu xuat hien o 'Khong thanh cong' MOI sau lan gui nay (thay o 2 lan kiem tra lien tiep); khong thi ''."""
        base = getattr(self, "_fail0", None)
        if base is None:
            return ""
        r = self._fail_scan()
        if r and r["n"] > base:
            self._fail_hits = getattr(self, "_fail_hits", 0) + 1
            if self._fail_hits >= 2:
                self._fail_text = r.get("t") or "Không thành công"
                return self._fail_text
        else:
            self._fail_hits = 0
        return ""

    def _imgs(self):
        return self.page.evaluate("""() => Array.from(document.images).filter(i => i.naturalWidth >= 400 && i.naturalHeight >= 300 && i.complete)
            .map(i => i.currentSrc || i.src)""")

    def snapshot(self):
        self.seen = set(self._imgs())

    def _flush(self, quiet=14, maxw=100):
        """Sau mot lan loi/het gio: Flow co the van ve xong anh CU sau do. Doi cho den khi danh sach anh on dinh de anh tre
        khong bi nhan nham la anh cua lan sau (gay lap anh o khung ke tiep)."""
        t0, last, t_ch = time.time(), None, time.time()
        while time.time() - t0 < maxw:
            if ABORT.is_set():
                raise RuntimeError("Đã dừng")
            cur = frozenset(self._imgs())
            if cur != last:
                last, t_ch = cur, time.time()
            elif time.time() - t_ch >= quiet:
                break
            self._pump()
            time.sleep(2)

    def generate(self, prompt, ref=None, aspect="3:4", timeout=180, refs=None):
        try:
            self._wake(self.page, lazy=True)
            if getattr(self, "dirty", False):
                self.log("  chờ Flow ổn định sau lỗi trước (tránh nhận nhầm ảnh cũ)…")
                self._flush()
                self.dirty = False
            return self._generate(prompt, ref, aspect, timeout, refs)
        except Exception:
            self.dirty = True
            raise

    # ---- ly do THAT SU Flow tu choi: doc ma loi trong cac phan hoi mang cua Flow (giao dien chi hien chung chung 'Khong thanh cong')
    F_HOSTS = ("googleapis.com", "google.com", "labs.google")
    F_RX = re.compile(r"(PUBLIC_ERROR_[A-Z0-9_]+|USER_QUOTA_REACHED|USER_REQUESTS_THROTTLED|PER_MODEL_[A-Z_]*QUOTA[A-Z_]*|RESOURCE_EXHAUSTED|UNUSUAL_ACTIVITY[A-Z_]*|TOO_MANY_REQUESTS|reCAPTCHA[^\"\\\\,]{0,40}|MODEL_ACCESS_DENIED|PERMISSION_DENIED|UNAUTHENTICATED|INVALID_ARGUMENT)")
    F_LIMIT = re.compile(r"(UNUSUAL_ACTIVITY|TOO_MUCH_TRAFFIC|THROTTLED|QUOTA|RESOURCE_EXHAUSTED|TOO_MANY_REQUESTS|reCAPTCHA|HTTP 429)", re.I)
    F_CONTENT = re.compile(r"(UNSAFE|SEXUAL|MINOR|DANGER|PROMINENT_PEOPLE|IP_INPUT_IMAGE|BLOCKED|FILTER|POLICY)", re.I)

    def _f_hook(self, page):
        """Ghi lai cac phan hoi XHR/fetch cua trang Flow (chi giu tham chieu, KHONG doc noi dung — chi doc khi Flow bao loi)."""
        hk = self.__dict__.setdefault("_fhook", {})
        cur = hk.get(id(page))
        if cur is not None and cur[0] is page:
            return cur[1]
        buf = []

        def on_resp(r):
            try:
                if r.request.resource_type not in ("xhr", "fetch"):
                    return
                if not any(h in r.url for h in Flow.F_HOSTS):
                    return
                if (r.headers.get("content-type") or "").lower().startswith(("image/", "video/", "audio/", "font/")):
                    return
                buf.append((time.time(), r))
                if len(buf) > 120:
                    del buf[:50]
            except Exception:
                pass
        try:
            page.on("response", on_resp)
        except Exception:
            pass
        hk[id(page)] = (page, buf)
        return buf

    def _f_reason(self, since, save=None):
        """(loai, chuoi) ly do Flow tra ve tu luc `since`: loai = 'limit' (han muc / reCAPTCHA / nghi hoat dong bat thuong: DOI doi anh mau khong giup),
        'content' (loc noi dung / anh mau bi chan), 'unknown'. save=ten: luu cac phan hoi dang ngo vao DEBUG/<ten>_net.txt de gui lai cho nha phat trien."""
        ent = (self.__dict__.get("_fhook") or {}).get(id(self.page))
        if not ent:
            return "unknown", ""
        codes, notes, dump = [], [], []
        for ts, r in list(ent[1])[-40:]:
            if ts < since - 1.0:
                continue
            try:
                st = int(r.status)
            except Exception:
                st = 0
            try:
                cl = int(r.headers.get("content-length") or 0)
            except Exception:
                cl = 0
            body = ""
            if cl < 400000:
                try:
                    body = (r.text() or "")[:300000]
                except Exception:
                    body = ""
            found = [m.group(0).strip() for m in self.F_RX.finditer(body)]
            for c in found:
                if c not in codes:
                    codes.append(c)
            if st >= 400:
                m = re.search(r'"message"\s*:\s*"([^"]{1,140})', body)
                notes.append("HTTP %d%s" % (st, (" " + m.group(1)) if m else ""))
            if found or st >= 400:
                dump.append("%s  HTTP %s  %s\n%s\n" % (time.strftime("%H:%M:%S", time.localtime(ts)) if hasattr(time, "localtime") else "", st, r.url.split("?")[0][-110:], body[:1500]))
        txt = ", ".join((codes[-3:] + notes[-2:]))[:200]
        if save and dump:
            try:
                os.makedirs(DEBUG, exist_ok=True)
                open(os.path.join(DEBUG, save + "_net.txt"), "w", encoding="utf-8").write("\n".join(dump)[:20000])
            except Exception:
                pass
        key = " ".join(codes[-2:] + notes[-1:])
        if self.F_LIMIT.search(key):
            return "limit", txt
        if self.F_CONTENT.search(key):
            return "content", txt
        return "unknown", txt

    # ====================================================================================================================================
    # TAB 'VE RA' - cach gui rieng, DOC LAP voi cac tab khac (tab Story giu nguyen code 1.3.8 ben tren). Chi chay khi self._draw_mode (generate_many(draw=True)).
    # Thu cong: lan dau o tab: '+' -> 'Tai noi dung' (chon file) -> doi nut 'Them vao cau lenh' sang -> bam -> dan prompt -> nut gui sang -> gui.
    # Tu lan 2: '+' -> (anh tren cung = anh mau da duoc Flow chon san) -> 'Them vao cau lenh' -> dan prompt -> gui. KHONG Esc / bam ra ngoai, KHONG tai lai trang.
    # Ten ham deu bat dau bang _d_ de khong lan voi code dung chung.
    # ====================================================================================================================================
    JS_D_PASTE = """(el, v) => { el.focus(); let handled = false;
        try { const dt = new DataTransfer(); dt.setData('text/plain', v);
            const ev = new ClipboardEvent('paste', {clipboardData: dt, bubbles: true, cancelable: true}); el.dispatchEvent(ev); handled = ev.defaultPrevented; } catch (e) {}
        if (!handled) { document.execCommand('selectAll', false, null); document.execCommand('insertText', false, v); } }"""
    JS_D_SET = """(el, v) => { el.focus();
        if (el.value !== undefined && el.value !== null) { const p = el.tagName === 'TEXTAREA' ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
            const d = Object.getOwnPropertyDescriptor(p, 'value'); if (d && d.set) d.set.call(el, v); else el.value = v;
            el.dispatchEvent(new Event('input', {bubbles: true})); }
        else { document.execCommand('selectAll', false, null); document.execCommand('insertText', false, v); } }"""
    JS_D_ANY = """(a) => { const n = s => String(s || '').split(/\\s+/).filter(Boolean).join(' ');
        for (const e of document.querySelectorAll("textarea,[contenteditable='true'],[role='textbox'],input[type='text']")) {
            const t = n((e.value !== undefined && e.value !== null) ? e.value : (e.innerText || e.textContent || ''));
            if (t.length >= Math.min(a.length, Math.max(10, Math.floor(a.length * 0.6))) && t.indexOf(a.slice(0, 24)) >= 0) return true; }
        return false; }"""
    JS_D_ADD = """() => { const re = /(thêm vào câu lệnh|add to prompt)/i;
        for (const e of document.querySelectorAll('button,[role=button],div,span')) { if (e.children.length > 3) continue; const t = (e.innerText || '').trim();
            if (!t || t.length > 40 || !re.test(t)) continue; const r = e.getBoundingClientRect(); if (r.width < 4 || r.height < 4) continue;
            const b = e.closest('button,[role=button]') || e; return (b.disabled || b.getAttribute('aria-disabled') === 'true') ? 0 : 1; }
        return -1; }"""

    @staticmethod
    def _d_norm(s):
        return " ".join(str(s or "").split())

    def _d_prompt_in(self, box, prompt):
        """True = o dang chua prompt; False = trong / thieu; None = khong doc duoc."""
        try:
            t = box.evaluate("e => (e.value !== undefined && e.value !== null) ? String(e.value) : String(e.innerText || e.textContent || '')")
        except Exception:
            return None
        a, b = self._d_norm(prompt), self._d_norm(t)
        if not a:
            return True
        need = min(len(a), max(10, int(len(a) * 0.6)))
        return len(b) >= need and a[:24] in b

    def _d_prompt_any(self, prompt):
        a = self._d_norm(prompt)
        if not a:
            return True
        try:
            return bool(self.page.evaluate(self.JS_D_ANY, a))
        except Exception:
            return False

    def _d_find_send(self, box):
        """Nut gui (mui ten) cua khung soan: nut ngoai cung ben phai, cung hang / duoi o nhap (bo nut xoa cua chip anh). None = khong thay."""
        try:
            comp = self._composer(box)
            allb = self._buttons(comp)
            by = box.bounding_box()["y"]
            btns = [b for b in allb if b[1] >= by - 6 and not self._RM_PAT.search(b[3] or "")] or allb
            return btns[-1][2] if btns else None
        except Exception:
            return None

    def _d_enter(self, prompt, order):
        """Nhap prompt vao o roi doc lai. Cach: 4 dan nhu Ctrl+V, 3 go tung phim that, 0 fill, 1 chen chu, 2 gan gia tri bang JS. True = da co chu trong o."""
        pg = self.page
        for n_, att in enumerate(order):
            box = self._box()
            if box is None:
                time.sleep(0.4)
                continue
            try:
                if att == 4:
                    _click_or_focus(box)
                    pg.keyboard.press("Control+A"); pg.keyboard.press("Delete")
                    box.evaluate(self.JS_D_PASTE, prompt)
                elif att == 3:
                    _click_or_focus(box)
                    pg.keyboard.press("Control+A"); pg.keyboard.press("Delete")
                    pg.keyboard.type(self._d_norm(prompt), delay=0)             # bo xuong dong: Enter trong o la GUI
                elif att == 0:
                    _click_or_focus(box)
                    try:
                        box.fill("", timeout=8000)
                    except Exception:
                        pg.keyboard.press("Control+A"); pg.keyboard.press("Delete")
                    try:
                        box.fill(prompt, timeout=8000)
                    except Exception:
                        pg.keyboard.insert_text(prompt)
                elif att == 1:
                    _click_or_focus(box)
                    pg.keyboard.press("Control+A"); pg.keyboard.press("Delete")
                    pg.keyboard.insert_text(prompt)
                else:
                    box.evaluate(self.JS_D_SET, prompt)
            except Exception:
                pass
            time.sleep(0.2)
            if self._d_prompt_in(box, prompt) is True:
                if n_:
                    self.log("  (nhập prompt cách %d mới vào ô — đã đọc lại thấy đủ)" % (n_ + 1))
                return True
            time.sleep(0.3)
        return False

    def _d_add_state(self):
        """Nut 'Them vao cau lenh': -1 chua thay, 0 dang tat (cho tai len xong), 1 san sang."""
        try:
            return int(self.page.evaluate(self.JS_D_ADD))
        except Exception:
            return -1

    def _d_click_add(self):
        try:
            loc = self.page.get_by_text(re.compile(r"(thêm vào câu lệnh|add to prompt)", re.I))
            for i in range(min(loc.count(), 4)):
                if loc.nth(i).is_visible():
                    loc.nth(i).click(timeout=2000)
                    return True
        except Exception:
            pass
        return False

    def _d_close_picker(self):
        """SAU KHI dinh anh mau THAT BAI: dong hop chon '+' con mo do dang (bam lai nut '+', khong duoc moi nhan Esc), de lan thu sau mo hop MOI chu khong dung lai trang thai ket."""
        try:
            if not self._d_picker_open():
                return
            comp = self._composer()
            plus = self._plus_button(comp) if comp is not None else None
            if plus is not None:
                plus.click(timeout=2000)
                self.page.wait_for_timeout(500)
            if self._d_picker_open():
                self.page.keyboard.press("Escape")
                self.page.wait_for_timeout(400)
        except Exception:
            pass

    def _d_picker_open(self):
        try:
            pre = self._picker_input()
            return bool(pre is not None and pre.bounding_box()["y"] > 200)
        except Exception:
            return False

    def _d_thumb_diff(self, src, want, ms=5000):
        """Do lech (0..255) giua anh o duong dan src va anh mau 'want' (thu nho xam). CO GIOI HAN THOI GIAN (ms): tai treo khong lam ca tab dung. None = khong tai / doc duoc."""
        try:
            b64 = self.page.evaluate("""async ([src, ms]) => { const c = new AbortController(); const t = setTimeout(() => c.abort(), ms);
                try { const r = await fetch(src, {signal: c.signal}); const b = await r.blob();
                    return await new Promise(res => { const f = new FileReader(); f.onload = () => res(f.result.split(',')[1]); f.readAsDataURL(b); }); }
                finally { clearTimeout(t); } }""", [src, int(ms)])
            im = Image.open(io.BytesIO(base64.b64decode(b64))).convert("RGB")
            return float(ImageStat.Stat(ImageChops.difference(ref_thumb(im), want)).mean[0])
        except Exception:
            return None

    def _d_chip_ok(self, want):
        """Chot: anh dinh o khung soan co phai anh mau khong (chip la anh nho -> tai nhanh). Sai han -> False. Khong doc duoc anh -> coi la dung."""
        try:
            box = self._box()
            srcs = box.evaluate(self.JS_CHIP_SRCS) if box is not None else []
        except Exception:
            return True
        seen = False
        for s_ in srcs[:6]:
            d = self._d_thumb_diff(s_, want, 4000)
            if d is None:
                continue
            seen = True
            if d <= 30:
                return True
        return not seen

    def _d_preview_diff(self, want):
        """Do lech giua ANH XEM TRUOC dang chon trong hop '+' va anh mau. None = chua doc duoc."""
        try:
            inp = self._picker_input()
            pv = ((inp.evaluate(self.JS_PICK_STATE) or {}).get("prev")) if inp is not None else None
            return self._d_thumb_diff(pv["src"], want, 5000) if pv and pv.get("ok") else None
        except Exception:
            return None

    def _d_preselected(self, want):
        """Mo hop '+' o khung sau: Flow thuong da CHON SAN anh tai len gan nhat. Neu anh xem truoc dang chon chinh la anh mau (do lech nho) va nut 'Them vao cau lenh' da sang -> True
        (khong can tim / bam gi them). Doc khong duoc anh xem truoc hoac khac anh mau -> False (nguoi goi tim theo ten)."""
        if want is None:
            return False
        t0 = time.time()
        while True:
            st = self._d_add_state()
            if st == 1:
                d = self._d_preview_diff(want)
                if d is not None:
                    return d <= self.REUSE_SAME
            if time.time() - t0 >= (1.6 if st == 1 else 0.5):    # chua co anh nao duoc chon san: khong cho lau, di tim theo ten luon
                return False
            self.page.wait_for_timeout(200)

    def _d_clear_search(self):
        """Xoa o 'Tim kiem thanh phan' neu con chu tu lan truoc (de danh sach day du)."""
        try:
            inp = self._picker_input()
            if inp is not None and (inp.input_value() or "").strip():
                inp.fill("", timeout=2000)
                self.page.wait_for_timeout(250)
        except Exception:
            pass

    def _d_reuse(self, want, uid, fname=""):
        """Khung SAU (anh mau da tai len o DU AN nay): hop chon '+' dang mo -> TIM THEO TEN anh mau (go ten vao o 'Tim kiem thanh phan'; ten = ten Flow hien luc tai len, khong co thi ten file)
        -> bam dung dong co ten do. True = da chon (nut 'Them vao cau lenh' se sang). False = khong thay -> nguoi goi TAI LEN LAI. KHONG BAO GIO bam dong dau tien cho xong."""
        pg = self.page
        inp = self._picker_input()
        if inp is None:
            return False
        t_all = time.time()

        def state():
            try:
                return inp.evaluate(self.JS_PICK_STATE) or {"rows": [], "prev": None}
            except Exception:
                return {"rows": [], "prev": None}

        def click_marked(attr):
            el = pg.locator('[%s]' % attr).first
            try:
                el.scroll_into_view_if_needed(timeout=1500)
            except Exception:
                pass
            bb = el.bounding_box()
            if not bb:
                return False
            pg.mouse.click(bb["x"] + bb["width"] / 2.0, bb["y"] + bb["height"] / 2.0)
            return True

        terms = []
        for t_ in (uid, os.path.splitext(fname or "")[0]):
            t_ = str(t_ or "").strip().rstrip("….").strip()[:36]
            tok = (t_.split() or [""])[0].rstrip("….")            # ten co the dinh kem nhan loai ('... Hinh anh') -> thu them chi phan dau (ma / ten) de o tim kiem khop
            for c_ in ((tok, t_) if len(tok) >= 8 and tok != t_ else (t_,)):
                if len(c_) >= 4 and c_.lower() not in [x.lower() for x in terms]:
                    terms.append(c_)

        def matches(rows, term):
            tl = term.lower()
            return [r_ for r_ in rows if r_.get("name") and (tl in str(r_["name"]).lower() or self._uid_same(r_.get("name"), term))]

        def prev_src():
            try:
                pv = state().get("prev")
                return (pv or {}).get("src") if pv and pv.get("ok") else None
            except Exception:
                return None

        def pick(rows, term):
            for r_ in matches(rows, term)[:3]:
                before = prev_src()
                if not click_marked('data-anim-pick="%d"' % r_["i"]):
                    continue
                d, t2 = None, time.time()
                while time.time() - t2 < 1.6:                   # cho anh xem truoc DOI sang dong vua bam roi moi so voi anh mau
                    pg.wait_for_timeout(200)
                    now = prev_src()
                    if now and now != before:
                        break
                if want is not None:
                    d = self._d_preview_diff(want)
                if d is not None and d > self.REUSE_SANE:       # trung ten nhung la anh KHAC (anh xem truoc doc duoc va lech nhieu) -> bo qua dong nay
                    self.log("  (dòng «%s» có tên giống nhưng ảnh xem trước KHÁC ảnh mẫu (lệch %.0f) → bỏ qua)" % (str(r_.get("name") or "?")[:24], d))
                    continue
                self.log("  ↻ chọn lại ảnh mẫu «%s» theo tên (%.1fs%s)" % (str(r_.get("name") or "?")[:30], time.time() - t_all, "" if d is None else ", xem trước khớp"))
                return True
            return False
        seen = []
        try:
            pg.wait_for_timeout(250)
            rows = state().get("rows") or []
            seen = [r_.get("name") for r_ in rows]
            for term in terms:                                  # 1) dong da hien san trong danh sach: bam luon (khong can go)
                if pick(rows, term):
                    return True
            for term in terms:                                  # 2) go ten vao o tim kiem -> danh sach loc con dong co ten do
                try:
                    inp.fill(term, timeout=3000)
                except Exception:
                    continue
                rows, t1 = [], time.time()
                while time.time() - t1 < 2.4:
                    pg.wait_for_timeout(250)
                    rows = state().get("rows") or []
                    if matches(rows, term):
                        break
                seen = [r_.get("name") for r_ in rows] or seen
                if pick(rows, term):
                    return True
            try:
                inp.fill("", timeout=2000)                      # khong thay theo ten: xoa o tim kiem de khong lam hong lan sau
            except Exception:
                pass
            if want is not None:                                # 3) du phong: muc 'Tep tai len' + so anh xem truoc (nguong chat), chi thu vai dong dau
                try:
                    if inp.evaluate(self.JS_PICK_CAT) and click_marked('data-anim-cat="1"'):
                        pg.wait_for_timeout(700)
                except Exception:
                    pass
                for r_ in (state().get("rows") or [])[:4]:
                    if not click_marked('data-anim-pick="%d"' % r_["i"]):
                        continue
                    pg.wait_for_timeout(600)
                    d = self._d_preview_diff(want)
                    if d is not None and d <= self.REUSE_SAME:
                        self.log("  ↻ chọn lại ảnh mẫu theo ảnh xem trước (độ lệch %.1f)" % d)
                        return True
        except Exception:
            return False
        self.log("  (không thấy ảnh mẫu «%s» trong hộp chọn; thấy các tên: %s)" % (", ".join(terms)[:60], "; ".join(str(x)[:22] for x in seen[:6]) or "—"))
        return False

    def _d_refstate(self):
        """Anh mau da tai len o TUNG tab (theo trang). Tab mo lai / du an khac thi tinh lai tu dau."""
        st = self.__dict__.setdefault("_d_up", {})
        cur = st.get(id(self.page))
        if cur is None or cur[0] is not self.page:
            cur = (self.page, {})
            st[id(self.page)] = cur
        return cur[1]

    @staticmethod
    def _d_file_key(path):
        h = hashlib.md5()
        h.update(os.path.basename(path).encode("utf-8", "replace"))
        with open(path, "rb") as f_:
            for blk in iter(lambda: f_.read(1 << 20), b""):
                h.update(blk)
        return h.hexdigest()

    def _d_attach(self, path, force_upload=False):
        """Dinh anh mau vao khung soan NHU LAM TAY (khong Esc, khong bam ra ngoai). True = chip anh mau DUNG da hien o khung soan; False = that bai (ly do o self._attach_why).
        KHOA THU TU: moi TAB x moi DU AN Flow, anh mau phai duoc TAI LEN truoc (that bai thi khong gui khung nao). Khung sau chi chon lai dung anh da tai (kiem tra anh xem truoc);
        khong chac thi tai len lai; chip cuoi cung van bi doi chieu voi anh mau, sai thi go ra va KHONG gui."""
        self._attach_why = ""
        if not path or not os.path.isfile(path):
            return True
        t_att = time.time()
        pg = self.page
        fname = os.path.basename(path)
        try:
            key = self._d_file_key(path)
        except Exception:
            key = None
        try:
            with Image.open(path) as im_:
                want = ref_thumb(im_)
        except Exception:
            want = None
        up, url = self._d_refstate(), self._page_url()
        rec = up.get(key) if key is not None else None
        if rec is not None and rec.get("url") != url:           # anh da tai len o DU AN KHAC (cung tab): du an nay chua co anh mau -> phai tai len
            self.log("  (dự án Flow đã đổi so với lúc tải ảnh mẫu → tải ảnh mẫu lên lại ở dự án này)")
            up.pop(key, None); rec = None
        if force_upload:
            rec = None
        base = self._comp_sig()
        if not self._d_picker_open():
            comp = self._composer()
            plus = self._plus_button(comp) if comp is not None else None
            if plus is None:
                self._attach_why = "không thấy nút +"; return False
            try:
                plus.click(timeout=2500)
            except Exception:
                self._attach_why = "không bấm được nút +"; return False
        for _ in range(16):
            pg.wait_for_timeout(250)
            if self._picker_input() is not None:
                break
        else:
            self._attach_why = "hộp chọn «+» không mở"; return False
        uploaded, uid_new = False, []
        self._d_clear_search()
        if rec is not None:                                     # khung SAU o du an nay: chon lai DUNG anh mau da tai (khong chac -> tai len lai)
            if self._d_preselected(want):                       # Flow da chon san dung anh mau (anh xem truoc khop) -> them luon
                self.log("  ↻ Flow đã chọn sẵn ảnh mẫu (xem trước khớp) → thêm vào câu lệnh (%.1fs)" % (time.time() - t_att))
            elif not self._d_reuse(want, rec.get("uid") or fname, fname):
                self.log("  (không chọn lại được ảnh mẫu đã tải ở dự án này → tải lên lại)")
                rec = None
        if rec is None:                                         # LAN DAU o tab x du an nay: LUON '+' -> 'Tai noi dung' -> chon file (ke ca khi thu vien Flow da co file cung ten)
            names0 = self._picker_names()
            upb = self._upload_btn()
            try:
                if upb is not None:
                    with pg.expect_file_chooser(timeout=4000) as fc:
                        upb.click(timeout=5000)
                    fc.value.set_files(path)
                else:
                    inp_f = pg.locator("input[type='file']")
                    if not inp_f.count():
                        self._attach_why = "hộp chọn không có nút «Tải nội dung»"; return False
                    inp_f.first.set_input_files(path)
            except Exception as e:
                self._attach_why = "không chọn được file để tải lên (%s)" % str(e)[:60]; return False
            uploaded = True
            self.log("  ⬆ tải ảnh mẫu «%s» lên Flow (lần đầu ở tab / dự án này)" % fname)
            self._wait_uploaded()
            try:
                uid_new = [x for x in self._picker_names() if not any(self._uid_same(x, b_) for b_ in names0)]
            except Exception:
                uid_new = []
            if key is not None:                                 # da tai len: ghi nho NGAY, gan voi DU AN nay (sang du an khac thi phai tai lai)
                up[key] = dict(url=url, uid=(uid_new[0] if len(uid_new) == 1 else fname))
            if want is not None:                                # tai xong -> kiem tra anh Flow dang chon la ANH MAU; khong phai thi chon lai DUNG anh mau roi moi 'Them vao cau lenh'
                dv = self._d_preview_diff(want)
                if dv is not None and dv > self.REUSE_SANE:
                    self.log("  (sau khi tải lên, ảnh đang chọn không phải ảnh mẫu (lệch %.0f) → chọn lại đúng ảnh mẫu)" % dv)
                    self._d_reuse(want, (up.get(key) or {}).get("uid") or fname, fname)
        t0, lim = time.time(), (10.0 if uploaded else 4.0)      # (da cho tai len xong o _wait_uploaded; khong sang thi con thu chon theo ten ben duoi)
        while time.time() - t0 < lim and self._d_add_state() != 1:                # cho nut 'Them vao cau lenh' SANG
            self._pump()
            pg.wait_for_timeout(200)
        st_ = self._d_add_state()
        if st_ != 1 and uploaded:                               # da tai len ma chua co anh nao duoc chon: Flow co the da them anh vao thu vien nhung khong tu chon -> chon theo TEN roi moi bo cuoc
            try:
                if self._d_reuse(want, (up.get(key) or {}).get("uid") or fname, fname):
                    t0 = time.time()
                    while time.time() - t0 < 4.0 and self._d_add_state() != 1:
                        pg.wait_for_timeout(200)
                    st_ = self._d_add_state()
            except Exception:
                pass
        if st_ != 1:                                            # khong sang = chua co anh nao duoc chon: KHONG bam, KHONG dan prompt, KHONG bam o dau tien
            if not uploaded and not force_upload:
                self.log("  (nút «Thêm vào câu lệnh» chưa sáng sau khi chọn lại → tải ảnh mẫu lên lại)")
                return self._d_attach(path, force_upload=True)
            try:
                seen_n = self._picker_names()
            except Exception:
                seen_n = []
            self._attach_why = ("không thấy nút «Thêm vào câu lệnh»" if st_ == -1 else "nút «Thêm vào câu lệnh» không sáng (chưa chọn được ảnh)") + \
                               ("; đã tải lên" if uploaded else "; chưa tải lên được") + \
                               ("; hộp «+» đang có %d dòng: %s" % (len(seen_n), ", ".join(str(x)[:20] for x in seen_n[:4])) if seen_n else "; hộp «+» không có dòng nào")
            return False
        self._d_click_add()
        t1 = time.time()
        while time.time() - t1 < 3.0 and self._d_picker_open():                   # doi hop chon DONG roi moi dem anh o khung soan (hop chon dang mo co the lam so anh nhin thay tang gia)
            pg.wait_for_timeout(150)
        if self._d_picker_open() and self._d_add_state() == 1:                    # van mo: lan bam dau chua an -> bam lai 1 lan
            self._d_click_add()
            t1 = time.time()
            while time.time() - t1 < 2.0 and self._d_picker_open():
                pg.wait_for_timeout(150)
        t1, grew = time.time(), None
        while time.time() - t1 < 5.0:                           # cho chip anh hien o khung soan
            grew = self._sig_grew(base, self._comp_sig())
            if grew is None or grew:
                break
            pg.wait_for_timeout(150)
        if grew is False:
            self._attach_why = "bấm «Thêm vào câu lệnh» nhưng ảnh không vào khung soạn"; return False
        if grew is None:
            self.log("  (không kiểm chứng được ảnh mẫu đã vào khung soạn — vẫn gửi)")
        if key is not None and key not in up:
            up[key] = dict(url=url, uid=fname)
        self._wait_chip_loaded(4.0)
        if want is not None and not self._d_chip_ok(want):      # CHOT: anh dang o khung soan phai la anh mau (khong phai anh vua ve)
            self.log("  ⚠ ảnh vừa đính ở khung soạn KHÔNG phải ảnh mẫu → gỡ ra" + ("" if (uploaded or force_upload) else ", tải ảnh mẫu lên lại"))
            try:
                self._clear_ingredients()
            except Exception:
                pass
            if not uploaded and not force_upload:
                return self._d_attach(path, force_upload=True)
            self._attach_why = "ảnh đính ở khung soạn không khớp ảnh mẫu"
            return False
        if time.time() - t_att > 6.0:
            self.log("  (đính ảnh mẫu mất %.0fs%s)" % (time.time() - t_att, " — gồm tải lên" if uploaded else ""))
        return True

    def _heal_ref(self):
        """Dua TAB nay ve trang thai sach de dinh lai anh mau: dong hop chon '+' dang ket, QUEN anh da tai len (lan toi tai len lai), KHONG tai lai trang."""
        for fn in (self._d_close_picker, lambda: self._d_refstate().clear(), lambda: self._refstate().clear()):
            try:
                fn()
            except Exception:
                pass

    def _trim_chips(self, keep):
        """Go bot anh dinh kem o khung soan cho con dung 'keep' cai (lan dinh truoc co the vao tre -> dinh lai se bi thua 1 chip)."""
        if keep is None:
            return
        pg = self.page
        try:
            for _ in range(4):
                s = self._comp_sig()
                box = self._box()
                if not s or box is None or s["thumbs"] <= keep or not box.evaluate(self.JS_RM_MARK):
                    break
                pg.locator("[data-anim-rm='1']").first.click(timeout=1500)
                time.sleep(0.4)
        except Exception:
            pass
        finally:
            try:
                pg.evaluate("() => document.querySelectorAll('[data-anim-rm]').forEach(e => e.removeAttribute('data-anim-rm'))")
            except Exception:
                pass

    def _d_attach_retry(self, path):
        """Dinh anh mau, KHONG bo cuoc som: that bai thi dong hop chon, quen anh da tai, TAI LEN LAI roi dinh lai ngay tren tab nay (toi da ATT_TRIES lan, khong tai lai trang).
        True = da dinh; False = het lan thu (ly do cua lan cuoi o self._attach_why)."""
        why = ""
        s_ = self._comp_sig()
        thumbs0 = s_["thumbs"] if s_ else None
        for att in range(ATT_TRIES):
            if ABORT.is_set():
                raise RuntimeError("Đã dừng")
            if self._d_attach(path, force_upload=(att > 0)):
                if att:
                    self.log("  ✔ đính được ảnh tham chiếu ở lần thử %d/%d" % (att + 1, ATT_TRIES))
                return True
            why = getattr(self, "_attach_why", "") or "?"
            if att >= ATT_TRIES - 1:
                break
            self.log("  ⚠ chưa đính được ảnh tham chiếu (%s) → tự tải ảnh lên lại và đính lại, lần %d/%d (không tải lại trang)" % (why, att + 2, ATT_TRIES))
            self._heal_ref()
            self._trim_chips(thumbs0)
            self.page.wait_for_timeout(800 + 700 * att)
        self._attach_why = why
        return False

    def _submit_draw(self, prompt, ref=None, aspect="3:4", refs=None, lite=False, crop=False):
        """TAB 'VE RA': (chon ti le lan dau) -> dinh anh mau (_d_attach) -> dan prompt -> cho nut gui SANG -> gui. Chua doi anh."""
        pg = self.page
        self._f_hook(pg)
        self.set_aspect(aspect)
        self._clear_ingredients()                               # anh dinh kem con sot (neu Flow giu lai) - khong lam gi neu khong co
        if crop:
            self.log("  thử cắt riêng một nhân vật từ ảnh mẫu (bỏ các hình phụ của sheet)")
        elif lite:
            self.log("  thử ảnh tham chiếu bản nhẹ (JPEG, cạnh dài ≤ %d px)" % LITE_SIDE)
        self._ref_sigs = []
        seen_refs = set()
        for r_ in [x for x in ([ref] if ref else []) + list(refs or []) if x]:
            rk_ = os.path.normcase(os.path.abspath(r_))
            if rk_ in seen_refs:
                continue
            seen_refs.add(rk_)
            try:                                                # dau van tay anh mau: anh tai len hien o thu vien Flow KHONG duoc nhan nham la anh vua ve
                with Image.open(r_) as ri_:
                    self._ref_sigs.append(ref_thumb(ri_))
            except Exception:
                pass
            if crop:
                r_ = crop_ref(r_) or lite_ref(r_)
            elif lite:
                r_ = lite_ref(r_)
            if not self._d_attach_retry(r_):
                self.dump("attach", comp_html=True)
                self._d_close_picker()
                msg = ("Không đính được ảnh tham chiếu: %s (ảnh %s) nên KHÔNG vẽ, vì vẽ tiếp sẽ ra nhân vật sai. Đã lưu ảnh chụp + cấu trúc khung soạn vào %s (attach.png, attach.html)."
                       % (getattr(self, "_attach_why", "") or "?", os.path.basename(r_), DEBUG))
                if not REF_LAX:
                    raise RefAttachError(msg)
                self.log("  ⚠ " + msg + " (chế độ lỏng: vẫn gửi)")
        self.snapshot()                                         # chup lai SAU khi dinh anh: anh mau vua tai len khong bi nhan nham la anh moi ve
        self._arm_fail()
        box = self._box()
        if box is None:
            self.dump("no_box"); raise RuntimeError("Mất ô nhập prompt của Flow")
        send0 = self._d_find_send(box)
        try:                                                    # o prompt TRONG ma nut gui da TAT (Flow: 'Ban phai cung cap cau lenh') -> nut gui sang = Flow da NHAN chu
            reliable = bool(send0 is not None and not send0.is_enabled())
        except Exception:
            reliable = False
        sent = False
        orders = ((4, 3, 0), (3, 4, 1), (0, 4, 2))              # moi luot thu thu tu khac nhau (4 = dan nhu Ctrl+V, 3 = go tung phim that, 0 = fill)
        for rnd, order in enumerate(orders):
            last = rnd == len(orders) - 1
            if not self._d_enter(prompt, order):
                if last:
                    self.dump("prompt_empty")
                    raise PromptNotEntered("Không nhập được prompt vào ô của Flow (đọc lại thấy ô trống) nên KHÔNG bấm gửi. Đã lưu ảnh chụp vào %s." % DEBUG)
                self.log("  ⚠ Chưa nhập được prompt vào ô của Flow (lần %d/%d) → thử lại bằng cách nhập khác" % (rnd + 1, len(orders)))
                continue
            box = self._box() or box
            send = self._d_find_send(box)
            enabled = None
            if send is not None:                                # cho nut gui SANG (Flow nhan chu xong thi nut moi sang)
                t_end = time.time() + (5.0 if last else 2.5)
                while True:
                    try:
                        enabled = bool(send.is_enabled())
                    except Exception:
                        enabled = None
                        break
                    if enabled or time.time() >= t_end:
                        break
                    time.sleep(0.2)
            elif not reliable:
                time.sleep(0.4)
            dom_ok = self._d_prompt_in(box, prompt) is True or self._d_prompt_any(prompt)
            if reliable and enabled:
                pass                                            # nut gui da sang tu TRONG ra CO CHU = Flow da nhan prompt
            elif reliable and send is not None and not enabled:
                self.log("  ⚠ Ô đã có chữ nhưng nút gửi của Flow vẫn tắt (Flow chưa nhận chữ) — lần %d/%d%s" % (rnd + 1, len(orders), "" if last else " → nhập lại bằng cách khác"))
                if last:
                    self.dump("prompt_vanish", comp_html=True)
                    raise PromptNotEntered("Flow không nhận prompt (nút gửi vẫn tắt sau %d lần nhập: dán, gõ phím, fill) nên KHÔNG gửi. Đã lưu ảnh chụp + cấu trúc khung soạn vào %s (prompt_vanish.png, prompt_vanish.html)." % (len(orders), DEBUG))
                continue
            elif not dom_ok:                                    # khong co dau hieu nut gui: dua vao viec doc lai o nhap
                self.log("  ⚠ Flow XÓA prompt khỏi ô sau khi nhập (lần %d/%d)%s" % (rnd + 1, len(orders), "" if last else " → nhập lại bằng cách khác"))
                if not getattr(self, "_d_vd", False):
                    self._d_vd = True
                    self.dump("prompt_vanish", comp_html=True)
                if last:
                    raise PromptNotEntered("Prompt biến mất khỏi ô của Flow ngay trước khi bấm gửi (đã nhập lại %d lần đều bị xóa) nên KHÔNG gửi. Đã lưu ảnh chụp + cấu trúc khung soạn vào %s (prompt_vanish.png, prompt_vanish.html)." % (len(orders), DEBUG))
                continue
            if send is not None:
                try:
                    send.click(timeout=2000); sent = True
                except Exception:
                    sent = False
            break
        if not sent:
            time.sleep(0.4)
            if self._d_prompt_in(box, prompt) is False and not self._d_prompt_any(prompt):     # bam gui nhung bao loi, ma o nhap da trong = Flow da nhan prompt -> dung gui them lan nua
                sent = True
            elif self._d_prompt_in(box, prompt) is True or self._d_prompt_any(prompt):
                _click_or_focus(box, 3000)
                pg.keyboard.press("Enter")
            else:
                raise PromptNotEntered("Không đọc lại được ô nhập của Flow nên KHÔNG gửi.")
        self._fsent_t = time.time()

    def _submit(self, prompt, ref=None, aspect="3:4", refs=None, lite=False, crop=False):
        """Chon ti le, dinh kem anh, nhap prompt va bam gui (chua doi anh). lite=True: dinh ban NHE cua anh tham chieu (xem lite_ref);
        crop=True: dinh RIENG mot nhan vat cat tu sheet (xem crop_ref; khong cat duoc thi dung ban nhe)."""
        if getattr(self, "_draw_mode", False):                 # tab 'Ve ra' (generate_many(draw=True)): cach gui rieng _submit_draw; cac tab khac (Story...) di tiep code cu ben duoi
            return self._submit_draw(prompt, ref, aspect, refs, lite, crop)
        pg = self.page
        self._f_hook(pg)                                       # nghe phan hoi mang cua Flow: neu bao 'Khong thanh cong' thi doc ra LY DO that
        self._close_popups()
        self.set_aspect(aspect)
        self._clear_ingredients()                              # anh dinh kem con sot tu lan gui truoc (neu Flow giu lai)
        if crop:
            self.log("  thử cắt riêng một nhân vật từ ảnh mẫu (bỏ các hình phụ của sheet)")
        elif lite:
            self.log("  thử ảnh tham chiếu bản nhẹ (JPEG, cạnh dài ≤ %d px)" % LITE_SIDE)
        self._ref_sigs = []
        for r_ in [x for x in ([ref] if ref else []) + list(refs or []) if x]:
            try:                                               # dau van tay anh mau: anh tai len hien o thu vien Flow KHONG duoc nhan nham la anh vua ve
                with Image.open(r_) as ri_:
                    self._ref_sigs.append(ref_thumb(ri_))
            except Exception:
                pass
            if crop:
                r_ = crop_ref(r_) or lite_ref(r_)
            elif lite:
                r_ = lite_ref(r_)
            okat = self.attach(r_)
            for att_ in range(1, ATT_TRIES):                   # that bai: QUEN anh da tai, tai len lai + dinh lai ngay tren tab nay (khong tai lai trang)
                if okat:
                    break
                if ABORT.is_set():
                    raise RuntimeError("Đã dừng")
                self.log("  ⚠ chưa đính được ảnh tham chiếu → tự tải ảnh lên lại và đính lại, lần %d/%d (không tải lại trang)" % (att_ + 1, ATT_TRIES))
                self._heal_ref()
                pg.wait_for_timeout(800 + 700 * att_)
                okat = self.attach(r_)
            if not okat:
                msg = ("Không đính được ảnh tham chiếu (%s) vào Flow nên KHÔNG vẽ (vẽ tiếp sẽ ra nhân vật sai). Đã lưu ảnh chụp + cấu trúc khung soạn vào %s (attach.png, attach.html)."
                       % (os.path.basename(r_), DEBUG))
                if not REF_LAX:
                    raise RefAttachError(msg)
                self.log("  ⚠ " + msg + " (chế độ lỏng: vẫn gửi)")
        self.snapshot()                                        # chup lai SAU khi dinh anh: anh mau vua tai len khong bi nhan nham la anh moi ve
        self._arm_fail()
        if ref or refs:                                        # ghi lai khung soan LUC BAM GUI (co thuc su mang anh mau khong?)
            sg = self._comp_sig()
            self.log("  gửi khung: khung soạn đang có %s ảnh đính kèm" % (sg["thumbs"] if sg else "?"))
        box = self._box()
        if box is None:
            self.dump("no_box"); raise RuntimeError("Mất ô nhập prompt của Flow")
        _click_or_focus(box)
        try:
            box.fill("", timeout=8000)
        except Exception:
            pg.keyboard.press("Control+A"); pg.keyboard.press("Delete")
        try:
            box.fill(prompt, timeout=8000)
        except Exception:
            pg.keyboard.insert_text(prompt)
        time.sleep(0.15)
        sent = False
        try:
            comp = self._composer(box)
            allb = self._buttons(comp)
            by = box.bounding_box()["y"]
            btns = [b for b in allb if b[1] >= by - 6 and not self._RM_PAT.search(b[3] or "")] or allb      # nut gui: cung hang / duoi o nhap (bo nut xoa cua chip anh)
            if btns:
                send = btns[-1][2]                              # nut gui (mui ten) la nut ngoai cung ben phai khung soan
                for _ in range(10):
                    if send.is_enabled():
                        break
                    time.sleep(0.5)
                send.click(timeout=2000); sent = True
        except Exception:
            sent = False
        if not sent:
            _click_or_focus(box, 3000)
            pg.keyboard.press("Enter")
        self._fsent_t = time.time()

    def _meta(self, src):
        """Chu mo ta (alt/title/aria-label) gan anh tren trang Flow, neu co."""
        try:
            return self.page.evaluate("""(src) => { const im = Array.from(document.images).find(i => (i.currentSrc || i.src) === src); if (!im) return '';
                const t = [im.alt, im.title, im.getAttribute('aria-label')]; let e = im;
                for (let k = 0; k < 4 && e.parentElement; k++) { e = e.parentElement; t.push(e.getAttribute('aria-label') || '', e.title || ''); }
                return t.filter(Boolean).join(' | '); }""", src) or ""
        except Exception:
            return ""

    @staticmethod
    def _words(x):
        return {w for w in re.findall(r"\w+", (x or "").lower()) if len(w) > 3}

    def _fit(self, prompt, meta):
        """None = khong kiem chung duoc; so 0..1 = muc trung khop giua chu mo ta cua anh va prompt da gui."""
        mw = self._words(meta)
        if not prompt or len(mw) < 6:
            return None
        return len(self._words(prompt) & mw) / float(len(mw))

    def _is_ref(self, im):
        """True neu anh nay chinh la mot anh mau vua tai len (Flow hien anh tai len ngay trong thu vien du an nhu mot o anh moi)."""
        sigs = getattr(self, "_ref_sigs", None)
        if not sigs:
            return False
        try:
            t = ref_thumb(im)
            return any(ImageStat.Stat(ImageChops.difference(t, s_)).mean[0] <= REF_SAME for s_ in sigs)
        except Exception:
            return False

    def _collect_once(self, prompt=None, strict=False):
        """Mot luot kiem tra: tra ve Image moi dung voi prompt vua gui, hoac None (chua co).
        Nhieu anh moi cung luc (anh tre cua lan truoc) ma khong phan biet duoc -> Ambiguous de gui lai, khong nhan bua."""
        new = [s for s in self._imgs() if s not in self.seen]
        if not new:
            return None
        time.sleep(1.5)                           # cho anh cuoi (khong phai ban mo)
        new = [s for s in self._imgs() if s not in self.seen] or new
        used = getattr(self, "used", None)
        if used is None:
            used = self.used = set()
        cands = []
        for src in new[:6]:
            im = self._download(src)
            hsh = hashlib.md5(im.tobytes()).hexdigest()
            if hsh in used:                       # dung y het anh da giao truoc do -> anh cu, bo qua
                self.seen.add(src); continue
            if self._is_ref(im):                  # o anh mau vua tai len hien o thu vien Flow: khong phai anh vua ve (tranh 'co 2 anh moi cung luc' / nhan nham anh mau thanh khung)
                self.seen.add(src); used.add(hsh)
                continue
            cands.append((src, im, hsh, self._fit(prompt, self._meta(src))))
        if not cands:
            return None
        if len(cands) > 1:                        # hai o la CUNG MOT BUC TRANH (ban mo / ban cuoi dang chuyen, ban ve lai) -> chi giu ban lon nhat; khong tinh la 'nhieu anh'
            try:
                ths = [ref_thumb(c[1]) for c in cands]
                keep = []
                for k_, c in enumerate(cands):
                    dup = next((m_ for m_ in keep if ImageStat.Stat(ImageChops.difference(ths[k_], ths[m_])).mean[0] <= DUP_SAME), None)
                    if dup is None:
                        keep.append(k_)
                    elif c[1].size[0] * c[1].size[1] > cands[dup][1].size[0] * cands[dup][1].size[1]:
                        keep[keep.index(dup)] = k_
                        self.seen.add(cands[dup][0]); used.add(cands[dup][2])
                    else:
                        self.seen.add(c[0]); used.add(c[2])
                if len(keep) < len(cands):
                    self.log("  (%d ô là cùng một bức tranh — chỉ lấy bản lớn nhất)" % (len(cands) - len(keep)))
                cands = [cands[k_] for k_ in sorted(keep)]
            except Exception:
                pass
        known = [c for c in cands if c[3] is not None]
        if known:                                 # co chu mo ta -> chon anh khop prompt nhat, loai anh lech han
            good = [c for c in known if c[3] >= 0.3]
            for c in known:
                if c[3] < 0.3 and c not in good:
                    self.seen.add(c[0]); used.add(c[2])
                    self.log("  bỏ một ảnh không khớp prompt (độ khớp %.0f%%)" % (100 * c[3]))
            if not good:
                return None
            cands = sorted(good, key=lambda c: -c[3])
        elif len(cands) > 1 and strict:           # khong kiem chung duoc + nhieu anh moi = co anh tre cua prompt khac
            for c in cands:
                self.seen.add(c[0]); used.add(c[2])
            raise Ambiguous("có %d ảnh mới cùng lúc, không biết ảnh nào đúng prompt" % len(cands))
        src, im, hsh, _f = cands[0]
        used.add(hsh)
        return im

    FAIL_MSG = "Flow báo «%s» %d lần (không tính phí; đã thử ảnh mẫu gốc, bản nhẹ, lời nhắc ngắn và cắt riêng một nhân vật) — Flow đang từ chối ảnh mẫu/lời nhắc này. Chờ vài phút rồi bấm Tiếp tục, hoặc chọn Gemini ở Máy vẽ (cùng ảnh mẫu đó Gemini vẽ được). Ảnh chụp lúc lỗi: %s"

    def _fail_msg(self, why, n, net=""):
        m = self.FAIL_MSG % (str(why)[:60], n, os.path.join(DEBUG, "flowfail.png"))
        return m + ((" Lý do Flow trả về: %s." % net) if net else "")

    def _stop_msg(self, n, net, lim):
        return ("Flow từ chối liên tiếp %d lần (không tính phí)%s. Lý do Flow trả về: %s. Tạm dừng để khỏi bị Flow khóa thêm: nghỉ 10–15 phút rồi bấm Tiếp tục, "
                "hoặc chọn Gemini ở Máy vẽ. Chi tiết: %s (flowfail_net.txt, flowfail.png)." % (n, " — Flow báo giới hạn / nghi hoạt động bất thường" if lim else "", net or "không đọc được mã lỗi", DEBUG))

    def _generate(self, prompt, ref=None, aspect="3:4", timeout=180, refs=None):
        ff = 0
        for attempt in range(5):
            self._submit(prompt, ref, aspect, refs, lite=(ff >= 1), crop=(ff >= 2))
            t0 = time.time()
            try:
                while time.time() - t0 < timeout:
                    if ABORT.is_set():
                        raise RuntimeError("Đã dừng")
                    time.sleep(1.2)
                    im = self._collect_once(prompt, strict=(attempt == 0))
                    if im is not None:
                        return im
                    why = self._flow_failed()
                    if why:
                        raise FlowFail(why)
            except Ambiguous as e:
                self.log("  %s → gửi lại prompt này" % e)
                self._flush()
                continue
            except FlowFail as e:
                ff += 1
                self.dump("flowfail")
                try:
                    kind_, net_ = self._f_reason(getattr(self, "_fsent_t", 0), save="flowfail")
                except Exception:
                    kind_, net_ = "unknown", ""
                if net_:
                    self.log("  Flow trả lý do: %s" % net_)
                if ff >= 3:
                    raise FlowFail(self._fail_msg(e, ff, net_))
                self.log("  Flow báo «%s» (không bị tính phí) → gửi lại (%d/3)" % (str(e)[:60], ff + 1))
                continue
            self.dump("timeout")
            raise RuntimeError("Flow không trả ảnh trong %ds (hết tín dụng / bị chặn / giao diện đổi?)" % timeout)
        raise RuntimeError("Flow trả nhiều ảnh lẫn nhau, không xác định được ảnh đúng prompt")

    # ---------------------------------------------------------------- ve song song nhieu tab (moi tab 1 du an rieng)
    def _keepalive(self, page):
        """Giu tab 'dang hoat dong' du khong o phia truoc (de Flow khong bi trinh duyet lam cham/dung khi chay nhieu tab)."""
        _keepalive_page(page)

    def _clone(self, k, taken=()):
        """Mo them mot tab Flow, TU TAO DU AN MOI rieng cho tab do (khac cac tab da co). None neu khong lam duoc."""
        np_ = None
        try:
            ctx = self.page.context
            known = set(id(p) for p in ctx.pages)
            cs = self.browser.new_browser_cdp_session()
            cs.send("Target.createTarget", {"url": self.url})
            t0 = time.time()
            while time.time() - t0 < 25 and np_ is None:
                for p in ctx.pages:
                    if id(p) not in known and p is not self.page:
                        np_ = p; break
                if np_ is None:
                    self.page.wait_for_timeout(500)
            if np_ is None:
                return None
            c = Flow.__new__(Flow)
            c.__dict__.update(self.__dict__)
            c.page, c.seen, c.aspect_set, c.dirty = np_, set(), None, False
            c.used = self.used if getattr(self, "used", None) is not None else set()
            self.used = c.used
            self._keepalive(np_)
            _front(np_)
            try:
                np_.wait_for_load_state("domcontentloaded", timeout=30000)
            except Exception:
                pass
            for att in range(4):
                time.sleep(2.5)
                try:
                    url = np_.url or ""
                except Exception:
                    url = ""
                same = ("/project/" in url) and any(url.split("?")[0] == t.split("?")[0] for t in taken if t)
                if "/project/" in url and not same:
                    break                                   # da o trong mot du an rieng
                if same or att >= 1:
                    try:                                    # Flow tu mo lai du an cu -> ve trang chu roi tao du an moi
                        np_.goto(self.url, wait_until="domcontentloaded", timeout=45000); time.sleep(3)
                    except Exception:
                        pass
                    c._open_project(); time.sleep(3)
            c._wait_ready(120)
            url = np_.url or ""
            if any(url.split("?")[0] == t.split("?")[0] for t in taken if t):
                raise RuntimeError("tab mới vào trùng dự án với tab khác")
            c.ready = True                              # da vao du an rieng + co o nhap: lan sau KHONG kiem tra/tai lai nua
            return c
        except Exception as e:
            self.log("  không mở được tab Flow thứ %d: %s" % (k + 1, str(e)[:100]))
            try:
                if np_ is not None:
                    np_.close()                          # khong de tab thua / tab trang chu
            except Exception:
                pass
            return None

    def prepare_tabs(self, n):
        """Mo LAN LUOT du n tab, moi tab vao du an rieng, kiem tra xong het roi moi tra danh sach tab dung duoc."""
        wt = getattr(self, "wtabs", None)
        if wt is None:
            wt = self.wtabs = []
        for w in list(wt):
            try:
                if w.page.is_closed():
                    wt.remove(w)
            except Exception:
                wt.remove(w)
        self._keepalive(self.page)
        if not (getattr(self, "ready", False) and not getattr(self, "on_gemini", False) and self.alive()):
            if self._box() is None:
                self._wake(self.page); self._wait_ready(90)
            self.ready = True
        workers, taken = [self], [self.page.url]
        for k in range(1, n):
            w = None
            for cand in list(wt):
                try:
                    if cand not in workers and cand.page.url.split("?")[0] not in [t.split("?")[0] for t in taken] and (getattr(cand, "ready", False) or cand._box() is not None):
                        cand.ready = True
                        w = cand; break
                except Exception:
                    pass
            if w is None:
                self.log("  Đang mở tab Flow %d/%d và tạo dự án riêng…" % (k + 1, n))
                for att in range(2):
                    w = self._clone(k, taken)
                    if w is not None:
                        wt.append(w); break
            if w is None:
                self.log("  ⚠ Tab Flow %d không dùng được, bỏ qua." % (k + 1))
                continue
            self._keepalive(w.page)
            workers.append(w); taken.append(w.page.url)
        self.log("  Đã sẵn sàng %d/%d tab Flow: %s" % (len(workers), n, ", ".join("…" + (w.page.url or "")[-6:] for w in workers)))
        _front(self.page)
        if HIDE[0]:
            self.hide()          # tao tab moi co the lam cua so nhay len -> thu nho lai
        return workers

    def generate_many(self, jobs, n=2, timeout=180, on_done=None, more=None, draw=False):
        """jobs: list dict(prompt, refs, aspect). Ve song song tren n tab Flow, moi tab mot du an rieng nen anh khong bi lan nhau.
        Tra ve list (Image | Exception) theo thu tu jobs. draw=True: TAB 'VE RA' (cach gui rieng _submit_draw); False: cac tab khac (Story...) giu nguyen cach cu."""
        if not draw:
            return self._generate_many(jobs, n, timeout, on_done, more, False)
        self._draw_mode = True
        try:
            return self._generate_many(jobs, n, timeout, on_done, more, True)
        finally:
            self._draw_mode = False
            for w_ in [self] + list(getattr(self, "wtabs", None) or []) + list(getattr(self, "_dw", None) or []):
                try:
                    w_._draw_mode = False
                    w_._idle_hook = None
                except Exception:
                    pass

    def _generate_many(self, jobs, n, timeout, on_done, more, draw):
        want = min(n, len(jobs))
        workers = [self]
        if want > 1:
            for rnd in range(3):                       # chon N tab thi phai mo DU N tab (vao du an) moi ve; thieu thi mo bu toi 3 vong
                workers = self.prepare_tabs(want)
                if len(workers) >= want:
                    break
                self.log("  mới có %d/%d tab Flow, mở bù thêm…" % (len(workers), want))
                time.sleep(2)
        for w_ in workers:
            w_._draw_mode = bool(draw)
            if draw:                                            # MOI LAN CHAY: xoa nho 'anh mau da tai len' -> khung dau cua MOI tab luon '+' -> Tai noi dung truoc
                try:
                    (w_.__dict__.get("_d_up") or {}).clear()
                except Exception:
                    pass
        self._dw = list(workers)
        results = [None] * len(jobs)
        pending = list(range(len(jobs)))
        tries = [0] * len(jobs)
        fails = {id(w): 0 for w in workers}
        dead = set()
        active = {}
        beat = time.time()

        refbad = [0]
        ambn = {}                                               # khung -> so lan bi 'nhieu anh moi, khong biet anh nao' (ve lai tu dong, toi da 6)
        subs = {}                                               # giay tu luc bat dau gui den luc bam gui xong cua tung khung (de biet thoi gian di dau)
        ffn = [0] * len(jobs)                                   # so lan Flow bao 'Khong thanh cong' cua tung khung
        vs = {}                                                 # khung -> chi so cach ve dang dung (trong ladder)
        lads = {}
        sent_p = {}                                             # khung -> loi nhac DA gui (de doi chieu anh tra ve)
        streak = [0]                                            # so lan 'Khong thanh cong' lien tiep, ca dot (ra anh la ve 0)
        cool = [0.0]                                            # chua gui them truoc thoi diem nay
        shots = [0]
        lim = [0]                                               # so lan Flow bao han muc / reCAPTCHA lien tiep (ra anh la ve 0)
        gap = [max(FLOW_GAP, min(FLOW_GAP_MAX, _FGAP.get("gap", FLOW_GAP)))] if FLOW_GAP > 0 else [0.0]      # gian cach hien tai giua 2 lan gui
        nxt = [0.0]                                             # chua gui truoc thoi diem nay
        conc = [len(workers)]                                   # so tab duoc ve CUNG LUC: Flow loi khi dang ve song song thi giam 1, ra anh 3 lan lien thi tang lai
        okrun = [0]
        sentn = {id(w_): 0 for w_ in workers}                   # so khung da gui cua tung tab (chia deu viec giua cac tab)
        nets = [""]                                             # ly do (ma loi) Flow tra ve gan nhat

        def lad_of(j):
            if j not in lads:
                lads[j] = ladder(jobs[j])
            return lads[j]

        def start_v(j):
            L = lad_of(j)
            k = _VSTART.get(ref_key(jobs[j]))
            return L.index(k) if k in L else 0

        def bad(j, e, w):
            """Tab loi: danh dau cho on dinh lai; viec do duoc giao cho tab khac (toi da 3 lan), khong hoi nguoi dung."""
            if isinstance(e, FlowFail):                           # Flow tu bao 'Khong thanh cong': khong phai loi tab. Doc LY DO that cua Flow roi moi quyet dinh gui lai kieu gi
                streak[0] += 1; okrun[0] = 0
                if active and conc[0] > 1:                          # Flow loi luc cac tab khac van dang ve -> giam so tab ve cung luc
                    conc[0] -= 1
                    self.log("  Flow lỗi khi đang vẽ song song → tạm chỉ vẽ %d tab cùng lúc (ổn lại sẽ tăng dần)" % conc[0])
                if gap[0] > 0:
                    gap[0] = min(FLOW_GAP_MAX, max(gap[0], FLOW_GAP) * 1.6); _FGAP["gap"] = gap[0]
                try:
                    kind, net = w._f_reason(getattr(w, "_fsent_t", 0), save=("flowfail" if shots[0] == 0 else None))
                except Exception:
                    kind, net = "unknown", ""
                if net:
                    nets[0] = net
                if kind == "limit":
                    lim[0] += 1
                else:
                    ffn[j] += 1                                   # han muc khong tinh vao so lan thu cua khung (doi cach ve khong giup)
                L = lad_of(j); cur = vs.get(j, 0); vname = L[min(cur, len(L) - 1)]
                if _VSTART.get(ref_key(jobs[j])) == vname:        # cach da hoc khong con ra anh -> bo, thu lai tu dau
                    _VSTART.pop(ref_key(jobs[j]), None)
                self.log("  Flow báo «%s» (không bị tính phí) ở khung %d khi dùng «%s» (lời nhắc %d ký tự)%s" % (
                    str(e)[:50], j + 1, VNAME.get(vname, vname), len(sent_p.get(j) or jobs[j]["prompt"]), (" — lý do Flow: " + net) if net else ""))
                if shots[0] < 3:                                  # ghi lai man hinh Flow luc loi de xem Flow noi gi
                    shots[0] += 1
                    try:
                        w.dump("flowfail" if shots[0] == 1 else "flowfail%d" % shots[0])
                    except Exception:
                        pass
                if streak[0] >= FAIL_STOP or lim[0] >= LIMIT_STOP:   # Flow tu choi het lan nay den lan khac: dung ca dot (khong dot them, khong bi khoa them)
                    msg = FlowFail(self._stop_msg(streak[0], nets[0], lim[0] > 0))
                    self.log("  ⚠ " + str(msg)[:300])
                    results[j] = msg
                    for k_ in list(pending):
                        results[k_] = msg
                    pending.clear()
                    return
                if kind == "limit":
                    cd = min(LIMIT_COOL_MAX, LIMIT_COOL * (2 ** (lim[0] - 1)))
                    cool[0] = max(cool[0], time.time() + cd)
                    self.log("  → Flow đang giới hạn / nghi hoạt động bất thường: nghỉ %ds rồi gửi lại khung %d (đổi ảnh mẫu không giúp được; gửi từng khung một)" % (round(cd), j + 1))
                    pending.insert(0, j)
                elif ffn[j] < max(3, len(L)):
                    vs[j] = min(cur + 1, len(L) - 1)
                    cd = min(FAIL_COOL_MAX, FAIL_COOL * (2 ** max(0, streak[0] - 2))) if streak[0] >= 2 else 0
                    cool[0] = max(cool[0], time.time() + cd)
                    self.log("  → gửi lại khung %d bằng cách «%s» (%d/%d)%s" % (j + 1, VNAME.get(L[vs[j]], L[vs[j]]), ffn[j] + 1, max(3, len(L)),
                                                                   ("; nghỉ %ds rồi gửi từng khung một" % round(cd)) if streak[0] >= 2 else ""))
                    pending.insert(0, j)
                else:
                    results[j] = FlowFail(self._fail_msg(e, ffn[j], nets[0]))
                return
            if draw and isinstance(e, PromptNotEntered):          # tab 'Ve ra': Flow khong nhan chu -> CHUA gui gi; gui lai khung nay (khong danh dau tab loi, khong tai lai trang)
                tries[j] += 1
                if tries[j] < 4:
                    self.log("  Flow chưa nhận prompt → thử gửi lại khung %d (%d/3)" % (j + 1, tries[j])); pending.insert(0, j)
                else:
                    results[j] = e
                return
            if isinstance(e, RefAttachError):                     # khong dinh duoc anh tham chieu: khong phai loi cua tab; TU tai anh len lai + gui lai khung nay (khong tai lai trang); loi lien tiep nhieu luot = loi he thong -> moi dung han
                refbad[0] += 1; tries[j] += 1
                try:
                    w._heal_ref()                                 # tab nay: dong hop chon, quen anh da tai -> luot sau tai len lai tu dau
                except Exception:
                    pass
                nxt[0] = max(nxt[0], time.time() + 2.5)
                if refbad[0] >= REF_STOP:
                    self.log("  ⚠ Đính ảnh tham chiếu lỗi liên tiếp %d lượt (đã tự tải lên lại nhiều lần) → dừng gửi tiếp để khỏi vẽ sai nhân vật" % refbad[0])
                    results[j] = e
                    for k_ in list(pending):
                        results[k_] = e
                    pending.clear()
                elif tries[j] < REF_TRIES:
                    self.log("  đính ảnh tham chiếu lỗi → tự tải ảnh lên lại rồi gửi lại khung %d (lượt %d/%d)" % (j + 1, tries[j] + 1, REF_TRIES)); pending.insert(0, j)
                else:
                    results[j] = e
                return
            if isinstance(e, Ambiguous):                          # 2 anh moi, khong biet anh nao: KHONG phai loi tab -> ve lai khung nay (tab nay cho anh tre ve het roi moi gui tiep)
                ambn[j] = ambn.get(j, 0) + 1
                w.dirty = True
                if ambn[j] <= 6:
                    self.log("  Khung %d: %s → vẽ lại khung này (lần %d/6)" % (j + 1, e, ambn[j])); pending.insert(0, j)
                else:
                    results[j] = e
                return
            w.dirty = True
            fails[id(w)] += 1
            tries[j] += 1
            if fails[id(w)] >= 3 and len(dead) + 1 < len(workers):
                dead.add(id(w)); self.log("  bỏ một tab Flow bị lỗi liên tục: " + str(e)[:80])
            if tries[j] < 3 and len(dead) < len(workers):
                self.log("  khung gửi lỗi (%s) → thử lại trên tab khác" % str(e)[:70]); pending.insert(0, j)
            else:
                results[j] = e if isinstance(e, Exception) else RuntimeError(str(e))

        def collect_active():
            """Nhan anh cac tab da ve xong NGAY (goi giua cac lan gui + moi nhip), de tab xong khong phai cho tab khac gui xong moi duoc thu ve."""
            for key, (w, j, t0) in list(active.items()):
                try:
                    im = w._collect_once(sent_p.get(j) or jobs[j]["prompt"], strict=(tries[j] == 0 and ffn[j] == 0))
                except Ambiguous as e:
                    del active[key]; w.dirty = True; bad(j, e, w); fails[id(w)] = 0; continue
                except Exception as e:
                    del active[key]; bad(j, e, w); continue
                if im is not None:
                    results[j] = im; fails[id(w)] = 0; del active[key]
                    streak[0] = 0; lim[0] = 0; okrun[0] += 1
                    if okrun[0] >= 3 and conc[0] < len(workers):
                        conc[0] += 1; okrun[0] = 0
                        self.log("  Flow ổn → vẽ %d tab cùng lúc" % conc[0])
                    if gap[0] > FLOW_GAP:
                        gap[0] = max(FLOW_GAP, gap[0] * 0.85); _FGAP["gap"] = gap[0]
                    self.log("  khung %d xong: đính ảnh + gửi %.0fs, Flow vẽ %.0fs" % (j + 1, subs.get(j, 0), time.time() - t0))
                    try:                                           # nho cach ra anh: cac khung sau bat dau tu cach nay
                        L_ = lad_of(j); vn_ = L_[min(vs.get(j, 0), len(L_) - 1)]; k_ = ref_key(jobs[j])
                        if vn_ == "full":
                            _VSTART.pop(k_, None)
                        elif _VSTART.get(k_) != vn_:
                            _VSTART[k_] = vn_
                            self.log("  ✔ Flow chỉ vẽ được khi dùng «%s» → các khung sau dùng luôn cách này" % VNAME.get(vn_, vn_))
                    except Exception:
                        pass
                    if on_done is not None:                    # luu + bao ve tool NGAY khi tung anh xong (khong cho ca dot)
                        try:
                            on_done(j, im)
                        except Exception as e_cb:
                            self.log("  (lưu ảnh ngay lỗi: %s)" % str(e_cb)[:80])
                else:
                    why = w._flow_failed()
                    if why:
                        del active[key]; bad(j, FlowFail(why), w)
                    elif time.time() - t0 > timeout:
                        del active[key]; bad(j, RuntimeError("Flow không trả ảnh trong %ds" % timeout), w)

        if draw:                                                # tab dang cho (tai len / gui) thi van nhan anh cac tab khac da ve xong
            for w_ in workers:
                w_._idle_hook = collect_active
        while True:
            if more is not None:                                  # khung nguoi dung vua bam "Ve lai ngay" -> them vao hang doi dang chay
                try:
                    for jb in (more() or []):
                        jobs.append(jb); results.append(None); tries.append(0); ffn.append(0); pending.append(len(jobs) - 1)
                except Exception as e_m:
                    self.log("  (thêm khung vẽ lại lỗi: %s)" % str(e_m)[:80])
            if not (pending or active):
                break
            if ABORT.is_set():
                raise RuntimeError("Đã dừng")
            for w in sorted(workers, key=lambda w_: sentn.get(id(w_), 0)):          # tab da gui it nhat duoc nhan viec truoc -> cac tab chay deu nhau
                if id(w) in active or id(w) in dead or not pending:
                    continue
                if time.time() < max(cool[0], nxt[0]) or len(active) >= conc[0]:
                    break                                          # Flow dang tu choi lien tiep: nghi mot luc, roi gui TUNG khung mot (khong don dap)
                collect_active()                                   # tab khac ve xong trong luc minh gui: thu ve truoc, roi moi gui tiep
                if not pending:
                    break
                j = pending.pop(0)
                try:
                    if j not in vs:
                        vs[j] = start_v(j)
                    L_ = lad_of(j); v_ = L_[min(vs[j], len(L_) - 1)]
                    sent_p[j] = variant_prompt(jobs[j], v_)
                    if not w._wake(w.page):
                        self.log("  (tab %d chưa 'chạy' được, vẫn thử gửi)" % (workers.index(w) + 1))
                    if getattr(w, "dirty", False):
                        w._flush(); w.dirty = False
                    if draw and w._box() is None:              # tab 'Ve ra': o nhap co the chi bi che tam thoi -> doi toi 5 giay truoc khi coi la mat du an
                        _tb = time.time()
                        while w._box() is None and time.time() - _tb < 5.0:
                            time.sleep(0.5)
                    if w._box() is None:                       # tab dang o trang chu / mat du an -> tu vao du an moi
                        w._wait_ready(90)
                    w._wait_idle(75)                           # khung truoc cua tab nay con dang ve thi cho
                    _ts = time.time()
                    w._submit(sent_p[j], None, jobs[j].get("aspect", "16:9"), jobs[j].get("refs"), lite=(v_ != "full"), crop=(v_ == "crop"))
                    subs[j] = time.time() - _ts
                    self.log("  tab %d/%d: đính ảnh + nhập prompt + bấm gửi mất %.0fs" % (workers.index(w) + 1, len(workers), subs[j])) if subs[j] > 12 else None
                    refbad[0] = 0
                    active[id(w)] = (w, j, time.time()); sentn[id(w)] = sentn.get(id(w), 0) + 1
                    if gap[0] > 0:
                        import random
                        nxt[0] = time.time() + gap[0] * random.uniform(0.85, 1.3)          # gui cach nhau: Flow khong chiu gui lien tuc
                    self.log("  tab %d/%d đã gửi khung %d (đang vẽ %d tab)" % (workers.index(w) + 1, len(workers), j + 1, len(active)))
                except Exception as e:
                    bad(j, e, w)
            if len(dead) >= len(workers) and pending:
                for j in pending:
                    results[j] = RuntimeError("Không còn tab Flow nào dùng được")
                pending = []
            time.sleep(0.6)
            if (active or (pending and time.time() < max(cool[0], nxt[0]))) and time.time() - beat >= 25:               # nhip bao: de thay dang chay chu khong phai dung
                beat = time.time()
                wt_ = max(0, int(max(cool[0], nxt[0]) - time.time()))
                self.log("  …đang chờ Flow vẽ %d khung (xong %d/%d, còn chờ gửi %d%s)" % (len(active), sum(1 for r_ in results if r_ is not None), len(jobs), len(pending),
                                                                                    (", gửi khung kế sau %ds — gửi dồn dập Flow sẽ báo lỗi" % wt_) if (pending and wt_) else ""))
            collect_active()
        return results

    def _download(self, src):
        b64 = self.page.evaluate("""async (src) => { const r = await fetch(src); const b = await r.blob();
            return await new Promise(res => { const f = new FileReader(); f.onload = () => res(f.result.split(',')[1]); f.readAsDataURL(b); }); }""", src)
        return Image.open(io.BytesIO(base64.b64decode(b64))).convert("RGB")

    # ------------------------------------------------------------ Gemini (tab rieng, co the nhieu tab song song)
    G_SELS = ["rich-textarea div.ql-editor", "div.ql-editor[contenteditable='true']", "div[role='textbox'][contenteditable='true']", "[contenteditable='true']", "textarea"]
    G_RESP = "message-content, .model-response-text, .markdown"

    def _g_find_box(self, g):
        for s in self.G_SELS:
            try:
                loc = g.locator(s)
                for i in range(min(loc.count(), 4)):
                    if loc.nth(i).is_visible():
                        return loc.nth(i)
            except Exception:
                pass
        return None

    def _g_dismiss(self, g):
        pat = r"^(không, cảm ơn|no thanks|got it|đã hiểu|tiếp tục|continue|dismiss|đóng|close|bỏ qua|skip|đồng ý|i agree|accept all|chấp nhận tất cả)$"
        try:
            loc = g.get_by_role("button", name=re.compile(pat, re.I))
            for i in range(min(loc.count(), 3)):
                if loc.nth(i).is_visible():
                    loc.nth(i).click(timeout=1500); time.sleep(0.8)
        except Exception:
            pass

    G_URL = "https://gemini.google.com/app"
    G_HOSTS = ("gemini.google.com",)
    G_NEWCHAT = re.compile(r"(cuộc trò chuyện mới|trò chuyện mới|new chat)", re.I)

    def _g_new_chat(self, g):
        """Bam 'Cuoc tro chuyen moi' NGAY TRONG trang (khong tai lai trang -> nhanh hon nhieu, van la chat moi nen khong lan ngu canh khung truoc).
        True = da co chat moi (khong con loi nhac cu) va o nhap hien."""
        try:
            u = g.url or ""
        except Exception:
            return False
        if not any(h in u for h in self.G_HOSTS) or "accounts.google" in u or self._g_find_box(g) is None:
            return False
        btn = None
        for role in ("link", "button"):
            loc = g.get_by_role(role, name=self.G_NEWCHAT)
            for i in range(min(loc.count(), 4)):
                if loc.nth(i).is_visible():
                    btn = loc.nth(i); break
            if btn is not None:
                break
        if btn is None:
            return False
        btn.click(timeout=3000)
        t0 = time.time()
        while time.time() - t0 < 8:
            if ABORT.is_set():
                raise RuntimeError("Đã dừng")
            try:
                n_old = int(g.evaluate("() => document.querySelectorAll('user-query').length") or 0)
            except Exception:
                n_old = 1
            if n_old == 0 and self._g_find_box(g) is not None:
                return True
            g.wait_for_timeout(300)
        return False

    def _g_prepare(self, g, wait=240):
        """Mo cuoc tro chuyen moi tren tab g va cho o nhap. Uu tien nut 'Cuoc tro chuyen moi' trong trang (khong tai lai); khong duoc thi tai lai trang."""
        try:
            if self._g_new_chat(g):
                box = self._g_find_box(g)
                if box is not None:
                    return box
        except Exception as e:
            if str(e) == "Đã dừng":
                raise
            self.log("  (Gemini: không bấm được «Cuộc trò chuyện mới» → tải lại trang: %s)" % str(e)[:60])
        try:
            g.goto(self.G_URL, wait_until="domcontentloaded", timeout=60000)
        except Exception as e:
            self.log("  tải trang Gemini chậm/lỗi: %s" % str(e)[:100])
        time.sleep(2)
        box, t0, n_it = None, time.time(), 0
        while time.time() - t0 < wait:
            if ABORT.is_set():
                raise RuntimeError("Đã dừng")
            box = self._g_find_box(g)
            if box is not None:
                return box
            n_it += 1
            if n_it % 3 == 0:
                self._g_dismiss(g)
            try:
                u = g.url
            except Exception:
                u = ""
            if "accounts.google" in u or "signin" in u or "ServiceLogin" in u:
                self.log("Hãy đăng nhập Gemini (tài khoản Google/Ultra của bạn) trong tab vừa mở… (đang chờ)")
            elif n_it % 8 == 0:
                try:
                    self.log("  đang chờ Gemini sẵn sàng… (%s | %s)" % (u[:60], g.title()[:40]))
                except Exception:
                    pass
            time.sleep(2)
        self._dump_page(g, "gemini_nobox")
        try:
            info = "%s | %s" % (g.url[:80], g.title()[:50])
        except Exception:
            info = ""
        raise RuntimeError("Không thấy ô nhập của Gemini (đã đăng nhập chưa?) " + info)

    def _g_send(self, g, box, text):
        """Dan + gui cau hoi; tra ve so khung tra loi truoc khi gui."""
        before = g.locator(self.G_RESP).count()
        self.__dict__.setdefault("_gsend_t", {})[id(g)] = time.time()
        _click_or_focus(box); time.sleep(0.3)
        try:
            g.keyboard.insert_text(text)
        except Exception:
            box.fill(text, timeout=8000)
        time.sleep(1.2)
        sent = False
        try:
            loc = g.get_by_role("button", name=re.compile(r"(gửi|send)", re.I))
            for i in range(min(loc.count(), 4)):
                if loc.nth(i).is_visible() and loc.nth(i).is_enabled():
                    loc.nth(i).click(timeout=3000); sent = True; break
        except Exception:
            pass
        if not sent:
            g.keyboard.press("Enter")
        return before

    def _g_poll(self, g, st):
        """Mot luot kiem tra; st = dict(before,last,stable). Tra ve van ban khi da on dinh, nguoc lai None."""
        try:
            n = g.locator(self.G_RESP).count()
            cur = g.evaluate("""(sel) => { const e = document.querySelectorAll(sel); return e.length ? e[e.length-1].innerText : ''; }""", self.G_RESP) if n > st["before"] else ""
            busy = g.get_by_role("button", name=re.compile(r"(dừng|stop)", re.I)).count() > 0
        except Exception:
            cur, busy = "", True
        if cur and cur == st["last"] and not busy:
            st["stable"] += 1
            if st["stable"] >= 3:
                return cur
        else:
            st["stable"] = 0
        st["last"] = cur
        return None

    def gemini(self, text, timeout=300):
        """Hoi Gemini (1 cau) bang tai khoan dang dang nhap trong trinh duyet."""
        r = self.gemini_multi([text], 1, timeout)[0]
        if isinstance(r, Exception):
            raise r
        return r

    def gemini_multi(self, texts, n=3, timeout=300):
        """Gui nhieu cau hoi CUNG LUC qua nhieu tab Gemini rieng (moi tab 1 cuoc tro chuyen), tra ve danh sach ket qua (chuoi hoac Exception)."""
        n = max(1, min(int(n or 1), 6, len(texts)))
        tabs = []
        for k in range(n):
            t = self._gemini_tab(k)
            if t is None:
                break
            tabs.append(t)
        results = [None] * len(texts)
        if not tabs:                      # khong mo duoc tab rieng -> dung tam tab Flow (tuan tu), se quay lai Flow sau
            g = self.page
            if not getattr(self, "on_gemini", False):
                try:
                    if "gemini.google.com" not in g.url:
                        self.flow_url = g.url
                except Exception:
                    pass
            self.on_gemini = True
            tabs = [g]
        for st in range(0, len(texts), len(tabs)):
            batch = list(range(st, min(st + len(tabs), len(texts))))
            jobs = {}
            for k, idx in enumerate(batch):
                g = tabs[k]
                try:
                    self._wake(g)
                    box = self._g_prepare(g)
                    self._wake(g)                               # sau khi tai trang: tab phai 'chay' moi nhap/gui duoc
                    jobs[idx] = dict(g=g, before=self._g_send(g, box, texts[idx]), last="", stable=0)
                    self.log("  Gemini tab %d/%d đã gửi câu %d" % (k + 1, len(tabs), idx + 1))
                except Exception as e:
                    if str(e) == "Đã dừng":
                        raise
                    results[idx] = e
            t0 = time.time()
            while jobs and time.time() - t0 < timeout:
                if ABORT.is_set():
                    raise RuntimeError("Đã dừng")
                time.sleep(1.5)
                for idx, j in list(jobs.items()):
                    r = self._g_poll(j["g"], j)
                    if r is not None and r.strip():
                        results[idx] = r; del jobs[idx]
            for idx, j in jobs.items():
                self._dump_page(j["g"], "gemini_empty_%d" % idx)
                results[idx] = RuntimeError("Gemini không trả lời (hết thời gian %ds)" % timeout)
        return results

    # ------------------------------------------------------------ Gemini: VE ANH (hoac hoi kem anh) bang TAB Gemini cua trinh duyet — khong dung API
    G_PLUS = re.compile(r"(tải tệp|tải lên|tải file|upload|thêm tệp|add file|attach|đính kèm|mở trình đơn tải|open upload|thêm ảnh|add image)", re.I)
    G_UPLOAD_ITEM = re.compile(r"(tải tệp lên|tải ảnh lên|tải lên từ máy|upload (files?|photos?|images?)|from (your )?computer|từ máy tính)", re.I)
    # anh cua NGUOI DUNG (tin nhan da gui + o soan) khong phai anh Gemini ve. KHONG loai theo chu 'attachment': Gemini dat chinh anh vua ve trong khung co ten do -> truoc day bi bo sot, khong tra anh ve.
    G_BAD_ANC = ("user-query, [class*='user-query'], user-query-file-carousel, user-query-file-preview, uploader-file-preview, [class*='file-preview'], [class*='file-carousel'], "
                 "[class*='uploader'], input-area-v2, rich-textarea, [class*='input-area']")
    G_JS_IMGS = """(a) => { const seen = new Set(a.seen);
        const bad = e => e.closest(a.bad);
        const big = i => { const r = i.getBoundingClientRect(); return r.width >= 240 && r.height >= 120; };          // anh dang hien to (anh nho 40-110 px la anh dinh kem / bieu tuong)
        const els = Array.from(document.images).filter(i => i.complete && i.naturalWidth >= 400 && i.naturalHeight >= 250 && big(i) && !bad(i) && (i.currentSrc || i.src) && !seen.has(i.currentSrc || i.src));
        const imgs = els.map(i => i.currentSrc || i.src);
        const items = els.map(i => ({src: i.currentSrc || i.src, w: i.naturalWidth, h: i.naturalHeight}));
        const rs = document.querySelectorAll(a.resp);
        return {imgs: imgs, items: items, text: rs.length ? rs[rs.length - 1].innerText : '', n: rs.length}; }"""
    # QUET KHONG LOC THEO TEN LOP/THE: moi anh DANG HIEN TO (>=240x120) + du lon (>=400x250 diem anh), ke ca trong shadow DOM va iframe cung goc, anh nen CSS. Anh dinh kem cua nguoi dung chi ~110 px nen tu bi loai boi kich thuoc.
    G_JS_ANY = """(a) => { const seen = new Set(a.seen); const out = [];
        const vis = e => { const r = e.getBoundingClientRect(); if (r.width < 240 || r.height < 120 || r.bottom <= 0 || r.right <= 0) return null;
            const cs = getComputedStyle(e); if (cs.visibility === 'hidden' || cs.display === 'none' || parseFloat(cs.opacity) === 0) return null; return r; };
        const walk = (root, dy) => {
            for (const e of root.querySelectorAll('img')) { const r = vis(e); if (!r || !e.complete || e.naturalWidth < 400 || e.naturalHeight < 250) continue;
                const s = e.currentSrc || e.src; if (!s || seen.has(s)) continue; out.push({src: s, w: e.naturalWidth, h: e.naturalHeight, tag: 'IMG', y: r.top + dy}); }
            for (const e of root.querySelectorAll('*')) {
                if (e.shadowRoot) walk(e.shadowRoot, dy);
                if (e.tagName === 'IFRAME') { try { if (e.contentDocument) walk(e.contentDocument, dy + e.getBoundingClientRect().top); } catch (x) {} }
                const bg = getComputedStyle(e).backgroundImage; if (bg && bg.indexOf('url(') >= 0) { const r = vis(e); const m = /url\\(["']?([^"')]+)/.exec(bg);
                    if (r && m && !seen.has(m[1]) && /^(https?:|blob:)/.test(m[1])) out.push({src: m[1], w: Math.round(r.width), h: Math.round(r.height), tag: 'BG', y: r.top + dy}); }
            } };
        walk(document, 0);
        out.sort((x, y) => x.y - y.y); return out; }"""
    # DU PHONG: bo loc tren bo sot (Gemini doi ten khung / dung <canvas>): lay phan tu anh/canvas/video LON nam SAU tin nhan nguoi dung cuoi cung
    G_USERQ = "user-query, [class*='user-query']"
    G_FB_AFTER = 20          # giay sau khi gui moi dung den cach du phong
    G_ANY_AFTER = 8          # giay sau khi gui, chua co anh theo bo loc ten lop -> quet khong loc
    G_DIAG_AFTER = 15        # giay sau khi gui, chua nhan anh -> ghi chan doan vao nhat ky
    G_JS_FALLBACK = """(a) => { const seen = new Set(a.seen);
        const qs = Array.from(document.querySelectorAll(a.q)); const lastq = qs.length ? qs[qs.length - 1] : null;
        document.querySelectorAll('[data-as-shot]').forEach(e => e.removeAttribute('data-as-shot'));
        const out = [];
        for (const e of document.querySelectorAll('img,canvas,video')) {
            const r = e.getBoundingClientRect(); if (r.width < 220 || r.height < 110) continue;
            if (lastq && (lastq.contains(e) || !(lastq.compareDocumentPosition(e) & Node.DOCUMENT_POSITION_FOLLOWING))) continue;
            if (e.closest('rich-textarea, input-area-v2, header, nav, side-navigation')) continue;          // chi loai theo THE (ten lop kieu 'sidenav' co the bao ca vung noi dung chinh cua Gemini)
            if (e.tagName === 'IMG' && !(e.complete && e.naturalWidth >= 200)) continue;
            const src = e.tagName === 'IMG' ? (e.currentSrc || e.src) : ''; if (src && seen.has(src)) continue;
            out.push({e: e, src: src, tag: e.tagName, w: Math.round(r.width), h: Math.round(r.height)});
        }
        if (!out.length) return {n: 0};
        out.sort((x, y) => y.w * y.h - x.w * x.h); const b = out[0]; b.e.setAttribute('data-as-shot', '1');
        return {n: out.length, src: b.src, tag: b.tag, w: b.w, h: b.h}; }"""
    G_JS_MARK = """(src) => { document.querySelectorAll('[data-as-shot]').forEach(e => e.removeAttribute('data-as-shot'));
        const i = Array.from(document.images).find(x => (x.currentSrc || x.src) === src); if (!i) return false; i.setAttribute('data-as-shot', '1'); return true; }"""
    G_JS_ATT = """() => Array.from(document.images).filter(i => { const r = i.getBoundingClientRect();
        return r.width > 8 && r.height > 8 && (r.top > innerHeight * 0.45 || i.closest("uploader-file-preview, [class*='file-preview'], [class*='attachment'], input-area-v2, rich-textarea, [class*='input-area']")); }).length"""
    G_JS_PASTE = """(arr) => { const box = document.querySelector("rich-textarea div.ql-editor, div.ql-editor[contenteditable='true'], div[role='textbox'][contenteditable='true'], [contenteditable='true']");
        if (!box) return false; box.focus(); const dt = new DataTransfer();
        for (const a of arr) { const bin = atob(a.b64); const u8 = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) u8[i] = bin.charCodeAt(i); dt.items.add(new File([u8], a.name, {type: a.type})); }
        box.dispatchEvent(new ClipboardEvent('paste', {clipboardData: dt, bubbles: true, cancelable: true})); return true; }"""

    def _g_att_count(self, g):
        try:
            return int(g.evaluate(self.G_JS_ATT) or 0)
        except Exception:
            return 0

    def _g_attach(self, g, files):
        """Dinh kem anh vao cuoc tro chuyen Gemini (cac anh theo thu tu). Thu lan luot: o input[type=file] -> nut '+' / 'Tai tep len' (hop chon file) -> dan (paste) anh.
        Tra ve True khi thay anh hien o khung soan. Khong thay -> False (tool van gui nhung se canh bao)."""
        files = [f for f in (files or []) if f and os.path.isfile(f)]
        if not files:
            return True
        n0 = self._g_att_count(g)

        def seen_att():
            for _ in range(12):
                time.sleep(0.7)
                if self._g_att_count(g) - n0 >= 1:
                    time.sleep(1.0)
                    return True
            return False
        try:                                                   # 1) o file co san
            inp = g.locator("input[type='file']")
            if inp.count():
                inp.first.set_input_files(files)
                if seen_att():
                    return True
        except Exception as e:
            self.log("  (đính ảnh Gemini cách 1 lỗi: %s)" % str(e)[:70])
        try:                                                   # 2) nut '+' -> Tai tep len
            btn = None
            loc = g.get_by_role("button", name=self.G_PLUS)
            for i in range(min(loc.count(), 6)):
                if loc.nth(i).is_visible():
                    btn = loc.nth(i); break
            if btn is not None:
                btn.click(timeout=3000); time.sleep(0.7)
                item = None
                for role in ("menuitem", "button", "option"):
                    li = g.get_by_role(role, name=self.G_UPLOAD_ITEM)
                    for i in range(min(li.count(), 4)):
                        if li.nth(i).is_visible():
                            item = li.nth(i); break
                    if item is not None:
                        break
                if item is not None:
                    with g.expect_file_chooser(timeout=6000) as fc:
                        item.click(timeout=3000)
                    fc.value.set_files(files)
                else:
                    inp = g.locator("input[type='file']")
                    if inp.count():
                        inp.first.set_input_files(files)
                if seen_att():
                    return True
                try:
                    g.keyboard.press("Escape")
                except Exception:
                    pass
        except Exception as e:
            self.log("  (đính ảnh Gemini cách 2 lỗi: %s)" % str(e)[:70])
        try:                                                   # 3) dan anh vao o nhap nhu Ctrl+V
            arr = []
            for f in files:
                ext = os.path.splitext(f)[1].lower()
                arr.append(dict(name=os.path.basename(f), type="image/jpeg" if ext in (".jpg", ".jpeg") else "image/webp" if ext == ".webp" else "image/png", b64=base64.b64encode(open(f, "rb").read()).decode()))
            if g.evaluate(self.G_JS_PASTE, arr) and seen_att():
                return True
        except Exception as e:
            self.log("  (đính ảnh Gemini cách 3 lỗi: %s)" % str(e)[:70])
        self._dump_page(g, "gemini_attach")
        return False

    def _g_snapshot(self, g):
        try:
            self._g_hook(g)
        except Exception:
            pass
        out = set()
        try:
            out |= set(g.evaluate(self.G_JS_IMGS, dict(seen=[], bad=self.G_BAD_ANC, resp=self.G_RESP)).get("imgs") or [])
        except Exception:
            pass
        try:
            out |= set(x.get("src") for x in (g.evaluate(self.G_JS_ANY, dict(seen=[])) or []) if x.get("src"))
        except Exception:
            pass
        return out

    # ---- LAY ANH QUA DUONG TRUYEN MANG (khong phu thuoc cau truc trang Gemini): moi tab ghi lai cac anh googleusercontent.com trang tai ve SAU luc gui
    G_NET_MIN = 40000          # byte toi thieu cua anh Gemini ve (anh dai dien / bieu tuong nho hon nhieu)

    def _g_hook(self, g):
        hk = self.__dict__.setdefault("_ghook", {})
        cur = hk.get(id(g))
        if cur is not None and cur[0] is g:
            return cur[1]
        buf = []

        def on_resp(r):
            try:
                if r.url.startswith(("data:", "blob:")) or "gstatic.com" in r.url:
                    return
                if not (r.headers.get("content-type") or "").lower().startswith("image/"):
                    return
                buf.append((time.time(), r))
                if len(buf) > 80:
                    del buf[:30]
            except Exception:
                pass
        try:
            g.on("response", on_resp)
        except Exception:
            pass
        hk[id(g)] = (g, buf)
        return buf

    def _g_net_best(self, g, since):
        """Anh LON NHAT (>=512 px rong) ma tab nay tai ve sau thoi diem since. None = chua co."""
        buf = self._g_hook(g)
        cache = self.__dict__.setdefault("_gnetc", {})
        if len(cache) > 300:
            cache.clear()
        best = None
        for ts, r in list(buf):
            if ts < since - 0.5:
                continue
            k = id(r)
            if k not in cache:
                try:
                    cl = int(r.headers.get("content-length") or 0)
                except Exception:
                    cl = 0
                if cl and cl < self.G_NET_MIN:
                    cache[k] = None
                    continue
                try:
                    raw = r.body()
                    im = Image.open(io.BytesIO(raw)).convert("RGB")
                    cache[k] = im if (im.width >= 512 and im.height >= 288 and len(raw) >= self.G_NET_MIN) else None
                except Exception:
                    cache[k] = None
            im = cache.get(k)
            if im is not None and (best is None or im.width * im.height >= best.width * best.height):
                best = im
        return best

    def _g_fresh(self, g):
        """Cuoc tro chuyen phai MOI va chi co dung 1 loi nhac cua khung nay -> moi anh trong tab = anh cua loi nhac do (khop 100%). Khong doc duoc thi coi la dung."""
        try:
            n = int(g.evaluate("() => new Set(Array.from(document.querySelectorAll('user-query')).map(e => (e.innerText || '').replace(/\\s+/g, ' ').trim()).filter(Boolean)).size") or 0)          # so loi nhac KHAC NHAU (trang co the ve 1 loi nhac 2 lan)
        except Exception:
            return True
        return n <= 1

    def _g_poll_media(self, g, st):
        """Mot luot kiem tra mot tab Gemini. Tra ve ('image', src) | ('text', chuoi) khi da xong, None neu chua; nem loi neu Gemini tu choi / khong ve."""
        try:
            info = g.evaluate(self.G_JS_IMGS, dict(seen=list(st["seen"]), bad=self.G_BAD_ANC, resp=self.G_RESP))
            busy = g.get_by_role("button", name=re.compile(r"^\s*(dừng|stop)", re.I)).count() > 0
        except Exception:
            return None
        items = info.get("items") or [dict(src=x_, w=0, h=0) for x_ in (info.get("imgs") or [])]
        if st["kind"] == "image" and not st.get("fresh_ok") and (items or time.time() - st["t0"] > 8):
            if not self._g_fresh(g):                                 # tab dang o cuoc tro chuyen CU (nhieu hon 1 loi nhac) -> khong the chac anh nao cua loi nhac nao
                raise RuntimeError("Tab Gemini không ở cuộc trò chuyện mới (có nhiều hơn 1 lời nhắc) nên không chắc ảnh khớp lời nhắc — gửi lại")
            st["fresh_ok"] = True
        if items and st["kind"] == "image":
            it = items[-1]
            src, sig = it["src"], (it.get("w"), it.get("h"))
            same = sig == st.get("sig")                              # on dinh theo KICH THUOC anh (Gemini co the doi link moi lan ve lai khung -> so link thi khong bao gio on dinh)
            st["istable"] = st["istable"] + 1 if (same and not busy) else 0
            st["iany"] = st.get("iany", 0) + 1 if same else 0       # anh dung yen nhieu luot du nut 'Dung' van hien (nhan nham) -> van nhan
            st["sig"], st["src"] = sig, src
            return ("image", src) if (st["istable"] >= 2 or st["iany"] >= 6) else None
        if st["kind"] == "image" and not items and time.time() - st["t0"] > self.G_ANY_AFTER:      # bo loc theo ten lop khong thay anh: quet KHONG loc (moi anh dang hien to, ke ca shadow DOM / iframe / anh nen)
            try:
                anys = g.evaluate(self.G_JS_ANY, dict(seen=list(st["seen"]))) or []
            except Exception:
                anys = []
            if anys:
                it = anys[-1]
                asig = (it.get("tag"), it.get("w"), it.get("h"))
                same = asig == st.get("asig")
                st["asig"], st["asrc"] = asig, it.get("src")
                st["an"] = st.get("an", 0) + 1 if same and not busy else (st.get("an", 0) if same else 0)
                st["any_n"] = st.get("any_n", 0) + 1 if same else 0
                if st["an"] >= 2 or st["any_n"] >= 6:
                    self.log("  Gemini: lấy ảnh bằng cách quét không lọc (%s %sx%s)" % (it.get("tag"), it.get("w"), it.get("h")))
                    return ("image", it["src"])
            else:
                st["an"] = st["any_n"] = 0
        if st["kind"] == "image" and not st.get("diag15") and time.time() - st["t0"] > self.G_DIAG_AFTER and not items:
            st["diag15"] = True
            self._g_diag_quick(g, st)
        if st["kind"] == "image" and time.time() - st["t0"] > 6:                    # bo loc chinh khong thay anh: lay thang anh trang vua tai ve qua mang
            try:
                nim = self._g_net_best(g, st["t0"])
            except Exception:
                nim = None
            if nim is not None:
                st["nets"] = st.get("nets", 0) + 1 if nim.size == st.get("netsig") else 0
                st["netsig"] = nim.size
                if st["nets"] >= 2 and (not busy or st["nets"] >= 5):
                    key = "%d_%d" % (id(g), int(time.time() * 1000))
                    self.__dict__.setdefault("_gnet", {})[key] = nim
                    self.log("  Gemini: lấy ảnh từ đường truyền mạng (%dx%d)" % nim.size)
                    return ("image", "@net:" + key)
            else:
                st["nets"] = 0
        if st["kind"] == "image" and time.time() - st["t0"] > self.G_FB_AFTER:        # bo loc chinh khong thay anh: thu cach du phong
            try:
                fb = g.evaluate(self.G_JS_FALLBACK, dict(seen=list(st["seen"]), q=self.G_USERQ))
            except Exception:
                fb = None
            if fb and fb.get("n"):
                fsig = (fb.get("tag"), fb.get("w"), fb.get("h"))
                st["fbn"] = st.get("fbn", 0) + 1 if fsig == st.get("fbsig") else 0
                st["fbsig"] = fsig
                if st["fbn"] >= 3 and not busy:
                    self.log("  Gemini: lấy ảnh bằng cách dự phòng (%s %dx%d)" % (fb.get("tag"), fb.get("w") or 0, fb.get("h") or 0))
                    return ("image", fb.get("src") or "@shot")
            else:
                st["fbn"] = 0
        if st["kind"] == "image" and not st.get("diag") and time.time() - st["t0"] > 50:
            st["diag"] = True
            self._g_diag(g)
        txt = info.get("text") or ""
        st["tstable"] = st["tstable"] + 1 if (txt and txt == st["tlast"] and not busy) else 0
        st["tlast"] = txt
        if st["kind"] == "text":
            return ("text", txt) if (st["tstable"] >= 3 and txt.strip()) else None
        if st["tstable"] >= 6 and time.time() - st["t0"] > 25 and txt.strip():
            raise RuntimeError("Gemini không vẽ ảnh, trả lời: " + " ".join(txt.split())[:160])
        return None

    G_JS_DIAG = """() => Array.from(document.images).filter(i => i.naturalWidth >= 100).slice(0, 40).map(i => { const r = i.getBoundingClientRect(); const chain = [];
        for (let e = i.parentElement, k = 0; e && k < 8; e = e.parentElement, k++) chain.push(e.tagName.toLowerCase() + (e.className && e.className.split ? '.' + e.className.split(' ').filter(Boolean).slice(0, 2).join('.') : ''));
        return (i.currentSrc || i.src).slice(0, 90) + ' | nat ' + i.naturalWidth + 'x' + i.naturalHeight + ' | hien ' + Math.round(r.width) + 'x' + Math.round(r.height) + ' | ' + chain.join(' < '); }).join('\\n')"""

    def _g_diag_quick(self, g, st):
        """15 giay chua nhan duoc anh: ghi NGAY vao nhat ky tab co gi (anh lon, canvas, anh mang) de biet vi sao khong nhan."""
        try:
            lines = [x for x in (g.evaluate(self.G_JS_DIAG) or "").split("\n") if x.strip()]
            big = [x for x in lines if re.search(r"hien (\d+)x(\d+)", x) and int(re.search(r"hien (\d+)x(\d+)", x).group(1)) >= 200]
            cv = g.evaluate("() => document.querySelectorAll('canvas').length") or 0
            buf = (self.__dict__.get("_ghook") or {}).get(id(g))
            nn = len([1 for ts, r in list(buf[1]) if ts >= st["t0"] - 0.5]) if buf else -1
            self.log("  (Gemini 15s chưa nhận ảnh: %d ảnh >=100px, %d to đang hiện, %d canvas, %d ảnh qua mạng) %s" % (
                len(lines), len(big), cv, nn, (big[0][:150] if big else (lines[0][:150] if lines else ""))))
        except Exception as e:
            self.log("  (chẩn đoán Gemini lỗi: %s)" % str(e)[:60])

    def _g_diag(self, g):
        """Qua 50 giay chua thay anh: luu anh chup + danh sach anh tren trang (kich thuoc, cac khung cha) de chinh bo loc anh."""
        try:
            os.makedirs(DEBUG, exist_ok=True)
            self._dump_page(g, "gemini_noimg")
            open(os.path.join(DEBUG, "gemini_imgs.txt"), "w", encoding="utf-8").write(g.evaluate(self.G_JS_DIAG) or "")
            self.log("  chưa thấy ảnh Gemini sau 50 giây — đã lưu ảnh chụp + danh sách ảnh vào thư mục cache\\flow_debug (gemini_noimg.png, gemini_imgs.txt)")
        except Exception:
            pass

    G_JS_B64 = """async (src) => { const r = await fetch(src, {credentials: 'include'}); if (!r.ok) throw new Error('HTTP ' + r.status); const b = await r.blob();
        return await new Promise(res => { const f = new FileReader(); f.onload = () => res(f.result.split(',')[1]); f.readAsDataURL(b); }); }"""
    G_JS_CANVAS = """(src) => { const i = Array.from(document.images).find(x => (x.currentSrc || x.src) === src); if (!i) throw new Error('khong thay the img');
        const c = document.createElement('canvas'); c.width = i.naturalWidth; c.height = i.naturalHeight; c.getContext('2d').drawImage(i, 0, 0); return c.toDataURL('image/png').split(',')[1]; }"""

    def _g_shot(self, g, src=""):
        """Cach cuoi: chup chinh phan tu anh dang hien (chat luong bang kich thuoc hien thi). Phan tu duoc danh dau data-as-shot."""
        if src and src != "@shot":
            try:
                g.evaluate(self.G_JS_MARK, src)
            except Exception:
                pass
        _front(g)
        png = g.locator("[data-as-shot='1']").first.screenshot(timeout=20000)
        im = Image.open(io.BytesIO(png)).convert("RGB")
        if im.width < 200:
            raise RuntimeError("anh chup qua nho")
        return im

    def _g_fetch(self, g, src):
        """Tai anh Gemini vua ve. Uu tien ban goc (=s0) neu la anh googleusercontent; loi thi dung ban dang hien; het cach thi chup phan tu anh."""
        if src.startswith("@net:"):
            im = self.__dict__.setdefault("_gnet", {}).pop(src[5:], None)
            if im is not None:
                return im
            raise RuntimeError("mất ảnh bắt từ mạng")
        if src == "@shot":
            return self._g_shot(g, src)
        cands = [src]
        if "googleusercontent.com" in src:
            up = re.sub(r"=s\d+[^/=]*$", "=s0", src)
            if up != src:
                cands.insert(0, up)
        last = None
        for u in cands:
            for how in ("page", "ctx"):                              # 1) fetch NGAY TRONG trang (dung cookie dang dang nhap)  2) request cua trinh duyet
                if how == "ctx" and (u.startswith("blob:") or u.startswith("data:")):
                    continue
                try:
                    if how == "page":
                        raw = base64.b64decode(g.evaluate(self.G_JS_B64, u))
                    else:
                        r = g.context.request.get(u, timeout=60000)
                        if not r.ok:
                            last = "HTTP %s" % r.status; continue
                        raw = r.body()
                    im = Image.open(io.BytesIO(raw)).convert("RGB")
                    if im.width >= 256:
                        return im
                except Exception as e:
                    last = str(e)[:80]
        try:                                                         # 3) ve lai anh dang hien len canvas (khi tai truc tiep bi chan)
            im = Image.open(io.BytesIO(base64.b64decode(g.evaluate(self.G_JS_CANVAS, src)))).convert("RGB")
            if im.width >= 256:
                return im
        except Exception as e:
            last = str(e)[:80]
        try:                                                         # 4) anh trang vua tai ve qua mang (dung bytes trang da nhan)
            nim = self._g_net_best(g, self.__dict__.get("_gsend_t", {}).get(id(g), 0))
            if nim is not None:
                self.log("  (tải ảnh Gemini lỗi: %s → dùng ảnh bắt từ mạng)" % last)
                return nim
        except Exception as e:
            last = "%s; mạng: %s" % (last, str(e)[:50])
        try:
            im = self._g_shot(g, src)
            self.log("  (tải ảnh Gemini lỗi: %s → dùng ảnh chụp phần tử)" % last)
            return im
        except Exception as e:
            last = "%s; chụp ảnh: %s" % (last, str(e)[:60])
        raise RuntimeError("Không tải được ảnh Gemini vừa vẽ (%s)" % last)

    @staticmethod
    def _g_wrap(job):
        """Gemini web chi ve anh khi duoc yeu cau ro: them cau lenh dau + ti le khung."""
        if job.get("kind", "image") != "image":
            return str(job.get("prompt") or "")
        asp = job.get("aspect") or "16:9"
        shape = {"16:9": "wide landscape 16:9", "9:16": "tall portrait 9:16", "1:1": "square 1:1", "4:3": "landscape 4:3", "3:4": "portrait 3:4"}.get(asp, asp)
        head = ("Create ONE image (%s aspect ratio). " % shape) + ("Use the attached reference image as the character reference exactly as instructed below. " if job.get("files") else "") + "Reply with the image only, no text.\n\n"
        return head + str(job.get("prompt") or "")

    SITE_GEMINI = dict(name="Gemini", host="gemini.google.com", dump="gemini", tab="_gemini_tab", prepare="_g_prepare", attach="_g_attach", snapshot="_g_snapshot",
                       send="_g_send", poll="_g_poll_media", fetch="_g_fetch", wrap="_g_wrap")
    SITE_CHATGPT = dict(name="ChatGPT", host="chatgpt.com", dump="chatgpt", tab="_chatgpt_tab", prepare="_c_prepare", attach="_c_attach", snapshot="_c_snapshot",
                        send="_c_send", poll="_c_poll_media", fetch="_c_fetch", wrap="_c_wrap")

    def gemini_many(self, jobs, n=3, timeout=240, on_done=None, more=None):
        return self._chat_many(self.SITE_GEMINI, jobs, n, timeout, on_done, more)

    def chatgpt_many(self, jobs, n=3, timeout=300, on_done=None, more=None):
        return self._chat_many(self.SITE_CHATGPT, jobs, n, timeout, on_done, more)

    def _chat_many(self, site, jobs, n=3, timeout=240, on_done=None, more=None):
        """(Gemini / ChatGPT: cung mot vong chay, khac nhau o cac ham trong site.)
        jobs: list dict(kind='image'|'text', prompt, files=[duong dan anh], aspect). Chay song song tren n tab Gemini rieng (moi tab mot cuoc tro chuyen moi cho moi viec).
        Tra ve list (Image | chuoi | Exception) theo thu tu jobs. on_done(j, ket_qua) goi NGAY khi tung viec xong; more() cho them viec dang chay (ve lai ngay)."""
        n = max(1, min(int(n or 1), 6, max(1, len(jobs))))
        tabs = []
        for k in range(n):
            t = getattr(self, site["tab"])(k)
            if t is None:
                break
            tabs.append(t)
        if not tabs:                      # khong mo duoc tab rieng -> dung tam tab Flow (tuan tu), se quay lai Flow sau
            g = self.page
            if not getattr(self, "on_gemini", False):
                try:
                    if site["host"] not in g.url:
                        self.flow_url = g.url
                except Exception:
                    pass
            self.on_gemini = True
            tabs = [g]
        results = [None] * len(jobs)
        pending = list(range(len(jobs)))
        tries = [0] * len(jobs)
        fails = {id(g): 0 for g in tabs}
        dead, active, beat = set(), {}, time.time()

        refbad = [0]

        def bad(j, e, g):
            if isinstance(e, RefAttachError):                     # khong phai loi tab; loi lien tiep = loi he thong -> dung han
                refbad[0] += 1; tries[j] += 1
                if refbad[0] >= REF_STOP:
                    self.log("  ⚠ Đính ảnh tham chiếu vào %s lỗi liên tiếp %d lượt → dừng gửi tiếp" % (site["name"], refbad[0]))
                    results[j] = e
                    for k_ in list(pending):
                        results[k_] = e
                    pending.clear()
                elif tries[j] < REF_TRIES:
                    self.log("  đính ảnh tham chiếu lỗi → mở lại cuộc trò chuyện, tải ảnh lên lại (lượt %d/%d)" % (tries[j] + 1, REF_TRIES)); pending.insert(0, j)
                else:
                    results[j] = e
                return
            fails[id(g)] += 1
            tries[j] += 1
            if fails[id(g)] >= 3 and len(dead) + 1 < len(tabs):
                dead.add(id(g)); self.log("  bỏ một tab %s bị lỗi liên tục: " % site["name"] + str(e)[:80])
            if tries[j] < 3 and len(dead) < len(tabs):
                self.log("  %s lỗi (%s) → thử lại" % (site["name"], str(e)[:80])); pending.insert(0, j)
            else:
                results[j] = e if isinstance(e, Exception) else RuntimeError(str(e))

        while True:
            if more is not None:
                try:
                    for jb in (more() or []):
                        jobs.append(jb); results.append(None); tries.append(0); pending.append(len(jobs) - 1)
                except Exception as e_m:
                    self.log("  (thêm việc vẽ lại lỗi: %s)" % str(e_m)[:80])
            if not (pending or active):
                break
            if ABORT.is_set():
                raise RuntimeError("Đã dừng")
            for g in tabs:
                if id(g) in active or id(g) in dead or not pending:
                    continue
                j = pending.pop(0)
                try:
                    jb = jobs[j]
                    self._wake(g)
                    box = getattr(self, site["prepare"])(g)
                    self._wake(g)
                    files = [f for f in (jb.get("files") or []) if f]
                    okf = bool(not files or getattr(self, site["attach"])(g, files))
                    for att_ in range(1, ATT_TRIES):               # chua dinh duoc: dinh lai ngay tren tab nay (tai len lai), khong bo cuoc som
                        if okf:
                            break
                        self.log("  ⚠ %s tab %d: chưa đính được ảnh tham chiếu → tự tải ảnh lên lại, lần %d/%d" % (site["name"], tabs.index(g) + 1, att_ + 1, ATT_TRIES))
                        time.sleep(1.2 + 0.8 * att_)
                        okf = bool(getattr(self, site["attach"])(g, files))
                    if not okf:
                        if jb.get("kind", "image") == "image" and not REF_LAX:      # ve ma khong co anh tham chieu = nhan vat sai -> khong gui
                            raise RefAttachError("Không đính được ảnh tham chiếu vào %s nên KHÔNG vẽ (vẽ tiếp sẽ ra nhân vật sai). Đã lưu ảnh chụp vào %s (%s_attach.png)." % (site["name"], DEBUG, site["dump"]))
                        self.log("  ⚠ %s tab %d: chưa chắc đã đính được ảnh tham chiếu (xem debug/%s_attach.png)" % (site["name"], tabs.index(g) + 1, site["dump"]))
                    st = dict(kind=jb.get("kind", "image"), seen=getattr(self, site["snapshot"])(g), t0=time.time(), istable=0, tstable=0, tlast="", src="")
                    getattr(self, site["send"])(g, box, getattr(self, site["wrap"])(jb))
                    refbad[0] = 0
                    active[id(g)] = (g, j, time.time(), st)
                    self.log("  %s tab %d/%d đã gửi %s %d (đang chạy %d tab)" % (site["name"], tabs.index(g) + 1, len(tabs), "ảnh" if st["kind"] == "image" else "câu hỏi", j + 1, len(active)))
                except Exception as e:
                    if str(e) == "Đã dừng":
                        raise
                    bad(j, e, g)
            if len(dead) >= len(tabs) and pending:
                for j in pending:
                    results[j] = RuntimeError("Không còn tab %s nào dùng được" % site["name"])
                pending = []
            time.sleep(1.5)
            if active and time.time() - beat >= 25:
                beat = time.time()
                self.log("  …đang chờ %s (%d tab đang chạy, xong %d/%d, còn chờ gửi %d)" % (site["name"], len(active), sum(1 for r_ in results if r_ is not None), len(jobs), len(pending)))
            for key, (g, j, t0, st) in list(active.items()):
                try:
                    r = getattr(self, site["poll"])(g, st)
                except Exception as e:
                    del active[key]; self._dump_page(g, "%s_fail_%d" % (site["dump"], j)); bad(j, e, g); continue
                if r is None:
                    if time.time() - t0 > timeout:
                        del active[key]; self._dump_page(g, "%s_timeout_%d" % (site["dump"], j))
                        bad(j, RuntimeError("%s không trả %s trong %ds" % (site["name"], "ảnh" if st["kind"] == "image" else "lời", timeout)), g)
                    continue
                del active[key]
                try:
                    res = getattr(self, site["fetch"])(g, r[1]) if r[0] == "image" else r[1]
                except Exception as e:
                    bad(j, e, g); continue
                results[j] = res; fails[id(g)] = 0
                if on_done is not None:
                    try:
                        on_done(j, res)
                    except Exception as e_cb:
                        self.log("  (lưu kết quả ngay lỗi: %s)" % str(e_cb)[:80])
        return results

    # ------------------------------------------------------------ ChatGPT: VE ANH bang TAB chatgpt.com cua trinh duyet (tai khoan da dang nhap) — khong dung API
    C_SELS = ["#prompt-textarea", "div.ProseMirror[contenteditable='true']", "div[contenteditable='true'][role='textbox']", "div[contenteditable='true']", "textarea"]
    C_PLUS = re.compile(r"(thêm tệp|thêm ảnh|đính kèm|tải lên|add (photos|files)|attach|upload|more|thêm)", re.I)
    C_UPLOAD_ITEM = re.compile(r"(tải ảnh và tệp|tải lên từ máy|thêm ảnh và tệp|add photos|upload (a )?(file|photo|image)|from (your )?computer|từ máy tính)", re.I)
    C_SEND = re.compile(r"(gửi lời nhắc|gửi tin nhắn|gửi|send prompt|send message|send)", re.I)
    C_JS_IMGS = """(a) => { const seen = new Set(a.seen);
        const isUser = e => !!e.closest('[data-message-author-role="user"], form, [data-testid="composer"]');
        const turns = Array.from(document.querySelectorAll('article')).filter(t => !t.querySelector('[data-message-author-role="user"]'));
        const last = turns.length ? turns[turns.length - 1] : null;
        const pool = last ? Array.from(last.querySelectorAll('img')) : Array.from(document.images).filter(i => !isUser(i));
        const imgs = pool.filter(i => i.complete && i.naturalWidth >= 400 && i.naturalHeight >= 250 && !isUser(i)).map(i => i.currentSrc || i.src).filter(s => s && !seen.has(s));
        let txt = ''; if (last) txt = last.innerText || ''; else { const rs = document.querySelectorAll('[data-message-author-role="assistant"]'); txt = rs.length ? rs[rs.length - 1].innerText : ''; }
        return {imgs: imgs, text: txt, n: turns.length}; }"""
    C_JS_PASTE = """(arr) => { const box = document.querySelector("#prompt-textarea, div.ProseMirror[contenteditable='true'], [contenteditable='true']");
        if (!box) return false; box.focus(); const dt = new DataTransfer();
        for (const a of arr) { const bin = atob(a.b64); const u8 = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) u8[i] = bin.charCodeAt(i); dt.items.add(new File([u8], a.name, {type: a.type})); }
        box.dispatchEvent(new ClipboardEvent('paste', {clipboardData: dt, bubbles: true, cancelable: true})); return true; }"""

    def _c_find_box(self, g):
        for sel in self.C_SELS:
            try:
                loc = g.locator(sel)
                for i in range(min(loc.count(), 4)):
                    if loc.nth(i).is_visible():
                        bb = loc.nth(i).bounding_box()
                        if bb and bb["width"] > 120:
                            return loc.nth(i)
            except Exception:
                pass
        return None

    def _c_dismiss(self, g):
        pat = r"^(không, cảm ơn|no thanks|stay logged out|ở lại trạng thái đăng xuất|okay, let.?s go|got it|đã hiểu|tiếp tục|continue|dismiss|đóng|close|bỏ qua|skip|reject non-essential|từ chối|accept all|chấp nhận tất cả|đồng ý)$"
        try:
            loc = g.get_by_role("button", name=re.compile(pat, re.I))
            for i in range(min(loc.count(), 3)):
                if loc.nth(i).is_visible():
                    loc.nth(i).click(timeout=1500); time.sleep(0.8)
        except Exception:
            pass

    def _c_prepare(self, g, wait=240):
        """Mo cuoc tro chuyen moi tren tab g (chatgpt.com) va cho o nhap."""
        try:
            g.goto("https://chatgpt.com/", wait_until="domcontentloaded", timeout=60000)
        except Exception as e:
            self.log("  tải trang ChatGPT chậm/lỗi: %s" % str(e)[:100])
        time.sleep(2)
        t0, n_it = time.time(), 0
        while time.time() - t0 < wait:
            if ABORT.is_set():
                raise RuntimeError("Đã dừng")
            box = self._c_find_box(g)
            if box is not None:
                return box
            n_it += 1
            if n_it % 3 == 0:
                self._c_dismiss(g)
            try:
                u = g.url
            except Exception:
                u = ""
            if "auth" in u or "login" in u or "accounts.google" in u:
                self.log("Hãy đăng nhập ChatGPT trong tab vừa mở… (đang chờ)")
            elif n_it % 8 == 0:
                try:
                    self.log("  đang chờ ChatGPT sẵn sàng… (%s | %s)" % (u[:60], g.title()[:40]))
                except Exception:
                    pass
            time.sleep(2)
        self._dump_page(g, "chatgpt_nobox")
        try:
            info = "%s | %s" % (g.url[:80], g.title()[:50])
        except Exception:
            info = ""
        raise RuntimeError("Không thấy ô nhập của ChatGPT (đã đăng nhập chưa?) " + info)

    def _c_sig(self, g):
        """Dau van khung soan cua ChatGPT (so anh nho / chieu cao / so nut) de kiem chung anh da dinh. None = khong do duoc."""
        try:
            box = self._c_find_box(g)
            return box.evaluate(self.JS_COMP_SIG, False) if box is not None else None
        except Exception:
            return None

    def _c_attach(self, g, files):
        """Dinh anh vao cuoc tro chuyen ChatGPT roi KIEM CHUNG anh da hien o khung soan. Thu: o file san co, nut '+' -> tai len, dan (paste). True = da dinh (hoac khong kiem chung duoc)."""
        files = [f for f in (files or []) if f and os.path.isfile(f)]
        if not files:
            return True
        base = self._c_sig(g)

        def settled(wait=12.0):
            t0 = time.time()
            while time.time() - t0 < wait:
                time.sleep(0.7)
                r = self._sig_grew(base, self._c_sig(g))
                if r is None:
                    return None
                if r:
                    time.sleep(1.0)
                    return True
            return False

        def via_input():
            inp = g.locator("input[type='file']")
            if not inp.count():
                raise RuntimeError("không có ô chọn file")
            inp.first.set_input_files(files)

        def via_plus():
            btn = None
            for loc in (g.locator("[data-testid='composer-plus-btn']"), g.get_by_role("button", name=self.C_PLUS)):
                for i in range(min(loc.count(), 6)):
                    if loc.nth(i).is_visible():
                        btn = loc.nth(i); break
                if btn is not None:
                    break
            if btn is None:
                raise RuntimeError("không thấy nút +")
            btn.click(timeout=3000); time.sleep(0.7)
            item = None
            for role in ("menuitem", "button", "option"):
                li = g.get_by_role(role, name=self.C_UPLOAD_ITEM)
                for i in range(min(li.count(), 4)):
                    if li.nth(i).is_visible():
                        item = li.nth(i); break
                if item is not None:
                    break
            if item is None:
                inp = g.locator("input[type='file']")
                if not inp.count():
                    raise RuntimeError("menu không có mục tải lên")
                inp.first.set_input_files(files)
                return
            with g.expect_file_chooser(timeout=6000) as fc:
                item.click(timeout=3000)
            fc.value.set_files(files)

        def via_paste():
            arr = []
            for f in files:
                ext = os.path.splitext(f)[1].lower()
                arr.append(dict(name=os.path.basename(f), type="image/jpeg" if ext in (".jpg", ".jpeg") else "image/webp" if ext == ".webp" else "image/png", b64=base64.b64encode(open(f, "rb").read()).decode()))
            if not g.evaluate(self.C_JS_PASTE, arr):
                raise RuntimeError("không thấy ô nhập để dán")

        errs = []
        for name, fn in (("ô file", via_input), ("+", via_plus), ("dán", via_paste)):
            try:
                fn()
            except Exception as e:
                errs.append("%s: %s" % (name, str(e)[:60]))
                try:
                    g.keyboard.press("Escape")
                except Exception:
                    pass
                continue
            r = settled()
            if r is None:
                self.log("  (không kiểm chứng được ảnh mẫu đã vào khung soạn ChatGPT — vẫn gửi)")
                return True
            if r:
                if errs:
                    self.log("  (đính được ảnh mẫu vào ChatGPT bằng cách '%s' sau khi: %s)" % (name, "; ".join(errs)[:140]))
                return True
            errs.append("%s: đã tải nhưng ảnh không hiện ở khung soạn" % name)
            try:
                g.keyboard.press("Escape")
            except Exception:
                pass
        self.log("  (không đính được ảnh mẫu vào ChatGPT: %s)" % "; ".join(errs[-3:])[:200])
        self._dump_page(g, "chatgpt_attach")
        try:
            os.makedirs(DEBUG, exist_ok=True)
            sg = (self._c_sig(g) or {})
            box = self._c_find_box(g)
            html = box.evaluate(self.JS_COMP_SIG, True).get("html", "") if box is not None else ""
            open(os.path.join(DEBUG, "chatgpt_attach.html"), "w", encoding="utf-8").write("<!-- thumbs=%s h=%s btns=%s -->\n%s" % (sg.get("thumbs"), sg.get("h"), sg.get("btns"), html))
        except Exception:
            pass
        return False

    def _c_snapshot(self, g):
        try:
            return set(g.evaluate(self.C_JS_IMGS, dict(seen=[])).get("imgs") or [])
        except Exception:
            return set()

    def _c_send(self, g, box, text):
        """Dan + gui cau lenh (cho nut gui het mo khi anh dinh kem dang tai len)."""
        before = 0
        _click_or_focus(box); time.sleep(0.3)
        try:
            g.keyboard.insert_text(text)
        except Exception:
            box.fill(text, timeout=8000)
        time.sleep(1.2)
        sent = False
        for _ in range(60):                                   # toi da ~30 giay cho anh tai len xong
            try:
                cands = [g.locator("button[data-testid='send-button']"), g.get_by_role("button", name=self.C_SEND)]
                for loc in cands:
                    for i in range(min(loc.count(), 4)):
                        el = loc.nth(i)
                        if el.is_visible() and el.is_enabled():
                            el.click(timeout=3000); sent = True; break
                    if sent:
                        break
            except Exception:
                pass
            if sent:
                break
            time.sleep(0.5)
        if not sent:
            g.keyboard.press("Enter")
        return before

    def _c_busy(self, g):
        """ChatGPT dang tra loi / ve? (nut Dung dang HIEN; nut an trong DOM khong tinh)."""
        try:
            for loc in (g.locator("button[data-testid='stop-button']"), g.get_by_role("button", name=re.compile(r"(stop streaming|stop generating|dừng phát|dừng tạo|^dừng$|^stop$)", re.I))):
                for i in range(min(loc.count(), 4)):
                    if loc.nth(i).is_visible():
                        return True
        except Exception:
            return True
        return False

    def _c_poll_media(self, g, st):
        """Mot luot kiem tra mot tab ChatGPT. ('image', src) | ('text', chuoi) khi xong, None neu chua; nem loi neu ChatGPT khong ve (tu choi / het luot)."""
        try:
            info = g.evaluate(self.C_JS_IMGS, dict(seen=list(st["seen"])))
        except Exception:
            return None
        busy = self._c_busy(g)
        imgs = info.get("imgs") or []
        if imgs and st["kind"] == "image":
            src = imgs[-1]
            st["istable"] = st["istable"] + 1 if (src == st.get("src") and not busy) else 0
            st["src"] = src
            return ("image", src) if st["istable"] >= 2 else None
        txt = info.get("text") or ""
        st["tstable"] = st["tstable"] + 1 if (txt and txt == st["tlast"] and not busy) else 0
        st["tlast"] = txt
        if st["kind"] == "text":
            return ("text", txt) if (st["tstable"] >= 3 and txt.strip()) else None
        if st["tstable"] >= 8 and time.time() - st["t0"] > 45 and txt.strip():
            raise RuntimeError("ChatGPT không vẽ ảnh, trả lời: " + " ".join(txt.split())[:160])
        return None

    def _c_fetch(self, g, src):
        """Tai anh ChatGPT vua ve: uu tien fetch ngay trong trang (cung goc, kem cookie dang nhap), roi moi toi request cua trinh duyet."""
        last = None
        for mode in ("page", "ctx"):
            try:
                if mode == "page" or src.startswith(("blob:", "data:")):
                    b64 = g.evaluate("""async (src) => { const r = await fetch(src, {credentials: 'include'}); if (!r.ok) throw new Error('HTTP ' + r.status); const b = await r.blob();
                        return await new Promise(res => { const f = new FileReader(); f.onload = () => res(f.result.split(',')[1]); f.readAsDataURL(b); }); }""", src)
                    raw = base64.b64decode(b64)
                else:
                    r = g.context.request.get(src, timeout=60000)
                    if not r.ok:
                        last = "HTTP %s" % r.status; continue
                    raw = r.body()
                im = Image.open(io.BytesIO(raw)).convert("RGB")
                if im.width >= 256:
                    return im
            except Exception as e:
                last = str(e)[:80]
        raise RuntimeError("Không tải được ảnh ChatGPT vừa vẽ (%s)" % last)

    @staticmethod
    def _c_wrap(job):
        """ChatGPT chi ve anh khi duoc yeu cau ro: cau lenh dau + ti le khung; yeu cau ve ngay, khong hoi lai."""
        if job.get("kind", "image") != "image":
            return str(job.get("prompt") or "")
        asp = job.get("aspect") or "16:9"
        shape = {"16:9": "wide landscape 16:9", "9:16": "tall portrait 9:16", "1:1": "square 1:1", "4:3": "landscape 4:3", "3:4": "portrait 3:4"}.get(asp, asp)
        head = ("Create ONE image (%s aspect ratio). " % shape) + ("Use the attached reference image as the character reference exactly as instructed below. " if job.get("files") else "") + "Generate the image right now, do not ask me any questions, and reply with the image only, no text.\n\n"
        return head + str(job.get("prompt") or "")

    def _chatgpt_tab(self, k=0):
        """Mo (hoac dung lai) tab ChatGPT rieng thu k. None neu khong mo duoc."""
        tabs = getattr(self, "ctabs", None)
        if tabs is None:
            tabs = self.ctabs = []
        if k < len(tabs) and tabs[k] is not None:
            try:
                if not tabs[k].is_closed():
                    return tabs[k]
            except Exception:
                pass
        try:
            ctx = self.page.context
            known = set(id(p) for p in ctx.pages)
            url = "https://chatgpt.com/"
            try:
                cs = self.browser.new_browser_cdp_session()
                cs.send("Target.createTarget", {"url": url})
            except Exception as e:
                self.log("  mở tab ChatGPT (CDP) lỗi: %s" % str(e)[:80])
                p = ctx.new_page()
                try:
                    p.goto(url, wait_until="domcontentloaded", timeout=30000)
                except Exception:
                    pass
            t0, cp = time.time(), None
            while time.time() - t0 < 25 and cp is None:
                for p in ctx.pages:
                    if id(p) in known or p is self.page:
                        continue
                    try:
                        if "chatgpt.com" in p.url or "openai.com" in p.url or p.url.startswith("about:blank"):
                            cp = p; break
                    except Exception:
                        pass
                if cp is None:
                    self.page.wait_for_timeout(500)
            if cp is None:
                return None
            if cp.url.startswith("about:blank"):
                try:
                    cp.goto(url, wait_until="domcontentloaded", timeout=30000)
                except Exception:
                    pass
                if cp.url.startswith("about:blank"):
                    try:
                        cp.close()
                    except Exception:
                        pass
                    return None
            while len(tabs) <= k:
                tabs.append(None)
            tabs[k] = cp
            self._keepalive(cp)
            return cp
        except Exception as e:
            self.log("  không mở được tab ChatGPT riêng: %s" % str(e)[:100])
            return None

    def _gemini_tab(self, k=0):
        """Mo (hoac dung lai) tab Gemini rieng thu k, khong dung chung tab Flow. None neu khong mo duoc."""
        tabs = getattr(self, "gtabs", None)
        if tabs is None:
            tabs = self.gtabs = []
        if k < len(tabs) and tabs[k] is not None:
            try:
                if not tabs[k].is_closed():
                    return tabs[k]
            except Exception:
                pass
        try:
            ctx = self.page.context
            known = set(id(p) for p in ctx.pages)
            url = "https://gemini.google.com/app"
            try:
                cs = self.browser.new_browser_cdp_session()
                cs.send("Target.createTarget", {"url": url})
            except Exception as e:
                self.log("  mở tab Gemini (CDP) lỗi: %s" % str(e)[:80])
                p = ctx.new_page()
                try:
                    p.goto(url, wait_until="domcontentloaded", timeout=30000)
                except Exception:
                    pass
            t0, gp = time.time(), None
            while time.time() - t0 < 25 and gp is None:
                for p in ctx.pages:
                    if id(p) in known or p is self.page:
                        continue
                    try:
                        if "gemini.google" in p.url or p.url.startswith("about:blank") or "accounts.google" in p.url:
                            gp = p; break
                    except Exception:
                        pass
                if gp is None:
                    self.page.wait_for_timeout(500)      # bom su kien Playwright (time.sleep thi khong thay tab moi)
            if gp is None:
                return None
            if gp.url.startswith("about:blank"):
                try:
                    gp.goto(url, wait_until="domcontentloaded", timeout=30000)
                except Exception:
                    pass
                if gp.url.startswith("about:blank"):
                    try:
                        gp.close()
                    except Exception:
                        pass
                    return None
            while len(tabs) <= k:
                tabs.append(None)
            tabs[k] = gp
            self._keepalive(gp)
            return gp
        except Exception as e:
            self.log("  không mở được tab Gemini riêng: %s" % str(e)[:100])
            return None

    def _tab_ready(self, g, gem, wait=40):
        """Cho tab Gemini/ChatGPT tai xong (o nhap hien ra). Tra ve 'ok' | 'login' (dang o trang dang nhap) | 'slow' (het gio ma chua thay o nhap).
        Cho bang wait_for_timeout cua Playwright (khong phai time.sleep) de cac su kien cua trang van duoc bom."""
        finder = self._g_find_box if gem else self._c_find_box
        t0, k = time.time(), 0
        while time.time() - t0 < wait:
            if ABORT.is_set():
                raise RuntimeError("Đã dừng")
            try:
                u = (g.url or "").lower()
            except Exception:
                u = ""
            if (gem and ("accounts.google" in u or "signin" in u or "servicelogin" in u)) or (not gem and ("auth" in u or "/login" in u)):
                return "login"
            try:
                if finder(g) is not None:
                    return "ok"
            except Exception:
                pass
            k += 1
            if gem and k % 4 == 0:
                self._g_dismiss(g)
            try:
                g.wait_for_timeout(700)
            except Exception:
                time.sleep(0.7)
        return "slow"

    def back_to_flow(self):
        """Tu Gemini quay lai trang Flow (giu nguyen du an)."""
        if not getattr(self, "on_gemini", False):
            return
        self.on_gemini = False
        try:
            self.page.goto(getattr(self, "flow_url", None) or self.url, wait_until="domcontentloaded", timeout=60000)
        except Exception as e:
            self.log("  quay lại Flow lỗi: %s" % str(e)[:100])
        time.sleep(3)
        self.aspect_set = None
        try:
            self._wait_ready(120)
        except Exception:
            pass

    def _dump_page(self, pg, tag):
        try:
            os.makedirs(DEBUG, exist_ok=True)
            pg.screenshot(path=os.path.join(DEBUG, tag + ".png"))
        except Exception:
            pass

    def dump(self, tag, comp_html=False):
        if comp_html:                                   # cau truc HTML cua khung soan: de chinh selector khi Flow doi giao dien
            try:
                os.makedirs(DEBUG, exist_ok=True)
                sg = self._comp_sig(html=True) or {}
                open(os.path.join(DEBUG, tag + ".html"), "w", encoding="utf-8").write("<!-- thumbs=%s h=%s btns=%s url=%s -->\n%s" % (sg.get("thumbs"), sg.get("h"), sg.get("btns"), self.page.url[:120], sg.get("html", "")))
            except Exception:
                pass
        try:
            os.makedirs(DEBUG, exist_ok=True)
            self.page.screenshot(path=os.path.join(DEBUG, tag + ".png"))
            html = self.page.evaluate("""() => Array.from(document.querySelectorAll('button,textarea,input,[role=button],[contenteditable],[role=textbox],img'))
                .slice(0, 150).map(e => e.tagName + ' | ' + (e.getAttribute('aria-label') || '') + ' | ' + (e.innerText || '').slice(0, 40) + ' | ' + (e.placeholder || '')).join('\\n')""")
            open(os.path.join(DEBUG, tag + ".txt"), "w", encoding="utf-8").write(html)
        except Exception:
            pass


_FLOW = [None]
from concurrent.futures import ThreadPoolExecutor
_EX = ThreadPoolExecutor(max_workers=1)      # Playwright (sync) chi dung duoc tren MOT luong -> moi thao tac Flow chay o day


def _run(fn, *a):
    return _EX.submit(fn, *a).result()


def _get(log, browser, gemini=False):
    if _FLOW[0] is not None and not _FLOW[0].alive():       # cua so Flow da bi dong -> mo lai
        _FLOW[0].stop(); _FLOW[0] = None
    if _FLOW[0] is None:
        f = Flow(log=log, browser=browser)
        try:
            f.start()
        except Exception:
            f.stop()
            raise
        _FLOW[0] = f
    if not gemini and getattr(_FLOW[0], "on_gemini", False):
        _FLOW[0].back_to_flow()
    return _FLOW[0]


def get_flow(log=print, browser=0):
    """Mo Flow (cho dang nhap). An toan khi goi tu luong bat ky."""
    _run(_get, log, browser)
    return True


def generate(prompt, ref=None, aspect="3:4", browser=0, log=print, refs=None):
    return _run(lambda: _get(log, browser).generate(prompt, ref=ref, aspect=aspect, refs=refs))


def gemini_ask(system, user, browser=0, log=print):
    def _g():
        f = _get(log, browser, gemini=True)
        f.focus()                      # cua so co the dang thu nho (an Flow) -> dua len de Gemini chay
        try:
            return f.gemini(system + "\n\n=====\n\n" + user)
        finally:
            try:
                if not getattr(f, "on_gemini", False) and not HIDE[0]:
                    _front(f.page)     # tab Flow len lai; tab Gemini van de do
            except Exception:
                pass
    return _run(_g)


_REC = {"soft": 0, "t": 0.0}


def recover(browser=0, log=print, soft=False):
    """Sau loi Flow: tai lai trang du an (khong mat dang nhap/du an) de thu lai dung cho.
    soft=True (loi 'khong dinh duoc anh tham chieu': trang Flow van dung duoc, o nhap + nut tai len van o do): KHONG tai lai trang, chi cho cac tab quen anh da tai
    de tai len lai. Bam 'Thu lai' them lan nua ma van loi (qua 2 lan lien tiep) thi moi tai lai trang."""
    def _r():
        f = _get(log, browser)
        if soft:
            now = time.time()
            if now - _REC["t"] > 600:
                _REC["soft"] = 0
            ok_page = False
            try:
                ok_page = ("/project/" in (f.page.url or "")) and f._box() is not None and not getattr(f, "on_gemini", False)
            except Exception:
                pass
            if ok_page and _REC["soft"] < 2:
                _REC["soft"] += 1; _REC["t"] = now
                for w_ in [f] + list(getattr(f, "wtabs", None) or []):
                    try:
                        w_._heal_ref()
                    except Exception:
                        pass
                log("  Lỗi đính ảnh tham chiếu → KHÔNG tải lại trang Flow, chỉ tải lại ảnh tham chiếu lên rồi vẽ tiếp")
                return True
        _REC["soft"] = 0
        f.on_gemini = True          # ep back_to_flow() tai lai trang Flow
        f.back_to_flow()
        return True
    try:
        return _run(_r)
    except Exception as e:
        log("  tải lại Flow lỗi: %s" % str(e)[:100])
        return False


def generate_many(jobs, n=2, browser=0, log=print, on_done=None, more=None, draw=False):
    if draw:
        return _run(lambda: _get(log, browser).generate_many(jobs, n, on_done=on_done, more=more, draw=True))
    return _run(lambda: _get(log, browser).generate_many(jobs, n, on_done=on_done, more=more))


def gemini_many(jobs, n=3, browser=0, log=print, on_done=None, more=None, timeout=240):
    """Ve anh / hoi kem anh bang cac TAB Gemini (tai khoan dang nhap trong trinh duyet), song song n tab."""
    def _g():
        f = _get(log, browser, gemini=True)
        f.focus()
        try:
            return f.gemini_many(jobs, n, timeout, on_done, more)
        finally:
            try:
                if not getattr(f, "on_gemini", False) and not HIDE[0]:
                    _front(f.page)
            except Exception:
                pass
    return _run(_g)


def chatgpt_many(jobs, n=3, browser=0, log=print, on_done=None, more=None, timeout=300):
    """Ve anh bang cac TAB ChatGPT (chatgpt.com, tai khoan dang nhap trong trinh duyet), song song n tab."""
    def _g():
        f = _get(log, browser, gemini=True)
        f.focus()
        try:
            return f.chatgpt_many(jobs, n, timeout, on_done, more)
        finally:
            try:
                if not getattr(f, "on_gemini", False) and not HIDE[0]:
                    _front(f.page)
            except Exception:
                pass
    return _run(_g)


def chatgpt_draw(prompt, refs=None, aspect="16:9", browser=0, log=print):
    """Ve MOT anh bang tab ChatGPT (kem anh tham chieu neu co)."""
    r = chatgpt_many([dict(kind="image", prompt=prompt, files=list(refs or []), aspect=aspect)], 1, browser, log)[0]
    if isinstance(r, Exception):
        raise r
    return r


def gemini_draw(prompt, refs=None, aspect="16:9", browser=0, log=print):
    """Ve MOT anh bang tab Gemini (kem anh tham chieu neu co)."""
    r = gemini_many([dict(kind="image", prompt=prompt, files=list(refs or []), aspect=aspect)], 1, browser, log)[0]
    if isinstance(r, Exception):
        raise r
    return r


def gemini_ask_multi(system, users, browser=0, n=3, log=print):
    """Nhieu cau hoi cung luc qua n tab Gemini. Tra ve list (chuoi | Exception)."""
    def _g():
        f = _get(log, browser, gemini=True)
        f.focus()
        try:
            return f.gemini_multi([system + "\n\n=====\n\n" + u for u in users], n)
        finally:
            try:
                if not getattr(f, "on_gemini", False) and not HIDE[0]:
                    _front(f.page)
            except Exception:
                pass
    return _run(_g)


def _open_chat_tabs(n, browser, log, engine):
    """Mo san n tab cua engine Gemini (gemini.google.com) hoac ChatGPT (chatgpt.com) — KHONG mo tab Flow. Tab da mo san con song thi dung lai (khong mo them);
    tab thua cua engine do (nhieu hon n) thi dong. MO LAN LUOT tung tab: tab dang tai duoc dua len tren cung va cho tai xong (hien o nhap) roi moi mo tab ke tiep
    (mo cung luc thi cac tab bi day xuong nen, trinh duyet tai rat cham — nhin nhu treo). Tab tai cham thi tai lai 1 lan.
    Tra ve (so tab dung duoc, da_du, danh_sach_mo_ta, so_tab_thua_da_dong)."""
    gem = engine == "gemini"
    name = "Gemini" if gem else "ChatGPT"
    attr = "gtabs" if gem else "ctabs"

    def _o():
        fl = _get(log, browser, gemini=True)            # gemini=True: khong keo trinh duyet ve trang Flow
        opener = fl._gemini_tab if gem else fl._chatgpt_tab
        tabs, states = [], []
        for k in range(n):
            log("Đang mở tab %s %d/%d…" % (name, k + 1, n))
            t = opener(k)
            if t is None:
                log("  không mở được tab %s %d" % (name, k + 1))
                continue
            _front(t)
            st = fl._tab_ready(t, gem, 40)
            if st == "slow":
                log("  tab %s %d tải chậm → tải lại trang" % (name, k + 1))
                try:
                    t.reload(wait_until="domcontentloaded", timeout=45000)
                except Exception as e:
                    log("  tải lại tab %d lỗi: %s" % (k + 1, str(e)[:80]))
                st = fl._tab_ready(t, gem, 40)
            tabs.append(t); states.append(st)
        closed = 0
        lst = getattr(fl, attr, None) or []
        for k in range(n, len(lst)):                      # tab thua cua CHINH engine nay
            try:
                if lst[k] is not None and not lst[k].is_closed():
                    lst[k].close(); closed += 1
            except Exception:
                pass
        if lst:
            del lst[n:]
        rep = []
        for i, (t, st) in enumerate(zip(tabs, states)):
            rep.append("Tab %d %s %s" % (i + 1, {"ok": "✔", "login": "⚠ cần đăng nhập", "slow": "⚠ chưa tải xong (kiểm tra mạng / đăng nhập)"}.get(st, "✔"), name))
        return len(tabs), len(tabs) >= n and all(s_ != "slow" for s_ in states), rep, closed
    return _run(_o)


def open_tabs(n, browser=0, log=print, engine="flow"):
    """Mo san n tab theo engine dang chon: Flow = moi tab vao du an rieng; Gemini = n tab gemini.google.com; ChatGPT = n tab chatgpt.com.
    Da du tab thi KHONG mo them / tai lai trang. Tra ve (so tab dung duoc, da_du, danh_sach_mo_ta, so_tab_thua_da_dong)."""
    n = max(1, int(n))
    if engine in ("gemini", "chatgpt"):
        return _open_chat_tabs(n, browser, log, engine)

    def _o():
        fl = _FLOW[0]
        if fl is None or not fl.alive():
            fl = _get(log, browser)
        wt = getattr(fl, "wtabs", None) or []
        ok = [w for w in wt if not _closed(w) and getattr(w, "ready", False)]
        main_ok = bool(getattr(fl, "ready", False) and not getattr(fl, "on_gemini", False))
        if (1 if main_ok else 0) + len(ok) >= n and main_ok:
            workers = [fl] + ok[:n - 1]
        else:
            workers = fl.prepare_tabs(n)
        closed = 0
        try:                                   # dong tab Flow/tab trong thua (khong dong tab Gemini, khong dong tab dang dung)
            keep = [w.page for w in workers]
            for p in list(fl.page.context.pages):
                if any(p is k for k in keep):
                    continue
                u = p.url or ""
                if "labs.google" in u or u in ("about:blank", "chrome://newtab/", "") or u.startswith("chrome://new"):
                    try:
                        p.close(); closed += 1
                    except Exception:
                        pass
        except Exception:
            pass
        rep = []
        for i, w in enumerate(workers):
            try:
                rep.append("Tab %d ✔ dự án …%s" % (i + 1, (w.page.url or "").split("?")[0][-6:]))
            except Exception:
                rep.append("Tab %d ?" % (i + 1))
        return len(workers), len(workers) >= n, rep, closed
    return _run(_o)


def _closed(w):
    try:
        return w.page.is_closed()
    except Exception:
        return True


def hide_flow():
    def _h():
        return bool(_FLOW[0] is not None and _FLOW[0].alive() and _FLOW[0].hide())
    return _run(_h)


def focus_flow():
    """Dua cua so Flow len truoc; True neu cua so con song."""
    def _f():
        if _FLOW[0] is not None and _FLOW[0].alive():
            _FLOW[0].focus(force=True); return True
        return False
    return _run(_f)


def set_hide(flag):
    HIDE[0] = bool(flag)


def close_flow():
    def _c():
        if _FLOW[0]:
            _FLOW[0].stop(); _FLOW[0] = None
    _run(_c)


def close_browser(log=print):
    """Ve xong -> dong han trinh duyet ve (tat ca tab Flow / Gemini / ChatGPT) cho nhe may. Lan ve sau tool tu mo lai (van con dang nhap). True neu co trinh duyet da dong."""
    def _c():
        fl = _FLOW[0]
        if fl is None:
            return False
        _FLOW[0] = None
        try:
            ok = fl.shutdown()
        except Exception as e:
            log("  (không đóng được trình duyệt vẽ: %s)" % str(e)[:80])
            return False
        return bool(ok)
    return _run(_c)
