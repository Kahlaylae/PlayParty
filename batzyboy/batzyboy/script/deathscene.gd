extends CanvasLayer

@onready var _points_label: RichTextLabel = $points
@onready var _btn_hiscore: Button = $addhighscore
@onready var _btn_restart: Button = $"new game"
@onready var _btn_menu: Button = $menu
@onready var _name_input: LineEdit = $LineEdit


func _ready() -> void:
	hide()
	_btn_hiscore.pressed.connect(_on_hiscore_pressed)
	_name_input.text_submitted.connect(_on_name_submitted)
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
		if OS.has_feature("web"):
			# prompt() is native browser chrome — keyboard guaranteed on every mobile browser.
			var raw: String = JavaScriptBridge.eval("prompt('Enter your name:','')") as String
			if raw and raw.strip_edges().length() > 0:
				_name_input.text = raw.strip_edges()
				_submit_score()
			return
		_name_input.grab_focus()
		if OS.get_name() in ["Android", "iOS"]:
			DisplayServer.virtual_keyboard_show(_name_input.text)
		return
	_submit_score()


func _on_name_submitted(_text: String) -> void:
	_submit_score()


func _submit_score() -> void:
	var n := _name_input.text.strip_edges()
	_name_input.release_focus()
	if OS.get_name() in ["Android", "iOS"]:
		DisplayServer.virtual_keyboard_hide()

	if n.length() > 0:
		SaveManager.submit_online_score(n)
		_btn_hiscore.text = "Submitted!"
		_btn_hiscore.disabled = true
		_name_input.editable = false
