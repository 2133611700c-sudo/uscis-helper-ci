#!/usr/bin/env node
import fs from 'node:fs'
import path from 'node:path'
import { chromium } from '@playwright/test'

const scenario = (process.env.SCENARIO || 'A').toUpperCase() // A=i821 only, B=tps+ead+i94
const paidCallback = process.env.PAID_CALLBACK === '1'
const outRoot = path.resolve('docs/reports/evidence/t3ps-functional-closeout')
const outDir = path.join(outRoot, scenario === 'B' ? 'scenario_B' : 'scenario_A')
const shotsDir = path.join(outDir, 'screenshots')
const dlDir = path.join(outDir, 'downloaded_zip')
fs.mkdirSync(shotsDir, { recursive: true })
fs.mkdirSync(dlDir, { recursive: true })

const startUrl = 'https://messenginfo.com/ru/services/tps-ukraine/start'
const fixturePassport = path.resolve('test-fixtures/synthetic-passport.jpg')
const fixtureI94 = path.resolve('test-fixtures/generated/synthetic-i94.jpg')
const fixtureEad = path.resolve('test-fixtures/generated/synthetic-ead.jpg')

const consoleLogs = []
const networkLogs = []
const failedRequests = []
let ocrStatuses = []
let generateStatuses = []
let downloadedFile = null
let generateBytes = 0

const browser = await chromium.launch({ headless: true })
const context = await browser.newContext({ viewport: { width: 390, height: 844 }, locale: 'ru-RU', acceptDownloads: true })
const page = await context.newPage()

await page.route('**/api/tps/generate-packet', async (route) => {
  const req = route.request()
  if (req.method() !== 'POST') return route.continue()
  try {
    const resp = await route.fetch()
    const ct = (resp.headers()['content-type'] || '').toLowerCase()
    let body = null
    try { body = await resp.body() } catch {}
    generateBytes = body?.length || 0
    if (body && body.length > 0 && (ct.includes('application/zip') || ct.includes('application/octet-stream'))) {
      const fp = path.join(dlDir, `tps-packet-${Date.now()}.zip`)
      fs.writeFileSync(fp, body)
      downloadedFile = fp
    }
    await route.fulfill({ response: resp, body: body || undefined })
  } catch {
    await route.continue()
  }
})

page.on('console', (m) => consoleLogs.push({ type: m.type(), text: m.text() }))
page.on('response', async (r) => {
  const row = {
    url: r.url(),
    method: r.request().method(),
    status: r.status(),
    content_type: r.headers()['content-type'] || null,
  }
  networkLogs.push(row)
  if (row.status >= 400) failedRequests.push(row)
  if (row.url.includes('/api/tps/ocr/extract')) ocrStatuses.push(row.status)
  if (row.url.includes('/api/tps/generate-packet')) generateStatuses.push(row.status)
})

const shot = async (name) => page.screenshot({ path: path.join(shotsDir, name), fullPage: true })
const wait = (ms) => page.waitForTimeout(ms)

async function clickByText(candidates) {
  for (const t of candidates) {
    const loc = page.locator('button', { hasText: t })
    const n = await loc.count()
    for (let i = 0; i < n; i++) {
      const btn = loc.nth(i)
      if (await btn.isVisible() && await btn.isEnabled()) {
        await btn.scrollIntoViewIfNeeded()
        await btn.click()
        return true
      }
    }
  }
  return false
}

async function fillVisibleInputs() {
  await page.evaluate(() => {
    const setVal = (el, val) => {
      const desc = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')
      if (desc?.set) desc.set.call(el, val)
      else el.value = val
      el.dispatchEvent(new Event('input', { bubbles: true }))
      el.dispatchEvent(new Event('change', { bubbles: true }))
    }
    const visible = (el) => el.offsetParent !== null && !el.disabled
    const inputs = Array.from(document.querySelectorAll('input')).filter(visible)
    for (const el of inputs) {
      const t = (el.getAttribute('type') || 'text').toLowerCase()
      const cur = (el.value || '').trim()
      if (cur) continue
      if (t === 'email') setVal(el, 'test@example.com')
      else if (t === 'tel') setVal(el, '2135551212')
      else if (t === 'date') setVal(el, '2030-01-01')
      else if (el.maxLength === 9) setVal(el, '123456789')
      else if (el.maxLength === 2) setVal(el, 'CA')
      else setVal(el, 'TEST')
    }
    const selects = Array.from(document.querySelectorAll('select')).filter(visible)
    for (const s of selects) {
      if (!s.value && s.options.length > 1) {
        s.selectedIndex = 1
        s.dispatchEvent(new Event('change', { bubbles: true }))
      }
    }
  })
}

try {
  await page.goto(startUrl, { waitUntil: 'networkidle', timeout: 90000 })
  await page.evaluate(() => { localStorage.clear(); sessionStorage.clear() })
  await page.reload({ waitUntil: 'networkidle' })
  await shot('upload_screen.png')

  await clickByText(['Впервые', 'Вперше', 'First time'])
  await clickByText(['Онлайн', 'Online'])
  if (scenario === 'B') await clickByText(['Да', 'Так', 'Yes'])
  else await clickByText(['Нет', 'Ні', 'No'])
  await wait(500)
  await shot('step4_doc_slots.png')

  const setIf = async (id, fp) => {
    const input = page.locator(`[data-testid="tps-upload-input-${id}"]`).first()
    if (await input.count()) await input.setInputFiles(fp)
  }
  await setIf('passport', fixturePassport)
  await setIf('booklet', fixturePassport)
  if (scenario === 'B') {
    await setIf('i94', fixtureI94)
    await setIf('i797_or_ead', fixtureEad)
  }
  await setIf('dl', fixturePassport)

  await wait(4000)
  await page.locator('[data-testid="tps-ocr-cta"]').click()
  await wait(800)
  await shot('source_to_final_review.png')

  await fillVisibleInputs()
  const step6Next = page.locator('[data-testid="tps-step6-continue-cta"]').first()
  if (await step6Next.count() && await step6Next.isEnabled()) {
    await step6Next.click()
  }
  await wait(1000)
  await shot('step6_prefilled.png')

  if (paidCallback) {
    await page.goto(`${startUrl}?paid=1`, { waitUntil: 'networkidle' })
    await wait(1200)
    await shot('step6_paid_callback.png')
  }

  const part7 = page.locator('[data-testid="part7-confirm-checkbox"]').first()
  if (await part7.count()) await part7.check()
  const att = page.locator('[data-testid="tps-attestation-checkbox"]').first()
  if (await att.count()) await att.check()
  await shot('attestation_checked.png')

  const gen = page.locator('[data-testid="tps-generate-cta"]').first()
  if (await gen.count() && await gen.isEnabled()) {
    const dlWait = page.waitForEvent('download', { timeout: 25000 }).catch(() => null)
    await gen.click()
    const dl = await dlWait
    if (dl) {
      const fp = path.join(dlDir, dl.suggestedFilename())
      await dl.saveAs(fp)
      downloadedFile = fp
    }
  }
  await wait(2500)
  await shot('generate_success.png')
  await shot('download_confirmed.png')
} finally {
  await browser.close()
}

const summary = {
  scenario,
  paid_callback: paidCallback,
  started_utc: new Date().toISOString(),
  ocr_statuses: ocrStatuses,
  generate_statuses: generateStatuses,
  zip_downloaded: Boolean(downloadedFile),
  zip_path: downloadedFile,
  zip_size_bytes: generateBytes,
  failed_requests: failedRequests,
  console_errors: consoleLogs.filter((x) => x.type === 'error'),
}

fs.writeFileSync(path.join(outDir, 'browser_summary.json'), JSON.stringify(summary, null, 2))
fs.writeFileSync(path.join(outDir, 'network.json'), JSON.stringify(networkLogs, null, 2))
fs.writeFileSync(path.join(outDir, 'console.json'), JSON.stringify(consoleLogs, null, 2))
fs.writeFileSync(path.join(outDir, 'failed_requests.json'), JSON.stringify(failedRequests, null, 2))
console.log(JSON.stringify(summary, null, 2))
