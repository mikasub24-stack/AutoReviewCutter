extends Control
## Payment sandbox UI. Never handles real money or admin credentials.
const API_DEFAULT := "http://127.0.0.1:8787"
const PRODUCTS := [
	{"id":"lotus","title":"Hoa sen ảo","price":10000},
	{"id":"incense","title":"Nhang trầm ảo","price":15000},
	{"id":"lantern","title":"Hoa đăng ảo","price":20000},
	{"id":"cushion","title":"Bồ đoàn trang trí","price":49000}
]
var api_url := API_DEFAULT
var player_id := ""
var order_id := ""
var selected_item := ""
var busy := false
var poll_elapsed := 0.0
var http: HTTPRequest
var panel: PanelContainer
var details: Label
var api_edit: LineEdit
var status: Label
var item_list: VBoxContainer
var back_button: Button
var inventory_button: Button
var current_action := ""

func _ready() -> void:
	mouse_filter = Control.MOUSE_FILTER_STOP
	set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	player_id = _get_player_id()
	var shade := ColorRect.new()
	shade.color = Color(0.07,0.035,0.025,0.9)
	shade.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	add_child(shade)
	panel = PanelContainer.new()
	panel.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	panel.offset_left = 18
	panel.offset_top = 35
	panel.offset_right = -18
	panel.offset_bottom = -35
	add_child(panel)
	var scroll := ScrollContainer.new()
	panel.add_child(scroll)
	var column := VBoxContainer.new()
	column.add_theme_constant_override("separation", 13)
	scroll.add_child(column)
	var heading := Label.new()
	heading.text = "CỬA HÀNG CHÙA VIỆT"
	heading.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	heading.add_theme_font_size_override("font_size", 24)
	column.add_child(heading)
	var warning := Label.new()
	warning.text = "SANDBOX - chỉ thử nghiệm, KHÔNG chuyển tiền thật."
	warning.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	warning.modulate = Color(1,0.72,0.35)
	column.add_child(warning)
	var server_label := Label.new()
	server_label.text = "Địa chỉ máy chủ thử nghiệm (Android: dùng IP máy tính):"
	server_label.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	column.add_child(server_label)
	api_edit = LineEdit.new()
	api_edit.text = API_DEFAULT
	api_edit.placeholder_text = "http://192.168.1.10:8787"
	column.add_child(api_edit)
	var connect := Button.new()
	connect.text = "Kiểm tra kết nối"
	connect.pressed.connect(_health)
	column.add_child(connect)
	var product_title := Label.new()
	product_title.text = "VẬT PHẨM"
	column.add_child(product_title)
	item_list = VBoxContainer.new()
	column.add_child(item_list)
	for product in PRODUCTS:
		var b := Button.new()
		b.text = "%s  -  %sđ" % [product["title"], str(product["price"])]
		b.custom_minimum_size.y = 52
		b.pressed.connect(_buy.bind(str(product["id"])))
		item_list.add_child(b)
	inventory_button = Button.new()
	inventory_button.text = "Xem kho vật phẩm"
	inventory_button.pressed.connect(_inventory)
	column.add_child(inventory_button)
	details = Label.new()
	details.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	details.text = "Mua vật phẩm để tạo đơn thử nghiệm."
	column.add_child(details)
	status = Label.new()
	status.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	column.add_child(status)
	back_button = Button.new()
	back_button.text = "Đóng cửa hàng"
	back_button.pressed.connect(queue_free)
	column.add_child(back_button)
	http = HTTPRequest.new()
	http.timeout = 12.0
	add_child(http)
	http.request_completed.connect(_response)
	set_process(true)

func _get_player_id() -> String:
	var p := "user://sandbox_player_id.txt"
	if FileAccess.file_exists(p):
		var saved := FileAccess.get_file_as_string(p).strip_edges()
		if saved.length() >= 3:
			return saved
	var id := "player_" + str(Time.get_unix_time_from_system()).replace(".","") + "_" + str(randi_range(100000,999999))
	var file := FileAccess.open(p, FileAccess.WRITE)
	if file != null:
		file.store_string(id)
	return id

func _endpoint() -> String:
	var value := api_edit.text.strip_edges().trim_suffix("/")
	if not (value.begins_with("http://") or value.begins_with("https://")):
		return ""
	return value

func _request(action: String, endpoint: String, payload: Dictionary = {}) -> void:
	if busy:
		return
	var base := _endpoint()
	if base.is_empty():
		status.text = "Địa chỉ API không hợp lệ."
		return
	busy = true
	current_action = action
	status.text = "Đang kết nối..."
	var headers := PackedStringArray(["Content-Type: application/json"])
	var method := HTTPClient.METHOD_GET
	var body := ""
	if not payload.is_empty():
		method = HTTPClient.METHOD_POST
		body = JSON.stringify(payload)
	var error := http.request(base + endpoint, headers, method, body)
	if error != OK:
		busy = false
		status.text = "Không thể gửi yêu cầu: " + str(error)

func _health() -> void:
	_request("health", "/health")

func _buy(item: String) -> void:
	selected_item = item
	order_id = ""
	_request("buy", "/api/orders", {"playerId":player_id,"itemId":item})

func _inventory() -> void:
	_request("inventory", "/api/inventory/" + player_id)

func _process(delta: float) -> void:
	if order_id.is_empty() or busy:
		return
	poll_elapsed += delta
	if poll_elapsed >= 3.0:
		poll_elapsed = 0.0
		_request("poll", "/api/orders/" + order_id)

func _response(result: int, code: int, _headers: PackedStringArray, body: PackedByteArray) -> void:
	var action := current_action
	busy = false
	if result != HTTPRequest.RESULT_SUCCESS:
		status.text = "Lỗi mạng. Kiểm tra IP máy chủ, Wi-Fi và quyền INTERNET."
		return
	var parsed: Variant = JSON.parse_string(body.get_string_from_utf8())
	if typeof(parsed) != TYPE_DICTIONARY:
		status.text = "Phản hồi máy chủ không hợp lệ."
		return
	var data: Dictionary = parsed
	if code < 200 or code >= 300:
		status.text = "API %d: %s" % [code, str(data.get("error","Lỗi không xác định"))]
		return
	match action:
		"health":
			status.text = "Kết nối OK - " + str(data.get("mode","unknown")) + " (không nhận tiền thật)"
		"buy":
			var order: Dictionary = data.get("order",{})
			order_id = str(order.get("id",""))
			poll_elapsed = 0.0
			details.text = "ĐƠN THỬ NGHIỆM\nSố tiền: %sđ\nNội dung: %s\nTrạng thái: chờ xác nhận giả lập.\nKHÔNG CHUYỂN TIỀN THẬT." % [str(order.get("amount",0)),str(order.get("transferContent",""))]
			status.text = "Đơn đã tạo. Chỉ quản trị sandbox được mô phỏng thanh toán trên máy chủ."
		"poll":
			var order: Dictionary = data.get("order",{})
			if str(order.get("status","")) == "paid":
				order_id = ""
				details.text = "Thanh toán GIẢ LẬP thành công! Vật phẩm đã vào kho thử nghiệm."
				status.text = "Mở Kho vật phẩm để xem."
		"inventory":
			var inv: Dictionary = data.get("items",{})
			details.text = "KHO VẬT PHẨM THỬ NGHIỆM\n" + JSON.stringify(inv, "  ")
			status.text = "Đã tải kho vật phẩm."
