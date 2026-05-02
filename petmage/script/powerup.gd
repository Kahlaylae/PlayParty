extends Area2D

@export var ultimateToggle: bool = false   # sets player fireball_charge to 0 (fireballs only)
@export var firespeedToggle: bool = false # sets player fire_cooldown to 0.08 (faster firing)
@export var jumpToggle: bool = false     # sets player max_air_jumps to 10
@export var distanceToggle: bool = false # sets player tracker to 3000 (increased aim range)
@export var ultimateCountdown: float = 0.0       # what fireball_charge becomes with ultimateToggle
@export var firespeed: float = 0.01  # what fire_cooldown becomes with firespeedToggle
@export var maxJumps: float = 0.0     # what max_air_jumps becomes with jumpToggle
@export var aimDistance: float = 0.0 # what tracker becomes with distanceToggle
@export var powerupCooldown: float = 5 # how long the power up lasts in seconds

func _ready() -> void:
	# Layer 4 (pickups), mask includes layer 2 (player)
	collision_layer = 0
	set_collision_layer_value(4, true)
	collision_mask = 0
	set_collision_mask_value(2, true)
	body_entered.connect(_on_body_entered)


func _on_body_entered(body: Node2D) -> void:
	if not body.is_in_group("player"):
		return
	_apply_to_player(body)
	queue_free()


func _apply_to_player(body: Node2D) -> void:
	if ultimateToggle and "ultimateCooldown" in body:
		body.ultimateCooldown = int(ultimateCountdown)

	if firespeedToggle and "firespeed" in body:
		body.firespeed = firespeed

	if jumpToggle and "max_air_jumps" in body:
		body.max_air_jumps = int(maxJumps)

	if distanceToggle and "aimDistance" in body:
		body.aimDistance = aimDistance
