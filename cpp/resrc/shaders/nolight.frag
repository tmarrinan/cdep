#version 430

precision mediump float;

in vec2 texcoord;

uniform vec2 texture_scale;
uniform vec2 texture_offset;
uniform sampler2D image;

layout(location = 0) out vec4 FragColor;

void main() {
    vec2 uv = texcoord * texture_scale + texture_offset;
    FragColor = texture(image, uv);
}
