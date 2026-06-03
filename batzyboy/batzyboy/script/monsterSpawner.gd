extends Area2D

# Returns a random global y within the CollisionShape2D's vertical bounds.
# Falls back to the node's own global y if no shape is found.
func get_spawn_y() -> float:
	var cs := get_node_or_null("CollisionShape2D") as CollisionShape2D
	if cs == null or cs.shape == null:
		return global_position.y
	var min_y: float
	var max_y: float
	if cs.shape is RectangleShape2D:
		var half_h := (cs.shape as RectangleShape2D).size.y * 0.5
		var center_y := (cs.global_transform * Vector2.ZERO).y
		min_y = center_y - half_h
		max_y = center_y + half_h
	elif cs.shape is CapsuleShape2D:
		var half_h := (cs.shape as CapsuleShape2D).height * 0.5
		var center_y := (cs.global_transform * Vector2.ZERO).y
		min_y = center_y - half_h
		max_y = center_y + half_h
	elif cs.shape is SegmentShape2D:
		var seg := cs.shape as SegmentShape2D
		var a := cs.global_transform * seg.a
		var b := cs.global_transform * seg.b
		min_y = min(a.y, b.y)
		max_y = max(a.y, b.y)
	else:
		return global_position.y
	return randf_range(min_y, max_y)
