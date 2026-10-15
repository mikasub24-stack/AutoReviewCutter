#!/usr/bin/env bash
# Thử bộ đổi tốc độ trên máy tính (cần Java 17+).
set -euo pipefail
cd "$(dirname "$0")/../.."
OUT="$(mktemp -d)"
S=android/app/src/main/java/vn/ninhdon/tts
javac -encoding UTF-8 -d "$OUT" $S/Stretcher.java $S/WavSpeed.java $S/WavWriter.java tools/host-test/StretchTest.java
java -Xmx512m -Dfile.encoding=UTF-8 -Dstdout.encoding=UTF-8 -cp "$OUT" StretchTest "$OUT"
