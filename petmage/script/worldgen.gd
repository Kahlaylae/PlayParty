extends TileMapLayer

@export var chunk_width: int = 20         # tiles per generated chunk
@export var chunks_ahead: int = 2         # how many chunks to pre-generate on start

# Set these to match your ground tile in the TileSet inspector
@export var ground_source_id: int = 1
@export var ground_atlas_coords: Vector2i = Vector2i(0, 3)

var _next_x: int = 0                      # next tile column to generate from
var _chunks: Array[int] = []              # chunk start X positions (tile coords)
var _notifier: VisibleOnScreenNotifier2D = null


func _ready() -> void:
	_notifier = get_node_or_null("VisibleOnScreenNotifier2D")
	if _notifier != null:
		_notifier.screen_entered.connect(_on_notifier_entered)

	# Sample existing painted tiles so we match source/atlas automatically
	var used := get_used_cells()
	if used.size() > 0:
		var sample := used[0]
		ground_source_id = get_cell_source_id(sample)
		ground_atlas_coords = get_cell_atlas_coords(sample)
		for cell in used:
			_next_x = max(_next_x, cell.x + 1)

	# Pre-generate ahead
	for i in chunks_ahead:
		_generate_chunk()


func _generate_chunk() -> void:
	for x in range(_next_x, _next_x + chunk_width):
		set_cell(Vector2i(x, 0), ground_source_id, ground_atlas_coords)

	_chunks.append(_next_x)
	_next_x += chunk_width

	# Move notifier to the right edge of the newest chunk
	if _notifier != null and tile_set != null:
		var tw: int = tile_set.tile_size.x
		_notifier.position.x = (_next_x - chunk_width / 2.0) * tw


func _on_notifier_entered() -> void:
	_generate_chunk()
	_erase_old_chunks()


func _erase_old_chunks() -> void:
	var camera := get_viewport().get_camera_2d()
	if camera == null or tile_set == null:
		return
	var tw: int = tile_set.tile_size.x
	var vp_half: float = get_viewport_rect().size.x * 0.5
	# Tile column at the left edge of the camera view
	var cam_left_tile := int((camera.global_position.x - vp_half - position.x) / tw)
	var to_remove: Array[int] = []
	for chunk_start in _chunks:
		if chunk_start + chunk_width < cam_left_tile - chunk_width:
			for x in range(chunk_start, chunk_start + chunk_width):
				erase_cell(Vector2i(x, 0))
			to_remove.append(chunk_start)
	for c in to_remove:
		_chunks.erase(c)
