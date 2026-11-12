# Wan Local Studio 0.1.0

App Windows tiếng Việt điều khiển Wan qua ComfyUI đã cài trên máy. Chọn **Dọn nhà bỏ hoang** hoặc **Sinh tồn trong rừng**, nhập số phút và bấm **Tạo video tự động**. Không cần API cloud, Claude, tài khoản TTS hay nhập ảnh từng cảnh.

## Chuẩn bị lần đầu

1. ComfyUI phải chạy trên máy, mặc định `http://127.0.0.1:8188`. App không cài lại, nâng cấp hay tự khởi động ComfyUI. Đổi cổng ở Cài đặt nếu bạn đã dùng cổng khác.
2. Có đủ bộ Wan 2.2 TI2V 5B chính thức:
   - `models/diffusion_models/wan2.2_ti2v_5B_fp16.safetensors` (~9,31 GB)
   - `models/text_encoders/umt5_xxl_fp8_e4m3fn_scaled.safetensors` (~6,27 GB)
   - `models/vae/wan2.2_vae.safetensors` (~1,31 GB)
   - Hướng dẫn và link tải chính thức: https://docs.comfy.org/tutorials/video/wan/wan2_2
3. Nếu ComfyUI chưa có node `Wan22ImageToVideoLatent`, cập nhật ComfyUI theo hướng dẫn chính thức. Nếu hết VRAM, mở ComfyUI với `--lowvram` thay vì mở thêm một server khác. App không tự sửa file khởi động của bạn.
4. Cài Setup của app. Mở app, thử **0,1 phút = 6 giây** trước. Video nằm trong `Videos/WanLocalStudio` của tài khoản Windows; có thể đổi ở Cài đặt. Bộ cài không chứa model gần 17 GB; model bạn đã có được dùng lại.

## Tự động làm gì?

- Kế hoạch cảnh có sẵn theo tiến trình công việc cho hai chủ đề. Đây là kịch bản theo mẫu, không phải LLM tự sáng tác mọi chủ đề tùy ý. Mỗi dự án lưu prompt tiếng Anh, seed và toàn bộ workflow để kiểm tra được.
- Cảnh đầu tạo từ chữ. Tool tự giữ khung đầu làm tham chiếu gốc và lấy khung cuối mỗi cảnh làm ảnh đầu vào cảnh kế tiếp. Giữ cố định mô tả nhân vật, trang phục, kiến trúc/địa điểm.
- Render lần lượt 121 khung hình/cảnh, 832×480, 24 fps, 20 bước UniPC. Encoder văn bản trên CPU, VAE giải mã theo ô để giảm VRAM. Đây là cấu hình khởi đầu cho 3060 12GB / RAM 32GB, chưa có đo đạc inference trên máy đó.
- ComfyUI trả PNG theo thứ tự. FFmpeg kèm app mã hóa cảnh, bỏ khung tham chiếu trùng ở các cảnh nối rồi ghép MP4 H.264 đúng số khung tương ứng thời lượng yêu cầu.
- Lưu tiến độ và SHA-256 của từng cảnh/tham chiếu. Mở lại thư mục dự án để tiếp tục; cảnh hoàn tất còn nguyên không gửi render lại. Khóa dự án ngăn hai cửa sổ cùng gửi tác vụ.
- Mất kết nối sau khi gửi: app tìm lại tác vụ bằng mã yêu cầu trong queue/history, không tự gửi POST lần hai. Nếu ComfyUI đã khởi động lại và mất history, người dùng kiểm tra queue rồi dùng **Tạo lại cảnh lỗi**.
- **Tạm dừng** chỉ xóa tác vụ đang chờ thuộc dự án này. Cảnh đang chạy có thể tiếp tục trong ComfyUI; app không gọi `/interrupt` toàn cục làm dừng workflow khác. Mở lại dự án để nhận kết quả.
- Nhạc nền của bạn là tùy chọn trong Cài đặt. Không có giọng đọc, nhạc AI hay âm thanh hành động tự sinh. Không tự kéo giãn/lặp clip để giả đủ số phút.

## Giới hạn quan trọng

Wan có thể làm lệch mặt, tay, vật dụng, cấu trúc hoặc tiến độ công việc dù được giữ ảnh tham chiếu. Nối khung cuối có thể tích lũy sai lệch; đây không phải khóa nhận dạng hay hệ thống kiểm duyệt hình ảnh tự động. Cảnh dài có thể lặp hành động vì kế hoạch theo mẫu. Chưa bảo đảm chất lượng như quay thật hoặc render thành công trong 12 GB VRAM trên mọi phiên bản ComfyUI/model; cần thử cảnh ngắn trên máy thật.

Chưa có phép thử inference GPU tại môi trường build. Kiểm tra tự động dùng dữ liệu giả để kiểm tra API, lưu/tiếp tục, tham chiếu và dùng FFmpeg thật để kiểm tra số khung MP4; không lấy video thử tổng hợp làm bằng chứng chất lượng Wan. Không có GPU cloud miễn phí được kèm app.

Model và ComfyUI được tải riêng từ nhà phát hành. App chỉ nhận địa chỉ loopback trên máy; không gửi ảnh/video tới dịch vụ cloud. ComfyUI và extension bạn cài có hoạt động mạng riêng nằm ngoài app này.

## Mã nguồn và build

`python -m unittest discover -s WanLocalStudio/tests -v`

Windows build chạy trong `.github/workflows/wan-local-studio-windows.yml`: khóa phiên bản/hash phụ thuộc, test logic và FFmpeg, mở GUI nguồn/đóng gói/đã cài, đóng Setup và quét Defender. App chưa có chữ ký số nhà phát hành; kết quả Defender không xác nhận Chrome/Cốc Cốc sẽ chấp nhận file tải về.
