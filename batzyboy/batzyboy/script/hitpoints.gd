extends Node2D

# 5 AnimatedSprite2D hearts — each uses 3 frames of the "default" animation:
#   frame 0 = full  (2 HP)
#   frame 1 = half  (1 HP)
#   frame 2 = empty (0 HP)
#
# Max HP = 10  (5 hearts × 2).
# Starting HP = 6  →  hearts 1-3 full, hearts 4-5 empty.

var _hearts: Array = []


func _ready() -> void:
	for i in range(1, 6):
		_hearts.append(get_node("heart%d" % i) as AnimatedSprite2D)

	# Self-wire: find the player and connect to its hp_changed signal.
	# Deferred so the full scene tree is ready before we search.
	call_deferred("_connect_to_player")

	# Show starting state (6 HP) immediately.
	set_hp(6)


func _connect_to_player() -> void:
	var player := get_tree().get_first_node_in_group("bat")
	if player and player.has_signal("hp_changed"):
		player.hp_changed.connect(set_hp)
	else:
		push_warning("Hearts: could not find player node in group 'bat'")


func set_hp(hp: int) -> void:
	for i in range(5):
		var sprite := _hearts[i] as AnimatedSprite2D
		var heart_hp: int = hp - i * 2
		if heart_hp >= 2:
			sprite.frame = 0   # full
		elif heart_hp == 1:
			sprite.frame = 1   # half
		else:
			sprite.frame = 2   # empty
