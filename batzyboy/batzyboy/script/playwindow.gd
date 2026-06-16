extends Node2D
## Circular window into the game — shows bat flying with scrolling parallax.
## Drop into any scene (menu, collections, etc.) for a live preview effect.

@export var scroll_speed: float = 100.0

var _parallax: Node2D
var _bat: CharacterBody2D


func _ready() -> void:
	var vp := get_node_or_null("CircleWindow/GameViewport") as SubViewport
	if vp:
		_parallax = vp.get_node_or_null("parallaxBackground/parallaxBackground") as Node2D
		_bat = vp.get_node_or_null("batMain") as CharacterBody2D

	# Freeze bat — visual only, no gameplay.
	if _bat:
		_bat.set_physics_process(false)
		_bat.set_process(false)
		_bat.set("frozen", true)
		var anim := _bat.get_node_or_null("AnimatedSprite2D") as AnimatedSprite2D
		if anim:
			anim.play("fly")


func _process(_delta: float) -> void:
	if _parallax:
		_parallax.base_speed = scroll_speed
