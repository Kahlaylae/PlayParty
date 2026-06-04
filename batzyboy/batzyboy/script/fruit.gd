extends Area2D

@export var level: int         = 1
@export var points: int        = 1
@export var heal: int          = 0
var fall_speed: float          = 80.0   # downward px/s
var sine_freq: float           = 1.2    # sway cycles per second
var sine_amp: float            = 35.0   # sway width in pixels
var max_y: float               = 1100.0 # despawn Y — set at spawn
@export var pulse_speed: float = 3.0

var fruit_id: String = ""

signal collected(points: int, heal: int, fruit_id: String)

var _sprite_base_scale: float
var _base_x: float = 0.0
var _time: float   = 0.0  # random phase offset set in _ready

func _ready() -> void:
		if fruit_id.is_empty():
			fruit_id = name.to_lower()
		_base_x = position.x
		_time   = randf_range(0.0, TAU)  # random phase so fruits don't sway in sync
		body_entered.connect(_on_body_entered)
		var sprite := get_node_or_null("Sprite2D") as Sprite2D
		if sprite:
				_sprite_base_scale = sprite.scale.x
		else:
				_sprite_base_scale = 1.0


func _process(delta: float) -> void:
		_time += delta
		position.x = _base_x + sin(_time * sine_freq) * sine_amp - _time * 18.0
		position.y += fall_speed * delta
		if global_position.y > max_y or global_position.x < -600.0 or global_position.x > 1400.0:
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
				emit_signal("collected", points, heal, fruit_id)
				queue_free()
