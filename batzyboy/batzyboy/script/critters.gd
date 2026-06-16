extends Node2D
## Ambient critter — steering-based flight.
## Per-instance RNG so batch-duplicated critters never sync.
## Set z-index in inspector per critter.

@export var speed_min: float = 15.0
@export var speed_max: float = 50.0
@export var turn_interval_min: float = 0.3
@export var turn_interval_max: float = 3.0
@export var wiggle_strength: float = 8.0
@export var roam_radius: float = 400.0

var _rng: RandomNumberGenerator
var _speed: float
var _velocity: Vector2
var _home: Vector2
var _turn_timer: float
var _wiggle_time: float
var _personality_turn_amount: float

func _ready() -> void:
	_rng = RandomNumberGenerator.new()
	_rng.seed = hash(get_instance_id())

	_home = global_position
	_speed = _rng.randf_range(speed_min, speed_max)
	_personality_turn_amount = _rng.randf_range(20.0, 140.0)
	_velocity = Vector2.RIGHT.rotated(_rng.randf_range(0.0, TAU))
	_turn_timer = _rng.randf_range(turn_interval_min, turn_interval_max)
	_wiggle_time = _rng.randf() * 100.0


func _pick_new_direction() -> void:
	var angle := deg_to_rad(_rng.randf_range(-_personality_turn_amount, _personality_turn_amount))
	_velocity = _velocity.rotated(angle).normalized()
	_turn_timer = _rng.randf_range(turn_interval_min, turn_interval_max)


func _process(delta: float) -> void:
	_turn_timer -= delta
	if _turn_timer <= 0.0:
		_pick_new_direction()

	if global_position.distance_to(_home) > roam_radius:
		var return_force := (_home - global_position).normalized() * 0.02
		_velocity = (_velocity + return_force).normalized()

	_wiggle_time += delta
	var wiggle := Vector2(
		sin(_wiggle_time * 1.7),
		cos(_wiggle_time * 2.3)
	) * wiggle_strength

	global_position += (_velocity * _speed * delta) + (wiggle * delta)
