#version 430

precision highp float;

uniform mat4 model;
uniform mat4 view;
uniform mat4 projection;


in vec3 vertex_position;
in vec2 vertex_texcoord;
in vec3 vertex_normal;

out vec3 position;
out vec2 texcoord;
out vec3 normal;

void main() {
    vec4 world_pos = model * vec4(vertex_position, 1.0);
    
    gl_Position = projection * view * world_pos;

    // Pass along position, texture coordinate, and normal
    position = world_pos.xyz;
    texcoord = vertex_texcoord;
    normal = normalize(inverse(transpose(mat3(model))) * vertex_normal);
}
