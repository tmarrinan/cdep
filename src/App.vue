<script setup>
import { Engine } from '@babylonjs/core/Engines/engine';
import { WebGPUEngine } from '@babylonjs/core/Engines/webgpuEngine';
import { Scene } from '@babylonjs/core/scene';
import { Color3 } from '@babylonjs/core/Maths/math.color';
import { Vector3 } from '@babylonjs/core/Maths/math.vector';
import { ArcRotateCamera } from '@babylonjs/core/Cameras/arcRotateCamera';
import { UniversalCamera } from '@babylonjs/core/Cameras/universalCamera';
import { HemisphericLight } from '@babylonjs/core/Lights/hemisphericLight';
import { CreatePlane } from '@babylonjs/core/Meshes/Builders/planeBuilder';
import { CreateGround } from '@babylonjs/core/Meshes/Builders/groundBuilder';
import { StandardMaterial } from '@babylonjs/core/Materials/standardMaterial';
import { GridMaterial } from '@babylonjs/materials/grid/gridMaterial';
import { RawTexture } from '@babylonjs/core/Materials/Textures/rawTexture';
import { Constants } from '@babylonjs/core/Engines/constants';

import { CdepWebGPU } from './scripts/cdepWebGPU';
import { CdepWebGL } from './scripts/cdepWebGL';

// Must import for proper functionality with extensions such as RawTexture 
import * as WEBGPU_EXT from '@babylonjs/core/Engines/WebGPU/Extensions/index.js';

import { reactive, ref, onMounted } from 'vue'
import { MaterialSheenDefines } from '@babylonjs/core/Materials/PBR/pbrSheenConfiguration';

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
    babylon.camera = new ArcRotateCamera('camera', -Math.PI / 2.0,  3.0 * Math.PI / 8.0, 10.0, 
                                         new Vector3(0.0, 2.5, 0.0), babylon.scene);
    babylon.camera.wheelPrecision = 30;
    babylon.camera.attachControl(babylon.canvas, true);
    
    // Create a light
    const light = new HemisphericLight('light', new Vector3(0, 1, 0), babylon.scene);
    light.intensity = 1.0;

    // Create a plane
    const cdep_mat = new StandardMaterial('cdep_mat');
    cdep_mat.diffuseColor = new Color3(0.0, 0.0, 0.0);
    cdep_mat.specularColor = new Color3(0.0, 0.0, 0.0);
    cdep_mat.emissiveColor = new Color3(0.0, 0.0, 0.0);

    const plane = CreatePlane('plane', {width: 5, height: 5}, babylon.scene);
    plane.material = cdep_mat;
    plane.position.y = 2.5;

    // Create a 'ground'
    const grid_mat = new GridMaterial('grid', babylon.scene);

    const ground = CreateGround('ground', { width: 5, height: 5, subdivisions: 2 }, babylon.scene);
    ground.material = grid_mat;

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
        console.log('C-DEP initialized');
        // // Synthesize new view
        // let view_params = {
        //     synthesized_position: new Vector3(0.0, 1.70, 0.725),
        //     max_views: 3,
        //     ipd: 0.065,
        //     focal_dist: 1.95,
        //     z_max: 12.0
        // };
        // start_time = performance.now();
        // //for (let i = 0; i < 2; i++) {
        //     cdep_compute.synthesizeView(view_params);
        // //}

        // // Update textures on model
        // let textures = cdep_compute.getRgbdTextures();
        // cdep_mat.emissiveTexture = textures[0];

        // return textures[0].readPixels();
    })
    // .then((pixels) => {
    //     console.log(pixels[2048 * 2048 + 512], pixels[2048 * 2048 + 513], pixels[2048 * 2048 + 514]);
    //     let end_time = performance.now();
    //     console.log('Time: ' + ((end_time - start_time) / 2).toFixed(1) + 'ms');
    // })
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
            let center_pos = new Vector3(0.0, 1.70, 0.725);
            let animation_pos = new Vector3(0.3175 * Math.cos(0.5 * time), 0.15 * Math.cos(time), 0.1425 * Math.sin(time));

            let view_params = {
                synthesized_position: center_pos.add(animation_pos),
                //synthesized_position: center_pos,
                max_views: 3,
                ipd: 0.065,
                focal_dist: 1.95,
                z_max: 12.0,
                xr_fovy: 75.0,
                xr_aspect: 1.0,
                xr_view_dir: new Vector3(0.0, 0.0, -1.0)
            };
            cdep_compute.synthesizeView(view_params);

            // Update textures on model
            let textures = cdep_compute.getRgbdTextures();
            cdep_mat.emissiveTexture = textures[0];
        }

        babylon.scene.render();

        let now = performance.now();
        if ((now - start) >= 2000.0) {
            console.log(babylon.engine.getFps().toFixed(1) + ' fps');
            start = now;
        }
    });
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
