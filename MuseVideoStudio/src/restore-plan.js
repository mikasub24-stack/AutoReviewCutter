/* Tab «Dọn nhà · Sinh tồn»: một ảnh gốc → chuỗi cảnh LIỀN MẠCH (khung cuối clip trước là khung đầu clip sau) → tự dựng thành một video.
   Chỉ dùng luật/mẫu chạy trên máy; không gọi API hay mô hình ngôn ngữ nào khác. Prompt gửi Muse bằng tiếng Anh (Muse hiểu tốt nhất). */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.restorePlan = factory();
})(typeof window !== 'undefined' ? window : globalThis, function () {
  'use strict';
  const ASPECTS = ['16:9', '9:16'];                      // ngang (YouTube) và dọc (Shorts / TikTok / Reels)
  const MINUTES = [1, 2, 3, 5, 8, 10, 15, 20, 30, 40, 45, 50, 60, 90, 120];
  const LONG_MINUTES = 20;                              // từ mức này tool dùng cảnh 10 giây (tối đa của Muse) để bớt số cảnh nối tiếp
  const VERY_LONG_MINUTES = 30;                          // từ mức này chuỗi dài hàng trăm cảnh: cảnh báo thời gian và dung lượng
  const MAX_PARALLEL = 10;                              // tối đa 10 tài khoản / trình duyệt
  const MIN_SEGMENT = 6;                                // mỗi đoạn chạy song song có ít nhất 6 cảnh (ngắn hơn thì chỉ thêm chỗ nối, không nhanh thêm)
  const MAX_CLIPS = 720;                                // 120 phút ÷ 10 giây
  const MAX_CLIPS_FLOW = 900;                           // Google Flow (Veo 3.1): mỗi clip 8 giây → 120 phút = 900 clip
  const PROVIDERS = ['muse', 'flow'];
  const SECONDS = [5, 6, 8, 10];
  const MAX_SECONDS = 10;
  const MAX_CUSTOM = 20;
  const NO_SPEECH_FLOW = 'Audio: only the quiet natural sounds of the work itself (brushing, sweeping, water, tools, footsteps); no speech, no dialogue, no singing, no narration, no music.';
  // Muse từ chối video có người thật / người nổi tiếng / nhân vật có bản quyền («blocked by policy»). Mọi prompt đều nói rõ người trong cảnh là người vô danh, hư cấu.
  // Đồng nhất là điều quan trọng nhất: mọi prompt lặp nguyên văn danh sách «không được đổi».
  const LOCKED = 'LOCKED - these never change unless the current step is working on them: the shape, size, height and style of the building or the room, the exact number of floors (storeys) of the building (a two-floor house always stays a two-floor house, never lower), the exact number and position of the windows and doors, the roof and the wall layout, the surroundings and the background, the direction of the light and the weather, the colors of everything this step does not touch, and the person\'s face, hair, skin, body size and clothes.';
  const SAFE_PEOPLE = 'People: every person in the video is an anonymous, generic, fictional individual - not any real person, not a celebrity, politician, athlete or public figure, not a lookalike of anyone, and not a known fictional, cartoon or movie character. No logos, brand names or trademarks are visible.';
  const SAFE_PEOPLE_IMAGE = SAFE_PEOPLE.replace('in the video', 'in the picture');
  const FACELESS = 'The person is always filmed from behind, from a distance or from the side, or only the hands and the body are shown; the face is never shown clearly and never in close-up.';
  const SAFE_RETRY_1 = 'SAFETY REWRITE: keep any person very small and far away or seen only from behind; no face, no portrait, no resemblance to any real person; focus the whole shot on the work, the tools and the changing place.';
  const SAFE_RETRY_2 = 'SAFETY REWRITE: no person is visible in this clip at all, not even hands or a silhouette. The work progresses step by step in smooth motion: tools, materials and the place change in front of the camera. No faces, no characters, no logos.';
  // Lỗi Muse kiểu «bị chặn» (chính sách nội dung) khác lỗi mạng: thử lại y nguyên thì vẫn bị chặn, phải đổi prompt.
  const POLICY_ERROR = /polic|blocked|block(ed)? by|violat|not allowed|prohibit|can'?t (create|generate|make)|unable to (create|generate)|refus|public figure|celebrit|likeness|real people|real person|safety|inappropriate|sensitive|trademark|copyright|chính sách|vi phạm|từ chối|bị chặn|không thể tạo|không được phép|nhạy cảm|người nổi tiếng|người thật|bản quyền/i;
  const DEFAULT_LIGHT = 'soft natural daylight, the same time of day and the same weather in every clip';
  const SURVIVOR = 'a 35-year-old man with tanned skin, short dark brown hair, brown eyes, a short neat dark beard and an ordinary friendly face, wearing a green work jacket, brown cargo trousers, black boots and a grey beanie';
  const WORKER = 'a 30-year-old man with lightly tanned skin, short black hair, brown eyes, a clean-shaven ordinary friendly face, wearing a grey work shirt, blue jeans, brown work gloves, black boots and a yellow hard hat';
  // Người trong video: mặc định NỮ trẻ (người dùng chọn nữ nhưng bản cũ luôn ra nam). Chỉ mô tả người trưởng thành, quần áo lao động kín đáo.
  const SURVIVOR_F = 'a 28-year-old woman with fair light skin, long dark brown hair in a neat braid, brown eyes and a pretty, youthful, friendly natural face, wearing a green work jacket, brown cargo trousers, black boots and a grey beanie';
  const WORKER_F = 'a 27-year-old woman with fair light skin, long dark brown hair tied back in a ponytail, brown eyes and a pretty, youthful, friendly natural face, wearing a fitted grey work shirt, blue jeans, brown work gloves, black boots and a yellow hard hat';
  const PHOTO_PERSON = 'the same single person who appears in the attached reference photo, with exactly the same face, hairstyle, hair color, skin tone, apparent age, gender, body shape and clothes as in that photo; do not change how this person looks';
  const WHO = ['female', 'male', 'photo'];
  // Người mặc định theo chủ đề và lựa chọn nữ / nam / giống ảnh gốc.
  const personFor = (theme, who) => {
    const t = typeof theme === 'string' ? themeOf(theme) : theme, survivor = t.personDefault === SURVIVOR;
    return who === 'photo' ? PHOTO_PERSON : who === 'male' ? t.personDefault : survivor ? SURVIVOR_F : WORKER_F;
  };

  // Mỗi chủ đề: base = hiện trạng ban đầu (dùng khi để Muse tạo ảnh gốc); steps = 15 việc nối tiếp nhau (vi = nhãn trên thẻ, en = việc làm trong clip).
  const THEMES = [
    {
      id: 'house_full', label: 'Dọn nhà bỏ hoang · cả ngôi nhà (ngoài → trong → hoàn thiện)', hint: 'Ảnh gốc: TOÀN CẢNH mặt ngoài ngôi nhà hoang rậm rạp. Video đi đúng thứ tự: toàn cảnh → dọn bên ngoài → vào dọn bên trong → sơn sửa → lắp đèn, thiết bị → hoàn thiện: quay bên trong nhà mới xong rồi cắt ra toàn cảnh bên ngoài như nhà mới.', person: false, personDefault: WORKER, forceVaried: true,
      place: 'an old abandoned house with its overgrown yard, seen from outside first and later from inside', placeholder: 'Ví dụ: nhà gạch hai tầng bỏ hoang trên đồi, cỏ cao quá đầu, dây leo phủ kín tường, cửa sổ vỡ',
      base: 'tall weeds and vines covering the walls and the whole yard, broken windows, peeling paint, a collapsed fence, junk and trash everywhere',
      steps: [
        ['Toàn cảnh nhà hoang', 'the whole abandoned house stands overgrown with tall weeds, vines and trash while the wind moves the grass; the person arrives at the gate carrying tools and looks at the house'],
        ['Phát quang cỏ dại', 'the tall weeds, vines and bushes around the house are cut down and cleared away until the walls and the ground are visible'],
        ['Dọn rác ngoài sân', 'junk, trash and fallen branches in the yard are collected and hauled away, and the yard is raked clean'],
        ['Rửa tường ngoài', 'the dirty outer walls and the front door area are pressure-washed, the moss, dirt and stains wash away'],
        ['Vào nhà', 'the person opens the front door and walks in; then the view changes with a clean cut to a fixed angle inside that shows the dusty, dirty interior with cobwebs, trash and broken furniture'],
        ['Dọn rác trong nhà', 'inside the house the big trash, broken furniture and debris are carried out and loaded into bags and a wheelbarrow'],
        ['Quét bụi, mạng nhện', 'inside the house the dust, cobwebs and loose dirt are swept and vacuumed away'],
        ['Rửa sàn, tường trong', 'inside the house the walls and the floor are scrubbed clean, the dirty stains fade away'],
        ['Gỡ đồ hỏng', 'inside the house rotten wood, broken fixtures and old peeling wallpaper are torn out and removed'],
        ['Vá tường, trần', 'inside the house the holes and cracks in the walls and the ceiling are filled with plaster and smoothed flat'],
        ['Chà nhám', 'inside the house the patched walls are sanded smooth and the dust is wiped off'],
        ['Sơn lót', 'inside the house the walls and the ceiling are rolled with white primer'],
        ['Sơn màu', 'inside the house the walls are painted with two clean coats of a fresh, warm light color'],
        ['Lát sàn mới', 'inside the house new flooring is laid plank by plank until the whole floor is covered'],
        ['Lắp cửa sổ, cửa', 'new clean windows and new doors are fitted and sealed'],
        ['Lắp điện, bóng đèn', 'new wiring, switches, sockets, light bulbs and light fixtures are installed and the lights are switched on'],
        ['Lắp bếp, vòi nước, tủ', 'a kitchen counter, a sink with a tap, shelves and cabinets are installed and fixed in place'],
        ['Đặt nội thất, trang trí', 'furniture is carried in and placed: a sofa, a table, chairs and a rug, then curtains, plants and pictures are added'],
        ['Sơn ngoài, sân vườn', 'the person goes outside and the outer walls are painted fresh, the fence is rebuilt, a path is laid and fresh lawn and flowers are planted'],
        ['Nhà mới · bên trong', 'the person walks in through the new front door; then the view changes with a clean cut to a fixed angle inside that shows the finished, furnished room, spotless and brand new, with the warm lights on, while the person stands in the room, looks around and nods with satisfaction'],
        ['Hoàn thiện như nhà mới', 'a wide shot from far outside shows the whole house, now repaired, freshly painted, with a tidy garden and warm lights glowing inside through the windows, looking brand new, while the person stands by the gate and looks at the finished house']
      ]
    },
    {
      id: 'house_in', label: 'Dọn nhà bỏ hoang · bên trong', hint: 'Ảnh gốc: toàn cảnh một căn phòng cần dọn.', person: false, personDefault: WORKER,
      place: 'an abandoned room inside an old house', placeholder: 'Ví dụ: phòng khách nhà gạch cũ, tường bong tróc, cửa sổ kính vỡ',
      base: 'peeling paint, thick dust and cobwebs, scattered trash, broken old furniture, a dirty floor and grimy windows',
      steps: [
        ['Dọn rác lớn', 'the big trash, broken furniture and debris are carried out and loaded into bags and a wheelbarrow'],
        ['Quét bụi, mạng nhện', 'the dust, cobwebs and loose dirt are swept and vacuumed away'],
        ['Rửa tường, sàn', 'the walls and the floor are scrubbed and pressure-washed clean, the dirty stains fade away'],
        ['Gỡ đồ hỏng', 'rotten wood, broken fixtures and old peeling wallpaper are torn out and removed'],
        ['Vá tường, trần', 'holes and cracks in the walls and the ceiling are filled with plaster and smoothed flat'],
        ['Chà nhám', 'the patched walls are sanded smooth and the dust is wiped off'],
        ['Sơn lót', 'the walls and the ceiling are rolled with white primer'],
        ['Sơn màu', 'the walls are painted with two clean coats of a fresh, warm light color'],
        ['Lát sàn mới', 'new flooring is laid plank by plank until the whole floor is covered'],
        ['Lắp cửa sổ', 'new clean windows and a new door frame are fitted and sealed'],
        ['Lắp đèn, điện', 'new light fixtures and switches are installed and the lights are switched on'],
        ['Lắp kệ, tủ', 'built-in shelves and cabinets are installed and fixed to the wall'],
        ['Đặt nội thất', 'furniture is carried in and placed: a sofa, a table, chairs and a rug'],
        ['Rèm, cây, tranh', 'curtains, plants, pictures and small decorations are added'],
        ['Hoàn thiện', 'the last cleaning touches; the room is spotless, warmly lit and looks brand new and lived-in']
      ]
    },
    {
      id: 'house_out', label: 'Dọn nhà bỏ hoang · bên ngoài', hint: 'Ảnh gốc: mặt tiền nhà chụp toàn cảnh.', person: false, personDefault: WORKER,
      place: 'an abandoned house seen from outside', placeholder: 'Ví dụ: nhà hai tầng bỏ hoang giữa đồi cỏ, tường phủ dây leo',
      base: 'weeds and vines covering the walls, broken windows, peeling paint, a collapsed fence and junk in the yard',
      steps: [
        ['Phát quang cỏ dại', 'tall weeds, vines and bushes are cut down and cleared away with tools'],
        ['Dọn rác sân', 'junk and trash in the yard are collected and hauled away'],
        ['Rửa tường ngoài', 'the dirty facade is pressure-washed, the moss and stains wash away'],
        ['Gỡ cửa hỏng', 'broken windows, rotten shutters and the old door are removed'],
        ['Sửa mái', 'the damaged roof sections are repaired and missing tiles are replaced'],
        ['Vá tường', 'cracks and damaged plaster on the facade are patched and smoothed'],
        ['Sơn lót tường', 'the facade is rolled with primer'],
        ['Sơn tường ngoài', 'the facade is painted in a fresh clean color'],
        ['Lắp cửa mới', 'new windows and a new front door are installed'],
        ['Dựng hàng rào', 'the fence is rebuilt and painted'],
        ['Lát lối đi', 'a clean path is laid from the gate to the front door'],
        ['Trồng cỏ, cây', 'fresh lawn is rolled out and shrubs and flowers are planted'],
        ['Lắp đèn', 'outdoor lamps and porch lights are installed'],
        ['Trang trí cổng', 'a mailbox, a door mat and potted plants are added at the entrance'],
        ['Hoàn thiện', 'the house looks brand new, the garden is tidy and the lights are on at golden hour']
      ]
    },
    {
      id: 'yard', label: 'Sân vườn hoang thành vườn đẹp', hint: 'Ảnh gốc: khu vườn chụp toàn cảnh.', person: false, personDefault: WORKER,
      place: 'a neglected backyard garden', placeholder: 'Ví dụ: vườn sau nhà cỏ mọc cao, đất bùn, chậu vỡ',
      base: 'tall weeds, dead plants, broken pots, trash and bare muddy ground',
      steps: [
        ['Cắt cỏ dại', 'the tall weeds are cut down and raked away'],
        ['Dọn cây chết, rác', 'dead plants, broken pots and trash are removed'],
        ['Cuốc xới đất', 'the soil is dug over and loosened'],
        ['San phẳng, thêm đất', 'the ground is leveled and fresh dark soil is spread'],
        ['Lát lối đi đá', 'a stepping-stone path is laid across the garden'],
        ['Làm luống, viền', 'wooden raised beds and edging are built'],
        ['Trải thảm cỏ', 'rolls of fresh turf are laid on the lawn area'],
        ['Trồng cây lớn', 'young trees are planted and staked'],
        ['Trồng bụi cây', 'shrubs and hedges are planted along the edges'],
        ['Trồng hoa', 'colorful flowers are planted in the beds'],
        ['Phủ mùn', 'mulch is spread around the plants'],
        ['Lắp tưới nước', 'a watering system is set up and sprinkles water over the garden'],
        ['Đặt bàn ghế', 'a garden table and chairs are placed on the lawn'],
        ['Lắp đèn vườn', 'small garden lights are installed along the path'],
        ['Hoàn thiện', 'the garden is lush, green and in bloom in warm afternoon light']
      ]
    },
    {
      id: 'car', label: 'Phục hồi xe cũ', hint: 'Ảnh gốc: chiếc xe chụp toàn cảnh.', person: false, personDefault: WORKER,
      place: 'an old neglected car parked outdoors', placeholder: 'Ví dụ: xe Jeep cổ rỉ sét đỗ ngoài trời, lốp xẹp, kính bẩn',
      base: 'faded and rusty paint, flat tires, dirty broken windows and a dusty interior',
      steps: [
        ['Phủi bụi, lá', 'dust, dry leaves and dirt are brushed and blown off the car'],
        ['Rửa xe', 'the car is washed with a pressure washer, the grime runs off'],
        ['Tháo bánh', 'the old flat wheels are taken off and the car is lifted on stands'],
        ['Mài gỉ', 'the rust is ground off the body panels with a sander'],
        ['Làm phẳng móp', 'dents are filled with putty and sanded smooth'],
        ['Sơn lót', 'the whole body is sprayed with grey primer'],
        ['Sơn màu', 'the body is sprayed with fresh glossy paint'],
        ['Sơn bóng, đánh bóng', 'clear coat is sprayed and the paint is polished to a mirror shine'],
        ['Lắp viền crôm', 'new chrome trim and bumpers are fitted'],
        ['Lắp kính mới', 'new clean glass is installed in the windows'],
        ['Lắp đèn pha', 'new headlights and tail lights are installed'],
        ['Lắp bánh mới', 'new wheels with new tires are mounted and the car is lowered to the ground'],
        ['Làm lại nội thất', 'the interior is restored with clean seats and a new dashboard'],
        ['Đánh bóng lần cuối', 'the car is hand-waxed and wiped until it shines'],
        ['Hoàn thiện', 'the restored car looks showroom-new and gleams in warm daylight']
      ]
    },
    {
      id: 'shelter', label: 'Sinh tồn · dựng lều trú trong rừng', hint: 'Ảnh gốc: một khoảng đất trống trong rừng, chụp toàn cảnh.', person: true, personDefault: SURVIVOR,
      place: 'a quiet forest clearing', placeholder: 'Ví dụ: bãi đất trống trong rừng thông, đất khô, vài cành rơi',
      base: 'bare ground, a few fallen branches and tall trees around',
      steps: [
        ['Chọn chỗ, dọn đất', 'clears the leaves and stones from a flat patch of ground by hand'],
        ['Chặt cành dài', 'cuts long straight poles and branches with a bushcraft knife and a small saw'],
        ['Dựng sống mái', 'sets up the ridge pole on two forked supports at a low height'],
        ['Dựa sườn', 'leans many long branches along both sides of the ridge pole to form the ribs'],
        ['Buộc dây', 'lashes the frame together with natural cord at the joints'],
        ['Phủ cành nhỏ', 'covers the ribs with a lattice of small branches'],
        ['Phủ lá dày', 'piles a thick layer of dry leaves and ferns over the whole shelter'],
        ['Đắp đất, rêu', 'packs soil and moss over the leaves for insulation'],
        ['Làm giường lá', 'builds a raised bed of dry leaves and pine needles inside'],
        ['Làm cửa che', 'builds a small woven door of branches for the entrance'],
        ['Chẻ củi', 'splits logs and stacks the firewood beside the shelter'],
        ['Đào bếp lửa', 'digs a fire pit and rings it with stones in front of the shelter'],
        ['Nhóm lửa', 'lights a fire with a ferro rod and the flames grow'],
        ['Lấy nước', 'sets a pot of water over the fire to boil'],
        ['Hoàn thiện', 'sits relaxed at the finished shelter at dusk with the fire glowing']
      ]
    },
    {
      id: 'cabin', label: 'Sinh tồn · dựng nhà gỗ bằng tay', hint: 'Ảnh gốc: một khoảng đất trống có sẵn khúc gỗ, chụp toàn cảnh.', person: true, personDefault: SURVIVOR,
      place: 'a flat forest clearing with cut logs piled aside', placeholder: 'Ví dụ: bãi đất phẳng bên suối, có đống khúc gỗ',
      base: 'flat bare ground, a pile of cut logs, tall trees around',
      steps: [
        ['San nền', 'levels the ground with a shovel and a rake'],
        ['Đặt móng đá', 'places flat stones at the four corners as the foundation'],
        ['Xếp khúc gỗ đầu', 'lays the first round logs on the foundation and checks them level'],
        ['Dựng tường', 'stacks logs on top of each other and notches the corners so they interlock'],
        ['Chừa cửa', 'cuts the opening for the doorway as the walls rise'],
        ['Dựng tường cao', 'raises the walls higher with more logs lifted into place'],
        ['Làm xà mái', 'lifts the roof beams and ridge pole into place'],
        ['Lợp ván mái', 'nails wooden boards across the roof frame'],
        ['Trét kẽ hở', 'fills the gaps between the logs with clay and moss'],
        ['Lắp cửa sổ', 'fits a small wooden window frame in the wall'],
        ['Lắp cửa chính', 'hangs a wooden door on hinges'],
        ['Lát sàn', 'lays wooden planks for the floor'],
        ['Xây bếp, ống khói', 'builds a small stone stove with a chimney pipe'],
        ['Đặt giường, bàn', 'carries in a wooden bed and a table'],
        ['Hoàn thiện', 'stands proudly in front of the finished log cabin as smoke rises from the chimney at dusk']
      ]
    },
    {
      id: 'bunker', label: 'Sinh tồn · đào hầm ở dưới đất', hint: 'Ảnh gốc: sườn đồi / bãi đất trong rừng, chụp toàn cảnh.', person: true, personDefault: SURVIVOR,
      place: 'a sloped forest hillside with soil and roots', placeholder: 'Ví dụ: sườn đồi đất đỏ, rễ cây lộ ra',
      base: 'bare soil, roots and a few rocks on a gentle slope',
      steps: [
        ['Chọn chỗ, đánh dấu', 'marks the outline of the shelter on the slope with a stick'],
        ['Đào hố', 'digs into the slope with a shovel and throws the soil aside'],
        ['Đào sâu', 'keeps digging deeper and carries the soil away in a bucket'],
        ['Mở rộng hầm', 'widens the pit into a room-sized hollow'],
        ['Gia cố vách', 'lines the walls with wooden logs and stakes'],
        ['Làm khung mái', 'lays strong logs across the top as the roof frame'],
        ['Phủ bạt chống nước', 'covers the roof frame with a waterproof tarp'],
        ['Phủ đất lên mái', 'shovels soil and turf over the roof until it blends into the hillside'],
        ['Làm bậc thang', 'cuts and reinforces steps down to the entrance'],
        ['Làm cửa gỗ', 'builds and hangs a sturdy wooden door'],
        ['Đặt ống thông gió', 'sets a ventilation pipe through the roof'],
        ['Lát sàn', 'lays wooden boards on the floor inside'],
        ['Làm giường, kệ', 'builds a bed frame and a shelf inside'],
        ['Làm bếp, ống khói', 'builds a small clay stove with a chimney'],
        ['Hoàn thiện', 'sits inside the finished underground shelter lit by a warm lantern and the stove glow']
      ]
    },
    {
      id: 'custom', label: 'Chủ đề khác (tự nhập)', hint: 'Tự ghi nơi chốn và các bước (mỗi dòng một bước).', person: false, personDefault: WORKER,
      place: 'the location in the attached photo', placeholder: 'Ví dụ: hồ bơi bỏ hoang nước xanh rêu',
      base: 'in its original neglected condition', steps: []
    }
  ];
  // Tiếng Anh cho giao diện / tiêu đề thẻ cảnh khi app đang ở English (prompt gửi Muse luôn bằng tiếng Anh).
  const EN = {
    house_full: { label: 'Abandoned house · the whole house (outside → inside → finished)', hint: 'Start photo: a WIDE view of the overgrown outside of the abandoned house. The video follows the real order: wide view → clean outside → go in and clean inside → repairs and paint → lights and fittings → finished: the new inside, then a cut to a wide shot of the outside, like new.', placeholder: 'e.g. two-story brick house on a hill, grass taller than a person, vines over the walls, broken windows',
      titles: ['Abandoned house overview', 'Cut the weeds', 'Clear yard trash', 'Wash outer walls', 'Walk inside', 'Haul out trash', 'Sweep dust and cobwebs', 'Scrub walls and floor', 'Tear out damaged parts', 'Patch walls and ceiling', 'Sand smooth', 'Prime the walls', 'Paint the walls', 'Lay new flooring', 'Fit windows and doors', 'Install wiring and lights', 'Install kitchen and fittings', 'Furnish and decorate', 'Paint outside and garden', 'Finished inside', 'Finished like new'] },
    house_in: { label: 'Abandoned house cleanup · inside', hint: 'Start photo: a wide view of the room to clean.', placeholder: 'e.g. living room of an old brick house, peeling paint, broken window glass',
      titles: ['Haul out big trash', 'Sweep dust and cobwebs', 'Scrub walls and floor', 'Tear out damaged parts', 'Patch walls and ceiling', 'Sand smooth', 'Prime the walls', 'Paint the walls', 'Lay new flooring', 'Fit new windows', 'Install lights', 'Install shelves', 'Place furniture', 'Add curtains and decor', 'Finished room'] },
    house_out: { label: 'Abandoned house cleanup · outside', hint: 'Start photo: the front of the house as a wide view.', placeholder: 'e.g. abandoned two-story house on a grassy hill, walls covered in vines',
      titles: ['Clear weeds', 'Clear yard trash', 'Wash the facade', 'Remove broken doors', 'Repair the roof', 'Patch the walls', 'Prime the facade', 'Paint the facade', 'Install new doors', 'Rebuild the fence', 'Lay the path', 'Plant lawn and shrubs', 'Install outdoor lights', 'Decorate the entrance', 'Finished house'] },
    yard: { label: 'Overgrown yard to beautiful garden', hint: 'Start photo: the garden as a wide view.', placeholder: 'e.g. backyard with tall weeds, muddy ground and broken pots',
      titles: ['Cut the weeds', 'Clear dead plants', 'Dig the soil', 'Level and add soil', 'Lay stone path', 'Build raised beds', 'Roll out turf', 'Plant trees', 'Plant shrubs', 'Plant flowers', 'Spread mulch', 'Set up watering', 'Place garden furniture', 'Install garden lights', 'Finished garden'] },
    car: { label: 'Old car restoration', hint: 'Start photo: the car as a wide view.', placeholder: 'e.g. rusty vintage Jeep parked outdoors, flat tires, dirty windows',
      titles: ['Brush off dust', 'Wash the car', 'Remove the wheels', 'Grind off rust', 'Fill the dents', 'Prime the body', 'Paint the body', 'Clear coat and polish', 'Fit chrome trim', 'Fit new glass', 'Fit headlights', 'Mount new wheels', 'Restore the interior', 'Final wax', 'Finished car'] },
    shelter: { label: 'Survival · build a forest shelter', hint: 'Start photo: an empty patch of forest, filmed as a wide view.', placeholder: 'e.g. clearing in a pine forest, dry ground, a few fallen branches',
      titles: ['Clear the ground', 'Cut long poles', 'Set the ridge pole', 'Lean the ribs', 'Lash the frame', 'Add small branches', 'Pile on leaves', 'Pack soil and moss', 'Build the leaf bed', 'Make the door', 'Split firewood', 'Dig the fire pit', 'Light the fire', 'Boil water', 'Shelter at dusk'] },
    cabin: { label: 'Survival · build a log cabin', hint: 'Start photo: a flat clearing with cut logs, filmed as a wide view.', placeholder: 'e.g. flat ground by a stream, a pile of cut logs',
      titles: ['Level the ground', 'Set stone foundation', 'Lay first logs', 'Raise the walls', 'Cut the doorway', 'Raise walls higher', 'Set roof beams', 'Board the roof', 'Seal the gaps', 'Fit the window', 'Hang the door', 'Lay the floor', 'Build the stove', 'Add bed and table', 'Finished cabin'] },
    bunker: { label: 'Survival · dig an underground shelter', hint: 'Start photo: a forest slope or clearing, filmed as a wide view.', placeholder: 'e.g. red-soil hillside with exposed roots',
      titles: ['Mark the spot', 'Dig the pit', 'Dig deeper', 'Widen the room', 'Reinforce the walls', 'Build roof frame', 'Lay waterproof tarp', 'Cover with soil', 'Cut the steps', 'Build the door', 'Add ventilation', 'Lay the floor', 'Build bed and shelf', 'Build clay stove', 'Shelter finished'] },
    custom: { label: 'Other topic (type your own)', hint: 'Write the place and the steps yourself (one step per line).', placeholder: 'e.g. abandoned swimming pool with green water', titles: [] }
  };
  const text = (theme, lang) => {
    const t = typeof theme === 'string' ? themeOf(theme) : theme, en = EN[t.id] || {};
    return lang === 'en' ? { label: en.label || t.label, hint: en.hint || t.hint, placeholder: en.placeholder || t.placeholder } : { label: t.label, hint: t.hint, placeholder: t.placeholder };
  };
  const themeOf = id => THEMES.find(t => t.id === id) || THEMES[0];
  const clean = (v, max) => String(v == null ? '' : v).replace(/[\u0000-\u001f]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, max);

  function options(input = {}) {
    const theme = themeOf(input.theme);
    const minutes = MINUTES.includes(Number(input.minutes)) ? Number(input.minutes) : 2;
    const seconds = SECONDS.includes(Number(input.seconds)) ? Number(input.seconds) : 8;
    const provider = input.provider === 'flow' ? 'flow' : 'muse';   // flow = Google Flow (Veo 3.1): mỗi clip đúng 8 giây
    const person = theme.person ? true : input.person !== false;      // luôn có người làm việc (mặc định bật; sinh tồn không tắt được), nếu không việc dọn tự xảy ra nhìn rất giả
    const custom = String(input.customSteps == null ? '' : input.customSteps).split(/\r?\n/).map(s => clean(s, 200)).filter(Boolean).slice(0, MAX_CUSTOM);
    return {
      theme: theme.id,
      name: clean(input.name, 80),
      place: clean(input.place, 300),
      provider, minutes, seconds: provider === 'flow' ? 8 : minutes >= LONG_MINUTES ? MAX_SECONDS : Math.min(MAX_SECONDS, seconds),
      aspect: ASPECTS.includes(input.aspect) ? input.aspect : '16:9',
      person, who: WHO.includes(input.who) ? input.who : 'female', personDesc: clean(input.personDesc, 300) || personFor(theme, WHO.includes(input.who) ? input.who : 'female'),
      lang: input.lang === 'en' ? 'en' : 'vi',
      light: clean(input.light, 200) || DEFAULT_LIGHT,
      anchor: Boolean(input.anchor),
      parallel: input.parallel === 'auto' || input.parallel == null || input.parallel === '' ? 0 : Math.max(1, Math.min(MAX_PARALLEL, Math.round(Number(input.parallel)) || 1)),   // 0 = tự động theo số tài khoản
      camera: !theme.forceVaried && input.camera === 'fixed' ? 'fixed' : 'varied',   // nhà đi từ ngoài vào trong thì không thể cố định một góc      // xen kẽ cảnh xa / vừa / gần (như video làm nhà thật) hoặc một góc cố định
      faceless: Boolean(input.faceless),                 // mặc định CÓ mặt (như video mẫu); bật «không lộ mặt» thì Muse ít từ chối hơn và người ít bị lệch
      customSteps: custom
    };
  }

  // Số cảnh = số phút ÷ số giây mỗi cảnh (làm tròn lên, tối thiểu 2).
  const clipCount = config => Math.max(2, Math.min(config.provider === 'flow' ? MAX_CLIPS_FLOW : MAX_CLIPS, Math.ceil(config.minutes * 60 / config.seconds)));

  // Chia việc cho từng cảnh. Chủ đề có sẵn có 15 việc nối tiếp: ít cảnh hơn thì chọn đều (luôn có việc đầu và việc cuối), nhiều cảnh hơn thì mỗi việc kéo dài qua vài cảnh liên tiếp
  // («phần 2/3»: tiếp tục chính việc đó). Chủ đề tự nhập: dùng các dòng người dùng ghi (nếu có), không thì mỗi cảnh là một mức hoàn thành cao hơn của cả công trình.
  function stepsOf(config) {
    const theme = themeOf(config.theme), n = clipCount(config), en = config.lang === 'en';
    let list;
    if (theme.id === 'custom' && !config.customSteps.length) {
      return Array.from({ length: n }, (_, i) => {
        const pct = Math.round(100 * (i + 1) / n);
        return { vi: `Giai đoạn ${i + 1}`, title: en ? `Stage ${i + 1}` : `Giai đoạn ${i + 1}`, index: i, step: i + 1, steps: n, part: 1, parts: 1,
          en: i + 1 === n ? 'the work is finished: the whole project is completed and looks perfect' : `the work on the project continues with clearly visible progress, the project is about ${pct}% complete at the end of this clip` };
      });
    }
    if (theme.id === 'custom') list = config.customSteps.map(t => ({ vi: t.length > 40 ? t.slice(0, 38) + '…' : t, en: t, title: t.length > 40 ? t.slice(0, 38) + '…' : t }));
    else {
      const titles = (EN[theme.id] || {}).titles || [];
      list = theme.steps.map((st, i) => ({ vi: st[0], en: st[1], title: en && titles[i] ? titles[i] : st[0] }));
    }
    const S = list.length, out = [];
    if (n <= S) {
      const picked = n === S ? list.map((_, i) => i) : Array.from({ length: n }, (_, i) => Math.round(i * (S - 1) / (n - 1)));
      picked.forEach((idx, i) => out.push({ ...list[idx], index: i, step: idx + 1, steps: S, part: 1, parts: 1 }));
    } else {
      // n > S: mỗi việc nhận từ floor(n/S) đến ceil(n/S) cảnh; phần dư rải đều.
      let used = 0;
      list.forEach((st, k) => {
        const upto = Math.round((k + 1) * n / S), parts = upto - used;
        for (let p = 1; p <= parts; p++) out.push({ ...st, title: parts > 1 ? `${st.title} (${p}/${parts})` : st.title, index: used + p - 1, step: k + 1, steps: S, part: p, parts });
        used = upto;
      });
    }
    return out;
  }

  const RATIO = { '16:9': 'Horizontal 16:9 widescreen video.', '9:16': 'Vertical 9:16 portrait video (full-screen phone video).', '1:1': 'Square 1:1 video.' };
  const IMG_RATIO = { '16:9': 'Horizontal 16:9 widescreen image.', '9:16': 'Vertical 9:16 portrait image (full-screen phone photo).', '1:1': 'Square 1:1 image.' };

  function placeOf(config) { return config.place || themeOf(config.theme).place; }

  // «Sổ cảnh» lặp NGUYÊN VĂN trong mọi prompt: địa điểm, kiểu máy quay, ánh sáng, người (nếu có) → giữ đồng nhất, trông như một lần quay.
  function sceneBible(config) {
    const lines = [
      `SCENE (identical in every clip): ${placeOf(config)}.`,
      config.camera === 'fixed'
        ? 'Camera: one fixed camera on a tripod, same position, same height, same angle and same lens in every clip; no zoom, no pan, no tilt, no cuts, no camera shake.'
        : 'Camera: a still, tripod-mounted real camera like a time-lapse cleanup video: a WIDE, distant shot outside and ONE fixed angle inside that shows the action clearly; the camera never moves during a shot, and a change of angle is always a clean, clearly visible cut, never a pan or a zoom; never a push-in, never a face close-up, no handheld wobble, no shaking; the place, the lighting and the lens look stay identical.',
      `Light: ${config.light}.`,
      'Look: real-life footage filmed with a camera, photorealistic, natural colors, real textures and real materials; not animation, not cartoon, not CGI, not a painting, not an illustration.',
      'Quality: sharp, crisp, high-detail, clean and stable image; no blur, no flicker, no distortion, and no morphing of the building, the objects or the person.',
      LOCKED
    ];
    if (config.person) {
      lines.push(`PERSON (the same single person in every clip, same hair, body and clothes${config.faceless ? '' : ', same face and facial features'}): ${config.personDesc}.`);
      if (!config.faceless) lines.push('The face is clearly visible and looks natural, ordinary and realistic, and stays exactly the same person in every clip.');
      if (config.faceless) lines.push(FACELESS);
    }
    lines.push(SAFE_PEOPLE);
    return lines.join('\n');
  }

  function baseImagePrompt(config) {
    const theme = themeOf(config.theme);
    const state = theme.id === 'custom' ? 'in its original neglected condition before any work starts' : `in its ORIGINAL condition before any work starts: ${theme.base}`;
    return [
      `Create a photorealistic photo: ${placeOf(config)}, ${state}.`,
      IMG_RATIO[config.aspect],
      config.person ? `${config.personDesc[0].toUpperCase()}${config.personDesc.slice(1)} stands in the scene, ready to start the work, ${config.faceless ? 'seen from behind' : 'seen clearly'}.` : '',
      config.person && config.faceless ? FACELESS : '',
      SAFE_PEOPLE_IMAGE,
      'Fixed eye-level camera view that shows the whole place clearly, wide enough to see all the work that will happen here.',
      `Light: ${config.light}.`,
      'Sharp, crisp, high-detail photograph look, natural colors and real textures; not animation, not a painting, not CGI.',
      'No text, lettering, numbers, logos, watermarks or captions in the image.'
    ].filter(Boolean).join('\n');
  }

  // Máy quay ĐỨNG YÊN như video làm nhà thật (máy dựng chân / time-lapse): ngoài trời thì CẢNH RỘNG quay từ xa; trong nhà thì GIỮ MỘT GÓC CỐ ĐỊNH để thấy rõ hành động.
  // Máy không bao giờ chuyển động trong một cảnh quay (không zoom, lia, đẩy vào, cận mặt). Đổi góc (vào nhà, ra ngoài, sang chỗ làm khác trong phòng) là một cú CẮT sạch, thấy rõ.
  function placesOf(config) {                            // 'out' | 'in' cho từng bước (số bước bắt đầu từ 1)
    const theme = themeOf(config.theme);
    if (theme.id === 'house_in') return () => 'in';
    if (theme.id === 'house_full') {
      const states = []; let now = 'out';
      theme.steps.forEach((st, i) => { if (/walks in\b/.test(st[1])) now = 'in'; else if (/goes outside|from far outside|from outside/.test(st[1])) now = 'out'; states[i + 1] = now; });
      return n => states[n] || 'out';
    }
    if (theme.id === 'custom') { const list = config.customSteps || []; return n => /\b(inside|indoor|in the room|kitchen|bathroom|bedroom|living room|interior)\b/i.test(list[n - 1] || '') ? 'in' : 'out'; }
    return () => 'out';
  }
  const SHOT_OUT = 'a WIDE, distant shot filmed from far away that shows the whole place and the person at work in it; the person is small in the frame but every action is readable';
  const SHOT_IN = 'ONE fixed angle chosen so the whole action is clearly visible: the person and the work area are both fully in frame, a medium-wide view, never an extreme close-up';
  const HOLD = 'The camera never moves during a shot: no zoom, no push-in, no pull-out, no pan, no tilt, no orbit, no searching or sweeping movement, no camera move toward the person\'s face, and never a face close-up.';
  function shotLines(config, step, number, total) {
    if (config.camera === 'fixed') return [];
    const where = placesOf(config), here = where(step.step), before = step.step > 1 ? where(step.step - 1) : here;
    const view = here === 'in' ? SHOT_IN : SHOT_OUT;
    if (number === 1) return [`SHOT: keep exactly the framing of the attached frame (${view}). ${HOLD}`];
    if (step.part <= 1 && here !== before) return [`SHOT: a clean, clearly visible cut in the first second to the new camera angle: ${view}. After the cut the camera is completely still, locked on a tripod, for the rest of the clip. ${HOLD}`];
    if (step.part <= 1 && here === 'in') return [`SHOT: keep the angle of the attached frame (${view}). If this work happens in a different part of the room than in the attached frame, make ONE clear, clean cut in the first second to a new fixed angle that shows this work fully, then the camera is completely still for the rest of the clip. ${HOLD}`];
    return [`SHOT: the camera is completely still, locked on a tripod, keeping exactly the framing of the attached frame (same position, angle and distance) for the whole clip. ${HOLD}`];
  }

  // Sức lực và cảm xúc: người làm việc nặng phải thở mạnh, đổ mồ hôi, mệt dần theo thời gian; biểu cảm thể hiện bằng nét mặt và dáng người trong khung vừa / xa, KHÔNG bằng cách quay cận mặt.
  const HEAVY = /\b(cut down|cleared|clears|hauled|carried|carries|carry|pressure-wash\w*|torn out|tear|removed|dig|digs|dug|shovel|throws|sanded|ground off|scrubbed|lifted|lifts|saw|splits|stacks|raises|levels|loaded|chop\w*|drag\w*|wheelbarrow|rak(?:e|ed)|swept|rebuilt|piles|packs|cuts)\b/i;
  const LIGHT = /(curtains|pictures|decorations|lights are switched on|lights the|sits|stands|relaxed|looks brand new|looks showroom|mailbox|door mat|outdoor lamps|garden lights|lush|spotless)/i;
  // Lau mồ hôi chỉ LÂU LÂU (khoảng 1 clip trong 6, không bao giờ ở clip 1-2); các clip còn lại người làm cứ làm liên tục, mồ hôi chỉ thấy trên mặt và áo.
  const wipesIn = number => number > 2 && number % 6 === 3;
  function effortLines(config, step, number, total) {
    if (!config.person) return [];
    const heavy = HEAVY.test(step.en || ''), light = !heavy && LIGHT.test(step.en || '');
    const r = number / Math.max(1, total), wipe = wipesIn(number);
    const rest = wipe
      ? ' Once, in the middle of the clip, the person pauses for a moment to wipe the sweat from the face with the forearm and catch their breath, then goes straight back to work.'
      : ' The person keeps working without stopping the whole clip: no wiping the face, no pausing to rest.';
    const work = heavy
      ? `This is HARD physical labour: the person strains visibly, muscles tense, jaw clenched, frowning with effort, breathing heavily, sweat running down the forehead and neck, shirt dark with sweat, dirty sweaty hands.${rest}`
      : light
        ? 'The person works calmly and carefully with a relaxed, pleased expression, still a little sweaty and tired from the long work, with a small satisfied smile when the result looks good.'
        : `The person works steadily with a focused, serious face, sweat on the forehead, breathing a little heavily.${rest}`;
    const tired = r < 0.25 ? 'The job has just started: the person is fresh but already starting to sweat.'
      : r < 0.6 ? 'Several hours into the job: hair damp, shirt dark with sweat, clearly warm and breathing hard between actions.'
      : r < 0.9 ? `Many hours into the job: soaked in sweat, dirty and visibly tired, slower breaths${wipe ? ', rubbing the sore back or shoulder for a moment' : ''}, but pushing on.`
      : 'The job is almost done: exhausted and soaked in sweat but proud, with a tired relieved smile when looking at the result.';
    const how = config.faceless
      ? `Show the effort and the tiredness with the body only: heaving breath, sweat-dark back and shirt, slumped shoulders${wipe ? ', wiping the neck once' : ''}.`
      : 'Show real human emotion in the face and the body, clearly visible in the medium or wide view (effort, tiredness, relief), and never by moving the camera to the face.';
    return [`Emotion and effort (the person is a real tired human, never a calm robot): ${work} ${tired} ${how}`];
  }

  // Đồ cầm trên tay: AI hay «đổi đồ» giữa chừng (đang cầm chổi thì thành xẻng, tay tự mọc thêm đồ). Mỗi cảnh chỉ cầm MỘT dụng cụ đúng việc, giữ nguyên cả clip;
  // sang bước mới thì đặt dụng cụ cũ xuống thấy rõ rồi nhặt dụng cụ mới lên, không đổi tức thì.
  const ITEMS = 'Hand items: the person holds ONLY the one tool or item that this step needs, and it is the same item for the entire clip. It never changes shape, size, color or type, never turns into another item, and no extra or new item ever appears in the hands (the other hand is empty or simply helps). The tool is clearly the right one for this job.';
  const SWAP = 'Changing tools: the person first puts the previous tool down in plain view (on the ground or on a table), then visibly picks up the tool that this step needs. A tool is never swapped, vanishing or appearing instantly or in the middle of a motion.';
  function itemLines(step, number) {
    const lines = [ITEMS];
    if (number > 1 && step.part <= 1 && step.step > 1) lines.push(SWAP);
    return lines;
  }
  function clipPrompt(config, step, number, total, { first = false } = {}) {
    const last = number === total;
    return [
      RATIO[config.aspect],
      `Create ${config.seconds === 8 ? 'an' : 'a'} ${config.seconds}-second FAST-MOTION real-life video of a person doing the work (real footage played sped-up, about 6x speed, like a viral cleanup and renovation time-lapse), aspect ratio ${config.aspect}, that starts EXACTLY from the attached image (it is the first frame of the video).`,
      `${step.parts > 1 ? `STEP ${step.step} of ${step.steps}, part ${step.part} of ${step.parts}` : `STEP ${step.step} of ${step.steps}`}: ${themeOf(config.theme).person ? 'the person ' + step.en : step.en + (config.person && !/\bthe person\b/.test(step.en) ? ' (done by the person in the scene)' : '')}.`,
      step.parts > 1 && step.part < step.parts
        ? 'Show this work being done FAST in one smooth continuous action with rapid, clearly visible progress, but do NOT finish this step yet: the person is still in the middle of the work at the end, and the next clip continues exactly this movement.'
        : `Show this work being done FAST in one smooth continuous action with rapid, clearly visible progress. By the end of the clip this step is clearly finished and the scene is ready for the next step.${last ? ' End with the finished result calm and still for the last second.' : ''}`,
      ...shotLines(config, step, number, total),
      sceneBible(config),
      ...effortLines(config, step, number, total),
      ...itemLines(step, number),
      'Pace: fast and energetic, as in a sped-up video; quick hands, quick steps, fast tool movements and rapid progress. Never slow motion, never slow or calm movement.',
      'Realism: it must look like a real person really doing this job. Natural human movement, real weight and real physics. Every change in the scene is made visibly by the person with their own hands and real tools; nothing ever changes by itself, by magic or by a cut.',
      'Continuity: the attached image shows the exact current state. Keep the same place, the same viewpoint, the same lighting and everything already done exactly as in the image. Do not add, remove, move or change anything except what this step does. Do not cut to another scene.',
      first ? '' : 'This clip continues directly from the previous clip without any jump: the person keeps the same pose, the same tool in the hands and the same movement as in the attached frame, and goes on working.',
      NO_SPEECH_FLOW,   // Muse và Flow đều xin tiếng động tự nhiên của công việc (chổi, nước, dụng cụ); không lời, không nhạc. Trước 1.9.1 Muse bị dặn «hoàn toàn im lặng» nên video ra không có âm thanh.
      'No text, captions, logos or watermarks in the video.'
    ].filter(Boolean).join('\n');
  }

  // ---- chặn người nổi tiếng / nhân vật có bản quyền trong chữ người dùng gõ (Muse từ chối rồi mất lượt). So khớp không phân biệt hoa thường và dấu tiếng Việt.
  const fold = t => String(t == null ? '' : t).normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/đ/g, 'd').replace(/Đ/g, 'D').toLowerCase();
  const NAMES = [
    // chính trị, lịch sử
    'trump', 'biden', 'obama', 'putin', 'xi jinping', 'tap can binh', 'zelensky', 'kim jong', 'macron', 'modi', 'netanyahu', 'merkel', 'clinton', 'hitler', 'stalin', 'lenin', 'napoleon', 'ho chi minh', 'bac ho', 'vo nguyen giap', 'tran hung dao', 'quang trung', 'jesus', 'einstein',
    // doanh nhân, nghệ sĩ, vận động viên, diễn viên
    'elon musk', 'jeff bezos', 'bill gates', 'mark zuckerberg', 'steve jobs', 'taylor swift', 'beyonce', 'rihanna', 'kanye', 'justin bieber', 'ariana grande', 'billie eilish', 'lady gaga', 'katy perry', 'eminem', 'michael jackson', 'elvis', 'marilyn monroe', 'messi', 'ronaldo', 'neymar', 'mbappe', 'haaland', 'lebron', 'kobe bryant', 'michael jordan', 'tiger woods', 'federer', 'nadal', 'djokovic', 'mike tyson', 'bruce lee', 'jackie chan', 'tom cruise', 'brad pitt', 'angelina jolie', 'leonardo dicaprio', 'johnny depp', 'robert downey', 'dwayne johnson', 'keanu reeves', 'will smith', 'morgan freeman', 'scarlett johansson', 'emma watson', 'zendaya', 'tom holland', 'kim kardashian', 'mrbeast', 'mr beast', 'pewdiepie', 'son tung', 'my tam', 'ngo kien huy', 'quang hai', 'cong phuong', 'tran thanh', 'truong giang', 'hoai linh', 'duc phuc', 'den vau', 'hieuthuhai',
    // nhân vật hoạt hình, phim, game
    'mickey', 'minnie', 'donald duck', 'goofy', 'winnie the pooh', 'pooh', 'elsa', 'moana', 'simba', 'lion king', 'mulan', 'aladdin', 'spider-man', 'spiderman', 'spider man', 'batman', 'superman', 'wonder woman', 'iron man', 'ironman', 'captain america', 'hulk', 'black panther', 'avengers', 'deadpool', 'wolverine', 'joker', 'harley quinn', 'star wars', 'darth vader', 'yoda', 'mandalorian', 'harry potter', 'hermione', 'voldemort', 'gandalf', 'frodo', 'lord of the rings', 'pikachu', 'pokemon', 'super mario', 'mario', 'luigi', 'sonic', 'zelda', 'kirby', 'peppa', 'spongebob', 'patrick star', 'doraemon', 'nobita', 'shinchan', 'shin-chan', 'naruto', 'sasuke', 'luffy', 'one piece', 'goku', 'dragon ball', 'sailor moon', 'totoro', 'ghibli', 'hello kitty', 'barbie', 'transformers', 'optimus prime', 'shrek', 'minion', 'minions', 'despicable me', 'toy story', 'buzz lightyear', 'lightning mcqueen', 'tom and jerry', 'bugs bunny', 'scooby', 'simpsons', 'homer simpson', 'rick and morty', 'squid game', 'james bond', 'indiana jones', 'terminator', 'rambo', 'john wick', 'ultraman', 'power rangers', 'gundam', 'paw patrol', 'bluey', 'cocomelon', 'baby shark', 'among us'
  ];
  const GENERIC = [
    'celebrity', 'celebrities', 'famous person', 'famous people', 'famous actor', 'famous singer', 'politician', 'footballer', 'lookalike', 'look-alike', 'look alike',
    'nguoi noi tieng', 'ngoi sao', 'dien vien', 'ca si', 'nghe si', 'cau thu', 'youtuber', 'tiktoker', 'chinh tri gia', 'tong thong', 'thu tuong', 'chu tich', 'nu hoang', 'hoang de', 'giao hoang',
    'president of', 'the president', 'prime minister'
  ];
  const escape = t => t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const WORDS = new RegExp('(^|[^a-z0-9])(' + [...NAMES, ...GENERIC].sort((a, b) => b.length - a.length).map(escape).join('|') + ')(?=$|[^a-z0-9])', 'g');
  const LIKE = /(looks?|looking|resembl\w*|same as|face of|portrait of|giong|y het|trong nhu)\s+(like\s+)?(a |an |the |mot |nhu )?(famous|celebrity|actor|actress|singer|star|politician|president|footballer|athlete|rapper|influencer|idol|dien vien|ca si|nguoi noi tieng|ngoi sao)/g;
  // Trả về các cụm bị vướng trong chữ (không lặp), ví dụ ['trump', 'pikachu'].
  function screenText(text) {
    const f = fold(text), found = new Set();
    for (const m of f.matchAll(WORDS)) found.add(m[2]);
    for (const m of f.matchAll(LIKE)) found.add(m[0].trim());
    return [...found].slice(0, 6);
  }
  function screenConfig(config) {
    const found = new Set();
    for (const t of [config.place, config.personDesc, config.light, ...(config.customSteps || [])]) for (const w of screenText(t)) found.add(w);
    return [...found].slice(0, 6);
  }

  function problems(config, { hasPhoto = false } = {}) {
    const out = [], en = config.lang === 'en';
    if (themeOf(config.theme).id === 'custom' && !hasPhoto && !config.place) out.push(en ? 'Custom topic: choose a photo or describe the place.' : 'Chủ đề tự nhập: chọn ảnh gốc hoặc mô tả nơi chốn.');
    if (config.person && config.who === 'photo' && config.personDesc === PHOTO_PERSON && !hasPhoto) out.push(en ? 'You chose “Same person as in the photo”: pick a photo that shows the person, or choose female / male.' : 'Bạn chọn «Giống người trong ảnh gốc»: hãy chọn ảnh có người đó, hoặc chọn Nữ / Nam.');
    const names = screenConfig(config);
    if (names.length) out.push(en
      ? `Your text names a famous person or a copyrighted character (“${names.join('”, “')}”). Muse refuses this and the attempt costs a credit. Remove the name and describe an anonymous person (age, hair, clothes).`
      : `Chữ bạn gõ có tên người nổi tiếng hoặc nhân vật có bản quyền («${names.join('», «')}»). Muse sẽ từ chối và mất lượt. Hãy xóa tên đó và mô tả người vô danh (tuổi, tóc, quần áo).`);
    return out;
  }

  const isPolicyError = text => POLICY_ERROR.test(String(text || ''));
  // Cảnh bị Muse chặn: thử lại y nguyên vẫn bị chặn nên đổi prompt. Lần 1: người nhỏ / quay từ sau lưng; từ lần 2: không có người nào trong hình.
  function safeRetryPrompt(prompt, attempt = 1, { image = false } = {}) {
    const kept = String(prompt || '').split('\n').filter(l => !l.startsWith('SAFETY REWRITE:')).join('\n').trim();
    const line = Number(attempt) >= 2
      ? (image ? 'SAFETY REWRITE: show only the place, with no person visible at all. No faces, no characters, no logos.' : SAFE_RETRY_2)
      : (image ? 'SAFETY REWRITE: any person is very small and far away or seen only from behind; no face, no resemblance to any real person.' : SAFE_RETRY_1);
    return kept + '\n' + line;
  }

  // Chia video thành các đoạn chạy SONG SONG (mỗi đoạn một chuỗi nối tiếp trên một tài khoản). Trả về chỉ số cảnh (từ 0) bắt đầu mỗi đoạn.
  // accounts = số tài khoản đang chạy song song; parallel = 0 (tự động) thì dùng hết số tài khoản.
  function segmentsOf(config, accounts = 1) {
    const n = clipCount(config), want = config.parallel || Math.max(1, Math.min(MAX_PARALLEL, Number(accounts) || 1));
    const count = Math.max(1, Math.min(want, MAX_PARALLEL, Math.floor(n / MIN_SEGMENT)));
    return Array.from({ length: count }, (_, i) => Math.round(i * n / count));
  }
  const seamsOf = (config, accounts = 1) => segmentsOf(config, accounts).slice(1);

  // Danh sách việc đầy đủ của chủ đề (để tả «đã xong những gì» cho ảnh mốc).
  function fullSteps(config) {
    if (Array.isArray(config.stepList)) return config.stepList.map(en => ({ en }));   // dựng lại từ prompt các cảnh đã có (chia lại truyện đang chạy)
    const theme = themeOf(config.theme);
    if (theme.id === 'custom') return config.customSteps.map(t => ({ en: t }));
    return theme.steps.map(st => ({ en: st[1] }));
  }
  // Ảnh MỐC đầu mỗi đoạn song song: chỉnh từ ảnh gốc, giữ nguyên nhà / người / góc nhìn, chỉ đổi tiến độ công việc tới đúng chỗ đoạn này bắt đầu.
  // Ảnh mốc đầu đoạn do Muse vẽ lại từ ảnh gốc nên hay «quên» việc đã xong (đã sơn rồi mà tường vẫn bong, đã lát sàn mà dây điện vẫn hở).
  // Từ các bước đã xong, dặn rõ TRẠNG THÁI hiện tại của chỗ đó; chỉ nêu những gì các bước đã xong chắc chắn đã đổi.
  const STATE_RULES = [
    [/plaster and smoothed|sanded smooth/, 'every wall and ceiling is smooth and flat, with no holes, no cracks and no bare plaster or bricks'],
    [/rolled with white primer|painted with two clean coats/, 'the walls and the ceiling inside are already painted: clean, even and fresh, with no peeling paint or wallpaper, no stains, no mold and no exposed bricks or wires on any inside wall'],
    [/flooring is laid/, 'the whole inside floor is already covered with new flooring planks, with no debris, no old floor and no trash on it'],
    [/windows and new doors are fitted/, 'the windows and doors are new, clean and sealed, with no broken glass and no old frames'],
    [/new wiring, switches/, 'all wiring is hidden inside the walls, the switches, sockets and light fixtures are installed and the lights are on, with no exposed wires'],
    [/kitchen counter/, 'the kitchen counter, sink with tap, shelves and cabinets are installed and clean'],
    [/furniture is carried in/, 'the room is furnished and decorated']
  ];
  function stateGuards(done) {
    const text = done.join('; ');
    return STATE_RULES.filter(([re]) => re.test(text)).map(([, line]) => line);
  }
  const SAME_HOUSE = 'The building keeps its exact architecture in every picture: the same number of floors, the same roof shape and size, the same footprint and the same door and window positions; only its condition changes (cleaner, repaired, repainted), never a different house.';
  function keyframePrompt(config, step, clipIndex, total) {
    const list = fullSteps(config), custom = themeOf(config.theme).id === 'custom' && !list.length;
    let progress;
    if (custom) progress = `the whole project is about ${Math.round(100 * clipIndex / total)}% complete, with clearly visible progress compared to the original photo`;
    else {
      const done = list.slice(0, step.step - 1).map(x => x.en), now = list[step.step - 1].en, pct = Math.round(100 * (step.part - 1) / step.parts);
      const guards = stateGuards(done);
      progress = `${done.length ? `already finished: ${done.join('; ')}. ` : ''}${guards.length ? `So the place now looks like this, and it must stay this way in the picture: ${guards.join('; ')}. ` : ''}Currently in progress: ${now}${pct ? ` (about ${pct}% of this step is done)` : ' (just starting)'}`;
    }
    return [
      'Edit the attached photo. Keep exactly the same place, the same building or object, the same viewpoint and framing, the same light and the same person (same face, hair, body and clothes) as in the attached photo.',
      config.person ? `The person in the picture is ${config.personDesc}, ${config.faceless ? 'seen from behind or from far away' : 'seen clearly'}, working in the scene, ${clipIndex / total < 0.25 ? 'fresh with a little sweat' : clipIndex / total < 0.6 ? 'sweaty, hair damp, shirt dark with sweat' : 'soaked in sweat, dirty and visibly tired'}. The person holds only the one tool that this moment of the work needs, and nothing else in the hands.` : '',
      SAME_HOUSE,
      `Change only the state of the work so that the picture shows this moment: ${progress}.`,
      'Everything that is not mentioned keeps exactly the same shape, size, position and color as in the attached photo.',
      IMG_RATIO[config.aspect],
      'Wide shot that shows the whole place clearly.',
      LOCKED,
      SAFE_PEOPLE_IMAGE,
      'Sharp, crisp, high-detail photograph look, natural colors and real textures; not animation, not a painting, not CGI.',
      'No text, lettering, numbers, logos, watermarks or captions in the image.'
    ].filter(Boolean).join('\n');
  }

  // Việc đưa vào hàng đợi. Cảnh 1 làm từ ảnh gốc (ảnh người dùng chọn, hoặc ảnh Muse tạo trước); cảnh k>1 làm từ KHUNG CUỐI THẬT của cảnh k-1 (tool tự cắt bằng FFmpeg).
  function buildJobs(config, { storyId, photo = '', accounts = 1 } = {}) {
    const steps = stepsOf(config), total = steps.length, jobs = [];
    const starts = segmentsOf(config, accounts), startSet = new Set(starts.slice(1));
    const source = photo ? { file: photo } : { phase: 'image', number: 1 };
    const base = photo ? null : { kind: 'restore', storyId, phase: 'image', number: 1, title: config.lang === 'en' ? 'Original photo' : 'Ảnh gốc', prompt: baseImagePrompt(config), references: [], ...(config.provider === 'flow' ? { provider: 'flow', aspect: config.aspect } : {}) };
    if (base) jobs.push(base);
    steps.forEach((step, i) => {
      const number = i + 1;
      let needs, refList;
      if (number === 1) { needs = photo ? [] : [{ phase: 'image', number: 1 }]; refList = [{ ...source }]; }
      else if (startSet.has(i)) { const k = starts.indexOf(i) + 1; needs = [{ phase: 'image', number: k }]; refList = [{ phase: 'image', number: k }]; }   // đầu đoạn mới: từ ảnh mốc
      else { needs = [{ phase: 'clip', number: number - 1 }]; refList = [{ phase: 'clip', number: number - 1, part: 'lastFrame' }]; }
      if (config.anchor && number > 1 && !startSet.has(i)) {
        // Neo ảnh gốc (thử nghiệm): đính kèm thêm ảnh gốc làm mốc kiến trúc/người.
        refList.push({ ...source });
        if (!photo) needs.push({ phase: 'image', number: 1 });
      }
      let prompt = clipPrompt(config, step, number, total, { first: number === 1 || startSet.has(i) });
      if (config.anchor && number > 1 && !startSet.has(i)) prompt += '\nThe second attached image is only a reference of the ORIGINAL place and person: keep the architecture, the viewpoint and the person\'s face and clothes consistent with it, but the video itself must start from the FIRST attached image and show the progress already made.';
      jobs.push({
        kind: 'restore', storyId, phase: 'clip', number, title: step.title, prompt, durationSeconds: config.seconds,
        references: [], needs, refList, ...(config.provider === 'flow' ? { provider: 'flow', aspect: config.aspect } : {})
      });
    });
    // Ảnh mốc (nằm sau các cảnh trong hàng đợi để đoạn đầu được ưu tiên): mỗi đoạn song song từ đoạn thứ 2 có một ảnh mốc làm từ ảnh gốc.
    starts.slice(1).forEach((clipIndex, k) => {
      jobs.push({
        kind: 'restore', storyId, phase: 'image', number: k + 2, title: (config.lang === 'en' ? 'Part start ' : 'Mốc đoạn ') + (k + 2),
        prompt: keyframePrompt(config, steps[clipIndex], clipIndex, total), references: [],
        needs: photo ? [] : [{ phase: 'image', number: 1 }], refList: [{ ...source }], ...(config.provider === 'flow' ? { provider: 'flow', aspect: config.aspect } : {})
      });
    });
    return jobs;
  }

  // ---- Chia lại phần CHƯA LÀM của một truyện đang chạy thành thêm đoạn song song.
  // Truyện tạo lúc ít tài khoản (hoặc chỉ 1 chuỗi) thì sau này mở thêm trình duyệt cũng không nhanh hơn: chuỗi nối tiếp chỉ có MỘT cảnh chạy được mỗi lúc.
  // Hàm thuần: nhận danh sách việc của MỘT truyện, trả về {changes, images, seams} (không sửa dữ liệu vào); null nếu không cần / không thể chia.
  const CONT_LINE = 'This clip continues directly from the previous clip without any jump: the person keeps the same pose, the same tool in the hands and the same movement as in the attached frame, and goes on working.';
  const STEP_RE = /STEP (\d+) of (\d+)(?:, part (\d+) of (\d+))?: ([^\n]*?)\.(?:\n|$)/;
  const MIN_REMAIN = 4;                                  // mỗi nửa sau khi chia còn ít nhất 4 cảnh chưa làm
  function resegment(jobs, want) {
    const clips = (jobs || []).filter(j => j.phase === 'clip' && Number.isInteger(j.number)).sort((a, b) => a.number - b.number);
    const images = (jobs || []).filter(j => j.phase === 'image' && j.number < THUMB_NUMBER);
    want = Math.min(MAX_PARALLEL, Math.floor(Number(want) || 1));
    if (want < 2 || clips.length < MIN_REMAIN * 2) return null;
    const parsed = clips.map(c => STEP_RE.exec(String(c.prompt || '')));
    if (parsed.some(m => !m)) return null;
    const isStart = c => c.number === 1 || !(c.needs || []).some(n => n.phase === 'clip');
    const idx = clips.map((c, i) => i).filter(i => isStart(clips[i]));
    if (!idx.length || idx[0] !== 0) return null;
    const segs = idx.map((from, i) => ({ from, to: i + 1 < idx.length ? idx[i + 1] : clips.length }));
    const done = c => c.status === 'completed';
    const untouched = c => c.status === 'pending' && !c.resumeMode && !c.submittedAt && !c.mayHaveSubmitted && !c.output;
    const frontier = seg => { for (let i = seg.from; i < seg.to; i++) if (!done(clips[i])) return i; return -1; };
    const active = () => segs.filter(seg => frontier(seg) >= 0);
    const splits = [];
    while (active().length < want) {
      let best = null;
      for (const seg of segs) {
        const f = frontier(seg);
        if (f < 0) continue;
        const left = seg.to - f;                                   // số cảnh chưa xong của đoạn này
        if (left < MIN_REMAIN * 2) continue;
        const at = f + Math.floor(left / 2);
        let ok = true;
        for (let i = at; i < seg.to; i++) if (!untouched(clips[i])) { ok = false; break; }
        if (ok && (!best || left > best.left)) best = { seg, at, left };
      }
      if (!best) break;
      splits.push(best.at);
      segs.push({ from: best.at, to: best.seg.to }); best.seg.to = best.at;   // đoạn mới bắt đầu từ cảnh `at`
    }
    if (!splits.length) return null;
    // Danh sách việc đầy đủ (để ảnh mốc biết «đã xong những gì») dựng từ prompt của các cảnh.
    const stepList = [];
    parsed.forEach(m => { const n = Number(m[1]); if (!stepList[n - 1]) stepList[n - 1] = m[5].replace(/^the person /, ''); });
    for (let i = 0; i < Number(parsed[0][2]); i++) if (!stepList[i]) stepList[i] = 'the work continues';
    const firstLine = String(clips[0].prompt).split('\n')[0];
    const aspect = Object.keys(RATIO).find(k => RATIO[k] === firstLine) || '16:9';
    const en = images.some(j => /^(Original photo|Part start)/.test(j.title || ''));
    const cfg = { stepList, aspect, person: false, theme: 'cabin' };
    const base = clips[0].refList && clips[0].refList[0];
    const flow = clips[0].provider === 'flow' ? { provider: 'flow', aspect: clips[0].aspect } : {};
    let nextImage = Math.max(1, ...images.map(j => j.number || 0)) + 1;
    const result = { changes: [], images: [], seams: [] };
    splits.sort((a, b) => a - b).forEach(at => {
      const c = clips[at], m = parsed[at], k = nextImage++;
      const step = { step: Number(m[1]), steps: Number(m[2]), part: Number(m[3] || 1), parts: Number(m[4] || 1) };
      result.images.push({
        kind: 'restore', storyId: c.storyId, phase: 'image', number: k, title: (en ? 'Part start ' : 'Mốc đoạn ') + k,
        prompt: keyframePrompt(cfg, step, at, clips.length), references: [],
        needs: base && base.file ? [] : [{ phase: 'image', number: 1 }], refList: [base && base.file ? { file: base.file } : { phase: 'image', number: 1 }], ...flow
      });
      result.changes.push({ id: c.id, number: c.number, needs: [{ phase: 'image', number: k }], refList: [{ phase: 'image', number: k }],
        prompt: String(c.prompt).replace('\n' + CONT_LINE, '').replace(/\nThe second attached image is only a reference[^\n]*/, '') });
    });
    // Mọi chỗ bắt đầu đoạn (chỉ số từ 0, không tính cảnh đầu) — dùng làm chỗ nối khi dựng video.
    result.seams = segs.map(seg => seg.from).filter(i => i > 0).sort((a, b) => a - b);
    return result;
  }

  // ---- Ảnh thumbnail 16:9 của video (làm xong video mới tạo): Muse vẽ từ ảnh «trước» (ảnh gốc) và ảnh «sau» (khung cuối video).
  const THUMB_NUMBER = 900;                              // số của việc ảnh thumbnail trong hàng đợi (các ảnh mốc đánh số nhỏ hơn)
  function thumbnailPrompt({ title = '', lang = 'vi' } = {}) {
    const en = lang === 'en', label = en ? ['BEFORE', 'AFTER'] : ['TRƯỚC', 'SAU'];
    const text = String(title || '').replace(/[\r\n"]+/g, ' ').trim().slice(0, 60);
    return [
      'Create a YouTube thumbnail: a horizontal 16:9 widescreen image (1920x1080).',
      'The FIRST attached photo shows the place BEFORE, in its original neglected state. The SECOND attached photo shows the very same place AFTER all the work is finished.',
      'Make a bold before-and-after thumbnail of this exact place: the left half shows the BEFORE state from the first photo, the right half shows the AFTER state from the second photo, divided by one clean diagonal line. Keep the same place, the same building or object and the same viewpoint in both halves.',
      'Make it eye-catching: vivid saturated colors, strong contrast, clean bright light, sharp, crisp, high-detail photographic look. The AFTER side is clearly brighter and more beautiful than the BEFORE side.',
      text ? `Add big bold title text at the top or bottom: white letters with a thick black outline, with exactly these words and nothing else: "${text}".` : '',
      `Add two small labels: "${label[0]}" on the left half and "${label[1]}" on the right half.`,
      'No other text, no numbers, no logos, no watermarks.',
      SAFE_PEOPLE_IMAGE
    ].filter(Boolean).join('\n');
  }

  const slug = text => String(text || '').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/g, 'd').replace(/Đ/g, 'D').replace(/[^A-Za-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 30);
  function storyIdBase(config) { return slug(config.name) || slug(themeOf(config.theme).label) || 'DonNha'; }
  function videoTitle(config) { return config.name || text(config.theme, config.lang).label; }

  return { ASPECTS, MINUTES, LONG_MINUTES, VERY_LONG_MINUTES, SECONDS, MAX_CLIPS, clipCount, THEMES, EN, text, themeOf, options, stepsOf, sceneBible, baseImagePrompt, clipPrompt, segmentsOf, resegment, seamsOf, keyframePrompt, THUMB_NUMBER, thumbnailPrompt, PROVIDERS, MAX_CLIPS_FLOW, MAX_PARALLEL, MIN_SEGMENT, problems, screenText, screenConfig, isPolicyError, safeRetryPrompt, buildJobs, storyIdBase, videoTitle, SURVIVOR, WORKER, SURVIVOR_F, WORKER_F, PHOTO_PERSON, WHO, personFor, DEFAULT_LIGHT };
});
