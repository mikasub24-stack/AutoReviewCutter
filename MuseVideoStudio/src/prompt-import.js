/* Import prepared scene prompts without rewriting or sentence splitting. */
(function(root,factory){if(typeof module==='object'&&module.exports)module.exports=factory();else root.promptImport=factory();})(typeof window!=='undefined'?window:globalThis,function(){
  'use strict';
  const heading=/^[\t ]*(?:#{1,6}[\t ]*)?(PROMPT|SCENE|CẢNH)[\t ]*#?[\t ]*(\d{1,4})\b([^\n]*)$/gimu;
  const videoLabel=/^[\t ]*(?:VIDEO[\t ]+PROMPT|PROMPT[\t ]+VIDEO)(?:[^\n:]*)[:：][\t ]*\n?/im;
  const voiceLabel=/^[\t ]*(?:ENGLISH[\t ]+VOICEOVER|VOICE[ -]?OVER|NARRATION|LỜI[\t ]+DẪN)[\t ]*[:：][\t ]*(.*)$/im;
  function seconds(text){const m=text.match(/\b(\d+(?:\.\d+)?)\s*(?:seconds?|secs?|giây)\b/iu);return m?Number(m[1]):null;}
  function entry(body,title,header){
    const label=videoLabel.exec(body);
    let content=label?body.slice(label.index+label[0].length):body;
    const voice=voiceLabel.exec(content);
    const voiceover=voice?voice[1].trim():'';
    if(label&&voice)content=content.slice(0,voice.index);
    content=content.trim();
    // Section titles following a separately labelled voiceover never become jobs.
    if(!content)throw Error(`${title}: chưa có nội dung prompt.`);
    return {title,prompt:content,source:content,voiceover,durationSeconds:seconds(header)||seconds(content),references:[]};
  }
  function importPrompts(text,{mode='auto'}={}){
    if(typeof text!=='string'||!text.trim())throw Error('Dán prompt hoặc kịch bản trước.');
    if(!['auto','single','lines'].includes(mode))throw Error('Chế độ nhập prompt không hợp lệ.');
    const s=text.replace(/\r\n?/g,'\n').trim();let result=[];
    if(mode==='single')result=[entry(s,'Prompt 1','')];
    else if(mode==='lines')result=s.split('\n').map(x=>x.trim()).filter(Boolean).map((x,i)=>entry(x,`Prompt ${i+1}`,''));
    else {
      heading.lastIndex=0;const matches=[...s.matchAll(heading)];
      if(matches.length){
        result=matches.map((m,i)=>{
          let body=s.slice(m.index+m[0].length,matches[i+1]?.index??s.length).trim();
          // Support "Cảnh 1: action..." without throwing away inline scene content.
          const tail=m[3].trim();
          if(/^[:：]\s*\S/.test(tail))body=tail.replace(/^[:：]\s*/,'')+(body?'\n'+body:'');
          return {...entry(body,`${m[1]} ${m[2]}`,m[0]),number:Number(m[2])};
        });
      } else {
        const blocks=s.split(/^\s*(?:-{3,}|={3,})\s*$/m).map(x=>x.trim()).filter(Boolean);
        result=blocks.map((x,i)=>entry(x,`Prompt ${i+1}`,''));
      }
    }
    if(result.length>500)throw Error('Có hơn 500 prompt. Hãy chia thành các lượt nhỏ hơn.');
    return result;
  }
  return {importPrompts};
});
