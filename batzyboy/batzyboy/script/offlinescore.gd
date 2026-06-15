extends RichTextLabel
## Displays the player's local personal best from SaveManager.

func _ready() -> void:
	var m := int(SaveManager.high_dist / 100.0)  # px → metres
	self.text = "BEST: %d pts / %d m" % [SaveManager.high_score, m]
