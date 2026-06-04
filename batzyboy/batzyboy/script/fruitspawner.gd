extends Area2D

# Returns the global y of this node — fruits spawn at this y.
func get_spawn_y() -> float:
	return global_position.y

# Returns a random global x within the CollisionShape2D's horizontal extent.
# Falls back to global_position.x if no SegmentShape2D is found.
func get_spawn_x() -> float:
	var cs := get_node_or_null("CollisionShape2D") as CollisionShape2D
	if cs == null or cs.shape == null:
		return global_position.x
	if cs.shape is SegmentShape2D:
		var seg := cs.shape as SegmentShape2D
		var a := cs.global_transform * seg.a
		var b := cs.global_transform * seg.b
		return randf_range(min(a.x, b.x), max(a.x, b.x))
	if cs.shape is RectangleShape2D:
		var half_w := (cs.shape as RectangleShape2D).size.x * 0.5
		var cx := (cs.global_transform * Vector2.ZERO).x
		return randf_range(cx - half_w, cx + half_w)
	return global_position.x
