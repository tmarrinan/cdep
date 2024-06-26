<script setup>
import { Engine } from '@babylonjs/core/Engines/engine';
import { WebGPUEngine } from '@babylonjs/core/Engines/webgpuEngine';
import { Scene } from '@babylonjs/core/scene';
import { Color3 } from '@babylonjs/core/Maths/math.color';
import { Vector3 } from '@babylonjs/core/Maths/math.vector';
import { Ray } from '@babylonjs/core/Culling/ray';
import { UniversalCamera } from '@babylonjs/core/Cameras/universalCamera';
import { HemisphericLight } from '@babylonjs/core/Lights/hemisphericLight';
import { PhotoDome } from '@babylonjs/core/Helpers/photoDome'
import { CreateGround } from '@babylonjs/core/Meshes/Builders/groundBuilder';
import { GridMaterial } from '@babylonjs/materials/grid/gridMaterial';

import { WebXRDefaultExperience } from '@babylonjs/core/XR/webXRDefaultExperience';
import { WebXRState } from '@babylonjs/core/XR/webXRTypes';

import { Inspector } from '@babylonjs/inspector';
import { Tools } from '@babylonjs/core/Misc/tools';

import { CdepWebGPU } from './scripts/cdepWebGPU';
import { CdepWebGL } from './scripts/cdepWebGL';

// Must import for proper functionality with extensions such as RawTexture 
//import * as WEBGPU_EXT from '@babylonjs/core/Engines/WebGPU/Extensions/index.js';
import '@babylonjs/core/Engines/WebGPU/Extensions/index';

// Must import to avoid `sceneToRenderTo.beginAnimation is not a function` for WebXR
import '@babylonjs/core/Animations/animatable';

// Must import for loading controller models from WebXR registry
import '@babylonjs/loaders/glTF';
import '@babylonjs/core/Materials/Node/Blocks';

import { reactive, ref, onMounted } from 'vue';

const BASE_URL = import.meta.env.BASE_URL || '/';

let babylon = {
    canvas: null,
    internal: null,
    engine: null,
    scene: null,
    camera: null,
    active_camera: null,
    projection: null,
    user_height: 1.7
};

function createScene(render_type) {
    if (render_type === 'WebGPU') {
        console.log('Running WebGPU w/ Compute Shaders');
    }
    else {
        console.log('Falling back to WebGL2');
    }

    // Create a scene
    babylon.scene = new Scene(babylon.engine);
    babylon.scene.clearColor = new Color3(0.1, 0.1, 0.1);
    babylon.scene.skipPointerMovePicking = true;

    Inspector.Show(babylon.scene, {embedMode: true});
    document.getElementById('embed-host').style = 'left: 0px; right: unset;';

    // Create a camera
    // babylon.camera = new ArcRotateCamera('camera', -Math.PI / 2.0,  3.0 * Math.PI / 8.0, 10.0, 
    //                                      new Vector3(0.0, 2.5, 0.0), babylon.scene);
    // babylon.camera.wheelPrecision = 30;
    const desktop_user_height = babylon.user_height;
    babylon.camera = new UniversalCamera('camera', new Vector3(0.0, desktop_user_height, 0.0), babylon.scene);
    babylon.camera.fov = 45.0 * Math.PI / 180.0;
    babylon.camera.rotation.x = 22.5 * Math.PI / 180.0;
    babylon.camera.rotation.y = -15.0 * Math.PI / 180.0;
    babylon.camera.speed = 0.1;
    babylon.camera.attachControl(babylon.canvas, true);
    babylon.active_camera = babylon.camera;

    babylon.projection = getCameraFovAspect(babylon.camera);
    
    // Create a light
    const light = new HemisphericLight('light', new Vector3(0, 1, 0), babylon.scene);
    light.intensity = 1.0;

    // Create a plane
    // const cdep_mat = new StandardMaterial('cdep_mat');
    // cdep_mat.diffuseColor = new Color3(0.0, 0.0, 0.0);
    // cdep_mat.specularColor = new Color3(0.0, 0.0, 0.0);
    // cdep_mat.emissiveColor = new Color3(0.0, 0.0, 0.0);

    // const plane = CreatePlane('plane', {width: 5, height: 5}, babylon.scene);
    // plane.material = cdep_mat;
    // plane.position.y = 2.5;

    // Create photo dome for 360 panoramas
    const photo_dome = new PhotoDome('pano360', BASE_URL + 'images/photodome_start.png',
                                     {resolution: 32, size: 1000}, babylon.scene);
    photo_dome.imageMode = PhotoDome.MODE_TOPBOTTOM;
    // const photo_dome = new PhotoDome('pano360', BASE_URL + 'images/aldrich/3k/aldrich_3k_cam7.jpg',
    //                                  {resolution: 32, size: 1000}, babylon.scene);
    // photo_dome.imageMode = PhotoDome.MODE_MONOSCOPIC;
    photo_dome.rotation.y = 0.5 * Math.PI;

    // C-DEP WebGPU / WebGL2
    let cdep_compute = (render_type === 'WebGPU') ? new CdepWebGPU(babylon.scene, babylon.engine) :
                                                    new CdepWebGL(babylon.scene, babylon.engine);
                                                    (-0.385, 1.535, -0.230)
    
    // let panoramas = [
    //     {
    //         color: BASE_URL + 'images/aldrich/3k/aldrich_3k_cam1.jpg',
    //         depth: BASE_URL + 'images/aldrich/3k/aldrich_3k_cam1.depth',
    //         camera_position: new Vector3(0.04755, 1.61014, -0.476002)
    //     },    
    //     {
    //         color: BASE_URL + 'images/aldrich/3k/aldrich_3k_cam2.jpg',
    //         depth: BASE_URL + 'images/aldrich/3k/aldrich_3k_cam2.depth',
    //         camera_position: new Vector3(-1.19718, 1.61388, -1.30315)
    //     },
    //     {
    //         color: BASE_URL + 'images/aldrich/3k/aldrich_3k_cam3.jpg',
    //         depth: BASE_URL + 'images/aldrich/3k/aldrich_3k_cam3.depth',
    //         camera_position: new Vector3(-0.987221, 1.60287, -0.663748)
    //     },
    //     {
    //         color: BASE_URL + 'images/aldrich/3k/aldrich_3k_cam4.jpg',
    //         depth: BASE_URL + 'images/aldrich/3k/aldrich_3k_cam4.depth',
    //         camera_position: new Vector3(-0.165127, 1.61669, -0.880811)
    //     },    
    //     {
    //         color: BASE_URL + 'images/aldrich/3k/aldrich_3k_cam5.jpg',
    //         depth: BASE_URL + 'images/aldrich/3k/aldrich_3k_cam5.depth',
    //         camera_position: new Vector3(-0.380946, 1.60925, -0.682357)
    //     },
    //     {
    //         color: BASE_URL + 'images/aldrich/3k/aldrich_3k_cam6.jpg',
    //         depth: BASE_URL + 'images/aldrich/3k/aldrich_3k_cam6.depth',
    //         camera_position: new Vector3(-0.57779, 1.61738, -1.09355)
    //     }
    //     // cam 7 = (-0.784444, 1.60974, -0.876628)
    // ]
    let panoramas = [
        {
            color: BASE_URL + 'images/aldrich/6k/aldrich_6k_cam1.jpg',
            depth: BASE_URL + 'images/aldrich/6k/aldrich_6k_cam1.depth',
            camera_position: new Vector3(0.039645, 1.61246, -0.48015),
            y_rotation: 0.89 * Math.PI / 180.0
        },
        {
            color: BASE_URL + 'images/aldrich/6k/aldrich_6k_cam2.jpg',
            depth: BASE_URL + 'images/aldrich/6k/aldrich_6k_cam2.depth',
            camera_position: new Vector3(-1.18642, 1.61615, -1.29489),
            y_rotation: 1.44 * Math.PI / 180.0
        },
        {
            color: BASE_URL + 'images/aldrich/6k/aldrich_6k_cam3.jpg',
            depth: BASE_URL + 'images/aldrich/6k/aldrich_6k_cam3.depth',
            camera_position: new Vector3(-0.979605, 1.6053, -0.66508),
            y_rotation: -0.05 * Math.PI / 180.0
        },
        {
            color: BASE_URL + 'images/aldrich/6k/aldrich_6k_cam4.jpg',
            depth: BASE_URL + 'images/aldrich/6k/aldrich_6k_cam4.depth',
            camera_position: new Vector3(-0.169842, 1.61891, -0.878886),
            y_rotation: 0.69 * Math.PI / 180.0
        },
        {
            color: BASE_URL + 'images/aldrich/6k/aldrich_6k_cam5.jpg',
            depth: BASE_URL + 'images/aldrich/6k/aldrich_6k_cam5.depth',
            camera_position: new Vector3(-0.382423, 1.61159, -0.68341),
            y_rotation: 0.79 * Math.PI / 180.0
        },
        {
            color: BASE_URL + 'images/aldrich/6k/aldrich_6k_cam6.jpg',
            depth: BASE_URL + 'images/aldrich/6k/aldrich_6k_cam6.depth',
            camera_position: new Vector3(-0.576315, 1.61959, -1.08843),
            y_rotation: 0.60 * Math.PI / 180.0
        }
        // cam 7 = (-0.779869, 1.61206, -0.874766)
    ];
    
    /*let panoramas = [
        {
            color: BASE_URL + 'images/office/4k/office_ods_cdep_4k_camera_1.png',
            depth: BASE_URL + 'images/office/4k/office_ods_cdep_4k_camera_1.depth',
            camera_position: new Vector3(-0.35, 1.85, 0.55)
        },
        {
            color: BASE_URL + 'images/office/4k/office_ods_cdep_4k_camera_2.png',
            depth: BASE_URL + 'images/office/4k/office_ods_cdep_4k_camera_2.depth',
            camera_position: new Vector3( 0.35, 1.55, 0.90)
        },
        {
            color: BASE_URL + 'images/office/4k/office_ods_cdep_4k_camera_3.png',
            depth: BASE_URL + 'images/office/4k/office_ods_cdep_4k_camera_3.depth',
            camera_position: new Vector3(-0.10, 1.75, 0.85)
        },
        {
            color: BASE_URL + 'images/office/4k/office_ods_cdep_4k_camera_4.png',
            depth: BASE_URL + 'images/office/4k/office_ods_cdep_4k_camera_4.depth',
            camera_position: new Vector3( 0.25, 1.70, 0.60)
        },
        {
            color: BASE_URL + 'images/office/4k/office_ods_cdep_4k_camera_5.png',
            depth: BASE_URL + 'images/office/4k/office_ods_cdep_4k_camera_5.depth',
            camera_position: new Vector3(-0.30, 1.67, 0.75)
        },
        {
            color: BASE_URL + 'images/office/4k/office_ods_cdep_4k_camera_6.png',
            depth: BASE_URL + 'images/office/4k/office_ods_cdep_4k_camera_6.depth',
            camera_position: new Vector3(-0.20, 1.60, 0.70)
        },
        {
            color: BASE_URL + 'images/office/4k/office_ods_cdep_4k_camera_7.png',
            depth: BASE_URL + 'images/office/4k/office_ods_cdep_4k_camera_7.depth',
            camera_position: new Vector3( 0.15, 1.78, 0.57)
        },
        {
            color: BASE_URL + 'images/office/4k/office_ods_cdep_4k_camera_8.png',
            depth: BASE_URL + 'images/office/4k/office_ods_cdep_4k_camera_8.depth',
            camera_position: new Vector3( 0.05, 1.82, 0.87)
        }
    ];*/

    // let panoramas = [
    //     {
    //         color: BASE_URL + 'images/spheres/4k/spheres_ods_cdep_4k_camera_1.png',
    //         depth: BASE_URL + 'images/spheres/4k/spheres_ods_cdep_4k_camera_1.depth',
    //         camera_position: new Vector3(-0.35, 1.85, -0.175)
    //     },
    //     {
    //         color: BASE_URL + 'images/spheres/4k/spheres_ods_cdep_4k_camera_2.png',
    //         depth: BASE_URL + 'images/spheres/4k/spheres_ods_cdep_4k_camera_2.depth',
    //         camera_position: new Vector3( 0.35, 1.55,  0.175)
    //     },
    //     {
    //         color: BASE_URL + 'images/spheres/4k/spheres_ods_cdep_4k_camera_3.png',
    //         depth: BASE_URL + 'images/spheres/4k/spheres_ods_cdep_4k_camera_3.depth',
    //         camera_position: new Vector3(-0.10, 1.75,  0.125)
    //     },
    //     {
    //         color: BASE_URL + 'images/spheres/4k/spheres_ods_cdep_4k_camera_4.png',
    //         depth: BASE_URL + 'images/spheres/4k/spheres_ods_cdep_4k_camera_4.depth',
    //         camera_position: new Vector3( 0.25, 1.70, -0.125)
    //     },
    //     {
    //         color: BASE_URL + 'images/spheres/4k/spheres_ods_cdep_4k_camera_5.png',
    //         depth: BASE_URL + 'images/spheres/4k/spheres_ods_cdep_4k_camera_5.depth',
    //         camera_position: new Vector3(-0.30, 1.67,  0.025)
    //     },
    //     {
    //         color: BASE_URL + 'images/spheres/4k/spheres_ods_cdep_4k_camera_6.png',
    //         depth: BASE_URL + 'images/spheres/4k/spheres_ods_cdep_4k_camera_6.depth',
    //         camera_position: new Vector3(-0.20, 1.60, -0.025)
    //     },
    //     {
    //         color: BASE_URL + 'images/spheres/4k/spheres_ods_cdep_4k_camera_7.png',
    //         depth: BASE_URL + 'images/spheres/4k/spheres_ods_cdep_4k_camera_7.depth',
    //         camera_position: new Vector3( 0.15, 1.78, -0.155)
    //     },
    //     {
    //         color: BASE_URL + 'images/spheres/4k/spheres_ods_cdep_4k_camera_8.png',
    //         depth: BASE_URL + 'images/spheres/4k/spheres_ods_cdep_4k_camera_8.depth',
    //         camera_position: new Vector3( 0.05, 1.82,  0.145)
    //     }
    // ];

    cdep_compute.initializePanoramaCollection(panoramas)
    .then((image_dims) => {
        console.log('C-DEP initialized', image_dims, cdep_compute.isReady());

        /*
        // Redner performance test
        let num_compute = 400;
        let time = 0.0;
        let pixel_buffer = new Uint8Array(256);
        let center_pos = new Vector3(0.0, 1.70, 0.725);
        let positions = [
            new Vector3( 0.000000,  0.000000,  0.000000), // dummy
            new Vector3( 0.317500,  0.150000,  0.000000),
            new Vector3( 0.224506,  0.129904,  0.142500),
            new Vector3( 0.000000,  0.075000,  0.000000),
            new Vector3(-0.224506,  0.000000, -0.142500),
            new Vector3(-0.317500, -0.075000,  0.000000),
            new Vector3(-0.224506, -0.129904,  0.142500),
            new Vector3( 0.000000, -0.150000,  0.000000),
            new Vector3( 0.224506, -0.129904, -0.142500)
        ];
        let view_params = {
            synthesized_position: null,
            max_views: 8,
            ipd: 0.065,
            focal_dist: 1.95,
            z_max: 12.0//,
            //xr_fovy: 60 * Math.PI / 180.0,
            //xr_aspect: 1.0,
            //xr_view_dir: new Vector3(0.0, 0.0, 1.0)
        };


        let start_t = performance.now();

        for (let i = 0; i < num_compute; i++) {
            //let animation_pos = new Vector3(0.3175 * Math.cos(0.5 * time), 0.15 * Math.cos(0.333333 * time), 0.1425 * Math.sin(time));
            let animation_pos = positions[i];
            view_params.synthesized_position = center_pos.add(animation_pos);
            cdep_compute.synthesizeView(view_params);
            time += 0.0111111;

            // Save image
            cdep_compute.readRgbdTextures()
            .then((pixels) => {
                Tools.DumpData(4096, 4096, pixels, undefined, 'image/png', 'office_ods_cdep_8-8_4k_' + i + '.png', false);
            })
            .catch((error) => {
                console.log(error);
            });
        }

        cdep_compute.readRgbdTextures({buffer: pixel_buffer, x: image_dims.width / 2, y: image_dims.height / 2, w: 1, h: 1})
        .then((pixels) => {
            let end_t = performance.now();
            console.log('average compute time: ' + ((end_t - start_t) / num_compute).toFixed(2) + 'ms');
            console.log(pixels);

            let textures = cdep_compute.getRgbdTextures();
            photo_dome.texture = textures[0];
        })
        .catch((error) => {
            console.log(error);
        });
        */
    })
    .catch((error) => {
        console.log(error);
    });

    // Initialize the XR view (currently only supported by WebGL)
    if (render_type === 'WebGL') {
        WebXRDefaultExperience.CreateAsync(babylon.scene, {})
        .then((xr) => {
            xr.baseExperience.onStateChangedObservable.add((xr_state) => {
                if (xr_state === WebXRState.IN_XR) {
                    console.log('Entered VR');
                    const xr_camera = xr.baseExperience.camera;
                    babylon.projection = getCameraFovAspect(xr_camera.rigCameras[0]);
                    babylon.active_camera = xr_camera;
                    babylon.user_height = xr_camera.realWorldHeight;
                }
                else if (xr_state === WebXRState.NOT_IN_XR) {
                    console.log('Exited VR');
                    babylon.projection = getCameraFovAspect(babylon.camera);
                    babylon.active_camera = babylon.camera;
                    babylon.user_height = desktop_user_height;
                }
            });
        })
        .catch((error) => {
            // XR not supported
            console.log(error);
        });
    }

    
    // Render every frame
    let frame = 0;
    babylon.scene.onBeforeRenderObservable.add(() => {
        if (cdep_compute.isReady()) {
            // Synthesize new view
            let camera_data = babylon.active_camera.getForwardRay();
            //let center_pos = new Vector3(0.0, 0.0, 0.725);
            //let center_pos = new Vector3(0.0, 0.0, 0.0);
            let center_pos = new Vector3(-0.779869, 1.61206, -0.874766); //new Vector3(-0.784444, 1.60974, -0.876628)
            // let animation_pos = new Vector3(0.3175 * Math.cos(0.5 * time),
            //                                 babylon.user_height + 0.15 * Math.cos(time),
            //                                 0.1425 * Math.sin(time));
            //let animation_pos = new Vector3(camera_data.origin.x, camera_data.origin.y, -camera_data.origin.z);
            let animation_pos = new Vector3(0, 0, 0);

            //let time_query = babylon.engine.startTimeQuery();
            let view_params = {
                synthesized_position: center_pos.add(animation_pos),
                max_views: 6, //8,
                ipd: 0.005,//0.065,
                focal_dist: 1.95, // 1.3
                z_max: 12.0,
                xr_fovy: babylon.projection.fov_y, //60 * Math.PI / 180.0, //babylon.projection.fov_y,
                xr_aspect: babylon.projection.aspect,
                xr_view_dir: new Vector3(camera_data.direction.x, camera_data.direction.y, -camera_data.direction.z)
            };
            cdep_compute.synthesizeView(view_params);

            // Update textures on model
            let textures = cdep_compute.getRgbdTextures();
            photo_dome.texture = textures[0];

            // Save image
            // if (frame === 10) {
                // cdep_compute.readRgbdTextures()
                // .then((pixels) => {
                //     Tools.DumpData(4096, 4096, pixels, undefined, 'image/png', 'synthesized_view.png', false);
                // })
                // .catch((error) => {
                //     console.log(error);
                // });
            // }
            frame++;
        }
    });

    babylon.engine.runRenderLoop(() => {
        babylon.scene.render();
        frames++;
    });
}

function getCameraFovAspect(camera) {
    let proj_matrix = camera.getProjectionMatrix().asArray();
    return {fov_y: 2.0 * Math.atan(1.0 / proj_matrix[5]), aspect: proj_matrix[5] / proj_matrix[0]};
}


onMounted(async () => {
    babylon.canvas = document.getElementById('gpu-canvas');

    let force_gl = false;//true;
    let webgpu_supported = await WebGPUEngine.IsSupportedAsync;

    if (webgpu_supported && !force_gl) {
        babylon.engine = new WebGPUEngine(babylon.canvas, {deviceDescriptor: {requiredFeatures: ['timestamp-query']}});
        await babylon.engine.initAsync();
        console.log(babylon.engine.enabledExtensions);

        // babylon.internal = {
        //     device: babylon.engine._device,
        //     cmd_encoder: babylon.engine._renderEncoder, //babylon.engine._device.createCommandEncoder(),
        //     query_set: babylon.engine._device.createQuerySet({type: 'timestamp', count: 2})
        // };

        if (babylon.engine.getCaps().supportComputeShaders) {
            createScene('WebGPU');
        }
        else {
            const gl2 = babylon.canvas.getContext('webgl2');
            babylon.internal = {gl2: gl2};
            babylon.engine = new Engine(gl2);
            createScene('WebGL');
        }
    }
    else {
        const gl2 = babylon.canvas.getContext('webgl2');
        babylon.internal = {gl2: gl2};

        // Laptops w/ integrated + discrete GPU: must use settings to 
        // force browser to use high performance GPU
        //
        // For best performance with WebGL2, select OpenGL as rendering
        // backend for ANGLE
        const debug_info = gl2.getExtension("WEBGL_debug_renderer_info");
        const vendor = gl2.getParameter(debug_info.UNMASKED_VENDOR_WEBGL);
        const renderer = gl2.getParameter(debug_info.UNMASKED_RENDERER_WEBGL);
        console.log(vendor);
        console.log(renderer);

        babylon.engine = new Engine(gl2);
        createScene('WebGL');
    }
});
</script>

<template>
    <canvas id="gpu-canvas"></canvas>
</template>

<style scoped>
* {
    font-size: 1rem;
}

#gpu-canvas {
    display: block;
    width: 100vw;
    height: 100vh;
}
</style>
