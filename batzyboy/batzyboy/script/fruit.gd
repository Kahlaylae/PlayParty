extends Area2D

@export var level: int         = 1
@export var points: int        = 1
@export var heal: int          = 0
@export var pulse_speed: float = 3.0
@export var frozen: bool       = false

# ── Motion — set at spawn by main.gd; tweak the constants there ──────────────
var scroll_speed: float = 200.0  # px/s leftward, matched to world scroll
var drift_speed:  float = 40.0   # px/s downward slow drop
var sine_freq:    float = 1.2    # Y wobble cycles per second
var sine_amp:     float = 30.0   # Y wobble height in pixels

var fruit_id: String = ""
var _base_y:  float  = 0.0
var _time:    float  = 0.0

var _sprite_base_scale: float


func _ready() -> void:
	if fruit_id.is_empty():
		fruit_id = name.to_lower()
	_base_y = position.y
	_time   = randf_range(0.0, TAU)
	var sprite := get_node_or_null("Sprite2D") as Sprite2D
	if sprite:
		_sprite_base_scale = sprite.scale.x
	else:
		_sprite_base_scale = 1.0


func _physics_process(delta: float) -> void:
	# Movement + collision — skipped when frozen (collections display).
	if not frozen:
		_time   += delta
		position.x -= scroll_speed * delta
		_base_y    += drift_speed  * delta
		position.y  = _base_y + sin(_time * sine_freq) * sine_amp
		if global_position.x < -200.0 or global_position.y > 1200.0:
			queue_free()
			return
		for body in get_overlapping_bodies():
			if body.is_in_group("bat") \
					and not body.is_dying \
					and not body.frozen \
					and global_position.distance_to(body.global_position) < 40.0:
				body.play_eat()
				SaveManager.add_score(points)
				SaveManager.unlock_fruit(fruit_id)
				if heal > 0:
					body.heal(heal)
				elif heal < 0:
					body.take_damage(-heal)
				queue_free()
				return

	# Squash-stretch pulse — always runs, even when frozen (collections display).
	var t  := sin(Time.get_ticks_msec() * 0.003 * pulse_speed)
	var sx := 1.0 - t * 0.06
	var sy := 1.0 + t * 0.09
	var sprite := get_node_or_null("Sprite2D") as Sprite2D
	if sprite:
		sprite.scale = Vector2(sx, sy) * _sprite_base_scale
