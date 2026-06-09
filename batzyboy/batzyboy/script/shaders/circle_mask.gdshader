shader_type canvas_item;
// Circular mask — clips texture to a circle with sharp edge + configurable outline.

uniform vec4 outline_color : source_color = vec4(0.0, 0.0, 0.0, 1.0);
uniform float outline_width : hint_range(0.0, 0.05) = 0.015;

void fragment() {
	vec2 uv = UV - 0.5;
	// Scale so radius 1.0 = circle edge, 1.0+outline_width = outer ring edge,
	// all kept within the rect by shrinking to fit.
	float dist = length(uv) * 2.0 * (1.0 + outline_width);

	float inner   = 1.0 - step(1.0, dist);
	float outer   = 1.0 - step(1.0 + outline_width, dist);
	float outline = outer - inner;

	vec4 tex = texture(TEXTURE, UV);
	COLOR.rgb = tex.rgb * inner + outline_color.rgb * outline;
	COLOR.a   = max(inner, outline * outline_color.a);
}
