extends CanvasLayer

@onready var _fruitunlock: Node = $fruitunlock

func _ready() -> void:
	# fruitunlock._ready() already ran; call _refresh in case SaveManager loaded after it
	if _fruitunlock and _fruitunlock.has_method("_refresh"):
		_fruitunlock._refresh()

	# Wire back / close button if it exists in the scene
	var back_btn := get_node_or_null("BackButton") as Button
	if back_btn == null:
		back_btn = get_node_or_null("back") as Button
	if back_btn:
		back_btn.pressed.connect(_on_back_pressed)


func _on_back_pressed() -> void:
	get_tree().change_scene_to_file("res://scenes/menu.tscn")
