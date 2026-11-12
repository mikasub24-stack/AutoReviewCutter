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
import bootstrap


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
        self.geometry('740x530'); self.minsize(700,500)
        self.configure(fg_color='#0b1220')
        if os.name == 'nt': self.iconbitmap(str(engine.ROOT / 'icon.ico'))
        saved = load_settings()
        self.events = queue.Queue(); self.cancel = threading.Event(); self.busy = False
        self.project = None; self.result = None; self.music = None
        self.topic = tk.StringVar(value=saved.get('topic', engine.TOPICS[0]))
        self.minutes = tk.StringVar(value=saved.get('minutes', '0.1'))
        self.url = tk.StringVar(value=saved.get('url', 'http://127.0.0.1:8188'))
        self.parent = Path(saved.get('folder', str(Path.home() / 'Videos/WanLocalStudio')))
        self.asset_root = Path(saved.get('asset_root', str(bootstrap.default_root())))
        panel = ctk.CTkScrollableFrame(self, fg_color='transparent')
        panel.pack(fill='both', expand=True, padx=14, pady=12)
        ctk.CTkLabel(panel,text='WAN LOCAL STUDIO',font=('Segoe UI',22,'bold'),text_color='#5de0c1').pack(anchor='w')
        ctk.CTkLabel(panel,text='Tự tải bộ Wan • Giữ nhân vật • Tự dựng & xuất MP4',font=('Segoe UI',12)).pack(anchor='w',pady=(0,10))
        form = ctk.CTkFrame(panel,fg_color='#152235',corner_radius=10);form.pack(fill='x',pady=4)
        form.grid_columnconfigure(0,weight=1)
        ctk.CTkLabel(form,text='Chủ đề',font=('Segoe UI',12)).grid(row=0,column=0,sticky='w',padx=12,pady=(8,0))
        ctk.CTkLabel(form,text='Số phút',font=('Segoe UI',12)).grid(row=0,column=1,sticky='w',padx=12,pady=(8,0))
        ctk.CTkComboBox(form,values=list(engine.TOPICS),variable=self.topic,state='readonly',height=30,font=('Segoe UI',13)).grid(row=1,column=0,sticky='ew',padx=12,pady=(2,8))
        ctk.CTkEntry(form,textvariable=self.minutes,height=30,width=100,font=('Segoe UI',13)).grid(row=1,column=1,padx=(0,12),pady=(2,8))
        self.count = tk.StringVar()
        ctk.CTkLabel(form,textvariable=self.count,wraplength=640,justify='left',text_color='#a9c3d6',font=('Segoe UI',11)).grid(row=2,column=0,columnspan=2,sticky='w',padx=12,pady=(0,8))
        self.character = tk.StringVar(value='Nhân vật: nữ châu Á 24 tuổi • áo gym hai dây crop top, legging • tự lưu ảnh gốc')
        ctk.CTkLabel(panel,textvariable=self.character,wraplength=670,justify='left',font=('Segoe UI',11),text_color='#a9c3d6').pack(anchor='w',pady=(4,6))
        row=ctk.CTkFrame(panel,fg_color='transparent');row.pack(fill='x',pady=5)
        self.create_button=ctk.CTkButton(row,text='Tạo video',command=self.create,height=34,width=170,font=('Segoe UI',14,'bold'),fg_color='#29aa90',hover_color='#218b76');self.create_button.pack(side='left',padx=(0,8))
        self.install_button=ctk.CTkButton(row,text='Cài & tải bộ Wan',command=self.prepare,height=34,width=155);self.install_button.pack(side='left',padx=(0,8))
        self.pause_button=ctk.CTkButton(row,text='Tạm dừng',command=self.cancel.set,height=34,width=105,fg_color='#753b50',state='disabled');self.pause_button.pack(side='right')
        self.status=tk.StringVar(value='Lần đầu tool tự tải gần 20 GB dữ liệu. Cần khoảng 40 GB ổ trống; có thể đổi ổ trong Cài đặt. Thử 0,1 phút trước.')
        ctk.CTkLabel(panel,textvariable=self.status,wraplength=670,justify='left',anchor='w',font=('Segoe UI',12)).pack(fill='x',pady=(8,4))
        self.progress=ctk.CTkProgressBar(panel,mode='determinate',progress_color='#5de0c1',height=6);self.progress.pack(fill='x',pady=6);self.progress.set(0)
        results=ctk.CTkFrame(panel,fg_color='transparent');results.pack(fill='x',pady=6)
        self.play_button=ctk.CTkButton(results,text='Xem video',command=self.play,state='disabled',width=110,height=28);self.play_button.pack(side='left',padx=(0,6))
        self.copy_button=ctk.CTkButton(results,text='Lưu như…',command=self.copy,state='disabled',width=110,height=28);self.copy_button.pack(side='left',padx=(0,6))
        ctk.CTkButton(results,text='Thư mục',command=self.folder,width=100,height=28).pack(side='left',padx=(0,6))
        self.resume_button=ctk.CTkButton(results,text='Tiếp tục dự án',command=self.resume,width=135,height=28);self.resume_button.pack(side='right')
        links=ctk.CTkFrame(panel,fg_color='transparent');links.pack(fill='x',pady=(8,4))
        ctk.CTkButton(links,text='Cài đặt',command=self.toggle_settings,width=100,height=26,fg_color='#25364c').pack(side='left',padx=(0,8))
        ctk.CTkButton(links,text='Nhật ký',command=self.toggle_log,width=100,height=26,fg_color='#25364c').pack(side='left')
        self.log=ctk.CTkTextbox(panel,height=100,font=('Consolas',11))
        self.options=ctk.CTkFrame(panel)
        ctk.CTkLabel(self.options,text='ComfyUI có sẵn (không bắt buộc; tool tự cài nếu chưa có)',font=('Segoe UI',11)).pack(anchor='w',padx=10,pady=(8,0))
        ctk.CTkEntry(self.options,textvariable=self.url,height=26).pack(fill='x',padx=10,pady=4)
        line=ctk.CTkFrame(self.options,fg_color='transparent');line.pack(fill='x',padx=10,pady=6)
        self.check_button=ctk.CTkButton(line,text='Kiểm tra',command=self.check,width=100,height=26);self.check_button.pack(side='left',padx=(0,6))
        self.music_button=ctk.CTkButton(line,text='Nhạc nền',command=self.choose_music,width=100,height=26);self.music_button.pack(side='left',padx=(0,6))
        self.folder_button=ctk.CTkButton(line,text='Nơi lưu video',command=self.choose_folder,width=110,height=26);self.folder_button.pack(side='left',padx=(0,6))
        self.asset_button=ctk.CTkButton(line,text='Ổ lưu model',command=self.choose_assets,width=110,height=26);self.asset_button.pack(side='left')
        line2=ctk.CTkFrame(self.options,fg_color='transparent');line2.pack(fill='x',padx=10,pady=4)
        self.reset_button=ctk.CTkButton(line2,text='Tạo lại cảnh lỗi',command=self.reset,width=130,height=26);self.reset_button.pack(side='left',padx=(0,6))
        ctk.CTkButton(line2,text='Xem nhân vật gốc',command=self.show_character,width=140,height=26).pack(side='left')
        ctk.CTkLabel(self.options,text='3060 12GB / RAM 32GB • 480p • Wan dùng GPU, mã hóa thử NVENC.\nẢnh gốc được dùng lại qua các video; vẫn có thể lệch chi tiết. Wan không tự tạo tiếng động.',wraplength=640,justify='left',font=('Segoe UI',11),text_color='#a9c3d6').pack(anchor='w',padx=10,pady=8)
        self.controls=[self.create_button,self.install_button,self.resume_button,self.check_button,self.music_button,self.folder_button,self.asset_button,self.reset_button]
        self.minutes.trace_add('write',self.update_count);self.update_count()
        self.after(150,self.poll);self.protocol('WM_DELETE_WINDOW',self.close)

    def toggle_log(self):
        if self.log.winfo_manager():self.log.pack_forget()
        else:self.log.pack(fill='x',pady=6)

    def choose_assets(self):
        value=filedialog.askdirectory(title='Chọn ổ/thư mục lưu bộ ComfyUI và model (cần khoảng 40 GB trống)')
        if value:
            self.asset_root=Path(value)/'WanLocalStudioData';self.save_settings()
            self.status.set('Dữ liệu model: '+str(self.asset_root))

    def show_character(self):
        reference=settings_path().parent/'character/reference.png'
        if reference.is_file():
            if os.name=='nt':os.startfile(str(reference))
            else:webbrowser.open(reference.as_uri())
        else:messagebox.showinfo('Nhân vật','Tool sẽ tự tạo và lưu nhân vật khi render cảnh đầu tiên.')

    def prepare(self):
        root=self.asset_root;preferred=self.url.get()
        self.save_settings()
        def work():
            client=bootstrap.ensure_ready(root,preferred,self.cancel,self.notify)
            self.events.put(('backend',client.url))
            return 'Đã sẵn sàng. Chọn chủ đề và số phút rồi bấm Tạo video.'
        self.start(work)

    def update_count(self,*_):
        try:
            data=engine.plan(self.topic.get(),self.minutes.get().replace(',','.'))
            self.count.set(f'{len(data["scenes"])} cảnh · {data["frames"]/24:g} giây · Tự tham chiếu, chuyển cảnh và dựng MP4.')
        except (ValueError,TypeError): self.count.set('Nhập số từ 0,1 đến 15. Ví dụ 0,1 = 6 giây; 1 = 60 giây.')

    def save_settings(self):
        path=settings_path();path.parent.mkdir(parents=True,exist_ok=True)
        engine.atomic_json(path,{'url':self.url.get(),'folder':str(self.parent),'topic':self.topic.get(),'minutes':self.minutes.get(),'asset_root':str(self.asset_root)})

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
            topic=self.topic.get();minutes=self.minutes.get().replace(',','.');music=self.music;parent=self.parent;root=self.asset_root;preferred=client.url;profile=settings_path().parent/'character'
        except Exception as e:messagebox.showerror('Chưa bắt đầu được',str(e));return
        self.status.set('Đang kiểm tra ComfyUI và model Wan…')
        def work():
            ready=bootstrap.ensure_ready(root,preferred,self.cancel,self.notify)
            self.events.put(('backend',ready.url));parent.mkdir(parents=True,exist_ok=True)
            self.project=engine.new_project(parent,topic,minutes,profile)
            if music:shutil.copy2(music,self.project/'nhac-nen.audio')
            self.notify('Đã lưu dự án: '+str(self.project))
            return engine.generate(self.project,ready,self.cancel,self.notify)
        self.start(work)

    def resume(self):
        if self.busy:return
        folder=filedialog.askdirectory(title='Mở thư mục dự án có project.json')
        if not folder:return
        if not (Path(folder)/'project.json').is_file():messagebox.showerror('Chưa đúng dự án','Chọn thư mục Wan Local Studio có project.json.');return
        try:client=engine.Comfy(self.url.get())
        except ValueError as e:messagebox.showerror('Địa chỉ ComfyUI',str(e));return
        self.project=Path(folder);self.save_settings();root=self.asset_root
        data=json.loads((self.project/'project.json').read_text(encoding='utf-8'));preferred=data.get('server') or client.url
        def work():
            ready=bootstrap.ensure_ready(root,preferred,self.cancel,self.notify)
            self.events.put(('backend',ready.url))
            return engine.generate(self.project,ready,self.cancel,self.notify)
        self.start(work)

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
                if kind=='backend':
                    self.url.set(value);self.save_settings();continue
                self.status.set(str(value))
                if kind=='status':
                    # Keep durable milestones; rapidly repeated wait notices stay in status only.
                    if 'đã chờ' not in value and not value.startswith('Đang tải '):
                        self.log.insert('end',value+'\n');self.log.see('end')
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
    if os.name == 'nt':
        import subprocess
        for name, option in [('ffmpeg.exe','-version'),('7z.exe','-h')]:
            path=engine.ROOT/'runtime'/name
            assert path.is_file(),str(path)
            result=subprocess.run([str(path),option],capture_output=True,timeout=20,
                                  creationflags=getattr(subprocess,'CREATE_NO_WINDOW',0))
            assert result.returncode==0,(name,result.stderr)
    with tempfile.TemporaryDirectory() as td:
        with_settings=Path(td)/'settings.json'
        global settings_path
        settings_path=lambda:with_settings
        app=App();app.update();app.minutes.set('1');app.update()
        assert '13 cảnh' in app.count.get()
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
