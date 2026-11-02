extends SceneTree
var hall
var frame_index := 0
const FRAME_DELTA := .05
func _initialize() -> void:
	call_deferred("_run")
func capture(label: String = "") -> void:
	hall.queue_redraw()
	await process_frame
	await RenderingServer.frame_post_draw
	var picture := root.get_texture().get_image()
	assert(not picture.is_empty())
	picture.save_png("res://build/review_frames/frame_%04d.png" % frame_index)
	if not label.is_empty():
		picture.save_png("res://build/"+label+".png")
		picture.save_jpg("res://build/"+label+".jpg",.85)
	frame_index += 1
func advance(seconds: float) -> void:
	for i in range(int(seconds/FRAME_DELTA)):
		hall._process(FRAME_DELTA)
		await capture()
func _run() -> void:
	DirAccess.make_dir_recursive_absolute("res://build/review_frames")
	root.size = Vector2i(540,960)
	hall = load("res://main.tscn").instantiate()
	root.add_child(hall)
	await process_frame
	if hall.hud.modal != null and is_instance_valid(hall.hud.modal):
		hall.hud.modal.queue_free()
	hall.set_player_name("An Nhiên")
	hall.set_process(false)
	hall.view_section = 0
	hall.player = Vector2(860,960)
	hall.selected_seat = -1
	hall.body_action = "idle"
	hall.body_action_elapsed = 0
	assert(hall.ritual_sheets.size() == 3)
	await capture("temple-preview")
	await advance(.4)
	hall.hud.action_buttons.kneel.pressed.emit()
	await advance(.7)
	await capture("ritual-kneel")
	hall.hud.action_buttons.bow.pressed.emit()
	await advance(1.6)
	assert(hall.RITUAL_ANIMATION.sample(hall.body_action,hall.body_action_elapsed).frame == 5)
	await capture("ritual-bow")
	await advance(1.6)
	assert(hall.body_action == "kneel")
	hall.action("pause")
	await advance(.6)
	hall.hud.action_buttons.incense.pressed.emit()
	await advance(.7)
	await capture("ritual-incense")
	await advance(2.5)
	hall.action("pause")
	await advance(.5)
	print("PASS: real viewport recorded kneeling, bowing, prostration, standing and incense")
	hall.queue_free()
	await process_frame
	quit()
