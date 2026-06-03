@tool
extends Node2D

@export var base_speed: float = 300.0
## Check = scroll down, uncheck = scroll up.
@export var scroll_down: bool = true
## Pick nodes here using the node picker. A matching 0.1 float appears automatically.
@export var layer_nodes: Array[Node2D] = []:
	set(v):
		layer_nodes = v
		while layer_mults.size() < layer_nodes.size():
			layer_mults.append(0.1)
		notify_property_list_changed()

## Auto-sized to match Layer Nodes. Edit each float to set scroll speed.
@export var layer_mults: Array[float] = []


func _ready() -> void:
	for node in layer_nodes:
		if node is Sprite2D:
			node.texture_filter = CanvasItem.TEXTURE_FILTER_NEAREST
			node.texture_repeat  = CanvasItem.TEXTURE_REPEAT_ENABLED
			if not node.region_enabled and node.texture != null:
				node.region_enabled = true
				node.region_rect = Rect2(Vector2.ZERO, Vector2(node.texture.get_width(), node.texture.get_height()))


func _process(delta: float) -> void:
	scroll_at(base_speed, delta)


func scroll_at(speed: float, delta: float) -> void:
	for i in layer_nodes.size():
		var node: Node2D = layer_nodes[i]
		if not is_instance_valid(node):
			continue
		var mult: float = layer_mults[i] if i < layer_mults.size() else 0.1
		if node is Sprite2D and node.region_enabled:
			var r: Rect2 = node.region_rect
			r.position.y += speed * mult * delta * (1.0 if scroll_down else -1.0)
			node.region_rect = r
