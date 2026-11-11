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
  const MAX_CLIPS = 720;                                // 120 phút ÷ 10 giây
  const SECONDS = [5, 6, 8, 10];
  const MAX_SECONDS = 10;
  const MAX_CUSTOM = 20;
  const NO_SPEECH = 'Audio: no speech, no dialogue, no singing, no narration, no music, no sound effects, no ambient noise - the video must be completely silent with no audio at all.';
  // Muse từ chối video có người thật / người nổi tiếng / nhân vật có bản quyền («blocked by policy»). Mọi prompt đều nói rõ người trong cảnh là người vô danh, hư cấu.
  // Đồng nhất là điều quan trọng nhất: mọi prompt lặp nguyên văn danh sách «không được đổi».
  const LOCKED = 'LOCKED - these never change unless the current step is working on them: the shape, size and style of the building or the room, the exact number and position of the windows and doors, the roof and the wall layout, the surroundings and the background, the direction of the light and the weather, the colors of everything this step does not touch, and the person\'s face, hair, skin, body size and clothes.';
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

  // Mỗi chủ đề: base = hiện trạng ban đầu (dùng khi để Muse tạo ảnh gốc); steps = 15 việc nối tiếp nhau (vi = nhãn trên thẻ, en = việc làm trong clip).
  const THEMES = [
    {
      id: 'house_full', label: 'Dọn nhà bỏ hoang · cả ngôi nhà (ngoài → trong → hoàn thiện)', hint: 'Ảnh gốc: TOÀN CẢNH mặt ngoài ngôi nhà hoang rậm rạp. Video đi đúng thứ tự: toàn cảnh → dọn bên ngoài → vào dọn bên trong → sơn sửa → lắp đèn, thiết bị → hoàn thiện như nhà mới.', person: false, personDefault: WORKER, forceVaried: true,
      place: 'an old abandoned house with its overgrown yard, seen from outside first and later from inside', placeholder: 'Ví dụ: nhà gạch hai tầng bỏ hoang trên đồi, cỏ cao quá đầu, dây leo phủ kín tường, cửa sổ vỡ',
      base: 'tall weeds and vines covering the walls and the whole yard, broken windows, peeling paint, a collapsed fence, junk and trash everywhere',
      steps: [
        ['Toàn cảnh nhà hoang', 'the whole abandoned house stands overgrown with tall weeds, vines and trash while the wind moves the grass; the person arrives at the gate carrying tools and looks at the house'],
        ['Phát quang cỏ dại', 'the tall weeds, vines and bushes around the house are cut down and cleared away until the walls and the ground are visible'],
        ['Dọn rác ngoài sân', 'junk, trash and fallen branches in the yard are collected and hauled away, and the yard is raked clean'],
        ['Rửa tường ngoài', 'the dirty outer walls and the front door area are pressure-washed, the moss, dirt and stains wash away'],
        ['Vào nhà', 'the person opens the front door and walks in; the camera follows inside and shows the dusty, dirty interior with cobwebs, trash and broken furniture'],
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
        ['Hoàn thiện như nhà mới', 'the camera shows the whole house from outside, now repaired, freshly painted, with a tidy garden and warm lights glowing inside through the windows, looking brand new, while the person stands by the gate and looks at the finished house']
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
    house_full: { label: 'Abandoned house · the whole house (outside → inside → finished)', hint: 'Start photo: a WIDE view of the overgrown outside of the abandoned house. The video follows the real order: wide view → clean outside → go in and clean inside → repairs and paint → lights and fittings → finished like new.', placeholder: 'e.g. two-story brick house on a hill, grass taller than a person, vines over the walls, broken windows',
      titles: ['Abandoned house overview', 'Cut the weeds', 'Clear yard trash', 'Wash outer walls', 'Walk inside', 'Haul out trash', 'Sweep dust and cobwebs', 'Scrub walls and floor', 'Tear out damaged parts', 'Patch walls and ceiling', 'Sand smooth', 'Prime the walls', 'Paint the walls', 'Lay new flooring', 'Fit windows and doors', 'Install wiring and lights', 'Install kitchen and fittings', 'Furnish and decorate', 'Paint outside and garden', 'Finished like new'] },
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
    const person = theme.person ? true : input.person !== false;      // luôn có người làm việc (mặc định bật; sinh tồn không tắt được), nếu không việc dọn tự xảy ra nhìn rất giả
    const custom = String(input.customSteps == null ? '' : input.customSteps).split(/\r?\n/).map(s => clean(s, 200)).filter(Boolean).slice(0, MAX_CUSTOM);
    return {
      theme: theme.id,
      place: clean(input.place, 300),
      minutes, seconds: minutes >= LONG_MINUTES ? MAX_SECONDS : Math.min(MAX_SECONDS, seconds),
      aspect: ASPECTS.includes(input.aspect) ? input.aspect : '16:9',
      person, personDesc: clean(input.personDesc, 300) || theme.personDefault,
      lang: input.lang === 'en' ? 'en' : 'vi',
      light: clean(input.light, 200) || DEFAULT_LIGHT,
      anchor: Boolean(input.anchor),
      camera: !theme.forceVaried && input.camera === 'fixed' ? 'fixed' : 'varied',   // nhà đi từ ngoài vào trong thì không thể cố định một góc      // xen kẽ cảnh xa / vừa / gần (như video làm nhà thật) hoặc một góc cố định
      faceless: Boolean(input.faceless),                 // mặc định CÓ mặt (như video mẫu); bật «không lộ mặt» thì Muse ít từ chối hơn và người ít bị lệch
      customSteps: custom
    };
  }

  // Số cảnh = số phút ÷ số giây mỗi cảnh (làm tròn lên, tối thiểu 2).
  const clipCount = config => Math.max(2, Math.min(MAX_CLIPS, Math.ceil(config.minutes * 60 / config.seconds)));

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
        : 'Camera: smooth, steady cinematic camera moves (slow push-in and pull-out) between wide, medium and close-up views of the SAME place, like a professional renovation video; the place, the lighting and the lens look stay identical; no jump cuts, no shaking, no handheld wobble.',
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

  // Cảnh xa / vừa / gần: mỗi clip kết thúc ở một cỡ cảnh, clip sau bắt đầu đúng từ khung cuối đó rồi chuyển tiếp bằng chuyển động máy mượt (không cắt nhảy).
  // Cuối mỗi bước luôn lùi ra CẢNH XA để thấy công việc đã xong; các phần giữa của một bước xen kẽ cảnh vừa, cận tay / dụng cụ và cận mặt.
  function shotLines(config, step, number, total) {
    const face = config.person && !config.faceless, person = config.person;
    const SHOT = {
      wide: 'a WIDE shot that shows the whole place and all the progress made so far',
      medium: person ? `a MEDIUM shot of the person at work, ${face ? 'the face and the upper body clearly visible' : 'the body seen from behind or the side'}, with the work area around` : 'a MEDIUM shot of the work area and the work in progress',
      hands: person ? 'a CLOSE-UP of the hands, the tools and the material being worked on, in sharp detail' : 'a CLOSE-UP of the tools, the material and the surface being worked on, in sharp detail',
      face: 'a CLOSE-UP of the person\'s face and shoulders while working, the face clearly visible, calm natural expression'
    };
    const cycle = face ? ['medium', 'hands', 'face', 'medium', 'hands'] : ['medium', 'hands'];
    const lastOfStep = number === total || step.part >= step.parts;
    if (config.camera === 'fixed') return [];
    if (lastOfStep) {
      const mid = cycle[(number - 1) % cycle.length];
      return [`SHOT: start from the attached frame; during the clip the camera moves smoothly in to ${SHOT[mid]} while the work happens, then pulls smoothly back out and settles on ${SHOT.wide}, with the same wide framing, viewpoint, angle and distance as the wide view used in the rest of this video, for the last two seconds, so the finished step is clearly visible. No jump cuts.`];
    }
    const end = cycle[(step.part - 1) % cycle.length];
    return [`SHOT: start from the attached frame and move the camera smoothly to ${SHOT[end]}; the clip ends on this view and the next clip continues from it. No jump cuts.`];
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
      'Pace: fast and energetic, as in a sped-up video; quick hands, quick steps, fast tool movements and rapid progress. Never slow motion, never slow or calm movement.',
      'Realism: it must look like a real person really doing this job. Natural human movement, real weight and real physics. Every change in the scene is made visibly by the person with their own hands and real tools; nothing ever changes by itself, by magic or by a cut.',
      'Continuity: the attached image shows the exact current state. Keep the same place, the same viewpoint, the same lighting and everything already done exactly as in the image. Do not add, remove, move or change anything except what this step does. Do not cut to another scene.',
      first ? '' : 'This clip continues directly from the previous clip without any jump: the person keeps the same pose, the same tool in the hands and the same movement as in the attached frame, and goes on working.',
      NO_SPEECH,
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

  // Việc đưa vào hàng đợi. Cảnh 1 làm từ ảnh gốc (ảnh người dùng chọn, hoặc ảnh Muse tạo trước); cảnh k>1 làm từ KHUNG CUỐI THẬT của cảnh k-1 (tool tự cắt bằng FFmpeg).
  function buildJobs(config, { storyId, photo = '' } = {}) {
    const steps = stepsOf(config), total = steps.length, jobs = [];
    const base = photo ? null : { kind: 'restore', storyId, phase: 'image', number: 1, title: config.lang === 'en' ? 'Original photo' : 'Ảnh gốc', prompt: baseImagePrompt(config), references: [] };
    if (base) jobs.push(base);
    steps.forEach((step, i) => {
      const number = i + 1;
      const needs = number === 1 ? (photo ? [] : [{ phase: 'image', number: 1 }]) : [{ phase: 'clip', number: number - 1 }];
      const refList = number === 1 ? [photo ? { file: photo } : { phase: 'image', number: 1 }] : [{ phase: 'clip', number: number - 1, part: 'lastFrame' }];
      if (config.anchor && number > 1) {
        // Neo ảnh gốc (thử nghiệm): đính kèm thêm ảnh gốc làm mốc kiến trúc/người.
        refList.push(photo ? { file: photo } : { phase: 'image', number: 1 });
        if (!photo) needs.push({ phase: 'image', number: 1 });
      }
      let prompt = clipPrompt(config, step, number, total, { first: number === 1 });
      if (config.anchor && number > 1) prompt += '\nThe second attached image is only a reference of the ORIGINAL place and person: keep the architecture, the viewpoint and the person\'s face and clothes consistent with it, but the video itself must start from the FIRST attached image and show the progress already made.';
      jobs.push({
        kind: 'restore', storyId, phase: 'clip', number, title: step.title, prompt, durationSeconds: config.seconds,
        references: [], needs, refList
      });
    });
    return jobs;
  }

  const slug = text => String(text || '').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/g, 'd').replace(/Đ/g, 'D').replace(/[^A-Za-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 30);
  function storyIdBase(config) { return slug(themeOf(config.theme).label) || 'DonNha'; }
  function videoTitle(config) { return text(config.theme, config.lang).label; }

  return { ASPECTS, MINUTES, LONG_MINUTES, VERY_LONG_MINUTES, SECONDS, MAX_CLIPS, clipCount, THEMES, EN, text, themeOf, options, stepsOf, sceneBible, baseImagePrompt, clipPrompt, problems, screenText, screenConfig, isPolicyError, safeRetryPrompt, buildJobs, storyIdBase, videoTitle, SURVIVOR, WORKER, DEFAULT_LIGHT };
});
