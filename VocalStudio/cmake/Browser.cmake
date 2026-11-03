# Official stable CEF distribution. Browser subprocess sandbox remains enabled.
set(CEF_VERSION "156.0.15+gcf671c0+chromium-156.0.8078.80")
FetchContent_Declare(cef_binary
  URL "https://cef-builds.spotifycdn.com/cef_binary_${CEF_VERSION}_windows64_minimal.tar.bz2"
  URL_HASH SHA1=b690e035689ee20ba9d2500ac8953815bc7ed46a
  DOWNLOAD_EXTRACT_TIMESTAMP TRUE)
FetchContent_GetProperties(cef_binary)
if(NOT cef_binary_POPULATED)
  FetchContent_Populate(cef_binary)
endif()
set(CEF_ROOT "${cef_binary_SOURCE_DIR}")
set(CMAKE_MODULE_PATH ${CMAKE_MODULE_PATH} "${CEF_ROOT}/cmake")
set(USE_SANDBOX ON CACHE BOOL "Sandbox Chromium subprocesses" FORCE)
set(USE_ATL OFF CACHE BOOL "CEF ATL" FORCE)
set(CEF_RUNTIME_LIBRARY_FLAG "/MT")
find_package(CEF REQUIRED)
add_subdirectory("${CEF_LIBCEF_DLL_WRAPPER_PATH}" libcef_dll_wrapper)
ADD_LOGICAL_TARGET(libcef_lib "${CEF_LIB_RELEASE}" "${CEF_LIB_RELEASE}")
target_include_directories(VocalStudio PRIVATE "${CEF_ROOT}")
target_compile_definitions(VocalStudio PRIVATE CEF_USE_BOOTSTRAP UNICODE _UNICODE NOMINMAX WIN32_LEAN_AND_MEAN)
target_link_libraries(VocalStudio PRIVATE libcef_lib libcef_dll_wrapper ${CEF_STANDARD_LIBS})
target_link_options(VocalStudio PRIVATE /DELAYLOAD:libcef.dll)
add_custom_command(TARGET VocalStudio POST_BUILD
  COMMAND ${CMAKE_COMMAND} -E copy_directory "${CEF_ROOT}/Release" "$<TARGET_FILE_DIR:VocalStudio>"
  COMMAND ${CMAKE_COMMAND} -E copy_directory "${CEF_ROOT}/Resources" "$<TARGET_FILE_DIR:VocalStudio>"
  COMMAND ${CMAKE_COMMAND} -E copy "${CEF_ROOT}/Release/bootstrap.exe" "$<TARGET_FILE_DIR:VocalStudio>/VocalStudio.exe"
  COMMAND ${CMAKE_COMMAND} -E copy "${CEF_ROOT}/LICENSE.txt" "$<TARGET_FILE_DIR:VocalStudio>/CEF-LICENSE.txt")
# Low-privilege AppContainer access is required by Chromium's renderer sandbox.
add_custom_command(TARGET VocalStudio POST_BUILD COMMAND icacls "$<TARGET_FILE_DIR:VocalStudio>" /grant "*S-1-15-2-2:(OI)(CI)(RX)")
