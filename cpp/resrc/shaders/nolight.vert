#version 430

precision highp float;

uniform mat4 modelview;
uniform mat4 projection;


in vec3 vertex_position;
in vec2 vertex_texcoord;

out vec2 texcoord;

void main() {
    gl_Position = projection * modelview * vec4(vertex_position, 1.0);

    // Pass along texture coordinate
    texcoord = vertex_texcoord;
}
