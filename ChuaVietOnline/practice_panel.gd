extends Control
## Interactive Buddhist practice panel: procedural avatar animation and counters.
## No external audio or image assets required.
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
var sound_player: AudioStreamPlayer
var sound_playback: AudioStreamGeneratorPlayback
var sound_remaining := 0
var sound_phase := 0.0

func _ready() -> void:
	set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	mouse_filter = Control.MOUSE_FILTER_STOP
	var background := ColorRect.new()
	background.color = Color(0.09, 0.055, 0.035, 0.96)
	background.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	add_child(background)
	var column := VBoxContainer.new()
	column.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	column.offset_left = 14
	column.offset_top = 38
	column.offset_right = -14
	column.offset_bottom = -24
	column.add_theme_constant_override("separation", 8)
	add_child(column)
	var heading := Label.new()
	heading.text = "TU TẬP - CHÙA VIỆT ONLINE"
	heading.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	heading.add_theme_font_size_override("font_size", 22)
	column.add_child(heading)
	avatar_area = Control.new()
	avatar_area.custom_minimum_size.y = 275
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
	for entry in [["Lạy Phật","bow"],["Gõ mõ","wood"],["Tụng kinh","chant"],["Niệm hạt","beads"],["Ngồi thiền","meditate"],["Thắp hương","incense"]]:
		var button := Button.new()
		button.text = entry[0]
		button.custom_minimum_size = Vector2(150, 58)
		button.size_flags_horizontal = Control.SIZE_EXPAND_FILL
		button.pressed.connect(_act.bind(entry[1]))
		grid.add_child(button)
		buttons.append(button)
	var stop := Button.new()
	stop.text = "Dừng nghi thức"
	stop.pressed.connect(_act.bind("stop"))
	column.add_child(stop)
	var close := Button.new()
	close.text = "Trở lại chính điện"
	close.pressed.connect(queue_free)
	column.add_child(close)
	sound_player = AudioStreamPlayer.new()
	var stream := AudioStreamGenerator.new()
	stream.mix_rate = 22050
	stream.buffer_length = 0.2
	sound_player.stream = stream
	add_child(sound_player)
	sound_player.play()
	sound_playback = sound_player.get_stream_playback()
	set_process(true)

func _act(action: String) -> void:
	if action == "stop":
		practice = ""
		message = "Đã dừng nghi thức"
	else:
		practice = action
		elapsed = 0.0
		match action:
			"bow":
				bows += 1
				message = "Lạy Phật lần %d" % bows
			"wood":
				knocks += 1
				sound_remaining = 6500
				sound_phase = 0.0
				message = "Gõ mõ lần %d" % knocks
			"chant":
				message = "Đang tụng: Nam mô A Di Đà Phật"
			"beads":
				beads = (beads % 108) + 1
				message = "Niệm hạt %d/108" % beads
			"meditate":
				message = "Đang ngồi thiền"
			"incense":
				incense += 1
				message = "Thắp hương lần %d" % incense
	voice_note.text = message
	avatar_area.queue_redraw()

func _process(delta: float) -> void:
	elapsed += delta
	if practice == "chant":
		chant_seconds += delta
		if elapsed >= 3.5:
			elapsed = 0.0
			message = "Nam mô A Di Đà Phật - %ds" % int(chant_seconds)
			voice_note.text = message
	if practice == "bow" and elapsed >= 1.8:
		practice = ""
	if practice == "wood" and elapsed >= 0.4:
		practice = ""
	if practice == "beads" and elapsed >= 0.5:
		practice = ""
	if practice == "incense" and elapsed >= 2.5:
		practice = ""
	if sound_remaining > 0 and sound_playback != null:
		var count := mini(sound_playback.get_frames_available(), sound_remaining)
		for i in range(count):
			var t := float(6500 - sound_remaining) / 22050.0
			var envelope := exp(-t * 23.0)
			var sample := sin(sound_phase) * envelope * 0.26
			sound_phase += TAU * (240.0 + 80.0 * exp(-t * 30.0)) / 22050.0
			sound_playback.push_frame(Vector2(sample, sample))
			sound_remaining -= 1
	avatar_area.queue_redraw()

func _draw_avatar() -> void:
	var c := Vector2(avatar_area.size.x * 0.5, 140)
	var bowing := practice == "bow"
	var kneeling := practice == "meditate" or practice == "chant" or practice == "beads"
	var offset := 0.0
	if bowing:
		offset = 50.0 * sin(minf(elapsed / 1.8, 1.0) * PI)
	var robe := Color("#785239")
	var skin := Color("#d9a47a")
	var gold := Color("#e4b852")
	avatar_area.draw_circle(c + Vector2(0, 92), 84, Color("#3e2b23"))
	avatar_area.draw_arc(c + Vector2(0, 92), 79, 0, TAU, 72, gold, 3)
	if kneeling:
		avatar_area.draw_rect(Rect2(c.x - 43, c.y + 49, 86, 24), robe)
	else:
		avatar_area.draw_rect(Rect2(c.x - 27, c.y + 40, 21, 67), robe)
		avatar_area.draw_rect(Rect2(c.x + 6, c.y + 40, 21, 67), robe)
	var torso := PackedVector2Array([c + Vector2(-40,-20+offset),c + Vector2(40,-20+offset),c + Vector2(47,56),c + Vector2(-47,56)])
	avatar_area.draw_colored_polygon(torso, robe)
	avatar_area.draw_circle(c + Vector2(0,-54+offset), 29, skin)
	avatar_area.draw_arc(c + Vector2(0,-54+offset), 29, PI, TAU, 24, Color("#9a6348"), 2)
	if practice == "wood":
		var swing := sin(elapsed * 24.0) * 20.0
		avatar_area.draw_line(c + Vector2(30,4), c + Vector2(70+swing,35), skin, 10)
		avatar_area.draw_circle(c + Vector2(77,57), 23, Color("#a06b30"))
		avatar_area.draw_arc(c + Vector2(77,57), 18, 0, TAU, 24, gold, 3)
	elif practice == "incense":
		avatar_area.draw_line(c + Vector2(0,15), c + Vector2(0,-110), gold, 3)
		for i in range(5):
			var drift := sin(elapsed * 2.0 + i) * 8
			avatar_area.draw_circle(c + Vector2(drift,-120-i*12), 5, Color(0.85,0.84,0.8,0.5))
	else:
		avatar_area.draw_line(c + Vector2(-30,0+offset), c + Vector2(-10,35+offset), skin, 9)
		avatar_area.draw_line(c + Vector2(30,0+offset), c + Vector2(10,35+offset), skin, 9)
	if practice == "beads":
		for i in range(12):
			var a := float(i) * TAU / 12.0 + elapsed * 3.0
			avatar_area.draw_circle(c + Vector2(sin(a)*16,40+cos(a)*11), 4, gold)
