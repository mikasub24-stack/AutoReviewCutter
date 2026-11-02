# -*- coding: utf-8 -*-
"""Giao dien AnimStudio dang trang web chay tren may (127.0.0.1) - khong can tkinter, chu ro rang, mo bang trinh duyet mac dinh."""
import os, sys, json, time, threading, traceback, webbrowser, mimetypes, re
from http.server import ThreadingHTTPServer, BaseHTTPRequestHandler
from urllib.parse import urlparse, unquote, parse_qs
from .common import APP_DIR, DATA_DIR
from . import __version__, chargen, llm
from .script import parse_script
from . import tts
from . import langs
from . import fx
from . import licensing
from .tts import PROVIDERS, make_provider
from .timeline import synth_all, build_project
from .director import prepare_text, looks_like_script

OUTDIR = os.path.join(os.path.expanduser("~"), "Videos", "AnimStudio")
DRAW_INSET = 0.88                           # tab 'Ve ra': anh canh chiem 88% khung hinh (khong tran het khung)
DRAW_FIRST_START = 0.10                      # tab 'Ve ra' (hieu ung ve tu giay 0): giong cau dau cua video vao o giay 0,10 (ngay luc net ve bat dau) thay vi tre ~0,9 giay
ERAS = {"modern": "Hiện đại"}                # tab Tao Video Story chi con thoi dai Hien dai (backend van doc duoc du an cu thoi khac)
CANCEL = threading.Event()
JOB = dict(state="idle", pct=0, msg="", log=[], video="", error="", srt="")
FLOW = dict(state="off", msg="")          # off | opening | ready | error
PROPS = dict(state="idle", msg="", n=0)    # hinh minh hoa AI cho hieu ung ve ra: idle | working | done | error
LOCK = threading.Lock()
FRAME_PROMPTS = {}                        # tab Ve ra: prompt cuoi cung da gui Flow cho tung khung (chi so 0..) de hien thi / sua / ve lai
PROMPT_OVR = {}                           # prompt nguoi dung sua tay cho tung khung (ghi de prompt tu dong)


def jlog(msg, pct=None):
    with LOCK:
        JOB["msg"] = msg
        JOB["log"].append(time.strftime("%H:%M:%S ") + msg)
        JOB["log"] = JOB["log"][-80:]
        if pct is not None:
            JOB["pct"] = round(pct, 1)


def close_draw_browser(log=None):
    """Ve xong -> dong han trinh duyet ve (cac tab Flow / Gemini / ChatGPT) truoc khi dung video, cho nhe may. Van con dang nhap; lan ve sau tool tu mo lai. Khong bao gio nem loi."""
    lg = log or jlog
    try:
        from . import flowgen
        if flowgen.close_browser():
            FLOW["state"], FLOW["msg"] = "off", ""          # lan sau ensure_flow() mo lai
            lg("Đã đóng các tab vẽ cho nhẹ máy — đang dựng video.")
            return True
    except Exception as e:
        lg("(không đóng được tab vẽ: %s)" % str(e)[:80])
    return False


# ---------------------------------------------------------------- Flow
FLOW_THREAD = [None]


def flow_open(browser, force=False):
    """Luon co phan hoi khi bam nut: dang mo -> dua cua so len / mo lai neu bi dong; da san sang -> dua cua so len."""
    from . import flowgen
    st = FLOW["state"]
    if st == "ready" and not force:
        def chk():
            try:
                if flowgen.focus_flow():
                    FLOW.update(msg="Flow đang mở sẵn (đã đưa cửa sổ lên trước).")
                    return
            except Exception:
                pass
            FLOW.update(state="off", msg="Cửa sổ Flow đã bị đóng, đang mở lại…")
            flow_open(browser, force=True)
        threading.Thread(target=chk, daemon=True).start()
        return
    if st == "opening" and not force:
        force = True                      # bam lai luc dang cho = mo lai cua so (co the cua so bi an / bi dong)
    if force:
        flowgen.ABORT.set()
        t = FLOW_THREAD[0]
        if t is not None and t.is_alive():
            t.join(8)
        flowgen.ABORT.clear()
    FLOW.update(state="opening", msg="Đang mở trình duyệt và Google Flow… hãy đăng nhập Google nếu được hỏi (cửa sổ có thể nằm sau cửa sổ này).")

    def work():
        try:
            flowgen.get_flow(log=lambda m: FLOW.update(msg=m), browser=browser)
            FLOW.update(state="ready", msg="Đã đăng nhập, Flow sẵn sàng.")
        except Exception as e:
            if "mở lại" not in str(e):
                FLOW.update(state="error", msg=str(e)[:300])
    th = threading.Thread(target=work, daemon=True)
    FLOW_THREAD[0] = th
    th.start()


# ---------------------------------------------------------------- tao video
def voice_list():
    """[(chi so, ten)] chi gom giong dung duoc tren may nay (Microsoft online luon dung dau tien)."""
    import importlib.util as iu
    from . import edgeupdate

    def has(n):
        try:
            return iu.find_spec(n) is not None
        except (ValueError, ImportError):
            return n in sys.modules
    ok = {0: has("edge_tts") or bool(edgeupdate._local_versions()), 1: has("vieneu"), 2: True, 3: True}
    out = [[i, n] for i, n in enumerate(PROVIDERS) if ok.get(i, True) and i != 2]
    return out or [[0, PROVIDERS[0]]]


def get_provider(idx, log):
    """Nguon giong theo lua chon. Khong tu doi sang nguon khac: khong khoi tao duoc thi bao loi ro ly do."""
    pid = PROVIDERS[idx]
    try:
        return make_provider(pid), pid
    except Exception as e:
        if idx == 0:
            raise RuntimeError("Chưa dùng được giọng Microsoft (thiếu thư viện edge-tts hoặc mất mạng): " + str(e)[:120])
        raise RuntimeError(f"Chưa dùng được nguồn giọng «{pid}»: {str(e)[:200]}. Tool không tự đổi sang giọng khác; hãy sửa nguồn này hoặc tự chọn nguồn giọng khác.")


def provider_idx(o):
    """Nguon giong theo lua chon: Azure -> 3; giong VieNeu co san / Microsoft chon thang -> 0 (Hybrid: tu doi sang Microsoft neu VieNeu chua cai); con lai theo o['voice']."""
    nv = str(o.get("narrator") or "")
    if nv == "auto:azure" or nv.startswith("az:"):
        return tts.AZURE_IDX
    if nv == "auto:vieneu" or nv.startswith(("vp:", "ms:")):
        return 0
    return int(o.get("voice", 0) or 0)


WPS_DEF = dict(langs.WPS)          # tu/giay khi doc o toc do 1.0 (chu Han / Kana / Hangul / Thai: ky tu/giay; tu hoc lai tu lan doc that, xem learn_wps)


def speech_wps():
    c = llm.load_cfg().get("wps") or {}
    out = dict(WPS_DEF)
    for k in out:
        try:
            v = float(c.get(k))
            if 1.2 <= v <= max(8.0, out[k] * 1.8):
                out[k] = v
        except (TypeError, ValueError):
            pass
    return out


def est_secs(lines, speed=1.0, lang=None):
    """Uoc luong thoi luong loi doc: so tu / toc do doc + nghi giua cac cau (~0.3s). Toc do doc la so do tu lan doc that gan nhat."""
    from .common import detect_lang
    w = speech_wps()
    sp = max(0.5, float(speed or 1.0))
    tot = 0.0
    for t in lines:
        lg = lang if lang in w else detect_lang(t)
        tot += langs.wcount(t) / w.get(lg, w["vi"]) / sp + 0.3
    return round(tot, 1)


SHARED = set()                             # tab Ve ra: cac dong dung chung anh voi dong chu cua canh (khong ve rieng)


def plan_backend(o, cfg):
    """AI doc hieu truyen (tab Ve ra): 0 = tat (o['plan_ai'] = 0). Mac dinh: backend co key da luu o tab Tao Video Story (Claude / OpenAI / Gemini API), khong co thi Gemini qua trinh duyet (cung cua so voi Flow)."""
    v = o.get("plan_ai")
    if v is not None and str(v) != "":
        try:
            return max(0, min(5, int(v)))
        except (TypeError, ValueError):
            return 0
    try:
        b = int(cfg.get("backend") or 0)
    except (TypeError, ValueError):
        b = 0
    return b if (b in (2, 3, 4) and (cfg.get("key") or b == 3)) else 5


def legacy_len(o):
    """Du an cu (truoc khi co AI doc hieu truyen) gui 'scene_len' = so ky tu toi da moi canh: van ton trong, khong dung AI."""
    try:
        v = int(o.get("scene_len") or 0)
    except (TypeError, ValueError):
        return 0
    return v if v > 0 else 0


def draw_script_offline(txt, speed=1.0, maxc=None):
    """Truyen / kich ban -> kich ban moi dong = mot canh, KHONG can AI (dung cho xem truoc va khi AI loi): cung bo nhan dien voi tab Tao Video Story, roi gom cau theo nghia ~6 giay/canh."""
    from . import templates
    scr = llm.story_to_script(txt, dict(backend=0), log=lambda *a: None)[0]
    return templates.refine_script(scr, maxc or None, speech_wps(), speed, marks=looks_like_script(txt))


def learn_wps(sc, au, speed, lang=None):
    """Sau khi doc xong: do toc do doc that (tu/giay) de lan sau uoc luong thoi luong dung voi giong dang dung."""
    try:
        from .common import detect_lang
        acc = {}
        for ln, a in zip(sc.lines, au):
            lg = lang if lang in WPS_DEF else detect_lang(ln.text)
            w_, s_ = acc.get(lg, (0, 0.0))
            acc[lg] = (w_ + langs.wcount(ln.text), s_ + len(a) / tts.SR * max(0.5, float(speed or 1.0)))
        c = llm.load_cfg()
        cur = dict(c.get("wps") or {})
        ch = False
        for lg, (w_, s_) in acc.items():
            if w_ >= 120 and s_ > 20:
                v = w_ / s_
                if 1.2 <= v <= max(8.0, WPS_DEF.get(lg, 4.6) * 1.8):
                    old = cur.get(lg)
                    cur[lg] = round(v if not isinstance(old, (int, float)) else 0.5 * old + 0.5 * v, 3)
                    ch = True
        if ch:
            c["wps"] = cur
            llm.save_cfg(c)
    except Exception:
        pass


def edge_of(prov):
    e = getattr(prov, "edge", prov)
    return e if hasattr(e, "diagnose") else None


def edge_hint(prov):
    """Thu nhanh tung giong Microsoft de noi ro giong nao chay / khong (chi goi khi vua loi). '' neu khong phai Microsoft."""
    e = edge_of(prov)
    if e is None:
        return ""
    try:
        return " " + tts.edge_report(e.diagnose())
    except Exception:
        return ""


def edge_self_update(prov, once=[False]):
    """Microsoft bao loi (403 / khong tra am thanh) va dang dung giong Microsoft: tai edge-tts moi nhat roi dung ngay ban do. True neu da doi sang ban moi."""
    if edge_of(prov) is None:
        return False
    from . import edgeupdate
    jlog("Microsoft chưa trả giọng → kiểm tra xem có edge-tts mới hơn không…")
    ch, msg = edgeupdate.update(True, jlog)
    if ch:
        tts.refresh_edge(prov)
        jlog("✔ " + msg + ". Đọc lại bằng bản mới (vẫn giữ đúng giọng bạn chọn).")
    else:
        jlog("edge-tts: " + (msg if isinstance(msg, str) else "không có bản mới") + (" — đang dùng bản mới nhất rồi." if "moi nhat" in str(msg) else ""))
    return ch


def synth_patient(sc, prov, prov_id, lang, o, cancel):
    """Doc giong cho ca video, DUNG giong da chon. Microsoft chap chon (khong tra am thanh) thi KHONG chet ngay: cho roi doc tiep dung cau do
    (cau da doc nam trong cache); het kien nhan moi bao loi kem ket qua thu nhanh tung giong de nguoi dung tu chon giong khac.
    Lan loi dau (403 / khong am thanh): tu tai edge-tts moi nhat neu co roi thu lai ngay."""
    waits = (15, 30, 60, 90)
    tried_upd = False
    for r in range(len(waits) + 1):
        try:
            return synth_all(sc, prov, prov_id, lang, progress=lambda i, n, m: jlog(m, 10 + 15 * i / max(n, 1)), cancel=cancel,
                             speed=float(o.get("speed", 1.0) or 1.0), volume=_vol01(o), fresh=bool(o.get("redo_voice")) and r == 0)
        except tts.VoiceBusy as e:
            if not tried_upd:
                tried_upd = True
                if edge_self_update(prov):
                    continue
            if r >= len(waits):
                raise tts.VoiceBusy(str(e) + edge_hint(prov))
            jlog(f"⏳ Microsoft chưa trả giọng cho {getattr(e, 'where', 'một câu')}. Đợi {waits[r]} giây rồi đọc tiếp (lần {r + 2}/{len(waits) + 1}); vẫn giữ đúng giọng bạn chọn, các câu đã đọc được lưu, không đọc lại.")
            for _ in range(waits[r]):
                if cancel is not None and cancel.is_set():
                    raise RuntimeError("Đã dừng")
                time.sleep(1)
        except RuntimeError as e:
            if str(e) == "Đã dừng" or tried_upd or "403" not in str(e):
                raise
            tried_upd = True
            if not edge_self_update(prov):
                raise
    raise RuntimeError("Không đọc được giọng")


AZ_CACHE = os.path.join(DATA_DIR, "azure_voices.json")


def azure_state():
    """Trang thai Azure cho giao dien. KHONG bao gio tra key ra ngoai (chi bao da co key + 4 ky tu cuoi)."""
    key, region = tts.azure_cfg()
    voices = []
    try:
        with open(AZ_CACHE, encoding="utf-8") as f:
            c = json.load(f)
        if c.get("region") == region:
            voices = c.get("voices") or []
    except Exception:
        pass
    if key and not voices:       # chua tai danh sach: dung bo giong Neural co dinh (cung ten giong voi Microsoft online)
        voices = [[v, l, "f" if "Nữ" in l else "m", langs.locale_of(v)] for v, l in tts.MS_VOICES]
    return dict(key_set=bool(key), key_tail=("…" + key[-4:]) if len(key) >= 8 else "", region=region, voices=voices if key else [],
                n_vi=sum(1 for v in voices if v[3] == "vi-VN"))


REV = {"ev": threading.Event(), "redo": []}


MAN = {}
TABBUSY = [False]
DRAWING = [False]
REDOQ = []


def _vol01(o):
    """Am luong giong doc 0..200% -> he so 0..2 (0% = tat tieng, khong bi doi thanh 100%)."""
    try:
        v_ = float(o.get("vol", 100))
    except Exception:
        v_ = 100.0
    return max(0.0, min(2.0, v_ / 100.0))


def redo_poll():
    with LOCK:
        out = list(dict.fromkeys(REDOQ)); REDOQ.clear()
    return out
OLDMAP = []


def _merged_map():
    """Manifest anh <-> cau: ban moi + cac muc cu chua dung (de mat dien/doc lai kich ban van khop duoc anh cu)."""
    new = [MAN[k] for k in sorted(MAN)]
    seen = {p for _, p in new}
    return new + [e for e in OLDMAP if e[1] not in seen]


_FSAVE = threading.Lock()
_FSAVE_T = [0.0]


def save_frames(n=None, force=False):
    """Luu NGAY vao du an: anh cua tung khung da ve (theo so khung) + so khung da co. Goi moi khi 1 khung ve xong, nen tat app / bam Dung / mat dien giua chung van con du anh."""
    if not force and time.time() - _FSAVE_T[0] < 0.4:
        return False
    with _FSAVE:
        with LOCK:
            fr = JOB.get("frames") or []
            n_ = n or len(fr)
            nd_ = sum(1 for k, f in enumerate(fr) if f.get("state") == "done" and (k in MAN or k in SHARED))
            snap = _merged_map()
            idx = {str(k): [v[0], v[1]] for k, v in MAN.items()}
        proj_update(frames_done=nd_, frames_total=n_, frames_map=snap, frames_idx=idx)
        _FSAVE_T[0] = time.time()
    return True


def frame_cb(i, n, text, path, state, err=""):
    with LOCK:
        fr = JOB.get("frames") or []
        if len(fr) != n:
            fr = [dict(n=k + 1, text="", url="", state="pending") for k in range(n)]
        fr[i] = dict(n=i + 1, text=(text or "")[:90], url=("/cimg/" + os.path.basename(path)) if path else "", state=state, err=(err or "")[:200], sh=1 if i in SHARED else 0)
        JOB["frames"] = fr
        reg_ = False
        if state == "done" and path and i not in SHARED:
            if not any(k != i and v[1] == path for k, v in MAN.items()):          # anh 'dung lai khung gan nhat' (Dung video ngay) KHONG phai anh cua khung nay -> khong luu, de lan Tiep tuc sau van ve dung khung do
                MAN[i] = [text or "", path]
                reg_ = True
        done_ = state == "done"
        full_ = done_ and all(f.get("state") == "done" for f in fr)
    if reg_ or (done_ and full_):
        save_frames(n, force=full_)


PROJ_DIR = os.path.join(DATA_DIR, "projects")
STORY_UI_F = os.path.join(DATA_DIR, "story_ui.json")
_STORY_UI_LOCK = threading.Lock()


def story_ui_load():
    """Cau hinh da chon o tab 'Tao Video Story' (de chuyen sang tab 'Ve ra' roi quay lai van con). Hong/thieu file -> {}."""
    try:
        with open(STORY_UI_F, encoding="utf-8") as f_:
            d_ = json.load(f_)
        return d_ if isinstance(d_, dict) else {}
    except Exception:
        return {}


def story_ui_save(ui):
    """Ghi nguyen tu (ghi file tam roi doi ten) de tat tool giua chung khong lam hong file."""
    tmp_ = STORY_UI_F + ".tmp"
    try:
        with _STORY_UI_LOCK:
            os.makedirs(DATA_DIR, exist_ok=True)
            with open(tmp_, "w", encoding="utf-8") as f_:
                json.dump(ui, f_, ensure_ascii=False)
            os.replace(tmp_, STORY_UI_F)
        return True
    except Exception:
        return False
CUR = {"id": ""}
_PLOCK = threading.Lock()


def proj_path(pid):
    return os.path.join(PROJ_DIR, re.sub(r"[^0-9A-Za-z_-]", "", pid) + ".json")


def proj_load(pid):
    try:
        return json.load(open(proj_path(pid), encoding="utf-8"))
    except Exception:
        return None


def proj_update(pid=None, **kw):
    pid = pid or CUR["id"]
    if not pid:
        return
    with _PLOCK:
        rec = proj_load(pid) or dict(id=pid, created=time.strftime("%Y-%m-%d %H:%M:%S"))
        rec.update(kw)
        try:
            os.makedirs(PROJ_DIR, exist_ok=True)
            tmp_ = proj_path(pid) + ".tmp"           # ghi nguyen tu: mat dien giua chung khong lam hong ban ghi
            with open(tmp_, "w", encoding="utf-8") as fh_:
                json.dump(rec, fh_, ensure_ascii=False)
                fh_.flush()
                try:
                    os.fsync(fh_.fileno())
                except Exception:
                    pass
            os.replace(tmp_, proj_path(pid))
        except Exception:
            pass


def _proj_group(r):
    """Khoa 'cung mot du an': cung tab + cung loi ke. Rong = khong gop."""
    tx = " ".join(str((r.get("o") or {}).get("text", "")).split())
    return (r.get("mode"), tx) if tx else None


def proj_list(dedupe=True):
    """Moi du an (cung tab + cung loi ke) chi liet ke MOT muc — ban moi nhat; cac ban trung cu bi an (khong xoa file)."""
    out, seen = [], set()
    for f in sorted(os.listdir(PROJ_DIR), reverse=True) if os.path.isdir(PROJ_DIR) else []:
        if f.endswith(".json"):
            try:
                r = json.load(open(os.path.join(PROJ_DIR, f), encoding="utf-8"))
                if r.get("mode") not in ("draw", "old"):             # du an cu chua luu 'mode': suy ra tu cai dat da luu
                    r["mode"] = "draw" if is_draw_tab(r.get("o") or {}) else "old"
                g = _proj_group(r)
                if dedupe and g is not None:
                    if g in seen:
                        continue
                    seen.add(g)
                r = {k: v for k, v in r.items() if k != "o"}
                out.append(r)
            except Exception:
                pass
    return out


def _inside(path, root):
    try:
        p, r = os.path.realpath(path), os.path.realpath(root)
        return p != r and (p == r or p.startswith(r + os.sep))
    except Exception:
        return False


def delete_project(pid):
    """Xoa HET du an: ban ghi + thu muc video/anh khung/phu de + anh khung trong bo nho + video. Cac ban trung cung loi ke (da bi an khoi danh sach) xoa luon.
    Chi xoa file nam trong thu muc video cua app / thu muc cache anh khung. Tra ve so muc da xoa."""
    rec = proj_load(pid) or {}
    g0 = _proj_group(dict(rec, mode=rec.get("mode") or ("draw" if is_draw_tab(rec.get("o") or {}) else "old")))
    ids = [pid]
    if g0 is not None:
        for f in (os.listdir(PROJ_DIR) if os.path.isdir(PROJ_DIR) else []):
            if f.endswith(".json") and f[:-5] != pid:
                try:
                    r = json.load(open(os.path.join(PROJ_DIR, f), encoding="utf-8"))
                    if r.get("mode") not in ("draw", "old"):
                        r["mode"] = "draw" if is_draw_tab(r.get("o") or {}) else "old"
                    if _proj_group(r) == g0:
                        ids.append(r.get("id") or f[:-5])
                except Exception:
                    pass
    cdir = os.path.join(DATA_DIR, "cache", "frames")
    import shutil as _sh
    for g in ids:
        r = proj_load(g) or {}
        od = r.get("out_dir") or (os.path.join(OUTDIR, r["folder"]) if r.get("folder") else "")
        if od and os.path.isdir(od) and _inside(od, OUTDIR):
            _sh.rmtree(od, ignore_errors=True)
        v = r.get("video")
        if v:
            vp = os.path.join(OUTDIR, v)
            if os.path.isfile(vp) and _inside(vp, OUTDIR):
                try:
                    os.remove(vp)
                except Exception:
                    pass
        for e in (r.get("frames_map") or []):
            try:
                p = e[1]
                if p and os.path.isfile(p) and _inside(p, cdir):
                    os.remove(p)
            except Exception:
                pass
        try:
            os.remove(proj_path(g))
        except Exception:
            pass
    return len(ids)


SAVE_DIR_F = os.path.join(DATA_DIR, "save_dir.txt")


def _save_dialog(default_name):
    """Hop thoai 'Luu thanh…' cua he thong (cua so WebView2 cua app; khong co thi Tk). Tra ve duong dan | '' (nguoi dung huy) | None (khong mo duoc hop thoai)."""
    try:
        start = open(SAVE_DIR_F, encoding="utf-8").read().strip()
    except Exception:
        start = ""
    if not (start and os.path.isdir(start)):
        start = os.path.join(os.path.expanduser("~"), "Videos") if os.path.isdir(os.path.join(os.path.expanduser("~"), "Videos")) else os.path.expanduser("~")
    try:
        import webview
        wins = getattr(webview, "windows", None) or []
        if wins:
            kind = webview.FileDialog.SAVE if hasattr(webview, "FileDialog") else webview.SAVE_DIALOG
            r = wins[0].create_file_dialog(kind, directory=start, save_filename=default_name, file_types=("Video MP4 (*.mp4)", "Tất cả (*.*)"))
            if not r:
                return ""
            return r if isinstance(r, str) else str(r[0])
    except Exception:
        pass
    try:
        import tkinter
        from tkinter import filedialog
        root = tkinter.Tk(); root.withdraw()
        try:
            root.attributes("-topmost", True)
        except Exception:
            pass
        r = filedialog.asksaveasfilename(initialdir=start, initialfile=default_name, defaultextension=".mp4", filetypes=[("Video MP4", "*.mp4"), ("Tất cả", "*.*")])
        root.destroy()
        return r or ""
    except Exception:
        return None


APPROVED_F = os.path.join(DATA_DIR, "cache", "approved.json")


def _approved():
    try:
        return set(json.load(open(APPROVED_F, encoding="utf-8")))
    except Exception:
        return set()


def _approve(names):
    try:
        s = _approved() | set(names)
        os.makedirs(os.path.dirname(APPROVED_F), exist_ok=True)
        json.dump(sorted(s), open(APPROVED_F, "w", encoding="utf-8"))
    except Exception:
        pass


def review_cb(paths):
    """Hien hinh Flow vua ve de nguoi dung duyet; tra ve danh sach ten can ve lai (rong = chap nhan).
    Hinh da duoc duyet o lan truoc (cung file) khong hoi lai -> chay lai khong bi ket cho duyet."""
    ok = _approved()
    paths = {n: p for n, p in paths.items() if os.path.basename(p) not in ok}
    if not paths:
        jlog("Các hình này đã được bạn duyệt trước đó, bỏ qua bước duyệt.")
        return []
    REV["ev"].clear(); REV["redo"] = []
    fr = JOB.get("frames") or []

    def cap(nm):
        try:
            return fr[int(nm.split()[-1]) - 1]["text"] if nm.startswith("Khung") else ""
        except Exception:
            return ""
    items = [dict(name=n, url="/cimg/" + os.path.basename(p), cap=cap(n)) for n, p in paths.items()]
    with LOCK:
        JOB["review"] = items
        JOB["msg"] = "⏸ CHỜ BẠN DUYỆT HÌNH — cuộn lên khung 'Duyệt hình Flow vừa vẽ' rồi bấm Dùng hoặc Vẽ lại"
    jlog("⏸ Hãy xem hình vừa vẽ ở khung 'Duyệt hình Flow vừa vẽ' (phía trên) rồi bấm Dùng hoặc Vẽ lại.")
    while not REV["ev"].wait(0.5):
        if CANCEL.is_set():
            raise RuntimeError("Đã dừng")
    redo = list(REV["redo"])
    _approve([os.path.basename(p) for n, p in paths.items() if n not in redo])
    with LOCK:
        JOB["review"] = []
    return redo


RES = {"ev": threading.Event(), "act": ""}


def fail_cb(o):
    """Buoc loi -> tam dung, UI hien Thu lai / Bo qua. Tra ve 'retry' | 'skip'."""
    def cb(what, err, skip, kind):
        if kind == "missing" and o.get("finish_now"):
            jlog(f"Dựng video ngay: {what}")
            return "skip"
        if kind == "missing" and o.get("auto_missing"):          # bam 'Tao lai' o khung: ve tiep luon cac khung chua co anh, khong hoi them
            jlog(f"Vẽ tiếp: {what}")
            return "retry"
        RES["ev"].clear(); RES["act"] = ""
        jlog(f"⚠ LỖI ở bước: {what} — {err}")
        with LOCK:
            JOB.update(state="paused", msg=f"Dừng ở bước: {what}", fail=dict(what=what, err=err, skip=skip, kind=kind))
        if kind == "flow":
            try:
                from . import flowgen
                flowgen.focus_flow()
            except Exception:
                pass
        while not RES["ev"].wait(0.5):
            if CANCEL.is_set():
                raise RuntimeError("Đã dừng")
        act = RES["act"]
        with LOCK:
            JOB.update(state="running", msg=("Thử lại: " if act == "retry" else "Bỏ qua: ") + what, fail=None)
        if act == "retry" and kind == "flow":
            try:
                from . import flowgen
                flowgen.recover(int(o.get("browser", 0)), jlog, soft=flowgen.is_ref_error(err))      # loi dinh anh tham chieu: trang van dung duoc -> KHONG tai lai tab, chi tai anh len lai
                if o.get("hide_flow", True):
                    flowgen.hide_flow()
            except Exception:
                pass
        return act
    return cb


def is_draw_tab(o):
    """Tab 'Ve ra' (TW StoryFlow): giao dien gui mode='draw' (du an cu chi co revfx thi suy ra tu hieu ung)."""
    from . import reveal
    return o.get("mode") == "draw" or (o.get("mode") is None and o.get("revfx") in reveal.PICKABLE)


def draw_match(text):
    """Du an 'Ve ra' moi nhat co CUNG loi ke (chi so sanh noi dung loi ke). None neu chua co."""
    tx = str(text or "").strip()
    best = None
    if not tx:
        return None
    for f in (os.listdir(PROJ_DIR) if os.path.isdir(PROJ_DIR) else []):
        try:
            r_ = json.load(open(os.path.join(PROJ_DIR, f), encoding="utf-8"))
            if str((r_.get("o") or {}).get("text", "")).strip() == tx and is_draw_tab(r_.get("o") or {}) and (best is None or r_.get("id", "") > best.get("id", "")):
                best = r_
        except Exception:
            pass
    return best


def match_info(r_):
    if not r_:
        return None
    done_ = max(int(r_.get("frames_done") or 0), len(r_.get("frames_idx") or {}))
    return dict(id=r_.get("id", ""), title=r_.get("title", ""), status=r_.get("status", ""), done=done_, total=int(r_.get("frames_total") or 0), video=r_.get("video", ""))


JOBT = [None]                              # luong run_job hien tai
STOP_WAIT = 25                             # giay toi da doi job cu thoat han sau khi bam Dung


def start_job(o):
    """Chay run_job o luong rieng, KHONG bao gio chay chong 2 job: neu job cu vua bi Dung ma luong chua thoat han thi doi no thoat roi moi chay.
    Tra ve False neu job cu van chua thoat sau 25 giay."""
    old = JOBT[0]
    if old is not None and old.is_alive():
        old.join(STOP_WAIT)
        if old.is_alive():
            return False
    t = threading.Thread(target=run_job, args=(o,), daemon=True)
    JOBT[0] = t
    t.start()
    return True


def run_job(o):
    if is_draw_tab(o) and not o.get("rescue"):         # Ve ra: Flow ve tron tung khung theo prompt chung + anh tham chieu; khong thoi dai / nhan vat mau
        o = dict(o, mode="draw", draw="flow", frames=True, flow_bg=False, mouth=False, era="", img_engine=(o.get("img_engine") if o.get("img_engine") in ("gemini", "chatgpt") else "flow"))
        nm_ = o.get("refimg_name") if o.get("use_ref") else ""
        if o.get("use_ref") and not nm_:
            nm_ = refimg_state().get("file") or ""
        o["refimg_name"] = nm_ if (nm_ and refimg_path(nm_)) else ""
    if o.get("rescue"):
        o = dict(o, ai_llm=o.get("ai", 0), ai=0, draw="none", frames=False, review=False)        # cuu video: khong can AI/Flow, chi ghep anh da co
    pid = o.get("project") or time.strftime("%Y%m%d_%H%M%S")
    CUR["id"] = pid
    base = {k: v for k, v in o.items() if k not in ("project", "finish_now", "resume", "redo_voice", "motion_only", "new", "reset_script", "redo_keep", "auto_missing", "restart_rec")}
    rst_ = dict(video="", frames_done=0, frames_total=0, frames_map=[], frames_idx={}, created=time.strftime("%Y-%m-%d %H:%M:%S")) if o.get("restart_rec") else {}          # tao lai de len du an cu: xoa dau vet lan chay truoc
    proj_update(pid, o=base, mode=("draw" if o.get("mode") == "draw" else "old"), title=(o.get("text", "").strip().splitlines() or [""])[0][:60], status="running", stage="bắt đầu", error="", **rst_)
    CANCEL.clear()
    try:
        from . import flowgen as _fg
        _fg.ABORT.clear()
        _fg.JOBLOG[0] = jlog          # moi thong bao cua Flow/tab (mo tab, gui khung, loi) hien o khung tien trinh
    except Exception:
        pass
    from . import resume
    resume.HOOK[0] = fail_cb(o)
    resume.SALT[0] = str(o.get("fresh_salt") or "")
    chargen.SALT[0] = str(o.get("fresh_salt") or o.get("fresh_img") or "")          # fresh_img: du an MOI tu dau -> ve lai het anh (khong lay anh cu trong bo nho), giong doc van dung lai
    chargen.ART[0] = o.get("art") if o.get("art") in ("2d", "stick") else "sticker"
    from . import templates
    chargen.PTPL[0] = templates.resolve(o)
    chargen.DIVERSE[0] = bool(o.get("diverse"))          # du an cu (khong co cai nay) giu nguyen nhan vat da ve
    MAN.clear()
    OLDMAP[:] = [] if o.get("reset_script") else [e for e in ((proj_load(pid) or {}).get("frames_map") or []) if isinstance(e, list) and len(e) == 2]
    o = dict(o, frame_map=[] if o.get("reset_script") else ((proj_load(pid) or {}).get("frames_map") or []),
             frame_idx={} if o.get("reset_script") else ((proj_load(pid) or {}).get("frames_idx") or {}))          # frame_idx: anh tung khung da luu trong du an (so khung -> [cau, duong dan])
    with LOCK:
        FRAME_PROMPTS.clear()
        if o.get("mode") == "draw" and not o.get("redo_keep"):
            PROMPT_OVR.clear()
        JOB.update(state="running", mode=("draw" if o.get("mode") == "draw" else "old"), project=pid, pct=0, msg="Bắt đầu…", log=[], video="", error="", srt="", review=[], fail=None, frames=[], result_mode="")
    try:
        from . import video
        text = o["text"]
        era = o.get("era") or ""
        use_flow = o.get("draw") == "flow"
        def ensure_flow():
            if FLOW["state"] != "ready":
                jlog("Đang kết nối Google Flow…", 6)
                flow_open(int(o.get("browser", 0)))
                t0 = time.time()
                while FLOW["state"] != "ready":
                    if FLOW["state"] == "error":
                        raise RuntimeError("Không mở được Flow: " + FLOW["msg"])
                    if CANCEL.is_set():
                        raise RuntimeError("Đã dừng")
                    if time.time() - t0 > 420:
                        raise RuntimeError("Chờ đăng nhập Flow quá lâu.")
                    jlog(FLOW["msg"])
                    time.sleep(1.5)
        cfg = llm.load_cfg()
        pbk_ = plan_backend(o, cfg) if o.get("mode") == "draw" and not o.get("rescue") and not legacy_len(o) else 0
        if int(o.get("ai", 0) or 0) == 5 or pbk_ == 5:
            ensure_flow()          # Gemini qua trinh duyet dung chung cua so voi Flow
        proj_update(stage="đọc truyện")
        jlog("Đang đọc và hiểu câu chuyện…", 2)
        saved_ = (proj_load(pid) or {}).get("script_text") if not o.get("reset_script") else None
        plan_ = None
        if saved_:
            text, note = saved_, "kịch bản đã lưu"
            jlog("Dùng kịch bản đã đọc/chia từ lần trước (không hỏi lại AI).")
            pr_ = proj_load(pid) or {}
            if isinstance(pr_.get("script_plan"), list):
                plan_ = dict(lines=pr_["script_plan"], visuals={int(k): v for k, v in (pr_.get("scene_visuals") or {}).items() if str(k).isdigit()})
        else:
            user_text_ = text
            text, note = llm.story_to_script(text, dict(cfg, backend=o.get("ai", 0), key=o.get("ai_key", ""), browser=int(o.get("browser", 0))), log=jlog)
            if o.get("mode") == "draw" and legacy_len(o):          # du an cu theo so ky tu: giu nguyen, khong dung AI
                text = templates.refine_script(text, legacy_len(o))
            elif o.get("mode") == "draw":          # tab Ve ra: cung bo nhan dien (loi dan, nhan vat, thoai) voi tab Tao Video Story, roi AI doc hieu truyen -> gom cau thanh canh theo nghia (~6 giay/canh) + mo ta hinh can ve. Chay ngam: loi thi gom bang quy tac offline.
                from . import dplan
                sp_ = max(0.5, float(o.get("speed") or 1.0))
                pc_ = dict(cfg, backend=pbk_, key=o.get("ai_key") or cfg.get("key", ""), browser=int(o.get("browser", 0)))
                proj_update(stage="phân tích truyện")
                plan_ = dplan.plan(text, pc_, log=jlog, wps=speech_wps(), speed=sp_, marks=looks_like_script(user_text_), ask=bool(pbk_))
                text = plan_["script"]
                nl_ = [l_["t"] for l_ in plan_["lines"] if not l_["cmd"]]
                jlog("Đã hiểu truyện: %d cảnh (khoảng %.1f giây lời đọc mỗi cảnh)%s." % (plan_["total"], est_secs(nl_, sp_, None) / max(1, plan_["total"]), (", %d cảnh do AI chia" % plan_["ai"]) if plan_["ai"] else ", chia theo nghĩa bằng quy tắc"))
            proj_update(script_text=text)
            if plan_:
                proj_update(script_plan=plan_["lines"], scene_visuals={str(k): v for k, v in plan_["visuals"].items()})
        if era:                     # thoi dai NGUOI DUNG chon luon thang: bo moi dong @era do AI tu them
            text = re.sub(r"(?im)^[ \t]*@(?:era|thoi ?dai|thời ?đại)\b.*\n?", "", text)
            text = f"@era {era}\n" + text
        lang = langs.pick(o.get("lang")) or "auto"
        sc = parse_script(text, lang)
        ttl_name = sc.title
        if not o.get("titlecard"):          # mac dinh KHONG chen the tieu de dau video
            sc.title, sc.subtitle = "", ""
        chargen.ensure_cast(sc, beats=o.get("mode") != "draw" or bool(o.get("rescue")))          # tab Ve ra: dong da gom thanh canh, KHONG tach lai moi cau
        if not sc.lines:
            raise ValueError("Không tìm thấy nội dung để dựng. Hãy dán truyện hoặc kịch bản.")
        share_, vis_ = {}, {}
        SHARED.clear()
        if o.get("mode") == "draw" and not o.get("rescue"):
            from . import dplan
            ids_ = dplan.align(sc.lines, plan_["lines"]) if plan_ else [None] * len(sc.lines)
            share_ = dplan.shares([l_.text for l_ in sc.lines], ids_)
            vis_ = dplan.line_visuals(ids_, share_, plan_["visuals"] if plan_ else {})
            SHARED.update(share_)
            if share_:
                jlog("%d dòng ngắn / cùng cảnh dùng chung ảnh với dòng trước (không vẽ riêng): chỉ vẽ %d ảnh." % (len(share_), len(sc.lines) - len(share_)))
        n_ai = 0
        if int(o.get("ai", 0) or 0):
            try:
                from . import vplan
                n_ai = vplan.apply(sc, dict(cfg, backend=int(o.get("ai", 0)), key=o.get("ai_key", ""), browser=int(o.get("browser", 0)), tabs=int(o.get("tabs", 3) or 1), beat=o.get("beat", "fine"), skip_cast=bool(o.get("frames", True)) and o.get("draw") == "flow"), jlog)
                jlog(f"AI đạo diễn hình ảnh hiểu {n_ai}/{len(sc.lines)} câu → {len(sc.scenes)} cảnh.")
            except Exception as e:
                if str(e) == "Đã dừng":
                    raise
                jlog("AI đạo diễn hình ảnh lỗi, dùng nhận diện offline: " + str(e)[:100])
        if n_ai:
            o["scene_cfg"] = []
        jlog(f"Nhận diện: {len(sc.lines)} câu, {len(sc.scenes)} cảnh, {len(sc.chars)} nhân vật ({', '.join(list(sc.chars)[:6])})", 5)
        use_flow = o.get("draw") == "flow"
        flow_needed = use_flow          # ca Flow lan Gemini (tab trinh duyet) deu can trinh duyet da dang nhap Google; tab Ve ra chon engine nao thi ve bang engine do
        icfg = dict(scene_cfg=o.get("scene_cfg") or [], img_backend=4 if use_flow else 0, ai_bg=bool(o.get("flow_bg")) and use_flow, style="sticker", lang=sc.lang, aspect=o.get("aspect", "16:9"), frames=bool(o.get("frames", True)) and use_flow, mouth=bool(o.get("mouth", True)), browser=o.get("browser", 0), variants=bool(o.get("variants", True)), actions=bool(o.get("acts", True)), inserts=bool(o.get("acts", True)), flow_tabs=int(o.get("flow_tabs", 1) or 1), motion=o.get("motion", "off"), motion_max=int(o.get("motion_max") or 15), motion_safe=o.get("motion_safe", True) is not False, motion_engine=("vids" if o.get("motion_engine") == "vids" else "ltx"), vids_url=(o.get("vids_url") or "").strip(), motion_lvl=("soft" if o.get("motion_lvl") == "soft" else "clear"), frame_map=o.get("frame_map") or [], frame_idx=o.get("frame_idx") or {}, llm=dict(cfg, backend=int(o.get("ai_llm", o.get("ai", 0)) or 0), key=o.get("ai_key", ""), browser=int(o.get("browser", 0))))
        from . import flowgen as _fgl
        _fgl.REF_LAX = bool(o.get("ref_lax")) or os.environ.get("ANIMSTUDIO_REF_LAX") == "1"      # dinh anh mau loi: mac dinh DUNG bao loi (khong ve nham nhan vat)
        if o.get("mode") == "draw" and not o.get("rescue"):
            icfg.update(share=share_, visuals=vis_, draw_mode=True, img_engine=(o.get("img_engine") if o.get("img_engine") in ("gemini", "chatgpt") else "flow"), prompts=FRAME_PROMPTS, prompt_ovr=PROMPT_OVR, refimg=refimg_path(o.get("refimg_name")) if o.get("use_ref") else "", common=templates.common_prompt(o), mouth=False)
        icfg["progress"] = frame_cb
        icfg["cancel"] = CANCEL
        if use_flow and o.get("review", True):
            icfg["review"] = review_cb
        if flow_needed:
            ensure_flow()
        if flow_needed and not o.get("hide_flow", True):
            try:
                from . import flowgen as _fgh
                _fgh.set_hide(False)
            except Exception:
                pass
        if flow_needed and o.get("hide_flow", True):
            try:
                from . import flowgen
                flowgen.hide_flow()
            except Exception:
                pass
        proj_update(stage="giọng đọc")
        jlog("Đang tạo giọng đọc…", 10)
        nv_ = str(o.get("narrator") or "")
        tts.VOICE_CHOICE.update(narrator="" if nv_.startswith("auto:") else nv_, auto=nv_[5:] if nv_.startswith("auto:") else "")
        prov, prov_id = get_provider(provider_idx(o), jlog)
        au = synth_patient(sc, prov, prov_id, None if lang == "auto" else lang, o, CANCEL)
        if prov_id != PROVIDERS[2] and not getattr(prov, "fell_back", False):
            learn_wps(sc, au, o.get("speed", 1.0), None if lang == "auto" else lang)
        for w in getattr(prov, "warn", []):
            jlog("⚠ " + w)
        dsec = float(o.get("dsec") or 0)
        secs = [float((c or {}).get("secs") or dsec or 0) for c in (o.get("scene_cfg") or [])]
        secs += [dsec] * (len(sc.scenes) - len(secs))
        fs_ = None                                              # tab 'Ve ra' + hieu ung ve + thoi gian ve tu dong: khung dau bat dau ve tu giay 0 (r2d.render_frames) -> giong cau dau cung vao ngay luc do
        if is_draw_tab(o) and o.get("revfx") in _reveal.KEYS and o.get("revfx") != "none" and o.get("revauto", True) not in (False, 0, "0", "false"):
            fs_ = DRAW_FIRST_START
        P = build_project(sc, au, "2d", o.get("aspect", "16:9"), o.get("res", "720p"), int(o.get("fps", 30)), scene_secs=secs, first_start=fs_)
        if not langs.subs_ok(getattr(sc, "lang", "")) and o.get("subs", True):
            jlog("⚠ Phụ đề %s cần thư viện raqm (bản Pillow trên Windows thường không có) nên KHÔNG chèn vào video; dùng file .srt xuất kèm." % langs.LABEL.get(sc.lang, sc.lang).split(" — ")[0])
        P.camfx = o.get("camfx") or "auto"
        P.sub_style = o.get("sub_style") if isinstance(o.get("sub_style"), dict) else None
        P.inset = DRAW_INSET if is_draw_tab(o) else 0.0           # tab 'Ve ra': canh thu nho vao trong khung (chua le, phu de nam o le duoi)
        P.fxmode = o.get("fxmode") if o.get("fxmode") in ("auto", "on", "off") else ("off" if is_draw_tab(o) else "auto")          # tab Story: tu phu theo loi doc; tab Ve ra (anh bang trang): khong phu
        P.fxamt = max(0, min(100, int(o.get("fxamt", 40) or 0)))
        P.fxlook = o.get("fxlook") if o.get("fxlook") in ("old", "war", "sepia", "vhs") else "none"
        P.fx_era = getattr(sc, "era", "modern")
        P.fx_final = False
        P.camstr = {"soft": 0.6, "normal": 1.0, "strong": 1.5}.get(o.get("camstr") or "normal", 1.0)
        P.camshake = bool(o.get("shake")) and bool(o.get("shake2"))
        apply_reveal(P, o)
        if not o.get("rescue"):
            prepare_props(P.revfx, flow_needed and o.get("img_engine") not in ("gemini", "chatgpt"), o.get("browser", 0))          # hinh tay/cau be cho hieu ung: chi nho Flow khi dang chon Flow
        errs = []
        if o.get("rescue"):
            from . import rescue
            proj_update(stage="ghép ảnh đã vẽ (cứu video)")
            rescue.build_frames(P, int(o["rescue"]), int(o.get("rescue_cluster") or 0), jlog)
            try:      # luu "anh nao ung voi doan loi nao" de lan sau bam Tiep tuc / doc lai kich ban van khop anh, khong ve lai
                proj_update(frames_map=[[" ".join(l_.text for l_ in P.lines if l_.start < f_["end"] and l_.end > f_["start"]) or f_["line"].text, f_["path"]] for f_ in P.frames])
            except Exception:
                pass
        else:
            jlog("Đang chuẩn bị nhân vật…" + (" (Flow vẽ từng nhân vật, mỗi nhân vật khoảng 30–60 giây)" if use_flow else ""), 26)
        proj_update(stage="vẽ nhân vật / khung hình")
        want_mouth = bool(icfg.get("mouth")) and bool(icfg.get("frames"))
        want_motion = (icfg.get("motion") or "off") != "off" and (bool(icfg.get("frames")) or bool(o.get("rescue")))
        if want_mouth or want_motion:
            icfg["extras_later"] = True          # xuat video co ban truoc, phan phu (mieng mo / chuyen dong AI) lam sau
        if not o.get("rescue"):
            icfg["redo_poll"] = redo_poll
            REDOQ.clear(); DRAWING[0] = True
            try:
                chargen.attach(P, sc, icfg, log=lambda m: (jlog(m), errs.append(m) if "lỗi" in m.lower() else None))
            finally:
                DRAWING[0] = False
            if use_flow and not (want_mouth or want_motion) and not CANCEL.is_set():
                close_draw_browser(jlog)                 # ve xong ca khung -> dong cac tab ve truoc khi dung video (nhe may); phan phu (mieng mo / chuyen dong AI) can thi tool tu mo lai
        title = (ttl_name or sc.title or sc.lines[0].text[:30]).strip()
        safe = "".join(c for c in title if c.isalnum() or c in " _-").strip()[:40] or "video"
        folder = f"{safe}_{pid}"                       # MOI DU AN MOT THU MUC RIENG: video + phu de + anh khung
        pdir = os.path.join(OUTDIR, folder)
        os.makedirs(pdir, exist_ok=True)
        proj_update(folder=folder, out_dir=pdir)
        def export_frames():
            try:
                import shutil as _sh
                fd = os.path.join(pdir, "anh_khung")
                os.makedirs(fd, exist_ok=True)
                for k_, f_ in enumerate(getattr(P, "frames", None) or [], 1):
                    for key_, suf_ in (("path", ""), ("path2", "_mieng_mo")):
                        src_ = f_.get(key_)
                        if src_ and os.path.isfile(src_):
                            dst_ = os.path.join(fd, f"{k_:04d}{suf_}{os.path.splitext(src_)[1] or '.png'}")
                            if not os.path.exists(dst_) or os.path.getsize(dst_) != os.path.getsize(src_):
                                _sh.copyfile(src_, dst_)
                    c_ = f_.get("clip")
                    if c_ and os.path.isfile(str(c_)):
                        dst_ = os.path.join(fd, f"{k_:04d}_chuyen_dong{os.path.splitext(str(c_))[1] or '.mp4'}")
                        if not os.path.exists(dst_):
                            _sh.copyfile(c_, dst_)
            except Exception as ex_:
                jlog("(không chép được ảnh khung vào thư mục dự án: " + str(ex_)[:80] + ")")
        export_frames()
        name = f"{folder}/{safe}_{o.get('aspect', '16:9').replace(':', 'x')}_{time.strftime('%H%M%S')}.mp4"
        out = os.path.join(OUTDIR, name)
        proj_update(stage="trộn âm thanh + dựng video")
        mk = lambda path: video.make_video(P, path, progress=lambda i, n, m: jlog(m, 35 + 64 * i / max(n, 1)), cancel=CANCEL, music=bool(o.get("music", True)),
                                           ambience=bool(o.get("amb", True)), burn_subs=bool(o.get("subs", True)), srt=bool(o.get("srt", True)))
        P.fx_final = not icfg.get("extras_later")      # khong con phan phu (mieng mo / chuyen dong AI) = video nay LA ban hoan thien -> phu hieu ung + kieu phim; con phan phu thi de ban hoan thien sau phu
        fx_wanted = fx.weather_on(P) or getattr(P, "fxlook", "none") != "none"
        m_only = bool(o.get("motion_only")) and bool(icfg.get("extras_later")) and bool(getattr(P, "frames", None))
        if m_only:
            jlog("Chế độ chỉ tạo chuyển động AI: bỏ qua dựng video cơ bản (dùng lại ảnh/giọng đã lưu).", 30)
        else:
            mk(out)
            proj_update(status="video", stage="đã có video", video=name, out_dir=pdir)
        if icfg.get("extras_later") and getattr(P, "frames", None):
            if not m_only:
                with LOCK:
                    JOB.update(video=name, msg="Đã có video cơ bản. Đang làm thêm phần phụ (miệng mở / chuyển động AI)…")
                jlog("✔ Đã có video cơ bản: " + out + " — đang làm phần phụ, có thể dừng bất cứ lúc nào, video cơ bản vẫn còn.", 99)
            try:
                if want_mouth:
                    proj_update(stage="vẽ khung miệng mở")
                    chargen.make_mouth(P, sc, icfg, jlog)
                if want_motion:
                    proj_update(stage="chuyển động AI (Google Vids)")
                    chargen.make_motion(P, sc, icfg, jlog)
                if m_only and not any(f.get("clip") for f in P.frames) and not fx_wanted:
                    jlog("Không tạo được clip chuyển động nào nên dựng video thường.")
                    mk(out)
                    proj_update(status="video", stage="đã có video", video=name, out_dir=pdir)
                elif any(f.get("path2") or f.get("clip") for f in P.frames) or fx_wanted:
                    P.fx_final = True
                    name2 = name.replace(".mp4", "_v2.mp4")
                    out2 = os.path.join(OUTDIR, name2)
                    export_frames()
                    proj_update(stage="dựng lại video có phần phụ")
                    mk(out2)
                    name = name2
                    out = out2
            except Exception as e2:
                if str(e2) == "Đã dừng":
                    jlog("Đã dừng phần phụ; video cơ bản vẫn dùng được.")
                else:
                    jlog("Phần phụ lỗi, giữ video cơ bản: " + str(e2)[:120])
            if use_flow and (want_mouth or want_motion) and not CANCEL.is_set():
                close_draw_browser(jlog)
        with LOCK:
            JOB.update(state="done", pct=100, msg="Xong!", video=name)
        proj_update(status="done", stage="hoàn thành", video=name, out_dir=pdir)
        jlog("Xong: " + out, 100)
    except Exception as e:
        with LOCK:
            JOB.update(state="error", error="Đã dừng." if str(e) == "Đã dừng" else str(e)[:600])
        proj_update(status="stopped" if str(e) == "Đã dừng" else "error", error=str(e)[:300])
        if str(e) != "Đã dừng":
            jlog("LỖI: " + traceback.format_exc()[-700:])
    finally:
        if o.get("mode") == "draw" and MAN:
            try:
                save_frames(force=True)          # dung / loi / xong: ghi not cac khung vua ve (ghi thua 0.4 giay/lan luc dang chay)
            except Exception:
                pass
        try:
            from . import flowgen as _fg2
            _fg2.ABORT.clear()
            _fg2.JOBLOG[0] = None
        except Exception:
            pass


# ---------------------------------------------------------------- HTTP
def samples():
    d = os.path.join(APP_DIR, "samples")
    out = []
    for f in sorted(os.listdir(d)) if os.path.isdir(d) else []:
        if f.endswith(".txt"):
            out.append(dict(name=f[:-4].replace("_", " "), text=open(os.path.join(d, f), encoding="utf-8").read()))
    return out


def era_previews():
    pick = {"modern": ["modern_nam_cong_so", "modern_nu_cong_so", "modern_ong_kinh"]}
    return {k: [f"/lib/{n}.png" for n in v if os.path.exists(os.path.join(chargen.LIB, n + ".png"))] for k, v in pick.items()}


REF_DIR = os.path.join(DATA_DIR, "refimg")


def refimg_state():
    """Anh tham chieu hien tai cua tab 'Ve ra' (dung cho MOI canh): dict(has, name, file, kb, w, h, ts)."""
    try:
        with open(os.path.join(REF_DIR, "current.json"), encoding="utf-8") as f:
            j = json.load(f)
        p = os.path.join(REF_DIR, os.path.basename(str(j.get("file", ""))))
        if not os.path.isfile(p):
            return dict(has=False)
        from PIL import Image
        with Image.open(p) as im:
            w, h = im.size
        return dict(has=True, name=str(j.get("name", ""))[:80], file=os.path.basename(p), kb=max(1, os.path.getsize(p) // 1024), w=w, h=h, ts=int(os.path.getmtime(p)))
    except Exception:
        return dict(has=False)


def refimg_path(file=None):
    """Duong dan file anh tham chieu ('' = khong co). file = ten file da luu cua du an cu (neu con)."""
    f = os.path.basename(str(file or refimg_state().get("file") or ""))
    p = os.path.join(REF_DIR, f) if f else ""
    return p if p and os.path.isfile(p) else ""


def refimg_save(data, name=""):
    """Luu anh tham chieu tu byte anh (png/jpg/webp...): bo nen trong suot -> nen trang, toi da 2048px, ten file theo noi dung (doi anh = khung moi, khong dung nham khung cu)."""
    import io, hashlib
    from PIL import Image
    if not data or len(data) > 20 * 1024 * 1024:
        raise ValueError("Ảnh trống hoặc quá lớn (tối đa 20MB).")
    im = Image.open(io.BytesIO(data))
    im.load()
    if im.mode in ("RGBA", "LA", "P"):
        im = im.convert("RGBA")
        bg = Image.new("RGBA", im.size, (255, 255, 255, 255))
        bg.alpha_composite(im)
        im = bg
    im = im.convert("RGB")
    if max(im.size) > 2048:
        sc = 2048.0 / max(im.size)
        im = im.resize((max(1, int(im.width * sc)), max(1, int(im.height * sc))), Image.LANCZOS)
    buf = io.BytesIO()
    im.save(buf, "PNG")
    fn = "ref_" + hashlib.md5(buf.getvalue()).hexdigest()[:12] + ".png"
    os.makedirs(REF_DIR, exist_ok=True)
    with open(os.path.join(REF_DIR, fn), "wb") as f:
        f.write(buf.getvalue())
    with open(os.path.join(REF_DIR, "current.json"), "w", encoding="utf-8") as f:
        json.dump(dict(file=fn, name=os.path.basename(str(name or "")) or "anh_tham_chieu.png"), f, ensure_ascii=False)
    return refimg_state()


def refimg_clear():
    try:
        os.remove(os.path.join(REF_DIR, "current.json"))
    except OSError:
        pass


_PREV = {}


def _prev_scene(variant, size):
    """Canh mau trung tinh de XEM THU hieu ung khi chua co khung that: khoi mau phang + mui ten tren nen don sac (KHONG dung nhan vat mau)."""
    from PIL import Image, ImageDraw
    W, H = size
    k = 2
    bg = (255, 255, 255) if variant == 0 else (226, 236, 246)
    im = Image.new("RGB", (W * k, H * k), bg)
    d = ImageDraw.Draw(im)
    ink, w = (34, 34, 42), 5 * k
    pal = [(231, 76, 60), (244, 196, 48), (74, 144, 226), (96, 186, 120)] if variant == 0 else [(155, 120, 200), (240, 150, 90), (90, 190, 190), (200, 90, 130)]
    X, Y, U = W * k, H * k, W * k / 100.0
    d.rounded_rectangle([8 * U, 8 * U / 1.78, 92 * U, 20 * U / 1.78], 2 * U, fill=pal[0], outline=ink, width=w)      # tieu de
    for i in range(3):                                                                                              # 3 the y chinh
        x0 = (8 + i * 29.5) * U
        d.rounded_rectangle([x0, 26 * U / 1.78, x0 + 25 * U, 84 * U / 1.78], 2.5 * U, fill=pal[1 + i], outline=ink, width=w)
        cx, cy = x0 + 12.5 * U, 46 * U / 1.78
        d.ellipse([cx - 6 * U, cy - 6 * U / 1.0, cx + 6 * U, cy + 6 * U / 1.0], fill=(255, 255, 255), outline=ink, width=w)
        for j in range(3):
            yy = (66 + j * 5.5) * U / 1.78
            d.line([x0 + 4 * U, yy, x0 + (21 - 3 * j) * U, yy], fill=ink, width=w)
    for i in range(2):                                                                                              # mui ten giua cac the
        ax = (33.5 + i * 29.5) * U
        ay = 55 * U / 1.78
        d.polygon([(ax - 1.6 * U, ay - 1.2 * U), (ax + 0.2 * U, ay - 1.2 * U), (ax + 0.2 * U, ay - 2.6 * U), (ax + 2.6 * U, ay), (ax + 0.2 * U, ay + 2.6 * U), (ax + 0.2 * U, ay + 1.2 * U), (ax - 1.6 * U, ay + 1.2 * U)], fill=ink)
    return im.resize((W, H), Image.LANCZOS)


def _prev_pair(size):
    """(anh cu, anh moi) de xem thu: 2 khung moi nhat DA VE THAT cua ban (cache/frames) neu co, khong thi canh mau trung tinh."""
    from PIL import Image
    d = os.path.join(DATA_DIR, "cache", "frames")
    ims = []
    try:
        fs = sorted((os.path.join(d, f) for f in os.listdir(d) if f.lower().endswith(".png") and not f.startswith("cast_")), key=os.path.getmtime, reverse=True)
        for f in fs[:8]:
            try:
                im = Image.open(f).convert("RGB")
            except Exception:
                continue
            if min(im.size) >= 200:
                c = Image.new("RGB", size, (255, 255, 255))
                sc = min(size[0] / im.width, size[1] / im.height)
                im = im.resize((max(1, int(im.width * sc)), max(1, int(im.height * sc))), Image.LANCZOS)
                c.paste(im, ((size[0] - im.width) // 2, (size[1] - im.height) // 2))
                ims.append(c)
            if len(ims) == 2:
                break
    except OSError:
        pass
    if len(ims) == 2:
        return ims[1], ims[0], True
    return _prev_scene(1, size), _prev_scene(0, size), False


def _prev_pair_sig():
    d = os.path.join(DATA_DIR, "cache", "frames")
    try:
        fs = sorted((os.path.join(d, f) for f in os.listdir(d) if f.lower().endswith(".png") and not f.startswith("cast_")), key=os.path.getmtime, reverse=True)[:2]
        return [(f, os.path.getmtime(f)) for f in fs]
    except OSError:
        return []


def reveal_preview(kind, secs, size=(480, 270), dirn="auto"):
    """GIF xem thu hieu ung 'kind' chay trong 'secs' giay tren canh mau (anh cu -> anh moi). secs = None -> thoi gian tu dong cho cau dai ~6 giay.
    dirn = 'lr'|'rl'|'tb'|'bt' -> 1 luot theo huong do; 'auto' (kieu co huong) -> 3 luot lien tiep, moi luot mot huong khac (trai->phai, tren->xuong, phai->trai), luot le chay tranh moi -> tranh cu.
    Nho theo (kieu, thoi gian, huong, hinh mau). Tra ve bytes hoac None."""
    import io
    from . import reveal, props, sprites
    if kind not in reveal.KEYS:
        return None
    dirn = dirn if dirn in reveal.DIRS else "auto"
    if secs is None:
        secs = reveal.auto_dur(kind, 6.0)
    fps = 12
    n = int(max(8, min(72, round(float(secs) * fps))))
    multi = dirn == "auto" and kind in reveal.DIRECTIONAL
    sig = (kind, n, dirn, tuple((x["key"], x["ts"]) for x in props.state()), tuple(_prev_pair_sig()))
    if sig in _PREV:
        return _PREV[sig]
    old, new, _real = _prev_pair(size)
    frames = [old] * 5
    passes = 3 if multi else 1
    shown = old                                                         # khung dang hien truoc luot nay (ve tay co thu nho thi la tranh co nho, khong phai anh day khung)
    for j in range(passes):
        a, b = (old, new) if j % 2 == 0 else (new, old)
        hold = reveal.compose(kind, 1.0, shown, b, j, dirn)
        frames += [reveal.compose(kind, (i + 0.5) / n, shown, b, j, dirn) for i in range(n)] + [hold] * (8 if j < passes - 1 else 10)
        shown = hold
    buf = io.BytesIO()
    frames[0].save(buf, "GIF", save_all=True, append_images=frames[1:], duration=int(1000 / fps), loop=0, optimize=False)
    r = buf.getvalue()
    if len(_PREV) > 24:
        _PREV.clear()
    _PREV[sig] = r
    return r


def _under_out(rel):
    p = os.path.normpath(os.path.join(OUTDIR, unquote(rel).replace("\\", "/")))
    return p if p.startswith(os.path.normpath(OUTDIR)) else os.path.join(OUTDIR, "_none")


LIC_GATED = ("/api/generate", "/api/frame/redo", "/api/props/make")      # viec tao video / ve anh can ban quyen (het dung thu thi khoa); xem, nhap key, Nghe thu, doc du an van mo


def lic_state():
    """Trang thai ban quyen dang JSON (ngay -> chuoi)."""
    s = dict(licensing.status())
    if s.get("expiry"):
        s["expiry"] = s["expiry"].isoformat()
    return s


def lic_block():
    """None = duoc dung; ngược lại thong bao chan (kem huong dan nhap key)."""
    try:
        s = licensing.status()
    except Exception:
        traceback.print_exc()
        return None                  # loi doc ban quyen la loi cua tool, khong chan nguoi dung
    if s.get("ok"):
        return None
    return (s.get("msg") or "Cần key bản quyền.") + " Bấm tab «🔑 Bản quyền» ở đầu trang để lấy mã máy và nhập key."


class H(BaseHTTPRequestHandler):
    def log_message(self, *a):
        pass

    def _send(self, code, body, ctype="application/json; charset=utf-8", extra=None):
        if isinstance(body, (dict, list)):
            body = json.dumps(body, ensure_ascii=False).encode("utf-8")
        elif isinstance(body, str):
            body = body.encode("utf-8")
        self.send_response(code)
        self.send_header("Content-Type", ctype)
        self.send_header("Content-Length", str(len(body)))
        for k, v in (extra or {}).items():
            self.send_header(k, v)
        self.end_headers()
        self.wfile.write(body)

    def _file(self, path):
        if not os.path.isfile(path):
            return self._send(404, "not found", "text/plain")
        size = os.path.getsize(path)
        ctype = mimetypes.guess_type(path)[0] or "application/octet-stream"
        rng = self.headers.get("Range")
        start, end = 0, size - 1
        code = 200
        if rng and rng.startswith("bytes="):
            a, _, b = rng[6:].partition("-")
            start = int(a or 0); end = int(b) if b else size - 1; code = 206
        self.send_response(code)
        self.send_header("Content-Type", ctype); self.send_header("Accept-Ranges", "bytes")
        self.send_header("Content-Length", str(end - start + 1))
        if code == 206:
            self.send_header("Content-Range", f"bytes {start}-{end}/{size}")
        self.end_headers()
        with open(path, "rb") as f:
            f.seek(start); left = end - start + 1
            while left > 0:
                chunk = f.read(min(1 << 20, left))
                if not chunk:
                    break
                try:
                    self.wfile.write(chunk)
                except Exception:
                    return
                left -= len(chunk)

    def do_GET(self):
        u = urlparse(self.path).path
        if u == "/":
            return self._send(200, PAGE, "text/html; charset=utf-8")
        if u in ("/draw", "/draw/"):
            return self._send(200, DRAW_PAGE, "text/html; charset=utf-8")
        if u in ("/license", "/license/"):
            return self._send(200, LICENSE_PAGE, "text/html; charset=utf-8")
        if u == "/api/license":
            return self._send(200, dict(status=lic_state(), machine=licensing.machine_code(), contact=licensing.CONTACT, price=licensing.PRICE_TEXT))
        if u == "/api/voices":          # danh sach giong Microsoft that (tai xong sau khi mo trang): trang hoi lai den khi co
            return self._send(200, dict(ms=[list(x) for x in langs.voice_rows()], nar=dict(langs.NARRATOR), cat=langs.catalog_size()))
        if u == "/api/init":
            try:
                tts.catalog_wait(1.5)
            except Exception:
                pass
            return self._send(200, dict(version=__version__, eras=ERAS, previews=era_previews(), samples=samples(), voices=voice_list(), mine=[[k, l] for k, l, _p in tts.custom_voices()], own=[k for k, _l, p_ in tts.custom_voices() if os.path.dirname(p_) == tts.user_voice_dir()], outdir=OUTDIR,
                                        vp=[[n, d, g] for n, d, g, _r in tts.VIENEU_PRESETS], ms=[list(x) for x in langs.voice_rows()], nar=dict(langs.NARRATOR), cat=langs.catalog_size(), az=azure_state(),
                                        browsers=__import__("animstudio.flowgen", fromlist=["x"]).BROWSERS))
        if u == "/api/rescue/clusters":
            from . import rescue
            return self._send(200, dict(clusters=rescue.summary()))
        if u == "/api/projects":
            return self._send(200, dict(projects=proj_list(), outdir=OUTDIR))
        if u == "/api/status":
            with LOCK:
                return self._send(200, dict(JOB=JOB, FLOW=FLOW, PROPS=PROPS))
        if u == "/api/props":
            from . import props
            return self._send(200, dict(props=props.state()))
        if u == "/api/fonts":
            from . import common
            return self._send(200, dict(fonts=common.sub_fonts(), dir=common.USER_FONT_DIR))
        if u == "/api/fontfile":
            from . import common
            fid_ = (parse_qs(urlparse(self.path).query).get("id") or [""])[0]
            fp_ = os.path.join(common.USER_FONT_DIR, os.path.basename(fid_[2:])) if fid_.startswith("u:") else common.bundled_font_path(fid_)
            return self._file(fp_) if fp_ and os.path.isfile(fp_) else self._send(404, "not found", "text/plain")
        if u == "/api/drawui":
            ui_ = llm.load_cfg().get("draw_ui")
            return self._send(200, dict(ui=ui_ if isinstance(ui_, dict) else {}))
        if u == "/api/storyui":
            return self._send(200, dict(ui=story_ui_load()))
        if u == "/api/imgkey":
            c_ = llm.load_cfg()
            k_ = str(c_.get("img_key") or "")
            return self._send(200, dict(has=bool(k_), last4=k_[-4:] if k_ else "", model=c_.get("img_model") or "gemini-2.5-flash-image"))
        if u == "/api/frame/prompt":
            n_ = int((parse_qs(urlparse(self.path).query).get("n") or ["0"])[0] or 0) - 1
            return self._send(200, dict(prompt=FRAME_PROMPTS.get(n_, ""), edited=n_ in PROMPT_OVR))
        if u == "/api/voice/sample.wav":
            return self._file(os.path.join(DATA_DIR, "cache", "voice_sample.wav"))
        if u == "/api/refimg":
            return self._send(200, refimg_state())
        if u == "/api/refimg.png":
            rp = refimg_path()
            return self._file(rp) if rp else self._send(404, "not found", "text/plain")
        if u == "/api/revprev":
            q_ = parse_qs(urlparse(self.path).query)
            try:
                d_ = (q_.get("d") or ["1.6"])[0]
                g = reveal_preview((q_.get("k") or [""])[0], None if d_ == "auto" else float(d_), dirn=(q_.get("dir") or ["auto"])[0])
            except Exception:
                g = None
            return self._send(200, g, "image/gif") if g else self._send(404, "not found", "text/plain")
        if u == "/api/prop.png":
            from . import props
            k = (parse_qs(urlparse(self.path).query).get("k") or [""])[0]
            if props.exists(k):
                return self._file(props.png_path(k))
            return self._send(404, "not found", "text/plain")
        if u.startswith("/cimg/"):
            fn = os.path.basename(unquote(u))
            p1 = os.path.join(chargen.CACHE, fn)
            if os.path.isfile(p1):
                return self._file(p1)
            for sub in ("bg", "frames", "ins"):
                p2 = os.path.join(DATA_DIR, "cache", sub, fn)
                if os.path.isfile(p2):
                    return self._file(p2)
            return self._send(404, "not found", "text/plain")
        if u.startswith("/lib/"):
            return self._file(os.path.join(chargen.LIB, os.path.basename(unquote(u))))
        if u.startswith("/out/") or u.startswith("/dl/"):
            return self._file(_under_out(u.split("/", 2)[2]))
        self._send(404, "not found", "text/plain")

    def do_POST(self):
        u = urlparse(self.path).path
        n = int(self.headers.get("Content-Length", 0) or 0)
        o = json.loads(self.rfile.read(n).decode("utf-8")) if n else {}
        if u == "/api/license/activate":
            ok_, msg_ = licensing.activate(str(o.get("key") or ""))
            return self._send(200, dict(ok=True, msg=msg_, status=lic_state()) if ok_ else dict(ok=False, error=msg_))
        if u in LIC_GATED:
            blk_ = lic_block()
            if blk_:
                return self._send(200, dict(error=blk_, license=True))
        if u == "/api/draw/match":
            return self._send(200, dict(match=match_info(draw_match(o.get("text")))))
        if u == "/api/generate":
            if JOB["state"] in ("running", "paused"):
                if not CANCEL.is_set():
                    return self._send(409, dict(error="Đang có video được dựng."))
                t_old = JOBT[0]                                   # vua bam Dung: doi tien trinh cu dung han (toi da 25 giay) roi moi cho chay tiep
                if t_old is not None and t_old.is_alive():
                    t_old.join(STOP_WAIT)
                if JOB["state"] in ("running", "paused") and t_old is not None and t_old.is_alive():
                    return self._send(409, dict(error="Đang dừng tiến trình cũ, đợi vài giây rồi bấm Tiếp tục lại."))
            if o.get("resume"):
                ov = o.get("override") or {}
                rec = proj_load(str(o["resume"]))
                if not rec or not rec.get("o"):
                    return self._send(200, dict(error="Không tìm thấy dự án."))
                if o.get("finish_now") and is_draw_tab(rec["o"]) and not o.get("rescue") and int(rec.get("frames_done") or 0) < int(rec.get("frames_total") or 0):
                    return self._send(200, dict(error="Chưa đủ ảnh: mới có %d/%d cảnh. Bấm Tiếp tục để vẽ nốt, đủ ảnh mới hoàn thành được video." % (int(rec.get("frames_done") or 0), int(rec.get("frames_total") or 0))))
                o = dict(rec["o"], project=rec["id"], finish_now=bool(o.get("finish_now")), rescue=int(o.get("rescue") or 0), rescue_cluster=int(o.get("rescue_cluster") or 0))
                if is_draw_tab(o) and not o.get("finish_now") and not o.get("rescue") and not (ov or {}).get("redo_voice"):
                    o["auto_missing"] = True                      # bam «Tiep tuc» o tab Ve ra = ve not cac khung thieu luon (khong hoi them 'Ve tiep cac canh con thieu' / 'Dung video ngay')
                for k, v in (ov or {}).items():
                    o[k] = v
            elif not o.get("new") and not o.get("rescue"):
                tx = str(o.get("text", "")).strip()
                best = None
                for f in (os.listdir(PROJ_DIR) if os.path.isdir(PROJ_DIR) else []):
                    try:
                        r_ = json.load(open(os.path.join(PROJ_DIR, f), encoding="utf-8"))
                        if str((r_.get("o") or {}).get("text", "")).strip() == tx and tx and is_draw_tab(r_.get("o") or {}) == is_draw_tab(o) and (best is None or r_.get("id", "") > best.get("id", "")):
                            best = r_
                    except Exception:
                        pass
                if best and is_draw_tab(o) and match_info(best)["done"] > 0 and not o.get("restart_ok"):
                    m_ = match_info(best)          # da co anh cua chinh loi ke nay: KHONG tu xoa ve lai (bam nham mat het). Muon ve lai tu dau phai gui restart_ok (nut 'Ve lai tu dau' + hoi xac nhan)
                    return self._send(200, dict(error="Lời kể này đã có %d/%d ảnh. Bấm «Hoàn thành video» / «Vẽ tiếp» để dùng lại ảnh đã vẽ; chỉ khi muốn vẽ lại tất cả mới bấm «Vẽ lại từ đầu»." % (m_["done"], m_["total"]), match=m_))
                if best and is_draw_tab(o):
                    # Tab Ve ra: bam 'Tao' = TAO LAI, de len chinh du an cu (1 loi ke = 1 muc, khong sinh them muc). Chi nut 'Tiep tuc' trong danh sach moi lam tiep phan dang do.
                    o["project"] = best["id"]; o["restart_rec"] = True
                    o["fresh_img"] = str(int(time.time() * 1000)); o["reset_script"] = True
                elif best:
                    return self._send(200, dict(match=dict(id=best["id"], title=best.get("title", ""), status=best.get("status", ""), done=best.get("frames_done", 0), total=best.get("frames_total", 0), video=best.get("video", ""))))
            if o.get("new") and not o.get("resume") and is_draw_tab(o) and not o.get("fresh_img"):
                o["fresh_img"] = str(int(time.time() * 1000))      # «Hủy = tạo dự án MỚI từ đầu»: khóa cache anh rieng cho du an nay (luu trong du an, nen Tiep tuc sau nay van khop)
            if not start_job(o):
                return self._send(409, dict(error="Đang dừng tiến trình cũ, đợi vài giây rồi bấm Tiếp tục lại."))
            return self._send(200, dict(ok=True))
        if u == "/api/review":
            if not o.get("redo") and JOB.get("mode") == "draw":          # 'Hoan thanh video' chi khi DU anh; chua du thi khong dung video
                left_ = [f for f in (JOB.get("frames") or []) if not f.get("sh") and f.get("state") != "done"]
                if left_:
                    return self._send(200, dict(error="Còn %d cảnh chưa có ảnh. Vẽ đủ ảnh mới hoàn thành được video." % len(left_)))
            REV["redo"] = [str(x) for x in o.get("redo", [])]; REV["ev"].set(); return self._send(200, dict(ok=True))
        if u == "/api/retry":
            RES["act"] = "skip" if o.get("skip") else "retry"; RES["ev"].set(); return self._send(200, dict(ok=True))
        if u == "/api/cancel":
            busy_ = JOB["state"] in ("running", "paused") or FLOW.get("state") == "opening"
            if busy_:                                                 # chi cat khi thuc su co viec dang chay (Dung luc ranh khong de lai co 'dung' lam hong lan mo tab/ve sau)
                CANCEL.set()
                try:
                    from . import flowgen
                    flowgen.ABORT.set()          # cat ngang cac vong cho Flow/Gemini dang chay
                except Exception:
                    pass
                if JOB["state"] in ("running", "paused"):
                    with LOCK:
                        JOB["msg"] = "Đang dừng…"
            return self._send(200, dict(ok=True))
        if u == "/api/props/make":
            from . import props
            if PROPS["state"] == "working":
                return self._send(200, dict(error="Đang vẽ hình, đợi xong đã."))
            if JOB["state"] in ("running", "paused"):
                return self._send(200, dict(error="Đang dựng video (Flow đang bận), làm sau khi xong."))
            keys = [k for k in (o.get("keys") or []) if k in props.KEYS]
            if not keys:
                return self._send(200, dict(error="Chưa chọn hình nào."))
            br = int(o.get("browser", 0) or 0)

            def work():
                PROPS.update(state="working", msg="Bắt đầu…", n=PROPS.get("n", 0) + 1)
                fails = []
                for i, k in enumerate(keys):
                    try:
                        props.make(k, browser=br, log=lambda m, i=i: PROPS.update(msg="(%d/%d) %s" % (i + 1, len(keys), str(m)[:160])))
                    except Exception as e:
                        fails.append("%s: %s" % (props.ASSETS[k]["label"], str(e)[:140]))
                PROPS.update(state="error" if fails else "done", msg=("Lỗi — " + " | ".join(fails)) if fails else "Đã vẽ xong %d hình bằng AI." % len(keys), n=PROPS.get("n", 0) + 1)
            threading.Thread(target=work, daemon=True).start()
            return self._send(200, dict(ok=True))
        if u == "/api/props/upload":
            from . import props
            import base64
            k = str(o.get("key") or "")
            if k not in props.KEYS:
                return self._send(200, dict(error="Hình không hợp lệ."))
            try:
                raw = str(o.get("data") or "")
                data = base64.b64decode(raw.split(",", 1)[1] if raw.startswith("data:") else raw)
                props.use_bytes(k, data)
            except Exception as e:
                return self._send(200, dict(error=str(e)[:200] or "Không đọc được ảnh."))
            PROPS.update(state="done", msg="Đã dùng ảnh của bạn cho: " + props.ASSETS[k]["label"], n=PROPS.get("n", 0) + 1)
            return self._send(200, dict(ok=True))
        if u == "/api/refimg/upload":
            import base64
            try:
                raw = str(o.get("data") or "")
                st_ = refimg_save(base64.b64decode(raw.split(",", 1)[1] if raw.startswith("data:") else raw), o.get("name") or "")
            except Exception as e:
                return self._send(200, dict(error=(str(e)[:160] or "Không đọc được ảnh.")))
            return self._send(200, dict(ok=True, **st_))
        if u == "/api/refimg/clear":
            refimg_clear()
            return self._send(200, dict(ok=True))
        if u == "/api/props/reset":
            from . import props
            if str(o.get("key") or "") in props.KEYS:
                props.reset(str(o["key"]))
                PROPS.update(state="done", msg="Đã bỏ hình của bạn (dùng lại hình mặc định đi kèm tool, nếu có).", n=PROPS.get("n", 0) + 1)
            return self._send(200, dict(ok=True))
        if u == "/api/flow/login":
            if FLOW["state"] == "error":
                FLOW.update(state="off")
            flow_open(int(o.get("browser", 0)), force=bool(o.get("force"))); return self._send(200, dict(ok=True))
        if u == "/api/storyui":
            ui_ = o.get("ui")
            if not isinstance(ui_, dict) or len(json.dumps(ui_, ensure_ascii=False)) > 2000000:
                return self._send(200, dict(error="Dữ liệu không hợp lệ."))
            return self._send(200, dict(ok=story_ui_save(ui_)))
        if u == "/api/drawui":
            ui_ = o.get("ui")
            if not isinstance(ui_, dict) or len(json.dumps(ui_, ensure_ascii=False)) > 300000:
                return self._send(200, dict(error="Dữ liệu không hợp lệ."))
            c_ = llm.load_cfg()
            c_["draw_ui"] = ui_
            llm.save_cfg(c_)
            return self._send(200, dict(ok=True))
        if u == "/api/drawplan":
            try:
                txt_ = str(o.get("text") or "")
                if not txt_.strip():
                    return self._send(200, dict(lines=[], words=0, chars=0, secs=0))
                from . import templates
                kind_ = "script" if looks_like_script(txt_) else "story"
                sp_ = max(0.5, float(o.get("speed") or 1.0))
                txt_ = draw_script_offline(txt_, sp_, legacy_len(o))          # cung bo nhan dien voi tab Tao Video Story, gom cau theo nghia (khi chay that, AI doc hieu truyen se chia lai chinh xac hon)
                sc_ = parse_script(txt_, langs.pick(o.get("lang")) or "auto")
                rows_ = [(" ".join(l.text.split()), l.speaker or "") for l in sc_.lines if l.text.strip()]
                ls_ = [r_[0] for r_ in rows_]
                from . import dplan
                sh_ = dplan.shares(ls_)
                nch_ = sum(len(x) for x in ls_)
                return self._send(200, dict(lines=ls_, who=[r_[1] for r_ in rows_], sh=[1 if k_ in sh_ else 0 for k_ in range(len(ls_))], scenes=len(ls_) - len(sh_), cast=list(sc_.chars)[:12], kind=kind_, words=sum(langs.wcount(x) for x in ls_), chars=nch_,
                                            secs=est_secs(ls_, sp_, langs.pick(o.get("lang")))))
            except Exception as e:
                return self._send(200, dict(error=str(e)[:200], lines=[]))
        if u == "/api/drawprompt":
            try:
                from . import templates
                ls_ = [str(x) for x in (o.get("lines") or [])]
                i_ = int(o.get("n") or 1) - 1
                if not (0 <= i_ < len(ls_)):
                    return self._send(200, dict(prompt=""))
                return self._send(200, dict(prompt=templates.scene_prompt(templates.common_prompt(o), ls_[i_], ls_[i_ + 1] if i_ + 1 < len(ls_) else "", bool(o.get("use_ref")), "", templates.detect_lang(" ".join(ls_)))))
            except Exception as e:
                return self._send(200, dict(error=str(e)[:200]))
        if u == "/api/preview":
            try:
                text = prepare_text(o.get("text", ""))
                sc = parse_script(("@era %s\n" % o["era"] if o.get("era") else "") + text)
                chargen.ensure_cast(sc)
                scn = []
                for i, s in enumerate(sc.scenes):
                    body = s.desc + " " + " ".join(l.text for l in sc.lines if l.scene == i)
                    pl = s.place_t or chargen.detect_place(sc.era, body)
                    scn.append(dict(i=i, text=(s.desc or body)[:90], place=pl[0] if pl else "", dur=round(sum(len(l.text) for l in sc.lines if l.scene == i) / 14.0 + 1.5, 1)))
                return self._send(200, dict(script=text, chars=[dict(name=k, gender=v.gender, age=v.age) for k, v in sc.chars.items()], scenes=len(sc.scenes), lines=len(sc.lines), era=sc.era,
                                            scene_list=scn, places=chargen.place_names(sc.era)))
            except Exception as e:
                return self._send(200, dict(error=str(e)))
        if u == "/api/frame/redo":
            i_ = int(o.get("n") or 0) - 1
            if i_ < 0:
                return self._send(200, dict(error="Khung không hợp lệ."))
            def _set_prompt():
                if isinstance(o.get("prompt"), str):
                    if o["prompt"].strip():
                        PROMPT_OVR[i_] = o["prompt"].strip()[:8000]
                    else:
                        PROMPT_OVR.pop(i_, None)
            fl_ = JOB.get("fail") or {}
            if JOB["state"] == "paused" and fl_.get("kind") in ("flow", "api") and DRAWING[0]:
                # Dang dung vi khung loi: bam Tao lai o khung nao thi chi khung do duoc gui lai (dung prompt cua no), cac khung loi khac cho tiep
                _set_prompt()
                with LOCK:
                    REDOQ.append(i_)
                    fr_ = JOB.get("frames") or []
                    if 0 <= i_ < len(fr_):
                        fr_[i_] = dict(fr_[i_], state="drawing", url="", err="")
                jlog("↻ Tạo lại khung %d (gửi lại đúng prompt của khung này)." % (i_ + 1))
                RES["act"] = "retry"; RES["ev"].set()
                return self._send(200, dict(ok=True))
            if not DRAWING[0]:
                if JOB["state"] in ("running", "paused"):
                    return self._send(200, dict(error="Chỉ vẽ lại ngay được khi tool đang trong bước vẽ khung. Sau bước vẽ: dùng bước duyệt hình."))
                fr_ = JOB.get("frames") or []
                if JOB.get("mode") == "draw" and JOB.get("project") and 0 <= i_ < len(fr_) and not fr_[i_].get("url"):
                    # Job da dung (loi/bam Dung) ma khung nay chua co anh: tiep tuc du an, chi cac khung chua co anh duoc ve (anh da ve giu nguyen), prompt da sua duoc giu
                    rec_ = proj_load(str(JOB["project"]))
                    if rec_ and rec_.get("o"):
                        _set_prompt()
                        o2_ = dict(rec_["o"], project=rec_["id"], redo_keep=True, auto_missing=True, finish_now=False)
                        cur_ = refimg_state().get("file") or ""
                        if o2_.get("use_ref") and cur_ and refimg_path(cur_):          # ve lai / ve tiep: dung anh tham chieu DANG CHON, khong dung anh da luu trong du an cu
                            o2_["refimg_name"] = cur_
                        start_job(o2_)
                        return self._send(200, dict(ok=True, resumed=True))
                return self._send(200, dict(error="Video đã dựng xong nên không đổi ảnh được nữa. Chọn «Duyệt ảnh trước» ở mục Máy vẽ để sửa ảnh trước khi dựng."))
            _set_prompt()
            with LOCK:
                REDOQ.append(i_)
                fr_ = JOB.get("frames") or []
                if 0 <= i_ < len(fr_):
                    fr_[i_] = dict(fr_[i_], state="pending", url="", err="")
            jlog("↻ Yêu cầu vẽ lại khung %d (sẽ vẽ ngay khi có tab rảnh)." % (i_ + 1))
            return self._send(200, dict(ok=True))
        if u == "/api/frame/prompt":
            i_ = int(o.get("n") or 0) - 1
            p_ = str(o.get("prompt") or "").strip()
            if i_ >= 0:
                if p_:
                    PROMPT_OVR[i_] = p_[:8000]
                else:
                    PROMPT_OVR.pop(i_, None)
            return self._send(200, dict(ok=True))
        if u == "/api/imgkey":
            c_ = llm.load_cfg()
            if o.get("clear"):
                c_.pop("img_key", None)
            elif str(o.get("key") or "").strip():
                c_["img_key"] = str(o["key"]).strip()
            m_ = str(o.get("model") or "").strip()
            if m_:
                c_["img_model"] = m_[:60]
            llm.save_cfg(c_)
            k_ = str(c_.get("img_key") or "")
            return self._send(200, dict(ok=True, has=bool(k_), last4=k_[-4:] if k_ else "", model=c_.get("img_model") or "gemini-2.5-flash-image"))
        if u == "/api/frame/replace":
            import base64, io
            from PIL import Image
            n_ = int(o.get("n") or 0) - 1
            fr_ = JOB.get("frames") or []
            url_ = fr_[n_].get("url") if 0 <= n_ < len(fr_) else ""
            if not url_:
                return self._send(200, dict(error="Khung này chưa có ảnh để thay."))
            try:
                raw = str(o.get("data") or "")
                im = Image.open(io.BytesIO(base64.b64decode(raw.split(",", 1)[1] if raw.startswith("data:") else raw)))
                im.load()
                im = im.convert("RGB")
                dst = os.path.join(DATA_DIR, "cache", "frames", os.path.basename(url_))
                if os.path.isfile(dst):
                    old_sz = Image.open(dst).size
                    if im.size != old_sz:                              # cat cho vua ti le khung cu roi co ve dung kich thuoc (khong meo hinh)
                        sc_ = max(old_sz[0] / im.width, old_sz[1] / im.height)
                        im = im.resize((max(1, int(im.width * sc_ + 0.5)), max(1, int(im.height * sc_ + 0.5))), Image.LANCZOS)
                        l_, t_ = (im.width - old_sz[0]) // 2, (im.height - old_sz[1]) // 2
                        im = im.crop((l_, t_, l_ + old_sz[0], t_ + old_sz[1]))
                im.save(dst, "PNG")
            except Exception as e:
                return self._send(200, dict(error="Không đọc được ảnh: " + str(e)[:120]))
            with LOCK:
                fr_[n_] = dict(fr_[n_], state="done", url=url_ + ("?" if "?" not in url_ else "&") + "r=%d" % int(time.time()))
            jlog("✔ Đã thay ảnh khung %d bằng ảnh của bạn." % (n_ + 1))
            return self._send(200, dict(ok=True))
        if u == "/api/voice/clone/add":          # o 'Nhan ban giong' (tab Ve ra + tab Story): file mau -> AnimStudioData\\voices\\<ten>.wav, doc bang VieNeu tren may
            import base64
            if not o.get("ok"):
                return self._send(200, dict(error="Hãy tick xác nhận: đây là giọng của bạn hoặc của người đã đồng ý cho bạn nhân bản."))
            try:
                raw = str(o.get("data") or "")
                key_ = tts.clone_add(base64.b64decode(raw.split(",", 1)[1] if raw.startswith("data:") else raw), o.get("name") or "")
            except Exception as e:
                return self._send(200, dict(error=(str(e)[:220] or "Không thêm được giọng.")))
            return self._send(200, dict(ok=True, key=key_, mine=[[k, l] for k, l, _p in tts.custom_voices()], own=[k for k, _l, p_ in tts.custom_voices() if os.path.dirname(p_) == tts.user_voice_dir()]))
        if u == "/api/voice/clone/del":
            done_ = tts.clone_delete(o.get("key"))
            return self._send(200, dict(ok=bool(done_), mine=[[k, l] for k, l, _p in tts.custom_voices()], own=[k for k, _l, p_ in tts.custom_voices() if os.path.dirname(p_) == tts.user_voice_dir()]))
        if u == "/api/voice/sample":
            try:
                import numpy as _np
                from . import audio as _audio
                nv_ = str(o.get("narrator") or "")
                tts.VOICE_CHOICE.update(narrator="" if nv_.startswith("auto:") else nv_, auto=nv_[5:] if nv_.startswith("auto:") else "")
                vl_ = langs.lang_of_voice(nv_[3:]) if nv_[:3] in ("ms:", "az:") else ""          # giong chon tay: nghe thu bang cau mau dung ngon ngu cua giong do
                if vl_ == "*":
                    vl_ = ""                                  # giong da ngon ngu doc duoc moi tieng: cau mau theo ngon ngu cua du an
                txt_ = " ".join(str(o.get("text") or "").split())[:200]
                if not txt_ or (vl_ and langs.script_clash(langs.detect(txt_), vl_)):
                    txt_ = langs.sample(vl_ or langs.pick(o.get("lang")) or "vi")
                lg_ = vl_ or langs.pick(o.get("lang"))
                sc_ = parse_script(txt_)
                prov, prov_id = get_provider(provider_idx(o), lambda m, *a: None)
                try:
                    au_ = synth_all(sc_, prov, prov_id, lg_, speed=float(o.get("speed", 1.0) or 1.0), volume=_vol01(o))
                except Exception as e:
                    if (isinstance(e, tts.VoiceBusy) or "403" in str(e)) and edge_of(prov) is not None:
                        from . import edgeupdate
                        ch_, _m = edgeupdate.update(True)          # co ban edge-tts moi hon thi tai va thu lai ngay mot lan
                        if ch_:
                            tts.refresh_edge(prov)
                            try:
                                au_ = synth_all(sc_, prov, prov_id, lg_, speed=float(o.get("speed", 1.0) or 1.0), volume=_vol01(o))
                                e = None
                            except Exception as e2:
                                e = e2
                    if e is None:
                        pass
                    elif isinstance(e, tts.VoiceBusy):
                        raise RuntimeError("Microsoft không trả về âm thanh cho giọng bạn chọn (lỗi phía máy chủ Microsoft, không phải do bạn)." + edge_hint(prov) + " Tool giữ đúng giọng đã chọn, không tự đổi: hãy thử lại sau vài phút hoặc tự chọn giọng khác.")
                    else:
                        raise RuntimeError(str(e)[:400])
                sig_ = _np.concatenate(au_) if au_ else _np.zeros(1, _np.float32)
                os.makedirs(os.path.join(DATA_DIR, "cache"), exist_ok=True)
                _audio.write_wav(os.path.join(DATA_DIR, "cache", "voice_sample.wav"), sig_)
            except Exception as e:
                return self._send(200, dict(error=str(e)[:700]))
            return self._send(200, dict(ok=True, url="/api/voice/sample.wav?t=%d" % int(time.time())))
        if u == "/api/rescue/delete":
            from . import rescue
            cl = rescue.clusters()
            k_ = int(o.get("cluster") or 0)
            n_del = 0
            if 1 <= k_ <= len(cl):
                for _, p_ in cl[k_ - 1]:
                    try:
                        os.remove(p_); n_del += 1
                    except OSError:
                        pass
            return self._send(200, dict(ok=True, deleted=n_del))
        if u == "/api/flow/tabs":
            n_ = max(1, min(4, int(o.get("n") or 1)))
            br_ = int(o.get("browser", 0))
            eng_ = o.get("engine") if o.get("engine") in ("gemini", "chatgpt") else "flow"          # mo DUNG loai tab cua engine dang chon
            en_ = {"gemini": "Gemini", "chatgpt": "ChatGPT"}.get(eng_, "Flow")
            if TABBUSY[0]:
                return self._send(200, dict(ok=False, busy=True))
            if JOB["state"] in ("running", "paused"):                  # dang ve thi cac tab dang duoc dung: mo tab luc nay se bi xep hang sau viec dang chay (nhin nhu treo)
                return self._send(200, dict(ok=False, error="Đang vẽ nên các tab đang được dùng. Bấm Dừng (hoặc đợi vẽ xong) rồi hãy bấm Mở sẵn các tab."))
            try:
                from . import flowgen as _fgt
                _fgt.ABORT.clear()                                       # khong de co 'dung' cu lam hong viec mo tab
            except Exception:
                pass
            TABBUSY[0] = True

            def _tabs():
                try:
                    if FLOW["state"] != "ready":
                        FLOW.update(msg="Đang mở Flow…")
                        flow_open(br_)
                        t0 = time.time()
                        while FLOW["state"] != "ready":
                            if FLOW["state"] == "error" or time.time() - t0 > 420:
                                raise RuntimeError(FLOW["msg"] or "Không mở được Flow")
                            time.sleep(1.5)
                    from . import flowgen
                    FLOW.update(tabmsg=("⏳ Đang mở %d tab Flow, mỗi tab một dự án riêng… (đừng bấm lại)" % n_) if eng_ == "flow" else ("⏳ Đang mở %d tab %s… (đừng bấm lại)" % (n_, en_)))
                    k, full, rep_, closed_ = flowgen.open_tabs(n_, br_, lambda m: FLOW.update(msg=m), engine=eng_)
                    ex_ = (" Đã đóng %d tab thừa." % closed_) if closed_ else ""
                    if full:
                        FLOW.update(tabmsg="✔ ĐÃ MỞ ĐỦ %d/%d TAB %s, sẵn sàng dùng. Không cần bấm nữa.%s  [%s]" % (k, n_, en_.upper(), ex_, " · ".join(rep_)))
                    else:
                        FLOW.update(tabmsg="⚠ Mới mở được %d/%d tab %s. Bấm lại để mở bù.%s  [%s]" % (k, n_, en_, ex_, " · ".join(rep_)))
                    if o.get("hide"):
                        flowgen.hide_flow()
                except Exception as e:
                    FLOW.update(tabmsg="❌ Mở tab %s lỗi: %s" % (en_, str(e)[:200]))
                finally:
                    TABBUSY[0] = False
            threading.Thread(target=_tabs, daemon=True).start()
            return self._send(200, dict(ok=True))
        if u == "/api/flow/hide":
            try:
                from . import flowgen
                if o.get("hide"):
                    ok_ = flowgen.hide_flow()
                    FLOW.update(msg="Đã ẩn cửa sổ Flow (đưa ra ngoài màn hình, vẫn chạy ngầm)." if ok_ else "Không ẩn được cửa sổ Flow (Chrome sẽ đứng nếu ẩn) — cửa sổ vẫn hiện để vẽ bình thường.")
                else:
                    ok_ = flowgen.focus_flow()
                    FLOW.update(msg="Đã hiện cửa sổ Flow." if ok_ else "Chưa có cửa sổ Flow.")
            except Exception as e:
                FLOW.update(msg="Ẩn/hiện Flow lỗi: " + str(e)[:150])
            return self._send(200, dict(ok=True))
        if u == "/api/azure/test":
            k0, r0 = tts.azure_cfg()
            key = str(o.get("key") or "").strip() or k0
            region = str(o.get("region") or "").strip().lower() or r0
            try:
                voices = tts.azure_voices(key, region)
            except Exception as e:
                return self._send(200, dict(error=str(e)[:300]))
            if not voices:
                return self._send(200, dict(error="Kết nối được nhưng Azure không trả giọng nào (kiểm tra vùng/gói dịch vụ)."))
            c = llm.load_cfg()
            c["azure_key"], c["azure_region"] = key, region
            llm.save_cfg(c)
            try:
                os.makedirs(DATA_DIR, exist_ok=True)
                with open(AZ_CACHE, "w", encoding="utf-8") as f:
                    json.dump(dict(region=region, voices=voices), f, ensure_ascii=False)
            except Exception:
                pass
            return self._send(200, dict(ok=True, az=azure_state()))
        if u == "/api/azure/clear":
            c = llm.load_cfg()
            c.pop("azure_key", None)
            llm.save_cfg(c)
            try:
                os.remove(AZ_CACHE)
            except OSError:
                pass
            return self._send(200, dict(ok=True, az=azure_state()))
        if u == "/api/project/delete":
            pid_ = str(o.get("id", ""))
            if JOB["state"] in ("running", "paused") and JOB.get("project") == pid_:
                return self._send(200, dict(error="Dự án này đang chạy. Bấm Dừng trước rồi mới xóa được."))
            return self._send(200, dict(ok=True, deleted=delete_project(pid_)))
        if u == "/api/savevideo":
            vn_ = str(o.get("video") or "")
            vp_ = os.path.join(OUTDIR, vn_) if vn_ else ""
            if not vn_ or not os.path.isfile(vp_) or not _inside(vp_, OUTDIR):
                return self._send(200, dict(error="Không thấy file video."))
            dest_ = _save_dialog(os.path.basename(vp_))
            if dest_ is None:
                return self._send(200, dict(fallback=True))
            if not dest_:
                return self._send(200, dict(cancelled=True))
            if not os.path.splitext(dest_)[1]:
                dest_ += os.path.splitext(vp_)[1] or ".mp4"
            try:
                import shutil as _sh2
                os.makedirs(os.path.dirname(os.path.abspath(dest_)), exist_ok=True)
                _sh2.copyfile(vp_, dest_)
                try:
                    open(SAVE_DIR_F, "w", encoding="utf-8").write(os.path.dirname(os.path.abspath(dest_)))
                except Exception:
                    pass
            except Exception as e_sv:
                return self._send(200, dict(error="Không lưu được: %s" % str(e_sv)[:150]))
            return self._send(200, dict(ok=True, path=dest_))
        if u == "/api/openfolder":
            if o.get("project"):
                rec_ = proj_load(str(o["project"])) or {}
                if rec_.get("out_dir") and os.path.isdir(rec_["out_dir"]):
                    o["which"] = "_p"
                    o["_dir"] = rec_["out_dir"]
            target = o.get("_dir") or {"cache": os.path.join(DATA_DIR, "cache"), "frames": os.path.join(DATA_DIR, "cache", "frames"), "fonts": os.path.join(DATA_DIR, "fonts")}.get(o.get("which"), OUTDIR)
            os.makedirs(target, exist_ok=True)
            try:
                if hasattr(os, "startfile"):
                    os.startfile(target)
                else:
                    import subprocess
                    subprocess.Popen(["open" if sys.platform == "darwin" else "xdg-open", target])
            except Exception:
                pass
            return self._send(200, dict(ok=True, path=target))
        self._send(404, "not found", "text/plain")


def serve(open_browser=True, port=0):
    try:
        tts.catalog_start()          # nap danh sach giong Microsoft da luu, thieu / cu thi tai moi trong luong nen
    except Exception:
        pass
    srv = ThreadingHTTPServer(("127.0.0.1", port), H)
    url = f"http://127.0.0.1:{srv.server_address[1]}/"
    print("AnimStudio:", url)
    if open_browser:
        try:
            import webview  # cua so rieng (WebView2), khong mo trinh duyet
            threading.Thread(target=srv.serve_forever, daemon=True).start()
            webview.create_window("AnimStudio", url, width=1280, height=860, min_size=(900, 600))
            webview.start()
            try:
                import atexit; atexit._run_exitfuncs()
            except Exception:
                pass
            os._exit(0)
        except Exception as e:
            print("Khong mo duoc cua so rieng, dung trinh duyet:", e)
            threading.Timer(0.6, lambda: webbrowser.open(url)).start()
    try:
        srv.serve_forever()
    except KeyboardInterrupt:
        pass
    return srv


PAGE = r'''<!doctype html><html lang="vi"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>AnimStudio</title>
<style>
:root{--bg:#0f1220;--panel:#181c30;--line:#2a3050;--fg:#f1f3fb;--mut:#9aa3c7;--acc:#ffb347;--acc2:#6fd3ff;--ok:#5fe3a1;--bad:#ff6b6b}
*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--fg);font:16px/1.5 "Segoe UI",system-ui,sans-serif}
header{display:flex;align-items:center;gap:12px;padding:14px 28px;border-bottom:1px solid var(--line)}
header b{font-size:20px;letter-spacing:.3px}header span{color:var(--mut);font-size:14px}
main{max-width:1180px;margin:0 auto;padding:22px 28px 60px;display:grid;grid-template-columns:1.25fr 1fr;gap:26px}
@media(max-width:980px){main{grid-template-columns:1fr}}
h2{font-size:15px;margin:0 0 10px;color:var(--acc);text-transform:uppercase;letter-spacing:.8px}
.card{background:var(--panel);border:1px solid var(--line);border-radius:16px;padding:18px}
textarea{width:100%;height:330px;background:#0c0f1d;color:var(--fg);border:1px solid var(--line);border-radius:12px;padding:14px;font:16px/1.55 "Segoe UI",system-ui,sans-serif;resize:vertical}
textarea:focus,select:focus,input:focus{outline:2px solid var(--acc2)}
.eras{display:grid;grid-template-columns:repeat(3,1fr);gap:12px}
.era{cursor:pointer;border:2px solid var(--line);border-radius:14px;padding:10px 8px 12px;text-align:center;background:#12162a;transition:.15s}
.era:hover{border-color:#4a5486}.era.on{border-color:var(--acc);background:#221d12;box-shadow:0 0 0 3px #ffb34733}
.era .pv{display:flex;justify-content:center;align-items:flex-end;height:96px;gap:2px}.era img{max-height:96px;max-width:33%;object-fit:contain}
.era .nm{font-weight:700;font-size:18px;margin-top:6px}
.row{display:flex;gap:12px;flex-wrap:wrap;margin-top:12px}.row>label{flex:1;min-width:150px;color:var(--mut);font-size:14px}
select,input[type=text],input[type=password]{width:100%;margin-top:4px;background:#0c0f1d;color:var(--fg);border:1px solid var(--line);border-radius:10px;padding:10px 12px;font-size:15px}
.chk{display:flex;gap:8px;align-items:center;color:var(--fg);font-size:15px;margin-top:10px;cursor:pointer}.chk input{width:18px;height:18px;accent-color:var(--acc)}
button{font:600 16px "Segoe UI",system-ui,sans-serif;border:0;border-radius:12px;padding:11px 18px;cursor:pointer;color:#111;background:var(--acc2)}
button.sec{background:#262c4a;color:var(--fg);border:1px solid #3a4272}button:hover{filter:brightness(1.1)}button:disabled{opacity:.5;cursor:default}
#go{width:100%;font-size:20px;padding:16px;background:var(--acc);margin-top:16px}
.pill{display:inline-block;padding:3px 12px;border-radius:99px;font-size:13px;font-weight:600;background:#2a3050;color:var(--mut)}
.pill.ready{background:#143b2a;color:var(--ok)}.pill.opening{background:#3b3314;color:var(--acc)}.pill.error{background:#3b1818;color:var(--bad)}
.bar{height:14px;border-radius:99px;background:#0c0f1d;overflow:hidden;border:1px solid var(--line);margin:10px 0}.bar i{display:block;height:100%;width:0;background:linear-gradient(90deg,var(--acc2),var(--acc));transition:width .4s}
#log{background:#0c0f1d;border-radius:10px;padding:10px 12px;height:150px;overflow:auto;font:13px/1.5 Consolas,monospace;color:var(--mut);white-space:pre-wrap}
video{width:100%;border-radius:12px;background:#000;margin-top:10px;max-height:460px}
.note{color:var(--mut);font-size:13px;margin-top:6px}.chars{display:flex;gap:8px;flex-wrap:wrap;margin-top:8px}.chars span{background:#232949;padding:4px 10px;border-radius:99px;font-size:14px}
.err{color:var(--bad);margin-top:8px;font-weight:600}
.tabs{display:flex;gap:8px;padding:12px 28px 0;border-bottom:1px solid var(--line)}
.tabs a{background:transparent;color:var(--mut);border:1px solid var(--line);border-bottom:0;border-radius:12px 12px 0 0;padding:10px 22px;font-size:15px;text-decoration:none;font-weight:600}
.tabs a.on{background:var(--panel);color:var(--acc);border-color:var(--acc)}
.tg{display:contents}.tabs a svg{vertical-align:-3px;margin-right:3px}
input[type=color]{display:block;width:100%;height:38px;margin-top:4px;padding:2px;background:#0c0f1d;border:1px solid var(--line);border-radius:10px;cursor:pointer}
input[type=range]{width:100%;accent-color:var(--acc)}
.subprev{position:relative;aspect-ratio:16/9;width:100%;max-width:440px;margin:12px 0 4px;border-radius:12px;overflow:hidden;border:1px solid var(--line);background:linear-gradient(160deg,#cfd6e2,#8e9ab0 55%,#5c6880)}
.subprev[data-a="9:16"]{aspect-ratio:9/16;width:170px}
.subprev .t{position:absolute;left:50%;transform:translateX(-50%);text-align:center;white-space:pre-wrap;line-height:1.25;width:86%;font-weight:700;cursor:grab;touch-action:none;user-select:none}
.subprev .t.drag{cursor:grabbing}
.subprev .t span{display:inline;-webkit-box-decoration-break:clone;box-decoration-break:clone}
#subbox>summary{cursor:pointer;color:var(--acc2);font-weight:600;margin-top:12px}
</style></head><body>
<header><b style="display:flex;align-items:center;gap:10px"><img src="data:image/png;base64,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" alt="" style="width:34px;height:34px;border-radius:9px"> AnimStudio</b><span id="ver"></span><span style="margin-left:auto">Dán truyện / kịch bản → video hoạt hình có giọng đọc</span></header>
__TABS__
<main>
<section>
  <div class="card"><h2>① Dán truyện hoặc kịch bản</h2>
    <textarea id="text" placeholder="Dán cả câu chuyện, hoặc mỗi dòng một câu, hoặc kịch bản có thoại (Tên: lời thoại). Không cần chia cảnh."></textarea>
    <div class="row"><label>Ngôn ngữ giọng/phụ đề<select id="lang">__LANGOPTS__</select></label></div>
    <div class="note" id="info"></div><div class="chars" id="chars"></div>
    <details id="scenebox" style="display:none;margin-top:12px"><summary style="cursor:pointer;color:#8a94b8">Chỉnh cảnh thủ công (không bắt buộc – tool tự chia cảnh và vẽ nền theo từng câu)</summary>
      <div class="note">Chọn lại nơi chốn nếu tool nhận sai, hoặc tự gõ mô tả nền. Cảnh chỉ là bối cảnh cho lời nói và hành động; tool chỉ tách cảnh khi đổi địa điểm hoặc nhảy thời gian. Ô giây để trống = dài đúng bằng lời đọc.</div><div id="scenes"></div></details>
  </div>
  <div class="card" id="eracard" style="margin-top:20px;display:none"><h2>Phong cách nhân vật</h2>
    <div class="eras" id="eras"></div>
    <div class="note">Thời đại Hiện đại (mặc định). Ảnh chỉ minh họa phong cách. Tool vẽ nhân vật mới theo truyện, giữ đúng hình dạng này.</div>
  </div>
  <div class="card" id="frbox" style="margin-top:20px;display:none"><h2>Các khung đang vẽ <span id="frcount" style="font-weight:400;font-size:14px"></span></h2>
    <div class="note">Mỗi ô là một câu/nhịp của truyện: ✓ đã vẽ xong, ✎ đang vẽ, ○ đang chờ. Vẽ xong sẽ có bước duyệt để tick khung chưa ưng.</div>
    <div id="frlist" style="display:grid;grid-template-columns:repeat(auto-fill,minmax(130px,1fr));gap:8px;margin-top:10px;max-height:min(46vh,340px);overflow-y:auto;overflow-x:hidden;padding-right:4px"></div></div>
  <div class="card" id="revbox" style="margin-top:20px;display:none;border-color:var(--acc)"><h2>Duyệt hình Flow vừa vẽ</h2>
    <div class="note">Hình chỉ để bạn kiểm tra đúng phong cách. Tick hình nào chưa ưng (nhân vật hoặc cảnh) rồi bấm Vẽ lại.</div>
    <div id="revlist" style="display:grid;grid-template-columns:repeat(auto-fill,minmax(150px,1fr));gap:12px;margin:12px 0;max-height:min(58vh,470px);overflow-y:auto;overflow-x:hidden;padding-right:4px"></div>
    <div class="row"><button id="revok">✔ Dùng các hình này</button><button class="sec" id="revredo">↻ Vẽ lại các hình đã tick</button></div></div>
  <div class="card" id="projbox" style="margin-top:20px"><h2>Dự án của bạn (quản lý tác vụ)</h2>
    <div class="note">Mỗi lần tạo video là một dự án, được lưu lại. Tắt tool hoặc bị lỗi vẫn bấm "Tiếp tục" được, không phải làm lại từ đầu (các khung/giọng/kết quả AI đã lưu được dùng lại).</div>
    <div class="row" style="margin:8px 0"><button class="sec" onclick="api('/api/openfolder',{})">📁 Mở thư mục video</button><button class="sec" onclick="api('/api/openfolder',{which:'frames'})">📁 Thư mục các khung đã vẽ</button></div>
    <label class="chk"><input type="checkbox" id="useov"> Khi bấm Tiếp tục / Dựng ngay / Cứu: dùng giọng đọc + hiệu ứng đang chọn ở mục ③ (bỏ tick = giữ đúng cài đặt đã lưu của dự án, giọng đã đọc sẽ dùng lại ngay, không đọc lại)</label>
    <div id="projlist"></div></div>
  <div class="card" style="margin-top:20px"><h2>Tiến trình</h2>
    <div class="bar"><i id="pb"></i></div><div id="msg" style="font-weight:600">Sẵn sàng.</div><div id="err" class="err"></div>
    <div id="failbox" style="display:none;margin-top:10px;padding:12px;border:2px solid #e0a030;border-radius:10px;background:rgba(224,160,48,.12)">
      <div style="font-weight:700">⚠ Đang tạm dừng — <span id="failwhat"></span></div>
      <div id="failerr" style="font-size:13px;margin:6px 0;word-break:break-word"></div>
      <div style="font-size:12px;opacity:.8;margin-bottom:8px">Các phần đã làm xong được giữ nguyên; bấm Thử lại sẽ làm tiếp đúng bước này.</div>
      <button id="failretry" style="width:100%">↻ Thử lại bước này</button>
      <button class="sec" id="failskip" style="width:100%;margin-top:6px">Bỏ qua bước này</button>
    </div>
    <div id="log"></div>
    <div id="result" style="display:none"><video id="vid" controls></video>
      <div class="row"><a id="dl" download><button class="sec">⬇ Tải video</button></a><button class="sec" id="folder">Mở thư mục</button></div></div>
  </div>
</section>
<section>
  <div class="card"><h2>② Nhân vật & cảnh nền</h2>
    <div class="note" style="margin:0 0 4px">Google Flow (Nano Banana) vẽ TRỌN từng khung theo đúng truyện: nền, nhân vật MỚI, hành động và đồ vật cùng một nét vẽ, phong cách Hiện đại.</div>
    <div id="flowbox" style="margin-top:12px">
      <div class="row"><label>Trình duyệt<select id="browser"></select></label></div>
      <div style="display:flex;gap:10px;align-items:center;margin-top:12px"><button class="sec" id="login">Mở Flow & đăng nhập</button><span class="pill" id="fpill">chưa mở</span></div>
      <div class="note" id="fmsg">Bấm nút trên, đăng nhập Google một lần trong cửa sổ trình duyệt vừa mở. Sau đó cứ để tool tự làm.</div>
      <label class="chk"><input type="checkbox" id="flowbg" checked> Vẽ cả nền từng cảnh bằng Flow</label>
      <label class="chk"><input type="checkbox" id="review" checked> Cho tôi duyệt nhân vật và cảnh nền trước khi dựng video</label>
      <div class="note" style="margin:8px 0 2px">Hiểu truyện &amp; đạo diễn hình ảnh (AI đọc từng câu để vẽ đúng bối cảnh, hành động, đồ vật):</div>
      <select id="ai"><option value="5" selected>Gemini qua trình duyệt – dùng tài khoản Google/Ultra của bạn, không cần key (khuyên dùng)</option><option value="1">Miễn phí online (Pollinations, không cần key)</option><option value="2">Claude (API key)</option><option value="3">OpenAI / tương thích (cấu hình trong llm_cfg)</option><option value="4">Gemini (API key)</option><option value="0">Quy tắc offline (kém chi tiết hơn)</option></select>
      <input id="aikey" placeholder="API key (Gemini / Claude / OpenAI)" style="margin-left:6px">
      <label style="display:block;margin-top:6px;font-size:13px">Độ chi tiết chia khung: <select id="beat" style="width:auto"><option value="fast">Ít khung, nhanh (mỗi khung ~6–9 giây)</option><option value="mid">Cân bằng (mỗi khung ~4–7 giây)</option><option value="fine" selected>Rất chi tiết (mỗi khung ~3–5 giây, nhiều khung, lâu)</option></select></label>
      <label style="display:block;margin-top:6px;font-size:13px">🧠 Số tab GEMINI (chỉ bước AI đọc/chia truyện — KHÔNG phải tab vẽ Flow): <select id="aitabs" style="width:auto"><option>1</option><option>2</option><option selected>3</option><option>4</option><option>5</option></select> — nhiều tab nhanh hơn, nếu Gemini báo giới hạn thì chọn 1–2</label>
      <label style="display:block;margin-top:6px;font-size:13px">🎨 Số tab FLOW vẽ ảnh song song (thử nghiệm): <select id="flowtabs" style="width:auto"><option selected>1</option><option>2</option><option>3</option><option>4</option></select> <button class="sec" id="opentabs" style="padding:4px 10px">🔌 Mở sẵn các tab này</button><div id="tabstat" style="font-size:13px;margin-top:4px;color:var(--acc)"></div> — mỗi tab là một dự án Flow riêng; nên để tắt "Ẩn cửa sổ Flow" khi dùng nhiều tab</label>
      <label style="display:block;margin:6px 0;font-size:13px">🎨 Phong cách vẽ: <select id="art" style="width:auto"><option value="2d" selected>2D điện ảnh (nhân vật có khuôn mặt, ánh sáng điện ảnh — như đang tạo)</option><option value="stick">2D người que (stick figure)</option></select> — nhân vật tham chiếu và khung được KHÓA cùng một kiểu</label>
      <label class="chk"><input type="checkbox" id="diverse" checked> Mỗi nhân vật một kiểu riêng (tóc, màu áo, phụ kiện, dáng người khác nhau — tránh các nhân vật Flow vẽ giống hệt nhau). Dự án cũ giữ nguyên nhân vật đã vẽ.</label>
      <div style="margin:8px 0;padding:10px;border:1px solid var(--line,#444);border-radius:8px">
        <b>Chuyển động bằng AI (Google Vids "Tạo ảnh động")</b>
        <div class="note" style="margin:4px 0">Dùng tài khoản Google đã đăng nhập ở Flow (Omni/Veo, giới hạn lượt theo tài khoản). Không cài thêm gì vào máy; để "Tắt" nếu không dùng.</div>
        <select id="motion" style="margin-top:4px"><option value="off" selected>Tắt (chỉ chuyển động ống kính)</option><option value="key">Bật: khung có hành động / hình chèn (tối đa số khung bên dưới)</option><option value="all">Bật: tất cả các khung (rất lâu)</option></select>
        <input id="vidsurl" placeholder="Link tài liệu Google Vids (để trống = tự tạo video mới)" style="width:100%;margin-top:6px">
        <label class="chk" style="margin-top:6px"><input type="checkbox" id="motionsafe" checked> Giữ nguyên khuôn mặt (chống biến dạng)</label>
        <label style="font-size:12px;display:block;margin-top:4px">Độ rõ chuyển động<select id="motionlvl"><option value="clear" selected>Rõ (diễn tả đúng lời thoại, clip dài hơn)</option><option value="soft">Nhẹ (an toàn nhất, ít biến dạng)</option></select></label>
        <div style="display:flex;gap:6px;margin-top:6px;align-items:center"><span style="font-size:12px">Tối đa số khung:</span><input id="motionmax" type="number" value="15" min="1" style="width:80px"></div>
      </div>
      <label class="chk"><input type="checkbox" id="hideflow"> Ẩn cửa sổ Flow khi đang vẽ (đưa ra ngoài màn hình; nếu Chrome bị đứng thì tự hiện lại)</label>
    </div>
  </div>
  <div class="card" style="margin-top:20px"><h2>③ Video</h2>
    <div class="row"><label>Khung hình<select id="aspect"><option>16:9</option><option>9:16</option></select></label>
      <label>Chất lượng<select id="res"><option>480p</option><option selected>720p</option><option>1080p</option></select></label>
      <label>FPS<select id="fps"><option>24</option><option selected>30</option></select></label></div>
    <div class="row"><label>Giọng đọc (chọn 1 giọng cho cả lời dẫn và nhân vật, hoặc để tự động chia giọng theo nhân vật)<select id="narr"></select></label></div>
    <div class="row" style="align-items:center"><button class="sec" id="vTest" type="button">▶ Nghe thử giọng</button><span class="note" id="vMsg" style="margin:0"></span></div>
    <audio id="vAud" controls style="display:none;width:100%;margin:2px 0 8px"></audio>
    <div class="note" id="narrnote">VieNeu có 25 giọng tiếng Việt có sẵn (Bắc / Trung / Nam, nam &amp; nữ). Chạy trên máy: cần đã cài thư viện VieNeu (pip install vieneu; run_dev.bat tự cài); chưa có thì tự đọc bằng giọng Microsoft.</div>
    <details id="azbox" style="margin:8px 0"><summary style="cursor:pointer;font-size:13px;color:var(--acc2)">Azure TTS V1 — nhập key + vùng để dùng giọng Azure</summary>
      <div class="note">Cần tài nguyên «Speech» trên Azure (gói F0 miễn phí khoảng 0,5 triệu ký tự/tháng). Key chỉ lưu trên máy này (config.json), không ghi vào dự án và không gửi đi đâu khác ngoài Azure.</div>
      <div class="row"><label>Key Azure Speech<input type="password" id="azkey" placeholder="dán key (để trống = giữ key đã lưu)" autocomplete="off"></label>
        <label>Vùng (region)<input type="text" id="azregion" placeholder="southeastasia"></label></div>
      <div class="row"><button class="sec" id="aztest">Lưu &amp; kiểm tra, tải danh sách giọng</button><button class="sec" id="azclear">Xóa key đã lưu</button></div>
      <div class="note" id="azstat"></div></details>
    <details id="clonebox" style="margin:8px 0"><summary style="cursor:pointer;font-size:13px;color:var(--acc2)">Nhân bản giọng — dùng giọng của bạn từ file ghi âm mẫu</summary>
      <div class="note">Chọn file ghi âm giọng 6–15 giây (một người nói rõ, không nhạc nền; .wav .mp3 .m4a…). Tool đọc theo giọng đó bằng VieNeu chạy trên máy bạn, chỉ đọc tiếng Việt. Lần đầu dùng sẽ tải model nên hơi lâu. Giọng được lưu trên máy (AnimStudioData\voices).</div>
      <div class="row"><label>Tên giọng<input type="text" id="cloneName" maxlength="40" placeholder="Ví dụ: Giọng của tôi" autocomplete="off"></label>
        <label>File mẫu<input type="file" id="cloneFile" accept="audio/*,.wav,.mp3,.m4a,.aac,.ogg,.flac"></label></div>
      <label class="chk"><input type="checkbox" id="cloneOk"> Đây là giọng của tôi hoặc của người đã đồng ý cho tôi nhân bản</label>
      <div class="row" style="align-items:center"><button class="sec" id="cloneAdd" type="button">Nhân bản giọng</button><span class="note" id="cloneStat" style="margin:0"></span></div>
      <div class="note" id="cloneList"></div></details>
    <div class="row" style="display:none"><label>Giọng đọc<select id="voice"></select></label></div>
    <div class="row"><label>Tốc độ đọc: <b id="spv">1.0×</b><input type="range" id="speed" min="0.7" max="1.5" step="0.05" value="1.0"></label>
      <label>Âm lượng giọng: <b id="volv">100%</b><input type="range" id="vol" min="0" max="200" step="5" value="100"></label></div>
    <div class="row"><label>Thời lượng tối thiểu mỗi cảnh (giây, để trống = theo giọng đọc)<input type="number" id="dsec" min="0" max="120" step="1" placeholder="tự động"></label></div>
    <div class="row"><label>Hiệu ứng máy quay (khi chưa có chuyển động AI)<select id="camfx"><option value="auto">Tự động, đa dạng (zoom vào/ra, lia trái/phải)</option><option value="zoomin">Chỉ zoom vào</option><option value="zoomout">Chỉ zoom ra</option><option value="pan">Chỉ lia ngang</option><option value="none">Đứng yên (không hiệu ứng)</option></select></label>
      <label>Độ mạnh<select id="camstr"><option value="soft">Nhẹ</option><option value="normal" selected>Vừa</option><option value="strong">Mạnh</option></select></label></div>
    <div class="row"><label>Phủ hiệu ứng theo kịch bản (tuyết, mưa, sương, gió, bụi, lửa, nổ, lá rơi, đom đóm, sấm chớp, tia nắng)<select id="fxmode"><option value="auto">Tự động: phủ khi lời đọc nhắc tới (mưa, tuyết, sương, lửa…)</option><option value="off">Tắt</option></select></label>
      <label>Độ phủ: <b id="fxv">40%</b><input type="range" id="fxamt" min="0" max="100" step="5" value="40"></label>
      <label>Kiểu phim<select id="fxlook"><option value="none">Sạch (không)</option><option value="old">Phim cũ (xước, bụi phim)</option><option value="war">Tư liệu chiến tranh</option><option value="sepia">Hoài niệm (sepia)</option><option value="vhs">Băng VHS</option></select></label></div>
    <div class="note">Tự động: khung nào có lời đọc nhắc tới mưa, tuyết, sương, gió, bụi, lửa, nổ, lá rơi, đom đóm, sấm chớp, nắng thì tự phủ hiệu ứng nhẹ lên khung đó (hiểu cả tiếng Anh, Trung, Nhật, Hàn, Pháp, Đức, Tây Ban Nha…). Kiểu phim phủ lên cả video. Khung đã có chuyển động AI không phủ thời tiết để khỏi chồng.</div>
    <label class="chk"><input type="checkbox" id="shake"> Rung như cầm máy (dễ gây khó chịu, mặc định tắt)</label>
    <div class="note">Khung nào đã có chuyển động AI thì tự bỏ zoom/rung, để chuyển động AI chạy một mình.</div>
    <label class="chk"><input type="checkbox" id="subs" checked> Chèn phụ đề vào video (tự theo tiếng của truyện)</label>
    <label class="chk"><input type="checkbox" id="srt" checked> Xuất kèm file .srt</label>
    <details id="subbox"><summary>Kiểu phụ đề: font chữ, vị trí (kéo thả), màu, cỡ chữ</summary>
      <div class="subprev" id="sbPrev" data-a="16:9"><div class="t" id="sbText"><span>Đây là phụ đề mẫu của video</span></div></div>
      <div class="note" id="sbHint">Kéo chữ mẫu trong khung xem trước tới chỗ bạn muốn, tool tự chuyển sang «Tùy ý».</div>
      <div class="row"><label>Font chữ<select id="sFont"></select></label>
        <label>Độ đậm<select id="sWeight"><option value="bold">Đậm</option><option value="regular">Thường</option></select></label></div>
      <div class="note" id="sFontNote"></div>
      <div class="row"><label>Vị trí<select id="sPos"><option value="auto">Mặc định (hơi cao hơn đáy)</option><option value="top">Trên</option><option value="middle">Giữa</option><option value="bottom">Dưới sát đáy</option><option value="custom">Tùy ý (kéo chữ mẫu)</option></select></label></div>
      <div class="row" id="sPosFree" style="display:none"><label>Ngang: <b id="sPxv">50</b>%<input type="range" id="sPx" min="3" max="97" step="1" value="50"></label>
        <label>Dọc: <b id="sPyv">88</b>%<input type="range" id="sPy" min="3" max="97" step="1" value="88"></label></div>
      <div class="row"><label>Cỡ chữ: <b id="sSizev">37</b><input type="range" id="sSize" min="20" max="80" step="1" value="37"></label>
        <label>Độ dày viền: <b id="sSwv">4</b><input type="range" id="sSw" min="0" max="10" step="1" value="4"></label></div>
      <div class="row"><label>Màu chữ<input type="color" id="sColor" value="#ffffff"></label><label>Màu viền<input type="color" id="sScolor" value="#0a0a10"></label></div>
      <label class="chk"><input type="checkbox" id="sBg"> Nền sau chữ</label>
      <div class="row" id="sBgOpts"><label>Màu nền<input type="color" id="sBgcolor" value="#000000"></label><label class="chk" style="margin-top:30px"><input type="checkbox" id="sRound"> Bo tròn góc</label></div>
      <div class="row"><button class="sec" id="sReset" type="button">Về mặc định</button></div>
    </details>
    <label class="chk"><input type="checkbox" id="music" checked> Nhạc nền nhẹ</label>
    <label class="chk"><input type="checkbox" id="amb" checked> Âm thanh hiệu ứng (mưa, nổ, sói…)</label>
    <button id="go">▶ TẠO VIDEO</button>
    <button class="sec" id="stop" style="width:100%;margin-top:8px;display:none">Dừng</button>
  </div>
</section></main>
<script>
const $=id=>document.getElementById(id);let era="";let timer=null;
async function api(p,b){const r=await fetch(p,b?{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(b)}:undefined);return r.json()}
(async()=>{const d=await api('/api/init');$('ver').textContent='v'+d.version;
 const E=$('eras');for(const k of ['modern']){const c=document.createElement('div');c.className='era'+(k==='modern'?' on':'');c.dataset.k=k;
  c.innerHTML='<div class="pv">'+(d.previews[k]||[]).map(u=>'<img src="'+u+'">').join('')+'</div><div class="nm">'+d.eras[k]+'</div>';
  c.onclick=()=>{era=k;SC=[];preview();document.querySelectorAll('.era').forEach(x=>x.classList.toggle('on',x.dataset.k===k))};E.appendChild(c)}
 era='modern';
 d.voices.forEach(([i,v])=>{const o=document.createElement('option');o.value=i;o.textContent=v;$('voice').appendChild(o)});
 window.D=d;fillNarr();pollVoices(0);
 d.browsers.forEach((v,i)=>{const o=document.createElement('option');o.value=i;o.textContent=v;$('browser').appendChild(o)});
 await restoreUi();
 })();
function esc(x){return String(x).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/"/g,'&quot;')}
function groupVoices(rows,brand,pre,o){const g={};rows.forEach(r=>{(g[r[2]]=g[r[2]]||[]).push(o(pre+r[0],r[1]))});return Object.keys(g).map(k=>'<optgroup label="'+esc(brand+' — '+k)+'">'+g[k].join('')+'</optgroup>').join('')}
function matchVoice(){const d=window.D,lg=$('lang').value;if(!lg||!d||!d.nar)return;const m=/^ms:(.+)$/.exec($('narr').value||'');if(!m)return;const row=d.ms.find(r=>r[0]===m[1]);if(!row||row[3]===lg||row[3]==='*'||!d.nar[lg])return;$('narr').value='ms:'+d.nar[lg]}
$('lang').addEventListener('change',matchVoice);
$('vTest').onclick=async()=>{const b=$('vTest');b.disabled=true;$('vMsg').textContent='Đang đọc mẫu…';
 const txt=(($('text').value||'').split(/\n+/).map(x=>x.trim()).find(x=>x&&!/^\[?(?:@|Cảnh:)/i.test(x))||'').slice(0,160);
 try{const r=await api('/api/voice/sample',{narrator:$('narr').value,text:txt,speed:+$('speed').value,vol:+$('vol').value,lang:$('lang').value,voice:+$('voice').value});
  $('vMsg').textContent='';if(r.error){$('err').textContent=r.error;$('err').scrollIntoView({block:'nearest'})}else{$('err').textContent='';const a=$('vAud');a.style.display='block';a.src=r.url;a.play().catch(()=>{})}}
 catch(e){$('vMsg').textContent='Không đọc thử được.'}b.disabled=false};
function pollVoices(n){const d=window.D;if(!d||d.cat>0||n>8)return;setTimeout(async()=>{try{const r=await fetch('/api/voices').then(x=>x.json());if(r.cat>0){d.ms=r.ms;d.nar=r.nar;d.cat=r.cat;fillNarr()}else pollVoices(n+1)}catch(e){pollVoices(n+1)}},4000)}
function fillNarr(){const d=window.D;if(!d)return;const cur=$('narr').value;const o=(v,t)=>'<option value="'+esc(v)+'">'+esc(t)+'</option>';
 let h=o('','Tự động (Microsoft: nam/nữ theo nhân vật)')+o('auto:vieneu','Tự động (VieNeu: mỗi nhân vật một giọng có sẵn, theo nam/nữ)');
 if(d.az.key_set)h+=o('auto:azure','Tự động (Azure: nam/nữ theo nhân vật)');
 h+='<optgroup label="VieNeu — giọng có sẵn, tiếng Việt">'+d.vp.map(([n,l])=>o('vp:'+n,n+' — '+l)).join('')+'</optgroup>';
 if(d.mine.length)h+='<optgroup label="Giọng clone của bạn (voices/*.wav)">'+d.mine.map(([k,l])=>o(k,l+' — giọng clone')).join('')+'</optgroup>';
 h+=groupVoices(d.ms,'Microsoft','ms:',o);
 if(d.az.key_set)h+=groupVoices(d.az.voices.map(([s,l,g,loc])=>[s,l,loc]),'Azure','az:',o);
 $('narr').innerHTML=h;if([...$('narr').options].some(x=>x.value===cur))$('narr').value=cur;
 $('azregion').value=d.az.region||'';$('azkey').placeholder=d.az.key_set?'đã lưu key '+(d.az.key_tail||'')+' (để trống = giữ nguyên)':'dán key';
 $('azstat').textContent=d.az.key_set?'Đã lưu key · vùng '+d.az.region+' · '+d.az.voices.length+' giọng':'Chưa có key Azure.';renderClone()}
function renderClone(){const d=window.D,el=$('cloneList');if(!el||!d)return;const own=d.own||[];
 el.innerHTML=own.length?own.map(k=>'<div class="row" style="align-items:center;margin-top:6px"><span style="flex:1">'+esc(k)+'</span><button class="sec" type="button" data-del="'+esc(k)+'" aria-label="Xóa giọng '+esc(k)+'">Xóa</button></div>').join(''):'Chưa có giọng nào bạn tự thêm.'}
$('cloneList').addEventListener('click',async e=>{const b=e.target.closest('[data-del]');if(!b)return;const k=b.dataset.del;
 const r=await api('/api/voice/clone/del',{key:k});window.D.mine=r.mine||window.D.mine;window.D.own=r.own||[];if($('narr').value===k)$('narr').value='';fillNarr();saveUi();$('cloneStat').textContent=r.ok?'Đã xóa giọng «'+k+'».':''});
$('cloneAdd').onclick=async()=>{const f=$('cloneFile').files[0],nm=$('cloneName').value.trim(),st=$('cloneStat'),b=$('cloneAdd');
 if(!nm){st.textContent='⚠ Hãy đặt tên giọng.';return}if(!f){st.textContent='⚠ Hãy chọn file mẫu.';return}if(!$('cloneOk').checked){st.textContent='⚠ Hãy tick xác nhận bên dưới.';return}
 b.disabled=true;st.textContent='Đang xử lý file mẫu…';
 try{const data=await new Promise((ok,no)=>{const fr=new FileReader();fr.onload=()=>ok(fr.result);fr.onerror=()=>no(fr.error);fr.readAsDataURL(f)});
  const r=await api('/api/voice/clone/add',{data:data,name:nm,ok:true});if(r.error){st.textContent='⚠ '+r.error;b.disabled=false;return}
  window.D.mine=r.mine;window.D.own=r.own;fillNarr();$('narr').value=r.key;saveUi();
  st.textContent='✔ Đã thêm giọng «'+r.key+'» và chọn làm giọng đọc. Bấm «Nghe thử giọng» để nghe (lần đầu tải model nên hơi lâu).';
  $('cloneName').value='';$('cloneFile').value='';$('cloneOk').checked=false}catch(e){st.textContent='⚠ Không thêm được giọng.'}b.disabled=false};
$('aztest').onclick=async()=>{$('azstat').textContent='Đang kiểm tra…';const r=await api('/api/azure/test',{key:$('azkey').value.trim(),region:$('azregion').value.trim()});
 if(r.error){$('azstat').textContent='⚠ '+r.error;return}
 window.D.az=r.az;$('azkey').value='';fillNarr();$('azstat').textContent='✔ Kết nối được. Đã lưu key trên máy này · tải '+r.az.voices.length+' giọng ('+r.az.n_vi+' giọng tiếng Việt).'};
$('azclear').onclick=async()=>{const r=await api('/api/azure/clear',{});window.D.az=r.az;if($('narr').value.startsWith('az:')||$('narr').value==='auto:azure')$('narr').value='';fillNarr();$('azstat').textContent='Đã xóa key Azure.'};
let pt=null;$('text').oninput=()=>{clearTimeout(pt);pt=setTimeout(preview,700)};
async function preview(){const t=$('text').value.trim();if(!t){$('info').textContent='';$('chars').innerHTML='';return}
 const r=await api('/api/preview',{text:t,era});if(r.error){$('info').textContent='';return}
 $('info').textContent='Tool hiểu: '+r.lines+' câu • '+r.scenes+' cảnh • '+r.chars.length+' nhân vật';
 $('chars').innerHTML=r.chars.map(c=>'<span>'+c.name+'</span>').join('');buildScenes(r)}
let SC=[];
function buildScenes(r){SC=(r.scene_list||[]).map((s,i)=>SC[i]||{});$('scenebox').style.display=r.scene_list&&r.scene_list.length?'block':'none';$('scenebox').open=false;
 $('scenes').innerHTML=(r.scene_list||[]).map((s,i)=>'<div style="background:#12162a;border:1px solid var(--line);border-radius:10px;padding:8px 10px;margin-top:8px"><div style="font-size:14px"><b>Cảnh '+(i+1)+'</b> · '+s.text.replace(/</g,'&lt;')+'</div>'+
  '<div class="row" style="margin-top:6px"><label>Nơi chốn<select data-i="'+i+'" class="sp"><option value="">Tự nhận diện'+(s.place?' ('+s.place+')':'')+'</option>'+r.places.map(p=>'<option'+((SC[i]||{}).place===p?' selected':'')+'>'+p+'</option>').join('')+'</select></label>'+
  '<label>Giây tối thiểu (lời đọc dự kiến ~'+s.dur+'s)<input type="number" data-i="'+i+'" class="ss" min="0" max="120" placeholder="tự động" value="'+((SC[i]||{}).secs||'')+'"></label></div>'+
  '<input data-i="'+i+'" class="sc" placeholder="Hoặc tự gõ mô tả nền (vd: phòng làm việc nhỏ, ban đêm)" style="width:100%;margin-top:6px" value="'+((SC[i]||{}).custom||'').replace(/"/g,'&quot;')+'"></div>').join('');
 document.querySelectorAll('#scenes .sp').forEach(e=>e.onchange=()=>{SC[+e.dataset.i]=Object.assign(SC[+e.dataset.i]||{},{place:e.value})});
 document.querySelectorAll('#scenes .ss').forEach(e=>e.oninput=()=>{SC[+e.dataset.i]=Object.assign(SC[+e.dataset.i]||{},{secs:+e.value||0})});
 document.querySelectorAll('#scenes .sc').forEach(e=>e.oninput=()=>{SC[+e.dataset.i]=Object.assign(SC[+e.dataset.i]||{},{custom:e.value})})}
$('speed').oninput=()=>$('spv').textContent=(+$('speed').value).toFixed(2).replace(/0$/,'')+'×';$('fxamt').oninput=()=>$('fxv').textContent=$('fxamt').value+'%';
$('vol').oninput=()=>$('volv').textContent=$('vol').value+'%';
$('login').onclick=async()=>{$('fmsg').textContent='Đang mở…';try{await api('/api/flow/login',{browser:+$('browser').value})}catch(e){$('fmsg').textContent='Lỗi gọi tool: '+e}};
/* ---------- phu de: font chu + keo tha vi tri (giong tab Ve ra) ---------- */
const SUBDEF={font:"",pos:"auto",weight:"bold",size:37,color:"#ffffff",scolor:"#0a0a10",sw:4,bg:false,bgcolor:"#000000",round:false,px:.5,py:.88};
let SUB=Object.assign({},SUBDEF),FONTS=[],FONTS_READY=Promise.resolve();
const YFR={top:.12,middle:.5};
const clampf=(v,d)=>{v=+v;return isFinite(v)?Math.max(.03,Math.min(.97,v)):d};
const isHex=v=>typeof v==='string'&&/^#[0-9a-fA-F]{6}$/.test(v);
function cleanSub(o){const r=Object.assign({},SUBDEF);if(!o||typeof o!=='object')return r;
 if(typeof o.font==='string')r.font=o.font;if(['auto','top','middle','bottom','custom'].includes(o.pos))r.pos=o.pos;if(o.weight==='regular')r.weight='regular';
 ['size','sw'].forEach(k=>{const n=+o[k];if(isFinite(n))r[k]=n});['color','scolor','bgcolor'].forEach(k=>{if(isHex(o[k]))r[k]=o[k]});
 r.bg=!!o.bg;r.round=!!o.round;r.px=clampf(o.px,.5);r.py=clampf(o.py,.88);return r}
function fontCss(id){const dflt='"Segoe UI",system-ui,sans-serif';if(!id)return dflt;const f=FONTS.find(x=>x.id===id);if(!f)return dflt;return (f.user||f.bundled)?'"uf_'+f.id.replace(/[^a-z0-9]/gi,'_')+'"':'"'+f.label+'",system-ui,sans-serif'}
function fontWeight(s){const f=FONTS.find(x=>x.id===s.font);return s.weight==='regular'||(f&&!f.bold&&(f.user||f.bundled))?'400':'700'}
const subCenter=()=>{const p=$('sbPrev').getBoundingClientRect(),r=$('sbText').getBoundingClientRect();return {px:(r.left+r.width/2-p.left)/p.width,py:(r.top+r.height/2-p.top)/p.height}};
function subStyle(){return JSON.stringify(SUB)===JSON.stringify(SUBDEF)?null:{font:SUB.font,pos:SUB.pos,px:SUB.px,py:SUB.py,size:SUB.size,color:SUB.color,scolor:SUB.scolor,sw:SUB.sw,bg:SUB.bg,bgcolor:SUB.bgcolor,round:SUB.round,weight:SUB.weight}}
function renderSub(){const s=SUB,asp=$('aspect').value==='9:16'?'9:16':'16:9',el=$('sbPrev'),t=$('sbText');el.dataset.a=asp;
 const base=asp==='9:16'?el.clientWidth:el.clientHeight;const k=(base||(asp==='9:16'?169:200))/720;
 const yf=YFR[s.pos]!==undefined?YFR[s.pos]:(asp==='16:9'?.8:.72);
 if(s.pos==='custom'){const px=clampf(s.px,.5),py=clampf(s.py,.88);t.style.left=(px*100)+'%';t.style.top=(py*100)+'%';t.style.bottom='auto';t.style.transform='translate(-50%,-50%)';t.style.width=Math.max(30,Math.min(86,200*Math.min(px,1-px)))+'%'}
 else{t.style.left='50%';t.style.transform='translateX(-50%)';t.style.width='86%';if(s.pos==='bottom'){t.style.top='auto';t.style.bottom=((1-(asp==='9:16'?.9:.955))*100)+'%'}else{t.style.bottom='auto';t.style.top=(yf*100)+'%'}}
 t.style.fontSize=(s.size*k)+'px';t.style.fontFamily=fontCss(s.font);t.style.fontWeight=fontWeight(s);t.style.color=s.color;
 t.style.webkitTextStroke=(2*s.sw*k)+'px '+s.scolor;t.style.paintOrder='stroke fill';
 const sp=t.firstElementChild,rgb=[1,3,5].map(i=>parseInt(s.bgcolor.slice(i,i+2),16));sp.style.background=s.bg?'rgba('+rgb.join(',')+',.745)':'none';sp.style.borderRadius=s.bg&&s.round?'.45em':'0';sp.style.padding=s.bg?'.1em .4em':'0';
 $('sSizev').textContent=s.size;$('sSwv').textContent=s.sw;$('sPosFree').style.display=s.pos==='custom'?'':'none';
 if(s.pos==='custom'){const px=clampf(s.px,.5),py=clampf(s.py,.88);$('sPx').value=Math.round(px*100);$('sPy').value=Math.round(py*100);$('sPxv').textContent=Math.round(px*100);$('sPyv').textContent=Math.round(py*100)}
 $('sBgOpts').style.opacity=s.bg?1:.45;$('sBgOpts').style.pointerEvents=s.bg?'':'none';
 $('sbPrev').style.opacity=$('subs').checked?1:.45;$('sbText').style.pointerEvents=$('subs').checked?'':'none'}
function subPut(){[['sSize','size'],['sSw','sw'],['sColor','color'],['sScolor','scolor'],['sBgcolor','bgcolor'],['sWeight','weight'],['sPos','pos']].forEach(([id,k])=>{$(id).value=SUB[k]});
 $('sBg').checked=!!SUB.bg;$('sRound').checked=!!SUB.round;if([...$('sFont').options].some(o=>o.value===SUB.font))$('sFont').value=SUB.font;else{$('sFont').value='';SUB.font=''}renderSub()}
function subChanged(){renderSub();saveUi()}
[['sSize','size','num'],['sSw','sw','num'],['sColor','color'],['sScolor','scolor'],['sBgcolor','bgcolor'],['sBg','bg','check'],['sRound','round','check']].forEach(([id,k,kind])=>{const el=$(id);
 el.addEventListener(kind==='check'?'change':'input',()=>{SUB[k]=kind==='check'?el.checked:kind==='num'?+el.value:el.value;subChanged()})});
$('sWeight').addEventListener('change',()=>{SUB.weight=$('sWeight').value;subChanged()});
$('sFont').addEventListener('change',()=>{SUB.font=$('sFont').value;subChanged()});
$('sPos').addEventListener('change',()=>{const v=$('sPos').value;if(v==='custom'&&SUB.pos!=='custom'){const c=subCenter();SUB.px=clampf(c.px,.5);SUB.py=clampf(c.py,.88)}SUB.pos=v;subChanged()});
$('sPx').addEventListener('input',()=>{SUB.px=+$('sPx').value/100;subChanged()});$('sPy').addEventListener('input',()=>{SUB.py=+$('sPy').value/100;subChanged()});
(()=>{const t=$('sbText'),el=$('sbPrev');let dr=null;     // keo chu mau toi cho tuy y
 t.addEventListener('pointerdown',e=>{if(!$('subs').checked)return;e.preventDefault();const c=subCenter();dr={x:e.clientX,y:e.clientY,px:c.px,py:c.py,moved:false};try{t.setPointerCapture(e.pointerId)}catch(x){}t.classList.add('drag')});
 t.addEventListener('pointermove',e=>{if(!dr)return;const p=el.getBoundingClientRect(),dx=(e.clientX-dr.x)/p.width,dy=(e.clientY-dr.y)/p.height;if(!dr.moved&&Math.abs(dx)+Math.abs(dy)<.004)return;dr.moved=true;SUB.pos='custom';SUB.px=clampf(dr.px+dx,.5);SUB.py=clampf(dr.py+dy,.88);$('sPos').value='custom';renderSub()});
 const end=()=>{if(!dr)return;const m=dr.moved;dr=null;t.classList.remove('drag');if(m)subChanged()};
 t.addEventListener('pointerup',end);t.addEventListener('pointercancel',end)})();
$('sReset').onclick=()=>{SUB=Object.assign({},SUBDEF);subPut();saveUi()};
$('subs').addEventListener('change',renderSub);$('aspect').addEventListener('change',renderSub);$('subbox').addEventListener('toggle',renderSub);window.addEventListener('resize',renderSub);
FONTS_READY=(async()=>{try{const r=await api('/api/fonts');FONTS=r.fonts||[];
 let css='';FONTS.filter(f=>f.user||f.bundled).forEach(f=>{css+='@font-face{font-family:"uf_'+f.id.replace(/[^a-z0-9]/gi,'_')+'";src:url("/api/fontfile?id='+encodeURIComponent(f.id)+'")}'});
 if(css){const st=document.createElement('style');st.textContent=css;document.head.appendChild(st)}
 $('sFont').innerHTML='<option value="">Mặc định (Segoe UI)</option>'+FONTS.map(f=>'<option value="'+esc(f.id)+'">'+esc(f.label)+(f.user?' (của bạn)':'')+'</option>').join('');
 $('sFontNote').innerHTML='Muốn thêm font: bỏ file .ttf hoặc .otf vào thư mục font rồi tải lại trang. Chọn font có đủ dấu tiếng Việt. <a href="#" id="fontDir" style="color:var(--acc2);font-weight:700">Mở thư mục font</a>';
 $('fontDir').onclick=e=>{e.preventDefault();api('/api/openfolder',{which:'fonts'})}}catch(e){}renderSub()})();
/* ---------- nho cau hinh tab nay (luu o may): sang tab Ve ra roi quay lai van con ---------- */
const NOSAVE=new Set(['aikey','azkey','azregion','vidsurl','cloneName','cloneOk']);          // key bi mat / link tai lieu cu: khong luu
let UI_READY=false,uiT=0,uiDirty=false;
function uiEls(){return [...document.querySelectorAll('main input[id],main select[id],main textarea[id]')].filter(e=>!NOSAVE.has(e.id)&&e.type!=='file'&&e.type!=='password'&&!e.closest('#subbox,#scenes,#revlist,#projlist,#frlist'))}
function uiState(){const f={};uiEls().forEach(e=>{f[e.id]=e.type==='checkbox'?e.checked:e.value});if((f.text||'').length>400000)delete f.text;
 return {f,sub:SUB}}
function saveUi(now){if(!UI_READY)return Promise.resolve();uiDirty=true;clearTimeout(uiT);
 const go=()=>{uiDirty=false;return api('/api/storyui',{ui:uiState()}).catch(()=>{uiDirty=true})};
 if(now)return go();uiT=setTimeout(go,600);return Promise.resolve()}
['input','change'].forEach(ev=>document.addEventListener(ev,e=>{if(e.target&&e.target.closest&&e.target.closest('main')&&!e.target.closest('#subbox'))saveUi()}));
document.addEventListener('click',e=>{const a=e.target.closest&&e.target.closest('.tabs a[href]');if(!a||!uiDirty||e.ctrlKey||e.metaKey||e.shiftKey||e.button)return;
 e.preventDefault();saveUi(true).then(()=>{location.href=a.href})},true);
window.addEventListener('pagehide',()=>{if(!uiDirty)return;try{fetch('/api/storyui',{method:'POST',keepalive:true,headers:{'Content-Type':'application/json'},body:JSON.stringify({ui:uiState()})})}catch(e){}});
async function restoreUi(){try{
 const r=await api('/api/storyui');const u=(r&&r.ui)||{},f=u.f||{};await FONTS_READY;
 uiEls().forEach(e=>{if(!Object.prototype.hasOwnProperty.call(f,e.id))return;const v=f[e.id];
  if(e.type==='checkbox')e.checked=!!v;
  else if(e.tagName==='SELECT'){if([...e.options].some(o=>o.value===String(v)))e.value=String(v)}
  else if(typeof v==='string'||typeof v==='number')e.value=v});
 if(u.sub)SUB=cleanSub(u.sub);
 $('speed').oninput();$('fxamt').oninput();$('vol').oninput();subPut();
 if($('text').value.trim())preview();
 }catch(e){}finally{UI_READY=true}}
let revsig='';
let frsig='';function showFr(fr){const b=$('frbox');b.style.display=fr&&fr.length?'block':'none';if(!fr||!fr.length){frsig='';return}const sig=fr.map(f=>f.state+f.url).join('|');if(sig===frsig)return;frsig=sig;const d=fr.filter(f=>f.state==='done').length;$('frcount').textContent='('+d+'/'+fr.length+' xong)';$('frlist').innerHTML=fr.map(f=>{const ic={done:'✓',drawing:'✎',pending:'○'}[f.state]||'';return '<div style="background:#12162a;border:1px solid var(--line);border-radius:8px;padding:5px;font-size:11px;'+(f.state==='pending'?'opacity:.45':'')+(f.state==='drawing'?';border-color:var(--acc)':'')+'">'+(f.url?'<img src="'+f.url+'" style="width:100%;height:70px;object-fit:cover;border-radius:5px">':'<div style="height:70px;display:flex;align-items:center;justify-content:center;opacity:.6">'+(f.state==='drawing'?'đang vẽ…':'chờ')+'</div>')+'<div><b>'+ic+' '+f.n+'</b> '+(f.text||'').replace(/</g,'&lt;')+'</div>'+(f.state==='done'?'<button class="sec" data-redo="'+f.n+'" style="padding:2px 8px;font-size:11px;margin-top:4px;width:100%">↻ Vẽ lại ảnh này</button>':'')+'</div>'}).join('')}
document.addEventListener('click',async e=>{const b=e.target.closest('button[data-redo]');if(!b)return;b.disabled=true;b.textContent='đã yêu cầu…';const r=await api('/api/frame/redo',{n:+b.dataset.redo});if(r.error){alert(r.error);b.disabled=false;b.textContent='↻ Vẽ lại ảnh này'}});
function showRev(items){const sig=JSON.stringify(items.map(i=>i.url));$('revbox').style.display=items.length?'block':'none';if(!items.length){revsig='';return}
 if(sig===revsig)return;revsig=sig;try{$('revbox').scrollIntoView({behavior:'smooth',block:'center'});document.title='⏸ Chờ duyệt hình – AnimStudio'}catch(e){}$('revlist').innerHTML=items.map(i=>'<label style="background:#12162a;border:1px solid var(--line);border-radius:12px;padding:8px;text-align:center;cursor:pointer"><img src="'+i.url+'" style="width:100%;height:150px;object-fit:contain;background:#fff;border-radius:8px"><div style="margin-top:6px"><input type="checkbox" data-n="'+i.name+'"> '+i.name+'</div>'+(i.cap?'<div style="font-size:11px;opacity:.75;margin-top:3px">'+i.cap.replace(/</g,'&lt;')+'</div>':'')+'</label>').join('')}
$('revok').onclick=async()=>{await api('/api/review',{redo:[]});showRev([])};
$('revredo').onclick=async()=>{const r=[...document.querySelectorAll('#revlist input:checked')].map(x=>x.dataset.n);await api('/api/review',{redo:r});revsig=''};
$('stop').onclick=()=>api('/api/cancel',{});$('dl').onclick=async e=>{const v=$('dl').dataset.v;if(!v)return;e.preventDefault();const r=await api('/api/savevideo',{video:v});if(r.fallback){location.href=$('dl').href;return}if(r.error){alert(r.error);return}if(r.ok)alert('Đã lưu video: '+r.path)};$('failretry').onclick=()=>api('/api/retry',{});$('failskip').onclick=()=>api('/api/retry',{skip:true});$('folder').onclick=()=>api('/api/openfolder',{});
$('go').onclick=async()=>{const t=$('text').value.trim();if(!t){$('err').textContent='Hãy dán truyện hoặc kịch bản trước.';return}
 $('err').textContent='';$('result').style.display='none';
 const body={text:t,era,diverse:$('diverse').checked,lang:$('lang').value,draw:'flow',browser:+$('browser').value,flow_bg:$('flowbg').checked,variants:true,acts:true,art:$('art').value,mouth:false,titlecard:false,frames:true,ai:+$('ai').value,ai_key:$('aikey').value,tabs:+$('aitabs').value,flow_tabs:+$('flowtabs').value,beat:$('beat').value,motion:$('motion').value,motion_max:+$('motionmax').value||15,motion_safe:$('motionsafe').checked,motion_engine:'vids',vids_url:$('vidsurl').value,hide_flow:$('hideflow').checked,review:$('review').checked,scene_cfg:SC,speed:+$('speed').value,vol:+$('vol').value,dsec:+$('dsec').value||0,
  aspect:$('aspect').value,res:$('res').value,fps:+$('fps').value,voice:+$('voice').value,narrator:$('narr').value,camfx:$('camfx').value,camstr:$('camstr').value,shake:$('shake').checked,shake2:true,fxmode:$('fxmode').value,fxamt:+$('fxamt').value,fxlook:$('fxlook').value,subs:$('subs').checked,sub_style:subStyle(),srt:$('srt').checked,music:$('music').checked,amb:$('amb').checked};
 const r=await api('/api/generate',body);if(r.error){$('err').textContent=r.error;return}
 if(r.match){const m=r.match;if(confirm('Kịch bản này ĐÃ CÓ dự án: "'+(m.title||'').slice(0,50)+'" ('+(m.total?('đã vẽ '+m.done+'/'+m.total+' khung'):'chưa có khung')+').\n\nOK = TIẾP TỤC dự án cũ (dùng lại ảnh + giọng đã lưu, không làm lại từ đầu; sau đó chọn hoàn thiện/chuyển động ở khung Quản lý dự án)\nHủy = tạo dự án MỚI từ đầu')){const rr=await api('/api/generate',{resume:m.id,finish_now:false,override:ovr()});if(rr.error)$('err').textContent=rr.error}else{const r2=await api('/api/generate',Object.assign(body,{new:true}));if(r2.error)$('err').textContent=r2.error}}};
let projsig='',ptick=0;
async function loadProjects(){try{const r=await api('/api/projects');r.projects=r.projects.filter(p=>p.mode!=='draw');const sig=JSON.stringify(r.projects);if(sig===projsig)return;projsig=sig;
 const st={done:'✔ hoàn thành',video:'✔ có video, đang làm phần phụ',running:'⏳ đang chạy',stopped:'⏸ đã dừng',error:'⚠ lỗi'};
 $('projlist').innerHTML=r.projects.length?r.projects.slice(0,15).map(p=>'<div style="border:1px solid var(--line);border-radius:10px;padding:8px;margin:6px 0"><div><b>'+(p.title||'(không tên)').replace(/</g,'&lt;')+'</b> <span style="opacity:.7;font-size:12px">'+p.created+'</span></div><div style="font-size:12px;opacity:.85;margin:3px 0">'+(st[p.status]||p.status)+' · bước: '+(p.stage||'')+(p.frames_total?' · khung '+(p.frames_done||0)+'/'+p.frames_total:'')+(p.error&&p.status!=='done'?' · '+p.error.replace(/</g,'&lt;'):'')+'</div><div class="row"><button data-act="resume" data-id="'+p.id+'">▶ Tiếp tục</button><button class="sec" data-act="finish" data-id="'+p.id+'">⏩ Dựng video ngay bằng khung đã có</button><button class="sec" data-act="rescue" data-id="'+p.id+'">🛟 Cứu: ghép các ảnh đã vẽ</button><button class="sec" data-act="revoice" data-id="'+p.id+'">🔊 Đọc lại giọng</button><button class="sec" data-act="motion" data-id="'+p.id+'">🎞 Hoàn thiện video (chọn chuyển động)</button>'+(p.video?'<a href="/dl/'+encodeURIComponent(p.video)+'" download><button class="sec">⬇ Video</button></a>':'')+'<button class="sec" data-act="restart" data-id="'+p.id+'">♻ Tạo lại từ đầu</button><button class="sec" data-act="delimg" data-id="'+p.id+'">🧹 Xóa nhóm ảnh vẽ nhầm</button><button class="sec" data-act="folder" data-id="'+p.id+'">📂 Thư mục</button><button class="sec" data-act="del" data-id="'+p.id+'">🗑</button></div></div>').join(''):'<div class="note">Chưa có dự án nào.</div>'}catch(e){}}
function ovr(){return Object.assign({motion_engine:'vids',vids_url:$('vidsurl').value,motion_safe:$('motionsafe').checked,motion_lvl:$('motionlvl').value,flow_tabs:+$('flowtabs').value,tabs:+$('aitabs').value,hide_flow:$('hideflow').checked},$('useov').checked?ovr0():{})}
function ovr0(){return {camfx:$('camfx').value,camstr:$('camstr').value,shake:$('shake').checked,shake2:true,fxmode:$('fxmode').value,fxamt:+$('fxamt').value,fxlook:$('fxlook').value,narrator:$('narr').value,voice:+$('voice').value,speed:+$('speed').value,vol:+$('vol').value,subs:$('subs').checked,sub_style:subStyle(),srt:$('srt').checked,music:$('music').checked,amb:$('amb').checked}}
function vtxt(){const n=$('narr');return n.options[n.selectedIndex]?n.options[n.selectedIndex].text:''}
document.addEventListener('click',async e=>{const b=e.target.closest('button[data-act]');if(!b)return;if(!b)return;const id=b.dataset.id,a=b.dataset.act;
 if(a==='restart'){if(!confirm('TẠO LẠI TỪ ĐẦU dự án này?\n\nĐọc/chia lại kịch bản, đọc lại giọng, vẽ lại TẤT CẢ ảnh (rất lâu). Ảnh/giọng cũ không bị xóa nhưng sẽ không dùng nữa.\n\nNếu chỉ muốn làm tiếp phần dang dở thì bấm "▶ Tiếp tục" thay vì nút này.'))return;$('err').textContent='';$('result').style.display='none';const rs=await api('/api/generate',{resume:id,finish_now:false,override:Object.assign(ovr(),{fresh_salt:String(Date.now()),redo_voice:true,reset_script:true})});if(rs.error)$('err').textContent=rs.error;window.scrollTo({top:document.body.scrollHeight,behavior:'smooth'});return}
 if(a==='delimg'){const c=(await (await fetch('/api/rescue/clusters')).json()).clusters;if(!c.length){alert('Bộ nhớ không có ảnh khung nào.');return}
  const lst=c.map(x=>x.idx+') '+x.count+' ảnh, vẽ từ '+x.t0+' đến '+x.t1).join('\n');const di=prompt('Các nhóm ảnh trong bộ nhớ (theo lần vẽ):\n'+lst+'\n\nGõ SỐ nhóm ảnh VẼ NHẦM cần XÓA (ví dụ nhóm cổ đại vẽ nhầm). Bỏ trống = hủy:','');if(!di)return;
  const x=c.find(y=>String(y.idx)===di.trim());if(!x){alert('Không có nhóm đó.');return}if(!confirm('XÓA vĩnh viễn '+x.count+' ảnh của nhóm '+x.idx+' (vẽ '+x.t0+'–'+x.t1+')? Không hoàn tác được.'))return;
  const rd=await api('/api/rescue/delete',{cluster:+di});alert('Đã xóa '+rd.deleted+' ảnh.');return}
 if(a==='folder'){await api('/api/openfolder',{project:id});return}
 if(a==='del'){if(confirm('Xóa dự án này khỏi danh sách? (ảnh/giọng đã lưu vẫn còn)')){await api('/api/project/delete',{id});projsig='';loadProjects()}return}
 if(a==='motion'){const ch=prompt('Dự án đã có khung. Chọn cách hoàn thiện (gõ số):\n\n1 = Dựng video hoàn chỉnh NGAY, không chuyển động AI (có phủ hiệu ứng/kiểu phim nếu bạn đã chọn)\n2 = Tạo chuyển động AI cho khung có hành động/hình chèn (tối đa '+($('motionmax').value||15)+' khung) rồi dựng video\n3 = Tạo chuyển động AI cho TẤT CẢ khung (rất lâu)\n\nẢnh + giọng đã lưu được dùng lại, không vẽ/đọc lại.','1');if(!ch)return;$('err').textContent='';$('result').style.display='none';
  if(ch.trim()==='1'){const r1=await api('/api/generate',{resume:id,finish_now:true,override:Object.assign(ovr(),{motion:'off',mouth:false})});if(r1.error)$('err').textContent=r1.error;window.scrollTo({top:document.body.scrollHeight,behavior:'smooth'});return}
  const mv=ch.trim()==='3'?'all':'key';const rm=await api('/api/generate',{resume:id,finish_now:true,override:Object.assign(ovr(),{mouth:false,motion:mv,motion_max:+$('motionmax').value||15,motion_only:true})});if(rm.error)$('err').textContent=rm.error;window.scrollTo({top:document.body.scrollHeight,behavior:'smooth'});return}
 if(a==='revoice'){if(!confirm('Xóa giọng đã đọc của dự án này và ĐỌC LẠI từ đầu bằng giọng đang chọn ở mục ③:\n\n'+vtxt()+'\n\nẢnh/khung đã vẽ vẫn giữ nguyên. Tiếp tục?'))return;$('err').textContent='';$('result').style.display='none';const r0=await api('/api/generate',{resume:id,finish_now:false,override:Object.assign(ovr(),ovr0(),{redo_voice:true})});if(r0.error)$('err').textContent=r0.error;window.scrollTo({top:document.body.scrollHeight,behavior:'smooth'});return}
 if(a==='rescue'){const c=(await (await fetch('/api/rescue/clusters')).json()).clusters;if(!c.length){alert('Không có ảnh khung nào trong bộ nhớ.');return}
  const lst=c.map(x=>x.idx+') '+x.count+' ảnh, vẽ từ '+x.t0+' đến '+x.t1).join('\n');const ci=prompt('Các nhóm ảnh đã vẽ trong bộ nhớ:\n'+lst+'\n\nChọn số thứ tự nhóm chứa các khung của video này (thường là nhóm nhiều ảnh nhất):',String((c.reduce((m,x)=>x.count>m.count?x:m,c[0])).idx));if(!ci)return;
  const cc=c.find(x=>String(x.idx)===String(ci));const nn=prompt('Có bao nhiêu khung của video này? (xem nhật ký lần chạy trước)',String(cc?cc.count:144));if(!nn)return;const mch=prompt('Sau khi ghép ảnh, làm gì? (gõ số)\n\n1 = Dựng video hoàn chỉnh ngay, không chuyển động AI\n2 = Chuyển động AI cho khung có hành động/hình chèn (tối đa '+($('motionmax').value||15)+' khung) rồi dựng video\n3 = Chuyển động AI cho TẤT CẢ khung (rất lâu)','1');if(!mch)return;const mo=mch.trim()==='3'?'all':(mch.trim()==='2'?'key':'off');
  $('err').textContent='';$('result').style.display='none';const rr=await api('/api/generate',{resume:id,rescue:+nn,rescue_cluster:+ci,finish_now:true,override:Object.assign(ovr(),{mouth:false,motion:mo,motion_max:+$('motionmax').value||15,motion_only:mo!=='off'})});if(rr.error)$('err').textContent=rr.error;window.scrollTo({top:document.body.scrollHeight,behavior:'smooth'});return}
 $('err').textContent='';$('result').style.display='none';const r=await api('/api/generate',{resume:id,finish_now:a==='finish',override:ovr()});if(r.error)$('err').textContent=r.error;window.scrollTo({top:document.body.scrollHeight,behavior:'smooth'})});
loadProjects();
$('opentabs').onclick=async()=>{const r=await api('/api/flow/tabs',{n:+$('flowtabs').value,browser:+$('browser').value,hide:$('hideflow').checked});if(r.busy)alert('Đang mở tab, đợi xong rồi hãy bấm (đừng bấm lại).')};$('hideflow').onchange=()=>api('/api/flow/hide',{hide:$('hideflow').checked});
async function poll(){try{if(++ptick%5===0)loadProjects();const s=await api('/api/status');let J=s.JOB;const F=s.FLOW;
 const other=J.mode==='draw'&&J.state!=='idle',busyOther=other&&(J.state==='running'||J.state==='paused');                    // viec cua tab 'Ve ra' (dung chung bo nho cong viec): tab Story KHONG hien khung / tien trinh / video cua no
 if(other)J=Object.assign({},J,{review:[],frames:[],pct:0,log:[],video:'',error:'',fail:null,state:'idle',msg:busyOther?'Tab «Vẽ ra» đang chạy (dùng chung Flow) — chờ xong hoặc dừng bên đó rồi mới tạo ở tab này.':'Sẵn sàng.'});
 showRev(J.review||[]);showFr(J.frames);$('pb').style.width=J.pct+'%';$('msg').textContent=J.msg||'Sẵn sàng.';$('log').textContent=J.log.join('\n');$('log').scrollTop=1e9;
 const run=J.state==='running'||J.state==='paused';$('go').disabled=run||busyOther;$('stop').style.display=run?'block':'none';
 const fl=J.fail;$('failbox').style.display=fl?'block':'none';if(fl){$('failwhat').textContent=fl.what;$('failerr').textContent=fl.err;$('failskip').style.display=fl.skip?'block':'none';$('failretry').textContent=fl.kind==='missing'?'↻ Vẽ tiếp các khung còn thiếu':'↻ Thử lại bước này';$('failskip').textContent=fl.kind==='missing'?'▶ Dựng video ngay bằng khung đã có':fl.kind==='gemini'?'Bỏ qua, dùng quy tắc offline':(fl.kind==='vids'?'Bỏ qua, giữ ảnh tĩnh cho khung này':'Bỏ qua, dùng lại khung trước')}
 if(J.state==='error')$('err').textContent=J.error;else if(J.state==='running'||J.state==='paused'||J.state==='done')$('err').textContent='';
 if(J.video&&(J.state==='done'||J.state==='running')){$('result').style.display='block';const u='/out/'+encodeURIComponent(J.video);if($('vid').dataset.u!==u){$('vid').src=u;$('vid').dataset.u=u;$('dl').href='/dl/'+encodeURIComponent(J.video);$('dl').dataset.v=J.video}}
 const p=$('fpill');p.className='pill '+F.state;p.textContent={off:'chưa mở',opening:'đang chờ đăng nhập…',ready:'đã sẵn sàng ✓',error:'lỗi'}[F.state];
 if(F.msg)$('fmsg').textContent=F.msg;if($('tabstat'))$('tabstat').textContent=F.tabmsg||'';$('login').textContent={off:'Mở Flow & đăng nhập',opening:'Không thấy cửa sổ? Bấm để mở lại',ready:'Flow đã sẵn sàng (bấm để đưa lên)',error:'Thử mở lại Flow'}[F.state]||'Mở Flow & đăng nhập'}catch(e){}setTimeout(poll,1200)}poll();
</script></body></html>'''
from . import reveal as _reveal, templates as _templates


def tabbar(active):
    """Thanh tab dung chung: 2 tab la 2 trang rieng, khong lien quan nhau; them the Ban quyen (hien dung thu con bao lau / key con bao nhieu ngay, cham mau theo trang thai)."""
    ic = '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">%s</svg>'
    film = ic % '<rect x="3" y="4" width="18" height="16" rx="3"/><path d="M10 9.2v5.6l4.8-2.8z"/>'
    pen = ic % '<path d="M4 20l4-1 11-11a2.1 2.1 0 0 0-3-3L5 16l-1 4z"/><path d="M14 7l3 3"/>'
    html = ('<nav class="tabs" aria-label="Trang"><span class="tg"><a class="%s" href="/">' + film + ' Tạo Video Story</a><a class="%s" href="/draw">' + pen + ' Vẽ ra</a></span>'
            '<a class="lic %s" id="licChip" href="/license"><span id="licTxt">Bản quyền</span></a></nav>'
            '<script>(function(){fetch("/api/license").then(function(r){return r.json()}).then(function(d){var a=document.getElementById("licChip"),t=document.getElementById("licTxt");'
            'if(a&&t&&d.status){t.textContent=String(d.status.short||t.textContent).replace(/^[^\\p{L}\\p{N}]+/u,"");var l=d.status.level;if(l==="good"||l==="warn"||l==="bad")a.classList.add(l);if(l==="bad")a.style.color="#E2483D"}}).catch(function(){})})()</script>')
    return html % ("on" if active == "story" else "", "on" if active == "draw" else "", "on" if active == "license" else "")


PAGE = PAGE.replace("__TABS__", tabbar("story")).replace("__LANGOPTS__", langs.options_html())

from . import drawpage as _drawpage
DRAW_PAGE = _drawpage.build(tabbar("draw"))
from . import licensepage as _licensepage
LICENSE_PAGE = _licensepage.build(tabbar("license"))


def prepare_props(effect, use_flow, browser=0):
    """Hieu ung dang chon can hinh nao (ban tay, cau be, cuon tranh, co) ma chua co -> tu nho Flow (AI) ve 1 lan dau, luu dung lai (khong co hinh ve bang code). Loi thi bao ro, hieu ung chay khong co hinh do va lan sau tu ve lai."""
    from . import props
    need = [k for k in props.NEED.get(effect, ()) if not props.exists(k)]
    if not need or not use_flow:
        return
    PROPS.update(state="working", msg="Đang nhờ AI vẽ hình cho hiệu ứng…", n=PROPS.get("n", 0) + 1)
    for k in need:
        if CANCEL.is_set():
            break
        jlog("🎨 Lần đầu dùng hiệu ứng này: nhờ AI (Flow) vẽ hình \"%s\" (khoảng 30–60 giây, chỉ làm 1 lần rồi dùng lại)…" % props.ASSETS[k]["label"])
        try:
            props.make(k, browser=browser, log=jlog)
        except Exception as e:
            jlog("⚠ AI chưa vẽ được hình \"%s\" (%s) → video này chạy hiệu ứng KHÔNG có hình đó; lần dựng sau tool sẽ tự nhờ AI vẽ lại (hoặc bấm vẽ ở khung 🎨 Mẫu hình cho hiệu ứng)." % (props.ASSETS[k]["label"], str(e)[:120]))
    PROPS.update(state="done", msg="", n=PROPS.get("n", 0) + 1)


def apply_reveal(P, o):
    """Hieu ung VE RA khi vao khung (reveal.py): kieu + huong mo (revdir) + thoi gian (tu dong theo do dai cau: revauto, hoac co dinh revdur giay) tu cai dat giao dien. Gia tri la -> tat / tu dong / huong tu dong."""
    from . import reveal
    P.revfx = o.get("revfx") if o.get("revfx") in reveal.KEYS else "none"
    try:
        P.revdur = max(0.5, min(8.0, float(o.get("revdur") or 1.6)))
    except (TypeError, ValueError):
        P.revdur = 1.6
    P.revauto = o.get("revauto", True) not in (False, 0, "0", "false")             # mac dinh: thoi gian ve tu dong theo do dai tung cau (kieu ve tay cau dai ve cham, cau ngan ve nhanh)
    P.revdir = o.get("revdir") if o.get("revdir") in reveal.DIRS else "auto"        # huong mo: auto = doi huong theo tung khung


def _mark_interrupted():
    """Du an dang 'running' ma tool vua mo lai = bi ngat (mat dien/tat may) -> danh dau de bam Tiep tuc."""
    try:
        for f in os.listdir(PROJ_DIR) if os.path.isdir(PROJ_DIR) else []:
            if f.endswith(".json"):
                p = os.path.join(PROJ_DIR, f)
                r = json.load(open(p, encoding="utf-8"))
                if r.get("status") in ("running", "video"):
                    r.update(status="stopped", error="Bị ngắt đột ngột (tắt máy/mất điện). Bấm ▶ Tiếp tục để làm tiếp chỗ đang dở.")
                    json.dump(r, open(p, "w", encoding="utf-8"), ensure_ascii=False)
    except Exception:
        pass


def main():
    _mark_interrupted()
    try:
        from . import edgeupdate
        edgeupdate.check_async()          # ngam: co edge-tts moi tren PyPI thi tai ve (toi da 1 lan / 6 gio), loi thi im lang
    except Exception:
        pass
    import multiprocessing
    multiprocessing.freeze_support()
    serve(open_browser=True)
