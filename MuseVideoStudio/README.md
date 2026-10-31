# Muse Video Studio 0.5 · Windows

## Nhập prompt và ảnh

1. Với bộ prompt đã viết sẵn (như `PROMPT 01 — 8 seconds`), chọn mặc định **Tự nhận diện PROMPT / SCENE / CẢNH — giữ nguyên** và dán toàn bộ văn bản.
2. Chọn một ảnh chung cho tất cả prompt, hoặc ảnh theo số thứ tự. Chọn thư mục ảnh `01.png`, `02.png`, … để tự ghép đúng số prompt, không phụ thuộc thứ tự hộp chọn file. Nhiều ảnh cùng số được gắn vào cùng cảnh; ảnh không khớp/cảnh thiếu ảnh được báo rõ.
3. Bấm **Đọc / cập nhật danh sách** để xem/sửa hoặc bấm **Tạo video** để nhập rồi chạy. Có thể dán ảnh ở ô chung hoặc từng dòng. **Áp ảnh cho tất cả prompt đang chờ** cập nhật các tác vụ đã có.
4. Nếu danh sách cũ đã bị tách sai, bấm **Xóa tất cả đang chờ**, dán lại văn bản gốc rồi tạo. Không tự xóa công việc cũ khi nâng cấp.

Mỗi khối prompt hoàn chỉnh được giữ nguyên hành động, nhân vật và camera, không tách câu/đoạn hay thêm mẫu chat. Nếu có nhãn `VIDEO PROMPT` và `ENGLISH VOICEOVER`, chỉ phần video được gửi; lời dẫn được lưu riêng để dựng. Bộ văn bản 100 KB người dùng cung cấp đã được kiểm tra là **60 prompt × 8 giây**, thay vì hàng trăm mảnh. Văn bản đó không được đưa lên GitHub.

Chỉ dùng chế độ **Kịch bản thô → prompt theo mẫu** khi muốn tool thực sự viết thêm mẫu hướng dẫn. Chế độ này dùng quy tắc, không có mô hình AI hoặc dịch tự động. Thời lượng/tỉ lệ trong prompt là yêu cầu gửi Muse, không bảo đảm clip thực tế luôn đúng; muốn nối đúng tổng thời lượng cần kiểm tra kết quả.

## Dừng, xóa và đóng app

- **Dừng ngay** hủy chờ/polling trong tool và chặn prompt tiếp theo. Tác vụ đang chạy chuyển thành bị gián đoạn. Tác vụ đã gửi lên máy chủ Muse có thể tiếp tục; không hứa hủy từ xa khi chưa có nút/API hủy được xác minh.
- **Xóa tất cả đang chờ** chỉ xóa tác vụ chưa gửi. **Xóa toàn bộ danh sách** dừng rồi xóa metadata; giữ file video đã tải.
- Đóng cửa sổ app sẽ dừng hàng đợi, lưu phiên và đóng các trình duyệt do app mở. Chỉ một instance được chạy; mở lần nữa đưa cửa sổ đang chạy lên trước.

## Tài khoản, trình duyệt và VPN

Cài đặt cho phép chọn trình duyệt tích hợp, Chrome, Edge hoặc Chromium khác. Mỗi loại trình duyệt và mỗi tài khoản dùng hồ sơ riêng do app tạo; không dùng hồ sơ Chrome/Edge cá nhân. Có thể mở tối đa4 tài khoản, mỗi tài khoản chạy một prompt và lấy việc tiếp theo khi rảnh.

Nút **Đăng xuất tài khoản này** xác nhận rồi xóa dữ liệu đăng nhập của đúng hồ sơ đang chọn; các tài khoản khác và trình duyệt cá nhân giữ nguyên. Cookie phiên được lưu mã hóa với Electron safeStorage (Windows DPAPI); không đưa vào file xuất hoặc repo. Phiên vẫn có thể bị Muse thu hồi/hết hạn.

Mục VPN chỉ mở trang nhà cung cấp/ứng dụng VPN do người dùng cài; **không kèm máy chủ, tài khoản hoặc tự kết nối tunnel**. Người dùng cần đăng ký VPN, chọn gói có máy chủ USA và kết nối trong app VPN. Khi bật yêu cầu USA (mặc định), tool kiểm tra IP từ chính session trình duyệt trước điều hướng đăng nhập Muse và trước gửi prompt. Thất bại hoặc chưa ra US thì dừng. Quan sát US tại endpoint kiểm tra không chứng minh mọi lưu lượng qua cùng tuyến; VPN hệ thống thường dùng chung cho tất cả tài khoản.

## Gửi ảnh và giới hạn Muse

Không còn popup xác nhận ảnh mỗi tác vụ. Tool chờ preview ảnh mới, trạng thái tải kết thúc và nút gửi sẵn sàng; hỗ trợ selector ảnh sẵn sàng riêng nếu DOM Muse khác. Không nhận được tín hiệu thì báo lỗi trước khi gửi, không gửi mù. Với giao diện chỉ tạo file input sau dấu +, cần mở phần đính kèm trên Muse trước hoặc hiệu chỉnh adapter.

Chưa có quyền truy cập tài khoản/DOM Muse thực để xác minh end-to-end. Player iframe/MSE, URL video tái sử dụng, nút tải đặc thù hoặc thay đổi HTML có thể cần chỉnh selector/adapter. Kiểm thử dùng Chromium/fixture cục bộ và giả lập, không thay thế chạy tài khoản thực. Không tự retry tác vụ lỗi để tránh dùng credit trùng.

## Dùng thử, key và QR

Dùng thử24 giờ tính từ lần mở đầu tiên. Hết hạn chỉ chặn tạo/gửi prompt mới; vẫn xem/xuất clip và nhập key được. Key gắn với mã máy và được ký Ed25519. Xem [hướng dẫn chủ phần mềm](tools/README.md) để cấp key; khóa ký riêng không nằm trong app/GitHub.

QR BIDV theo thông tin người dùng cung cấp: TRIEU VAN TINH, 3950588072, không có PGD/chi nhánh, không gắn số tiền cố định. Chuyển khoản không tự kích hoạt key; chủ phần mềm phải kiểm tra giao dịch và cấp key thủ công. Hệ thống offline cơ bản có thể bị reset/sửa source; bán thương mại cần backend trial/license và xác nhận thanh toán riêng.

## Xuất video

Mặc định giữ clip riêng. Nút **Xuất clip cho CapCut** tạo gói media đánh số đúng thứ tự và lời dẫn riêng; người dùng import vào CapCut rồi kéo lên timeline. Chưa phải native project tự mở timeline.

Nối MP4 tùy chọn cần FFmpeg/ffprobe trên máy (chưa đóng kèm): chọn ffmpeg.exe cùng thư mục ffprobe.exe trong Cài đặt. Chuẩn hóa1920×1080/30fps H.264/AAC, giữ âm thanh hoặc thêm im lặng, giữ file nguồn. Chỉ nối/xuất gói đầy đủ khi mọi cảnh hoàn tất.

## Phát triển và kiểm thử

Node22 trở lên: `npm ci`, `npm test`, `npm run test:ui`, `npm run dist:win`. Test UI và browser smoke cần Chromium; đặt CHROMIUM_PATH nếu khác /usr/bin/chromium. `node test/attachment-ready-smoke.cjs` kiểm tra readiness ảnh trên DOM fixture thật. FFmpeg smoke riêng: `npm run test:merge`.

Các test đơn vị kiểm tra import60 cảnh, mapping ảnh, hủy job đang chờ, xóa hàng loạt, vòng đời cửa sổ, phiên mã hóa, IP trước đăng nhập, trial/key và QR. Test trình duyệt không gọi dịch vụ Muse hoặc ngân hàng. Bản Windows unsigned được build qua GitHub Actions, tải ở Releases.
