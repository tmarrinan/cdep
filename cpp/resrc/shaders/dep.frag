#version 430

precision mediump float;

in vec2 texcoord;
in float pt_depth;

uniform sampler2D image;

layout(location = 0) out vec4 FragColor;
layout(location = 1) out float FragDepth;

void main() {
    FragColor = texture(image, texcoord);
    //FragColor = vec4(pt_depth, pt_depth, pt_depth, 1.0);
    FragDepth = pt_depth;
}
