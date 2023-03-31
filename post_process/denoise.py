import Imath
import OpenEXR
import numpy as np


def main():
    exr = OpenEXR.InputFile('../public/data/office_dasp_nodenoise_0.33_4k.exr')
    
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
        if len(c) > 2 and (c[-2:] == '.R' or c[-2:] == '.G' or c[-2:] == '.B'):
            channel_name = c[:-2]
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
    for ch in color_channels:
        print(ch)
        print(color_channels[ch])

main()
