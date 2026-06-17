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
	# Web: pre-build a full-screen HTML overlay so we can hide the canvas
	# while typing — no z-index fight, no opacity tricks.
	if OS.has_feature("web"):
		JavaScriptBridge.eval("""
			var ov = document.createElement('div');
			ov.id = '_bkb_ov';
			ov.style.cssText = 'display:none;position:fixed;inset:0;z-index:99999;background:#0a0a14;flex-direction:column;justify-content:center;align-items:center;gap:20px;font-family:sans-serif;';
			var inp = document.createElement('input');
			inp.type = 'text';
			inp.id = '_bkb_inp';
			inp.placeholder = 'Enter your name';
			inp.setAttribute('autocomplete','off');
			inp.setAttribute('autocorrect','off');
			inp.setAttribute('autocapitalize','off');
			inp.setAttribute('enterkeyhint','done');
			inp.style.cssText = 'font-size:22px;padding:14px 20px;border:2px solid gold;background:#111;color:#fff;text-align:center;width:260px;border-radius:8px;outline:none;';
			var btn = document.createElement('button');
			btn.textContent = 'Done';
			btn.style.cssText = 'font-size:20px;padding:12px 48px;border:none;background:gold;color:#111;border-radius:8px;cursor:pointer;font-weight:bold;';
			btn.onclick = function(){
				window._bkb_val = inp.value;
				ov.style.display = 'none';
				document.querySelector('canvas').style.display = 'block';
			};
			inp.addEventListener('keydown',function(e){if(e.key==='Enter')btn.click();});
			ov.appendChild(inp);
			ov.appendChild(btn);
			document.body.appendChild(ov);
		""")


func show_death(score: int, high_score: int, is_new_best: bool) -> void:
	_points_label.bbcode_enabled = true
	if is_new_best:
		_points_label.text = "[center]%d pts\n[color=yellow]NEW BEST![/color][/center]" % score
	else:
		_points_label.text = "[center]%d pts  ·  Best: %d pts[/center]" % [score, high_score]
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
			# Hide the Godot canvas, show the full-screen HTML overlay.
			JavaScriptBridge.eval("""
				document.querySelector('canvas').style.display = 'none';
				var ov = document.getElementById('_bkb_ov');
				var inp = document.getElementById('_bkb_inp');
				window._bkb_val = '';
				inp.value = '';
				ov.style.display = 'flex';
				inp.focus();
			""")
			return
		_name_input.grab_focus()
		if OS.get_name() in ["Android", "iOS"]:
			DisplayServer.virtual_keyboard_show(_name_input.text)
		return
	_submit_score()


func _on_name_submitted(_text: String) -> void:
	_submit_score()


func _submit_score() -> void:
	var n: String
	if OS.has_feature("web"):
		var raw: String = JavaScriptBridge.eval("window._bkb_val || ''") as String
		n = raw.strip_edges()
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
