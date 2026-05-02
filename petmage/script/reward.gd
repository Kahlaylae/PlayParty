extends Area2D

func _on_body_entered(body: Node2D) -> void:
	if body.is_in_group("player"):
		var scene := get_tree().current_scene
		if scene != null and scene.has_method("add_coin"):
			scene.add_coin()
		queue_free()
