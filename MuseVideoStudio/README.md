# Muse Video Studio 0.8.2 · Windows

Icon Muse Studio riêng (M vàng + Play trắng) được nhúng vào EXE, cửa sổ ứng dụng và logo trong giao diện.

## Giao diện gọn và câu mở đầu tùy chọn (0.8.2)

**Gửi câu bắt đầu** chỉ gửi “Bắt đầu công việc mới nhé” một lần tới mỗi trình duyệt đã chọn rồi kết thúc. Không chờ tin nhắn echo, không chờ Muse trả lời, không khóa Tạo/Chạy/Tiếp tục. Có thể bấm chạy trực tiếp; app tự mở các trình duyệt cần dùng và chờ ô chat tải xong. Nếu đang gửi câu mở đầu mà bấm chạy, app kết thúc phần này trước khi nhập cảnh để tránh ghi chồng ô chat. Đăng nhập lần đầu vẫn thực hiện trực tiếp trong cửa sổ Muse.

Giao diện dùng bảng điều khiển gọn và chữ dễ đọc hơn; các nút chạy, dừng, thư mục nằm ngay trên một danh sách cảnh. Tiến trình và video ở đúng từng ô, giữ thứ tự; tối đa bốn trình duyệt chạy bốn ô song song. Nhập prompt và xuất/ghép video nằm trong các vùng thu gọn. Các kiểm tra đúng prompt/ảnh và đúng video vẫn áp dụng cho tác vụ tạo video.

## Gửi ảnh + prompt trước khi chờ và tải (0.8.1)

Sửa cảnh cũ có cờ đã nhận nhưng chưa gửi thật bị đưa thẳng vào lấy video lịch sử. Cảnh dở từ bản cũ chưa có bằng chứng của luồng gửi ảnh/prompt sẽ quay về đính kèm ảnh và gửi mới trên đúng phiên khi Tiếp tục. Lượt gửi mới dùng bằng chứng riêng; nếu dừng mà chưa xác nhận tin nhắn, giữ lượt đó để kiểm tra tiếp, không gửi trùng. Khôi phục tự động phải khớp nguyên prompt và ID/marker của đúng lượt gửi. Câu Test và clip cũ trùng prompt không thay thế lượt gửi mới. Mỗi lần tải kiểm tra lại ranh giới tin nhắn để tránh DOM bị tái sử dụng.

Nếu bản nháp đã có đúng prompt nhưng chưa có ảnh, vẫn tải ảnh tham chiếu đã khóa lên. Tự mở nút + / đính kèm và mục tải ảnh khi Muse chưa tạo input chọn tệp; hỗ trợ input ẩn và input tạm thời, cả trình duyệt tích hợp và Chrome/Edge. Tránh đính kèm hai lần và kiểm tra dừng trước khi gắn tệp.

Trạng thái đi theo bằng chứng: nhập prompt/đính kèm → gửi → xác nhận tin nhắn → chờ video đúng phản hồi → tải → lưu xong. Cờ ready thiếu đúng tin nhắn/phản hồi không được phép tải. Kiểm thử tích hợp chạy main với Chromium, ảnh PNG được tải thật và tệp WebM tải thật từ fixture cục bộ, gồm lỗi cũ có acknowledgement sai, clip lịch sử trùng prompt và bản nháp thiếu ảnh. Chưa xác minh bằng tài khoản Muse thật.

## Một danh sách, Test chung mọi trình duyệt (0.8.0)

Một nút **Test tất cả trình duyệt** tự mở 1–4 phiên đã chọn, chỉ gửi “Bắt đầu công việc mới nhé”. Từ 0.8.2, nút này chỉ gửi câu mở đầu và không phải điều kiện mở nút Chạy/Tiếp tục. Test không tạo, không bắt đầu và không tiêu thụ prompt trong hàng chờ. Test chờ ô chat tải xong; có bản nháp/ảnh khác sẽ giữ nguyên và báo rõ. Có thể chạy trực tiếp sau khi mở lại app, không cần Test. Đăng nhập lần đầu vẫn thực hiện trực tiếp trong cửa sổ Muse.

Tất cả cảnh nằm trong danh sách theo thứ tự gốc, không cần đổi tab Đang chạy. Từng ô hiển thị ảnh/gửi/tạo/tải, phần trăm thật khi có, thời gian chờ và tên tệp sau khi lưu thành công. Xong ô nào thì ô đó báo **Đã xong**, tài khoản đó tự nhận cảnh tiếp theo. Chọn 4 trình duyệt chạy được 4 cảnh cùng lúc. Danh sách cuộn riêng và tự theo cảnh mới, có thể tắt tự theo; phần prompt và xuất/ghép được thu gọn.

**Dừng, Chạy/Tiếp tục, Mở thư mục video** nằm cạnh nhau ngay trên danh sách. Khi khởi động lại, hàng chờ được khôi phục, bấm Tiếp tục để chạy. Chưa thấy đúng prompt trong chat phải báo **Chưa xác nhận Muse nhận prompt**, không đánh dấu đã nhận dựa vào việc bấm Gửi. Tiếp tục giữ attempt có bằng chứng của luồng gửi mới; cảnh dở từ bản cũ chưa có bằng chứng quay về gửi ảnh/prompt trên chính tài khoản cũ.

## Sửa nhận clip và đặt tên (0.7.1)

Khi Muse thay DOM ID nhưng prompt nguyên vẹn vẫn là duy nhất trong cùng vùng chat còn kết nối, tool gắn lại đúng tin nhắn thay vì đứng ở trạng thái khôi phục cảnh. Giữ alias ID của cùng tin nhắn để nhận phản hồi vẫn trỏ tới ID trước khi render lại. Các cửa sổ Muse tích hợp không bị hạn chế timer/render khi ở nền để cả hai tài khoản cập nhật kết quả. Các tab Chrome/Edge được giữ cố định theo tác vụ; đóng/đổi trang của tab gửi không khiến tool lấy kết quả từ một tab khác.

Thẻ video có nguồn HTTPS/blob có thể tải ngay trong đúng phản hồi mà không chờ player phát hoặc tải metadata; tệp lưu vẫn phải qua kiểm tra MP4/WebM. File tải về được đặt theo số prompt: `001.mp4`, `002.mp4`, …; không phụ thuộc tài khoản nào xong trước. Nếu không có số trong prompt, thứ tự hàng đợi được lưu cố định. Nếu đã có file cùng tên, giữ file cũ và lưu `001 (2).mp4`. WebM giữ đuôi `.webm` đúng định dạng nguồn.

## Khóa cảnh, chờ clip và Dừng / Tiếp tục (0.7.0)

Khi nhận cảnh, tool lưu nguyên prompt và bản sao ảnh theo SHA-256. Ảnh gốc sửa/xóa sau đó không đổi nội dung đã khóa; bản cache bị thay đổi sẽ bị từ chối. Đổi ảnh hàng loạt và đưa về sửa không áp dụng cho cảnh đã khóa. Trước khi bấm Gửi, tool so lại prompt trong ô chat, ảnh preview đã giải mã và đúng DOM token của các ảnh vừa đính kèm. Ảnh thừa/cũ trong vùng soạn thảo ngăn gửi.

Mỗi lần gửi có mã attempt riêng; khi nhận tin nhắn echo, lưu ID/marker của tin nhắn đó. Tiếp tục chờ clip đã gửi dùng lại attempt/anchor cũ, kể cả lịch sử có prompt trùng. Gửi lại sau khi dừng dùng attempt mới và bỏ kết quả từ các lượt cũ theo vùng phản hồi/ID. Đây là ràng buộc theo phản hồi chat; không tự đánh giá nội dung hình ảnh có đáp ứng ý nghĩa prompt hay không.

Mốc45 giây xác nhận đã bỏ. Thời gian cấu hình là ngưỡng cảnh báo Muse chậm, không tự hủy tác vụ đang tạo. Timeout tạm thời khi đọc trang được chờ và thử lại. Lỗi tải file giữ nguyên cảnh/kết quả, thử tải lại sau5 giây; không gửi lại prompt và không cấp cảnh kế tiếp cho tài khoản đó trước khi lưu video thành công. Cảnh không xác định được duy nhất vẫn dừng để kiểm tra, không đoán kết quả.

**Dừng** ngắt phần chờ/tải trong tool và tìm nút Stop/Dừng ở vùng soạn thảo của từng tài khoản. Chỉ bấm nút nhận diện được duy nhất; có CSS selector nút dừng riêng. Tool ghi trạng thái: đã quan sát hủy, giao diện đã dừng, clip đã có, đã yêu cầu nhưng chưa xác nhận, hoặc không tìm được nút. Việc nút biến mất chỉ xác nhận giao diện dừng, không hứa máy chủ hủy tuyệt đối.

**Tiếp tục hàng đợi** tự xử lý các cảnh bị gián đoạn trên đúng tài khoản. Nếu đã quan sát hủy/giao diện dừng, gửi lại prompt/ảnh đã khóa. Nếu clip đã có hoặc chưa xác nhận dừng, chờ/lấy kết quả attempt cũ thay vì gửi trùng. Những tài khoản khác vẫn chạy song song. Nếu Muse không có markup/nút được nhận diện, xuất thông tin lỗi chat để hiệu chỉnh; chưa xác minh bằng tài khoản Muse thực.

## Sửa luồng chờ và gửi của 0.6.2

Tool bấm nút Gửi trong vùng soạn thảo thay vì giả định Enter gửi được. Selector nút gửi để trống sẽ tự nhận diện nhãn Send/Gửi, nút submit hoặc biểu tượng mũi tên được hỗ trợ; có nhiều nút hoặc không nhận diện được thì báo lỗi, giữ bản nháp. Việc gửi vẫn chờ đúng prompt xuất hiện trong chat, không bấm lại mù.

Nhận player đã tải metadata mà chưa tải khung hình và liên kết MP4/WebM có thumbnail, gắn với đúng phản hồi. Ghép nội dung prompt nhiều đoạn bằng văn bản hiển thị thay vì nối dính các đoạn HTML. Mỗi thao tác đọc/điều khiển trang có hạn chờ20 giây; lỗi hiện trên danh sách ngay cả khi đang lọc Đang chờ. Khi dừng/lỗi, không chờ vô hạn việc dọn tracker.

Giao diện Muse thực chưa truy cập được từ môi trường này. Nếu vẫn không nhận thẻ clip, chọn đúng tài khoản rồi bấm **Xuất thông tin lỗi chat**, lưu JSON và gửi tệp để kiểm tra. Tệp chứa cấu trúc DOM, thuộc tính giao diện đã lọc, trạng thái player và bước lỗi; không chứa cookie, storage, giá trị ô nhập, nội dung prompt hoặc URL có token. Không công khai tệp hỗ trợ lên GitHub. Đây là chẩn đoán cần thiết để xác minh adapter với markup thực, không phải bằng chứng mọi dạng player đã được hỗ trợ.

## Tạo liên tục, đúng prompt và tải về

Mặc định tool chạy song song theo tài khoản và tự chuyển đến hết danh sách. Với2 tài khoản, TK1 gửi cảnh1 và TK2 gửi cảnh2 cùng lúc; tài khoản nào tải xong video trước sẽ nhận cảnh tiếp theo, không phải chờ tài khoản kia. Khi nâng cấp từ0.6.2 trở về trước, app tự chuyển cấu hình cũ sang song song một lần; sau đó giữ lựa chọn bạn lưu trong Cài đặt. Mỗi tài khoản thực hiện: xác nhận đúng prompt trong chat → chờ video trả lời prompt đó → tải và kiểm tra tệp video → chuyển prompt tiếp theo. Mở và đăng nhập đủ tài khoản đã chọn trước khi chạy. Chế độ **Lần lượt** vẫn có trong Cài đặt nếu bạn chủ động chọn. Mỗi tài khoản vẫn chỉ giữ một tác vụ đang xử lý, không gửi thêm trước khi tải xong. Khoảng nghỉ giữa hai lượt của cùng tài khoản mặc định3 giây, điều chỉnh0–120 giây.

Mỗi thẻ hiển thị cảnh/prompt gốc, giai đoạn xử lý, thời gian chờ, tiến độ Muse khi trang thực sự cung cấp và tiến độ tải khi trình duyệt cung cấp số byte. Không tạo phần trăm giả khi Muse không có số liệu. Tệp đã tải phát trực tiếp trong đúng thẻ, giữ nguyên trình phát khi trạng thái cập nhật.

Tool chụp trạng thái trước khi gửi, tìm tin nhắn trùng nguyên prompt rồi gắn video ở phản hồi sau tin nhắn đó. Không lấy bất kỳ URL video mới nào trong toàn trang. Video cũ, phản hồi của prompt khác hoặc nhiều kết quả không rõ ràng không được coi là hoàn tất. Luồng tải ưu tiên nút **Tải xuống/Download** của đúng phản hồi, bắt sự kiện download trước khi bấm và chỉ đánh dấu xong sau khi lưu/kiểm tra tệp. Tên file bắt đầu bằng số cảnh, giữ đúng định dạng MP4/WebM nhận được; file dở không hiển thị là hoàn tất.

Nếu video đã tạo trên Muse nhưng tác vụ lỗi/gián đoạn, mở đúng chat của tài khoản rồi bấm **Tìm / tải video đã tạo** trên thẻ. Thao tác này tìm lại chính xác prompt và tải kết quả mà không gửi prompt mới, không chạy tiếp các tác vụ đang chờ. Nếu chat có nhiều tin nhắn trùng nguyên prompt, tool báo cần kiểm tra thay vì đoán video. **Gửi lại prompt** là thao tác riêng có thể tạo clip trùng và tốn thêm credit.

## Nhập prompt và ảnh

1. Với bộ prompt đã viết sẵn (như `PROMPT 01 — 8 seconds`), chọn mặc định **Tự nhận diện PROMPT / SCENE / CẢNH — giữ nguyên** và dán toàn bộ văn bản.
2. Chọn một ảnh chung cho tất cả prompt, hoặc ảnh theo số thứ tự. Chọn thư mục ảnh `01.png`, `02.png`, … để tự ghép đúng số prompt, không phụ thuộc thứ tự hộp chọn file. Nhiều ảnh cùng số được gắn vào cùng cảnh; ảnh không khớp/cảnh thiếu ảnh được báo rõ.
3. Bấm **Đọc / cập nhật danh sách** để xem/sửa hoặc bấm **Tạo video** để nhập rồi chạy. Có thể dán ảnh ở ô chung hoặc từng dòng. **Áp ảnh cho tất cả prompt đang chờ** cập nhật các tác vụ đã có.
4. Nếu danh sách cũ đã bị tách sai, bấm **Xóa tất cả đang chờ**, dán lại văn bản gốc rồi tạo. Không tự xóa công việc cũ khi nâng cấp.

Mỗi khối prompt hoàn chỉnh được giữ nguyên hành động, nhân vật và camera, không tách câu/đoạn hay thêm mẫu chat. Nếu có nhãn `VIDEO PROMPT` và `ENGLISH VOICEOVER`, chỉ phần video được gửi; lời dẫn được lưu riêng để dựng. Bộ văn bản 100 KB người dùng cung cấp đã được kiểm tra là **60 prompt × 8 giây**, thay vì hàng trăm mảnh. Văn bản đó không được đưa lên GitHub.

Chỉ dùng chế độ **Kịch bản thô → prompt theo mẫu** khi muốn tool thực sự viết thêm mẫu hướng dẫn. Chế độ này dùng quy tắc, không có mô hình AI hoặc dịch tự động. Thời lượng/tỉ lệ trong prompt là yêu cầu gửi Muse, không bảo đảm clip thực tế luôn đúng; muốn nối đúng tổng thời lượng cần kiểm tra kết quả.

## Dừng, xóa và đóng app

- **Dừng ngay** ngắt chờ/tải và thử bấm Stop/Dừng trong vùng chat của mỗi tài khoản; trạng thái xác nhận nằm trên thẻ. Cảnh đang chạy chuyển sang gián đoạn; Tiếp tục quyết định gửi lại hay chờ kết quả theo trạng thái dừng đã quan sát.
- **Xóa tất cả đang chờ** chỉ xóa tác vụ chưa gửi. **Xóa toàn bộ danh sách** dừng rồi xóa metadata; giữ file video đã tải.
- Đóng cửa sổ app sẽ dừng hàng đợi, lưu phiên và đóng các trình duyệt do app mở. Chỉ một instance được chạy; mở lần nữa đưa cửa sổ đang chạy lên trước.

## Tài khoản và trình duyệt

Cài đặt cho phép chọn trình duyệt tích hợp, Chrome, Edge hoặc Chromium khác. Mỗi loại trình duyệt và mỗi tài khoản dùng hồ sơ riêng do app tạo; không dùng hồ sơ Chrome/Edge cá nhân. Có thể mở tối đa4 tài khoản. Chế độ song song cho mỗi tài khoản chạy một prompt và nhận việc tiếp theo sau khi đã lưu video.

Nút **Đăng xuất tài khoản này** xác nhận rồi xóa dữ liệu đăng nhập của đúng hồ sơ đang chọn; các tài khoản khác và trình duyệt cá nhân giữ nguyên. Cookie phiên được lưu mã hóa với Electron safeStorage (Windows DPAPI); không đưa vào file xuất hoặc repo. Phiên vẫn có thể bị Muse thu hồi/hết hạn.

**Bản 0.5.1 đã bỏ toàn bộ mục VPN/IP Mỹ và kiểm tra quốc gia.** Muse mở trực tiếp trong trình duyệt đã chọn. Cấu hình IP/VPN cũ tự loại bỏ khi nâng cấp; cookie, trial/key và tác vụ được giữ nguyên.

## Gửi ảnh và giới hạn Muse

Không còn popup xác nhận ảnh mỗi tác vụ. Tool chờ preview ảnh mới, trạng thái tải kết thúc và nút gửi sẵn sàng; hỗ trợ selector ảnh sẵn sàng riêng nếu DOM Muse khác. Không nhận được tín hiệu thì báo lỗi trước khi gửi, không gửi mù. Với giao diện chỉ tạo file input sau dấu +, cần mở phần đính kèm trên Muse trước hoặc hiệu chỉnh adapter.

Chưa có quyền truy cập tài khoản/DOM Muse thực để xác minh end-to-end. Player iframe/MSE, giao diện chưa nhận diện được vùng phản hồi, URL video tái sử dụng hoặc thay đổi HTML có thể cần chỉnh selector/adapter. Có selector vùng phản hồi riêng trong Cài đặt; khi không gắn được chắc chắn thì dừng để kiểm tra. Kiểm thử dùng Chromium/fixture cục bộ và giả lập, không thay thế chạy tài khoản thực. Không tự retry tác vụ lỗi để tránh dùng credit trùng.

## Dùng thử, key và QR

Dùng thử24 giờ tính từ lần mở đầu tiên. Hết hạn chỉ chặn tạo/gửi prompt mới; vẫn xem/xuất clip và nhập key được. Key gắn với mã máy và được ký Ed25519. Xem [hướng dẫn chủ phần mềm](tools/README.md) để cấp key; khóa ký riêng không nằm trong app/GitHub.

QR BIDV theo thông tin người dùng cung cấp: TRIEU VAN TINH, 3950588072, không có PGD/chi nhánh, không gắn số tiền cố định. Chuyển khoản không tự kích hoạt key; chủ phần mềm phải kiểm tra giao dịch và cấp key thủ công. Hệ thống offline cơ bản có thể bị reset/sửa source; bán thương mại cần backend trial/license và xác nhận thanh toán riêng.

## Xuất video

Mặc định giữ clip riêng. Nút **Xuất clip cho CapCut** tạo gói media đánh số đúng thứ tự và lời dẫn riêng; người dùng import vào CapCut rồi kéo lên timeline. Chưa phải native project tự mở timeline.

Nối MP4 tùy chọn cần FFmpeg/ffprobe trên máy (chưa đóng kèm): chọn ffmpeg.exe cùng thư mục ffprobe.exe trong Cài đặt. Chuẩn hóa1920×1080/30fps H.264/AAC, giữ âm thanh hoặc thêm im lặng, giữ file nguồn. Chỉ nối/xuất gói đầy đủ khi mọi cảnh hoàn tất.

## Phát triển và kiểm thử

Node22 trở lên: `npm ci`, `npm test`, `npm run test:ui`, `npm run dist:win`. Các kiểm tra `node test/submit-diagnostics-smoke.cjs`, `node test/cards-smoke.cjs`, `node test/muse-tracker-smoke.cjs`, `node test/download-capture-smoke.cjs` xác minh thẻ video, gắn kết quả theo prompt và tải/cancel tệp video thật từ máy chủ cục bộ; smoke tải cần FFmpeg hoặc MUSE_VIDEO_FIXTURE. Test UI và browser smoke cần Chromium; đặt CHROMIUM_PATH nếu khác /usr/bin/chromium. `node test/attachment-ready-smoke.cjs` kiểm tra readiness ảnh trên DOM fixture thật. FFmpeg smoke riêng: `npm run test:merge`.

Các test đơn vị kiểm tra import60 cảnh, mapping ảnh, hủy job đang chờ, xóa hàng loạt, vòng đời cửa sổ, phiên mã hóa, mở Muse không phụ thuộc IP, trial/key và QR. Test trình duyệt không gọi dịch vụ Muse hoặc ngân hàng. Bản Windows unsigned được build qua GitHub Actions, tải ở Releases.
