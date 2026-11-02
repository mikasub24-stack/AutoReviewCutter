extends Control
## Interactive Buddhist practice panel: procedural avatar animation and counters.
## No external audio or image assets required.
const TEMPLE_AUDIO = preload("res://temple_audio.gd")
const MANTRA_READER = preload("res://mantra_reader.gd")
var temple_audio
var wheel_turns := 0
var flowers := 0
var fruits := 0
var offering_stage := 0
var incense_stage := 0
var altar_incense := 0
var altar_flowers := 0
var altar_fruits := 0
var bells := 0
var mantra_count := 0
var practice := ""
var elapsed := 0.0
var chant_seconds := 0.0
var beads := 0
var bows := 0
var knocks := 0
var incense := 0
var message := "Chọn một nghi thức"
var buttons: Array[Button] = []
var voice_note: Label
var avatar_area: Control
var practice_save_elapsed := 0.0
var server_address: LineEdit
var network_status: Label
var speech_enabled := true
var vietnamese_voice := ""
var voice_notice := ""

func _ready() -> void:
	set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	mouse_filter = Control.MOUSE_FILTER_STOP
	var background := ColorRect.new()
	background.color = Color(0.09, 0.055, 0.035, 0.96)
	background.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	add_child(background)
	var scroll := ScrollContainer.new()
	scroll.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	scroll.offset_left = 12
	scroll.offset_top = 30
	scroll.offset_right = -12
	scroll.offset_bottom = -20
	add_child(scroll)
	var column := VBoxContainer.new()
	column.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	column.custom_minimum_size.x = 320
	scroll.add_child(column)
	column.add_theme_constant_override("separation", 8)
	var heading := Label.new()
	heading.text = "TU TẬP - CHÙA VIỆT ONLINE"
	heading.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	heading.add_theme_font_size_override("font_size", 22)
	column.add_child(heading)
	avatar_area = Control.new()
	avatar_area.custom_minimum_size.y = 240
	avatar_area.draw.connect(_draw_avatar)
	column.add_child(avatar_area)
	voice_note = Label.new()
	voice_note.text = "Áo nâu, đầu trọc - động tác hoạt họa trực tiếp"
	voice_note.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	voice_note.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	column.add_child(voice_note)
	var grid := GridContainer.new()
	grid.columns = 2
	column.add_child(grid)
	for entry in [["Lạy Phật","bow"],["Gõ mõ","wood"],["Tụng kinh","chant"],["Niệm hạt","beads"],["Ngồi thiền","meditate"],["Thắp hương","incense"],["Gõ chuông","bell"],["Dâng hoa","flower"],["Dâng mâm quả","fruit"],["Chuyển kinh luân","wheel"],["Om Mani Padme Hum","mantra"],["Nhạc thiền bật/tắt","music"],["Chú Đại Bi (84 câu)","dai_bi"],["Chú Lăng Nghiêm (5 đệ)","lang_nghiem"]]:
		var button := Button.new()
		button.text = entry[0]
		button.custom_minimum_size = Vector2(140, 54)
		button.size_flags_horizontal = Control.SIZE_EXPAND_FILL
		button.pressed.connect(_act.bind(entry[1]))
		grid.add_child(button)
		buttons.append(button)
	var network_heading := Label.new()
	network_heading.text = "KẾT NỐI CHÍNH ĐIỆN TRỰC TUYẾN"
	column.add_child(network_heading)
	server_address = LineEdit.new()
	server_address.placeholder_text = "wss://your-temple-server.example"
	server_address.text = "ws://127.0.0.1:8788"
	if get_parent() != null:
		var net = get_parent().get("multiplayer_client")
		if net != null:
			server_address.text = net.server_url
	column.add_child(server_address)
	var connect_button := Button.new()
	connect_button.text = "Kết nối máy chủ nhiều người chơi"
	connect_button.pressed.connect(_connect_multiplayer)
	column.add_child(connect_button)
	network_status = Label.new()
	network_status.text = "Chưa kết nối máy chủ"
	network_status.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	column.add_child(network_status)
	var stop := Button.new()
	stop.text = "Dừng nghi thức"
	stop.pressed.connect(_act.bind("stop"))
	column.add_child(stop)
	var close := Button.new()
	close.text = "Trở lại chính điện"
	close.pressed.connect(queue_free)
	column.add_child(close)
	_load_practice()
	# Android uses the device's installed Vietnamese TTS engine; no voice recordings are bundled.
	var voices := DisplayServer.tts_get_voices_for_language("vi")
	if voices.size() > 0:
		vietnamese_voice = voices[0]
	else:
		speech_enabled = false
		voice_notice = "Máy chưa cài giọng đọc tiếng Việt"
	temple_audio = TEMPLE_AUDIO.new()
	add_child(temple_audio)
	var net = get_parent().get("multiplayer_client")
	if net != null:
		net.connection_changed.connect(_network_state)
		_network_state(net.connected)
	set_process(true)

func _act(action: String) -> void:
	if action == "dai_bi" or action == "lang_nghiem":
		practice = ""
		DisplayServer.tts_stop()
		var reader := Control.new()
		reader.set_script(MANTRA_READER)
		add_child(reader)
		reader.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
		reader.call("_select", action)
		return
	if action != "chant" and action != "mantra":
		DisplayServer.tts_stop()
	if action == "music":
		temple_audio.set_ambient(not temple_audio.ambient)
		message = "Nhạc thiền " + ("đang phát" if temple_audio.ambient else "đã tắt")
	elif action == "stop":
		practice = ""
		message = "Đã dừng nghi thức"
	else:
		practice = action
		elapsed = 0.0
		match action:
			"bow":
				bows += 1
				temple_audio.trigger("bow")
				message = "Lạy Phật lần %d" % bows
			"wood":
				knocks += 1
				temple_audio.trigger("wood")
				message = "Gõ mõ lần %d" % knocks
			"chant":
				message = "Đang tụng: Nam mô A Di Đà Phật"
				_speak("Nam mô A Di Đà Phật")
			"beads":
				beads = (beads % 108) + 1
				message = "Niệm hạt %d/108" % beads
			"meditate":
				message = "Đang ngồi thiền"
			"incense":
				incense += 1
				incense_stage = 1
				temple_audio.trigger("incense")
				message = "Châm hương và chắp tay khấn nguyện"
			"bell":
				bells += 1
				temple_audio.trigger("bell")
				message = "Thỉnh chuông lần %d" % bells
			"flower":
				flowers += 1
				temple_audio.trigger("flower")
				offering_stage = 1
				message = "Đang dâng hoa sen lên bàn thờ"
			"fruit":
				fruits += 1
				offering_stage = 1
				message = "Đang dâng mâm ngũ quả lên bàn thờ"
			"wheel":
				wheel_turns += 1
				temple_audio.trigger("wheel")
				message = "Chuyển kinh luân lần %d" % wheel_turns
			"mantra":
				mantra_count += 1
				message = "Om Mani Padme Hum - lần %d" % mantra_count
				_speak("Án Ma Ni Bát Mê Hồng")
	voice_note.text = message + (" • " + voice_notice if not voice_notice.is_empty() else "")
	_save_practice()
	avatar_area.queue_redraw()

func _speak(phrase: String) -> void:
	if speech_enabled and not vietnamese_voice.is_empty():
		DisplayServer.tts_speak(phrase, vietnamese_voice, 60, 1.0, 0.78, 0, true)

func _exit_tree() -> void:
	DisplayServer.tts_stop()
	_save_practice()

func _process(delta: float) -> void:
	elapsed += delta
	practice_save_elapsed += delta
	if practice_save_elapsed >= 30.0:
		practice_save_elapsed = 0.0
		_save_practice()
	if practice == "chant":
		chant_seconds += delta
		if elapsed >= 3.5:
			elapsed = 0.0
			message = "Nam mô A Di Đà Phật - %ds" % int(chant_seconds)
			_speak("Nam mô A Di Đà Phật")
			voice_note.text = message
	if practice == "bow" and elapsed >= 1.8:
		practice = ""
	if practice == "wood" and elapsed >= 0.4:
		practice = ""
	if practice == "beads" and elapsed >= 0.5:
		practice = ""
	if practice in ["bell", "wheel", "mantra"] and elapsed >= 3.0:
		practice = ""
	if practice in ["flower", "fruit"] and elapsed >= 4.0:
		if practice == "flower":
			altar_flowers += 1
		else:
			altar_fruits += 1
		practice = ""
		offering_stage = 2
		message = "Đã an vị lễ vật trên bàn thờ"
		voice_note.text = message
	if practice == "incense" and elapsed >= 2.5 and incense_stage == 1:
		incense_stage = 2
		message = "Đang tiến đến bát hương"
		voice_note.text = message
	if practice == "incense" and elapsed >= 5.0:
		incense_stage = 3
		altar_incense += 1
		practice = ""
		message = "Đã cắm hương vào bát hương"
		voice_note.text = message
	avatar_area.queue_redraw()

func _draw_avatar() -> void:
	var c := Vector2(avatar_area.size.x * 0.5, 140)
	var altar := Vector2(c.x, 20)
	avatar_area.draw_rect(Rect2(altar.x - 100, altar.y - 18, 200, 14), Color("#ad782f"))
	avatar_area.draw_rect(Rect2(altar.x - 94, altar.y - 4, 188, 12), Color("#572d1c"))
	if altar_flowers > 0:
		_draw_offering(altar + Vector2(-56,-30), "flower")
	if altar_fruits > 0:
		_draw_offering(altar + Vector2(56,-30), "fruit")
	avatar_area.draw_circle(altar + Vector2(0,-13), 16, Color("#8b704e"))
	avatar_area.draw_rect(Rect2(altar + Vector2(-20,-14), Vector2(40,9)), Color("#b89460"))
	for stick in range(mini(altar_incense, 7)):
		var dx := float(stick - 3) * 4.0
		avatar_area.draw_line(altar + Vector2(dx,-15), altar + Vector2(dx,-47), Color("#a04f35"), 2)
		avatar_area.draw_circle(altar + Vector2(dx+sin(elapsed+stick)*5,-57), 5, Color(0.9,0.9,0.85,0.28))
	var root = get_parent()
	var gender: int = int(root.get("character_gender")) if root != null else 0
	var brown: bool = bool(root.get("robe_brown")) if root != null else true
	var pose := "seated" if practice in ["meditate","chant","beads","mantra"] else "standing"
	var key := ("nun" if gender == 1 else "monk")+"_"+("brown" if brown else "grey")+"_"+pose
	var texture: Texture2D = root.character_art[key]
	var bow_offset := sin(minf(elapsed/1.8,1.0)*PI)*20 if practice == "bow" else 0.0
	avatar_area.draw_texture_rect(texture,Rect2(c+Vector2(-50,-75+bow_offset),Vector2(100,140-bow_offset)),false)
	var skin := Color("#d9a47a")
	var gold := Color("#e4b852")
	var robe := Color("#785239")
	if practice == "wood":
		var swing := sin(elapsed * 24.0) * 20.0
		avatar_area.draw_line(c + Vector2(30,4), c + Vector2(70+swing,35), skin, 10)
		avatar_area.draw_circle(c + Vector2(77,57), 23, Color("#a06b30"))
		avatar_area.draw_arc(c + Vector2(77,57), 18, 0, TAU, 24, gold, 3)
	elif practice == "incense":
		var hand := c + Vector2(0,-30)
		if incense_stage == 2:
			var p := clampf((elapsed-2.5)/2.5,0.0,1.0)
			hand = hand.lerp(altar + Vector2(0,-45), p*p*(3.0-2.0*p))
		for j in range(3):
			var dx := float(j-1)*5.0
			avatar_area.draw_line(hand + Vector2(dx,20), hand + Vector2(dx,-42), Color("#a05437"), 2)
			avatar_area.draw_circle(hand + Vector2(dx,-44), 2, Color("#ed713d"))
			for i in range(3):
				var drift: float = sin(elapsed*2.0+i+j) * 5.0
				avatar_area.draw_circle(hand + Vector2(dx+drift,-57-i*11), 4, Color(0.85,0.84,0.8,0.34))
	if practice == "wheel":
		avatar_area.draw_circle(c + Vector2(72, 20), 28, gold)
		avatar_area.draw_arc(c + Vector2(72,20), 20, elapsed * 5, elapsed * 5 + PI * 1.5, 24, robe, 6)
	if practice in ["flower", "fruit"]:
		var progress := clampf(elapsed / 4.0, 0.0, 1.0)
		var from := c + Vector2(0, 30)
		var to := altar + Vector2(0, -30)
		var lift := from.lerp(to, progress * progress * (3.0 - 2.0 * progress))
		_draw_offering(lift, practice)
	if practice == "beads":
		for i in range(12):
			var a := float(i) * TAU / 12.0 + elapsed * 3.0
			avatar_area.draw_circle(c + Vector2(sin(a)*16,40+cos(a)*11), 4, gold)

func _draw_offering(center: Vector2, kind: String) -> void:
	if kind == "flower":
		avatar_area.draw_line(center + Vector2(0, 12), center + Vector2(0,-14), Color("#428956"), 4)
		for k in range(7):
			var a := float(k) * TAU / 7.0
			avatar_area.draw_circle(center + Vector2(sin(a)*13,-15+cos(a)*10), 9, Color("#f5afc3"))
		avatar_area.draw_circle(center + Vector2(0,-15), 8, Color("#e9c55d"))
	else:
		avatar_area.draw_arc(center + Vector2(0,8), 28, 0, PI, 24, Color("#f0cf85"), 6)
		for i in range(5):
			var x := float(i-2)*11.0
			avatar_area.draw_circle(center + Vector2(x,-5-absf(x)*0.2), 10, [Color("#e0aa39"),Color("#ce5b41"),Color("#81a34a"),Color("#e6c653"),Color("#bd5e3c")][i])

func _save_practice() -> void:
	var file := FileAccess.open("user://practice_progress.json", FileAccess.WRITE)
	if file == null:
		return
	file.store_string(JSON.stringify({"bows":bows,"knocks":knocks,"beads":beads,"incense":incense,"bells":bells,"flowers":flowers,"fruits":fruits,"wheels":wheel_turns,"mantras":mantra_count,"chant_seconds":chant_seconds,"altar_incense":altar_incense,"altar_flowers":altar_flowers,"altar_fruits":altar_fruits}))

func _load_practice() -> void:
	if not FileAccess.file_exists("user://practice_progress.json"):
		return
	var parsed: Variant = JSON.parse_string(FileAccess.get_file_as_string("user://practice_progress.json"))
	if typeof(parsed) != TYPE_DICTIONARY:
		return
	var data: Dictionary = parsed
	bows = maxi(0,int(data.get("bows",0)))
	knocks = maxi(0,int(data.get("knocks",0)))
	beads = clampi(int(data.get("beads",0)),0,108)
	incense = maxi(0,int(data.get("incense",0)))
	bells = maxi(0,int(data.get("bells",0)))
	flowers = maxi(0,int(data.get("flowers",0)))
	fruits = maxi(0,int(data.get("fruits",0)))
	wheel_turns = maxi(0,int(data.get("wheels",0)))
	mantra_count = maxi(0,int(data.get("mantras",0)))
	chant_seconds = maxf(0.0,float(data.get("chant_seconds",0.0)))
	altar_incense = maxi(0,int(data.get("altar_incense",0)))
	altar_flowers = maxi(0,int(data.get("altar_flowers",0)))
	altar_fruits = maxi(0,int(data.get("altar_fruits",0)))

func _connect_multiplayer() -> void:
	var root = get_parent()
	if root == null:
		network_status.text = "Không tìm thấy kết nối nhiều người chơi."
		return
	var net = root.get("multiplayer_client")
	if net == null:
		network_status.text = "Chưa khởi tạo kết nối nhiều người chơi."
		return
	var url := server_address.text.strip_edges()
	if not (url.begins_with("ws://") or url.begins_with("wss://")):
		network_status.text = "Địa chỉ phải bắt đầu bằng ws:// hoặc wss://"
		return
	net.configure(url)
	network_status.text = "Đang kết nối: " + url


func _network_state(is_connected: bool) -> void:
	network_status.text = "Đã kết nối chính điện trực tuyến" if is_connected else "Ngoại tuyến • đang chờ máy chủ"
