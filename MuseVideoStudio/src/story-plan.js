/* Tab «Kể chuyện»: chia kịch bản thành cảnh, nhờ Muse viết prompt, cắt phụ đề.
   Chỉ dùng luật/mẫu chạy trên máy; không gọi API hay mô hình ngôn ngữ nào khác. */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(require('./script-planner.js'));
  else root.storyPlan = factory(root.scriptPlanner);
})(typeof window !== 'undefined' ? window : globalThis, function (scriptPlanner) {
  'use strict';
  const ASPECTS = ['16:9', '9:16', '1:1'];
  // Tiếng Việt đọc bình thường khoảng 14–15 ký tự mỗi giây.
  const CHARS_PER_SECOND = 14;
  const count = value => Array.from(String(value || '')).length;
  // Viết bằng tiếng Anh vì Muse hiểu ràng buộc âm thanh bằng tiếng Anh chắc hơn.
  const NO_SPEECH = 'Audio: no speech, no dialogue, no singing, no narration, no lip movement - characters stay silent with mouths closed. Only natural sound effects and ambient sounds (wind, water, footsteps, object sounds) and soft background music.';

  function options(input = {}) {
    const seconds = Number(input.seconds ?? 10);
    if (!Number.isFinite(seconds) || seconds < 3 || seconds > 60) throw Error('Mỗi cảnh nên dài từ 3 đến 60 giây.');
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

  function scenePrompt(voiceover, config) {
    return [
      `Tạo video dài ${config.seconds} giây, tỷ lệ ${config.aspect}, kể lại đúng nội dung cảnh dưới đây.`,
      '',
      'NỘI DUNG CẢNH:',
      voiceover,
      '',
      config.character ? `Nhân vật: ${config.character}` : '',
      config.style ? `Phong cách hình ảnh: ${config.style}` : '',
      'Nhân vật chính giữ đúng khuôn mặt, trang phục và thiết kế như trong ảnh tham chiếu, ở mọi cảnh.',
      'Chuyển động: tự nhiên, mượt, thể hiện đúng hành động trong cảnh; không tự thêm nhân vật, sự kiện hay địa điểm.',
      'Máy quay: khung hình rõ ràng, chuyển động nhẹ hoặc cố định.',
      NO_SPEECH,
      'Không chèn chữ, phụ đề hoặc logo vào hình.'
    ].filter((line, index, lines) => line !== '' || (index > 0 && lines[index - 1] !== '')).join('\n');
  }

  // Chia nhanh ngay trên máy: gộp câu cho vừa thời lượng mỗi cảnh. Dùng khi chưa cần Muse đọc kịch bản.
  function planStory(script, input = {}) {
    const config = options(input);
    if (typeof script !== 'string' || !script.trim()) throw Error('Dán kịch bản trước khi chia cảnh.');
    if (!scriptPlanner || !scriptPlanner.planScript) throw Error('Thiếu bộ chia cảnh.');
    let text = script.replace(/\r\n?/g, '\n').trim();
    const explicit = /^[\t ]*(?:#{1,6}[\t ]*)?(?:\[(?:Cảnh|Scene)[\t ]+\d+[A-Za-z]?\]|(?:Cảnh|Scene)[\t ]+\d+[A-Za-z]?(?=[\t :：.\-–—]|$))/im.test(text);
    // Không có «Cảnh N»: bỏ dòng trống để các câu được gộp tới đủ độ dài một cảnh.
    if (!explicit) text = text.replace(/\n[\t ]*\n+/g, '\n').replace(/\n/g, ' ');
    const planned = scriptPlanner.planScript(text, { mode: 'auto', seconds: config.seconds, aspect: config.aspect, maxChars: Math.round(config.seconds * CHARS_PER_SECOND) });
    return planned.map((scene, index) => {
      const voiceover = speechText(scene.source);
      return { title: `Cảnh ${index + 1}`, source: scene.source, voiceover, prompt: scenePrompt(voiceover, config), durationSeconds: config.seconds };
    }).filter(scene => scene.voiceover);
  }

  // Câu lệnh gửi cho Muse để Muse tự đọc, hiểu và viết prompt từng cảnh theo khuôn dễ tách.
  function buildMuseInstruction(script, input = {}) {
    const config = options(input);
    if (typeof script !== 'string' || !script.trim()) throw Error('Dán kịch bản trước khi nhờ Muse đọc.');
    const words = Math.round(config.seconds * 2.6);
    return [
      `Bạn là đạo diễn video. Hãy đọc kịch bản dưới đây rồi chia thành các cảnh, mỗi cảnh khoảng ${config.seconds} giây.`,
      'Với MỖI cảnh, trả lời đúng khuôn sau và KHÔNG viết thêm câu dẫn nào khác:',
      '',
      'CẢNH 1',
      `LỜI: <lời kể hoặc thoại đọc trong cảnh, giữ nguyên ý và chữ của kịch bản, khoảng ${words} từ>`,
      `PROMPT: <mô tả hình ảnh, hành động, bối cảnh, ánh sáng và chuyển động máy quay cho video ${config.seconds} giây tỷ lệ ${config.aspect}; nhân vật chính giữ đúng như ảnh tham chiếu${config.style ? '; phong cách ' + config.style : ''}; không chèn chữ hay phụ đề vào hình; kết thúc PROMPT bằng đúng câu tiếng Anh này: ${NO_SPEECH}>`,
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

  // Chia lời đọc của một cảnh thành các đoạn phụ đề ngắn, chia thời gian theo độ dài chữ.
  function subtitleChunks(text, duration, { maxChars = 80 } = {}) {
    const clean_ = speechText(text);
    if (!clean_ || !(duration > 0)) return [];
    const pieces = [];
    const sentences = clean_.match(/[^.!?…]+(?:[.!?…]+["”’)]*|$)/g) || [clean_];
    for (const sentence of sentences.map(s => s.trim()).filter(Boolean)) {
      if (count(sentence) <= maxChars) { pieces.push(sentence); continue; }
      let current = '';
      for (const clause of sentence.split(/(?<=[,;:，；])\s+/)) {
        const words = count(clause) > maxChars ? clause.split(/\s+/) : [clause];
        for (const word of words) {
          if (!current) current = word;
          else if (count(current) + 1 + count(word) <= maxChars) current += ' ' + word;
          else { pieces.push(current); current = word; }
        }
      }
      if (current) pieces.push(current);
    }
    // Gộp đoạn quá ngắn vào đoạn trước để không nháy chữ.
    const merged = [];
    for (const piece of pieces) {
      if (merged.length && count(piece) < 12 && count(merged[merged.length - 1]) + 1 + count(piece) <= maxChars) merged[merged.length - 1] += ' ' + piece;
      else merged.push(piece);
    }
    const total = merged.reduce((sum, piece) => sum + Math.max(1, count(piece)), 0);
    let at = 0;
    return merged.map((piece, index) => {
      const length = duration * Math.max(1, count(piece)) / total;
      const start = at;
      at = index === merged.length - 1 ? duration : at + length;
      return { text: piece, start: Math.round(start * 1000) / 1000, end: Math.round(at * 1000) / 1000 };
    });
  }

  function srtTime(seconds) {
    const ms = Math.max(0, Math.round(seconds * 1000));
    const pad = (n, w = 2) => String(n).padStart(w, '0');
    return `${pad(Math.floor(ms / 3600000))}:${pad(Math.floor(ms / 60000) % 60)}:${pad(Math.floor(ms / 1000) % 60)},${pad(ms % 1000, 3)}`;
  }

  function toSrt(entries) {
    return entries.map((entry, index) => `${index + 1}\n${srtTime(entry.start)} --> ${srtTime(entry.end)}\n${entry.text}\n`).join('\n');
  }

  return { ASPECTS, NO_SPEECH, CHARS_PER_SECOND, options, speechText, scenePrompt, planStory, buildMuseInstruction, parseMuseReply, subtitleChunks, srtTime, toSrt };
});
