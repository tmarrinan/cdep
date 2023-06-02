#version 430

precision mediump float;

in vec2 texcoord;

uniform sampler2D image;

layout(location = 0) out vec4 FragColor;

void main() {
    FragColor = texture(image, texcoord);
}
