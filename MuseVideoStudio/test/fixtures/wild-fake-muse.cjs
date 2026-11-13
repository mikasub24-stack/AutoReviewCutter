// Muse giả cho tab «Động vật hoang dã»: trả lời đúng khuôn theo yêu cầu nhận được (dùng ở test viết kịch bản và test main).
const lock = 'adult male banded mongoose, sandy brown fur with darker transverse bands across the back, a small notch in the left ear';
function biblePlain(total, chapters) {
  const per = Math.floor(total / chapters), rest = total - per * chapters;
  return [
    'TIÊU ĐỀ: Cầy mangut', 'LOÀI: Cầy mangut sọc (Mungos mungo), châu Phi', 'SỰ THẬT:',
    ...['Cầy mangut sống thành đàn rất đông.', 'Chúng ăn côn trùng và bò sát nhỏ.', 'Con non được cả đàn bảo vệ.', 'Chúng canh gác hang theo ca luân phiên.', 'Mùa mưa là lúc nhiều con non chào đời.', 'Chúng đào bới đất để tìm thức ăn.'].map(x => '- ' + x),
    'NHÂN VẬT:', `1 | chính | đực trưởng thành | ${lock}`, '2 | rắn | rắn hổ mang | adult cobra with glossy dark olive scales and pale belly, two meters',
    'BỐI CẢNH: African savanna in the dry season, golden grass, acacia trees and termite mounds, low warm sun.',
    'ẢNH BÌA: the lead mongoose on a termite mound at sunrise',
    'CHƯƠNG:', ...Array.from({ length: chapters }, (_, i) => `${i + 1} | Chương ${i + 1} | ${per + (i < rest ? 1 : 0)} | diễn biến ${i + 1} | bình minh`),
    'MSDONEabc123'
  ].join('\n');
}
const sceneText = (n, { omit = false } = {}) => omit ? '' : [
  `CẢNH ${n}`, n % 5 === 0 ? 'LỜI: —' : `LỜI: Câu thuyết minh riêng của cảnh số ${n}.`, n === 1 || n % 4 === 1 ? 'NỐI: MỚI' : 'NỐI: TIẾP', 'NV: 1,2',
  n === 1 || n % 4 === 1 ? 'KHUNG: Wide shot at dawn, the mongoose stands on the mound in the centre, golden grass and an acacia tree.' : '',
  `HÀNH ĐỘNG: Telephoto shot number ${n}. 0-3s the mongoose scans the grass; 3-6s it turns left; 6-10s it walks forward slowly.`,
  `CUỐI: End state of scene ${n}: the mongoose walks left through tall grass, head up.`, 'ÂM THANH: wind', ''
].filter(x => x !== '').join('\n');

// Muse giả: trả lời đúng khuôn theo yêu cầu nhận được. `drop(n, attempt)` cho phép bỏ cảnh để thử hỏi lại.
function fakeMuse({ total = 130, chapters = 16, drop = () => false } = {}) {
  const log = { bible: 0, chapter: [], instructions: [] };
  const attemptOf = new Map();
  const ask = async (muse, instruction) => {
    log.instructions.push(instruction);
    if (!instruction.includes('HỒ SƠ PHIM (đã chốt)')) { log.bible++; return biblePlain(total, chapters); }
    const [, a, b] = /các cảnh (\d+)–(\d+)/.exec(instruction).map(Number);
    log.chapter.push([a, b]);
    const out = [];
    for (let n = a; n <= b; n++) { const attempt = (attemptOf.get(n) || 0) + 1; attemptOf.set(n, attempt); out.push(sceneText(n, { omit: drop(n, attempt) })); }
    return out.filter(Boolean).join('\n\n') + '\nMSDONEabc123';
  };
  return { ask, log };
}

module.exports = { biblePlain, sceneText, fakeMuse };
