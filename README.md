# AutoReviewCutter

Nhánh `main`: app gốc (cắt đều mỗi đoạn 4 giây).

Nhánh `scene-detect`: **Auto Review Cutter+** — app riêng (cài song song, `applicationId` = `com.autoreview.cutter.scene`), thêm:

- **Cắt theo đổi cảnh**: quét video bằng FFmpeg (4 khung/giây), cắt đúng ở chỗ đổi cảnh, không đoạn nào vắt qua hai cảnh.
- **Bỏ đoạn đen / đứng hình**.
- Cảnh dài được chia nhỏ (~4 giây), cảnh ngắn dưới 1,5 giây bị bỏ; lấy luân phiên các video, hết thì quay vòng.
- Hai tuỳ chọn tắt được; tắt cả hai thì cắt đều như app cũ.

APK dựng tự động bởi GitHub Actions, tải ở mục **Releases** (tên `scene-<số>`).

Chạy thử phần tính toán trên máy tính (cần Java 17+, ffmpeg): `tools/host-test/run.sh`.
