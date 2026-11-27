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
// The same prompt plus one line that changes with every attempt. Earlier variation lines are replaced, so the prompt never piles them up.
function variantPrompt(prompt, attempt = 1) {
  const n = Math.max(1, Math.trunc(Number(attempt)) || 1);
  const kept = String(prompt || '').split('\n').filter(l => !LINE.test(l.trim()));
  while (kept.length && !kept[kept.length - 1].trim()) kept.pop();
  const detail = DETAILS[(n - 1) % DETAILS.length];
  return kept.join('\n') + `\nVARIATION ${n}: keep the same scene, camera, characters and action as described above; only ${detail} differ slightly from the previous attempt.`;
}
module.exports = { REPEAT_MESSAGE, isRepeatError, FRAME_MESSAGE, isFrameRefusal, variantPrompt };
