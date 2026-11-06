// Interface-only localization. User prompts, titles, paths and form values are never translated.
(()=>{
  const dictionary=Object.fromEntries(`
Kể chuyện|Story
Câu chuyện & nhân vật|Story & character
Kịch bản → cảnh → clip Muse|Script → scenes → Muse clips
1. Câu chuyện|1. Story
Chỉ cần dán nguyên câu chuyện. Muse tự đọc hiểu để chia cảnh và viết prompt hình; giọng đọc sẽ đọc đúng nguyên văn câu chuyện này.|Just paste the story as it is. Muse reads and understands it to split scenes and write the picture prompts; the voice reads your story word for word.
Nhân vật chính (không bắt buộc)|Main character (optional)
Phong cách hình ảnh|Visual style
Hình dạng nhân vật chuẩn|Reference character shape
Ví dụ: người que, đầu tròn trắng / người thật, ảnh chụp / mèo hoạt hình 3D. Mọi nhân vật khác cùng kiểu|e.g. stick figure, round white head / real person, photo / 3D cartoon cat. Every other character gets the same look
Để trống nếu không cần. Ví dụ: Mai, bé gái tóc đen, áo dài trắng|Leave empty if not needed. e.g. Mai, a girl with black hair in a white áo dài
Ví dụ: hoạt hình màu nước|e.g. watercolor animation
Chọn ảnh nhân vật|Choose character image
Dán hoặc kéo ảnh nhân vật chính vào đây. Ảnh này gắn vào mọi cảnh để nhân vật giữ nguyên; nhân vật khác do Muse nhận ra và vẽ cùng hình dạng với nhân vật này (chỉ khác màu áo, giới tính, tóc…).|Paste or drop the main character image here. It is attached to every scene so the character stays consistent; Muse recognizes the other characters and draws them with the same shape as this one (only clothes color, gender, hair… differ).
Chưa chọn ảnh nhân vật.|No character image chosen.
Dán câu chuyện rồi bấm «Phân tích bằng Muse» (cần đã đăng nhập Muse tài khoản 1). Muse đọc hiểu cả truyện rồi mới chia cảnh và viết prompt hình.|Paste the story, then click “Analyze with Muse” (you must be signed in to Muse account 1). Muse reads and understands the whole story first, then splits the scenes and writes the picture prompts.
Phân tích lại từ đầu|Analyze again from the start
Phân tích tiếp|Continue analysis
Phân tích lại từ đầu sẽ thay toàn bộ các cảnh đang có. Tiếp tục?|Analyzing again from the start replaces all the current scenes. Continue?
Muse trả lời không đúng khuôn (không thấy số câu và prompt cho từng cảnh).|Muse replied in the wrong format (no sentence numbers and prompts per scene).
Không làm tiếp được vì vị trí dừng không khớp kịch bản. Bấm phân tích lại từ đầu.|Cannot continue because the stopping point does not match the script. Analyze again from the start.
Phân tích bằng Muse|Analyze with Muse
Dán thủ công (dự phòng)|Paste manually (backup)
Muse hiểu bài thế này|This is how Muse understood the text
Tóm tắt|Summary
Cách minh họa|How to illustrate it
Nhân vật|Characters
Bối cảnh|Setting
Muse chưa đọc hiểu được cả bài (trả lời sai khuôn) nên các lượt chia cảnh chỉ kèm truyện làm ngữ cảnh.|Muse could not read and summarize the whole text (wrong reply format), so each scene-splitting request only carries the story as context.
Chưa thấy phần tóm tắt và cách minh họa trong trả lời của Muse.|The summary and the way to illustrate are missing in Muse's reply.
Dừng phân tích|Stop analysis
Quảng cáo sản phẩm|Product ad
Thả ảnh sản phẩm ở trên rồi chọn mẫu: các cảnh quay hiện ngay bên dưới, không cần viết gì.|Drop the product photo above and pick a template: the shots appear right below, nothing to write.
Tên sản phẩm (không bắt buộc)|Product name (optional)
Tạo quảng cáo từ ảnh|Create ad from photo
Tùy chỉnh thêm: tên sản phẩm, máy quay, phong cách, lời đọc (không bắt buộc)|More options: product name, camera, look, narration (optional)
Tạo lại cảnh|Regenerate shots
Tạo lại sẽ thay các cảnh đang có, kể cả phần bạn đã sửa. Tiếp tục?|Regenerating replaces the current scenes, including your edits. Continue?
Đã đổi tùy chọn. Bấm «Tạo lại cảnh» để áp dụng (sẽ thay các cảnh đang có).|Options changed. Click “Regenerate shots” to apply them (this replaces the current scenes).
Muốn có lời đọc và phụ đề? Điền thông tin dưới đây để Muse viết lời quảng cáo. Muse chỉ dùng thông tin bạn nhập, không tự bịa tính năng hay giá. Lời viết xong hiện ở ô lời quảng cáo bên dưới để bạn sửa, rồi bấm «Phân tích bằng Muse» để chia cảnh có giọng đọc và phụ đề.|Want a voice and subtitles? Fill in the details below so Muse writes the ad script. Muse only uses what you enter and does not invent features or prices. The finished script appears in the ad script box below for you to edit; then click “Analyze with Muse” to split scenes with a voice and subtitles.
1. Lời quảng cáo (không bắt buộc)|1. Ad script (optional)
Không bắt buộc. Muốn có giọng đọc và phụ đề thì mở «Tùy chỉnh thêm» rồi bấm «Muse viết lời quảng cáo», hoặc tự dán lời quảng cáo vào đây. Giọng đọc sẽ đọc đúng nguyên văn lời này.|Optional. For a voice and subtitles, open “More options” and click “Muse writes the ad script”, or paste your own script here. The voice reads this text exactly as written.
Thả ảnh sản phẩm, chọn mẫu: các cảnh quay hiện ngay bên dưới. Muốn có lời đọc thì mở «Tùy chỉnh thêm», viết lời quảng cáo rồi bấm «Phân tích bằng Muse».|Drop the product photo and pick a template: the shots appear right below. For a narration, open “More options”, write the ad script and click “Analyze with Muse”.
Chọn ảnh sản phẩm trước.|Choose a product image first.
Chưa có lời quảng cáo. Bấm «Muse viết lời quảng cáo» hoặc dán lời vào ô.|There is no ad script yet. Click “Muse writes the ad script” or paste one into the box.
Mẫu quảng cáo|Ad template
Giới thiệu sản phẩm|Product intro
Review sản phẩm|Product review
Vấn đề → giải pháp|Problem → solution
Khuyến mãi nhanh|Quick promo
Mở hộp, nhìn kỹ|Unboxing
Cao cấp, tinh tế|Premium
Ví dụ: Bình giữ nhiệt Aqua 500ml|e.g. Aqua 500 ml thermos bottle
Người xem hướng tới|Target audience
Ví dụ: dân văn phòng hay uống cà phê|e.g. office workers who drink coffee
Giá / ưu đãi (không bắt buộc)|Price / offer (optional)
Ví dụ: giảm 20% đến hết tuần|e.g. 20% off until the end of the week
Kêu gọi hành động|Call to action
Ví dụ: Bấm vào giỏ hàng để xem chi tiết|e.g. Tap the cart to see the details
Điểm nổi bật (mỗi dòng một ý)|Selling points (one per line)
Mỗi dòng một ý. Ví dụ: Giữ nóng 12 giờ|One idea per line. e.g. Keeps drinks hot for 12 hours
Giọng điệu|Tone
Độ dài video|Video length
Chuyển động máy quay (chọn tối đa 3)|Camera movement (choose up to 3)
Phong cách quảng cáo|Ad look
Muse viết lời quảng cáo|Muse writes the ad script
Muse đang viết…|Muse is writing…
Hào hứng, thuyết phục|Enthusiastic, persuasive
Thân mật, chân thành|Warm, sincere
Chuyên gia, đáng tin|Expert, trustworthy
Vui nhộn, trẻ trung|Fun, young
Sang trọng, tinh tế|Premium, refined
15 giây|15 seconds
30 giây|30 seconds
45 giây|45 seconds
60 giây|60 seconds
Cận cảnh chi tiết|Macro close-up
Tiến sát|Dolly in
Lùi xa|Pull back
Xoay quanh|Orbit
Lia ngang|Pan
Từ trên cao|Top-down
Quay chậm|Slow motion
Cầm tay|Handheld
Cố định|Static
Quảng cáo TVC|TV commercial
Điện ảnh|Cinematic
Review đời thường|Everyday review (UGC)
Tối giản, nền trơn|Minimal, plain background
Tươi sáng, trẻ trung|Bright and young
Sang trọng|Luxury
Người mẫu / người dùng (không bắt buộc)|Model / user (optional)
Để trống nếu không cần. Ví dụ: cô gái 25 tuổi, tóc dài, áo sơ mi trắng|Leave empty if not needed. e.g. a 25-year-old woman with long hair in a white shirt
Chọn ảnh sản phẩm|Choose product image
Dán hoặc kéo ảnh sản phẩm vào đây (nên 1–2 ảnh rõ nét, nền sạch). Ảnh gắn vào mọi cảnh để sản phẩm giữ đúng hình dạng và màu sắc.|Paste or drop product images here (1–2 clear photos on a clean background work best). The image is attached to every scene so the product keeps its shape and colors.
Chưa chọn ảnh sản phẩm. Nên thêm ảnh rõ nét để sản phẩm trong video giống thật.|No product image chosen. Add a clear photo so the product in the video looks like the real one.
Muse đã viết lời quảng cáo. Đọc và sửa cho đúng ý, rồi bấm «Phân tích bằng Muse» để chia cảnh.|Muse wrote the ad script. Read and edit it, then click “Analyze with Muse” to split scenes.
Nhập tên sản phẩm trước.|Enter the product name first.
Ô lời quảng cáo đang có chữ. Viết mới sẽ thay toàn bộ và xóa các cảnh đã chia. Tiếp tục?|The ad script box already has text. Writing a new one replaces it and clears the split scenes. Continue?
Muse đã viết xong lời quảng cáo|Muse finished writing the ad script
Nhập tên sản phẩm trước khi nhờ Muse viết lời quảng cáo.|Enter the product name before asking Muse to write the ad script.
Muse chưa viết lời quảng cáo. Bấm viết lại.|Muse did not write an ad script. Click write again.
Muse đang làm việc. Chờ xong hoặc bấm Dừng.|Muse is busy. Wait until it finishes or click Stop.
Dừng hàng đợi và các thao tác trình duyệt trước khi nhờ Muse viết lời quảng cáo.|Stop the queue and browser actions before asking Muse to write the ad script.
prompt mẫu|template prompt
Prompt này do tool ghép từ lời kể, chưa qua Muse|This prompt was assembled by the tool from the narration, not written by Muse
Muse đang phân tích…|Muse is analyzing…
Tạo yêu cầu và sao chép|Create request and copy
Dán câu chuyện trước.|Paste the story first.
Dùng khi phân tích tự động không chạy được. Bước 1: bấm «Tạo yêu cầu và sao chép», dán vào khung chat Muse (mở Muse bằng nút «Mở Muse / Đăng nhập» bên trái). Bước 2: dán trả lời của Muse vào ô dưới rồi bấm «Tách cảnh».|Use this when automatic analysis cannot run. Step 1: click “Create request and copy” and paste it into the Muse chat (open Muse with “Open Muse / Sign in” on the left). Step 2: paste Muse’s reply below and click “Split scenes”.
Sao chép yêu cầu|Copy request
Dán trả lời của Muse (CẢNH 1 / CÂU / PROMPT …)|Paste Muse's reply (SCENE 1 / SENTENCES / PROMPT …)
Tách cảnh từ trả lời của Muse|Split scenes from Muse's reply
Chat Muse đang bận quá lâu. Chờ Muse xong việc hiện tại rồi bấm Phân tích lại.|The Muse chat has been busy for too long. Wait until Muse finishes, then analyze again.
Chưa thấy ô chat Muse. Đăng nhập Muse tài khoản 1 trong cửa sổ Muse rồi bấm Phân tích lại.|The Muse chat box was not found. Sign in to Muse account 1 in the Muse window, then analyze again.
Chưa bấm được nút Gửi của Muse.|Could not click Muse's Send button.
Không thấy yêu cầu hiện trong chat Muse. Mở cửa sổ Muse tài khoản 1 xem Muse có nhận tin nhắn không.|The request did not appear in the Muse chat. Open the Muse account 1 window and check whether Muse received the message.
Muse trả lời quá lâu. Thử lại.|Muse took too long to reply. Try again.
Đã dừng phân tích.|Analysis stopped.
Muse đang phân tích câu chuyện. Chờ xong hoặc bấm Dừng phân tích.|Muse is analyzing the story. Wait for it to finish or click Stop analysis.
Muse đang phân tích. Chờ xong hoặc bấm Dừng.|Muse is analyzing. Wait for it to finish or click Stop.
Chưa mở được Muse tài khoản 1.|Could not open Muse account 1.
Đang mở Muse…|Opening Muse…
Dừng hàng đợi và các thao tác trình duyệt trước khi nhờ Muse phân tích.|Stop the queue and browser operations before asking Muse to analyze.
Dán kịch bản trước khi nhờ Muse đọc.|Paste the story before asking Muse to read it.
2. Các cảnh|2. Scenes
Sửa lời đọc hoặc prompt từng cảnh nếu cần.|Edit each scene's narration or prompt if needed.
Tạo clip|Create clips
Giọng, phụ đề & xuất MP4|Voice, subtitles & MP4 export
Nghe thử · Phụ đề bật/tắt|Listen · Subtitles on/off
Giọng kể|Narrator voice
Giọng|Voice
Không lồng tiếng|No voiceover
Microsoft (miễn phí, cần mạng)|Microsoft (free, needs internet)
Giọng clone của bạn (miễn phí)|Your cloned voice (free)
Giọng có sẵn trong Windows|Built-in Windows voice
Chọn giọng|Choose voice
Tốc độ đọc|Reading speed
Chậm|Slow
Bình thường|Normal
Nhanh|Fast
Rất nhanh|Very fast
Nghe thử giọng|Listen to voice
Đang tạo giọng…|Generating voice…
Cài giọng miễn phí|Install free voices
Cài lại giọng miễn phí|Reinstall free voices
Đang cài giọng…|Installing voices…
Dừng cài|Stop installing
Clone giọng của bạn (miễn phí)|Clone your voice (free)
Tên giọng|Voice name
Ví dụ: Giọng của tôi|e.g. My voice
Đây là giọng của tôi hoặc của người đã đồng ý cho tôi nhân bản.|This is my voice, or the voice of someone who agreed to let me clone it.
Chọn file ghi âm mẫu và nhân bản|Choose a voice sample and clone it
Ghi âm 6–15 giây, một người nói rõ, không nhạc nền (.wav .mp3 .m4a …). Chạy ngay trên máy, không gửi lên dịch vụ trả phí; lần đầu dùng sẽ tải mô hình nên lâu.|Record 6–15 seconds, one clear speaker, no background music (.wav .mp3 .m4a …). It runs on this computer and is not sent to a paid service; the first use downloads a model, so it takes a while.
Phụ đề|Subtitles
Hiện phụ đề trong video|Show subtitles in the video
Xuất thêm file .srt|Also export an .srt file
Phông chữ|Font
Cỡ chữ|Text size
Màu chữ|Text color
Màu viền|Outline color
Vị trí|Position
Dưới|Bottom
Giữa|Middle
Trên|Top
Nền mờ sau chữ|Dim background behind text
Xem trước phụ đề|Subtitle preview
Âm thanh & xuất video|Audio & video export
Tiếng động gốc của clip|Original clip sound effects
Tắt|Off
Nhỏ (nền dưới giọng kể)|Low (background under narration)
Trung bình|Medium
Tên video|Video name
Tên truyện|Story name
Truyện|Story
Tự edit: cảnh nào lời đọc ngắn hơn clip thì cắt phần thừa; lời dài hơn clip thì giữ khung cuối cho đọc hết. Prompt đã dặn Muse tạo video im lặng, không âm thanh (nhân vật vẫn há miệng, cười, mấp máy trên hình); giọng đọc do app thêm.|Auto edit: if a scene's narration is shorter than its clip, the extra footage is cut; if it is longer, the last frame is held so it can finish. Prompts tell Muse to make the video silent with no audio (characters still open their mouths, laugh and mouth words on screen); the narration is added by the app.
Xuất MP4|Export MP4
Mở video|Open video
Video đã xuất|Exported video
Không mở được video này ở đây. Bấm «Mở video» để mở thư mục chứa file.|This video cannot be opened here. Click “Open video” to show its folder.
Đang xuất…|Exporting…
Danh sách clip kể chuyện|Story clip workspace
Clip kể chuyện lưu trong thư mục «KeChuyen» theo từng truyện, đánh số cảnh 001, 002, 003…|Story clips are saved in the “KeChuyen” folder per story, numbered by scene 001, 002, 003…
Sẵn sàng cho câu chuyện mới|Ready for your next story
Lời đọc|Narration
Lời đọc của cảnh này|Narration for this scene
Prompt gửi Muse|Prompt sent to Muse
Xóa cảnh|Remove scene
Đã sao chép yêu cầu. Dán vào khung chat Muse.|Request copied. Paste it into the Muse chat.
Nhấn Ctrl+C để sao chép yêu cầu rồi dán vào chat Muse.|Press Ctrl+C to copy the request, then paste it into the Muse chat.
Chia cảnh trước.|Split the script into scenes first.
Cảnh nào cũng cần prompt.|Every scene needs a prompt.
Xóa giọng clone này khỏi máy?|Delete this cloned voice from this computer?
Đã thêm giọng clone. Bấm «Nghe thử giọng» để nghe.|Cloned voice added. Click “Listen to voice” to hear it.
Chưa có clip kể chuyện nào trong hàng đợi.|There are no story clips in the queue yet.
Đã xuất MP4.|MP4 exported.
Không lồng tiếng: video giữ tiếng động của clip, phụ đề lấy từ lời đọc của cảnh.|No voiceover: the video keeps the clip's sound effects and subtitles come from each scene's narration.
Chưa cài giọng Microsoft. Bấm «Cài giọng miễn phí» (cần Python 3.10–3.13 trên máy và mạng).|Microsoft voices are not installed. Click “Install free voices” (needs Python 3.10–3.13 and internet).
Chưa cài giọng clone. Bấm «Cài giọng miễn phí» (cần Python 3.10–3.13 và mạng; lần đầu tải mô hình nên lâu).|Voice cloning is not installed. Click “Install free voices” (needs Python 3.10–3.13 and internet; the first run downloads a model, so it takes a while).
Chưa có giọng clone. Mở mục «Clone giọng của bạn» và thêm file ghi âm mẫu.|No cloned voice yet. Open “Clone your voice” and add a voice sample.
Giọng có sẵn chỉ có trên Windows.|Built-in voices are available on Windows only.
Windows chưa có giọng đọc nào. Thêm giọng tiếng Việt trong Cài đặt Windows → Ngôn ngữ, hoặc dùng giọng Microsoft.|Windows has no speech voices. Add a Vietnamese voice in Windows Settings → Language, or use a Microsoft voice.
Giọng clone chạy ngay trên máy, miễn phí, dành cho tiếng Việt (ngôn ngữ khác dùng giọng Microsoft hoặc giọng Windows). Lần nghe/xuất đầu tiên phải tải mô hình nên lâu.|The cloned voice runs on this computer for free and is meant for Vietnamese (use Microsoft or Windows voices for other languages). The first listen/export downloads a model, so it takes a while.
Giọng Microsoft miễn phí, nhiều ngôn ngữ (✓ = hợp ngôn ngữ kịch bản), cần có mạng khi đọc.|Free Microsoft voices in many languages (✓ = matches the script's language); they need an internet connection while reading.
⚠ Chưa khớp kịch bản gốc:|⚠ Does not match the original script yet:
Sửa lời theo kịch bản gốc|Fix narration to match the original script
Đã sửa lời các cảnh về đúng nguyên văn kịch bản. Câu bị bỏ sót thành cảnh mới.|Narration restored to the script's exact wording. Missing sentences became new scenes.
⚠ Chưa có prompt: cảnh này sẽ không tạo được.|⚠ No prompt: this scene cannot be created.
⚠ Prompt quá ngắn, dễ ra hình sai. Mô tả rõ ai, ở đâu, làm gì, nét mặt.|⚠ Prompt too short; the picture may come out wrong. Say who, where, what they do and their expression.
⚠ Prompt chưa chia mốc thời gian («0–3 giây: …») nên chuyển động dễ đứng yên hoặc lệch lời đọc.|⚠ The prompt has no time marks ("0–3 seconds: …"), so the motion may stay still or drift from the narration.
⚠ Prompt thiếu câu «no speech» — nhân vật có thể bị nói.|⚠ The prompt lacks the “no speech” line — characters may talk.
⚠ Có lời thoại trong ngoặc kép — nhân vật sẽ không nói, chỉ thể hiện bằng cử chỉ và nét mặt.|⚠ Quoted dialogue found — characters will not speak; it is shown through gestures and expressions.
Đang đọc thông tin các cảnh…|Reading scene information…
Giọng Windows có sẵn, chạy offline. Chất lượng tiếng Việt tùy giọng bạn đã cài.|Built-in Windows voices run offline. Vietnamese quality depends on the voices you installed.
Chưa có clip kể chuyện. Chia cảnh và bấm Tạo clip trước.|No story clips yet. Split the script and click Create clips first.
Chưa có giọng|No voice yet
Chưa có giọng clone|No cloned voice yet
Không thấy giọng Windows|No Windows voice found
Đang xử lý…|Working…
Đang làm giọng đọc…|Generating narration…
Đang đo độ dài từng cảnh…|Measuring each scene…
Đang nối các cảnh…|Joining scenes…
Đã xuất MP4|MP4 exported
Đang nạp mô hình giọng (lần đầu phải tải nên lâu, vài phút)…|Loading the voice model (the first run downloads it, a few minutes)…
Đã nạp mô hình giọng.|Voice model loaded.
Đang tìm Python…|Looking for Python…
Cài giọng Microsoft (edge-tts)…|Installing Microsoft voices (edge-tts)…
Cài giọng clone VieNeu (có thể vài phút)…|Installing VieNeu cloned voices (may take a few minutes)…
Đã cài xong giọng miễn phí. Lần nghe/clone đầu sẽ tải mô hình nên lâu hơn.|Free voices installed. The first listen/clone downloads a model and takes longer.
Đã dừng.|Stopped.
Đã dừng cài giọng.|Voice installation stopped.
Đang dùng thử 24 giờ.|24-hour trial active.
Hết 24 giờ dùng thử. Nhập key để tiếp tục tạo video.|Your 24-hour trial has ended. Activate a license to continue.
Máy chưa hỗ trợ lưu mã hóa dùng thử/key.|Encrypted license storage is unavailable on this device.
Dữ liệu dùng thử không hợp lệ. Cần chủ phần mềm hỗ trợ.|Trial data is invalid. Contact the software owner.
Giờ hệ thống lùi so với lần dùng trước. Kiểm tra lại ngày giờ.|System time moved backwards. Check your date and time.
Key không hợp lệ, hết hạn hoặc không dành cho máy này.|The key is invalid, expired or belongs to another device.
Chọn từ 1–10 tài khoản.|Choose between 1 and 10 accounts.
Ngôn ngữ|Language
Ngôn ngữ giao diện|Interface language
QR chuyển khoản BIDV|BIDV payment QR
Không gian cá nhân|Personal workspace
Lưu hàng đợi & phiên riêng trên máy|Queue and sessions stored on this device
Tạo video|Create videos
Tạo ảnh|Create images
Danh sách tạo ảnh|Image workspace
▶ Tạo ảnh|▶ Create images
Thêm vào đầu mỗi prompt ảnh (tuỳ chọn)|Add to the start of every image prompt (optional)
Ví dụ: Tạo ảnh:|Example: Generate an image:
Ảnh lưu vào thư mục «Anh» theo số prompt: 001, 002, 003…|Images are saved to the “Anh” folder by prompt number: 001, 002, 003…
Sẵn sàng cho ảnh mới|Ready for your next image
CSS selector ảnh kết quả (tab Tạo ảnh)|Result image CSS selector (Create images tab)
Ảnh đã lưu|Saved image
Ảnh trước|Previous image
Chưa có ảnh|No image yet
Không mở được ảnh này. Dùng “Mở vị trí ảnh” để kiểm tra file.|Cannot open this image. Use Show image in folder to inspect the saved file.
Mở vị trí ảnh|Show image in folder
Tìm / lưu ảnh đã tạo|Find / save existing image
✓ Đã lưu xong ảnh|✓ Image saved
Đang lưu ảnh về máy|Saving image
Đã gửi · chờ Muse tạo ảnh|Sent · Waiting for image generation
Đính kèm|Attach
Lưu|Save
Số ảnh đã lưu|Images saved
Đã lưu ảnh về máy|Image saved to this device
Chưa xác nhận được tệp ảnh đã lưu.|Could not confirm the saved image file.
Không xử lý được tác vụ ảnh.|The image task could not be processed.
chưa thấy ảnh mới trong chat|no new image in the chat yet
Đúng phản hồi của cảnh này · đang lưu ảnh về máy|Matched scene result · Saving image
Muse đang tạo hoặc tải ảnh|Muse is generating or loading the image
Ảnh đã hiện · chờ ổn định trước khi lưu|Image visible · Waiting for it to settle before saving
Ảnh đã hiện · chờ Muse tạo xong rồi mới lưu|Image visible · Waiting for Muse to finish before saving
Ảnh của prompt đã sẵn sàng lưu|Prompt image is ready to save
Chờ đúng ảnh của prompt|Waiting for the prompt's image
Trang Muse đang lag · giữ đúng cảnh đã gửi, chưa có ảnh để lưu|Muse is slow · Keeping the submitted scene; no image to save yet
Trình duyệt tích hợp|Built-in browser
Phiên tài khoản|Account session
Liên hệ|Contact
Số điện thoại:|Phone:
Quét mã bằng Zalo để nhắn cho chủ phần mềm.|Scan with Zalo to message the software owner.
Mở Muse / Đăng nhập|Open Muse / Sign in
Đăng xuất tài khoản này|Sign out of this account
Mỗi tài khoản giữ một phiên đăng nhập riêng.|Each account keeps its own sign-in session.
Xuất thông tin lỗi chat|Export chat diagnostics
Dùng thử / Kích hoạt key|Trial / Activate license
Kết nối & cài đặt|Connection & settings
Tài khoản đăng nhập trực tiếp trên Muse.|Sign in to your account directly on Muse.
Không cần nhập mật khẩu vào tool.|No password is entered in this app.
KHÔNG GIAN LÀM VIỆC|YOUR WORKSPACE
Danh sách tạo video|Video workspace
Nhập / sửa prompt|Add / edit prompts
Nhập prompt & ảnh tham chiếu|Prompts & reference images
Thêm hoặc chỉnh sửa cảnh|Add or edit scenes
Dán prompt / kịch bản hoàn chỉnh|Paste complete prompts / script
Tự nhận diện PROMPT / SCENE / CẢNH — giữ nguyên|Detect PROMPT / SCENE / CẢNH — preserve content
Toàn bộ là một prompt|Use everything as one prompt
Mỗi dòng là một prompt (chọn khi cần)|One prompt per line
Kịch bản thô → prompt theo mẫu|Draft script → template prompts
Tỉ lệ|Aspect ratio
Phong cách|Style
Ảnh tham chiếu|Reference image
Một ảnh chung cho tất cả prompt / nhân vật|One shared image for every prompt / character
Ảnh theo số thứ tự prompt: 01, 02, 03…|Images by prompt number: 01, 02, 03…
Không dùng ảnh tham chiếu|No reference images
Chọn ảnh|Choose image
Chọn thư mục ảnh theo STT|Choose numbered image folder
Bỏ ảnh|Remove image
Áp ảnh cho tất cả prompt đang chờ|Apply images to all pending prompts
Có thể dán ảnh ở đây cho tất cả, hoặc dán riêng ở từng dòng prompt bên dưới.|Paste a shared image here, or paste images into individual prompt rows below.
Chưa chọn ảnh.|No image selected.
Prompt đã có cảnh/chuyển động sẽ được giữ nguyên, không thêm câu chat.|Complete scene prompts are preserved without adding chat instructions.
Đọc / cập nhật danh sách|Read / update list
Nếu danh sách cũ bị chia sai, bấm Xóa đang chờ trước khi nhập lại. VOICEOVER được lưu riêng để dựng, không gửi vào phần VIDEO PROMPT.|If an old import split incorrectly, clear pending scenes before importing again. VOICEOVER is stored separately and is not sent as VIDEO PROMPT.
Prompt & ảnh tham chiếu riêng|Individual prompts & references
Thêm dòng|Add row
Mỗi dòng có thể đính kèm nhiều ảnh tham chiếu.|Each row supports multiple reference images.
Chỉ thêm vào hàng đợi|Add to queue only
Xuất & nối video|Export & merge videos
Clip rời để dựng trong CapCut|Separate clips for CapCut
Giữ riêng từng cảnh; xuất clip đánh số theo thứ tự để nhập vào CapCut.|Keep individual scenes; export numbered clips in order for CapCut.
Sau khi tạo xong: Giữ clip riêng|After generation: Keep individual clips
Xuất clip cho CapCut|Export clips for CapCut
Mở gói clip|Open clip package
Video tổng · Theo thứ tự prompt|Merged video · Prompt order
Chọn nối khi cần video tổng; clip nguồn vẫn giữ nguyên (cần FFmpeg).|Merge when needed; original clips are preserved (requires FFmpeg).
Nối video ngay|Merge videos
Mở video tổng|Open merged video
Hàng đợi sản xuất|Production queue
Sẵn sàng|Ready
Gửi câu bắt đầu|Send opening message
Tiếp tục|Continue
Tiếp tục hàng đợi|Continue queue
Chạy hàng đợi|Run queue
Dừng|Stop
Mở thư mục|Open folder
Chạy song song|Parallel browsers
Mở các trình duyệt|Open browsers
Chưa chọn thư mục lưu|No output folder selected
Chưa chọn thư mục|No folder selected
Đổi thư mục|Change folder
Gửi câu “Bắt đầu công việc mới nhé” khi cần mở đầu cuộc trò chuyện.|Optionally send “Bắt đầu công việc mới nhé” to start a new conversation.
cảnh trong danh sách|scenes in the queue
Theo cảnh đang chạy|Follow active scenes
Quản lý|Manage
Xóa cảnh chưa gửi|Clear unsent scenes
Xóa toàn bộ danh sách|Clear entire queue
Xuất danh sách JSON|Export queue JSON
Cần kiểm tra|Needs attention
Xem cảnh dở / lỗi|Show interrupted / failed scenes
Sẵn sàng cho video mới|Ready for your next video
Nhập prompt và ảnh tham chiếu để thêm các cảnh vào danh sách.|Add prompts and reference images to queue your scenes.
Video lưu theo số prompt: 001, 002, 003…|Videos saved by prompt number: 001, 002, 003…
Kết nối Muse|Muse connection
Selector mặc định chỉ là điểm khởi đầu, chưa được xác minh với Muse. Nếu tool không nhận đúng ô chat/video, cần chỉnh theo DOM thực tế. Không có API riêng được giả định.|Default selectors are a starting point. If chat or video controls are not detected, adjust them to the actual Muse page. No private API is assumed.
Trình duyệt đăng nhập|Sign-in browser
Chromium khác — Chọn đường dẫn|Other Chromium — Choose executable
Đường dẫn trình duyệt (chỉ dùng khi chọn Chromium khác)|Browser executable (for Other Chromium only)
Chọn tệp trình duyệt…|Choose browser executable…
Đóng cửa sổ tài khoản trước khi đổi. Mỗi trình duyệt giữ hồ sơ riêng do app tạo; cần đăng nhập lần đầu, không dùng lại hồ sơ Chrome/Edge cá nhân đang mở.|Close account windows before changing browsers. Each browser uses an app-managed profile. Sign in once; personal Chrome/Edge profiles are not reused.
Sau khi tạo xong toàn bộ prompt|After all prompts finish
Giữ clip riêng để edit|Keep separate clips for editing
Tự xuất gói clip cho CapCut|Automatically export a CapCut clip package
Tự nối thành video MP4|Automatically merge into MP4
FFmpeg (cần ffprobe cùng thư mục hoặc trong PATH)|FFmpeg (ffprobe must be alongside it or in PATH)
Chọn ffmpeg.exe…|Choose ffmpeg.exe…
Cách chạy prompt|Prompt dispatch
Song song — một prompt / tài khoản|Parallel — one prompt per account
Lần lượt — chờ tải xong từng video|Sequential — wait until each video is saved
Nghỉ giữa các lượt (giây)|Delay between scenes (seconds)
Số tài khoản sử dụng (1–10)|Accounts to use (1–10)
CSS selector ô chat|Chat composer CSS selector
CSS selector ô tải ảnh|File input CSS selector
CSS selector ảnh đã sẵn sàng (để trống = tự nhận diện)|Image-ready CSS selector (blank = automatic)
CSS selector nút gửi (để trống = tự nhận diện nút Gửi)|Send button CSS selector (blank = automatic)
CSS selector nút dừng tạo trong Muse (để trống = tự nhận diện)|Muse Stop button CSS selector (blank = automatic)
CSS selector vùng phản hồi Muse (để trống = tự nhận diện)|Muse response CSS selector (blank = automatic)
CSS selector phần tử video kết quả|Result video CSS selector
Báo Muse chậm sau (phút) — vẫn tiếp tục chờ|Slow-generation warning after (minutes) — continues waiting
Phiên đăng nhập được lưu trong hồ sơ trình duyệt cục bộ của ứng dụng. Đăng xuất trực tiếp trên Muse khi cần. Mỗi phiên tài khoản có hàng xử lý riêng. Khi có lỗi, dừng phát tác vụ mới; kiểm tra Muse trước khi chạy lại.|Sign-in sessions are stored in local app-managed browser profiles. Each account has its own worker. On errors, new dispatch stops; check Muse before retrying.
Lưu cấu hình|Save settings
Dùng thử & kích hoạt|Trial & activation
Mã máy|Device ID
Sao chép mã máy|Copy device ID
Key kích hoạt|Activation key
Kích hoạt key|Activate license
Mua key sau dùng thử|Purchase a license after trial
Giá theo thỏa thuận với chủ phần mềm. Sau khi chuyển khoản, gửi mã máy và mã giao dịch cho người bán để nhận key. Chuyển khoản không tự kích hoạt.|Contact the seller for pricing. After payment, send your device ID and transaction reference to obtain a license. Payment does not automatically activate the app.
Dán key do chủ phần mềm cấp|Paste the activation key provided by the seller
Dán cả bộ PROMPT 01, PROMPT 02… vào đây. Mỗi khối giữ nguyên cảnh, nhân vật, hành động và camera; không tách từng câu.|Paste PROMPT 01, PROMPT 02… here. Each block preserves its scene, character, action and camera; sentences are not split.
Prompt hoàn chỉnh của cảnh này|Complete prompt for this scene
Nội dung này đã thêm vào hàng đợi. Bấm Đọc / cập nhật danh sách nếu muốn tạo lại.|This content is already queued. Use Read / update list to add it again.
Nhập prompt cho từng dòng hoặc xóa dòng trống.|Enter a prompt in every row or remove empty rows.
Dừng hàng đợi hiện tại trước khi tạo lượt mới.|Stop the current queue before starting a new run.
Chọn thư mục lưu video trước.|Choose an output folder first.
Ảnh riêng|Choose references
Bỏ ảnh dòng này|Remove row images
Xóa dòng|Remove row
Không dùng ảnh.|No reference images.
Đang chờ|Pending
Đang xử lý|Processing
Đã xong|Done
Đã dừng|Stopped
Đang nhập prompt|Entering prompt
Kiểm tra cảnh dở|Checking interrupted scene
Chuẩn bị tác vụ|Preparing scene
Đang tải ảnh tham chiếu|Uploading reference images
Đang gửi prompt|Sending prompt
Chưa xác nhận Muse nhận prompt|Waiting for prompt confirmation
Đã gửi · chờ Muse tạo video|Sent · Waiting for generation
Đang tải video về máy|Downloading video
Nghỉ trước lượt tiếp theo|Waiting before the next scene
Nội dung gốc|Original content
Nội dung prompt|Prompt content
Ảnh|Image
Gửi|Send
Tạo|Generate
Tải|Download
Mở vị trí video|Show video in folder
Tìm / tải video đã tạo|Find / download existing video
Tìm kết quả từ prompt đã gửi, không gửi lại prompt mới.|Find the result of the existing prompt without submitting it again.
Gửi lại prompt|Resubmit prompt
Video trước|Previous video
Tạo lại|Regenerate
Tạo lại cảnh này; giữ video cũ.|Regenerate this scene; keep the previous video.
Xóa|Remove
Đưa về sửa|Edit scene
Video đã tải|Saved video
Chưa có video|No video yet
Không mở được video này. Dùng “Mở vị trí video” để kiểm tra file.|Cannot play this video. Use Show video in folder to inspect the saved file.
Đã tải xong video|Video saved successfully
Đang xử lý, chưa có phần trăm từ Muse|Processing; Muse has not provided a percentage
Cookie phiên lưu mã hóa riêng trên máy.|Session cookies are encrypted on this device.
Lần lượt · tải xong từng video mới gửi tiếp|Sequential · Save each video before sending the next
Đang bấm dừng trong Muse…|Stopping generation in Muse…
Đang kiểm tra trước khi chạy|Preparing to run
Đang dừng…|Stopping…
Đang chạy|Running
Tự nối khi đủ video.|Automatically merge after all videos finish.
Chỉ nối khi bạn chọn; giữ clip nguồn.|Merge on request; keep original clips.
Xuất clip rời đúng thứ tự để nhập vào CapCut.|Export numbered clips in order for CapCut.
Sau khi tạo xong: Nối MP4|After generation: Merge MP4
Sau khi tạo xong: Xuất clip CapCut|After generation: Export CapCut clips
Đang gửi câu bắt đầu…|Sending opening message…
Đã gửi câu bắt đầu|Opening message sent
Câu bắt đầu: tùy chọn|Opening message: optional
Chưa gửi câu bắt đầu|Opening message not sent
Chuẩn bị gửi cảnh…|Preparing scene submission…
Đang gửi câu bắt đầu · bạn có thể bấm Chạy|Sending opening message · You can press Run
Đã xong tất cả|All scenes completed
Đã lưu cấu hình.|Settings saved.
Đã sao chép mã máy.|Device ID copied.
Nhấn Ctrl+C để sao chép mã máy.|Press Ctrl+C to copy your device ID.
Đã kích hoạt key.|License activated.
Đã lưu thông tin cấu trúc chat. Tệp không chứa cookie hay nội dung prompt.|Chat diagnostics saved. The file contains no cookies or prompt content.
Xóa tất cả tác vụ đang chờ? Các clip đã tải vẫn giữ nguyên.|Clear all pending scenes? Saved clips are preserved.
Dừng và xóa toàn bộ danh sách tác vụ? File video đã tải không bị xóa. Tác vụ đã gửi có thể còn chạy trên Muse.|Stop and clear the entire queue? Saved videos are preserved. Submitted tasks may still be running in Muse.
Kiểm tra Muse trước. Gửi lại prompt có thể tạo video trùng nếu tác vụ trước đã gửi.|Check Muse first. Resubmitting may create a duplicate if the original prompt was accepted.
Muse còn xử lý · chờ hoàn tất trước khi gửi đúng cảnh cũ|Muse is still working · Waiting before resubmitting this scene
Cảnh cũ chưa có bằng chứng gửi ảnh/prompt · bắt đầu gửi đúng cảnh|No verified legacy submission · Sending the exact scene and references
Chờ lượt gửi tiếp theo|Waiting for the next submission slot
Muse đang lag · chờ ô soạn thảo sẵn sàng|Muse is slow · Waiting for the composer
Muse còn hoàn tất phản hồi trước · chưa gửi prompt mới|Muse is finishing its previous response · No new prompt sent yet
Chờ ô chat Muse tải xong · đăng nhập nếu cần; chưa gửi cảnh|Waiting for Muse chat · Sign in if needed; scene not sent yet
Đang gửi đúng prompt và ảnh đã khóa|Sending the exact locked prompt and images
Muse đang lag · chờ xác nhận, không bấm Gửi lần nữa|Muse is slow · Waiting for confirmation without clicking Send again
Chưa tìm được đúng tin nhắn của lượt gửi · giữ cảnh, không tải video lịch sử hay gửi trùng|Current submission not found · Keeping the scene without downloading old videos or resubmitting
Muse đã xác nhận dừng · gửi lại đúng cảnh đã khóa|Muse confirmed Stop · Resubmitting the locked scene
Trang Muse đang lag · giữ đúng cảnh đã gửi, chưa có video để tải|Muse is slow · Keeping the submitted scene; no video to download yet
Trang Muse đang lag · chưa xác nhận tin nhắn prompt, chưa có video để tải|Muse is slow · Prompt not confirmed; no video to download yet
Kiểm tra bằng chứng cảnh đã gửi trước khi lấy kết quả|Checking submission identity before recovering the result
Chưa có thông tin xác nhận prompt đã được gửi. Kiểm tra Muse trước khi thử lại.|No verified submission information. Check Muse before retrying.
Chưa nhận diện được nút Gửi duy nhất của Muse. Prompt vẫn ở ô soạn thảo; tool chưa gửi tiếp. Chọn nút Gửi trong cài đặt hoặc xuất thông tin lỗi.|Cannot identify a unique Muse Send button. The prompt remains in the composer. Configure its selector or export diagnostics.
Ảnh tham chiếu chưa sẵn sàng; tool chưa gửi prompt.|Reference images are not ready; the prompt has not been sent.
Nút Gửi của Muse chưa sẵn sàng. Chờ ảnh tải xong rồi thử lại.|Muse Send is not ready. Wait for image uploads before retrying.
Đã khóa prompt và ảnh tham chiếu của cảnh này|Scene prompt and reference images locked
Đang nhập đúng prompt đã khóa vào ô chat|Entering the exact locked prompt
Đang kiểm tra ảnh đã khóa trong ô soạn thảo|Checking locked reference images in the composer
Chưa thấy đúng prompt trong chat Muse|The exact prompt has not appeared in Muse chat
Đã thấy tin nhắn · chờ Muse phản hồi|Message found · Waiting for Muse response
chưa thấy video mới trong chat|no new video in the chat yet
Đúng phản hồi của cảnh này · đang lưu video về máy|Matched scene result · Saving video
Đã tải và lưu video về máy|Video downloaded and saved
Đang mở Muse|Opening Muse
Đang kiểm tra ô chat|Checking chat composer
Chờ ô chat · đăng nhập Muse nếu cần|Waiting for chat · Sign in to Muse if needed
Đã dừng Test|Opening message canceled
Đã kích hoạt key.|License activated.
Đã kích hoạt key.|License activated.
`.trim().split('\n').map(line=>line.split('|')));
  const norm=s=>String(s).replace(/\s+/g,' ').trim();
  let language='en';try{language=localStorage.getItem('museStudio.language')==='vi'?'vi':'en';}catch{}
  function t(value){
    const raw=String(value??'');if(language==='vi')return raw;
    const key=norm(raw);if(dictionary[key])return raw.replace(key,dictionary[key]);
    const decorated=key.match(/^([▶■▱▦▧✎↗⚙✓＋+\s]*)(.*?)([＋▾\s]*)$/u);
    if(decorated&&dictionary[decorated[2]])return decorated[1]+dictionary[decorated[2]]+decorated[3];
    const photoRetry=key.match(/^Chưa lưu được ảnh · giữ đúng kết quả và thử lại: (.+)$/);if(photoRetry)return 'Image not saved yet · Retrying the same result: '+t(photoRetry[1]);
    const retry=key.match(/^Chưa lưu được video · giữ đúng kết quả và thử tải lại: (.+)$/);if(retry)return 'Video not saved yet · Retrying the same result: '+t(retry[1]);
    const expiry=key.match(/^(.*?) Hạn: (.+)$/);if(expiry)return t(expiry[1])+' Expires: '+expiry[2];
    const patterns=[
      [/^Phiên bản (.+)$/,m=>'Version '+m[1]],
      [/^Tài khoản (\d+)$/,m=>'Account '+m[1]],
      [/^Đã thấy tin nhắn · chờ Muse phản hồi \((.+)\)$/,m=>'Message found · Waiting for Muse response ('+t(m[1])+')'],
      [/^thấy (\d+) video mới nhưng chưa gắn được vào đúng prompt$/,m=>'found '+m[1]+' new video(s) not yet bound to this prompt'],
      [/^Tài khoản này chỉ chạy khi chọn «Chạy song song» từ (\d+) trình duyệt\.$/,m=>'This account only runs when "Parallel browsers" is set to '+m[1]+' or more.'],
      [/^Đăng xuất TK (\d+) · (.+)$/,m=>'Sign out · Account '+m[1]+' · '+t(m[2])],
      [/^(\d+) \/ (\d+) video đã lưu$/,m=>m[1]+' / '+m[2]+' videos saved'],
      [/^(\d+) \/ (\d+) ảnh đã lưu$/,m=>m[1]+' / '+m[2]+' images saved'],
      [/^thấy (\d+) ảnh mới nhưng chưa gắn được vào đúng prompt$/,m=>'found '+m[1]+' new image(s) not yet bound to this prompt'],
      [/^Muse đang tạo ảnh · (\d+)%$/,m=>'Muse is generating the image · '+m[1]+'%'],
      [/^Thêm (\d+) prompt ảnh và chạy toàn bộ tác vụ ảnh đang chờ\?.*$/,m=>'Add '+m[1]+' image prompts and run all pending image tasks? This may use Muse credits. Exact reviewed prompts and scene references will be sent.'],
      [/^(\d+) đang làm$/,m=>m[1]+' processing'],[/^(\d+) đang chờ$/,m=>m[1]+' pending'],[/^(\d+) cảnh dở(?: \/ lỗi)?$/,m=>m[1]+' interrupted / failed'],
      [/^(\d+) trình duyệt · (\d+) ô$/,m=>m[1]+' browsers · '+m[2]+' slots'],
      [/^Mở (\d+) trình duyệt$/,m=>'Open '+m[1]+' browsers'],
      [/^Song song (\d+) trình duyệt · mỗi trình duyệt 1 prompt$/,m=>'Parallel: '+m[1]+' browsers · 1 prompt each'],
      [/^Trình duyệt (\d+): (.+)$/,m=>'Browser '+m[1]+': '+t(m[2])],
      [/^Đã xử lý (.+)$/,m=>'Elapsed '+m[1]],[/^Đã tải (.+)$/,m=>'Downloaded '+m[1]],
      [/^(🔒 Đã khóa · )?(\d+) ảnh tham chiếu(.*)$/,m=>(m[1]?'🔒 Locked · ':'')+m[2]+' reference image(s)'+m[3].replace('TK ','Account ')],
      [/^(\d+) ảnh chung cho toàn bộ prompt\.$/,m=>m[1]+' shared reference image(s) for every prompt.'],
      [/^(\d+) ảnh theo số thứ tự\.$/,m=>m[1]+' numbered reference image(s).'],
      [/^Đã nhận (\d+) prompt hoàn chỉnh(.*?)\. Xem\/sửa hoặc bấm (Tạo video|Tạo ảnh)\.$/,m=>m[1]+' complete prompts loaded'+m[2].replace('mục tiêu','target')+'. Review or click '+(m[3]==='Tạo ảnh'?'Create images':'Create videos')+'.'],
      [/^Đã khôi phục (\d+) cảnh: (\d+) chờ, (\d+) dở\. .*$/,m=>'Restored '+m[1]+' scenes: '+m[2]+' pending, '+m[3]+' interrupted. Press Continue to resume. The opening message is optional.'],
      [/^✓ Vừa xong: (.+)$/,m=>'✓ Recently saved: '+m[1]],
      [/^Dùng thử đến (.+)$/,m=>'Trial until '+m[1]],[/^Nội dung chuyển khoản: (.+)$/,m=>'Payment reference: '+m[1]],
      [/^Đang đính kèm (\d+) ảnh tham chiếu đã khóa$/,m=>'Attaching '+m[1]+' locked reference image(s)'],
      [/^Thêm (\d+) prompt và chạy toàn bộ tác vụ đang chờ\?.*$/,m=>'Add '+m[1]+' prompts and run all pending scenes? This may use Muse credits. Exact reviewed prompts and scene references will be sent.'],
      [/^Dán ảnh tại đây cho (.+)$/,m=>'Paste references here for '+m[1]],
      [/^(\d+) cảnh$/,m=>m[1]+' scenes'],
      [/^Muse đã chia (\d+) cảnh\.(?: (.+?))? Xem lại lời đọc và prompt, rồi bấm Tạo clip\.$/,m=>'Muse split the story into '+m[1]+' scenes.'+(m[2]?' '+m[2].replace(/^Muse chưa đọc hiểu được cả bài \(trả lời sai khuôn\) nên các lượt chia cảnh chỉ kèm truyện làm ngữ cảnh\.$/,'Muse could not read and summarize the whole text (wrong reply format), so each scene-splitting request only carries the story as context.').replace(/Còn (\d+) cảnh có mốc chuyển động lệch thứ tự câu hoặc thiếu câu \(xem ⚠ ở từng cảnh\)\./,(x,n)=>n+' scene(s) still have motion beats out of sentence order or missing a sentence (see the ⚠ on each scene).'):'')+' Review the narration and prompts, then click Create clips.'],
      [/^Muse đã chia (\d+) cảnh, dừng ở câu (\d+)\/(\d+)\. (.+) Bấm «Phân tích tiếp» để Muse làm tiếp từ đó \(giữ nguyên các cảnh đã có\)\.$/,m=>'Muse split '+m[1]+' scene(s) and stopped at sentence '+m[2]+'/'+m[3]+'. '+m[4].replace(/^Muse chưa chia đúng đoạn từ câu (\d+)\.$/,'Muse did not split the part from sentence $1 correctly.').replace(/^Muse trả lời không đúng khuôn \(không thấy số câu và prompt cho từng cảnh\)\.$/,'Muse replied in the wrong format (no sentence numbers and prompts per scene).').replace(/^Muse trả lời quá lâu\. Thử lại\.$/,'Muse took too long to reply. Try again.')+' Click “Continue analysis” so Muse carries on from there (the existing scenes are kept).'],
      [/^Muse dừng ở câu (\d+)\/(\d+)\. Bấm «Phân tích tiếp» để làm tiếp\.$/,m=>'Muse stopped at sentence '+m[1]+'/'+m[2]+'. Click “Continue analysis” to carry on.'],
      [/^Muse chưa chia được đoạn bắt đầu từ câu (\d+)\.$/,m=>'Muse could not split the part starting at sentence '+m[1]+'.'],
      [/^(?:Phần (\d+)\/(\d+)|Phân tích|Viết lời quảng cáo|Đọc hiểu truyện(?: (\d+)\/(\d+))?) · (.+)$/,m=>{const head=m[1]?'Part '+m[1]+'/'+m[2]:/^Viết/.test(key)?'Writing the ad script':/^Đọc/.test(key)?'Reading the text'+(m[3]?' '+m[3]+'/'+m[4]:''):'Analysis',tail=[[/^xong$/,()=>'done'],[/^chuẩn bị yêu cầu…$/,()=>'preparing the request…'],[/^Muse còn đang xử lý việc trước, chờ rảnh rồi mới gửi…$/,()=>'Muse is still busy with earlier work; waiting until it is free…'],[/^chờ ô chat Muse \(đăng nhập nếu cần\)…$/,()=>'waiting for the Muse chat box (sign in if needed)…'],[/^đang gửi cho Muse…$/,()=>'sending to Muse…'],[/^Muse đang viết(?: \(đã (\d+) cảnh\))?…$/,x=>'Muse is writing'+(x[1]?' ('+x[1]+' scene(s) so far)':'')+'…'],[/^hỏi lại Muse (\d+) đoạn còn thiếu…$/,x=>'asking Muse again about '+x[1]+' missing part(s)…'],[/^soát lại chuyển động (\d+) cảnh…$/,x=>'re-checking the motion of '+x[1]+' scene(s)…'],[/^xong (\d+) cảnh$/,x=>'done: '+x[1]+' scene(s)']];for(const [re,fn] of tail){const x=m[5].match(re);if(x)return head+' · '+fn(x);}return head+' · '+m[5];}],
      [/^Muse đã chia (\d+) cảnh$/,m=>'Muse split the story into '+m[1]+' scenes'],
      [/^⚠ (\d+) cảnh đang dùng prompt mẫu \(chưa qua Muse\): cảnh (.+)\. Bấm «Phân tích bằng Muse» để Muse viết prompt hình đúng truyện, hoặc tự sửa prompt\.$/,m=>'⚠ '+m[1]+' scene(s) use a template prompt (not written by Muse): scene '+m[2]+'. Click “Analyze with Muse” so Muse writes picture prompts that match the story, or edit the prompts yourself.'],
      [/^Muse đã chia (\d+) cảnh\. Xem phần đối chiếu với kịch bản bên dưới rồi bấm Tạo clip\.$/,m=>'Muse split the story into '+m[1]+' scenes. Check the comparison with the script below, then click Create clips.'],
      [/^Muse chỉ tạo clip tối đa (\d+) giây: chọn mỗi cảnh từ 3 đến (\d+) giây\.$/,m=>'Muse only makes clips up to '+m[1]+' seconds: choose 3 to '+m[2]+' seconds per scene.'],
      [/^✓ Lời các cảnh khớp (\d+)% kịch bản gốc, đủ và đúng thứ tự\.$/,m=>'✓ The scenes match '+m[1]+'% of the original script, complete and in order.'],
      [/^⚠ (\d+) cảnh cần xem lại trước khi tạo \(mỗi lượt tạo tốn credit Muse\)\.$/,m=>'⚠ '+m[1]+' scene(s) need a look before creating (every creation uses Muse credits).'],
      [/^• Thiếu (\d+) câu của kịch bản: (.+)$/,m=>'• '+m[1]+' sentence(s) of the script are missing: '+m[2]],
      [/^• Cảnh (\d+) có lời không nằm trong kịch bản: (.+)$/,m=>'• Scene '+m[1]+' has narration that is not in the script: '+m[2]],
      [/^• Lời các cảnh chỉ khớp (\d+)% kịch bản\.$/,m=>'• The scenes only match '+m[1]+'% of the script.'],
      [/^⚠ Lời đọc dài khoảng ([\d.]+) giây, hơn clip (\d+) giây — sẽ phải giữ khung cuối\. Nên tách cảnh\.$/,m=>'⚠ The narration takes about '+m[1]+' s, longer than the '+m[2]+' s clip, so the last frame would be held. Split the scene.'],
      [/^⚠ Có chuyển mốc thời gian — (\d+) giây khó chứa nhiều khoảnh khắc\. Nên tách thành cảnh riêng\.$/,m=>'⚠ A time jump is mentioned; '+m[1]+' seconds can hardly hold several moments. Split it into separate scenes.'],
      [/^⚠ Mốc thời gian chưa hợp lý \(video của cảnh dài (\d+) giây\): các mốc phải tăng dần và kết thúc trong \d+ giây\.$/,m=>'⚠ Time marks look wrong (this scene\'s video is '+m[1]+' seconds): marks must increase and end within '+m[1]+' seconds.'],
      [/^⚠ Mốc nhắc câu ([\d, ]+) nhưng cảnh này chỉ gồm câu ([\d–]+)\.$/,m=>'⚠ A mark refers to sentence '+m[1]+' but this scene only covers sentence '+m[2].replace('–',' to ')+'.'],
      [/^⚠ Các mốc đảo thứ tự câu \(câu (\d+) rồi câu (\d+)\); phải đi đúng thứ tự lời đọc\.$/,m=>'⚠ Marks jump back in sentence order (sentence '+m[1]+' then sentence '+m[2]+'); they must follow the narration order.'],
      [/^⚠ Chưa có mốc nào minh họa câu ([\d, ]+)\.$/,m=>'⚠ No time mark illustrates sentence '+m[1]+'.'],
      [/^⚠ Quá nhiều câu cho (\d+) giây; hành động dễ bị bỏ sót hoặc dồn lại\.$/,m=>'⚠ Too many sentences for '+m[1]+' seconds; actions may be skipped or squeezed.'],
      [/^Đang dựng (\d+)\/(\d+) cảnh…$/,m=>'Building scene '+m[1]+'/'+m[2]+'…'],
      [/^(.+) \((nữ|nam)\) · (.+?)( ✓)?$/,m=>{const L={'Tiếng Việt':'Vietnamese','Tiếng Anh':'English','Tiếng Trung':'Chinese','Tiếng Nhật':'Japanese','Tiếng Hàn':'Korean','Tiếng Tây Ban Nha':'Spanish','Tiếng Pháp':'French','Tiếng Đức':'German','Tiếng Bồ Đào Nha':'Portuguese','Tiếng Ý':'Italian','Tiếng Nga':'Russian','Tiếng Thái':'Thai','Tiếng Indonesia':'Indonesian','Tiếng Hindi':'Hindi','Tiếng Ả Rập':'Arabic'};return m[1]+' ('+(m[2]==='nữ'?'female':'male')+') · '+(L[m[3]]||m[3])+(m[4]||'');}],
      [/^Ảnh nhân vật: (.+) — gắn vào mọi cảnh\.$/,m=>'Character image: '+m[1]+' — attached to every scene.'],
      [/^Đã tạo (\d+) cảnh quảng cáo từ ảnh sản phẩm \((?:mẫu «(.+)»|mẫu chung)\)\. Không có lời đọc nên video giữ tiếng động của clip\. Xem lại prompt rồi bấm Tạo clip\.$/,m=>'Created '+m[1]+' ad shots from the product photo ('+(m[2]?'template “'+t(m[2])+'”':'generic template')+'). There is no narration, so the video keeps the clip sound. Check the prompts, then click Create clips.'],
      [/^Ảnh sản phẩm: (.+) — gắn vào mọi cảnh\.$/,m=>'Product image: '+m[1]+' — attached to every scene.'],
      [/^Chọn tối đa (\d+) chuyển động máy quay\.$/,m=>'Choose at most '+m[1]+' camera movements.'],
      [/^(.*)bấm «Muse viết lời quảng cáo» lại\.$/,m=>t(m[1]+'bấm Phân tích lại.').replace(/analy[sz]e again\.$/,'write the ad script again.')],
      [/^Thêm (\d+) cảnh và chạy toàn bộ clip kể chuyện đang chờ\?.*cùng ảnh sản phẩm\.$/,m=>'Add '+m[1]+' scenes and run all pending story clips? This may use Muse credits. The reviewed prompts are sent exactly as shown, with the product image.'],
      [/^Thêm (\d+) cảnh và chạy toàn bộ clip kể chuyện đang chờ\?.*$/,m=>'Add '+m[1]+' scenes and run all pending story clips? This may use Muse credits. The reviewed prompts are sent exactly as shown, with the character image.'],
      [/^Còn (\d+) cảnh chưa xong\. Chạy hàng đợi cho xong rồi xuất\.$/,m=>m[1]+' scene(s) are not finished. Finish the queue, then export.'],
      [/^Còn (\d+) cảnh chưa có clip\. Chạy hàng đợi cho xong rồi xuất MP4\.$/,m=>m[1]+' scene(s) have no clip yet. Finish the queue, then export MP4.'],
      [/^Còn (\d+) cảnh chưa có clip \(cảnh (.+)\)\. Chạy hàng đợi cho xong rồi xuất\.$/,m=>m[1]+' scene(s) have no clip yet (scene '+m[2]+'). Finish the queue, then export.'],
      [/^(\d+) cảnh đã sẵn sàng\. Chọn giọng, phụ đề rồi bấm Xuất MP4\.$/,m=>m[1]+' scenes are ready. Choose a voice and subtitles, then click Export MP4.'],
      [/^Tự edit: cắt ([\d.]+) giây thừa(?:; (\d+) cảnh lời dài hơn clip nên giữ khung cuối \(cảnh (.+)\))?\.$/,m=>'Auto edit: cut '+m[1]+' s of extra footage'+(m[2]?'; '+m[2]+' scene(s) with narration longer than the clip hold the last frame (scene '+m[3]+')':'')+'.'],
      [/^Đã chuẩn bị (\d+) cảnh$/,m=>'Prepared '+m[1]+' scenes'],
      [/^Ghép cảnh (\d+)\/(\d+)$/,m=>'Joining scene '+m[1]+'/'+m[2]],
      [/^Đã đọc (\d+)\/(\d+) cảnh$/,m=>'Narrated '+m[1]+'/'+m[2]+' scenes'],
      [/^Tạo môi trường giọng \(Python (.+)\)…$/,m=>'Creating the voice environment (Python '+m[1]+')…'],
    ];
    for(const [re,fn]of patterns){const m=key.match(re);if(m)return fn(m);}return raw;
  }
  const records=new WeakMap(),attrs=new WeakMap();let scheduled=false;
  const excluded='script,style,textarea,input,.prompt,.jobTitle,.referenceName,.fileLine,.jobSource p,.draftContent>strong,#folderPath,#deviceCode,[data-i18n-skip]';
  function apply(){
    observer.disconnect();
    const walker=document.createTreeWalker(document.body,NodeFilter.SHOW_TEXT);let node;
    while(node=walker.nextNode()){
      if(!node.parentElement||node.parentElement.closest(excluded)||!node.nodeValue.trim())continue;
      let r=records.get(node);if(!r||node.nodeValue!==r.rendered)r={source:node.nodeValue};
      r.rendered=t(r.source);if(node.nodeValue!==r.rendered)node.nodeValue=r.rendered;records.set(node,r);
    }
    for(const e of document.querySelectorAll('[placeholder],[title],[aria-label],img[alt]')){
      if(e.closest('[data-i18n-skip]')||e.classList.contains('card'))continue;
      const r=attrs.get(e)||{};
      for(const name of ['placeholder','title','aria-label','alt'])if(e.hasAttribute(name)){
        const value=e.getAttribute(name);let a=r[name];if(!a||value!==a.rendered)a={source:value};a.rendered=t(a.source);if(a.rendered!==value)e.setAttribute(name,a.rendered);r[name]=a;
      }attrs.set(e,r);
    }
    document.documentElement.lang=language;const picker=document.getElementById('languagePicker');if(picker)picker.value=language;
    observer.observe(document.body,{subtree:true,childList:true,characterData:true,attributes:true,attributeFilter:['placeholder','title','aria-label','alt']});
  }
  const observer=new MutationObserver(()=>{if(!scheduled){scheduled=true;queueMicrotask(()=>{scheduled=false;apply();});}});
  function setLanguage(next){if(!['vi','en'].includes(next))return;language=next;try{localStorage.setItem('museStudio.language',next);}catch{}apply();}
  const nativeConfirm=window.confirm.bind(window);window.confirm=message=>nativeConfirm(t(message));
  window.studioI18n={t,setLanguage,apply,get language(){return language;}};apply();
})();
