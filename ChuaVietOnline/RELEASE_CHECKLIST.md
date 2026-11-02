# Chùa Việt Online — kiểm thử và triển khai

## Trạng thái
Dự án Godot 4.3, màn hình dọc Android. Phòng chính điện có 1.000 bồ đoàn. Trình khách WebSocket và máy chủ Node.js hỗ trợ giữ chỗ độc quyền. **Không coi bản build là đã đạt chất lượng phát hành trước khi hoàn thành các kiểm thử bên dưới.**

## Kiểm thử máy chủ
```sh
cd ChuaVietOnline/realtime
npm install
npm test
npm start
```
Mở `http://localhost:8788/` để kiểm tra phản hồi JSON; WebSocket ở `ws://localhost:8788`. Trên điện thoại thật không sử dụng localhost làm địa chỉ máy chủ, vì localhost trỏ về chính điện thoại.

## Chạy trong Godot
Dùng Godot 4.3, mở `ChuaVietOnline/project.godot`. Trong terminal:
```sh
godot --headless --path ChuaVietOnline --editor --quit
godot --headless --path ChuaVietOnline --quit-after 20
```
Mọi SCRIPT ERROR hoặc Parser Error phải được xử lý trước khi xuất bản.

## Tạo APK
GitHub Actions: `.github/workflows/chua-viet-online-apk.yml`. Workflow kiểm tra máy chủ, nhập project, chạy smoke test, rồi xuất APK debug và lưu artifact. Cần xác nhận workflow **success** và cài thử artifact trên thiết bị Android. Không nên phát hành APK debug như bản thương mại.

## Máy chủ trực tuyến
File `render.yaml` ở gốc repository chứa cấu hình Render. Kết nối repository với Render bằng tài khoản chủ sở hữu và tạo Web Service/Blueprint; Render sẽ cấp địa chỉ máy chủ. Trong giao diện **Tu tập**, nhập địa chỉ WebSocket dạng `wss://<ten-dich-vu>.onrender.com`, sau đó bấm kết nối. Không có địa chỉ Render thực tế nào được thiết lập sẵn trong APK.

## Danh sách kiểm thử bắt buộc trước khi bàn giao
- [ ] APK được build thành công và cài được trên điện thoại Android.
- [ ] Chạm, joystick, camera, di chuyển và đổi nhân vật hoạt động trên màn hình dọc.
- [ ] Hai điện thoại thấy avatar nhau và cùng đồng bộ vị trí.
- [ ] Hai người không thể chiếm cùng một bồ đoàn.
- [ ] Đứng dậy, ngắt mạng, kết nối lại đều giải phóng/khôi phục ghế hợp lý.
- [ ] Toàn bộ nghi thức, hoạt ảnh, bộ đếm 108 hạt, lễ vật và lưu tiến trình hoạt động.
- [ ] Có file ghi âm tụng kinh thật, bản quyền sử dụng rõ ràng; âm lượng và phát/dừng kiểm thử được.
- [ ] Đồ họa đạt bản tham chiếu đã duyệt, không còn hình khối sơ sài.
- [ ] Kiểm tra hiệu năng, kích thước APK, âm thanh, quyền Android và lỗi trên thiết bị thật.

**Lưu ý:** bản hiện tại chưa hoàn thành toàn bộ các mục trên; đặc biệt chưa có ghi âm tụng kinh thật, chưa triển khai dịch vụ Render và chưa xác minh APK trên thiết bị.
