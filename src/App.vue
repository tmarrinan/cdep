<script>
import { Engine } from '@babylonjs/core/Engines/engine';
import { Scene } from '@babylonjs/core/scene';
import { ArcRotateCamera } from '@babylonjs/core/Cameras/arcRotateCamera';
import { Vector3 } from '@babylonjs/core/Maths/math.vector';
import { Color3 } from '@babylonjs/core/Maths/math.color';
import { HemisphericLight } from '@babylonjs/core/Lights/hemisphericLight';
import { Plane } from '@babylonjs/core/Maths/math.plane';
import { CreatePlane } from '@babylonjs/core/Meshes/Builders/planeBuilder';
import { StandardMaterial } from '@babylonjs/core/Materials/standardMaterial';
import { BaseTexture } from '@babylonjs/core/Materials/Textures/baseTexture';

import { OdsImage } from './modules/odsImage';

const BASE_URL = import.meta.env.BASE_URL || '/';

export default {
    data() {
        return {
            gl: null,
            mode: 0,
            modes: [
                'DASP',
                'C-DEP'
            ]
        }
    },
    mounted() {
        // Get the canvas element from the DOM.
        const canvas = document.getElementById('renderCanvas');
        canvas.width = window.innerWidth;
        canvas.height = window.innerHeight;
        
        window.addEventListener('resize', (event) => {
            canvas.width = window.innerWidth;
            canvas.height = window.innerHeight;
        });

        // Create a WebGL 2 rendering context
        this.gl = canvas.getContext('webgl2');
        if (!this.gl) {
            alert('Error: Browser does not support WebGL2 Canvas');
            return;
        }

        // Associate a Babylon Engine to it.
        const engine = new Engine(this.gl);

        // Create our first scene.
        let scene = new Scene(engine);
        scene.useRightHandedSystem = true;

        // Add a camera to the scene
        let camera = new ArcRotateCamera('camera', Math.PI / 2,  Math.PI / 2, 20.0, //0.001, 
                                         Vector3.Zero(), scene);
        camera.attachControl(canvas, true);
        //camera.inputs.attached.mousewheel.detachControl(canvas);
        camera.minZ = 0.1;
        camera.maxZ = 100.0

        // TEMP
        let light = new HemisphericLight('hemilight', new Vector3(0, 0, 1), scene);


        // Create ODS image contruction object
        let ods_loaded = false;
        let exr_material = new StandardMaterial('EXR_Material', scene);
        let source_plane = Plane.FromPositionAndNormal(Vector3.Zero(), new Vector3(0, 0, 1));
        let plane = CreatePlane('plane', {width: 20.0, height: 20.0, sourcePlane: source_plane});
        //plane.position.y = -5.0; 
        //let ods_image = new OdsImage(this.gl, BASE_URL, BASE_URL + 'data/office_dasp_2560x1200_0.33_nodenoise.exr', 'DASP', () => {
        //let ods_image = new OdsImage(this.gl, BASE_URL, BASE_URL + 'data/office_cdep_2560x1200_0.33_nodenoise.exr', 'CDEP', () => {
        let ods_image = new OdsImage(this.gl, BASE_URL, BASE_URL + 'data/office_dasp_2560x1200_1.5_denoise.exr', 'DASP', () => {
        //let ods_image = new OdsImage(this.gl, BASE_URL, BASE_URL + 'data/office_cdep_2560x1200_1.5_denoise.exr', 'CDEP', () => {
            console.log(ods_image.exr);
            console.log(ods_image.exr_metadata);

            ods_image.render([0.15, 1.770, 0.77], camera.minZ, camera.maxZ, false);
            //ods_image.render([0.15, 1.770, 0.77], camera.minZ, camera.maxZ, false, (img_url) => {
            //    window.open(img_url, '_blank');
            //}); 

            let exr_texture = new BaseTexture(scene);
            exr_texture._texture = engine.wrapWebGLTexture(ods_image.render_target.textures.color, false);
            //exr_texture._texture = engine.wrapWebGLTexture(ods_image.textures[0].color, false);
            exr_material.diffuseTexture = exr_texture;
            exr_material.specularColor = new Color3(0.0, 0.0, 0.0);
            plane.material = exr_material;

            ods_loaded = true;
        });

        
        // Animation
        let time = 0.0;
        scene.onBeforeRenderObservable.add(() => {
            let delta_time = (1.0 / 60.0) * scene.getAnimationRatio();
            time += delta_time;
            if (ods_loaded && time > 1.5) {
                //console.log('Render time: ' + (delta_time * 1000).toFixed(3) + ' ms');
                ods_image.render([0.15, 1.770, 0.77], camera.minZ, camera.maxZ, true);
                time = 0.0;
            }
        });
        

        // Render every frame
        engine.runRenderLoop(() => {
            scene.render();
        });
    }
}
</script>

<template>
    <canvas id="renderCanvas" touch-action="none"></canvas>
</template>

<style scoped>
#renderCanvas {
    position: absolute;
    left: 0px;
    top: 0px;
    z-index: 1;
}
</style>
