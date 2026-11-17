# -*- coding: utf-8 -*-
"""Cau noi Auto Studio <-> tien ich trinh duyet «YT Cookie Exporter» (ban 2.5 tro len).

Nguoi dung dan link BO SUU TAP (Douyin...) vao tab «Tai video» roi bam «Quet danh sach»:
  Auto Studio dat 1 cong viec (job) vao hang doi  ->  tien ich (dang hoi /job moi ~20 giay) nhan viec, mo trang trong trinh duyet DA DANG NHAP,
  cuon trang de gom du video, lay link tai truc tiep tung tap, roi tra ve danh sach dong 'link<TAB>Ten[<TAB>link truc tiep]' (dung dinh dang 'Hang loat').
Chi lang nghe 127.0.0.1 (khong ra mang). Khong dung cookie / mat khau: Auto Studio chi nhan danh sach link + ten.

An toan: moi yeu cau phai co header 'X-AS-Bridge: 1' (trang web bat ky khong the gui header tuy chinh sang 127.0.0.1 neu khong duoc phep CORS - ta chi cho phep
nguon chrome-extension://), Host phai la 127.0.0.1 / localhost (chan DNS-rebinding), id viec ngau nhien 128 bit. Khong dung tkinter."""
import json, threading, time, secrets
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import urlparse, parse_qs

HOST = "127.0.0.1"
PORT = 47653
POLL_MAX = 25                    # giay toi da 1 lan hoi /job (long-poll)
QUEUE_TIMEOUT = 180              # giay: viec chua ai nhan -> bao 'khong thay tien ich'
STALE = 150                      # giay: viec dang chay ma tien ich khong gui tien do -> coi la mat ket noi
MAX_BODY = 32 * 1024 * 1024
HINT_AFTER = 6                   # giay: chua thay tien ich hoi -> hien goi y

BROWSER_NAMES = {"chrome": "Chrome", "edge": "Edge", "coccoc": "Cốc Cốc", "brave": "Brave", "opera": "Opera", "vivaldi": "Vivaldi"}


def browser_name(b):
    return BROWSER_NAMES.get(b, b or "")


NO_EXT = ("Chưa thấy tiện ích trả lời. Hãy mở trình duyệt (Chrome / Cốc Cốc / Edge) đã cài tiện ích YT Cookie Exporter bản 2.5 trở lên "
          "và bật tiện ích. Tiện ích sẽ tự nhận việc trong tối đa ~30 giây.")


def no_ext_for(b):
    return ("Chưa thấy tiện ích trong %s. Hãy mở %s (bấm «🌐 Mở trình duyệt»), đã cài tiện ích YT Cookie Exporter bản 2.5 trở lên "
            "và bật tiện ích. Dùng trình duyệt khác thì đổi ô «Trình duyệt quét»." % (browser_name(b), browser_name(b)))


class Busy(Exception):
    pass


class Job:
    def __init__(self, url, opts=None, kind="scan"):
        self.id = secrets.token_hex(16)
        self.url = url
        self.kind = "list" if kind == "list" else "scan"      # list = chi liet ke cac bo cua kenh (khong lay link); scan = quet 1 bo / 1 trang + lay link
        o = opts or {}
        self.opts = {"merged": bool(o.get("merged")), "ads": bool(o.get("ads")), "mini": bool(o.get("mini"))}   # lay ca tap gop / trailer (mac dinh khong); mini = thu nho cua so quet xuong thanh tac vu
        b = "".join(c for c in str(o.get("browser") or "").lower() if c.isalnum())[:20]
        self.browser = b                   # "" = trinh duyet nao co tien ich cung nhan; "edge" / "chrome" / "coccoc"... = CHI tien ich trong trinh duyet do nhan viec
        nm = " ".join(str(o.get("name") or "").split())[:120]
        if nm:
            self.opts["name"] = nm                                              # TEN GOC cua bo (tu danh sach bo) -> dung dat ten tap: «Ten goc - Tap 01»
        self.state = "queued"              # queued -> running -> (choose -> running) -> done | error | cancelled
        self.msg = "Đang chờ tiện ích nhận việc…"
        self.found = 0                     # so video da thay tren trang
        self.total = 0                     # so video can lay link truc tiep
        self.done_n = 0                    # so video da lay link
        self.lines = []
        self.items = []                    # [{url, name, direct, kind ('ep'|'merged'|'ads'), thumb}] cac video cua bo (ket qua quet 1 bo)
        self.cover = ""                    # anh bia cua bo: data URL PNG
        self.groups = []                   # [{key, name, n}] cac bo trong 1 trang kenh: nguoi dung tick bo can lay (state 'choose')
        self.pick = None                   # None = chua chon; list key = da chon
        self.error = ""
        self.blocked = 0                   # so video bi captcha / khong lay duoc link truc tiep
        self.skipped = {"merged": 0, "ads": 0}   # tap gop / trailer tien ich da BO QUA (mac dinh khong lay)
        self.cancel = False
        self.created = time.time()
        self.updated = self.created
        self.taken = 0.0

    @property
    def finished(self):
        return self.state in ("done", "error", "cancelled")

    def direct_count(self):
        return sum(1 for ln in self.lines if ln.count("\t") >= 2 and ln.rsplit("\t", 1)[-1].startswith("http"))


def _clean_line(s):
    """Mot dong hop le: 'link<TAB>ten[<TAB>link]' - bo xuong dong va ky tu dieu khien; chi nhan http(s)."""
    s = "".join(ch for ch in str(s) if ch == "\t" or ch >= " ")
    return s.strip() if s.strip().lower().startswith(("http://", "https://")) else ""


MAX_IMG = 150 * 1024            # byte: anh bia / anh nho (data URL PNG) toi da


def _clean_img(v, limit=MAX_IMG):
    """Chi nhan anh PNG dang data URL (Tk doc duoc khong can Pillow), gioi han dung luong."""
    v = str(v or "")
    return v if v.startswith("data:image/png;base64,") and len(v) <= limit and all(c.isalnum() or c in "+/=:;,-" for c in v[22:60]) else ""


def _clean_items(its):
    """Danh sach video cua 1 bo tu tien ich -> [{url, name, direct, kind, thumb}] sach (toi da 3000)."""
    out = []
    if not isinstance(its, list):
        return out
    for it in its[:3000]:
        if not isinstance(it, dict):
            continue
        u = str(it.get("url") or "").strip()
        if not u.lower().startswith(("http://", "https://")):
            continue
        nm = "".join(ch for ch in " ".join(str(it.get("name") or "").split()) if ch >= " ")[:200]
        d = str(it.get("direct") or "").strip()
        k = str(it.get("kind") or "ep")
        out.append({"url": u, "name": nm, "direct": d if d.lower().startswith(("http://", "https://")) else "",
                    "kind": k if k in ("ep", "merged", "ads") else "ep", "thumb": _clean_img(it.get("thumb"), 40 * 1024)})
    return out


def items_lines(items, kinds=("ep", "merged", "ads")):
    """Cac video (theo kinds) -> dong 'link<TAB>ten[<TAB>link truc tiep]' cho BulkPlan / tep .txt."""
    return [it["url"] + "\t" + it["name"] + (("\t" + it["direct"]) if it["direct"] else "") for it in items if it["kind"] in kinds]


def _clean_groups(gs):
    """Danh sach bo tu tien ich -> [{key, name, n, url}] sach (toi da 200). url chi nhan http(s)."""
    out = []
    if not isinstance(gs, list):
        return out
    for g in gs[:200]:
        if isinstance(g, dict) and g.get("key") is not None:
            try:
                n = max(0, int(g.get("n") or 0))
            except (TypeError, ValueError):
                n = 0
            u = str(g.get("url") or "").strip()
            out.append({"key": str(g["key"])[:80], "name": " ".join(str(g.get("name") or g["key"]).split())[:120], "n": n,
                        "url": u if u.lower().startswith(("http://", "https://")) else "", "cover": _clean_img(g.get("cover"))})
    return out


def save_scan_txt(folder, url, lines, direct_n, name=""):
    """Luu ket qua quet ra .txt (dinh dang 'Hang loat': link<TAB>ten<TAB>link tai truc tiep) trong <folder>/Danh sách quét. Tra ve duong dan; nem OSError neu khong ghi duoc."""
    import os, re
    d = os.path.join(folder, "Danh sách quét")
    os.makedirs(d, exist_ok=True)
    stem = re.sub(r'[\\/:*?"<>|\t\r\n]+', " ", name or "quet").strip()[:60] or "quet"
    path = os.path.join(d, "%s_%s.txt" % (stem, time.strftime("%Y%m%d_%H%M%S")))
    head = ["# Quét từ: " + url, "# Lúc: " + time.strftime("%d/%m/%Y %H:%M:%S") + " — %d video, %d có link tải trực tiếp" % (len(lines), direct_n),
            "# Mỗi dòng: link<TAB>tên<TAB>link tải trực tiếp (cột 3 chỉ sống khoảng 3 giờ). Dùng lại: «Nhập tệp .txt» ở tab Tải video."]
    with open(path, "w", encoding="utf-8-sig", newline="\r\n") as f:
        f.write("\n".join(head + list(lines)) + "\n")
    return path


class Bridge:
    def __init__(self, host=HOST, port=PORT):
        self.host, self.port = host, port
        self.cv = threading.Condition()
        self.job = None                    # viec hien tai (mot luc chi 1 viec)
        self.seen = 0.0                    # lan cuoi tien ich hoi /job
        self.seen_by = {}                  # ma trinh duyet -> lan cuoi tien ich TRONG trinh duyet do hoi /job
        self.server = None
        self.thread = None
        self.closing = False

    # ------------------------------------------------------------ may chu
    def start(self):
        """(True, '') neu dang lang nghe; (False, ly do) neu khong mo duoc cong."""
        if self.server:
            return True, ""
        try:
            self.server = ThreadingHTTPServer((self.host, self.port), _make_handler(self))
        except OSError as e:
            self.server = None
            return False, "Không mở được cổng %d (%s). Có thể phần mềm khác đang dùng cổng này." % (self.port, e)
        self.server.daemon_threads = True
        self.closing = False
        self.thread = threading.Thread(target=self.server.serve_forever, kwargs={"poll_interval": 0.3}, daemon=True)
        self.thread.start()
        return True, ""

    def stop(self):
        self.closing = True
        with self.cv:
            self.cv.notify_all()
        srv, self.server = self.server, None
        if srv:
            try:
                srv.shutdown()
                srv.server_close()
            except Exception:
                pass

    # ------------------------------------------------------------ phia Auto Studio
    def submit(self, url, opts=None, kind="scan"):
        with self.cv:
            if self.job and not self.job.finished:
                raise Busy()
            self.job = Job(url, opts, kind)
            self.cv.notify_all()
            return self.job

    def cancel(self, job):
        with self.cv:
            if job.finished:
                return
            job.cancel = True
            # Huy NGAY (ca khi tien ich dang chay: lan bao tien do ke tiep no nhan cancel=True roi tu dung + dong cua so) de nguoi dung quet lai duoc lien
            job.state, job.msg, job.updated = "cancelled", "Đã hủy.", time.time()

    def choose(self, job, keys):
        """Nguoi dung da tick cac bo can lay (state 'choose' -> 'running'); tien ich nhan danh sach nay o lan bao tien do ke tiep."""
        with self.cv:
            if job.state != "choose":
                return False
            valid = {g["key"] for g in job.groups}
            job.pick = [k for k in keys if k in valid]
            job.state, job.msg, job.updated = "running", "Đang lấy danh sách các bộ đã chọn…", time.time()
            return True

    def ext_age(self, browser=None):
        """So giay tu lan cuoi tien ich hoi /job (browser: chi tinh tien ich trong trinh duyet do); None neu chua tung thay."""
        t = self.seen_by.get(browser, 0.0) if browser else self.seen
        return None if not t else time.time() - t

    def check(self, job):
        """Goi dinh ky tu giao dien: danh dau loi khi viec bi bo roi. Tra ve job."""
        now = time.time()
        with self.cv:
            if job.state == "queued" and now - job.created > QUEUE_TIMEOUT:
                job.state, job.error = "error", (no_ext_for(job.browser) if job.browser else NO_EXT)
            elif job.state in ("running", "choose") and now - job.updated > STALE:
                job.state, job.error = "error", "Tiện ích ngừng phản hồi (đã đóng trình duyệt hoặc cửa sổ quét?). Danh sách đang quét dở không được thêm."
        return job

    def hint(self, job):
        """Goi y hien cho nguoi dung khi viec chua duoc nhan sau ~6 giay."""
        if job.state != "queued" or time.time() - job.created < HINT_AFTER:
            return ""
        age = self.ext_age(job.browser or None)
        if age is None or age > 8:
            return no_ext_for(job.browser) if job.browser else NO_EXT
        return ""

    # ------------------------------------------------------------ phia tien ich (goi tu handler)
    def next_job(self, wait, browser=""):
        """Tien ich (trong trinh duyet co ma `browser`) xin viec. Viec chi dinh trinh duyet khac thi KHONG giao."""
        end = time.time() + max(0.0, min(wait, POLL_MAX))
        with self.cv:
            while not self.closing:
                self.seen = time.time()
                if browser:
                    self.seen_by[browser] = self.seen
                j = self.job
                if j and j.state == "queued" and (not j.browser or not browser or j.browser == browser):   # tien ich cu (khong bao ma trinh duyet) nhan duoc moi viec
                    j.state, j.taken, j.updated, j.msg = "running", time.time(), time.time(), "Tiện ích đã nhận việc, đang mở trang…"
                    return j
                left = end - time.time()
                if left <= 0:
                    return None
                self.cv.wait(min(left, 1.0))
        return None

    def progress(self, data):
        """Tien ich bao tien do. Tra ve {'cancel': bool}; id la/da xong -> cancel=True de tien ich dung han."""
        with self.cv:
            j = self.job
            if not j or j.id != data.get("id") or j.finished:
                return {"cancel": True}
            j.updated = time.time()
            if data.get("msg"):
                j.msg = str(data["msg"])[:300]
            for k in ("found", "total", "done_n", "blocked"):
                try:
                    setattr(j, k, max(0, int(data.get(k, getattr(j, k)))))
                except (TypeError, ValueError):
                    pass
            gs = data.get("groups")
            if isinstance(gs, list) and gs and not j.groups and j.state == "running":
                clean = _clean_groups(gs)
                if clean:
                    j.groups, j.state, j.msg = clean, "choose", "Trang có nhiều bộ — hãy chọn bộ cần lấy."
            return {"cancel": bool(j.cancel), "pick": j.pick}

    def result(self, data):
        with self.cv:
            j = self.job
            if not j or j.id != data.get("id") or j.finished:
                return {"ok": False}
            j.updated = time.time()
            if j.kind == "list":
                gs = _clean_groups(data.get("groups"))
                if j.cancel:
                    j.state, j.msg = "cancelled", "Đã hủy."
                elif data.get("ok") and gs:
                    j.groups, j.state, j.msg = gs, "done", "Xong."
                else:
                    j.state = "error"
                    j.error = str(data.get("error") or "Không thấy bộ nào trên trang này.")[:500]
                return {"ok": True}
            items = _clean_items(data.get("items"))
            if items:                                                       # ban moi: danh sach video day du (loai tap, anh nho) -> giao dien cho tick
                j.items, j.cover = items, _clean_img(data.get("cover"))
                lines = items_lines(items)
            else:                                                           # tien ich cu: chi co dong 'link<TAB>ten[<TAB>link]'
                lines = [ln for ln in (_clean_line(x) for x in (data.get("lines") or [])) if ln]
            j.lines = lines
            try:
                j.blocked = max(0, int(data.get("blocked", j.blocked)))
            except (TypeError, ValueError):
                pass
            sk = data.get("skipped")
            if isinstance(sk, dict):
                for k in ("merged", "ads"):
                    try:
                        j.skipped[k] = max(0, int(sk.get(k) or 0))
                    except (TypeError, ValueError):
                        pass
            if j.cancel:
                j.state, j.msg = "cancelled", "Đã hủy."
            elif data.get("ok") and lines:
                j.state, j.msg = "done", "Xong."
            else:
                j.state = "error"
                j.error = str(data.get("error") or "Không lấy được video nào từ trang này.")[:500]
            return {"ok": True}


_inst = None


def get():
    """Cau noi dung chung cua ung dung."""
    global _inst
    if _inst is None:
        _inst = Bridge()
    return _inst


def _make_handler(bridge):
    class H(BaseHTTPRequestHandler):
        protocol_version = "HTTP/1.1"
        server_version = "AutoStudioBridge"

        def log_message(self, *a):
            pass

        # ---- kiem tra nguon goc
        def _origin_ok(self):
            h = (self.headers.get("Host") or "").strip().lower()
            host = h[:h.find("]") + 1] if h.startswith("[") else h.rsplit(":", 1)[0]
            if host not in ("127.0.0.1", "localhost", "[::1]"):
                return False
            org = self.headers.get("Origin")
            return not org or org.startswith("chrome-extension://")

        def _allowed(self):
            return self._origin_ok() and self.headers.get("X-AS-Bridge") == "1"

        def _send(self, code, obj=None):
            body = b"" if obj is None else json.dumps(obj, ensure_ascii=False).encode("utf-8")
            self.send_response(code)
            org = self.headers.get("Origin")
            if org and org.startswith("chrome-extension://"):
                self.send_header("Access-Control-Allow-Origin", org)
                self.send_header("Vary", "Origin")
            self.send_header("Content-Type", "application/json; charset=utf-8")
            self.send_header("Content-Length", str(len(body)))
            self.send_header("Cache-Control", "no-store")
            self.end_headers()
            if body and self.command != "HEAD":
                self.wfile.write(body)

        def do_OPTIONS(self):
            org = self.headers.get("Origin") or ""
            if not (self._origin_ok() and org.startswith("chrome-extension://")):
                return self._send(403, {"error": "forbidden"})
            self.send_response(204)
            self.send_header("Access-Control-Allow-Origin", org)
            self.send_header("Access-Control-Allow-Headers", "X-AS-Bridge, Content-Type")
            self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
            self.send_header("Access-Control-Max-Age", "600")
            self.send_header("Content-Length", "0")
            self.end_headers()

        def do_GET(self):
            if not self._allowed():
                return self._send(403, {"error": "forbidden"})
            u = urlparse(self.path)
            q = parse_qs(u.query)
            if u.path == "/hello":
                bridge.seen = time.time()
                try:
                    import appinfo
                    ver = appinfo.VERSION
                except Exception:
                    ver = ""
                return self._send(200, {"app": "AutoStudio", "version": ver, "bridge": 1})
            if u.path == "/job":
                try:
                    wait = float((q.get("wait") or ["0"])[0])
                except ValueError:
                    wait = 0.0
                b = "".join(c for c in (q.get("b") or [""])[0].lower() if c.isalnum())[:20]
                j = bridge.next_job(wait, b)
                if not j:
                    return self._send(204)
                return self._send(200, {"id": j.id, "url": j.url, "opts": j.opts, "kind": j.kind})
            return self._send(404, {"error": "not found"})

        def do_POST(self):
            if not self._allowed():
                return self._send(403, {"error": "forbidden"})
            try:
                n = int(self.headers.get("Content-Length") or 0)
            except ValueError:
                n = 0
            if n <= 0 or n > MAX_BODY:
                return self._send(413 if n > MAX_BODY else 400, {"error": "bad length"})
            try:
                data = json.loads(self.rfile.read(n).decode("utf-8"))
                if not isinstance(data, dict):
                    raise ValueError
            except Exception:
                return self._send(400, {"error": "bad json"})
            path = urlparse(self.path).path
            if path == "/progress":
                return self._send(200, bridge.progress(data))
            if path == "/result":
                return self._send(200, bridge.result(data))
            return self._send(404, {"error": "not found"})

    return H
