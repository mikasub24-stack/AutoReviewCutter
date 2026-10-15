#!/usr/bin/env bash
# Tải mã nguồn audio.cpp và sea-g2p đúng bản đã cố định vào $WORK.
set -euo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"
ROOT="$(dirname "$HERE")"
# shellcheck disable=SC1091
source "$HERE/pins.env"
WORK="${WORK:-$ROOT/_work}"
mkdir -p "$WORK"

fetch() {  # fetch <dir> <repo> <sha>
    local dir="$WORK/$1" repo="$2" sha="$3"
    if [ -d "$dir/.git" ] && [ "$(git -C "$dir" rev-parse HEAD 2>/dev/null)" = "$sha" ]; then
        echo "[fetch] $1 đã có ($sha)"
        return
    fi
    rm -rf "$dir"
    git init -q "$dir"
    git -C "$dir" remote add origin "$repo"
    git -C "$dir" fetch -q --depth 1 origin "$sha"
    git -C "$dir" checkout -q FETCH_HEAD
    echo "[fetch] $1 -> $(git -C "$dir" rev-parse HEAD)"
}

fetch audio.cpp "$AUDIOCPP_REPO" "$AUDIOCPP_SHA"
fetch sea-g2p "$SEAG2P_REPO" "$SEAG2P_SHA"
