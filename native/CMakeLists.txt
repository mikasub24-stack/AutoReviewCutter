cmake_minimum_required(VERSION 3.20)
project(ninhdon_native CXX)

# Dựng riêng, KHÔNG nằm trong cây của audio.cpp:
#   -DAUDIOCPP_INCLUDE=<audio.cpp>/include   -DAUDIOCPP_LIB=<đường dẫn libaudiocpp.so>
set(CMAKE_CXX_STANDARD 17)
set(CMAKE_CXX_STANDARD_REQUIRED ON)
set(CMAKE_POSITION_INDEPENDENT_CODE ON)

set(AUDIOCPP_INCLUDE "" CACHE PATH "audio.cpp include dir (có audiocpp.h)")
set(AUDIOCPP_LIB "" CACHE FILEPATH "libaudiocpp.so")
option(NINHDON_BUILD_JNI "Dựng libninhdon.so (JNI cho Android hoặc JDK)" ON)
option(NINHDON_BUILD_SMOKE "Dựng bài thử smoke (máy tính)" OFF)

if(NOT AUDIOCPP_INCLUDE OR NOT AUDIOCPP_LIB)
    message(FATAL_ERROR "Can AUDIOCPP_INCLUDE va AUDIOCPP_LIB")
endif()

add_library(audiocpp SHARED IMPORTED)
set_target_properties(audiocpp PROPERTIES IMPORTED_LOCATION "${AUDIOCPP_LIB}")
# audiocpp.h dùng AUDIOCPP_API = visibility default khi không định nghĩa gì: đủ cho thư viện .so.

add_library(ninhdon_core STATIC ninhdon_core.cpp)
target_include_directories(ninhdon_core PUBLIC "${AUDIOCPP_INCLUDE}" "${CMAKE_CURRENT_SOURCE_DIR}")
target_link_libraries(ninhdon_core PUBLIC audiocpp)

if(NINHDON_BUILD_JNI)
    add_library(ninhdon SHARED ninhdon_jni.cpp)
    target_link_libraries(ninhdon PRIVATE ninhdon_core)
    if(ANDROID)
        # jni.h có sẵn trong NDK
        target_link_options(ninhdon PRIVATE -Wl,-z,max-page-size=16384)
    else()
        find_package(JNI REQUIRED)
        target_include_directories(ninhdon PRIVATE ${JNI_INCLUDE_DIRS})
    endif()
endif()

if(NINHDON_BUILD_SMOKE)
    add_executable(smoke smoke.cpp)
    target_link_libraries(smoke PRIVATE ninhdon_core)
endif()
