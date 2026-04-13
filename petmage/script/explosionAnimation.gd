extends AnimatedSprite2D

# Plays death smoke, then queue_free() after 2s to clear from scene tree
@export var lifetime: float = 1.0

func _ready() -> void:
	var timer := get_tree().create_timer(lifetime)
	timer.timeout.connect(_on_lifetime_timeout)

func _on_lifetime_timeout() -> void:
	queue_free()
