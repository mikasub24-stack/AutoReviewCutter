# Vocal Studio

Ứng dụng Windows x64 để hát trên beat, thu micro qua sound card và mix vocal tại máy. Dự án nằm trong `VocalStudio/`, nhánh `vocal-studio`, không sửa Chùa Việt Online.

## 1.5 · Fix méo Auto-Tune

Nút **Fix méo Auto-Tune** ngay màn hình hát mở bảng có **Áp dụng · Kéo nhẹ hơn**, **Hoàn tác Fix méo**, **Mở Antares** và báo cáo từng tham số. Đây là giảm kiểu kéo nốt quá gắt, không phải phục hồi clipping và không bảo đảm hết mọi méo. Dừng thu/phát/nghe bản thu trước khi áp dụng. Nạp Antares VST3 có giấy phép, ghép Key/Scale và chờ dò/chọn tone đúng trước. Khi nâng/hạ nhạc trong YouTube, Key/Scale theo tone đầu ra như trước; nếu dò nhầm Major/Minor hoặc bài chuyển giọng thì chọn tay/kiểm tra lại. Không tự bật plugin bạn đã bypass.

Tool gửi/đọc lại Key/Scale hiện tại, rồi chỉ chỉnh các tham số có tên và nhãn/đơn vị rõ: Retune Speed tối thiểu 35 ms (không tăng tốc nếu đã chậm hơn), Humanize tối thiểu 50%, Flex-Tune tối thiểu 20%, Formant On nếu có nhãn bật/tắt rõ. Đây là thiết lập khởi đầu để nghe thử, không phải preset chuẩn cho mọi giọng. Không đổi Input Type/quãng giọng, Transpose hay Formant Shift. Nếu không xác minh được Retune theo ms, không đổi nhóm tham số kéo giọng; tùy chọn không có thì giữ nguyên và ghi rõ trong báo cáo. Có thể mở Antares để chỉnh tay. Không đoán normalized value từ tên núm.

Nếu plugin không đọc lại đúng giá trị, trả về trạng thái trước khi chỉnh nhóm tham số. Hoàn tác chỉ giữ trong phiên hiện tại, không ghi đè nếu bạn đã đổi các tham số đó trong Antares; thay/nạp lại plugin hay dự án sẽ bỏ lịch sử hoàn tác. Trạng thái plugin đã áp dụng được lưu bằng cơ chế lưu dự án hiện có. Không sửa file thu. Chỉ một tuner realtime trên vocal; guard chặn chỉnh phô offline khi Antares hoạt động đã có, nhưng không thể tự phát hiện/loại Auto-Tune đã in vào một file nhập sẵn — dùng WAV micro gốc.

Mã nguồn tool nằm riêng trong `VocalStudio/` của repo hiện có và có ZIP Source độc lập trong release, không cần mở dự án game để chạy app. Cài Antares trên máy không tự nạp vào app: bấm **Chọn Antares VST3** một lần. Chưa kiểm chứng bản Antares có giấy phép trên máy người dùng; có kiểm thử VST3 fixture thật về ánh xạ đơn vị phi tuyến, readback, giữ tone, hoàn tác, guard và các đường thu/xuất trước đó.

## 1.4.1 · Sửa tầng khuếch tán reverb

Sửa hồi tiếp all-pass trong hai tầng khuếch tán: tầng này chỉ trải pha/đuôi vang, không tự tăng mức theo tần số. Bản trước dùng mẫu trễ thay cho đầu ra all-pass trong nhánh hồi tiếp nên có thể nhuộm màu/tăng mức vang ngoài ý muốn. Giữ núm Reverb/Delay, preset, EQ riêng và đường Antares; màu/mức reverb có thể thay đổi do sửa lỗi. Không thêm latency. Kiểm thử đáp ứng xung bảo toàn năng lượng, biên độ ổn định ở 73–8000 Hz tại 44,1/48/96 kHz và reset sạch đuôi, cùng các kiểm thử thu/xuất hiện có. Đây là sửa thuật toán, chưa thay thế nghe thử trên mic/phòng thật.

## 1.4 · Vocal studio và xuất riêng giọng có FX

Bấm **Vocal studio · Mượt giọng → Áp dụng preset Studio**. Preset giữ EQ riêng/input gain và thiết lập Antares, chọn compressor vừa, reverb nhẹ có pre-delay, delay nhỏ và bật ba bước mới chỉ trên vocal:

- **Cân câu nhỏ/to:** bộ cân mức chậm trước compressor; ở 100% giới hạn +4/−6 dB, ngừng nâng mức dưới ngưỡng detector −40 dBFS. Giúp câu nhỏ rõ hơn, không đổi nốt/quãng giọng; không phải bộ khử ồn và không sửa clip analog.
- **Dịu gắt động:** giảm có điều kiện dải quanh 3,5 kHz khi nổi lên, giữ vùng thấp. Khác với việc cắt tối toàn bộ giọng liên tục; giảm lượng nếu thấy mất độ rõ.
- **Vang né giọng:** hạ return reverb/delay khi hát, trả đuôi vang khi ngắt câu. Reverb/delay vẫn đặt sau Antares. Ba bước không thêm lookahead; độ trễ vẫn phụ thuộc driver/plugin.

Các thanh chỉnh độc lập từ 0–100%. **Bật/Tắt ba bước mới** dùng để so sánh chính ba bước; EQ, compressor, vang và Antares hiện tại vẫn giữ. Preset Studio có chỉnh compressor/vang nên đọc thông tin trước khi áp dụng. Dự án cũ mặc định ba lượng mới bằng 0; không tự đổi tiếng khi mở lại. Thiết lập được lưu trong dự án.

**Xuất WAV vocal có FX:** thu micro hoặc chọn một track vocal trong Studio, dừng thu, rồi xuất. Chức năng lấy WAV micro gốc (kể cả khi track đã qua chỉnh pitch), áp dụng EQ/dynamics/Antares/reverb/delay hiện tại, bù latency và giữ đuôi vang, lưu PCM WAV stereo 24-bit. Không có nhạc YouTube/track khác, không chịu mute/solo timeline, không sửa WAV gốc. Nếu muốn xuất mix với beat của bạn hoặc giữ bản pitch offline đang chọn, dùng Xuất WAV trong Studio như trước. Bài đổi key hoặc đã đổi thiết lập Antares trong lúc thu cần kiểm tra/chia đoạn trước khi render; xuất dùng trạng thái plugin hiện tại, không tái tạo lịch sử automation chưa được ghi. Có hủy và bảo vệ file nguồn/đích cũ.

Bản này cải thiện bộ xử lý và thêm đường xuất thành phẩm vocal để nghe đối chiếu. Chưa nghe thử giọng người dùng/UPod Pro/Antares có giấy phép; kiểm thử tín hiệu và phần mềm không chứng minh thành phẩm tương đương clip tham chiếu. Không tự sao chép chất giọng từ TikTok, không đảm bảo một preset tạo ngay chất lượng phát hành. Hát thử, nghe A/B và chỉnh theo mic, cách hát, phòng và bài cụ thể.

## 1.3 · Hát một bài → Cân EQ riêng

Màn hình hát có **Hát 1 bài → Cân EQ**. Mở bài YouTube như bình thường, vào bảng này và bấm **Thu bài để cân EQ**. Hát vài câu có cả trầm/cao/mạnh (nên từ 10 giây; có thể hát cả bài), rồi bấm **Dừng thu → Phân tích**. Bản micro gốc được giữ nguyên và đặt tên riêng, mute trong timeline để không phát lẫn. Có thể chọn một track vocal của chính bạn ở Studio rồi bấm **Phân tích vocal đang chọn**. Nếu track đã xử lý, phân tích/nghe A/B dùng WAV gốc theo lịch sử track.

Tool lấy tối đa 12 đoạn 5 giây trải đều bài, chỉ đo quanh các đoạn giọng rõ: gợi ý low-cut theo nốt thấp, low-shelf giảm ù/giữ độ dày, presence và làm dịu gắt, de-esser. Mức chỉnh được giới hạn nhẹ; không học một “EQ chuẩn phát hành”, không sao chép màu giọng ca sĩ, không tách được beat/phòng/DSP đã trộn sẵn. Cần WAV micro khô: UPod Pro **Mixing OFF**, **Mic with DSP OFF**, dùng tai nghe. Mẫu quá ngắn, ít giọng rõ, nhiễu không có giọng hoặc clip nhiều sẽ không tạo đề xuất. Bản thân giọng, nguyên âm, khoảng cách micro và phòng ảnh hưởng kết quả; nghe đối chiếu và đo lại khi điều kiện thay đổi.

Bấm **Nghe bản thu A/B** để phát riêng WAV micro gốc qua FX hiện tại; YouTube được tạm dừng và tiếng micro trực tiếp tạm bỏ khỏi đường nghe, không thay mute/solo của dự án. Bấm **A · EQ trước** / **B · EQ đề xuất** trong lúc nghe, hoặc hát lại qua micro để thử. Chỉ EQ/de-esser và gain bù mức ước tính thay đổi; compressor, vang, Antares và tone bài giữ nguyên. Bù mức tối đa ±3 dB giúp giảm thiên lệch vì bản B to hơn, không phải đo LUFS chuẩn. Nếu bật Bypass vocal FX, hãy tắt bypass để nghe tác dụng EQ.

**Lưu B làm EQ riêng** mới xác nhận B và lưu preset ở máy, đồng thời lưu EQ vào phiên. **Dùng EQ đã lưu** nạp cho phiên khác. Đóng bảng hoặc **Về EQ đang lưu** bỏ nghe thử chưa lưu. Autosave vẫn lưu EQ đã xác nhận, không biến một lần nghe B thành preset sau khi mở lại. Không sửa WAV, không tự đổi tone hoặc nâng nốt thấp lên cao; chỉnh cao độ vẫn thuộc Antares/công cụ pitch. Không phục hồi hoàn toàn clipping/overload analog. Đây là gợi ý ban đầu cần nghe thử, không cam kết âm thanh đạt chất lượng phát hành sau một lần hát.

## 1.2 · Mở YouTube, bấm nửa cung rồi hát

Màn hình mặc định có YouTube ngay trong tool. Dán link hoặc tìm tên bài, mở video karaoke, bật micro rồi hát. **−½ cung / +½ cung** đổi **một bán âm mỗi lần** (±1 semitone); giữ nguyên tốc độ, giới hạn ±12 bán âm. **Về tone gốc** trả về 0. Không bắt đo quãng giọng, nhập beat hay chọn vocal mẫu. Mức chuyển do bạn chọn bằng tai cho vừa giọng, không tự đoán quãng hát từ beat.

Nhạc trình duyệt được đưa riêng qua bộ đổi tone; micro đi qua vocal FX/Antares. Không cần cáp âm thanh ảo hoặc tiện ích Chrome. Chỉ nhạc YouTube mở **trong ứng dụng** được đổi tone; tab Chrome/Edge bên ngoài không đi qua tool. Trình duyệt Chromium đi kèm, có sandbox. Xem video cần mạng; YouTube có thể yêu cầu đồng ý cookie, đăng nhập hoặc xác minh. App không tải/tách stream, vượt xác minh hoặc loại quảng cáo. Nội dung cần DRM/codec không có trong CEF có thể không phát được.

**iCON UPod Pro:** USB 16-bit/48 kHz, plug-and-play; không bắt cài driver ASIO không có của hãng. Chọn Windows Audio/WASAPI, UPod Pro input/output, 48 kHz và ngõ micro trong **Sound card** lần đầu. Chọn buffer thấp ổn định mà thiết bị thật hỗ trợ. App lưu thiết bị và phiên Antares để mở lần sau. Trên phần cứng: **Mic with DSP OFF**, **Mixing OFF**; tắt **Direct Out/Direct Out+DSP** khi nghe FX bằng phần mềm để tránh hai tiếng. Không bật loopback Mixing. Những nút vật lý này app không điều khiển được. WAV 24-bit là định dạng lưu, không nâng độ phân giải ADC 16-bit của UPod.

**Vang ẩn** là preset reverb/delay nhẹ. Micro qua EQ/compressor/de-esser rồi Antares; reverb/delay đặt sau Antares để vang không làm rối bộ dò nốt. Có thanh Reverb/Delay và menu FX chi tiết; không bật DSP phần cứng cùng lúc nếu không muốn chồng vang. Cảnh báo MIC CLIP nhắc giảm gain vật lý; không thể phục hồi hoàn toàn giọng méo đã quá tải ở đầu vào.

**Tự dò tone → Antares** nghe nhạc gốc trước khi chuyển, chờ vài giây có nhiều nốt rõ và hai cửa sổ phân tích đồng ý; cộng mức ± bán âm rồi gửi Key/Scale cho VST3 đã ghép. Không cộng dồn tone qua mỗi lần bấm. Bài mới/đổi video/quảng cáo làm bỏ key cũ; chờ dò lại hoặc tắt tự dò để chọn Key/Scale gốc bằng tay. Cập nhật tham số trực tiếp không dừng thiết bị âm thanh. Dò tone có thể nhầm Major/Minor tương đối hoặc không theo kịp bài chuyển giọng; luôn nghe đối chiếu. Chưa thử với Antares có giấy phép và UPod Pro thật của bạn. Nếu plugin không công khai/không xác nhận Key/Scale, app báo lỗi và giữ bypass để tránh kéo sai nốt. Antares và giấy phép phải có sẵn trên máy; app không kèm plugin thương mại.

**Thu giọng** lưu WAV micro gốc, không ghi nhạc YouTube hay hiệu ứng vào WAV này. **Studio nâng cao** giữ toàn bộ timeline/nhập beat/mix/xuất WAV và quy trình đo quãng giọng cũ là tùy chọn. Nhạc YouTube bị tạm dừng khi vào Studio.

## Quy trình thu trong Studio nâng cao

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

## 1.1 · Theo giọng tôi → đổi beat → Antares

### Đo quãng giọng của bạn

Mở **Vang / Tone / Chỉnh phô → Theo giọng tôi**. Bấm **Thu mẫu giọng 20 giây** và hát ngân từ thấp đến cao trong vùng bạn thấy thoải mái. Ứng dụng lấy WAV micro gốc, tạm bỏ qua beat, vang và Antares trong đường kiểm âm; không sửa trạng thái mute của dự án. Bấm Dừng được kết thúc sớm. Track mẫu đo được đặt tên riêng và mute mặc định để không phát lẫn vào bản nhạc, kể cả khi khôi phục sau gián đoạn; WAV vẫn giữ để bạn nghe đối chiếu. Mẫu phải có ít nhất 2 giây có giọng rõ và nhiều nốt cách nhau tối thiểu 4 bán âm; mẫu nhiễu/vỡ nhiều hoặc chỉ một nốt không đủ để đo quãng. Có thể chọn một track vocal của chính bạn và bấm **Dùng vocal tôi đã chọn**, hoặc tự đặt nốt thấp/cao rồi lưu. Hồ sơ chỉ lưu trên máy và trong dự án, không gửi lên mạng.

### Nâng/hạ bài theo quãng giọng, không theo nốt bass

Chọn **beat** và **vocal mẫu riêng/humming đúng giai điệu và tone gốc của bài (được hát khác quãng tám)**. Không dùng mẫu đo quãng ngẫu nhiên làm giai điệu bài; không dùng giọng ca sĩ khác làm hồ sơ giọng cá nhân. App so quãng giai điệu với vùng thoải mái và xét cả quãng tám khi hát. Ví dụ có thể đề xuất hạ beat 2 bán âm và hát thấp hơn bản mẫu 1 quãng tám; không cần hạ cả beat 14 bán âm gây đổi màu quá nhiều.

Bấm **Tính tone theo giọng tôi**, xem mức bán âm, quãng tám và vùng nốt sau chuyển. **Đổi beat theo đề xuất** giữ tempo và số mẫu, có thể đổi đồng thời các beat/stem chưa mute, mute vocal mẫu và giữ mọi WAV gốc. Nếu không tìm được phương án trong vùng đo, app báo chưa khớp; bạn có thể đo lại/chỉnh vùng thoải mái hoặc dùng chuyển tone bằng tay. Quãng giọng ước lượng phụ thuộc cách hát mẫu, không bảo đảm mọi nốt hoặc mọi ngày đều thoải mái. Hãy nghe thử trước khi thu.

Không suy ra đáng tin cậy quãng giai điệu hát chỉ từ một beat đa âm hoặc một nốt bạn nói. Vì vậy cần vocal mẫu/humming hoặc bạn tự chọn mức chuyển. Bài chuyển giọng vẫn cần kiểm tra/chia đoạn bằng tay.

### Gửi Key / Scale sang Antares VST3

Mở tab **Antares Key/Scale**, nạp bản Antares VST3 hợp pháp bạn đang dùng. Host thử bus stereo, mono→stereo và mono theo khả năng plugin; plugin mono được trộn vocal về mono và đưa lại ra hai loa, không yêu cầu phải có bản stereo riêng. App không kèm Auto-Tune hoặc giấy phép Antares. **Tự nhận diện** đọc nhãn tham số Key và Scale, ánh xạ đủ 12 nốt cùng Major/Natural Minor; không giả định nốt C là giá trị đầu, không chọn đại tham số hay thang âm khác. Key/Scale được đổi một lần khi transport dừng; không bắt buộc plugin cho vẽ automation liên tục nếu hai điều khiển vẫn được công khai và xác nhận đọc lại được. Khi nhận diện đủ, bật **Tự gửi sau dò / đổi tone bài**. Nhập beat mới, bấm dò beat, đổi tone beat hoặc áp dụng đề xuất theo giọng sẽ cập nhật Key/Scale đầu ra và đọc lại giá trị plugin để xác nhận. Nếu dò tone không rõ hoặc plugin không xác nhận được Key/Scale, app tạm bypass và không dùng lại tone bài trước. Tone mới xác nhận sẽ chỉ tự bật lại nếu bypass do cơ chế giữ này; bypass bạn tự chọn vẫn được giữ. Có thể dùng Key/Scale chọn tay và **Gửi Key/Scale**.

Nếu phiên bản plugin chỉ công khai tham số với nhãn khó nhận diện: chọn đúng tham số Key/Scale, mở Antares, lần lượt đặt C…B trong plugin và học mỗi Key, rồi đặt/học Major và Minor. Mapping được lưu bằng ID tham số và định danh/phiên bản plugin, không dựa vào index dễ thay đổi. Mapping thiếu, trùng giá trị, sai phiên bản hoặc không xác nhận được sẽ không được gửi. Khi plugin không công khai Key/Scale cho host, app báo rõ; không có cách automation chuẩn để cưỡng ép điều khiển một tham số bị ẩn.

Antares chạy **trực tiếp trên vocal bus/micro khi bật Kiểm âm FX**, với độ trễ do plugin và driver báo. Dò tone bài được thực hiện khi nhập/dò/chuyển bài và transport dừng; đây không phải bản sao giao thức riêng của Auto-Key, không đo Key liên tục trong lúc bạn đang hát. Chọn Input Type/Retune phù hợp trong giao diện Antares của bạn. Mã đã kiểm thử cầu nối trên VST3 fixture thật với thứ tự nốt/thang âm xáo trộn và kiểm tra đọc lại; chưa kiểm thử bản Antares có giấy phép trên máy bạn.

### Giảm méo / tránh chỉnh hai lần

Giữ formant khi đổi giọng dùng cao độ đo được của chính clip, thay vì luôn giả định giọng 180 Hz. Khi Antares đang hoạt động, app chặn chỉnh phô ngoại tuyến tích hợp để tránh hai bộ cùng kéo nốt. Dùng **Bypass plugin** để đối chiếu hoặc chuyển sang bộ tích hợp; host bỏ cả hiệu ứng và trễ plugin khi bypass. WAV micro gốc không bao giờ bị ghi Auto-Tune/vang đè lên. Sửa clip nhẹ vẫn là nội suy các đoạn chạm đỉnh ngắn; không thể tái tạo hoàn toàn âm đã mất do vỡ nặng hay overload analog. Giảm gain sound card nếu micro clip, nghe A/B và quay về bản gốc khi cần.

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

CMake lấy JUCE và ASIO SDK ở commit cố định. Source ứng dụng AGPL-3.0-or-later; xem LICENSE.txt và THIRD_PARTY.md. Micro và bản thu lưu trên máy; trình duyệt YouTube kết nối tới YouTube như trình duyệt thông thường và không được cấp quyền micro/camera. CEF Windows x64 stable 156.0.15 được ghim version và checksum trong cmake/Browser.cmake.
