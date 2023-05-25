#ifndef IMAGEIO_H
#define IMAGEIO_H

#include "stb_image.h"
#include "stb_image_write.h"

uint8_t* iioReadImage(const char *filename, int *width, int *height, int *channels);
void iioFreeImage(uint8_t *image);
int iioWriteImageJpeg(const char *filename, int width, int height, int channels, int quality, uint8_t *pixels);
int iioWriteImagePng(const char *filename, int width, int height, int channels, uint8_t *pixels);

#endif // IMAGEIO_H
