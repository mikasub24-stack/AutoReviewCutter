# Cấp key dành cho chủ phần mềm

App cho dùng thử 24 giờ từ lần mở đầu tiên. Hết hạn chỉ chặn tạo/gửi prompt mới; vẫn có thể mở app để nhập key, xem danh sách hoặc xuất file đã có.

Key trả phí dùng chữ ký Ed25519 và gắn với mã máy. Chỉ khóa kiểm tra công khai `src/license-public.pem` được đưa vào app/GitHub. Khóa ký riêng không được đưa vào repo, file EXE hoặc gửi cho khách.

Khóa ký riêng đã được tạo ở môi trường làm việc, ngoài repository: `/workspace/muse-license-owner/private.pem`. Chủ phần mềm cần sao lưu riêng tệp này ở nơi an toàn trước khi môi trường làm việc bị xóa; có thể mở tệp văn bản trong workspace và lưu bản sao cục bộ. Không đưa vào GitHub/Drive chia sẻ công khai. Mất khóa ký riêng sẽ không cấp thêm key tương thích bản app hiện tại được.

Với Node.js, lấy mã máy khách gửi từ mục Dùng thử / Kích hoạt key và chạy:

```
node tools/issue-key.cjs DUONG_DAN_KHOA_RIENG.pem MA_MAY_KHACH 30
```

Số cuối là thời hạn ngày; dùng `1` để cấp key một ngày. Chỉ gửi chuỗi key kết quả cho khách. File khóa ký riêng luôn ở máy chủ/chủ phần mềm.

QR BIDV hướng tới đúng tài khoản người dùng cung cấp, không có số tiền cố định hay tên chi nhánh. Khách chuyển khoản kèm mã máy rồi liên hệ chủ phần mềm xác nhận để nhận key. App không đọc giao dịch ngân hàng và không tự cấp key sau thanh toán.

Đây là cơ chế offline cơ bản, không phải hệ thống cấp phép chống can thiệp mạnh: mã nguồn công khai có thể sửa và trạng thái dùng thử cục bộ có thể bị xóa/reset. Khi kinh doanh cần máy chủ quản lý trial/key và xác nhận thanh toán riêng. Không quảng cáo là chống reset tuyệt đối hoặc thanh toán tự động.
