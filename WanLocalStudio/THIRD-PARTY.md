# Third party components

Workflow reference: Comfy-Org/workflow_templates at a8bc07a76478dfada740fa8fa49ac87be1bff519, templates/video_wan2_2_5B_ti2v.json. MIT license and original template included in vendor/. The runtime API graph is constructed by this app: CPU text encoder, smaller dimensions, tiled VAE, SaveImage output, first-image generation without a reference. Original source: https://github.com/Comfy-Org/workflow_templates

ComfyUI and Wan weights are not redistributed in this installer. Their own licenses apply to separate installations/model downloads. Official source: https://github.com/Comfy-Org/ComfyUI and https://github.com/Wan-Video/Wan2.2 .

Packaged dependencies: CustomTkinter (MIT), darkdetect (BSD), Pillow (HPND), Python (PSF), Nuitka 4.3.5 (AGPLv3 with Nuitka Runtime Library Exception 1.0), imageio-ffmpeg (BSD). Distribution license files are copied into runtime/licenses during build.

The FFmpeg binary is distributed by imageio-ffmpeg/imageio-binaries, with exact version and build configuration in runtime/FFMPEG-BUILD.txt. FFmpeg licensing depends on the configuration (GPL components may be enabled). Binary/build and corresponding source information: https://github.com/imageio/imageio-binaries/tree/master/ffmpeg and https://ffmpeg.org/download.html#get-sources . Notices supplied with the binary package are included.

Automatic setup downloads the official ComfyUI NVIDIA CUDA 12.6 portable release v0.45.0 from https://github.com/Comfy-Org/ComfyUI/releases/tag/v0.45.0 . Published archive SHA-256: e7d1be2bd81deec3f46a89e29b8c6826f45c05609f29d6681d7876f687d69d29 . The installer itself does not redistribute that archive or the model weights. Their licenses/notices remain in the downloaded distribution; model sources are Comfy-Org/Wan_2.2_ComfyUI_Repackaged and Comfy-Org/Wan_2.1_ComfyUI_repackaged on Hugging Face.

7-Zip executable/library are packaged from the Windows build runner installation, with shipped binary hashes in BuildManifest.json and License/copying notices in runtime/licenses. 7-Zip is primarily LGPL, with unRAR restrictions described by its license. Source and exact source versions are available at https://www.7-zip.org/download.html and https://github.com/ip7z/7zip . No 7-Zip installer is run on the user's machine.

HunyuanVideo 1.5: https://github.com/Tencent-Hunyuan/HunyuanVideo-1.5 ; model licensing: https://github.com/Tencent-Hunyuan/HunyuanVideo-1.5/blob/main/LICENSE . Weights are downloaded separately, not redistributed in Setup. Repackaged sources: https://huggingface.co/Comfy-Org/HunyuanVideo_1.5_repackaged and https://huggingface.co/Comfy-Org/sigclip_vision_384 . Their respective model licenses apply; the workflow MIT license does not license the model weights.

Bundled Hunyuan 720p I2V/T2V reference templates were retrieved from Comfy-Org/workflow_templates main on 2026-11-12, templates/video_hunyuan_video_1.5_720p_i2v.json and video_hunyuan_video_1.5_720p_t2v.json, under the included MIT workflow license. Runtime graph excludes super-resolution stages, loads FP8, uses CPU text encoding and full-context tiled decoding, and optionally conditions SigCLIP on the saved original identity rather than the scene start image. This adaptation has not been verified with GPU inference.
