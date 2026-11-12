# Hunyuan Local Studio 0.3.1

App Windows tiếng Việt: chọn chủ đề, nhập số phút, bấm Tạo video. Bản này chỉ dùng **HunyuanVideo 1.5**, không tải/chạy hoặc tiếp tục dự án Wan. Hồ sơ nhân vật mới trong `%LOCALAPPDATA%/HunyuanLocalStudio/character`, không nhập ảnh mờ hoặc cảnh Wan cũ. Khi chuẩn bị bộ chạy mới, ảnh/profile nhân vật Wan cũ do app lưu cũng được bỏ. Thư mục nguồn/tên exe nội bộ giữ để cập nhật từ bộ cài cũ; tên hiển thị và Setup là Hunyuan Local Studio.

## Cài và tạo mới

1. Đóng app cũ, cài Setup. Nếu app cũ còn render, dùng nút Xóa dự án đang tạo để chọn và dừng dự án đó trước.
2. Cài đặt → Ổ lưu model nếu cần chọn ổ nhiều chỗ. App tính dung lượng tải từ Git LFS metadata, kiểm tra ổ trống, tải tiếp khi ngắt và xác minh SHA-256. Không cần tự cài Python, ComfyUI hoặc tải trọng số bằng tay.
3. **Cài & tải model** hoặc bấm Tạo video đều tự chuẩn bị bộ chạy. Tool bỏ đúng ba file trọng số Wan cũ của tool trong thư mục managed; không xóa model tùy ý của người dùng. Model Hunyuan hoàn toàn riêng. Nếu còn tác vụ ComfyUI thì không dọn trọng số đang dùng.
4. Thử **0,1 phút = 6 giây** trước. Nhập được 0,1–60 phút nhưng video dài có thể mất rất nhiều giờ. Chưa đo tốc độ trên 3060.
5. Tạo xong mỗi cảnh: ảnh xem trước hiện trong tool, chọn cảnh đã xong để mở clip ngay. Đây là kết quả cảnh hoàn tất, không phải preview từng bước khử nhiễu. Khi đang sinh cảnh, trạng thái cho biết đang chờ. Ghép xong có **Xem video / Lưu như… / Thư mục**.

## Model và chất lượng

- HunyuanVideo 1.5 720p T2V tạo cảnh đầu khi chưa có ảnh nhân vật Hunyuan; I2V tạo các cảnh sau. Tự tải UNET tương ứng, Qwen 2.5 VL FP8, ByT5, VAE và SigCLIP. Setup không nhúng các trọng số lớn.
- Sinh gốc 1280×720, 121 khung/cảnh, 24 fps. Không upscale 480p. Euler/simple, CFG 6, shift 9 T2V / 7 I2V, 50 bước theo hướng dẫn Tencent/ComfyUI.
- UNET FP8 e4m3fn, text encoder trên CPU, ComfyUI `--lowvram`, không pinned RAM/async offload. **Tencent công bố tối thiểu 14 GB VRAM với offload. Cấu hình FP8 chưa kiểm chứng trên RTX 3060 12 GB.** Có thể thiếu bộ nhớ hoặc chậm. NVENC chỉ tăng tốc mã hóa MP4; không tăng tốc các bước AI sinh hình.
- VAE chia ô không gian 512/64, giữ temporal_size 4096 / overlap 8 theo khuyến nghị Hunyuan. Clip Wan người dùng gửi bị nhấp nháy theo nhịp 12 khung, trùng stride giải mã cũ 16/4. Sửa cấu hình này không bảo đảm model hết mọi méo tay/mặt hoặc chi tiết sai.
- Nhân vật mới mặc định: nữ châu Á trưởng thành 24 tuổi, da sáng, tóc đen buộc cao, áo thể thao hai dây crop top đen ôm dáng, legging đen và giày trắng. Chỉ ảnh gốc mới do Hunyuan tạo được dùng lại cho các video Hunyuan sau; ảnh Wan không được nhập.
- Khung cuối cảnh trước làm đầu vào VAE để nối cảnh; SigCLIP dùng ảnh gốc để giữ tham chiếu nhân vật. Đây là điều chỉnh so với template dùng cùng ảnh, chưa kiểm chứng chất lượng, không phải adapter khóa khuôn mặt. Vẫn có thể lệch nhân vật/vật dụng và sai hành động.

## Xóa dự án đang tạo

Nút **Xóa dự án đang tạo** yêu cầu xác nhận đúng thư mục rồi dừng worker, xóa hàng đợi và gửi `/interrupt` có `prompt_id` cụ thể, không gọi ngắt toàn bộ ComfyUI. Chỉ khi các tác vụ đó đã dừng mới xóa file. Khi chưa mở dự án, nút cho chọn thư mục có project.json, gồm cả dự án Wan cũ để bỏ đi; dự án Wan không được tiếp tục sinh.

Xóa clip, file tạm, tham chiếu và project.json trong dự án; với ComfyUI do tool quản lý còn xóa output theo đúng project ID, input đã ghi nhận và lịch sử tác vụ đó. Ảnh hồ sơ do chính dự án bị xóa tạo ra cũng được bỏ nếu hash và nguồn khớp, để lần sau tạo mặt mới. Không xóa model Hunyuan đã tải, dự án khác hoặc ảnh hồ sơ từ nguồn khác. Không thể hoàn tác. File đã Lưu như ở ngoài dự án không bị xóa.

Với ComfyUI có sẵn ngoài bộ quản lý, app chỉ có API dừng tác vụ/xóa lịch sử và quyền xóa thư mục dự án; không xóa được PNG trong thư mục server không biết đường dẫn. Nếu không kết nối được server chứa tác vụ thì báo lỗi, chưa xóa dự án để tránh tác vụ chạy mồ côi. Đóng cửa sổ cũ trước khi xóa; dự án đang được cửa sổ khác giữ khóa sẽ không bị xóa.

## Dựng và tiếp tục

Mã hóa MP4 dùng NVENC nếu probe encode thật thành công, nếu không thì CPU. Chỉ giữ hai clip trong bước chuyển cảnh, bỏ khung đầu lặp, hòa trộn 0,25 giây và ghép đủ thời lượng. Nhạc người dùng là tùy chọn, hạ âm lượng và fade. Model không tự tạo tiếng động/giọng đọc. Kế hoạch cảnh theo mẫu cho hai chủ đề; không có LLM hoặc kiểm tra tự động xác nhận hành động đã đúng.

Chỉ dự án Hunyuan được tiếp tục, nhận lại cảnh đã xong và hiện preview. Request ID/intent được ghi trước POST, tìm lại tác vụ khi mất mạng, không tự gửi trùng. Tạm dừng giữ dữ liệu; Xóa dự án mới hủy và dọn. ComfyUI giữ PNG output để nhận lại tác vụ khi tiếp tục; video dài cần nhiều ổ trống.

## Bộ chạy và phạm vi kiểm tra

ComfyUI portable v0.45.0 NVIDIA CUDA 12.6, SHA-256 `e7d1be2bd81deec3f46a89e29b8c6826f45c05609f29d6681d7876f687d69d29`. Model từ Comfy-Org trên Hugging Face; chỉ dùng sau khi hash và kích thước khớp LFS metadata. Nếu ComfyUI cấu hình sẵn đủ bộ Hunyuan thì dùng lại; không thay driver, Python hoặc pagefile hệ thống. Dữ liệu mặc định `%LOCALAPPDATA%/WanLocalStudioData` để nhận biết và dọn trọng số cũ; có thể chọn ổ khác. Chỉ kế thừa ổ model từ cấu hình cũ, không kế thừa ảnh hoặc phút tạo.

Windows CI kiểm tra GUI nguồn/native/đã cài, preview/clear, FFmpeg/7-Zip thực, dựng synthetic MP4 đúng kích thước/thời lượng, download/hash mô phỏng, queue/journal và xóa đúng phạm vi. Build dùng Nuitka/MSVC standalone, không onefile/UPX. Defender scan chặn phát hành nếu có phát hiện. Setup chưa ký số; chưa có xác nhận Chrome/Cốc Cốc chấp nhận.

Môi trường build không có RTX 3060 và không chạy inference Hunyuan hay tải toàn bộ model. Hugging Face bị chặn trong môi trường phát triển; các bài kiểm tra HTTP dùng dữ liệu mô phỏng. Không dùng chúng để khẳng định chất lượng mặt, tốc độ, VRAM hoặc luồng tải model thật đã được kiểm chứng.
