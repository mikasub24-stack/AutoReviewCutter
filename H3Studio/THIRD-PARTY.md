H3 Studio orchestration and UI are original code.

- MiniMax H3: https://github.com/MiniMax-AI/MiniMax-H3 . Weights are not bundled.
  The model's license applies to any deployment separately.
- Native graph follows the published node connections in Comfy-Org workflow_templates:
  https://github.com/Comfy-Org/workflow_templates/blob/main/templates/video_minimax_h3_r2v.json
  Snapshot bundled as vendor/H3-Official-Reference.json, retrieved 2026-11-14.
- H3 Easy example JSON from nkxx188/ComfyUI-MiniMaxH3-Easy,
  commit 5c026b9878d56d848f87f79628132d2df702bc01; MIT license in vendor/H3-Easy-LICENSE.txt.
  Only JSON examples are bundled, no executable custom node code or skills.
- RunningHub workflow endpoint candidate: https://www.runninghub.cn/post/2097511747551842305 .
  Authentication and inference have not been exercised by this build.
- Pillow, imageio-ffmpeg and FFmpeg: packaged from pinned dependencies.
  FFmpeg license/build configuration is included in runtime/FFMPEG-BUILD.txt and notices.
- Nuitka: compilation tool, not a hosted video provider.

No code from iPolloWork is copied into this application.
