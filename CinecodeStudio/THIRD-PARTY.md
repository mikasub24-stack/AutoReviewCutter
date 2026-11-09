# Thành phần bên thứ ba

- Cinecode capture.mjs: https://github.com/sarpstar/cinecode, commit 67f9807112b97ae253d4a5f0eccaccc46c3b2633, MIT. Giấy phép nguyên văn trong vendor/LICENSE-cinecode.txt. Chỉ dùng bộ capture, không đóng gói toàn bộ skill/agent.
- Node.js 22.23.4: https://nodejs.org/, MIT và giấy phép phụ thuộc trong runtime/NODE-LICENSE.txt (bộ cài).
- FFmpeg: bản static do imageio-ffmpeg 0.8.1 cung cấp, https://github.com/imageio/imageio-ffmpeg. FFmpeg có thành phần GPL; phân phối kèm giấy phép và liên kết mã nguồn tương ứng trong runtime/FFMPEG-README.txt và các file giấy phép imageio. Cấu hình chính xác có thể xem bằng runtime/ffmpeg.exe -version. FFmpeg chạy như tiến trình riêng.
- Python 3.13 và Tcl/Tk: các giấy phép trong _internal của bản đóng gói PyInstaller.

Mã giao diện và engine Canvas riêng của CinecodeStudio trong repo này được cấp phép MIT. Tài sản ảnh/nhạc/lời đọc người dùng chọn chịu giấy phép riêng.

- CustomTkinter 5.2.2: https://github.com/TomSchimansky/CustomTkinter (MIT); darkdetect (BSD-3-Clause); Pillow 13 (MIT-CMU/HPND). Giấy phép được kèm cùng bản đóng gói.

- Cinecode gốc được phân phối đầy đủ dưới vendor/cinecode, giữ nguyên 168 file của commit đã ghim và giấy phép upstream.
- Bản 0.2 có Python chuẩn từ toolchain CPython Windows (PSF licence), cùng bộ FFmpeg/ffprobe GPL shared do BtbN/FFmpeg-Builds phát hành; URL và SHA-256 archive được ghim trong scripts/prepare_upstream_runtime.ps1.
