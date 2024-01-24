import { Scene } from '@babylonjs/core/scene';
import { UniversalCamera } from '@babylonjs/core/Cameras/universalCamera';
import { Vector3 } from '@babylonjs/core/Maths/math.vector';
import { Color3 } from '@babylonjs/core/Maths/math.color';
import { ShaderMaterial } from '@babylonjs/core/Materials/shaderMaterial';
import { MultiRenderTarget } from '@babylonjs/core/Materials/Textures/multiRenderTarget';
import { Mesh } from '@babylonjs/core/Meshes/mesh';
import { VertexData } from '@babylonjs/core/Meshes/mesh.vertexData';
import { Constants } from '@babylonjs/core/Engines/constants';

import { CdepAbstract } from './cdepAbstract';

// Vertex Shader source code - render C-DEP to texture
const cdep_vert_src = `
#version 300 es

precision highp float;

#define M_PI 3.1415926535897932384626433832795
#define EPSILON 0.000001

uniform float depth_hint;
uniform vec3 cam_position;
uniform float cam_ipd;
uniform float cam_focal_dist;
uniform float use_xr;
uniform float xr_fovy;
uniform float xr_aspect;
uniform vec3 xr_view_dir;
uniform mat4 projection;
uniform sampler2D depths;

in vec3 position;
in vec2 uv;

out vec2 texcoord;
out float pt_depth;

float sphericalPixelSize(float inclination, float dims_y);

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

    // Check if point is visible (XR only)
    float diag_aspect = sqrt(xr_aspect * xr_aspect + 1.0);
    float vertical_fov = 0.5 * xr_fovy + 0.005;
    float diagonal_fov = atan(tan(vertical_fov) * diag_aspect);
    vec3 point_dir = normalize(proj_sphere_pt.yzx);
    // discard point (move outside view volume) if angle between point direction and view diretion > diagonal FOV
    out_azimuth -= use_xr * float(dot(point_dir, xr_view_dir) < cos(diagonal_fov)) * 10.0;

    // Project to multiple pixels
    float dims_y = float(textureSize(depths, 0).y);
    float in_area = sphericalPixelSize(in_inclination, dims_y);
    float out_area = sphericalPixelSize(out_inclination, dims_y);
    float sphere_area_ratio = in_area / out_area;
    float distance_ratio = in_depth / camera_distance;
    float size_ratio = clamp(sphere_area_ratio * distance_ratio, 1.0, 7.0);

    //float size_ratio = clamp(in_depth / camera_distance, 1.0, 7.0);
    
    gl_PointSize = size_ratio;

    // Set point position
    float stereo_offset_y = (1.0 - (0.5 * (cam_eye + 1.0))) * M_PI;
    gl_Position = projection * vec4(out_azimuth, out_inclination + stereo_offset_y, camera_distance + depth_hint, 1.0);

    texcoord = uv;
    pt_depth = camera_distance;
}

float sphericalPixelSize(float inclination, float dims_y) {
    float latitude = inclination - (0.5 * M_PI);
    float delta_lat = 0.5 * M_PI / dims_y;
    float lat1 = latitude - delta_lat;
    float lat2 = latitude + delta_lat;
    return sin(lat2) - sin(lat1);
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
        this.rtt_scene.clearColor = new Color3(0.0, 0.0, 0.0);
        this.rtt_scene.skipPointerMovePicking = true;

        const cdep_material = new ShaderMaterial(
            'cdep_shader',
            this.rtt_scene,
            {
                vertexSource: cdep_vert_src,
                fragmentSource: cdep_frag_src
            },
            {
                attributes: ['position', 'uv'],
                uniforms: ['projection', 'cam_position', 'cam_ipd', 'cam_focal_dist', 'depth_hint',
                           'use_xr', 'xf_fovy', 'xr_aspect', 'xr_view_dir'],
                samplers: ['image', 'depths']
            }
        );
        cdep_material.pointsCloud = true;
        cdep_material.pointSize = 1;
        this.cdep_materials = [cdep_material];

        const scene_camera = new UniversalCamera('rtt_scene_camera', new Vector3(0.0, 0.0, 0.0), this.rtt_scene);
        scene_camera.layerMask = 0x2;
        this.rtt_scene.activeCamera = scene_camera;


        this.camera = new UniversalCamera('ortho_camera', new Vector3(0.0, 0.0, 0.0), this.rtt_scene);
        this.camera.mode = Constants.ORTHOGRAPHIC_CAMERA;
        this.camera.minZ = 0.01;
        this.camera.maxZ = 100.0;
        this.camera.orthoLeft = 2.0 * Math.PI;
        this.camera.orthoRight = 0.0;
        this.camera.orthoBottom = 0.0;
        this.camera.orthoTop = 2.0 * Math.PI;
        this.camera.layerMask = 0x1;

        //this.rtt_scene.activeCamera = scene_camera;

        this.point_cloud_meshes = [];
        this.rgbd_target = null;
        this.render_list = [];
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
        this.rgbd_target.getCustomRenderList = (layer, render_list, length) => {
            return this.render_list;
        };
        
        this.cdep_materials[0].setTexture('image', this.rgba_textures[0]);
        this.cdep_materials[0].setTexture('depths', this.depth_textures[0]);
        
        const point_cloud = this.createPointCloudMesh(width, height);
        point_cloud.layerMask = 0x1;
        point_cloud.material = this.cdep_materials[0];
        this.point_cloud_meshes.push(point_cloud);

        for (let i = 1; i < this.num_images; i++) {
            const cdep_material_clone = this.cdep_materials[0].clone();
            cdep_material_clone.setTexture('image', this.rgba_textures[i]);
            cdep_material_clone.setTexture('depths', this.depth_textures[i]);
            this.cdep_materials.push(cdep_material_clone);

            const point_cloud_clone = point_cloud.clone('point_cloud_' + i);
            point_cloud_clone.layerMask = 0x1;
            point_cloud_clone.material = cdep_material_clone;
            this.point_cloud_meshes.push(point_cloud_clone);
        }

        this.rtt_scene.customRenderTargets.push(this.rgbd_target);

        while (!this.rgbd_target.isReadyForRendering()) ;
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
        pc.freezeWorldMatrix();
        pc.doNotSyncBoundingInfo = true;
        pc.isPickable = false;

        return pc;
    }

    synthesizeView(view_params) {
        // Render each image
        let i;
        let depth_hint = 0.0;
        let use_xr = (view_params.hasOwnProperty('xr_fovy') &&
                      view_params.hasOwnProperty('xr_aspect') &&
                      view_params.hasOwnProperty('xr_view_dir')) ? 1.0 : 0.0;
        let views = this.determineViews(view_params.synthesized_position, view_params.max_views);
        this.render_list = [];
        for (i = 0; i < views.length; i++) {
            let idx = views[i];
            this.render_list.push(this.point_cloud_meshes[idx]);
            let relative_cam_position = view_params.synthesized_position.subtract(this.cam_positions[idx]);
            this.cdep_materials[idx].setVector3('cam_position', relative_cam_position);
            this.cdep_materials[idx].setFloat('cam_ipd', view_params.ipd);
            this.cdep_materials[idx].setFloat('cam_focal_dist', view_params.focal_dist);
            this.cdep_materials[idx].setFloat('depth_hint', depth_hint);
            this.cdep_materials[idx].setFloat('use_xr', use_xr);
            if (use_xr > 0.0) {
                this.cdep_materials[idx].setFloat('xr_fovy', view_params.xr_fovy);
                this.cdep_materials[idx].setFloat('xr_aspect', view_params.xr_aspect);
                this.cdep_materials[idx].setVector3('xr_view_dir', view_params.xr_view_dir);
            }
            depth_hint += 0.015;
        }

        // Render
        //this.rgbd_target.render();
        this.rtt_scene.render();
    }

    getRgbdTextures() {
        return this.rgbd_target.textures;
    }

    readRgbdTextures() {
        return this.rgbd_target.textures[0].readPixels();
    }
}

export { CdepWebGL };
