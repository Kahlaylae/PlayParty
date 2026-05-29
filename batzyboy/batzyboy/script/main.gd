extends Node2D

# ─── Speed constants ──────────────────────────────────────────────────────────
# Parallax scroll speed ramps from SPEED_MIN to SPEED_MAX over MAX_LEVEL levels.
# Splash / dead screen always runs at SPEED_UI (decoupled from gameplay speed).
const SPEED_MIN:  float = 150.0
const SPEED_MAX:  float = 400.0
const SPEED_UI:   float = 100.0   # parallax on splash/dead — never level-influenced
const MAX_LEVEL:  int   = 20      # level at which SPEED_MAX is reached

# Object (monster/fruit) speed ramps 300→350 over the same MAX_LEVEL range.
const OBJ_SPEED_MIN: float = 300.0
const OBJ_SPEED_MAX: float = 350.0

# Leveling thresholds (must satisfy BOTH to advance).
# L1→L2 requires 25 pts + 100 m; each level scales by the same factor.
const PTS_PER_LEVEL:  int   = 25
const DIST_PER_LEVEL: float = 10000.0  # 100 m × 100 px/m

# ─── Scene preloads ───────────────────────────────────────────────────────────
# Drag enemies.tscn / fruits.tscn into these slots in the Inspector on the main node.
@export var enemy_list_scene: PackedScene
@export var fruit_list_scene: PackedScene

var _monster_pool: Array = []
var _fruit_pool: Array = []

# ─── Game State ───────────────────────────────────────────────────────────────
enum State { SPLASH, PLAYING, LEVEL_UP, DEAD, PAUSED }
var state: State = State.SPLASH

var score: int         = 0
var dist_px: float     = 0.0
var current_level: int = 1
var scroll_speed: float = SPEED_MIN   # updated every frame in _update_level()

var _monster_timer: float  = 0.0
var _fruit_timer: float    = 0.0
var _retry_enabled: bool   = false

# ─── Node refs ────────────────────────────────────────────────────────────────
@onready var _bat: CharacterBody2D   = $batMain
@onready var _parallax: Node2D       = $parallaxBackground
@onready var _cam: Camera2D          = $Camera2D
@onready var _killerzone: Area2D     = $killerzone
@onready var _hearts_node: Node2D    = $hearts
@onready var _spawn_region: Container = $"Spawn Region"
@onready var _menu_btn: Sprite2D      = $Menu
@onready var _settings_btn: Sprite2D  = $Settings
@onready var _pts_rtl: RichTextLabel  = $Points
@onready var _dist_rtl: RichTextLabel = $DistanceTravelled

# Overlay nodes
var _splash_layer: CanvasLayer
var _death_layer: CanvasLayer
var _death_panel: Control
var _level_up_layer: CanvasLayer
var _level_up_panel: Control
var _pause_layer: CanvasLayer
var _pause_panel: Control
var _level_title_label: Label
var _countdown_label: Label
var _tap_hint: Label    # pulsing "tap to fly" / "tap to retry" label
var _new_best_label: Label

# ─── Ready ────────────────────────────────────────────────────────────────────
func _ready() -> void:
	# Remove editor-placed placeholder instances
	for nm in ["monster", "monster2", "monster3", "cherry", "cherry2"]:
		if has_node(nm):
			get_node(nm).queue_free()

	# Resume from save if requested by menu
	if SaveManager.resume_requested:
		current_level = maxi(SaveManager.resume_level, 1)
		dist_px       = float(current_level - 1) * DIST_PER_LEVEL
		SaveManager.resume_requested = false

	# Wire up bat signals
	_build_monster_pool()
	_build_fruit_pool()
	_bat.died.connect(_on_bat_died)
	_bat.hp_changed.connect(_on_hp_changed)
	_bat.frozen = true

	# Wire up zone collisions
	_killerzone.body_entered.connect(_on_killerzone_entered)

	_build_hud()
	_update_hud_hp(6)
	_build_gradient_bg()
	_build_splash()
	_build_death_screen()
	_build_level_up_screen()
	_build_pause_screen()


# ─── Input / Process ──────────────────────────────────────────────────────────
func _input(event: InputEvent) -> void:
	# Spacebar toggles pause — check keycode directly (is_action_just_pressed removed from InputEvent in 4.6)
	if event is InputEventKey and event.pressed and not event.echo \
			and (event.keycode == KEY_SPACE or event.physical_keycode == KEY_SPACE):
		match state:
			State.PLAYING:
				_pause_game()
			State.PAUSED:
				_resume_game()
		return

	if not (event is InputEventMouseButton and event.pressed):
		return

	# Menu / Settings buttons — clickable during splash and gameplay
	var click_pos := (event as InputEventMouseButton).position
	if state in [State.SPLASH, State.PLAYING]:
		if click_pos.distance_to(_menu_btn.position) < 36.0 \
				or click_pos.distance_to(_settings_btn.position) < 36.0:
			_pause_game()
			return

	match state:
		State.SPLASH:
			_start_game()
		State.PAUSED:
			# Top half → resume; bottom half → main menu
			if (event as InputEventMouseButton).position.y < get_viewport().size.y / 2.0:
				_resume_game()
			else:
				SaveManager.save_progress(current_level, score)
				Engine.time_scale = 1.0
				get_tree().change_scene_to_file("res://scenes/menu.tscn")
		State.DEAD:
			if _retry_enabled:
				get_tree().change_scene_to_file("res://scenes/menu.tscn")


func _process(delta: float) -> void:
	match state:
		State.SPLASH:
			_parallax.scroll_at(SPEED_UI, delta)
		State.PLAYING:
			dist_px += scroll_speed * delta
			_update_level()
			_parallax.scroll_at(scroll_speed, delta)
			_monster_timer -= delta
			if _monster_timer <= 0.0:
				_spawn_monster()
				_monster_timer = _current_interval()
			_fruit_timer -= delta
			if _fruit_timer <= 0.0:
				_spawn_fruit()
				_fruit_timer = maxf(0.8, randf_range(1.5, 3.5) / sqrt(float(current_level)))
			_update_hud()
		State.LEVEL_UP:
			# World keeps scrolling during the countdown, spawning is paused
			_parallax.scroll_at(scroll_speed, delta)
		State.PAUSED:
			pass   # Engine.time_scale = 0 freezes delta; nothing to do here
		State.DEAD:
			_parallax.scroll_at(SPEED_UI, delta)


# ─── Game flow ────────────────────────────────────────────────────────────────
func _start_game() -> void:
	state = State.PLAYING
	_bat.frozen = false
	# First tap IS the first hop — Flappy Bird feel
	_bat.velocity.y = _bat.hop_strength
	_splash_layer.hide()
	_get_hud().show()
	_monster_timer = 2.5
	_fruit_timer   = 1.5


func _on_bat_died() -> void:
	state = State.DEAD
	# Update high score + checkpoint
	if score > SaveManager.high_score:
		SaveManager.high_score = score
		_new_best_label.show()
	SaveManager.save()
	# Wait briefly then show death screen
	await get_tree().create_timer(0.6).timeout
	_death_layer.show()
	var score_lbl := _death_panel.get_node_or_null("ScoreSummary") as Label
	if score_lbl:
		score_lbl.text = "%d pts  ·  Best: %d pts" % [score, SaveManager.high_score]
	var panel_tween := create_tween()
	panel_tween.tween_property(_death_panel, "modulate:a", 1.0, 0.4).from(0.0)
	# Enable retry tap after an additional delay
	await get_tree().create_timer(1.2).timeout
	_retry_enabled = true
	_pulse_label(_tap_hint)


func _on_killerzone_entered(body: Node2D) -> void:
	if body.is_in_group("bat") and not _bat.is_dying:
		_bat._start_dying()


# ─── Spawning ─────────────────────────────────────────────────────────────────
func _spawn_x() -> float:
	# anchor_mode=0 → _cam.global_position is the top-left corner of the viewport
	return _cam.global_position.x + 720.0 + 180.0


func _spawn_y() -> float:
	var rect := _spawn_region.get_global_rect()
	return randf_range(rect.position.y, rect.end.y)


func _spawn_monster() -> void:
	var eligible: Array = _monster_pool.filter(
		func(m: Dictionary) -> bool: return m.min_level <= current_level
	)
	if eligible.is_empty():
		return
	var entry: Dictionary = eligible[randi() % eligible.size()]
	var inst := entry.scene.instantiate() as CharacterBody2D
	inst.speed          = _obj_speed()
	inst.damage         = entry.damage
	inst.wave_amplitude = entry.wave_amplitude
	inst.wave_frequency = entry.wave_frequency
	inst.global_position = Vector2(_spawn_x(), _spawn_y())
	inst.scale = entry.spawn_scale
	add_child(inst)


func _spawn_fruit() -> void:
	var eligible: Array = _fruit_pool.filter(
		func(f: Dictionary) -> bool: return f.min_level <= current_level
	)
	if eligible.is_empty():
		return
	# Cluster size grows with level: 1 at L1, 2 at L3, 3 at L5, capped at 4
	var count := mini(1 + current_level / 2, 4)
	var base_x := _spawn_x()
	var base_y := _spawn_y()
	for i in count:
		var entry: Dictionary = eligible[randi() % eligible.size()]
		var inst := entry.scene.instantiate() as Area2D
		var base_speed: float = entry.speed if entry.speed > 0.0 else _obj_speed()
		inst.speed  = base_speed + (_obj_speed() - OBJ_SPEED_MIN)
		inst.points = entry.points
		inst.heal   = entry.heal
		# Stagger each fruit 130 px further right — forms a collectable line
		inst.global_position = Vector2(base_x + i * 130.0, base_y)
		inst.collected.connect(_on_fruit_collected)
		add_child(inst)


func _build_monster_pool() -> void:
	if enemy_list_scene == null:
		push_warning("main.gd: enemy_list_scene not set — no monsters will spawn")
		return
	var enemy_list := enemy_list_scene.instantiate()
	for node: Node in enemy_list.enemy_nodes:
		if not is_instance_valid(node) or node.scene_file_path.is_empty():
			continue
		var scene := load(node.scene_file_path) as PackedScene
		if scene == null:
			continue
		_monster_pool.append({
			scene           = scene,
			min_level       = node.min_level       if "min_level"       in node else 1,
			damage          = node.damage          if "damage"          in node else 1,
			wave_amplitude  = node.wave_amplitude  if "wave_amplitude"  in node else 0.0,
			wave_frequency  = node.wave_frequency  if "wave_frequency"  in node else 1.0,
			spawn_scale     = node.scale           if node.scale != Vector2.ONE else Vector2(1.8, 1.8),
		})
	enemy_list.free()
	_monster_pool.sort_custom(func(a: Dictionary, b: Dictionary) -> bool:
		return a.min_level < b.min_level
	)


func _build_fruit_pool() -> void:
	if fruit_list_scene == null:
		push_warning("main.gd: fruit_list_scene not set — no fruits will spawn")
		return
	var fruit_list := fruit_list_scene.instantiate()
	for node: Node in fruit_list.fruit_nodes:
		if not is_instance_valid(node) or node.scene_file_path.is_empty():
			continue
		var scene := load(node.scene_file_path) as PackedScene
		if scene == null:
			continue
		_fruit_pool.append({
			scene     = scene,
			min_level = node.level  if "level"  in node else 1,
			points    = node.points if "points" in node else 1,
			heal      = node.heal   if "heal"   in node else 0,
			speed     = node.speed  if "speed"  in node else 0.0,
		})
	fruit_list.free()
	_fruit_pool.sort_custom(func(a: Dictionary, b: Dictionary) -> bool:
		return a.min_level < b.min_level
	)


# Returns the current object scroll speed, clamped between OBJ_SPEED_MIN and OBJ_SPEED_MAX.
func _obj_speed() -> float:
	return minf(
		OBJ_SPEED_MIN + (OBJ_SPEED_MAX - OBJ_SPEED_MIN) * float(current_level - 1) / float(MAX_LEVEL - 1),
		OBJ_SPEED_MAX
	)


# ─── Signals from bat / fruit ─────────────────────────────────────────────────
func _on_fruit_collected(pts: int, heal: int) -> void:
	score += pts
	if heal > 0:
		_bat.heal(heal)


func _on_hp_changed(hp: int) -> void:
	SaveManager.player_hp = hp
	_update_hud_hp(hp)


# ─── Level ────────────────────────────────────────────────────────────────────
func _update_level() -> void:
	# Advance only when BOTH point and distance thresholds are met.
	var pts_needed:  int   = current_level * PTS_PER_LEVEL
	var dist_needed: float = current_level * DIST_PER_LEVEL
	if score >= pts_needed and dist_px >= dist_needed:
		var new_level := current_level + 1
		current_level = new_level
		# Recompute scroll_speed immediately so the countdown screen scrolls at the new speed.
		scroll_speed = minf(
			SPEED_MIN + (SPEED_MAX - SPEED_MIN) * float(current_level - 1) / float(MAX_LEVEL - 1),
			SPEED_MAX
		)
		_show_level_up(current_level)
		return
	# Always keep scroll_speed in sync even when no level-up happens.
	scroll_speed = minf(
		SPEED_MIN + (SPEED_MAX - SPEED_MIN) * float(current_level - 1) / float(MAX_LEVEL - 1),
		SPEED_MAX
	)


func _current_interval() -> float:
	# Tighter monster spawning each level; floor at 0.6 s.
	return maxf(0.6, 3.0 / float(current_level))


func _show_level_up(lvl: int) -> void:
	state = State.LEVEL_UP
	# Freeze bat in place during countdown
	_bat.velocity   = Vector2.ZERO
	_bat.frozen     = true
	_level_title_label.text = "LEVEL %d!" % lvl
	_countdown_label.text   = ""
	_level_up_layer.show()
	var fade := create_tween()
	fade.tween_property(_level_up_panel, "modulate:a", 1.0, 0.3).from(0.0)
	# Checkpoint save on every level-up
	SaveManager.save_progress(lvl, score)
	await get_tree().create_timer(1.0).timeout
	for i: int in [3, 2, 1]:
		_countdown_label.text = str(i)
		await get_tree().create_timer(1.0).timeout
	_level_up_layer.hide()
	_bat.frozen = false
	state = State.PLAYING


# ─── Pause ───────────────────────────────────────────────────────────────────
func _pause_game() -> void:
	state = State.PAUSED
	Engine.time_scale = 0.0   # freezes delta → all movement stops
	_pause_layer.show()


func _resume_game() -> void:
	_pause_layer.hide()
	Engine.time_scale = 1.0
	state = State.PLAYING


func _build_pause_screen() -> void:
	_pause_layer = CanvasLayer.new()
	_pause_layer.name  = "Pause"
	_pause_layer.layer = 11   # above HUD (1), below death/levelup (10)... actually above all at 11
	add_child(_pause_layer)
	_pause_layer.hide()

	_pause_panel = Control.new()
	_pause_panel.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	_pause_layer.add_child(_pause_panel)

	var bg := ColorRect.new()
	bg.color         = Color(0.0, 0.0, 0.0, 0.72)
	bg.anchor_right  = 1.0
	bg.anchor_bottom = 1.0
	bg.offset_right  = 0.0
	bg.offset_bottom = 0.0
	_pause_panel.add_child(bg)

	var title := _make_label_centered(_pause_panel, -280.0, 52, "PAUSED")
	title.add_theme_color_override("font_color", Color(1.0, 0.9, 0.2))

	# Top half tap zone → resume
	_make_label_centered(_pause_panel, -100.0, 32, "Resume")

	# Subtle divider at screen centre
	var sep := ColorRect.new()
	sep.color         = Color(1, 1, 1, 0.12)
	sep.anchor_left   = 0.5
	sep.anchor_right  = 0.5
	sep.anchor_top    = 0.5
	sep.anchor_bottom = 0.5
	sep.offset_left   = -200.0
	sep.offset_right  = 200.0
	sep.offset_top    = -1.0
	sep.offset_bottom = 1.0
	_pause_panel.add_child(sep)

	# Bottom half tap zone → main menu
	var menu_lbl := _make_label_centered(_pause_panel, 60.0, 32, "Main Menu")
	menu_lbl.add_theme_color_override("font_color", Color(0.75, 0.75, 0.75))

	var hint := _make_label_centered(_pause_panel, 230.0, 16, "spacebar to resume")
	hint.add_theme_color_override("font_color", Color(0.38, 0.38, 0.38))


# ─── Background gradient overlay ─────────────────────────────────────────────
func _build_gradient_bg() -> void:
	# Vertical gradient tint: deep navy top → dark teal bottom, ~45% opacity.
	# Sits on CanvasLayer -1 so it's always behind gameplay and HUD.
	var gradient := Gradient.new()
	gradient.colors  = PackedColorArray([Color(0.04, 0.06, 0.22, 0.45), Color(0.02, 0.14, 0.08, 0.45)])
	gradient.offsets = PackedFloat32Array([0.0, 1.0])

	var tex := GradientTexture2D.new()
	tex.gradient  = gradient
	tex.fill_from = Vector2(0.5, 0.0)
	tex.fill_to   = Vector2(0.5, 1.0)

	var tr := TextureRect.new()
	tr.texture      = tex
	tr.expand_mode  = TextureRect.EXPAND_IGNORE_SIZE
	tr.stretch_mode = TextureRect.STRETCH_SCALE
	tr.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)

	var layer := CanvasLayer.new()
	layer.layer = -1
	add_child(layer)
	layer.add_child(tr)


# ─── HUD ──────────────────────────────────────────────────────────────────────
func _get_hud() -> CanvasLayer:
	return get_node("HUD")


func _build_hud() -> void:
	var hud := CanvasLayer.new()
	hud.name  = "HUD"
	hud.layer = 1
	add_child(hud)

	_pts_rtl.bbcode_enabled = true
	_pts_rtl.text = "0 pts"
	_dist_rtl.bbcode_enabled = true
	_dist_rtl.text = "Lv 1\n0 m"

	hud.hide()  # shown when game starts


func _update_hud() -> void:
	_pts_rtl.text  = "%d pts" % score
	_dist_rtl.text = "Lv %d\n%d m" % [current_level, int(dist_px / 100.0)]


func _update_hud_hp(hp: int) -> void:
	_hearts_node.set_hp(hp)
	_hearts_node.modulate = Color(5.0, 5.0, 5.0, 1.0)
	var htween := create_tween()
	htween.tween_property(_hearts_node, "modulate", Color.WHITE, 0.35)


# ─── Splash screen ────────────────────────────────────────────────────────────
func _build_splash() -> void:
	_splash_layer = CanvasLayer.new()
	_splash_layer.name  = "Splash"
	_splash_layer.layer = 10
	add_child(_splash_layer)

	# Minimal hint — no title panel, menu handles the full splash experience
	_tap_hint = _make_label_centered(_splash_layer, 200.0, 24, "tap to start")
	_pulse_label(_tap_hint)


# ─── Death screen ─────────────────────────────────────────────────────────────
func _build_death_screen() -> void:
	_death_layer = CanvasLayer.new()
	_death_layer.name  = "DeathScreen"
	_death_layer.layer = 10
	add_child(_death_layer)
	_death_layer.hide()

	# Control node is the fadeable container (CanvasLayer has no modulate)
	_death_panel = Control.new()
	_death_panel.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	_death_panel.modulate = Color(1, 1, 1, 0)
	_death_layer.add_child(_death_panel)

	var bg := ColorRect.new()
	bg.color         = Color(0.0, 0.0, 0.0, 0.65)
	bg.anchor_right  = 1.0
	bg.anchor_bottom = 1.0
	bg.offset_right  = 0.0
	bg.offset_bottom = 0.0
	_death_panel.add_child(bg)

	var died_lbl := _make_label_centered(_death_panel, -200.0, 52, "YOU DIED")
	died_lbl.add_theme_color_override("font_color", Color(1.0, 0.2, 0.2))

	_new_best_label = _make_label_centered(_death_panel, -135.0, 26, "NEW BEST!")
	_new_best_label.add_theme_color_override("font_color", Color(1.0, 0.9, 0.2))
	_new_best_label.hide()

	var score_lbl := _make_label_centered(_death_panel, -90.0, 22, "")
	score_lbl.name = "ScoreSummary"

	# _tap_hint is the back-to-menu label — hidden until retry enabled
	_tap_hint = _make_label_centered(_death_panel, -30.0, 24, "tap to return to menu")
	_tap_hint.modulate = Color(1, 1, 1, 0)


# ─── Level-up screen ──────────────────────────────────────────────────────────
func _build_level_up_screen() -> void:
	_level_up_layer = CanvasLayer.new()
	_level_up_layer.name  = "LevelUp"
	_level_up_layer.layer = 10
	add_child(_level_up_layer)
	_level_up_layer.hide()

	_level_up_panel = Control.new()
	_level_up_panel.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	_level_up_panel.modulate = Color(1, 1, 1, 0)
	_level_up_layer.add_child(_level_up_panel)

	var bg := ColorRect.new()
	bg.color         = Color(0.0, 0.0, 0.0, 0.55)
	bg.anchor_right  = 1.0
	bg.anchor_bottom = 1.0
	bg.offset_right  = 0.0
	bg.offset_bottom = 0.0
	_level_up_panel.add_child(bg)

	_level_title_label = _make_label_centered(_level_up_panel, -160.0, 52, "LEVEL 2!")
	_level_title_label.add_theme_color_override("font_color", Color(1.0, 0.9, 0.2))

	_countdown_label = _make_label_centered(_level_up_panel, -60.0, 33, "")


# ─── Label helpers ────────────────────────────────────────────────────────────
func _make_label(parent: Node, pos: Vector2, font_size: int, text: String) -> Label:
	var lbl := Label.new()
	lbl.text                                          = text
	lbl.position                                      = pos
	lbl.add_theme_font_size_override("font_size",      font_size)
	lbl.add_theme_color_override("font_color",         Color.WHITE)
	lbl.add_theme_color_override("font_outline_color", Color.BLACK)
	lbl.add_theme_constant_override("outline_size",    2)
	parent.add_child(lbl)
	return lbl


func _make_label_right(parent: Node, offset: Vector2, font_size: int, text: String) -> Label:
	var lbl := Label.new()
	lbl.text                                          = text
	lbl.anchor_left                                   = 1.0
	lbl.anchor_right                                  = 1.0
	lbl.offset_left                                   = offset.x - 200.0
	lbl.offset_right                                  = offset.x
	lbl.offset_top                                    = offset.y
	lbl.horizontal_alignment                          = HORIZONTAL_ALIGNMENT_RIGHT
	lbl.add_theme_font_size_override("font_size",      font_size)
	lbl.add_theme_color_override("font_color",         Color.WHITE)
	lbl.add_theme_color_override("font_outline_color", Color.BLACK)
	lbl.add_theme_constant_override("outline_size",    2)
	parent.add_child(lbl)
	return lbl


func _make_label_centered(parent: Node, y_offset: float, font_size: int, text: String) -> Label:
	var lbl := Label.new()
	lbl.text                                          = text
	lbl.anchor_left                                   = 0.5
	lbl.anchor_right                                  = 0.5
	lbl.anchor_top                                    = 0.5
	lbl.anchor_bottom                                 = 0.5
	lbl.offset_left                                   = -300.0
	lbl.offset_right                                  = 300.0
	lbl.offset_top                                    = y_offset
	lbl.offset_bottom                                 = y_offset + font_size + 8.0
	lbl.horizontal_alignment                          = HORIZONTAL_ALIGNMENT_CENTER
	lbl.add_theme_font_size_override("font_size",      font_size)
	lbl.add_theme_color_override("font_color",         Color.WHITE)
	lbl.add_theme_color_override("font_outline_color", Color.BLACK)
	lbl.add_theme_constant_override("outline_size",    3)
	parent.add_child(lbl)
	return lbl


func _pulse_label(lbl: Label) -> void:
	var t := create_tween().set_loops()
	t.tween_property(lbl, "modulate:a", 1.0, 0.6).from(0.35)
	t.tween_property(lbl, "modulate:a", 0.35, 0.6)
