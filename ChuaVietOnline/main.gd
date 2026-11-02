extends Control
## Playable portrait temple hall: 1,000 indexed cushions, aisle navigation and interactions.
const SHOP_SCRIPT = preload("res://payment_shop.gd")
const PRACTICE_SCRIPT = preload("res://practice_panel.gd")
const MULTIPLAYER_SCRIPT = preload("res://multiplayer.gd")
const ROWS := 50
const COLS_PER_SIDE := 10
const CAPACITY := ROWS * COLS_PER_SIDE * 2
const STEP_X := 72.0
const STEP_Y := 78.0
const AISLE := 175.0
const WORLD_W := 1720.0
const WORLD_H := 4600.0
const SPEED := 240.0
var player := Vector2(WORLD_W * 0.5, WORLD_H - 330.0)
var selected_seat := -1
var joystick := Vector2.ZERO
var joystick_active := false
var joystick_origin := Vector2.ZERO
var elapsed := 0.0
var status_text := "Di chuyển theo lối đi, chạm bồ đoàn để ngồi"
var sitting := false
var robe_brown := true
var incense: Array[Dictionary] = []
var last_touch := Vector2.ZERO
var approach_seat := -1
var movement_facing := Vector2(0, -1)
var joystick_touch_id := -1
var character_gender := 0
var footstep_time := 0.0
var save_timer := 0.0
var auto_path: Array[Vector2] = []
var auto_walk := false
var altar_glow := 0.0
# Local occupancy registry; server synchronization is required for real multiplayer.
var occupied_seats: Dictionary = {}
var occupant_count := 0
var occupancy_notice := 0.0
var multiplayer_client
var network_tick := 0.0
var waiting_for_seat := false
var seat_request_timeout := 0.0

func _ready() -> void:
	mouse_filter = Control.MOUSE_FILTER_STOP
	_load_progress()
	_seed_occupants()
	multiplayer_client = MULTIPLAYER_SCRIPT.new()
	add_child(multiplayer_client)
	multiplayer_client.occupancy_changed.connect(_sync_occupancy)
	multiplayer_client.seat_rejected.connect(_seat_denied)
	multiplayer_client.seat_confirmed.connect(_seat_confirmed)
	multiplayer_client.connection_changed.connect(_network_changed)
	set_process(true)
	queue_redraw()

func _seat_position(index: int) -> Vector2:
	var row := int(index / (COLS_PER_SIDE * 2))
	var within := index % (COLS_PER_SIDE * 2)
	var left := within < COLS_PER_SIDE
	var col := within if left else within - COLS_PER_SIDE
	var edge := WORLD_W * 0.5 - AISLE * 0.5
	var x := edge - (COLS_PER_SIDE - col) * STEP_X if left else WORLD_W * 0.5 + AISLE * 0.5 + (col + 1) * STEP_X
	return Vector2(x, 420.0 + row * STEP_Y)

func _camera() -> Vector2:
	return Vector2(clampf(player.x - size.x * 0.5, 0.0, maxf(0.0, WORLD_W - size.x)), clampf(player.y - size.y * 0.55, 0.0, maxf(0.0, WORLD_H - size.y)))

func _process(delta: float) -> void:
	elapsed += delta
	occupancy_notice = maxf(0.0, occupancy_notice - delta)
	if waiting_for_seat:
		seat_request_timeout -= delta
		if seat_request_timeout <= 0.0:
			waiting_for_seat = false
			sitting = false
			selected_seat = -1
			_claim_seat(-1)
			status_text = "Máy chủ chưa phản hồi. Vui lòng thử lại."
	network_tick += delta
	if network_tick >= 0.15:
		network_tick = 0.0
		if multiplayer_client != null:
			multiplayer_client.send_position(player,character_gender,0 if robe_brown else 1)
	save_timer += delta
	if save_timer > 15.0:
		save_timer = 0.0
		_save_progress()
	if joystick.length() > 0.05 and auto_walk:
		auto_walk = false
		auto_path.clear()
		approach_seat = -1
	if auto_walk and auto_path.size() > 0:
		if sitting:
			_claim_seat(-1)
		sitting = false
		var waypoint := auto_path[0]
		var remaining := waypoint - player
		if remaining.length() < SPEED * delta + 3.0:
			player = waypoint
			auto_path.remove_at(0)
			if auto_path.is_empty():
				auto_walk = false
				if approach_seat >= 0:
					if occupied_seats.has(approach_seat):
						status_text = "Bồ đoàn đã có người ngồi, vui lòng chọn chỗ khác"
						occupancy_notice = 3.0
						approach_seat = -1
						queue_redraw()
						return
					selected_seat = approach_seat
					approach_seat = -1
					_begin_sitting(selected_seat)
					_save_progress()
		else:
			movement_facing = remaining.normalized()
			player += movement_facing * SPEED * delta
			footstep_time += delta * 12.0
	if joystick.length() > 0.05:
		if sitting:
			_claim_seat(-1)
			sitting = false
		movement_facing = joystick.normalized()
		footstep_time += delta * 12.0
		var next := player + joystick.normalized() * SPEED * delta
		next.x = clampf(next.x, 30.0, WORLD_W - 30.0)
		next.y = clampf(next.y, 340.0, WORLD_H - 80.0)
		# Cushions occupy two wings; the main and cross aisles stay open.
		var on_main := absf(next.x - WORLD_W * 0.5) < AISLE * 0.47
		var cross_offset := fposmod(next.y - 380.0, STEP_Y * 10.0)
		var on_cross := cross_offset < 105.0
		# Narrow paths between cushion rows remain walkable.
		var seat_lane := fposmod(next.y - 420.0, STEP_Y)
		var between_rows := seat_lane > 24.0 and seat_lane < STEP_Y - 24.0
		var entering_seat := approach_seat >= 0 and next.distance_to(_seat_position(approach_seat)) < 125.0
		if on_main or on_cross or between_rows or entering_seat:
			player = next
			sitting = false
			if approach_seat >= 0 and player.distance_to(_seat_position(approach_seat)) < 30.0:
				if occupied_seats.has(approach_seat):
					status_text = "Bồ đoàn đã có người ngồi, vui lòng chọn chỗ khác"
					approach_seat = -1
					return
				selected_seat = approach_seat
				approach_seat = -1
				joystick = Vector2.ZERO
				_begin_sitting(selected_seat)
		else:
			status_text = "Đi theo lối giữa hoặc hành lang ngang"
	for i in range(incense.size() - 1, -1, -1):
		incense[i]["age"] = float(incense[i]["age"]) + delta
		if float(incense[i]["age"]) > 3.0:
			incense.remove_at(i)
	queue_redraw()

func _draw() -> void:
	var w := size.x
	var h := size.y
	var camera := _camera()
	draw_rect(Rect2(Vector2.ZERO, size), Color("#2a1a14"))
	draw_rect(Rect2(-camera, Vector2(WORLD_W, WORLD_H)), Color("#75513b"))
	# Vietnamese timber floorboards and warm brass inlay.
	var board_start := maxi(0,int(camera.y / 48.0)-1)
	var board_end := mini(int(WORLD_H/48.0),int((camera.y+h)/48.0)+1)
	for plank in range(board_start,board_end+1):
		var py := float(plank)*48.0-camera.y
		var timber := Color("#82583c") if plank % 2 == 0 else Color("#765039")
		draw_rect(Rect2(-camera.x,py,WORLD_W,46),timber)
		draw_line(Vector2(-camera.x,py+46),Vector2(WORLD_W-camera.x,py+46),Color("#482d22"),2)
		for joint in range(1,4):
			var px := float(joint)*430.0 + float((plank%3)*140) - camera.x
			draw_line(Vector2(px,py+2),Vector2(px,py+44),Color("#5b392a"),2)
	# Symmetrical hanging lanterns and gilded lotus ornaments.
	var lamp_start := maxi(0,int(camera.y/390.0)-1)
	var lamp_end := mini(int(WORLD_H/390.0),int((camera.y+h)/390.0)+1)
	for lamp_row in range(lamp_start,lamp_end+1):
		var ly := 210.0+float(lamp_row)*390.0-camera.y
		for lx in [WORLD_W*0.5-310.0,WORLD_W*0.5+310.0]:
			var center := Vector2(lx-camera.x,ly)
			draw_line(center+Vector2(0,-53),center+Vector2(0,-24),Color("#d8ae55"),3)
			draw_circle(center,30,Color(1.0,0.75,0.31,0.11))
			draw_colored_polygon(PackedVector2Array([center+Vector2(-18,-23),center+Vector2(18,-23),center+Vector2(24,0),center+Vector2(12,24),center+Vector2(-12,24),center+Vector2(-24,0)]),Color("#bf4b32"))
			draw_line(center+Vector2(-16,-15),center+Vector2(16,-15),Color("#f2ce76"),3)
			draw_line(center+Vector2(-14,13),center+Vector2(14,13),Color("#f2ce76"),3)
			draw_circle(center,9,Color("#ffe8a1"))
			draw_line(center+Vector2(0,24),center+Vector2(0,39),Color("#e5ae4b"),2)
	# Central carpet and horizontal walkways.
	draw_rect(Rect2(Vector2(WORLD_W * 0.5 - AISLE * 0.5, 0) - camera, Vector2(AISLE, WORLD_H)), Color("#a62f2b"))
	draw_rect(Rect2(Vector2(WORLD_W * 0.5 - 6, 0) - camera, Vector2(12, WORLD_H)), Color("#dfae4e"))
	for r in range(5):
		var cross_y := 380.0 + float(r) * STEP_Y * 10.0
		draw_rect(Rect2(Vector2(0, cross_y) - camera, Vector2(WORLD_W, 100)), Color("#b28c61"))
	# Vietnamese temple columns, gilded bases and carved crossbeams.
	var pillar_start := maxi(0, int(camera.y / 500.0) - 1)
	var pillar_end := mini(int(WORLD_H / 500.0), int((camera.y + h) / 500.0) + 1)
	for pillar_row in range(pillar_start, pillar_end + 1):
		var py := 335.0 + float(pillar_row) * 500.0 - camera.y
		for px_world in [48.0, WORLD_W - 48.0, WORLD_W * 0.5 - AISLE * 0.5 - 22.0, WORLD_W * 0.5 + AISLE * 0.5 + 22.0]:
			var px := px_world - camera.x
			draw_rect(Rect2(px - 15.0, py - 120.0, 30.0, 240.0), Color("#50291e"))
			draw_rect(Rect2(px - 20.0, py - 122.0, 40.0, 18.0), Color("#d9a64d"))
			draw_rect(Rect2(px - 21.0, py + 106.0, 42.0, 16.0), Color("#d9a64d"))
			draw_line(Vector2(px - 7.0, py - 98.0), Vector2(px - 7.0, py + 99.0), Color("#9d6036"), 3.0)
		# Red-and-gold horizontal carved timber beam.
		draw_rect(Rect2(-camera.x, py - 143.0, WORLD_W, 19.0), Color("#602f23"))
		draw_line(Vector2(-camera.x, py - 144.0), Vector2(WORLD_W-camera.x, py - 144.0), Color("#d9ac5b"), 3.0)
		for ornament in range(12):
			var ox := float(ornament) * 145.0 + 28.0 - camera.x
			draw_circle(Vector2(ox, py - 133.0), 5.0, Color("#e3b861"))
	# Lotus motifs along the red central carpet.
	var lotus_start := maxi(0, int(camera.y / 210.0) - 1)
	var lotus_end := mini(int(WORLD_H / 210.0), int((camera.y + h) / 210.0) + 1)
	for lotus_row in range(lotus_start, lotus_end + 1):
		var lotus_center := Vector2(WORLD_W * 0.5 - camera.x, float(lotus_row) * 210.0 + 120.0 - camera.y)
		for petal in range(8):
			var angle := TAU * float(petal) / 8.0
			_ellipse(lotus_center + Vector2(cos(angle)*18.0, sin(angle)*18.0), Vector2(7.0, 12.0), Color("#e2a45e"))
		draw_circle(lotus_center, 9.0, Color("#f3d58b"))
	# Sanctuary altar at far end.
	draw_rect(Rect2(Vector2(WORLD_W * 0.5 - 300, 45) - camera, Vector2(600, 235)), Color("#542b1d"))
	draw_rect(Rect2(Vector2(WORLD_W * 0.5 - 265, 62) - camera, Vector2(530, 198)), Color("#bb842c"))
	draw_circle(Vector2(WORLD_W * 0.5, 150) - camera, 77, Color("#f1c56a"))
	draw_circle(Vector2(WORLD_W * 0.5, 145) - camera, 44, Color("#a36a26"))
	# Carved timber beams, lotus halo and a bronze incense urn.
	for beam in range(5):
		var by := 12.0 + float(beam) * 12.0
		draw_rect(Rect2(Vector2(WORLD_W * 0.5 - 330 + beam * 12, by) - camera, Vector2(660 - beam * 24, 8)), Color("#402018"))
	for petal in range(12):
		var angle := float(petal) * TAU / 12.0
		var halo := Vector2(WORLD_W * 0.5, 150) + Vector2(cos(angle), sin(angle)) * 94.0 - camera
		_ellipse(halo, Vector2(15, 24), Color("#f2ca68"))
	var altar_base := Vector2(WORLD_W * 0.5, 252) - camera
	draw_rect(Rect2(altar_base + Vector2(-220, -5), Vector2(440, 17)), Color("#4a241a"))
	draw_rect(Rect2(altar_base + Vector2(-212, -13), Vector2(424, 8)), Color("#d9a34b"))
	for dx in [-158.0, 158.0]:
		var vase := altar_base + Vector2(dx, -26)
		draw_circle(vase, 16, Color("#d9bb70"))
		for p in range(5):
			var a := float(p) * TAU / 5.0
			_ellipse(vase + Vector2(sin(a)*16, -26+cos(a)*9), Vector2(10, 16), Color("#eaa4b8"))
	draw_circle(altar_base + Vector2(0,-16), 25, Color("#8b6a42"))
	for stick in range(5):
		var sx := float(stick-2)*7.0
		draw_line(altar_base + Vector2(sx,-16), altar_base + Vector2(sx,-59), Color("#a65a3b"), 2)
		draw_circle(altar_base + Vector2(sx+sin(elapsed*1.4+stick)*9,-72), 7, Color(0.94,0.91,0.79,0.25))
	for x in [130.0, WORLD_W - 130.0]:
		for y in range(260, int(WORLD_H), 470):
			draw_rect(Rect2(Vector2(x - 24, float(y)) - camera, Vector2(48, 240)), Color("#6e241a"))
			draw_rect(Rect2(Vector2(x - 28, float(y)) - camera, Vector2(56, 14)), Color("#dfb65e"))
	# Only render visible rows: stable performance with 1,000 cushions.
	var first_row := maxi(0, int((camera.y - 460.0) / STEP_Y))
	var last_row := mini(ROWS - 1, int((camera.y + h - 360.0) / STEP_Y) + 2)
	for row in range(first_row, last_row + 1):
		for col in range(COLS_PER_SIDE * 2):
			var idx := row * COLS_PER_SIDE * 2 + col
			var pos := _seat_position(idx) - camera
			var color := Color("#63bca4") if idx == selected_seat and sitting else (Color("#8b6555") if occupied_seats.has(idx) else Color("#c5a45b") )
			_ellipse(pos + Vector2(0,4), Vector2(29, 13), Color("#3b241a"))
			_ellipse(pos, Vector2(27, 11), Color("#7d492b"))
			_ellipse(pos + Vector2(0,-2), Vector2(24, 9), color)
			if occupied_seats.has(idx):
				var visitor_style := int(occupied_seats[idx])
				if multiplayer_client != null and multiplayer_client.connected:
					var peer_id := int(occupied_seats[idx])
					var remote_peer: Dictionary = multiplayer_client.remote_players.get(peer_id,{})
					visitor_style = int(remote_peer.get("gender",0))
				_draw_seated_occupant(pos, visitor_style)
			if idx == selected_seat:
				draw_arc(pos, 30, 0, TAU, 20, Color.WHITE, 2)

	# Visible remote avatars are drawn only while connected to a real server.
	if multiplayer_client != null and multiplayer_client.connected:
		for remote_id in multiplayer_client.remote_players:
			var peer: Dictionary = multiplayer_client.remote_players[remote_id]
			if int(peer.get("seat",-1)) >= 0:
				continue
			var remote_pos := Vector2(float(peer.get("x",860.0)),float(peer.get("y",4270.0))) - camera
			if remote_pos.x < -50.0 or remote_pos.x > w+50.0 or remote_pos.y < 100.0 or remote_pos.y > h-140.0:
				continue
			var remote_robe := Color("#90969a") if int(peer.get("gender",0)) == 1 else Color("#79533b")
			_ellipse(remote_pos+Vector2(0,28),Vector2(18,7),Color(0.1,0.07,0.05,0.35))
			draw_rect(Rect2(remote_pos+Vector2(-12,12),Vector2(9,20)),Color("#302521"))
			draw_rect(Rect2(remote_pos+Vector2(3,12),Vector2(9,20)),Color("#302521"))
			draw_colored_polygon(PackedVector2Array([remote_pos+Vector2(-20,-12),remote_pos+Vector2(20,-12),remote_pos+Vector2(23,20),remote_pos+Vector2(-23,20)]),remote_robe)
			draw_circle(remote_pos+Vector2(0,-27),15,Color("#d9a47a"))
	# Character: bald head, Vietnamese brown or gray robe.
	var walking := not sitting and (auto_walk or joystick.length() > 0.05)
	var gait := sin(footstep_time) * 4.0 if walking else 0.0
	var avatar := player - camera + Vector2(0, absf(gait) * -0.4)
	if sitting:
		_ellipse(avatar + Vector2(0, 20), Vector2(29, 12), Color("#38241b"))
	else:
		draw_rect(Rect2(avatar + Vector2(-14, 13 + gait), Vector2(11, 24)), Color("#302521"))
		draw_rect(Rect2(avatar + Vector2(4, 13 - gait), Vector2(11, 24)), Color("#302521"))
	var robe := Color("#90969a") if character_gender == 1 else (Color("#79533b") if robe_brown else Color("#90969a"))
	draw_colored_polygon(PackedVector2Array([avatar + Vector2(-23,-12),avatar + Vector2(23,-12),avatar + Vector2(27,22),avatar + Vector2(-27,22)]), robe)
	draw_circle(avatar + Vector2(0,-27), 15, Color("#d9a47a"))
	# Small hands make the walking silhouette readable on a phone.
	draw_circle(avatar + Vector2(-24, 4 - gait), 6, Color("#d9a47a"))
	draw_circle(avatar + Vector2(24, 4 + gait), 6, Color("#d9a47a"))
	if character_gender == 1:
		draw_arc(avatar + Vector2(0,-29), 16, PI, TAU, 16, Color("#282324"), 5)
	draw_arc(avatar + Vector2(0,-27), 15, PI, TAU, 16, Color("#966547"), 2)
	for particle in incense:
		var a: float = float(particle["age"])
		var pos: Vector2 = (particle["pos"] as Vector2) - camera + Vector2(sin(a * 4.0) * 13.0, -a * 42.0)
		draw_circle(pos, 7.0 + a * 3.0, Color(0.95,0.92,0.83, (3.0-a) * 0.13))
	# HUD with accessible touch regions.
	draw_rect(Rect2(0,0,w,100), Color(0.11,0.07,0.05,0.92))
	var is_online := multiplayer_client != null and multiplayer_client.connected
	var net_label := "TRỰC TUYẾN" if is_online else "NGOẠI TUYẾN"
	var net_color := Color("#9ad99a") if is_online else Color("#ffcf8c")
	draw_circle(Vector2(w - 28.0, 22.0), 6.0, net_color)
	draw_string(ThemeDB.fallback_font, Vector2(w - 145.0, 28.0), net_label, HORIZONTAL_ALIGNMENT_LEFT, 110, 13, net_color)
	draw_string(ThemeDB.fallback_font, Vector2(18,31), "CHÙA VIỆT ONLINE", HORIZONTAL_ALIGNMENT_LEFT, w-170, 20, Color("#f6d18a"))
	draw_string(ThemeDB.fallback_font, Vector2(18,86), "1.000 bồ đoàn • %d khách" % occupant_count, HORIZONTAL_ALIGNMENT_LEFT, w-24, 14, Color("#f1d4a2"))
	draw_string(ThemeDB.fallback_font, Vector2(18,62), status_text, HORIZONTAL_ALIGNMENT_LEFT, w-24, 15, Color.WHITE)
	if occupancy_notice > 0.0:
		draw_rect(Rect2(22,h*0.40,w-44,88),Color(0.39,0.11,0.08,0.94))
		draw_string(ThemeDB.fallback_font,Vector2(35,h*0.40+35),"BỒ ĐOÀN ĐÃ CÓ NGƯỜI NGỒI",HORIZONTAL_ALIGNMENT_LEFT,w-70,20,Color("#ffe0a6"))
		draw_string(ThemeDB.fallback_font,Vector2(35,h*0.40+64),"Vui lòng chọn bồ đoàn khác",HORIZONTAL_ALIGNMENT_LEFT,w-70,17,Color.WHITE)
	draw_rect(Rect2(8, 104, 145, 48), Color("#70442b"))
	draw_string(ThemeDB.fallback_font, Vector2(17,136), "TU TẬP", HORIZONTAL_ALIGNMENT_LEFT, 130, 19, Color.WHITE)
	draw_rect(Rect2(w - 155, 104, 147, 48), Color("#70442b"))
	draw_string(ThemeDB.fallback_font, Vector2(w-145,136), "CỬA HÀNG", HORIZONTAL_ALIGNMENT_LEFT, 135, 19, Color.WHITE)
	draw_rect(Rect2(0,h-170,w,170), Color(0.12,0.08,0.06,0.85))
	var joy_center := Vector2(105,h-84)
	draw_circle(joy_center, 69, Color("#5b4435"))
	draw_arc(joy_center, 69, 0, TAU, 48, Color("#b99962"), 3)
	draw_circle(joy_center + joystick * 40.0, 26, Color("#d8bd8a"))
	draw_rect(Rect2(w-180,h-150,170,55), Color("#75513a"))
	draw_string(ThemeDB.fallback_font, Vector2(w-171,h-115), "NGỒI / ĐỨNG", HORIZONTAL_ALIGNMENT_LEFT, 160, 17, Color.WHITE)
	draw_rect(Rect2(w-180,h-78,170,55), Color("#75513a"))
	draw_string(ThemeDB.fallback_font, Vector2(w-170,h-44), "ĐỔI NHÂN VẬT", HORIZONTAL_ALIGNMENT_LEFT, 160, 17, Color.WHITE)

func _ellipse(center: Vector2, radius: Vector2, color: Color) -> void:
	var points := PackedVector2Array()
	for i in range(25):
		var angle := float(i) * TAU / 24.0
		points.append(center + Vector2(cos(angle) * radius.x, sin(angle) * radius.y))
	draw_colored_polygon(points, color)

func _gui_input(event: InputEvent) -> void:
	if event is InputEventScreenTouch:
		if event.pressed:
			_touch_down(event.position, event.index)
		elif event.index == joystick_touch_id:
			joystick_active = false
			joystick_touch_id = -1
			joystick = Vector2.ZERO
	elif event is InputEventScreenDrag and joystick_active and event.index == joystick_touch_id:
		joystick = ((event.position - joystick_origin) / 60.0).limit_length(1.0)
	elif event is InputEventMouseButton:
		if event.pressed:
			_touch_down(event.position)
		else:
			joystick_active = false
			joystick = Vector2.ZERO
	elif event is InputEventMouseMotion and joystick_active and Input.is_mouse_button_pressed(MOUSE_BUTTON_LEFT):
		joystick = ((event.position - joystick_origin) / 60.0).limit_length(1.0)

func _touch_down(pos: Vector2, touch_id: int = -1) -> void:
	var w := size.x
	var h := size.y
	if pos.y > h - 170 and pos.x < 205:
		joystick_active = true
		joystick_touch_id = touch_id
		joystick_origin = Vector2(105,h-84)
		joystick = ((pos - joystick_origin) / 60.0).limit_length(1.0)
		return
	if pos.y < 155 and pos.y > 100:
		var overlay := Control.new()
		if pos.x < w * 0.5:
			overlay.set_script(PRACTICE_SCRIPT)
		else:
			overlay.set_script(SHOP_SCRIPT)
		add_child(overlay)
		return
	if pos.y > h-170 and pos.x > w-190:
		if pos.y < h-86:
			auto_walk = false
			auto_path.clear()
			approach_seat = -1
			if not sitting and selected_seat >= 0 and occupied_seats.has(selected_seat):
				status_text = "Chỗ đã có người ngồi, vui lòng chọn bồ đoàn khác."
				occupancy_notice = 3.0
				return
			if sitting:
				sitting = false
				_claim_seat(-1)
				status_text = "Đã đứng dậy"
			elif selected_seat >= 0:
				_begin_sitting(selected_seat)
			else:
				status_text = "Hãy chọn một bồ đoàn trước khi ngồi"
		else:
			if character_gender == 0 and robe_brown:
				robe_brown = false
				status_text = "Nam cư sĩ - áo xám"
			elif character_gender == 0:
				character_gender = 1
				status_text = "Nữ Phật tử - áo lam"
			else:
				character_gender = 0
				robe_brown = true
				status_text = "Nam cư sĩ - áo nâu"
			_save_progress()
		return
	if pos.y > 160 and pos.y < h-180:
		var world := pos + _camera()
		var best := -1
		var distance := 40.0
		for row in range(maxi(0,int((world.y-460)/STEP_Y)), mini(ROWS-1,int((world.y-370)/STEP_Y)+1)+1):
			for col in range(COLS_PER_SIDE*2):
				var idx := row*COLS_PER_SIDE*2+col
				var d := _seat_position(idx).distance_to(world)
				if d < distance:
					distance = d
					best = idx
		if best >= 0:
			if waiting_for_seat:
				status_text = "Đang chờ máy chủ xác nhận chỗ ngồi"
				return
			if best == selected_seat and sitting:
				status_text = "Bạn đang ngồi tại bồ đoàn này"
				return
			if occupied_seats.has(best):
				status_text = "Chỗ này đã có người ngồi! Hãy chọn bồ đoàn khác."
				occupancy_notice = 3.0
				return
			if sitting and selected_seat != best:
				_claim_seat(-1)
				sitting = false
			selected_seat = best
			approach_seat = best
			status_text = "Bồ đoàn %d/1000 - chọn chỗ ngồi" % (best+1)
			if player.distance_to(_seat_position(best)) < 125.0:
				player = _seat_position(best)
				approach_seat = -1
				_begin_sitting(best)
			else:
				_navigate_to_seat(best)
				status_text += " (đang tự tìm đường)"
		else:
			incense.append({"pos":world,"age":0.0})

func _notification(what: int) -> void:
	if what == NOTIFICATION_WM_CLOSE_REQUEST or what == NOTIFICATION_APPLICATION_PAUSED:
		_save_progress()

func _save_progress() -> void:
	var file := FileAccess.open("user://temple_progress.json", FileAccess.WRITE)
	if file == null:
		return
	file.store_string(JSON.stringify({"x":player.x,"y":player.y,"seat":selected_seat,"robe_brown":robe_brown,"gender":character_gender}))

func _load_progress() -> void:
	if not FileAccess.file_exists("user://temple_progress.json"):
		return
	var parsed: Variant = JSON.parse_string(FileAccess.get_file_as_string("user://temple_progress.json"))
	if typeof(parsed) != TYPE_DICTIONARY:
		return
	var data: Dictionary = parsed
	player = Vector2(clampf(float(data.get("x",player.x)),30.0,WORLD_W-30.0),clampf(float(data.get("y",player.y)),340.0,WORLD_H-80.0))
	selected_seat = clampi(int(data.get("seat",-1)),-1,CAPACITY-1)
	robe_brown = bool(data.get("robe_brown",true))
	character_gender = clampi(int(data.get("gender",0)),0,1)

func _navigate_to_seat(index: int) -> void:
	var target := _seat_position(index)
	var central_x := WORLD_W * 0.5
	var row_lane_y := target.y + 34.0
	var near_cross := 380.0 + roundf((player.y - 380.0) / (STEP_Y * 10.0)) * STEP_Y * 10.0 + 48.0
	near_cross = clampf(near_cross, 428.0, 3548.0)
	auto_path.clear()
	# Follow a clear horizontal passage, central carpet, then the selected cushion row.
	if absf(player.x - central_x) > AISLE * 0.47:
		auto_path.append(Vector2(player.x, near_cross))
		auto_path.append(Vector2(central_x, near_cross))
	else:
		auto_path.append(Vector2(central_x, player.y))
	auto_path.append(Vector2(central_x, row_lane_y))
	auto_path.append(Vector2(target.x, row_lane_y))
	auto_path.append(target)
	auto_walk = true
	joystick = Vector2.ZERO

func _seed_occupants() -> void:
	# Stable simulated visitors for offline play; never claim these are online players.
	var rng_local := RandomNumberGenerator.new()
	rng_local.seed = 20261102
	occupied_seats.clear()
	for n in range(85):
		var idx := rng_local.randi_range(0, CAPACITY - 1)
		if idx == selected_seat:
			continue
		occupied_seats[idx] = n % 3
	occupant_count = occupied_seats.size()

func _draw_seated_occupant(pos: Vector2, variant: int) -> void:
	var cloth := Color("#7b533d") if variant == 0 else (Color("#929a9c") if variant == 1 else Color("#626e77"))
	_ellipse(pos + Vector2(0,-7), Vector2(18,11), cloth)
	draw_colored_polygon(PackedVector2Array([pos+Vector2(-15,-10),pos+Vector2(15,-10),pos+Vector2(12,-32),pos+Vector2(-12,-32)]), cloth)
	draw_circle(pos + Vector2(0,-41), 10, Color("#d6a37c"))
	if variant == 1:
		draw_arc(pos + Vector2(0,-43), 10, PI, TAU, 12, Color("#252323"), 3)

func _begin_sitting(index: int) -> void:
	if index < 0 or index >= CAPACITY:
		return
	if occupied_seats.has(index):
		status_text = "Chỗ đã có người ngồi, vui lòng chọn bồ đoàn khác."
		occupancy_notice = 3.0
		sitting = false
		return
	selected_seat = index
	if multiplayer_client != null and multiplayer_client.connected:
		sitting = false
		status_text = "Đang xin phép ngồi tại bồ đoàn %d..." % (index + 1)
		_claim_seat(index)
	else:
		sitting = true
		status_text = "Đang ngồi tại bồ đoàn %d" % (index + 1)

func _claim_seat(index: int) -> void:
	if multiplayer_client != null and multiplayer_client.connected:
		waiting_for_seat = index >= 0
		seat_request_timeout = 8.0 if index >= 0 else 0.0
		multiplayer_client.request_seat(index)

func _network_changed(is_connected: bool) -> void:
	if is_connected:
		occupied_seats.clear()
		_sync_occupancy()
		# A locally saved seat is never authoritative after joining a room.
		if sitting and selected_seat >= 0:
			var desired_seat := selected_seat
			sitting = false
			_begin_sitting(desired_seat)
		else:
			status_text = "Đã kết nối chính điện trực tuyến"
	else:
		waiting_for_seat = false
		_seed_occupants()
		status_text = "Chế độ ngoại tuyến - khách mô phỏng"

func _sync_occupancy() -> void:
	if multiplayer_client == null or not multiplayer_client.connected:
		return
	occupied_seats.clear()
	for seat in multiplayer_client.occupants:
		occupied_seats[int(seat)] = 1
	occupant_count = occupied_seats.size()
	queue_redraw()

func _seat_confirmed(index: int) -> void:
	waiting_for_seat = false
	if index >= 0 and selected_seat != index:
		# A late acknowledgement must not put the avatar in an abandoned seat.
		_claim_seat(-1)
		return
	if index >= 0:
		sitting = true
		status_text = "Máy chủ xác nhận bồ đoàn số %d" % (index+1)
	else:
		status_text = "Đã trả lại bồ đoàn"

func _seat_denied(index: int) -> void:
	waiting_for_seat = false
	if selected_seat == index:
		selected_seat = -1
	sitting = false
	auto_walk = false
	auto_path.clear()
	approach_seat = -1
	status_text = "Chỗ đã có người ngồi, vui lòng chọn bồ đoàn khác."
	occupancy_notice = 3.0
	queue_redraw()
