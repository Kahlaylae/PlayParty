extends Button
## Self-contained How To Play button.
## Assign this script to any Button node — it builds and manages
## the HTP card overlay entirely on its own, no parent coupling needed.

const HTP_CARDS: Array = [
	{ "title": "Tap to Hop",     "body": "Tap to flap. Hold longer\nfor a bigger jump." },
	{ "title": "Dodge Monsters", "body": "Monsters hurt. You have\n3 hearts — don't waste them." },
	{ "title": "Collect Fruit",  "body": "Grab fruit for points.\nSome fruit heals you too." },
	{ "title": "Level Up",       "body": "Earn points AND fly far\nto unlock the next level." },
]

var _htp_layer:    CanvasLayer
var _htp_title:    Label
var _htp_body:     Label
var _htp_progress: Label
var _card_idx:     int  = 0
var _open:         bool = false


func _ready() -> void:
	pressed.connect(_show_htp)
	_build_overlay()


func _input(event: InputEvent) -> void:
	if not _open:
		return
	if event is InputEventMouseButton and (event as InputEventMouseButton).pressed:
		_htp_next()


# ─── Build ────────────────────────────────────────────────────────────────────
func _build_overlay() -> void:
	_htp_layer       = CanvasLayer.new()
	_htp_layer.name  = "HowToPlay"
	_htp_layer.layer = 20
	add_child(_htp_layer)
	_htp_layer.hide()

	var panel := Control.new()
	panel.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	_htp_layer.add_child(panel)

	var bg             := ColorRect.new()
	bg.color            = Color(0.0, 0.0, 0.0, 0.82)
	bg.anchor_right     = 1.0
	bg.anchor_bottom    = 1.0
	bg.offset_right     = 0.0
	bg.offset_bottom    = 0.0
	panel.add_child(bg)

	# Decorative bat — visual only
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

	_htp_title = _make_label(panel,  60.0, 36, "Tap to Hop")
	_htp_body  = _make_label(panel, 110.0, 24, "")
	_htp_body.add_theme_constant_override("line_spacing", 6)

	_htp_progress = _make_label(panel, 240.0, 18, "1 / 4")

	var _hint := _make_label(panel, 290.0, 18, "tap anywhere to continue")

	# Close (X) button — top-right corner
	var btn_x := Button.new()
	btn_x.text          = "X"
	btn_x.anchor_left   = 1.0
	btn_x.anchor_right  = 1.0
	btn_x.anchor_top    = 0.0
	btn_x.anchor_bottom = 0.0
	btn_x.offset_left   = -112.0
	btn_x.offset_right  = -52.0
	btn_x.offset_top    = 40.0
	btn_x.offset_bottom = 100.0
	var sty := StyleBoxFlat.new()
	sty.bg_color                   = Color(0.18, 0.18, 0.18, 0.9)
	sty.corner_radius_top_left     = 30
	sty.corner_radius_top_right    = 30
	sty.corner_radius_bottom_left  = 30
	sty.corner_radius_bottom_right = 30
	btn_x.add_theme_stylebox_override("normal", sty)
	var sty_h := sty.duplicate() as StyleBoxFlat
	sty_h.bg_color = Color(0.35, 0.35, 0.35, 0.95)
	btn_x.add_theme_stylebox_override("hover",   sty_h)
	btn_x.add_theme_stylebox_override("pressed", sty_h)
	btn_x.pressed.connect(_close_htp)
	panel.add_child(btn_x)


# ─── Show / hide ─────────────────────────────────────────────────────────────
func _show_htp() -> void:
	_card_idx = 0
	_open     = true
	_update_card()
	_htp_layer.show()
	if get_tree().has_group("game_session"):
		Engine.time_scale = 0.0


func _close_htp() -> void:
	_open = false
	_htp_layer.hide()
	Engine.time_scale = 1.0


func _htp_next() -> void:
	_card_idx += 1
	if _card_idx >= HTP_CARDS.size():
		_close_htp()
		return
	_update_card()


func _update_card() -> void:
	var card: Dictionary = HTP_CARDS[_card_idx]
	_htp_title.text    = card.title
	_htp_body.text     = card.body
	_htp_progress.text = "%d / %d" % [_card_idx + 1, HTP_CARDS.size()]


# ─── Helpers ─────────────────────────────────────────────────────────────────
func _make_label(parent: Node, y_offset: float, font_size: int, label_text: String) -> Label:
	var lbl              := Label.new()
	lbl.text              = label_text
	lbl.anchor_left       = 0.5
	lbl.anchor_right      = 0.5
	lbl.anchor_top        = 0.5
	lbl.anchor_bottom     = 0.5
	lbl.offset_left       = -300.0
	lbl.offset_right      = 300.0
	lbl.offset_top        = y_offset
	lbl.offset_bottom     = y_offset + font_size + 8.0
	lbl.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	lbl.add_theme_font_size_override("font_size",      font_size)
	parent.add_child(lbl)
	return lbl


func _apply_outline_shader(anim: AnimatedSprite2D) -> void:
	var sh   := Shader.new()
	sh.code   = """
shader_type canvas_item;
uniform float size : hint_range(0.0, 8.0) = 1.0;
void fragment() {
    vec4 col = texture(TEXTURE, UV);
    vec2 p = TEXTURE_PIXEL_SIZE * size;
    float n = 0.0;
    n += texture(TEXTURE, UV + vec2( p.x,  0.0)).a;
    n += texture(TEXTURE, UV + vec2(-p.x,  0.0)).a;
    n += texture(TEXTURE, UV + vec2( 0.0,  p.y)).a;
    n += texture(TEXTURE, UV + vec2( 0.0, -p.y)).a;
    COLOR = mix(vec4(1.0, 1.0, 1.0, clamp(n, 0.0, 1.0)), col, col.a);
}
"""
	var mat          := ShaderMaterial.new()
	mat.shader        = sh
	mat.set_shader_parameter("size", 2.0)
	anim.material     = mat
