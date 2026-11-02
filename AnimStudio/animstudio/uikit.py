# -*- coding: utf-8 -*-
"""Bo giao dien dung chung cho trang 'Ve ra' (/draw) va 'Ban quyen' (/license): mau, bong do, thanh dau trang (logo, tab, the ban quyen),
nut, o nhap, thanh truot, o tick, thanh chon, the (card), nhan. Chi la CSS: trang nao can them thi viet tiep sau CSS nay.

Y tuong: 'ban lam viec cua nguoi ve': mat ban xam lanh co luoi cham + hai vet sang (vang but da o goc tren trai, xanh but long o goc tren phai), to giay trang noi len bang
bong nhieu lop (khong con khung den day + bong cung nhu cu), muc den cho chu va muc dang chon, but da vang chi dung o noi 'but dang o day' (nut chinh, buoc dang chay, thanh tien trinh).
Font: font he thong (chay offline); tren Windows 11 tieu de dung 'Segoe UI Variable Display'. Che do toi tu dong theo may."""

_DARK = r'''
 --desk:#0B0E15; --dot:#1C2230; --board:#151922; --ink:#EEF1F7; --ink2:#A0AABC; --ink3:#7B8599;
 --hair:rgba(255,255,255,.11); --hair2:rgba(255,255,255,.06);
 --line:#2A3242; --line2:#232A38; --fill:#1B2029; --fill2:#222836;
 --hl:#FFD43B; --hl2:#FFB800; --hl-soft:#3A3418; --on-hl:#14171F; --hl-ink:#FFD43B;
 --blue:#86A2FF; --blue-soft:#1E2750; --red:#FF7B6E; --red-soft:#3C1E1C; --green:#43D39A; --green-soft:#12362B; --amber:#FFCB47; --amber-soft:#3A3014;
 --dock:#1F2533; --dock-fg:#F3F5F9; --dock-mut:#9FA9BC; --tray:#191E27; --bar:rgba(21,25,34,.82);
 --ghost:rgba(255,255,255,.07); --glow1:rgba(255,212,59,.10); --glow2:rgba(86,120,255,.15);
 --sh1:0 1px 2px rgba(0,0,0,.5); --sh2:0 2px 4px rgba(0,0,0,.3),0 10px 26px rgba(0,0,0,.4); --sh3:0 4px 10px rgba(0,0,0,.3),0 22px 54px rgba(0,0,0,.5);
 --ring:0 0 0 4px rgba(255,212,59,.32);
'''

CSS = r'''
:root{
 --desk:#ECEFF6; --dot:#CDD3E0; --board:#FFFFFF; --ink:#12151D; --ink2:#586275; --ink3:#8A93A6;
 --hair:rgba(18,21,29,.11); --hair2:rgba(18,21,29,.06);
 --line:#DCE1EB; --line2:#E9ECF3; --fill:#F3F5FA; --fill2:#E9ECF4;
 --hl:#FFD43B; --hl2:#FFB800; --hl-soft:#FFF3BF; --on-hl:#14171F; --hl-ink:#7A5600;
 --blue:#3A62F2; --blue-soft:#E7ECFF; --red:#E5483B; --red-soft:#FDE8E5; --green:#0E9467; --green-soft:#DCF5EA; --amber:#9A6700; --amber-soft:#FFF1C7;
 --dock:#12151D; --dock-fg:#FFFFFF; --dock-mut:#A3ADC0; --tray:#F2F4F9; --bar:rgba(255,255,255,.80);
 --ghost:rgba(18,21,29,.085); --glow1:rgba(255,212,59,.30); --glow2:rgba(58,98,242,.12);
 --sh1:0 1px 2px rgba(18,21,29,.07),0 1px 1px rgba(18,21,29,.04);
 --sh2:0 2px 4px rgba(18,21,29,.04),0 10px 26px rgba(18,21,29,.08);
 --sh3:0 4px 10px rgba(18,21,29,.05),0 22px 54px rgba(18,21,29,.13);
 --ring:0 0 0 4px rgba(255,212,59,.50);
 --ui:"Segoe UI Variable Text","Segoe UI",system-ui,-apple-system,"Inter","Roboto","Helvetica Neue",Arial,sans-serif;
 --disp:"Segoe UI Variable Display","Segoe UI Variable Text","Segoe UI",system-ui,-apple-system,"Inter","Roboto","Helvetica Neue",Arial,sans-serif;
 --mono:Consolas,"SF Mono","DejaVu Sans Mono",monospace;
 --ar:16/9;
}
@media (prefers-color-scheme: dark){:root:not([data-theme=light]){''' + _DARK + r'''}}
:root[data-theme=dark]{''' + _DARK + r'''}
*{box-sizing:border-box}
html{color-scheme:light dark}
body{margin:0;background-color:var(--desk);color:var(--ink);font:15px/1.5 var(--ui);-webkit-font-smoothing:antialiased;
 background-image:radial-gradient(900px 520px at 6% -8%,var(--glow1),transparent 62%),radial-gradient(820px 520px at 98% -4%,var(--glow2),transparent 62%),radial-gradient(var(--dot) 1px,transparent 1.3px);
 background-size:auto,auto,24px 24px;background-repeat:no-repeat,no-repeat,repeat}
button,input,select,textarea{font:inherit;color:inherit}
button{cursor:pointer}
svg.i{width:18px;height:18px;fill:none;stroke:currentColor;stroke-width:1.8;stroke-linecap:round;stroke-linejoin:round;flex:none}
:focus-visible{outline:3px solid var(--blue);outline-offset:2px}
.sr{position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0 0 0 0)}

/* ---- thanh dau trang: logo + 2 trang + the ban quyen */
.bar{position:sticky;top:0;z-index:30;background:var(--bar);-webkit-backdrop-filter:saturate(1.5) blur(16px);backdrop-filter:saturate(1.5) blur(16px);border-bottom:1px solid var(--hair)}
.bar>div{max-width:1360px;margin:0 auto;padding:0 28px;display:flex;align-items:center;gap:26px;min-height:62px}
.brand{display:flex;align-items:center;gap:11px;font:800 17px/1 var(--disp);letter-spacing:-.02em;white-space:nowrap}
.brand>svg{width:34px;height:34px;padding:7px;border-radius:11px;background:linear-gradient(145deg,#FFE45E,#FFB300);color:#14171F;fill:none;stroke:currentColor;stroke-width:1.9;stroke-linecap:round;stroke-linejoin:round;
 box-shadow:inset 0 1px 0 rgba(255,255,255,.65),0 3px 10px rgba(255,179,0,.45)}
.brand small{display:inline-block;margin-left:6px;font:700 11px/1 var(--ui);color:var(--ink2);background:var(--fill);border:1px solid var(--hair2);padding:3px 7px;border-radius:99px;letter-spacing:0;vertical-align:2px}
.brand small:empty{display:none}
.tabs{flex:1;display:flex;align-items:center;gap:14px;min-width:0}
.tg{display:flex;gap:3px;padding:4px;border-radius:14px;background:var(--fill);border:1px solid var(--hair2)}
.tabs a{display:flex;align-items:center;gap:8px;white-space:nowrap;text-decoration:none;color:var(--ink2);font-weight:650;font-size:14.5px;padding:7px 15px;border-radius:10px;transition:background .15s,color .15s,box-shadow .15s}
.tabs a svg{width:17px;height:17px;flex:none;fill:none;stroke:currentColor;stroke-width:1.9;stroke-linecap:round;stroke-linejoin:round}
.tabs a:hover{color:var(--ink)}
.tg a.on{background:var(--board);color:var(--ink);box-shadow:var(--sh1),0 0 0 1px var(--hair)}
.tg a.on svg{color:var(--hl-ink)}
.tabs a.lic{margin-left:auto;padding:6px 14px 6px 12px;border-radius:99px;border:1px solid var(--hair);background:var(--board);box-shadow:var(--sh1);font-size:13.5px}
.tabs a.lic:hover{border-color:var(--ink3)}
.tabs a.lic.on{border-color:var(--ink);color:var(--ink)}
.lic::before{content:"";width:8px;height:8px;border-radius:50%;background:var(--ink3);flex:none}
.lic.good::before{background:var(--green);box-shadow:0 0 0 3px var(--green-soft)}
.lic.warn::before{background:var(--hl2);box-shadow:0 0 0 3px var(--amber-soft)}
.lic.bad{color:var(--red)!important}.lic.bad::before{background:var(--red);box-shadow:0 0 0 3px var(--red-soft)}
@media(max-width:700px){
 .brand span{display:none}
 .bar>div{padding:8px 14px;gap:10px;flex-wrap:wrap}
 .tabs{gap:8px;flex-wrap:wrap}.tabs a{padding:7px 11px;font-size:14px}.tabs a.lic{margin-left:0}
}

/* ---- nut */
.btn{display:inline-flex;align-items:center;justify-content:center;gap:7px;border:1px solid var(--line);background:var(--board);border-radius:12px;padding:8px 14px;font-weight:650;font-size:14px;line-height:1.2;
 box-shadow:var(--sh1);transition:background .15s,border-color .15s,box-shadow .15s,transform .15s,filter .15s}
.btn:hover:not(:disabled){border-color:var(--ink3);box-shadow:var(--sh2);transform:translateY(-1px)}
.btn:active:not(:disabled){transform:none;box-shadow:var(--sh1)}
.btn:disabled{opacity:.45;cursor:default;box-shadow:none}
.btn.sm{padding:5px 11px;font-size:13px;border-radius:10px}
.btn.ink{background:var(--ink);color:var(--board);border-color:var(--ink)}
.btn.hl{background:linear-gradient(180deg,#FFE066,#FFC61A);color:var(--on-hl);border-color:rgba(122,86,0,.5);font-weight:800;
 box-shadow:inset 0 1px 0 rgba(255,255,255,.75),0 2px 0 rgba(122,86,0,.22),0 8px 18px rgba(255,184,0,.30)}
.btn.hl:hover:not(:disabled){border-color:rgba(122,86,0,.7);filter:brightness(1.03);box-shadow:inset 0 1px 0 rgba(255,255,255,.75),0 2px 0 rgba(122,86,0,.22),0 12px 24px rgba(255,184,0,.38)}
.btn.hl:active:not(:disabled){transform:translateY(1px);box-shadow:inset 0 1px 0 rgba(255,255,255,.6),0 1px 0 rgba(122,86,0,.2)}
.btn.red{background:linear-gradient(180deg,#F26A5E,#E5483B);color:#fff;border-color:#C93A2E;box-shadow:inset 0 1px 0 rgba(255,255,255,.3),0 6px 16px rgba(229,72,59,.3)}
.btn.hl,a.btn{text-decoration:none}
a.btn{color:var(--ink)}
.btn.ghost{border-color:transparent;background:transparent;box-shadow:none;color:var(--ink2)}
.btn.ghost:hover:not(:disabled){background:var(--fill);border-color:transparent;box-shadow:none;transform:none;color:var(--ink)}

/* ---- o nhap, chon, thanh truot, o tick */
select,input[type=text],input[type=password],input[type=number]{width:100%;background:var(--board);border:1px solid var(--line);border-radius:12px;padding:8px 12px;font-size:14px;min-height:40px;transition:border-color .15s,box-shadow .15s}
select{-webkit-appearance:none;appearance:none;padding-right:36px;cursor:pointer;background-repeat:no-repeat;background-position:right 12px center;background-size:16px;
 background-image:url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='%238A93A6' stroke-width='2.4' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='M6 9l6 6 6-6'/%3E%3C/svg%3E")}
option{background:var(--board);color:var(--ink)}
select:hover,input[type=text]:hover,input[type=password]:hover,input[type=number]:hover{border-color:var(--ink3)}
select:focus,input[type=text]:focus,input[type=password]:focus,input[type=number]:focus,textarea:focus{outline:none;border-color:var(--ink);box-shadow:var(--ring)}
input[type=range]{-webkit-appearance:none;appearance:none;width:100%;height:24px;background:transparent;margin:2px 0 0;cursor:pointer;--p:50%}
input[type=range]::-webkit-slider-runnable-track{height:6px;border-radius:99px;background:linear-gradient(90deg,var(--ink) var(--p),var(--line) var(--p))}
input[type=range]::-webkit-slider-thumb{-webkit-appearance:none;box-sizing:border-box;width:20px;height:20px;margin-top:-7px;border-radius:50%;background:linear-gradient(180deg,#FFE066,#FFC61A);border:2px solid var(--ink);box-shadow:0 2px 6px rgba(18,21,29,.3);transition:transform .12s}
input[type=range]:hover::-webkit-slider-thumb{transform:scale(1.12)}
input[type=range]::-moz-range-track{height:6px;border-radius:99px;background:var(--line)}
input[type=range]::-moz-range-progress{height:6px;border-radius:99px;background:var(--ink)}
input[type=range]::-moz-range-thumb{box-sizing:border-box;width:20px;height:20px;border-radius:50%;background:#FFD43B;border:2px solid var(--ink)}
input[type=range]:focus-visible{outline:none}
input[type=range]:focus-visible::-webkit-slider-thumb{box-shadow:var(--ring),0 2px 6px rgba(18,21,29,.3)}
input[type=checkbox]{-webkit-appearance:none;appearance:none;display:inline-grid;place-content:center;flex:none;width:20px;height:20px;margin:0;border-radius:7px;border:1.5px solid var(--ink3);background:var(--board);cursor:pointer;
 transition:background .12s,border-color .12s,box-shadow .12s}
input[type=checkbox]:hover{border-color:var(--ink)}
input[type=checkbox]::after{content:"";width:5px;height:10px;border:solid var(--board);border-width:0 2.4px 2.4px 0;transform:translateY(-1px) rotate(45deg) scale(0);transition:transform .12s}
input[type=checkbox]:checked{background:var(--ink);border-color:var(--ink)}
input[type=checkbox]:checked::after{transform:translateY(-1px) rotate(45deg) scale(1)}
input[type=checkbox]:focus-visible{outline:none;box-shadow:var(--ring)}
input[type=color]{width:42px;height:36px;padding:3px;border:1px solid var(--line);border-radius:10px;background:var(--board);cursor:pointer}
label.sw{display:flex;gap:11px;align-items:flex-start;cursor:pointer;font-weight:650;line-height:1.35}
label.sw input{margin:1px 0 0}
label.sw span small{display:block;font-weight:400;color:var(--ink2);font-size:12.5px;margin-top:2px}
.seg{display:flex;gap:3px;padding:3px;border:1px solid var(--hair2);border-radius:13px;background:var(--fill2)}
.seg button{flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;border:0;background:transparent;padding:7px 8px;font-weight:650;font-size:13.5px;border-radius:10px;white-space:nowrap;color:var(--ink2);transition:background .15s,color .15s,box-shadow .15s}
.seg button:hover:not([aria-checked=true]):not(:disabled){background:var(--board);color:var(--ink)}
.seg button[aria-checked=true]{background:var(--ink);color:var(--board);box-shadow:0 2px 6px rgba(18,21,29,.28)}
.seg button:disabled{opacity:.38;cursor:not-allowed}
.note{color:var(--ink2);font-size:12.5px;line-height:1.5;margin:6px 0 0}
.hint{color:var(--ink2);font-size:13px}
.err{color:var(--red);font-weight:700;margin:8px 0 0}

/* ---- the, nhan, tom tat */
.card{background:var(--board);border:1px solid var(--hair);border-radius:22px;padding:20px 22px;box-shadow:var(--sh2)}
.card h2{margin:0;font:800 19px/1.2 var(--disp);letter-spacing:-.02em}
.chip{display:inline-flex;align-items:center;border-radius:99px;padding:2px 9px;font-size:11.5px;font-weight:750;background:linear-gradient(180deg,#FFE066,#FFC61A);color:var(--on-hl)}
.pill{display:inline-flex;align-items:center;gap:6px;border-radius:99px;padding:3px 11px;font-size:12.5px;font-weight:700;background:var(--fill);color:var(--ink2);border:1px solid var(--hair2)}
.pill::before{content:"";width:8px;height:8px;border-radius:50%;background:currentColor}
.pill.ready,.pill.ok{color:var(--green);background:var(--green-soft);border-color:transparent}
.pill.opening{color:var(--amber);background:var(--amber-soft);border-color:transparent}
.pill.error,.pill.bad{color:var(--red);background:var(--red-soft);border-color:transparent}
details>summary{cursor:pointer;font-weight:700;color:var(--ink2);list-style:none;display:flex;align-items:center;gap:6px}
details>summary::-webkit-details-marker{display:none}
details>summary::before{content:"";width:7px;height:7px;border-right:2px solid currentColor;border-bottom:2px solid currentColor;transform:rotate(-45deg);transition:transform .15s;margin-right:3px}
details[open]>summary::before{transform:rotate(45deg)}
.toast{position:fixed;left:50%;transform:translateX(-50%);bottom:104px;background:var(--ink);color:var(--board);padding:11px 18px;border-radius:16px;font-weight:600;z-index:40;max-width:min(560px,calc(100% - 24px));box-shadow:var(--sh3)}
.toast.bad{background:var(--red);color:#fff}
@media (prefers-reduced-motion: reduce){*{animation:none!important;transition:none!important}}
'''

# ban ve 4 canh dung o tieu de trang (khong phai CSS): ngoi sao 4 canh vang / xanh
STAR = "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24'%3E%3Cpath fill='%23{c}' d='M12 1c.7 6 4 9.3 11 11-7 1.7-10.3 5-11 11-.7-6-4-9.3-11-11C8 10.3 11.3 7 12 1z'/%3E%3C/svg%3E"
