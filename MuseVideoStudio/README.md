Continue in 1.1.6 resubmits unfinished scenes with new attempt IDs, ignoring tentative send flags and old receipts. Completed files are kept. The sidebar now displays the actual application version.

# Muse Video Studio V1 · 1.3.4 · Windows

## Bản cài đặt Windows

Tải `MuseVideoStudio-1.3.4-Setup.exe`, thoát bản đang chạy rồi mở Setup. Chọn thư mục cài đặt; trình cài tạo lối tắt Desktop và Start menu, có mục gỡ cài đặt trong Windows. Dữ liệu app, hàng chờ và key vẫn dùng cùng hồ sơ với bản portable; gỡ cài đặt không yêu cầu xóa dữ liệu người dùng. Trình cài hỗ trợ English/Tiếng Việt.

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

## Update 1.6.0

- **Chế độ mới thứ 5: «Lịch sử minh họa»** (nút cạnh «Cây trồng phát triển») cho video kể lịch sử hoặc văn hóa bằng **tranh hoạt hình phẳng có chuyển động nhẹ**, kèm giọng đọc và phụ đề. Dùng đúng quy trình của Mẹo vặt: nhập chủ đề (hoặc dán sẵn bài vào ô) → Muse viết bài và chia cảnh → mỗi cảnh Muse vẽ **một tranh hoạt hình phẳng** rồi làm **clip chuyển động nhẹ** từ chính tranh đó → bấm «Xuất MP4» để app tự thêm giọng đọc, phụ đề và nối thành video.
- **Nhân vật dẫn chuyện lặp lại:** ô «Nhân vật dẫn chuyện» (mô tả, và ảnh tham chiếu nếu có) được chốt thành một mô tả cố định và nhắc lại ở khoảng một nửa số cảnh; ảnh tham chiếu được gắn vào các việc ảnh để nhân vật giữ nguyên. Lời dặn Muse riêng cho lịch sử: đúng sử và tôn kính (không bịa chi tiết, không cảnh máu me, không chữ trong tranh), trang phục và kiến trúc đúng thời kỳ, cùng một phong cách vẽ ở mọi cảnh, clip chỉ chuyển động nhỏ, chậm (máy quay đẩy/lia, nhân vật chớp mắt hay đổi tư thế, cờ bay).
- Độ dài chọn 1, 2, 3 (mặc định), 5 hoặc 10 phút; mỗi cảnh tốn 2 lượt Muse (ảnh + clip); số lượt hiện ngay dưới ô chọn. Tiêu đề, độ dài và nhân vật dẫn chuyện được nhớ **riêng** với các chế độ khác.
- **Sửa lỗi các tab chạy chung nhau:** trước đây tiến độ «Phần 2/7 · Muse đang viết…» và nút «Dừng phân tích» hiện ở mọi tab. Nay **mỗi tab độc lập**: có kịch bản, tỉ lệ, nhân vật, phong cách và các cảnh đã chia **riêng**; đổi tab không xóa gì và không hỏi lại. Muse chỉ làm được một việc một lúc (chung một cuộc chat) nên chỉ **tab đang chạy** thấy tiến độ và nút Dừng; các tab khác báo «Muse đang bận ở tab …», và khi xong có thông báo «Muse đã xong ở tab …».
- **Giao diện gọn hơn:** các ô ít dùng nằm trong mục thu gọn **«Tùy chọn thêm»** (số giây mỗi ảnh, ngôn ngữ lời đọc, chuyển động clip, prompt tiếng Anh/Việt) và **«Kiểu chữ phụ đề»** (phông, cỡ, màu, vị trí, xem trước). Mỗi cảnh chỉ hiện **lời đọc**; prompt ảnh và prompt chuyển động nằm trong mục «Prompt ảnh và chuyển động (sửa nếu cần)», tự mở khi cảnh có cảnh báo cần sửa. Cách chạy, số lượt Muse và kết quả không đổi.
- Lưu ý thật: Muse vẽ mỗi ảnh riêng từ chữ mô tả nên nhân vật dẫn chuyện giữa các ảnh có thể **hơi khác nhau**; cảnh nào lệch thì sửa prompt ảnh rồi «Tạo lại». Test chỉ chạy với trang chat giả, máy chủ cục bộ và ffmpeg thật; **chưa thử với Muse thật hay máy Windows thật.**

## Update 1.5.0

- **Chế độ mới thứ 4: «Cây trồng phát triển»** (nút cạnh «Mẹo vặt») cho video 7–10 phút theo dõi MỘT cây trồng trong chậu: **chuẩn bị chậu và đất → gieo hạt → nảy mầm → cây con → chăm sóc → ra hoa → đậu quả → quả chín, thu hoạch**. Dùng đúng quy trình của Mẹo vặt: nhập loại cây hoặc tiêu đề (ví dụ «Trồng cà chua trong chậu từ hạt đến khi ra quả»), Muse viết bài theo từng bước rồi chia cảnh, bạn xem/sửa, mỗi bước tạo một ảnh chụp thật rồi cho ảnh đó chuyển động thành clip, thêm lời đọc, phụ đề và nối thành MP4.
- Độ dài chọn **7, 8, 9 hoặc 10 phút** (mặc định 8 phút, mỗi ảnh 10 giây → 48 cảnh; 10 phút = 60 cảnh). Tối đa 100 cảnh. Mỗi cảnh tốn 2 lượt Muse (ảnh + clip) nên 10 phút là khoảng 120 lượt; số lượt hiện ngay dưới ô chọn. Bài được viết theo lượt ≤ 16 mục nối tiếp như Mẹo vặt.
- **Lời dặn Muse riêng cho cây trồng:** đủ các giai đoạn theo thứ tự thật (chuẩn bị chậu/đất/dụng cụ, gieo hạt, nảy mầm và cây con, chăm sóc, ra hoa và đậu quả, quả lớn/chín/thu hoạch), mỗi bước nêu mốc thời gian từ lúc gieo («Sau mười ngày», «Tuần thứ sáu»…) và hình dạng thấy được của cây; đúng sinh học (lá mầm trước lá thật, hoa trước quả, quả xanh trước khi chín); dùng «khoảng», không bịa năng suất hay hiệu quả, không hứa chắc ra quả; phân bón/thuốc chỉ nói chung chung theo bao bì, không pha trộn hóa chất. Chưa nêu loại cây thì Muse chọn một cây ăn quả trồng chậu dễ trồng (cà chua, ớt, dưa leo…).
- **Ảnh giữ cùng một chậu:** dòng «NHÂN VẬT» chốt một mô tả cố định (loài cây, chậu, đất, chỗ đặt, hướng nắng, góc máy và khoảng cách) và được nhắc lại trong ảnh của mọi cảnh; chỉ cây (và tay) đổi theo giai đoạn. Clip chỉ chuyển động nhẹ (lá đung đưa, ánh nắng dịch chuyển, giọt nước, máy quay đẩy chậm), **không cho cây lớn lên hay nở hoa ngay trong clip** vì video AI dễ méo hình: sự phát triển hiện ra khi chuyển từ cảnh này sang cảnh sau. Ô «Chuyển động clip» và «Prompt gửi Muse» (tiếng Anh mặc định) dùng như Mẹo vặt.
- Tiêu đề, độ dài và số giây của «Cây trồng phát triển» được nhớ **riêng** với «Mẹo vặt». Giao diện tiếng Việt và tiếng Anh đều có.
- Lưu ý thật: mỗi ảnh do Muse vẽ riêng từ chữ mô tả nên chậu và cây giữa các ảnh có thể **hơi khác nhau**; cảnh nào lệch thì sửa prompt ảnh rồi «Tạo lại». Test chỉ chạy với trang chat giả và máy chủ cục bộ; **chưa thử với Muse thật hay máy Windows thật.**

## Update 1.4.6

- **Mẹo vặt: chuyển động clip «nhẹ, ổn định» (mặc định).** Video AI của Muse hay méo hình, giật khi phải vẽ tay hoặc dụng cụ làm thao tác phức tạp (cắt, thái, vắt, đổ, trộn, lau, xoay…). Nay app dặn Muse viết prompt chuyển động chỉ gồm MỘT chuyển động nhỏ, chậm (máy quay đẩy vào chậm hoặc lia nhẹ, hơi nước bay, ánh sáng đổi nhẹ, tay đưa vào khung chậm rãi), cấm thao tác nhanh hay làm đổi vật, giữ đúng hình dạng/màu/số lượng vật, tay đủ năm ngón. Vì clip chuyển động nhẹ, **ảnh** được dặn chọn đúng khoảnh khắc nổi bật của bước (đang làm hoặc vừa làm xong) để chính ảnh thể hiện thao tác; hành động do lời đọc kể.
- Ô mới **«Chuyển động clip»** trong khung Mẹo vặt: «Nhẹ, ổn định (ít méo hình)» (mặc định) hoặc «Theo từng thao tác (dễ méo)» (kiểu cũ của 1.4.x). Số cảnh, số lượt Muse, mốc giờ và thẻ số câu không đổi; app vẫn tự cắt/giữ khung, thêm lời đọc, phụ đề và nối thành MP4 như trước.
- **Prompt gửi Muse bằng tiếng Anh (mặc định).** Ô mới **«Prompt gửi Muse»**: «Tiếng Anh (tối ưu cho Muse)» hoặc «Tiếng Việt». Ở chế độ tiếng Anh, Muse viết **prompt ảnh** («Create a photorealistic photo of…», góc máy, ống kính, ánh sáng, «No text, numbers, logos or watermarks») và **prompt chuyển động** (mốc «0–3 s [line 5]: …») bằng tiếng Anh; mọi câu app tự thêm (ảnh là khung hình đầu, tỉ lệ khung hình, cấm chữ trong ảnh, cấm tiếng) cũng bằng tiếng Anh, không trộn tiếng Việt. Lời đọc, phụ đề và giọng vẫn là tiếng Việt như bạn chọn. Prompt chuyển động luôn kết bằng câu dặn «Realistic, physically plausible motion at natural speed… no extra hands, no morphing, no new objects, no cuts…».
- Chỉ đổi lời dặn Muse nên **không xoá được hết lỗi AI**: Muse vẫn có thể làm méo. Cảnh nào méo thì bấm «Tạo lại» cho cảnh đó. **Chưa thử với Muse thật.**

## Update 1.4.5

- **Sửa nút «Tìm / lưu ảnh đã tạo» (tab Tạo ảnh và ảnh của Mẹo vặt).** Nút này lưu lại ảnh Muse đã tạo mà không gửi lại prompt. Trước đây, nếu chat có **nhiều tin nhắn trùng prompt** (thử lại nhiều lần) và dấu cũ đã mất (tải lại trang, Muse dựng lại tin nhắn), nút báo «Có nhiều tin nhắn trùng prompt nhưng ID cũ đã thay đổi» và không lưu gì. Nay với **ảnh**, app lấy bản **mới nhất** của prompt đó và chỉ lấy ảnh nằm ngay sau nó; không bao giờ lấy ảnh trả lời cho bản cũ hơn. Nếu bản mới nhất chưa có ảnh thì báo chưa thấy ảnh. Việc lưu vẫn chuột phải → «Tải xuống» như 1.4.4. Video giữ nguyên quy tắc chặt cũ.
- Thử bằng trang chat giả trong Chromium thật: 3 bản trùng prompt, mất dấu cũ, bản mới nhất có ảnh / chưa có ảnh. **Chưa thử với Muse thật.**

## Update 1.4.4

- **Lưu ảnh bằng đúng thao tác của bạn: chuột phải vào ảnh → «Tải xuống».** Từ bản 1.4.0 app chỉ đọc ảnh đang hiện trong chat (có thể là bản thu nhỏ). Nay app **bấm chuột phải vào ảnh của đúng cảnh, chọn dòng «Tải xuống»** (menu: emoji, Trả lời, Chia sẻ, Sao chép, Tải xuống) rồi lưu file Muse đưa ra, giống cách tải video. Chỉ bấm đúng dòng có chữ «Tải xuống» nằm trong menu vừa mở; không bấm nút «Tải xuống» nào khác trong trang. Ảnh được kiểm tra bằng byte đầu (PNG/JPG/WEBP/GIF) trước khi lưu; nếu file tải về không phải ảnh thì không lưu. Nếu menu không dùng được, app mới quay lại cách cũ (đọc ảnh đang hiện) và thẻ ghi rõ.
- **Sửa lỗi kẹt «Đã thấy tin nhắn · chờ Muse phản hồi» mà không tải gì.** Khi chat Muse đã có **nhiều tin nhắn trùng prompt** (do thử lại nhiều lần) và Muse **dựng lại các tin nhắn** lúc có ảnh, app không còn nhận ra tin nhắn mình vừa gửi nên đứng chờ mãi, không bao giờ tới bước tải. Nay app đếm số tin nhắn giống prompt **trước khi gửi**, và tin nhắn vừa gửi là bản đứng ngay sau số đó. Nếu vẫn không khôi phục được, thẻ ghi «thấy N tin nhắn giống prompt, lúc gửi có M».
- Thử bằng trang chat giả trong Chromium thật: 1 hoặc 3 prompt trùng trong lịch sử + Muse dựng lại toàn bộ dòng; menu chuột phải kiểu ảnh chụp của bạn (5 dòng), menu 4 dòng, trang chỉ nhận chuột phải thật, câu trả lời có 2 ảnh (tải đúng ảnh thứ hai), dòng «Tải xuống» sai vị trí không bao giờ bị bấm, nút «Tải xuống» khác trong trang không bị đụng; luồng Electron giả: ảnh lưu qua menu, rơi về cách cũ khi menu hỏng hoặc file tải về là trang web.
- **Chưa thử với Muse thật.** Nếu Muse mở ảnh ở tab mới thay vì tải file, hoặc menu khác ảnh chụp, thẻ sẽ ghi lý do rồi dùng cách cũ.

## Update 1.4.3

- **Sửa tiếp lỗi «có ảnh trong chat Muse mà vẫn không tải về».** Bản 1.4.2 chỉ sửa kích thước ảnh. Lần này tìm thêm một nguyên nhân nữa: app bỏ qua ảnh nếu chú thích (alt) hoặc đường dẫn của ảnh có chữ «logo», «icon», «avatar» hay «emoji». Prompt ảnh của Mẹo vặt có câu «không chữ, không số, **không logo**, không hình mờ», nên nếu Muse ghi lại prompt đó làm chú thích thì ảnh bị loại nhầm. Nay các từ đó chỉ dùng để loại ảnh **nhỏ** (dưới 140 px, đúng là biểu tượng hoặc avatar), ảnh cỡ kết quả thì luôn được nhận.
- **Thẻ nói rõ vì sao chưa nhận ảnh**: ví dụ «thấy 1 ảnh nhưng chưa nhận: quá nhỏ (70×70 px, tối thiểu 80)», «giống biểu tượng hoặc avatar», «đang ẩn», «nguồn ảnh lạ». Nếu vẫn kẹt, chụp dòng này gửi lại là biết sửa đúng chỗ.
- Thử bằng một trang chat giả dựng giống ảnh chụp chat Muse của bạn (không có thuộc tính đánh dấu tin nhắn): 3 kiểu bố cục × có/không chú thích «logo» × có tin nhắn cũ trùng prompt, Muse gửi lại prompt hai lần, đường dẫn ảnh có chữ «logo» (18 trường hợp). Bản 1.4.0 và 1.4.1 đều không nhận ảnh nào.
- **Chưa thử với Muse thật.** Nếu vẫn không tải được ảnh, nguyên nhân còn lại nằm ở cách Muse dựng ảnh trong trang mà em chưa thấy; dòng chữ trên thẻ sẽ cho biết.

## Update 1.4.2

- **Sửa lỗi «có ảnh trong chat Muse mà app không tải về».** Muse hiện ảnh vừa tạo dưới dạng **ảnh thu nhỏ rộng khoảng 220 px**, nên ảnh 16:9 chỉ cao khoảng 124 px. App từ trước đến nay chỉ nhận ảnh hiển thị cao và rộng ít nhất 150 px, nên **không bao giờ nhận ra ảnh 16:9** (thẻ cứ ghi «Đã thấy tin nhắn · chờ Muse phản hồi»). Nay mức tối thiểu là 80 px (ảnh thật nhỏ hơn vẫn bị bỏ qua để không nhầm với biểu tượng) và kích thước thật của ảnh tối thiểu 96 px. Lỗi này nằm ở cả «Tạo ảnh» lẫn bước ảnh của «Mẹo vặt».
- Nếu vẫn có ảnh quá nhỏ, thẻ nay ghi rõ lý do, ví dụ «thấy 1 ảnh nhưng quá nhỏ (70×70 px, tối thiểu 80)», thay vì chỉ chờ mãi.
- **Muse hiện cùng một prompt hai lần** (lần đầu báo «Không xác nhận là đã gửi», rồi gửi lại): với **ảnh**, phản hồi sau bản gửi lại vẫn tính là của prompt này (trước đây có thể bị coi là «sau tin nhắn khác»). Tin nhắn khác nội dung vẫn chặn như cũ; video và việc tiếp tục tác vụ cũ vẫn từ chối đoán khi có hai tin trùng.
- **Chưa thử**: chỉ thử với trang chat giả và Chromium thật, chưa với Muse thật. **Chưa biết** ảnh Muse hiển thị trong chat có phải bản đầy đủ hay chỉ bản thu nhỏ: app lưu đúng ảnh Muse đưa ra (ưu tiên đường dẫn ảnh gốc nếu ảnh nằm trong liên kết), nên hãy mở thử một file đã lưu xem kích thước.

## Update 1.4.1

- **Mẹo vặt: chỉ cần nhập TIÊU ĐỀ.** Bản 1.4.0 bắt phải tự dán cả mẹo vào; nay trong chế độ «Mẹo vặt» có ô «Bạn muốn hướng dẫn mẹo gì?» cùng ba ô chọn: **Độ dài video** (1, 2, 3, 5 hoặc 10 phút), **Mỗi ảnh chuyển động** (6, 8 hoặc 10 giây) và **Ngôn ngữ lời đọc** (Tiếng Việt hoặc English). Bấm **«Muse viết mẹo và chia cảnh»**: Muse viết mẹo theo từng bước (1 mở đầu + các bước + 1 kết), mẹo hiện trong ô để bạn sửa, rồi app **tự chia cảnh ngay** (không phải bấm thêm). Xem lại cảnh rồi bấm «Tạo ảnh + clip» như cũ: mỗi bước một ảnh chụp thật, rồi ảnh đó chuyển động thành clip. Ô «Đã có sẵn mẹo? Dán vào đây» vẫn dùng được nếu bạn có mẹo sẵn.
- Số cảnh = độ dài video chia số giây mỗi ảnh (ví dụ 2 phút, 8 giây → 15 cảnh = 1 mở đầu + 13 bước + 1 kết; tối đa 80 cảnh). Dòng dưới ô chọn cho biết số ảnh, số clip và số lượt Muse sẽ dùng.
- **Cách Muse được dặn viết**: mỗi bước là một thao tác nhìn thấy được và chụp được thành một ảnh; độ dài mỗi bước vừa số giây đã chọn; không bịa số liệu, nghiên cứu, thương hiệu hay hiệu quả; không nói chữa bệnh; nhắc an toàn khi có hóa chất, điện, nhiệt, dao kéo; không hướng dẫn trộn chất tẩy rửa. Mẹo dài viết thành nhiều lượt (mỗi lượt ≤ 16 mục), lượt sau được xem phần đã viết để nối tiếp. Mỗi bước bắt đầu bằng «Bước k:» để bước chia cảnh luôn mở cảnh mới ở đó. App soát đủ bước và độ dài; thiếu bước thì hỏi Muse lại một lần, vẫn thiếu thì báo bước nào thiếu; thiếu quá nửa thì báo lỗi.
- **Chưa làm**: bước «soát sự thật» riêng như TipStudio (một lượt Muse thứ hai đọc lại mẹo để sửa câu sai). Hiện chỉ có lời dặn «đúng sự thật, an toàn» trong câu lệnh viết mẹo, nên **bạn nên đọc lại mẹo** trước khi tạo ảnh.
- **Chưa thử**: chỉ thử với Muse giả (trang chat giả, Chromium thật) và giao diện giả lập. **Chưa biết** Muse thật có viết đúng khuôn «Bước k:» và đúng độ dài mỗi bước không, mẹo Muse viết có đúng sự thật không, chia mẹo nhiều lượt có liền mạch không, cũng như mọi điều đã nêu ở bản 1.4.0 (ảnh chụp thật, ảnh → clip). Chưa chạy trên máy Windows thật.

## Update 1.4.0

- **Chế độ mới «Mẹo vặt»** (tab Kể chuyện, nút «Mẹo vặt» cạnh «Kể chuyện» và «Quảng cáo sản phẩm»; làm cho dùng cá nhân). Dán một mẹo vặt, mỗi bước một vài câu ngắn, theo thứ tự. Muse đọc cả mẹo, chia **mỗi bước thành một cảnh**, và viết cho mỗi bước hai prompt: **prompt ảnh** (ảnh chụp thật, khung hình đầu của bước, có tỉ lệ đã chọn và câu cấm chữ trong ảnh) và **prompt chuyển động** (mốc giờ kèm số câu như bản 1.3.5, giữ nguyên bối cảnh và đồ vật của ảnh). Bấm «Tạo ảnh + clip»: tool **tạo hết ảnh trước** (lưu ở `KeChuyen/<truyện>/anh/001.png, 002.png…`), rồi mỗi clip được gửi lên Muse **kèm đúng ảnh của bước đó** (ảnh thành video chuyển động). Sau đó giọng đọc, phụ đề, tự edit và «Xuất MP4» chạy như tab Kể chuyện (chỉ ghép các clip; ảnh không bị ghép). Nếu Muse trả nhiều ảnh cho một prompt ảnh thì ảnh đầu tiên làm khung hình đầu của clip (các ảnh còn lại vẫn được lưu cạnh, đánh số _2, _3…). Chế độ này không dùng nhân vật hay ảnh tham chiếu; các bước giữ đồng nhất nhờ một mô tả cố định về nơi làm và đồ vật chính được nhắc lại trong prompt ảnh của mọi bước.
- **Ảnh trước, clip sau, và dừng sớm nếu ảnh hỏng.** Việc clip chỉ chạy khi ảnh cùng số bước đã lưu xong. Một ảnh lỗi thì hàng đợi dừng ngay, **chưa tốn lượt làm clip nào**; bấm Tiếp tục thì làm lại ảnh đó rồi mới đến clip. Chạy song song nhiều tài khoản: tài khoản rảnh đợi ảnh đang tạo, không bao giờ gửi clip trước khi có ảnh. Nếu tạo lại ảnh của một bước rồi bấm «Tạo lại» ở clip của bước đó thì clip dùng ảnh mới.
- **Mỗi bước tốn 2 lượt Muse** (1 ảnh + 1 clip), nên hộp xác nhận nói rõ số ảnh và số clip. Muse không bị hỏi bước đọc hiểu riêng cho mẹo (đỡ một lượt); nếu Muse quên dòng ẢNH ở một bước thì app hỏi lại đúng bước đó, không tự bịa ảnh thay Muse.
- **Chưa thử**: chưa chạy với Muse thật, nên **chưa biết** Muse có làm đúng khuôn «ẢNH:» và «PROMPT:», ảnh chụp thật có bị méo tay hoặc đồ ăn không, mô hình ảnh→video có giữ đúng ảnh và làm đúng thao tác của bước (cắt, đổ, vắt…) hay chỉ làm hình lay động, và các ảnh của các bước có thật sự cùng một bếp, cùng một cái thớt không (chỉ dựa vào mô tả cố định trong prompt, không có ảnh chung). Chỉ kiểm bằng Muse giả, Chromium thật, và app chính giả lập (Electron giả); chưa chạy trên máy Windows thật ngoài bản build CI.

## Update 1.3.6

- **Truyện tiếng Anh (hoặc ngôn ngữ khác tiếng Việt): prompt gửi video không còn lẫn tiếng Việt.** Muse vốn được dặn viết PROMPT cùng ngôn ngữ với truyện; nhưng câu khóa hình dạng do app tự thêm vào vẫn là tiếng Việt. Nay app viết câu khóa bằng tiếng Anh khi truyện không phải tiếng Việt (truyện tiếng Việt giữ nguyên). Thẻ số câu của bản 1.3.5 nhận thêm «[sentence 5]» / «[line 5]» (Muse hay dịch chữ «câu»), vẫn được kiểm và vẫn bị bỏ trước khi gửi video; Muse cũng được dặn giữ nguyên chữ «câu» trong thẻ.
- **Tỉ lệ khung hình đã chọn (16:9, 9:16 hoặc 1:1) luôn có trong prompt gửi video.** Trước đây tỉ lệ chỉ được nói với Muse, còn prompt Muse viết ra có ghi tỉ lệ hay không tùy Muse. Nay app tự thêm một câu («Tỷ lệ khung hình video: 9:16 (dọc).» hoặc «Video aspect ratio: 9:16 (vertical).») vào mọi prompt Muse viết, trước câu khóa hình dạng và câu cấm tiếng; Muse đã tự ghi tỉ lệ thì không thêm lần nữa. Tỉ lệ này cũng quyết định khung hình khi xuất MP4 (1920×1080, 1080×1920, 1080×1080).
- **Chưa thử**: chưa chạy truyện tiếng Anh với Muse thật; chưa biết mô hình tạo video có theo câu tỉ lệ trong prompt hay chỉ theo ảnh tham chiếu / cài đặt riêng của Muse. Các prompt mẫu do app ghép khi Muse bỏ sót câu vẫn là tiếng Việt.

## Update 1.3.5

- **Kiểm tra chuyển động của từng cảnh có khớp thứ tự lời đọc không.** Muse được dặn ghi số câu ngay sau mỗi mốc giờ, dạng «0–3 giây [câu 5]: …». App tự soát: các mốc có đi đúng thứ tự câu không, mỗi câu của cảnh có ít nhất một mốc không, có mốc nào nhắc câu ngoài cảnh không, mốc giờ có tăng dần và nằm trong độ dài video không, prompt có chia mốc giờ không. Cảnh nào đảo thứ tự, thiếu câu hoặc nhắc câu ngoài cảnh thì app **hỏi lại Muse đúng cảnh đó một lần** (kèm lỗi cụ thể), chỉ nhận bản mới khi không tệ hơn bản cũ; hỏi xong vẫn lệch thì giữ bản cũ và hiện ⚠ ở từng cảnh cùng một dòng ghi chú. Thẻ «[câu N]» hiện trong ô prompt để bạn thấy mốc nào ứng với câu nào, và **được bỏ tự động trước khi gửi tạo video**. Muse không ghi số câu thì không có gì để kiểm, app không hỏi lại thêm (chỉ cảnh báo nhẹ nếu cảnh từ 4 giây mà prompt không chia mốc giờ).
- **Chưa thử**: chỉ kiểm bằng Muse giả (29 kịch bản phân tích, trong đó 3 kịch bản mới cho chuyển động) và Chromium thật. Chưa biết Muse thật có ghi số câu đúng khuôn không. App chỉ kiểm được **thứ tự và độ đủ của các mốc**, không kiểm được việc hình Muse hay mô hình video vẽ ra có đúng nghĩa câu hay không; chuyển động thật trong clip vẫn phải xem bằng mắt.

## Update 1.3.4

- **Khóa hình dạng dùng được cho mọi kiểu nhân vật, không riêng hoạt hình.** Bản 1.3.3 viết câu khóa thiên về hoạt hình (có câu «không giống người thật»), nên sẽ cản nếu ảnh tham chiếu là người thật hoặc con vật. Nay khóa theo đúng kiểu của ảnh: chuẩn là người que thì mọi người là người que; là **người thật** thì mọi người là người thật; là **con vật** hoạt hình thì mọi nhân vật cùng kiểu đó. Chỉ được khác màu và kiểu quần áo, giới tính, kiểu tóc hoặc bộ lông, phụ kiện, chiều cao, và loài nếu truyện nói rõ. Ô «Hình dạng nhân vật chuẩn» nhận mọi mô tả (ví dụ «người thật, ảnh chụp», «mèo hoạt hình 3D», «thú nhân hóa kiểu tranh minh họa»).
- **Chưa thử**: người thật và con vật chưa chạy với Muse thật, cũng chưa biết mô hình tạo video có từ chối ảnh người thật không; mặt người phụ không giữ được y hệt giữa các cảnh (chỉ nhân vật chính có ảnh tham chiếu gắn vào mọi cảnh, người phụ chỉ được dặn «cùng kiểu»).

## Update 1.3.3

- **Khóa hình dạng nhân vật (tab Kể chuyện).** Lỗi trước đó: nhân vật trong ảnh tham chiếu là đầu tròn trắng áo hoodie đen, nhưng người thứ hai trong cảnh lại thành người thật hoặc anime (có clip nhân vật chính còn bị đổi thành đầu trọc). Nay nhân vật trong ảnh tham chiếu (và/hoặc kiểu bạn ghi ở ô mới **«Hình dạng nhân vật chuẩn»**, ví dụ «người que, đầu tròn trắng») là chuẩn của MỌI nhân vật: người khác phải cùng hình dạng, tỉ lệ, kiểu đầu và mặt, kiểu vẽ, chỉ khác màu và kiểu quần áo, giới tính, tóc, phụ kiện, chiều cao. Hai chỗ khóa: (1) lệnh đọc hiểu và lệnh chia cảnh gửi Muse dặn như vậy và cấm tả người thật; (2) **app tự gắn một câu khóa vào cuối MỌI prompt** (trước câu cấm tiếng), kể cả khi Muse quên, nên không phụ thuộc Muse viết gì. Không có ảnh và không ghi hình dạng thì không khóa; chế độ quảng cáo không đổi. Nhân vật chuẩn đóng vai chính của bài (bài nói/châm biếm thì đóng vai kiểu người bài nói tới); gõ vai khác vào ô «Nhân vật chính» nếu muốn.
- **Video im lặng hoàn toàn** (thay mục Âm thanh của 1.3.2): lệnh và câu «Audio» trong prompt dặn không có âm thanh nào (không tiếng người, nhạc, tiếng động). Nhân vật vẫn há miệng, mấp máy như nói, cười, nét mặt rõ để diễn đạt câu nói; giọng đọc do app thêm.
- **Chưa thử với Muse thật**: mô hình tạo video có nghe theo câu khóa và câu im lặng không (đó chỉ là lời dặn). App không nhìn được ảnh tham chiếu nên không tự kiểm hình dạng; vì vậy nếu ảnh tham chiếu lạ, hãy ghi hình dạng vào ô mới. Phần Muse «hiểu bài» có đúng chưa: chưa có cách kiểm ngoài khung «Muse hiểu bài thế này» để bạn tự đọc. Đã kiểm bằng trang chat Muse giả (26 kịch bản), giao diện giả và test đơn vị.

## Update 1.3.2

- **Tab Kể chuyện: Muse đọc hiểu cả bài TRƯỚC khi chia cảnh, và hiểu cả bài nói / bình luận / châm biếm (không chỉ truyện kể).** Lỗi trước đó: lệnh gửi Muse viết cho truyện có nhân vật, nên với bài như «Tại sao có những người sống hai mặt…» (không có nhân vật, toàn ví von và ví dụ) Muse dựng cảnh sai ý. Nay có một lượt «Đọc hiểu» riêng: Muse ghi lại **tóm tắt**, **cách minh họa** (truyện kể hay bài nói/châm biếm, dựng ví dụ và ẩn dụ thế nào), **nhân vật/vai cố định** và **bối cảnh**. Phần này đi kèm MỌI lượt chia cảnh sau, kể cả truyện rất dài (đọc từng phần, phần sau cập nhật phần trước), và hiện ra trong khung **«Muse hiểu bài thế này»** ở mục 2 để bạn thấy ngay chỗ Muse hiểu sai. Làm tiếp («Phân tích tiếp») dùng lại phần đã hiểu. Chế độ quảng cáo giữ nguyên.
- **Luật dựng cảnh mới cho bài nói/châm biếm**: dựng đúng tình huống câu đang nói với 2–3 vai cố định; bối cảnh đúng nơi bài nhắc (ví dụ «trong công ty» thì là văn phòng, không dùng chung một phòng khách); ý đối lập («trước mặt cười, sau lưng nói xấu») cho thấy ngay trong cảnh; ví von/nói quá không dựng theo nghĩa đen; chuyển động phải đổi rõ giữa các mốc thời gian, không đứng yên một dáng.
- **Âm thanh**: lệnh gửi Muse và câu «Audio» trong prompt cấm mọi tiếng người, gồm cả ậm ờ, lẩm bẩm, thì thầm, cười thành tiếng (clip bạn gửi có tiếng ậm ờ). Hình thì vẫn được há miệng, cười, mấp máy như nói chuyện, nét mặt rõ — chỉ im lặng. Chat Muse dùng chung một cuộc trò chuyện nên mọi lệnh đều dặn Muse bỏ qua truyện/yêu cầu cũ phía trên.
- **Chưa thử với Muse thật**: Muse có làm đúng khuôn «Đọc hiểu» không, hình do Muse dựng có đúng hơn không, và video có còn tiếng ậm ờ không (lệnh chỉ là lời dặn, mô hình tạo video có thể vẫn tự thêm tiếng). Nếu còn tiếng, đặt «Tiếng động gốc của clip» ở phần xuất MP4 thành **Tắt**. Đã kiểm bằng trang chat Muse giả (đọc hiểu một lượt/nhiều phần, đọc hiểu hỏng khuôn vẫn chia tiếp bằng Muse, làm tiếp), giao diện giả và test đơn vị.

## Update 1.3.1

- **Tab Kể chuyện: chỉ Muse đọc hiểu truyện rồi mới chia cảnh, không còn «chia nhanh» và không còn giới hạn số cảnh.** Lỗi trước đó: bấm «Phân tích bằng Muse» với truyện dài báo «Kịch bản tạo hơn 100 cảnh…» mà chưa hỏi Muse, vì app chạy thử «chia nhanh» trên máy để đếm cảnh. Đã bỏ bước đó, bỏ nút «Chia nhanh (không dùng Muse)» ở tab này, và bỏ việc app tự chia thay Muse khi Muse trả lời hỏng/ngừng giữa chừng. Muse nhận truyện nguyên văn và được hỏi theo từng lượt nhỏ (khoảng 8 cảnh mỗi lượt). Việc đánh số câu để hỏi Muse vẫn làm trên máy, nhưng không chia cảnh.
- **Muse ngừng giữa chừng thì làm tiếp được**: app giữ các cảnh Muse đã chia, báo dừng ở câu nào, nút đổi thành **Phân tích tiếp** (làm tiếp từ câu đó, giữ nhân vật đã chốt và các cảnh đã có). **Phân tích lại từ đầu** (có hỏi xác nhận) thay hết. Sửa chữ trong ô truyện thì không làm tiếp được nữa. Câu nào Muse bỏ sót, hỏi lại vẫn không được thì dừng tại câu đó chứ không chèn cảnh «prompt mẫu». Nếu Muse trả lời sai khuôn ngay lượt đầu thì báo lỗi và không có cảnh nào.
- **Bỏ giới hạn ở tab Tạo video / Tạo ảnh**: không còn chặn «hơn 100 cảnh» khi chia kịch bản thô thành prompt và không còn chặn «hơn 500 prompt» khi nhập danh sách prompt. «Chia nhanh» kịch bản thô chỉ còn ở hai tab này (khi bạn đã có prompt sẵn).
- **Chưa thử**: Muse thật với truyện rất dài. Mỗi lượt hỏi vẫn gửi kèm cả câu chuyện để Muse hiểu ngữ cảnh, nên truyện càng dài thì tin nhắn gửi vào khung chat Muse càng dài; chưa biết khung chat Muse thật nhận tối đa bao nhiêu chữ. Nếu Muse từ chối hoặc cắt, tool báo lỗi và cho làm tiếp, không tự cắt truyện. Cũng chưa thử hàng trăm cảnh trong hàng đợi, dựng và xuất MP4 trên máy thật. Đã kiểm bằng trang chat Muse giả (truyện 170 câu, hơn 100 cảnh: hỏi đủ từng câu đúng một lần, đúng thứ tự, không chia nhanh trước; dừng giữa chừng và làm tiếp), giao diện giả và test đơn vị.

## Update 1.3.0

- Tab **Kể chuyện** có thêm chế độ **Quảng cáo sản phẩm** (làm video bán hàng / affiliate). Nút chuyển chế độ nằm đầu khung «Câu chuyện & nhân vật»; chế độ Kể chuyện giữ nguyên như 1.2.0.
- **Chỉ cần ảnh sản phẩm**: thả (dán/kéo hoặc chọn) ảnh sản phẩm, các cảnh **hiện ngay** theo một trong 6 **mẫu quảng cáo dựng sẵn** (Giới thiệu sản phẩm, Review sản phẩm, Vấn đề → giải pháp, Khuyến mãi nhanh, Mở hộp nhìn kỹ, Cao cấp tinh tế): mẫu đầu tiên chọn sẵn, đổi mẫu / tỉ lệ / độ dài (15/30/45/60 giây) thì các cảnh **tự cập nhật** ngay (nút **Tạo quảng cáo từ ảnh** / **Tạo lại cảnh** để tạo lại bằng tay). Nếu bạn đã sửa hoặc xóa một cảnh thì tool **không tự ghi đè**: chỉ báo «Đã đổi tùy chọn», bấm **Tạo lại cảnh** mới thay (có hỏi xác nhận); bỏ ảnh thì các cảnh tự tạo chưa sửa cũng biến mất. Không cần viết gì, không cần Muse phân tích: mỗi mẫu có sẵn danh sách cảnh quay (mở đầu thu hút → cận cảnh → cầm xem → bối cảnh → khung đẹp nhất của sản phẩm); độ dài video quyết định số cảnh: 15 giây = 3 cảnh × 5 giây, 30 = 5 × 6, 45 = 5 × 9, 60 = 6 × 10. Chọn mẫu sẽ điền sẵn giọng điệu, độ dài, máy quay và phong cách (vẫn sửa tay được; luôn có một mẫu đang chọn). Tên sản phẩm, máy quay, phong cách và phần lời đọc được cất trong mục **«Tùy chỉnh thêm»** (thu gọn mặc định, để màn hình ít lựa chọn); tên sản phẩm không bắt buộc (có thì đưa vào prompt).
- Các cảnh hiện ra để bạn xem và sửa prompt, rồi bấm **Tạo clip**: ảnh sản phẩm gắn vào mọi cảnh để Muse giữ đúng hình dạng/màu/bao bì. Bản này **không có lời đọc** khi đi đường «chỉ ảnh»: video giữ tiếng động của clip. Muốn có giọng đọc và phụ đề thì mở «Tùy chỉnh thêm» (ô lời quảng cáo cũng hiện ra ở đó): nhập tên sản phẩm, điểm nổi bật (mỗi dòng một ý), người xem, giá/ưu đãi, kêu gọi hành động, giọng điệu rồi bấm **Muse viết lời quảng cáo**: tool mở Muse tài khoản 1, gửi thông tin vào khung chat, chờ Muse viết xong rồi đưa lời vào ô lời quảng cáo cho bạn **sửa tay** (hoặc dán lời có sẵn). Sau đó bấm **Phân tích bằng Muse** để chia lời thành cảnh có giọng đọc, phụ đề và xuất MP4 như chế độ Kể chuyện (giọng và phụ đề đọc đúng nguyên văn lời trong ô).
- Luật gửi Muse khi viết lời: chỉ dùng thông tin bạn nhập; không bịa tính năng, thông số, con số, thành phần, giá, khuyến mãi, chứng nhận, đánh giá; không dùng từ tuyệt đối («số 1», «tốt nhất», «100%»); không nói chữa bệnh, giảm cân, hiệu quả y tế; không so sánh với sản phẩm khác; không nhắc giá nếu bạn không nhập giá. Đây là **lời dặn gửi cho Muse**, không phải bộ lọc: Muse vẫn có thể viết sai, bạn cần đọc lại lời trước khi dùng, và người đăng quảng cáo chịu trách nhiệm về nội dung.
- Ở chế độ này (cả khi Muse chia cảnh lẫn prompt mẫu) prompt hình có thêm luật quảng cáo: sản phẩm hiện rõ ở mọi cảnh và giữ đúng hình dạng/màu/bao bì như **ảnh sản phẩm** (ảnh bạn chọn được gắn vào mọi cảnh, như ảnh nhân vật ở chế độ Kể chuyện); cảnh đầu thu hút, cảnh cuối là khung đẹp nhất của sản phẩm; không cảnh so sánh, «trước/sau» hay minh họa y tế; không vẽ chữ, giá, logo mới lên hình; người trong cảnh không nói.
- **Chuyển động máy quay** chọn sẵn (tối đa 3 trong 9: cận cảnh, tiến sát, lùi xa, xoay quanh, lia ngang, từ trên cao, quay chậm, cầm tay, cố định) và **phong cách quảng cáo** (TVC, điện ảnh, review đời thường, tối giản, tươi sáng, sang trọng); lựa chọn được ghi vào prompt gửi Muse và vào prompt mẫu. Ô «Nhân vật chính» đổi thành «Người mẫu / người dùng» (không bắt buộc).
- **Xem video xuất ngay trong tab Kể chuyện** (cả hai chế độ): xuất MP4 xong thì khung phát hiện ngay dưới dòng trạng thái (phát, tua, âm lượng, toàn màn hình); đang xuất thì khung ẩn và nạp lại file mới khi xong. Nút «Mở video» vẫn mở thư mục chứa file. Từng clip vẫn xem được trong thẻ hàng đợi như trước. Chưa thử phát trên Windows thật (dùng cùng cách phát với thẻ clip sẵn có).
- Mọi ô và lựa chọn của chế độ quảng cáo được nhớ khi mở lại app; có đủ tiếng Việt và tiếng Anh.
- **Chưa có ở bản này**: Muse nhìn ảnh để tự nhận ra sản phẩm (tool không gắn ảnh vào khung chat khi viết lời, nên tên và điểm nổi bật phải do bạn nhập); chữ giá / logo / nút kêu gọi chạy trên video (tool chủ động không vẽ chữ lên hình), nhạc nền riêng, thử đồ lên người mẫu, thư viện sản phẩm. Muốn có chữ hoặc logo thì thêm bằng phần mềm dựng khác sau khi xuất MP4.
- **Chưa thử với Muse thật**, tài khoản thật, điện thoại thật, Windows thật. Đã kiểm bằng: test đơn vị (câu lệnh, đọc lời Muse viết, luật chuẩn hóa), trang chat Muse giả dựng bằng Chromium thật (`test/story-analyze-smoke.cjs`: gửi, chờ viết dần, làm sạch lời, hỏi lại khi trả lời rỗng, thiếu tên sản phẩm, đang bận, hủy) và giao diện giả (`test/story-ad-smoke.cjs`). **Chưa biết**: Muse có làm đúng độ dài clip ghi trong prompt không, Muse nhận tối đa bao nhiêu ảnh sản phẩm mỗi lần tạo, sản phẩm trong video có giống ảnh thật tới đâu, và Muse có tuân thủ các luật «không bịa» trên hay không.

## Update 1.2.0

- Thêm tab **Kể chuyện** (riêng, cạnh Tạo video và Tạo ảnh). Luồng: dán kịch bản + ảnh tham chiếu nhân vật → chia thành cảnh → Muse tạo clip qua hàng đợi sẵn có → giọng đọc → phụ đề → tự dựng → **Xuất MP4**. Chỉ việc của tab này chạy khi bấm Chạy ở tab này.
- **Giây mỗi cảnh tự tính theo lời kể** (không còn ô nhập tay): mỗi cảnh dài bằng thời gian đọc lời của cảnh đó cộng ~10% nghỉ, làm tròn lên, từ 3 đến tối đa 10 giây (Muse chỉ tạo clip tối đa 10 giây). Số giây này hiện ở tên cảnh, ghi vào prompt mẫu («Tạo video dài N giây») và được nhắn cho Muse để chia mốc thời gian trong prompt; sửa lời đọc thì giây tự tính lại. Thời gian đọc là ước lượng theo tốc độ đọc của từng ngôn ngữ; cảnh nào lời dài hơn 10 giây sẽ có cảnh báo. Chưa kiểm tra được Muse thật có tạo đúng độ dài ghi trong prompt hay không; dù Muse tạo dài hơn, bước tự dựng vẫn cắt theo giọng đọc.
- **Chỉ cần dán câu chuyện**, không cần nhãn hay cấu trúc. Toàn bộ văn bản dán vào là lời đọc: giọng đọc và phụ đề luôn dùng **đúng nguyên văn** câu chuyện (chỉ bỏ ký hiệu markdown). Tool tự đánh số từng câu; Muse chỉ quyết định câu nào thành một cảnh và viết prompt hình, nên Muse không thể sửa, bỏ hay thêm lời.
- **Đa ngôn ngữ**: tự nhận ngôn ngữ kịch bản (Việt, Anh, Tây Ban Nha, Pháp, Đức, Bồ Đào Nha, Ý, Indonesia, Nga, Thái, Ả Rập, Hindi, Trung, Nhật, Hàn); tách câu có dấu 。！？; phụ đề chữ Hán/Nhật ngắt theo ký tự; giọng Microsoft 15 ngôn ngữ, giọng hợp ngôn ngữ kịch bản được xếp lên đầu (danh sách giọng chưa thử trực tiếp với dịch vụ). Giọng clone (VieNeu) dành cho tiếng Việt.
- **Phân tích bằng Muse (tự động trong app)**: bấm «Phân tích bằng Muse», tool mở Muse tài khoản 1, gửi câu chuyện (đánh số câu) vào khung chat, chờ Muse viết xong, tự đọc trả lời rồi tách cảnh — không cần sao chép/dán. Truyện dài được hỏi theo từng phần (khoảng 8 cảnh mỗi lượt), mỗi lượt vẫn kèm cả câu chuyện để Muse hiểu ngữ cảnh và nhận lại danh sách nhân vật đã chốt. Quy tắc gửi Muse: đọc hiểu cả truyện trước, mỗi cảnh một khoảnh khắc liên tục trong độ dài video của cảnh (không nhảy thời gian/đổi địa điểm), PROMPT mô tả ai/ở đâu/lúc nào/làm gì theo mốc giây kèm nét mặt, ánh mắt, cử chỉ; mọi nhân vật có mặt trong truyện (kể cả chỉ gọi theo vai như «bà», «đám trẻ») được chốt một mô tả cố định ngắn dùng y nguyên ở mọi cảnh, người chỉ được nhắc đến mà không có mặt thì không vẽ; nhân vật không nói. **Ảnh nhân vật chính và ô «Nhân vật chính (không bắt buộc)» là tùy chọn**: chỉ khi bạn chọn ảnh thì Muse mới được yêu cầu giữ đúng nhân vật chính theo ảnh, chỉ khi bạn nhập mô tả thì mô tả đó mới được đưa vào prompt; để trống thì không có gì về ảnh/mô tả nhân vật chính được thêm vào. Câu Muse bỏ sót, đánh số chồng hoặc gom quá dài sẽ được hỏi lại đúng những câu đó một lần; vẫn sai thì thành cảnh «prompt mẫu» có nhãn để bạn xem. Có thể Dừng phân tích giữa chừng. Muse trả lời kiểu cũ («LỜI: …») thì lời vẫn được căn về nguyên văn truyện. Dán thủ công vẫn còn làm dự phòng.
- **Soát từng cảnh trước khi tạo** (để khỏi tốn lượt tạo): lời quá dài so với 10 giây, có thoại trong ngoặc kép, chuyển mốc thời gian, quá nhiều câu, prompt thiếu/ngắn hoặc thiếu câu «no speech». Chỉ cảnh báo, không chặn.
- Chia nhanh (không dùng Muse) gộp câu theo thời lượng với prompt mẫu (đánh nhãn «prompt mẫu» để bạn biết chưa qua Muse). Nhân vật không nói: mọi prompt cảnh đều có câu tiếng Anh `no speech` (không thoại, không hát, không lời bình), chỉ cho phép tiếng động; cũng dặn không chèn chữ/phụ đề/logo vào hình. «Áp ảnh cho hàng chờ» ở tab Tạo video không còn ghi đè ảnh của cảnh kể chuyện.
- Đúng thứ tự khi chạy nhiều luồng: mỗi cảnh có số riêng, clip lưu `001.mp4`, `002.mp4`… theo số cảnh dù cảnh nào xong trước; khi xuất chỉ ghép theo số cảnh và báo «Còn N cảnh chưa có clip» nếu thiếu. Clip nằm trong `KeChuyen/<mã truyện>/`.
- Giọng đọc miễn phí, có **Nghe thử**: giọng Windows có sẵn (offline, không cần Python); giọng Microsoft Edge (`edge-tts`, cần mạng, đọc tối đa 4 cảnh cùng lúc); **clone giọng miễn phí** (VieNeu, chạy trên máy, mẫu 3–15 giây, phải tick xác nhận có quyền dùng giọng đó). Edge và clone cần Python 3.10–3.13; «Cài giọng» tạo môi trường riêng trong dữ liệu app. Lần clone đầu tải mô hình từ Hugging Face. Tốc độ đọc 0,9 / 1 / 1,15 / 1,3.
- Phụ đề bật/tắt, chọn font/cỡ/màu/viền/vị trí/nền, xem trước, tùy chọn `.srt`. Phụ đề chia theo câu, thời gian tính theo **độ dài giọng đọc thật** rồi dịch ranh giới về đúng chỗ người đọc nghỉ (phát hiện khoảng lặng trong file giọng); đoạn cuối giữ đến hết cảnh.
- **Dựng nhanh và khớp**: độ dài mỗi cảnh làm tròn đúng số khung hình (1/30 giây); hình và tiếng của từng cảnh dựng riêng, nhiều cảnh chạy song song theo số nhân CPU; tiếng của mọi cảnh nối liền thành một luồng rồi mã hóa AAC đúng một lần (không lệch dần ở chỗ nối); hình giữ nguyên khi nối; chữ phụ đề chỉ phủ vùng chứa chữ. Đo trên máy thử 2 nhân: 6 cảnh 1080p có phụ đề (video 28,8 giây) từ 71 giây còn khoảng 17 giây; hình và tiếng cùng 28,800 giây, lệch 0. Máy nhiều nhân sẽ nhanh hơn nữa.
- Tự dựng: có giọng thì mỗi cảnh dài bằng lời đọc + 0,4 giây (tối thiểu 1,5 giây) và **cắt phần clip thừa**; lời dài hơn clip thì giữ khung cuối (có báo). Không có giọng thì giữ nguyên clip. Âm thanh gốc của clip (tiếng động) hạ nhỏ dưới giọng: Tắt / Nhỏ / Trung bình.
- Chưa thử với tài khoản Muse thật, điện thoại thật, Windows thật, cài Python/VieNeu/edge-tts thật, danh sách giọng Microsoft thật hay chất lượng giọng thật. **Đặc biệt phần «Phân tích bằng Muse» chưa thử với Muse thật**: đã kiểm bằng trang chat giả dựng bằng Chromium thật (gửi, chờ Muse viết dần, đọc trả lời, thiếu câu, nhiều lượt, quên mốc kết thúc, hủy, chưa đăng nhập, ô chat có bản nháp), nhưng cách Muse thật hiển thị tin nhắn/nút Dừng, giới hạn độ dài ô chat và việc Muse có làm đúng khuôn hay không phải thử thực tế; nếu lỗi, dùng «Chia nhanh» hoặc dán thủ công. Cũng chưa biết Muse nhận được mấy ảnh tham chiếu mỗi lượt. Phần ghép, cắt, thứ tự, phụ đề, đối chiếu lời với câu chuyện và giao thức giọng đọc đã kiểm bằng FFmpeg thật, Chromium thật và thư viện giọng giả. Tốc độ đọc theo ngôn ngữ chỉ là ước lượng; độ dài thật lấy từ file giọng.

## Update 1.1.11

- Thêm tab **Tạo ảnh** ở thanh bên, cạnh **Tạo video**. Hai tab dùng chung đăng nhập, danh sách tài khoản và hàng đợi; mỗi tab chỉ hiện và chỉ chạy việc của mình (nút Chạy/Tiếp tục ở tab ảnh không đụng tới cảnh video và ngược lại). Số thứ tự ảnh đánh riêng, không nối tiếp số video.
- Cách chạy một việc ảnh: nhập đúng prompt vào ô chat Muse, gửi, chờ tin nhắn của prompt, rồi chỉ nhận ảnh nằm trong phản hồi của chính prompt đó. Bỏ qua ảnh có sẵn trước khi gửi, ảnh đại diện/biểu tượng, ảnh nhỏ hơn 150px và ảnh tham chiếu nằm trong tin nhắn của bạn. Phản hồi có nhiều ảnh (biến thể) thì lưu tất cả; ảnh nằm ở nhiều khối phản hồi khác nhau thì dừng thay vì đoán.
- Chỉ lưu ảnh khi Muse đã ngừng tạo (không còn nút Dừng), ảnh đã tải xong và không đổi nguồn trong vài giây. Tool nhận dạng PNG/JPG/WEBP/GIF theo nội dung file; trang lỗi hay link hết hạn không bao giờ được lưu thành ảnh.
- Ảnh lưu vào thư mục con **Anh** của thư mục lưu: `001.png`, `002.png`…; nhiều biến thể thì `001_1.png`, `001_2.png`. Không ghi đè file cũ. Nút «Mở thư mục» ở tab ảnh mở thư mục này. Tab ảnh không có phần nối video / xuất CapCut.
- Ô tùy chọn «Thêm vào đầu mỗi prompt ảnh» (ví dụ `Tạo ảnh: `) để Muse hiểu cần ảnh; ô «CSS selector ảnh kết quả» trong Kết nối & cài đặt (mặc định `img`).
- Đã thử trên trang chat giả dựng bằng Chromium thật và giao diện giả; chưa thử trên tài khoản Muse thật. Nếu Muse hiển thị ảnh theo cách khác (ví dụ ảnh nền CSS, hoặc ảnh tải qua lightbox), dùng «Xuất thông tin lỗi chat» để chỉnh bước tiếp theo.

## Update 1.1.10

- Sửa cảnh vẫn kẹt ở «Đã thấy tin nhắn · chờ Muse phản hồi» khi video đã hiện trong chat. Hai nguyên nhân đã sửa: (1) tool coi khối trả lời là «cũ» nếu Muse tạo nó trước khi tin nhắn prompt hiển thị xong chữ; (2) tool chỉ nhận cấu trúc chat theo vài mẫu cố định. Khi không nhận ra cấu trúc, tool dùng cách thứ hai: lấy clip mới xuất hiện sau tin nhắn prompt trong cùng vùng chat (bỏ clip cũ, clip ngoài vùng chat, clip sau tin nhắn khác); có hai clip mới thì vẫn dừng để không tải nhầm.
- Thẻ đang chờ ghi lý do chi tiết hơn trong ngoặc.
- Số điện thoại ở phần Liên hệ: 0397580658.

## Update 1.1.9

- Sửa cảnh kẹt ở «Đã thấy tin nhắn · chờ Muse phản hồi» dù video đã hiện trong chat: Muse đôi khi trả lời bằng nhiều khối (một câu, clip, rồi một ghi chú) và tool chỉ nhìn khối ngay sau prompt. Giờ tool đọc các khối trả lời đến trước prompt kế tiếp, vẫn chỉ nhận đúng một clip của đúng prompt; có hai clip thì vẫn dừng để không tải nhầm. Khôi phục sau khi mở lại app dùng cùng cách, không đọc quá dòng prompt khác trong hàng đợi.
- Khi cảnh còn chờ, thẻ ghi thêm lý do trong ngoặc (đã thấy mấy video mới nhưng chưa gắn được vào prompt, hoặc chưa thấy video mới).
- Thêm nút «Liên hệ» ở cuối thanh bên: bấm để xem mã QR Zalo của chủ phần mềm.
- Đã thử trên trang giả dựng bằng Chromium thật; chưa thử trên tài khoản Muse thật.

## Update 1.1.8

- Ô «Phiên tài khoản» ở thanh bên luôn có đủ Tài khoản 1–10 để đăng nhập, không còn bị giới hạn theo ô «Chạy song song». Mỗi tài khoản là một trình duyệt tích hợp riêng, cookie riêng. Có thể đăng nhập sẵn cả 10 rồi mới chọn «Chạy song song» lên 10; tài khoản nằm ngoài số trình duyệt đang chạy sẽ có dòng nhắc, và hàng đợi vẫn chỉ dùng đúng số trình duyệt đã chọn.
- Mở, đăng xuất và xuất thông tin lỗi chat dùng được cho cả 10 tài khoản.

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
