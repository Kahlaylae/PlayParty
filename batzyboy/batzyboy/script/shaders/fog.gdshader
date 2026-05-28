shader_type canvas_item;

uniform vec4 fog_color : source_color = vec4(0.62, 0.70, 0.85, 1.0);
uniform float scroll_speed : hint_range(0.0, 1.0, 0.01) = 0.06;
uniform float fog_scale : hint_range(0.1, 5.0, 0.05) = 1.8;
uniform float warp_strength : hint_range(0.0, 1.0, 0.01) = 0.35;
uniform float max_alpha : hint_range(0.0, 1.0, 0.01) = 0.55;
uniform float falloff : hint_range(0.0, 0.5, 0.01) = 0.2;
uniform int foggy : hint_range(1, 10) = 1;

float hash(vec2 p) {
	p = fract(p * vec2(234.34, 435.345));
	p += dot(p, p + 34.23);
	return fract(p.x * p.y);
}

float vnoise(vec2 p) {
	vec2 i = floor(p);
	vec2 f = fract(p);
	vec2 u = f * f * (3.0 - 2.0 * f);
	return mix(
		mix(hash(i + vec2(0.0, 0.0)), hash(i + vec2(1.0, 0.0)), u.x),
		mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), u.x),
		u.y
	);
}

float fbm(vec2 p) {
	float v = 0.0;
	float a = 0.5;
	vec2 shift = vec2(100.0);
	for (int i = 0; i < 4; i++) {
		v += a * vnoise(p);
		p = p * 2.0 + shift;
		a *= 0.5;
	}
	return v;
}

void fragment() {
	// --- Layer 1 (always active) ---
	vec2 uv1 = UV * fog_scale;
	uv1.x += TIME * scroll_speed;
	vec2 warp1 = vec2(
		fbm(uv1 + vec2(0.0, 1.7) + TIME * 0.05),
		fbm(uv1 + vec2(5.2, 3.1) - TIME * 0.03)
	);
	float density = smoothstep(0.3, 0.75, fbm(uv1 + warp_strength * warp1));
	float weight  = 1.0;

	// --- Layer 2: wider wisps, drifts left + slight downward ---
	if (foggy >= 2) {
		vec2 uv2 = UV * fog_scale * 1.4;
		uv2.x -= TIME * scroll_speed * 0.7;
		uv2.y += TIME * scroll_speed * 0.2;
		vec2 warp2 = vec2(fbm(uv2 + vec2(2.3, 0.8) + TIME * 0.04), fbm(uv2 + vec2(1.1, 4.5) - TIME * 0.02));
		density += smoothstep(0.3, 0.75, fbm(uv2 + warp_strength * warp2)) * 0.7;
		weight  += 0.7;
	}

	// --- Layer 3: tighter wisps, faster rightward + slight upward ---
	if (foggy >= 3) {
		vec2 uv3 = UV * fog_scale * 0.8;
		uv3.x += TIME * scroll_speed * 1.3;
		uv3.y -= TIME * scroll_speed * 0.15;
		vec2 warp3 = vec2(fbm(uv3 + vec2(3.7, 2.1) + TIME * 0.03), fbm(uv3 + vec2(0.5, 6.2) - TIME * 0.05));
		density += smoothstep(0.25, 0.7, fbm(uv3 + warp_strength * warp3 * 0.8)) * 0.5;
		weight  += 0.5;
	}

	// --- Layer 4: fine high-freq wisps, diagonal drift ---
	if (foggy >= 4) {
		vec2 uv4 = UV * fog_scale * 2.1;
		uv4.x += TIME * scroll_speed * 0.4;
		uv4.y += TIME * scroll_speed * 0.35;
		vec2 warp4 = vec2(fbm(uv4 + vec2(6.1, 1.3) + TIME * 0.06), fbm(uv4 + vec2(2.8, 5.7) - TIME * 0.04));
		density += smoothstep(0.35, 0.8, fbm(uv4 + warp_strength * warp4 * 1.2)) * 0.4;
		weight  += 0.4;
	}

	// --- Layer 5: slow creeping base, drifts diagonally up-left ---
	if (foggy >= 5) {
		vec2 uv5 = UV * fog_scale * 0.6;
		uv5.x -= TIME * scroll_speed * 0.3;
		uv5.y -= TIME * scroll_speed * 0.1;
		vec2 warp5 = vec2(fbm(uv5 + vec2(4.4, 7.1) + TIME * 0.02), fbm(uv5 + vec2(8.3, 0.9) - TIME * 0.03));
		density += smoothstep(0.28, 0.72, fbm(uv5 + warp_strength * warp5)) * 0.35;
		weight  += 0.35;
	}

	// --- Layer 6: medium scale, counter-rotating feel ---
	if (foggy >= 6) {
		vec2 uv6 = UV * fog_scale * 1.7;
		uv6.x -= TIME * scroll_speed * 0.5;
		uv6.y += TIME * scroll_speed * 0.4;
		vec2 warp6 = vec2(fbm(uv6 + vec2(1.6, 9.2) + TIME * 0.05), fbm(uv6 + vec2(7.0, 2.4) - TIME * 0.04));
		density += smoothstep(0.32, 0.78, fbm(uv6 + warp_strength * warp6 * 0.9)) * 0.3;
		weight  += 0.3;
	}

	// --- Layer 7: very fine micro-wisps, fast rightward ---
	if (foggy >= 7) {
		vec2 uv7 = UV * fog_scale * 3.0;
		uv7.x += TIME * scroll_speed * 1.8;
		uv7.y -= TIME * scroll_speed * 0.05;
		vec2 warp7 = vec2(fbm(uv7 + vec2(0.7, 3.8) + TIME * 0.07), fbm(uv7 + vec2(5.5, 8.1) - TIME * 0.06));
		density += smoothstep(0.38, 0.82, fbm(uv7 + warp_strength * warp7 * 0.7)) * 0.25;
		weight  += 0.25;
	}

	// --- Layer 8: wide slow bank rolling in from right ---
	if (foggy >= 8) {
		vec2 uv8 = UV * fog_scale * 0.5;
		uv8.x -= TIME * scroll_speed * 1.1;
		uv8.y += TIME * scroll_speed * 0.08;
		vec2 warp8 = vec2(fbm(uv8 + vec2(9.1, 4.6) + TIME * 0.02), fbm(uv8 + vec2(3.3, 7.8) - TIME * 0.01));
		density += smoothstep(0.25, 0.68, fbm(uv8 + warp_strength * warp8 * 1.1)) * 0.2;
		weight  += 0.2;
	}

	// --- Layer 9: mid-scale swirling, slight upward pull ---
	if (foggy >= 9) {
		vec2 uv9 = UV * fog_scale * 1.1;
		uv9.x += TIME * scroll_speed * 0.9;
		uv9.y -= TIME * scroll_speed * 0.25;
		vec2 warp9 = vec2(fbm(uv9 + vec2(6.7, 0.3) + TIME * 0.04), fbm(uv9 + vec2(2.1, 9.9) - TIME * 0.05));
		density += smoothstep(0.3, 0.73, fbm(uv9 + warp_strength * warp9)) * 0.15;
		weight  += 0.15;
	}

	// --- Layer 10: ultra-fine turbulence overlay ---
	if (foggy >= 10) {
		vec2 uv10 = UV * fog_scale * 4.5;
		uv10.x += TIME * scroll_speed * 0.6;
		uv10.y += TIME * scroll_speed * 0.6;
		vec2 warp10 = vec2(fbm(uv10 + vec2(1.2, 5.5) + TIME * 0.08), fbm(uv10 + vec2(8.8, 3.3) - TIME * 0.07));
		density += smoothstep(0.4, 0.85, fbm(uv10 + warp_strength * warp10 * 1.3)) * 0.1;
		weight  += 0.1;
	}

	density /= weight;

	float vert = smoothstep(0.0, falloff, UV.y) * smoothstep(1.0, 1.0 - falloff, UV.y);

	COLOR = vec4(fog_color.rgb, fog_color.a * density * vert * max_alpha);
}
