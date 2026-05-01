extends Node2D

# ─── Tweak these ──────────────────────────────────────────────────────────────

# Base scroll speed in pixels/second — matches SCROLL_SPEED in main.gd.
# Change this independently if you want the BG to feel faster/slower than gameplay.
@export var base_speed: float = 300.0

# Per-layer UV multipliers.
# 0.0 = static, 1.0 = moves at full base_speed.
# Lower = more distant, higher = closer.
@export var mults: Dictionary = {
	"background4": 0.15,
	"background3": 0.25,
	"background2": 0.35,
	"background1": 0.45,
	"foreground":  0.55,
	"water":       0.70,
	"ground":      0.85,
}


func _ready() -> void:
	for child in get_children():
		if child is Sprite2D:
			child.texture_filter = CanvasItem.TEXTURE_FILTER_NEAREST
			child.texture_repeat  = CanvasItem.TEXTURE_REPEAT_ENABLED


# Called each frame from main.gd with an explicit pixel/s speed.
# Use scroll_at(100.0, delta) for UI states, scroll_at(scroll_speed, delta) for gameplay.
func scroll_at(speed: float, delta: float) -> void:
	for child in get_children():
		if child is Sprite2D and mults.has(child.name):
			var r: Rect2 = child.region_rect
			r.position.x += speed * (mults[child.name] as float) * delta
			child.region_rect = r
