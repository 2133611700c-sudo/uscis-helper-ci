#!/usr/bin/env node
import { chromium } from '@playwright/test'
import path from 'node:path'

const out = path.resolve('docs/reports/evidence/t3ps-final-release/browser-run-clean/screenshots')
const fixture = path.resolve('test-fixtures/synthetic-passport.jpg')
const start = 'https://messenginfo.com/ru/services/tps-ukraine/start'

const browser = await chromium.launch({ headless: true })
const context = await browser.newContext({ viewport: { width: 390, height: 844 }, locale: 'ru-RU' })
const page = await context.newPage()

const clickText = async (list) => {
  for (const t of list) {
    const btn = page.locator('button', { hasText: t })
    const n = await btn.count()
    for (let i = 0; i < n; i++) {
      const b = btn.nth(i)
      if (await b.isVisible() && await b.isEnabled()) {
        await b.click()
        return true
      }
    }
  }
  return false
}

await page.goto(start, { waitUntil: 'networkidle' })
await page.evaluate(() => { localStorage.clear(); sessionStorage.clear() })
await page.reload({ waitUntil: 'networkidle' })
await clickText(['Подаю впервые', 'Подаю вперше', 'First filing'])
await page.locator('[data-testid="tps-ocr-cta"]').click()
const inp = page.locator('[data-testid="upload-slot-passport"] input[type="file"]')
if (await inp.count()) {
  await inp.setInputFiles(fixture)
  await page.waitForTimeout(3000)
}
await clickText(['Дальше', 'Далі', 'Next'])
const reviewNext = page.locator('[data-testid="review-next"]')
if (await reviewNext.count() && await reviewNext.first().isEnabled()) await reviewNext.first().click()
for (let i = 0; i < 5; i++) {
  const ok = await clickText(['Дальше', 'Далі', 'Next'])
  if (!ok) break
  await page.waitForTimeout(500)
}
await clickText(['PDF-пакет', 'PDF packet'])
await page.waitForTimeout(1200)

await page.locator('[data-testid="field-us-address-street"]').first().fill('123 MAIN ST')
await page.locator('[data-testid="field-us-address-city"]').first().fill('LOS ANGELES')
await page.locator('[data-testid="field-us-address-state"]').first().fill('CA')
await page.locator('[data-testid="field-us-address-zip"]').first().fill('90001')
await page.locator('[data-testid="field-last-entry-date"]').first().fill('2024-01-15')
await page.locator('[data-testid="field-daytime-phone"]').first().fill('2135551212')
await page.locator('[data-testid="field-email"]').first().fill('test@example.com')
await page.locator('[data-testid="field-marital-status-single"]').first().click()
await page.locator('[data-testid="part7-confirm-checkbox"]').first().check()

await page.screenshot({ path: path.join(out, 'legal_risk_all_no.png'), fullPage: true })

await page.locator('[data-testid="tps-legal-risk-has_criminal_concern-yes"]').first().click()
await page.waitForTimeout(500)
await page.screenshot({ path: path.join(out, 'legal_risk_criminal_yes.png'), fullPage: true })

await page.locator('[data-testid="tps-legal-risk-has_criminal_concern-no"]').first().click()
await page.locator('[data-testid="tps-legal-risk-left_us_without_advance_parole-yes"]').first().click()
await page.waitForTimeout(500)
await page.screenshot({ path: path.join(out, 'legal_risk_removal_yes.png'), fullPage: true })

await page.locator('[data-testid="tps-legal-risk-left_us_without_advance_parole-no"]').first().click()
await page.locator('[data-testid="tps-legal-risk-has_prior_tps_denial-yes"]').first().click()
await page.waitForTimeout(500)
await page.screenshot({ path: path.join(out, 'legal_risk_prior_denial_yes.png'), fullPage: true })

await browser.close()
console.log('ok')
