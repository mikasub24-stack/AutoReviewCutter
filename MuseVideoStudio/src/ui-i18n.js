// Interface-only localization. User prompts, titles, paths and form values are never translated.
(()=>{
  const dictionary=Object.fromEntries(`
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
Giây / cảnh|Seconds / scene
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
    const decorated=key.match(/^([▶■▱▦↗⚙✓＋+\s]*)(.*?)([＋▾\s]*)$/u);
    if(decorated&&dictionary[decorated[2]])return decorated[1]+dictionary[decorated[2]]+decorated[3];
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
      [/^(\d+) đang làm$/,m=>m[1]+' processing'],[/^(\d+) đang chờ$/,m=>m[1]+' pending'],[/^(\d+) cảnh dở(?: \/ lỗi)?$/,m=>m[1]+' interrupted / failed'],
      [/^(\d+) trình duyệt · (\d+) ô$/,m=>m[1]+' browsers · '+m[2]+' slots'],
      [/^Mở (\d+) trình duyệt$/,m=>'Open '+m[1]+' browsers'],
      [/^Song song (\d+) trình duyệt · mỗi trình duyệt 1 prompt$/,m=>'Parallel: '+m[1]+' browsers · 1 prompt each'],
      [/^Trình duyệt (\d+): (.+)$/,m=>'Browser '+m[1]+': '+t(m[2])],
      [/^Đã xử lý (.+)$/,m=>'Elapsed '+m[1]],[/^Đã tải (.+)$/,m=>'Downloaded '+m[1]],
      [/^(🔒 Đã khóa · )?(\d+) ảnh tham chiếu(.*)$/,m=>(m[1]?'🔒 Locked · ':'')+m[2]+' reference image(s)'+m[3].replace('TK ','Account ')],
      [/^(\d+) ảnh chung cho toàn bộ prompt\.$/,m=>m[1]+' shared reference image(s) for every prompt.'],
      [/^(\d+) ảnh theo số thứ tự\.$/,m=>m[1]+' numbered reference image(s).'],
      [/^Đã nhận (\d+) prompt hoàn chỉnh(.*?)\. Xem\/sửa hoặc bấm Tạo video\.$/,m=>m[1]+' complete prompts loaded'+m[2].replace('mục tiêu','target')+'. Review or click Create videos.'],
      [/^Đã khôi phục (\d+) cảnh: (\d+) chờ, (\d+) dở\. .*$/,m=>'Restored '+m[1]+' scenes: '+m[2]+' pending, '+m[3]+' interrupted. Press Continue to resume. The opening message is optional.'],
      [/^✓ Vừa xong: (.+)$/,m=>'✓ Recently saved: '+m[1]],
      [/^Dùng thử đến (.+)$/,m=>'Trial until '+m[1]],[/^Nội dung chuyển khoản: (.+)$/,m=>'Payment reference: '+m[1]],
      [/^Đang đính kèm (\d+) ảnh tham chiếu đã khóa$/,m=>'Attaching '+m[1]+' locked reference image(s)'],
      [/^Thêm (\d+) prompt và chạy toàn bộ tác vụ đang chờ\?.*$/,m=>'Add '+m[1]+' prompts and run all pending scenes? This may use Muse credits. Exact reviewed prompts and scene references will be sent.'],
      [/^Dán ảnh tại đây cho (.+)$/,m=>'Paste references here for '+m[1]],
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
