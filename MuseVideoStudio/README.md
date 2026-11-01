Continue in 1.1.6 resubmits unfinished scenes with new attempt IDs, ignoring tentative send flags and old receipts. Completed files are kept. The sidebar now displays the actual application version.

# Muse Video Studio V1 · 1.1.7 · Windows

## Bản cài đặt Windows

Tải `MuseVideoStudio-1.1.7-Setup.exe`, thoát bản đang chạy rồi mở Setup. Chọn thư mục cài đặt; trình cài tạo lối tắt Desktop và Start menu, có mục gỡ cài đặt trong Windows. Dữ liệu app, hàng chờ và key vẫn dùng cùng hồ sơ với bản portable; gỡ cài đặt không yêu cầu xóa dữ liệu người dùng. Trình cài hỗ trợ English/Tiếng Việt.

Build riêng: `node tools/build-installer.cjs` trên Windows. Workflow installer kiểm thử cài đặt, shortcut, mở app, một cửa sổ chính và gỡ cài đặt trước khi thêm Setup.exe vào release hiện tại.


## Tối đa 10 tài khoản / phiên trình duyệt (1.1.1)

Chọn 1–10 ở mục Parallel browsers / Chạy song song. Mỗi tài khoản dùng phiên đăng nhập và hồ sơ riêng; có thể chạy10 cảnh đồng thời. Khi tài khoản nào lưu xong video, tài khoản đó nhận cảnh chờ tiếp theo. App chính vẫn chỉ có một instance. Ảnh tham chiếu chung được ghi cache một lần an toàn khi nhiều worker cùng nhận cảnh.


## English / Tiếng Việt (1.1.0)

Slogan **FROM IDEAS TO MOTION** bằng tiếng Anh. Chọn English hoặc Tiếng Việt ở đầu cửa sổ; mặc định English, lưu lựa chọn trên máy và đổi trực tiếp. Dịch nhãn, nút, cài đặt, trạng thái tiến trình và hộp hỏi thoát. Prompt, nội dung gốc, tiêu đề cảnh do người dùng nhập, đường dẫn và giá trị trong ô nhập không bị dịch hoặc thay đổi khi chuyển ngôn ngữ. Giữ màu nhận diện xanh ngọc và các sửa vòng đời/tải video của V1.


## Nhận diện mới (1.0.2)

Thay dòng tiếng Anh bằng **XƯỞNG VIDEO SÁNG TẠO**, màu chủ đạo xanh ngọc và nền thanh bên xanh rêu đậm. Bao gồm khóa một app chính, bỏ menu desktop và hỏi Thoát hẳn / Ở lại từ1.0.1.


## Cửa sổ và thoát ứng dụng (1.0.1)

Một instance app chính: mở lại sẽ khôi phục cửa sổ đang thu nhỏ và đưa app đang chạy lên trước. Các cửa sổ app và Muse tích hợp không có thanh File/Edit/View/Window. Bấm X ở app chính hỏi **Thoát hẳn / Ở lại**; mặc định và Esc là Ở lại, hàng chờ tiếp tục hoạt động. Chọn Thoát hẳn mới dừng/lưu hàng chờ và đóng các trình duyệt do app quản lý. Bấm X nhiều lần chỉ mở một hộp hỏi.


Icon Muse Studio riêng (M vàng + Play trắng) được nhúng vào EXE, cửa sổ ứng dụng và logo trong giao diện.

## Tải qua menu ba chấm (V1)

Nhận diện nút ba chấm dạng biểu tượng SVG cạnh đúng video, kể cả hàng thao tác nằm ngoài khung player. Mở menu rồi chọn Tải xuống; chỉ hoàn tất khi tệp video đã lưu và kiểm tra xong.

## Giao diện gọn và câu mở đầu tùy chọn (0.8.2)

**Gửi câu bắt đầu** chỉ gửi “Bắt đầu công việc mới nhé” một lần tới mỗi trình duyệt đã chọn rồi kết thúc. Không chờ tin nhắn echo, không chờ Muse trả lời, không khóa Tạo/Chạy/Tiếp tục. Có thể bấm chạy trực tiếp; app tự mở các trình duyệt cần dùng và chờ ô chat tải xong. Nếu đang gửi câu mở đầu mà bấm chạy, app kết thúc phần này trước khi nhập cảnh để tránh ghi chồng ô chat. Đăng nhập lần đầu vẫn thực hiện trực tiếp trong cửa sổ Muse.

Giao diện dùng bảng điều khiển gọn và chữ dễ đọc hơn; các nút chạy, dừng, thư mục nằm ngay trên một danh sách cảnh. Tiến trình và video ở đúng từng ô, giữ thứ tự; tối đa bốn trình duyệt chạy bốn ô song song. Nhập prompt và xuất/ghép video nằm trong các vùng thu gọn. Các kiểm tra đúng prompt/ảnh và đúng video vẫn áp dụng cho tác vụ tạo video.

## Gửi ảnh + prompt trước khi chờ và tải (0.8.1)

Từ 1.1.6, Tiếp tục luôn gửi lại các cảnh chưa hoàn tất: dùng prompt/ảnh đã khóa, đúng tài khoản và mã lượt gửi mới. Cờ đã gửi tạm, protocol, receipt, ID tin nhắn hay kết quả của lượt cũ không được dùng để tự chuyển sang chờ/tải. Chỉ nút Lấy video đã tạo mới khôi phục kết quả cũ.

Nếu bản nháp đã có đúng prompt nhưng chưa có ảnh, vẫn tải ảnh tham chiếu đã khóa lên. Tự mở nút + / đính kèm và mục tải ảnh khi Muse chưa tạo input chọn tệp; hỗ trợ input ẩn và input tạm thời, cả trình duyệt tích hợp và Chrome/Edge. Tránh đính kèm hai lần và kiểm tra dừng trước khi gắn tệp.

Trạng thái đi theo bằng chứng: nhập prompt/đính kèm → gửi → xác nhận tin nhắn → chờ video đúng phản hồi → tải → lưu xong. Cờ ready thiếu đúng tin nhắn/phản hồi không được phép tải. Kiểm thử tích hợp chạy main với Chromium, ảnh PNG được tải thật và tệp WebM tải thật từ fixture cục bộ, gồm lỗi cũ có acknowledgement sai, clip lịch sử trùng prompt và bản nháp thiếu ảnh. Chưa xác minh bằng tài khoản Muse thật.

## Một danh sách, Test chung mọi trình duyệt (0.8.0)

Một nút **Test tất cả trình duyệt** tự mở 1–10 phiên đã chọn, chỉ gửi “Bắt đầu công việc mới nhé”. Từ 0.8.2, nút này chỉ gửi câu mở đầu và không phải điều kiện mở nút Chạy/Tiếp tục. Test không tạo, không bắt đầu và không tiêu thụ prompt trong hàng chờ. Test chờ ô chat tải xong; có bản nháp/ảnh khác sẽ giữ nguyên và báo rõ. Có thể chạy trực tiếp sau khi mở lại app, không cần Test. Đăng nhập lần đầu vẫn thực hiện trực tiếp trong cửa sổ Muse.

Tất cả cảnh nằm trong danh sách theo thứ tự gốc, không cần đổi tab Đang chạy. Từng ô hiển thị ảnh/gửi/tạo/tải, phần trăm thật khi có, thời gian chờ và tên tệp sau khi lưu thành công. Xong ô nào thì ô đó báo **Đã xong**, tài khoản đó tự nhận cảnh tiếp theo. Chọn 4 trình duyệt chạy được 4 cảnh cùng lúc. Danh sách cuộn riêng và tự theo cảnh mới, có thể tắt tự theo; phần prompt và xuất/ghép được thu gọn.

**Dừng, Chạy/Tiếp tục, Mở thư mục video** nằm cạnh nhau. Khi mở lại app, hàng chờ được giữ; Tiếp tục gửi lại cảnh chưa xong bằng lượt mới. Cảnh đã lưu thành công không chạy lại. Sau khi gửi, chỉ chờ tạo/tải khi quan sát đúng tin nhắn và phản hồi của lượt mới.

## Sửa nhận clip và đặt tên (0.7.1)

Khi Muse thay DOM ID nhưng prompt nguyên vẹn vẫn là duy nhất trong cùng vùng chat còn kết nối, tool gắn lại đúng tin nhắn thay vì đứng ở trạng thái khôi phục cảnh. Giữ alias ID của cùng tin nhắn để nhận phản hồi vẫn trỏ tới ID trước khi render lại. Các cửa sổ Muse tích hợp không bị hạn chế timer/render khi ở nền để cả hai tài khoản cập nhật kết quả. Các tab Chrome/Edge được giữ cố định theo tác vụ; đóng/đổi trang của tab gửi không khiến tool lấy kết quả từ một tab khác.

Thẻ video có nguồn HTTPS/blob có thể tải ngay trong đúng phản hồi mà không chờ player phát hoặc tải metadata; tệp lưu vẫn phải qua kiểm tra MP4/WebM. File tải về được đặt theo số prompt: `001.mp4`, `002.mp4`, …; không phụ thuộc tài khoản nào xong trước. Nếu không có số trong prompt, thứ tự hàng đợi được lưu cố định. Nếu đã có file cùng tên, giữ file cũ và lưu `001 (2).mp4`. WebM giữ đuôi `.webm` đúng định dạng nguồn.

## Khóa cảnh, chờ clip và Dừng / Tiếp tục (0.7.0)

Khi nhận cảnh, tool lưu nguyên prompt và bản sao ảnh theo SHA-256. Ảnh gốc sửa/xóa sau đó không đổi nội dung đã khóa; bản cache bị thay đổi sẽ bị từ chối. Đổi ảnh hàng loạt và đưa về sửa không áp dụng cho cảnh đã khóa. Trước khi bấm Gửi, tool so lại prompt trong ô chat, ảnh preview đã giải mã và đúng DOM token của các ảnh vừa đính kèm. Ảnh thừa/cũ trong vùng soạn thảo ngăn gửi.

Mỗi lần gửi có mã attempt riêng. Tiếp tục tạo mã mới, không tin cờ trạng thái tạm từ lượt cũ. Lấy video đã tạo là thao tác riêng để khôi phục đúng kết quả cũ. Đây là ràng buộc theo phản hồi chat, không tự đánh giá nội dung hình ảnh.

Mốc45 giây xác nhận đã bỏ. Thời gian cấu hình là ngưỡng cảnh báo Muse chậm, không tự hủy tác vụ đang tạo. Timeout tạm thời khi đọc trang được chờ và thử lại. Lỗi tải file giữ nguyên cảnh/kết quả, thử tải lại sau5 giây; không gửi lại prompt và không cấp cảnh kế tiếp cho tài khoản đó trước khi lưu video thành công. Cảnh không xác định được duy nhất vẫn dừng để kiểm tra, không đoán kết quả.

**Dừng** ngắt phần chờ/tải trong tool và tìm nút Stop/Dừng ở vùng soạn thảo của từng tài khoản. Chỉ bấm nút nhận diện được duy nhất; có CSS selector nút dừng riêng. Tool ghi trạng thái: đã quan sát hủy, giao diện đã dừng, clip đã có, đã yêu cầu nhưng chưa xác nhận, hoặc không tìm được nút. Việc nút biến mất chỉ xác nhận giao diện dừng, không hứa máy chủ hủy tuyệt đối.

**Tiếp tục hàng đợi** gửi lại prompt/ảnh đã khóa của tất cả cảnh chưa xong trên đúng tài khoản, kể cả khi lượt cũ chưa xác nhận dừng. Nếu Muse còn đang tạo, chờ ô chat sẵn sàng trước khi gửi. Cảnh đã lưu và các tài khoản, dữ liệu khác được giữ nguyên.

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

- **Dừng ngay** ngắt chờ/tải và thử bấm Stop/Dừng của mỗi tài khoản. Tiếp tục gửi lại cảnh chưa xong bằng lượt mới; lấy lại kết quả cũ chỉ qua nút Lấy video đã tạo.
- **Xóa tất cả đang chờ** chỉ xóa tác vụ chưa gửi. **Xóa toàn bộ danh sách** dừng rồi xóa metadata; giữ file video đã tải.
- Đóng cửa sổ app sẽ dừng hàng đợi, lưu phiên và đóng các trình duyệt do app mở. Chỉ một instance được chạy; mở lần nữa đưa cửa sổ đang chạy lên trước.

## Tài khoản và trình duyệt

Cài đặt cho phép chọn trình duyệt tích hợp, Chrome, Edge hoặc Chromium khác. Mỗi loại trình duyệt và mỗi tài khoản dùng hồ sơ riêng do app tạo; không dùng hồ sơ Chrome/Edge cá nhân. Có thể mở tối đa10 tài khoản. Chế độ song song cho mỗi tài khoản chạy một prompt và nhận việc tiếp theo sau khi đã lưu video.

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

## Update 1.1.7

- Nút tải video: tool thử bấm «…» cạnh video trước (Tải xuống là dòng thứ 2 của menu). Không có «…» hoặc menu không có lệnh đúng thì tự bấm chuột phải vào video (Tải xuống là dòng thứ 4), cuối cùng bấm chuột phải thật. Nhận «…» theo nhãn, tên class, aria-haspopup hoặc biểu tượng ba chấm; gửi sự kiện rê chuột và chuỗi pointerdown/mouseup/click như người bấm. Dòng ngày giờ ở đầu menu không tính là một dòng. Dòng sai thì không bấm; báo lỗi nói rõ từng cách đã thử và các biểu tượng nhìn thấy gần clip.
- Đã thử trên trang giả dựng lại hai menu của Muse (Chromium thật), chưa thử trên tài khoản Muse thật.

## Update 1.1.6

- Ten account workers upload their locked reference images and submit exact scene prompts independently. External Chrome/Edge sessions keep processing when their windows are in the background.
- Downloads open the three-dot menu belonging to the matched clip and require the second row to be Download / Tải xuống. Direct links and other clips' controls are never used as a fallback. A scene completes only after the downloaded video is validated and saved to its ordered output filename.
- Test sends only `Bắt đầu công việc mới nhé`. Run/Continue remains available, safely cancels unfinished Test work before editing the composer, and does not wait for a Test reply.
- Existing application identity, saved projects, account profiles, licenses, references and output files remain unchanged. The installer continues to preserve application data on uninstall.
- Regression coverage: `npm test`, plus Chromium/Edge fixtures `test/ten-sessions-smoke.cjs`, `test/scene-flow-smoke.cjs`, `test/muse-tracker-smoke.cjs` and `test/ui-smoke.cjs`. Fixtures use local video/image data; live Muse account behavior still needs verification.

Nút **Tạo lại** cạnh Mở vị trí video / Xóa chỉ chạy lại cảnh đã hoàn thành được chọn. Video cũ được giữ và vẫn mở được khi tạo lại lỗi; bản mới lưu bằng tên riêng (ví dụ `001 (2).mp4`). Cảnh khác không chạy lại. Nút tạm khóa khi hàng đợi đang chạy; dừng hoặc chờ xong trước khi chọn tạo lại.

Bộ cài 1.1.6 tạo/khôi phục shortcut Desktop và Start menu khi cài hoặc cài lại. Trang Hoàn tất hiện lựa chọn mở Muse Video Studio và chọn sẵn; bấm Hoàn tất để mở app. Chế độ cài ngầm không tự mở giao diện. Kiểm thử Windows kiểm tra đường dẫn shortcut, xóa shortcut rồi cài lại để xác nhận khôi phục, và thao tác trang Hoàn tất để xác nhận app mở thật.
