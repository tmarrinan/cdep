import math
import Imath
import OpenEXR
import json
import struct
import numpy as np
from PIL import Image


def main():
    output_name = 'ods_cdep_4k_'
    exr = OpenEXR.InputFile('../public/data/office_cdep_4096x2048_1.5_denoise.exr')
    #exr = OpenEXR.InputFile('../public/data/office_dasp_2560x1200_1.5_denoise.exr')
    
    header = exr.header()
    dw = header['dataWindow']
    isize = (dw.max.y - dw.min.y + 1, dw.max.x - dw.min.x + 1)
    cam_data = json.loads(header['Note'])
    near = cam_data['near']
    far = cam_data['far']
    print(near, far)
    
    color_channels = {}
    depth_channel = {}
    for c in header['channels']:
        channel_name = ''
        color = ''
        if c == 'R' or c == 'G' or c == 'B':
            channel_name = 'DEFAULT'
            color = c
        elif len(c) > 8 and c[:6] == 'Image.' and (c[-2:] == '.R' or c[-2:] == '.G' or c[-2:] == '.B'):
            channel_name = c[6:-2]
            color = c[-1:]
        elif c == 'Z':
            channel_name = 'DEFAULT'
            color = c
        elif len(c) > 8 and c[:6] == 'Depth.' and c[-2:] == '.V':
            channel_name = c[6:-2]
            color = 'Z'
        if color == 'R' or color == 'G' or color == 'B' or color == 'Z':
            px_array = None
            if header['channels'][c].type == Imath.PixelType(Imath.PixelType.HALF):
                px_array = np.frombuffer(exr.channel(c, Imath.PixelType(Imath.PixelType.HALF)), dtype=np.float16)
                px_array = np.reshape(px_array, isize)
            elif header['channels'][c].type == Imath.PixelType(Imath.PixelType.FLOAT):
                px_array = np.frombuffer(exr.channel(c, Imath.PixelType(Imath.PixelType.FLOAT)), dtype=np.float32)
                px_array = np.reshape(px_array, isize)
            else:
                print('OpenEXR UINT pixel type not supported')
            
            if color == 'Z':
                depth_channel[channel_name] = px_array
            else:
                if not channel_name in color_channels:
                    color_channels[channel_name] = {'R': None, 'G': None, 'B': None}
                color_channels[channel_name][color] = px_array
    exr.close()
    
    for view in color_channels:
        col_pixels = hdr2srgb(color_channels[view], isize)
        col_img = Image.fromarray(col_pixels, 'RGBA')
        col_img.save(f'{output_name}{view}.png', 'PNG')
    
        depth_channel[view].astype(np.float32).tofile(f'{output_name}{view}.depth')
        
        depth_u16 = depth_channel[view].flatten();
        depth_u16 = np.piecewise(depth_u16, [depth_u16 < far, depth_u16 > far], [lambda d: 1.0 - (((1.0/d) - (1.0/near)) / ((1.0/far) - (1.0/near))), lambda d: 0.0])
        depth_u16 *= 65535.0
        depth_buffer = np.asarray(depth_u16, dtype=np.uint16)
        depth_rvl = compressRvl(depth_buffer)
        rvl = open(f'{output_name}{view}.rvl', 'wb')
        rvl.write('RVL\n'.encode('utf-8'))
        rvl.write(struct.pack('<II', depth_channel[view].shape[1], depth_channel[view].shape[0]))
        rvl.write(struct.pack('ff', near, far))
        rvl.write(depth_rvl.tobytes())
        rvl.close()


def hdr2srgb(raw_colors, size):
    srgb_size = (size[0], size[1], 4)
    srgb = np.empty(srgb_size, dtype=np.uint8)
    gamma = 1.0 / 2.4
    hdr_scale_min = 0.75
    hdr_scale_max = 12.5
    for y in range(size[0]):
        for x in range(size[1]):
            srgb[y][x][0] = linear2srgb(raw_colors['R'][y][x], gamma, hdr_scale_min, hdr_scale_max)
            srgb[y][x][1] = linear2srgb(raw_colors['G'][y][x], gamma, hdr_scale_min, hdr_scale_max)
            srgb[y][x][2] = linear2srgb(raw_colors['B'][y][x], gamma, hdr_scale_min, hdr_scale_max)
            srgb[y][x][3] = 255
    return srgb

def linear2srgb(linear, gamma, hdr_scale_min, hdr_scale_max):
    if linear > hdr_scale_min:
        linear = (((linear - hdr_scale_min) / (hdr_scale_max - hdr_scale_min)) *
                 (1.0 - hdr_scale_min) + hdr_scale_min)
    srgb = 12.92 * linear
    if linear > 0.0031308:
        srgb = min(1.055 * (linear ** gamma), 1.0)
    return int((255 * srgb) + 0.5)


def getColor(color_data, x, y):
    return [color_data['R'][y][x], color_data['G'][y][x], color_data['B'][y][x]]


def getDepth(depth_data, x, y):
    return depth_data[y][x]


def encodeVle(value, out_data):
    while True:
        nibble = value & 0x7 # lower 3 bits
        value = value >> 3
        if value != 0:
            nibble = nibble | 0x8 # more to come
        out_data['word'] = (out_data['word'] << 4) | nibble
        out_data['nibbles_written'] += 1
        if out_data['nibbles_written'] == 8: # output word
            out_data['p_buffer'][out_data['p_idx']] = out_data['word']
            out_data['p_idx'] += 1
            out_data['nibbles_written'] = 0
            out_data['word'] = 0
        if value == 0:
            break


def compressRvl(depth_buffer):
    buffer = np.empty(depth_buffer.size, dtype=np.uint32)
    data = {'p_buffer': buffer, 'p_idx': 0, 'nibbles_written': 0, 'word': 0}
    previous = 0
    i = 0
    while i < depth_buffer.size:
        zeros = 0
        nonzeros = 0
        while i < depth_buffer.size and depth_buffer[i] == 0:
            i += 1
            zeros += 1
        encodeVle(zeros, data) # number of zeros
        tmp = i
        while tmp < depth_buffer.size and depth_buffer[tmp] != 0:
            tmp += 1
            nonzeros += 1
        encodeVle(nonzeros, data) # number of nonzeros
        for j in range(nonzeros):
            current = depth_buffer[i + j]
            delta = int(current - previous)
            positive = ((delta << 1) & 0xffffffff) ^ (delta >> 31);
            encodeVle(positive, data) # nonzero value
            previous = current
        i += nonzeros
    if data['nibbles_written'] != 0:
        data['p_buffer'][data['p_idx']] = data['word'] << 4 * (8 - data['nibbles_written'])
        data['p_idx'] += 1
    data['p_buffer'] = data['p_buffer'][:data['p_idx']]
    return data['p_buffer'].view(dtype=np.uint8)

main()
