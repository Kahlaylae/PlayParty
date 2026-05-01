extends Marker2D

@export var enemy_scene: PackedScene
@export var post_clear_delay: float = 5.0
@export var level: int = 1

var _tracked: Array[Node] = []
var _delay_timer: float = 0.0
var _waiting: bool = false
var _anim: AnimatedSprite2D = null


func _ready() -> void:
	_anim = get_node_or_null("spawneranimation")
	if _anim != null:
		_anim.visible = false
		_anim.play("spawneranimation")


func _physics_process(delta: float) -> void:
	if enemy_scene == null:
		return

	# Remove dead/freed enemies from tracking
	_tracked = _tracked.filter(func(e): return is_instance_valid(e))

	# Wave still alive — do nothing
	if _tracked.size() > 0:
		_waiting = false
		return

	# Wave just cleared — start post-clear delay
	if not _waiting:
		_waiting = true
		_delay_timer = post_clear_delay

	_delay_timer -= delta
	# Show the portal at the halfway point of the cooldown
	if _anim != null:
		_anim.visible = _delay_timer <= post_clear_delay * 0.5
	if _delay_timer > 0.0:
		return

	# Spawn next wave
	_waiting = false
	if _anim != null:
		_anim.visible = false
	var instance = enemy_scene.instantiate()
	get_tree().current_scene.add_child(instance)
	instance.global_position = global_position
	_apply_level_recursive(instance, level)

	# Track all enemies in the spawned instance
	if instance is CharacterBody2D or instance is Node2D:
		if instance.is_in_group("enemies"):
			_tracked.append(instance)
		else:
			for child in instance.get_children():
				if is_instance_valid(child) and child.is_in_group("enemies"):
					_tracked.append(child)


func _apply_level_recursive(node: Node, l: int) -> void:
	if node.has_method("set_level"):
		node.set_level(l)
	for child in node.get_children():
		_apply_level_recursive(child, l)
