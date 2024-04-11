import math
import os
from PIL import Image


def main():
    base_directory = 'C:\\Users\\tmarrinan\\OneDrive - University of St. Thomas\\Publications\\0 - 2024 IMX\\ODS Tests'
    test_directory = os.path.join(base_directory, 'Synthesized Images\\Spheres')
    truth_directory = os.path.join(base_directory, 'Truth Images\\Spheres')
    formats = ['spheres_ods_dasp_4k', 'spheres_ods_sos_4k', 'spheres_ods_cdep_4k_2.2', 'spheres_ods_cdep_4k_4.3',
               'spheres_ods_cdep_4k_4.4', 'spheres_ods_cdep_4k_8.3', 'spheres_ods_cdep_4k_8.8']
    truth = 'spheres_ods_truth_4k'
    for fmt in formats:
        pixel_psnr = 0.0
        sphere_psnr = 0.0
        for i in range(8):
            filepath = os.path.join(test_directory, f'{fmt}_{i+1}.png')
            truthpath = os.path.join(truth_directory, f'{truth}_{i+1}.png')
            signal_noise = psnr(filepath, truthpath)
            pixel_psnr += signal_noise['pixel']
            sphere_psnr += signal_noise['sphere']
        print(fmt)
        print(f'  PSNR: {pixel_psnr / 8}, WS-PSNR {sphere_psnr / 8}')
    
def psnr(testname, truthname):
    test = Image.open(testname)
    truth = Image.open(truthname)
    width, i_height = test.size
    height = i_height // 2
    
    test_px = list(test.getdata())
    truth_px = list(truth.getdata())
    
    sq_err = 0
    sphere_sq_err = 0
    num_valid = 0
    sphere_valid_total = 0.0
    for i in range(i_height):
        r = i_height - i - 1
        row = i % height;
        lat1 = (180.0 * (row / height)) - 90.0
        lat2 = (180.0 * ((row + 1) / height)) - 90.0
        lon1 = -180.0
        lon2 = 360.0 * (1.0 / width) - 180.0
        sphere_weight = sphereAreaQuad(lat1, lon1, lat2, lon2)
        for j in range(width):
            if not isBlack(test_px[r * width + j]):
                err_r = int(test_px[r * width + j][0]) - int(truth_px[r * width + j][0])
                err_g = int(test_px[r * width + j][1]) - int(truth_px[r * width + j][1])
                err_b = int(test_px[r * width + j][2]) - int(truth_px[r * width + j][2])
                err2 = (err_r * err_r) + (err_g * err_g) + (err_b * err_b)
                sq_err += err2
                sphere_sq_err += sphere_weight * err2
                num_valid += 1
                sphere_valid_total += sphere_weight
    max_pixel = 255.0
    mse = sq_err / (num_valid * 3)
    signal_noise = 20 * math.log10(max_pixel / math.sqrt(mse))
    sphere_mse = sphere_sq_err / (sphere_valid_total * 3)
    sphere_signal_noise = 20 * math.log10(max_pixel / math.sqrt(sphere_mse))
    return {'pixel': signal_noise, 'sphere': sphere_signal_noise}

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
