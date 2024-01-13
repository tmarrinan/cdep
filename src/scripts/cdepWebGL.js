import { Scene } from '@babylonjs/core/scene';
import { UniversalCamera } from '@babylonjs/core/Cameras/universalCamera';
import { Vector3 } from '@babylonjs/core/Maths/math.vector';
import { ShaderMaterial } from '@babylonjs/core/Materials/shaderMaterial';
import { MultiRenderTarget } from '@babylonjs/core/Materials/Textures/multiRenderTarget';
import { CreatePlane } from '@babylonjs/core/Meshes/Builders/planeBuilder';
import { Mesh } from '@babylonjs/core/Meshes/mesh';
import { VertexData } from '@babylonjs/core/Meshes/mesh.vertexData';
import { Constants } from '@babylonjs/core/Engines/constants';
import { CdepAbstract } from './cdepAbstract';

// Vertex Shader source code - render C-DEP to texture
// const cdep_vert_src = `
// #version 300 es

// precision highp float;

// #define M_PI 3.1415926535897932384626433832795
// #define EPSILON 0.000001

// uniform float img_index;
// uniform vec3 cam_position;
// uniform float cam_ipd;
// uniform float cam_focal_dist;
// uniform mat4 worldViewProjection;
// uniform sampler2D depths;

// in vec3 position;
// in vec2 uv;

// out vec2 texcoord;
// out float pt_depth;

// void main() {
//     // Calculate projected point position (relative to projection sphere center)
//     float in_azimuth = position.x;
//     float in_inclination = position.y;
//     float cam_eye = position.z; // left: +1.0, right: -1.0

//     float in_depth = texture(depths, uv).r;
//     vec3 pt = vec3(in_depth * cos(in_azimuth) * sin(in_inclination),
//                    in_depth * sin(in_azimuth) * sin(in_inclination),
//                    in_depth * cos(in_inclination));

//     // Backproject to new ODS projection sphere
//     // 1) calculate azimuth/inclination to center of projection sphere
//     vec3 camera_spherical = cam_position.zxy;
//     vec3 vertex_direction = pt - camera_spherical;
//     float magnitude = length(vertex_direction);
//     float center_azimuth = (abs(vertex_direction.x) < EPSILON && abs(vertex_direction.y) < EPSILON) ?
//                            (1.0 - 0.5 * sign(vertex_direction.z)) * M_PI :
//                            atan(vertex_direction.y, vertex_direction.x);
//     float center_inclination = acos(vertex_direction.z / magnitude);

//     // 2) calculate stereo camera location
//     float camera_radius = 0.5 * cam_ipd * cos(center_inclination - (M_PI / 2.0));
//     float camera_azimuth = center_azimuth + cam_eye * acos(camera_radius / magnitude);
//     vec3 camera_pt = vec3(camera_radius * cos(camera_azimuth),
//                           camera_radius * sin(camera_azimuth),
//                           0.0);

//     // 3) project point onto projection sphere
//     vec3 camera_to_pt = vertex_direction - camera_pt;
//     float camera_distance = length(camera_to_pt);
//     vec3 camera_ray = camera_to_pt / camera_distance;
//     float proj_sphere_dist = sqrt(cam_focal_dist * cam_focal_dist - camera_radius * camera_radius);
//     vec3 proj_sphere_pt = camera_pt + proj_sphere_dist * camera_ray;
    
//     // 4) convert projected point to spherical coords
//     float out_azimuth = (abs(proj_sphere_pt.x) < EPSILON && abs(proj_sphere_pt.y) < EPSILON) ?
//                         (1.0 - 0.5 * sign(proj_sphere_pt.z)) * M_PI :
//                         mod(atan(proj_sphere_pt.y, proj_sphere_pt.x), 2.0 * M_PI);
//     float out_inclination = acos(proj_sphere_pt.z / cam_focal_dist);

//     // Project to multiple pixels
//     float size_ratio = max(floor((in_depth / camera_distance) + 0.5), 1.0);
//     gl_PointSize = size_ratio;

//     // Set point position
//     float depth_hint = 0.015 * img_index; // favor image with lower index when depth's match (index should be based on dist)
//     gl_Position = worldViewProjection * vec4(out_azimuth, out_inclination, camera_distance + depth_hint, 1.0);

//     // Pass along texture coordinate and depth
//     texcoord = uv;
//     pt_depth = camera_distance;
// }
// `;

const cdep_vert_src = `
#version 300 es

precision highp float;

#define M_PI 3.1415926535897932384626433832795
#define EPSILON 0.000001

uniform float depth_hint;
uniform vec3 cam_position;
uniform float cam_ipd;
uniform float cam_focal_dist;
uniform mat4 projection;
uniform sampler2D depths;

in vec3 position;
in vec2 uv;

out vec2 texcoord;
out float pt_depth;

void main() {
    // Calculate projected point position (relative to projection sphere center)
    float in_azimuth = position.x;
    float in_inclination = position.y;
    float cam_eye = position.z; // left: +1.0, right: -1.0

    float in_depth = texture(depths, uv).r;
    vec3 pt = vec3(in_depth * cos(in_azimuth) * sin(in_inclination),
                   in_depth * sin(in_azimuth) * sin(in_inclination),
                   in_depth * cos(in_inclination));


    // Backproject to new ODS projection sphere
    // 1) calculate azimuth/inclination to center of projection sphere
    vec3 camera_spherical = cam_position.zxy;
    vec3 vertex_direction = pt - camera_spherical;
    float magnitude = length(vertex_direction);
    float center_azimuth = (abs(vertex_direction.x) < EPSILON && abs(vertex_direction.y) < EPSILON) ?
                           (1.0 - 0.5 * sign(vertex_direction.z)) * M_PI :
                           atan(vertex_direction.y, vertex_direction.x);
    float center_inclination = acos(vertex_direction.z / magnitude);

    // 2) calculate stereo camera location
    float camera_radius = 0.5 * cam_ipd * cos(center_inclination - (M_PI / 2.0));
    float camera_azimuth = center_azimuth + cam_eye * acos(camera_radius / magnitude);
    vec3 camera_pt = vec3(camera_radius * cos(camera_azimuth),
                          camera_radius * sin(camera_azimuth),
                          0.0);

    // 3) project point onto projection sphere
    vec3 camera_to_pt = vertex_direction - camera_pt;
    float camera_distance = length(camera_to_pt);
    vec3 camera_ray = camera_to_pt / camera_distance;
    float proj_sphere_dist = sqrt(cam_focal_dist * cam_focal_dist - camera_radius * camera_radius);
    vec3 proj_sphere_pt = camera_pt + proj_sphere_dist * camera_ray;
    
    // 4) convert projected point to spherical coords
    float out_azimuth = (abs(proj_sphere_pt.x) < EPSILON && abs(proj_sphere_pt.y) < EPSILON) ?
                        (1.0 - 0.5 * sign(proj_sphere_pt.z)) * M_PI :
                        mod(atan(proj_sphere_pt.y, proj_sphere_pt.x), 2.0 * M_PI);
    float out_inclination = acos(proj_sphere_pt.z / cam_focal_dist);

    // Project to multiple pixels
    float size_ratio = in_depth / camera_distance;
    float size_scale = max(size_ratio, 1.0);
    gl_PointSize = size_scale;

    // Set point position
    float stereo_offset_y = (1.0 - (0.5 * (cam_eye + 1.0))) * M_PI;
    gl_Position = projection * vec4(out_azimuth, out_inclination + stereo_offset_y, camera_distance + depth_hint, 1.0);

    texcoord = uv;
    pt_depth = camera_distance;
}
`;

// Fragment Shader source code - render C-DEP to texture
const cdep_frag_src = `
#version 300 es

precision mediump float;

in vec2 texcoord;
in float pt_depth;

uniform sampler2D image;

layout(location = 0) out vec4 FragColor;
layout(location = 1) out float FragDepth;

void main() {
    FragColor = texture(image, texcoord);
    FragDepth = pt_depth;
}
`;

class CdepWebGL extends CdepAbstract {
    constructor(scene, engine) {
        super(scene, engine);

        this.rtt_scene = new Scene(this.engine);

        this.cdep_material = new ShaderMaterial(
            'cdep_shader',
            this.rtt_scene,
            {
                vertexSource: cdep_vert_src,
                fragmentSource: cdep_frag_src
            },
            {
                attributes: ['position', 'uv'],
                uniforms: ['projection', 'cam_position', 'cam_ipd', 'cam_focal_dist', 'depth_hint'],
                samplers: ['image', 'depths']
            }
        );
        this.cdep_material.pointsCloud = true;
        this.cdep_material.pointSize = 50;

        this.camera = new UniversalCamera('ortho_camera', new Vector3(0.0, 0.0, 0.0), this.rtt_scene);
        this.camera.mode = Constants.ORTHOGRAPHIC_CAMERA;
        this.camera.minZ = 0.01;
        this.camera.maxZ = 100.0;
        this.camera.orthoLeft = 2.0 * Math.PI;
        this.camera.orthoRight = 0.0;
        this.camera.orthoBottom = 2.0 * Math.PI;
        this.camera.orthoTop = 0.0;

        this.rgbd_target = null;
    }

    initializeOutputBuffer(width, height) {
        const render_target_options = {
            types: [Constants.TEXTURETYPE_UNSIGNED_BYTE, Constants.TEXTURETYPE_FLOAT],
            formats: [Constants.TEXTUREFORMAT_RGBA, Constants.TEXTUREFORMAT_R],
            samplingModes: [Constants.TEXTURE_BILINEAR_SAMPLINGMODE, Constants.TEXTURE_NEAREST_SAMPLINGMODE],
            generateMipMaps: false,
            targetTypes: [Constants.TEXTURE_2D, Constants.TEXTURE_2D]
        };
        this.rgbd_target = new MultiRenderTarget('out_rgbd', {width: width, height: height * 2}, 2,
                                                 this.rtt_scene, render_target_options);
        this.rgbd_target.activeCamera = this.camera;
        
        
        const point_cloud = this.createPointCloudMesh(width, height);

        this.rgbd_target.setMaterialForRendering(point_cloud, this.cdep_material);
        this.rgbd_target.renderList.push(point_cloud);

        this.rtt_scene.customRenderTargets.push(this.rgbd_target);
    }

    createPointCloudMesh(width, height) {
        const pc = new Mesh('point_cloud', this.rtt_scene);
        const size = width * height * 2;
        let vertex_positions = new Float32Array(size * 3);
        let vertex_texcoords = new Float32Array(size * 2);

        let idx1, idx2, norm_x, norm_y, azimuth, inclination;
        for (let j = 0; j < height; j++) {
            for (let i = 0; i < width; i++) {
                idx1 = j * width + i;
                idx2 = (j + height) * width + i;
                norm_x = (i + 0.5) / width;
                norm_y = (j + 0.5) / height;
                azimuth = 2.0 * Math.PI * (1.0 - norm_x);
                inclination = Math.PI * norm_y;
                // left eye
                vertex_positions[3 * idx1 + 0] = azimuth;
                vertex_positions[3 * idx1 + 1] = inclination;
                vertex_positions[3 * idx1 + 2] = 1.0;
                vertex_texcoords[2 * idx1 + 0] = norm_x;
                vertex_texcoords[2 * idx1 + 1] = norm_y;
                // right eye
                vertex_positions[3 * idx2 + 0] = azimuth;
                vertex_positions[3 * idx2 + 1] = inclination;
                vertex_positions[3 * idx2 + 2] = -1.0;
                vertex_texcoords[2 * idx2 + 0] = norm_x;
                vertex_texcoords[2 * idx2 + 1] = norm_y;
            }
        }

        const vertex_data = new VertexData();
        vertex_data.positions = vertex_positions;
        vertex_data.uvs = vertex_texcoords;
        vertex_data.applyToMesh(pc);

        return pc;
    }

    synthesizeView(view_params) {
        // TODO: render each image
        let depth_hint = 0.0;
        for (let i = 0; i < 1/*this.num_images*/; i++) {
            this.cdep_material.setTexture('image', this.rgba_textures[i]);
            this.cdep_material.setTexture('depths', this.depth_textures[i]); // <- TEST THIS: gl_PointSize

            let relative_cam_position = view_params.synthesized_position.subtract(this.cam_positions[i]);
            this.cdep_material.setVector3('cam_position', relative_cam_position);
            this.cdep_material.setFloat('cam_ipd', view_params.ipd);
            this.cdep_material.setFloat('cam_focal_dist', view_params.focal_dist);
            this.cdep_material.setFloat('depth_hint', depth_hint);

            depth_hint += 0.015;
        }

        // Wait for target to be ready
        while(!this.rgbd_target.isReadyForRendering()) ;
        //console.log('here - rtt ready');

        // Render
        this.rgbd_target.render();
    }

    getRgbdBuffer() {
        return new Promise((resolve, reject) => {
            resolve(this.rgbd_target.textures);
        });
    }

    renderScene() {
        if (this.rgbd_target != null && this.rgbd_target.isReadyForRendering()) {
            //this.rgbd_target.render();
        }
    }
}

export { CdepWebGL };
