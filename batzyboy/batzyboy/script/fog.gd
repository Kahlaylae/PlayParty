extends Sprite2D

@export var breath_speed: float = 0.18
@export var min_alpha: float = 0.3
@export var max_alpha: float = 0.85

func _process(_delta: float) -> void:
	var t := (sin(Time.get_ticks_msec() * 0.001 * breath_speed * TAU) + 1.0) * 0.5
	self_modulate.a = lerpf(min_alpha, max_alpha, t)
