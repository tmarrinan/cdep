import {OpenExrReader} from './openExrReader.js';

class OdsImage {
    constructor(gl, base_url, exr_url, type, callback) {
        this.gl = gl;
        this.base_url = base_url;
        this.exr = null;
        this.exr_metadata = {};
        this.image_type = type; 
        this.dasp_shader = {program: null, uniforms: null};
        this.dep_shader = {program: null, uniforms: null};
        this.textures = [];
        this.render_target = {framebuffer: null, textures: {color: null, depth: null}};
        this.ods_pointcloud = {vertex_array: null, num_points: 0};
        this.vertex_position_attrib = 0;
        this.vertex_texcoord_attrib = 1;
        this.timer_ext = this.gl.getExtension('EXT_disjoint_timer_query_webgl2');

        let p_exr = this.getBinaryData(exr_url);
        let p_dasp_vs = this.getTextData(this.base_url + 'shaders/dasp.vert');
        let p_dasp_fs = this.getTextData(this.base_url + 'shaders/dasp.frag');
        let p_dep_vs = this.getTextData(this.base_url + 'shaders/dep.vert');
        let p_dep_fs = this.getTextData(this.base_url + 'shaders/dep.frag');

        Promise.all([p_exr, p_dasp_vs, p_dasp_fs, p_dep_vs, p_dep_fs])
        .then((results) => {
            // Read EXR image
            this.exr = new OpenExrReader(results[0]);
            if (this.exr.attributes.hasOwnProperty('Note') && this.exr.attributes.Note.type === 'string') {
                this.exr_metadata = JSON.parse(this.exr.attributes.Note.value);
            }

            // Create DASP shader program
            this.dasp_shader.program = this.glslCreateShaderProgram(results[1], results[2]);
            this.gl.bindAttribLocation(this.dasp_shader.program, this.vertex_position_attrib, 'vertex_position');
            this.gl.bindAttribLocation(this.dasp_shader.program, this.vertex_texcoord_attrib, 'vertex_texcoord');
            this.glslLinkShaderProgram(this.dasp_shader.program);
            this.dasp_shader.uniforms = this.glslGetShaderProgramUniforms(this.dasp_shader.program);
            
            // Create DEP shader program
            this.dep_shader.program = this.glslCreateShaderProgram(results[3], results[4]);
            this.gl.bindAttribLocation(this.dep_shader.program, this.vertex_position_attrib, 'vertex_position');
            this.gl.bindAttribLocation(this.dep_shader.program, this.vertex_texcoord_attrib, 'vertex_texcoord');
            this.glslLinkShaderProgram(this.dep_shader.program);
            this.dep_shader.uniforms = this.glslGetShaderProgramUniforms(this.dep_shader.program);

            // Initialize GL settings - need to set/restore each frame?
            this.gl.clearColor(0.0, 0.0, 0.0, 1.0);
            this.gl.enable(gl.DEPTH_TEST);
            this.gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);

            // Initialize ODS textures
            this.initializeOdsTextures();

            // Initialize ODS render targets
            this.initializeOdsRenderTargets();

            // Create ODS pointcloud model
            this.createOdsPointData();


            if (typeof callback === 'function') callback();
        });
    }

    render(camera_position, near, far, use_timer, img_callback) {
        let query;
        if (use_timer) {
            query = this.gl.createQuery();
            this.gl.beginQuery(this.timer_ext.TIME_ELAPSED_EXT, query);
        }

        // Get handles to existing framebuffer and program
        let c_program = this.gl.getParameter(this.gl.CURRENT_PROGRAM);
        let c_frambuffer = this.gl.getParameter(this.gl.FRAMEBUFFER_BINDING);
        let c_activetex = this.gl.getParameter(this.gl.ACTIVE_TEXTURE);
        let c_texture = this.gl.getParameter(this.gl.TEXTURE_BINDING_2D);

        // Render to texture
        this.gl.bindFramebuffer(this.gl.FRAMEBUFFER, this.render_target.framebuffer);

        // Delete previous frame (reset both framebuffer and z-buffer)
        this.gl.clearColor(0.0, 0.0, 0.0, 1.0);
        this.gl.clear(this.gl.COLOR_BUFFER_BIT | this.gl.DEPTH_BUFFER_BIT);

        // Create projection matrix for equirectangular coordinates
        let left = 0.0;
        let right = 2.0 * Math.PI;
        let bottom = Math.PI;
        let top = 0.0;
        let projection_matrix = new Float32Array([
            2.0 / (right - left), 0.0, 0.0, 0.0,
            0.0, 2.0 / (top - bottom), 0.0, 0.0,
            0.0, 0.0, -2.0 / (far - near), 0.0,
            -(right + left) / (right - left), -(top + bottom) / (top - bottom), -(far + near) / (far - near), 1.0
        ]);

        // DASP
        if (this.image_type === 'DASP') {
            this.gl.useProgram(this.dasp_shader.program);

            let relative_cam_pos = new Float32Array([
                camera_position[0] - this.exr_metadata.camera_position.x,
                camera_position[1] - this.exr_metadata.camera_position.y,
                camera_position[2] - this.exr_metadata.camera_position.z
            ]);

            this.gl.uniform1f(this.dasp_shader.uniforms.img_ipd, this.exr_metadata.ipd);
            this.gl.uniform1f(this.dasp_shader.uniforms.img_focal_dist, this.exr_metadata.focal_dist);
            this.gl.uniform1f(this.dasp_shader.uniforms.camera_ipd, 0.065);
            this.gl.uniform1f(this.dasp_shader.uniforms.camera_focal_dist, 1.95);
            this.gl.uniform3fv(this.dasp_shader.uniforms.camera_position, relative_cam_pos);
            this.gl.uniformMatrix4fv(this.dasp_shader.uniforms.ortho_projection, false, projection_matrix);

            // Draw right (bottom half of image) and left (top half of image) views
            for (let i = 0; i < 2; i++) {
                this.gl.viewport(0, i * this.exr.height, this.exr.width, this.exr.height);
                this.gl.uniform1f(this.dasp_shader.uniforms.camera_eye, 2.0 * (i - 0.5));
            
                // Left eye
                this.gl.uniform1f(this.dasp_shader.uniforms.eye, 1.0);
                this.gl.activeTexture(this.gl.TEXTURE0);
                this.gl.bindTexture(this.gl.TEXTURE_2D, this.textures[0].color);
                this.gl.uniform1i(this.dasp_shader.uniforms.image, 0);
                this.gl.activeTexture(this.gl.TEXTURE1);
                this.gl.bindTexture(this.gl.TEXTURE_2D, this.textures[0].depth);
                this.gl.uniform1i(this.dasp_shader.uniforms.depths, 1);

                this.gl.bindVertexArray(this.ods_pointcloud.vertex_array);
                //this.gl.drawElements(this.gl.POINTS, this.ods_pointcloud.num_points, this.gl.UNSIGNED_INT, 0);
                this.gl.drawArrays(this.gl.POINTS, 0, this.ods_pointcloud.num_points);
                this.gl.bindVertexArray(null);
                
                // Right eye
                this.gl.uniform1f(this.dasp_shader.uniforms.eye, -1.0);
                this.gl.activeTexture(this.gl.TEXTURE0);
                this.gl.bindTexture(this.gl.TEXTURE_2D, this.textures[1].color);
                this.gl.uniform1i(this.dasp_shader.uniforms.image, 0);
                this.gl.activeTexture(this.gl.TEXTURE1);
                this.gl.bindTexture(this.gl.TEXTURE_2D, this.textures[1].depth);
                this.gl.uniform1i(this.dasp_shader.uniforms.depths, 1);

                this.gl.bindVertexArray(this.ods_pointcloud.vertex_array);
                //this.gl.drawElements(this.gl.POINTS, this.ods_pointcloud.num_points, this.gl.UNSIGNED_INT, 0);
                this.gl.drawArrays(this.gl.POINTS, 0, this.ods_pointcloud.num_points);
                this.gl.bindVertexArray(null);
            }
        }
        // C-DEP
        else {
            this.gl.useProgram(this.dep_shader.program);

            this.gl.uniform1f(this.dep_shader.uniforms.camera_ipd, 0.065);
            this.gl.uniform1f(this.dep_shader.uniforms.camera_focal_dist, 1.95);
            this.gl.uniformMatrix4fv(this.dep_shader.uniforms.ortho_projection, false, projection_matrix);

            // Sort images based on distance from desired view
            let image_order = [];
            for (let i = 0; i < this.textures.length; i++) {
                let relative_cam_pos = new Float32Array(3);
                relative_cam_pos[0] = camera_position[0] - this.exr_metadata.camera_positions[i].x;
                relative_cam_pos[1] = camera_position[1] - this.exr_metadata.camera_positions[i].y;
                relative_cam_pos[2] = camera_position[2] - this.exr_metadata.camera_positions[i].z;
                let relative_cam_pos_mag2 = (relative_cam_pos[0] * relative_cam_pos[0]) + 
                                            (relative_cam_pos[1] * relative_cam_pos[1]) + 
                                            (relative_cam_pos[2] * relative_cam_pos[2]);
                let insert_pos = image_order.length;
                for (let j = 0; j < image_order.length; j++) {
                    if (relative_cam_pos_mag2 < image_order[j].cam_pos_mag2) {
                        insert_pos = j;
                        break;
                    }
                }
                image_order.splice(insert_pos, 0, {index: i, cam_pos: relative_cam_pos, cam_pos_mag2: relative_cam_pos_mag2});
            }

            // Draw right (bottom half of image) and left (top half of image) views
            for (let i = 0; i < 2; i++) {
                this.gl.viewport(0, i * this.exr.height, this.exr.width, this.exr.height);
                this.gl.uniform1f(this.dep_shader.uniforms.camera_eye, 2.0 * (i - 0.5));

                for (let j = 0; j < image_order.length; j++) {
                    let idx = image_order[j].index;
                    this.gl.uniform1f(this.dep_shader.uniforms.img_index, idx);
                    this.gl.uniform3fv(this.dep_shader.uniforms.camera_position, image_order[j].cam_pos);

                    // draw view
                    this.gl.activeTexture(this.gl.TEXTURE0);
                    this.gl.bindTexture(this.gl.TEXTURE_2D, this.textures[idx].color);
                    this.gl.uniform1i(this.dep_shader.uniforms.image, 0);
                    this.gl.activeTexture(this.gl.TEXTURE1);
                    this.gl.bindTexture(this.gl.TEXTURE_2D, this.textures[idx].depth);
                    this.gl.uniform1i(this.dep_shader.uniforms.depths, 1);

                    this.gl.bindVertexArray(this.ods_pointcloud.vertex_array);
                    //this.gl.drawElements(this.gl.POINTS, this.ods_pointcloud.num_points, this.gl.UNSIGNED_INT, 0);
                    this.gl.drawArrays(this.gl.POINTS, 0, this.ods_pointcloud.num_points);
                    this.gl.bindVertexArray(null);
                }
            }
        }

        this.gl.activeTexture(c_activetex);
        this.gl.bindTexture(this.gl.TEXTURE_2D, c_texture);
        this.gl.useProgram(c_program);

        if (use_timer) {
        this.gl.endQuery(this.timer_ext.TIME_ELAPSED_EXT);
            setTimeout(() => {
                let q_available = this.gl.getQueryParameter(query, this.gl.QUERY_RESULT_AVAILABLE);
                if (q_available) {
                    let elapsed = this.gl.getQueryParameter(query, this.gl.QUERY_RESULT) / 1000000;
                    console.log('Render Time: ' + elapsed.toFixed(3) + ' ms');
                }
                else {
                    console.log('Render Time: not available');
                }
            }, 500);
        }

        if (img_callback) {
            let pixels = new Uint8Array(this.exr.width * (2 * this.exr.height) * 4);
            this.gl.readPixels(0, 0, this.exr.width, 2 * this.exr.height, this.gl.RGBA, this.gl.UNSIGNED_BYTE, pixels);
            for (let j = 0; j < this.exr.height; j++) {
                let row1 = 4 * this.exr.width * j;
                let row2 = 4 * this.exr.width * (2 * this.exr.height - j - 1);
                for (let i = 0; i < this.exr.width; i++) {
                    let i2 = this.exr.width - i - 1;
                    let r = pixels[row1 + 4 * i];
                    let g = pixels[row1 + 4 * i + 1];
                    let b = pixels[row1 + 4 * i + 2];
                    pixels[row1 + 4 * i] = pixels[row2 + 4 * i2];
                    pixels[row1 + 4 * i + 1] = pixels[row2 + 4 * i2 + 1];
                    pixels[row1 + 4 * i + 2] = pixels[row2 + 4 * i2 + 2];
                    pixels[row1 + 4 * i + 3] = 255;
                    pixels[row2 + 4 * i2] = r;
                    pixels[row2 + 4 * i2 + 1] = g;
                    pixels[row2 + 4 * i2 + 2] = b;
                    pixels[row2 + 4 * i2  +3] = 255;
                }
            }

            let img_canvas = document.createElement('canvas');
            img_canvas.width = this.exr.width;
            img_canvas.height = 2 * this.exr.height;
            let img_ctx = img_canvas.getContext('2d');
            let img_data = img_ctx.createImageData(img_canvas.width, img_canvas.height);
            img_data.data.set(pixels);
            img_ctx.putImageData(img_data, 0, 0);

            img_canvas.toBlob((img_blob) => {
                img_callback(URL.createObjectURL(img_blob));
            }, 'image/png');
        }

        this.gl.bindFramebuffer(this.gl.FRAMEBUFFER, c_frambuffer);
    }

    initializeOdsTextures() {
        // Check for linear interpolation of float texture support
        let float_linear = this.gl.getExtension('OES_texture_float_linear');
        let float_tex_filter = (float_linear === null) ? this.gl.NEAREST : this.gl.LINEAR;
        let ubyte_tex_filter = this.gl.LINEAR;

        let views = this.exr.attributes.multiView.value;
        views.forEach((view, index) => {
            this.textures.push({color: this.gl.createTexture(), depth: this.gl.createTexture()});

            // Create color texture for current view
            let exr_options = {
                red_buffer: 'Image.' + view + '.R',
                green_buffer: 'Image.' + view + '.G',
                blue_buffer: 'Image.' + view + '.B',
                alpha_buffer: 'Image.' + view + '.A',
                gamma_correct: true,
                hdr_scale_min: 0.75,
                hdr_scale_max: 12.5
            };
            this.gl.bindTexture(this.gl.TEXTURE_2D, this.textures[index].color);
            this.gl.texParameteri(this.gl.TEXTURE_2D, this.gl.TEXTURE_MAG_FILTER, ubyte_tex_filter);
            this.gl.texParameteri(this.gl.TEXTURE_2D, this.gl.TEXTURE_MIN_FILTER, ubyte_tex_filter);
            this.gl.texParameteri(this.gl.TEXTURE_2D, this.gl.TEXTURE_WRAP_S, this.gl.CLAMP_TO_EDGE);
            this.gl.texParameteri(this.gl.TEXTURE_2D, this.gl.TEXTURE_WRAP_T, this.gl.CLAMP_TO_EDGE);
            this.gl.texImage2D(this.gl.TEXTURE_2D, 0, this.gl.RGBA, this.exr.width, this.exr.height, 0, this.gl.RGBA,
                               this.gl.UNSIGNED_BYTE, this.exr.generateRgbaUint8Buffer(exr_options));

            // Create depth texture for current view
            this.gl.bindTexture(this.gl.TEXTURE_2D, this.textures[index].depth);
            this.gl.texParameteri(this.gl.TEXTURE_2D, this.gl.TEXTURE_MAG_FILTER, float_tex_filter);
            this.gl.texParameteri(this.gl.TEXTURE_2D, this.gl.TEXTURE_MIN_FILTER, float_tex_filter);
            this.gl.texParameteri(this.gl.TEXTURE_2D, this.gl.TEXTURE_WRAP_S, this.gl.CLAMP_TO_EDGE);
            this.gl.texParameteri(this.gl.TEXTURE_2D, this.gl.TEXTURE_WRAP_T, this.gl.CLAMP_TO_EDGE);
            let depth = this.exr.image_buffers['Depth.' + view + '.V'];
            if (depth.type === 'half') {
                this.gl.texImage2D(this.gl.TEXTURE_2D, 0, this.gl.R16F, this.exr.width, this.exr.height, 0, this.gl.RED,
                                   this.gl.HALF_FLOAT, new Uint16Array(depth.buffer.buffer));
            }
            else {
                this.gl.texImage2D(this.gl.TEXTURE_2D, 0, this.gl.R32F, this.exr.width, this.exr.height, 0, this.gl.RED,
                                   this.gl.FLOAT, depth.buffer);
            }
        });

        // Unbind textures
        this.gl.bindTexture(this.gl.TEXTURE_2D, null);
    }

    initializeOdsRenderTargets() {
        // Check for linear interpolation of float texture support
        let float_linear = this.gl.getExtension('OES_texture_float_linear');
        let float_tex_filter = (float_linear === null) ? this.gl.NEAREST : this.gl.LINEAR;
        let ubyte_tex_filter = this.gl.LINEAR;

        // Create color render texture
        this.render_target.textures.color = this.gl.createTexture();
        this.gl.bindTexture(this.gl.TEXTURE_2D, this.render_target.textures.color);
        this.gl.texParameteri(this.gl.TEXTURE_2D, this.gl.TEXTURE_MAG_FILTER, ubyte_tex_filter);
        this.gl.texParameteri(this.gl.TEXTURE_2D, this.gl.TEXTURE_MIN_FILTER, ubyte_tex_filter);
        this.gl.texParameteri(this.gl.TEXTURE_2D, this.gl.TEXTURE_WRAP_S, this.gl.CLAMP_TO_EDGE);
        this.gl.texParameteri(this.gl.TEXTURE_2D, this.gl.TEXTURE_WRAP_T, this.gl.CLAMP_TO_EDGE);
        this.gl.texImage2D(this.gl.TEXTURE_2D, 0, this.gl.RGBA, this.exr.width, 2 * this.exr.height, 0, this.gl.RGBA, 
                           this.gl.UNSIGNED_BYTE, null);

        // Create depth render texture
        this.render_target.textures.depth = this.gl.createTexture();
        this.gl.bindTexture(this.gl.TEXTURE_2D, this.render_target.textures.depth);
        this.gl.texParameteri(this.gl.TEXTURE_2D, this.gl.TEXTURE_MAG_FILTER, float_tex_filter);
        this.gl.texParameteri(this.gl.TEXTURE_2D, this.gl.TEXTURE_MIN_FILTER, float_tex_filter);
        this.gl.texParameteri(this.gl.TEXTURE_2D, this.gl.TEXTURE_WRAP_S, this.gl.CLAMP_TO_EDGE);
        this.gl.texParameteri(this.gl.TEXTURE_2D, this.gl.TEXTURE_WRAP_T, this.gl.CLAMP_TO_EDGE);
        this.gl.texImage2D(this.gl.TEXTURE_2D, 0, this.gl.R32F, this.exr.width, 2 * this.exr.height, 0, this.gl.RED, 
                           this.gl.FLOAT, null);

        // Unbind textures
        this.gl.bindTexture(this.gl.TEXTURE_2D, null);

        // Create depth buffer object
        let depth_renderbuffer = this.gl.createRenderbuffer();
        this.gl.bindRenderbuffer(this.gl.RENDERBUFFER, depth_renderbuffer);
        this.gl.renderbufferStorage(this.gl.RENDERBUFFER, this.gl.DEPTH_COMPONENT24, this.exr.width, 2 * this.exr.height);

        // Unbind depth buffer object
        this.gl.bindRenderbuffer(this.gl.RENDERBUFFER, null);

        // Create framebuffer object
        this.render_target.framebuffer = this.gl.createFramebuffer();
        this.gl.bindFramebuffer(this.gl.FRAMEBUFFER, this.render_target.framebuffer);
        this.gl.framebufferTexture2D(this.gl.FRAMEBUFFER, this.gl.COLOR_ATTACHMENT0, this.gl.TEXTURE_2D,
                                     this.render_target.textures.color, 0);
        this.gl.framebufferTexture2D(this.gl.FRAMEBUFFER, this.gl.COLOR_ATTACHMENT1, this.gl.TEXTURE_2D,
                                     this.render_target.textures.depth, 0);
        this.gl.framebufferRenderbuffer(this.gl.FRAMEBUFFER, this.gl.DEPTH_ATTACHMENT, this.gl.RENDERBUFFER,
                                        depth_renderbuffer);
        this.gl.drawBuffers([this.gl.COLOR_ATTACHMENT0, this.gl.COLOR_ATTACHMENT1]);

        // Unbind framebuffer object
        this.gl.bindFramebuffer(this.gl.FRAMEBUFFER, null);
    }

    createOdsPointData() {
        let i, j;
        let size = this.exr.width * this.exr.height;

        // Create a new vertex array object
        this.ods_pointcloud.vertex_array = this.gl.createVertexArray();
        this.gl.bindVertexArray(this.ods_pointcloud.vertex_array);
        this.ods_pointcloud.num_points = size;

        // Create arrays for vertex positions and texture coordinates
        let vertices = new Float32Array(2 * size);
        let texcoords = new Float32Array(2 * size);
        //let indices = new Uint32Array(size);
        for (j = 0; j < this.exr.height; j++) {
            for (i = 0; i < this.exr.width; i++) {
                let idx = j * this.exr.width + i;
                let norm_x = (i + 0.5) / this.exr.width;
                let norm_y = (j + 0.5) / this.exr.height;
                let azimuth = 2.0 * Math.PI * (1.0 - norm_x);
                let inclination = Math.PI * (1.0 - norm_y);
                vertices[2 * idx + 0] = azimuth;
                vertices[2 * idx + 1] = inclination;
                texcoords[2 * idx + 0] = norm_x;
                texcoords[2 * idx + 1] = norm_y;
                //indices[idx] = idx;
            }
        }

        // Create buffer to store vertex positions
        let vertex_position_buffer = this.gl.createBuffer();
        this.gl.bindBuffer(this.gl.ARRAY_BUFFER, vertex_position_buffer);
        this.gl.bufferData(this.gl.ARRAY_BUFFER, vertices, this.gl.STATIC_DRAW);
        this.gl.enableVertexAttribArray(this.vertex_position_attrib);
        this.gl.vertexAttribPointer(this.vertex_position_attrib, 2, this.gl.FLOAT, false, 0, 0);

        // Create buffer to store vertex texcoords
        let vertex_texcoord_buffer = this.gl.createBuffer();
        this.gl.bindBuffer(this.gl.ARRAY_BUFFER, vertex_texcoord_buffer);
        this.gl.bufferData(this.gl.ARRAY_BUFFER, texcoords, this.gl.STATIC_DRAW);
        this.gl.enableVertexAttribArray(this.vertex_texcoord_attrib);
        this.gl.vertexAttribPointer(this.vertex_texcoord_attrib, 2, this.gl.FLOAT, false, 0, 0);

        /*
        // Create buffer to store indices of each point
        let vertex_index_buffer = this.gl.createBuffer();
        this.gl.bindBuffer(this.gl.ELEMENT_ARRAY_BUFFER, vertex_index_buffer);
        this.gl.bufferData(this.gl.ELEMENT_ARRAY_BUFFER, indices, this.gl.STATIC_DRAW);
        */

        // Unbind vertex array object and its buffers
        this.gl.bindVertexArray(null);
        this.gl.bindBuffer(this.gl.ARRAY_BUFFER, null);
        //this.gl.bindBuffer(this.gl.ELEMENT_ARRAY_BUFFER, null);
    }

    glslCreateShaderProgram(vert_source, frag_source) {
        // Compile vetex shader
        let vertex_shader = this.glslCompileShader(vert_source, this.gl.VERTEX_SHADER);
        // Compile fragment shader
        let fragment_shader = this.glslCompileShader(frag_source, this.gl.FRAGMENT_SHADER);
        
        // Create GPU program from the compiled vertex and fragment shaders
        let shaders = [vertex_shader, fragment_shader];
        let program = this.glslAttachShaders(shaders);
        
        return program;
    }
    
    glslLinkShaderProgram(program) {
        // Link GPU program
        this.gl.linkProgram(program);
    
        // Check to see if it linked successfully
        if (!this.gl.getProgramParameter(program, this.gl.LINK_STATUS)) {
            alert('An error occurred linking the shader program.');
        }
    }
    
    glslGetShaderProgramUniforms(program) {
        // Get handles to uniform variables defined in the shaders
        let num_uniforms = this.gl.getProgramParameter(program, this.gl.ACTIVE_UNIFORMS);
        let uniforms = {};
        for (let i = 0; i < num_uniforms; i++) {
            let info = this.gl.getActiveUniform(program, i);
            uniforms[info.name] = this.gl.getUniformLocation(program, info.name);
        }
        
        return uniforms;
    }
    
    glslCompileShader(source, type) {
        // Create a shader object
        let shader = this.gl.createShader(type);
    
        // Send the source to the shader object
        this.gl.shaderSource(shader, source);
    
        // Compile the shader program
        this.gl.compileShader(shader);
    
        // Check to see if it compiled successfully
        if (!this.gl.getShaderParameter(shader, this.gl.COMPILE_STATUS)) {
            alert('An error occurred compiling the shader: ' + this.gl.getShaderInfoLog(shader));
        }
    
        return shader;
    }
    
    glslAttachShaders(shaders) {
        // Create a GPU program
        let program = this.gl.createProgram();
    
        // Attach all shaders to that program
        for (let i = 0; i < shaders.length; i++) {
            this.gl.attachShader(program, shaders[i]);
        }
    
        return program;
    }

    getTextData = (address) => {
        return new Promise((resolve, reject) => {
            let xhr = new XMLHttpRequest();
            xhr.onreadystatechange = () => {
                if (xhr.readyState === 4) {
                    if (xhr.status === 200) {
                        resolve(xhr.response);
                    }
                    else {
                        reject({status: xhr.status, message: xhr.response});
                    }
                }
            };
            xhr.open('GET', address, true);
            xhr.send();
        });
    }

    getBinaryData = (address) => {
        return new Promise((resolve, reject) => {
            let xhr = new XMLHttpRequest();
            xhr.onreadystatechange = () => {
                if (xhr.readyState === 4) {
                    if (xhr.status === 200) {
                        resolve(xhr.response);
                    }
                    else {
                        reject({status: xhr.status, url: xhr.responseURL});
                    }
                }
            };
            xhr.open('GET', address, true);
            xhr.responseType = 'arraybuffer';
            xhr.send();
        });
    }
}

export { OdsImage };
