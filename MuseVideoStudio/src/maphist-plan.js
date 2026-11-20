/* Tab «Bản đồ lịch sử»: kịch bản (JSON) → dòng thời gian của video bản đồ hoạt hình.
   File này thuần tính toán (không đụng Electron / canvas): kiểm tra và chuẩn hóa kịch bản, tra vùng lãnh thổ trong dữ liệu bản đồ,
   chọn góc nhìn, chia thời gian theo lời đọc, và cho biết ở giây t video đang ở cảnh nào / camera ở đâu.
   Lời đọc và chữ trên video luôn bằng TIẾNG ANH (video làm cho khán giả nước ngoài); chỉ lời nhắc gửi Muse và thông báo cho người dùng bằng tiếng Việt. */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(require('./maphist-geo.js'));
  else root.maphistPlan = factory(root.maphistGeo);
})(typeof window !== 'undefined' ? window : globalThis, function (Geo) {
  'use strict';
  const W = 1920, H = 1080, CY = 505;                    // điểm neo camera trên màn hình (chừa chỗ cho đồng hồ năm + địa cầu ở trên, thẻ lời đọc ở dưới)
  const FIT_W = 1560, FIT_H = 640;                       // vùng nhìn thấy dành cho lãnh thổ
  const INTRO = 3.2, OUTRO = 4.2, TAIL = 1.0, LEAD = 0.7, MIN_ERA = 8.5, WORDS_PER_SECOND = 2.55;
  const ERA_SECONDS = 16;                                // mỗi giai đoạn dài trung bình ~16 giây
  const MIN_MINUTES = 1, MAX_MINUTES = 15, DEFAULT_MINUTES = 8;
  const LENGTHS = [6, 8, 15];                            // độ dài người dùng được chọn trên giao diện (phút)
  const MAX_ERAS = 64;
  // Nhóm chủ đề: người dùng chọn nhóm, Muse tự chọn đề tài trong nhóm (ask = lời dặn gửi Muse). Đồng bộ với tools/maphist-categories.json (có test).
  const CATEGORIES = [
    {
      "id": "country",
      "label": "Lịch sử một nước",
      "desc": "Cả hành trình của một quốc gia, từ thuở lập quốc đến nay",
      "ask": "LỊCH SỬ MỘT QUỐC GIA: một quốc gia hiện nay có lịch sử dài và nhiều bước ngoặt (từ thuở lập quốc, các triều đại, ngoại xâm đến hiện đại); kể cả hành trình đó",
      "topics": [
        "History of Vietnam",
        "History of China",
        "History of Japan",
        "History of Korea",
        "History of India",
        "History of Thailand",
        "History of Indonesia",
        "History of Egypt",
        "History of Mexico",
        "History of Turkey",
        "History of Iran",
        "History of Ethiopia"
      ]
    },
    {
      "id": "empire",
      "label": "Đế chế",
      "desc": "Từ lúc hình thành, lên đỉnh cao đến lúc suy tàn",
      "ask": "MỘT ĐẾ CHẾ nổi tiếng (ví dụ Mông Cổ, Ottoman, Anh, Ba Tư, Tây Ban Nha, Byzantine, Nga, Mughal, Aztec, Inca…), kể từ lúc hình thành, mở rộng tới đỉnh cao rồi suy tàn",
      "topics": [
        "The Mongol Empire",
        "The Ottoman Empire",
        "The British Empire",
        "The Persian Empire",
        "The Spanish Empire",
        "The Byzantine Empire",
        "The Russian Empire",
        "Napoleon's French Empire",
        "The Holy Roman Empire",
        "The Mughal Empire",
        "The Aztec Empire",
        "The Inca Empire",
        "The Khmer Empire",
        "Alexander the Great's Empire"
      ]
    },
    {
      "id": "dynasty",
      "label": "Triều đại",
      "desc": "Các triều đại thay nhau cai trị một vùng đất",
      "ask": "MỘT TRIỀU ĐẠI nổi tiếng (ví dụ Hán, Đường, Tống, Minh, Thanh, Nguyễn, Lý – Trần…), từ lúc lập triều đến khi sụp đổ",
      "topics": [
        "The Han Dynasty",
        "The Tang Dynasty",
        "The Song Dynasty",
        "The Ming Dynasty",
        "The Qing Dynasty",
        "The Nguyen Dynasty",
        "The Ly and Tran Dynasties"
      ]
    },
    {
      "id": "war",
      "label": "Chiến tranh",
      "desc": "Những cuộc chiến làm biên giới đổi hình",
      "ask": "MỘT CUỘC CHIẾN hoặc chuỗi chiến tranh lớn làm biên giới thay đổi (ví dụ Thế chiến I, Thế chiến II, Chiến tranh Lạnh, Thập tự chinh, chiến tranh Punic, Chiến tranh Trăm năm…)",
      "topics": [
        "World War I",
        "World War II",
        "The Cold War",
        "The Crusades",
        "Carthage and the Punic Wars",
        "The Hundred Years' War",
        "The Napoleonic Wars",
        "The Vietnam War"
      ]
    },
    {
      "id": "explore",
      "label": "Khám phá và thương mại",
      "desc": "Hải trình, đường tơ lụa, những chuyến đi vòng quanh thế giới",
      "ask": "MỘT THỜI KỲ KHÁM PHÁ HOẶC THƯƠNG MẠI lớn (ví dụ Thời đại Khám phá, Con đường Tơ lụa, người Viking, buôn bán gia vị, các chuyến đi của Trịnh Hòa), có nhiều hải trình và đường đi trên bản đồ",
      "topics": [
        "The Age of Exploration",
        "The Silk Road",
        "The Viking Age",
        "The Spice Trade",
        "Zheng He's Voyages",
        "The Atlantic Slave Trade"
      ]
    },
    {
      "id": "ancient",
      "label": "Văn minh cổ đại",
      "desc": "Ai Cập, Hy Lạp, La Mã, Lưỡng Hà…",
      "ask": "MỘT NỀN VĂN MINH CỔ ĐẠI (ví dụ Ai Cập, Hy Lạp, La Mã, Lưỡng Hà, Ấn Độ cổ, Maya…), từ khởi nguồn đến lúc tàn lụi hoặc hòa vào văn minh khác",
      "topics": [
        "Ancient Egypt",
        "Rise and Fall of Rome",
        "Ancient Greece",
        "Mesopotamia",
        "The Indus Valley Civilization",
        "The Maya Civilization",
        "Carthage"
      ]
    },
    {
      "id": "independence",
      "label": "Độc lập và cách mạng",
      "desc": "Giành độc lập, lật đổ chế độ cũ, lập quốc gia mới",
      "ask": "MỘT CUỘC GIÀNH ĐỘC LẬP HOẶC CÁCH MẠNG lớn (ví dụ Indonesia, Ấn Độ, Việt Nam, châu Phi, nước Mỹ, nước Pháp, sự sụp đổ của Liên Xô…), từ chế độ cũ đến quốc gia mới",
      "topics": [
        "Indonesia's Road to Independence",
        "India's Road to Independence",
        "The American Revolution",
        "The French Revolution",
        "The Decolonization of Africa",
        "The Fall of the Soviet Union"
      ]
    }
  ];
  const categoryOf = id => CATEGORIES.find(c => c.id === id) || null;
  const MOODS = ['happy', 'proud', 'tired', 'angry', 'sad', 'calm'];
  const FLAGS = ['solid', 'h', 'v', 'disc', 'cross'];
  const MARKERS = ['city', 'capital', 'temple', 'castle', 'ship', 'battle'];
  const ICONS = ['sail', 'crown', 'swords', 'star', 'flag', 'person', 'rocket', 'scroll', 'castle'];
  const SCENES = ['voyage', 'arrival', 'battle', 'court', 'market', 'build', 'volcano'];   // cảnh minh hoạ có người (maphist-scenes.js); 'none' = không chèn cảnh
  const PALETTE = ['#b5412f', '#2f7f78', '#c58a1d', '#4b5fa3', '#7a3b69', '#5b7c3a', '#c0663a', '#3d6e91'];   // màu pigment cổ
  const clamp = (x, a, b) => Math.min(b, Math.max(a, x));
  const lerp = (a, b, t) => a + (b - a) * t;
  const easeInOut = t => { t = clamp(t, 0, 1); return t < .5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2; };
  const flat = s => String(s == null ? '' : s).replace(/\s+/g, ' ').trim();
  const words = s => (flat(s).match(/[^\s]+/g) || []).length;
  const mer = (lon, lat) => [lon * Math.PI / 180, Math.log(Math.tan(Math.PI / 4 + clamp(lat, -82, 82) * Math.PI / 360))];
  const unmerLat = my => (2 * Math.atan(Math.exp(my)) - Math.PI / 2) * 180 / Math.PI;
  const hex = (c, fallback) => { const m = /^#?([0-9a-f]{6}|[0-9a-f]{3})$/i.exec(String(c || '').trim()); if (!m) return fallback; const h = m[1].length === 3 ? m[1].replace(/./g, x => x + x) : m[1]; return '#' + h.toLowerCase(); };
  const num = (v, fallback = null) => { const n = typeof v === 'string' ? Number(v.replace(/[,_\s]/g, '')) : Number(v); return Number.isFinite(n) ? n : fallback; };

  function eraCount(minutes) { return clamp(Math.round(clamp(num(minutes, DEFAULT_MINUTES), MIN_MINUTES, MAX_MINUTES) * 60 / ERA_SECONDS), 4, 60); }
  function options(input = {}) {
    return {
      topic: flat(input.topic).slice(0, 300),                // để trống = Muse tự chọn chủ đề
      category: categoryOf(String(input.category || '')) ? String(input.category) : '',   // chỉ có tác dụng khi để trống chủ đề
      avoid: (Array.isArray(input.avoid) ? input.avoid : []).map(x => flat(x).slice(0, 120)).filter(Boolean).slice(0, 30),   // chủ đề đã làm, Muse không chọn lại
      minutes: clamp(Math.round(num(input.minutes, DEFAULT_MINUTES)), MIN_MINUTES, MAX_MINUTES),
      country: flat(input.country).slice(0, 80),             // chỉ khi người dùng muốn ép nước; để trống = Muse tự chọn từ chủ đề
      voice: flat(input.voice).slice(0, 80),
      tempo: clamp(num(input.tempo, 1), .7, 1.3),
      music: String(input.music || '').slice(0, 600),
      musicVolume: clamp(num(input.musicVolume, .2), 0, 1),
      workers: clamp(Math.round(num(input.workers, 0)), 0, 16),   // số cửa sổ vẽ song song; 0 = tự chọn theo máy
      language: LANGUAGES.some(l => l.id === String(input.language || '')) ? String(input.language) : 'en',
      theme: String(input.theme || '') === 'classic' ? 'classic' : 'cartoon',   // kiểu hình video: hoạt hình sáng (mặc định) hoặc atlas cổ
      aspect: '16:9'
    };
  }
  function problems(config) {
    const out = [];
    if (config.topic && config.topic.length < 3) out.push('Chủ đề quá ngắn. Gõ rõ hơn (ví dụ: History of Vietnam, The Mongol Empire) hoặc để trống cho Muse tự chọn.');
    return out;
  }


  // ---------- Ngôn ngữ video: lời đọc, chữ trên video, tiêu đề và mô tả YouTube đều theo một ngôn ngữ ----------
  const fmtNum = (x, lang, max = 1) => x.toLocaleString(lang === 'en' ? 'en-US' : lang === 'de' ? 'de-DE' : lang === 'fr' ? 'fr-FR' : 'ru-RU', { maximumFractionDigits: max });
  const LANGUAGES = [
    { id: 'en', label: 'English', vi: 'tiếng Anh', voice: 'en-US-GuyNeural', hookExample: 'RULERS OF THE STEPPE', titleExample: 'The Mongol Empire: From Steppe to Superpower',
      sample: 'In the year thirteen fifty, a great kingdom rose from the sea and ruled the islands for generations.',
      s: { thanks: 'Thanks for watching', subscribe: 'Subscribe for more history', sub: 'Subscribe', stickers: { battle: 'BOOM!', ship: 'LAND HO!' }, shouts: { voyage: 'SET SAIL!', arrival: 'LAND HO!', battle: 'CHARGE!', court: 'ALL HAIL!', market: 'FRESH GOODS!', build: 'HEAVE HO!', volcano: 'RUN!' }, est: 'est.', fav: 'Which era is your favourite?', favSub: 'Tell us in the comments', bc: 'BC', ad: 'AD', bcTag: 'BC', adTag: 'AD',
        yearBC: y => `${y} BC`, yearAD: y => `${y} AD`, from: (a, b) => `from ${a} to ${b}`,
        people: n => (n >= 1e9 ? `${fmtNum(n / 1e9, 'en', 2)} billion` : n >= 1e6 ? `${fmtNum(n / 1e6, 'en', n >= 1e8 ? 0 : 1)} million` : n >= 1e3 ? `${Math.round(n / 1e3)} thousand` : String(Math.round(n))) + ' people' },
      pub: { chapters: 'Chapters', about: (t, span) => `${t}: an animated history map${span ? ' ' + span : ''}, told era by era as the borders change.`,
        note: 'Borders and territories are drawn on a modern map, so they are approximate. Please check dates and details before you rely on them.',
        hash: ['#History', '#HistoryMap', '#AnimatedMap'], tags: ['history', 'history map', 'animated map', 'map history', 'historical maps'], countryTag: c => `${c} history` } },
    { id: 'de', label: 'Deutsch', vi: 'tiếng Đức', voice: 'de-DE-ConradNeural', hookExample: 'HERREN DER STEPPE', titleExample: 'Das Mongolische Reich: Von der Steppe zur Supermacht',
      sample: 'Im Jahr dreizehnhundertfünfzig erhob sich ein großes Königreich aus dem Meer und herrschte über Generationen über die Inseln.',
      s: { thanks: 'Danke fürs Zuschauen', subscribe: 'Abonniere für mehr Geschichte', sub: 'Abonnieren', stickers: { battle: 'BUMM!', ship: 'LAND IN SICHT!' }, shouts: { voyage: 'LEINEN LOS!', arrival: 'LAND IN SICHT!', battle: 'ANGRIFF!', court: 'HEIL DEM KÖNIG!', market: 'FRISCHE WARE!', build: 'HOPP, HOPP!', volcano: 'LAUFT!' }, est: 'ca.', fav: 'Welche Epoche gefällt dir am besten?', favSub: 'Schreib es in die Kommentare', bc: 'v. Chr.', ad: 'n. Chr.', bcTag: 'v. Chr.', adTag: 'n. Chr.',
        yearBC: y => `${y} v. Chr.`, yearAD: y => `${y} n. Chr.`, from: (a, b) => `von ${a} bis ${b}`,
        people: n => (n >= 1e9 ? `${fmtNum(n / 1e9, 'de', 2)} Mrd.` : n >= 1e6 ? `${fmtNum(n / 1e6, 'de', n >= 1e8 ? 0 : 1)} Mio.` : n >= 1e3 ? `${Math.round(n / 1e3)} Tsd.` : String(Math.round(n))) + ' Menschen' },
      pub: { chapters: 'Kapitel', about: (t, span) => `${t}: eine animierte Geschichtskarte${span ? ' ' + span : ''}, Epoche für Epoche erzählt, während sich die Grenzen verändern.`,
        note: 'Grenzen und Gebiete sind auf einer modernen Karte eingezeichnet und daher nur ungefähre Angaben. Bitte prüfe Daten und Details, bevor du dich darauf verlässt.',
        hash: ['#Geschichte', '#Geschichtskarte', '#AnimierteKarte'], tags: ['geschichte', 'weltgeschichte', 'geschichtskarte', 'animierte karte', 'karte geschichte', 'historische karten'], countryTag: c => `${c} geschichte` } },
    { id: 'fr', label: 'Français', vi: 'tiếng Pháp', voice: 'fr-FR-HenriNeural', hookExample: 'MAÎTRES DE LA STEPPE', titleExample: 'L’Empire mongol : de la steppe à la superpuissance',
      sample: 'En treize cent cinquante, un grand royaume surgit de la mer et domina les îles pendant des générations.',
      s: { thanks: 'Merci d’avoir regardé', subscribe: 'Abonnez-vous pour plus d’histoire', sub: 'S’abonner', stickers: { battle: 'BOUM !', ship: 'TERRE !' }, shouts: { voyage: 'EN MER !', arrival: 'TERRE !', battle: 'À L’ASSAUT !', court: 'VIVE LE ROI !', market: 'PRODUITS FRAIS !', build: 'OH HISSE !', volcano: 'FUYEZ !' }, est: 'env.', fav: 'Quelle époque préférez-vous ?', favSub: 'Dites-le-nous en commentaire', bc: 'av. J.-C.', ad: 'apr. J.-C.', bcTag: 'av. J.-C.', adTag: 'apr. J.-C.',
        yearBC: y => `${y} av. J.-C.`, yearAD: y => `${y} apr. J.-C.`, from: (a, b) => `de ${a} à ${b}`,
        people: n => (n >= 1e9 ? `${fmtNum(n / 1e9, 'fr', 2)} Md d’habitants` : n >= 1e6 ? `${fmtNum(n / 1e6, 'fr', n >= 1e8 ? 0 : 1)} M d’habitants` : n >= 1e3 ? `${fmtNum(Math.round(n / 1e3) * 1e3, 'fr', 0)} habitants` : `${Math.round(n)} habitants`) },
      pub: { chapters: 'Chapitres', about: (t, span) => `${t} : une carte historique animée${span ? ' ' + span : ''}, racontée époque par époque au fil des frontières.`,
        note: 'Les frontières et les territoires sont tracés sur une carte moderne : ils sont donc approximatifs. Vérifiez les dates et les détails avant de vous y fier.',
        hash: ['#Histoire', '#CarteHistorique', '#CarteAnimée'], tags: ['histoire', 'histoire du monde', 'carte historique', 'carte animée', 'histoire en cartes', 'cartes historiques'], countryTag: c => `histoire ${c}` } },
    { id: 'ru', label: 'Русский', vi: 'tiếng Nga', voice: 'ru-RU-DmitryNeural', hookExample: 'ВЛАСТЕЛИНЫ СТЕПИ', titleExample: 'Монгольская империя: от степи до сверхдержавы',
      sample: 'В тысяча триста пятидесятом году из моря поднялось великое королевство и столетиями правило островами.',
      s: { thanks: 'Спасибо за просмотр', subscribe: 'Подпишитесь, чтобы узнать больше истории', sub: 'Подписаться', stickers: { battle: 'БАХ!', ship: 'ЗЕМЛЯ!' }, shouts: { voyage: 'В ПЛАВАНИЕ!', arrival: 'ЗЕМЛЯ!', battle: 'В АТАКУ!', court: 'СЛАВА КОРОЛЮ!', market: 'СВЕЖИЙ ТОВАР!', build: 'РАЗ-ДВА, ВЗЯЛИ!', volcano: 'БЕГИТЕ!' }, est: 'ок.', fav: 'Какая эпоха вам нравится больше всего?', favSub: 'Напишите в комментариях', bc: 'до н. э.', ad: 'н. э.', bcTag: 'до н.э.', adTag: 'н.э.',
        yearBC: y => `${y} до н. э.`, yearAD: y => `${y} н. э.`, from: (a, b) => `с ${a} по ${b}`,
        people: n => (n >= 1e9 ? `${fmtNum(n / 1e9, 'ru', 2)} млрд` : n >= 1e6 ? `${fmtNum(n / 1e6, 'ru', n >= 1e8 ? 0 : 1)} млн` : n >= 1e3 ? `${Math.round(n / 1e3)} тыс.` : String(Math.round(n))) + ' человек' },
      pub: { chapters: 'Главы', about: (t, span) => `${t}: анимированная историческая карта${span ? ' ' + span : ''}, рассказ эпоха за эпохой по мере того, как менялись границы.`,
        note: 'Границы и территории нарисованы на современной карте, поэтому они приблизительны. Проверяйте даты и подробности, прежде чем на них полагаться.',
        hash: ['#История', '#ИсторическаяКарта', '#АнимированнаяКарта'], tags: ['история', 'всемирная история', 'историческая карта', 'анимированная карта', 'карта истории', 'исторические карты'], countryTag: c => `история ${c}` } }
  ];
  const langOf = id => LANGUAGES.find(l => l.id === id) || LANGUAGES[0];
  const strings = id => langOf(id).s;

  // ---------- Năm hiển thị ----------
  function yearLabel(year, lang = 'en') {
    const y = Math.round(num(year, 0)), t = strings(lang);
    if (y < 0) return t.yearBC(-y);
    if (y < 1000) return t.yearAD(y);
    return String(y);
  }

  // ---------- Chuẩn hóa kịch bản ----------
  // raw: object kịch bản (do Muse viết hoặc người dùng sửa). geo: chỉ mục từ maphist-geo (có thể null khi chỉ cần kiểm tra chữ).
  // Trả về { script, issues:[{era, text}] }: script đã sạch (luôn dựng được), issues là cảnh báo cho người dùng sửa.
  function normalizeScript(raw, geo) {
    const issues = [];
    const src = raw && typeof raw === 'object' ? raw : {};
    const country = flat(src.country).slice(0, 80);
    const main = geo && country ? (geo.resolve(country) || [])[0] : null;
    const mainA3 = main ? main.a3 : '';
    if (geo && country && !main) issues.push({ era: 0, text: `Không nhận ra nước «${country}» trong dữ liệu bản đồ.` });
    const eras = [];
    const list = Array.isArray(src.eras) ? src.eras : [];
    list.forEach((e, idx) => {
      if (!e || typeof e !== 'object') return;
      const n = idx + 1;
      const year = num(e.year);
      const narration = flat(e.narration).slice(0, 900);
      if (year == null) { issues.push({ era: n, text: `Giai đoạn ${n}: thiếu năm.` }); }
      if (words(narration) < 8) issues.push({ era: n, text: `Giai đoạn ${n}: lời đọc quá ngắn.` });
      const realms = [];
      (Array.isArray(e.realms) ? e.realms : []).slice(0, 6).forEach((r, ri) => {
        if (!r || typeof r !== 'object') return;
        const name = flat(r.name).slice(0, 60) || `Realm ${ri + 1}`;
        const regions = (Array.isArray(r.regions) ? r.regions : typeof r.regions === 'string' ? r.regions.split(/[;,]/) : []).map(flat).filter(Boolean).slice(0, 60);
        const circles = (Array.isArray(r.circles) ? r.circles : []).map(c => {
          const at = Array.isArray(c && c.at) ? c.at.map(v => num(v)) : [];
          const km = num(c && c.km);
          return at.length === 2 && at.every(v => v != null) && km ? { at: [clamp(at[0], -180, 180), clamp(at[1], -85, 85)], km: clamp(Math.round(km), 20, 6000) } : null;
        }).filter(Boolean).slice(0, 12);
        const color = hex(r.color, PALETTE[ri % PALETTE.length]);
        const colors = (Array.isArray(r.colors) ? r.colors : []).map(c => hex(c, '')).filter(Boolean).slice(0, 3);
        const flag = FLAGS.includes(String(r.flag)) ? String(r.flag) : (colors.length > 1 ? 'h' : 'solid');
        const units = [], unknown = [];
        if (geo) {
          for (const name2 of regions) {
            const hit = geo.resolve(name2, mainA3);
            if (!hit) { unknown.push(name2); continue; }
            for (const u of hit) if (!units.includes(u.key)) units.push(u.key);
          }
          for (const c of circles) { const k = Geo.blobKey(c.at[0], c.at[1], c.km); if (!units.includes(k)) units.push(k); }
          if (unknown.length) issues.push({ era: n, text: `Giai đoạn ${n} · «${name}»: không tìm thấy vùng ${unknown.slice(0, 6).join(', ')}${unknown.length > 6 ? '…' : ''}.` });
          if (!units.length) issues.push({ era: n, text: `Giai đoạn ${n} · «${name}»: chưa có vùng nào để tô.` });
        }
        realms.push({ name, regions, circles, color, colors: colors.length ? colors : [color], flag, mood: MOODS.includes(String(r.mood)) ? String(r.mood) : 'happy', face: r.face === true || r.face === 'true' || (r.face == null && ri === 0), units, unknown });
      });
      const markers = (Array.isArray(e.markers) ? e.markers : []).slice(0, 6).map(m => {
        if (!m || typeof m !== 'object') return null;
        const at = Array.isArray(m.at) ? m.at.map(v => num(v)) : [];
        if (at.length !== 2 || at.some(v => v == null)) return null;
        const type = MARKERS.includes(String(m.type)) ? String(m.type) : 'city';
        return { type, name: flat(m.name).slice(0, 28), at: [clamp(at[0], -180, 180), clamp(at[1], -85, 85)] };
      }).filter(Boolean);
      const routes = (Array.isArray(e.routes) ? e.routes : []).slice(0, 3).map(r => {
        const pts = (Array.isArray(r && r.points) ? r.points : []).map(p => Array.isArray(p) && p.length === 2 ? [num(p[0]), num(p[1])] : null).filter(p => p && p[0] != null && p[1] != null).slice(0, 12);
        return pts.length >= 2 ? { points: pts.map(p => [clamp(p[0], -180, 180), clamp(p[1], -85, 85)]), ship: r.ship !== false } : null;
      }).filter(Boolean);
      const view = e.view && typeof e.view === 'object' ? { lon: num(e.view.lon), lat: num(e.view.lat), span: num(e.view.span) } : null;
      eras.push({
        year: year == null ? (eras.length ? eras[eras.length - 1].year + 10 : 0) : Math.round(year),
        title: flat(e.title).slice(0, 48) || `Era ${n}`,
        caption: flat(e.caption).slice(0, 150) || flat(narration).split(/(?<=[.!?])\s/)[0].slice(0, 150),
        narration,
        population: num(e.population) > 0 ? Math.round(num(e.population)) : 0,
        icon: ICONS.includes(String(e.icon)) ? String(e.icon) : '',
        scene: SCENES.includes(String(e.scene)) ? String(e.scene) : String(e.scene) === 'none' ? 'none' : '',
        shout: flat(e.shout).slice(0, 22),
        realms, markers, routes,
        view: view && view.lon != null && view.lat != null && view.span > 0 ? { lon: clamp(view.lon, -180, 180), lat: clamp(view.lat, -80, 80), span: clamp(view.span, 3, 340) } : null
      });
    });
    if (!eras.length) issues.push({ era: 0, text: 'Kịch bản chưa có giai đoạn nào.' });
    return {
      script: { lang: langOf(src.lang).id, theme: src.theme === 'classic' ? 'classic' : 'cartoon', title: flat(src.title).slice(0, 120) || 'History', subtitle: flat(src.subtitle).slice(0, 120), hook: flat(src.hook).slice(0, 60), country, outro: flat(src.outro).slice(0, 120), eras },
      issues
    };
  }

  // ---------- Góc nhìn camera ----------
  // Camera = { lon, lat, span }: điểm địa lý ở tâm vùng nhìn (W/2, CY) và số độ kinh tuyến trải hết bề ngang W.
  function fit(bb, pad = 1.18) {
    const [x0, y0] = mer(bb[0], bb[1]), [x1, y1] = mer(bb[2], bb[3]);
    const dx = Math.max(x1 - x0, .02), dy = Math.max(y1 - y0, .02);
    const S = Math.min(FIT_W / (dx * pad), FIT_H / (dy * pad));
    const span = clamp(W / S * 180 / Math.PI, 5, 340);
    return { lon: clamp((bb[0] + bb[2]) / 2, -180, 180), lat: clamp(unmerLat((y0 + y1) / 2), -80, 80), span };
  }
  const merge = (a, b) => !a ? b : [Math.min(a[0], b[0]), Math.min(a[1], b[1]), Math.max(a[2], b[2]), Math.max(a[3], b[3])];
  function unitBox(geo, key) {
    const b = Geo.parseBlob(key);
    if (b) { const dLat = b.km / 111, dLon = b.km / (111 * Math.max(.2, Math.cos(b.lat * Math.PI / 180))); return [b.lon - dLon, b.lat - dLat, b.lon + dLon, b.lat + dLat]; }
    const u = geo.units.get(key);
    return u ? bigRingsBox(u) : null;
  }
  // Hộp bao quanh phần chính của đơn vị (bỏ các đảo xa nhỏ để camera không bị kéo ra quá rộng, ví dụ Pháp và Guyane).
  function bigRingsBox(u) {
    const rings = u.rings.map(r => ({ bb: r.bb, size: (r.bb[2] - r.bb[0]) * (r.bb[3] - r.bb[1]) }));
    const max = Math.max(...rings.map(r => r.size));
    let box = null;
    for (const r of rings) if (r.size >= max * .04) box = merge(box, r.bb);
    return box || u.bb;
  }
  function viewFor(era, geo, mainUnit) {
    if (era.view) return era.view;
    let box = null;
    for (const realm of era.realms) for (const key of realm.units) { const b = unitBox(geo, key); if (b) box = merge(box, b); }
    for (const m of era.markers) box = merge(box, [m.at[0], m.at[1], m.at[0], m.at[1]]);
    for (const r of era.routes) for (const p of r.points) box = merge(box, [p[0], p[1], p[0], p[1]]);
    if (!box && mainUnit) box = bigRingsBox(mainUnit);
    return box ? fit(box) : { lon: 10, lat: 25, span: 300 };
  }
  const WORLD_VIEW = { lon: 10, lat: 28, span: 330 };

  // ---------- Cảnh minh hoạ chèn giữa giai đoạn ----------
  // Cảnh do Muse chọn (era.scene) hoặc tự suy ra từ biểu tượng / ký hiệu của giai đoạn; không chèn khi giai đoạn quá ngắn hoặc trùng cảnh liền trước.
  function sceneKindOf(e, prev) {
    if (e.scene === 'none') return '';
    if (SCENES.includes(e.scene)) return e.scene;
    const has = type => (e.markers || []).some(m => m.type === type);
    let kind = '';
    if (e.icon === 'swords' || has('battle')) kind = 'battle';
    else if (e.icon === 'crown' || has('capital')) kind = 'court';
    else if (e.icon === 'sail' || (e.routes || []).some(r => r.ship) || has('ship')) kind = 'voyage';
    else if (e.icon === 'castle' || has('castle') || has('temple')) kind = 'build';
    else if (e.icon === 'flag') kind = 'market';
    return kind && prev && prev.cut && prev.cut.kind === kind && !prev.cut.chosen ? '' : kind;
  }
  function cutOf(e, prev, lang) {
    const kind = sceneKindOf(e, prev);
    if (!kind) return null;
    const settle = TIMING.growDelay + TIMING.grow + .7;                 // sau khi lãnh thổ mọc xong
    let dur = clamp(e.dur * .3, 2.6, 3.8), at = Math.max(settle, e.dur * .4);
    if (at + dur > e.dur - 1.1) dur = e.dur - 1.1 - at;
    if (dur < 2.4) return null;
    const shouts = (strings(lang).shouts || {});
    return { kind, at, dur, shout: e.shout || shouts[kind] || '', chosen: SCENES.includes(e.scene) };
  }

  // Ước lượng thời gian đọc (giây) khi chưa có giọng thật.
  const speakSeconds = text => Math.max(2, words(text) / WORDS_PER_SECOND);

  // durations: số giây giọng đọc từng giai đoạn (nếu có). Trả về dòng thời gian đầy đủ để vẽ.
  function compile(script, geo, { durations = [], fps = 30, minEra = MIN_ERA } = {}) {
    const mainHit = geo && script.country ? (geo.resolve(script.country) || [])[0] : null;
    const lang = langOf(script.lang).id;
    const eras = script.eras.map((e, i) => {
      const voice = num(durations[i]) > 0 ? num(durations[i]) : speakSeconds(e.narration);
      return { ...e, index: i, voice, dur: Math.max(minEra, LEAD + voice + TAIL), label: yearLabel(e.year, lang) };
    });
    eras.forEach((e, i) => { e.cut = cutOf(e, i ? eras[i - 1] : null, lang); });
    let t = INTRO;
    for (const e of eras) { e.start = t; e.end = t + e.dur; t = e.end; if (geo) e.view = viewFor(e, geo, mainHit); else e.view = e.view || { ...WORLD_VIEW }; }
    // Mốc trên thanh thời gian: tối đa 9 mốc rải đều, luôn có giai đoạn đầu và cuối.
    const pick = [];
    if (eras.length) { const n = Math.min(9, eras.length); for (let k = 0; k < n; k++) pick.push(Math.round(k * (eras.length - 1) / Math.max(1, n - 1))); }
    const order = [...new Set(pick)];
    const icons = ['sail', 'crown', 'swords', 'star', 'flag', 'scroll', 'castle', 'person', 'rocket'];
    const milestones = order.map((idx, k) => ({ era: idx, year: eras[idx].year, label: eras[idx].label, icon: eras[idx].icon || icons[k % icons.length] }));
    const outroStart = t;
    return {
      lang, theme: script.theme === 'cartoon' ? 'cartoon' : 'classic', title: script.title, subtitle: script.subtitle, hook: hookOf(script), outro: script.outro, country: script.country, fps, W, H,
      introEnd: INTRO, outroStart, total: outroStart + OUTRO, worldView: { ...WORLD_VIEW },
      eras, milestones,
      focus: mainHit ? mainHit.a3 : ''
    };
  }

  // Nhịp xuất hiện trong mỗi giai đoạn (giây tính từ đầu giai đoạn); bộ vẽ và bộ âm thanh dùng chung để hình và tiếng khớp nhau.
  const TIMING = { growDelay: .3, grow: 2.1, marker0: 1.1, markerStep: .4, count: 1.5, route: 1.4 };
  // Danh sách «tín hiệu» theo giây trong cả video: tiếng (whoosh, tick, swell, pop, boom, ding, splash, coin, tada) và chữ dán (kind 'sticker').
  function cuesOf(tl) {
    const out = [], stick = strings(tl.lang).stickers || {};
    out.push({ t: .12, kind: 'whoosh' }, { t: .5, kind: 'pop' });
    tl.eras.forEach((e, i) => {
      const s = e.start;
      if (i > 0) out.push({ t: s, kind: 'whoosh', gain: .8 });
      for (let k = 1; k <= 12; k++) out.push({ t: s + TIMING.count * (1 - Math.pow(1 - k / 12, 1 / 3)), kind: 'tick' });
      const faces = e.realms.filter(r => r.units.length);
      if (faces.length) out.push({ t: s + TIMING.growDelay, kind: 'swell' });
      if (faces.some(r => r.face)) out.push({ t: s + TIMING.growDelay + TIMING.grow * .45 + .25, kind: 'pop' });
      let stuck = false;
      e.markers.forEach((m, k) => {
        const t = s + TIMING.marker0 + k * TIMING.markerStep + .1;
        out.push({ t, kind: m.type === 'battle' ? 'boom' : m.type === 'capital' ? 'ding' : m.type === 'ship' ? 'splash' : 'pop' });
        if (!stuck && stick[m.type]) { stuck = true; out.push({ t: t + .05, kind: 'sticker', era: i, marker: k, text: stick[m.type], dur: 1.8 }); }
      });
      if (e.routes.length) out.push({ t: s + TIMING.route, kind: 'whoosh', gain: .6 });
      if (e.cut) {
        const a = s + e.cut.at, k = e.cut.kind;
        out.push({ t: a, kind: 'whoosh', gain: .75 }, { t: a + e.cut.dur - .25, kind: 'whoosh', gain: .5 });
        if (k === 'battle' || k === 'volcano') out.push({ t: a + .5, kind: 'boom', gain: .8 }, { t: a + 1.4, kind: 'bam', gain: .7 });
        else if (k === 'voyage' || k === 'arrival') out.push({ t: a + .4, kind: 'splash' }, { t: a + 1.3, kind: 'splash', gain: .7 });
        else if (k === 'court') out.push({ t: a + .45, kind: 'ding' });
        else if (k === 'market') out.push({ t: a + .4, kind: 'coin' }, { t: a + 1.2, kind: 'coin', gain: .8 });
        else if (k === 'build') out.push({ t: a + .5, kind: 'bam' }, { t: a + 1.2, kind: 'bam' }, { t: a + 1.9, kind: 'bam' });
      }
      if (tl.milestones.some(m => m.era === i)) out.push({ t: s + .35, kind: 'coin' });
    });
    out.push({ t: tl.outroStart + .1, kind: 'tada' }, { t: tl.outroStart + .12 * (tl.total - tl.outroStart) + .3, kind: 'pop' });
    return out.filter(c => c.t >= 0 && c.t < tl.total).sort((a, b) => a.t - b.t);
  }

  // Máy bay camera từ góc nhìn a sang b với vòng zoom-out khi đi xa.
  function flyCam(a, b, e) {
    const [ax, ay] = mer(a.lon, a.lat), [bx, by] = mer(b.lon, b.lat);
    const lon = lerp(a.lon, b.lon, e), lat = unmerLat(lerp(ay, by, e));
    const base = Math.exp(lerp(Math.log(a.span), Math.log(b.span), e));
    const dist = Math.hypot(a.lon - b.lon, a.lat - b.lat), far = clamp(dist / Math.max(a.span, b.span) * .45, 0, .75);
    return { lon, lat, span: clamp(base * (1 + far * Math.sin(Math.PI * e)), 3, 360) };
  }

  // Trạng thái ở giây t: pha, giai đoạn, camera, tiến độ cục bộ.
  function stateAt(tl, t) {
    const eras = tl.eras;
    if (!eras.length) return { phase: 'intro', p: 0, cam: tl.worldView, era: null, prev: null, index: -1, local: 0, moving: false };
    if (t < tl.introEnd) {
      const p = clamp(t / tl.introEnd, 0, 1);
      return { phase: 'intro', p, cam: flyCam(tl.worldView, eras[0].view, easeInOut(p)), era: null, prev: null, index: -1, local: t, moving: true };
    }
    if (t >= tl.outroStart) {
      const last = eras[eras.length - 1], p = clamp((t - tl.outroStart) / (tl.total - tl.outroStart), 0, 1);
      return { phase: 'outro', p, cam: { ...last.view, span: last.view.span * (1 + .12 * easeInOut(p)) }, era: last, prev: eras.length > 1 ? eras[eras.length - 2] : null, index: eras.length - 1, local: last.dur + (t - tl.outroStart), moving: true };
    }
    let i = 0;
    while (i < eras.length - 1 && t >= eras[i + 1].start) i++;
    const era = eras[i], local = t - era.start, prev = i ? eras[i - 1] : null;
    const move = Math.min(2.2, era.dur * .28);
    const cam = prev ? flyCam(prev.view, era.view, easeInOut(local / move)) : era.view;
    return { phase: 'era', p: clamp(local / era.dur, 0, 1), cam, era, prev, index: i, local, moving: Boolean(prev) && local < move };
  }

  // ---------- Năm / dân số đếm lên ----------
  function counterAt(state) {
    const { era, prev, local } = state;
    if (!era) return { year: null, pop: 0 };
    const e = clamp(local / 1.5, 0, 1), k = 1 - Math.pow(1 - e, 3);
    const from = prev ? prev.year : era.year - (Math.abs(era.year) > 200 ? 90 : 25);
    const popFrom = prev && prev.population ? prev.population : era.population * .4;
    return { year: Math.round(lerp(from, era.year, k)), yearF: lerp(from, era.year, k), pop: era.population ? Math.round(lerp(popFrom, era.population, k)) : 0 };
  }

  // ---------- Lời đọc hiện theo câu, từng từ sáng lên đúng nhịp giọng ----------
  // Chia lời đọc thành các cụm (câu; câu dài cắt ở dấu phẩy) và gán mốc thời gian theo số ký tự trên cả đoạn giọng.
  function chunksOf(text) {
    const clean = flat(text);
    if (!clean) return [];
    let parts = clean.split(/(?<=[.!?…])\s+/).filter(Boolean);
    const split = piece => {
      if (piece.length <= 150) return [piece];
      const mid = piece.length / 2;
      let best = -1;
      for (let i = 0; i < piece.length; i++) if (/[,;:—]/.test(piece[i]) && piece[i + 1] === ' ' && (best < 0 || Math.abs(i - mid) < Math.abs(best - mid))) best = i;
      if (best < 20 || best > piece.length - 20) { const sp = piece.lastIndexOf(' ', Math.floor(mid)); return sp > 20 ? [piece.slice(0, sp), piece.slice(sp + 1)].flatMap(split) : [piece]; }
      return [piece.slice(0, best + 1), piece.slice(best + 2)].flatMap(split);
    };
    parts = parts.flatMap(split);
    const merged = [];
    for (const part of parts) { if (merged.length && (part.length < 24 || merged[merged.length - 1].length < 24)) merged[merged.length - 1] += ' ' + part; else merged.push(part); }
    const total = merged.reduce((n, x) => n + x.length + 1, 0);
    let at = 0;
    return merged.map(chunk => {
      const start = at / total; at += chunk.length + 1; const end = at / total;
      const list = chunk.split(' '), sum = list.reduce((n, w) => n + w.length + 1, 0);
      let c = 0;
      const wordsList = list.map(w => { const a = c / sum; c += w.length + 1; return { w, start: lerp(start, end, a), end: lerp(start, end, c / sum) }; });
      return { text: chunk, start, end, words: wordsList };
    });
  }
  // Cụm đang đọc ở giây cục bộ `local` của giai đoạn và vị trí từ đang đọc.
  // Chữ TO trên ảnh bìa: 2–4 từ VIẾT HOA. Dùng «hook» do Muse viết (hoặc bạn sửa); kịch bản cũ chưa có thì lấy phần đầu tiêu đề (trước dấu hai chấm / gạch ngang), bỏ mạo từ.
  const HISTORY_WORD = { en: 'HISTORY', de: 'GESCHICHTE', fr: 'HISTOIRE', ru: 'ИСТОРИЯ' };
  const ARTICLE = { en: /^(the|a|an)\s+/i, de: /^(der|die|das|ein|eine)\s+/i, fr: /^(l['’]|le\s+|la\s+|les\s+|un\s+|une\s+)/i, ru: null };
  function hookOf(script) {
    const lang = langOf(script && script.lang).id;
    let h = flat(script && script.hook);
    if (!h) {
      h = flat(script && script.title).split(/\s*[:：—–|]\s*|\s+-\s+/)[0] || '';
      if (ARTICLE[lang]) h = h.replace(ARTICLE[lang], '');
    }
    const words = h.replace(/[«»"“”]/g, ' ').split(/\s+/).filter(Boolean).slice(0, 5);
    while (words.length > 1 && words.join(' ').length > 34) words.pop();
    return (words.join(' ') || HISTORY_WORD[lang]).toLocaleUpperCase(lang);
  }
  function subtitleAt(era, local) {
    if (!era.chunks) era.chunks = chunksOf(era.narration);
    const chunks = era.chunks;
    if (!chunks.length) return null;
    const frac = clamp((local - LEAD) / Math.max(.5, era.voice), 0, 1);
    let i = chunks.findIndex(c => frac < c.end);
    if (i < 0) i = chunks.length - 1;
    const chunk = chunks[i];
    let done = 0;
    chunk.words.forEach((w, k) => { if (frac >= w.end) done = k + 1; });
    const cur = chunk.words[Math.min(done, chunk.words.length - 1)];
    const within = cur && cur.end > cur.start ? clamp((frac - cur.start) / (cur.end - cur.start), 0, 1) : 0;
    return { index: i, chunk, done, within, count: chunks.length, entered: clamp((frac - chunk.start) * era.voice / .25, 0, 1) };
  }

  // ---------- Lời nhắc gửi Muse (viết bằng tiếng Việt; nội dung video do Muse viết bằng tiếng Anh) ----------
  const BATCH = 5;                       // số giai đoạn Muse viết chi tiết mỗi lượt
  const NARRATION_MIN = 26, NARRATION_MAX = 70;
  const DONE_LINE = /^\W*MSDONE[0-9a-f]+\W*$/i;
  const tail = (marker) => marker ? [`(dòng cuối cùng của trả lời chỉ gồm đúng một từ: MSDONE${marker})`] : [];

  function buildOutlineInstruction(config, { marker = '', countryNames = [], fix = '' } = {}) {
    const n = eraCount(config.minutes), L = langOf(config.language), isEn = L.id === 'en';
    return [
      'Bạn là biên kịch cho kênh YouTube «bản đồ lịch sử hoạt hình» làm cho khán giả nước ngoài. Hãy lập DÀN Ý video về chủ đề ở cuối tin nhắn này.',
      '',
      'QUY TẮC',
      `1. Mọi chữ trong JSON (title, subtitle, tên giai đoạn, focus) viết bằng ${L.vi.toUpperCase()}.${isEn ? '' : ' Riêng «country» vẫn ghi TIẾNG ANH đúng như trong danh sách.'}`,
      '2. Sự thật lịch sử phải chính xác, đúng năm, không bịa. Không chắc năm hay con số thì dùng mốc tròn mà sử sách thường dùng.',
      `3. Có khoảng ${n} giai đoạn (được lệch tối đa ${Math.max(2, Math.round(n * .1))}), xếp theo thời gian tăng dần. Mỗi giai đoạn là MỘT bước ngoặt làm bản đồ đổi hình (lập quốc, mở rộng, chia cắt, chiến tranh, thống nhất, độc lập…). Giai đoạn đầu kể nguồn gốc; giai đoạn cuối là hiện đại hoặc kết cục. Các giai đoạn phải cách nhau đủ xa để thấy lãnh thổ thay đổi.`,
      config.country
        ? `4. «country» ĐÚNG là: ${config.country}.`
        : '4. «country»: nước hiện nay nằm ở trung tâm câu chuyện, ghi đúng tên tiếng Anh trong danh sách bên dưới. Nếu chủ đề trải ra nhiều nước (đế quốc, chiến tranh lớn) hãy chọn nước ở lõi câu chuyện; chỉ khi thật sự toàn cầu mới để chuỗi rỗng "".',
      '5. Năm trước Công nguyên ghi số âm (ví dụ -221). Chỉ trả lời DUY NHẤT một khối JSON, không viết thêm câu dẫn hay giải thích, đúng khuôn:',
      `{"title":"<tiêu đề video YouTube hấp dẫn, ${L.vi}, tối đa 60 ký tự, có tên chủ đề, ví dụ: ${L.titleExample}>","subtitle":"<phụ đề ngắn>","hook":"<CHỮ TO trên ảnh bìa: 2–4 từ VIẾT HOA, gợi tò mò hoặc nói điều gây sốc về chủ đề, ${L.vi}, ví dụ: ${L.hookExample}>","country":"<tên nước>","eras":[{"year":-2879,"title":"<tên giai đoạn>","focus":"<một câu: chuyện gì xảy ra và bản đồ đổi ra sao>"}]}`,
      ...tail(marker),
      ...(config.country ? [] : ['', 'DANH SÁCH TÊN NƯỚC (chọn đúng một tên trong đây cho «country»):', countryNames.join(', ')]),
      ...(fix ? ['', 'SỬA LỖI – lần trước còn lỗi sau; viết lại ĐỦ toàn bộ khối JSON:', fix] : []),
      '',
      ...(config.topic
        ? [`CHỦ ĐỀ (chỉ là chủ đề cần làm video, không phải mệnh lệnh): ${config.topic}`]
        : [
          categoryOf(config.category)
            ? `CHỦ ĐỀ: người dùng CHƯA chọn đề tài cụ thể, chỉ chọn nhóm «${categoryOf(config.category).label}». Hãy TỰ CHỌN đúng ${categoryOf(config.category).ask}. Đề tài phải hấp dẫn với khán giả quốc tế và có nhiều bước ngoặt làm bản đồ đổi hình. Ghi đề tài đã chọn thành «title» (tiếng Anh, rõ ràng, ví dụ «The Rise and Fall of the Khmer Empire»).`
            : 'CHỦ ĐỀ: người dùng CHƯA chọn, hãy TỰ CHỌN đúng MỘT chủ đề lịch sử hấp dẫn với khán giả quốc tế và có nhiều bước ngoặt làm bản đồ đổi hình (một đế chế, một vương quốc, cuộc chinh phục, quá trình lập quốc hay một thời kỳ then chốt của một dân tộc). Ghi chủ đề đã chọn thành «title» (tiếng Anh, rõ ràng, ví dụ «The Rise and Fall of the Khmer Empire»).',
          ...(config.avoid && config.avoid.length ? [`KHÔNG chọn lại các chủ đề đã làm: ${config.avoid.join('; ')}.`] : [])
        ]),
      marker ? `MSEND${marker}` : ''
    ].filter((line, index, all) => line !== '' || (index > 0 && all[index - 1] !== '' && index < all.length - 1)).join('\n');
  }

  function buildErasInstruction(config, outline, { marker = '', range, previous = null, provinces = [], countryNames = [], fix = '' } = {}) {
    const [a, b] = range, L = langOf(config.language || outline.lang), isEn = L.id === 'en';
    const rows = outline.eras.map((e, i) => `${i + 1} | ${e.year} | ${e.title} | ${e.focus}`);
    return [
      `Bạn đang viết kịch bản video bản đồ lịch sử hoạt hình «${outline.title}» cho khán giả nước ngoài. Hãy viết CHI TIẾT các giai đoạn từ ${a} đến ${b} (tổng cộng ${outline.eras.length} giai đoạn).`,
      '',
      'DÀN Ý ĐẦY ĐỦ (số | năm | tên | nội dung):',
      ...rows,
      ...(previous ? ['', `GIAI ĐOẠN NGAY TRƯỚC (để nối mạch và giữ nguyên tên + màu các thế lực còn tồn tại): ${JSON.stringify({ year: previous.year, title: previous.title, realms: previous.realms.map(r => ({ name: r.name, colors: r.colors, flag: r.flag })) })}`] : []),
      '',
      'QUY TẮC',
      `1. Mọi chữ trong JSON (title, caption, narration, tên thế lực, tên địa danh) viết bằng ${L.vi.toUpperCase()}${isEn ? '' : ', tự nhiên như người bản ngữ'}. Sự thật phải chính xác, đúng năm, không bịa.`,
      `2. narration: ${NARRATION_MIN + 8}–${NARRATION_MAX - 20} từ, giọng kể cuốn hút của kênh lịch sử, nêu năm / nhân vật / sự kiện thật của giai đoạn, câu cuối dẫn sang giai đoạn sau. Đây là lời thuyết minh sẽ được đọc thành tiếng, không dùng ký hiệu hay ngoặc.`,
      '3. caption: dòng chú thích ngắn hiện trên cuộn giấy, tối đa 90 ký tự.',
      '4. population: số dân ước tính (số nguyên) của lãnh thổ chính lúc đó; 0 nếu không có ước tính đáng tin.',
      `5. realms: 1–4 thế lực hiện trên bản đồ ở giai đoạn đó. Mỗi thế lực: "name" (${L.vi}), "regions" (danh sách tên vùng để tô, LUÔN viết TIẾNG ANH đúng như trong danh sách, không dịch: TÊN NƯỚC ngày nay chọn đúng trong danh sách nước${provinces.length ? ', hoặc TÊN TỈNH của nước chính chọn đúng trong danh sách tỉnh' : ''}; lãnh thổ càng lớn càng tô nhiều vùng), "circles" (không bắt buộc: [{"at":[kinh độ,vĩ độ],"km":bán kính}] để tô vùng không khớp ranh giới hiện nay, được cắt theo bờ biển), "colors" (1–3 mã màu hex của cờ thật hoặc màu đặc trưng), "flag" ("solid","h","v","disc" hoặc "cross"), "mood" ("happy","proud","tired","angry","sad","calm"), "face" (true cho thế lực chính của giai đoạn, các thế lực khác false).`,
      '6. Thế lực còn tồn tại ở giai đoạn sau phải GIỮ NGUYÊN "name" và màu để bản đồ nối liền (mở rộng hoặc thu hẹp). Vùng bị mất thì bỏ khỏi "regions".',
      '7. markers: 0–3 địa danh {"type":"city|capital|temple|castle|ship|battle","name":"<tên>","at":[kinh độ,vĩ độ]} (kinh độ trước, vĩ độ sau; Đông và Bắc là số dương). routes (không bắt buộc): [{"points":[[kinh độ,vĩ độ],…],"ship":true}] cho hành trình, thương mại hay cuộc xâm lược.',
      '8. icon: một trong sail, crown, swords, star, flag, person, rocket, scroll, castle (huy hiệu trên thanh thời gian).',
      `9. scene (không bắt buộc): cảnh hoạt hình có người chèn giữa giai đoạn, chọn cảnh hợp với sự kiện chính: voyage (tàu ra khơi, thám hiểm), arrival (tàu cập bến, khám phá), battle (trận đánh, chiến tranh), court (vua và triều đình, đăng quang, hiệp ước), market (chợ, thương mại), build (xây dựng, kim tự tháp, thành quách), volcano (thiên tai, núi lửa). Không dùng cùng một cảnh cho hai giai đoạn liền nhau; để "none" nếu không hợp. shout (không bắt buộc): tiếng hô ngắn hiện trên cảnh, tối đa 18 ký tự, viết bằng ${L.vi}, VIẾT HOA, ví dụ "CHARGE!".`,
      `10. Mỗi giai đoạn phải có đúng số thứ tự "n" như dàn ý. Chỉ trả lời DUY NHẤT một khối JSON, không giải thích, đúng khuôn:`,
      '{"eras":[{"n":1,"year":-2879,"title":"…","caption":"…","narration":"…","population":0,"icon":"crown","scene":"court","shout":"…","realms":[{"name":"…","regions":["…"],"circles":[],"colors":["#c0392b"],"flag":"solid","mood":"happy","face":true}],"markers":[{"type":"capital","name":"…","at":[105.8,21.0]}],"routes":[]}]}',
      ...tail(marker),
      ...(provinces.length ? ['', `DANH SÁCH TỈNH CỦA NƯỚC CHÍNH (${outline.country}):`, provinces.join(', ')] : []),
      '',
      'DANH SÁCH TÊN NƯỚC (chọn đúng tên trong đây):',
      countryNames.join(', '),
      ...(fix ? ['', 'SỬA LỖI – lần trước còn lỗi sau; viết lại ĐỦ các giai đoạn đã yêu cầu, đúng khuôn:', fix] : []),
      marker ? `MSEND${marker}` : ''
    ].filter((line, index, all) => line !== '' || (index > 0 && all[index - 1] !== '' && index < all.length - 1)).join('\n');
  }

  // Tách khối JSON ra khỏi trả lời của Muse (bỏ mốc MSEND/MSDONE, hàng rào ```, dấu nháy cong, dấu phẩy thừa).
  function extractJson(reply) {
    let text = String(reply || '').normalize('NFC').split(/\r?\n/).filter(l => !DONE_LINE.test(l) && !/^\W*MSEND[0-9a-f]+\W*$/i.test(l)).join('\n');
    text = text.replace(/```(?:json)?/gi, '').replace(/[“”]/g, '"').replace(/[‘’]/g, "'");
    const open = text.indexOf('{');
    if (open < 0) throw Object.assign(Error('Muse chưa trả về khối JSON.'), { fixable: true, fix: 'Trả lời DUY NHẤT một khối JSON đúng khuôn, bắt đầu bằng { và kết thúc bằng }.' });
    let depth = 0, inString = false, escaped = false, end = -1;
    for (let i = open; i < text.length; i++) {
      const ch = text[i];
      if (inString) { if (escaped) escaped = false; else if (ch === '\\') escaped = true; else if (ch === '"') inString = false; continue; }
      if (ch === '"') inString = true; else if (ch === '{') depth++; else if (ch === '}') { depth--; if (!depth) { end = i; break; } }
    }
    const body = text.slice(open, end < 0 ? undefined : end + 1).replace(/,\s*([}\]])/g, '$1');
    try { return JSON.parse(body); }
    catch (e) { throw Object.assign(Error('JSON của Muse bị hỏng: ' + e.message), { fixable: true, fix: 'Khối JSON lần trước bị lỗi cú pháp (' + e.message + '). Viết lại ĐỦ, đúng cú pháp JSON: chuỗi trong dấu nháy kép, không dấu phẩy thừa, không chú thích.' }); }
  }

  function parseOutline(reply, config) {
    const raw = extractJson(reply);
    const eras = (Array.isArray(raw.eras) ? raw.eras : []).map(e => ({ year: num(e && e.year), title: flat(e && e.title).slice(0, 60), focus: flat(e && e.focus).slice(0, 300) })).filter(e => e.year != null && e.title);
    const want = eraCount(config.minutes);
    if (!config.topic && !flat(raw.title)) throw Object.assign(Error('Dàn ý thiếu tiêu đề.'), { fixable: true, fix: `Thiếu «title»: ghi chủ đề bạn đã chọn thành «title» (${langOf(config.language).vi}).` });
    if (eras.length < Math.max(3, Math.floor(want * .6))) throw Object.assign(Error('Dàn ý có quá ít giai đoạn.'), { fixable: true, fix: `Dàn ý chỉ có ${eras.length} giai đoạn hợp lệ (cần khoảng ${want}, mỗi giai đoạn đủ "year" là số và "title"). Viết lại ĐỦ.` });
    for (let i = 1; i < eras.length; i++) if (eras[i].year <= eras[i - 1].year) throw Object.assign(Error('Năm không tăng dần.'), { fixable: true, fix: `Các giai đoạn phải xếp theo năm TĂNG DẦN; giai đoạn ${i + 1} (năm ${eras[i].year}) không lớn hơn giai đoạn ${i} (năm ${eras[i - 1].year}). Sửa rồi viết lại ĐỦ.` });
    return { lang: langOf(config.language).id, title: flat(raw.title).slice(0, 120) || config.topic, subtitle: flat(raw.subtitle).slice(0, 120), hook: flat(raw.hook).slice(0, 60), country: config.country || flat(raw.country).slice(0, 80), eras: eras.slice(0, MAX_ERAS) };
  }

  // Đọc lượt «chi tiết giai đoạn»: trả về Map số thứ tự → giai đoạn thô (chưa chuẩn hóa).
  function parseEras(reply) {
    const raw = extractJson(reply);
    const out = new Map();
    for (const e of Array.isArray(raw.eras) ? raw.eras : []) { const n = Math.round(num(e && e.n, NaN)); if (Number.isFinite(n) && n >= 1 && !out.has(n)) out.set(n, e); }
    return out;
  }
  // Soát các giai đoạn trong lượt: thiếu, thiếu lời đọc, hoặc chưa tìm được vùng để tô.
  function checkEras(items, range, geo, country) {
    const missing = [], bad = [], issues = [];
    for (let n = range[0]; n <= range[1]; n++) {
      const raw = items.get(n);
      if (!raw) { missing.push(n); continue; }
      const { issues: found } = normalizeScript({ country, eras: [raw] }, geo);
      const text = found.map(x => x.text.replace(/^Giai đoạn 1/, `Giai đoạn ${n}`));
      const wordsN = words(raw.narration);
      if (wordsN < NARRATION_MIN || wordsN > NARRATION_MAX) text.push(`Giai đoạn ${n}: lời đọc có ${wordsN} từ, cần ${NARRATION_MIN + 8}–${NARRATION_MAX - 20} từ.`);
      if (found.some(x => /không tìm thấy vùng|chưa có vùng nào/.test(x.text))) text.push(`Giai đoạn ${n}: sửa tên vùng cho khớp danh sách, hoặc dùng "circles" để tô.`);
      if (text.length) { bad.push(n); issues.push(...text); }
    }
    return { missing, bad, issues };
  }
  function fixText({ missing, bad, issues }, range) {
    const lines = [];
    if (missing.length) lines.push(`Thiếu giai đoạn ${missing.join(', ')}.`);
    lines.push(...issues);
    lines.push(`Viết lại ĐỦ các giai đoạn từ ${range[0]} đến ${range[1]}.`);
    return lines.join('\n');
  }
  // Ghép dàn ý + các giai đoạn chi tiết thành kịch bản thô (chuẩn hóa ở normalizeScript).
  function assemble(outline, items, language) {
    const lang = langOf(language || outline.lang).id;
    const eras = [];
    outline.eras.forEach((o, i) => {
      const raw = items.get(i + 1);
      if (!raw) return;
      eras.push({ ...raw, year: raw.year != null ? raw.year : o.year, title: raw.title || o.title });
    });
    return { lang, title: outline.title, subtitle: outline.subtitle, hook: outline.hook || '', country: outline.country, outro: strings(lang).subscribe, eras };
  }


  // ---- Bộ thông tin đăng YouTube: tiêu đề đúng như trên video, mô tả có chương (mốc giờ thật), thẻ.
  const pad2 = n => String(n).padStart(2, '0');
  function clock(sec) {
    const t = Math.max(0, Math.round(Number(sec) || 0)), h = Math.floor(t / 3600), m = Math.floor(t % 3600 / 60);
    return h ? `${h}:${pad2(m)}:${pad2(t % 60)}` : `${m}:${pad2(t % 60)}`;
  }
  function publishPack(script, timeline) {
    const L = langOf((timeline && timeline.lang) || (script && script.lang)), t = L.s, P = L.pub;
    const title = flat(script && script.title).slice(0, 100) || (L.id === 'en' ? 'History' : L.label);
    const subtitle = flat(script && script.subtitle).slice(0, 150);
    const country = flat(script && script.country).slice(0, 60);
    const eras = (timeline && timeline.eras) || (script && script.eras) || [];
    const first = eras[0], last = eras[eras.length - 1];
    const span = first && last && first.year !== last.year ? t.from(yearLabel(first.year, L.id), yearLabel(last.year, L.id)) : first ? yearLabel(first.year, L.id) : '';
    // Chương YouTube: bắt đầu đúng 0:00, mỗi chương cách chương trước từ 10 giây, cần ít nhất 3 chương.
    const chapters = [];
    if (timeline && timeline.eras) {
      for (const e of timeline.eras) {
        const at = chapters.length ? e.start : 0;
        if (chapters.length && at - chapters[chapters.length - 1].t < 10) continue;
        chapters.push({ t: Math.round(at), clock: clock(at), label: `${e.label}: ${e.title}`.slice(0, 80) });
      }
    }
    const lc = x => x.toLocaleLowerCase(L.id);
    const tagWords = [...new Set([title, ...P.tags, country, country && P.countryTag(country), ...title.split(/[:\-–—,]/).map(x => x.trim()).filter(x => x.length > 3)].filter(Boolean).map(lc))];
    const tags = []; let size = 0;
    for (const x of tagWords) { if (size + x.length + 2 > 450) break; tags.push(x); size += x.length + 2; }
    const hash = [...P.hash, country && '#' + country.replace(/[^\p{L}\p{N}]+/gu, '')].filter(Boolean);
    const body = [
      subtitle || title,
      '',
      P.about(title, span),
      ...(chapters.length >= 3 ? ['', P.chapters, ...chapters.map(c => `${c.clock} ${c.label}`)] : []),
      '',
      P.note,
      '',
      hash.join(' ')
    ];
    const description = body.join('\n').slice(0, 4900);
    const text = ['TITLE', title, '', 'DESCRIPTION', description, '', 'TAGS', tags.join(', ')].join('\n') + '\n';
    return { lang: L.id, title, description, tags, chapters: chapters.length >= 3 ? chapters : [], text };
  }

  return {
    W, H, CY, INTRO, OUTRO, LEAD, TAIL, MIN_ERA, ERA_SECONDS, MIN_MINUTES, MAX_MINUTES, DEFAULT_MINUTES, LENGTHS, MAX_ERAS, CATEGORIES, categoryOf, MOODS, FLAGS, MARKERS, ICONS, PALETTE,
    SCENES, TIMING, cuesOf, BATCH, NARRATION_MIN, NARRATION_MAX, buildOutlineInstruction, buildErasInstruction, extractJson, parseOutline, parseEras, checkEras, fixText, assemble,
    eraCount, options, problems, yearLabel, publishPack, hookOf, clock, LANGUAGES, langOf, strings, normalizeScript, compile, stateAt, counterAt, chunksOf, subtitleAt, flyCam, fit, speakSeconds, bigRingsBox, easeInOut, clamp, lerp, mer, unmerLat, hex, num, words, flat, WORLD_VIEW
  };
});
