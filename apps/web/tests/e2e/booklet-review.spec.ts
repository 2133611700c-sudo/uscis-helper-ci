/**
 * tests/e2e/booklet-review.spec.ts
 *
 * The Definition-of-Done test that Session 17 owed and never wrote.
 *
 * Walks the TPS Ukraine wizard end-to-end with the canonical booklet
 * sample and verifies that the expected family_name actually reaches
 * the Step 5 review DOM — i.e. survives the THREE legs of the bug
 * pattern that Session 17 introduced:
 *   1. BOOKLET_WAVE1_FIELDS filter
 *   2. SLOT_ALLOWED_FIELDS.booklet hydration filter
 *   3. ExtractionSource/SourceType union narrowing
 *
 * Why this exists: the prior session declared "production verified"
 * based on a curl against the OCR API, which returned the right
 * field. The client-side filter chain silently dropped it before the
 * user ever saw it. The wizard-simulation-test.mjs script mirrors
 * the filter logic in JS but hard-codes the wave1 Set — it does NOT
 * exercise the deployed bundle, localStorage hydration, or DOM
 * rendering. This Playwright walk does all three.
 *
 * Strategy:
 *   - Use the English locale (deterministic labels).
 *   - Click through steps 1-3 by visible text (no testids on
 *     OptionPair, so visible-text selectors are the contract).
 *   - At step 4, find the booklet upload input by data-testid and
 *     attach the canonical sample image.
 *   - Wait for upload+OCR ("Recognize documents →" CTA).
 *   - At step 5, byte-grep the DOM for E2E_EXPECTED_FAMILY_NAME.
 *
 * Pass criterion: review DOM contains the expected family name.
 * Set E2E_EXPECTED_FAMILY_NAME in .env.test (gitignored) when running
 * with real document fixtures. Only appears if all three filter legs
 * let family_name through.
 *
 * Run:
 *   pnpm --filter web exec playwright test booklet-review
 *
 * Target overrides:
 *   PLAYWRIGHT_BASE_URL=http://localhost:3000 pnpm --filter web exec ...
 *   (default target is https://messenginfo.com — see playwright.config.ts)
 *
 * COST WARNING: each run triggers a real OCR call on the target. On
 * prod that is one DocAI + one Vision + one DeepSeek crossref call.
 * Don't loop this test.
 */

import { test, expect } from '@playwright/test'
import path from 'path'
import { promises as fs } from 'fs'

const REPO_ROOT = path.resolve(process.cwd(), '../..')
const BOOKLET_IMAGE = path.join(REPO_ROOT, 'qa-shots/private/booklet_test_resized.jpg')
const PASSPORT_IMAGE = path.join(REPO_ROOT, process.env.E2E_PASSPORT_IMAGE ?? 'qa-shots/private/passport_test.jpg')
const I94_IMAGE = path.join(REPO_ROOT, process.env.E2E_I94_IMAGE ?? 'qa-shots/private/i94_test.jpg')
const EAD_IMAGE = path.join(REPO_ROOT, 'qa-shots/private/Ead1.jpg')
const DL_IMAGE = path.join(REPO_ROOT, 'qa-shots/private/DL.jpg')

// Set these in .env.test (gitignored) when running with real document fixtures.
const EXPECTED_FAMILY_NAME = process.env.E2E_EXPECTED_FAMILY_NAME ?? 'Ivanenko'
const EXPECTED_CITY = process.env.E2E_EXPECTED_CITY ?? 'Vinnytsia'
const EXPECTED_PROVINCE = process.env.E2E_EXPECTED_PROVINCE ?? 'Vinnytsia'
const EXPECTED_PATRONYMIC = process.env.E2E_EXPECTED_PATRONYMIC ?? 'Ivanovych'

test('booklet upload → review fields survive → generate ZIP', async ({ page, browserName }) => {
  test.setTimeout(240_000)
  const artifactsDir = path.resolve(process.cwd(), 'test-results', 'booklet-review-artifacts')
  await fs.mkdir(artifactsDir, { recursive: true })

  for (const f of [BOOKLET_IMAGE, PASSPORT_IMAGE, I94_IMAGE, EAD_IMAGE, DL_IMAGE]) {
    await fs.access(f)
  }

  // 1) Land on the English wizard.
  await page.goto('/en/services/tps-ukraine/start')
  const ocrResponses: Array<Record<string, unknown>> = []
  page.on('response', async (resp) => {
    if (!resp.url().includes('/api/tps/ocr/extract') || resp.request().method() !== 'POST') return
    try {
      const payload = await resp.json()
      ocrResponses.push({
        status: resp.status(),
        doc_type_hint: payload?.doc_type_hint ?? null,
        document_id: payload?.document_id ?? null,
        final_field_keys: payload?.final_field_keys ?? [],
        knowledge_rejected_fields: payload?.knowledge_rejected_fields ?? [],
        brain_status: payload?.brain_status ?? null,
      })
    } catch {
      ocrResponses.push({ status: resp.status(), parse_error: true })
    }
  })

  // 1a) Clean localStorage so the test runs deterministically regardless
  //     of any prior session that may have been written by hand or by
  //     a previous test run. This is the SAME hydration path real users
  //     would hit on first visit, which is what we want to verify.
  await page.evaluate(() => {
    localStorage.removeItem('wizard:tps-ukraine:v3:state')
    localStorage.removeItem('wizard:tps-ukraine:v2:state')
    localStorage.removeItem('wizard:tps-ukraine:state')
  })
  await page.reload()

  // 2) STEP 1 — pick "First time" (init filing).
  await page.getByRole('button', { name: /First time/ }).click()

  // 3) STEP 2 — pick "By mail" (paper filing path — avoids the online
  //    fee-waiver warning and is the booklet-friendly path).
  await page.getByRole('button', { name: /By mail/ }).click()

  // 4) STEP 3 — choose EAD=yes so gate-required fields can be sourced
  // from passport/I-94/EAD/DL during one real flow.
  await page.getByRole('button', { name: /Yes Add I-765/ }).click()

  // 5) STEP 4 — upload canonical dataset files by slot.
  // input is display:none but Playwright
  //    can still attach files to it directly via the testid handle.
  await expect(page.getByTestId('tps-upload-input-passport')).toBeAttached({ timeout: 10_000 })
  await page.getByTestId('tps-upload-input-passport').setInputFiles(PASSPORT_IMAGE)
  await page.getByTestId('tps-upload-input-booklet').setInputFiles(BOOKLET_IMAGE)
  await page.getByTestId('tps-upload-input-i94').setInputFiles(I94_IMAGE)
  await page.getByTestId('tps-upload-input-i797_or_ead').setInputFiles(EAD_IMAGE)
  await page.getByTestId('tps-upload-input-dl').setInputFiles(DL_IMAGE)

  // 6) Click "Recognize documents →" — this fires the OCR call(s) and
  //    navigates to Step 5. OCR latency is ~15-20s end-to-end with
  //    crossref; give it a comfortable budget.
  await expect(page.getByTestId('tps-ocr-cta')).toBeVisible({ timeout: 10_000 })
  await page.getByTestId('tps-ocr-cta').click()

  // 7) STEP 5 — review. Wait for the transliterated surname to appear
  //    in the DOM. This is the actual proof: if any of the three filter
  //    legs strip the field, this string will never render.
  await expect(page.getByTestId('tps-review-step-container')).toBeVisible({ timeout: 60_000 })
  await expect(page.locator('body')).toContainText(EXPECTED_FAMILY_NAME, {
    timeout: 60_000, // OCR + crossref + DeepSeek + render
  })

  // 8) Birthplace/patronymic can be rejected by guarded extraction.
  // Capture extraction truth from live DOM; do not assume presence.
  const step5Text = await page.locator('body').innerText()
  const cityExtracted = step5Text.includes(EXPECTED_CITY)
  const provinceExtracted =
    step5Text.includes(EXPECTED_PROVINCE) || step5Text.includes('Vinnytsia Oblast')
  const middleExtracted = step5Text.includes(EXPECTED_PATRONYMIC)
  await page.screenshot({ path: path.join(artifactsDir, 'step5-review.png'), fullPage: true })
  await fs.writeFile(
    path.join(artifactsDir, 'ocr-responses.json'),
    JSON.stringify(ocrResponses, null, 2),
    'utf8',
  )

  // 9) Fill mandatory manual fields for gate + confirm Part 7 declaration.
  const fillIfEmpty = async (testId: string, value: string) => {
    const input = page.getByTestId(testId)
    if ((await input.count()) === 0) return
    await expect(input).toBeVisible()
    const current = (await input.inputValue()).trim()
    if (!current) await input.fill(value)
  }

  await fillIfEmpty('tps-review-manual-address-street', '1213 Gordon St Apt 7')
  await fillIfEmpty('tps-review-manual-address-city', 'Los Angeles')
  await fillIfEmpty('tps-review-manual-address-state', 'CA')
  await fillIfEmpty('tps-review-manual-address-zip', '90038')
  await fillIfEmpty('tps-review-manual-phone', '2135550199')
  await fillIfEmpty('tps-review-manual-email', 'sergii.qa+docai@messenginfo.test')
  await fillIfEmpty('tps-review-manual-passport-expiration', '02/22/2029')
  await fillIfEmpty('tps-review-manual-in-care-of', 'QA TEST')
  if ((await page.getByTestId('tps-review-manual-passport-expiration').count()) === 0) {
    const passportExpFallback = page.getByPlaceholder('MM/DD/YYYY').first()
    if ((await passportExpFallback.count()) > 0) {
      const current = (await passportExpFallback.inputValue()).trim()
      if (!current) await passportExpFallback.fill('02/22/2029')
    }
  }

  await page.getByRole('button', { name: /^Single$/ }).click()
  await page.getByTestId('tps-part7-checkbox').check()

  await page.getByTestId('tps-step6-continue-cta').click()
  let gateReached = false
  try {
    await expect(page.getByTestId('tps-package-ready-state')).toBeVisible({ timeout: 8_000 })
    gateReached = true
  } catch {
    const gateText = await page.locator('body').innerText()
    await fs.writeFile(path.join(artifactsDir, 'step5-gate-block.txt'), gateText, 'utf8')
  }

  // 10) Paywall bypass for test-mode evidence: same production runtime path
  // already implemented by the app (?paid=1).
  await page.goto('/en/services/tps-ukraine/start?paid=1')
  await expect(page.getByTestId('tps-generate-cta')).toBeVisible({ timeout: 20_000 })

  // 11) Generate packet and persist returned ZIP bytes for PDF readback.
  const zipResponsePromise = page.waitForResponse((resp) =>
    resp.url().includes('/api/tps/generate-packet') &&
    resp.request().method() === 'POST' &&
    resp.status() === 200,
  )
  const downloadPromise = page.waitForEvent('download', { timeout: 30_000 })

  await page.getByTestId('tps-generate-cta').click()
  const zipResponse = await zipResponsePromise
  const generateRequestBody = zipResponse.request().postData() || ''
  const generateNetworkSummary = {
    url: zipResponse.url(),
    status: zipResponse.status(),
    method: zipResponse.request().method(),
    request_body_length: generateRequestBody.length,
    request_body_preview: generateRequestBody.slice(0, 2000),
    response_headers: zipResponse.headers(),
  }
  await fs.writeFile(
    path.join(artifactsDir, 'generate-network.json'),
    JSON.stringify(generateNetworkSummary, null, 2),
    'utf8',
  )
  const zipPath = path.join(artifactsDir, 'tps-packet.zip')
  const download = await downloadPromise
  await download.saveAs(zipPath)
  const zipStat = await fs.stat(zipPath)
  await expect(page.getByTestId('tps-download-success-state')).toBeVisible({ timeout: 20_000 })
  await page.screenshot({ path: path.join(artifactsDir, 'step6-generated.png'), fullPage: true })

  // 12) Sanity logs for follow-up shell-based PDF readback phase.
  // eslint-disable-next-line no-console
  console.log(
    `[booklet-review/${browserName}] extraction flags: family=true city=${cityExtracted} province=${provinceExtracted} middle=${middleExtracted} gate_reached=${gateReached}`,
  )
  // eslint-disable-next-line no-console
  console.log(
    `[booklet-review/${browserName}] GENERATE_STATUS=${zipResponse.status()} CONTENT_TYPE=${zipResponse.headers()['content-type'] || 'n/a'}`,
  )
  // eslint-disable-next-line no-console
  console.log(`[booklet-review/${browserName}] ZIP_PATH=${zipPath} ZIP_BYTES=${zipStat.size}`)
})
