import math
import numpy as np
from PIL import Image


def main():
    #truth = Image.open('C:\\Users\\tmarrinan\\Downloads\\novel_ods_truth.png')
    #dasp = Image.open('C:\\Users\\tmarrinan\\Downloads\\novel_ods_dasp.png')
    #cdep = Image.open('C:\\Users\\tmarrinan\\Downloads\\novel_ods_cdep.png')
    truth = Image.open('C:\\Users\\tmarrinan\\Downloads\\novel_ods_truth_denoise.png')
    dasp = Image.open('C:\\Users\\tmarrinan\\Downloads\\novel_ods_dasp_denoise.png')
    cdep = Image.open('C:\\Users\\tmarrinan\\Downloads\\novel_ods_cdep_denoise.png')
    
    truth_arr = np.asarray(truth)
    dasp_arr = np.asarray(dasp)
    cdep_arr = np.asarray(cdep)
    
    dasp_psnr1 = psnr1(truth_arr, dasp_arr)
    dasp_psnr2 = psnr2(truth_arr, dasp_arr)
    cdep_psnr1 = psnr1(truth_arr, cdep_arr)
    cdep_psnr2 = psnr2(truth_arr, cdep_arr)
    
    print(f'PSNR1: DASP={dasp_psnr1:.2f}, CDEP={cdep_psnr1:.2f}')
    print(f'PSNR2: DASP={dasp_psnr2:.2f}, CDEP={cdep_psnr2:.2f}')

def psnr1(img1, img2):
    err = np.subtract(img1, img2, dtype=np.int32)
    mse = np.mean(np.square(err))
    if mse == 0:
        return 100.0
    max_pixel = 255.0
    signal_noise = 20 * math.log10(max_pixel / math.sqrt(mse))
    return signal_noise

def psnr2(img1, img2):
    width = img1.shape[1]
    height = img1.shape[0]
    sq_err = 0
    num_valid = 0
    for y in range(height):
        for x in range(width):
            if img2[y][x][0] > 0 or img2[y][x][1] > 0 or img2[y][x][2] > 0:
                err_r = int(img1[y][x][0]) - int(img2[y][x][0])
                err_g = int(img1[y][x][1]) - int(img2[y][x][1])
                err_b = int(img1[y][x][2]) - int(img2[y][x][2])
                sq_err += (err_r * err_r) + (err_g * err_g) + (err_b * err_b)
                num_valid += 1
    mse = sq_err / (num_valid * 3)
    print(mse, num_valid)
    if mse == 0:
        return 100.0
    max_pixel = 255.0
    signal_noise = 20 * math.log10(max_pixel / math.sqrt(mse))
    return signal_noise


main()
