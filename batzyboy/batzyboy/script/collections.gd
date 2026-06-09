@tool
extends CanvasLayer

@export var fruit_list_scene: PackedScene
@export var pulse_speed: float = 2.0
@export var outline_thickness: float = 2.0
@export var fruit_scale := Vector2(3, 3)

var _silhouette_shader: Shader


func _ready() -> void:
	_silhouette_shader = load("res://script/shaders/silhouette.gdshader") as Shader
	if fruit_list_scene == null:
		return

	var fruit_list := fruit_list_scene.instantiate()
	var window := get_node_or_null("collections window") as Control
	if window == null:
		fruit_list.free()
		return

	# Read the GridContainer's position & size as a layout guide.
	var guide := _find_grid(window)
	if guide == null:
		fruit_list.free()
		return

	# Always clean previous fruit children to avoid duplicates.
	for child in window.get_children():
		if child is Area2D:
			child.queue_free()

	var count: int = fruit_list.fruit_nodes.size()
	var cols: int = maxi(guide.columns, 1)
	var rows: int = ceili(float(count) / float(cols))
	var cell_w: float = guide.size.x / float(cols)
	var cell_h: float = guide.size.y / float(rows)
	var origin: Vector2 = guide.position + Vector2(cell_w, cell_h) * 0.5

	for i in range(count):
		var node: Node = fruit_list.fruit_nodes[i]
		if not is_instance_valid(node) or node.scene_file_path.is_empty():
			continue
		var scene := load(node.scene_file_path) as PackedScene
		if scene == null:
			continue

		var fruit = scene.instantiate()
		fruit.frozen = true
		fruit.scale = fruit_scale
		fruit.pulse_speed = pulse_speed

		var col := i % cols
		var row := i / cols
		fruit.position = origin + Vector2(col * cell_w, row * cell_h)

		if node.name.to_lower() not in SaveManager.unlocked_fruits:
			_apply_silhouette(fruit)

		window.add_child(fruit)
		if Engine.is_editor_hint():
			fruit.owner = null

	fruit_list.free()


func _find_grid(parent: Control) -> GridContainer:
	for child in parent.get_children():
		if child is GridContainer:
			return child
	return null


func _apply_silhouette(node: Node) -> void:
	for sprite in _all_sprites(node):
		var mat := ShaderMaterial.new()
		mat.shader = _silhouette_shader
		mat.set_shader_parameter("outline_thickness", outline_thickness)
		sprite.material = mat


func _all_sprites(node: Node) -> Array[Sprite2D]:
	var out: Array[Sprite2D] = []
	if node is Sprite2D:
		out.append(node)
	for child in node.get_children():
		out.append_array(_all_sprites(child))
	return out
