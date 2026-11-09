# Cinecode Studio 0.1.4

Ứng dụng Windows 10/11 x64 có giao diện tiếng Việt, dùng bộ xuất khung hình Cinecode của sarpstar. Bản đầu dựng phim ngắn chữ/ảnh và motion graphics với ba bảng màu, chưa có trình dựng nhân vật 3D hoặc toàn bộ quy trình agent của Cinecode.

## 0.1.4 · Đóng gói và đối chiếu nguồn gốc

Cập nhật Python 3.13, Node 22.23.4, PyInstaller 6.22.3, imageio-ffmpeg 0.8.1, Pillow 13.0.0. Phụ thuộc Windows có phiên bản và SHA-256 khóa trong requirements-windows.lock; Node được đối chiếu với checksum bản phát hành chính thức. EXE có thông tin phiên bản, không dùng UPX; bộ cài có BuildManifest.json liệt kê checksum runtime và mã nguồn tương ứng.

Các thay đổi này không chứng minh nguyên nhân trình duyệt đã chặn bản cũ. Chưa có chứng thư ký mã của nhà phát hành; kết quả quét Defender không phải xác nhận của Chrome/Cốc Cốc. Không hướng dẫn bỏ qua cảnh báo hoặc tắt bảo vệ.

## 0.1.3 · Video 10 phút, chọn model và lỗi Gemini

- Chọn nhanh 600 giây; AI viết theo từng phần tối đa 120 giây, nối ngữ cảnh, tối đa 40 cảnh. Tổng thời lượng được căn theo khung hình về đúng lựa chọn. Tạo lời đọc có thể kéo dài cảnh: nếu tổng vượt 10 phút, app yêu cầu rút gọn thay vì cắt mất nội dung.
- Cài đặt AI có hộp chọn model viết/model đọc (vẫn gõ tên được) và nút lấy danh sách từ Google. Danh sách không bảo đảm tài khoản có hạn mức dùng từng model.
- HTTP 503/500/502/504 hoặc giới hạn tạm thời 429 được thử tối đa 3 lần; hiện thời gian chờ, tôn trọng Retry-After ngắn và cho hủy trong lúc chờ. Không thử lại lỗi khóa/quyền/model hoặc hết hạn mức ngày. Không đổi model âm thầm.
- Hiện thông báo cụ thể từ Google (đã ẩn khóa), giữ nguyên kịch bản khi yêu cầu thất bại. Không cam kết retry sẽ xử lý được gián đoạn dịch vụ kéo dài.

## 0.1.4 · Hủy yêu cầu đang chờ, thử model và làm video tự động

- **Hủy** dừng cả tiến trình đang chờ phản hồi HTTP, không phải đợi timeout. App giữ nguyên dự án đang mở và không áp dụng kết quả đến sau khi hủy. Yêu cầu Google đã nhận có thể vẫn được dịch vụ xử lý/tính hạn mức; hủy ở app không thu hồi được yêu cầu đã tới máy chủ.
- **Cài đặt AI → Kiểm tra model viết / Kiểm tra model đọc** gửi một yêu cầu nhỏ thật theo đúng chế độ app dùng. Chỉ báo dùng được sau khi nhận JSON hợp lệ/âm thanh giải mã được; 503/429/quyền/model không tồn tại có trạng thái riêng. Model chưa thử ghi rõ chưa kiểm tra. Kết quả ghi giờ thử và gắn với khóa đang nhập, chỉ lưu trong phiên vì quyền/hạn mức có thể thay đổi.
- **Tạo video tự động**: dán tiêu đề hoặc kịch bản, chọn Việt/Anh và thời lượng, chọn nơi lưu MP4 một lần. App viết cảnh, tạo lời đọc, dựng Canvas 2D rồi ghép MP4. Nhạc đã chọn được dùng lại nếu có. Ảnh/nền chuyển động vẫn là engine tích hợp; không tự tạo footage người thật.
- Dự án, lời đọc và nội dung đầu vào được lưu trong thư mục dự án cạnh MP4. Nếu Google từ chối hoặc model không hoạt động, quy trình dừng với lỗi cụ thể; không hứa hoàn tất khi dịch vụ AI gián đoạn.

## Video tiếng Anh

Chọn **Ngôn ngữ video → English** ở phía trên ô ý tưởng rồi bấm **AI viết kịch bản**: tiêu đề, chữ trên màn hình và lời đọc đều được yêu cầu viết tiếng Anh, dù ý tưởng nhập bằng tiếng Việt. **AI tạo lời đọc** dùng cùng ngôn ngữ. Dự án lưu lựa chọn này. Đổi ngôn ngữ không tự dịch chữ của dự án đang mở: viết lại kịch bản bằng AI hoặc sửa chữ trước khi xuất.

## Giao diện và video hoàn tất

Giao diện mới dùng các vùng ý tưởng/kịch bản/âm thanh, chữ lớn hơn, cuộn nội dung và giữ nút xuất video ở cuối cửa sổ. Sau khi xuất, dùng **Mở video**, **Tải video** (lưu thêm một bản MP4, không dựng lại) hoặc **Mở thư mục**. Bản gốc đã xuất được giữ nguyên.

## Dùng nhanh

1. Chạy bộ cài, mở Cinecode Studio. Máy cần Chrome hoặc Microsoft Edge (Edge có sẵn trên phần lớn máy Windows).
2. Dùng dự án mẫu để **Xem trước hình** hoặc **Xuất MP4** ngay, không cần AI.
3. Muốn AI viết nội dung: vào **Cài đặt AI**, nhập khóa Gemini của bạn. Có ô chọn tên mô hình viết kịch bản và TTS theo quyền tài khoản; mặc định TTS Gemini 3.8 theo Cinecode gốc, cũng hỗ trợ định dạng âm thanh PCM của Gemini 2.5 TTS. Khóa được Windows DPAPI mã hóa theo tài khoản Windows, không ghi vào dự án. Yêu cầu gửi tới Google và có thể tính phí/hạn mức theo tài khoản. Không cần Claude Code/Cursor cho app này.
4. Nhập ý tưởng, chọn thời lượng/khung hình/phong cách, bấm **AI viết kịch bản**. Chọn từng cảnh ở bên trái để sửa tiêu đề, chữ, lời đọc và thời lượng. Có thể thêm ảnh PNG/JPG/WebP riêng cho từng cảnh; app không tự sinh ảnh hay video người thật.
5. Thêm nhạc/lời đọc từ máy, hoặc chọn **Ngôn ngữ video: Tiếng Việt / English**, bấm **AI tạo lời đọc** (Gemini TTS; quyền truy cập và chất giọng phụ thuộc dịch vụ). AI viết phần narration theo ngôn ngữ đã chọn; có thể tự sửa lời đọc. Lời đọc AI được tạo theo từng cảnh và kéo dài cảnh nếu cần; nhạc được lặp và hạ mức dưới lời đọc. Xuất âm thanh có chuẩn hóa loudness mục tiêu −14 LUFS (một lượt). Ngôn ngữ đọc lưu cùng dự án.
6. **Lưu dự án** để mở và chỉnh tiếp. Dự án tham chiếu ảnh/âm thanh gốc: giữ các file này ở vị trí cũ. Xem trước chỉ phát hình; nghe bản đầy đủ qua MP4 đã xuất. Sửa lời đọc cần tạo lại file TTS.

Node 22 và FFmpeg được kèm bộ cài; không cần cài Python/Node riêng. Trình dựng chạy trên máy; chỉ AI viết kịch bản và giọng đọc cần mạng. Phim tối đa 40 cảnh/10 phút; mỗi cảnh 1–60 giây, khung hình 16:9 1280×720, 9:16 720×1280 hoặc 1:1 960×960, 30fps. Không phải công cụ tạo video AI như Veo. Không đưa tài liệu mật vào AI; dùng ảnh/nhạc bạn có quyền sử dụng.

## Phát triển

Python 3.13, CustomTkinter 5.2.2, Pillow 13, Tkinter, Node 22+, Chrome/Edge, FFmpeg/ffprobe trên PATH. `python CinecodeStudio/app.py`; kiểm tra `python -m unittest discover -s CinecodeStudio/tests`; thử render thật `python CinecodeStudio/tests/render_smoke.py`. AI được kiểm thử parser và xử lý lỗi; tích hợp Google cần khóa/hạn mức thật để xác nhận.

Workflow `.github/workflows/cinecode-studio-windows.yml` dựng và thử bộ cài trên Windows. Giữ nguyên mã Vocal Studio. Backend Cinecode được ghim tại commit 67f9807112b97ae253d4a5f0eccaccc46c3b2633.
