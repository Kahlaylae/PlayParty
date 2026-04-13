extends CharacterBody2D

@export var speed: float = 1.0
@export var hp: int = 10
@export var level: int = 1
@export var is_boss: bool = false
@export var is_flying: bool = false
@export var float_amplitude: float = 6.0
@export var float_frequency: float = 2.0
@export var attack_duration: float = 0.5
@export var melee_range: float = 150.0
@export var detection_range: float = 500.0
@export var knockback_strength: float = 2000.0
@export var knockback_arc: float = -150.0
@export var bounce_damping: float = 0.7
@export var bounce_damage_threshold: float = 300.0
@export var bounce_damage_multiplier: float = 0.02
@export var idle_sound: AudioStream
@export var death_sound: AudioStream

var gravity: float = ProjectSettings.get_setting("physics/2d/default_gravity")
var player: Node2D = null
var sprite: AnimatedSprite2D = null
var float_time: float = 0.0
var sprite_base_y: float = 0.0
var attacking: bool = false
var attack_timer: float = 0.0
var knockback_velocity: Vector2 = Vector2.ZERO
var _idle_sound_node: AudioStreamPlayer = null
var _idle_sound_timer: float = 0.0


func _ready() -> void:
	add_to_group("enemies")
	# Enemy: layer 3, mask 1 (floor only — pass through player)
	collision_layer = 0
	set_collision_layer_value(3, true)
	collision_mask = 0
	set_collision_mask_value(1, true)
	# Find the AnimatedSprite2D child (name varies per scene)
	for child in get_children():
		if child is AnimatedSprite2D:
			sprite = child
			sprite_base_y = sprite.position.y
			break
	_start_idle_sound()


func _start_idle_sound() -> void:
	if idle_sound == null:
		return
	_idle_sound_node = AudioStreamPlayer.new()
	_idle_sound_node.stream = idle_sound
	add_child(_idle_sound_node)
	_idle_sound_node.play()
	_idle_sound_timer = randf_range(3.0, 5.0)


func _physics_process(delta: float) -> void:
	# Gravity (grounded enemies only)
	if not is_flying and not is_on_floor():
		velocity.y += gravity * delta

	# Idle sound cooldown loop
	if _idle_sound_node != null and not _idle_sound_node.playing:
		_idle_sound_timer -= delta
		if _idle_sound_timer <= 0.0:
			_idle_sound_node.play()
			_idle_sound_timer = randf_range(3.0, 5.0)

	# Apply knockback
	if knockback_velocity.length() > 5.0:
		velocity = knockback_velocity
		knockback_velocity = knockback_velocity.move_toward(Vector2.ZERO, 3000.0 * delta)
		move_and_slide()
		_check_bounce()
		return
	else:
		knockback_velocity = Vector2.ZERO

	# Find the player node in the scene
	if player == null or not is_instance_valid(player):
		var scene := get_tree().current_scene
		if scene != null:
			player = scene.find_child("Player")

	# Calculate distance to player once
	var dist_to_player := INF
	if player != null and is_instance_valid(player):
		dist_to_player = global_position.distance_to(player.global_position)

	# Tick down attack anim timer
	if attacking:
		attack_timer -= delta
		if attack_timer <= 0.0:
			attacking = false

	# Movement: chase player if in detection range
	if attacking:
		velocity.x = 0.0
		if is_flying:
			velocity.y = 0.0
	elif speed > 0.0 and player != null and is_instance_valid(player):
		if dist_to_player <= detection_range:
			var to_player := player.global_position - global_position
			var dir := to_player.normalized()

			velocity.x = dir.x * speed
			if is_flying:
				velocity.y = dir.y * speed

			if sprite != null:
				sprite.flip_h = dir.x < 0.0

			_play_anim("run")
		else:
			velocity.x = 0.0
			if is_flying:
				velocity.y = 0.0
			_play_anim("idle")
	else:
		velocity.x = 0.0
		if is_flying:
			velocity.y = 0.0
		_play_anim("idle")

	# Floating bob effect
	if is_flying and sprite != null:
		float_time += delta
		sprite.position.y = sprite_base_y + sin(float_time * float_frequency * TAU) * float_amplitude

	move_and_slide()

	# Melee attack when overlapping the player
	if not attacking and player != null and is_instance_valid(player) and dist_to_player <= melee_range:
		attacking = true
		attack_timer = attack_duration
		_play_anim("attack")
		if player.has_method("knockback"):
			var away_dir := 1 if player.global_position.x >= global_position.x else -1
			player.knockback(away_dir, knockback_strength, knockback_arc)


func _play_anim(anim_name: String) -> void:
	if sprite == null or sprite.sprite_frames == null:
		return
	if sprite.sprite_frames.has_animation(anim_name) and sprite.animation != anim_name:
		sprite.play(anim_name)


# Called by attack.gd on hit. Returns true if enemy died.
func take_damage(amount: int) -> bool:
	hp -= amount
	if hp <= 0:
		_play_death_sound()
		queue_free()
		return true
	# Flash white on hit
	if sprite != null:
		sprite.modulate = Color(1.0, 0.5, 0.5)
		get_tree().create_timer(0.1).timeout.connect(_reset_modulate)
	return false


func _play_death_sound() -> void:
	if death_sound == null:
		return
	var sound := AudioStreamPlayer.new()
	sound.stream = death_sound
	get_tree().current_scene.add_child(sound)
	sound.play()
	sound.finished.connect(sound.queue_free)


func _reset_modulate() -> void:
	if sprite != null:
		sprite.modulate = Color.WHITE


func knockback(dir: int, strength: float = 400.0, arc: float = -200.0) -> void:
	knockback_velocity = Vector2(strength * dir, arc)


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
				var killed := take_damage(dmg)
				if killed:
					return
		break
