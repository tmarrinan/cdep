import { RawTexture } from '@babylonjs/core/Materials/Textures/rawTexture';
import { Constants } from '@babylonjs/core/Engines/constants';
import imageLoader from './imageLoader';

class CdepAbstract {
    constructor(scene, engine) {
        this.scene = scene;
        this.engine = engine;
        this.num_images = 0;
        this.image_dims = {width: 0, height: 0};
        this.cam_positions = [];
        this.rgba_textures = [];
        this.depth_textures = [];
    }

    initializePanoramaCollection(depth_panos) {
        return new Promise((resolve, reject) => {
            this.num_images = depth_panos.length;

            let image_data = [];
            depth_panos.forEach((pano) => {
                image_data.push(imageLoader.loadPngAsync(pano.color, false, this.scene));
                image_data.push(imageLoader.loadDepthAsync(pano.depth));
                this.cam_positions.push(pano.camera_position);
            });
            Promise.all(image_data)
            .then((texture_data) => {
                const tex_size = texture_data[0].getSize();
                this.image_dims.width = tex_size.width;
                this.image_dims.height = tex_size.height;

                // RGBA and Depth textures
                texture_data.forEach((tex, index) => {
                    if (index % 2 === 0) {
                        this.rgba_textures.push(tex);
                    }
                    else {
                        const depth_buffer = tex;
                        this.depth_textures.push(new RawTexture(depth_buffer, this.image_dims.width, this.image_dims.height,
                                                                Constants.TEXTUREFORMAT_R, this.scene, false, false,
                                                                Constants.NEAREST_SAMPLINGMODE, Constants.TEXTURETYPE_FLOAT));
                    }
                });

                // Output RGB-D buffer
                this.initializeOutputBuffer(this.image_dims.width, this.image_dims.height);

                // Done!
                resolve({width: this.image_dims.width, height: this.image_dims.height});
            })
            .catch((error) => {
                reject(error);
            });
        });
    }

    initializeOutputBuffer(width, height) {
        // !implement in inherited classes
    }

    synthesizeView(view_params) {
        // !implement in inherited classes
    }
}

export { CdepAbstract };