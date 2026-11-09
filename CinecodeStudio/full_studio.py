"""Vietnamese project controls for upstream Cinecode; AI stays in the native agent."""
import os
import json
from pathlib import Path
import queue
import shutil
import threading
import tkinter as tk
from tkinter import filedialog,messagebox
import webbrowser
import customtkinter as ctk
import core
import upstream

class FullStudio(ctk.CTk):
    def __init__(self):
        super().__init__();self.title('Cinecode Studio · Cinecode gốc / Claude Code')
        self.geometry('1180x880');self.minsize(1000,720);self.configure(fg_color='#0b1220')
        if os.name=='nt':self.iconbitmap(str(core.ROOT/'icon.ico'))
        self.project=None;self.attachments=[];self.agent_process=None;self.cancel=threading.Event();self.busy=False;self.events=queue.Queue()
        body=ctk.CTkScrollableFrame(self,fg_color='transparent');body.pack(fill='both',expand=True,padx=20,pady=16)
        ctk.CTkLabel(body,text='Cinecode Studio · BỘ GỐC',font=('Segoe UI',25,'bold'),text_color='#5de0c1').pack(anchor='w')
        ctk.CTkLabel(body,text='Giao diện quản lý dự án · Agent viết mã cảnh và dùng toàn bộ công cụ Cinecode gốc',font=('Segoe UI',14)).pack(anchor='w',pady=(0,12))
        options=ctk.CTkFrame(body);options.pack(fill='x',pady=8)
        self.agent=tk.StringVar(value='Claude Code');self.mode=tk.StringVar(value='Film');self.route=tk.StringVar(value='Phim / hoạt hình')
        self.duration=tk.StringVar(value='1 phút');self.language=tk.StringVar(value='Tiếng Việt');self.pace=tk.StringVar(value='Tự làm đến MP4')
        self.music=tk.StringVar(value='Không nhạc / hiệu ứng âm thanh');self.project_label=tk.StringVar(value='Chưa chọn dự án')
        for row,items in enumerate([
            [('Agent',self.agent,['Claude Code','Cursor']),('Chế độ gốc',self.mode,['Quick','Film']),('Ngôn ngữ phim',self.language,['Tiếng Việt','English'])],
            [('Loại video',self.route,['Phim / hoạt hình','Quảng cáo / sản phẩm','MV theo nhạc','Theo video tham chiếu','Dựng từ video có sẵn']),('Thời lượng',self.duration,['30 giây','1 phút','3 phút','5 phút','10 phút','15 phút']),('Tiến độ',self.pace,['Tự làm đến MP4','Duyệt từng giai đoạn'])]]):
            line=ctk.CTkFrame(options,fg_color='transparent');line.pack(fill='x',padx=12,pady=8)
            for text,var,values in items:
                ctk.CTkLabel(line,text=text,font=('Segoe UI',13)).pack(side='left',padx=(0,6))
                ctk.CTkComboBox(line,variable=var,values=values,width=220 if text=='Loại video' else 160,state='normal' if text=='Thời lượng' else 'readonly').pack(side='left',padx=(0,14))
        self.brief=ctk.CTkTextbox(body,height=160,font=('Segoe UI',15),wrap='word');self.brief.pack(fill='x',pady=8)
        self.brief.insert('1.0','Dán tiêu đề hoặc kịch bản đầy đủ ở đây. Có thể yêu cầu cảnh 2D/3D, nhân vật, ánh sáng, camera và phong cách cụ thể.')
        media=ctk.CTkFrame(body,fg_color='transparent');media.pack(fill='x',pady=6)
        ctk.CTkButton(media,text='Thêm ảnh / nhạc / video',command=self.add_media,width=190).pack(side='left')
        ctk.CTkComboBox(media,variable=self.music,values=['Không nhạc / hiệu ứng âm thanh','Dùng nhạc của tôi','Tìm nhạc mở, cho tôi chọn','Nhạc viết bằng code'],width=265,state='readonly').pack(side='left',padx=12)
        self.media_label=tk.StringVar(value='Chưa đính kèm file');ctk.CTkLabel(body,textvariable=self.media_label,wraplength=1050).pack(anchor='w')
        actions=ctk.CTkFrame(body);actions.pack(fill='x',pady=12)
        self.buttons=[]
        for number,(text,fn) in enumerate([('Tạo dự án gốc',self.create),('Mở dự án gốc',self.open_project),('Mở agent / tiếp tục',self.launch),('Đăng nhập Claude Pro',self.login),('Kiểm tra thành phần',self.doctor),('Dừng Claude Code',self.stop_agent)]):
            b=ctk.CTkButton(actions,text=text,command=fn,width=180);b.grid(row=number//3,column=number%3,padx=10,pady=8,sticky='ew');self.buttons.append(b)
        for column in range(3):actions.grid_columnconfigure(column,weight=1)
        ctk.CTkLabel(body,textvariable=self.project_label,wraplength=1050,text_color='#5de0c1').pack(anchor='w')
        ctk.CTkLabel(body,text='Agent thực hiện quy trình gốc trong Claude Code/Cursor. Quyền chạy lệnh và đăng nhập do agent chính thức xử lý; app không bỏ qua yêu cầu cấp quyền.',wraplength=1050,font=('Segoe UI',13)).pack(anchor='w',pady=6)
        render=ctk.CTkFrame(body,fg_color='transparent');render.pack(fill='x',pady=8)
        for text,step in [('Ảnh xem trước gốc','stills'),('Dựng bản nháp gốc','draft'),('Xuất bản cuối gốc','final')]:
            b=ctk.CTkButton(render,text=text,command=lambda s=step:self.render(s),width=200);b.pack(side='left',padx=(0,10));self.buttons.append(b)
        ctk.CTkButton(render,text='Hủy bước dựng',command=self.cancel.set,width=140,fg_color='#6b3b49').pack(side='right')
        self.files=tk.StringVar();self.output=ctk.CTkComboBox(body,variable=self.files,values=[],state='readonly',width=700);self.output.pack(fill='x',pady=8)
        results=ctk.CTkFrame(body,fg_color='transparent');results.pack(fill='x')
        for text,fn in [('Mở video',self.play),('Tải / lưu bản sao',self.download),('Mở thư mục dự án',self.folder),('Hướng dẫn Claude Code',lambda:webbrowser.open('https://code.claude.com/docs/en/setup'))]:
            ctk.CTkButton(results,text=text,command=fn,width=200).pack(side='left',padx=(0,10))
        self.status=tk.StringVar(value='Dùng đăng nhập Claude Pro/Max trong Claude Code; TTS hoặc dịch vụ ảnh/video ngoài có tài khoản và hạn mức riêng.')
        ctk.CTkLabel(body,textvariable=self.status,wraplength=1050,font=('Segoe UI',13),text_color='#a7b9d0').pack(anchor='w',pady=12)
        self.log=ctk.CTkTextbox(body,height=90,font=('Consolas',12));self.log.pack(fill='x',pady=4)
        self.after(300,self.poll);self.after(1500,self.refresh_outputs);self.protocol('WM_DELETE_WINDOW',self.close)

    def add_media(self):
        files=filedialog.askopenfilenames(title='Ảnh, lời đọc, nhạc hoặc video của bạn')
        self.attachments.extend(f for f in files if f not in self.attachments)
        self.media_label.set(' · '.join(Path(p).name for p in self.attachments) or 'Chưa đính kèm file')

    def start(self,fn,done):
        if self.busy:return
        self.busy=True;self.cancel.clear()
        for b in self.buttons:b.configure(state='disabled')
        def work():
            try:self.events.put(('done',done,fn()))
            except Exception as e:self.events.put(('error',str(e)))
        threading.Thread(target=work,daemon=True).start()

    def create(self):
        brief=self.brief.get('1.0','end').strip()
        if not brief:messagebox.showinfo('Chưa có nội dung','Dán tiêu đề hoặc kịch bản trước.');return
        parent=filedialog.askdirectory(title='Chọn nơi lưu dự án và video')
        if not parent:return
        args=(parent,brief,self.mode.get(),self.route.get(),self.duration.get(),self.language.get(),self.agent.get(),self.pace.get(),self.music.get(),list(self.attachments))
        self.status.set('Đang tạo dự án, chép nguyên toolkit và đăng ký skill cho agent…')
        def done(project):self.set_project(project);self.launch()
        self.start(lambda:upstream.create_project(*args),done)

    def set_project(self,path):
        self.project=Path(path)
        config=self.project/'.cinecode-ui/project.json'
        if config.is_file():
            try:
                data=json.loads(config.read_text(encoding='utf-8'))
                for name in ('mode','route','duration','language','agent','pace','music'):
                    if name in data:getattr(self,name).set(str(data[name]))
                if data.get('brief'):self.brief.delete('1.0','end');self.brief.insert('1.0',str(data['brief']))
            except (OSError,ValueError):pass
        upstream.connect_existing_project(self.project,self.agent.get())
        self.project_label.set(str(self.project));self.status.set('Đã mở dự án Cinecode gốc. Mở agent để tiếp tục từ STATE.md.')

    def open_project(self):
        path=filedialog.askdirectory(title='Mở thư mục dự án Cinecode có STATE.md')
        if not path:return
        if not (Path(path)/'STATE.md').is_file():messagebox.showerror('Chưa đúng dự án','Chọn dự án Cinecode gốc có STATE.md.');return
        self.set_project(path)

    def launch(self):
        if not self.project:messagebox.showinfo('Chưa có dự án','Tạo hoặc mở dự án trước.');return
        try:
            self.agent_process=upstream.launch_agent(self.project,self.agent.get())
            self.status.set('Đã mở '+self.agent.get()+'. Agent sẽ đọc yêu cầu và chạy bộ Cinecode gốc; video hoàn tất sẽ hiện trong danh sách.')
            if self.agent.get()=='Cursor':
                self.clipboard_clear();self.clipboard_append('Read .cinecode-ui/START-HERE.md and run the cinecode skill. Respond in Vietnamese.')
                self.status.set('Đã mở Cursor và chép yêu cầu vào clipboard. Dán vào Agent chat để bắt đầu quy trình gốc.')
        except Exception as e:messagebox.showerror('Chưa mở được agent',str(e))

    def login(self):
        try:upstream.launch_agent(self.project or Path.home(),'Claude Code',login=True)
        except Exception as e:messagebox.showerror('Đăng nhập Claude Code',str(e))

    def stop_agent(self):
        if self.agent.get()!='Claude Code':messagebox.showinfo('Cursor','Dừng tác vụ trong Agent chat của Cursor để không đóng các dự án khác.');return
        self.start(lambda:upstream.stop_agent(self.agent_process),lambda _:self.status.set('Đã dừng tiến trình Claude Code do app mở. Dự án đã lưu vẫn giữ để tiếp tục.'))

    def close(self):
        if self.busy:self.cancel.set();self.status.set('Đang hủy bước dựng. Chờ hoàn tất rồi đóng cửa sổ.');return
        self.destroy()

    def doctor(self):
        self.log.delete('1.0','end');self.log.insert('1.0',upstream.diagnostics())

    def render(self,step):
        if not self.project:return
        self.start(lambda:upstream.run_step(self.project,step,self.cancel,lambda s:self.events.put(('status',s))),lambda p:self.status.set('Công cụ gốc đã hoàn tất bước '+step+'.'))

    def poll(self):
        try:
            while True:
                item=self.events.get_nowait()
                if item[0]=='status':self.status.set(item[1]);continue
                self.busy=False
                for b in self.buttons:b.configure(state='normal')
                if item[0]=='error':self.status.set(item[1]);self.log.delete('1.0','end');self.log.insert('1.0',item[1])
                else:item[1](item[2])
        except queue.Empty:pass
        self.after(200,self.poll)

    def refresh_outputs(self):
        if self.project:
            names=[p.name for p in upstream.outputs(self.project)]
            self.output.configure(values=names)
            if names and self.files.get() not in names:self.files.set(names[0])
        self.after(1500,self.refresh_outputs)

    def selected_output(self):
        if not self.project or not self.files.get():raise ValueError('Chưa có video hoàn tất trong thư mục dự án.')
        path=self.project/self.files.get()
        if not path.is_file() or path.parent.resolve()!=self.project.resolve():raise ValueError('Không tìm thấy video.')
        return path

    def play(self):
        try:
            path=self.selected_output()
            if os.name=='nt':os.startfile(str(path))
            else:webbrowser.open(path.as_uri())
        except Exception as e:messagebox.showinfo('Video',str(e))

    def download(self):
        try:
            source=self.selected_output();target=filedialog.asksaveasfilename(defaultextension='.mp4',initialfile=source.name,filetypes=[('MP4','*.mp4')])
            if target:core.copy_video(source,target);self.status.set('Đã lưu bản sao: '+target)
        except Exception as e:messagebox.showerror('Lưu video',str(e))

    def folder(self):
        if self.project:
            if os.name=='nt':os.startfile(str(self.project))
            else:webbrowser.open(self.project.as_uri())

def smoke_test():
    import tempfile
    with tempfile.TemporaryDirectory(prefix='cinecode-full-smoke-') as td:
        project=upstream.create_project(td,'Desktop original test','Film','Phim / hoạt hình','10 phút','English','Claude Code','Duyệt từng giai đoạn','Không nhạc')
        assert (project/'engine/scene.html').is_file()
        assert (project/'.claude/skills/cinecode/SKILL.md').is_file()
        assert (project/'tools/qc.py').is_file()
        probe=subprocess_runtime_check()
        assert probe.returncode==0,probe.stderr
        app=FullStudio();app.set_project(project);app.update();app.doctor()
        assert app.project==project and app.mode.get()=='Film'
        assert 'ffprobe' in app.log.get('1.0','end')
        if os.environ.get('CINECODE_SCREENSHOT'):
            from PIL import ImageGrab
            target=Path(os.environ['CINECODE_SCREENSHOT']);target.parent.mkdir(parents=True,exist_ok=True)
            ImageGrab.grab(bbox=(app.winfo_rootx(),app.winfo_rooty(),app.winfo_rootx()+app.winfo_width(),app.winfo_rooty()+app.winfo_height())).save(target)
        app.destroy()

def subprocess_runtime_check():
    import subprocess
    return subprocess.run([upstream.python_runtime(),'-I','-c','import ssl,venv,ensurepip,xml.etree.ElementTree,json;print("ready")'],
                          capture_output=True,text=True,creationflags=getattr(subprocess,'CREATE_NO_WINDOW',0))
