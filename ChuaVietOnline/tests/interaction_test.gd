extends SceneTree
var hall
func _initialize() -> void:
	call_deferred("_run")

func _run() -> void:
	hall = load("res://main.tscn").instantiate()
	root.add_child(hall)
	await process_frame
	# Existing installs without a name must choose one before entering.
	hall.player_name = ""
	hall.hud.show_name_editor(true)
	var field: LineEdit = hall.hud.modal.find_children("*","LineEdit",true,false)[0]
	field.text = ""
	field.text_submitted.emit(field.text)
	assert(hall.player_name.is_empty())
	assert(not hall.set_player_name("x"))
	assert(not hall.set_player_name("[b]Fake[/b]"))
	assert(not hall.set_player_name("a".repeat(21)))
	field.text = "  Minh An  "
	field.text_submitted.emit(field.text)
	await process_frame
	assert(hall.player_name == "Minh An")
	assert(hall.set_player_name("Diệu   Hạnh"))
	assert(hall.player_name == "Diệu Hạnh")
	hall.player_name = ""
	hall._load_progress()
	assert(hall.player_name == "Diệu Hạnh")
	hall.hud.show_name_editor(false)
	await process_frame
	hall.hud.modal.queue_free()
	await process_frame
	hall.multiplayer_client.set_process(false)
	hall.multiplayer_client.socket.close()
	hall.player = Vector2(860,900)
	# All 1,000 world seats retain stable projection and hit coordinates.
	for index in range(1000):
		var point: Vector2 = hall._seat_position(index)
		assert(hall._unproject(hall._project(point)).distance_to(point)<0.01)
	hall.occupied_seats.clear()
	hall.selected_seat = 128
	hall.player = hall._seat_position(128)
	hall.action("meditate")
	assert(hall.sitting)
	hall._process(1.0)
	assert(hall.meditation_seconds >= 1.0)
	hall.action("meditate")
	assert(not hall.sitting)
	var old_position: Vector2 = hall.player
	hall.joystick = Vector2.RIGHT
	hall._process(0.05)
	assert(hall.player.x > old_position.x) # Can leave the cushion after standing.
	hall.stop_walking()
	hall.selected_seat = -1
	hall._seat_confirmed(128) # Late responses must not reseat a moving player.
	assert(not hall.sitting)
	var before: int = hall.merit
	hall.action("chant")
	assert(hall.merit == before+1)
	hall.action("incense")
	assert(hall.incense.size() == 8)
	hall.action("pause")
	assert(hall.ritual == "")
	hall.character_gender = 0
	hall.robe_brown = true
	hall.action("character")
	assert(not hall.robe_brown)
	hall.action("character")
	assert(hall.character_gender == 1)
	hall.action("character")
	assert(hall.character_gender == 0 and hall.robe_brown)
	for kind in ["bell","gear","missions","inventory","journal","peers","rewards"]:
		hall.hud._show_info(kind)
		await process_frame
		hall.hud.modal.queue_free()
		await process_frame
	for script in [hall.PRACTICE_SCRIPT,hall.SHOP_SCRIPT]:
		hall.open_panel(script)
		await process_frame
		if script == hall.PRACTICE_SCRIPT:
			for act in ["bow","wood","beads","meditate","incense","bell","flower","fruit","wheel","mantra","music","stop","dai_bi","lang_nghiem"]:
				hall.overlay._act(act)
				await process_frame
		hall.overlay.queue_free()
		await process_frame
	hall._save_progress()
	print("PASS: 1000 seat projections, sitting, rituals, characters, menus and overlays")
	hall.queue_free()
	await process_frame
	quit()
