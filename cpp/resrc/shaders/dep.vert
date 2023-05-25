#version 330

precision highp float;

#define M_PI 3.1415926535897932384626433832795
#define EPSILON 0.000001

uniform float img_index;
uniform vec3 camera_position;
uniform float camera_ipd;
uniform float camera_focal_dist;
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
    
    /*
    float vertex_depth = texture(depths, vertex_texcoord).r;
    vec3 pt = vec3(vertex_depth * cos(azimuth) * sin(inclination),
                   vertex_depth * sin(azimuth) * sin(inclination),
                   vertex_depth * cos(inclination));

    // Backproject to new ODS panorama
    //vec3 camera_spherical = vec3(camera_position.z, -camera_position.x, camera_position.y);
    vec3 camera_spherical = vec3(camera_position.z, camera_position.x, camera_position.y);
    vec3 vertex_direction = pt - camera_spherical;
    float magnitude = length(vertex_direction);
    float center_azimuth = (abs(vertex_direction.x) < EPSILON && abs(vertex_direction.y) < EPSILON) ?
                           (1.0 - 0.5 * sign(vertex_direction.z)) * M_PI :
                           atan(vertex_direction.y, vertex_direction.x);
    float center_inclination = acos(vertex_direction.z / magnitude);

    float camera_radius = 0.5 * camera_ipd * cos(center_inclination - (M_PI / 2.0));
    float camera_azimuth = center_azimuth + camera_eye * acos(camera_radius / magnitude);
    vec3 camera_pt = vec3(camera_radius * cos(camera_azimuth),
                          camera_radius * sin(camera_azimuth),
                          0.0);
    vec3 camera_to_pt = vertex_direction - camera_pt;
    float camera_distance = length(camera_to_pt);
    vec3 camera_ray = camera_to_pt / camera_distance;
    float img_sphere_dist = sqrt(camera_focal_dist * camera_focal_dist - camera_radius * camera_radius);
    vec3 img_sphere_pt = camera_pt + img_sphere_dist * camera_ray;
    float projected_azimuth = (abs(img_sphere_pt.x) < EPSILON && abs(img_sphere_pt.y) < EPSILON) ?
                              (1.0 - 0.5 * sign(img_sphere_pt.z)) * M_PI :
                              mod(atan(img_sphere_pt.y, img_sphere_pt.x), 2.0 * M_PI);
    float projected_inclination = acos(img_sphere_pt.z / camera_focal_dist);


    // Set point size (1.25 seems to be a good balance between filling small holes and blurring image)
    gl_PointSize = 1.25;

    // Set point position
    float depth_hint = 0.005 * img_index; // favor image with lower index when depth's match (index should be based on dist)
    gl_Position = ortho_projection * vec4(projected_azimuth, projected_inclination, -camera_distance - depth_hint, 1.0);

    // Pass along texture coordinate and depth
    texcoord = vertex_texcoord;
    pt_depth = camera_distance;
    */

    gl_PointSize = 1.0;
    gl_Position = ortho_projection * vec4(azimuth, inclination, -1.0, 1.0);

    texcoord = vertex_texcoord;
    pt_depth = 0.0;
}
