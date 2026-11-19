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
  const LOCKED_BUILD = 'LOCKED - these never change unless the current step is working on them: the shape, size, height, material and color of everything that is already built, the exact position of every finished part, the surroundings and the background, the ground (it stays bare packed earth, never a concrete slab or paving, unless this step works on it), the direction of the light and the weather, the colors of everything this step does not touch, the number and place of the tubs, buckets, tools and piles (nothing appears or disappears by itself; only the person moves things, with their own hands), and the person\'s face, hair, skin, body size, hat and clothes.';
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
  // Có ảnh tham chiếu mà người dùng không tự gõ mô tả người: người và quần áo TRONG ẢNH được ưu tiên (không ép trang phục mặc định lên ảnh của họ).
  // Mô tả mặc định chỉ dùng khi ảnh không có người (ảnh chỉ có nơi chốn).
  const PHOTO_FIRST = 'the person already shown in the attached photo, kept exactly as in that photo (same face, hairstyle, hair color, skin tone, apparent age, gender, body shape and the very same clothes, hat and gloves: never change, add or remove any garment). Only if the attached photo shows no person at all, the person is ';
  const withPhoto = (config, photo) => (!photo || !config.person || config.who === 'photo' || config.personTyped) ? config : { ...config, personDesc: PHOTO_FIRST + config.personDesc };
  const WHO = ['female', 'male', 'photo'];
  // Người mặc định theo chủ đề và lựa chọn nữ / nam / giống ảnh gốc.
  const personFor = (theme, who) => {
    const t = typeof theme === 'string' ? themeOf(theme) : theme, survivor = t.personDefault === SURVIVOR;
    return who === 'photo' ? PHOTO_PERSON : who === 'male' ? t.personDefault : survivor ? SURVIVOR_F : WORKER_F;
  };

  // Cảnh quay bếp: gần hơn cảnh sinh tồn thường (thấy rõ tay làm gạch, đất, vữa), vẫn thấy cả cái bếp và cả người.
  const STOVE_SHOT = 'a medium-wide shot filmed from a few metres away: the whole stove and the person\'s whole body (head included) are always in the frame, the stove fills a large part of the picture and the hands, the tools and the materials are clearly readable';
  // Mỗi chủ đề: base = hiện trạng ban đầu (dùng khi để Muse tạo ảnh gốc); steps = các việc nối tiếp nhau (vi = nhãn trên thẻ, en = việc làm trong clip, mã thứ 3 (nếu có) = nhịp: f / n / s).
  // survival: true = chủ đề sinh tồn: nhịp nhanh / thật / chậm xen kẽ, ít lau mồ hôi, diễn tự nhiên; locks = [[bước bắt đầu, vật đang xây]]: từ bước đó mọi clip nhắc lại chất liệu của vật đó.
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
      id: 'shelter', label: 'Sinh tồn · dựng lều trú trong rừng', hint: 'Ảnh gốc: một khoảng đất trống trong rừng, chụp toàn cảnh.', person: true, personDefault: SURVIVOR, survival: true,
      place: 'a quiet forest clearing', placeholder: 'Ví dụ: bãi đất trống trong rừng thông, đất khô, vài cành rơi',
      base: 'bare ground, a few fallen branches and tall trees around',
      steps: [
        ['Chọn chỗ, dọn đất', 'clears the leaves and stones from a flat patch of ground by hand', 'n'],
        ['Chặt cành dài', 'cuts long straight poles and branches with a bushcraft knife and a small saw', 'f'],
        ['Dựng sống mái', 'sets up the ridge pole on two forked supports at a low height', 'n'],
        ['Dựa sườn', 'leans many long branches along both sides of the ridge pole to form the ribs', 'f'],
        ['Buộc dây', 'lashes the frame together with natural cord at the joints', 's'],
        ['Phủ cành nhỏ', 'covers the ribs with a lattice of small branches', 'f'],
        ['Phủ lá dày', 'piles a thick layer of dry leaves and ferns over the whole shelter', 'f'],
        ['Đắp đất, rêu', 'packs soil and moss over the leaves for insulation', 'n'],
        ['Làm giường lá', 'builds a raised bed of dry leaves and pine needles inside', 'n'],
        ['Làm cửa che', 'builds a small woven door of branches for the entrance', 's'],
        ['Chẻ củi', 'splits logs and stacks the firewood beside the shelter', 'f'],
        ['Đào bếp lửa', 'digs a fire pit and rings it with stones in front of the shelter', 'n'],
        ['Nhóm lửa', 'lights a fire with a ferro rod and the flames grow', 's'],
        ['Lấy nước', 'sets a pot of water over the fire to boil', 'n'],
        ['Hoàn thiện', 'sits relaxed at the finished shelter at dusk with the fire glowing', 's']
      ]
    },
    {
      id: 'cabin', label: 'Sinh tồn · dựng nhà gỗ bằng tay', hint: 'Ảnh gốc: một khoảng đất trống có sẵn khúc gỗ, chụp toàn cảnh.', person: true, personDefault: SURVIVOR, survival: true,
      place: 'a flat forest clearing with cut logs piled aside', placeholder: 'Ví dụ: bãi đất phẳng bên suối, có đống khúc gỗ',
      base: 'flat bare ground, a pile of cut logs, tall trees around',
      locks: [
        [13, 'the stove in the cabin is a small hand-built STONE-and-clay stove with a short stone chimney: flat stones joined with clay, no metal body, no cast iron, no steel and no store-bought stove; it stays this same stone-and-clay stove in every later clip']
      ],
      steps: [
        ['San nền', 'levels the ground with a shovel and a rake', 'f'],
        ['Đặt móng đá', 'places flat stones at the four corners as the foundation', 'n'],
        ['Xếp khúc gỗ đầu', 'lays the first round logs on the foundation and checks them level', 'n'],
        ['Dựng tường', 'stacks logs on top of each other and notches the corners so they interlock', 'n'],
        ['Chừa cửa', 'cuts the opening for the doorway as the walls rise', 's'],
        ['Dựng tường cao', 'raises the walls higher with more logs lifted into place', 'f'],
        ['Làm xà mái', 'lifts the roof beams and ridge pole into place', 'n'],
        ['Lợp ván mái', 'nails wooden boards across the roof frame', 'f'],
        ['Trét kẽ hở', 'fills the gaps between the logs with clay and moss', 's'],
        ['Lắp cửa sổ', 'fits a small wooden window frame in the wall', 's'],
        ['Lắp cửa chính', 'hangs a wooden door on hinges', 's'],
        ['Lát sàn', 'lays wooden planks for the floor', 'f'],
        ['Xây bếp, ống khói', 'builds a small stove out of flat stones and clay with a short stone chimney, joining the stones with clay by hand', 's'],
        ['Đặt giường, bàn', 'carries in a wooden bed and a table', 'n'],
        ['Hoàn thiện', 'stands proudly in front of the finished log cabin as smoke rises from the chimney at dusk', 's']
      ]
    },
    {
      id: 'bunker', label: 'Sinh tồn · đào hầm ở dưới đất', hint: 'Ảnh gốc: sườn đồi / bãi đất trong rừng, chụp toàn cảnh.', person: true, personDefault: SURVIVOR, survival: true,
      place: 'a sloped forest hillside with soil and roots', placeholder: 'Ví dụ: sườn đồi đất đỏ, rễ cây lộ ra',
      base: 'bare soil, roots and a few rocks on a gentle slope',
      locks: [
        [14, 'the stove in the shelter is a small hand-made CLAY stove with a short clay chimney: shaped by hand from natural clay, no metal body, no cast iron, no steel and no store-bought stove; it stays this same clay stove in every later clip']
      ],
      steps: [
        ['Chọn chỗ, đánh dấu', 'marks the outline of the shelter on the slope with a stick', 'n'],
        ['Đào hố', 'digs into the slope with a shovel and throws the soil aside', 'f'],
        ['Đào sâu', 'keeps digging deeper and carries the soil away in a bucket', 'f'],
        ['Mở rộng hầm', 'widens the pit into a room-sized hollow', 'f'],
        ['Gia cố vách', 'lines the walls with wooden logs and stakes', 'n'],
        ['Làm khung mái', 'lays strong logs across the top as the roof frame', 'n'],
        ['Phủ bạt chống nước', 'covers the roof frame with a waterproof tarp', 'n'],
        ['Phủ đất lên mái', 'shovels soil and turf over the roof until it blends into the hillside', 'f'],
        ['Làm bậc thang', 'cuts and reinforces steps down to the entrance', 'n'],
        ['Làm cửa gỗ', 'builds and hangs a sturdy wooden door', 's'],
        ['Đặt ống thông gió', 'sets a ventilation pipe through the roof', 's'],
        ['Lát sàn', 'lays wooden boards on the floor inside', 'n'],
        ['Làm giường, kệ', 'builds a bed frame and a shelf inside', 'n'],
        ['Làm bếp, ống khói', 'builds a small stove out of clay with a short clay chimney, shaping it by hand', 's'],
        ['Hoàn thiện', 'sits inside the finished underground shelter lit by a warm lantern and the stove glow', 's']
      ]
    },
    // ---- Xây bếp: mỗi kiểu bếp là một chủ đề riêng, 18 bước đúng thứ tự thợ làm thật (≈ 8 phút mặc định, chọn được 10 phút).
    // locks = [[bước bắt đầu, mô tả vật đang xây]]: từ bước đó trở đi MỌI clip (và ảnh mốc) nhắc lại chất liệu, để bếp đất sét không biến thành bếp sắt ở cảnh cuối.
    // Chữ cuối mỗi bước: f = việc nặng/lặp lại (tua nhanh), n = tốc độ thật, s = việc khéo tay (chậm, tỉ mỉ).
    {
      id: 'stove_clay', label: 'Xây bếp · bếp đất sét có ống khói (2 họng)', hint: 'Ảnh gốc: khoảng đất phẳng ngoài trời có sẵn xẻng, xô, thau trộn và đống rơm khô. Nên chọn 8–10 phút.', person: true, personDefault: SURVIVOR, survival: true, defaultMinutes: 8, defaultCamera: 'fixed',
      place: 'a flat patch of bare ground in a quiet shaded yard at the edge of a forest', placeholder: 'Ví dụ: sân đất phẳng bên rìa rừng, có xẻng, xô nước, đống rơm khô',
      base: 'flat bare ground with a shovel, a bucket, a mixing tub and a pile of dry straw beside it', shotOut: STOVE_SHOT,
      locks: [
        [4, 'the stove being built is a hand-made CLAY stove: every part of it is made only of rough natural yellow-brown clay and stones, with no metal body, no cast iron, no steel, no bricks and no store-bought stove; it has only the parts that the finished steps have already built'],
        [10, 'the clay stove has a rectangular body of rough yellow-brown clay on a ring of stones, an arched fire door at the front and a flat clay top with two round pot openings; it is clay, never metal'],
        [11, 'the clay stove has a rectangular body of rough yellow-brown clay on a ring of stones, an arched fire door at the front, a flat clay top with two round pot openings and a tall tapering round chimney of solid clay at the back, not a metal pipe; it is clay, never metal'],
        [15, 'the outer walls of the clay stove are now matt white lime-washed clay, and the fire door edge, the chimney top and the inside stay natural clay; the stove is clay, never metal']
      ],
      steps: [
        ['Chọn chỗ, san nền', 'marks a rectangle on the flat ground with a stick, levels it with a shovel and packs it hard with a wooden tamper', 'f'],
        ['Đào đất sét', 'digs sticky yellow-brown clay soil out of a pit with a shovel and piles it on a tarp', 'f'],
        ['Trộn đất, cát, rơm', 'mixes the clay with sand, chopped dry straw and water in a shallow pit, turning it with a hoe and treading it with boots until it becomes a thick even dough', 'f'],
        ['Nhào, cuộn đất', 'kneads a lump of the clay dough on a wooden board and rolls it by hand into thick even coils', 's'],
        ['Xếp đế đá', 'sets a rectangular ring of flat stones on the packed ground as the base and presses clay into the gaps between them', 'n'],
        ['Đắp bệ bếp', 'packs clay dough layer by layer on top of the stones with both fists to form a solid rectangular platform about knee high', 'n'],
        ['Đắp thành lò', 'stacks clay coils to raise the front, back and side walls of the firebox, pressing each coil into the one below and smearing the joints with a thumb', 's'],
        ['Chừa cửa lửa', 'shapes an arched fire door opening at the front of the firebox and leaves a lower slot underneath for the ashes', 's'],
        ['Đặt đá làm vỉ lò', 'lays flat stone slabs across the bottom of the firebox with narrow gaps between them as a grate for air', 'n'],
        ['Làm mặt bếp', 'rolls out a thick flat slab of clay, lays it across the top walls and cuts two round pot openings into it using a bowl as a template', 's'],
        ['Đắp ống khói', 'builds a round chimney at the back by stacking clay coils into a tall tapering tower of solid clay (not a metal pipe) and smoothing the outside with a wet hand', 's'],
        ['Vuốt nhẵn', 'smooths the whole stove with wet hands and a wooden paddle, filling every crack and rounding the corners', 's'],
        ['Tạo họa tiết', 'presses a simple border pattern into the front wall with a pointed stick and the back of a spoon', 's'],
        ['Phơi cho se', 'leaves the clay to dry in the shade, then pats the surface and fills hairline cracks with fresh clay', 'n'],
        ['Quét vôi trắng', 'brushes a thin coat of white lime wash over the outer walls of the dry stove with a wide brush', 'n'],
        ['Đốt lửa nhỏ sấy bếp', 'lights a small fire of thin twigs in the firebox with a match and feeds it slowly so the clay bakes gently, thin smoke rising up the chimney', 'n'],
        ['Nấu thử', 'sets a clay pot of water on one pot opening and a clay pan on the other and feeds split logs into the fire door', 'n'],
        ['Hoàn thiện', 'stands beside the finished clay stove at dusk, a warm flame in the fire door and steam rising from the pot', 's']
      ]
    },
    {
      id: 'stove_brick', label: 'Xây bếp · bếp gạch đỏ 2 họng, có ống khói', hint: 'Ảnh gốc: khoảng đất phẳng ngoài trời có sẵn đống gạch đỏ, bao cát, xẻng và thau trộn vữa. Nên chọn 8–10 phút.', person: true, personDefault: SURVIVOR, survival: true, defaultMinutes: 8, defaultCamera: 'fixed',
      place: 'a flat patch of bare ground in a tidy outdoor yard beside a stack of red bricks', placeholder: 'Ví dụ: sân đất phẳng cạnh mái hiên, có đống gạch đỏ, bao cát, xẻng',
      base: 'flat bare ground with a stack of red bricks, bags of cement and sand, a shovel and a mixing tub beside it', shotOut: STOVE_SHOT,
      locks: [
        [5, 'the stove being built is a hand-built RED BRICK stove laid in mortar with staggered joints: no metal body, no cast iron, no steel, no clay body and no store-bought stove; it has only the parts that the finished steps have already built'],
        [11, 'the brick stove has red brick walls laid in mortar with staggered joints, an arched fire door opening and a lower ash opening at the front, and a flat brick top with two square pot openings; it is brick, never metal'],
        [12, 'the brick stove has red brick walls laid in mortar with staggered joints, an arched fire door opening and a lower ash opening at the front, a flat brick top with two square pot openings and a tall rectangular brick chimney at the back; it is brick, never metal'],
        [13, 'the outside walls of the brick stove are now covered with smooth pale plaster, the inside of the firebox stays pale fire brick, and the chimney, the fire door and the two pot openings stay as they were; it is brick and plaster, never metal'],
        [15, 'the brick stove has smooth pale plaster walls with a band of decorative ceramic tiles across the front wall, the fire door, the two pot openings and the chimney as before; it is brick, never metal']
      ],
      steps: [
        ['Chọn chỗ, đánh dấu', 'marks the outline of the stove on the flat ground with pegs and a string line and checks the corners with a tape measure', 's'],
        ['Đào móng, đầm đất', 'digs a shallow foundation trench with a shovel and tamps a layer of gravel into the bottom', 'f'],
        ['Trộn vữa', 'mixes cement, sand and water in a mixing tub with a hoe until the mortar is thick, even and creamy', 'f'],
        ['Lát cát, nền gạch', 'spreads a layer of sand in the trench and lays flat red bricks side by side on it as the base, tapping each brick level with a rubber mallet', 'n'],
        ['Xây hàng gạch đầu', 'spreads a bed of mortar with a trowel and lays the first course of red bricks around the outline, tapping each brick level with the trowel handle', 's'],
        ['Xây thành bếp', 'keeps laying red bricks course by course with staggered joints, scraping off the squeezed-out mortar and checking each course with a spirit level', 'n'],
        ['Chừa cửa lò', 'leaves the opening for the fire door and a lower ash opening at the front while the walls rise', 'n'],
        ['Đặt đá lanh tô', 'lifts a flat stone slab onto the walls above the fire door opening as a lintel and beds it in mortar', 's'],
        ['Lót gạch chịu lửa', 'lines the floor and the inside walls of the firebox with pale fire bricks laid in thin joints', 's'],
        ['Xây cao thêm', 'lays more courses of red bricks around the firebox up to waist height', 'f'],
        ['Làm mặt bếp', 'lays a flat top of red bricks across the walls, leaving two square pot openings framed by whole bricks', 's'],
        ['Xây ống khói', 'builds a rectangular chimney at the back by laying the same red bricks upward in a tapering shaft, checking it with a plumb line; the chimney is solid brick, not a metal pipe', 'n'],
        ['Trát vữa ngoài', 'spreads a smooth layer of plaster over the outside walls with a trowel and wipes it level with a wooden float', 'n'],
        ['Chà nhẵn', 'rubs the plaster smooth with a damp sponge and rounds the edges', 's'],
        ['Ốp gạch men trang trí', 'sets a band of decorative ceramic tiles on the front wall in tile adhesive with a notched trowel, pressing each tile flat', 's'],
        ['Chờ vữa khô, sấy lửa', 'lights a small fire of thin kindling in the firebox to cure the mortar slowly', 'n'],
        ['Nấu thử', 'places a white enamel pot and a clay pan on the two openings and feeds split logs into the fire door, flames and steam rising', 'n'],
        ['Hoàn thiện', 'stands beside the finished brick stove at dusk with a warm glow in the fire door', 's']
      ]
    },
    {
      id: 'stove_ring', label: 'Xây bếp · bếp lửa vòng gạch tròn (kiềng gỗ treo nồi)', hint: 'Ảnh gốc: khoảng đất phẳng ngoài trời có sẵn đống gạch đỏ, bao cát, thau trộn vữa, xẻng và vài cây gậy gỗ dài. Nên chọn 8–10 phút.', person: true, personDefault: SURVIVOR, survival: true, defaultMinutes: 8, defaultCamera: 'fixed',
      place: 'a flat patch of bare ground in a sunny yard beside a stack of red bricks', placeholder: 'Ví dụ: sân đất phẳng đầy nắng, có đống gạch đỏ, bao cát, xẻng và vài cây gậy dài',
      base: 'flat bare ground with a stack of red bricks, a bag of sand, a mixing tub, a shovel and a few long straight wooden poles beside it', shotOut: STOVE_SHOT,
      locks: [
        [6, 'the fire place being built is a hand-built ring of RED BRICKS laid in mortar with staggered joints: no metal ring, no steel fire bowl, no cast iron and no store-bought fire pit; it has only the parts that the finished steps have already built'],
        [10, 'the fire ring is a round wall of five courses of red bricks laid in mortar with staggered joints, about knee high, standing on bare earth; it is brick, never metal'],
        [13, 'the fire ring is a round wall of five courses of red bricks laid in mortar, with a neat border of flat stones lying on the ground around its outside; it is brick and stone, never metal'],
        [15, 'the fire ring is a round wall of five courses of red bricks with a border of flat stones around it, and a tripod of three long straight wooden poles tied together at the top with rope stands over it; the ring is brick, never metal']
      ],
      steps: [
        ['Dọn sạch chỗ làm', 'clears a round patch of ground of leaves and small stones with a rake and levels it with a shovel', 'f'],
        ['Vẽ vòng tròn', 'marks a circle on the ground by turning a string around a peg and scratching the line with a stick', 's'],
        ['Đào rãnh tròn', 'digs a shallow ring-shaped trench along the circle line with a shovel', 'f'],
        ['Rải cát, đầm phẳng', 'pours sand from a bucket into the trench and packs it flat with a wooden tamper', 'n'],
        ['Trộn vữa', 'mixes cement, sand and water in a mixing tub with a hoe until the mortar is thick and creamy', 'f'],
        ['Đặt vòng gạch đầu', 'spreads mortar with a trowel and sets the first ring of red bricks standing along the circle, tapping each brick level with a rubber mallet', 's'],
        ['Xây vòng thứ hai', 'spreads mortar on the first ring and lays a second ring of red bricks on it, shifting each brick half a brick sideways and scraping off the squeezed-out mortar', 'n'],
        ['Xây vòng thứ ba', 'lays a third ring of red bricks in mortar on the second ring, one brick after another around the circle', 'n'],
        ['Xây vòng thứ tư', 'lays a fourth ring of red bricks in mortar, working steadily around the circle', 'f'],
        ['Xây vòng cuối', 'lays the fifth and last ring of red bricks in mortar and checks that the top is level with a spirit level', 'n'],
        ['Miết mạch vữa', 'presses mortar into every joint of the brick ring with a pointing trowel and wipes the bricks clean with a damp sponge', 's'],
        ['Rải sỏi đáy bếp', 'pours gravel from a bucket on the ground inside the ring and spreads it flat with a rake', 'n'],
        ['Xếp đá viền ngoài', 'lays flat stones on the ground around the outside of the brick ring as a neat border, tapping each stone level with the mallet', 'n'],
        ['Chẻ củi', 'splits logs into firewood and kindling with an axe on a chopping block and tosses the pieces onto a pile', 'f'],
        ['Dựng kiềng ba chân', 'ties the tops of three long straight wooden poles together with rope, then stands them up and spreads the legs over the ring like a tripod', 's'],
        ['Nhóm lửa', 'stacks kindling in the middle of the ring and lights it with a match, then adds small sticks as the flames grow', 'n'],
        ['Treo nồi nấu', 'hangs a cooking pot of water from the top of the tripod over the flames', 'n'],
        ['Hoàn thiện', 'sits beside the finished brick fire ring at dusk watching the pot steam over a warm fire', 's']
      ]
    },
    {
      id: 'stove_oven', label: 'Xây bếp · lò nướng vòm đất sét (nướng bánh, pizza)', hint: 'Ảnh gốc: khoảng đất phẳng ngoài trời có sẵn đá, gạch, cát và tấm bạt. Nên chọn 8–10 phút.', person: true, personDefault: SURVIVOR, survival: true, defaultMinutes: 8, defaultCamera: 'fixed',
      place: 'a flat patch of bare ground in a garden corner with stones, bricks and a heap of sand beside it', placeholder: 'Ví dụ: góc vườn đất phẳng, có đá, gạch, đống cát và tấm bạt',
      base: 'flat bare ground with a pile of stones and bricks, a heap of sand, a tarp, a bag of straw and a shovel beside it', shotOut: STOVE_SHOT,
      locks: [
        [2, 'the oven stands on a square waist-high base of stones and bricks laid in clay mortar; the base is stone and brick, never metal'],
        [9, 'the oven is a hand-built CLAY dome oven standing on the waist-high base of stones and bricks, with a fire-brick floor: made only of clay, stone and brick, with no metal body, no steel oven and no store-bought pizza oven; it has only the parts that the finished steps have already built'],
        [13, 'the clay dome oven has a smooth rounded earthen dome with an arched door opening, a short arched entrance in front of the door and a small clay chimney above it, on the stone base with a fire-brick floor; it is clay, never metal'],
        [14, 'the outside of the clay dome oven is now smooth plastered clay in a warm earthy color; the arched entrance, the door opening and the small chimney stay as they were; it is clay, never metal']
      ],
      steps: [
        ['Chọn chỗ, san nền', 'levels a patch of ground with a shovel and packs it hard with a wooden tamper', 'f'],
        ['Xây bệ đá gạch', 'stacks stones and bricks in clay mortar into a square waist-high base, checking the top with a spirit level', 'n'],
        ['Phủ lớp cách nhiệt', 'spreads a thick layer of clay mixed with straw over the top of the base and levels it with a trowel', 'n'],
        ['Lát sàn lò', 'lays pale fire bricks flat on a bed of sand, tapping each brick level and keeping the joints tight', 's'],
        ['Vẽ vòng đáy lò', 'draws a circle on the brick floor with a string and a stick to mark the outline of the dome', 's'],
        ['Đắp khuôn cát', 'piles damp sand into a round dome mound inside the circle and shapes it smooth with the hands and a trowel', 'n'],
        ['Phủ giấy ướt', 'lays wet sheets of newspaper over the whole sand dome', 's'],
        ['Trộn đất cob', 'mixes clay, sand and chopped straw with water on a tarp, treading it with boots and folding the tarp over until it is a thick even dough', 'f'],
        ['Đắp vòm lớp trong', 'presses handfuls of the clay dough onto the sand dome from the bottom upward, building an even layer as thick as a hand and smoothing it as the work goes', 'n'],
        ['Cắt cửa lò', 'cuts an arched door opening in the front of the clay dome with a knife while the clay is still firm but damp', 's'],
        ['Moi cát ra', 'scoops the sand out through the door with a small shovel and pulls out the newspaper, leaving a hollow dome', 'n'],
        ['Đắp lớp cách nhiệt', 'covers the outside of the dome with a thick layer of clay mixed with straw as insulation, pressing it on by hand', 'n'],
        ['Làm cổng vòm, ống khói', 'builds a short arched entrance in front of the door and a small clay chimney above it', 's'],
        ['Trát nhẵn ngoài', 'plasters the outside with a smooth layer of clay and sand and rounds it with a wet sponge', 's'],
        ['Làm cửa gỗ', 'cuts a wooden board to fit the door opening and sands the edges so it sits snugly in front of the oven', 'n'],
        ['Sấy lửa nhỏ', 'lights a small fire of thin sticks inside the oven and feeds it slowly to dry the dome, thin smoke leaving through the chimney', 'n'],
        ['Nướng thử', 'rakes the embers to the side with a long wooden peel and slides a raw pizza on the peel into the hot oven', 's'],
        ['Hoàn thiện', 'takes the baked pizza out on the peel at dusk beside the finished dome oven glowing warm', 's']
      ]
    },
    {
      id: 'stove_stone', label: 'Xây bếp · bếp đá xếp ngoài trời (vòm đá, mặt bếp đá)', hint: 'Ảnh gốc: khoảng đất phẳng ngoài trời có sẵn đống đá hộc, bao xi măng và cát. Nên chọn 8–10 phút.', person: true, personDefault: SURVIVOR, survival: true, defaultMinutes: 8, defaultCamera: 'fixed',
      place: 'a flat patch of bare ground in an outdoor yard beside a big pile of natural stones', placeholder: 'Ví dụ: sân đất phẳng cạnh suối, có đống đá hộc, bao xi măng, cát',
      base: 'flat bare ground with a big pile of natural stones, bags of cement and sand, a shovel and a mixing tub beside it', shotOut: STOVE_SHOT,
      locks: [
        [4, 'the stove being built is a hand-built natural STONE stove: rough natural stones laid in mortar, with no brick body, no metal body, no cast iron, no steel and no store-bought stove; it has only the parts that the finished steps have already built'],
        [8, 'the stone stove has rough natural stone walls laid in mortar, a wide fire opening at the front spanned by a stone arch and a separate tall opening on one side for firewood; it is stone, never metal'],
        [11, 'the stone stove has rough natural stone walls laid in mortar, a wide fire opening at the front spanned by a stone arch, a separate tall opening on one side for firewood and thick flat stone slabs across the top; it is stone, never metal'],
        [12, 'the stone stove has rough natural stone walls laid in mortar, a wide fire opening at the front spanned by a stone arch, a separate tall opening on one side for firewood, thick flat stone slabs across the top and a tapering chimney of solid stone at the back, not a metal pipe; it is stone, never metal'],
        [13, 'the joints of the stone stove are now neatly filled with mortar and the stone faces are brushed clean; the arch, the openings, the top slabs and the chimney stay as they were; it is stone, never metal']
      ],
      steps: [
        ['Chọn chỗ, san nền', 'marks a rectangle on the flat ground with a stick, levels it with a shovel and packs it hard with a wooden tamper', 'f'],
        ['Nhặt, phân loại đá', 'sorts a heap of stones by size and sets the flat ones in a separate pile beside the work area', 'f'],
        ['Trộn vữa', 'mixes cement, sand and water in a mixing tub with a hoe until the mortar is thick and even', 'f'],
        ['Đặt đá móng', 'sets the biggest flat stones in a rectangle as the foundation on a bed of mortar, rocking each one until it is stable', 's'],
        ['Xếp thành đá', 'lays stones course by course in mortar, fitting them like a puzzle with small stones wedged into the gaps and the joints staggered', 'n'],
        ['Chừa lò, ngăn củi', 'leaves a wide fire opening at the front and a separate tall opening on one side for stacking firewood while the walls rise', 'n'],
        ['Dựng khuôn vòm', 'sets a curved wooden form across the fire opening to support the arch', 's'],
        ['Cuốn vòm đá', 'lays wedge-shaped stones on the form from both sides toward the middle and taps the last stone into the centre with a mallet', 's'],
        ['Tháo khuôn', 'pulls the wooden form out from under the arch once the mortar has set', 's'],
        ['Lót lòng lò', 'lines the floor of the firebox with flat fire bricks', 'n'],
        ['Đặt mặt bếp đá', 'lays thick flat stone slabs side by side across the top walls, bedding each in mortar and checking it level', 's'],
        ['Xây ống khói đá', 'builds a chimney at the back by stacking the same natural stones in mortar into a tapering column (solid stone, not a metal pipe)', 'n'],
        ['Chèn kẽ, trét vữa', 'pushes mortar into the joints with a pointing trowel and brushes the stone faces clean', 's'],
        ['Làm kệ gỗ bên hông', 'fits a thick rough wooden board into the side wall as a shelf and wedges it with stones', 's'],
        ['Xếp củi gọn', 'stacks split firewood neatly in the side opening', 'f'],
        ['Sấy lửa nhỏ', 'lights a small fire of thin kindling in the firebox to cure the mortar slowly', 'n'],
        ['Nấu thử', 'sets a big aluminium pot of water on the stone top and feeds split logs into the fire opening, flames and steam rising', 'n'],
        ['Hoàn thiện', 'stands beside the finished stone stove at dusk with a warm glow in the arch', 's']
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
    stove_clay: { label: 'Build a stove · clay stove with a chimney (2 burners)', hint: 'Start photo: flat open ground with a shovel, a bucket, a mixing tub and a pile of dry straw. Choose 8–10 minutes.', placeholder: 'e.g. flat yard at the edge of a forest with a shovel, a water bucket and dry straw',
      titles: ['Level the ground', 'Dig the clay', 'Mix clay, sand, straw', 'Knead and roll coils', 'Set the stone base', 'Pack the platform', 'Raise the firebox walls', 'Shape the fire door', 'Lay the grate stones', 'Make the cooking top', 'Build the chimney', 'Smooth the surface', 'Press the pattern', 'Let it dry', 'Lime-wash the walls', 'First small fire', 'Cook the first meal', 'Finished stove'] },
    stove_brick: { label: 'Build a stove · red brick stove, 2 burners, chimney', hint: 'Start photo: flat open ground with a stack of red bricks, bags of cement and sand, a shovel and a mixing tub. Choose 8–10 minutes.', placeholder: 'e.g. flat yard beside a veranda with a stack of red bricks, sand and a shovel',
      titles: ['Mark the outline', 'Dig the foundation', 'Mix the mortar', 'Lay the brick base', 'Lay the first course', 'Raise the walls', 'Leave the fire door', 'Set the lintel', 'Line with fire bricks', 'Build up higher', 'Make the cooking top', 'Build the chimney', 'Plaster the outside', 'Smooth the plaster', 'Add decorative tiles', 'Cure with a small fire', 'Cook the first meal', 'Finished stove'] },
    stove_ring: { label: 'Build a stove · round brick fire ring (wooden tripod for the pot)', hint: 'Start photo: flat open ground with a stack of red bricks, a bag of sand, a mixing tub, a shovel and a few long wooden poles. Choose 8–10 minutes.', placeholder: 'e.g. sunny flat yard with a stack of red bricks, a bag of sand, a shovel and a few long poles',
      titles: ['Clear the ground', 'Mark the circle', 'Dig the ring trench', 'Pack the sand', 'Mix the mortar', 'Set the first ring', 'Second ring', 'Third ring', 'Fourth ring', 'Last ring', 'Point the joints', 'Gravel floor', 'Stone border', 'Split firewood', 'Raise the tripod', 'Light the fire', 'Hang the pot', 'Finished fire ring'] },
    stove_oven: { label: 'Build a stove · clay dome oven (bread, pizza)', hint: 'Start photo: flat open ground with stones, bricks, a heap of sand and a tarp. Choose 8–10 minutes.', placeholder: 'e.g. flat garden corner with stones, bricks, a heap of sand and a tarp',
      titles: ['Level the ground', 'Build the stone base', 'Insulating layer', 'Lay the oven floor', 'Mark the dome circle', 'Shape the sand form', 'Wet newspaper layer', 'Mix the cob', 'Build the inner dome', 'Cut the door', 'Dig out the sand', 'Insulate the dome', 'Entrance arch and chimney', 'Plaster smooth', 'Make the wooden door', 'First small fire', 'Bake a test pizza', 'Finished oven'] },
    stove_stone: { label: 'Build a stove · outdoor stone stove (stone arch, stone top)', hint: 'Start photo: flat open ground with a big pile of natural stones, bags of cement and sand, a shovel and a mixing tub. Choose 8–10 minutes.', placeholder: 'e.g. flat ground by a stream with a big pile of stones, cement and sand',
      titles: ['Level the ground', 'Sort the stones', 'Mix the mortar', 'Set the foundation', 'Lay the stone walls', 'Leave fire and wood openings', 'Set the arch form', 'Build the stone arch', 'Remove the form', 'Line the firebox', 'Lay the stone top', 'Build the chimney', 'Point the joints', 'Fit the wooden shelf', 'Stack the firewood', 'Cure with a small fire', 'Cook the first meal', 'Finished stove'] },
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
      personTyped: Boolean(clean(input.personDesc, 300)),
      lang: input.lang === 'en' ? 'en' : 'vi',
      light: clean(input.light, 200) || DEFAULT_LIGHT,
      anchor: Boolean(input.anchor),
      parallel: input.parallel === 'auto' || input.parallel == null || input.parallel === '' ? 0 : Math.max(1, Math.min(MAX_PARALLEL, Math.round(Number(input.parallel)) || 1)),   // 0 = tự động theo số tài khoản
      camera: !theme.forceVaried && (input.camera || theme.defaultCamera) === 'fixed' ? 'fixed' : 'varied',   // nhà đi từ ngoài vào trong thì không thể cố định một góc      // xen kẽ cảnh xa / vừa / gần (như video làm nhà thật) hoặc một góc cố định
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
      list = theme.steps.map((st, i) => ({ vi: st[0], en: st[1], pace: st[2], title: en && titles[i] ? titles[i] : st[0] }));
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
        ? `Camera: one fixed camera on a tripod, same position, same height, same angle and same lens in every clip; no zoom, no pan, no tilt, no cuts, no camera shake.${themeOf(config.theme).survival && themeOf(config.theme).shotOut ? ` The framing never changes: ${themeOf(config.theme).shotOut}.` : ''}`
        : themeOf(config.theme).survival
          ? `Camera: a still, tripod-mounted real camera like a documentary about building by hand: ${themeOf(config.theme).shotOut || SHOT_OUT}; the camera never moves during a shot, and a change of angle is always a clean, clearly visible cut, never a pan or a zoom; never a push-in, never a face close-up, no handheld wobble, no shaking; the place, the lighting and the lens look stay identical.`
          : 'Camera: a still, tripod-mounted real camera like a time-lapse cleanup video: a WIDE, distant shot outside and ONE fixed angle inside that shows the action clearly; the camera never moves during a shot, and a change of angle is always a clean, clearly visible cut, never a pan or a zoom; never a push-in, never a face close-up, no handheld wobble, no shaking; the place, the lighting and the lens look stay identical.',
      `Light: ${config.light}.`,
      'Look: real-life footage filmed with a camera, photorealistic, natural colors, real textures and real materials; not animation, not cartoon, not CGI, not a painting, not an illustration.',
      'Quality: sharp, crisp, high-detail, clean and stable image; no blur, no flicker, no distortion, and no morphing of the building, the objects or the person.',
      themeOf(config.theme).survival ? LOCKED_BUILD : LOCKED
    ];
    if (config.person) {
      lines.push(`PERSON (the same single person in every clip, same hair, body and the very same clothes, hat and gloves with nothing added, removed or swapped${config.faceless ? '' : ', same face and facial features'}): ${config.personDesc}.`);
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
    const view = here === 'in' ? SHOT_IN : (themeOf(config.theme).shotOut || SHOT_OUT);
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
  // Sinh tồn: người làm việc tự nhiên, bình tĩnh như thợ thật. Lau mồ hôi RẤT hiếm (khoảng 1 clip trong 15, không bao giờ ở 7 clip đầu); các clip khác cấm hẳn động tác lau mặt.
  const wipesSurvival = number => number >= 8 && number % 15 === 8;
  function effortLinesSurvival(config, step, number, total) {
    const r = number / Math.max(1, total), wipe = wipesSurvival(number);
    const work = 'The person works calmly and naturally like an experienced worker: a focused, relaxed face, steady breathing and ordinary relaxed shoulders. No grimacing, no clenched jaw, no frowning, no dramatic panting and no exaggerated acting.';
    const sweat = r < 0.5 ? 'At most a faint natural shine of sweat on the skin.' : r < 0.9 ? 'Slightly damp hair and a little sweat on the forehead, nothing dramatic.' : 'Visibly a little tired but calm, with a relaxed, relieved expression.';
    const rest = wipe
      ? ' Once, in the middle of the clip, the person briefly wipes the forehead with the back of the hand, then simply goes on working.'
      : ' In this clip the person does not wipe the face or the forehead at all and does not stop to rest: no wiping gesture of any kind.';
    const how = config.faceless
      ? 'Show the effort with the body only: a steady posture and calm breathing.'
      : 'The expression is natural and visible in the medium or wide view, and never shown by moving the camera to the face.';
    return [`Acting (natural and calm, like a real worker, never theatrical): ${work} ${sweat}${rest} ${how}`];
  }
  function effortLines(config, step, number, total) {
    if (!config.person) return [];
    if (themeOf(config.theme).survival) return effortLinesSurvival(config, step, number, total);
    const heavy = HEAVY.test(step.en || ''), light = !heavy && LIGHT.test(step.en || '');
    const r = number / Math.max(1, total), wipe = wipesIn(number);
    const rest = wipe
      ? ' Once, in the middle of the clip, the person pauses for a moment to wipe the sweat from the face with the forearm and catch their breath, then goes straight back to work.'
      : ' The person keeps working without stopping the whole clip: no wiping the face, no pausing to rest.';
    const work = heavy
      ? `This is HARD physical labour: the person strains visibly, muscles tense, jaw clenched, frowning with effort, breathing heavily, sweat running down the forehead and neck, dirty sweaty hands.${rest}`
      : light
        ? 'The person works calmly and carefully with a relaxed, pleased expression, still a little sweaty and tired from the long work, with a small satisfied smile when the result looks good.'
        : `The person works steadily with a focused, serious face, sweat on the forehead, breathing a little heavily.${rest}`;
    const tired = r < 0.25 ? 'The job has just started: the person is fresh but already starting to sweat.'
      : r < 0.6 ? 'Several hours into the job: hair damp, sweat on the face and neck, clearly warm and breathing hard between actions.'
      : r < 0.9 ? `Many hours into the job: soaked in sweat, dirty and visibly tired, slower breaths${wipe ? ', rubbing the sore back or shoulder for a moment' : ''}, but pushing on.`
      : 'The job is almost done: exhausted and soaked in sweat but proud, with a tired relieved smile when looking at the result.';
    const how = config.faceless
      ? `Show the effort and the tiredness with the body only: heaving breath, sweat on the neck and arms, slumped shoulders${wipe ? ', wiping the neck once' : ''}.`
      : 'Show real human emotion in the face and the body, clearly visible in the medium or wide view (effort, tiredness, relief), and never by moving the camera to the face.';
    return [`Emotion and effort (the person is a real tired human, never a calm robot): ${work} ${tired} ${how}`];
  }

  // Nhịp của cảnh sinh tồn: việc nặng, lặp đi lặp lại thì tua nhanh (f); việc thường chạy tốc độ thật (n); việc khéo tay thì chậm, tỉ mỉ (s). Chủ đề khác không dùng (vẫn «fast-motion» như cũ).
  const PACE_TEXT = {
    f: 'Pace: BRISK. This is long, repetitive work, so the person works with a quick, efficient rhythm and repeats the same movement again and again (one repetition every second or two). The motion is smooth and natural at normal film speed: not a time-lapse, no jitter, no cartoon speed.',
    n: 'Pace: REAL TIME. The footage plays at normal speed as if it was filmed live: a natural, steady working rhythm, not sped up and not slow motion.',
    s: 'Pace: SLOW AND CAREFUL. This is careful detail work shown at normal or slightly slower speed, like a calm documentary shot of skilled hands: deliberate, precise movements, a short pause now and then to check the work, then adjust it. Never sped up.'
  };
  const PACE_WORD = { f: 'normal film speed with a brisk working rhythm', n: 'played at normal speed in real time', s: 'played at normal or slightly slower speed' };
  function paceOf(step) {
    if (PACE_TEXT[step.pace]) return step.pace;
    const t = step.en || '';
    return HEAVY.test(t) ? 'f' : LIGHT.test(t) ? 's' : 'n';
  }
  // Khóa chất liệu của vật đang xây (bếp, lò, tường...) từ bước nó xuất hiện tới hết video: AI hay làm bếp đất sét xong rồi cảnh cuối lại là bếp sắt.
  function lockOf(config, step) {
    if (config.lockText != null) return config.lockText;                  // chia lại truyện đang chạy: dùng nguyên dòng đã có trong prompt
    if (Array.isArray(config.stepList)) return '';
    let desc = '';
    (themeOf(config.theme).locks || []).forEach(([from, text]) => { if (step.step >= from) desc = text; });
    return desc ? `OBJECT LOCK (identical in every clip from now on, never changes): ${desc}. It keeps this exact material, color and shape in every clip; it never turns into a different kind of object and never changes its material.` : '';
  }
  const amountLine = seconds => `Amount of work: in these ${seconds} seconds only the small amount of work that one person can really do in that time appears (for example 3 or 4 bricks laid, a few trowels of mortar spread, one section of clay smoothed, or a few logs split). Everything already built in the first frame keeps exactly the same shape, size, position and material for the whole clip; only a little new work is added on top of it, and finished parts, tools, buckets and piles never appear, disappear or move by themselves.`;
  const TECHNIQUE = 'Technique: the person uses the real, correct technique for this job, the way an experienced builder or bushcraft worker does: the right grip on the tool with both hands where needed, a stable stance, real weight and effort in each movement, and the materials react exactly as real materials do (clay squashes and smears, bricks sit on mortar, stones are lifted with effort, wood splits along the grain). No pretend or mimed actions, no tool working without touching the material, and no hands passing through objects.';

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
    const last = number === total, sv = Boolean(themeOf(config.theme).survival), pace = sv ? paceOf(step) : '', lock = sv ? lockOf(config, step) : '';
    const fast = sv ? 'with clearly visible progress' : 'FAST with rapid, clearly visible progress';
    return [
      RATIO[config.aspect],
      sv
        ? `Create ${config.seconds === 8 ? 'an' : 'a'} ${config.seconds}-second real-life video of a person doing the work (real footage filmed with a camera, ${PACE_WORD[pace]}), aspect ratio ${config.aspect}, that starts EXACTLY from the attached image (it is the first frame of the video).`
        : `Create ${config.seconds === 8 ? 'an' : 'a'} ${config.seconds}-second FAST-MOTION real-life video of a person doing the work (real footage played sped-up, about 6x speed, like a viral cleanup and renovation time-lapse), aspect ratio ${config.aspect}, that starts EXACTLY from the attached image (it is the first frame of the video).`,
      `${step.parts > 1 ? `STEP ${step.step} of ${step.steps}, part ${step.part} of ${step.parts}` : `STEP ${step.step} of ${step.steps}`}: ${themeOf(config.theme).person ? 'the person ' + step.en : step.en + (config.person && !/\bthe person\b/.test(step.en) ? ' (done by the person in the scene)' : '')}.`,
      step.parts > 1 && step.part < step.parts
        ? `Show this work being done ${fast} in one smooth continuous action, but do NOT finish this step yet: the person is still in the middle of the work at the end, and the next clip continues exactly this movement.`
        : `Show this work being done ${fast} in one smooth continuous action. By the end of the clip this step is clearly finished and the scene is ready for the next step.${last ? ' End with the finished result calm and still for the last second.' : ''}`,
      ...shotLines(config, step, number, total),
      sceneBible(config),
      lock,
      ...effortLines(config, step, number, total),
      ...itemLines(step, number),
      sv ? PACE_TEXT[pace] : 'Pace: fast and energetic, as in a sped-up video; quick hands, quick steps, fast tool movements and rapid progress. Never slow motion, never slow or calm movement.',
      'Realism: it must look like a real person really doing this job. Natural human movement, real weight and real physics. Every change in the scene is made visibly by the person with their own hands and real tools; nothing ever changes by itself, by magic or by a cut.',
      sv ? TECHNIQUE : '',
      sv ? amountLine(config.seconds) : '',
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
  const SAME_BUILD = 'The thing being built keeps its exact shape, size, position, material and color in every picture; only how much of it is built changes, never a different object.';
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
    const sv = Boolean(themeOf(config.theme).survival), r = clipIndex / total, lock = sv ? lockOf(config, step) : '';
    const mood = sv
      ? (r < 0.6 ? 'calm and fresh, at most a faint shine of sweat' : 'calm, with slightly damp hair and a little tired')
      : (r < 0.25 ? 'fresh with a little sweat' : r < 0.6 ? 'sweaty, hair damp, sweat on the face and neck' : 'soaked in sweat, dirty and visibly tired');
    return [
      'Edit the attached photo. Keep exactly the same place, the same building or object, the same viewpoint and framing, the same light and the same person (same face, hair, body and clothes) as in the attached photo.',
      config.person ? `The person in the picture is ${config.personDesc}, ${config.faceless ? 'seen from behind or from far away' : 'seen clearly'}, working in the scene, ${mood}. The person holds only the one tool that this moment of the work needs, and nothing else in the hands.` : '',
      sv ? SAME_BUILD : SAME_HOUSE,
      lock,
      `Change only the state of the work so that the picture shows this moment: ${progress}.`,
      'Everything that is not mentioned keeps exactly the same shape, size, position and color as in the attached photo.',
      IMG_RATIO[config.aspect],
      sv && themeOf(config.theme).shotOut ? `View: ${themeOf(config.theme).shotOut}.` : 'Wide shot that shows the whole place clearly.',
      sv ? LOCKED_BUILD : LOCKED,
      SAFE_PEOPLE_IMAGE,
      'Sharp, crisp, high-detail photograph look, natural colors and real textures; not animation, not a painting, not CGI.',
      'No text, lettering, numbers, logos, watermarks or captions in the image.'
    ].filter(Boolean).join('\n');
  }

  // Việc đưa vào hàng đợi. Cảnh 1 làm từ ảnh gốc (ảnh người dùng chọn, hoặc ảnh Muse tạo trước); cảnh k>1 làm từ KHUNG CUỐI THẬT của cảnh k-1 (tool tự cắt bằng FFmpeg).
  function buildJobs(config, { storyId, photo = '', accounts = 1 } = {}) {
    config = withPhoto(config, photo);
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
    const survival = /Pace: (FAST-FORWARD|REAL TIME|SLOW AND CAREFUL)/.test(String(clips[0].prompt));   // truyện sinh tồn: ảnh mốc dùng chữ sinh tồn
    const cfg = { stepList, aspect, person: false, theme: survival ? 'cabin' : 'house_in' };
    const base = clips[0].refList && clips[0].refList[0];
    const flow = clips[0].provider === 'flow' ? { provider: 'flow', aspect: clips[0].aspect } : {};
    let nextImage = Math.max(1, ...images.map(j => j.number || 0)) + 1;
    const result = { changes: [], images: [], seams: [] };
    splits.sort((a, b) => a - b).forEach(at => {
      const c = clips[at], m = parsed[at], k = nextImage++;
      const step = { step: Number(m[1]), steps: Number(m[2]), part: Number(m[3] || 1), parts: Number(m[4] || 1) };
      result.images.push({
        kind: 'restore', storyId: c.storyId, phase: 'image', number: k, title: (en ? 'Part start ' : 'Mốc đoạn ') + k,
        prompt: keyframePrompt({ ...cfg, lockText: (/^OBJECT LOCK[^\n]*/m.exec(String(c.prompt)) || [''])[0] }, step, at, clips.length), references: [],
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
