import { chromium } from '@playwright/test'
const B='http://localhost:3111'
const browser = await chromium.launch()
const ctx = await browser.newContext({ viewport:{width:390,height:844}, deviceScaleFactor:2 })
const p = await ctx.newPage()
await p.goto(`${B}/en/services/translate-document/start`, { waitUntil:'networkidle' })
// dark
await p.evaluate(()=>{document.documentElement.classList.add('dark')})
// screen1 -> start
await p.locator('.tw-btn-primary').first().click(); await p.waitForTimeout(500)
// screen2: pick first doc tile
await p.locator('.tw-doc-tile').first().click(); await p.waitForTimeout(400)
// advance to upload: click the primary CTA on screen 2
const cta = p.locator('.tw-screen.tw-active .tw-btn-primary').first()
if (await cta.count()) { await cta.click(); await p.waitForTimeout(600) }
// upload the test image into the file input
const input = p.locator('input[type=file]').first()
await input.setInputFiles('/tmp/testdoc.jpg')
await p.waitForTimeout(1200)
await p.screenshot({ path:'/tmp/shots/rotate-tile.png', fullPage:false })
console.log('shot done; page-tiles=', await p.locator('.tw-page-tile').count(), 'rotate-btns=', await p.locator('.tw-page-rotate').count())
await browser.close()
