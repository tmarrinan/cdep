#version 300 es

precision highp float;

#define M_PI 3.1415926535897932384626433832795
#define EPSILON 0.000001

uniform float img_ipd;
uniform float img_focal_dist;
uniform float eye; // left: +1.0, right: -1.0
uniform vec3 camera_position;
uniform float camera_eye; // left: +1.0, right: -1.0
uniform mat4 ortho_projection;
uniform sampler2D depths;

in vec2 vertex_position;
in vec2 vertex_texcoord;

out vec2 texcoord;
out float pt_depth;

void main() {
    // Calculate projected point position (relative to projection sphere center)
    float azimuth = vertex_position.x;
    float inclination = vertex_position.y;
    vec3 projected_pt = vec3(img_focal_dist * cos(azimuth) * sin(inclination),
                             img_focal_dist * sin(azimuth) * sin(inclination),
                             img_focal_dist * cos(inclination));

    // Calculate DASP camera position (relative to projection sphere center)
    float eye_radius = 0.5 * img_ipd * cos(inclination - (M_PI / 2.0));
    //float eye_azimuth = azimuth + eye * acos(0.5 * img_ipd / img_focal_dist); // NOT SURE -- could be this version
    float eye_azimuth = azimuth + eye * acos(eye_radius / img_focal_dist); // PRETTY SURE IT'S THIS THOUGH
    vec3 eye_pt = vec3(eye_radius * cos(eye_azimuth),
                       eye_radius * sin(eye_azimuth),
                       0.0);

    // Calculate vector from camera to 3D point
    float vertex_depth = texture(depths, vertex_texcoord).r;
    vec3 eye_to_pt = vertex_depth * normalize(projected_pt - eye_pt);

    // Calculate 3D position of point (relative to projection sphere center)
    vec3 pt = eye_pt + eye_to_pt;

    // Backproject to new 360 panorama
    // TODO: use `camera_eye` to make panorama into ODS image
    vec3 camera_spherical = vec3(camera_position.z, -camera_position.x, camera_position.y);
    vec3 vertex_direction = pt - camera_spherical;
    float magnitude = length(vertex_direction);
    float new_azimuth = (abs(vertex_direction.x) < EPSILON && abs(vertex_direction.y) < EPSILON) ?
                        (1.0 - 0.5 * sign(vertex_direction.z)) * M_PI :
                        mod(atan(vertex_direction.y, vertex_direction.x), 2.0 * M_PI);
    float new_inclination = acos(vertex_direction.z / magnitude);

    // Set point size (1.25 seems to be a good balance between filling small holes and blurring image)
    gl_PointSize = 1.25;

    // Set point position
    float depth_hint = 0.0025 * eye; // favor left eye image when depth's match
    gl_Position = ortho_projection * vec4(new_azimuth, new_inclination, -magnitude + depth_hint, 1.0);

    // Pass along texture coordinate and depth
    texcoord = vertex_texcoord;
    pt_depth = magnitude;
}
