extends Node

# ─── SaveManager — autoload singleton ────────────────────────────────────────
# Persists: high_score, last_level reached, audio mute preference.
# resume_requested: set by menu.gd before loading main.tscn so main.gd
# knows to start the player at the saved level instead of level 1.

const SAVE_PATH := "user://batzyboy_save.json"

var high_score:       int  = 0
var resume_level:     int  = 1
var audio_muted:      bool = false
var resume_requested: bool = false   # set by menu, consumed by main.gd
var player_hp:        int  = 6       # persisted so quit/resume restores HP
var restore_hp:       bool = false    # set by menu on continue, consumed by mainPlayer
var unlocked_fruits:  Array[String] = ["apple"]   # starter fruit always unlocked

var _music: AudioStreamPlayer


func _ready() -> void:
	load_data()
	AudioServer.set_bus_mute(0, audio_muted)
	get_tree().set_auto_accept_quit(false)  # allow _notification to save before quit

	# Background music — looping, survives scene changes via autoload
	var stream := load("res://assetsRaw/sounds/batzyBG.mp3") as AudioStream
	if stream:
		_music = AudioStreamPlayer.new()
		_music.stream     = stream
		_music.autoplay   = true
		_music.volume_db  = -8.0   # slightly quieter so SFX cuts through
		add_child(_music)
		_music.play()


# ─── Public API ───────────────────────────────────────────────────────────────

func has_save() -> bool:
	return FileAccess.file_exists(SAVE_PATH) and resume_level > 1


func save() -> void:
	var file := FileAccess.open(SAVE_PATH, FileAccess.WRITE)
	if file == null:
		push_error("SaveManager: could not open save file for writing")
		return
	var data := {
		"high_score":      high_score,
		"resume_level":    resume_level,
		"audio_muted":     audio_muted,
		"player_hp":       player_hp,
		"unlocked_fruits": unlocked_fruits,
	}
	file.store_string(JSON.stringify(data))
	file.close()


func load_data() -> void:
	if not FileAccess.file_exists(SAVE_PATH):
		return
	var file := FileAccess.open(SAVE_PATH, FileAccess.READ)
	if file == null:
		return
	var text := file.get_as_text()
	file.close()
	var parsed: Variant = JSON.parse_string(text)
	if not (parsed is Dictionary):
		return
	var d := parsed as Dictionary
	high_score   = int(d.get("high_score",   0))
	resume_level = int(d.get("resume_level", 1))
	audio_muted  = bool(d.get("audio_muted", false))
	player_hp    = int(d.get("player_hp",   6))
	var saved_fruits = d.get("unlocked_fruits", ["apple"])
	if saved_fruits is Array:
		unlocked_fruits.assign(saved_fruits)


# Called on every level-up to checkpoint progress
func save_progress(level: int, score: int) -> void:
	resume_level = level
	if score > high_score:
		high_score = score
	save()


# Clear all saved data (e.g. "New Game" wipe)
func clear() -> void:
	high_score   = 0
	resume_level = 1
	audio_muted  = audio_muted  # preserve audio pref
	if FileAccess.file_exists(SAVE_PATH):
		var dir := DirAccess.open("user://")
		if dir:
			dir.remove("batzyboy_save.json")


# Auto-save when the player closes the game window.
func _notification(what: int) -> void:
	if what == NOTIFICATION_WM_CLOSE_REQUEST:
		save()
		get_tree().quit()
