# -*- coding: utf-8 -*-
"""Tao giong cho tung cau, dung dong thoi gian (canh, cau thoai, goc may, phu de) khop do dai giong."""
import os, re, hashlib
from bisect import bisect_right
from dataclasses import dataclass, field
import numpy as np
from .common import APP_DIR, DATA_DIR, clamp, lerp, smooth, detect_lang
from . import langs
from .tts import SR, PROVIDERS, assign_voices, EDGE_VOICES, NARRATOR_VOICE, VoiceBusy
from .audio import envelope

MODES = {"2D hoạt hình": "2d", "3D": "3d", "Người que 3D": "stick"}
RES = {"480p": 480, "720p": 720, "1080p": 1080}


@dataclass
class LineT:
    speaker: str
    text: str
    emotion: str
    energy: float
    question: bool
    scene: int
    start: float = 0.0
    end: float = 0.0
    audio: np.ndarray = None
    env: np.ndarray = None
    subs: list = field(default_factory=list)
    acts: list = field(default_factory=list)
    ins: object = None


@dataclass
class SceneT:
    desc: str
    theme: str
    night: bool
    rain: bool
    start: float = 0.0
    end: float = 0.0
    cast: dict = field(default_factory=dict)
    lines: list = field(default_factory=list)
    era: str = "modern"
    snow: bool = False
    fog: bool = False
    dusk: bool = False


@dataclass
class Cue:
    kind: str            # 'extra' (thu/vat the) hoac 'fx' (hieu ung)
    name: str
    start: float
    end: float
    scene: int = 0
    seed: int = 0
    x0: float = 0.0      # duong di (met) cua thu/vat the
    x1: float = 0.0
    lane: float = 0.0    # 0 = sau nhan vat mot chut; >0 = cang xa
    sound: bool = True
    gain: float = 0.5


@dataclass
class ShotT:
    scene: int
    start: float
    end: float
    kind: str
    fx: float
    fh: float
    zoom: float
    az: float = 0.0


class Project:
    def __init__(self):
        self.script = None
        self.mode, self.aspect = "2d", "16:9"
        self.W = self.H = 0
        self.fps = 30
        self.lines, self.scenes, self.shots = [], [], []
        self.total, self.title_dur = 0.0, 0.0
        self.title, self.subtitle = "", ""
        self.looks = {}
        self.era = "modern"
        self.lang = ""
        self.cues = []
        self.sprites = {}
        self.scene_bgs = {}
        self._ls, self._ss, self._hs = [], [], []

    def finalize(self):
        self._ls = [l.start for l in self.lines]
        self._ss = [s.start for s in self.scenes]
        self._hs = [s.start for s in self.shots]

    def scene_index(self, t):
        return max(0, bisect_right(self._ss, t) - 1)

    def speaking(self, t):
        i = bisect_right(self._ls, t) - 1
        if i >= 0 and t <= self.lines[i].end:
            return self.lines[i]
        return None

    def shot_state(self, s, t):
        prog = clamp((t - s.start) / max(s.end - s.start, 0.6))
        return (s.fx + 0.025 * np.sin(t * 0.55), s.fh, s.zoom * (1 + 0.075 * prog), s.az + 0.02 * np.sin(t * 0.4))

    def cam_at(self, t):
        if not self.shots:
            return (0.0, 1.35, 1.0, 0.0)
        i = max(0, bisect_right(self._hs, t) - 1)
        s = self.shots[i]
        cur = self.shot_state(s, t)
        if i > 0 and self.shots[i - 1].scene == s.scene:
            pe = self.shot_state(self.shots[i - 1], s.start)
            k = smooth((t - s.start) / 0.75)
            return tuple(lerp(a, b, k) for a, b in zip(pe, cur))
        return cur


def split_subs(text, maxc):
    if langs.has_cjk(text):
        return _split_subs_cjk(text, maxc)
    sents = [x for x in re.split(r"(?<=[\.!\?…])\s+", text.strip()) if x]
    cues, cur = [], ""
    lim = maxc * 2
    for s in sents:
        words = s.split()
        for w in words:
            if cur and len(cur) + 1 + len(w) > lim:
                cues.append(cur)
                cur = w
            else:
                cur = (cur + " " + w).strip()
        if cur and re.search(r"[\.!\?…]$", cur) and len(cur) > maxc * 0.9:
            cues.append(cur)
            cur = ""
    if cur:
        cues.append(cur)
    return cues or [text]


def _split_subs_cjk(text, maxc):
    """Phu de chu Han / Nhat / Han: khong co dau cach giua cac chu nen tach theo dau cau (。！？，、), toi da 2 dong moi cue; Han Quoc giu nguyen tu."""
    lim = maxc * 2
    cues, cur = [], ""
    for s in langs.split_sentences(text):
        for pi, (p, sp) in enumerate(langs.wrap_pieces(s)):
            add = (" " if ((sp or (pi == 0 and cur and langs.need_space(cur[-1], p[0]))) and cur) else "") + p
            if cur and len(cur) + len(add) > lim:
                cues.append(cur)
                cur = p
            else:
                cur += add
            if cur and p[-1] in langs.CLAUSE and len(cur) >= lim * 0.6:
                cues.append(cur)
                cur = ""
        if cur and len(cur) > maxc * 0.9:
            cues.append(cur)
            cur = ""
    if cur:
        cues.append(cur)
    return cues or [text]


def dims(aspect, res):
    r = RES.get(res, 720)
    if aspect == "16:9":
        h = r
        w = int(round(h * 16 / 9 / 2) * 2)
    else:
        w = r
        h = int(round(w * 16 / 9 / 2) * 2)
    return w, h


_PKEY = {PROVIDERS[0]: "Microsoft online (tiếng Việt + tiếng Anh)"}          # nhan cu cua nguon Microsoft: giu lam khoa cache de cau da doc o ban truoc van dung lai


def _cache_path(key):
    d = os.path.join(DATA_DIR, "cache")
    os.makedirs(d, exist_ok=True)
    return os.path.join(d, hashlib.sha1(key.encode("utf-8")).hexdigest() + ".npy")


def _tempo(a, sp):
    """Doi toc do doc (giu nguyen cao do) bang ffmpeg atempo."""
    if abs(sp - 1.0) < 0.02 or len(a) == 0:
        return a
    import subprocess
    from .common import ffmpeg
    r = subprocess.run([ffmpeg(), "-v", "quiet", "-f", "f32le", "-ar", str(SR), "-ac", "1", "-i", "-", "-filter:a", f"atempo={min(2.0, max(0.5, sp)):.3f}",
                        "-f", "f32le", "-ar", str(SR), "-ac", "1", "-"], input=np.asarray(a, np.float32).tobytes(), capture_output=True)
    out = np.frombuffer(r.stdout, np.float32).copy()
    return out if len(out) else a


def synth_all(script, provider, provider_id, lang_override, progress=None, cancel=None, speed=1.0, volume=1.0, fresh=False):
    """Tra ve list audio theo thu tu cau; cache tren dia de lan sau khong phai doc lai."""
    voices = assign_voices(script, None)
    out = []
    n = len(script.lines)
    for i, ln in enumerate(script.lines):
        if cancel is not None and cancel.is_set():
            raise RuntimeError("Đã dừng")
        voice = dict(voices.get(ln.speaker, voices[""]))
        ll = lang_override or detect_lang(ln.text)
        if (not lang_override and ll in ("en", "vi") and script.lang not in ("vi", "en") and langs.script_class(script.lang) == "latin"
                and langs.script_counts(ln.text)["vi"] == 0):
            ll = script.lang          # du an tieng Phap / Duc...: dong ngan khong du tu de nhan ra ('en' / 'vi' la mac dinh) -> theo ngon ngu du an, khong doi sang giong Anh / Viet
        if not lang_override and ll == "zh" and script.lang in ("ja", "tw", "hk"):          # dong chi co chu Han trong du an tieng Nhat / Dai Loan / Quang Dong: theo ngon ngu du an
            ll = script.lang
        if script.lang and ll != script.lang and provider_id.startswith(("Microsoft", "Azure")) and not (voice.get("custom") or voice.get("preset") or voice.get("forced")):
            if ln.speaker:
                g = script.chars[ln.speaker].gender if script.chars[ln.speaker].gender in ("m", "f") else "m"
                voice["name"] = EDGE_VOICES[ll][g][0]
            else:
                voice["name"] = NARRATOR_VOICE[ll]
        if provider_id.startswith(("Microsoft", "Azure")) and voice.get("forced") and not voice.get("preset") and langs.script_clash(ll, langs.lang_of_voice(voice["name"])):
            # giong chon tay thuoc ngon ngu khac HAN chu viet cua dong nay (vd van ban tieng Nhat + giong tieng Viet): doc ra se sai -> dung giong tu dong cua ngon ngu dong do
            g = script.chars[ln.speaker].gender if ln.speaker and ln.speaker in script.chars and script.chars[ln.speaker].gender in ("m", "f") else "m"
            voice = dict(name=EDGE_VOICES[ll][g][0] if ln.speaker else NARRATOR_VOICE[ll], rate=0, pitch=0)
        energy = 1.4 if "!" in ln.text else 1.0
        key = f"{_PKEY.get(provider_id, provider_id)}|{voice}|{ln.emotion}|{energy}|{ln.text}"
        cp = _cache_path(key)
        hit = os.path.exists(cp) and not fresh
        a = None
        if hit:
            try:
                a = np.load(cp)
            except Exception:          # file hong do mat dien giua luc ghi -> doc lai cau nay
                a = None
        if a is None:
            try:
                a = provider.synth(ln.text, voice, ln.emotion, energy)
            except Exception as e:           # bao ro cau nao bi loi (cau truoc do da luu, lan sau doc tiep tu day)
                where_ = f"Câu {i + 1}/{n} «{ln.text[:60]}»"
                ne_ = (VoiceBusy if isinstance(e, VoiceBusy) else RuntimeError)(f"{where_}: {e}")
                ne_.where, ne_.line_no = where_, i + 1
                raise ne_ from e
            a = np.asarray(a, np.float32)
            if not getattr(provider, "fell_back", False):
                with open(cp + ".tmp", "wb") as fh:
                    np.save(fh, a)
                os.replace(cp + ".tmp", cp)
        # cat im lang dau/cuoi
        nz = np.where(np.abs(a) > 0.01)[0]
        if len(nz):
            a = a[max(0, nz[0] - int(0.05 * SR)): nz[-1] + int(0.12 * SR)]
        a = _tempo(a, speed)
        if abs(volume - 1.0) > 0.01:
            a = a * volume
            if volume > 1.0:         # to hon 100%: nen mem phan vuot 0.8 thay vi cat cut (do bi re)
                m_ = np.abs(a)
                a = np.where(m_ <= 0.8, a, np.sign(a) * (0.8 + 0.2 * np.tanh((m_ - 0.8) / 0.2)))
            a = np.clip(a, -1.0, 1.0).astype(np.float32)
        out.append(a)
        if progress:
            progress(i + 1, n, f"Giọng đọc {i + 1}/{n}" + (" (đã lưu, dùng lại)" if hit else " (đọc mới)") + f": {ln.text[:40]}")
    return out


SHOT = {
    "16:9": {"wide": (1.0, 1.35), "medium": (1.65, 1.25), "close": (2.4, 1.4), "two": (1.3, 1.3)},
    "9:16": {"wide": (0.85, 1.5), "medium": (1.45, 1.2), "close": (2.0, 1.38), "two": (0.95, 1.3)},
}


def build_project(script, audios, mode="2d", aspect="16:9", res="720p", fps=30, scene_secs=None, first_start=None):
    P = Project()
    P.script, P.mode, P.aspect, P.fps = script, mode, aspect, fps
    P.W, P.H = dims(aspect, res)
    P.title, P.subtitle = script.title, script.subtitle
    P.era = script.era
    from .looks import make_looks
    P.looks = make_looks(script)
    P.title_dur = 3.4 if script.title else 0.0
    land = aspect == "16:9"
    spacing = 1.8 if land else 1.05
    cursor = P.title_dur + 0.5
    if first_start is not None and not P.title_dur:       # tab 'Ve ra' co hieu ung ve tu giay 0: bo doan dem dau 0,5 giay, giong cau dau vao ngay luc net ve bat dau (khong co the tieu de)
        cursor = 0.0
    P.lang = getattr(script, "lang", "") or ""
    maxc = 46 if land else 26
    if langs.is_cjk_text(" ".join(str(l.text or "") for l in script.lines)):
        maxc = 28 if land else 15          # chu Han / Nhat / Han rong gap ~2 lan chu Latin
    for si, sd in enumerate(script.scenes):
        sc = SceneT(sd.desc, sd.theme, sd.night, sd.rain)
        sc.era = script.era
        sc.snow, sc.fog, sc.dusk = sd.snow, sd.fog, sd.dusk
        sc.start = cursor
        names = [n for n in sd.cast if n in script.chars]
        n = len(names)
        prevc = set(P.scenes[-1].cast) if P.scenes else set()
        for i, nm in enumerate(names):
            sx = (i - (n - 1) / 2) * spacing
            en = (sc.start - 1.0) if nm in prevc else sc.start + 0.25 + i * 0.35          # da co mat o canh truoc -> khong di vao lai
            sc.cast[nm] = dict(sx=sx, enter=en, dir=-1 if sx < 0 or n == 1 else 1, idx=i)
        newcomers = [nm for nm in names if nm not in prevc]
        cur = sc.start + ((0.3 if si else 0.9) if not newcomers else 1.0 + 0.3 * len(newcomers)) if n else sc.start + 0.4
        if first_start is not None and si == 0 and not P.title_dur:
            cur = sc.start + max(0.0, float(first_start))        # cau dau tien cua video: vao ngay (thay vi tre 0,4 - 0,9 giay so voi luc bat dau ve)
        prev_spk = None
        for li, ln in enumerate(script.lines):
            if ln.scene != si:
                continue
            a = audios[li]
            lt = LineT(ln.speaker, ln.text, ln.emotion, 1.4 if "!" in ln.text else 1.0, "?" in ln.text, si)
            lt.audio, lt.env = a, envelope(a)
            lt.acts = list(getattr(ln, "acts", []) or [])
            lt.ins = getattr(ln, "ins", None)
            dur = max(0.5, len(a) / SR)
            lt.start, lt.end = cur, cur + dur
            cues = split_subs(ln.text, maxc)
            tot = sum(len(c) for c in cues) or 1
            tt = lt.start
            for c in cues:
                d = dur * len(c) / tot
                lt.subs.append((tt, tt + d, c))
                tt += d
            sc.lines.append(lt)
            P.lines.append(lt)
            cur = lt.end + (0.25 if prev_spk == ln.speaker else 0.4)
            prev_spk = ln.speaker
        sc.end = (sc.lines[-1].end if sc.lines else sc.start + 1) + (0.7 if si == len(script.scenes) - 1 else 0.25)
        if scene_secs and si < len(scene_secs) and scene_secs[si]:
            sc.end = max(sc.end, sc.start + float(scene_secs[si]))        # thoi luong toi thieu cua canh (giu hinh khi loi doc ngan hon)
        cursor = sc.end
        P.scenes.append(sc)
    P.total = cursor + 1.0
    # ---- goc may ----
    tbl = SHOT[aspect]
    for si, sc in enumerate(P.scenes):
        names = list(sc.cast)
        xs = [sc.cast[n]["sx"] for n in names]
        wz, wh = tbl["wide"]
        if len(names) >= 3 and not land:
            wz = 0.7
        wfx = float(np.mean(xs)) if xs else 0.0
        shots = [ShotT(si, sc.start, sc.end, "wide", wfx, wh, wz, 0.0)]
        for li, ln in enumerate(sc.lines):
            if not ln.speaker or ln.speaker not in sc.cast:
                kind, fx = "wide", wfx
            else:
                sx = sc.cast[ln.speaker]["sx"]
                child = script.chars[ln.speaker].age == "child"
                strong = ln.energy > 1.2 or ln.emotion in ("angry", "scared", "surprised", "sad")
                if strong and li % 2 == 0:
                    kind = "close"
                elif len(names) >= 2 and li % 4 == 3:
                    kind = "two"
                else:
                    kind = "medium"
                fx = sx
                if kind == "two":
                    other = min((x for n, x in zip(names, xs) if n != ln.speaker), key=lambda x: abs(x - sx))
                    fx = (sx + other) / 2
            z, h = tbl[kind]
            if kind in ("medium", "close") and ln.speaker and script.chars[ln.speaker].age == "child":
                h *= 0.78
            az = clamp(-fx * 0.07, -0.22, 0.22) if kind != "wide" else 0.0
            last = shots[-1]
            if li > 0 and last.kind == kind and abs(last.fx - fx) < 0.01 and last.kind != "wide":
                continue
            if li == 0 and kind == "wide":
                continue
            shots.append(ShotT(si, max(sc.start, ln.start - 0.25), sc.end, kind, fx, h, z, az))
        for a, b in zip(shots, shots[1:]):
            a.end = b.start
        P.shots += shots
    from .cues import build_cues
    build_cues(P, script)
    P.finalize()
    return P
