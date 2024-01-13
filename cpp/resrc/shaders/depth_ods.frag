#version 430

precision mediump float;

#define M_PI 3.1415926535897932384626433832795
#define M_e 2.71828182845904523536

in vec3 position;
in vec2 texcoord;

uniform float aperture;
uniform float focal_length;
uniform float plane_in_focus;
uniform vec2 texture_scale;
uniform vec2 texture_offset;
uniform mat4 modelview;
uniform mat4 projection;
layout(binding = 0) uniform sampler2D image;
layout(binding = 1) uniform sampler2D depths;

layout(location = 0) out vec4 FragColor;


vec4 gaussianBlur(vec2 uv, float radius);

void main() {
    vec2 uv = texcoord * texture_scale + texture_offset;

    // Color
    /*
    float focal_range = 4.0;
    float obj_distance = texture(depths, uv).r;
    float coc = 5.0 * clamp((obj_distance - plane_in_focus) / focal_range, -1.0, 1.0);
    if (coc < 0.0) coc *= -3.0;
    FragColor = gaussianBlur(uv, coc);
    */
    /*
    float obj_distance = texture(depths, uv).r;
    float CoC = abs(aperture * (focal_length * (obj_distance - plane_in_focus)) / (obj_distance * (plane_in_focus - focal_length)));
    float blur_radius = 5000.0 * CoC;
    FragColor = gaussianBlur(uv, blur_radius);
    */
    float obj_distance = texture(depths, uv).r;
    FragColor = texture2D(image, uv);

    // Depth
    vec3 frag_pos = obj_distance * position;
    float far = gl_DepthRange.far;
    float near = gl_DepthRange.near;
    vec4 v_clip_coord = projection * modelview * vec4(frag_pos, 1.0);
    float f_ndc_depth = v_clip_coord.z / v_clip_coord.w;
    float frag_depth = (((far - near) * f_ndc_depth) + far + near) * 0.5;

    gl_FragDepth = frag_depth;
}

/*
vec4 gaussianBlur(vec2 uv, float radius) {
    vec4 color = vec4(0.0);
    vec2 resolution = vec2(4096, 2048);
    vec2 dirs[2] = vec2[](vec2(radius, 0.0), vec2(0.0, radius));
    for (int i = 0; i < 2; i ++) {
        vec2 off1 = vec2(1.3846153846) * dirs[i];
        vec2 off2 = vec2(3.2307692308) * dirs[i];
        color += texture2D(image, uv) * 0.2270270270;
        color += texture2D(image, uv + (off1 / resolution)) * 0.3162162162;
        color += texture2D(image, uv - (off1 / resolution)) * 0.3162162162;
        color += texture2D(image, uv + (off2 / resolution)) * 0.0702702703;
        color += texture2D(image, uv - (off2 / resolution)) * 0.0702702703;
    }
    return color / 2.0;
}
*/


vec4 gaussianBlur(vec2 uv, float radius) {
    float r_step = 0.125;
    vec4 color;
    if (radius <= r_step) {
        color = texture(image, uv);
    }
    else {
        float focal_range = 4.0;
        vec2 resolution = vec2(4096, 2048);
        vec2 dirs[16] = vec2[](vec2(cos(0.000 * M_PI), sin(0.000 * M_PI)),
                               vec2(cos(0.125 * M_PI), sin(0.125 * M_PI)),
                               vec2(cos(0.250 * M_PI), sin(0.250 * M_PI)),
                               vec2(cos(0.375 * M_PI), sin(0.375 * M_PI)),
                               vec2(cos(0.500 * M_PI), sin(0.500 * M_PI)),
                               vec2(cos(0.625 * M_PI), sin(0.625 * M_PI)),
                               vec2(cos(0.750 * M_PI), sin(0.750 * M_PI)),
                               vec2(cos(0.875 * M_PI), sin(0.875 * M_PI)),
                               vec2(cos(1.000 * M_PI), sin(1.000 * M_PI)),
                               vec2(cos(1.125 * M_PI), sin(1.125 * M_PI)),
                               vec2(cos(1.250 * M_PI), sin(1.250 * M_PI)),
                               vec2(cos(1.375 * M_PI), sin(1.375 * M_PI)),
                               vec2(cos(1.500 * M_PI), sin(1.500 * M_PI)),
                               vec2(cos(1.625 * M_PI), sin(1.625 * M_PI)),
                               vec2(cos(1.750 * M_PI), sin(1.750 * M_PI)),
                               vec2(cos(1.875 * M_PI), sin(1.875 * M_PI)));
        float weight = radius * radius;
        color = weight * texture(image, uv);
        for (float r = r_step; r < radius; r += r_step) {
            for (int i = 0; i < 16; i++) {
                vec2 neighbor_uv = uv + dirs[i] * r / resolution;
                float neightbor_depth = texture(depths, neighbor_uv).r;
                float neightbor_coc = 5.0 * clamp((neightbor_depth - plane_in_focus) / focal_range, -1.0, 1.0);
                if (neightbor_coc < 0.0) neightbor_coc *= -3.0;
                if (neightbor_coc > 0.1) {
                    float w = radius - r;
                    float final_w = (w * w) * neightbor_coc;
                    color += final_w * texture(image, neighbor_uv);
                    weight += final_w;
                }
            }
        }
        color /= weight;
    }
    return color;
}

/*
vec4 gaussianBlur(vec2 uv, float radius) {
    float focal_range = 5.5;
    vec2 resolution = vec2(4096, 2048);
    vec2 dirs[16] = vec2[](vec2(cos(0.000 * M_PI), sin(0.000 * M_PI)),
                           vec2(cos(0.125 * M_PI), sin(0.125 * M_PI)),
                           vec2(cos(0.250 * M_PI), sin(0.250 * M_PI)),
                           vec2(cos(0.375 * M_PI), sin(0.375 * M_PI)),
                           vec2(cos(0.500 * M_PI), sin(0.500 * M_PI)),
                           vec2(cos(0.625 * M_PI), sin(0.625 * M_PI)),
                           vec2(cos(0.750 * M_PI), sin(0.750 * M_PI)),
                           vec2(cos(0.875 * M_PI), sin(0.875 * M_PI)),
                           vec2(cos(1.000 * M_PI), sin(1.000 * M_PI)),
                           vec2(cos(1.125 * M_PI), sin(1.125 * M_PI)),
                           vec2(cos(1.250 * M_PI), sin(1.250 * M_PI)),
                           vec2(cos(1.375 * M_PI), sin(1.375 * M_PI)),
                           vec2(cos(1.500 * M_PI), sin(1.500 * M_PI)),
                           vec2(cos(1.625 * M_PI), sin(1.625 * M_PI)),
                           vec2(cos(1.750 * M_PI), sin(1.750 * M_PI)),
                           vec2(cos(1.875 * M_PI), sin(1.875 * M_PI)));
    float max_blur = 2.0;
    vec4 color = texture(image, uv);
    float depth = texture(depths, uv).r;
    float weight = 1.0;
    for (float r = 0.0; r < max_blur; r += 0.25) {
        for (int i = 0; i < 16; i++) {
            vec2 neighbor_uv = uv + dirs[i] * r / resolution;
            float neightbor_depth = texture(depths, neighbor_uv).r;
            if (neightbor_depth < depth) {
                float neightbor_coc = 1.5 * clamp((neightbor_depth - plane_in_focus) / focal_range, -1.0, 1.0);
                if (neightbor_coc < 0.0) neightbor_coc *= -3.0;
                float w = neightbor_coc * neightbor_coc;
                color += w * texture(image, neighbor_uv);
                weight += w;
            }
        }
    }
    return color / weight;
}
*/