extends Camera2D

# Shake intensity and duration are set per-call via shake()
var shake_strength: float = 0.0
var shake_duration: float = 0.0
var shake_timer: float = 0.0
var base_offset: Vector2 = Vector2.ZERO


func _ready() -> void:
	base_offset = offset
	add_to_group("camera")


func _process(delta: float) -> void:
	if shake_timer > 0.0:
		shake_timer -= delta
		var progress := shake_timer / shake_duration
		var current_strength := shake_strength * progress
		offset = base_offset + Vector2(
			randf_range(-current_strength, current_strength),
			randf_range(-current_strength, current_strength)
		)
	else:
		offset = base_offset


# strength: how far the camera moves in pixels
# duration: how long the shake lasts in seconds
func shake(strength: float, duration: float) -> void:
	# Only override if this shake is stronger than current
	if strength >= shake_strength * (shake_timer / max(shake_duration, 0.001)):
		shake_strength = strength
		shake_duration = duration
		shake_timer = duration
