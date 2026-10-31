/* Local rules/templates only: no API, translation, or language-model calls. */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.scriptPlanner = factory();
})(typeof window !== 'undefined' ? window : globalThis, function () {
  'use strict';
  const MAX_SCENES = 100;
  const count = value => Array.from(value).length;
  const sceneHeading = /^[\t ]*(?:#{1,6}[\t ]*)?(\[(?:Cảnh|Scene)[\t ]+\d+[A-Za-z]?\]|(?:Cảnh|Scene)[\t ]+\d+[A-Za-z]?(?=[\t :：.\-–—]|$))/gim;

  function settings(options) {
    if (!options || typeof options !== 'object' || Array.isArray(options)) throw Error('Cấu hình chia cảnh không hợp lệ.');
    const result = { mode: 'auto', seconds: 5, aspect: '16:9', style: '', maxChars: 500, ...options };
    if (!['auto', 'paragraphs', 'sentences'].includes(result.mode)) throw Error('Chọn cách chia cảnh: tự động, theo đoạn hoặc theo câu.');
    result.seconds = Number(result.seconds);
    if (!Number.isFinite(result.seconds) || result.seconds < 1 || result.seconds > 120) throw Error('Thời lượng mỗi cảnh phải từ 1 đến 120 giây.');
    if (!['16:9', '9:16', '1:1'].includes(result.aspect)) throw Error('Chọn tỷ lệ 16:9, 9:16 hoặc 1:1.');
    if (typeof result.style !== 'string') throw Error('Phong cách phải là nội dung văn bản.');
    result.style = result.style.trim();
    result.maxChars = Number(result.maxChars);
    if (!Number.isInteger(result.maxChars) || result.maxChars < 1 || result.maxChars > 20000) throw Error('Giới hạn nội dung mỗi cảnh phải là số nguyên từ 1 đến 20000 ký tự.');
    return result;
  }

  function sentenceParts(text) {
    const parts = [];
    let start = 0;
    for (let index = 0; index < text.length; index++) {
      const mark = text[index];
      if (!'.!?…'.includes(mark)) continue;
      if (mark === '.') {
        // Keep decimal numbers, list labels, initials and common abbreviations.
        if (/\d/.test(text[index - 1] || '') && /\d/.test(text[index + 1] || '')) continue;
        const linePrefix = text.slice(text.lastIndexOf('\n', index - 1) + 1, index);
        if (/^\s*\d+$/.test(linePrefix)) continue;
        const prefix = text.slice(Math.max(start, index - 12), index);
        if (/(?:^|\s)(?:TS|ThS|PGS|GS|TP|Dr|Mr|Mrs|Ms|Prof|Sr|Jr|St|vs)\.?$/i.test(prefix)) continue;
        if (/(?:^|\s)[A-ZĐ]$/.test(prefix)) continue;
      }
      let end = index + 1;
      while (end < text.length && '.!?…'.includes(text[end])) end++;
      while (end < text.length && '"\'”’»)]}'.includes(text[end])) end++;
      if (end < text.length && !/\s/.test(text[end])) continue;
      const part = text.slice(start, end).trim();
      if (part) parts.push(part);
      start = end; index = end - 1;
    }
    const remaining = text.slice(start).trim();
    if (remaining) parts.push(remaining);
    return parts;
  }

  function splitLong(text, maxChars) {
    const points = Array.from(text.trim());
    const parts = [];
    let start = 0;
    while (start < points.length) {
      let end = Math.min(start + maxChars, points.length);
      if (end < points.length) {
        // Prefer word boundaries. A single long token is split without loss.
        let boundary = end;
        while (boundary > start && !/\s/.test(points[boundary])) boundary--;
        if (boundary > start) end = boundary;
      }
      const part = points.slice(start, end).join('').trim();
      if (part) parts.push(part);
      start = end;
      while (start < points.length && /\s/.test(points[start])) start++;
    }
    return parts;
  }

  function boundedParts(text, maxChars, eachSentence) {
    if (!eachSentence && count(text) <= maxChars) return [text.trim()];
    const sentences = sentenceParts(text);
    const parts = [];
    let current = '';
    for (const sentence of sentences) {
      const segments = count(sentence) > maxChars ? splitLong(sentence, maxChars) : [sentence];
      for (const segment of segments) {
        if (eachSentence) { parts.push(segment); continue; }
        if (!current) current = segment;
        else if (count(current) + 1 + count(segment) <= maxChars) current += ' ' + segment;
        else { parts.push(current); current = segment; }
      }
    }
    if (current) parts.push(current);
    return parts;
  }

  function explicitSections(text) {
    sceneHeading.lastIndex = 0;
    const headings = [...text.matchAll(sceneHeading)];
    if (!headings.length) return null;
    const sections = [];
    const opening = text.slice(0, headings[0].index).trim();
    if (opening) sections.push({ source: opening, title: 'Mở đầu' });
    headings.forEach((heading, index) => {
      sections.push({
        source: text.slice(heading.index, headings[index + 1]?.index ?? text.length).trim(),
        title: heading[1].replace(/^\[|\]$/g, '').trim()
      });
    });
    return sections;
  }

  function prompt(source, options) {
    return [
      `Tạo video dài ${options.seconds} giây, tỷ lệ ${options.aspect}, dựa trên nội dung cảnh dưới đây.`,
      '',
      'NỘI DUNG CẢNH:',
      source,
      '',
      options.style ? `Phong cách hình ảnh: ${options.style}` : '',
      'Chuyển động: thể hiện hành động được nêu trong cảnh bằng chuyển động tự nhiên, mượt; tránh biến dạng và không tự thêm nhân vật, sự kiện hay địa điểm.',
      'Máy quay: giữ khung hình rõ ràng, chuyển động nhẹ hoặc cố định theo nội dung; không tự thêm chuyển cảnh đột ngột.',
      'Tính liên tục: giữ nhất quán nhân vật, bối cảnh và phong cách giữa các cảnh. Nếu có ảnh tham chiếu, giữ đúng thiết kế và đặc điểm trong ảnh.',
      'Không tự chèn chữ, phụ đề hoặc logo khi kịch bản không yêu cầu.'
    ].filter((line, index, lines) => line !== '' || (index > 0 && lines[index - 1] !== '')).join('\n');
  }

  function planScript(script, options = {}) {
    if (typeof script !== 'string' || !script.trim()) throw Error('Dán kịch bản trước khi chia cảnh.');
    const config = settings(options);
    const text = script.replace(/\r\n?/g, '\n').trim();
    if (count(text.replace(/\s/g, '')) > MAX_SCENES * config.maxChars) throw Error('Kịch bản tạo hơn 100 cảnh. Hãy chia thành nhiều lượt hoặc tăng giới hạn ký tự mỗi cảnh.');
    let sections = config.mode === 'auto' ? explicitSections(text) : null;
    if (!sections) {
      sections = (config.mode === 'sentences' ? [text] : text.split(/\n[\t ]*\n+/))
        .map(source => ({ source: source.trim(), title: '' })).filter(section => section.source);
    }
    const scenes = [];
    for (const section of sections) {
      const parts = boundedParts(section.source, config.maxChars, config.mode === 'sentences');
      parts.forEach((source, index) => {
        const title = section.title ? section.title + (parts.length > 1 ? ` · phần ${index + 1}/${parts.length}` : '') : `Cảnh ${scenes.length + 1}`;
        // source appears once; a heading already present in it is not repeated.
        scenes.push({ title, source, prompt: prompt(source, config) });
      });
      if (scenes.length > MAX_SCENES) throw Error('Kịch bản tạo hơn 100 cảnh. Hãy chia thành nhiều lượt hoặc tăng giới hạn ký tự mỗi cảnh.');
    }
    return scenes;
  }

  return { planScript };
});
