extends SceneTree
var a
var b
var rejected := false
func _initialize() -> void:
	call_deferred("_run")
func _wait_until(check: Callable) -> bool:
	var deadline := Time.get_ticks_msec()+5000
	while not check.call():
		if Time.get_ticks_msec()>deadline:
			return false
		await process_frame
	return true
func _run() -> void:
	var client := load("res://multiplayer.gd")
	a = client.new()
	b = client.new()
	root.add_child(a)
	root.add_child(b)
	assert(await _wait_until(func(): return a.connected and b.connected))
	assert(a.client_id != b.client_id)
	assert(await _wait_until(func(): return a.remote_players.size() == 1 and b.remote_players.size() == 1))
	a.request_seat(42)
	assert(await _wait_until(func(): return a.own_seat == 42 and b.occupants.has(42)))
	b.seat_rejected.connect(func(_seat: int): rejected = true)
	b.request_seat(42)
	assert(await _wait_until(func(): return rejected))
	assert(b.own_seat == -1)
	a.socket.close()
	assert(await _wait_until(func(): return not a.connected and not b.occupants.has(42)))
	b.request_seat(42)
	assert(await _wait_until(func(): return b.own_seat == 42))
	a.connect_server()
	assert(await _wait_until(func(): return a.connected and a.occupants.has(42)))
	print("PASS: Godot clients handshake, occupancy, conflict rejection, disconnect and reconnect")
	a.socket.close()
	b.socket.close()
	a.queue_free()
	b.queue_free()
	await process_frame
	quit()
