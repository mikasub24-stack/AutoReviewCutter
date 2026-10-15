#!/usr/bin/env bash
# Chạy thử phần tính toán cắt cảnh trên máy tính (cần: java 17+, ffmpeg, ffprobe).
set -euo pipefail
cd "$(dirname "$0")/../.."
OUT="$(mktemp -d)"
javac -encoding UTF-8 -d "$OUT" app/src/main/java/com/autoreview/cutter/Scenes.java tools/host-test/com/autoreview/cutter/HostTest.java
java -Dfile.encoding=UTF-8 -Dstdout.encoding=UTF-8 -cp "$OUT" com.autoreview.cutter.HostTest
