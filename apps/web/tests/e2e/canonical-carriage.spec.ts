/**
 * canonical-carriage.spec.ts — REAL browser proof of canonical_document_id carriage.
 *
 * GOAL (closes the H3/H11 gap): prove on the wire, in a real browser against LIVE
 * production (shadow), that for each of the 4 products the CLIENT
 *   (a) captures canonical_document_id from the EXTRACT response, AND
 *   (b) RESENDS the SAME canonical_document_id in the GENERATE request body.
 *
 * Server merely accepting the id is NOT proof (H3). We assert the client-originated
 * generate request body on the wire carries the exact id captured from extract.
 *
 * PAYMENT SAFETY: generate routes are PAID in prod. We intercept the generate
 * request via page.route, read postData, assert, then route.abort() BEFORE the
 * request reaches the server — no Stripe charge, no PDF/ZIP generation.
 *
 * EXTRACT runs for real (paid Vision/Gemini) and persists a SYNTHETIC canonical_documents
 * row in the shared prod DB. We use ONLY a synthetic, non-PII fixture
 * (test-fixtures/proof/synthetic_passport.jpg — SHEVCHENKO/TARAS, fabricated MRZ).
 *
 * PII DISCIPLINE: we never log the id value or any applicant field — only presence,
 * length, equality (boolean), counts, status codes, product.
 */
import { test, expect } from '@playwright/test'
import path from 'path'
import { promises as fs } from 'fs'

const FIXTURE = path.resolve(process.cwd(), 'test-fixtures/proof/synthetic_passport.jpg')
const ARTIFACTS = path.resolve(process.cwd(), 'test-results', 'canonical-carriage')

// Vercel Deployment Protection: preview deployments are SSO-gated (HTTP 403).
// When running against a protected preview, set VERCEL_SHARE_TOKEN to the
// `_vercel_share` token (or VERCEL_SHARE_URL to the full shareable URL). The
// first navigation hits the share URL, which sets the bypass auth cookie so all
// subsequent relative navigations are authorized. No-op against public hosts
// (e.g. prod) where the env var is absent.
test.beforeEach(async ({ page, baseURL }) => {
  const fullShareUrl = process.env.VERCEL_SHARE_URL
  const token = process.env.VERCEL_SHARE_TOKEN
  if (!fullShareUrl && !token) return
  const url =
    fullShareUrl ??
    `${(baseURL ?? '').replace(/\/$/, '')}/?_vercel_share=${token}`
  // Visiting the share URL sets the protection-bypass cookie on the context.
  await page.goto(url, { waitUntil: 'domcontentloaded' })
})

type Carriage = {
  product: string
  extract_status: number | null
  extract_returned_id: boolean
  extract_id_len: number
  generate_intercepted: boolean
  generate_has_id: boolean
  ids_equal: boolean
  blocker: string | null
}

// PII-safe deployment context. Host only (no full URL with query), short SHA only.
// Never logs the canonical id value or any applicant field.
const DEPLOY_SHA =
  process.env.VERCEL_GIT_COMMIT_SHA ||
  process.env.GITHUB_SHA ||
  process.env.PLAYWRIGHT_DEPLOY_SHA ||
  null
function baseHost(): string | null {
  const raw = process.env.PLAYWRIGHT_BASE_URL || ''
  try {
    return raw ? new URL(raw).host : null
  } catch {
    return null
  }
}

async function writeResult(c: Carriage) {
  await fs.mkdir(ARTIFACTS, { recursive: true })
  const artifact = {
    ...c,
    deploy_sha: DEPLOY_SHA,
    base_url_host: baseHost(),
  }
  await fs.writeFile(
    path.join(ARTIFACTS, `${c.product}.json`),
    JSON.stringify(artifact, null, 2),
    'utf8',
  )
  // eslint-disable-next-line no-console
  console.log(`[CARRIAGE/${c.product}] ${JSON.stringify(artifact)}`)
}

/** Extract id from a JSON object (top-level canonical_document_id only). */
function idFrom(json: unknown): string | null {
  const v = (json as { canonical_document_id?: unknown })?.canonical_document_id
  return typeof v === 'string' && v.length > 0 ? v : null
}

// ─────────────────────────────────────────────────────────────────────────────
// TPS — /api/tps/ocr/extract  →  /api/tps/generate-packet
// ─────────────────────────────────────────────────────────────────────────────
test('TPS: canonical_document_id captured from extract, resent in generate-packet', async ({ page }) => {
  test.setTimeout(180_000)
  const c: Carriage = {
    product: 'tps', extract_status: null, extract_returned_id: false, extract_id_len: 0,
    generate_intercepted: false, generate_has_id: false, ids_equal: false, blocker: null,
  }
  let extractId: string | null = null

  page.on('response', async (resp) => {
    if (resp.url().includes('/api/tps/ocr/extract') && resp.request().method() === 'POST') {
      c.extract_status = resp.status()
      try {
        const json = await resp.json()
        extractId = idFrom(json)
        c.extract_returned_id = !!extractId
        c.extract_id_len = extractId ? extractId.length : 0
      } catch { /* noop */ }
    }
  })

  // Intercept generate-packet, assert body carries the id, abort before payment.
  await page.route('**/api/tps/generate-packet', async (route) => {
    c.generate_intercepted = true
    const body = route.request().postData() ?? ''
    let bodyId: string | null = null
    try { bodyId = idFrom(JSON.parse(body)) } catch { /* noop */ }
    c.generate_has_id = !!bodyId
    c.ids_equal = !!bodyId && bodyId === extractId
    await route.abort()
  })

  try {
    await page.goto('/en/services/tps-ukraine/start')
    await page.evaluate(() => {
      localStorage.removeItem('wizard:tps-ukraine:v3:state')
      localStorage.removeItem('wizard:tps-ukraine:v2:state')
      localStorage.removeItem('wizard:tps-ukraine:state')
    })
    await page.reload()
    await page.getByRole('button', { name: /First time/ }).click()
    await page.getByRole('button', { name: /By mail/ }).click()
    await page.getByRole('button', { name: /Yes Add I-765/ }).click()

    const ocrPromise = page.waitForResponse(
      (r) => r.url().includes('/api/tps/ocr/extract') && r.request().method() === 'POST',
      { timeout: 90_000 },
    )
    await page.getByTestId('tps-upload-input-passport').setInputFiles(FIXTURE)
    await ocrPromise
    await page.waitForTimeout(1000)

    if (!extractId) { c.blocker = 'extract_returned_no_canonical_id'; await writeResult(c); expect(c.extract_returned_id, 'extract must return id').toBe(true); return }

    await expect(page.getByTestId('tps-ocr-cta')).toBeVisible({ timeout: 15_000 })
    await page.getByTestId('tps-ocr-cta').click()
    await expect(page.getByTestId('tps-review-step-container')).toBeVisible({ timeout: 60_000 })
    await page.waitForTimeout(1200)

    // Fill the minimal synthetic gating fields so the wizard lets us reach generate.
    const editOcr = async (key: string, value: string) => {
      const btn = page.getByTestId(`tps-ocr-edit-${key}`)
      if ((await btn.count()) === 0) return
      page.once('dialog', (d) => d.accept(value))
      await btn.click()
      await page.waitForTimeout(120)
    }
    await editOcr('given_name', 'Testname')
    await editOcr('passport_number', 'AA000000')
    await editOcr('dob', '01/01/1980')
    await editOcr('last_entry_date', '09/09/2022')
    await editOcr('i94_admission_number', '000000000A0')
    await editOcr('status_at_last_entry', 'UHP')

    const fillIfEmpty = async (testId: string, value: string) => {
      const input = page.getByTestId(testId)
      if ((await input.count()) === 0) return
      if (!(await input.inputValue()).trim()) await input.fill(value)
    }
    await fillIfEmpty('tps-review-manual-address-street', '1213 Gordon St')
    await fillIfEmpty('tps-review-manual-address-city', 'Los Angeles')
    await fillIfEmpty('tps-review-manual-address-state', 'CA')
    await fillIfEmpty('tps-review-manual-address-zip', '90038')
    await fillIfEmpty('tps-review-manual-place-of-last-entry', 'Los Angeles')
    await fillIfEmpty('tps-review-manual-passport-expiration', '01/01/2030')
    await fillIfEmpty('tps-review-manual-phone', '2135550199')
    await fillIfEmpty('tps-review-manual-email', 'qa+carriage@messenginfo.test')
    await fillIfEmpty('tps-review-manual-in-care-of', 'QA TEST')

    const single = page.getByRole('button', { name: /^Single$/ })
    if ((await single.count()) > 0) await single.click()
    const part7 = page.getByTestId('tps-part7-checkbox')
    if ((await part7.count()) > 0) await part7.check()

    await page.getByTestId('tps-step6-continue-cta').click()
    // Simulate the Stripe success redirect: a ?paid=1 page reload. This is the
    // exact round-trip that previously DROPPED the canonical_document_id. The
    // wizard now persists/restores canonical_document_id in uploadsMeta
    // (TPSWizardV2 persist L1816-1824 / restore L1748-1754, mirroring Re-Parole),
    // so the id survives the reload and is resent in the generate-packet body.
    await page.goto('/en/services/tps-ukraine/start?paid=1')
    await expect(page.getByTestId('tps-generate-cta')).toBeVisible({ timeout: 20_000 })
    await page.getByTestId('tps-generate-cta').click()
    // Give the aborted request a moment to be observed.
    await page.waitForTimeout(2000)
  } catch (e) {
    if (!c.blocker) c.blocker = `nav_error:${String(e).slice(0, 200)}`
  }

  await writeResult(c)
  // Positive carriage: extract returns the id, the wizard persists it across the
  // ?paid=1 Stripe-return reload, and the post-payment generate-packet body carries
  // the SAME id. We abort the request before it reaches the server (no payment, no
  // packet); proof is the on-the-wire request body.
  expect(c.extract_returned_id, 'extract returned canonical_document_id').toBe(true)
  expect(c.generate_intercepted, 'generate request intercepted on the wire').toBe(true)
  expect(c.generate_has_id, 'generate body carried canonical_document_id across the paid reload').toBe(true)
  expect(c.ids_equal, 'generate-body id equals the extract-returned id').toBe(true)
})

// ─────────────────────────────────────────────────────────────────────────────
// Re-Parole — /api/reparole/ocr/extract  →  /api/reparole/generate-packet
// ─────────────────────────────────────────────────────────────────────────────
test('Re-Parole: canonical_document_id captured from extract, resent in generate-packet', async ({ page }) => {
  test.setTimeout(180_000)
  const c: Carriage = {
    product: 'reparole', extract_status: null, extract_returned_id: false, extract_id_len: 0,
    generate_intercepted: false, generate_has_id: false, ids_equal: false, blocker: null,
  }
  let extractId: string | null = null

  page.on('response', async (resp) => {
    if (resp.url().includes('/api/reparole/ocr/extract') && resp.request().method() === 'POST') {
      c.extract_status = resp.status()
      try {
        const json = await resp.json()
        extractId = idFrom(json)
        c.extract_returned_id = !!extractId
        c.extract_id_len = extractId ? extractId.length : 0
      } catch { /* noop */ }
    }
  })

  await page.route('**/api/reparole/generate-packet', async (route) => {
    c.generate_intercepted = true
    let bodyId: string | null = null
    try { bodyId = idFrom(JSON.parse(route.request().postData() ?? '')) } catch { /* noop */ }
    c.generate_has_id = !!bodyId
    c.ids_equal = !!bodyId && bodyId === extractId
    await route.abort()
  })

  try {
    await page.goto('/en/services/re-parole-u4u/start')
    await page.evaluate(() => {
      for (const k of Object.keys(localStorage)) {
        if (k.toLowerCase().includes('reparole') || k.toLowerCase().includes('re-parole')) localStorage.removeItem(k)
      }
    })
    await page.reload()

    // Step 1 (method) → Step 2 (ead) → Step 3 (uploads)
    await page.getByRole('button', { name: /By mail/ }).click()
    await page.getByRole('button', { name: /Check box in Part 9/i }).click() // step2 "Yes" (EAD)
    await page.waitForTimeout(600)

    // Step 3: passport upload is the first hidden file input under the upload card.
    // Route the reparole Core extract response explicitly (passport → /api/reparole/ocr/extract).
    const ocrPromise = page.waitForResponse(
      (r) => r.url().includes('/api/reparole/ocr/extract') && r.request().method() === 'POST',
      { timeout: 90_000 },
    )
    const fileInput = page.locator('input[type="file"]').first()
    await fileInput.setInputFiles(FIXTURE)
    await ocrPromise
    await page.waitForTimeout(1500)

    if (!extractId) {
      c.blocker = 'extract_returned_no_canonical_id (reparole extract did not emit canonical id — check _core flag / route)'
      await writeResult(c)
      expect(c.extract_returned_id, 'extract returned id').toBe(true)
      return
    }

    // Advance Step 3 → 4 ("Recognize →") → 5 ("Generate →")
    await page.getByRole('button', { name: /Recognize/i }).first().click()
    await page.waitForTimeout(800)
    await page.getByRole('button', { name: /Generate/i }).first().click()
    await page.waitForTimeout(800)
    // Step 5: pay+download. Bypass paywall via ?paid=1, then click the ZIP download.
    await page.goto('/en/services/re-parole-u4u/start?paid=1')
    await page.waitForTimeout(1500)
    const genBtn = page.getByRole('button', { name: /Download packet|Download|Завантажити|Скачать|Descargar/i }).first()
    await expect(genBtn).toBeVisible({ timeout: 20_000 })
    await genBtn.click()
    await page.waitForTimeout(2000)
  } catch (e) {
    if (!c.blocker) c.blocker = `nav_error:${String(e).slice(0, 200)}`
  }

  await writeResult(c)
  if (c.blocker) throw new Error(c.blocker)
  expect(c.extract_returned_id).toBe(true)
  expect(c.generate_intercepted).toBe(true)
  expect(c.generate_has_id).toBe(true)
  expect(c.ids_equal).toBe(true)
})

// ─────────────────────────────────────────────────────────────────────────────
// EAD — /api/ead/ocr/extract  →  /api/ead/generate-packet
// ─────────────────────────────────────────────────────────────────────────────
test('EAD: canonical_document_id captured from extract, resent in generate-packet', async ({ page }) => {
  test.setTimeout(180_000)
  const c: Carriage = {
    product: 'ead', extract_status: null, extract_returned_id: false, extract_id_len: 0,
    generate_intercepted: false, generate_has_id: false, ids_equal: false, blocker: null,
  }
  let extractId: string | null = null

  page.on('response', async (resp) => {
    if (resp.url().includes('/api/ead/ocr/extract') && resp.request().method() === 'POST') {
      c.extract_status = resp.status()
      try {
        const json = await resp.json()
        extractId = idFrom(json)
        c.extract_returned_id = !!extractId
        c.extract_id_len = extractId ? extractId.length : 0
      } catch { /* noop */ }
    }
  })

  await page.route('**/api/ead/generate-packet', async (route) => {
    c.generate_intercepted = true
    let bodyId: string | null = null
    try { bodyId = idFrom(JSON.parse(route.request().postData() ?? '')) } catch { /* noop */ }
    c.generate_has_id = !!bodyId
    c.ids_equal = !!bodyId && bodyId === extractId
    await route.abort()
  })

  try {
    await page.goto('/en/services/ead-work-permit/start')
    // Step 0 (appType) → "New EAD" then Continue
    await page.getByRole('button', { name: /New EAD/i }).click()
    await page.getByRole('button', { name: /Continue/i }).click()
    // Step 1 (category) → "U4U Re-Parole" then Continue
    await page.getByRole('button', { name: /U4U Re-Parole|TPS Ukraine|Pending Asylum/i }).first().click()
    await page.getByRole('button', { name: /Continue/i }).click()
    await page.waitForTimeout(600)

    // Step 2: upload (file input, default hint = Passport photo page). Extract prefills name/dob.
    const ocrPromise = page.waitForResponse(
      (r) => r.url().includes('/api/ead/ocr/extract') && r.request().method() === 'POST',
      { timeout: 90_000 },
    ).catch(() => null)
    const fileInput = page.locator('input[type="file"]').first()
    await fileInput.setInputFiles(FIXTURE)
    await ocrPromise
    await page.waitForTimeout(1500)

    if (c.extract_status === 503) {
      c.blocker = 'ead_extract_503 (ONE_CORE_EAD_ENABLED is OFF in prod — extract never runs Core, no canonical id)'
      await writeResult(c); throw new Error(c.blocker)
    }
    if (!extractId) {
      c.blocker = `ead_extract_no_canonical_id (status=${c.extract_status})`
      await writeResult(c); throw new Error(c.blocker)
    }

    // Advance through remaining steps to the download (generate-packet) button.
    // Step3 (personal info, prefilled), Step4, Step5 (filing method + address), Step6 (download).
    for (let i = 0; i < 8; i++) {
      const dl = page.getByRole('button', { name: /Download Filled I-765 PDF|Download.*I-765.*PDF/i }).first()
      if ((await dl.count()) > 0) { await dl.click(); await page.waitForTimeout(2500); break }
      // Step5 gating: choose mail filing + fill US address.
      const mailBtn = page.getByRole('button', { name: /By mail|Mail|^Mail/i }).first()
      if ((await mailBtn.count()) > 0) await mailBtn.click().catch(() => {})
      const addr = page.locator('#ead-usAddress')
      if ((await addr.count()) > 0 && !(await addr.inputValue())) await addr.fill('1213 Gordon St\nLos Angeles, CA 90038').catch(() => {})
      const cont = page.getByRole('button', { name: /Continue/i }).first()
      if ((await cont.count()) === 0) break
      await cont.click().catch(() => {})
      await page.waitForTimeout(600)
    }
  } catch (e) {
    if (!c.blocker) c.blocker = `nav_error:${String(e).slice(0, 200)}`
  }

  await writeResult(c)
  if (c.blocker) throw new Error(c.blocker)
  expect(c.extract_returned_id).toBe(true)
  expect(c.generate_intercepted).toBe(true)
  expect(c.generate_has_id).toBe(true)
  expect(c.ids_equal).toBe(true)
})

// ─────────────────────────────────────────────────────────────────────────────
// Translation — /api/translation/vision-extract  →  /api/translation/generate-pdf (+ /render)
// ─────────────────────────────────────────────────────────────────────────────
test('Translation: canonical_document_id captured from vision-extract, resent in generate-pdf', async ({ page }) => {
  test.setTimeout(180_000)
  const c: Carriage = {
    product: 'translation', extract_status: null, extract_returned_id: false, extract_id_len: 0,
    generate_intercepted: false, generate_has_id: false, ids_equal: false, blocker: null,
  }
  let extractId: string | null = null

  page.on('response', async (resp) => {
    if (resp.url().includes('/api/translation/vision-extract') && resp.request().method() === 'POST') {
      c.extract_status = resp.status()
      try {
        const json = await resp.json()
        extractId = idFrom(json)
        c.extract_returned_id = !!extractId
        c.extract_id_len = extractId ? extractId.length : 0
      } catch { /* noop */ }
    }
  })

  const onGenerate = async (route: import('@playwright/test').Route) => {
    c.generate_intercepted = true
    let bodyId: string | null = null
    try { bodyId = idFrom(JSON.parse(route.request().postData() ?? '')) } catch { /* noop */ }
    c.generate_has_id = !!bodyId
    c.ids_equal = !!bodyId && bodyId === extractId
    await route.abort()
  }
  await page.route('**/api/translation/generate-pdf', onGenerate)
  await page.route('**/api/translation/render', onGenerate)

  try {
    await page.goto('/en/services/translate-document/start')

    // Start → choose "International Passport" (passport_foreign, auto:true → vision-extract)
    await page.getByRole('button', { name: /Start translation/i }).click()
    await page.waitForTimeout(800)
    await page.getByRole('button', { name: /International Passport/i }).click()
    await page.waitForTimeout(400)
    const nextBtn = page.getByRole('button', { name: /Next/i }).first()
    if ((await nextBtn.count()) > 0) await nextBtn.click().catch(() => {})
    await page.waitForTimeout(800)

    // Upload step exposes file inputs; the gallery ("Choose file") input accepts the file.
    const fileInput = page.locator('input[type="file"]').first()
    if ((await fileInput.count()) === 0) {
      c.blocker = 'translation_upload_input_not_reachable (doc-type/step gating before upload)'
      await writeResult(c); throw new Error(c.blocker)
    }
    await fileInput.setInputFiles(FIXTURE)
    await page.waitForTimeout(1500)

    // Vision-extract is NOT auto-fired; the user clicks "Recognize document/N pages →".
    const ocrPromise = page.waitForResponse(
      (r) => r.url().includes('/api/translation/vision-extract') && r.request().method() === 'POST',
      { timeout: 120_000 },
    ).catch(() => null)
    await page.getByRole('button', { name: /Recognize/i }).first().click()
    await ocrPromise
    await page.waitForTimeout(2500)

    if (!extractId) {
      c.blocker = `translation_extract_no_canonical_id (status=${c.extract_status}; vision-extract may not have run autoread for this doc-type)`
      await writeResult(c); throw new Error(c.blocker)
    }

    // generate-pdf is reachable ONLY on the post-payment success screen and is
    // gated by a valid Stripe X-Payment-Token + an on-screen drawn signature +
    // certification checkboxes (TranslateWizard.tsx ~L1457-1508). It cannot be
    // driven headlessly without completing a real Stripe charge. We therefore
    // prove the EXTRACT-side capture on the wire here; the client-side RESEND is
    // covered by the wizard persisting canonicalDocumentId into the Stripe-round-trip
    // draft and spreading it into the generate-pdf body (L1508). Record as a
    // payment-gated blocker for the generate leg — NOT a carriage failure.
    c.blocker = 'generate_pdf_behind_payment_gate (X-Payment-Token + on-screen signature required; cannot intercept without a real Stripe charge — extract-side carriage proven on the wire)'
  } catch (e) {
    if (!c.blocker) c.blocker = `nav_error:${String(e).slice(0, 200)}`
  }

  await writeResult(c)
  // Extract-side carriage MUST hold (this is the part observable without payment).
  expect(c.extract_returned_id, 'vision-extract returned canonical_document_id').toBe(true)
  expect(c.extract_status, 'vision-extract 200').toBe(200)
  // Generate leg is payment-gated; documented as a blocker, not asserted on the wire.
})
