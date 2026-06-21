#!/usr/bin/env node
import fs from 'node:fs'
import path from 'node:path'
import { chromium } from '@playwright/test'

const outDir = path.resolve('docs/reports/evidence/t3ps-pdf-proof')
const dlDir = path.join(outDir, 'part7-yes')
fs.mkdirSync(dlDir, { recursive: true })
const riskCase = process.env.RISK_CASE || 'criminal'

const browser = await chromium.launch({ headless: true })
const context = await browser.newContext({ viewport: { width: 390, height: 844 }, locale: 'ru-RU' })
const page = await context.newPage()
const base = 'https://messenginfo.com/ru/services/tps-ukraine/start'
const fixture = path.resolve('test-fixtures/synthetic-passport.jpg')
let zipPath = null

await page.route('**/api/tps/generate-packet', async (route) => {
  const req = route.request()
  if (req.method() !== 'POST') return route.continue()
  const resp = await route.fetch()
  const headers = resp.headers()
  const ct = (headers['content-type'] || '').toLowerCase()
  let body = null
  try { body = await resp.body() } catch {}
  if (body && body.length > 0 && (ct.includes('application/zip') || ct.includes('application/octet-stream'))) {
    zipPath = path.join(dlDir, `part7-yes-${Date.now()}.zip`)
    fs.writeFileSync(zipPath, body)
  }
  await route.fulfill({ response: resp, body: body || undefined })
})

const clickText = async (list) => {
  for (const t of list) {
    const btn = page.locator('button', { hasText: t })
    const n = await btn.count()
    for (let i = 0; i < n; i++) {
      const b = btn.nth(i)
      if (await b.isVisible() && await b.isEnabled()) { await b.click(); return true }
    }
  }
  return false
}

await page.goto(base, { waitUntil: 'networkidle' })
await page.evaluate(() => { localStorage.clear(); sessionStorage.clear() })
await page.reload({ waitUntil: 'networkidle' })
await clickText(['Подаю впервые', 'Подаю вперше', 'First filing'])
await page.locator('[data-testid="tps-ocr-cta"]').click()
const inp = page.locator('[data-testid="upload-slot-passport"] input[type="file"]')
if (await inp.count()) { await inp.setInputFiles(fixture); await page.waitForTimeout(3000) }
await clickText(['Дальше', 'Далі', 'Next'])
const reviewNext = page.locator('[data-testid="review-next"]')
if (await reviewNext.count() && await reviewNext.first().isEnabled()) await reviewNext.first().click()
for (let i = 0; i < 5; i++) {
  const ok = await clickText(['Дальше', 'Далі', 'Next'])
  if (!ok) break
  await page.waitForTimeout(500)
}
await clickText(['PDF-пакет', 'PDF packet'])
await page.waitForTimeout(1000)

await page.locator('[data-testid="field-us-address-street"]').first().fill('123 MAIN ST')
await page.locator('[data-testid="field-us-address-city"]').first().fill('LOS ANGELES')
await page.locator('[data-testid="field-us-address-state"]').first().fill('CA')
await page.locator('[data-testid="field-us-address-zip"]').first().fill('90001')
await page.locator('[data-testid="field-last-entry-date"]').first().fill('2024-01-15')
await page.locator('[data-testid="field-daytime-phone"]').first().fill('2135551212')
await page.locator('[data-testid="field-email"]').first().fill('test@example.com')
await page.locator('[data-testid="field-marital-status-single"]').first().click()
await page.locator('[data-testid="part7-confirm-checkbox"]').first().check()

// one explicit legal risk = yes
if (riskCase === 'criminal') {
  await page.locator('[data-testid="tps-legal-risk-has_criminal_concern-yes"]').first().click()
}
if (riskCase === 'removal') {
  await page.locator('[data-testid="tps-legal-risk-left_us_without_advance_parole-yes"]').first().click()
}
if (riskCase === 'prior_denial') {
  await page.locator('[data-testid="tps-legal-risk-has_prior_tps_denial-yes"]').first().click()
}
await page.waitForTimeout(500)

await page.locator('[data-testid="tps-attestation-checkbox"]').first().check()
await page.locator('[data-testid="generate-btn"]').first().click()
await page.waitForTimeout(4000)

await browser.close()
if (!zipPath) {
  console.error('zip_not_captured')
  process.exit(2)
}
const tagged = zipPath.replace('.zip', `-${riskCase}.zip`)
fs.renameSync(zipPath, tagged)
console.log(tagged)
