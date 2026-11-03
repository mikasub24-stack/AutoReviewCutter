# Vocal Studio

Ứng dụng Windows x64 để hát trên beat, thu micro qua sound card và mix vocal tại máy. Dự án nằm trong `VocalStudio/`, nhánh `vocal-studio`, không sửa Chùa Việt Online.

## Quy trình thu

1. Cài driver chính hãng của sound card. Mở **Sound card**, chọn ASIO, sample rate 48 kHz và buffer 128 hoặc 256 samples nếu thiết bị hỗ trợ.
2. Chọn đúng input micro trong bảng bên phải. Chỉnh gain trên sound card để giọng lớn nhất thường quanh −12 đến −6 dBFS, không chạm CLIP.
3. **Nhập beat** hoặc kéo WAV/MP3/FLAC vào timeline. File được sao chép vào thư mục Audio của phiên.
4. Nếu dùng Direct Monitor trên sound card, giữ **Kiểm âm FX** tắt. Nếu muốn nghe vocal qua hiệu ứng, dùng tai nghe, tắt Direct Monitor rồi bật Kiểm âm FX.
5. Bấm **THU** hoặc R. Giọng gốc được lưu WAV mono 24-bit, hiệu ứng không ghi đè vào file gốc. Bấm Dừng để hoàn tất và kiểm tra bản thu.
6. Chọn preset Clean Vocal / Warm Ballad / Pop Presence / Soft Room rồi điều chỉnh các núm. Các track được đánh dấu **Track giọng hát** đi qua vocal bus; beat giữ riêng.
7. Dừng phát và **Xuất WAV** để render mix stereo 24-bit. Export bù độ trễ plugin và limiter, thêm tail hiệu ứng; file nguồn được giữ nguyên.

## Chỉnh sửa và VST3

- Space: phát/dừng. R: thu/dừng thu. Ctrl+S: lưu. Ctrl+Z / Ctrl+Shift+Z: hoàn tác/làm lại thao tác di chuyển/cắt clip.
- Kéo thân clip để dời vị trí, kéo mép để trim. Chỉnh clip khi dừng; gain/pan/mute/solo có thể chỉnh khi đang nghe.
- **Nạp VST3**: chọn file hoặc bundle `.vst3`. Slot hỗ trợ audio effect stereo, không nhận nhạc cụ MIDI. **Mở FX** mở giao diện plugin. Dừng phát/thu trước khi đổi plugin.
- Plugin được xử lý trên vocal bus, có bù trễ so với beat; trạng thái được lưu cùng dự án.

## Menu Vang / Tone / Chỉnh phô

Chọn một track, mở **Vang / Tone / Chỉnh phô** ở cột bên phải.

- **Vang / Vocal FX**: 16 núm gồm high-pass, warmth, presence, làm dịu gắt, compressor, de-esser, reverb mix/decay/pre-delay/damping/stereo width, delay mix/time/feedback. FX dùng khi nghe và xuất mix; file thu gốc không bị ghi hiệu ứng. Tail vang/echo khi xuất được tính theo thiết lập, tối đa 30 giây.
- **Dò tone / nốt**: vocal đơn có đường cao độ, nốt giữa và tần số; beat nhiều nhạc cụ có biểu đồ chroma và gợi ý giọng trưởng/thứ. Chuẩn tham chiếu A4 = 440 Hz. Điểm phù hợp là thước đo thuật toán, **không phải xác suất hoặc cam kết đúng 100%**. Có thể nhầm giọng tương đối (C major/A minor), bài chuyển giọng, bè hoặc bản thu nhiễu; hãy đối chiếu bằng tai và chọn lại tone nếu cần.
- **Nâng / hạ tone**: −12 đến +12 semitone và ±50 cent, giữ nguyên tempo, số mẫu và độ dài clip. Đây là thay đổi tương đối với bản đang chọn; không đổi tốc độ phát. Giữ formant giúp giảm đổi màu giọng khi nâng/hạ, nhưng mức chuyển lớn vẫn có thể có artefact.
- **Chỉnh phô giọng đơn**: bật ô này, chọn thang âm đầu ra hoặc Chromatic. Tự động ưu tiên tone từ beat chưa mute; nếu beat không rõ thì dùng gợi ý từ vocal. Khi độ phù hợp thấp, app yêu cầu chọn bằng tay. Mức chỉnh 60–80%, tốc độ 60–120 ms và vùng bỏ qua 10–20 cent thường giữ rung giọng tốt hơn; chỉnh mạnh/nhanh dễ nghe thành hiệu ứng.
- Nếu hạ/nâng cả beat và vocal, hãy xử lý beat trước. Chỉnh phô sẽ nhắm thang âm **đầu ra** sau bước nâng/hạ semitone. Fine cent áp dụng sau chỉnh phô để khớp nhạc không đúng A440.
- **Làm dịu clip nhẹ** thử nội suy các đoạn PCM chạm đỉnh ngắn (tối đa khoảng 4 ms). Nó không phục hồi hoàn toàn âm thanh đã mất, clip dài, overload analog hay méo do phòng/micro. Có thể tạo artefact; nghe đối chiếu và dùng **Về bản gốc** khi cần. Giảm gain vật lý vẫn là cách xử lý chính để tránh clip.

Phân tích, nâng/hạ tone và chỉnh phô chạy **sau thu**, trên worker khi dừng transport. Reverb/EQ/compressor/echo và VST3 vẫn dùng để kiểm âm lúc hát. Bấm **Áp dụng bản sao** tạo WAV 24-bit mới, thay clip đang chọn và giữ đường dẫn bản gốc trong dự án. **Về bản gốc** khôi phục audio gốc cả sau khi mở lại dự án. Nếu kết quả có peak vượt −0,18 dBFS, app giảm mức đồng đều để tránh clip khi ghi PCM; không tăng âm lượng tự động. Có nút hủy, bản đang dùng chỉ thay khi xử lý và ghi file thành công.

Giới hạn hiện tại: F0 khoảng 55–1000 Hz, chỉnh phô dành cho **một giọng rõ**, không phải bè hoặc toàn bộ beat. Xử lý tone dùng thêm RAM, giới hạn khoảng 256 MB audio giải mã mỗi clip. Đây là bộ công cụ thu/mix vocal cá nhân; chưa thay toàn bộ chức năng của Cubase.

## Lưu và an toàn dữ liệu

Phiên thu nằm trong Documents / Vocal Studio Sessions. Dự án `.vocalstudio` dùng đường dẫn tương đối tới audio, autosave khoảng 5 giây và ghi file thay thế theo kiểu tạm rồi đổi tên. Bản thu dùng FIFO và luồng ghi đĩa riêng. Khi buffer đầy, thiết bị mất kết nối hoặc số mẫu trên đĩa không đủ, app giữ bản `.partial.wav` và báo gián đoạn.

Ứng dụng tự mở lại phiên thu gần nhất. Nếu bị tắt đột ngột trong lúc thu, khi mở phiên có dấu khôi phục, ứng dụng tạo một WAV mới từ phần PCM đã ghi ra đĩa và giữ nguyên file gián đoạn. Phần âm thanh còn trong buffer tại thời điểm mất điện có thể không khôi phục được.

Không xóa file trong thư mục Audio chỉ vì bỏ clip khỏi timeline. Gỡ ứng dụng không xóa thư mục phiên thu trong Documents. Phiên bản hiện tại giới hạn 24 track và dùng audio trong RAM; dự án rất dài/nhiều track cần RAM tương ứng. VST3 chạy cùng tiến trình, vì vậy plugin lỗi có thể làm host lỗi.

## Chất lượng và kiểm chứng

- Nội bộ float; ghi gốc và xuất PCM WAV 24-bit. Chuyển sample rate ở bước nhập bằng resampler sinc 64 tap/2048 phase với lọc chống alias.
- Vocal chain: high-pass, shelf, presence EQ, compressor soft knee, de-esser tách dải, reverb/delay; limiter dự phòng có lookahead 1 ms, ceiling −1 dBFS. Đây là sample-peak limiter, không phải bộ đo LUFS/true-peak chuẩn phát sóng.
- Độ trễ hiển thị lấy từ driver cộng pipeline phần mềm; chất lượng và độ trễ thực tế cần kiểm tra với sound card/micro của bạn.
- Không kèm giọng hát thương mại hay plugin trả phí. Chế độ `--demo` dùng sóng tổng hợp có ghi nhãn kiểm thử.
- CI kiểm thử DSP, dò cao độ/tone, nâng/hạ giữ tempo, chỉnh phô, clip nhẹ và engine thật: WAV gốc, save/load dự án, export/cancel, khôi phục WAV có header chưa cập nhật, VST3 fixture có độ trễ 64 samples và trạng thái plugin. Không thay thế kiểm tra phần cứng thật.

## Build

Windows: Visual Studio 2022 C++ workload, CMake 3.24+, Windows SDK.

```powershell
cmake -S VocalStudio -B build/vocal -A x64 -DVOCAL_BUILD_TESTS=ON
cmake --build build/vocal --config Release --parallel 2
ctest --test-dir build/vocal -C Release --output-on-failure
```

CMake lấy JUCE và ASIO SDK ở commit cố định. Source ứng dụng AGPL-3.0-or-later; xem LICENSE.txt và THIRD_PARTY.md. Không yêu cầu tài khoản hoặc upload audio lên dịch vụ ngoài.
