AUTO STUDIO 2.2.50 - CHI FILE SUA TAB QUET BO DOUYIN

YEU CAU DA GIU
- Giu nguyen giao dien 2.5.45: khong doi bo cuc, nut bam, hang bo, anh bia,
  danh sach o tick, nut tai va chuyen sang the Tai video.
- Chi thay backend Quet / Lay link thanh goi API Douyin truc tiep.
- Khong tu mo trinh duyet, khong can tien ich de thuc hien luot quet nay.
- Nut Mo trinh duyet va cac lua chon trinh duyet cu van giu nguyen theo yeu cau
  giao dien; chi nut mo thu cong moi mo browser, khong tham gia luot API.

AP DUNG
1. Dong Auto Studio; sao luu cac file cu.
2. Giai nen ZIP nay vao THU MUC MA NGUON Auto Studio 2.5.45 (noi co app.py),
   chap nhan chep de. Phai chep CA cac file moi trong ytdl/douyin_direct/.
3. Chay bang ma nguon hoac build.bat cua du an nhu binh thuong.
   Day la ban va nguon, khong phai EXE. Chep .py canh EXE da bien dich khong
   lam EXE tu su dung ma moi.
4. O the Tai video, nap cookies.txt Douyin dang Netscape nhu truoc.
5. Sang the Quet bo Douyin ben phai: dan link kenh /user/... hoac bo
   /collection/... roi bam Quet; chon bo, Lay link, Tai bo nay / Sang the Tai.

PHAN XU LY
- Ky a_bogus tai may bang Python; khong them Node/Playwright/gmssl.
- Cookie chi gui den dung mien API, khong gui cookie dang nhap den CDN anh bia.
- Goi lan luot, cach nhau toi thieu 2 giay. Doc het phan trang neu API cho phep.
- Chi lay aweme_list cua nguon da yeu cau, loc tac gia / mix_id sai, khop chinh
  xac ID khi lay chi tiet, khong tron video de xuat / yeu thich.
- Chi tach nhom khi co mix_id that cua Douyin; khong tu tach bang anh bia /
  ten gan giong. Video khong co mix_id o nhom Bai dang cua kenh.
- Doc so tap ro trong tieu de (ke ca 吃声亭126集). Khong ro so thi de ten
  Chua ro tap - video <ID>; khong tu noi so len 159 hay tu suy tap tu mix.cur.
- Khi API yeu cau xac minh, han che, sai du lieu hoac loi chu ky: dung hang doi;
  giu ket qua tung trang voi nhan CHUA QUET DU. Khong tu doi cookie, IP hoac
  chuyen sang trinh duyet de thu vuot. Khong co tu giai CAPTCHA.
- Link truc tiep giu nguyen chu ky/query, co the het han theo may chu.

CHAN DOAN
Trong thu muc cai dat rieng cua tab Quet (tabs.data_dir('ytscan')) co
api_last_diagnostic.json sau moi viec. File chi chua loai loi, ma HTTP/API,
so trang/video, phien ban bo ky; khong chua gia tri cookie/msToken/a_bogus.
Neu chay khong duoc, gui file nay de doi chieu. Khong gui cookies.txt.

KIEM CHUNG VA GIOI HAN
- 61 kiem thu ngoai tuyen + thu hop dong giao dien Tk bang theme/the Tai gia lap.
- Ma tao giao dien cua 6 phan duoc doi chieu voi ban 2.5.45, giu nguyen.
- CHUA quet Douyin that, CHUA xac nhan bo ky nay duoc Douyin hien tai chap nhan.
  Khong dam bao mo quet la thanh cong; can chay thu tren may va cookie cua ban.
- CHUA build/chay EXE Auto Studio day du vi goi nguon nay chi co cac file sua.
- Bo ky duoc ghim tu F2 main, commit 7dab3e2ffffaa2535834d28fca99dbc2e89fa9d3;
  khi Douyin thay doi co the phai cap nhat mo-dun. Khong khang dinh chu ky
  doi theo quy nhu quang cao cua dich vu.
- Giu giay phep Apache-2.0 va NOTICE cua F2 khi phan phoi. installer.iss da
  them hai file giay phep vao licenses/Douyin-Direct. Neu dong goi ban portable,
  can chep hai file nay vao thu muc licenses cua ban portable.

===== TAI LIEU GOC 2.5.45 (cac muc tien ich la cach quet cu) =====
AUTO STUDIO v2.5.45 - long tieng CapCut + dich phu de SRT + lay sub Jianying/CapCut + quet hardsub (OCR) + Trinh doc van ban + SmartCut + tai video (7 tab trong 1 chuong trinh)
=====================================================================================================================================================================
(Ten va so phien ban nam o MOT cho: file appinfo.py. Bam nut "Co gi moi" tren cua so de xem lich su ban.)

BAY TAB RIENG o thanh ben trai (cung 1 cua so, cung giao dien):
  1) Long tieng CapCut   : doc van ban / tep SRT bang giong CapCut, chen vao project CapCut, tu can chinh video (mo ta o duoi).
  2) Dich phu de SRT     : dich file .srt sang tieng Viet bang AI qua trang web hoac API (xem muc "TAB DICH PHU DE SRT").
  3) Lay sub Jianying / CapCut : NGHE GIONG NOI bang may chu Jianying (mac dinh) / CapCut -> luu .srt canh video; co o TOC DO video (giam/tang) (xem muc "TAB LAY SUB JIANYING / CAPCUT VA TAB QUET HARDSUB").
  4) Quet hardsub (OCR)  : quet chu CUNG in tren hinh bang OCR chay ngay tren may (hoac tach phu de mem co san); cung co o TOC DO video -> luu .srt canh video (cung muc do).
  5) Trinh doc van ban   : doc van ban dai bang giong Ninh Don cua ban (chay tren may) hoac giong Microsoft online / Azure TTS (xem muc "TAB TRINH DOC VAN BAN"; truoc la tab Ninh Don TTS).
  6) SmartCut            : cat video thong minh -> project CapCut / mp4 roi, cat deu theo thoi luong hoac cat theo loi review (xem muc "TAB SMARTCUT").
  7) Tai video           : dan link YouTube / Douyin / TikTok / Bilibili... -> tai ve may bang yt-dlp (xem muc "TAB TAI VIDEO").
  Cac tab 2, 3 va 4 DOC LAP nhau: lay sub xong chi luu .srt canh video; muon dich file nao thi sang tab Dich phu de chon file do.
  Cac tab chay duoc CUNG LUC; sang tab khac thi viec van chay tiep (thanh ben hien cham "dang chay").
  Tab 2-7 chi nap vao bo nho khi bam vao lan dau (may nhe). Muc "Du lieu & sao luu" o thanh ben: RAM, don cache, sao luu / khoi phuc cau hinh cua tab Dich.

Tab Long tieng co HAI TRANG, doi bang thanh tab duoi o "Giong doc" (dung chung giong, toc do, cao do):
  TRANG "Doc van ban": dan van ban dai, chon giong, bam chuyen -> ra 1 file mp3/wav/m4a.
  TRANG "Long tieng theo SRT" gom 4 muc:
    1) Tep SRT & project CapCut : chon file SRT (vd ban da dich o tab Dich phu de SRT), chon PROJECT CAPCUT (hien ANH BIA cua tung project).
    2) Kieu phu de, vi tri, che sub cu : phong + co chu, DANH SACH KIEU CHU (o "Aa"), vi tri phu de, che sub cu (xem muc "KIEU PHU DE").
    3) Tao giong & chen vao project : "Cach lam" (chen / tao project moi / chi xuat audio), "Xu ly" (Chu + giong / Chi giong / Chi chu), toc do toi da, nut
       "Tao giong". Muc nay CHI THEM audio / chu vao project, KHONG sua video: video giu dung nhu luc ban dua vao.
    4) Tu can chinh video theo loi doc : nut "Tu Can Chinh Audio" va nut "Xoa text & audio TTS". Chi chay khi BAN BAM NUT, "Tao giong" khong tu can chinh.
       Hang duoi do co 3 nut: "Chi gop audio" (gop hang tram clip giong thanh 1 clip, nhanh), "Gop video + audio" (them: gop cac manh video
       da cat thanh 1 clip - RENDER LAI ca video: rat lau, ton o dia) va "Hoan tac gop". Lam SAU khi can chinh va da kiem tra trong CapCut, de CapCut xuat nhe hon. Gop xong khong can chinh / sua tung cau duoc nua; hieu ung giong CapCut gan tren tung clip se mat.
Duoi moi muc co DAI TIEN DO RIENG cua tung viec: ten viec, cac chang (Tao giong -> Khop gio -> Ghi file -> Chen CapCut), %, dong trang thai, nut Dung.
CAC CONG CU CHAY DUOC CUNG LUC (xem muc "CHAY NHIEU VIEC CUNG LUC").

TAB TRINH DOC VAN BAN  (thanh ben trai; truoc la «Ninh Don TTS»)
----------------------------------------------------------------
  - Doc van ban DAI (khong gioi han ky tu). Muc 1 chon NGUON GIONG:
      * "Ninh Don · VieNeu (offline)": giong Ninh Don cua ban, nhan ban tu file mau 3-8 giay (VieNeu-TTS, ma nguon mo Apache-2.0). Chay hoan toan tren may, khong goi dich vu nao.
        Them giong khac: "＋ Them giong clone" (2.5.11; o MOI nguon): chon file mau 3-8 giay (wav / mp3 / m4a / flac / ogg / video...), DAT TEN THEO Y -> luu lai (voices.json + thu muc ref), hien voi dau ★; chon giong ★ thi co "Doi ten" va "Xoa giong". Chi dung giong ban co quyen su dung. Adam / Tung Dang da bo tu 2.5.1 (giong ban tu them khong bi dung toi).
      * "Microsoft online": giong Microsoft Edge (~75 ngon ngu: Viet, Anh, Trung, Nhat, Han, Thai, Hindi, A Rap, Nga, Phap, Duc, Tay Ban Nha...; chon "Ngon ngu" roi "Giong"), mien phi, KHONG can key, CAN Internet (van ban duoc gui toi may chu Microsoft).
        Luon dung DUNG giong da chon. Microsoft chap chon ("No audio was received"): thu lai, thu doc tung cau ngan, roi tu CHO 15 / 30 / 60 / 90 giay va lam tiep doan do (cac doan da doc nam trong file, khong doc lai).
        Loi 403 (Microsoft doi cach ky): tu tai thu vien edge-tts moi nhat tu PyPI (kiem tra sha256, luu o AutoStudioData\vendor\edge_tts) roi doc lai, khong can build lai. Nut "Thu nhanh Microsoft" / "Cap nhat edge-tts".
      * "Azure TTS V1": Azure Speech (REST v1). Nhap key + vung (vd southeastasia) -> "Kiem tra & luu" -> tai danh sach giong cua tai khoan (MOI ngon ngu: Viet, Anh, Trung, Nhat, Han...; danh sach luu tu ban cu chi co Viet + Anh thi bam lai de tai them). Can tai nguyen "Speech" tren Azure
        (goi F0 mien phi ~0,5 trieu ky tu/thang). Key luu trong AutoStudioData\ninhdon\settings.json tren may nay, khong gui di dau ngoai Azure.
  - DA NGON NGU: van ban Trung / Nhat / Han / Thai... chia cau theo dau cau toan chieu (。！？，、), khong can dau cach. Dan van ban khong hop giong dang chon (vd chu Han ma giong tieng Viet,
    hoac nguon VieNeu chi doc Viet / Anh) thi tool hoi "Doi sang giong ... roi doc?" (Co / Khong = van doc / Huy; chon Khong thi khong hoi lai trong phien). Nghe thu khi o van ban de trong se doc mot cau mau dung ngon ngu.
    Danh sach giong san co trong ung dung la ten giong THAT cua Microsoft; bam "Lam moi danh sach giong" (can mang) de lay danh sach dang chay that (giong moi / bo giong da ngung), luu o ninhdon\ms_voices.json.
  - Am luong 20-200% (mac dinh 100% = nguyen ban): ap dung cho ca 3 nguon va ca Nghe thu; tren 100% co nen mem o dinh song de to len ma khong vo tieng.
  - Cac nguon dung chung: chia doan, nghi sau moi cau / khi xuong dong, [nghi 1.5s], toc do 70-140%, xuat MP3, ten file lay cau dau bai (khong ghi de bai cu: trung ten thi them (2), (3)...), nut Nghe thu.
    The cam xuc [cuoi] [tho dai] [hang giong] CHI VieNeu hieu (Microsoft / Azure se bo di, khong doc thanh tieng). MP3 va chinh toc do dung ffmpeg CHUNG cua Auto Studio (Microsoft online cung can ffmpeg de doi mp3 -> wav).
    Thu muc luu mac dinh: Documents\Auto Studio\NinhDonTTS.
  - THU VIEN AI VieNeu RAT NANG (torch...) nen KHONG nam trong file exe: chay o TIEN TRINH RIENG bang Python cua moi truong .venv. Cai dat 1 LAN ngay trong tab (chi can khi dung nguon Ninh Don):
      * Nguon "Ninh Don" -> nut "Cai dat (1 lan)": tao moi truong rieng o AutoStudioData\ninhdon\.venv + pip install vieneu (vai tram MB, can Internet).
        Can co Python 3.10-3.13 tren may (khuyen dung 3.12; tai tu python.org, tick "Add python.exe to PATH"); chua co thi tu tai ban Python gon nhe.
      * Da co san Local TTS ban rieng (thu muc NinhDon_LocalTTS co .venv)? Bam "Dung moi truong co san..." roi chon thu muc do -> khong cai them.
      * Lan dau doc se tai model tu Hugging Face (vai tram MB), sau do chay OFFLINE. Model chi duoc tai khi can (bam "Chuyen thanh giong noi" hoac "Tai model");
        "Giai phong RAM" de nha model khi khong dung nua. Model (Turbo 48 kHz / Nano nhanh hon) va int8 chi co o nguon Ninh Don.
  - Thu vien edge-tts di kem trong exe (requirements.txt co edge-tts; build.bat gom vao ban build).
  - Du lieu: AutoStudioData\ninhdon  (settings.json gom nguon + giong da chon cua tung nguon + key Azure, voices.json, azure_voices.json, ms_voices.json (danh sach giong Microsoft tai ve), ref\ = giong mau, engine\worker.py, .venv\).

TAB TAI VIDEO  (thanh ben trai, nhom CONG CU)
---------------------------------------------
  - Cong cu YT Downloader da duoc GAN vao Auto Studio: cung cua so, cung giao dien, dung CHUNG ffmpeg. Du lieu: AutoStudioData\ytdl  (settings.json, cookies.txt).
    Thu muc luu mac dinh: Documents\Auto Studio\TaiVideo (doi duoc, nho cho lan sau).
  - DAN LINK: 1 link, nhieu link (cach nhau dau cach / xuong dong), link playlist (tu tach tung video), roi bam "Them vao danh sach". Dan nhieu dong / dong co TAB vao o link
    thi tu mo "Hang loat": moi dong "link" hoac "link<TAB>Ten tap" (copy tu extension YT Cookie Exporter) hoac "link<TAB>Ten<TAB>link tai truc tiep" (Douyin). Dong chi co link:
    dat ten theo "Mau ten" (vd "Ten phim - Tap {n}"), "Bat dau tu", "Dao nguoc thu tu"; so tap gan co dinh theo vi tri trong danh sach dan (khong lech khi bo link da co).
  - MOI VIDEO LA MOT THE: thanh tien do, toc do, thoi gian con lai; nut sua ten (hoac bam doi vao ten), tam dung / tiep tuc (giu phan da tai, tiep tuc tu cho dang do),
    xoa. Tai that bai tu thu lai toi da 5 lan (nghi 3, 6, 9, 12 giay) roi moi bao loi do trong nhat ky. Tai xong the tu an, xem het trong bang "Tong quan"
    (loc: Da luu / Loi / Dang tai / Tam dung; nut "Thu lai cac muc loi"). "Xoa khoi danh sach" khong xoa file da tai.
  - CHAT LUONG: Tot nhat tuong thich (MP4) / Cao nhat (4K-8K, MKV) / toi da 1080p, 720p, 480p / Chi am thanh (MP3).
  - TANG TOC: "Thuong" / "Nhanh (8 luong)" / "Toi da" (64 manh dong thoi) / "Sieu toc (aria2c)" (16 ket noi, can aria2c - xem ben duoi; chua co thi tu ve "Toi da").
    "Tai cung luc" 1-50 hoac Khong gioi han (YouTube gioi han toc do tung ket noi nen tai nhieu video cung luc thuong nhanh hon; qua nhieu de bi bao 429 tam thoi).
  - CAN GI DE TAI: yt-dlp da nam san trong chuong trinh. ffmpeg (ghep hinh + tieng): dung ban chung cua Auto Studio. YouTube can DENO; che do Sieu toc can ARIA2C ->
    ca hai tai 1 lan o tab "Tai du lieu can thiet" (nhom "Tai video"), dung duoc ngay khong can khoi dong lai. Tab co dong trang thai cho biet cong cu nao con thieu + nut di toi tab do.
    Muon tu chep: de deno.exe / aria2c.exe canh chuong trinh hoac vao thu muc AutoStudioData\tools.
  - COOKIE (chi can khi YouTube dong dang nhap, hoac voi Douyin / Bilibili): "Quet cookie" doc tu Chrome / Edge / Firefox / Brave... (nen tat han trinh duyet truoc);
    Chrome / Edge ban moi (v127+) ma hoa App-Bound nen co the khong doc duoc -> dung Firefox, hoac "Dan cookie" / "Chon file..." (cookies.txt xuat tu extension). Cookie Douyin /
    TikTok / Bilibili trong cookies.txt luon duoc dung cho link cua trang do. Cookie la thong tin dang nhap cua ban: KHONG gui cookies.txt cho nguoi khac.
  - DOUYIN: thu lan luot trang chia se (mobile) -> trang web (dung cookie cua ban) -> yt-dlp; link du phong khi link dau loi; co "link tai truc tiep" tu extension (cot 3) thi tai thang, khong can cookie.
    Tu 2.5.38: Douyin chi tai toi da 3 tap cung luc (moi tap 4 ket noi) du 'Tai cung luc' de khong gioi han, vi Douyin chan khi don nhieu yeu cau; tap den luot sau tu cho. Dut giua chung thi tu noi tiep. Cot loi hien ly do that (khong con cau sai 'Fresh cookies' cua yt-dlp). Cookie moi khong giup duoc khi bi chan; doi vai phut roi bam tai lai phan loi.
    Nhat ky ghi ro ly do tung cach that bai. Khong dam bao 100% vi Douyin doi co che chong bot lien tuc.
  - BILIBILI: dan link bilibili.com/video/BV..., b23.tv, bangumi; video nhieu phan (P1, P2...) tu liet ke tung phan. Dang nhap trong trinh duyet roi xuat cookie de tai chat luong cao.
  - GHI DE: mac dinh (cong tac "Ghi de file trung ten" BAT) tai lai mot tap da co file cung ten se tai moi roi THAY file cu. Tat cong tac thi gap file cung ten se bo qua. Hai video KHAC NHAU nhung trung ten trong cung thu muc se de len nhau khi BAT.
  - Dong chuong trinh khi con video dang tai -> hoi; dong thi cac muc duoc tam dung (file do dang giu lai, lan sau them lai link se tai tiep).
  - YouTube hay doi co che: neu bao loi "Sign in" / "n challenge" / thieu dinh dang -> cap nhat: build lai bang build.bat (tu len yt-dlp ban moi nhat), hoac tab "Cap nhat phan mem".
  - Luu y ban quyen: chi tai video ban co quyen tai / dung.

BAN QUYEN / KEY  (thanh ben trai, nhom HE THONG)
  - Dung thu 3 ngay ke tu lan mo dau tien (doi so ngay: TRIAL_DAYS trong licensing.py). Het dung thu: 7 cong cu (Long tieng CapCut, Dich phu de, Lay sub Jianying/CapCut, Quet hardsub,
    Ninh Don TTS, SmartCut, Tai video) bi khoa, bam vao se chuyen sang tab "Ban quyen". Tai du lieu / Cap nhat / Du lieu & sao luu / Ung ho / Ban quyen LUON mo duoc.
  - Khach: mo tab "Ban quyen" -> "Sao chep ma may" (dang ABCD-EFGH-IJKL-MNOP) -> gui cho tac gia + thanh toan -> nhan KEY -> dan vao o "Nhap key" -> "Kich hoat".
    Thanh ben duoi cung hien thoi han con lai. Gia han = nhap key moi (key tot hon moi thay key cu).
  - TAC GIA cap key bang AutoStudio_KeyTool (goi rieng, KHONG phat hanh): bam doi tao_key.bat -> dan ma may -> chon goi -> nhan KEY (tu chep vao clipboard).
    private.key la KHOA RIENG - ai co file nay deu tu cap key duoc: giu bi mat, sao luu. Nen tao khoa rieng cua ban truoc khi phat hanh that:
    tao_khoa_moi.bat --force --patch "duong\dan\licensing.py" roi build lai (key cu mat hieu luc).
  - Cach hoat dong: key = (goi, ngay het han, ma may, so seri) ky bang Ed25519; chuong trinh chi chua khoa CONG KHAI nen chi kiem tra duoc, khong tao duoc key. Khong can may chu.
    Trang thai dung thu / key luu o ~\AutoStudioData\license.dat + registry (HKCU\Software\AutoStudio) kem dau HMAC; chinh dong ho lui de keo dai han bi chan (tru key vinh vien).
  - Muc bao ve la VUA PHAI: ngan nguoi dung thuong, khong ngan duoc nguoi biet bien dich nguoc / va file. Muon chac hon can may chu kiem tra key (chua lam).
  - Dat lien he / bang gia hien trong tab Ban quyen: sua CONTACT, PRICE_TEXT trong appinfo.py.

TAB SMARTCUT  (thanh ben trai)
------------------------------
  - Khung "Video nguon" (dung chung 2 che do): them video / thu muc, sap thu tu 1 -> n bang nut mui ten. Ket qua = project CapCut dat san cac doan tren dong thoi gian,
    tro thang vao video goc (khong ma hoa lai, giu ti le) - KHONG xoa / di chuyen video goc sau khi tao project.
  - Che do "Cat deu theo thoi luong": nhap thoi luong dich + so giay moi canh -> tool nhan dien canh, cham diem khung dep (net, sang, mau, chuyen dong), chia deu video
    dai / ngan (thanh "Can bang"). Xem cac canh da chon, "Bo canh nay" de chon canh khac, roi "Tao project CapCut" hoac "Xuat file mp4 roi".
  - Che do "Cat theo loi review": them audio review (nhieu file, tu noi lien mach) -> (1) nghe giong + tieng goc cua video, ghep tung cau voi video -> (2) chon canh
    (phu kin giong, tranh canh mat to / selfie, tranh trung canh, tu bu khi thieu) -> doi canh / dich +-1s / giu (khoa) -> (3) tao project CapCut (audio review lien mach).
    Chi tiet thuat toan giong ban SmartCut rieng (README cu), khong doi.
  - Tab nay dung CHUNG ffmpeg cua Auto Studio. Du lieu AI (mo hinh nghe giong Whisper, hieu hinh anh CLIP, khuon mat YuNet / SFace) van o C:\Users\<ban>\SmartCutData
    nhu ban SmartCut rieng: da tai roi thi KHONG tai lai. Cai dat nho cua tab o AutoStudioData\smartcut\settings.json.
  - Can them thu vien AI (xem requirements-ai.txt: faster-whisper, fastembed, goi CUDA neu co GPU NVIDIA). Thieu thi cat deu van chay, "cat theo loi review" bao thieu thu vien.
  - TOC DO SmartCut (chay GPU khi co, tu chay CPU khi khong): nghe giong uu tien GPU NVIDIA. May co card NVIDIA nhung chua co thu vien CUDA thi bam (1) se HOI tai NGAY TRONG
    chuong trinh (~1 GB, mot lan), tai xong tu chay tiep bang GPU; chon Khong hoac may khong co card thi chay CPU (cham hon nhieu lan; CPU dung mo hinh 'small' cho phan nghe
    tieng goc cua video + ban dich tieng Anh). Dong trang thai cuoi cua so ghi ro dang chay GPU hay CPU; neu GPU loi giua chung thi bao ly do roi chuyen CPU.
    Giai ma video bang GPU (ffmpeg -hwaccel auto, chi Windows; loi thi tu chay lai bang CPU; dat bien moi truong AS_HWACCEL=0 de tat). Moi video: do tinh chat anh, tim nguoi,
    khuon mat, nghe tieng goc, xem hinh anh chay SONG SONG (truoc day lan luot, moi viec giai ma lai ca video); log ghi thoi gian tung buoc de biet buoc nao cham.
    Nghe giong luu tung doan 15 phut: bam Dung roi chay lai khong mat phan da nghe. Cat deu: phan tich nhieu video cung luc; khong du canh theo do dai da chon thi tu doi
    do dai moi canh (gan do dai chon nhat) de DU DUNG thoi luong dich va ghi ro tren man hinh.

CAI DAT BANG SETUP.EXE  (cach gui cho nguoi khac)
-------------------------------------------------
  - build_nuitka.bat: build BAO VE bang Nuitka (15-40 phut, bien dich ra ma may, giau ma nguon) - kich ban cu cua build.bat; ket qua giong build.bat (dist\AutoStudio + zip cap nhat + Setup.exe). CHUA chay thu voi ban hien tai tren Windows that.
  - build.bat: build bang PyInstaller (vai phut; da bo Nuitka) -> dist\AutoStudio\ + zip cap nhat + Setup.exe (can Inno Setup 6). Chua thu tren Windows that: tu kiem tra o cuoi bao thieu gi (van tao Setup de chay thu).
  - build.bat tao  dist\AutoStudio_Setup_<ban>.exe  bang Inno Setup 6 (mien phi: https://jrsoftware.org/isdl.php - cai 1 lan tren MAY BUILD, nguoi nhan khong can).
    Chua cai Inno thi build.bat tao dist\AutoStudio_v<ban>.zip thay the (van gui / cap nhat duoc, nhung nguoi nhan phai giai nen va tu bam tai du lieu).
  - CHI GUI 1 tep Setup.exe. Nguoi nhan: mo Setup.exe -> (chon thu muc, tuy chon bieu tuong Desktop) -> Cai dat. Thanh tien trinh chay 2 giai doan: chep chuong trinh, roi
    TU TAI DU LIEU CAN THIET (ffmpeg, mo hinh nghe giong / hieu y / hieu hinh, thu vien GPU neu may co card NVIDIA, moi truong + mo hinh giong Ninh Don). Xong bam Hoan tat
    -> mo Auto Studio la DUNG DUOC NGAY, khong con buoc tai nao nua. Can Internet luc cai; du lieu khoang 3-6 GB nen cai mat vai chuc phut (tuy mang).
    Setup KHONG nhet du lieu vao tep (de tep nho, du lieu luon la ban moi nhat cua nha cung cap).
  - Cai vao thu muc NGUOI DUNG (C:\Users\<ban>\AppData\Local\Programs\AutoStudio): KHONG can quyen quan tri. Co muc Start Menu, tuy chon bieu tuong Desktop, go cai dat trong
    "Apps & features". Go cai dat chi xoa chuong trinh; cai dat + mo hinh da tai (AutoStudioData, SmartCutData) duoc GIU LAI.
  - Tai du lieu trong luc cai: trang "tac vu" co o tich "Tai luon du lieu can thiet..." (mac dinh tich). Bo tich, hoac bam HUY luc dang tai = BO QUA buoc tai (chuong trinh
    van cai xong, phan da tai duoc giu); sau do vao tab "Tai du lieu can thiet" tai tiep. Tai loi (mang yeu, het o dia...) cung khong lam hong ban cai: Setup bao muc nao chua tai
    duoc; nhat ky o AutoStudioData\hub\install.log. Moi muc tu thu lai 1 lan. May da co san muc nao thi bo qua muc do, khong tai lai. Het o dia thi khong tai gi va bao can bao nhieu GB.
  - Cai de len ban cu (chay Setup moi) = cap nhat tai cho, giu du lieu. Cai im lang: Setup.exe /SILENT (khong tai du lieu; chuong trinh tu hoi neu thieu).
  - Chay tay buoc tai du lieu (khong qua Setup): AutoStudio.exe --hub-install-all  (khong cua so; tien do ghi vao AutoStudioData\hub\install_progress.txt).
  - Setup.exe va AutoStudio.exe CHUA ky so (code signing) nen Windows SmartScreen / diet virus co the canh bao lan dau ("More info" -> "Run anyway"). Ky so can chung chi tra phi.

CAP NHAT TU DONG  (tab "Cap nhat phan mem", nhom HE THONG)  - KIEU "MOI BAN MOT THU MUC", khong cai de
------------------------------------------------------------------------------------------------------
  - Ban dat 2 tep len CUNG 1 cho tren mang: dist\AutoStudio_v<ban>.zip va dist\update.json (build.bat tu tao ca hai - xem make_update.py, make_zip.py). Cho dat tep: Release cua GitHub
    (2 tep dinh kem), may chu web rieng - mien la HTTPS va tai THANG duoc tep (khong phai trang xem truoc). Khong dung MEGA; Google Drive bi chan tep lon bang trang canh bao.
  - Ghi dia chi https://... cua update.json vao UPDATE_URL trong appinfo.py (1 lan, TRUOC khi build ban dau tien). Chua ghi thi nguoi dung van dan duoc trong tab ("Doi dia chi cap nhat").
    Link nay KHONG doi qua cac ban. Neu doi link thi ban da cai van giu link cu.
  - Chuong trinh tu kiem tra khi mo (tat duoc trong tab); co ban moi hon -> hoi 1 lan -> tai zip (tiep tuc duoc neu dut mang) -> kiem sha256 -> GIAI NEN vao thu muc RIENG canh ban dang dung
    (vd. ...\Programs\AutoStudio_v2.0.1 canh ...\Programs\AutoStudio) -> dong chuong trinh -> mo ban moi. KHONG cai de, KHONG chep ban cu: nhanh, nhe may, khong vuong tep dang bi khoa.
    Tai xong thi zip bi xoa (do ton dung luong); het o dia / khong ghi duoc thu muc cha thi bao ro ly do, ban cu khong bi anh huong.
  - O tich "Xoa ban cu sau khi chuyen sang ban moi" (mac dinh TAT): khong tich = ban cu con nguyen o thu muc cua no, muon quay lai thi mo AutoStudio.exe trong do. Tich = ban moi, ngay luc
    khoi dong, xoa thu muc ban cu (chi xoa khi chac day la thu muc Auto Studio khac ban dang chay; bi khoa thi thu lai o lan mo sau, toi da 5 lan). device.json dat canh exe cua ban cu duoc chep sang.
  - Loi tat (Desktop, Start Menu) dang tro vao ban cu duoc tu tro sang ban moi (PowerShell), nen bam loi tat luc nao cung mo ban moi nhat. Neu khong sua duoc loi tat thi mo AutoStudio.exe trong thu muc moi.
  - DU LIEU DUNG CHUNG MOT CHO cho moi ban: cai dat, ffmpeg, mo hinh AI, thu vien GPU, moi truong giong noi nam o C:\Users\<ban>\AutoStudioData va SmartCutData - ban moi dung lai, khong tai lai.
    Luu y: mo ban CU sau khi ban moi da doi cach luu cai dat thi ban cu co the khong doc het cai dat.
  - Setup.exe dung cho nguoi cai LAN DAU (cai nhu app binh thuong + tu tai du lieu). Moi ban phat hanh: tang VERSION + them muc CHANGELOG trong appinfo.py -> build -> dat zip moi + update.json moi (ghi de)
    len cho do. Ghi chu hien cho nguoi dung = muc CHANGELOG moi nhat. Neu update.json tro vao tep .exe (Setup) thay vi .zip thi app chay Setup /SILENT cai de len ban cu (cach du phong).
  - Go cai dat (Setup) chi xoa thu muc cai goc; cac thu muc ban cap nhat (AutoStudio_v...) tu xoa tay. Neu da xoa thu muc cai goc bang tich "Xoa ban cu" thi muc Apps & features con sot, bo qua duoc.
  - An toan: chi nhan https (tru may cuc bo khi thu), kiem sha256 truoc khi giai nen. Ai kiem soat noi dat 2 tep nay thi kiem soat duoc ban cap nhat - bao ve tai khoan noi dat tep.
    Repo GitHub chi dung de dat Release thi la repo TRONG (khong dua ma nguon len); tep trong Release la cong khai, ai co link cung tai duoc.



TAB GIAO DIEN  (thanh ben trai, nhom HE THONG)
  Doi dien mao chuong trinh, khong anh huong chuc nang nao:
   - Mau nhan (nut chinh, thanh tien do, muc dang chon): 8 mau co san hoac "Chon mau khac..." / go ma #rrggbb.
   - Mau nen: chi nhan nen TOI (nen sang qua se tu duoc lam toi lai); mau khung, vien, nut phu tu tinh theo nen + mau nhan.
   - Bo goc nut 0-22 px (0 vuong, 9 mac dinh, 22 tron nhu vien thuoc), co chu 85-120%.
  Hinh xem truoc ben tren doi ngay khi chon. "Ap dung va khoi dong lai" luu cai dat roi mo lai chuong trinh (neu dang co viec chay se hoi nhu khi thoat);
  "Ve mac dinh" tra lai nhu ban dau. Cai dat o ~/AutoStudioData/theme.json - xoa tep nay la ve mac dinh. Chu lon qua 110% co the lam vai khung bi chat.

TAB TAI DU LIEU CAN THIET  (thanh ben trai, nhom HE THONG)  - DANH CHO BAN GUI NGUOI KHAC
-------------------------------------------------------------------------------------------
  - Setup.exe da tu tai san cac muc nay luc cai (xem muc tren). Tab nay dung khi: bo qua buoc tai trong Setup, tai loi giua chung, dung ban zip, muon them muc TUY CHON
    (Whisper small / large-v3), hoac ban moi can du lieu moi. Mo tab -> bam "Tai tat ca muc con thieu" -> tai xong bam "Khoi dong lai Auto Studio". Can mang.
    Da tai roi thi hien "Da co", khong tai lai. Lan dau mo chuong trinh tren may chua co ffmpeg, chuong trinh tu hoi co muon vao tab nay khong.
  - Cac muc: ffmpeg (dung chung) - SmartCut: mo hinh nghe giong Whisper (small / medium / large-v3), mo hinh hieu y cau, mo hinh hieu hinh anh (CLIP), thu vien GPU NVIDIA
    (CUDA ~1 GB, chi can khi co card NVIDIA) - Ninh Don TTS: moi truong giong noi (VieNeu-TTS; may chua co Python thi tu tai Python gon nhe ~10 MB cua python.org, khong can cai
    gi) va mo hinh giong - Tai video: Deno (~45 MB, giai ma link YouTube cho yt-dlp) va aria2c (~2 MB, che do Sieu toc) tai tu GitHub, cung nam o AutoStudioData\tools.
    Muc "KHUYEN DUNG" nam trong nut "Tai tat ca"; muc "TUY CHON" bam rieng khi can.
  - Bam "Dung" la dung that (mo hinh AI lon tai trong tien trinh con rieng nen ngat duoc ngay); phan da tai duoc giu lai, bam tai lai thi tai tiep.
  - Vi tri: ffmpeg + thu vien GPU o C:\Users\<ban>\AutoStudioData\tools va \cuda; mo hinh SmartCut o \SmartCutData\models; Ninh Don o AutoStudioData\ninhdon (.venv) + cache Hugging Face.
    Tat ca la tep CONG KHAI cua ben thu ba, luu dang tep thuong (khong ma hoa). Phan duoc bao ve la MA cua ban (da dich ra ma may trong exe).
  - build.bat KHONG chep thu vien GPU vao ban phat hanh nua (nang). Muon kem san: set WITH_CUDA=1 truoc khi chay build.

THEM CONG CU MOI VAO AUTO STUDIO (vd tool tao video AI - AnimStudio)
--------------------------------------------------------------------
  Mot cong cu = 1 goi (thu muc) nam canh app.py, co tep  <goi>\tab.py  voi lop  Page(parent, app)  (tk.Frame), dung giao dien chung trong theme.py.
  Them 1 dong vao danh sach TOOLS trong tabs.py:   Tool("anim", "<bieu tuong> Ten tab", "CONG CU", "animstudio.tab")
  Thanh ben, chuyen tab, cham "dang chay", hoi truoc khi thoat, don dep khi thoat do khung tabs.py lo. Hop dong cua Page (is_busy, on_show, on_hide, can_close,
  shutdown, prepare) va cac dau noi dung chung (theme, tools.find_ffmpeg / ensure_ffmpeg, tabs.data_dir) duoc ghi o dau file tabs.py.
  Nho them goi vao build.bat (--include-package=<goi>) va preflight.py.

KIEU PHU DE  (muc 2 cua trang Long tieng theo SRT)
--------------------------------------------------
  - DANH SACH KIEU CHU: moi o "Aa" la 1 kieu (co san 8 kieu: trang vien den, vang vien den, trang nen den mo, den nen trang bo tron, chu vang nen do bo,
    trang + bong do, neon xanh, do vien trang). Bam 1 lan de chon, bam doi (hoac "Sua") de sua. Cac nut: Them kieu / Sua / Nhan doi / Xoa / Ve kieu co san.
    Cua so sua kieu co XEM TRUOC ngay tren 3 nen (toi / canh phim / sang) va chinh duoc: mau chu + do dac, dam / nghieng / gach chan,
    VIEN (mau, do day), NEN CHU BO GOC (mau, do dac, bo goc 0-100% - 100% la hinh vien thuoc, mo rong ngang / doc), BONG DO (mau, do dac, khoang cach, goc, do nhoe).
    Xem truoc chi gan dung (phong chu cuoi cung do CapCut ve); sau khi chen van chinh tiep duoc trong CapCut. Kieu duoc luu trong settings.json.
  - VI TRI PHU DE: nhap X / Y theo PIXEL nhu bang "Vi tri" cua CapCut: (0, 0) la giua khung, X duong sang phai, Y AM la xuong duoi (vd Y -908 tren khung
    1080x1920 la sat day). Px tinh theo khung cua project dang chon (chua chon thi tam tinh 1080x1920; ngay duoi o nhap co ghi dang tinh theo khung nao).
    Ben trong tool luu theo ty le nua khung (-1..1) nen doi project khac khung thi chu van o dung ty le. Hoac bam "Chon vi tri..." de KEO chu tren khung xem truoc
    (chon duoc khung 9:16 / 16:9 / 1:1 / 4:5 hoac khung cua project; cac o X, Y, Rong, Cao trong cua so cung la px).
  - CHE SUB CU: tick "Bat che sub cu" (bo tick = khong che). Tool them mot lop BLUR len video de che chu cung cu; VIDEO GOC KHONG BI SUA.
      * Blur (MAC DINH): CLIP HIEU UNG that tren TRACK HIEU UNG cua CapCut (keo dai / ngan, doi do mo, doi hieu ung ngay trong CapCut). Hieu ung o track hieu ung lam mo CA khung hinh
        trong doan do (CapCut khong co mat na vung cho track hieu ung) - muon gioi han vung thi chinh trong CapCut. Hop thoai "Hieu ung mo..." muc 0 cho chon lai kieu cu:
      * Blur (kieu cu "clip video + mat na"): sao chep video len lop tren (tat tieng), ap hieu ung lam mo cua CapCut + mat na hinh chu nhat o dung vung ban chon (keo 4 goc trong cua so "Chon vung che").
        Lop blur la MOT THANH LIEN (khong cat theo tung doan video), nam DUOI chu phu de. Khong con thanh nen den: neu blur khong them duoc, tool bao ro ly do (chu van duoc them).
      * Nut "Hieu ung mo...": chon hieu ung (Mo co ban, Mat net, Mo ao, Mo doc / cheo / chuyen dong) + DO MO 0-100. Nut "Tai" tao project nho "AutoStudio_TaiMo" de CapCut tu tai hieu ung
        khi mo project do (can mang). Nut "Tim trong project CapCut cua toi" lay DUNG hieu ung "Mo" ban da tu gan trong CapCut (ma hieu ung dung may ban) - cach chac nhat.
      * Sau "Tu Can Chinh" thanh blur CHI duoc keo dai theo timeline moi (khong cat); hinh trong dai mo co the lech vai giay so voi canh dang chieu. Neu chua vua thi keo dai / ngan / doi vi tri tu do trong CapCut.
      * Chi che duoc khi CHEN vao project co san da co video (project moi chua co video thi bo qua va bao trong log).
      * Go lop che: nut "Xoa text & audio TTS khoi project" go luon giong, chu va lop che do tool them.
      * Xuat video xong trong CapCut: nut "Don audio TTS" xoa thu muc mp3 nguon (va thu muc rong) cho nhe may; project van con nhung cac doan giong se bao thieu file.
  - "Xu ly": Chu + giong (mac dinh) / Chi giong (khong them chu) / Chi chu (chi them phu de tu SRT: khong doc giong, khong can mang, khong can ffmpeg).
    "Chi chu" can "Cach lam" la chen vao project hoac tao project moi.

LICH SU PHIEN BAN
  2.5.45 Them o 'Thu nho cua so quet xuong thanh tac vu' (the Quet bo Douyin; can tien ich >= 2.5.3). Cua so quet mac dinh khong gianh focus. Chua thu tren Windows / Douyin that.
  2.5.44 Sua: bam 'Quet' khi trinh duyet da chon (vd Coc Coc) dang mo san thi KHONG mo them cua so trinh duyet, chi cho tien ich nhan viec. Tien trinh tai nam ngay ben canh nut tai cua tung bo.
  2.5.43 The 'Quet bo Douyin': moi bo hien ANH BIA + TEN GOC, danh sach video gon (o tick, tap gop co o tick rieng, bo qua trailer); nut 'Tai bo nay' / 'Tai cac bo da lay' tai ngay tai the Quet (dung chung cau hinh the Tai video); o 'Trinh duyet quet' (Chrome/Edge/Coc Coc/Brave) + bam Quet tu mo trinh duyet; thanh tien trinh + so video moi bo. Can tien ich YT Cookie Exporter >= 2.5.1. CHUA thu voi Douyin that.
  2.5.42 THEM the 'Quet bo Douyin' ngay trong muc Tai video (ben phai the 'Tai video'): dan link kenh / bo suu tap Douyin -> hien danh sach cac bo (TEN GOC + so tap), moi bo co nut 'Lay link bo nay' va 'Sang the Tai'. Tool nho tien ich YT Cookie Exporter (>= 2.5.0) quet + lay link tai truc tiep; tai van bang Auto Studio. Ten 'Ten goc - Tap 01'... theo so tap Douyin; tu luu .txt; ban co 'tap gop / trailer'; danh sach tai cao hon. CHUA thu voi Douyin that.
  2.5.41 SUA tab Tai video: dan link may chu video cua Douyin (dang https://v3-web.douyinvod.com/...) gio tai duoc (truoc day tool chi coi la Douyin khi link co "douyin.com"). Tai thang bang duong link truc tiep, khong hoi trang Douyin. Link song khoang 3 gio.
  2.5.40 SUA tab Tai video, Douyin: tap CO link tai truc tiep (tu extension) tai toi da 8 tap cung luc thay vi 3 (ban 2.5.38 gioi han cung 3 tap nen o "Khong gioi han" van tai it tap); tap khong co link truc tiep van 3 tap cung luc. SUA che do "Sieu toc (aria2c)": thanh % va toc do khong nhay vi doc sai dong tien trinh cua aria2c (aria2c in them chu B, Ki/Mi/Gi); loi aria2c nay kem giai thich (ma 22 = may chu tu choi, thuong do link het han). CHUA thu voi Douyin that va aria2c that, da kiem bang gia lap.
  2.5.39 SUA tab Tai video: tai lai tap da co file CUNG TEN thi THAY file cu that su (tai moi ve file tam, xong moi thay; loi giua chung thi file cu con nguyen) thay vi bao Hoan tat ngay. Them cong tac "Ghi de file trung ten" (mac dinh BAT; TAT = gap file cung ten thi bo qua, ghi nhat ky). Ghep hinh+tieng / doi MP3 ghi ra file tam roi moi thay file cu. CHUA thu voi Douyin that, da kiem bang gia lap.
  2.5.38 SUA tab Tai video, Douyin: toi da 3 tap tai cung luc (moi tap 4 ket noi, lay thong tin cach nhau ~0,7 giay) vi Douyin chan khi don nhieu yeu cau; dut giua chung thi tu noi tiep; link truc tiep tu extension loi thi khong chuyen sang yt-dlp va hien dung ly do; cot loi khong con hien cau sai 'Fresh cookies'. CHUA thu voi Douyin that.
  2.5.37 SUA tab Dich: so thu tu '[10]' khong con nam trong ban dich / SRT / TTS (AI hay tra '[753] cau goc ||| [753] ban dich'); so chi de khop dong. Ban luu cu dinh nhan tu duoc don. Thu bang dinh dang Gemini, CHUA thu tren Gemini that va Windows.
  2.5.36 SUA danh sach model Gemini (tab Dich, AI Web Translate): hien dung TEN MODEL 3.5 Flash-Lite / 4 Hydrogen / 4 Argon / 4 Carbon (truoc do hien ten che do tieng Viet va lam rot 4 Hydrogen nen khong chon duoc). Danh sach luu cua ban 2.5.35 tu bi bo va doc lai tu trang. Thu tren trang gia lap, CHUA thu tren Gemini that va tren Windows.
  2.5.35 Thanh LOADING luc mo app (day, bo goc, mau chuyen dan, hien %) + thanh 'Dang tai tab' khi mo tab lan dau. Tab Dich (AI Web Translate): danh sach model TU CAP NHAT theo trang that (Gemini, ChatGPT, Claude, Copilot): mo tab Dich (cu hon 12 gio) / nut 'Cap nhat model' / 'Ca 5 trang' / moi lan dich deu doc lai menu model cua trang; bo muc khong phai model ('Cap do tu duy'). Gemini moi: 4 Hydrogen, 4 Argon, 4 Carbon, 3.5 Flash-Lite. Model dang chon khong con tren trang thi bao ro va liet ke model trang dang co; chu tu go khong con vao dia chi trang. Moi thu thu tren trang gia lap co trinh duyet that; CHUA thu tren Gemini/ChatGPT/Claude that va tren Windows.
  2.5.34 Sua loi tab Dich bao 'sot' / to vang SAI du Gemini da dich het: tu nay CHI bao sot khi dong chua co chu Viet (AI bo dong) hoac ban dich con chu Trung / con nguyen cau ngoai ngu. Dong da co tieng Viet thi ghi nhan luon. Nguyen nhan: tool coi ban dich viet so bang CHU ('nam ngan quan') la 'mat so' (cau goc 5,000) hoac lech do dai -> khong ghi, gui bu lap lai; cac kiem tra nay nay chi la ghi chu. Dong mo dau bang cam than + dau cau ('啊 1,000贯': AI chep '啊 1,' bo dau chi con 2 ky tu) tung bi tu choi mai vi 'chep qua ngan': nay van khop. Ban tam to vang cu: dong da co chu Viet sach thi nhan luon khi mo lai tep; dong chi la tieng cam than duoc dien tu dien va tinh la da dich. Luot gui bu: AI chep sai dau cau goc nhung khong khop dong nao khac thi tin so thu tu. Thu tren Gemini gia lap: sot 12-60 dong -> 0. Chua thu voi Gemini that. 'Cach doc' chi con HAI lua chon: 1. SAMI va 2. Cach cu; BO 'Tu dong' (may nao bi chan thi lui ve duong kia van bi chan). Chon SAMI = chi SAMI, chon Cach cu = chi duong cu (gom lo 20 cau, can ma may), khong tu doi qua lai; mac dinh SAMI, cai dat cu 'Tu dong' (hoac tts_mode.txt / AUTOSTUDIO_TTS_MODE = auto) doi thanh SAMI. SmartCut 'Cat deu theo thoi luong' (va 'cat theo loi review'): project CapCut nay duoc dung o thu muc TAM canh thu muc project, co draft_id rieng ngay tu dau, xong han moi DOI TEN vao thu muc project cua CapCut roi ghi vao danh sach (truoc day thu muc hien ngay luc bat dau dung voi tep mau pycapcut dung chung 1 id mau, CapCut dang mo co the nap nham ban do dang roi bo qua project that - nghi van, chua kiem chung voi CapCut that); thanh trang thai bao dung ket qua ghi danh sach.
  2.5.33 SAMI gui toi 2000 cau cung luc (truoc 300): BO o 'Cau gui cung luc' tren giao dien (mac dinh 2000, may chu bao ban / treo thi tu giam; chinh toi 3000 bang bien AUTOSTUDIO_SAMI_PAR). 'Cach doc' doi len ngay duoi o trang thai API CapCut o goc phai tren. Lam dep o chon / o nhap: bo tron, vien sang khi tro chuot / dang go, o so Toc do / Vol co nut ▲▼ (ninhdon/rounded.py: RCombo / REntry / RStep); o ttk o cac tab khac bo o mui ten xam vuong. Thu tren may chu gia lap: 6000 cau (tre 1 giay) xong ~17 giay voi 3000 luong, khong loi; CHUA thu voi may chu CapCut that. Giao dien da chay thu tren Tk 9 (Linux) khong loi, chua thu tren Windows that (Tk 8.6).
  2.5.32 Chon CACH DOC GIONG tren giao dien (muc Giong doc): Tu dong / SAMI / Cu (gui theo lo 20 cau). SAMI mo nhieu ket noi: o 'Cau gui cung luc toi da (SAMI)' mac dinh 300, 8-1000 (khoi dau 128, tang x1,4 moi 24 cau, giam x0,6 toi da 1 lan/6 giay). SmartCut + tao project TTS: ghi project vao danh sach CapCut (root_meta_info.json, co sao luu .bak_autostudio_ngay) + dien draft_meta_info.json + draft_id moi, de CapCut dang mo co the hien ma khong phai thoat vao lai (CHUA kiem chung ban CapCut nao nap lai danh sach khi dang chay; chua thay thi ve trang chu CapCut, roi mo lai). Project SmartCut ha phien ban du lieu 110.0.0 de CapCut 4.8 mo duoc.
  2.5.31 Tao giong qua SAMI nhanh hon: so cau cung luc khoi dau 32, tu tang toi 64 (tu giam khi may chu bao ban / ket noi treo). Vong cho ket qua viet lai bang hang doi (truoc: quet lai ca nghin future moi lan 1 cau xong, ngon CPU + GIL). Thanh tien do hien 'x cau/giay'; nhat ky ghi moi 15 giay 1 dong 'SAMI tien do' (cau/giay, so luong, noi / cho tieng dau / tong). Che do cu (common_task theo lo): tao tep tts_mode.txt noi dung 'common' trong AutoStudioData de ep dung.
  2.5.30 Them nut 'Xoa cache giong + log' (muc Tao giong cho tep SRT, canh 'Mo thu muc'): xoa cac cau giong da doc trong cache + log.txt de lan Tao giong sau gui lai TOAN BO cau (do toc do that / doc lai tu dau). Chi xoa tep cache va log; project khong bi dung toi.
  2.5.29 Dinh chinh 2.5.28: 'cham dan ve cuoi' la doc nham - phan dau nhanh vi la cau DA CO TRONG CACHE; that su gui 1280/6828 cau, 402s (~3,2 cau/giay), 0 loi. Nhat ky nay ghi moi luot tao giong 1 dong do tung buoc (noi / cho tieng dau / tong / cho cong / KB) + so ket noi moi va dung lai. So luong SAMI khoi dau 20, tu chinh 2-32.
  2.5.28 Tao giong hang nghin cau khong cham dan ve cuoi: truoc moi cau 1 ket noi SAMI moi (6000 cau = 6000 lan bat tay TLS -> cuoi dot may chu/mang bo lo, 'handshake timed out' 15s moi lan). Gio xong cau nao giu ket noi cho cau sau (may chu khong cho thi tu phat hien sau 3 lan va ve cach cu; tat bang sami_reuse.txt = 0). Treo bat tay chi cho 5s roi noi lai (toi da 3 lan); loi lien tiep thi nghi 1,5-20s. So luong SAMI tu chinh 2-16 (bat dau 8). Thoi gian 'con ~' tinh theo toc do 20s gan nhat.
  2.5.27 Doc giong NHANH hon: duong SAMI 8 -> 24 ket noi cung luc, dung chung 1 ngu canh SSL (khong nap lai chung chi moi cau), TCP_NODELAY, nho proxy 60 giay (gia lap tre 0,8 giay x 96 cau: 9,7s -> 4,8s). 1 cau SAMI truc trac thi thu lai tren SAMI, CHI chuyen sang common_task khi SAMI hong 3 lan lien tiep va common_task chua tung bi chan (truoc: nhay sang duong bi chan -> shark block, cho 60s+, dung ca lo). Giong SAMI khong nhan ma common_task cung tung tu choi (2 giong Microsoft Hoai My/Nam Minh) hoac common_task dang bi chan: bao khong dung duoc ngay, khong gui them. Kiem tra ket noi qua SAMI: 6 giong song song.
  2.5.26 Project CapCut MOI do tool tao nay mo duoc tren CapCut 4.8 tro len: ghi new_version=110.0.0 (thu vien pycapcut mac dinh ghi 140.0.0 -> CapCut 4.8 bao 'project ban moi hon' va khong mo). Chen vao project co san thi giu nguyen phien ban cua project do.
  2.5.25 THEM DUONG DOC GIONG MOI qua websocket SAMI (duong CapCut 4.x dung): xin token an danh -> noi wss://sami-sg1.byteintlapi.com -> gui StartTask -> nhan WAV 24 kHz. KHONG can ma may, khong di qua co che chan 'shark' (ret=-6) cua duong common_task ma CapCut 9.x dung. Mac dinh (auto) dung SAMI truoc, hong thi tu lui ve common_task (khi may co ma may CapCut). Ep mot duong: tao tep tts_mode.txt trong AutoStudioData ghi sami / common / auto. Doi may chu: sami_ws.txt, sami_api.txt cung thu muc. Nhat ky ghi cac dong 'SAMI: ...'. Toi da 8 ket noi cung luc; cau dai tren 300 ky tu tu cat theo dau cau roi noi lai. Trang thai 'bi chan' cu cua ban truoc bi bo qua khi doi ban.
  2.5.24 Nho thoi gian bi CapCut chan ke ca khi tat/mo lai tool (AutoStudioData\block_state.json, theo ma may). Truoc day mo lai tool / bam Kiem tra ket noi la gui tiep du dang bi chan -> keo dai thoi gian chan. Thoi gian nghi tang dan: 1p, 2p, 5p, 15p, 30p, 1h, 2h, toi da 4h; trong luc nghi KHONG gui gi len CapCut. Het nghi chi thu 1 yeu cau; thanh cong thi xoa trang thai. Muon bo trang thai: xoa tep block_state.json.
  2.5.23 Chan doan ma may: moi lan mo tool ghi tep AutoStudioData\chan_doan_ma_may.txt (CapCut ghi du lieu o dau, ban nao, tep nao co truong ma). KHONG chua ma may - moi day so dai deu bi che. Khong doc duoc ma tren ban CapCut khac: gui tep nay.
  2.5.22 Sua loi 2.5.21: CapCut tra ret=1014 'system busy' vi chu ky request van tinh theo pf=3 (Mac) trong khi tieu de gui pf=4 (Windows). Gio chu ky dung dung pf cua thiet bi.
  2.5.21 Tim duoc ma may CapCut 9.x: CapCut khong con ghi device_id vao VeDetector ma ghi 'tdid' trong ParfaitServer (noi dung tep) va dat ten tep .pftconfig theo ma do. Tool doc ca hai; dung dung thong so CapCut PC Windows (pf=4, kenh, vung, phien ban, he dieu hanh, kieu may). Da kiem thu tren du lieu CapCut that cua may.
  2.5.20 Sua: cau bao 'chua co ma may' qua dai lam lap khung log -> gio chi 1 dong ngan + 1 dong 'da quet nhung dau', khung log cao hon, khong lap lien tuc.
  2.5.19 CHI dung ma thiet bi cua MAY: khong con tu roi ve ma mac dinh dung chung (ma do bi CapCut chan ret=-6). Thu tu lay ma may: nhat ky CapCut > quet du lieu CapCut > ma da nho (AutoStudioData\capcut_identity.json) > device.json > ma da dung lan truoc (khoa trong voice_status.json khac ma chung). Khong co ma may -> tool dung ngay, bao ro, khong gui gi len CapCut. Van muon dung ma chung: tao tep trong dung_ma_chung.txt trong AutoStudioData (hoac dat bien AUTOSTUDIO_ALLOW_SHARED=1).
  2.5.18 Ma thiet bi cua MAY: ngoai nhat ky VeDetector kieu cu, quet RONG thu muc du lieu CapCut (Local + Roaming) tim device_id / iid / did o moi dang tep va NHO lai (AutoStudioData\capcut_identity.json). Khong tim duoc thi nhat ky ghi ro da quet gi (da che so). Doc toi da 40 tep nhat ky (truoc 12).
  2.5.17 'Kiem tra ket noi' khong bao 'Ket noi on' sai nua: chi on khi CapCut that su tra loi trong lan thu nay (truoc day dem ca ket qua nho tu lan truoc). May chu editor-api-vn.capcutapi.com KHONG ton tai (da thu thuc te: khong phan giai duoc ten) -> bao thang + dan xoa capcut_host.txt. Nhat ky ghi ly do khong lay duoc ma thiet bi CapCut PC.
  2.5.16 Build nhanh: them build_nhanh.bat (PyInstaller, vai phut thay vi 15-40 phut cua build.bat/Nuitka). Chi de thu / dung rieng; ban phat hanh cho khach van dung build.bat. Chua thu tren Windows that: tu kiem tra o cuoi cho biet thieu gi.
  2.5.15 Long tieng CapCut: thu may chu CapCut khac (vd ban VN) bang tep capcut_host.txt (1 dong, vd editor-api-vn.capcutapi.com) trong ~/AutoStudioData hoac canh chuong trinh; chi nhan *.capcutapi.com qua https; xoa tep = ve may chu mac dinh sg. Chua kiem chung duoc may chu nao ngoai sg.
  2.5.14 Long tieng CapCut: khi CapCut chan (ret=-6 'shark block only') tool DUNG gui ngay (khong thu lai / chia doi cau / doi them), nghi 1 phut (lan sau gap doi, toi da 15 phut) roi chi thu 1 yeu cau mot luc; thong bao loi noi ro nguyen nhan + nguon ma thiet bi dang dung. Giam so luong gui dong thoi ban dau (12 luong, toi da 48).
  2.5.13 Trinh doc van ban (VieNeu, ke ca giong clone): cau TIENG ANH co so thi TU DOI so sang chu tieng Anh truoc khi doc (2024 -> twenty twenty-four, 50% -> fifty percent, $5 -> five dollars, 1st -> first, 3:30 -> three thirty...; ninhdon/ennum.py). Cau tieng Viet / Trung va nguon Microsoft / Azure giu nguyen. Day la buoc phong ngua (chua chay duoc VieNeu that de biet model co tu doc dung so tieng Anh hay khong).
  2.5.12 Trinh doc van ban: them giong clone thi TU chuyen sang nguon Ninh Don VieNeu (khong hoi) va tu chon model Turbo neu dang Nano; chia cau tieng Anh khong cat nham sau Dr. Mr. Mrs. Ms. Prof. Mt. vs. e.g. i.e. (ninhdon/textsplit.py). Chua nghe thu giong clone doc tieng Anh voi VieNeu that.
  2.5.11 Quet hardsub + Lay sub Jianying/CapCut: LAM SACH GIO truoc khi ghi .srt (module subvoice/cuefix.py) - het dong DE CHONG gio: gop dong trung, cat bot dong truoc o cho dong sau bat dau, chia deu khi bat dau cung luc, dong ma tim them o luot quet lai chi duoc nam cho chua co dong nao. Khong mat dong co chu. Cach quet (du moi doan co tieng) giu nguyen.
  2.5.11 Trinh doc van ban: THEM GIONG CLONE + DAT TEN THEO Y (ninhdon/clonevoice.py): nut o moi nguon, doi sang WAV mono 24 kHz toi da 12 giay, luu lai, Doi ten / Xoa giong; dong co VieNeu nap lai mau khi file mau doi. Chua bam thu giao dien Tk that va chua thu voi OCR / may chu Jianying that.
  2.5.10 Tab Dich (web): DICH DUNG DONG - van giu HAI kieu gui nhu cu: (1) «So + loi thoai» (khong gui moc gio), (2) «Khoi SRT day du» (so + moc gio + loi thoai). Tool TU doi chieu va TU gui bu dong sai, khong co o nao de bat tat. Kieu 1: moi dong AI tra ve phai chep lai vai chu dau cua dung dong goc (4 chu voi tieng Trung / Nhat / Han, 12 ky tu voi chu Latin - ngan de tra loi khong cham): «[622] 他说我们 ||| ban dich»; tool so khop voi cau goc: khop -> ghi; AI ghi sai so nhung chep dung cau cua dong khac -> tu xep ve DUNG dong; chep khong khop dong nao -> KHONG ghi, tu gui bu. Kieu 2 khop theo SO + MOC GIO: so va moc gio phai trung nhau (so noi dong A ma gio la cua dong B -> bo khoi do, khong doan, tu gui bu); AI danh so lai tu 1 hoac bo so ma moc gio dung -> xep theo moc gio; AI day moc gio mot doan khong trung dong nao -> khop theo so. File ket qua luon dung moc gio GOC cua dong da xac nhan, khong bao gio ghi moc gio do AI tra. Kiem tra them do hop ly (qua ngan / qua dai so voi cau goc = AI gop / cat y, mat so 2024... -> khong ghi nhu ban dat, gui bu rieng kem ngu canh; cap dong ke nhau bi dao ro rang thi tu doi lai; het cach thi giu tam + to vang). Kieu gui «Khoi SRT day du»: so thu tu noi dong A ma moc gio khop dong B -> bo khoi do. «Dan ban dich tu clipboard» cung dung bo doi chieu. Luu y: AI chep lai vai chu dau nen cau tra loi dai hon chut (uoc tinh ~20-25%, chua do tren Gemini that; bi cat thi giam «So cau moi lan dich»); doi chieu tren may rat nhanh (~20 ms / lo 250 dong); hai dong ke nhau bi dao noi dung nhung dai gan bang nhau thi khong the phat hien bang do dai - nen liec lai cac dong to vang.
  2.5.10 Ma thiet bi CapCut: UU TIEN ma that cua CapCut dang cai tren CHINH may nay (doc nhat ky CapCut Windows) truoc, roi moi toi device.json, cuoi cung la ma mac dinh dung chung cua thu vien (truoc day device.json duoc uu tien hon). Ap dung ca cho "Lay sub Jianying / CapCut" (nhan dang giong CapCut quoc te): truoc day phan nay khong doc ma CapCut tren may ma dung ma mac dinh dung chung / device.json.
  2.5.9  Long tieng: SUA LOI giong doc bi day SOM so voi song am va phu de (cho khong co song am van nghe tieng doc) o file giong DAI. Nguyen nhan: nut "Chi gop audio" va file ghep khi bo tick "Moi cau 1 doan rieng" ghi mp3 VBR; file co nhieu doan im lang nen kich thuoc khong ty le voi thoi gian, CapCut tua toi vi tri bang uoc luong nen roi sai cho hang giay (song am van dung vi duoc giai ma tuan tu tu dau). Do thu: tua theo kich thuoc file lech -28..+25 giay, theo bang TOC cua mp3 van lech 2-7 giay. Nay: "Chi gop audio" ghi WAV (thoi gian = so mau / tan so, chinh xac tuyet doi; ~2,9 MB / phut; kiem tra cho trong o dia truoc khi ghi); file ghep chen CapCut 1 manh la WAV; "Chi xuat audio" va trang "Doc van ban" giu dinh dang da chon nhung mp3 nay la CBR 128k khong co bang TOC (muon chinh xac tuyet doi khi dua vao CapCut cung phu de thi chon wav). Du an da gop bang ban cu: bam "Hoan tac gop" roi gop lai.
  2.5.8  Trinh doc van ban: DA NGON NGU. Nguon Microsoft online / Azure co o "Ngon ngu" (~75 ngon ngu, ~240 giong): Viet, Anh, Trung (Pho thong / Dai Loan / Quang Dong Hong Kong), Nhat, Han, Thai, Indonesia, Hindi, A Rap, Nga, Phap, Duc, Tay Ban Nha, Bo Dao Nha, Y... Chia cau dung cho chu Han / Nhat / Han (khong co dau cach giua cac cau: tach ngay sau dau cau toan chieu, cat cau dai o dau phay, khong de doan 1-2 chu). Nut "Lam moi danh sach giong" (tai danh sach giong dang chay that tu Microsoft). Azure tai giong cua MOI ngon ngu. Nhac khi van ban khong hop giong (vd dan tieng Trung ma chon giong tieng Viet) + goi y doi giong. Nghe thu o van ban trong = doc cau mau dung ngon ngu. Thanh Am luong 20-200% (ca 3 nguon, ca Nghe thu; tren 100% co nen mem chong vo tieng). Giao dien tab bo tron lai (the, o nhap, o chon, khung van ban, nut dang vien thuoc). build.bat: sua loi "[WinError 5] Access is denied ... cv2.pyd" (tim va dong tien trinh python dang giu thu muc OpenCV roi cai lai).
  2.5.7  Tab Dich (dich bang trang web): moi tab GIU NGUYEN cuoc tro chuyen va gui lo tiep theo ngay trong cung cuoc - khong con tai lai trang sau moi lo. Chi khi mot tab da dich khoang 2000 dong moi tai lai tab (mo cuoc tro chuyen moi). O moi «Tai lai tab sau (dong)» (mac dinh 2000; 0 = tai lai sau moi lo nhu ban cu). Tab loi / treo thi lo ke tiep tu mo trang moi. Nut «Xoa Log» o tab Dich nay xoa CA ban dich da nho cua tep dang mo (khong chi log): bam «Bat dau dich» se dich lai tu dau (truoc day van bao «da co san» va xong ngay). Co dong da sua tay thi hoi xac nhan; dang dich thi chi xoa log.
  2.5.6  Sua loi TREO khi dong tu taskbar: bam «Dong cua so» o bieu tuong Auto Studio duoi taskbar luc cua so dang thu nho truoc day lam hop «Thoat han / Thu nho / O lai» bi dat ngoai man hinh (Windows bao cua so thu nho o toa do -32000) -> khong thay hop, cua so khong dong duoc cung khong mo lai duoc. Nay cua so tu hien lai, hop luon hien giua man hinh va nam tren cung; bam dong nhieu lan chi keo hop dang mo len truoc; hop loi thi co hop thoai he thong du phong. Hop hoi cap nhat va hop ung ho sua tuong tu.
  2.5.5  Long tieng CapCut TU KET NOI: mo app la tu kiem tra cac giong CapCut o nen (khong can bam «Quet API»); chi hien giong CapCut thuc su nhan, giong bi TTSInvalidSpeaker bi an. KHONG tu doi sang giong khac: giong bi tu choi thi bao ro ngay, chua co giong dung duoc thi chan chay va noi ro. «Nghe thu giong» dung dung giong da chon. Ma thiet bi duoc doc tu CapCut cai tren CHINH may chay tool (nhat ky CapCut ban Windows) thay cho ma mac dinh dung chung; device.json rieng van duoc uu tien.
  2.5.4  Hop thoai hoi cap nhat co O CHON «Xoa ban cu sau khi chuyen sang ban moi» ngay luc dong y tai (hop thoai bao ban moi luc mo app, nut Tai va cai ban moi, va luc ban moi tai xong). Bat = xoa ban dang dung khi ban moi mo len, tat = giu de quay lai; du lieu / mo hinh dung chung nen khong mat. Lua chon duoc nho. Cap nhat bang Setup.exe thi khong co o nay.
  2.5.3  Tu cap nhat qua Cloudflare R2: dia chi update.json ghi san trong appinfo.UPDATE_URL. Ban cap nhat PHAI co CHU KY Ed25519 cua tac gia (cung khoa voi key ban quyen): update.json khong co chu ky / ky sai / bi sua thi app tu choi. Ky + dua ban moi len bang ky_update.bat (bo KeyTool). Kiem tra ban moi khong dung ban update.json cu trong bo nho dem.
  2.5.2  Trinh doc van ban · Ninh Don VieNeu: danh sach giong co san (Adam bua, Truc Ly, Thien Minh, Mai Anh, Hai Dang...) hien DAY DU ngay khi mo ung dung, khong can tai model truoc. Danh sach duoc luu lai sau lan tai model
         (vieneu_presets.json trong thu muc du lieu); may chua co danh sach ma da cai moi truong thi tu tai model 1 lan luc mo ung dung de lay du giong.
         Sua loi "Voice '... Adam bua ...' not found. Available: [...]" khi doc bang giong co san: nay gui dung ID giong chu khong gui nhan hien thi.
  2.5.1  Tab "Ninh Don TTS" doi ten thanh "Trinh doc van ban", co 3 nguon giong: Ninh Don · VieNeu (offline, nhu cu) / Microsoft online (edge-tts, mien phi, can mang) / Azure TTS V1 (can key).
         Microsoft online: luon dung dung giong da chon; chap chon thi thu lai + cho 15/30/60/90 giay roi lam tiep; loi 403 thi tu tai edge-tts moi nhat. The cam xuc chi VieNeu dung.
         Bo giong mau Adam va Tung Dang (giu Ninh Don; giong ban tu them khong bi dung toi).
         Gop clip sau can chinh: nut "Chi gop audio" / "Gop video + audio" (muc 4): GIONG TTS -> 1 clip WAV (mix dung vi tri / toc do / cao do / am luong tung cau, nhanh, khong ton RAM; WAV chu khong phai mp3 vi mp3 VBR dai co nhieu doan im lang bi CapCut tua lech, tieng chay som hon song am / phu de), VIDEO chinh -> 1 clip mp4 (render lai tung manh bang x264, noi, them tieng; khung hinh va tieng khop DUNG khung; cho trong lap bang hinh den). Hoi truoc khi lam, canh bao hieu ung giong se mat / chua can chinh; sao luu + nut "Hoan tac gop"; huy giua chung khong dong vao project. Xoa TTS van don duoc track giong da gop.
         Che sub cu: Blur la CLIP HIEU UNG that tren TRACK HIEU UNG cua CapCut (mac dinh; hop thoai "Hieu ung mo..." muc 0 cho chon lai kieu clip video + mat na); keo dai / ngan, doi do mo ngay trong CapCut.
         Sua loi dong "RAM dang dung" o thanh ben luon hien 0 MB tren Windows 64 bit (goi ham do RAM cua Windows khong khai bao kieu).
  2.5.0  Tab Tai video: nut "Nhap tep .txt" (tep co san ten + link theo thu tu: "1 : link", "t1: link", "Tap 1: link", "Ten | link", "link | Ten", hoac dong ten roi dong link ngay duoi); ten video dat dung nhu trong tep; moi dong co STT ma tep lon xon thi tu xep theo STT tang dan.
         Lay sub / Quet hardsub - xuat video doi toc do: o chon "Khung/giay video xuat ra" (Giu nguyen fps goc [mac dinh, nen lai], Nhanh [khong nen lai, fps giam theo toc do], 24/25/30/50/60 fps); do phan giai luon giu nguyen nhu goc.
         Nut "Chay thu toc do nay": cat ~15 giay giua video, doi dung toc do / cao do / fps dang chon, mo bang trinh phat de nghe thu truoc khi lay sub + xuat that.
         Tab Long tieng CapCut: o Toc do va Vol (dB) co NUT mui ten len / xuong bam duoc (van go so hoac phim mui ten).
         Tu Can Chinh Audio: bam la chay luon, khong hoi gi; chi doc song am quanh cac cau can cat, chay song song bang moi nhan CPU (video 7-8 gio nhanh hon rat nhieu), van do diem cat o cho yen.
         Chen chu + che sub: lop BLUR (hieu ung lam mo cua CapCut) nam duoi chu, bo han thanh nen den; sau Tu Can Chinh lop blur chi keo dai (xem dong cuoi muc 2.5.0); SRT duoc viet lai sach truoc khi chen (khong mat ca track chu vi 1 dong la).
         Soi SRT khi them tep: bao so dong cua dong trong chen giua, 2 cau dinh nhau, cau khong co chu / chi co dau (...), gio hong, gio chong nhau.
         Tab Dich phu de: tick 'Chay nen' giu cua so trinh duyet thu nho xuong taskbar suot qua trinh dich (moi luot tai trang van thu nho lai).
         Che sub cu: thanh blur la MOT THANH LIEN, Tu Can Chinh chi keo dai thanh. Nut "Hieu ung mo..." (chon hieu ung, do mo, Tai, Tim hieu ung Mo ban dung thu cong). Nut "Luu cau hinh" o chan trang (hien da luu + gio).
         Cao do: tick "Doi cao do" ghi thang co is_tone_modify vao project; nut "Kiem tra" doc lai project dem clip bat / tat.
         Tu Can Chinh: phu de bat dau DUNG luc giong doc bat dau (khong con cau chay truoc giong / hinh); chu keo den het giong, khong de len dong sau.
  2.2.5  Tao giong theo SRT: moi cau dat DUNG moc bat dau trong SRT, KHONG day lui; cau doc dai hon khung thi chong len cau sau va tu xep sang track phu trong CapCut (TTS_CapCut, TTS_CapCut_L2, _L3...). Tu Can Chinh va Xoa TTS doc duoc ca track phu.
         Cao do: bo thanh truot ban cung, chi con tick "Doi cao do" nhu CapCut. Bo o "Cach toi thieu giua 2 cau".
  2.2.4  Nut moi "Don audio TTS (sau khi xuat video xong)" o tab Long tieng CapCut: xoa thu muc mp3 nguon cua project dang chon + thu muc "(Auto Studio) (2), (3)" rong; co hoi xac nhan, khong dong vao project; lan tao giong bi huy/loi tu xoa thu muc do.
         SmartCut: sua loi "Khong chay duoc phan nghe giong ... silero_vad_v6.onnx" (ban cai thieu file du lieu faster-whisper): build.bat dong goi kem file do; thieu thi tu nghe khong loc im lang thay vi bao loi.
         Lay sub Jianying/CapCut: sua loi gui file len bi het gio (gui tung khoi nho), tu chia doi doan dai va gui lai khi mang yeu, tu giam luong gui khi mang chap chon; video dai tren 1 gio mac dinh bo luot 2 (nhanh gap doi; tick "Video dai tren 1 gio van quet luot 2" de bat lai); luong gui song song 3 -> 4.
         Quet hardsub (OCR) nhanh hon: chinh cau hinh RapidOCR, tu tang luong/lat video theo CPU, giai ma video nhanh hon, hien thong ke OCR tren thanh tien do.
         Chi mo duoc MOT cua so Auto Studio (bam mo lan nua thi dua cua so dang chay len truoc).
  2.2.3  Tu Can Chinh Audio MAC DINH KHOP DUNG: cau nao giong TTS lan sang cau sau thi cat tu dau cau den dau cau ke va lam cham video bang dung do dai giong; cau khong lan giu nguyen; giong khong lech hinh.
         Tu Can Chinh chi chinh toc do VIDEO; audio TTS (toc do / am luong / cao do) va am luong video giu nguyen dung cau hinh luc tao giong.
         Che sub cu: kieu mac dinh la BLUR (lam mo), dung dau danh sach; thanh nen den xep sau.
         Tab Lay sub + Quet hardsub: o "Toc do video" giong bang CapCut - o so co mui ten, khoang 0.1-100 (truoc 0.05-4), them tick "Doi cao do" (tat = giu cao do tieng nhu truoc). Mac dinh van 1.00.
         Mac dinh moi: "Cho giong tre toi da" = 0 (truoc 0.8), "Video cham nhat" = 0.1 (san CapCut; truoc 0.5). Cai dat cu 0.8 / 0.5 tu chuyen sang muc moi; nang o tre len neu muon it cho cat hon (giong co the lech toi chung do giay).
  2.2.2  Muc "Giong doc" giong bang cua CapCut: hang "Audio giong doc" (Toc do + Vol dB + Doi cao do) va hang "Video goc" (Vol dB). Toc do / am luong / cao do duoc DAT THANG len tung clip audio TTS trong
         CapCut (hien dung "1.20x", dB, tick "Thay doi cao do am thanh"); file giong giu toc do goc. Sua loi: truoc day toc do lam ngam trong file nen CapCut van hien 1.0x, va 120% chi la +1.6 dB nen nghe khong doi.
         Can "Moi cau 1 doan rieng" + che do chen / tao project moi; xuat file audio thi van ap vao file. Thanh % am luong cu doi thanh o dB (cai dat cu tu quy doi). Video goc chi doi am luong, khong doi toc do.
  2.2.1  Tu Can Chinh Audio cat IT hon nhieu: chi lam cham video o cho giong TTS doc LAN sang cau sau (cau vua khung giu nguyen video), cac cho lan gan nhau duoc gom thanh it doan lam cham deu
         thay vi cat tung cau. O moi "Cho giong tre toi da (giay)" (mac dinh 0.8; 0 = cat sat tung cau). Tu Can Chinh KHONG con tu doi am luong video goc (giu muc da dat luc chen TTS). Audio TTS van khong bi sua.
  2.2.0  MOI tab "Giao dien": doi mau nhan / mau nen / do bo goc nut / co chu, xem truoc ngay, bam Ap dung thi luu + khoi dong lai (luu o ~/AutoStudioData/theme.json). Bam X hien hop thoai
         "Thoat han / Thu nho / O lai" (thoat han tat sach tien trinh con, khong treo / chay an). Lay sub Jianying/CapCut: gui cac doan am thanh SONG SONG (3 luong), giai ma am thanh 1 lan.
         Quet hardsub nhanh hon: quet nhieu doan video cung luc (may >= 6 nhan), bo qua khung toi, OCR 1 khung khi da doc chac (tuy chon "Doc ky" = bo phieu 3 khung nhu cu), tuy chon giai ma bang card do hoa.
         Trang Ung ho chi hien Ten tai khoan + Ngan hang BIDV.
  2.1.8  Tab Lay sub Jianying/CapCut: QUET LAI NHIEU LUOT cho khoi thieu cau - luot 2 quet lai toan bo bang doan ngan ~4 phut (loc am khac, cat lech moc), roi doi chieu tieng thoai va NGHE LAI toi 3 luot
         (khuech dai manh -> am goc khong loc -> phat cham 0.8x), doan nghe lai co ngu canh >= 16 s, khong gioi han 24 doan; bao cao ghi tung luot. ICON MOI.
  2.1.7  TACH RIENG 2 tab: "Lay sub Jianying / CapCut" (nghe giong noi, Jianying mac dinh) va "Quet hardsub (OCR)" (chu in tren hinh, chay tren may). Moi tab co cau hinh rieng;
         ca hai deu giu o TOC DO video giam/tang, SRT luu canh video DUNG TEN video goc. Tab moi nam trong nhom can ban quyen (7 cong cu). Khong dung toi tab TTS.
  2.1.6  Tab Lay sub: MOI "Nghe giong noi" bang may chu Jianying (mac dinh) / CapCut (gui AM THANH len ByteDance, hoi dong y 1 lan; video dai tu chia doan; lam sach am thanh, nghe lai cho sot);
         MOI o TOC DO video giam/tang (0.05-4x, go so tuy y): moc gio SRT khop video da doi toc do, SRT van luu canh video DUNG TEN video goc, tuy chon xuat luon video doi toc do;
         OCR nhanh hon tren video dai/nen nhieu (mat na on dinh 3 khung, thu nho anh 4K, quet lai ky song song, hien thoi gian con lai); khong dung toi tab TTS.
  2.1.5  Hieu ung giong: bo loc "Ngot ngao" cua CapCut (doi chieu bang project that, khop hieu ung 小甜甜 trong pycapcut) hien dung ten o o "Bo loc giong".
  2.1.4  Hieu ung giong (ap len audio DA DOC XONG): ten hien thi bang TIENG VIET (go khong dau van tim duoc); tach 2 o giong 2 tab CapCut: "Bo loc giong" va "Giong doc". pycapcut chi cho 1 hieu ung MOI LOAI / doan audio nen chon ca 2 o cung loai thi chi gan duoc o "Giong doc" (co canh bao).
  2.1.3  Long tieng CapCut: "Tao giong" CHI doc ra dung cau hinh o muc Giong doc, KHONG con tu tang toc audio (truoc day cau dai hon khung bi tang toc toi 1.35x -> giong meo; da bo o "Tang toc toi da").
         Cau nao doc LAN sang cau sau thi bam "Tu Can Chinh": chi cho do duoc cat + lam cham VIDEO (cac cho lan gan nhau gom thanh it doan), audio TTS giu y nguyen (chi doi vi tri), cac cau khong de nhau. Bo buoc tang toc cung giup tao giong nhanh hon.
         MOI: thanh "Am luong giong doc" + "Am luong video goc" (0-200%, 100% = giu nguyen) o muc 3; "Tu Can Chinh" KHONG doi am luong nao (giu muc da dat luc chen).
  2.1.1  Tab "Long tieng CapCut": them o "Bo loc giong" + "Nhan vat giong" (hieu ung giong cua CapCut). Danh sach QUET tu thu vien pycapcut dang cai (go chu de loc, sao = can CapCut Pro);
         hieu ung gan vao tung doan giong khi chen vao project / tao project moi, CapCut tu ap khi mo project (can mang lan dau). Chon "Khong" de giu giong goc. Ban pycapcut
         chua co danh sach thi muc nay tu an. "Nghe thu" va xuat file audio chua co hieu ung.
  2.1.0  BAN QUYEN bang key: tab "Ban quyen". Dung thu 3 ngay, het thi 6 cong cu can key (key gan 1 may, han thang / 3 thang / nam hoac vinh vien, kiem tra OFFLINE bang chu ky so
         Ed25519). Tac gia cap key bang cong cu rieng AutoStudio_KeyTool (tao_key.bat) - KHONG dua cong cu nay vao ban phat hanh. Xem muc "BAN QUYEN / KEY" ben duoi.
  2.0.3  Thanh ben them muc "Ung ho tac gia": hien ma QR VietQR + thong tin tai khoan (TRIEU VAN TINH - 3950588072 - BIDV PGD Cho Don), co nut sao chep STK / luu anh QR. Tu nguyen.
  2.0.2  Tab MOI "Tai video": gan YT Downloader vao Auto Studio (yt-dlp: YouTube / Douyin / TikTok / Bilibili, nhieu link + playlist + Hang loat danh so tap,
         tai song song, tam dung / tiep tuc, tu thu lai, tang toc aria2c, cookie). Deno + aria2c them vao tab "Tai du lieu can thiet". build.bat tu len yt-dlp moi nhat.
  2.0.1  TTS CapCut nhanh hon nhieu: gui TAT CA cau mot luot, hoi ket qua sau 0,1-0,5 giay (cu 0,8 giay co dinh), so luong tu tang/giam theo muc CapCut chiu duoc,
         tu thu gui NHIEU CAU MOI LAN (chi dung khi kiem chung duoc audio tra ve dung thu tu; khong thi gui tung cau song song). Bo o "Goi song song" va "Moi lan gui
         toi da (ky tu)" (tool tu chinh). Giai ma / tang toc / ghi tung cau chay hang loat va song song theo so nhan CPU. Tab Dich: bo "Dich thu 5 dong dau",
         them "Dich lai cau con sot" (tu quet + tich chon cac cau con chu Trung / thieu ban dich roi gui dich lai rieng, tu luu lai).
  2.0.0  Tab Long tieng tach 2 trang (Long tieng theo SRT / Doc van ban). Them DANH SACH KIEU CHU phu de (mau, vien, nen bo goc, bong), chon VI TRI phu de
         bang cach keo tren khung hinh, CHE SUB CU (thanh nen / blur thu nghiem), muc "Xu ly" (Chu + giong / Chi giong / Chi chu). "Tao giong" khong con dung
         toi video; "Tu Can Chinh" la muc rieng, chi chay khi bam nut. Cuon chuot tren o chon giong / danh sach chi cuon trong o do.
         Cung ban 2.0.0 GOP thanh 1 chuong trinh: them tab "Dich phu de SRT" va tab "Lay sub tu video" (OCR chu cung + doi chieu tieng thoai, tach phu de mem).
         Them tab "Ninh Don TTS" (doc van ban dai bang giong nhan ban VieNeu, dong co chay tien trinh rieng) va tab "SmartCut" (cat video thong minh, cat
         deu / cat theo loi review) - gop tu 2 tool rieng; khung tab dung chung (tabs.py) de them cong cu moi chi can 1 dong.
         Dung chung 1 lan tai ffmpeg, du lieu o AutoStudioData\subvoice. Gemini them model 4 Argon / 3.1 Pro / 3.8 Flash / 3.5 Flash-Lite; chon model
         trong tool thi trinh duyet phai chon DUNG model do. Gom cac thay doi 1.3.0 ben duoi.
         Them tab "Tai du lieu can thiet" (tai mo hinh AI, ffmpeg, GPU, moi truong giong), tab "Cap nhat phan mem" (tu cap nhat qua https), va TRINH CAI DAT Setup.exe
         (Inno Setup): cai nhu app binh thuong, thanh tien trinh chep chuong trinh roi tai luon du lieu, xong la dung duoc ngay. Bo build_fast.bat.
  1.3.0  Cao do giong (-6..+6 ban cung). Cong tac "Cao do doi theo toc do" (giong CapCut khi bat "Thay doi cao do am thanh"). Chon PHONG CHU CapCut
         + co chu cho phu de. Tu Can Chinh: o "video cham nhat (x)". Cai dat tu luu (15 giay / khi bam chay / khi dong). Sua nut "Mo .txt".
         Dung chung ffmpeg da tai boi SubVoice.
  1.2.0  Doi ten Auto Studio. Giao dien moi (nut bo goc, chu luon ro khi re chuot, cong tac bat/tat, dai tien do rieng duoi tung muc).
         Nut "Tu Can Chinh Audio" (duy nhat). Nut "Xoa text & audio TTS khoi project". Chan tao giong khi SRT con chu Trung.
         Chay nhieu viec cung luc. ffmpeg chi tai 1 lan, dung chung. Ban phat hanh bien dich ra ma may (Nuitka), co --selftest.
  1.1.0  Chen giong TTS vao project CapCut (track rieng, co sao luu), tao project moi, hoac chi xuat audio.

CHAY / DONG GOI
  - Chay thu ngay: bam run_dev.bat (can Python 3.11 hoac 3.12 - KHONG dung 3.13 vi rapidocr-onnxruntime chua ho tro; tu cai thu vien trong requirements.txt;
    ffmpeg chua co thi tai 1 lan, xem ben duoi).
  - Ban PHAT HANH (CHI KHI BAN BAO "build"): chay build.bat -> dist\AutoStudio\AutoStudio.exe + dist\AutoStudio_v<ban>.zip (cap nhat) + dist\AutoStudio_Setup_<ban>.exe (cai lan dau, neu may co Inno Setup 6) + dist\update.json.
    Ten + phien ban lay tu appinfo.py. Day la ban BIEN DICH RA MA MAY (xem muc "BAO VE MA NGUON"), lan dau mat 15-40 phut. build.bat chan Python 3.13 tro len.
    Cuoi build tu chay  AutoStudio.exe --selftest  (kiem tra thu vien, OpenCV / onnxruntime / playwright + driver, OCR doc duoc chu thu, giong CapCut,
    pycapcut + MediaInfo.dll, dung thu 1 project, chen thu phu de co kieu chu, nap SmartCut + Ninh Don TTS, dung giao dien 5 tab);
    bao loi thi build.bat dung va KHONG tao Setup / zip phat hanh.
    Truoc khi bien dich build.bat con chay cung bai tu kiem tra do TU MA NGUON (python app.py --selftest, vai chuc giay): loi logic dung ngay,
    khong doi 30 phut roi moi biet. Muon bo qua:  set SKIP_PRESELFTEST=1  roi chay build.bat.
    LOI "FATAL: Failed unexpectedly in Scons C backend compilation" (Nuitka/gcc sap sau nhieu phut, moi module lon dich mat ~7 phut): thuong la HET RAM do bien dich song song bang
    so nhan CPU (moi gcc -O3 cua module lon an ~3 GB). build.bat gio TU CHON so tien trinh theo RAM con trong (buildjobs.py, in ra dong [RAM] ...), bo module playwright.async_api
    (khong dung, file sinh ra rat lon), neu loi thi TU THU LAI 1 lan voi --jobs=2 (giu cac tep da dich), con loi nua thi in chan doan (RAM, o cung con trong, cac dong
    quan trong cua nuitka-crash-report.xml) - chup phan do gui lai. Tu chon so tien trinh: set JOBS=2 roi chay build.bat. Nen dong trinh duyet / app nang khi build va con trong >= 10 GB o cung.
  - dong_goi_lai.bat: da build xong (con thu muc dist\AutoStudio) nhung buoc cuoi dung / hong (vd tu kiem tra bao loi o chinh cau kiem tra, hoac chua cai Inno Setup)?
    Chay file nay de nen lai zip cap nhat + tao Setup.exe + update.json TU BAN CO SAN, khong bien dich lai. No in ket qua tu kiem tra cu va hoi xac nhan truoc khi dong goi.
  - Khong con "build nhanh": muon chay thu ngay khong can build thi dung run_dev.bat. Moi lan build.bat bien dich lai tu dau (da tat ccache de tranh loi WinError 32).
  - build.bat goi  python preflight.py --fix-opencv  TRUOC khi bien dich (vai giay): kiem tra Python 3.10-3.12, du file, du thu vien,
    tkinter, pymediainfo + MediaInfo.dll, playwright driver, mo hinh OCR, va CHUAN HOA OpenCV (go het cac ban opencv, cai lai DUNG 1 ban opencv-python-headless 4.x).
    Lam vay vi rapidocr-onnxruntime hay keo theo opencv-python 5.x de len ban headless -> thieu opencv_videoio_ffmpeg500_64.dll -> Nuitka loi.
    Thieu gi thi in dong [LOI] ro rang ngay va dung, khong doi 30 phut moi biet. Chay rieng:  python preflight.py   (them --fix-opencv de tu sua OpenCV).
  - Loi da gap va da sua trong build:
      * Nuitka 'data file pymediainfo\MediaInfo.dll conflicts with dll': khong tu chen MediaInfo.dll nua (Nuitka tu mang theo), chi chep bu neu thieu.
      * Nuitka FileNotFoundError cv2\opencv_videoio_ffmpeg500_64.dll: ghim OpenCV 4 headless (xem tren).
      * Nuitka 'PermissionError: [WinError 32] ... nuitka_build\app.build\ccache-NNNN.txt' (crash luc don dep, SAU khi dich C xong): Windows / diet virus giu file log
        cua ccache. build.bat nay tu tat ccache cua Nuitka (--disable-cache=ccache), dong tien trinh gcc/ccache sot lai va xoa nuitka_build co thu lai. Neu van gap:
        dong cua so Explorer dang mo thu muc nay, them thu muc nay + %LOCALAPPDATA%\Nuitka vao ngoai le Windows Defender, hoac dat ma nguon o duong dan ngan (vd E:\AutoStudio).
    Neu Nuitka van loi: gui noi dung cua so loi cho minh; trong luc cho van chay thu duoc bang run_dev.bat.
  - Du lieu/log/cai dat nam o  C:\Users\<ban>\AutoStudioData  (log.txt, settings.json, cache am thanh, tools\ffmpeg.exe).
    Du lieu tab Dich / Lay sub nam o  AutoStudioData\subvoice  (config.json, prompts.json, sites.json, translate_cache\, ho so trinh duyet, log).
    Lan dau mo tab Dich, neu may co thu muc cu  C:\Users\<ban>\SubVoiceData  (ban SubVoice chay rieng) thi config.json, prompts.json, sites.json va
    translate_cache duoc CHEP sang (khong chep ffmpeg, khong chep ho so trinh duyet -> phai bam "Dang nhap" lai 1 lan o tab Dich).
    Lan dau chay ban nay, cai dat + thiet bi + log tu thu muc cu  CapCutTTSData  duoc chep sang (khong chep cache).

CHAY NHIEU VIEC CUNG LUC
  - Cac viec chia thanh "lan" chay song song: [Doc van ban] [Long tieng SRT] [Can chinh / Xoa project] [Nghe thu / Kiem tra ket noi] [Tai ffmpeg].
    Moi lan 1 viec (nut cua lan do bi khoa trong luc chay), cac lan khac van bam duoc. Vi du: dang long tieng 1 SRT dai ma van doc them mot doan van ban,
    nghe thu giong, hoac can chinh 1 project khac.
  - Moi viec co thanh tien do + nut "Dung" RIENG (duoi muc, va vien nho o chan trang). Dung viec nay KHONG lam dung viec khac.
    "Dung tat ca" o chan trang dung het. Dong cua so khi con viec chay thi hoi xac nhan.
  - Moi viec co ket noi CapCut rieng, nen 2 viec tao giong cung luc se goi CapCut gap doi. So luong gui cung luc do tool tu chinh (tu giam khi CapCut gioi han).
  - Khong ghi cung luc len cung 1 project: neu project dang duoc viec khac dung (chen / can chinh / xoa) thi tool bao "Project dang ban" va khong lam.
    Khoa nay co hieu luc ca khi mo 2 cua so Auto Studio. Khoa bo quen (tool bi tat giua chung) tu go sau 30 phut.

QUY TAC LUU FILE CUA TAB DICH / LAY SUB
--------------------------------------
  - Lay sub tu video : file .srt luu NGAY CANH video, TEN TRUNG TEN VIDEO.
        vi du  D:\phim\tap01.mp4  ->  D:\phim\tap01.srt
  - Dich phu de      : ban dich luu NGAY CANH file .srt goc (cung thu muc), KHONG BAO GIO de len file goc.
        vi du  D:\phim\tap01.srt  ->  D:\phim\tap01 gemini dich xong.srt   (hoac "... dich do.srt" neu con dong chua dich)
        Neu thu muc do khong ghi duoc (o dia chi doc, thu muc he thong...) thi tu chuyen sang  %USERPROFILE%\AutoStudioData\subvoice\output.
  - Quet lai cung 1 video: file .srt duoc GHI DE thanh MOT ban duy nhat (khong de lai ban .bak hay ban cu).
  - Cung voi .srt la 1 file bao cao  <ten video>.kiem tra sub.txt  (chi co khi quet chu cung).


TAB LAY SUB JIANYING / CAPCUT VA TAB QUET HARDSUB  (2 tab rieng o thanh ben trai; giao dien giong nhau, khac cach lay sub)
-----------------------------------------------------------------------------------------------------------------------
3.0  Hai tab + o Toc do video (tach rieng tu 2.1.7)
  - Tab "Lay sub Jianying / CapCut" = "Nghe giong noi" (MAC DINH, chuan nhat, nhanh): tach am thanh, gui len may chu nhan dang giong noi cua Jianying (hoac CapCut, tu chuyen neu 1 ben loi),
    nhan lai tung cau kem moc thoi gian. Video dai tu chia doan ~15 phut (cat o cho im lang). Am thanh duoc LAM SACH truoc khi gui (loc u tram, giam on, keo giong nho len).
    "Quet them luot 2" (mac dinh bat): quet lai TOAN BO video bang cac doan ngan ~4 phut voi loc am thanh khac, chi bo sung cau luot 1 bo sot (lau gan gap doi, bo tick neu can nhanh).
    "Doi chieu tieng thoai": cho nao co tieng ma chua co chu thi NGHE LAI toi 3 luot (khuech dai manh -> am goc khong loc -> phat cham 0.8x), moi doan gui co them ngu canh >= 16 s;
    het cho nghi sot thi dung som; van khong ra thi ghi vao bao cao <ten video>.kiem tra sub.txt (kem ket qua tung luot).
    TOC DO (2.2.0): cac doan am thanh duoc gui SONG SONG (mac dinh 3 luong, moi luong 1 ket noi rieng; neu may chu gioi han thi tu giam), am thanh chi giai ma 1 lan roi dung chung.
    Chua do duoc toc do thuc voi may chu that tu moi truong phat trien - thu tren video dai cua ban roi cho minh biet.
    LUU Y: AM THANH CUA VIDEO DUOC GUI LEN MAY CHU BYTEDANCE (app hoi dong y 1 lan) - dung dung cho video bi mat. Day la cach KHONG chinh thuc, co the bi doi / chan bat cu luc nao;
    khi do bao loi ro rang va dung tab "Quet hardsub (OCR)". Jianying tu nhan ngon ngu; CapCut dung o "Ngon ngu" (zh-CN, en-US, vi-VN, ja-JP, ko-KR). Chua kiem chung duoc voi may chu that tu moi truong phat trien.
  - Tab "Quet hardsub (OCR)" = quet chu in san tren hinh: nhu cac ban truoc (xem 3.1-3.4), chay ngay tren may, khong gui gi di dau. Chi tab nay co khung chon VUNG CHU va muc "Do ky".
    NHANH HON (2.2.0): may >= 6 nhan quet 2-3 doan video cung luc (may it nhan van 1 luong); khung toi bo qua ngay; moi dong chu OCR 1 khung neu da doc chac, chi khi chu mo / kho
    moi OCR 3 khung bo phieu. Hai tuy chon: "Doc ky" (luon bo phieu 3 khung - cham hon ~2-3 lan, chac hon) va "Giai ma bang card do hoa" (thu -hwaccel, khong duoc thi tu ve CPU).
    Do nhanh thuc te phu thuoc may: sau khi quet, dong "Thong ke quet" trong log ghi so khung, so lan OCR va so doan quet song song.
  - O "Toc do video": GIAM (vd 0.8, 0.5, 0.1) khi video goc noi qua nhanh de doc TTS cho vua, hoac TANG (1.25, 2...). Go so bat ky 0.1-100 (hoac bam mui ten; tick "Doi cao do" neu muon tieng doi cao do theo toc do). Moc gio SRT duoc nhan 1/toc do
    de khop video da doi toc do. SRT luon luu CANH video, DUNG TEN video goc. Tick "Xuat luon video da doi toc do" -> <ten video>_0.8x.mp4 canh video goc
    (giam toc: khong nen lai hinh, video 2 gio xong trong vai phut; tang toc: nen lai bang x264 nen cham hon).
3.1  Cach dung
  1) Bam "+ Them video..." (chon duoc nhieu video cung luc).
  2) Chon 1 video trong danh sach -> ben phai hien khung hinh. Keo chuot de khoanh VUNG CHU (noi sub chay).
     Bam "Tu do vung sub" de app tu tim, roi keo chinh lai neu can. Thanh "Xem tai" doi thoi diem khung hinh.
     Mac dinh la 32% duoi cung khung hinh.
  3) Bam "Lay phu de". Xong thi hien thong bao:
        "Da lay du sub, da luu" + duong dan file .srt
     hoac neu con cho nghi sot: "Da luu N dong ... con M doan co tieng ma chua thay sub - xem bao cao".
  Muc "Do ky (khung/giay)": chon san Ky 10 (khuyen dung) / Rat ky 15 (cham hon, bat ca chu hien rat ngan) / Nhanh 5, HOAC GO SO BAT KY tu 3 den 30.
    Vd 20 = ky hon, cham gap doi muc 10; 6 = nhanh hon, de sot chu hien rat ngan. Video chi co 25 khung/giay thi tool tu quet toi da 25 (quet nhieu hon chi doc lai cung hinh).
  VIDEO DAI (nhieu gio): khong gioi han do dai. Hinh doc tung khung qua ffmpeg nen RAM giu on dinh, khong tang theo so dong sub
    (da thu video gia 30 phut / 720 dong sub: ~70 MB; truoc ban sua nay moi dong sub giu ~5 MB, phim 2 gio co the ngon vai chuc GB). Thoi gian ti le voi
    do dai video + so dong chu phai OCR (video that chua do duoc) - nen de may chay, DUNG tat giua chung: dung giua chung thi mat ket qua luot quet do.

3.2  Neu video co phu de mem (soft sub) trong file (mkv, mp4 co luong text)
  App bao ngay duoi danh sach: "File nay co san ... luong phu de dang chu". Bam
  "Tach phu de co san trong file" -> ra .srt tuc thi, chinh xac 100%, khong can OCR.
  Phu de dang ANH (PGS/VobSub) khong tach thanh chu duoc -> dung quet chu cung.

3.3  Co che de KHONG SOT chu (cho video co sub cung va co thoai)
  1. Lay mau day (10 khung/giay) trong vung chu, chi OCR khi chu THAY DOI nen khong bo qua lan doi chu nao.
  2. Moi doan chu duoc OCR 1 khung neu da doc chac (do tin cay >= 0,94); chu mo / kho thi OCR nhieu khung roi BO PHIEU (tick "Doc ky" de luon bo phieu) -> chu dung hon.
  3. Phan tich AM THANH: tim nhung cho CO TIENG NOI ma khong co sub -> tu dong QUET LAI KY hon
     (25 khung/giay, nguong thap hon, mo rong vung) cho dung nhung doan do.
  4. Cho nao quet lai van khong thay sub thi ghi vao BAO CAO (kem chu nhin thay NGOAI vung sub neu co,
     goi y chon lai vung), de ban tua toi nghe/xem bang mat.
  5. Chi hien "Da lay du sub" khi: co chu, da doi chieu duoc voi tieng thoai, va khong con doan nao co tieng ma thieu sub.
  Cac tuy chon:
   - "Doi chieu voi tieng thoai, quet lai ky..." : bat san (khuyen dung).
   - "Chi giu dong co chu Han" : bo dong pinyin / tieng Anh neu video co 2 thu tieng.
   - "Chu sub KHONG co vien den" : mac dinh app tim chu sang co vien toi, neu khong thay gi se tu thu lai che do khac;
     tick o nay neu sub cua ban khong co vien.
   - Nut "Kiem tra OCR tren may nay": ve thu chu Han/Latin roi doc lai -> biet ngay thu vien nhan dang co chay duoc khong.
  File bao cao  <ten video>.kiem tra sub.txt  gom: (1) cac doan co tieng ma khong thay sub, (2) chu thay ngoai vung sub,
  (3) cac dong do tin cay thap hoac tim them o luot quet lai. Mo bang nut "Mo bao cao kiem tra".

3.4  Gioi han (noi that)
  - OCR khong the bao dam tuyet doi 100%: chu qua nho, mo, trung mau nen, hieu ung chuyen dong... van co the sai/sot.
    Vi vay luon xem bao cao, tua toi cac moc duoc liet ke, va mo video cung file .srt de kiem nhanh.
  - Doi chieu am thanh dung nang luong tieng (VAD): KHONG phan biet duoc tieng noi voi nhac nen/tieng dong -> co the bao thua doan "co tieng
    ma khong co sub" (an toan hon la bao thua con hon bao thieu).
  - Chua co nhan dang giong noi (Whisper) cho video khong co sub cung/mem.
  - Chat luong doc chu Trung cua RapidOCR tren video that phu thuoc phong chu va do net; ban nen thu 1 video ngan truoc.


TAB DICH PHU DE SRT  (thanh ben trai)
-------------------------------------
4.1  Dich bang TRANG WEB (khong ton API)
  - App dieu khien Chrome/Edge CO SAN cua ban qua cong debug (khong can cai them trinh duyet).
  - Lan dau: bam "Dang nhap" -> dang nhap 1 lan trong cua so hien ra -> bam "Test Browser" de kiem tra.
  - Trang ho tro san: Gemini, ChatGPT, Claude, DeepSeek, Copilot; "Trang khac" cho phep tu nhap dia chi + o nhap/o tra loi (nut "Sua danh sach trang").
  - "So cau moi lan dich", "So tab moi lan dich", "So lan dich lai khi loi", "Delay (s)": app gui dung so cau da chon moi lan va nhan tra ve dung so luong do.
  - Co the chay nen, dung tab khach (khong dang nhap) hoac dung session da dang nhap, tu dong dong trinh duyet khi dich xong.
  - "Tai lai tab sau (dong)" (mac dinh 2000): moi tab GIU cuoc tro chuyen, gui lo ke tiep ngay trong cung cuoc; gui khoang chung nay dong thi tai lai tab (cuoc moi, chon lai model). Tab loi / treo thi lo ke tiep cung mo trang moi. Dat 0 = moi lo mot cuoc tro chuyen moi (kieu cu).
  - Doi chieu DUNG DONG (tu dong, khong co o bat tat): "Kieu gui" co 2 cach - (1) So + loi thoai (khong gui moc gio; moi dong AI tra "[622] chu dau cua goc ||| ban dich", tool so khop voi cau goc de xep ban dich ve DUNG dong ke ca khi AI ghi sai so) ; (2) Khoi SRT day du (so + moc gio + loi thoai: khop theo so VA moc gio, mau thuan thi bo khoi do). Dong khong khop / nghi AI gop - cat y thi khong ghi ma TU gui bu rieng kem ngu canh (theo "So lan dich lai khi loi"). Moc gio trong file ket qua luon la moc gio GOC cua dong da xac nhan.

4.2  MODEL Gemini moi (moi cap nhat)
  Danh sach model cua Gemini web: 4 Argon, 3.1 Pro, 3.8 Flash, 3.5 Flash-Lite (cung Pro / Flash / Flash-Lite / Nhanh / Tu duy kieu cu).
  Ban co the go tay ten model; ten go vao se dung lam tu khoa tim trong menu model.

4.3  Chon DUNG model (nghiem ngat)
  Model ban chon trong tool thi trinh duyet PHAI chon dung model do truoc khi dich:
   - Mo menu model cua trang, tim dung muc co ten khop, bam chon, roi DOC LAI trang thai da chon de xac nhan (kiem tra dau tick /
     aria-checked / aria-selected / chu hien tren nut model).
   - Thu toi da 3 lan. Neu van khong chon duoc thi DUNG han va bao loi, KHONG dich bang model sai.
   - Chon "Mac dinh (giu nguyen)" thi khong ep chon, trang dung model nao thi dung model do.
  Chua ho tro: menu con "Cap do tu duy" (neu trang co) - hay gui anh chup man hinh de bo sung.

4.4  Dich bang API
  Gemini API, OpenAI, Anthropic (Claude), OpenRouter, DeepSeek, Groq, Ollama / LM Studio (chay tren may ban), "Khac (tuong thich OpenAI)".
  Nhap NHIEU key cach nhau dau phay -> xoay vong. De trong o key = dung bien moi truong (vd GEMINI_API_KEY) neu co.
  Nut "Lay danh sach" de nap model, "Thu ket noi" de kiem tra. Tuy chon luu key vao may (config.json, khong ma hoa).

4.5  Bang xem tam
  Nhap dup o "Ban dich" de sua truc tiep (F2/Enter; Tab sang dong sau; Esc huy). "Dich lai cau con sot" (tu quet + tich chon cac cau con chu Trung / thieu ban dich, chi gui dich lai nhung cau do), "Dich lai dong chon",
  "Dong can xem" nhay toi dong loi/nghi ngo. Dong trong trong SRT duoc giu nguyen.
  "Xoa Log" xoa log VA ban dich da nho cua tep dang mo (de dich lai tu dau); co dong da sua tay thi hoi truoc.
  Che do copy thu cong: "Copy doan da chon" / "Dan ban dich tu clipboard" neu muon tu dan vao trang web.


TAI NGUYEN CHI TAI MOT LAN
  - Chi ffmpeg la thu phai tai. Thu tu tim: canh chuong trinh -> C:\Users\<ban>\AutoStudioData\tools\ffmpeg.exe -> C:\Users\<ban>\SubVoiceData\tools\ffmpeg.exe (neu ban SubVoice rieng da tai) -> PATH cua may. Tab Lay sub dung CHUNG bo tai nay (khong tai them). CO SAN THI KHONG GOI MANG.
  - Chua co: lan dau can toi, tool hoi 1 lan roi tai vao AutoStudioData\tools (dung chung cho MOI phien ban Auto Studio, giai nen o dau cung duoc).
    Viec ban vua bam se tu chay khi tai xong. Tu choi tai thi viec do bi huy, khong chay.
  - Tai do (mat mang / bam Dung / tat may): phan da tai duoc GIU, lan sau tai TIEP tu cho do (khong tai lai tu dau). Chi giu 1 tep .part cho moi nguon.
  - Tai xong chi giai nen dung ffmpeg.exe va kiem tra chay duoc roi moi dat vao cho; khong giu tep zip. ffmpeg hong thi xoa va tai lai dung 1 ban.
    Tu tai khong duoc (mang chan) thi chep ffmpeg.exe vao AutoStudioData\tools (hoac canh exe).
  - Dung luong: khi mo chuong trinh tool tu don nen: xoa .part qua 14 ngay; cache am thanh giu toi da ~500 MB (xoa tep it dung nhat truoc,
    khong dong vao tep vua dung); anh bia project toi da ~60 MB.
  - Lenh tay:  python tools.py   (kiem tra / tai ffmpeg va in duong dan).

BAO VE MA NGUON (MA HOA)
  - build.bat dich TOAN BO ma (app, giao dien, thuat toan can chinh, thu vien capcut_tts_api, pycapcut) ra ma may bang Nuitka. Thu muc phat hanh
    KHONG chua file .py, khong chua bytecode (.pyc) - khac PyInstaller, noi ma Python giai nen ra doc lai duoc. Bo chu thich/docstring/assert.
  - Nguoi MOI: gui tep  dist\AutoStudio_Setup_<ban>.exe  (hoac dist\AutoStudio_v<ban>.zip neu khong co Setup).  Nguoi DA DUNG: dat zip + update.json len mang, ho tu cap nhat. DUNG gui thu muc nguon (cac file .py) hay file zip nguon.
  - Gioi han - nen biet that:
      * Khong co cach nao CHONG TRUOM TUYET DOI. Ma may van co the bi dich nguoc (kho va ton cong hon nhieu so voi doc .py, nhung khong bat kha thi).
      * Bao ve nay chong DOC / LAY ma nguon. No khong chong viec ai do COPY file exe roi chay (muon vay can co khoa ban quyen / kich hoat theo may - chua lam;
        noi minh neu can).
      * File giong Voice.json (danh sach giong, khong bi mat) va device.json.example nam canh exe dang van ban thuong.
      * Exe bien dich bang Nuitka doi khi bi phan mem diet virus bao nham (mem chua ky so). Neu gap: them ngoai le, hoac ky so (code signing) khi phat hanh rong rai.
      * Giay phep MIT cua capcut_tts_api yeu cau giu thong bao ban quyen: NOTICE.txt nam trong thu muc phat hanh, DUNG xoa.
      * Chua chay thu build.bat tren Windows that (may soan code khong cai duoc Nuitka). Neu build loi, gui noi dung cua so cho minh - cac loi hay gap la
        thieu trinh bien dich C (Nuitka tu tai MinGW neu hoi, dong y) hoac Python 3.13 (nen dung 3.12).

LAN DAU DUNG - lam theo thu tu
  1) Bam "Kiem tra ket noi". Neu hien chu xanh "Ket noi CapCut on" la dung duoc.
     Neu bao loi: bam "Xem log", gui cho minh noi dung log.txt (co ghi phan hoi tho cua CapCut) - minh chinh tiep.
  2) Chon ngon ngu + giong (mac dinh Tieng Viet, 24 giong trong Voice.json), bam "Nghe thu".

TOC DO / CAO DO GIONG  (ap dung cho ca Muc 1 va Muc 2)
  - "Toc do" (rate): toc do doc cua giong CapCut. Cao do: CHI con o tick "Doi cao do" (giong bang chinh cua CapCut), khong con thanh truot ban cung.
  - Vi tri cau: moi cau giong duoc dat DUNG moc bat dau trong SRT, KHONG day lui. Cau doc dai hon khung thi CHONG len cau sau: trong CapCut nam o track phu (TTS_CapCut, TTS_CapCut_L2, _L3...).
    Muon video khop loi doc: bam "Tu Can Chinh Audio" (doc duoc ca cac track phu).
  - Cong tac "Cao do doi theo toc do" (mac dinh BAT) - de giong tool KHOP voi CapCut khi ban chinh toc do clip va bat "Thay doi cao do am thanh":
      BAT : toc do x1.2 -> giong nhanh hon 1.2 lan VA cao hon 1.2 lan (khoang +3.2 ban cung). Cach lam: lay mau lai (asetrate) nhu CapCut.
            (Ben trong tool gui CapCut toc do 1.0 roi tu lay mau lai, nen am goc dung chung cache cho moi muc toc do.)
      TAT : chi nhanh hon, giu nguyen cao do goc.
    LUU Y: "Tang toc toi da" o buoc khop gio (atempo) van GIU cao do - no chi dung de ep cau doc vua khung SRT, khong lien quan cong tac nay.
    Gioi han that: toan hoc da kiem tra (1.2x -> do dai /1.2, cao do x1.2) nhung CHUA nghe doi chieu voi file render tu CapCut that.
    Neu nghe thay lech so voi CapCut, gui file CapCut render + cai dat toc do/giong de minh chinh.

PHU DE TRONG PROJECT (khi bat "Them ca phu de SRT")
  - "Phong phu de": danh sach phong CapCut (doc tu thu vien pycapcut). Go vao o de loc, bam mui ten chon. Phong CapCut tu tai khi mo project (lan dau can mang).
    Nhieu phong trang tri KHONG co dau tieng Viet - xem lai trong CapCut; de "Mac dinh" neu thay loi chu. "Co chu" mac dinh 5.
  - "Tu Can Chinh: video cham nhat (x)": mac dinh 0.1 (san cua CapCut; moi cau chi cham vua du khop giong). Cau nao can cham hon muc nay thi video van cham toi muc nay, phan thieu duoc
    bu bang cach day lui audio cac cau sau (co canh bao).
  - "Tu Can Chinh: cho giong tre toi da (giay)": mac dinh 0 = KHOP DUNG: moi cau bi lan duoc cat tu dau cau den dau cau ke va lam cham video bang dung do dai giong, giong khong lech hinh.
    Dat so lon hon (vd 0.3 / 0.8) neu muon IT cho cat hon: cac cho lan gan nhau duoc gom thanh it doan, doi lai giong co the lech hinh toi chung do giay.
    Bam "Tu Can Chinh" -> hop xac nhan hien so doan / so giay them / giong tre toi da; bam Huy thi project khong bi doi, chinh so roi bam lai.

LUU CAI DAT
  - Cai dat (giong, toc do, cao do, phong, thu muc...) tu luu vao AutoStudioData\settings.json: moi 15 giay (neu co thay doi), khi bam chay 1 viec, khi dong chuong trinh.
    Ghi qua tep tam roi doi ten nen tat may giua chung khong lam hong tep. File hong thi tool dung cai dat mac dinh va ghi log.

MUC 1 - DOC VAN BAN
  - Xuong dong = sang doan moi; chen [nghi 1.5s] de ngat dung do dai (co 3 nut chen nhanh).
  - "Nghi sau moi cau" / "Nghi khi xuong dong": chinh 2 o (dat 0 de tat).
  - Ten file lay CAU DAU cua bai (co the them tien to); trung ten thi them (2), (3)... KHONG ghi de.
  - Van ban dai tu chia thanh doan toi da 250 ky tu roi ghep lai (tu dong). TAT CA doan duoc gui mot luot; tool tu tang/giam so luong gui cung luc va tu thu
    gui nhieu cau/lan (chi dung khi kiem chung duoc dung thu tu) - khong con o chon "Goi song song" / "Moi lan gui".

MUC 2 - TEP SRT: QUY TRINH 3 BUOC
  BUOC 1  "Tao giong cho tep SRT"  (chon SRT + chon project + Cach lam = "Chen vao project da chon")
  BUOC 2  Mo project trong CapCut kiem tra neu muon, roi DONG CAPCUT, bam  "Tu Can Chinh Audio"
  BUOC 3  Muon doc lai (doi giong, sua SRT...): bam "Xoa text & audio TTS khoi project" roi quay lai BUOC 1.

  Chi tiet BUOC 1:
  1) Bam "Chon SRT". Tool chiu duoc nhieu kieu thoi gian, bo the <i>, {\an8}, dong chi co dau cham.
  2) Project CapCut: danh sach hien ANH BIA (draft_cover.jpg), ten, gio sua, do dai. Bam vao anh de chon; o "Tim" loc theo ten.
     Mac dinh doc thu muc  %LOCALAPPDATA%\CapCut\User Data\Projects\com.lveditor.draft ; neu CapCut cua ban o cho khac bam "Doi thu muc project".
     Project co bieu tuong khoa = noi dung bi ma hoa / khong doc duoc -> khong chen duoc vao project do.
  3) "Cach lam":
       - Chen vao project da chon: THEM 1 track audio moi (ten TTS_CapCut) khop moc SRT; khong dong vao video/track cu.
         Truoc khi ghi, tool luu ban sao  draft_content.json.bak_autostudio_<gio>  canh file goc (hong thi chep de lai).
         NEN DONG CAPCUT truoc (CapCut dang mo project co the ghi de len thay doi).
       - Tao project moi (chi audio TTS, co the kem phu de).
       - Chi xuat file audio.
  4) Khop thoi gian: moi cau dat ngay tai moc bat dau cua dong SRT. Cau doc dai hon khung thi:
       a) cho phep lan sang khoang trong truoc dong ke tiep;
       b) van dai thi TANG TOC (atempo, khong doi cao do) toi da "Tang toc toi da" (mac dinh 1.35x);
       c) van dai hon nua thi cau sau bi day lui (khong bao gio chong tieng nhau). Bao cao ghi so cau bi anh huong.
     "Moi cau 1 doan rieng": trong CapCut moi cau la 1 doan audio rieng (sua/xoa/keo tung cau duoc). BAT BUOC bat de dung "Tu Can Chinh Audio".
     "Them ca phu de SRT": them track chu (TTS_CapCut_phude) cho project.
  5) Ket qua nam trong thu muc  "<ten srt> (Auto Studio)"  canh file SRT (hoac thu muc ban chon): file ghep ca bai, thu muc clips\ (tung cau),
     bao_cao.txt, placements.json (moc goc cua tung cau - Tu Can Chinh dung file nay). KHONG xoa/di chuyen thu muc nay sau khi chen:
     project CapCut tro thang vao cac file do (xoa bang nut "Xoa text & audio TTS khoi project" cho an toan).
  6) Cau nao CapCut loi (da thu lai 3 lan, con tu chia doi doan chu) thi de trong va ghi trong bao_cao.txt; cac cau con lai van xong.

TU CAN CHINH AUDIO  (nut tim, chi 1 nut duy nhat)
  Dung khi: da chen giong TTS vao project ma co cau doc DAI HON khung thoai goc nen de len cau sau.
  Tool lam:
    1) Tim cac cau TTS doc dai hon khung thoai (dua tren moc goc trong placements.json).
    2) Doc SONG AM cua chinh video trong project (ffmpeg, dai tieng noi 300-3400 Hz, chuan hoa theo muc tieng noi trong tung cau) de tim
       diem cat o cho YEN (ngat giua cac tu / giua hai cau) gan moc SRT, trong khoang +-0.35 giay. Cat o phan giua cho yen,
       cach mep ~30ms de khong cat vao duoi am tiet.
       Nhac nen lien tuc hoac tieng dong (no, dap cua) khong tao ra diem cat gia: tieng dong ngan nam trong tieng noi khong anh huong,
       con neu nhac/on to den muc khong tach duoc tieng noi thi tool GIU DUNG MOC SRT lam diem cat va ghi canh bao vao khung log.
    3) CAT doan video tuong ung roi LAM CHAM cho vua do dai audio (cham nhat 0.5x). Cac phan phia sau tu doi cho: video, phu de,
       cac track chu/sticker/hieu ung/filter/dieu chinh, audio TTS. Cau nao chua du cham thi audio cac cau sau duoc day lui chut.
    4) Hien tom tat (bao nhieu cau, cham nhat bao nhieu, dai them bao nhieu giay) va HOI XAC NHAN truoc khi ghi.
  An toan:
    - Luon luu ban sao  draft_content.json.bak_autostudio_<gio>  truoc khi ghi. Khong dong vao file video goc.
    - Chi sua track video chinh + track chu/sticker/hieu ung + track TTS. Cac track audio KHAC (nhac nen, am thanh them tay) giu nguyen vi tri.
    - Project da can chinh roi thi bi chan lam lan 2 (tranh cat chong). Muon lam lai: "Xoa text & audio TTS khoi project" (chon tra video ve nhu cu).
  Gioi han (can biet):
    - Keyframe (zoom/pan) chi giu o manh dau cua doan video bi cat.
    - Chi cac track audio TTS do tool chen moi duoc dich chuyen; am thanh tach tu video (extracted audio) khong duoc xu ly rieng.
    - Cach tim diem cat da thu voi tieng noi/nhac/hieu ung TONG HOP (cac ca: tieng noi lech +-0.2s so voi SRT, video da cat san thanh nhieu doan,
      nhac nen) chu CHUA thu voi phim that. Phim co nhac rat to / tieng on lien tuc se roi vao truong hop "giu dung moc SRT".
      Luon xem lai project trong CapCut sau khi can chinh; co loi thi chep ban .bak_autostudio_ de lai.
    - Chi lam duoc voi project CapCut la JSON thuong (khong ma hoa).

XOA TEXT & AUDIO TTS KHOI PROJECT  (nut do)
  Dung khi can doc lai ma khong muon audio moi de len audio cu.
    - Xoa cac track giong (TTS_CapCut..., ke ca ban da can chinh) va track phu de (TTS_CapCut_phude) do tool chen, don luon vat lieu mo coi.
      Cac track khac cua ban khong bi dong vao.
    - Neu project DA tu can chinh: hoi co tra VIDEO ve nhu truoc luc can chinh khong (nen CO: doc lai se khop moc SRT goc).
      Luu y: moi chinh sua ban lam trong CapCut SAU luc can chinh se mat neu chon tra video; luon co ban sao luu truoc khi xoa.
    - Hoi co xoa luon thu muc file audio nguon (clips...) cua lan doc do khong (chi xoa thu muc co dau hieu cua tool: bao_cao.txt / placements.json).
    - Luon luu ban sao  draft_content.json.bak_autostudio_<gio>  truoc khi xoa.

KIEM TRA CHU TRUNG TRUOC KHI DOC (MUC SRT)
  - Khi them tep SRT (bam "Chon SRT" hoac bam "Tao giong cho tep SRT"), tool QUET toan bo tep. Con dong nao con chu Trung thi:
      a) mo cua so CONSOLE den (giong tool TTS cu) liet ke tung dong:  1: <noi dung>   2: <noi dung> ...  (so = so dong trong SRT),
         cuoi cung co dong tom tat cac doan, vi du:  "doan: 1->28, 40, 55->57"  (cac cho khong lien nhau tach rieng);
      b) hien hop thoai bao loi va KHONG tao giong cho toi khi ban dich het va them lai tep SRT (CapCut se bao loi neu gap chu Trung);
      c) dong thong tin duoi o "Tep SRT" chuyen mau do.
  - Cua so console: nut X bi vo hieu hoa (bam X se tat ca chuong trinh) - thu nho cua so de gon man hinh; no tu dong hien lai lan bao sau.
  - Chi kiem tra o muc SRT; muc "Doc van ban" ban tu dan van ban nen khong chan.

LUU Y QUAN TRONG
  - Day la API RIENG cua CapCut (khong cong bo). Thu vien capcut_tts_api (github.com/K07VN/capcut-tts-api) gia lap app CapCut desktop
    (ma thiet bi, chu ky request, khoa RSA nhung san). CapCut co the doi/chan bat cu luc nao, khi do tool bao loi - khong phai loi cua ban.
    Dung cho muc dich ca nhan, khong goi hang loat/ban lai. Co the vi pham dieu khoan dich vu cua CapCut: tu can nhac khi dung.
  - MA THIET BI (tu 2.5.5): neu may co CapCut ban Windows da tung mo, tool TU DOC ma thiet bi that cua CapCut do (file nhat ky
    %LOCALAPPDATA%\CapCut\User Data\Log\VeDetector_*.log: device_id, iid, did, ma ung dung, kenh, he dieu hanh...). Moi may dung ma cua CapCut tren CHINH may do;
    tool chi DOC nhat ky nay, khong ghi va khong gui di dau ngoai viec goi CapCut nhu app CapCut. Ten phien ban CapCut duoc suy ra tu version_code
    (vd 591360 = 9.6.0) vi nhat ky khong ghi ten phien ban. Luu y: neu CapCut chan vi goi qua nhieu thi CapCut that tren may do cung co the bi anh huong.
    Thu tu uu tien (tu 2.5.10): ma that cua CapCut tren may nay > device.json (AutoStudioData\device.json hoac canh exe; chi dung khi may chua co nhat ky CapCut) > ma mac dinh cua thu vien (dung chung, de bi gioi han).
    May chua cai / chua mo CapCut, hoac khong phai Windows: dung ma mac dinh nhu truoc; muon tu dat thi chep device.json.example thanh
    AutoStudioData\device.json roi sua device_id/iid/tdid.
  - GIONG CAPCUT: mo app la tool tu thu cac giong o nen va chi hien giong CapCut nhan; giong bi tu choi (TTSInvalidSpeaker) tu an, ghi lai 1 gio roi thu lai;
    giong dung duoc nho 3 ngay (rieng tung ma thiet bi) trong AutoStudioData\voice_status.json. KHONG BAO GIO tu doi sang giong khac thay ban.
  - Phan lay link am thanh tu phan hoi cua CapCut duoc viet kieu DO TU DONG (tim moi duong link/chuoi base64 am thanh trong JSON), da thu voi may chu gia
    chu CHUA thu voi CapCut that. Neu lan chay that dau tien bao "khong tim thay am thanh", gui log.txt cho minh.
  - Chen vao project chi chay khi file project cua CapCut la JSON thuong (nhu ban nhap SmartCut tao). Phien ban CapCut ma hoa project thi dung
    "Tao project moi" hoac "Chi xuat file audio" roi keo file vao CapCut.
  - Can ffmpeg.exe (tool tu hoi tai 1 lan, dung chung - xem muc 'TAI NGUYEN CHI TAI MOT LAN') de cat lang, tang toc, ghi mp3, doc song am video.
  - Giao dien Windows 10/11: thanh tieu de toi mau; chu/emoji dung font Segoe UI.

DA KIEM TRA / CHUA KIEM TRA (ban 2.0.0 - noi that)
  Da kiem tra tu dong: chuyen tab, chay cung luc, dong cua so khi dang chay, chep cau hinh cu, dung chung ffmpeg, cac nut Long tieng, chon model nghiem ngat
  (trang web gia), luu .srt canh video / canh SRT, ghi de 1 ban, doi chieu tieng thoai + quet lai (video tong hop), tach phu de mem.
  Tab SmartCut + Ninh Don TTS: da thu tu dong (dung giao dien, doi che do, loi cat deu + cat theo loi review tren video thu, giao thuc dong co giong voi VieNeu GIA,
  cai moi truong .venv bang goi gia). CHUA kiem tra: VieNeu-TTS that (tai model, chat luong giong), faster-whisper / fastembed / CUDA that, tao project CapCut
  bang pycapcut that tu SmartCut, giao dien tren Windows that.
  SmartCut toc do (GPU / song song): da thu tu dong bang faster-whisper + ctranslate2 GIA (GPU thieu CUDA -> bao + chuyen CPU, chon compute type, luu tung doan va chay lai,
  dung giua chung), giai ma 'GPU' loi -> tu chay lai bang CPU, chay song song + dung som khi loi, hop thoai tai CUDA trong app, cat deu song song, tu doi do dai canh.
  CHUA kiem tra: giai ma GPU that (d3d11va / dxva2 / cuda) va tai CUDA that tren Windows, faster-whisper that tren GPU / CPU, toc do thuc te (may soan khong do duoc).
  Tab Tai du lieu can thiet: da thu tu dong (may chu tai gia): tai nhieu muc trong tien trinh con + thanh tien do, Dung giua chung roi tai tiep, bao loi, khoi dong lai,
  hoi lan dau khi chua co ffmpeg, tai thu vien CUDA (kiem tra ma sha256, chep DLL), tai Python gon nhe + pip + cai goi (python gia). CHUA kiem tra: tai that tu
  python.org / PyPI / Hugging Face / gyan.dev (may soan khong ra Internet), Python gon nhe + pip + VieNeu-TTS that tren Windows, DLL CUDA that, khoi dong lai bang exe da build.
  Che do cai-het-du-lieu (AutoStudio.exe --hub-install-all, do Setup goi): da thu tu dong (22 kiem tra): chay het, thu lai, bao muc loi, huy, het o dia, nhip song, goi qua app.py.
  Tu cap nhat kieu thu muc rieng (zip): da thu tu dong voi may chu gia (tai, sha256, giai nen canh ban cu, het o dia / khong co quyen ghi / zip hong / zip-slip, mo ban moi, giu hoac xoa ban cu an toan, thu lai khi bi khoa), ca giao dien tab.
  Tu cap nhat qua Setup.exe (cach du phong khi update.json tro vao .exe): da thu voi Setup gia (chay /SILENT, Setup loi thi mo lai ban cu).
  CHUA kiem tra (can ban chay tren Windows that): build.bat moi (tat ccache, doan tao Setup); Inno Setup bien dich installer.iss, dac biet phan [Code] Pascal doc tep tien do
  de ve len thanh tien trinh cua Setup va nut Huy = bo qua (May soan khong co Inno Setup nen chua bien dich thu: neu ISCC bao loi o file nay, gui dong loi cho minh);
  Setup that chay tren Windows, cai im lang va tu mo lai; cac script .bat (cmd / ping / robocopy) tren Windows; SmartScreen / diet virus voi exe chua ky so.
  Cap nhat kieu thu muc rieng tren Windows that: tro lai loi tat bang PowerShell, start_new.bat, xoa thu muc ban cu dang bi khoa, duong dan dai, giai nen zip lon.
  CHUA kiem tra duoc tren may that: RapidOCR doc chu Trung tren video that; giao dien tren Windows that; build Nuitka;
  cau truc trang that cua Gemini / ChatGPT (hay doi giao dien); cao do giong khi dat canh file render cua CapCut that.
  Neu RapidOCR doc sai, bam "Kiem tra OCR tren may nay" o tab Lay sub va gui ket qua cho minh.
