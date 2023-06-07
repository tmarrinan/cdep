#ifndef IMAGEIO_H
#define IMAGEIO_H

#include <iostream>
#include "stb_image.h"
#include "stb_image_write.h"

uint8_t* iioReadImage(const char *filename, int *width, int *height, int *channels);
float* iioReadRvlDepthImage(const char *filename, int *width, int *height, float *near, float *far);
void iioFreeImage(uint8_t *image);
void iioFreeRvlDepthImage(float *image);
int iioWriteImageJpeg(const char *filename, int width, int height, int channels, int flip, int quality, uint8_t *pixels);
int iioWriteImagePng(const char *filename, int width, int height, int channels, int flip, uint8_t *pixels);

static int iioDecodeVle(int *p_buffer, int &p_idx, int &word, int &nibbles_written);
int iioReadFile(const char* filename, char** data_ptr);

#endif // IMAGEIO_H
