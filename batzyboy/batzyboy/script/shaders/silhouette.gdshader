shader_type canvas_item;
// Black silhouette + white outline for locked fruit display.
// Outline thickness is adjustable via Inspector.

uniform float outline_thickness : hint_range(0, 20) = 2.0;

void fragment() {
	float alpha = texture(TEXTURE, UV).a;
	vec2 size = TEXTURE_PIXEL_SIZE * outline_thickness;
	float outline = 0.0;
	for (int x = -1; x <= 1; x++) {
		for (int y = -1; y <= 1; y++) {
			if (x == 0 && y == 0) continue;
			outline += texture(TEXTURE, UV + size * vec2(float(x), float(y))).a;
		}
	}
	outline = min(1.0, outline) * (1.0 - alpha);
	COLOR = vec4(vec3(outline), max(alpha, outline));
}
