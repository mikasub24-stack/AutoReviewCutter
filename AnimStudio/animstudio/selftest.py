# -*- coding: utf-8 -*-
"""Tu kiem tra ban dong goi / bien dich:  AnimStudio.exe --selftest   (hoac  python AnimStudio.py --selftest)
build.bat goi lenh nay sau khi build; KHONG phat hanh ban nao ma lenh nay bao LOI.
- Chay trong thu muc du lieu TAM (AnimStudio.py dat ANIMSTUDIO_DATA truoc) nen khong dung toi du an / ban quyen that cua may.
- Khong mo cua so, khong mo trinh duyet. Ket qua ghi vao  selftest.txt  canh chuong trinh (va in ra man hinh neu co) ; ma thoat 0 = dat, 1 = loi.
- Co dong ho canh: qua TIMEOUT giay ma chua xong thi ghi LOI roi thoat (khong de build.bat treo)."""
import os, sys, time, threading, importlib, traceback, subprocess, tempfile, json

TIMEOUT = 240

# moi module trong goi animstudio (tests/test_selftest.py kiem tra danh sach nay khop voi cac tep .py that su)
MODULES = ["actions", "art", "audio", "chargen", "common", "cues", "director", "dplan", "drawpage", "drawpage_js", "ed25519", "edgeupdate", "extras", "flowgen",
           "fx", "langs", "licensepage", "licensing", "llm", "looks", "ndi", "payqr", "pose", "props", "r2d", "r3d", "rescue", "resume", "reveal", "script", "singleinst", "sprites", "templates",
           "timeline", "tts", "uikit", "video", "vids", "vplan", "webui"]

LINES = []
BAD = [0]


def say(kind, msg):
    """kind: OK / CB (canh bao, khong chan) / LOI"""
    line = "%-4s %s" % (kind, msg)
    LINES.append(line)
    if kind == "LOI":
        BAD[0] += 1
    try:
        print(line, flush=True)
    except Exception:
        pass


def _out_path():
    from animstudio import common
    return os.path.join(common.APP_DIR if common.FROZEN else common.DATA_DIR, "selftest.txt")      # ban dong goi: canh chuong trinh (build.bat doc); ma nguon: thu muc tam


def _write(done):
    try:
        with open(_out_path(), "w", encoding="utf-8") as f:
            f.write("\n".join(LINES) + "\n")
            f.write(("KET QUA: DAT\n" if BAD[0] == 0 else "KET QUA: %d LOI\n" % BAD[0]) if done else "KET QUA: CHUA XONG\n")
    except Exception:
        pass


def _cleanup():
    """Xoa thu muc du lieu TAM do AnimStudio.py tao cho lan tu kiem tra (chi xoa thu muc co tien to animstudio_selftest_)."""
    try:
        import shutil
        from animstudio import common
        d = os.path.abspath(common.DATA_DIR)
        if os.path.basename(d).startswith("animstudio_selftest_") and os.path.dirname(d) == os.path.abspath(tempfile.gettempdir()):
            shutil.rmtree(d, ignore_errors=True)
    except Exception:
        pass


def _watchdog():
    time.sleep(TIMEOUT)
    say("LOI", "qua %d giay van chua xong (co buoc bi treo)" % TIMEOUT)
    _write(False)
    os._exit(1)


def _guard(name, fn):
    try:
        r = fn()
        return r
    except Exception as e:
        say("LOI", "%s: %s: %s" % (name, type(e).__name__, str(e)[:200]))
        try:
            LINES.append("".join(traceback.format_exc().splitlines(True)[-6:]).rstrip())
        except Exception:
            pass
        return None


def check_imports():
    bad = []
    for m in MODULES:
        try:
            importlib.import_module("animstudio." + m)
        except Exception as e:
            bad.append("%s (%s: %s)" % (m, type(e).__name__, str(e)[:120]))
    if bad:
        say("LOI", "khong nap duoc module: " + "; ".join(bad))
    else:
        say("OK", "nap duoc %d module cua chuong trinh" % len(MODULES))


def _expected():
    """ANIMSTUDIO_EXPECT=webview,vieneu (build.bat dat khi tu thu ban bien dich Nuitka): thu vien nay chay duoc o ma nguon thi ban dong goi PHAI co,
    thieu = LOI (build.bat se quay ve PyInstaller) chu khong chi canh bao."""
    return {x.strip().lower() for x in os.environ.get("ANIMSTUDIO_EXPECT", "").split(",") if x.strip()}


def check_libs():
    exp = _expected()
    if exp:
        say("OK", "bat buoc phai co (vi ma nguon dang co): " + ", ".join(sorted(exp)))
    import numpy, PIL
    say("OK", "numpy %s, Pillow %s" % (numpy.__version__, PIL.__version__))
    from animstudio import ndi
    say("OK" if ndi._use_sp() else "CB", "scipy.ndimage" if ndi._use_sp() else "khong co scipy - dung OpenCV thay the")
    import certifi
    if os.path.isfile(certifi.where()):
        say("OK", "certifi: co goi chung chi")
    else:
        say("LOI", "certifi thieu tep cacert.pem (%s) - giong Microsoft va tai tu mang se loi SSL" % certifi.where())
    try:
        import edge_tts
        say("OK", "edge_tts %s" % getattr(edge_tts, "__version__", "?"))
    except Exception as e:
        say("LOI", "khong co edge_tts (%s) - giong Microsoft khong chay" % e)
    try:
        import playwright
        from playwright._impl._driver import compute_driver_executable
        drv = compute_driver_executable()
        drv = drv[0] if isinstance(drv, (tuple, list)) else drv
        if os.path.isfile(str(drv)):
            say("OK", "playwright: co driver")
        else:
            say("LOI", "playwright thieu driver (%s) - khong dieu khien duoc Flow" % drv)
    except Exception as e:
        say("LOI", "playwright: %s: %s" % (type(e).__name__, str(e)[:160]))
    try:
        import webview
        if os.name == "nt":
            import clr                                  # pywebview tren Windows chay qua .NET (pythonnet); thieu thi app tu mo bang trinh duyet
        say("OK", "pywebview (cua so rieng)")
    except Exception as e:
        say("LOI" if "webview" in exp else "CB", "khong dung duoc pywebview (%s: %s) - app se mo bang trinh duyet thay cua so rieng" % (type(e).__name__, str(e)[:100]))
    try:
        import vieneu
        say("OK", "vieneu (giong nhan ban)")
        try:
            import importlib.util as iu
            if iu.find_spec("sea_g2p") is not None:          # thu vien phien am cua VieNeu: can file du lieu sea_g2p.bin canh ma; thieu = giong VieNeu bao 'os error 2'
                import sea_g2p
                b = os.path.join(os.path.dirname(os.path.abspath(sea_g2p.__file__)), "sea_g2p.bin")
                if os.path.isfile(b):
                    say("OK", "sea_g2p.bin (du lieu phien am cua VieNeu, %.0f MB)" % (os.path.getsize(b) / 1048576.0))
                else:
                    say("LOI", "thieu sea_g2p.bin canh sea_g2p (%s) - giong VieNeu se bao 'os error 2'. Chay lai build.bat ban moi (co fixdata.py chep them file du lieu)" % os.path.dirname(b))
        except Exception as e:
            say("CB", "khong kiem tra duoc sea_g2p.bin (%s: %s)" % (type(e).__name__, str(e)[:100]))
    except Exception as e:
        say("LOI" if "vieneu" in exp else "CB", "khong nap duoc vieneu (%s: %s) - giong cua ban se doc tam bang giong Microsoft" % (type(e).__name__, str(e)[:100]))


def check_files():
    from animstudio import common
    d = common.APP_DIR
    if not common.FROZEN:
        say("OK", "chay tu ma nguon - bo qua kiem tra tep di kem")
        return
    exe = "ffmpeg.exe" if os.name == "nt" else "ffmpeg"
    ff = os.path.join(d, exe)
    if not os.path.isfile(ff):
        say("LOI", "thieu %s canh chuong trinh" % exe)
    else:
        try:
            r = subprocess.run([ff, "-version"], capture_output=True, timeout=30)
            say("OK" if r.returncode == 0 else "LOI", "ffmpeg chay duoc" if r.returncode == 0 else "ffmpeg bao loi khi chay")
        except Exception as e:
            say("LOI", "khong chay duoc ffmpeg: %s" % e)
    for sub in ("characters", "samples", "fonts", "reveal_defaults"):
        p = os.path.join(d, sub)
        n = sum(len(fs) for _, _, fs in os.walk(p)) if os.path.isdir(p) else 0
        if n:
            say("OK", "thu muc %s: %d tep" % (sub, n))
        else:
            say("LOI" if sub in ("characters", "fonts") else "CB", "thu muc %s trong hoac khong co" % sub)
    if os.path.isdir(os.path.join(d, "voices")):
        say("OK", "thu muc voices")
    else:
        say("CB", "khong co thu muc voices - khong co giong nhan ban")
    say("OK" if os.path.isfile(os.path.join(d, "animstudio.ico")) else "CB", "animstudio.ico")


def check_fonts():
    from animstudio import common
    f = common.font(40, "bold")
    from PIL import Image, ImageDraw
    im = Image.new("L", (400, 80), 0)
    ImageDraw.Draw(im).text((4, 4), "Xin chào Việt Nam", font=f, fill=255)
    if im.getbbox() is None:
        say("LOI", "ve chu tieng Viet ra anh trang (loi font)")
    else:
        say("OK", "ve duoc chu tieng Viet")
    miss = [lg for lg, nm in (("zh", "Trung"), ("tw", "Trung phồn thể"), ("ja", "Nhật"), ("ko", "Hàn")) if not common.script_font_path(lg, True)]
    if miss:
        say("CB", "may khong co font ve chu cho phu de: " + ", ".join(miss) + " (phu de tieng do se hien o vuong; Windows co san Microsoft YaHei / JhengHei, Yu Gothic, Malgun Gothic)")
    else:
        fz = common.script_font(("zh"), 40, True)
        im2 = Image.new("L", (400, 80), 0)
        ImageDraw.Draw(im2).text((4, 4), "你好 こんにちは 한국어", font=fz, fill=255)
        say("LOI" if im2.getbbox() is None else "OK", "ve duoc chu Han / Nhat / Han cho phu de" if im2.getbbox() else "ve chu Han ra anh trang (loi font)")
    from animstudio import langs
    say("OK" if langs.raqm() else "CB", "Pillow co raqm: phu de Thai / Hindi / A Rap chen duoc vao video" if langs.raqm() else
        "Pillow khong co raqm: tieng Thai / Hindi / A Rap khong chen phu de vao video (van xuat file .srt); Trung / Nhat / Han / Viet / Anh khong anh huong")


def check_license():
    from animstudio import licensing as L, ed25519
    e = L.selfcheck()
    say("LOI" if e else "OK", ("ban quyen: " + e) if e else "ban quyen: Ed25519 + dinh dang key + ma may")
    st = L.status()
    if st.get("ok") and st.get("mode") == "trial" and 0 < st.get("trial_left_s", 0) <= L.TRIAL_HOURS * 3600:
        say("OK", "dung thu %d gio tinh tu luc mo dau (con %s)" % (L.TRIAL_HOURS, st.get("short") or st.get("msg")))
    else:
        say("LOI", "trang thai dung thu bat thuong: %s" % json.dumps({k: st.get(k) for k in ("ok", "mode", "trial_left_s", "msg")}, ensure_ascii=False)[:200])
    say("OK", "khoa cong khai ban quyen: %s..." % L.PUBLIC_KEY_HEX[:16])


def check_render():
    import numpy as np
    from PIL import Image, ImageDraw
    from animstudio import reveal
    old = Image.new("RGB", (192, 108), (240, 236, 220))
    new = Image.new("RGB", (192, 108), (255, 255, 255))
    d = ImageDraw.Draw(new)
    d.ellipse((50, 20, 140, 90), outline=(20, 20, 20), width=4)
    d.line((30, 100, 170, 100), fill=(20, 20, 20), width=4)
    d.rectangle((70, 40, 120, 70), fill=(220, 60, 60))
    ok = True
    for kind in ("pen", "fade"):
        frames = []
        for q in (0.15, 0.5, 0.95):
            try:
                fr = reveal.compose(kind, q, old, new, 0, 1) if kind != "fade" else reveal.compose("fade", q, old, new, 0, 1)
            except TypeError:
                fr = reveal.compose(kind, q, old, new, 0)
            frames.append(np.asarray(fr.convert("RGB"), dtype=np.int16))
        if not (np.abs(frames[0] - frames[2]).mean() > 0.5):
            ok = False
            say("LOI", "hieu ung %s: cac khung giong het nhau" % kind)
    if ok:
        say("OK", "dung duoc hieu ung chuyen canh (but ve / mo dan)")


def check_server():
    import urllib.request
    from animstudio import webui
    srv = webui.ThreadingHTTPServer(("127.0.0.1", 0), webui.H)
    threading.Thread(target=srv.serve_forever, daemon=True).start()
    base = "http://127.0.0.1:%d" % srv.server_address[1]
    try:
        for path, needle in (("/", "AnimStudio"), ("/license", "Bản quyền"), ("/api/license", '"mode"')):
            with urllib.request.urlopen(base + path, timeout=30) as r:
                body = r.read().decode("utf-8", "replace")
                if r.status != 200 or needle not in body:
                    say("LOI", "may chu noi bo: %s tra ve khong dung (%s)" % (path, r.status))
                    return
        say("OK", "may chu noi bo: trang chinh, trang ban quyen, /api/license")
    finally:
        srv.shutdown()


def _isolate():
    """Ban quyen luu CA o registry (HKCU\\Software\\AnimStudio) nen thu muc du lieu tam chua du de tach rieng: may tac gia da kich hoat key thi
    selftest se thay 'da co key' thay vi dung thu, va status() con GHI nguoc vao registry that. Chan doc/ghi registry trong suot lan tu kiem tra."""
    from animstudio import licensing as L
    L._reg_read = lambda: None
    L._reg_write = lambda txt: None


def run():
    threading.Thread(target=_watchdog, daemon=True).start()
    _guard("tach registry", _isolate)
    from animstudio import common
    say("OK", "AnimStudio %s - %s - APP_DIR=%s" % (getattr(importlib.import_module("animstudio"), "__version__", "?"),
                                                  "Nuitka" if common.COMPILED else ("PyInstaller" if getattr(sys, "frozen", False) else "ma nguon"), common.APP_DIR))
    for name, fn in (("nap module", check_imports), ("thu vien", check_libs), ("tep di kem", check_files), ("font", check_fonts),
                     ("ban quyen", check_license), ("hieu ung", check_render), ("may chu", check_server)):
        _guard(name, fn)
    n = BAD[0]
    LINES.append("OK   TU KIEM TRA DAT" if n == 0 else "LOI  TU KIEM TRA BAO %d LOI" % n)
    print(LINES[-1], flush=True) if sys.stdout else None
    _write(True)
    _cleanup()
    return 0 if n == 0 else 1
