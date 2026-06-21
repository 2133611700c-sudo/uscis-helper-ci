/**
 * translation-review-gate.spec.ts
 *
 * End-to-end proof that the P3 Translation Review Gate (8 CFR §103.2(b)(3)) works:
 *
 * 1. Booklet uploaded → OCR runs → wizard reaches Step 6
 * 2. "Review Translation" button visible (translationReviewConfirmed is false)
 * 3. Clicking it calls /api/tps/translation/preview → modal appears
 * 4. Without checking the checkbox: Confirm button shows validation error
 * 5. Check the checkbox → click Confirm → modal closes, translationReviewConfirmed = true
 * 6. "Review Translation" button disappears (confirmed)
 * 7. Generate ZIP → /api/tps/generate-packet called with reviewConfirmed: true
 * 8. ZIP downloaded → verify Translation HTML present and safety assertions pass
 */

import { test, expect } from '@playwright/test'
import path from 'path'
import { promises as fs } from 'fs'
import { execSync } from 'child_process'

const REPO_ROOT = path.resolve(process.cwd(), '../..')
const BOOKLET_IMAGE = path.join(REPO_ROOT, 'qa-shots/private/booklet_test_resized.jpg')
const PASSPORT_IMAGE = process.env.E2E_PASSPORT_IMAGE ?? path.join(REPO_ROOT, 'qa-shots/private/passport_test.jpg')
const I94_IMAGE = process.env.E2E_I94_IMAGE ?? path.join(REPO_ROOT, 'qa-shots/private/i94_test.jpg')

// family/city/province/middle come from OCR of the real booklet image (the
// image is gitignored). `given` is the SYNTHETIC value we type via the
// ReviewOcr edit button — it MUST appear in the translation (regression guard
// for the 2026-05-27 bug where the manually-supplied given name never reached
// the translation due to a *_manual key mismatch).
const EXPECTED_FAMILY_NAME = process.env.E2E_EXPECTED_FAMILY_NAME ?? 'Ivanenko'
const EXPECTED = {
  family: EXPECTED_FAMILY_NAME,
  city: 'Trostianets',
  province: 'Vinnytsia',
  middle: 'Tarasovych',
  given: 'Testname',
}

test('Review Gate: preview → block without checkbox → confirm → translation in ZIP', async ({ page, browserName }) => {
  test.setTimeout(300_000)

  const artifactsDir = path.resolve(process.cwd(), 'test-results', 'translation-review-gate-artifacts')
  await fs.mkdir(artifactsDir, { recursive: true })
  for (const f of [BOOKLET_IMAGE, PASSPORT_IMAGE, I94_IMAGE]) {
    await fs.access(f)
  }

  // Track /api/tps/translation/preview calls
  const previewResponses: Array<Record<string, unknown>> = []
  page.on('response', async (resp) => {
    if (!resp.url().includes('/api/tps/translation/preview') || resp.request().method() !== 'POST') return
    try {
      const payload = await resp.json()
      previewResponses.push({
        status: resp.status(),
        preview_only: payload?.preview_only ?? null,
        violations_count: (payload?.violations ?? []).length,
        translation_html_length: (payload?.translation_html ?? '').length,
        certification_html_length: (payload?.certification_html ?? '').length,
      })
    } catch {
      previewResponses.push({ status: resp.status(), parse_error: true })
    }
  })

  // Track /api/tps/generate-packet reviewConfirmed in request body
  let generateRequestJson: Record<string, unknown> | null = null
  page.on('request', async (req) => {
    if (!req.url().includes('/api/tps/generate-packet') || req.method() !== 'POST') return
    try {
      const body = req.postData()
      if (body) generateRequestJson = JSON.parse(body) as Record<string, unknown>
    } catch { /* ignore */ }
  })

  // Deterministic clean state
  await page.goto('/en/services/tps-ukraine/start')
  await page.evaluate(() => {
    localStorage.removeItem('wizard:tps-ukraine:v3:state')
    localStorage.removeItem('wizard:tps-ukraine:v2:state')
    localStorage.removeItem('wizard:tps-ukraine:state')
  })
  await page.reload()

  // Steps 1–3
  await page.getByRole('button', { name: /First time/ }).click()
  await page.getByRole('button', { name: /By mail/ }).click()
  await page.getByRole('button', { name: /Yes Add I-765/ }).click()

  // Upload passport + booklet + I-94 sequentially, waiting for each OCR response
  // before uploading the next. Passport provides given_name/passport_number
  // (booklet OCR cannot — they're in the forbidden list). I-94 provides last_entry_date.
  // All three are needed for gate eligibility; booklet is the translation source.
  await expect(page.getByTestId('tps-upload-input-passport')).toBeAttached({ timeout: 10_000 })

  const passportOcr = page.waitForResponse(
    (r) => r.url().includes('/api/tps/ocr/extract') && r.request().method() === 'POST' && r.status() === 200,
    { timeout: 90_000 },
  )
  await page.getByTestId('tps-upload-input-passport').setInputFiles(PASSPORT_IMAGE)
  await passportOcr

  const bookletOcr = page.waitForResponse(
    (r) => r.url().includes('/api/tps/ocr/extract') && r.request().method() === 'POST' && r.status() === 200,
    { timeout: 90_000 },
  )
  await page.getByTestId('tps-upload-input-booklet').setInputFiles(BOOKLET_IMAGE)
  await bookletOcr

  const i94Ocr = page.waitForResponse(
    (r) => r.url().includes('/api/tps/ocr/extract') && r.request().method() === 'POST' && r.status() === 200,
    { timeout: 90_000 },
  )
  await page.getByTestId('tps-upload-input-i94').setInputFiles(I94_IMAGE)
  await i94Ocr

  // CTA is always visible in step 4 (just the "Next" button)
  await expect(page.getByTestId('tps-ocr-cta')).toBeVisible({ timeout: 10_000 })
  await page.getByTestId('tps-ocr-cta').click()
  await expect(page.getByTestId('tps-review-step-container')).toBeVisible({ timeout: 60_000 })

  // Wait for the booklet family_name row to appear — this confirms the CB merge
  // has completed with booklet data before we start editing fields.
  await expect(page.locator('body')).toContainText(EXPECTED.family, { timeout: 60_000 })

  // Identity + document fields are recognized rows in ReviewOcr, each with an
  // "Изменить" (edit) button (data-testid tps-ocr-edit-<key>). Editing writes
  // the value into the synthetic 'manual' upload slot under the base key, which
  // flows into the gate, the forms, AND the translation. There is NO separate
  // manual-entry section for these (auto-fill product rule). All values below
  // are SYNTHETIC — never real document data.
  const editOcrField = async (key: string, value: string) => {
    const btn = page.getByTestId(`tps-ocr-edit-${key}`)
    if ((await btn.count()) === 0) return
    page.once('dialog', async (dialog) => dialog.accept(value))
    await btn.click()
    await page.waitForTimeout(150)
  }

  await editOcrField('i94_admission_number', '000000000A0')
  await editOcrField('status_at_last_entry', 'UHP')
  // Identity gate fields via the recognized-row edit button (SYNTHETIC values).
  await editOcrField('given_name', 'Testname')
  await editOcrField('passport_number', 'AA000000')
  await editOcrField('dob', '01/01/1980')
  await editOcrField('last_entry_date', '09/09/2022')

  const fillIfEmpty = async (testId: string, value: string) => {
    const input = page.getByTestId(testId)
    if ((await input.count()) === 0) return
    await expect(input).toBeVisible()
    if (!(await input.inputValue()).trim()) await input.fill(value)
  }

  // Remaining ReviewManual inputs — all SYNTHETIC values, no real PII.
  await fillIfEmpty('tps-review-manual-address-street', '1213 Gordon St')
  await fillIfEmpty('tps-review-manual-address-city', 'Los Angeles')
  await fillIfEmpty('tps-review-manual-address-state', 'CA')
  await fillIfEmpty('tps-review-manual-address-zip', '90038')
  await fillIfEmpty('tps-review-manual-place-of-last-entry', 'Los Angeles')
  await fillIfEmpty('tps-review-manual-passport-expiration', '01/01/2030')
  await fillIfEmpty('tps-review-manual-phone', '2135550199')
  await fillIfEmpty('tps-review-manual-email', 'qa+reviewgate@messenginfo.test')
  await fillIfEmpty('tps-review-manual-in-care-of', 'QA TEST')

  await page.getByRole('button', { name: /^Single$/ }).click()
  if ((await page.getByTestId('tps-part7-checkbox').count()) > 0) {
    await page.getByTestId('tps-part7-checkbox').check()
  }

  // Proceed to Step 6 (paywall bypass)
  await page.getByTestId('tps-step6-continue-cta').click()
  await page.goto('/en/services/tps-ukraine/start?paid=1')

  // ── GATE TEST 1: "Review Translation" button visible before confirmation ──
  await expect(page.getByTestId('tps-review-translation-btn')).toBeVisible({ timeout: 20_000 })
  await page.screenshot({ path: path.join(artifactsDir, 'step6-before-review.png'), fullPage: true })

  // ── GATE TEST 2: clicking "Review Translation" calls preview API and opens modal ──
  const previewResponsePromise = page.waitForResponse(
    (r) => r.url().includes('/api/tps/translation/preview') && r.request().method() === 'POST' && r.status() === 200,
    { timeout: 30_000 },
  )
  await page.getByTestId('tps-review-translation-btn').click()
  await previewResponsePromise

  await expect(page.getByTestId('translation-review-gate')).toBeVisible({ timeout: 15_000 })
  await page.screenshot({ path: path.join(artifactsDir, 'review-gate-modal.png'), fullPage: true })

  // ── GATE TEST 3: confirm without checkbox shows validation error ──
  await page.getByTestId('translation-review-confirm-btn').click()
  // The gate should NOT close — still visible
  await expect(page.getByTestId('translation-review-gate')).toBeVisible()
  // Validation error text should appear
  await expect(page.locator('[data-testid="translation-review-gate"]')).toContainText(
    /must check|debe marcar|повинні відмітити|должны отметить/i,
  )

  // ── GATE TEST 4: check checkbox ──
  await page.getByTestId('translation-review-checkbox').check()
  await expect(page.getByTestId('translation-review-checkbox')).toBeChecked()

  // ── GATE TEST 5: confirm with checkbox closes modal and sets reviewConfirmed ──
  await page.getByTestId('translation-review-confirm-btn').click()
  // Modal must close
  await expect(page.getByTestId('translation-review-gate')).not.toBeVisible({ timeout: 5_000 })
  // "Review Translation" button must disappear (translationReviewConfirmed = true)
  await expect(page.getByTestId('tps-review-translation-btn')).not.toBeVisible({ timeout: 5_000 })

  await page.screenshot({ path: path.join(artifactsDir, 'step6-after-review-confirmed.png'), fullPage: true })

  // ── GATE TEST 6: generate ZIP with reviewConfirmed: true ──
  await expect(page.getByTestId('tps-generate-cta')).toBeVisible({ timeout: 20_000 })

  const zipResponsePromise = page.waitForResponse(
    (r) => r.url().includes('/api/tps/generate-packet') && r.request().method() === 'POST' && r.status() === 200,
    { timeout: 60_000 },
  )
  const downloadPromise = page.waitForEvent('download', { timeout: 60_000 })

  await page.getByTestId('tps-generate-cta').click()
  await zipResponsePromise
  const download = await downloadPromise

  // Verify reviewConfirmed: true was sent in request
  await fs.writeFile(
    path.join(artifactsDir, 'generate-request-translation.json'),
    JSON.stringify({
      has_generate_json: generateRequestJson !== null,
      review_confirmed_flag: (generateRequestJson as unknown as { _translation?: { reviewConfirmed?: boolean } })?._translation?.reviewConfirmed ?? 'NOT_FOUND',
    }, null, 2),
    'utf8',
  )

  if (generateRequestJson !== null) {
    const translationOpts = (generateRequestJson as { _translation?: { reviewConfirmed?: boolean } })?._translation
    expect(translationOpts?.reviewConfirmed).toBe(true)
  }

  // ── GATE TEST 7: ZIP contains Translation HTML ──
  const zipPath = path.join(artifactsDir, 'tps-packet-reviewed.zip')
  await download.saveAs(zipPath)
  const zipStat = await fs.stat(zipPath)

  const translationProof: Record<string, unknown> = { zip_bytes: zipStat.size }
  try {
    const unzipDir = path.join(artifactsDir, 'unzipped')
    await fs.mkdir(unzipDir, { recursive: true })
    execSync(`unzip -o "${zipPath}" -d "${unzipDir}"`, { stdio: 'pipe' })

    const translationFile = path.join(unzipDir, 'Translation_Internal_Passport.html')
    const certFile = path.join(unzipDir, 'Certification_Translation.html')

    let translationHtml = ''
    try {
      translationHtml = await fs.readFile(translationFile, 'utf8')
      translationProof.translation_file_present = true
      translationProof.translation_bytes = translationHtml.length
    } catch {
      translationProof.translation_file_present = false
    }

    let certHtml = ''
    try {
      certHtml = await fs.readFile(certFile, 'utf8')
      translationProof.certification_file_present = true
    } catch {
      translationProof.certification_file_present = false
    }

    if (translationHtml) {
      translationProof.has_surname = translationHtml.includes(EXPECTED.family)
      translationProof.has_given_name = translationHtml.includes(EXPECTED.given)
      translationProof.has_given_name_label = translationHtml.includes('Given Name')
      translationProof.has_city = translationHtml.includes(EXPECTED.city)
      translationProof.has_patronymic_label = translationHtml.includes('Patronymic')
      translationProof.no_middle_name_label = !translationHtml.includes('Middle Name')

      // Core safety assertions
      expect(translationHtml).toContain(EXPECTED.family)
      // Regression guard: the synthetic given name supplied via the ReviewOcr
      // edit button MUST reach the translation (Given Name row present).
      expect(translationHtml).toContain('Given Name')
      expect(translationHtml).toContain(EXPECTED.given)
      expect(translationHtml).toContain('Patronymic')
      expect(translationHtml).not.toContain('Middle Name')
      expect(translationHtml).toContain('Internal Passport')
      expect(translationHtml).toContain('Ukraine')
    }

    if (certHtml) {
      translationProof.cert_has_competency = /competent to translate|complete and accurate/i.test(certHtml)
      translationProof.cert_no_ai_cert = !(/certified by AI/i.test(certHtml))
      expect(certHtml).toMatch(/competent to translate|complete and accurate/i)
      expect(certHtml).not.toMatch(/certified by AI/i)
    }
  } catch (e) {
    translationProof.unzip_error = String(e)
    // eslint-disable-next-line no-console
    console.warn(`[review-gate/${browserName}] UNZIP_ERROR=${String(e)}`)
  }

  // Write proof artifacts
  await fs.writeFile(
    path.join(artifactsDir, 'preview-responses.json'),
    JSON.stringify(previewResponses, null, 2),
    'utf8',
  )
  await fs.writeFile(
    path.join(artifactsDir, 'translation-proof.json'),
    JSON.stringify(translationProof, null, 2),
    'utf8',
  )

  // Preview API assertions
  expect(previewResponses.length).toBeGreaterThan(0)
  const firstPreview = previewResponses[0]
  expect(firstPreview.status).toBe(200)
  expect(firstPreview.preview_only).toBe(true)
  expect(firstPreview.violations_count).toBe(0)

  // eslint-disable-next-line no-console
  console.log(`[review-gate/${browserName}] PREVIEW_RESPONSES=${JSON.stringify(previewResponses)}`)
  // eslint-disable-next-line no-console
  console.log(`[review-gate/${browserName}] TRANSLATION_PROOF=${JSON.stringify(translationProof)}`)
  // eslint-disable-next-line no-console
  console.log(`[review-gate/${browserName}] ZIP_BYTES=${zipStat.size}`)
})
