#version 300 es

precision mediump float;

in vec2 texcoord;

uniform sampler2D image;

layout(location = 0) out vec4 FragColor;
layout(location = 1) out float FragDepth;

void main() {
    FragColor = texture(image, texcoord);
    FragDepth = 0.5;
}