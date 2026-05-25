extends Node2D

@export var base_speed: float = 300.0

# UV scroll multipliers — 0.0 static, 1.0 full speed
@export var mults: Dictionary = {
	"background4":  0.15,
	"background3":  0.25,
	"background2":  0.35,
	"background1":  0.45,
	"foreground":   0.55,
	"water":        0.70,
	"ground":       0.85,
	"noisetexture": 0.08,
}


func _ready() -> void:
	for child in get_children():
		if child is Sprite2D:
			child.texture_filter = CanvasItem.TEXTURE_FILTER_NEAREST
			child.texture_repeat  = CanvasItem.TEXTURE_REPEAT_ENABLED


func scroll_at(speed: float, delta: float) -> void:
	for child in get_children():
		if child is Sprite2D and mults.has(child.name):
			var r: Rect2 = child.region_rect
			r.position.x += speed * (mults[child.name] as float) * delta
			child.region_rect = r
