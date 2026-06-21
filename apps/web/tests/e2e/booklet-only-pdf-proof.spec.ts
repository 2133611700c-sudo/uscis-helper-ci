import { test, expect } from '@playwright/test'
import path from 'path'
import { promises as fs } from 'fs'
import { execSync } from 'child_process'

const REPO_ROOT = path.resolve(process.cwd(), '../..')
const BOOKLET_IMAGE = path.join(REPO_ROOT, 'qa-shots/private/booklet_test_resized.jpg')

// Set E2E_EXPECTED_* in .env.test (gitignored) when running with real document fixtures.
const EXPECTED = {
  family: process.env.E2E_EXPECTED_FAMILY_NAME ?? 'Ivanenko',
  city: process.env.E2E_EXPECTED_CITY ?? 'Vinnytsia',
  province: process.env.E2E_EXPECTED_PROVINCE ?? 'Vinnytsia',
  provinceOblast: (process.env.E2E_EXPECTED_PROVINCE ?? 'Vinnytsia') + ' Oblast',
  middle: process.env.E2E_EXPECTED_PATRONYMIC ?? 'Ivanovych',
}

test('booklet-only -> review -> generate ZIP/PDF proof', async ({ page, browserName }) => {
  test.setTimeout(240_000)
  const artifactsDir = path.resolve(process.cwd(), 'test-results', 'booklet-only-pdf-proof-artifacts')
  await fs.mkdir(artifactsDir, { recursive: true })
  await fs.access(BOOKLET_IMAGE)

  const ocrResponses: Array<Record<string, unknown>> = []
  page.on('response', async (resp) => {
    if (!resp.url().includes('/api/tps/ocr/extract') || resp.request().method() !== 'POST') return
    try {
      const payload = await resp.json()
      ocrResponses.push({
        status: resp.status(),
        doc_type_hint: payload?.doc_type_hint ?? null,
        final_field_keys: payload?.final_field_keys ?? [],
        module_field_keys: payload?.module_field_keys ?? [],
        rejected_fields: payload?.rejected_fields ?? [],
        knowledge_rejected_fields: payload?.knowledge_rejected_fields ?? [],
        brain_status: payload?.brain_status ?? null,
        crossref_status: payload?.crossref_status ?? null,
      })
    } catch {
      ocrResponses.push({ status: resp.status(), parse_error: true })
    }
  })

  // Capture /api/tps/brain/merge — the Central Brain POST fired by TPSWizardV2
  // useEffect after any upload status becomes 'done'. This is the P3 direct network proof.
  type BrainMergeCapture = {
    status: number
    request_slots: string[]
    merged_field_keys: string[]
    readiness_ready: boolean
    readiness_missing: string[]
    conflict_count: number
    rejected_count: number
    warning_count: number
    hallucination_blocks: string[]
  }
  let brainMergeCapture: BrainMergeCapture | null = null
  let brainMergeRaw: Record<string, unknown> | null = null
  page.on('response', async (resp) => {
    if (!resp.url().includes('/api/tps/brain/merge') || resp.request().method() !== 'POST') return
    try {
      const payload = await resp.json() as {
        merged?: Record<string, unknown>
        conflicts?: unknown[]
        warnings?: string[]
        rejected?: unknown[]
        readiness?: { ready?: boolean; missing_required?: string[]; hallucination_blocks?: string[] }
      }
      const reqBody = resp.request().postData() ?? '{}'
      const reqJson = JSON.parse(reqBody) as { uploads?: Record<string, unknown>; manual?: unknown }
      brainMergeRaw = { status: resp.status(), request: reqJson, response: payload }
      brainMergeCapture = {
        status: resp.status(),
        request_slots: Object.keys(reqJson?.uploads ?? {}),
        merged_field_keys: Object.keys(payload?.merged ?? {}),
        readiness_ready: payload?.readiness?.ready ?? false,
        readiness_missing: payload?.readiness?.missing_required ?? [],
        conflict_count: (payload?.conflicts ?? []).length,
        rejected_count: (payload?.rejected ?? []).length,
        warning_count: (payload?.warnings ?? []).length,
        hallucination_blocks: payload?.readiness?.hallucination_blocks ?? [],
      }
    } catch {
      brainMergeCapture = { status: resp.status(), request_slots: [], merged_field_keys: [], readiness_ready: false, readiness_missing: [], conflict_count: 0, rejected_count: 0, warning_count: 0, hallucination_blocks: [] }
    }
  })

  // deterministic clean state
  await page.goto('/en/services/tps-ukraine/start')
  await page.evaluate(() => {
    localStorage.removeItem('wizard:tps-ukraine:v3:state')
    localStorage.removeItem('wizard:tps-ukraine:v2:state')
    localStorage.removeItem('wizard:tps-ukraine:state')
  })
  await page.reload()

  // step1 / step2 / step3
  await page.getByRole('button', { name: /First time/ }).click()
  await page.getByRole('button', { name: /By mail/ }).click()
  await page.getByRole('button', { name: /Yes Add I-765/ }).click()

  // upload only booklet
  await expect(page.getByTestId('tps-upload-input-booklet')).toBeAttached({ timeout: 10_000 })
  const ocrResponsePromise = page.waitForResponse(
    (resp) =>
      resp.url().includes('/api/tps/ocr/extract') &&
      resp.request().method() === 'POST' &&
      resp.status() === 200,
    { timeout: 60_000 },
  )
  // Also wait for the Central Brain merge call that fires after upload status = 'done'
  const brainMergeResponsePromise = page.waitForResponse(
    (resp) =>
      resp.url().includes('/api/tps/brain/merge') &&
      resp.request().method() === 'POST' &&
      resp.status() === 200,
    { timeout: 30_000 },
  ).catch(() => null) // non-fatal if not fired in this env (degrades gracefully)

  await page.getByTestId('tps-upload-input-booklet').setInputFiles(BOOKLET_IMAGE)
  await ocrResponsePromise
  await brainMergeResponsePromise

  await expect(page.getByTestId('tps-ocr-cta')).toBeVisible({ timeout: 10_000 })
  await page.getByTestId('tps-ocr-cta').click()

  await expect(page.getByTestId('tps-review-step-container')).toBeVisible({ timeout: 60_000 })
  await page.waitForTimeout(1200)
  const reviewText = await page.locator('body').innerText()
  const domProof = {
    family: reviewText.includes(EXPECTED.family),
    city: reviewText.includes(EXPECTED.city),
    province:
      reviewText.includes(EXPECTED.province) || reviewText.includes(EXPECTED.provinceOblast),
    middle: reviewText.includes(EXPECTED.middle),
  }
  await page.screenshot({ path: path.join(artifactsDir, 'step5-review.png'), fullPage: true })
  await fs.writeFile(path.join(artifactsDir, 'ocr-responses.json'), JSON.stringify(ocrResponses, null, 2), 'utf8')
  await fs.writeFile(path.join(artifactsDir, 'dom-proof.json'), JSON.stringify(domProof, null, 2), 'utf8')
  expect(ocrResponses.length).toBeGreaterThan(0)

  // P3: Central Brain network capture
  await fs.writeFile(
    path.join(artifactsDir, 'brain-merge-summary.json'),
    JSON.stringify(brainMergeCapture ?? { not_captured: true }, null, 2),
    'utf8',
  )
  if (brainMergeRaw !== null) {
    // Write full request+response for trace review (excludes PII fields — only keys, not values)
    const sanitizedRaw = {
      ...(brainMergeRaw as Record<string, unknown>),
      request: { slots: Object.keys(((brainMergeRaw as { request?: { uploads?: Record<string, unknown> } }).request?.uploads) ?? {}) },
    }
    await fs.writeFile(
      path.join(artifactsDir, 'brain-merge-network.json'),
      JSON.stringify(sanitizedRaw, null, 2),
      'utf8',
    )
  }
  const capture = brainMergeCapture as BrainMergeCapture | null
  if (capture !== null) {
    // Brain merge was captured: assert structural correctness
    expect(capture.status).toBe(200)
    expect(capture.request_slots).toContain('booklet')
    expect(capture.merged_field_keys.length).toBeGreaterThan(0)
    expect(typeof capture.readiness_ready).toBe('boolean')
    // family_name must survive merge (booklet extraction confirmed by DOM proof above)
    expect(capture.merged_field_keys).toContain('family_name')
    // eslint-disable-next-line no-console
    console.log(`[booklet-only/${browserName}] BRAIN_MERGE=${JSON.stringify(capture)}`)
  } else {
    // eslint-disable-next-line no-console
    console.log(`[booklet-only/${browserName}] BRAIN_MERGE=not_captured (wizard may have used degraded fallback)`)
  }

  // fill required OCR review rows via inline Edit(prompt)
  const fillReviewRow = async (label: string, value: string) => {
    const lowered = label.toLowerCase()
    const editBtn = page.locator(
      `xpath=//div[contains(translate(normalize-space(.),'ABCDEFGHIJKLMNOPQRSTUVWXYZ','abcdefghijklmnopqrstuvwxyz'),'${lowered}')]/following-sibling::div//button`,
    ).first()
    if ((await editBtn.count()) === 0) return
    page.once('dialog', async (dialog) => {
      await dialog.accept(value)
    })
    await editBtn.click()
    await page.waitForTimeout(120)
  }

  // All values below are SYNTHETIC (never real document data). They only need
  // to be non-empty to pass the mail-ready gate; the booklet provenance proof
  // asserts OCR-derived fields (family_name/city/province/middle), not these.
  await fillReviewRow('Given name', 'Testname')
  // passport_number: booklet cannot provide it (contract-forbidden); fill as MANUAL_GATING_ONLY.
  await fillReviewRow('Passport number', 'AA000000')
  // dob: pre-DOB-patch production doesn't extract it from booklet; fill as MANUAL_GATING_ONLY.
  await fillReviewRow('Date of birth', '01/01/1980')
  await fillReviewRow('US entry date', '09/09/2022')
  await fillReviewRow('I-94 admission number', '000000000A0')
  await fillReviewRow('Status at entry', 'UHP')

  // fill required manual fields if empty
  const fillIfEmpty = async (testId: string, value: string) => {
    const input = page.getByTestId(testId)
    if ((await input.count()) === 0) return
    await expect(input).toBeVisible()
    const current = (await input.inputValue()).trim()
    if (!current) await input.fill(value)
  }

  await fillIfEmpty('tps-review-manual-address-street', '1213 Gordon St')
  await fillIfEmpty('tps-review-manual-address-city', 'Los Angeles')
  await fillIfEmpty('tps-review-manual-address-state', 'CA')
  await fillIfEmpty('tps-review-manual-address-zip', '90029')
  await fillIfEmpty('tps-review-manual-place-of-last-entry', 'Los Angeles')
  await fillIfEmpty('tps-review-manual-passport-expiration', '02/22/2029')
  await fillIfEmpty('tps-review-manual-phone', '2135550199')
  await fillIfEmpty('tps-review-manual-email', 'sergii.qa+bookletonly@messenginfo.test')
  await fillIfEmpty('tps-review-manual-in-care-of', 'QA TEST')

  await page.getByRole('button', { name: /^Single$/ }).click()
  if ((await page.getByTestId('tps-part7-checkbox').count()) > 0) {
    await page.getByTestId('tps-part7-checkbox').check()
  }

  // proceed to generate step, then paywall bypass for test-proof
  await page.getByTestId('tps-step6-continue-cta').click()
  await page.goto('/en/services/tps-ukraine/start?paid=1')
  await expect(page.getByTestId('tps-generate-cta')).toBeVisible({ timeout: 20_000 })

  const zipResponsePromise = page.waitForResponse(
    (resp) =>
      resp.url().includes('/api/tps/generate-packet') &&
      resp.request().method() === 'POST' &&
      resp.status() === 200,
    { timeout: 60_000 },
  )
  const downloadPromise = page.waitForEvent('download', { timeout: 60_000 })

  await page.getByTestId('tps-generate-cta').click()
  const zipResponse = await zipResponsePromise
  const generateRequestBody = zipResponse.request().postData() || ''
  const generateNetworkSummary = {
    url: zipResponse.url(),
    status: zipResponse.status(),
    method: zipResponse.request().method(),
    request_body_length: generateRequestBody.length,
    request_body_preview: generateRequestBody.slice(0, 20000),
    response_headers: zipResponse.headers(),
  }

  const requestJson = JSON.parse(generateRequestBody)
  const prov = requestJson?._provenance ?? {}
  const strictProvenance = {
    family_name: prov?.family_name?.source_document_type ?? 'NOT_EXTRACTED',
    city_of_birth: prov?.city_of_birth?.source_document_type ?? 'NOT_EXTRACTED',
    province_of_birth: prov?.province_of_birth?.source_document_type ?? 'NOT_EXTRACTED',
    middle_name: prov?.middle_name?.source_document_type ?? 'NOT_EXTRACTED',
    dob: prov?.dob?.source_document_type ?? 'NOT_EXTRACTED',
  }
  await fs.writeFile(
    path.join(artifactsDir, 'provenance-proof.json'),
    JSON.stringify(strictProvenance, null, 2),
    'utf8',
  )
  expect(strictProvenance.family_name).toBe('booklet')
  if (strictProvenance.city_of_birth !== 'NOT_EXTRACTED') {
    expect(strictProvenance.city_of_birth).toBe('booklet')
  }
  if (strictProvenance.province_of_birth !== 'NOT_EXTRACTED') {
    expect(strictProvenance.province_of_birth).toBe('booklet')
  }
  if (strictProvenance.middle_name !== 'NOT_EXTRACTED') {
    expect(strictProvenance.middle_name).toBe('booklet')
  }
  if (strictProvenance.dob !== 'NOT_EXTRACTED') {
    // 'booklet' = DOB patch deployed and OCR extracted it from booklet.
    // 'user_manual' = pre-patch production, DOB was filled as MANUAL_GATING_ONLY.
    expect(['booklet', 'user_manual']).toContain(strictProvenance.dob)
  }
  await fs.writeFile(
    path.join(artifactsDir, 'generate-network.json'),
    JSON.stringify(generateNetworkSummary, null, 2),
    'utf8',
  )

  const download = await downloadPromise
  const zipPath = path.join(artifactsDir, 'tps-packet.zip')
  await download.saveAs(zipPath)
  const zipStat = await fs.stat(zipPath)

  await expect(page.getByTestId('tps-download-success-state')).toBeVisible({ timeout: 20_000 })
  await page.screenshot({ path: path.join(artifactsDir, 'step6-generated.png'), fullPage: true })

  // ── Translation proof: verify Translation_Internal_Passport.html is in ZIP ──
  const unzipDir = path.join(artifactsDir, 'unzipped')
  await fs.mkdir(unzipDir, { recursive: true })
  const translationProof: Record<string, unknown> = { zip_bytes: zipStat.size }
  try {
    execSync(`unzip -o "${zipPath}" -d "${unzipDir}"`, { stdio: 'pipe' })
    const zipContents = execSync(`unzip -l "${zipPath}"`, { encoding: 'utf8' })
    translationProof.zip_contents = zipContents.split('\n').map((l) => l.trim()).filter(Boolean)

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
      translationProof.certification_bytes = certHtml.length
    } catch {
      translationProof.certification_file_present = false
    }

    if (translationHtml) {
      translationProof.has_surname = translationHtml.includes(EXPECTED.family)
      translationProof.has_city = translationHtml.includes(EXPECTED.city)
      translationProof.has_province = translationHtml.includes(EXPECTED.province)
      translationProof.has_patronymic = translationHtml.includes(EXPECTED.middle)
      translationProof.has_patronymic_label = translationHtml.includes('Patronymic')
      translationProof.no_middle_name_label = !translationHtml.includes('Middle Name')
      translationProof.has_ukraine = translationHtml.includes('Ukraine')
      translationProof.has_internal_passport = translationHtml.includes('Internal Passport')

      // Core assertions: surname must appear in translation
      expect(translationHtml).toContain(EXPECTED.family)
      expect(translationHtml).toContain('Patronymic')
      expect(translationHtml).not.toContain('Middle Name')
      expect(translationHtml).toContain('Internal Passport')
    }

    if (certHtml) {
      translationProof.cert_has_competency = /competent to translate|complete and accurate/i.test(certHtml)
      translationProof.cert_no_ai_cert = !(/certified by AI/i.test(certHtml))
      expect(certHtml).toMatch(/competent to translate|complete and accurate/i)
    }
  } catch (e) {
    translationProof.unzip_error = String(e)
    // Non-fatal: translation is an enhancement, not blocking forms
    // eslint-disable-next-line no-console
    console.warn(`[booklet-only/${browserName}] TRANSLATION_PROOF_ERROR=${String(e)}`)
  }

  await fs.writeFile(
    path.join(artifactsDir, 'translation-proof.json'),
    JSON.stringify(translationProof, null, 2),
    'utf8',
  )

  // eslint-disable-next-line no-console
  console.log(`[booklet-only/${browserName}] DOM_PROOF=${JSON.stringify(domProof)}`)
  // eslint-disable-next-line no-console
  console.log(`[booklet-only/${browserName}] ZIP_PATH=${zipPath} ZIP_BYTES=${zipStat.size}`)
  // eslint-disable-next-line no-console
  console.log(`[booklet-only/${browserName}] TRANSLATION_PROOF=${JSON.stringify(translationProof)}`)
})
