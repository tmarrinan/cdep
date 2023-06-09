#version 430

precision mediump float;

#define M_PI 3.1415926535897932384626433832795

in vec2 texcoord;

uniform vec2 texture_scale;
uniform vec2 texture_offset;
uniform mat4 modelview;
uniform mat4 projection;
layout(binding = 0) uniform sampler2D image;
layout(binding = 1) uniform sampler2D depths;

layout(location = 0) out vec4 FragColor;

void main() {
    vec2 uv = texcoord * texture_scale + texture_offset;

    // Color
    // TODO: Gaussian blur with radius = CoC size
    float obj_distance = texture(depths, uv).r;
    float aperture = 0.0277;      // TODO: make uniform var
    float focal_length = 0.05; // TODO: make uniform var
    float plane_in_focus = 2.15; // TODO: make uniform var
    float CoC = abs(aperture * (focal_length * (obj_distance - plane_in_focus)) / (obj_distance * (plane_in_focus - focal_length)));
    float blur_radius = 2500.0 * CoC; 
    //FragColor = vec4(blur_radius, blur_radius, blur_radius, 1.0);
    FragColor = texture(image, uv);

    // Depth
    float far = gl_DepthRange.far;
    float near = gl_DepthRange.near;

    float azimuth = 2.0 * M_PI * (1.0 - mod(uv.s, 1.0));
    float inclination = M_PI * (1.0 - mod(uv.t, 1.0));
    vec3 position = vec3(obj_distance * cos(azimuth) * sin(inclination),
                         obj_distance * sin(azimuth) * sin(inclination),
                         obj_distance * cos(inclination));

    vec4 v_clip_coord = projection * modelview * vec4(position.yzx, 1.0);
    float f_ndc_depth = v_clip_coord.z / v_clip_coord.w;
    float frag_depth = (((far - near) * f_ndc_depth) + far + near) * 0.5;

    gl_FragDepth = frag_depth;
    
}
