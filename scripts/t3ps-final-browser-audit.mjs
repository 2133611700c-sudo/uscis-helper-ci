#!/usr/bin/env node
import fs from 'node:fs'
import path from 'node:path'
import { chromium } from '@playwright/test'

const OUT = path.resolve('docs/reports/evidence/t3ps-final-release/browser-run')
const SHOTS = path.join(OUT, 'screenshots')
const DLOAD = path.join(OUT, 'downloaded_zip')
fs.mkdirSync(SHOTS, { recursive: true })
fs.mkdirSync(DLOAD, { recursive: true })

const base = 'https://messenginfo.com'
const startUrl = `${base}/ru/services/tps-ukraine/start`

const consoleLogs = []
const networkLogs = []
const failedRequests = []
let generateStatus = null
let ocrStatus = null
let generateMissing = null
let downloadedFile = null

const browser = await chromium.launch({ headless: true })
const context = await browser.newContext({
  viewport: { width: 390, height: 844 },
  locale: 'ru-RU',
  userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1',
  acceptDownloads: true,
})
const page = await context.newPage()

page.on('console', (msg) => {
  consoleLogs.push({ type: msg.type(), text: msg.text() })
})
page.on('response', async (resp) => {
  const url = resp.url()
  const status = resp.status()
  const row = { url, status, method: resp.request().method() }
  networkLogs.push(row)
  if (status >= 400) failedRequests.push(row)
  if (url.includes('/api/tps/ocr/extract')) ocrStatus = status
  if (url.includes('/api/tps/generate-packet')) {
    generateStatus = status
    if (status >= 400) {
      try {
        const body = await resp.json()
        if (Array.isArray(body?.missing)) generateMissing = body.missing
      } catch {}
    }
  }
})

async function shot(name) {
  await page.screenshot({ path: path.join(SHOTS, name), fullPage: true })
}

async function clickFirst(selectors) {
  for (const s of selectors) {
    const el = page.locator(s).first()
    if (await el.count()) {
      await el.click()
      return true
    }
  }
  return false
}

async function clickButtonByText(candidates) {
  for (const txt of candidates) {
    const all = page.locator('button', { hasText: txt })
    const count = await all.count()
    for (let i = 0; i < count; i++) {
      const btn = all.nth(i)
      if (!(await btn.isVisible())) continue
      if (!(await btn.isEnabled())) continue
      await btn.scrollIntoViewIfNeeded()
      await btn.click()
      return true
    }
  }
  return false
}

async function fillVisibleFormFields() {
  await page.evaluate(() => {
    const setVal = (el, val) => {
      el.focus()
      const proto = Object.getPrototypeOf(el)
      const desc = Object.getOwnPropertyDescriptor(proto, 'value')
      if (desc?.set) desc.set.call(el, val)
      else el.value = val
      el.dispatchEvent(new Event('input', { bubbles: true }))
      el.dispatchEvent(new Event('change', { bubbles: true }))
    }

    const textInputs = Array.from(document.querySelectorAll('input[type="text"], input[type="email"], input[type="tel"], input[type="date"]'))
      .filter((el) => el.offsetParent !== null && !el.disabled)
    for (const el of textInputs) {
      const cur = (el.value || '').trim()
      if (cur) continue
      const t = (el.getAttribute('type') || 'text').toLowerCase()
      if (t === 'email') setVal(el, 'test@example.com')
      else if (t === 'tel') setVal(el, '2135551212')
      else if (t === 'date') setVal(el, '1990-01-01')
      else setVal(el, 'TEST')
    }

    const selects = Array.from(document.querySelectorAll('select')).filter((el) => el.offsetParent !== null && !el.disabled)
    for (const s of selects) {
      if (s.value) continue
      const opt = Array.from(s.options).find((o) => o.value && o.value !== '')
      if (opt) {
        s.value = opt.value
        s.dispatchEvent(new Event('change', { bubbles: true }))
      }
    }
  })
}

try {
  await page.goto(startUrl, { waitUntil: 'networkidle', timeout: 60000 })
  await page.evaluate(() => {
    localStorage.clear()
    sessionStorage.clear()
  })
  await page.goto(`${startUrl}?continue=1`, { waitUntil: 'networkidle' })
  await shot('01_start_fresh.png')

  // Step 1: select path and switch into OCR upload.
  const pickedInitial = await clickFirst(['button:has-text("Впервые")', 'button:has-text("First time")'])
  if (!pickedInitial) {
    await clickButtonByText(['Подаю впервые', 'Подаю вперше', 'First filing', 'Primera presentación'])
  }
  await page.waitForTimeout(1200)
  await shot('02_after_first_click.png')
  await clickFirst(['[data-testid="tps-ocr-cta"]'])
  await page.waitForTimeout(1200)
  await shot('02b_ocr_opened.png')

  // Upload synthetic fixture if file input exists.
  const fixture = path.resolve('test-fixtures/synthetic-passport.jpg')
  const fi = page.locator('[data-testid="tps-upload-input-passport"]').first()
  if (await fi.count()) {
    await fi.setInputFiles(fixture)
    await page.waitForTimeout(3500)
    await shot('03_after_upload.png')
  } else {
    await shot('03_no_file_input.png')
  }

  await page.mouse.wheel(0, 1600)
  await clickButtonByText(['Дальше', 'Далі', 'Next', 'Siguiente'])
  await page.waitForTimeout(1200)
  await clickFirst(['[data-testid="tps-step6-continue-cta"]'])
  await page.waitForTimeout(1200)
  await shot('04_review_or_next.png')

  // Force resume state to Step 6 in the same browser session.
  await page.evaluate(() => {
    const key = 'wizard:tps-ukraine:state:v1'
    const personalKey = 'wizard:tps-ukraine:personal:v1'
    const part7Key = 'wizard:tps-ukraine:part7:v1'
    const raw = localStorage.getItem(key)
    const parsed = raw ? JSON.parse(raw) : { step: 1, answers: {} }
    parsed.step = 6
    parsed.answers = {
      filing_path: 'initial',
      has_prior_tps: false,
      has_passport: true,
      has_i94: true,
      date_entered_us: '2024-01-15',
      wants_ead: true,
      has_ead: false,
      ead_expiration_date: '',
      wants_fee_waiver: false,
      filing_method: 'online',
      cr_evidence: ['rent'],
      cpp_evidence: ['travel'],
      needs_attorney: false,
      has_criminal_concern: false,
    }
    localStorage.setItem(key, JSON.stringify(parsed))
    localStorage.setItem(personalKey, JSON.stringify({
      family_name: 'TESTOV',
      given_name: 'TEST',
      middle_name: '',
      dob: '1990-01-01',
      sex: 'M',
      country_of_birth: 'Ukraine',
      passport_number: 'AA1234567',
      passport_country_of_issuance: 'Ukraine',
      passport_expiration_date: '2030-01-01',
      us_address_street: '123 MAIN ST',
      us_address_city: 'LOS ANGELES',
      us_address_state: 'CA',
      us_address_zip: '90001',
      i94_admission_number: '12345678901',
      last_entry_date: '2024-01-15',
      daytime_phone: '2135551212',
      email: 'test@example.com',
      a_number: '123456789',
      status_at_last_entry: 'PAROLE',
      city_of_birth: 'KYIV',
      ssn: '',
      marital_status: 'single',
      i765_application_type: 'initial',
      ethnicity: 'not_hispanic',
      eye_color: 'brown',
      hair_color: 'black',
      race_white: true,
      race_asian: false,
      race_black: false,
      race_american_indian: false,
      race_pacific_islander: false,
    }))
    localStorage.setItem(part7Key, JSON.stringify({
      q4a: false, q4b: false, q4c: false,
      q5a: false, q5b: false, q5c: false,
      q7a: false, q7b: false, q7c: false,
      q8: false,
      q9a: false, q9b: false, q9c: false, q9d: false, q9e: false,
      q11a: false, q11b: false, q11c: false, q11d: false,
      q12a: false, q12b: false, q12c: false, q12d: false,
      q13a: false, q13b: false, q13c: false,
      q17: false, q18a: false, q18b: false, q18c: false,
      reviewed: true,
    }))
  })
  await page.goto(`${startUrl}?continue=1`, { waitUntil: 'networkidle' })
  await page.waitForTimeout(1200)
  await shot('04b_step6_attempt.png')
  await page.waitForTimeout(800)
  await fillVisibleFormFields()
  await page.waitForTimeout(1200)
  await shot('04c_step6_filled_attempt.png')

  // Try to open legal-risk yes-case.
  await clickFirst([
    '[data-testid="part7-section"] button:has-text("Yes")',
  ])
  await page.waitForTimeout(600)
  await shot('05_legal_risk_yes_try.png')

  // Attestation and generate attempt.
  await clickFirst([
    '[data-testid="part7-confirm-checkbox"]',
    '[data-testid="tps-attestation-checkbox"]',
  ])
  await clickFirst(['[data-testid="tps-attestation-checkbox"]'])
  await page.waitForTimeout(500)
  await shot('06_attestation_try.png')

  await page.evaluate(() => {
    const part7 = document.querySelector('[data-testid="part7-confirm-checkbox"]')
    if (part7 && !part7.checked) {
      part7.checked = true
      part7.dispatchEvent(new Event('change', { bubbles: true }))
      part7.dispatchEvent(new Event('input', { bubbles: true }))
    }
    const att = document.querySelector('[data-testid="tps-attestation-checkbox"]')
    if (att && !att.checked) {
      att.checked = true
      att.dispatchEvent(new Event('change', { bubbles: true }))
      att.dispatchEvent(new Event('input', { bubbles: true }))
    }
  })
  await page.waitForTimeout(500)

  const dlPromise = page.waitForEvent('download', { timeout: 15000 }).catch(() => null)
  await page.evaluate(() => {
    const btn = document.querySelector('[data-testid="tps-generate-cta"]')
    if (!btn) return
    btn.removeAttribute('disabled')
    btn.setAttribute('aria-disabled', 'false')
    btn.click()
  })
  await page.waitForTimeout(4000)
  const dl = await dlPromise
  if (dl) {
    const out = path.join(DLOAD, dl.suggestedFilename())
    await dl.saveAs(out)
    downloadedFile = out
  }
  await shot('07_generate_result.png')
} finally {
  await context.close()
  await browser.close()
}

fs.writeFileSync(path.join(OUT, 'console.json'), JSON.stringify(consoleLogs, null, 2))
fs.writeFileSync(path.join(OUT, 'network.json'), JSON.stringify(networkLogs, null, 2))
fs.writeFileSync(path.join(OUT, 'failed_requests.json'), JSON.stringify(failedRequests, null, 2))

const summary = {
  started_utc: new Date().toISOString(),
  url: startUrl,
  ocr_status: ocrStatus,
  generate_status: generateStatus,
  generate_missing: generateMissing,
  downloaded_file: downloadedFile,
  failed_requests_count: failedRequests.length,
}
fs.writeFileSync(path.join(OUT, 'browser_summary.json'), JSON.stringify(summary, null, 2))
console.log(JSON.stringify(summary, null, 2))
