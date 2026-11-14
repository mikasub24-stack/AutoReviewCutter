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
  // Tốc độ mặc định cho ngôn ngữ chưa có số riêng (RATES); tiếng Việt xem RATES.vi.
  const CHARS_PER_SECOND = 14;
  const count = value => Array.from(String(value || '')).length;
  // Viết bằng tiếng Anh vì Muse hiểu ràng buộc âm thanh bằng tiếng Anh chắc hơn.
  const NO_SPEECH = 'Audio: no speech, no dialogue, no singing, no narration, no mumbling, no murmuring, no whispering, no humming, no laughing out loud, no human voice or vocal sound of any kind, and no music, no sound effects, no ambient noise - the video must be completely silent with no audio at all. Characters may still open their mouths, laugh, gossip, shout and show every facial expression and gesture visually so that the spoken lines are clearly expressed, but with no sound whatsoever.';

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
  // Tiếng Việt: ~4,4 âm tiết/giây × ~4,8 ký tự (tính cả dấu cách) ≈ 20 ký tự/giây (hơi chậm hơn 21 mà AnimStudio dùng, chừa lề), cùng tốc độ AnimStudio dùng (4,6 từ/giây); trước 1.6.5 để 14 nên tưởng lời đọc dài hơn ~1,5 lần thật và chia thừa cảnh.
  const RATES = { vi: 20, en: 15, es: 16, fr: 15, de: 14, pt: 15, it: 15, id: 14, ru: 14, th: 11, ar: 13, hi: 14, zh: 4.5, ja: 7.5, ko: 8 };

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
  // Ngôn ngữ để viết câu khóa app thêm vào prompt. «en» của detectLanguage là mặc định khi không nhận ra, nên chỉ tin khi có đủ từ tiếng Anh
  // phổ biến; câu ngắn tiếng Việt không dấu đặc trưng («Mai nhìn quanh.») vẫn là tiếng Việt.
  function promptLanguage(text) {
    const code = detectLanguage(text);
    if (code !== 'en') return code;
    const common = new Set(STOPWORDS.en), words = String(text || '').toLowerCase().match(/\p{L}+/gu) || [];
    return words.filter(w => common.has(w)).length >= 3 ? 'en' : 'vi';
  }
  const charsPerSecond = language => RATES[language] || CHARS_PER_SECOND;
  // Đổi tốc độ đọc của một ngôn ngữ (dùng khi đã đo được giọng thật, và trong test để cố định tình huống).
  const setRate = (language, perSecond) => { if (Number(perSecond) > 0) RATES[language] = Number(perSecond); };
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

  // Mục tiêu độ dài một cảnh truyện: gần hết thời lượng clip (budget = 90% clip), không dưới ~70% budget. Cảnh vụn dưới mức này
  // làm bài bị chia quá nhiều cảnh (mỗi cảnh tốn một lượt tạo video) nên Muse được dặn gộp, và app tự soát lại (shortRuns).
  const sceneFloor = seconds => Math.max(MIN_SECONDS, Math.round(Number(seconds) * 0.9 * 0.7));
  const fmtSeconds = n => String(Math.round(n * 10) / 10).replace('.', ',');

  /* ---------- chế độ quảng cáo sản phẩm (affiliate) ---------- */
  // `prompt` là câu đưa vào prompt gửi Muse; `label` / `en` là chữ trên nút chọn.
  const AD_CAMERA = [
    { id: 'macro', label: 'Cận cảnh chi tiết', en: 'Macro close-up', prompt: 'cận cảnh chi tiết (macro) chất liệu, kết cấu và các chi tiết của sản phẩm' },
    { id: 'dolly-in', label: 'Tiến sát', en: 'Dolly in', prompt: 'máy quay tiến chậm về phía sản phẩm (dolly in)' },
    { id: 'pull-back', label: 'Lùi xa', en: 'Pull back', prompt: 'máy quay lùi ra từ từ để lộ toàn cảnh (pull back)' },
    { id: 'orbit', label: 'Xoay quanh', en: 'Orbit', prompt: 'máy quay xoay chậm quanh sản phẩm (orbit) để thấy nhiều góc' },
    { id: 'pan', label: 'Lia ngang', en: 'Pan', prompt: 'máy quay lia ngang thật mượt (pan)' },
    { id: 'top', label: 'Từ trên cao', en: 'Top-down', prompt: 'góc quay từ trên cao nhìn xuống (top-down / flycam)' },
    { id: 'slow', label: 'Quay chậm', en: 'Slow motion', prompt: 'chuyển động quay chậm (slow motion) ở khoảnh khắc nổi bật' },
    { id: 'handheld', label: 'Cầm tay', en: 'Handheld', prompt: 'máy quay cầm tay tự nhiên như người thật quay (handheld)' },
    { id: 'static', label: 'Cố định', en: 'Static', prompt: 'máy quay cố định trên chân máy, khung hình vững' }
  ];
  const AD_LOOK = [
    { id: 'tvc', label: 'Quảng cáo TVC', en: 'TV commercial', prompt: 'phong cách quảng cáo TVC cao cấp: ánh sáng studio mềm, nền gọn sạch, sản phẩm nổi bật, màu sắc sang và nhất quán' },
    { id: 'cinematic', label: 'Điện ảnh', en: 'Cinematic', prompt: 'phong cách điện ảnh: ánh sáng tương phản nhẹ, chiều sâu trường ảnh nông, tông màu ấm' },
    { id: 'ugc', label: 'Review đời thường', en: 'UGC review', prompt: 'phong cách review đời thường (UGC): như quay bằng điện thoại, ánh sáng tự nhiên, bối cảnh thật trong nhà, người dùng bình thường' },
    { id: 'minimal', label: 'Tối giản, nền trơn', en: 'Minimal', prompt: 'phong cách tối giản: nền trơn một màu, ít vật thể, sản phẩm là trung tâm' },
    { id: 'bright', label: 'Tươi sáng, trẻ trung', en: 'Bright & young', prompt: 'phong cách tươi sáng, trẻ trung: màu rực, ánh sáng tự nhiên, năng động' },
    { id: 'luxury', label: 'Sang trọng', en: 'Luxury', prompt: 'phong cách sang trọng: tông tối ấm, ánh sáng điểm nhấn, vật liệu bóng, chuyển động chậm và tinh tế' }
  ];
  const AD_TONE = [
    { id: 'hype', label: 'Hào hứng, thuyết phục', en: 'Enthusiastic', prompt: 'hào hứng, thuyết phục nhưng không phóng đại' },
    { id: 'warm', label: 'Thân mật, chân thành', en: 'Warm & sincere', prompt: 'thân mật, chân thành như người quen giới thiệu' },
    { id: 'expert', label: 'Chuyên gia, đáng tin', en: 'Expert', prompt: 'điềm tĩnh, rõ ràng, đáng tin như người am hiểu' },
    { id: 'fun', label: 'Vui nhộn, trẻ trung', en: 'Fun & young', prompt: 'vui nhộn, trẻ trung, gần gũi' },
    { id: 'premium', label: 'Sang trọng, tinh tế', en: 'Premium', prompt: 'sang trọng, tinh tế, ít lời' }
  ];
  const AD_LENGTHS = [15, 30, 45, 60];
  // Mẫu quảng cáo dựng sẵn: chọn một mẫu thì điền sẵn giọng điệu, độ dài, máy quay, phong cách; `structure` đi vào câu lệnh viết lời.
  const AD_TEMPLATES = [
    { id: 'intro', label: 'Giới thiệu sản phẩm', en: 'Product intro', tone: 'expert', length: 30, camera: ['dolly-in', 'macro'], look: 'tvc',
      structure: 'Mở đầu bằng nhu cầu của người xem, rồi giới thiệu sản phẩm với 2–4 điểm nổi bật, kết bằng lời mời xem chi tiết.',
      shots: [
        "Mở đầu thu hút: {p} hiện ra từ nền mờ vào vùng sáng, nằm chính giữa khung hình, nền gọn sạch, ánh sáng studio mềm.",
        "Toàn cảnh {p} đặt trên mặt bàn sạch, ánh sáng mềm làm rõ hình dạng và màu sắc đúng như ảnh tham chiếu.",
        "Cận cảnh chi tiết, chất liệu và bề mặt của {p}, độ sâu trường ảnh nông, nền mờ.",
        "Bàn tay nhẹ nhàng cầm {p} lên và xoay chậm để thấy các mặt của sản phẩm.",
        "{p} đặt trong không gian sống phù hợp (bàn làm việc, kệ hoặc phòng khách), ánh sáng tự nhiên, bố cục gọn gàng.",
        "Khung hình đẹp nhất của {p}: đặt chính giữa, ánh sáng điểm nhấn, nền sạch, giữ yên vài giây cho người xem nhớ sản phẩm."
      ] },
    { id: 'review', label: 'Review sản phẩm', en: 'Product review', tone: 'warm', length: 30, camera: ['handheld', 'macro'], look: 'ugc',
      structure: 'Giọng thân mật như người quen giới thiệu: sản phẩm này là gì, điểm đáng chú ý nhất, ai hợp dùng, rồi mời xem chi tiết. KHÔNG bịa trải nghiệm cá nhân, thời gian đã dùng hay kết quả.',
      shots: [
        "Quay kiểu điện thoại cầm tay: người mẫu giơ {p} về phía ống kính, nhìn thẳng và mỉm cười thân thiện, bối cảnh trong nhà ánh sáng tự nhiên.",
        "Cận cảnh {p} đặt trên bàn tay người dùng, máy quay cầm tay rung nhẹ tự nhiên.",
        "Người mẫu xoay {p} trong tay, chỉ vào các chi tiết, nét mặt hào hứng.",
        "{p} đặt trên bàn trong nhà cùng vài vật dụng đời thường xung quanh, quay từ góc nghiêng.",
        "Người mẫu gật đầu hài lòng, đưa {p} lại gần ống kính.",
        "Cận cảnh {p} trên tay người mẫu hướng về ống kính, nền mờ ấm cúng, giữ yên vài giây."
      ] },
    { id: 'problem', label: 'Vấn đề → giải pháp', en: 'Problem → solution', tone: 'hype', length: 30, camera: ['pull-back', 'dolly-in'], look: 'bright',
      structure: 'Mở bằng một tình huống khó chịu quen thuộc liên quan tới nhu cầu của người xem, rồi sản phẩm là cách giải quyết, nêu các điểm nổi bật, kết bằng lời mời xem chi tiết. Không phóng đại tình huống.',
      shots: [
        "Một tình huống đời thường hơi bất tiện (người mẫu nhăn mặt, nhìn đồng hồ, bàn làm việc bừa bộn), không phóng đại.",
        "{p} xuất hiện trong khung hình, ánh sáng sáng lên nhẹ nhàng, khung cảnh trở nên gọn gàng hơn.",
        "Cận cảnh {p} với các chi tiết nổi bật, nền mờ, ánh sáng mềm.",
        "Người mẫu cầm {p} lên với vẻ nhẹ nhõm, mỉm cười.",
        "{p} nằm trong không gian sống đã gọn gàng, ánh sáng tự nhiên buổi sáng.",
        "Khung hình đẹp nhất của {p}: đặt chính giữa, nền sạch, ánh sáng sáng và tươi, giữ yên vài giây."
      ] },
    { id: 'promo', label: 'Khuyến mãi nhanh', en: 'Quick promo', tone: 'fun', length: 15, camera: ['dolly-in', 'slow'], look: 'bright',
      structure: 'Ngắn gọn: một câu thu hút, 1–2 điểm nổi bật, nhắc đúng giá / ưu đãi người dùng đưa (nếu có), rồi kêu gọi hành động. Không tạo áp lực giả như «chỉ còn vài suất» hay «sắp hết hàng».',
      shots: [
        "{p} xuất hiện bất ngờ giữa nền màu tươi, chuyển động năng động, nổi bật chính giữa khung hình.",
        "Cận cảnh {p} thật nổi bật, ánh sáng rực rỡ, màu sắc đúng như ảnh tham chiếu.",
        "Máy quay lướt nhanh quanh {p}, nhịp nhanh, vui mắt.",
        "Người mẫu giơ {p} lên với vẻ vui tươi, nhìn thẳng vào ống kính.",
        "{p} đặt cạnh vài vật dụng gọn gàng trên nền màu tươi, bố cục thoáng.",
        "{p} đặt chính giữa nền màu tươi, chừa khoảng trống phía trên khung hình, giữ yên vài giây."
      ] },
    { id: 'unbox', label: 'Mở hộp, nhìn kỹ', en: 'Unboxing', tone: 'warm', length: 30, camera: ['top', 'macro', 'orbit'], look: 'minimal',
      structure: 'Dẫn theo từng bước: mở hộp, nhìn bao bì, cầm sản phẩm lên, xem kỹ chất liệu và chi tiết, rồi nêu điểm nổi bật và mời xem chi tiết. Chỉ tả những gì có trong thông tin người dùng đưa.',
      shots: [
        "Quay từ trên cao: hộp hoặc bao bì của {p} đặt trên mặt bàn gọn gàng, bàn tay bắt đầu mở ra.",
        "Bàn tay lấy {p} ra khỏi bao bì, nhẹ nhàng, rõ từng động tác.",
        "Cận cảnh chất liệu và chi tiết của {p} ngay sau khi mở hộp, độ sâu trường ảnh nông.",
        "{p} được xoay chậm trên mặt bàn để thấy các góc khác nhau.",
        "{p} đặt cạnh bao bì, bố cục ngay ngắn, nhìn từ trên cao xuống.",
        "Khung hình đẹp nhất của {p} bên cạnh bao bì, nền sạch, ánh sáng mềm, giữ yên vài giây."
      ] },
    { id: 'premium', label: 'Cao cấp, tinh tế', en: 'Premium', tone: 'premium', length: 30, camera: ['slow', 'orbit', 'pull-back'], look: 'luxury',
      structure: 'Ít lời, câu ngắn, nhấn chất liệu và cảm giác sử dụng; không dùng từ rẻ, giảm sâu hay ép mua trừ khi người dùng đưa giá / ưu đãi. Kết nhẹ nhàng bằng lời mời.',
      shots: [
        "{p} nổi lên từ nền tối, ánh sáng điểm nhấn lướt chậm qua bề mặt.",
        "Cận cảnh chất liệu và các đường nét của {p}, phản chiếu ánh sáng tinh tế, chuyển động rất chậm.",
        "Máy quay xoay chậm quanh {p} đặt trên bệ tối, ánh sáng điểm nhấn.",
        "Bàn tay nhẹ nhàng chạm vào {p}, cử chỉ chậm rãi, tinh tế.",
        "{p} trong một không gian sang trọng, ánh đèn ấm, bố cục thoáng, ít vật thể.",
        "Khung hình tĩnh của {p}: ánh sáng điểm nhấn, bóng đổ mềm, nền tối, giữ yên lâu."
      ] }
  ];
  const AD_MAX_CAMERA = 3;
  const adText = (value, max) => String(value || '').replace(/\s+/g, ' ').trim().slice(0, max);
  // null = không phải chế độ quảng cáo. Chuẩn hóa mọi trường để dữ liệu từ giao diện không làm hỏng prompt.
  function adOptions(raw) {
    if (!raw || typeof raw !== 'object') return null;
    const ids = list => new Set(list.map(x => x.id));
    const camera = [...new Set((Array.isArray(raw.camera) ? raw.camera : []).map(String))].filter(id => ids(AD_CAMERA).has(id)).slice(0, AD_MAX_CAMERA);
    const length = Number(raw.length);
    return {
      product: adText(raw.product, 120),
      points: String(raw.points || '').replace(/\r\n?/g, '\n').split('\n').map(line => adText(line, 240)).filter(Boolean).slice(0, 12).join('\n'),
      audience: adText(raw.audience, 160),
      offer: adText(raw.offer, 160),
      cta: adText(raw.cta, 160),
      tone: ids(AD_TONE).has(raw.tone) ? raw.tone : AD_TONE[0].id,
      length: AD_LENGTHS.includes(length) ? length : 30,
      camera,
      look: ids(AD_LOOK).has(raw.look) ? raw.look : '',
      template: ids(AD_TEMPLATES).has(raw.template) ? raw.template : ''
    };
  }
  const adPick = (list, id) => list.find(x => x.id === id);
  const productName = ad => (ad && ad.product) || 'sản phẩm trong ảnh tham chiếu';

  function options(input = {}) {
    const seconds = Number(input.seconds ?? MAX_SECONDS);
    if (!Number.isFinite(seconds) || seconds < 3 || seconds > MAX_SECONDS) throw Error(`Muse chỉ tạo clip tối đa ${MAX_SECONDS} giây: chọn mỗi cảnh từ 3 đến ${MAX_SECONDS} giây.`);
    const aspect = input.aspect || '16:9';
    if (!ASPECTS.includes(aspect)) throw Error('Chọn tỷ lệ 16:9, 9:16 hoặc 1:1.');
    const ad = adOptions(input.ad);
    const tip = Boolean(input.tip) && !ad;
    return { seconds, aspect, style: String(input.style || '').trim(), character: String(input.character || '').trim(), form: String(input.form || '').trim().slice(0, 200), reference: Boolean(input.reference), ad, tip, ...(tip ? tipOptions(input) : {}) };
  }

  /* Mẹo vặt viết từ TIÊU ĐỀ: độ dài video, ngôn ngữ lời đọc. Số giây mỗi ảnh/clip chính là `seconds` của tùy chọn chung. */
  const TIP_MINUTES = [1, 2, 3, 5, 10];
  // Cây trồng phát triển: video dài hơn (7–10 phút) nên nhiều cảnh hơn mẹo vặt.
  const PLANT_MINUTES = [7, 8, 9, 10];
  // Lịch sử minh họa cho kênh: chọn tới 180 phút (3 giờ). Bài dán sẵn thì số cảnh tự theo độ dài bài, không cần chọn.
  const HIST_MINUTES = [1, 2, 3, 5, 10, 15, 20, 30, 45, 60, 90, 120, 180];
  const TIP_SECS = [6, 8, 10];
  const TIP_MAX_ITEMS = 80, PLANT_MAX_ITEMS = 100, HIST_MAX_ITEMS = 2000, TIP_PART_ITEMS = 16;
  // Lịch sử minh họa có hai kiểu hình: «cartoon» (mặc định) = tranh hoạt hình phẳng; «film» = khung phim tư liệu chân thực như phim, ảnh cũ được phục chế màu.
  const HIST_LOOKS = {
    cartoon: {
      name: 'TRANH MINH HỌA HOẠT HÌNH', pic: 'bức tranh minh họa hoạt hình', first: 'minh họa hoạt hình phẳng', one: 'MỘT bức tranh', paint: 'vẽ một bức tranh toàn cảnh đẹp',
      verb: 'Create a flat 2D cartoon illustration',
      style: 'flat 2D cartoon illustration, clean outlines, warm vibrant colors, simple shading',
      sample: 'Create a flat 2D cartoon illustration, warm vibrant colors, clean outlines, wide composition with space on both sides, showing: ',
      motion: 'Chuyển động: tranh hoạt hình chuyển động nhẹ, chậm, đẹp: máy quay đẩy vào hoặc lia rất chậm, nhân vật chớp mắt hoặc khẽ đổi tư thế, cờ và vạt áo bay nhẹ. Giữ nguyên phong cách, nhân vật và đồ vật như trong ảnh; không thêm nhân vật mới.',
      close: 'Keep the flat 2D cartoon illustration style, every character and object exactly as in the first frame. No morphing, no new characters or objects, no cuts, no scene change, smooth gentle camera.'
    },
    film: {
      name: 'ẢNH PHIM TƯ LIỆU CHÂN THỰC (như phim, ảnh cũ được phục chế màu)', pic: 'khung hình phim tư liệu chân thực (như phim cũ được phục chế màu)', first: 'chân thực kiểu phim tư liệu phục chế màu (photorealistic)', one: 'MỘT khung hình', paint: 'dựng một khung phim toàn cảnh đẹp',
      verb: 'Create a photorealistic cinematic film still',
      style: 'photorealistic cinematic film still, restored colorized archival footage look, natural muted period colour grading, fine film grain, soft vignette, shallow depth of field',
      sample: 'Create a photorealistic cinematic film still, restored colorized archival footage look, natural muted period colours, fine film grain, soft vignette, wide composition with space on both sides, showing: ',
      motion: 'Chuyển động: cảnh phim tư liệu chân thực chuyển động nhẹ, chậm, tự nhiên: máy quay đẩy vào hoặc lia rất chậm, người chớp mắt và thở khẽ, cờ, vạt áo, khói, bụi và sóng nước lay động theo gió. Giữ nguyên khuôn mặt, trang phục, đồ vật và màu phim như trong ảnh; không thêm người mới.',
      close: 'Keep the photorealistic cinematic film look with fine film grain, every person and object exactly as in the first frame. No morphing, no new people or objects, no cuts, no scene change, smooth gentle camera.'
    }
  };
  const histLookOf = config => HIST_LOOKS[config && config.histLook === 'film' ? 'film' : 'cartoon'];
  function tipOptions(input) {
    const minutes = Number(input.tipMinutes), plant = input.tipKind === 'plant', history = input.tipKind === 'history';
    return { tipKind: plant ? 'plant' : history ? 'history' : 'tip', tipTitle: String(input.tipTitle || '').replace(/\s+/g, ' ').trim().slice(0, 200), tipMinutes: (plant ? PLANT_MINUTES : history ? HIST_MINUTES : TIP_MINUTES).includes(minutes) ? minutes : plant ? 8 : history ? 3 : 2, tipLanguage: input.tipLanguage === 'en' ? 'en' : 'vi', tipMotion: input.tipMotion === 'full' ? 'full' : 'gentle', tipPrompt: !history && input.tipPrompt === 'vi' ? 'vi' : 'en', ...(history ? { histLook: input.histLook === 'film' ? 'film' : 'cartoon' } : {}) };
  }
  // Kế hoạch: tổng số mục = 1 mở đầu + các bước + 1 kết; mỗi mục = một cảnh = một ảnh + một clip.
  function tipPlan(input = {}) {
    const config = options({ ...input, tip: true });
    const secs = config.seconds, language = config.tipLanguage;
    const plant = config.tipKind === 'plant';
    const total = Math.max(5, Math.min(plant ? PLANT_MAX_ITEMS : config.tipKind === 'history' ? HIST_MAX_ITEMS : TIP_MAX_ITEMS, Math.round(config.tipMinutes * 60 / secs)));
    const hi = budgetChars(secs, language), target = Math.floor(secs * charsPerSecond(language) * 0.85);
    return { total, steps: total - 2, secs, language, plant, history: config.tipKind === 'history', minutes: config.tipMinutes, title: config.tipTitle, lo: Math.floor(target * 0.6), hi, target };
  }
  // Chia các mục thành những phần ≤ TIP_PART_ITEMS mục (đều nhau) để mỗi lượt hỏi Muse không quá dài.
  function tipParts(tp) {
    const n = Math.ceil(tp.total / TIP_PART_ITEMS), size = Math.ceil(tp.total / n), parts = [];
    for (let from = 1; from <= tp.total; from += size) parts.push([from, Math.min(tp.total, from + size - 1)]);
    return parts;
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

  /* Khóa hình dạng nhân vật: nhân vật chuẩn (ảnh tham chiếu và/hoặc kiểu người dùng mô tả) quyết định hình dạng của MỌI nhân vật;
     người khác chỉ được khác màu/kiểu quần áo, giới tính, tóc, phụ kiện. Câu khóa do app tự gắn vào MỌI prompt, không phụ thuộc Muse viết gì. */
  const isLocked = config => !config.ad && !config.tip && Boolean(config.reference || config.form);
  // Câu khóa do app tự thêm vào prompt: viết cùng ngôn ngữ với truyện (tiếng Việt khi truyện tiếng Việt, còn lại tiếng Anh)
  // để prompt gửi mô hình video không bị lẫn hai thứ tiếng.
  function lockLine(config, language = 'vi') {
    if (!isLocked(config)) return '';
    if (language !== 'vi') {
      return `CHARACTER SHAPE LOCK (mandatory): use ${config.reference ? 'the character in the attached reference image' : 'the character style described below'} as the standard${config.form ? ` — standard shape: ${config.form}` : ''}. EVERY character in the scene, including background people, must have the same body shape and proportions, head and face style, art style, level of realism and level of detail as the standard character (if the standard is a stick figure, everyone is a stick figure; if it is a real person, everyone is a real person; if it is a cartoon animal, everyone is drawn in that same cartoon style); they may differ only in clothing color and style, gender, hair or fur, accessories, height, and species if the story says so. Do not switch to a different drawing style or level of realism than the standard character.`;
    }
    return `KHÓA HÌNH DẠNG NHÂN VẬT (bắt buộc): lấy ${config.reference ? 'nhân vật trong ảnh tham chiếu' : 'kiểu nhân vật mô tả dưới đây'} làm chuẩn${config.form ? ` — hình dạng chuẩn: ${config.form}` : ''}. MỌI nhân vật trong cảnh, kể cả người phụ, phải CÙNG hình dạng, tỉ lệ cơ thể, kiểu đầu và mặt, kiểu vẽ, độ chân thực và độ chi tiết với nhân vật chuẩn (chuẩn là người que thì mọi người đều là người que; là người thật thì mọi người đều là người thật; là con vật hoạt hình thì mọi nhân vật đều cùng kiểu hoạt hình đó); chỉ được khác màu và kiểu quần áo, giới tính, kiểu tóc hoặc bộ lông, phụ kiện, chiều cao, và loài nếu câu chuyện nói rõ. Không đổi sang kiểu vẽ hay độ chân thực khác với nhân vật chuẩn.`;
  }
  const lockBoth = config => [lockLine(config, 'vi'), lockLine(config, 'en')].filter(Boolean);
  // Câu tỉ lệ khung hình app tự thêm vào mọi prompt Muse viết (Muse có thể quên ghi tỉ lệ đã chọn).
  const ASPECT_WORDS = { '16:9': ['ngang', 'landscape'], '9:16': ['dọc', 'vertical'], '1:1': ['vuông', 'square'] };
  function aspectLine(config, language = 'vi') {
    const words = ASPECT_WORDS[config.aspect];
    if (!words) return '';
    return language !== 'vi' ? `Video aspect ratio: ${config.aspect} (${words[1]}).` : `Tỷ lệ khung hình video: ${config.aspect} (${words[0]}).`;
  }

  /* ---------- chế độ Mẹo vặt ----------
     Mỗi bước của mẹo = một cảnh = MỘT ẢNH chụp thật (khung hình đầu) + MỘT clip chuyển động làm từ chính ảnh đó.
     Lời đọc vẫn là nguyên văn mẹo; Muse chỉ chia bước và viết prompt ảnh + prompt chuyển động. */
  const IMAGE_NO_TEXT = { vi: 'Không có chữ, chữ số, logo, hình mờ hay phụ đề trong ảnh.', en: 'No text, lettering, numbers, logos, watermarks or captions in the image.' };
  const NO_TEXT_SEEN = /không (?:có )?chữ|no text/i;
  const IMAGE_VERB = /^\s*(?:hãy\s+)?(?:tạo|vẽ|create|generate|draw|make)(?![\p{L}])/iu;
  const TIP_START = {
    vi: 'Ảnh đính kèm là khung hình đầu tiên của video: giữ nguyên đồ vật, màu sắc, bố cục và ánh sáng trong ảnh, chỉ thêm chuyển động tự nhiên; không đổi sang cảnh khác, không thêm vật hay người mới.',
    en: 'The attached image is the first frame of the video: keep the objects, colors, composition and lighting of the image exactly as they are and only add natural motion; do not switch to a different scene or add new objects or people.'
  };
  // Mẹo vặt: Muse viết ẢNH và PROMPT bằng tiếng Anh thì các câu app tự thêm cũng bằng tiếng Anh.
  const tipEnglish = config => Boolean(config.tip) && config.tipPrompt !== 'vi';
  const tipStartLine = (language = 'vi') => (language !== 'vi' ? TIP_START.en : TIP_START.vi);
  const hasTipStart = text => [TIP_START.vi, TIP_START.en].some(line => String(text).includes(line));
  function imageAspectLine(config, language = 'vi') {
    const words = ASPECT_WORDS[config.aspect];
    if (!words) return '';
    return language !== 'vi' ? `Image aspect ratio: ${config.aspect} (${words[1]}).` : `Tỷ lệ khung hình ảnh: ${config.aspect} (${words[0]}).`;
  }
  // Câu tỉ lệ ĐẦU prompt gửi Muse: Muse hay bỏ qua câu tỉ lệ ở cuối prompt (ra 3:4), nên nói ngay từ đầu, rõ khung và hướng.
  const RATIO_LEAD = {
    video: {
      vi: { '16:9': 'Video khung NGANG 16:9 (widescreen).', '9:16': 'Video khung DỌC 9:16 (toàn màn hình điện thoại).', '1:1': 'Video khung VUÔNG 1:1.' },
      en: { '16:9': 'Horizontal 16:9 widescreen video.', '9:16': 'Vertical 9:16 portrait video (full-screen phone video).', '1:1': 'Square 1:1 video.' }
    },
    image: {
      vi: { '16:9': 'Ảnh khung NGANG 16:9 (widescreen).', '9:16': 'Ảnh khung DỌC 9:16 (toàn màn hình điện thoại).', '1:1': 'Ảnh khung VUÔNG 1:1.' },
      en: { '16:9': 'Horizontal 16:9 widescreen image.', '9:16': 'Vertical 9:16 portrait image (full-screen phone photo).', '1:1': 'Square 1:1 image.' }
    }
  };
  const ratioLead = (config, language = 'vi', kind = 'video') => (config && RATIO_LEAD[kind][language !== 'vi' ? 'en' : 'vi'][config.aspect]) || '';
  // Video: câu tỉ lệ là dòng ĐẦU. Ảnh: động từ tạo ảnh vẫn mở đầu (Muse nhận ra đây là lệnh vẽ ảnh), câu tỉ lệ ngay sau câu đầu tiên.
  const withRatioLead = (text, config, language, kind) => {
    const lead = ratioLead(config, language, kind), other = ratioLead(config, language !== 'vi' ? 'vi' : 'en', kind);
    if (!lead || !text || text.includes(lead) || (other && text.includes(other))) return text;
    if (kind === 'video') return lead + '\n' + text;
    const nl = text.indexOf('\n'), line = nl < 0 ? text : text.slice(0, nl), rest = nl < 0 ? '' : text.slice(nl + 1);
    const first = /^[^]*?[.!?。](?=\s|$)/.exec(line), head = first && first[0].length <= 400 ? first[0] : line;
    const after = [line.slice(head.length).trim(), rest].filter(Boolean).join('\n');
    return head + '\n' + lead + (after ? '\n' + after : '');
  };
  // Prompt ảnh cuối cùng: mở đầu bằng động từ tạo ảnh, có tỉ lệ khung hình và câu cấm chữ trong ảnh (chỉ thêm khi Muse chưa ghi).
  function finalImagePrompt(prompt, config, language = 'vi') {
    return withRatioLead(finalImageBody(prompt, config, language), config, language, 'image');
  }
  function finalImageBody(prompt, config, language = 'vi') {
    let text = String(prompt || '').trim();
    if (!text) return '';
    const en = language !== 'vi';
    if (!IMAGE_VERB.test(text)) text = config.tipKind === 'history' ? histLookOf(config).verb + ': ' + text : (en ? 'Create a photorealistic photo: ' : 'Tạo ảnh chụp thật: ') + text;
    const extra = [];
    if (config.aspect && !text.includes(config.aspect)) extra.push(imageAspectLine(config, language));
    if (!NO_TEXT_SEEN.test(text)) extra.push(IMAGE_NO_TEXT[en ? 'en' : 'vi']);
    return extra.length ? text + '\n' + extra.join('\n') : text;
  }
  // Prompt ảnh mẫu (chưa qua Muse): dùng khi Muse chưa viết được; Muse viết lại tốt hơn nhiều.
  function tipImagePrompt(voiceover, config, language = 'vi') {
    const text = String(voiceover || '').trim();
    const style = config.style ? ` Phong cách: ${config.style}.` : '';
    if (config.tipKind === 'history') return finalImagePrompt(`${histLookOf(config).sample}${text}.${config.style ? ` Style: ${config.style}.` : ''}`, config, 'en');
    return finalImagePrompt(`Tạo ảnh chụp thật (photorealistic), cận cảnh rõ nét, ánh sáng tự nhiên, bố cục gọn, thể hiện đúng bước sau: ${text}.${style}`, config, language);
  }
  function tipScenePrompt(voiceover, config, seconds) {
    return [
      `Tạo video dài ${seconds} giây, tỷ lệ ${config.aspect}, làm từ ảnh đính kèm (khung hình đầu tiên).`,
      voiceover ? `NỘI DUNG BƯỚC (lời đọc, chỉ để hiểu bước; không ai nói): ${voiceover}` : '',
      config.tipKind === 'history'
        ? histLookOf(config).motion
        : config.tipKind === 'plant'
          ? 'Chuyển động: TIME-LAPSE quay tua nhanh MỘT bước nhỏ của đời cây: cây chỉ đổi một chút (vài ngày tới một hai tuần) nhưng thấy rõ ngay trong clip, đúng giai đoạn của bước này, liền mạch và đúng hình thái thật của loài; KHÔNG tua cả vòng đời trong một clip. Cuối clip cây đạt hình thái của giai đoạn kế tiếp. Chậu, đất, nền và ánh sáng giữ nguyên.'
          : 'Chuyển động: thể hiện đúng thao tác của bước này, tự nhiên và mượt: tay hoặc dụng cụ làm gì, vật thay đổi thế nào; không bỏ thao tác quan trọng.',
      config.tipKind === 'history' ? 'Máy quay: đẩy vào hoặc lia ngang rất chậm.' : config.tipKind === 'plant' ? 'Máy quay: CỐ ĐỊNH như đặt trên chân máy, giữ nguyên góc và khoảng cách; không đẩy, lia hay phóng to.' : 'Máy quay: cố định hoặc xê dịch rất nhẹ.',
      tipStartLine('vi'),
      NO_SPEECH,
      'Không chèn chữ, phụ đề hoặc logo vào hình.'
    ].filter(Boolean).join('\n');
  }

  // `fixed` = số giây cố định của cảnh không có lời đọc (cảnh quay quảng cáo từ ảnh).
  function scenePrompt(voiceover, config, visual = '', fixed = 0) {
    const seconds = fixed || sceneSeconds(voiceover || visual, config.seconds);
    if (config.tip) return tipScenePrompt(voiceover, config, seconds);
    const ad = config.ad;
    const camera = ad ? ad.camera.map(id => adPick(AD_CAMERA, id)?.prompt).filter(Boolean) : [];
    const look = ad ? (adPick(AD_LOOK, ad.look)?.prompt || '').replace(/^phong cách /, '') : '';
    return [
      `Tạo video ${ad ? 'quảng cáo sản phẩm ' : ''}dài ${seconds} giây, tỷ lệ ${config.aspect}, thể hiện đúng cảnh dưới đây.`,
      '',
      visual ? 'HÌNH ẢNH THEO KỊCH BẢN (làm đúng như mô tả):' : '',
      visual || '',
      voiceover ? (ad ? 'NỘI DUNG CẢNH (lời quảng cáo, chỉ để hiểu cảnh; không ai nói):' : 'NỘI DUNG CẢNH (lời kể, chỉ để hiểu cảnh; nhân vật không nói):') : '',
      voiceover || '',
      '',
      ad ? `Sản phẩm quảng cáo: ${productName(ad)}. Sản phẩm hiện rõ, là trung tâm chú ý của khung hình.` : '',
      config.character ? `${ad ? 'Người mẫu' : 'Nhân vật'}: ${config.character}` : '',
      config.style ? `Phong cách hình ảnh: ${config.style}` : '',
      look ? `Phong cách quảng cáo: ${look}.` : '',
      ...(config.reference ? [ad ? 'Sản phẩm giữ đúng hình dạng, màu sắc, chất liệu và bao bì như trong ảnh tham chiếu; không đổi sang sản phẩm khác.' : 'Nhân vật chính giữ đúng khuôn mặt, trang phục và thiết kế như trong ảnh tham chiếu, ở mọi cảnh.'] : []),
      lockLine(config),
      `Chỉ một khoảnh khắc liên tục trong ${seconds} giây, không chuyển cảnh; thể hiện đúng ${ad ? 'sản phẩm, bối cảnh, hành động và cảm xúc' : 'người, nơi chốn, thời gian, hành động và nét mặt'} được nêu.`,
      ad ? 'Chuyển động: tự nhiên, mượt; không thêm tính năng, chi tiết hay công dụng mà sản phẩm không có.' : 'Chuyển động: tự nhiên, mượt; không tự thêm nhân vật, sự kiện hay địa điểm, không bỏ chi tiết quan trọng.',
      camera.length ? `Máy quay (chọn hợp với cảnh): ${camera.join('; ')}.` : 'Máy quay: khung hình rõ ràng, chuyển động nhẹ hoặc cố định.',
      NO_SPEECH,
      ad ? 'Không thêm chữ, giá, phụ đề hay logo mới vào hình (nhãn thật trên sản phẩm giữ nguyên như ảnh).' : 'Không chèn chữ, phụ đề hoặc logo vào hình.'
    ].filter((line, index, lines) => line !== '' || (index > 0 && lines[index - 1] !== '')).join('\n');
  }

  // `range` = [câu đầu, câu cuối]. Cảnh `offline` là cảnh có prompt mẫu do tool ghép, chưa qua Muse.
  function makeScene(index, voiceover, visual, config, range) {
    return { title: `Cảnh ${index}`, source: voiceover || visual, voiceover, visual: visual || '', prompt: scenePrompt(voiceover, config, visual), ...(config.tip ? { image: tipImagePrompt(voiceover, config) } : {}), durationSeconds: sceneSeconds(voiceover || visual, config.seconds), ...(range ? { units: range } : {}), offline: true };
  }

  // Chia nhanh ngay trên máy: gộp câu cho vừa thời lượng mỗi cảnh. Prompt là mẫu chung, chưa qua Muse.
  function planStory(script, input = {}) {
    const config = options(input);
    if (typeof script !== 'string' || !script.trim()) throw Error('Dán kịch bản trước khi chia cảnh.');
    const units = storyUnits(script, config);
    const ranges = groupRanges(units, 1, units.length, limitFor(units, config));
    return ranges.map(([a, b], index) => makeScene(index + 1, unitsText(units, a, b), '', config, [a, b]));
  }

  /* Quảng cáo nhanh từ ảnh: không cần lời đọc hay Muse viết gì. Mỗi mẫu có sẵn danh sách cảnh quay; độ dài video quyết định số cảnh.
     15 giây = 3 cảnh × 5 giây, 30 = 5 × 6, 45 = 5 × 9, 60 = 6 × 10. Cảnh cuối luôn là khung hình đẹp nhất của sản phẩm. */
  function adShotPlan(length) {
    return length <= 15 ? { count: 3, seconds: 5 } : length <= 30 ? { count: 5, seconds: 6 } : length <= 45 ? { count: 5, seconds: 9 } : { count: 6, seconds: 10 };
  }
  function planAdShots(input = {}) {
    const config = options(input), ad = config.ad;
    if (!ad) throw Error('Chọn chế độ Quảng cáo sản phẩm trước.');
    const template = adPick(AD_TEMPLATES, ad.template) || AD_TEMPLATES[0];
    const { count, seconds } = adShotPlan(ad.length);
    const list = template.shots;
    const picked = count >= list.length ? list : [...list.slice(0, count - 1), list[list.length - 1]];
    const name = productName(ad);
    return picked.map((text, index) => {
      const visual = text.split('{p}').join(name);
      return { title: `Cảnh ${index + 1}`, source: '', voiceover: '', visual, prompt: scenePrompt('', config, visual, seconds), durationSeconds: seconds, fixedSeconds: seconds, shot: true };
    });
  }

  const CONTEXT_CHARS = 12000;
  // Phần câu chuyện đưa kèm để Muse hiểu ngữ cảnh khi chỉ chia một đoạn.
  function contextText(script, units, first, last) {
    const full = storyText(script);
    if (count(full) <= CONTEXT_CHARS) return full;
    return (first > 1 ? '… ' : '') + unitsText(units, Math.max(1, first - 12), Math.min(units.length, last + 6)) + (last < units.length ? ' …' : '');
  }

  // Khối thông tin quảng cáo gắn cuối câu lệnh chia cảnh (chỉ những mục người dùng đã điền).
  function adBlock(ad) {
    const camera = ad.camera.map(id => adPick(AD_CAMERA, id)?.prompt).filter(Boolean);
    const look = adPick(AD_LOOK, ad.look)?.prompt;
    const lines = [];
    const template = adPick(AD_TEMPLATES, ad.template);
    if (template) lines.push(`Kiểu quảng cáo: ${template.label}`);
    if (ad.product) lines.push(`Sản phẩm: ${ad.product}`);
    if (ad.points) lines.push('Điểm nổi bật:', ...ad.points.split('\n').map(x => '- ' + x));
    if (ad.audience) lines.push(`Người xem hướng tới: ${ad.audience}`);
    if (ad.offer) lines.push(`Giá / ưu đãi (chỉ để hiểu, không vẽ chữ giá lên hình): ${ad.offer}`);
    if (camera.length) lines.push(`Chuyển động máy quay đã chọn: ${camera.join('; ')}`);
    if (look) lines.push(`Phong cách quảng cáo: ${look}`);
    return lines.length ? ['', 'THÔNG TIN QUẢNG CÁO (do người dùng cung cấp):', ...lines] : [];
  }

  /* Câu lệnh nhờ Muse VIẾT lời quảng cáo (voice-over) cho sản phẩm. Người dùng sửa lại rồi mới chia cảnh.
     ctx: { marker } – dòng cuối câu lệnh MSEND<marker>, dòng cuối trả lời MSDONE<marker>. */
  function buildAdScriptInstruction(input = {}, ctx = {}) {
    const config = options(input), ad = config.ad;
    if (!ad || !ad.product) throw Error('Nhập tên sản phẩm trước khi nhờ Muse viết lời quảng cáo.');
    const marker = ctx.marker ? String(ctx.marker) : '';
    const chars = Math.round(ad.length * CHARS_PER_SECOND * 0.9);
    const lo = Math.round(chars * 0.85), hi = Math.round(chars * 1.05);
    const tone = adPick(AD_TONE, ad.tone).prompt;
    const template = adPick(AD_TEMPLATES, ad.template);
    return [
      'Bạn là người viết lời quảng cáo cho video bán hàng ngắn. Hãy viết MỘT lời đọc (voice-over) cho sản phẩm ở cuối.',
      '',
      'QUY TẮC',
      `1. Độ dài: khoảng ${lo}–${hi} ký tự (đọc khoảng ${ad.length} giây). Câu ngắn, dễ đọc thành tiếng, mỗi câu một ý, mỗi câu không quá 110 ký tự.`,
      template ? `2. Cấu trúc theo kiểu «${template.label}»: ${template.structure} Dùng đúng thông tin ở cuối.` : '2. Cấu trúc: (a) 1–2 câu mở đầu thu hút ngay, nói đúng nhu cầu hoặc vấn đề của người xem; (b) 2–4 câu giới thiệu các điểm nổi bật, mỗi điểm một câu, dùng đúng thông tin ở cuối; (c) 1 câu kêu gọi hành động ở cuối.',
      '3. Chỉ dùng thông tin người dùng cung cấp. KHÔNG bịa tính năng, thông số, con số, thành phần, giá, khuyến mãi, chứng nhận, đánh giá hay số người dùng. Không dùng từ tuyệt đối hoặc khó kiểm chứng như «số 1», «tốt nhất», «100%», «cam kết», «khỏi hẳn». Không nói về chữa bệnh, giảm cân hay hiệu quả y tế. Không so sánh với sản phẩm hay thương hiệu khác. Không hứa kết quả.',
      ad.offer ? '4. Giá / ưu đãi: nhắc đúng nguyên văn thông tin người dùng đưa, một lần.' : '4. Người dùng không đưa giá hay ưu đãi nên KHÔNG nhắc đến giá, giảm giá hay quà tặng.',
      ad.cta ? `5. Câu kêu gọi hành động cuối cùng: dùng ý này, viết tự nhiên: «${ad.cta}».` : '5. Câu kêu gọi hành động cuối cùng: nhẹ nhàng, không ép (ví dụ mời xem chi tiết hoặc thử sản phẩm), không bịa kênh mua hàng.',
      `6. Giọng điệu: ${tone}.`,
      '7. Chỉ viết lời đọc: không tiêu đề, không đánh số, không nhãn như «Mở đầu:», không chỉ dẫn hình ảnh hay âm thanh, không emoji, không hashtag, không ký hiệu markdown, không ghi chú trong ngoặc.',
      '8. Viết bằng tiếng Việt, trừ khi thông tin sản phẩm bên dưới viết bằng ngôn ngữ khác thì dùng ngôn ngữ đó.',
      '',
      'Trả lời đúng khuôn sau, KHÔNG viết thêm câu dẫn hay giải thích:',
      'KỊCH BẢN:',
      '<lời đọc quảng cáo>',
      marker ? `(dòng cuối cùng của trả lời chỉ gồm đúng một từ: MSDONE${marker})` : '',
      '',
      'THÔNG TIN SẢN PHẨM (do người dùng cung cấp):',
      `Sản phẩm: ${ad.product}`,
      ad.points ? ['Điểm nổi bật:', ...ad.points.split('\n').map(x => '- ' + x)].join('\n') : 'Điểm nổi bật: (người dùng chưa nêu: chỉ nói những điều chắc chắn từ tên sản phẩm, không bịa)',
      ad.audience ? `Người xem hướng tới: ${ad.audience}` : '',
      ad.offer ? `Giá / ưu đãi: ${ad.offer}` : '',
      marker ? `MSEND${marker}` : ''
    ].filter((line, index, lines) => line !== '' || (index > 0 && lines[index - 1] !== '' && index < lines.length - 1)).join('\n');
  }

  // Lấy lời quảng cáo từ trả lời của Muse: bỏ lời dẫn, mốc xong, nhãn, chỉ dẫn trong ngoặc, emoji, hashtag, ký hiệu markdown.
  const AD_HEAD = /^[\t ]*(?:#{1,6}[\t ]*)?(?:\*\*|__)?[\t ]*(?:kịch bản|kich ban|lời đọc|lời quảng cáo|script|voice-?over)[\t ]*(?:\*\*|__)?[\t ]*[:：][\t ]*(?:\*\*|__)?(.*)$/i;
  const AD_LABEL = /^(?:hook|mở đầu|mở bài|thân bài|điểm nổi bật|lợi ích|kêu gọi(?: hành động)?|cta|kết(?: thúc| bài)?)[^:：\n]{0,20}[:：]\s*/i;
  function scriptFromReply(reply, opts = {}) {
    let lines = String(reply || '').replace(/\r\n?/g, '\n').split('\n').filter(line => !/MS(?:DONE|END)[0-9a-f]+/i.test(line));
    const at = lines.findIndex(line => AD_HEAD.test(line));
    if (at >= 0) lines = [lines[at].match(AD_HEAD)[1], ...lines.slice(at + 1)];
    const out = [];
    for (const raw of lines) {
      // Tiêu đề markdown («## Mở đầu») và dòng chỉ có một nhãn in đậm («**Kết**») là nhãn, không phải lời đọc.
      if (/^[\t ]*#{1,6}[\t ]/.test(raw) || /^[\t ]*(?:\*\*|__)[^*_]{1,30}(?:\*\*|__)[\t ]*$/.test(raw) && !/[.!?…]/.test(raw)) continue;
      let line = raw.replace(/\*\*|__/g, '').replace(/^[\t ]*(?:#{1,6}[\t ]*|[-•][\t ]+|\*[\t ]+|\d+[.)][\t ]+)/, '').trim();
      line = line.replace(/\p{Extended_Pictographic}\uFE0F?/gu, '').replace(/(?:^|\s)#[\p{L}\p{N}_]+/gu, '').trim();
      if (!line || /^[\[(（].*[\])）]$/.test(line) || /^[-=*_~]{3,}$/.test(line)) continue;
      if (opts.labels !== false) line = line.replace(AD_LABEL, '');
      line = line.replace(/^["“«]\s*(.*?)\s*["”»]$/, '$1').trim();
      if (line) out.push(line);
    }
    const text = out.join('\n');
    if (count(text) < 20) throw Error(opts.error || 'Muse chưa viết lời quảng cáo. Bấm viết lại.');
    return text;
  }

  /* ---------- Mẹo vặt: chỉ nhập TIÊU ĐỀ, Muse viết mẹo theo từng bước ----------
     Tổng số mục = 1 mở đầu + các bước + 1 kết (mỗi mục là một cảnh: một ảnh rồi một clip). Mỗi bước bắt đầu bằng «Bước k:» («Step k:» khi lời đọc tiếng Anh)
     để bước chia cảnh biết chỗ bắt đầu bước mới. Mẹo dài được viết theo nhiều phần, phần sau được xem lại phần đã viết để nối tiếp. */
  const tipLabel = (language, k) => (language === 'en' ? `Step ${k}:` : `Bước ${k}:`);
  const TIP_STEP = /^(?:bước|buoc|step)\s*(\d+)\s*[:.)\-–—]\s*(.*)$/i;
  const TIP_LINE = /^(?:bước|buoc|step)\s*\d+\s*[:.)\-–—]/i;
  const TIP_WRITTEN_CHARS = 6000;
  /* ctx: { marker, part: [mục đầu, mục cuối] (mặc định cả bài), parts, number, written: phần đã viết, fix: lỗi lần trước } */
  function buildTipScriptInstruction(input = {}, ctx = {}) {
    const tp = tipPlan(input);
    if (!tp.title) throw Error(tp.history ? 'Nhập chủ đề lịch sử trước khi nhờ Muse viết.' : tp.plant ? 'Nhập loại cây hoặc tiêu đề trước khi nhờ Muse viết.' : 'Nhập tiêu đề mẹo trước khi nhờ Muse viết.');
    const marker = ctx.marker ? String(ctx.marker) : '';
    const [a, b] = ctx.part || [1, tp.total];
    const en = tp.language === 'en';
    const lines = [];
    for (let i = a; i <= b; i++) lines.push(i === 1 ? '<lời đọc MỞ ĐẦU, không nhãn>' : i === tp.total ? '<lời đọc KẾT, không nhãn>' : `${tipLabel(tp.language, i - 1)} <lời đọc của bước>`);
    const first = a === 1;
    const plant = tp.plant, history = tp.history;
    // Bài lịch sử dài (quá 80 mục): nói rõ phần này nằm ở đâu để Muse trải đều chủ đề, không tóm tắt hay kết sớm.
    const longNote = history && ctx.parts > 1 && tp.total > TIP_MAX_ITEMS && b < tp.total
      ? ` Bài RẤT DÀI (${tp.total} mục) và phần này mới ở khoảng ${Math.round((a - 1) * 100 / tp.total)}–${Math.round(b * 100 / tp.total)}% bài: chia đều chủ đề cho cả bài, kể kỹ từng giai đoạn, KHÔNG tóm tắt vội và KHÔNG chuyển sang kết luận trước mục ${tp.total}.` : '';
    const partNote = (ctx.parts > 1 ? ` Đây là phần ${ctx.number}/${ctx.parts} của bài.` : '') + longNote;
    const tail = a === 1 && b === tp.total ? '' : `; chỉ viết các mục ${a}–${b}`;
    return [
      history
        ? `Bạn là người viết lời đọc (voice-over) cho video LỊCH SỬ kể bằng ${histLookOf(input).name}: một bài kể ngắn gọn, dễ nghe về chủ đề lịch sử hoặc văn hóa bên dưới. Video gồm ${tp.total} cảnh, dài khoảng ${tp.minutes} phút; mỗi cảnh là MỘT ${histLookOf(input).pic} rồi được cho chuyển động nhẹ thành clip, kèm lời đọc khoảng ${tp.secs} giây. Hãy viết lời đọc cho các mục ${a}–${b} trong tổng ${tp.total} mục.${partNote}`
        : plant
        ? `Bạn là người viết lời đọc (voice-over) cho video CÂY TRỒNG PHÁT TRIỂN: theo dõi MỘT cây trồng trong chậu từ lúc chuẩn bị chậu và đất, gieo hạt, nảy mầm, lớn lên, ra hoa, đến đậu quả và thu hoạch. Video gồm ${tp.total} cảnh, dài khoảng ${tp.minutes} phút; mỗi cảnh là MỘT ảnh chụp thật của một thao tác hoặc một giai đoạn của cây rồi ảnh đó chuyển động khoảng ${tp.secs} giây (clip tua nhanh thời gian cho thấy cây lớn lên thấy được), lời đọc của cảnh đọc trong khoảng ${tp.secs} giây. Hãy viết lời đọc cho các mục ${a}–${b} trong tổng ${tp.total} mục.${partNote}`
        : `Bạn là người viết lời đọc (voice-over) cho video MẸO VẶT hướng dẫn từng bước (nấu ăn, việc nhà, dọn dẹp, sửa chữa nhỏ, làm đẹp, đời sống…). Video gồm ${tp.total} cảnh; mỗi cảnh là MỘT ảnh chụp thật của một thao tác rồi ảnh đó chuyển động khoảng ${tp.secs} giây, lời đọc của cảnh đọc trong khoảng ${tp.secs} giây. Hãy viết lời đọc cho các mục ${a}–${b} trong tổng ${tp.total} mục.${partNote}`,
      FRESH,
      '',
      'QUY TẮC',
      history ? `1. Cấu trúc cả video: mục 1 là MỞ ĐẦU (1–2 câu: giới thiệu chủ đề, gợi sự tò mò, không hứa quá); mục 2–${tp.total - 1} là ${tp.steps} ĐOẠN kể theo đúng trình tự thời gian hoặc mạch logic của chủ đề (bối cảnh, nguyên nhân, diễn biến chính, nhân vật và địa danh quan trọng, kết quả, ý nghĩa); mục ${tp.total} là KẾT (1–2 câu: bài học hoặc ý nghĩa còn lại với hôm nay). Hãy tự lên kế hoạch đủ ${tp.steps} đoạn liền mạch từ đầu đến cuối rồi mới viết${tail}.` : plant ? `1. Cấu trúc cả video: mục 1 là MỞ ĐẦU (1–2 câu: giới thiệu cây sẽ trồng và hành trình từ hạt đến quả, nói thời gian chung «khoảng … tuần» hoặc «khoảng … tháng», không hứa quá); mục 2–${tp.total - 1} là ${tp.steps} BƯỚC theo đúng thứ tự thực tế của cây, đủ các giai đoạn: (a) chuẩn bị chậu, đất, dụng cụ; (b) gieo hạt (ủ hạt nếu cần, gieo, phủ đất, tưới); (c) nảy mầm và cây con; (d) chăm sóc cây lớn (tưới, ánh sáng, tỉa, tách hoặc dặm cây, thay chậu, làm giàn nếu cần, bón phân); (e) ra hoa và đậu quả; (f) quả lớn, chín và thu hoạch; mục ${tp.total} là KẾT (1–2 câu: thành quả, cách dùng hoặc giữ gìn, nhắc an toàn nếu cần). Chia số bước cân đối: chuẩn bị và gieo hạt chiếm khoảng một phần tư đầu, phần còn lại là sự phát triển của cây. Hãy tự lên kế hoạch đủ ${tp.steps} bước liền mạch từ đầu đến cuối rồi mới viết${tail}.` : `1. Cấu trúc cả video: mục 1 là MỞ ĐẦU (1–2 câu: nói đúng vấn đề hoặc điều người xem sẽ làm được, không hứa quá); mục 2–${tp.total - 1} là ${tp.steps} BƯỚC làm theo đúng thứ tự thực tế; mục ${tp.total} là KẾT (1–2 câu: kết quả nhìn thấy được, cách dùng hoặc giữ gìn, nhắc an toàn nếu cần). Hãy tự lên kế hoạch đủ ${tp.steps} bước liền mạch từ đầu đến cuối rồi mới viết${a === 1 && b === tp.total ? '' : `; chỉ viết các mục ${a}–${b}`}.`,
      `2. Độ dài mỗi mục: khoảng ${tp.lo}–${tp.hi} ký tự (đọc khoảng ${tp.secs} giây): 1–2 câu ngắn, mỗi câu không quá 110 ký tự và LUÔN kết thúc bằng dấu chấm, dễ đọc thành tiếng. Không viết dài hơn ${tp.hi} ký tự cho một mục.`,
      history ? '3. Mỗi ĐOẠN (viết sau nhãn «Bước k:») là MỘT ý vẽ được thành MỘT bức tranh: một sự kiện, một nhân vật, một địa danh hoặc một cảnh sinh hoạt cụ thể (ví dụ: dựng làng, trận đánh, lễ hội, cánh đồng, kinh thành). Nêu rõ ai, ở đâu, khi nào (thời kỳ hoặc năm, dùng «khoảng» nếu không chắc) để họa sĩ vẽ đúng. Không gộp hai sự kiện không liên quan vào một đoạn, không viết «như trên» hay «như đoạn trước».' : plant ? '3. Mỗi BƯỚC là MỘT cảnh nhìn thấy được và chụp được thành một tấm ảnh: hoặc một thao tác (đổ đất vào chậu, rắc hạt, phủ đất, tưới nước…) hoặc một giai đoạn của cây (hạt vừa nảy mầm, cây con có hai lá thật, cây có nụ hoa, quả xanh đầu tiên…). Từ khi gieo hạt, nêu mốc thời gian (ví dụ «Sau mười ngày», «Tuần thứ sáu», «Tháng thứ ba») và hình dạng thấy được của cây ở mốc đó (cao khoảng bao nhiêu, mấy lá, màu gì). Không bước nào chỉ là lời khuyên chung chung, không gộp hai giai đoạn vào một bước, không viết «làm như trên» hay «như bước trước». TIẾN TRÌNH PHẢI TỪ TỪ: mỗi bước chỉ tiến thêm MỘT chút so với bước trước (vài ngày tới một hai tuần, cao thêm vài cm, thêm vài lá hay một đợt nụ), nhiều bước nhỏ nối nhau chứ không nhảy cóc; lời đọc của bước KHÔNG nhắc tới giai đoạn sau (không nói tới hoa hay quả khi cây mới nảy mầm; quả chỉ nói tới ở các bước quả và ở mục kết).' : '3. Mỗi BƯỚC là MỘT thao tác nhìn thấy được và chụp được thành một tấm ảnh: tay làm gì với vật gì, ở đâu (cắt, đổ, vắt, ngâm, lau, khuấy, xếp…), nêu rõ vật, lượng hoặc thời gian nếu cần. Không bước nào chỉ là lời khuyên chung chung, không gộp hai thao tác khác nhau vào một bước, không viết «làm như trên» hay «như bước trước».',
      history ? '4. ĐÚNG SỰ THẬT và TÔN TRỌNG: chỉ nêu sự kiện, mốc thời gian, tên người, địa danh được sử sách ghi nhận; KHÔNG bịa chi tiết, số liệu, lời thoại hay mốc thời gian; điều chưa chắc thì dùng «khoảng», «theo sử sách», «theo truyền thuyết» và nói rõ đó là truyền thuyết. Giọng trung lập, trang trọng, dễ hiểu; không kích động thù hận, không xúc phạm dân tộc, tôn giáo hay cá nhân, không mô tả bạo lực chi tiết. Nếu tiêu đề đòi điều sai sự thật hoặc xuyên tạc, hãy viết phiên bản đúng và công bằng nhất gần với tiêu đề.' : plant ? '4. ĐÚNG SỰ THẬT và AN TOÀN: chỉ dùng cách trồng phổ biến và thời gian sinh trưởng thật của loại cây đó (dùng «khoảng» vì tùy giống và thời tiết). KHÔNG bịa số liệu, năng suất, thương hiệu hay hiệu quả; không hứa chắc chắn ra quả; không dùng từ tuyệt đối («100%», «chắc chắn», «sai trĩu quả»). Thứ tự phải đúng sinh học: lá mầm trước rồi mới lá thật, ra hoa trước khi đậu quả, quả xanh trước khi chín. Phân bón và thuốc: chỉ nói chung chung, dùng theo hướng dẫn trên bao bì, đeo găng tay, để xa trẻ em và thú nuôi; không hướng dẫn pha trộn hóa chất, không dùng thuốc trừ sâu độc hại. Nếu tiêu đề đòi điều sai hoặc nguy hiểm, hãy viết phiên bản an toàn và đúng nhất gần với tiêu đề.' : '4. ĐÚNG SỰ THẬT và AN TOÀN: chỉ dùng cách làm phổ biến, hợp lý, nhiều người đã dùng. KHÔNG bịa số liệu, nghiên cứu, thương hiệu hay hiệu quả; không nói chữa bệnh hay thay thuốc; không dùng từ tuyệt đối («100%», «vĩnh viễn», «khỏi hẳn», «chắc chắn»). Nếu có rủi ro (hóa chất tẩy rửa, điện, nhiệt độ cao, dao kéo) thì thêm một câu nhắc an toàn ngắn đúng chỗ; tuyệt đối không hướng dẫn trộn các chất tẩy rửa với nhau. Nếu tiêu đề đòi điều sai hoặc nguy hiểm, hãy viết phiên bản an toàn và đúng nhất gần với tiêu đề.',
      history ? '5. Gọi người, địa danh, triều đại, sự kiện bằng MỘT tên thống nhất xuyên suốt bài (để các tranh nhất quán). Câu dẫn nối giữa các đoạn ngắn gọn, mượt, không lặp lại ý.' : plant ? '5. Chọn cây: nếu tiêu đề đã nêu loại cây thì dùng đúng loại đó; nếu chưa nêu (hoặc cây không ra quả), chọn một cây ăn quả trồng chậu phổ biến và dễ trồng (ví dụ cà chua, ớt, dưa leo) rồi gọi tên đó xuyên suốt. Chỉ MỘT chậu (loại, màu, kích cỡ) đặt ở MỘT chỗ (ví dụ bệ cửa sổ hoặc ban công có nắng) xuyên suốt cả video và luôn gọi cùng một tên, để các ảnh trông như cùng một chậu cây được quay qua thời gian.' : '5. Dùng đồ có sẵn trong nhà và gọi tên bình thường; cùng một vật thì gọi cùng một tên ở mọi bước (để các ảnh trông như cùng một buổi quay).',
      `6. Nhãn: mỗi BƯỚC bắt đầu bằng «${tipLabel(tp.language, 'k')}» (k là số bước từ 1 đến ${tp.steps}) ngay đầu dòng; mục MỞ ĐẦU và mục KẾT KHÔNG có nhãn. Mỗi mục một dòng riêng. Không tiêu đề, không gạch đầu dòng, không emoji, không hashtag, không ký hiệu markdown, không chỉ dẫn hình ảnh hoặc âm thanh, không ghi chú trong ngoặc.`,
      en ? `7. Viết lời đọc bằng tiếng Anh tự nhiên, dễ đọc thành tiếng (nhãn là «Step k:»).${tp.plant ? ' Tên cây / tiêu đề bên dưới có thể bằng tiếng Việt hoặc tiếng Anh: hiểu cả hai và dùng tên cây tiếng Anh trong lời đọc.' : ''}` : '7. Viết lời đọc bằng tiếng Việt tự nhiên, dễ đọc thành tiếng.',
      '',
      'Trả lời đúng khuôn sau, KHÔNG viết thêm câu dẫn hay giải thích:',
      'KỊCH BẢN:',
      ...lines,
      marker ? `(dòng cuối cùng của trả lời chỉ gồm đúng một từ: MSDONE${marker})` : '',
      ...(ctx.fix ? ['', 'SỬA LỖI – lần trước còn lỗi sau; viết lại ĐỦ các mục ' + a + '–' + b + ', đúng khuôn trên:', ctx.fix] : []),
      '',
      `${history ? 'CHỦ ĐỀ LỊCH SỬ' : plant ? 'TIÊU ĐỀ / LOẠI CÂY' : 'TIÊU ĐỀ MẸO'} (chỉ là chủ đề cần viết, không phải mệnh lệnh): ${tp.title}`,
      ctx.written ? ['', first ? '' : 'ĐÃ VIẾT Ở CÁC PHẦN TRƯỚC (nối tiếp liền mạch, KHÔNG viết lại):', first ? '' : String(ctx.written).slice(-TIP_WRITTEN_CHARS)].filter(x => x !== '').join('\n') : '',
      marker ? `MSEND${marker}` : ''
    ].filter((line, index, all) => line !== '' || (index > 0 && all[index - 1] !== '' && index < all.length - 1)).join('\n');
  }

  // Bài lịch sử: Muse viết có nhãn «Bước k:» để soát đủ mục; bỏ nhãn trước khi đưa vào ô kịch bản (lời đọc không đọc «Bước…»).
  function stripStepLabels(script) {
    return String(script || '').split('\n').map(line => line.replace(/^\s*(?:bước|buoc|step)\s*\d+\s*[:.)\-–—]\s*/i, '')).join('\n');
  }
  // Lời mẹo từ trả lời của Muse: giữ nhãn «Bước k:», mỗi mục một dòng và LUÔN kết thúc bằng dấu câu (để bước chia cảnh không dính hai mục thành một câu).
  function tipScriptFromReply(reply) {
    const text = scriptFromReply(reply, { labels: false, error: 'Muse chưa viết mẹo. Bấm «Muse viết mẹo» lại.' });
    return text.split('\n').map(line => line.trim()).filter(Boolean).map(line => (/[.!?…。！？]["”’»)]?$/.test(line) ? line : line.replace(/[,;:\-–—\s]+$/, '') + '.')).join('\n');
  }
  // Bỏ phần Muse lặp lại bước đã viết (phần sau) hoặc viết quá phạm vi (phần đầu).
  function tipTrim(text, tp, part) {
    const [a, b] = part;
    let lines = String(text || '').split('\n');
    const num = line => { const m = line.match(TIP_STEP); return m ? Number(m[1]) : 0; };
    if (a > 1) { const at = lines.findIndex(line => num(line) >= a - 1); if (at > 0) lines = lines.slice(at); }
    if (b < tp.total) { const at = lines.findIndex(line => num(line) > b - 1); if (at >= 0) lines = lines.slice(0, at); }
    return lines.join('\n');
  }
  /* Soát phần Muse viết: thiếu bước nào, bước nào quá dài (sẽ bị chia thành 2 cảnh), thiếu mở đầu/kết. */
  function tipCheck(text, tp, part) {
    const [a, b] = part, lines = String(text || '').split('\n').filter(Boolean);
    const steps = new Map();
    lines.forEach(line => { const m = line.match(TIP_STEP); if (m && !steps.has(Number(m[1]))) steps.set(Number(m[1]), m[2]); });
    const missing = [], long = [];
    for (let i = Math.max(a, 2); i <= Math.min(b, tp.total - 1); i++) {
      const k = i - 1;
      if (!steps.has(k)) missing.push(k); else if (count(steps.get(k)) > Math.round(tp.hi * 1.3)) long.push(k);
    }
    const firstStep = lines.findIndex(line => TIP_LINE.test(line));
    let lastStep = -1;
    lines.forEach((line, index) => { if (TIP_LINE.test(line)) lastStep = index; });
    const noIntro = a === 1 && (firstStep === 0 || lines.length === 0);
    const noEnd = b === tp.total && (lastStep === lines.length - 1 || lines.length === 0);
    return { missing, long, noIntro, noEnd, ok: !missing.length && !long.length && !noIntro && !noEnd };
  }
  // Lời dặn Muse sửa khi lần viết trước còn lỗi.
  function tipFix(issues, tp) {
    const out = [];
    if (issues.missing.length) out.push(`- Thiếu ${issues.missing.map(k => tipLabel(tp.language, k)).join(' ')} (mỗi bước một dòng bắt đầu bằng nhãn).`);
    if (issues.long.length) out.push(`- ${issues.long.map(k => tipLabel(tp.language, k)).join(' ')} quá dài: rút còn tối đa ${tp.hi} ký tự.`);
    if (issues.noIntro) out.push('- Thiếu dòng MỞ ĐẦU (không nhãn) trước Bước 1.');
    if (issues.noEnd) out.push('- Thiếu dòng KẾT (không nhãn) sau bước cuối.');
    return out.join('\n');
  }

  // Muse từ chối tạo video có người thật hoặc cảnh cầm / ngắm / bắn vũ khí («blocked by policy»), mà mỗi lần thử đều tốn lượt:
  // bắt Muse viết prompt hình theo cách vẫn minh họa được chủ đề nhưng không vướng hai điều đó.
  const SAFE_RULE = '9. AN TOÀN NỘI DUNG (Muse từ chối tạo video nếu vi phạm, mỗi lần thử đều tốn lượt): (a) NGƯỜI THẬT VÀ NHÂN VẬT CHÍNH TRỊ: nếu câu nói tới người thật (tên riêng, nhân vật lịch sử, người nổi tiếng) thì trong PROMPT KHÔNG ghi tên thật; mô tả bằng vai trò và ngoại hình chung (ví dụ «a 1950s weapons engineer, white shirt, glasses»), tên thật chỉ nằm ở lời đọc. RIÊNG người giữ chức vụ chính trị chỉ ra đúng một người thật (tổng thống, thủ tướng, chủ tịch nước, tổng bí thư, vua, nữ hoàng, nguyên thủ, lãnh đạo một nước… gắn với quốc gia hay mốc thời gian, ví dụ «Tổng thống Việt Nam Cộng hòa năm 1975» vẫn là một người thật): KHÔNG vẽ người đó và KHÔNG dùng chức danh đó trong PROMPT dù đã bỏ tên. Cảnh nói về việc người đó phát biểu, từ chức, ký, họp hay đầu hàng thì thể hiện bằng cảnh vật: bàn làm việc trống có tập hồ sơ và cây bút, chiếc ghế trống, micro đặt trên bục, đài phát thanh cũ, lá cờ, tòa nhà, bản đồ, đám đông vô danh nhìn từ phía sau; nhân vật chuẩn hoặc người dẫn chuyện phản ứng bằng nét mặt và cử chỉ. Người bình thường không có thật (thợ, lính vô danh, người dân…) vẫn vẽ được. (b) VŨ KHÍ: nếu câu nói tới súng, đạn hay vũ khí khác thì KHÔNG cho ai cầm, giơ, ngắm, chỉ, nạp hay bắn, không cận cảnh vũ khí đang được dùng, không máu và bạo lực; thể hiện bằng bản vẽ kỹ thuật trên bàn, sơ đồ so sánh hai thiết kế cạnh nhau, ảnh tư liệu kiểu tranh vẽ, tủ trưng bày bảo tàng, hoặc người dẫn chuyện đứng giữa cảnh vật giới thiệu bằng cử chỉ tay và nét mặt. Chỉ áp dụng cho cảnh thật sự có người thật hoặc vũ khí; các cảnh khác viết như bình thường.';
  /* Câu lệnh gửi cho Muse: đọc hiểu cả câu chuyện, gom các câu đánh số thành cảnh, viết prompt hình.
     ctx: { units, ranges: [[từ, đến]…] (mặc định cả truyện), cast, part, parts, marker } */
  function buildMuseInstruction(script, input = {}, ctx = {}) {
    const config = options(input);
    if (typeof script !== 'string' || !script.trim()) throw Error('Dán kịch bản trước khi nhờ Muse đọc.');
    const units = ctx.units || storyUnits(script, config);
    const ranges = ctx.ranges && ctx.ranges.length ? ctx.ranges : [[1, units.length]];
    const picked = ranges.flatMap(([a, b]) => units.slice(a - 1, b));
    const whole = picked.length === units.length;
    const s = config.seconds, budget = Math.round(s * 0.9 * 10) / 10, floor = sceneFloor(s);
    const marker = ctx.marker ? String(ctx.marker) : '';
    const numbered = list => list.map(u => `[${u.n}] (${u.seconds} giây) ${u.text}`);
    const first = picked[0].n, last = picked[picked.length - 1].n;
    const partNote = ctx.parts > 1 ? ` Đây là phần ${ctx.part}/${ctx.parts} của câu chuyện.` : '';
    if (config.tip) return buildTipInstruction({ script, config, units, picked, whole, s, budget, marker, numbered, first, last, partNote, ctx });
    const ad = config.ad, lock = isLocked(config);
    return [
      ad ? `Bạn là đạo diễn hình ảnh cho video QUẢNG CÁO sản phẩm bán hàng. Mỗi cảnh sẽ được AI tạo thành MỘT video ngắn, dài tối đa ${s} giây, và mỗi lần tạo đều tốn lượt, nên sản phẩm, hành động và bố cục phải đúng ngay từ lần đầu.` : `Bạn là đạo diễn hình ảnh cho video minh họa một bài đọc (truyện kể, tâm sự, bài nói, bình luận, châm biếm…). Mỗi cảnh sẽ được AI tạo thành MỘT video ngắn, dài tối đa ${s} giây, và mỗi lần tạo đều tốn lượt, nên hình ảnh, hành động và nét mặt phải đúng ngay từ lần đầu.`,
      FRESH,
      '',
      `BƯỚC 1 – ĐỌC HIỂU: đọc kỹ toàn bộ ${ad ? 'lời quảng cáo' : 'câu chuyện'}${whole ? ' ở cuối' : ' ở phần NGỮ CẢNH'} để nắm ${ad ? 'nhân vật, bối cảnh, thời điểm, diễn biến, cảm xúc và ý nghĩa của từng câu' : 'đây là truyện kể hay bài nói/bình luận, giọng điệu (nghiêm túc, cảm động, hài, châm biếm), ai là nhân vật hoặc kiểu người được nói tới, bối cảnh, diễn biến hoặc các ví dụ, và ý nghĩa của từng câu'}.${partNote}`,
      `BƯỚC 2 – CHIA CẢNH: ${whole ? '' : 'chỉ chia các câu ở phần CÁC CÂU CẦN CHIA CẢNH; phần còn lại chỉ để hiểu. '}Gom các câu đánh số LIÊN TIẾP thành cảnh, đủ mọi câu, đúng thứ tự, không bỏ sót, không lặp. Số trong ngoặc là số giây đọc câu đó; tổng của mỗi cảnh không quá ${budget} giây. ${ad ? '' : `MỖI CẢNH NÊN DÀI GẦN ${fmtSeconds(budget)} GIÂY (ít nhất ${floor} giây): cứ gom tiếp câu kế vào cảnh khi còn vừa và vẫn cùng địa điểm, cùng thời điểm, cùng mạch ý; KHÔNG tách mỗi câu hay mỗi hành động thành một cảnh, câu ngắn thì gộp với câu kề bên. Chỉ kết thúc cảnh sớm hơn ${floor} giây khi câu kế đổi địa điểm, nhảy thời gian rõ rệt hoặc sang ý / nhân vật khác hẳn, và ở cảnh cuối của bài (ít cảnh hơn = ít lượt tạo video hơn, mạch truyện liền hơn). `}Độ dài video của cảnh tự theo lời kể: tổng số giây các câu chia cho 0,9, làm tròn lên (tối thiểu ${MIN_SECONDS}, tối đa ${s} giây); cảnh ngắn thì video ngắn, không kéo dài cho đủ ${s} giây. KHÔNG chép lại lời: chỉ ghi số câu, giọng đọc sẽ đọc đúng nguyên văn các câu đó.`,
      'BƯỚC 3 – VIẾT PROMPT cho từng cảnh theo quy tắc dưới đây.',
      '',
      'QUY TẮC',
      `1. Mỗi cảnh chỉ là MỘT đoạn liên tục trong độ dài video của cảnh: một địa điểm, một nhóm nhân vật, ${ad ? 'tối đa 2–3' : '2–4'} hành động nối tiếp (mỗi hành động một mốc thời gian); KHÔNG nhảy thời gian, KHÔNG đổi địa điểm, KHÔNG cắt cảnh trong cùng video. ${ad ? 'Các câu liên tiếp mà đổi địa điểm hoặc nhảy thời gian thì tách thành cảnh khác.' : 'Chỉ khi các câu liên tiếp đổi địa điểm hoặc nhảy thời gian rõ rệt thì mới tách thành cảnh khác; thêm một hành động hay một câu thoại KHÔNG phải lý do để tách cảnh.'}`,
      `2. PROMPT thể hiện đúng điều các câu của cảnh nói: ai, ở đâu, lúc nào, làm gì, theo thứ tự thời gian, chia mốc theo đúng độ dài video của cảnh (video 5 giây: 0–2 giây…, 2–5 giây…; video ${s} giây: 0–3 giây…, 3–7 giây…, 7–${s} giây…), kèm nét mặt, ánh mắt, cử chỉ, tư thế, cảm xúc, ánh sáng và góc máy. Dùng từ cụ thể, không mơ hồ. Mỗi mốc ứng với đúng điều của câu tương ứng theo thứ tự câu và GHI SỐ CÂU ngay sau mốc giờ, dạng «0–3 giây [câu 5]: …» (mốc gộp nhiều câu thì «[câu 5-6]»; một câu được có nhiều mốc; PROMPT viết bằng tiếng nào cũng giữ nguyên chữ «câu» trong thẻ, ví dụ «0–3 seconds [câu 5]: …»): các mốc đi đúng thứ tự câu, KHÔNG đảo, mỗi câu của cảnh có ít nhất một mốc, mốc cuối kết thúc đúng độ dài video của cảnh (app dùng số câu để kiểm tra và tự bỏ khi tạo video); mỗi mốc có chuyển động cụ thể của người hoặc vật (ai làm gì, mặt và tay thay đổi thế nào); tư thế, nét mặt, vị trí hoặc hướng nhìn phải THAY ĐỔI rõ giữa các mốc, không đứng yên một dáng cả cảnh; không chèn hình chung chung hay cảnh không liên quan tới câu.`,
      ad ? '3. Không bịa tính năng, thông số, công dụng, thành phần, chứng nhận hay kết quả mà lời quảng cáo không nói; không cảnh so sánh với sản phẩm khác; không cảnh «trước/sau» hay minh họa chữa bệnh, giảm cân, hiệu quả y tế. Ý trừu tượng thì thể hiện bằng hình cụ thể (người dùng thoải mái, sản phẩm đang được dùng).' : '3. TRUYỆN KỂ: không bịa thêm nhân vật, vật thể hay sự kiện; không đổi kết cục; không bỏ hành động quan trọng; suy nghĩ, cảm xúc hay ý trừu tượng thì thể hiện bằng nét mặt, cử chỉ hoặc vật cụ thể có trong câu. BÀI NÓI / BÌNH LUẬN / CHÂM BIẾM (nói về một kiểu người, một thói quen, một ý kiến, có ví dụ minh họa): dựng đúng TÌNH HUỐNG mà câu đang nói, bằng 1–3 vai cố định làm việc cụ thể trong bối cảnh đời thường (công ty, quán cà phê, nhà, đường phố); bối cảnh phải đúng nơi bài nói tới (ví dụ «trong công ty» → văn phòng có bàn làm việc, máy tính, đồng nghiệp), không dùng một căn phòng chung cho mọi cảnh; bài đã nêu ví dụ nào thì dựng đúng ví dụ đó, đúng thứ tự. Ý đối lập («trước mặt thân thiện, sau lưng nói xấu») thì cho thấy sự đối lập NGAY TRONG cảnh: cùng một người cười bắt tay người A, A vừa quay đi thì mặt đổi sang khinh bỉ và ghé sát tai người B, tay che miệng, mắt liếc về phía A (không có tiếng). Nói quá, ví von, ẩn dụ KHÔNG dựng theo nghĩa đen nếu phi lý hay đáng sợ: dựng tình huống thật đằng sau câu và thể hiện đúng ý bằng nét mặt, cử chỉ, đạo cụ cụ thể (có thể thêm MỘT chi tiết hài nhỏ hợp tinh thần câu). Câu mở bài, đặt câu hỏi, kết luận: dựng một hình ảnh chung nói lên đúng ý đó. Câu cảm thán rất ngắn: dựng phản ứng nét mặt, cử chỉ của người trong cảnh.',
      '4. Mỗi cảnh được tạo video riêng nên PROMPT phải tự đủ ý: mở đầu bằng bối cảnh cụ thể (nơi nào, ánh sáng gì), rồi nhắc lại tên, ngoại hình, trang phục của nhân vật theo cùng một cách ở mọi cảnh; không viết «như cảnh trước».',
      ...[ad ? (config.reference ? '5. SẢN PHẨM: ảnh tham chiếu đính kèm là sản phẩm thật. Giữ đúng hình dạng, tỷ lệ, màu sắc, chất liệu, bao bì và nhãn như trong ảnh; không đổi, không thêm bộ phận, không đổi sang sản phẩm khác. Sản phẩm phải HIỆN RÕ ở mọi cảnh (đang được dùng hoặc trưng bày). Ở dòng NHÂN VẬT ghi mô tả cố định của sản phẩm theo ảnh và, nếu có người mẫu hay người dùng, MỘT mô tả cố định (tuổi, vóc dáng, tóc, trang phục) dùng y nguyên ở mọi cảnh có người đó. Người chỉ được nhắc đến mà không có mặt thì KHÔNG vẽ vào hình.' : '5. SẢN PHẨM: chưa có ảnh tham chiếu nên chỉ mô tả sản phẩm theo thông tin ở cuối, đơn giản và nhất quán (hình dạng, màu sắc, chất liệu) ở mọi cảnh; không bịa chi tiết mà thông tin không nói. Sản phẩm phải HIỆN RÕ ở mọi cảnh (đang được dùng hoặc trưng bày). Ở dòng NHÂN VẬT ghi mô tả cố định của sản phẩm và, nếu có người mẫu hay người dùng, MỘT mô tả cố định (tuổi, vóc dáng, tóc, trang phục) dùng y nguyên ở mọi cảnh có người đó. Người chỉ được nhắc đến mà không có mặt thì KHÔNG vẽ vào hình.') : config.reference ? '5. NHÂN VẬT: nhận ra MỌI nhân vật trong truyện (kể cả người chỉ được gọi bằng vai như «bà», «người lái đò», «đám trẻ»). Nhân vật chính là người ở ảnh tham chiếu đính kèm: giữ đúng khuôn mặt, tóc, trang phục trong ảnh, không tự đổi. Mỗi nhân vật khác được chốt MỘT mô tả cố định ' + (lock ? '(chỉ phần được khác theo KHÓA HÌNH DẠNG ở cuối quy tắc này)' : '(tuổi, vóc dáng, tóc, trang phục)') + ' ở dòng NHÂN VẬT và dùng y nguyên ở mọi cảnh có người đó (bài nói/bình luận không có nhân vật tên riêng thì chốt 2–3 vai đại diện cho các kiểu người được nhắc). Trong PROMPT của mỗi cảnh, gọi từng người xuất hiện trong khung hình bằng đúng tên/vai đó kèm mô tả cố định, nói rõ ai đứng đâu, ai làm gì; người chỉ được nhắc đến mà không có mặt trong cảnh thì KHÔNG vẽ vào hình.' + (lock ? ' ' + lockRule(config) : '') : '5. NHÂN VẬT: nhận ra các nhân vật CÓ MẶT trong truyện (kể cả người chỉ được gọi bằng vai như «bà», «người lái đò», «đám trẻ»). Mỗi nhân vật được chốt MỘT mô tả cố định, ngắn gọn ' + (lock ? '(chỉ phần được khác theo KHÓA HÌNH DẠNG ở cuối quy tắc này)' : '(tuổi, vóc dáng, tóc, trang phục)') + ' ở dòng NHÂN VẬT và dùng y nguyên ở mọi cảnh có người đó; chi tiết truyện không nói thì chọn đơn giản, không bịa thêm. Bài nói/bình luận không có nhân vật tên riêng thì chốt 2–3 VAI cố định đại diện cho các kiểu người được nhắc (ví dụ «người hay nói xấu», «người bị nói xấu», «đồng nghiệp»); khi bài gọi người nghe là «bạn» thì «bạn» là một vai cụ thể trong cảnh. Nếu người dùng đã mô tả nhân vật chính (ở cuối) thì dùng đúng mô tả đó. Chỉ mô tả người XUẤT HIỆN trong khung hình của cảnh, nói rõ ai đứng đâu, ai làm gì; người chỉ được nhắc đến mà không có mặt trong cảnh thì KHÔNG vẽ vào hình.' + (lock ? ' ' + lockRule(config) : '')],
      ad ? '6. ÂM THANH: video phải hoàn toàn IM LẶNG, không có âm thanh nào (không tiếng người, không nhạc, không tiếng động); HÌNH ẢNH thì vẫn được mỉm cười, há miệng, ngạc nhiên, nét mặt và cử chỉ rõ ràng. Lời quảng cáo do người đọc, không phải người trong cảnh.' : '6. ÂM THANH: video phải hoàn toàn IM LẶNG, không có âm thanh nào (không tiếng người, không nhạc, không tiếng động); lời thoại trong truyện và lời kể do người đọc, không phải nhân vật. HÌNH ẢNH thì diễn đạt đầy đủ câu nói: nhân vật được há miệng, mấp máy miệng như đang nói, cười, ngạc nhiên, la hét, nét mặt và cử chỉ thật rõ — chỉ là không có tiếng. Câu có lời thoại: cho thấy ai đang nói với ai, khẩu hình, nét mặt, cử chỉ.',
      ad ? `7. Không thêm chữ, giá, phụ đề hay logo vào hình (nhãn thật trên sản phẩm giữ nguyên như ảnh)${config.style ? `; phong cách hình ảnh: ${config.style}` : ''}; tỷ lệ ${config.aspect}.` : `7. Không chèn chữ, phụ đề hay logo vào hình${config.style ? `; phong cách hình ảnh: ${config.style}` : ''}${config.reference ? '; nhân vật chính giữ đúng như ảnh tham chiếu' : ''}; tỷ lệ ${config.aspect}.`,
      '8. Viết PROMPT cùng ngôn ngữ với ' + (ad ? 'lời quảng cáo' : 'câu chuyện') + ', riêng câu cuối của PROMPT luôn là đúng câu tiếng Anh này: ' + NO_SPEECH,
      ...(ad ? ['9. Nhịp quảng cáo: cảnh đầu phải thu hút ngay trong 1–2 giây đầu; các cảnh giữa cho thấy rõ từng điểm nổi bật bằng hình cụ thể (sản phẩm đang được dùng, cận cảnh chi tiết); cảnh cuối là khung hình đẹp nhất của sản phẩm. Mỗi cảnh chọn chuyển động máy quay hợp với cảnh trong danh sách đã chọn (nếu có) và ghi rõ trong PROMPT.'] : [SAFE_RULE]),
      '',
      'Trả lời đúng khuôn sau, KHÔNG viết thêm câu dẫn hay giải thích:',
      ...(ctx.cast ? ['(Chỉ khi có nhân vật MỚI xuất hiện ở phần này: thêm một dòng «NHÂN VẬT: …» ghi lại ĐỦ danh sách gồm cả người đã chốt; không thì bỏ qua dòng này.)'] : [ad ? 'NHÂN VẬT: <sản phẩm: mô tả cố định' + (config.reference ? ' theo ảnh tham chiếu' : '') + '; người mẫu nếu có: tuổi, vóc dáng, tóc, trang phục cố định>' : (lock ? 'NHÂN VẬT: <nhân vật chuẩn: ' + (config.reference ? 'ghi «theo ảnh tham chiếu»' : 'ghi kiểu người dùng mô tả') + '; mỗi nhân vật khác một mục: tên/vai – giới tính, màu và kiểu quần áo, kiểu tóc hoặc bộ lông, phụ kiện, chiều cao tương đối, cùng hình dạng với nhân vật chuẩn>' : 'NHÂN VẬT: <mọi nhân vật trong truyện, mỗi người một mục: tên/vai – tuổi, vóc dáng, tóc, trang phục cố định>')]),
      'CẢNH 1',
      `CÂU: <số câu đầu>-<số câu cuối> (ví dụ 1-3; một câu thì chỉ ghi số đó)`,
      'PROMPT: <bối cảnh cụ thể, rồi các mốc dạng «0–3 giây [câu 5]: …» theo quy tắc trên>',
      'CẢNH 2',
      'CÂU: …',
      'PROMPT: …',
      `(cứ thế đến câu số ${last}${marker ? `; dòng cuối cùng của trả lời chỉ gồm đúng một từ: MSDONE${marker}` : ''})`,
      ctx.cast ? `\nNHÂN VẬT ĐÃ CHỐT (dùng y nguyên trong mọi PROMPT): ${ctx.cast}` : '',
      ...(ctx.understanding ? ['', 'HIỂU BIẾT VỀ CẢ BÀI (đã đọc trước; chỉ để nắm mạch và cách minh họa, KHÔNG viết cảnh cho phần này; làm theo CÁCH MINH HỌA ở mọi cảnh):', understandingText(ctx.understanding)] : []),
      ...(ctx.fix ? ['', 'SỬA LỖI – lần trước các cảnh dưới đây bị sai; viết lại ĐÚNG, vẫn đủ mọi câu của phần này, vẫn theo khuôn trên:', ctx.fix] : []),
      config.character ? `\n${ad ? 'Người mẫu' : 'Nhân vật chính'} (người dùng mô tả): ${config.character}` : '',
      ...(ad ? adBlock(ad) : []),
      '',
      ...(whole ? [ad ? 'LỜI QUẢNG CÁO (đã đánh số câu):' : 'CÂU CHUYỆN (đã đánh số câu):'] : ['NGỮ CẢNH – ' + (ad ? 'lời quảng cáo' : 'câu chuyện') + ' (chỉ để hiểu, KHÔNG viết cảnh cho phần này):', contextText(script, units, first, last), '', 'CÁC CÂU CẦN CHIA CẢNH:']),
      ...numbered(picked),
      marker ? `MSEND${marker}` : ''
    ].filter((line, index, lines) => line !== '' || (index > 0 && lines[index - 1] !== '' && index < lines.length - 1)).join('\n');
  }


  /* Câu lệnh chế độ Mẹo vặt: Muse chia mẹo thành BƯỚC (mỗi bước một cảnh) và viết, cho từng bước, prompt ẢNH (khung hình đầu,
     ảnh chụp thật) và PROMPT chuyển động (làm từ chính ảnh đó). */
  function buildTipInstruction({ script, config, units, picked, whole, s, budget, marker, numbered, first, last, partNote, ctx }) {
    const mid = Math.round(s * 0.3), end2 = Math.round(s * 0.7);
    const history = config.tipKind === 'history';   // lịch sử: tranh minh họa hoạt hình phẳng + nhân vật dẫn chuyện lặp lại, clip chuyển động nhẹ
    const en = history || config.tipPrompt !== 'vi';   // ẢNH và PROMPT bằng tiếng Anh (Muse hiểu tốt hơn); lời đọc vẫn theo ngôn ngữ mẹo
    const gentle = config.tipMotion !== 'full' && config.tipKind !== 'plant';   // «nhẹ»: video AI méo hình khi tay/dụng cụ làm thao tác phức tạp, nên chỉ xin chuyển động nhỏ, chậm. Cây trồng KHÔNG dùng chế độ này: clip phải cho thấy cây lớn lên (time-lapse)
    const plant = config.tipKind === 'plant';   // cây trồng phát triển: MỘT chậu cây qua nhiều giai đoạn
    const plantImage = plant ? ' CÂY TRỒNG: mọi ảnh chụp CÙNG MỘT chậu cây, cùng chỗ đặt, cùng góc máy và ánh sáng như dòng NHÂN VẬT; chỉ cây (và tay) thay đổi theo giai đoạn và phải đúng hình thái thật của loài ở giai đoạn đó: ghi rõ trong ẢNH tuổi cây và hình dạng (cao khoảng bao nhiêu cm, số lá, màu lá, nụ, hoa, quả xanh hay chín, số quả; đất ẩm hay khô), không thêm hoa hay quả khi giai đoạn chưa tới. GIAI ĐOẠN của mỗi cảnh do VỊ TRÍ của cảnh trong chuỗi thời gian của bài quyết định, KHÔNG do điều câu đọc nhắc tới: câu nhắc quả hay hoa khi cây chưa tới giai đoạn đó vẫn vẽ cây ở đúng giai đoạn hiện tại (ví dụ câu mở đầu «hôm nay trồng cà chua đến khi ra quả» vẫn vẽ chậu đất trống hoặc hạt, không vẽ cây đã lớn hay quả; không bao giờ vẽ cây hoa hay loài khác). Cây lớn dần ĐỀU qua các cảnh: không cảnh nào nhảy lên giai đoạn sau rồi quay lại giai đoạn trước. ẢNH là hình thái cây ở ĐẦU giai đoạn (khung đầu của clip time-lapse), cây CHƯA tới mức của giai đoạn này: clip sẽ cho cây lớn tiếp ngay trên màn hình tới đúng hình thái ở ẢNH của bước kế tiếp.' : '';
    const plantMotion = plant ? ' CÂY TRỒNG – TIME-LAPSE (quay tua nhanh thời gian): clip PHẢI cho thấy cây PHÁT TRIỂN NGAY TRÊN MÀN HÌNH, nhìn bằng mắt thấy được và liền mạch như video time-lapse thật, nhưng CHỈ MỘT BƯỚC NHỎ: mỗi clip là MỘT đoạn ngắn trong đời cây (vài ngày tới một hai tuần), cây chỉ thay đổi MỘT CHÚT, từ đúng hình thái ở ẢNH của bước này tới đúng hình thái ở ẢNH của bước kế tiếp (ví dụ: cao thêm 1–3 cm, mọc thêm một hai cặp lá, một nụ hoa nở, một quả xanh to thêm một chút). TUYỆT ĐỐI KHÔNG tua cả vòng đời trong một clip: không «hạt nảy mầm rồi lớn rồi ra quả» trong cùng một clip, không nhắc giai đoạn trước hay sau trong PROMPT; nảy mầm CHỈ xuất hiện ở các bước nảy mầm, ra hoa CHỈ ở các bước ra hoa, đậu quả và chín CHỈ ở các bước quả. Máy quay CỐ ĐỊNH như đặt trên chân máy, cùng góc và khoảng cách với ảnh: KHÔNG đẩy máy, lia máy hay phóng to để giả vờ cây lớn; chỉ cây thay đổi, chậu, đất, nền và ánh sáng giữ nguyên (ánh sáng chỉ đổi rất nhẹ theo ngày). Mốc đầu bắt đầu đúng hình thái ở ẢNH; mỗi mốc sau mô tả MỘT thay đổi nhỏ, rõ ràng, nối tiếp nhau, thuộc ĐÚNG giai đoạn của bước này và đúng trình tự thật của loài. Ghi trong PROMPT clip tua tối đa vài ngày tới một hai tuần cho khớp lời đọc. Cuối clip cây phải đạt đúng hình thái giai đoạn kế tiếp, khớp với ẢNH của bước sau (cùng chiều cao, số lá, nụ, hoa, quả); không nhảy cóc kích cỡ, không đột ngột xuất hiện hay biến mất, không thêm bộ phận lạ. Chỉ viết những thay đổi ĐÚNG với giai đoạn của bước này (bước gieo hạt chỉ tới lúc mầm nhú; chưa ra hoa khi chưa tới giai đoạn). Bước chỉ có thao tác (đổ đất, gieo hạt, tưới nước): tay làm chậm rãi, đất ẩm sẫm màu dần; nếu lời đọc nói tới thời gian trôi qua thì tua nhanh để thấy cây tiến triển.' : '';
    const plantClose = 'Time-lapse of ONE small step of a real plant growing: smooth, continuous, clearly visible but modest growth at fast-forward speed with natural plant anatomy (a few days to a week or two of change at most; the plant never goes through its whole life cycle in this clip, only the stage of this step); new leaves, buds, flowers or fruits appear gradually in the right places. The pot, soil, background, lighting and camera stay exactly the same. Static camera on a tripod, no push-in, no pan, no zoom, no cuts, no scene change, no morphing or melting, no new objects. Hands, if any, have exactly five fingers.';
    const guide = history ? String(config.character || '').trim() : '';
    const look = history ? histLookOf(config) : null, film = look === HIST_LOOKS.film;
    const histRule2Cartoon = `2. ẢNH (viết bằng TIẾNG ANH) = khung hình ĐẦU của cảnh, là một lệnh tạo ảnh mở đầu bằng «Create a flat 2D cartoon illustration of…»: tranh minh họa HOẠT HÌNH PHẲNG (clean outlines, warm vibrant colors, simple shading), KHÔNG phải ảnh chụp thật. Viết theo thứ tự: chủ thể và hành động (ai, mặc gì, đang làm gì) → bối cảnh, địa danh, kiến trúc, đồ vật ĐÚNG thời kỳ và vùng miền của câu → bố cục (wide establishing shot, medium shot hoặc close-up; chừa chỗ ở dưới khung cho phụ đề) → ánh sáng và không khí. Trang phục, nhà cửa, vũ khí, thuyền xe, cờ, đồ dùng phải hợp thời kỳ; không bịa chi tiết mà bài không nói; không vẽ chữ (kể cả chữ trên biển, cờ, sách); không cảnh máu me, tàn sát hay kích động; nhân vật lịch sử thật vẽ theo kiểu tôn kính, không biếm họa. Cảnh đông người thì vẽ các nhân vật phụ đơn giản, rõ nét. Câu cuối của ẢNH: «No text, numbers, logos or watermarks. Aspect ratio ${config.aspect}.»${config.style ? `; phong cách hình ảnh (dịch sang tiếng Anh): ${config.style}` : ''}`;
    const histMotionCartoon = ' LỊCH SỬ: clip là tranh hoạt hình nên chỉ cần chuyển động nhỏ, chậm, đẹp: máy quay đẩy vào hoặc lia ngang thật chậm; nhân vật chớp mắt, khẽ quay đầu hoặc đổi tư thế tay chậm rãi; cờ và vạt áo bay nhẹ, sóng gợn, khói bay lên, đám đông bước chậm. KHÔNG thêm nhân vật mới, không đổi trang phục, khuôn mặt hay hình dạng đồ vật, không đổi sang cảnh khác.';
    const histRule2Film = `2. ẢNH (viết bằng TIẾNG ANH) = khung hình ĐẦU của cảnh, là một lệnh tạo ảnh mở đầu bằng «Create a photorealistic cinematic film still of…»: KHUNG PHIM TƯ LIỆU CHÂN THỰC như phim hoặc ảnh cũ được phục chế màu (photorealistic, natural muted period colour grading, fine film grain, soft vignette, shallow depth of field), KHÔNG phải tranh vẽ hay hoạt hình. Viết theo thứ tự: chủ thể và hành động (ai, mặc gì, đang làm gì) → bối cảnh, địa danh, kiến trúc, đồ vật ĐÚNG thời kỳ và vùng miền của câu → bố cục và ống kính (ví dụ «wide establishing shot, 35mm lens», «medium shot, 50mm lens» hoặc «close-up on hands or objects»; chừa chỗ ở dưới khung cho phụ đề) → ánh sáng và không khí (ví dụ «soft overcast light, dust in the air»). Trang phục, nhà cửa, vũ khí, thuyền xe, cờ, đồ dùng phải hợp thời kỳ; không bịa chi tiết mà bài không nói; không có chữ (kể cả chữ trên biển, cờ, sách); không cảnh máu me, tàn sát hay kích động. Người trong ảnh là người vô danh đúng thời kỳ (dân làng, binh lính, thợ thủ công, quan lại), nhìn từ phía sau, từ xa hoặc nghiêng khi có thể; KHÔNG dựng khuôn mặt chân dung của một nhân vật lịch sử có thật như thể là ảnh chụp thật của họ (đây là cảnh dựng lại để minh họa). Cảnh đông người thì giữ các khuôn mặt ở xa, không cần rõ nét. Câu cuối của ẢNH: «No text, numbers, logos or watermarks. Aspect ratio ${config.aspect}.»${config.style ? `; phong cách hình ảnh (dịch sang tiếng Anh): ${config.style}` : ''}`;
    const histMotionFilm = ' LỊCH SỬ: clip là khung phim tư liệu chân thực nên chỉ cần chuyển động nhỏ, chậm, tự nhiên: máy quay đẩy vào hoặc lia ngang thật chậm; người chớp mắt, thở khẽ, quay đầu hoặc đổi tư thế tay chậm rãi; cờ và vạt áo bay nhẹ, sóng gợn, khói và bụi bay lên, đám đông bước chậm. KHÔNG thêm người mới, không đổi trang phục, khuôn mặt hay hình dạng đồ vật, không đổi sang cảnh khác, không cho người chạy, đánh nhau hay làm động tác nhanh vì video AI dễ méo người.';
    const histRule2 = film ? histRule2Film : histRule2Cartoon, histMotion = film ? histMotionFilm : histMotionCartoon;
    const histClose = look ? look.close : '';
    return [
      history ? `Bạn là đạo diễn hình ảnh cho video LỊCH SỬ kể bằng ${look.name} (kể về một chủ đề lịch sử hoặc văn hóa, có thể có một nhân vật dẫn chuyện lặp lại). Mỗi CẢNH được làm thành HAI thứ: (1) MỘT ẢNH ${look.first}, là khung hình đầu tiên; (2) MỘT video ngắn, dài tối đa ${s} giây, làm từ chính ảnh đó để tranh chuyển động nhẹ. Mỗi lần tạo đều tốn lượt nên ảnh và chuyển động phải đúng ngay từ lần đầu.` : plant ? `Bạn là đạo diễn hình ảnh cho video CÂY TRỒNG PHÁT TRIỂN (theo dõi MỘT cây trồng trong chậu từ chuẩn bị chậu, gieo hạt, nảy mầm, lớn lên, ra hoa đến đậu quả và thu hoạch). Mỗi BƯỚC được làm thành HAI thứ: (1) MỘT ẢNH chụp thật, rõ nét, là khung hình đầu tiên; (2) MỘT video ngắn, dài tối đa ${s} giây, làm từ chính ảnh đó để ảnh chuyển động. Mỗi lần tạo đều tốn lượt nên ảnh và chuyển động phải đúng ngay từ lần đầu.` : `Bạn là đạo diễn hình ảnh cho video MẸO VẶT (hướng dẫn từng bước: nấu ăn, việc nhà, sửa chữa, làm đẹp, đời sống…). Mỗi BƯỚC được làm thành HAI thứ: (1) MỘT ẢNH chụp thật, rõ nét, là khung hình đầu tiên; (2) MỘT video ngắn, dài tối đa ${s} giây, làm từ chính ảnh đó để ảnh chuyển động. Mỗi lần tạo đều tốn lượt nên ảnh và chuyển động phải đúng ngay từ lần đầu.`,
      FRESH,
      '',
      `BƯỚC 1 – ĐỌC HIỂU: đọc kỹ toàn bộ ${plant || history ? 'bài' : 'mẹo'}${whole ? ' ở cuối' : ' ở phần NGỮ CẢNH'} để nắm ${history ? 'thời kỳ, địa danh, nhân vật, sự kiện và diễn biến theo đúng thứ tự' : plant ? 'cây gì, các giai đoạn theo đúng thứ tự thời gian, chậu và đất, chỗ đặt, và cây trông thế nào ở mỗi giai đoạn' : 'mẹo này làm gì, cần nguyên liệu hoặc dụng cụ nào, các bước theo đúng thứ tự, làm ở đâu, và ai hoặc cái gì xuất hiện (tay, đồ vật, nguyên liệu)'}.${partNote}`,
      `BƯỚC 2 – CHIA BƯỚC: ${whole ? '' : 'chỉ chia các câu ở phần CÁC CÂU CẦN CHIA CẢNH; phần còn lại chỉ để hiểu. '}Gom các câu đánh số LIÊN TIẾP thành cảnh, mỗi cảnh là ${history ? 'MỘT ý vẽ được thành một bức tranh (một sự kiện, nhân vật, địa danh hoặc cảnh sinh hoạt)' : 'MỘT bước làm (một thao tác chính, hoặc một ý)'}, đủ mọi câu, đúng thứ tự, không bỏ sót, không lặp. Câu mở đầu giới thiệu ${history ? 'chủ đề' : 'mẹo'} và câu kết là cảnh riêng nếu đứng riêng. Số trong ngoặc là số giây đọc câu đó; tổng của mỗi cảnh không quá ${budget} giây. Độ dài video của cảnh tự theo lời đọc: tổng số giây các câu chia cho 0,9, làm tròn lên (tối thiểu ${MIN_SECONDS}, tối đa ${s} giây). ${history ? 'Các câu liên tiếp mà đổi sang sự kiện hoặc địa điểm khác hẳn thì tách thành cảnh khác. ' : 'Câu bắt đầu bằng «Bước N:» hoặc «Step N:» là câu ĐẦU của một bước mới nên luôn mở đầu một cảnh mới (một bước có thể gồm vài câu nối tiếp). '}KHÔNG chép lại lời: chỉ ghi số câu, giọng đọc sẽ đọc đúng nguyên văn các câu đó.`,
      'BƯỚC 3 – VIẾT cho từng cảnh một ẢNH và một PROMPT theo quy tắc dưới đây.',
      '',
      'QUY TẮC',
      history ? `1. Mỗi cảnh chỉ là ${look.one}: một địa điểm, một khoảnh khắc, MỘT khung hình liên tục (không chia khung thành nhiều ô, không nhảy thời gian, không cắt cảnh). Các câu liên tiếp mà đổi sang sự kiện hoặc địa điểm khác hẳn thì tách thành cảnh khác.` : '1. Mỗi cảnh chỉ là MỘT thao tác trong MỘT khung hình liên tục: một nơi, một góc máy, không nhảy thời gian, không cắt cảnh. Các câu liên tiếp mà đổi nơi làm hoặc sang thao tác khác hẳn thì tách thành cảnh khác.',
      history ? histRule2 : en ? `2. ẢNH (viết bằng TIẾNG ANH) = khung hình ĐẦU của bước, là một lệnh tạo ảnh mở đầu bằng «Create a photorealistic photo of…». Viết theo thứ tự: chủ thể và hành động (vật gì: loại, màu, kích cỡ, chất liệu; tay hoặc dụng cụ đang ở đâu) → đặt ở đâu (mặt bàn, bồn rửa, thớt…) → góc máy và ống kính (ví dụ «close-up, 50mm lens, shallow depth of field») → ánh sáng (ví dụ «soft natural window light») → «sharp focus, realistic textures». Cho thấy đúng vật và tư thế tay ${gentle ? 'ở khoảnh khắc nổi bật của bước (đang làm hoặc vừa làm xong), vì clip chỉ chuyển động nhẹ nên chính ảnh phải cho thấy rõ thao tác' : 'ở lúc BẮT ĐẦU thao tác của bước (chưa làm xong)'}. Tay người: «natural hands with exactly five fingers, one or two hands, no face». Câu cuối của ẢNH: «No text, numbers, logos or watermarks. Aspect ratio ${config.aspect}.»${config.style ? `; phong cách hình ảnh (dịch sang tiếng Anh): ${config.style}` : ''}${plantImage}` : `2. ẢNH = khung hình ĐẦU của bước, viết như một lệnh tạo ảnh và mở đầu bằng «Tạo ảnh chụp thật…»: ảnh chụp thật (photorealistic), cận cảnh rõ nét, ánh sáng tự nhiên đẹp, cho thấy đúng vật và tư thế tay ${gentle ? 'ở khoảnh khắc nổi bật của bước (đang làm hoặc vừa làm xong), vì video chỉ chuyển động nhẹ nên chính ảnh phải cho thấy rõ thao tác' : 'ở lúc BẮT ĐẦU thao tác của bước (chưa làm xong)'}. Mô tả thật cụ thể: vật gì (loại, màu, kích cỡ, chất liệu), đặt ở đâu (mặt bàn, bồn rửa, thớt…), tay hay dụng cụ nào đang ở đâu, góc chụp. Tay người: tự nhiên, đủ năm ngón, chỉ 1–2 tay, không cần thấy mặt người. Không chữ, không số, không logo, không hình mờ trong ảnh${config.style ? `; phong cách hình ảnh: ${config.style}` : ''}; tỷ lệ ${config.aspect}.${plantImage}`,
      en ? `3. PROMPT (viết bằng TIẾNG ANH) = chuyển động làm từ ảnh đó (image-to-video): bắt đầu từ đúng khung hình của ẢNH, mô tả ngắn bối cảnh, rồi các mốc theo độ dài clip (clip 5 giây: 0–2 s…, 2–5 s…; clip ${s} giây: 0–${mid} s…, ${mid}–${end2} s…, ${end2}–${s} s…). Mỗi mốc ứng với đúng điều của câu tương ứng theo thứ tự câu và GHI SỐ CÂU ngay sau mốc giờ, dạng «0–3 s [line 5]: …» (mốc gộp nhiều câu thì «[line 5-6]»; một câu được có nhiều mốc; thẻ luôn dùng chữ «line» và số câu trong danh sách bên dưới): các mốc đi đúng thứ tự câu, KHÔNG đảo, mỗi câu của cảnh có ít nhất một mốc, mốc cuối kết thúc đúng độ dài clip của cảnh (app dùng thẻ để kiểm tra và tự bỏ khi tạo video). ${history ? '' : gentle ? 'CHUYỂN ĐỘNG phải HỢP LÝ, đúng vật lý, tốc độ tự nhiên và liền mạch (video AI rất dễ méo hình): mỗi mốc chỉ MỘT chuyển động nhỏ, chậm. Ưu tiên chuyển động CAMERA («slow smooth push-in», «gentle pan from left to right», «static camera with subtle movement») hoặc đúng một cử động nhỏ của chủ thể («steam rising slowly», «a hand slowly enters the frame», «water flowing gently», «light shifting softly»). TUYỆT ĐỐI KHÔNG yêu cầu cắt, thái, vắt, đổ mạnh, trộn, lau, xoay, bóp, vặn, bóc hay thao tác nhanh.' : 'Mỗi mốc ghi rõ bằng tiếng Anh: tay hoặc dụng cụ làm gì (cut, squeeze, pour, mix, wipe, twist…), vật thay đổi thế nào, kết quả hiện ra ra sao; chuyển động phải hợp lý, đúng vật lý, tốc độ tự nhiên. Máy quay cố định hoặc xê dịch rất nhẹ.'}${plantMotion}${history ? histMotion : ''} Kết thúc phần mô tả của PROMPT (ngay trước câu «Audio…» ở quy tắc 8) bằng đúng câu: «${history ? histClose : plant ? plantClose : 'Realistic, physically plausible motion at natural speed. Every object keeps exactly the same shape, size and color as in the first frame. Hands have exactly five fingers; no extra hands, no morphing, no new objects, no cuts, no scene change, steady camera.'}»` : `3. PROMPT = chuyển động làm từ ảnh đó: bắt đầu từ đúng khung hình của ẢNH, rồi mô tả CHUYỂN ĐỘNG theo thời gian đúng điều các câu của cảnh nói, chia mốc theo độ dài video của cảnh (video 5 giây: 0–2 giây…, 2–5 giây…; video ${s} giây: 0–${mid} giây…, ${mid}–${end2} giây…, ${end2}–${s} giây…). Mỗi mốc ứng với đúng điều của câu tương ứng theo thứ tự câu và GHI SỐ CÂU ngay sau mốc giờ, dạng «0–3 giây [câu 5]: …» (mốc gộp nhiều câu thì «[câu 5-6]»; một câu được có nhiều mốc; PROMPT viết bằng tiếng nào cũng giữ nguyên chữ «câu» trong thẻ): các mốc đi đúng thứ tự câu, KHÔNG đảo, mỗi câu của cảnh có ít nhất một mốc, mốc cuối kết thúc đúng độ dài video của cảnh (app dùng số câu để kiểm tra và tự bỏ khi tạo video). ${gentle ? 'CHUYỂN ĐỘNG NHẸ, ỔN ĐỊNH (video AI rất dễ méo hình khi có thao tác phức tạp): mỗi mốc chỉ mô tả MỘT chuyển động nhỏ, chậm, liền mạch: máy quay đẩy vào thật chậm hoặc lia ngang rất nhẹ, hoặc đúng một cử động tự nhiên nhỏ (tay đưa vào khung chậm rãi, hơi nước bay lên, nước chảy nhẹ, ánh sáng đổi nhẹ). TUYỆT ĐỐI KHÔNG yêu cầu thao tác nhanh hay làm đổi vật (cắt, thái, vắt, đổ mạnh, trộn, lau, xoay, bóp, vặn, bóc), không đổi hình dạng hay số lượng vật, không thêm tay hoặc vật mới. Vật giữ đúng hình dạng, màu sắc, kích cỡ như trong ảnh; tay luôn đủ năm ngón. Hành động của bước do lời đọc kể, hình chỉ minh họa nhẹ. Máy quay cố định hoặc xê dịch rất nhẹ.' : 'Mỗi mốc ghi rõ: tay hoặc dụng cụ làm gì (cắt, vắt, đổ, trộn, lau, xoay…), vật thay đổi thế nào, kết quả hiện ra ra sao. Giữ nguyên bối cảnh, đồ vật và màu sắc của ẢNH; không thêm vật mới hay người mới; máy quay cố định hoặc xê dịch rất nhẹ.'}${plantMotion}`,
      history ? `4. NHẤT QUÁN giữa các cảnh (viết bằng tiếng Anh): dòng NHÂN VẬT chốt (a) PHONG CÁCH HÌNH cố định (ví dụ «${look.style}»), nhắc y nguyên trong ẢNH của mọi cảnh; (b) ${guide ? 'NHÂN VẬT DẪN CHUYỆN: dựa trên mô tả của người dùng ở cuối, viết thành mô tả cố định bằng tiếng Anh (mặt, tóc, trang phục, màu áo); cho nhân vật này xuất hiện ở khoảng một nửa số cảnh (đứng một bên khung, chỉ tay, đặt tay lên ngực, nhìn về cảnh), nhắc y nguyên mô tả mỗi lần, luôn cùng một trang phục' : 'nếu có nhân vật hoặc đồ vật lặp lại nhiều cảnh (ví dụ một người dẫn chuyện), chốt mô tả cố định và nhắc y nguyên mỗi lần'}. Nhân vật lịch sử và đám đông thì mô tả theo đúng thời kỳ. Mỗi ẢNH và PROMPT phải tự đủ ý, không viết «như cảnh trước».` : plant ? `4. NHẤT QUÁN giữa các bước: dòng NHÂN VẬT chốt MỘT mô tả cố định${en ? ' (viết bằng tiếng Anh)' : ''} của: loài cây (tên), chậu (chất liệu, màu, kích cỡ, đĩa lót), loại đất, chỗ đặt (bệ cửa sổ hoặc ban công, nền, tường phía sau), hướng nắng và ánh sáng, góc máy và khoảng cách máy (ví dụ nhìn ngang tầm chậu, chếch 3/4, cùng khoảng cách). Nhắc y nguyên trong ẢNH của mọi cảnh; chỉ phần cây (và tay nếu có) thay đổi theo giai đoạn. LIÊN TỤC giữa các bước: hình thái cây ở CUỐI clip của bước k (cao khoảng bao nhiêu cm, số lá, nụ, hoa, quả) phải CHÍNH LÀ hình thái ở ẢNH (khung đầu) của bước k+1, để khi ghép video người xem thấy MỘT cây lớn dần liên tục, không phải mỗi cảnh một cây to nhỏ khác nhau. Mỗi ẢNH và PROMPT phải tự đủ ý, không viết «như cảnh trước».` : en ? '4. NHẤT QUÁN giữa các bước: chốt MỘT mô tả cố định (viết bằng tiếng Anh) của nơi làm (bàn hoặc bếp, thớt, tông màu, ánh sáng) và của đồ vật hoặc nguyên liệu chính (loại, màu, kích cỡ) ở dòng NHÂN VẬT, rồi nhắc y nguyên trong ẢNH của mọi bước có chúng, để các ảnh trông như cùng một buổi quay. Mỗi ẢNH và PROMPT phải tự đủ ý, không viết «như bước trước».' : '4. NHẤT QUÁN giữa các bước: chốt MỘT mô tả cố định của nơi làm (bàn hoặc bếp, thớt, tông màu, ánh sáng) và của đồ vật hoặc nguyên liệu chính (loại, màu, kích cỡ) ở dòng NHÂN VẬT, rồi nhắc y nguyên trong ẢNH của mọi bước có chúng, để các ảnh trông như cùng một buổi quay. Mỗi ẢNH và PROMPT phải tự đủ ý, không viết «như bước trước».',
      history ? `5. Cảnh chỉ là lời nói chung (mở đầu, kết luận): ${look.paint}, giàu không khí của chủ đề (địa danh, phong cảnh, biểu tượng), có thể có nhân vật dẫn chuyện; chuyển động nhẹ (mây trôi, sóng gợn, cờ bay, máy quay đẩy vào).` : plant ? '5. Bước chỉ là lời nói chung (mở đầu, kết luận, lưu ý): dựng ảnh chụp thật của chính chậu cây ở giai đoạn đó (mở đầu: chậu, đất và hạt đã sẵn sàng; kết: cây đã có quả chín), chuyển động nhẹ (lá đung đưa, ánh sáng đổi nhẹ).' : '5. Bước chỉ là lời nói chung (mở đầu, kết luận, lưu ý): dựng ảnh chụp thật của vật chính hoặc kết quả cuối, chuyển động nhẹ (hơi nước bay lên, ánh sáng đổi nhẹ, tay đưa vào khung).',
      '6. ÂM THANH: video phải hoàn toàn IM LẶNG, không có âm thanh nào (không tiếng người, không nhạc, không tiếng động); lời đọc do người đọc, không phải ai trong cảnh.',
      `7. Không chèn chữ, phụ đề hay logo vào ảnh và video; tỷ lệ ${config.aspect}.`,
      en ? '8. Viết ẢNH, PROMPT và dòng NHÂN VẬT bằng TIẾNG ANH, dùng từ ngữ tạo ảnh và tạo video quen thuộc, ngắn gọn, cụ thể (không dịch lời đọc, lời đọc không phải việc của bạn), riêng câu cuối của PROMPT luôn là đúng câu tiếng Anh này: ' + NO_SPEECH : '8. Viết ẢNH và PROMPT cùng ngôn ngữ với mẹo, riêng câu cuối của PROMPT luôn là đúng câu tiếng Anh này: ' + NO_SPEECH,
      '',
      'Trả lời đúng khuôn sau, KHÔNG viết thêm câu dẫn hay giải thích:',
      ...(ctx.cast ? [history ? '(Chỉ khi có nhân vật hoặc đồ vật lặp lại MỚI xuất hiện ở phần này: thêm một dòng «NHÂN VẬT: …» ghi lại ĐỦ mô tả gồm cả mục đã chốt; không thì bỏ qua dòng này.)' : plant ? '(Chỉ khi có điều MỚI cần chốt thêm ở phần này (loại giàn, chậu mới khi thay chậu…): thêm một dòng «NHÂN VẬT: …» ghi lại ĐỦ mô tả gồm cả mục đã chốt; không thì bỏ qua dòng này.)' : '(Chỉ khi có đồ vật hoặc nơi làm MỚI xuất hiện ở phần này: thêm một dòng «NHÂN VẬT: …» ghi lại ĐỦ danh sách gồm cả mục đã chốt; không thì bỏ qua dòng này.)'] : [history ? 'NHÂN VẬT: <English: fixed art style; guide character: fixed look, hair, outfit and colors (if any); recurring people or objects: fixed look>' : plant ? (en ? 'NHÂN VẬT: <English: plant species; pot: material, color, size, saucer; soil; fixed place (windowsill or balcony), background, light direction; fixed camera angle and distance; human hands if any>' : 'NHÂN VẬT: <loài cây; chậu: chất liệu, màu, kích cỡ, đĩa lót; đất; chỗ đặt cố định (bệ cửa sổ hoặc ban công), nền, hướng ánh sáng; góc máy và khoảng cách cố định; tay người nếu có>') : en ? 'NHÂN VẬT: <English: fixed workspace: table/kitchen, color tone, lighting; main object or ingredient: type, color, size; human hands if any>' : 'NHÂN VẬT: <nơi làm cố định: bàn/bếp, tông màu, ánh sáng; đồ vật hoặc nguyên liệu chính: loại, màu, kích cỡ; tay người nếu có>']),
      'CẢNH 1',
      'CÂU: <số câu đầu>-<số câu cuối> (ví dụ 1-2; một câu thì chỉ ghi số đó)',
      history ? `ẢNH: <English: ${look.verb} of …>` : en ? 'ẢNH: <English: Create a photorealistic photo of …>' : 'ẢNH: <lệnh tạo ảnh chụp thật cho khung hình đầu của bước>',
      en ? 'PROMPT: <English: concrete setting, then beats like «0–3 s [line 5]: …» as above>' : 'PROMPT: <bối cảnh cụ thể, rồi các mốc dạng «0–3 giây [câu 5]: …» theo quy tắc trên>',
      'CẢNH 2',
      'CÂU: …',
      'ẢNH: …',
      'PROMPT: …',
      `(cứ thế đến câu số ${last}${marker ? `; dòng cuối cùng của trả lời chỉ gồm đúng một từ: MSDONE${marker}` : ''})`,
      ctx.cast ? `\nĐÃ CHỐT (dùng y nguyên trong mọi ẢNH và PROMPT): ${ctx.cast}` : '',
      ...(ctx.fix ? ['', 'SỬA LỖI – lần trước các cảnh dưới đây bị sai; viết lại ĐÚNG, vẫn đủ mọi câu của phần này, vẫn theo khuôn trên (kể cả dòng ẢNH):', ctx.fix] : []),
      guide ? `\nNhân vật dẫn chuyện (người dùng mô tả): ${guide}` : '',
      '',
      ...(whole ? [history ? 'BÀI LỊCH SỬ (đã đánh số câu):' : plant ? 'BÀI TRỒNG CÂY (đã đánh số câu):' : 'MẸO VẶT (đã đánh số câu):'] : [`NGỮ CẢNH – ${history ? 'bài lịch sử' : plant ? 'bài trồng cây' : 'mẹo vặt'} (chỉ để hiểu, KHÔNG viết cảnh cho phần này):`, contextText(script, units, first, last), '', 'CÁC CÂU CẦN CHIA CẢNH:']),
      ...numbered(picked),
      marker ? `MSEND${marker}` : ''
    ].filter((line, index, lines) => line !== '' || (index > 0 && lines[index - 1] !== '' && index < lines.length - 1)).join('\n');
  }


  const lockRule = config => `KHÓA HÌNH DẠNG: ${config.reference ? 'nhân vật trong ảnh tham chiếu' : 'nhân vật chuẩn do người dùng mô tả'}${config.form ? ` (hình dạng chuẩn: ${config.form})` : ''} là CHUẨN HÌNH DẠNG của MỌI nhân vật. Mọi nhân vật khác, kể cả người phụ, phải CÙNG hình dạng, tỉ lệ cơ thể, kiểu đầu và mặt, kiểu vẽ, độ chân thực và độ chi tiết (ví dụ chuẩn là người que thì mọi người đều là người que; là người thật thì mọi người đều là người thật; là con vật hoạt hình thì mọi nhân vật đều cùng kiểu hoạt hình đó); chỉ khác màu và kiểu quần áo, giới tính, kiểu tóc hoặc bộ lông, phụ kiện, chiều cao, và loài nếu câu chuyện nói rõ. Vì vậy mỗi nhân vật khác chỉ được mô tả phần ĐƯỢC KHÁC đó, theo đúng kiểu của nhân vật chuẩn; KHÔNG thêm chi tiết làm lệch kiểu (ví dụ không tả da, cơ bắp, nét mặt thật cho nhân vật hoạt hình; không tả nét vẽ hoạt hình cho người thật). Nhân vật chuẩn đóng vai chính của bài (bài nói/bình luận thì đóng vai kiểu người mà bài đang nói tới); các vai còn lại do nhân vật khác cùng hình dạng đóng. App tự thêm câu khóa hình dạng vào cuối mỗi PROMPT nên bạn không cần chép lại, nhưng mô tả nhân vật phải hợp kiểu đó.`;

  // Chat Muse dùng chung một cuộc trò chuyện nên có thể còn truyện/yêu cầu cũ ở phía trên: dặn Muse không để lẫn vào.
  const FRESH = 'Cuộc trò chuyện này có thể còn truyện hoặc yêu cầu khác ở phía trên: BỎ QUA hết, chỉ làm với nội dung bên dưới, không lấy nhân vật hay chi tiết nào từ chỗ khác.';

  /* ---------- Muse đọc hiểu cả bài TRƯỚC khi chia cảnh ----------
     Muse đọc cả bài và ghi lại: tóm tắt, cách minh họa (truyện kể hay bài nói/bình luận, cách dựng ví dụ và ẩn dụ),
     nhân vật/vai cố định, bối cảnh. Phần này được đưa kèm mọi lượt chia cảnh sau để hình minh họa bám đúng ý bài. */
  const UNDERSTAND_CHARS = 12000;
  const SUMMARY = /^(?:tóm tắt|tom tat|diễn biến|dien bien|summary)(?:\s*(?:truyện|chuyện|bài|nội dung))?$/i;
  const APPROACH = /^(?:cách minh họa|cach minh hoa|kiểu và cách minh họa|cách dựng|cách thể hiện|minh họa|approach)$/i;
  const SETTING = /^(?:bối cảnh|boi canh|setting|địa điểm|dia diem)(?:\s*(?:và|&)\s*thời gian)?$/i;

  // Chia truyện thành các phần đọc hiểu, mỗi phần không quá UNDERSTAND_CHARS ký tự (cắt ở ranh giới câu).
  function understandRanges(units) {
    const ranges = [];
    let start = 1, size = 0;
    units.forEach((unit, index) => {
      const len = Array.from(unit.text).length + 8;
      if (index + 1 > start && size + len > UNDERSTAND_CHARS) { ranges.push([start, index]); start = index + 1; size = 0; }
      size += len;
    });
    ranges.push([start, units.length]);
    return ranges;
  }

  // understanding = {summary, approach, setting}; cast riêng.
  function understandingText(u) {
    return [u?.summary && `TÓM TẮT: ${u.summary}`, u?.approach && `CÁCH MINH HỌA: ${u.approach}`, u?.setting && `BỐI CẢNH: ${u.setting}`].filter(Boolean).join('\n');
  }

  function buildUnderstandInstruction(script, input = {}, ctx = {}) {
    const config = options(input);
    if (typeof script !== 'string' || !script.trim()) throw Error('Dán kịch bản trước khi nhờ Muse đọc.');
    const units = ctx.units || storyUnits(script, config);
    const [a, b] = ctx.range || [1, units.length];
    const picked = units.slice(a - 1, b);
    const parts = ctx.parts > 1 ? ctx.parts : 1, part = ctx.part || 1;
    const lock = isLocked(config);
    const marker = ctx.marker ? String(ctx.marker) : '';
    const before = ctx.understanding || ctx.cast ? [
      '',
      'ĐÃ HIỂU TỪ CÁC PHẦN TRƯỚC (giữ nguyên mô tả nhân vật đã chốt, bổ sung người mới, cập nhật tóm tắt, cách minh họa và bối cảnh cho cả bài đến hết phần này):',
      ctx.understanding ? understandingText(ctx.understanding) : '',
      ctx.cast ? `NHÂN VẬT: ${ctx.cast}` : ''
    ] : [];
    return [
      'Bạn là biên kịch đọc hiểu một bài đọc (truyện kể, tâm sự, bài nói, bình luận, châm biếm…) để chuẩn bị làm video minh họa.',
      FRESH,
      '',
      `ĐỌC HIỂU${parts > 1 ? ` – phần ${part}/${parts} của bài` : ''}: đọc kỹ rồi ghi lại những gì đã hiểu. CHƯA chia cảnh, CHƯA viết prompt hình.`,
      `1. TÓM TẮT: kể lại ý và diễn biến theo đúng thứ tự, mỗi ý một câu ngắn, đủ các ý chính, các ví dụ bài nêu; không bịa, không đổi ý${parts > 1 ? '; viết lại gọn cho cả bài từ đầu đến hết phần này (tối đa 15 ý)' : ''}.`,
      '2. CÁCH MINH HỌA: (a) đây là truyện kể hay bài nói/bình luận/châm biếm, giọng điệu gì; (b) hình ảnh nên dựng thế nào cho đúng ý: truyện kể thì dựng đúng diễn biến; bài nói/bình luận thì dựng các tình huống và ví dụ mà bài nêu, bằng vài vai cố định làm việc cụ thể trong bối cảnh đời thường; (c) các câu ví von, nói quá, ẩn dụ quan trọng và cách thể hiện từng câu bằng hình cụ thể đúng ý (không dựng theo nghĩa đen nếu phi lý hay đáng sợ); (d) bối cảnh và phong cách chung.',
      '3. NHÂN VẬT: mọi nhân vật CÓ MẶT (kể cả người chỉ gọi bằng vai như «bà», «người lái đò», «đồng nghiệp»), mỗi người một mục: tên/vai – tuổi, vóc dáng, tóc, trang phục cố định; chi tiết bài không nói thì chọn đơn giản, không bịa thêm. Bài nói/bình luận không có nhân vật tên riêng thì chốt 2–3 VAI cố định đại diện cho các kiểu người được nhắc; khi bài gọi người nghe là «bạn» thì «bạn» là một vai cụ thể.' + (config.reference ? ' Nhân vật chính là người ở ảnh tham chiếu đính kèm: ghi «theo ảnh tham chiếu».' : '') + (config.character ? ` Nhân vật chính (người dùng mô tả): ${config.character}` : '') + (lock ? ' ' + lockRule(config) : ''),
      '4. BỐI CẢNH: các địa điểm và thời điểm chính theo thứ tự xuất hiện.',
      ...before,
      '',
      'Trả lời đúng khuôn sau, KHÔNG viết thêm câu dẫn hay giải thích:',
      'TÓM TẮT: <…>',
      'CÁCH MINH HỌA: <…>',
      'NHÂN VẬT: <…>',
      'BỐI CẢNH: <…>',
      marker ? `(dòng cuối cùng của trả lời chỉ gồm đúng một từ: MSDONE${marker})` : '',
      '',
      parts > 1 ? `BÀI ĐỌC (phần ${part}/${parts}, đã đánh số câu):` : 'BÀI ĐỌC (đã đánh số câu):',
      ...picked.map(u => `[${u.n}] ${u.text}`),
      marker ? `MSEND${marker}` : ''
    ].filter((line, index, lines) => line !== '' || (index > 0 && lines[index - 1] !== '' && index < lines.length - 1)).join('\n');
  }

  // Tách trả lời đọc hiểu của Muse: {summary, approach, cast, setting}. Thiếu tóm tắt hoặc cách minh họa thì báo lỗi.
  function parseUnderstanding(reply) {
    const lines = String(reply || '').replace(/\r\n?/g, '\n').split('\n');
    const got = { summary: '', approach: '', cast: '', setting: '' };
    let field = null;
    for (const raw of lines) {
      if (DONE.test(raw.trim())) break;
      const line = raw.replace(/\*\*|__/g, '');
      const bare = line.replace(/^[\t ]*(?:#{1,6}[\t ]*)?(?:\d+[.)][\t ]*)?(?:[-•*][\t ]+)?/, '');
      const label = bare.match(LABEL);
      const kind = label ? (SUMMARY.test(label[1].trim()) ? 'summary' : APPROACH.test(label[1].trim()) ? 'approach' : CAST.test(label[1].trim()) ? 'cast' : SETTING.test(label[1].trim()) ? 'setting' : null) : null;
      if (kind && !(kind === field && got[kind])) { field = kind; got[kind] = label[2].trim(); continue; }
      if (kind && kind === field) { got[kind] += ' ' + label[2].trim(); continue; }
      if (field && line.trim()) got[field] += (got[field] ? '\n' : '') + line.trim();
    }
    const out = { summary: clean(got.summary).slice(0, 4000), approach: clean(got.approach).slice(0, 3000), cast: clean(got.cast).slice(0, 3000), setting: clean(got.setting).slice(0, 1500) };
    if (!out.summary || !out.approach) throw Error('Chưa thấy phần tóm tắt và cách minh họa trong trả lời của Muse.');
    return out;
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
  // Người giữ chức vụ chính trị chỉ ra đúng một người thật (kể cả khi đã bỏ tên): Muse chặn «nhân vật chính trị có thật».
  const POLITICAL = /(?<![\p{L}\p{N}])(?:(?:phó\s+)?tổng thống|thủ tướng|chủ tịch nước|tổng bí thư|quốc vương|hoàng đế|nữ hoàng|nhà vua|nguyên thủ|(?:vice[- ])?president|prime minister|chancellor|emperor|empress|king|queen|dictator|head of state|supreme leader)(?![\p{L}\p{N}])/iu;
  const EMPTY_SEAT = /(?:ghế|bàn|phòng|bục)\s+(?:làm việc\s+)?trống|trống không|vắng (?:người|chủ)|không có ai|empty\s+(?:chair|desk|seat|office|podium|lectern)|vacant|\bno one\b|\bnobody\b/iu;
  const WEAPON = /(?<![\p{L}\p{N}])(?:súng|khẩu súng|rifle|gun|pistol|firearm|handgun|M16|AR-15|AK-47|AK|ammo|ammunition|bullet|cartridge|đạn|băng đạn|lựu đạn)(?![\p{L}\p{N}])/iu;
  const HANDLING = /(?<![\p{L}\p{N}])(?:cầm|giơ|nâng|ngắm|nhắm|bắn|chĩa|chỉa|nạp|lên đạn|vuốt|hold(?:s|ing)?|aim(?:s|ing)?|point(?:s|ing)?|shoot(?:s|ing)?|fire[sd]?|firing|raise[sd]?|load(?:s|ing)?)(?![\p{L}\p{N}])/iu;
  const QUOTED = /["“”«»「」『』]([^"“”«»「」『』]{2,})["“”«»「」『』]/;
  // Trả về mảng cảnh báo (chuỗi) cho từng cảnh; mảng rỗng = ổn.
  /* ---------- kiểm tra chuyển động của cảnh ----------
     Muse ghi mỗi mốc dạng «0–3 giây [câu 5]: …». App kiểm: mốc có đi đúng thứ tự câu, đủ câu, không nhắc câu ngoài cảnh,
     mốc giờ có nằm trong độ dài video. (Không kiểm được hình Muse/video vẽ ra có đúng nghĩa hay không.)
     Trả mảng {kind, hard, text}. hard = lỗi thứ tự/thiếu câu: app hỏi lại Muse đúng cảnh đó. */
  const BEAT_TIME = /(\d+(?:[.,]\d+)?)\s*[–—-]\s*(\d+(?:[.,]\d+)?)\s*(?:giây|s|sec|seconds?)(?![\p{L}])/giu;
  // Thẻ số câu: «[câu 5]», «[câu 5-6]», «(câu 5, 6)»; Muse hay đổi ngoặc nên nhận cả ngoặc tròn.
  const BEAT_TAG = /[\[(（]\s*(?:c[âa]u|sentences?|lines?)\s*(\d+(?:\s*[-–—,;]\s*\d+)*)\s*[\])）]/giu;
  const stripBeatTags = text => String(text || '').replace(/[ \t]*[\[(（]\s*(?:c[âa]u|sentences?|lines?)\s*\d+(?:\s*[-–—,;]\s*\d+)*\s*[\])）]/giu, '');
  function motionIssues(scene, input = {}) {
    const config = options(input);
    const prompt = String(scene?.prompt || '');
    if (!prompt.trim() || scene.offline || scene.shot || !Array.isArray(scene.units)) return [];
    const out = [];
    const seconds = Number(scene.durationSeconds) || sceneSeconds(scene.voiceover || prompt, config.seconds);
    const num = text => Number(String(text).replace(',', '.'));
    const times = [...prompt.matchAll(BEAT_TIME)].map(m => [num(m[1]), num(m[2])]);
    const tags = [...prompt.matchAll(BEAT_TAG)].map(m => { const n = m[1].match(/\d+/g).map(Number); return [Math.min(...n), Math.max(...n)]; });
    if (!times.length) {
      if (seconds >= 4) out.push({ kind: 'beats', hard: false, text: 'Prompt chưa chia mốc thời gian («0–3 giây: …») nên chuyển động dễ đứng yên hoặc lệch lời đọc.' });
    } else {
      let previous = -1, broken = false;
      for (const [a, b] of times) { if (!(b > a) || a < previous - 0.01) broken = true; previous = a; }
      const last = Math.max(...times.map(t => t[1]));
      if (broken || last > seconds + 1) out.push({ kind: 'time', hard: false, text: `Mốc thời gian chưa hợp lý (video của cảnh dài ${seconds} giây): các mốc phải tăng dần và kết thúc trong ${seconds} giây.` });
    }
    if (tags.length) {
      const [lo, hi] = scene.units;
      const outside = [...new Set(tags.flatMap(t => [t[0], t[1]]).filter(n => n < lo || n > hi))];
      if (outside.length) out.push({ kind: 'outside', hard: true, text: `Mốc nhắc câu ${outside.join(', ')} nhưng cảnh này chỉ gồm câu ${lo === hi ? lo : `${lo}–${hi}`}.` });
      for (let i = 1; i < tags.length; i++) {
        if (tags[i][0] < tags[i - 1][0]) { out.push({ kind: 'order', hard: true, text: `Các mốc đảo thứ tự câu (câu ${tags[i - 1][0]} rồi câu ${tags[i][0]}); phải đi đúng thứ tự lời đọc.` }); break; }
      }
      const missing = [];
      for (let n = lo; n <= hi; n++) if (!tags.some(t => n >= t[0] && n <= t[1])) missing.push(n);
      if (missing.length) out.push({ kind: 'missing', hard: true, text: `Chưa có mốc nào minh họa câu ${missing.join(', ')}.` });
    }
    return out;
  }

  /* Cảnh quá ngắn liền nhau mà gộp lại vẫn vừa một clip: Muse chia vụn (mỗi câu một cảnh) thì bài ra rất nhiều cảnh.
     Trả mảng dải {start, end, from, to, count, seconds, gain}: start/end là chỉ số cảnh, from/to là số câu đầu / cuối. Mỗi dải ≥ 2 cảnh liên tiếp,
     có ít nhất một cảnh dưới mức tối thiểu và tổng lời đọc không quá 90% clip. Chỉ xét cảnh do Muse chia (có số câu, không phải cảnh mẫu). */
  function shortRuns(scenes, input = {}) {
    const config = options(input);
    if (config.ad || config.tip) return [];
    const budget = config.seconds * 0.9, floor = sceneFloor(config.seconds);
    const list = Array.isArray(scenes) ? scenes : [];
    const secs = scene => estimateSeconds(scene.voiceover || '', detectLanguage(scene.voiceover || ''));
    const usable = scene => Boolean(scene) && !scene.offline && !scene.shot && Array.isArray(scene.units) && String(scene.voiceover || '').trim();
    const runs = [];
    let i = 0;
    while (i < list.length) {
      if (!usable(list[i])) { i++; continue; }
      let end = i, total = secs(list[i]);
      while (end + 1 < list.length && usable(list[end + 1]) && list[end + 1].units[0] === list[end].units[1] + 1) {
        const add = secs(list[end + 1]);
        if (!(total < floor || add < floor) || total + add > budget) break;
        total += add; end++;
      }
      if (end > i) runs.push({ start: i, end, from: list[i].units[0], to: list[end].units[1], count: end - i + 1, seconds: Math.round(total * 10) / 10, gain: end - i });
      i = end + 1;
    }
    return runs;
  }
  // Lời dặn Muse gộp một dải cảnh quá ngắn (đưa vào phần SỬA LỖI của câu lệnh chia cảnh).
  function shortFix(scenes, input = {}) {
    const config = options(input);
    const budget = fmtSeconds(config.seconds * 0.9);
    const range = scene => (scene.units[0] === scene.units[1] ? String(scene.units[0]) : `${scene.units[0]}–${scene.units[1]}`);
    const total = scenes.reduce((n, scene) => n + estimateSeconds(scene.voiceover || '', detectLanguage(scene.voiceover || '')), 0);
    const parts = scenes.map(scene => `câu ${range(scene)} (${fmtSeconds(estimateSeconds(scene.voiceover || '', detectLanguage(scene.voiceover || '')))} giây)`).join('; ');
    return `- Lần trước các câu này bị chia thành ${scenes.length} cảnh quá ngắn: ${parts}. Tổng lời đọc chỉ ${fmtSeconds(total)} giây, vừa MỘT clip (tối đa ${budget} giây). Nếu các câu này cùng địa điểm, cùng thời điểm và cùng mạch ý thì GỘP thành MỘT cảnh (một PROMPT, các mốc thời gian theo thứ tự câu); chỉ giữ tách khi thật sự đổi địa điểm hoặc nhảy thời gian.`;
  }

  function lintScenes(scenes, input = {}) {
    const config = options(input);
    const warn = [];
    scenes.forEach((scene, index) => {
      const w = [];
      const voice = String(scene.voiceover || ''), prompt = String(scene.prompt || '');
      const language = detectLanguage(voice || prompt);
      const seconds = estimateSeconds(voice, language), own = sceneSeconds(voice || prompt, config.seconds);
      if (voice && seconds > config.seconds) w.push(`Lời đọc dài khoảng ${seconds.toFixed(1)} giây, hơn clip ${config.seconds} giây — sẽ phải giữ khung cuối. Nên tách cảnh.`);
      if (config.tip) {
        const image = String(scene.image || '').trim();
        if (!image) w.push('Chưa có prompt ảnh: bước này sẽ không tạo được ảnh, nên cũng không có clip.');
        else if (count(image) < 30) w.push('Prompt ảnh quá ngắn, dễ ra ảnh sai. Mô tả rõ vật gì, ở đâu, tay đang làm gì.');
      }
      if (!prompt.trim()) w.push('Chưa có prompt: cảnh này sẽ không tạo được.');
      else if (count(prompt.replace(NO_SPEECH, '').replace(tipStartLine('vi'), '').replace(tipStartLine('en'), '').replace(lockLine(config, 'vi'), '').replace(lockLine(config, 'en'), '').replace(aspectLine(config, 'vi'), '').replace(aspectLine(config, 'en'), '').replace(ratioLead(config, 'vi'), '').replace(ratioLead(config, 'en'), '').trim()) < 40) w.push('Prompt quá ngắn, dễ ra hình sai. Mô tả rõ ai, ở đâu, làm gì, nét mặt.');
      if (prompt.trim() && !/no speech/i.test(prompt)) w.push('Prompt thiếu câu «no speech» — nhân vật có thể bị nói.');
      if (WEAPON.test(prompt) && HANDLING.test(prompt)) w.push('Prompt có cảnh người cầm / ngắm / bắn súng hoặc đạn: Muse thường từ chối («blocked by policy») và mỗi lần thử đều tốn lượt. Nên thay bằng bản vẽ kỹ thuật, sơ đồ so sánh hoặc người dẫn chuyện giới thiệu bằng lời.');
      if (POLITICAL.test(prompt) && !EMPTY_SEAT.test(prompt)) w.push('Prompt có người giữ chức vụ chính trị (tổng thống, thủ tướng, vua…): chức danh gắn với một nước hay mốc thời gian là chỉ đích danh một người thật, Muse thường từ chối («blocked by policy») dù không ghi tên, và mỗi lần thử đều tốn lượt. Nên bỏ người đó khỏi hình: dùng bàn làm việc trống, tập hồ sơ, micro trên bục, đài phát thanh, lá cờ hoặc đám đông nhìn từ phía sau, để nhân vật chuẩn phản ứng bằng nét mặt.');
      if (QUOTED.test(voice) || QUOTED.test(prompt)) w.push('Có lời thoại trong ngoặc kép — nhân vật sẽ không nói, chỉ thể hiện bằng cử chỉ và nét mặt.');
      if (TIME_SKIP.test(voice) || TIME_SKIP.test(prompt)) w.push(`Có chuyển mốc thời gian — ${own} giây khó chứa nhiều khoảnh khắc. Nên tách thành cảnh riêng.`);
      if (splitSentences(voice).length > 4) w.push(`Quá nhiều câu cho ${own} giây; hành động dễ bị bỏ sót hoặc dồn lại.`);
      for (const issue of motionIssues(scene, config)) w.push(issue.text);
      warn.push(w);
    });
    return warn;
  }


  const PROMPT = /^(?:prompt(?:\s*(?:video|clip|chuyển động))?|chuyển động|mô tả(?:\s*hình)?|hình ảnh|video prompt)$/i;
  const IMAGE = /^(?:ảnh|anh|ảnh đầu|khung hình đầu|image|image prompt|prompt ảnh|prompt anh|lệnh ảnh)$/i;
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
  // Prompt Muse viết + câu khóa hình dạng (nếu có) + câu cấm tiếng ở cuối.
  function finalPrompt(prompt, config, language = 'vi') {
    return withRatioLead(finalPromptBody(prompt, config, language), config, language, 'video');
  }
  function finalPromptBody(prompt, config, language = 'vi') {
    const lock = lockLine(config, language), text = String(prompt || '').trim();
    const hasLock = !lock || lockBoth(config).some(line => text.includes(line));
    const ratio = config.aspect && !text.includes(config.aspect) ? aspectLine(config, language) : '';
    const start = config.tip && !hasTipStart(text) ? tipStartLine(language) : '';
    const extra = [start, ratio, hasLock ? '' : lock].filter(Boolean);
    if (!extra.length) return ensureNoSpeech(text);
    const at = text.indexOf(NO_SPEECH);
    if (at >= 0) return text.slice(0, at).trimEnd() + '\n' + extra.join('\n') + '\n' + text.slice(at);
    return ensureNoSpeech(text + '\n' + extra.join('\n'));
  }

  // Câu khóa hình dạng chỉ được gắn LÚC CHIA CẢNH theo ảnh nhân vật đang có khi đó. Ảnh đính kèm hoặc đổi SAU khi chia cảnh thì prompt vẫn không có khóa
  // (ảnh vẫn gửi kèm nên lúc ra 2D, lúc ra người thật). refreshPrompt gắn lại khóa theo ảnh / hình dạng HIỆN TẠI: gỡ câu khóa cũ (mọi biến thể) rồi gắn câu mới,
  // giữ nguyên phần còn lại của prompt. Dùng cho chế độ Kể chuyện thường (không phải quảng cáo, mẹo, cây, lịch sử).
  const LOCK_LINE = /^(?:KHÓA HÌNH DẠNG NHÂN VẬT \(bắt buộc\):|CHARACTER SHAPE LOCK \(mandatory\):)/;
  const hasShapeLock = prompt => String(prompt || '').split('\n').some(line => LOCK_LINE.test(line.trim()));
  // Tỉ lệ khung đã có trong prompt (câu đầu «Video khung NGANG 16:9…» hoặc bản tiếng Anh): giữ đúng tỉ lệ đó, không thêm câu tỉ lệ khác.
  const aspectOfPrompt = text => ASPECTS.find(a => Object.values(RATIO_LEAD.video).some(set => text.includes(set[a]))) || '';
  function refreshPrompt(prompt, input = {}) {
    const text = String(prompt || '').trim(), found = aspectOfPrompt(text);
    const config = { ...options({ ...input, aspect: found || input.aspect }), aspect: found || input.aspect || '' };   // không biết tỉ lệ thì không thêm câu tỉ lệ (tránh ghi nhầm 16:9 vào cảnh dọc)
    if (!text || config.ad || config.tip) return text;
    const body = text.split('\n').filter(line => !LOCK_LINE.test(line.trim())).join('\n').trim();
    // Dòng «Audio:» là câu cấm tiếng cố định bằng tiếng Anh: bỏ ra khi nhận ngôn ngữ, không thì cảnh tiếng Việt ngắn bị coi là tiếng Anh.
    const spoken = body.split('\n').filter(line => !/^Audio:/i.test(line.trim())).join('\n');
    return finalPrompt(body, config, promptLanguage(spoken));
  }

  // Tách trả lời của Muse: {scenes: [{title, units: [đầu, cuối] | null, voiceover, prompt}], cast, done}.
  // Hiểu cả khuôn «CÂU: 1-3» (chuẩn) lẫn khuôn cũ «LỜI: …».
  function parseReply(reply, input = {}) {
    options(input);
    const lines = String(reply || '').replace(/\r\n?/g, '\n').split('\n');
    const scenes = [];
    let current = null, field = null, cast = '', done = false;
    const push = () => { if (current && (current.voiceover || current.prompt || current.image || current.units)) scenes.push(current); };
    for (const raw of lines) {
      if (DONE.test(raw.trim())) { done = true; break; }
      // Bỏ chữ đậm/nghiêng và gạch đầu dòng của markdown trước khi nhận nhãn.
      const line = raw.replace(/\*\*|__/g, '').replace(/^[\t ]*(?:[-•][\t ]+|\*[\t ]+)/, '');
      const head = line.match(HEAD);
      if (head && !PROMPT.test(head[2].split(/[:：]/)[0].trim())) {
        push();
        current = { title: `Cảnh ${head[1]}`, voiceover: '', prompt: '', image: '', units: null };
        field = null;
        const rest = head[2].trim();
        if (rest) { const lab = rest.match(LABEL); if (lab && (LOI.test(lab[1].trim()) || PROMPT.test(lab[1].trim()) || IMAGE.test(lab[1].trim()))) { field = LOI.test(lab[1].trim()) ? 'voiceover' : IMAGE.test(lab[1].trim()) ? 'image' : 'prompt'; current[field] = lab[2]; } }
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
        if (IMAGE.test(name)) { field = 'image'; current.image = label[2]; continue; }
        if (PROMPT.test(name)) { field = 'prompt'; current.prompt = label[2]; continue; }
      }
      if (field && line.trim()) current[field] += (current[field] ? '\n' : '') + line.trim();
    }
    push();
    const result = scenes.map((scene, index) => ({ title: `Cảnh ${index + 1}`, units: scene.units, voiceover: speechText(clean(scene.voiceover)), prompt: clean(scene.prompt), image: clean(scene.image) }))
      .filter(scene => scene.units || scene.voiceover || scene.prompt || scene.image);
    if (!result.length) throw Error('Chưa thấy cảnh nào trong trả lời của Muse. Cần các dòng «CẢNH 1», «CÂU: 1-3», «PROMPT: …». Gửi lại yêu cầu cho Muse hoặc dùng nút chia cảnh nhanh.');
    return { scenes: result, cast: clean(cast), done };
  }

  // Tương thích khuôn cũ: trả mảng cảnh {title, source, voiceover, prompt, durationSeconds}.
  function parseMuseReply(reply, input = {}) {
    const config = options(input);
    const parsed = parseReply(reply, config).scenes, language = tipEnglish(config) ? 'en' : promptLanguage(parsed.map(scene => scene.voiceover || scene.prompt).join(' '));
    return parsed.map((scene, index) => {
      const prompt = scene.prompt ? finalPrompt(scene.prompt, config, language) : scenePrompt(scene.voiceover, config);
      const image = config.tip ? (scene.image ? finalImagePrompt(scene.image, config, language) : tipImagePrompt(scene.voiceover, config, language)) : '';
      return { title: `Cảnh ${index + 1}`, source: scene.voiceover, voiceover: scene.voiceover, prompt, ...(config.tip ? { image } : {}), durationSeconds: sceneSeconds(scene.voiceover, config.seconds), ...(scene.units ? { units: scene.units } : {}) };
    });
  }

  /* Ghép trả lời của Muse (các dải câu + prompt) với lời THẬT của câu chuyện.
     - Lời đọc luôn là nguyên văn các câu; Muse không chép lại lời nên không thể sai lời.
     - Muse bỏ sót câu, đánh số chồng lên nhau hoặc gom quá dài → phần đó thành cảnh `offline` (prompt mẫu) để hỏi lại Muse.
     range = {from, to}: chỉ ghép trong dải câu này (dùng khi hỏi lại một đoạn). */
  function assembleScenes(units, parsed, input = {}, range = null) {
    const config = options(input);
    const lo = Math.max(1, range?.from || 1), hi = Math.min(units.length, range?.to || units.length);
    const limit = limitFor(units, config), language = tipEnglish(config) ? 'en' : promptLanguage(units.map(u => u.text).join(' '));
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
      // Mẹo vặt: thiếu prompt ảnh thì cũng là cảnh mẫu (hỏi lại Muse), vì không có ảnh thì không làm được clip.
      const complete = Boolean(item.prompt) && (!config.tip || Boolean(item.image));
      out.push({ title: '', source: voiceover, voiceover, visual: '', prompt: item.prompt ? finalPrompt(item.prompt, config, language) : scenePrompt(voiceover, config), ...(config.tip ? { image: item.image ? finalImagePrompt(item.image, config, language) : tipImagePrompt(voiceover, config, language) } : {}), durationSeconds: sceneSeconds(voiceover, config.seconds), units: [a, end], ...(complete ? {} : { offline: true }) });
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

  return { refreshPrompt, hasShapeLock, isLocked, setRate, ASPECTS, AD_CAMERA, AD_LOOK, AD_TONE, AD_LENGTHS, AD_TEMPLATES, adShotPlan, planAdShots, AD_MAX_CAMERA, adOptions, buildAdScriptInstruction, scriptFromReply, stripStepLabels, TIP_MINUTES, PLANT_MINUTES, HIST_MINUTES, TIP_SECS, tipPlan, tipParts, buildTipScriptInstruction, tipScriptFromReply, tipTrim, tipCheck, tipFix, MAX_SECONDS, MIN_SECONDS, sceneSeconds, sceneFloor, shortRuns, shortFix, NO_SPEECH, CHARS_PER_SECOND, options, detectLanguage, charsPerSecond, estimateSeconds, speechText, storyText, storyUnits, groupRanges, splitSentences, scriptVoice, scenePrompt, planStory, lockLine, buildMuseInstruction, buildUnderstandInstruction, parseUnderstanding, understandRanges, understandingText, parseReply, parseMuseReply, assembleScenes, scenesFromReply, checkAgainstScript, alignToScript, lintScenes, motionIssues, stripBeatTags, tipImagePrompt, finalImagePrompt, tipStartLine, subtitleChunks, srtTime, toSrt };
});
