#!/bin/bash
# Capture mobile screenshot of the live Manual Review banner in READY bucket.
# Saves: artifacts/mobile_ux/manual_review_banner_ready.png

set -u
cd "$(dirname "$0")" || exit 1
LOG="$(pwd)/.save-mr-ready-screenshot.log"
exec > >(tee "$LOG") 2>&1

SESSION_ID="3c49bc6c-af3d-455b-b0d0-479e54a623da"
URL="https://messenginfo.com/en/services/translate-document/session/${SESSION_ID}/review"
OUT="$(pwd)/artifacts/mobile_ux/manual_review_banner_ready.png"

echo "URL=$URL"
echo "OUT=$OUT"

URL="$URL" OUT="$OUT" node "$(pwd)/scripts/_mr_screenshot.mjs"
ls -la "$OUT"
echo "Done."
