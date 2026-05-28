extends CharacterBody2D

@export var speed:          float = 300.0
@export var damage:         int   = 1      # hearts dealt on collision
@export var min_level:      int   = 1      # earliest game level this monster appears
@export var wave_amplitude: float = 0.0   # px; 0 = straight horizontal flight
@export var wave_frequency: float = 1.0   # cycles per second

var _wave_t: float = 0.0


func _ready() -> void:
	add_to_group("monster")


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
