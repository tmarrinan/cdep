<script setup>
import { Engine } from '@babylonjs/core/Engines/engine';
import { WebGPUEngine } from '@babylonjs/core/Engines/webgpuEngine';
import { Scene } from '@babylonjs/core/scene';
import { Color3 } from '@babylonjs/core/Maths/math.color';
import { Vector3 } from '@babylonjs/core/Maths/math.vector';
import { Ray } from '@babylonjs/core/Culling/ray';
import { ArcRotateCamera } from '@babylonjs/core/Cameras/arcRotateCamera';
import { UniversalCamera } from '@babylonjs/core/Cameras/universalCamera';
import { HemisphericLight } from '@babylonjs/core/Lights/hemisphericLight';
import { CreatePlane } from '@babylonjs/core/Meshes/Builders/planeBuilder';
import { PhotoDome } from '@babylonjs/core/Helpers/photoDome'
import { CreateGround } from '@babylonjs/core/Meshes/Builders/groundBuilder';
import { StandardMaterial } from '@babylonjs/core/Materials/standardMaterial';
import { GridMaterial } from '@babylonjs/materials/grid/gridMaterial';

import { CdepWebGPU } from './scripts/cdepWebGPU';
import { CdepWebGL } from './scripts/cdepWebGL';

// Must import for proper functionality with extensions such as RawTexture 
import * as WEBGPU_EXT from '@babylonjs/core/Engines/WebGPU/Extensions/index.js';

import { reactive, ref, onMounted } from 'vue'

const BASE_URL = import.meta.env.BASE_URL || '/';

let babylon = {
    canvas: null,
    engine: null,
    scene: null,
    camera: null
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

    // Create a camera
    // babylon.camera = new ArcRotateCamera('camera', -Math.PI / 2.0,  3.0 * Math.PI / 8.0, 10.0, 
    //                                      new Vector3(0.0, 2.5, 0.0), babylon.scene);
    // babylon.camera.wheelPrecision = 30;
    babylon.camera = new UniversalCamera('camera', new Vector3(0.0, 0.0, 0.0), babylon.scene);
    //babylon.camera.fov = 45.0 * Math.PI / 180.0;
    babylon.camera.speed = 0.1;
    babylon.camera.attachControl(babylon.canvas, true);

    console.log(getCameraFovAspect(babylon.camera));
    
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
    photo_dome.rotation.y = 0.5 * Math.PI;
    photo_dome.scaling.y = -1.0;

    // Create a 'ground'
    // const grid_mat = new GridMaterial('grid', babylon.scene);

    // const ground = CreateGround('ground', { width: 5, height: 5, subdivisions: 2 }, babylon.scene);
    // ground.material = grid_mat;

    // C-DEP WebGPU
    let cdep_compute = (render_type === 'WebGPU') ? new CdepWebGPU(babylon.scene, babylon.engine) :
                                                    new CdepWebGL(babylon.scene, babylon.engine);
    let panoramas = [
        {
            color: BASE_URL + 'images/ods_cdep_4k_camera_1.png',
            depth: BASE_URL + 'images/ods_cdep_4k_camera_1.depth',
            camera_position: new Vector3(-0.35, 1.85, 0.55)
        },
        {
            color: BASE_URL + 'images/ods_cdep_4k_camera_2.png',
            depth: BASE_URL + 'images/ods_cdep_4k_camera_2.depth',
            camera_position: new Vector3( 0.35, 1.55, 0.90)
        },
        {
            color: BASE_URL + 'images/ods_cdep_4k_camera_3.png',
            depth: BASE_URL + 'images/ods_cdep_4k_camera_3.depth',
            camera_position: new Vector3(-0.10, 1.75, 0.85)
        },
        {
            color: BASE_URL + 'images/ods_cdep_4k_camera_4.png',
            depth: BASE_URL + 'images/ods_cdep_4k_camera_4.depth',
            camera_position: new Vector3( 0.25, 1.70, 0.60)
        },
        {
            color: BASE_URL + 'images/ods_cdep_4k_camera_5.png',
            depth: BASE_URL + 'images/ods_cdep_4k_camera_5.depth',
            camera_position: new Vector3(-0.30, 1.67, 0.75)
        },
        {
            color: BASE_URL + 'images/ods_cdep_4k_camera_6.png',
            depth: BASE_URL + 'images/ods_cdep_4k_camera_6.depth',
            camera_position: new Vector3(-0.20, 1.60, 0.70)
        },
        {
            color: BASE_URL + 'images/ods_cdep_4k_camera_7.png',
            depth: BASE_URL + 'images/ods_cdep_4k_camera_7.depth',
            camera_position: new Vector3( 0.15, 1.78, 0.57)
        },
        {
            color: BASE_URL + 'images/ods_cdep_4k_camera_8.png',
            depth: BASE_URL + 'images/ods_cdep_4k_camera_8.depth',
            camera_position: new Vector3( 0.05, 1.82, 0.87)
        }
    ];

    cdep_compute.initializePanoramaCollection(panoramas)
    .then((image_dims) => {
        console.log('C-DEP initialized', image_dims);
    })
    .catch((error) => {
        console.log(error);
    });

    
    // Render every frame
    let start = performance.now();
    let time = 0.0;
    babylon.engine.runRenderLoop(() => {
        time += (babylon.engine.getDeltaTime() / 1000.0);

        if (cdep_compute.isReady()) {
            // Synthesize new view
            let camera_data = babylon.camera.getForwardRay();
            let center_pos = new Vector3(0.0, 1.70, 0.725);
            //let animation_pos = new Vector3(0.3175 * Math.cos(0.5 * time), 0.15 * Math.cos(time), 0.1425 * Math.sin(time));
            let animation_pos = new Vector3(camera_data.origin.x, camera_data.origin.y, -camera_data.origin.z);

            let view_params = {
                synthesized_position: center_pos.add(animation_pos),
                max_views: 8,
                ipd: 0.065,
                focal_dist: 1.95,
                z_max: 12.0,
                xr_fovy: 75.0,
                xr_aspect: 1.0,
                xr_view_dir: new Vector3(camera_data.direction.x, camera_data.direction.y, -camera_data.direction.z)
            };
            cdep_compute.synthesizeView(view_params);

            // Update textures on model
            let textures = cdep_compute.getRgbdTextures();
            //cdep_mat.emissiveTexture = textures[0];
            photo_dome.texture = textures[0];
        }

        babylon.scene.render();

        let now = performance.now();
        if ((now - start) >= 2000.0) {
            console.log(babylon.engine.getFps().toFixed(1) + ' fps');
            start = now;
        }
    });
}

function getCameraFovAspect(camera) {
    let proj_matrix = camera.getProjectionMatrix().asArray();
    return {fov_y: 2.0 * Math.atan(1.0 / proj_matrix[5]), aspect: proj_matrix[5] / proj_matrix[0]};
}


onMounted(async () => {
    babylon.canvas = document.getElementById('gpu-canvas');

    let force_gl = false;
    let webgpu_supported = await WebGPUEngine.IsSupportedAsync;

    if (webgpu_supported && !force_gl) {
        babylon.engine = new WebGPUEngine(babylon.canvas, {deviceDescriptor: {requiredFeatures: ['timestamp-query']}});
        await babylon.engine.initAsync();
        console.log(babylon.engine.enabledExtensions);

        if (babylon.engine.getCaps().supportComputeShaders) {
            createScene('WebGPU');
        }
        else {
            const gl2 = babylon.canvas.getContext('webgl2');
            babylon.engine = new Engine(gl2);
            createScene('WebGL');
        }
    }
    else {
        const gl2 = babylon.canvas.getContext('webgl2');

        // Laptops w/ integrated + discrete GPU: must use settings to 
        // force browser to use high performance GPU
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
