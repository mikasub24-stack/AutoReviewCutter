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
  const MIN_SECONDS = 3;
  // Độ dài clip của một cảnh tự tính theo lời kể: thời gian đọc cộng ~10% nghỉ, làm tròn lên, từ 3 giây đến mức tối đa của Muse.
  function sceneSeconds(text, cap = MAX_SECONDS) {
    const value = String(text || '').trim();
    if (!value) return cap;
    const need = Math.ceil(Math.round(estimateSeconds(value) / 0.9 * 100) / 100);
    return Math.min(cap, Math.max(MIN_SECONDS, need));
  }

  function options(input = {}) {
    const seconds = Number(input.seconds ?? MAX_SECONDS);
    if (!Number.isFinite(seconds) || seconds < 3 || seconds > MAX_SECONDS) throw Error(`Muse chỉ tạo clip tối đa ${MAX_SECONDS} giây: chọn mỗi cảnh từ 3 đến ${MAX_SECONDS} giây.`);
    const aspect = input.aspect || '16:9';
    if (!ASPECTS.includes(aspect)) throw Error('Chọn tỷ lệ 16:9, 9:16 hoặc 1:1.');
    return { seconds, aspect, style: String(input.style || '').trim(), character: String(input.character || '').trim(), reference: Boolean(input.reference) };
  }

  // Toàn bộ văn bản người dùng dán chính là lời đọc: không tách nhãn, không bỏ chữ.
  // Chỉ bỏ ký hiệu markdown (* _ ` # >) và gộp khoảng trắng.
  function storyText(script) {
    return String(script || '').replace(/\r\n?/g, '\n').replace(/[*_`#>]+/g, '').replace(/\s+/g, ' ').trim();
  }
  const speechText = storyText;

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


  /* ---------- câu chuyện = lời đọc; Muse chỉ chọn ranh giới cảnh và viết prompt hình ---------- */
  const scriptVoice = storyText;

  // Chia câu chuyện thành các «câu» đánh số (câu quá dài cắt ở dấu phẩy). Mỗi cảnh là một dải câu liên tiếp,
  // nên lời đọc của cảnh luôn là nguyên văn câu chuyện — Muse không được chép lại lời.
  function storyUnits(script, input = {}) {
    const config = options(input);
    const text = storyText(script);
    if (!text) throw Error('Dán kịch bản trước khi chia cảnh.');
    const language = detectLanguage(text), limit = budgetChars(config.seconds, language);
    const pieces = [];
    for (const sentence of splitSentences(text)) pieces.push(...(count(sentence) > limit ? splitLong(sentence, limit) : [sentence]));
    return pieces.map((piece, index) => ({ n: index + 1, text: piece, seconds: Math.round(estimateSeconds(piece, language) * 10) / 10 }));
  }
  const unitsText = (units, from, to) => units.slice(from - 1, to).map(u => u.text).reduce((a, b) => (a ? joinText(a, b) : b), '');
  // Gom các câu liên tiếp từ `from` đến `to` thành các dải không vượt `limit` ký tự.
  function groupRanges(units, from, to, limit) {
    const ranges = [];
    let start = from, text = '';
    for (let i = from; i <= to; i++) {
      const next = text ? joinText(text, units[i - 1].text) : units[i - 1].text;
      if (text && count(next) > limit) { ranges.push([start, i - 1]); start = i; text = units[i - 1].text; } else text = next;
    }
    if (from <= to) ranges.push([start, to]);
    return ranges;
  }
  const limitFor = (units, config) => budgetChars(config.seconds, detectLanguage(units.map(u => u.text).join(' ')));

  function scenePrompt(voiceover, config, visual = '') {
    const seconds = sceneSeconds(voiceover || visual, config.seconds);
    return [
      `Tạo video dài ${seconds} giây, tỷ lệ ${config.aspect}, thể hiện đúng cảnh dưới đây.`,
      '',
      visual ? 'HÌNH ẢNH THEO KỊCH BẢN (làm đúng như mô tả):' : '',
      visual || '',
      voiceover ? 'NỘI DUNG CẢNH (lời kể, chỉ để hiểu cảnh; nhân vật không nói):' : '',
      voiceover || '',
      '',
      config.character ? `Nhân vật: ${config.character}` : '',
      config.style ? `Phong cách hình ảnh: ${config.style}` : '',
      ...(config.reference ? ['Nhân vật chính giữ đúng khuôn mặt, trang phục và thiết kế như trong ảnh tham chiếu, ở mọi cảnh.'] : []),
      `Chỉ một khoảnh khắc liên tục trong ${seconds} giây, không chuyển cảnh; thể hiện đúng người, nơi chốn, thời gian, hành động và nét mặt được nêu.`,
      'Chuyển động: tự nhiên, mượt; không tự thêm nhân vật, sự kiện hay địa điểm, không bỏ chi tiết quan trọng.',
      'Máy quay: khung hình rõ ràng, chuyển động nhẹ hoặc cố định.',
      NO_SPEECH,
      'Không chèn chữ, phụ đề hoặc logo vào hình.'
    ].filter((line, index, lines) => line !== '' || (index > 0 && lines[index - 1] !== '')).join('\n');
  }

  // `range` = [câu đầu, câu cuối]. Cảnh `offline` là cảnh có prompt mẫu do tool ghép, chưa qua Muse.
  function makeScene(index, voiceover, visual, config, range) {
    return { title: `Cảnh ${index}`, source: voiceover || visual, voiceover, visual: visual || '', prompt: scenePrompt(voiceover, config, visual), durationSeconds: sceneSeconds(voiceover || visual, config.seconds), ...(range ? { units: range } : {}), offline: true };
  }

  // Chia nhanh ngay trên máy: gộp câu cho vừa thời lượng mỗi cảnh. Prompt là mẫu chung, chưa qua Muse.
  function planStory(script, input = {}) {
    const config = options(input);
    if (typeof script !== 'string' || !script.trim()) throw Error('Dán kịch bản trước khi chia cảnh.');
    const units = storyUnits(script, config);
    const ranges = groupRanges(units, 1, units.length, limitFor(units, config));
    if (ranges.length > MAX_SCENES) throw Error('Kịch bản tạo hơn 100 cảnh. Hãy chia thành nhiều lượt hoặc tăng giới hạn ký tự mỗi cảnh.');
    return ranges.map(([a, b], index) => makeScene(index + 1, unitsText(units, a, b), '', config, [a, b]));
  }

  const CONTEXT_CHARS = 12000;
  // Phần câu chuyện đưa kèm để Muse hiểu ngữ cảnh khi chỉ chia một đoạn.
  function contextText(script, units, first, last) {
    const full = storyText(script);
    if (count(full) <= CONTEXT_CHARS) return full;
    return (first > 1 ? '… ' : '') + unitsText(units, Math.max(1, first - 12), Math.min(units.length, last + 6)) + (last < units.length ? ' …' : '');
  }

  /* Câu lệnh gửi cho Muse: đọc hiểu cả câu chuyện, gom các câu đánh số thành cảnh, viết prompt hình.
     ctx: { units, ranges: [[từ, đến]…] (mặc định cả truyện), cast, part, parts, marker } */
  function buildMuseInstruction(script, input = {}, ctx = {}) {
    const config = options(input);
    if (typeof script !== 'string' || !script.trim()) throw Error('Dán kịch bản trước khi nhờ Muse đọc.');
    const units = ctx.units || storyUnits(script, config);
    const ranges = ctx.ranges && ctx.ranges.length ? ctx.ranges : [[1, units.length]];
    const picked = ranges.flatMap(([a, b]) => units.slice(a - 1, b));
    const whole = picked.length === units.length;
    const s = config.seconds, budget = Math.round(s * 0.9 * 10) / 10;
    const marker = ctx.marker ? String(ctx.marker) : '';
    const numbered = list => list.map(u => `[${u.n}] (${u.seconds} giây) ${u.text}`);
    const first = picked[0].n, last = picked[picked.length - 1].n;
    const partNote = ctx.parts > 1 ? ` Đây là phần ${ctx.part}/${ctx.parts} của câu chuyện.` : '';
    return [
      `Bạn là đạo diễn hình ảnh cho video kể chuyện. Mỗi cảnh sẽ được AI tạo thành MỘT video ngắn, dài tối đa ${s} giây, và mỗi lần tạo đều tốn lượt, nên hình ảnh, hành động và nét mặt phải đúng ngay từ lần đầu.`,
      '',
      `BƯỚC 1 – ĐỌC HIỂU: đọc kỹ toàn bộ câu chuyện${whole ? ' ở cuối' : ' ở phần NGỮ CẢNH'} để nắm nhân vật, bối cảnh, thời điểm, diễn biến, cảm xúc và ý nghĩa của từng câu.${partNote}`,
      `BƯỚC 2 – CHIA CẢNH: ${whole ? '' : 'chỉ chia các câu ở phần CÁC CÂU CẦN CHIA CẢNH; phần còn lại chỉ để hiểu. '}Gom các câu đánh số LIÊN TIẾP thành cảnh, đủ mọi câu, đúng thứ tự, không bỏ sót, không lặp. Số trong ngoặc là số giây đọc câu đó; tổng của mỗi cảnh không quá ${budget} giây. Độ dài video của cảnh tự theo lời kể: tổng số giây các câu chia cho 0,9, làm tròn lên (tối thiểu ${MIN_SECONDS}, tối đa ${s} giây); cảnh ngắn thì video ngắn, không kéo dài cho đủ ${s} giây. KHÔNG chép lại lời: chỉ ghi số câu, giọng đọc sẽ đọc đúng nguyên văn các câu đó.`,
      'BƯỚC 3 – VIẾT PROMPT cho từng cảnh theo quy tắc dưới đây.',
      '',
      'QUY TẮC',
      `1. Mỗi cảnh chỉ là MỘT khoảnh khắc liên tục trong độ dài video của cảnh: một địa điểm, một nhóm nhân vật, tối đa 2–3 hành động nối tiếp; KHÔNG nhảy thời gian, KHÔNG đổi địa điểm, KHÔNG cắt cảnh trong cùng video. Các câu liên tiếp mà đổi địa điểm hoặc nhảy thời gian thì tách thành cảnh khác.`,
      `2. PROMPT thể hiện đúng điều các câu của cảnh nói: ai, ở đâu, lúc nào, làm gì, theo thứ tự thời gian, chia mốc theo đúng độ dài video của cảnh (video 5 giây: 0–2 giây…, 2–5 giây…; video ${s} giây: 0–3 giây…, 3–7 giây…, 7–${s} giây…), kèm nét mặt, ánh mắt, cử chỉ, tư thế, cảm xúc, ánh sáng và góc máy. Dùng từ cụ thể, không mơ hồ.`,
      '3. Không bịa thêm nhân vật, vật thể hay sự kiện; không đổi kết cục; không bỏ hành động quan trọng. Suy nghĩ, cảm xúc hay ý trừu tượng thì thể hiện bằng nét mặt, cử chỉ hoặc vật cụ thể có trong câu.',
      '4. Mỗi cảnh được tạo video riêng nên PROMPT phải tự đủ ý: nhắc lại tên, ngoại hình, trang phục và bối cảnh của nhân vật theo cùng một cách ở mọi cảnh; không viết «như cảnh trước».',
      ...[config.reference ? '5. NHÂN VẬT: nhận ra MỌI nhân vật trong truyện (kể cả người chỉ được gọi bằng vai như «bà», «người lái đò», «đám trẻ»). Nhân vật chính là người ở ảnh tham chiếu đính kèm: giữ đúng khuôn mặt, tóc, trang phục trong ảnh, không tự đổi. Mỗi nhân vật khác được chốt MỘT mô tả cố định (tuổi, vóc dáng, tóc, trang phục) ở dòng NHÂN VẬT và dùng y nguyên ở mọi cảnh có người đó. Trong PROMPT của mỗi cảnh, gọi từng người xuất hiện trong khung hình bằng đúng tên/vai đó kèm mô tả cố định, nói rõ ai đứng đâu, ai làm gì; người chỉ được nhắc đến mà không có mặt trong cảnh thì KHÔNG vẽ vào hình.' : '5. NHÂN VẬT: nhận ra các nhân vật CÓ MẶT trong truyện (kể cả người chỉ được gọi bằng vai như «bà», «người lái đò», «đám trẻ»). Mỗi nhân vật được chốt MỘT mô tả cố định, ngắn gọn (tuổi, vóc dáng, tóc, trang phục) ở dòng NHÂN VẬT và dùng y nguyên ở mọi cảnh có người đó; chi tiết truyện không nói thì chọn đơn giản, không bịa thêm. Nếu người dùng đã mô tả nhân vật chính (ở cuối) thì dùng đúng mô tả đó. Chỉ mô tả người XUẤT HIỆN trong khung hình của cảnh, nói rõ ai đứng đâu, ai làm gì; người chỉ được nhắc đến mà không có mặt trong cảnh thì KHÔNG vẽ vào hình.'],
      '6. Nhân vật tuyệt đối không nói, không hát, không mấp máy môi: lời thoại trong truyện thể hiện bằng cử chỉ và nét mặt. Lời kể do người đọc, không phải nhân vật.',
      `7. Không chèn chữ, phụ đề hay logo vào hình${config.style ? `; phong cách hình ảnh: ${config.style}` : ''}${config.reference ? '; nhân vật chính giữ đúng như ảnh tham chiếu' : ''}; tỷ lệ ${config.aspect}.`,
      '8. Viết PROMPT cùng ngôn ngữ với câu chuyện, riêng câu cuối của PROMPT luôn là đúng câu tiếng Anh này: ' + NO_SPEECH,
      '',
      'Trả lời đúng khuôn sau, KHÔNG viết thêm câu dẫn hay giải thích:',
      ...(ctx.cast ? [] : ['NHÂN VẬT: <mọi nhân vật trong truyện, mỗi người một mục: tên/vai – tuổi, vóc dáng, tóc, trang phục cố định' + (config.reference ? '; nhân vật chính ghi «theo ảnh tham chiếu»' : '') + '>']),
      'CẢNH 1',
      `CÂU: <số câu đầu>-<số câu cuối> (ví dụ 1-3; một câu thì chỉ ghi số đó)`,
      'PROMPT: <mô tả hình ảnh theo quy tắc trên>',
      'CẢNH 2',
      'CÂU: …',
      'PROMPT: …',
      `(cứ thế đến câu số ${last}${marker ? `; dòng cuối cùng của trả lời chỉ gồm đúng một từ: MSDONE${marker}` : ''})`,
      ctx.cast ? `\nNHÂN VẬT ĐÃ CHỐT (dùng y nguyên trong mọi PROMPT; người mới xuất hiện ở phần này thì bổ sung thêm vào dòng NHÂN VẬT): ${ctx.cast}` : '',
      config.character ? `\nNhân vật chính (người dùng mô tả): ${config.character}` : '',
      '',
      ...(whole ? ['CÂU CHUYỆN (đã đánh số câu):'] : ['NGỮ CẢNH – câu chuyện (chỉ để hiểu, KHÔNG viết cảnh cho phần này):', contextText(script, units, first, last), '', 'CÁC CÂU CẦN CHIA CẢNH:']),
      ...numbered(picked),
      marker ? `MSEND${marker}` : ''
    ].filter((line, index, lines) => line !== '' || (index > 0 && lines[index - 1] !== '' && index < lines.length - 1)).join('\n');
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
      else { const voice = voices[item.scene].join(' '); final.push({ ...scenes[item.scene], voiceover: voice, source: voice, durationSeconds: sceneSeconds(voice, config.seconds) }); }
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
      const seconds = estimateSeconds(voice, language), own = sceneSeconds(voice || prompt, config.seconds);
      if (voice && seconds > config.seconds) w.push(`Lời đọc dài khoảng ${seconds.toFixed(1)} giây, hơn clip ${config.seconds} giây — sẽ phải giữ khung cuối. Nên tách cảnh.`);
      if (!prompt.trim()) w.push('Chưa có prompt: cảnh này sẽ không tạo được.');
      else if (count(prompt.replace(NO_SPEECH, '').trim()) < 40) w.push('Prompt quá ngắn, dễ ra hình sai. Mô tả rõ ai, ở đâu, làm gì, nét mặt.');
      if (prompt.trim() && !/no speech/i.test(prompt)) w.push('Prompt thiếu câu «no speech» — nhân vật có thể bị nói.');
      if (QUOTED.test(voice) || QUOTED.test(prompt)) w.push('Có lời thoại trong ngoặc kép — nhân vật sẽ không nói, chỉ thể hiện bằng cử chỉ và nét mặt.');
      if (TIME_SKIP.test(voice) || TIME_SKIP.test(prompt)) w.push(`Có chuyển mốc thời gian — ${own} giây khó chứa nhiều khoảnh khắc. Nên tách thành cảnh riêng.`);
      if (splitSentences(voice).length > 4) w.push(`Quá nhiều câu cho ${own} giây; hành động dễ bị bỏ sót hoặc dồn lại.`);
      warn.push(w);
    });
    return warn;
  }


  const PROMPT = /^(?:prompt|mô tả(?:\s*hình)?|hình ảnh|video prompt)$/i;
  const SENTENCES = /^(?:câu|cau|các câu|sentences?|lines?|dòng|dong)(?:\s*(?:số|so|nos?\.?))?$/i;
  const CAST = /^(?:nhân vật|nhan vat|characters?|cast)(?:\s*chính)?$/i;
  const LOI = /^(?:lời(?:\s*(?:đọc|kể|thoại))?|loi|voice(?:\s*over)?|voiceover|narration|thoại|lời dẫn)$/i;
  const DONE = /^\W*MSDONE[0-9a-f]+\W*$/i;
  const HEAD = /^[\t ]*(?:#{1,6}[\t ]*)?(?:[-*•][\t ]*)?(?:\*\*|__)?(?:\[)?(?:cảnh|canh|scene)[\t ]*(\d+)[A-Za-z]?(?:\])?(?:\*\*|__)?[\t ]*[:：.\-–—)]*[\t ]*(.*)$/i;
  const LABEL = /^[\t ]*(?:[-*•][\t ]*)?(?:\*\*|__)?([^:：\n]{2,24}?)(?:\*\*|__)?[\t ]*[:：][\t ]*(?:\*\*|__)?(.*)$/;

  function clean(value) {
    return String(value || '').replace(/^[\s"“”'`]+|[\s"“”'`]+$/g, '').replace(/\*\*|__/g, '').replace(/[ \t]+\n/g, '\n').trim();
  }
  const ensureNoSpeech = prompt => (/no speech/i.test(prompt) ? prompt : prompt + '\n' + NO_SPEECH);

  // Tách trả lời của Muse: {scenes: [{title, units: [đầu, cuối] | null, voiceover, prompt}], cast, done}.
  // Hiểu cả khuôn «CÂU: 1-3» (chuẩn) lẫn khuôn cũ «LỜI: …».
  function parseReply(reply, input = {}) {
    options(input);
    const lines = String(reply || '').replace(/\r\n?/g, '\n').split('\n');
    const scenes = [];
    let current = null, field = null, cast = '', done = false;
    const push = () => { if (current && (current.voiceover || current.prompt || current.units)) scenes.push(current); };
    for (const raw of lines) {
      if (DONE.test(raw.trim())) { done = true; break; }
      // Bỏ chữ đậm/nghiêng và gạch đầu dòng của markdown trước khi nhận nhãn.
      const line = raw.replace(/\*\*|__/g, '').replace(/^[\t ]*(?:[-•][\t ]+|\*[\t ]+)/, '');
      const head = line.match(HEAD);
      if (head && !PROMPT.test(head[2].split(/[:：]/)[0].trim())) {
        push();
        current = { title: `Cảnh ${head[1]}`, voiceover: '', prompt: '', units: null };
        field = null;
        const rest = head[2].trim();
        if (rest) { const lab = rest.match(LABEL); if (lab && (LOI.test(lab[1].trim()) || PROMPT.test(lab[1].trim()))) { field = LOI.test(lab[1].trim()) ? 'voiceover' : 'prompt'; current[field] = lab[2]; } }
        continue;
      }
      const label = line.match(LABEL);
      if (!current) {
        if (label && CAST.test(label[1].trim())) { field = 'cast'; cast = label[2].trim(); }
        else if (field === 'cast' && line.trim()) cast += (cast ? ' ' : '') + line.trim();
        continue;
      }
      if (label) {
        const name = label[1].trim();
        if (SENTENCES.test(name)) {
          const nums = (label[2].match(/\d+/g) || []).map(Number).filter(n => n > 0);
          current.units = nums.length ? [Math.min(...nums), Math.max(...nums)] : null;
          field = null; continue;
        }
        if (LOI.test(name)) { field = 'voiceover'; current.voiceover = label[2]; continue; }
        if (PROMPT.test(name)) { field = 'prompt'; current.prompt = label[2]; continue; }
      }
      if (field && line.trim()) current[field] += (current[field] ? '\n' : '') + line.trim();
    }
    push();
    const result = scenes.map((scene, index) => ({ title: `Cảnh ${index + 1}`, units: scene.units, voiceover: speechText(clean(scene.voiceover)), prompt: clean(scene.prompt) }))
      .filter(scene => scene.units || scene.voiceover || scene.prompt);
    if (!result.length) throw Error('Chưa thấy cảnh nào trong trả lời của Muse. Cần các dòng «CẢNH 1», «CÂU: 1-3», «PROMPT: …». Gửi lại yêu cầu cho Muse hoặc dùng nút chia cảnh nhanh.');
    return { scenes: result, cast: clean(cast), done };
  }

  // Tương thích khuôn cũ: trả mảng cảnh {title, source, voiceover, prompt, durationSeconds}.
  function parseMuseReply(reply, input = {}) {
    const config = options(input);
    return parseReply(reply, config).scenes.map((scene, index) => {
      const prompt = scene.prompt ? ensureNoSpeech(scene.prompt) : scenePrompt(scene.voiceover, config);
      return { title: `Cảnh ${index + 1}`, source: scene.voiceover, voiceover: scene.voiceover, prompt, durationSeconds: sceneSeconds(scene.voiceover, config.seconds), ...(scene.units ? { units: scene.units } : {}) };
    });
  }

  /* Ghép trả lời của Muse (các dải câu + prompt) với lời THẬT của câu chuyện.
     - Lời đọc luôn là nguyên văn các câu; Muse không chép lại lời nên không thể sai lời.
     - Muse bỏ sót câu, đánh số chồng lên nhau hoặc gom quá dài → phần đó thành cảnh `offline` (prompt mẫu) để hỏi lại Muse.
     range = {from, to}: chỉ ghép trong dải câu này (dùng khi hỏi lại một đoạn). */
  function assembleScenes(units, parsed, input = {}, range = null) {
    const config = options(input);
    const lo = Math.max(1, range?.from || 1), hi = Math.min(units.length, range?.to || units.length);
    const limit = limitFor(units, config);
    // Muse cộng số giây đã làm tròn nên có thể gom sát 100% clip; chấp nhận đến hết thời lượng clip, chỉ cắt khi vượt hẳn.
    const hard = Math.floor(config.seconds * charsPerSecond(detectLanguage(units.map(u => u.text).join(' '))));
    const out = [];
    let next = lo;
    const fresh = (a, b) => { for (const [x, y] of groupRanges(units, a, b, limit)) out.push(makeScene(0, unitsText(units, x, y), '', config, [x, y])); };
    for (const item of parsed) {
      if (!item.units) continue;
      const a = Math.max(item.units[0], next, lo), b = Math.min(item.units[1], hi);
      if (a > b) continue;
      if (a > next) fresh(next, a - 1);
      let end = a;
      while (end < b && count(unitsText(units, a, end + 1)) <= hard) end++;
      const voiceover = unitsText(units, a, end);
      out.push({ title: '', source: voiceover, voiceover, visual: '', prompt: item.prompt ? ensureNoSpeech(item.prompt) : scenePrompt(voiceover, config), durationSeconds: sceneSeconds(voiceover, config.seconds), units: [a, end], ...(item.prompt ? {} : { offline: true }) });
      if (end < b) fresh(end + 1, b);
      next = b + 1;
    }
    if (next <= hi) fresh(next, hi);
    return out.map((scene, index) => ({ ...scene, title: `Cảnh ${index + 1}` }));
  }

  // Từ trả lời của Muse ra danh sách cảnh cuối cùng. Trả lời dùng khuôn cũ «LỜI:» thì căn lời về nguyên văn.
  function scenesFromReply(script, reply, input = {}, range = null) {
    const config = options(input);
    const parsed = parseReply(reply, config);
    if (parsed.scenes.some(scene => scene.units)) return { scenes: assembleScenes(storyUnits(script, config), parsed.scenes, config, range), cast: parsed.cast, done: parsed.done };
    const legacy = parseMuseReply(reply, config).filter(scene => scene.voiceover);
    if (!legacy.length) return { scenes: [], cast: parsed.cast, done: parsed.done };
    if (!range) return { scenes: alignToScript(script, legacy, config), cast: parsed.cast, done: parsed.done };
    // Một đoạn: căn lời Muse chép về nguyên văn đoạn đó, rồi gắn lại số câu cho từng cảnh khi khớp chính xác.
    const units = storyUnits(script, config), lo = Math.max(1, range.from || 1), hi = Math.min(units.length, range.to || units.length);
    const aligned = alignToScript(unitsText(units, lo, hi), legacy, config);
    const norm = text => String(text).replace(/\s+/g, ' ').trim();
    let at = lo;
    const scenes = aligned.map(scene => {
      let text = '';
      for (let i = at; i <= hi; i++) {
        text = text ? joinText(text, units[i - 1].text) : units[i - 1].text;
        if (norm(text) === norm(scene.voiceover)) { const found = { ...scene, units: [at, i] }; at = i + 1; return found; }
        if (count(text) > count(scene.voiceover) + 8) break;
      }
      return scene;
    });
    return { scenes, cast: parsed.cast, done: parsed.done };
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

  return { ASPECTS, MAX_SECONDS, MIN_SECONDS, sceneSeconds, NO_SPEECH, CHARS_PER_SECOND, options, detectLanguage, charsPerSecond, estimateSeconds, speechText, storyText, storyUnits, groupRanges, splitSentences, scriptVoice, scenePrompt, planStory, buildMuseInstruction, parseReply, parseMuseReply, assembleScenes, scenesFromReply, checkAgainstScript, alignToScript, lintScenes, subtitleChunks, srtTime, toSrt };
});
