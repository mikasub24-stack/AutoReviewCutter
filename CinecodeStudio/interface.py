"""Desktop presentation, separate from project and rendering logic."""
import tkinter as tk
import customtkinter as ctk

BG='#0b1220'; PANEL='#131f31'; FIELD='#0d1829'; MUTED='#9bacc4'; ACCENT='#5de0c1'
FONT=('Segoe UI',14)

def frame(parent, **kwargs):
    return ctk.CTkFrame(parent, fg_color=PANEL, corner_radius=16, **kwargs)

def label(parent, text='', **kwargs):
    kwargs.setdefault('font',FONT);kwargs.setdefault('text_color',MUTED)
    return ctk.CTkLabel(parent,text=text,anchor='w',**kwargs)

def combo(parent, variable, values, width=120, state='readonly'):
    return ctk.CTkComboBox(parent,variable=variable,values=values,width=width,height=36,
        state=state,font=FONT,dropdown_font=FONT,fg_color=FIELD,border_color='#30445e',
        button_color='#253950',button_hover_color='#36516e',dropdown_fg_color=PANEL)

def build(a):
    a.configure(fg_color=BG)
    a.grid_columnconfigure(0,weight=1);a.grid_rowconfigure(1,weight=1)
    header=ctk.CTkFrame(a,fg_color='transparent');header.grid(row=0,column=0,sticky='ew',padx=24,pady=(18,10))
    brand=ctk.CTkLabel(header,text='C',width=48,height=48,corner_radius=14,fg_color=ACCENT,text_color=BG,font=('Segoe UI',28,'bold'))
    brand.pack(side='left',padx=(0,12))
    names=ctk.CTkFrame(header,fg_color='transparent');names.pack(side='left')
    ctk.CTkLabel(names,text='Cinecode Studio',font=('Segoe UI',24,'bold'),text_color='#f1f5fb',anchor='w').pack(anchor='w')
    label(names,'Từ ý tưởng đến video của bạn',font=('Segoe UI',12)).pack(anchor='w')
    for text,fn in [('Cài đặt AI',a.settings),('Lưu dự án',a.save),('Mở dự án',a.open),('Dự án mới',a.new)]:
        a.button(header,text,fn).pack(side='right',padx=(8,0))

    page=ctk.CTkScrollableFrame(a,fg_color=BG,corner_radius=0,scrollbar_button_color='#2b415d')
    page.grid(row=1,column=0,sticky='nsew',padx=16);page.grid_columnconfigure(0,weight=1)
    ideas=frame(page);ideas.grid(row=0,column=0,sticky='ew',padx=4,pady=(0,12))
    idea_header=ctk.CTkFrame(ideas,fg_color='transparent');idea_header.pack(fill='x',padx=18,pady=(12,6))
    label(idea_header,'01   Ý TƯỞNG VIDEO',text_color=ACCENT,font=('Segoe UI',13,'bold')).pack(side='left')
    a.language=tk.StringVar(value=a.data['videoLanguage'])
    combo(idea_header,a.language,['Tiếng Việt','English'],125).pack(side='right')
    label(idea_header,'Ngôn ngữ video').pack(side='right',padx=(0,10))
    a.brief=a.text(ideas,height=68);a.brief.pack(fill='x',padx=16,pady=(0,10))
    a.brief.insert('1.0','Làm video về việc sống chậm lại, nhẹ nhàng và tích cực.')
    opts=ctk.CTkFrame(ideas,fg_color='transparent');opts.pack(fill='x',padx=18,pady=(0,14))
    a.duration=tk.StringVar(value='30');a.ratio=tk.StringVar(value='16:9');a.style=tk.StringVar(value='Điện ảnh')
    a.duration_choice=tk.StringVar(value='30 giây')
    duration_choices={'15 giây':'15','30 giây':'30','1 phút':'60','2 phút':'120','3 phút':'180','5 phút':'300','10 phút':'600'}
    for text,var,values,width in [('Thời lượng AI',a.duration_choice,list(duration_choices),110),
                                 ('Khung hình',a.ratio,['16:9','9:16','1:1'],95),
                                 ('Phong cách',a.style,['Điện ảnh','Ấm áp','Giải thích'],130)]:
        label(opts,text).pack(side='left',padx=(0,8))
        field=combo(opts,var,values,width);field.pack(side='left',padx=(0,18))
        if var is a.duration_choice:field.configure(command=lambda value:a.duration.set(duration_choices[value]))
    a.button(opts,'AI viết kịch bản',a.generate,primary=True,width=155).pack(side='right')

    editor=frame(page);editor.grid(row=1,column=0,sticky='ew',padx=4,pady=(0,12));editor.grid_columnconfigure(1,weight=1)
    left=ctk.CTkFrame(editor,fg_color='transparent',width=230);left.grid(row=0,column=0,sticky='nsew',padx=(16,18),pady=14)
    label(left,'02   KỊCH BẢN & CÁC CẢNH',text_color=ACCENT,font=('Segoe UI',13,'bold')).pack(anchor='w',pady=(0,8))
    a.summary=tk.StringVar();label(left,textvariable=a.summary,font=('Segoe UI',12)).pack(anchor='w',pady=(0,8))
    listbox_frame=ctk.CTkFrame(left,fg_color=FIELD,corner_radius=12);listbox_frame.pack(fill='both',expand=True)
    a.scenes=tk.Listbox(listbox_frame,width=24,height=9,bg=FIELD,fg='#d8e4f2',selectbackground='#235e58',
        selectforeground='#b7fff0',activestyle='none',font=('Segoe UI',11),borderwidth=0,highlightthickness=0,exportselection=False)
    a.scenes.pack(side='left',fill='both',expand=True,padx=(8,0),pady=8)
    scroll=ctk.CTkScrollbar(listbox_frame,command=a.scenes.yview,width=12);scroll.pack(side='right',fill='y',padx=(0,4),pady=8)
    a.scenes.configure(yscrollcommand=scroll.set);a.scenes.bind('<<ListboxSelect>>',a.select_scene)
    actions=ctk.CTkFrame(left,fg_color='transparent');actions.pack(fill='x',pady=(10,0))
    a.button(actions,'+ Thêm cảnh',a.add_scene,width=112).pack(side='left')
    a.button(actions,'Xóa',a.delete_scene,width=70).pack(side='right')
    right=ctk.CTkFrame(editor,fg_color='transparent');right.grid(row=0,column=1,sticky='nsew',padx=(0,18),pady=14)
    a.title_var=tk.StringVar();a.seconds=tk.StringVar();a.image_var=tk.StringVar()
    label(right,'Tiêu đề cảnh',text_color='#e5edf8').pack(anchor='w')
    ctk.CTkEntry(right,textvariable=a.title_var,height=36,font=FONT,fg_color=FIELD,border_color='#30445e').pack(fill='x',pady=(4,8))
    row=ctk.CTkFrame(right,fg_color='transparent');row.pack(fill='x')
    label(row,'Thời lượng').pack(side='left')
    ctk.CTkEntry(row,textvariable=a.seconds,width=65,height=34,font=FONT,fg_color=FIELD,border_color='#30445e').pack(side='left',padx=8)
    label(row,'giây').pack(side='left',padx=(0,16))
    a.button(row,'Chọn ảnh',a.image,width=100).pack(side='left')
    a.button(row,'Bỏ ảnh',a.clear_image,width=85).pack(side='left',padx=8)
    label(right,textvariable=a.image_var,font=('Segoe UI',12)).pack(anchor='w',pady=(4,6))
    label(right,'Chữ trên màn hình',text_color='#e5edf8').pack(anchor='w')
    a.caption=a.text(right,height=66);a.caption.pack(fill='x',pady=(4,8))
    label(right,'Lời đọc của cảnh',text_color='#e5edf8').pack(anchor='w')
    a.narration=a.text(right,height=76);a.narration.pack(fill='x',pady=(4,0))

    sound=frame(page);sound.grid(row=2,column=0,sticky='ew',padx=4,pady=(0,8))
    label(sound,'03   ÂM THANH & GIỌNG ĐỌC',text_color=ACCENT,font=('Segoe UI',13,'bold')).pack(anchor='w',padx=18,pady=(12,8))
    audio=ctk.CTkFrame(sound,fg_color='transparent');audio.pack(fill='x',padx=18)
    for text,fn in [('Thêm nhạc',lambda:a.audio('music')),('Thêm lời đọc',lambda:a.audio('voice')),('AI tạo lời đọc',a.tts),('Bỏ âm thanh',a.clear_audio)]:
        a.button(audio,text,fn,width=122).pack(side='left',padx=(0,8))
    label(audio,'Lời đọc theo ngôn ngữ video đã chọn',font=('Segoe UI',12)).pack(side='left',padx=(12,0))
    a.audio_label=tk.StringVar();label(sound,textvariable=a.audio_label,font=('Segoe UI',12)).pack(anchor='w',padx=18,pady=(6,12))

    footer=frame(a);footer.grid(row=2,column=0,sticky='ew',padx=24,pady=(10,18))
    result=ctk.CTkFrame(footer,fg_color='transparent');result.pack(fill='x',padx=16,pady=(10,8))
    a.output_label=tk.StringVar(value='Video đã xuất sẽ hiện ở đây')
    label(result,textvariable=a.output_label,font=('Segoe UI',12),wraplength=610).pack(side='left',fill='x',expand=True)
    a.result_buttons=[]
    for text,fn,width in [('Mở video',a.open_video,100),('Tải video',a.download,105),('Mở thư mục',a.open_folder,115)]:
        b=ctk.CTkButton(result,text=text,command=fn,state='disabled',width=width,height=34,
            font=FONT,corner_radius=9,fg_color='#244452',hover_color='#326173')
        b.pack(side='left',padx=(8,0));a.result_buttons.append(b)
    a.progress=ctk.CTkProgressBar(footer,height=3,mode='determinate',progress_color=ACCENT,fg_color='#263449');a.progress.pack(fill='x',padx=16);a.progress.set(0)
    bottom=ctk.CTkFrame(footer,fg_color='transparent');bottom.pack(fill='x',padx=16,pady=(8,12))
    a.status=tk.StringVar(value='Sẵn sàng · Có thể thử dự án mẫu không cần AI.')
    label(bottom,textvariable=a.status,font=('Segoe UI',12),wraplength=540).pack(side='left',fill='x',expand=True)
    a.cancel_button=ctk.CTkButton(bottom,text='Hủy',command=a.cancel.set,state='disabled',width=65,height=38,font=FONT,fg_color='#43313e',hover_color='#624155');a.cancel_button.pack(side='left',padx=8)
    a.button(bottom,'Xem trước hình',a.preview,width=130).pack(side='left',padx=(0,8))
    a.button(bottom,'Xuất video MP4',a.export,primary=True,width=155).pack(side='left')
