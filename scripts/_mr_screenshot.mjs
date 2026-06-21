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
