"""Two-field Vietnamese desktop UI for an existing local ComfyUI installation."""
import json
import os
from pathlib import Path
import queue
import shutil
import sys
import threading
import tkinter as tk
from tkinter import filedialog, messagebox
import traceback
import webbrowser

import customtkinter as ctk
import engine


def settings_path():
    return Path(os.environ.get('LOCALAPPDATA', Path.home())) / 'WanLocalStudio/settings.json'


def load_settings():
    try: return json.loads(settings_path().read_text(encoding='utf-8'))
    except (OSError, ValueError): return {}


class App(ctk.CTk):
    def __init__(self):
        ctk.set_appearance_mode('dark')
        super().__init__()
        self.title('Wan Local Studio · Tạo video trên máy của bạn')
        self.geometry('960x760'); self.minsize(850,700)
        self.configure(fg_color='#0b1220')
        if os.name == 'nt': self.iconbitmap(str(engine.ROOT / 'icon.ico'))
        saved = load_settings()
        self.events = queue.Queue(); self.cancel = threading.Event(); self.busy = False
        self.project = None; self.result = None; self.music = None
        self.topic = tk.StringVar(value=saved.get('topic', engine.TOPICS[0]))
        self.minutes = tk.StringVar(value=saved.get('minutes', '0.1'))
        self.url = tk.StringVar(value=saved.get('url', 'http://127.0.0.1:8188'))
        self.parent = Path(saved.get('folder', str(Path.home() / 'Videos/WanLocalStudio')))
        panel = ctk.CTkScrollableFrame(self, fg_color='transparent')
        panel.pack(fill='both', expand=True, padx=28, pady=22)
        ctk.CTkLabel(panel,text='WAN LOCAL STUDIO',font=('Segoe UI',29,'bold'),text_color='#5de0c1').pack(anchor='w')
        ctk.CTkLabel(panel,text='Chọn chủ đề → nhập số phút → tự tạo các cảnh và ghép video',font=('Segoe UI',15)).pack(anchor='w',pady=(2,20))
        form = ctk.CTkFrame(panel,fg_color='#152235',corner_radius=14)
        form.pack(fill='x',pady=8)
        ctk.CTkLabel(form,text='CHỦ ĐỀ',font=('Segoe UI',12,'bold')).pack(anchor='w',padx=20,pady=(18,6))
        ctk.CTkComboBox(form,values=list(engine.TOPICS),variable=self.topic,state='readonly',height=42,font=('Segoe UI',16)).pack(fill='x',padx=20)
        ctk.CTkLabel(form,text='THỜI LƯỢNG (PHÚT)',font=('Segoe UI',12,'bold')).pack(anchor='w',padx=20,pady=(18,6))
        ctk.CTkEntry(form,textvariable=self.minutes,height=42,font=('Segoe UI',16)).pack(fill='x',padx=20)
        self.count = tk.StringVar()
        ctk.CTkLabel(form,textvariable=self.count,wraplength=790,justify='left',text_color='#a9c3d6').pack(anchor='w',padx=20,pady=(8,18))
        self.create_button = ctk.CTkButton(panel,text='TẠO VIDEO TỰ ĐỘNG',command=self.create,height=52,
                                         font=('Segoe UI',17,'bold'),fg_color='#29aa90',hover_color='#218b76')
        self.create_button.pack(fill='x',pady=(14,6))
        row = ctk.CTkFrame(panel,fg_color='transparent');row.pack(fill='x',pady=6)
        self.resume_button = ctk.CTkButton(row,text='Mở dự án / tiếp tục',command=self.resume,width=225)
        self.resume_button.pack(side='left',padx=(0,10))
        self.pause_button = ctk.CTkButton(row,text='Tạm dừng',command=self.cancel.set,fg_color='#753b50',state='disabled')
        self.pause_button.pack(side='right')
        self.status = tk.StringVar(value='Mở ComfyUI trước. Lần đầu nên thử 0,1 phút (6 giây). Model và dữ liệu chạy trên máy bạn.')
        ctk.CTkLabel(panel,textvariable=self.status,wraplength=830,justify='left',anchor='w',font=('Segoe UI',14)).pack(fill='x',pady=(14,6))
        self.progress = ctk.CTkProgressBar(panel,mode='determinate',progress_color='#5de0c1');self.progress.pack(fill='x',pady=8);self.progress.set(0)
        self.log = ctk.CTkTextbox(panel,height=125,font=('Consolas',12));self.log.pack(fill='x',pady=8)
        results = ctk.CTkFrame(panel,fg_color='transparent');results.pack(fill='x',pady=6)
        self.play_button = ctk.CTkButton(results,text='Mở video',command=self.play,state='disabled');self.play_button.pack(side='left',padx=(0,8))
        self.copy_button = ctk.CTkButton(results,text='Lưu bản sao',command=self.copy,state='disabled');self.copy_button.pack(side='left',padx=(0,8))
        ctk.CTkButton(results,text='Mở thư mục',command=self.folder).pack(side='left')
        ctk.CTkButton(panel,text='Cài đặt / kiểm tra ComfyUI',command=self.toggle_settings,fg_color='#25364c').pack(fill='x',pady=(16,4))
        self.options = ctk.CTkFrame(panel)
        ctk.CTkLabel(self.options,text='Địa chỉ ComfyUI trên máy').pack(anchor='w',padx=12,pady=(10,4))
        ctk.CTkEntry(self.options,textvariable=self.url).pack(fill='x',padx=12,pady=4)
        line = ctk.CTkFrame(self.options,fg_color='transparent');line.pack(fill='x',padx=12,pady=10)
        self.check_button = ctk.CTkButton(line,text='Kiểm tra Wan',command=self.check);self.check_button.pack(side='left',padx=(0,8))
        ctk.CTkButton(line,text='Hướng dẫn model',command=lambda:webbrowser.open(engine.GUIDE)).pack(side='left',padx=(0,8))
        self.music_button=ctk.CTkButton(line,text='Chọn nhạc nền',command=self.choose_music);self.music_button.pack(side='left')
        line2 = ctk.CTkFrame(self.options,fg_color='transparent');line2.pack(fill='x',padx=12,pady=8)
        self.folder_button=ctk.CTkButton(line2,text='Nơi lưu video',command=self.choose_folder);self.folder_button.pack(side='left',padx=(0,8))
        self.reset_button=ctk.CTkButton(line2,text='Tạo lại cảnh lỗi',command=self.reset);self.reset_button.pack(side='left')
        ctk.CTkLabel(self.options,text='RTX 3060 12GB / RAM 32GB · Wan 2.2 TI2V 5B · 832×480 · 24 fps\nEncoder chạy CPU, giải mã VAE theo ô. Nếu thiếu VRAM, mở ComfyUI với --lowvram.\nTool tự lưu tham chiếu, nhưng Wan vẫn có thể đổi chi tiết người/vật. Không có tiếng động tự sinh; có thể ghép nhạc của bạn.',
                     wraplength=790,justify='left',text_color='#a9c3d6').pack(anchor='w',padx=12,pady=(4,14))
        self.controls=[self.create_button,self.resume_button,self.check_button,self.music_button,self.folder_button,self.reset_button]
        self.minutes.trace_add('write',self.update_count);self.update_count()
        self.after(150,self.poll);self.protocol('WM_DELETE_WINDOW',self.close)

    def update_count(self,*_):
        try:
            data=engine.plan(self.topic.get(),self.minutes.get().replace(',','.'))
            self.count.set(f'{len(data["scenes"])} cảnh nối tiếp · {data["frames"]/24:g} giây. Tự tạo và lưu ảnh tham chiếu. Render có thể kéo dài nhiều giờ; chưa đo tốc độ trên máy bạn.')
        except (ValueError,TypeError): self.count.set('Nhập số từ 0,1 đến 15. Ví dụ 0,1 = 6 giây; 1 = 60 giây.')

    def save_settings(self):
        path=settings_path();path.parent.mkdir(parents=True,exist_ok=True)
        engine.atomic_json(path,{'url':self.url.get(),'folder':str(self.parent),'topic':self.topic.get(),'minutes':self.minutes.get()})

    def toggle_settings(self):
        if self.options.winfo_manager(): self.options.pack_forget()
        else: self.options.pack(fill='x',pady=8)

    def choose_folder(self):
        value=filedialog.askdirectory(title='Nơi lưu dự án và video')
        if value:self.parent=Path(value);self.save_settings();self.status.set('Nơi lưu: '+value)

    def choose_music(self):
        value=filedialog.askopenfilename(title='Nhạc của bạn (để trống nếu không dùng)',filetypes=[('Âm thanh','*.mp3 *.wav *.m4a *.ogg *.flac'),('Tất cả','*.*')])
        self.music=Path(value) if value else None
        self.status.set('Nhạc cho video mới: '+str(self.music or 'không dùng'))

    def start(self,fn):
        if self.busy:return
        self.busy=True;self.cancel.clear();self.progress.configure(mode='indeterminate');self.progress.start();self.result=None
        for widget in self.controls:widget.configure(state='disabled')
        self.play_button.configure(state='disabled');self.copy_button.configure(state='disabled');self.pause_button.configure(state='normal')
        def work():
            try:self.events.put(('done',fn()))
            except engine.Cancelled as e:self.events.put(('paused',str(e)))
            except Exception as e:
                if self.project:
                    (self.project/'tool-error.log').write_text(traceback.format_exc(),encoding='utf-8')
                self.events.put(('error',str(e)))
        threading.Thread(target=work,daemon=True).start()

    def notify(self,text):self.events.put(('status',text))

    def create(self):
        if self.busy:return
        try:
            engine.plan(self.topic.get(),self.minutes.get().replace(',','.'))
            client=engine.Comfy(self.url.get());self.save_settings()
            topic=self.topic.get();minutes=self.minutes.get().replace(',','.');music=self.music;parent=self.parent
        except Exception as e:messagebox.showerror('Chưa bắt đầu được',str(e));return
        self.status.set('Đang kiểm tra ComfyUI và model Wan…')
        def work():
            client.preflight();parent.mkdir(parents=True,exist_ok=True)
            self.project=engine.new_project(parent,topic,minutes)
            if music:shutil.copy2(music,self.project/'nhac-nen.audio')
            self.notify('Đã lưu dự án: '+str(self.project))
            return engine.generate(self.project,client,self.cancel,self.notify)
        self.start(work)

    def resume(self):
        if self.busy:return
        folder=filedialog.askdirectory(title='Mở thư mục dự án có project.json')
        if not folder:return
        if not (Path(folder)/'project.json').is_file():messagebox.showerror('Chưa đúng dự án','Chọn thư mục Wan Local Studio có project.json.');return
        try:client=engine.Comfy(self.url.get())
        except ValueError as e:messagebox.showerror('Địa chỉ ComfyUI',str(e));return
        self.project=Path(folder);self.save_settings()
        self.start(lambda:engine.generate(self.project,client,self.cancel,self.notify))

    def reset(self):
        if not self.project:return
        if messagebox.askyesno('Gửi lại cảnh chưa xong','Chỉ dùng khi bạn đã kiểm tra hàng đợi ComfyUI và tác vụ cũ đã mất hoặc lỗi. Gửi lại có thể tạo cảnh trùng nếu tác vụ cũ vẫn chạy. Bạn muốn gửi lại cảnh này?'):
            engine.reset_failed_scene(self.project)
            client=engine.Comfy(self.url.get());self.start(lambda:engine.generate(self.project,client,self.cancel,self.notify))

    def check(self):
        try:client=engine.Comfy(self.url.get());self.save_settings()
        except ValueError as e:messagebox.showerror('Địa chỉ ComfyUI',str(e));return
        self.start(lambda:('Đã nhận đủ bộ Wan 2.2 TI2V 5B. Model: '+str(client.preflight())))

    def poll(self):
        try:
            while True:
                kind,value=self.events.get_nowait()
                self.status.set(str(value))
                if kind=='status':
                    # Keep durable milestones; rapidly repeated wait notices stay in status only.
                    if 'đã chờ' not in value:self.log.insert('end',value+'\n');self.log.see('end')
                    continue
                self.busy=False;self.progress.stop();self.progress.configure(mode='determinate');self.progress.set(0)
                for widget in self.controls:widget.configure(state='normal')
                self.pause_button.configure(state='disabled')
                if kind=='done' and isinstance(value,Path):
                    self.result=value;self.status.set('Video đã xuất: '+str(value))
                    self.play_button.configure(state='normal');self.copy_button.configure(state='normal');self.progress.set(1)
                self.log.insert('end',self.status.get()+'\n');self.log.see('end')
        except queue.Empty:pass
        self.after(150,self.poll)

    def play(self):
        if self.result:
            if os.name=='nt':os.startfile(str(self.result))
            else:webbrowser.open(self.result.as_uri())

    def copy(self):
        if not self.result:return
        value=filedialog.asksaveasfilename(defaultextension='.mp4',initialfile='video-wan.mp4',filetypes=[('Video MP4','*.mp4')])
        if value and Path(value).resolve()!=self.result.resolve():shutil.copy2(self.result,value)

    def folder(self):
        path=self.project or self.parent;path.mkdir(parents=True,exist_ok=True)
        if os.name=='nt':os.startfile(str(path))
        else:webbrowser.open(path.as_uri())

    def close(self):
        if self.busy:self.cancel.set();self.status.set('Đang tạm dừng. Chờ lưu tiến độ rồi đóng cửa sổ.');return
        self.save_settings();self.destroy()


def smoke_test():
    import tempfile
    with tempfile.TemporaryDirectory() as td:
        with_settings=Path(td)/'settings.json'
        global settings_path
        settings_path=lambda:with_settings
        app=App();app.update();app.minutes.set('1');app.update()
        assert '12 cảnh' in app.count.get()
        app.save_settings();assert load_settings()['minutes']=='1'
        if os.environ.get('WAN_UI_PREVIEW'):
            from PIL import ImageGrab
            ImageGrab.grab(bbox=(app.winfo_rootx(),app.winfo_rooty(),app.winfo_rootx()+app.winfo_width(),app.winfo_rooty()+app.winfo_height())).save(os.environ['WAN_UI_PREVIEW'])
        app.toggle_settings();app.update()
        assert app.options.winfo_manager()
        app.destroy()


if __name__=='__main__':
    if '--smoke-test' in sys.argv:
        try:smoke_test()
        except Exception:
            Path(os.environ.get('WAN_SMOKE_REPORT','wan-smoke-error.txt')).write_text(traceback.format_exc(),encoding='utf-8')
            raise
    else:App().mainloop()
