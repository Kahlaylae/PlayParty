@tool
extends CanvasLayer

@export var fruit_list_scene: PackedScene    # fruits.tscn  —  data list
@export var fruitpanel_scene: PackedScene    # fruitpanel.tscn  —  reusable slot

const FRUIT_SCALE  := Vector2(0.26, 0.26)
const SCROLL_STEP  := 120.0
const DEFAULT_OUTLINE := 0.5
const SILHOUETTE_SHADER := preload("res://script/shaders/silhouette.gdshader")


func _ready() -> void:
	if fruit_list_scene == null or fruitpanel_scene == null:
		return

	# ── Find the grid shell ───────────────────────────────────────────────
	var grid_container := _find_grid_container()
	if grid_container == null:
		return

	# ── Read fruit data ───────────────────────────────────────────────────
	var fruit_list := fruit_list_scene.instantiate()
	var entries: Array = []
	for node: Node in fruit_list.fruit_nodes:
		if is_instance_valid(node) and not node.scene_file_path.is_empty():
			entries.append({
				path  = node.scene_file_path,
				name  = node.name.to_lower(),
				level = node.get("level") if "level" in node else 1,
			})
	fruit_list.free()

	# Sort: lower level first, then alphabetically
	entries.sort_custom(func(a, b):
		if a.level != b.level:
			return a.level < b.level
		return a.name < b.name
	)

	# ── Populate grid ─────────────────────────────────────────────────────
	var panel_scene := fruitpanel_scene
	for entry: Dictionary in entries:
		# Stamp a panel
		var panel := panel_scene.instantiate() as Control
		grid_container.add_child(panel)

		# Instance fruit inside the panel
		var fruit_scene := load(entry.path) as PackedScene
		if fruit_scene == null:
			continue
		var fruit := fruit_scene.instantiate() as Node2D
		fruit.set("frozen", true)
		fruit.scale = FRUIT_SCALE
		fruit.position = Vector2(10, 10)
		panel.add_child(fruit)

		# Locked → silhouette
		if entry.name not in SaveManager.unlocked_fruits:
			var thickness := DEFAULT_OUTLINE
			var sprite := fruit.get_node_or_null("Sprite2D") as Sprite2D
			if sprite:
				# Read outline thickness from fruit's own material if present
				if sprite.material is ShaderMaterial:
					var sm: ShaderMaterial = sprite.material
					var t: Variant = sm.get_shader_parameter("line_thickness")
					if t != null:
						thickness = t
				var mat := ShaderMaterial.new()
				mat.shader = SILHOUETTE_SHADER
				mat.set_shader_parameter("outline_thickness", thickness)
				sprite.material = mat

	# ── Wire scroll buttons ───────────────────────────────────────────────
	var scroll := get_node_or_null("grid/ScrollContainer") as ScrollContainer
	if scroll:
		scroll.gui_input.connect(_block_scroll_input)

		var btn_left := get_node_or_null("grid/left") as Button
		var btn_right := get_node_or_null("grid/right") as Button
		if btn_left:
			btn_left.pressed.connect(func(): _scroll(scroll, -SCROLL_STEP))
		if btn_right:
			btn_right.pressed.connect(func(): _scroll(scroll, +SCROLL_STEP))


func _find_grid_container() -> GridContainer:
	return get_node_or_null("grid/ScrollContainer/MarginContainer/GridContainer") as GridContainer


func _scroll(sc: ScrollContainer, step: float) -> void:
	var t := create_tween()
	var target := sc.scroll_vertical + int(step)
	t.tween_property(sc, "scroll_vertical", target, 0.25).set_ease(Tween.EASE_OUT)


func _block_scroll_input(event: InputEvent) -> void:
	if event is InputEventMouseButton:
		if event.button_index == MOUSE_BUTTON_WHEEL_UP or event.button_index == MOUSE_BUTTON_WHEEL_DOWN:
			get_viewport().set_input_as_handled()
	if event is InputEventPanGesture or event is InputEventMagnifyGesture:
		get_viewport().set_input_as_handled()
