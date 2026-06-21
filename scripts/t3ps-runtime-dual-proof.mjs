#!/usr/bin/env node
import fs from 'node:fs'
import path from 'node:path'
import { chromium } from '@playwright/test'

const OUT = path.resolve('docs/reports/evidence/t3ps-final-release/browser-run-clean')
const SHOTS = path.join(OUT, 'dual-proof-shots')
const DLOAD = path.join(OUT, 'dual-proof-downloads')
fs.mkdirSync(SHOTS, { recursive: true })
fs.mkdirSync(DLOAD, { recursive: true })

const startUrl = 'https://messenginfo.com/ru/services/tps-ukraine/start'
const fixturePassport = path.resolve('test-fixtures/synthetic-passport.jpg')
const fixtureI94 = path.resolve('test-fixtures/degraded/realistic_phone.jpg')
const fixtureEad = path.resolve('test-fixtures/degraded/realistic_phone.jpg')

const browser = await chromium.launch({ headless: true })
const context = await browser.newContext({ viewport: { width: 390, height: 844 }, locale: 'ru-RU', acceptDownloads: true })
const page = await context.newPage()

const logs = {
  console: [],
  failed: [],
  network: [],
}
const ocrBySlot = {}
const generateStatuses = []
let generateMissing = null
let generateError = null
let generatedZipPath = null
let generatedZipBytes = 0

page.on('console', (m) => logs.console.push({ type: m.type(), text: m.text() }))
page.on('requestfailed', (r) => logs.failed.push({ url: r.url(), method: r.method(), error: r.failure()?.errorText || 'failed' }))
page.on('response', async (r) => {
  const req = r.request()
  const rec = { url: r.url(), status: r.status(), method: req.method(), ct: r.headers()['content-type'] || null }
  logs.network.push(rec)
  if (rec.url.includes('/api/tps/ocr/extract')) {
    let slot = 'unknown'
    try {
      const pd = req.postData() || ''
      const m = pd.match(/name="docHint"\r\n\r\n([^\r\n]+)/)
      if (m?.[1]) slot = m[1]
    } catch {}
    ocrBySlot[slot] = { status: rec.status }
    if (rec.status >= 400) {
      try {
        const body = await r.json()
        ocrBySlot[slot].error = body?.error || `HTTP ${rec.status}`
      } catch {
        ocrBySlot[slot].error = `HTTP ${rec.status}`
      }
    }
  }
  if (rec.url.includes('/api/tps/generate-packet')) {
    generateStatuses.push(rec.status)
    if (rec.status >= 400) {
      try {
        const body = await r.json()
        if (Array.isArray(body?.missing)) generateMissing = body.missing
        if (typeof body?.error === 'string') generateError = body.error
      } catch {}
    }
  }
})

await page.route('**/api/tps/generate-packet', async (route) => {
  const req = route.request()
  if (req.method() !== 'POST') return route.continue()
  const resp = await route.fetch()
  const ct = (resp.headers()['content-type'] || '').toLowerCase()
  let body = null
  try { body = await resp.body() } catch {}
  if (body && body.length > 0 && (ct.includes('application/zip') || ct.includes('application/octet-stream'))) {
    generatedZipBytes = body.length
    const fp = path.join(DLOAD, `tps-packet-${Date.now()}.zip`)
    fs.writeFileSync(fp, body)
    generatedZipPath = fp
  }
  await route.fulfill({ response: resp, body: body || undefined })
})

const shot = (name) => page.screenshot({ path: path.join(SHOTS, name), fullPage: true })
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
    for (const el of Array.from(document.querySelectorAll('input')).filter(visible)) {
      if ((el.value || '').trim()) continue
      const t = (el.getAttribute('type') || 'text').toLowerCase()
      if (t === 'email') setVal(el, 'test@example.com')
      else if (t === 'tel') setVal(el, '2135551212')
      else if (t === 'date') setVal(el, '2030-01-01')
      else if (el.maxLength === 9) setVal(el, '123456789')
      else if (el.maxLength === 2) setVal(el, 'CA')
      else setVal(el, 'TEST')
    }
  })
}

async function toStep6() {
  await page.goto(startUrl, { waitUntil: 'networkidle', timeout: 90000 })
  await page.evaluate(() => { localStorage.clear(); sessionStorage.clear() })
  await page.reload({ waitUntil: 'networkidle' })
  await clickByText(['Впервые', 'Вперше', 'First time'])
  await clickByText(['Онлайн', 'Online'])
  await clickByText(['Да', 'Так', 'Yes'])
  await wait(400)

  const setIf = async (id, fp) => {
    const inp = page.locator(`[data-testid="tps-upload-input-${id}"]`).first()
    if (await inp.count()) await inp.setInputFiles(fp)
  }
  await setIf('passport', fixturePassport)
  await setIf('booklet', fixturePassport)
  await setIf('i94', fixtureI94)
  await setIf('i797_or_ead', fixtureEad)
  await setIf('dl', fixturePassport)
  await wait(4000)
  await page.locator('[data-testid="tps-ocr-cta"]').click()
  await wait(1000)
  // Fill missing OCR rows through built-in prompt-based editor.
  await page.evaluate(() => {
    const map = {
      'Фамилия': 'TESTOV',
      'Surname': 'TESTOV',
      'Имя': 'TEST',
      'Given Name': 'TEST',
      'Дата рождения': '1990-01-01',
      'Date of Birth': '1990-01-01',
      'Пол': 'M',
      'Sex': 'M',
      'Номер паспорта': 'AA1234567',
      'Passport Number': 'AA1234567',
      'I-94': '12345678901',
      'Дата въезда': '2024-01-15',
      'Last entry date': '2024-01-15',
      'A-Number': '123456789',
      'USCIS Online Account': '123456789',
      'Receipt Number': 'IOE1234567890',
    }
    window.prompt = (label, current) => {
      const l = String(label || '')
      for (const k of Object.keys(map)) {
        if (l.includes(k)) return map[k]
      }
      return current || 'TEST'
    }
  })
  const editBtns = page.locator('button:has-text("Изменить"), button:has-text("Edit"), button:has-text("Змінити")')
  const editCount = await editBtns.count()
  for (let i = 0; i < editCount; i++) {
    const btn = editBtns.nth(i)
    if (await btn.isVisible() && await btn.isEnabled()) {
      await btn.click()
      await wait(100)
    }
  }
  await fillVisibleInputs()
  const setField = async (id, value) => {
    const inp = page.locator(`[data-testid="${id}"]`).first()
    if (await inp.count()) await inp.fill(value)
  }
  await setField('tps-review-manual-address-street', '123 MAIN ST')
  await setField('tps-review-manual-address-city', 'LOS ANGELES')
  await setField('tps-review-manual-address-state', 'CA')
  await setField('tps-review-manual-address-zip', '90001')
  await setField('tps-review-manual-phone', '2135551212')
  await setField('tps-review-manual-email', 'test@example.com')
  await clickByText(['Single', 'Не женат', 'Неодружений'])
  const to6 = page.locator('[data-testid="tps-step6-continue-cta"]').first()
  if (await to6.count() && await to6.isEnabled()) await to6.click()
  await wait(1000)
}

const summary = {
  started_utc: new Date().toISOString(),
  selector_contract: {},
  client_mode: {},
  owner_mode: {},
  ocr_by_slot: {},
  generate_statuses: [],
  zip: { downloaded: false, path: null, bytes: 0 },
}

try {
  await page.goto(startUrl, { waitUntil: 'networkidle' })
  await page.evaluate(() => { localStorage.clear(); sessionStorage.clear() })
  await page.reload({ waitUntil: 'networkidle' })
  await clickByText(['Впервые', 'Вперше', 'First time'])
  await clickByText(['Онлайн', 'Online'])
  await clickByText(['Да', 'Так', 'Yes'])
  summary.selector_contract = await page.evaluate(() => ({
    ocr_cta: !!document.querySelector('[data-testid="tps-ocr-cta"]'),
    upload_slot_prefix: document.querySelectorAll('[data-testid^="tps-upload-slot-"]').length,
    upload_input_prefix: document.querySelectorAll('[data-testid^="tps-upload-input-"]').length,
  }))

  // Client unpaid/paywall proof
  await toStep6()
  await shot('client_step6_unpaid.png')
  const gateText = await page.locator('[data-testid="tps-gate-error-container"]').first().textContent().catch(() => null)
  const stepLabel = await page.locator('body').innerText().then((t) => {
    if (t.includes('Шаг 6 из 6')) return 'step6'
    if (t.includes('Шаг 5 из 6')) return 'step5'
    return 'unknown'
  })
  summary.client_mode = {
    current_step: stepLabel,
    gate_error_text: gateText ? gateText.trim().slice(0, 300) : null,
    paywall_visible: await page.locator('[data-testid="tps-paywall-state"]').count() > 0,
    generate_visible_unpaid: await page.locator('[data-testid="tps-generate-cta"]').count() > 0,
  }

  // Paid callback path
  await page.goto(`${startUrl}?paid=1`, { waitUntil: 'networkidle' })
  await wait(1200)
  await shot('client_step6_paid_callback.png')
  const part7 = page.locator('[data-testid="part7-confirm-checkbox"]').first()
  if (await part7.count()) await part7.check()
  const att = page.locator('[data-testid="tps-attestation-checkbox"]').first()
  if (await att.count()) await att.check()
  const gen = page.locator('[data-testid="tps-generate-cta"]').first()
  let genClicked = false
  if (await gen.count() && await gen.isEnabled()) {
    genClicked = true
    const dlWait = page.waitForEvent('download', { timeout: 30000 }).catch(() => null)
    await gen.click()
    const dl = await dlWait
    if (dl) {
      const fp = path.join(DLOAD, dl.suggestedFilename())
      await dl.saveAs(fp)
      generatedZipPath = generatedZipPath || fp
      generatedZipBytes = generatedZipBytes || fs.statSync(fp).size
    }
  }
  await wait(2500)
  await shot('client_after_generate.png')
  summary.client_mode.generate_clicked_paid = genClicked

  // Owner mode attempt (truthful: verify status endpoint from same session)
  const ownerResp = await context.request.get('https://messenginfo.com/api/owner/status')
  let owner = false
  try {
    const j = await ownerResp.json()
    owner = Boolean(j?.owner)
  } catch {}
  summary.owner_mode.owner_session = owner
  if (owner) {
    await toStep6()
    await shot('owner_step6.png')
    const ownerGen = page.locator('[data-testid="tps-generate-cta"]').first()
    summary.owner_mode.generate_visible = await ownerGen.count() > 0
  } else {
    summary.owner_mode.blocked_reason = 'No owner session in automation context'
  }
} finally {
  summary.ocr_by_slot = ocrBySlot
  summary.generate_statuses = generateStatuses
  summary.generate_missing = generateMissing
  summary.generate_error = generateError
  summary.zip = {
    downloaded: Boolean(generatedZipPath),
    path: generatedZipPath,
    bytes: generatedZipBytes,
  }
  fs.writeFileSync(path.join(OUT, 'dual_proof_summary.json'), JSON.stringify(summary, null, 2))
  fs.writeFileSync(path.join(OUT, 'dual_proof_network.json'), JSON.stringify(logs.network, null, 2))
  fs.writeFileSync(path.join(OUT, 'dual_proof_console.json'), JSON.stringify(logs.console, null, 2))
  fs.writeFileSync(path.join(OUT, 'dual_proof_failed_requests.json'), JSON.stringify(logs.failed, null, 2))
  await context.close()
  await browser.close()
}

console.log(JSON.stringify(summary, null, 2))
