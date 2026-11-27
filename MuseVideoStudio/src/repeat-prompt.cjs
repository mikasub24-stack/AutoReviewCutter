// Muse refuses a prompt it has already made ("Prompt này vẫn như cũ nên mình chưa tạo được. Bạn gửi bản đã chỉnh lại thì mình làm ngay").
// It answers in plain text and no clip ever comes, so the scene must be sent again with a small change.
const REPEAT_MESSAGE = 'Muse chưa tạo clip vì prompt giống lần gửi trước (Muse xin bản đã chỉnh lại).';
const isRepeatError = text => /prompt giống lần gửi trước/.test(String(text || ''));

// Muse cannot (or will not) make the clip from the attached first frame and asks for another frame. The wording contains "từ chối" and "nội dung" on
// purpose: the scene retry treats it like a content block (softer prompt, another account) instead of waiting for a clip that never comes.
const FRAME_MESSAGE = 'Muse từ chối làm clip từ khung hình này (nội dung bị chặn): Muse xin một khung hình đầu tiên khác.';
const isFrameRefusal = text => /Muse từ chối làm clip từ khung hình này/.test(String(text || ''));

const DETAILS = ['small gestures', 'soft light', 'tiny background details', 'the timing of the movement'];
const LINE = /^VARIATION \d+:/;
const INLINE = /\s*VARIATION \d+: [^\n]*$/;
const ACTION = /^ACTION:/;
// The same prompt with one note that changes with every attempt. Muse compares the ACTION line, so the note goes at the end of that line when the prompt
// has one (otherwise on a line of its own). Earlier notes are replaced, so the prompt never piles them up.
function variantPrompt(prompt, attempt = 1) {
  const n = Math.max(1, Math.trunc(Number(attempt)) || 1);
  const lines = String(prompt || '').split('\n').filter(l => !LINE.test(l.trim())).map(l => ACTION.test(l) ? l.replace(INLINE, '') : l);
  while (lines.length && !lines[lines.length - 1].trim()) lines.pop();
  const detail = DETAILS[(n - 1) % DETAILS.length];
  const note = `VARIATION ${n}: keep the same scene, camera, characters and action as described; only ${detail} may change slightly from the previous attempt.`;
  const at = lines.findIndex(l => ACTION.test(l));
  if (at >= 0) { lines[at] = lines[at].replace(/\s+$/, '') + ' ' + note; return lines.join('\n'); }
  return lines.join('\n') + '\n' + note;
}
module.exports = { REPEAT_MESSAGE, isRepeatError, FRAME_MESSAGE, isFrameRefusal, variantPrompt };
