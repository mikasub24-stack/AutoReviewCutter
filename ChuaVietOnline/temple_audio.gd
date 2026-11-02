extends Node
## Original procedural soundscape, no copyrighted recordings.
signal audio_status(message: String)
const RATE := 22050.0
var player: AudioStreamPlayer
var playback: AudioStreamGeneratorPlayback
var ambient := false
var phase := 0.0
var elapsed := 0.0
var effects: Array[Dictionary] = []
var rng := RandomNumberGenerator.new()

func _ready() -> void:
	if DisplayServer.get_name() == "headless":
		set_process(false)
		return
	rng.randomize()
	player = AudioStreamPlayer.new()
	var generator := AudioStreamGenerator.new()
	generator.mix_rate = RATE
	generator.buffer_length = 0.35
	player.stream = generator
	player.volume_db = -7.0
	add_child(player)
	player.play()
	playback = player.get_stream_playback()
	set_process(true)

func set_ambient(enabled: bool) -> void:
	ambient = enabled
	audio_status.emit("Nhạc thiền nền: " + ("bật" if enabled else "tắt"))

func trigger(kind: String) -> void:
	var duration := 2.5
	match kind:
		"bell": duration = 6.0
		"wood": duration = 0.65
		"incense": duration = 1.3
		"flower": duration = 1.5
		"bow": duration = 1.0
		"wheel": duration = 3.0
		_: return
	effects.append({"kind":kind,"time":0.0,"duration":duration})
	audio_status.emit("Âm thanh: " + kind)

func _process(_delta: float) -> void:
	if playback == null:
		return
	var frames := mini(playback.get_frames_available(), 4096)
	for i in range(frames):
		var dt := 1.0 / RATE
		elapsed += dt
		var sample: float = 0.0
		if ambient:
			# Gentle original drone and a sparse pentatonic melody.
			var root: float = sin(TAU * 110.0 * elapsed) * 0.05
			var fifth: float = sin(TAU * 164.81 * elapsed) * 0.025
			var pulse: float = 0.5 + 0.5 * sin(TAU * 0.11 * elapsed)
			var melody_notes := [220.0, 246.94, 293.66, 329.63, 392.0]
			var note_index: int = int(elapsed / 3.0) % melody_notes.size()
			var note_t: float = fmod(elapsed, 3.0)
			var note_env: float = exp(-note_t * 1.7)
			var note: float = sin(TAU * melody_notes[note_index] * elapsed) * note_env * 0.035
			sample += (root + fifth) * pulse + note
		for j in range(effects.size() - 1, -1, -1):
			var effect: Dictionary = effects[j]
			var t: float = float(effect["time"])
			var kind: String = str(effect["kind"])
			var v: float = 0.0
			match kind:
				"bell":
					var env: float = exp(-t * 0.95)
					v = env * (sin(TAU * 392.0 * t) * 0.14 + sin(TAU * 784.0 * t) * 0.075 + sin(TAU * 1019.2 * t) * 0.04)
				"wood":
					v = exp(-t * 20.0) * (sin(TAU * (230.0 + 70.0 * exp(-t * 22.0)) * t) * 0.35 + rng.randf_range(-0.08, 0.08))
				"incense", "flower", "bow":
					v = exp(-t * 4.0) * sin(TAU * 660.0 * t) * 0.045
				"wheel":
					v = exp(-t * 0.9) * (sin(TAU * 174.6 * t) * 0.09 + sin(TAU * 261.6 * t) * 0.06)
			sample += v
			effect["time"] = t + dt
			if effect["time"] >= effect["duration"]:
				effects.remove_at(j)
		sample = clampf(sample, -0.85, 0.85)
		playback.push_frame(Vector2(sample, sample))

func _exit_tree() -> void:
	set_process(false)
	if player != null:
		player.stop()
		player.stream = null
	playback = null
	effects.clear()
