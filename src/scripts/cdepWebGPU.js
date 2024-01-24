import { ComputeShader } from '@babylonjs/core/Compute/computeShader';
import { StorageBuffer } from '@babylonjs/core/Buffers/storageBuffer';
import { UniformBuffer} from '@babylonjs/core/Materials/uniformBuffer';
import { RawTexture } from '@babylonjs/core/Materials/Textures/rawTexture';
import { Constants } from '@babylonjs/core/Engines/constants';
import { CdepAbstract } from './cdepAbstract';

// Compute Shader source code - clear RGB-D buffer
const clear_src = `
struct Params {
    dims : vec2<u32>
};

@group(0) @binding(0) var<uniform> params : Params;
@group(0) @binding(1) var<storage,read_write> out_rgbd : array<u32>;

@compute @workgroup_size(8, 8, 1)

fn main(@builtin(global_invocation_id) global_id : vec3<u32>) {
    if (global_id.x < params.dims.x && global_id.y < params.dims.y) {
        let pix_idx : u32 = global_id.y * params.dims.x  + global_id.x;
        out_rgbd[pix_idx] = 0xFFF00000;
    }
}
`;

// Compute Shader source code - render C-DEP to buffer
const cdep_src = `
struct Params {
    camera_position : vec3<f32>,
    camera_ipd : f32,
    camera_focal_dist : f32,
    z_max : f32,
    depth_hint : f32,
    use_xr : u32,
    xr_fovy : f32,
    xr_aspect: f32,
    xr_view_dir : vec3<f32>
};

@group(0) @binding(0) var<uniform> params : Params;
@group(0) @binding(1) var image : texture_2d<f32>;
@group(0) @binding(2) var depths : texture_2d<f32>;
@group(0) @binding(3) var<storage,read_write> out_rgbd : array<atomic<u32>>;

const M_PI = 3.1415926535897932384626433832795;
const EPSILON = 0.000001;

@compute @workgroup_size(8, 8, 1)

fn main(@builtin(global_invocation_id) global_id : vec3<u32>) {
    let dims : vec2<u32> = textureDimensions(image, 0);
    if (global_id.x < dims.x && global_id.y < dims.y) {
        // Calculate projected point position (relative to original projection sphere center)
        let norm_x : f32 = (f32(global_id.x) + 0.5) / f32(dims.x);
        let norm_y : f32 = (f32(global_id.y) + 0.5) / f32(dims.y);
        let in_azimuth : f32 = 2.0 * M_PI * (1.0 - norm_x);
        let in_inclination : f32 = M_PI * norm_y;
        let in_depth : f32 = textureLoad(depths, global_id.xy, 0u).r;
        let pt : vec3<f32> = vec3<f32>(in_depth * cos(in_azimuth) * sin(in_inclination),
                                        in_depth * sin(in_azimuth) * sin(in_inclination),
                                        in_depth * cos(in_inclination));
        

        // Backproject to new ODS projection sphere
        // 1) calculate azimuth/inclination to center of projection sphere
        let camera_spherical : vec3<f32> = params.camera_position.zxy;
        let vertex_direction : vec3<f32> = pt - camera_spherical;
        let magnitude : f32 = length(vertex_direction);
        let center_azimuth : f32 = select(atan2(vertex_direction.y, vertex_direction.x),
                                            (1.0 - 0.5 * sign(vertex_direction.z)) * M_PI,
                                            (abs(vertex_direction.x) < EPSILON && abs(vertex_direction.y) < EPSILON));
        let center_inclination : f32 = acos(vertex_direction.z / magnitude);

        // 2) calculate stereo camera location
        let camera_radius : f32 = 0.5 * params.camera_ipd * cos(center_inclination - (M_PI / 2.0));
        let camera_azimuth_l : f32 = center_azimuth + acos(camera_radius / magnitude); // left:  +
        let camera_azimuth_r : f32 = center_azimuth - acos(camera_radius / magnitude); // right: -
        let camera_pt_l : vec3<f32> = vec3<f32>(camera_radius * cos(camera_azimuth_l),
                                                camera_radius * sin(camera_azimuth_l),
                                                0.0);
        let camera_pt_r : vec3<f32> = vec3<f32>(camera_radius * cos(camera_azimuth_r),
                                                camera_radius * sin(camera_azimuth_r),
                                                0.0);

        // 3) project point onto projection sphere
        let proj_sphere_dist : f32 = sqrt(params.camera_focal_dist * params.camera_focal_dist - camera_radius * camera_radius);
        let camera_to_pt_l : vec3<f32> = vertex_direction - camera_pt_l;
        let camera_distance_l : f32 = length(camera_to_pt_l);
        let camera_ray_l : vec3<f32> = camera_to_pt_l / camera_distance_l;
        let proj_sphere_pt_l : vec3<f32> = camera_pt_l + proj_sphere_dist * camera_ray_l;
        let camera_to_pt_r : vec3<f32> = vertex_direction - camera_pt_r;
        let camera_distance_r : f32 = length(camera_to_pt_r);
        let camera_ray_r : vec3<f32> = camera_to_pt_r / camera_distance_r;
        let proj_sphere_pt_r : vec3<f32> = camera_pt_r + proj_sphere_dist * camera_ray_r;

        // 4) convert projected point to spherical coords
        let out_azimuth_l : f32 = select(fmod(atan2(proj_sphere_pt_l.y, proj_sphere_pt_l.x), (2.0 * M_PI)),
                                            (1.0 - 0.5 * sign(proj_sphere_pt_l.z)) * M_PI,
                                            (abs(proj_sphere_pt_l.x) < EPSILON && abs(proj_sphere_pt_l.y) < EPSILON));
        let out_inclination_l : f32 = acos(proj_sphere_pt_l.z / params.camera_focal_dist);
        let out_azimuth_r : f32 = select(fmod(atan2(proj_sphere_pt_r.y, proj_sphere_pt_r.x), (2.0 * M_PI)),
                                            (1.0 - 0.5 * sign(proj_sphere_pt_r.z)) * M_PI,
                                            (abs(proj_sphere_pt_r.x) < EPSILON && abs(proj_sphere_pt_r.y) < EPSILON));
        let out_inclination_r : f32 = acos(proj_sphere_pt_r.z / params.camera_focal_dist);

        // Check if point is visible (XR only)
        var visible_l : bool = true;
        var visible_r : bool = true;
        if (params.use_xr != 0) {
            let diag_aspect : f32 = sqrt(params.xr_aspect * params.xr_aspect + 1.0);
            let vertical_fov : f32 = 0.5 * params.xr_fovy + 0.005;
            let diagonal_fov : f32 = atan(tan(vertical_fov) * diag_aspect);
            let point_dir_l : vec3<f32> = normalize(proj_sphere_pt_l.yzx);
            visible_l = dot(point_dir_l, params.xr_view_dir) >= cos(diagonal_fov);
            let point_dir_r : vec3<f32> = normalize(proj_sphere_pt_r.yzx);
            visible_r = dot(point_dir_r, params.xr_view_dir) >= cos(diagonal_fov);
        }

        // Write pixel and depth to output textures
        let color : vec4<f32> = textureLoad(image, global_id.xy, 0u);
        let dims_y : f32 = f32(dims.y);
        let in_area : f32 = sphericalPixelSize(in_inclination, dims_y);

        if (visible_l) {
            // pixel position
            let out_x_l : u32 = u32(round(f32(dims.x) * ((2.0 * M_PI) - out_azimuth_l) / (2.0 * M_PI)));
            let out_y_l : u32 = u32(round(f32(dims.y) * ((M_PI - out_inclination_l) / M_PI))) + dims.y;

            // pack RGB-D into uint32
            let dist_norm_l = (camera_distance_l + params.depth_hint) / params.z_max;
            let rgbd_l : u32 = packRgb776d12(color.rgb, dist_norm_l);

            // size of point (potentially multiple pixels)
            let sphere_area_ratio_l : f32 = in_area / sphericalPixelSize(out_inclination_l, dims_y);
            let distance_ratio_l : f32 = in_depth / camera_distance_l;
            let size_ratio_l : f32 = round(clamp(sphere_area_ratio_l * distance_ratio_l, 1.0, 7.0));

            // write RGB-D data to output buffer
            let px_start_l : i32 = i32(floor(0.5 * size_ratio_l));
            let px_end_l : i32 = i32(ceil(0.5 * size_ratio_l));
            for (var j : i32 = -px_start_l; j < px_end_l; j++) {
                let f_y : i32 = i32(out_y_l) + j;
                if (f_y >= i32(dims.y) && f_y < 2 * i32(dims.y)) {
                    for (var i : i32 = -px_start_l; i <= px_end_l; i++) {
                        let f_x : i32 = i32(out_x_l) + i;
                        if (f_x >= 0 && f_x < i32(dims.x)) {
                            let pix_idx_l : u32 = u32(f_y) * dims.x  + u32(f_x);
                            atomicMin(&out_rgbd[pix_idx_l], rgbd_l);
                        }
                    }
                }
            }
        }

        if (visible_r) {
            // pixel position
            let out_x_r : u32 = u32(round(f32(dims.x) * ((2.0 * M_PI) - out_azimuth_r) / (2.0 * M_PI)));
            let out_y_r : u32 = u32(round(f32(dims.y) * ((M_PI - out_inclination_r) / M_PI)));

            // pack RGB-D into uint32
            let dist_norm_r = (camera_distance_r + params.depth_hint) / params.z_max;
            let rgbd_r : u32 = packRgb776d12(color.rgb, dist_norm_r);

            // size of point (potentially multiple pixels)
            let sphere_area_ratio_r : f32 = in_area / sphericalPixelSize(out_inclination_r, dims_y);
            let distance_ratio_r : f32 = in_depth / camera_distance_r;
            let size_ratio_r : f32 = round(clamp(sphere_area_ratio_r * distance_ratio_r, 1.0, 7.0));

            // write RGB-D data to output buffer
            let px_start_r : i32 = i32(floor(0.5 * size_ratio_r));
            let px_end_r : i32 = i32(ceil(0.5 * size_ratio_r));
            for (var j : i32 = -px_start_r; j < px_end_r; j++) {
                let f_y : i32 = i32(out_y_r) + j;
                if (f_y >= 0 && f_y < i32(dims.y)) {
                    for (var i : i32 = -px_start_r; i <= px_end_r; i++) {
                        let f_x : i32 = i32(out_x_r) + i;
                        if (f_x >= 0 && f_x < i32(dims.x)) {
                            let pix_idx_r : u32 = u32(f_y) * dims.x  + u32(f_x);
                            atomicMin(&out_rgbd[pix_idx_r], rgbd_r);
                        }
                    }
                }
            }
        }
    }
}

fn fmod(num : f32, div : f32) -> f32 {
    return num - div * floor(num / div);
}

fn packRgb776d12(rgb : vec3<f32>, depth : f32) -> u32 {
    let r7 : u32 = u32(rgb.r * 127.0);
    let g7 : u32 = u32(rgb.g * 127.0);
    let b6 : u32 = u32(rgb.b * 63.0);
    let d12 : u32 = u32(depth * 4095.0);
    return ((d12 & 0xFFF) << 20) | ((b6 & 0x3F) << 14) | ((g7 & 0x7F) << 7) | (r7 & 0x7F);
}

fn sphericalPixelSize(inclination : f32, dims_y : f32) -> f32 {
    let latitude : f32 = inclination - (0.5 * M_PI);
    let delta_lat : f32 = 0.5 * M_PI / dims_y;
    let lat1 : f32 = latitude - delta_lat;
    let lat2 : f32 = latitude + delta_lat;
    return sin(lat2) - sin(lat1);
}
`;

// Compute Shader source code - clear RGB-D buffer
const rgbd_to_texture_src = `
struct Params {
    dims : vec2<u32>,
    z_max : f32
};

@group(0) @binding(0) var<uniform> params : Params;
@group(0) @binding(1) var<storage,read> rgbd : array<u32>;
@group(0) @binding(2) var out_rgba : texture_storage_2d<rgba8unorm,write>;
@group(0) @binding(3) var out_depth : texture_storage_2d<r32float,write>;

@compute @workgroup_size(8, 8, 1)

fn main(@builtin(global_invocation_id) global_id : vec3<u32>) {
    if (global_id.x < params.dims.x && global_id.y < params.dims.y) {
        let pix_idx : u32 = (params.dims.y - global_id.y - 1) * params.dims.x  + global_id.x;
        let rgba : vec4<f32> = unpackColorRgb776d12(rgbd[pix_idx]);
        let depth : f32 = unpackDepthRgb776d12(rgbd[pix_idx]);
        textureStore(out_rgba, global_id.xy, rgba);
        textureStore(out_depth, global_id.xy, vec4<f32>(depth, 0.0, 0.0, 1.0));
    }
}

fn unpackColorRgb776d12(rgb776d12 : u32) -> vec4<f32> {
    return vec4<f32>(f32(rgb776d12 & 0x7F) / 128.0, f32((rgb776d12 >> 7) & 0x7F) / 128.0, f32((rgb776d12 >> 14) & 0x3F) / 64.0, 1.0);
}

fn unpackDepthRgb776d12(rgb776d12 : u32) -> f32 {
    return params.z_max * f32(rgb776d12 >> 20) / 4095.0;
}
`;

class CdepWebGPU extends CdepAbstract {
    constructor(scene, engine) {
        super(scene, engine);

        const clear_cs_info = {
            bindingsMapping: {
                'params': { group: 0, binding: 0 },
                'out_rgbd': { group: 0, binding: 1 }
            }
        };
        this.clear_cs = new ComputeShader('clear_compute', this.engine, {computeSource: clear_src}, clear_cs_info);
    
        const cdep_cs_info = {
            bindingsMapping: {
                'params': { group: 0, binding: 0 },
                'image': { group: 0, binding: 1 },
                'depths': { group: 0, binding: 2 },
                'out_rgbd': { group: 0, binding: 3 }
            }
        };
        this.cdep_cs = new ComputeShader('cdep_compute', this.engine, {computeSource: cdep_src}, cdep_cs_info);

        const rgbd_to_texture_cs_info = {
            bindingsMapping: {
                'params': { group: 0, binding: 0 },
                'rgbd': { group: 0, binding: 1 },
                'out_rgba': { group: 0, binding: 2 },
                'out_depth': { group: 0, binding: 3 }
            }
        };
        this.rgbd_to_texture_cs = new ComputeShader('rgbd_to_texture_compute', this.engine, {computeSource: rgbd_to_texture_src},
                                                    rgbd_to_texture_cs_info);

        this.clear_params = new UniformBuffer(this.engine, undefined, false, 'clear_buffer');
        this.clear_params.addUniform('dims', 2);

        this.params = new UniformBuffer(this.engine, undefined, false, 'cdep_buffer');
        this.params.addUniform('camera_position', 3);
        this.params.addUniform('camera_ipd', 1);
        this.params.addUniform('camera_focal_dist', 1);
        this.params.addUniform('z_max', 1);
        this.params.addUniform('depth_hint', 1);
        this.params.addUniform('use_xr', 1);
        this.params.addUniform('xr_fovy', 1);
        this.params.addUniform('xr_aspect', 1);
        this.params.addUniform('xr_view_dir', 3);

        this.tex_params = new UniformBuffer(this.engine, undefined, false, 'rgba_to_texture_buffer');
        this.tex_params.addUniform('dims', 2);
        this.tex_params.addUniform('z_max', 1);

        this.rgbd_buffer = null;
        this.rgbd_textures = [];
    }

    initializeOutputBuffer(width, height) {
        this.rgbd_buffer = new StorageBuffer(this.engine, width * height * 8);
        this.clear_params.updateUInt2('dims', width, height * 2);
        this.clear_params.update();
        this.clear_cs.setUniformBuffer('params', this.clear_params);
        this.clear_cs.setStorageBuffer('out_rgbd', this.rgbd_buffer);
        this.cdep_cs.setStorageBuffer('out_rgbd', this.rgbd_buffer);
        this.tex_params.updateUInt2('dims', width, height * 2);

        let rgba_texture = new RawTexture(null, width, height * 2, Constants.TEXTUREFORMAT_RGBA, this.scene, false, false,
                                          Constants.TEXTURE_BILINEAR_SAMPLINGMODE, Constants.TEXTURETYPE_UNSIGNED_BYTE,
                                          Constants.TEXTURE_CREATIONFLAG_STORAGE);
        let depth_texture = new RawTexture(null, width, height * 2, Constants.TEXTUREFORMAT_R, this.scene, false, false,
                                           Constants.TEXTURE_NEAREST_SAMPLINGMODE, Constants.TEXTURETYPE_FLOAT,
                                           Constants.TEXTURE_CREATIONFLAG_STORAGE);
        this.rgbd_textures = [rgba_texture, depth_texture];
        this.rgbd_to_texture_cs.setStorageBuffer('rgbd', this.rgbd_buffer);
        this.rgbd_to_texture_cs.setTexture('out_rgba', this.rgbd_textures[0], false);
        this.rgbd_to_texture_cs.setTexture('out_depth', this.rgbd_textures[1], false);
    }

    synthesizeView(view_params) {
        const workgroup_size = [8, 8];
        let n_groups_x = Math.ceil(this.image_dims.width / workgroup_size[0]);
        let n_groups_y = Math.ceil(this.image_dims.height / workgroup_size[1]);

        // Clear output buffer
        this.clear_cs.dispatch(n_groups_x, n_groups_y * 2, 1);

        // Synthesize view
        let depth_hint = 0.0;
        let use_xr = (view_params.hasOwnProperty('xr_fovy') &&
                      view_params.hasOwnProperty('xr_aspect') &&
                      view_params.hasOwnProperty('xr_view_dir')) ? 1 : 0;
        let views = this.determineViews(view_params.synthesized_position, view_params.max_views);
        for (let i = 0; i < views.length; i++) {
            let idx = views[i];
            this.cdep_cs.setTexture('image', this.rgba_textures[idx], false);
            this.cdep_cs.setTexture('depths', this.depth_textures[idx], false);

            let relative_cam_position = view_params.synthesized_position.subtract(this.cam_positions[idx]);
            this.params.updateVector3('camera_position', relative_cam_position);
            this.params.updateFloat('camera_ipd', view_params.ipd);
            this.params.updateFloat('camera_focal_dist', view_params.focal_dist);
            this.params.updateFloat('z_max', view_params.z_max);
            this.params.updateFloat('depth_hint', depth_hint);
            this.params.updateUInt('use_xr', use_xr);
            if (use_xr > 0) {
                this.params.updateFloat('xr_fovy', view_params.xr_fovy);
                this.params.updateFloat('xr_aspect', view_params.xr_aspect);
                this.params.updateVector3('xr_view_dir', view_params.xr_view_dir);
            }
            this.params.update();
            this.cdep_cs.setUniformBuffer('params', this.params);
            this.cdep_cs.dispatch(n_groups_x, n_groups_y, 1);

            depth_hint += 0.015;
        }

        // Convert RGB-D buffer to textures
        this.tex_params.updateFloat('z_max', view_params.z_max);
        this.tex_params.update();
        this.rgbd_to_texture_cs.setUniformBuffer('params', this.tex_params);
        this.rgbd_to_texture_cs.dispatch(n_groups_x, n_groups_y * 2, 1);
    }

    getRgbdTextures() {
        return this.rgbd_textures;
    }

    readRgbdTextures(options) {
        options ??= {};
        let x = options ? options.buffer : undefined;
        let y = options ? options.buffer : undefined;
        let w = options ? options.buffer : undefined;
        let h = options ? options.buffer : undefined;
        return this.rgbd_textures[0].readPixels(undefined, undefined, options.buffer, undefined, undefined,
                                                options.x, options.y, options.w, options.h);
    }
}

export { CdepWebGPU };
