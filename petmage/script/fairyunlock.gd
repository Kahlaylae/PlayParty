extends CharacterBody2D

@export var orbit_radius: float = 120.0
@export var orbit_speed: float = 1.5
@export var orbit_height_offset: float = -80.0
@export var attack_scene: PackedScene = preload("res://scenes/player/companion/companionattack.tscn")
@export var fire_cooldown: float = 0.8
@export var tracker: float = 300.0
@export var z_behind: int = -3
@export var z_front: int = 2
@export var rest_min: float = 4.0
@export var rest_max: float = 6.0
@export var impact_sound: AudioStream

@onready var sprite: AnimatedSprite2D = $AnimatedSprite2D

var player: Node2D = null
var orbit_time: float = 0.0
var cooldown_left: float = 0.0
var prev_x_offset: float = 0.0
var resting: bool = false
var rest_timer: float = 0.0


func _ready() -> void:
	# Zero out collision immediately — no physics presence ever
	collision_layer = 0
	collision_mask = 0


func set_player(p: Node2D) -> void:
	player = p
	collision_layer = 0
	collision_mask = 0


func _physics_process(delta: float) -> void:
	if player == null or not is_instance_valid(player):
		return

	# Resting at orbit edge
	if resting:
		rest_timer -= delta
		# Stay parked relative to player, always in front
		global_position = player.global_position + Vector2(prev_x_offset, orbit_height_offset)
		z_index = z_front
		if sprite != null:
			if sprite.animation != "idle":
				sprite.play("idle")
			# Match player's facing direction while idle
			var player_sprite: AnimatedSprite2D = player.get_node_or_null("AnimatedSprite2D")
			if player_sprite != null:
				sprite.flip_h = not player_sprite.flip_h
		# Still attack while resting
		_tick_attack(delta)
		if rest_timer <= 0.0:
			resting = false
		return

	# Orbit around player
	orbit_time += delta
	var x_offset := sin(orbit_time * orbit_speed * TAU) * orbit_radius
	global_position = player.global_position + Vector2(x_offset, orbit_height_offset)

	# Detect reaching an edge (sine peak) — start resting
	var orbit_vel: float = abs(cos(orbit_time * orbit_speed * TAU))
	if orbit_vel < 0.15 and not resting:
		resting = true
		rest_timer = randf_range(rest_min, rest_max)
		prev_x_offset = x_offset
		if sprite != null:
			sprite.play("idle")
			# Flip + z based on which side we stopped at
			if x_offset >= 0.0:
				sprite.flip_h = false
				z_index = z_front
			else:
				sprite.flip_h = true
				z_index = z_behind
		_tick_attack(delta)
		return

	# Flip sprite and z_index when crossing center
	if sprite != null:
		if x_offset >= 0.0 and prev_x_offset < 0.0:
			sprite.flip_h = false
			z_index = z_front
		elif x_offset < 0.0 and prev_x_offset >= 0.0:
			sprite.flip_h = true
			z_index = z_behind

		if sprite.animation != "run":
			sprite.play("run")

	prev_x_offset = x_offset

	_tick_attack(delta)


func _tick_attack(delta: float) -> void:
	# Cooldown tick
	if cooldown_left > 0.0:
		cooldown_left -= delta

	# Auto-attack
	if cooldown_left <= 0.0 and attack_scene != null:
		var target := _find_closest_enemy()
		if target != null:
			_auto_attack(target)


func _find_closest_enemy() -> Node2D:
	var enemies := get_tree().get_nodes_in_group("enemies")
	var closest: Node2D = null
	var closest_dist: float = tracker
	for enemy in enemies:
		if not is_instance_valid(enemy):
			continue
		# Check if fairy's Y falls within the enemy's collision shape vertical bounds
		var in_range := false
		var enemy_col: CollisionShape2D = enemy.get_node_or_null("CollisionShape2D")
		if enemy_col != null and enemy_col.shape != null:
			var shape_origin: float = enemy.global_position.y + enemy_col.position.y
			var half_h: float = 0.0
			if enemy_col.shape is RectangleShape2D:
				half_h = (enemy_col.shape as RectangleShape2D).size.y * 0.5 * enemy_col.scale.y
			elif enemy_col.shape is CapsuleShape2D:
				half_h = (enemy_col.shape as CapsuleShape2D).height * 0.5 * enemy_col.scale.y
			elif enemy_col.shape is CircleShape2D:
				half_h = (enemy_col.shape as CircleShape2D).radius * enemy_col.scale.y
			in_range = global_position.y >= shape_origin - half_h and global_position.y <= shape_origin + half_h
		if not in_range:
			continue
		var dist: float = global_position.distance_to(enemy.global_position)
		if dist <= closest_dist:
			closest_dist = dist
			closest = enemy
	return closest


func _auto_attack(target: Node2D) -> void:
	var dir := 1 if target.global_position.x >= global_position.x else -1
	var proj = attack_scene.instantiate()
	get_tree().current_scene.add_child(proj)
	var spawn_pos := global_position
	if sprite != null:
		spawn_pos = sprite.global_position
	proj.global_position = spawn_pos
	proj.setup_projectile(dir)
	if impact_sound != null:
		var snd := AudioStreamPlayer.new()
		snd.stream = impact_sound
		get_tree().current_scene.add_child(snd)
		snd.play()
		snd.finished.connect(snd.queue_free)
	cooldown_left = fire_cooldown
