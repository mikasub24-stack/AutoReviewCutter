"""Visible production stages, real scene counts and a timestamped session journal."""
import time
import tkinter as tk
from tkinter import ttk, filedialog

BG = '#0b1020'
CARD = '#141e32'
FIELD = '#0e1628'
INK = '#edf3ff'
MUTED = '#99acc9'
ACCENT = '#55dfc3'
PHASES = [
    ('connect', 'Kết nối', 'Đọc workflow, kiểm tra quyền truy cập API trước khi gửi tác vụ.'),
    ('script', 'Kịch bản', 'Viết câu chuyện, chia cảnh, chốt lời thoại và nhân vật.'),
    ('assets', 'Tham chiếu', 'Tạo hoặc dùng lại ảnh nhân vật và bối cảnh.'),
    ('video', 'Tạo cảnh H3', 'Gửi cảnh, theo dõi task cloud và tải clip về máy.'),
    ('edit', 'Dựng & tiếng', 'Chuẩn hóa hình và âm lượng, sắp các cảnh đúng thứ tự.'),
    ('subtitles', 'Phụ đề', 'Nếu có API âm thanh: nghe lời nói thực để tạo phụ đề.'),
    ('export', 'Xuất MP4', 'Ghép bản cuối, trộn nhạc, gắn phụ đề và lưu phim.'),
]
STATES = {'pending': 'Chưa chạy', 'running': 'Đang làm', 'done': '✓ Hoàn tất',
          'partial': 'Đã làm một phần', 'error': 'Cần kiểm tra', 'paused': 'Dừng chờ', 'skipped': 'Không bật'}
CLOUD = {'SUBMITTED': 'Đã gửi cloud', 'QUEUED': 'Chờ GPU', 'PENDING': 'Chờ GPU',
         'RUNNING': 'Đang sinh video', 'WAITING': 'Đang chờ', 'SUCCESS': 'Sinh xong',
         'FAILED': 'Lỗi cloud', 'ERROR': 'Lỗi', 'DOWNLOADED': '✓ Có clip'}


class ProgressUI:
    def build_progress(self):
        host = self.monitor
        host.columnconfigure(0, weight=1)
        host.rowconfigure(5, weight=1)
        self.phase_states = {key: 'pending' for key, *_ in PHASES}
        self.phase_widgets = {}
        self.cloud_states = {}
        self.monitor_started = None
        self.monitor_last_elapsed = 0
        self.monitor_scene = None
        self.monitor_task = ''
        self.last_cloud_log = None
        self.last_journal_status = None
        self.log_lines = []
        self.monitor_title = tk.StringVar(value='CHƯA BẮT ĐẦU · Đây là nơi theo dõi toàn bộ quy trình')
        self.monitor_detail = tk.StringVar(value='Chọn Lập kịch bản hoặc Tạo toàn bộ phim ở tab Dựng phim để bắt đầu.')
        self.monitor_provider = tk.StringVar(value='Chưa gửi tác vụ cloud')
        self.monitor_cloud = tk.StringVar(value='Cloud không luôn trả phần trăm; app chỉ tăng số cảnh khi đã có clip.')
        self.monitor_render = tk.StringVar(value='Dựng phim: chưa chạy')
        self.monitor_elapsed = tk.StringVar(value='00:00:00')
        self.monitor_count = tk.StringVar(value='0 / —')
        self.monitor_assets = tk.StringVar(value='0 / —')
        self.monitor_project = tk.StringVar(value='Chưa mở dự án')
        header = tk.Frame(host, bg=BG)
        header.grid(row=0, column=0, sticky='ew', pady=(8, 5))
        tk.Label(header, textvariable=self.monitor_title, fg=INK, bg=BG, font=('Segoe UI', 13, 'bold'), anchor='w').pack(side='left')
        help_label = tk.Label(header, text='Quy trình / cách dùng →', bg=BG, fg=ACCENT, font=('Segoe UI', 9), cursor='hand2')
        help_label.pack(side='right')
        help_label.bind('<Button-1>', lambda e: self.tabs.select(self.guide))
        strip = tk.Frame(host, bg=BG)
        strip.grid(row=1, column=0, sticky='ew', pady=(0, 8))
        for index, (key, name, description) in enumerate(PHASES):
            strip.columnconfigure(index, weight=1, uniform='phases')
            frame = tk.Frame(strip, bg=CARD, padx=6, pady=5 if self.short_screen else 8, highlightthickness=1, highlightbackground='#25334b')
            frame.grid(row=0, column=index, sticky='nsew', padx=(0 if index == 0 else 4, 0))
            title = tk.Label(frame, text=f'{index+1:02}  {name}', bg=CARD, fg=MUTED, font=('Segoe UI', 9, 'bold'))
            title.pack(fill='x')
            state = tk.Label(frame, text='Chưa chạy', bg=CARD, fg=MUTED, font=('Segoe UI', 9), pady=2 if self.short_screen else 5)
            state.pack(fill='x')
            for widget in (frame, title, state):
                widget.bind('<Button-1>', lambda event, d=description: self.monitor_detail.set(d))
            self.phase_widgets[key] = (frame, title, state)
        metrics = tk.Frame(host, bg=BG)
        metrics.grid(row=2, column=0, sticky='ew', pady=(0, 8))
        for i in range(4):
            metrics.columnconfigure(i, weight=1, uniform='metrics')
        for i, (title, var, detail) in enumerate([
            ('CẢNH ĐÃ CÓ CLIP', self.monitor_count, 'Đã tải thành công về dự án'),
            ('ẢNH THAM CHIẾU', self.monitor_assets, 'Nhân vật + bối cảnh đã sẵn sàng'),
            ('THỜI GIAN PHIÊN NÀY', self.monitor_elapsed, 'Thời gian thực, không phải ETA'),
        ]):
            card = tk.Frame(metrics, bg=CARD, padx=12, pady=6 if self.short_screen else 8)
            card.grid(row=0, column=i, sticky='nsew', padx=(0 if i == 0 else 6, 0))
            tk.Label(card, text=title, bg=CARD, fg=MUTED, font=('Segoe UI', 8, 'bold'), anchor='w').pack(fill='x')
            tk.Label(card, textvariable=var, bg=CARD, fg=ACCENT, font=('Segoe UI', 17 if self.short_screen else 19, 'bold'), anchor='w').pack(fill='x')
            tk.Label(card, text=detail, bg=CARD, fg=MUTED, font=('Segoe UI', 8), anchor='w').pack(fill='x')
        preview_card = tk.Frame(metrics, bg=FIELD, height=64 if self.short_screen else 78)
        preview_card.grid(row=0, column=3, sticky='nsew', padx=(6, 0))
        preview_card.grid_propagate(False)
        preview_card.rowconfigure(0, weight=1)
        preview_card.columnconfigure(0, weight=1)
        self.monitor_thumb = tk.Label(preview_card, bg=FIELD, fg=MUTED, text='Cảnh gần nhất\nChưa có clip', font=('Segoe UI', 9))
        self.monitor_thumb.grid(row=0, column=0, sticky='nsew')
        self.scene_bar = ttk.Progressbar(host, mode='determinate', maximum=100, style='Film.Horizontal.TProgressbar')
        self.scene_bar.grid(row=3, column=0, sticky='ew', pady=(0, 5))
        info = tk.Frame(host, bg=BG)
        info.grid(row=4, column=0, sticky='ew', pady=(0, 6))
        tk.Label(info, textvariable=self.monitor_detail, bg=BG, fg=INK, anchor='w', font=('Segoe UI', 9 if self.short_screen else 10), wraplength=0 if self.short_screen else 900, justify='left').pack(fill='x')
        tk.Label(info, textvariable=self.monitor_cloud, bg=BG, fg=MUTED, anchor='w', font=('Segoe UI', 9), wraplength=0 if self.short_screen else 900, justify='left').pack(fill='x')
        body = tk.PanedWindow(host, orient='horizontal', bg=BG, bd=0, sashwidth=8)
        body.grid(row=5, column=0, sticky='nsew')
        left = tk.Frame(body, bg=CARD, padx=10, pady=8)
        right = tk.Frame(body, bg=CARD, padx=10, pady=8)
        body.add(left, width=370, minsize=280)
        body.add(right, minsize=360)
        tk.Label(left, text='CÁC CẢNH · Bấm đúp để xem chi tiết', bg=CARD, fg=ACCENT, font=('Segoe UI', 9, 'bold'), anchor='w').pack(fill='x', pady=(0, 6))
        self.progress_tree = ttk.Treeview(left, columns=('state', 'task'), show='tree headings', height=3)
        self.progress_tree.heading('#0', text='Cảnh')
        self.progress_tree.heading('state', text='Trạng thái')
        self.progress_tree.heading('task', text='Task ID')
        self.progress_tree.column('#0', width=110)
        self.progress_tree.column('state', width=105)
        self.progress_tree.column('task', width=100)
        self.progress_tree.pack(fill='both', expand=True)
        self.progress_tree.bind('<Double-1>', self.open_progress_scene)
        self.progress_tree.tag_configure('done', foreground=ACCENT)
        self.progress_tree.tag_configure('error', foreground='#ff97b0')
        journal_head = tk.Frame(right, bg=CARD)
        journal_head.pack(fill='x', pady=(0, 6))
        tk.Label(journal_head, text='NHẬT KÝ THỰC HIỆN', bg=CARD, fg=ACCENT, font=('Segoe UI', 9, 'bold')).pack(side='left')
        self.button(journal_head, 'Lưu nhật ký', self.save_journal).pack(side='right')
        self.journal = tk.Text(right, bg=FIELD, fg=MUTED, insertbackground=INK, relief='flat', font=('Consolas', 9), wrap='word', height=4, padx=9, pady=7, state='disabled')
        scroll = ttk.Scrollbar(right, orient='vertical', command=self.journal.yview)
        self.journal.configure(yscrollcommand=scroll.set)
        scroll.pack(side='right', fill='y')
        self.journal.pack(fill='both', expand=True)
        actions = tk.Frame(host, bg=BG)
        actions.grid(row=6, column=0, sticky='ew', pady=(6, 4))
        tk.Label(actions, textvariable=self.monitor_render, bg=BG, fg=MUTED, font=('Segoe UI', 9)).pack(side='left')
        self.button(actions, 'Về chỉnh cảnh', lambda: self.tabs.select(self.work)).pack(side='right')
        self.button(actions, 'Xem phim', self.watch_movie).pack(side='right', padx=6)
        self.button(actions, 'Lưu như…', self.save_as).pack(side='right')
        self.button(actions, 'Copy task ID', self.copy_task).pack(side='right', padx=6)
        self.append_journal('Sẵn sàng. Chưa gửi API tạo ảnh hoặc video. Chọn Kết nối nếu đây là lần đầu sử dụng.')
        self.after(1000, self.tick_progress)

    def build_guide(self):
        canvas = tk.Canvas(self.guide, bg=BG, highlightthickness=0)
        scroll = ttk.Scrollbar(self.guide, orient='vertical', command=canvas.yview)
        canvas.configure(yscrollcommand=scroll.set)
        scroll.pack(side='right', fill='y'); canvas.pack(side='left', fill='both', expand=True)
        content = tk.Frame(canvas, bg=BG, padx=12, pady=12)
        window = canvas.create_window((0, 0), window=content, anchor='nw')
        content.bind('<Configure>', lambda e: canvas.configure(scrollregion=canvas.bbox('all')))
        canvas.bind('<Configure>', lambda e: canvas.itemconfigure(window, width=e.width))
        tk.Label(content, text='BẮT ĐẦU TỪ ĐÂU? · Quy trình làm một phim', bg=BG, fg=INK, font=('Segoe UI', 17, 'bold'), anchor='w').pack(fill='x', pady=(0, 5))
        tk.Label(content, text='Bạn quyết định câu chuyện. App điều phối từng bước và lưu lại kết quả để tiếp tục khi mở lại.', bg=BG, fg=MUTED, anchor='w', wraplength=900, justify='left').pack(fill='x', pady=(0, 12))
        steps = [
            ('01', 'Kết nối một lần', 'Nhập API RunningHub và API viết kịch bản/tạo ảnh trong Kết nối. Có thể dùng ảnh sẵn có. Kiểm tra kết nối chỉ xác nhận truy cập; tạo thử một cảnh để xác nhận model chạy được.', 'Mở Kết nối', self.connections),
            ('02', 'Nhập ý tưởng hoặc dán kịch bản', 'Chọn Anh/Việt, phong cách, tỷ lệ và số phút. Lập kịch bản để xem trước; Tạo toàn bộ phim sẽ chạy liên tiếp các bước đã cấu hình. Nên thử khoảng 0,17 phút (10 giây) trước.', 'Nhập ý tưởng', self.work),
            ('03', 'Chốt nhân vật và bối cảnh', 'App tạo các ảnh còn thiếu hoặc dùng ảnh bạn chọn. Những ảnh này được lưu trong dự án và gắn lại vào các cảnh tương ứng. Có thể thêm giọng tham chiếu; không bảo đảm đúng mặt/giọng tuyệt đối.', 'Xem tham chiếu', self.cast),
            ('04', 'Theo dõi từng cảnh H3', 'Tiến trình cho biết bước hiện tại, task ID, chờ GPU/đang sinh video, thời gian phiên và số clip đã tải về. Khi API không trả phần trăm, app ghi rõ đang chờ. Bấm đúp một cảnh để xem hoặc chỉnh.', 'Mở tiến trình', self.monitor),
            ('05', 'Dựng phim, tiếng và phụ đề', 'App cân tiếng nói, ghép cảnh theo kịch bản. Chọn nhạc nền để hạ nhạc dưới giọng. Có API âm thanh thì nhận dạng lời nói thực thành phụ đề; cần xem lại chữ và khẩu hình.', 'Chỉnh / xuất', self.work),
            ('06', 'Xem và lưu bản hoàn chỉnh', 'Sau khi xuất, bấm Xem phim hoặc Lưu như để chép MP4 đến nơi bạn muốn. Các clip gốc và task ID vẫn ở thư mục dự án. Dừng chờ không tự hủy tác vụ cloud; vào RunningHub để hủy nếu cần.', 'Xem tiến trình', self.monitor),
        ]
        for number, title, detail, action, target in steps:
            card = tk.Frame(content, bg=CARD, padx=14, pady=12)
            card.pack(fill='x', pady=(0, 8))
            tk.Label(card, text=number, bg=CARD, fg=ACCENT, font=('Segoe UI', 22, 'bold')).pack(side='left', padx=(0, 15))
            self.button(card, action, lambda page=target: self.tabs.select(page)).pack(side='right', padx=(12, 0))
            block = tk.Frame(card, bg=CARD); block.pack(side='left', fill='both', expand=True)
            tk.Label(block, text=title, bg=CARD, fg=INK, font=('Segoe UI', 11, 'bold'), anchor='w').pack(fill='x')
            tk.Label(block, text=detail, bg=CARD, fg=MUTED, font=('Segoe UI', 10), wraplength=600, anchor='w', justify='left').pack(fill='x', pady=(5, 0))

    def set_phase(self, payload):
        key = payload.get('id')
        if key not in self.phase_widgets:
            return
        state = payload.get('state', 'pending')
        old = self.phase_states.get(key)
        self.phase_states[key] = state
        frame, title, label = self.phase_widgets[key]
        bg = {'running': '#243d51', 'done': '#163b37', 'error': '#4d293b', 'paused': '#3b3344'}.get(state, CARD)
        fg = ACCENT if state in ('running', 'done') else ('#ff97b0' if state == 'error' else MUTED)
        frame.configure(bg=bg, highlightbackground=fg if state != 'pending' else '#25334b')
        title.configure(bg=bg, fg=fg)
        label.configure(bg=bg, fg=fg, text=STATES.get(state, state))
        phase_name = next(name for phase_id, name, _ in PHASES if phase_id == key)
        if state == 'running':
            self.monitor_title.set('ĐANG THỰC HIỆN · ' + phase_name.upper())
        if payload.get('detail'):
            self.monitor_detail.set(payload['detail'])
        if old != state or payload.get('detail'):
            self.append_journal(f'{phase_name}: {STATES.get(state, state)}. {payload.get("detail", "")}')
        if key == 'export' and state == 'done':
            self.monitor_title.set('HOÀN TẤT · MP4 đã sẵn sàng để xem và lưu')

    def append_journal(self, text):
        text = str(text)
        for value in getattr(self, 'secrets', {}).values():
            if isinstance(value, str) and len(value) >= 6:
                text = text.replace(value, '[ẩn API key]')
        line = time.strftime('%H:%M:%S') + '  ' + text
        self.log_lines.append(line)
        if len(self.log_lines) > 2000:
            self.log_lines = self.log_lines[-1800:]
        self.journal.configure(state='normal')
        self.journal.insert('end', line + '\n')
        if int(self.journal.index('end-1c').split('.')[0]) > 2000:
            self.journal.delete('1.0', '201.0')
        self.journal.see('end')
        self.journal.configure(state='disabled')

    def save_journal(self):
        path = filedialog.asksaveasfilename(initialfile='H3Studio-nhat-ky.txt', defaultextension='.txt', filetypes=[('Nhật ký', '*.txt')])
        if path:
            from pathlib import Path
            Path(path).write_text('\n'.join(self.log_lines) + '\n', encoding='utf-8-sig')
            self.status.set('Đã lưu nhật ký. API key được che khỏi nội dung.')

    def copy_task(self):
        if self.monitor_task:
            self.clipboard_clear(); self.clipboard_append(self.monitor_task)
            self.status.set('Đã copy task ID đang theo dõi.')

    def open_progress_scene(self, event=None):
        selection = self.progress_tree.selection()
        if selection and self.project and self.tree.exists(selection[0]):
            self.tabs.select(self.work)
            self.tree.selection_set(selection[0])
            self.select_scene()

    def update_progress(self):
        if not hasattr(self, 'progress_tree'):
            return
        selection = self.progress_tree.selection()
        self.progress_tree.delete(*self.progress_tree.get_children())
        project = self.project
        if not project:
            self.monitor_count.set('0 / —'); self.monitor_assets.set('0 / —'); self.scene_bar['value'] = 0
            return
        completed = 0
        for scene in project.data['scenes']:
            key = str(scene['id']); job = project.data['jobs'].get(key, {})
            ready = bool(job.get('file') and project.file(job['file']).exists())
            completed += int(ready)
            raw = 'DOWNLOADED' if ready else ('FAILED' if job.get('status') == 'failed' else self.cloud_states.get(key, job.get('state', 'PENDING' if job.get('task_id') else 'NOT_STARTED')))
            state = CLOUD.get(raw, 'Chưa tạo' if raw == 'NOT_STARTED' else raw)
            tag = 'done' if ready else ('error' if raw in ('FAILED', 'ERROR') else '')
            task = str(job.get('task_id', ''))
            self.progress_tree.insert('', 'end', iid=key, text=f'{scene["id"]:02} · {scene["title"][:25]}', values=(state, task[:14] + ('…' if len(task) > 14 else '')), tags=(tag,))
        if selection and self.progress_tree.exists(selection[0]):
            self.progress_tree.selection_set(selection[0])
        total = len(project.data['scenes'])
        self.monitor_count.set(f'{completed} / {total}')
        self.scene_bar['value'] = 100 * completed / total if total else 0
        expected = ['character:' + ch['name'] for ch in project.data['characters']] + ['location:' + item['name'] for item in project.data.get('locations', [])]
        assets = sum(bool(project.data['assets'].get(key) and project.file(project.data['assets'][key]).exists()) for key in expected)
        self.monitor_assets.set(f'{assets} / {len(expected)}')
        self.monitor_project.set(project.data['title'])

    def handle_cloud(self, payload):
        state = payload.get('state', 'WAITING')
        task = str(payload.get('task_id', ''))
        self.monitor_task = task
        detail = 'Cloud sinh xong; đang lấy clip về máy.' if state == 'SUCCESS' else 'API chưa cung cấp % hoặc ETA.'
        self.monitor_cloud.set(f'{payload.get("provider", "Cloud")} · {CLOUD.get(state, state)} · task {task} · {detail}')
        marker = (task, state)
        if marker != self.last_cloud_log:
            self.append_journal(f'Cloud: {CLOUD.get(state, state)} · task {task}')
            self.last_cloud_log = marker
        if self.monitor_scene is not None:
            self.cloud_states[str(self.monitor_scene)] = state
        self.update_progress()

    def reset_progress_view(self):
        self.cloud_states.clear()
        self.monitor_started = None
        self.monitor_last_elapsed = 0
        self.monitor_scene = None
        self.monitor_task = ''
        self.monitor_thumb.configure(image='', text='Cảnh gần nhất\nChưa có clip')
        for key, *_ in PHASES:
            self.set_phase({'id': key, 'state': 'pending'})
        self.monitor_title.set('CHƯA BẮT ĐẦU · Nhập ý tưởng hoặc mở dự án')
        self.monitor_detail.set('Xem Quy trình / cách dùng nếu đây là lần đầu sử dụng.')
        self.monitor_cloud.set('Chưa gửi tác vụ cloud.')
        self.update_progress()

    def restore_progress_view(self):
        self.reset_progress_view()
        if not self.project:
            return
        self.set_phase({'id': 'script', 'state': 'done', 'detail': 'Đã mở kịch bản lưu trong dự án.'})
        jobs = self.project.data['jobs']
        completed = sum(bool(job.get('file') and self.project.file(job['file']).exists()) for job in jobs.values())
        if completed:
            self.set_phase({'id': 'video', 'state': 'done' if completed == len(self.project.data['scenes']) else 'partial', 'detail': f'{completed} cảnh đã có clip.'})
        if self.project.data.get('subtitles'):
            self.set_phase({'id': 'subtitles', 'state': 'done', 'detail': 'Dự án có phụ đề đã lưu.'})
        if self.project.data.get('output'):
            self.set_phase({'id': 'export', 'state': 'done', 'detail': 'Dự án có MP4 đã xuất. Có thể xem hoặc lưu bản sao.'})
        else:
            self.monitor_title.set('ĐÃ MỞ DỰ ÁN · Có thể tiếp tục các bước còn lại')
        self.append_journal('Đã mở dự án: ' + self.project.data['title'])

    def tick_progress(self):
        elapsed = self.monitor_last_elapsed
        if self.busy and self.monitor_started is not None:
            elapsed = int(time.monotonic() - self.monitor_started)
            self.monitor_last_elapsed = elapsed
        self.monitor_elapsed.set(f'{elapsed//3600:02}:{elapsed//60%60:02}:{elapsed%60:02}')
        self.after(1000, self.tick_progress)
