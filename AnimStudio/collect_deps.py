# -*- coding: utf-8 -*-
"""In ra cac co '--collect-all <goi>' cho thu vien da cai va cac thu vien NO PHU THUOC (build.bat dung de dong goi .exe du file du lieu).
Vi du: thu vien giong VieNeu goi them sea-g2p, onnxruntime, huggingface-hub... ; nhieu goi trong do co file du lieu (tu dien, tokenizer, DLL) ma PyInstaller khong tu thay
-> .exe chay loi 'The system cannot find the file specified (os error 2)'. Chay: python collect_deps.py vieneu   (them --list de chi xem danh sach)
Them --nuitka: in co cho Nuitka thay cho '--collect-all'. Nuitka tu theo cac lenh import nen CHI can: du lieu (--include-package-data) cua moi goi phu thuoc, va ma (--include-package /
--include-module) cua cac goi phu thuoc TRUC TIEP (cap 1) de khong bo sot import dong. KHONG ep nap ca goi cua nhom giao dien web (gradio, fastapi...) vi rat nang va hay xung dot.
Khong bao gio nem loi: co van de gi thi in ra it hon (build.bat van build duoc)."""
import sys, re

# da co co rieng trong build.bat, hoac rat nang / khong can cho giong CPU: bo qua
SKIP = {"numpy", "scipy", "pillow", "pil", "pip", "setuptools", "wheel", "pyinstaller", "playwright", "certifi", "edge-tts", "edge_tts", "pywebview", "webview",
        "torch", "torchaudio", "torchvision", "torchcodec", "triton", "transformers", "accelerate", "nvidia", "cuda", "tensorflow", "jax", "jaxlib", "opencv-python",
        "opencv-python-headless", "cv2", "matplotlib", "pandas", "sympy", "networkx", "jinja2", "markupsafe", "typing-extensions", "typing_extensions", "tqdm",
        "requests", "urllib3", "idna", "charset-normalizer", "charset_normalizer", "packaging", "pyyaml", "yaml", "filelock", "fsspec", "colorama", "six", "attrs"}
DEPTH = 2
MAX_PKGS = 25
# Chi bo qua khi dung --nuitka: giao dien web/may chu cua vieneu (khong dung trong AnimStudio) + goi chung chung de gay xung dot
NUITKA_SKIP = {"gradio", "gradio_client", "groovy", "hf_gradio", "fastapi", "starlette", "uvicorn", "orjson", "pydub", "click", "licensing", "google", "brotli", "httpx",
               "httpcore", "anyio", "pydantic", "pydantic_core", "h11", "sniffio", "websockets", "aiofiles", "multipart", "python_multipart", "semantic_version",
               "safehttpx", "ruff", "tomlkit", "typer", "rich", "markdown_it", "pygments", "mdurl", "shellingham", "annotated_types", "annotated_doc", "ffmpy"}


def norm(n):
    return re.sub(r"[-_.]+", "-", str(n or "").strip().lower())


def requires(md, dist):
    out = []
    try:
        for r in md.requires(dist) or []:
            if "extra ==" in r.replace('"', "'").replace("'", "") or "extra==" in r.replace(" ", ""):
                continue
            m = re.match(r"\s*([A-Za-z0-9][A-Za-z0-9._-]*)", r)
            if m:
                out.append(norm(m.group(1)))
    except Exception:
        pass
    return out


def main(argv):
    try:
        import importlib.metadata as md
    except Exception:
        return 0
    roots = [norm(a) for a in argv if not a.startswith("-")]
    try:
        pd = md.packages_distributions()
    except Exception:
        pd = {}
    mod_of = {}
    for mod, dists in pd.items():
        for d in dists:
            mod_of.setdefault(norm(d), []).append(mod)
    seen, order, level = set(roots), list(roots), list(roots)
    depth_of = {r: 0 for r in roots}
    for lvl in range(DEPTH):
        nxt = []
        for d in level:
            for r in requires(md, d):
                if r not in seen:
                    seen.add(r)
                    order.append(r)
                    nxt.append(r)
                    depth_of[r] = lvl + 1
        level = nxt
    nuitka = "--nuitka" in argv
    mods, mod_depth = [], {}
    for d in order:
        for m in sorted(mod_of.get(d, [])):
            if not re.fullmatch(r"[A-Za-z_][A-Za-z0-9_]*", m) or m.startswith("_") or norm(m) in SKIP or d in SKIP or m in mods:
                continue
            if nuitka and (m in NUITKA_SKIP or norm(m).replace("-", "_") in NUITKA_SKIP or d.replace("-", "_") in NUITKA_SKIP):
                continue
            if d in roots:
                continue                              # goi goc da co co rieng trong build.bat
            mods.append(m)
            mod_depth[m] = depth_of.get(d, DEPTH)
    mods = mods[:MAX_PKGS]
    if "--list" in argv:
        print(", ".join(mods) or "(khong co)")
    else:
        for m in mods:
            if "--nuitka" in argv:
                try:
                    import importlib.util as iu
                    sp = iu.find_spec(m)
                    is_pkg = bool(sp is not None and sp.submodule_search_locations)
                except Exception:
                    is_pkg = True
                direct = mod_depth.get(m, DEPTH) <= 1
                if is_pkg:
                    print(("--include-package=%s " % m if direct else "") + "--include-package-data=%s" % m)
                elif direct:
                    print("--include-module=" + m)
            else:
                print("--collect-all " + m)
    return 0


if __name__ == "__main__":
    try:
        sys.exit(main(sys.argv[1:]))
    except Exception:
        sys.exit(0)
