shader_type canvas_item;
render_mode blend_add;

// Normalized direction from the bright corner toward the dark corner.
// (0.7071, 0.7071) = top-left bright → 45° down-right (morning sun entering canopy).
// Flip x to (-0.7071, 0.7071) to shift the bright corner to the top-right instead.
uniform vec2 light_dir = vec2(0.7071, 0.7071);

// Warm sunlight colour (yellow-orange by default).
uniform vec4 sun_color : source_color = vec4(1.0, 0.92, 0.55, 1.0);

// Overall brightness added by the ray. Keep low (0.10–0.22) to feel like dappled light.
uniform float intensity : hint_range(0.0, 1.0) = 0.15;

// How quickly the glow falls off away from the bright corner.
// 1.0 = linear, 2.0 = soft, 4.0+ = tight shaft of light.
uniform float falloff : hint_range(0.5, 8.0) = 1.8;

void fragment() {
	// Project screen UV onto the light direction.
	// t = 0 at the bright corner, t = 1 at the opposite corner.
	float t = clamp(dot(UV, light_dir), 0.0, 1.0);
	float brightness = pow(1.0 - t, falloff) * intensity;

	// blend_add: this colour is ADDED to everything drawn behind it.
	// Alpha channel is unused in blend_add but set to 1 for clarity.
	COLOR = vec4(sun_color.rgb * brightness, 1.0);
}
