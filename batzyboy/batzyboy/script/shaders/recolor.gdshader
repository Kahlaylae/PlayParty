shader_type canvas_item;
// Replaces every pixel's colour with tint while preserving alpha shape.
// Use on black icon sprites to colour them via Inspector.

uniform vec4 tint : source_color = vec4(1.0, 1.0, 1.0, 1.0);

void fragment() {
	float alpha = texture(TEXTURE, UV).a;
	COLOR = vec4(tint.rgb, alpha * tint.a);
}
