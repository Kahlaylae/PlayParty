extends Area2D

# Returns a random global y within the CollisionShape2D's vertical bounds.
# Falls back to the node's own global y if no shape is found.
func get_spawn_y() -> float:
	var cs := get_node_or_null("CollisionShape2D") as CollisionShape2D
	if cs == null or cs.shape == null:
		return global_position.y
	var half_h: float
	if cs.shape is RectangleShape2D:
		half_h = (cs.shape as RectangleShape2D).size.y * 0.5
	elif cs.shape is CapsuleShape2D:
		half_h = (cs.shape as CapsuleShape2D).height * 0.5
	else:
		return global_position.y
	var center_y := (cs.global_transform * Vector2.ZERO).y
	return randf_range(center_y - half_h, center_y + half_h)
