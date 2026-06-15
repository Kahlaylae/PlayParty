extends CharacterBody2D
## Gentle sine-wave floating for ambient critters (fireflies, fairies, etc.)
## Place anywhere in the world — origin is captured at _ready().
## Random parameters are picked from pools so every critter moves uniquely.

# ── Parameter pools (picked randomly per-critter at _ready()) ──

const SPD_X := [0.3, 0.5, 0.7, 0.9, 1.1, 1.3, 1.5]
const SPD_Y := [0.2, 0.4, 0.6, 0.8, 1.0, 1.2]
const AMP_X := [4.0, 8.0, 12.0, 16.0, 20.0, 24.0, 28.0, 32.0]
const AMP_Y := [2.0, 4.0, 6.0, 8.0, 10.0, 12.0, 14.0]
const PHS  := [0.0, 0.5, 1.0, 1.5, 2.0, 2.5, 3.0, 3.5, 4.0, 4.5, 5.0, 5.5, 6.0]
const Z_POOL := [-2, 0, 2]

# ── Instance state ──

var _origin: Vector2
var _sprite: Node2D
var _spx: float
var _spy: float
var _ax: float
var _ay: float
var _px: float
var _py: float
var _t: float = 0.0

# ──────────────────────────────────────────────────────────────

func _ready() -> void:
	_spx = SPD_X[randi() % SPD_X.size()]
	_spy = SPD_Y[randi() % SPD_Y.size()]
	_ax  = AMP_X[randi() % AMP_X.size()]
	_ay  = AMP_Y[randi() % AMP_Y.size()]
	_px  = PHS[randi() % PHS.size()]
	_py  = PHS[randi() % PHS.size()]
	# Find the visual sprite child — sine wave moves this, not the body
	_sprite = get_node_or_null("AnimatedSprite2D") as Node2D
	if not _sprite:
		_sprite = get_node_or_null("Sprite2D") as Node2D
	if _sprite:
		_origin = _sprite.position
		_sprite.z_index = Z_POOL[randi() % Z_POOL.size()]


func _process(delta: float) -> void:
	_t += delta
	if _sprite:
		_sprite.position.x = _origin.x + sin(_t * _spx + _px) * _ax
		_sprite.position.y = _origin.y + sin(_t * _spy + _py) * _ay
