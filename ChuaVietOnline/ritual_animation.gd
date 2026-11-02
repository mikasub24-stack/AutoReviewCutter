extends RefCounted
## Each frame is a distinct body pose. All frames share a ground anchor.
const BOW_DURATION := 3.0
const INCENSE_DURATION := 3.0
static func sample(kind: String, time: float) -> Dictionary:
	var frames: Array[Vector2] = []
	match kind:
		"walk": frames = [Vector2(10,.24),Vector2(11,.24)]
		"prayer", "chant": return {"frame":1,"next":1,"blend":0.0}
		"kneel": frames = [Vector2(2,.3),Vector2(3,100000)]
		"stand": frames = [Vector2(3,.12),Vector2(2,.3),Vector2(0,100000)]
		"bow": frames = [Vector2(1,.25),Vector2(2,.3),Vector2(3,.35),Vector2(4,.45),Vector2(5,.9),Vector2(6,.45),Vector2(3,.3)]
		"meditate": frames = [Vector2(2,.3),Vector2(7,100000)]
		"incense": frames = [Vector2(1,.3),Vector2(8,1.2),Vector2(9,1.2),Vector2(3,.3)]
		_: return {"frame":0,"next":0,"blend":0.0}
	var t := maxf(0.0,time)
	if kind == "walk":
		t = fposmod(t,.48)
	for i in range(frames.size()):
		var duration := frames[i].y
		if t < duration:
			var next := int(frames[mini(i+1,frames.size()-1)].x)
			if kind == "walk" and i == frames.size()-1:
				next = int(frames[0].x)
			return {"frame":int(frames[i].x),"next":next,"blend":clampf((t-duration+.12)/.12,0,1)}
		t -= duration
	return {"frame":int(frames[-1].x),"next":int(frames[-1].x),"blend":0.0}
