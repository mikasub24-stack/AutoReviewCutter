const test=require('node:test');
const assert=require('node:assert/strict');
const {REPEAT_MESSAGE,isRepeatError,FRAME_MESSAGE,isFrameRefusal,variantPrompt}=require('../src/repeat-prompt.cjs');
const planPair=require('../src/pair-plan.js');

test('variantPrompt puts the note on the ACTION line (the line Muse compares), replaces older notes and keeps everything else untouched',()=>{
 const base='Create an 8-second clip.\nACTION: the boy opens a book.\nNo text anywhere.';
 const one=variantPrompt(base,1),two=variantPrompt(one,2),three=variantPrompt(two,3);
 assert.equal(one.split('\n').length,3,'không thêm dòng mới');assert.match(one.split('\n')[1],/^ACTION: the boy opens a book\. VARIATION 1: /);
 assert.equal(one.split('\n')[0],'Create an 8-second clip.');assert.equal(one.split('\n')[2],'No text anywhere.');
 assert.match(two.split('\n')[1],/^ACTION: the boy opens a book\. VARIATION 2: /);assert.equal(three.match(/VARIATION/g).length,1);
 assert.notEqual(one,two);assert.notEqual(two,three);
 assert.equal(variantPrompt(base+'\n\n',1),one,'dòng trống thừa ở cuối không đổi kết quả');
 assert.equal(variantPrompt(one,1),one,'cùng số lần thử cho cùng kết quả');
});
test('variantPrompt without an ACTION line adds the note as a last line and replaces it next time',()=>{
 const base='Line one\nLine two';
 const one=variantPrompt(base,1),two=variantPrompt(one,2);
 assert.match(one,/^Line one\nLine two\nVARIATION 1: /);assert.match(two,/^Line one\nLine two\nVARIATION 2: /);assert.equal(two.match(/VARIATION/g).length,1);
});
test('variantPrompt keeps every scene instruction and never touches the safety rewrite lines',()=>{
 const base=planPair.safeRetryPrompt('Create an 8-second clip.\nACTION: someone shouts at the boy.',1);
 const v=variantPrompt(base,1);assert.ok(v.includes('SAFETY REWRITE:'));assert.ok(v.startsWith('Create an 8-second clip.\nACTION: someone'));assert.match(v,/VARIATION 1: /);
});
test('the repeat error is recognised, and is not mistaken for a content block',()=>{
 assert.equal(isRepeatError(REPEAT_MESSAGE),true);assert.equal(isRepeatError(REPEAT_MESSAGE+' Tool đã thêm dòng biến thể vào prompt; bấm «Thử lại» để gửi bản mới.'),true);
 assert.equal(isRepeatError('Chưa thấy ô chat Muse.'),false);assert.equal(isRepeatError(''),false);assert.equal(isRepeatError(null),false);
 assert.equal(planPair.isPolicyError(REPEAT_MESSAGE),false,'không được kích hoạt nhánh «prompt an toàn hơn»');
 assert.equal(/gói Năm|Vĩnh viễn|FFmpeg|ffprobe|key/i.test(REPEAT_MESSAGE),false,'tự thử lại không bị loại');
});
test('the frame refusal is its own error and is handled like a content block by the scene retry (softer prompt, another account)',()=>{
 assert.equal(isFrameRefusal(FRAME_MESSAGE),true);assert.equal(isFrameRefusal(REPEAT_MESSAGE),false);assert.equal(isRepeatError(FRAME_MESSAGE),false);
 for(const plan of [planPair,require('../src/wild-plan.js'),require('../src/restore-plan.js')])assert.equal(plan.isPolicyError(FRAME_MESSAGE),true);
 assert.equal(/gói Năm|Vĩnh viễn|FFmpeg|ffprobe|key/i.test(FRAME_MESSAGE),false,'tự thử lại không bị loại');
});
