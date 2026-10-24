#!/usr/bin/env bash
# Đẩy phần đuôi nhật ký lên nhánh `ci-logs` để người phụ trách đọc được khi CI lỗi.
# Dùng: publish_log.sh <tên> <tệp log> [trạng thái]
set -uo pipefail
NAME="${1:?tên}"
LOG="${2:?tệp log}"
STATUS="${3:-}"
[ -f "$LOG" ] || { echo "không có $LOG"; exit 0; }
[ -n "${GITHUB_TOKEN:-}" ] && [ -n "${GITHUB_REPOSITORY:-}" ] || { echo "thiếu GITHUB_TOKEN/GITHUB_REPOSITORY, bỏ qua"; exit 0; }

TMP="$(mktemp -d)"
REMOTE="${CI_LOGS_REMOTE:-https://x-access-token:${GITHUB_TOKEN}@github.com/${GITHUB_REPOSITORY}.git}"
STAMP="run${GITHUB_RUN_NUMBER:-0}-${NAME}"
{
    echo "# $NAME  run=${GITHUB_RUN_ID:-?} #${GITHUB_RUN_NUMBER:-?}  status=${STATUS}  $(date -u +%FT%TZ)"
    echo "## các dòng lỗi (tối đa 120)"
    grep -nE "error|Error|ERROR|FAILED|fatal|undefined reference|No such file|not found|Traceback|panicked|LỖI|THIẾU" "$LOG" | tail -n 120 | cut -c1-400
    echo
    echo "## 400 dòng cuối"
    tail -n 400 "$LOG" | cut -c1-400
} > "$TMP/body.txt"
# giữ dưới ~180 KB
tail -c 180000 "$TMP/body.txt" > "$TMP/body.cut" && mv "$TMP/body.cut" "$TMP/body.txt"

for attempt in 1 2 3 4 5; do
    rm -rf "$TMP/repo"
    if git ls-remote --exit-code --heads "$REMOTE" ci-logs >/dev/null 2>&1; then
        git clone -q --depth 1 --branch ci-logs "$REMOTE" "$TMP/repo" || continue
    else
        git init -q "$TMP/repo"
        git -C "$TMP/repo" checkout -q -b ci-logs
        git -C "$TMP/repo" remote add origin "$REMOTE"
    fi
    mkdir -p "$TMP/repo/logs"
    cp "$TMP/body.txt" "$TMP/repo/logs/$STAMP.txt"
    cp "$TMP/body.txt" "$TMP/repo/logs/latest-$NAME.txt"
    git -C "$TMP/repo" add -A
    git -C "$TMP/repo" -c user.name="ci" -c user.email="ci@users.noreply.github.com" commit -q -m "log $STAMP ($STATUS)" || exit 0
    if git -C "$TMP/repo" push -q origin ci-logs; then
        echo "[publish_log] đã đẩy logs/$STAMP.txt"
        exit 0
    fi
    sleep $((attempt * 3))
done
echo "[publish_log] không đẩy được nhật ký"
exit 0
