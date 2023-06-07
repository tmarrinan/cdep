import math
import os
from PIL import Image

def main():
    group_size = 8
    img_count = 0
    pixel_hole = 0.0
    projected_hole = 0.0
    
    directory = '../cpp/synthesized_views'
    files = sorted(os.listdir(directory))
    for filename in files:
        filepath = os.path.join(directory, filename)
        if os.path.splitext(filepath)[1] == '.png':
            do_hole = calculateOdsDisocclusionHoleArea(filepath);
            pixel_hole += do_hole['image_hole_percent']
            projected_hole += do_hole["projected_area_hole_percent"]
            img_count += 1
            if img_count == group_size:
                print(f'IMAGE: {filename}')
                print(f'  img pixel hole area: {100.0 * pixel_hole / group_size:.3f}%')
                print(f'  projected hole area: {100.0 * projected_hole / group_size:.3f}%')
                img_count = 0
                pixel_hole = 0.0
                projected_hole = 0.0
    
def calculateOdsDisocclusionHoleArea(ods_filename):
    # open image file
    img = Image.open(ods_filename)

    # get resolution of image
    width, i_height = img.size
    height = i_height // 2
    
    # get array of pixels
    pixels = list(img.getdata())
    
    # calculate hole sizes
    pixel_hole_count = 0
    projected_hole_percent = 0.0
    for i in range(i_height):
        row = i % height;
        lat1 = (180.0 * (row / height)) - 90.0
        lat2 = (180.0 * ((row + 1) / height)) - 90.0
        num_black = countBlackPixelsOnRow(i_height - i - 1, pixels, width)
        pixel_hole_count += num_black
        lon1 = -180.0
        lon2 = 360.0 * (num_black / width) - 180.0
        projected_hole_percent += sphereAreaQuad(lat1, lon1, lat2, lon2)
    pixel_hole_percent = pixel_hole_count / (width * i_height)
    
    return {'image_hole_percent': pixel_hole_percent, 'projected_area_hole_percent': projected_hole_percent}

def countBlackPixelsOnRow(row, pixels, width):
    """
    returns the number of black pixels on a specified row of an image
    """
    black_count = 0
    for i in range(width):
        if isBlack(pixels[row * width + i]):
            black_count += 1
    return black_count

def isBlack(pixel):
    """
    returns whether or not a pixel is black
    """
    if pixel[0] == 0 and pixel[1] == 0 and pixel[2] == 0:
        return True
    return False

def sphereAreaQuad(lat1, lon1, lat2, lon2):
    """
    returns the surface area bounded by the parallels lat1 and lat2 and the meridians
    lon1 and lon2. The output area is a fraction of the unit sphere's area of 4π, so
    the result ranges from 0.0 to 1.0.
    """
    if lat2 < lat1:
        tmp = lat1
        lat1 = lat2
        lat2 = tmp
    if lon2 < lon1:
        tmp = lon1
        lon1 = lon2
        lon2 = tmp
    lat1 = math.radians(lat1)
    lon1 = math.radians(lon1)
    lat2 = math.radians(lat2)
    lon2 = math.radians(lon2)
    height = math.sin(lat2) - math.sin(lat1)
    area = height * (lon2 - lon1)
    return area / (4.0 * math.pi)
    
    
main()
