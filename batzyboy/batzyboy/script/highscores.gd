extends RichTextLabel
## Online leaderboard — reads/writes Firestore hiscores via REST.
## Fields: name, score (pts), dist (m), level.
## HTTPRequest must be a direct child of the root CanvasLayer.

const PROJECT_ID := "batzyboy-5c624"
const API_KEY    := "AIzaSyDGEwstQlAkvf9yNudaNa7gT4Rb06LeBy0"
const BASE_URL   := "https://firestore.googleapis.com/v1/projects/batzyboy-5c624/databases/%28default%29/documents/hiscores"
const AUTH_URL   := "https://identitytoolkit.googleapis.com/v1/accounts:signUp?key=%s" % API_KEY

@onready var _http: HTTPRequest = _find_http()

var _token: String = ""
var _scores: Array = []


func _find_http() -> HTTPRequest:
	var node := get_parent()
	while node:
		var http := node.get_node_or_null("HTTPRequest") as HTTPRequest
		if http:
			return http
		node = node.get_parent()
	return null


func _ready() -> void:
	bbcode_enabled = true
	if _http == null:
		self.text = "[center]HTTPRequest not found[/center]"
		return
	self.text = "[center]Connecting …[/center]"
	_http.request_completed.connect(_on_response)
	_fetch()


func _sign_in() -> void:
	_http.request(AUTH_URL, [], HTTPClient.METHOD_POST, JSON.stringify({"returnSecureToken": true}))


func _fetch() -> void:
	_http.request("%s?key=%s" % [BASE_URL, API_KEY])


func submit_score(player_name: String) -> void:
	var m := int(SaveManager.high_dist / 100.0)
	_http.request("%s?key=%s" % [BASE_URL, API_KEY], [], HTTPClient.METHOD_POST, JSON.stringify({fields = {
		name     = {stringValue  = player_name},
		score    = {integerValue = SaveManager.high_score},
		dist     = {integerValue = m},
		level    = {integerValue = SaveManager.resume_level},
		ownerUid = {stringValue  = _token},
	}}))


func _int_field(f: Dictionary, key: String) -> int:
	var v: Dictionary = f.get(key, {})
	var raw: Variant = v.get("integerValue", v.get("stringValue", 0))
	return int(raw)


func _on_response(_result: int, _code: int, _headers: PackedStringArray, body: PackedByteArray) -> void:
	var raw: String = body.get_string_from_utf8()
	print("[highscores] HTTP %d — %s" % [_code, raw.substr(0, 250)])
	var json: Variant = JSON.parse_string(raw)

	if json and json.has("localId"):
		_token = json.localId
		_fetch()
		return

	if json and json.has("documents"):
		_scores.clear()
		for doc in json.documents:
			var f: Dictionary = doc.get("fields", {})
			_scores.append({
				name  = f.get("name",  {}).get("stringValue", "???"),
				score = _int_field(f, "score"),
				dist  = _int_field(f, "dist"),
				level = _int_field(f, "level"),
			})
		_scores.sort_custom(func(a, b): return a.score > b.score)
		_display()
		return

	if json and json.has("name"):
		await get_tree().create_timer(0.5).timeout
		_fetch()
		return

	_display_error(_code)


func _display() -> void:
	var txt := "[table=4]"
	txt += "[cell][b]  NAME  [/b][/cell][cell][b]PTS[/b][/cell][cell][b] DIST [/b][/cell][cell][b]LVL[/b][/cell]"
	for s: Dictionary in _scores:
		txt += "[cell]  %s  [/cell][cell][right]%d[/right][/cell][cell][right]%d m[/right][/cell][cell][right]%d[/right][/cell]" % [s.name, s.score, s.dist, s.level]
	txt += "[/table]"
	self.text = txt


func _display_error(code: int) -> void:
	self.text = "[center]Could not load scores.[/center]\n[center]HTTP %d[/center]" % code
