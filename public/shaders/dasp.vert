#version 300 es

precision highp float;

#define M_PI 3.1415926535897932384626433832795
#define EPSILON 0.000001

uniform float img_ipd;
uniform float img_focal_dist;
uniform float eye; // left: +1.0, right: -1.0
uniform vec3 camera_position;
uniform mat4 ortho_projection;
uniform sampler2D depths;

in vec2 vertex_position;
in vec2 vertex_texcoord;

out vec2 texcoord;

void main() {
    // Calculate projected point position (relative to projection sphere center)
    float azimuth = vertex_position.x;
    float inclination = vertex_position.y;
    vec3 projected_pt = vec3(img_focal_dist * cos(azimuth) * sin(inclination),
                             img_focal_dist * sin(azimuth) * sin(inclination),
                             img_focal_dist * cos(inclination));

    // Calculate DASP camera position (relative to projection sphere center)
    float eye_radius = 0.5 * img_ipd * cos(inclination - (M_PI / 2.0));
    float eye_azimuth = azimuth + eye * acos(0.5 * img_ipd / img_focal_dist);
    float eye_inclination = M_PI / 2.0;
    vec3 eye_pt = vec3(eye_radius * cos(eye_azimuth) * sin(eye_inclination),
                       eye_radius * sin(eye_azimuth) * sin(eye_inclination),
                       eye_radius * cos(inclination));

    // Calculate vector from camera to 3D point
    float vertex_depth = texture(depths, vertex_texcoord).r;
    vec3 eye_to_pt = vertex_depth * normalize(projected_pt - eye_pt);

    // Calculate 3D position of point (relative to projection sphere center)
    vec3 pt = eye_pt + eye_to_pt;

    // Backproject to new 360 panorama
    vec3 vertex_direction = pt - camera_position;
    float magnitude = length(vertex_direction);
    float theta = acos(vertex_direction.y / magnitude);
    float phi = ((abs(vertex_direction.z) < EPSILON) ? sign(vertex_direction.y) * -0.5 * M_PI : atan(vertex_direction.x, -vertex_direction.z)) + M_PI;
    gl_Position = ortho_projection * vec4(phi, theta, -magnitude, 1.0);

    // Set point size (1.5?)
    gl_PointSize = 1.5;

    /*
    // Calculate 3D vector from DASP camera to point
    float azimuth = vertex_position.x;
    float inclination = vertex_position.y;
    float vertex_depth = texture(depths, vertex_texcoord).r;
    vec3 pt_dir = vec3(-vertex_depth * sin(azimuth) * sin(inclination),
                        vertex_depth * cos(inclination),
                        vertex_depth * cos(azimuth) * sin(inclination));
    
    // Calculate DASP camera position (relative to projection sphere center)
    float eye_radius = 0.5 * img_ipd * cos(inclination - (M_PI / 2.0));
    float eye_azimuth = azimuth + eye * acos(0.5 * img_ipd / img_focal_dist);
    vec3 eye_dir = vec3(-eye_radius * sin(eye_azimuth),
                         0,
                         eye_radius * cos(eye_azimuth));

    // Calculate 3D position of point (relative to projection sphere center)
    vec3 pt = eye_dir + pt_dir;

    // Backproject to new 360 panorama
    vec3 vertex_direction = pt - camera_position;
    float magnitude = length(vertex_direction);
    float theta = acos(vertex_direction.y / magnitude);
    float phi = ((abs(vertex_direction.z) < EPSILON) ? sign(vertex_direction.y) * -0.5 * M_PI : atan(vertex_direction.x, -vertex_direction.z)) + M_PI;
    gl_Position = ortho_projection * vec4(phi, theta, -magnitude, 1.0);

    // Set point size (1.5?)
    gl_PointSize = 1.5;
    */

    /*
    // Calculate 3D vector from eye to point
    float azimuth = vertex_position.x;
    float inclination = vertex_position.y;
    float vertex_depth = min(texture(depths, vertex_texcoord).r, FAR - (length(camera_position) + ipd + EPSILON));
    vec3 pt_dir = vec3(-vertex_depth * sin(azimuth) * sin(inclination),
                        vertex_depth * cos(inclination),
                        vertex_depth * cos(azimuth) * sin(inclination));

    // Calculate 3D vector from eye to point
    float eye_radius = 0.5 * ipd;
    float eye_azimuth = azimuth + (eye * 0.5 * M_PI);
    vec3 eye_dir = vec3(-eye_radius * sin(eye_azimuth),
                         0,
                         eye_radius * cos(eye_azimuth));
    
    // Calculate 3D position of point
    vec3 pt = eye_dir + pt_dir;
    
    // Backproject to new 360 panorama
    vec3 vertex_direction = pt - camera_position;
    float magnitude = length(vertex_direction);
    float theta = acos(vertex_direction.y / magnitude);
    float phi = ((abs(vertex_direction.z) < EPSILON) ? sign(vertex_direction.y) * -0.5 * M_PI : atan(vertex_direction.x, -vertex_direction.z)) + M_PI;
    gl_Position = ortho_projection * vec4(phi, theta, -magnitude, 1.0);
    
    // Set point size (1.5?)
    gl_PointSize = 1.0;
    */

    // Pass along texture coordinate
    texcoord = vertex_texcoord;
}
