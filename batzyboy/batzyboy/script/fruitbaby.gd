extends CharacterBody2D
## Decorative fruit baby — collections screen only.
## Picks a random idle animation on ready (some have "run" + "still", some just "still").


func _ready() -> void:
	set_physics_process(false)
	var anim := get_node_or_null("animation") as AnimatedSprite2D
	if anim == null:
		return
	var names := anim.sprite_frames.get_animation_names()
	if names.size() > 1:
		anim.play(names[randi() % names.size()])
	elif names.size() == 1:
		anim.play(names[0])
