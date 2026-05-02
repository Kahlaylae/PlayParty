extends Area2D

func _on_body_entered(body: Node2D) -> void:
	if body.is_in_group("player"):
		# Instantly kill the player — triggers the normal death flow
		if body.has_method("instant_kill"):
			body.instant_kill()
		elif "hp" in body:
			body.hp = 0
			if body.has_signal("died"):
				body.emit_signal("died")
