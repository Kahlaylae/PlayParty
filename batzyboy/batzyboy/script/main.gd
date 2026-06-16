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

# Leveling thresholds — distance in pixels (100 px = 1 m).
# Level advances when: all fruits for this level caught once AND dist_px >= level * DIST_PER_LEVEL.
const DIST_PER_LEVEL: float = 10000.0  # 100 m × 100 px/m
const WIN_LEVEL:      int   = 9        # reaching this level's completion triggers win screen

# ─── Debug (set false for release) ───────────────────────────────────────────
const DEBUG: bool = true

# ─── Monster spawn interval (tweak these two values) ─────────────────────────
const MONSTER_INTERVAL_MAX: float = 1.5   # seconds between spawns at level 1
const MONSTER_INTERVAL_MIN: float = 0.5   # floor — never faster than this

# ─── Fruit motion ranges — tweak here ────────────────────────────────────────
const FRUIT_DRIFT_MIN:    float = 25.0   # px/s downward drop — slowest
const FRUIT_DRIFT_MAX:    float = 80.0   # px/s downward drop — fastest
const FRUIT_SINE_FREQ_MIN: float = 0.4   # Y wobble cycles/s — laziest
const FRUIT_SINE_FREQ_MAX: float = 1.8   # Y wobble cycles/s — bounciest
const FRUIT_SINE_AMP_MIN:  float = 12.0  # Y wobble height px — tightest
const FRUIT_SINE_AMP_MAX:  float = 45.0  # Y wobble height px — widest

# ─── Scene preloads ───────────────────────────────────────────────────────────
# Drag enemies.tscn / fruits.tscn into these slots in the Inspector on the main node.
@export var enemy_list_scene: PackedScene
@export var fruit_list_scene: PackedScene

var _monster_pool: Array = []
var _fruit_pool: Array = []

# ─── Game State ───────────────────────────────────────────────────────────────
enum State { SPLASH, PLAYING, LEVEL_UP, DEAD }
var state: State = State.SPLASH

var dist_px: float     = 0.0
var current_level: int = 1
var scroll_speed: float = SPEED_MIN   # updated every frame in _update_level()

var _monster_timer: float  = 0.0
var _fruit_timer: float    = 0.0
var _retry_enabled: bool   = false

# ─── Node refs ────────────────────────────────────────────────────────────────
@onready var _bat: CharacterBody2D   = $batMainSpawn
@onready var _parallax: Node2D         = $CanvasLayer2/parallaxBackground/parallaxBackground
@onready var _cam: Camera2D            = $Camera2D
@onready var _killerzone: Area2D       = $killerzone
@onready var _hearts_node: Node2D      = $CanvasLayer/hearts
@onready var _monster_spawner: Area2D  = $monsterspawner
@onready var _fruit_spawner: Area2D    = $fruitspawner
@onready var _pts_rtl: RichTextLabel   = $CanvasLayer/Points
@onready var _dist_rtl: RichTextLabel  = $CanvasLayer/DistanceTravelled

# Overlay nodes
var _splash_layer: CanvasLayer
var _death_scene: CanvasLayer
var _level_up_layer: CanvasLayer
var _level_up_panel: Control
var _level_title_label: Label
var _countdown_label: Label
var _tap_hint: Label    # pulsing "tap to fly" / "tap to retry" label

# ─── Ready ────────────────────────────────────────────────────────────────────
func _ready() -> void:
	# Remove editor-placed placeholder instances
	for nm in ["monster", "monster2", "monster3", "cherry", "cherry2"]:
		if has_node(nm):
			get_node(nm).queue_free()

	# Resume from save if requested by menu
	if SaveManager.resume_requested:
		current_level         = maxi(SaveManager.resume_level, 1)
		dist_px               = SaveManager.resume_dist
		SaveManager.score     = SaveManager.resume_score
		SaveManager.resume_requested = false
	else:
		SaveManager.score = 0

	add_to_group("game_session")
	SaveManager.fruit_unlocked.connect(_show_fruit_unlocked_toast)

	# Wire up bat signals
	_build_monster_pool()
	_build_fruit_pool()
	_bat.died.connect(_on_bat_died)
	_bat.hp_changed.connect(_on_hp_changed)
	_bat.frozen = true

	# Wire up zone collisions
	_killerzone.body_entered.connect(_on_killerzone_entered)

	_pts_rtl.bbcode_enabled = true
	_pts_rtl.text = "0 pts"
	_dist_rtl.bbcode_enabled = true
	_dist_rtl.text = "Lv 1\n0 m"
	_update_hud_hp(6)
	_death_scene = $deathscene
	_build_gradient_bg()
	_build_splash()
	_build_level_up_screen()


# ─── Input / Process ──────────────────────────────────────────────────────────
func _unhandled_input(event: InputEvent) -> void:
	if not (event is InputEventMouseButton and event.pressed):
		return

	match state:
		State.SPLASH:
			_start_game()
		State.DEAD:
			if _retry_enabled:
				get_tree().change_scene_to_file("res://scenes/menu.tscn")


func _process(delta: float) -> void:
	match state:
		State.SPLASH:
			_parallax.base_speed = SPEED_UI
		State.PLAYING:
			dist_px += scroll_speed * delta
			_update_level()
			_parallax.base_speed = scroll_speed
			_monster_timer -= delta
			if _monster_timer <= 0.0:
				_spawn_monster()
				_monster_timer = _current_interval()
			_fruit_timer -= delta
			if _fruit_timer <= 0.0:
				_spawn_fruit()
				# L1≈2–2.5s, L5≈1–1.7s, L6+ approaches 0.8s floor
				_fruit_timer = maxf(0.8, randf_range(1.8, 2.5) / pow(float(current_level), 0.6))
			_update_hud()
		State.LEVEL_UP:
			_parallax.base_speed = scroll_speed
		State.DEAD:
			_parallax.base_speed = SPEED_UI


# ─── Game flow ────────────────────────────────────────────────────────────────
func _start_game() -> void:
	state = State.PLAYING
	_bat.frozen = false
	# First tap IS the first hop — Flappy Bird feel
	_bat.velocity.y = _bat.hop_strength
	_splash_layer.hide()
	_monster_timer = 2.5
	_fruit_timer   = 1.5

func _on_bat_died() -> void:
	if state == State.DEAD:
		return
	state = State.DEAD
	var is_new := SaveManager.score > SaveManager.high_score
	if is_new:
		SaveManager.high_score = SaveManager.score
		SaveManager.high_dist  = dist_px
	SaveManager.save()
	await get_tree().create_timer(0.6).timeout
	_death_scene.show_death(SaveManager.score, SaveManager.high_score, is_new)


func _on_killerzone_entered(body: Node2D) -> void:
	if body.is_in_group("bat") and not _bat.is_dying:
		_bat._start_dying()
		# Trigger death screen directly — don't wait for sink animation
		await get_tree().create_timer(0.8).timeout
		_on_bat_died()


# ─── Spawning ─────────────────────────────────────────────────────────────────
func _spawn_x() -> float:
	# anchor_mode=0 → _cam.global_position is the top-left corner of the viewport
	return _cam.global_position.x + 720.0 + 180.0


func _spawn_y() -> float:
	return _monster_spawner.get_spawn_y()


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
	inst.global_position = Vector2(_spawn_x() + randf_range(0.0, 200.0), _spawn_y())
	inst.scale = entry.spawn_scale
	add_child(inst)


func _spawn_fruit() -> void:
	var eligible: Array = _fruit_pool.filter(
		func(f: Dictionary) -> bool: return f.min_level <= current_level
	)
	if eligible.is_empty():
		return
	# Cluster size grows with level: 1 at L1, 2 at L3, 3 at L5, capped at 4
	var count: int = mini(1 + floori(current_level / 2.0), 4)
	var y_range: Vector2 = _fruit_spawner.get_spawn_y_range()

	# Accumulated stagger so each fruit enters at a different moment
	var delay := 0.0
	for i in count:
		delay += randf_range(0.09, 0.4)
		var entry: Dictionary      = eligible[randi() % eligible.size()]
		var spawn_x: float         = _spawn_x() + randf_range(0.0, 300.0)
		var spawn_y: float         = randf_range(y_range.x, y_range.y)
		var drift:   float         = randf_range(FRUIT_DRIFT_MIN,    FRUIT_DRIFT_MAX)
		var s_freq:  float         = randf_range(FRUIT_SINE_FREQ_MIN, FRUIT_SINE_FREQ_MAX)
		var s_amp:   float         = randf_range(FRUIT_SINE_AMP_MIN,  FRUIT_SINE_AMP_MAX)
		var pts:     int           = entry.points
		var heal:    int           = entry.heal
		var ps:      float         = entry.pulse_speed
		var fid:     String        = entry.get("fruit_id", "")
		var scn:     PackedScene   = entry.scene as PackedScene
		var spd:     float         = scroll_speed  # capture current speed for the closure
		get_tree().create_timer(delay).timeout.connect(
			func() -> void:
				if not is_inside_tree():
					return
				var inst := scn.instantiate() as Area2D
				inst.scroll_speed    = spd
				inst.drift_speed     = drift
				inst.sine_freq       = s_freq
				inst.sine_amp        = s_amp
				inst.fruit_id        = fid
				inst.points          = pts
				inst.heal            = heal
				inst.pulse_speed     = ps
				inst.collision_mask  = 1
				inst.global_position = Vector2(spawn_x, spawn_y)
				add_child(inst)
		)


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
			scene       = scene,
			fruit_id    = node.name.to_lower(),
			min_level   = node.level      if "level"      in node else 1,
			points      = node.points     if "points"     in node else 1,
			heal        = node.heal       if "heal"       in node else 0,
			pulse_speed = node.pulse_speed if "pulse_speed" in node else 3.0,
		})
	fruit_list.free()
	_fruit_pool.sort_custom(func(a: Dictionary, b: Dictionary) -> bool:
		return a.min_level < b.min_level
	)
	if DEBUG:
		print("[FruitPool] %d fruits loaded:" % _fruit_pool.size())
		for e: Dictionary in _fruit_pool:
			var unlocked: bool = e.fruit_id in SaveManager.unlocked_fruits
			print("  L%d  %-18s  %s" % [e.min_level, e.fruit_id, "UNLOCKED" if unlocked else "locked"])


# Returns the current object scroll speed, clamped between OBJ_SPEED_MIN and OBJ_SPEED_MAX.
func _obj_speed() -> float:
	return minf(
		OBJ_SPEED_MIN + (OBJ_SPEED_MAX - OBJ_SPEED_MIN) * float(current_level - 1) / float(MAX_LEVEL - 1),
		OBJ_SPEED_MAX
	)


# ─── Signals ──────────────────────────────────────────────────────────────────
func _show_fruit_unlocked_toast(fruit_id: String) -> void:
	var lbl := Label.new()
	lbl.text = "%s Unlocked!!!" % fruit_id.capitalize()
	lbl.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	lbl.add_theme_font_size_override("font_size", 28)
	lbl.anchor_left   = 0.5
	lbl.anchor_right  = 0.5
	lbl.anchor_top    = 0.5
	lbl.anchor_bottom = 0.5
	lbl.offset_left   = -300.0
	lbl.offset_right  =  300.0
	lbl.offset_top    = -220.0
	lbl.offset_bottom = -185.0
	$CanvasLayer.add_child(lbl)
	var t := create_tween()
	t.tween_property(lbl, "modulate:a", 1.0, 0.15).from(0.0)
	t.tween_interval(1.2)
	t.tween_property(lbl, "modulate:a", 0.0, 0.4)
	t.tween_callback(lbl.queue_free)


func _on_hp_changed(hp: int) -> void:
	_update_hud_hp(hp)


# ─── Level ────────────────────────────────────────────────────────────────────
func _update_level() -> void:
	# Always keep scroll_speed in sync.
	scroll_speed = minf(
		SPEED_MIN + (SPEED_MAX - SPEED_MIN) * float(current_level - 1) / float(MAX_LEVEL - 1),
		SPEED_MAX
	)
	# Advance when: all fruits for this level caught at least once AND distance milestone met.
	var dist_needed: float = current_level * DIST_PER_LEVEL
	var fruits_done := SaveManager.is_level_fruits_complete(current_level, _fruit_pool)
	var dist_done   := dist_px >= dist_needed
	if DEBUG:
		if int(dist_px) % 500 < 5:
			var level_fruits := _fruit_pool.filter(func(e: Dictionary) -> bool: return e.min_level == current_level)
			var caught := level_fruits.filter(func(e: Dictionary) -> bool: return (e.fruit_id as String) in SaveManager.unlocked_fruits)
			var missing := level_fruits.filter(func(e: Dictionary) -> bool: return (e.fruit_id as String) not in SaveManager.unlocked_fruits)
			var missing_names := missing.map(func(e: Dictionary) -> String: return e.fruit_id as String)
			print("[LevelGate L%d]  fruits %d/%d  missing=%s  |  dist %dm/%dm  |  fruits_done=%s  dist_done=%s" % [
				current_level,
				caught.size(), level_fruits.size(), str(missing_names),
				int(dist_px / 100.0), int(dist_needed / 100.0),
				str(fruits_done), str(dist_done)
			])
	if fruits_done and dist_done:
		if DEBUG:
			print("[LevelUp] Conditions met at L%d  dist=%dm  unlocked=%s" % [
				current_level, int(dist_px / 100.0), str(SaveManager.unlocked_fruits)
			])
		if current_level >= WIN_LEVEL:
			_show_win_screen()
			return
		current_level += 1
		# Recompute speed at the new level immediately.
		scroll_speed = minf(
			SPEED_MIN + (SPEED_MAX - SPEED_MIN) * float(current_level - 1) / float(MAX_LEVEL - 1),
			SPEED_MAX
		)
		_show_level_up(current_level)


func _current_interval() -> float:
	# Tighter monster spawning each level; tweakable via MONSTER_INTERVAL_MAX/MIN consts.
	return maxf(MONSTER_INTERVAL_MIN, MONSTER_INTERVAL_MAX / float(current_level))


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
	SaveManager.save_progress(lvl, SaveManager.score, dist_px)
	await get_tree().create_timer(1.0).timeout
	for i: int in [3, 2, 1]:
		_countdown_label.text = str(i)
		await get_tree().create_timer(1.0).timeout
	_level_up_layer.hide()
	_bat.frozen = false
	state = State.PLAYING


func _show_win_screen() -> void:
	state = State.DEAD   # reuse DEAD to stop spawning; win panel takes over
	SaveManager.save_progress(current_level, SaveManager.score, dist_px)
	if SaveManager.score > SaveManager.high_score:
		SaveManager.high_score = SaveManager.score
		SaveManager.save()

	# Build win overlay procedurally
	var win_layer := CanvasLayer.new()
	win_layer.layer = 20
	add_child(win_layer)

	var bg := ColorRect.new()
	bg.color = Color(0.05, 0.02, 0.15, 0.92)
	bg.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	win_layer.add_child(bg)

	var panel := VBoxContainer.new()
	panel.set_anchors_and_offsets_preset(Control.PRESET_CENTER)
	panel.offset_left   = -260.0
	panel.offset_right  =  260.0
	panel.offset_top    = -300.0
	panel.offset_bottom =  300.0
	panel.alignment     = BoxContainer.ALIGNMENT_CENTER
	win_layer.add_child(panel)

	var title_lbl := Label.new()
	title_lbl.text                    = "YOU COLLECTED THEM ALL!"
	title_lbl.horizontal_alignment    = HORIZONTAL_ALIGNMENT_CENTER
	title_lbl.add_theme_font_size_override("font_size", 48)
	panel.add_child(title_lbl)

	var score_lbl := Label.new()
	score_lbl.text                 = "%d pts  ·  Best: %d pts" % [SaveManager.score, SaveManager.high_score]
	score_lbl.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	score_lbl.add_theme_font_size_override("font_size", 32)
	panel.add_child(score_lbl)

	var spacer := Control.new()
	spacer.custom_minimum_size = Vector2(0, 40)
	panel.add_child(spacer)

	var menu_btn := Button.new()
	menu_btn.text = "Back to Menu"
	menu_btn.custom_minimum_size = Vector2(300, 70)
	menu_btn.pressed.connect(func() -> void:
		get_tree().change_scene_to_file("res://scenes/menu.tscn")
	)
	panel.add_child(menu_btn)

	var tween := create_tween()
	tween.tween_property(bg, "modulate:a", 1.0, 0.5).from(0.0)


# ─── Pause ────────────────────────────────────────────────────────────────────
func save_before_exit() -> void:
	# Called by MenuButton (via "game_session" group) before returning to menu.
	if state == State.PLAYING or state == State.SPLASH:
		SaveManager.save_progress(current_level, SaveManager.score, dist_px)


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

	var tex_rect := TextureRect.new()
	tex_rect.texture      = tex
	tex_rect.expand_mode  = TextureRect.EXPAND_IGNORE_SIZE
	tex_rect.stretch_mode = TextureRect.STRETCH_SCALE
	tex_rect.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)

	var layer := CanvasLayer.new()
	layer.layer = -1
	add_child(layer)
	layer.add_child(tex_rect)


func _update_hud() -> void:
	_pts_rtl.text  = "%d pts" % SaveManager.score
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

	_countdown_label = _make_label_centered(_level_up_panel, -60.0, 33, "")


# ─── Label helpers ────────────────────────────────────────────────────────────
func _make_label(parent: Node, pos: Vector2, font_size: int, text: String) -> Label:
	var lbl := Label.new()
	lbl.text                                          = text
	lbl.position                                      = pos
	lbl.add_theme_font_size_override("font_size",      font_size)
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
	parent.add_child(lbl)
	return lbl


func _pulse_label(lbl: Label) -> void:
	var t := create_tween().set_loops()
	t.tween_property(lbl, "modulate:a", 1.0, 0.6).from(0.35)
	t.tween_property(lbl, "modulate:a", 0.35, 0.6)
