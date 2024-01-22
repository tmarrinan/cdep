import { Vector3 } from '@babylonjs/core/Maths/math.vector';
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
        this.ready = false;
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
                this.ready = true;
                resolve({width: this.image_dims.width, height: this.image_dims.height});
            })
            .catch((error) => {
                reject(error);
            });
        });
    }

    isReady() {
        return this.ready;
    }

    initializeOutputBuffer(width, height) {
        // !implement in inherited classes
    }

    synthesizeView(view_params) {
        // !implement in inherited classes
    }

    getRgbdTextures() {
        // !implement in inherited classes
    }

    readRgbdTextures() {
        // !implement in inherited classes
    }

    determineViews(synthesized_position, max_views) {
        // Start by adding bounding corners (in num_views >= 2)
        let view0_dist2 = Vector3.DistanceSquared(synthesized_position, this.cam_positions[0]);
        let view1_dist2 = Vector3.DistanceSquared(synthesized_position, this.cam_positions[1]);
        let view_indices = [];
        let view_dist2s = [];
        if (view0_dist2 <= view1_dist2) {
            view_indices.push(0, 1);
            view_dist2s.push(view0_dist2, view1_dist2);
        }
        else {
            view_indices.push(1, 0);
            view_dist2s.push(view1_dist2, view0_dist2);
        }

        // Continue adding closest views
        let total_views = Math.max(max_views, this.num_images);
        for (let j = 2; j < max_views; j++) {
            let i;
            let closest_dist2 = 9.9e12;
            let closest_index = -1;
            for (i = 2; i < this.num_images; i++) {
                if (!view_indices.includes(i)) {  
                    let dist2 = Vector3.DistanceSquared(synthesized_position, this.cam_positions[i]);
                    if (dist2 < closest_dist2) {
                        closest_dist2 = dist2;
                        closest_index = i;
                    }
                }
            }
            let pos = 0;
            for (i = 0; i < view_dist2s.length; i++) {
                if (closest_dist2 > view_dist2s[i]) {
                    pos = i + 1;
                }
            }
            view_indices.splice(pos, 0, closest_index);
            view_dist2s.splice(pos, 0, closest_dist2);
        }

        return view_indices;
    }
}

export { CdepAbstract };