// Muse giả cho tab «So sánh song song»: trả lời đúng khuôn theo yêu cầu nhận được (dùng ở test viết kịch bản).
const CAST = 'One adult stick figure parent, tall, wearing a red shirt; one child stick figure, small, wearing a yellow shirt; both with smooth round white heads and no faces.';

// `total` = số mốc cần có trong dàn ý (mặc định 66 = video 9 phút).
function bibleReply(total = 66, { topic = 'Raised with yelling and raised with listening', skip = [] } = {}) {
  const arc = Array.from({ length: total }, (_, i) => {
    const n = i + 1;
    return skip.includes(n) ? '' : `${n} | AGE ${n} | Situation ${n}: the child spills milk at the kitchen table and the parent reacts differently on each side. | ${Math.max(5, 100 - n)} | ${Math.min(100, 90 + (n % 10))}`;
  }).filter(Boolean);
  return [
    `TITLE: ${topic}`, 'LEFT LABEL: raised with yelling', 'RIGHT LABEL: raised with listening', 'METER: confidence',
    `CHARACTERS: ${CAST}`,
    'LESSONS:', '- Stay calm before you speak', '- Ask a question before you judge', '- Praise effort, not only results',
    'CLOSING: Every child is shaped by the voices they hear every day.',
    'ARC:', ...arc, 'MSDONEabc123'
  ].join('\n');
}

// `bad(n, attempt)` có thể trả 'omit' (bỏ mốc), 'short' (thiếu cột) hoặc 'long' (lời đọc quá dài) để thử hỏi lại.
function beatLine(n, kind = '') {
  if (kind === 'omit') return '';
  if (kind === 'short') return `${n} | AGE ${n} | Caption ${n}`;
  const narration = kind === 'long' ? 'Narration that rambles on and on without ever stopping to take a breath. '.repeat(8) : `On the left the parent raises a voice at beat ${n}, while on the right the parent kneels and listens.`;
  return `${n} | AGE ${n} | Caption of beat ${n} | ${narration} | A small kitchen with a wooden table, a milk bottle spilled at the table edge, the child sitting on the right chair, parent standing behind | The parent leans toward the child and points sharply while the child shrinks into the chair | The parent kneels beside the chair at the child's eye level while the child sits up and looks back | ${Math.max(5, 100 - n)} | ${Math.min(100, 90 + (n % 10))}`;
}

function fakeMuse({ total = 66, bad = () => '', bibleSkip = [], topic } = {}) {
  const log = { bible: 0, parts: [], instructions: [] };
  const attemptOf = new Map();
  const ask = async (muse, instruction) => {
    log.instructions.push(instruction);
    if (!/Bây giờ viết CHI TIẾT các mốc/.test(instruction)) { log.bible++; return bibleReply(total, { skip: log.bible === 1 ? bibleSkip : [], topic }); }
    const [, a, b] = /các mốc (\d+) đến (\d+)/.exec(instruction).map(Number);
    log.parts.push([a, b]);
    const out = ['BEATS:'];
    for (let n = a; n <= b; n++) { const attempt = (attemptOf.get(n) || 0) + 1; attemptOf.set(n, attempt); const line = beatLine(n, bad(n, attempt)); if (line) out.push(line); }
    return out.join('\n') + '\nMSDONEabc123';
  };
  return { ask, log };
}

module.exports = { CAST, bibleReply, beatLine, fakeMuse };
