extends CharacterBody2D

@export var speed:          float = 300.0
@export var damage:         int   = 1      # hearts dealt on collision
@export var min_level:      int   = 1      # earliest game level this monster appears
@export var wave_amplitude: float = 0.0   # px; 0 = straight horizontal flight
@export var wave_frequency: float = 1.0   # cycles per second

var _wave_t: float = 0.0


func _ready() -> void:
	add_to_group("monster")
	# White outline — same 4-neighbour shader used on the bat
	var anim := get_node_or_null("AnimatedSprite2D") as AnimatedSprite2D
	if anim:
		var sh := Shader.new()
		sh.code = """
shader_type canvas_item;
uniform float size : hint_range(0.0, 8.0) = 1.2;
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
		var mat := ShaderMaterial.new()
		mat.shader = sh
		anim.material = mat


func _physics_process(delta: float) -> void:
	_wave_t  += delta
	velocity.x = -speed
	if wave_amplitude > 0.0:
		# v = d/dt [A·sin(ω·t)] = A·ω·cos(ω·t)
		var omega := wave_frequency * TAU
		velocity.y = wave_amplitude * omega * cos(_wave_t * omega)
	else:
		velocity.y = 0.0
	move_and_slide()
	if global_position.x < -600.0:
		queue_free()
