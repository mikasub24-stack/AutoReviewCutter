extends Control
## Playable portrait temple hall: 1,000 indexed cushions, aisle navigation and interactions.
const SHOP_SCRIPT = preload("res://payment_shop.gd")
const PRACTICE_SCRIPT = preload("res://practice_panel.gd")
const MULTIPLAYER_SCRIPT = preload("res://multiplayer.gd")
const CUSHION_ART = preload("res://art/bo_doan.svg")
const ALTAR_ART = preload("res://art/chinh_dien_altar.svg")
const ROWS := 50
const COLS_PER_SIDE := 10
const CAPACITY := ROWS * COLS_PER_SIDE * 2
const STEP_X := 72.0
const STEP_Y := 78.0
const AISLE := 175.0
const WORLD_W := 1720.0
const WORLD_H := 4600.0
const SPEED := 240.0
var player_name := ""
var player := Vector2(WORLD_W * 0.5, 900.0)
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
var shrine_texture: Texture2D
var floor_texture: Texture2D
var character_art: Dictionary = {}
var hud
var ritual := ""
var ritual_time := 0.0
var meditation_seconds := 0.0
var beads_count := 0
var merit := 0
var hall_audio
var hall_voice := ""
var overlay: Control


func _ready() -> void:
	get_tree().quit_on_go_back = false
	mouse_filter = Control.MOUSE_FILTER_STOP
	var voices := DisplayServer.tts_get_voices_for_language("vi")
	if not voices.is_empty():
		hall_voice = voices[0]
	for gender in ["monk","nun"]:
		for robe in ["brown","grey"]:
			for pose in ["standing","seated"]:
				var key: String = gender+"_"+robe+"_"+pose
				character_art[key] = load("res://art/"+key+".svg")
	if ResourceLoader.exists("res://art/characters.png"):
		var sheet: Texture2D = load("res://art/characters.png")
		for key in character_art:
			var column := 2 if key.begins_with("nun") else (0 if "brown" in key else 1)
			var atlas := AtlasTexture.new()
			atlas.atlas = sheet
			atlas.region = Rect2(column*418,760,418,460) if "seated" in key else Rect2(column*418,0,418,735)
			atlas.filter_clip = true
			character_art[key] = atlas
	if ResourceLoader.exists("res://art/stone_floor.png"):
		floor_texture = load("res://art/stone_floor.png")
	if ResourceLoader.exists("res://art/temple_sanctuary.png"):
		shrine_texture = load("res://art/temple_sanctuary.png")
	_load_progress()
	_seed_occupants()
	multiplayer_client = MULTIPLAYER_SCRIPT.new()
	multiplayer_client.display_name = player_name
	add_child(multiplayer_client)
	multiplayer_client.occupancy_changed.connect(_sync_occupancy)
	multiplayer_client.seat_rejected.connect(_seat_denied)
	multiplayer_client.seat_confirmed.connect(_seat_confirmed)
	multiplayer_client.connection_changed.connect(_network_changed)
	hall_audio = preload("res://temple_audio.gd").new()
	add_child(hall_audio)
	hud = preload("res://temple_hud.gd").new()
	add_child(hud)
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

func _process(delta: float) -> void:
	if player_name.is_empty():
		stop_walking()
		queue_redraw()
		return
	elapsed += delta
	if ritual == "meditate" and sitting:
		meditation_seconds += delta
	if ritual == "chant":
		ritual_time += delta
		if ritual_time >= 3.5:
			ritual_time = 0.0
			beads_count = beads_count % 108 + 1
			merit += 1
			_speak_chant()
	if joystick.length() > 0.05 or auto_walk:
		ritual = ""

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
	if joystick.length() > 0.05 and waiting_for_seat:
		waiting_for_seat = false
		selected_seat = -1
		_claim_seat(-1)
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
		var leaving_seat := selected_seat >= 0 and player.distance_to(_seat_position(selected_seat)) < 65.0
		if on_main or on_cross or between_rows or entering_seat or leaving_seat:
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
	_draw_hall()

func _view_start() -> float:
	return clampf(player.y - 470.0, 340.0, WORLD_H - 940.0)

func _view_center() -> float:
	return clampf(player.x,400.0,WORLD_W-400.0)

func _project(world: Vector2) -> Vector2:
	var depth := (world.y - _view_start()) / 940.0
	var spread := lerpf(0.42, 0.78, depth) * size.x / 540.0
	return Vector2(size.x * 0.5 + (world.x - _view_center()) * spread, size.y * 0.43 + depth * size.y * 0.42)

func _unproject(screen: Vector2) -> Vector2:
	var depth := (screen.y - size.y * 0.43) / (size.y * 0.42)
	var spread := lerpf(0.42, 0.78, depth) * size.x / 540.0
	return Vector2((screen.x-size.x*0.5)/spread+_view_center(), _view_start()+depth*940.0)

func _draw_hall() -> void:
	var w := size.x
	var h := size.y
	draw_rect(Rect2(Vector2.ZERO,size),Color("#493126"))
	if shrine_texture != null:
		# Artwork remains scenery; every avatar, seat and control is interactive.
		draw_texture_rect_region(shrine_texture,Rect2(0,65,w,h*0.40),Rect2(0,0,shrine_texture.get_width(),shrine_texture.get_height()*0.48))
	else:
		draw_texture_rect(ALTAR_ART,Rect2(0,75,w,h*0.36),false)
	var horizon := h*0.43
	if floor_texture != null:
		draw_texture_rect(floor_texture,Rect2(0,horizon,w,h-horizon),false,Color("#b5a493"))
	else:
		draw_rect(Rect2(0,horizon,w,h-horizon),Color("#9e876a"))
	var near_y := _view_start()+940.0*(1.0-.43)/.42
	var carpet := PackedVector2Array([_project(Vector2(772.5,_view_start())),_project(Vector2(947.5,_view_start())),_project(Vector2(947.5,near_y)),_project(Vector2(772.5,near_y))])
	draw_colored_polygon(carpet,Color("#8f292b"))
	for side in [-1.0,1.0]:
		var edge: float = WORLD_W*.5+float(side)*AISLE*.5
		draw_line(_project(Vector2(edge,_view_start())),_project(Vector2(edge,near_y)),Color("#e2b963"),3,true)
		draw_line(_project(Vector2(edge+side*9,_view_start())),_project(Vector2(edge+side*9,near_y)),Color("#bc8650"),2,true)
		for trim in range(30):
			var world_y := _view_start()+float(trim)*45.0
			var ornament := _project(Vector2(edge-side*10,world_y))
			draw_arc(ornament,3,0,TAU,12,Color("#d5a15c"),1,true)
	for i in range(5):
		var center := _project(Vector2(860,_view_start()+130+float(i)*275))
		draw_texture_rect(preload("res://art/ui_lotus.svg"),Rect2(center-Vector2(20,20),Vector2(40,40)),false,Color(1.0,.85,.6,.65))
	var first := maxi(0,int((_view_start()-420.0)/STEP_Y))
	var last := mini(ROWS-1,first+13)
	var actors: Array[Dictionary] = []
	for row in range(first,last+1):
		for col in range(20):
			var idx := row*20+col
			var world := _seat_position(idx)
			var pos := _project(world)
			if pos.y < horizon or pos.y > h*.87:
				continue
			var scale_value := clampf((pos.y-horizon)/(h*.42),0.0,1.0)
			var cushion_size := Vector2(23,12).lerp(Vector2(49,25),scale_value)*w/540.0
			draw_texture_rect(CUSHION_ART,Rect2(pos-cushion_size*.5,cushion_size),false)
			if idx == selected_seat:
				_ellipse(pos, cushion_size*.55,Color(1.0,.85,.35,.25))
			if occupied_seats.has(idx):
				var style := int(occupied_seats[idx])
				var gender := 1 if style == 1 else 0
				var robe := 0 if style == 0 else 1
				var peer_name := ""
				if multiplayer_client.connected:
					var peer: Dictionary = multiplayer_client.remote_players.get(style,{})
					gender = int(peer.get("gender",0))
					robe = int(peer.get("robe",0))
					peer_name = str(peer.get("name","Khách"))
				actors.append({"pos":world,"gender":gender,"robe":robe,"name":peer_name,"sit":true,"self":false})
	if multiplayer_client.connected:
		for id in multiplayer_client.remote_players:
			var peer: Dictionary = multiplayer_client.remote_players[id]
			if int(peer.get("seat",-1)) < 0:
				actors.append({"pos":Vector2(float(peer.get("x",860)),float(peer.get("y",900))),"gender":int(peer.get("gender",0)),"robe":int(peer.get("robe",0)),"name":str(peer.get("name","Khách")),"sit":false,"self":false})
	actors.append({"pos":player,"gender":character_gender,"robe":0 if robe_brown else 1,"name":player_name,"sit":sitting,"self":true})
	actors.sort_custom(func(a: Dictionary,b: Dictionary) -> bool: return a.pos.y < b.pos.y)
	for actor in actors:
		_draw_actor(actor)
	for particle in incense:
		var age := float(particle.age)
		var point := _project(particle.pos) + Vector2(sin(age*3)*8,-age*32)
		draw_circle(point,4+age*4,Color(.97,.93,.82,(3-age)*.15))

func _draw_actor(actor: Dictionary) -> void:
	var point := _project(actor.pos)
	if point.y < size.y*.42 or point.y > size.y*.90 or point.x < -40 or point.x > size.x+40:
		return
	var depth := clampf((point.y-size.y*.43)/(size.y*.42),0.0,1.0)
	var height := lerpf(40,85,depth)*size.x/540.0
	var own: bool = actor.self
	if own:
		height *= 1.3
	if own:
		_ellipse(point+Vector2(0,3),Vector2(height*.36,height*.10),Color(1.0,.72,.2,.23))
		var ring := PackedVector2Array()
		for step in range(49):
			var a := float(step)*TAU/48.0
			ring.append(point+Vector2(cos(a)*height*.35,sin(a)*height*.10+3))
		draw_polyline(ring,Color("#f4d38a"),2,true)
	var pose := "seated" if actor.sit else "standing"
	var key := ("nun" if actor.gender == 1 else "monk")+"_"+("brown" if actor.robe == 0 else "grey")+"_"+pose
	var texture: Texture2D = character_art[key]
	var sprite_height := height * (0.62 if actor.sit else 1.0)
	var sprite_width := sprite_height * texture.get_width()/texture.get_height()
	var bob := sin(footstep_time)*1.4 if own and not sitting and (auto_walk or joystick.length()>.05) else 0.0
	draw_texture_rect(texture,Rect2(point+Vector2(-sprite_width*.5,-sprite_height+bob),Vector2(sprite_width,sprite_height)),false)
	if own or not str(actor.get("name","")).is_empty():
		var label_y := point.y-sprite_height-27
		for entry in [[str(actor.get("name","Đạo hữu")),Color("#fff1c9")]] + ([["‹ Đệ Tử ›",Color("#a8d785")]] if own else []):
			var text_width := ThemeDB.fallback_font.get_string_size(entry[0],HORIZONTAL_ALIGNMENT_LEFT,-1,15).x
			draw_string_outline(ThemeDB.fallback_font,Vector2(point.x-text_width*.5,label_y),entry[0],HORIZONTAL_ALIGNMENT_LEFT,-1,15,4,Color("#21170f"))
			draw_string(ThemeDB.fallback_font,Vector2(point.x-text_width*.5,label_y),entry[0],HORIZONTAL_ALIGNMENT_LEFT,-1,15,entry[1])
			label_y += 19

func _ellipse(center: Vector2, radius: Vector2, color: Color) -> void:
	var points := PackedVector2Array()
	for i in range(25):
		var angle := float(i) * TAU / 24.0
		points.append(center + Vector2(cos(angle) * radius.x, sin(angle) * radius.y))
	draw_colored_polygon(points, color)

func _gui_input(event: InputEvent) -> void:
	if event is InputEventScreenTouch and event.pressed:
		_touch_down(event.position,event.index)
	elif event is InputEventMouseButton and event.pressed and event.button_index == MOUSE_BUTTON_LEFT:
		_touch_down(event.position)

func _touch_down(pos: Vector2, touch_id: int = -1) -> void:
	if overlay != null and is_instance_valid(overlay):
		return
	if pos.y < size.y*.43 or pos.y > size.y*.85:
		return
	var world := _unproject(pos)
	if true:
		var best := -1
		var distance := 58.0
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
		stop_walking()
		_save_progress()
	if what == NOTIFICATION_WM_GO_BACK_REQUEST:
		if overlay != null and is_instance_valid(overlay):
			overlay.queue_free()
		else:
			action("pause")

func _save_progress() -> void:
	var file := FileAccess.open("user://temple_progress.json", FileAccess.WRITE)
	if file == null:
		return
	file.store_string(JSON.stringify({"name":player_name,"x":player.x,"y":player.y,"seat":selected_seat,"robe_brown":robe_brown,"gender":character_gender,"beads":beads_count,"meditation_seconds":meditation_seconds,"merit":merit}))

func _load_progress() -> void:
	if not FileAccess.file_exists("user://temple_progress.json"):
		return
	var parsed: Variant = JSON.parse_string(FileAccess.get_file_as_string("user://temple_progress.json"))
	if typeof(parsed) != TYPE_DICTIONARY:
		return
	var data: Dictionary = parsed
	player_name = clean_player_name(str(data.get("name","")))
	player = Vector2(clampf(float(data.get("x",player.x)),30.0,WORLD_W-30.0),clampf(float(data.get("y",player.y)),340.0,WORLD_H-80.0))
	selected_seat = clampi(int(data.get("seat",-1)),-1,CAPACITY-1)
	robe_brown = bool(data.get("robe_brown",true))
	character_gender = clampi(int(data.get("gender",0)),0,1)
	beads_count = clampi(int(data.get("beads",0)),0,108)
	meditation_seconds = maxf(0,float(data.get("meditation_seconds",0)))
	merit = maxi(0,int(data.get("merit",0)))

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
		player = _seat_position(index)
		sitting = true
		ritual = "meditate"
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
		sitting = false
		ritual = ""
		_seed_occupants()
		status_text = "Chế độ ngoại tuyến - khách mô phỏng"

func _sync_occupancy() -> void:
	if multiplayer_client == null or not multiplayer_client.connected:
		return
	occupied_seats.clear()
	for seat in multiplayer_client.occupants:
		occupied_seats[int(seat)] = multiplayer_client.occupants[seat]
	occupant_count = occupied_seats.size()
	queue_redraw()

func _seat_confirmed(index: int) -> void:
	waiting_for_seat = false
	if index >= 0 and selected_seat != index:
		# A late acknowledgement must not put the avatar in an abandoned seat.
		_claim_seat(-1)
		return
	if index >= 0:
		player = _seat_position(index)
		sitting = true
		ritual = "meditate"
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


func stop_walking() -> void:
	joystick = Vector2.ZERO
	joystick_active = false
	joystick_touch_id = -1
	auto_walk = false
	auto_path.clear()
	approach_seat = -1

func open_panel(script: Script) -> void:
	DisplayServer.tts_stop()
	stop_walking()
	ritual = ""
	if overlay != null and is_instance_valid(overlay):
		overlay.queue_free()
	overlay = Control.new()
	overlay.set_script(script)
	add_child(overlay)

func action(kind: String) -> void:
	if kind != "chant":
		DisplayServer.tts_stop()
	stop_walking()
	match kind:
		"practice": open_panel(PRACTICE_SCRIPT)
		"shop": open_panel(SHOP_SCRIPT)
		"character":
			if character_gender == 0 and robe_brown:
				robe_brown = false
			elif character_gender == 0:
				character_gender = 1
			else:
				character_gender = 0
				robe_brown = true
			status_text = "Đã đổi trang phục nhân vật"
		"meditate":
			if sitting:
				sitting = false
				_claim_seat(-1)
				ritual = ""
				status_text = "Đã đứng dậy"
			elif selected_seat >= 0 and player.distance_to(_seat_position(selected_seat)) < 125:
				_begin_sitting(selected_seat)
				ritual = "meditate"
			else:
				status_text = "Chạm một bồ đoàn trống để đến ngồi thiền"
		"chant":
			ritual = "chant"
			ritual_time = 0.0
			beads_count = beads_count % 108 + 1
			merit += 1
			_speak_chant()
			hall_audio.trigger("wood")
			status_text = "Nam mô A Di Đà Phật"
		"incense":
			hall_audio.trigger("incense")
			for i in range(8):
				incense.append({"pos":player+Vector2(float(i-4)*4,-45),"age":float(i)*.1})
			merit += 1
			status_text = "Đã dâng hương • Nguyện tâm an lành"
		"pause":
			ritual = ""
			hall_audio.set_ambient(false)
			status_text = "Đã tạm dừng tu tập"
	_save_progress()

func _speak_chant() -> void:
	if not hall_voice.is_empty():
		DisplayServer.tts_speak("Nam mô A Di Đà Phật",hall_voice,60,1.0,0.78,0,true)

func _exit_tree() -> void:
	DisplayServer.tts_stop()

func clean_player_name(value: String) -> String:
	var clean := " ".join(value.strip_edges().split(" ",false))
	if clean.length() < 2 or clean.length() > 20:
		return ""
	var allowed := RegEx.new()
	allowed.compile("^[\\p{L}\\p{M}\\p{N} ._'’-]+$")
	return clean if allowed.search(clean) != null else ""

func set_player_name(value: String) -> bool:
	var clean := clean_player_name(value)
	if clean.is_empty():
		return false
	player_name = clean
	_save_progress()
	multiplayer_client.set_display_name(clean)
	status_text = "Chào mừng " + player_name + " đến chính điện!"
	queue_redraw()
	return true
