extends Sprite2D

## How fast the noise pattern evolves. 0.2–1.0 = gentle fog breath, higher = turbulent.
@export_range(0.01, 10.0, 0.01) var drift_speed: float = 0.4

## Fixed seed — sets which noise "universe" the fog lives in.
@export_range(0, 10000) var noise_seed: int = 42

var _noise: FastNoiseLite = null
var _z: float = 0.0


func _ready() -> void:
	if texture is NoiseTexture2D:
		_noise = (texture as NoiseTexture2D).noise as FastNoiseLite
		if _noise != null:
			_noise.seed = noise_seed


func _process(delta: float) -> void:
	if _noise == null:
		return
	_z += delta * drift_speed
	_noise.offset = Vector3(0.0, 0.0, _z)
