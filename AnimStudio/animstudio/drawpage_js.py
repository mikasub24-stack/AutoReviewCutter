# -*- coding: utf-8 -*-
"""JS cua trang 'Vẽ ra' (/draw). Xem drawpage.py."""

JS = r'''
"use strict";
/* thanh truot: phan da keo to mau (CSS dung --p). Bat ca khi JS gan .value */
(function(){const d=Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,"value");
const fill=r=>{if(r&&r.type==="range"){const mn=+r.min||0,mx=r.max===""?100:+r.max;r.style.setProperty("--p",(mx>mn?(r.value-mn)/(mx-mn)*100:0)+"%")}};
Object.defineProperty(HTMLInputElement.prototype,"value",{configurable:true,get(){return d.get.call(this)},set(v){d.set.call(this,v);fill(this)}});
document.addEventListener("input",e=>fill(e.target),true);
document.querySelectorAll("input[type=range]").forEach(fill)})();
const $=id=>document.getElementById(id);
const qsa=(s,r)=>[...(r||document).querySelectorAll(s)];
const esc=s=>String(s==null?"":s).replace(/[&<>"]/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"}[c]));
async function api(p,b){const r=await fetch(p,b?{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(b)}:undefined);return r.json()}
let toastT=0;
function toast(m,bad){let t=$("toast");if(!t){t=document.createElement("div");t.id="toast";t.setAttribute("role","status");document.body.appendChild(t)}t.className="toast"+(bad?" bad":"");t.textContent=m;t.style.display="block";clearTimeout(toastT);toastT=setTimeout(()=>{t.style.display="none"},bad?Math.min(20000,Math.max(6000,String(m).length*70)):3200)}
const fmt=s=>{s=Math.max(0,Math.round(s));return Math.floor(s/60)+":"+String(s%60).padStart(2,"0")};
const fileData=f=>new Promise((ok,no)=>{const r=new FileReader();r.onload=()=>ok(r.result);r.onerror=()=>no(r.error);r.readAsDataURL(f)});

/* ---------- cai dat + luu o may (server, vi cong may chu doi moi lan mo) ---------- */
const SUBDEF={font:"",pos:"bottom",weight:"bold",size:37,color:"#ffffff",scolor:"#0a0a10",sw:3,bg:false,bgcolor:"#000000",round:false,px:.5,py:.88,v:2};
const DEF={text:"",lang:"",aspect:"16:9",res:"720p",fps:"30",tpl:DATA.defaults.tpl,ptext:"",useref:true,reflax:false,fx:DATA.defaults.fx,revdur:1.6,revdir:"auto",revauto:true,narr:"ms:vi-VN-HoaiMyNeural",speed:1,vol:100,music:true,subs:true,srt:true,
 sub:Object.assign({},SUBDEF),engine:"flow",browser:0,flowtabs:3,hideflow:true,mode:"studio",size:206,tab:"pStyle"};
let S=JSON.parse(JSON.stringify(DEF));
let saveT=0;
function saveSoon(){clearTimeout(saveT);saveT=setTimeout(()=>{saveT=0;api("/api/drawui",{ui:S}).catch(()=>{})},700)}
document.addEventListener("click",e=>{const a=e.target.closest&&e.target.closest(".tabs a[href]");if(!a||!saveT||e.ctrlKey||e.metaKey||e.shiftKey||e.button)return;      // bam sang tab khac khi chua kip luu (dưới 0,7 giây): luu ngay roi moi chuyen
 e.preventDefault();clearTimeout(saveT);saveT=0;api("/api/drawui",{ui:S}).catch(()=>{}).then(()=>{location.href=a.href})},true);
const REPAINT=[];
function chg(){saveSoon();renderSummary()}
function seg(id,get,set){const el=$(id);const paint=()=>[...el.children].forEach(b=>b.setAttribute("aria-checked",String(String(get())===b.dataset.v)));
 el.onclick=e=>{const b=e.target.closest("[data-v]");if(!b)return;set(b.dataset.v);paint()};REPAINT.push(paint);paint();return paint}
function bind(id,key,kind,after){const el=$(id);const read=()=>kind==="check"?el.checked:kind==="num"?+el.value:el.value;
 const put=()=>{if(kind==="check")el.checked=!!S[key];else el.value=S[key]};put();REPAINT.push(put);
 el.addEventListener(kind==="check"?"change":"input",()=>{S[key]=read();if(after)after();chg()})}

/* ---------- bieu tuong cho o chon mau prompt (so do bo cuc thu nho) ---------- */
const TPLSVG={
 whiteboard:'<svg viewBox="0 0 64 40"><circle cx="17" cy="12" r="4.5"/><path d="M17 17v9M17 20l-6 4M17 20l6 3M17 26l-5 9M17 26l5 9"/><path d="M33 13c4-4 7 4 11 0s6 2 9-1"/><path d="M33 24h22M33 30h14"/></svg>',
 whiteboard_color:'<svg viewBox="0 0 64 40"><circle cx="17" cy="12" r="4.5" fill="#fff"/><path d="M17 17v9M17 20l-6 4M17 20l6 3M17 26l-5 9M17 26l5 9"/><circle cx="46" cy="20" r="9" fill="#FFD83A"/><path d="M40 32h12" stroke="#E2483D" stroke-width="3"/><rect x="33" y="27" width="8" height="8" rx="1.5" fill="#8fd6a8"/></svg>',
 story_color:'<svg viewBox="0 0 64 40"><circle cx="48" cy="12" r="6" fill="#FFD83A"/><path d="M0 34c10-9 20-9 30-3s22 2 34-5v14H0z" fill="#8fd6a8"/><path d="M0 34c10-9 20-9 30-3s22 2 34-5"/><path d="M16 22l5-7 5 7z" fill="#f08a7e"/></svg>',
 cause_effect:'<svg viewBox="0 0 64 40"><rect x="4" y="11" width="16" height="18" rx="3"/><path d="M26 20h14m-5-5 5 5-5 5"/><circle cx="52" cy="20" r="8"/><path d="M49 20l2 2 4-4"/></svg>',
 compare:'<svg viewBox="0 0 64 40"><rect x="4" y="5" width="56" height="30" rx="4"/><path d="M32 5v30"/><path d="M13 14l8 12m0-12l-8 12" stroke="#E2483D"/><path d="M40 21l5 5 9-11" stroke="#12915F"/></svg>',
 steps:'<svg viewBox="0 0 64 40"><circle cx="11" cy="20" r="7"/><circle cx="32" cy="20" r="7"/><circle cx="53" cy="20" r="7"/><path d="M19 20h5m-2-2 2 2-2 2M40 20h5m-2-2 2 2-2 2"/><path d="M11 17v6m-1.5-4.5L11 17M32 17.5c2 0 2 2 0 3.5l-2 2h4M52 17.5c1.5-1 3 0 2 1.5-1 1-2 1-2 1s3 0 2.5 2c-.5 1.5-2.5 1.5-3 .5" stroke-width="1.6"/></svg>',
 facts:'<svg viewBox="0 0 64 40"><text x="32" y="29" text-anchor="middle" font-size="25" font-weight="800" fill="currentColor" stroke="none" style="font-family:system-ui,sans-serif">87%</text><path d="M12 35h40" stroke="#FFD83A" stroke-width="3"/></svg>',
 ancient:'<svg viewBox="0 0 64 40"><path d="M8 35L28 9l20 26z"/><path d="M28 9l7 26"/><circle cx="52" cy="10" r="5" fill="#FFD83A"/><path d="M4 35h56"/></svg>',
 timeline:'<svg viewBox="0 0 64 40"><path d="M3 24h58"/><circle cx="12" cy="24" r="3" fill="#FFD83A"/><circle cx="31" cy="24" r="5" fill="#FFD83A"/><circle cx="52" cy="24" r="3" fill="#FFD83A"/><path d="M12 20v-7h-4M31 18v-9h-6M52 20v-7h-4"/><path d="M10 31h4M28 33h6M50 31h4"/></svg>',
 mindmap:'<svg viewBox="0 0 64 40"><circle cx="32" cy="20" r="6" fill="#FFD83A"/><circle cx="10" cy="9" r="4"/><circle cx="54" cy="9" r="4"/><circle cx="10" cy="31" r="4"/><circle cx="54" cy="31" r="4"/><path d="M26.5 17L13 11M37.5 17L51 11M26.5 23L13 29M37.5 23L51 29"/></svg>',
 illus_notes:'<svg viewBox="0 0 64 40"><rect x="5" y="4" width="54" height="22" rx="3"/><circle cx="18" cy="12" r="3"/><path d="M6 24l14-9 10 6 8-5 20 8"/><path d="M8 32h30" stroke="#FFD83A" stroke-width="3.5"/><path d="M8 37h46"/></svg>',
 "":'<svg viewBox="0 0 64 40"><path d="M14 31l3-9 22-16a3 3 0 0 1 4 4L21 28z"/><path d="M36 9l5 5"/><path d="M14 31l5-1.5M44 33h12"/></svg>'};

/* ---------- mau prompt ---------- */
const TPL=DATA.templates;
const tplBy=k=>TPL.find(t=>t[0]===k);
const tplText=k=>(tplBy(k)||[0,0,0,""])[3];
function renderTpls(){
 const all=TPL.map(t=>[t[0],t[1],t[2]]).concat([["","Tự viết","Gõ prompt của bạn"]]);
 $("tpls").innerHTML=all.map(([k,n,s])=>`<button type="button" class="tpl" role="radio" data-k="${esc(k)}" aria-checked="${S.tpl===k}">${TPLSVG[k]||TPLSVG[""]}<b>${esc(n)}</b>${s?`<small>${esc(s)}</small>`:""}</button>`).join("");
 renderPtextMeta()}
$("tpls").onclick=e=>{const b=e.target.closest(".tpl");if(!b)return;const k=b.dataset.k;S.tpl=k;S.ptext=tplText(k);$("ptext").value=S.ptext;if(!k)$("ptext").focus();renderTpls();renderFxHint();chg()};
function renderPtextMeta(){const base=tplText(S.tpl);const ed=S.tpl&&S.ptext.trim()!==base.trim();$("pedited").style.display=ed?"":"none";$("plen").textContent=S.ptext.length?S.ptext.length.toLocaleString("vi-VN")+" ký tự":"trống";qsa(".tpl").forEach(b=>b.setAttribute("aria-checked",String(b.dataset.k===S.tpl)))}
$("ptext").addEventListener("input",()=>{S.ptext=$("ptext").value;renderPtextMeta();chg()});
$("pReset").onclick=()=>{S.ptext=tplText(S.tpl);$("ptext").value=S.ptext;renderPtextMeta();chg()};
$("pPaste").onclick=async()=>{try{const t=await navigator.clipboard.readText();if(!t){toast("Bộ nhớ tạm đang trống.",true);return}S.ptext=t;$("ptext").value=t;renderPtextMeta();chg()}catch(e){toast("Trình duyệt không cho đọc bộ nhớ tạm. Hãy bấm vào ô prompt rồi dán bằng Ctrl+V.",true)}};

/* ---------- hieu ung ve ra ---------- */
const FX=DATA.effects.map(([k,l])=>{const p=l.split(" — ");return {k,n:p[0],d:p.slice(1).join(" — ")}});
const fxBy=k=>FX.find(f=>f.k===k)||FX[0];
let PROPSIG="",fxT=0;
function renderFx(){$("fxs").innerHTML=FX.map(f=>`<button type="button" role="radio" data-k="${f.k}" aria-checked="${S.fx===f.k}" title="${esc(f.d)}">${esc(f.n)}</button>`).join("");renderFxHint();renderDir()}
function renderDir(){const dirn=DATA.directional.includes(S.fx),horiz=DATA.horiz.includes(S.fx);
 qsa("#dirSeg button").forEach(b=>{b.disabled=!dirn||(horiz&&(b.dataset.v==="tb"||b.dataset.v==="bt"))});
 $("dirHint").textContent=!dirn?"Hiệu ứng này hiện đều cả ảnh nên không có hướng.":horiz?"Cuộn tranh chỉ kéo ngang. Tự động = lần trái sang phải, lần phải sang trái.":S.revdir==="auto"?"Tự động: mỗi ảnh mở từ một hướng khác nhau (trái, trên, phải, dưới) cho đỡ nhàm.":""}
function paintDur(){$("revdurWrap").hidden=!!S.revauto}
$("fxs").onclick=e=>{const b=e.target.closest("button");if(!b)return;S.fx=b.dataset.k;renderFx();fxPreview(true);chg()};
function renderFxHint(){const t=tplBy(S.tpl);const rec=t?t[4]:[];const h=$("fxHint");
 if(!t||!rec.length||rec.includes(S.fx)){h.textContent=t&&rec.includes(S.fx)?"Hiệu ứng này hợp với mẫu «"+t[1]+"».":"";return}
 h.innerHTML="Mẫu «"+esc(t[1])+"» hợp với: "+rec.map(k=>`<a href="#" data-fx="${k}" style="color:var(--blue);font-weight:700">${esc(fxBy(k).n)}</a>`).join(", ")+"."}
$("fxHint").onclick=e=>{const a=e.target.closest("a[data-fx]");if(!a)return;e.preventDefault();S.fx=a.dataset.fx;renderFx();fxPreview(true);chg()};
function fxPreview(now){clearTimeout(fxT);const go=()=>{const f=fxBy(S.fx);$("fxv").classList.add("load");$("fxcap").textContent=f.d||f.n;
  $("fxprev").src="/api/revprev?k="+encodeURIComponent(S.fx)+"&d="+(S.revauto?"auto":S.revdur)+"&dir="+S.revdir+"&v="+encodeURIComponent(PROPSIG)};now?go():fxT=setTimeout(go,350)}
$("fxprev").onload=()=>$("fxv").classList.remove("load");
$("fxprev").onerror=()=>{$("fxv").classList.remove("load");$("fxcap").textContent="Chưa xem thử được hiệu ứng này."};
$("revdur").addEventListener("input",()=>{S.revdur=+$("revdur").value;$("revdurv").textContent=S.revdur.toFixed(1)+" giây";fxPreview();chg()});
seg("dirSeg",()=>S.revdir,v=>{S.revdir=v;renderDir();fxPreview(true);chg()});
bind("revauto","revauto","check",()=>{paintDur();fxPreview(true)});REPAINT.push(paintDur,renderDir);

/* ---------- hinh minh hoa cho hieu ung (ban tay, cau be, cuon tranh, co) ---------- */
let propsig="",propn=-1,PROPS_LIST=[];
async function loadProps(){try{const r=await api("/api/props");const sig=JSON.stringify(r.props);if(sig===propsig)return;propsig=sig;PROPS_LIST=r.props;PROPSIG=r.props.map(x=>x.ts).join(",");
 $("proplist").innerHTML=r.props.map(p=>`<div class="prop" data-k="${p.key}"><div class="pv">${p.has?`<img alt="" src="/api/prop.png?k=${p.key}&t=${p.ts}">`:"chưa có"}</div><div class="pt"><b>${esc(p.label)}</b><small>${p.has?(p.own?"Đang dùng hình của bạn":"Hình mặc định đi kèm tool"):"Sẽ tự nhờ AI vẽ ở lần dùng tới"}</small></div><div class="bt"><button class="btn sm" data-pa="make" type="button">Vẽ bằng AI</button><button class="btn sm" data-pa="up" type="button">Ảnh của tôi</button>${p.own?'<button class="btn sm ghost" data-pa="reset" type="button">Về mặc định</button>':""}</div></div>`).join("");
 fxPreview(true)}catch(e){fxPreview(true)}}
function propTick(P){if(!P)return;const m=$("propmsg");m.textContent=(P.state==="working"?"⏳ ":P.state==="error"?"⚠ ":P.state==="done"?"✓ ":"")+(P.msg||"");m.style.color=P.state==="error"?"var(--red)":"";qsa("#proplist button,#propall").forEach(b=>b.disabled=P.state==="working");if(P.n!==propn){propn=P.n;loadProps()}}
async function propMake(keys){const r=await api("/api/props/make",{keys,browser:+S.browser});if(r.error)toast(r.error,true)}
$("proplist").onclick=e=>{const b=e.target.closest("button[data-pa]");if(!b)return;const k=b.closest("[data-k]").dataset.k,a=b.dataset.pa;
 if(a==="make")propMake([k]);
 else if(a==="reset"){if(confirm("Bỏ hình của bạn và quay về hình mặc định đi kèm tool?"))api("/api/props/reset",{key:k})}
 else{const f=document.createElement("input");f.type="file";f.accept="image/*";f.onchange=async()=>{const fl=f.files[0];if(!fl)return;const r=await api("/api/props/upload",{key:k,data:await fileData(fl)});if(r.error)toast(r.error,true)};f.click()}};
$("propall").onclick=()=>{const miss=PROPS_LIST.filter(p=>!p.has).map(p=>p.key);if(miss.length)return propMake(miss);if(confirm("Đã có đủ hình. Vẽ lại TẤT CẢ bằng AI (thay hình hiện tại)?"))propMake(PROPS_LIST.map(p=>p.key))};

/* ---------- anh tham chieu ---------- */
let REF={has:false};
function renderRef(){const th=$("refThumb"),dr=$("drop");const has=!!REF.has;th.style.display=has?"":"none";$("dropIc").style.display=has?"none":"";
 if(has)th.src="/api/refimg.png?t="+REF.ts;
 $("refName").textContent=has?(REF.name||"Ảnh tham chiếu"):"Chưa có ảnh";
 $("refInfo").textContent=has?`${REF.w}×${REF.h} px · ${REF.kb} KB. Gửi kèm mọi cảnh.`:"Kéo ảnh vào đây, dán bằng Ctrl+V, hoặc bấm Chọn ảnh.";
 $("refPick").textContent=has?"Đổi ảnh":"Chọn ảnh";$("refDel").style.display=has?"":"none";dr.classList.toggle("refoff",!S.useref);renderSummary()}
async function loadRef(){try{REF=await api("/api/refimg")}catch(e){REF={has:false}}renderRef()}
async function uploadRef(f){if(!f)return;if(!/^image\//.test(f.type||"image/")){toast("Đây không phải file ảnh.",true);return}
 const r=await api("/api/refimg/upload",{data:await fileData(f),name:f.name});if(r.error){toast(r.error,true);return}
 REF=r;S.useref=true;$("useref").checked=true;renderRef();saveSoon();toast("Đã lưu ảnh tham chiếu.")}
$("refPick").onclick=()=>$("refFile").click();
$("refFile").onchange=()=>{uploadRef($("refFile").files[0]);$("refFile").value=""};
$("refDel").onclick=async()=>{await api("/api/refimg/clear",{});REF={has:false};renderRef()};
["dragenter","dragover"].forEach(ev=>$("drop").addEventListener(ev,e=>{e.preventDefault();$("drop").classList.add("over")}));
["dragleave","drop"].forEach(ev=>$("drop").addEventListener(ev,e=>{e.preventDefault();$("drop").classList.remove("over")}));
$("drop").addEventListener("drop",e=>{const f=[...(e.dataTransfer.files||[])].find(x=>/^image\//.test(x.type));if(f)uploadRef(f)});
document.addEventListener("paste",e=>{if(!$("pStyle").classList.contains("on")||/^(TEXTAREA|INPUT)$/.test((e.target||{}).tagName||""))return;const it=[...(e.clipboardData&&e.clipboardData.items||[])].find(x=>x.type.startsWith("image/"));if(it){uploadRef(it.getAsFile());e.preventDefault()}});
$("useref").addEventListener("change",()=>{S.useref=$("useref").checked;renderRef();chg()});

/* ---------- loi ke: chia canh thu ---------- */
let PLAN={lines:[],words:0,secs:0},planT=0,planSeq=0,RUNTEXT="",textDirty=false;
function schedulePlan(){clearTimeout(planT);planT=setTimeout(doPlan,500)}
async function doPlan(){const seq=++planSeq;const t=S.text.trim();if(!t){PLAN={lines:[],words:0,secs:0};renderStats();renderBoard();return}
 let r;try{r=await api("/api/drawplan",{text:S.text,lang:S.lang,speed:S.speed})}catch(e){return}if(seq!==planSeq)return;PLAN=r.lines?r:{lines:[],words:0,secs:0};renderStats();renderBoard()}
function scenesOf(){return PLAN.scenes!=null?PLAN.scenes:PLAN.lines.length}
function renderStats(){const n=scenesOf();$("bSample").style.display=S.text.trim()?"none":"";$("stats").innerHTML=n?`<span class="stat"><b>${(PLAN.words||0).toLocaleString("vi-VN")}</b> từ</span><span class="stat">~<b>${fmt(PLAN.secs)}</b></span>${(PLAN.cast||[]).length?`<span class="stat" title="${esc((PLAN.cast||[]).join(", "))}"><b>${PLAN.cast.length}</b> nhân vật</span>`:""}<span class="stat hl"><b>${n}</b> cảnh</span>`:"";renderSummary()}
$("text").addEventListener("input",()=>{S.text=$("text").value;$("bSample").style.display=S.text.trim()?"none":"";if(!jobBusy())textDirty=true;chg();schedulePlan();matchSoon()});
$("lang").addEventListener("change",()=>{S.lang=$("lang").value;matchVoice();chg();schedulePlan()});
$("bClear").onclick=()=>{S.text="";$("text").value="";textDirty=true;chg();doPlan();$("text").focus()};
$("bPaste").onclick=async()=>{try{const t=await navigator.clipboard.readText();if(!t){toast("Bộ nhớ tạm đang trống.",true);return}S.text=t;$("text").value=t;textDirty=true;chg();doPlan()}catch(e){toast("Trình duyệt không cho đọc bộ nhớ tạm. Hãy bấm vào bảng rồi dán bằng Ctrl+V.",true);$("text").focus()}};
$("bSample").onclick=()=>{const t="Mỗi đêm, não của bạn không hề nghỉ ngơi. Nó đang dọn dẹp những thứ thừa của một ngày dài. Khi ngủ đủ, trí nhớ được sắp xếp gọn gàng hơn. Thiếu ngủ chỉ vài ngày, bạn sẽ dễ quên, dễ cáu và khó tập trung. Vì vậy, hãy coi giấc ngủ là một việc quan trọng, không phải thứ có thể bỏ qua.";S.text=t;$("text").value=t;textDirty=true;chg();doPlan()};

/* ---------- giong doc ---------- */
let D=null;
function groupVoices(rows,brand,pre,o){const g={};rows.forEach(r=>{(g[r[2]]=g[r[2]]||[]).push(o(pre+r[0],r[1]))});return Object.keys(g).map(k=>`<optgroup label="${esc(brand+" — "+k)}">${g[k].join("")}</optgroup>`).join("")}
function matchVoice(){const lg=S.lang;if(!lg||!D||!D.nar)return;const m=/^ms:(.+)$/.exec(S.narr||"");if(!m)return;const row=D.ms.find(r=>r[0]===m[1]);if(!row||row[3]===lg||row[3]==="*"||!D.nar[lg])return;S.narr="ms:"+D.nar[lg];$("narr").value=S.narr}
function pollVoices(n){if(!D||D.cat>0||n>8)return;setTimeout(async()=>{try{const r=await fetch("/api/voices").then(x=>x.json());if(r.cat>0){D.ms=r.ms;D.nar=r.nar;D.cat=r.cat;fillNarr()}else pollVoices(n+1)}catch(e){pollVoices(n+1)}},4000)}
function fillNarr(){if(!D)return;const cur=S.narr;const o=(v,t)=>`<option value="${esc(v)}">${esc(t)}</option>`;
 let h=groupVoices(D.ms,"Microsoft","ms:",o);
 h+=`<optgroup label="VieNeu — giọng có sẵn, tiếng Việt">${D.vp.map(([n,l])=>o("vp:"+n,n+" — "+l)).join("")}</optgroup>`;
 if(D.mine.length)h+=`<optgroup label="Giọng clone của bạn (voices/*.wav)">${D.mine.map(([k,l])=>o(k,l+" — giọng clone")).join("")}</optgroup>`;
 if(D.az.key_set)h+=groupVoices(D.az.voices.map(([s,l,g,loc])=>[s,l,loc]),"Azure","az:",o);
 $("narr").innerHTML=h;const ok=[...$("narr").options].some(x=>x.value===cur);$("narr").value=ok?cur:$("narr").options[0].value;if(!ok)S.narr=$("narr").value;
 $("azregion").value=D.az.region||"";$("azkey").placeholder=D.az.key_set?"đã lưu key "+(D.az.key_tail||"")+" (để trống = giữ nguyên)":"dán key";
 $("azStat").textContent=D.az.key_set?`Đã lưu key · vùng ${D.az.region} · ${D.az.voices.length} giọng`:"Chưa có key Azure.";renderClone()}
function renderClone(){const el=$("cloneList");if(!el||!D)return;const own=D.own||[];
 el.innerHTML=own.length?own.map(k=>`<div class="line" style="margin-top:6px"><span>${esc(k)}</span><button class="btn sm ghost" type="button" data-del="${esc(k)}" aria-label="Xóa giọng ${esc(k)}">Xóa</button></div>`).join(""):"Chưa có giọng nào bạn tự thêm."}
$("cloneList").addEventListener("click",async e=>{const b=e.target.closest("[data-del]");if(!b)return;const k=b.dataset.del;
 const r=await api("/api/voice/clone/del",{key:k});D.mine=r.mine||D.mine;D.own=r.own||[];if(S.narr===k)S.narr="";fillNarr();chg();$("cloneStat").textContent=r.ok?"Đã xóa giọng «"+k+"».":""});
$("cloneAdd").onclick=async()=>{const f=$("cloneFile").files[0],nm=$("cloneName").value.trim(),st=$("cloneStat");
 if(!nm){st.textContent="⚠ Hãy đặt tên giọng.";return}if(!f){st.textContent="⚠ Hãy chọn file mẫu.";return}if(!$("cloneOk").checked){st.textContent="⚠ Hãy tick xác nhận bên dưới.";return}
 const b=$("cloneAdd");b.disabled=true;st.textContent="Đang xử lý file mẫu…";
 try{const r=await api("/api/voice/clone/add",{data:await fileData(f),name:nm,ok:true});if(r.error){st.textContent="⚠ "+r.error;b.disabled=false;return}
  D.mine=r.mine;D.own=r.own;S.narr=r.key;fillNarr();$("narr").value=r.key;chg();
  st.textContent="✔ Đã thêm giọng «"+r.key+"» và chọn làm giọng đọc. Bấm «Nghe thử» để nghe (lần đầu tải model nên hơi lâu).";
  $("cloneName").value="";$("cloneFile").value="";$("cloneOk").checked=false}catch(e){st.textContent="⚠ Không thêm được giọng."}b.disabled=false};
$("narr").addEventListener("change",()=>{S.narr=$("narr").value;chg()});
$("speed").addEventListener("input",()=>{S.speed=+$("speed").value;$("speedv").textContent=S.speed.toFixed(2).replace(/0$/,"")+"×";chg();schedulePlan()});
function volTxt(){return S.vol===0?"Tắt tiếng":S.vol+"%"}
$("vol").addEventListener("input",()=>{S.vol=+$("vol").value;$("volv").textContent=volTxt();chg()});
function volStep(d){S.vol=Math.max(0,Math.min(200,S.vol+d));$("vol").value=S.vol;$("volv").textContent=volTxt();chg()}
$("volDn").onclick=()=>volStep(-10);$("volUp").onclick=()=>volStep(10);
bind("music","music","check");
$("vTest").onclick=async()=>{const b=$("vTest");b.disabled=true;$("vMsg").textContent="Đang đọc mẫu…";
 const txt=(PLAN.lines[0]||"").slice(0,160);
 try{const r=await api("/api/voice/sample",{narrator:S.narr,text:txt,speed:S.speed,vol:S.vol,lang:S.lang});if(r.error){$("vMsg").textContent="";toast(r.error,true)}else{$("vMsg").textContent="";const a=$("vAud");a.style.display="block";a.src=r.url;a.play().catch(()=>{})}}catch(e){$("vMsg").textContent="";toast("Không đọc thử được.",true)}b.disabled=false};
$("azTest").onclick=async()=>{$("azStat").textContent="Đang kiểm tra…";const r=await api("/api/azure/test",{key:$("azkey").value.trim(),region:$("azregion").value.trim()});
 if(r.error){$("azStat").textContent="⚠ "+r.error;return}D.az=r.az;$("azkey").value="";fillNarr();$("azStat").textContent=`Kết nối được. Đã lưu key trên máy này · tải ${r.az.voices.length} giọng (${r.az.n_vi} giọng tiếng Việt).`};
$("azClear").onclick=async()=>{const r=await api("/api/azure/clear",{});D.az=r.az;if(S.narr.startsWith("az:"))S.narr="";fillNarr();chg();$("azStat").textContent="Đã xóa key Azure."};

/* ---------- phu de ---------- */
let FONTS=[];
const YFR={top:.12,middle:.5};
function fontCss(id){if(!id)return '"Segoe UI",system-ui,sans-serif';const f=FONTS.find(x=>x.id===id);if(!f)return '"Segoe UI",system-ui,sans-serif';return (f.user||f.bundled)?'"uf_'+f.id.replace(/[^a-z0-9]/gi,"_")+'"':`"${f.label}",system-ui,sans-serif`}
function fontWeight(s){const f=FONTS.find(x=>x.id===s.font);return s.weight==="regular"||(f&&!f.bold&&(f.user||f.bundled))?"400":"700"}
const clampf=(v,d)=>{v=+v;return isFinite(v)?Math.max(.03,Math.min(.97,v)):d};
const subCenter=()=>{const p=$("sp").getBoundingClientRect(),r=$("spt").getBoundingClientRect();return {px:(r.left+r.width/2-p.left)/p.width,py:(r.top+r.height/2-p.top)/p.height}};
function renderSub(){const s=S.sub;const el=$("sp"),t=$("spt");el.dataset.a=S.aspect;el.style.setProperty("--ar",S.aspect==="9:16"?"9/16":"16/9");
 const base=S.aspect==="9:16"?el.clientWidth:el.clientHeight;const k=(base||(S.aspect==="9:16"?169:180))/720;
 const yf=YFR[s.pos]!==undefined?YFR[s.pos]:(S.aspect==="16:9"?.8:.72);
 if(s.pos==="custom"){const px=clampf(s.px,.5),py=clampf(s.py,.88);t.style.left=(px*100)+"%";t.style.top=(py*100)+"%";t.style.bottom="auto";t.style.transform="translate(-50%,-50%)";t.style.width=Math.max(30,Math.min(86,200*Math.min(px,1-px)))+"%"}
 else{t.style.left="50%";t.style.transform="translateX(-50%)";t.style.width="86%";if(s.pos==="bottom"){t.style.top="auto";t.style.bottom=((1-(S.aspect==="9:16"?.9:.955))*100)+"%"}else{t.style.bottom="auto";t.style.top=(yf*100)+"%"}}
 t.style.fontSize=(s.size*k)+"px";t.style.fontFamily=fontCss(s.font);t.style.fontWeight=fontWeight(s);t.style.color=s.color;
 t.style.webkitTextStroke=(2*s.sw*k)+"px "+s.scolor;t.style.paintOrder="stroke fill";
 const sp=t.firstElementChild;const rgb=[1,3,5].map(i=>parseInt(s.bgcolor.slice(i,i+2),16));sp.style.background=s.bg?`rgba(${rgb[0]},${rgb[1]},${rgb[2]},.745)`:"none";sp.style.borderRadius=s.bg&&s.round?".45em":"0";sp.style.padding=s.bg?".1em .4em":"0";
 $("sSizev").textContent=s.size;$("sSwv").textContent=s.sw;$("sPosFree").style.display=s.pos==="custom"?"":"none";if(s.pos==="custom"){const px=clampf(s.px,.5),py=clampf(s.py,.88);$("sPx").value=Math.round(px*100);$("sPy").value=Math.round(py*100);$("sPxv").textContent=Math.round(px*100);$("sPyv").textContent=Math.round(py*100)}
 $("sBgOpts").style.opacity=s.bg?1:.45;$("sBgOpts").style.pointerEvents=s.bg?"":"none";
 $("subOpts").style.opacity=S.subs?1:.45;$("subOpts").style.pointerEvents=S.subs?"":"none"}
const subK=(id,key,kind)=>{const el=$(id);const put=()=>{if(kind==="check")el.checked=!!S.sub[key];else el.value=S.sub[key]};put();REPAINT.push(put);
 el.addEventListener(kind==="check"?"change":"input",()=>{S.sub[key]=kind==="check"?el.checked:kind==="num"?+el.value:el.value;renderSub();chg()})};
subK("sSize","size","num");subK("sColor","color");subK("sScolor","scolor");subK("sSw","sw","num");subK("sBg","bg","check");subK("sBgcolor","bgcolor");subK("sRound","round","check");
seg("sPos",()=>S.sub.pos,v=>{if(v==="custom"&&S.sub.pos!=="custom"){const c=subCenter();S.sub.px=clampf(c.px,.5);S.sub.py=clampf(c.py,.88)}S.sub.pos=v;renderSub();chg()});
$("sPx").addEventListener("input",()=>{S.sub.px=+$("sPx").value/100;renderSub();chg()});$("sPy").addEventListener("input",()=>{S.sub.py=+$("sPy").value/100;renderSub();chg()});
(()=>{const t=$("spt"),el=$("sp");let dr=null;     // keo chu mau toi cho tuy y
 t.addEventListener("pointerdown",e=>{if(!S.subs)return;e.preventDefault();const c=subCenter();dr={x:e.clientX,y:e.clientY,px:c.px,py:c.py,moved:false};try{t.setPointerCapture(e.pointerId)}catch(x){}t.classList.add("drag")});
 t.addEventListener("pointermove",e=>{if(!dr)return;const p=el.getBoundingClientRect(),dx=(e.clientX-dr.x)/p.width,dy=(e.clientY-dr.y)/p.height;if(!dr.moved&&Math.abs(dx)+Math.abs(dy)<.004)return;dr.moved=true;S.sub.pos="custom";S.sub.px=clampf(dr.px+dx,.5);S.sub.py=clampf(dr.py+dy,.88);renderSub()});
 const end=()=>{if(!dr)return;const m=dr.moved;dr=null;t.classList.remove("drag");if(m){REPAINT.forEach(f=>f());chg()}};
 t.addEventListener("pointerup",end);t.addEventListener("pointercancel",end)})();seg("sWeight",()=>S.sub.weight,v=>{S.sub.weight=v;renderSub();chg()});
bind("subs","subs","check",renderSub);bind("srt","srt","check");
$("sFont").addEventListener("change",()=>{S.sub.font=$("sFont").value;renderSub();chg()});
$("sReset").onclick=()=>{S.sub=Object.assign({},SUBDEF);REPAINT.forEach(f=>f());$("sFont").value="";renderSub();chg()};
async function loadFonts(){try{const r=await api("/api/fonts");FONTS=r.fonts||[];
 let css="";FONTS.filter(f=>f.user||f.bundled).forEach(f=>{css+=`@font-face{font-family:"uf_${f.id.replace(/[^a-z0-9]/gi,"_")}";src:url("/api/fontfile?id=${encodeURIComponent(f.id)}")}`});
 if(css){const st=document.createElement("style");st.textContent=css;document.head.appendChild(st)}
 $("sFont").innerHTML=`<option value="">Mặc định (Segoe UI)</option>`+FONTS.map(f=>`<option value="${esc(f.id)}">${esc(f.label)}${f.user?" (của bạn)":""}</option>`).join("");
 $("sFont").value=FONTS.some(f=>f.id===S.sub.font)?S.sub.font:"";if($("sFont").value!==S.sub.font)S.sub.font="";
 $("sFontNote").innerHTML=`Muốn thêm font: bỏ file .ttf hoặc .otf vào thư mục font rồi tải lại trang. Chọn font có đủ dấu tiếng Việt. <a href="#" id="fontDir" style="color:var(--blue);font-weight:700">Mở thư mục font</a>`;
 $("fontDir").onclick=e=>{e.preventDefault();api("/api/openfolder",{which:"fonts"})};renderSub()}catch(e){}}

/* ---------- may ve ---------- */
function engName(){return S.engine==="gemini"?"Gemini":S.engine==="chatgpt"?"ChatGPT":"Flow"}
function renderEng(){seg_engPaint();$("engTitle").textContent=S.engine==="gemini"?"Gemini (tab trình duyệt)":S.engine==="chatgpt"?"ChatGPT (tab trình duyệt)":"Google Flow";renderSummary()}
let seg_engPaint=()=>{};
seg_engPaint=seg("engSeg",()=>S.engine,v=>{S.engine=v;renderEng();chg()});
seg("modeSeg",()=>S.mode,v=>{S.mode=v;chg()});
bind("browser","browser","num");bind("flowtabs","flowtabs","num");bind("hideflow","hideflow","check");bind("reflax","reflax","check");
$("login").onclick=async()=>{$("fmsg").textContent="Đang mở…";try{await api("/api/flow/login",{browser:+S.browser})}catch(e){$("fmsg").textContent="Lỗi gọi tool: "+e}};
$("opentabs").onclick=async()=>{const r=await api("/api/flow/tabs",{n:+S.flowtabs,browser:+S.browser,hide:S.hideflow,engine:S.engine});if(r.busy)toast("Đang mở tab, đợi xong rồi hãy bấm lại.",true);else if(r.error)toast(r.error,true)};
$("hideflow").addEventListener("change",()=>api("/api/flow/hide",{hide:$("hideflow").checked}));

/* ---------- tab cai dat ben phai ---------- */
function showPane(id){S.tab=id;qsa("#rtabs button").forEach(b=>b.setAttribute("aria-selected",String(b.dataset.p===id)));qsa(".pane").forEach(p=>p.classList.toggle("on",p.id===id));if(id==="pSub")renderSub();saveSoon()}
$("rtabs").onclick=e=>{const b=e.target.closest("button[data-p]");if(b)showPane(b.dataset.p)};
seg("aspectSeg",()=>S.aspect,v=>{S.aspect=v;applyAspect();chg()});seg("resSeg",()=>S.res,v=>{S.res=v;chg()});seg("fpsSeg",()=>S.fps,v=>{S.fps=v;chg()});
seg("sizeSeg",()=>S.size,v=>{S.size=+v;applySize();saveSoon()});
function applyAspect(){document.documentElement.style.setProperty("--ar",S.aspect==="9:16"?"9/16":"16/9");renderSub()}
function applySize(){$("frames").style.setProperty("--fw",S.size+"px")}

/* ---------- thanh tac vu + bat dau ---------- */
let J={state:"idle",pct:0,frames:[],review:[],log:[],msg:"",mode:""},FL={state:"off"};
const jobBusy=()=>J.state==="running"||J.state==="paused";
const otherBusy=()=>jobBusy()&&J.mode!=="draw";
function renderSummary(){const n=scenesOf();const tp=tplBy(S.tpl);const eng=engName();
 if(jobBusy()&&J.mode==="draw"){return}
 if(otherBusy()){$("goNew").style.display="none";$("dl1").textContent="Tab Tạo Video Story đang dựng video";$("dl2").textContent="Đợi video đó xong rồi hãy bắt đầu ở đây.";$("dl2").className="l2 warn";$("go").disabled=true;return}
 $("dl1").textContent=n?`${n} cảnh · khoảng ${fmt(PLAN.secs)}`:"Dán truyện hoặc kịch bản để bắt đầu";
 let warn="";if(n>150)warn=`${n} cảnh là nhiều, vẽ sẽ lâu. Bạn có thể chia lời kể thành nhiều video.`;
 $("dl2").className="l2"+(warn?" warn":"");$("dl2").textContent=warn||`${tp?tp[1]:"Prompt tự viết"} · ${fxBy(S.fx).n} · ${eng} · ${S.aspect}`;
 const m=(MATCH&&MATCHTXT===S.text.trim())?MATCH:null;
 if(n&&m&&m.done>0){const full=m.total>0&&m.done>=m.total,miss=Math.max(0,m.total-m.done);          /* da co anh cua chinh loi ke nay: nut to KHONG BAO GIO xoa ve lai tu dau */
  GOMODE=full?"finish":"resume";$("go").disabled=false;$("goTxt").textContent=full?"Hoàn thành video":`Vẽ tiếp ${miss} cảnh còn thiếu`;
  $("dl1").textContent=`Đã có ${m.done}/${m.total} ảnh${full?"":` · còn thiếu ${miss}`}`;$("dl2").className="l2";$("dl2").textContent=full?"Đã đủ ảnh. Bấm để làm video từ các ảnh này, không vẽ lại gì cả.":"Ảnh đã vẽ được giữ nguyên, chỉ vẽ những cảnh còn thiếu.";
  $("goNew").style.display="";return}
 GOMODE="fresh";$("goNew").style.display="none";
 $("go").disabled=!n;$("goTxt").textContent=n?`Vẽ ${n} cảnh`:"Bắt đầu vẽ"}
let MATCH=null,MATCHTXT="",GOMODE="fresh",matchSeq=0,matchT=0,matchSig="";
async function loadMatch(){const seq=++matchSeq,tx=S.text.trim();if(!tx){MATCH=null;MATCHTXT="";renderDock();return}
 try{const r=await api("/api/draw/match",{text:tx});if(seq!==matchSeq)return;MATCH=r.match||null;MATCHTXT=tx}catch(e){return}renderDock()}
function matchSoon(){clearTimeout(matchT);matchT=setTimeout(loadMatch,500)}
function payload(){const u=S.sub;return {mode:"draw",text:S.text.trim(),lang:S.lang,aspect:S.aspect,res:S.res,fps:+S.fps,narrator:S.narr,voice:0,speed:S.speed,vol:S.vol,music:S.music,amb:false,subs:S.subs,srt:S.srt,
 sub_style:{font:u.font,pos:u.pos,px:u.px,py:u.py,size:u.size,color:u.color,scolor:u.scolor,sw:u.sw,bg:u.bg,bgcolor:u.bgcolor,round:u.round,weight:u.weight},
 revfx:S.fx,revdur:S.revdur,revdir:S.revdir,revauto:!!S.revauto,ptpl:S.tpl,ptpl_text:S.ptext.trim(),use_ref:!!(S.useref&&REF.has),ref_lax:!!S.reflax,img_engine:S.engine,browser:+S.browser,flow_tabs:+S.flowtabs,hide_flow:S.hideflow,review:S.mode==="studio",ai:0,motion:"off",frames:true}}
function ovr(){const p=payload();const k=["narrator","voice","speed","vol","music","subs","srt","sub_style","revfx","revdur","revdir","revauto","img_engine","browser","flow_tabs","hide_flow","review","res","fps","use_ref"];const o={};k.forEach(x=>o[x]=p[x]);o.refimg_name=(p.use_ref&&REF.has)?REF.file:"";return o}          /* tiep tuc du an: dung anh tham chieu DANG CHON, khong dung anh da luu trong du an cu */
async function start(extra){if(!S.text.trim()){toast("Hãy dán truyện hoặc kịch bản trước.",true);return}
 $("err").textContent="";const body=Object.assign(payload(),extra||{});const r=await api("/api/generate",body);
 if(r.error){toast(r.error,true);if(r.match)loadMatch();return}
 began()}
async function goClick(){if(GOMODE==="fresh"||!MATCH)return start();
 $("err").textContent="";const r=await api("/api/generate",{resume:MATCH.id,finish_now:GOMODE==="finish",override:ovr()});
 if(r.error){toast(r.error,true);loadMatch();return}
 began()}
$("goNew").onclick=async()=>{const m=MATCH;if(!m)return start();
 if(!confirm(`VẼ LẠI TỪ ĐẦU?\n\nDự án này đã có ${m.done}/${m.total} ảnh. Bấm OK sẽ XÓA kết quả cũ và vẽ lại TẤT CẢ ảnh (rất lâu).\n\nMuốn giữ ảnh thì bấm Hủy, rồi dùng nút «Hoàn thành video» / «Vẽ tiếp».`))return;
 start({restart_ok:true})};
function began(){RUNTEXT=S.text;textDirty=false;$("result").style.display="none";FRN=0;PICK.clear();setTimeout(async()=>{try{await refresh()}catch(e){}$("secRun").scrollIntoView({behavior:"smooth",block:"start"})},500)}
$("go").onclick=goClick;
$("stop").onclick=()=>api("/api/cancel",{});
async function saveVideo(v,href){const r=await api("/api/savevideo",{video:v});if(r.fallback){location.href=href;return}if(r.error){toast(r.error,true);return}if(r.ok)toast("Đã lưu video: "+r.path)}
$("dl").onclick=e=>{const v=$("dl").dataset.v;if(!v)return;e.preventDefault();saveVideo(v,$("dl").href)};
$("bFolder").onclick=()=>api("/api/openfolder",{});
$("failretry").onclick=()=>api("/api/retry",{});$("failskip").onclick=()=>api("/api/retry",{skip:true});

/* ---------- bang phan canh ---------- */
let FRN=0,FRMODE="",FRC={};const PICK=new Set();
function frameHTML(i){return `<article class="fr s-pending" data-n="${i+1}"><div class="th"><img alt=""><span class="num">${i+1}</span><span class="big">${i+1}</span><span class="lbl">đang vẽ…</span><label class="pick" title="Chọn để vẽ lại"><input type="checkbox" aria-label="Vẽ lại cảnh ${i+1}"></label><div class="acts"><button type="button" data-a="view">Xem</button><button type="button" data-a="redo">Vẽ lại</button><button type="button" data-a="retry" class="rt">Tạo lại</button></div></div><p class="cap"></p><p class="er"></p></article>`}
function boardItems(){const useJob=J.mode==="draw"&&J.frames&&J.frames.length&&(jobBusy()||J.state==="done"||J.state==="error")&&!(textDirty&&!jobBusy());
 if(useJob)return {mode:"job",items:J.frames};return {mode:"plan",items:PLAN.lines.map((t,i)=>({n:i+1,text:t,url:"",state:"pending",sh:(PLAN.sh||[])[i]||0}))}}
function renderBoard(){const {mode,items}=boardItems();const box=$("frames");
 if(!items.length){box.innerHTML=`<div class="empty" style="grid-column:1/-1"><b>Chưa có cảnh nào</b>Dán truyện hoặc kịch bản vào bảng phía trên. AI sẽ đọc hiểu rồi chia thành các cảnh (khoảng 6 giây lời đọc mỗi cảnh), mỗi cảnh hiện ở đây thành một khung để vẽ.</div>`;FRN=0;FRMODE="";$("boardSub").textContent="";return}
 if(items.length!==FRN||mode!==FRMODE||!box.querySelector(".fr")){box.innerHTML=items.map((f,i)=>frameHTML(i)).join("");FRN=items.length;FRMODE=mode;FRC={}}
 const real=items.filter(f=>!f.sh),done=real.filter(f=>f.state==="done").length;
 $("boardSub").textContent=mode==="job"?`${done}/${real.length} ảnh đã vẽ`:`khoảng ${real.length} cảnh sẽ được vẽ`;
 const revN=new Set((J.review||[]).map(r=>+String(r.name).split(" ").pop()));const reviewing=mode==="job"&&revN.size>0;
 box.classList.toggle("review",reviewing);box.classList.toggle("drawing",mode==="job"&&jobBusy()&&!reviewing&&items.some(f=>f.state!=="done"));
 const idle=mode==="job"&&!jobBusy(),nErr=real.filter(f=>f.state==="error"||(idle&&f.state!=="done")).length;
 if(mode==="job"&&nErr)$("boardSub").textContent+=` · ${nErr} cảnh lỗi/chưa vẽ xong`;
 items.forEach((f,i)=>{const el=box.children[i];if(!el)return;const rv=reviewing&&revN.has(i+1);
  const stt=(idle&&f.state!=="done"&&f.state!=="error")?"error":f.state,why=f.state==="error"?(f.err||"Chưa nhận được ảnh."):(stt==="error"?"Chưa vẽ xong cảnh này.":"");
  const sig=stt+"|"+f.url+"|"+f.text+"|"+(rv?1:0)+"|"+(PICK.has(i+1)?1:0)+"|"+why+"|"+(f.sh?1:0);if(FRC[i]===sig)return;const was=FRC[i];FRC[i]=sig;
  const prev=was?was.split("|")[0]:"";el.className="fr s-"+stt+(rv?" rv":"")+(PICK.has(i+1)?" picked":"")+(f.sh?" sh":"");
  el.querySelector(".er").textContent=why;el.querySelector(".lbl").textContent=stt==="error"?"lỗi":"đang vẽ…";el.querySelector("[data-a=view]").textContent=stt==="error"?"Xem prompt":"Xem";
  const img=el.querySelector("img");if(f.url&&img.getAttribute("src")!==f.url)img.src=f.url;
  el.querySelector(".cap").textContent=f.text||"";el.querySelector(".pick input").checked=PICK.has(i+1);
  if(f.state==="done"&&prev&&prev!=="done"&&mode==="job"){el.classList.add("pop");setTimeout(()=>el.classList.remove("pop"),900)}});
 const bar=$("rvbar");bar.classList.toggle("on",reviewing);if(reviewing){const left=real.filter(f=>f.state!=="done").length;$("rvok").disabled=left>0;$("rvmsg").textContent=left?`Còn ${left} cảnh chưa có ảnh. Phải vẽ đủ ảnh mới hoàn thành được video.`:`${revN.size} ảnh mới vẽ. Ảnh nào chưa ưng thì tick rồi bấm Vẽ lại; ưng hết thì bấm Hoàn thành video.`;$("rvredo").disabled=!PICK.size;$("rvredo").textContent=PICK.size?`Vẽ lại ${PICK.size} ảnh đã chọn`:"Vẽ lại ảnh đã chọn"}}
$("frames").addEventListener("click",e=>{const el=e.target.closest(".fr");if(!el)return;const n=+el.dataset.n;
 const a=e.target.closest("button[data-a]");
 if(a){if(a.dataset.a==="view")openDlg(n);else redo(n);return}
 if(e.target.closest(".pick")){return}
 if(el.classList.contains("s-done"))openDlg(n)});
$("frames").addEventListener("change",e=>{const c=e.target.closest(".pick input");if(!c)return;const n=+c.closest(".fr").dataset.n;if(c.checked)PICK.add(n);else PICK.delete(n);renderBoard()});
async function redo(n){const r=await api("/api/frame/redo",{n});if(r.error)toast(r.error,true);else toast(r.resumed?"Đang tiếp tục: chỉ cảnh chưa có ảnh được gửi lại, ảnh đã vẽ giữ nguyên.":"Đã gửi lại đúng prompt của cảnh "+n+".")}
async function rvOk(){const r=await api("/api/review",{redo:[]});if(r&&r.error){toast(r.error,true);return}PICK.clear();J.review=[];renderBoard()}
$("rvok").onclick=rvOk;
$("rvredo").onclick=async()=>{const names=[...PICK].sort((a,b)=>a-b).map(n=>"Khung "+n);await api("/api/review",{redo:names});PICK.clear();J.review=[]; revSig="";renderBoard()};

/* ---------- chi tiet mot canh ---------- */
let DN=0,DP0="",DRV=false;
async function openDlg(n){const f=(J.frames||[])[n-1];if(!f)return;const noimg=!f.url;DN=n;if(noimg)$("dImg").removeAttribute("src");else $("dImg").src=f.url;$("dImg").style.display=noimg?"none":"";$("dTitle").textContent="Cảnh "+n;$("dText").textContent=f.text||"";$("dDl").href=f.url||"#";$("dDl").style.display=noimg?"none":"";$("dDl").download="canh-"+n+".png";
 $("dPrompt").value="Đang tải prompt…";DP0="";$("dEdited").style.display="none";$("dNote").textContent="";$("dlg").showModal();
 try{const r=await api("/api/frame/prompt?n="+n);DP0=r.prompt||"";$("dPrompt").value=DP0||"(Chưa có prompt cho cảnh này.)";$("dEdited").style.display=r.edited?"":"none"}catch(e){$("dPrompt").value=""}
 const busy=jobBusy();DRV=(J.review||[]).some(r=>+String(r.name).split(" ").pop()===n);const drawing=busy&&!DRV&&(J.frames||[]).some(x=>x.state!=="done");
 const canResume=!busy&&noimg&&J.mode==="draw";$("dRedo").textContent=DRV?(PICK.has(n)?"Bỏ chọn vẽ lại":"Chọn để vẽ lại"):(noimg?"Tạo lại với prompt này":"Vẽ lại với prompt này");$("dRedo").disabled=!(DRV||drawing||canResume);$("dRep").disabled=!busy||noimg;
 $("dNote").textContent=DRV?"Chọn để vẽ lại: ảnh được vẽ lại khi bạn bấm «Vẽ lại ảnh đã chọn». Nếu bạn sửa prompt ở trên, prompt mới sẽ được dùng.":drawing?"Vẽ lại: AI vẽ cảnh này ngay khi có tab rảnh. Sửa prompt ở trên nếu muốn đổi cách vẽ.":busy?"Chưa vẽ lại được lúc này. Đợi tới bước duyệt ảnh, hoặc đợi vẽ xong cảnh này.":"Video đã dựng xong nên không đổi ảnh được nữa. Chọn «Duyệt ảnh trước» ở mục Máy vẽ để sửa ảnh trước khi dựng."}
$("dClose").onclick=()=>$("dlg").close();
$("dlg").addEventListener("click",e=>{if(e.target===$("dlg"))$("dlg").close()});
$("dRedo").onclick=async()=>{const p=$("dPrompt").value;
 if(DRV){if(p.trim()&&p.trim()!==DP0.trim())await api("/api/frame/prompt",{n:DN,prompt:p});if(PICK.has(DN))PICK.delete(DN);else PICK.add(DN);$("dlg").close();renderBoard();return}const body={n:DN};if(p.trim()&&p.trim()!==DP0.trim())body.prompt=p;const r=await api("/api/frame/redo",body);if(r.error){toast(r.error,true);return}$("dlg").close();toast("Đã xếp hàng vẽ lại cảnh "+DN+".")};
$("dRep").onclick=()=>$("dFile").click();
$("dFile").onchange=async()=>{const f=$("dFile").files[0];$("dFile").value="";if(!f)return;const r=await api("/api/frame/replace",{n:DN,data:await fileData(f)});if(r.error){toast(r.error,true);return}$("dlg").close();toast("Đã thay ảnh cảnh "+DN+".")};

/* ---------- tien trinh ---------- */
const STEPS=[["mic","Đọc giọng"],["pen","Vẽ ảnh"],["film","Dựng video"],["check","Xong"]];
const ICO={mic:'<path d="M4 10v4h4l5 4V6L8 10z"/><path d="M16 9a4 4 0 0 1 0 6"/>',pen:'<path d="M4 20l4-1 11-11a2.1 2.1 0 0 0-3-3L5 16l-1 4z"/><path d="M14 7l3 3"/>',film:'<rect x="3" y="5" width="18" height="14" rx="2"/><path d="M7 5v14M17 5v14M3 9h4M3 15h4M17 9h4M17 15h4"/>',check:'<path d="M5 12l5 5 9-10"/>'};
let revSig="";
function stageOf(){if(J.state==="done")return 4;if(J.pct>=35)return 2;if(J.frames&&J.frames.length)return 1;return J.pct>=26?1:0}
function renderRun(){const show=J.mode==="draw"&&J.state!=="idle";$("secRun").style.display=show?"block":"none";if(!show)return;
 const st=stageOf();$("steps").innerHTML=STEPS.map(([ic,t],i)=>`<div class="${i<st?"ok":i===st?"on":""}"><svg class="i" viewBox="0 0 24 24">${i<st?ICO.check:ICO[ic]}</svg><span>${t}</span></div>`).join("");
 const running=jobBusy(),waiting=(J.review||[]).length>0;
 $("runTitle").textContent=J.state==="done"?"Video đã xong":J.state==="error"?(J.error==="Đã dừng."?"Đã dừng":"Gặp lỗi"):waiting?"Đang chờ bạn duyệt ảnh":J.state==="paused"?"Tạm dừng, cần bạn xử lý":"Đang vẽ và dựng video";
 $("runPct").textContent=Math.round(J.pct)+"%";$("trackI").style.width=J.pct+"%";$("track").classList.toggle("run",running&&!waiting&&J.state!=="paused");
 $("msg").textContent=J.msg||"";$("log").textContent=(J.log||[]).join("\n");$("log").scrollTop=1e9;
 const fl=J.fail;$("failbox").style.display=fl?"block":"none";if(fl){$("failwhat").textContent=fl.what;$("failerr").textContent=fl.err;$("failskip").style.display="none";
  const nE=(J.frames||[]).filter(f=>f.state==="error").length;$("failhint").style.display=nE&&fl.kind!=="missing"?"":"none";$("failretry").textContent=fl.kind==="missing"?"Vẽ tiếp các cảnh còn thiếu":nE>1?`Gửi lại tất cả ${nE} cảnh lỗi`:"Thử lại bước này";$("failskip").textContent=fl.kind==="missing"?"Dựng video ngay bằng ảnh đã có":"Bỏ qua, dùng lại ảnh trước"}
 $("err").textContent=J.state==="error"&&J.error?J.error:"";
 if(J.video&&(J.state==="done"||J.state==="running")){$("result").style.display="block";const u="/out/"+encodeURIComponent(J.video);if($("vid").dataset.u!==u){$("vid").src=u;$("vid").dataset.u=u;$("dl").href="/dl/"+encodeURIComponent(J.video);$("dl").dataset.v=J.video}}
 else if(!J.video)$("result").style.display="none"}
function renderDock(){const run=jobBusy()&&J.mode==="draw";$("stop").style.display=run?"":"none";$("dmini").style.display=run?"block":"none";
 if(run){const waiting=(J.review||[]).length>0,left=(J.frames||[]).filter(f=>!f.sh&&f.state!=="done").length;$("goNew").style.display="none";$("go").disabled=true;$("go").style.display=waiting?"":"none";$("goTxt").textContent=left?"Duyệt ảnh":"Hoàn thành video";
  $("dl1").textContent=waiting?"Chờ bạn duyệt ảnh":J.state==="paused"?"Tạm dừng, cần bạn xử lý":"Đang chạy · "+Math.round(J.pct)+"%";$("dl2").className="l2";$("dl2").textContent=waiting?"Tick ảnh chưa ưng để vẽ lại, hoặc bấm Hoàn thành video.":(J.msg||"").slice(0,120);$("dminiI").style.width=J.pct+"%";
  if(waiting){$("go").disabled=false;$("go").onclick=left?(()=>$("secBoard").scrollIntoView({behavior:"smooth",block:"start"})):rvOk}return}
 $("go").style.display="";$("go").onclick=goClick;renderSummary()}
function revWatch(){const sig=JSON.stringify((J.review||[]).map(i=>i.url));if(sig===revSig)return;revSig=sig;if((J.review||[]).length){try{$("secBoard").scrollIntoView({behavior:"smooth",block:"start"});document.title="⏸ Chờ duyệt ảnh · AnimStudio"}catch(e){}}else document.title="Vẽ ra · AnimStudio"}
function renderFlow(){const F=FL;const p=$("fpill");p.className="pill "+F.state;p.textContent={off:"chưa mở",opening:"đang chờ đăng nhập…",ready:"đã sẵn sàng",error:"lỗi"}[F.state]||"chưa mở";
 if(F.msg)$("fmsg").textContent=F.msg;$("tabstat").textContent=F.tabmsg||"";$("login").textContent={off:"Mở trình duyệt và đăng nhập",opening:"Không thấy cửa sổ? Bấm để mở lại",ready:"Trình duyệt đã sẵn sàng (bấm để đưa lên)",error:"Thử mở lại"}[F.state]||"Mở trình duyệt và đăng nhập"}
let ptick=0;
async function refresh(){const s=await api("/api/status");J=s.JOB;FL=s.FLOW;propTick(s.PROPS);
 {const sg=J.state+"|"+(J.project||"")+"|"+(J.frames||[]).filter(f=>f.state==="done").length+"|"+(J.video||"");if(sg!==matchSig){matchSig=sg;if(!jobBusy()||sg.endsWith("|"))matchSoon()}}
 renderFlow();renderRun();renderBoard();renderDock();revWatch();qsa("#projlist button").forEach(b=>b.disabled=jobBusy())}
async function poll(){try{if(++ptick%5===1)loadProjects();await refresh()}catch(e){}setTimeout(poll,1100)}

/* ---------- du an gan day ---------- */
let projsig="";
async function loadProjects(){try{const r=await api("/api/projects");const L=(r.projects||[]).filter(p=>p.mode==="draw").slice(0,8);const sig=JSON.stringify(L);if(sig===projsig)return;projsig=sig;
 $("secProj").style.display=L.length?"block":"none";
 const st={done:"Hoàn thành",video:"Có video, đang làm phần phụ",running:"Đang chạy",stopped:"Đã dừng",error:"Lỗi"};
 $("projlist").innerHTML=L.map(p=>`<div class="proj"><div class="pi"><b>${esc(p.title||"(không tên)")}</b><small>${esc(p.created||"")} · ${esc(st[p.status]||p.status||"")}${p.stage?" · "+esc(p.stage):""}${p.frames_total?` · ${p.frames_done||0}/${p.frames_total} ảnh`:""}${p.error&&p.status!=="done"?" · "+esc(p.error).slice(0,80):""}</small></div>
  <div class="row"><button class="btn sm" data-pj="resume" data-id="${p.id}" type="button">Tiếp tục</button>${p.frames_total&&p.frames_done>=p.frames_total&&!p.video?`<button class="btn sm hl" data-pj="finish" data-id="${p.id}" type="button">Hoàn thành video</button>`:""}${p.video?`<a class="btn sm" href="/out/${encodeURIComponent(p.video)}" target="_blank" rel="noopener">Xem video</a><button class="btn sm" data-pj="save" data-id="${p.id}" data-v="${esc(p.video)}" type="button">Lưu video</button>`:""}<button class="btn sm ghost" data-pj="folder" data-id="${p.id}" type="button">Mở thư mục</button><button class="btn sm ghost" data-pj="del" data-id="${p.id}" type="button">Xóa</button></div></div>`).join("")}catch(e){}}
$("projlist").onclick=async e=>{const b=e.target.closest("button[data-pj]");if(!b)return;const id=b.dataset.id,a=b.dataset.pj;
 if(a==="folder"){api("/api/openfolder",{project:id});return}
 if(a==="del"){if(confirm("XÓA HẲN dự án này?\n\nSẽ xóa luôn video, ảnh các khung và dữ liệu của dự án. Không khôi phục được.")){const d=await api("/api/project/delete",{id});if(d.error){toast(d.error,true)}else toast("Đã xóa dự án, video và ảnh.");projsig="";loadProjects()}return}
 if(a==="save"){saveVideo(b.dataset.v,"/dl/"+encodeURIComponent(b.dataset.v));return}
 const r=await api("/api/generate",{resume:id,finish_now:a==="finish",override:ovr()});if(r.error){toast(r.error,true);return}began()};

/* ---------- khoi dong ---------- */
(async()=>{
 let ui={};try{const [d,u]=await Promise.all([api("/api/init"),api("/api/drawui")]);D=d;ui=u.ui||{}}catch(e){toast("Không kết nối được tool.",true);return}
 $("ver").textContent="v"+D.version;
 S=Object.assign(JSON.parse(JSON.stringify(DEF)),ui);S.sub=Object.assign({},SUBDEF,ui.sub||{});if((ui.sub||{}).v!==2){if(+S.sub.sw===4)S.sub.sw=3;S.sub.v=2}
 if(!tplBy(S.tpl)&&S.tpl!=="")S.tpl=DEF.tpl;if(!S.ptext&&S.tpl)S.ptext=tplText(S.tpl);
 if(!FX.some(f=>f.k===S.fx))S.fx=DEF.fx;
 D.browsers.forEach((v,i)=>{const o=document.createElement("option");o.value=i;o.textContent=v;$("browser").appendChild(o)});
 fillNarr();pollVoices(0);renderTpls();renderFx();
 $("text").value=S.text;$("lang").value=S.lang;$("revdur").value=S.revdur;$("speed").value=S.speed;$("vol").value=S.vol;$("useref").checked=!!S.useref;
 $("ptext").value=S.ptext;REPAINT.forEach(f=>f());
 $("revdurv").textContent=(+S.revdur).toFixed(1)+" giây";$("speedv").textContent=(+S.speed).toFixed(2).replace(/0$/,"")+"×";$("volv").textContent=volTxt();
 if($("narr").value!==S.narr&&[...$("narr").options].some(x=>x.value===S.narr))$("narr").value=S.narr;
 applyAspect();applySize();renderPtextMeta();renderSub();showPane(S.tab||"pStyle");
 await Promise.all([loadRef(),loadProps(),loadFonts()]);
 doPlan();loadMatch();poll();window.addEventListener("resize",renderSub)})();
'''
