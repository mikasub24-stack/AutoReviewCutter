import copy
import json
import os
from pathlib import Path
import queue
import shutil
import subprocess
import sys
import threading
import tkinter as tk
from tkinter import ttk, filedialog, messagebox
import webbrowser

from engine import APP_HOME, ROOT, VERSION, Project, Runner, Stopped, render, transcribe, validate_plan
import settings as config

BG = '#0b1020'
CARD = '#141e32'
FIELD = '#0e1628'
INK = '#edf3ff'
MUTED = '#99acc9'
ACCENT = '#55dfc3'


def open_file(path):
    path = str(Path(path).resolve())
    if os.name == 'nt':
        os.startfile(path)
    elif sys.platform == 'darwin':
        subprocess.Popen(['open', path])
    else:
        subprocess.Popen(['xdg-open', path])


class App(tk.Tk):
    def __init__(self):
        super().__init__()
        self.title('H3 Studio · Làm phim AI bằng tiếng Việt · ' + VERSION)
        self.geometry('1180x820')
        self.minsize(960, 680)
        self.configure(bg=BG)
        try:
            self.iconbitmap(str(ROOT / 'icon.ico'))
        except tk.TclError:
            pass
        self.preferences, self.secrets = config.load()
        self.events = queue.Queue()
        self.stop = threading.Event()
        self.busy = False
        self.project = None
        self.photo = None
        self.selected = None
        self.editing_scene = None
        self.protocol('WM_DELETE_WINDOW', self.close)
        style = ttk.Style(self)
        style.theme_use('clam')
        style.configure('.', background=CARD, foreground=INK, fieldbackground=FIELD, font=('Segoe UI', 10))
        style.configure('TNotebook', background=BG, borderwidth=0)
        style.configure('TNotebook.Tab', padding=(18, 9), background=CARD, foreground=MUTED)
        style.map('TNotebook.Tab', background=[('selected', '#22324c')], foreground=[('selected', ACCENT)])
        style.configure('Treeview', background=FIELD, foreground=INK, fieldbackground=FIELD, rowheight=32, borderwidth=0)
        style.configure('Treeview.Heading', background=CARD, foreground=MUTED)
        style.map('Treeview', background=[('selected', '#244d58')])
        style.configure('TCombobox', fieldbackground=FIELD, foreground=INK, arrowcolor=ACCENT)
        style.map('TCombobox', fieldbackground=[('readonly', FIELD)], foreground=[('readonly', INK)])
        head = tk.Frame(self, bg=BG)
        head.pack(fill='x', padx=22, pady=(16, 10))
        tk.Label(head, text='H3 STUDIO', font=('Segoe UI', 24, 'bold'), fg=ACCENT, bg=BG).pack(side='left')
        tk.Label(head, text='Từ câu chuyện đến bộ phim của bạn', fg=MUTED, bg=BG, font=('Segoe UI', 11)).pack(side='left', padx=18)
        self.button(head, 'Mở dự án', self.open_project).pack(side='right', padx=4)
        self.button(head, 'Dự án mới', self.new_project).pack(side='right', padx=4)
        self.tabs = ttk.Notebook(self)
        self.tabs.pack(fill='both', expand=True, padx=20, pady=4)
        self.work = tk.Frame(self.tabs, bg=BG)
        self.cast = tk.Frame(self.tabs, bg=BG)
        self.connections = tk.Frame(self.tabs, bg=BG)
        self.tabs.add(self.work, text='  Dựng phim  ')
        self.tabs.add(self.cast, text='  Nhân vật & tham chiếu  ')
        self.tabs.add(self.connections, text='  Kết nối  ')
        self.build_workspace()
        self.build_cast()
        self.build_connections()
        foot = tk.Frame(self, bg=BG)
        foot.pack(fill='x', padx=22, pady=(6, 14))
        self.status = tk.StringVar(value='Nhập ý tưởng → kết nối AI → tạo thử một cảnh trước khi làm cả phim.')
        tk.Label(foot, textvariable=self.status, anchor='w', bg=BG, fg=MUTED, wraplength=850, justify='left').pack(side='left', fill='x', expand=True)
        self.button(foot, 'Dừng chờ', self.stop_work, danger=True).pack(side='right')
        self.after(100, self.poll_events)

    def button(self, parent, text, command, primary=False, danger=False):
        return tk.Button(parent, text=text, command=command, relief='flat', bd=0,
                         bg=ACCENT if primary else ('#643d51' if danger else '#263650'),
                         fg=BG if primary else INK, activebackground='#70edd5' if primary else '#364b69',
                         activeforeground=BG if primary else INK, font=('Segoe UI', 10, 'bold'),
                         padx=13, pady=8, cursor='hand2')

    def text(self, parent, height=4):
        widget = tk.Text(parent, height=height, wrap='word', bg=FIELD, fg=INK, insertbackground=ACCENT,
                         relief='flat', padx=12, pady=10, font=('Segoe UI', 10), undo=True)
        return widget

    def label(self, parent, text, bold=False):
        return tk.Label(parent, text=text, fg=INK if bold else MUTED, bg=parent['bg'],
                        font=('Segoe UI', 11 if bold else 10, 'bold' if bold else 'normal'), anchor='w')

    def panel(self, parent):
        return tk.Frame(parent, bg=CARD, padx=14, pady=12)

    def build_workspace(self):
        top = self.panel(self.work)
        top.pack(fill='x', pady=(12, 8))
        self.label(top, '01   CÂU CHUYỆN CỦA BẠN', True).pack(fill='x', pady=(0, 8))
        self.idea = self.text(top, 3)
        self.idea.pack(fill='x')
        controls = tk.Frame(top, bg=CARD)
        controls.pack(fill='x', pady=(10, 0))
        self.minutes = tk.StringVar(value='0.17')
        self.language = tk.StringVar(value='Tiếng Việt')
        self.style = tk.StringVar(value='Người thật, điện ảnh')
        self.ratio = tk.StringVar(value='16:9')
        self.resolution = tk.StringVar(value='640p')
        self.label(controls, 'Số phút').pack(side='left')
        tk.Entry(controls, textvariable=self.minutes, width=5, bg=FIELD, fg=INK, insertbackground=INK, relief='flat').pack(side='left', padx=(6, 12), ipady=6)
        for var, options, width in [(self.language, ['Tiếng Việt', 'English'], 11), (self.style, ['Người thật, điện ảnh', 'Hoạt hình 3D', 'Anime 2D'], 21), (self.ratio, ['16:9', '9:16'], 6), (self.resolution, ['640p', '768p'], 6)]:
            ttk.Combobox(controls, textvariable=var, values=options, width=width, state='readonly').pack(side='left', padx=4)
        self.button(controls, 'Tạo toàn bộ phim', self.all_in_one, True).pack(side='right')
        self.button(controls, 'Lập kịch bản', self.plan_only).pack(side='right', padx=6)
        middle = tk.PanedWindow(self.work, orient='horizontal', bg=BG, sashwidth=8, bd=0)
        middle.pack(fill='both', expand=True, pady=4)
        left = self.panel(middle)
        right = self.panel(middle)
        middle.add(left, width=310, minsize=260)
        middle.add(right, minsize=480)
        self.summary = tk.StringVar(value='02   CÁC CẢNH · Chưa có dự án')
        tk.Label(left, textvariable=self.summary, fg=ACCENT, bg=CARD, font=('Segoe UI', 10, 'bold'), anchor='w').pack(fill='x', pady=(0, 8))
        self.tree = ttk.Treeview(left, columns=('state',), show='tree headings', selectmode='browse')
        self.tree.heading('#0', text='Cảnh')
        self.tree.heading('state', text='Trạng thái')
        self.tree.column('#0', width=150)
        self.tree.column('state', width=90, stretch=False)
        self.tree.pack(fill='both', expand=True)
        self.tree.bind('<<TreeviewSelect>>', self.select_scene)
        row = tk.Frame(left, bg=CARD)
        row.pack(fill='x', pady=(8, 0))
        self.button(row, 'Tạo cảnh chọn', self.generate_selected).pack(side='left')
        self.button(row, 'Thêm clip', self.import_clip).pack(side='right')
        self.preview = tk.Label(right, text='Cảnh hoàn thành sẽ hiện tại đây\n\nẢnh tham chiếu cố định · Tiếng nói từ H3',
                                bg=FIELD, fg=MUTED, font=('Segoe UI', 12), height=7)
        self.preview.pack(fill='both', expand=True, pady=(0, 8))
        self.scene_title = self.label(right, 'Chọn cảnh để chỉnh mô tả và lời thoại', True)
        self.scene_title.pack(fill='x')
        self.prompt = self.text(right, 3)
        self.prompt.pack(fill='x', pady=5)
        self.dialogue = self.text(right, 2)
        self.dialogue.pack(fill='x', pady=5)
        row = tk.Frame(right, bg=CARD)
        row.pack(fill='x')
        self.button(row, 'Lưu chỉnh sửa', self.save_scene).pack(side='left')
        self.button(row, 'Xem clip cảnh', self.watch_scene).pack(side='left', padx=6)
        self.button(row, 'Tạo lại cảnh', self.redo_scene).pack(side='right')
        bottom = tk.Frame(self.work, bg=BG)
        bottom.pack(fill='x', pady=10)
        self.button(bottom, 'Tiếp tục tạo cảnh', self.continue_project, True).pack(side='left')
        self.button(bottom, 'Ghép & xuất MP4', self.export).pack(side='left', padx=7)
        self.button(bottom, 'Nhạc nền', self.choose_music).pack(side='left')
        self.button(bottom, 'Phụ đề AI', self.subtitle).pack(side='left', padx=6)
        self.button(bottom, 'Xem phim', self.watch_movie).pack(side='right')
        self.button(bottom, 'Lưu như…', self.save_as).pack(side='right', padx=7)
        self.button(bottom, 'Thư mục', lambda: self.project and open_file(self.project.folder)).pack(side='right')

    def build_cast(self):
        self.label(self.cast, 'Nhân vật được lưu trong dự án và dùng lại ở từng cảnh. Có thể mở dự án cũ để dùng lại ảnh.', True).pack(fill='x', pady=15)
        self.cast_tree = ttk.Treeview(self.cast, columns=('image', 'voice'), show='tree headings', height=10)
        for key, text in [('#0', 'Nhân vật'), ('image', 'Ảnh tham chiếu'), ('voice', 'Âm thanh tham chiếu')]:
            self.cast_tree.heading(key, text=text)
        self.cast_tree.pack(fill='x', pady=8)
        row = tk.Frame(self.cast, bg=BG)
        row.pack(fill='x', pady=8)
        self.button(row, 'Chọn ảnh nhân vật', lambda: self.choose_asset('character')).pack(side='left')
        self.button(row, 'Chọn giọng tham chiếu', lambda: self.choose_asset('voice')).pack(side='left', padx=8)
        self.button(row, 'AI tạo ảnh còn thiếu', self.make_assets).pack(side='left')
        self.button(row, 'Xem ảnh', self.view_asset).pack(side='left', padx=8)
        self.label(self.cast, 'Âm thanh: WAV/MP3 sạch, do bạn sở hữu hoặc được phép sử dụng. Tối đa 3 giọng trong một cảnh.').pack(fill='x', pady=8)
        self.label(self.cast, 'Ảnh và giọng tham chiếu giúp giữ nhân vật; cần xem lại mặt, lời thoại và khẩu hình của từng cảnh.').pack(fill='x')

    def build_connections(self):
        canvas = tk.Canvas(self.connections, bg=BG, highlightthickness=0)
        scrollbar = ttk.Scrollbar(self.connections, orient='vertical', command=canvas.yview)
        canvas.configure(yscrollcommand=scrollbar.set)
        scrollbar.pack(side='right', fill='y')
        canvas.pack(side='left', fill='both', expand=True)
        form = tk.Frame(canvas, bg=BG, padx=16, pady=12)
        window = canvas.create_window((0, 0), window=form, anchor='nw')
        form.bind('<Configure>', lambda e: canvas.configure(scrollregion=canvas.bbox('all')))
        canvas.bind('<Configure>', lambda e: canvas.itemconfigure(window, width=e.width))
        self.fields = {}
        self.secret_fields = {}
        def field(label, key, secret=False):
            self.label(form, label).pack(fill='x', pady=(8, 3))
            var = tk.StringVar(value=self.secrets.get(key, '') if secret else str(self.preferences.get(key, '')))
            tk.Entry(form, textvariable=var, show='•' if secret else '', bg=FIELD, fg=INK, insertbackground=INK, relief='flat', font=('Segoe UI', 10)).pack(fill='x', ipady=7)
            (self.secret_fields if secret else self.fields)[key] = var
        self.label(form, 'VIDEO H3 · Chạy cloud hoặc ComfyUI có sẵn', True).pack(fill='x')
        self.provider = tk.StringVar(value=self.preferences['provider'])
        ttk.Combobox(form, textvariable=self.provider, values=['RunningHub', 'ComfyUI'], state='readonly').pack(anchor='w', pady=8)
        field('RunningHub API key', 'rh_key', True)
        field('Máy chủ RunningHub', 'rh_url')
        field('Workflow ID · Có sẵn ID công khai; tài khoản phải có quyền chạy workflow và model', 'workflow_id')
        field('ComfyUI URL · Máy có sẵn hoặc máy chủ GPU riêng', 'comfy_url')
        self.label(form, 'KỊCH BẢN · API tương thích OpenAI', True).pack(fill='x', pady=(20, 0))
        field('Địa chỉ API viết kịch bản', 'llm_url')
        field('Model viết kịch bản', 'llm_model')
        field('API key viết kịch bản', 'llm_key', True)
        self.label(form, 'ẢNH NHÂN VẬT · Hoặc tự chọn ảnh ở tab Nhân vật', True).pack(fill='x', pady=(20, 0))
        field('Địa chỉ API tạo ảnh', 'image_url')
        field('Model tạo ảnh', 'image_model')
        field('API key tạo ảnh', 'image_key', True)
        self.label(form, 'PHỤ ĐỀ AI · Nhận dạng giọng nói thực', True).pack(fill='x', pady=(20, 0))
        field('Địa chỉ API nhận dạng âm thanh', 'asr_url')
        field('Model nhận dạng', 'asr_model')
        field('API key nhận dạng · Có key thì Tạo toàn bộ phim tự thêm phụ đề', 'asr_key', True)
        self.label(form, 'MODEL TRÊN MÁY CHỦ H3 · Tên phải khớp model đã cài', True).pack(fill='x', pady=(20, 0))
        for label, key in [('Model Ref2VA', 'unet'), ('Text encoder', 'clip'), ('Video VAE', 'video_vae'), ('Audio VAE', 'audio_vae'), ('Số bước lấy mẫu', 'steps')]:
            field(label, key)
        row = tk.Frame(form, bg=BG)
        row.pack(fill='x', pady=16)
        self.button(row, 'Lưu kết nối', self.save_settings, True).pack(side='left')
        self.button(row, 'Kiểm tra H3', self.test_connection).pack(side='left', padx=8)
        self.button(row, 'Mở RunningHub', lambda: webbrowser.open('https://www.runninghub.cn')).pack(side='left')
        self.button(row, 'Xuất workflow mẫu', self.copy_workflows).pack(side='left', padx=8)
        self.label(form, 'Windows lưu API key bằng DPAPI của tài khoản máy bạn. Key không nằm trong project.json.').pack(fill='x')
        self.label(form, 'Mỗi lần tạo ảnh/video có thể tính phí. Chưa xác nhận mức giá hoặc chất lượng thực trên tài khoản của bạn.').pack(fill='x', pady=6)
        self.label(form, 'Dừng chờ chỉ dừng app đợi kết quả; tác vụ cloud đã gửi có thể còn chạy và tính phí. Hủy trong RunningHub nếu cần.').pack(fill='x')

    def save_settings(self):
        if self.busy:
            raise ValueError('Chờ tác vụ hiện tại dừng trước khi đổi kết nối.')
        self.preferences.update({key: value.get().strip() for key, value in self.fields.items()})
        self.preferences['provider'] = self.provider.get()
        try:
            self.preferences['steps'] = int(self.preferences['steps'])
            if not 1 <= self.preferences['steps'] <= 100:
                raise ValueError()
        except (ValueError, TypeError):
            raise ValueError('Số bước lấy mẫu phải từ 1 đến 100.')
        self.secrets.update({key: value.get().strip() for key, value in self.secret_fields.items()})
        config.save(self.preferences, self.secrets)
        self.status.set('Đã lưu kết nối. Kiểm tra H3 để xác nhận quyền truy cập.')

    def new_project(self):
        if self.busy:
            return
        self.project = None
        self.selected = self.editing_scene = None
        self.idea.delete('1.0', 'end')
        self.prompt.delete('1.0', 'end')
        self.dialogue.delete('1.0', 'end')
        self.preview.configure(image='', text='Cảnh hoàn thành sẽ hiện tại đây')
        self.refresh()

    def open_project(self):
        if self.busy:
            return
        path = filedialog.askopenfilename(title='Mở project.json hoặc kịch bản JSON', filetypes=[('Dự án JSON', '*.json')])
        if not path:
            return
        try:
            if Path(path).name == 'project.json':
                self.project = Project(Path(path).parent)
            else:
                plan = validate_plan(json.loads(Path(path).read_text(encoding='utf-8')))
                folder = filedialog.askdirectory(title='Thư mục lưu dự án được nhập')
                if not folder:
                    return
                self.project = Project(Path(folder) / ('H3-' + uuid_short()), plan)
                self.project.save()
            self.ratio.set(self.project.data['ratio'])
            self.resolution.set(self.project.data['resolution'])
            self.idea.delete('1.0', 'end')
            self.idea.insert('1.0', self.project.data.get('idea', self.project.data['title']))
            self.selected = self.editing_scene = None
            self.refresh()
            self.status.set('Đã mở dự án; task ID và các cảnh hoàn tất được giữ.')
        except Exception as e:
            messagebox.showerror('Chưa mở được', str(e))

    def refresh(self):
        selected = self.tree.selection()
        self.tree.delete(*self.tree.get_children())
        self.cast_tree.delete(*self.cast_tree.get_children())
        if not self.project:
            self.summary.set('02   CÁC CẢNH · Chưa có dự án')
            return
        data = self.project.data
        done = 0
        for scene in data['scenes']:
            job = data['jobs'].get(str(scene['id']), {})
            ready = bool(job.get('file') and self.project.file(job['file']).exists())
            done += ready
            state = '✓ Có clip' if ready else ('Đã gửi' if job.get('task_id') else ('Cần kiểm tra' if job.get('submit_uncertain') else 'Chưa tạo'))
            self.tree.insert('', 'end', iid=str(scene['id']), text=f'{scene["id"]:02} · {scene["title"][:25]}', values=(state,))
        self.summary.set(f'02   CÁC CẢNH · {done}/{len(data["scenes"])} · {round(sum(s["seconds"] for s in data["scenes"]))} giây dự kiến')
        for ch in data['characters']:
            self.cast_tree.insert('', 'end', iid=ch['name'], text=ch['name'], values=('✓ Đã có' if data['assets'].get('character:' + ch['name']) else 'Chưa có', '✓ Đã có' if data['assets'].get('voice:' + ch['name']) else 'H3 tự tạo'))
        if selected and self.tree.exists(selected[0]):
            self.tree.selection_set(selected[0])

    def select_scene(self, event=None):
        choice = self.tree.selection()
        if not choice or not self.project:
            return
        self.selected = int(choice[0])
        scene = next(s for s in self.project.data['scenes'] if s['id'] == self.selected)
        self.editing_scene = self.selected
        self.scene_title.configure(text=scene['title'] + f' · {scene["seconds"]:g} giây dự kiến')
        self.prompt.delete('1.0', 'end'); self.prompt.insert('1.0', scene['prompt'])
        self.dialogue.delete('1.0', 'end'); self.dialogue.insert('1.0', scene['dialogue'])
        job = self.project.data['jobs'].get(str(self.selected), {})
        source = job.get('file')
        if source and self.project.file(source).exists():
            self.make_thumbnail(self.project.file(source))
        else:
            self.preview.configure(image='', text='Cảnh chưa có clip\nTạo cảnh chọn để xem thử trước khi chạy toàn bộ.')

    def make_thumbnail(self, path):
        # Thumbnail generation is short; main render stays in a background worker.
        try:
            from PIL import Image, ImageTk
            from engine import ffmpeg_exe, NO_WINDOW
            target = self.project.folder / 'thumbnail.png'
            subprocess.run([ffmpeg_exe(), '-y', '-ss', '0.2', '-i', str(path), '-frames:v', '1', '-vf', 'scale=600:-1', str(target)],
                           stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, timeout=12, creationflags=NO_WINDOW)
            with Image.open(target) as im:
                im.thumbnail((650, 220))
                self.photo = ImageTk.PhotoImage(im.copy())
            self.preview.configure(image=self.photo, text='')
        except Exception:
            self.preview.configure(image='', text='Clip đã sẵn sàng · Bấm Xem clip cảnh')

    def save_scene(self):
        if not self.project or self.editing_scene is None or self.busy:
            return
        scene = next(s for s in self.project.data['scenes'] if s['id'] == self.editing_scene)
        job = self.project.data['jobs'].get(str(scene['id']), {})
        if job.get('task_id') or job.get('file'):
            self.status.set('Cảnh đã gửi/có clip. Chọn Tạo lại cảnh để dùng mô tả mới; thao tác này có thể tính phí thêm.')
            return
        scene['prompt'] = self.prompt.get('1.0', 'end').strip()
        scene['dialogue'] = self.dialogue.get('1.0', 'end').strip()
        validate_plan(self.project.data)
        self.project.save()
        self.status.set('Đã lưu mô tả cảnh.')

    def runner(self):
        return Runner(copy.deepcopy(self.preferences), self.secrets.copy(), self.stop, lambda *args: self.events.put(args))

    def launch(self, action):
        if self.busy:
            return
        self.busy = True
        self.stop.clear()
        def worker():
            try:
                action()
            except Stopped as e:
                self.events.put(('status', str(e)))
            except Exception as e:
                self.events.put(('error', str(e)))
            finally:
                self.events.put(('idle', None))
        threading.Thread(target=worker, daemon=True).start()

    def prepare_plan(self, complete):
        if self.busy:
            return
        idea = self.idea.get('1.0', 'end').strip()
        if not idea:
            messagebox.showinfo('Ý tưởng', 'Nhập ý tưởng hoặc dán kịch bản trước.')
            return
        try:
            minutes = float(self.minutes.get().replace(',', '.'))
            if not 5 / 60 <= minutes <= 20:
                raise ValueError()
        except ValueError:
            messagebox.showerror('Thời lượng', 'Nhập số phút từ 0,084 đến 20. Nên tạo thử 0,17 phút trước.')
            return
        try:
            self.save_settings()
        except Exception as e:
            messagebox.showerror('Kết nối', str(e)); return
        folder = filedialog.askdirectory(title='Chọn nơi lưu dự án và video')
        if not folder:
            return
        language, style, ratio, resolution = self.language.get(), self.style.get(), self.ratio.get(), self.resolution.get()
        def action():
            run = self.runner()
            if complete:
                run.preflight()  # Do not spend on planning when H3 credentials are missing.
            self.events.put(('status', 'AI đang viết kịch bản và chia cảnh…'))
            plan = run.plan(idea, minutes, language, style, ratio)
            plan.update(idea=idea, ratio=ratio, resolution=resolution, language=language, style=style)
            self.project = Project(Path(folder) / ('H3-' + uuid_short()), plan)
            self.project.save()
            self.events.put(('project', None))
            if complete:
                run.run(self.project)
                self.finish_film(self.project)
                self.events.put(('project', None))
            else:
                self.events.put(('status', 'Đã có kịch bản. Kiểm tra cảnh và nhân vật, rồi tạo thử một cảnh.'))
        self.launch(action)

    def all_in_one(self):
        if self.project:
            self.continue_project(auto_render=True)
        else:
            self.prepare_plan(True)

    def plan_only(self):
        self.prepare_plan(False)

    def continue_project(self, auto_render=False):
        if not self.project:
            self.status.set('Lập hoặc mở kịch bản trước.'); return
        if self.busy:
            return
        self.save_scene()
        self.save_settings()
        project = self.project
        def action():
            self.runner().run(project)
            if auto_render:
                self.finish_film(project)
                self.events.put(('project', None))
        self.launch(action)

    def generate_selected(self):
        if not self.project or self.selected is None or self.busy:
            self.status.set('Chọn một cảnh trước.'); return
        self.save_scene()
        self.save_settings()
        selected = self.selected
        self.launch(lambda: self.runner().run(self.project, selected))

    def redo_scene(self):
        if not self.project or self.selected is None or self.busy:
            return
        job = self.project.data['jobs'].get(str(self.selected), {})
        if job.get('task_id') and not job.get('file'):
            messagebox.showinfo('Tác vụ đã gửi', 'Cảnh còn task cloud chưa lấy được kết quả. Kiểm tra tác vụ đó trước; không gửi trùng.'); return
        if not messagebox.askyesno('Tạo lại cảnh', 'Tạo phiên bản mới có thể tính phí thêm. Clip cũ sẽ được giữ trong thư mục dự án. Tiếp tục?'):
            return
        self.project.data['jobs'].pop(str(self.selected), None)
        self.project.data.pop('output', None)
        self.save_scene()
        self.project.save()
        self.generate_selected()

    def import_clip(self):
        if not self.project or self.selected is None or self.busy:
            return
        job = self.project.data['jobs'].get(str(self.selected), {})
        if job.get('task_id') and not job.get('file'):
            self.status.set('Cảnh đang có tác vụ cloud. Kiểm tra kết quả trước khi thay bằng clip khác.'); return
        source = filedialog.askopenfilename(filetypes=[('Video MP4', '*.mp4')])
        if not source:
            return
        relative = 'clips/import-' + uuid_short() + '.mp4'
        target = self.project.file(relative)
        target.parent.mkdir(parents=True, exist_ok=True)
        shutil.copy2(source, target)
        self.project.data['jobs'][str(self.selected)] = {'file': relative}
        self.project.data.pop('output', None)
        self.project.save(); self.refresh(); self.select_scene()

    def make_assets(self):
        if not self.project or self.busy:
            return
        self.save_settings()
        self.launch(lambda: self.runner().ensure_assets(self.project))

    def choose_asset(self, kind):
        if not self.project or self.busy or not self.cast_tree.selection():
            return
        name = self.cast_tree.selection()[0]
        types = [('Ảnh', '*.png *.jpg *.jpeg *.webp')] if kind == 'character' else [('Âm thanh', '*.wav *.mp3')]
        path = filedialog.askopenfilename(filetypes=types)
        if path:
            self.project.asset(kind + ':' + name, path)
            self.refresh()
            self.status.set('Đã lưu tham chiếu. Các cảnh đã tạo không bị thay đổi.')

    def view_asset(self):
        if self.project and self.cast_tree.selection():
            relative = self.project.data['assets'].get('character:' + self.cast_tree.selection()[0])
            if relative:
                open_file(self.project.file(relative))

    def finish_film(self, project):
        emit = lambda *a: self.events.put(a)
        render(project, self.stop, emit)
        if self.secrets.get('asr_key') and not project.data.get('subtitles'):
            transcribe(project, self.preferences, self.secrets, self.stop, emit)
            render(project, self.stop, emit)

    def subtitle(self):
        if self.project and not self.busy:
            self.save_settings()
            project = self.project
            def action():
                if not project.data.get('output'):
                    render(project, self.stop, lambda *a: self.events.put(a))
                transcribe(project, self.preferences, self.secrets, self.stop, lambda *a: self.events.put(a))
                render(project, self.stop, lambda *a: self.events.put(a))
            self.launch(action)

    def choose_music(self):
        if not self.project or self.busy:
            return
        source = filedialog.askopenfilename(title='Nhạc nền bạn có quyền sử dụng', filetypes=[('Âm thanh', '*.mp3 *.wav *.m4a')])
        if source:
            relative = 'assets/music-' + uuid_short() + Path(source).suffix.lower()
            target = self.project.file(relative)
            target.parent.mkdir(parents=True, exist_ok=True)
            shutil.copy2(source, target)
            self.project.data['music'] = relative
            self.project.save()
            self.status.set('Đã chọn nhạc; khi ghép phim, nhạc tự hạ dưới tiếng nói.')

    def export(self):
        if self.project and not self.busy:
            self.launch(lambda: render(self.project, self.stop, lambda *a: self.events.put(a)))

    def watch_scene(self):
        if self.project and self.selected is not None:
            relative = self.project.data['jobs'].get(str(self.selected), {}).get('file')
            if relative:
                open_file(self.project.file(relative))

    def watch_movie(self):
        if self.project and self.project.data.get('output'):
            open_file(self.project.file(self.project.data['output']))
        else:
            self.status.set('Chưa xuất phim hoàn chỉnh.')

    def save_as(self):
        if not self.project or not self.project.data.get('output'):
            self.status.set('Xuất phim trước khi Lưu như.'); return
        target = filedialog.asksaveasfilename(defaultextension='.mp4', initialfile='phim-h3.mp4', filetypes=[('Video MP4', '*.mp4')])
        if target:
            source = self.project.file(self.project.data['output'])
            if source.resolve() != Path(target).resolve():
                shutil.copy2(source, target)
            self.status.set('Đã lưu video: ' + target)

    def test_connection(self):
        if self.busy:
            return
        try:
            self.save_settings()
            self.launch(lambda: self.events.put(('status', self.runner().preflight())))
        except Exception as e:
            messagebox.showerror('Kết nối', str(e))

    def copy_workflows(self):
        folder = filedialog.askdirectory(title='Lưu workflow ComfyUI mẫu')
        if folder:
            for source in (ROOT / 'vendor').glob('*.json'):
                shutil.copy2(source, Path(folder) / source.name)
            self.status.set('Đã xuất workflow mẫu. ComfyUI/RunningHub cần có đủ node và model tương ứng.')

    def stop_work(self):
        self.stop.set()
        self.status.set('Đang dừng chờ tại máy. Task cloud đã gửi có thể còn chạy; ID vẫn được lưu để tiếp tục.')

    def poll_events(self):
        try:
            while True:
                kind, value = self.events.get_nowait()
                if kind == 'status':
                    self.status.set(value)
                elif kind == 'error':
                    self.status.set(value)
                    messagebox.showerror('Chưa hoàn tất', value)
                elif kind in ('scene', 'project', 'assets'):
                    self.refresh()
                    if kind == 'scene':
                        self.tree.selection_set(str(value)); self.select_scene()
                elif kind == 'idle':
                    self.busy = False
                    self.refresh()
        except queue.Empty:
            pass
        self.after(100, self.poll_events)

    def close(self):
        self.stop.set()
        if self.project:
            # Background task owns persistence while busy.
            if not self.busy:
                self.project.save()
        self.destroy()

    def report_callback_exception(self, typ, value, tb):
        messagebox.showerror('Chưa thực hiện được', str(value))


def uuid_short():
    import uuid
    return uuid.uuid4().hex[:12]


def main():
    app = App()
    smoke_errors = []
    if '--smoke-test' in sys.argv:
        def finish():
            try:
                assert app.tabs.index('end') == 3
                assert app.tree.winfo_exists()
                preview = os.environ.get('H3_UI_PREVIEW')
                if preview:
                    from PIL import ImageGrab
                    ImageGrab.grab().save(preview)
            except Exception as e:
                smoke_errors.append(str(e))
            finally:
                app.destroy()
        app.after(1200, finish)
    app.mainloop()
    if smoke_errors:
        raise RuntimeError("; ".join(smoke_errors))


if __name__ == '__main__':
    main()
