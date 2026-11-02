/* Tab «Kể chuyện»: chia kịch bản thành cảnh, nhờ Muse viết prompt, cắt phụ đề.
   Chỉ dùng luật/mẫu chạy trên máy; không gọi API hay mô hình ngôn ngữ nào khác. */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.storyPlan = factory();
})(typeof window !== 'undefined' ? window : globalThis, function () {
  'use strict';
  const ASPECTS = ['16:9', '9:16', '1:1'];
  // Muse chỉ tạo clip tối đa 10 giây, nên mỗi cảnh không được dài hơn.
  const MAX_SECONDS = 10;
  const MAX_SCENES = 100;
  // Tiếng Việt đọc bình thường khoảng 14–15 ký tự mỗi giây.
  const CHARS_PER_SECOND = 14;
  const count = value => Array.from(String(value || '')).length;
  // Viết bằng tiếng Anh vì Muse hiểu ràng buộc âm thanh bằng tiếng Anh chắc hơn.
  const NO_SPEECH = 'Audio: no speech, no dialogue, no singing, no narration, no lip movement - characters stay silent with mouths closed. Only natural sound effects and ambient sounds (wind, water, footsteps, object sounds) and soft background music.';

  /* ---------- ngôn ngữ ---------- */
  const SCRIPTS = {
    ko: /[가-힯ᄀ-ᇿ]/g, ja: /[぀-ヿ]/g, zh: /[㐀-鿿]/g, ru: /[Ѐ-ӿ]/g,
    th: /[฀-๿]/g, ar: /[؀-ۿ]/g, hi: /[ऀ-ॿ]/g
  };
  // Chỉ các dấu đặc trưng tiếng Việt (không tính á, à, â, é, ê, ó, ô, ú… vì tiếng Tây Ban Nha/Pháp/Bồ Đào Nha cũng có).
  const VI_MARKS = /[ăơưđạảậẩẫầấặẳẵằắẹẻẽệểễềếịỉĩọỏỗộổồốợởỡờớụủũựửữừứỵỷỹ]/gi;
  const STOPWORDS = {
    en: 'the and of to in is that it was for with as his her they this have from not but you are'.split(' '),
    es: 'el la los las de que y en un una por con para es se no su al lo como más pero'.split(' '),
    fr: 'le la les des du de et en un une que qui est pour dans pas sur au avec ce il elle'.split(' '),
    de: 'der die das und ist nicht ein eine zu den mit von sie auf für sich dem auch'.split(' '),
    pt: 'o a os as de que e em um uma para com não se na no por mais como mas ao'.split(' '),
    id: 'yang dan di ke dari itu ini dengan untuk tidak pada adalah akan juga ada mereka'.split(' '),
    it: 'il lo la gli le di che e in un una per con non si da è sono del della ma'.split(' ')
  };
  // Số ký tự (kể cả khoảng trắng) đọc được trong một giây — chỉ để ước lượng độ dài lời đọc.
  const RATES = { vi: 14, en: 15, es: 16, fr: 15, de: 14, pt: 15, it: 15, id: 14, ru: 14, th: 11, ar: 13, hi: 14, zh: 4.5, ja: 7.5, ko: 8 };

  function detectLanguage(text) {
    const value = String(text || '').normalize('NFC');
    const hits = re => (value.match(re) || []).length;
    const letters = Math.max(1, hits(/\p{L}/gu));
    if (hits(SCRIPTS.ko) / letters > 0.2) return 'ko';
    if (hits(SCRIPTS.ja) / letters > 0.1) return 'ja';
    if (hits(SCRIPTS.zh) / letters > 0.2) return 'zh';
    for (const code of ['ru', 'th', 'ar', 'hi']) if (hits(SCRIPTS[code]) / letters > 0.3) return code;
    if (hits(VI_MARKS) / letters > 0.02) return 'vi';
    const words = value.toLowerCase().match(/\p{L}+/gu) || [];
    let best = 'en', top = 1;
    for (const [code, list] of Object.entries(STOPWORDS)) {
      const set = new Set(list);
      const score = words.filter(w => set.has(w)).length;
      if (score > top) { best = code; top = score; }
    }
    return best;
  }
  const charsPerSecond = language => RATES[language] || CHARS_PER_SECOND;
  const isCjk = language => language === 'zh' || language === 'ja';
  // Số ký tự tối đa của lời đọc để vừa trong một clip (chừa 10% cho nhịp nghỉ).
  const budgetChars = (seconds, language) => Math.max(8, Math.floor(seconds * charsPerSecond(language) * 0.9));
  const estimateSeconds = (text, language) => count(String(text || '').replace(/\s+/g, ' ').trim()) / charsPerSecond(language || detectLanguage(text));

  function options(input = {}) {
    const seconds = Number(input.seconds ?? MAX_SECONDS);
    if (!Number.isFinite(seconds) || seconds < 3 || seconds > MAX_SECONDS) throw Error(`Muse chỉ tạo clip tối đa ${MAX_SECONDS} giây: chọn mỗi cảnh từ 3 đến ${MAX_SECONDS} giây.`);
    const aspect = input.aspect || '16:9';
    if (!ASPECTS.includes(aspect)) throw Error('Chọn tỷ lệ 16:9, 9:16 hoặc 1:1.');
    return { seconds, aspect, style: String(input.style || '').trim(), character: String(input.character || '').trim() };
  }

  // Bỏ «Cảnh 3:», dấu markdown và khoảng trắng thừa khỏi lời đọc.
  function speechText(text) {
    return String(text || '')
      .replace(/^[\t ]*(?:#{1,6}[\t ]*)?\[?(?:Cảnh|Scene)[\t ]+\d+[A-Za-z]?\]?[\t ]*[:：.\-–—]?[\t ]*/i, '')
      .replace(/[*_`#>]+/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }

  /* ---------- tách câu / đoạn (mọi ngôn ngữ) ---------- */
  const ENDERS = '.!?…。！？｡';
  const CLOSERS = '"\'”’»」』）)]}';
  const ABBREVIATION = /(?:^|\s)(?:TS|ThS|PGS|GS|TP|Dr|Mr|Mrs|Ms|Prof|Sr|Jr|St|vs|Mme|Mlle|Hr|Fr|Sra|Sr|Dra|etc|No)\.?$/i;
  function splitSentences(text) {
    const value = String(text || '').replace(/\s+/g, ' ').trim();
    const parts = [];
    let start = 0;
    for (let i = 0; i < value.length; i++) {
      const mark = value[i];
      if (!ENDERS.includes(mark)) continue;
      const cjkMark = '。！？｡'.includes(mark);
      if (mark === '.') {
        if (/\d/.test(value[i - 1] || '') && /\d/.test(value[i + 1] || '')) continue;
        if (ABBREVIATION.test(value.slice(Math.max(start, i - 12), i))) continue;
        if (/(?:^|\s)\p{Lu}$/u.test(value.slice(Math.max(start, i - 2), i))) continue;
      }
      let end = i + 1;
      while (end < value.length && ENDERS.includes(value[end])) end++;
      while (end < value.length && CLOSERS.includes(value[end])) end++;
      if (!cjkMark && end < value.length && value[end] !== ' ') continue;
      const part = value.slice(start, end).trim();
      if (part) parts.push(part);
      start = end; i = end - 1;
    }
    const rest = value.slice(start).trim();
    if (rest) parts.push(rest);
    return parts;
  }
  const joinText = (a, b) => (/[　-鿿＀-￯]$/.test(a) ? a + b : a + ' ' + b);
  // Cắt một câu quá dài: ưu tiên dấu phẩy/chấm phẩy, rồi khoảng trắng, cuối cùng mới cắt giữa chữ (chữ Hán/Nhật).
  function splitLong(sentence, limit) {
    const clauses = sentence.split(/(?<=[,;:])\s+|(?<=[，；：、])\s*/).filter(Boolean);
    const pieces = [];
    let current = '';
    const push = unit => {
      if (!current) current = unit;
      else if (count(joinText(current, unit)) <= limit) current = joinText(current, unit);
      else { pieces.push(current); current = unit; }
    };
    for (const clause of clauses) {
      if (count(clause) <= limit) { push(clause); continue; }
      for (const word of clause.split(/\s+/).filter(Boolean)) {
        if (count(word) <= limit) { push(word); continue; }
        const chars = Array.from(word);
        for (let k = 0; k < chars.length; k += limit) push(chars.slice(k, k + limit).join(''));
      }
    }
    if (current) pieces.push(current);
    return pieces;
  }
  // Gộp câu thành các đoạn không dài quá `limit` ký tự (mỗi đoạn = lời đọc của một cảnh).
  function groupSentences(text, limit) {
    const groups = [];
    let current = '';
    for (const sentence of splitSentences(text)) {
      for (const piece of count(sentence) > limit ? splitLong(sentence, limit) : [sentence]) {
        if (!current) current = piece;
        else if (count(joinText(current, piece)) <= limit) current = joinText(current, piece);
        else { groups.push(current); current = piece; }
      }
    }
    if (current) groups.push(current);
    return groups;
  }

  /* ---------- hiểu cấu trúc kịch bản ---------- */
  const fold = value => String(value || '').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/gi, 'd').toLowerCase().replace(/\s+/g, ' ').trim();
  // Nhãn «lời đọc» và «hình ảnh/chỉ dẫn» (đã bỏ dấu, chữ thường). Các ngôn ngữ phổ biến.
  const VOICE_LABELS = new Set(['loi', 'loi dan', 'loi ke', 'loi doc', 'loi binh', 'thuyet minh', 'nguoi ke', 'nguoi ke chuyen', 'dan truyen',
    'narrator', 'narration', 'voiceover', 'voice over', 'voice-over', 'vo', 'v.o.', 'voice', 'narracion', 'narrador', 'narrateur', 'sprecher', 'erzahler', 'narrazione', 'narrasi', 'narracao',
    '旁白', '解说', '解說', 'ナレーション', '내레이션', 'закадровый голос', 'диктор', 'рассказчик']);
  const VISUAL_LABELS = new Set(['hinh', 'hinh anh', 'canh quay', 'mo ta', 'mo ta hinh anh', 'mo ta canh', 'boi canh', 'goc may', 'may quay', 'hieu ung', 'am thanh', 'nhac', 'nhac nen',
    'visual', 'visuals', 'video', 'shot', 'setting', 'camera', 'action', 'sfx', 'music', 'sound', 'description', 'scene description',
    'imagen', 'escena', 'accion', 'sonido', 'musica', 'image', 'visuel', 'plan', 'ambiance', 'bild', 'szene', 'kamera', 'ton', 'musik', 'imagem', 'cena', 'som',
    '画面', '畫面', '镜头', '鏡頭', '场景', '場景', '音效', '音乐', '音樂', '映像', '画像', '効果音', '音楽', '화면', '영상', '효과음', '음악', 'кадр', 'видео', 'звук', 'музыка']);
  const HEAD_WORD = '(?:cảnh|canh|scene|escena|scène|szene|cena|сцена|场景|場景|シーン|장면|第)';
  const HEADING = new RegExp('^\\[?' + HEAD_WORD + '[\\t ]*(\\d+)[A-Za-z]?(?:幕|场|場|場面)?\\]?(?=[\\t :：.\\-–—)]|$)[\\t ]*[:：.\\-–—)]*[\\t ]*(.*)$', 'iu');
  const SCRIPT_LABEL = /^([^:：\n]{1,24}?)[\t ]*[:：][\t ]*(.*)$/;
  const DIRECTION = /^[(（\[【]([^)）\]】]+)[)）\]】]$/;
  const bare = line => line.replace(/\*\*|__/g, '').replace(/^[\t ]*(?:#{1,6}[\t ]*)?(?:[-•][\t ]+|\*[\t ]+)?/, '').trim();

  // Tách kịch bản thành các khối: lời đọc (đọc thành tiếng) tách khỏi mô tả hình ảnh/chỉ dẫn (không đọc).
  function readScript(script) {
    const lines = String(script || '').replace(/\r\n?/g, '\n').split('\n').map(bare);
    const kindOf = line => {
      const label = line.match(SCRIPT_LABEL);
      if (label) { const key = fold(label[1]); if (VOICE_LABELS.has(key)) return 'voice'; if (VISUAL_LABELS.has(key)) return 'visual'; }
      return DIRECTION.test(line) && !HEADING.test(line) ? 'visual' : '';
    };
    const labelled = lines.some(line => line && kindOf(line));
    const headed = lines.some(line => HEADING.test(line));
    const blocks = [];
    let current = null, mode = 'voice';
    const open = title => { current = { title, voice: [], visual: [] }; blocks.push(current); mode = 'voice'; return current; };
    const add = (kind, text) => { const t = text.trim(); if (t) (current || open(''))[kind].push(t); };
    for (const line of lines) {
      if (!line) { mode = 'voice'; continue; }
      const heading = line.match(HEADING);
      if (heading) {
        open(`Cảnh ${heading[1]}`);
        if (heading[2].trim()) handle(heading[2].trim(), true);
        continue;
      }
      handle(line);
    }
    function handle(line, afterHeading) {
      const kind = labelled ? kindOf(line) : '';
      // «Cảnh 1 – Bến sông»: phần sau số cảnh không có dấu kết câu là TÊN cảnh (bối cảnh), không đọc thành tiếng.
      if (!kind && afterHeading && labelled && !/[.!?…。！？]["”'’)]*$/.test(line)) { mode = 'voice'; add('visual', line); return; }
      if (kind) {
        const label = line.match(SCRIPT_LABEL);
        const direction = line.match(DIRECTION);
        const text = label && (VOICE_LABELS.has(fold(label[1])) || VISUAL_LABELS.has(fold(label[1]))) ? label[2] : (direction ? direction[1] : line);
        // Không có tiêu đề «Cảnh N»: mô tả hình ảnh xuất hiện sau lời đọc là mở đầu của cảnh kế tiếp.
        if (kind === 'visual' && !headed && current && current.voice.length) open('');
        mode = kind;
        add(kind, text);
      } else add(mode, line);
    }
    return { blocks: blocks.filter(b => b.voice.length || b.visual.length), labelled, headed };
  }
  const blockText = list => list.join(' ').replace(/\s+/g, ' ').trim();
  // Phần lời đọc của kịch bản (đã bỏ nhãn, chỉ dẫn và mô tả hình ảnh) — chuẩn để đối chiếu.
  function scriptVoice(script) {
    return readScript(script).blocks.map(b => blockText(b.voice)).filter(Boolean).join(' ');
  }

  function scenePrompt(voiceover, config, visual = '') {
    return [
      `Tạo video dài ${config.seconds} giây, tỷ lệ ${config.aspect}, thể hiện đúng cảnh dưới đây.`,
      '',
      visual ? 'HÌNH ẢNH THEO KỊCH BẢN (làm đúng như mô tả):' : '',
      visual || '',
      voiceover ? 'NỘI DUNG CẢNH (lời kể, chỉ để hiểu cảnh; nhân vật không nói):' : '',
      voiceover || '',
      '',
      config.character ? `Nhân vật: ${config.character}` : '',
      config.style ? `Phong cách hình ảnh: ${config.style}` : '',
      'Nhân vật chính giữ đúng khuôn mặt, trang phục và thiết kế như trong ảnh tham chiếu, ở mọi cảnh.',
      `Chỉ một khoảnh khắc liên tục trong ${config.seconds} giây, không chuyển cảnh; thể hiện đúng người, nơi chốn, thời gian, hành động và nét mặt được nêu.`,
      'Chuyển động: tự nhiên, mượt; không tự thêm nhân vật, sự kiện hay địa điểm, không bỏ chi tiết quan trọng.',
      'Máy quay: khung hình rõ ràng, chuyển động nhẹ hoặc cố định.',
      NO_SPEECH,
      'Không chèn chữ, phụ đề hoặc logo vào hình.'
    ].filter((line, index, lines) => line !== '' || (index > 0 && lines[index - 1] !== '')).join('\n');
  }

  function makeScene(index, voiceover, visual, config) {
    return { title: `Cảnh ${index}`, source: voiceover || visual, voiceover, visual: visual || '', prompt: scenePrompt(voiceover, config, visual), durationSeconds: config.seconds };
  }

  // Chia nhanh ngay trên máy: gộp câu cho vừa thời lượng mỗi cảnh. Dùng khi chưa cần Muse đọc kịch bản.
  function planStory(script, input = {}) {
    const config = options(input);
    if (typeof script !== 'string' || !script.trim()) throw Error('Dán kịch bản trước khi chia cảnh.');
    const read = readScript(script);
    const language = detectLanguage(read.blocks.map(b => blockText(b.voice)).join(' ') || script);
    const limit = budgetChars(config.seconds, language);
    const scenes = [];
    for (const block of read.blocks) {
      const voice = blockText(block.voice), visual = blockText(block.visual);
      const parts = voice ? groupSentences(voice, limit) : [''];
      parts.forEach(part => { const text = speechText(part); if (text || visual) scenes.push(makeScene(scenes.length + 1, text, visual, config)); });
      if (scenes.length > MAX_SCENES) throw Error('Kịch bản tạo hơn 100 cảnh. Hãy chia thành nhiều lượt hoặc tăng giới hạn ký tự mỗi cảnh.');
    }
    return scenes;
  }

  // Câu lệnh gửi cho Muse để Muse tự đọc, hiểu và viết prompt từng cảnh theo khuôn dễ tách.
  function buildMuseInstruction(script, input = {}) {
    const config = options(input);
    if (typeof script !== 'string' || !script.trim()) throw Error('Dán kịch bản trước khi nhờ Muse đọc.');
    const voice = scriptVoice(script) || script;
    const language = detectLanguage(voice);
    const expected = Math.max(1, Math.ceil(count(voice) / budgetChars(config.seconds, language)));
    const words = Math.max(6, Math.round(config.seconds * 2.6));
    const s = config.seconds;
    return [
      `Bạn là đạo diễn video. Hãy đọc KỊCH BẢN ở cuối rồi chia thành các cảnh (dự kiến khoảng ${expected} cảnh, mỗi cảnh khoảng ${s} giây). Mỗi cảnh sẽ được tạo thành MỘT video ${s} giây, không dài hơn.`,
      '',
      'QUY TẮC BẮT BUỘC',
      `1. LỜI: chép NGUYÊN VĂN từ kịch bản, giữ đúng ngôn ngữ gốc, đúng thứ tự; không bỏ sót, không thêm, không sửa, không dịch, không tóm tắt. Nối LỜI của mọi cảnh từ đầu đến cuối phải ra đúng toàn bộ phần lời của kịch bản. Ngắt ở cuối câu, mỗi cảnh đọc không quá khoảng ${words} từ.`,
      `2. Mỗi cảnh chỉ là MỘT khoảnh khắc liên tục trong ${s} giây: một địa điểm, một nhóm nhân vật, tối đa 2–3 hành động nối tiếp nhau; KHÔNG nhảy thời gian, KHÔNG đổi địa điểm, KHÔNG cắt cảnh trong cùng video. Việc nào cần hơn ${s} giây hoặc đổi bối cảnh thì tách thành cảnh khác.`,
      `3. PROMPT mô tả chính xác điều kịch bản nêu: ai, ở đâu, lúc nào, làm gì, theo thứ tự thời gian (ví dụ 0–3 giây…, 3–7 giây…, 7–${s} giây…), kèm nét mặt, cử chỉ, tư thế, hướng nhìn, cảm xúc, ánh sáng và góc máy. Dùng từ cụ thể, không mơ hồ; không bịa thêm nhân vật, vật thể, sự kiện hay đổi kết cục; không mô tả điều không thể hiện bằng hình trong ${s} giây.`,
      '4. Mỗi cảnh được tạo video riêng nên PROMPT phải tự đủ ý: nhắc lại tên, ngoại hình, trang phục và bối cảnh của nhân vật theo cùng một cách ở mọi cảnh; không viết «như cảnh trước».',
      `5. Nhân vật tuyệt đối không nói, không hát, không mấp máy môi: nếu kịch bản có thoại, thể hiện bằng cử chỉ và nét mặt. Phần chữ trong kịch bản là lời người kể.`,
      `6. Không chèn chữ, phụ đề hay logo vào hình${config.style ? `; phong cách hình ảnh: ${config.style}` : ''}; nhân vật chính giữ đúng như ảnh tham chiếu; tỷ lệ ${config.aspect}.`,
      '7. Viết PROMPT cùng ngôn ngữ với kịch bản, riêng câu cuối của PROMPT luôn là đúng câu tiếng Anh này: ' + NO_SPEECH,
      '',
      'Trả lời đúng khuôn sau cho MỖI cảnh và KHÔNG viết thêm câu dẫn hay giải thích:',
      'CẢNH 1',
      'LỜI: <lời kể trong cảnh, nguyên văn từ kịch bản>',
      'PROMPT: <mô tả hình ảnh theo quy tắc trên>',
      '',
      'CẢNH 2',
      'LỜI: …',
      'PROMPT: …',
      '',
      '(cứ thế đến hết kịch bản)',
      config.character ? `\nNhân vật chính: ${config.character}` : '',
      '',
      'KỊCH BẢN:',
      script.trim()
    ].filter((line, index, lines) => line !== '' || (index > 0 && lines[index - 1] !== '')).join('\n');
  }

  /* ---------- đối chiếu trả lời của Muse với kịch bản ---------- */
  // Mỗi chữ Hán/Kana là một đơn vị; các chữ khác tách theo từ. Bỏ dấu câu, không phân biệt hoa thường.
  function tokens(text) {
    return (String(text || '').normalize('NFC').toLowerCase().match(/[぀-ヿ㐀-鿿]|[\p{L}\p{N}]+/gu)) || [];
  }
  function referenceSentences(script) {
    return splitSentences(scriptVoice(script)).map(text => ({ text, tokens: tokens(text) })).filter(s => s.tokens.length);
  }
  // LCS theo từ: trả về cờ khớp của hai dãy.
  function alignTokens(a, b) {
    const n = a.length, m = b.length, width = m + 1;
    const table = new Uint16Array((n + 1) * width);
    for (let i = n - 1; i >= 0; i--) for (let j = m - 1; j >= 0; j--) {
      table[i * width + j] = a[i] === b[j] ? table[(i + 1) * width + j + 1] + 1 : Math.max(table[(i + 1) * width + j], table[i * width + j + 1]);
    }
    const left = new Uint8Array(n), right = new Uint8Array(m);
    let i = 0, j = 0;
    while (i < n && j < m) {
      if (a[i] === b[j]) { left[i] = right[j] = 1; i++; j++; }
      else if (table[(i + 1) * width + j] >= table[i * width + j + 1]) i++;
      else j++;
    }
    return { left, right };
  }
  const share = (flags, from, to) => to > from ? flags.slice(from, to).reduce((x, y) => x + y, 0) / (to - from) : 1;

  // Kiểm tra các cảnh có chép ĐỦ, ĐÚNG THỨ TỰ, KHÔNG THÊM so với lời của kịch bản không.
  function checkAgainstScript(script, scenes) {
    const sentences = referenceSentences(script);
    const refTokens = sentences.flatMap(s => s.tokens);
    const gotTokens = scenes.flatMap(s => tokens(s.voiceover));
    if (!refTokens.length) return { ok: true, coverage: 1, extra: 0, missing: [], added: [], issues: [], checked: false };
    if (refTokens.length > 6000 || gotTokens.length > 6000) return { ok: true, coverage: 1, extra: 0, missing: [], added: [], issues: ['Kịch bản quá dài để đối chiếu tự động.'], checked: false };
    const { left, right } = alignTokens(refTokens, gotTokens);
    const matched = left.reduce((x, y) => x + y, 0);
    const coverage = matched / refTokens.length;
    const extra = gotTokens.length ? 1 - matched / gotTokens.length : 0;
    const missing = [];
    let at = 0;
    sentences.forEach((sentence, index) => {
      if (share(left, at, at + sentence.tokens.length) < 0.7) missing.push({ index, text: sentence.text });
      at += sentence.tokens.length;
    });
    const added = [];
    at = 0;
    scenes.forEach((scene, index) => {
      const n = tokens(scene.voiceover).length;
      if (n >= 3 && share(right, at, at + n) < 0.6) added.push({ scene: index + 1, text: scene.voiceover });
      at += n;
    });
    const issues = [];
    if (missing.length) issues.push(`Thiếu ${missing.length} câu của kịch bản: «${missing.slice(0, 3).map(m => m.text.slice(0, 60)).join('» «')}»${missing.length > 3 ? '…' : ''}`);
    added.forEach(a => issues.push(`Cảnh ${a.scene} có lời không nằm trong kịch bản: «${a.text.slice(0, 60)}»`));
    const ok = !issues.length && coverage >= 0.97 && extra <= 0.03;
    if (!ok && !issues.length) issues.push(`Lời các cảnh chỉ khớp ${Math.round(coverage * 100)}% kịch bản.`);
    return { ok, coverage, extra, missing, added, issues, checked: true };
  }

  // Sửa lời các cảnh về đúng nguyên văn kịch bản (giữ prompt của Muse). Câu bị bỏ sót thành cảnh mới ở đúng vị trí.
  function alignToScript(script, scenes, input = {}) {
    const config = options(input);
    const sentences = referenceSentences(script);
    if (!sentences.length || !scenes.length) return scenes;
    const bags = scenes.map(scene => { const bag = new Map(); for (const t of tokens(scene.voiceover)) bag.set(t, (bag.get(t) || 0) + 1); return bag; });
    const score = (sentence, j) => {
      const bag = new Map(bags[j]);
      let hit = 0;
      for (const t of sentence.tokens) { const have = bag.get(t) || 0; if (have > 0) { hit++; bag.set(t, have - 1); } }
      return hit / sentence.tokens.length;
    };
    const m = sentences.length, k = scenes.length;
    const best = Array.from({ length: m }, () => new Float64Array(k));
    const from = Array.from({ length: m }, () => new Int32Array(k));
    for (let i = 0; i < m; i++) {
      let top = -1, topAt = 0;
      for (let j = 0; j < k; j++) {
        if (i === 0) best[i][j] = score(sentences[i], j);
        else {
          if (best[i - 1][j] >= top) { top = best[i - 1][j]; topAt = j; }   // hòa điểm: chọn cảnh sau (gần câu kế)
          best[i][j] = score(sentences[i], j) + top; from[i][j] = topAt;
        }
      }
    }
    let end = 0;
    for (let j = 1; j < k; j++) if (best[m - 1][j] > best[m - 1][end] + 1e-9) end = j;
    const assign = new Array(m);
    for (let i = m - 1, j = end; i >= 0; i--) { assign[i] = j; if (i > 0) j = from[i][j]; }
    const limit = budgetChars(config.seconds, detectLanguage(sentences.map(s => s.text).join(' ')));
    const result = [];
    const bySentence = sentences.map((s, i) => ({ ...s, scene: assign[i], hit: score(s, assign[i]) >= 0.5 }));
    const voices = scenes.map(() => []);
    let pending = [], lastScene = -1, emitted = new Set();
    const flushMissing = beforeScene => {
      if (!pending.length) return;
      if (lastScene === beforeScene && emitted.has(beforeScene)) { voices[beforeScene].push(...pending); }   // nằm giữa hai câu của cùng một cảnh
      else {
        const text = pending.join(' ');
        for (const part of groupSentences(text, limit)) result.push({ fresh: true, voiceover: speechText(part) });
      }
      pending = [];
    };
    let order = [];
    for (const sentence of bySentence) {
      if (!sentence.hit) { pending.push(sentence.text); continue; }
      flushMissing(sentence.scene);
      voices[sentence.scene].push(sentence.text);
      if (!emitted.has(sentence.scene)) { emitted.add(sentence.scene); order.push(sentence.scene); result.push({ scene: sentence.scene }); }
      lastScene = sentence.scene;
    }
    flushMissing(-2);
    const final = [];
    for (const item of result) {
      if (item.fresh) final.push(makeScene(0, item.voiceover, '', config));
      else final.push({ ...scenes[item.scene], voiceover: voices[item.scene].join(' '), source: voices[item.scene].join(' ') });
    }
    // Cảnh Muse viết nhưng không có câu nào của kịch bản thì bỏ (không có gì để thể hiện).
    return final.map((scene, index) => ({ ...scene, title: `Cảnh ${index + 1}` }));
  }

  /* ---------- soát từng cảnh trước khi tạo (tránh tốn lượt tạo vì prompt sai) ---------- */
  const TIME_SKIP = /(sau đó|hôm sau|ngày hôm sau|năm sau|nhiều năm|một lúc sau|lát sau|cuối cùng|đồng thời|trong khi đó|the next day|years later|later that|meanwhile|a moment later|finally|flashback|hours later|weeks later|第二天|多年后|与此同时|後日|翌日|数年後|다음 날|몇 년 후|al día siguiente|años después|le lendemain|plus tard|am nächsten tag|später|на следующий день)/i;
  const QUOTED = /["“”«»「」『』]([^"“”«»「」『』]{2,})["“”«»「」『』]/;
  // Trả về mảng cảnh báo (chuỗi) cho từng cảnh; mảng rỗng = ổn.
  function lintScenes(scenes, input = {}) {
    const config = options(input);
    const warn = [];
    scenes.forEach((scene, index) => {
      const w = [];
      const voice = String(scene.voiceover || ''), prompt = String(scene.prompt || '');
      const language = detectLanguage(voice || prompt);
      const seconds = estimateSeconds(voice, language);
      if (voice && seconds > config.seconds) w.push(`Lời đọc dài khoảng ${seconds.toFixed(1)} giây, hơn clip ${config.seconds} giây — sẽ phải giữ khung cuối. Nên tách cảnh.`);
      if (!prompt.trim()) w.push('Chưa có prompt: cảnh này sẽ không tạo được.');
      else if (count(prompt.replace(NO_SPEECH, '').trim()) < 40) w.push('Prompt quá ngắn, dễ ra hình sai. Mô tả rõ ai, ở đâu, làm gì, nét mặt.');
      if (prompt.trim() && !/no speech/i.test(prompt)) w.push('Prompt thiếu câu «no speech» — nhân vật có thể bị nói.');
      if (QUOTED.test(voice) || QUOTED.test(prompt)) w.push('Có lời thoại trong ngoặc kép — nhân vật sẽ không nói, chỉ thể hiện bằng cử chỉ và nét mặt.');
      if (TIME_SKIP.test(voice) || TIME_SKIP.test(prompt)) w.push(`Có chuyển mốc thời gian — ${config.seconds} giây khó chứa nhiều khoảnh khắc. Nên tách thành cảnh riêng.`);
      if (splitSentences(voice).length > 4) w.push(`Quá nhiều câu cho ${config.seconds} giây; hành động dễ bị bỏ sót hoặc dồn lại.`);
      warn.push(w);
    });
    return warn;
  }

  const LOI = /^(?:lời(?:\s*(?:đọc|kể|thoại))?|loi|voice(?:\s*over)?|voiceover|narration|thoại|lời dẫn)$/i;
  const PROMPT = /^(?:prompt|mô tả(?:\s*hình)?|hình ảnh|video prompt)$/i;
  const HEAD = /^[\t ]*(?:#{1,6}[\t ]*)?(?:[-*•][\t ]*)?(?:\*\*|__)?(?:\[)?(?:cảnh|canh|scene)[\t ]*(\d+)[A-Za-z]?(?:\])?(?:\*\*|__)?[\t ]*[:：.\-–—)]*[\t ]*(.*)$/i;
  const LABEL = /^[\t ]*(?:[-*•][\t ]*)?(?:\*\*|__)?([^:：\n]{2,24}?)(?:\*\*|__)?[\t ]*[:：][\t ]*(?:\*\*|__)?(.*)$/;

  function clean(value) {
    return String(value || '').replace(/^[\s"“”'`]+|[\s"“”'`]+$/g, '').replace(/\*\*|__/g, '').replace(/[ \t]+\n/g, '\n').trim();
  }

  // Tách trả lời của Muse thành các cảnh {title, voiceover, prompt}.
  function parseMuseReply(reply, input = {}) {
    const config = options(input);
    const lines = String(reply || '').replace(/\r\n?/g, '\n').split('\n');
    const scenes = [];
    let current = null, field = null;
    const push = () => { if (current && (current.voiceover || current.prompt)) scenes.push(current); };
    for (const raw of lines) {
      // Bỏ chữ đậm/nghiêng và gạch đầu dòng của markdown trước khi nhận nhãn.
      const line = raw.replace(/\*\*|__/g, '').replace(/^[\t ]*(?:[-•][\t ]+|\*[\t ]+)/, '');
      const head = line.match(HEAD);
      if (head && !PROMPT.test(head[2].split(/[:：]/)[0].trim())) {
        push();
        current = { title: `Cảnh ${head[1]}`, voiceover: '', prompt: '' };
        field = null;
        const rest = head[2].trim();
        if (rest) { const lab = rest.match(LABEL); if (lab && (LOI.test(lab[1].trim()) || PROMPT.test(lab[1].trim()))) { field = LOI.test(lab[1].trim()) ? 'voiceover' : 'prompt'; current[field] = lab[2]; } }
        continue;
      }
      if (!current) continue;
      const label = line.match(LABEL);
      if (label) {
        const name = label[1].trim();
        if (LOI.test(name)) { field = 'voiceover'; current.voiceover = label[2]; continue; }
        if (PROMPT.test(name)) { field = 'prompt'; current.prompt = label[2]; continue; }
      }
      if (field && line.trim()) current[field] += (current[field] ? '\n' : '') + line.trim();
    }
    push();
    const result = scenes.map((scene, index) => {
      const voiceover = speechText(clean(scene.voiceover));
      let prompt = clean(scene.prompt);
      if (!prompt) prompt = scenePrompt(voiceover, config);
      // Dù Muse có quên, prompt nào cũng phải có ràng buộc «không nói».
      else if (!/no speech/i.test(prompt)) prompt += '\n' + NO_SPEECH;
      return { title: `Cảnh ${index + 1}`, source: voiceover, voiceover, prompt, durationSeconds: config.seconds };
    }).filter(scene => scene.voiceover || scene.prompt);
    if (!result.length) throw Error('Chưa thấy cảnh nào trong trả lời của Muse. Cần các dòng «CẢNH 1», «LỜI: …», «PROMPT: …». Gửi lại yêu cầu cho Muse hoặc dùng nút chia cảnh nhanh.');
    return result;
  }

  /* ---------- phụ đề ---------- */
  const lineLimit = (text, maxChars) => (isCjk(detectLanguage(text)) ? Math.max(8, Math.round(maxChars * 0.4)) : maxChars);
  const MIN_CHUNK = 0.35;

  // Chia lời đọc của một cảnh thành các đoạn phụ đề ngắn. Chia theo độ dài chữ, rồi dịch ranh giới về đúng chỗ
  // người đọc nghỉ (`pauses` = giây, đo từ file giọng đọc) nếu có để phụ đề khớp tiếng.
  function subtitleChunks(text, duration, { maxChars = 80, pauses = [] } = {}) {
    const clean_ = speechText(text);
    if (!clean_ || !(duration > 0)) return [];
    const limit = lineLimit(clean_, maxChars);
    const minLength = limit >= 40 ? 12 : 4;
    const pieces = [];
    for (const sentence of splitSentences(clean_)) {
      if (count(sentence) <= limit) pieces.push(sentence); else pieces.push(...splitLong(sentence, limit));
    }
    // Gộp đoạn quá ngắn vào đoạn trước để không nháy chữ.
    const merged = [];
    for (const piece of pieces) {
      if (merged.length && count(piece) < minLength && count(joinText(merged[merged.length - 1], piece)) <= limit) merged[merged.length - 1] = joinText(merged[merged.length - 1], piece);
      else merged.push(piece);
    }
    const weights = merged.map(piece => Math.max(1, count(piece)));
    const total = weights.reduce((x, y) => x + y, 0);
    const cuts = [];
    let sum = 0;
    for (let i = 0; i < merged.length - 1; i++) { sum += weights[i]; cuts.push(duration * sum / total); }
    const usable = (Array.isArray(pauses) ? pauses : []).filter(p => Number.isFinite(p) && p > MIN_CHUNK && p < duration - MIN_CHUNK).sort((a, b) => a - b);
    const canSnap = usable.length && duration >= MIN_CHUNK * 2 * merged.length;
    let previous = 0;
    const bounds = cuts.map((cut, i) => {
      let pick = cut;
      if (canSnap) {
        const tolerance = Math.min(1.2, Math.max(0.25, duration * weights[i] / total * 0.45));
        let nearest = tolerance + 1e-9;
        for (const p of usable) { const d = Math.abs(p - cut); if (p > previous + MIN_CHUNK && d <= nearest) { pick = p; nearest = d; } }
        pick = Math.min(Math.max(pick, previous + MIN_CHUNK), duration - MIN_CHUNK * (cuts.length - i));
      }
      previous = pick;
      return pick;
    });
    const round = n => Math.round(n * 1000) / 1000;
    return merged.map((piece, index) => ({ text: piece, start: round(index ? bounds[index - 1] : 0), end: round(index === merged.length - 1 ? duration : bounds[index]) }));
  }

  function srtTime(seconds) {
    const ms = Math.max(0, Math.round(seconds * 1000));
    const pad = (n, w = 2) => String(n).padStart(w, '0');
    return `${pad(Math.floor(ms / 3600000))}:${pad(Math.floor(ms / 60000) % 60)}:${pad(Math.floor(ms / 1000) % 60)},${pad(ms % 1000, 3)}`;
  }

  function toSrt(entries) {
    return entries.map((entry, index) => `${index + 1}\n${srtTime(entry.start)} --> ${srtTime(entry.end)}\n${entry.text}\n`).join('\n');
  }

  return { ASPECTS, MAX_SECONDS, NO_SPEECH, CHARS_PER_SECOND, options, detectLanguage, charsPerSecond, estimateSeconds, speechText, splitSentences, readScript, scriptVoice, scenePrompt, planStory, buildMuseInstruction, parseMuseReply, checkAgainstScript, alignToScript, lintScenes, subtitleChunks, srtTime, toSrt };
});
