import {OpenExrReader} from './openExrReader.js';

class OdsImage {
    constructor(gl, exr_url, callback) {
        this.exr = null;
        this.gl = gl;
        this.dasp_shader = {program: null, uniforms: null};
        this.dep_shader = {program: null, uniforms: null};
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

            if (typeof callback === 'function') callback();
        });
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
    
    //////////////////////////////////////////////////
    // Private functions
    //////////////////////////////////////////////////
    
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
