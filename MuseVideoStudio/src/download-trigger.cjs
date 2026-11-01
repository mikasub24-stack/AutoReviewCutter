// Host side of "download this clip". Tries, in order:
//   1. the "…" button beside the clip (Download = 2nd row of its menu),
//   2. a right-click on the clip (Download = 4th row),
//   3. a real mouse right-click on the clip (for pages that ignore scripted events).
// Each route is checked by muse-tracker.cjs (exact "Tải xuống" label, a menu that
// opened for this clip, the expected row) so a wrong row is never clicked. Problems
// that mean the clip itself cannot be trusted (changed result, ambiguous video) are
// thrown by the page function and stop everything; only menu problems move to the next route.
async function triggerDownload({id,signal,call,rightClick,delay,abortable,stopped}) {
  const check=()=>{if(signal?.aborted)throw stopped();};
  const run=(phase,extra={})=>abortable(call({id,phase,soft:true,...extra}),signal);
  const notes=[];
  async function waitMenu(first,budgetMs) {
    let action=first;const deadline=Date.now()+budgetMs;
    while(action.needsMenu&&Date.now()<deadline){
      await abortable(delay(200),signal);check();
      action=await run('menu');
      if(action.clicked&&!action.needsMenu)return {done:true};
      if(action.failed)return {done:false,note:action.note};
    }
    return {done:false,note:action.needsMenu?'menu mở rồi nhưng không thấy lệnh Tải xuống':action.note};
  }
  const routes=[
    {label:'nút … cạnh video',open:async()=>{
      let action=await run('auto');
      if(action.failed){await abortable(delay(300),signal);check();action=await run('auto');}     // thanh nút chỉ hiện khi rê chuột: sự kiện rê vừa gửi, thử lại một lần
      return action;
    },budget:4000},
    {label:'chuột phải vào video',open:()=>run('context'),budget:4000},
    {label:'chuột phải thật vào video',open:async()=>{
      const action=await run('point');
      if(action.failed||!action.point||typeof rightClick!=='function')return {failed:true,note:action.note||'không có thao tác chuột thật'};
      await abortable(rightClick(action.point.x,action.point.y),signal);return {needsMenu:true};
    },budget:4000}
  ];
  for(const route of routes){
    check();
    const action=await route.open();
    if(action.clicked&&!action.needsMenu)return;
    if(action.failed){notes.push(`${route.label}: ${action.note}`);continue;}
    const result=await waitMenu(action,route.budget);
    if(result.done)return;
    notes.push(`${route.label}: ${result.note||'không thấy lệnh Tải xuống'}`);
    await run('reset').catch(()=>{});
  }
  let near='';
  try{const info=await run('inspect');if(info.near?.length)near=` Biểu tượng gần clip: ${info.near.join(', ')}.`;}catch{}
  throw Error(`Chưa tìm thấy nút tải của đúng video (${notes.join('; ')}).${near} Mở phản hồi Muse, rồi bấm Lấy video đã tạo; không cần gửi lại prompt.`);
}
module.exports={triggerDownload};
