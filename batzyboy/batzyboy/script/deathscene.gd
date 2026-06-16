extends CanvasLayer

@onready var _points_label: RichTextLabel = $points
@onready var _btn_hiscore: Button = $addhighscore
@onready var _btn_restart: Button = $"new game"
@onready var _btn_menu: Button = $menu
@onready var _name_input: LineEdit = $LineEdit


func _ready() -> void:
	hide()
	_btn_hiscore.pressed.connect(_on_hiscore_pressed)
	_btn_restart.pressed.connect(func():
		SaveManager.clear()
		SaveManager.resume_requested = false
		get_tree().change_scene_to_file("res://scenes/main.tscn")
	)
	_btn_menu.pressed.connect(func():
		get_tree().change_scene_to_file("res://scenes/menu.tscn")
	)


func show_death(score: int, high_score: int, is_new_best: bool) -> void:
	_points_label.bbcode_enabled = true
	if is_new_best:
		_points_label.text = "[center]%d pts\n[color=yellow]NEW BEST![/color][/center]" % score
	else:
		_points_label.text = "[center]%d pts  ·  Best: %d pts[/center]" % [score, high_score]
	# Reset hiscore button state
	_btn_hiscore.text = "Add Highscore"
	_btn_hiscore.disabled = false
	_name_input.hide()
	_name_input.text = ""
	_name_input.editable = true
	show()


func _on_hiscore_pressed() -> void:
	if not _name_input.visible:
		_name_input.show()
		_name_input.grab_focus()
		return
	var n := _name_input.text.strip_edges()
	if n.length() > 0:
		SaveManager.submit_online_score(n)
		_btn_hiscore.text = "Submitted!"
		_btn_hiscore.disabled = true
		_name_input.editable = false
