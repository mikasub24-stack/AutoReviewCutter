# -*- coding: utf-8 -*-
"""Tab Quét bộ Douyin: giữ nguyên bố cục 2.5.45, thay backend bằng API trực tiếp.
Không mở trình duyệt/tiện ích khi Quét hoặc Lấy link. Cookie lấy ở thẻ Tải video.
Các nút và phần tải vẫn giữ hợp đồng cũ. Không tự giải CAPTCHA.
"""
import os, re, json, time
import types

import tkinter as tk
from tkinter import ttk, messagebox

import tabs
import theme as T
from theme import Btn, Bar, card, entry as t_entry

from . import bridge, browsers, directscan
from .tab import _place, default_folder

KEY = "ytscan"
BG, PANEL, PANEL2, INPUT, BORDER = T.BG, T.PANEL, T.PANEL2, T.INPUT, T.BORDER
TEXT, MUTED = T.TEXT, T.MUTED
ACCENT, GREEN, ORANGE, RED = T.ACCENT, T.GREEN, T.ORANGE, T.RED
FONT, FONTB, FONTS = T.FONT, T.FONTB, T.FONTS

READY = "API trực tiếp (thử nghiệm): dùng cookie đã nạp ở thẻ Tải video. Bấm Quét không mở trình duyệt/tiện ích; gặp xác minh sẽ dừng."
COLS = 12                                  # số ô tick trên 1 hàng trong danh sách video (gọn, thấy hết)
COVER_W, COVER_H = 96, 128


def _inside(w, anc):
    while w is not None:
        if w is anc:
            return True
        w = getattr(w, "master", None)
    return False


def chip_label(name, kind):
    """Nhãn ngắn trên ô tick: «Tên bộ - Tập 07» → «07»; «Tên bộ - Gộp 01-10» → «Gộp 01-10»."""
    name = name or ""
    if kind == "merged":
        m = re.search(r"(Gộp\s*[\d\-]+)\s*$", name)
        return m.group(1) if m else "Gộp"
    m = re.search(r"Tập\s*(\d+)", name)
    return m.group(1) if m else (name[-8:] or "?")


class Page(tk.Frame):
    def __init__(self, parent, app, hub):
        super().__init__(parent, bg=BG)
        self.app = app
        self.hub = hub                 # trang «Tải video» (ytdl/hub.py): hub.dl = thẻ Tải, hub.show_dl() = chuyển sang thẻ Tải
        self.dir = tabs.data_dir(KEY)
        self.settings_file = os.path.join(self.dir, "settings.json")
        self.cfg = {"url": "", "browser": None, "mini": False}
        try:
            with open(self.settings_file, encoding="utf-8") as f:
                d = json.load(f)
            if isinstance(d, dict):
                self.cfg.update({k: d[k] for k in self.cfg if k in d})
        except Exception:
            pass
        self.rows = []                 # mỗi bộ: dict (xem _add_row)
        self.queue = []                # các hàng đang chờ tới lượt lấy link
        self.cur = None                # hàng đang lấy link
        self.job = None                # việc cầu nối đang chạy
        self.mode = ""                 # "list" | "fetch"
        self._poll_id = None
        self._list_url = ""
        self._sweep = 0
        self.avail = browsers.installed()          # [(mã, tên, đường dẫn)] trình duyệt tìm thấy trên máy
        self._launched = {}                        # id việc -> đã tự mở trình duyệt cho việc đó
        self._imgs = []                            # giữ tham chiếu ảnh (Tk tự xóa ảnh nếu không ai giữ)
        self._dl_id = None                         # hẹn giờ cập nhật tiến trình tải
        self.direct = directscan.Scanner(self.hub.dl.cookie_file)
        self.build()

    # ------------------------------------------------------------ trạng thái
    @property
    def is_busy(self):
        return bool(self.job is not None and not self.job.finished) or bool(self.queue) or bool(self.direct.thread and self.direct.thread.is_alive())

    # ------------------------------------------------------------ giao diện
    def build(self):
        hd = tk.Frame(self, bg=BG)
        hd.pack(fill="x", padx=20, pady=(12, 0))
        tk.Label(hd, text="Quét bộ / kênh Douyin", bg=BG, fg=TEXT, font=("Segoe UI", 16, "bold")).pack(anchor="w")
        tk.Label(hd, text="Dán link kênh hoặc bộ sưu tập → xem từng bộ (ảnh bìa, tên gốc, số video) → lấy link → chuyển sang thẻ «Tải video» để tải",
                 bg=BG, fg=MUTED, font=FONT).pack(anchor="w")

        c = card(self, 0, "Link", "link kênh (douyin.com/user/…) hoặc link 1 bộ (douyin.com/collection/…)")
        c.columnconfigure(0, weight=1)
        self.url_var = tk.StringVar(value=self.cfg.get("url", ""))
        self.url_entry = t_entry(c, self.url_var)
        self.url_entry.grid(row=0, column=0, sticky="ew", ipady=6)
        self.url_entry.bind("<Return>", lambda e: self.start_list())
        bt = tk.Frame(c, bg=PANEL)
        bt.grid(row=0, column=1, padx=(8, 0))
        Btn(bt, "📋 Dán", self.paste, kind="soft", padx=12, pady=6).pack(side="left")
        self.btn_scan = Btn(bt, "🔎 Quét", self.start_list, kind="primary", padx=18, pady=6)
        self.btn_scan.pack(side="left", padx=(8, 0))

        brf = tk.Frame(c, bg=PANEL)
        brf.grid(row=1, column=0, columnspan=2, sticky="ew", pady=(8, 0))
        tk.Label(brf, text="Trình duyệt quét:", bg=PANEL, fg=TEXT, font=FONTS).pack(side="left")
        self.auto_label = "Tự động (trình duyệt nào đã mở sẵn)"
        self.labels = [n for _c, n, _p in self.avail] + [self.auto_label]
        self.codes = {n: c_ for c_, n, _p in self.avail}
        self.codes[self.auto_label] = ""
        saved = self.cfg.get("browser")
        pick = next((n for c_, n, _p in self.avail if c_ == saved), None) if saved else None
        if pick is None:
            pick = self.auto_label if (saved == "" or not self.avail) else self.avail[0][1]      # chưa chọn bao giờ: trình duyệt đầu tiên tìm thấy
        self.browser_var = tk.StringVar(value=pick)
        self.browser_box = ttk.Combobox(brf, textvariable=self.browser_var, values=self.labels, state="readonly", width=34, font=FONT)
        self.browser_box.pack(side="left", padx=8)
        Btn(brf, "🌐 Mở trình duyệt", self.open_browser, kind="soft", font=FONTS, padx=10, pady=3).pack(side="left")
        self.mini_var = tk.BooleanVar(value=bool(self.cfg.get("mini")))
        tk.Checkbutton(brf, text="Thu nhỏ cửa sổ quét xuống thanh tác vụ", variable=self.mini_var, bg=PANEL, fg=TEXT, selectcolor=INPUT, activebackground=PANEL, activeforeground=TEXT,
                       bd=0, highlightthickness=0, font=FONTS, cursor="hand2").pack(side="left", padx=(12, 0))
        tk.Label(brf, text="  (cần tiện ích 2.5.3+)", bg=PANEL, fg=MUTED, font=FONTS).pack(side="left")

        sr = tk.Frame(c, bg=PANEL)
        sr.grid(row=2, column=0, columnspan=2, sticky="ew", pady=(8, 0))
        top = tk.Frame(sr, bg=PANEL)
        top.pack(fill="x")
        self.btn_cancel = Btn(top, "✕ Hủy", self.cancel, kind="soft", font=FONTS, padx=10, pady=3)       # chỉ hiện khi đang chạy
        self.status = tk.Label(top, text=READY, bg=PANEL, fg=MUTED, font=FONTS, anchor="w", justify="left", wraplength=900)
        self.status.pack(side="left", fill="x", expand=True)
        self.pb = Bar(sr, 6)
        self.pb.pack(fill="x", pady=(6, 0))

        lh = tk.Frame(self, bg=BG)
        lh.pack(fill="x", padx=20, pady=(8, 2))
        tk.Label(lh, text="Các bộ tìm thấy", bg=BG, fg=TEXT, font=("Segoe UI", 12, "bold")).pack(side="left")
        self.count_lbl = tk.Label(lh, text="", bg=BG, fg=MUTED, font=FONT)
        self.count_lbl.pack(side="left", padx=10)
        Btn(lh, "➜ Chuyển các bộ đã lấy sang thẻ Tải (chưa tải)", self.send_all, kind="soft", pady=3, font=FONTS).pack(side="right")
        Btn(lh, "⬇ Lấy link các bộ đã chọn", self.fetch_selected, kind="soft", pady=3, font=FONTS).pack(side="right", padx=6)
        Btn(lh, "☑ Chọn / bỏ chọn tất cả", self.select_all, kind="soft", pady=3, font=FONTS).pack(side="right")

        cf = tk.Frame(self, bg=BG)
        cf.pack(fill="x", padx=20, pady=(0, 2))
        Btn(cf, "⬇ Tải các bộ đã lấy", self.download_all, kind="primary", pady=3, font=FONTS).pack(side="right")
        Btn(cf, "📂 Mở thư mục", self.open_folder, kind="soft", pady=3, font=FONTS).pack(side="right", padx=6)
        Btn(cf, "⚙ Đổi cấu hình tải", lambda: self.hub.show_dl(), kind="soft", pady=3, font=FONTS).pack(side="right")
        tk.Label(cf, text="Tải theo cấu hình ở thẻ «Tải video» (thư mục lưu, chất lượng, cookie…):", bg=BG, fg=MUTED, font=FONTS).pack(side="left")
        self.cfg_lbl = tk.Label(self, text="", bg=BG, fg=TEXT, font=FONTS, anchor="w", justify="left", wraplength=1080)
        self.cfg_lbl.pack(fill="x", padx=20, pady=(0, 2))
        self._cfg_line()

        wrap = tk.Frame(self, bg=PANEL, highlightbackground=BORDER, highlightthickness=1)
        wrap.pack(fill="both", expand=True, padx=20, pady=(2, 16))
        self.canvas = tk.Canvas(wrap, bg=PANEL, highlightthickness=0)
        sb = ttk.Scrollbar(wrap, orient="vertical", command=self.canvas.yview)
        self.canvas.configure(yscrollcommand=sb.set)
        sb.pack(side="right", fill="y")
        self.canvas.pack(side="left", fill="both", expand=True)
        self.inner = tk.Frame(self.canvas, bg=PANEL)
        self.win_id = self.canvas.create_window((0, 0), window=self.inner, anchor="nw")
        self.inner.bind("<Configure>", lambda e: self.canvas.configure(scrollregion=self.canvas.bbox("all")))
        self.canvas.bind("<Configure>", lambda e: self.canvas.itemconfigure(self.win_id, width=e.width))
        self.empty_lbl = tk.Label(self.inner, text="Chưa quét.\nDán link kênh hoặc bộ sưu tập ở trên rồi bấm «Quét».", bg=PANEL, fg=MUTED, font=("Segoe UI", 11), pady=50)
        self.empty_lbl.pack(fill="x")

    def on_wheel(self, e):
        try:
            w = self.winfo_containing(e.x_root, e.y_root)
        except Exception:
            w = None
        if w is not None and _inside(w, self.canvas) and self.inner.winfo_height() > self.canvas.winfo_height():
            self.canvas.yview_scroll(int(-1 * (e.delta / 120)), "units")

    def set_status(self, text, fg=MUTED):
        self.status.configure(text=text, fg=fg)

    def _busy_ui(self, on):
        self.btn_scan.configure(state="disabled" if on else "normal")
        if on and not self.btn_cancel.winfo_manager():
            self.btn_cancel.pack(side="right", padx=(8, 0))
        elif not on:
            if self.btn_cancel.winfo_manager():
                self.btn_cancel.pack_forget()
            self.pb.set(0)

    def paste(self):
        try:
            clip = self.clipboard_get().strip()
        except tk.TclError:
            return
        m = re.search(r"https?://\S+", clip)
        if m:
            self.url_var.set(m.group(0))

    def _photo(self, data_url):
        """Ảnh PNG dạng data URL → tk.PhotoImage (không cần Pillow); lỗi → None."""
        if not data_url or "," not in data_url:
            return None
        try:
            img = tk.PhotoImage(data=data_url.split(",", 1)[1])
        except tk.TclError:
            return None
        self._imgs.append(img)
        return img

    # ------------------------------------------------------------ trình duyệt quét
    def browser_code(self):
        """Mã trình duyệt đã chọn ('' = tự động: trình duyệt nào có tiện ích cũng nhận việc)."""
        return self.codes.get(self.browser_var.get(), "")

    def job_browser(self):
        """Mã gửi kèm việc: Brave dùng chung nhận dạng với Chrome nên không lọc (để '')."""
        c = self.browser_code()
        return "" if c == "brave" else c

    def open_browser(self):
        code = self.browser_code()
        if not code:
            messagebox.showinfo("Mở trình duyệt", "Hãy chọn một trình duyệt ở ô «Trình duyệt quét» (đang để Tự động = dùng trình duyệt nào bạn đã mở sẵn).", parent=self)
            return
        if browsers.is_running(code):
            self.set_status("%s đang mở sẵn rồi, không mở thêm." % bridge.browser_name(code), ACCENT)
            return
        ok, err = browsers.launch(code)
        if ok:
            self.set_status("Đã mở %s. Cần cài tiện ích YT Cookie Exporter bản 2.5.1 trở lên trong trình duyệt này (đăng nhập Douyin không bắt buộc)." % bridge.browser_name(code))
        else:
            messagebox.showerror("Mở trình duyệt", err, parent=self)

    def _auto_open_browser(self, job, br):
        """Kept for compatibility; direct scan never launches a browser."""
        return

    def _url(self):
        m = re.search(r"https?://\S+", self.url_var.get() or "")
        return m.group(0) if m else ""

    def _bridge(self):
        # Same call contract, now backed by the direct worker, not the extension server.
        return self.direct

    def start_list(self):
        if self.is_busy:
            messagebox.showinfo("Đang chạy", "Đang quét / lấy link. Chờ xong hoặc bấm «Hủy».", parent=self)
            return
        url = self._url()
        if not url:
            messagebox.showwarning("Thiếu link", "Dán link kênh hoặc bộ sưu tập Douyin vào ô Link rồi bấm «Quét».", parent=self)
            return
        br = self._bridge()
        if br is None:
            return
        try:
            job = br.submit(url, {"browser": self.job_browser(), "mini": self.mini_var.get()}, "list")
        except bridge.Busy:
            messagebox.showinfo("Đang bận", "Yêu cầu API trước chưa dừng hẳn. Chờ kết thúc lượt đó rồi thử lại.", parent=self)
            return
        self.job, self.mode, self._list_url = job, "list", url
        self.set_status("Đang gọi API Douyin bằng cookie ở thẻ Tải video; không mở trình duyệt…")
        self._busy_ui(True)
        self._auto_open_browser(job, br)
        self._schedule()

    def _set_groups(self, groups):
        for r in self.rows:
            try:
                r["frame"].destroy()
            except tk.TclError:
                pass
        self.rows = []
        self.queue = []
        self._imgs = []
        for g in groups:
            self._add_row(g)
        if self.rows:
            self.empty_lbl.pack_forget()
        else:
            self.empty_lbl.pack(fill="x")
        tot = sum(r["g"]["n"] for r in self.rows)
        self.count_lbl.configure(text="%d bộ" % len(self.rows) + (" • khoảng %d video" % tot if tot else ""))
        self.canvas.yview_moveto(0)

    def _add_row(self, g):
        f = tk.Frame(self.inner, bg=PANEL2, highlightbackground=BORDER, highlightthickness=1)
        f.pack(fill="x", padx=6, pady=4)
        f.columnconfigure(1, weight=1)
        # ảnh bìa bộ
        cv = tk.Frame(f, bg=INPUT, width=COVER_W, height=COVER_H)
        cv.grid(row=0, column=0, rowspan=3, padx=8, pady=8, sticky="n")
        cv.pack_propagate(False)
        img = self._photo(g.get("cover"))
        cover = tk.Label(cv, image=img, bg=INPUT) if img is not None else tk.Label(cv, text="🎞", bg=INPUT, fg=MUTED, font=("Segoe UI", 26))
        cover.pack(fill="both", expand=True)
        # tên gốc ở trên
        var = tk.BooleanVar(value=True)
        nm = tk.Frame(f, bg=PANEL2)
        nm.grid(row=0, column=1, sticky="ew", pady=(10, 0))
        cb = tk.Checkbutton(nm, variable=var, bg=PANEL2, fg=TEXT, selectcolor=INPUT, activebackground=PANEL2, activeforeground=TEXT, bd=0, highlightthickness=0, cursor="hand2")
        cb.pack(side="left")
        name = tk.Label(nm, text=g["name"], fg=TEXT, bg=PANEL2, font=("Segoe UI", 11, "bold"), anchor="w", justify="left", wraplength=560)
        name.pack(side="left", fill="x", expand=True)
        info = tk.Label(f, text="", fg=MUTED, bg=PANEL2, font=FONTS, anchor="w", justify="left", wraplength=640)
        info.grid(row=1, column=1, sticky="new", pady=(2, 0))
        pb = Bar(f, 5)                                              # chỉ hiện khi đang lấy link bộ này
        bf = tk.Frame(f, bg=PANEL2)
        bf.grid(row=0, column=2, rowspan=3, sticky="ne", padx=(0, 8), pady=8)
        bf.columnconfigure(0, minsize=0)
        # tiến trình TẢI nằm ngay BÊN CẠNH nút «Tải bộ này» (bên trái nút): dòng chữ + thanh %
        dlbox = tk.Frame(bf, bg=PANEL2)
        dlinfo = tk.Label(dlbox, text="", fg=MUTED, bg=PANEL2, font=FONTS, anchor="e", justify="right", wraplength=250, width=32)
        dlinfo.pack(fill="x")
        dpb = Bar(dlbox, 6)
        dpb.pack(fill="x", pady=(3, 0))
        items_f = tk.Frame(f, bg=PANEL2)                            # danh sách video (ô tick) — chỉ hiện sau khi lấy link
        row = {"g": g, "var": var, "frame": f, "name": name, "info": info, "dlinfo": dlinfo, "dlbox": dlbox, "dpb": dpb, "pb": pb, "items_f": items_f, "cover": cover, "state": "idle",
               "job": None, "err": "", "sent_n": 0, "items": [], "txt_path": "", "dl_urls": set()}
        row["get"] = Btn(bf, "⬇ Lấy link bộ này", lambda r=row: self.fetch_rows([r]), kind="primary", font=FONTS, padx=10, pady=4)
        row["dl"] = Btn(bf, "⬇ Tải bộ này", lambda r=row: self.toggle_dl(r), kind="primary", font=FONTS, padx=10, pady=4)
        row["send"] = Btn(bf, "➜ Sang thẻ Tải", lambda r=row: self.send(r), kind="soft", font=FONTS, padx=10, pady=4)
        row["txt"] = Btn(bf, "💾 .txt", lambda r=row: self.save_txt(r), kind="soft", font=FONTS, padx=10, pady=4)
        for i, b in enumerate((row["get"], row["dl"], row["send"], row["txt"])):
            b.grid(row=i, column=1, sticky="ew", pady=2)
        self.rows.append(row)
        self.refresh_row(row)
        return row

    # ------------------------------------------------------------ danh sách video của 1 bộ (ô tick gọn)
    def _build_items(self, row):
        """Sau khi lấy link: mỗi video 1 ô tick nhỏ xếp lưới (thấy hết, không phải cuộn nhiều). Tập gộp có ô tick riêng, mặc định bỏ."""
        f = row["items_f"]
        for w in list(f.winfo_children()):
            w.destroy()
        job = row["job"]
        its = list(getattr(job, "items", None) or [])
        if not its:                                                  # tiện ích cũ: chỉ có dòng 'link<TAB>tên[<TAB>link]'
            for ln in job.lines:
                p = ln.split("\t")
                nm = p[1] if len(p) > 1 else ""
                its.append({"url": p[0], "name": nm, "direct": p[2] if len(p) > 2 else "", "kind": "merged" if re.search(r"Gộp\s*[\d\-]+\s*$", nm) else "ep"})
        row["items"] = []
        eps = [it for it in its if it["kind"] != "merged"]
        mer = [it for it in its if it["kind"] == "merged"]
        for it in eps + mer:
            it = dict(it)
            it["var"] = tk.BooleanVar(value=(it["kind"] != "merged"))
            row["items"].append(it)
        ge = tk.Frame(f, bg=PANEL2)
        ge.pack(fill="x")
        n_ep = 0
        for it in row["items"]:
            if it["kind"] == "merged":
                continue
            self._chip(ge, row, it, n_ep // COLS, n_ep % COLS)
            n_ep += 1
        merged = [it for it in row["items"] if it["kind"] == "merged"]
        if merged:
            gm = tk.Frame(f, bg=PANEL2)
            gm.pack(fill="x", pady=(4, 0))
            tk.Label(gm, text="Tập gộp (tick để lấy link vào .txt / danh sách tải):", bg=PANEL2, fg=ORANGE, font=FONTS).pack(side="left", padx=(2, 6))
            for it in merged:
                self._chip(gm, row, it, None, None)

    def _chip(self, parent, row, it, r, c):
        fg = TEXT if it["direct"] else ORANGE                        # cam = chưa có link tải trực tiếp (bị captcha?)
        cb = tk.Checkbutton(parent, text=chip_label(it["name"], it["kind"]), variable=it["var"], command=lambda: self.refresh_row(row),
                            bg=PANEL2, fg=fg, selectcolor=INPUT, activebackground=PANEL2, activeforeground=fg, bd=0, highlightthickness=0,
                            font=FONTS, cursor="hand2", anchor="w")
        if r is None:
            cb.pack(side="left", padx=2)
        else:
            cb.grid(row=r, column=c, sticky="w", padx=(2, 0))

    def ticked(self, row):
        return [it for it in row["items"] if it["var"].get()]

    def ticked_lines(self, row):
        return bridge.items_lines(self.ticked(row))

    # ------------------------------------------------------------ hiển thị 1 hàng
    def refresh_row(self, row, hint=""):
        g, st, job = row["g"], row["state"], row.get("job")
        base = ("%d video (theo Douyin)" % g["n"]) if g["n"] else "chưa biết số video"
        fg = MUTED
        if st == "idle":
            txt = base + "  •  chưa lấy link"
        elif st == "queued":
            txt = base + "  •  ⏳ đang chờ tới lượt…"
        elif st == "running":
            bits = [base]
            if job is not None:
                bits.append(job.msg)
                if job.total:
                    bits.append("đã xử lý %d/%d" % (job.done_n, job.total))
                elif job.found:
                    bits.append("đã thấy %d video" % job.found)
            if hint:
                bits.append(hint)
            txt, fg = "  •  ".join(bits), (ORANGE if hint else ACCENT)
        elif st in ("done", "sent", "partial"):
            its = row["items"]
            n_eps = sum(1 for i in its if i["kind"] != "merged")
            n_m = len(its) - n_eps
            nd = sum(1 for i in its if i["direct"])
            parts = ["✔ %d tập" % n_eps]
            if n_m:
                parts.append("%d tập gộp" % n_m)
            parts.append("%d/%d có link trực tiếp" % (nd, len(its)))
            parts.append("đang tick %d video" % len(self.ticked(row)))
            if len(its) - nd:
                parts.append("%d chưa có link trực tiếp (chữ cam — API chưa trả link; chưa xác định nguyên nhân)" % (len(its) - nd))
            if st == "sent":
                parts.append("➜ đã đưa %d video vào danh sách tải" % row.get("sent_n", 0))
            if row.get("partial"):
                parts.append("CHƯA QUÉT ĐỦ: " + (row.get("err") or "đã dừng"))
            txt, fg = "  •  ".join(parts), ORANGE if row.get("partial") else GREEN
        else:
            txt, fg = "✘ " + (row.get("err") or "lỗi")[:220], RED
        row["info"].configure(text=txt, fg=fg)
        busy = st in ("queued", "running")
        row["get"].configure(state="disabled" if busy else "normal", text="↻ Lấy lại" if st in ("done", "sent", "partial", "error") else "⬇ Lấy link bộ này",
                             kind="soft" if st in ("done", "sent", "partial") else "primary")
        ok = st in ("done", "sent", "partial")
        row["send"].configure(state="normal" if ok else "disabled")
        row["txt"].configure(state="normal" if ok else "disabled")
        # tiến trình TẢI của bộ (khi đã bấm «Tải bộ này»)
        ds = self.hub.dl.urls_status(row["dl_urls"]) if row["dl_urls"] else None
        dl_btn, dl_state, dl_txt, dl_fg = "⬇ Tải bộ này", "normal" if ok else "disabled", "", MUTED
        if ds and ds["total"]:
            active = ds["run"] + ds["wait"] > 0
            bits = ["Tải %d/%d" % (ds["done"], ds["total"])]
            for k, lab in (("run", "đang tải"), ("wait", "chờ"), ("pause", "tạm dừng"), ("err", "lỗi")):
                if ds[k]:
                    bits.append("%s %d" % (lab, ds[k]))
            dl_txt = "  •  ".join(bits)
            if active:
                dl_btn, dl_fg = "❚❚ Tạm dừng tải", ACCENT
            elif ds["done"] == ds["total"]:
                dl_btn, dl_state, dl_fg, dl_txt = "✔ Đã tải xong", "disabled", GREEN, dl_txt + "  ✔"
            else:
                dl_btn, dl_fg = "⬇ Tải tiếp (còn %d)" % (ds["total"] - ds["done"]), (RED if ds["err"] else ORANGE)
        row["dl"].configure(text=dl_btn, state=dl_state, kind="primary" if ok and dl_state == "normal" else "soft")
        if dl_txt:
            row["dlinfo"].configure(text=dl_txt, fg=dl_fg)
            row["dpb"].set(ds["pct"], GREEN if dl_fg == GREEN else (RED if ds["err"] and not active else ACCENT))
            if not row["dlbox"].winfo_manager():
                row["dlbox"].grid(row=1, column=0, sticky="e", padx=(0, 8))
        elif row["dlbox"].winfo_manager():
            row["dlbox"].grid_forget()
        if st == "running":                                            # thanh lấy link (không phải thanh tải)
            if not row["pb"].winfo_manager():
                row["pb"].grid(row=3, column=1, columnspan=2, sticky="ew", padx=(0, 8), pady=(4, 0))
            if job is not None and job.total:
                row["pb"].set(100.0 * job.done_n / max(1, job.total))
            else:
                self._sweep = (self._sweep + 9) % 100
                row["pb"].set(0)
        elif row["pb"].winfo_manager():
            row["pb"].grid_forget()
        if ok and row["items"] and not row["items_f"].winfo_manager():
            row["items_f"].grid(row=4, column=0, columnspan=3, sticky="ew", padx=(110, 8), pady=(0, 8))
        elif not ok and row["items_f"].winfo_manager():
            row["items_f"].grid_forget()

    # ------------------------------------------------------------ lấy link từng bộ (xếp hàng, mỗi lần 1 bộ)
    def select_all(self):
        on = not all(r["var"].get() for r in self.rows)
        for r in self.rows:
            r["var"].set(on)

    def fetch_selected(self):
        rows = [r for r in self.rows if r["var"].get()]
        if not rows:
            messagebox.showinfo("Chưa chọn bộ", "Hãy tick ít nhất 1 bộ (hoặc quét danh sách trước).", parent=self)
            return
        self.fetch_rows(rows)

    def fetch_rows(self, rows):
        rows = [r for r in rows if r["state"] not in ("running", "queued") and r["g"].get("url")]
        if not rows:
            return
        if self._bridge() is None:
            return
        for r in rows:
            r["state"] = "queued"
            self.refresh_row(r)
            self.queue.append(r)
        self._busy_ui(True)
        self._pump()

    def _pump(self):
        if self.job is not None and not self.job.finished:
            return
        while self.queue:
            row = self.queue.pop(0)
            if row["state"] != "queued":
                continue
            br = self.direct
            try:
                job = br.submit(row["g"]["url"], {"merged": True, "name": row["g"]["name"], "group_key": row["g"]["key"], "browser": self.job_browser(), "mini": self.mini_var.get()}, "scan")
            except bridge.Busy:
                self.queue.insert(0, row)
                break
            job.title = row["g"]["name"]
            row["job"], row["state"] = job, "running"
            self.job, self.mode, self.cur = job, "fetch", row
            self.refresh_row(row)
            self._auto_open_browser(job, br)
            self._schedule()
            return
        if self.job is None or self.job.finished:
            self.cur = None
            if not self.queue:
                self._busy_ui(False)
                self._summary()
            else:
                self._schedule()

    def _summary(self):
        complete = sum(r["state"] in ("done", "sent") and not r.get("partial") for r in self.rows)
        partial = sum(bool(r.get("partial")) for r in self.rows)
        failed = sum(r["state"] == "error" for r in self.rows)
        if complete or partial or failed:
            text = "Đã lấy link: %d nhóm hoàn tất; %d nhóm chưa đủ; %d nhóm lỗi." % (complete, partial, failed)
            if partial or failed:
                text += " Phần còn lại dừng khi API lỗi/xác minh/hạn chế; không tự chuyển trình duyệt."
            self.set_status(text, GREEN if complete and not (partial or failed) else ORANGE)

    # ------------------------------------------------------------ vòng hỏi trạng thái việc cầu nối
    def _schedule(self):
        if self._poll_id is None:
            self._poll_id = self.after(400, self._tick)

    def _tick(self):
        self._poll_id = None
        job = self.job
        if job is None:
            self._pump()
            if self.is_busy:
                self._schedule()
            return
        br = self.direct
        br.check(job)
        if not job.finished:
            self._auto_open_browser(job, br)
            hint = br.hint(job)
            if self.mode == "list":
                extra = (" • đã thấy %d video" % job.found) if job.found else ""
                self.set_status(job.msg + extra + ("   •   " + hint if hint else ""), ORANGE if hint else MUTED)
                self._sweep = (self._sweep + 9) % 100
                self.pb.set(0)
            elif self.cur is not None:
                self.refresh_row(self.cur, hint)
                self.set_status("Đang lấy link «%s»… %s" % (self.cur["g"]["name"], job.msg) + ("   •   " + hint if hint else ""), ORANGE if hint else MUTED)
                self.pb.set(100.0 * job.done_n / job.total if job.total else 0)
                if not job.total:
                    self._sweep = (self._sweep + 9) % 100
            self._schedule()
            return
        if getattr(job, "error_kind", "") in directscan.STOP_KINDS:
            for pending in self.queue:
                pending["state"] = "idle"
                self.refresh_row(pending)
            self.queue = []
        try:
            with open(os.path.join(self.dir, "api_last_diagnostic.json"), "w", encoding="utf-8") as f:
                json.dump(getattr(job, "diagnostic", {}), f, ensure_ascii=False, indent=2)
        except OSError:
            pass
        mode, row = self.mode, self.cur
        self.job = None
        if mode == "list":
            self._list_done(job)
        else:
            self._fetch_done(job, row)
        self._pump()
        if self.is_busy:
            self._schedule()
        elif mode == "list":
            self._busy_ui(False)

    def _list_done(self, job):
        if job.state == "done":
            self._set_groups(job.groups)
            tot = sum(g["n"] for g in job.groups)
            self.set_status("Tìm thấy %d bộ%s. Bấm «Lấy link bộ này» ở bộ cần, hoặc tick nhiều bộ rồi «Lấy link các bộ đã chọn»." % (len(self.rows), (" (khoảng %d video)" % tot) if tot else ""), GREEN)
            if len(self.rows) == 1 and "/collection/" in self._list_url:       # dán thẳng link 1 bộ: lấy luôn
                self.fetch_rows(self.rows)
        elif job.state == "error":
            if job.groups:
                self._set_groups(job.groups)
            self.set_status("✘ CHƯA QUÉT ĐỦ: " + (job.error or "Quét không thành công."), RED)
            messagebox.showerror("Quét bộ / kênh", job.error or "Quét không thành công.", parent=self)
        else:
            if job.groups:
                self._set_groups(job.groups)
            self.set_status("Đã hủy; kết quả đã nhận được giữ lại, chưa xác nhận đủ.")

    def _fetch_done(self, job, row):
        if row is None:
            return
        if job.state == "done":
            row["state"], row["partial"] = "done", False
            self._build_items(row)
            try:
                lines = self.ticked_lines(row)
                row["txt_path"] = bridge.save_scan_txt(self._folder(), job.url, lines, sum(1 for ln in lines if ln.count("\t") >= 2), row["g"]["name"])
            except OSError:
                row["txt_path"] = ""
        elif job.items:
            row["state"], row["partial"], row["err"] = "partial", True, job.error or "đã hủy"
            self._build_items(row)
            self.set_status("Kết quả chưa đủ; giữ %d video để bạn kiểm tra hoặc lưu riêng." % len(job.items), ORANGE)
        elif job.state == "error":
            row["state"], row["err"] = "error", job.error
            self.set_status("✘ «%s»: %s" % (row["g"]["name"], job.error), RED)
        else:
            row["state"] = "idle"
        self.refresh_row(row)

    def cancel(self):
        for r in self.queue:
            r["state"] = "idle"
            self.refresh_row(r)
        self.queue = []
        if self.job is not None and not self.job.finished:
            self.direct.cancel(self.job)
        self.set_status("Đã hủy.")

    # ------------------------------------------------------------ chuyển sang thẻ Tải / lưu .txt
    def _folder(self):
        try:
            return self.hub.dl.folder_var.get().strip() or default_folder()
        except Exception:
            return default_folder()

    def _job_like(self, row, lines):
        """Việc giả (chỉ các video đang tick) để thẻ Tải nhận bằng add_scanned()."""
        job = row["job"]
        return types.SimpleNamespace(url=job.url, lines=lines, skipped={}, title=row["g"]["name"], state="done",
                                     direct_count=lambda: sum(1 for ln in lines if ln.count("\t") >= 2))

    def send(self, row, quiet=False):
        if row["state"] not in ("done", "sent", "partial") or row.get("job") is None:
            return 0
        lines = self.ticked_lines(row)
        if not lines:
            if not quiet:
                messagebox.showinfo("Chưa tick video nào", "Bộ này chưa tick video nào để chuyển.", parent=self)
            return 0
        n = self.hub.dl.add_scanned(self._job_like(row, lines), save_txt=False, quiet=quiet) or 0
        row["state"], row["sent_n"] = "sent", n
        self.refresh_row(row)
        if not quiet:
            self.hub.show_dl()
        return n

    def send_all(self):
        rows = [r for r in self.rows if r["state"] in ("done", "partial")]
        if not rows:
            messagebox.showinfo("Chưa có bộ nào", "Chưa có bộ nào đã lấy link (hoặc đã chuyển hết rồi). Hãy «Lấy link» trước.", parent=self)
            return
        tot = sum(self.send(r, quiet=True) for r in rows)
        self.hub.show_dl()
        messagebox.showinfo("Đã chuyển", "Đã chuyển %d video từ %d bộ sang thẻ «Tải video». Bấm «Tải / Tiếp tục tất cả» ở đó để tải." % (tot, len(rows)), parent=self.app)

    def save_txt(self, row):
        if row.get("job") is None or row["state"] not in ("done", "sent", "partial"):
            return
        lines = self.ticked_lines(row)
        if not lines:
            messagebox.showinfo("Chưa tick video nào", "Bộ này chưa tick video nào để lưu.", parent=self)
            return
        try:
            path = bridge.save_scan_txt(self._folder(), row["job"].url, lines, sum(1 for ln in lines if ln.count("\t") >= 2), row["g"]["name"])
        except OSError as e:
            messagebox.showerror("Không lưu được", str(e), parent=self)
            return
        row["txt_path"] = path
        self.set_status("Đã lưu %d video: %s" % (len(lines), path), GREEN)

    # ------------------------------------------------------------ TẢI ngay tại thẻ này (dùng chung cấu hình ở thẻ «Tải video»: thư mục lưu, chất lượng, cookie, tốc độ…)
    def _cfg_line(self):
        try:
            self.cfg_lbl.configure(text=self.hub.dl.config_summary())
        except Exception:
            pass

    def open_folder(self):
        try:
            self.hub.dl.open_folder()
        except Exception:
            pass

    def download_all(self):
        rows = [r for r in self.rows if r["state"] in ("done", "sent", "partial")]
        if not rows:
            messagebox.showinfo("Chưa có bộ nào", "Chưa có bộ nào đã lấy link. Hãy «Lấy link» trước.", parent=self)
            return
        self.download(rows)

    def toggle_dl(self, row):
        """Nút «Tải bộ này»: bấm 1 lần = bắt đầu / tải tiếp; đang tải thì = tạm dừng."""
        ds = self.hub.dl.urls_status(row["dl_urls"]) if row["dl_urls"] else None
        if ds and ds["run"] + ds["wait"] > 0:
            self.hub.dl.pause_urls(row["dl_urls"])
            self.refresh_row(row)
            return
        self.download([row])

    def download(self, rows):
        """Đưa các video đã tick của từng bộ vào danh sách tải (thẻ Tải) rồi bắt đầu tải ngay; tiến trình hiện ngay tại bộ."""
        dl = self.hub.dl
        started = 0
        for r in rows:
            if r["state"] not in ("done", "sent", "partial") or r.get("job") is None:
                continue
            lines = self.ticked_lines(r)
            if not lines:
                continue
            dl.add_scanned(self._job_like(r, lines), save_txt=False, quiet=True)
            r["dl_urls"] = {it["url"] for it in self.ticked(r)}
            r["state"], r["sent_n"] = "sent", len(r["dl_urls"])
            n = dl.start_urls(r["dl_urls"])
            if n < 0:                                                    # cấu hình tải chưa hợp lệ (thư mục lưu…): thẻ Tải đã báo lỗi
                self.refresh_row(r)
                break
            started += n
            self.refresh_row(r)
        if started:
            self.set_status("Đang tải %d video (cấu hình theo thẻ «Tải video»). Có thể sang thẻ Tải để xem chi tiết từng video." % started, ACCENT)
        self._cfg_line()
        self._dl_schedule()

    def _dl_schedule(self):
        if self._dl_id is None:
            self._dl_id = self.after(1000, self._dl_tick)

    def _dl_tick(self):
        self._dl_id = None
        busy = False
        for r in self.rows:
            if r["dl_urls"]:
                self.refresh_row(r)
                ds = self.hub.dl.urls_status(r["dl_urls"])
                if ds["run"] + ds["wait"] > 0:
                    busy = True
        if busy:
            self._dl_schedule()

    def on_show(self):
        self._cfg_line()
        if any(r["dl_urls"] for r in self.rows):
            self._dl_schedule()

    # ------------------------------------------------------------ vòng đời tab
    def can_close(self):
        if not self.is_busy:
            return True
        return messagebox.askyesno("Quét bộ / kênh", "Đang quét / lấy link. Thoát sẽ hủy việc đang chạy. Thoát?", parent=self)

    def shutdown(self):
        try:
            self.cancel()
        except Exception:
            pass
        for token in (self._poll_id, self._dl_id):
            if token:
                try:
                    self.after_cancel(token)
                except tk.TclError:
                    pass
        self.cfg.update(url=self._url(), browser=self.browser_code(), mini=bool(self.mini_var.get()))
        try:
            with open(self.settings_file, "w", encoding="utf-8") as f:
                json.dump(self.cfg, f, ensure_ascii=False, indent=1)
        except OSError:
            pass
