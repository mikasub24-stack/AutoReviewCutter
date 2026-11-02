# -*- coding: utf-8 -*-
"""BAN QUYEN AnimStudio - key ky so Ed25519 kiem tra OFFLINE (khong can may chu), khong co giao dien (xem licensepage.py).

 - KEY: tac gia cap bang cong cu tao_key (giu khoa RIENG); chuong trinh chi chua khoa CONG KHAI nen khong tu tao key duoc.
   Moi key gan voi 1 MAY (ma may 16 ky tu hien trong trang Ban quyen) + ngay het han (thang / 3 thang / nam) hoac vinh vien.
   Key AnimStudio (AN1-...) KHAC key Auto Studio (AS1-...): chung khoa ky nhung khac "mien" nen key cua phan mem nay khong dung cho phan mem kia.
 - DUNG THU TRIAL_HOURS gio ke tu lan mo dau tien (4 gio, tinh dung theo gio chu khong theo ngay lich).
 - Gia han = nhap key moi. Chinh dong ho lui de keo dai han bi chan (tru key vinh vien).
 - Muc bao ve: vua phai (chong nguoi dung thuong, khong chong nguoi chuyen bien dich nguoc). Trang thai luu o tep + registry kem dau HMAC.
File nay chay duoc ca khi nam trong goi animstudio lan khi dat canh ed25519.py (cong cu tao key dung ban sao)."""
import os, sys, json, hmac, base64, hashlib, struct, uuid, datetime

try:
    from . import ed25519
    from .common import DATA_DIR as _DATA_DIR
except ImportError:                                   # dung doc lap (cong cu tao key)
    import ed25519
    _DATA_DIR = os.environ.get("ANIMSTUDIO_DATA") or os.path.join(os.path.expanduser("~"), "AnimStudioData")

NAME = "AnimStudio"
CONTACT = ""                                      # cach lien he de mua / gia han key (vd "Zalo 09xx xxx xxx") - hien o trang Ban quyen; de trong = khong hien
PRICE_TEXT = ""                                   # bang gia hien o trang Ban quyen (vd "Tháng 99.000đ · Năm 799.000đ"); de trong = khong hien

PUBLIC_KEY_HEX = "d38b3e54395d83bbf66f9353024654dad5a6a03baebd11911a6be39ae3fb1a1c"
PUBLIC_KEY = bytes.fromhex(PUBLIC_KEY_HEX)
STORE_SECRET = b"AN-lic-store-7c1d4b9e2a60f35588d1e0b4a9c27f63"

TRIAL_HOURS = 4                                   # dung thu 4 gio ke tu lan mo dau tien
CLOCK_SLACK = datetime.timedelta(minutes=30)      # dong ho lui qua muc nay so voi lan thay truoc = bi chinh lui

KEY_PREFIX = "AN1"
DOMAIN = b"AnimStudio-license-v1|"
EPOCH = datetime.date(2024, 1, 1)
LIFETIME = 0xFFFF
PLANS = {1: ("Gói tháng", 30), 2: ("Gói 3 tháng", 90), 3: ("Gói năm", 365), 9: ("Vĩnh viễn", None), 0: ("Tuỳ chọn", None)}

_HEADER = ">BBH10s4s"                             # ban(1) goi(1) han(2: ngay ke tu EPOCH, 0xFFFF = vinh vien) may(10) so_seri(4)
_PAYLOAD_LEN = struct.calcsize(_HEADER)           # 18
_KEY_LEN = _PAYLOAD_LEN + 64                      # 82
_TFMT = "%Y-%m-%dT%H:%M:%S"


def _now_utc():
    return datetime.datetime.now(datetime.timezone.utc).replace(tzinfo=None, microsecond=0)


def fmt_date(d):
    return d.strftime("%d/%m/%Y") if d else ""


# ------------------------------------------------------------------ ma may (cung cach tinh voi Auto Studio: 1 ma may dung cho moi phan mem cua tac gia)
def machine_raw():
    try:
        import winreg
        with winreg.OpenKey(winreg.HKEY_LOCAL_MACHINE, r"SOFTWARE\Microsoft\Cryptography", 0, winreg.KEY_READ | getattr(winreg, "KEY_WOW64_64KEY", 0)) as k:
            v, _ = winreg.QueryValueEx(k, "MachineGuid")
            if v:
                return str(v).strip().lower()
    except Exception:
        pass
    for p in ("/etc/machine-id", "/var/lib/dbus/machine-id"):
        try:
            with open(p, "r", encoding="utf-8") as f:
                v = f.read().strip()
            if v:
                return v.lower()
        except Exception:
            pass
    return "node-%012x" % uuid.getnode()


def machine_bytes():
    return hashlib.sha256(b"AutoStudio-machine|" + machine_raw().encode("utf-8")).digest()[:10]


def machine_code(b=None):
    """10 byte -> 'XXXX-XXXX-XXXX-XXXX' (16 ky tu A-Z 2-7)."""
    s = base64.b32encode(b if b is not None else machine_bytes()).decode("ascii")
    return "-".join(s[i:i + 4] for i in range(0, len(s), 4))


def parse_machine_code(text):
    """'xxxx-xxxx-...' (khong phan biet hoa thuong, bo dau cach / gach) -> 10 byte, hoac None neu sai."""
    s = "".join(c for c in (text or "").upper() if c.isalnum())
    if len(s) != 16:
        return None
    try:
        b = base64.b32decode(s)
    except Exception:
        return None
    return b if len(b) == 10 else None


# ------------------------------------------------------------------ key
def make_key(secret, plan, expiry, machine10, serial=None):
    """(DUNG O CONG CU TAO KEY) -> chuoi key. expiry: datetime.date hoac None (vinh vien); machine10: 10 byte (b'\\0'*10 = moi may)."""
    if expiry is None:
        days = LIFETIME
    else:
        days = (expiry - EPOCH).days
        if not 0 <= days < LIFETIME:
            raise ValueError("ngay het han ngoai pham vi")
    if len(machine10) != 10:
        raise ValueError("ma may phai 10 byte")
    ser = os.urandom(4) if serial is None else struct.pack(">I", serial)
    payload = struct.pack(_HEADER, 1, plan, days, machine10, ser)
    raw = payload + ed25519.sign(secret, DOMAIN + payload)
    b32 = base64.b32encode(raw).decode("ascii").rstrip("=")
    return KEY_PREFIX + "-" + "-".join(b32[i:i + 8] for i in range(0, len(b32), 8))


class KeyError_(Exception):
    pass


def parse_key(text, public=None):
    """Chuoi key -> dict(plan, expiry (date|None), machine (bytes), serial (int)). Sai -> KeyError_(thong bao tieng Viet)."""
    s = "".join(c for c in (text or "").upper() if c.isalnum())
    if s.startswith("AS1"):
        raise KeyError_("Đây là key của Auto Studio (AS1-…), không dùng cho AnimStudio. Hãy xin key AnimStudio (bắt đầu bằng «%s-»)." % KEY_PREFIX)
    if not s.startswith(KEY_PREFIX):
        raise KeyError_("Key không đúng định dạng (phải bắt đầu bằng «%s-»). Hãy dán nguyên văn key đã nhận." % KEY_PREFIX)
    body = s[len(KEY_PREFIX):]
    try:
        raw = base64.b32decode(body + "=" * (-len(body) % 8))
    except Exception:
        raise KeyError_("Key có ký tự lạ hoặc bị cắt cụt. Hãy dán lại nguyên văn key đã nhận.")
    if len(raw) != _KEY_LEN:
        raise KeyError_("Key bị thiếu hoặc thừa ký tự (đủ %d, bạn dán %d byte). Hãy dán lại nguyên văn." % (_KEY_LEN, len(raw)))
    payload, sig = raw[:_PAYLOAD_LEN], raw[_PAYLOAD_LEN:]
    if not ed25519.verify(public or PUBLIC_KEY, DOMAIN + payload, sig):
        raise KeyError_("Key không hợp lệ (sai chữ ký): có thể gõ sai ký tự hoặc không phải key của phần mềm này.")
    ver, plan, days, m10, ser = struct.unpack(_HEADER, payload)
    if ver != 1:
        raise KeyError_("Key thuộc phiên bản mới hơn — hãy cập nhật phần mềm.")
    expiry = None if days == LIFETIME else EPOCH + datetime.timedelta(days=days)
    return {"plan": plan, "expiry": expiry, "machine": m10, "serial": struct.unpack(">I", ser)[0]}


def check_key(text, today=None, public=None):
    """-> (info dict, None) nếu dùng được; (None, thong bao loi) nếu không."""
    today = today or datetime.date.today()
    try:
        info = parse_key(text, public)
    except KeyError_ as e:
        return None, str(e)
    if info["machine"] != b"\x00" * 10 and info["machine"] != machine_bytes():
        return None, "Key này được cấp cho máy khác (mã máy không khớp). Mã máy của bạn: %s" % machine_code()
    if info["expiry"] is not None and info["expiry"] < today:
        return None, "Key đã hết hạn ngày %s. Hãy nhập key mới để gia hạn." % fmt_date(info["expiry"])
    return info, None


def plan_name(info):
    return "Vĩnh viễn" if info["expiry"] is None else PLANS.get(info["plan"], ("Tuỳ chọn", None))[0]


# ------------------------------------------------------------------ luu trang thai (tep + registry, kem HMAC)
def data_dir():
    return _DATA_DIR


def _store_path():
    return os.path.join(data_dir(), "license.dat")


def _mac_key():
    return hashlib.sha256(b"AN-lic|" + machine_bytes() + STORE_SECRET).digest()


def _pack(d):
    s = json.dumps(d, sort_keys=True, separators=(",", ":")).encode("utf-8")
    return base64.b64encode(s).decode("ascii") + "." + hmac.new(_mac_key(), s, hashlib.sha256).hexdigest()[:32]


def _unpack(txt):
    try:
        b, mac = txt.strip().rsplit(".", 1)
        s = base64.b64decode(b)
        if not hmac.compare_digest(mac, hmac.new(_mac_key(), s, hashlib.sha256).hexdigest()[:32]):
            return None
        d = json.loads(s.decode("utf-8"))
        return d if isinstance(d, dict) else None
    except Exception:
        return None


_REG = r"Software\AnimStudio"


def _reg_read():
    try:
        import winreg
        with winreg.OpenKey(winreg.HKEY_CURRENT_USER, _REG, 0, winreg.KEY_READ) as k:
            v, _ = winreg.QueryValueEx(k, "lic")
            return _unpack(v)
    except Exception:
        return None


def _reg_write(txt):
    try:
        import winreg
        with winreg.CreateKey(winreg.HKEY_CURRENT_USER, _REG) as k:
            winreg.SetValueEx(k, "lic", 0, winreg.REG_SZ, txt)
    except Exception:
        pass


def _file_read():
    try:
        with open(_store_path(), "r", encoding="utf-8") as f:
            return _unpack(f.read())
    except Exception:
        return None


def _t(s):
    try:
        return datetime.datetime.strptime(str(s), _TFMT)
    except Exception:
        return None


def load():
    """Gop ban ghi o tep + registry: luc dung thu som nhat, lan thay cuoi muon nhat, key (uu tien tep)."""
    recs = [r for r in (_file_read(), _reg_read()) if r]
    out = {}
    t0 = [x for x in (_t(r.get("t0")) for r in recs) if x]
    ls = [x for x in (_t(r.get("ls")) for r in recs) if x]
    if t0:
        out["t0"] = min(t0).strftime(_TFMT)
    if ls:
        out["ls"] = max(ls).strftime(_TFMT)
    for r in recs:
        if r.get("key"):
            out["key"] = r["key"]
            break
    return out


def save(d):
    txt = _pack(d)
    try:
        os.makedirs(data_dir(), exist_ok=True)
        tmp = _store_path() + ".tmp"
        with open(tmp, "w", encoding="utf-8") as f:
            f.write(txt)
        os.replace(tmp, _store_path())
    except Exception:
        pass
    _reg_write(txt)


# ------------------------------------------------------------------ trang thai
def _rank(info):
    return datetime.date.max if info["expiry"] is None else info["expiry"]


def _left_text(td):
    m = max(0, int(td.total_seconds() // 60))
    if m >= 120:
        return "%d giờ" % (m // 60) if m % 60 == 0 else "%d giờ %d phút" % (m // 60, m % 60)
    if m >= 60:
        return "1 giờ %d phút" % (m - 60) if m > 60 else "1 giờ"
    return "%d phút" % max(1, m)


def status(now=None, persist=True, public=None):
    """Trang thai ban quyen hien tai ('now' = gio UTC khong mui gio, chi de kiem thu):
    dict(ok, mode: key|trial|expired|clock, level: good|warn|bad, plan, expiry, days_left, trial_left_s, msg, short)."""
    if now is None:
        now = _now_utc()
        today = datetime.date.today()
    else:
        today = now.date()
    st = load()
    changed = False
    if not st.get("t0"):
        st["t0"] = now.strftime(_TFMT)
        changed = True
    ls = _t(st.get("ls"))
    info, err = (None, None)
    if st.get("key"):
        info, err = check_key(st["key"], today, public)
    lifetime = bool(info and info["expiry"] is None)
    rolled = bool(ls and now < ls - CLOCK_SLACK) and not lifetime
    if not rolled and (ls is None or now > ls):
        st["ls"] = now.strftime(_TFMT)
        changed = True
    if changed and persist:
        save(st)

    def res(**kw):
        base = {"ok": False, "mode": "expired", "level": "bad", "plan": "", "expiry": None, "days_left": None, "trial_left_s": None, "msg": "", "short": ""}
        base.update(kw)
        return base

    if rolled:
        return res(mode="clock", msg="Ngày giờ của máy đang sớm hơn lần dùng trước (đồng hồ bị chỉnh lùi). Hãy chỉnh lại đúng ngày giờ để tiếp tục.",
                   short="🔑 Sai ngày giờ máy")
    if info:
        if info["expiry"] is None:
            return res(ok=True, mode="key", level="good", plan="Vĩnh viễn", msg="Đã kích hoạt bản quyền vĩnh viễn.", short="🔑 Bản quyền: vĩnh viễn")
        left = (info["expiry"] - today).days
        nm = plan_name(info)
        lvl = "good" if left > 7 else "warn"
        return res(ok=True, mode="key", level=lvl, plan=nm, expiry=info["expiry"], days_left=left,
                   msg="%s — hết hạn ngày %s (còn %d ngày)." % (nm, fmt_date(info["expiry"]), left),
                   short="🔑 Còn %d ngày (đến %s)" % (left, info["expiry"].strftime("%d/%m")))
    t0 = _t(st.get("t0")) or now
    left = datetime.timedelta(hours=TRIAL_HOURS) - (now - t0)
    if left.total_seconds() > 0:
        extra = (" " + err) if err else ""
        lt = _left_text(left)
        return res(ok=True, mode="trial", level="warn", trial_left_s=int(left.total_seconds()),
                   msg="Đang dùng thử — còn %s. Hết dùng thử cần nhập key để tiếp tục tạo video.%s" % (lt, extra),
                   short="🔑 Dùng thử còn %s" % lt)
    msg = err or "Đã hết thời gian dùng thử (%d giờ). Nhập key bản quyền để tiếp tục tạo video." % TRIAL_HOURS
    return res(msg=msg, short="🔑 Hết hạn — cần nhập key")


def allowed(now=None):
    return status(now)["ok"]


def activate(text, now=None, public=None):
    """Nhap key. -> (True, thong bao) hoac (False, loi). Key moi chi thay key cu khi tot hon (han xa hon / vinh vien)."""
    if now is None:
        now = _now_utc()
        today = datetime.date.today()
    else:
        today = now.date()
    info, err = check_key(text, today, public)
    if not info:
        return False, err
    st = load()
    if not st.get("t0"):
        st["t0"] = now.strftime(_TFMT)
    old, _ = check_key(st["key"], today, public) if st.get("key") else (None, None)
    if old and _rank(old) > _rank(info):
        return True, "Bạn đang có key còn hạn lâu hơn nên giữ nguyên key đó."
    st["key"] = normalize_key(text)
    ls = _t(st.get("ls"))
    st["ls"] = max([x for x in (ls, now) if x]).strftime(_TFMT)
    save(st)
    s = status(now, persist=False, public=public)
    return True, "Kích hoạt thành công! " + s["msg"]


def normalize_key(text):
    """Chuoi key sach: AN1-XXXXXXXX-XXXXXXXX-..."""
    s = "".join(c for c in (text or "").upper() if c.isalnum())
    body = s[len(KEY_PREFIX):] if s.startswith(KEY_PREFIX) else s
    return KEY_PREFIX + "-" + "-".join(body[i:i + 8] for i in range(0, len(body), 8))


def selfcheck():
    """Kiem tra nhanh: None neu on, nguoc lai chuoi mo ta loi."""
    e = ed25519.selfcheck()
    if e:
        return "Ed25519: " + e
    if len(PUBLIC_KEY) != 32:
        return "khoa cong khai sai do dai"
    mc = machine_code()
    if parse_machine_code(mc) != machine_bytes():
        return "ma may khong doc nguoc lai duoc"
    try:
        parse_key("AN1-" + "A" * 40)
        return "chap nhan key rac"
    except KeyError_:
        pass
    return None
