extends CharacterBody2D

@export var speed: float = 300.0
@export var jumpSpeed: float = -400.0
@export var double_jump_velocity: float = -350.0
@export var aimDistance: float = 300.0
@export var hp: int = 25
@export var ultimateCooldown: int = 3
@export var firespeed: float = 0.25

@export var max_air_jumps: int = 4
@export var air_jump_cooldown: float = 2.0
@export var air_jump_diminish: float = 0.75

@export var basicAttack: PackedScene = preload("res://scenes/player/attacks/level1.tscn")
@export var ultimateAttack: PackedScene = preload("res://scenes/player/attacks/level2.tscn")

@export var attack_offset: Vector2 = Vector2(40, -20)


@export var dash_speed: float = 200.0
@export var dash_cooldown: float = 1.0
@export var dash_duration: float = 0.15
@export var bounce_damping: float = 0.7
@export var bounce_damage_threshold: float = 300.0
@export var bounce_damage_multiplier: float = 0.02
@export var hit_sound_medium: AudioStream
@export var hit_sound_heavy: AudioStream
@export var companion_scenes: Array[PackedScene] = []
@export var chat_bubble_offset: Vector2 = Vector2(-50.0, -140.0)
@export var chat_bubble_font_size: int = 13

signal died
signal hp_changed(new_hp: int)

var paused: bool = true   # set false by game.gd when the game starts

var _dialogue: Dictionary = {}
var _idle_timer: float = 0.0
var _idle_quip_interval: float = 6.0
var _low_hp_quipped: bool = false
var _global_quip_cooldown: float = 0.0
const _GLOBAL_QUIP_COOLDOWN: float = 15.0


@onready var sprite: AnimatedSprite2D = $AnimatedSprite2D

var gravity: float = ProjectSettings.get_setting("physics/2d/default_gravity")
var facing: int = 1
var cooldown_left: float = 0.0
var knockback_velocity: Vector2 = Vector2.ZERO
var _fireball_count: int = 0
var air_jumps_used: int = 0
var air_jump_timer: float = 0.0
var jump_anim_played: bool = false
var dash_anim_played: bool = false
var _dash_cooldown_left: float = 0.0
var _dash_time_left: float = 0.0
var _dash_dir: int = 0
var _last_dir_press: int = 0
var _double_tap_timer: float = 0.0
var _is_dashing: bool = false
var max_hp: int = 0
var _quip_label: Label = null
var _quip_timer: float = 0.0
const _DOUBLE_TAP_WINDOW: float = 0.25


func _ready() -> void:
	# Player: layer 2, mask 1 (floor only)
	collision_layer = 0
	set_collision_layer_value(2, true)
	collision_mask = 0
	set_collision_mask_value(1, true)
	max_hp = hp
	add_to_group("player")
	_load_dialogue()
	_setup_quip_label()
	_spawn_companions()


func _load_dialogue() -> void:
	var f := FileAccess.open("res://json/dialogue.json", FileAccess.READ)
	if f == null:
		return
	var result: Variant = JSON.parse_string(f.get_as_text())
	if result is Dictionary:
		_dialogue = result
	_idle_quip_interval = randf_range(5.0, 8.0)


func _setup_quip_label() -> void:
	_quip_label = Label.new()
	_quip_label.position = chat_bubble_offset
	_quip_label.size = Vector2(200.0, 60.0)
	_quip_label.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	_quip_label.add_theme_font_size_override("font_size", chat_bubble_font_size)
	_quip_label.add_theme_color_override("font_color", Color.WHITE)
	_quip_label.add_theme_color_override("font_shadow_color", Color(0, 0, 0, 0.8))
	_quip_label.add_theme_constant_override("shadow_offset_x", 1)
	_quip_label.add_theme_constant_override("shadow_offset_y", 1)
	_quip_label.visible = false
	add_child(_quip_label)


func show_quip(text: String) -> void:
	if _quip_label == null:
		return
	if _global_quip_cooldown > 0.0:
		return
	_quip_label.text = text
	_quip_label.visible = true
	_quip_timer = 2.5
	_global_quip_cooldown = _GLOBAL_QUIP_COOLDOWN
	# Reset idle clock so it doesn't stack on top of triggered lines
	_idle_timer = 0.0
	_idle_quip_interval = randf_range(5.0, 8.0)


func _quip_from(category: String) -> String:
	if _dialogue.has(category) and _dialogue[category].size() > 0:
		return _dialogue[category].pick_random()
	return ""


func show_quip_from(category: String) -> void:
	var line := _quip_from(category)
	if line != "":
		show_quip(line)


func _spawn_companions() -> void:
	for scene in companion_scenes:
		if scene == null:
			continue
		var comp = scene.instantiate()
		get_tree().current_scene.call_deferred("add_child", comp)
		if comp.has_method("set_player"):
			comp.call_deferred("set_player", self)


func _physics_process(delta: float) -> void:
	if paused:
		return

	# Quip timer
	if _quip_timer > 0.0:
		_quip_timer -= delta
		if _quip_timer <= 0.0 and _quip_label != null:
			_quip_label.visible = false

	# Global dialogue cooldown
	if _global_quip_cooldown > 0.0:
		_global_quip_cooldown -= delta

	# Idle dialogue — tick only when grounded and barely moving
	if is_on_floor() and abs(velocity.x) < 5.0 and _quip_timer <= 0.0:
		_idle_timer += delta
		if _idle_timer >= _idle_quip_interval:
			_idle_timer = 0.0
			_idle_quip_interval = randf_range(5.0, 8.0)
			# Mix idle + meta + attack + witch into one pool
			var pool: Array[String] = []
			for cat in ["idle", "meta", "attack", "witch"]:
				if _dialogue.has(cat):
					pool.append_array(_dialogue[cat])
			if pool.size() > 0:
				show_quip(pool.pick_random())
	else:
		_idle_timer = 0.0

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

	# Active dash — override velocity for dash_duration seconds
	if _dash_time_left > 0.0:
		_dash_time_left -= delta
		velocity.x = (dash_speed / dash_duration) * _dash_dir
		move_and_slide()
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

	# Dash cooldown tick
	if _dash_cooldown_left > 0.0:
		_dash_cooldown_left -= delta

	# Double-tap dash detection
	if _double_tap_timer > 0.0:
		_double_tap_timer -= delta
	var tapped_right := Input.is_action_just_pressed("Right")
	var tapped_left  := Input.is_action_just_pressed("Left")
	if tapped_right or tapped_left:
		var tapped_dir := 1 if tapped_right else -1
		if tapped_dir == _last_dir_press and _double_tap_timer > 0.0 and _dash_cooldown_left <= 0.0:
			# Execute dash — travel dash_speed pixels over dash_duration seconds
			_dash_time_left = dash_duration
			_dash_dir = tapped_dir
			_dash_cooldown_left = dash_cooldown
			_double_tap_timer = 0.0
			_last_dir_press = 0
			_is_dashing = true
		else:
			_last_dir_press = tapped_dir
			_double_tap_timer = _DOUBLE_TAP_WINDOW

	# Jump
	if air_jump_timer > 0.0:
		air_jump_timer -= delta

	if Input.is_action_just_pressed("Jump"):
		if is_on_floor():
			velocity.y = jumpSpeed
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
			show_quip_from("jump")

	# Reset air jumps on landing
	if is_on_floor():
		air_jumps_used = 0
		air_jump_timer = 0.0
		jump_anim_played = false
		dash_anim_played = false

	# Cooldown tick
	if cooldown_left > 0.0:
		cooldown_left -= delta

	# Auto-attack: find closest enemy within aimDistance range and fire
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
	var closest_dist: float = aimDistance
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
	# Fire level1 (fireball) ultimateCooldown times, then fire level2 (firelaunch) once
	var use_level2 := _fireball_count >= ultimateCooldown
	var scene: PackedScene = ultimateAttack if use_level2 else basicAttack
	var kind := "firelaunch" if use_level2 else "fireball"
	_fireball_count = 0 if use_level2 else _fireball_count + 1
	if use_level2:
		show_quip_from("special")

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

	cooldown_left = firespeed


func _update_animation() -> void:
	if sprite == null:
		return
	# Ground dash
	if _is_dashing:
		if sprite.animation != "dash":
			sprite.play("dash")
		if not sprite.is_playing() or sprite.animation != "dash":
			_is_dashing = false
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
	_play_hit_sound(strength)
	_flash_hit()


func _play_hit_sound(strength: float) -> void:
	var stream: AudioStream = null
	if strength >= 1000.0 and hit_sound_heavy != null:
		stream = hit_sound_heavy
	elif strength >= 400.0 and hit_sound_medium != null:
		stream = hit_sound_medium
	if stream == null:
		return
	var snd := AudioStreamPlayer.new()
	snd.stream = stream
	get_tree().current_scene.add_child(snd)
	snd.play()
	snd.finished.connect(snd.queue_free)


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
					emit_signal("hp_changed", hp)
					emit_signal("died")
					set_physics_process(false)
				else:
					emit_signal("hp_changed", hp)
				# Low HP quip fires once per dip below threshold
				if hp <= int(max_hp * 0.3) and not _low_hp_quipped:
					_low_hp_quipped = true
					show_quip_from("lowhp")
				else:
					show_quip_from("hit")
				# Reset low-hp flag if healed back above threshold
				if hp > int(max_hp * 0.3):
					_low_hp_quipped = false
				_flash_hit()
		break


func instant_kill() -> void:
	hp = 0
	emit_signal("hp_changed", 0)
	emit_signal("died")
	set_physics_process(false)
