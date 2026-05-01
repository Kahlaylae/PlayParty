extends Node2D

# --- Preloads ---------------------------------------------------------------
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

# --- Spawner config ---------------------------------------------------------
const SPAWN_GAP      := 1800.0
const SPAWN_AHEAD    := 2400.0
const DESPAWN_BEHIND := 3000.0
const SPAWN_Y        := -80.0

# --- State ------------------------------------------------------------------
var kill_count: int = 0

var _player: Node        = null
var _kill_label: Label   = null
var _zone_label: Label   = null
var _hp_bar: ProgressBar = null
var _game_over_canvas: CanvasLayer = null

var _start_x: float = 0.0
var _last_spawner_x: float = 0.0
var _active_spawners: Array[Node] = []

var _zones: Array[Dictionary] = []


func _ready() -> void:
	_build_zones()
	_player = find_child("Player")
	_build_hud()
	_build_game_over()

	if _player != null:
		_player.died.connect(_on_player_died)
		_player.hp_changed.connect(_on_player_hp_changed)
		if _hp_bar != null:
			_hp_bar.max_value = _player.max_hp
			_hp_bar.value = _player.max_hp
		_start_x = _player.global_position.x
		_last_spawner_x = _start_x + 1200.0

	for enemy in get_tree().get_nodes_in_group("enemies"):
		register_enemy(enemy)


func _physics_process(_delta: float) -> void:
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

	if _zone_label != null:
		var dist_px: float = _player.global_position.x - _start_x
		var dist_m  := int(dist_px / 100.0)
		var zi      := _zone_index(dist_px)
		_zone_label.text = "%dm  Zone %d" % [dist_m, zi + 1]


func _place_spawner(x: float) -> void:
	var dist_px: float = _player.global_position.x - _start_x
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
	var hud := CanvasLayer.new()
	hud.layer = 1
	hud.name = "HUD"
	add_child(hud)

	# Kill counter label
	_kill_label = Label.new()
	_kill_label.position = Vector2(16.0, 16.0)
	_kill_label.text = "Kills: 0"
	_kill_label.add_theme_font_size_override("font_size", 20)
	_kill_label.add_theme_color_override("font_color", Color.WHITE)
	_kill_label.add_theme_color_override("font_shadow_color", Color(0, 0, 0, 0.85))
	_kill_label.add_theme_constant_override("shadow_offset_x", 2)
	_kill_label.add_theme_constant_override("shadow_offset_y", 2)
	hud.add_child(_kill_label)

	# HP label
	var hp_label := Label.new()
	hp_label.position = Vector2(16.0, 52.0)
	hp_label.text = "HP"
	hp_label.add_theme_font_size_override("font_size", 16)
	hp_label.add_theme_color_override("font_color", Color.WHITE)
	hp_label.add_theme_color_override("font_shadow_color", Color(0, 0, 0, 0.85))
	hp_label.add_theme_constant_override("shadow_offset_x", 2)
	hp_label.add_theme_constant_override("shadow_offset_y", 2)
	hud.add_child(hp_label)

	# HP bar
	_hp_bar = ProgressBar.new()
	_hp_bar.position = Vector2(46.0, 54.0)
	_hp_bar.size = Vector2(200.0, 18.0)
	_hp_bar.show_percentage = false
	var bg := StyleBoxFlat.new()
	bg.bg_color = Color(0.1, 0.1, 0.1, 0.85)
	_hp_bar.add_theme_stylebox_override("background", bg)
	var fill := StyleBoxFlat.new()
	fill.bg_color = Color(0.2, 0.9, 0.2, 1.0)
	_hp_bar.add_theme_stylebox_override("fill", fill)
	hud.add_child(_hp_bar)

	_zone_label = Label.new()
	_zone_label.text = "0m  Zone 1"
	_zone_label.add_theme_font_size_override("font_size", 18)
	_zone_label.add_theme_color_override("font_color", Color.WHITE)
	_zone_label.add_theme_color_override("font_shadow_color", Color(0, 0, 0, 0.85))
	_zone_label.add_theme_constant_override("shadow_offset_x", 2)
	_zone_label.add_theme_constant_override("shadow_offset_y", 2)
	_zone_label.anchor_left   = 1.0
	_zone_label.anchor_right  = 1.0
	_zone_label.anchor_top    = 0.0
	_zone_label.anchor_bottom = 0.0
	_zone_label.offset_right  = -16.0
	_zone_label.offset_top    = 16.0
	_zone_label.grow_horizontal = Control.GROW_DIRECTION_BEGIN
	hud.add_child(_zone_label)


func _build_game_over() -> void:
	_game_over_canvas = CanvasLayer.new()
	_game_over_canvas.layer = 10
	_game_over_canvas.name = "GameOver"
	_game_over_canvas.visible = false
	_game_over_canvas.process_mode = Node.PROCESS_MODE_ALWAYS
	add_child(_game_over_canvas)

	# Dim overlay
	var overlay := ColorRect.new()
	overlay.color = Color(0.0, 0.0, 0.0, 0.6)
	overlay.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	_game_over_canvas.add_child(overlay)

	# Game-over label
	var label := Label.new()
	label.text = "you died lol"
	label.add_theme_font_size_override("font_size", 52)
	label.add_theme_color_override("font_color", Color.WHITE)
	label.add_theme_color_override("font_shadow_color", Color(0, 0, 0, 1.0))
	label.add_theme_constant_override("shadow_offset_x", 3)
	label.add_theme_constant_override("shadow_offset_y", 3)
	label.set_anchors_and_offsets_preset(Control.PRESET_CENTER)
	label.position.y -= 50.0
	_game_over_canvas.add_child(label)

	# Restart button
	var btn := Button.new()
	btn.text = "try again"
	btn.add_theme_font_size_override("font_size", 24)
	btn.set_anchors_and_offsets_preset(Control.PRESET_CENTER)
	btn.position.y += 30.0
	btn.size = Vector2(160.0, 48.0)
	btn.position.x -= 80.0
	btn.pressed.connect(_restart)
	_game_over_canvas.add_child(btn)


func _on_enemy_died() -> void:
	kill_count += 1
	if _kill_label != null:
		_kill_label.text = "Kills: %d" % kill_count
	if _player != null and _player.has_method("show_quip_from"):
		_player.show_quip_from("kill")


func _on_player_hp_changed(new_hp: int) -> void:
	if _hp_bar == null:
		return
	_hp_bar.value = new_hp
	var ratio := float(new_hp) / float(_hp_bar.max_value) if _hp_bar.max_value > 0 else 1.0
	var fill := StyleBoxFlat.new()
	fill.bg_color = Color(1.0 - ratio, ratio * 0.85, 0.1, 1.0)
	_hp_bar.add_theme_stylebox_override("fill", fill)


func _on_player_died() -> void:
	if _game_over_canvas != null:
		_game_over_canvas.visible = true
	get_tree().paused = true


func _restart() -> void:
	get_tree().paused = false
	get_tree().reload_current_scene()
