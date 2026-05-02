extends Node2D

# ── Scene preloads ──────────────────────────────────────────────────────────
const SPAWNER_SCENE  := preload("res://scenes/spawner.tscn")

const SCN_SKELETON   := preload("res://scenes/enemies/skeleton.tscn")
const SCN_WRAITH     := preload("res://scenes/enemies/wraith.tscn")
const SCN_GUARD      := preload("res://scenes/enemies/guard.tscn")
const SCN_GOLEM      := preload("res://scenes/enemies/golem.tscn")
const SCN_ORC        := preload("res://scenes/enemies/orcsoldier.tscn")
const SCN_ORC_BOSS   := preload("res://scenes/enemies/orcboss.tscn")
const SCN_ORC_BOSS2  := preload("res://scenes/enemies/orcboss2.tscn")
const SCN_TROLL1     := preload("res://scenes/enemies/trollboss1.tscn")
const SCN_TROLL2     := preload("res://scenes/enemies/trollboss2.tscn")
const SCN_WRAITHMOB  := preload("res://scenes/enemies/wraithmob.tscn")
const SCN_HOARD1     := preload("res://scenes/enemies/enemyhoard1.tscn")
const SCN_HOARD2     := preload("res://scenes/enemies/hoard2.tscn")
const SCN_SQUAD_WS   := preload("res://scenes/enemies/squad_wraith_skeleton.tscn")
const SCN_SQUAD_ST   := preload("res://scenes/enemies/squad_skeleton_triple.tscn")
const SCN_SQUAD_GO   := preload("res://scenes/enemies/squad_golem_orc.tscn")
const SCN_SQUAD_GW   := preload("res://scenes/enemies/squad_guard_wraith.tscn")

# ── Spawner / world config ─────────────────────────────────────────────────
const SPAWN_GAP      := 1800.0
const SPAWN_AHEAD    := 2400.0
const DESPAWN_BEHIND := 3000.0
const SPAWN_Y        := -80.0

# ── Save ────────────────────────────────────────────────────────────────────
const SAVE_PATH := "user://petmage.save"

# ── State ───────────────────────────────────────────────────────────────────
enum GameState { MENU, PLAYING, DEAD }
var _state: GameState = GameState.MENU

var kill_count: int = 0
var coin_count: int = 0
var best_kills: int = 0
var best_dist_m: int = 0

# ── Runtime refs ────────────────────────────────────────────────────────────
var _player: CharacterBody2D       = null
var _start_x: float                = 0.0
var _last_spawner_x: float         = 0.0
var _active_spawners: Array[Node]  = []
var _zones: Array[Dictionary]      = []

# HUD
var _hud: CanvasLayer    = null
var _hp_bar: ProgressBar = null
var _kill_label: Label   = null
var _zone_label: Label   = null
var _coin_label: Label   = null

# Overlays
var _menu_layer: CanvasLayer  = null
var _death_layer: CanvasLayer = null


# ── Ready ────────────────────────────────────────────────────────────────────
func _ready() -> void:
	_load_save()
	_build_zones()
	_build_menu()


# ── Save / Load ──────────────────────────────────────────────────────────────
func _load_save() -> void:
	if not FileAccess.file_exists(SAVE_PATH):
		return
	var f := FileAccess.open(SAVE_PATH, FileAccess.READ)
	if f == null:
		return
	var data: Variant = JSON.parse_string(f.get_as_text())
	if data is Dictionary:
		best_kills  = int(data.get("best_kills",  0))
		best_dist_m = int(data.get("best_dist_m", 0))


func _write_save() -> void:
	var f := FileAccess.open(SAVE_PATH, FileAccess.WRITE)
	if f == null:
		return
	f.store_string(JSON.stringify({ "best_kills": best_kills, "best_dist_m": best_dist_m }))


# ── Main Menu ────────────────────────────────────────────────────────────────
func _build_menu() -> void:
	_menu_layer = CanvasLayer.new()
	_menu_layer.name  = "Menu"
	_menu_layer.layer = 20
	add_child(_menu_layer)

	var panel := Control.new()
	panel.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	_menu_layer.add_child(panel)

	var bg := ColorRect.new()
	bg.color = Color(0.02, 0.01, 0.08, 0.92)
	bg.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	panel.add_child(bg)

	var title := _make_clabel(panel, "PET MAGE", 80, Color(1.0, 0.85, 0.2), -230.0)
	title.add_theme_color_override("font_outline_color", Color.BLACK)
	title.add_theme_constant_override("outline_size", 5)

	_make_clabel(panel, "Run right. Kill everything. Don't die.", 22, Color(0.7, 0.7, 0.85), -140.0)

	_make_clabel(
		panel,
		"Best: %d kills  ·  %d m" % [best_kills, best_dist_m],
		20, Color(0.65, 0.65, 0.65), -85.0
	)

	_make_clabel(
		panel,
		"Arrow keys / WASD  ·  Space to jump  ·  Auto-attacks",
		16, Color(0.45, 0.45, 0.5), 20.0
	)

	var play_btn := _make_cbtn(panel, "Play", 80.0)
	play_btn.pressed.connect(_start_game)


func _start_game() -> void:
	_state = GameState.PLAYING
	_menu_layer.hide()

	kill_count = 0
	coin_count = 0

	_player = find_child("Player") as CharacterBody2D
	if _player == null:
		push_error("Pet Mage: Player node not found")
		return

	if "paused" in _player:
		_player.set("paused", false)

	_player.died.connect(_on_player_died)
	_player.hp_changed.connect(_on_player_hp_changed)

	_build_hud()

	_start_x        = _player.global_position.x
	_last_spawner_x = _start_x + 1200.0

	for enemy in get_tree().get_nodes_in_group("enemies"):
		register_enemy(enemy)


# ── Physics process ────────────────────────────────────────────────────────────
func _physics_process(_delta: float) -> void:
	if _state != GameState.PLAYING:
		return
	if _player == null or not is_instance_valid(_player):
		return

	var cam_right := _camera_right()

	while _last_spawner_x < cam_right + SPAWN_AHEAD:
		_last_spawner_x += SPAWN_GAP
		_place_spawner(_last_spawner_x)

	var cam_left := cam_right - _viewport_width()
	_active_spawners = _active_spawners.filter(func(s: Node) -> bool:
		if not is_instance_valid(s):
			return false
		if s.global_position.x < cam_left - DESPAWN_BEHIND:
			s.queue_free()
			return false
		return true
	)

	_update_hud()


func _place_spawner(x: float) -> void:
	var dist_px := _player.global_position.x - _start_x
	var zone    := _zones[_zone_index(dist_px)]
	var tier    := _pick_tier(zone)
	var pool: Array = zone[tier]
	var scene: PackedScene = pool[randi() % pool.size()]

	var s := SPAWNER_SCENE.instantiate()
	s.enemy_scene      = scene
	s.level            = zone["level"]
	s.post_clear_delay = 4.0

	add_child(s)
	s.global_position = Vector2(x, SPAWN_Y)
	_active_spawners.append(s)


func register_enemy(enemy: Node) -> void:
	if enemy.has_signal("died") and not enemy.died.is_connected(_on_enemy_died):
		enemy.died.connect(_on_enemy_died)


# --- Zone helpers ------------------------------------------------------------
func _build_zones() -> void:
	_zones = [
		{
			"min_dist": 0.0, "level": 1,
			"light":  [SCN_SKELETON, SCN_WRAITH],
			"medium": [SCN_SQUAD_ST, SCN_SQUAD_WS],
			"heavy":  [SCN_WRAITHMOB],
			"weights": [60, 30, 10]
		},
		{
			"min_dist": 5000.0, "level": 1,
			"light":  [SCN_SKELETON, SCN_WRAITH, SCN_GUARD],
			"medium": [SCN_SQUAD_WS, SCN_SQUAD_GW],
			"heavy":  [SCN_HOARD1, SCN_WRAITHMOB],
			"weights": [50, 35, 15]
		},
		{
			"min_dist": 15000.0, "level": 2,
			"light":  [SCN_GUARD, SCN_ORC],
			"medium": [SCN_SQUAD_GW, SCN_SQUAD_GO],
			"heavy":  [SCN_HOARD1, SCN_HOARD2],
			"weights": [40, 40, 20]
		},
		{
			"min_dist": 30000.0, "level": 3,
			"light":  [SCN_ORC, SCN_GOLEM],
			"medium": [SCN_SQUAD_GO, SCN_SQUAD_ST],
			"heavy":  [SCN_HOARD2, SCN_HOARD1],
			"weights": [30, 45, 25]
		},
		{
			"min_dist": 50000.0, "level": 4,
			"light":  [SCN_GUARD, SCN_ORC, SCN_GOLEM],
			"medium": [SCN_SQUAD_GO, SCN_SQUAD_GW],
			"heavy":  [SCN_ORC_BOSS, SCN_ORC_BOSS2, SCN_HOARD2],
			"weights": [25, 40, 35]
		},
		{
			"min_dist": 80000.0, "level": 5,
			"light":  [SCN_ORC, SCN_GOLEM, SCN_ORC_BOSS],
			"medium": [SCN_SQUAD_GO, SCN_SQUAD_GW, SCN_HOARD1],
			"heavy":  [SCN_TROLL1, SCN_TROLL2, SCN_ORC_BOSS2],
			"weights": [20, 35, 45]
		},
	]


func _zone_index(dist_px: float) -> int:
	var best := 0
	for i in _zones.size():
		if dist_px >= _zones[i]["min_dist"]:
			best = i
	return best


func _pick_tier(zone: Dictionary) -> String:
	var w: Array = zone["weights"]
	var roll := randi() % 100
	if roll < w[0]:
		return "light"
	elif roll < w[0] + w[1]:
		return "medium"
	return "heavy"


func _camera_right() -> float:
	if _player == null:
		return 0.0
	var cam := _player.find_child("Camera2D") as Camera2D
	if cam == null:
		return _player.global_position.x
	return cam.global_position.x + _viewport_width() * 0.5


func _viewport_width() -> float:
	var cam := _player.find_child("Camera2D") as Camera2D
	if cam == null:
		return 1280.0
	return get_viewport().get_visible_rect().size.x / cam.zoom.x


func _build_hud() -> void:
	if _hud != null:
		_hud.queue_free()
	_hud = CanvasLayer.new()
	_hud.name  = "HUD"
	_hud.layer = 1
	add_child(_hud)

	var c := Control.new()
	c.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	_hud.add_child(c)

	# HP bar (top-left)
	_hp_bar = ProgressBar.new()
	_hp_bar.min_value       = 0
	_hp_bar.max_value       = _player.max_hp
	_hp_bar.value           = _player.hp
	_hp_bar.show_percentage = false
	_hp_bar.anchor_left     = 0.0
	_hp_bar.anchor_right    = 0.0
	_hp_bar.anchor_top      = 0.0
	_hp_bar.anchor_bottom   = 0.0
	_hp_bar.offset_left     = 20.0
	_hp_bar.offset_right    = 300.0
	_hp_bar.offset_top      = 18.0
	_hp_bar.offset_bottom   = 44.0
	var hud_bg := StyleBoxFlat.new()
	hud_bg.bg_color = Color(0.1, 0.1, 0.1, 0.85)
	_hp_bar.add_theme_stylebox_override("background", hud_bg)
	var hud_fill := StyleBoxFlat.new()
	hud_fill.bg_color = Color(0.2, 0.88, 0.28)
	_hp_bar.add_theme_stylebox_override("fill", hud_fill)
	c.add_child(_hp_bar)

	var hp_lbl := Label.new()
	hp_lbl.text     = "HP"
	hp_lbl.position = Vector2(20.0, 46.0)
	hp_lbl.add_theme_font_size_override("font_size", 14)
	hp_lbl.add_theme_color_override("font_color", Color(0.75, 0.75, 0.75))
	c.add_child(hp_lbl)

	# Kill counter (top-center)
	_kill_label = Label.new()
	_kill_label.text                 = "Kills: 0"
	_kill_label.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	_kill_label.anchor_left          = 0.5
	_kill_label.anchor_right         = 0.5
	_kill_label.anchor_top           = 0.0
	_kill_label.anchor_bottom        = 0.0
	_kill_label.offset_left          = -150.0
	_kill_label.offset_right         = 150.0
	_kill_label.offset_top           = 18.0
	_kill_label.add_theme_font_size_override("font_size", 22)
	_kill_label.add_theme_color_override("font_color", Color.WHITE)
	_kill_label.add_theme_color_override("font_outline_color", Color.BLACK)
	_kill_label.add_theme_constant_override("outline_size", 2)
	c.add_child(_kill_label)

	# Zone + distance (top-right)
	_zone_label = Label.new()
	_zone_label.text                 = "0 m  \u00b7  Zone 1"
	_zone_label.horizontal_alignment = HORIZONTAL_ALIGNMENT_RIGHT
	_zone_label.anchor_left          = 1.0
	_zone_label.anchor_right         = 1.0
	_zone_label.anchor_top           = 0.0
	_zone_label.anchor_bottom        = 0.0
	_zone_label.offset_left          = -280.0
	_zone_label.offset_right         = -20.0
	_zone_label.offset_top           = 18.0
	_zone_label.add_theme_font_size_override("font_size", 18)
	_zone_label.add_theme_color_override("font_color", Color(0.85, 0.85, 0.85))
	_zone_label.add_theme_color_override("font_outline_color", Color.BLACK)
	_zone_label.add_theme_constant_override("outline_size", 2)
	c.add_child(_zone_label)

	# Coin label (below zone)
	_coin_label = Label.new()
	_coin_label.text                 = "Coins: 0"
	_coin_label.horizontal_alignment = HORIZONTAL_ALIGNMENT_RIGHT
	_coin_label.anchor_left          = 1.0
	_coin_label.anchor_right         = 1.0
	_coin_label.anchor_top           = 0.0
	_coin_label.anchor_bottom        = 0.0
	_coin_label.offset_left          = -280.0
	_coin_label.offset_right         = -20.0
	_coin_label.offset_top           = 44.0
	_coin_label.add_theme_font_size_override("font_size", 16)
	_coin_label.add_theme_color_override("font_color", Color(1.0, 0.9, 0.2))
	_coin_label.add_theme_color_override("font_outline_color", Color.BLACK)
	_coin_label.add_theme_constant_override("outline_size", 2)
	c.add_child(_coin_label)

	_build_touch_controls(c)


func _update_hud() -> void:
	if _player == null or not is_instance_valid(_player):
		return
	var dist_px := _player.global_position.x - _start_x
	var dist_m  := int(dist_px / 100.0)
	var zi      := _zone_index(dist_px)
	if _zone_label != null:
		_zone_label.text = "%d m  \u00b7  Zone %d" % [dist_m, zi + 1]
	if _coin_label != null:
		_coin_label.text = "Coins: %d" % coin_count


# \u2500\u2500 Touch controls \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500
func _build_touch_controls(parent: Control) -> void:
	var y   := 590.0
	var sz  := Vector2(90.0, 90.0)
	parent.add_child(_make_touch_btn("<", Vector2(30.0,  y), sz, "Left"))
	parent.add_child(_make_touch_btn(">", Vector2(140.0, y), sz, "Right"))
	parent.add_child(_make_touch_btn("Jump", Vector2(1155.0, y), sz, "Jump"))


func _make_touch_btn(lbl: String, pos: Vector2, sz: Vector2, action: String) -> Button:
	var b := Button.new()
	b.text     = lbl
	b.position = pos
	b.size     = sz
	b.add_theme_font_size_override("font_size", 22)
	b.add_theme_color_override("font_color", Color.WHITE)
	var sn := StyleBoxFlat.new()
	sn.bg_color                   = Color(1, 1, 1, 0.12)
	sn.corner_radius_top_left     = 14
	sn.corner_radius_top_right    = 14
	sn.corner_radius_bottom_left  = 14
	sn.corner_radius_bottom_right = 14
	b.add_theme_stylebox_override("normal", sn)
	var sp := sn.duplicate() as StyleBoxFlat
	sp.bg_color = Color(1, 1, 1, 0.32)
	b.add_theme_stylebox_override("pressed", sp)
	b.add_theme_stylebox_override("hover",   sp)
	b.button_down.connect(_fire_action.bind(action, true))
	b.button_up.connect(_fire_action.bind(action, false))
	return b


func _fire_action(action: String, pressed: bool) -> void:
	var ev := InputEventAction.new()
	ev.action  = action
	ev.pressed = pressed
	Input.parse_input_event(ev)


# \u2500\u2500 Coin collection \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500
func add_coin() -> void:
	coin_count += 1


# \u2500\u2500 Signal handlers \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500
func _on_enemy_died() -> void:
	kill_count += 1
	if _kill_label != null:
		_kill_label.text = "Kills: %d" % kill_count
	if _player != null and is_instance_valid(_player) and _player.has_method("show_quip_from"):
		_player.show_quip_from("kill")


func _on_player_hp_changed(new_hp: int) -> void:
	if _hp_bar == null:
		return
	_hp_bar.value = new_hp
	var ratio := float(new_hp) / float(_hp_bar.max_value) if _hp_bar.max_value > 0 else 1.0
	var fill := StyleBoxFlat.new()
	fill.bg_color = Color(1.0 - ratio, ratio * 0.8 + 0.1, 0.1)
	_hp_bar.add_theme_stylebox_override("fill", fill)


func _on_player_died() -> void:
	if _state == GameState.DEAD:
		return
	_state = GameState.DEAD

	var dist_m := 0
	if _player != null and is_instance_valid(_player):
		dist_m = int((_player.global_position.x - _start_x) / 100.0)

	var new_best := false
	if kill_count > best_kills:
		best_kills = kill_count
		new_best   = true
	if dist_m > best_dist_m:
		best_dist_m = dist_m
		new_best    = true
	_write_save()

	await get_tree().create_timer(0.8).timeout
	_build_death_screen(dist_m, new_best)


# \u2500\u2500 Death screen \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500
func _build_death_screen(dist_m: int, new_best: bool) -> void:
	_death_layer = CanvasLayer.new()
	_death_layer.name  = "Death"
	_death_layer.layer = 25
	add_child(_death_layer)

	var panel := Control.new()
	panel.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	panel.modulate = Color(1, 1, 1, 0)
	_death_layer.add_child(panel)

	var bg := ColorRect.new()
	bg.color = Color(0.0, 0.0, 0.0, 0.78)
	bg.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	panel.add_child(bg)

	var died_lbl := _make_clabel(panel, "YOU DIED", 68, Color(0.9, 0.1, 0.1), -210.0)
	died_lbl.add_theme_color_override("font_outline_color", Color.BLACK)
	died_lbl.add_theme_constant_override("outline_size", 4)

	if new_best:
		_make_clabel(panel, "NEW BEST!", 30, Color(1.0, 0.9, 0.2), -135.0)

	_make_clabel(
		panel,
		"Kills: %d  \u00b7  Distance: %d m  \u00b7  Coins: %d" % [kill_count, dist_m, coin_count],
		22, Color.WHITE, -90.0
	)
	_make_clabel(
		panel,
		"Best: %d kills  \u00b7  %d m" % [best_kills, best_dist_m],
		18, Color(0.6, 0.6, 0.6), -58.0
	)

	var retry := _make_cbtn(panel, "Play Again", 20.0)
	retry.pressed.connect(func(): get_tree().reload_current_scene())

	# Fade in
	var tween := create_tween()
	tween.tween_property(panel, "modulate:a", 1.0, 0.4)


# \u2500\u2500 Label / Button helpers \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500
func _make_clabel(parent: Control, txt: String, font_size: int, color: Color, y_off: float) -> Label:
	var lbl := Label.new()
	lbl.text                    = txt
	lbl.horizontal_alignment    = HORIZONTAL_ALIGNMENT_CENTER
	lbl.anchor_left             = 0.5
	lbl.anchor_right            = 0.5
	lbl.anchor_top              = 0.5
	lbl.anchor_bottom           = 0.5
	lbl.offset_left             = -550.0
	lbl.offset_right            = 550.0
	lbl.offset_top              = y_off
	lbl.offset_bottom           = y_off + font_size + 10.0
	lbl.add_theme_font_size_override("font_size", font_size)
	lbl.add_theme_color_override("font_color", color)
	parent.add_child(lbl)
	return lbl


func _make_cbtn(parent: Control, txt: String, y_off: float) -> Button:
	var b := Button.new()
	b.text          = txt
	b.anchor_left   = 0.5
	b.anchor_right  = 0.5
	b.anchor_top    = 0.5
	b.anchor_bottom = 0.5
	b.offset_left   = -130.0
	b.offset_right  = 130.0
	b.offset_top    = y_off
	b.offset_bottom = y_off + 58.0
	b.add_theme_font_size_override("font_size", 26)
	parent.add_child(b)
	return b
