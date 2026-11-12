# Wan Local Studio 0.2.0

App Windows tiếng Việt cho RTX 3060 12GB / RAM 32GB. Màn hình gọn: chọn **Dọn nhà bỏ hoang** hoặc **Sinh tồn trong rừng**, nhập số phút và bấm **Tạo video**. Nút **Cài & tải bộ Wan** cho phép chuẩn bị dữ liệu trước; bấm Tạo khi chưa có bộ chạy cũng tự thực hiện bước chuẩn bị.

## Cài và dùng

1. Cài Setup, mở app. Không cần cài Python, ComfyUI hay giải nén model bằng tay.
2. Lần đầu tải gần 20 GB, cần khoảng 40 GB ổ trống. Muốn dùng ổ D/E: **Cài đặt → Ổ lưu model** trước khi tải. Dữ liệu mặc định trong `%LOCALAPPDATA%/WanLocalStudioData`. Dữ liệu tải qua HTTPS từ nhà phát hành, có kiểm tra SHA-256, tải dở được giữ để tiếp tục.
3. Chọn chủ đề, thử **0,1 phút = 6 giây** rồi bấm Tạo. Video dài trên 3060 có thể mất nhiều giờ; chưa có đo tốc độ inference trên máy thật.
4. App tự mở ComfyUI riêng ở cổng 8189, kiểm tra CUDA và chạy Wan. Nếu ComfyUI có sẵn ở địa chỉ cấu hình và đủ model thì dùng lại, không sửa bản cài đó. Nếu chưa có thì tải bản portable NVIDIA CUDA 12.6 chính thức, Python và thư viện có sẵn trong gói đó. Không thay Python hệ thống hoặc cài driver NVIDIA tự động. Driver NVIDIA trên máy vẫn phải tương thích CUDA 12.6.
5. Video hoàn tất có nút **Xem video**, **Lưu như…**, **Thư mục**. **Tiếp tục dự án** dùng lại các cảnh đã lưu nếu bị ngắt.

## Nhân vật qua các video

Mặc định: một phụ nữ châu Á trưởng thành 24 tuổi, da sáng, khuôn mặt oval, mắt nâu, tóc đen buộc cao, áo thể thao hai dây crop top màu đen ôm dáng, quần legging đen, giày trắng. Cả hai chủ đề dùng cùng nhân vật và bộ đồ. Đây là phong cách chân thực, không dùng tên/người thật cụ thể.

Ảnh đầu cảnh mở đầu của video đầu được lưu thành ảnh nhân vật gốc trong `%LOCALAPPDATA%/WanLocalStudio/character`, tách khỏi ổ model. Các video mới tự sao chép ảnh đó vào dự án và dùng làm đầu vào cảnh mở; trong mỗi video, khung cuối cảnh trước tiếp tục làm đầu vào cảnh sau. Seed, prompt và workflow cũng được lưu. **Xem nhân vật gốc** nằm trong Cài đặt.

Đây là giữ tham chiếu ảnh bằng Wan TI2V, không phải adapter khóa khuôn mặt. Không có phép kiểm tra tự động xác nhận “đẹp” hoặc đúng danh tính. Khuôn mặt, tay, dụng cụ, bối cảnh vẫn có thể lệch theo góc nhìn/chuyển động; nối nhiều cảnh có thể tích lũy sai lệch. Chưa thể bảo đảm giống tuyệt đối qua mọi cảnh/video. Cảnh mở được dùng lại để giữ nhân vật; các video cùng chủ đề dùng kế hoạch theo mẫu, không phải LLM sáng tác vô hạn.

## Tự dựng và GPU

- Wan 2.2 TI2V 5B tạo lần lượt 121 khung/cảnh, 832×480, 24 fps, 16 bước UniPC cho dự án mới. Encoder văn bản trên CPU, VAE giải mã theo ô, ComfyUI chạy `--lowvram`. Chưa xác nhận inference thành công/VRAM cụ thể trên 3060 thật.
- Kiểm tra NVENC bằng một lần encode thật trước khi chọn `h264_nvenc`; nếu driver/binary không dùng được thì báo chuyển sang CPU. Wan vẫn dùng CUDA. Không giả báo mã hóa GPU chỉ vì FFmpeg có tên encoder.
- Mỗi cảnh kiểm tra đủ khung, mã hóa MP4. Tự bỏ khung tham chiếu lặp, cắt đầu/cuối và tạo chuyển cảnh hòa trộn 0,25 giây. Số cảnh tính bù phần chuyển cảnh để MP4 cuối đủ thời lượng. Chỉ xử lý hai clip một lúc để tránh tải tất cả clip vào RAM.
- Nhạc của người dùng là tùy chọn, tự hạ âm lượng và fade đầu/cuối. Wan không tự sinh tiếng động/giọng đọc. Không tự lặp hoặc kéo giãn clip để giả đủ thời lượng.
- Không có bộ kiểm duyệt ngữ nghĩa xác nhận mọi hành động đúng. Chuyển cảnh giúp bớt giật, không sửa được lỗi người/vật do model sinh.

## Dữ liệu và tiếp tục

Bộ portable được ghim ở ComfyUI v0.45.0 NVIDIA cu126, đối chiếu SHA-256 công bố trong GitHub Releases. Model tải từ Comfy-Org trên Hugging Face; đọc Git LFS metadata lấy SHA-256/kích thước và ghim revision khi có header commit, chỉ sử dụng sau khi hash đúng. Gồm UNET `wan2.2_ti2v_5B_fp16.safetensors`, encoder `umt5_xxl_fp8_e4m3fn_scaled.safetensors`, VAE `wan2.2_vae.safetensors`. Bản Setup nhỏ không nhúng gần 20 GB dữ liệu này.

Tải lỗi giữ file `.part`, bấm lại để tiếp tục. Nếu máy chủ không hỗ trợ Range, tải lại file đó thay vì nối sai dữ liệu. Hết ổ hoặc sai checksum sẽ dừng với lỗi rõ ràng, chưa chạy file sai. Gói giải nén ở vùng dữ liệu riêng của tool, không cài Python/Git/ComfyUI vào hệ thống. Bản ComfyUI được tool mở có thể tiếp tục chạy sau khi đóng app để giữ tiến trình/history.

Dự án lưu prompt, request ID, cảnh và SHA-256, khung tham chiếu. Mất kết nối sau POST: tìm tác vụ cũ trong queue/history, không tự gửi trùng. ComfyUI khởi động lại làm mất queue/history thì cần kiểm tra rồi dùng **Tạo lại cảnh lỗi**. Tạm dừng không gọi `/interrupt` toàn cục; cảnh đang chạy có thể tiếp tục để nhận kết quả sau.

ComfyUI giữ các PNG đã tạo trong thư mục output riêng; app giữ MP4/tham chiếu và xóa PNG tải tạm sau mã hóa. Video dài có thể dùng thêm nhiều GB ở output của ComfyUI. Không tự xóa PNG trên server vì còn cần để tiếp tục tác vụ.

## Phạm vi kiểm tra

Test dùng server HTTP giả lập để kiểm tra tải tiếp/hash, API ComfyUI, tham chiếu giữa cảnh và giữa dự án; dùng FFmpeg thật kiểm tra chuyển cảnh và đủ số khung MP4. Windows CI thử trình giải nén kèm app bằng gói portable nhỏ giả lập, mở GUI nguồn/đóng gói/đã cài và quét Defender.

Môi trường build không có GPU 3060 và không thực hiện tải toàn bộ 20 GB hoặc inference Wan. Hugging Face bị chặn bởi mạng môi trường phát triển nên chưa kiểm chứng luồng tải thật ở đây; app phải tải trên kết nối của máy người dùng. Các test mô phỏng không chứng minh tải/model/GPU thực tế đã thành công. App chưa ký số nhà phát hành; Defender không bảo đảm Chrome/Cốc Cốc chấp nhận file tải.
