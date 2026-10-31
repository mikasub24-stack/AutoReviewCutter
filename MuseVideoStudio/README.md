# Muse Video Studio 0.3 · Windows prototype

Ứng dụng Windows riêng cho prompt/ảnh → video Muse, hàng đợi nhiều tài khoản và chuẩn bị clip để dựng. Không thay đổi AutoReviewCutter.

## Cách dùng

1. Trong Cài đặt chọn 1–4 tài khoản đồng thời. Chọn từng số ở thanh bên, mở Muse / Đăng nhập, đăng nhập trực tiếp và vào chat. Mỗi số có hồ sơ trình duyệt riêng.
2. Chọn thư mục lưu. Nhập từng prompt và đính kèm ảnh tham chiếu riêng; có thể dán nhiều prompt để tách thành dòng rồi chỉnh. Một prompt có thể có nhiều ảnh nếu Muse hỗ trợ.
3. Chạy hàng đợi. Mỗi tài khoản chạy một prompt, xong lấy prompt tiếp theo. Có lỗi thì dừng phát prompt mới; các tác vụ đã gửi ở tài khoản khác được phép hoàn tất.
4. Sau khi xong: giữ clip riêng, xuất gói clip để nhập CapCut, hoặc nối MP4. Mặc định mới là giữ clip riêng.

## Chọn trình duyệt

Trong Cài đặt → Trình duyệt đăng nhập, chọn trình duyệt tích hợp, Google Chrome, Microsoft Edge hoặc Chromium khác bằng đường dẫn .exe. Đóng các cửa sổ tài khoản trước khi đổi trình duyệt. Chrome/Edge phải được cài sẵn; nếu không tìm thấy thì chọn đường dẫn thực thi. Không hỗ trợ Firefox/Safari trong bản này.

Mỗi trình duyệt và mỗi số tài khoản có hồ sơ riêng do app tạo, không đọc hay dùng hồ sơ Chrome/Edge cá nhân đang mở. Vì vậy cần đăng nhập lần đầu khi chuyển trình duyệt. Hồ sơ ngoài nằm trong external-browser-profiles/<loại trình duyệt>/account-N; cookie phiên mã hóa riêng trong external-account-sessions. Không chọn thư mục Chrome cá nhân: adapter chỉ chấp nhận thư mục app đã đánh dấu sở hữu hoặc thư mục mới trống.

Chrome/Edge ngoài app được điều khiển bằng Playwright; cho phép mở trang đăng nhập nhà cung cấp để bạn thao tác thủ công, nhưng tự gửi prompt/tải ảnh chỉ trên Muse. Thoát app bình thường sẽ lưu phiên rồi đóng các cửa sổ Chrome/Edge do app mở. Nếu tự buộc đóng Chrome/Edge, vài thay đổi cookie trong khoảng 2 giây gần nhất có thể chưa kịp lưu bản bổ sung. Cần thử đăng nhập thực trên Windows.

## Kịch bản → Prompt

Dán cả kịch bản trong mục Kịch bản → Prompt tự động, chọn kiểu chia, giây/cảnh, tỉ lệ, phong cách và giới hạn ký tự/cảnh. Bấm Chia cảnh & tạo prompt; tool nhận diện Cảnh 1/Scene 1, đoạn trống hoặc câu theo chế độ. Các đoạn quá dài được tách tiếp, tối đa 100 cảnh/lượt. Giữ nội dung và thứ tự; không tự gửi ngay khi dán.

Xem/sửa prompt và thêm ảnh tham chiếu riêng, rồi bấm Tạo video để thêm và chạy toàn bộ prompt đang chờ. Hoặc chọn Chỉ thêm vào hàng đợi để chạy sau. Cần chọn thư mục lưu và mở tài khoản Muse trước.

**Bản này chia cảnh theo quy tắc và sinh prompt tiếng Việt theo mẫu, chưa gọi mô hình AI để hiểu/viết lại nội dung hay dịch sang tiếng Anh.** Hành động, máy quay, phong cách, thời lượng và tỉ lệ nằm trong prompt; Muse quyết định thông số được hỗ trợ. Giữ nhân vật nhất quán là chỉ dẫn, không bảo đảm tính liên tục khi model xử lý từng cảnh độc lập. Cần xem lại phần chia cảnh, nhất là các kịch bản có lời dẫn hoặc nhãn không chuẩn.

## Nhớ đăng nhập

Cookie có thời hạn và web storage nằm trong các hồ sơ Electron persist:muse-account-1, persist:muse-account-2, … trên máy. Cookie phiên của Muse được lưu bổ sung vào account-sessions/account-N.enc dưới thư mục dữ liệu người dùng của app. Bản Windows dùng Electron safeStorage với Windows DPAPI gắn với người dùng Windows; không lưu cookie ra JSON hay văn bản.

App khôi phục cookie trước khi mở Muse, lưu khi cookie thay đổi/đóng cửa sổ/thoát bình thường, và chặn mở hai instance để tránh ghi chồng hồ sơ. Đăng xuất trên Muse cũng cập nhật bản lưu để không khôi phục cookie đã xóa. Không yêu cầu nhập mật khẩu hoặc cookie vào tool.

Phiên vẫn có thể hết hạn, bị thu hồi hoặc yêu cầu xác minh lại từ Muse. Không bảo đảm đăng nhập vĩnh viễn hay mọi cơ chế auth đều chỉ dùng cookie/localStorage. Nếu hệ điều hành không hỗ trợ mã hóa, app không lưu cookie phiên dạng văn bản và sẽ báo giới hạn. Bản lưu lỗi hoặc không giải mã được được giữ nguyên; cần đăng nhập lại. Khi đã thoát app có thể di chuyển tệp .enc lỗi ra nơi khác để lần đăng nhập tiếp theo tạo lại bản lưu. Không chia sẻ thư mục dữ liệu đăng nhập.

## Clip rời để edit trong CapCut

Nút Xuất clip cho CapCut tạo thư mục CapCut_Clips_<id>, gồm clips/0001.mp4, 0002.mp4, … theo thứ tự prompt, manifest.json, danh sách thứ tự và hướng dẫn. Giữ nguyên dữ liệu clip, không nối hoặc mã hóa lại; clip nguồn vẫn được giữ nguyên. Gói không có cookie hay đường dẫn nguồn tuyệt đối, nhưng có nội dung prompt và số tài khoản xử lý.

Mở dự án mới hoặc dự án hiện có trong CapCut → Import/Nhập các clip → sắp xếp tên tăng dần và kéo lên timeline. Giữ thư mục media ở vị trí cố định để CapCut tìm được file.

**Đây là gói media để nhập thủ công, chưa phải file project CapCut tự mở sẵn timeline.** App chưa tự điều khiển CapCut hoặc chèn vào project đang mở; không tuyên bố tương thích định dạng project native của mọi phiên bản.

## Nối video khi cần

Tự nối mặc định tắt ở 0.2, kể cả nâng cấp từ 0.1. Có thể bật lại trong Cài đặt → Sau khi tạo xong toàn bộ prompt, hoặc dùng nút Nối video ngay khi toàn bộ prompt hoàn tất. Có thể chọn tự xuất gói clip thay vì tự nối.

Cần FFmpeg có libx264 và ffprobe trên Windows. Cài bản build được liên kết tại https://ffmpeg.org/download.html, đặt ffmpeg.exe và ffprobe.exe cùng thư mục rồi chọn ffmpeg.exe trong Cài đặt, hoặc thêm cả hai vào PATH. Hai công cụ chưa đóng kèm bản portable. Giữ clip riêng/xuất gói CapCut không cần FFmpeg.

Các cảnh được chuẩn hóa về 1920×1080, 30 fps, H.264/AAC với viền đen giữ tỉ lệ; giữ âm thanh sẵn có, thêm im lặng nếu cảnh không có audio. Nối theo thứ tự prompt, không theo thứ tự tải xong, ra Muse_Final_<id>.mp4. Giữ nguyên clip nguồn. Có mã hóa lại nên cần thời gian và dung lượng. Nếu có cảnh lỗi/chưa xong thì chưa nối/xuất gói đầy đủ. Chưa có nhạc nền hay chuyển cảnh tự động.

## Giới hạn tích hợp

Chưa có phiên đăng nhập và DOM thực của Muse. Selector ô chat/file input/nút gửi/video là điểm khởi đầu có thể chỉnh trong Cài đặt; chưa xác minh với tài khoản của bạn.

- Tác vụ có ảnh vẫn cần xác nhận thủ công ảnh đã tải xong trước khi gửi. Nếu file input chỉ xuất hiện sau khi nhấn +, mở nó trước. Chưa chạy ảnh → video hoàn toàn không giám sát.
- App chờ video có URL mới rồi tải qua phiên đăng nhập. Chưa thao tác menu … → Tải xuống theo DOM trong ảnh. Player tùy chỉnh, iframe, MSE hoặc URL tái sử dụng có thể cần adapter riêng. Không giả định API chưa được xác minh.
- Trình duyệt tích hợp đang tắt popup đăng nhập; có thể chọn Chrome/Edge ngoài app cho luồng đăng nhập khác, nhưng vẫn cần thử với Muse thực.
- Thời lượng/tỉ lệ/phong cách ghi trong prompt; Muse quyết định hỗ trợ. Không tự retry; kiểm tra Muse trước khi chạy lại để tránh tạo trùng. Tạm dừng chỉ dừng prompt mới.
- Chưa thử Windows DPAPI, phiên Muse hoặc nhập media trong CapCut thực. Bản Windows được cross-build trên Linux, chưa ký chứng chỉ nhà phát hành.

## Mã nguồn và kiểm thử

Node.js 22 trở lên:

```powershell
npm ci
npm test
npm run test:merge
npm run test:ui
npm start
npm run dist:win
```

npm test: 54 kiểm thử hàng đợi, export clip, cookie mã hóa và vòng đời main. Cookie/main dùng Electron giả lập, mã hóa AES adapter và filesystem thật; không thay thế thử Windows DPAPI hoặc Muse.

test:merge: 2 test, gồm FFmpeg thật với clip khác kích thước/có và không có audio; kiểm tra thứ tự qua màu khung hình, thời lượng, giữ nguồn và dọn file tạm. Cần FFmpeg/ffprobe.

test:ui: Chromium headless với IPC giả lập; kiểm tra ảnh riêng từng prompt, nhiều tài khoản, lựa chọn đầu ra và xuất gói. Đặt CHROMIUM_PATH nếu Chromium khác /usr/bin/chromium.

Hàng đợi/cấu hình: app.getPath('userData')/studio.json. Nút Xuất danh sách JSON xuất prompt và đường dẫn file cục bộ, không phải project CapCut và không chứa đăng nhập.

## Kiểm chứng bổ sung ở 0.3

Đã chạy 54 test đơn vị/tích hợp giả lập, kiểm tra giao diện script → prompt → Tạo video và chọn trình duyệt. Đã chạy Chromium thật trên Linux với trang Muse giả lập được chặn/đáp ứng nội bộ: upload ảnh, tải blob MP4, localStorage/cookie phiên sau đóng mở và tách hồ sơ tài khoản đều đạt. Không gửi yêu cầu đến dịch vụ Muse trong smoke test này; không thay thế kiểm thử Windows Chrome/Edge, DPAPI hoặc Muse thực.

Có thể chạy `node test/external-browser-smoke.cjs` với Chromium sẵn trên Linux để kiểm tra adapter; smoke sử dụng safeStorage AES test adapter và headless/no-sandbox chỉ trong test. Bản app không bật no-sandbox cho Chrome/Edge.
