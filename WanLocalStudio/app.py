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
import hunyuan
import diagnostics


def settings_path():
    return Path(os.environ.get('LOCALAPPDATA', Path.home())) / 'HunyuanLocalStudio/settings.json'


def load_settings():
    try: return json.loads(settings_path().read_text(encoding='utf-8'))
    except (OSError, ValueError):
        try:
            old=settings_path().parent.parent/'WanLocalStudio/settings.json'
            previous=json.loads(old.read_text(encoding='utf-8'))
            return {'asset_root':previous['asset_root']} if previous.get('asset_root') else {}
        except (OSError,ValueError):return {}


class App(ctk.CTk):
    def __init__(self):
        ctk.set_appearance_mode('dark')
        super().__init__()
        self.title('Hunyuan Local Studio '+engine.VERSION+' · HunyuanVideo 1.5')
        self.geometry('940x720'); self.minsize(740,600)
        self.configure(fg_color='#0b1220')
        if os.name == 'nt': self.iconbitmap(str(engine.ROOT / 'icon.ico'))
        saved = load_settings()
        self.events = queue.Queue(); self.cancel = threading.Event(); self.busy = False
        self.project = None; self.result = None; self.music = None; self.delete_requested=False; self.previews={}; self.preview_clip=None
        self.topic = tk.StringVar(value=saved.get('topic', engine.TOPICS[0]))
        self.minutes = tk.StringVar(value=saved.get('minutes', '0.1'))
        self.url = tk.StringVar(value=saved.get('url', 'http://127.0.0.1:8188'))
        self.parent = Path(saved.get('folder', str(Path.home() / 'Videos/HunyuanLocalStudio')))
        self.asset_root = Path(saved.get('asset_root', str(bootstrap.default_root())))
        panel = ctk.CTkScrollableFrame(self, fg_color='transparent')
        panel.pack(fill='both', expand=True, padx=14, pady=12)
        ctk.CTkLabel(panel,text='VIDEO LOCAL · HUNYUAN 1.5',font=('Segoe UI',22,'bold'),text_color='#5de0c1').pack(anchor='w')
        ctk.CTkLabel(panel,text='Hunyuan 1.5 FP8 • 720p gốc • Tự dựng & xuất MP4',font=('Segoe UI',12)).pack(anchor='w',pady=(0,10))
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
        self.install_button=ctk.CTkButton(row,text='Cài & tải model',command=self.prepare,height=34,width=155);self.install_button.pack(side='left',padx=(0,8))
        self.pause_button=ctk.CTkButton(row,text='Tạm dừng',command=self.cancel.set,height=34,width=105,fg_color='#753b50',state='disabled');self.pause_button.pack(side='right')
        self.delete_button=ctk.CTkButton(row,text='Xóa dự án đang tạo',command=self.delete_current,height=34,width=145,fg_color='#753b50');self.delete_button.pack(side='right',padx=6)
        self.status=tk.StringVar(value='720p gốc: tạo ảnh nhân vật trước, rồi sinh chuyển động. Hiển thị tiến độ thực theo từng bước; thử 0,1 phút trước.')
        ctk.CTkLabel(panel,textvariable=self.status,wraplength=670,justify='left',anchor='w',font=('Segoe UI',12)).pack(fill='x',pady=(8,4))
        self.progress=ctk.CTkProgressBar(panel,mode='determinate',progress_color='#5de0c1',height=6);self.progress.pack(fill='x',pady=6);self.progress.set(0)
        preview=ctk.CTkFrame(panel,fg_color='#152235');preview.pack(fill='x',pady=5)
        self.preview_image=ctk.CTkLabel(preview,text='Cảnh tạo xong sẽ hiện ngay tại đây',width=440,height=247,text_color='#a9c3d6')
        self.preview_image.pack(side='left',padx=8,pady=8)
        from PIL import Image
        self.preview_blank=ctk.CTkImage(light_image=Image.new('RGB',(440,247),'#152235'),size=(440,247))
        side=ctk.CTkFrame(preview,fg_color='transparent');side.pack(side='left',fill='both',expand=True,padx=8,pady=8)
        self.preview_status=ctk.CTkLabel(side,text='Chưa có cảnh hoàn tất',wraplength=170,justify='left');self.preview_status.pack(anchor='w',pady=8)
        self.scene_choice=ctk.CTkComboBox(side,values=['Chưa có cảnh'],command=self.select_preview,state='readonly',width=155);self.scene_choice.pack(anchor='w',pady=5)
        self.scene_play=ctk.CTkButton(side,text='Xem clip cảnh này',command=self.play_scene,state='disabled',width=155,height=30);self.scene_play.pack(anchor='w',pady=5)
        results=ctk.CTkFrame(panel,fg_color='transparent');results.pack(fill='x',pady=6)
        self.play_button=ctk.CTkButton(results,text='Xem video',command=self.play,state='disabled',width=110,height=28);self.play_button.pack(side='left',padx=(0,6))
        self.copy_button=ctk.CTkButton(results,text='Lưu như…',command=self.copy,state='disabled',width=110,height=28);self.copy_button.pack(side='left',padx=(0,6))
        ctk.CTkButton(results,text='Thư mục',command=self.folder,width=100,height=28).pack(side='left',padx=(0,6))
        self.resume_button=ctk.CTkButton(results,text='Tiếp tục dự án',command=self.resume,width=135,height=28);self.resume_button.pack(side='right')
        links=ctk.CTkFrame(panel,fg_color='transparent');links.pack(fill='x',pady=(8,4))
        ctk.CTkButton(links,text='Cài đặt',command=self.toggle_settings,width=100,height=26,fg_color='#25364c').pack(side='left',padx=(0,8))
        ctk.CTkButton(links,text='Nhật ký',command=self.toggle_log,width=100,height=26,fg_color='#25364c').pack(side='left')
        ctk.CTkButton(links,text='Kiểm tra GPU / log',command=self.gpu_log,width=145,height=26,fg_color='#25364c').pack(side='left',padx=8)
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
        ctk.CTkLabel(self.options,text='Hunyuan 1.5 FP8 • 720p gốc • 50 bước • GPU mã hóa chữ, tự chuyển model qua RAM.\nẢnh gốc được dùng lại qua các video; vẫn có thể lệch chi tiết. Model không tự tạo tiếng động.',wraplength=640,justify='left',font=('Segoe UI',11),text_color='#a9c3d6').pack(anchor='w',padx=10,pady=8)
        self.controls=[self.create_button,self.install_button,self.resume_button,self.check_button,self.music_button,self.folder_button,self.asset_button,self.reset_button]
        self.minutes.trace_add('write',self.update_count);self.update_count()
        self.after(150,self.poll);self.protocol('WM_DELETE_WINDOW',self.close)

    def toggle_log(self):
        if self.log.winfo_manager():self.log.pack_forget()
        else:self.log.pack(fill='x',pady=6)

    def choose_assets(self):
        value=filedialog.askdirectory(title='Chọn ổ/thư mục lưu bộ ComfyUI và model (tool sẽ tính dung lượng cần tải)')
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
        root=self.asset_root;preferred=self.url.get();need_t2v=not (settings_path().parent/'character/reference.png').is_file()
        self.save_settings()
        def work():
            client=bootstrap.ensure_ready(root,preferred,self.cancel,self.notify,hunyuan.BACKEND,need_t2v)
            self.events.put(('backend',client.url))
            return 'Đã sẵn sàng. Chọn chủ đề và số phút rồi bấm Tạo video.'
        self.start(work)

    def update_count(self,*_):
        try:
            data=engine.plan(self.topic.get(),self.minutes.get().replace(',','.'),hunyuan.BACKEND)
            self.count.set(f'{len(data["scenes"])} cảnh · {data["frames"]/24:g} giây · 720p gốc 16:9 · Tự tham chiếu và dựng MP4.')
        except (ValueError,TypeError): self.count.set('Nhập số từ 0,1 đến 60. Ví dụ 0,1 = 6 giây; 1 = 60 giây.')

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
                if self.project and self.project.is_dir():
                    (self.project/'tool-error.log').write_text(traceback.format_exc(),encoding='utf-8')
                self.events.put(('error',str(e)))
        threading.Thread(target=work,daemon=True).start()

    def notify(self,text):
        kind=text.get('type','preview') if isinstance(text,dict) else 'status'
        self.events.put((kind,text))

    def gpu_log(self):
        def collect():
            report=diagnostics.collect(self.asset_root,engine.VERSION)
            path=diagnostics.export(self.asset_root,self.project,engine.VERSION)
            self.events.put(('diagnostic',(report,path)))
        threading.Thread(target=collect,daemon=True).start()

    def create(self):
        if self.busy:return
        try:
            engine.plan(self.topic.get(),self.minutes.get().replace(',','.'),hunyuan.BACKEND)
            client=engine.Comfy(self.url.get(),hunyuan.BACKEND);self.save_settings()
            topic=self.topic.get();minutes=self.minutes.get().replace(',','.');music=self.music;parent=self.parent;root=self.asset_root;preferred=client.url;profile=settings_path().parent/'character'
        except Exception as e:messagebox.showerror('Chưa bắt đầu được',str(e));return
        self.project=None
        self.previews.clear();self.preview_clip=None;self.scene_play.configure(state='disabled');self.preview_image.configure(image=self.preview_blank,text='Đang chuẩn bị cảnh mới…');self.preview_status.configure(text='Chưa có cảnh hoàn tất');self.scene_choice.configure(values=['Chưa có cảnh']);self.scene_choice.set('Chưa có cảnh')
        self.status.set('Đang kiểm tra và chuẩn bị HunyuanVideo 1.5…')
        def work():
            ready=bootstrap.ensure_ready(root,preferred,self.cancel,self.notify,hunyuan.BACKEND,not (profile/'reference.png').is_file())
            self.events.put(('backend',ready.url));parent.mkdir(parents=True,exist_ok=True)
            self.project=engine.new_project(parent,topic,minutes,profile,hunyuan.BACKEND,portrait_first=True)
            if music:shutil.copy2(music,self.project/'nhac-nen.audio')
            self.notify('Đã lưu dự án: '+str(self.project))
            return engine.generate(self.project,ready,self.cancel,self.notify)
        self.start(work)

    def resume(self):
        if self.busy:return
        folder=filedialog.askdirectory(title='Mở thư mục dự án có project.json')
        if not folder:return
        if not (Path(folder)/'project.json').is_file():messagebox.showerror('Chưa đúng dự án','Chọn thư mục dự án có project.json.');return
        try:client=engine.Comfy(self.url.get(),hunyuan.BACKEND)
        except ValueError as e:messagebox.showerror('Địa chỉ ComfyUI',str(e));return
        self.project=Path(folder);self.save_settings();root=self.asset_root
        data=json.loads((self.project/'project.json').read_text(encoding='utf-8'));preferred=data.get('server') or client.url
        if data.get('backend')!=hunyuan.BACKEND:
            messagebox.showinfo('Chỉ dùng Hunyuan','Không tiếp tục dự án Wan. Bấm Tạo video để làm mới, hoặc Xóa dự án đang tạo để bỏ dự án này.');return
        def work():
            ready=bootstrap.ensure_ready(root,preferred,self.cancel,self.notify,hunyuan.BACKEND,not (self.project/'nhan-vat-goc.png').is_file())
            self.events.put(('backend',ready.url))
            return engine.generate(self.project,ready,self.cancel,self.notify)
        self.start(work)

    def reset(self):
        if not self.project:return
        if messagebox.askyesno('Gửi lại cảnh chưa xong','Chỉ dùng khi bạn đã kiểm tra hàng đợi ComfyUI và tác vụ cũ đã mất hoặc lỗi. Gửi lại có thể tạo cảnh trùng nếu tác vụ cũ vẫn chạy. Bạn muốn gửi lại cảnh này?'):
            engine.reset_failed_scene(self.project)
            client=engine.Comfy(self.url.get());self.start(lambda:engine.generate(self.project,client,self.cancel,self.notify))

    def check(self):
        try:client=engine.Comfy(self.url.get(),hunyuan.BACKEND,not (settings_path().parent/'character/reference.png').is_file());self.save_settings()
        except ValueError as e:messagebox.showerror('Địa chỉ ComfyUI',str(e));return
        self.start(lambda:('Đã nhận đủ bộ HunyuanVideo 1.5. Model: '+str(client.preflight())))

    def poll(self):
        try:
            while True:
                kind,value=self.events.get_nowait()
                if kind=='diagnostic':
                    report,path=value
                    self.log.pack(fill='x',pady=6)
                    self.log.insert('end',diagnostics.describe(report)+'\nLog đã lưu: '+str(path)+'\n'+'\n'.join(report['backend_log']['lines'])+'\n');self.log.see('end');continue
                if kind=='progress':
                    self.status.set(value['status'])
                    fraction=value.get('fraction')
                    mode='determinate' if fraction is not None else 'indeterminate'
                    if self.progress.cget('mode')!=mode:
                        self.progress.stop();self.progress.configure(mode=mode)
                        if fraction is None:self.progress.start()
                    if fraction is not None:self.progress.set(max(0,min(1,fraction)))
                    continue
                if kind=='portrait':
                    key='Ảnh nhân vật mới';self.previews[key]=dict(value,clip=None)
                    self.scene_choice.configure(values=list(self.previews));self.scene_choice.set(key);self.select_preview(key);continue
                if kind=='cleared':
                    self.previews.clear();self.preview_clip=None;self.scene_play.configure(state='disabled');self.preview_image.configure(image=self.preview_blank,text='Đã xóa dự án');self.preview_status.configure(text='Chưa có cảnh hoàn tất');self.scene_choice.configure(values=['Chưa có cảnh']);self.scene_choice.set('Chưa có cảnh');continue
                if kind=='preview':
                    key=f'Cảnh {value["scene"]:03}'
                    self.previews[key]=value;self.scene_choice.configure(values=list(self.previews));self.scene_choice.set(key);self.select_preview(key);continue
                if kind=='backend':
                    self.url.set(value);self.save_settings();continue
                self.status.set(str(value))
                if kind=='status':
                    # Keep durable milestones; rapidly repeated wait notices stay in status only.
                    if 'đã chờ' not in value and not value.startswith('Đang tải '):
                        self.log.insert('end',value+'\n');self.log.see('end')
                    continue
                self.delete_button.configure(state='normal')
                self.busy=False;self.progress.stop();self.progress.configure(mode='determinate');self.progress.set(0)
                for widget in self.controls:widget.configure(state='normal')
                self.pause_button.configure(state='disabled')
                if self.delete_requested:
                    self.delete_requested=False;self.perform_delete();continue
                if kind=='done' and isinstance(value,Path):
                    self.result=value;self.status.set('Video đã xuất: '+str(value))
                    self.play_button.configure(state='normal');self.copy_button.configure(state='normal');self.progress.set(1)
                self.log.insert('end',self.status.get()+'\n');self.log.see('end')
        except queue.Empty:pass
        self.after(150,self.poll)

    def select_preview(self,key):
        item=self.previews.get(key)
        if not item:return
        from PIL import Image,ImageOps
        with Image.open(item['image']) as original:
            picture=ImageOps.contain(original.convert('RGB'),(440,247),Image.Resampling.LANCZOS)
        self.preview_photo=ctk.CTkImage(light_image=picture,dark_image=picture,size=picture.size)
        self.preview_image.configure(image=self.preview_photo,text='')
        if item.get('type')=='portrait':
            self.preview_status.configure(text='Ảnh nhân vật mới đã xong. Đang chuẩn bị chuyển động 720p.')
        else:
            count=sum(bool(x.get('clip')) for x in self.previews.values())
            self.preview_status.configure(text=f'Cảnh {item["scene"]}/{item["total"]} đã xong\nĐã có {count} cảnh để xem')
        self.preview_clip=Path(item['clip']) if item.get('clip') else None
        self.scene_play.configure(state='normal' if self.preview_clip else 'disabled')

    def play_scene(self):
        if self.preview_clip and self.preview_clip.is_file():
            if os.name=='nt':os.startfile(str(self.preview_clip))
            else:webbrowser.open(self.preview_clip.as_uri())

    def delete_current(self):
        if self.busy and not self.project:
            self.cancel.set();self.status.set('Đang dừng chuẩn bị; chưa có cảnh hay dự án để xóa.');return
        if not self.project:
            folder=filedialog.askdirectory(title='Chọn dự án tạo dở cần xóa (có project.json)')
            if not folder:return
            if not (Path(folder)/'project.json').is_file():
                messagebox.showerror('Chưa đúng dự án','Chọn đúng thư mục có project.json.');return
            self.project=Path(folder)
        if not messagebox.askyesno('Xóa toàn bộ dự án này?',f'Xóa các cảnh, video và dữ liệu tạo dở trong:\n{self.project}\n\nDừng các tác vụ của dự án này. Không thể hoàn tác. Model dùng chung được giữ.'):
            return
        self.delete_button.configure(state='disabled')
        if self.busy:
            self.delete_requested=True;self.cancel.set();self.status.set('Đang dừng trước khi xóa…')
        else:self.perform_delete()

    def perform_delete(self):
        self.delete_button.configure(state='disabled')
        project=self.project
        def work():
            data=json.loads((project/'project.json').read_text(encoding='utf-8'))
            client=engine.Comfy(data.get('server') or self.url.get())
            managed=bootstrap.layout(self.asset_root)/'ComfyUI' if client.url==bootstrap.MANAGED_URL else None
            result=engine.delete_project(project,client,self.notify,managed)
            self.project=None;self.result=None
            self.events.put(('cleared',None))
            return result
        self.start(work)

    def play(self):
        if self.result:
            if os.name=='nt':os.startfile(str(self.result))
            else:webbrowser.open(self.result.as_uri())

    def copy(self):
        if not self.result:return
        value=filedialog.asksaveasfilename(defaultextension='.mp4',initialfile='video-hunyuan.mp4',filetypes=[('Video MP4','*.mp4')])
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
        from PIL import Image
        preview=Path(td)/'preview.png';Image.new('RGB',(1280,720),'#256f67').save(preview)
        app.notify({'type':'portrait','image':str(preview)});app.poll();app.update()
        assert app.preview_clip is None and app.scene_play.cget('state')=='disabled'
        app.notify({'type':'progress','status':'Sinh hình · bước 25/50','fraction':.5});app.poll();app.update()
        assert app.progress.cget('mode')=='determinate' and app.status.get()=='Sinh hình · bước 25/50'
        app.notify({'scene':1,'total':2,'image':str(preview),'clip':str(Path(td)/'scene.mp4')});app.poll();app.update()
        assert app.preview_clip==Path(td)/'scene.mp4'
        assert app.scene_play.cget('state')=='normal'
        app.events.put(('cleared',None));app.poll();app.update()
        assert app.scene_play.cget('state')=='disabled'
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
