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
		_name_input.grab_focus()
		_show_mobile_keyboard()
		return
	_submit_score()


func _on_name_submitted(_text: String) -> void:
	_submit_score()


func _submit_score() -> void:
	var n: String
	if OS.has_feature("web"):
		# Read from the real HTML input, then hide it
		var raw: String = JavaScriptBridge.eval("window._bkb ? window._bkb.value : ''") as String
		n = raw.strip_edges()
		JavaScriptBridge.eval("if(window._bkb){window._bkb.style.display='none';window._bkb.blur();}")
	else:
		n = _name_input.text.strip_edges()
		_name_input.release_focus()
		if OS.get_name() in ["Android", "iOS"]:
			DisplayServer.virtual_keyboard_hide()

	if n.length() > 0:
		SaveManager.submit_online_score(n)
		_btn_hiscore.text = "Submitted!"
		_btn_hiscore.disabled = true
		_name_input.editable = false


func _show_mobile_keyboard() -> void:
	if OS.has_feature("web"):
		# Godot 4 web can't trigger a native keyboard from the canvas.
		# Create a real HTML <input> element so mobile browsers show their keyboard.
		JavaScriptBridge.eval("""
			if (!window._bkb) {
				var i = document.createElement('input');
				i.type = 'text';
				i.id = '_batzyboy_kb';
				i.setAttribute('autocomplete','off');
				i.setAttribute('autocorrect','off');
				i.setAttribute('autocapitalize','off');
				i.setAttribute('spellcheck','false');
				i.style.cssText = 'position:fixed;left:50%;top:35%;transform:translate(-50%,-50%);z-index:99999;font-size:22px;padding:14px 20px;border:2px solid gold;background:#111;color:#fff;text-align:center;width:240px;border-radius:8px;font-family:sans-serif;';
				document.body.appendChild(i);
				window._bkb = i;
			}
			window._bkb.value = '';
			window._bkb.style.display = 'block';
			window._bkb.focus();
		""")
	elif OS.get_name() in ["Android", "iOS"]:
		DisplayServer.virtual_keyboard_show(_name_input.text)
