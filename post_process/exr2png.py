import math
import Imath
import OpenEXR
import numpy as np
from PIL import Image


def main():
    filename = 'office_ods_truth_4k_3'
    exr = OpenEXR.InputFile(f'../public/data/{filename}.exr')
    
    header = exr.header()
    dw = header['dataWindow']
    isize = (dw.max.y - dw.min.y + 1, dw.max.x - dw.min.x + 1)
    
    color_channels = {}
    for c in header['channels']:
        channel_name = ''
        color = ''
        if c == 'R' or c == 'G' or c == 'B':
            channel_name = 'DEFAULT'
            color = c
        elif len(c) > 8 and c[:6] == 'Image.' and (c[-2:] == '.R' or c[-2:] == '.G' or c[-2:] == '.B'):
            channel_name = c[6:-2]
            color = c[-1:]
        if color == 'R' or color == 'G' or color == 'B':
            px_array = None
            if header['channels'][c].type == Imath.PixelType(Imath.PixelType.HALF):
                px_array = np.frombuffer(exr.channel(c, Imath.PixelType(Imath.PixelType.HALF)), dtype=np.float16)
                px_array = np.reshape(px_array, isize)
            elif header['channels'][c].type == Imath.PixelType(Imath.PixelType.FLOAT):
                px_array = np.frombuffer(exr.channel(c, Imath.PixelType(Imath.PixelType.FLOAT)), dtype=np.float32)
                px_array = np.reshape(px_array, isize)
            else:
                print('OpenEXR UINT pixel type not supported')
            
            if not channel_name in color_channels:
                color_channels[channel_name] = {'R': None, 'G': None, 'B': None}
                
            color_channels[channel_name][color] = px_array
    exr.close()
    
    left_px = hdr2srgb(color_channels['left'], isize)
    right_px = hdr2srgb(color_channels['right'], isize)
    stereo_px = np.concatenate([left_px, right_px])
    img_out = Image.fromarray(stereo_px, 'RGBA')
    img_out.save(f'{filename}.png', 'PNG')


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


main()
