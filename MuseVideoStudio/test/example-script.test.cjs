const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { planScript } = require('../src/script-planner.js');
test('10-minute sample yields 60 ordered ten-second scene prompts without truncation',()=>{
  const text=fs.readFileSync(path.join(__dirname,'../examples/kich-ban-meo-song-gon-10-phut.txt'),'utf8');
  const scenes=planScript(text,{seconds:10,maxChars:350});
  assert.equal(scenes.length,60);
  assert.match(scenes[0].source,/00:00–00:10/);assert.match(scenes[59].source,/09:50–10:00/);
  scenes.forEach((scene,index)=>{assert.match(scene.prompt,/10 giây/);assert.ok(scene.source.startsWith(`Cảnh ${String(index+1).padStart(2,'0')}`));});
});
