#!/usr/bin/env bash
# Dựng toàn bộ thư viện native cho Android arm64 và chép vào jniLibs của app:
#   libsea_g2p_rs.so (Rust)  libaudiocpp.so + libggml*.so + libggml-cpu-*.so  libninhdon.so (JNI)  libc++_shared.so
set -euo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"
ROOT="$(dirname "$HERE")"
# shellcheck disable=SC1091
source "$HERE/pins.env"
WORK="${WORK:-$ROOT/_work}"
JOBS="${JOBS:-$(nproc)}"
API=29
NDK="${ANDROID_NDK_HOME:-${ANDROID_NDK_LATEST_HOME:-}}"
if [ -z "$NDK" ] || [ ! -d "$NDK" ]; then
    echo "Không thấy Android NDK (ANDROID_NDK_HOME=$NDK)"; exit 10
fi
TOOLCHAIN="$NDK/toolchains/llvm/prebuilt/linux-x86_64"
JNI_OUT="$ROOT/android/app/src/main/jniLibs/arm64-v8a"
STAGE="$WORK/android-libs"
echo "NDK: $NDK"
"$TOOLCHAIN/bin/clang" --version | head -n1

"$HERE/fetch_sources.sh"
rm -rf "$STAGE" "$JNI_OUT"
mkdir -p "$STAGE" "$JNI_OUT"

# ---------------------------------------------------------------- 1. sea-g2p (Rust)
echo "::group::sea-g2p (Android)"
rustup target add aarch64-linux-android
export CC_aarch64_linux_android="$TOOLCHAIN/bin/aarch64-linux-android${API}-clang"
export AR_aarch64_linux_android="$TOOLCHAIN/bin/llvm-ar"
export CARGO_TARGET_AARCH64_LINUX_ANDROID_LINKER="$CC_aarch64_linux_android"
export RUSTFLAGS="-C link-arg=-Wl,-z,max-page-size=16384"
( cd "$WORK/sea-g2p" && cargo build --release --target aarch64-linux-android --no-default-features --features capi )
cp "$WORK/sea-g2p/target/aarch64-linux-android/release/libsea_g2p_rs.so" "$STAGE/"
unset RUSTFLAGS
echo "::endgroup::"

# ---------------------------------------------------------------- 2. audio.cpp
build_audio() {  # build_audio <thư mục build>
    local B="$1"
    local LAUNCH=()
    if command -v ccache >/dev/null 2>&1; then
        LAUNCH=(-DCMAKE_C_COMPILER_LAUNCHER=ccache -DCMAKE_CXX_COMPILER_LAUNCHER=ccache)
    fi
    cmake -S "$WORK/audio.cpp" -B "$B" -G Ninja \
        -DCMAKE_TOOLCHAIN_FILE="$NDK/build/cmake/android.toolchain.cmake" \
        -DANDROID_ABI=arm64-v8a -DANDROID_PLATFORM="android-$API" -DANDROID_STL=c++_shared \
        -DCMAKE_BUILD_TYPE=Release "${LAUNCH[@]}" \
        -DCMAKE_PLATFORM_NO_VERSIONED_SONAME=ON \
        -DCMAKE_SHARED_LINKER_FLAGS="-Wl,-z,max-page-size=16384" \
        -DCMAKE_MODULE_LINKER_FLAGS="-Wl,-z,max-page-size=16384" \
        -DAUDIOCPP_DEPLOYMENT_BUILD=ON \
        -DAUDIOCPP_MODEL_SET=custom -DAUDIOCPP_MODELS=vieneu_v3_turbo \
        -DAUDIOCPP_BUILD_C_API=ON \
        -DENGINE_ENABLE_CPU_ALL_VARIANTS=ON \
        -DENGINE_ENABLE_OPENMP=OFF -DGGML_OPENMP=OFF \
        -DENGINE_ENABLE_LLAMAFILE=OFF -DGGML_LLAMAFILE=OFF \
        -DENGINE_BUILD_TESTS=OFF -DENGINE_BUILD_EXAMPLES=OFF
    # chỉ dựng thư viện C API; các biến thể CPU (libggml-cpu-*.so) là phụ thuộc của ggml nên tự được dựng theo
    cmake --build "$B" -j "$JOBS" --target audiocpp
}

echo "::group::audio.cpp (Android) lần 1: đủ biến thể CPU"
AB="$WORK/build-audio-android"
if ! build_audio "$AB"; then
    echo "::endgroup::"
    echo "!!! Lần 1 lỗi. Thử lần 2: bỏ các biến thể armv9.2 (SVE/SME) khỏi ggml."
    echo "::group::audio.cpp (Android) lần 2: bỏ armv9.2"
    sed -i '/ggml_add_cpu_backend_variant(android_armv9\.2/d' "$WORK/audio.cpp/external/ggml/src/CMakeLists.txt"
    rm -rf "$AB"
    build_audio "$AB"
fi
echo "::endgroup::"

# gom thư viện
find "$AB" -name '*.so' -type f \( -name 'libaudiocpp*.so' -o -name 'libggml*.so' \) -print0 | while IFS= read -r -d '' f; do
    cp -L "$f" "$STAGE/$(basename "$f")"
done
[ -f "$STAGE/libaudiocpp.so" ] || { echo "Không thấy libaudiocpp.so sau khi dựng"; find "$AB" -name '*.so*' | head -50; exit 11; }

# ---------------------------------------------------------------- 3. libninhdon.so (JNI)
echo "::group::libninhdon (JNI)"
cmake -S "$ROOT/native" -B "$WORK/build-nd-android" -G Ninja \
    -DCMAKE_TOOLCHAIN_FILE="$NDK/build/cmake/android.toolchain.cmake" \
    -DANDROID_ABI=arm64-v8a -DANDROID_PLATFORM="android-$API" -DANDROID_STL=c++_shared \
    -DCMAKE_BUILD_TYPE=Release \
    -DAUDIOCPP_INCLUDE="$WORK/audio.cpp/include" -DAUDIOCPP_LIB="$STAGE/libaudiocpp.so" \
    -DNINHDON_BUILD_JNI=ON -DNINHDON_BUILD_SMOKE=OFF
cmake --build "$WORK/build-nd-android" -j "$JOBS"
cp "$WORK/build-nd-android/libninhdon.so" "$STAGE/"
cp "$TOOLCHAIN/sysroot/usr/lib/aarch64-linux-android/libc++_shared.so" "$STAGE/"
echo "::endgroup::"

# ---------------------------------------------------------------- 4. kiểm tra + chép vào app
echo "::group::kiểm tra thư viện"
python3 "$ROOT/tools/check_libs.py" "$STAGE" --readelf "$TOOLCHAIN/bin/llvm-readelf" --fix
echo "::endgroup::"
cp "$STAGE"/*.so "$JNI_OUT/"
echo "[build_android] đã chép vào $JNI_OUT:"
ls -la "$JNI_OUT"
du -sh "$JNI_OUT"
