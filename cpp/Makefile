# Check for OS (Windows, Linux, Mac OS)
ifeq ($(OS),Windows_NT)
	DETECTED_OS:= Windows
else
	DETECTED_OS:= $(shell uname)
endif

# Set compiler and flags
ifeq ($(DETECTED_OS),Windows)
CXX= g++
else
CXX= mpicxx
endif
CXXFLAGS+= -std=c++11

# Set source and output directories
SRCDIR= src
OBJDIR= obj
BINDIR= bin

# Set up include and libray directories
ifeq ($(DETECTED_OS),Windows)
	INC= -I"$(HOMEPATH)\local\include" -I"$(HOMEPATH)\local\include\freetype2" -I.\include
	LIB= -L"$(HOMEPATH)\local\lib" -lglfw3dll -lfreetype
else
	INC= -I$(HOME)/local/include -I$(HOME)/local/include/freetype2 -I./include
	LIB= -L$(HOME)/local/lib -lglfw -lfreetype
endif

# Create output directories and set output file names
ifeq ($(DETECTED_OS),Windows)
	mkobjdir:= $(shell if not exist $(OBJDIR) mkdir $(OBJDIR))
	mkbindir:= $(shell if not exist $(BINDIR) mkdir $(BINDIR))

	OBJS= $(addprefix $(OBJDIR)\, main.o gl.o glslloader.o imageio.o textrender.o)
	EXEC= $(addprefix $(BINDIR)\, cdep_example.exe)
else
	mkdirs:= $(shell mkdir -p $(OBJDIR) $(BINDIR))
	
	OBJS= $(addprefix $(OBJDIR)/, main.o gl.o glslloader.o imageio.o textrender.o)
	EXEC= $(addprefix $(BINDIR)/, cdep_example)
endif


# BUILD EVERYTHING
all: $(EXEC)

$(EXEC): $(OBJS)
	$(CXX) -o $@ $^ $(LIB)

ifeq ($(DETECTED_OS),Windows)
$(OBJDIR)\\%.o: $(SRCDIR)\%.c
	$(CXX) $(CXXFLAGS) -c -o $@ $< $(INC)

$(OBJDIR)\\%.o: $(SRCDIR)\%.cpp
	$(CXX) $(CXXFLAGS) -c -o $@ $< $(INC)
else
$(OBJDIR)/%.o: $(SRCDIR)/%.c
	$(CXX) $(CXXFLAGS) -c -o $@ $< $(INC)

$(OBJDIR)/%.o: $(SRCDIR)/%.cpp
	$(CXX) $(CXXFLAGS) -c -o $@ $< $(INC)
endif


# REMOVE OLD FILES
ifeq ($(DETECTED_OS),Windows)
clean:
	del $(OBJS) $(EXEC)
else
clean:
	rm -f $(OBJS) $(EXEC)
endif
