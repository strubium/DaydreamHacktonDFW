shader_type canvas_item;

uniform float time_speed : hint_range(0.0, 5.0) = 1.0;
uniform float snow_density : hint_range(0.1, 2.0) = 1.0;
uniform float wind_speed : hint_range(0.0, 2.0) = 0.8;
uniform float fall_speed : hint_range(0.0, 2.0) = 0.3;
uniform float streak_length : hint_range(0.1, 3.0) = 1.5;
uniform vec4 snow_color : source_color = vec4(1.0, 1.0, 1.0, 0.6);

float rand(vec2 co) {
    return fract(sin(dot(co, vec2(12.9898,78.233))) * 43758.5453);
}

void fragment() {
    // Normalize to screen size
    vec2 uv = FRAGCOORD.xy / SCREEN_PIXEL_SIZE.xy;
    uv /= snow_density;

    float t = TIME * time_speed;

    // Fixed grid (doesn't scroll with time)
    vec2 grid = floor(uv);

    // Random offset per grid cell
    float rndx = rand(grid);
    float rndy = rand(grid + 13.7);

    // Animate snow: shift horizontally and vertically with time
    vec2 flake_pos = vec2(rndx - t * wind_speed, rndy + t * fall_speed);

    // Wrap inside [0,1]
    flake_pos = fract(flake_pos);

    // Local position within this cell
    vec2 f = fract(uv);

    // Distance to current flake position
    vec2 diff = f - flake_pos;
    diff.x /= streak_length; // stretch into streaks

    float d = length(diff);

    // Smooth circular → streak shape
    float flake = smoothstep(0.15, 0.0, d);

    COLOR = snow_color * flake;
}
