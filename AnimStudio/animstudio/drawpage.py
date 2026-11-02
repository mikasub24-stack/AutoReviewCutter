# -*- coding: utf-8 -*-
"""Trang 'Vẽ ra' (/draw): trang RIENG, khong lien quan tab 'Tạo Video Story'.
Y tuong thiet ke: cai bang trang that. O kich ban la mot tam bang co khay but; moi cau tool cat ra thanh mot khung phan canh (dashed) hien ngay khi dan chu,
sau do chinh khung do duoc 've ra' tung cai khi AI ve xong. Mau: muc den + but da vang (but da vang = diem dang chu y: nut chinh, muc dang chon, thanh tien trinh).
Font: font he thong (chay offline). Trang tu doi sang 'bang den' khi may o che do toi.
build(tabs_html) -> chuoi HTML; phan JS o drawpage_js.py."""
import json
from . import uikit

CSS = uikit.CSS + r'''
body{padding-bottom:128px}

.wrap{max-width:1360px;margin:0 auto;padding:32px 28px 0;display:grid;grid-template-columns:minmax(0,1fr) 424px;gap:30px;align-items:start}
.main{display:grid;gap:24px;min-width:0}
@media(max-width:1080px){
 .wrap{display:flex;flex-direction:column;gap:22px;padding:20px 16px 0}.main{display:contents}
 #secScript{order:1}.rail{order:2}#secRun{order:3}#secBoard{order:4}#secProj{order:5}
 .bar>div{padding:0 16px;gap:14px}
}

/* ---- Dau trang noi dung */
.hero h1{position:relative;display:inline-block;margin:0;font:800 clamp(40px,5vw,54px)/1.02 var(--disp);letter-spacing:-.045em}
.hero h1::after{content:"";position:absolute;right:-50px;top:-8px;width:40px;height:56px;pointer-events:none;
 background:url("__STAR_Y__") right 0 top 0/32px 32px no-repeat,url("__STAR_B__") left 2px bottom 0/15px 15px no-repeat}
.hero h1 svg{display:block;width:158px;height:14px;margin-top:2px}
.hero p{margin:14px 0 0;color:var(--ink2);max-width:60ch;font-size:16px;line-height:1.6;text-wrap:pretty}

/* ---- Tam bang kich ban + khay but */
.board{position:relative;background:var(--board);border:1px solid var(--hair);border-radius:26px;box-shadow:var(--sh3),inset 0 1px 0 rgba(255,255,255,.7);transition:box-shadow .2s,border-color .2s}
.board textarea{display:block;width:100%;min-height:268px;border:0;background:transparent;padding:28px 32px 20px;resize:vertical;font:17px/1.8 var(--ui);outline:none;border-radius:25px 25px 0 0}
.board .try{position:absolute;left:30px;top:156px;border-style:dashed;background:transparent;box-shadow:none;color:var(--ink2)}
.board textarea::placeholder{color:var(--ink3)}
.board:focus-within{border-color:rgba(18,21,29,.38);box-shadow:var(--sh3),var(--ring)}
.tray{display:flex;flex-wrap:wrap;align-items:center;gap:10px;padding:11px 16px;background:var(--tray);border-top:1px solid var(--hair);border-radius:0 0 25px 25px}
.tray .stats{display:flex;gap:7px;flex-wrap:wrap;margin-left:auto;align-items:center}
.tray select{width:auto;min-height:36px;padding:5px 34px 5px 12px;font-weight:600}
.stat{background:var(--board);border:1px solid var(--hair);border-radius:99px;padding:4px 13px;font-weight:700;font-size:13.5px;white-space:nowrap;font-variant-numeric:tabular-nums;box-shadow:var(--sh1)}
.stat b{font-weight:800}
.stat.hl{background:linear-gradient(180deg,#FFE066,#FFC61A);color:var(--on-hl);border-color:rgba(122,86,0,.4);box-shadow:inset 0 1px 0 rgba(255,255,255,.7),0 4px 12px rgba(255,184,0,.35)}
.pens{position:absolute;right:38px;top:-16px;display:flex;gap:9px;align-items:flex-end;transform:rotate(-2deg);filter:drop-shadow(0 5px 5px rgba(18,21,29,.28))}
.pens i{--c:#171A22;display:block;position:relative;width:58px;height:15px;border-radius:9px 5px 5px 9px;transition:transform .2s;
 background:linear-gradient(180deg,rgba(255,255,255,.6) 0,rgba(255,255,255,.08) 38%,rgba(0,0,0,0) 55%,rgba(0,0,0,.32) 100%),var(--c)}
.pens i::before{content:"";position:absolute;left:-8px;top:3px;width:10px;height:9px;background:var(--c);clip-path:polygon(100% 0,0 36%,0 64%,100% 100%)}
.pens i::after{content:"";position:absolute;right:0;top:0;bottom:0;width:17px;border-radius:0 5px 5px 0;background:inherit;filter:brightness(.72)}
.pens i:nth-child(2){--c:#3A62F2}.pens i:nth-child(3){--c:#E5483B}
.pens i:hover{transform:translateY(-5px) rotate(-3deg)}
@media(max-width:560px){.board .try{top:126px}.pens{right:20px}.pens i{width:44px}}

/* ---- Khung (card) chung */
.card>header{display:flex;align-items:center;gap:12px;flex-wrap:wrap;margin-bottom:16px}
.card h2+span,.card header .sub{color:var(--ink2);font-size:13.5px}
.card header .end{margin-left:auto;display:flex;gap:8px;align-items:center;flex-wrap:wrap}

/* ---- Bang phan canh */
.frames{--fw:206px;display:grid;grid-template-columns:repeat(auto-fill,minmax(var(--fw),1fr));gap:20px 16px}
.fr{min-width:0;position:relative}
.fr .th{aspect-ratio:var(--ar);position:relative;border-radius:15px;overflow:hidden;border:1px solid var(--hair);background:linear-gradient(160deg,var(--board),var(--fill));box-shadow:var(--sh1);display:flex;align-items:center;justify-content:center;transition:transform .2s,box-shadow .2s,border-color .2s}
.fr .th::before{content:"";position:absolute;inset:9px;border:1.5px dashed var(--line);border-radius:9px;pointer-events:none}
.fr .th img{position:absolute;inset:0;width:100%;height:100%;object-fit:cover;background:#fff;display:none}
.fr .num{position:absolute;left:8px;top:8px;min-width:24px;height:24px;padding:0 8px;border-radius:99px;background:var(--ink);color:var(--board);font-weight:800;font-size:11.5px;display:flex;align-items:center;justify-content:center;z-index:2;box-shadow:0 2px 6px rgba(18,21,29,.3)}
.fr .big{font:800 40px var(--disp);color:var(--ghost);letter-spacing:-.05em;user-select:none}
.fr .cap{margin:8px 2px 0;font-size:12.5px;line-height:1.45;color:var(--ink2);display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden}
.fr.s-drawing .th{border-color:var(--hl2);background:linear-gradient(110deg,var(--hl-soft) 30%,var(--board) 50%,var(--hl-soft) 70%);background-size:240% 100%;animation:sheen 1.5s linear infinite;box-shadow:0 0 0 3px rgba(255,212,59,.45),var(--sh2)}
.fr.s-drawing .th::before{border-color:var(--hl2)}
.fr.s-drawing .big{color:var(--ink);opacity:.8;animation:bob 1.1s ease-in-out infinite}
.fr.s-done .th{border-color:var(--hair);background:#fff;cursor:pointer}
.fr.s-done .th::before{display:none}
.fr.s-done .th:hover{transform:translateY(-3px);box-shadow:var(--sh3)}
.fr.s-done .th img{display:block}.fr.s-done .big,.fr.s-done .lbl{display:none}
.fr.s-error .th{border-color:var(--red);background:var(--red-soft)}
.fr.s-error .th::before{border-color:var(--red);opacity:.4}
.fr.s-error .big{color:var(--red);opacity:.45}
.fr.s-error .lbl{display:none}
.fr .er{display:none;margin:4px 2px 0;font-size:11.5px;line-height:1.35;color:var(--red);-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden}
.fr.s-error .er{display:-webkit-box}
.fr.s-error .acts{display:flex;background:none;padding:8px}
.fr .acts [data-a=retry]{display:none}
.fr.s-error .acts [data-a=retry]{display:block;background:var(--red);color:#fff;flex:1.3}
.fr.s-error .acts [data-a=redo]{display:none}
.fr .lbl{position:absolute;right:8px;bottom:8px;background:linear-gradient(180deg,#FFE066,#FFC61A);color:var(--on-hl);border-radius:99px;padding:2px 10px;font-weight:750;font-size:11.5px;z-index:2;box-shadow:0 2px 8px rgba(255,184,0,.45)}
.fr.s-pending .lbl{display:none}
.fr.pop .th img{animation:wipe .75s cubic-bezier(.3,.6,.2,1)}
.fr.sh .th::after{content:"dùng chung ảnh với cảnh trên";position:absolute;left:8px;right:8px;bottom:8px;z-index:2;background:var(--board);border:1px solid var(--hair);border-radius:99px;padding:2px 10px;font-weight:700;font-size:11px;text-align:center;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;box-shadow:var(--sh1)}
.fr.sh .big{font-size:24px}.fr.sh:not(.s-done) .th{opacity:.72}.fr.sh.s-done:hover .th::after{display:none}
.fr .pick{position:absolute;right:8px;top:8px;z-index:3;display:none;width:28px;height:28px;border-radius:9px;border:1px solid var(--hair);background:var(--board);align-items:center;justify-content:center;box-shadow:var(--sh1)}
.fr .pick input:checked{background:var(--red);border-color:var(--red)}
.fr .pick input:checked::after{border-color:#fff}
.frames.review .fr.rv .pick{display:flex}
.frames.review .fr.rv.picked .th{outline:3px solid var(--red);outline-offset:2px}
.fr .acts{position:absolute;left:0;right:0;bottom:0;display:none;gap:6px;padding:8px;background:linear-gradient(transparent,rgba(10,12,18,.62));z-index:2}
.fr.s-done:hover .acts,.fr.s-done:focus-within .acts{display:flex}
.frames:not(.drawing) .fr .acts [data-a=redo]{display:none}
.fr .acts button{flex:1;border:0;border-radius:9px;background:rgba(255,255,255,.95);color:#14171F;font-weight:700;font-size:12px;padding:6px 4px;box-shadow:0 1px 3px rgba(0,0,0,.25)}
@keyframes sheen{from{background-position:140% 0}to{background-position:-100% 0}}
@keyframes hatch{to{background-position:26px 0}}
@keyframes bob{50%{transform:translateY(-3px) rotate(-3deg)}}
@keyframes wipe{from{clip-path:inset(0 100% 0 0)}to{clip-path:inset(0 0 0 0)}}
.empty{border:1.5px dashed var(--line);border-radius:18px;padding:38px 20px;text-align:center;color:var(--ink2);background:linear-gradient(180deg,var(--fill),transparent)}
.empty b{display:block;color:var(--ink);font:800 17px var(--disp);margin-bottom:4px}
.rvbar{display:none;align-items:center;gap:10px;flex-wrap:wrap;background:var(--hl-soft);border:1px solid rgba(122,86,0,.3);border-radius:16px;padding:12px 16px;margin-bottom:16px}
.rvbar.on{display:flex}.rvbar b{font-weight:800}.rvbar .end{margin-left:auto;display:flex;gap:8px;flex-wrap:wrap}

/* ---- Tien trinh + ket qua */
.card>header .pct,.pct{font:800 32px/1 var(--disp);letter-spacing:-.04em;margin-left:auto;font-variant-numeric:tabular-nums}
.steps{display:grid;grid-template-columns:repeat(4,1fr);gap:8px;margin:2px 0 16px}
.steps div{display:flex;align-items:center;gap:8px;border:1px solid var(--hair);background:var(--fill);border-radius:13px;padding:9px 11px;color:var(--ink3);font-weight:650;font-size:13.5px;min-width:0}
.steps div span{white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.steps div.on{border-color:rgba(122,86,0,.45);background:linear-gradient(180deg,#FFE066,#FFC61A);color:var(--on-hl);box-shadow:inset 0 1px 0 rgba(255,255,255,.7),0 6px 14px rgba(255,184,0,.3)}
.steps div.ok{border-color:transparent;color:var(--green);background:var(--green-soft)}
@media(max-width:620px){.steps{grid-template-columns:repeat(2,1fr)}}
.track{height:14px;border-radius:99px;border:1px solid var(--hair);background:var(--fill2);overflow:hidden}
.track i{display:block;height:100%;width:0;border-radius:99px;transition:width .5s;
 background:repeating-linear-gradient(135deg,rgba(18,21,29,.10) 0 6px,transparent 6px 12px),linear-gradient(180deg,#FFE066,#FFB800);background-size:17px 17px,auto;box-shadow:0 0 14px rgba(255,184,0,.55)}
.track.run i{animation:hatch .9s linear infinite}
.msg{margin:12px 0 0;font-weight:600}
.fail{display:none;margin-top:14px;border:1px solid var(--red);background:var(--red-soft);border-radius:16px;padding:13px 16px}
.fail b{color:var(--red)}.fail pre{white-space:pre-wrap;margin:6px 0 10px;font:12.5px/1.45 var(--mono);color:var(--ink);max-height:140px;overflow:auto}
.fail .row{display:flex;gap:8px;flex-wrap:wrap}
details.log{margin-top:14px}
#log{margin:8px 0 0;background:var(--fill);border:1px solid var(--hair2);border-radius:14px;padding:11px 13px;height:150px;overflow:auto;font:12.5px/1.5 var(--mono);color:var(--ink2);white-space:pre-wrap}
.result{display:none;margin-top:18px;border-top:1px dashed var(--line);padding-top:18px}
.result video{width:100%;max-height:520px;border-radius:16px;background:#000;border:1px solid var(--hair);box-shadow:var(--sh3);display:block}
.result .row{display:flex;gap:8px;margin-top:14px;flex-wrap:wrap}

/* ---- Cot cai dat (ben phai) */
.rail{min-width:0;max-width:100%;position:sticky;top:80px;max-height:calc(100vh - 80px - 112px);display:flex;flex-direction:column;background:var(--board);border:1px solid var(--hair);border-radius:24px;box-shadow:var(--sh2);overflow:hidden}
@media(max-width:1080px){.rail{position:static;max-height:none}}
.rtabs{display:grid;grid-template-columns:repeat(4,1fr);gap:4px;padding:8px;border-bottom:1px solid var(--hair2);background:var(--fill)}
.rtabs button{min-width:0;position:relative;border:0;background:transparent;border-radius:13px;padding:9px 4px 8px;font-weight:700;font-size:13.5px;color:var(--ink2);display:flex;flex-direction:column;align-items:center;gap:4px;transition:background .15s,color .15s,box-shadow .15s}
.rtabs button:hover{color:var(--ink);background:var(--board)}
.rtabs button[aria-selected=true]{background:var(--ink);color:var(--board);box-shadow:0 6px 14px rgba(18,21,29,.28)}
.rtabs .dot{position:absolute;top:6px;right:9px;width:9px;height:9px;border-radius:50%;background:var(--red);display:none;border:2px solid var(--fill)}
.rtabs .dot.on{display:block}
.rbody{overflow:auto;padding:20px 20px 24px;scrollbar-width:thin;min-height:0;flex:1}
.pane{display:none}.pane.on{display:block}
.pane h3{margin:26px 0 10px;padding-top:20px;border-top:1px solid var(--hair2);font:800 13.5px/1.3 var(--disp);color:var(--ink);letter-spacing:0;display:flex;align-items:baseline;gap:8px}
.pane>h3:first-child{margin-top:0;padding-top:0;border-top:0}
.pane h3 small{font:500 12.5px var(--ui);color:var(--ink2)}
.f{margin-top:14px}.f>label,.f>.lab{display:flex;justify-content:space-between;align-items:baseline;font-weight:650;font-size:13.5px;margin-bottom:3px}
.f>label output,.f .lab output{font-weight:800;font-variant-numeric:tabular-nums}
.two{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px}
.three{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:10px}
.line{display:flex;gap:8px;align-items:center}
.box{border:1px solid var(--hair);border-radius:16px;padding:13px 14px;background:var(--fill)}
.volrow{display:flex;align-items:center;gap:8px}.volrow input{flex:1;min-width:0}.volrow .btn{min-width:34px;padding:4px 0;font-size:18px;line-height:1;justify-content:center}

#dirSeg{display:grid;grid-template-columns:repeat(4,1fr)}
#dirSeg button:first-child{grid-column:1/-1}

/* o chon mau prompt */
.tpls{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:9px}
.tpl{display:flex;flex-direction:column;gap:7px;text-align:left;border:1px solid var(--hair);border-radius:16px;padding:9px 10px 11px;background:var(--board);min-width:0;position:relative;box-shadow:var(--sh1);transition:transform .15s,box-shadow .15s,border-color .15s}
.tpl:hover{border-color:var(--ink3);box-shadow:var(--sh2);transform:translateY(-1px)}
.tpl svg{width:100%;height:48px;display:block;background:linear-gradient(160deg,var(--fill),var(--fill2));border-radius:10px;stroke:var(--ink);fill:none;stroke-width:2;stroke-linecap:round;stroke-linejoin:round}
.tpl b{font-size:13px;line-height:1.25;font-weight:750}
.tpl small{font-size:11.5px;color:var(--ink2);line-height:1.3;display:block;margin-top:-3px}
.tpl[aria-checked=true]{border-color:var(--ink);background:linear-gradient(180deg,var(--hl-soft),var(--board) 80%);box-shadow:0 0 0 1px var(--ink),var(--sh2)}
.tpl[aria-checked=true]::after{content:"";position:absolute;right:9px;top:9px;width:20px;height:20px;border-radius:50%;background:var(--ink);box-shadow:0 2px 6px rgba(18,21,29,.3)}
.tpl[aria-checked=true]::before{content:"";position:absolute;right:15px;top:14px;width:4px;height:8px;border:solid var(--board);border-width:0 2px 2px 0;transform:rotate(45deg);z-index:1}
.ptext{width:100%;min-height:210px;resize:vertical;background:var(--fill);border:1px solid var(--line);border-radius:14px;padding:11px 13px;font:12.5px/1.5 var(--mono);margin-top:8px}

/* anh tham chieu */
.drop{border:1.5px dashed var(--ink3);border-radius:16px;padding:14px;display:flex;gap:12px;align-items:center;background:var(--fill);transition:border-color .15s,background .15s}
.drop.over{border-color:var(--ink);background:var(--hl-soft)}
.drop .thumb{width:84px;height:84px;border-radius:12px;border:1px solid var(--hair);background:#fff;object-fit:contain;flex:none;box-shadow:var(--sh1)}
.drop .txt{min-width:0;flex:1}.drop .txt b{display:block;font-size:13.5px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.drop .txt small{color:var(--ink2);font-size:12.5px;display:block;line-height:1.4}
.drop .ic{width:46px;height:46px;border-radius:13px;background:var(--board);border:1px solid var(--hair);display:flex;align-items:center;justify-content:center;color:var(--ink2);flex:none;box-shadow:var(--sh1)}
.drop .line{margin-top:8px;flex-wrap:wrap}
.refoff{opacity:.5}

/* hieu ung ve ra */
.fxv{position:relative;aspect-ratio:16/9;border-radius:16px;overflow:hidden;border:1px solid var(--hair);background:#fff;box-shadow:var(--sh2)}
.fxv img{width:100%;height:100%;object-fit:cover;display:block}
.fxv.load::after{content:"";position:absolute;inset:0;background:linear-gradient(100deg,transparent 30%,rgba(255,216,58,.45) 50%,transparent 70%);background-size:220% 100%;animation:shine 1.1s linear infinite}
.fxv .cap{position:absolute;left:10px;bottom:10px;background:var(--board);border:1px solid var(--hair);border-radius:99px;padding:2px 11px;font-size:12px;font-weight:700;box-shadow:var(--sh1)}
@keyframes shine{from{background-position:130% 0}to{background-position:-90% 0}}
.fxs{display:flex;flex-wrap:wrap;gap:6px;margin-top:12px}
.fxs button{border:1px solid var(--line);background:var(--board);border-radius:99px;padding:5px 12px;font-size:13px;font-weight:650;transition:background .15s,border-color .15s,color .15s}
.fxs button:hover{border-color:var(--ink3)}
.fxs button[aria-checked=true]{background:var(--ink);color:var(--board);border-color:var(--ink);box-shadow:0 3px 8px rgba(18,21,29,.25)}
.props{display:grid;gap:8px;margin-top:10px}
.prop{display:flex;gap:10px;align-items:center;border:1px solid var(--hair);border-radius:14px;padding:9px;background:var(--board)}
.prop .pv{width:54px;height:54px;border-radius:10px;border:1px solid var(--hair);flex:none;display:flex;align-items:center;justify-content:center;overflow:hidden;font-size:11px;color:var(--ink2);text-align:center;
 background:repeating-conic-gradient(var(--fill) 0 25%,var(--board) 0 50%) 0 0/12px 12px}
.prop .pv img{max-width:100%;max-height:100%}
.prop .pt{flex:1;min-width:0;font-size:13px}.prop .pt b{display:block}.prop .pt small{color:var(--ink2);font-size:12px;display:block;line-height:1.3}
.prop .bt{display:flex;flex-direction:column;gap:4px}

/* may ve */
.eng{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:9px}
.engc{text-align:left;border:1px solid var(--hair);border-radius:16px;padding:12px 13px;background:var(--board);display:flex;flex-direction:column;gap:3px;box-shadow:var(--sh1);transition:transform .15s,box-shadow .15s,border-color .15s}
.engc:hover{border-color:var(--ink3);box-shadow:var(--sh2);transform:translateY(-1px)}
.engc.engw{grid-column:1/-1}
.engc b{font-size:14.5px}.engc small{color:var(--ink2);font-size:12.5px;line-height:1.4}
.engc[aria-checked=true]{border-color:var(--ink);background:linear-gradient(180deg,var(--hl-soft),var(--board) 85%);box-shadow:0 0 0 1px var(--ink),var(--sh2)}

/* phu de: xem truoc */
.sp{position:relative;aspect-ratio:var(--ar);border-radius:16px;overflow:hidden;border:1px solid var(--hair);margin:0 auto;max-width:100%;box-shadow:var(--sh2);
 background:linear-gradient(160deg,#cfd6e2,#8e9ab0 55%,#5c6880)}
.sp[data-a="9:16"]{width:170px}
.sp .t{position:absolute;left:50%;transform:translateX(-50%);text-align:center;white-space:pre-wrap;line-height:1.25;width:86%;font-weight:700;cursor:grab;touch-action:none;user-select:none}
.sp .t.drag{cursor:grabbing}
.sp .t span{display:inline;padding:.05em .35em;-webkit-box-decoration-break:clone;box-decoration-break:clone}

/* thanh tac vu (noi o day cho tien) */
.dock{position:fixed;left:50%;transform:translateX(-50%);bottom:16px;width:min(980px,calc(100% - 24px));background:rgba(18,21,29,.86);color:var(--dock-fg);border:1px solid rgba(255,255,255,.10);border-radius:26px;padding:11px 12px 11px 22px;
 -webkit-backdrop-filter:blur(18px) saturate(1.5);backdrop-filter:blur(18px) saturate(1.5);display:flex;align-items:center;gap:16px;z-index:20;box-shadow:0 20px 50px rgba(8,10,16,.42),inset 0 1px 0 rgba(255,255,255,.08)}
.dock .sum{flex:1;min-width:0}
.dock .l1{font:700 15.5px var(--disp);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.dock .l2{font-size:12.5px;color:var(--dock-mut);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;margin-top:2px}
.dock .l2.warn{color:var(--hl)}
.dock .mini{height:7px;border-radius:99px;background:rgba(255,255,255,.16);margin-top:8px;overflow:hidden}
.dock .mini i{display:block;height:100%;background:linear-gradient(90deg,#FFD43B,#FFB800);width:0;transition:width .5s;border-radius:99px;box-shadow:0 0 12px rgba(255,184,0,.6)}
.dock .btn{font-size:16px;padding:12px 24px;border-radius:16px}
.dock .btn.hl{box-shadow:inset 0 1px 0 rgba(255,255,255,.75),0 8px 26px rgba(255,184,0,.42)}
.dock .btn.hl:hover:not(:disabled){box-shadow:inset 0 1px 0 rgba(255,255,255,.75),0 12px 32px rgba(255,184,0,.55)}
.dock .btn.hl:disabled{background:rgba(255,255,255,.12);color:var(--dock-mut);border-color:transparent;box-shadow:none}
.dock .btn.red{box-shadow:0 8px 22px rgba(229,72,59,.4)}
@media(max-width:560px){.dock{padding:10px 10px 10px 16px;gap:10px;bottom:10px}.dock .btn{padding:10px 16px;font-size:15px}}

/* hop thoai chi tiet canh */
dialog{border:1px solid var(--hair);border-radius:26px;padding:0;background:var(--board);color:var(--ink);width:min(1040px,calc(100% - 24px));max-height:calc(100vh - 32px);overflow:auto;box-shadow:0 24px 80px rgba(10,14,22,.5)}
dialog::backdrop{background:rgba(10,14,22,.55);-webkit-backdrop-filter:blur(5px);backdrop-filter:blur(5px)}
.dg{display:grid;grid-template-columns:minmax(0,1.25fr) minmax(0,1fr);gap:0}
@media(max-width:820px){.dg{grid-template-columns:1fr}}
.dg .im{background:var(--fill);padding:20px;display:flex;align-items:center;justify-content:center;border-right:1px solid var(--hair2)}
.dg .im img{max-width:100%;max-height:70vh;border-radius:14px;border:1px solid var(--hair);background:#fff;display:block;box-shadow:var(--sh2)}
.dg .in{padding:22px 24px;display:flex;flex-direction:column;gap:10px;min-width:0}
.dg .in h3{margin:0;font:800 21px var(--disp);letter-spacing:-.02em}
.dg .in p{margin:0;color:var(--ink2)}
.dg textarea{width:100%;min-height:200px;resize:vertical;background:var(--fill);border:1px solid var(--line);border-radius:14px;padding:11px 13px;font:12.5px/1.5 var(--mono)}
.dg .row{display:flex;gap:8px;flex-wrap:wrap}

/* danh sach du an */
.proj{display:flex;gap:12px;align-items:center;flex-wrap:wrap;border:1px solid var(--hair);border-radius:16px;padding:12px 15px;margin-top:9px;background:var(--board);box-shadow:var(--sh1);transition:box-shadow .15s,border-color .15s}
.proj:hover{box-shadow:var(--sh2);border-color:var(--line)}
.proj .pi{flex:1;min-width:200px}.proj b{display:block;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;max-width:46ch}
.proj small{color:var(--ink2);font-size:12.5px}
.proj .row{display:flex;gap:6px;flex-wrap:wrap}
'''.replace("__STAR_Y__", uikit.STAR.replace("{c}", "FFB800")).replace("__STAR_B__", uikit.STAR.replace("{c}", "3A62F2"))


HTML = r'''
<header class="bar"><div>
  <div class="brand"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 20l4-1 11-11a2.1 2.1 0 0 0-3-3L5 16l-1 4z"/><path d="M14 7l3 3"/></svg><span>AnimStudio <small id="ver"></small></span></div>
  __TABS__
</div></header>

<div class="wrap">
 <div class="main">
  <section id="secScript">
   <div class="hero">
    <h1>Vẽ ra<svg viewBox="0 0 150 14" preserveAspectRatio="none"><path d="M3 9c14-8 22 6 36-1s22 5 36-1 22 5 36-1 22 3 33-2" fill="none" stroke="var(--hl)" stroke-width="7" stroke-linecap="round"/></svg></h1>
    <p>Dán truyện hoặc kịch bản vào bảng. Tool tự nhận ra lời dẫn, nhân vật và thoại, chia thành các cảnh cho AI vẽ tay, rồi ghép video có giọng đọc và phụ đề.</p>
   </div>
   <div class="board" style="margin-top:20px">
    <textarea id="text" spellcheck="false" placeholder="Dán truyện hoặc kịch bản vào đây…&#10;Không cần chia cảnh, tool tự nhận diện và đếm số cảnh."></textarea>
    <div class="tray">
     <select id="lang" aria-label="Ngôn ngữ">__LANGOPTS__</select>
     <button class="btn sm" id="bPaste" type="button"><svg class="i" viewBox="0 0 24 24"><rect x="6" y="5" width="12" height="16" rx="2"/><path d="M9 5V4h6v1"/></svg>Dán</button>
     <button class="btn sm" id="bClear" type="button"><svg class="i" viewBox="0 0 24 24"><path d="M5 7h14M10 7V5h4v2m-7 0l1 12h8l1-12"/></svg>Xóa</button>
     <div class="stats" id="stats"></div>
    </div>
    <button class="btn sm try" id="bSample" type="button">Thử với đoạn mẫu</button>
    <div class="pens" aria-hidden="true"><i></i><i></i><i></i></div>
   </div>
  </section>

  <section class="card" id="secRun" style="display:none">
   <header><h2 id="runTitle">Đang dựng video</h2><span class="sub" id="runSub"></span><div class="pct" id="runPct">0%</div></header>
   <div class="steps" id="steps"></div>
   <div class="track" id="track"><i id="trackI"></i></div>
   <p class="msg" id="msg"></p>
   <div class="fail" id="failbox"><b id="failwhat"></b><pre id="failerr"></pre><p class="note" id="failhint" style="display:none;margin:6px 0 8px">Cảnh nào lỗi sẽ có nút <b>Tạo lại</b> ngay trên khung ở bảng phân cảnh. Bấm <b>Tạo lại</b> ở một khung lỗi (hoặc nút bên dưới) là gửi lại <b>tất cả</b> cảnh lỗi cùng lúc, mỗi cảnh đúng prompt của nó, không phải bấm từng cái.</p><div class="row"><button class="btn" id="failretry" type="button"></button><button class="btn" id="failskip" type="button"></button></div></div>
   <p class="err" id="err"></p>
   <div class="result" id="result">
    <video id="vid" controls playsinline></video>
    <div class="row"><a class="btn hl" id="dl" href="#" download>Tải video</a><button class="btn" id="bFolder" type="button"><svg class="i" viewBox="0 0 24 24"><path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/></svg>Mở thư mục</button></div>
   </div>
   <details class="log"><summary>Nhật ký</summary><div id="log"></div></details>
  </section>

  <section class="card" id="secBoard">
   <header><h2>Bảng phân cảnh</h2><span class="sub" id="boardSub"></span>
    <div class="end"><span class="hint">Cỡ ảnh</span><div class="seg" id="sizeSeg" role="radiogroup" aria-label="Cỡ ảnh" style="width:118px"><button type="button" role="radio" data-v="150">S</button><button type="button" role="radio" data-v="206">M</button><button type="button" role="radio" data-v="300">L</button></div></div>
   </header>
   <div class="rvbar" id="rvbar"><b>Chờ bạn duyệt ảnh.</b><span id="rvmsg" class="hint"></span>
    <div class="end"><button class="btn" id="rvredo" type="button" disabled>Vẽ lại ảnh đã chọn</button><button class="btn hl" id="rvok" type="button">Hoàn thành video</button></div></div>
   <div class="frames" id="frames"></div>
  </section>

  <section class="card" id="secProj" style="display:none">
   <header><h2>Dự án gần đây</h2><span class="sub">Làm tiếp phần dang dở, không vẽ lại ảnh đã có.</span></header>
   <div id="projlist"></div>
  </section>
 </div>

 <aside class="rail" aria-label="Cài đặt">
  <div class="rtabs" role="tablist" id="rtabs">
   <button role="tab" type="button" data-p="pStyle" aria-selected="true"><svg class="i" viewBox="0 0 24 24"><path d="M4 20l4-1 11-11a2.1 2.1 0 0 0-3-3L5 16l-1 4z"/><path d="M14 7l3 3"/></svg>Kiểu vẽ</button>
   <button role="tab" type="button" data-p="pVoice" aria-selected="false"><svg class="i" viewBox="0 0 24 24"><path d="M4 10v4h4l5 4V6L8 10z"/><path d="M16 9a4 4 0 0 1 0 6m2-9a8 8 0 0 1 0 12"/></svg>Giọng đọc</button>
   <button role="tab" type="button" data-p="pSub" aria-selected="false"><svg class="i" viewBox="0 0 24 24"><rect x="3" y="5" width="18" height="14" rx="3"/><path d="M7 14h5m3 0h2M7 10h2m3 0h5"/></svg>Phụ đề</button>
   <button role="tab" type="button" data-p="pEng" aria-selected="false"><svg class="i" viewBox="0 0 24 24"><rect x="3" y="4" width="18" height="16" rx="3"/><circle cx="9" cy="10" r="1.6"/><path d="M4 18l5-5 4 4 3-3 4 4"/></svg>Máy vẽ</button>
  </div>
  <div class="rbody">

   <!-- KIEU VE -->
   <div class="pane on" id="pStyle">
    <h3>Khung hình và chất lượng</h3>
    <div class="seg" id="aspectSeg" role="radiogroup" aria-label="Khung hình"><button type="button" role="radio" data-v="16:9">Ngang 16:9</button><button type="button" role="radio" data-v="9:16">Dọc 9:16</button></div>
    <div class="two" style="margin-top:10px">
     <div><div class="seg" id="resSeg" role="radiogroup" aria-label="Độ phân giải"><button type="button" role="radio" data-v="480p">480p</button><button type="button" role="radio" data-v="720p">720p</button><button type="button" role="radio" data-v="1080p">1080p</button></div></div>
     <div><div class="seg" id="fpsSeg" role="radiogroup" aria-label="Số khung hình mỗi giây"><button type="button" role="radio" data-v="24">24 fps</button><button type="button" role="radio" data-v="30">30 fps</button></div></div>
    </div>

    <h3>Mẫu prompt <small>kiểu hình AI sẽ vẽ</small></h3>
    <div class="tpls" id="tpls" role="radiogroup" aria-label="Mẫu prompt"></div>
    <details id="pbox" style="margin-top:12px" open>
     <summary>Prompt chung cho mọi cảnh <span class="chip" id="pedited" style="display:none">đã sửa</span><span class="hint" id="plen" style="margin-left:auto;font-weight:500"></span></summary>
     <textarea class="ptext" id="ptext" spellcheck="false"></textarea>
     <div class="line" style="margin-top:8px"><button class="btn sm" id="pPaste" type="button">Dán prompt</button><button class="btn sm" id="pReset" type="button">Về mẫu gốc</button></div>
     <p class="note">Mỗi cảnh gửi cho AI: prompt này, rồi lời của cảnh (CURRENT SCENE) và lời của cảnh kế tiếp (NEXT SCENE). Bạn có thể sửa thoải mái.</p>
    </details>

    <h3>Ảnh tham chiếu <small>giữ nhân vật và nét vẽ giống nhau</small></h3>
    <label class="sw"><input type="checkbox" id="useref"><span>Dùng ảnh tham chiếu cho mọi cảnh<small>Ảnh được gửi kèm từng cảnh. AI vẽ nhân vật giống ảnh, không chép lại bố cục.</small></span></label>
    <label class="sw" style="margin-top:8px"><input type="checkbox" id="reflax"><span>Vẫn vẽ khi không đính được ảnh tham chiếu<small>Mặc định TẮT: không đính được ảnh thì dừng và báo lỗi, không vẽ nhầm nhân vật. Chỉ bật nếu tool báo lỗi dù ảnh đã nằm trong khung soạn của Flow.</small></span></label>
    <div class="drop" id="drop" style="margin-top:10px">
     <div class="ic" id="dropIc"><svg class="i" viewBox="0 0 24 24" style="width:24px;height:24px"><path d="M12 16V5m0 0l-4 4m4-4l4 4M5 19h14"/></svg></div>
     <img class="thumb" id="refThumb" alt="Ảnh tham chiếu" style="display:none">
     <div class="txt"><b id="refName">Chưa có ảnh</b><small id="refInfo">Kéo ảnh vào đây hoặc bấm Chọn ảnh. PNG, JPG, WebP.</small>
      <div class="line"><button class="btn sm" id="refPick" type="button">Chọn ảnh</button><button class="btn sm ghost" id="refDel" type="button" style="display:none">Bỏ ảnh</button></div></div>
    </div>
    <input type="file" id="refFile" accept="image/*" class="sr">

    <h3>Hiệu ứng vẽ ra <small>cách mỗi ảnh hiện lên</small></h3>
    <div class="fxv load" id="fxv"><img id="fxprev" alt="Xem thử hiệu ứng"><span class="cap" id="fxcap"></span></div>
    <div class="fxs" id="fxs" role="radiogroup" aria-label="Hiệu ứng"></div>
    <p class="note" id="fxHint"></p>
    <div class="f"><label id="dirLbl">Hướng mở ảnh</label>
     <div class="seg" id="dirSeg" role="radiogroup" aria-labelledby="dirLbl"><button type="button" role="radio" data-v="auto">Tự động</button><button type="button" role="radio" data-v="lr">Trái → phải</button><button type="button" role="radio" data-v="rl">Phải → trái</button><button type="button" role="radio" data-v="tb">Trên → dưới</button><button type="button" role="radio" data-v="bt">Dưới → lên</button></div>
     <p class="note" id="dirHint"></p></div>
    <label class="sw" style="margin-top:12px"><input type="checkbox" id="revauto"><span>Tốc độ vẽ tự động theo độ dài câu<small>Câu dài vẽ chậm, câu ngắn vẽ nhanh. Tắt đi nếu muốn tự đặt số giây.</small></span></label>
    <div class="f" id="revdurWrap" hidden><label for="revdur">Thời gian vẽ mỗi ảnh <output id="revdurv">1.6 giây</output></label><input type="range" id="revdur" min="0.5" max="4" step="0.1" value="1.6"></div>
    <details style="margin-top:14px"><summary>Hình minh họa cho hiệu ứng (bàn tay, cậu bé, cuộn tranh, cọ)</summary>
     <p class="note">Tool có hình mặc định. Hình nào thiếu sẽ tự nhờ AI vẽ một lần rồi dùng lại. Bạn cũng có thể vẽ lại hoặc dùng ảnh của mình (PNG xóa nền, hoặc nền xanh lá / trắng trơn).</p>
     <div class="props" id="proplist"></div>
     <div class="line" style="margin-top:10px"><button class="btn sm" id="propall" type="button">Vẽ các hình còn thiếu bằng AI</button><span class="hint" id="propmsg"></span></div>
    </details>
   </div>

   <!-- GIONG DOC -->
   <div class="pane" id="pVoice">
    <h3>Giọng đọc</h3>
    <div class="f" style="margin-top:0"><select id="narr" aria-label="Giọng đọc"></select></div>
    <div class="line" style="margin-top:10px"><button class="btn" id="vTest" type="button"><svg class="i" viewBox="0 0 24 24"><path d="M4 10v4h4l5 4V6L8 10z"/><path d="M16 9a4 4 0 0 1 0 6"/></svg>Nghe thử</button><span class="hint" id="vMsg"></span></div>
    <audio id="vAud" controls style="width:100%;margin-top:10px;display:none"></audio>
    <div class="f"><label for="speed">Tốc độ đọc <output id="speedv">1.0×</output></label><input type="range" id="speed" min="0.7" max="1.5" step="0.05" value="1"></div>
    <div class="f"><label for="vol">Âm lượng giọng đọc <output id="volv">100%</output></label><div class="volrow"><button class="btn sm ghost" id="volDn" type="button" aria-label="Giảm âm lượng">−</button><input type="range" id="vol" min="0" max="200" step="5" value="100"><button class="btn sm ghost" id="volUp" type="button" aria-label="Tăng âm lượng">+</button></div><p class="note">100% là giữ nguyên giọng. Kéo lên để to hơn, xuống để nhỏ hơn. Bấm «Nghe thử» để nghe ngay.</p></div>
    <h3>Âm thanh</h3>
    <label class="sw"><input type="checkbox" id="music"><span>Nhạc nền nhẹ<small>Tự nhỏ đi khi giọng đọc.</small></span></label>
    <details style="margin-top:18px" id="azbox"><summary>Giọng Azure (cần key Azure Speech)</summary>
     <div class="f"><label for="azkey">Key Azure Speech</label><input type="password" id="azkey" autocomplete="off" placeholder="dán key"></div>
     <div class="f"><label for="azregion">Vùng (region)</label><input type="text" id="azregion" placeholder="southeastasia"></div>
     <div class="line" style="margin-top:10px"><button class="btn sm" id="azTest" type="button">Kiểm tra và lưu</button><button class="btn sm ghost" id="azClear" type="button">Xóa key</button></div>
     <p class="note" id="azStat"></p>
    </details>
    <details style="margin-top:18px" id="clonebox"><summary>Nhân bản giọng (từ file mẫu của bạn)</summary>
     <p class="note">Chọn file ghi âm giọng 6–15 giây (một người nói rõ, không nhạc nền; .wav .mp3 .m4a…). Tool đọc theo giọng đó bằng VieNeu chạy trên máy bạn, chỉ đọc tiếng Việt. Lần đầu dùng sẽ tải model nên hơi lâu.</p>
     <div class="f"><label for="cloneName">Tên giọng</label><input type="text" id="cloneName" maxlength="40" placeholder="Ví dụ: Giọng của tôi" autocomplete="off"></div>
     <div class="f"><label for="cloneFile">File mẫu</label><input type="file" id="cloneFile" accept="audio/*,.wav,.mp3,.m4a,.aac,.ogg,.flac"></div>
     <label class="sw" style="margin-top:12px"><input type="checkbox" id="cloneOk"><span>Đây là giọng của tôi hoặc của người đã đồng ý<small>Chỉ nhân bản giọng khi bạn có quyền. Không dùng để mạo danh người khác.</small></span></label>
     <div class="line" style="margin-top:10px"><button class="btn sm" id="cloneAdd" type="button">Nhân bản giọng</button><span class="hint" id="cloneStat"></span></div>
     <div class="note" id="cloneList"></div>
    </details>
   </div>

   <!-- PHU DE -->
   <div class="pane" id="pSub">
    <h3>Phụ đề <small>tự khớp theo giọng đọc</small></h3>
    <label class="sw"><input type="checkbox" id="subs"><span>Chèn phụ đề vào video<small>Mỗi câu hiện đúng lúc được đọc, tự ngắt dòng cho vừa khung.</small></span></label>
    <label class="sw" style="margin-top:12px"><input type="checkbox" id="srt"><span>Xuất kèm file .srt<small>Dùng cho YouTube hoặc CapCut.</small></span></label>
    <div id="subOpts">
    <h3>Xem trước</h3>
    <div class="sp" id="sp" data-a="16:9"><div class="t" id="spt"><span>Đây là phụ đề mẫu của video</span></div></div>
    <h3>Kiểu chữ</h3>
    <div class="f" style="margin-top:0"><label for="sFont">Font chữ</label><select id="sFont"></select>
     <p class="note" id="sFontNote"></p></div>
    <div class="two f">
     <div><div class="lab">Vị trí</div><div class="seg" id="sPos" role="radiogroup" aria-label="Vị trí"><button type="button" role="radio" data-v="top">Trên</button><button type="button" role="radio" data-v="middle">Giữa</button><button type="button" role="radio" data-v="bottom">Dưới</button><button type="button" role="radio" data-v="custom">Tùy ý</button></div></div>
     <div><div class="lab">Độ đậm</div><div class="seg" id="sWeight" role="radiogroup" aria-label="Độ đậm"><button type="button" role="radio" data-v="bold">Đậm</button><button type="button" role="radio" data-v="regular">Thường</button></div></div>
    </div>
    <p class="note" id="sPosHint" style="margin-top:-4px">Muốn đặt chỗ nào cũng được: kéo chữ mẫu trong khung xem trước tới vị trí bạn muốn (tự chuyển sang «Tùy ý»).</p>
    <div class="two f" id="sPosFree" style="display:none">
     <div><label for="sPx">Ngang <output id="sPxv">50</output>%</label><input type="range" id="sPx" min="3" max="97" step="1" value="50"></div>
     <div><label for="sPy">Dọc <output id="sPyv">88</output>%</label><input type="range" id="sPy" min="3" max="97" step="1" value="88"></div>
    </div>
    <div class="f"><label for="sSize">Cỡ chữ <output id="sSizev">37</output></label><input type="range" id="sSize" min="20" max="80" step="1" value="37"></div>
    <div class="two f">
     <div><div class="lab">Màu chữ</div><input type="color" id="sColor" value="#ffffff"></div>
     <div><div class="lab">Màu viền</div><input type="color" id="sScolor" value="#0a0a10"></div>
    </div>
    <div class="f"><label for="sSw">Độ dày viền <output id="sSwv">3</output></label><input type="range" id="sSw" min="0" max="10" step="1" value="3"></div>
    <label class="sw" style="margin-top:14px"><input type="checkbox" id="sBg"><span>Nền sau chữ</span></label>
    <div class="two f" id="sBgOpts" style="margin-top:8px">
     <div><div class="lab">Màu nền</div><input type="color" id="sBgcolor" value="#000000"></div>
     <div><label class="sw" style="margin-top:22px"><input type="checkbox" id="sRound"><span>Bo tròn góc</span></label></div>
    </div>
    <div class="line" style="margin-top:16px"><button class="btn sm" id="sReset" type="button">Về mặc định</button></div>
    </div>
   </div>

   <!-- MAY VE -->
   <div class="pane" id="pEng">
    <h3>Công cụ vẽ ảnh</h3>
    <div class="eng" id="engSeg" role="radiogroup" aria-label="Công cụ vẽ ảnh">
     <button type="button" class="engc" role="radio" data-v="flow"><b>Google Flow</b><small>Vẽ bằng Flow (Nano Banana), đăng nhập Google một lần.</small></button>
     <button type="button" class="engc" role="radio" data-v="gemini"><b>Gemini</b><small>Vẽ bằng tab Gemini trong trình duyệt, tài khoản Google của bạn. Không cần API key.</small></button>
     <button type="button" class="engc engw" role="radio" data-v="chatgpt"><b>ChatGPT</b><small>Vẽ bằng tab chatgpt.com trong trình duyệt, tài khoản ChatGPT của bạn (cần gói có tạo ảnh). Không cần API key.</small></button>
    </div>

    <div id="engFlow">
     <div class="box" style="margin-top:12px">
      <div class="line" style="justify-content:space-between"><b id="engTitle">Google Flow</b><span class="pill off" id="fpill">chưa mở</span></div>
      <div class="f"><label for="browser">Trình duyệt</label><select id="browser"></select></div>
      <div class="line" style="margin-top:10px;flex-wrap:wrap"><button class="btn" id="login" type="button">Mở trình duyệt và đăng nhập</button></div>
      <p class="note" id="fmsg"></p>
      <div class="f"><label for="flowtabs">Số tab vẽ song song (3–4 tab nhanh nhất)</label><select id="flowtabs"><option value="1">1 tab</option><option value="2">2 tab</option><option value="3">3 tab</option><option value="4">4 tab</option></select></div>
      <div class="line" style="margin-top:8px"><button class="btn sm" id="opentabs" type="button">Mở sẵn các tab</button><span class="hint" id="tabstat"></span></div>
      <label class="sw" style="margin-top:12px"><input type="checkbox" id="hideflow"><span>Ẩn cửa sổ trình duyệt khi chạy<small>Cửa sổ chạy ngầm ngoài màn hình. Tắt nếu Chrome bị đứng.</small></span></label>
     </div>
    </div>
    <h3>Cách chạy</h3>
    <div class="eng" id="modeSeg" role="radiogroup" aria-label="Cách chạy">
     <button type="button" class="engc" role="radio" data-v="quick"><b>Chạy một mạch</b><small>Vẽ xong là dựng video luôn.</small></button>
     <button type="button" class="engc" role="radio" data-v="studio"><b>Duyệt ảnh trước</b><small>Dừng lại cho bạn xem, vẽ lại ảnh lỗi rồi mới dựng.</small></button>
    </div>
   </div>

  </div>
 </aside>
</div>

<div class="dock" id="dock">
 <div class="sum"><div class="l1" id="dl1">Dán truyện hoặc kịch bản để bắt đầu</div><div class="l2" id="dl2"></div><div class="mini" id="dmini" style="display:none"><i id="dminiI"></i></div></div>
 <button class="btn red" id="stop" type="button" style="display:none"><svg class="i" viewBox="0 0 24 24"><rect x="6" y="6" width="12" height="12" rx="2" fill="currentColor"/></svg>Dừng</button>
 <button class="btn sm ghost" id="goNew" type="button" style="display:none">Vẽ lại từ đầu</button>
 <button class="btn hl" id="go" type="button"><svg class="i" viewBox="0 0 24 24"><path d="M7 5l12 7-12 7z" fill="currentColor"/></svg><span id="goTxt">Bắt đầu vẽ</span></button>
</div>

<dialog id="dlg"><div class="dg"><div class="im"><img id="dImg" alt=""></div><div class="in">
 <div class="line" style="justify-content:space-between"><h3 id="dTitle">Cảnh</h3><button class="btn sm ghost" id="dClose" type="button" aria-label="Đóng"><svg class="i" viewBox="0 0 24 24"><path d="M6 6l12 12M18 6L6 18"/></svg></button></div>
 <p id="dText"></p>
 <div class="lab" style="font-weight:700;font-size:13.5px">Prompt gửi cho AI <span class="chip" id="dEdited" style="display:none">đã sửa</span></div>
 <textarea id="dPrompt" spellcheck="false"></textarea>
 <div class="row"><button class="btn hl" id="dRedo" type="button">Vẽ lại với prompt này</button><button class="btn" id="dRep" type="button">Thay bằng ảnh của tôi</button><a class="btn" id="dDl" href="#" download>Tải ảnh</a></div>
 <p class="note" id="dNote"></p>
 <input type="file" id="dFile" accept="image/*" class="sr">
</div></div></dialog>
'''


def _lang_options():
    from . import langs
    return langs.options_html()


def build(tabs_html):
    """HTML day du cua trang /draw. tabs_html: thanh 2 tab dung chung voi trang 'Tạo Video Story'."""
    from . import reveal, templates
    from .drawpage_js import JS
    tpls = []
    for t in templates.TEMPLATES:
        parts = t[1].split(" · ")
        tpls.append([t[0], parts[0], " · ".join(parts[1:]), templates.full_text(t[0]), t[2]])
    data = dict(effects=[[k, v] for k, v in reveal.EFFECTS], directional=sorted(reveal.DIRECTIONAL), horiz=sorted(reveal.HORIZ_ONLY), templates=tpls, suggest=templates.SUGGEST, defaults=dict(tpl="whiteboard", fx="boy_pen"))
    dj = json.dumps(data, ensure_ascii=False).replace("</", "<\\/")
    return ('<!doctype html><html lang="vi"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">'
            '<title>Vẽ ra · AnimStudio</title><style>' + CSS + '</style></head><body>' + HTML.replace("__TABS__", tabs_html).replace("__LANGOPTS__", _lang_options())
            + '<script>const DATA=' + dj + ';' + JS + '</script></body></html>')
