import Imath
import OpenEXR
import numpy as np


def main():
    #exr = OpenEXR.InputFile('../public/data/office_dasp_nodenoise_0.33_4k.exr')
    exr = OpenEXR.InputFile('../public/data/office_dasp.exr')
    
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
   
    for ch in color_channels:
        print(ch)
        depthAwareDenoise(color_channels[ch], depth_channel[ch], isize)

def depthAwareDenoise(color_data, depth_data, size):
    for y in range(size[0]):
        for x in range(size[1]):
            rgb = getColor(color_data, x, y)
            depth = getDepth(depth_data, x, y)
            # TODO: get 8 surrounding pixels as well
            if x == 0 and y == 0:
                print(rgb, depth)
            

def getColor(color_data, x, y):
    return [color_data['R'][y][x], color_data['G'][y][x], color_data['B'][y][x]]
    
def getDepth(depth_data, x, y):
    return depth_data[y][x]

main()
