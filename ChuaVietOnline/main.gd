extends Control
## Playable portrait temple hall: 1,000 indexed cushions, aisle navigation and interactions.
const SHOP_SCRIPT = preload("res://payment_shop.gd")
const PRACTICE_SCRIPT = preload("res://practice_panel.gd")
const MULTIPLAYER_SCRIPT = preload("res://multiplayer.gd")
const CUSHION_ART = preload("res://art/meditation_cushion.tres")
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
const RITUAL_ANIMATION = preload("res://ritual_animation.gd")
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
var body_action := "idle"
var body_action_elapsed := 0.0
var practice_stats: Dictionary = {"bows":0,"incense":0,"bells":0,"knocks":0,"flowers":0,"fruits":0,"wheels":0,"mantras":0}
var view_section := 0
var wide_view := false
var ritual_sheets: Dictionary = {}
var ritual_regions: Dictionary = {}
var hall_background: Texture2D
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
	var voices := DisplayServer.tts_get_voices_for_language("vi") if OS.has_feature("android") else PackedStringArray()
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
	if ResourceLoader.exists("res://art/hall_background.png"):
		hall_background = load("res://art/hall_background.png")
	if FileAccess.file_exists("res://art/ritual_atlases.json"):
		var metadata: Dictionary = JSON.parse_string(FileAccess.get_file_as_string("res://art/ritual_atlases.json"))
		for key in metadata:
			ritual_sheets[key] = load("res://art/"+str(metadata[key]["file"]))
			ritual_regions[key] = metadata[key]["frames"]
	_load_progress()
	view_section = clampi(int((player.y-420)/780),0,4)
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
	# Movement interrupts the ritual before its completion can be credited.
	if (joystick.length() > .05 or auto_walk) and body_action != "walk":
		ritual = ""
		_set_body_action("walk")
	body_action_elapsed += delta
	if body_action == "bow" and body_action_elapsed >= RITUAL_ANIMATION.BOW_DURATION:
		practice_stats["bows"] = int(practice_stats["bows"])+1
		merit += 1
		_set_body_action("kneel")
		status_text = "Đã hoàn thành một lạy • Đang quỳ chắp tay"
		_save_progress()
	elif body_action == "incense" and body_action_elapsed >= RITUAL_ANIMATION.INCENSE_DURATION:
		practice_stats["incense"] = int(practice_stats["incense"])+1
		merit += 1
		_set_body_action("kneel")
		status_text = "Đã dâng hương • Nguyện tâm an lành"
		_save_progress()
	elif body_action == "stand" and body_action_elapsed >= .42:
		_set_body_action("idle")
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
		if multiplayer_client.connected and multiplayer_client.own_seat >= 0:
			_claim_seat(-1)
		ritual = ""
		if body_action != "walk":
			_set_body_action("walk")
	elif body_action == "walk":
		_set_body_action("idle")

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
			multiplayer_client.send_action(body_action,body_action_elapsed)
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
		next.y = clampf(next.y,_view_start()+60.0,minf(_view_start()+850.0,WORLD_H-80.0))
		var depth := (next.y-_view_start())/940.0
		var spread := _spread(depth)
		var half_visible := (size.x*.5-48.0)/spread
		next.x = clampf(next.x,WORLD_W*.5-half_visible,WORLD_W*.5+half_visible)
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
	return 340.0+float(view_section)*780.0

func _view_center() -> float:
	return WORLD_W*.5

func _spread(depth: float) -> float:
	return lerpf(.20 if wide_view else .42,.30 if wide_view else 1.10,depth)*size.x/540.0

func _project(world: Vector2) -> Vector2:
	var depth := (world.y - _view_start()) / 940.0
	var spread := _spread(depth)
	return Vector2(size.x * 0.5 + (world.x - _view_center()) * spread, size.y * 0.43 + depth * size.y * 0.42)

func _unproject(screen: Vector2) -> Vector2:
	var depth := (screen.y - size.y * 0.43) / (size.y * 0.42)
	var spread := _spread(depth)
	return Vector2((screen.x-size.x*0.5)/spread+_view_center(), _view_start()+depth*940.0)

func _draw_hall() -> void:
	var w := size.x
	var h := size.y
	if hall_background != null:
		draw_texture_rect(hall_background,Rect2(Vector2.ZERO,size),false)
	else:
		draw_texture_rect(ALTAR_ART,Rect2(0,0,w,h*.48),false)
	var horizon := h*.43
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
			var cushion_size := Vector2(31,16).lerp(Vector2(64,34),scale_value)*w/540.0
			draw_texture_rect(CUSHION_ART,Rect2(pos-cushion_size*.5,cushion_size),false)
			if idx == selected_seat:
				_ellipse(pos, cushion_size*.55,Color(1.0,.85,.35,.25))
			if occupied_seats.has(idx):
				var style := int(occupied_seats[idx])
				var gender := 1 if style == 1 else 0
				var robe := 0 if style == 0 else 1
				var peer_name := ""
				var peer_action := "meditate"
				var peer_elapsed := 1.0
				if multiplayer_client.connected:
					var peer: Dictionary = multiplayer_client.remote_players.get(style,{})
					gender = int(peer.get("gender",0))
					robe = int(peer.get("robe",0))
					peer_name = str(peer.get("name","Khách"))
					peer_action = str(peer.get("pose","meditate"))
					peer_elapsed = _remote_action_elapsed(peer)
				actors.append({"pos":world,"gender":gender,"robe":robe,"name":peer_name,"action":peer_action,"elapsed":peer_elapsed,"sit":true,"self":false})
	if multiplayer_client.connected:
		for id in multiplayer_client.remote_players:
			var peer: Dictionary = multiplayer_client.remote_players[id]
			if int(peer.get("seat",-1)) < 0:
				actors.append({"pos":Vector2(float(peer.get("x",860)),float(peer.get("y",900))),"gender":int(peer.get("gender",0)),"robe":int(peer.get("robe",0)),"name":str(peer.get("name","Khách")),"action":str(peer.get("pose","idle")),"elapsed":_remote_action_elapsed(peer),"sit":false,"self":false})
	actors.append({"pos":player,"gender":character_gender,"robe":0 if robe_brown else 1,"name":player_name,"action":body_action,"elapsed":body_action_elapsed,"sit":sitting,"self":true})
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
	var style := "nun_grey" if actor.gender == 1 else ("monk_brown" if actor.robe == 0 else "monk_grey")
	var visible_height := height
	if ritual_sheets.has(style):
		var sample: Dictionary = RITUAL_ANIMATION.sample(str(actor.get("action","meditate" if actor.sit else "idle")),float(actor.get("elapsed",1.0)))
		var frame: int = int(sample.frame)
		var next_frame: int = int(sample.next)
		var blend: float = float(sample.blend)
		visible_height = _draw_ritual_frame(style,frame,point,height,1.0-blend)
		if blend > 0.0:
			visible_height = maxf(visible_height,_draw_ritual_frame(style,next_frame,point,height,blend))
	else:
		var key := style+("_seated" if actor.sit else "_standing")
		var texture: Texture2D = character_art[key]
		visible_height = height*(.62 if actor.sit else 1.0)
		var width := visible_height*texture.get_width()/texture.get_height()
		draw_texture_rect(texture,Rect2(point+Vector2(-width*.5,-visible_height),Vector2(width,visible_height)),false)
	if own or not str(actor.get("name","")).is_empty():
		var label_y := point.y-visible_height-27
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
	file.store_string(JSON.stringify({"practice_stats":practice_stats,"name":player_name,"x":player.x,"y":player.y,"seat":selected_seat,"robe_brown":robe_brown,"gender":character_gender,"beads":beads_count,"meditation_seconds":meditation_seconds,"merit":merit}))

func _load_progress() -> void:
	if not FileAccess.file_exists("user://temple_progress.json"):
		return
	var parsed: Variant = JSON.parse_string(FileAccess.get_file_as_string("user://temple_progress.json"))
	if typeof(parsed) != TYPE_DICTIONARY:
		return
	var data: Dictionary = parsed
	player_name = clean_player_name(str(data.get("name","")))
	var saved_stats: Variant = data.get("practice_stats",{})
	if not data.has("practice_stats") and FileAccess.file_exists("user://practice_progress.json"):
		var legacy: Variant = JSON.parse_string(FileAccess.get_file_as_string("user://practice_progress.json"))
		if legacy is Dictionary:
			saved_stats = legacy
	if saved_stats is Dictionary:
		for key in practice_stats:
			practice_stats[key] = maxi(0,int(saved_stats.get(key,0)))
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
		_set_body_action("meditate")
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
		_set_body_action("meditate")
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
	_stop_voice()
	stop_walking()
	ritual = ""
	if overlay != null and is_instance_valid(overlay):
		overlay.queue_free()
	overlay = Control.new()
	overlay.set_script(script)
	add_child(overlay)

func action(kind: String) -> void:
	if player_name.is_empty():
		return
	if kind != "chant":
		_stop_voice()
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
		"bow":
			if body_action in ["bow","incense"]:
				return
			ritual = ""
			sitting = false
			_set_body_action("bow")
			hall_audio.trigger("bow")
			status_text = "Quỳ xuống • Cúi lạy • Phủ phục • Trở về quỳ chắp tay"
		"kneel":
			ritual = ""
			if body_action in ["kneel","meditate"] or sitting:
				stand_up()
			else:
				sitting = false
				_set_body_action("kneel")
				status_text = "Đang quỳ chắp tay trước Phật"
		"prayer":
			ritual = ""
			_set_body_action("prayer" if body_action != "prayer" else "idle")
			status_text = "Chắp tay hướng Phật"
		"meditate":
			if sitting:
				stand_up()
			elif selected_seat >= 0 and player.distance_to(_seat_position(selected_seat)) < 125:
				_begin_sitting(selected_seat)
			else:
				sitting = true
				ritual = "meditate"
				_set_body_action("meditate")
				status_text = "Đang ngồi thiền tại chỗ • Chạm bồ đoàn nếu muốn chọn ghế"
		"chant", "mantra":
			ritual = "chant"
			ritual_time = 0.0
			beads_count = beads_count % 108 + 1
			merit += 1
			_set_body_action("kneel" if body_action in ["kneel","meditate"] else "prayer")
			_speak_chant()
			hall_audio.trigger("wood")
			status_text = "Nam mô A Di Đà Phật"
		"incense":
			if body_action in ["bow","incense"]:
				return
			ritual = ""
			sitting = false
			_set_body_action("incense")
			hall_audio.trigger("incense")
			for i in range(8):
				incense.append({"pos":player+Vector2(float(i-4)*4,-45),"age":float(i)*.1})
			status_text = "Chắp tay nâng hương • Quỳ dâng hương"
		"beads":
			beads_count = beads_count % 108 + 1
			merit += 1
			_set_body_action("prayer")
			status_text = "Niệm hạt %d/108" % beads_count
		"wood", "bell", "flower", "fruit", "wheel":
			var stat: String = {"wood":"knocks","bell":"bells","flower":"flowers","fruit":"fruits","wheel":"wheels"}[kind]
			practice_stats[stat] = int(practice_stats[stat])+1
			hall_audio.trigger(kind)
			_set_body_action("prayer")
			status_text = {"wood":"Đã gõ mõ","bell":"Đã thỉnh chuông","flower":"Đã dâng hoa","fruit":"Đã dâng quả","wheel":"Đã chuyển kinh luân"}[kind]
		"music":
			hall_audio.set_ambient(not hall_audio.ambient)
			status_text = "Nhạc thiền " + ("đang phát" if hall_audio.ambient else "đã tắt")
		"pause", "stop":
			stand_up()
			hall_audio.set_ambient(false)
			status_text = "Đã dừng nghi thức • Đang đứng"
	_save_progress()

func stand_up() -> void:
	ritual = ""
	sitting = false
	if selected_seat >= 0 or waiting_for_seat:
		_claim_seat(-1)
	waiting_for_seat = false
	_set_body_action("stand")
	status_text = "Đã đứng dậy"

func _set_body_action(value: String) -> void:
	var starting_phase := .35 if value == "kneel" and body_action in ["bow","incense"] else 0.0
	body_action = value
	body_action_elapsed = starting_phase
	if multiplayer_client != null:
		multiplayer_client.send_action(value,starting_phase)

func goto_section(index: int) -> void:
	stop_walking()
	stand_up()
	view_section = clampi(index,0,4)
	selected_seat = -1
	player = Vector2(860,_view_start()+470)
	_set_body_action("idle")
	status_text = "Chính điện • Khu %d/5" % (view_section+1)

func _remote_action_elapsed(peer: Dictionary) -> float:
	return float(peer.get("pose_elapsed",0.0))+maxf(0.0,float(Time.get_ticks_msec()-int(peer.get("pose_received",Time.get_ticks_msec())))/1000.0)

func _draw_ritual_frame(style: String, frame: int, point: Vector2, height: float, alpha: float) -> float:
	var frames: Array = ritual_regions[style]
	var coords: Array = frames[clampi(frame,0,11)]
	var source := Rect2(float(coords[0]),float(coords[1]),float(coords[2]),float(coords[3]))
	var factor := height / float(frames[0][3])
	var extent := source.size*factor
	var offset := point-Vector2(extent.x*.5,extent.y)
	draw_texture_rect_region(ritual_sheets[style],Rect2(offset,extent),source,Color(1,1,1,alpha))
	return extent.y

func _speak_chant() -> void:
	if not hall_voice.is_empty():
		DisplayServer.tts_speak("Nam mô A Di Đà Phật",hall_voice,60,1.0,0.78,0,true)

func _exit_tree() -> void:
	_stop_voice()

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

func _stop_voice() -> void:
	if not hall_voice.is_empty():
		DisplayServer.tts_stop()
