import {OpenExrReader} from './openExrReader.js';

class OdsImage {
    constructor(gl, exr_url, callback) {
        this.exr = null;
        this.gl = gl;
        this.dasp_shader = {program: null, uniforms: null};
        this.dep_shader = {program: null, uniforms: null};
        this.textures = {left: {color: null, depth: null}, right: {color: null, depth: null}};
        this.render_target = {framebuffer: null, textures: {color: null, depth: null}};
        this.ods_pointcloud = {vertex_array: null, num_points: 0};
        this.vertex_position_attrib = 0;
        this.vertex_texcoord_attrib = 1;

        let p_exr = this.getBinaryData(exr_url);
        let p_dasp_vs = this.getTextData('/shaders/dasp.vert');
        let p_dasp_fs = this.getTextData('/shaders/dasp.frag');
        let p_dep_vs = this.getTextData('/shaders/dep.vert');
        let p_dep_fs = this.getTextData('/shaders/dep.frag');

        Promise.all([p_exr, p_dasp_vs, p_dasp_fs, p_dep_vs, p_dep_fs])
        .then((results) => {
            // Read EXR image
            this.exr = new OpenExrReader(results[0]);

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

    initializeOdsTextures() {
        // Check for linear interpolation of float texture support
        let float_linear = this.gl.getExtension('OES_texture_float_linear');
        let float_tex_filter = (float_linear === null) ? this.gl.NEAREST : this.gl.LINEAR;
        let ubyte_tex_filter = this.gl.LINEAR;

        // Create color texture for left eye
        this.textures.left.color = this.gl.createTexture();
        let exr_options_left = {
            red_buffer: 'Image.left.R',
            green_buffer: 'Image.left.G',
            blue_buffer: 'Image.left.B',
            alpha_buffer: 'Image.left.A',
            gamma_correct: true
        };
        this.gl.bindTexture(this.gl.TEXTURE_2D, this.textures.left.color);
        this.gl.texParameteri(this.gl.TEXTURE_2D, this.gl.TEXTURE_MAG_FILTER, ubyte_tex_filter);
        this.gl.texParameteri(this.gl.TEXTURE_2D, this.gl.TEXTURE_MIN_FILTER, ubyte_tex_filter);
        this.gl.texParameteri(this.gl.TEXTURE_2D, this.gl.TEXTURE_WRAP_S, this.gl.CLAMP_TO_EDGE);
        this.gl.texParameteri(this.gl.TEXTURE_2D, this.gl.TEXTURE_WRAP_T, this.gl.CLAMP_TO_EDGE);
        this.gl.texImage2D(this.gl.TEXTURE_2D, 0, this.gl.RGBA, this.exr.width, this.exr.height, 0, this.gl.RGBA,
                           this.gl.UNSIGNED_BYTE, this.exr.generateRgbaUint8Buffer(exr_options_left));
        
        // Create depth texture for left eye
        this.textures.left.depth = this.gl.createTexture();
        this.gl.bindTexture(this.gl.TEXTURE_2D, this.textures.left.depth);
        this.gl.texParameteri(this.gl.TEXTURE_2D, this.gl.TEXTURE_MAG_FILTER, float_tex_filter);
        this.gl.texParameteri(this.gl.TEXTURE_2D, this.gl.TEXTURE_MIN_FILTER, float_tex_filter);
        this.gl.texParameteri(this.gl.TEXTURE_2D, this.gl.TEXTURE_WRAP_S, this.gl.CLAMP_TO_EDGE);
        this.gl.texParameteri(this.gl.TEXTURE_2D, this.gl.TEXTURE_WRAP_T, this.gl.CLAMP_TO_EDGE);
        if (this.exr.image_buffers['Depth.left.V'].type === 'half') {
            this.gl.texImage2D(this.gl.TEXTURE_2D, 0, this.gl.R16F, this.exr.width, this.exr.height, 0, this.gl.RED,
                               this.gl.HALF_FLOAT, new Uint16Array(this.exr.image_buffers['Depth.left.V'].buffer.buffer));
        }
        else {
            this.gl.texImage2D(this.gl.TEXTURE_2D, 0, this.gl.R32F, this.exr.width, this.exr.height, 0, this.gl.RED,
                               this.gl.FLOAT, this.exr.image_buffers['Depth.left.V'].buffer);
        }

        // Create color texture for left eye
        this.textures.right.color = this.gl.createTexture();
        let exr_options_right = {
            red_buffer: 'Image.right.R',
            green_buffer: 'Image.right.G',
            blue_buffer: 'Image.right.B',
            alpha_buffer: 'Image.right.A',
            gamma_correct: true
        };
        this.gl.bindTexture(this.gl.TEXTURE_2D, this.textures.right.color);
        this.gl.texParameteri(this.gl.TEXTURE_2D, this.gl.TEXTURE_MAG_FILTER, ubyte_tex_filter);
        this.gl.texParameteri(this.gl.TEXTURE_2D, this.gl.TEXTURE_MIN_FILTER, ubyte_tex_filter);
        this.gl.texParameteri(this.gl.TEXTURE_2D, this.gl.TEXTURE_WRAP_S, this.gl.CLAMP_TO_EDGE);
        this.gl.texParameteri(this.gl.TEXTURE_2D, this.gl.TEXTURE_WRAP_T, this.gl.CLAMP_TO_EDGE);
        this.gl.texImage2D(this.gl.TEXTURE_2D, 0, this.gl.RGBA, this.exr.width, this.exr.height, 0, this.gl.RGBA,
                           this.gl.UNSIGNED_BYTE, this.exr.generateRgbaUint8Buffer(exr_options_right));
        
        // Create depth texture for left eye
        this.textures.right.depth = this.gl.createTexture();
        this.gl.bindTexture(this.gl.TEXTURE_2D, this.textures.right.depth);
        this.gl.texParameteri(this.gl.TEXTURE_2D, this.gl.TEXTURE_MAG_FILTER, float_tex_filter);
        this.gl.texParameteri(this.gl.TEXTURE_2D, this.gl.TEXTURE_MIN_FILTER, float_tex_filter);
        this.gl.texParameteri(this.gl.TEXTURE_2D, this.gl.TEXTURE_WRAP_S, this.gl.CLAMP_TO_EDGE);
        this.gl.texParameteri(this.gl.TEXTURE_2D, this.gl.TEXTURE_WRAP_T, this.gl.CLAMP_TO_EDGE);
        if (this.exr.image_buffers['Depth.right.V'].type === 'half') {
            this.gl.texImage2D(this.gl.TEXTURE_2D, 0, this.gl.R16F, this.exr.width, this.exr.height, 0, this.gl.RED,
                               this.gl.HALF_FLOAT, new Uint16Array(this.exr.image_buffers['Depth.right.V'].buffer.buffer));
        }
        else {
            this.gl.texImage2D(this.gl.TEXTURE_2D, 0, this.gl.R32F, this.exr.width, this.exr.height, 0, this.gl.RED,
                               this.gl.FLOAT, this.exr.image_buffers['Depth.right.V'].buffer);
        }

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
        this.gl.texImage2D(this.gl.TEXTURE_2D, 0, this.gl.RGBA, this.exr.width, this.exr.height, 0, this.gl.RGBA, 
                           this.gl.UNSIGNED_BYTE, null);

        // Create depth render texture
        this.render_target.textures.depth = this.gl.createTexture();
        this.gl.bindTexture(this.gl.TEXTURE_2D, this.render_target.textures.depth);
        this.gl.texParameteri(this.gl.TEXTURE_2D, this.gl.TEXTURE_MAG_FILTER, float_tex_filter);
        this.gl.texParameteri(this.gl.TEXTURE_2D, this.gl.TEXTURE_MIN_FILTER, float_tex_filter);
        this.gl.texParameteri(this.gl.TEXTURE_2D, this.gl.TEXTURE_WRAP_S, this.gl.CLAMP_TO_EDGE);
        this.gl.texParameteri(this.gl.TEXTURE_2D, this.gl.TEXTURE_WRAP_T, this.gl.CLAMP_TO_EDGE);
        this.gl.texImage2D(this.gl.TEXTURE_2D, 0, this.gl.R32F, this.exr.width, this.exr.height, 0, this.gl.RED, 
                           this.gl.FLOAT, null);

        // Unbind textures
        this.gl.bindTexture(this.gl.TEXTURE_2D, null);

        // Create depth buffer object
        let depth_renderbuffer = this.gl.createRenderbuffer();
        this.gl.bindRenderbuffer(this.gl.RENDERBUFFER, depth_renderbuffer);
        this.gl.renderbufferStorage(this.gl.RENDERBUFFER, this.gl.DEPTH_COMPONENT24, this.exr.width, this.exr.height);

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
        let indices = new Uint32Array(size);
        for (j = 0; j < this.exr.height; j++) {
            for (i = 0; i < this.exr.width; i++) {
                let idx = j * this.exr.width + i;
                let norm_x = (i + 0.5) / this.exr.width;
                let norm_y = (j + 0.5) / this.exr.height;
                let azimuth = 2.0 * Math.PI * norm_x;
                let inclination = Math.PI * (1.0 - norm_y);
                vertices[2 * idx + 0] = azimuth;
                vertices[2 * idx + 1] = inclination;
                texcoords[2 * idx + 0] = norm_x;
                texcoords[2 * idx + 1] = norm_y;
                indices[idx] = idx;
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

        // Create buffer to store indices of each point
        let vertex_index_buffer = this.gl.createBuffer();
        this.gl.bindBuffer(this.gl.ELEMENT_ARRAY_BUFFER, vertex_index_buffer);
        this.gl.bufferData(this.gl.ELEMENT_ARRAY_BUFFER, indices, this.gl.STATIC_DRAW);

        // Unbind vertex array object and its buffers
        this.gl.bindVertexArray(null);
        this.gl.bindBuffer(this.gl.ARRAY_BUFFER, null);
        this.gl.bindBuffer(this.gl.ELEMENT_ARRAY_BUFFER, null);
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
