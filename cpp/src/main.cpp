#include <iostream>
#include <cmath>
#include <algorithm>
#include <numeric>
#include <random>
#include <map>
#include <string>
#include <vector>
#include "glad/gl.h"
#include <GLFW/glfw3.h>
#include <glm/mat4x4.hpp>
#include <glm/gtc/matrix_transform.hpp>
#include <glm/gtx/norm.hpp>
#include <glm/gtc/type_ptr.hpp>

#include "glslloader.h"
#include "imageio.h"
#include "textrender.h"

#ifndef M_PI
#define M_PI 3.14159265358979323846
#endif

//#define FORMAT_DASP
#define FORMAT_SOS
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
    GLuint cube_vertex_array;
    GLuint sphere_vertex_array;
    GLuint ods_vertex_array;
    GLuint num_va_points;
    GLushort num_cube_triangles;
    GLushort num_sphere_triangles;
    // Vertex attribs
    GLuint vertex_position_attrib;
    GLuint vertex_texcoord_attrib;
    GLuint vertex_normal_attrib;
    // DASP / DEP images
    int ods_width;
    int ods_height;
    OdsFormat ods_format;
    int ods_max_views;
    int ods_num_views;
    glm::mat4 ods_projection;
    float dasp_ipd;
    float dasp_focal_dist;
    std::vector<glm::vec3> camera_positions;
    std::vector<GLuint> color_textures;
    std::vector<GLuint> depth_textures;
    // Render target
    GLuint render_texture_color;
    GLuint render_texture_depth;
    GLuint render_depth_buffer;
    GLuint render_framebuffer;
    // App view
    glm::mat4 modelview;
    glm::mat4 projection;
    glm::mat4 cube_model_matrix;
    GLuint cube_texture;
    bool view_pan;
    double mouse_x;
    double mouse_y;
    double camera_yaw;
    double camera_pitch;
    double fov;
    float aperture;
    float focal_length;
    float plane_in_focus;
    glm::vec3 synthesized_position;
    int fc;
} AppData;

AppData app;

void init();
void render();
void synthesizeOdsImage(glm::vec3& camera_position);
void onResize(GLFWwindow* window, int width, int height);
void onMouseButton(GLFWwindow* window, int button, int action, int mods);
void onMouseMove(GLFWwindow* window, double x_pos, double y_pos);
void onKeyboardInput(GLFWwindow* window, int key, int scancode, int action, int mods);
void initializeOdsTextures(const char *file_prefix, float *camera_position);
void initializeOdsRenderTargets();
uint32_t mortonZIndex(uint16_t x, uint16_t y);
void blockShuffle(GLfloat* vertices, GLfloat* texcoords, uint32_t size, uint32_t block_size);
void createOdsPointData();
void createCube();
void createSphere(int stacks, int slices);
void determineViews(glm::vec3& camera_position, int num_views, std::vector<int>& view_indices);

int main(int argc, char **argv)
{
    // Initialize GLFW
    if (!glfwInit())
    {
        fprintf(stderr, "Error: could not initialize GLFW\n");
        return EXIT_FAILURE;
    }

    app.window_width = 800; //1920;
    app.window_height = 450; //1080;

    // Create a window and its OpenGL context
    glfwWindowHint(GLFW_CONTEXT_VERSION_MAJOR, 4);
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
    glfwSwapInterval(1); // 0: render as fast as possible, 1: sync render with monitor

    // Initialize GLAD OpenGL extension handling
    if (gladLoadGL(glfwGetProcAddress) == 0)
    {
        fprintf(stderr, "Error: could not initialize GLAD\n");
        return EXIT_FAILURE;
    }

    // Set window resize callback
    glfwSetWindowSizeCallback(app.window, onResize);
    // Set mouse button callback
    glfwSetMouseButtonCallback(app.window, onMouseButton);
    // Set mouse move callback
    glfwSetCursorPosCallback(app.window, onMouseMove);
    // Set keyboard input callback
    glfwSetKeyCallback(app.window, onKeyboardInput);

    // Initialize app
    init();

    // Main render loop
    uint32_t frame_count = 0;
    double fps_start = glfwGetTime();
    double start_time = fps_start;
    double t = 0.0;
    app.fc = 0;
    int num_frames = 8;
    int fps_counter = 0;
    double avg_frame_time_list[10];
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
            if (fps_counter < 10)
            {
                avg_frame_time_list[fps_counter] = avg_frame_time;
                fps_counter++;
            }
            else
            {
                double final_avg_frame_time = 0.0;
                for (int i = 0; i < 10; i++)
                {
                    final_avg_frame_time += avg_frame_time_list[i];
                }
                printf("FINAL AVG FRAME TIME: %.3lf\n", final_avg_frame_time / 10.0);
            }
        }

        // Animation - synthesize view
        t = now - start_time;
        //t += 4.0 * M_PI / num_frames;
        
        //app.synthesized_position = glm::vec3(0.0, 1.70, 0.725);
        
        //app.synthesized_position = glm::vec3(-2.37, 1.66, -13.49) + glm::vec3(0.015 * cos(0.5 * t), 0.004 * cos(t), 0.3 * sin(t));
        //app.synthesized_position = glm::vec3(-2.3902531743086084, 1.6660253403880460, -13.4645635290832);
        
        //app.synthesized_position = glm::vec3(0.0, 1.70, 0.0);
        //app.synthesized_position = glm::vec3(0.0, 1.70, 0.725) + glm::vec3(0.3175 * cos(0.5 * t), 0.15 * cos(t), 0.1425 * sin(t));
        
        glm::vec3 center = glm::vec3(0.0, 1.70, 0.725); // office
        //glm::vec3 center = glm::vec3(0.0, 1.70, 0.0); // spheres
        glm::vec3 position[8] = {
            glm::vec3( 0.317500,  0.150000,  0.000000),
            glm::vec3( 0.224506,  0.129904,  0.142500),
            glm::vec3( 0.000000,  0.075000,  0.000000),
            glm::vec3(-0.224506,  0.000000, -0.142500),
            glm::vec3(-0.317500, -0.075000,  0.000000),
            glm::vec3(-0.224506, -0.129904,  0.142500),
            glm::vec3( 0.000000, -0.150000,  0.000000),
            glm::vec3( 0.224506, -0.129904, -0.142500)
        };
        app.synthesized_position = center + position[app.fc];
        //app.synthesized_position = center + glm::vec3(0.3175 * cos(0.5 * t), 0.15 * cos(0.333333 * t), 0.1425 * sin(t));
        
        //app.plane_in_focus = 2.75 + 1.25 * cos(1.0 * t);
        //app.plane_in_focus = 5.25 + 3.5 * cos(1.0 * t);
        //printf("%.4f\n", app.plane_in_focus);
        //app.aperture = 0.031;
        //app.aperture = 0.025 + 0.015 * cos(1.0 * t);
        //app.synthesized_position = glm::vec3(0.0, 1.70, 0.0) + glm::vec3(0.3175 * cos(0.5 * t), 0.15 * cos(t), 0.1425 * sin(t));
        
        app.cube_model_matrix = glm::translate(glm::mat4(1.0), glm::vec3(-0.2, -0.6 + 0.65 * cos(0.5 * t), -1.05)) *
                                glm::scale(glm::mat4(1.0), glm::vec3(0.125, 0.125, 0.125));
        
        synthesizeOdsImage(app.synthesized_position);

        //printf("Synthesized Position: (%.4f, %.4f, %.4f)\n", app.synthesized_position[0], app.synthesized_position[1],
        //                                                     app.synthesized_position[2]);

        app.fc++;
        if (app.fc >= num_frames) exit(EXIT_SUCCESS);

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
    glEnable(GL_PROGRAM_POINT_SIZE);

    // Initialize vertex attributes
    app.vertex_position_attrib = 0;
    app.vertex_texcoord_attrib = 1;
    app.vertex_normal_attrib = 2;

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

    // Load depth ODS (no lighting / per-fragment depth) shader
    GlslProgram depth_ods;
    depth_ods.program = glsl::createShaderProgram("./resrc/shaders/depth_ods.vert", "./resrc/shaders/depth_ods.frag");
    glBindAttribLocation(depth_ods.program, app.vertex_position_attrib, "vertex_position");
    glBindAttribLocation(depth_ods.program, app.vertex_texcoord_attrib, "vertex_texcoord");
    glsl::linkShaderProgram(depth_ods.program);
    glsl::getShaderProgramUniforms(depth_ods.program, depth_ods.uniforms);
    app.glsl_program["depth_ods"] = depth_ods;

    // Load Phong lighting shader
    GlslProgram phong;
    phong.program = glsl::createShaderProgram("./resrc/shaders/phong.vert", "./resrc/shaders/phong.frag");
    glBindAttribLocation(phong.program, app.vertex_position_attrib, "vertex_position");
    glBindAttribLocation(phong.program, app.vertex_texcoord_attrib, "vertex_texcoord");
    glBindAttribLocation(phong.program, app.vertex_normal_attrib, "vertex_normal");
    glsl::linkShaderProgram(phong.program);
    glsl::getShaderProgramUniforms(phong.program, phong.uniforms);
    app.glsl_program["phong"] = phong;

    // Initialize ODS textures
#if defined(FORMAT_DASP)
    // DASP
    app.ods_format = OdsFormat::DASP;
    app.ods_num_views = 1;
    app.ods_max_views = 1;
    app.dasp_ipd = 0.7;
    app.dasp_focal_dist = 1.95;
    double near = 0.1;
    double far = 50.0;
    float cam_position[3] = {0.0, 1.7, 0.725};
    initializeOdsTextures("./resrc/images/ods_dasp_4k_left", cam_position);
    initializeOdsTextures("./resrc/images/ods_dasp_4k_right", cam_position);
    // float cam_position[3] = {0.0, 1.7, 0.0};
    // initializeOdsTextures("./resrc/images/spheres_ods_dasp_4k_left", cam_position);
    // initializeOdsTextures("./resrc/images/spheres_ods_dasp_4k_right", cam_position);
#elif defined(FORMAT_SOS)
    // SOS
    app.ods_format = OdsFormat::DASP;
    app.ods_num_views = 2;
    app.ods_max_views = 2;
    app.dasp_ipd = 0.7;
    app.dasp_focal_dist = 1.95;
    double near = 0.1;
    double far = 50.0;
    float cam_position1[3] = {0.0, 1.55, 0.725};
    float cam_position2[3] = {0.0, 1.85, 0.725};
    initializeOdsTextures("./resrc/images/ods_sos1_4k_left", cam_position1);
    initializeOdsTextures("./resrc/images/ods_sos1_4k_right", cam_position1);
    initializeOdsTextures("./resrc/images/ods_sos2_4k_left", cam_position2);
    initializeOdsTextures("./resrc/images/ods_sos2_4k_right", cam_position2);
    // float cam_position1[3] = {0.0, 1.55, 0.0};
    // float cam_position2[3] = {0.0, 1.85, 0.0};
    // initializeOdsTextures("./resrc/images/spheres_ods_sos1_4k_left", cam_position1);
    // initializeOdsTextures("./resrc/images/spheres_ods_sos1_4k_right", cam_position1);
    // initializeOdsTextures("./resrc/images/spheres_ods_sos2_4k_left", cam_position2);
    // initializeOdsTextures("./resrc/images/spheres_ods_sos2_4k_right", cam_position2);
#else
    // C-DEP
    app.ods_format = OdsFormat::CDEP;
    app.ods_num_views = 8;
    app.ods_max_views = 8;
    double near = 0.01; //0.1;
    double far = 30.0; //50.0;

    // float cam_position1[3] = {-2.3638009325989064, 1.6626330584754445, -13.1379285788494};
    // float cam_position2[3] = {-2.3431789554542077, 1.6553537411051626, -13.8433799047119};
    // //float cam_position2[3] = {-2.3431789554542077, 1.6553537411051626, -13.9133799047119};
    // float cam_position3[3] = {-2.3902531743086084, 1.6660253403880460, -13.4645635290832};
    // initializeOdsTextures("./resrc/images/hallway_2k_camera_1", cam_position1);
    // initializeOdsTextures("./resrc/images/hallway_2k_camera_2", cam_position2);
    // initializeOdsTextures("./resrc/images/hallway_2k_camera_3", cam_position3);

    float cam_position1[3] = {-0.35, 1.85, 0.55};
    float cam_position2[3] = { 0.35, 1.55, 0.90};
    float cam_position3[3] = {-0.10, 1.75, 0.85};
    float cam_position4[3] = { 0.25, 1.70, 0.60};
    float cam_position5[3] = {-0.30, 1.67, 0.75};
    float cam_position6[3] = {-0.20, 1.60, 0.70};
    float cam_position7[3] = { 0.15, 1.78, 0.57};
    float cam_position8[3] = { 0.05, 1.82, 0.87};
    initializeOdsTextures("./resrc/images/ods_cdep_4k_camera_1", cam_position1);
    initializeOdsTextures("./resrc/images/ods_cdep_4k_camera_2", cam_position2);
    initializeOdsTextures("./resrc/images/ods_cdep_4k_camera_3", cam_position3);
    initializeOdsTextures("./resrc/images/ods_cdep_4k_camera_4", cam_position4);
    initializeOdsTextures("./resrc/images/ods_cdep_4k_camera_5", cam_position5);
    initializeOdsTextures("./resrc/images/ods_cdep_4k_camera_6", cam_position6);
    initializeOdsTextures("./resrc/images/ods_cdep_4k_camera_7", cam_position7);
    initializeOdsTextures("./resrc/images/ods_cdep_4k_camera_8", cam_position8);

    // float cam_position1[3] = {-0.35, 1.85, -0.175};
    // float cam_position2[3] = { 0.35, 1.55,  0.175};
    // float cam_position3[3] = {-0.10, 1.75,  0.125};
    // float cam_position4[3] = { 0.25, 1.70, -0.125};
    // float cam_position5[3] = {-0.30, 1.67,  0.025};
    // float cam_position6[3] = {-0.20, 1.60, -0.025};
    // float cam_position7[3] = { 0.15, 1.78, -0.155};
    // float cam_position8[3] = { 0.05, 1.82,  0.145};
    // initializeOdsTextures("./resrc/images/spheres_ods_cdep_4k_camera_1", cam_position1);
    // initializeOdsTextures("./resrc/images/spheres_ods_cdep_4k_camera_2", cam_position2);
    // initializeOdsTextures("./resrc/images/spheres_ods_cdep_4k_camera_3", cam_position3);
    // initializeOdsTextures("./resrc/images/spheres_ods_cdep_4k_camera_4", cam_position4);
    // initializeOdsTextures("./resrc/images/spheres_ods_cdep_4k_camera_5", cam_position5);
    // initializeOdsTextures("./resrc/images/spheres_ods_cdep_4k_camera_6", cam_position6);
    // initializeOdsTextures("./resrc/images/spheres_ods_cdep_4k_camera_7", cam_position7);
    // initializeOdsTextures("./resrc/images/spheres_ods_cdep_4k_camera_8", cam_position8);
#endif

    // Initialize ODS render targets
    initializeOdsRenderTargets();

    // Create ODS pointcloud model
    createOdsPointData();

    // Create quad for rendering
    createCube();

    // Create sphere for rendering
    createSphere(18, 36);

    // Set ODS projection matrix
    app.ods_projection = glm::ortho(2.0 * M_PI, 0.0, M_PI, 0.0, near, far);

    // Set App view modelview and projection matrices
    app.fov = 45.0;
    app.modelview = glm::mat4(1.0);
    //app.projection = glm::perspective(75.0 * M_PI / 180.0, (double)app.window_width / (double)app.window_height, 0.1, 100.0);
    app.projection = glm::perspective(app.fov * M_PI / 180.0, (double)app.window_width / (double)app.window_height, 0.1, 100.0);
    //app.projection = glm::perspective(45.0 * M_PI / 180.0, (double)app.window_width / (double)app.window_height, 0.1, 100.0);

    app.view_pan = false;
    app.camera_yaw = 0.0;
    app.camera_pitch = 0.0;
    app.aperture = 0.027;
    app.focal_length = 0.05;
    app.plane_in_focus = 2.15;

    app.synthesized_position = glm::vec3(0.15, 1.77, 0.77);

    // Synthesize ODS image
    //synthesizeOdsImage(app.synthesized_position);


    app.cube_model_matrix = glm::translate(glm::mat4(1.0), glm::vec3(1.75, -0.2, -2.15)) *
                            glm::scale(glm::mat4(1.0), glm::vec3(0.15, 0.15, 0.15));
    // Load cube texture
    int w, h;
    int channels = 4;
    uint8_t *cube_px = iioReadImage("resrc/images/cube.png", &w, &h, &channels);
    glGenTextures(1, &(app.cube_texture));
    glBindTexture(GL_TEXTURE_2D, app.cube_texture);
    glTexParameteri(GL_TEXTURE_2D, GL_TEXTURE_MAG_FILTER, GL_LINEAR);
    glTexParameteri(GL_TEXTURE_2D, GL_TEXTURE_MIN_FILTER, GL_LINEAR);
    glTexParameteri(GL_TEXTURE_2D, GL_TEXTURE_WRAP_S, GL_CLAMP_TO_EDGE);
    glTexParameteri(GL_TEXTURE_2D, GL_TEXTURE_WRAP_T, GL_CLAMP_TO_EDGE);
    glTexImage2D(GL_TEXTURE_2D, 0, GL_RGBA, w, h, 0, GL_RGBA, GL_UNSIGNED_BYTE, cube_px);
}

void render()
{
    // Set viewport to entire screen
    glViewport(0, 0, app.window_width, app.window_height);

    // Delete previous frame (reset both framebuffer and z-buffer)
    glEnable(GL_BLEND);
    glBlendFunc(GL_SRC_ALPHA, GL_ONE_MINUS_SRC_ALPHA);
    glClearColor(0.1, 0.1, 0.4, 1.0);
    glClear(GL_COLOR_BUFFER_BIT | GL_DEPTH_BUFFER_BIT);
    
    // Draw synthesized view
    glUseProgram(app.glsl_program["depth_ods"].program);

    glm::vec2 stereo_scale = glm::vec2(1.0, 0.5);
    glm::vec2 stereo_offset = glm::vec2(0.0, 0.0); // left
    //glm::vec2 stereo_offset = glm::vec2(0.0, 0.5); // right

    glUniformMatrix4fv(app.glsl_program["depth_ods"].uniforms["modelview"], 1, GL_FALSE, glm::value_ptr(app.modelview));
    glUniformMatrix4fv(app.glsl_program["depth_ods"].uniforms["projection"], 1, GL_FALSE, glm::value_ptr(app.projection));
    glUniform2fv(app.glsl_program["depth_ods"].uniforms["texture_scale"], 1, glm::value_ptr(stereo_scale));
    glUniform2fv(app.glsl_program["depth_ods"].uniforms["texture_offset"], 1, glm::value_ptr(stereo_offset));
    glUniform1f(app.glsl_program["depth_ods"].uniforms["aperture"], app.aperture);
    glUniform1f(app.glsl_program["depth_ods"].uniforms["focal_length"], app.focal_length);
    glUniform1f(app.glsl_program["depth_ods"].uniforms["plane_in_focus"], app.plane_in_focus);

    glActiveTexture(GL_TEXTURE0);
    glBindTexture(GL_TEXTURE_2D, app.render_texture_color);
    //glUniform1i(app.glsl_program["depth_ods"].uniforms["image"], 0); // not needed - layout in shader
    glActiveTexture(GL_TEXTURE1);
    glBindTexture(GL_TEXTURE_2D, app.render_texture_depth);
    //glUniform1i(app.glsl_program["depth_ods"].uniforms["depths"], 1); // not needed - layout in shader

    glBindVertexArray(app.sphere_vertex_array);
    glDrawElements(GL_TRIANGLES, app.num_sphere_triangles, GL_UNSIGNED_SHORT, 0);
    glBindVertexArray(0);

    // Add cube to scene
    /*
    glUseProgram(app.glsl_program["phong"].program);

    glUniformMatrix4fv(app.glsl_program["phong"].uniforms["model"], 1, GL_FALSE, glm::value_ptr(app.cube_model_matrix));
    glUniformMatrix4fv(app.glsl_program["phong"].uniforms["view"], 1, GL_FALSE, glm::value_ptr(app.modelview));
    glUniformMatrix4fv(app.glsl_program["phong"].uniforms["projection"], 1, GL_FALSE, glm::value_ptr(app.projection));

    glActiveTexture(GL_TEXTURE0);
    glBindTexture(GL_TEXTURE_2D, app.cube_texture);
    glUniform1i(app.glsl_program["phong"].uniforms["image"], 0);

    glBindVertexArray(app.cube_vertex_array);
    glDrawElements(GL_TRIANGLES, app.num_cube_triangles, GL_UNSIGNED_SHORT, 0);
    glBindVertexArray(0);
    */
    
    glActiveTexture(GL_TEXTURE0);
    glBindTexture(GL_TEXTURE_2D, 0);

    glUseProgram(0);


    glfwSwapBuffers (app.window);
}

void synthesizeOdsImage(glm::vec3& camera_position)
{
    int i, j;

    // Render to texture
    glBindFramebuffer(GL_FRAMEBUFFER, app.render_framebuffer);

    // Delete previous frame (reset both framebuffer and z-buffer)
    glDisable(GL_BLEND);
    GLfloat color_bg[4] = {0.0, 0.0, 0.0, 1.0};
    GLfloat depth_bg[1] = {1000.0};
    glClearBufferfv(GL_COLOR, 0, color_bg);
    glClearBufferfv(GL_COLOR, 1, depth_bg);
    glClear(GL_DEPTH_BUFFER_BIT);

    // DASP / SOS
    if (app.ods_format == OdsFormat::DASP)
    {
        glUseProgram(app.glsl_program["DASP"].program);

        glUniform1f(app.glsl_program["DASP"].uniforms["img_ipd"], app.dasp_ipd);
        glUniform1f(app.glsl_program["DASP"].uniforms["img_focal_dist"], app.dasp_focal_dist);
        glUniform1f(app.glsl_program["DASP"].uniforms["camera_ipd"], 0.065);
        glUniform1f(app.glsl_program["DASP"].uniforms["camera_focal_dist"], 1.95);
        glUniformMatrix4fv(app.glsl_program["DASP"].uniforms["ortho_projection"], 1, GL_FALSE, glm::value_ptr(app.ods_projection));

        int num_views = std::min(app.ods_num_views, app.ods_max_views);

        // Draw right (bottom half of image) and left (top half of image) views
        for (i = 0; i < 2; i++)
        {
            glViewport(0, i * app.ods_height, app.ods_width, app.ods_height);
            glUniform1f(app.glsl_program["DASP"].uniforms["camera_eye"], 2.0 * (i - 0.5));

            for (j = 0; j < num_views; j++)
            {
                int dasp_idx = 2 * j;
                glm::vec3 relative_cam_pos = camera_position - app.camera_positions[dasp_idx];
                glUniform3fv(app.glsl_program["DASP"].uniforms["camera_position"], 1, glm::value_ptr(relative_cam_pos));

                // Left eye
                glUniform1f(app.glsl_program["DASP"].uniforms["eye"], 1.0);
                glActiveTexture(GL_TEXTURE0);
                glBindTexture(GL_TEXTURE_2D, app.color_textures[dasp_idx]);
                glUniform1i(app.glsl_program["DASP"].uniforms["image"], 0);
                glActiveTexture(GL_TEXTURE1);
                glBindTexture(GL_TEXTURE_2D, app.depth_textures[dasp_idx]);
                glUniform1i(app.glsl_program["DASP"].uniforms["depths"], 1);

                glBindVertexArray(app.ods_vertex_array);
                glDrawArrays(GL_POINTS, 0, app.num_va_points);
                glBindVertexArray(0);

                // Right eye
                glUniform1f(app.glsl_program["DASP"].uniforms["eye"], -1.0);
                glActiveTexture(GL_TEXTURE0);
                glBindTexture(GL_TEXTURE_2D, app.color_textures[dasp_idx + 1]);
                glUniform1i(app.glsl_program["DASP"].uniforms["image"], 0);
                glActiveTexture(GL_TEXTURE1);
                glBindTexture(GL_TEXTURE_2D, app.depth_textures[dasp_idx + 1]);
                glUniform1i(app.glsl_program["DASP"].uniforms["depths"], 1);

                glBindVertexArray(app.ods_vertex_array);
                glDrawArrays(GL_POINTS, 0, app.num_va_points);
                glBindVertexArray(0);
            }
        }
    }
    // DEP / C-DEP
    else
    {
        glUseProgram(app.glsl_program["DEP"].program);

        glm::mat4 view_mat1 = glm::rotate(glm::mat4(1.0), (float)(-app.camera_pitch), glm::vec3(1.0, 0.0, 0.0));
        glm::mat4 view_mat2 = glm::rotate(glm::mat4(1.0), (float)(-app.camera_yaw), glm::vec3(0.0, 1.0, 0.0));
        glm::vec4 xr_view_dir = view_mat2 * view_mat1 * glm::vec4(0.0, 0.0, -1.0, 1.0);

        glUniform1f(app.glsl_program["DEP"].uniforms["camera_ipd"], 0.065);
        glUniform1f(app.glsl_program["DEP"].uniforms["camera_focal_dist"], 1.95);
        glUniform1f(app.glsl_program["DEP"].uniforms["xr_fovy"], app.fov * M_PI / 180.0);
        glUniform1f(app.glsl_program["DEP"].uniforms["xr_aspect"], (float)app.window_width / (float)app.window_height);
        glUniform3fv(app.glsl_program["DEP"].uniforms["xr_view_dir"], 1, glm::value_ptr(xr_view_dir));
        glUniformMatrix4fv(app.glsl_program["DEP"].uniforms["ortho_projection"], 1, GL_FALSE, glm::value_ptr(app.ods_projection));

        // Get nearest N bounding images
        std::vector<int> view_indices;
        int num_views = std::min(app.ods_num_views, app.ods_max_views);
        determineViews(camera_position, num_views, view_indices);

        // Draw right (bottom half of image) and left (top half of image) views
        for (i = 0; i < 2; i++)
        {
            glViewport(0, i * app.ods_height, app.ods_width, app.ods_height);
            glUniform1f(app.glsl_program["DEP"].uniforms["camera_eye"], 2.0 * (i - 0.5));

            for (j = 0; j < num_views; j++)
            {
                glm::vec3 relative_cam_pos = camera_position - app.camera_positions[view_indices[j]];
                glUniform1f(app.glsl_program["DEP"].uniforms["img_index"], (float)j);
                glUniform3fv(app.glsl_program["DEP"].uniforms["camera_position"], 1, glm::value_ptr(relative_cam_pos));

                glActiveTexture(GL_TEXTURE0);
                glBindTexture(GL_TEXTURE_2D, app.color_textures[view_indices[j]]);
                glUniform1i(app.glsl_program["DEP"].uniforms["image"], 0);
                glActiveTexture(GL_TEXTURE1);
                glBindTexture(GL_TEXTURE_2D, app.depth_textures[view_indices[j]]);
                glUniform1i(app.glsl_program["DEP"].uniforms["depths"], 1);

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

    
    int flip = 1;
    uint8_t *pixels = new uint8_t[app.ods_width * app.ods_height * 8];
    glBindTexture(GL_TEXTURE_2D, app.render_texture_color);
    glGetTexImage(GL_TEXTURE_2D, 0, GL_RGBA, GL_UNSIGNED_BYTE, pixels);
    glBindTexture(GL_TEXTURE_2D, 0);
    char outname[96];
    //snprintf(outname, 96, "synthesized_views/office_ods_dasp_4k_%d.png", app.fc + 1);
    snprintf(outname, 96, "synthesized_views/office_ods_sos_4k_%d.png", app.fc + 1);
    //snprintf(outname, 96, "synthesized_views/office_ods_cdep_%d.%d_%02d.png", app.ods_num_views, app.ods_max_views, app.fc + 1);
    iioWriteImagePng(outname, app.ods_width, app.ods_height * 2, 4, flip, pixels);
    delete[] pixels;
}

void onResize(GLFWwindow *window, int width, int height)
{
    app.window_width = width;
    app.window_height = height;

    app.projection = glm::perspective(app.fov * M_PI / 180.0, (double)app.window_width / (double)app.window_height, 0.1, 100.0);
}

void onMouseButton(GLFWwindow* window, int button, int action, int mods)
{
    if (button == GLFW_MOUSE_BUTTON_LEFT)
    {
        if (action == GLFW_PRESS)
        {
            app.view_pan = true;
            glfwGetCursorPos(window, &(app.mouse_x), &(app.mouse_y));
        }
        else
        {
            app.view_pan = false;
        }
    }
}

void onMouseMove(GLFWwindow* window, double x_pos, double y_pos)
{
    if (app.view_pan)
    {
        double delta_x = x_pos - app.mouse_x;
        double delta_y = y_pos - app.mouse_y;

        app.camera_yaw -= 2.25 * (delta_x / (double)app.window_width); // left/right
        app.camera_pitch -= 2.25 * (delta_y / (double)app.window_height); // up/down

        app.modelview = glm::rotate(glm::mat4(1.0), (float)app.camera_pitch, glm::vec3(1.0, 0.0, 0.0));
        app.modelview = glm::rotate(app.modelview, (float)app.camera_yaw, glm::vec3(0.0, 1.0, 0.0));

        app.mouse_x = x_pos;
        app.mouse_y = y_pos;

        // app.camera_yaw = 3.0 / 4.0 * M_PI; // left/right
        // app.camera_pitch = 0.0; // up/down

        // app.modelview = glm::rotate(glm::mat4(1.0), (float)app.camera_pitch, glm::vec3(1.0, 0.0, 0.0));
        // app.modelview = glm::rotate(app.modelview, (float)app.camera_yaw, glm::vec3(0.0, 1.0, 0.0));
    }
}

void onKeyboardInput(GLFWwindow* window, int key, int scancode, int action, int mods)
{
    if (action == GLFW_PRESS || action == GLFW_REPEAT)
    {
        bool new_view = true;
        switch (key)
        {
            case GLFW_KEY_A:
                app.synthesized_position[0] -= 0.02;
                break;
            case GLFW_KEY_D:
                app.synthesized_position[0] += 0.02;
                break;
            case GLFW_KEY_F:
                app.synthesized_position[1] -= 0.02;
                break;
            case GLFW_KEY_R:
                app.synthesized_position[1] += 0.02;
                break;
            case GLFW_KEY_W:
                app.synthesized_position[2] -= 0.02;
                break;
            case GLFW_KEY_S:
                app.synthesized_position[2] += 0.02;
                break;
            default:
                new_view = false;
                break;
        }
        if (new_view)
        {
            synthesizeOdsImage(app.synthesized_position);
        }
    }
}

void initializeOdsTextures(const char *file_prefix, float *camera_position)
{
    // Read in color and depth images
    int wc, hc, wd, hd;
    float near, far;
    int channels = 4;

    char filename_png[96];
    snprintf(filename_png, 96, "%s.png", file_prefix);
    uint8_t *color = iioReadImage(filename_png, &wc, &hc, &channels);

    //char filename_rvl[96];
    //snprintf(filename_rvl, 96, "%s.rvl", file_prefix);
    //float *depth = iioReadRvlDepthImage(filename_rvl, &wd, &hd, &near, &far);
    //if (wc != wd || hc != hd)
    //{
    //    fprintf(stderr, "Warning: width/height of color and depth images do not match\n");
    //}

    char filename_depth[96];
    snprintf(filename_depth, 96, "%s.depth", file_prefix);
    char *depth_buf;
    iioReadFile(filename_depth, &depth_buf);
    float *depth = reinterpret_cast<float*>(depth_buf);

    app.ods_width = wc;
    app.ods_height = hc;

    // Create color texture
    GLuint tex_color;
    glGenTextures(1, &tex_color);
    glBindTexture(GL_TEXTURE_2D, tex_color);
    glTexParameteri(GL_TEXTURE_2D, GL_TEXTURE_MAG_FILTER, GL_NEAREST);
    glTexParameteri(GL_TEXTURE_2D, GL_TEXTURE_MIN_FILTER, GL_NEAREST);
    glTexParameteri(GL_TEXTURE_2D, GL_TEXTURE_WRAP_S, GL_CLAMP_TO_EDGE);
    glTexParameteri(GL_TEXTURE_2D, GL_TEXTURE_WRAP_T, GL_CLAMP_TO_EDGE);
    glTexImage2D(GL_TEXTURE_2D, 0, GL_RGBA, app.ods_width, app.ods_height, 0, GL_RGBA,
                 GL_UNSIGNED_BYTE, color);

    // Create depth texture
    GLuint tex_depth;
    glGenTextures(1, &tex_depth);
    glBindTexture(GL_TEXTURE_2D, tex_depth);
    glTexParameteri(GL_TEXTURE_2D, GL_TEXTURE_MAG_FILTER, GL_NEAREST);
    glTexParameteri(GL_TEXTURE_2D, GL_TEXTURE_MIN_FILTER, GL_NEAREST);
    glTexParameteri(GL_TEXTURE_2D, GL_TEXTURE_WRAP_S, GL_CLAMP_TO_EDGE);
    glTexParameteri(GL_TEXTURE_2D, GL_TEXTURE_WRAP_T, GL_CLAMP_TO_EDGE);
    glTexImage2D(GL_TEXTURE_2D, 0, GL_R32F, app.ods_width, app.ods_height, 0, GL_RED,
                 GL_FLOAT, depth);

    // Unbind textures
    glBindTexture(GL_TEXTURE_2D, 0);

    // Free memory
    iioFreeImage(color);
    //iioFreeRvlDepthImage(depth);
    free(depth);

    app.color_textures.push_back(tex_color);
    app.depth_textures.push_back(tex_depth);
    app.camera_positions.push_back(glm::vec3(camera_position[0], camera_position[1], camera_position[2]));
}

void initializeOdsRenderTargets()
{
    // Create color render texture
    glGenTextures(1, &(app.render_texture_color));
    glBindTexture(GL_TEXTURE_2D, app.render_texture_color);
    glTexParameteri(GL_TEXTURE_2D, GL_TEXTURE_MAG_FILTER, GL_LINEAR);
    glTexParameteri(GL_TEXTURE_2D, GL_TEXTURE_MIN_FILTER, GL_LINEAR);
    glTexParameteri(GL_TEXTURE_2D, GL_TEXTURE_WRAP_S, GL_REPEAT);
    glTexParameteri(GL_TEXTURE_2D, GL_TEXTURE_WRAP_T, GL_REPEAT);
    glTexImage2D(GL_TEXTURE_2D, 0, GL_RGBA, app.ods_width, 2 * app.ods_height, 0, GL_RGBA, 
                 GL_UNSIGNED_BYTE, NULL);

    // Create depth render texture
    glGenTextures(1, &(app.render_texture_depth));
    glBindTexture(GL_TEXTURE_2D, app.render_texture_depth);
    glTexParameteri(GL_TEXTURE_2D, GL_TEXTURE_MAG_FILTER, GL_LINEAR);
    glTexParameteri(GL_TEXTURE_2D, GL_TEXTURE_MIN_FILTER, GL_LINEAR);
    glTexParameteri(GL_TEXTURE_2D, GL_TEXTURE_WRAP_S, GL_REPEAT);
    glTexParameteri(GL_TEXTURE_2D, GL_TEXTURE_WRAP_T, GL_REPEAT);
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

uint32_t mortonZIndex(uint16_t x, uint16_t y)
{
    uint32_t MASKS[4] = {0x55555555, 0x33333333, 0x0F0F0F0F, 0x00FF00FF};
    uint32_t SHIFTS[4] = {1, 2, 4, 8};

    uint32_t x32 = x;
    uint32_t y32 = y;

    x32 = (x32 | (x32 << SHIFTS[3])) & MASKS[3];
    x32 = (x32 | (x32 << SHIFTS[2])) & MASKS[2];
    x32 = (x32 | (x32 << SHIFTS[1])) & MASKS[1];
    x32 = (x32 | (x32 << SHIFTS[0])) & MASKS[0];

    y32 = (y32 | (y32 << SHIFTS[3])) & MASKS[3];
    y32 = (y32 | (y32 << SHIFTS[2])) & MASKS[2];
    y32 = (y32 | (y32 << SHIFTS[1])) & MASKS[1];
    y32 = (y32 | (y32 << SHIFTS[0])) & MASKS[0];

    uint32_t morton_idx = x32 | (y32 << 1);
    return morton_idx;
}

void blockShuffle(GLfloat* vertices, GLfloat* texcoords, uint32_t size, uint32_t block_size)
{
    int i, b;
    std::random_device rd;
    std::mt19937 g(rd());
    uint32_t num_blocks = size / block_size;
    for (i = 0; i < num_blocks - 1; i++) 
    {
        int j = i + (g() % (num_blocks - i));
        int bi = block_size * i;
        int bj = block_size * j;
        for (b = 0; b < block_size; b++)
        {
            GLfloat temp_x = vertices[2 * (bj + b)];
            GLfloat temp_y = vertices[2 * (bj + b) + 1];
            vertices[2 * (bj + b)] = vertices[2 * (bi + b)];
            vertices[2 * (bj + b) + 1] = vertices[2 * (bi + b) + 1];
            vertices[2 * (bi + b)] = temp_x;
            vertices[2 * (bi + b) + 1] = temp_y;
            GLfloat temp_u = texcoords[2 * (bj + b)];
            GLfloat temp_v = texcoords[2 * (bj + b) + 1];
            texcoords[2 * (bj + b)] = texcoords[2 * (bi + b)];
            texcoords[2 * (bj + b) + 1] = texcoords[2 * (bi + b) + 1];
            texcoords[2 * (bi + b)] = temp_u;
            texcoords[2 * (bi + b) + 1] = temp_v;
        }
    }
}

void createOdsPointData()
{
    uint32_t i, j;
    uint32_t size = app.ods_width * app.ods_height;
    //uint32_t size = app.ods_width * app.ods_height * 4;

    // Create a new vertex array object
    glGenVertexArrays(1, &(app.ods_vertex_array));
    glBindVertexArray(app.ods_vertex_array);
    app.num_va_points = size;

    // Create arrays for vertex positions and texture coordinates
    // Use randomized blocks (size = 128) of morton z-order points
    // uint32_t block_size = 512;
    // uint32_t blocks_x = app.ods_width / block_size;
    // uint32_t blocks_y = app.ods_height / block_size;
    // uint32_t *block_order = new uint32_t[blocks_x * blocks_y];
    // std::random_device rd;
    // std::mt19937 g(rd());
    // std::iota(block_order, block_order + (blocks_x * blocks_y), 0);
    // std::shuffle(block_order, block_order + (blocks_x * blocks_y), g);
    GLfloat *vertices = new GLfloat[2 * size];
    GLfloat *texcoords = new GLfloat[2 * size];
    for (j = 0; j < app.ods_height; j++)
    //for (j = 0; j < app.ods_height * 2; j++)
    {
        for (i = 0; i < app.ods_width; i++)
        //for (i = 0; i < app.ods_width * 2; i++)
        {
            // uint16_t bx = i % block_size;
            // uint16_t by = j % block_size;
            // uint32_t bidx = mortonZIndex(bx, by);
            // uint32_t block = blocks_x * (j / block_size) + (i / block_size);
            // uint32_t idx = (block_size * block_size) * block + bidx;
            //uint32_t idx = (block_size * block_size) * block_order[block] + bidx;

            //uint32_t idx = mortonZIndex(i, j);
            uint32_t idx = j * app.ods_width + i;
            //uint32_t idx = j * app.ods_width * 2 + i;
            
            double norm_x = (i + 0.5) / (double)app.ods_width;
            double norm_y = (j + 0.5) / (double)app.ods_height;
            //double norm_x = (i + 0.5) / (double)(app.ods_width * 2);
            //double norm_y = (j + 0.5) / (double)(app.ods_height * 2);

            double azimuth = 2.0 * M_PI * (1.0 - norm_x);
            double inclination = M_PI * norm_y;
            vertices[2 * idx + 0] = azimuth;
            vertices[2 * idx + 1] = inclination;
            texcoords[2 * idx + 0] = norm_x;
            texcoords[2 * idx + 1] = norm_y;
        }
    }
    //blockShuffle(vertices, texcoords, size, 128);

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

    // Free memory
    delete[] vertices;
    delete[] texcoords;
}

void createCube()
{
    // Create a new vertex array object
    glGenVertexArrays(1, &(app.cube_vertex_array));
    glBindVertexArray(app.cube_vertex_array);

    // Create arrays for vertex positions and texture coordinates
    GLfloat vertices[72], texcoords[48], normals[72];
    for (int i = 0; i < 6; i++) // back, left, right, bottom, top, front
    {
        float norm_x = (i == 1) ? -1.0 : (i == 2) ? 1.0 : 0.0;
        float norm_y = (i == 3) ? -1.0 : (i == 4) ? 1.0 : 0.0;
        float norm_z = (i == 0) ? -1.0 : (i == 5) ? 1.0 : 0.0;

        if (i == 5)
        {
            vertices[12 * i + 0] =   1.0;
            vertices[12 * i + 1] =  -1.0;
            vertices[12 * i + 2] =   1.0;
            vertices[12 * i + 3] =  -1.0;
            vertices[12 * i + 4] =  -1.0;
            vertices[12 * i + 5] =   1.0;
            vertices[12 * i + 6] =  -1.0;
            vertices[12 * i + 7] =   1.0;
            vertices[12 * i + 8] =   1.0;
            vertices[12 * i + 9] =   1.0;
            vertices[12 * i + 10] =  1.0;
            vertices[12 * i + 11] =  1.0;
        }
        else if (i == 1)
        {
            vertices[12 * i + 0] = -1.0;
            vertices[12 * i + 1] = -1.0;
            vertices[12 * i + 2] =  1.0;
            vertices[12 * i + 3] = -1.0;
            vertices[12 * i + 4] = -1.0;
            vertices[12 * i + 5] = -1.0;
            vertices[12 * i + 6] = -1.0;
            vertices[12 * i + 7] =  1.0;
            vertices[12 * i + 8] = -1.0;
            vertices[12 * i + 9] = -1.0;
            vertices[12 * i + 10] = 1.0;
            vertices[12 * i + 11] = 1.0;
        }
        else if (i == 2)
        {
            vertices[12 * i + 0] =   1.0;
            vertices[12 * i + 1] =  -1.0;
            vertices[12 * i + 2] =  -1.0;
            vertices[12 * i + 3] =   1.0;
            vertices[12 * i + 4] =  -1.0;
            vertices[12 * i + 5] =   1.0;
            vertices[12 * i + 6] =   1.0;
            vertices[12 * i + 7] =   1.0;
            vertices[12 * i + 8] =   1.0;
            vertices[12 * i + 9] =   1.0;
            vertices[12 * i + 10] =  1.0;
            vertices[12 * i + 11] = -1.0;
        }
        else if (i == 3)
        {
            vertices[12 * i + 0] =  -1.0;
            vertices[12 * i + 1] =  -1.0;
            vertices[12 * i + 2] =   1.0;
            vertices[12 * i + 3] =   1.0;
            vertices[12 * i + 4] =  -1.0;
            vertices[12 * i + 5] =   1.0;
            vertices[12 * i + 6] =   1.0;
            vertices[12 * i + 7] =  -1.0;
            vertices[12 * i + 8] =  -1.0;
            vertices[12 * i + 9] =  -1.0;
            vertices[12 * i + 10] = -1.0;
            vertices[12 * i + 11] = -1.0;
        }
        else if (i == 4)
        {
            vertices[12 * i + 0] =  -1.0;
            vertices[12 * i + 1] =   1.0;
            vertices[12 * i + 2] =  -1.0;
            vertices[12 * i + 3] =   1.0;
            vertices[12 * i + 4] =   1.0;
            vertices[12 * i + 5] =  -1.0;
            vertices[12 * i + 6] =   1.0;
            vertices[12 * i + 7] =   1.0;
            vertices[12 * i + 8] =   1.0;
            vertices[12 * i + 9] =  -1.0;
            vertices[12 * i + 10] =  1.0;
            vertices[12 * i + 11] =  1.0;
        }
        else if (i == 0)
        {
            vertices[12 * i + 0] =  -1.0;
            vertices[12 * i + 1] =  -1.0;
            vertices[12 * i + 2] =  -1.0;
            vertices[12 * i + 3] =   1.0;
            vertices[12 * i + 4] =  -1.0;
            vertices[12 * i + 5] =  -1.0;
            vertices[12 * i + 6] =   1.0;
            vertices[12 * i + 7] =   1.0;
            vertices[12 * i + 8] =  -1.0;
            vertices[12 * i + 9] =  -1.0;
            vertices[12 * i + 10] =  1.0;
            vertices[12 * i + 11] = -1.0;
        }
        

        texcoords[8 * i + 0] = 0.0;
        texcoords[8 * i + 1] = 0.0;
        texcoords[8 * i + 2] = 1.0;
        texcoords[8 * i + 3] = 0.0;
        texcoords[8 * i + 4] = 1.0;
        texcoords[8 * i + 5] = 1.0;
        texcoords[8 * i + 6] = 0.0;
        texcoords[8 * i + 7] = 1.0;

        normals[12 * i + 0] = norm_x;
        normals[12 * i + 1] = norm_y;
        normals[12 * i + 2] = norm_z;
        normals[12 * i + 3] = norm_x;
        normals[12 * i + 4] = norm_y;
        normals[12 * i + 5] = norm_z;
        normals[12 * i + 6] = norm_x;
        normals[12 * i + 7] = norm_y;
        normals[12 * i + 8] = norm_z;
        normals[12 * i + 9] = norm_x;
        normals[12 * i + 10] = norm_y;
        normals[12 * i + 11] = norm_z;
    }

    GLushort indices[36] = {
         0,  1,  2,  0,  2,  3,
         4,  5,  6,  4,  6,  7,
         8,  9, 10,  8, 10, 11,
        12, 13, 14, 12, 14, 15,
        16, 17, 18, 16, 18, 19,
        20, 21, 22, 20, 22, 23
    };

    // Create buffer to store vertex positions
    GLuint vertex_position_buffer;
    glGenBuffers(1, &vertex_position_buffer);
    glBindBuffer(GL_ARRAY_BUFFER, vertex_position_buffer);
    glBufferData(GL_ARRAY_BUFFER, 72 * sizeof(GLfloat), vertices, GL_STATIC_DRAW);
    glEnableVertexAttribArray(app.vertex_position_attrib);
    glVertexAttribPointer(app.vertex_position_attrib, 3, GL_FLOAT, false, 0, 0);

    // Create buffer to store vertex texcoords
    GLuint vertex_texcoord_buffer;
    glGenBuffers(1, &vertex_texcoord_buffer);
    glBindBuffer(GL_ARRAY_BUFFER, vertex_texcoord_buffer);
    glBufferData(GL_ARRAY_BUFFER, 48 * sizeof(GLfloat), texcoords, GL_STATIC_DRAW);
    glEnableVertexAttribArray(app.vertex_texcoord_attrib);
    glVertexAttribPointer(app.vertex_texcoord_attrib, 2, GL_FLOAT, false, 0, 0);

    // Create buffer to store vertex normals
    GLuint vertex_normal_buffer;
    glGenBuffers(1, &vertex_normal_buffer);
    glBindBuffer(GL_ARRAY_BUFFER, vertex_normal_buffer);
    glBufferData(GL_ARRAY_BUFFER, 72 * sizeof(GLfloat), normals, GL_STATIC_DRAW);
    glEnableVertexAttribArray(app.vertex_normal_attrib);
    glVertexAttribPointer(app.vertex_normal_attrib, 3, GL_FLOAT, false, 0, 0);

    // Create buffer to store indices of each point
    GLuint vertex_index_buffer;
    glGenBuffers(1, &vertex_index_buffer);
    glBindBuffer(GL_ELEMENT_ARRAY_BUFFER, vertex_index_buffer);
    glBufferData(GL_ELEMENT_ARRAY_BUFFER, 36 * sizeof(GLushort), indices, GL_STATIC_DRAW);

    app.num_cube_triangles = 36;

    // Unbind vertex array object and its buffers
    glBindVertexArray(0);
    glBindBuffer(GL_ARRAY_BUFFER, 0);
    glBindBuffer(GL_ELEMENT_ARRAY_BUFFER, 0);
}

void createSphere(int stacks, int slices)
{
    int i, j;

    // Create a new vertex array object
    glGenVertexArrays(1, &(app.sphere_vertex_array));
    glBindVertexArray(app.sphere_vertex_array);

    // Create arrays for vertex positions and texture coordinates
    int num_vertices = (stacks + 1) * (slices + 1);
    GLfloat *vertices = new GLfloat[3 * num_vertices];
    GLfloat *texcoords = new GLfloat[2 * num_vertices];
    GLushort *indices = new GLushort[6 * stacks * slices];
    int v = 0;
    int q = 0;
    for (j = 0; j <= stacks; j++)
    {
        double norm_inc = ((double)j / (double)stacks);
        for (i = 0; i <= slices; i++)
        {
            double norm_azm = ((double)i / (double)slices);
            texcoords[2 * v + 0] = 1.0 - norm_azm;
            texcoords[2 * v + 1] = 1.0 - norm_inc;
            double theta = 2.0 * M_PI * norm_azm;
            double phi = M_PI * norm_inc;
            vertices[3 * v + 0] = sin(phi) * sin(theta);
            vertices[3 * v + 1] = cos(phi);
            vertices[3 * v + 2] = sin(phi) * cos(theta);
            v++;
            if (j < stacks && i < slices)
            {
                indices[6 * q + 0] = j * (slices + 1) + i;
                indices[6 * q + 1] = j * (slices + 1) + (i + 1);
                indices[6 * q + 2] = (j + 1) * (slices + 1) + (i + 1);
                indices[6 * q + 3] = j * (slices + 1) + i;
                indices[6 * q + 4] = (j + 1) * (slices + 1) + (i + 1);
                indices[6 * q + 5] = (j + 1) * (slices + 1) + i;
                q++;
            }
        }
    }

    // Create buffer to store vertex positions
    GLuint vertex_position_buffer;
    glGenBuffers(1, &vertex_position_buffer);
    glBindBuffer(GL_ARRAY_BUFFER, vertex_position_buffer);
    glBufferData(GL_ARRAY_BUFFER, 3 * num_vertices * sizeof(GLfloat), vertices, GL_STATIC_DRAW);
    glEnableVertexAttribArray(app.vertex_position_attrib);
    glVertexAttribPointer(app.vertex_position_attrib, 3, GL_FLOAT, false, 0, 0);

    // Create buffer to store vertex texcoords
    GLuint vertex_texcoord_buffer;
    glGenBuffers(1, &vertex_texcoord_buffer);
    glBindBuffer(GL_ARRAY_BUFFER, vertex_texcoord_buffer);
    glBufferData(GL_ARRAY_BUFFER, 2 * num_vertices * sizeof(GLfloat), texcoords, GL_STATIC_DRAW);
    glEnableVertexAttribArray(app.vertex_texcoord_attrib);
    glVertexAttribPointer(app.vertex_texcoord_attrib, 2, GL_FLOAT, false, 0, 0);

    // Create buffer to store indices of each point
    GLuint vertex_index_buffer;
    glGenBuffers(1, &vertex_index_buffer);
    glBindBuffer(GL_ELEMENT_ARRAY_BUFFER, vertex_index_buffer);
    glBufferData(GL_ELEMENT_ARRAY_BUFFER, 6 * stacks * slices * sizeof(GLushort), indices, GL_STATIC_DRAW);

    app.num_sphere_triangles = 6 * stacks * slices;

    // Unbind vertex array object and its buffers
    glBindVertexArray(0);
    glBindBuffer(GL_ARRAY_BUFFER, 0);
    glBindBuffer(GL_ELEMENT_ARRAY_BUFFER, 0);
}

void determineViews(glm::vec3& camera_position, int num_views, std::vector<int>& view_indices)
{
    // Start by adding bounding corners (in num_views >= 2)
    if (num_views >= 2)
    {
        view_indices.push_back(0);
        view_indices.push_back(1);
    }

    // Continue adding closest views
    int i, j;
    for (j = view_indices.size(); j < num_views; j++)
    {
        float closest_dist2 = 9.9e12;
        int closest_index = -1;
        for (i = 0; i < app.ods_num_views; i++)
        {
            if (std::find(view_indices.begin(), view_indices.end(), i) != view_indices.end())
            {
                continue;
            }
            float dist2 = glm::distance2(camera_position, app.camera_positions[i]);
            if (dist2 < closest_dist2)
            {
                closest_dist2 = dist2;
                closest_index = i;
            }
        }
        view_indices.push_back(closest_index);
    }

    /*
    // Start by finding the closest view
    int i, j, closest_sign_x, closest_sign_y, closest_sign_z;
    float closest_dist2 = 9.9e12;
    int closest_index = -1;
    int x_diff = 0;
    int y_diff = 0;
    int z_diff = 0;
    for (i = 0; i < app.ods_num_views; i++)
    {
        glm::vec3 camera_dir = camera_position - app.camera_positions[i];
        float dist2 = glm::length2(camera_dir);
        if (dist2 < closest_dist2)
        {
            closest_dist2 = dist2;
            closest_index = i;
            closest_sign_x = std::signbit(camera_dir[0]);
            closest_sign_y = std::signbit(camera_dir[1]);
            closest_sign_z = std::signbit(camera_dir[2]);
        }
    }
    view_indices.push_back(closest_index);

    // Add closest views that differ in maximum number of axes
    if (num_views >= 2)
    {
        int diff_axis = 0; // 0: all, 1: x, 2: y, 3: z
        for (j = 1; j < num_views; j++)
        {
            int next_index = -1;
            float next_dist2 = 9.9e12;
            int next_dim_diff = 0;
            for (i = 0; i < app.ods_num_views; i++)
            {
                if (std::find(view_indices.begin(), view_indices.end(), i) != view_indices.end())
                {
                    continue;
                }

                glm::vec3 camera_dir = camera_position - app.camera_positions[i];
                float dist2 = glm::length2(camera_dir);
                int camera_sign_x = std::signbit(camera_dir[0]);
                int camera_sign_y = std::signbit(camera_dir[1]);
                int camera_sign_z = std::signbit(camera_dir[2]);

                int cam_diff_x = x_diff || (closest_sign_x ^ camera_sign_x);
                int cam_diff_y = y_diff || (closest_sign_y ^ camera_sign_y);
                int cam_diff_z = z_diff || (closest_sign_z ^ camera_sign_z);
                int dim_diff;
                if (diff_axis == 0)      dim_diff = cam_diff_x + cam_diff_y + cam_diff_z;
                else if (diff_axis == 1) dim_diff = cam_diff_x + (1 - cam_diff_y) + (1 - cam_diff_z);
                else if (diff_axis == 2) dim_diff = (1 - cam_diff_x) + cam_diff_y + (1 - cam_diff_z);
                else                     dim_diff = (1 - cam_diff_x) + (1 - cam_diff_y) + cam_diff_z;
                if (dim_diff > next_dim_diff || (dim_diff == next_dim_diff && dist2 < next_dist2))
                {
                    next_dim_diff = dim_diff;
                    x_diff = cam_diff_x;
                    y_diff = cam_diff_y;
                    z_diff = cam_diff_z;
                    next_dist2 = dist2;
                    next_index = i;
                }
            }
            view_indices.push_back(next_index);
            diff_axis = (diff_axis + 1) % 4;
        }
    }
    */

    // Sort based on distance
    for (i = 0; i < view_indices.size() - 1; i++)
    {
        for (j = 0; j < view_indices.size() - 1 - i; j++)
        {
            float d1 = glm::distance2(camera_position, app.camera_positions[view_indices[j]]);
            float d2 = glm::distance2(camera_position, app.camera_positions[view_indices[j + 1]]);
            if (d2 < d1)
            {
                int tmp_idx = view_indices[i];
                view_indices[i] = view_indices[j];
                view_indices[j] = tmp_idx;
            }
        }
    }
}
