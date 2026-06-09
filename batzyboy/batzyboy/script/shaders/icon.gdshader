shader_type canvas_item;
// Icon shader — recolours black silhouettes to tint + draws an outline at edges.
// Use on flat UI button icons (help, menu, etc.).

uniform vec4 tint : source_color = vec4(1.0, 1.0, 1.0, 1.0);
uniform vec4 outline_color : source_color = vec4(1.0, 1.0, 1.0, 1.0);
uniform float outline_thickness : hint_range(0, 20) = 1.5;

void fragment() {
	vec4 tex = texture(TEXTURE, UV);

	// Edge detection for outline — sample 8 neighbours.
	vec2 size = TEXTURE_PIXEL_SIZE * outline_thickness;
	float outline = 0.0;
	for (int x = -1; x <= 1; x++) {
		for (int y = -1; y <= 1; y++) {
			if (x == 0 && y == 0) continue;
			outline += texture(TEXTURE, UV + size * vec2(float(x), float(y))).a;
		}
	}
	outline = min(1.0, outline) * (1.0 - tex.a);

	float fill = tex.a;
	float coverage = max(fill, outline);
	vec3 color = mix(tint.rgb, outline_color.rgb, outline / max(coverage, 0.001));

	COLOR = vec4(color, coverage * tint.a);
}
