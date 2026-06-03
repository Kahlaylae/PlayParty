extends Area2D

@export var level: int         = 1
@export var points: int        = 1
@export var heal: int          = 0
var speed: float               = 0.0
@export var pulse_speed: float = 3.0

signal collected(points: int, heal: int)

var _sprite_base_scale: float

func _ready() -> void:
		body_entered.connect(_on_body_entered)
		var sprite := get_node_or_null("Sprite2D") as Sprite2D
		if sprite:
				_sprite_base_scale = sprite.scale.x
		else:
				_sprite_base_scale = 1.0


func _process(delta: float) -> void:
		position.x -= speed * delta
		position.y += 80.0 * delta
		if global_position.x < -600.0:
				queue_free()
		# Squash-stretch bounce
		var t := sin(Time.get_ticks_msec() * 0.003 * pulse_speed)
		var sx := 1.0 - t * 0.06
		var sy := 1.0 + t * 0.09
		var sprite := get_node_or_null("Sprite2D") as Sprite2D
		if sprite:
				sprite.scale = Vector2(sx, sy) * _sprite_base_scale


func _on_body_entered(body: Node2D) -> void:
		if body.is_in_group("bat"):
				body.play_eat()
				emit_signal("collected", points, heal)
				queue_free()
