extends Node2D

const GAME_SCENE := "res://scenes/main.tscn"

enum MenuState { MAIN, HOW_TO_PLAY, SETTINGS }
var _state: MenuState = MenuState.MAIN

const HTP_CARDS: Array = [
	{ "icon": "👆", "title": "Tap to Hop",     "body": "Tap to flap. Hold longer\nfor a bigger jump." },
	{ "icon": "💀", "title": "Dodge Monsters", "body": "Monsters hurt. You have\n3 hearts — don't waste them." },
	{ "icon": "🍒", "title": "Collect Fruit",  "body": "Grab fruit for points.\nSome fruit heals you too." },
	{ "icon": "🌟", "title": "Level Up",       "body": "Earn points AND fly far\nto unlock the next level." },
]
var _htp_card_idx: int = 0

# ── Scene node refs ───────────────────────────────────────────────────────────
@onready var _parallax: Node2D        = $parallaxBackground
@onready var _bat:      Node          = $batMain
@onready var _title:    RichTextLabel = $UI/title
@onready var _points:   RichTextLabel = $UI/points
@onready var _btn_new:  Button        = $UI/newGame
@onready var _btn_cont: Button        = $UI/continue
@onready var _btn_htp:  Button        = $UI/howTo
@onready var _btn_set:  Button        = $UI/settings

# Overlays built in code
var _htp_layer:      CanvasLayer
var _htp_icon:       Label
var _htp_title:      Label
var _htp_body:       Label
var _htp_progress:   Label
var _settings_layer: CanvasLayer
var _audio_btn:      Button


func _ready() -> void:
	# Bat is visual-only — disable all logic
	_bat.set_physics_process(false)
	_bat.set_process(false)
	_bat.set("frozen", true)
	var anim := _bat.get_node_or_null("AnimatedSprite2D") as AnimatedSprite2D
	if anim:
		anim.play("fly")
		_apply_outline_shader(anim)

	_title.bbcode_enabled = true
	_title.text = "[center][color=#ffe44d][font_size=80]BATZY BOY[/font_size][/color][/center]"
	_title.add_theme_color_override("font_outline_color", Color(0, 0, 0))
	_title.add_theme_constant_override("outline_size", 6)

	_points.text = "[center]Best: %d pts[/center]" % SaveManager.high_score

	if not SaveManager.has_save():
		_btn_cont.modulate = Color(0.45, 0.45, 0.45)

	_btn_new.pressed.connect(_on_new_game)
	_btn_cont.pressed.connect(_on_continue)
	_btn_htp.pressed.connect(_show_htp)
	_btn_set.pressed.connect(_show_settings)

	_build_htp_overlay()
	_build_settings_overlay()


func _process(delta: float) -> void:
	_parallax.scroll_at(150.0, delta)


# ── Input ─────────────────────────────────────────────────────────────────────
func _input(event: InputEvent) -> void:
	if not (event is InputEventMouseButton and event.pressed):
		return
	if _state == MenuState.HOW_TO_PLAY:
		_htp_next()


# ── Button handlers ───────────────────────────────────────────────────────────
func _on_new_game() -> void:
	SaveManager.clear()
	SaveManager.resume_requested = false
	get_tree().change_scene_to_file(GAME_SCENE)


func _on_continue() -> void:
	if SaveManager.has_save():
		SaveManager.resume_requested = true
		get_tree().change_scene_to_file(GAME_SCENE)


# ─── How To Play overlay ─────────────────────────────────────────────────────
func _build_htp_overlay() -> void:
	_htp_layer = CanvasLayer.new()
	_htp_layer.name  = "HowToPlay"
	_htp_layer.layer = 20
	add_child(_htp_layer)
	_htp_layer.hide()

	var panel := Control.new()
	panel.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	_htp_layer.add_child(panel)

	var bg := ColorRect.new()
	bg.color         = Color(0.0, 0.0, 0.0, 0.82)
	bg.anchor_right  = 1.0
	bg.anchor_bottom = 1.0
	bg.offset_right  = 0.0
	bg.offset_bottom = 0.0
	panel.add_child(bg)

	# Bat sprite animated — visual only
	var bat_scene := load("res://scenes/batMain.tscn") as PackedScene
	if bat_scene:
		var bat_inst := bat_scene.instantiate()
		bat_inst.set_physics_process(false)
		bat_inst.set_process(false)
		bat_inst.set("frozen", true)
		bat_inst.position = Vector2(360.0, 300.0)
		bat_inst.scale    = Vector2(2.0, 2.0)
		var htp_anim := bat_inst.get_node_or_null("AnimatedSprite2D") as AnimatedSprite2D
		if htp_anim:
			htp_anim.play("fly")
			_apply_outline_shader(htp_anim)
		panel.add_child(bat_inst)

	_htp_icon  = _make_label_centered(panel, -20.0,  64, "👆")
	_htp_title = _make_label_centered(panel,  60.0,  36, "Tap to Hop")
	_htp_title.add_theme_color_override("font_color", Color(1.0, 0.9, 0.2))
	_htp_body  = _make_label_centered(panel, 110.0,  24, "")
	_htp_body.add_theme_constant_override("line_spacing", 6)

	_htp_progress = _make_label_centered(panel, 240.0, 18, "1 / 4")
	_htp_progress.add_theme_color_override("font_color", Color(0.6, 0.6, 0.6))

	var hint := _make_label_centered(panel, 290.0, 18, "tap anywhere to continue")
	hint.add_theme_color_override("font_color", Color(0.5, 0.5, 0.5))


func _show_htp() -> void:
	_state = MenuState.HOW_TO_PLAY
	_htp_card_idx = 0
	_update_htp_card()
	_htp_layer.show()


func _htp_next() -> void:
	_htp_card_idx += 1
	if _htp_card_idx >= HTP_CARDS.size():
		_htp_layer.hide()
		_state = MenuState.MAIN
		return
	_update_htp_card()


func _update_htp_card() -> void:
	var card: Dictionary = HTP_CARDS[_htp_card_idx]
	_htp_icon.text     = card.icon
	_htp_title.text    = card.title
	_htp_body.text     = card.body
	_htp_progress.text = "%d / %d" % [_htp_card_idx + 1, HTP_CARDS.size()]


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
	back_btn.text           = "←"
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
	back_btn.add_theme_font_size_override("font_size", 22)
	back_btn.add_theme_color_override("font_color", Color.WHITE)
	back_btn.pressed.connect(func():
		_settings_layer.hide()
		_state = MenuState.MAIN
	)
	panel.add_child(back_btn)

	var title := _make_label_centered(panel, -280.0, 42, "Settings")
	title.add_theme_color_override("font_color", Color(1.0, 0.9, 0.2))

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
	return "🔊  Audio: ON" if not SaveManager.audio_muted else "🔇  Audio: OFF"


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
	lbl.add_theme_color_override("font_color",         Color.WHITE)
	lbl.add_theme_color_override("font_outline_color", Color.BLACK)
	lbl.add_theme_constant_override("outline_size",    3)
	parent.add_child(lbl)
	return lbl
