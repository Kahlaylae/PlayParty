extends CharacterBody2D

@export var run_speed: float = 250.0
@export var orbit_range: float = 200.0
@export var pushback_strength: float = 300.0
@export var pushback_arc: float = -150.0
@export var attack_cooldown: float = 1.0
@export var melee_range: float = 100.0
@export var z_behind: int = -3
@export var z_front: int = 1

@onready var sprite: AnimatedSprite2D = $AnimatedSprite2D

var gravity: float = ProjectSettings.get_setting("physics/2d/default_gravity")
var player: Node2D = null
var direction: int = 1
var cooldown_left: float = 0.0
var attacking: bool = false
var attack_target: Node2D = null


func set_player(p: Node2D) -> void:
	player = p
	global_position = player.global_position


func _ready() -> void:
	# Badger: no collision layer, mask 1 (floor only)
	collision_layer = 0
	collision_mask = 0
	set_collision_mask_value(1, true)


func _physics_process(delta: float) -> void:
	if player == null or not is_instance_valid(player):
		return

	# Gravity
	if not is_on_floor():
		velocity.y += gravity * delta

	# Attack cooldown
	if cooldown_left > 0.0:
		cooldown_left -= delta

	# While attacking, check if target is still in range
	if attacking:
		if attack_target == null or not is_instance_valid(attack_target):
			attacking = false
			attack_target = null
		else:
			var dist: float = global_position.distance_to(attack_target.global_position)
			if dist > melee_range:
				attacking = false
				attack_target = null
			else:
				# Keep attacking: apply pushback on cooldown
				if cooldown_left <= 0.0:
					_attack(attack_target)

	# Check for nearby enemies in the direction we're facing
	if not attacking and cooldown_left <= 0.0:
		var target := _find_directional_enemy()
		if target != null:
			attack_target = target
			_attack(target)

	# Movement: orbit around player's feet
	if not attacking:
		var offset_x := global_position.x - player.global_position.x
		# If beyond orbit range, turn around
		if offset_x > orbit_range:
			direction = -1
		elif offset_x < -orbit_range:
			direction = 1

		velocity.x = run_speed * direction

		# z-index: behind player when running right, in front when running left
		z_index = z_behind if direction > 0 else z_front

		if sprite != null:
			sprite.flip_h = direction < 0
			if sprite.animation != "run":
				sprite.play("run")
	else:
		velocity.x = 0.0

	move_and_slide()


func _find_directional_enemy() -> Node2D:
	var enemies := get_tree().get_nodes_in_group("enemies")
	var closest: Node2D = null
	var closest_dist: float = melee_range
	for enemy in enemies:
		if not is_instance_valid(enemy):
			continue
		# Only detect enemies in the direction we're facing
		var diff_x: float = enemy.global_position.x - global_position.x
		if (direction > 0 and diff_x < 0) or (direction < 0 and diff_x > 0):
			continue
		var dist: float = global_position.distance_to(enemy.global_position)
		if dist <= closest_dist:
			closest_dist = dist
			closest = enemy
	return closest


func _attack(target: Node2D) -> void:
	attacking = true
	cooldown_left = attack_cooldown

	# Random attack animation
	var anim := "attack1" if randi() % 2 == 0 else "attack2"
	if sprite != null and sprite.sprite_frames != null:
		if sprite.sprite_frames.has_animation(anim):
			sprite.play(anim)

	# Pushback the enemy
	if target.has_method("knockback"):
		var away_dir := 1 if target.global_position.x >= global_position.x else -1
		target.knockback(away_dir, pushback_strength, pushback_arc)
