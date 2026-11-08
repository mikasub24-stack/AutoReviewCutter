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
from tkinter import ttk, filedialog, messagebox
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

class App(tk.Tk):
    def __init__(self):
        super().__init__()
        self.title('Cinecode Studio · Làm video bằng tiếng Việt')
        if os.name == 'nt': self.iconbitmap(str(core.ROOT/'icon.ico'))
        self.geometry('1120x820'); self.minsize(960, 740)
        self.configure(bg='#101927')
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
        style = ttk.Style(self); style.theme_use('clam')
        style.configure('.', font=('Segoe UI', 10), background='#101927', foreground='#e9f0f8')
        style.configure('TButton', padding=(12, 7), background='#234355')
        style.configure('TEntry', fieldbackground='#1d2b3e', foreground='#edf4fa')
        style.configure('TCombobox', fieldbackground='#1d2b3e', foreground='#edf4fa')
        style.map('TCombobox', fieldbackground=[('readonly', '#1d2b3e')], foreground=[('readonly', '#edf4fa')])
        body = ttk.Frame(self, padding=22); body.pack(fill='both', expand=True)
        ttk.Label(body, text='CINECODE STUDIO', font=('Segoe UI', 22, 'bold'), foreground='#67e8d2').pack(anchor='w')
        ttk.Label(body, text='Viết ý tưởng → sửa từng cảnh → thêm âm thanh → xuất video', foreground='#a6b6c9').pack(anchor='w', pady=(0,12))
        bar = ttk.Frame(body); bar.pack(fill='x')
        self.buttons = []
        for label, fn in [('Dự án mới', self.new), ('Mở dự án', self.open), ('Lưu dự án', self.save), ('Cài đặt AI', self.settings)]:
            self.button(bar, label, fn).pack(side='left', padx=(0,8))
        self.brief = self.text(body, height=3); self.brief.pack(fill='x', pady=(12,8))
        self.brief.insert('1.0', 'Làm video ngắn về việc sống chậm lại, nhẹ nhàng và tích cực.')
        opts = ttk.Frame(body); opts.pack(fill='x', pady=(0,12))
        self.duration = tk.StringVar(value='30'); self.ratio = tk.StringVar(value='16:9'); self.style = tk.StringVar(value='Điện ảnh')
        for label, variable, values in [('Thời lượng (giây)', self.duration, ['15','30','60','120','180','300','600']), ('Khung hình', self.ratio, ['16:9','9:16','1:1']), ('Phong cách', self.style, list(core.STYLES))]:
            ttk.Label(opts, text=label).pack(side='left', padx=(0,6))
            ttk.Combobox(opts, textvariable=variable, values=values, state='readonly', width=13).pack(side='left', padx=(0,14))
        self.button(opts, 'AI viết kịch bản', self.generate).pack(side='right')
        panes = ttk.Frame(body); panes.pack(fill='both', expand=True)
        left = ttk.Frame(panes); left.pack(side='left', fill='y', padx=(0,16))
        ttk.Label(left, text='CÁC CẢNH').pack(anchor='w', pady=(0,8))
        self.scenes = tk.Listbox(left, width=27, bg='#19273a', fg='#e9f0f8', selectbackground='#246559',
                                 font=('Segoe UI',11), borderwidth=0, exportselection=False)
        self.scenes.pack(fill='both', expand=True); self.scenes.bind('<<ListboxSelect>>', self.select_scene)
        controls = ttk.Frame(left); controls.pack(fill='x', pady=8)
        self.button(controls, '+ Cảnh', self.add_scene).pack(side='left')
        self.button(controls, 'Xóa cảnh', self.delete_scene).pack(side='right')
        right = ttk.Frame(panes); right.pack(side='left', fill='both', expand=True)
        self.title_var = tk.StringVar(); self.seconds = tk.StringVar(); self.image_var = tk.StringVar()
        ttk.Label(right, text='Tiêu đề cảnh').pack(anchor='w'); ttk.Entry(right, textvariable=self.title_var).pack(fill='x', pady=(4,8))
        row = ttk.Frame(right); row.pack(fill='x')
        ttk.Label(row, text='Số giây').pack(side='left'); ttk.Spinbox(row, from_=1, to=60, textvariable=self.seconds, width=6).pack(side='left', padx=8)
        self.button(row, 'Chọn ảnh cho cảnh', self.image).pack(side='left')
        self.button(row, 'Bỏ ảnh', self.clear_image).pack(side='left', padx=8)
        ttk.Label(right, textvariable=self.image_var, foreground='#9aabbd', wraplength=680).pack(anchor='w', pady=4)
        ttk.Label(right, text='Chữ trên màn hình (nên ngắn, dễ đọc)').pack(anchor='w')
        self.caption = self.text(right, height=3); self.caption.pack(fill='both', expand=True, pady=(4,8))
        ttk.Label(right, text='Lời đọc của cảnh').pack(anchor='w')
        self.narration = self.text(right, height=3); self.narration.pack(fill='both', expand=True, pady=(4,8))
        audio = ttk.Frame(body); audio.pack(fill='x', pady=8)
        self.button(audio, 'Thêm nhạc', lambda:self.audio('music')).pack(side='left')
        self.button(audio, 'Thêm lời đọc', lambda:self.audio('voice')).pack(side='left', padx=8)
        self.button(audio, 'AI tạo lời đọc', self.tts).pack(side='left')
        self.button(audio, 'Bỏ âm thanh', self.clear_audio).pack(side='left', padx=8)
        self.language = tk.StringVar(value=self.data['narrationLanguage'])
        ttk.Label(audio, text='Ngôn ngữ đọc').pack(side='left', padx=(8,4))
        ttk.Combobox(audio, textvariable=self.language, values=['Tiếng Việt','English'], state='readonly', width=12).pack(side='left')
        self.audio_label = tk.StringVar(); ttk.Label(body, textvariable=self.audio_label, wraplength=1050, foreground='#a6b6c9').pack(anchor='w')
        bottom = ttk.Frame(body); bottom.pack(fill='x', pady=(10,6))
        self.button(bottom, 'Xem trước hình', self.preview).pack(side='left')
        self.button(bottom, 'Xuất MP4', self.export).pack(side='left', padx=8)
        self.cancel_button = ttk.Button(bottom, text='Hủy tác vụ', command=self.cancel.set, state='disabled'); self.cancel_button.pack(side='right')
        self.status = tk.StringVar(value='Sẵn sàng · Dự án mẫu không cần khóa AI. Xem trước hình chưa phát nhạc/lời đọc.')
        ttk.Label(body, textvariable=self.status, wraplength=1050, foreground='#67e8d2').pack(anchor='w')
        self.refresh(); self.load_scene(); self.protocol('WM_DELETE_WINDOW', self.close); self.after(100, self.poll)

    def button(self, parent, text, command):
        b = ttk.Button(parent, text=text, command=command); self.buttons.append(b); return b

    def text(self, parent, **kwargs):
        return tk.Text(parent, bg='#19273a', fg='#edf4fa', insertbackground='white', wrap='word',
                       font=('Segoe UI',11), relief='flat', padx=10, pady=8, undo=True, **kwargs)

    def commit(self):
        s = self.data['scenes'][self.current]
        candidate = dict(s, title=self.title_var.get(), text=self.caption.get('1.0','end').strip(),
                         narration=self.narration.get('1.0','end').strip(), duration=float(self.seconds.get()))
        data = dict(self.data, scenes=list(self.data['scenes']), style=self.style.get(), ratio=self.ratio.get(), narrationLanguage=self.language.get())
        data['scenes'][self.current] = candidate
        self.data = core.validate(data)

    def refresh(self):
        self.scenes.delete(0,'end')
        for i,s in enumerate(self.data['scenes']): self.scenes.insert('end', f'{i+1:02} · {s["title"] or "Cảnh mới"}')
        self.scenes.selection_set(self.current)
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
        self.data=core.demo(); self.path=None; self.current=0; self.style.set(self.data['style']); self.ratio.set(self.data['ratio']); self.language.set(self.data['narrationLanguage']); self.refresh(); self.load_scene()

    def open(self):
        p=filedialog.askopenfilename(filetypes=[('Dự án Cinecode','*.cinecode.json'),('JSON','*.json')])
        if not p:return
        try:
            self.data=core.load_project(p); self.path=Path(p); self.current=0
            self.style.set(self.data['style']); self.ratio.set(self.data['ratio']); self.language.set(self.data['narrationLanguage']); self.refresh(); self.load_scene()
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
        w=tk.Toplevel(self);w.title('Cài đặt AI');w.geometry('600x400');w.transient(self);w.grab_set()
        f=ttk.Frame(w,padding=20);f.pack(fill='both',expand=True)
        ttk.Label(f,text='Khóa Gemini API · chỉ nhập tại đây').pack(anchor='w')
        entry=ttk.Entry(f,show='•');entry.insert(0,self.key);entry.pack(fill='x',pady=8)
        ttk.Label(f,text='Model viết kịch bản · chọn hoặc nhập tên').pack(anchor='w')
        text_models=ttk.Combobox(f,textvariable=self.model,values=[self.model.get(),'gemini-2.5-flash','gemini-2.5-pro']);text_models.pack(fill='x',pady=8)
        ttk.Label(f,text='Model đọc (TTS) · chọn hoặc nhập tên').pack(anchor='w')
        tts_models=ttk.Combobox(f,textvariable=self.tts_model,values=[self.tts_model.get(),'gemini-2.5-flash-preview-tts']);tts_models.pack(fill='x',pady=8)
        def fetch_models():
            key=entry.get().strip()
            def done(result):
                if not w.winfo_exists():return
                text,tts=result;text_models.configure(values=sorted(set(text+[self.model.get()])));tts_models.configure(values=sorted(set(tts+[self.tts_model.get()])))
                self.status.set(f'Đã lấy danh sách: {len(text)} model viết, {len(tts)} model đọc. Chọn model rồi Lưu cài đặt.')
                messagebox.showinfo('Đã kết nối Google',f'Có {len(text)} model viết, {len(tts)} model đọc trong danh sách. Quyền và hạn mức được kiểm tra khi dùng model.',parent=w)
            self.status.set('Đang lấy danh sách model từ Google…')
            self.start(lambda:core.list_models(key,self.cancel,lambda s:self.events.put(('status',s))),done)
        ttk.Button(f,text='Lấy danh sách model từ Google',command=fetch_models).pack(anchor='w',pady=(0,8))
        ttk.Label(f,text='AI gửi nội dung tới Google và dùng hạn mức tài khoản của bạn.\nKhóa được mã hóa theo tài khoản Windows, không ghi vào dự án.',wraplength=480).pack(anchor='w')
        def apply():
            try:
                self.key=entry.get().strip();settings={'model':self.model.get(),'ttsModel':self.tts_model.get(),'key':protected_key(self.key) if self.key else ''}
                target=DATA/'settings.json';temp=target.with_suffix('.tmp');temp.write_text(json.dumps(settings),encoding='utf-8');temp.replace(target);w.destroy()
            except OSError as e:messagebox.showerror('Chưa lưu được',str(e),parent=w)
        ttk.Button(f,text='Lưu cài đặt',command=apply).pack(anchor='e',pady=10)

    def start(self,fn,done):
        if self.busy:return
        self.busy=True;self.cancel.clear()
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
                self.busy=False
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
        def done(path):self.status.set('Đã xuất: '+str(path));messagebox.showinfo('Hoàn tất','Video đã lưu tại:\n'+str(path))
        self.start(lambda:core.render(data,self.folder,p,self.cancel,lambda s:self.events.put(('status',s))),done)

    def close(self):
        if self.busy:messagebox.showinfo('Đang xử lý','Hủy tác vụ và chờ hoàn tất trước khi thoát.');return
        if not messagebox.askyesno('Thoát Cinecode Studio','Đóng ứng dụng? Hãy lưu dự án nếu bạn muốn chỉnh tiếp lần sau.'):return
        self.temp.cleanup();self.destroy()

if __name__=='__main__':
    if '--smoke-test' in sys.argv:
        app=App();app.update();assert app.scenes.size()==3;app.commit();app.destroy();sys.exit(0)
    App().mainloop()
