extends CharacterBody2D

@export var speed: float = 300.0
@export var jump_velocity: float = -400.0
@export var double_jump_velocity: float = -350.0
@export var max_air_jumps: int = 4
@export var air_jump_cooldown: float = 2.0
@export var air_jump_diminish: float = 0.75
@export var level1_scene: PackedScene = preload("res://scenes/player/attacks/level1.tscn")
@export var level2_scene: PackedScene = preload("res://scenes/player/attacks/level2.tscn")
@export var tracker: float = 300.0
@export var attack_offset: Vector2 = Vector2(40, -20)
@export var fire_cooldown: float = 0.25
@export var hp: int = 100
@export var bounce_damping: float = 0.7
@export var bounce_damage_threshold: float = 300.0
@export var bounce_damage_multiplier: float = 0.02
@export var companion_scenes: Array[PackedScene] = []

@onready var sprite: AnimatedSprite2D = $AnimatedSprite2D

var gravity: float = ProjectSettings.get_setting("physics/2d/default_gravity")
var facing: int = 1
var cooldown_left: float = 0.0
var knockback_velocity: Vector2 = Vector2.ZERO
var air_jumps_used: int = 0
var air_jump_timer: float = 0.0
var jump_anim_played: bool = false
var dash_anim_played: bool = false


func _ready() -> void:
	# Player: layer 2, mask 1 (floor only)
	collision_layer = 0
	set_collision_layer_value(2, true)
	collision_mask = 0
	set_collision_mask_value(1, true)
	_spawn_companions()


func _spawn_companions() -> void:
	for scene in companion_scenes:
		if scene == null:
			continue
		var comp = scene.instantiate()
		get_tree().current_scene.call_deferred("add_child", comp)
		if comp.has_method("set_player"):
			comp.call_deferred("set_player", self)


func _physics_process(delta: float) -> void:
	# Default gravity
	if not is_on_floor():
		velocity.y += gravity * delta

	# Horizontal movement (reduced during knockback)
	var dir := Input.get_action_strength("Right") - Input.get_action_strength("Left")
	if knockback_velocity.length() > 5.0:
		velocity = knockback_velocity
		knockback_velocity = knockback_velocity.move_toward(Vector2.ZERO, 5000.0 * delta)
		move_and_slide()
		_check_bounce()
		_update_animation()
		return
	else:
		knockback_velocity = Vector2.ZERO
		velocity.x = dir * speed
	if dir > 0.1:
		facing = 1
		sprite.flip_h = false
	elif dir < -0.1:
		facing = -1
		sprite.flip_h = true

	# Jump
	if air_jump_timer > 0.0:
		air_jump_timer -= delta

	if Input.is_action_just_pressed("Jump"):
		if is_on_floor():
			velocity.y = jump_velocity
			air_jumps_used = 0
			air_jump_timer = 0.0
			jump_anim_played = false
			dash_anim_played = false
		elif air_jumps_used < max_air_jumps and air_jump_timer <= 0.0:
			var jump_vel := double_jump_velocity * pow(air_jump_diminish, air_jumps_used)
			velocity.y = jump_vel
			air_jumps_used += 1
			air_jump_timer = air_jump_cooldown
			dash_anim_played = false

	# Reset air jumps on landing
	if is_on_floor():
		air_jumps_used = 0
		air_jump_timer = 0.0
		jump_anim_played = false
		dash_anim_played = false

	# Cooldown tick
	if cooldown_left > 0.0:
		cooldown_left -= delta

	# Auto-attack: find closest enemy within tracker range and fire
	if cooldown_left <= 0.0:
		var target := _find_closest_enemy()
		if target != null:
			_auto_attack(target)

	move_and_slide()
	_update_animation()


func _is_on_platform() -> bool:
	for i in get_slide_collision_count():
		var col := get_slide_collision(i)
		var collider := col.get_collider()
		if collider != null and collider.is_in_group("platform"):
			return true
	return false


func _find_closest_enemy() -> Node2D:
	var on_platform := _is_on_platform()
	var enemies := get_tree().get_nodes_in_group("enemies")
	var closest: Node2D = null
	var closest_dist: float = tracker
	for enemy in enemies:
		if not is_instance_valid(enemy):
			continue
		# On a platform: ignore enemies below us
		if on_platform and enemy.global_position.y > global_position.y:
			continue
		var dist: float = global_position.distance_to(enemy.global_position)
		if dist <= closest_dist:
			closest_dist = dist
			closest = enemy
	return closest


func _auto_attack(target: Node2D) -> void:
	# Randomly pick level1 (fireball) or level2 (firelaunch)
	var use_level2 := randi() % 2 == 0
	var scene: PackedScene = level2_scene if use_level2 else level1_scene
	var kind := "firelaunch" if use_level2 else "fireball"

	if scene == null:
		return

	# Only turn to face target when idle (not moving or jumping)
	var aim_dir := 1 if target.global_position.x >= global_position.x else -1
	if is_on_floor() and abs(velocity.x) < 5.0:
		facing = aim_dir
		sprite.flip_h = facing < 0

	var proj = scene.instantiate()
	get_tree().current_scene.add_child(proj)
	proj.global_position = global_position + Vector2(attack_offset.x * facing, attack_offset.y)
	# Aim vertically if enemy is flying OR if there's a significant height difference
	var target_flying: bool = target.get("is_flying") == true
	var height_gap: float = abs(global_position.y - target.global_position.y)
	var needs_vertical_aim: bool = target_flying or height_gap > 80.0
	proj.setup_projectile(kind, facing, target.global_position, needs_vertical_aim)

	cooldown_left = fire_cooldown


func _update_animation() -> void:
	if sprite == null:
		return
	# Airborne: first jump plays "jump", any air jump plays "dash"
	if not is_on_floor():
		if air_jumps_used > 0 and not dash_anim_played:
			sprite.play("dash")
			dash_anim_played = true
			return
		elif air_jumps_used == 0 and not jump_anim_played:
			sprite.play("jump")
			jump_anim_played = true
			return
		# Let jump/dash finish before switching
		if sprite.is_playing() and (sprite.animation == "jump" or sprite.animation == "dash"):
			return
	# Run or idle (works on ground and in air after jump/dash finishes)
	if abs(velocity.x) > 5.0:
		if sprite.animation != "run":
			sprite.play("run")
	else:
		if sprite.animation != "idle":
			sprite.play("idle")


func knockback(dir: int, strength: float = 200.0, arc: float = -150.0) -> void:
	knockback_velocity = Vector2(strength * dir, arc)
	_flash_hit()


func _flash_hit() -> void:
	if sprite != null:
		sprite.modulate = Color(1.0, 0.35, 0.35)
		await get_tree().create_timer(0.12).timeout
		if is_instance_valid(self) and sprite != null:
			sprite.modulate = Color.WHITE


func _check_bounce() -> void:
	for i in get_slide_collision_count():
		var col := get_slide_collision(i)
		var impact_speed := knockback_velocity.length()
		var normal := col.get_normal()
		# Reflect velocity off the surface and dampen
		knockback_velocity = knockback_velocity.bounce(normal) * bounce_damping
		# Cap max bounce speed to prevent physics explosion
		if knockback_velocity.length() > 3000.0:
			knockback_velocity = knockback_velocity.normalized() * 3000.0
		# Deal damage if impact was hard enough
		if impact_speed >= bounce_damage_threshold:
			var dmg := int(impact_speed * bounce_damage_multiplier)
			if dmg > 0:
				hp -= dmg
				if hp <= 0:
					hp = 0
				_flash_hit()
		break
