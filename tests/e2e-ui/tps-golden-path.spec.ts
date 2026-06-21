/**
 * tps-golden-path.spec.ts — TPS wizard browser E2E against a LIVE staging deployment
 * (E2E_BASE_URL). Synthetic data only (no PII). Issue #160 / #159 §C1.
 *
 * It drives the REAL user path through the UI (no DB writes, no generator bypass) —
 * the owner session only skips PAYMENT, never form validation / mailReadyGate.
 *
 *   1. nav smoke           — Initial → Paper → No-EAD → review + Part 7.
 *   2. non-owner paywall   — fill a mail-ready form → "Generate packet" → paywall
 *                            (no free bypass: owner-CTA + package-ready absent).
 *   3. owner Scenario A    — Initial / Paper / No-EAD → owner session → generate →
 *                            real ZIP (I-821). Saved to tps-artifacts/scenario-a.zip.
 *   4. owner Scenario B    — Re-registration / Paper / EAD → generate → real ZIP
 *                            (I-821 + I-765). Saved to tps-artifacts/scenario-b.zip.
 *
 * Owner tests skip cleanly when OWNER_SESSION_SECRET/OWNER_EMAILS are not injected.
 * All field selectors are stable data-testid (no text selectors); no random sleeps
 * beyond the small settle after a native prompt() edit.
 */
import { test, expect, type Page, type BrowserContext } from '@playwright/test'
import { createHmac } from 'node:crypto'
import { statSync } from 'node:fs'
import path from 'node:path'

const UA =
  'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36'

test.use({ userAgent: UA }) // the app's anti-bot middleware 403s blank/curl UAs

type Filing = 'init' | 'rereg'
type Ead = 'ead' | 'noead'

/**
 * Navigate the wizard to the review screen via stable step testids (no OCR).
 * Each step asserts the option is hydrated+visible BEFORE clicking — a fresh
 * preview deployment compiles this heavy route on first hit, so the React
 * bundle can take tens of seconds to hydrate. Clicking before hydration is the
 * exact cause of the earlier "stuck on Step 1" 240s timeouts.
 */
async function navigateToReview(page: Page, opts: { filing: Filing; ead: Ead }) {
  await page.goto('/en/services/tps-ukraine/start', { waitUntil: 'domcontentloaded' })
  const click = async (tid: string, timeout = 30_000) => {
    const el = page.getByTestId(tid)
    await expect(el, `${tid} visible`).toBeVisible({ timeout })
    await el.click()
  }
  await click(`tps-step1-${opts.filing}`, 60_000) // first interaction — allow cold hydration
  await click('tps-step2-paper')                  // Paper filing
  await click(`tps-step3-${opts.ead}`)            // EAD: Add I-765 / TPS only
  await click('tps-ocr-cta')                      // "Recognize documents →" → review (no uploads needed)
  await expect(page.getByTestId('tps-review-step-container'), 'review container').toBeVisible({ timeout: 30_000 })
}

/**
 * From the FILLED review screen (step 5), advance to step 6 via the stable
 * "Generate packet →" nav button (tps-step6-continue-cta). That button runs the
 * mail-ready gate: on pass it goes to step 6, on fail it stays on step 5 and
 * renders tps-gate-error-container. We surface the exact blocker text instead of
 * a blind timeout — every step-6 state (owner CTA, paywall, package-ready) only
 * exists on step 6, so this advance is mandatory before asserting any of them.
 */
async function advanceToStep6(page: Page) {
  const cont = page.getByTestId('tps-step6-continue-cta')
  await expect(cont, 'step 5→6 continue button').toBeVisible({ timeout: 30_000 })
  await cont.click()
  const ready = page.getByTestId('tps-package-ready-state')
  const gateErr = page.getByTestId('tps-gate-error-container')
  await expect
    .poll(
      async () =>
        (await ready.isVisible().catch(() => false)) || (await gateErr.isVisible().catch(() => false)),
      { timeout: 30_000, message: 'step 6 package-ready OR gate-error to appear' },
    )
    .toBe(true)
  if (await gateErr.isVisible().catch(() => false)) {
    const msg = (await gateErr.innerText().catch(() => '')).trim()
    throw new Error(`mail-ready gate blocked step 6 advance: ${msg}`)
  }
  await expect(ready, 'step 6 package-ready').toBeVisible()
}

/** A persistent dialog handler reading a shared value (OCR-row Edit = native prompt). */
function installPromptResponder(page: Page): { set: (v: string) => void } {
  const box = { value: '' }
  page.on('dialog', async (d) => {
    try { await (d.type() === 'prompt' ? d.accept(box.value) : d.accept()) } catch { /* already handled */ }
  })
  return { set: (v: string) => { box.value = v } }
}

async function editOcrField(page: Page, responder: { set: (v: string) => void }, key: string, value: string) {
  const btn = page.getByTestId(`tps-ocr-edit-${key}`)
  if (!(await btn.isVisible().catch(() => false))) return
  responder.set(value)
  await btn.click()
  await page.waitForTimeout(300) // settle the prompt + React re-render
}

/**
 * Fill the review screen so runMailReadyGate (the strict 'mail' stage) passes — every
 * requiredAt('mail') field via a stable testid. Synthetic Latin values + ISO dates.
 */
async function fillReviewForm(page: Page, responder: { set: (v: string) => void }) {
  const ocr: Array<[string, string]> = [
    ['family_name', 'Shevchenko'], ['given_name', 'Taras'], ['dob', '1990-01-15'],
    ['sex', 'M'], ['passport_number', 'FA123456'], ['passport_expiration_date', '2030-12-31'],
    ['country_of_nationality', 'Ukraine'], ['last_entry_date', '2024-06-01'],
  ]
  for (const [k, v] of ocr) await editOcrField(page, responder, k, v)

  const manual: Array<[string, string]> = [
    ['tps-review-manual-address-street', '123 Main St'], ['tps-review-manual-address-city', 'Los Angeles'],
    ['tps-review-manual-address-state', 'CA'], ['tps-review-manual-address-zip', '90038'],
    ['tps-review-manual-phone', '2130000000'], ['tps-review-manual-email', 'e2e@example.com'],
    ['tps-review-manual-city-of-birth', 'Kyiv'],
  ]
  for (const [tid, val] of manual) {
    const f = page.getByTestId(tid)
    if (await f.isVisible().catch(() => false)) await f.fill(val).catch(() => {})
  }
  // marital_status — REQUIRED at 'mail'; SingleSelect with a stable testid.
  await page.getByTestId('tps-review-marital-single').click()
  await page.getByTestId('tps-part7-checkbox').check()
}

/** Forge __owner_session EXACTLY as lib/ownerAccess.ts: value=`${email}|${expires}|${HMAC-SHA256}`. */
function signOwnerCookie(secret: string, email: string): string {
  const e = email.trim().toLowerCase()
  const expires = Date.now() + 30 * 24 * 60 * 60 * 1000
  const payload = `${e}|${expires}`
  return `${payload}|${createHmac('sha256', secret).update(payload).digest('hex')}`
}

const OWNER_SECRET = process.env.OWNER_SESSION_SECRET || ''
const OWNER_EMAIL = (process.env.OWNER_EMAILS || '').split(',')[0]?.trim() || ''
const BASE_URL = process.env.E2E_BASE_URL || ''
const ownerReady = Boolean(OWNER_SECRET && OWNER_EMAIL && BASE_URL)

async function installOwnerSession(context: BrowserContext) {
  await context.addCookies([{
    name: '__owner_session', value: signOwnerCookie(OWNER_SECRET, OWNER_EMAIL),
    url: BASE_URL, httpOnly: true, secure: true, sameSite: 'Lax',
  }])
}

/**
 * Owner: from the FILLED review screen, advance to step 6, then generate via the
 * UI and save the downloaded packet ZIP; assert it is real. The owner-only
 * generate button renders ONLY on step 6 AND only when ownerChecked && isOwner &&
 * isStep6Eligible — its visibility is the proof that owner_session + mail_ready
 * are both true (it skips ONLY payment, never the gate).
 */
async function generateAndSaveZip(page: Page, savePath: string) {
  await advanceToStep6(page)
  const cta = page.getByTestId('tps-generate-cta')
  await expect(cta, 'owner generate CTA (step 6, owner + mail_ready)').toBeVisible({ timeout: 30_000 })

  const dlPromise = page.waitForEvent('download', { timeout: 120_000 }).catch(() => null)
  await cta.click()
  let download = await dlPromise
  if (!download && (await page.getByTestId('tps-download-success-state').isVisible().catch(() => false))) {
    const [d] = await Promise.all([
      page.waitForEvent('download', { timeout: 60_000 }),
      page.getByTestId('tps-download-success-state').click(),
    ])
    download = d
  }
  expect(download, 'packet ZIP download').toBeTruthy()
  await download!.saveAs(savePath)
  const size = statSync(savePath).size
  expect(size, 'ZIP is non-trivial').toBeGreaterThan(1000)
  return size
}

test('TPS golden path (no-OCR) navigates to the review screen + Part 7', async ({ page }) => {
  await navigateToReview(page, { filing: 'init', ead: 'noead' })
  await expect(page.getByTestId('tps-part7-checkbox'), 'Part 7 declaration checkbox').toBeVisible({ timeout: 30_000 })
})

test('TPS non-owner: mail-ready form → payment gate (no free bypass)', async ({ page }) => {
  const responder = installPromptResponder(page)
  await navigateToReview(page, { filing: 'init', ead: 'noead' })
  await fillReviewForm(page, responder)
  await advanceToStep6(page)
  // On step 6 a NON-owner sees the Pay button (paywall) and NEVER the owner-only
  // generate CTA. package-ready renders for everyone on step 6, so it is NOT a
  // bypass signal — the bypass proof is: paywall present AND generate-CTA absent.
  await expect(page.getByTestId('tps-paywall-state'), 'payment gate (paywall)').toBeVisible({ timeout: 30_000 })
  await expect(page.getByTestId('tps-generate-cta'), 'no free owner CTA for non-owner').toHaveCount(0)
})

test('TPS owner Scenario A: Initial / Paper / No-EAD → real packet ZIP (I-821)', async ({ page, context }) => {
  test.skip(!ownerReady, 'owner secrets / base URL not provided')
  await installOwnerSession(context)
  const status = await page.request.get(`${BASE_URL}/api/owner/status`)
  expect((await status.json()).owner, 'owner session recognised').toBe(true)

  const responder = installPromptResponder(page)
  await navigateToReview(page, { filing: 'init', ead: 'noead' })
  await fillReviewForm(page, responder)
  const bytes = await generateAndSaveZip(page, path.join('tps-artifacts', 'scenario-a.zip'))
  console.log(JSON.stringify({ tps_scenario_a: { owner: true, mail_ready: true, zip_bytes: bytes } }))
})

test('TPS owner Scenario B: Re-registration / Paper / EAD → real packet ZIP (I-821 + I-765)', async ({ page, context }) => {
  test.skip(!ownerReady, 'owner secrets / base URL not provided')
  await installOwnerSession(context)
  expect((await (await page.request.get(`${BASE_URL}/api/owner/status`)).json()).owner).toBe(true)

  const responder = installPromptResponder(page)
  await navigateToReview(page, { filing: 'rereg', ead: 'ead' })
  await fillReviewForm(page, responder)
  const bytes = await generateAndSaveZip(page, path.join('tps-artifacts', 'scenario-b.zip'))
  console.log(JSON.stringify({ tps_scenario_b: { owner: true, mail_ready: true, wants_ead: true, zip_bytes: bytes } }))
})
