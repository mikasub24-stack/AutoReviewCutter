# Ninh Đôn TTS cho Android

Đọc văn bản tiếng Việt bằng giọng Ninh Đôn / Adam / Tùng Đặng **ngay trên điện thoại** (ngoại tuyến sau lần tải dữ liệu đầu).
Dựng APK hoàn toàn trên GitHub Actions, không cần máy tính.

- Động cơ: VieNeu‑TTS v3 Turbo (Apache‑2.0) chạy bằng [audio.cpp](https://github.com/0xShug0/audio.cpp) (ggml, CPU)
- Bộ chuyển chữ → âm: [sea‑g2p](https://github.com/pnnbao97/sea-g2p) (Rust)
- Giọng: tạo sẵn một lần trên CI từ 3 tệp trong `voices/` (bằng Python `vieneu`)
- App: Java thuần, giao diện giống tab Ninh Đôn của Auto Studio (nghỉ giữa câu / giữa đoạn, thẻ `[nghỉ 2s]`, nghe / lưu / chia sẻ)

## Cài APK
1. Mở trang **Releases** của repo trên điện thoại, tải `NinhDonTTS.apk` của bản mới nhất.
2. Mở tệp, cho phép "cài ứng dụng không rõ nguồn" nếu máy hỏi.
3. Mở app → bấm **Tải dữ liệu giọng nói** (khoảng 250 MB, nên dùng Wi‑Fi; mất mạng giữa chừng bấm lại sẽ tải tiếp).
4. Dán văn bản, chọn giọng, bấm **Tạo giọng đọc**. Giữ màn hình mở trong lúc đọc.

Yêu cầu: Android 10 trở lên, chip 64‑bit, nên còn trống ≥ 1 GB RAM. Kết quả lưu ở *Tải xuống/NinhDonTTS*.

Chữ ký APK cố định (khoá nằm trong `android/keystore`, dùng chung công khai), nên bản sau cài đè được lên bản trước.
Khoá này chỉ để cài đè, không dùng để phát hành ra ngoài.

## Dựng lại
Đẩy lên một nhánh bất kỳ không phải `main` (hoặc bấm *Run workflow*). Workflow `.github/workflows/build-apk.yml` có các bước:

| Bước | Việc |
| --- | --- |
| `data` | tải mô hình + từ điển, tính SHA‑256, sinh `files.txt` (danh sách app sẽ tải) |
| `voices` | chạy `tools/make_voices.py` tạo `ref_codes.txt` + `speaker.emb.txt` cho 3 giọng |
| `smoke` | dựng engine cho máy chủ x86 và đọc thử bằng 3 giọng (kiểm tra mô hình + giọng + g2p) |
| `apk` | dựng sea‑g2p + audio.cpp + JNI cho arm64, đóng gói APK có ký |
| `release` | đăng `NinhDonTTS.apk` lên Releases |

Nhật ký các bước được đẩy lên nhánh `ci-logs` (thư mục `logs/`) để dễ đọc khi lỗi.

## Bố cục
```
android/            dự án Gradle (app Java, tài nguyên, khoá ký)
native/             lõi C++ gọi audio.cpp + cầu JNI + chương trình thử (smoke)
tools/              make_voices.py (tạo giọng), check_libs.py (kiểm tra thư viện .so)
scripts/            dựng native, tải mã nguồn, ghi nhật ký lên ci-logs
voices/             3 tệp WAV mẫu
```

## Giới hạn đã biết
- Chưa có dịch vụ nền: nếu chuyển sang app khác lâu, Android có thể làm đơ việc đọc. Hãy để app mở.
- Tốc độ phụ thuộc chip; máy yếu có thể chậm hơn thời gian thực khá nhiều.
- Bộ nhớ ngữ cảnh được giảm (512/256/256 MB) để chạy trong RAM điện thoại.
