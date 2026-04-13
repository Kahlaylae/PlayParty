extends CharacterBody2D

@export var speed: float = 400.0
@export var lifetime: float = 2.5
@export var damage: int = 1
@export var explosion_scene: PackedScene = preload("res://scenes/effects/explosion1.tscn")
@export var explosion_scale: float = 2.0
@export var has_knockback: bool = true
@export var knockback_strength: float = 200.0
@export var knockback_arc: float = -100.0

@onready var sprite: AnimatedSprite2D = $AnimatedSprite2D
@onready var col: CollisionShape2D = $CollisionShape2D

var direction: int = 1
var time_left: float = 0.0


func _ready() -> void:
	time_left = lifetime
	z_index = 1
	collision_layer = 0
	collision_mask = 0
	set_collision_mask_value(1, true)
	set_collision_mask_value(3, true)


func setup_projectile(dir: int) -> void:
	direction = 1 if dir >= 0 else -1
	velocity = Vector2(speed * direction, 0)
	rotation = velocity.angle()
	if col:
		col.set_deferred("disabled", false)
	if sprite and sprite.sprite_frames:
		if sprite.sprite_frames.has_animation("default"):
			sprite.play("default")


func _physics_process(delta: float) -> void:
	time_left -= delta
	if time_left <= 0.0:
		queue_free()
		return

	# Raycast from current to next position to prevent tunneling
	var next_pos := global_position + velocity * delta
	var space := get_world_2d().direct_space_state
	var ray := PhysicsRayQueryParameters2D.create(global_position, next_pos, collision_mask)
	ray.exclude = [get_rid()]
	var result := space.intersect_ray(ray)
	if result:
		global_position = result.position
		_on_hit(result.collider)
		return

	var hit := move_and_collide(velocity * delta)
	if hit:
		_on_hit(hit.get_collider())


func _on_hit(target: Object) -> void:
	if target == null:
		queue_free()
		return

	if explosion_scene != null:
		var poof = explosion_scene.instantiate()
		get_tree().current_scene.add_child(poof)
		poof.global_position = global_position
		poof.scale = Vector2(explosion_scale, explosion_scale)

	var is_enemy := false

	if target is Node and target.has_method("take_damage"):
		is_enemy = true
		var killed: bool = target.take_damage(damage)
		if not killed and has_knockback and target.has_method("knockback"):
			var away_dir := 1 if target.global_position.x >= global_position.x else -1
			target.knockback(away_dir, knockback_strength, knockback_arc)

	var cameras := get_tree().get_nodes_in_group("camera")
	if cameras.size() > 0:
		var cam = cameras[0]
		if is_enemy:
			cam.shake(6.0, 0.3)
		else:
			cam.shake(2.0, 0.15)

	queue_free()
