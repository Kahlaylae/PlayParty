extends CharacterBody2D

@export var hop_min:      float = -300.0   # velocity on tap — the baby hop
@export var hop_boost:    float = 900.0    # upward accel (px/s²) while held
@export var hop_max_hold: float = 0.25     # max seconds the boost applies
@export var hop_strength: float = -600.0   # kept for first-tap in main.gd
@export var gravity: float      = 1200.0
@export var max_fall_speed: float  = 800.0
@export var max_hp: int            = 3

signal died
signal hp_changed(new_hp: int)

var hp: int        = 0
var frozen: bool   = true   # set false by main.gd on first tap
var is_dying: bool = false

var _invincible: bool = false
var _eating: bool     = false
var _shadow: AnimatedSprite2D = null
var _eat_sfx: AudioStreamPlayer = null

var _hopping:  bool  = false   # true while boost is still active
var _hop_held: float = 0.0     # seconds the current hop has been held

@onready var _anim:    AnimatedSprite2D = $AnimatedSprite2D
@onready var _hurtbox: Area2D           = $HurtBox


func _ready() -> void:
	hp = max_hp
	add_to_group("bat")
	_anim.play("fly")

	_eat_sfx = AudioStreamPlayer.new()
	_eat_sfx.stream = load("res://assetsRaw/sounds/eat.mp3")
	add_child(_eat_sfx)

	# Drop shadow — duplicate anim sprite, offset and darken it
	_shadow = _anim.duplicate() as AnimatedSprite2D
	_shadow.z_index = -1
	_shadow.modulate = Color(0.0, 0.0, 0.0, 0.28)
	_shadow.position = _anim.position + Vector2(6.0, 7.0)
	add_child(_shadow)

	# Hurtbox — overlap is polled each physics frame (more reliable with Jolt)
	# body_entered signal is intentionally not used here

	# White outline shader — 4-neighbour sample, draws white where pixel is transparent but neighbor has alpha
	var outline_shader := Shader.new()
	outline_shader.code = """
shader_type canvas_item;
uniform float size : hint_range(0.0, 8.0) = 1.0;
void fragment() {
    vec4 col = texture(TEXTURE, UV);
    vec2 p = TEXTURE_PIXEL_SIZE * size;
    float n = 0.0;
    n += texture(TEXTURE, UV + vec2( p.x, 0.0)).a;
    n += texture(TEXTURE, UV + vec2(-p.x, 0.0)).a;
    n += texture(TEXTURE, UV + vec2(0.0,  p.y)).a;
    n += texture(TEXTURE, UV + vec2(0.0, -p.y)).a;
    float outline = min(n, 1.0) * (1.0 - col.a);
    COLOR = mix(col, vec4(1.0, 1.0, 1.0, 1.0), outline);
}
"""
	var outline_mat := ShaderMaterial.new()
	outline_mat.shader = outline_shader
	_anim.material = outline_mat


func _physics_process(delta: float) -> void:
	if frozen:
		return

	if is_dying:
		velocity.x = 0.0
		velocity.y = minf(velocity.y + 400.0 * delta, 600.0)
		move_and_slide()
		# Once sunk well below the visible play area, fire the signal
		if global_position.y > 1400.0:
			emit_signal("died")
			set_physics_process(false)
		return

	# ── Variable-height hop ───────────────────────────────────────────────
	if Input.is_action_just_pressed("hop"):
		velocity.y = hop_min   # minimum upward kick on every tap
		_hopping   = true
		_hop_held  = 0.0

	# While held and within the boost window, pull the bat upward extra
	if _hopping:
		if Input.is_action_pressed("hop") and _hop_held < hop_max_hold:
			velocity.y -= hop_boost * delta
			_hop_held  += delta
		else:
			_hopping = false   # released or cap hit — gravity takes over

	velocity.y = minf(velocity.y + gravity * delta, max_fall_speed)
	velocity.x = 0.0
	move_and_slide()

	# Poll overlapping bodies — more reliable than body_entered with CharacterBody2D + Jolt
	if not _invincible and not is_dying and not frozen:
		for body in _hurtbox.get_overlapping_bodies():
			if body.is_in_group("monster"):
				take_damage(body.damage if "damage" in body else 1)
				break


func _process(_delta: float) -> void:
	# Keep shadow in sync with the main sprite every frame
	if _shadow and _anim:
		_shadow.animation = _anim.animation
		_shadow.frame     = _anim.frame


# Called by fruit.gd when bat overlaps a fruit
func play_eat() -> void:
	if is_dying:
		return
	if _eat_sfx:
		_eat_sfx.play()
	_eating = true
	_anim.play("eat")
	get_tree().create_timer(0.9).timeout.connect(
		func() -> void:
			_eating = false
			if not is_dying:
				_anim.play("fly"),
		CONNECT_ONE_SHOT
	)


func take_damage(amount: int) -> void:
	if is_dying or _invincible:
		return
	hp -= amount
	emit_signal("hp_changed", hp)
	if hp <= 0:
		_start_dying()
		return
	# Hurt animation + 2 s invincibility blink (4 × 0.5 s cycles)
	_invincible = true
	if _anim.sprite_frames.has_animation("hurt"):
		_anim.play("hurt")
	_anim.modulate = Color(6.0, 6.0, 6.0, 1.0)  # instant white blast
	var tween := create_tween().set_loops(4)
	tween.tween_property(_anim, "modulate", Color(1.0, 1.0, 1.0, 0.15), 0.25)
	tween.tween_property(_anim, "modulate", Color(1.0, 1.0, 1.0, 1.0), 0.25)
	get_tree().create_timer(2.0).timeout.connect(
		func() -> void:
			_invincible = false
			_anim.modulate = Color.WHITE
			if not is_dying and not _eating:
				_anim.play("fly"),
		CONNECT_ONE_SHOT
	)


func heal(amount: int) -> void:
	hp = mini(hp + amount, max_hp)
	emit_signal("hp_changed", hp)


func _start_dying() -> void:
	if is_dying:
		return
	is_dying = true
	_invincible = true
	modulate = Color.WHITE
	_anim.play("die")
	# Sinking is handled in _physics_process once is_dying=true
	# died signal fires when y > 1400
