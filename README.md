# Cấp Key (Android)

Ứng dụng cấp key bản quyền **Auto Studio (AS1-…)** và **AnimStudio (AN1-…)** ngay trên điện thoại — cùng định dạng, cùng khóa ký với `tao_key.py` trên máy tính.

- **Không kèm khóa riêng.** Lần đầu mở app, nhập 64 ký tự trong `private.key` (dán hoặc chọn file). Khóa được mã hóa bằng Android Keystore và chỉ nằm trong máy.
- **Không có quyền Internet**, tắt sao lưu đám mây.
- Danh sách key đã cấp lưu trên máy, xuất CSV được.
- `tools/host-test/run.sh`: chạy thử Ed25519 (vector RFC 8032) + so key với key do Python tạo.
- Dựng APK: GitHub Actions (nhánh `keytool`), APK đăng ở Releases.

> Đổi khóa riêng (`tao_khoa_moi`) thì key cũ mất hiệu lực và phải nhập khóa mới vào app.
