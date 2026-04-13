extends CharacterBody2D

@export var speed: float = 520.0
@export var lifetime: float = 3.0
@export var damage: int = 1
@export var explosion_scene: PackedScene = preload("res://scenes/effects/explosion1.tscn")
@export var explosion_scale: float = 3.0
@export var has_knockback: bool = true
@export var knockback_strength: float = 400.0
@export var knockback_arc: float = -200.0
@export var impact_sound: AudioStream

@onready var sprite: AnimatedSprite2D = $AnimatedSprite2D
@onready var col: CollisionShape2D = $CollisionShape2D

var direction: int = 1
var variant: String = "fireball"
var time_left: float = 0.0
var is_projectile: bool = true
var base_velocity: Vector2 = Vector2.ZERO


func _ready() -> void:
	time_left = lifetime
	# Attack: no layer, mask 1+3 (hits floor and enemies, not player)
	collision_layer = 0
	collision_mask = 0
	set_collision_mask_value(3, true)
	set_collision_mask_value(4, true)


# No longer flipping children in code — handled by inspector transform
func _flip_children() -> void:
	pass


# Called by player.gd — charge visual stays in place, no collision
func setup_charge(dir: int) -> void:
	is_projectile = false
	direction = 1 if dir >= 0 else -1
	velocity = Vector2.ZERO
	collision_mask = 0
	if col:
		col.set_deferred("disabled", true)
	if sprite and sprite.sprite_frames and sprite.sprite_frames.has_animation("firecharge"):
		sprite.play("firecharge")


# Called by player.gd — real projectile that flies and collides
func setup_projectile(kind: String, dir: int, target_pos: Variant = null, target_flying: bool = false) -> void:
	is_projectile = true
	direction = 1 if dir >= 0 else -1
	variant = kind
	var spd: float = speed
	# Aim at target
	if target_pos is Vector2:
		var t: Vector2 = target_pos
		var diff: Vector2 = t - global_position
		direction = 1 if diff.x >= 0.0 else -1
		if target_flying:
			# Flying enemies: always aim directly at them
			var aim_dir: Vector2 = diff.normalized()
			base_velocity = aim_dir * spd
		else:
			# Ground enemies: aim horizontally to avoid hitting the floor
			base_velocity = Vector2(spd * direction, 0)
	else:
		base_velocity = Vector2(spd * direction, 0)
	velocity = base_velocity
	if col:
		col.set_deferred("disabled", false)
	# Rotate the whole node to aim along velocity
	rotation = base_velocity.angle()
	if sprite and sprite.sprite_frames:
		if sprite.sprite_frames.has_animation(kind):
			sprite.play(kind)


func _physics_process(delta: float) -> void:
	if not is_projectile:
		return

	time_left -= delta
	if time_left <= 0.0:
		queue_free()
		return

	var hit := move_and_collide(velocity * delta)
	if hit:
		_on_hit(hit.get_collider())


func _on_hit(target: Object) -> void:
	if target == null:
		queue_free()
		return

	# Spawn explosion at the projectile's position
	if explosion_scene != null:
		var poof = explosion_scene.instantiate()
		get_tree().current_scene.add_child(poof)
		poof.global_position = global_position
		poof.scale = Vector2(explosion_scale, explosion_scale)

	# Play impact sound at scene root so it survives queue_free
	if impact_sound != null:
		var snd := AudioStreamPlayer.new()
		snd.stream = impact_sound
		get_tree().current_scene.add_child(snd)
		snd.play()
		snd.finished.connect(snd.queue_free)

	var is_enemy := false

	# If target is an enemy (has take_damage from enemy.gd), deal damage
	if target is Node and target.has_method("take_damage"):
		is_enemy = true
		var killed: bool = target.take_damage(damage)
		# Knockback surviving enemies
		if not killed and has_knockback and target.has_method("knockback"):
			var away_dir := 1 if target.global_position.x >= global_position.x else -1
			target.knockback(away_dir, knockback_strength, knockback_arc)

	# Camera shake — stronger for enemy hits, subtle for walls/terrain
	var cameras := get_tree().get_nodes_in_group("camera")
	if cameras.size() > 0:
		var cam = cameras[0]
		if is_enemy:
			cam.shake(6.0, 0.3)
		else:
			cam.shake(2.0, 0.15)

	# queue_free() the projectile
	queue_free()
