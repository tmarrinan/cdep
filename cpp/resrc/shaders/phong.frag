#version 430

precision mediump float;

in vec3 position;
in vec2 texcoord;
in vec3 normal;

layout(binding = 0) uniform sampler2D image;

layout(location = 0) out vec4 FragColor;

void main() {
    vec4 col = texture(image, texcoord);
    vec3 kd = col.rgb;

    vec3 light_pos = vec3(1.0, 3.0, 0.5);
    vec3 N = normalize(normal);
    vec3 L = normalize(light_pos - position);


    vec3 ambient = 0.1 * kd;
    vec3 diffuse = kd * max(dot(N, L), 0.0);
    
    FragColor = vec4(min(ambient + diffuse, 1.0), col.a);
}
