<script>
import { Engine } from '@babylonjs/core/Engines/engine';
import { Scene } from '@babylonjs/core/scene';
import { ArcRotateCamera } from '@babylonjs/core/Cameras/arcRotateCamera';
import { Vector3 } from '@babylonjs/core/Maths/math.vector';
import { Color3 } from '@babylonjs/core/Maths/math.color';
import { HemisphericLight } from '@babylonjs/core/Lights/hemisphericLight';
import { CreatePlane } from '@babylonjs/core/Meshes/Builders/planeBuilder';
import { StandardMaterial } from '@babylonjs/core/Materials/standardMaterial';
import { BaseTexture } from '@babylonjs/core/Materials/Textures/baseTexture';

import { OdsImage } from './modules/odsImage';

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

        // Add a camera to the scene
        let camera = new ArcRotateCamera('camera', -Math.PI / 2,  Math.PI / 2, 20.0, //0.001, 
                                         Vector3.Zero(), scene);
        camera.attachControl(canvas, true);
        //camera.inputs.attached.mousewheel.detachControl(canvas);
        camera.znear = 0.1;
        camera.zfar = 100.0;

        // TEMP
        let light = new HemisphericLight('hemilight', new Vector3(0, 0, -1), scene);


        // Create ODS image contruction object
        let exr_material = new StandardMaterial('EXR_Material', scene);
        let plane = CreatePlane('plane', {width: 30.0, height: 15.0});
        let ods_image = new OdsImage(this.gl, '/data/office_dasp.exr', () => {
            console.log(ods_image.exr);

            let exr_texture = new BaseTexture(scene);
            exr_texture._texture = engine.wrapWebGLTexture(ods_image.textures.left.color, false);
            exr_material.diffuseTexture = exr_texture;
            exr_material.specularColor = new Color3(0.0, 0.0, 0.0);
            plane.material = exr_material;
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
