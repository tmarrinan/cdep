#include <iostream>
#include <cmath>
#include <map>
#include <string>
#include "glad/gl.h"
#include <GLFW/glfw3.h>
#include <glm/mat4x4.hpp>
#include <glm/gtc/matrix_transform.hpp>
#include <glm/gtc/type_ptr.hpp>

#include "glslloader.h"
#include "imageio.h"
#include "textrender.h"

#ifndef M_PI
#define M_PI 3.14159265358979323846
#endif

#define WINDOW_TITLE "CDEP Demo"

enum OdsFormat {DASP, CDEP};

typedef struct GlslProgram {
    GLuint program;
    std::map<std::string,GLint> uniforms;
} GlslProgram;

typedef struct AppData {
    // OpenGL window
    int window_width;
    int window_height;
    GLFWwindow *window;
    // GLSL programs
    std::map<std::string,GlslProgram> glsl_program;
    // Vertex array
    GLuint ods_vertex_array;
    GLuint num_va_points;
    // Vertex attribs
    GLuint vertex_position_attrib;
    GLuint vertex_texcoord_attrib;
    // DASP / DEP images
    int ods_width;
    int ods_height;
    OdsFormat ods_format;
    glm::mat4 ods_projection;
    // Render target
    GLuint render_texture_color;
    GLuint render_texture_depth;
    GLuint render_depth_buffer;
    GLuint render_framebuffer;
} AppData;

AppData app;

void init();
void render(glm::vec3& camera_position);
void synthesizeOdsImage(glm::vec3& camera_position);
void onResize(GLFWwindow* window, int width, int height);
void initializeOdsTextures(const char *file_prefix);
void initializeOdsRenderTargets();
void createOdsPointData();

int main(int argc, char **argv)
{
    // Initialize GLFW
    if (!glfwInit())
    {
        fprintf(stderr, "Error: could not initialize GLFW\n");
        return EXIT_FAILURE;
    }

    app.window_width = 1280;
    app.window_height = 720;

    // Create a window and its OpenGL context
    glfwWindowHint(GLFW_CONTEXT_VERSION_MAJOR, 3);
    glfwWindowHint(GLFW_CONTEXT_VERSION_MINOR, 3);
    glfwWindowHint(GLFW_OPENGL_FORWARD_COMPAT, GL_TRUE);
    glfwWindowHint(GLFW_OPENGL_PROFILE, GLFW_OPENGL_CORE_PROFILE);
    app.window = glfwCreateWindow(app.window_width, app.window_height, "CDEP Demo", NULL, NULL);

    if (app.window == NULL)
    {
        fprintf(stderr, "Error: could not create window\n");
        return EXIT_FAILURE;
    }

    // Make window's context current
    glfwMakeContextCurrent(app.window);
    glfwSwapInterval(0); // 0: render as fast as possible, 1: sync render with monitor

    // Initialize GLAD OpenGL extension handling
    if (gladLoadGL(glfwGetProcAddress) == 0)
    {
        fprintf(stderr, "Error: could not initialize GLAD\n");
        return EXIT_FAILURE;
    }

    // Set window resize callback
    glfwSetWindowSizeCallback(app.window, onResize);

    // Initialize app
    init();

    // Main render loop
    uint32_t frame_count = 0;
    double fps_start = glfwGetTime();
    glm::vec3 camera_pos = glm::vec3(0.15, 1.77, 0.77);
    while (!glfwWindowShouldClose(app.window))
    {
        // Print frame rate
        double now = glfwGetTime();
        if ((now - fps_start) >= 2.0)
        {
            double avg_frame_time = (1000.0 * (now - fps_start)) / frame_count;
            printf("Avg Render Time: %.3lf ms\n", avg_frame_time);
            frame_count = 0;
            fps_start = now;
        }

        // Render next frame
        render(camera_pos);
        glfwPollEvents();

        // Increment frame counter
        frame_count++;
    }

    // Clean up
    glfwDestroyWindow(app.window);
    glfwTerminate();

    return EXIT_SUCCESS;
}

void init()
{
    // Set OpenGL settings
    glEnable(GL_DEPTH_TEST);

    // Initialize vertex attributes
    app.vertex_position_attrib = 0;
    app.vertex_texcoord_attrib = 1;

    // Load DASP shader
    GlslProgram dasp;
    dasp.program = glsl::createShaderProgram("./resrc/shaders/dasp.vert", "./resrc/shaders/dasp.frag");
    glBindAttribLocation(dasp.program, app.vertex_position_attrib, "vertex_position");
    glBindAttribLocation(dasp.program, app.vertex_texcoord_attrib, "vertex_texcoord");
    glsl::linkShaderProgram(dasp.program);
    glsl::getShaderProgramUniforms(dasp.program, dasp.uniforms);
    app.glsl_program["DASP"] = dasp;

    // Load DEP shader
    GlslProgram dep;
    dep.program = glsl::createShaderProgram("./resrc/shaders/dep.vert", "./resrc/shaders/dep.frag");
    glBindAttribLocation(dep.program, app.vertex_position_attrib, "vertex_position");
    glBindAttribLocation(dep.program, app.vertex_texcoord_attrib, "vertex_texcoord");
    glsl::linkShaderProgram(dep.program);
    glsl::getShaderProgramUniforms(dep.program, dep.uniforms);
    app.glsl_program["DEP"] = dep;

    // Initialize ODS textures
    app.ods_format = OdsFormat::CDEP;
    initializeOdsTextures("./resrc/images/ods_cdep_camera_1");
    initializeOdsTextures("./resrc/images/ods_cdep_camera_2");
    initializeOdsTextures("./resrc/images/ods_cdep_camera_3");

    // Initialize ODS render targets
    initializeOdsRenderTargets();

    // Create ODS pointcloud model
    createOdsPointData();

    // Set ODS projection matrix
    app.ods_projection = glm::ortho(0.0, 2.0 * M_PI, M_PI, 0.0, 0.1, 50.0); // TODO: update near/far based on image
}

void render(glm::vec3& camera_position)
{
    // Synthesize ODS image
    synthesizeOdsImage(camera_position);

    // Delete previous frame (reset both framebuffer and z-buffer)
    glClearColor(0.1, 0.1, 0.4, 1.0);
    glClear(GL_COLOR_BUFFER_BIT | GL_DEPTH_BUFFER_BIT);

    // Set viewport to entire screen
    glViewport(0, 0, app.window_width, app.window_height);


    glfwSwapBuffers (app.window);
}

void synthesizeOdsImage(glm::vec3& camera_position)
{
    int i, j;

    // Render to texture
    glBindFramebuffer(GL_FRAMEBUFFER, app.render_framebuffer);

    // Delete previous frame (reset both framebuffer and z-buffer)
    glClearColor(1.0, 0.0, 0.0, 1.0);
    glClear(GL_COLOR_BUFFER_BIT | GL_DEPTH_BUFFER_BIT);

    // DASP
    if (app.ods_format == OdsFormat::DASP)
    {

    }
    // C-DEP
    else
    {
        glUseProgram(app.glsl_program["DEP"].program);

        glUniform1f(app.glsl_program["DEP"].uniforms["camera_ipd"], 0.065);
        glUniform1f(app.glsl_program["DEP"].uniforms["camera_focal_dist"], 1.95);
        glUniformMatrix4fv(app.glsl_program["DEP"].uniforms["ortho_projection"], 1, GL_FALSE, glm::value_ptr(app.ods_projection));

        // TODO: sort images based on closest

        // Draw right (bottom half of image) and left (top half of image) views
        for (i = 0; i < 2; i++)
        {
            glViewport(0, i * app.ods_height, app.ods_width, app.ods_height);
            glUniform1f(app.glsl_program["DEP"].uniforms["camera_eye"], 2.0 * (i - 0.5));

            for (j = 0; j < 3; j++)
            {
                glBindVertexArray(app.ods_vertex_array);
                glDrawArrays(GL_POINTS, 0, app.num_va_points);
                glBindVertexArray(0);
            }
        }
    }

    glActiveTexture(GL_TEXTURE0);
    glBindTexture(GL_TEXTURE_2D, 0);
    glUseProgram(0);
    glBindFramebuffer(GL_FRAMEBUFFER, 0);
}

void onResize(GLFWwindow *window, int width, int height)
{
    app.window_width = width;
    app.window_height = height;
}

void initializeOdsTextures(const char *file_prefix)
{
    int wc, hc, wd, hd;
    float near, far;
    int channels = 4;
    char filename_png[96];
    char filename_rvl[96];
    snprintf(filename_png, 96, "%s.png", file_prefix);
    snprintf(filename_rvl, 96, "%s.rvl", file_prefix);
    uint8_t *color = iioReadImage(filename_png, &wc, &hc, &channels);
    float *depth = iioReadRvlDepthImage(filename_rvl, &wd, &hd, &near, &far);
    if (wc != wd || hc != hd)
    {
        fprintf(stderr, "Warning: width/height of color and depth images do not match\n");
    }
    app.ods_width = wc;
    app.ods_height = hc;

    printf("%dx%d: near=%.3f, far=%.3f, center depth=%.3f\n", app.ods_width, app.ods_height,
           near, far, depth[(app.ods_height / 2) * app.ods_width + (app.ods_width / 2)]);
}

void initializeOdsRenderTargets()
{
    // Create color render texture
    glGenTextures(1, &(app.render_texture_color));
    glBindTexture(GL_TEXTURE_2D, app.render_texture_color);
    glTexParameteri(GL_TEXTURE_2D, GL_TEXTURE_MAG_FILTER, GL_LINEAR);
    glTexParameteri(GL_TEXTURE_2D, GL_TEXTURE_MIN_FILTER, GL_LINEAR);
    glTexParameteri(GL_TEXTURE_2D, GL_TEXTURE_WRAP_S, GL_CLAMP_TO_EDGE);
    glTexParameteri(GL_TEXTURE_2D, GL_TEXTURE_WRAP_T, GL_CLAMP_TO_EDGE);
    glTexImage2D(GL_TEXTURE_2D, 0, GL_RGBA, app.ods_width, 2 * app.ods_height, 0, GL_RGBA, 
                 GL_UNSIGNED_BYTE, NULL);

    // Create depth render texture
    glGenTextures(1, &(app.render_texture_depth));
    glBindTexture(GL_TEXTURE_2D, app.render_texture_depth);
    glTexParameteri(GL_TEXTURE_2D, GL_TEXTURE_MAG_FILTER, GL_LINEAR);
    glTexParameteri(GL_TEXTURE_2D, GL_TEXTURE_MIN_FILTER, GL_LINEAR);
    glTexParameteri(GL_TEXTURE_2D, GL_TEXTURE_WRAP_S, GL_CLAMP_TO_EDGE);
    glTexParameteri(GL_TEXTURE_2D, GL_TEXTURE_WRAP_T, GL_CLAMP_TO_EDGE);
    glTexImage2D(GL_TEXTURE_2D, 0, GL_R32F, app.ods_width, 2 * app.ods_height, 0, GL_RED, 
                 GL_FLOAT, NULL);

    // Unbind textures
    glBindTexture(GL_TEXTURE_2D, 0);

    // Create depth buffer object
    glGenRenderbuffers(1, &(app.render_depth_buffer));
    glBindRenderbuffer(GL_RENDERBUFFER, app.render_depth_buffer);
    glRenderbufferStorage(GL_RENDERBUFFER, GL_DEPTH_COMPONENT24, app.ods_width, 2 * app.ods_height);

    // Unbind depth buffer object
    glBindRenderbuffer(GL_RENDERBUFFER, 0);

    // Create framebuffer object
    glGenFramebuffers(1, &(app.render_framebuffer));
    glBindFramebuffer(GL_FRAMEBUFFER, app.render_framebuffer);
    glFramebufferTexture2D(GL_FRAMEBUFFER, GL_COLOR_ATTACHMENT0, GL_TEXTURE_2D,
                           app.render_texture_color, 0);
    glFramebufferTexture2D(GL_FRAMEBUFFER, GL_COLOR_ATTACHMENT1, GL_TEXTURE_2D,
                           app.render_texture_depth, 0);
    glFramebufferRenderbuffer(GL_FRAMEBUFFER, GL_DEPTH_ATTACHMENT, GL_RENDERBUFFER,
                              app.render_depth_buffer);
    GLenum draw_buffers[2] = {GL_COLOR_ATTACHMENT0, GL_COLOR_ATTACHMENT1};
    glDrawBuffers(2, draw_buffers);

    // Unbind framebuffer object
    glBindFramebuffer(GL_FRAMEBUFFER, 0);
}

void createOdsPointData()
{
    uint32_t i, j;
    uint32_t size = app.ods_width * app.ods_height;

    // Create a new vertex array object
    glGenVertexArrays(1, &(app.ods_vertex_array));
    glBindVertexArray(app.ods_vertex_array);
    app.num_va_points = size;

    // Create arrays for vertex positions and texture coordinates
    GLfloat *vertices = new GLfloat[2 * size];
    GLfloat *texcoords = new GLfloat[2 * size];
    for (j = 0; j < app.ods_height; j++)
    {
        for (i = 0; i < app.ods_width; i++)
        {
            uint32_t idx = j * app.ods_width + i;
            double norm_x = (i + 0.5) / (double)app.ods_width;
            double norm_y = (j + 0.5) / (double)app.ods_height;
            double azimuth = 2.0 * M_PI * (1.0 - norm_x);
            double inclination = M_PI * (1.0 - norm_y);
            vertices[2 * idx + 0] = azimuth;
            vertices[2 * idx + 1] = inclination;
            texcoords[2 * idx + 0] = norm_x;
            texcoords[2 * idx + 1] = norm_y;
        }
    }

    // Create buffer to store vertex positions
    GLuint vertex_position_buffer;
    glGenBuffers(1, &vertex_position_buffer);
    glBindBuffer(GL_ARRAY_BUFFER, vertex_position_buffer);
    glBufferData(GL_ARRAY_BUFFER, 2 * size * sizeof(GLfloat), vertices, GL_STATIC_DRAW);
    glEnableVertexAttribArray(app.vertex_position_attrib);
    glVertexAttribPointer(app.vertex_position_attrib, 2, GL_FLOAT, false, 0, 0);

    // Create buffer to store vertex texcoords
    GLuint vertex_texcoord_buffer;
    glGenBuffers(1, &vertex_texcoord_buffer);
    glBindBuffer(GL_ARRAY_BUFFER, vertex_texcoord_buffer);
    glBufferData(GL_ARRAY_BUFFER, 2 * size * sizeof(GLfloat), texcoords, GL_STATIC_DRAW);
    glEnableVertexAttribArray(app.vertex_texcoord_attrib);
    glVertexAttribPointer(app.vertex_texcoord_attrib, 2, GL_FLOAT, false, 0, 0);

    // Unbind vertex array object and its buffers
    glBindVertexArray(0);
    glBindBuffer(GL_ARRAY_BUFFER, 0);
}
