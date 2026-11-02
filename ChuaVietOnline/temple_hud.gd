extends Control
## Native controls share the same hit areas on desktop and multi-touch Android.
const GOLD := Color("#dfb96d")
var root
var status: Label
var counters: Label
var profile: Label
var connection: Label
var joystick_pad: Control
var modal: Control
var active_touch := -2
var axis := Vector2.ZERO
var mission_claimed := false
var muted := false

func _ready() -> void:
	root = get_parent()
	set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	mouse_filter = Control.MOUSE_FILTER_IGNORE
	var skin := Theme.new()
	skin.default_font_size = 14
	for type in ["Button","LineEdit","TextEdit","PanelContainer","ScrollContainer"]:
		var box := StyleBoxFlat.new()
		box.bg_color = Color("#30231eea")
		box.border_color = GOLD
		box.set_border_width_all(1)
		box.set_corner_radius_all(14)
		box.content_margin_left = 12
		box.content_margin_right = 12
		box.content_margin_top = 10
		box.content_margin_bottom = 10
		skin.set_stylebox("normal",type,box)
		skin.set_stylebox("panel",type,box)
		var hover := box.duplicate()
		hover.bg_color = Color("#725036")
		skin.set_stylebox("hover",type,hover)
		var pressed := box.duplicate()
		pressed.bg_color = Color("#997044")
		skin.set_stylebox("pressed",type,pressed)
		skin.set_color("font_color",type,Color("#fff1ce"))
		skin.set_color("font_hover_color",type,Color.WHITE)
		skin.set_color("font_focus_color",type,Color.WHITE)
		skin.set_color("font_pressed_color",type,Color.WHITE)
		skin.set_stylebox("focus",type,hover)
	get_parent().theme = skin
	theme = skin
	var top := PanelContainer.new()
	top.set_anchors_and_offsets_preset(Control.PRESET_TOP_WIDE)
	top.offset_left = 10
	top.offset_right = -10
	top.offset_top = 10
	top.offset_bottom = 88
	add_child(top)
	var top_row := HBoxContainer.new()
	top.add_child(top_row)
	var portrait := TextureRect.new()
	portrait.texture = load("res://art/monk_brown_standing.svg")
	portrait.custom_minimum_size = Vector2(45,60)
	portrait.expand_mode = TextureRect.EXPAND_IGNORE_SIZE
	portrait.stretch_mode = TextureRect.STRETCH_KEEP_ASPECT_CENTERED
	top_row.add_child(portrait)
	var info := VBoxContainer.new()
	info.size_flags_horizontal = SIZE_EXPAND_FILL
	top_row.add_child(info)
	profile = Label.new()
	profile.text = root.player_name + "  ·  Đệ Tử"
	profile.add_theme_font_size_override("font_size",20)
	profile.text_overrun_behavior = TextServer.OVERRUN_TRIM_ELLIPSIS
	info.add_child(profile)
	connection = Label.new()
	connection.add_theme_font_size_override("font_size",11)
	info.add_child(connection)
	for entry in [["bell","Thông báo"],["gear","Cài đặt"]]:
		var button := _icon_button(entry[0],entry[1],Vector2(42,48))
		button.pressed.connect(_show_info.bind(entry[0]))
		top_row.add_child(button)
	var title := Label.new()
	title.text = "Chùa Việt Online"
	title.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	title.set_anchors_and_offsets_preset(Control.PRESET_TOP_WIDE)
	title.offset_top = 98
	title.add_theme_color_override("font_color",Color("#ffdf8c"))
	title.add_theme_color_override("font_outline_color",Color("#391b15"))
	title.add_theme_constant_override("outline_size",8)
	title.add_theme_font_size_override("font_size",29)
	title.mouse_filter = Control.MOUSE_FILTER_IGNORE
	add_child(title)
	var left := VBoxContainer.new()
	left.position = Vector2(9,190)
	left.add_theme_constant_override("separation",9)
	add_child(left)
	for entry in [["lotus","Tu hành","practice"],["scroll","Nhiệm vụ","missions"],["shop","Cửa hàng","shop"],["bag","Túi đồ","inventory"],["calendar","Nhật ký","journal"]]:
		_menu_item(left,entry)
	var right := VBoxContainer.new()
	right.set_anchors_and_offsets_preset(Control.PRESET_TOP_RIGHT)
	right.position = Vector2(-70,190)
	right.add_theme_constant_override("separation",9)
	add_child(right)
	for entry in [["people","Đồng tu","peers"],["gift","Phúc lợi","rewards"],["person","Nhân vật","character"]]:
		_menu_item(right,entry)
	joystick_pad = Control.new()
	joystick_pad.set_anchors_and_offsets_preset(Control.PRESET_BOTTOM_LEFT)
	joystick_pad.position = Vector2(10,-164)
	joystick_pad.size = Vector2(132,132)
	joystick_pad.mouse_filter = Control.MOUSE_FILTER_STOP
	joystick_pad.draw.connect(_draw_joystick)
	joystick_pad.gui_input.connect(_joystick_input)
	add_child(joystick_pad)
	var actions := HBoxContainer.new()
	actions.set_anchors_and_offsets_preset(Control.PRESET_BOTTOM_WIDE)
	actions.offset_left = 153
	actions.offset_right = -9
	actions.offset_top = -132
	actions.offset_bottom = -44
	actions.add_theme_constant_override("separation",4)
	add_child(actions)
	for entry in [["meditate","Ngồi thiền","meditate"],["prayer","Niệm Phật","chant"],["incense","Thắp hương","incense"],["lotus","Tạm dừng","pause"]]:
		var box := VBoxContainer.new()
		box.size_flags_horizontal = SIZE_EXPAND_FILL
		actions.add_child(box)
		var button := _icon_button(entry[0],entry[1],Vector2(55,55))
		button.size_flags_horizontal = SIZE_SHRINK_CENTER
		button.pressed.connect(root.action.bind(entry[2]))
		box.add_child(button)
		var label := Label.new()
		label.text = entry[1]
		label.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
		label.add_theme_font_size_override("font_size",12)
		box.add_child(label)
	var bottom := PanelContainer.new()
	bottom.set_anchors_and_offsets_preset(Control.PRESET_BOTTOM_WIDE)
	bottom.offset_left = 7
	bottom.offset_right = -7
	bottom.offset_top = -40
	bottom.offset_bottom = -5
	add_child(bottom)
	status = Label.new()
	status.add_theme_font_size_override("font_size",12)
	status.text_overrun_behavior = TextServer.OVERRUN_TRIM_ELLIPSIS
	bottom.add_child(status)
	counters = Label.new()
	counters.set_anchors_and_offsets_preset(Control.PRESET_BOTTOM_RIGHT)
	counters.position = Vector2(-266,-165)
	counters.add_theme_color_override("font_outline_color",Color("#231b17"))
	counters.add_theme_constant_override("outline_size",5)
	counters.add_theme_font_size_override("font_size",12)
	add_child(counters)
	var saved := ConfigFile.new()
	if saved.load("user://preferences.cfg") == OK:
		muted = bool(saved.get_value("audio","muted",false))
		AudioServer.set_bus_mute(0,muted)
	if root.player_name.is_empty():
		call_deferred("show_name_editor",true)
	var journal := ConfigFile.new()
	if journal.load("user://daily.cfg") == OK:
		mission_claimed = str(journal.get_value("daily","date","")) == Time.get_date_string_from_system()

func _icon_button(icon: String, caption: String, minimum: Vector2) -> Button:
	var button := Button.new()
	button.icon = load("res://art/ui_"+icon+".svg")
	button.expand_icon = true
	button.icon_alignment = HORIZONTAL_ALIGNMENT_CENTER
	button.add_theme_constant_override("icon_max_width",int(minimum.x*.64))
	button.custom_minimum_size = minimum
	button.tooltip_text = caption
	return button

func _menu_item(parent: Control, entry: Array) -> void:
	var box := VBoxContainer.new()
	box.add_theme_constant_override("separation",0)
	parent.add_child(box)
	var b := _icon_button(entry[0],entry[1],Vector2(57,48))
	b.size_flags_horizontal = SIZE_SHRINK_CENTER
	b.pressed.connect(_menu.bind(entry[2]))
	box.add_child(b)
	var text := Label.new()
	text.text = entry[1]
	text.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	text.add_theme_font_size_override("font_size",12)
	text.add_theme_color_override("font_outline_color",Color("#21150e"))
	text.add_theme_constant_override("outline_size",5)
	box.add_child(text)

func _process(_delta: float) -> void:
	if root == null:
		return
	profile.text = (root.player_name if not root.player_name.is_empty() else "Đạo hữu") + "  ·  Đệ Tử"
	status.text = "[Hệ thống] " + root.status_text
	var net = root.multiplayer_client
	connection.text = ("Trực tuyến · " if net.connected else "Ngoại tuyến · khách mô phỏng · ")+str(root.occupant_count)+" người"
	connection.modulate = Color("#b3d8a0") if net.connected else Color("#e0bd88")
	counters.text = "Niệm: %d/108   Thiền: %ds   Công đức: %d" % [root.beads_count,int(root.meditation_seconds),root.merit]
	if not root.joystick_active:
		axis = Vector2.ZERO
	joystick_pad.queue_redraw()

func _draw_joystick() -> void:
	var c := Vector2(66,66)
	joystick_pad.draw_circle(c,64,Color("#392a24cc"))
	joystick_pad.draw_arc(c,64,0,TAU,64,GOLD,2,true)
	joystick_pad.draw_arc(c,43,0,TAU,48,Color("#b08550"),1,true)
	joystick_pad.draw_circle(c+axis*31,26,Color("#af825d"))
	joystick_pad.draw_arc(c+axis*31,26,0,TAU,48,Color("#ffe3ab"),2,true)
	joystick_pad.draw_circle(c+axis*31,5,Color("#fff0d2"))
	for i in range(4):
		var a := float(i)*PI*.5
		var p := c+Vector2(sin(a),cos(a))*53
		joystick_pad.draw_circle(p,2,GOLD)

func _joystick_input(event: InputEvent) -> void:
	if event is InputEventScreenTouch:
		if event.pressed and active_touch == -2:
			active_touch = event.index
			_move_stick(event.position)
		elif not event.pressed and active_touch == event.index:
			_release_stick()
	elif event is InputEventScreenDrag and event.index == active_touch:
		_move_stick(event.position)
	elif event is InputEventMouseButton and event.button_index == MOUSE_BUTTON_LEFT:
		if event.pressed:
			active_touch = -1
			_move_stick(event.position)
		else:
			_release_stick()
	elif event is InputEventMouseMotion and active_touch == -1:
		_move_stick(event.position)

func _move_stick(point: Vector2) -> void:
	axis = ((point-Vector2(66,66))/40).limit_length(1.0)
	root.joystick_active = true
	root.joystick = axis

func _release_stick() -> void:
	active_touch = -2
	axis = Vector2.ZERO
	root.joystick_active = false
	root.joystick = Vector2.ZERO

func _notification(what: int) -> void:
	if what == NOTIFICATION_APPLICATION_FOCUS_OUT or what == NOTIFICATION_APPLICATION_PAUSED:
		if root != null:
			_release_stick()

func _menu(kind: String) -> void:
	_release_stick()
	if kind in ["practice","shop","character"]:
		root.action(kind)
	else:
		_show_info(kind)

func _show_info(kind: String) -> void:
	root.stop_walking()
	_release_stick()
	if modal != null and is_instance_valid(modal):
		modal.queue_free()
	modal = ColorRect.new()
	modal.color = Color("#130e0de8")
	modal.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	add_child(modal)
	var panel := PanelContainer.new()
	panel.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	panel.offset_left = 30
	panel.offset_right = -30
	panel.offset_top = 160
	panel.offset_bottom = -170
	modal.add_child(panel)
	var scroll := ScrollContainer.new()
	panel.add_child(scroll)
	var column := VBoxContainer.new()
	column.size_flags_horizontal = SIZE_EXPAND_FILL
	column.add_theme_constant_override("separation",18)
	scroll.add_child(column)
	var title := Label.new()
	title.add_theme_font_size_override("font_size",24)
	column.add_child(title)
	var body := Label.new()
	body.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	body.size_flags_horizontal = SIZE_EXPAND_FILL
	column.add_child(body)
	match kind:
		"bell":
			title.text = "An lành mỗi ngày"
			body.text = "Chào mừng đến Chùa Việt Online.\n\nChạm bồ đoàn trống để đi đến chỗ ngồi. Dùng joystick để di chuyển.\n\nBản ngoại tuyến có khách mô phỏng. Để gặp người thật, vào Tu hành và kết nối máy chủ WebSocket."
		"gear":
			title.text = "Cài đặt"
			body.text = "Âm thanh và kết nối được lưu trên thiết bị."
			var sound := CheckButton.new()
			sound.text = "Bật âm thanh"
			sound.button_pressed = not muted
			sound.toggled.connect(func(on: bool):
				muted = not on
				AudioServer.set_bus_mute(0,muted)
				var prefs := ConfigFile.new()
				prefs.set_value("audio","muted",muted)
				prefs.save("user://preferences.cfg"))
			column.add_child(sound)
			_add_text_button(column,"Kết nối chính điện",func(): modal.queue_free(); root.action("practice"))
			_add_text_button(column,"Đổi tên nhân vật",func(): show_name_editor(false))
			_add_text_button(column,"Đổi nhân vật / áo nâu / áo xám",func(): root.action("character"))
			_add_text_button(column,"Nhạc thiền bật / tắt",func(): root.hall_audio.set_ambient(not root.hall_audio.ambient))
		"missions":
			title.text = "Nhiệm vụ tu tập"
			body.text = "Niệm Phật: %d/108 hạt\nNgồi thiền: %d giây\n\nHoàn thành một chuỗi 108 hạt hoặc thiền đủ 60 giây để nhận phúc lợi trong ngày." % [root.beads_count,int(root.meditation_seconds)]
		"inventory":
			title.text = "Túi đồ"
			body.text = "Áo nâu cư sĩ · đã có\nÁo xám cư sĩ · đã có\nNhân vật nữ áo lam · đã có\n\nVật phẩm cửa hàng được lưu riêng trên máy chủ sandbox."
			_add_text_button(column,"Đổi trang phục",func(): root.action("character"))
			_add_text_button(column,"Mở kho thử nghiệm",func(): modal.queue_free(); root.action("shop"))
		"journal":
			title.text = "Nhật ký tu tập"
			body.text = "%s\n\nCông đức tu tập: %d\nChuỗi hiện tại: %d/108\nThời gian thiền: %d giây\n\nTiến trình tự lưu trên thiết bị, chưa đồng bộ tài khoản." % [root.player_name,root.merit,root.beads_count,int(root.meditation_seconds)]
		"peers":
			title.text = "Đồng tu"
			body.text = "%d người đang kết nối chính điện.\n\nChỗ ngồi được máy chủ xác nhận độc quyền." % (root.multiplayer_client.remote_players.size()+1) if root.multiplayer_client.connected else "Bạn đang ở chế độ ngoại tuyến. Các nhân vật xung quanh là khách mô phỏng.\n\nVào Tu hành để nhập địa chỉ máy chủ và gặp người thật."
			_add_text_button(column,"Thiết lập kết nối",func(): modal.queue_free(); root.action("practice"))
		"rewards":
			title.text = "Phúc lợi trong ngày"
			body.text = "Khi tiến trình đạt 108 hạt hoặc 60 giây thiền, bạn có thể nhận 10 công đức. Mỗi ngày nhận một lần trên thiết bị này."
			var claim := Button.new()
			claim.text = "Đã nhận hôm nay" if mission_claimed else "Nhận 10 công đức"
			claim.disabled = mission_claimed or (root.beads_count < 108 and root.meditation_seconds < 60)
			claim.pressed.connect(func():
				root.merit += 10
				root._save_progress()
				mission_claimed = true
				var daily := ConfigFile.new()
				daily.set_value("daily","date",Time.get_date_string_from_system())
				daily.save("user://daily.cfg")
				claim.disabled = true
				claim.text = "Đã nhận hôm nay")
			column.add_child(claim)
	_add_text_button(column,"Trở lại chính điện",func(): modal.queue_free())

func _add_text_button(parent: Control, caption: String, callback: Callable) -> void:
	var b := Button.new()
	b.text = caption
	b.custom_minimum_size.y = 48
	b.pressed.connect(callback)
	parent.add_child(b)

func show_name_editor(first_visit: bool = false) -> void:
	root.stop_walking()
	_release_stick()
	if modal != null and is_instance_valid(modal):
		modal.queue_free()
	modal = ColorRect.new()
	modal.color = Color("#130e0df2")
	modal.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	add_child(modal)
	var panel := PanelContainer.new()
	panel.set_anchors_and_offsets_preset(Control.PRESET_CENTER)
	panel.position = Vector2(-220,-190)
	panel.size = Vector2(440,320)
	modal.add_child(panel)
	var column := VBoxContainer.new()
	column.add_theme_constant_override("separation",18)
	panel.add_child(column)
	var title := Label.new()
	title.text = "Chào mừng đến Chùa Việt Online" if first_visit else "Đổi tên nhân vật"
	title.add_theme_font_size_override("font_size",20)
	column.add_child(title)
	var help := Label.new()
	help.text = "Bạn muốn mọi người gọi mình là gì?\nTên dài 2–20 ký tự, có thể dùng tiếng Việt."
	help.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	column.add_child(help)
	var field := LineEdit.new()
	field.placeholder_text = "Nhập tên hoặc pháp danh của bạn"
	field.text = root.player_name
	field.max_length = 20
	field.custom_minimum_size.y = 50
	column.add_child(field)
	var error := Label.new()
	error.modulate = Color("#f7aa88")
	error.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	column.add_child(error)
	var dialog := modal
	var submit := func():
		if root.set_player_name(field.text):
			dialog.queue_free()
		else:
			error.text = "Nhập 2–20 ký tự: chữ, số, dấu cách, chấm, gạch nối hoặc gạch dưới."
	_add_text_button(column,"Vào chính điện" if first_visit else "Lưu tên",submit)
	field.text_submitted.connect(func(_text: String): submit.call())
	if not first_visit:
		_add_text_button(column,"Hủy",func(): dialog.queue_free())
	field.call_deferred("grab_focus")
