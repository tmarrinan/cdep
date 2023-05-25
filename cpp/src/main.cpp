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
    glm::mat4 ods_projection;
} AppData;

AppData app;

void init();
void render();
void onResize(GLFWwindow* window, int width, int height);
void initializeOdsTextures();
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
        render();
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
    glViewport(0, 0, app.window_width, app.window_height);

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
    initializeOdsTextures();

    // Initialize ODS render targets
    initializeOdsRenderTargets();

    // Create ODS pointcloud model
    createOdsPointData();

    // Set ODS projection matrix
    app.ods_projection = glm::ortho(0.0, 2.0 * M_PI, M_PI, 0.0, 0.1, 50.0); // TODO: update near/far based on image
}

void render()
{
    glClearColor(0.1, 0.1, 0.4, 1.0);
    glClear(GL_COLOR_BUFFER_BIT | GL_DEPTH_BUFFER_BIT);

    
    // C-DEP
    glUseProgram(app.glsl_program["DEP"].program);

    glUniformMatrix4fv(app.glsl_program["DEP"].uniforms["ortho_projection"], 1, GL_FALSE, glm::value_ptr(app.ods_projection));

    glBindVertexArray(app.ods_vertex_array);
    glDrawArrays(GL_POINTS, 0, app.num_va_points);
    glBindVertexArray(0);

    glUseProgram(0);

    glfwSwapBuffers (app.window);
}

void onResize(GLFWwindow *window, int width, int height)
{
    app.window_width = width;
    app.window_height = height;
    glViewport(0, 0, app.window_width, app.window_height);
}

void initializeOdsTextures()
{
    // TODO: read color and depth images
    app.ods_width = 2048;
    app.ods_height = 1024;
}

void initializeOdsRenderTargets()
{

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
