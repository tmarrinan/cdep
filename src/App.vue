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

    // babylon.camera = new UniversalCamera('ortho_camera', new Vector3(0.0, 0.0, 0.0), babylon.scene);
    // babylon.camera.mode = Constants.ORTHOGRAPHIC_CAMERA;
    // babylon.camera.orthoLeft = 2.0 * Math.PI;
    // babylon.camera.orthoRight = 0.0;
    // babylon.camera.orthoBottom = Math.PI;
    // babylon.camera.orthoTop = 0.0;
    
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

    let image_size = null;
    cdep_compute.initializePanoramaCollection(panoramas)
    .then((image_dims) => {
        // Save image size
        image_size = image_dims;

        // Synthesize new view
        let view_params = {
            synthesized_position: new Vector3(0.0, 1.70, 0.725),
            ipd: 0.065,
            focal_dist: 1.95,
            z_max: 12.0
        };
        cdep_compute.synthesizeView(view_params);

        // Update textures on model
        let textures = cdep_compute.getRgbdBuffer();
        cdep_mat.emissiveTexture = textures[0];
    })
    // .then((data) => {
    //         if (render_type === 'WebGPU') {
    //         //let end = performance.now();
    //         //console.log('compute:', ((end - start) / num_comp).toFixed(1) + 'ms');
    //         let out_data = new Uint32Array(data.buffer);
    //         let out_depths = new Float32Array(out_data.length);
    //         let out_colors = new Uint8Array(out_data.length * 4);
    //         for (let i = 0; i < out_data.length; i++) {
    //             let depth = (out_data[i] >> 20) & 0xFFF;
    //             let blue = (out_data[i] >> 14) & 0x3F;
    //             let green = (out_data[i] >> 7) & 0x7F;
    //             let red = out_data[i] & 0x7F;
    //             out_depths[i] =  depth / 4095.0;
    //             out_colors[4 * i + 0] = (red / 128.0) * 255.0;
    //             out_colors[4 * i + 1] = (green / 128.0) * 255.0;
    //             out_colors[4 * i + 2] = (blue / 64.0) * 255.0;
    //             out_colors[4 * i + 3] = 255;
    //         }
    //         const out_image_texture = new RawTexture(out_colors, image_size.width, image_size.height * 2, 
    //                                                 Constants.TEXTUREFORMAT_RGBA, babylon.scene, false, true,
    //                                                 Constants.BILINEAR_SAMPLINGMODE, Constants.TEXTURETYPE_UNSIGNED_BYTE);
    //         const out_depth_texture = new RawTexture(out_depths, image_size.width, image_size.height * 2, 
    //                                                 Constants.TEXTUREFORMAT_R, babylon.scene, false, true,
    //                                                 Constants.BILINEAR_SAMPLINGMODE, Constants.TEXTURETYPE_FLOAT);
    //         cdep_mat.emissiveTexture = out_image_texture;
    //         //cdep_mat.emissiveTexture = out_depth_texture;
    //     }
    //     else {
    //         cdep_mat.emissiveTexture = data[0];
    //     }
    // })
    .catch((error) => {
        console.log(error);
    });

    
    // Render every frame
    let frame = 0;
    babylon.engine.runRenderLoop(() => {
        // if (cdep_compute.rgbd_target !== null && cdep_compute.rgbd_buffer !== null) {
        //     let view_params = {
        //         synthesized_position: new Vector3(0.0, 1.70, 0.725),
        //         ipd: 0.065,
        //         focal_dist: 1.95,
        //         z_max: 12.0
        //     };
        //     cdep_compute.synthesizeView(view_params);
        // }

        babylon.scene.render();
        frame++;
    });
}


onMounted(async () => {
    babylon.canvas = document.getElementById('gpu-canvas');

    let force_gl = false;
    let webgpu_supported = await WebGPUEngine.IsSupportedAsync;

    if (webgpu_supported && !force_gl) {
        babylon.engine = new WebGPUEngine(babylon.canvas);
        await babylon.engine.initAsync();

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
