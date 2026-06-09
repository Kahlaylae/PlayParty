extends Node
# Iterates child fruit nodes and applies a shader based on SaveManager.unlocked_fruits.
# Locked fruits → black silhouette with white outline via silhouette.gdshader.
# Unlocked fruits → natural texture colours (no shader).

@export var fruit_nodes: Array[Node] = []

const OUTLINE_THICKNESS := 2.0

var _silhouette_shader: Shader


func _ready() -> void:
	_silhouette_shader = load("res://script/shaders/silhouette.gdshader") as Shader
	_refresh()


# Called by collections.gd or after earning an unlock to update visuals.
func _refresh() -> void:
	var nodes := fruit_nodes if fruit_nodes.size() > 0 else get_children()
	for node in nodes:
		if not is_instance_valid(node):
			continue
		var fruit_name := node.name.to_lower()
		var unlocked := fruit_name in SaveManager.unlocked_fruits
		_apply_state(node, unlocked)


func _apply_state(node: Node, unlocked: bool) -> void:
	var sprites: Array[Sprite2D] = []
	_find_sprites(node, sprites)

	if unlocked:
		for sprite in sprites:
			sprite.material = null
	else:
		for sprite in sprites:
			var mat := ShaderMaterial.new()
			mat.shader = _silhouette_shader
			mat.set_shader_parameter("outline_thickness", OUTLINE_THICKNESS)
			sprite.material = mat


func _find_sprites(node: Node, out_sprites: Array[Sprite2D]) -> void:
	if node is Sprite2D:
		out_sprites.append(node as Sprite2D)
	for child in node.get_children():
		_find_sprites(child, out_sprites)


# Unlock a fruit by name, save, and refresh visuals.
func unlock(fruit_name: String) -> void:
	var key := fruit_name.to_lower()
	if key not in SaveManager.unlocked_fruits:
		SaveManager.unlocked_fruits.append(key)
		SaveManager.save()
	_refresh()
