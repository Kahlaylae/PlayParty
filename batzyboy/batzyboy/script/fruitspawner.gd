extends Area2D

# Returns the Y range covered by the CollisionShape2D as Vector2(min_y, max_y).
# Works for any SegmentShape2D orientation including slopes/verticals.
# Falls back to a ±100 band around the node's Y if no shape is found.
func get_spawn_y_range() -> Vector2:
	var cs := get_node_or_null("CollisionShape2D") as CollisionShape2D
	if cs and cs.shape is SegmentShape2D:
		var seg := cs.shape as SegmentShape2D
		var a   := cs.global_transform * seg.a
		var b   := cs.global_transform * seg.b
		return Vector2(min(a.y, b.y), max(a.y, b.y))
	# Fallback
	return Vector2(global_position.y - 100.0, global_position.y + 100.0)
