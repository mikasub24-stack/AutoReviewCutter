const test=require('node:test');
const assert=require('node:assert/strict');
const {createGate}=require('../src/notify-gate.cjs');

function clock(){
 let t=1000;const timers=[];
 return {now:()=>t,setTimer:(fn,ms)=>{const timer={fn,at:t+ms,unref(){}};timers.push(timer);return timer;},clearTimer:timer=>{const i=timers.indexOf(timer);if(i>=0)timers.splice(i,1);},
  advance:ms=>{t+=ms;for(const timer of timers.filter(x=>x.at<=t)){timers.splice(timers.indexOf(timer),1);timer.fn();}},timers};
}
test('first update goes out at once; a burst becomes one late update that carries the latest state',()=>{
 const c=clock(),sent=[];let state=0;const gate=createGate(()=>sent.push(state),{minMs:250,...c});
 state=1;gate();assert.deepEqual(sent,[1]);
 for(state=2;state<=40;state++)gate();state=40;
 assert.deepEqual(sent,[1],'trong 250 ms không gửi thêm');assert.equal(gate.pending(),true);assert.equal(c.timers.length,1,'chỉ một hẹn giờ cho cả loạt');
 c.advance(249);assert.deepEqual(sent,[1]);c.advance(1);assert.deepEqual(sent,[1,40],'gửi một lần, đúng trạng thái mới nhất');assert.equal(gate.pending(),false);
});
test('after a quiet period the next update is sent immediately again',()=>{
 const c=clock(),sent=[];const gate=createGate(()=>sent.push(c.now()),{minMs:250,...c});
 gate();c.advance(300);gate();assert.equal(sent.length,2);gate();assert.equal(sent.length,2,'lại trong 250 ms thì chờ');c.advance(250);assert.equal(sent.length,3);
});
test('minMs 0 keeps sending every update; flushNow sends a pending one at once',()=>{
 const sent=[];const every=createGate(()=>sent.push(1),{minMs:0});every();every();every();assert.equal(sent.length,3);
 const c=clock(),later=[];const gate=createGate(()=>later.push(1),{minMs:250,...c});gate();gate();assert.equal(later.length,1);gate.flushNow();assert.equal(later.length,2);assert.equal(gate.pending(),false);c.advance(1000);assert.equal(later.length,2,'không gửi lần nữa sau khi đã gửi gấp');
});
