shader_type canvas_item;

uniform sampler2D screenTexture : hint_screen_texture, repeat_disable, filter_linear_mipmap;
uniform vec4 waterColor : source_color = vec4(0.0, 0.35, 0.6, 0.5);
uniform float waveStrength : hint_range(0.0, 0.05) = 0.01;
uniform float waveSpeed : hint_range(0.0, 4.0) = 1.0;
uniform float opacity : hint_range(0.0, 1.0) = 1.0;
uniform float horizon : hint_range(0.0, 1.0) = 0.5;

void fragment() {
    vec2 offset;
    offset.x = sin(UV.y * 20.0 + TIME * waveSpeed) * waveStrength;
    offset.y = cos(UV.x * 15.0 + TIME * waveSpeed * 0.7) * waveStrength * 0.5;

     vec2 reflectUV = vec2(SCREEN_UV.x + offset.x, 2.0 * horizon - SCREEN_UV.y + offset.y);
    reflectUV = clamp(reflectUV, vec2(0.001), vec2(0.999));

    vec4 reflection = texture(screenTexture, reflectUV);
    COLOR.rgb = mix(reflection.rgb, waterColor.rgb, waterColor.a);
    COLOR.a = opacity;
}