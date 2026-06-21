/**
 * scripts/mr-screenshot.mjs
 *
 * Mobile screenshot of the wizard manual review banner against a live
 * deployment. Used as smoke evidence; also imported as the worker for
 * the .command helpers at the repo root.
 *
 * Usage:
 *   URL=<wizard review URL> OUT=<path/to/file.png> node scripts/mr-screenshot.mjs
 *
 * Defaults if env not set:
 *   URL = https://messenginfo.com/en/services/translate-document/session/<dev-session>/review
 *   OUT = artifacts/mobile_ux/manual_review_banner_live.png
 *
 * Behaviour:
 *   - Headless Chromium via @playwright/test (already a workspace dep)
 *   - Viewport 375x812 (iPhone SE), DPR 2, mobile UA
 *   - Waits up to 15s for [data-testid="manual-review-banner"] to render
 *   - Does NOT log any PII or session id beyond what was passed in via URL
 */

import { chromium } from '@playwright/test'
import { mkdirSync } from 'fs'
import { dirname } from 'path'

const URL = process.env.URL ?? 'https://messenginfo.com/'
const OUT = process.env.OUT ?? 'artifacts/mobile_ux/manual_review_banner_live.png'

mkdirSync(dirname(OUT), { recursive: true })

const browser = await chromium.launch({ headless: true })
try {
  const ctx = await browser.newContext({
    viewport: { width: 375, height: 812 },
    deviceScaleFactor: 2,
    userAgent:
      'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1',
  })
  const page = await ctx.newPage()
  await page.goto(URL, { waitUntil: 'networkidle', timeout: 30_000 })
  // Hook poll-cycle is 6s; wait for the banner element if present.
  // If absent (no manual review for this session), fall through to whatever
  // the page rendered — caller can interpret a missing banner as "no ticket".
  await page.waitForSelector('[data-testid="manual-review-banner"]', { timeout: 15_000 }).catch(() => {})
  await page.screenshot({ path: OUT, fullPage: false })
  console.log('saved:', OUT)
} finally {
  await browser.close()
}
