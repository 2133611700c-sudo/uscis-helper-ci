import { chromium } from '@playwright/test'
import { mkdirSync } from 'node:fs'
const BASE = process.argv[2] || 'http://localhost:3111'
const OUT = '/tmp/shots'
mkdirSync(OUT, { recursive: true })
const browser = await chromium.launch()

// Desktop — header with a pillar dropdown open
const d = await browser.newContext({ viewport: { width: 1280, height: 800 } })
const dp = await d.newPage()
await dp.goto(`${BASE}/en`, { waitUntil: 'networkidle' })
await dp.screenshot({ path: `${OUT}/nav-desktop-light.png`, clip: { x: 0, y: 0, width: 1280, height: 120 } })
// hover the first pillar to reveal the CSS dropdown
try {
  await dp.locator('nav[aria-label="Main navigation"] .group').first().hover()
  await dp.waitForTimeout(400)
  await dp.screenshot({ path: `${OUT}/nav-desktop-dropdown.png`, clip: { x: 0, y: 0, width: 1280, height: 300 } })
} catch (e) { console.log('hover failed', e.message) }
// dark
await dp.evaluate(() => { document.documentElement.classList.add('dark'); try{localStorage.setItem('theme','dark')}catch{} })
await dp.waitForTimeout(300)
await dp.locator('nav[aria-label="Main navigation"] .group').first().hover()
await dp.waitForTimeout(400)
await dp.screenshot({ path: `${OUT}/nav-desktop-dropdown-dark.png`, clip: { x: 0, y: 0, width: 1280, height: 300 } })

// Mobile — bottom bar 4 pillars
const m = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 })
const mp = await m.newPage()
await mp.goto(`${BASE}/en`, { waitUntil: 'networkidle' })
await mp.screenshot({ path: `${OUT}/nav-mobile-light.png`, fullPage: false })
await mp.evaluate(() => { document.documentElement.classList.add('dark'); try{localStorage.setItem('theme','dark')}catch{} })
await mp.waitForTimeout(300)
await mp.screenshot({ path: `${OUT}/nav-mobile-dark.png`, fullPage: false })

await browser.close()
console.log('done')
