# -*- coding: utf-8 -*-
"""CHI MO DUOC MOT AnimStudio (ca khi chua co key / dang dung thu). Mo lan thu hai: dua cua so dang chay len truoc + hien thong bao «AnimStudio dang mo roi», roi THOAT (khong mo them ban nua, khong mo them cong may chu / cua so).
Windows: mutex ten (theo phien dang nhap). Linux / macOS: khoa tep (de thu). Dat bien moi truong ANIMSTUDIO_MULTI=1 de cho mo nhieu ban (dev / test)."""
import os, sys, time

MUTEX = "Local\\AnimStudio_SingleInstance_v1"
NAME = "AnimStudio"
_held = []                                   # giu handle / tep khoa cho den khi tien trinh thoat (he dieu hanh tu nha)


def acquire(name=MUTEX, lock_dir=None):
    """True = day la ban DAU TIEN (da giu khoa); False = da co ban khac dang chay."""
    if os.name == "nt":
        try:
            import ctypes
            from ctypes import wintypes
            k32 = ctypes.WinDLL("kernel32", use_last_error=True)
            k32.CreateMutexW.restype = wintypes.HANDLE
            k32.CreateMutexW.argtypes = [wintypes.LPVOID, wintypes.BOOL, wintypes.LPCWSTR]
            k32.CloseHandle.argtypes = [wintypes.HANDLE]
            ctypes.set_last_error(0)
            h = k32.CreateMutexW(None, False, name)
            err = ctypes.get_last_error()
            if not h:
                return True                  # khong tao duoc mutex (hiem) -> cho chay, dung chan nguoi dung
            if err == 183:                   # ERROR_ALREADY_EXISTS
                k32.CloseHandle(h)
                return False
            _held.append(h)
            return True
        except Exception:
            return True
    try:
        import fcntl, tempfile
        uid = os.getuid() if hasattr(os, "getuid") else 0
        f = open(os.path.join(lock_dir or tempfile.gettempdir(), "animstudio_%s_%s.lock" % (name.split("\\")[-1], uid)), "a+")
        try:
            fcntl.flock(f, fcntl.LOCK_EX | fcntl.LOCK_NB)
        except OSError:
            f.close()
            return False
        _held.append(f)
        return True
    except Exception:
        return True


def focus_existing(prefix=NAME):
    """Windows: dua cua so AnimStudio dang chay len truoc (neu dang thu nho thi phuc hoi). Cua so cua AnimStudio la cua so rieng (WebView2) tieu de «AnimStudio», hoac tab trinh duyet tieu de «AnimStudio ...».
    Bo qua cua so thu muc (File Explorer) tinh co ten «AnimStudio». True neu thay cua so."""
    if os.name != "nt":
        return False
    try:
        import ctypes
        from ctypes import wintypes
        u = ctypes.WinDLL("user32", use_last_error=True)
        H = wintypes.HWND
        u.IsWindowVisible.argtypes = u.IsIconic.argtypes = u.SetForegroundWindow.argtypes = [H]
        u.ShowWindow.argtypes = [H, ctypes.c_int]
        u.GetWindowTextW.argtypes = u.GetClassNameW.argtypes = [H, wintypes.LPWSTR, ctypes.c_int]
        found = []
        proc = ctypes.WINFUNCTYPE(wintypes.BOOL, wintypes.HWND, wintypes.LPARAM)

        def cb(hwnd, _lp):
            if not u.IsWindowVisible(hwnd):
                return True
            t, c = ctypes.create_unicode_buffer(256), ctypes.create_unicode_buffer(64)
            u.GetWindowTextW(hwnd, t, 256)
            u.GetClassNameW(hwnd, c, 64)
            if t.value.startswith(prefix) and c.value not in ("CabinetWClass", "ExploreWClass", "Progman", "WorkerW"):
                found.append(hwnd)
                return False
            return True
        u.EnumWindows(proc(cb), 0)
        if not found:
            return False
        if u.IsIconic(found[0]):
            u.ShowWindow(found[0], 9)        # SW_RESTORE
        u.SetForegroundWindow(found[0])
        return True
    except Exception:
        return False


def notice(title, text):
    if os.name == "nt":
        try:
            import ctypes
            ctypes.windll.user32.MessageBoxW(0, text, title, 0x40 | 0x40000)       # MB_ICONINFORMATION | MB_TOPMOST
            return
        except Exception:
            pass
    print("%s: %s" % (title, text), file=sys.stderr)


def message(name=NAME):
    return ("%s đang mở rồi.\n\nKhông cần mở thêm: dùng cửa sổ đang chạy (nhìn dưới thanh taskbar).\n"
            "Nếu không thấy cửa sổ nào: mở Task Manager, tắt «%s» rồi mở lại." % (name, name))


def guard(wait=1.5, exit_code=0, name=MUTEX, show=True):
    """Goi NGAY luc khoi dong. Ban dau tien: tra ve True. Da co ban khac: doi toi da `wait` giay (ban cu co the dang thoat: khoi dong lai / cap nhat), neu van con thi dua cua so cu len truoc,
    bao «da mo roi» va THOAT (sys.exit)."""
    if os.environ.get("ANIMSTUDIO_MULTI"):
        return True
    end = time.time() + max(0.0, wait)
    while True:
        if acquire(name):
            return True
        if time.time() >= end:
            break
        time.sleep(0.2)
    if show:
        focus_existing(NAME)
        notice(NAME, message())
    sys.exit(exit_code)
