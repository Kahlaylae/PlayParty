extends Area2D

@export var level: int   = 1
@export var points: int  = 1
@export var heal: int    = 0
@export var speed: float = 300.0

signal collected(points: int, heal: int)

# 8-bit stepped breathing: 4 discrete scale values at 0.12 s each (0.48 s cycle)
const BREATHE_STEPS := [0.98, 0.99, 1.0, 0.99]
var _base_scale: Vector2
var _breathe_t:  float = 0.0

# Black outline shader source — solid black at sprite's alpha
const _OUTLINE_SHADER_SRC := """
shader_type canvas_item;
void fragment() {
    COLOR = vec4(0.0, 0.0, 0.0, texture(TEXTURE, UV).a);
}
"""


func _ready() -> void:
	body_entered.connect(_on_body_entered)

	_base_scale = scale
	_breathe_t  = randf_range(0.0, 0.48)   # random phase so each fruit breathes out of sync

	# White outline — 4 Sprite2D duplicates offset by 1 px in each cardinal direction
	var spr := get_node_or_null("Sprite2D") as Sprite2D
	if spr:
		var mat := ShaderMaterial.new()
		var sh  := Shader.new()
		sh.code = _OUTLINE_SHADER_SRC
		mat.shader = sh
		for offs: Vector2 in [Vector2(1,0), Vector2(-1,0), Vector2(0,1), Vector2(0,-1)]:
			var dup := spr.duplicate() as Sprite2D
			dup.z_index  = -1
			dup.position = spr.position + offs
			dup.material = mat
			add_child(dup)


func _process(delta: float) -> void:
	position.x -= speed * delta
	if global_position.x < -600.0:
		queue_free()
		return

	# Stepped breathing scale (8-bit feel)
	_breathe_t += delta
	var idx := int(_breathe_t / 0.12) % BREATHE_STEPS.size()
	scale = _base_scale * BREATHE_STEPS[idx]


func _on_body_entered(body: Node2D) -> void:
	if body.is_in_group("bat"):
		body.play_eat()
		emit_signal("collected", points, heal)
		queue_free()
