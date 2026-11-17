# -*- coding: utf-8 -*-
"""Ten + phien ban chuong trinh o DUNG MOT CHO. Doi ten / len ban chi sua file nay (build.bat, README, tieu de cua so, thu muc du lieu... deu doc tu day)."""

import os, sys

NAME = "Auto Studio"
SLUG = "AutoStudio"                           # ten tep / thu muc / exe (khong dau cach)
TAGLINE = "Dịch · Lồng tiếng · Khớp hình"
SUBTITLE = "Giọng CapCut theo tệp SRT, chèn thẳng vào project, tự căn chỉnh video theo lời đọc"
VERSION = "2.5.47"
OLD_NAMES = ("CapCutTTS",)                    # ten cu: thu muc du lieu cu duoc chuyen sang ten moi lan dau chay
TRACK = "TTS_CapCut"                          # ten track audio trong CapCut (giu nguyen de project cu van nhan ra)
BAK_TAG = ".bak_autostudio_"                     # duoi ban sao luu draft_content.json
TMP_TAG = ".tmp_autostudio"
DATA_DIR = SLUG + "Data"                      # ~/AutoStudioData
CONTACT = ""                                  # cach lien he de mua / gia han key (vd "Zalo 09xx xxx xxx") - hien o tab Ban quyen; de trong = khong hien
PRICE_TEXT = ""                               # bang gia hien o tab Ban quyen (vd "Tháng 99.000đ · Năm 799.000đ · Vĩnh viễn 1.499.000đ"); de trong = khong hien
UPDATE_URL = "https://pub-d42e62095b934ba6901a857b1b96e6f4.r2.dev/autostudio/update.json"     # tep update.json tren Cloudflare R2 (tu cap nhat). De trong = tat; nguoi dung van tu dat duoc trong tab 'Cap nhat phan mem'.
UPDATE_REQUIRE_SIG = True                     # update.json PHAI co chu ky Ed25519 cua tac gia (ky bang ky_update.py trong KeyTool) - khong co / sai chu ky thi app tu choi cap nhat

# Dang chay tu ma nguon (python app.py), tu PyInstaller (sys.frozen) hay tu ban bien dich Nuitka (__compiled__)? -> APP_DIR = thu muc chua chuong trinh
COMPILED = "__compiled__" in globals()
FROZEN = bool(getattr(sys, "frozen", False)) or COMPILED
if getattr(sys, "frozen", False):
    APP_DIR = os.path.dirname(os.path.abspath(sys.executable))
elif COMPILED:
    APP_DIR = os.path.dirname(os.path.abspath(sys.argv[0] or sys.executable))
else:
    APP_DIR = os.path.dirname(os.path.abspath(__file__))

def self_cmd(args=()):
    """Lenh chay lai CHINH chuong trinh nay (khoi dong lai, tien trinh con tai du lieu): exe canh nhau khi da dong goi, python app.py khi chay tu ma nguon."""
    if FROZEN:
        exe = os.path.join(APP_DIR, SLUG + (".exe" if os.name == "nt" else ""))
        if not os.path.isfile(exe):
            exe = os.path.abspath(sys.argv[0] or sys.executable)
        return [exe] + list(args)
    return [sys.executable, os.path.join(APP_DIR, "app.py")] + list(args)


# Lich su phien ban (moi nhat truoc). Hien trong hop thoai 'Có gì mới' va ghi vao README.
CHANGELOG = [
    ("2.5.47", [
        "Sửa cấu hình ký yêu cầu GET: dùng [0,1,8] thay cho mặc định POST [0,1,14] của thư viện ở 2.5.46.",
        "Dùng verifyFp/fp từ cookie s_v_web_id có sẵn, thêm chẩn đoán cookie thực gửi; giữ nguyên giao diện. Chưa xác nhận hết HTTP 403 trên Douyin thật.",
    ]),
    ("2.5.46", [
        "Thẻ Quét bộ Douyin: thêm API trực tiếp (mặc định), dùng cookie ở thẻ Tải video, không mở trình duyệt hoặc tiện ích.",
        "Ký a_bogus bằng Python thuần, tách mô-đun để cập nhật. Chỉ đọc bài đăng đúng tài khoản / bộ, không lẫn video yêu thích hoặc gợi ý; giữ phần quét dở và báo chưa đủ.",
        "Dừng hàng đợi khi API yêu cầu xác minh hoặc hạn chế; không tự vượt CAPTCHA / đổi IP / đổi phiên. Tự lưu chẩn đoán API dạng JSON, không xuất cookie hoặc chữ ký.",
        "Giữ nguyên giao diện tab quét 2.5.45; chỉ thay phần xử lý Quét / Lấy link. KHÔNG khẳng định thuật toán ký hiện được Douyin chấp nhận: chưa thử tài khoản thật.",
    ]),
    ("2.5.45", [
        "THÊM ô «Thu nhỏ cửa sổ quét xuống thanh tác vụ» ở thẻ «🔎 Quét bộ Douyin»: bật lên thì cửa sổ Douyin do tiện ích mở ra ở dạng thu nhỏ. Cần tiện ích YT Cookie Exporter 2.5.3 trở lên. Chrome có thể làm chậm / dừng trang đang thu nhỏ — nếu quét đứng hình thì tắt ô này. Gặp captcha: cửa sổ tự hiện lại để bạn giải (không tự giải).",
        "Tiện ích 2.5.2+: cửa sổ quét mặc định không giành focus, nhỏ hơn, không che màn hình đang làm việc.",
    ]),
    ("2.5.44", [
        "SỬA: bấm «Quét» khi trình duyệt đã chọn (vd Cốc Cốc) ĐANG MỞ SẴN thì Auto Studio KHÔNG mở thêm cửa sổ trình duyệt nữa, chỉ chờ tiện ích trong chính trình duyệt đó nhận việc. Chỉ mở trình duyệt khi nó chưa chạy. Nút «🌐 Mở trình duyệt» cũng vậy.",
        "Tiến trình tải (Tải x/y • đang tải • chờ • lỗi + thanh %) nằm ngay BÊN CẠNH nút tải của từng bộ.",
        "Sửa lời nhắc: đăng nhập Douyin KHÔNG bắt buộc (trang công khai vẫn quét được); chỉ cần trình duyệt có tiện ích. Đăng nhập chỉ cần khi Douyin yêu cầu / hỏi captcha.",
    ]),
    ("2.5.43", [
        "THÊM ở thẻ «🔎 Quét bộ Douyin» (trong mục Tải video): mỗi bộ hiện ẢNH BÌA + TÊN GỐC ở trên; bên dưới là danh sách video GỌN (mỗi video 1 ô tick nhỏ, xếp lưới để thấy hết, không phải cuộn nhiều). TẬP GỘP có ô tick riêng (mặc định không tick) để đưa / không đưa vào tệp .txt và danh sách tải. Trailer (~20 giây) bị bỏ qua. Chỉ lấy ảnh bìa bộ, không lấy ảnh từng video.",
        "THÊM nút «⬇ Tải bộ này» và «⬇ Tải các bộ đã lấy» ngay tại thẻ Quét: tải luôn, DÙNG CHUNG cấu hình ở thẻ «Tải video» (thư mục lưu, chất lượng, cookie, tốc độ, tải cùng lúc…). Tiến trình (hoàn tất / đang tải / chờ / lỗi) + thanh % hiện ngay BÊN CẠNH nút tải của từng bộ; bấm lại để tạm dừng / tải tiếp. Có «📂 Mở thư mục» và «⚙ Đổi cấu hình tải». Vẫn có «➜ Sang thẻ Tải» nếu chỉ muốn đưa vào danh sách, chưa tải.",
        "THÊM ô «Trình duyệt quét» (Chrome / Edge / Cốc Cốc / Brave hoặc Tự động) + nút «🌐 Mở trình duyệt»: bấm «Quét» là Auto Studio TỰ MỞ trình duyệt đã chọn (nếu chưa chạy) rồi tiện ích quét; việc chỉ giao cho tiện ích trong ĐÚNG trình duyệt đã chọn (mỗi người đăng nhập Douyin ở một trình duyệt khác nhau). Cửa sổ quét tự đóng khi xong, trình duyệt của bạn vẫn mở.",
        "Có thanh tiến trình khi quét danh sách bộ / lấy link, và báo số video của từng bộ (theo Douyin trước khi lấy link, số thật sau khi lấy).",
        "CẦN tiện ích YT Cookie Exporter bản 2.5.1 trở lên (Reload ở chrome://extensions; bấm «Cấp quyền Douyin» một lần để tiện ích đọc được ảnh bìa).",
        "Đã kiểm bằng Chrome thật + trang Douyin giả + cầu nối thật, và chạy giao diện Tk thật (Linux, màn hình ảo) với dữ liệu mô phỏng. CHƯA thử với Douyin thật và CHƯA chạy trên Windows. Nếu gặp lỗi, gửi nội dung thông báo lỗi / ảnh chụp.",
    ]),
    ("2.5.42", [
        "THÊM thẻ «🔎 Quét bộ Douyin» ngay trong mục Tải video, nằm bên PHẢI thẻ «📥 Tải video». Dán link KÊNH (douyin.com/user/…) hoặc BỘ SƯU TẬP (douyin.com/collection/…) → bấm Quét → hiện danh sách các bộ từ trên xuống, mỗi bộ ghi TÊN GỐC (đúng tên Douyin) và số tập. Mỗi bộ có nút «⬇ Lấy link bộ này» và «➜ Sang thẻ Tải»; có thể tick nhiều bộ rồi «Lấy link các bộ đã chọn» (làm lần lượt từng bộ) và «Chuyển các bộ đã lấy sang thẻ Tải».",
        "Việc quét + lấy link tải trực tiếp do tiện ích YT Cookie Exporter (bản 2.5.0 trở lên, trong trình duyệt đã đăng nhập Douyin) làm. Việc TẢI vẫn do Auto Studio làm ở thẻ «Tải video» (tải song song, nối tiếp khi đứt), không tải bằng trình duyệt.",
        "Danh sách bộ chỉ ghi tên gốc; «Tập NN» chỉ ghi khi lấy link: «Tên gốc - Tập 01», «Tập 02»… (lấy số tập của chính Douyin trong bộ, đúng thứ tự dù trang xếp ngược). Dán thẳng link 1 bộ thì tự lấy link luôn.",
        "Mỗi bộ lấy link xong tự lưu 1 tệp .txt (link + tên + link tải trực tiếp) vào «Danh sách quét» trong thư mục lưu video (nút «💾 .txt» lưu lại); dùng lại bằng «Nhập tệp .txt». Link tải trực tiếp sống khoảng 3 giờ.",
        "Nút ⚙ ở thẻ Quét: lấy cả TẬP GỘP (全集 / 完整版 / «1-10集») và/hoặc TRAILER hay không. Mặc định TẮT; tập gộp / trailer bị bỏ qua sẽ được báo số lượng. Tập gộp đặt tên «Tên gốc - Gộp 01-10».",
        "Cầu nối chỉ chạy trong máy (127.0.0.1, cổng 47653), mỗi yêu cầu phải có tiêu đề riêng và đến từ tiện ích trình duyệt — trang web khác không điều khiển được. Chỉ nhận danh sách link + tên, không nhận cookie.",
        "SỬA thẻ Tải video: khung «Danh sách tải» cao theo cửa sổ (trước cố định ~3 video), thẻ video mỏng hơn.",
        "CHƯA thử với Douyin thật và CHƯA chạy giao diện Tk thật ở máy phát triển: đã kiểm bằng Chrome thật + trang Douyin giả + cầu nối thật (liệt kê bộ của kênh / của 1 bộ, lấy link 1 bộ, hủy, tập gộp) và kiểm logic thẻ bằng widget giả. Nếu gặp lỗi, gửi nội dung thông báo lỗi.",
    ]),
    ("2.5.41", [
        "SỬA tab Tải video: dán link máy chủ video của Douyin (dạng https://v3-web.douyinvod.com/...) giờ tải được. Trước đây tool chỉ coi là Douyin khi link có «douyin.com», nên link này bị đem tải như trang web thường và bị máy chủ từ chối.",
        "Link dạng này được tải thẳng bằng đường «link trực tiếp» (có Referer Douyin, tải song song như các tập có link trực tiếp), không hỏi trang Douyin nên không dính captcha. Dòng «video_1: link» trong tệp .txt vẫn lấy «video_1» làm tên; link không kèm tên thì tự đặt tên douyin_xxxx.",
        "Link loại này chỉ sống khoảng 3 giờ kể từ lúc lấy. Hết hạn thì tập báo lỗi 403/mã 22: lấy lại link mới.",
    ]),
    ("2.5.40", [
        "SỬA tab Tải video, Douyin: các tập CÓ link tải trực tiếp (dán từ extension, cột thứ 3 của «Hàng loạt») nay tải tối đa 8 tập cùng lúc thay vì 3. Nguyên nhân «để Không giới hạn mà vẫn tải từng ít tập»: bản 2.5.38 giới hạn cứng Douyin ở 3 tập cùng lúc để khỏi bị chặn hàng loạt.",
        "Tập KHÔNG có link trực tiếp (tool phải hỏi trang Douyin) vẫn giữ 3 tập cùng lúc như cũ, và hai nhóm không giành lượt của nhau. Mỗi tập vẫn 4 kết nối; đứt giữa chừng vẫn tự nối tiếp.",
        "SỬA chế độ «Siêu tốc (aria2c)»: thanh % và tốc độ không nhảy dù file vẫn tải, vì code đọc dòng tiến trình của aria2c đòi «số/số(%)» sát nhau trong khi aria2c luôn in thêm chữ «B» (và Ki/Mi/Gi). Nay đọc được mọi dạng (1048576B/20971520B(5%), 400.0KiB/33MiB(1%)...).",
        "Lỗi aria2c nay kèm lời giải thích tiếng Việt: mã 22 = «máy chủ từ chối (HTTP 403/404): thường do link tải đã hết hạn hoặc bị chặn», ngoài ra mã 2, 3, 6, 9, 16, 17, 19, 24, 29.",
        "CHƯA thử với Douyin thật và CHƯA thử với aria2c thật (máy chủ phát triển không cài được aria2c): đã kiểm bằng aria2c giả in đúng định dạng có chữ B, và giả lập đúng 8 tập cùng lúc, tập có link trực tiếp không bị 3 tập hỏi-trang chiếm lượt. Nếu thấy lỗi ngắt kết nối hàng loạt trở lại thì báo để hạ về 4–5.",
    ]),
    ("2.5.39", [
        "SỬA tab Tải video: tải lại tập đã có file CÙNG TÊN nay THAY file cũ thật sự (tải mới về file tạm, xong mới thay) thay vì báo «Hoàn tất» ngay mà không tải gì. Tải dở / lỗi giữa chừng thì file cũ vẫn còn nguyên.",
        "THÊM công tắc «Ghi đè file trùng tên» (mặc định BẬT) ngay dưới ô Chất lượng / Tăng tốc. TẮT thì gặp file cùng tên sẽ bỏ qua và ghi rõ vào nhật ký. File cũ đang mở ở trình phát video thì báo rõ «đóng trình phát rồi tải lại».",
        "Ghép hình + tiếng / đổi MP3 nay ghi ra file tạm rồi mới thay file cũ (trước đây ffmpeg ghi thẳng đè lên file cũ, lỗi giữa chừng là mất cả file cũ). Chưa thử với Douyin thật; đã kiểm bằng giả lập (16 test).",
    ]),
    ("2.5.38", [
        "SỬA tab Tải video: tải Douyin không còn rớt hàng loạt ở phần cuối danh sách (đã tải xong 102/126 tập thì 24 tập còn lại báo «Fresh cookies»). Cookie mới KHÔNG phải nguyên nhân: Douyin chặn khi dồn nhiều yêu cầu cùng lúc (trước đây mỗi tập mở 16 kết nối, «Tải cùng lúc: Không giới hạn» thì hàng chục tập chạy một lượt) và câu «Fresh cookies» là yt-dlp báo sai.",
        "Tải Douyin nay chỉ chạy tối đa 3 tập cùng lúc, mỗi tập 4 kết nối, các lần lấy thông tin cách nhau ~0,7 giây (dù «Tải cùng lúc» để không giới hạn; YouTube, Bilibili… không bị ảnh hưởng). Tập đến lượt sau sẽ tự chờ.",
        "Đứt giữa chừng thì tự nối tiếp phần đã tải (tối đa 3 lần); trang share bị chặn tạm thời thì thử lại 3 lần, lần cuối dùng ttwid ẩn danh. Link trực tiếp từ extension lỗi thì KHÔNG chuyển sang yt-dlp nữa (yt-dlp không tải được Douyin) mà hiện đúng lý do (ví dụ «HTTP Error 403»); link thường vẫn thử yt-dlp nhưng cột lỗi hiện lý do thật của cách trực tiếp, không còn câu «Fresh cookies».",
        "CHƯA thử với Douyin thật (máy chủ phát triển không vào được Douyin): đã kiểm bằng giả lập giới hạn 3 tập, nối tiếp khi đứt, hiện đúng lý do, hủy khi đang chờ lượt, ttwid ẩn danh. Cách lấy ttwid ẩn danh dựa trên mô tả của người khác, chưa kiểm chứng. Nếu vẫn lỗi, nhật ký (log) ở cuối tab sẽ ghi lý do thật.",
    ]),
    ("2.5.37", [
        "SỬA tab Dịch phụ đề (AI Web Translate): SỐ THỨ TỰ «[10]» không còn nằm trong bản dịch / file SRT / bản đọc TTS. Gemini hay trả «[753] [753] câu gốc ||| [753] bản dịch» (chép cả nhãn ở phần chép lại và ở bản dịch); trước đây nhãn ở bản dịch bị ghi luôn, và nhãn ở phần chép lại làm tool tưởng AI không chép đúng câu gốc (log «AI không chép lại đầu câu gốc…»). Giờ số và mốc giờ CHỈ để khớp đúng dòng, bị gỡ khỏi mọi bản dịch (kể cả dòng «cần xem» còn chữ Trung).",
        "Bản dịch đã lưu bởi bản cũ có dính «[số]» tự được dọn khi mở lại; prompt gửi AI dặn thêm «[số] chỉ viết một lần ở đầu dòng, bản dịch không ghi lại [số] / mốc giờ». Nhãn có chữ như «[Cười]» và «[5]» nằm giữa câu được giữ nguyên.",
        "Thử bằng đúng định dạng Gemini trong ảnh của bạn: bản 2.5.36 ra «[753] Ba vị…» và coi AI «không chép đúng», bản này ra «Ba vị…» và đối chiếu bình thường. CHƯA thử với Gemini thật và trên Windows. Dòng đã có «[số]» sẵn trong bảng của phiên dịch đang chạy: mở lại tệp (hoặc «Dịch lại câu còn sót») để được dọn.",
    ]),
    ("2.5.36", [
        "SỬA danh sách model Gemini ở tab Dịch phụ đề SRT (AI Web Translate): trước đây ô Model hiện TÊN CHẾ ĐỘ tiếng Việt («Trả lời nhanh», «Lập trình & phân tích»…) và làm rơi «4 Hydrogen» (tên «Trợ giúp hằng ngày» bị bộ lọc coi là mục Trợ giúp) nên không chọn được. Giờ tool đọc đúng DÒNG TÊN MODEL trong menu: «3.5 Flash-Lite», «4 Hydrogen», «4 Argon», «4 Carbon» (mục «Cấp độ tư duy» là menu con, không phải model, vẫn bị bỏ).",
        "Danh sách đã lưu bởi bản 2.5.35 (sai tên) tự bị bỏ và đọc lại từ trang; danh sách có sẵn của Gemini chỉ còn 4 model thật (bỏ các nhãn chung Pro / Flash / Nhanh / Tư duy). Model khác thì gõ thẳng tên vào ô Model.",
        "Thử trên trang giả lập có trình duyệt thật (mỗi mục 2 dòng: tên chế độ tiếng Việt + tên model, giống menu Gemini): đọc đúng 4 tên, chọn và xác nhận được cả «4 Hydrogen». CHƯA thử trên trang Gemini thật và trên Windows.",
    ]),
    ("2.5.35", [
        "THANH LOADING lúc mở app: bấm mở là hiện ngay màn hình khởi động có thanh tiến độ DÀY, BO GÓC, MÀU CHUYỂN DẦN (xanh chàm → tím → hồng → cam → xanh ngọc) kèm phần trăm và tên bước đang nạp; nạp xong mới hiện cửa sổ chính (không còn khung trắng trống lúc chờ). Mở tab lần đầu cũng có thanh «Đang tải tab…».",
        "Tab Dịch phụ đề SRT, mục AI Web Translate: danh sách model TỰ CẬP NHẬT theo trang. Tool mở menu chọn model trên trang (bằng session đã đăng nhập), đọc đúng các model trang đang cho chọn rồi nạp vào ô Model; bỏ các mục không phải model (vd «Cấp độ tư duy» của Gemini là menu con). Làm cho cả Gemini, ChatGPT, Claude, Copilot (DeepSeek web không có menu model nên vẫn gõ tay).",
        "Khi nào cập nhật: (1) mở tab Dịch mà danh sách cũ hơn 12 giờ thì tự đọc lại, chạy ngầm, có thanh chờ cạnh ô Model (tắt được bằng ô «Tự cập nhật khi mở tab»; chưa đăng nhập thì bỏ qua, không bật cửa sổ bắt đăng nhập); (2) nút «⟳ Cập nhật model» (trang đang chọn) và «Cả 5 trang»; (3) mỗi lần dịch tool mở menu model thì lưu luôn danh sách thật của trang. Bấm «Bắt đầu dịch» lúc đang tải model thì tool chờ tải xong rồi TỰ dịch.",
        "Gemini mới: có sẵn 4 Hydrogen, 4 Argon, 4 Carbon, 3.5 Flash-Lite (bỏ 3.1 Pro, 3.8 Flash đã hết trên trang). Model đang chọn mà trang không còn thì tool báo rõ «KHÔNG còn trong menu» và liệt kê các model trang đang có; khi dịch không chọn được model cũng ghi rõ menu trang đang có gì (vẫn DỪNG, không dịch nhầm bằng model khác).",
        "Gõ tay tên model: chọn trong menu rồi XÁC NHẬN như cũ; chữ tự gõ không còn bị đưa vào địa chỉ trang (ChatGPT trước đây có thể âm thầm đổi sang model khác khi tên sai).",
        "Thử trên trang giả lập có trình duyệt thật (menu kiểu Gemini / ChatGPT / Claude): đọc đúng danh sách, chọn đúng và xác nhận «4 Carbon», model biến mất thì báo đúng. CHƯA thử trên Gemini / ChatGPT / Claude thật và trên Windows; nếu menu thật khác, gõ tay tên model vào ô Model vẫn dùng được.",
    ]),
    ("2.5.34", [
        "Sửa lỗi tab Dịch: báo «sót» / tô vàng SAI dù Gemini đã dịch hết sang tiếng Việt. Từ nay CHỈ báo sót khi dòng chưa có chữ Việt (AI bỏ dòng, hoặc dòng chỉ có ký tự / tiếng cảm thán AI không trả) hoặc bản dịch còn chữ Trung / còn nguyên câu ngoại ngữ. Dòng đã có bản dịch tiếng Việt thì ghi nhận luôn, không tô vàng, không gửi bù.",
        "Nguyên nhân: tool tự đánh giá «độ hợp lý» của bản dịch (dài ngắn lệch so với câu gốc, MẤT SỐ trong câu gốc). Câu gốc ghi `5,000`, `100`, `200` mà Gemini viết «năm ngàn quan», «một trăm quan», «hai trăm lượng» thì bị coi là mất số → không ghi, báo thiếu rồi gửi bù lặp lại, lần nào Gemini cũng viết thế. Các kiểm tra này nay chỉ còn là ghi chú nội bộ, không còn chặn bản dịch.",
        "Lỗi thứ hai gây «không dịch được» ở những dòng như `啊 1,000贯`: Gemini chép đúng 4 ký tự đầu «啊 1,» nhưng tool bỏ dấu câu và khoảng trắng nên chỉ còn 2 ký tự, bị coi là «chép quá ngắn» → từ chối mãi, dòng nào mở đầu bằng tiếng cảm thán / dấu câu (啊 嗯 哎 唉 …) cũng dính. Nay phần chép chỉ còn ngắn vì dấu câu thì vẫn khớp đúng đầu câu gốc; chép chỉ còn 1 ký tự thì dùng số thứ tự.",
        "Bản dịch tạm (tô vàng) lưu từ các bản cũ: dòng đã có chữ Việt sạch, không còn chữ Trung thì được nhận luôn khi mở lại tệp, không cần dịch lại. Dòng chỉ là tiếng cảm thán (啊 嗯 …) AI không trả cũng được điền bằng từ điển và tính là đã dịch (trước đây tô vàng báo sót).",
        "Lượt gửi bù: AI chép đầu câu gốc lệch chữ (đổi số Hán thành chữ số, gián thể / phồn thể…) nhưng không khớp dòng nào khác thì tin số thứ tự AI ghi, khỏi gửi đi gửi lại. Vẫn giữ: đối chiếu dòng theo đầu câu gốc ở lượt đầu, tự đổi lại cặp dòng liền kề bị đảo rõ ràng, bỏ dòng AI trả thừa / mốc giờ mâu thuẫn.",
        "Thử trên Gemini giả lập (60 dòng, 12 dòng có số, số viết bằng chữ; hoặc bản dịch ngắn hơn câu gốc; hoặc chép sai đầu câu): bản 2.5.33 báo sót 12 đến 60 dòng, bản này nhận đủ 60/60. Trường hợp sót THẬT (AI bỏ dòng, để lại chữ Trung) vẫn được phát hiện: dòng bị bỏ được gửi bù, dòng còn chữ Trung tô vàng. CHƯA thử với Gemini thật.",
        "«Cách đọc» chỉ còn HAI lựa chọn: 1. SAMI và 2. Cách cũ. Bỏ «Tự động» (SAMI trước, hỏng thì lùi về cũ): máy nào bị chặn thì lùi về đường kia vẫn bị chặn, chỉ tốn thêm thời gian chờ. Chọn SAMI là chỉ dùng SAMI, chọn Cách cũ là chỉ dùng đường cũ (gom lô 20 câu, cần mã máy), không tự đổi qua lại. Mặc định là SAMI; cài đặt cũ đang để «Tự động» (hoặc tts_mode.txt / biến AUTOSTUDIO_TTS_MODE ghi auto) được đổi thành SAMI khi mở bản này, đang để «Cũ» thì giữ nguyên.",
        "SmartCut «Cắt đều theo thời lượng» (và cả «cắt theo lời review»): project CapCut nay được dựng ở thư mục TẠM cạnh thư mục project, có draft_id riêng và đường dẫn đích ngay từ đầu, xong hẳn mới ĐỔI TÊN cả thư mục vào thư mục project của CapCut rồi ghi vào danh sách. Trước đây thư mục xuất hiện ngay lúc bắt đầu dựng chỉ với tệp mẫu của pycapcut (cùng một id mẫu cho mọi project, chưa có nội dung) và đầy đủ dần trong lúc dựng — CapCut đang mở có thể nạp nhầm bản dở dang đó rồi bỏ qua project thật (nghi vấn, tạo nhiều đoạn thì lâu hơn nên dễ dính hơn). Thông báo cuối cùng nay nói đúng kết quả ghi danh sách thay vì lúc nào cũng khẳng định «Đã ghi». CHƯA kiểm chứng với CapCut thật: nếu «Cắt đều» vẫn chưa hiện khi CapCut đang mở thì về trang chủ CapCut; vẫn không hiện thì báo lại kèm dòng trạng thái SmartCut hiện ra sau khi tạo.",
    ]),
    ("2.5.33", [
        "SAMI gửi tới 2000 câu cùng lúc (trước 300): bỏ luôn ô «Câu gửi cùng lúc» trên giao diện — mặc định 2000, máy chủ báo bận / treo thì tự giảm (tối đa chỉnh được tới 3000 bằng biến môi trường AUTOSTUDIO_SAMI_PAR). Mỗi luồng dùng ngăn xếp nhỏ 512 KB khi chạy hàng trăm luồng, và đóng bớt kết nối nhàn rỗi sau mỗi đợt để không treo bộ nhớ. Thử trên máy chủ giả lập: 6000 câu (mỗi câu 1 giây) xong trong ~17 giây với 3000 luồng, không lỗi — chưa thử được với máy chủ CapCut thật nên tốc độ thật phụ thuộc máy chủ và mạng của bạn.",
        "«Cách đọc» (Tự động / SAMI / Cũ) dời lên ngay dưới ô trạng thái API CapCut ở góc phải trên cho dễ chọn.",
        "Làm đẹp ô chọn / ô nhập: ô chọn (Ngôn ngữ, Giọng, Cách đọc, Bộ lọc giọng, Định dạng, Phông chữ) và ô nhập bo tròn, viền sáng lên khi trỏ chuột / đang gõ; ô số Tốc độ / Vol (dB) có nút ▲▼ (giữ chuột = lặp, phím ↑ ↓ vẫn dùng được, gõ sai thì trả về số hợp lệ gần nhất). Các ô chọn / ô số ở tab khác: bỏ ô mũi tên xám vuông, mũi tên hòa vào ô, danh sách thả xuống gọn hơn.",
    ]),
    ("2.5.32", [
        "Chọn CÁCH ĐỌC GIỌNG ngay trên giao diện (mục «Giọng đọc»): Tự động (SAMI trước, hỏng thì dùng chế độ cũ) · SAMI (1 câu/kết nối, không cần mã máy, ít bị chặn) · Cũ (gửi theo lô 20 câu qua common_task, nhanh nhưng cần mã máy và hay bị chặn). Lưu cùng cấu hình; đổi là áp dụng ngay cho lần tạo giọng sau.",
        "SAMI mở NHIỀU kết nối hơn hẳn: ô «Câu gửi cùng lúc tối đa (SAMI)» mặc định 300, chỉnh 8–1000. Khởi đầu 128 rồi tăng ×1,4 mỗi 24 câu thành công; khi máy chủ báo bận / kết nối treo thì giảm ×0,6 nhưng chỉ 1 lần mỗi 6 giây (lỗi của một đợt quá tải đến dồn dập sau khi treo, giảm theo từng lỗi sẽ tụt hết cỡ). Thử trên máy chủ giả lập: 1000 câu (mỗi câu 1 giây) xong trong ~6 giây với 300 luồng.",
        "SmartCut (cả «cắt đều» lẫn «cắt theo lời review») và tạo project TTS: ghi project vào DANH SÁCH của CapCut (root_meta_info.json cùng thư mục project, có sao lưu .bak_autostudio_ngày) và điền thông tin còn trống trong draft_meta_info.json, cấp draft_id mới cho từng project (pycapcut dùng chung 1 id mẫu cho mọi project). Mục đích: CapCut đang mở có thể hiện project mới mà không phải thoát vào lại. LƯU Ý: chưa kiểm chứng được CapCut bản nào nạp lại danh sách khi đang chạy — nếu chưa thấy hãy về trang chủ CapCut, chưa thấy nữa thì mở lại CapCut như trước; CapCut tự ghi đè tệp danh sách khi thoát nhưng khi mở lại nó quét thư mục nên project vẫn còn.",
        "Project SmartCut cũng được hạ phiên bản dữ liệu về 110.0.0 như project TTS (trước đây ghi 140.0.0 theo CapCut 6.7 nên CapCut 4.8 báo «project bản mới hơn» và không mở).",
    ]),
    ("2.5.31", [
        "Tạo giọng qua SAMI nhanh hơn nhiều: số câu gửi cùng lúc khởi đầu 32 và tự tăng tới 64 (trước 20–32). «Chế độ cũ» gửi 20 câu/lô × nhiều lô song song (hàng trăm câu cùng lúc) nên nhanh hơn SAMI vốn chỉ 1 câu/kết nối; muốn gần bằng thì phải nhiều kết nối cùng lúc. Số luồng tự giảm nếu máy chủ báo bận / kết nối treo.",
        "Vòng chờ kết quả viết lại: trước đây mỗi lần có 1 câu xong là quét lại TOÀN BỘ danh sách câu chưa xong (hàng nghìn câu) → luồng chính ngốn CPU và tranh GIL với các luồng đang tải; giờ dùng hàng đợi hoàn thành, chi phí không đổi dù kịch bản dài tới đâu.",
        "Thanh tiến độ hiện thêm tốc độ «x câu/giây» (20 giây gần nhất). Nhật ký ghi MỖI 15 GIÂY khi đang chạy một dòng «SAMI tien do» (câu/giây, số luồng, thời gian nối / chờ tiếng đầu / tổng của mỗi câu, kết nối dùng lại) — xem được ngay giữa lúc chạy, không phải chờ xong.",
        "Máy nào chế độ cũ (common_task, gửi theo lô) vẫn chạy tốt và chưa bị chặn: có thể ép dùng bằng cách tạo tệp tts_mode.txt (nội dung common) trong AutoStudioData; xóa tệp = tự động (SAMI trước).",
    ]),
    ("2.5.30", [
        "Thêm nút «🧹 Xóa cache giọng + log» (mục Tạo giọng cho tệp SRT, cạnh «Mở thư mục»): xóa các câu giọng đã đọc trong cache và log.txt để lần Tạo giọng sau gửi lại TOÀN BỘ câu — dùng để đo tốc độ thật hoặc đọc lại từ đầu. Chỉ xóa tệp cache (tên 32 ký tự + đuôi âm thanh) và log; project và file giọng đã chèn vào project không bị đụng tới. Có hỏi xác nhận, không cho xóa khi đang có việc chạy.",
    ]),
    ("2.5.29", [
        "Đính chính 2.5.28: «chậm dần về cuối» là đọc nhầm — phần đầu nhanh vì là câu ĐÃ CÓ TRONG CACHE; thật sự gửi chỉ 1280/6828 câu, mất 402 giây (~3,2 câu/giây), 0 lỗi. Nên hướng tối ưu là tăng thông lượng gửi thật, không phải chống bị chặn.",
        "Nhật ký giờ ghi MỖI LƯỢT tạo giọng một dòng đo từng bước: số kết nối mới / dùng lại, thời gian trung bình mỗi câu chia ra «nối» (TCP+TLS+websocket), «chờ tiếng đầu» (máy chủ bắt đầu trả âm thanh) và «tổng», thời gian chờ cổng (số luồng) và dung lượng. Gửi dòng «synth_many» này là biết chính xác chỗ nghẽn (mạng, máy chủ hay số luồng).",
        "Số luồng SAMI: khởi đầu 20, tự chỉnh 2–32 (2.5.28 khởi đầu 8, trần 16 — quá dè dặt so với 2.5.27 đã chạy 24 luồng không lỗi).",
    ]),
    ("2.5.28", [
        "Tạo giọng hàng nghìn câu không còn chậm dần về cuối: trước đây MỖI CÂU mở 1 kết nối mới tới máy chủ SAMI (TCP + TLS + websocket) — 6000 câu = 6000 lần bắt tay, tới đoạn cuối máy chủ/mạng bắt đầu bỏ lơ bước bắt tay (lỗi «handshake operation timed out»), mỗi lần chờ 15 giây. Giờ XONG câu nào thì GIỮ kết nối đó cho câu sau (nếu máy chủ không cho dùng lại thì tự phát hiện sau 3 lần, quay về cách cũ, KHÔNG tính là lỗi).",
        "Kết nối treo bước bắt tay chỉ chờ 5 giây (trước 15) rồi nối lại ngay, tối đa 3 lần; liên tiếp lỗi thì tất cả luồng nghỉ 1,5 → 20 giây rồi mới nối tiếp để không dội thêm vào máy chủ đang bỏ lơ. Số luồng SAMI tự chỉnh 2–16 (bắt đầu 8; bản 2.5.27 để 24 cố định trần là quá mạnh tay).",
        "Thời gian «còn ~» tính theo tốc độ 20 giây gần nhất (lấy mức chậm hơn giữa gần đây và trung bình) thay vì trung bình cả đợt — trước đây đoạn cuối chậm vẫn hiện «còn 0:20» cả phút.",
        "Nhật ký ghi thêm số kết nối mới / số lần dùng lại sau mỗi lượt tạo giọng. Tắt dùng lại kết nối: tạo tệp sami_reuse.txt (nội dung 0) trong AutoStudioData.",
    ]),
    ("2.5.27", [
        "Đọc giọng NHANH hơn: đường SAMI nâng từ 8 lên 24 kết nối cùng lúc (tự giảm khi máy chủ báo bận), dùng chung 1 ngữ cảnh SSL (không nạp lại bộ chứng chỉ cho từng câu), TCP_NODELAY, nhớ cấu hình proxy 60 giây. Thử giả lập (độ trễ máy chủ 0,8 giây, 96 câu): 9,7 giây → 4,8 giây.",
        "Hết nhảy sang đường bị chặn: 1 câu SAMI trục trặc giờ được thử lại ngay trên SAMI; chỉ chuyển sang đường common_task khi SAMI hỏng 3 lần liên tiếp VÀ đường đó chưa từng bị chặn. Trước đây câu hỏng → gọi common_task → «shark block» → chờ 60 giây trở lên và dừng cả lô.",
        "SAMI không nhận giọng nào mà common_task cũng từng từ chối (vd 2 giọng Microsoft Hoài My / Nam Minh có trong Voice.json nhưng không phải giọng CapCut) hoặc common_task đang bị chặn: báo giọng không dùng được ngay, không gửi thêm lên CapCut. Không còn dính 60 giây nghỉ chỉ vì kiểm tra 2 giọng này.",
        "«Kiểm tra kết nối» qua SAMI chạy 6 giọng song song (trước 3).",
    ]),
    ("2.5.26", [
        "Project CapCut MỚI do tool tạo giờ mở được trên CapCut 4.8 trở lên. Trước đây thư viện pycapcut ghi phiên bản dữ liệu 140.0.0 (theo CapCut 6.7) trong khi CapCut 4.8 chỉ mở được tới 121.0.0 (đọc từ chính CapCut 4.8 trên máy TUF) nên báo «project tạo bằng bản mới hơn» và không mở. Nay tool ghi 110.0.0 (mốc thư viện gốc đã kiểm chứng): bản 4.8 mở được, các bản 5.x–9.x mở được và tự nâng cấp lên bản của mình. Chỉ đổi 3 nhãn phiên bản, không đụng nội dung track.",
        "Chèn vào project CÓ SẴN thì giữ nguyên phiên bản của project đó như cũ (bản nào tạo thì bản đó vẫn mở được).",
    ]),
    ("2.5.25", [
        "Thêm ĐƯỜNG ĐỌC GIỌNG MỚI qua websocket SAMI — chính là đường CapCut 4.x dùng (xin token ẩn danh rồi nối wss://sami-sg1.byteintlapi.com). Đường này KHÔNG cần mã máy và không đi qua cơ chế chặn «shark» (ret=-6) của đường common_task mà CapCut 9.x dùng. Đã kiểm thử đầy đủ trên máy chủ giả; chưa thể thử với CapCut thật từ nơi viết tool, nên nếu có lỗi nhật ký sẽ ghi dòng «SAMI: …».",
        "Mặc định (auto): dùng SAMI trước; nếu SAMI hỏng hoặc giọng đó SAMI không có thì tự lùi về đường common_task cũ (khi máy có mã máy CapCut). Ép một đường: tạo tệp tts_mode.txt trong AutoStudioData ghi sami hoặc common (hoặc auto).",
        "Máy KHÔNG có mã máy CapCut nay vẫn đọc được qua SAMI (trước đó tool dừng hẳn). Khi SAMI hỏng và đường cũ cũng hỏng, thông báo ghi rõ cả hai nguyên nhân.",
        "Đường SAMI tối đa 8 kết nối cùng lúc (từ 2.5.27: 24); câu dài trên 300 ký tự tự cắt theo dấu câu rồi nối lại. Âm thanh trả về dạng WAV 24 kHz.",
        "Trạng thái «bị chặn» của đường common_task chỉ còn giữ khi cùng phiên bản tool (bản mới tự thử lại từ đầu).",
    ]),
    ("2.5.24", [
        "Nhớ thời gian bị CapCut chặn kể cả khi tắt/mở lại tool (tệp block_state.json trong AutoStudioData, theo mã máy). Trước đây mở lại tool hay bấm «Kiểm tra kết nối» là gửi tiếp dù đang bị chặn — log máy TUF ghi hơn 2.600 yêu cầu bị chặn, làm thời gian chặn kéo dài.",
        "Thời gian nghỉ khi bị chặn dài dần: 1 phút, 2 phút, 5 phút, 15 phút, 30 phút, 1 giờ, 2 giờ, tối đa 4 giờ. Trong lúc nghỉ tool KHÔNG gửi gì lên CapCut (bấm lại cũng không gửi). Hết nghỉ chỉ thử 1 yêu cầu; thành công thì xóa trạng thái. Muốn bỏ trạng thái: xóa tệp block_state.json.",
    ]),
    ("2.5.23", [
        "Chẩn đoán mã máy: mỗi lần mở tool ghi tệp chan_doan_ma_may.txt trong AutoStudioData (liệt kê CapCut ghi dữ liệu ở đâu, bản nào, tệp nào có trường mã). KHÔNG chứa mã máy — mọi dãy số dài đều bị che. Khi tool không đọc được mã trên bản CapCut khác, chỉ cần gửi tệp này.",
    ]),
    ("2.5.22", [
        "Sửa lỗi 2.5.21: CapCut trả ret=1014 «system busy» vì chữ ký request vẫn tính theo pf=3 (Mac) trong khi tiêu đề gửi pf=4 (Windows). Giờ chữ ký dùng đúng pf của thiết bị (Mac vẫn như cũ).",
    ]),
    ("2.5.21", [
        "Tìm được mã máy CapCut 9.x: CapCut không còn ghi device_id vào VeDetector mà ghi mã (tdid) trong thư mục ParfaitServer và đặt tên tệp .pftconfig theo mã đó. Tool giờ đọc cả hai nơi này (kiểm thử trên dữ liệu CapCut thật của máy bạn).",
        "Dùng đúng thông số CapCut PC Windows: pf=4, kênh (Config\\channel), vùng (DeviceRegister), phiên bản (thư mục Apps), hệ điều hành, kiểu máy — thay cho thông số máy Mac của mã chung.",
        "Quét thư mục ParfaitServer / Config / Log / MMKV trước nên không bị hết giờ quét.",
    ]),
    ("2.5.20", [
        "Sửa: câu báo «chưa có mã máy» quá dài, lấp hết khung log. Giờ chỉ 1 dòng ngắn + 1 dòng «đã quét những đâu» (🔎) ngay trong khung log; khung log cao hơn, tự xuống dòng; không lặp lại liên tục.",
    ]),
    ("2.5.19", [
        "Bỏ Nuitka: build.bat giờ đóng gói bằng PyInstaller (vài phút thay vì 15–40 phút) và vẫn tạo zip cập nhật + Setup.exe. Chưa thử trên Windows thật: tự kiểm tra ở cuối báo thiếu gì (vẫn tạo Setup để chạy thử). build_nhanh.bat gộp vào build.bat.",
        "Chỉ dùng mã thiết bị CỦA MÁY: KHÔNG còn tự rơi về mã mặc định dùng chung của thư viện (mã đó nhiều người cùng dùng nên CapCut chặn ret=-6). Không có mã máy thì tool dừng ngay, báo rõ, và KHÔNG gửi gì lên CapCut.",
        "Thứ tự lấy mã máy: nhật ký CapCut → quét dữ liệu CapCut → mã đã nhớ (capcut_identity.json) → device.json → mã đã dùng ở lần trước (khóa trong voice_status.json khác mã chung).",
        "Muốn vẫn dùng mã chung (không khuyên dùng): tạo tệp trống dung_ma_chung.txt trong AutoStudioData (hoặc đặt biến AUTOSTUDIO_ALLOW_SHARED=1).",
    ]),
    ("2.5.18", [
        "Mã thiết bị CỦA MÁY (CapCut PC): ngoài nhật ký VeDetector kiểu cũ, tool quét RỘNG thư mục dữ liệu CapCut (Local + Roaming; bỏ bộ nhớ đệm / dự án) tìm device_id / iid / did ở mọi dạng tệp (URL, JSON, key=value, cả tệp nhị phân) và NHỚ lại ở AutoStudioData\\capcut_identity.json để CapCut đổi cách ghi nhật ký cũng không mất. Đọc tối đa 40 tệp nhật ký (trước 12).",
        "Không tìm được thì nhật ký ghi rõ đã quét bao nhiêu tệp, ở thư mục nào, tệp nào có trường mã thiết bị (đã che số) để biết CapCut ghi ở đâu.",
    ]),
    ("2.5.17", [
        "«Kiểm tra kết nối» không còn báo «Kết nối ổn» sai: chỉ báo ổn khi lần thử này CapCut thật sự trả lời. Mọi yêu cầu không tới được CapCut (sai máy chủ, mất mạng...) thì báo lỗi rõ kèm tên máy chủ; số giọng «dùng được» lấy từ bộ nhớ các lần trước không còn bị tính là ổn.",
        "Tên máy chủ không phân giải được (vd editor-api-vn.capcutapi.com — đã thử thực tế: KHÔNG tồn tại) thì báo thẳng và dặn xóa capcut_host.txt.",
        "Nhật ký ghi rõ vì sao không lấy được mã thiết bị của CapCut PC (thư mục nhật ký CapCut có hay không) khi phải dùng mã mặc định dùng chung.",
    ]),
    ("2.5.16", [
        "Build nhanh: thêm build_nhanh.bat (đóng gói bằng PyInstaller, vài phút thay vì 15–40 phút của build.bat/Nuitka), giống AnimStudio. Chỉ để THỬ / dùng riêng; bản phát hành cho khách vẫn dùng build.bat. Chưa thử trên Windows thật: tự kiểm tra ở cuối sẽ cho biết thiếu gì.",
    ]),
    ("2.5.15", [
        "Lồng tiếng CapCut: thử được máy chủ CapCut khác (vd bản VN) mà không sửa mã: tạo tệp capcut_host.txt (một dòng, vd editor-api-vn.capcutapi.com) trong thư mục AutoStudioData hoặc cạnh chương trình rồi chạy lại. Chỉ nhận *.capcutapi.com qua https; xóa tệp để về máy chủ mặc định (sg). Nhật ký ghi rõ máy chủ đang dùng. Tool chưa kiểm chứng được máy chủ nào ngoài sg.",
        "Thông báo CapCut chặn («shark block») ghi thêm máy chủ đang dùng.",
    ]),
    ("2.5.14", [
        "Lồng tiếng CapCut: khi CapCut trả lỗi chặn «ret=-6 shark block only» (chống lạm dụng) tool DỪNG gửi ngay, không thử lại / chia đôi câu / dội thêm nữa (trước đây một lần bị chặn kéo theo hàng nghìn yêu cầu thừa và bị chặn lâu hơn).",
        "Sau khi bị chặn tool nghỉ 1 phút (lần sau gấp đôi, tối đa 15 phút), rồi chỉ thử 1 yêu cầu một lúc; có 1 yêu cầu thành công mới chạy lại bình thường. Câu đã đọc xong được nhớ nên không phải đọc lại.",
        "Thông báo lỗi nói rõ nguyên nhân và nguồn mã thiết bị đang dùng (CapCut thật trên máy / device.json / mã mặc định dùng chung) và cách xử lý.",
        "Số luồng gửi ban đầu giảm (12 luồng, tối đa 48; lô: 4, tối đa 12) để đợt lớn ít bị CapCut chặn hơn; vẫn tự tăng khi CapCut trả lời ổn định.",
    ]),
    ("2.5.13", [
        "🔢 Đọc tiếng Anh bằng giọng VieNeu (kể cả giọng clone): SỐ TỰ ĐỔI SANG CHỮ TIẾNG ANH trước khi đọc, không có nút nào phải bật. Model VieNeu làm cho tiếng Việt nên số trần trong câu tiếng Anh có thể bị đọc sai. Ví dụ: 2024 → «twenty twenty-four» (năm), 1,250 → «one thousand two hundred fifty», 3.5 → «three point five», 50% → «fifty percent», $5 → «five dollars», $3.50 → «three dollars fifty cents», $2 million → «two million dollars», 1st → «first», 3:30 → «three thirty», 1990s → «nineteen nineties», số dài từ 8 chữ số (điện thoại) → đọc từng số.",
        "Chỉ áp dụng cho câu NHÌN RA là tiếng Anh (không có dấu tiếng Việt / chữ Hán, và có đủ từ ngữ pháp tiếng Anh như the, and, is, of…). Câu tiếng Việt, tiếng Trung và nguồn Microsoft / Azure giữ nguyên số. Câu trộn Việt–Anh có dấu tiếng Việt coi là câu tiếng Việt nên không đổi.",
        "Lưu ý trung thực: số có 4 chữ số từ 1100–2099 chỉ đọc như NĂM khi đứng sau in / since / by / from / tên tháng… (hoặc đầu câu và theo sau là was / is…); còn lại đọc như số thường («1500 units» → «one thousand five hundred units»). Tôi CHƯA biết VieNeu có tự đọc số tiếng Anh đúng hay không (chưa chạy được model thật) — bước này là phòng ngừa, nếu model đã đọc đúng thì cũng không hại gì. Chưa nghe thử giọng thật.",
    ]),
    ("2.5.12", [
        "🎙 Giọng clone TỰ chuyển nguồn: thêm giọng clone từ nguồn Microsoft / Azure thì app tự chuyển sang «Ninh Đôn · VieNeu (offline)» và chọn luôn giọng vừa thêm, không hỏi nữa (giọng clone chỉ chạy được bằng nguồn đó). Nếu đang chọn model Nano thì tự chuyển sang Turbo, vì theo trang thư viện VieNeu bản Nano không clone được. Nhật ký ghi rõ app đã tự đổi gì.",
        "📖 Đọc tiếng Anh: chia câu không còn cắt nhầm sau chữ viết tắt Dr. Mr. Mrs. Ms. Prof. Mt. vs. e.g. i.e. (trước đây «Dr. Smith» bị tách thành hai câu, có khoảng nghỉ giữa chừng). Chỉ áp dụng cho các chữ viết tắt này; tiếng Việt / Trung giữ nguyên cách chia. Chữ viết tắt hay đứng cuối câu (etc. No. St. Jr. a.m. p.m.) cố ý KHÔNG đưa vào để không nuốt mất ranh giới câu.",
        "Lưu ý trung thực: chưa nghe thử giọng clone đọc tiếng Anh với VieNeu thật (chất lượng phát âm, giọng có bị «Tây ba lô» hay không chưa kiểm chứng); giao diện Tk vẫn chưa bấm thử.",
    ]),
    ("2.5.11", [
        "🧹 Quét hardsub và Lấy sub Jianying / CapCut: LÀM SẠCH GIỜ TRƯỚC KHI GHI .srt để không còn dòng ĐÈ CHỒNG giờ lên nhau. Trước đây sau các lượt «quét lại kỹ» / «nghe lại» / «lượt 2», dòng mới được thêm vào và vài dòng bị kéo dài mốc giờ mà không xử lý chồng giờ → .srt có nhiều dòng đè lên nhau (công cụ soi lỗi SRT báo «chồng giờ» rất nhiều chỗ). Nay: dòng TRÙNG (cùng chữ, hoặc chữ ngắn nằm trọn trong chữ dài khi giờ chồng nhau) được gộp thành 1 dòng giữ chữ đầy đủ hơn; hai dòng khác chữ mà chồng giờ thì dòng trước được cắt bớt đúng chỗ dòng sau bắt đầu (giữ nguyên giờ BẮT ĐẦU của mỗi dòng); hai dòng bắt đầu gần như cùng lúc thì chia đều khoảng thời gian; mỗi dòng dài tối thiểu 0,3 giây khi còn chỗ trống. Không dòng nào có chữ bị mất vì thao tác này. Nhật ký ghi «Làm sạch giờ sub: gộp N dòng trùng, cắt bớt N dòng…».",
        "Quét hardsub: dòng TÌM THÊM ở lượt quét lại kỹ (trong khoảng có tiếng mà lượt 1 chưa thấy chữ) nay chỉ được nằm ở chỗ CHƯA CÓ dòng nào; phần chồng lên dòng đã có bị cắt bỏ, dòng nằm trọn trên dòng đã có (hay là «dòng ma»: chữ ngoài vùng sub, logo, chữ lặp) bị bỏ. Thứ tự giành chỗ: dòng ít chồng nhất, rồi dòng đọc chắc hơn. Cách quét (đủ mọi đoạn có tiếng, đối chiếu giọng nói, quét lại kỹ chỗ sót) giữ nguyên.",
        "🎙 Trình đọc văn bản: THÊM GIỌNG CLONE và ĐẶT TÊN THEO Ý. Nút «＋ Thêm giọng clone» nay hiện ở mọi nguồn giọng (trước đây chỉ khi chọn nguồn Ninh Đôn · VieNeu): chọn file mẫu 3–8 giây (wav, mp3, m4a, flac, ogg, aac… hoặc cả video — app tự lấy tiếng, đổi sang WAV mono 24 kHz và cắt còn tối đa 12 giây đầu; cần ffmpeg cho định dạng khác wav) → hộp thoại hỏi TÊN giọng (mặc định là tên file, gõ tên khác tuỳ ý, có dấu tiếng Việt) → lưu lại: lần mở sau giọng vẫn còn (ghi trong voices.json + thư mục ref). File mẫu ngắn hơn 2 giây bị từ chối kèm lý do; tên trùng thì hỏi ghi đè; tên trùng giọng có sẵn («Ninh Đôn») thì bắt đặt tên khác. Giọng clone chạy bằng nguồn «Ninh Đôn · VieNeu (offline)» — thêm từ nguồn khác thì app hỏi có chuyển sang nguồn đó ngay không.",
        "Giọng clone của bạn hiện trong danh sách giọng với dấu ★. Chọn một giọng ★ thì có thêm nút «✎ Đổi tên» (đổi cả tên file mẫu cho khớp) và «🗑 Xóa giọng» (xóa giọng + file mẫu, có hỏi xác nhận). Ghi đè file mẫu của một giọng hoặc xóa rồi thêm lại cùng tên: động cơ VieNeu nạp lại mẫu mới (trước đây trong cùng phiên nó giữ mẫu cũ).",
        "Lưu ý trung thực: phần làm sạch giờ đã chạy thử với dữ liệu giả lập (dòng trùng, chồng giờ, dòng ma) và một video thử với OCR giả — CHƯA thử với OCR thật / máy chủ Jianying thật. Phần giọng clone: logic thêm / đổi tên / xóa đã thử với file wav, mp3, m4a thật và các hộp thoại giả; giao diện Tk (vị trí nút, hộp thoại thật) chưa bấm thử vì môi trường dựng bản không có màn hình — nếu nút nào lệch chỗ hoặc báo lỗi, gửi lại nhật ký.",
    ]),
    ("2.5.10", [
        "🎯 Dịch ĐÚNG DÒNG (cả khi dịch nhiều tab cùng lúc) — vẫn giữ HAI kiểu gửi như cũ: (1) «Số + lời thoại» (không gửi mốc giờ) và (2) «Khối SRT đầy đủ» (số + mốc giờ + lời thoại). Tool TỰ đối chiếu và TỰ gửi bù dòng sai, không có ô nào để bật tắt. Kiểu 1: mỗi dòng AI trả về phải chép lại vài chữ đầu của đúng câu gốc (4 chữ với tiếng Trung / Nhật / Hàn, 12 ký tự với chữ Latin — ngắn để trả lời không chậm) («[622] 他说我们明天 ||| bản dịch»); tool khớp phần chép với câu gốc: khớp → ghi; AI ghi sai số nhưng chép đúng câu của dòng khác → tự xếp về ĐÚNG dòng; chép không khớp dòng nào → KHÔNG ghi, tự gửi bù. Kiểu 2: khớp theo SỐ + MỐC GIỜ: số và mốc giờ phải trùng nhau (số nói dòng A mà giờ là của dòng B → bỏ khối đó, không đoán); AI đánh số lại từ 1 hoặc bỏ số mà mốc giờ đúng → xếp theo mốc giờ; AI dịch mốc giờ đi một đoạn không trùng dòng nào thì khớp theo số. File kết quả luôn dùng mốc giờ GỐC của dòng đã xác nhận, không bao giờ ghi mốc giờ do AI trả.",
        "Kiểm tra thêm độ hợp lý của từng bản dịch: dịch quá ngắn / quá dài so với câu gốc (dấu hiệu AI gộp ý, cắt ý, hoặc đảo nội dung hai dòng liền kề), mất số có trong câu gốc (2024, 3500…) → KHÔNG ghi như bản đạt, gửi bù riêng kèm ngữ cảnh. Cặp dòng liền kề bị đảo rõ ràng (độ dài khớp chéo hơn khớp thẳng rất nhiều) thì tự đổi lại. Hết cách thì giữ tạm và tô vàng để bạn xem lại, KHÔNG coi là đã dịch xong. Nhật ký ghi rõ từng việc đã xử lý.",
        "Kiểu gửi «Khối SRT đầy đủ»: khối có SỐ THỨ TỰ nói dòng A nhưng MỐC GIỜ lại khớp dòng B bị bỏ (không đoán). «Dán bản dịch từ clipboard» cũng dùng cùng bộ đối chiếu.",
        "Lưu ý: AI chép lại vài chữ đầu của câu gốc nên câu trả lời dài hơn chút (ước tính khoảng 20–25%, chưa đo trên Gemini thật); nếu bị cắt giữa chừng (nhật ký báo «bị cắt») hãy giảm «Số câu mỗi lần dịch». Việc đối chiếu trên máy rất nhanh (khoảng 20 ms cho một lô 250 dòng). Hai dòng liền kề bị đảo nội dung nhưng dài gần bằng nhau thì không thể phát hiện bằng độ dài — phần chép câu gốc làm giảm khả năng này chứ không loại bỏ hoàn toàn; đã dịch xong nên liếc lại các dòng tô vàng.",
        "🖥 Mã thiết bị CapCut: nay ƯU TIÊN mã thật của CapCut đang cài trên CHÍNH máy này (đọc từ nhật ký CapCut Windows) trước, rồi mới tới device.json, cuối cùng là mã mặc định dùng chung của thư viện. Trước đây device.json (nếu có) được ưu tiên hơn CapCut trên máy. device.json giờ chỉ dùng khi máy chưa có nhật ký CapCut.",
        "Áp dụng cho cả «Lấy sub Jianying / CapCut» (nhận dạng giọng bằng CapCut quốc tế): trước đây phần này không đọc mã CapCut trên máy mà dùng ngay mã mặc định dùng chung (hoặc device.json); nay dùng cùng thứ tự ưu tiên như Lồng tiếng.",
    ]),
    ("2.5.9", [
        "🎧 Lồng tiếng: SỬA LỖI giọng đọc bị đẩy SỚM so với sóng âm và phụ đề (chỗ không có sóng âm vẫn nghe tiếng đọc) ở file giọng DÀI. Nguyên nhân: nút «Chỉ gộp audio» và file ghép khi bỏ tick «Mỗi câu 1 đoạn riêng» ghi ra mp3 VBR; file có nhiều đoạn im lặng nên kích thước không tỉ lệ với thời gian, CapCut tua tới vị trí bằng ước lượng nên rơi sai chỗ hàng giây (sóng âm vẫn đúng vì được giải mã tuần tự từ đầu). Đo thử: tua theo kích thước file lệch −28…+25 giây, theo bảng TOC của mp3 vẫn lệch 2–7 giây.",
        "«Chỉ gộp audio» nay ghi file WAV (PCM, thời gian = số mẫu / tần số nên chính xác tuyệt đối ở mọi trình phát; nặng hơn mp3, ~2,9 MB mỗi phút). Có kiểm tra chỗ trống ổ đĩa trước khi ghi. Dự án đã gộp bằng bản cũ: bấm «Hoàn tác gộp» rồi gộp lại.",
        "Bỏ tick «Mỗi câu 1 đoạn riêng» khi chèn vào CapCut: file ghép nay là WAV. «Chỉ xuất audio» và trang «Đọc văn bản» giữ định dạng bạn chọn nhưng mp3 nay là CBR 128k không có bảng TOC (kích thước tỉ lệ đúng với thời gian); muốn chính xác tuyệt đối khi đưa vào CapCut cùng phụ đề thì chọn wav.",
    ]),
    ("2.5.8", [
        "🌏 Trình đọc văn bản: ĐỌC ĐƯỢC NHIỀU NGÔN NGỮ. Với nguồn Microsoft online và Azure có thêm ô «Ngôn ngữ» (khoảng 75 ngôn ngữ, ~240 giọng): Tiếng Việt, Anh, Trung (Phổ thông / Đài Loan / Quảng Đông Hồng Kông), Nhật, Hàn, Thái, Indonesia, Hindi, Ả Rập, Nga, Pháp, Đức, Tây Ban Nha, Bồ Đào Nha, Ý… Chọn ngôn ngữ rồi chọn giọng; mỗi ngôn ngữ nhớ giọng bạn chọn lần trước. Giọng tiếng Việt / Anh và cài đặt đã lưu giữ nguyên.",
        "Chia câu đúng cho chữ Hán / Nhật / Hàn: trước đây tiếng Trung, Nhật không có dấu cách sau dấu chấm nên cả đoạn bị gộp thành một khối dài, cắt ngang câu. Nay tách ngay sau 。！？ (và dấu ngoặc đóng 」”), nghỉ giữa câu như tiếng Việt, cắt câu dài ở dấu phẩy 、， và không bao giờ cắt ra đoạn 1–2 chữ. Dấu chấm tiếng Việt / Anh (3.5, example.com) vẫn không bị cắt nhầm. Chữ / số toàn chiều (ＡＢＣ１２３, ｶﾀｶﾅ) được chuẩn hóa trước khi gửi.",
        "Nút «🌐 Làm mới danh sách giọng» (nguồn Microsoft): tải danh sách giọng đang chạy thật từ Microsoft (thêm giọng / ngôn ngữ mới, bỏ giọng đã ngưng) và lưu lại. Azure: bấm «Kiểm tra & lưu» nay tải giọng của MỌI ngôn ngữ (trước chỉ Việt + Anh).",
        "Văn bản không hợp giọng thì nhắc: dán tiếng Trung / Nhật / Hàn… mà đang chọn giọng tiếng Việt (hoặc nguồn VieNeu chỉ đọc Việt / Anh) → hỏi «Đổi sang giọng … rồi đọc?» (Có / Không = vẫn đọc / Hủy). Bấm «Nghe thử» khi ô văn bản trống sẽ đọc một câu mẫu đúng ngôn ngữ của giọng để nghe thử giọng. «Thử nhanh Microsoft» thử cả giọng đang chọn.",
        "🔊 Thanh «Âm lượng» (20–200%) trong mục «Đọc & lưu»: áp dụng cho cả ba nguồn giọng và cả «Nghe thử». Trên 100% có nén mềm ở đỉnh sóng để to lên mà không vỡ tiếng. 100% = giữ nguyên từng byte.",
        "✨ Giao diện tab Trình đọc văn bản làm lại cho mềm mại: thẻ, ô nhập, ô chọn, khung văn bản, thanh cuộn, nút (dạng viên thuốc) và thanh chọn nguồn đều bo tròn thật; nhãn ô chọn nằm phía trên; các thanh trượt thẳng hàng. Chỉ đổi tab này, các tab khác giữ nguyên.",
        "🛠 build.bat: sửa lỗi «[WinError 5] Access is denied … cv2.pyd» khi cài thư viện. Nguyên nhân: một tiến trình python đang chạy (Auto Studio bản dev / lần build trước) giữ file cv2.pyd. Nay build.bat tìm các tiến trình đang giữ thư mục OpenCV, hỏi bạn rồi đóng chúng; nếu pip vẫn lỗi thì tự thử lại một lần sau khi giải phóng.",
    ]),
    ("2.5.7", [
        "🌐 Tab Dịch (dịch bằng trang web): mỗi tab GIỮ NGUYÊN cuộc trò chuyện và gửi lô tiếp theo ngay trong cùng cuộc đó — không còn tải lại trang sau mỗi lô như trước. Chỉ khi một tab đã dịch khoảng 2000 dòng thì mới tải lại tab (mở cuộc trò chuyện mới) để cuộc trò chuyện khỏi quá dài.",
        "Ô mới «Tải lại tab sau (dòng)» trong tab Dịch (mặc định 2000; 0 = tải lại sau mỗi lô như bản cũ). Tab bị lỗi / treo thì lô kế tiếp tự mở trang mới.",
        "🧹 Nút «Xóa Log» ở tab Dịch nay xoá CẢ bản dịch đã nhớ của tệp đang mở (không chỉ log): bấm «Bắt đầu dịch» sẽ dịch lại từ đầu. Trước đây bấm Xóa Log rồi Dịch vẫn báo «đã có sẵn» và xong ngay mà không dịch lại. Nếu có dòng bạn đã sửa tay thì hỏi xác nhận trước khi xoá; đang dịch thì chỉ xoá log. Khi mọi dòng đã có bản dịch nhớ, lần Dịch sau ghi rõ lý do và cách dịch lại.",
    ]),
    ("2.5.6", [
        "🪟 Sửa lỗi treo khi đóng từ taskbar: bấm «Đóng cửa sổ» ở biểu tượng Auto Studio dưới taskbar lúc cửa sổ đang thu nhỏ trước đây làm hộp «Thoát hẳn / Thu nhỏ / Ở lại» bị đặt ra ngoài màn hình (Windows báo cửa sổ thu nhỏ ở tọa độ -32000) nên không thấy hộp, cửa sổ không đóng được cũng không mở lại được (phải khởi động lại máy). Nay cửa sổ tự hiện lại và hộp luôn hiện giữa màn hình, nằm trên cùng.",
        "Bấm «Đóng cửa sổ» nhiều lần liên tiếp chỉ kéo hộp đang mở lên trước, không mở chồng nhiều hộp. Nếu hộp lỗi vẫn có hộp thoại hệ thống dự phòng để thoát được.",
        "Hộp hỏi cập nhật và hộp ủng hộ cũng được sửa tương tự (luôn nằm trong màn hình).",
    ]),
    ("2.5.5", [
        "🔌 Lồng tiếng CapCut tự kết nối: mở ứng dụng là tự kiểm tra các giọng CapCut ở nền, không cần bấm «Quét API». Danh sách chỉ hiện những giọng CapCut thật sự nhận; giọng bị từ chối (TTSInvalidSpeaker) tự ẩn và ghi rõ trong nhật ký.",
        "🚫 Không bao giờ tự đổi sang giọng khác. Giọng bị CapCut từ chối thì báo rõ lý do ngay (không thử lại vô ích); chưa có giọng dùng được thì chặn chạy và nói rõ phải làm gì.",
        "🎧 «Nghe thử giọng» dùng đúng giọng đã chọn. Nút «Kiểm tra kết nối» thử lại toàn bộ giọng của ngôn ngữ đang chọn và báo «N/M giọng dùng được».",
        "🖥 Mã thiết bị: tự đọc từ CapCut đang cài trên CHÍNH máy chạy tool (nhật ký của CapCut Windows) thay cho mã mặc định dùng chung. Mỗi máy dùng mã của CapCut trên máy đó; device.json riêng vẫn được ưu tiên hơn. Máy chưa cài / chưa mở CapCut, hoặc không phải Windows, thì dùng mã mặc định như trước và có hướng dẫn trong thông báo.",
    ]),
    ("2.5.4", [
        "🧹 Hộp thoại hỏi cập nhật nay có ô chọn «Xóa bản cũ sau khi chuyển sang bản mới» ngay lúc bạn đồng ý tải (hiện cả ở hộp thoại báo bản mới lúc mở ứng dụng, lúc bấm «Tải và cài bản mới» và lúc bản mới đã tải xong). Bật = bản đang dùng bị xóa khi bản mới mở lên; tắt = giữ bản cũ để quay lại. Dữ liệu, mô hình đã tải và cài đặt dùng chung nên không mất. Lựa chọn được nhớ cho lần sau. Cập nhật bằng Setup.exe (cài đè) thì không có ô này.",
    ]),
    ("2.5.3", [
        "🔄 Tự cập nhật qua Cloudflare R2: địa chỉ cập nhật đã được ghi sẵn trong chương trình. Mỗi lần tác giả đưa bản mới lên, người dùng mở ứng dụng sẽ được báo và cập nhật (tab «Cập nhật phần mềm»); dữ liệu và mô hình đã tải được giữ nguyên.",
        "🔐 Bản cập nhật phải có CHỮ KÝ của tác giả (cùng khóa với key bản quyền). Tệp update.json không có chữ ký, ký sai hoặc bị sửa thì ứng dụng từ chối — nên dù ai chiếm được chỗ đặt tệp cũng không đẩy được bản giả. Tác giả ký bằng ky_update.bat trong bộ KeyTool.",
        "Kiểm tra bản mới luôn hỏi máy chủ bản mới nhất, không dùng bản update.json cũ nằm trong bộ nhớ đệm của CDN / proxy.",
    ]),
    ("2.5.2", [
        "🗣 Trình đọc văn bản · Ninh Đôn VieNeu: danh sách giọng có sẵn (Adam bựa, Trúc Ly, Thiện Minh, Mai Anh, Hải Đăng…) nay hiện ĐẦY ĐỦ ngay khi mở ứng dụng, không cần bấm tải model trước. Danh sách được lưu lại sau lần tải model (giống danh sách giọng Azure); máy chưa có danh sách mà đã cài môi trường thì tự tải model một lần khi mở ứng dụng để lấy đủ giọng.",
        "Sửa lỗi «Voice '⭐ Adam bựa — Nam · Bắc…' not found. Available: […]» khi đọc bằng giọng có sẵn của VieNeu: trước đây gửi nhãn hiển thị cho thư viện, nay gửi đúng ID giọng.",
    ]),
    ("2.5.1", [
        "🗣 Tab «Ninh Đôn TTS» đổi tên thành «Trình đọc văn bản» và có BA NGUỒN GIỌNG (nút chọn ở mục 1): «Ninh Đôn · VieNeu (offline)» = giọng Ninh Đôn của bạn chạy ngay trên máy như trước (vẫn thêm được giọng từ file WAV); «Microsoft online» = giọng Microsoft Edge (Hoài My, Nam Minh, giọng tiếng Anh…) miễn phí, không cần key, cần Internet; «Azure TTS V1» = giọng Azure Speech (nhập key + vùng, bấm «Kiểm tra & lưu» để tải danh sách giọng của tài khoản). Văn bản được chia đoạn, nghỉ giữa câu / khi xuống dòng, thẻ [nghỉ Xs], tốc độ, xuất MP3 và đặt tên file như cũ cho cả ba nguồn. Thẻ cảm xúc [cười] [thở dài] [hắng giọng] chỉ dùng được với VieNeu nên bị ẩn / bỏ khi đọc bằng Microsoft hoặc Azure.",
        "Giọng Microsoft online: luôn dùng ĐÚNG giọng bạn chọn (không tự đổi giọng). Microsoft chập chờn («No audio was received») thì thử lại, thử đọc từng câu ngắn, rồi tự CHỜ 15 / 30 / 60 / 90 giây và làm tiếp đoạn đó — các đoạn đã đọc xong vẫn nằm trong file, không đọc lại; lỗi 403 (Microsoft đổi cách ký) thì tự tải thư viện edge-tts mới nhất từ PyPI (kiểm tra sha256) rồi đọc lại, không cần build lại. Nút «🔬 Thử nhanh Microsoft» thử từng giọng 1 câu; nút «⟳ Cập nhật edge-tts» cập nhật ngay.",
        "Đã BỎ hai giọng mẫu Adam và Tùng Đặng (giữ giọng Ninh Đôn). Giọng bạn tự thêm từ file WAV không bị đụng tới; bản sao Adam / Tùng Đặng cũ trong thư mục dữ liệu được dọn đi.",
        "🧩 2 nút MỚI ở mục 4 (làm SAU khi căn chỉnh và kiểm tra trong CapCut) cho CapCut xuất nhẹ hơn: «🎵 Chỉ gộp audio» = GIỌNG TTS → 1 clip mp3 (nhanh, vài giây–vài phút): trộn hết các câu đúng vị trí / tốc độ / cao độ / âm lượng từng câu bằng ffmpeg rồi thay hàng trăm clip bằng 1 clip, track phụ _L2, _L3 được bỏ; «🧩 Gộp video + audio» = làm thêm VIDEO chính → 1 clip mp4: render lại từng mảnh đã cắt / làm chậm, nối lại, thêm tiếng — khung hình và tiếng khớp đúng khung, chỗ trống giữa các đoạn lấp bằng hình đen, tốc độ + âm lượng từng mảnh được nướng vào file (lâu và tốn ổ đĩa, có kiểm tra chỗ trống trước). Có hộp xác nhận kèm cảnh báo (hiệu ứng giọng CapCut gắn trên từng clip sẽ MẤT, chưa căn chỉnh thì gộp xong không căn chỉnh được nữa, keyframe / chuyển cảnh mất). Luôn sao lưu; nút «↩ Hoàn tác gộp» khôi phục project như trước khi gộp (file đã gộp vẫn còn trên đĩa); huy giữa chừng thì project không bị đụng tới; «Xóa TTS» vẫn dọn được track giọng đã gộp.",
        "Che sub cũ: Blur nay là CLIP HIỆU ỨNG THẬT trên TRACK HIỆU ỨNG của CapCut (mặc định) — không còn bản sao video + mặt nạ nằm ở track video nữa, nên kéo dài / ngắn, đổi độ mờ, đổi hiệu ứng ngay trong CapCut như mọi hiệu ứng khác. Lưu ý: hiệu ứng ở track hiệu ứng làm mờ CẢ khung hình trong đoạn đó (CapCut không có mặt nạ vùng cho track hiệu ứng) — muốn giới hạn vùng thì chỉnh trong CapCut. Hộp «✨ Hiệu ứng mờ…» có mục «0. Đặt hiệu ứng ở đâu» để chọn lại kiểu cũ (clip video + mặt nạ, chỉ mờ dải sub nhưng nằm ở track video). Vẫn MỘT clip liền, căn chỉnh chỉ kéo dài theo timeline mới.",
        "Sửa lỗi dòng «RAM đang dùng» ở góc dưới thanh bên luôn hiện 0 MB trên Windows 64 bit (gọi hàm đo RAM của Windows không khai báo kiểu dữ liệu nên bị hỏng giá trị handle). Nay đọc đúng RAM của chương trình; nếu Windows không trả về thì ẩn dòng thay vì hiện số 0 sai. Nút «Giải phóng RAM» cũng dùng cách gọi đúng.",
    ]),
    ("2.5.0", [
        "📄 Tab Tải video: nút «Nhập tệp .txt» (và «Mở tệp .txt…» trong hộp Hàng loạt) — tệp có sẵn tên và link theo thứ tự. Nhận các kiểu dòng: «1 : link», «t1: link», «Tập 1: link», «Tên | link», «link | Tên», hoặc dòng tên rồi dòng link ngay dưới. Tên video đặt ĐÚNG như trong tệp; nếu mọi dòng đều có STT (1, 2, t3, Tập 4…) mà tệp xếp lộn xộn thì tự xếp lại theo STT tăng dần. Đọc được tệp UTF-8 / UTF-16 / ANSI tiếng Việt.",
        "Lấy sub Jianying/CapCut + Quét hardsub — xuất video đổi tốc độ: thêm ô chọn «Khung/giây video xuất ra» (danh sách có sẵn, không gõ số): Giữ nguyên fps gốc (mặc định; nén lại hình, chậm hơn, độ phân giải vẫn như gốc), Nhanh (không nén lại — kết quả rất nhanh nhưng fps giảm theo tốc độ, vd 30 fps × 0.7 ≈ 21 fps), hoặc 24 / 25 / 30 / 50 / 60 fps.",
        "Nút «▶ Chạy thử tốc độ này» ở mục Tốc độ video: cắt ~15 giây giữa video, đổi đúng tốc độ / cao độ / fps đang chọn rồi mở bằng trình phát để nghe, ưng rồi mới Lấy phụ đề + xuất cả video. Chưa lấy sub, chưa xuất video.",
        "Tab Lồng tiếng CapCut: ô Tốc độ và Vol (dB) (giọng đọc + video gốc) có NÚT mũi tên ▲ ▼ bấm được (vẫn gõ số hoặc dùng phím ↑ ↓ như cũ).",
        "🎯 Tự Căn Chỉnh Audio: bấm là chạy luôn, KHÔNG hỏi gì nữa. Nhanh hơn rất nhiều với video dài 7–8 giờ: chỉ đọc sóng âm QUANH các câu cần cắt (không đọc cả video), chạy song song bằng mọi nhân CPU, các file draft của project dùng chung một lần đọc; bỏ các bước chậm theo bình phương số câu. Vẫn dò điểm cắt ở chỗ yên của sóng âm.",
        "Chèn chữ + che sub cũ: lớp Blur là hiệu ứng làm mờ của CapCut (mặt nạ chữ nhật tại vùng đã chọn), nằm DƯới chữ phụ đề; đã BỎ HẲN thanh nền đen (blur lỗi thì báo rõ lý do, không tự đổi sang thanh đen). Sau căn chỉnh lớp blur được cắt + làm chậm khớp y như video chính; chưa vừa thì kéo dài / ngắn / đổi vị trí tự do trong CapCut. SRT luôn được viết lại sạch trước khi chèn nên phụ đề không còn bị mất cả track vì một dòng lạ.",
        "Che sub cũ: thanh blur là MỘT THANH LIỀN (không cắt theo từng đoạn video nữa) — 🎯 Tự Căn Chỉnh chỉ kéo dài thanh theo timeline mới. LƯU Ý: thanh chạy đều suốt timeline nên sau căn chỉnh, hình bên trong dải mờ có thể lệch vài giây so với cảnh đang chiếu (ít lộ vì đã mờ). Nút MỚI «✨ Hiệu ứng mờ…»: chọn hiệu ứng (Mờ cơ bản, Mất nét, Mờ ảo, Mờ dọc / chéo / chuyển động…) + ĐỘ MỜ 0–100; nút «⬇ Tải» tạo project nhỏ «AutoStudio_TaiMo» để CapCut tự tải hiệu ứng về máy khi mở; nút «🔎 Tìm trong project CapCut của tôi» lấy ĐÚNG hiệu ứng «Mờ» bạn đã tự gắn trong CapCut (mã hiệu ứng đúng máy bạn) để dùng cho thanh che sub.",
        "🎯 Tự Căn Chỉnh: PHỤ ĐỀ nay bắt đầu ĐÚNG lúc giọng đọc của câu đó bắt đầu (trước đây chữ chỉ theo bản đồ thời gian của video nên có câu chạy trước giọng và hình, nhất là chỗ video bị làm chậm nhiều hoặc điểm cắt dời sang chỗ yên của sóng âm); chữ kéo dài tới hết giọng đọc, không đè lên dòng sau. Thông báo xong cũng ghi bao nhiêu điểm cắt khớp sóng âm.",
        "Nút «💾 Lưu cấu hình» ở chân trang (luôn thấy): bấm là ghi NGAY toàn bộ cài đặt (tab Lồng tiếng + Dịch / Lấy sub), nút đổi thành «✓ Đã lưu» và dòng trạng thái ghi giờ lưu.",
        "Cao độ: tick «Đổi cao độ» nay được ghi THẲNG vào project (cờ «Thay đổi cao độ âm thanh» = is_tone_modify của từng clip đổi tốc độ), không phụ thuộc bản pycapcut có nhận tham số change_pitch hay không. Nút «🔍 Kiểm tra» cạnh ô đó đọc lại project đang chọn: đếm clip BẬT / TẮT, và nếu bạn bật tay 1 clip trong CapCut thì in ra các trường khác nhau để đối chiếu.",
        "Soi SRT ngay khi thêm tệp: báo SỐ DÒNG cụ thể của dòng trống chen giữa giờ/chữ (chữ bên dưới được gộp vào câu, không bỏ), hai câu dính nhau (giờ nằm giữa — tự tách), câu không có chữ / chỉ có dấu như «...», giờ hỏng, giờ chồng nhau.",
        "Tab Dịch phụ đề, tick «Chạy nền (thu nhỏ cửa sổ)»: cửa sổ trình duyệt luôn được giữ thu nhỏ xuống taskbar — mỗi lượt tải lại trang, mở tab mới hay tự hiện lại đều bị thu nhỏ lại ngay (riêng lúc cần đăng nhập thì tạm hiện để bạn đăng nhập).",
    ]),
    ("2.2.5", [
        "Tạo giọng theo SRT: mỗi câu được đặt ĐÚNG mốc bắt đầu trong SRT, KHÔNG đẩy lùi nữa. Câu đọc dài hơn khung thì chồng lên câu sau và tự xếp sang track phụ trong CapCut (TTS_CapCut, TTS_CapCut_L2, _L3…) — 2, 3 dòng audio như khi tự kéo trong CapCut. 🎯 Tự Căn Chỉnh và 🗑 Xóa TTS đọc được cả các track phụ này.",
        "Cao độ: bỏ thanh trượt «Cao độ giọng (bán cung)», chỉ còn tick «Đổi cao độ» giống bảng CapCut. Bỏ ô «Cách tối thiểu giữa 2 câu» (không còn đẩy câu).",
    ]),
    ("2.2.4", [
        "🧹 Nút MỚI «Dọn audio TTS (sau khi xuất video xong)» ở tab Lồng tiếng CapCut: xóa các thư mục mp3 nguồn của project đang chọn + thư mục «(Auto Studio) (2), (3)…» rỗng cho nhẹ máy. Có hỏi xác nhận, không đụng vào project; CapCut đang mở thì hỏi lại (mặc định Không). Lần tạo giọng bị hủy/lỗi giữa chừng tự xóa thư mục dở, không còn để lại thư mục rỗng.",
        "SmartCut: sửa lỗi «Không chạy được phần nghe giọng … silero_vad_v6.onnx … File doesn't exist» (bản cài thiếu file dữ liệu của faster-whisper). build.bat đóng gói kèm file đó; nếu bản cài vẫn thiếu thì tự nghe không lọc im lặng thay vì báo lỗi (không còn báo nhầm «GPU lỗi»).",
        "Lấy sub Jianying/CapCut: sửa lỗi gửi file lên bị hết giờ (file được gửi từng khối nhỏ nên mạng upload chậm không còn cắt ngang), tự chia đôi đoạn dài rồi gửi lại khi mạng yếu, tự giảm số luồng gửi khi mạng chập chờn, và dừng sớm kèm lời giải thích khi một đoạn bắt buộc không nhận dạng được.",
        "Lấy sub nhanh hơn: video dài trên 1 giờ mặc định BỎ lượt 2 quét lại cả video (nhanh gấp đôi; đối chiếu tiếng thoại + nghe lại chỗ nghi sót vẫn chạy). Muốn quét kỹ cả video dài: tick «Video dài trên 1 giờ vẫn quét lượt 2». Số luồng gửi song song mặc định 3 → 4.",
        "Quét hardsub (OCR) nhanh hơn: chỉnh cấu hình nhận dạng của RapidOCR, tự tăng số luồng/lát video theo CPU, giải mã video nhanh hơn, và hiện thống kê OCR trực tiếp trên thanh tiến độ.",
        "Chỉ mở được MỘT cửa sổ Auto Studio: bấm mở lần nữa thì đưa cửa sổ đang chạy lên trước (hoặc báo «đang mở rồi»). Khởi động lại sau cập nhật vẫn hoạt động bình thường.",
    ]),
    ("2.2.3", [
        "🎯 Tự Căn Chỉnh Audio — MẶC ĐỊNH KHỚP ĐÚNG, giọng không lệch hình: câu nào giọng TTS đọc lấn sang câu sau thì cắt từ đầu câu đó đến đầu câu liền kề rồi làm chậm video cho dài đúng bằng giọng đã đọc; câu không lấn giữ nguyên. Giọng chỉ lệch hình tối đa vài chục phần nghìn giây.",
        "Mặc định mới: «Cho giọng trễ tối đa» = 0 (trước là 0.8) và «Video chậm nhất» = 0.1 (sàn của CapCut; trước là 0.5). Mỗi câu chỉ chậm vừa đủ khớp giọng (giọng dài hơn khung 10% thì video chỉ còn ~0.91x). Cài đặt cũ còn ở 0.8 / 0.5 tự chuyển sang mức mới; ô trễ vẫn chỉnh được cho video nào muốn ÍT chỗ cắt hơn (chấp nhận giọng lệch tới chừng đó giây).",
        "Tự Căn Chỉnh chỉ chỉnh tốc độ VIDEO: audio TTS (tốc độ, âm lượng, cao độ) và âm lượng video giữ nguyên đúng cấu hình đã chọn lúc tạo giọng.",
        "Che sub cũ: kiểu mặc định là BLUR (làm mờ), đứng đầu danh sách; thanh nền đen xếp sau. Cài đặt cũ đang để thanh nền (khi che sub đang tắt) tự chuyển sang Blur.",
        "Tab «Lấy sub Jianying / CapCut» và «Quét hardsub»: ô «Tốc độ video» làm giống bảng CapCut — ô số có mũi tên ↑ ↓ (nhích 0.1), khoảng 0.1–100× (trước là 0.05–4×), thêm tick «Đổi cao độ» (tắt = giữ cao độ tiếng như trước; bật = tiếng đổi cao độ theo tốc độ). Mặc định vẫn 1.00× (giữ nguyên).",
    ]),
    ("2.2.2", [
        "🎚 Mục «Giọng đọc» làm GIỐNG BẢNG CỦA CAPCUT: hàng «Audio giọng đọc» có Tốc độ + Vol (dB) + «Đổi cao độ», hàng «Video gốc» có Vol (dB). Gõ số hoặc bấm ↑ ↓ trong ô.",
        "SỬA LỖI: Tốc độ và âm lượng giờ được ĐẶT THẲNG lên từng clip audio TTS trong CapCut (clip hiện đúng “1.20x”, âm lượng theo dB, tick «Thay đổi cao độ âm thanh» theo công tắc «Đổi cao độ»). Trước đây tốc độ làm ngầm trong file nên CapCut vẫn hiện 1.0x, còn thanh âm lượng % (120% chỉ là +1.6 dB) nghe gần như không đổi. File giọng giữ nguyên tốc độ gốc nên sửa lại ngay được trong CapCut.",
        "Tốc độ đặt trên clip cần «Mỗi câu 1 đoạn riêng» (mặc định bật) và cách làm «Chèn vào project» / «Tạo project mới». Xuất file audio hoặc tắt tách từng câu thì tốc độ vẫn được áp vào file như trước.",
        "Hai thanh % âm lượng cũ được đổi thành ô dB: cài đặt cũ tự quy đổi (120% → +1.6 dB, 65% → -3.7 dB). Vol video gốc 0 dB = giữ nguyên. Tối đa +15.9 dB như CapCut. Video gốc chỉ đổi âm lượng, KHÔNG đổi tốc độ.",
    ]),
    ("2.2.1", [
        "🎯 Tự Căn Chỉnh Audio — CẮT ÍT HƠN NHIỀU: chỉ làm chậm video ở chỗ giọng TTS đọc LẤN sang câu sau; câu nào vừa khung (hoặc chỉ lấn nhẹ trong mức cho phép) thì giữ nguyên video, không cắt. Các chỗ lấn gần nhau được GOM thành ít đoạn làm chậm đều thay vì cắt từng câu (dự án ~400 câu: từ hơn 500 chỗ cắt xuống còn vài chục hoặc ít hơn). Tổng thời gian kéo thêm không vượt cách cắt từng câu.",
        "Ô mới «Cho giọng trễ tối đa (giây)» (mặc định 0.8) ở mục 4: giọng đọc được bắt đầu trễ tối đa chừng này so với khung hình của câu. Số lớn = ít chỗ cắt hơn; 0 = cắt sát từng câu như bản cũ. Audio TTS vẫn KHÔNG bị sửa (chỉ đổi chỗ).",
        "Tự Căn Chỉnh KHÔNG còn tự đổi âm lượng video gốc: giữ đúng mức đã chọn lúc chèn TTS (thanh «Âm lượng video gốc» chỉ áp khi chèn vào project).",
    ]),
    ("2.2.0", [
        "MỚI tab «🎨 Giao diện» (nhóm HỆ THỐNG): chọn MÀU NHẤN (8 màu có sẵn hoặc màu tùy ý), MÀU NỀN (nền tối: 6 màu có sẵn hoặc tùy ý), ĐỘ BO GÓC nút 0–22 px, CỠ CHỮ 85–120%. Hình xem trước đổi NGAY khi chọn; bấm «Áp dụng và khởi động lại» để dùng, «Về mặc định» để trả lại như cũ. Các màu khung / viền / nút phụ tự tính theo nền và màu nhấn; nền chọn quá sáng hoặc màu nhấn quá tối thì tự chỉnh để chữ vẫn đọc được. Cài đặt lưu ở ~/AutoStudioData/theme.json (xóa tệp = về mặc định). Bo góc áp dụng cho nút bấm và thanh chọn; khung thẻ và ô nhập giữ nguyên.",
        "Bấm X (đóng cửa sổ) nay hiện hộp thoại «Thoát hẳn / Thu nhỏ / Ở lại». «Thoát hẳn» dừng mọi việc, tắt SẠCH các tiến trình con (ffmpeg, trình duyệt riêng, tải xuống…) rồi thoát cứng, có đồng hồ chốt 12 giây — không còn treo hay chạy ẩn trong máy. Hộp thoại liệt kê các việc đang chạy sẽ bị dừng.",
        "Lấy sub Jianying / CapCut NHANH hơn: các đoạn âm thanh (lượt 1, lượt 2, các lượt nghe lại) được gửi SONG SONG (mặc định 3 luồng, chỉnh bằng «workers»), mỗi luồng một kết nối riêng; âm thanh chỉ giải mã MỘT lần rồi dùng chung cho cắt đoạn, tìm khoảng lặng và đối chiếu tiếng thoại; hỏi kết quả thích ứng thay vì chờ cố định. Dừng giữa chừng / lỗi liên tiếp vẫn dừng nhanh.",
        "Quét hardsub (OCR) NHANH hơn: (1) quét NHIỀU ĐOẠN video cùng lúc khi máy từ 6 nhân trở lên (máy 2–4 nhân vẫn quét 1 luồng); (2) khung gần như không có điểm sáng được bỏ qua ngay, khỏi tính viền đen; (3) mỗi dòng chữ chỉ OCR 1 khung nếu đã đọc chắc (độ tin cậy ≥ 0,94), chữ mờ / khó vẫn OCR 3 khung rồi bỏ phiếu như cũ; (4) tùy chọn mới «Đọc kỹ» (luôn bỏ phiếu 3 khung) và «Giải mã bằng card đồ họa» (thử -hwaccel, không được thì tự quay về CPU). Báo cáo thống kê ghi rõ quét song song mấy đoạn.",
        "Trang «Ủng hộ tác giả» chỉ hiện «Tên tài khoản» và «Ngân hàng: BIDV» (bỏ số tài khoản và PGD); nút «Sao chép STK» vẫn còn, mã QR giữ nguyên.",
    ]),
    ("2.1.8", [
        "Tab «Lấy sub Jianying / CapCut» — QUÉT LẠI NHIỀU LƯỢT để không thiếu câu: (1) lượt 1 như cũ; (2) MỚI «lượt 2»: quét lại TOÀN BỘ video bằng các đoạn ngắn ~4 phút, lọc âm thanh khác và cắt lệch mốc, chỉ bổ sung câu lượt 1 bỏ sót (ô tick, mặc định bật); (3) đối chiếu tiếng thoại rồi NGHE LẠI chỗ có tiếng mà chưa có chữ tới 3 lượt với 3 kiểu âm thanh khác nhau: khuếch đại mạnh → âm gốc không lọc → phát chậm 0.8× (mốc giờ tự quy về đúng video). Dừng ngay khi không còn chỗ nghi sót.",
        "Đoạn nghe lại nay có thêm NGỮ CẢNH ~4 giây mỗi bên và dài tối thiểu 16 giây (trước đây chỉ gửi đoạn rất ngắn nên máy chủ hay trả rỗng); bỏ giới hạn 24 đoạn / 4 phút (tới 200 đoạn nghi sót mỗi lượt, ưu tiên đoạn dài nhất, thời gian tự co giãn); đối chiếu nhạy hơn (bắt cả câu ngắn từ 0.5 giây, khoảng trống từ 1 giây). Máy chủ lỗi liên tục thì dừng sớm, vẫn lưu SRT đã có. Báo cáo «.kiểm tra sub.txt» ghi kết quả từng lượt.",
        "ICON MỚI: nền tím than bóng kính, sóng âm gradient cyan → tím → hồng phát sáng và 2 dòng phụ đề; các cỡ nhỏ (16/24/32) dùng bản đơn giản để vẫn rõ trên thanh tác vụ.",
    ]),
    ("2.1.7", [
        "TÁCH RIÊNG thành 2 tab: «🎧 Lấy sub Jianying / CapCut» (nghe giọng nói qua máy chủ Jianying mặc định, tự chuyển CapCut nếu lỗi) và «🎞 Quét hardsub (OCR)» (quét chữ in sẵn trên hình, chạy ngay trên máy). Mỗi tab có cấu hình riêng, không còn nút chọn cách lấy ở giữa tab nữa.",
        "Cả 2 tab đều giữ: ô «Tốc độ video» giảm HOẶC tăng (0.05–4×), SRT lưu NGAY CẠNH video với TÊN VIDEO GỐC, mốc giờ khớp video đã đổi tốc độ, tùy chọn xuất luôn video đã đổi tốc độ. Tab Jianying / CapCut không hiện khung chọn vùng chữ (không cần); tab Quét hardsub không có phần máy chủ / ngôn ngữ.",
        "Tab mới «Lấy sub Jianying / CapCut» cũng nằm trong nhóm cần bản quyền (cùng 7 công cụ). Cấu hình cũ của tab «Lấy sub từ video» vẫn dùng tiếp cho tab «Quét hardsub (OCR)». Không đụng tới tab Lồng tiếng / TTS.",
    ]),
    ("2.1.6", [
        "Tab «Lấy sub từ video» — MỚI: lấy phụ đề bằng cách NGHE GIỌNG NÓI qua máy chủ nhận dạng của Jianying (mặc định) hoặc CapCut (tự chuyển sang máy chủ kia nếu một bên lỗi). Nhanh hơn quét chữ rất nhiều, mốc thời gian theo đúng lời nói. Video dài tự chia đoạn ~15 phút (cắt ở chỗ im lặng). Âm thanh được làm sạch trước khi gửi (kéo giọng nhỏ lên, giảm ồn nền), rồi đối chiếu với tiếng thoại: chỗ có tiếng mà chưa có chữ thì app nghe lại riêng với âm lượng khuếch đại mạnh hơn, chỗ nào vẫn không ra thì ghi vào báo cáo. LƯU Ý: âm thanh được gửi lên máy chủ của ByteDance (app hỏi đồng ý 1 lần), đây là cách không chính thức nên có thể bị đổi/chặn — khi đó dùng chế độ quét chữ trên hình như cũ.",
        "MỚI: ô «Tốc độ video» (giảm HOẶC tăng, gõ số tùy ý 0.05–4, có gợi ý 0.9 → 0.1 và 1.1 → 4). Video gốc nói quá nhanh thì giảm trước (vd 0.8×, 0.5×, 0.1×): mốc giờ trong SRT được quy về video đã đổi tốc độ nên đọc TTS xong khớp luôn. SRT vẫn lưu CẠNH video, ĐÚNG TÊN video gốc; tuỳ chọn xuất luôn video đã đổi tốc độ (<tên>_0.8x.mp4): giảm tốc không nén lại hình nên xong trong vài phút kể cả video 2 giờ, tăng tốc thì nén lại.",
        "Quét chữ trên hình (OCR) nhanh hơn trên video dài / nền nhiễu: chỉ tính điểm sáng đứng yên qua 3 khung liên tiếp (vật sáng chạy qua vùng sub không còn làm vỡ chữ thành hàng trăm đoạn cần OCR), thu nhỏ ảnh 4K trước khi OCR, bước quét lại kỹ chạy song song, hiện «còn khoảng … phút» ngay trên thanh tiến trình và dòng thống kê OCR trong nhật ký/báo cáo. Khi quét lại chỗ thiếu mà thấy cùng câu thì kéo dài mốc giờ của câu đó thay vì bỏ qua (sửa cả trường hợp mất đoạn cuối câu); khoảng ≥ 1,2 giây có tiếng mà không có chữ giữa 2 câu cũng được quét lại.",
        "Không đụng tới tab Lồng tiếng / TTS. (Tab TTS lưu cấu hình TỰ ĐỘNG: 15 giây một lần, khi bấm chạy và khi đóng app.)",
    ]),
    ("2.1.5", [
        "Hiệu ứng giọng: bộ lọc «Ngọt ngào» của CapCut (đối chiếu bằng project thật: mã tài nguyên khớp hiệu ứng 小甜甜 trong pycapcut) nay hiện đúng tên «Ngọt ngào» ở ô «Bộ lọc giọng» (bản 2.1.4 xếp nhầm vào «Giọng đọc» với tên «Cô bé ngọt ngào»).",
    ]),
    ("2.1.4", [
        "Hiệu ứng giọng (áp lên audio ĐÃ ĐỌC XONG, không phải chọn giọng để đọc): tên hiển thị bằng TIẾNG VIỆT (trước đây toàn tiếng Anh / tiếng Trung), gõ không dấu vẫn tìm được; tên giữ khớp chữ CapCut tiếng Việt với các mục đã đối chiếu (Giọng nam khó tính, Yêu tinh, Đứa trẻ, Từ tính, Sóc chuột, Phát thanh viên, Heli, Thiếu niên, Tiếng vang, Mic bị vỡ…), các mục còn lại là bản dịch của Auto Studio nên có thể khác chữ CapCut đôi chút (hiệu ứng áp vào project vẫn đúng theo mã, không theo tên).",
        "Tách 2 ô giống 2 tab của CapCut: «Bộ lọc giọng» (vang phòng, mic, điện thoại, radio…) và «Giọng đọc» (giọng nhân vật: nam / nữ / trẻ em / phù thủy / robot…). Lưu ý: thư viện pycapcut chỉ cho gắn 1 hiệu ứng MỖI LOẠI vào 1 đoạn audio; hầu hết giọng nhân vật cùng loại với bộ lọc nên chọn cả 2 ô thì chỉ gắn được cái ở «Giọng đọc» (có dòng cảnh báo màu cam ngay dưới).",
    ]),
    ("2.1.3", [
        "Lồng tiếng CapCut: «Tạo giọng» CHỈ đọc ra đúng cấu hình ở mục Giọng đọc — KHÔNG còn tự tăng tốc audio nữa (trước đây khi câu dài hơn khung thoại, tool tự tăng tốc audio TTS tới 1,35× nên giọng bị méo; đã bỏ hẳn ô «Tăng tốc tối đa»). Câu nào đọc dài hơn khung thì bấm 🎯 Tự Căn Chỉnh: tool CẮT và LÀM CHẬM VIDEO cho khớp với giọng đọc; audio TTS giữ y nguyên như lúc đọc ra (chỉ dời vị trí), các câu không đè nhau. Bỏ bước tăng tốc cũng làm tạo giọng nhanh hơn (đo trên máy chủ giả: ~13% khi phần lớn câu dài hơn khung).",
        "MỚI: thanh «Âm lượng giọng đọc» và «Âm lượng video gốc» (0–200%, 100% = giữ nguyên) ở mục 3. Giọng đọc áp cho các đoạn audio chèn vào project; video gốc áp khi chèn vào project có sẵn và cả khi bấm 🎯 Tự Căn Chỉnh (đoạn video bị làm chậm kéo theo tiếng gốc chậm / méo nên nên hạ thấp hoặc tắt tiếng gốc). Có sao lưu project trước khi sửa.",
    ]),
    ("2.1.1", [
        "Tab «Lồng tiếng CapCut», mục Giọng đọc: thêm ô «Bộ lọc giọng» và «Nhân vật giọng» (hiệu ứng giọng của CapCut, giống phần giọng nói – bộ lọc trong CapCut). Danh sách được QUÉT từ thư viện pycapcut đang cài (gõ chữ để lọc, ★ = cần CapCut Pro). Hiệu ứng được gắn vào từng đoạn giọng khi chèn vào project / tạo project mới và CapCut tự áp khi mở project (cần mạng lần đầu). Chọn «Không» để giữ giọng gốc. Bản pycapcut chưa có danh sách thì mục này tự ẩn. «Nghe thử» và xuất file audio chưa có hiệu ứng.",
    ]),
    ("2.1.0", [
        "BẢN QUYỀN bằng key: tab MỚI «🔑 Bản quyền» (thanh bên). Dùng thử 3 ngày kể từ lần mở đầu tiên, hết thời gian dùng thử thì 6 công cụ (Lồng tiếng CapCut, Dịch phụ đề, Lấy sub, Ninh Đôn TTS, SmartCut, Tải video) cần key mới mở được; «Tải dữ liệu», «Cập nhật», «Dữ liệu & sao lưu», «Ủng hộ» luôn dùng được.",
        "Key gắn với 1 máy (mã máy 16 ký tự hiện trong tab Bản quyền), có hạn tháng / 3 tháng / năm hoặc vĩnh viễn; gia hạn bằng cách nhập key mới. Kiểm tra OFFLINE bằng chữ ký số Ed25519 — chương trình chỉ chứa khoá công khai nên không ai tự tạo được key. Tác giả cấp key bằng công cụ riêng (AutoStudio_KeyTool: tao_key.bat). Thanh bên hiện thời hạn còn lại; chỉnh đồng hồ máy lùi để kéo dài hạn bị chặn (trừ key vĩnh viễn).",
    ]),
    ("2.0.3", [
        "Thanh bên có mục MỚI «☕ Ủng hộ tác giả»: hiện mã QR VietQR + thông tin tài khoản (TRIEU VAN TINH · 3950588072 · BIDV - PGD Chợ Đồn) để ai muốn ủng hộ thì quét mã; có nút «Sao chép STK» và «Lưu ảnh QR». Hoàn toàn tự nguyện, không ảnh hưởng chức năng nào của chương trình.",
    ]),
    ("2.0.2", [
        "Tab MỚI «Tải video» (thanh bên, nhóm CÔNG CỤ): gắn công cụ YT Downloader vào Auto Studio — cùng cửa sổ, cùng giao diện, dùng chung ffmpeg. Dán link YouTube / Douyin / TikTok / Bilibili… (nhiều link, link playlist tự tách từng video, «Hàng loạt» đánh số tập theo mẫu tên, nhận dòng «link<TAB>tên tập» từ extension), tải bằng yt-dlp: thẻ từng video có tiến độ / tốc độ / thời gian còn lại, tạm dừng – tiếp tục (giữ phần đã tải), tự thử lại tối đa 5 lần, tải song song 1…50 hoặc không giới hạn, bảng «Tổng quan» có bộ lọc + «Thử lại các mục lỗi».",
        "Tăng tốc «Nhanh» / «Tối đa» (tải nhiều mảnh đồng thời) hoặc «Siêu tốc» bằng aria2c 16 kết nối. Cookie: quét từ trình duyệt, dán tay hoặc nạp file cookies.txt. Douyin: tải thẳng từ trang chia sẻ (không cần chữ ký), hoặc dùng link tải trực tiếp từ extension.",
        "Tab «Tải dữ liệu cần thiết» có thêm nhóm «Tải video»: Deno (giải mã link YouTube cho yt-dlp, ~45 MB) và aria2c (~2 MB) — tải một lần, dùng chung, không cần khởi động lại. yt-dlp được biên dịch sẵn vào chương trình; build.bat tự cập nhật yt-dlp bản mới nhất mỗi lần build (YouTube hay đổi cơ chế). Tự kiểm tra (--selftest) tải thử một tệp bằng yt-dlp ngay trong bản build.",
    ]),
    ("2.0.1", [
        "TTS CapCut NHANH hơn rất nhiều: gửi TẤT CẢ câu một lượt (không còn chờ từng câu), hỏi kết quả sau 0,1–0,5 giây (cũ: cố định 0,8 giây), số luồng tự tăng khi CapCut trả lời ổn định và tự giảm khi bị giới hạn. Tự thử gửi NHIỀU CÂU MỖI LẦN; chỉ dùng khi tự kiểm chứng audio trả về đúng thứ tự (sai / không hỗ trợ thì tự quay về gửi từng câu song song). Cùng một câu không bao giờ gửi hai lần.",
        "Bỏ hai ô «Gọi song song» và «Mỗi lần gửi tối đa (ký tự)» — không cần chọn nữa, tool tự chỉnh (giống tool cũ).",
        "Giải mã, tăng tốc và ghi từng câu chạy hàng loạt: một ffmpeg làm cả nhóm file, nhiều tiến trình song song theo số nhân CPU, cắt lặng bằng numpy, ghi file ghép song song với ghi từng câu; lặp lại cũng dùng cache nên đọc lại gần như tức thì. Có đo thời gian trong bao_cao.txt.",
        "Tab Dịch: bỏ nút «Dịch thử 5 dòng đầu»; thêm «Dịch lại câu còn sót» — tự quét các câu còn chữ Trung / chưa có bản dịch / chưa đạt, TỰ TÍCH CHỌN chúng trong bảng rồi gửi dịch lại riêng đúng những câu đó (kèm ngữ cảnh + yêu cầu không để sót chữ Trung), ghép vào bản dịch và tự lưu lại. Không đụng dòng bạn đã sửa tay; lần gửi lại hỏng thì giữ bản cũ.",
    ]),
    ("2.0.0", [
        "GỘP thành MỘT chương trình, thanh bên trái có 5 tab riêng: Lồng tiếng CapCut · Dịch phụ đề SRT · Lấy sub từ video · Ninh Đôn TTS · SmartCut (cùng giao diện, cùng cửa sổ; mỗi tab chỉ nạp khi bấm vào lần đầu nên máy vẫn nhẹ). Muốn thêm công cụ mới (vd tạo video AI) chỉ cần thêm 1 dòng vào tabs.py.",
        "Tab SmartCut (cắt video thông minh): thêm nhiều video → «Cắt đều theo thời lượng» (nhận diện cảnh, chọn khung đẹp, chia đều video dài/ngắn) hoặc «Cắt theo lời review» (nghe giọng review, khớp từng câu với cảnh) → tạo project CapCut hoặc xuất mp4 rời. Dùng chung ffmpeg; dữ liệu AI vẫn ở ~/SmartCutData (tải 1 lần, dùng chung với SmartCut bản riêng).",
        "SmartCut nhanh hơn nhiều: nghe giọng ưu tiên GPU NVIDIA — máy có card mà thiếu thư viện CUDA thì được HỎI TẢI NGAY TRONG APP (máy không có card tự chạy CPU, có ghi rõ đang GPU hay CPU); giải mã video bằng GPU (tự về CPU nếu lỗi); các bước phân tích mỗi video chạy SONG SONG và log ghi thời gian từng bước; nghe giọng lưu từng đoạn nên bấm Dừng rồi chạy lại không mất phần đã nghe. «Cắt đều»: phân tích nhiều video cùng lúc, thiếu cảnh thì tự đổi độ dài mỗi cảnh để đủ đúng thời lượng đích.",
        "Tab Ninh Đôn TTS: đọc văn bản dài không giới hạn bằng giọng nhân bản VieNeu-TTS (Ninh Đôn · Adam · Tùng Đặng · giọng bạn thêm từ file WAV), chạy offline trên máy. Thư viện AI chạy ở tiến trình riêng (môi trường .venv tạo 1 lần ngay trong tab bằng nút «Cài đặt», hoặc «Dùng môi trường có sẵn» của Local TTS cũ); có nút Giải phóng RAM.",
        "Tab Lấy sub từ video: quét chữ cứng (OCR RapidOCR, chạy offline) hoặc tách phụ đề mềm có sẵn → lưu .srt NGAY CẠNH video, tên trùng tên video; đối chiếu với tiếng thoại để phát hiện chỗ sót và tự quét lại kỹ; quét lại thì ghi đè thành 1 bản; xong báo “Đã lấy đủ sub, đã lưu”; có báo cáo kiểm tra.",
        "Tab Dịch phụ đề SRT: dịch qua trang web (Gemini có model mới 4 Argon / 3.1 Pro / 3.8 Flash / 3.5 Flash-Lite, ChatGPT, Claude, DeepSeek, Copilot…) hoặc qua API; model đã chọn trong tool thì trình duyệt PHẢI chọn đúng model đó (không chọn được thì dừng, không dịch nhầm); bản dịch lưu cạnh tệp SRT gốc.",
        "Hai tab Dịch và Lấy sub độc lập: lấy sub xong chỉ lưu .srt, muốn dịch tệp nào thì sang tab Dịch. Chạy cùng lúc được; sang tab khác việc vẫn chạy (thanh bên hiện chấm “đang chạy”).",
        "Tab «Tải dữ liệu cần thiết» (nhóm HỆ THỐNG): bản gửi người khác chỉ chứa phần mềm, nhẹ; người nhận mở chương trình → bấm «Tải tất cả mục còn thiếu» (ffmpeg, mô hình nghe giọng / hiểu ý / hiểu hình ảnh của SmartCut, thư viện GPU NVIDIA, môi trường giọng nói Ninh Đôn — máy chưa có Python thì tự tải Python gọn nhẹ) → «Khởi động lại». Có thanh tiến độ từng mục, nút Dừng dừng được ngay, tải dở được giữ lại; lần đầu mở trên máy chưa có ffmpeg chương trình tự hỏi.",
        "Trình cài đặt Setup.exe: cài như app bình thường (thư mục người dùng, không cần quyền quản trị, có Start Menu / Desktop / gỡ cài đặt). Thanh tiến trình chạy 2 giai đoạn: chép chương trình rồi TỰ TẢI luôn dữ liệu cần thiết (ffmpeg, mô hình AI, thư viện GPU nếu có card NVIDIA, môi trường giọng nói) — xong là mở Auto Studio dùng được ngay. Bỏ chọn / bấm Hủy lúc đang tải thì bỏ qua bước này và tải sau trong tab «Tải dữ liệu cần thiết». Gỡ cài đặt giữ lại cài đặt và mô hình đã tải.",
        "Tab «Cập nhật phần mềm»: chương trình tự kiểm tra bản mới khi mở (tắt được), tải về (tiếp tục được nếu đứt mạng), kiểm mã sha256, tự giải nén vào THƯ MỤC RIÊNG của bản mới (AutoStudio_v<số bản>) ngay cạnh bản cũ — không cài đè nên nhanh và nhẹ máy. Có ô «Xóa bản cũ sau khi chuyển»: bỏ tích thì giữ bản cũ để quay lại khi cần, tích thì xóa. Lối tắt (Desktop / Start Menu) tự trỏ sang bản mới. Bạn chỉ cần đặt AutoStudio_v<số bản>.zip + update.json (do build.bat tạo) lên một chỗ có https và ghi địa chỉ vào UPDATE_URL. Dữ liệu và mô hình đã tải dùng chung nên không bị mất.",
        "Dùng chung 1 lần tải ffmpeg (~/AutoStudioData/tools); dữ liệu Dịch / Lấy sub nằm ở ~/AutoStudioData/subvoice (lần đầu tự chép cấu hình, prompt, danh sách trang, bộ nhớ dịch từ ~/SubVoiceData nếu có).",
        "Cao độ giọng (−6…+6 bán cung) xử lý bằng ffmpeg, độ dài không đổi. Công tắc “Cao độ đổi theo tốc độ”: BẬT thì tốc độ 1.2 → giọng nhanh VÀ cao hơn như CapCut khi bật “Thay đổi cao độ âm thanh” (≈ +3.2 bán cung); TẮT thì chỉ nhanh.",
        "Tab Lồng tiếng CapCut tách thành 2 trang riêng bên nhau: “Lồng tiếng theo SRT” và “Đọc văn bản” (dùng chung giọng đọc).",
        "Phụ đề chèn vào project: chọn phông CapCut (gõ để lọc) + cỡ chữ + DANH SÁCH KIỂU CHỮ dạng ô “Aa” (8 kiểu có sẵn; thêm / sửa / nhân đôi / xóa): màu chữ, đậm / nghiêng / gạch chân, viền, nền bo tròn, bóng đổ, có xem trước. Vị trí phụ đề nhập X / Y theo PIXEL như bảng Vị trí của CapCut ((0, 0) là giữa khung, Y âm là xuống dưới; tính theo khung của project đang chọn) hoặc kéo thả trên khung hình.",
        "Che sub cũ: có ô tích “Bật che sub cũ” + chọn Thanh nền / Blur; thêm lớp phủ lên video để che chữ cứng — thanh nền một màu (chắc chắn chạy) hoặc blur (thử nghiệm, tự lùi về thanh nền nếu không làm được); kéo / co giãn vùng che trên khung xem trước; gỡ bằng nút 🗑 Xóa text & audio TTS.",
        "Mục “Xử lý”: Chữ + giọng / Chỉ giọng / Chỉ chữ (chỉ thêm phụ đề, không đọc giọng, không cần mạng). “Tạo giọng” chỉ THÊM audio / chữ, video giữ NGUYÊN; Tự Căn Chỉnh nằm ở mục riêng và chỉ chạy khi bạn bấm nút. Tự Căn Chỉnh: ô “video chậm nhất (×)” (mặc định 0.5).",
        "Cuộn chuột trên ô chọn giọng / danh sách / ô chữ chỉ cuộn trong ô đó, không cuộn cả trang.",
        "Cài đặt tự lưu mỗi 15 giây / khi bấm chạy / khi đóng chương trình. Sửa nút “Mở .txt”.",
        "Tab Lấy sub từ video: ô «Độ kỹ» gõ được số khung/giây tùy ý (3–30) ngoài 3 mức có sẵn; video dài (nhiều giờ) giữ RAM ổn định thay vì tăng theo số dòng sub.",
    ]),
    ("1.2.0", [
        "Đổi tên chương trình thành Auto Studio, đánh số phiên bản.",
        "Giao diện mới: nút bấm bo góc, màu chữ luôn rõ khi rê chuột (không còn nền trắng), công tắc bật/tắt, thanh tiến độ riêng ngay dưới từng mục.",
        "Nút 🎯 Tự Căn Chỉnh Audio (duy nhất): cắt video theo sóng âm chỗ lời đọc đè nhau rồi làm chậm cho vừa audio.",
        "Nút 🗑 Xóa text & audio TTS khỏi project: dọn track giọng + phụ đề đã chèn (và trả video về trước khi căn chỉnh) để đọc lại không bị đè.",
        "Chặn tạo giọng khi SRT còn chữ Trung, liệt kê từng dòng ra console như tool cũ.",
        "Các công cụ chạy ĐƯỢC CÙNG LÚC: đọc văn bản, lồng tiếng SRT, căn chỉnh/xóa project, nghe thử… mỗi việc một thanh tiến độ + nút Dừng riêng, khay việc đang chạy ở chân trang.",
        "ffmpeg chỉ tải MỘT LẦN, dùng chung cho mọi phiên bản (~/AutoStudioData/tools): tải dở thì tải tiếp, không tải đè, tự dọn tệp thừa và giới hạn dung lượng cache.",
        "Bản phát hành được biên dịch ra mã máy (Nuitka) — không còn mã nguồn trong thư mục cài đặt; có --selftest kiểm tra bản build.",
    ]),
    ("1.1.0", [
        "Chèn giọng TTS vào project CapCut (track riêng, có sao lưu), tạo project mới, hoặc chỉ xuất audio.",
    ]),
]
