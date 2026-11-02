# -*- coding: utf-8 -*-
"""Trang 'Bản quyền' (/license): xem trang thai dung thu / key, chep ma may, nhap key.
Cung ngon ngu thiet ke voi trang 'Ve ra' (bang trang + muc den + but da vang). Logic o licensing.py; ham build(tabs_html) tra ve HTML."""

from . import uikit, payqr

CSS = uikit.CSS + r'''
main{max-width:700px;margin:0 auto;padding:44px 20px 90px;display:grid;gap:20px}
h1{position:relative;display:inline-block;justify-self:start;margin:0 0 4px;font:800 clamp(34px,5vw,46px)/1.05 var(--disp);letter-spacing:-.04em}
h1::after{content:"";position:absolute;left:0;right:-6px;bottom:-4px;height:10px;border-radius:99px;background:linear-gradient(90deg,#FFD43B,#FFB800);z-index:-1;opacity:.85}
.sub{color:var(--ink2);margin:10px 0 0;font-size:16px;line-height:1.6;max-width:56ch}
.card{display:grid;gap:14px}
.state{border-radius:16px;padding:15px 18px;font-weight:650;border:1px solid var(--hair);background:var(--fill);position:relative;padding-left:48px}
.state::before{content:"";position:absolute;left:19px;top:20px;width:10px;height:10px;border-radius:50%;background:var(--ink3)}
.state.good{background:var(--green-soft);border-color:transparent}.state.good::before{background:var(--green);box-shadow:0 0 0 4px rgba(14,148,103,.18)}
.state.warn{background:var(--amber-soft);border-color:transparent}.state.warn::before{background:var(--hl2);box-shadow:0 0 0 4px rgba(255,184,0,.25)}
.state.bad{background:var(--red-soft);border-color:transparent}.state.bad::before{background:var(--red);box-shadow:0 0 0 4px rgba(229,72,59,.18)}
.state small{display:block;font-weight:500;color:var(--ink2);margin-top:2px}
.code{display:flex;gap:12px;align-items:center;flex-wrap:wrap}
.code output{font:700 22px/1 var(--mono);letter-spacing:.07em;background:var(--fill);border:1px dashed var(--ink3);border-radius:14px;padding:14px 16px;user-select:all}
textarea{width:100%;min-height:96px;resize:vertical;border:1px solid var(--line);border-radius:14px;background:var(--fill);padding:12px 14px;font:600 14px/1.5 var(--mono);letter-spacing:.02em}
.msg{min-height:1.4em;font-weight:650}.msg.ok{color:var(--green)}.msg.err{color:var(--red)}
ol{margin:0;padding-left:20px;color:var(--ink2);display:grid;gap:4px}ol b{color:var(--ink)}
.hide{display:none}
.payrow{display:flex;gap:24px;align-items:center;flex-wrap:wrap}
.qr{width:230px;height:230px;border-radius:16px;border:1px solid var(--hair);background:#fff;flex:none}
.bank{display:grid;grid-template-columns:auto 1fr;gap:8px 16px;margin:0;align-content:center}
.bank dt{color:var(--ink2)}.bank dd{margin:0;font-weight:700}
.note{margin:0;color:var(--ink2);font-size:14px;line-height:1.55}
'''

HTML = r'''
<header class="bar"><div>
  <div class="brand"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 20l4-1 11-11a2.1 2.1 0 0 0-3-3L5 16l-1 4z"/><path d="M14 7l3 3"/></svg><span>AnimStudio</span></div>
  __TABS__
</div></header>
<main>
 <div><h1>Bản quyền</h1><p class="sub">Dùng thử 4 giờ kể từ lần mở đầu tiên. Sau đó nhập key để tiếp tục tạo video.</p></div>
 <section class="card" aria-live="polite"><div id="state" class="state warn">Đang kiểm tra…</div></section>
 <section class="card">
  <h2>Mã máy của bạn</h2>
  <div class="code"><output id="mcode" aria-label="Mã máy">…</output><button class="btn" id="bCopy" type="button">Sao chép mã máy</button></div>
  <ol id="how"><li>Bấm <b>Sao chép mã máy</b>, gửi cho người bán (ghi mã này vào nội dung chuyển khoản).</li><li>Nhận key dạng <b>AN1-XXXXXXXX-…</b>, dán vào ô bên dưới rồi bấm <b>Kích hoạt</b>.</li><li>Gia hạn: nhập key mới, key mới tốt hơn sẽ thay key cũ.</li></ol>
  <div id="sell" class="hide"></div>
 </section>
 <section class="card" id="pay">
  <h2>Mua bản quyền</h2>
  <div class="payrow">
   <img class="qr" alt="Mã QR chuyển khoản" src="data:image/png;base64,__QR__" width="230" height="230">
   <dl class="bank"><dt>Ngân hàng</dt><dd>__BANK__</dd><dt>Chủ tài khoản</dt><dd>__ACCNAME__</dd><dt>Số tài khoản</dt><dd><span id="accno">__ACCNO__</span> <button class="btn sm" id="bAcc" type="button">Sao chép</button></dd><dt>Nội dung</dt><dd>Mã máy của bạn (ở phần trên)</dd></dl>
  </div>
  <p class="note">Quét mã QR bằng app ngân hàng, ghi mã máy vào nội dung chuyển khoản rồi gửi mã máy cho người bán để nhận key.</p>
 </section>
 <section class="card">
  <h2>Nhập key</h2>
  <label class="sr" for="key" style="position:absolute;left:-9999px">Key bản quyền</label>
  <textarea id="key" spellcheck="false" autocomplete="off" placeholder="AN1-XXXXXXXX-XXXXXXXX-…"></textarea>
  <div><button class="btn hl" id="bGo" type="button">Kích hoạt</button></div>
  <div id="msg" class="msg" role="status"></div>
 </section>
</main>
<script>
const $=id=>document.getElementById(id);
async function load(){
 let d;try{d=await (await fetch("/api/license")).json()}catch(e){$("state").textContent="Không đọc được trạng thái bản quyền.";return}
 const s=d.status;const el=$("state");el.className="state "+(s.level||"warn");
 el.innerHTML="";const b=document.createElement("div");b.textContent=s.msg;el.appendChild(b);
 $("mcode").textContent=d.machine;
 const sell=$("sell");const t=[];if(d.price)t.push(d.price);if(d.contact)t.push("Liên hệ: "+d.contact);
 if(t.length){sell.textContent=t.join(" · ");sell.classList.remove("hide")}else sell.classList.add("hide");
 const chip=document.getElementById("licChip"),ct=document.getElementById("licTxt");if(ct)ct.textContent=String(s.short||"").replace(/^[^\p{L}\p{N}]+/u,"");if(chip){["good","warn","bad"].forEach(c=>chip.classList.remove(c));if(s.level==="good"||s.level==="warn"||s.level==="bad")chip.classList.add(s.level)}
}
$("bCopy").onclick=async()=>{
 const t=$("mcode").textContent;
 try{await navigator.clipboard.writeText(t)}catch(e){const r=document.createRange();r.selectNodeContents($("mcode"));const sl=getSelection();sl.removeAllRanges();sl.addRange(r);try{document.execCommand("copy")}catch(_){}}
 $("msg").className="msg ok";$("msg").textContent="Đã sao chép mã máy: "+t;
};
$("bAcc").onclick=async()=>{const t=$("accno").textContent;try{await navigator.clipboard.writeText(t)}catch(e){const r=document.createRange();r.selectNodeContents($("accno"));const sl=getSelection();sl.removeAllRanges();sl.addRange(r);try{document.execCommand("copy")}catch(_){}}
 $("msg").className="msg ok";$("msg").textContent="Đã sao chép số tài khoản: "+t;
};
$("bGo").onclick=async()=>{
 const k=$("key").value.trim();if(!k){$("msg").className="msg err";$("msg").textContent="Hãy dán key vào ô trên.";return}
 $("bGo").disabled=true;
 try{const r=await (await fetch("/api/license/activate",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({key:k})})).json();
  $("msg").className="msg "+(r.ok?"ok":"err");$("msg").textContent=r.ok?r.msg:(r.error||"Không kích hoạt được.");
  if(r.ok)$("key").value=""}catch(e){$("msg").className="msg err";$("msg").textContent="Không kết nối được chương trình."}
 $("bGo").disabled=false;load();
};
load();
</script>
'''


def build(tabs_html):
    return ('<!doctype html><html lang="vi"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">'
            '<title>Bản quyền · AnimStudio</title><style>' + CSS + '</style></head><body>' + HTML.replace("__TABS__", tabs_html).replace("__QR__", payqr.QR_B64).replace("__BANK__", payqr.BANK).replace("__ACCNAME__", payqr.ACC_NAME).replace("__ACCNO__", payqr.ACC_NO) + '</body></html>')
