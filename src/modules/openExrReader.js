import {inflate as zlib_inflate} from './pako.esm.js';
import {Float16Array} from './float16.esm.js';

class OpenExrReader {
    #read_idx;
    #scan_lines_per_block;
    
    constructor(arraybuffer) {
        this.exr_buffer = new Uint8Array(arraybuffer);
        this.attributes = {};
        this.width = 0;
        this.height = 0;
        this.image_buffers = {};
        this.offset_table = [];
        this.#read_idx = 0;
        this.#scan_lines_per_block = 1;
        
        this.#decode();
    }
    
    generateRgbaUint8Buffer(options) {
        if (!options) options = {};
        options.buffers = [
            options.red_buffer || 'R',
            options.green_buffer || 'G',
            options.blue_buffer || 'B',
            options.alpha_buffer || 'A'
        ];
        options.gamma_correct = options.gamma_correct || true;
        
        if (!this.image_buffers.hasOwnProperty(options.buffers[0]) ||
            !this.image_buffers.hasOwnProperty(options.buffers[1]) ||
            !this.image_buffers.hasOwnProperty(options.buffers[2]) ||
            !this.image_buffers.hasOwnProperty(options.buffers[3])) {
            console.log('OpenExrReader: Error - no image buffer with specified name');
            return null;
        }
        
        let i, j;
        let gamma = 1.0 / 2.4;
        let normalize = this.image_buffers[options.buffers[0]].type === 'uint' ? 4294967295.0 : 1.0
        let component_size = this.image_buffers[options.buffers[0]].buffer.length;
        let buffer_size = 4 * component_size;
        let buffer = new Uint8Array(buffer_size);

        /*
        let max_col = 0.0;
        for (i = 0; i < component_size; i++) {
            let linear = this.image_buffers[options.buffers[2]].buffer[i];
            if (linear > max_col) max_col = linear;
        }
        console.log("EXR Max R = ", max_col)
        */

        for (i = 0; i < component_size; i++) {
            for (j = 0; j < 4; j++) {
                let linear = this.image_buffers[options.buffers[j]].buffer[i] / normalize;
                if (options.gamma_correct && j < 4) {
                    if (options.hasOwnProperty('hdr_scale_min') && options.hasOwnProperty('hdr_scale_max')) {
                        if (linear > options.hdr_scale_min) {
                            linear = ((linear - options.hdr_scale_min) / (options.hdr_scale_max - options.hdr_scale_min)) *
                                     (1.0 - options.hdr_scale_min) + options.hdr_scale_min;
                        }
                    }
                    let srgb;
                    if (linear > 0.0031308) {
                        srgb = Math.min(1.055 * Math.pow(linear, gamma), 1.0);
                    }
                    else {
                        srgb = 12.92 * linear;
                    }
                    buffer[4 * i + j] = Math.round(255.0 * srgb);
                }
                else {
                    buffer[4 * i + j] = Math.round(255.0 * linear);
                }
            }
        }
        return buffer;
    }
    
    #decode() {
        // magic number and version field
        let i, key;
        let magic_num = this.#readInt();
        let version_field = this.#readInt();
        let version = version_field & 0xFF;
        let single_part_tiled = version_field & 0x200;
        let long_names = version_field & 0x400;
        let deep_data = version_field & 0x800;
        let multipart = version_field & 0x1000;
        if (single_part_tiled || long_names || deep_data || multipart) {
            console.log('OpenExrReader: Error - only supports single-part scan line EXR images');
            return;
        }
        // attributes
        while (this.exr_buffer[this.#read_idx] !== 0) {
            this.#readAttrib();
        }
        this.#read_idx++;
        this.width = this.attributes.dataWindow.value[2] - this.attributes.dataWindow.value[0] + 1;
        this.height = this.attributes.dataWindow.value[3] - this.attributes.dataWindow.value[1] + 1;
        // initialize image buffers
        for (key in this.image_buffers) {
            if (this.image_buffers.hasOwnProperty(key)) {
                if (this.image_buffers[key].type === 'uint') {
                    this.image_buffers[key].buffer = new Uint32Array(this.width * this.height);
                }
                else if (this.image_buffers[key].type === 'half') {
                    this.image_buffers[key].buffer = new Float16Array(this.width * this.height);
                }
                else if (this.image_buffers[key].type === 'float') {
                    this.image_buffers[key].buffer = new Float32Array(this.width * this.height);
                }
            }
        }
        // scan line offsets
        let num_scan_lines = Math.ceil(this.height / this.#scan_lines_per_block);
        for (i = 0; i < num_scan_lines; i++) {
            this.offset_table.push(this.#readInt64());
        }
        // pixel data
        for (i = 0; i < this.offset_table.length; i++) {
            this.#read_idx = this.offset_table[i];
            let scan_line_y = this.#readInt();
            let scan_line_size = this.#readInt();
            if (this.attributes.compression.value === 'none') {
                this.#readPixelDataRaw(scan_line_y);
            }
            else if (this.attributes.compression.value === 'zip' || this.attributes.compression.value === 'zips') {
                this.#readPixelDataZip(scan_line_y, scan_line_size);
            }
        }
    }
    
    #readAttrib() {
        let attrib = {};
        let name = '';
        while (this.exr_buffer[this.#read_idx] !== 0) {
            name += String.fromCharCode(this.exr_buffer[this.#read_idx]);
            this.#read_idx++;
        }
        this.#read_idx++;
        attrib.type = '';
        while (this.exr_buffer[this.#read_idx] !== 0) {
            attrib.type += String.fromCharCode(this.exr_buffer[this.#read_idx]);
            this.#read_idx++;
        }
        this.#read_idx++;
        let attrib_size = this.#readInt();
        
        if (attrib.type === 'int') {
            attrib.value = this.#readInt();
        }
        else if (attrib.type === 'float') {
            attrib.value = this.#readFloat();
        }
        else if (attrib.type === 'string') {
            attrib.value = this.#readString(attrib_size);
        }
        else if (attrib.type === 'compression') {
            attrib.value = this.#readCompression();
        }
        else if (attrib.type === 'lineOrder') {
            attrib.value = this.#readLineOrder();
        }
        else if (attrib.type === 'v2i') {
            attrib.value = this.#readV2i();
        }
        else if (attrib.type === 'v2f') {
            attrib.value = this.#readV2f();
        }
        else if (attrib.type === 'v3i') {
            attrib.value = this.#readV3i();
        }
        else if (attrib.type === 'v3f') {
            attrib.value = this.#readV3f();
        }
        else if (attrib.type === 'box2i') {
            attrib.value = this.#readBox2i();
        }
        else if (attrib.type === 'box2f') {
            attrib.value = this.#readBox2f();
        }
        else if (attrib.type === 'stringvector') {
            attrib.value = this.#readStringVector(attrib_size);
        }
        else if (attrib.type === 'chlist') {
            attrib.value = this.#readChannelList(attrib_size);
        }
        this.attributes[name] = attrib;
    }
    
    #readInt() {
        let int_val = (this.exr_buffer[this.#read_idx+3] << 24 |
                       this.exr_buffer[this.#read_idx+2] << 16 |
                       this.exr_buffer[this.#read_idx+1] <<  8 |
                       this.exr_buffer[this.#read_idx]) >>> 0;
        this.#read_idx += 4;
        return int_val;
    }
    
    #readInt64() {
        // Note: due to limitations of JS, this only uses 48 bits
        let int_val = (this.exr_buffer[this.#read_idx+5] << 40 |
                       this.exr_buffer[this.#read_idx+4] << 32 |
                       this.exr_buffer[this.#read_idx+3] << 24 |
                       this.exr_buffer[this.#read_idx+2] << 16 |
                       this.exr_buffer[this.#read_idx+1] <<  8 |
                       this.exr_buffer[this.#read_idx]) >>> 0;
        this.#read_idx += 8;
        return int_val;
    }
    
    #readFloat() {
        let float_val = new Float32Array(this.exr_buffer.buffer.slice(this.#read_idx, this.#read_idx + 4));
        this.#read_idx += 4;
        return float_val[0];
    }
    
    #readString(length) {
        let i;
        let str = '';
        for (i = 0; i < length; i++) {
            str += String.fromCharCode(this.exr_buffer[this.#read_idx + i]);
        }
        this.#read_idx += length;
        return str;
    }
    
    #readCompression() {
        let compression = '';
        switch (this.exr_buffer[this.#read_idx]) {
            case 0:
                compression = 'none';
                this.#scan_lines_per_block = 1;
                break;
            case 1:
                compression = 'rle';
                this.#scan_lines_per_block = 1;
                break;
            case 2:
                compression = 'zips';
                this.#scan_lines_per_block = 1;
                break;
            case 3:
                compression = 'zip';
                this.#scan_lines_per_block = 16;
                break;
            case 4:
                compression = 'piz';
                this.#scan_lines_per_block = 32;
                break;
            case 5:
                compression = 'pxr24';
                this.#scan_lines_per_block = 16;
                break;
            case 6:
                compression = 'b44';
                this.#scan_lines_per_block = 32;
                break;
            case 7:
                compression = 'b44a';
                this.#scan_lines_per_block = 32;
                break;
        }
        this.#read_idx++;
        return compression;
    }
    
    #readLineOrder() {
        let line_order = '';
        switch (this.exr_buffer[this.#read_idx]) {
            case 0:
                line_order = 'increasing_y';
                break;
            case 1:
                line_order = 'decreasing_y';
                break;
            case 2:
                line_order = 'random_y';
                break;
        }
        this.#read_idx++;
        return line_order;
    }
    
    #readV2i() {
        let vec = [];
        vec.push((this.exr_buffer[this.#read_idx+3] << 24 |
                  this.exr_buffer[this.#read_idx+2] << 16 |
                  this.exr_buffer[this.#read_idx+1] <<  8 |
                  this.exr_buffer[this.#read_idx]) >>> 0);
        vec.push((this.exr_buffer[this.#read_idx+7] << 24 |
                  this.exr_buffer[this.#read_idx+6] << 16 |
                  this.exr_buffer[this.#read_idx+5] <<  8 |
                  this.exr_buffer[this.#read_idx+4]) >>> 0);
        this.#read_idx += 8;
        return vec;
    }
    
    #readV2f() {
        let float_vals = new Float32Array(this.exr_buffer.buffer.slice(this.#read_idx, this.#read_idx + 8));
        this.#read_idx += 8;
        return [float_vals[0], float_vals[1]];
    }
    
    #readV3i() {
        let vec = [];
        vec.push((this.exr_buffer[this.#read_idx+3] << 24 |
                  this.exr_buffer[this.#read_idx+2] << 16 |
                  this.exr_buffer[this.#read_idx+1] <<  8 |
                  this.exr_buffer[this.#read_idx]) >>> 0);
        vec.push((this.exr_buffer[this.#read_idx+7] << 24 |
                  this.exr_buffer[this.#read_idx+6] << 16 |
                  this.exr_buffer[this.#read_idx+5] <<  8 |
                  this.exr_buffer[this.#read_idx+4]) >>> 0);
        vec.push((this.exr_buffer[this.#read_idx+11] << 24 |
                  this.exr_buffer[this.#read_idx+10] << 16 |
                  this.exr_buffer[this.#read_idx+ 9] <<  8 |
                  this.exr_buffer[this.#read_idx+ 8]) >>> 0);
        this.#read_idx += 12;
        return vec;
    }
    
    #readV3f() {
        let float_vals = new Float32Array(this.exr_buffer.buffer.slice(this.#read_idx, this.#read_idx + 12));
        this.#read_idx += 12;
        return [float_vals[0], float_vals[1], float_vals[2]];
    }
    
    #readBox2i() {
        let box = [];
        box.push((this.exr_buffer[this.#read_idx+3] << 24 |
                  this.exr_buffer[this.#read_idx+2] << 16 |
                  this.exr_buffer[this.#read_idx+1] <<  8 |
                  this.exr_buffer[this.#read_idx]) >>> 0);
        box.push((this.exr_buffer[this.#read_idx+7] << 24 |
                  this.exr_buffer[this.#read_idx+6] << 16 |
                  this.exr_buffer[this.#read_idx+5] <<  8 |
                  this.exr_buffer[this.#read_idx+4]) >>> 0);
        box.push((this.exr_buffer[this.#read_idx+11] << 24 |
                  this.exr_buffer[this.#read_idx+10] << 16 |
                  this.exr_buffer[this.#read_idx+ 9] <<  8 |
                  this.exr_buffer[this.#read_idx+ 8]) >>> 0);
        box.push((this.exr_buffer[this.#read_idx+15] << 24 |
                  this.exr_buffer[this.#read_idx+14] << 16 |
                  this.exr_buffer[this.#read_idx+13] <<  8 |
                  this.exr_buffer[this.#read_idx+12]) >>> 0);
        this.#read_idx += 16;
        return box;
    }
    
    #readBox2f() {
        let float_vals = new Float32Array(this.exr_buffer.buffer.slice(this.#read_idx, this.#read_idx + 16));
        this.#read_idx += 16;
        return [float_vals[0], float_vals[1], float_vals[2], float_vals[3]];
    }
    
    #readStringVector(length) {
        let i = 0;
        let str_vector = [];
        while (i < length) {
            let size = this.#readInt();
            let str = this.#readString(size);
            str_vector.push(str);
            i += size + 4;
        }
        return str_vector;
    }
    
    #readChannelList(length) {
        let channels = [];
        let i = 0;
        while (i < length - 1) {
            let channel = {};
            i += this.#readChannel(channel);
            channels.push(channel);
        }
        this.#read_idx++;
        return channels;
    }
    
    #readChannel(channel) {
        let channel_start = this.#read_idx;
        channel.name = '';
        while (this.exr_buffer[this.#read_idx] !== 0) {
            channel.name += String.fromCharCode(this.exr_buffer[this.#read_idx]);
            this.#read_idx++;
        }
        this.#read_idx++;
        let px_type = this.#readInt();
        switch (px_type) {
            case 0:
                channel.pixel_type = 'uint';
                break;
            case 1:
                channel.pixel_type = 'half';
                break;
            case 2:
                channel.pixel_type = 'float';
                break;
        }
        channel.linear = (this.exr_buffer[this.#read_idx] === 1);
        this.#read_idx += 4;
        channel.sampling_x = this.#readInt();
        channel.sampling_y = this.#readInt();
        
        this.image_buffers[channel.name] = {type: channel.pixel_type, buffer: null};
        
        return this.#read_idx - channel_start;
    }
    
    #readPixelDataRaw(scan_line) {
        let i;
        let offset = scan_line * this.width;
        for (i = 0; i < this.attributes.channels.value.length; i++) {
            let pixel_data, size;
            let channel = this.attributes.channels.value[i];
            if (channel.pixel_type === 'uint') {
                size = 4 * this.width;
                pixel_data = new Uint32Array(this.exr_buffer.buffer.slice(this.#read_idx, this.#read_idx + size));
            }
            else if (channel.pixel_type === 'half') {
                size = 2 * this.width;
                pixel_data = new Float16Array(this.exr_buffer.buffer.slice(this.#read_idx, this.#read_idx + size));
            }
            else if (channel.pixel_type === 'float') {
                size = 4 * this.width;
                pixel_data = new Float32Array(this.exr_buffer.buffer.slice(this.#read_idx, this.#read_idx + size));
            }
            this.#read_idx += size;
            this.image_buffers[channel.name].buffer.set(pixel_data, offset);
        }
    }
    
    #readPixelDataZip(scan_line, scan_line_size) {    
        let i, j;
        
        // deflate
        let deflated = zlib_inflate(this.exr_buffer.buffer.slice(this.#read_idx, this.#read_idx + scan_line_size));
        // reconstruct
        for (i = 1; i < deflated.length; i++) {
            let d = deflated[i-1] + deflated[i] - 128;
            deflated[i] = d;
        }
        // interleave
        let half = deflated.length / 2;
        let uncompressed = new Uint8Array(deflated.length);
        for (i = 0; i < half; i++) {
            uncompressed[2 * i] = deflated[i];
            uncompressed[2 * i + 1] = deflated[half + i];
        }
        
        // copy to image buffers
        let buffer_idx = 0;
        let offset = scan_line * this.width;
        let num_rows = ((scan_line + this.#scan_lines_per_block) < this.height) ? this.#scan_lines_per_block : this.height - scan_line;
        for (i = 0; i < num_rows; i++) {
            for (j = 0; j < this.attributes.channels.value.length; j++) {
                let pixel_data, size;
                let channel = this.attributes.channels.value[j];
                if (channel.pixel_type === 'uint') {
                    size = 4 * this.width;
                    pixel_data = new Uint32Array(uncompressed.buffer.slice(buffer_idx, buffer_idx + size));
                }
                else if (channel.pixel_type === 'half') {
                    size = 2 * this.width;
                    pixel_data = new Float16Array(uncompressed.buffer.slice(buffer_idx, buffer_idx + size));
                }
                else if (channel.pixel_type === 'float') {
                    size = 4 * this.width;
                    pixel_data = new Float32Array(uncompressed.buffer.slice(buffer_idx, buffer_idx + size));
                }
                buffer_idx += size;
                this.image_buffers[channel.name].buffer.set(pixel_data, offset);
            }
            offset += this.width;
        }
        
        this.#read_idx += scan_line_size;
    }
}

export { OpenExrReader };
