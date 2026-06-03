extends Node
# Iterates child fruit nodes and modulates them based on SaveManager.unlocked_fruits.
# Locked fruits appear as dark silhouettes; unlocked fruits render normally.

const LOCKED_MODULATE   := Color(0.1, 0.1, 0.1, 1.0)
const UNLOCKED_MODULATE := Color(1.0, 1.0, 1.0, 1.0)

func _ready() -> void:
	_refresh()


# Called by collections.gd or after earning an unlock to update visuals.
func _refresh() -> void:
	for child in get_children():
		var fruit_name := child.name.to_lower()
		if fruit_name in SaveManager.unlocked_fruits:
			child.modulate = UNLOCKED_MODULATE
		else:
			child.modulate = LOCKED_MODULATE


# Unlock a fruit by name, save, and refresh visuals.
func unlock(fruit_name: String) -> void:
	var key := fruit_name.to_lower()
	if key not in SaveManager.unlocked_fruits:
		SaveManager.unlocked_fruits.append(key)
		SaveManager.save()
	_refresh()
