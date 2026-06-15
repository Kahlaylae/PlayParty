extends Button
## Returns to the main menu, fully self-contained.
## Before leaving, asks any active game session (nodes in the "game_session"
## group) to checkpoint via save_before_exit(). Works in any scene with no
## parent wiring needed.

@export var openscene: String = "res://scenes/hiscores.tscn"


func _ready() -> void:
	pressed.connect(_on_pressed)


func _on_pressed() -> void:
	get_tree().call_group("game_session", "save_before_exit")
	Engine.time_scale = 1.0
	get_tree().change_scene_to_file(openscene)
