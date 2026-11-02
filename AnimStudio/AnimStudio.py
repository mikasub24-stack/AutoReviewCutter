# -*- coding: utf-8 -*-
import os, sys, multiprocessing

_COMPILED = "__compiled__" in globals()                      # ban bien dich Nuitka
_SELFTEST = "--selftest" in sys.argv                         # build.bat tu thu ban vua build (khong mo cua so, khong dung du lieu that cua nguoi dung)
if _SELFTEST:
    import tempfile
    os.environ["ANIMSTUDIO_DATA"] = tempfile.mkdtemp(prefix="animstudio_selftest_")     # PHAI dat truoc khi import animstudio.*

if (getattr(sys, "frozen", False) or _COMPILED) and (sys.stdout is None or sys.stderr is None):       # chay khong cua so den: ghi log ra file de con tra loi khi co loi
    try:
        _d = os.path.join(os.path.expanduser("~"), "AnimStudioData")
        os.makedirs(_d, exist_ok=True)
        _f = open(os.path.join(_d, "animstudio.log"), "a", encoding="utf-8", buffering=1)
        sys.stdout = sys.stdout or _f
        sys.stderr = sys.stderr or _f
    except Exception:
        pass

if os.name == "nt":                          # khong bat ky cua so den (cmd) nao nhay len khi app goi ffmpeg / aria / ComfyUI
    import subprocess as _sp
    _orig = _sp.Popen.__init__

    def _init(self, *a, **kw):
        kw["creationflags"] = kw.get("creationflags", 0) | 0x08000000
        _orig(self, *a, **kw)
    _sp.Popen.__init__ = _init

if __name__ == "__main__":
    multiprocessing.freeze_support()
    if _SELFTEST:
        from animstudio import selftest
        sys.exit(selftest.run())
    from animstudio import singleinst
    singleinst.guard()                       # chi mo duoc MOT AnimStudio: mo lan 2 thi bao «da mo roi», dua cua so cu len truoc roi thoat (ANIMSTUDIO_MULTI=1 de mo nhieu ban)
    from animstudio.webui import main
    main()
