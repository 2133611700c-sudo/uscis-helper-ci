#!/usr/bin/env node
import fs from 'node:fs'
import path from 'node:path'
import { chromium } from '@playwright/test'

const OUT = path.resolve('docs/reports/evidence/t3ps-final-release/browser-run-clean')
const SHOTS = path.join(OUT, 'screenshots')
const DLOAD = path.join(OUT, 'downloaded_zip')
fs.mkdirSync(SHOTS, { recursive: true })
fs.mkdirSync(DLOAD, { recursive: true })

const base = 'https://messenginfo.com'
const startUrl = `${base}/ru/services/tps-ukraine/start`
const fixture = process.env.T3PS_FIXTURE_PATH
  ? path.resolve(process.env.T3PS_FIXTURE_PATH)
  : path.resolve('test-fixtures/synthetic-passport.jpg')

const consoleLogs = []
const networkLogs = []
const failedRequests = []
let ocrStatus = null
let generateStatus = null
let generateMissing = null
let downloadedFile = null
let generateResponseContentType = null
let generateResponseKeys = []
let generateRequestBodyBase64 = null
let generateResponseBodyBytes = null
let generateReplayStatus = null
let generateReplayBytes = null
let generateInterceptBytes = null

const browser = await chromium.launch({ headless: true })
const context = await browser.newContext({
  viewport: { width: 390, height: 844 },
  locale: 'ru-RU',
  acceptDownloads: true,
})
const page = await context.newPage()

await page.route('**/api/tps/generate-packet', async (route) => {
  const req = route.request()
  if (req.method() !== 'POST') return route.continue()
  const resp = await route.fetch()
  const headers = resp.headers()
  const ct = (headers['content-type'] || '').toLowerCase()
  let body = null
  try {
    body = await resp.body()
  } catch {}
  const bytes = body?.length || 0
  generateInterceptBytes = bytes
  if (bytes > 0 && (ct.includes('application/zip') || ct.includes('application/octet-stream'))) {
    const fp = path.join(DLOAD, `tps-packet-intercept-${Date.now()}.zip`)
    fs.writeFileSync(fp, body)
    downloadedFile = fp
  }
  await route.fulfill({ response: resp, body: body || undefined })
})

page.on('console', (m) => consoleLogs.push({ type: m.type(), text: m.text() }))
page.on('response', async (r) => {
  const headers = r.headers()
  const row = {
    url: r.url(),
    method: r.request().method(),
    status: r.status(),
    content_type: headers['content-type'] || null,
    content_disposition: headers['content-disposition'] || null,
    location: headers['location'] || null,
  }
  networkLogs.push(row)
  if (row.status >= 400) failedRequests.push(row)
  if (row.url.includes('/api/tps/ocr/extract')) ocrStatus = row.status
  if (row.url.includes('/api/tps/generate-packet')) {
    generateStatus = row.status
    generateResponseContentType = (r.headers()['content-type'] || '').toLowerCase()
    try {
      const reqBuf = r.request().postDataBuffer()
      if (reqBuf) generateRequestBodyBase64 = reqBuf.toString('base64')
    } catch {}
    if (row.status === 200) {
      try {
        if (generateResponseContentType.includes('application/zip') || generateResponseContentType.includes('application/octet-stream')) {
          const buf = await r.body()
          generateResponseBodyBytes = buf?.length || 0
          if (buf && buf.length > 0) {
            const fp = path.join(DLOAD, `tps-packet-from-response-${Date.now()}.zip`)
            fs.writeFileSync(fp, buf)
            downloadedFile = fp
          }
        } else if (generateResponseContentType.includes('application/json')) {
          const j = await r.json()
          if (j && typeof j === 'object') generateResponseKeys = Object.keys(j)
          const possibleUrl = j?.downloadUrl || j?.download_url || j?.zipUrl || j?.zip_url || j?.url
          if (typeof possibleUrl === 'string' && possibleUrl.length > 0) {
            const abs = possibleUrl.startsWith('http') ? possibleUrl : `${base}${possibleUrl}`
            const rr = await context.request.get(abs)
            if (rr.ok()) {
              const buf = await rr.body()
              const fp = path.join(DLOAD, `tps-packet-from-json-url-${Date.now()}.zip`)
              fs.writeFileSync(fp, buf)
              downloadedFile = fp
            }
          }
        }
      } catch {}
    }
    if (row.status >= 400) {
      try {
        const b = await r.json()
        if (Array.isArray(b?.missing)) generateMissing = b.missing
      } catch {}
    }
  }
})

async function shot(name) {
  await page.screenshot({ path: path.join(SHOTS, name), fullPage: true })
}

async function clickText(txtList) {
  for (const t of txtList) {
    const btn = page.locator('button', { hasText: t })
    const n = await btn.count()
    for (let i = 0; i < n; i++) {
      const b = btn.nth(i)
      if (await b.isVisible() && await b.isEnabled()) {
        await b.scrollIntoViewIfNeeded()
        await b.click()
        return true
      }
    }
  }
  return false
}

async function clickFirstVisible(locator) {
  const n = await locator.count()
  for (let i = 0; i < n; i++) {
    const el = locator.nth(i)
    if (await el.isVisible() && await el.isEnabled()) {
      await el.scrollIntoViewIfNeeded()
      await el.click()
      return true
    }
  }
  return false
}

async function fillReviewDobIfMissing() {
  const dobRow = page.locator('[data-testid="tps-review-step-container"]')
  if (!(await dobRow.count())) return false
  if (!(await dobRow.getByText(/не найдено|not found|не знайдено/i).count())) return false
  const edit = page.locator('[data-testid^="review-edit-"], button:has-text("Изменить"), button:has-text("Edit")')
  if (!(await edit.count())) return false
  await edit.first().click()
  await page.waitForTimeout(400)
  const dateInput = page.locator('[data-testid="ocr-edit-input-date"]').first()
  if (await dateInput.count()) {
    await dateInput.fill('1990-01-01')
  } else {
    return false
  }
  const save = page.locator('[data-testid="ocr-edit-save"]').first()
  if (await save.count()) await save.click()
  await page.waitForTimeout(700)
  return true
}

try {
  await page.goto(startUrl, { waitUntil: 'networkidle', timeout: 90000 })
  await page.evaluate(() => {
    localStorage.clear()
    sessionStorage.clear()
  })
  await page.reload({ waitUntil: 'networkidle' })
  await shot('01_start.png')

  await clickText(['Подаю впервые', 'Подаю вперше', 'First filing'])
  await shot('02_path_selected.png')

  await page.locator('[data-testid="tps-ocr-cta"]').click()
  await page.waitForTimeout(700)
  await shot('03_ocr_open.png')

  const passportInput = page.locator('[data-testid="tps-upload-input-passport"]')
  if (await passportInput.count()) {
    await passportInput.setInputFiles(fixture)
    await page.waitForTimeout(3500)
  }
  await shot('04_passport_uploaded.png')

  // already on review after recognize in V2
  await clickText(['Дальше', 'Далі', 'Next'])
  await page.waitForTimeout(1000)
  await shot('05_upload_next.png')

  // If review has missing critical fields (e.g. DOB), fix through UI edit modal.
  await fillReviewDobIfMissing()

  const reviewNext = page.locator('[data-testid="tps-step6-continue-cta"]')
  if (await reviewNext.count() && await reviewNext.first().isEnabled()) {
    await reviewNext.first().click()
  }
  await page.waitForTimeout(800)
  await shot('06_review_next.png')

  // Wizard steps: 1->6 with explicit next clicks.
  for (let i = 0; i < 5; i++) {
    const ok = await clickText(['Дальше', 'Далі', 'Next'])
    if (!ok) break
    await page.waitForTimeout(600)
  }
  await shot('07_step6_screen.png')

  await page.waitForTimeout(800)

  // Fill key required fields (stable test IDs first, then label fallback).
  const byTestId = [
    ['field-us-address-street', '123 MAIN ST'],
    ['field-us-address-city', 'LOS ANGELES'],
    ['field-us-address-state', 'CA'],
    ['field-us-address-zip', '90001'],
    ['tps-passport-number-input', 'AA1234567'],
    ['tps-passport-expiration-input', '2030-01-01'],
    ['field-last-entry-date', '2024-01-15'],
    ['field-daytime-phone', '2135551212'],
    ['field-email', 'test@example.com'],
  ]
  for (const [id, val] of byTestId) {
    const inp = page.locator(`[data-testid="${id}"]`).first()
    if (await inp.count()) await inp.fill(val)
  }

  await clickText(['Не одружений', 'Никогда не состоял', 'Single'])
  await clickText(['Не женат', 'Single (never married)'])
  const maritalBtn = page.locator('[data-testid="field-marital-status-single"]').first()
  if (await maritalBtn.count() && await maritalBtn.isEnabled()) await maritalBtn.click()

  // part7 confirmation + attestation + generate
  const part7Confirm = page.locator('[data-testid="part7-confirm-checkbox"]')
  if (await part7Confirm.count()) await part7Confirm.check()
  const att = page.locator('[data-testid="tps-attestation-checkbox"]')
  if (await att.count()) await att.check()
  await shot('08_before_generate.png')

  let dlPromise = page.waitForEvent('download', { timeout: 20000 }).catch(() => null)
  const gen = page.locator('[data-testid="tps-generate-cta"]')
  if (await gen.count() && await gen.first().isEnabled()) await gen.first().click()
  await page.waitForTimeout(6000)
  let dl = await dlPromise
  if (!dl) {
    // Success state sometimes requires an explicit click on a download control.
    dlPromise = page.waitForEvent('download', { timeout: 15000 }).catch(() => null)
    const clickedByTestId = await clickFirstVisible(page.locator('[data-testid*="download"]'))
    if (!clickedByTestId) await clickText(['Download ZIP', 'Завантажити ZIP', 'Скачать ZIP', 'Descargar ZIP'])
    await page.waitForTimeout(2500)
    dl = await dlPromise
  }
  if (!downloadedFile && generateRequestBodyBase64) {
    try {
      const reqBytes = Buffer.from(generateRequestBodyBase64, 'base64')
      const replay = await context.request.fetch(`${base}/api/tps/generate-packet`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'accept': '*/*',
        },
        data: reqBytes,
      })
      generateReplayStatus = replay.status()
      if (replay.ok()) {
        const buf = await replay.body()
        generateReplayBytes = buf?.length || 0
        if (buf && buf.length > 0) {
          const fp = path.join(DLOAD, `tps-packet-replay-${Date.now()}.zip`)
          fs.writeFileSync(fp, buf)
          downloadedFile = fp
        }
      }
    } catch {}
  }
  if (!dl) {
    // Fallback: save ZIP via direct href in success state.
    const zipHref = await page.evaluate(() => {
      const candidates = Array.from(document.querySelectorAll('a[href], button[data-href], [data-href]'))
      for (const c of candidates) {
        const href = c.getAttribute('href') || c.getAttribute('data-href')
        if (!href) continue
        if (href.toLowerCase().includes('.zip') || href.toLowerCase().includes('/api/tps/generate-packet')) return href
      }
      return null
    })
    if (zipHref) {
      const absolute = zipHref.startsWith('http') ? zipHref : `${base}${zipHref}`
      const resp = await context.request.get(absolute)
      if (resp.ok()) {
        const buf = await resp.body()
        const fp = path.join(DLOAD, `tps-packet-${Date.now()}.zip`)
        fs.writeFileSync(fp, buf)
        downloadedFile = fp
      }
    }
  }
  if (dl) {
    const fp = path.join(DLOAD, dl.suggestedFilename())
    await dl.saveAs(fp)
    downloadedFile = fp
  }
  await shot('09_after_generate.png')
} finally {
  await context.close()
  await browser.close()
}

const summary = {
  started_utc: new Date().toISOString(),
  url: startUrl,
  ocr_status: ocrStatus,
  generate_status: generateStatus,
  generate_missing: generateMissing,
  generate_response_content_type: generateResponseContentType,
  generate_response_body_bytes: generateResponseBodyBytes,
  generate_response_keys: generateResponseKeys,
  generate_request_body_captured: !!generateRequestBodyBase64,
  generate_replay_status: generateReplayStatus,
  generate_replay_bytes: generateReplayBytes,
  generate_intercept_bytes: generateInterceptBytes,
  downloaded_file: downloadedFile,
  failed_requests_count: failedRequests.length,
}
fs.writeFileSync(path.join(OUT, 'console.json'), JSON.stringify(consoleLogs, null, 2))
fs.writeFileSync(path.join(OUT, 'network.json'), JSON.stringify(networkLogs, null, 2))
fs.writeFileSync(path.join(OUT, 'failed_requests.json'), JSON.stringify(failedRequests, null, 2))
fs.writeFileSync(path.join(OUT, 'browser_summary.json'), JSON.stringify(summary, null, 2))
console.log(JSON.stringify(summary, null, 2))
