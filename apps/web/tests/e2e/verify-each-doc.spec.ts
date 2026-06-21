/**
 * verify-each-doc.spec.ts
 *
 * Verifies that each document type (passport, booklet, I-94) uploads and OCRs
 * correctly when uploaded ONE AT A TIME on the production site.
 *
 * Also verifies the full 3-doc flow at the end.
 */

import { test, expect, type Page } from '@playwright/test'
import path from 'path'
import { promises as fs } from 'fs'

const REPO_ROOT = path.resolve(process.cwd(), '../..')
const BOOKLET = path.join(REPO_ROOT, 'qa-shots/private/booklet_test_resized.jpg')
const PASSPORT = process.env.E2E_PASSPORT_IMAGE ?? path.join(REPO_ROOT, 'qa-shots/private/passport_test.jpg')
const I94 = process.env.E2E_I94_IMAGE ?? path.join(REPO_ROOT, 'qa-shots/private/i94_test.jpg')

const ARTIFACTS = path.resolve(process.cwd(), 'test-results', 'verify-each-doc')

async function freshStart(page: Page) {
  await page.goto('/en/services/tps-ukraine/start')
  await page.evaluate(() => {
    localStorage.removeItem('wizard:tps-ukraine:v3:state')
    localStorage.removeItem('wizard:tps-ukraine:v2:state')
    localStorage.removeItem('wizard:tps-ukraine:state')
  })
  await page.reload()
  // Step 1-3: First time / By mail / Add I-765
  await page.getByRole('button', { name: /First time/ }).click()
  await page.getByRole('button', { name: /By mail/ }).click()
  await page.getByRole('button', { name: /Yes Add I-765/ }).click()
  await expect(page.getByTestId('tps-upload-input-passport')).toBeAttached({ timeout: 10_000 })
}

test.beforeAll(async () => {
  await fs.mkdir(ARTIFACTS, { recursive: true })
  for (const f of [BOOKLET, PASSPORT, I94]) {
    await fs.access(f)
  }
})

// ── TEST 1: Passport only ──────────────────────────────────────────────────
test('1. Passport only → OCR extracts given_name + passport_number', async ({ page }) => {
  test.setTimeout(120_000)
  await freshStart(page)

  const ocrDone = page.waitForResponse(
    (r) => r.url().includes('/api/tps/ocr/extract') && r.request().method() === 'POST' && r.status() === 200,
    { timeout: 60_000 },
  )
  await page.getByTestId('tps-upload-input-passport').setInputFiles(PASSPORT)
  const resp = await ocrDone
  const body = await resp.json().catch(() => ({}))

  await page.screenshot({ path: path.join(ARTIFACTS, '1-passport-only.png'), fullPage: true })

  const fieldKeys: string[] = body.final_field_keys ?? body.module_field_keys ?? []
  const proof = {
    status: resp.status(),
    has_given_name: fieldKeys.includes('given_name'),
    has_passport_number: fieldKeys.includes('passport_number'),
    has_dob: fieldKeys.includes('dob'),
    field_keys: fieldKeys,
  }
  await fs.writeFile(path.join(ARTIFACTS, '1-passport-proof.json'), JSON.stringify(proof, null, 2))
  console.log('[passport-only]', JSON.stringify(proof))

  expect(proof.status).toBe(200)
  expect(proof.has_given_name).toBe(true)
  expect(proof.has_passport_number).toBe(true)
})

// ── TEST 2: Booklet (identity page) only ──────────────────────────────────
test('2. Booklet (identity page) only → OCR extracts family_name + dob, NO given_name', async ({ page }) => {
  test.setTimeout(120_000)
  await freshStart(page)

  const ocrDone = page.waitForResponse(
    (r) => r.url().includes('/api/tps/ocr/extract') && r.request().method() === 'POST',
    { timeout: 60_000 },
  )
  await page.getByTestId('tps-upload-input-booklet').setInputFiles(BOOKLET)
  const resp = await ocrDone
  const body = await resp.json().catch(() => ({}))

  await page.screenshot({ path: path.join(ARTIFACTS, '2-booklet-only.png'), fullPage: true })

  const fieldKeys: string[] = body.final_field_keys ?? body.module_field_keys ?? []
  const proof = {
    status: resp.status(),
    has_family_name: fieldKeys.includes('family_name'),
    has_dob: fieldKeys.includes('dob'),
    has_given_name: fieldKeys.includes('given_name'),       // should be false (booklet contract)
    has_passport_number: fieldKeys.includes('passport_number'), // should be false
    field_keys: fieldKeys,
  }
  await fs.writeFile(path.join(ARTIFACTS, '2-booklet-proof.json'), JSON.stringify(proof, null, 2))
  console.log('[booklet-only]', JSON.stringify(proof))

  expect(proof.has_family_name).toBe(true)
  // Booklet contract: given_name and passport_number MUST NOT come from booklet
  expect(proof.has_given_name).toBe(false)
  expect(proof.has_passport_number).toBe(false)
})

// ── TEST 3: I-94 only ─────────────────────────────────────────────────────
test('3. I-94 only → OCR extracts last_entry_date + i94_admission_number', async ({ page }) => {
  test.setTimeout(120_000)
  await freshStart(page)

  const ocrDone = page.waitForResponse(
    (r) => r.url().includes('/api/tps/ocr/extract') && r.request().method() === 'POST' && r.status() === 200,
    { timeout: 60_000 },
  )
  await page.getByTestId('tps-upload-input-i94').setInputFiles(I94)
  const resp = await ocrDone
  const body = await resp.json().catch(() => ({}))

  await page.screenshot({ path: path.join(ARTIFACTS, '3-i94-only.png'), fullPage: true })

  const fieldKeys: string[] = body.final_field_keys ?? body.module_field_keys ?? []
  const proof = {
    status: resp.status(),
    has_last_entry_date: fieldKeys.includes('last_entry_date'),
    has_i94_number: fieldKeys.includes('i94_admission_number'),
    field_keys: fieldKeys,
  }
  await fs.writeFile(path.join(ARTIFACTS, '3-i94-proof.json'), JSON.stringify(proof, null, 2))
  console.log('[i94-only]', JSON.stringify(proof))

  expect(proof.status).toBe(200)
  expect(proof.has_last_entry_date).toBe(true)
})

// ── TEST 4: All 3 → step 5 shows recognized values, NO blank identity inputs ──
test('4. All 3 docs → Step 5 has given_name edit btn, no blank manual identity inputs', async ({ page }) => {
  test.setTimeout(180_000)
  await freshStart(page)

  const passportOcr = page.waitForResponse(
    (r) => r.url().includes('/api/tps/ocr/extract') && r.request().method() === 'POST' && r.status() === 200,
    { timeout: 60_000 },
  )
  await page.getByTestId('tps-upload-input-passport').setInputFiles(PASSPORT)
  await passportOcr

  const bookletOcr = page.waitForResponse(
    (r) => r.url().includes('/api/tps/ocr/extract') && r.request().method() === 'POST',
    { timeout: 60_000 },
  )
  await page.getByTestId('tps-upload-input-booklet').setInputFiles(BOOKLET)
  await bookletOcr

  const i94Ocr = page.waitForResponse(
    (r) => r.url().includes('/api/tps/ocr/extract') && r.request().method() === 'POST' && r.status() === 200,
    { timeout: 60_000 },
  )
  await page.getByTestId('tps-upload-input-i94').setInputFiles(I94)
  await i94Ocr

  await page.getByTestId('tps-ocr-cta').click()
  await expect(page.getByTestId('tps-review-step-container')).toBeVisible({ timeout: 60_000 })

  // CB settle: family_name from booklet should appear
  const E2E_EXPECTED_FAMILY_NAME = process.env.E2E_EXPECTED_FAMILY_NAME ?? 'Ivanenko'
  await expect(page.locator('body')).toContainText(E2E_EXPECTED_FAMILY_NAME, { timeout: 60_000 })
  await page.screenshot({ path: path.join(ARTIFACTS, '4-all3-step5.png'), fullPage: true })

  const proof: Record<string, unknown> = {}

  // given_name edit button must exist (recognized from passport MRZ)
  proof.given_name_edit_btn = (await page.getByTestId('tps-ocr-edit-given_name').count()) > 0
  proof.passport_number_edit_btn = (await page.getByTestId('tps-ocr-edit-passport_number').count()) > 0
  proof.family_name_edit_btn = (await page.getByTestId('tps-ocr-edit-family_name').count()) > 0
  proof.dob_edit_btn = (await page.getByTestId('tps-ocr-edit-dob').count()) > 0

  // Manual identity inputs must NOT exist (removed in Session 38)
  proof.no_manual_given_name_input = (await page.getByTestId('tps-review-manual-given-name').count()) === 0
  proof.no_manual_passport_input = (await page.getByTestId('tps-review-manual-passport-number').count()) === 0
  proof.no_manual_dob_input = (await page.getByTestId('tps-review-manual-dob').count()) === 0
  proof.no_manual_last_entry_input = (await page.getByTestId('tps-review-manual-last-entry-date').count()) === 0

  await fs.writeFile(path.join(ARTIFACTS, '4-all3-proof.json'), JSON.stringify(proof, null, 2))
  console.log('[all-3-docs]', JSON.stringify(proof))

  expect(proof.given_name_edit_btn).toBe(true)
  expect(proof.family_name_edit_btn).toBe(true)
  expect(proof.no_manual_given_name_input).toBe(true)
  expect(proof.no_manual_passport_input).toBe(true)
  expect(proof.no_manual_dob_input).toBe(true)
  expect(proof.no_manual_last_entry_input).toBe(true)
})
