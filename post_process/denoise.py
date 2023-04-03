import math
import Imath
import OpenEXR
import numpy as np


def main():
    exr = OpenEXR.InputFile('../public/data/office_dasp_nodenoise_0.33_4k.exr')
    #exr = OpenEXR.InputFile('../public/data/office_dasp.exr')
    
    header = exr.header()
    dw = header['dataWindow']
    isize = (dw.max.y - dw.min.y + 1, dw.max.x - dw.min.x + 1)
    
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
    
    denoise_channels = {}
    for ch in color_channels:
        print(ch)
        denoise_color = depthAwareDenoise(2, color_channels[ch], depth_channel[ch], isize)
        #denoise_color = {
        #    'R': color_channels[ch]['R'].copy(),
        #    'G': color_channels[ch]['G'].copy(),
        #    'B': color_channels[ch]['B'].copy()
        #}
        denoise_channels['Image.' + ch + '.R'] = denoise_color['R'].tobytes()
        denoise_channels['Image.' + ch + '.G'] = denoise_color['G'].tobytes()
        denoise_channels['Image.' + ch + '.B'] = denoise_color['B'].tobytes()
    print(denoise_channels.keys())
    
    del header['multiView'] # doesn't like the multiview attribute
    exr_out = OpenEXR.OutputFile('../public/data/office_dasp_postdenoise_0.33_4k.exr', header)
    final_channels = {}
    for c in header['channels']:
        print(c)
        if len(c) > 8 and c[:6] == 'Image.' and (c[-2:] == '.R' or c[-2:] == '.G' or c[-2:] == '.B'):
            final_channels[c] = denoise_channels[c]
        else:
            if header['channels'][c].type == Imath.PixelType(Imath.PixelType.HALF):
                px_array = np.frombuffer(exr.channel(c, Imath.PixelType(Imath.PixelType.HALF)), dtype=np.float16)
            elif header['channels'][c].type == Imath.PixelType(Imath.PixelType.FLOAT):
                px_array = np.frombuffer(exr.channel(c, Imath.PixelType(Imath.PixelType.FLOAT)), dtype=np.float32)
            final_channels[c] = px_array.tobytes()
    exr_out.writePixels(final_channels)
    exr_out.close()
    


def depthAwareDenoise(radius, color_data, depth_data, size):
    depth_threshold = 0.02
    denoise_r = np.empty(size, dtype=color_data['R'].dtype)
    denoise_g = np.empty(size, dtype=color_data['G'].dtype)
    denoise_b = np.empty(size, dtype=color_data['B'].dtype)
    for y in range(size[0]):
        for x in range(size[1]):
            rgb = getColor(color_data, x, y)
            depth = getDepth(depth_data, x, y)
            weight = 1 / (2 * math.pi)
            total_rgb = [rgb[0] * weight, rgb[1] * weight, rgb[2] * weight]
            total_weight = weight
            for j in range(y-radius, y+radius):
                for i in range(x-radius, x+radius):
                    px = i
                    py = j
                    if px < 0:
                        px = size[1] + px
                    elif px >= size[1]:
                        px = px % size[1]

                    if py >= 0 and py < size[0] and (py != y or px != x):
                        p_depth = getDepth(depth_data, px, py)
                        if abs(p_depth - depth) < depth_threshold:
                            dx = i - x
                            dy = j - y
                            p_rgb = getColor(color_data, px, py)
                            p_weight = (math.e ** (-(dx * dx + dy * dy) / (2 * math.pi))) / (2 * math.pi)
                            total_rgb[0] += p_rgb[0] * p_weight
                            total_rgb[1] += p_rgb[1] * p_weight
                            total_rgb[2] += p_rgb[2] * p_weight
                            total_weight += p_weight
                        
            denoise_r[y][x] = total_rgb[0] / total_weight
            denoise_g[y][x] = total_rgb[1] / total_weight
            denoise_b[y][x] = total_rgb[2] / total_weight
    return {'R': denoise_r, 'G': denoise_g, 'B': denoise_b}
            

def getColor(color_data, x, y):
    return [color_data['R'][y][x], color_data['G'][y][x], color_data['B'][y][x]]
    
def getDepth(depth_data, x, y):
    return depth_data[y][x]

main()
