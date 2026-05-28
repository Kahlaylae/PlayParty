extends Area2D

@export var level: int   = 1
@export var points: int  = 1
@export var heal: int    = 0
@export var speed: float = 300.0

signal collected(points: int, heal: int)


func _ready() -> void:
	body_entered.connect(_on_body_entered)


func _process(delta: float) -> void:
	position.x -= speed * delta
	if global_position.x < -600.0:
		queue_free()
	# Squash-stretch bounce
	var t := sin(Time.get_ticks_msec() * 0.003 * 3.0)
	var sx := 1.0 - t * 0.06
	var sy := 1.0 + t * 0.09
	var sprite := get_node_or_null("Sprite2D") as Sprite2D
	if sprite:
		sprite.scale = Vector2(sx, sy) * 2.0


func _on_body_entered(body: Node2D) -> void:
	if body.is_in_group("bat"):
		body.play_eat()
		emit_signal("collected", points, heal)
		queue_free()
