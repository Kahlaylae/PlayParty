extends Node2D

var max_value: float = 100.0
var value: float = 100.0
var bar_width: float = 80.0
var bar_height: float = 8.0


func _draw() -> void:
	if value >= max_value:
		return
	var ratio := value / max_value if max_value > 0.0 else 1.0
	var offset := Vector2(-bar_width * 0.5, 0.0)
	# Background
	draw_rect(Rect2(offset, Vector2(bar_width, bar_height)), Color(0.1, 0.1, 0.1, 0.85))
	# Fill — shifts green → red
	var fill_color := Color(1.0 - ratio, ratio * 0.85, 0.1, 1.0)
	draw_rect(Rect2(offset, Vector2(bar_width * ratio, bar_height)), fill_color)


func update_bar(new_value: float, new_max: float) -> void:
	value = new_value
	max_value = new_max
	queue_redraw()
