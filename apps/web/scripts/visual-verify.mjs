// Visual verification — screenshots key pages/states in DARK mode against a base URL.
// Usage: node scripts/visual-verify.mjs https://messenginfo.com
// Output: /tmp/shots/*.png  (gitignored temp, never committed)
import { chromium } from '@playwright/test'
import { mkdirSync } from 'node:fs'

const BASE = process.argv[2] || 'https://messenginfo.com'
const OUT = '/tmp/shots'
mkdirSync(OUT, { recursive: true })

async function setDark(page) {
  // The site uses a manual .dark class toggle. Click the theme toggle (aria-label).
  const toggle = page.locator('button[aria-label*="dark" i], button[aria-label*="тёмн" i], button[aria-label*="Switch to dark" i]').first()
  try {
    if (await toggle.count()) { await toggle.click(); await page.waitForTimeout(400) }
  } catch {}
  // Fallback: force the class + localStorage if the toggle didn't flip it.
  await page.evaluate(() => {
    document.documentElement.classList.add('dark')
    try { localStorage.setItem('theme', 'dark') } catch {}
  })
  await page.waitForTimeout(300)
}

async function shot(page, name) {
  await page.screenshot({ path: `${OUT}/${name}.png`, fullPage: false })
  console.log('shot', name)
}

const run = async () => {
  const browser = await chromium.launch()
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 })
  const page = await ctx.newPage()

  // Home (dark, mobile)
  await page.goto(`${BASE}/en`, { waitUntil: 'networkidle' })
  await setDark(page)
  await shot(page, '01-home-dark-mobile')

  // Translator wizard start (screen 1) dark
  await page.goto(`${BASE}/en/services/translate-document/start`, { waitUntil: 'networkidle' })
  await setDark(page)
  await shot(page, '02-wizard-s1-dark')

  // Advance to doc-type screen (screen 2): click the first primary CTA.
  try {
    await page.locator('.tw-btn-primary').first().click()
    await page.waitForTimeout(600)
    await shot(page, '03-wizard-s2-doctype-dark')
    // Select the passport tile (verify the white-patch fix on a selected tile)
    const tile = page.locator('.tw-doc-tile').first()
    if (await tile.count()) {
      await tile.click()
      await page.waitForTimeout(400)
      await shot(page, '04-wizard-s2-passport-selected-dark')
    }
  } catch (e) { console.log('wizard nav failed:', e.message) }

  // TPS info (dark) — stale banner / pricing area
  await page.goto(`${BASE}/en/services/tps-ukraine/info`, { waitUntil: 'networkidle' })
  await setDark(page)
  await shot(page, '05-tps-info-dark')

  await browser.close()
  console.log('done →', OUT)
}
run().catch((e) => { console.error(e); process.exit(1) })
