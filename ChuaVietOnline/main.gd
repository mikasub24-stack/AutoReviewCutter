extends Control

const CAPACITY := 1000
const SHOP_SCRIPT = preload("res://payment_shop.gd")
const PRACTICE_SCRIPT = preload("res://practice_panel.gd")
var selected_seat := -1
var beads := 0
var incense_particles: Array[Dictionary] = []
var meditation_seconds := 0.0
var meditation_active := false
var seats := {}
var status_text := "Chạm bồ đoàn để ngồi thiền"
var timer: Timer

func _ready() -> void:
	timer = Timer.new()
	timer.wait_time = 1.0
	timer.timeout.connect(_tick)
	add_child(timer)
	timer.start()
	queue_redraw()

func _tick() -> void:
	if meditation_active:
		meditation_seconds += 1
	for i in range(incense_particles.size() - 1, -1, -1):
		incense_particles[i].y -= 12.0
		incense_particles[i].life -= 1
		if incense_particles[i].life <= 0:
			incense_particles.remove_at(i)
	queue_redraw()

func _draw() -> void:
	var w := size.x
	var h := size.y
	draw_rect(Rect2(Vector2.ZERO, size), Color("#2d1511"))
	draw_rect(Rect2(12, 12, w - 24, h - 24), Color("#5e211a"))
	for x in [w * 0.12, w * 0.88]:
		draw_rect(Rect2(x - 18, 0, 36, h * 0.65), Color("#831c17"))
		draw_line(Vector2(x - 16, 20), Vector2(x + 16, 20), Color.GOLD, 5)
	draw_rect(Rect2(w * 0.21, h * 0.08, w * 0.58, h * 0.31), Color("#a66c24"))
	draw_circle(Vector2(w * 0.5, h * 0.205), w * 0.115, Color("#f3ce73"))
	draw_circle(Vector2(w * 0.5, h * 0.20), w * 0.068, Color("#b88123"))
	draw_rect(Rect2(w * 0.25, h * 0.38, w * 0.5, 24), Color("#b58b45"))
	draw_rect(Rect2(0, h * 0.55, w, h * 0.45), Color("#674536"))
	for i in range(20):
		var x := w * (0.16 + float(i % 4) * 0.22)
		var y := h * (0.62 + float(i / 4) * 0.056)
		var c := Color("#d6b34c") if i != selected_seat else Color("#5ac0a1")
		draw_ellipse_approx(Vector2(x,y), Vector2(30,11), c)
	draw_rect(Rect2(w * 0.27, h * 0.47, w * 0.46, 52), Color("#6b4220"))
	draw_string(ThemeDB.fallback_font, Vector2(w * 0.32, h * 0.47 + 33), "CUA HANG", HORIZONTAL_ALIGNMENT_LEFT, w * 0.4, 19, Color.WHITE)
	for p in incense_particles:
		draw_circle(Vector2(p.x, p.y), 5.0, Color(0.9,0.9,0.9,0.25))
	draw_string(ThemeDB.fallback_font, Vector2(18, h - 95), status_text, HORIZONTAL_ALIGNMENT_LEFT, w - 36, 18, Color.WHITE)
	draw_string(ThemeDB.fallback_font, Vector2(18, h - 60), "Niệm: %d/108 | Thiền: %ds" % [beads, int(meditation_seconds)], HORIZONTAL_ALIGNMENT_LEFT, w - 36, 18, Color.WHITE)
	draw_string(ThemeDB.fallback_font, Vector2(18, h - 28), "Chạm: bồ đoàn | góc trái: hương | góc phải: niệm", HORIZONTAL_ALIGNMENT_LEFT, w - 36, 15, Color.WHITE)

	draw_rect(Rect2(12, h * 0.80, w - 24, h * 0.07), Color("#7a4525"))
	draw_string(ThemeDB.fallback_font, Vector2(25, h * 0.84), "LAY - GO MO - TUNG KINH - NIEM HAT", HORIZONTAL_ALIGNMENT_LEFT, w - 40, 17, Color.WHITE)

func draw_ellipse_approx(center: Vector2, radius: Vector2, color: Color) -> void:
	var pts := PackedVector2Array()
	for j in range(33):
		var a := float(j) * TAU / 32.0
		pts.append(center + Vector2(cos(a) * radius.x, sin(a) * radius.y))
	draw_colored_polygon(pts, color)

func _gui_input(event: InputEvent) -> void:
	if event is InputEventScreenTouch and event.pressed:
		_handle_touch(event.position)
	elif event is InputEventMouseButton and event.pressed:
		_handle_touch(event.position)

func _handle_touch(p: Vector2) -> void:
	if p.y >= size.y * 0.80:
		var practice_panel := Control.new()
		practice_panel.set_script(PRACTICE_SCRIPT)
		add_child(practice_panel)
		return
	if p.y >= size.y * 0.47 and p.y <= size.y * 0.47 + 52 and p.x >= size.x * 0.27 and p.x <= size.x * 0.73:
		var shop := Control.new()
		shop.set_script(SHOP_SCRIPT)
		add_child(shop)
		return
	if p.y < size.y * 0.16:
		if p.x < size.x * 0.5:
			for i in range(12):
				incense_particles.append({"x": size.x * 0.5 + randf_range(-20,20), "y": size.y * 0.49, "life": 8 + i})
			status_text = "Đã thắp hương"
		else:
			beads = (beads + 1) % 109
			status_text = "Nam mô A Di Đà Phật"
	else:
		selected_seat = clampi(int((p.x / size.x - 0.05) / 0.22), 0, 3)
		meditation_active = not meditation_active
		status_text = "Đang thiền" if meditation_active else "Tạm dừng thiền"
	queue_redraw()
