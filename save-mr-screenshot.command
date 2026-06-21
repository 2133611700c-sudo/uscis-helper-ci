#!/bin/bash
# Capture mobile screenshot of the live Manual Review banner.
# Double-click in Finder. Uses Playwright (already in workspace deps).
# Saves: artifacts/mobile_ux/manual_review_banner_live.png

set -u
cd "$(dirname "$0")" || exit 1
LOG="$(pwd)/.save-mr-screenshot.log"
exec > >(tee "$LOG") 2>&1

SESSION_ID="${1:-3c49bc6c-af3d-455b-b0d0-479e54a623da}"
OUT_NAME="${2:-manual_review_banner_live.png}"
URL="https://messenginfo.com/en/services/translate-document/session/${SESSION_ID}/review"
OUT="$(pwd)/artifacts/mobile_ux/${OUT_NAME}"

echo "===================================================="
echo "Manual review banner screenshot capture"
echo "Date: $(date)"
echo "URL:  $URL"
echo "OUT:  $OUT"
echo "===================================================="

mkdir -p "$(dirname "$OUT")"

# Find a chromium/playwright runtime
if ! command -v node >/dev/null 2>&1; then
  echo "ERROR: node not found"
  exit 1
fi

cat > "$(pwd)/scripts/_mr_screenshot.mjs" <<EOF
import { chromium } from '@playwright/test'

const URL = process.env.URL
const OUT = process.env.OUT

const browser = await chromium.launch({ headless: true })
const ctx = await browser.newContext({
  viewport: { width: 375, height: 812 },
  deviceScaleFactor: 2,
  userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1',
})
const page = await ctx.newPage()
await page.goto(URL, { waitUntil: 'networkidle', timeout: 30000 })
// Wait for the manual-review-banner to appear (poll completes within ~6s)
await page.waitForSelector('[data-testid="manual-review-banner"]', { timeout: 15000 })
await page.screenshot({ path: OUT, fullPage: false })
console.log('saved:', OUT)
await browser.close()
EOF

URL="$URL" OUT="$OUT" node "$(pwd)/scripts/_mr_screenshot.mjs"

ls -la "$OUT" 2>&1 | head -2
echo "Done. Press Cmd-W to close."
