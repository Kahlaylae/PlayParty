extends Sprite2D

@export var spin_speed: float = 0.2

func _process(delta: float) -> void:
	rotation += spin_speed * delta
