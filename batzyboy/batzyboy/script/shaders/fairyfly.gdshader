shader_type canvas_item;

uniform float rock_speed : hint_range(0.0, 3.0) = 0.8;
uniform float rock_amount : hint_range(0.0, 0.5) = 0.12;
uniform sampler2D normal_map : hint_default_black;
uniform float normal_strength : hint_range(0.0, 2.0) = 1.0;

void fragment() {
	float angle = sin(TIME * rock_speed) * rock_amount;
	vec2 centered = UV - vec2(0.5);
	float c = cos(angle);
	float s = sin(angle);
	vec2 ruv = vec2(
		centered.x * c - centered.y * s,
		centered.x * s + centered.y * c
	) + vec2(0.5);
	COLOR = texture(TEXTURE, ruv);
}

void light() {
	vec3 n = texture(normal_map, UV).rgb * 2.0 - 1.0;
	n.xy *= normal_strength;
	n = normalize(n);

	float NdotL = max(0.0, dot(n, normalize(LIGHT_DIRECTION)));
	LIGHT = vec4(LIGHT_COLOR.rgb * COLOR.rgb * LIGHT_ENERGY * NdotL, LIGHT_COLOR.a);
}
