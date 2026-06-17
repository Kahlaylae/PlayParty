extends CanvasLayer

const GAME_SCENE := "res://scenes/main.tscn"

enum MenuState { MAIN, SETTINGS }
var _state: MenuState = MenuState.MAIN

# ── Scene node refs ───────────────────────────────────────────────────────────
@onready var _title:    RichTextLabel = $title
@onready var _points:   RichTextLabel = $points
@onready var _btn_new:  Button        = $newgamepatch/"New Game"
@onready var _btn_cont: Button        = $continuepatch/Continue
@onready var _btn_set:  Button        = $settingspatch/Settings
@onready var _btn_coll: Button        = $collectionspatch/Collections

# Overlays built in code
var _settings_layer: CanvasLayer
var _audio_btn:      Button


func _ready() -> void:
	_title.bbcode_enabled = true
	_title.text = "[center]BATZY BOY[/center]"

	_points.text = "[center]Best: %d pts[/center]" % SaveManager.high_score

	# Continue button — only available if save exists AND player has >1 heart to sacrifice
	if SaveManager.has_save() and SaveManager.player_hp > 1:
		_btn_cont.text    = "Continue (-1)"
		_btn_cont.disabled = false
		_btn_cont.modulate = Color(1, 1, 1)
	elif SaveManager.has_save() and SaveManager.player_hp <= 1:
		_btn_cont.text    = "Continue  (no hearts)"
		_btn_cont.disabled = true
		_btn_cont.modulate = Color(0.45, 0.45, 0.45)
	else:
		_btn_cont.text    = "Continue"
		_btn_cont.disabled = true
		_btn_cont.modulate = Color(0.45, 0.45, 0.45)

	_btn_new.pressed.connect(_on_new_game)
	_btn_cont.pressed.connect(_on_continue)
	_btn_set.pressed.connect(_show_settings)
	_btn_coll.pressed.connect(_on_collections)

	_build_settings_overlay()


# ── Input ─────────────────────────────────────────────────────────────────────
func _unhandled_input(_event: InputEvent) -> void:
	pass


# ── Button handlers ───────────────────────────────────────────────────────────
func _on_new_game() -> void:
	SaveManager.clear()
	SaveManager.resume_requested = false
	get_tree().change_scene_to_file(GAME_SCENE)


func _on_collections() -> void:
	get_tree().change_scene_to_file("res://scenes/collections.tscn")


func _on_highscores() -> void:
	get_tree().change_scene_to_file("res://scenes/highscores.tscn")


func _on_continue() -> void:
	if SaveManager.has_save() and SaveManager.player_hp > 1:
		SaveManager.player_hp -= 1
		SaveManager.save()
		SaveManager.resume_requested = true
		SaveManager.restore_hp = false   # HP already deducted; don't restore
		get_tree().change_scene_to_file(GAME_SCENE)


# ─── Settings overlay ────────────────────────────────────────────────────────
func _build_settings_overlay() -> void:
	_settings_layer = CanvasLayer.new()
	_settings_layer.name  = "Settings"
	_settings_layer.layer = 21
	add_child(_settings_layer)
	_settings_layer.hide()

	var panel := Control.new()
	panel.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	_settings_layer.add_child(panel)

	var bg := ColorRect.new()
	bg.color         = Color(0.0, 0.0, 0.0, 0.82)
	bg.anchor_right  = 1.0
	bg.anchor_bottom = 1.0
	bg.offset_right  = 0.0
	bg.offset_bottom = 0.0
	panel.add_child(bg)

	# Circle back button — top-right, just above the Settings title
	# anchor top=0 means offset_top is absolute from screen top; title resolves to y≈360
	var back_btn := Button.new()
	back_btn.text           = "X"
	back_btn.anchor_left    = 1.0
	back_btn.anchor_right   = 1.0
	back_btn.anchor_top     = 0.0
	back_btn.anchor_bottom  = 0.0
	back_btn.offset_left    = -112.0
	back_btn.offset_right   = -52.0
	back_btn.offset_top     = 296.0
	back_btn.offset_bottom  = 356.0
	var back_normal := StyleBoxFlat.new()
	back_normal.bg_color                   = Color(0.18, 0.18, 0.18, 0.9)
	back_normal.corner_radius_top_left     = 30
	back_normal.corner_radius_top_right    = 30
	back_normal.corner_radius_bottom_left  = 30
	back_normal.corner_radius_bottom_right = 30
	back_btn.add_theme_stylebox_override("normal", back_normal)
	var back_hover := back_normal.duplicate() as StyleBoxFlat
	back_hover.bg_color = Color(0.35, 0.35, 0.35, 0.95)
	back_btn.add_theme_stylebox_override("hover",   back_hover)
	back_btn.add_theme_stylebox_override("pressed", back_hover)
	back_btn.pressed.connect(func():
		_settings_layer.hide()
		_state = MenuState.MAIN
	)
	panel.add_child(back_btn)

	_make_label_centered(panel, -280.0, 42, "Settings")

	# Audio toggle — offsets relative to vertical center (anchor 0.5 = y 640)
	var audio_btn := Button.new()
	audio_btn.text          = _audio_label()
	audio_btn.anchor_left   = 0.5
	audio_btn.anchor_right  = 0.5
	audio_btn.anchor_top    = 0.5
	audio_btn.anchor_bottom = 0.5
	audio_btn.offset_left   = -200.0
	audio_btn.offset_right  = 200.0
	audio_btn.offset_top    = -80.0
	audio_btn.offset_bottom = -32.0
	audio_btn.pressed.connect(_toggle_audio)
	panel.add_child(audio_btn)
	_audio_btn = audio_btn


func _show_settings() -> void:
	_state = MenuState.SETTINGS
	_settings_layer.show()


func _toggle_audio() -> void:
	SaveManager.audio_muted = not SaveManager.audio_muted
	AudioServer.set_bus_mute(0, SaveManager.audio_muted)
	SaveManager.save()
	_audio_btn.text = _audio_label()


func _audio_label() -> String:
	return "Audio: ON" if not SaveManager.audio_muted else "Audio: OFF"


# ── Outline shader ───────────────────────────────────────────────────────────
func _apply_outline_shader(anim: AnimatedSprite2D) -> void:
	var sh := Shader.new()
	sh.code = """
shader_type canvas_item;
uniform float size : hint_range(0.0, 8.0) = 1.0;
void fragment() {
    vec4 col = texture(TEXTURE, UV);
    vec2 p = TEXTURE_PIXEL_SIZE * size;
    float n = 0.0;
    n += texture(TEXTURE, UV + vec2( p.x, 0.0)).a;
    n += texture(TEXTURE, UV + vec2(-p.x, 0.0)).a;
    n += texture(TEXTURE, UV + vec2(0.0,  p.y)).a;
    n += texture(TEXTURE, UV + vec2(0.0, -p.y)).a;
    float outline = min(n, 1.0) * (1.0 - col.a);
    COLOR = mix(col, vec4(1.0, 1.0, 1.0, 1.0), outline);
}
"""
	var mat := ShaderMaterial.new()
	mat.shader = sh
	anim.material = mat


# ─── Label helpers (shared with main.gd pattern) ──────────────────────────────
func _make_label_centered(parent: Node, y_offset: float, font_size: int, text: String) -> Label:
	var lbl := Label.new()
	lbl.text          = text
	lbl.anchor_left   = 0.5
	lbl.anchor_right  = 0.5
	lbl.anchor_top    = 0.5
	lbl.anchor_bottom = 0.5
	lbl.offset_left   = -300.0
	lbl.offset_right  = 300.0
	lbl.offset_top    = y_offset
	lbl.offset_bottom = y_offset + font_size + 8.0
	lbl.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	lbl.add_theme_font_size_override("font_size",      font_size)
	parent.add_child(lbl)
	return lbl
