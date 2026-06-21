/**
 * ead-golden-path.spec.ts — EAD (I-765) wizard browser E2E against a LIVE staging
 * deployment (E2E_BASE_URL). Synthetic data only (no PII). Mirrors the TPS golden
 * path, but EAD is FREE (no owner session / no paywall) and yields a single filled
 * I-765 PDF (not a ZIP).
 *
 *   1. nav smoke   — New → (a)(12) → skip upload → personal → docs → filing →
 *                    review screen reached.
 *   2. real packet — fill a complete form → download the filled I-765 PDF →
 *                    saved to ead-artifacts/i765-new.pdf, asserted non-trivial.
 *
 * All selectors are stable data-testid (no text selectors); no random sleeps.
 */
import { test, expect, type Page } from '@playwright/test'
import { statSync } from 'node:fs'
import path from 'node:path'

const UA =
  'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36'

test.use({ userAgent: UA }) // the app's anti-bot middleware 403s blank/curl UAs

/** Click a testid after asserting it is hydrated + visible (cold-deploy safe). */
async function click(page: Page, tid: string, timeout = 30_000) {
  const el = page.getByTestId(tid)
  await expect(el, `${tid} visible`).toBeVisible({ timeout })
  await el.click()
}

/** Advance via the shared Next CTA (enabled only when the step's canAdvance() is true). */
async function next(page: Page) {
  const cta = page.getByTestId('ead-next-cta')
  await expect(cta, 'next CTA enabled').toBeEnabled({ timeout: 30_000 })
  await cta.click()
}

/**
 * Drive the wizard to the review screen with a complete, valid form.
 * Steps: 0 Type → 1 Category → 2 Upload(skip) → 3 Personal → 4 Docs → 5 Filing → 6 Review.
 */
async function fillToReview(page: Page) {
  await page.goto('/en/services/ead-work-permit/start', { waitUntil: 'domcontentloaded' })

  await click(page, 'ead-type-new', 60_000) // first interaction — allow cold hydration
  await next(page)

  await click(page, 'ead-cat-a12') // TPS Ukraine → category (a)(12)
  await next(page)

  await next(page) // step 2 = optional upload; skip (canAdvance true when idle)

  // step 3 — personal info (lastName, firstName, dob are required by canAdvance)
  await page.getByTestId('ead-input-lastName').fill('Shevchenko')
  await page.getByTestId('ead-input-firstName').fill('Taras')
  await page.getByTestId('ead-input-dob').fill('1990-01-15')
  await page.getByTestId('ead-input-countryOfBirth').fill('Ukraine')
  await next(page)

  await next(page) // step 4 = documents checklist (no required fields)

  // step 5 — filing method + US address (both required by canAdvance)
  await click(page, 'ead-filing-mail')
  await page.getByTestId('ead-input-usAddress').fill('123 Main St, Los Angeles, CA 90038')
  await next(page)

  await expect(page.getByTestId('ead-review-container'), 'review screen').toBeVisible({ timeout: 30_000 })
}

test('EAD golden path navigates to the review screen', async ({ page }) => {
  await fillToReview(page)
})

test('EAD readiness gate blocks an incomplete form (negative)', async ({ page }) => {
  await page.goto('/en/services/ead-work-permit/start', { waitUntil: 'domcontentloaded' })
  await click(page, 'ead-type-new', 60_000)
  await next(page)
  await click(page, 'ead-cat-a12')
  await next(page)
  await next(page) // skip optional upload

  // Step 3 (personal): with required name/dob EMPTY, the Next CTA must be DISABLED.
  await expect(page.getByTestId('ead-next-cta'), 'next disabled while personal info incomplete').toBeDisabled()
  await page.getByTestId('ead-input-lastName').fill('Shevchenko')
  await page.getByTestId('ead-input-firstName').fill('Taras')
  await page.getByTestId('ead-input-dob').fill('1990-01-15')
  await expect(page.getByTestId('ead-next-cta'), 'next enabled once personal info complete').toBeEnabled()
  await next(page)

  await next(page) // docs (no required fields)

  // Step 5 (filing): with no filing method + no address, Next must be DISABLED.
  await expect(page.getByTestId('ead-next-cta'), 'next disabled while filing/address incomplete').toBeDisabled()
})

test('EAD: complete form → real filled I-765 PDF', async ({ page }) => {
  await fillToReview(page)
  await next(page) // review → download step

  const cta = page.getByTestId('ead-download-pdf-cta')
  await expect(cta, 'download I-765 PDF CTA').toBeVisible({ timeout: 30_000 })

  const dlPromise = page.waitForEvent('download', { timeout: 120_000 })
  await cta.click()
  const download = await dlPromise

  const savePath = path.join('ead-artifacts', 'i765-new.pdf')
  await download.saveAs(savePath)
  const size = statSync(savePath).size
  expect(size, 'I-765 PDF is non-trivial').toBeGreaterThan(1000)
  // the downloaded-state appears after the click resolves
  await expect(page.getByTestId('ead-pdf-downloaded-state')).toBeVisible({ timeout: 30_000 })
  console.log(JSON.stringify({ ead_scenario_new: { pdf_bytes: size } }))
})
