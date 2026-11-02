extends Node
## WebSocket client: the server alone decides who owns each seat.
signal occupancy_changed
signal seat_rejected(seat: int)
signal seat_confirmed(seat: int)
signal connection_changed(connected: bool)
var socket := WebSocketPeer.new()
var connected := false
var display_name := ""
var client_id := -1
var occupants: Dictionary = {}
var remote_players: Dictionary = {}
var move_timer := 0.0
var reconnect_timer := 0.0
var server_url := "ws://127.0.0.1:8788"
var own_seat := -1
var pending_seat := -1
var last_position := Vector2(860, 900)
var last_gender := 0
var last_robe := 0

func _ready() -> void:
	var saved := ConfigFile.new()
	if saved.load("user://multiplayer.cfg") == OK:
		server_url = str(saved.get_value("network", "url", server_url))
	if not OS.has_feature("editor") and server_url == "ws://127.0.0.1:8788":
		set_process(false)
		return
	connect_server()

func configure(url: String) -> void:
	if not (url.begins_with("ws://") or url.begins_with("wss://")):
		return
	server_url = url
	var config := ConfigFile.new()
	config.set_value("network","url",url)
	config.save("user://multiplayer.cfg")
	socket.close()
	connected = false
	client_id = -1
	own_seat = -1
	pending_seat = -1
	occupants.clear()
	remote_players.clear()
	connection_changed.emit(false)
	occupancy_changed.emit()
	reconnect_timer = 0.0
	connect_server()
	set_process(true)

func connect_server() -> void:
	if socket.get_ready_state() == WebSocketPeer.STATE_OPEN:
		return
	socket = WebSocketPeer.new()
	socket.connect_to_url(server_url)

func _process(delta: float) -> void:
	socket.poll()
	var state := socket.get_ready_state()
	if state == WebSocketPeer.STATE_OPEN:
		while socket.get_available_packet_count() > 0:
			var packet := socket.get_packet().get_string_from_utf8()
			var parsed: Variant = JSON.parse_string(packet)
			if typeof(parsed) == TYPE_DICTIONARY:
				_receive(parsed)
	elif state == WebSocketPeer.STATE_CLOSED:
		if connected:
			connected = false
			pending_seat = -1
			own_seat = -1
			client_id = -1
			occupants.clear()
			remote_players.clear()
			connection_changed.emit(false)
			occupancy_changed.emit()
		reconnect_timer += delta
		if reconnect_timer > 5.0:
			reconnect_timer = 0.0
			connect_server()

func _receive(msg: Dictionary) -> void:
	var kind := str(msg.get("type",""))
	match kind:
		"welcome":
			client_id = int(msg.get("id",-1))
			set_display_name(display_name)
			_send({"type":"move","x":last_position.x,"y":last_position.y,"gender":last_gender,"robe":last_robe})
			remote_players.clear()
			occupants.clear()
			var peers: Array = msg.get("players",[])
			for p in peers:
				if typeof(p) == TYPE_DICTIONARY:
					_add_player(p)
			connected = true
			reconnect_timer = 0.0
			connection_changed.emit(true)
			occupancy_changed.emit()
		"join":
			var p: Dictionary = msg.get("player",{})
			_add_player(p)
			occupancy_changed.emit()
		"leave":
			var id := int(msg.get("id",-1))
			remote_players.erase(id)
			_rebuild_occupancy()
		"profile":
			var id := int(msg.get("id",-1))
			if id != client_id and remote_players.has(id):
				remote_players[id]["name"] = str(msg.get("name","Khách"))
		"move":
			var id := int(msg.get("id",-1))
			if id != client_id:
				var p: Dictionary = remote_players.get(id,{})
				p["x"] = float(msg.get("x",0.0))
				p["y"] = float(msg.get("y",0.0))
				p["gender"] = int(msg.get("gender",0))
				p["robe"] = int(msg.get("robe",0))
				remote_players[id] = p
		"seat_update":
			var id := int(msg.get("id",-1))
			if id == client_id:
				own_seat = int(msg.get("seat",-1))
			else:
				var p: Dictionary = remote_players.get(id,{})
				p["seat"] = int(msg.get("seat",-1))
				remote_players[id] = p
			_rebuild_occupancy()
		"seat_denied":
			pending_seat = -1
			seat_rejected.emit(int(msg.get("seat",-1)))
		"seat_ok":
			own_seat = int(msg.get("seat",-1))
			pending_seat = -1
			seat_confirmed.emit(own_seat)

func _add_player(p: Dictionary) -> void:
	var id := int(p.get("id",-1))
	if id < 0 or id == client_id:
		return
	remote_players[id] = p
	_rebuild_occupancy()

func _rebuild_occupancy() -> void:
	occupants.clear()
	for id in remote_players:
		var p: Dictionary = remote_players[id]
		var seat := int(p.get("seat",-1))
		if seat >= 0 and seat < 1000:
			occupants[seat] = id
	occupancy_changed.emit()

func request_seat(index: int) -> void:
	if not connected:
		return
	pending_seat = index
	_send({"type":"seat","seat":index})

func send_position(position: Vector2, gender: int, robe: int) -> void:
	last_position = position
	last_gender = gender
	last_robe = robe
	if not connected:
		return
	_send({"type":"move","x":position.x,"y":position.y,"gender":gender,"robe":robe})

func _send(msg: Dictionary) -> void:
	if socket.get_ready_state() == WebSocketPeer.STATE_OPEN:
		socket.send_text(JSON.stringify(msg))

func set_display_name(value: String) -> void:
	display_name = value
	if not value.is_empty():
		_send({"type":"profile","name":value})
