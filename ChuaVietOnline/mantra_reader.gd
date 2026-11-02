extends Control
## Reader for user-supplied Vietnamese Buddhist liturgical texts.
## Avoids silently substituting incomplete or unverified mantra versions.
var selected := "dai_bi"
var lines: PackedStringArray = PackedStringArray()
var current := 0
var repeat_count := 0
var playing := false
var voice := ""
var heading: Label
var status: Label
var verse: Label
var editor: TextEdit
var file_dialog: FileDialog

func _ready() -> void:
	set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	var bg := ColorRect.new()
	bg.color = Color("#201711")
	bg.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	add_child(bg)
	var scroll := ScrollContainer.new()
	scroll.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	scroll.offset_left = 16
	scroll.offset_top = 24
	scroll.offset_right = -16
	scroll.offset_bottom = -24
	add_child(scroll)
	var column := VBoxContainer.new()
	column.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	column.add_theme_constant_override("separation", 10)
	scroll.add_child(column)
	heading = Label.new()
	heading.text = "KINH CHÚ • ĐỌC VÀ TRÌ TỤNG"
	heading.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	heading.add_theme_font_size_override("font_size", 23)
	column.add_child(heading)
	_add_button(column, "Chú Đại Bi", func(): _select("dai_bi"))
	_add_button(column, "Chú Lăng Nghiêm", func(): _select("lang_nghiem"))
	status = Label.new()
	status.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	column.add_child(status)
	verse = Label.new()
	verse.custom_minimum_size = Vector2(320, 135)
	verse.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	verse.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	verse.add_theme_font_size_override("font_size", 21)
	column.add_child(verse)
	_add_button(column, "◀ Câu trước", func(): _step(-1))
	_add_button(column, "Câu tiếp ▶", func(): _step(1))
	_add_button(column, "▶ Đọc từ câu hiện tại", _play)
	_add_button(column, "■ Dừng đọc", _stop)
	var help := Label.new()
	help.text = "Dán toàn văn bản phiên âm tiếng Việt đã được đạo tràng xác nhận, mỗi câu một dòng. Không tự rút gọn bài chú."
	help.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	column.add_child(help)
	editor = TextEdit.new()
	editor.custom_minimum_size = Vector2(320, 230)
	editor.wrap_mode = TextEdit.LINE_WRAPPING_BOUNDARY
	column.add_child(editor)
	_add_button(column, "Lưu văn bản đang chọn", _save_text)
	_add_button(column, "Nhập văn bản TXT", _open_file)
	_add_button(column, "Trở lại tu tập", queue_free)
	file_dialog = FileDialog.new()
	file_dialog.file_mode = FileDialog.FILE_MODE_OPEN_FILE
	file_dialog.access = FileDialog.ACCESS_FILESYSTEM
	file_dialog.add_filter("*.txt", "Văn bản UTF-8")
	file_dialog.file_selected.connect(_load_file)
	add_child(file_dialog)
	var voices := DisplayServer.tts_get_voices_for_language("vi")
	if voices.size() > 0:
		voice = voices[0]
	DisplayServer.tts_set_utterance_callback(DisplayServer.TTS_UTTERANCE_ENDED, _on_utterance_end)
	_select(selected)

func _add_button(parent: Node, title: String, callback: Callable) -> void:
	var b := Button.new()
	b.text = title
	b.custom_minimum_size.y = 49
	b.pressed.connect(callback)
	parent.add_child(b)

func _path() -> String:
	return "user://chu_" + selected + ".txt"

func _select(which: String) -> void:
	_stop()
	selected = which
	editor.text = FileAccess.get_file_as_string(_path()) if FileAccess.file_exists(_path()) else ""
	current = 0
	repeat_count = 0
	_parse_lines()
	_refresh()

func _parse_lines() -> void:
	lines = PackedStringArray()
	for raw in editor.text.split("\n"):
		var clean := raw.strip_edges()
		if not clean.is_empty():
			lines.append(clean)

func _save_text() -> void:
	_stop()
	_parse_lines()
	var file := FileAccess.open(_path(), FileAccess.WRITE)
	if file == null:
		status.text = "Không thể lưu văn bản."
		return
	file.store_string(editor.text)
	current = 0
	repeat_count = 0
	_refresh()

func _refresh() -> void:
	var name := "CHÚ ĐẠI BI" if selected == "dai_bi" else "CHÚ LĂNG NGHIÊM"
	if lines.is_empty():
		verse.text = "Chưa có văn bản."
		status.text = name + " • Hãy nhập đủ toàn văn đúng bản trì tụng của đạo tràng."
		return
	current = clampi(current, 0, lines.size() - 1)
	verse.text = lines[current]
	status.text = "%s • Câu %d/%d • Đã đọc %d biến" % [name, current + 1, lines.size(), repeat_count]
	if voice.is_empty():
		status.text += " • Thiết bị thiếu giọng đọc tiếng Việt"

func _step(amount: int) -> void:
	_stop()
	if lines.is_empty():
		return
	current = clampi(current + amount, 0, lines.size() - 1)
	_refresh()

func _play() -> void:
	_parse_lines()
	if lines.is_empty():
		_refresh()
		return
	if voice.is_empty():
		status.text = "Thiết bị chưa cài giọng đọc tiếng Việt. Vẫn có thể đọc theo văn bản."
		return
	playing = true
	_speak_current()

func _speak_current() -> void:
	if not playing or lines.is_empty():
		return
	_refresh()
	DisplayServer.tts_speak(lines[current], voice, 60, 1.0, 0.75, 0, true)

func _on_utterance_end(_utterance_id: int) -> void:
	if not playing:
		return
	current += 1
	if current >= lines.size():
		current = 0
		repeat_count += 1
		playing = false
		_refresh()
		return
	call_deferred("_speak_current")

func _stop() -> void:
	playing = false
	DisplayServer.tts_stop()

func _open_file() -> void:
	file_dialog.popup_centered_ratio(0.9)

func _load_file(path: String) -> void:
	var file := FileAccess.open(path, FileAccess.READ)
	if file == null:
		status.text = "Không đọc được file."
		return
	editor.text = file.get_as_text()
	_save_text()

func _exit_tree() -> void:
	_stop()
