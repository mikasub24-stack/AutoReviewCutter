"""UI contract against the uploaded scan tab; theme/download dependencies are shims.

No actual Auto Studio executable or Douyin login is tested here.
Run separately on Windows or under Xvfb: python tests/gui_contract.py
"""
import importlib
import json
from pathlib import Path
import sys
import tempfile
import time
import threading
import tkinter as tk
import types
from unittest.mock import Mock, patch
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from test_direct_api import Response, Transport, NoCatalogTransport, SigningStub, record, catalog_entry
from ytdl import directscan, bridge
from ytdl.douyin_direct.client import DouyinClient

with tempfile.TemporaryDirectory() as folder:
    root = tk.Tk(); root.geometry('1200x850')
    theme = types.ModuleType('theme')
    for key, value in dict(BG='#0b1020',PANEL='#141e32',PANEL2='#18243a',INPUT='#0e1628',BORDER='#2d3b54',TEXT='#edf3ff',MUTED='#99acc9',ACCENT='#55dfc3',GREEN='#55dfc3',ORANGE='#ffa94d',RED='#ff7b9e').items():setattr(theme,key,value)
    theme.FONT=('Arial',10);theme.FONTB=('Arial',10,'bold');theme.FONTS=('Arial',9)
    class Btn(tk.Button):
        def __init__(self,parent,text,command,kind='soft',**kwargs):
            kwargs.setdefault('font',theme.FONT)
            super().__init__(parent,text=text,command=command,**kwargs)
        def configure(self,cnf=None,**kwargs):
            kwargs.pop('kind',None)
            return super().configure(cnf,**kwargs)
    class Bar(tk.Frame):
        def __init__(self,parent,height):super().__init__(parent,height=height,bg=theme.BORDER);self.value=0
        def set(self,value,color=None):self.value=value
    def card(parent,*args):
        frame=tk.Frame(parent,bg=theme.PANEL);frame.pack(fill='x',padx=15,pady=8);return frame
    theme.Btn,theme.Bar,theme.card,theme.entry=Btn,Bar,card,lambda parent,var:tk.Entry(parent,textvariable=var)
    tabs=types.ModuleType('tabs');tabs.data_dir=lambda key:folder
    download=types.ModuleType('ytdl.tab');download._place=lambda *a:None;download.default_folder=lambda:folder
    browsers=types.ModuleType('ytdl.browsers');browsers.installed=lambda:[];browsers.launch=Mock(side_effect=AssertionError('API must not launch browser'));browsers.is_running=lambda c:False
    for name,module in [('theme',theme),('tabs',tabs),('ytdl.tab',download),('ytdl.browsers',browsers)]:sys.modules[name]=module
    module=importlib.import_module('ytdl.scantab')
    cookie=Path(folder)/'cookies.txt';cookie.write_text('# Netscape HTTP Cookie File\n.douyin.com\tTRUE\t/\tTRUE\t0\tsessionid\tTEST_ONLY\n.douyin.com\tTRUE\t/\tTRUE\t0\tmsToken\tTEST_SESSION_TOKEN_GUI\n.douyin.com\tTRUE\t/\tTRUE\t0\tuifid\tTEST_GUI_UIFID\n')
    class Download:
        cookie_file=str(cookie)
        folder_var=tk.StringVar(master=root,value=folder)
        def __init__(self):
            self.eng=types.SimpleNamespace(order=[],items={},lock=threading.Lock())
            self.started=[]
        def config_summary(self):return 'Test settings, no actual download'
        def add_scanned(self,job,**kwargs):
            self.lines=job.lines
            existing={it['url'] for it in self.eng.items.values()}
            count=0
            for line in job.lines:
                parts=line.split('\t')
                if parts[0] in existing:continue
                iid='i%d'%(len(self.eng.items)+1)
                self.eng.items[iid]={'url':parts[0],'title':parts[1],'direct':parts[2],'status':'Chờ','edited':True,'fetching':False}
                self.eng.order.append(iid);existing.add(parts[0]);count+=1
            return count
        def refresh(self,iid):pass
        def rebuild_tree(self):pass
        def start_urls(self,urls):
            self.started=[self.eng.items[i]['url'] for i in self.eng.order if self.eng.items[i]['url'] in urls and self.eng.items[i]['status']=='Chờ']
            for it in self.eng.items.values():
                if it['url'] in self.started:it['status']='Hàng đợi'
            return len(self.started)
        def urls_status(self,urls):
            items=[it for it in self.eng.items.values() if it['url'] in urls]
            return {'total':len(items),'run':0,'wait':sum(it['status']=='Hàng đợi' for it in items),'pause':0,'err':0,'done':0,'pct':0}
    dl=Download();hub=types.SimpleNamespace(dl=dl,show_dl=lambda:None)
    page=module.Page(root,root,hub);page.pack(fill='both',expand=True);root.update()
    assert page.browser_box.winfo_ismapped()
    assert hasattr(page, "direct")
    transports=[]
    partial_replies=[]
    native_catalog=[]
    def factory(cookie_file,**kwargs):
        # User page is newest-first; only the mix endpoint provides the playlist order.
        episodes=[record(2,title='Không có số trong tiêu đề',mix='12'),record(1,title='Không có số trong tiêu đề',mix='12')]
        if not transports:
            reply={'aweme_list':episodes,'has_more':0,'max_cursor':0}
        else:
            reply={'aweme_list':list(reversed(episodes)),'has_more':0,'cursor':0}
        if native_catalog:
            if page.direct.job.kind=='list':
                reply={'mix_infos':list(native_catalog),'has_more':0,'cursor':0}
            else:
                reply={'aweme_list':[record(1000+i,title='Không có số',mix='1001') for i in range(1,26)],'has_more':0,'cursor':0}
            transport=Transport([reply])
        else:
            transport=NoCatalogTransport(list(partial_replies) if partial_replies else [reply])
        transports.append(transport)
        return DouyinClient(cookie_file,opener=transport,signer=SigningStub(),gap=0,**kwargs)
    page.direct=directscan.Scanner(str(cookie),factory)
    def settle():
        end=time.monotonic()+5
        while (page.is_busy or page.job is not None) and time.monotonic()<end:
            root.update();time.sleep(.01)
        root.update()
        assert not page.is_busy and page.job is None,'UI did not finish worker'
    errors=[]
    warnings=[]
    with patch.object(module.messagebox,'showerror',side_effect=lambda *a,**k:errors.append(a)),patch.object(module.messagebox,'showwarning',side_effect=lambda *a,**k:warnings.append(a)),patch.object(bridge,'get',side_effect=AssertionError('API must not touch extension bridge')):
        page.url_var.set('https://www.douyin.com/user/OWNER_A')
        page.start_list();settle()
        assert len(page.rows)==1 and page.rows[0]['g']['n']==2
        page.fetch_rows(page.rows);settle()
        row=page.rows[0]
        assert row['state']=='done' and len(row['items'])==2
        assert len(transports[0].calls)==2 and len(transports[1].calls)==1
        assert '/mix/aweme/' in transports[1].calls[0].full_url
        assert page.send(row,quiet=True)==2
        assert all(line.count('\t')==2 for line in dl.lines)
        assert [line.split('\t')[1] for line in dl.lines]==['Tập 001 - 同一部','Tập 002 - 同一部']
        # Existing rows must retain new scanned names instead of being discarded as duplicates.
        dl.eng.order.reverse()
        for item in dl.eng.items.values():item['title']='Old ID-based name'
        page.download([row])
        assert dl.started==['https://www.douyin.com/video/1','https://www.douyin.com/video/2']
        assert [dl.eng.items[i]['title'] for i in dl.eng.order]==['Tập 001 - 同一部','Tập 002 - 同一部']
        # Selecting only episode 2 must not rename it as episode 1.
        for item in dl.eng.items.values():item['status']='Chờ'
        row['items'][0]['var'].set(False)
        page.download([row])
        assert dl.started==['https://www.douyin.com/video/2']
        assert dl.lines[0].split('\t')[1]=='Tập 002 - 同一部'
        assert browsers.launch.call_count==0
        assert errors==[]
        # A partial profile scan must expose usable videos immediately, without
        # refetching all pages or claiming that the scan completed.
        incomplete={'aweme_list':[record(9,title='Tập 09')],'has_more':1,'max_cursor':0}
        partial_replies.extend([incomplete,incomplete])
        page.start_list();settle()
        assert len(page.rows)==1
        partial_row=page.rows[0]
        assert partial_row['state']=='partial' and partial_row['partial']
        assert len(partial_row['items'])==1
        assert len(warnings)==1
        assert 'video ngoài bộ' in page.count_lbl.cget('text')
        assert 'CHƯA QUÉT ĐỦ' in partial_row['info'].cget('text')
        request_count=sum(len(t.calls) for t in transports)
        page.download([partial_row])
        assert dl.started==['https://www.douyin.com/video/9']
        assert dl.lines[0].split('\t')[1].startswith('Tập 009 - ')
        assert sum(len(t.calls) for t in transports)==request_count
        assert errors==[]
        # Read exactly the four creator catalog cards without fetching 153 user posts.
        native_catalog.extend([catalog_entry(1001,'自在四合院1',25),catalog_entry(1002,'猛龙大鹏',20),catalog_entry(1003,'大海镇院',54),catalog_entry(1004,'我哥易中海（完结）',40)])
        with patch.object(directscan,'load_cover',return_value=''):
            page.start_list();settle()
            assert len(page.rows)==4
            assert [r['g']['name'] for r in page.rows]==[entry['mix_name'] for entry in native_catalog]
            assert [r['g']['n'] for r in page.rows]==[25,20,54,40]
            assert '4 bộ' in page.count_lbl.cget('text') and '139 video' in page.count_lbl.cget('text')
            assert 'ngoài bộ' not in page.count_lbl.cget('text')
            assert len(transports[-1].calls)==1 and '/mix/list/' in transports[-1].calls[0].full_url
            first=page.rows[0]
            page.fetch_rows([first]);settle()
            assert first['state']=='done' and len(first['items'])==25
            assert len(transports[-1].calls)==1 and '/mix/aweme/' in transports[-1].calls[0].full_url
            assert first['items'][0]['name']=='Tập 001 - 自在四合院1'
            assert first['items'][-1]['name']=='Tập 025 - 自在四合院1'
            page.download([first])
            assert len(dl.started)==25
            assert dl.lines[0].split('\t')[1]=='Tập 001 - 自在四合院1'
            assert dl.lines[-1].split('\t')[1]=='Tập 025 - 自在四合院1'
            assert errors==[]
            assert browsers.launch.call_count==0
        page.shutdown()
    root.destroy()
print(json.dumps({'ui_contract':'passed','theme':'test shim','downloader':'test shim','browser_launches':0,'real_douyin_tested':False}))
