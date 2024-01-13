import { Texture } from '@babylonjs/core/Materials/Textures/texture';
import { Tools } from '@babylonjs/core/Misc/tools';
import { Constants } from '@babylonjs/core/Engines/constants';

export default {
    loadPngAsync: (url, invert_y, scene) => {
        return new Promise((resolve, reject) => {
            Tools.LoadFileAsync(url, true)
            .then((data) => {
                const texture_blob = new Blob([data]);
                const texture_url = URL.createObjectURL(texture_blob);
                const texture = new Texture(texture_url, scene, false, invert_y, Constants.BILINEAR_SAMPLINGMODE,
                () => {
                    resolve(texture);
                },
                (error) => {
                    reject(error);
                });
            })
            .catch((error) => {
                reject(error);
            });
        });
    },

    loadDepthAsync: (url) => {
        return new Promise((resolve, reject) => {
            Tools.LoadFileAsync(url, true)
            .then((data) => {
                const texture_buffer = new Float32Array(data);
                resolve(texture_buffer);
            })
            .catch((error) => {
                reject(error);
            });
        });
    }
};
