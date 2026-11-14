# YT Cookie Exporter 2.3.0

Sửa một bộ Douyin bị chia thành nhiều nhóm theo ảnh bìa. Mặc định gom một bộ; giữ parser và cách xếp thứ tự tập. Chỉ tách khi có mã bộ Douyin và người dùng bật tùy chọn. Giữ các video khác URL bị trùng số tập, không âm thầm bỏ tập.

Link tải trực tiếp được đối chiếu đúng aweme_id, không lấy video đề xuất hoặc đổi chuỗi URL đã ký. Chức năng xuất cookie và quyền truy cập của bản gốc giữ nguyên; không có cookie người dùng trong gói này.

Tải ZIP ở Releases, giải nén và chép đè sáu file trong YT_Cookie_Exporter vào thư mục extension cũ; Reload extension rồi F5 Douyin.

Kiểm tra: 17 test Node, Chromium UI với Chrome API mô phỏng, không có lỗi JavaScript. Chưa kiểm tra cài extension trên trình duyệt người dùng hoặc trực tiếp kênh Douyin vì môi trường phát triển chặn truy cập trang này. Không thay đổi số thứ tự bằng OCR.
