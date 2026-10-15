#!/usr/bin/env bash
# Dựng bản chạy thử trên máy tính (Linux x86_64): libaudiocpp.so + libsea_g2p_rs.so + smoke.
# Kết quả nằm trong $WORK/host/{lib,bin}.
set -euo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"
ROOT="$(dirname "$HERE")"
# shellcheck disable=SC1091
source "$HERE/pins.env"
WORK="${WORK:-$ROOT/_work}"
JOBS="${JOBS:-$(nproc)}"
"$HERE/fetch_sources.sh"

OUT="$WORK/host"
mkdir -p "$OUT/lib" "$OUT/bin"

echo "::group::sea-g2p (host)"
( cd "$WORK/sea-g2p" && cargo build --release --no-default-features --features capi )
cp "$WORK/sea-g2p/target/release/libsea_g2p_rs.so" "$OUT/lib/"
echo "::endgroup::"

echo "::group::audio.cpp (host) cấu hình"
LAUNCH=()
if command -v ccache >/dev/null 2>&1; then
    LAUNCH=(-DCMAKE_C_COMPILER_LAUNCHER=ccache -DCMAKE_CXX_COMPILER_LAUNCHER=ccache)
fi
cmake -S "$WORK/audio.cpp" -B "$WORK/build-audio-host" -G Ninja \
    -DCMAKE_BUILD_TYPE=Release "${LAUNCH[@]}" \
    -DAUDIOCPP_DEPLOYMENT_BUILD=ON \
    -DAUDIOCPP_MODEL_SET=custom -DAUDIOCPP_MODELS=vieneu_v3_turbo \
    -DAUDIOCPP_BUILD_C_API=ON \
    -DENGINE_ENABLE_OPENMP=OFF -DGGML_OPENMP=OFF \
    -DENGINE_ENABLE_NATIVE_CPU=OFF -DGGML_NATIVE=OFF \
    -DENGINE_BUILD_TESTS=OFF -DENGINE_BUILD_EXAMPLES=OFF
echo "::endgroup::"
echo "::group::audio.cpp (host) biên dịch"
cmake --build "$WORK/build-audio-host" -j "$JOBS" --target audiocpp
echo "::endgroup::"
AUDIO_SO="$(find "$WORK/build-audio-host" -name 'libaudiocpp.so' -type f | head -n1)"
[ -n "$AUDIO_SO" ] || { echo "Không thấy libaudiocpp.so"; exit 11; }
cp -L "$AUDIO_SO" "$OUT/lib/libaudiocpp.so"
# smoke sẽ cần đúng SONAME của thư viện (thường là libaudiocpp.so.0): chép thêm một bản mang tên đó
SONAME="$(readelf -d "$OUT/lib/libaudiocpp.so" | sed -n 's/.*Library soname: \[\(.*\)\].*/\1/p')"
if [ -n "$SONAME" ] && [ "$SONAME" != "libaudiocpp.so" ]; then
    cp -L "$AUDIO_SO" "$OUT/lib/$SONAME"
fi

echo "::group::smoke (host)"
cmake -S "$ROOT/native" -B "$WORK/build-nd-host" -G Ninja -DCMAKE_BUILD_TYPE=Release \
    -DAUDIOCPP_INCLUDE="$WORK/audio.cpp/include" -DAUDIOCPP_LIB="$OUT/lib/libaudiocpp.so" \
    -DNINHDON_BUILD_JNI=OFF -DNINHDON_BUILD_SMOKE=ON
cmake --build "$WORK/build-nd-host" -j "$JOBS"
cp "$WORK/build-nd-host/smoke" "$OUT/bin/smoke"
echo "::endgroup::"
echo "[build_host] xong: $OUT"
ls -la "$OUT/lib" "$OUT/bin"
