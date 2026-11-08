# Cinecode Studio 0.1.2

Ứng dụng Windows 10/11 x64 có giao diện tiếng Việt, dùng bộ xuất khung hình Cinecode của sarpstar. Bản đầu dựng phim ngắn chữ/ảnh và motion graphics với ba bảng màu, chưa có trình dựng nhân vật 3D hoặc toàn bộ quy trình agent của Cinecode.

## 0.1.2 · Video 10 phút, chọn model và lỗi Gemini

- Chọn nhanh 600 giây; AI viết theo từng phần tối đa 120 giây, nối ngữ cảnh, tối đa 40 cảnh. Tổng thời lượng được căn theo khung hình về đúng lựa chọn. Tạo lời đọc có thể kéo dài cảnh: nếu tổng vượt 10 phút, app yêu cầu rút gọn thay vì cắt mất nội dung.
- Cài đặt AI có hộp chọn model viết/model đọc (vẫn gõ tên được) và nút lấy danh sách từ Google. Danh sách không bảo đảm tài khoản có hạn mức dùng từng model.
- HTTP 503/500/502/504 hoặc giới hạn tạm thời 429 được thử tối đa 3 lần; hiện thời gian chờ, tôn trọng Retry-After ngắn và cho hủy trong lúc chờ. Không thử lại lỗi khóa/quyền/model hoặc hết hạn mức ngày. Không đổi model âm thầm.
- Hiện thông báo cụ thể từ Google (đã ẩn khóa), giữ nguyên kịch bản khi yêu cầu thất bại. Không cam kết retry sẽ xử lý được gián đoạn dịch vụ kéo dài.

## Giao diện và video hoàn tất

Giao diện mới dùng các vùng ý tưởng/kịch bản/âm thanh, chữ lớn hơn, cuộn nội dung và giữ nút xuất video ở cuối cửa sổ. Sau khi xuất, dùng **Mở video**, **Tải video** (lưu thêm một bản MP4, không dựng lại) hoặc **Mở thư mục**. Bản gốc đã xuất được giữ nguyên.

## Dùng nhanh

1. Chạy bộ cài, mở Cinecode Studio. Máy cần Chrome hoặc Microsoft Edge (Edge có sẵn trên phần lớn máy Windows).
2. Dùng dự án mẫu để **Xem trước hình** hoặc **Xuất MP4** ngay, không cần AI.
3. Muốn AI viết nội dung: vào **Cài đặt AI**, nhập khóa Gemini của bạn. Có ô chọn tên mô hình viết kịch bản và TTS theo quyền tài khoản; mặc định TTS Gemini 3.8 theo Cinecode gốc, cũng hỗ trợ định dạng âm thanh PCM của Gemini 2.5 TTS. Khóa được Windows DPAPI mã hóa theo tài khoản Windows, không ghi vào dự án. Yêu cầu gửi tới Google và có thể tính phí/hạn mức theo tài khoản. Không cần Claude Code/Cursor cho app này.
4. Nhập ý tưởng, chọn thời lượng/khung hình/phong cách, bấm **AI viết kịch bản**. Chọn từng cảnh ở bên trái để sửa tiêu đề, chữ, lời đọc và thời lượng. Có thể thêm ảnh PNG/JPG/WebP riêng cho từng cảnh; app không tự sinh ảnh hay video người thật.
5. Thêm nhạc/lời đọc từ máy, hoặc chọn **Ngôn ngữ đọc: Tiếng Việt / English**, bấm **AI tạo lời đọc** (Gemini TTS; quyền truy cập và chất giọng phụ thuộc dịch vụ). AI viết phần narration theo ngôn ngữ đã chọn; có thể tự sửa lời đọc. Lời đọc AI được tạo theo từng cảnh và kéo dài cảnh nếu cần; nhạc được lặp và hạ mức dưới lời đọc. Xuất âm thanh có chuẩn hóa loudness mục tiêu −14 LUFS (một lượt). Ngôn ngữ đọc lưu cùng dự án.
6. **Lưu dự án** để mở và chỉnh tiếp. Dự án tham chiếu ảnh/âm thanh gốc: giữ các file này ở vị trí cũ. Xem trước chỉ phát hình; nghe bản đầy đủ qua MP4 đã xuất. Sửa lời đọc cần tạo lại file TTS.

Node 22 và FFmpeg được kèm bộ cài; không cần cài Python/Node riêng. Trình dựng chạy trên máy; chỉ AI viết kịch bản và giọng đọc cần mạng. Phim tối đa 40 cảnh/10 phút; mỗi cảnh 1–60 giây, khung hình 16:9 1280×720, 9:16 720×1280 hoặc 1:1 960×960, 30fps. Không phải công cụ tạo video AI như Veo. Không đưa tài liệu mật vào AI; dùng ảnh/nhạc bạn có quyền sử dụng.

## Phát triển

Python 3.12, CustomTkinter 5.2.2, Pillow 12, Tkinter, Node 22+, Chrome/Edge, FFmpeg/ffprobe trên PATH. `python CinecodeStudio/app.py`; kiểm tra `python -m unittest discover -s CinecodeStudio/tests`; thử render thật `python CinecodeStudio/tests/render_smoke.py`. AI được kiểm thử parser và xử lý lỗi; tích hợp Google cần khóa/hạn mức thật để xác nhận.

Workflow `.github/workflows/cinecode-studio-windows.yml` dựng và thử bộ cài trên Windows. Giữ nguyên mã Vocal Studio. Backend Cinecode được ghim tại commit 67f9807112b97ae253d4a5f0eccaccc46c3b2633.
