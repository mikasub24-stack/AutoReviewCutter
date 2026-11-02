# -*- coding: utf-8 -*-
"""Da ngon ngu cho AnimStudio: danh sach ngon ngu + giong Microsoft (edge-tts) cua tung ngon ngu, nhan dien ngon ngu tu chu viet,
dem 'tu' (chu Han / Nhat / Han Quoc / Thai khong co dau cach nen dem tung chu), tach cau va ngat dong phu de cho tieng Trung / Nhat / Han.

Moi ngon ngu: ma ngan ('vi', 'en', 'zh', 'ja', 'ko', ...). 'zh' = tieng Trung pho thong (gian the, Dai luc), 'tw' = tieng Trung (phon the, Dai Loan), 'hk' = tieng Quang Dong (Hong Kong).
Ten giong lay theo danh sach cong khai cua Microsoft Edge online TTS (cung ten dung cho Azure Speech)."""
import re

# ---------------------------------------------------------------- danh sach ngon ngu
# code: (nhan hien thi, ten tieng Anh (cho lenh ve anh / AI), nu [giong tu dong], nam [giong tu dong], giong dan truyen, toc do doc mac dinh (don vi/giay), cau doc thu)
_DEF = [
    ("vi", "Tiếng Việt", "Vietnamese", ["vi-VN-HoaiMyNeural"], ["vi-VN-NamMinhNeural"], "vi-VN-NamMinhNeural", 4.6,
     "Xin chào, đây là giọng đọc mẫu của AnimStudio."),
    ("en", "English — Tiếng Anh", "English",
     ["en-US-AriaNeural", "en-US-JennyNeural", "en-GB-SoniaNeural", "en-US-MichelleNeural", "en-AU-NatashaNeural"],
     ["en-US-GuyNeural", "en-US-ChristopherNeural", "en-GB-RyanNeural", "en-US-EricNeural", "en-AU-WilliamNeural"], "en-US-ChristopherNeural", 2.6,
     "Hello, this is a sample voice from AnimStudio."),
    ("zh", "中文 — Tiếng Trung (giản thể, phổ thông)", "Simplified Chinese (Mandarin)", ["zh-CN-XiaoxiaoNeural", "zh-CN-XiaoyiNeural"],
     ["zh-CN-YunxiNeural", "zh-CN-YunjianNeural", "zh-CN-YunyangNeural"], "zh-CN-YunyangNeural", 4.2, "你好，这是 AnimStudio 的示范配音。"),
    ("tw", "中文 — Tiếng Trung (phồn thể, Đài Loan)", "Traditional Chinese (Taiwan Mandarin)", ["zh-TW-HsiaoChenNeural", "zh-TW-HsiaoYuNeural"],
     ["zh-TW-YunJheNeural"], "zh-TW-YunJheNeural", 4.2, "你好，這是 AnimStudio 的示範配音。"),
    ("hk", "粵語 — Tiếng Quảng Đông (Hồng Kông)", "Cantonese (Traditional Chinese, Hong Kong)", ["zh-HK-HiuGaaiNeural", "zh-HK-HiuMaanNeural"],
     ["zh-HK-WanLungNeural"], "zh-HK-WanLungNeural", 4.2, "你好，呢個係 AnimStudio 嘅示範配音。"),
    ("ja", "日本語 — Tiếng Nhật", "Japanese", ["ja-JP-NanamiNeural"], ["ja-JP-KeitaNeural"], "ja-JP-KeitaNeural", 5.8,
     "こんにちは、これは AnimStudio のサンプル音声です。"),
    ("ko", "한국어 — Tiếng Hàn", "Korean", ["ko-KR-SunHiNeural"], ["ko-KR-InJoonNeural"], "ko-KR-InJoonNeural", 5.2,
     "안녕하세요, AnimStudio의 샘플 음성입니다."),
    ("th", "ไทย — Tiếng Thái", "Thai", ["th-TH-PremwadeeNeural"], ["th-TH-NiwatNeural"], "th-TH-NiwatNeural", 11.0,
     "สวัสดีครับ นี่คือเสียงตัวอย่างจาก AnimStudio"),
    ("id", "Bahasa Indonesia — Tiếng Indonesia", "Indonesian", ["id-ID-GadisNeural"], ["id-ID-ArdiNeural"], "id-ID-ArdiNeural", 2.7,
     "Halo, ini adalah suara contoh dari AnimStudio."),
    ("ms", "Bahasa Melayu — Tiếng Mã Lai", "Malay", ["ms-MY-YasminNeural"], ["ms-MY-OsmanNeural"], "ms-MY-OsmanNeural", 2.7,
     "Helo, ini ialah suara contoh daripada AnimStudio."),
    ("fr", "Français — Tiếng Pháp", "French", ["fr-FR-DeniseNeural", "fr-FR-EloiseNeural"], ["fr-FR-HenriNeural"], "fr-FR-HenriNeural", 2.8,
     "Bonjour, voici une voix d'exemple d'AnimStudio."),
    ("de", "Deutsch — Tiếng Đức", "German", ["de-DE-KatjaNeural", "de-DE-AmalaNeural"], ["de-DE-ConradNeural", "de-DE-KillianNeural"], "de-DE-ConradNeural", 2.4,
     "Hallo, das ist eine Beispielstimme von AnimStudio."),
    ("es", "Español — Tiếng Tây Ban Nha", "Spanish", ["es-ES-ElviraNeural", "es-MX-DaliaNeural"], ["es-ES-AlvaroNeural", "es-MX-JorgeNeural"], "es-ES-AlvaroNeural", 3.0,
     "Hola, esta es una voz de ejemplo de AnimStudio."),
    ("pt", "Português — Tiếng Bồ Đào Nha (Brazil)", "Portuguese (Brazil)", ["pt-BR-FranciscaNeural"], ["pt-BR-AntonioNeural"], "pt-BR-AntonioNeural", 2.8,
     "Olá, esta é uma voz de exemplo do AnimStudio."),
    ("it", "Italiano — Tiếng Ý", "Italian", ["it-IT-ElsaNeural", "it-IT-IsabellaNeural"], ["it-IT-DiegoNeural"], "it-IT-DiegoNeural", 2.8,
     "Ciao, questa è una voce di esempio di AnimStudio."),
    ("ru", "Русский — Tiếng Nga", "Russian", ["ru-RU-SvetlanaNeural"], ["ru-RU-DmitryNeural"], "ru-RU-DmitryNeural", 2.3,
     "Здравствуйте, это пример голоса AnimStudio."),
    ("hi", "हिन्दी — Tiếng Hindi", "Hindi", ["hi-IN-SwaraNeural"], ["hi-IN-MadhurNeural"], "hi-IN-MadhurNeural", 3.0,
     "नमस्ते, यह AnimStudio की नमूना आवाज़ है।"),
    ("ar", "العربية — Tiếng Ả Rập", "Arabic", ["ar-SA-ZariyahNeural"], ["ar-SA-HamedNeural"], "ar-SA-HamedNeural", 2.4,
     "مرحبًا، هذا صوت تجريبي من AnimStudio."),
    ("tr", "Türkçe — Tiếng Thổ Nhĩ Kỳ", "Turkish", ["tr-TR-EmelNeural"], ["tr-TR-AhmetNeural"], "tr-TR-AhmetNeural", 2.4,
     "Merhaba, bu AnimStudio'nun örnek sesidir."),
]
# Ngon ngu them (1.3.6): (ma, nhom, nhan, ten tieng Anh, giong nu, giong nam, giong dan truyen, tu/giay, cau doc thu). Ten giong: danh sach cong khai cua Microsoft (ban chay that se doi chieu
# voi danh sach giong tai ve tu Microsoft — xem apply_catalog — nen ten nao khong con thi tu bo).  Nhom: eu = chau Au, as = chau A / Trung Dong, af = chau Phi va khac.
_MORE = [
    ("nl", "eu", "Nederlands — Tiếng Hà Lan", "Dutch", ["nl-NL-FennaNeural", "nl-NL-ColetteNeural", "nl-BE-DenaNeural"], ["nl-NL-MaartenNeural", "nl-BE-ArnaudNeural"], "nl-NL-MaartenNeural", 2.7,
     "Hallo, dit is een voorbeeldstem van AnimStudio."),
    ("pl", "eu", "Polski — Tiếng Ba Lan", "Polish", ["pl-PL-ZofiaNeural"], ["pl-PL-MarekNeural"], "pl-PL-MarekNeural", 2.4, "Cześć, to jest przykładowy głos z AnimStudio."),
    ("sv", "eu", "Svenska — Tiếng Thụy Điển", "Swedish", ["sv-SE-SofieNeural", "sv-SE-HilleviNeural"], ["sv-SE-MattiasNeural"], "sv-SE-MattiasNeural", 2.7,
     "Hej, det här är en exempelröst från AnimStudio."),
    ("da", "eu", "Dansk — Tiếng Đan Mạch", "Danish", ["da-DK-ChristelNeural"], ["da-DK-JeppeNeural"], "da-DK-JeppeNeural", 2.7, "Hej, dette er en eksempelstemme fra AnimStudio."),
    ("nb", "eu", "Norsk — Tiếng Na Uy", "Norwegian", ["nb-NO-PernilleNeural", "nb-NO-IselinNeural"], ["nb-NO-FinnNeural"], "nb-NO-FinnNeural", 2.7,
     "Hei, dette er en eksempelstemme fra AnimStudio."),
    ("fi", "eu", "Suomi — Tiếng Phần Lan", "Finnish", ["fi-FI-NooraNeural", "fi-FI-SelmaNeural"], ["fi-FI-HarriNeural"], "fi-FI-HarriNeural", 2.2, "Hei, tämä on AnimStudion esimerkkiääni."),
    ("cs", "eu", "Čeština — Tiếng Séc", "Czech", ["cs-CZ-VlastaNeural"], ["cs-CZ-AntoninNeural"], "cs-CZ-AntoninNeural", 2.4, "Ahoj, toto je ukázkový hlas z AnimStudio."),
    ("sk", "eu", "Slovenčina — Tiếng Slovakia", "Slovak", ["sk-SK-ViktoriaNeural"], ["sk-SK-LukasNeural"], "sk-SK-LukasNeural", 2.4, "Ahoj, toto je ukážkový hlas z AnimStudio."),
    ("ro", "eu", "Română — Tiếng Romania", "Romanian", ["ro-RO-AlinaNeural"], ["ro-RO-EmilNeural"], "ro-RO-EmilNeural", 2.7, "Bună, aceasta este o voce de exemplu din AnimStudio."),
    ("hu", "eu", "Magyar — Tiếng Hungary", "Hungarian", ["hu-HU-NoemiNeural"], ["hu-HU-TamasNeural"], "hu-HU-TamasNeural", 2.3, "Üdvözlöm, ez az AnimStudio mintahangja."),
    ("hr", "eu", "Hrvatski — Tiếng Croatia", "Croatian", ["hr-HR-GabrijelaNeural"], ["hr-HR-SreckoNeural"], "hr-HR-SreckoNeural", 2.5, "Bok, ovo je primjer glasa iz AnimStudija."),
    ("sl", "eu", "Slovenščina — Tiếng Slovenia", "Slovenian", ["sl-SI-PetraNeural"], ["sl-SI-RokNeural"], "sl-SI-RokNeural", 2.5, "Pozdravljeni, to je vzorčni glas iz AnimStudia."),
    ("sr", "eu", "Српски — Tiếng Serbia", "Serbian", ["sr-RS-SophieNeural"], ["sr-RS-NicholasNeural"], "sr-RS-NicholasNeural", 2.5, "Здраво, ово је пробни глас из AnimStudio-а."),
    ("bs", "eu", "Bosanski — Tiếng Bosnia", "Bosnian", ["bs-BA-VesnaNeural"], ["bs-BA-GoranNeural"], "bs-BA-GoranNeural", 2.5, "Zdravo, ovo je probni glas iz AnimStudija."),
    ("mk", "eu", "Македонски — Tiếng Bắc Macedonia", "Macedonian", ["mk-MK-MarijaNeural"], ["mk-MK-AleksandarNeural"], "mk-MK-AleksandarNeural", 2.5, "Здраво, ова е примерок глас од AnimStudio."),
    ("bg", "eu", "Български — Tiếng Bulgaria", "Bulgarian", ["bg-BG-KalinaNeural"], ["bg-BG-BorislavNeural"], "bg-BG-BorislavNeural", 2.5, "Здравейте, това е примерен глас от AnimStudio."),
    ("uk", "eu", "Українська — Tiếng Ukraina", "Ukrainian", ["uk-UA-PolinaNeural"], ["uk-UA-OstapNeural"], "uk-UA-OstapNeural", 2.4, "Привіт, це зразок голосу AnimStudio."),
    ("el", "eu", "Ελληνικά — Tiếng Hy Lạp", "Greek", ["el-GR-AthinaNeural"], ["el-GR-NestorasNeural"], "el-GR-NestorasNeural", 2.5, "Γεια σας, αυτή είναι μια δοκιμαστική φωνή του AnimStudio."),
    ("ca", "eu", "Català — Tiếng Catalan", "Catalan", ["ca-ES-JoanaNeural", "ca-ES-AlbaNeural"], ["ca-ES-EnricNeural"], "ca-ES-EnricNeural", 2.8, "Hola, aquesta és una veu d'exemple d'AnimStudio."),
    ("gl", "eu", "Galego — Tiếng Galicia", "Galician", ["gl-ES-SabelaNeural"], ["gl-ES-RoiNeural"], "gl-ES-RoiNeural", 2.8, "Ola, esta é unha voz de exemplo de AnimStudio."),
    ("lt", "eu", "Lietuvių — Tiếng Litva", "Lithuanian", ["lt-LT-OnaNeural"], ["lt-LT-LeonasNeural"], "lt-LT-LeonasNeural", 2.3, "Sveiki, tai AnimStudio pavyzdinis balsas."),
    ("lv", "eu", "Latviešu — Tiếng Latvia", "Latvian", ["lv-LV-EveritaNeural"], ["lv-LV-NilsNeural"], "lv-LV-NilsNeural", 2.4, "Sveiki, šī ir AnimStudio parauga balss."),
    ("et", "eu", "Eesti — Tiếng Estonia", "Estonian", ["et-EE-AnuNeural"], ["et-EE-KertNeural"], "et-EE-KertNeural", 2.3, "Tere, see on AnimStudio näidishääl."),
    ("is", "eu", "Íslenska — Tiếng Iceland", "Icelandic", ["is-IS-GudrunNeural"], ["is-IS-GunnarNeural"], "is-IS-GunnarNeural", 2.4, "Halló, þetta er sýnishorn af rödd frá AnimStudio."),
    ("sq", "eu", "Shqip — Tiếng Albania", "Albanian", ["sq-AL-AnilaNeural"], ["sq-AL-IlirNeural"], "sq-AL-IlirNeural", 2.6, "Përshëndetje, ky është një zë shembull nga AnimStudio."),
    ("mt", "eu", "Malti — Tiếng Malta", "Maltese", ["mt-MT-GraceNeural"], ["mt-MT-JosephNeural"], "mt-MT-JosephNeural", 2.6, "Bonġu, din hija vuċi kampjun minn AnimStudio."),
    ("ga", "eu", "Gaeilge — Tiếng Ireland", "Irish", ["ga-IE-OrlaNeural"], ["ga-IE-ColmNeural"], "ga-IE-ColmNeural", 2.6, "Dia duit, seo guth samplach ó AnimStudio."),
    ("cy", "eu", "Cymraeg — Tiếng Wales", "Welsh", ["cy-GB-NiaNeural"], ["cy-GB-AledNeural"], "cy-GB-AledNeural", 2.6, "Helo, dyma lais enghreifftiol o AnimStudio."),
    ("he", "as", "עברית — Tiếng Do Thái", "Hebrew", ["he-IL-HilaNeural"], ["he-IL-AvriNeural"], "he-IL-AvriNeural", 2.4, "שלום, זהו קול לדוגמה של AnimStudio."),
    ("fa", "as", "فارسی — Tiếng Ba Tư", "Persian (Farsi)", ["fa-IR-DilaraNeural"], ["fa-IR-FaridNeural"], "fa-IR-FaridNeural", 2.4, "سلام، این یک صدای نمونه از AnimStudio است."),
    ("ur", "as", "اردو — Tiếng Urdu", "Urdu", ["ur-PK-UzmaNeural", "ur-IN-GulNeural"], ["ur-PK-AsadNeural", "ur-IN-SalmanNeural"], "ur-PK-AsadNeural", 2.8, "ہیلو، یہ AnimStudio کی نمونہ آواز ہے۔"),
    ("ps", "as", "پښتو — Tiếng Pashto", "Pashto", ["ps-AF-LatifaNeural"], ["ps-AF-GulNawazNeural"], "ps-AF-GulNawazNeural", 2.4, "سلام، دا د AnimStudio نمونه غږ دی."),
    ("bn", "as", "বাংলা — Tiếng Bengal", "Bengali", ["bn-BD-NabanitaNeural", "bn-IN-TanishaaNeural"], ["bn-BD-PradeepNeural", "bn-IN-BashkarNeural"], "bn-BD-PradeepNeural", 2.4,
     "নমস্কার, এটি AnimStudio-এর একটি নমুনা কণ্ঠস্বর।"),
    ("ta", "as", "தமிழ் — Tiếng Tamil", "Tamil", ["ta-IN-PallaviNeural", "ta-MY-KaniNeural", "ta-SG-VenbaNeural", "ta-LK-SaranyaNeural"],
     ["ta-IN-ValluvarNeural", "ta-MY-SuryaNeural", "ta-SG-AnbuNeural", "ta-LK-KumarNeural"], "ta-IN-ValluvarNeural", 2.2, "வணக்கம், இது AnimStudio இன் மாதிரி குரல்."),
    ("te", "as", "తెలుగు — Tiếng Telugu", "Telugu", ["te-IN-ShrutiNeural"], ["te-IN-MohanNeural"], "te-IN-MohanNeural", 2.3, "నమస్కారం, ఇది AnimStudio నుండి నమూనా స్వరం."),
    ("mr", "as", "मराठी — Tiếng Marathi", "Marathi", ["mr-IN-AarohiNeural"], ["mr-IN-ManoharNeural"], "mr-IN-ManoharNeural", 2.6, "नमस्कार, हा AnimStudio चा नमुना आवाज आहे."),
    ("gu", "as", "ગુજરાતી — Tiếng Gujarat", "Gujarati", ["gu-IN-DhwaniNeural"], ["gu-IN-NiranjanNeural"], "gu-IN-NiranjanNeural", 2.6, "નમસ્તે, આ AnimStudio નો નમૂનાનો અવાજ છે."),
    ("kn", "as", "ಕನ್ನಡ — Tiếng Kannada", "Kannada", ["kn-IN-SapnaNeural"], ["kn-IN-GaganNeural"], "kn-IN-GaganNeural", 2.3, "ನಮಸ್ಕಾರ, ಇದು AnimStudio ನ ಮಾದರಿ ಧ್ವನಿ."),
    ("ml", "as", "മലയാളം — Tiếng Malayalam", "Malayalam", ["ml-IN-SobhanaNeural"], ["ml-IN-MidhunNeural"], "ml-IN-MidhunNeural", 2.1, "നമസ്കാരം, ഇത് AnimStudio-യുടെ സാമ്പിൾ ശബ്ദമാണ്."),
    ("ne", "as", "नेपाली — Tiếng Nepal", "Nepali", ["ne-NP-HemkalaNeural"], ["ne-NP-SagarNeural"], "ne-NP-SagarNeural", 2.6, "नमस्ते, यो AnimStudio को नमूना आवाज हो।"),
    ("si", "as", "සිංහල — Tiếng Sinhala", "Sinhala", ["si-LK-ThiliniNeural"], ["si-LK-SameeraNeural"], "si-LK-SameeraNeural", 2.3, "ආයුබෝවන්, මෙය AnimStudio හි ආදර්ශ හඬයි."),
    ("my", "as", "မြန်မာ — Tiếng Myanmar", "Burmese", ["my-MM-NilarNeural"], ["my-MM-ThihaNeural"], "my-MM-ThihaNeural", 9.0, "မင်္ဂလာပါ၊ ဒါက AnimStudio ရဲ့ နမူနာအသံပါ။"),
    ("km", "as", "ខ្មែរ — Tiếng Khmer", "Khmer", ["km-KH-SreymomNeural"], ["km-KH-PisethNeural"], "km-KH-PisethNeural", 10.0, "សួស្តី នេះជាសំឡេងគំរូពី AnimStudio។"),
    ("lo", "as", "ລາວ — Tiếng Lào", "Lao", ["lo-LA-KeomanyNeural"], ["lo-LA-ChanthavongNeural"], "lo-LA-ChanthavongNeural", 10.0, "ສະບາຍດີ ນີ້ແມ່ນສຽງຕົວຢ່າງຈາກ AnimStudio."),
    ("fil", "as", "Filipino — Tiếng Philippines", "Filipino (Tagalog)", ["fil-PH-BlessicaNeural"], ["fil-PH-AngeloNeural"], "fil-PH-AngeloNeural", 2.8, "Kumusta, ito ay isang halimbawang boses mula sa AnimStudio."),
    ("jv", "as", "Basa Jawa — Tiếng Java", "Javanese", ["jv-ID-SitiNeural"], ["jv-ID-DimasNeural"], "jv-ID-DimasNeural", 2.7, "Halo, iki swara conto saka AnimStudio."),
    ("su", "as", "Basa Sunda — Tiếng Sunda", "Sundanese", ["su-ID-TutiNeural"], ["su-ID-JajangNeural"], "su-ID-JajangNeural", 2.7, "Halo, ieu sora conto ti AnimStudio."),
    ("kk", "as", "Қазақша — Tiếng Kazakhstan", "Kazakh", ["kk-KZ-AigulNeural"], ["kk-KZ-DauletNeural"], "kk-KZ-DauletNeural", 2.3, "Сәлеметсіз бе, бұл AnimStudio үлгі дауысы."),
    ("uz", "as", "Oʻzbekcha — Tiếng Uzbekistan", "Uzbek", ["uz-UZ-MadinaNeural"], ["uz-UZ-SardorNeural"], "uz-UZ-SardorNeural", 2.3, "Salom, bu AnimStudio namuna ovozi."),
    ("az", "as", "Azərbaycanca — Tiếng Azerbaijan", "Azerbaijani", ["az-AZ-BanuNeural"], ["az-AZ-BabekNeural"], "az-AZ-BabekNeural", 2.4, "Salam, bu AnimStudio-nun nümunə səsidir."),
    ("mn", "as", "Монгол — Tiếng Mông Cổ", "Mongolian", ["mn-MN-YesuiNeural"], ["mn-MN-BataaNeural"], "mn-MN-BataaNeural", 2.3, "Сайн байна уу, энэ бол AnimStudio-ийн жишиг дуу хоолой."),
    ("ka", "as", "ქართული — Tiếng Georgia", "Georgian", ["ka-GE-EkaNeural"], ["ka-GE-GiorgiNeural"], "ka-GE-GiorgiNeural", 2.2, "გამარჯობა, ეს არის AnimStudio-ს სანიმუშო ხმა."),
    ("hy", "as", "Հայերեն — Tiếng Armenia", "Armenian", ["hy-AM-AnahitNeural"], ["hy-AM-HaykNeural"], "hy-AM-HaykNeural", 2.3, "Բարև, սա AnimStudio-ի նմուշային ձայնն է։"),
    ("af", "af", "Afrikaans — Tiếng Afrikaans", "Afrikaans", ["af-ZA-AdriNeural"], ["af-ZA-WillemNeural"], "af-ZA-WillemNeural", 2.7, "Hallo, dit is 'n voorbeeldstem van AnimStudio."),
    ("sw", "af", "Kiswahili — Tiếng Swahili", "Swahili", ["sw-KE-ZuriNeural"], ["sw-KE-RafikiNeural"], "sw-KE-RafikiNeural", 2.4, "Habari, hii ni sauti ya mfano kutoka AnimStudio."),
    ("so", "af", "Soomaali — Tiếng Somali", "Somali", ["so-SO-UbaxNeural"], ["so-SO-MuuseNeural"], "so-SO-MuuseNeural", 2.4, "Haye, kani waa codka tusaalaha AnimStudio."),
    ("zu", "af", "isiZulu — Tiếng Zulu", "Zulu", ["zu-ZA-ThandoNeural"], ["zu-ZA-ThembaNeural"], "zu-ZA-ThembaNeural", 2.0, "Sawubona, lena yisampula yezwi le-AnimStudio."),
    ("am", "af", "አማርኛ — Tiếng Amharic", "Amharic", ["am-ET-MekdesNeural"], ["am-ET-AmehaNeural"], "am-ET-AmehaNeural", 2.2, "ሰላም፣ ይህ የAnimStudio ናሙና ድምፅ ነው።"),
]


_ALL = [(d[0], "main") + tuple(d[1:]) for d in _DEF] + _MORE
ORDER = [d[0] for d in _ALL]
LABEL = {d[0]: d[2] for d in _ALL}
NAME_EN = {d[0]: d[3] for d in _ALL}
GROUP_OF = {d[0]: d[1] for d in _ALL}
GROUPS = [("main", "Phổ biến"), ("eu", "Châu Âu"), ("as", "Châu Á & Trung Đông"), ("af", "Châu Phi")]
NATIVE = {d[0]: {"f": list(d[4]), "m": list(d[5])} for d in _ALL}          # giong ban dia da biet (ten co dinh)
POOL = {d[0]: {"f": list(d[4]), "m": list(d[5])} for d in _ALL}            # giong TU DONG gan cho nhan vat (= ban dia + giong bo sung, xem _rebuild)
_NARR0 = {d[0]: d[6] for d in _ALL}
NARRATOR = dict(_NARR0)                                                    # giong dan truyen (co the doi khi doi chieu voi danh sach that cua Microsoft)
WPS = {d[0]: d[7] for d in _ALL}
SAMPLE = {d[0]: d[8] for d in _ALL}

# giong CHI chon tay (khong tu dong gan cho nhan vat): (ten, gioi tinh, nhan rieng) — them cho da dang
EXTRA = {
    "zh": [("zh-CN-liaoning-XiaobeiNeural", "f", "Xiaobei (giọng Liêu Ninh)"),
           ("zh-CN-shaanxi-XiaoniNeural", "f", "Xiaoni (giọng Thiểm Tây)"), ("zh-CN-YunxiaNeural", "m", "Yunxia (giọng trẻ)")],
}
SPECIAL_LABEL = {name: lab for lst in EXTRA.values() for name, _g, lab in lst}

# Giong DA NGON NGU cua Microsoft (mot giong doc duoc nhieu thu tieng, ke ca Nhat / Han / Thai): ten + gioi tinh. Danh sach tai ve tu Microsoft (apply_catalog) se thay the khi co.
MULTI_STATIC = [("en-US-AvaMultilingualNeural", "f"), ("en-US-AndrewMultilingualNeural", "m"), ("en-US-EmmaMultilingualNeural", "f"), ("en-US-BrianMultilingualNeural", "m"),
                ("fr-FR-VivienneMultilingualNeural", "f"), ("fr-FR-RemyMultilingualNeural", "m"), ("de-DE-SeraphinaMultilingualNeural", "f"), ("de-DE-FlorianMultilingualNeural", "m")]
MULTI_GROUP = "Đa ngôn ngữ — một giọng đọc được nhiều tiếng"
NO_EXT = {"vi", "en", "zh", "tw", "hk"}          # ngon ngu giu NGUYEN bo giong cu (khong them giong bo sung)
MULTI_OK = {"ja", "ko", "th", "hi", "ar", "id", "tr", "ru", "uk", "pl", "nl", "sv", "da", "nb", "fi", "cs", "ro", "hu", "el", "he", "bg", "ca"}          # ngon ngu giong da ngon ngu doc tot -> dung de co them giong
POOL_MIN, POOL_MAX = 3, 4

_CAT = []            # [(ShortName, 'f'|'m', Locale)]: danh sach giong THAT cua Microsoft (edge-tts list_voices), rong = chua tai duoc
_MULTI_NOW = list(MULTI_STATIC)


def locale_of(voice):
    """'ja-JP-NanamiNeural' -> 'ja-JP'; 'zh-CN-liaoning-XiaobeiNeural' -> 'zh-CN'; 'fil-PH-AngeloNeural' -> 'fil-PH'."""
    p = str(voice or "").split("-")
    return "-".join(p[:2]) if len(p) >= 3 else ""


def is_multi(voice):
    return "Multilingual" in str(voice or "")


def _loc_lang(loc):
    """'ja-JP' -> 'ja'; 'zh-TW' -> 'tw'; 'zh-HK' -> 'hk'; 'fil-PH' -> 'fil'; 'wuu-CN' / 'yue-CN' -> 'zh'; khong co trong bang -> ''."""
    if not loc:
        return ""
    if loc == "zh-TW":
        return "tw"
    if loc == "zh-HK":
        return "hk"
    c = loc.split("-")[0].lower()
    if c in ("zh", "wuu", "yue"):
        return "zh"
    return c if c in POOL else ""


def lang_of_voice(voice):
    """Ma ngon ngu cua mot giong Microsoft/Azure ('' neu khong biet; '*' = giong da ngon ngu, doc duoc moi tieng)."""
    if is_multi(voice):
        return "*"
    return _loc_lang(locale_of(voice))


def known(code):
    return code in POOL


def pool(code, g):
    """Danh sach giong tu dong cho ngon ngu va gioi tinh ('m'/'f'); khong co ngon ngu do -> giong tieng Anh."""
    d = POOL.get(code) or POOL["en"]
    return d["f" if g == "f" else "m"]


def narrator(code):
    return NARRATOR.get(code) or NARRATOR["en"]


def sample(code):
    return SAMPLE.get(code) or SAMPLE["en"]


def name_en(code):
    return NAME_EN.get(code, "English")


def wps(code):
    return WPS.get(code, 2.6)


# ---------------------------------------------------------------- danh sach giong that cua Microsoft
def apply_catalog(rows):
    """Nap danh sach giong tai tu Microsoft (edge_tts.list_voices(): moi dong co ShortName / Gender / Locale / Status). Tra ve so giong nap duoc (0 = khong dung duoc, giu danh sach co dinh).
    Sau do bo giong tu dong + bang giong duoc dung lai: giong co dinh nao Microsoft khong con thi bo, ngon ngu it giong duoc them giong cung ngon ngu / giong da ngon ngu."""
    cat, seen = [], set()
    for r in rows or []:
        try:
            if isinstance(r, dict):
                s, g, loc, st = r.get("ShortName"), r.get("Gender"), r.get("Locale"), r.get("Status")
            else:
                s, g, loc, st = (list(r) + ["", "", ""])[:4]
            s = str(s or "").strip()
            g = "f" if str(g or "").strip().lower() in ("f", "female") else "m" if str(g or "").strip().lower() in ("m", "male") else ""
            if not s or not g or s.count("-") < 2 or (st and str(st).lower() not in ("ga", "general availability", "")):
                continue
            if s in seen:
                continue
            seen.add(s)
            cat.append((s, g, str(loc or locale_of(s))))
        except Exception:
            continue
    if len(cat) < 20:                       # danh sach qua ngan = loi tai / tra sai: khong tin
        return 0
    _CAT[:] = cat
    _rebuild()
    return len(cat)


def catalog_size():
    return len(_CAT)


def _rebuild():
    have = {s for s, _g, _l in _CAT}
    nat, multi = {}, []
    for s, g, loc in _CAT:
        if is_multi(s):
            multi.append((s, g))
            continue
        c = _loc_lang(loc or locale_of(s))
        if c:
            nat.setdefault(c, {"f": [], "m": []})[g].append(s)
    _MULTI_NOW[:] = sorted(multi, key=lambda x: (not x[0].startswith("en-US"), x[0])) if multi else [m for m in MULTI_STATIC if not _CAT or m[0] in have]
    for code in ORDER:
        for g in ("f", "m"):
            base = [v for v in NATIVE[code][g] if not _CAT or v in have]
            if not base and _CAT:                                           # giong co dinh Microsoft da go het: lay giong that cua cung ngon ngu / gioi tinh
                base = sorted(nat.get(code, {}).get(g, []))[:POOL_MIN]
            base = base or list(NATIVE[code][g])
            lst = list(base)
            if code not in NO_EXT and len(lst) < POOL_MIN:
                loc0 = locale_of(base[0])
                extra = sorted((v for v in nat.get(code, {}).get(g, []) if v not in lst), key=lambda v: (locale_of(v) != loc0, v))
                for v in extra:
                    if len(lst) >= POOL_MAX:
                        break
                    lst.append(v)
            if code in MULTI_OK and len(lst) < POOL_MIN:
                for v, mg in _MULTI_NOW:
                    if mg == g and v not in lst:
                        lst.append(v)
                        if len(lst) >= POOL_MAX:
                            break
            POOL[code][g][:] = lst
        n = _NARR0[code]
        if _CAT and n not in have:
            n = POOL[code]["m"][0]
        NARRATOR[code] = n


def _label(v, g, code):
    short = SPECIAL_LABEL.get(v) or v.split("-", 2)[2].replace("Neural", "")
    if code == "vi" and v in ("vi-VN-HoaiMyNeural", "vi-VN-NamMinhNeural"):
        return {"vi-VN-HoaiMyNeural": "Hoài My — Nữ · tiếng Việt", "vi-VN-NamMinhNeural": "Nam Minh — Nam · tiếng Việt"}[v]
    if code == "*":
        return "%s — %s · đa ngôn ngữ" % (short.replace("Multilingual", ""), "Nữ" if g == "f" else "Nam")
    return "%s — %s · %s" % (short, "Nữ" if g == "f" else "Nam", locale_of(v))


def voice_table():
    """[(ShortName, nhan hien thi, nhom)] tat ca giong Microsoft de nguoi dung chon tay. Thu tu: cac ngon ngu (Viet, Anh, ... theo ORDER), cuoi cung la nhom giong da ngon ngu.
    Co danh sach that tu Microsoft thi hien du moi giong cua tung ngon ngu (ke ca giong vung: Phap-Canada, Tay Ban Nha-Mexico...)."""
    have = {s for s, _g, _l in _CAT}
    nat = {}
    for s, g, loc in _CAT:
        if not is_multi(s):
            c = _loc_lang(loc or locale_of(s))
            if c:
                nat.setdefault(c, []).append((s, g))
    out = []
    for code in ORDER:
        grp = LABEL[code]
        rows = [(v, "f") for v in NATIVE[code]["f"]] + [(v, "m") for v in NATIVE[code]["m"]] + [(n, g) for n, g, _l in EXTRA.get(code, [])]
        if _CAT:
            kept = [(v, g) for v, g in rows if v in have]
            rows = (kept or rows) + [(v, g) for v, g in sorted(nat.get(code, []), key=lambda x: (locale_of(x[0]), x[0])) if v not in {k for k, _ in (kept or rows)}]
        for v, g in rows:
            out.append((v, _label(v, g, code), grp))
    for v, g in _MULTI_NOW:
        out.append((v, _label(v, g, "*"), MULTI_GROUP))
    return out


_rebuild()


# ---------------------------------------------------------------- nhan dien chu viet
_HAN = re.compile("[㐀-䶿一-鿿豈-﫿\U00020000-\U0002fa1f]")
_KANA = re.compile("[぀-ゟ゠-ヿㇰ-ㇿｦ-ﾟ]")
_HANGUL = re.compile("[가-힯ᄀ-ᇿ㄰-㆏]")
_THAI = re.compile("[฀-๿]")
_CYR = re.compile("[Ѐ-ӿ]")
_DEVA = re.compile("[ऀ-ॿ]")
_ARAB = re.compile("[؀-ۿݐ-ݿ]")
# chu viet chi dung cho MOT ngon ngu: (khoa, mau, ma ngon ngu). Thai / Hindi... van co khoa rieng o tren (ngoai le: cac chu duoi day moi ngon ngu mot bang chu).
_ONE = [("greek", re.compile("[\u0370-\u03ff\u1f00-\u1fff]"), "el"), ("hebr", re.compile("[\u0590-\u05ff]"), "he"), ("beng", re.compile("[\u0980-\u09ff]"), "bn"), ("taml", re.compile("[\u0b80-\u0bff]"), "ta"),
        ("telu", re.compile("[\u0c00-\u0c7f]"), "te"), ("gujr", re.compile("[\u0a80-\u0aff]"), "gu"), ("knda", re.compile("[\u0c80-\u0cff]"), "kn"), ("mlym", re.compile("[\u0d00-\u0d7f]"), "ml"),
        ("sinh", re.compile("[\u0d80-\u0dff]"), "si"), ("mymr", re.compile("[\u1000-\u109f]"), "my"), ("khmr", re.compile("[\u1780-\u17ff]"), "km"), ("laoo", re.compile("[\u0e80-\u0eff]"), "lo"),
        ("geor", re.compile("[\u10a0-\u10ff]"), "ka"), ("armn", re.compile("[\u0530-\u058f]"), "hy"), ("ethi", re.compile("[\u1200-\u139f]"), "am")]
_UNITS = re.compile("[㐀-䶿一-鿿豈-﫿\U00020000-\U0002fa1f぀-ヿㇰ-ㇿｦ-ﾟ가-힯฀-๿ក-៿຀-໿က-႟]")        # chu khong co dau cach giua cac tu: moi chu = 1 don vi
_VI_SPEC = set("ơƠưƯđĐĩĨũŨ")          # chu cai CHI tieng Viet co (cung voi U+1EA0-1EF9: a, e, o, u... co dau hoi nga nang): â ê ô à é... Phap / Bo cung dung nen khong tinh; 'ă' cung la chu Romania nen chi tinh la "yeu"


_VI_WEAK = set("àáảãạăằắẳẵặâầấẩẫậèéẻẽẹêềếểễệìíỉĩịòóỏõọôồốổỗộơờớởỡợùúủũụưừứửữựỳýỷỹỵđ"
               "ÀÁẢÃẠĂẰẮẲẴẶÂẦẤẨẪẬÈÉẺẼẸÊỀẾỂỄỆÌÍỈĨỊÒÓỎÕỌÔỒỐỔỖỘƠỜỚỞỠỢÙÚỦŨỤƯỪỨỬỮỰỲÝỶỸỴĐ")          # moi chu cai tieng Viet (ke ca a, e, o... co dau ma Phap / Bo cung dung)


def _is_vi_char(ch):
    return ch in _VI_SPEC or 0x1EA0 <= ord(ch) <= 0x1EF9


def script_counts(text):
    t = str(text or "")
    c = dict(han=len(_HAN.findall(t)), kana=len(_KANA.findall(t)), hangul=len(_HANGUL.findall(t)), thai=len(_THAI.findall(t)),
             cyr=len(_CYR.findall(t)), deva=len(_DEVA.findall(t)), arab=len(_ARAB.findall(t)))
    for k, rx, _c in _ONE:
        c[k] = len(rx.findall(t))
    c["latin"] = sum(1 for ch in t if ch.isalpha() and (ord(ch) < 0x250 or 0x1e00 <= ord(ch) <= 0x1eff))
    c["vi"] = sum(1 for ch in t if _is_vi_char(ch))
    c["vi_weak"] = sum(1 for ch in t if ch in _VI_WEAK)
    return c


_SCRIPT_KEYS = ("han", "kana", "hangul", "thai", "cyr", "deva", "arab", "latin") + tuple(k for k, _r, _c in _ONE)


def _count(t, chars):
    return sum(t.count(ch) for ch in chars)


def detect_cyr(text):
    """Chu Kirin: ru | uk | bg | sr | mk | kk | mn theo chu cai dac trung; khong chac -> ru."""
    t = str(text or "").lower()
    n = lambda chars: _count(t, chars)
    cyr = max(1, len(_CYR.findall(t)))
    if n("ґєї"):
        return "uk"
    if n("ђћљњџ"):
        return "sr"
    if n("ѓќѕ"):
        return "mk"
    if n("әғқңұһ"):
        return "kk"
    if n("өү"):
        return "mn"
    if not n("ыэё"):
        if n("і") and not n("ъ"):
            return "uk"
        if n("ъ") / float(cyr) > 0.012:
            return "bg"
    return "ru"


_UR_CH = "ٹڈڑںےہۂۓ"                  # chi tieng Urdu co
_FA_CH = "پچژگ"                      # tieng Ba Tu / Urdu co, tieng A Rap thi khong
_FA_YK = "یک"                        # Yeh / Kaf kieu Ba Tu (A Rap dung ي ك)


def detect_arab(text):
    """Chu A Rap: ar | fa | ur."""
    t = str(text or "")
    if _count(t, _UR_CH) >= 1:
        return "ur"
    if _count(t, _FA_CH) >= 1 or _count(t, _FA_YK) > _count(t, "يك"):
        return "fa"
    return "ar"


def detect(text):
    """Ma ngon ngu cua doan van theo chu viet + tu vung: 'vi' | 'en' | 'zh' | 'ja' | 'ko' | 'th' | 'ru' | 'uk' | 'hi' | 'ar' | 'fa' | 'ur' | 'el' | 'he' | 'bn'... va cac tieng chu Latin co danh sach tu
    (Phap, Duc, Tay Ban Nha, Ha Lan, Ba Lan...). Cau qua ngan khong du tu de nhan ra tieng Latin khac -> 'en' (nguoi dung chon ngon ngu bang tay thi dung dung ngon do).
    'tw' / 'hk' / 'ms' (neu it dau hieu) / 'mr' / 'ne' chi co khi chon tay."""
    c = script_counts(text)
    tot = sum(c[k] for k in _SCRIPT_KEYS)
    if tot == 0:
        return "en"
    r = {k: c[k] / float(tot) for k in c}
    if r["hangul"] >= 0.15:
        return "ko"
    if r["kana"] >= 0.05 and (c["kana"] + c["han"]) / float(tot) >= 0.3:
        return "ja"
    if r["han"] >= 0.15:
        return "zh"
    if r["thai"] >= 0.15:
        return "th"
    if r["cyr"] >= 0.3:
        return detect_cyr(text)
    if r["deva"] >= 0.3:
        return "hi"
    if r["arab"] >= 0.3:
        return detect_arab(text)
    for k, _rx, code in _ONE:
        if r[k] >= 0.3:
            return code
    lat = float(max(1, c["latin"]))
    if c["vi"] / lat > 0.02:
        return "vi"
    d = detect_latin(text)
    if d != "en":
        return d
    return "vi" if c["vi_weak"] / lat > 0.02 else "en"          # chu Latin co dau ma khong nhan ra la tieng nao: coi la tieng Viet (nhu truoc day), vd "Chào ông."


# tu chuc nang pho bien (>= 2 chu cai) de phan biet cac tieng dung chu Latin: du an dai (nhieu cau) nhan duoc, cau ngan 1-2 tu thi khong -> 'en' (hay chon tay)
_FW = {
    "en": "the and of to is in that it was for on with as he she they you are this but not have had his her their there what when will would".split(),
    "fr": "le la les des et est un une que qui dans pour pas sur avec il elle nous vous ce au du je ne mais sont ont fait être très aussi cette ses leurs où".split(),
    "de": "der die das und ist nicht ein eine mit zu den von sie ich auf für es auch dem wir sich im aber nur wie noch oder wird sind haben war ihr".split(),
    "es": "el los las del que en un una es por con para no se su al lo como pero más muy está fue son sus también esta ese cuando".split(),
    "pt": "os as do da dos das que em um uma para com não é se por mais mas como foi são está seu sua também você já ele ela nos".split(),
    "it": "il lo gli di che un una è per con non si del della dei delle ma sono anche come più questo questa nel nella loro era ha cosa molto".split(),
    "id": "yang dan di itu ini dengan untuk dari pada tidak akan adalah saya kita mereka juga ada atau dia kami sudah bisa karena lebih tetapi seorang".split(),
    "ms": "yang dan di itu ini dengan untuk dari pada tidak akan adalah saya kita mereka juga ada atau dia kami telah boleh tak awak kerana lebih tetapi seorang sangat".split(),
    "tr": "ve bir bu için ile de da çok ama ne var ben sen gibi daha olarak değil her şey çünkü kadar sonra ise onun".split(),
    "nl": "de het een en van is dat op te zijn met voor niet aan er ook als maar om hij zij ze we ik je dit wat bij nog wel naar uit dan hebben worden werd heeft geen kan door".split(),
    "pl": "nie się jest to na że jak ale po co tak za od przez dla czy już tylko tego jego ich był była było może bardzo są mnie mi tu przy pod który która które oraz".split(),
    "sv": "och att det som är en på av för med inte den har jag han hon vi var till om men ett de så kan från ska vara också när".split(),
    "da": "og at det som er en på af for med ikke den har jeg han hun vi var til om men et de så kan fra skal også når noget hvad blev".split(),
    "nb": "og å det som er en på av for med ikke den har jeg han hun vi var til om men et de så kan fra skal også når noe hva ble".split(),
    "cs": "je se na že to jako ale pro tak jsem jsou byl byla bylo může velmi když jen jeho její ten ta ty co už nebo také být".split(),
    "sk": "je sa na že to ako ale pre tak som sú bol bola bolo môže veľmi keď len jeho jej ten ty čo už alebo tiež byť ktorý".split(),
    "ro": "și în de la pe cu un nu este care că mai se din pentru sau dar ce fost sunt foarte acum mult cum dacă lui ei noi".split(),
    "hu": "és az hogy nem is egy meg van volt még de ez azt csak már mint vagy el ki nagyon nincs minden mert".split(),
    "fi": "ja on ei että se oli hän mutta kun tai ovat olla myös jos kuin niin tämä mitä jo vain sen kaikki olen sinä".split(),
    "hr": "je na se da su za od kao ali što to ne bi sam smo bio bila bilo još samo već nije koji koja koje ovo ono tko".split(),
    "sl": "in je na se da so za od kot ali kaj to ne bi sem smo bil bila bilo še samo že ni ki tudi".split(),
    "ca": "el la els les de que en un una és per amb no es del al com més però molt això aquest va ha són també quan".split(),
    "fil": "ang ng sa na ay at mga ito ako ka mo siya kami kayo sila para hindi may ni din rin pero kung ba lang po naman".split(),
    "lt": "ir yra kad tai su ne bet kaip jis ji mes jūs jie buvo būti taip tik jau kuris ką apie".split(),
    "lv": "un ir ka tas ar uz no par bet kā viņš viņa mēs jūs viņi bija būt tikai jau kas tā".split(),
    "et": "ja on et ei see oli kui aga ta me te nad olla ka või mis ainult juba kes seda".split(),
    "af": "die en van is het in nie vir op met te sy hy ons julle hulle was word wat maar ook sal kan nog".split(),
    "sw": "na ya wa kwa ni katika la za kuwa hii hiyo yake wake lakini pia kama sana kila mimi wewe yeye".split(),
    "is": "og að er í á við það hann hún ekki en var sem til með um fyrir sér þá".split(),
    "sq": "dhe të në është një për me që nuk si por ose ka kjo ai ajo ne ata".split(),
}
_FWS = {k: set(v) for k, v in _FW.items()}
# chu cai (gan nhu) chi mot ngon ngu co: cong them diem, de cau ngan van nhan ra
_SIG = {"pl": "ąęłńśźż", "cs": "ěřůťďň", "sk": "ĺľŕôť", "ro": "ășțţş", "hu": "őű", "is": "þð", "lt": "ėįųū", "lv": "āēīūģķļņ", "et": "õ", "da": "æø", "nb": "æø", "tr": "ğışİ", "hr": "đ"}
_MS_M = set("telah boleh tak awak kerana hendak sahaja ialah dah nampak pokok budak lelaki perempuan penat kereta dengar cakap makcik pakcik tuan".split())
_ID_M = set("sudah bisa karena nggak enggak gak banget aja nih dong pohon anak laki-laki perempuan mobil capek lelah tidak tadi kemarin".split())
_DA_M = set("af hvad noget blev mig dig hende".split())
_NB_M = set("av hva noe ble meg deg henne".split())
_WORD = re.compile(r"[^\W\d_]+(?:['’][^\W\d_]+)*")


def detect_latin(text):
    """Chu Latin khong dau tieng Viet: en / fr / de / es / pt / it / id / ms / tr / nl / pl / sv / da / nb / cs / sk / ro / hu / fi / hr / sl / ca / fil / lt / lv / et / af / sw / is / sq theo tu chuc nang
    (can it nhat 3 diem va vuot han tieng Anh) + chu cai dac trung (a, o, ... cua tung tieng); khong chac -> 'en'."""
    t = str(text or "").lower().replace("’", "'")
    ws = _WORD.findall(t)
    sig = {k: _count(t, chars) for k, chars in _SIG.items()}
    if len(ws) < 6 and not any(v >= 2 for v in sig.values()):
        return "en"
    sc = {k: sum(1 for w in ws if w in v) for k, v in _FWS.items()}
    for k, n in sig.items():
        sc[k] += 2 * min(n, 6)
    best = max((k for k in sc if k != "en"), key=lambda k: sc[k])
    if sc[best] >= 3 and sc[best] >= 0.07 * len(ws) and sc[best] >= 1.5 * sc["en"]:
        if best in ("id", "ms"):                                   # hai tieng gan nhu giong nhau: dua vao tu chi co o mot ben
            best = "ms" if sum(1 for w in ws if w in _MS_M) > sum(1 for w in ws if w in _ID_M) else "id"
        elif best in ("da", "nb"):
            best = "nb" if sum(1 for w in ws if w in _NB_M) > sum(1 for w in ws if w in _DA_M) else "da"
        return best
    return "en"


def has_cjk(text):
    """Co chu Han / Kana / Hangul (can tach cau va ngat dong theo kieu rieng)?"""
    return bool(_HAN.search(str(text or "")) or _KANA.search(str(text or "")) or _HANGUL.search(str(text or "")))


def is_cjk_text(text, min_ratio=0.15):
    t = str(text or "")
    c = script_counts(t)
    tot = sum(c[k] for k in ("han", "kana", "hangul", "thai", "cyr", "deva", "arab", "latin"))
    return bool(tot) and (c["han"] + c["kana"] + c["hangul"]) / float(tot) >= min_ratio


def wcount(text):
    """So 'tu' dung uoc luong thoi gian doc va chia canh: tu Latin / Cyrillic / Hangul... tach bang dau cach = 1 tu; moi chu Han / Kana / Thai = 1 don vi
    (chu Han, Kana, Thai viet lien khong co dau cach). Hangul co dau cach nen dem theo tu thuong... nhung moi am tiet Hangul dem 1 don vi cho dong nhat voi toc do doc (WPS['ko'])."""
    t = str(text or "")
    n = len(_UNITS.findall(t))
    rest = _UNITS.sub(" ", t)
    return n + len(rest.split())


# ---------------------------------------------------------------- tach cau (chu Han / Kana / Hangul)
_END = set("。！？!?…‼⁇⁈")
_CLOSE = set("」』”’）)\"'》〉】]»")


def split_sentences(text):
    """Tach doan van thanh cau theo dau cau Trung / Nhat / Han (。！？…) va dau !?. thong thuong; dau dong (」』”）) di kem cau truoc. Tra ve list cau (da bo khoang trang)."""
    t = str(text or "").replace("\r", "")
    out, cur, i, n = [], [], 0, len(t)
    while i < n:
        ch = t[i]
        if ch == "\n":
            if "".join(cur).strip():
                out.append("".join(cur).strip())
            cur = []
            i += 1
            continue
        cur.append(ch)
        end = ch in _END or (ch == "." and (i + 1 >= n or t[i + 1].isspace()))
        if end:
            while i + 1 < n and (t[i + 1] in _END or t[i + 1] in _CLOSE or (t[i + 1] == "." and (i + 2 >= n or t[i + 2].isspace()))):
                i += 1
                cur.append(t[i])
            s = "".join(cur).strip()
            if s:
                out.append(s)
            cur = []
        i += 1
    s = "".join(cur).strip()
    if s:
        out.append(s)
    return out


CLAUSE = set("，、；：,;:")


def cut_clauses(s, limit):
    """Cau qua dai (> limit ky tu) -> cat o dau phay / cham phay (gan giua nhat), moi nua >= 6 ky tu. Khong cat duoc thi giu nguyen."""
    s = str(s or "")
    if len(s) <= limit:
        return [s]
    mid, best = len(s) / 2.0, None
    for i, ch in enumerate(s):
        if ch in CLAUSE and 6 <= i + 1 <= len(s) - 6:
            if best is None or abs(i - mid) < abs(best - mid):
                best = i
    if best is None:
        return [s]
    return cut_clauses(s[:best + 1].strip(), limit) + cut_clauses(s[best + 1:].strip(), limit)


# ---------------------------------------------------------------- ngat dong phu de (chu khong co dau cach)
_OPEN = set("（「『“‘《〈【([«")
_CLOSEP = set("，。、！？；：）」』”’》〉】…～·,.!?;:)]»%")


def _is_unit(ch):
    """Chu Han / Kana / Thai: co the ngat dong giua hai chu."""
    return bool(_HAN.match(ch) or _KANA.match(ch))


def wrap_pieces(text):
    """Chia van ban thanh cac manh co the ngat dong: [(manh, co_dau_cach_truoc)]. Chu Han / Kana: moi chu mot manh; dau dong di kem chu truoc, dau mo di kem chu sau
    (khong de dau cau o dau dong). Tu Latin / Hangul: giu nguyen, ngat o dau cach."""
    pieces = []
    for wi, word in enumerate(str(text or "").split()):
        cur = ""
        first = True
        parts = []
        i = 0
        while i < len(word):
            ch = word[i]
            if _is_unit(ch):
                if cur:
                    parts.append(cur)
                    cur = ""
                parts.append(ch)
            else:
                cur += ch
            i += 1
        if cur:
            parts.append(cur)
        merged = []
        for p in parts:
            if merged and p and all(c in _CLOSEP for c in p):
                merged[-1] += p
            elif merged and merged[-1] and all(c in _OPEN for c in merged[-1]):
                merged[-1] += p
            else:
                merged.append(p)
        for p in merged:
            pieces.append((p, wi > 0 and first))
            first = False
    return pieces


def need_space(prev_ch, next_ch):
    """Noi hai cau / hai manh: chu Han / Kana va dau cau 。！？」 khong can dau cach; Hangul va chu Latin thi can."""
    if prev_ch in "。！？…」』”’）》〉】" or _is_unit(prev_ch) or _is_unit(next_ch):
        return False
    return True


def wrap_lines(text, width_of, maxw):
    """Ngat dong: width_of(chuoi) -> do rong (px). Dung cho ca chu co dau cach lan chu Han / Kana khong dau cach."""
    lines, cur = [], ""
    for p, sp in wrap_pieces(text):
        t = cur + (" " if (sp and cur) else "") + p
        if width_of(t) <= maxw or not cur:
            cur = t
        else:
            lines.append(cur)
            cur = p
    if cur:
        lines.append(cur)
    return lines


# ---------------------------------------------------------------- chon phong theo chu viet
def font_script(text, hint=""):
    """'zh' | 'tw' | 'hk' | 'ja' | 'ko' | 'th' | 'hi' | 'ar' | 'el' | 'he' | 'bn' | 'ta' | 'te' | 'gu' | 'kn' | 'ml' | 'si' | 'my' | 'km' | 'lo' | 'ka' | 'hy' | 'am' | '' (chu Latin / Cyrillic: phong thuong da du).
    hint = ngon ngu cua du an (de chon phong dung nhom chu Han)."""
    c = script_counts(text)
    if c["hangul"]:
        return "ko"
    if c["kana"]:
        return "ja"
    if c["han"]:
        return hint if hint in ("zh", "tw", "hk", "ja", "ko") else "zh"
    if c["thai"]:
        return "th"
    if c["deva"]:
        return "hi"
    if c["arab"]:
        return "ar"
    for k, _rx, code in _ONE:
        if c[k]:
            return code
    return ""


# ---------------------------------------------------------------- tien ich cho giao dien / giong
def pick(v):
    """Ma ngon ngu hop le do nguoi dung chon ('' / 'auto' / la -> None = tu nhan biet)."""
    v = str(v or "").strip().lower()
    return v if v in POOL else None


_CLASS = {"zh": "han", "tw": "han", "hk": "han", "ja": "ja", "ko": "ko", "th": "th", "hi": "deva", "mr": "deva", "ne": "deva", "ar": "arab", "fa": "arab", "ur": "arab", "ps": "arab",
          "ru": "cyr", "uk": "cyr", "bg": "cyr", "sr": "cyr", "mk": "cyr", "kk": "cyr", "mn": "cyr"}
for _c in ("el", "he", "bn", "ta", "te", "gu", "kn", "ml", "si", "my", "km", "lo", "ka", "hy", "am"):
    _CLASS[_c] = _c


def script_class(code):
    """Nhom chu viet cua ngon ngu: han | ja | ko | th | cyr | deva | arab | el | he | bn ... | latin."""
    return _CLASS.get(code, "latin")


def script_clash(text_lang, voice_lang):
    """Chu cua van ban khong phai Latin ma giong doc lai thuoc nhom chu khac (vd van ban tieng Nhat + giong tieng Viet): doc ra se sai hoan toan. Giong da ngon ngu ('*') doc duoc moi chu."""
    t, v = script_class(text_lang), script_class(voice_lang)
    return bool(voice_lang) and voice_lang != "*" and t != "latin" and t != v


def voice_rows():
    """[(ShortName, nhan, nhom, ma ngon ngu)] cho giao dien chon giong (ma ngon ngu '*' = giong da ngon ngu)."""
    return [(v, lab, grp, lang_of_voice(v)) for v, lab, grp in voice_table()]


def options_html(auto="Tự nhận biết"):
    """<option> cho o chon ngon ngu: 'Tu nhan biet' + cac ngon ngu chia theo nhom (Pho bien / Chau Au / Chau A / Chau Phi)."""
    from html import escape
    out = ['<option value="">%s</option>' % escape(auto)]
    for g, lab in GROUPS:
        items = "".join('<option value="%s">%s</option>' % (c, escape(LABEL[c])) for c in ORDER if GROUP_OF[c] == g)
        if items:
            out.append('<optgroup label="%s">%s</optgroup>' % (escape(lab), items))
    return "".join(out)


ASIA = {"vi", "zh", "tw", "hk", "ja", "ko", "th", "id", "ms", "fil", "jv", "su", "km", "lo", "my", "mn"}          # nhan vat mac dinh co nuoc da / toc kieu chau A (looks.py)


# Thai / Hindi / A Rap / Do Thai / Bengal / Tamil ... can bo cuc chu phuc tap (noi chu, dau thanh, chu ghep, viet tu phai sang trai): Pillow chi lam duoc khi co libraqm (ban Pillow tren Windows thuong khong kem).
NEEDS_RAQM = {"th", "hi", "ar", "he", "bn", "ta", "te", "gu", "kn", "ml", "si", "my", "km", "lo"}          # theo ma cua font_script()
_SCRIPT_OF = {"fa": "ar", "ur": "ar", "ps": "ar", "mr": "hi", "ne": "hi"}          # ngon ngu dung chu cua ngon ngu khac
_RAQM = []


def raqm():
    if not _RAQM:
        try:
            from PIL import features
            _RAQM.append(bool(features.check("raqm")))
        except Exception:
            _RAQM.append(False)
    return _RAQM[0]


def subs_ok(code):
    """Co chen duoc phu de vao video cho ngon ngu nay khong (Thai / Hindi / A Rap / Bengal... can raqm, neu khong chu se hien sai)."""
    return _SCRIPT_OF.get(code, code) not in NEEDS_RAQM or raqm()
