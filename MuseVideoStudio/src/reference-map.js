(function(root,factory){if(typeof module==='object'&&module.exports)module.exports=factory();else root.referenceMap=factory();})(typeof window!=='undefined'?window:globalThis,function(){
  function fileNumber(file){const name=file.split(/[\\/]/).pop().replace(/\.[^.]+$/,'');const m=name.match(/^(\d+)(?:\D|$)/)||name.match(/(?:prompt|scene|cảnh|ref|image|img)[ _-]*(\d+)/i)||name.match(/(?:^|[_ -])(\d+)$/);return m?Number(m[1]):null;}
  function mapReferences(items,files,{mode='shared'}={}){
    if(!Array.isArray(files)||files.some(f=>typeof f!=='string'))throw Error('Danh sách ảnh không hợp lệ.');
    if(!['shared','numbered','none'].includes(mode))throw Error('Chọn cách gắn ảnh tham chiếu.');
    const groups=new Map(),unused=[];
    if(mode==='numbered')for(const file of files){const n=fileNumber(file);if(n===null)unused.push(file);else{const list=groups.get(n)||[];list.push(file);groups.set(n,list);}}
    const used=new Set(),missing=[];
    const mapped=items.map((item,index)=>{
      const n=Number.isInteger(item.number)&&item.number>0?item.number:index+1;
      const refs=mode==='none'?[]:mode==='shared'?[...files]:[...(groups.get(n)||[])];
      if(mode==='numbered'&&!refs.length)missing.push(n);for(const file of refs)used.add(file);
      return {...item,references:refs,image:refs[0]||''};
    });
    return {items:mapped,missing,unmatched:mode==='numbered'?files.filter(f=>!used.has(f)):[],mode};
  }
  return {mapReferences,fileNumber};
});
