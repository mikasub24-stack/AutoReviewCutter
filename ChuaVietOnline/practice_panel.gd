extends Control
## This menu starts the main hall character's actions, never a separate mock avatar.
const MANTRA_READER = preload("res://mantra_reader.gd")
var server_address: LineEdit
var network_status: Label

func _ready() -> void:
	set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	mouse_filter = Control.MOUSE_FILTER_STOP
	var bg := ColorRect.new()
	bg.color = Color("#201713f7")
	bg.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	add_child(bg)
	var scroll := ScrollContainer.new()
	scroll.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	scroll.offset_left = 24
	scroll.offset_right = -24
	scroll.offset_top = 34
	scroll.offset_bottom = -24
	add_child(scroll)
	var column := VBoxContainer.new()
	column.size_flags_horizontal = SIZE_EXPAND_FILL
	column.add_theme_constant_override("separation",14)
	scroll.add_child(column)
	var title := Label.new()
	title.text = "TU HÀNH TRONG CHÍNH ĐIỆN"
	title.add_theme_font_size_override("font_size",23)
	column.add_child(title)
	var hint := Label.new()
	hint.text = "Chọn nghi thức để trở lại chính điện và thực hiện bằng nhân vật của bạn. Kéo joystick để dừng động tác và di chuyển."
	hint.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	column.add_child(hint)
	var grid := GridContainer.new()
	grid.columns = 2
	column.add_child(grid)
	for entry in [["Quỳ / Đứng","kneel"],["Lạy Phật","bow"],["Chắp tay","prayer"],["Ngồi thiền","meditate"],["Niệm Phật","chant"],["Thắp hương","incense"],["Gõ mõ","wood"],["Niệm hạt","beads"],["Gõ chuông","bell"],["Dâng hoa","flower"],["Dâng quả","fruit"],["Chuyển kinh luân","wheel"],["Om Mani Padme Hum","mantra"],["Nhạc thiền bật / tắt","music"],["Chú Đại Bi","dai_bi"],["Chú Lăng Nghiêm","lang_nghiem"]]:
		var button := Button.new()
		button.text = entry[0]
		button.custom_minimum_size = Vector2(220,52)
		button.size_flags_horizontal = SIZE_EXPAND_FILL
		button.pressed.connect(_act.bind(entry[1]))
		grid.add_child(button)
	var heading := Label.new()
	heading.text = "KẾT NỐI ĐỒNG TU"
	column.add_child(heading)
	server_address = LineEdit.new()
	server_address.placeholder_text = "wss://máy-chủ-của-bạn"
	var net = get_parent().multiplayer_client
	server_address.text = net.server_url
	column.add_child(server_address)
	_add_button(column,"Kết nối chính điện trực tuyến",_connect_multiplayer)
	network_status = Label.new()
	network_status.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	column.add_child(network_status)
	net.connection_changed.connect(_network_state)
	_network_state(net.connected)
	_add_button(column,"Dừng nghi thức và đứng dậy",_act.bind("pause"))
	_add_button(column,"Trở lại chính điện",queue_free)

func _add_button(parent: Control, text: String, callback: Callable) -> void:
	var button := Button.new()
	button.text = text
	button.custom_minimum_size.y = 50
	button.pressed.connect(callback)
	parent.add_child(button)

func _act(kind: String) -> void:
	if kind in ["dai_bi","lang_nghiem"]:
		var reader := Control.new()
		reader.set_script(MANTRA_READER)
		add_child(reader)
		reader.call("_select",kind)
		return
	get_parent().action(kind)
	queue_free()

func _connect_multiplayer() -> void:
	var url := server_address.text.strip_edges()
	if not (url.begins_with("ws://") or url.begins_with("wss://")):
		network_status.text = "Địa chỉ phải bắt đầu bằng ws:// hoặc wss://"
		return
	get_parent().multiplayer_client.configure(url)
	network_status.text = "Đang kết nối…"

func _network_state(connected: bool) -> void:
	network_status.text = "Đã kết nối đồng tu trực tuyến" if connected else "Ngoại tuyến • chỉ có khách mô phỏng"
