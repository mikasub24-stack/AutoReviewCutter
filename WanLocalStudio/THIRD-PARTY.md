# Third party components

Workflow reference: Comfy-Org/workflow_templates at a8bc07a76478dfada740fa8fa49ac87be1bff519, templates/video_wan2_2_5B_ti2v.json. MIT license and original template included in vendor/. The runtime API graph is constructed by this app: CPU text encoder, smaller dimensions, tiled VAE, SaveImage output, first-image generation without a reference. Original source: https://github.com/Comfy-Org/workflow_templates

ComfyUI and Wan weights are not redistributed in this installer. Their own licenses apply to separate installations/model downloads. Official source: https://github.com/Comfy-Org/ComfyUI and https://github.com/Wan-Video/Wan2.2 .

Packaged dependencies: CustomTkinter (MIT), darkdetect (BSD), Pillow (HPND), Python (PSF), PyInstaller (GPL with bootloader exception), imageio-ffmpeg (BSD). Distribution license files are copied into runtime/licenses during build.

The FFmpeg binary is distributed by imageio-ffmpeg/imageio-binaries, with exact version and build configuration in runtime/FFMPEG-BUILD.txt. FFmpeg licensing depends on the configuration (GPL components may be enabled). Binary/build and corresponding source information: https://github.com/imageio/imageio-binaries/tree/master/ffmpeg and https://ffmpeg.org/download.html#get-sources . Notices supplied with the binary package are included.
