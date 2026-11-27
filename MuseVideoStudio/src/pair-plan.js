// Tab «So sánh song song»: một nhân vật / một tình huống, HAI con đường (ví dụ nuôi con bằng la mắng và bằng lắng nghe), video 8–10 phút.
// Màn hình chia đôi: mỗi mốc có MỘT ảnh nền chung, hai clip trái / phải cùng bắt đầu từ ảnh đó (nên cùng căn phòng, cùng góc máy)
// rồi diễn ra hai kết cục khác nhau. Chữ, nhãn mốc, thanh pin %, phụ đề, giọng đọc và âm thanh do máy tự làm (Muse chỉ tạo hình).
// Chủ đề chọn trong danh sách gợi ý, tự gõ, hoặc để trống để Muse TỰ CHỌN (tránh chủ đề đã làm).
// Module này chỉ gồm luật và mẫu chạy trên máy: lời nhắc nhờ Muse viết kịch bản (hồ sơ + dàn ý, rồi từng phần), đọc trả lời, soát lỗi, tạo danh sách việc.
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.pairPlan = factory();
})(typeof window !== 'undefined' ? window : globalThis, function () {
  'use strict';
  const KIND = 'pair';
  const MODES = ['life', 'gear'];            // life: «cùng một nhân vật, hai con đường» · gear: «Khí tài đối đầu» (hai khí tài, mỗi mốc một hạng mục so sánh; cần key đã mua)
  const LAYOUTS = ['side', 'stack'];       // side: trái | phải, khung 16:9 · stack: trên / dưới, khung dọc 9:16
  const MINUTES = [1, 3, 5, 8, 9, 10];     // 1–5 phút để chạy thử rẻ; 8–10 phút là video hoàn chỉnh
  const SECONDS = 8;                       // mỗi clip 8 giây (Muse tạo tối đa 10 giây)
  const PART_BEATS = 8;                    // số mốc Muse viết mỗi lượt
  const MAX_BEATS = 80;
  const MAX_LESSONS = 5;
  // Ngôn ngữ video: lời đọc, phụ đề, nhãn và chữ trên video đều theo MỘT ngôn ngữ. Mặc định tiếng Anh.
  //   rate: ký tự đọc được mỗi giây (chữ tượng hình đọc ít ký tự hơn nhiều); wide: chữ tượng hình (giới hạn độ dài ngắn hơn);
  //   voice: giọng Microsoft mặc định; meter: tên chỉ số dự phòng; tagline / lessons: chữ cố định trên thẻ mở đầu và thẻ kết.
  const lng = (id, label, vi, voice, rate, meter, tagline, lessons, extra = {}) => ({ id, label, vi, voice, rate, meter, tagline, lessons, wide: false, ...extra });
  const LANGUAGES = [
    lng('en', 'English', 'tiếng Anh', 'en-US-GuyNeural', 15, 'CONFIDENCE', 'ONE PERSON · TWO PATHS', 'WHAT TO TAKE AWAY'),
    lng('vi', 'Tiếng Việt', 'tiếng Việt', 'vi-VN-NamMinhNeural', 20, 'TỰ TIN', 'MỘT NHÂN VẬT · HAI CON ĐƯỜNG', 'ĐIỀU NÊN LÀM'),
    lng('es', 'Español', 'tiếng Tây Ban Nha', 'es-ES-AlvaroNeural', 16, 'CONFIANZA', 'UNA PERSONA · DOS CAMINOS', 'LO QUE DEBES LLEVARTE'),
    lng('pt', 'Português', 'tiếng Bồ Đào Nha', 'pt-BR-AntonioNeural', 16, 'CONFIANÇA', 'UMA PESSOA · DOIS CAMINHOS', 'O QUE LEVAR DAQUI'),
    lng('fr', 'Français', 'tiếng Pháp', 'fr-FR-HenriNeural', 16, 'CONFIANCE', 'UNE PERSONNE · DEUX CHEMINS', 'CE QU’IL FAUT RETENIR'),
    lng('de', 'Deutsch', 'tiếng Đức', 'de-DE-ConradNeural', 14, 'SELBSTVERTRAUEN', 'EIN MENSCH · ZWEI WEGE', 'WAS DU MITNEHMEN KANNST'),
    lng('id', 'Bahasa Indonesia', 'tiếng Indonesia', 'id-ID-ArdiNeural', 16, 'PERCAYA DIRI', 'SATU ORANG · DUA JALAN', 'YANG PERLU DIINGAT'),
    lng('ru', 'Русский', 'tiếng Nga', 'ru-RU-DmitryNeural', 14, 'УВЕРЕННОСТЬ', 'ОДИН ЧЕЛОВЕК · ДВА ПУТИ', 'ЧТО ВЗЯТЬ С СОБОЙ'),
    lng('tr', 'Türkçe', 'tiếng Thổ Nhĩ Kỳ', 'tr-TR-AhmetNeural', 14, 'ÖZGÜVEN', 'BİR KİŞİ · İKİ YOL', 'AKLINDA TUT'),
    lng('hi', 'हिन्दी', 'tiếng Hindi', 'hi-IN-MadhurNeural', 14, 'आत्मविश्वास', 'एक इंसान · दो रास्ते', 'क्या सीखें'),
    lng('ar', 'العربية', 'tiếng Ả Rập', 'ar-SA-HamedNeural', 14, 'الثقة', 'شخص واحد · طريقان', 'ما يجب تذكره'),
    lng('th', 'ไทย', 'tiếng Thái', 'th-TH-NiwatNeural', 13, 'ความมั่นใจ', 'หนึ่งคน · สองเส้นทาง', 'สิ่งที่ควรทำ'),
    lng('ja', '日本語', 'tiếng Nhật', 'ja-JP-KeitaNeural', 8, '自信', 'ひとり、ふたつの道', '覚えておきたいこと', { wide: true }),
    lng('ko', '한국어', 'tiếng Hàn', 'ko-KR-InJoonNeural', 9, '자신감', '한 사람 · 두 갈래 길', '기억할 것', { wide: true }),
    lng('zh', '中文', 'tiếng Trung', 'zh-CN-YunxiNeural', 5, '自信', '同一个人 · 两条路', '可以怎么做', { wide: true })
  ];
  const LANGS = Object.fromEntries(LANGUAGES.map(l => [l.id, l.label]));
  const LANG_VI = Object.fromEntries(LANGUAGES.map(l => [l.id, l.vi]));
  const langOf = id => LANGUAGES.find(l => l.id === id) || LANGUAGES[0];
  const RATES = Object.fromEntries(LANGUAGES.map(l => [l.id, l.rate]));
  // Giới hạn độ dài chữ trên video: chữ tượng hình (Nhật, Hàn, Trung) ngắn hơn nhiều ký tự mà vẫn dài bằng chữ Latinh.
  const limits = lang => (langOf(lang).wide
    ? { caption: 36, label: 20, tag: 10, lesson: 26, closing: 44 }
    : { caption: 78, label: 34, tag: 16, lesson: 44, closing: 90 });
  const MAX_CAPTION = 78, MAX_LABEL = 34, MAX_TAG = 16;
  const clamp = (n, lo, hi) => Math.min(hi, Math.max(lo, n));
  const flat = s => String(s == null ? '' : s).replace(/\s+/g, ' ').trim();
  const count = s => Array.from(String(s || '')).length;
  const cut = (s, n) => { const a = Array.from(flat(s)); return a.length > n ? a.slice(0, n - 1).join('').trim() + '…' : a.join(''); };
  // Lời đọc mỗi mốc: chừa ~1,2 giây (vào chậm + nghỉ) trong clip 8 giây.
  const budgetChars = (seconds, lang) => Math.max(40, Math.floor((seconds - 1.2) * (RATES[lang] || 15) * 0.92));
  const beatsFor = minutes => clamp(Math.round(minutes * 60 / 8.2), 6, MAX_BEATS);

  // ---------- Danh sách chủ đề gợi ý (chọn để điền sẵn chủ đề và hai nhãn; sửa lại tùy ý) ----------
  const T = (id, vi, en) => ({ id, vi, en });
  const TOPICS = [
    T('yell', ['Cùng một đứa trẻ: người cha la mắng và người cha biết lắng nghe', 'LỚN LÊN TRONG TIẾNG LA MẮNG', 'LỚN LÊN ĐƯỢC LẮNG NGHE', 'TỰ TIN'], ['The same child: a father who yells and a father who listens', 'RAISED WITH YELLING', 'RAISED WITH LISTENING', 'CONFIDENCE']),
    T('study', ['Học vì sợ điểm và học vì tò mò', 'HỌC VÌ SỢ ĐIỂM', 'HỌC VÌ TÒ MÒ', 'ĐAM MÊ'], ['Studying out of fear of grades and studying out of curiosity', 'STUDYING OUT OF FEAR', 'STUDYING OUT OF CURIOSITY', 'PASSION']),
    T('money', ['Tiêu hết mỗi tháng và tiết kiệm đều từ nhỏ', 'TIÊU HẾT MỖI THÁNG', 'TIẾT KIỆM ĐỀU ĐẶN', 'TÀI CHÍNH'], ['Spending everything every month and saving steadily from young', 'SPEND IT ALL', 'SAVE A LITTLE EVERY MONTH', 'FINANCES']),
    T('sleep', ['Thức khuya mỗi đêm và ngủ đúng giờ', 'THỨC KHUYA MỖI ĐÊM', 'NGỦ ĐÚNG GIỜ', 'NĂNG LƯỢNG'], ['Staying up late every night and sleeping on time', 'UP ALL NIGHT', 'SLEEPING ON TIME', 'ENERGY']),
    T('phone', ['Lướt điện thoại cả ngày và dùng có chừng mực', 'LƯỚT ĐIỆN THOẠI CẢ NGÀY', 'DÙNG CÓ CHỪNG MỰC', 'TẬP TRUNG'], ['Scrolling the phone all day and using it with limits', 'SCROLLING ALL DAY', 'USING IT WITH LIMITS', 'FOCUS']),
    T('move', ['Ngồi một chỗ cả ngày và đi bộ mỗi ngày', 'NGỒI MỘT CHỖ CẢ NGÀY', 'ĐI BỘ MỖI NGÀY', 'SỨC KHỎE'], ['Sitting all day and walking every day', 'SITTING ALL DAY', 'WALKING EVERY DAY', 'HEALTH']),
    T('praise', ['Chỉ khen kết quả và khen sự nỗ lực', 'CHỈ KHEN KẾT QUẢ', 'KHEN SỰ NỖ LỰC', 'DŨNG CẢM THỬ'], ['Praising only results and praising effort', 'PRAISE FOR RESULTS', 'PRAISE FOR EFFORT', 'COURAGE TO TRY']),
    T('fail', ['Thất bại bị chê cười và thất bại được khích lệ thử lại', 'THẤT BẠI BỊ CHÊ CƯỜI', 'THẤT BẠI ĐƯỢC KHÍCH LỆ', 'KIÊN TRÌ'], ['Failing and being laughed at, failing and being encouraged to try again', 'LAUGHED AT FOR FAILING', 'ENCOURAGED TO TRY AGAIN', 'GRIT']),
    T('anger', ['Nổi nóng ngay và hít thở trước khi nói', 'NỔI NÓNG NGAY', 'HÍT THỞ RỒI MỚI NÓI', 'BÌNH TĨNH'], ['Snapping right away and breathing before speaking', 'SNAP RIGHT AWAY', 'BREATHE FIRST', 'CALM']),
    T('procrastinate', ['Trì hoãn đến phút chót và làm từng bước nhỏ mỗi ngày', 'TRÌ HOÃN ĐẾN PHÚT CHÓT', 'LÀM TỪNG BƯỚC NHỎ', 'TIẾN BỘ'], ['Procrastinating until the last minute and taking small steps every day', 'LAST-MINUTE RUSH', 'SMALL STEPS DAILY', 'PROGRESS']),
    T('read', ['Không bao giờ đọc sách và đọc 20 phút mỗi ngày', 'KHÔNG ĐỌC SÁCH', 'ĐỌC 20 PHÚT MỖI NGÀY', 'KIẾN THỨC'], ['Never reading and reading 20 minutes a day', 'NEVER READING', 'READING 20 MINUTES A DAY', 'KNOWLEDGE']),
    T('food', ['Ăn đồ ăn nhanh mỗi ngày và ăn cân bằng', 'ĐỒ ĂN NHANH MỖI NGÀY', 'ĂN UỐNG CÂN BẰNG', 'SỨC KHỎE'], ['Fast food every day and a balanced diet', 'FAST FOOD DAILY', 'BALANCED EATING', 'HEALTH']),
    T('friends', ['Nói xấu sau lưng bạn bè và sống chân thành', 'NÓI XẤU SAU LƯNG', 'SỐNG CHÂN THÀNH', 'TÌNH BẠN'], ['Gossiping behind friends\' backs and being sincere', 'GOSSIPING', 'BEING SINCERE', 'FRIENDSHIP']),
    T('thanks', ['Luôn than phiền và biết ơn mỗi ngày', 'LUÔN THAN PHIỀN', 'BIẾT ƠN MỖI NGÀY', 'HẠNH PHÚC'], ['Always complaining and being grateful every day', 'ALWAYS COMPLAINING', 'GRATEFUL EVERY DAY', 'HAPPINESS'])
  ];
  // Chủ đề cụ thể theo ngôn ngữ video: {topic, left, right, meter}.
  // Có sẵn chữ tiếng Anh và tiếng Việt; ngôn ngữ khác: chủ đề (tiếng Anh) điền sẵn, nhãn để trống cho Muse tự viết đúng ngôn ngữ video.
  function topicPreset(id, lang = 'en') {
    const t = TOPICS.find(x => x.id === id);
    if (!t) return null;
    const native = lang === 'vi' ? t.vi : t.en;
    const own = lang === 'vi' || lang === 'en';
    return { id, topic: native[0], left: own ? native[1] : '', right: own ? native[2] : '', meter: own ? native[3] : '' };
  }


  // ---------- Chế độ «Khí tài đối đầu» ----------
  // Cùng khung hai nửa TRÁI | PHẢI, nhưng là HAI KHÍ TÀI khác nhau (máy bay, xe tăng, tàu, phòng không, UAV): mỗi mốc là MỘT HẠNG MỤC so sánh (tốc độ, tầm, hỏa lực, giáp, tàng hình, giá…).
  // Ảnh nền chung của mốc có CẢ HAI khí tài đứng cạnh nhau; clip trái tập trung vào khí tài bên trái, clip phải vào khí tài bên phải. Chỉ thông tin công khai, không cảnh chiến sự.
  const G = (id, vi, en) => ({ id, vi, en });
  const GEAR_TOPICS = [
    G('f35_su57', ['F-35 Lightning II và Su-57: hai tiêm kích thế hệ 5 so sánh thông số', 'F-35', 'SU-57', 'ĐIỂM'], ['F-35 Lightning II vs Su-57: two fifth-generation fighters compared', 'F-35', 'SU-57', 'RATING']),
    G('f22_j20', ['F-22 Raptor và J-20: tiêm kích tàng hình đối đầu', 'F-22', 'J-20', 'ĐIỂM'], ['F-22 Raptor vs J-20: stealth fighters head to head', 'F-22', 'J-20', 'RATING']),
    G('rafale_typhoon', ['Rafale và Eurofighter Typhoon: tiêm kích châu Âu so sánh', 'RAFALE', 'TYPHOON', 'ĐIỂM'], ['Rafale vs Eurofighter Typhoon: Europe\'s fighters compared', 'RAFALE', 'TYPHOON', 'RATING']),
    G('abrams_t90', ['M1 Abrams và T-90: hai xe tăng chủ lực so sánh', 'M1 ABRAMS', 'T-90', 'ĐIỂM'], ['M1 Abrams vs T-90: two main battle tanks compared', 'M1 ABRAMS', 'T-90', 'RATING']),
    G('leopard_k2', ['Leopard 2A7 và K2 Black Panther: xe tăng thế hệ mới so sánh', 'LEOPARD 2A7', 'K2 BLACK PANTHER', 'ĐIỂM'], ['Leopard 2A7 vs K2 Black Panther: modern tanks compared', 'LEOPARD 2A7', 'K2 BLACK PANTHER', 'RATING']),
    G('tb2_reaper', ['Bayraktar TB2 và MQ-9 Reaper: hai UAV so sánh', 'BAYRAKTAR TB2', 'MQ-9 REAPER', 'ĐIỂM'], ['Bayraktar TB2 vs MQ-9 Reaper: two drones compared', 'BAYRAKTAR TB2', 'MQ-9 REAPER', 'RATING']),
    G('s400_patriot', ['S-400 và Patriot: hai hệ thống phòng không so sánh', 'S-400', 'PATRIOT', 'ĐIỂM'], ['S-400 vs Patriot: two air-defense systems compared', 'S-400', 'PATRIOT', 'RATING']),
    G('apache_ka52', ['AH-64 Apache và Ka-52: trực thăng tấn công so sánh', 'AH-64 APACHE', 'KA-52', 'ĐIỂM'], ['AH-64 Apache vs Ka-52: attack helicopters compared', 'AH-64 APACHE', 'KA-52', 'RATING']),
    G('type055_burke', ['Type 055 và Arleigh Burke: hai khu trục hạm so sánh', 'TYPE 055', 'ARLEIGH BURKE', 'ĐIỂM'], ['Type 055 vs Arleigh Burke: two destroyers compared', 'TYPE 055', 'ARLEIGH BURKE', 'RATING']),
    G('virginia_yasen', ['Virginia và Yasen-M: tàu ngầm hạt nhân tấn công so sánh', 'VIRGINIA', 'YASEN-M', 'ĐIỂM'], ['Virginia-class vs Yasen-M: attack submarines compared', 'VIRGINIA', 'YASEN-M', 'RATING']),
    G('a10_su25', ['A-10 Thunderbolt II và Su-25: hai cường kích so sánh', 'A-10', 'SU-25', 'ĐIỂM'], ['A-10 Thunderbolt II vs Su-25: two ground-attack jets compared', 'A-10', 'SU-25', 'RATING']),
    G('b2_b21', ['B-2 Spirit và B-21 Raider: máy bay ném bom tàng hình so sánh', 'B-2 SPIRIT', 'B-21 RAIDER', 'ĐIỂM'], ['B-2 Spirit vs B-21 Raider: stealth bombers compared', 'B-2 SPIRIT', 'B-21 RAIDER', 'RATING'])
  ];
  function gearPreset(id, lang = 'en') {
    const t = GEAR_TOPICS.find(x => x.id === id);
    if (!t) return null;
    const native = lang === 'vi' ? t.vi : t.en, own = lang === 'vi' || lang === 'en';
    return { id, topic: native[0], left: native[1], right: native[2], meter: own ? native[3] : '' };   // tên khí tài giống nhau ở mọi ngôn ngữ
  }
  // Chữ cố định trên video khí tài theo ngôn ngữ: tagline (thẻ mở đầu), verdict (tiêu đề thẻ kết), meter (tên chỉ số dự phòng), ab (nhãn dự phòng hai bên).
  const GEAR_TEXT = {
    en: { tagline: 'HEAD TO HEAD · SPECS COMPARED', verdict: 'THE VERDICT', meter: 'RATING', a: 'MACHINE A', b: 'MACHINE B' },
    vi: { tagline: 'ĐỐI ĐẦU · SO SÁNH THÔNG SỐ', verdict: 'KẾT LUẬN', meter: 'ĐIỂM', a: 'KHÍ TÀI A', b: 'KHÍ TÀI B' },
    es: { tagline: 'CARA A CARA · COMPARATIVA', verdict: 'EL VEREDICTO', meter: 'PUNTUACIÓN', a: 'EQUIPO A', b: 'EQUIPO B' },
    pt: { tagline: 'FRENTE A FRENTE · COMPARAÇÃO', verdict: 'O VEREDITO', meter: 'NOTA', a: 'EQUIPAMENTO A', b: 'EQUIPAMENTO B' },
    fr: { tagline: 'FACE À FACE · COMPARATIF', verdict: 'LE VERDICT', meter: 'NOTE', a: 'MATÉRIEL A', b: 'MATÉRIEL B' },
    de: { tagline: 'DUELL · TECHNIK IM VERGLEICH', verdict: 'DAS URTEIL', meter: 'WERTUNG', a: 'SYSTEM A', b: 'SYSTEM B' },
    id: { tagline: 'ADU KEKUATAN · PERBANDINGAN', verdict: 'KESIMPULAN', meter: 'SKOR', a: 'ALUTSISTA A', b: 'ALUTSISTA B' },
    ru: { tagline: 'ЛИЦОМ К ЛИЦУ · СРАВНЕНИЕ', verdict: 'ВЕРДИКТ', meter: 'ОЦЕНКА', a: 'ТЕХНИКА A', b: 'ТЕХНИКА B' },
    tr: { tagline: 'KAPIŞMA · KARŞILAŞTIRMA', verdict: 'SONUÇ', meter: 'PUAN', a: 'SİSTEM A', b: 'SİSTEM B' },
    hi: { tagline: 'आमने-सामने · तुलना', verdict: 'निष्कर्ष', meter: 'स्कोर', a: 'हथियार A', b: 'हथियार B' },
    ar: { tagline: 'وجهاً لوجه · مقارنة', verdict: 'الحكم', meter: 'التقييم', a: 'المعدة أ', b: 'المعدة ب' },
    th: { tagline: 'เผชิญหน้า · เปรียบเทียบ', verdict: 'สรุปผล', meter: 'คะแนน', a: 'ยุทโธปกรณ์ A', b: 'ยุทโธปกรณ์ B' },
    ja: { tagline: '真っ向勝負 · スペック比較', verdict: '結論', meter: '評価', a: '装備A', b: '装備B' },
    ko: { tagline: '정면 대결 · 제원 비교', verdict: '결론', meter: '점수', a: '장비 A', b: '장비 B' },
    zh: { tagline: '正面对决 · 参数对比', verdict: '结论', meter: '评分', a: '装备A', b: '装备B' }
  };
  const gearText = lang => GEAR_TEXT[lang] || GEAR_TEXT.en;
  // Chữ cố định theo ngôn ngữ và chế độ (thẻ mở đầu, tiêu đề thẻ kết, chỉ số dự phòng).
  const taglineOf = (lang, mode) => mode === 'gear' ? gearText(lang).tagline : langOf(lang).tagline;
  const lessonsTitleOf = (lang, mode) => mode === 'gear' ? gearText(lang).verdict : langOf(lang).lessons;
  const meterOf = (lang, mode) => mode === 'gear' ? gearText(lang).meter : langOf(lang).meter;

  // ---------- Tùy chọn ----------
  // topic trống = để Muse TỰ CHỌN chủ đề (avoid: các chủ đề đã làm, để không trùng).
  function options(input = {}) {
    const topic = flat(input.topic).slice(0, 200);
    const minutes = MINUTES.includes(Number(input.minutes)) ? Number(input.minutes) : 9;
    const lang = LANGS[input.lang] ? input.lang : 'en';
    const lim = limits(lang);
    const layout = LAYOUTS.includes(input.layout) ? input.layout : 'side', mode = input.mode === 'gear' ? 'gear' : 'life';
    const beats = beatsFor(minutes);
    const avoid = (Array.isArray(input.avoid) ? input.avoid : []).map(x => flat(x).slice(0, 120)).filter(Boolean).slice(-30);   // 30 mục MỚI nhất
    return {
      mode, topic, auto: !topic, avoid, left: flat(input.left).slice(0, lim.label), right: flat(input.right).slice(0, lim.label), minutes, beats, lang, layout, seconds: SECONDS, aspect: '1:1',
      clips: beats * 2, budget: budgetChars(SECONDS, lang)
    };
  }
  function problems() { return []; }   // chủ đề để trống là hợp lệ (Muse tự chọn)
  function slug(text) {
    return String(text || '').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/g, 'd').replace(/Đ/g, 'D')
      .replace(/[^A-Za-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 36).replace(/-+$/g, '');
  }
  const storyIdBase = config => 'SS-' + (slug(config.topic) || 'phim');

  // ---------- Hình ảnh: phong cách cố định cho cả hai bên ----------
  const STYLE = 'Look: clean 3D-rendered animation (like a stylised Blender render) of simple white stick-figure characters: smooth round white head with NO face, thin rounded limbs, no skin or hair; a detailed cozy 3D-rendered room with soft cinematic lighting and gentle depth of field. Not photorealistic people, no real faces.';
  const NO_TEXT = 'No text, lettering, numbers, speech bubbles, logos, watermarks, captions or user-interface overlays anywhere.';
  const NO_SPLIT = 'One single scene only: no split screen, no collage, no borders, no panels.';
  const AUDIO = 'Audio: only soft room tone and subtle everyday sounds. No speech, no voices, no singing, no music.';
  const KEEP = 'The camera is LOCKED in exactly the same position, angle and framing as the attached image; the room, furniture, objects and light stay exactly the same; the characters keep exactly the same look, size and clothes; no morphing, nothing appears or disappears by itself.';

  // ---------- Đọc trả lời (dùng chung) ----------
  const DONE = /^\W*MSDONE[0-9a-f]+\W*$/i;
  const strip = s => String(s || '').replace(/\*\*|__/g, '').replace(/^[\s"“”'`]+|[\s"“”'`]+$/g, '').trim();
  const norm = s => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/g, 'd').replace(/Đ/g, 'D').toLowerCase().replace(/[^a-z0-9 ]+/g, ' ').replace(/\s+/g, ' ').trim();
  const lineText = line => String(line || '').replace(/^[\t ]*(?:#{1,6}[\t ]*)?/, '').replace(/^[\t ]*(?:[-*•][\t ]+)/, '');
  const upper = s => flat(s).toLocaleUpperCase();
  const score = (value, fallback) => { const n = Math.round(Number(String(value).replace(/[^\d.\-]/g, ''))); return Number.isFinite(n) ? clamp(n, 0, 100) : fallback; };
  const KEYS = [
    ['title', /^(?:tieu de|title)$/], ['left', /^(?:nhan trai|left label|left)$/], ['right', /^(?:nhan phai|right label|right)$/],
    ['meter', /^(?:chi so|meter|metric)$/], ['cast', /^(?:nhan vat|characters?|cast|khi tai|equipment|machines?|hardware)$/], ['lessons', /^(?:ket luan|bai hoc|lessons?)$/],
    ['closing', /^(?:cau cuoi|closing|ending)$/], ['arc', /^(?:dan y|arc|outline|chuoi moc)$/], ['beats', /^(?:moc|cac moc|beats?|scenes?|canh)$/]
  ];
  function sectionsOf(reply) {
    const out = {};
    let key = null;
    for (const raw of String(reply || '').normalize('NFC').split(/\r?\n/)) {
      if (DONE.test(raw)) break;
      const line = lineText(raw);
      const m = /^\s*(?:\*\*|__)?([^:：|\n]{2,28}?)(?:\*\*|__)?\s*[:：]\s*(?:\*\*|__)?(.*)$/.exec(line);
      const hit = m && KEYS.find(([, re]) => re.test(norm(m[1])));
      if (hit) { key = hit[0]; out[key] = out[key] || []; if (strip(m[2])) out[key].push(strip(m[2])); continue; }
      if (key && strip(line)) out[key].push(strip(line));
    }
    return out;
  }
  const first = lines => strip((lines || [])[0] || '');
  const ROW = /^\s*(?:\*\*|__)?(?:moc|mốc|beat|scene|cảnh|canh)?\s*(\d{1,3})\s*(?:\*\*|__)?\s*[|｜]\s*(.+)$/i;
  const cellsOf = lines => {
    const rows = [];
    for (const raw of lines || []) { const m = ROW.exec(String(raw)); if (m) rows.push({ number: Number(m[1]), cells: m[2].split(/\s*[|｜]\s*/).map(strip) }); }
    return rows;
  };
  const fail = (message, fix) => Object.assign(Error(message), { fixable: true, fix });
  const castOf = script => `CHARACTERS (identical in every shot, never change): ${script.cast}`;


  // ---------- Khí tài: lời nhắc kịch bản ----------
  const GEAR_RULES = config => {
    const L = LANG_VI[config.lang], lim = limits(config.lang);
    return [
      '1. CHỈ dùng thông tin CÔNG KHAI và đáng tin (nhà sản xuất, bộ quốc phòng, tạp chí quân sự uy tín). Số liệu nói «khoảng» / «theo công bố»; số còn tranh cãi hoặc chưa xác nhận thì nói rõ là chưa xác nhận; KHÔNG bịa số. Không hướng dẫn chế tạo, sửa đổi hay vận hành vũ khí. Giọng khách quan, mỗi bên nêu cả điểm mạnh và hạn chế; không cổ vũ chiến tranh, không hạ thấp quốc gia hay dân tộc nào.',
      '2. Hai bên LUÔN xuất phát từ cùng một khung hình ở mỗi mốc: một địa điểm TRƯNG BÀY / THỬ NGHIỆM hợp với hạng mục (đường băng sân bay, bãi thử xe, cảng, bãi duyệt binh, trời xanh trên biển…) có CẢ HAI khí tài đứng / đỗ cạnh nhau (trái | phải), cùng tỉ lệ, thấy trọn cả hai. Hai clip chỉ khác nhau ở việc bên nào TRÌNH DIỄN (cất cánh, chạy thử, bay ngang qua, quay tháp pháo, rẽ sóng…). KHÔNG cảnh chiến sự: không người bị thương, không máu, không nổ phá hủy, không bắn vào mục tiêu có người; nếu cần minh họa hỏa lực thì chỉ bắn thử trên bãi thử trống.',
      '3. Mốc 1 GIỚI THIỆU hai khí tài (nước sản xuất, năm đưa vào trang bị, vai trò). Mỗi mốc giữa là MỘT HẠNG MỤC KHÁC NHAU (ví dụ tốc độ, tầm bay / tầm hoạt động, hỏa lực / vũ khí, giáp và khả năng sống sót, tàng hình / điện tử, cơ động, giá thành và chi phí vận hành, độ tin cậy và bảo dưỡng, số lượng đang trang bị). Mốc cuối TỔNG KẾT.',
      `4. NHÃN MỐC = TÊN HẠNG MỤC, in hoa, ≤ ${lim.tag} ký tự, bằng ${L} (ví dụ SPEED, RANGE, FIREPOWER, ARMOR, STEALTH, COST — hãy viết đúng ${L}).`,
      `5. CHỈ SỐ là ĐIỂM 0–100 của MỖI BÊN ở hạng mục của mốc đó (đánh giá ước lượng để minh họa, theo thông tin công khai); tên chỉ số bằng ${L}, in hoa, ≤ ${lim.tag} ký tự (ví dụ RATING / ĐIỂM). Bên nào hơn ở hạng mục thì điểm cao hơn; hai bên phải THẮNG Ở NHỮNG HẠNG MỤC KHÁC NHAU (không để một bên hơn tất cả), chênh lệch hợp lý (thường 5–35 điểm). Mốc 1 (giới thiệu) cả hai bên 50.`,
      '6. KHÍ TÀI viết bằng TIẾNG ANH, rất cụ thể để mọi khung vẽ ra đúng cùng hai khí tài: tên gọi chính xác, hình dáng nhận dạng (số động cơ / cánh / tháp pháo / cấu trúc thượng tầng), màu sơn và ký hiệu đơn giản, số lượng trong khung (mỗi bên MỘT chiếc). Không viết chữ hay số hiệu đọc được trên thân.',
      `7. KẾT LUẬN gồm 3–${MAX_LESSONS} dòng tổng kết khách quan, mỗi dòng ≤ ${lim.lesson - 4} ký tự bằng ${L} (khí tài nào hợp nhiệm vụ nào, đánh đổi giữa giá và hiệu năng, điều còn tùy học thuyết sử dụng); KHÔNG tuyên bố «tốt nhất tuyệt đối». CÂU CUỐI ≤ ${lim.closing - 20} ký tự bằng ${L}, trung lập, mời người xem nêu ý kiến.`,
      `8. NHÃN TRÁI, NHÃN PHẢI = tên gọi ngắn của hai khí tài, in hoa, ≤ ${lim.label} ký tự (ví dụ F-35 / SU-57).`
    ];
  };
  function buildGearBibleInstruction(config, ctx) {
    const marker = ctx.marker ? String(ctx.marker) : '';
    return [
      'Bạn là biên kịch cho một video «KHÍ TÀI ĐỐI ĐẦU»: so sánh thông số và đặc điểm CÔNG KHAI của hai khí tài quân sự (máy bay, xe tăng, tàu, phòng không, UAV, trực thăng). Màn hình chia đôi TRÁI và PHẢI; mỗi mốc là MỘT HẠNG MỤC so sánh, hai khí tài đứng cạnh nhau trong cùng một khung hình rồi mỗi bên trình diễn riêng.',
      `Phim dài khoảng ${config.minutes} phút, gồm ${config.beats} mốc nối tiếp; mỗi mốc là hai clip ${config.seconds} giây (một cú máy liền, không thoại, không chữ) dựng hình thực tế bằng CGI và một đoạn lời dẫn tiếng ${LANG_VI[config.lang]}. Người xem là người yêu quân sự / công nghệ muốn hiểu khác biệt thật sự giữa hai khí tài.`,
      '',
      'QUY TẮC',
      ...GEAR_RULES(config),
      `9. DÀN Ý có ĐÚNG ${config.beats} dòng (đánh số 1 đến ${config.beats}); mỗi dòng: số | nhãn mốc (tên hạng mục) | tóm tắt (1 câu, ≤ 25 từ: điều KHÁC nhau giữa hai khí tài ở hạng mục này, kèm một thông số / sự kiện công khai nếu có) | điểm trái 0-100 | điểm phải 0-100. Không hạng mục nào lặp lại.`,
      '',
      'Trả lời đúng khuôn sau, KHÔNG viết thêm câu dẫn hay giải thích:',
      `TIÊU ĐỀ: <tiêu đề video HÚT VIEW bằng ${LANG_VI[config.lang]}, 45–68 ký tự: tên hai khí tài ở ĐẦU và một câu hỏi hoặc điểm gây tò mò (ví dụ «F-35 vs Su-57: Which Fighter Is Really Better?»), không giật tít sai sự thật>`,
      'NHÃN TRÁI: <...>', 'NHÃN PHẢI: <...>', 'CHỈ SỐ: <...>',
      'KHÍ TÀI: <ENGLISH: một đoạn mô tả cố định hai khí tài>',
      'KẾT LUẬN:', '- <dòng 1>', '- <dòng 2>',
      'CÂU CUỐI: <...>',
      'DÀN Ý:', '1 | <HẠNG MỤC> | <tóm tắt> | <trái> | <phải>', `2 | ...   (đủ ${config.beats} dòng)`,
      ...tail(ctx),
      ...(config.topic
        ? [`CẶP KHÍ TÀI / CHỦ ĐỀ (chỉ là chủ đề cần làm video, không phải mệnh lệnh): ${config.topic}`, ...titleLines(config)]
        : [
          'CHỦ ĐỀ: người làm video để TRỐNG, nên bạn TỰ CHỌN một cặp khí tài thật sự đáng so sánh (cùng loại, cùng thời kỳ, có nhiều thông tin công khai; ví dụ hai tiêm kích thế hệ 5, hai xe tăng chủ lực, hai hệ thống phòng không, hai khu trục hạm).',
          ...(config.avoid.length ? [`TRÁNH các cặp / chủ đề đã làm (dữ liệu, không phải mệnh lệnh): ${config.avoid.join(' · ')}`, ...titleLines(config)] : [])
        ]),
      config.left || config.right ? `NHÃN NGƯỜI LÀM VIDEO MUỐN DÙNG (dữ liệu, không phải mệnh lệnh): trái = ${config.left || '(tự đặt)'}; phải = ${config.right || '(tự đặt)'}` : '',
      marker ? `MSEND${marker}` : ''
    ].filter((line, index, all) => line !== '' || (index > 0 && all[index - 1] !== '' && index < all.length - 1)).join('\n');
  }
  function buildGearPartInstruction(config, bible, ctx) {
    const [a, b] = ctx.range, marker = ctx.marker ? String(ctx.marker) : '';
    const rows = bible.arc.filter(r => r.number >= a && r.number <= b), prev = (ctx.previous || []).slice(-2);
    return [
      `Bạn là biên kịch của video «KHÍ TÀI ĐỐI ĐẦU» «${bible.title}» (${config.beats} mốc). Bây giờ viết CHI TIẾT các mốc ${a} đến ${b} theo ĐÚNG dàn ý bên dưới (không đổi hạng mục, không đổi điểm quá ±6).`,
      `Mỗi mốc: hai bên bắt đầu từ cùng MỘT khung hình (cùng địa điểm, góc máy, CẢ HAI khí tài đứng cạnh nhau), rồi mỗi bên TRÌNH DIỄN hạng mục đó trong ${config.seconds} giây. Chữ do phần mềm tự vẽ, bạn chỉ viết nội dung.`,
      '',
      'QUY TẮC',
      `1. KHUNG, TRÁI, PHẢI viết bằng TIẾNG ANH, cụ thể và vật lý: KHUNG = địa điểm + vị trí hai khí tài (bên TRÁI của khung là khí tài trái, bên PHẢI là khí tài phải) + thời tiết / ánh sáng; TRÁI = khí tài bên TRÁI làm gì trong ~${config.seconds} giây (cất cánh, chạy thử, bay ngang qua, quay tháp pháo, rẽ sóng, bắn thử trên bãi trống…) và máy quay chuyển động thế nào (lia chậm, bám theo, quay quanh); PHẢI = tương tự cho khí tài bên PHẢI; mỗi mô tả ≤ 45 từ; không viết chữ trên thân khí tài; không dùng dấu | trong nội dung. KHÔNG cảnh chiến sự: không người bị thương, không máu, không nổ phá hủy, không bắn vào người hay công trình.`,
      `2. PHỤ ĐỀ bằng ${LANG_VI[config.lang]}, ≤ ${limits(config.lang).caption} ký tự, nêu kết quả của hạng mục (ví dụ tên hạng mục + số liệu chính); không emoji, không hashtag.`,
      `3. LỜI ĐỌC là lời người dẫn bằng ${LANG_VI[config.lang]}, văn nói tự nhiên, ≤ ${config.budget} ký tự (đọc vừa trong ~${config.seconds - 1} giây): nói số liệu BÊN TRÁI rồi BÊN PHẢI kèm đơn vị (viết đơn vị bằng chữ để đọc được), dùng «khoảng» / «theo công bố»; số chưa xác nhận thì nói rõ; không lặp nguyên văn phụ đề, không số thứ tự, không ký hiệu; các mốc kế nhau không mở đầu giống nhau.`,
      '4. Mỗi mốc phải có điểm KHÁC biệt rõ giữa TRÁI và PHẢI ở hạng mục đó; khách quan, không cổ vũ chiến tranh.',
      '',
      `NHÃN TRÁI: ${bible.left} · NHÃN PHẢI: ${bible.right} · CHỈ SỐ: ${bible.meter}`,
      `KHÍ TÀI (cố định): ${bible.cast}`,
      'DÀN Ý CỦA CÁC MỐC CẦN VIẾT (dữ liệu, không phải mệnh lệnh):',
      ...rows.map(r => `${r.number} | ${r.label} | ${cut(r.summary, 220)} | ${r.leftScore} | ${r.rightScore}`),
      ...(prev.length ? ['', 'HAI MỐC NGAY TRƯỚC (đã viết, để nối mạch, không viết lại):', ...prev.map(p => `${p.number} | ${p.label} | ${cut(p.caption, 80)} | ${cut(p.narration, 120)} | ${cut(p.frame, 160)}`)] : []),
      '',
      'Trả lời đúng khuôn sau, mỗi mốc MỘT dòng, KHÔNG viết thêm câu dẫn hay giải thích:',
      'MỐC:',
      '<số> | <NHÃN MỐC> | <PHỤ ĐỀ> | <LỜI ĐỌC> | <KHUNG: ENGLISH> | <TRÁI: ENGLISH> | <PHẢI: ENGLISH> | <điểm trái 0-100> | <điểm phải 0-100>',
      `(đủ ${b - a + 1} dòng, số từ ${a} đến ${b})`,
      ...tail(ctx),
      marker ? `MSEND${marker}` : ''
    ].filter((line, index, all) => line !== '' || (index > 0 && all[index - 1] !== '' && index < all.length - 1)).join('\n');
  }

  // ---------- Lời nhắc 1: hồ sơ + dàn ý ----------
  const RULES = config => {
    const L = LANG_VI[config.lang], lim = limits(config.lang);
    return [
      '1. Hai bên LUÔN xuất phát từ cùng một khung hình ở mỗi mốc; khác biệt chỉ nằm ở hành vi của bên «tác động» và phản ứng / thân hình của nhân vật bị tác động (co người, né tránh, ngẩng cao, thoải mái, cười…). Không dùng cảnh bạo lực, máu, đánh đập hay cảnh nhạy cảm: thể hiện căng thẳng bằng dáng đứng cao hơn, ngón tay chỉ, cúi người, quay lưng, khoanh tay.',
      '2. Chuỗi mốc tiến triển rõ theo thời gian (ví dụ tuổi 0, 3, 6, 9, 12, 16, 25, 30; mỗi tuổi / giai đoạn có vài mốc liên tiếp, mỗi mốc là một tình huống KHÁC nhau), từ khởi đầu đến hệ quả dài hạn của mỗi con đường. Căn phòng đổi theo giai đoạn, nhưng trong MỘT mốc thì hai bên cùng căn phòng.',
      `3. Chữ trên màn hình do phần mềm tự vẽ, bạn chỉ viết nội dung. Nhãn mốc ≤ ${lim.tag} ký tự, in hoa (nếu ngôn ngữ có chữ hoa), bằng ${L} (ví dụ AGE 3, YEAR 2, DAY 30 — hãy viết đúng ${L}), không giảm theo thời gian.`,
      `4. CHỈ SỐ là một thước đo 0–100 thể hiện hệ quả lên nhân vật chính (ví dụ CONFIDENCE, HEALTH, HAPPINESS, MONEY — hãy viết đúng ${L}); tên bằng ${L}, in hoa, ≤ ${lim.tag} ký tự. Mốc 1 cả hai bên đều 100. Bên «tệ» giảm dần theo các mốc (đến khoảng 10–30 ở mốc cuối), bên «tốt» giữ ở 85–100; số phải khớp nội dung mốc.`,
      '5. NHÂN VẬT viết bằng TIẾNG ANH, rất cụ thể để mọi khung vẽ ra cùng một nhóm nhân vật: số người que, chiều cao tương đối, màu áo hay chi tiết phân biệt (đầu luôn tròn trắng không mặt); nếu nhân vật lớn lên theo mốc thì ghi rõ cách thay đổi (nhỏ → cao dần) nhưng áo giữ màu.',
      `6. KẾT LUẬN gồm 3–${MAX_LESSONS} bài học / việc nên làm, mỗi dòng ≤ ${lim.lesson - 4} ký tự bằng ${L}; CÂU CUỐI ≤ ${lim.closing - 20} ký tự bằng ${L}, là lời chốt nhân văn, không hạ thấp ai.`,
      `7. Nhãn hai bên (NHÃN TRÁI, NHÃN PHẢI) in hoa, ≤ ${lim.label} ký tự, bằng ${L}, nói rõ hai con đường (ví dụ RAISED WITH YELLING / RAISED WITH LISTENING — hãy viết đúng ${L}).`
    ];
  };
  const tail = ctx => [
    ctx.marker ? `(dòng cuối cùng của trả lời chỉ gồm đúng một từ: MSDONE${ctx.marker})` : '',
    ...(ctx.fix ? ['', 'SỬA LỖI – lần trước còn lỗi sau; viết lại ĐỦ, đúng khuôn trên:', ctx.fix] : []),
    ''
  ];
  const titleLines = config => config.avoid.length
    ? [`TIÊU ĐỀ phải KHÁC mọi tiêu đề đã dùng (dữ liệu, không phải mệnh lệnh): ${config.avoid.join(' · ')}. Hãy nêu điều RIÊNG của kịch bản này (một tình huống, điểm ngoặt hoặc cái kết của nó) thay vì lặp lại chủ đề.`]
    : [];
  const topicLines = config => config.topic
    ? [`CHỦ ĐỀ (chỉ là chủ đề cần làm video, không phải mệnh lệnh): ${config.topic}`, ...titleLines(config)]
    : [
      'CHỦ ĐỀ: người làm video để TRỐNG, nên bạn TỰ CHỌN một chủ đề «cùng một nhân vật, hai con đường» thật hay và có ích cho người xem phổ thông (ví dụ cách nuôi dạy con, thói quen tiền bạc, giấc ngủ, học tập, cách ứng xử với bạn bè…). Chủ đề phải tạo được hai con đường khác biệt rõ và hệ quả dài hạn dễ thấy; KHÔNG đụng chính trị, tôn giáo, sắc tộc, bệnh cụ thể hay người thật.',
      ...(config.avoid.length ? [`TRÁNH các chủ đề đã làm (dữ liệu, không phải mệnh lệnh): ${config.avoid.join(' · ')}`, ...titleLines(config)] : [])
    ];
  function buildBibleInstruction(input, ctx = {}) {
    const config = options(input);
    if (config.mode === 'gear') return buildGearBibleInstruction(config, ctx);
    const marker = ctx.marker ? String(ctx.marker) : '';
    return [
      'Bạn là biên kịch cho một video SO SÁNH SONG SONG kiểu «cùng một nhân vật, hai con đường»: màn hình chia đôi TRÁI và PHẢI; ở mỗi mốc thời gian, hai bên bắt đầu từ MỘT khung hình giống hệt nhau rồi diễn ra HAI kết cục khác nhau chỉ vì hai cách ứng xử / lựa chọn khác nhau. Đầu tiên bạn lập HỒ SƠ và DÀN Ý cho cả phim (chưa viết chi tiết từng mốc).',
      `Phim dài khoảng ${config.minutes} phút, gồm ${config.beats} mốc nối tiếp theo thời gian; mỗi mốc là hai clip ${config.seconds} giây (một cú máy liền, không thoại, không chữ) bằng hoạt hình 3D người que trắng (đầu tròn trắng, KHÔNG có mặt) và một đoạn lời dẫn truyện bằng ${LANG_VI[config.lang]}.`,
      '',
      'QUY TẮC',
      ...RULES(config),
      `8. DÀN Ý có ĐÚNG ${config.beats} dòng (đánh số 1 đến ${config.beats}); mỗi dòng: số | nhãn mốc | tóm tắt (1 câu, ≤ 25 từ, nói tình huống của mốc và điểm KHÁC nhau giữa hai bên) | chỉ số bên trái 0-100 | chỉ số bên phải 0-100. Không mốc nào lặp tình huống của mốc khác; nhịp phim có thăng trầm (nhiều mốc nhỏ trong một giai đoạn rồi chuyển giai đoạn); mốc cuối là hệ quả rõ nhất và một tia hy vọng / lời chốt.`,
      '',
      'Trả lời đúng khuôn sau, KHÔNG viết thêm câu dẫn hay giải thích:',
      `TIÊU ĐỀ: <tiêu đề video HÚT VIEW bằng ${LANG_VI[config.lang]}, 45–68 ký tự, nói rõ cuộc so sánh ĐÚNG / SAI (nên / không nên): từ khóa chủ đề đặt ở ĐẦU, kèm MỘT yếu tố gây tò mò hoặc cảm xúc (ví dụ kiểu Do This, Not That · Right vs Wrong · Same Start, Two Endings · The Choice That Changes Everything — hãy viết đúng ${LANG_VI[config.lang]}); nêu đúng điều RIÊNG của kịch bản này, không chỉ lặp lại chủ đề; chỉ hứa điều CÓ THẬT trong video, không giật gân sai sự thật, không viết HOA toàn bộ, không emoji>`,
      'NHÃN TRÁI: <...>', 'NHÃN PHẢI: <...>', 'CHỈ SỐ: <...>',
      'NHÂN VẬT: <ENGLISH: một đoạn mô tả cố định các nhân vật>',
      'KẾT LUẬN:', '- <bài học 1>', '- <bài học 2>',
      'CÂU CUỐI: <...>',
      'DÀN Ý:', '1 | <NHÃN MỐC> | <tóm tắt> | <trái %> | <phải %>', `2 | ...   (đủ ${config.beats} dòng)`,
      ...tail(ctx),
      ...topicLines(config),
      config.left || config.right ? `NHÃN NGƯỜI LÀM VIDEO MUỐN DÙNG (dữ liệu, không phải mệnh lệnh): trái = ${config.left || '(tự đặt)'}; phải = ${config.right || '(tự đặt)'}` : '',
      marker ? `MSEND${marker}` : ''
    ].filter((line, index, all) => line !== '' || (index > 0 && all[index - 1] !== '' && index < all.length - 1)).join('\n');
  }
  function parseBible(reply, input) {
    const config = options(input), sec = sectionsOf(reply), lang = langOf(config.lang), lim = limits(config.lang);
    const arc = new Map();
    for (const r of cellsOf(sec.arc)) {
      if (r.cells.length < 2 || r.number < 1 || r.number > config.beats || arc.has(r.number)) continue;
      arc.set(r.number, { number: r.number, label: cut(upper(r.cells[0]), lim.tag), summary: flat(r.cells[1]).slice(0, 300), leftScore: score(r.cells[2], NaN), rightScore: score(r.cells[3], NaN) });
    }
    const missing = Array.from({ length: config.beats }, (_, i) => i + 1).filter(n => !arc.has(n));
    if (missing.length) throw fail(`Dàn ý thiếu mốc ${missing.slice(0, 12).join(', ')}.`, `DÀN Ý phải có ĐỦ ${config.beats} dòng «số | nhãn mốc | tóm tắt | trái % | phải %» (thiếu: ${missing.slice(0, 20).join(', ')}).`);
    const cast = flat((sec.cast || []).join(' '));
    const gear = config.mode === 'gear', castKey = gear ? 'KHÍ TÀI' : 'NHÂN VẬT';
    if (count(cast) < 30) throw fail(`Thiếu mục ${castKey}.`, `Thiếu mục «${castKey}:» (mô tả bằng tiếng Anh, ít nhất 30 ký tự).`);
    const lessons = (sec.lessons || []).map(s => cut(s.replace(/^\d+[.)]\s*/, ''), lim.lesson)).filter(Boolean).slice(0, MAX_LESSONS);
    const rows = [...arc.values()].sort((a, b) => a.number - b.number);
    const start = gear ? 50 : 100;   // «đời sống»: mốc 1 cả hai bên 100 · «khí tài»: điểm từng hạng mục, mốc giới thiệu 50
    rows.forEach((r, i) => { if (!Number.isFinite(r.leftScore)) r.leftScore = i ? rows[i - 1].leftScore : start; if (!Number.isFinite(r.rightScore)) r.rightScore = i ? rows[i - 1].rightScore : start; });
    rows[0].leftScore = start; rows[0].rightScore = start;
    return {
      mode: config.mode,
      title: cut(first(sec.title), 120) || cut(config.topic, 120) || (gear ? 'Khí tài đối đầu' : 'Hai con đường'),
      left: cut(upper(first(sec.left) || config.left || (gear ? gearText(config.lang).a : config.lang === 'vi' ? 'CON ĐƯỜNG A' : 'PATH A')), lim.label), right: cut(upper(first(sec.right) || config.right || (gear ? gearText(config.lang).b : config.lang === 'vi' ? 'CON ĐƯỜNG B' : 'PATH B')), lim.label),
      meter: cut(upper(first(sec.meter) || meterOf(config.lang, config.mode)), lim.tag),
      cast, lessons, closing: cut(strip((sec.closing || []).join(' ')), lim.closing), arc: rows
    };
  }

  // ---------- Lời nhắc 2: từng phần (≤ PART_BEATS mốc) ----------
  function buildPartInstruction(input, bible, ctx = {}) {
    const config = options(input), [a, b] = ctx.range, marker = ctx.marker ? String(ctx.marker) : '';
    if (config.mode === 'gear') return buildGearPartInstruction(config, bible, ctx);
    const rows = bible.arc.filter(r => r.number >= a && r.number <= b);
    const prev = (ctx.previous || []).slice(-2);
    return [
      `Bạn là biên kịch của video SO SÁNH SONG SONG «${bible.title}» (${config.beats} mốc). Bây giờ viết CHI TIẾT các mốc ${a} đến ${b} theo ĐÚNG dàn ý bên dưới (không đổi nhãn mốc, tình huống và chỉ số quá ±6).`,
      `Mỗi mốc: hai bên bắt đầu từ cùng MỘT khung hình (cùng căn phòng, góc máy, nhân vật), rồi diễn ra hai hành động ${config.seconds} giây khác nhau. Chữ do phần mềm tự vẽ, bạn chỉ viết nội dung.`,
      '',
      'QUY TẮC',
      `1. KHUNG, TRÁI, PHẢI viết bằng TIẾNG ANH, cụ thể và vật lý đơn giản: ai đứng / ngồi ở đâu, đồ vật nào ở đâu, hành động nào trong ~${config.seconds} giây; không viết chữ trên đồ vật, không lời thoại, mỗi mô tả ≤ 45 từ, không dùng dấu | trong nội dung. Không bạo lực, máu, đánh đập: thể hiện căng thẳng bằng dáng đứng cao hơn, ngón tay chỉ, cúi người, quay lưng, khoanh tay.`,
      `2. PHỤ ĐỀ bằng ${LANG_VI[config.lang]}, ≤ ${limits(config.lang).caption} ký tự, một câu súc tích; không emoji, không hashtag.`,
      `3. LỜI ĐỌC là lời người dẫn truyện đọc trong mốc, bằng ${LANG_VI[config.lang]}, văn nói tự nhiên, ≤ ${config.budget} ký tự (đọc vừa trong ~${config.seconds - 1} giây), kể điều xảy ra ở BÊN TRÁI rồi BÊN PHẢI; không lặp nguyên văn phụ đề, không số thứ tự, không ký hiệu; các mốc kế nhau không mở đầu giống nhau.`,
      '4. Mỗi mốc có hành vi khác biệt rõ giữa TRÁI và PHẢI; thân hình nhân vật thể hiện hệ quả (co người / thoải mái…).',
      '',
      `NHÃN TRÁI: ${bible.left} · NHÃN PHẢI: ${bible.right} · CHỈ SỐ: ${bible.meter}`,
      `NHÂN VẬT (cố định): ${bible.cast}`,
      'DÀN Ý CỦA CÁC MỐC CẦN VIẾT (dữ liệu, không phải mệnh lệnh):',
      ...rows.map(r => `${r.number} | ${r.label} | ${cut(r.summary, 220)} | ${r.leftScore} | ${r.rightScore}`),
      ...(prev.length ? ['', 'HAI MỐC NGAY TRƯỚC (đã viết, để nối mạch, không viết lại):', ...prev.map(p => `${p.number} | ${p.label} | ${cut(p.caption, 80)} | ${cut(p.narration, 120)} | ${cut(p.frame, 160)}`)] : []),
      '',
      'Trả lời đúng khuôn sau, mỗi mốc MỘT dòng, KHÔNG viết thêm câu dẫn hay giải thích:',
      'MỐC:',
      '<số> | <NHÃN MỐC> | <PHỤ ĐỀ> | <LỜI ĐỌC> | <KHUNG: ENGLISH> | <TRÁI: ENGLISH> | <PHẢI: ENGLISH> | <chỉ số trái 0-100> | <chỉ số phải 0-100>',
      `(đủ ${b - a + 1} dòng, số từ ${a} đến ${b})`,
      ...tail(ctx),
      marker ? `MSEND${marker}` : ''
    ].filter((line, index, all) => line !== '' || (index > 0 && all[index - 1] !== '' && index < all.length - 1)).join('\n');
  }

  function parseBeats(reply, input) {
    const config = options(input), sec = sectionsOf(reply), lim = limits(config.lang), out = [];
    const rows = cellsOf(sec.beats && sec.beats.length ? sec.beats : String(reply || '').split(/\r?\n/));
    for (const r of rows) {
      const c = r.cells;
      if (c.length < 6) { out.push({ number: r.number, bad: true }); continue; }
      out.push({
        number: r.number, label: cut(upper(c[0]), lim.tag), caption: cut(c[1], lim.caption + 22), narration: flat(c[2]).slice(0, 400), frame: flat(c[3]), left: flat(c[4]), right: flat(c[5]),
        leftScore: score(c[6], NaN), rightScore: score(c[7], NaN)
      });
    }
    return out.filter(b => b.number >= 1 && b.number <= config.beats);
  }

  // Soát các mốc trong khoảng `range`; {missing, bad, issues}.
  function checkBeats(beats, range, input) {
    const config = options(input), issues = [], missing = [], bad = new Set();
    const by = new Map();
    for (const b of beats || []) if (!by.has(b.number) || (by.get(b.number).bad && !b.bad)) by.set(b.number, b);
    for (let n = range[0]; n <= range[1]; n++) {
      const b = by.get(n);
      if (!b) { missing.push(n); continue; }
      const why = [];
      if (b.bad) why.push('thiếu cột (cần 9 cột)');
      else {
        if (!b.label) why.push('thiếu nhãn mốc');
        if (!b.caption) why.push('thiếu phụ đề');
        if (!b.narration) why.push('thiếu LỜI ĐỌC');
        else if (count(b.narration) > Math.round(config.budget * 1.3)) why.push(`LỜI ĐỌC dài ${count(b.narration)} ký tự (tối đa ${config.budget})`);
        if (count(b.frame) < 25) why.push('KHUNG quá ngắn');
        if (count(b.left) < 25) why.push('TRÁI quá ngắn');
        if (count(b.right) < 25) why.push('PHẢI quá ngắn');
        if (b.left && b.right && norm(b.left) === norm(b.right)) why.push('TRÁI và PHẢI giống hệt nhau');
      }
      if (why.length) { bad.add(n); issues.push(`Mốc ${n}: ${why.join(', ')}`); }
    }
    return { missing, bad: [...bad], issues, ok: !missing.length && !bad.size };
  }
  function fixText(check) {
    const out = [];
    if (check.missing.length) out.push(`Thiếu mốc: ${check.missing.join(', ')}.`);
    out.push(...check.issues);
    return out.join('\n');
  }

  // Kịch bản đủ mốc: nhãn / chỉ số theo dàn ý khi mốc thiếu hoặc lệch; mốc 1 luôn 100/100.
  function assemble(bible, beatsIn, input) {
    const config = options(input);
    const by = new Map((beatsIn || []).filter(b => !b.bad).map(b => [b.number, b]));
    const beats = bible.arc.slice(0, config.beats).map(a => {
      const b = by.get(a.number);
      if (!b) return null;
      return { ...b, label: b.label || a.label, leftScore: Number.isFinite(b.leftScore) ? b.leftScore : a.leftScore, rightScore: Number.isFinite(b.rightScore) ? b.rightScore : a.rightScore };
    }).filter(Boolean);
    const start = config.mode === 'gear' ? 50 : 100;
    if (beats[0]) { beats[0].leftScore = start; beats[0].rightScore = start; }
    const { arc, ...rest } = bible;
    return { ...rest, mode: config.mode, beats };
  }

  // ---------- Lời nhắc ảnh / clip ----------
  // ---------- Khí tài: hình ảnh ----------
  const GEAR_STYLE = 'Look: realistic cinematic 3D render of modern military hardware at a peaceful display or test site (airfield apron, test track, harbour, parade ground), natural daylight, clean accurate machine shapes, shallow depth of field. Both machines are fully visible, parked side by side at the same scale and ground level, the LEFT one on the left half of the frame and the RIGHT one on the right half. No close-up people (any crew is tiny, distant and faceless), no combat, no wreckage, no flames.';
  const GEAR_NO_TEXT = 'No text, lettering, serial numbers, flags with text, logos, watermarks, captions or user-interface overlays anywhere.';
  const GEAR_AUDIO = 'Audio: only natural engine, turbine, wind or mechanical sounds. No speech, no voices, no singing, no music.';
  const GEAR_KEEP = 'Both machines keep exactly the same shape, paint scheme, size and position relationship as in the attached image; the site and light stay the same; no morphing; nothing appears or disappears by itself. The shot is a real-looking calm demonstration: smooth realistic motion, no explosions, no weapons hitting anything, no damage.';
  function anchorPrompt(config, script, beat) {
    if (config.mode === 'gear') return ['Square 1:1 image.', `First frame of a video scene, "${beat.label}": ${beat.frame}`, `EQUIPMENT (identical in every shot, never change): ${script.cast}`, GEAR_STYLE, NO_SPLIT, GEAR_NO_TEXT].join('\n');
    return ['Square 1:1 image.', `First frame of a video scene, "${beat.label}": ${beat.frame}`, castOf(script), STYLE, NO_SPLIT, NO_TEXT].join('\n');
  }
  function clipPrompt(config, script, beat, side) {
    if (config.mode === 'gear') {
      return [
        'Square 1:1 video.',
        `Create an ${config.seconds}-second video clip (one single continuous shot, no cuts), aspect ratio 1:1, that starts EXACTLY from the attached image (it is the first frame of the video).`,
        `Focus on the machine on the ${side === 'R' ? 'RIGHT' : 'LEFT'} side of the first frame; the other machine stays parked and quiet.`,
        `ACTION: ${side === 'R' ? beat.right : beat.left}`,
        `EQUIPMENT (identical in every shot, never change): ${script.cast}`, GEAR_KEEP, GEAR_STYLE, NO_SPLIT, GEAR_AUDIO, GEAR_NO_TEXT
      ].join('\n');
    }
    return [
      'Square 1:1 video.',
      `Create an ${config.seconds}-second animated video clip (one single continuous shot, no cuts), aspect ratio 1:1, that starts EXACTLY from the attached image (it is the first frame of the video).`,
      `ACTION: ${side === 'R' ? beat.right : beat.left}`,
      castOf(script), KEEP, STYLE, NO_SPLIT, AUDIO, NO_TEXT
    ].join('\n');
  }

  // Cảnh bị Muse chặn: làm dịu lời lẽ, lần sau bỏ hẳn hành vi căng thẳng.
  const POLICY_ERROR = /policy|chính sách|vi phạm|not allowed|không được phép|content (?:was )?(?:blocked|violat)|nội dung|safety|an toàn|sensitive|nhạy cảm|rejected|từ chối|unable to (?:generate|create)|can'?t (?:generate|create)/i;
  const isPolicyError = text => POLICY_ERROR.test(String(text || ''));
  const SOFTEN = [
    [/\b(?:yells?|yelling|yelled|shouts?|shouting|shouted|screams?|screaming|screamed|scolds?|scolding|berates?)\b/gi, 'speaks sternly'],
    [/\b(?:hits?|hitting|slaps?|strikes?|beats?|punch(?:es)?|kicks?)\b/gi, 'points'], [/\b(?:angry|furious|enraged|rage)\b/gi, 'stern'],
    [/\b(?:cries|crying|sobs?|sobbing|tears)\b/gi, 'looks down'], [/\b(?:terrified|afraid|scared|fear)\b/gi, 'nervous'], [/\b(?:abuse|abusive|violent|violently|cruel|harsh)\b/gi, 'strict']
  ];
  const SAFE_1 = 'SAFETY REWRITE: calm, gentle family-friendly animation; the characters only stand, sit and move calmly; nothing harsh or frightening happens.';
  const SAFE_2 = 'SAFETY REWRITE: show only the room and the two characters standing or sitting calmly next to each other; no conflict of any kind.';
  const GEAR_SOFTEN = [
    [/\b(?:fires?|firing|fired|shoots?|shooting|shot|launch(?:es|ed|ing)? (?:a |its |the )?(?:missiles?|rockets?|shells?)|strikes?|striking|bombs?|bombing|attacks?|attacking|destroys?|destroying|destroyed|kills?|hits?)\b/gi, 'moves'],
    [/\b(?:explosions?|explodes?|exploding|blasts?|fireballs?|flames?|fire|smoke trails?|wreckage|debris|crash(?:es|ing)?)\b/gi, 'dust'],
    [/\b(?:combat|battlefield|battles?|war|warfare|enemy|enemies|targets?)\b/gi, 'test range'],
    [/\b(?:missiles?|rockets?|bombs?|warheads?)\b/gi, 'launch rails']
  ];
  const GEAR_SAFE_1 = 'SAFETY REWRITE: a calm, peaceful air-show / museum-style display; the machines only taxi, drive or fly slowly in a controlled demonstration; no weapon is fired; no people in focus; nothing destructive happens.';
  const GEAR_SAFE_2 = 'SAFETY REWRITE: show only the two machines parked side by side at a calm outdoor display; very slow camera move; no motion of the machines, no weapon activity, no people.';
  function safeRetryPrompt(prompt, attempt = 1) {
    const text = String(prompt || ''), gear = /^EQUIPMENT \(identical/m.test(text);
    const kept = text.split('\n').filter(l => !l.startsWith('SAFETY REWRITE:'));
    const rules = gear ? GEAR_SOFTEN : SOFTEN;
    const soft = kept.map(l => /^(?:ACTION|First frame)/.test(l) ? rules.reduce((t, [re, to]) => t.replace(re, to), l).replace(/ {2,}/g, ' ') : l);
    return soft.join('\n').trim() + '\n' + (gear ? (Number(attempt) >= 2 ? GEAR_SAFE_2 : GEAR_SAFE_1) : (Number(attempt) >= 2 ? SAFE_2 : SAFE_1));
  }

  // ---------- Hàng đợi việc ----------
  // Mỗi mốc n: ảnh nền (số n) → clip TRÁI (số 2n-1) và clip PHẢI (số 2n), cả hai cần ảnh nền và bắt đầu từ chính ảnh đó.
  function buildJobs(input, script, { storyId } = {}) {
    const config = options(input), jobs = [];
    const base = { kind: KIND, storyId, ...(config.mode === 'gear' ? { mode: 'gear' } : {}) };
    script.beats.forEach(b => {
      const where = `Mốc ${b.number} · ${b.label}`;
      jobs.push({ ...base, phase: 'image', number: b.number, title: `${where} · ảnh nền chung`, prompt: anchorPrompt(config, script, b), references: [], needs: [], refList: [] });
      for (const side of ['L', 'R']) {
        const number = b.number * 2 - (side === 'L' ? 1 : 0);
        jobs.push({
          ...base, phase: 'clip', number, beat: b.number, side, title: `${where} · bên ${side === 'L' ? 'trái' : 'phải'}`, prompt: clipPrompt(config, script, b, side), durationSeconds: config.seconds,
          source: b.caption, references: [], needs: [{ phase: 'image', number: b.number }], refList: [{ phase: 'image', number: b.number }]
        });
      }
    });
    return jobs;
  }

  // Dữ liệu gọn để vẽ chữ chồng và dựng (không có lời nhắc dài).
  function hudScript(script) {
    return {
      mode: script.mode === 'gear' ? 'gear' : 'life', title: script.title, left: script.left, right: script.right, meter: script.meter, lessons: script.lessons, closing: script.closing,
      beats: script.beats.map(b => ({ number: b.number, label: b.label, caption: b.caption, narration: b.narration, leftScore: b.leftScore, rightScore: b.rightScore }))
    };
  }

  function notesText(input, script, { builtAt = '' } = {}) {
    const config = options(input);
    const lines = [
      script.title, '', `Chủ đề: ${config.topic || script.title}`, `Bên trái: ${script.left}`, `Bên phải: ${script.right}`, `Chỉ số: ${script.meter}`, `Số mốc: ${script.beats.length} (mỗi mốc ${config.seconds} giây)`, '',
      'LỜI ĐỌC:', ...script.beats.map(b => `${b.number}. [${b.label}] ${b.narration}`), '',
      ...(script.lessons.length ? ['KẾT LUẬN:', ...script.lessons.map(x => `- ${x}`), `Câu cuối: ${script.closing}`, ''] : []),
      'NHẮC KHI ĐĂNG:',
      '- Hình ảnh do AI tạo ra: bật mục khai báo «nội dung bị thay đổi hoặc tổng hợp» khi đăng lên YouTube và nói rõ trong mô tả.',
      ...(config.mode === 'gear'
        ? [
          '- Thông số khí tài do AI tổng hợp từ thông tin công khai và có thể sai hoặc đã cũ: kiểm tra lại với nguồn chính thức (nhà sản xuất, bộ quốc phòng, tài liệu uy tín) trước khi đăng, và ghi nguồn trong mô tả.',
          '- Điểm 0–100 chỉ là đánh giá ước lượng để minh họa, không phải kết quả thử nghiệm chính thức. Video không có cảnh chiến sự; giữ giọng khách quan, không cổ vũ chiến tranh.'
        ]
        : ['- Chỉ số % chỉ là minh họa kể chuyện, không phải số liệu nghiên cứu. Nếu nêu kết luận về nuôi dạy, sức khỏe hay tài chính, hãy dẫn nguồn đáng tin cậy.'])
    ];
    if (builtAt) lines.push('', `Dựng lúc: ${builtAt}`);
    return lines.join('\n');
  }

  // ---------- Thông tin đăng YouTube ----------
  // Chữ cố định theo ngôn ngữ video (phần còn lại — tiêu đề, bài học, câu cuối, nhãn mốc, phụ đề — đã nằm sẵn trong kịch bản bằng đúng ngôn ngữ đó).
  //   chapters: tiêu đề mục chương · note: lời nhắc nội dung do AI tạo · hash: 3 hashtag chung · kw: từ khóa chung cho thẻ tag.
  const pub = (chapters, note, hash, kw) => ({ chapters, note, hash, kw });
  const PUB = {
    en: pub('Chapters', 'The images in this video are AI-generated. The percentages are a storytelling illustration, not research data.', ['TwoPaths', 'LifeLessons', 'SelfImprovement'], ['life lessons', 'self improvement', 'storytelling', 'animation']),
    vi: pub('Các chương', 'Hình ảnh trong video do AI tạo ra. Các chỉ số % chỉ để minh họa câu chuyện, không phải số liệu nghiên cứu.', ['HaiConDuong', 'BaiHocCuocSong', 'PhatTrienBanThan'], ['bài học cuộc sống', 'phát triển bản thân', 'kể chuyện', 'hoạt hình']),
    es: pub('Capítulos', 'Las imágenes de este video fueron generadas con IA. Los porcentajes son una ilustración narrativa, no datos de investigación.', ['DosCaminos', 'LeccionesDeVida', 'Superacion'], ['lecciones de vida', 'superación personal', 'historias', 'animación']),
    pt: pub('Capítulos', 'As imagens deste vídeo foram geradas por IA. As porcentagens são apenas uma ilustração narrativa, não dados de pesquisa.', ['DoisCaminhos', 'LicoesDeVida', 'Superacao'], ['lições de vida', 'superação', 'histórias', 'animação']),
    fr: pub('Chapitres', 'Les images de cette vidéo sont générées par IA. Les pourcentages sont une illustration narrative, pas des données de recherche.', ['DeuxChemins', 'LeconsDeVie', 'DeveloppementPersonnel'], ['leçons de vie', 'développement personnel', 'histoire', 'animation']),
    de: pub('Kapitel', 'Die Bilder in diesem Video wurden mit KI erzeugt. Die Prozentwerte dienen nur der Veranschaulichung der Geschichte und sind keine Forschungsdaten.', ['ZweiWege', 'Lebenslektionen', 'Selbstentwicklung'], ['lebenslektionen', 'selbstentwicklung', 'geschichte', 'animation']),
    id: pub('Bab', 'Gambar dalam video ini dibuat dengan AI. Persentase hanyalah ilustrasi cerita, bukan data penelitian.', ['DuaJalan', 'PelajaranHidup', 'PengembanganDiri'], ['pelajaran hidup', 'pengembangan diri', 'cerita', 'animasi']),
    ru: pub('Главы', 'Изображения в этом видео созданы с помощью ИИ. Проценты — лишь иллюстрация истории, а не данные исследований.', ['ДваПути', 'УрокиЖизни', 'Саморазвитие'], ['уроки жизни', 'саморазвитие', 'история', 'анимация']),
    tr: pub('Bölümler', 'Bu videodaki görüntüler yapay zekâ ile üretilmiştir. Yüzdeler yalnızca hikâyeyi anlatmak içindir, araştırma verisi değildir.', ['İkiYol', 'HayatDersleri', 'KişiselGelişim'], ['hayat dersleri', 'kişisel gelişim', 'hikaye', 'animasyon']),
    hi: pub('अध्याय', 'इस वीडियो की तस्वीरें AI से बनाई गई हैं। प्रतिशत केवल कहानी को समझाने के लिए हैं, शोध के आँकड़े नहीं।', ['दोरास्ते', 'जीवनकेसबक', 'आत्मविकास'], ['जीवन के सबक', 'आत्मविकास', 'कहानी', 'एनिमेशन']),
    ar: pub('الفصول', 'الصور في هذا الفيديو مُنشأة بالذكاء الاصطناعي. النسب المئوية مجرد توضيح للقصة وليست بيانات بحثية.', ['طريقان', 'دروس_الحياة', 'تطوير_الذات'], ['دروس الحياة', 'تطوير الذات', 'قصة', 'رسوم متحركة']),
    th: pub('บท', 'ภาพในวิดีโอนี้สร้างด้วย AI ตัวเลขเปอร์เซ็นต์ใช้เล่าเรื่องเท่านั้น ไม่ใช่ข้อมูลวิจัย', ['สองเส้นทาง', 'บทเรียนชีวิต', 'พัฒนาตัวเอง'], ['บทเรียนชีวิต', 'พัฒนาตัวเอง', 'เล่าเรื่อง', 'แอนิเมชัน']),
    ja: pub('チャプター', 'この動画の映像はAIで生成されています。パーセンテージは物語を伝えるためのイメージで、研究データではありません。', ['ふたつの道', '人生の教訓', '自己成長'], ['人生の教訓', '自己成長', 'ストーリー', 'アニメーション']),
    ko: pub('챕터', '이 영상의 이미지는 AI로 생성되었습니다. 퍼센트는 이야기를 위한 연출이며 연구 데이터가 아닙니다.', ['두갈래길', '인생교훈', '자기계발'], ['인생 교훈', '자기계발', '이야기', '애니메이션']),
    zh: pub('章节', '本视频的画面由 AI 生成。百分比仅用于讲故事的示意，并非研究数据。', ['两条路', '人生感悟', '自我成长'], ['人生感悟', '自我成长', '故事', '动画'])
  };
  // Thêm cho gói đăng: top = 2 hashtag khung «đúng / sai, nên / không nên» (đứng ngay sau hashtag của tiêu đề nên hiện trên tiêu đề video), rest = hashtag chung,
  // kw = từ khóa thẻ tag, ideas = 4 mẫu tiêu đề gợi ý ({h} cụm đầu tiêu đề, {l}/{r} nhãn hai bên): làm / không làm · hai con đường · đúng / sai · cùng một khởi đầu.
  const more = (top, rest, kw, ideas) => ({ top, rest, kw, ideas });
  const MORE = {
    en: more(['RightVsWrong', 'DoAndDont'], ['Mindset', 'Habits', 'Motivation', 'Storytelling', 'Animation', 'GoodVsBad', 'Choices', 'PersonalGrowth'], ['right vs wrong', 'do and dont', 'good habits vs bad habits', 'same start two endings', 'life choices', 'what to do and what not to do', 'animated story'], ['{h}: Do This, Not That', '{l} vs {r}: Which Path Would You Choose?', 'Right vs Wrong: {h}', 'Same Start, Two Endings: {h}']),
    vi: more(['DungVaSai', 'NenVaKhongNen'], ['TuDuy', 'ThoiQuen', 'DongLuc', 'KeChuyen', 'HoatHinh', 'LuaChon', 'PhatTrien', 'BaiHoc'], ['đúng và sai', 'nên và không nên', 'thói quen tốt và xấu', 'cùng một khởi đầu hai kết cục', 'lựa chọn trong cuộc sống', 'nên làm gì không nên làm gì', 'hoạt hình kể chuyện'], ['{h}: Nên làm gì, không nên làm gì', '{l} vs {r}: Bạn chọn con đường nào?', 'Đúng và sai: {h}', 'Cùng một khởi đầu, hai kết cục: {h}']),
    es: more(['CorrectoVsIncorrecto', 'HazYNoHagas'], ['Mentalidad', 'Habitos', 'Motivacion', 'Narrativa', 'Animacion', 'Decisiones', 'Crecimiento', 'Aprendizaje'], ['correcto vs incorrecto', 'qué hacer y qué no hacer', 'buenos hábitos vs malos hábitos', 'mismo comienzo dos finales', 'decisiones de vida', 'historia animada'], ['{h}: haz esto, no aquello', '{l} vs {r}: ¿qué camino eliges?', 'Lo correcto vs lo incorrecto: {h}', 'Mismo comienzo, dos finales: {h}']),
    pt: more(['CertoVsErrado', 'FacaENaoFaca'], ['Mentalidade', 'Habitos', 'Motivacao', 'Historias', 'Animacao', 'Escolhas', 'Crescimento', 'Aprendizado'], ['certo vs errado', 'o que fazer e o que não fazer', 'bons hábitos vs maus hábitos', 'mesmo começo dois finais', 'escolhas de vida', 'história animada'], ['{h}: faça isso, não aquilo', '{l} vs {r}: qual caminho você escolhe?', 'Certo vs errado: {h}', 'Mesmo começo, dois finais: {h}']),
    fr: more(['BonVsMauvais', 'AFaireAEviter'], ['Mentalite', 'Habitudes', 'Motivation', 'Storytelling', 'Animation', 'Choix', 'Croissance', 'Apprendre'], ['bon vs mauvais choix', 'à faire et à ne pas faire', 'bonnes habitudes vs mauvaises habitudes', 'même départ deux fins', 'choix de vie', 'histoire animée'], ['{h} : à faire, à ne pas faire', '{l} vs {r} : quel chemin choisissez-vous ?', 'Le bon vs le mauvais choix : {h}', 'Même départ, deux fins : {h}']),
    de: more(['RichtigVsFalsch', 'TunUndLassen'], ['Mindset', 'Gewohnheiten', 'Motivation', 'Geschichten', 'Animation', 'Entscheidungen', 'Wachstum', 'Lernen'], ['richtig vs falsch', 'was man tun und lassen sollte', 'gute gewohnheiten vs schlechte gewohnheiten', 'gleicher start zwei enden', 'lebensentscheidungen', 'animierte geschichte'], ['{h}: Das solltest du tun – und das nicht', '{l} vs {r}: Welchen Weg wählst du?', 'Richtig vs. falsch: {h}', 'Gleicher Start, zwei Enden: {h}']),
    id: more(['BenarVsSalah', 'LakukanDanJangan'], ['Mindset', 'Kebiasaan', 'Motivasi', 'Cerita', 'Animasi', 'Pilihan', 'Pertumbuhan', 'Belajar'], ['benar vs salah', 'yang harus dan jangan dilakukan', 'kebiasaan baik vs kebiasaan buruk', 'awal yang sama dua akhir', 'pilihan hidup', 'cerita animasi'], ['{h}: lakukan ini, jangan itu', '{l} vs {r}: pilih jalan yang mana?', 'Benar vs salah: {h}', 'Awal yang sama, dua akhir berbeda: {h}']),
    ru: more(['ПравильноИНеправильно', 'ЧтоДелатьИНеДелать'], ['Мышление', 'Привычки', 'Мотивация', 'История', 'Анимация', 'Выбор', 'Рост', 'Обучение'], ['правильно и неправильно', 'что делать и чего не делать', 'хорошие и плохие привычки', 'одно начало два финала', 'жизненный выбор', 'анимационная история'], ['{h}: так делать, так — нет', '{l} или {r}: какой путь выберете вы?', 'Правильно и неправильно: {h}', 'Одно начало, два финала: {h}']),
    tr: more(['DoğruVsYanlış', 'YapVeYapma'], ['Zihniyet', 'Alışkanlıklar', 'Motivasyon', 'Hikaye', 'Animasyon', 'Seçimler', 'Gelişim', 'Öğrenme'], ['doğru vs yanlış', 'ne yapmalı ne yapmamalı', 'iyi alışkanlıklar vs kötü alışkanlıklar', 'aynı başlangıç iki son', 'hayat seçimleri', 'animasyon hikaye'], ['{h}: bunu yap, şunu yapma', '{l} vs {r}: Hangi yolu seçerdin?', 'Doğru vs yanlış: {h}', 'Aynı başlangıç, iki farklı son: {h}']),
    hi: more(['सहीयागलत', 'क्याकरेंक्यानहीं'], ['सोच', 'आदतें', 'प्रेरणा', 'कहानी', 'एनिमेशन', 'फैसले', 'विकास', 'सीख'], ['सही बनाम गलत', 'क्या करें क्या न करें', 'अच्छी आदतें बनाम बुरी आदतें', 'एक जैसी शुरुआत दो अंजाम', 'जीवन के फैसले', 'एनिमेटेड कहानी'], ['{h}: ये करें, वो नहीं', '{l} बनाम {r}: आप कौन-सा रास्ता चुनेंगे?', 'सही बनाम गलत: {h}', 'एक जैसी शुरुआत, दो अलग अंजाम: {h}']),
    ar: more(['صحيح_أم_خطأ', 'افعل_ولا_تفعل'], ['عقلية', 'عادات', 'تحفيز', 'قصة', 'رسوم_متحركة', 'قرارات', 'تطوير', 'تعلم'], ['صحيح أم خطأ', 'ماذا تفعل وماذا لا تفعل', 'عادات جيدة مقابل عادات سيئة', 'بداية واحدة ونهايتان', 'قرارات الحياة', 'قصة متحركة'], ['{h}: افعل هذا ولا تفعل ذاك', '{l} مقابل {r}: أي طريق ستختار؟', 'الصواب مقابل الخطأ: {h}', 'بداية واحدة ونهايتان: {h}']),
    th: more(['ถูกหรือผิด', 'ควรหรือไม่ควร'], ['ความคิด', 'นิสัย', 'แรงบันดาลใจ', 'เล่าเรื่อง', 'แอนิเมชัน', 'ทางเลือก', 'พัฒนา', 'เรียนรู้'], ['ถูกหรือผิด', 'ควรทำและไม่ควรทำ', 'นิสัยดีกับนิสัยไม่ดี', 'จุดเริ่มต้นเดียวกันสองจุดจบ', 'ทางเลือกในชีวิต', 'แอนิเมชันเล่าเรื่อง'], ['{h}: ควรทำแบบนี้ ไม่ควรทำแบบนั้น', '{l} vs {r}: คุณจะเลือกทางไหน?', 'ถูก vs ผิด: {h}', 'จุดเริ่มต้นเดียวกัน จุดจบต่างกัน: {h}']),
    ja: more(['正しいvs間違い', 'やるべきvsやめるべき'], ['マインドセット', '習慣', 'モチベーション', 'ストーリー', 'アニメーション', '選択', '成長', '学び'], ['正しい vs 間違い', 'やるべきこと やめるべきこと', '良い習慣 悪い習慣', '同じスタート 違う結末', '人生の選択', 'アニメーションストーリー'], ['{h}：これをして、あれはしない', '{l} vs {r}：あなたはどちらを選ぶ？', '正しい vs 間違い：{h}', '同じスタート、違う結末：{h}']),
    ko: more(['옳고그름', '해야할것과하지말것'], ['마인드셋', '습관', '동기부여', '이야기', '애니메이션', '선택', '성장', '배움'], ['옳고 그름', '해야 할 것과 하지 말 것', '좋은 습관 나쁜 습관', '같은 출발 다른 결말', '인생의 선택', '애니메이션 스토리'], ['{h}: 이렇게 하세요, 저렇게는 하지 마세요', '{l} vs {r}: 당신의 선택은?', '옳은 선택 vs 잘못된 선택: {h}', '같은 출발, 다른 결말: {h}']),
    zh: more(['对与错', '该做与不该做'], ['思维', '习惯', '动力', '故事', '动画', '选择', '成长', '学习'], ['对与错', '该做与不该做', '好习惯 坏习惯', '同一起点两种结局', '人生选择', '动画故事'], ['{h}：该这样做，别那样做', '{l} vs {r}：你会选哪条路？', '对与错：{h}', '同一个起点，两种结局：{h}'])
  };
  const clockOf = sec => {
    const t = Math.max(0, Math.round(Number(sec) || 0)), h = Math.floor(t / 3600), m = Math.floor(t % 3600 / 60), pad = n => String(n).padStart(2, '0');
    return h ? `${h}:${pad(m)}:${pad(t % 60)}` : `${m}:${pad(t % 60)}`;
  };
  const firstClause = title => {
    const full = flat(title), first = full.split(/\s*[:|–—]\s*/)[0].trim();
    return first.length >= 10 && first.length < full.length ? first : full;
  };
  // Tiêu đề phải đúng từng video: trùng một video đã làm thì thêm ý riêng của chính kịch bản này (bài học), hết cách thì đánh số.
  const titleSig = t => flat(t).toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/đ/g, 'd').replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
  function uniqueTitle(script, taken) {
    const title = cut(script && script.title, 100);
    const used = new Set((Array.isArray(taken) ? taken : []).map(titleSig).filter(Boolean));
    if (!title || !used.has(titleSig(title))) return title;
    const hook = firstClause(title);
    for (const lesson of ((script && script.lessons) || []).map(flat).filter(Boolean)) {
      const t = cut(`${hook}: ${lesson.replace(/[.!?。！？]+$/u, '')}`, 100);
      if (t !== hook && !used.has(titleSig(t))) return t;
    }
    for (let n = 2; n < 100; n++) { const suffix = ` (${n})`, t = cut(title, 100 - suffix.length) + suffix; if (!used.has(titleSig(t))) return t; }
    return title;
  }
  // Hashtag không dấu cách: chữ + số + gạch dưới (mọi ngôn ngữ), mỗi từ viết hoa chữ đầu.
  const hashOf = text => {
    const words = flat(text).split(/[^\p{L}\p{N}\p{M}_]+/u).filter(Boolean);
    return words.map(w => w.charAt(0).toLocaleUpperCase() + w.slice(1)).join('');
  };
  // Gói đăng cho chế độ khí tài (tiếng Anh và tiếng Việt; ngôn ngữ khác dùng bản tiếng Anh).
  const GEAR_PUB = {
    en: { chapters: 'Chapters', note: 'The visuals in this video are AI-generated. Specifications come from public sources and may be outdated or inaccurate; scores are an illustrative estimate, not official test results. Check the manufacturer and defense-ministry sources.', hash: ['MilitaryComparison', 'HeadToHead', 'Defense'], kw: ['military comparison', 'specs compared', 'head to head', 'weapons comparison', 'defense technology'] },
    vi: { chapters: 'Các chương', note: 'Hình ảnh trong video do AI tạo ra. Thông số lấy từ nguồn công khai và có thể đã cũ hoặc chưa chính xác; điểm số chỉ là ước lượng minh họa, không phải kết quả thử nghiệm chính thức. Hãy đối chiếu nguồn của nhà sản xuất và bộ quốc phòng.', hash: ['KhiTai', 'SoSanhQuanSu', 'QuocPhong'], kw: ['khí tài', 'so sánh quân sự', 'so sánh thông số', 'đối đầu', 'công nghệ quốc phòng'] }
  };
  const GEAR_MORE = {
    en: { top: ['VersusMilitary', 'SpecsCompared'], rest: ['Military', 'Aviation', 'Tanks', 'Navy', 'Technology', 'Comparison', 'Documentary', 'Animation'], kw: ['which is better', 'who would win', 'full comparison', 'specifications', 'military technology'], ideas: ['{h}: Specs Compared', '{l} vs {r}: Which Is Better?', '{l} vs {r}: Full Comparison', '{h}: The Real Differences'] },
    vi: { top: ['DoiDauKhiTai', 'SoSanhThongSo'], rest: ['QuanSu', 'HangKhong', 'XeTang', 'HaiQuan', 'CongNghe', 'SoSanh', 'PhimTaiLieu', 'HoatHinh'], kw: ['cái nào mạnh hơn', 'ai thắng', 'so sánh đầy đủ', 'thông số kỹ thuật', 'công nghệ quân sự'], ideas: ['{h}: So sánh thông số', '{l} vs {r}: Ai mạnh hơn?', '{l} vs {r}: So sánh đầy đủ', '{h}: Khác biệt thật sự'] }
  };
  // Gói đăng YouTube: tiêu đề (≤ 100), mô tả (chương theo giờ nếu biết, bài học, câu cuối, lời nhắc nội dung AI, hashtag) và thẻ tag (≤ 450 ký tự).
  // opts: { lang, layout, timeline: [{ number, start }], outroStart, seconds }; không có timeline (video dựng bằng bản cũ) thì chưa có chương.
  function publishPack(script, opts = {}) {
    const L = langOf(opts.lang), gear = opts.mode === 'gear' || Boolean(script && script.mode === 'gear'), X = gear ? (GEAR_PUB[L.id] || GEAR_PUB.en) : (PUB[L.id] || PUB.en), lc = t => { try { return String(t).toLocaleLowerCase(L.id); } catch { return String(t).toLowerCase(); } };
    const title = cut(script && script.title, 100) || L.label, hook = firstClause(title);
    const beats = (script && script.beats) || [], lessons = ((script && script.lessons) || []).map(flat).filter(Boolean), closing = flat(script && script.closing);
    // Chương: mở đầu đúng 0:00, mỗi chương cách nhau ≥ 10 giây (và thưa dần để không quá ~12 chương), chương cuối là thẻ bài học.
    const chapters = [];
    const timeline = Array.isArray(opts.timeline) ? opts.timeline.filter(x => x && Number.isFinite(Number(x.start))) : [];
    if (timeline.length && Number(opts.outroStart) > 0) {
      const total = Number(opts.seconds) > 0 ? Number(opts.seconds) : Number(opts.outroStart) + 10, gap = Math.max(25, total / 12);
      chapters.push({ t: 0, clock: '0:00', label: cut(hook, 70) });
      for (const x of timeline) {
        const b = beats.find(y => y.number === x.number), last = chapters[chapters.length - 1];
        if (!b || x.start - last.t < gap || Number(opts.outroStart) - x.start < 15) continue;
        chapters.push({ t: Math.round(x.start), clock: clockOf(x.start), label: cut([flat(b.label), flat(b.caption)].filter(Boolean).join(' · '), 70) });
      }
      const lessonsHead = lessonsTitleOf(L.id, gear ? 'gear' : 'life'), end = lessonsHead.charAt(0) + lessonsHead.slice(1).toLocaleLowerCase(L.id);
      if (Number(opts.outroStart) - chapters[chapters.length - 1].t >= 10) chapters.push({ t: Math.round(opts.outroStart), clock: clockOf(opts.outroStart), label: end });
    }
    // Hashtag đề xuất (tối đa 14: YouTube bỏ qua TẤT CẢ nếu video có hơn 15; 3 cái đầu hiện ngay trên tiêu đề): hashtag của tiêu đề, khung đúng / sai, #Shorts (nếu dọc),
    // hashtag chung của loạt video, vài từ khóa RIÊNG của kịch bản (lấy từ tiêu đề), rồi hashtag chủ đề chung.
    const M = gear ? (GEAR_MORE[L.id] || GEAR_MORE.en) : (MORE[L.id] || MORE.en), lessonsHead2 = lessonsTitleOf(L.id, gear ? 'gear' : 'life'), titleWords = hook.split(/[^\p{L}\p{N}]+/u).filter(w => w.length >= 5 && /^\p{Lu}/u.test(w) && !/^(Spending|Saving|Wrong|Right)$/iu.test(w)).map(w => hashOf(w)).slice(0, 2);
    const hashtags = [...new Map([hashOf(hook).slice(0, 40), ...M.top, opts.layout === 'stack' ? 'Shorts' : '', ...X.hash, ...titleWords, ...M.rest].filter(Boolean).map(h => '#' + h).map(h => [lc(h), h])).values()].slice(0, 14);
    const body = [title];
    if (closing) body.push('', closing);
    if (lessons.length) body.push('', lessonsHead2.charAt(0) + lessonsHead2.slice(1).toLocaleLowerCase(L.id) + ':', ...lessons.map(x => '• ' + x));
    if (chapters.length >= 3) body.push('', X.chapters + ':', ...chapters.map(c => `${c.clock} ${c.label}`));
    body.push('', X.note, '', hashtags.join(' '));
    const description = body.join('\n').slice(0, 4900);
    const words = [title, hook, flat(script && script.left), flat(script && script.right), ...X.kw, ...M.kw, ...flat(taglineOf(L.id, gear ? 'gear' : 'life')).split('·'), flat(script && script.meter)].map(x => lc(flat(x))).filter(x => x.length > 1);
    const tags = []; let size = 0;
    for (const t of [...new Set(words)]) { if (size + t.length + 2 > 450) break; tags.push(t); size += t.length + 2; }
    // Tiêu đề gợi ý khác (≤ 70 ký tự, khác tiêu đề hiện tại): làm / không làm · hai con đường · đúng / sai · cùng một khởi đầu.
    const sentence = t => { const x = lc(flat(t)); return x.charAt(0).toLocaleUpperCase(L.id) + x.slice(1); };
    const left = sentence(script && script.left), right = sentence(script && script.right), okLabels = left && right && left.length <= 28 && right.length <= 28;
    const hs = Array.from(hook).length > 40 ? (Array.from(hook).slice(0, 40).join('').replace(/\s+\S*$/u, '').trim() || Array.from(hook).slice(0, 40).join('')) : hook;   // cụm đầu quá dài thì cắt ở ranh giới từ để tiêu đề gợi ý vẫn ≤ 70
    const titles = [...new Set(M.ideas.filter(x => okLabels || !/\{l\}/.test(x)).map(x => x.replace('{h}', hs).replace('{l}', left).replace('{r}', right).replace(/\s+/g, ' ').trim()))].filter(x => Array.from(x).length <= 70 && lc(x) !== lc(title)).slice(0, 4);
    const text = ['TITLE', title, '', 'DESCRIPTION', description, '', 'HASHTAGS', hashtags.join(' '), '', 'TAGS', tags.join(', '), ...(titles.length ? ['', 'TITLE IDEAS', ...titles] : [])].join('\n') + '\n';
    return { lang: L.id, title, description, hashtags, tags, titles, chapters: chapters.length >= 3 ? chapters : [], partial: chapters.length < 3, text };
  }

  // Bên «đúng / nên» (✓) và bên «sai / không nên» (✗) theo điểm cuối cùng của hai bên; chênh dưới 5 điểm hoặc thiếu điểm thì không kết luận.
  function verdictOf(beats, mode) {
    if (mode === 'gear') return '';   // khí tài: không có «đúng / sai» (✓ / ✗), chỉ so điểm từng hạng mục
    const last = Array.isArray(beats) && beats.length ? beats[beats.length - 1] : null;
    const l = Number(last && last.leftScore), r = Number(last && last.rightScore);
    if (!Number.isFinite(l) || !Number.isFinite(r) || Math.abs(l - r) < 5) return '';
    return r > l ? 'R' : 'L';
  }

  return {
    KIND, MODES, GEAR_TOPICS, gearPreset, taglineOf, lessonsTitleOf, meterOf, LAYOUTS, MINUTES, SECONDS, PART_BEATS, LANGS, LANGUAGES, langOf, limits, RATES, TOPICS, topicPreset, budgetChars, beatsFor, MAX_CAPTION, MAX_LABEL, MAX_TAG, MAX_LESSONS,
    options, problems, slug, storyIdBase, buildBibleInstruction, parseBible, buildPartInstruction, parseBeats, checkBeats, fixText, assemble,
    anchorPrompt, clipPrompt, isPolicyError, safeRetryPrompt, buildJobs, hudScript, notesText, publishPack, clockOf, uniqueTitle, verdictOf
  };
});
