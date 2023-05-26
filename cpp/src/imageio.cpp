#define STB_IMAGE_IMPLEMENTATION
#define STB_IMAGE_WRITE_IMPLEMENTATION
#include "imageio.h"

uint8_t* iioReadImage(const char *filename, int *width, int *height, int *channels)
{
    return stbi_load(filename, width, height, channels, *channels);
}

float* iioReadRvlDepthImage(const char *filename, int *width, int *height, float *near, float *far)
{
    char *rvl;
    iioReadFile(filename, &rvl);
    if (rvl == NULL || rvl[0] != 82 || rvl[1] != 86 || rvl[2] != 76 || rvl[3] != 10) // "RVL\n"
    {
        fprintf(stderr, "Error: could not read RVL depth image\n");
        return NULL;
    }
    *width = *((uint32_t*)(rvl + 4));
    *height = *((uint32_t*)(rvl + 8));
    *near = *((float*)(rvl + 12));
    *far = *((float*)(rvl + 16));
    int *p_buffer = (int*)(rvl + 20);
    int num_pixels = (*width) * (*height);
    float *output = (float*)malloc(num_pixels * sizeof(float));
    int o_idx = 0;
    int p_idx = 0;
    int word = 0;
    int nibbles_written = 0;
    short current[2] = {0, 0};

    int num_pixels_to_decode = num_pixels;
    while (num_pixels_to_decode > 0)
    {
        int zeros = iioDecodeVle(p_buffer, p_idx, word, nibbles_written);
        num_pixels_to_decode -= zeros;
        while (zeros > 0)
        {
            output[o_idx] = *far;
            o_idx++;
            zeros--;
        }
        int nonzeros = iioDecodeVle(p_buffer, p_idx, word, nibbles_written);
        num_pixels_to_decode -= nonzeros;
        while (nonzeros > 0)
        {
            int positive = iioDecodeVle(p_buffer, p_idx, word, nibbles_written); // nonzero value
            int delta = (positive >> 1) ^ -(positive & 1);
            current[0] = current[1] + delta;
            float d = 1.0 - ((*(uint16_t*)current) / 65535.0);
            output[o_idx] = (2.0 * (*near) * (*far)) / ((*far) + (*near) - ((d * 2.0) - 1.0) * ((*far) - (*near))); 
            o_idx++;
            current[1] = current[0];
            nonzeros--;
        }
    }

    return output;
}

void iioFreeImage(uint8_t *image)
{
    stbi_image_free(image);
}

void iioFreeRvlDepthImage(float *image)
{
    free(image);
}

int iioWriteImageJpeg(const char *filename, int width, int height, int channels, int quality, uint8_t *pixels)
{
    return stbi_write_jpg(filename, width, height, channels, pixels, quality);
}

int iioWriteImagePng(const char *filename, int width, int height, int channels, uint8_t *pixels)
{
    return stbi_write_png(filename, width, height, channels, pixels, width * channels);
}

//
int iioDecodeVle(int *p_buffer, int &p_idx, int &word, int &nibbles_written)
{
    uint32_t nibble;
    int value = 0;
    int bits = 29;
    do
    {
        if (!nibbles_written)
        {
            word = p_buffer[p_idx]; // load word
            p_idx++;
            nibbles_written = 8;
        }
        nibble = word & 0xf0000000;
        value |= (nibble << 1) >> bits;
        word <<= 4;
        nibbles_written--;
        bits -= 3;
    } while (nibble & 0x80000000);
    return value;
}

int iioReadFile(const char* filename, char** data_ptr)
{
    FILE *fp;
    int err = 0;
    *data_ptr = NULL;
#ifdef _WIN32
    err = fopen_s(&fp, filename, "rb");
#else
    fp = fopen(filename, "rb");
#endif
    if (err != 0 || fp == NULL)
    {
        fprintf(stderr, "Error: cannot open %s\n", filename);
        return -1;
    }

    fseek(fp, 0, SEEK_END);
    int fsize = ftell(fp);
    fseek(fp, 0, SEEK_SET);

    *data_ptr = (char*)malloc(fsize);
    size_t read = fread(*data_ptr, fsize, 1, fp);
    if (read != 1)
    {
        fprintf(stderr, "Error: cannot read %s\n", filename);
        free(*data_ptr);
        *data_ptr = NULL;
        return -1;
    }

    fclose(fp);

    return fsize;
}
