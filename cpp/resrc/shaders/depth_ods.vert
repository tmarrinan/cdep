#version 430

precision highp float;

uniform mat4 modelview;
uniform mat4 projection;


in vec3 vertex_position;
in vec2 vertex_texcoord;

out vec3 position;
out vec2 texcoord;

void main() {
    vec4 world_pos = vec4(vertex_position, 1.0);
    gl_Position = projection * modelview * world_pos;

    // Pass along position and texture coordinate
    position = world_pos.xyz;
    texcoord = vertex_texcoord;
}
