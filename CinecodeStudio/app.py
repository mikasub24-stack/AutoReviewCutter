import ctypes
from ctypes import wintypes
import json
import os
from pathlib import Path
import queue
import sys
import tempfile
import threading
import tkinter as tk
from tkinter import filedialog, messagebox
import customtkinter as ctk
import interface
import webbrowser

import core

DATA = Path(os.getenv('LOCALAPPDATA', Path.home())) / 'CinecodeStudio'

def protected_key(value, decrypt=False):
    if os.name != 'nt': return ''  # Only Windows DPAPI stores credentials.
    class Blob(ctypes.Structure):
        _fields_ = [('size', wintypes.DWORD), ('data', ctypes.POINTER(ctypes.c_ubyte))]
    import base64
    raw = base64.b64decode(value) if decrypt else value.encode('utf-8')
    buffer = ctypes.create_string_buffer(raw)
    source = Blob(len(raw), ctypes.cast(buffer, ctypes.POINTER(ctypes.c_ubyte)))
    target = Blob()
    api = ctypes.windll.crypt32.CryptUnprotectData if decrypt else ctypes.windll.crypt32.CryptProtectData
    if not api(ctypes.byref(source), None, None, None, None, 1, ctypes.byref(target)):
        raise OSError('Không thể lưu/đọc khóa AI bằng tài khoản Windows này.')
    try:
        output = ctypes.string_at(target.data, target.size)
        return output.decode('utf-8') if decrypt else base64.b64encode(output).decode('ascii')
    finally:
        ctypes.windll.kernel32.LocalFree(target.data)

ctk.set_appearance_mode("dark")

class App(ctk.CTk):
    def __init__(self):
        super().__init__()
        self.title('Cinecode Studio · Làm video bằng tiếng Việt')
        if os.name == 'nt': self.iconbitmap(str(core.ROOT/'icon.ico'))
        self.geometry('1220x900'); self.minsize(1100, 720)
        self.last_output = None
        self.data = core.demo(); self.path = None; self.dirty = False; self.current = 0
        self.events = queue.Queue(); self.cancel = threading.Event(); self.busy = False; self.key = ''
        self.temp = tempfile.TemporaryDirectory(prefix='CinecodeStudio-'); self.folder = Path(self.temp.name)
        DATA.mkdir(parents=True, exist_ok=True)
        self.model = tk.StringVar(value='gemini-2.5-flash')
        self.tts_model = tk.StringVar(value='gemini-3.8-flash-tts')
        try:
            settings = json.loads((DATA / 'settings.json').read_text(encoding='utf-8'))
            self.model.set(settings.get('model', self.model.get()))
            self.tts_model.set(settings.get('ttsModel', self.tts_model.get()))
            if settings.get('key'): self.key = protected_key(settings['key'], True)
        except (OSError, ValueError): pass
        self.buttons = []
        interface.build(self)
        self.refresh(); self.load_scene(); self.protocol('WM_DELETE_WINDOW', self.close); self.after(100, self.poll)

    def button(self, parent, text, command, primary=False, width=112):
        b = ctk.CTkButton(parent, text=text, command=command, width=width, height=36,
            font=('Segoe UI',14,'bold' if primary else 'normal'), corner_radius=9,
            fg_color='#5de0c1' if primary else '#24364d', hover_color='#89f1d8' if primary else '#354e6b',
            text_color='#09241e' if primary else '#e4edf8')
        self.buttons.append(b); return b

    def text(self, parent, **kwargs):
        return ctk.CTkTextbox(parent, fg_color='#0d1829', text_color='#edf4fa', wrap='word',
            font=('Segoe UI',14), corner_radius=10, border_width=1, border_color='#263b54', undo=True, **kwargs)

    def commit(self):
        s = self.data['scenes'][self.current]
        candidate = dict(s, title=self.title_var.get(), text=self.caption.get('1.0','end').strip(),
                         narration=self.narration.get('1.0','end').strip(), duration=float(self.seconds.get()))
        data = dict(self.data, scenes=list(self.data['scenes']), style=self.style.get(), ratio=self.ratio.get(), narrationLanguage=self.language.get(),videoLanguage=self.language.get())
        data['scenes'][self.current] = candidate
        self.data = core.validate(data)

    def refresh(self):
        self.scenes.delete(0,'end')
        for i,s in enumerate(self.data['scenes']): self.scenes.insert('end', f'{i+1:02} · {s["title"] or "Cảnh mới"}')
        self.scenes.selection_set(self.current)
        total=sum(s['duration'] for s in self.data['scenes'])
        self.summary.set(f"{len(self.data['scenes'])} cảnh · {int(total)//60}:{int(total)%60:02d} · {self.data['ratio']}")
        self.audio_label.set('Nhạc: '+(Path(self.data['music']).name or 'chưa chọn')+'   |   Lời đọc: '+(Path(self.data['voice']).name or 'chưa chọn'))

    def load_scene(self):
        s = self.data['scenes'][self.current]; self.title_var.set(s['title']); self.seconds.set(str(s['duration']))
        for box,key in [(self.caption,'text'),(self.narration,'narration')]: box.delete('1.0','end'); box.insert('1.0',s[key])
        self.image_var.set(Path(s['image']).name if s['image'] else 'Chưa chọn ảnh · dùng nền chuyển động')

    def select_scene(self, event=None):
        selection = self.scenes.curselection()
        if not selection or selection[0] == self.current:return
        try: self.commit()
        except ValueError as e: messagebox.showerror('Kiểm tra cảnh',str(e)); self.refresh(); return
        self.current=selection[0]; self.refresh(); self.load_scene()

    def new(self):
        if not messagebox.askyesno('Dự án mới','Tạo dự án mẫu mới? Hãy lưu dự án đang chỉnh trước.'):return
        self.reset_output(); self.data=core.demo(); self.path=None; self.current=0; self.style.set(self.data['style']); self.ratio.set(self.data['ratio']); self.language.set(self.data['videoLanguage']); self.refresh(); self.load_scene()

    def open(self):
        p=filedialog.askopenfilename(filetypes=[('Dự án Cinecode','*.cinecode.json'),('JSON','*.json')])
        if not p:return
        try:
            loaded=core.load_project(p); self.reset_output(); self.data=loaded; self.path=Path(p); self.current=0
            self.style.set(self.data['style']); self.ratio.set(self.data['ratio']); self.language.set(self.data['videoLanguage']); self.refresh(); self.load_scene()
        except (OSError,ValueError) as e:messagebox.showerror('Không mở được',str(e))

    def save(self):
        try:
            self.commit()
            p=self.path or filedialog.asksaveasfilename(defaultextension='.cinecode.json', filetypes=[('Dự án Cinecode','*.cinecode.json')])
            if not p:return
            core.save_project(p,self.data); self.path=Path(p); self.refresh(); self.status.set('Đã lưu dự án: '+str(p))
        except (OSError,ValueError) as e:messagebox.showerror('Không lưu được',str(e))

    def add_scene(self):
        try:self.commit()
        except ValueError as e:messagebox.showerror('Kiểm tra cảnh',str(e));return
        if len(self.data['scenes'])>=40:return
        self.data['scenes'].append(dict(title='Cảnh mới',text='',narration='',image='',duration=5));self.current=len(self.data['scenes'])-1;self.refresh();self.load_scene()

    def delete_scene(self):
        if len(self.data['scenes'])<=1:return
        del self.data['scenes'][self.current];self.current=min(self.current,len(self.data['scenes'])-1);self.refresh();self.load_scene()

    def image(self):
        p=filedialog.askopenfilename(filetypes=[('Ảnh','*.png *.jpg *.jpeg *.webp')])
        if p:self.data['scenes'][self.current]['image']=p;self.image_var.set(Path(p).name)

    def clear_image(self):self.data['scenes'][self.current]['image']='';self.image_var.set('Dùng nền chuyển động')
    def clear_audio(self):self.data.update(music='',voice='');self.refresh()
    def audio(self,kind):
        p=filedialog.askopenfilename(filetypes=[('Âm thanh','*.wav *.mp3 *.m4a *.aac *.flac *.mp4')])
        if p:self.data[kind]=p;self.refresh()

    def settings(self):
        w=ctk.CTkToplevel(self);w.title('Cài đặt AI');w.geometry('640x490');w.transient(self);w.grab_set()
        f=ctk.CTkFrame(w,fg_color='#131f31',corner_radius=14);f.pack(fill='both',expand=True,padx=18,pady=18)
        ctk.CTkLabel(f,font=('Segoe UI',14),text='Khóa Gemini API · chỉ nhập tại đây').pack(anchor='w')
        entry=ctk.CTkEntry(f,show='•',height=36,font=('Segoe UI',14));entry.insert(0,self.key);entry.pack(fill='x',pady=8)
        ctk.CTkLabel(f,font=('Segoe UI',14),text='Model viết kịch bản · chọn hoặc nhập tên').pack(anchor='w')
        text_models=interface.combo(f,self.model,[self.model.get(),'gemini-2.5-flash','gemini-2.5-pro'],state='normal');text_models.pack(fill='x',pady=8)
        ctk.CTkLabel(f,font=('Segoe UI',14),text='Model đọc (TTS) · chọn hoặc nhập tên').pack(anchor='w')
        tts_models=interface.combo(f,self.tts_model,[self.tts_model.get(),'gemini-2.5-flash-preview-tts'],state='normal');tts_models.pack(fill='x',pady=8)
        def fetch_models():
            key=entry.get().strip()
            def done(result):
                if not w.winfo_exists():return
                text,tts=result;text_models.configure(values=sorted(set(text+[self.model.get()])));tts_models.configure(values=sorted(set(tts+[self.tts_model.get()])))
                self.status.set(f'Đã lấy danh sách: {len(text)} model viết, {len(tts)} model đọc. Chọn model rồi Lưu cài đặt.')
                messagebox.showinfo('Đã kết nối Google',f'Có {len(text)} model viết, {len(tts)} model đọc trong danh sách. Quyền và hạn mức được kiểm tra khi dùng model.',parent=w)
            self.status.set('Đang lấy danh sách model từ Google…')
            self.start(lambda:core.list_models(key,self.cancel,lambda s:self.events.put(('status',s))),done)
        ctk.CTkButton(f,height=36,font=('Segoe UI',14),text='Lấy danh sách model từ Google',command=fetch_models).pack(anchor='w',pady=(0,8))
        ctk.CTkLabel(f,font=('Segoe UI',14),text='AI gửi nội dung tới Google và dùng hạn mức tài khoản của bạn.\nKhóa được mã hóa theo tài khoản Windows, không ghi vào dự án.',wraplength=580).pack(anchor='w')
        def apply():
            try:
                self.key=entry.get().strip();settings={'model':self.model.get(),'ttsModel':self.tts_model.get(),'key':protected_key(self.key) if self.key else ''}
                target=DATA/'settings.json';temp=target.with_suffix('.tmp');temp.write_text(json.dumps(settings),encoding='utf-8');temp.replace(target);w.destroy()
            except OSError as e:messagebox.showerror('Chưa lưu được',str(e),parent=w)
        ctk.CTkButton(f,height=36,font=('Segoe UI',14),text='Lưu cài đặt',command=apply).pack(anchor='e',pady=10)

    def start(self,fn,done):
        if self.busy:return
        self.busy=True;self.cancel.clear();self.progress.configure(mode='indeterminate');self.progress.start()
        for b in self.buttons:b.configure(state='disabled')
        self.cancel_button.configure(state='normal')
        def worker():
            try:self.events.put(('done',done,fn()))
            except Exception as e:self.events.put(('error',str(e)))
        threading.Thread(target=worker,daemon=True).start()

    def poll(self):
        try:
            while True:
                event=self.events.get_nowait()
                if event[0]=='status':self.status.set(event[1]);continue
                self.busy=False;self.progress.stop();self.progress.configure(mode='determinate');self.progress.set(0)
                for b in self.buttons:b.configure(state='normal')
                self.cancel_button.configure(state='disabled')
                if event[0]=='error':self.status.set(event[1]);messagebox.showerror('Chưa hoàn tất',event[1])
                else:event[1](event[2])
        except queue.Empty:pass
        self.after(100,self.poll)

    def generate(self):
        if not self.key:self.settings();return
        if not messagebox.askyesno('Viết kịch bản mới','AI sẽ thay các cảnh hiện tại. Tiếp tục?'):return
        brief=self.brief.get('1.0','end').strip();args=(self.key,self.model.get(),brief,int(self.duration.get()),self.style.get(),self.ratio.get(),self.language.get())
        self.status.set('AI đang viết kịch bản tiếng Việt…')
        def done(data):
            if self.cancel.is_set():self.status.set('Đã hủy nhận kịch bản.');return
            self.data=data;self.current=0;self.refresh();self.load_scene();self.status.set('Đã có kịch bản · xem và sửa từng cảnh trước khi xuất.')
        self.start(lambda:core.generate(*args,cancelled=self.cancel,status=lambda s:self.events.put(('status',s))),done)

    def preview(self):
        try:self.commit();webbrowser.open(core.build_html(self.data,self.folder,True).as_uri());self.refresh()
        except (ValueError,OSError) as e:messagebox.showerror('Chưa xem được',str(e))

    def reset_output(self):
        self.last_output=None;self.output_label.set('Video đã xuất sẽ hiện ở đây')
        for b in self.result_buttons:b.configure(state='disabled')

    def complete_export(self,path):
        self.last_output=Path(path);self.output_label.set('Đã xuất: '+Path(path).name)
        for b in self.result_buttons:b.configure(state='normal')
        self.status.set('Video đã sẵn sàng · Mở xem hoặc bấm Tải video để lưu thêm một bản.')

    def download(self):
        if not self.last_output:return
        p=filedialog.asksaveasfilename(title='Tải video · Chọn nơi lưu bản sao',defaultextension='.mp4',
                initialfile=self.last_output.name,filetypes=[('Video MP4','*.mp4')])
        if not p:return
        try:core.copy_video(self.last_output,p);self.status.set('Đã lưu video: '+str(p))
        except (ValueError,OSError) as e:messagebox.showerror('Chưa lưu được video',str(e))

    def open_video(self):
        if not self.last_output:return
        try:
            if not self.last_output.is_file():raise OSError('Không tìm thấy video ở vị trí đã xuất.')
            if os.name=='nt':os.startfile(str(self.last_output))
            else:webbrowser.open(self.last_output.as_uri())
        except OSError as e:messagebox.showerror('Chưa mở được video',str(e))

    def open_folder(self):
        if not self.last_output:return
        try:
            if os.name=='nt':os.startfile(str(self.last_output.parent))
            else:webbrowser.open(self.last_output.parent.as_uri())
        except OSError as e:messagebox.showerror('Chưa mở được thư mục',str(e))

    def tts(self):
        if not self.key:self.settings();return
        try:self.commit()
        except ValueError as e:messagebox.showerror('Kiểm tra cảnh',str(e));return
        if not any(s['narration'].strip() for s in self.data['scenes']):messagebox.showinfo('Chưa có lời đọc','Điền lời đọc cho các cảnh trước.');return
        path=filedialog.asksaveasfilename(defaultextension='.wav',initialfile='Loi-doc.wav',filetypes=[('WAV','*.wav')])
        if not path:return
        snapshot=core.validate(self.data);key=self.key;tts_model=self.tts_model.get()
        def task():
            # One recording per scene; extend its timing if the spoken line is longer.
            chunks=[]
            for i,s in enumerate(snapshot['scenes']):
                if self.cancel.is_set():raise RuntimeError('Đã hủy tạo lời đọc.')
                self.events.put(('status',f'Đang tạo lời đọc cảnh {i+1}/{len(snapshot["scenes"])}…'))
                if s['narration'].strip():
                    part=self.folder/f'voice-{i}.wav';length=core.synthesize(key,s['narration'],part,language=snapshot['narrationLanguage'],model=tts_model,cancelled=self.cancel,status=lambda s:self.events.put(('status',s)))
                    import wave
                    with wave.open(str(part),'rb') as w:pcm=w.readframes(w.getnframes())
                    s['duration']=max(s['duration'],length+.3)
                else:pcm=b''
                if s['duration']>60:raise ValueError('Lời đọc quá dài. Hãy chia thành nhiều cảnh.')
                chunks.append(pcm+b'\0'*max(0,int(s['duration']*24000)*2-len(pcm)))
            core.validate(snapshot)
            if self.cancel.is_set():raise RuntimeError('Đã hủy tạo lời đọc.')
            import wave
            with wave.open(path,'wb') as w:w.setnchannels(1);w.setsampwidth(2);w.setframerate(24000);w.writeframes(b''.join(chunks))
            snapshot['voice']=path;return snapshot
        def done(data):self.data=data;self.refresh();self.load_scene();self.status.set('Đã tạo lời đọc, thời lượng cảnh được kéo đủ theo giọng đọc.')
        self.start(task,done)

    def export(self):
        try:self.commit();data=core.validate(self.data)
        except ValueError as e:messagebox.showerror('Kiểm tra cảnh',str(e));return
        p=filedialog.asksaveasfilename(defaultextension='.mp4',initialfile='Video-cua-toi.mp4',filetypes=[('MP4','*.mp4')])
        if not p:return
        def done(path):self.complete_export(path)
        self.start(lambda:core.render(data,self.folder,p,self.cancel,lambda s:self.events.put(('status',s))),done)

    def close(self):
        if self.busy:messagebox.showinfo('Đang xử lý','Hủy tác vụ và chờ hoàn tất trước khi thoát.');return
        if not messagebox.askyesno('Thoát Cinecode Studio','Đóng ứng dụng? Hãy lưu dự án nếu bạn muốn chỉnh tiếp lần sau.'):return
        self.temp.cleanup();self.destroy()

if __name__=='__main__':
    if '--smoke-test' in sys.argv:
        from unittest.mock import patch
        app=App();app.update();assert app.scenes.size()==3;app.commit()
        assert all(b.cget('state')=='disabled' for b in app.result_buttons)
        source=app.folder/'exported.mp4';source.write_bytes(b'smoke-video')
        target=app.folder/'downloaded.mp4';app.complete_export(source)
        with patch('tkinter.filedialog.asksaveasfilename',return_value=str(target)):app.download()
        assert target.read_bytes()==source.read_bytes()
        assert all(b.cget('state')=='normal' for b in app.result_buttons)
        app.geometry('1100x720');app.update()
        for b in app.result_buttons:
            assert b.winfo_height()>10 and b.winfo_width()>40
            assert b.winfo_rooty()+b.winfo_height()<=app.winfo_rooty()+app.winfo_height()+2
        app.settings();app.update()
        for child in app.winfo_children():
            if isinstance(child,ctk.CTkToplevel):child.grab_release();child.destroy()
        if os.environ.get('CINECODE_SCREENSHOT'):
            from PIL import ImageGrab
            app.geometry('1220x900');app.reset_output();app.status.set('Sẵn sàng · Có thể thử dự án mẫu không cần AI.');app.update()
            path=Path(os.environ['CINECODE_SCREENSHOT']);path.parent.mkdir(parents=True,exist_ok=True)
            ImageGrab.grab(bbox=(app.winfo_rootx(),app.winfo_rooty(),app.winfo_rootx()+app.winfo_width(),app.winfo_rooty()+app.winfo_height())).save(path)
        app.destroy();sys.exit(0)
    App().mainloop()
