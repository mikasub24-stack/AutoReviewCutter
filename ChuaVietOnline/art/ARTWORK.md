# Nguồn hình ảnh

- `temple_sanctuary.png`: tranh chính điện mới tạo bằng công cụ tạo ảnh trong phiên làm việc cho dự án này, theo bố cục tham chiếu người dùng cung cấp. Không chứa giao diện hay nhân vật được dùng làm tương tác.
- `characters.png` (nếu có): sprite sheet nhân vật mới tạo trong cùng phiên, tách tư thế và trang phục bằng AtlasTexture lúc chạy.
- `stone_floor.png` (nếu có): vật liệu sàn mới tạo trong cùng phiên.
- `monk_*`, `nun_*`, `ui_*`: SVG được vẽ cho dự án, không cần font biểu tượng bên ngoài. SVG nhân vật là fallback khi không có sprite sheet.
- Các SVG chính điện, bồ đoàn và sàn gỗ ban đầu được giữ từ mã nguồn hiện có.

Ảnh tham chiếu của người dùng chỉ dùng để định hướng bố cục; không nhúng giao diện mẫu thành màn hình giả.

## Tài sản dùng cho nghi thức 0.3.0

`hall_background.png`, `meditation_cushion.png`, `ritual_monk_brown.png`, `ritual_monk_grey.png` và `ritual_nun_grey.png` được tạo cho dự án trong phiên này. Các atlas có 12 tư thế đứng, chắp tay, hạ gối, quỳ, cúi, phủ phục, đứng lên, thiền, dâng hương và bước chân. Khung phủ phục đã chỉnh về góc nhìn từ phía sau. Metadata chỉ chọn vùng ảnh, không đổi nội dung sprite.
