// Interface-only localization. User prompts, titles, paths and form values are never translated.
(()=>{
  const dictionary=Object.fromEntries(`
Kể chuyện|Story
Chữ TO trên thumbnail (2–4 từ, tự viết hoa)|BIG thumbnail text (2–4 words, capitalised automatically)
Kiểu hình video|Video look
Hoạt hình sáng (có hiệu ứng âm thanh)|Bright cartoon (with sound effects)
Atlas cổ (giấy da, không hiệu ứng âm thanh)|Old atlas (parchment, no sound effects)
Video này dựng bằng bản cũ nên chưa có chương (mô tả và thẻ lập từ kịch bản). Bấm «Dựng lại» để có chương đúng giờ.|This video was built with an older version, so it has no chapters yet (description and tags were made from the script). Click “Rebuild” to get chapters with the right times.
Đang lập mô tả và thẻ từ kịch bản…|Preparing the description and tags from the script…
Tiêu đề hơi dài: YouTube thường chỉ hiện khoảng 60–70 ký tự. Muốn gọn hơn, bấm «Xem và sửa kịch bản», sửa tiêu đề rồi «Dựng lại» (tiêu đề trên video và tiêu đề đăng luôn khớp nhau).|The title is a little long: YouTube usually shows only about 60–70 characters. To shorten it, click “View and edit script”, edit the title and then “Rebuild” (the on-video title and the publish title always match).
Ngôn ngữ video (tiếng Anh, Đức, Pháp, Nga)|Video language (English, German, French, Russian)
English (tiếng Anh)|English
Deutsch (tiếng Đức)|Deutsch (German)
Français (tiếng Pháp)|Français (French)
Русский (tiếng Nga)|Русский (Russian)
Lời đọc và chữ trên video bằng tiếng Đức (làm cho khán giả nói tiếng Đức). Cần có mạng lúc đọc.|Narration and on-screen text are in German (made for German-speaking viewers). An internet connection is needed while narrating.
Lời đọc và chữ trên video bằng tiếng Pháp (làm cho khán giả nói tiếng Pháp). Cần có mạng lúc đọc.|Narration and on-screen text are in French (made for French-speaking viewers). An internet connection is needed while narrating.
Lời đọc và chữ trên video bằng tiếng Nga (làm cho khán giả nói tiếng Nga). Cần có mạng lúc đọc.|Narration and on-screen text are in Russian (made for Russian-speaking viewers). An internet connection is needed while narrating.
Tạo thumbnail 16:9|Create 16:9 thumbnail
Tạo lại thumbnail|Recreate thumbnail
Đang tạo thumbnail…|Creating thumbnail…
Thông tin đăng YouTube (đúng như trên video)|YouTube publishing info (exactly as on the video)
Tiêu đề|Title
Mô tả (đã gồm hashtag)|Description (hashtags included)
Thẻ tag|Tags
Mô tả (có chương, đã gồm hashtag) và thẻ|Description (with chapters, hashtags included) and tags
Tiêu đề, mô tả (đã gồm hashtag) và thẻ tag cũng được lưu trong file tieu-de-youtube.txt cạnh video.|The title, description (hashtags included) and tags are also saved in tieu-de-youtube.txt next to the video.
Mọi tài khoản Muse đang mở đều bận. Chờ xong hoặc đăng nhập thêm một tài khoản Muse khác rồi thử lại.|Every open Muse account is busy. Wait, or sign in to another Muse account and try again.
Mô tả video (có chương theo giờ)|Video description (with timed chapters)
Mô tả video|Video description
Thẻ tag (dán vào ô «Thẻ» của YouTube)|Tags (paste into the YouTube “Tags” box)
Sao chép hashtag|Copy hashtags
Đã sao chép hashtag.|Hashtags copied.
Sao chép thẻ tag|Copy tags
Đã sao chép thẻ tag.|Tags copied.
Lưu tiêu đề|Save title
Đã đổi tiêu đề. Bấm «Dựng lại video» để thẻ mở đầu trong video cũng đổi tên.|Title changed. Press “Rebuild video” so the opening card in the video changes too.
Thẻ mở đầu trong video vẫn hiện tên cũ. Bấm «Dựng lại video» để đổi.|The opening card in the video still shows the old title. Press “Rebuild video” to change it.
Sửa tiêu đề rồi bấm «Lưu tiêu đề»: mô tả và file ghi chú đổi theo.|Edit the title, then press “Save title”: the description and notes file follow.
Đang lập tiêu đề, mô tả, hashtag và thẻ tag từ kịch bản…|Preparing the title, description, hashtags and tags from the script…
Tiêu đề hơi dài: YouTube thường chỉ hiện khoảng 60–70 ký tự.|Long title: YouTube usually shows only about 60–70 characters.
Video này dựng bằng bản cũ hoặc quá ngắn nên chưa có chương theo giờ. Bấm «Dựng lại video» để mô tả có chương đúng giờ.|This video was built with an older version or is too short, so it has no timed chapters yet. Press “Rebuild video” to get a description with correct chapter times.
Cả bốn phần cũng được lưu trong file tieu-de-youtube.txt cạnh video.|All four parts are also saved in tieu-de-youtube.txt next to the video.
Hình ảnh do AI tạo: khi đăng hãy bật mục «nội dung bị thay đổi hoặc tổng hợp».|AI-generated images: when you upload, turn on the “altered or synthetic content” setting.
Tiêu đề đăng YouTube (đúng như trên video)|YouTube title (exactly as on the video)
Sao chép tiêu đề|Copy title
Đã sao chép tiêu đề.|Title copied.
Mô tả (có chương) và thẻ|Description (with chapters) and tags
Sao chép mô tả|Copy description
Đã sao chép mô tả.|Description copied.
Sao chép thẻ|Copy tags
Đã sao chép thẻ.|Tags copied.
Không sao chép được. Hãy chọn chữ rồi nhấn Ctrl+C.|Could not copy. Select the text and press Ctrl+C.
Cả ba đã được lưu trong file tieu-de-youtube.txt cạnh video (bấm «Mở video» để tới thư mục).|All three are also saved in tieu-de-youtube.txt next to the video (press “Open video” to go to the folder).
Video này dựng bằng bản cũ nên chưa có mô tả và chương. Bấm «Dựng lại» để có đủ.|This video was built with an older version, so it has no description or chapters yet. Press “Build again” to get them.
Khung hình đang vẽ|Frame being drawn
Lưu thumbnail…|Save thumbnail…
Mở thumbnail|Open thumbnail
Muse tự chọn|Let Muse choose
Muse tự chọn chủ đề và làm video|Let Muse choose the topic and make the video
Muse tự chọn chủ đề|Muse chooses the topic
Chọn một nhóm chủ đề: Muse tự chọn đề tài hay trong nhóm đó. Mỗi hình là một khung video mẫu của nhóm. Bấm lại để bỏ chọn.|Pick a topic group: Muse chooses a good subject inside it. Each picture is a sample frame of that group’s video. Click again to deselect.
Gợi ý đề tài|Subject suggestions
Chọn một nhóm ở trên để xem các đề tài gợi ý, hoặc gõ đề tài của riêng bạn.|Pick a group above to see suggested subjects, or type your own.
Làm video bản đồ|Make map video
Lịch sử một nước|History of a country
Cả hành trình của một quốc gia, từ thuở lập quốc đến nay|A whole nation’s journey, from its founding to today
Muse chọn đề tài «Lịch sử một nước» và làm video|Let Muse choose a «History of a country» subject and make the video
Đề tài gợi ý của nhóm «Lịch sử một nước» (bấm để chọn):|Suggested subjects in «History of a country» (click to choose):
Muse tự chọn: Lịch sử một nước|Muse chooses: History of a country
Đế chế|Empire
Từ lúc hình thành, lên đỉnh cao đến lúc suy tàn|From its rise to its peak and its fall
Muse chọn đề tài «Đế chế» và làm video|Let Muse choose a «Empire» subject and make the video
Đề tài gợi ý của nhóm «Đế chế» (bấm để chọn):|Suggested subjects in «Empire» (click to choose):
Muse tự chọn: Đế chế|Muse chooses: Empire
Triều đại|Dynasty
Các triều đại thay nhau cai trị một vùng đất|Dynasties succeeding one another over a land
Muse chọn đề tài «Triều đại» và làm video|Let Muse choose a «Dynasty» subject and make the video
Đề tài gợi ý của nhóm «Triều đại» (bấm để chọn):|Suggested subjects in «Dynasty» (click to choose):
Muse tự chọn: Triều đại|Muse chooses: Dynasty
Chiến tranh|War
Những cuộc chiến làm biên giới đổi hình|Wars that redrew the borders
Muse chọn đề tài «Chiến tranh» và làm video|Let Muse choose a «War» subject and make the video
Đề tài gợi ý của nhóm «Chiến tranh» (bấm để chọn):|Suggested subjects in «War» (click to choose):
Muse tự chọn: Chiến tranh|Muse chooses: War
Khám phá và thương mại|Exploration and trade
Hải trình, đường tơ lụa, những chuyến đi vòng quanh thế giới|Sea voyages, the Silk Road, journeys around the world
Muse chọn đề tài «Khám phá và thương mại» và làm video|Let Muse choose a «Exploration and trade» subject and make the video
Đề tài gợi ý của nhóm «Khám phá và thương mại» (bấm để chọn):|Suggested subjects in «Exploration and trade» (click to choose):
Muse tự chọn: Khám phá và thương mại|Muse chooses: Exploration and trade
Văn minh cổ đại|Ancient civilization
Ai Cập, Hy Lạp, La Mã, Lưỡng Hà…|Egypt, Greece, Rome, Mesopotamia…
Muse chọn đề tài «Văn minh cổ đại» và làm video|Let Muse choose a «Ancient civilization» subject and make the video
Đề tài gợi ý của nhóm «Văn minh cổ đại» (bấm để chọn):|Suggested subjects in «Ancient civilization» (click to choose):
Muse tự chọn: Văn minh cổ đại|Muse chooses: Ancient civilization
Độc lập và cách mạng|Independence and revolution
Giành độc lập, lật đổ chế độ cũ, lập quốc gia mới|Winning independence, overthrowing the old order, founding a new state
Muse chọn đề tài «Độc lập và cách mạng» và làm video|Let Muse choose a «Independence and revolution» subject and make the video
Đề tài gợi ý của nhóm «Độc lập và cách mạng» (bấm để chọn):|Suggested subjects in «Independence and revolution» (click to choose):
Muse tự chọn: Độc lập và cách mạng|Muse chooses: Independence and revolution
🎲 Muse tự chọn|🎲 Let Muse choose
Gợi ý đề tài|Subject suggestions
Đề tài cụ thể (không bắt buộc; để trống thì Muse tự chọn trong nhóm; gõ tiếng Anh càng rõ càng tốt)|Specific subject (optional; leave empty and Muse chooses inside the group; the clearer the English you type, the better)
Để trống: Muse tự chọn. Hoặc gõ, hoặc bấm một đề tài gợi ý bên dưới|Leave empty: Muse chooses. Or type one, or click a suggested subject below
Chỉ cần bấm một nút. Chọn một nhóm chủ đề (hoặc gõ đề tài của riêng bạn); Muse chọn đất nước, các giai đoạn và vùng lãnh thổ, soạn lời đọc bằng ngôn ngữ bạn chọn; tool vẽ bản đồ động (đất liền biến đổi theo từng thời kỳ, lá cờ có mặt cắm xuống, đồng hồ năm, địa cầu nhỏ chỉ vùng đang xem), đọc lời, thêm nhạc rồi xuất MP4. Bạn có thể xem và sửa kịch bản trước khi dựng.|Just click one button. Pick a topic group (or type your own subject). Muse chooses the country, the eras and the territories and writes the narration in the language you choose; the tool draws the animated map (land that changes era by era, planted flags with faces, a year counter, a small globe showing the region), reads the narration, adds music and exports an MP4. You can review and edit the script before it is built.
Giọng đọc, nhạc nền, nước làm trung tâm (đã chọn sẵn, không cần chỉnh)|Voice, background music, focus country (already chosen, no need to change)
Chủ đề quá ngắn. Gõ rõ hơn (ví dụ: History of Vietnam, The Mongol Empire) hoặc để trống cho Muse tự chọn.|The topic is too short. Type it more clearly (for example: History of Vietnam, The Mongol Empire) or leave it empty and let Muse choose.
Muse đang chọn chủ đề và soạn kịch bản. Tên video sẽ hiện ở danh sách ngay khi có dàn ý.|Muse is choosing a topic and writing the script. The video name appears in the list as soon as the outline is ready.
Bản đồ lịch sử|History maps
Gõ chủ đề → Muse soạn kịch bản (Anh, Đức, Pháp, Nga) → vẽ bản đồ động, giọng đọc, nhạc → video|Type a topic → Muse writes the script (English, German, French, Russian) → animated map, narration, music → video
Làm video bản đồ mới|Make a new map video
Chỉ cần gõ chủ đề. Muse tự chọn đất nước, các giai đoạn và vùng lãnh thổ, soạn lời đọc bằng ngôn ngữ bạn chọn; tool vẽ bản đồ động (đất liền biến đổi theo từng thời kỳ, lá cờ có mặt cắm xuống, đồng hồ năm, địa cầu nhỏ chỉ vùng đang xem), đọc lời, thêm nhạc rồi xuất MP4. Bạn có thể xem và sửa kịch bản trước khi dựng.|Just type a topic. Muse picks the country, the eras and the territories and writes the narration in the language you choose; the tool draws the animated map (land that changes era by era, planted flags with faces, a year counter, a small globe showing the region), reads the narration, adds music and exports an MP4. You can review and edit the script before it is built.
Chủ đề (tiếng Anh càng rõ càng tốt)|Topic (the clearer the English, the better)
Nước làm trung tâm (không bắt buộc, để trống thì Muse tự chọn)|Focus country (optional; leave empty and Muse chooses)
Giọng đọc|Narration voice
Không nhạc nền (chỉ có giọng đọc).|No background music (narration only).
Âm lượng nhạc|Music volume
Số cửa sổ vẽ|Render windows
Tự động|Auto
Mỗi cửa sổ vẽ một đoạn video cùng lúc. Nhiều cửa sổ hơn chỉ nhanh hơn khi CPU và RAM còn rảnh (mỗi cửa sổ tốn thêm vài trăm MB RAM).|Each window renders a different part of the video at the same time. More windows only help when CPU and RAM are free (each window needs a few hundred MB more RAM).
Tự động làm hết: soạn kịch bản, vẽ, đọc, ghép nhạc, xuất video (bỏ tick để dừng ở kịch bản và xem, sửa trước khi dựng)|Do everything automatically: script, map, narration, music, export (untick to stop at the script and review or edit it before building)
Dữ liệu bản đồ hiện đại (Natural Earth, phạm vi công cộng) nên ranh giới các đế chế xưa chỉ xấp xỉ theo biên giới ngày nay. Hãy đọc kịch bản để chắc các sự kiện, năm tháng đúng trước khi đăng, và bật mục «nội dung bị thay đổi hoặc tổng hợp» trên YouTube.|The map data is modern (Natural Earth, public domain), so the borders of old empires only approximate today's borders. Read the script to make sure events and dates are right before publishing, and switch on YouTube's “altered or synthetic content” disclosure.
Làm video bản đồ|Make map video
Dừng soạn|Stop writing
Dừng dựng|Stop building
Viết tiếp|Continue writing
Dựng video|Build video
Dựng lại|Build again
Xem và sửa kịch bản|View and edit script
Xem thử hình|Preview frame
Kịch bản video bản đồ|Map video script
Lời đọc và chữ trên video bằng ngôn ngữ đã chọn lúc tạo. Vùng lãnh thổ được tô theo tên nước/tỉnh ngày nay: bấm «Xem thử hình» ở từng giai đoạn để xem bản đồ trông thế nào.|Narration and on-screen text use the language chosen when the video was created. Territories are painted by today's country/province names: click “Preview picture” on each era to see how the map looks.
Tiêu đề video|Video title
Dòng phụ|Subtitle
Lưu kịch bản|Save script
Lưu và dựng video|Save and build video
+ Thêm giai đoạn cuối|+ Add a final era
+ Thêm thế lực|+ Add a power
Xóa giai đoạn này|Delete this era
Tên giai đoạn|Era name
Năm (số âm = trước Công nguyên)|Year (negative = BC)
Dân số (người, bỏ trống nếu không rõ)|Population (people, leave empty if unknown)
Câu chữ trên thẻ (ngắn)|Caption on the card (short)
Cảnh minh hoạ có người|Cartoon cutaway scene
Tự chọn theo nội dung|Auto (from the era)
Không chèn cảnh|No scene
Tàu ra khơi|Ship sets sail
Tàu cập bến|Ship arrives
Trận đánh|Battle
Vua và triều đình|King and court
Chợ, thương mại|Market and trade
Xây dựng|Building
Núi lửa, thiên tai|Volcano and disasters
Tiếng hô trên cảnh (ngắn, bỏ trống = mặc định)|Shout on the scene (short, empty = default)
Lời đọc (giọng kể chuyện)|Narration (storytelling tone)
Thế lực hiện trên bản đồ|Powers shown on the map
Tên|Name
Tên nước hoặc tỉnh, cách nhau bằng dấu phẩy|Country or province names, separated by commas
Lá cờ có mặt|Flag with a face
Tên địa danh|Place name
Địa danh|Places
Vui|Happy
Buồn|Sad
Giận|Angry
Mệt|Tired
Tự hào|Proud
Bình thản|Calm
Chưa có kịch bản để sửa.|There is no script to edit yet.
Kịch bản cần ít nhất một giai đoạn.|The script needs at least one era.
Kịch bản đã sẵn sàng|Script ready
Kịch bản chưa xong|Script unfinished
Kịch bản đã sẵn sàng. Bấm «Xem và sửa kịch bản» để kiểm tra, hoặc «Dựng video» để làm luôn.|The script is ready. Click “View and edit script” to review it, or “Build video” to go straight on.
Kịch bản chưa soạn xong. Bấm «Viết tiếp» để Muse làm tiếp từ chỗ dở (phần đã soạn được giữ lại).|The script is not finished. Click “Continue writing” and Muse picks up where it stopped (what is already written is kept).
Muse đang soạn kịch bản. Các bước sau (vẽ bản đồ, giọng đọc, nhạc) tự chạy, bạn không cần bấm gì thêm.|Muse is writing the script. The next steps (map, narration, music) run by themselves; you do not need to click anything else.
Muse đang soạn kịch bản. Xong bạn bấm «Xem và sửa kịch bản» để kiểm tra rồi mới dựng.|Muse is writing the script. When it is done, click “View and edit script” to review it before building.
Muse đang soạn kịch bản…|Muse is writing the script…
Đang soạn kịch bản|Writing the script
Đang dựng video|Building the video
Đang dựng video…|Building the video…
Đang dựng video. Có thể theo dõi tiến độ ở danh sách.|Building the video. You can follow progress in the list.
Đã dựng xong|Build finished
Đã lưu kịch bản.|Script saved.
Đã xóa video khỏi danh sách (file vẫn còn trong thư mục).|Video removed from the list (the files are still in the folder).
Đã xóa video và chuyển file đã lưu vào Thùng rác.|Video removed and its saved files moved to the Recycle Bin.
Xóa video bản đồ này?|Delete this map video?
File được chuyển vào Thùng rác nên khôi phục được. Bản bạn đã bấm «Lưu video…» ra nơi khác không bị đụng tới.|Files go to the Recycle Bin so they can be restored. A copy you saved elsewhere with “Save video…” is not touched.
Nhập chủ đề trước (ví dụ: History of Vietnam, The Mongol Empire).|Enter a topic first (for example: History of Vietnam, The Mongol Empire).
Bản dùng thử và gói 30 ngày không dùng được tab này. Nâng cấp lên gói Năm hoặc Vĩnh viễn rồi nhập key mới.|The trial and the 30-day plan cannot use this tab. Upgrade to the Yearly or Lifetime plan and enter the new key.
Chưa cài giọng Microsoft. Bấm «Cài giọng miễn phí» (cần Python 3.10–3.13 trên máy và có mạng), đợi cài xong rồi làm video.|The Microsoft voice is not installed. Click “Install free voice” (needs Python 3.10–3.13 and an internet connection), wait until it finishes, then make the video.
Lời đọc và chữ trên video luôn bằng tiếng Anh (làm cho khán giả nước ngoài). Cần có mạng lúc đọc.|Narration and on-screen text are always in English (made for a foreign audience). An internet connection is needed while narrating.
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
Mọi tài khoản Muse đang mở đều bận. Chờ xong hoặc mở thêm một tài khoản Muse khác rồi bấm «Viết tiếp».|Every open Muse account is busy. Wait, or open another Muse account and press "Continue writing".
Đang mở Muse (tài khoản 2)…|Opening Muse (account 2)…
Chưa mở được Muse tài khoản 2.|Could not open Muse account 2.
Đang mở Muse (tài khoản 3)…|Opening Muse (account 3)…
Chưa mở được Muse tài khoản 3.|Could not open Muse account 3.
Đang mở Muse (tài khoản 4)…|Opening Muse (account 4)…
Chưa mở được Muse tài khoản 4.|Could not open Muse account 4.
Đang mở Muse (tài khoản 5)…|Opening Muse (account 5)…
Chưa mở được Muse tài khoản 5.|Could not open Muse account 5.
Đang mở Muse (tài khoản 6)…|Opening Muse (account 6)…
Chưa mở được Muse tài khoản 6.|Could not open Muse account 6.
Đang mở Muse (tài khoản 7)…|Opening Muse (account 7)…
Chưa mở được Muse tài khoản 7.|Could not open Muse account 7.
Đang mở Muse (tài khoản 8)…|Opening Muse (account 8)…
Chưa mở được Muse tài khoản 8.|Could not open Muse account 8.
Đang mở Muse (tài khoản 9)…|Opening Muse (account 9)…
Chưa mở được Muse tài khoản 9.|Could not open Muse account 9.
Đang mở Muse (tài khoản 10)…|Opening Muse (account 10)…
Chưa mở được Muse tài khoản 10.|Could not open Muse account 10.
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
Âm lượng giọng đọc|Narration volume
Đặt lại 1× / 100%|Reset to 1× / 100%
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
Kiểu phụ đề (kiểu có sẵn, phông, màu, vị trí)|Subtitle style (presets, font, color, position)
Chọn một kiểu có sẵn, rồi chỉnh thêm nếu muốn.|Pick a ready-made style, then adjust if you like.
Kiểu phụ đề có sẵn|Ready-made subtitle styles
Thêm phông riêng|Add your own font
Chọn file phông (.ttf .otf)|Choose a font file (.ttf .otf)
Độ dày viền|Outline thickness
Hiệu ứng chữ|Text effect
Không|None
Đổ bóng nhẹ|Soft shadow
Phát sáng|Glow
Màu phát sáng|Glow color
Tự kéo thả|Drag to place
Chữ đậm|Bold
Chữ nghiêng|Italic
IN HOA|UPPERCASE
Màu nền|Background color
Độ đậm nền|Background opacity
Kéo chữ trên khung xem trước để đặt vị trí (kéo gần giữa khung thì tự căn giữa). Bấm vào khung rồi dùng phím mũi tên để chỉnh nhẹ.|Drag the text on the preview to place it (near the middle it snaps to center). Click the preview and use the arrow keys to nudge.
Xem trước phụ đề, kéo để đặt vị trí|Subtitle preview, drag to place
Đặt lại vị trí (dưới)|Reset position (bottom)
Cổ điển|Classic
Vàng nổi bật|Bold yellow
Truyền hình|TV
Hộp đen|Black box
Bản tin|News
Truyện cổ tích|Fairy tale
Hoạt hình|Cartoon
Neon|Neon
Tối giản|Minimal
Phổ biến|Popular
Chữ đậm, làm tiêu đề|Bold, for titles
Có chân (sách, điện ảnh)|Serif (books, film)
Viết tay, trang trí|Handwriting, decorative
Chữ đơn cách|Monospace
Phông của bạn|Your fonts
Âm thanh & xuất video|Audio & video export
Tiếng động gốc của clip|Original clip sound effects
Tắt|Off
Nhỏ (thấp hơn giọng kể 20 dB)|Low (20 dB below the narration)
Trung bình (thấp hơn giọng kể 12 dB)|Medium (12 dB below the narration)
Tên video|Video name
Tên truyện|Story name
Truyện|Story
Tự edit: cảnh nào lời đọc ngắn hơn clip thì cắt phần thừa; lời dài hơn clip thì giữ khung cuối cho đọc hết. Prompt đã dặn Muse tạo video im lặng, không âm thanh (nhân vật vẫn há miệng, cười, mấp máy trên hình); giọng đọc do app thêm.|Auto edit: if a scene's narration is shorter than its clip, the extra footage is cut; if it is longer, the last frame is held so it can finish. Prompts tell Muse to make the video silent with no audio (characters still open their mouths, laugh and mouth words on screen); the narration is added by the app.
Xuất MP4|Export MP4
Gắn khóa ảnh nhân vật|Lock to character image
Các cảnh này có ảnh nhân vật nhưng prompt chưa nhắc tới ảnh. Thêm một dòng khóa hình dạng để Muse bám đúng kiểu vẽ của ảnh.|These scenes have a character image but the prompt does not mention it. Adding a shape-lock line makes Muse follow the drawing style of the image.
Các cảnh chưa xong đã có câu khóa rồi.|The unfinished scenes already have the lock line.
Không có cảnh nào cần gắn thêm.|No scenes needed the lock.
Clip đã xong hết, chưa ghép thành video hoàn chỉnh|All clips are done, but the final video has not been assembled yet
Đang ghép video hoàn chỉnh…|Assembling the final video…
Đang tạo clip kể chuyện…|Creating story clips…
Hàng đợi đang dừng|Queue stopped
✓ Video hoàn chỉnh đã sẵn sàng|✓ The final video is ready
Ghép video chưa xong|The video was not finished
Hoàn thành video|Finish the video
Clip còn nguyên, không phải tạo lại. Giọng đã đọc xong được dùng lại.|The clips are safe, nothing needs to be regenerated. Voices that were already read are reused.
Nếu app chưa tự ghép, mở mục «Giọng, phụ đề & xuất MP4» rồi bấm «Xuất MP4».|If the app has not assembled it yet, open “Voice, subtitles & MP4 export” and press “Export MP4”.
Mở mục «Giọng, phụ đề & xuất MP4» để xem video.|Open “Voice, subtitles & MP4 export” to watch the video.
Mở video|Open video
Lưu video…|Save video…
Bỏ khỏi video|Leave out of video
Đưa lại vào video|Put back in video
Tải video|Save video
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
⚠ Prompt có cảnh người cầm / ngắm / bắn súng hoặc đạn: Muse thường từ chối («blocked by policy») và mỗi lần thử đều tốn lượt. Nên thay bằng bản vẽ kỹ thuật, sơ đồ so sánh hoặc người dẫn chuyện giới thiệu bằng lời.|⚠ The prompt shows someone holding, aiming or firing a gun or ammunition: Muse usually refuses (“blocked by policy”) and every attempt costs a credit. Use a technical drawing, a side-by-side diagram or a narrator explaining it instead.
⚠ Prompt có người giữ chức vụ chính trị (tổng thống, thủ tướng, vua…): chức danh gắn với một nước hay mốc thời gian là chỉ đích danh một người thật, Muse thường từ chối («blocked by policy») dù không ghi tên, và mỗi lần thử đều tốn lượt. Nên bỏ người đó khỏi hình: dùng bàn làm việc trống, tập hồ sơ, micro trên bục, đài phát thanh, lá cờ hoặc đám đông nhìn từ phía sau, để nhân vật chuẩn phản ứng bằng nét mặt.|⚠ The prompt shows a political office holder (president, prime minister, king…): a title tied to a country or a date points at one real person, so Muse usually refuses (“blocked by policy”) even without a name, and every attempt costs a credit. Leave that person out of the picture: use an empty desk, a folder of papers, a microphone on a podium, an old radio, a flag or a crowd seen from behind, and let the reference character react with their face.
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
Đang bấm chuột phải → Tải xuống|Right-clicking the image → Download
Menu Tải xuống chưa dùng được · đọc ảnh đang hiện trong chat|Download menu not usable · Reading the image shown in the chat
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
Dừng cảnh này|Stop this scene
Dừng cảnh này (chưa chạy)? Cảnh thành «Đã dừng» để bạn sửa prompt rồi bấm «Gửi lại prompt» tạo lại sau. Các cảnh khác vẫn chạy tiếp.|Stop this scene (not started yet)? It becomes “Stopped” so you can edit its prompt and press “Resend prompt” to regenerate it later. Other scenes keep running.
Đã dừng cảnh này. Sửa prompt (nếu cần) rồi bấm «Gửi lại prompt» để tạo lại.|Scene stopped. Edit the prompt if needed, then press “Resend prompt” to regenerate it.
Tạo lại ngay|Restart now
Thử TK khác|Try another account
Bấm để nhảy tới ô đang làm|Click to jump to the running scenes
Bấm để nhảy tới thẻ cảnh này.|Click to jump to this scene's card.
Đang làm:|Processing:
Sang TK: tự chọn|Move to: any account
Tài khoản sẽ chạy cảnh này|Account that will run this scene
Chọn tài khoản sẽ chạy cảnh này. Để mặc định thì tool tự chọn / giữ tài khoản cũ.|Choose the account that will run this scene. Leave the default to let the tool choose / keep the old account.
Tạo lại cảnh này; giữ video cũ. Chọn TK ở ô bên cạnh nếu muốn chạy bằng tài khoản khác.|Regenerate this scene; the old video is kept. Pick an account in the box next to it to run it on another account.
Dừng chờ ở tài khoản này và gửi cảnh sang tài khoản khác (khi tài khoản hết lượt tạo video). Chọn TK ở ô bên cạnh, hoặc để «tự chọn».|Stop waiting on this account and send the scene to another account (when this account is out of video generations). Pick an account in the box next to it, or leave “any”.
Bấm dừng cảnh này trong Muse rồi gửi lại với prompt mới ngay? Nếu Muse đang tạo dở thì phần đó bị bỏ.|Stop this scene in Muse and resend it with the new prompt now? Anything Muse is still generating for it is discarded.
Gửi lại prompt mới? Nếu prompt cũ đã tạo xong trong Muse thì có thể ra video trùng.|Resend the new prompt? If the old prompt already finished in Muse, you may get a duplicate video.
✎ Sửa prompt|✎ Edit prompt
Sửa prompt của cảnh này, rồi chỉ lưu hoặc lưu và gửi lại.|Edit this scene's prompt, then just save it or save and resend.
Lưu|Save
Lưu và gửi lại ngay|Save and resend now
Hủy|Cancel
Prompt gửi Muse|Prompt sent to Muse
Cảnh đang chạy với prompt cũ. Lưu prompt mới sẽ dừng cảnh trong Muse rồi gửi lại ngay.|The scene is running with the old prompt. Saving a new one stops it in Muse and resends it right away.
Cảnh chưa chạy: lưu thì lần chạy tới gửi prompt mới.|The scene has not run yet: if you save, the next run sends the new prompt.
Sửa xong lưu để giữ, hoặc lưu và gửi lại (cảnh về hàng chờ, bấm Tiếp tục để chạy).|When you finish editing, save to keep it, or save and resend (the scene goes back to the queue; press Continue to run it).
Prompt không được để trống.|The prompt cannot be empty.
Đã sửa prompt, cảnh sẽ được gửi lại ngay.|Prompt updated; the scene will be resent right away.
Đã sửa prompt. Cảnh đã về hàng chờ: bấm Tiếp tục để chạy.|Prompt updated. The scene is back in the queue: press Continue to run it.
Đã lưu prompt mới. Cảnh sẽ gửi bản này khi chạy.|New prompt saved. The scene will send this version when it runs.
Đã sửa prompt. Bấm «Gửi lại prompt» để chạy lại.|Prompt updated. Press “Resubmit prompt” to run it again.
Tải video lên|Upload video
Tự thêm video cho cảnh này (đã tạo ở nơi khác): chọn file MP4 / WebM, tool đặt tên theo số cảnh và coi cảnh là đã xong.|Add a video for this scene yourself (made elsewhere): pick an MP4 / WebM file; the tool names it by scene number and marks the scene done.
Cảnh này đang chờ Muse. Chọn video sẽ dừng cảnh ở Muse và dùng video bạn chọn thay thế. Tiếp tục?|This scene is waiting on Muse. Choosing a video stops it in Muse and uses your file instead. Continue?
Đã thêm video thủ công|Video added manually
Dừng chờ ở tài khoản này và gửi cảnh sang tài khoản khác (khi tài khoản hết lượt tạo video).|Stop waiting on this account and send the scene to another account (when this account is out of video credits).
Bấm dừng cảnh này ở tài khoản hiện tại rồi gửi lại prompt sang một tài khoản khác? Dùng khi tài khoản này đã hết lượt tạo video. Nếu Muse đang tạo dở thì phần đó bị bỏ.|Stop this scene on the current account and resend its prompt to a different account? Use this when the account is out of video credits. Anything Muse is still generating for it is discarded.
Không chờ cảnh này nữa; tab khác vẫn chạy tiếp.|Stop waiting for this scene; other tabs keep running.
Dừng chờ và gửi lại prompt của cảnh này ngay.|Stop waiting and resend this scene's prompt now.
Dừng chờ cảnh này? Các cảnh khác vẫn chạy tiếp. Cảnh này thành «Bị gián đoạn»: sau đó có thể «Tìm / tải video đã tạo» hoặc «Gửi lại prompt».|Stop waiting for this scene? Other scenes keep running. It becomes “Interrupted”: you can then use “Find / download generated video” or “Resubmit prompt”.
Bấm dừng cảnh này trong Muse rồi gửi lại prompt ngay? Nếu Muse đang tạo dở thì phần đó bị bỏ.|Stop this scene in Muse and resend its prompt now? Anything Muse is still generating for it is discarded.
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
Dừng và xóa toàn bộ danh sách clip kể chuyện? Thư mục KeChuyen của các truyện này (clip, ảnh, video ghép) cũng được chuyển vào Thùng rác. Tác vụ đã gửi có thể còn chạy trên Muse.|Stop and clear all story clips? The KeChuyen folders of these stories (clips, images, final video) are also moved to the Recycle Bin. Submitted tasks may still be running in Muse.
Xóa cảnh này? Clip đã tải của cảnh cũng được chuyển vào Thùng rác.|Delete this scene? Its downloaded clip is also moved to the Recycle Bin.
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
Mẹo vặt|Tips
Nơi làm và đồ vật cố định|Fixed setting and objects
1. Mẹo vặt (Muse viết, bạn sửa được)|1. Tip (written by Muse, editable)
Đã có sẵn mẹo? Dán vào đây rồi bấm «Phân tích bằng Muse». Chưa có thì nhập tiêu đề ở trên: Muse viết mẹo theo từng bước và hiện ở đây để bạn sửa. Giọng đọc sẽ đọc đúng nguyên văn mẹo này.|Already have a tip? Paste it here, then click “Analyze with Muse”. If not, enter a title above: Muse writes the tip step by step and shows it here for you to edit. The voice reads this tip word for word.
Nhập tiêu đề mẹo rồi bấm «Muse viết mẹo và chia cảnh» (cần đã đăng nhập Muse tài khoản 1). Muse viết mẹo theo từng bước và chia cảnh; bạn xem lại rồi bấm «Tạo ảnh + clip»: mỗi bước một ảnh chụp thật, rồi ảnh đó chuyển động thành clip.|Enter a tip title, then click “Muse writes the tip and splits scenes” (you need to be signed in to Muse account 1). Muse writes the tip step by step and splits the scenes; review them, then click “Create images + clips”: each step gets one photorealistic picture, and that picture becomes a moving clip.
Chỉ cần nhập tiêu đề: Muse viết mẹo theo từng bước và chia cảnh. Rồi mỗi bước tạo một ảnh chụp thật và cho ảnh đó chuyển động.|Just enter a title: Muse writes the tip step by step and splits it into scenes. Then each step gets a photorealistic picture, and that picture is animated.
Bạn muốn hướng dẫn mẹo gì?|What tip do you want to show?
Ví dụ: Mẹo khử mùi tủ lạnh bằng baking soda|e.g. How to deodorize a fridge with baking soda
Mỗi ảnh chuyển động|Each picture moves for
Ngôn ngữ lời đọc|Narration language
Chuyển động clip|Clip motion
Nhẹ, ổn định (ít méo hình)|Gentle and steady (less distortion)
Theo từng thao tác (dễ méo)|Follow each action (more distortion)
Prompt gửi Muse|Prompts sent to Muse
Tiếng Anh (tối ưu cho Muse)|English (optimized for Muse)
6 giây|6 seconds
8 giây|8 seconds
10 giây|10 seconds
Muse viết mẹo và chia cảnh|Muse writes the tip and splits scenes
Muse đang viết mẹo…|Muse is writing the tip…
Muse đang chia cảnh…|Muse is splitting scenes…
Nhập tiêu đề mẹo trước.|Enter the tip title first.
Viết mới sẽ thay mẹo đang có trong ô và xóa các cảnh đã chia. Tiếp tục?|Writing a new tip replaces the tip in the box and clears the split scenes. Continue?
Muse đã viết xong mẹo. Đang nhờ Muse chia cảnh…|Muse finished writing the tip. Asking Muse to split the scenes…
Nhập tiêu đề mẹo trước khi nhờ Muse viết.|Enter the tip title before asking Muse to write.
Dừng hàng đợi và các thao tác trình duyệt trước khi nhờ Muse viết mẹo.|Stop the queue and browser actions before asking Muse to write the tip.
Muse chưa viết mẹo. Bấm «Muse viết mẹo» lại.|Muse did not write the tip. Click “Muse writes the tip” again.
Mặc định là ảnh chụp thật. Ví dụ: ảnh chụp thật, bếp trắng, ánh sáng cửa sổ|Photorealistic by default. e.g. photorealistic, white kitchen, window light
Cây trồng phát triển|Growing plants
1. Bài trồng cây (Muse viết, bạn sửa được)|1. Plant guide (written by Muse, editable)
Đã có sẵn bài? Dán vào đây rồi bấm «Phân tích bằng Muse». Chưa có thì nhập loại cây ở trên: Muse viết bài trồng cây theo từng giai đoạn và hiện ở đây để bạn sửa. Giọng đọc sẽ đọc đúng nguyên văn bài này.|Already have a text? Paste it here, then click “Analyze with Muse”. If not, enter a plant above: Muse writes the growing guide stage by stage and shows it here for you to edit. The voice reads this text word for word.
Mặc định là ảnh chụp thật. Ví dụ: ảnh chụp thật, bệ cửa sổ có nắng, chậu đất nung|Photorealistic by default. e.g. photorealistic, sunny windowsill, terracotta pot
Chỉ cần nhập loại cây hoặc tiêu đề: Muse viết bài trồng cây từ chuẩn bị chậu, gieo hạt đến ra quả rồi chia cảnh. Mỗi giai đoạn tạo một ảnh chụp thật của chậu cây và cho ảnh đó chuyển động nhẹ.|Just enter a plant or a title: Muse writes a growing guide from preparing the pot and sowing seeds to fruit, then splits it into scenes. Each stage gets a photorealistic picture of the potted plant, and that picture is gently animated.
Bạn muốn trồng cây gì?|What do you want to grow?
Ví dụ: Trồng cà chua trong chậu từ hạt đến khi ra quả|e.g. Growing tomatoes in a pot from seed to fruit
Nhập tên cây (tiếng Việt hay tiếng Anh) rồi bấm «Làm tự động» (cần đã đăng nhập Muse tài khoản 1): Muse viết bài, chia cảnh, tạo ảnh + clip rồi tự xuất MP4. Bỏ tick «Tự động làm hết» nếu muốn xem lại từng bước (bấm «Muse viết bài và chia cảnh», xem lại, rồi «Tạo ảnh + clip»).|Enter a plant name (English or Vietnamese), then click “Run automatically” (you need to be signed in to Muse account 1): Muse writes the text, splits the scenes, creates the pictures + clips and exports the MP4 by itself. Untick “Do everything automatically” if you want to review each step (click “Muse writes the guide and splits scenes”, review, then “Create images + clips”).
Tự động làm hết: viết bài, tạo ảnh + clip rồi xuất MP4 (không cần bấm thêm)|Do everything automatically: write the text, create pictures + clips, then export the MP4 (no more clicks)
▶ Làm tự động: viết, vẽ, xuất MP4|▶ Run automatically: write, draw, export MP4
Muse đã chia xong cảnh. Đang thêm vào hàng đợi và tạo ảnh + clip; xong hết sẽ tự xuất MP4…|Muse has split the scenes. Adding them to the queue and creating pictures + clips; the MP4 is exported automatically when all are done…
Tự động dừng vì bạn đã đổi tab. Quay lại «Cây trồng phát triển» rồi bấm «Tạo ảnh + clip».|Automatic mode stopped because you changed tabs. Go back to “Growing plants” and click “Create images + clips”.
Xong hết clip. Đang tự xuất MP4…|All clips are done. Exporting the MP4 automatically…
Xong hết clip. Đang tự đọc giọng, edit khớp và xuất MP4…|All clips are done. Narrating, editing and exporting the MP4 automatically…
Tự đọc giọng, edit khớp và xuất MP4 khi tạo xong hết clip|Auto narrate, edit to match and export MP4 when all clips are done
Đang đọc giọng…|Narrating…
Đang đo độ dài lời đọc|Measuring narration length
Đang edit khớp lời đọc với clip…|Editing narration to match the clips…
Đang nối thành MP4|Joining into the MP4
Giọng Việt có sẵn VieNeu (miễn phí, offline)|Built-in Vietnamese voices (VieNeu, free, offline)
↻ Tải lại danh sách giọng|↻ Reload voice list
Đang tải danh sách…|Loading the list…
Đã tải danh sách giọng Microsoft.|Microsoft voice list loaded.
Danh sách tải từ Microsoft.|The list was loaded from Microsoft.
Đang dùng danh sách có sẵn; bấm «Tải lại danh sách giọng» khi có mạng để có đủ giọng.|Using the built-in list; click “Reload voice list” when online to get every voice.
Chưa cài giọng VieNeu. Bấm «Cài giọng miễn phí» (cần Python 3.10–3.13 và mạng; lần đầu tải mô hình nên lâu).|VieNeu voices are not installed. Click “Install free voices” (needs Python 3.10–3.13 and internet; the first run downloads the model, so it takes a while).
25 giọng Việt có sẵn của VieNeu: miễn phí, chạy offline trên máy, không cần file mẫu. Chỉ dành cho tiếng Việt (ngôn ngữ khác dùng giọng Microsoft). Lần nghe/xuất đầu tiên phải tải mô hình nên lâu.|25 built-in Vietnamese VieNeu voices: free, run offline on this computer, no sample file needed. Vietnamese only (use Microsoft voices for other languages). The first listen/export downloads the model, so it takes a while.
Chưa cài giọng VieNeu. Bấm «Cài giọng miễn phí» trước.|VieNeu voices are not installed. Click “Install free voices” first.
Chọn một giọng Việt có sẵn trong danh sách.|Choose one of the built-in Vietnamese voices in the list.
Đang chạy tự động…|Running automatically…
▶ Chạy tiếp: chia cảnh|▶ Continue: split scenes
▶ Chạy tiếp: xuất MP4|▶ Continue: export MP4
Làm lại từ đầu|Start over
Làm lại từ đầu sẽ viết bài mới và thêm một lượt mới vào hàng đợi (tốn thêm lượt Muse). Lượt đang làm dở vẫn nằm trong hàng đợi. Tiếp tục?|Starting over writes a new guide and adds a new run to the queue (uses more Muse turns). The unfinished run stays in the queue. Continue?
Dừng ở bước chia cảnh. Bài đã viết được giữ lại: bấm «Chạy tiếp» để chia cảnh (không viết lại bài).|Stopped at the scene-splitting step. The written guide is kept: click “Continue” to split scenes (it is not rewritten).
Muse chia cảnh dừng giữa chừng. Bấm «Chạy tiếp» để chia tiếp từ chỗ dừng.|Muse stopped splitting scenes midway. Click “Continue” to carry on from where it stopped.
Chưa thêm được vào hàng đợi. Bấm «Chạy tiếp» để thử lại (không chia lại cảnh).|Could not add to the queue. Click “Continue” to try again (scenes are not split again).
Các cảnh đã vào hàng đợi nhưng chưa chạy được. Bấm «Chạy tiếp» để chạy (không thêm lại).|The scenes are in the queue but did not start. Click “Continue” to run them (nothing is added again).
Chưa chạy tiếp được hàng đợi. Bấm «Chạy tiếp» để thử lại.|Could not resume the queue. Click “Continue” to try again.
Xuất MP4 chưa xong. Bấm «Chạy tiếp» để xuất lại (không tạo lại clip).|MP4 export did not finish. Click “Continue” to export again (clips are not made again).
Dừng vì bạn đã đổi tab. Quay lại tab này rồi bấm «Chạy tiếp».|Stopped because you changed tabs. Come back to this tab and click “Continue”.
Tự động dừng vì bạn đã đổi tab. Quay lại «Cây trồng phát triển» rồi bấm «Chạy tiếp».|Automatic run stopped because you changed tabs. Go back to “Growing plants” and click “Continue”.
Hàng đợi đang dừng hoặc đang ghép. Chờ xong rồi bấm «Chạy tiếp».|The queue is stopping or merging. Wait until it finishes, then click “Continue”.
Hàng đợi đang chạy. Dừng hàng đợi hiện tại trước khi tạo lượt mới.|The queue is running. Stop the current queue before creating a new run.
Chưa chọn thư mục lưu video.|No video folder chosen yet.
Đang xuất MP4…|Exporting MP4…
Xong: MP4 đã xuất|Done: MP4 exported
Dừng ở bước viết bài. Bấm «Làm tự động» để chạy lại.|Stopped at the writing step. Click “Run automatically” to run it again.
Dừng ở bước chia cảnh. Bấm «Làm tự động» để chạy lại.|Stopped at the scene-splitting step. Click “Run automatically” to run it again.
Dừng vì bạn đã đổi tab. Quay lại tab này rồi bấm «Tạo ảnh + clip».|Stopped because you changed tabs. Come back to this tab and click “Create images + clips”.
Muse chia cảnh dừng giữa chừng. Bỏ tick «Tự động làm hết» rồi bấm «Phân tích tiếp».|Muse stopped splitting scenes midway. Untick “Do everything automatically” and click “Continue analysis”.
Chưa thêm được vào hàng đợi. Xem thông báo rồi bấm «Làm tự động» lại.|Could not add to the queue. Read the message, then click “Run automatically” again.
Xuất MP4 chưa xong. Xem thông báo rồi bấm Xuất MP4.|MP4 export did not finish. Read the message, then click Export MP4.
Muse đang viết bài…|Muse is writing the guide…
Muse viết bài và chia cảnh|Muse writes the guide and splits scenes
Nhập loại cây hoặc tiêu đề trước.|Enter the plant or title first.
Nhập loại cây hoặc tiêu đề trước khi nhờ Muse viết.|Enter the plant or title before asking Muse to write.
Viết mới sẽ thay bài đang có trong ô và xóa các cảnh đã chia. Tiếp tục?|Writing a new guide replaces the text in the box and clears the split scenes. Continue?
Muse đã viết xong bài. Đang nhờ Muse chia cảnh…|Muse finished writing the guide. Asking Muse to split the scenes…
Lịch sử minh họa|Illustrated history
1. Bài lịch sử (Muse viết, bạn sửa được)|1. History text (written by Muse, editable)
Đã có sẵn bài? Dán vào đây rồi bấm «Phân tích bằng Muse». Chưa có thì nhập chủ đề ở trên: Muse viết bài lịch sử và hiện ở đây để bạn sửa. Giọng đọc sẽ đọc đúng nguyên văn bài này.|Already have a text? Paste it here, then click “Analyze with Muse”. If not, enter a topic above: Muse writes the history text and shows it here for you to edit. The voice reads this text word for word.
Mặc định là tranh hoạt hình phẳng. Ví dụ: tranh hoạt hình phẳng, màu ấm, nét viền rõ|Flat cartoon illustration by default. e.g. flat cartoon illustration, warm colors, clear outlines
Kiểu hình|Look
Tranh hoạt hình phẳng|Flat cartoon illustration
Ảnh phim tư liệu chân thực (màu phục chế)|Realistic archival-film look (restored colour)
Mặc định là ảnh phim tư liệu chân thực, màu phục chế. Ví dụ: ảnh phim tư liệu, màu phục chế nhẹ, hạt phim mịn|Realistic archival-film look with restored colour by default. e.g. archival film still, gently restored colour, fine film grain
Chỉ cần nhập chủ đề lịch sử: Muse viết bài và chia cảnh (chọn độ dài đến 180 phút). Đã có sẵn bài, dài bao nhiêu cũng được, thì dán vào ô bên dưới: số cảnh tự theo độ dài bài. Mỗi cảnh tạo một ảnh phim tư liệu chân thực (màu phục chế) rồi cho ảnh chuyển động nhẹ. Người trong ảnh là người vô danh đúng thời kỳ, đây là cảnh dựng lại để minh họa, không phải ảnh gốc.|Just enter a history topic: Muse writes the text and splits scenes (choose up to 180 minutes). If you already have a text, of any length, paste it in the box below: the number of scenes follows the text length. Each scene creates a realistic archival-film picture (restored colour) and then gives it gentle motion. The people shown are anonymous and period-correct; these are re-enactments for illustration, not original photographs.
Chỉ cần nhập chủ đề lịch sử: Muse viết bài và chia cảnh (chọn độ dài đến 180 phút). Đã có sẵn bài, dài bao nhiêu cũng được, thì dán vào ô bên dưới: số cảnh tự theo độ dài bài. Mỗi cảnh tạo một tranh hoạt hình rồi cho tranh chuyển động nhẹ.|Just enter a history topic: Muse writes the text and splits it into scenes (choose a length of up to 180 minutes). If you already have a text, of any length, paste it in the box below: the number of scenes follows the length of your text. Each scene gets a cartoon illustration, and the illustration is gently animated.
Bạn muốn kể chủ đề lịch sử gì?|Which history topic do you want to tell?
Ví dụ: Lịch sử Việt Nam từ thời dựng nước đến nay|e.g. The history of Vietnam from its founding to today
Nhân vật dẫn chuyện (không bắt buộc)|Guide character (optional)
Ví dụ: cô gái tóc đen búi, áo dài cam, nét mặt dịu dàng. Nhân vật này xuất hiện lại ở nhiều cảnh.|e.g. a girl with her black hair in a bun, an orange ao dai, a gentle face. This character appears again in many scenes.
Chọn ảnh nhân vật dẫn chuyện|Choose guide character image
Dán hoặc kéo ảnh nhân vật dẫn chuyện vào đây (không bắt buộc). Ảnh gắn vào mọi ảnh minh họa để nhân vật giữ nguyên.|Paste or drag the guide character image here (optional). It is attached to every illustration so the character stays the same.
Nhập chủ đề lịch sử rồi bấm «Muse viết bài lịch sử và chia cảnh» (cần đã đăng nhập Muse tài khoản 1), hoặc dán sẵn bài vào ô rồi bấm «Phân tích bằng Muse». Xem lại cảnh rồi bấm «Tạo ảnh + clip»: mỗi cảnh một tranh hoạt hình cho chuyển động nhẹ.|Enter a history topic, then click “Muse writes the history text and splits scenes” (you need to be signed in to Muse account 1), or paste your own text and click “Analyze with Muse”. Review the scenes, then click “Create images + clips”: each scene gets one cartoon illustration that moves gently.
Muse viết bài lịch sử và chia cảnh|Muse writes the history text and splits scenes
Nhập chủ đề lịch sử trước.|Enter the history topic first.
Nhập chủ đề lịch sử trước khi nhờ Muse viết.|Enter the history topic before asking Muse to write.
Cảnh nào cũng cần prompt ảnh.|Every scene needs an image prompt.
Phong cách vẽ và nhân vật cố định|Fixed art style and characters
Tùy chọn thêm|More options
Kiểu chữ phụ đề (phông, cỡ, màu, vị trí)|Subtitle style (font, size, color, position)
Prompt ảnh và chuyển động (sửa nếu cần)|Image and motion prompts (edit if needed)
Prompt gửi Muse (sửa nếu cần)|Prompts sent to Muse (edit if needed)
▶ Tạo ảnh + clip|▶ Create images + clips
Prompt ảnh (khung hình đầu)|Image prompt (first frame)
Prompt chuyển động (làm từ ảnh)|Motion prompt (made from the image)
Prompt ảnh gửi Muse|Image prompt sent to Muse
Prompt chuyển động gửi Muse|Motion prompt sent to Muse
Đổi chế độ sẽ xóa các cảnh đang có (mỗi chế độ chia cảnh khác nhau). Tiếp tục?|Switching mode clears the current scenes (each mode splits scenes differently). Continue?
Bước nào cũng cần prompt ảnh.|Every step needs an image prompt.
⚠ Chưa có prompt ảnh: bước này sẽ không tạo được ảnh, nên cũng không có clip.|⚠ No image prompt: this step cannot create its picture, so there will be no clip either.
⚠ Prompt ảnh quá ngắn, dễ ra ảnh sai. Mô tả rõ vật gì, ở đâu, tay đang làm gì.|⚠ Image prompt too short; the picture may come out wrong. Say what object, where, and what the hands are doing.
Dọn nhà · Sinh tồn|House cleanup · Survival
Dọn nhà · Sinh tồn · Phục hồi|House cleanup · Survival · Restoration
Động vật hoang dã|Wildlife
Gõ tên con vật → tự viết kịch bản, quay, thuyết minh và dựng phim|Type an animal name → the tool writes, films, narrates and edits the movie
Làm phim mới|New movie
Chỉ cần gõ tên con vật hoặc chủ đề. Muse tự viết kịch bản phim tài liệu (tập tính thật, săn mồi, bảo vệ con non), tự tạo ảnh và clip nối tiếp liền mạch, tự thuyết minh kể chuyện rồi dựng thành một video hoàn chỉnh.|Just type an animal or a topic. Muse writes a documentary script (real behavior, hunting, protecting the young), creates connected pictures and clips, narrates the story itself and edits everything into one finished video.
Tên con vật hoặc chủ đề|Animal or topic
Khoảnh khắc đặc sắc muốn có (không bắt buộc)|Highlight moments you want (optional)
Ví dụ: chim cổ rắn xòe cánh làm bóng dụ cá; điệu múa tán tỉnh; xây tổ. Chỉ ghi tập tính có thật|For example: an anhinga spreads its wings to shade and lure fish; a courtship dance; nest building. Only real behaviours
Độ dài phim|Movie length
Ngôn ngữ thuyết minh|Narration language
Tiếng thiên nhiên nền|Background nature sound
Vừa (nghe rõ tiếng thú, gió, côn trùng)|Medium (animals, wind and insects clearly audible)
Nhỏ (giọng kể nổi hơn)|Low (the narration stands out more)
Giọng thuyết minh|Narrator voice
Khi đăng lên YouTube hãy bật mục «nội dung bị thay đổi hoặc tổng hợp». Sau khi dựng xong, tool ghi sẵn file ghi chú gồm các sự thật phim đã dùng để bạn tự kiểm tra lại.|When you upload to YouTube, turn on the “altered or synthetic content” disclosure. After the build the tool writes a notes file with the facts the movie used so you can check them again.
Làm phim tự động|Make the movie automatically
Danh sách cảnh phim động vật hoang dã|Wildlife movie scene list
Sẵn sàng cho phim động vật hoang dã mới|Ready for a new wildlife movie
Một ảnh → video liền mạch, tự dựng xong|One photo → seamless video, edited automatically
Cần gói Năm hoặc Vĩnh viễn|Year or Lifetime plan required
Nhập key|Enter key
Chọn chủ đề và số phút. Tool tự chia việc thành các cảnh liền mạch: mỗi cảnh bắt đầu đúng bằng khung cuối của cảnh trước, rồi tự dựng thành một video hoàn chỉnh.|Pick a topic and the number of minutes. The tool splits the work into connected scenes: each scene starts exactly from the last frame of the previous one, then everything is edited into one finished video.
Chủ đề|Topic
Ảnh gốc (không bắt buộc)|Start photo (optional)
Chọn ảnh gốc|Choose photo
Bỏ ảnh|Remove photo
Chưa chọn. Muse sẽ tạo ảnh gốc từ mô tả bên dưới.|None chosen. Muse will create the first image from the description below.
Mô tả nơi chốn (không bắt buộc nếu đã có ảnh)|Describe the place (optional if you chose a photo)
Mỗi cảnh dài|Each scene lasts
Ngang 16:9 (YouTube)|Horizontal 16:9 (YouTube)
Dọc 9:16 (Shorts, TikTok, Reels)|Vertical 9:16 (Shorts, TikTok, Reels)
Có người làm việc trong video|A person works in the video
Mô tả người (giữ y nguyên ở mọi cảnh)|Describe the person (kept identical in every scene)
Ánh sáng và thời tiết (giữ y nguyên ở mọi cảnh)|Light and weather (kept identical in every scene)
Các bước, mỗi dòng một bước (để trống thì tool tự chia)|Steps, one per line (leave empty to let the tool split the work)
Đính kèm thêm ảnh gốc ở mọi cảnh để chống lệch (thử nghiệm: nếu video bị kéo về nguyên trạng thì tắt mục này)|Also attach the start photo to every scene to reduce drift (experimental: turn this off if the video gets pulled back to its original state)
Chọn nhạc nền|Choose music
Bỏ nhạc|Remove music
Không nhạc nền (chỉ tiếng động gốc của clip).|No background music (only the clips’ own sounds).
Tự động làm hết: tạo các cảnh, nối cảnh và dựng video hoàn chỉnh|Do everything automatically: create the scenes, connect them and build the finished video
Tạo và chạy tự động|Create and run automatically
Danh sách cảnh dọn nhà · sinh tồn|House cleanup · survival scene list
Cảnh lưu trong thư mục «DonNha» theo từng video; video hoàn chỉnh được dựng tự động ở cuối.|Scenes are saved in the “DonNha” folder, one per video; the finished video is built automatically at the end.
Sẵn sàng cho video dọn nhà / sinh tồn mới|Ready for a new house cleanup / survival video
Đã kích hoạt key (gói Năm).|License activated (Year plan).
Đã kích hoạt key (gói Vĩnh viễn).|License activated (Lifetime plan).
Tab «Dọn nhà · Sinh tồn» chỉ dùng được với gói Năm hoặc Vĩnh viễn. Bản dùng thử và gói 30 ngày không dùng được tab này. Liên hệ chủ phần mềm để nâng cấp gói rồi nhập key mới.|The “House cleanup · Survival” tab is available with the Year or Lifetime plan only. The trial and the 30-day plan cannot use it. Contact the software owner to upgrade, then enter the new key.
Tab «Dọn nhà · Sinh tồn» cần FFmpeg để nối cảnh và dựng video. Chọn ffmpeg.exe (cùng thư mục ffprobe.exe) ở «Kết nối & cài đặt».|The “House cleanup · Survival” tab needs FFmpeg to connect scenes and build the video. Choose ffmpeg.exe (with ffprobe.exe in the same folder) under “Connection & settings”.
Chỉ dựng video khi mọi cảnh đã xong.|Build the video only when every scene is done.
Không thấy thông tin video này.|Cannot find this video.
Không có cảnh hợp lệ để thêm.|No valid scenes to add.
Ảnh gốc phải là PNG, JPG hoặc WEBP.|The start photo must be PNG, JPG or WEBP.
Không đọc được ảnh gốc (hoặc ảnh lớn hơn 60 MB).|Cannot read the start photo (or it is larger than 60 MB).
Không đọc được tệp nhạc nền.|Cannot read the music file.
Chờ xử lý đầu ra xong trước khi thêm cảnh.|Wait for the output to finish before adding scenes.
Góc quay|Camera
Ngoài xa · trong cố định (khuyên dùng)|Wide outside · fixed inside (recommended)
Cố định một góc (giống nhau nhất)|One fixed angle (most consistent)
Không lộ mặt (quay từ sau lưng hoặc ở xa: Muse ít từ chối hơn, người ít bị lệch giữa các cảnh)|Hide the face (filmed from behind or far away: Muse refuses less, and the person drifts less between scenes)
Tên video (không bắt buộc; để trống thì lấy tên chủ đề)|Video name (optional; leave empty to use the topic name)
Chưa có video hoàn chỉnh để lưu.|There is no finished video to save yet.
Chạy song song|Run in parallel
Người trong video|Person in the video
Nữ trẻ, da trắng, xinh|Young woman, fair skin, pretty
Nam|Man
Giống người trong ảnh gốc|Same person as in the photo
Tạo video mới|Create a new video
Tạo video bằng|Create the video with
Đường dẫn dự án Flow|Flow project address
Mô hình Veo|Veo model
Veo 3.1 Lite (5 tín dụng, rẻ nhất)|Veo 3.1 Lite (5 credits, cheapest)
Veo 3.1 Fast (10 tín dụng)|Veo 3.1 Fast (10 credits)
Veo 3.1 Quality (100 tín dụng)|Veo 3.1 Quality (100 credits)
Clip chạy cùng lúc|Clips at once
Mở Flow để đăng nhập Google|Open Flow to sign in to Google
Xóa?|Remove?
Tác vụ sẽ bị bỏ khỏi danh sách.|The task will be removed from the list.
Xóa tác vụ này?|Remove this task?
Xóa luôn file đã tự lưu về máy của tác vụ này|Also delete the files saved on this computer for this task
Xóa luôn file đã tự lưu về máy|Also delete the files saved on this computer
File được chuyển vào Thùng rác nên khôi phục được. Bản bạn đã lưu ra nơi khác không bị đụng tới.|Files go to the Recycle Bin, so they can be restored. Copies you saved elsewhere are not touched.
Tác vụ đã gửi có thể còn chạy trên Muse.|Submitted tasks may still be running in Muse.
Đã chuyển file đã lưu vào Thùng rác (khôi phục được).|Saved files were moved to the Recycle Bin (they can be restored).
Dừng và xóa toàn bộ danh sách clip kể chuyện?|Stop and clear the whole list of story clips?
Dừng và xóa toàn bộ danh sách ảnh?|Stop and clear the whole list of images?
Dừng và xóa toàn bộ danh sách video Dọn nhà?|Stop and clear the whole list of house cleanup videos?
Dừng và xóa toàn bộ danh sách video Động vật?|Stop and clear the whole list of wildlife videos?
Dừng và xóa toàn bộ danh sách tác vụ?|Stop and clear the whole task list?
Xóa luôn thư mục KeChuyen của các truyện này (clip, ảnh, video ghép) vào Thùng rác|Also move the KeChuyen folders of these stories (clips, images, final video) to the Recycle Bin
Xóa luôn ảnh đã tự lưu về máy của các tác vụ này (vào Thùng rác)|Also move the images saved on this computer for these tasks to the Recycle Bin
Xóa luôn thư mục DonNha của các video này (clip, ảnh, khung cuối, video đã dựng) vào Thùng rác|Also move the DonNha folders of these videos (clips, images, last frames, built video) to the Recycle Bin
Xóa luôn thư mục DongVat của các phim này (clip, ảnh, khung cuối, video đã dựng) vào Thùng rác|Also move the DongVat folders of these films (clips, images, last frames, built video) to the Recycle Bin
Xóa luôn file đã tự lưu về máy của các tác vụ này (vào Thùng rác)|Also move the files saved on this computer for these tasks to the Recycle Bin
Truyện đã tạo|Created stories
Xóa truyện này?|Remove this story?
Đã xuất MP4|MP4 exported
Clip đã xong hết, chưa ghép thành video|All clips are done, the video is not assembled yet
Ghép video chưa xong|Video assembly is not finished
Đã xóa truyện và chuyển file đã lưu vào Thùng rác.|Story removed and its saved files moved to the Recycle Bin.
Đã xóa truyện khỏi danh sách (file vẫn còn trong thư mục).|Story removed from the list (its files are still in the folder).
Chưa có file hoặc thư mục để mở.|There is no file or folder to open yet.
Dừng hàng đợi hoặc chờ ghép xong rồi mới xóa được.|Stop the queue or wait for the assembly to finish before removing.
Clip còn nguyên, không phải tạo lại. Giọng đã đọc xong được dùng lại, chỉ đọc lại cảnh lỗi.|The clips are safe, nothing needs to be regenerated. Voices already read are reused; only failed scenes are read again.

So sánh song song|Side-by-side
Một nhân vật, hai con đường → tự viết kịch bản, quay, lồng tiếng và dựng video 8–10 phút|One character, two paths → writes the script, shoots, narrates and edits an 8–10 minute video
Làm video mới|Make a new video
Màn hình chia đôi: cùng một nhân vật người que 3D, hai cách sống khác nhau (ví dụ lớn lên trong tiếng la mắng và lớn lên được lắng nghe). Muse tự viết kịch bản, tạo một ảnh nền chung cho mỗi mốc rồi hai clip chuyển động (trái và phải) xuất phát từ ảnh đó; tool tự thêm chữ, thanh pin tụt dần, giọng đọc và âm thanh rồi dựng thành video hoàn chỉnh. Để trống chủ đề thì Muse tự chọn.|Split screen: the same 3D stick-figure character living two different ways (for example growing up with yelling versus growing up being listened to). Muse writes the script, makes one shared background image for each moment, then two motion clips (left and right) that start from that image; the tool adds the text, the draining battery meters, the narration and the sound, then builds the finished video. Leave the topic empty and Muse picks one.
Chủ đề (để trống: Muse tự chọn; chọn gợi ý bên dưới hoặc tự gõ)|Topic (leave empty: Muse picks; choose a suggestion below or type your own)
Để trống: Muse tự chọn. Hoặc gõ, hoặc bấm một chủ đề gợi ý bên dưới|Leave empty: Muse picks. Or type one, or click a suggested topic below
Gợi ý chủ đề|Topic suggestions
Chủ đề gợi ý (bấm để chọn). Nhãn hai bên điền sẵn nếu có; để trống thì Muse tự viết đúng ngôn ngữ video:|Suggested topics (click to choose). The two labels are filled in when the topic has them; leave them empty and Muse writes them in the video language:
🎲 Để Muse tự chọn|🎲 Let Muse choose
Nhãn bên trái (không bắt buộc)|Left label (optional)
Nhãn bên phải (không bắt buộc)|Right label (optional)
Ví dụ: RAISED WITH YELLING|For example: RAISED WITH YELLING
Ví dụ: RAISED WITH LISTENING|For example: RAISED WITH LISTENING
Chế độ video|Video mode
Cuộc sống: cùng một nhân vật, hai con đường (gói Năm / Vĩnh viễn)|Daily life: one character, two paths (Year / Lifetime plan)
Khí tài đối đầu: hai khí tài, so sánh thông số (cần key đã mua, từ gói 30 ngày)|Military gear face-off: two machines, specs compared (purchased key required, 30-day plan or above)
Cần key đã mua|Purchased key required
Bản dùng thử 24 giờ không dùng được tab này. Mua key rồi nhập: chế độ «Khí tài đối đầu» dùng được từ gói 30 ngày; chế độ «Cuộc sống» cần gói Năm hoặc Vĩnh viễn.|The 24-hour trial cannot use this tab. Buy a key and enter it: the “Military gear face-off” mode works from the 30-day plan; the “Daily life” mode needs the Year or Lifetime plan.
Khí tài đối đầu: màn hình chia đôi, mỗi mốc so sánh MỘT hạng mục (tốc độ, tầm, hỏa lực, giáp, tàng hình, giá…) giữa hai khí tài (máy bay, xe tăng, tàu, phòng không, UAV). Muse viết kịch bản từ thông tin công khai, tạo ảnh nền có cả hai khí tài đứng cạnh nhau rồi hai clip trình diễn (không cảnh chiến sự); tool thêm chữ, thanh điểm 0–100, giọng đọc và âm thanh rồi dựng video. Điểm chỉ là ước lượng minh họa; hãy kiểm tra lại thông số với nguồn chính thức trước khi đăng. Để trống thì Muse tự chọn cặp khí tài.|Military gear face-off: split screen, and each beat compares ONE category (speed, range, firepower, armour, stealth, price…) between two machines (aircraft, tanks, ships, air defence, UAVs). Muse writes the script from public information, makes a background image with both machines side by side, then two showcase clips (no combat scenes); the tool adds text, a 0–100 score bar, narration and sound, then assembles the video. Scores are only illustrative estimates; check the specs against official sources before publishing. Leave the topic empty and Muse picks the pair.
Ví dụ: F-35|For example: F-35
Ví dụ: SU-57|For example: SU-57
Để trống: Muse tự chọn cặp khí tài. Hoặc gõ (ví dụ «F-35 và Su-57»), hoặc bấm một cặp gợi ý bên dưới|Leave empty: Muse picks a pair of machines. Or type one (for example “F-35 and Su-57”), or click a suggested pair below
Muse tự chọn cặp khí tài và làm video|Let Muse choose the pair of machines and make the video
Gói của bạn dùng được chế độ «Khí tài đối đầu». Chế độ «Cuộc sống» cần gói Năm hoặc Vĩnh viễn.|Your plan can use the “Military gear face-off” mode. The “Daily life” mode needs the Year or Lifetime plan.
Cặp khí tài gợi ý (bấm để chọn; tên hai bên điền sẵn). Để trống thì Muse tự chọn một cặp đáng so sánh:|Suggested pairs (click to choose; both names are filled in). Leave empty and Muse picks a pair worth comparing:
Chế độ «Khí tài đối đầu» chỉ dùng được khi đã mua key (gói 30 ngày trở lên). Bản dùng thử 24 giờ không dùng được chế độ này. Liên hệ chủ phần mềm để mua gói rồi nhập key.|The “Military gear face-off” mode needs a purchased key (30-day plan or above). The 24-hour trial cannot use this mode. Contact the software owner to buy a plan, then enter the key.
Ngôn ngữ video (lời đọc, chữ, giọng)|Video language (narration, text, voice)
Tiếng Việt|Vietnamese
Khung hình|Frame layout
Ngang 16:9, trái – phải|Horizontal 16:9, left – right (YouTube)
Dọc 9:16, trên – dưới (Shorts)|Vertical 9:16, top – bottom (Shorts, TikTok, Reels)
Chưa có giọng cho ngôn ngữ này|No voice for this language yet
Cài lại giọng miễn phí|Reinstall free voices
Giọng Microsoft miễn phí (✓ = đúng ngôn ngữ video). Cần có mạng lúc đọc. Mỗi mốc có một đoạn lời dẫn kể điều xảy ra ở bên trái rồi bên phải.|Free Microsoft voices (✓ = matches the video language). An internet connection is needed while narrating. Each moment has one narration passage telling what happens on the left, then on the right.
Nhạc nền tự động (miễn bản quyền, tool tự tạo), nhỏ đi khi có lời đọc.|Automatic background music (royalty-free, generated by the tool), quieter while the narration speaks.
Dùng nhạc của bạn|Use your own music
Về nhạc tự động|Back to automatic music
Âm lượng giọng đọc|Narration volume
Hình ảnh do AI tạo ra: khi đăng lên YouTube hãy bật mục «nội dung bị thay đổi hoặc tổng hợp». Thanh pin % chỉ là minh họa kể chuyện, không phải số liệu nghiên cứu. Sau khi dựng xong, tool ghi sẵn file ghi chú đăng video trong cùng thư mục.|The images are AI-generated: when you upload to YouTube, turn on the “altered or synthetic content” option. The battery % meters are only a storytelling illustration, not research data. After the build the tool writes a posting-notes file in the same folder.
Làm video tự động|Make the video automatically
Muse đang viết kịch bản. Các bước sau tự chạy, bạn không cần bấm gì thêm.|Muse is writing the script. The next steps run by themselves, you do not need to click anything else.
Muse đang chọn chủ đề và viết kịch bản. Các bước sau tự chạy, bạn không cần bấm gì thêm.|Muse is picking a topic and writing the script. The next steps run by themselves, you do not need to click anything else.
Đang lồng tiếng và dựng video|Narrating and building the video
Đang lồng tiếng và dựng video…|Narrating and building the video…
Đang tạo thumbnail|Creating the thumbnail
Muse đang chọn chủ đề…|Muse is picking a topic…
Đang lập kịch bản|Writing the script
Muse đang viết kịch bản…|Muse is writing the script…
Muse đang lập kịch bản…|Muse is outlining the script…
Muse đang chọn chủ đề và lập kịch bản…|Muse is picking a topic and outlining the script…
Kịch bản chưa viết xong. Bấm «Viết tiếp» để Muse làm tiếp từ chỗ dở (phần đã viết được giữ lại).|The script is not finished. Click “Continue writing” so Muse carries on from where it stopped (what was already written is kept).
Có clip dở hoặc lỗi. Tool tự thử lại vài lần; nếu vẫn lỗi hãy bấm «Tạo tiếp». Clip chỉ chạy khi ảnh nền của mốc đó đã xong.|Some clips are unfinished or failed. The tool retries a few times by itself; if they still fail, click “Continue making”. A clip only runs once the background image of its moment is done.
Đang tạo ảnh nền chung và hai clip của từng mốc trên Muse…|Making the shared background image and the two clips of each moment on Muse…
Đã đủ clip. Bấm «Dựng video» để lồng tiếng, thêm chữ và âm thanh rồi dựng.|All clips are ready. Click “Build video” to add the narration, text and sound, then build.
Chờ chạy. Bấm «Chạy» để bắt đầu tạo ảnh nền và clip.|Waiting to run. Click “Run” to start making the background images and clips.
Đang tạm dừng. Bấm «Tạo tiếp» để chạy nốt các clip còn lại.|Paused. Click “Continue making” to run the remaining clips.
Dừng viết|Stop writing
Tạo tiếp|Continue making
Tác vụ|Tasks
Tác vụ đã tạo|Created tasks
Mọi video đã tạo ở các tab, xong hay còn dở|Every video made in any tab, finished or not
Danh sách này chỉ đọc từ dữ liệu đã lưu: mở lại app vẫn thấy mọi video đã tạo, dù xong hay còn dở.|This list is read from saved data: reopen the app and every video you made is still here, finished or not.
Chạy|Run
Dựng lại video|Rebuild video
Danh sách clip video so sánh song song|Side-by-side video clip list
Sẵn sàng cho video so sánh song song mới|Ready for a new side-by-side video
Ảnh nền và clip lưu trong thư mục «SoSanh» theo từng video; video hoàn chỉnh được lồng tiếng, thêm chữ và âm thanh rồi dựng tự động ở cuối.|Background images and clips are saved in the “SoSanh” folder, one per video; the finished video is narrated, given text and sound, and built automatically at the end.
Dừng và xóa toàn bộ danh sách video So sánh song song?|Stop and clear the whole list of side-by-side videos?
Xóa luôn thư mục SoSanh của các video này (ảnh nền, clip, kịch bản, video đã dựng) vào Thùng rác|Also move the SoSanh folders of these videos (background images, clips, scripts, built video) to the Recycle Bin
Đã dừng viết kịch bản. Bấm «Viết tiếp» để làm tiếp từ chỗ dở.|Script writing stopped. Click “Continue writing” to carry on from where it stopped.
Đã dừng viết kịch bản.|Script writing stopped.
Chỉ dựng video khi mọi clip đã xong.|Build the video only when every clip is done.
Không thấy kịch bản đã lưu của video này.|Cannot find the saved script of this video.
Không thấy video này.|Cannot find this video.
Video đã dựng xong|The video is built
Đã dừng dựng video. Bấm «Dựng video» để làm lại.|Building stopped. Click “Build video” to do it again.
Đang làm video, chờ xong hoặc bấm Dừng.|A video is being made; wait for it to finish or click Stop.
Chờ xử lý đầu ra xong trước khi làm video mới.|Wait for the current output to finish before making a new video.
Hàng đợi đang chạy. Dừng hàng đợi trước khi làm video mới.|The queue is running. Stop the queue before making a new video.
Tab «So sánh song song» cần FFmpeg để ghép video. Chọn ffmpeg.exe (cùng thư mục ffprobe.exe) ở «Kết nối & cài đặt».|The “Side-by-side” tab needs FFmpeg to assemble the video. Choose ffmpeg.exe (in the same folder as ffprobe.exe) under “Connection & settings”.
Chưa cài giọng Microsoft (miễn phí). Bấm «Cài giọng miễn phí» ở mục Giọng đọc, đợi cài xong rồi làm video.|Microsoft voices (free) are not installed. Click “Install free voices” in the Narration voice section, wait for the install to finish, then make the video.
Không mở được file nhạc nền. Chọn lại file nhạc.|Cannot open the music file. Choose the music file again.
Chờ xử lý hiện tại hoàn tất.|Wait for the current task to finish.
Muse chọn chủ đề và lập hồ sơ phim…|Muse is picking a topic and drawing up the outline…
Lập hồ sơ phim · chuẩn bị yêu cầu…|Drawing up the outline · preparing the request…
Muse chưa lập được hồ sơ phim. Bấm «Viết tiếp» để thử lại.|Muse could not draw up the outline. Click “Continue writing” to try again.
Muse đang viết kịch bản. Chờ xong hoặc bấm Dừng.|Muse is writing a script. Wait for it to finish or click Stop.
Dừng hàng đợi và các thao tác trình duyệt trước khi nhờ Muse viết kịch bản.|Stop the queue and browser actions before asking Muse to write the script.
Bộ vẽ chữ trả ảnh không hợp lệ.|The text renderer returned an invalid image.
Chưa có kịch bản để dựng.|There is no script to build yet.
Đang đo độ dài các clip…|Measuring the clip lengths…
Đang dựng thẻ mở đầu và thẻ kết…|Building the opening and closing cards…
Đang nối các mốc thành video…|Joining the moments into the video…
Video ghép chưa hợp lệ.|The joined video is not valid.
`.trim().split('\n').map(line=>line.split('|')));
  const norm=s=>String(s).replace(/\s+/g,' ').trim();
  let language='en';try{language=localStorage.getItem('museStudio.language')==='vi'?'vi':'en';}catch{}
  // t() chạy cho MỖI đoạn chữ mỗi lần giao diện đổi (cả trăm thẻ cảnh); với chuỗi không có trong từ điển nó dựng lại cả trăm biểu thức chính quy mỗi lần gọi. Kết quả chỉ phụ thuộc chính chuỗi (khi đang tiếng Anh), nên nhớ lại để các lần sau trả ngay.
  const memo=new Map();
  function t(value){
    const raw=String(value??'');if(language==='vi')return raw;
    let out=memo.get(raw);
    if(out===undefined){out=translate(raw);if(memo.size>8000)memo.clear();memo.set(raw,out);}
    return out;
  }
  function translate(value){
    const raw=String(value??'');if(language==='vi')return raw;
    const key=norm(raw);if(dictionary[key])return raw.replace(key,dictionary[key]);
    const decorated=key.match(/^([▶■▱▦▧✎⌂☘⇋◍☰↗⚙✓＋+\s]*)(.*?)([＋▾\s]*)$/u);
    if(decorated&&dictionary[decorated[2]])return decorated[1]+dictionary[decorated[2]]+decorated[3];
    const photoRetry=key.match(/^Chưa lưu được ảnh · giữ đúng kết quả và thử lại: (.+)$/);if(photoRetry)return 'Image not saved yet · Retrying the same result: '+t(photoRetry[1]);
    const retry=key.match(/^Chưa lưu được video · giữ đúng kết quả và thử tải lại: (.+)$/);if(retry)return 'Video not saved yet · Retrying the same result: '+t(retry[1]);
    const expiry=key.match(/^(.*?) Hạn: (.+)$/);if(expiry)return t(expiry[1])+' Expires: '+expiry[2];
    const patterns=[
      [/^(\d+) phút \(chạy thử, ít clip\)$/,m=>m[1]+(m[1]==='1'?' minute':' minutes')+' (trial run, fewer clips)'],
      [/^Video khoảng (\d+) phút = (\d+) mốc → (\d+) ảnh nền chung \+ (\d+) clip \(mỗi clip (\d+) giây, hai clip mỗi mốc\)\. Tạo ảnh và clip trên Muse mất nhiều giờ: cứ để máy chạy, tool tự thử lại clip lỗi và tự dựng video khi đủ clip\.$/,m=>'About '+m[1]+(m[1]==='1'?' minute':' minutes')+' = '+m[2]+' moments → '+m[3]+' shared background images + '+m[4]+' clips (each clip '+m[5]+' seconds, two clips per moment). Making the images and clips on Muse takes many hours: just leave the computer running; the tool retries failed clips by itself and builds the video once every clip is ready.'],
      [/^Nhạc nền: (.+)$/,m=>'Background music: '+m[1]],
      [/^Nhạc nền phải là (.+)\.$/,m=>'Background music must be '+m[1]+'.'],
      [/^(\d+) hashtag đã nằm cuối mô tả; 3 cái đầu hiện ngay trên tiêu đề video\.$/,m=>m[1]+' hashtags are already at the end of the description; the first 3 show right above the video title.'],
      [/^Đang viết kịch bản · (\d+)\/(\d+|\?) mốc$/,m=>'Writing the script · '+m[1]+'/'+m[2]+' moments'],
      [/^(Đang chạy|Tạm dừng) · (\d+)\/(\d+) clip$/,m=>(m[1]==='Đang chạy'?'Running':'Paused')+' · '+m[2]+'/'+m[3]+' clips'],
      [/^(\d+)\/(\d+) clip$/,m=>m[1]+'/'+m[2]+' clips'],
      [/^(\d+) \/ (\d+) clip đã lưu$/,m=>m[1]+' / '+m[2]+' clips saved'],
      [/^Video hoàn chỉnh(?: \((\d+) phút (\d+) giây\))?: (.+)\. Xem file ghi chú đăng video \(ghi-chu-dang-video\.txt\) trong cùng thư mục\.$/,m=>'Finished video'+(m[1]?' ('+m[1]+' min '+m[2]+' s)':'')+': '+m[3]+'. See the posting-notes file (ghi-chu-dang-video.txt) in the same folder.'],
      [/^Đã viết (\d+) mốc, bắt đầu tạo ảnh nền và clip…$/,m=>'Wrote '+m[1]+' moments, starting the background images and clips…'],
      [/^Đã viết (\d+)\/(\d+) mốc$/,m=>'Written '+m[1]+'/'+m[2]+' moments'],
      [/^Muse đã viết xong kịch bản \((\d+) mốc\)$/,m=>'Muse finished the script ('+m[1]+' moments)'],
      [/^Kịch bản mới có (\d+)\/(\d+) mốc\. Bấm «Viết tiếp»\.$/,m=>'The script only has '+m[1]+'/'+m[2]+' moments. Click “Continue writing”.'],
      [/^Muse viết thiếu hoặc sai khuôn mốc (.+)\. Bấm «Viết tiếp» để Muse làm tiếp từ chỗ này\.$/,m=>'Muse left out or malformed moments '+m[1]+'. Click “Continue writing” so Muse carries on from here.'],
      [/^(Lập hồ sơ phim|Viết kịch bản (\d+)\/(\d+) \(mốc (\d+)–(\d+)\)) · (.+)$/,m=>{const head=m[2]?'Writing the script '+m[2]+'/'+m[3]+' (moments '+m[4]+'–'+m[5]+')':'Drawing up the outline';const tail=m[6].replace(/^chuẩn bị yêu cầu…$/,'preparing the request…').replace(/^đang gửi cho Muse…$/,'sending to Muse…').replace(/^chờ ô chat Muse \(đăng nhập nếu cần\)…$/,'waiting for the Muse chat box (sign in if needed)…').replace(/^Muse còn đang xử lý việc trước, chờ rảnh rồi mới gửi…$/,'Muse is still busy with the previous task, waiting until it is free…').replace(/^Muse đang viết(?: \(đã (\d+) cảnh\))?…$/,(x,n)=>'Muse is writing'+(n?' ('+n+' scenes so far)':'')+'…');return head+' · '+tail;}],
      [/^Còn mốc chưa có đủ hai clip \((.+)\)\. Chạy hàng đợi cho xong rồi dựng\.$/,m=>'Some moments do not have both clips yet ('+m[1]+'). Let the queue finish, then build.'],
      [/^Đang dựng (\d+)\/(\d+) mốc…$/,m=>'Building moment '+m[1]+'/'+m[2]+'…'],
      [/^Mốc (\d+) thiếu luồng video\.$/,m=>'Moment '+m[1]+' has no video stream.'],
      [/^Phiên bản (.+)$/,m=>'Version '+m[1]],
      [/^Giọng Microsoft miễn phí: (\d+) giọng, nhiều ngôn ngữ \(✓ = hợp ngôn ngữ kịch bản\), cần có mạng khi đọc\.(?: (.+))?$/,m=>'Free Microsoft voices: '+m[1]+' voices, many languages (✓ = matches the script language), internet needed when reading.'+(m[2]?' '+t(m[2]):'')],
      [/^Chưa tải được danh sách giọng Microsoft \((.+)\)\. Đang dùng danh sách có sẵn\.$/,m=>'Could not load the Microsoft voice list ('+m[1]+'). Using the built-in list.'],
      [/^Đang tạo ảnh \+ clip \((\d+)\/(\d+)\)$/,m=>'Creating images + clips ('+m[1]+'/'+m[2]+')'],
      [/^▶ Chạy tiếp tạo ảnh \+ clip \(còn (\d+) cảnh\)$/,m=>'▶ Continue making images + clips ('+m[1]+' scene(s) left)'],
      [/^Hàng đợi đã dừng, còn (\d+) cảnh chưa xong\. Bấm «Chạy tiếp» để chạy tiếp, xong sẽ tự xuất MP4\.$/,m=>'The queue stopped with '+m[1]+' scene(s) unfinished. Click “Continue” to run on; the MP4 is exported automatically when done.'],
      [/^Hàng đợi đã dừng, còn (\d+) cảnh chưa xong\. Chạy tiếp hàng đợi rồi bấm Xuất MP4\.$/,m=>'The queue stopped with '+m[1]+' scene(s) unfinished. Resume the queue, then click Export MP4.'],
      [/^Hàng đợi đã dừng, còn (\d+) cảnh chưa xong nên chưa tự xuất MP4\. .*$/,m=>'The queue stopped with '+m[1]+' scene(s) unfinished, so the MP4 was not exported automatically. Click “Continue” to carry on.'],
      [/^Tài khoản (\d+)$/,m=>'Account '+m[1]],
      [/^Đây là cảnh cuối của truyện (.+)\. Xóa sẽ chuyển cả thư mục KeChuyen\/(.+) \(clip, ảnh, video ghép\) vào Thùng rác\. Tiếp tục\?$/,m=>'This is the last scene of story '+m[1]+'. Deleting it moves the whole KeChuyen/'+m[2]+' folder (clips, images, final video) to the Recycle Bin. Continue?'],
      [/^Truyện (.+) sẽ bị bỏ khỏi danh sách, kể cả mọi cảnh của nó trong hàng đợi\.$/,m=>'Story '+m[1]+' will be removed from the list, including all its scenes in the queue.'],
      [/^Xóa luôn thư mục KeChuyen\/(.+) \(clip, ảnh, video ghép\) vào Thùng rác$/,m=>'Also move the KeChuyen/'+m[1]+' folder (clips, images, final video) to the Recycle Bin'],
      [/^(\d+)\/(\d+) cảnh$/,m=>m[1]+'/'+m[2]+' scenes'],
      [/^Đang dừng · (\d+)\/(\d+) clip$/,m=>'Stopped · '+m[1]+'/'+m[2]+' clips'],
      [/^(\d+) cảnh lỗi hoặc bị dừng: bấm «Tiếp tục» ở Hàng đợi để làm lại\.$/,m=>m[1]+' scene(s) failed or were stopped: press “Continue” in the queue to redo them.'],
      [/^✓ Video đã xuất: (.+)$/,m=>'✓ Video exported: '+m[1]],
      [/^Xóa luôn file đã tự lưu về máy \(thư mục KeChuyen\/(.+): clip, ảnh, video ghép\) vào Thùng rác$/,m=>'Also delete the files saved on this computer (folder KeChuyen/'+m[1]+': clips, images, final video), moving them to the Recycle Bin'],
      [/^Gắn khóa ảnh nhân vật cho (\d+) cảnh chưa xong$/,m=>'Lock '+m[1]+' unfinished scene(s) to the character image'],
      [/^Đã gắn câu khóa hình dạng nhân vật vào (\d+) cảnh theo ảnh \/ hình dạng hiện tại\.$/,m=>'Added the character shape lock to '+m[1]+' scene(s) based on the current image / shape.'],
      [/^Đã gỡ câu khóa hình dạng nhân vật khỏi (\d+) cảnh \(không còn ảnh tham chiếu\)\.$/,m=>'Removed the character shape lock from '+m[1]+' scene(s) (no reference image any more).'],
      [/^Đã gắn khóa vào (\d+) cảnh\.$/,m=>'Added the lock to '+m[1]+' scene(s).'],
      [/^Đã lưu video: (.+)$/,m=>'Video saved: '+m[1]],
      [/^Đã tạo thumbnail 1920×1080 kiểu «Trước \/ Sau»\.$/,()=>'Created the 1920×1080 "Before / After" thumbnail.'],
      [/^Đã lưu thumbnail: (.+)$/,m=>'Thumbnail saved: '+m[1]],
      [/^Không hiển thị đầy đủ được thẻ video này(?: \((.+)\))?\. Các nút bên dưới vẫn dùng được\.$/,m=>'This video card could not be shown in full'+(m[1]?' ('+m[1]+')':'')+'. The buttons below still work.'],
      [/^Đã tạo thumbnail 1920×1080 \(ảnh (\d+)\/(\d+)\)\. Bấm lại để đổi sang kiểu khác\.$/,m=>'Created the 1920×1080 thumbnail (style '+m[1]+'/'+m[2]+'). Press again to switch to another style.'],
      [/^(✓ .+) · đang bỏ khỏi video$/,m=>m[1]+' · left out of the video'],
      [/^· đang bỏ khỏi video$/,()=>'· left out of the video'],
      [/^Đã thấy tin nhắn · chờ Muse phản hồi \((.+)\)$/,m=>'Message found · Waiting for Muse response ('+t(m[1])+')'],
      [/^Đang bấm chuột phải → Tải xuống \(ảnh (\d+)\/(\d+)\)$/,m=>'Right-clicking the image → Download (image '+m[1]+'/'+m[2]+')'],
      [/^thấy (\d+) tin nhắn giống prompt, lúc gửi có (\d+|\?)$/,m=>'found '+m[1]+' message(s) matching the prompt, '+m[2]+' when it was sent'],
      [/^thấy (\d+) video mới nhưng chưa gắn được vào đúng prompt$/,m=>'found '+m[1]+' new video(s) not yet bound to this prompt'],
      [/^Tài khoản này chỉ chạy khi chọn «Chạy song song» từ (\d+) trình duyệt\.$/,m=>'This account only runs when "Parallel browsers" is set to '+m[1]+' or more.'],
      [/^Đăng xuất TK (\d+) · (.+)$/,m=>'Sign out · Account '+m[1]+' · '+t(m[2])],
      [/^Đang tạo clip (\d+)\/(\d+)$/,m=>'Creating clips '+m[1]+'/'+m[2]],
      [/^Hàng đợi đang dừng · (\d+)\/(\d+) clip\. Bấm «Tiếp tục» ở Hàng đợi để làm tiếp$/,m=>'Queue stopped · '+m[1]+'/'+m[2]+' clips. Press “Continue” in the queue to resume'],
      [/^Đang đọc giọng (\d+)\/(\d+) cảnh$/,m=>'Narrating '+m[1]+'/'+m[2]+' scenes'],
      [/^Đang edit khớp & dựng (\d+)\/(\d+) cảnh$/,m=>'Editing to match and building '+m[1]+'/'+m[2]+' scenes'],
      [/^Xong: (.+\.mp4)$/i,m=>'Done: '+m[1]],
      [/^Còn (\d+) cảnh chưa có clip\. Xong hết clip app sẽ tự đọc giọng, edit khớp và xuất MP4\.$/,m=>m[1]+' scene(s) have no clip yet. When all clips are done the app narrates, edits to match and exports the MP4 by itself.'],
      [/^(\d+) \/ (\d+) video đã lưu$/,m=>m[1]+' / '+m[2]+' videos saved'],
      [/^(\d+) \/ (\d+) ảnh đã lưu$/,m=>m[1]+' / '+m[2]+' images saved'],
      [/^thấy (\d+) ảnh mới nhưng chưa gắn được vào đúng prompt$/,m=>'found '+m[1]+' new image(s) not yet bound to this prompt'],
      [/^Muse đang tạo ảnh · (\d+)%$/,m=>'Muse is generating the image · '+m[1]+'%'],
      [/^Thêm (\d+) prompt ảnh và chạy toàn bộ tác vụ ảnh đang chờ\?.*$/,m=>'Add '+m[1]+' image prompts and run all pending image tasks? This may use Muse credits. Exact reviewed prompts and scene references will be sent.'],
      [/^Sang TK (\d+)( \(đang nghỉ\))?$/,m=>'Move to account '+m[1]+(m[2]?' (resting)':'')],
      [/^Chạy ở TK (\d+)( \(cũ\)| \(đang nghỉ\))?$/,m=>'Run on account '+m[1]+(m[2]===' (cũ)'?' (previous)':m[2]?' (resting)':'')],
      [/^(⚠ )?#(\d+)(?: · TK (\d+))? · (\d+:\d{2})$/,m=>(m[1]||'')+'#'+m[2]+(m[3]?' · Account '+m[3]:'')+' · '+m[4]],
      [/^Cảnh này chạy quá (\d+) phút \(ngưỡng báo chậm\)\. Bấm để mở thẻ, rồi chọn «Dừng cảnh này», «Tạo lại ngay» hoặc «Thử TK khác»\.$/,m=>'This scene has run for over '+m[1]+' minutes (slow-warning threshold). Click to open its card, then choose Stop this scene, Restart now or Try another account.'],
      [/^Bấm dừng cảnh này ở TK (\S+) rồi gửi lại prompt sang TK (\d+)\? Nếu Muse đang tạo dở thì phần đó bị bỏ\.$/,m=>'Stop this scene on account '+m[1]+' and resend the prompt on account '+m[2]+'? Anything Muse is still generating for it is discarded.'],
      [/^(\d+) đang làm$/,m=>m[1]+' processing'],[/^(\d+) đang chờ$/,m=>m[1]+' pending'],[/^(\d+) cảnh dở(?: \/ lỗi)?$/,m=>m[1]+' interrupted / failed'],
      [/^(\d+) trình duyệt · (\d+) ô$/,m=>m[1]+' browsers · '+m[2]+' slots'],
      [/^Mở (\d+) trình duyệt$/,m=>'Open '+m[1]+' browsers'],
      [/^Song song (\d+) trình duyệt · mỗi trình duyệt 1 prompt(.*)$/,m=>'Parallel: '+m[1]+' browsers · 1 prompt each'+m[2].replace(' · Đang nghỉ vì hết hạn mức: TK ',' · Resting (quota reached): account ').replace('đến ','until ').replace('bấm Tiếp tục để thử lại ngay','press Continue to retry now')],
      [/^Trình duyệt (\d+): (.+)$/,m=>'Browser '+m[1]+': '+t(m[2])],
      [/^Đã xử lý (.+)$/,m=>'Elapsed '+m[1]],[/^Đã tải (.+)$/,m=>'Downloaded '+m[1]],
      [/^(🔒 Đã khóa · )?(\d+) ảnh tham chiếu(.*)$/,m=>(m[1]?'🔒 Locked · ':'')+m[2]+' reference image(s)'+m[3].replace('sẽ chạy ở TK ','will run on Account ').replace('TK ','Account ')],
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
      [/^(\d+) phút$/,m=>m[1]+(m[1]==='1'?' minute':' minutes')],
      [/^≈ (\d+) cảnh \(1 mở đầu \+ (\d+) (bước|đoạn) \+ 1 kết\) = (\d+) ảnh \+ (\d+) clip, mỗi cảnh đọc khoảng (\d+) giây\. Tạo ảnh và clip tốn khoảng (\d+) lượt Muse\.$/,m=>'≈ '+m[1]+' scenes (1 intro + '+m[2]+(m[3]==='đoạn'?' parts':' steps')+' + 1 ending) = '+m[4]+' pictures + '+m[5]+' clips, each scene narrated for about '+m[6]+' seconds. Creating the pictures and clips uses about '+m[7]+' Muse generations.'],
      [/^Muse đã viết xong mẹo vặt \((\d+) bước\)$/,m=>'Muse finished writing the tip ('+m[1]+' steps)'],
      [/^Muse đang bận ở tab «(.+)»\. Chờ xong rồi dùng tab này\.$/,m=>'Muse is busy in the “'+({'Kể chuyện':'Story','Quảng cáo sản phẩm':'Product ad','Mẹo vặt':'Tips','Cây trồng phát triển':'Growing plants','Lịch sử minh họa':'Illustrated history'}[m[1]]||m[1])+'” tab. Wait for it to finish, then use this tab.'],
      [/^Muse đã xong ở tab «(.+)»\.$/,m=>'Muse finished in the “'+({'Kể chuyện':'Story','Quảng cáo sản phẩm':'Product ad','Mẹo vặt':'Tips','Cây trồng phát triển':'Growing plants','Lịch sử minh họa':'Illustrated history'}[m[1]]||m[1])+'” tab.'],
      [/^(?:Đã dọn (\d+) truyện cũ đã xong khỏi hàng đợi \((.+?)\)\. Video đã tải vẫn còn trong thư mục\.)?(?: ?(.+?): chưa xuất MP4 nên được giữ lại\.)?$/,m=>[m[1]?'Removed '+m[1]+' finished old stor'+(m[1]==='1'?'y':'ies')+' from the queue ('+m[2]+'). Downloaded videos are still in the folder.':'',m[3]?m[3]+': not exported to MP4 yet, so it was kept.':''].filter(Boolean).join(' ')],
      [/^Muse đã viết xong bài trồng cây \((\d+) bước\)$/,m=>'Muse finished writing the plant guide ('+m[1]+' steps)'],
      [/^Hàng đợi đã dừng, còn (\d+) cảnh chưa xong nên chưa tự xuất MP4\. Chạy tiếp hàng đợi cho xong rồi bấm Xuất MP4\.$/,m=>'The queue has stopped with '+m[1]+' scene(s) unfinished, so the MP4 was not exported automatically. Finish the queue, then click Export MP4.'],
      [/^Muse đã viết xong bài lịch sử \((\d+) đoạn\)$/,m=>'Muse finished writing the history text ('+m[1]+' parts)'],
      [/^Muse dừng ở phần (\d+)\/(\d+) nên bài mới có phần đầu\. Dán nốt phần còn lại vào cuối ô bài hoặc bấm viết lại\.$/,m=>'Muse stopped at part '+m[1]+'/'+m[2]+', so the text only has its first part. Paste the rest at the end of the text box or write again.'],
      [/^Muse dừng ở phần (\d+)\/(\d+), giữ phần đã viết$/,m=>'Muse stopped at part '+m[1]+'/'+m[2]+', keeping what was written'],
      [/^Muse còn thiếu (\d+) đoạn của bài: bổ sung vào ô bài hoặc bấm viết lại\.$/,m=>'Muse left out '+m[1]+' part(s) of the text: add them to the text box or write again.'],
      [/^(\d+) đoạn hơi dài, có thể bị chia thành 2 cảnh\.$/,m=>m[1]+' part(s) are a bit long and may be split into 2 scenes.'],
      [/^Muse viết thiếu nhiều bước \(thiếu (\d+)\/(\d+) bước ở phần (\d+)\)\. Bấm «Muse viết mẹo» lại\.$/,m=>'Muse left out too many steps ('+m[1]+'/'+m[2]+' steps missing in part '+m[3]+'). Click “Muse writes the tip” again.'],
      [/^Muse còn thiếu (.+): bổ sung vào ô mẹo hoặc bấm viết lại\.$/,m=>'Muse left out '+m[1].replace(/bước (\d+)/g,'step $1')+': add them to the tip box or write again.'],
      [/^(.+) hơi dài, có thể bị chia thành 2 cảnh\.$/,m=>m[1].replace(/Bước (\d+)/g,'Step $1')+(/,/.test(m[1])?' are':' is')+' a bit long and may be split into 2 scenes.'],
      [/^Muse đã chia (\d+) cảnh\.(?: (.+?))? Xem lại lời đọc(?: và prompt, rồi bấm Tạo clip|, prompt ảnh và prompt chuyển động, rồi bấm Tạo ảnh \+ clip)\.$/,m=>'Muse split the story into '+m[1]+' scenes.'+(m[2]?' '+m[2].replace(/^Muse chưa đọc hiểu được cả bài \(trả lời sai khuôn\) nên các lượt chia cảnh chỉ kèm truyện làm ngữ cảnh\.$/,'Muse could not read and summarize the whole text (wrong reply format), so each scene-splitting request only carries the story as context.').replace(/Còn (\d+) cảnh có mốc chuyển động lệch thứ tự câu hoặc thiếu câu \(xem ⚠ ở từng cảnh\)\./,(x,n)=>n+' scene(s) still have motion beats out of sentence order or missing a sentence (see the ⚠ on each scene).'):'')+(/Tạo ảnh \+ clip\.$/.test(m[0])?' Review the narration, image prompts and motion prompts, then click Create images + clips.':' Review the narration and prompts, then click Create clips.')],
      [/^Muse đã chia (\d+) cảnh, dừng ở câu (\d+)\/(\d+)\. (.+) Bấm «Phân tích tiếp» để Muse làm tiếp từ đó \(giữ nguyên các cảnh đã có\)\.$/,m=>'Muse split '+m[1]+' scene(s) and stopped at sentence '+m[2]+'/'+m[3]+'. '+m[4].replace(/^Muse chưa chia đúng đoạn từ câu (\d+)\.$/,'Muse did not split the part from sentence $1 correctly.').replace(/^Muse trả lời không đúng khuôn \(không thấy số câu và prompt cho từng cảnh\)\.$/,'Muse replied in the wrong format (no sentence numbers and prompts per scene).').replace(/^Muse trả lời quá lâu\. Thử lại\.$/,'Muse took too long to reply. Try again.')+' Click “Continue analysis” so Muse carries on from there (the existing scenes are kept).'],
      [/^Muse dừng ở câu (\d+)\/(\d+)\. Bấm «Phân tích tiếp» để làm tiếp\.$/,m=>'Muse stopped at sentence '+m[1]+'/'+m[2]+'. Click “Continue analysis” to carry on.'],
      [/^Muse chưa chia được đoạn bắt đầu từ câu (\d+)\.$/,m=>'Muse could not split the part starting at sentence '+m[1]+'.'],
      [/^(?:Phần (\d+)\/(\d+)|Phân tích|Viết lời quảng cáo|Viết (?:mẹo vặt|bài trồng cây|bài lịch sử)(?: (\d+)\/(\d+))?|Đọc hiểu truyện(?: (\d+)\/(\d+))?) · (.+)$/,m=>{const head=m[1]?'Part '+m[1]+'/'+m[2]:/^Viết bài trồng/.test(key)?'Writing the plant guide'+(m[3]?' '+m[3]+'/'+m[4]:''):/^Viết bài lịch sử/.test(key)?'Writing the history text'+(m[3]?' '+m[3]+'/'+m[4]:''):/^Viết mẹo/.test(key)?'Writing the tip'+(m[3]?' '+m[3]+'/'+m[4]:''):/^Viết/.test(key)?'Writing the ad script':/^Đọc/.test(key)?'Reading the text'+(m[5]?' '+m[5]+'/'+m[6]:''):'Analysis',tail=[[/^xong$/,()=>'done'],[/^chuẩn bị yêu cầu…$/,()=>'preparing the request…'],[/^Muse còn đang xử lý việc trước, chờ rảnh rồi mới gửi…$/,()=>'Muse is still busy with earlier work; waiting until it is free…'],[/^chờ ô chat Muse \(đăng nhập nếu cần\)…$/,()=>'waiting for the Muse chat box (sign in if needed)…'],[/^đang gửi cho Muse…$/,()=>'sending to Muse…'],[/^Muse đang viết(?: \(đã (\d+) cảnh\))?…$/,x=>'Muse is writing'+(x[1]?' ('+x[1]+' scene(s) so far)':'')+'…'],[/^hỏi lại Muse (\d+) đoạn còn thiếu…$/,x=>'asking Muse again about '+x[1]+' missing part(s)…'],[/^soát lại chuyển động (\d+) cảnh…$/,x=>'re-checking the motion of '+x[1]+' scene(s)…'],[/^gộp (\d+) cảnh quá ngắn…$/,x=>'merging '+x[1]+' very short scene(s)…'],[/^xong (\d+) cảnh$/,x=>'done: '+x[1]+' scene(s)']];for(const [re,fn] of tail){const x=m[7].match(re);if(x)return head+' · '+fn(x);}return head+' · '+m[7];}],
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
      [/^Thêm (\d+) (bước|cảnh) \((\d+) ảnh \+ (\d+) clip\) và chạy ngay\?(.*)$/,m=>'Add '+m[1]+(m[2]==='cảnh'?' scenes (':' steps (')+m[3]+' images + '+m[4]+' clips) and run now? Each '+(m[2]==='cảnh'?'scene':'step')+' uses 2 Muse generations (1 image, 1 clip), so this may use a lot of Muse credits.'+(/Video dài/.test(m[5])?' This is a long video, so Muse may run for many hours or even days; you can press Stop and continue later.':'')+' All images are created first, then each clip is made from its own image; the reviewed prompts are sent exactly as shown.'],
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
  const records=new WeakMap(),attrs=new WeakMap(),skipped=new WeakSet();
  const excluded='script,style,textarea,input,.prompt,.jobTitle,.referenceName,.fileLine,.jobSource p,.draftContent>strong,#folderPath,#deviceCode,[data-i18n-skip]';
  const ATTR_SELECTOR='[placeholder],[title],[aria-label],img[alt]',ATTR_NAMES=['placeholder','title','aria-label','alt'];
  // Dịch MỘT đoạn chữ. Chữ đã dịch và chưa đổi, hoặc nằm trong vùng không dịch, thì bỏ qua ngay (không gọi closest()).
  function translateText(node){
    if(skipped.has(node))return;
    let r=records.get(node);
    if(r&&r.language===language&&node.nodeValue===r.rendered)return;
    if(!node.parentElement||!node.nodeValue.trim())return;
    if(node.parentElement.closest(excluded)){skipped.add(node);return;}
    if(!r||node.nodeValue!==r.rendered)r={source:node.nodeValue};
    r.rendered=t(r.source);r.language=language;if(node.nodeValue!==r.rendered)node.nodeValue=r.rendered;records.set(node,r);
  }
  function translateAttrs(e){
    if(e.closest('[data-i18n-skip]')||e.classList.contains('card'))return;
    const r=attrs.get(e)||{};
    for(const name of ATTR_NAMES)if(e.hasAttribute(name)){
      const value=e.getAttribute(name);let a=r[name];
      if(a&&a.language===language&&value===a.rendered)continue;
      if(!a||value!==a.rendered)a={source:value};a.rendered=t(a.source);a.language=language;if(a.rendered!==value)e.setAttribute(name,a.rendered);r[name]=a;
    }attrs.set(e,r);
  }
  // Dịch phần mới thêm / vừa đổi. Trước đây MỖI lần giao diện đổi là đi lại TOÀN BỘ chữ và thuộc tính của trang (hàng chục nghìn nút khi có vài trăm thẻ cảnh): bấm «Tạo ảnh + clip» cho 210 cảnh mất hơn 20 giây.
  function translateTree(root){
    if(root.nodeType===3){translateText(root);return;}
    if(root.nodeType!==1)return;
    const walker=document.createTreeWalker(root,NodeFilter.SHOW_TEXT);let node;
    while(node=walker.nextNode())translateText(node);
    if(root.matches(ATTR_SELECTOR))translateAttrs(root);
    for(const e of root.querySelectorAll(ATTR_SELECTOR))translateAttrs(e);
  }
  const OBSERVE={subtree:true,childList:true,characterData:true,attributes:true,attributeFilter:ATTR_NAMES};
  function apply(){
    observer.disconnect();
    translateTree(document.body);
    document.documentElement.lang=language;const picker=document.getElementById('languagePicker');if(picker)picker.value=language;
    observer.observe(document.body,OBSERVE);
  }
  const observer=new MutationObserver(list=>{
    observer.disconnect();
    for(const m of list){
      if(m.type==='childList'){for(const n of m.addedNodes)translateTree(n);}
      else if(m.type==='characterData')translateTree(m.target);
      else if(m.type==='attributes'&&m.target.nodeType===1)translateAttrs(m.target);
    }
    observer.observe(document.body,OBSERVE);
  });
  function setLanguage(next){if(!['vi','en'].includes(next))return;language=next;try{localStorage.setItem('museStudio.language',next);}catch{}apply();}
  const nativeConfirm=window.confirm.bind(window);window.confirm=message=>nativeConfirm(t(message));
  window.studioI18n={t,setLanguage,apply,get language(){return language;}};apply();
})();
