extends Control
## Playable portrait temple hall: 1,000 indexed cushions, aisle navigation and interactions.
const SHOP_SCRIPT = preload("res://payment_shop.gd")
const PRACTICE_SCRIPT = preload("res://practice_panel.gd")
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

func _ready() -> void:
	mouse_filter = Control.MOUSE_FILTER_STOP
	_load_progress()
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
	save_timer += delta
	if save_timer > 15.0:
		save_timer = 0.0
		_save_progress()
	if joystick.length() > 0.05 and auto_walk:
		auto_walk = false
		auto_path.clear()
		approach_seat = -1
	if auto_walk and auto_path.size() > 0:
		sitting = false
		var waypoint := auto_path[0]
		var remaining := waypoint - player
		if remaining.length() < SPEED * delta + 3.0:
			player = waypoint
			auto_path.remove_at(0)
			if auto_path.is_empty():
				auto_walk = false
				if approach_seat >= 0:
					selected_seat = approach_seat
					approach_seat = -1
					sitting = true
					status_text = "Đang ngồi tại bồ đoàn %d" % (selected_seat + 1)
					_save_progress()
		else:
			movement_facing = remaining.normalized()
			player += movement_facing * SPEED * delta
			footstep_time += delta * 12.0
	if joystick.length() > 0.05:
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
				selected_seat = approach_seat
				approach_seat = -1
				sitting = true
				joystick = Vector2.ZERO
				status_text = "Đã ngồi vào bồ đoàn %d" % (selected_seat + 1)
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
	# Central carpet and horizontal walkways.
	draw_rect(Rect2(Vector2(WORLD_W * 0.5 - AISLE * 0.5, 0) - camera, Vector2(AISLE, WORLD_H)), Color("#a62f2b"))
	draw_rect(Rect2(Vector2(WORLD_W * 0.5 - 6, 0) - camera, Vector2(12, WORLD_H)), Color("#dfae4e"))
	for r in range(5):
		var cross_y := 380.0 + float(r) * STEP_Y * 10.0
		draw_rect(Rect2(Vector2(0, cross_y) - camera, Vector2(WORLD_W, 100)), Color("#b28c61"))
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
			var color := Color("#63bca4") if idx == selected_seat else Color("#c5a45b")
			_ellipse(pos + Vector2(0,4), Vector2(29, 13), Color("#3b241a"))
			_ellipse(pos, Vector2(27, 11), Color("#7d492b"))
			_ellipse(pos + Vector2(0,-2), Vector2(24, 9), color)
			if idx == selected_seat:
				draw_arc(pos, 30, 0, TAU, 20, Color.WHITE, 2)
	# Character: bald head, Vietnamese brown or gray robe.
	var avatar := player - camera
	if sitting:
		_ellipse(avatar + Vector2(0, 20), Vector2(29, 12), Color("#38241b"))
	else:
		draw_rect(Rect2(avatar + Vector2(-14, 13), Vector2(11, 24)), Color("#302521"))
		draw_rect(Rect2(avatar + Vector2(4, 13), Vector2(11, 24)), Color("#302521"))
	var robe := Color("#90969a") if character_gender == 1 else (Color("#79533b") if robe_brown else Color("#90969a"))
	draw_colored_polygon(PackedVector2Array([avatar + Vector2(-23,-12),avatar + Vector2(23,-12),avatar + Vector2(27,22),avatar + Vector2(-27,22)]), robe)
	draw_circle(avatar + Vector2(0,-27), 15, Color("#d9a47a"))
	if character_gender == 1:
		draw_arc(avatar + Vector2(0,-29), 16, PI, TAU, 16, Color("#282324"), 5)
	draw_arc(avatar + Vector2(0,-27), 15, PI, TAU, 16, Color("#966547"), 2)
	for particle in incense:
		var a: float = float(particle["age"])
		var pos: Vector2 = (particle["pos"] as Vector2) - camera + Vector2(sin(a * 4.0) * 13.0, -a * 42.0)
		draw_circle(pos, 7.0 + a * 3.0, Color(0.95,0.92,0.83, (3.0-a) * 0.13))
	# HUD with accessible touch regions.
	draw_rect(Rect2(0,0,w,100), Color(0.11,0.07,0.05,0.92))
	draw_string(ThemeDB.fallback_font, Vector2(18,31), "CHÙA VIỆT ONLINE  |  1.000 BỒ ĐOÀN", HORIZONTAL_ALIGNMENT_LEFT, w-24, 20, Color("#f6d18a"))
	draw_string(ThemeDB.fallback_font, Vector2(18,62), status_text, HORIZONTAL_ALIGNMENT_LEFT, w-24, 15, Color.WHITE)
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
			sitting = not sitting
			status_text = "Đang ngồi thiền" if sitting else "Đã đứng dậy"
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
			selected_seat = best
			approach_seat = best
			status_text = "Bồ đoàn %d/1000 - chọn chỗ ngồi" % (best+1)
			if player.distance_to(_seat_position(best)) < 125.0:
				player = _seat_position(best)
				approach_seat = -1
				sitting = true
				status_text = "Đang ngồi tại bồ đoàn số %d" % (best+1)
			else:
				_navigate_to_seat(best)
				status_text += " (đang tự tìm đường)"
		else:
			incense.append({"pos":world,"age":0.0})

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
