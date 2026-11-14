# H3 Studio 0.1.0

App Windows tiếng Việt để viết kịch bản bằng API tương thích OpenAI, tạo ảnh nhân vật,
gửi cảnh đến MiniMax H3 qua RunningHub hoặc ComfyUI có sẵn, xem clip và xuất MP4.

## Cài và bắt đầu

Chạy H3Studio-0.1.0-Setup.exe, mở **Kết nối**, nhập API của bạn rồi **Lưu kết nối**.
Không gửi API key lên chat. Windows lưu key bằng DPAPI của tài khoản hiện tại;
project.json không chứa key. Các API cloud có thể tính phí riêng.

- **RunningHub:** nhập key có quyền workflow/API, số dư và quyền model. Workflow ID công khai
  2097511747551842305 được dùng làm điểm bắt đầu. App gửi graph native Ref2VA riêng từ mẫu
  ComfyUI chính thức; máy chủ phải hỗ trợ custom workflow, các node và tên model trong Kết nối.
  Kiểm tra kết nối chỉ xác nhận đọc workflow, không xác nhận chạy được graph hoặc mức giá.
  Nếu tài khoản/instance không có model, cần cài/chọn model trên máy cloud hoặc dùng workflow
  của bạn. Chưa chạy thử inference trên tài khoản RunningHub thật trong bản build này.
- **ComfyUI:** tùy chọn cho người đã có server; app không tự cài hay tải H3 lên RTX 3060.
  Cần ComfyUI hỗ trợ H3, model Ref2VA, text encoder, video/audio VAE tương ứng.
  App kiểm tra object_info và hai model trước khi gửi. Không bảo đảm 3060 12GB chạy ổn.
- **Kịch bản và ảnh:** cấu hình endpoint/model/API key riêng. Nếu không dùng API ảnh,
  lập kịch bản trước rồi chọn ảnh nhân vật trong tab Nhân vật. Có thể nhập kịch bản JSON.

Nhập ý tưởng, ngôn ngữ Anh/Việt, phong cách, số phút, tỷ lệ và độ phân giải.
Chọn **Lập kịch bản** để xem trước, hoặc **Tạo toàn bộ phim** để tạo kịch bản, ảnh còn thiếu,
các cảnh và ghép MP4. Nên tạo thử 0,17 phút (khoảng 10 giây) trước.
Mỗi cảnh 4–15 giây; tối đa 240 cảnh, tối đa 20 phút yêu cầu. Thời lượng thực của clip
phụ thuộc model và lời thoại; app không kéo giãn clip để làm đủ số phút giả.

## Dự án và chỉnh sửa

Mỗi dự án có project.json, ảnh tham chiếu, clip và MP4 cuối. Mở lại project.json để tiếp tục.
Task ID được lưu ngay sau khi nhận. Dừng chờ không hủy tác vụ cloud đã gửi;
vào RunningHub hủy nếu cần tránh chi phí tiếp tục. App kiểm tra lại task ID khi mở lại,
không tự tạo lại cảnh đã gửi. Nếu gửi mất phản hồi, app đánh dấu cần kiểm tra trước khi gửi lại.

Chọn cảnh để sửa prompt/lời thoại, tạo một cảnh, xem clip hoặc nhập MP4 đã có.
Tạo lại cảnh là thao tác có thể tính phí thêm; clip gốc vẫn nằm trong thư mục dự án.
Lưu tham chiếu nhân vật cho mọi cảnh có nhân vật đó; âm thanh tham chiếu tối đa 3 giọng/cảnh.
Hiện upload audio tự động chỉ có ở RunningHub. Các cảnh có thể vẫn lệch mặt/khẩu hình/giọng:
phải xem và chọn lại, không có bảo đảm nhất quán tuyệt đối.

**Nhạc nền** chọn âm thanh được phép dùng, khi render nhạc hạ dưới tiếng nói.
**Ghép & xuất MP4** cân mức tiếng, chuẩn hóa hình, ghép theo thứ tự kịch bản, giữ tốc độ lời thoại.
Nút Phụ đề AI nhận dạng âm thanh thực qua API tương thích OpenAI, lưu SRT và gắn vào hình.
Có API key âm thanh thì Tạo toàn bộ phim tự thêm bước phụ đề; nhận dạng có thể sai và cần xem lại.
Chưa có dựng reaction cut tự động.
**Xem phim**, **Lưu như…** và **Thư mục** dùng được sau khi xuất.
640p là khung gốc 1152×640; 768p là 1344×768 (đảo chiều cho dọc), đều theo bội số 32 của model.
App không gọi video phóng lớn là 1080p gốc.

## Kiểm chứng và giới hạn

Kiểm thử dùng API mô phỏng, FFmpeg thật, GUI Windows và EXE đã đóng gói.
Chưa sinh video H3 thật; chưa benchmark tốc độ, chất lượng, khẩu hình tiếng Việt hay giá.
Không cam kết mức 27 tệ/5 phút trong bài viết. Không có model GPU trong bộ cài.
Bộ cài chưa ký số, không thể bảo đảm trình duyệt chấp nhận file mới.

## Build

Dùng workflow .github/workflows/h3-studio-windows.yml. Nuitka standalone, FFmpeg đi kèm,
Inno Setup, kiểm thử và báo cáo Defender; source tương ứng phát hành cùng bộ cài.
