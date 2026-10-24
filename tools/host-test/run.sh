#!/usr/bin/env bash
# Chạy thử phần tính toán (Ed25519 + định dạng key) trên máy chủ bằng JDK, không cần Android.
# Dùng: tools/host-test/run.sh [đường-dẫn private.key thật để đối chiếu thêm]
set -euo pipefail
cd "$(dirname "$0")/../.."
OUT="$(mktemp -d)"
javac -encoding UTF-8 -d "$OUT" app/src/main/java/vn/mika/capkey/Ed25519.java app/src/main/java/vn/mika/capkey/License.java tools/host-test/vn/mika/capkey/HostTest.java
java -cp "$OUT" vn.mika.capkey.HostTest "$@"
