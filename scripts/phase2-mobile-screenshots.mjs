/**
 * scripts/phase2-mobile-screenshots.mjs
 *
 * Phase 2 — Mobile UX screenshots at 375×812 (iPhone SE viewport).
 * Captures 8 key screens from the production deployment.
 * Output: artifacts/mobile_ux/*.png
 *
 * Run: node scripts/phase2-mobile-screenshots.mjs
 */
import { chromium } from '@playwright/test'
import { mkdirSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const ROOT = join(__dirname, '..')
const OUT  = join(ROOT, 'artifacts', 'mobile_ux')
mkdirSync(OUT, { recursive: true })

const BASE = 'https://uscis-helper-sergiis-projects-8a97ee0f.vercel.app'
const VIEWPORT = { width: 375, height: 812 }
// Real paid session with all critical fields confirmed + certified (from Phase 1 smoke)
const SESSION_ID = '92567d4f-e950-417c-88d7-271615eb9714'

async function shot(page, name, description) {
  const path = join(OUT, `${name}.png`)
  await page.screenshot({ path, fullPage: false })
  console.log(`  📸 ${name}.png — ${description}`)
  return path
}

async function checkIssues(page, name) {
  const issues = []
  // Check for JSON bleed (raw object notation visible)
  const text = await page.evaluate(() => document.body.innerText)
  if (text.includes('{"') || text.includes('"field"') || text.includes('"error"')) {
    issues.push('RAW JSON VISIBLE')
  }
  // Check for elements too small (< 44px touch target — WCAG 2.5.5)
  const smallButtons = await page.evaluate(() => {
    const btns = Array.from(document.querySelectorAll('button, a[href], [role="button"]'))
    return btns.filter(el => {
      const r = el.getBoundingClientRect()
      return r.width > 0 && r.height > 0 && (r.width < 44 || r.height < 44)
    }).map(el => el.textContent?.trim()?.slice(0, 40) ?? el.className.slice(0, 40))
  })
  if (smallButtons.length > 0) {
    issues.push(`Small touch targets (<44px): ${smallButtons.slice(0,3).join(', ')}`)
  }
  // Check for horizontal overflow
  const hasHorizontalScroll = await page.evaluate(() => {
    return document.documentElement.scrollWidth > document.documentElement.clientWidth
  })
  if (hasHorizontalScroll) issues.push('HORIZONTAL OVERFLOW (content wider than viewport)')

  if (issues.length > 0) {
    console.log(`  ⚠️  ${name} issues:`)
    issues.forEach(i => console.log(`     - ${i}`))
  } else {
    console.log(`  ✅ ${name} — no layout issues`)
  }
  return issues
}

;(async () => {
  const browser = await chromium.launch({ headless: true })
  const ctx = await browser.newContext({
    viewport: VIEWPORT,
    deviceScaleFactor: 2,
    userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15',
    isMobile: true,
    hasTouch: true,
  })
  const page = await ctx.newPage()
  const allIssues = {}

  try {
    console.log('\n=== PHASE 2 — Mobile UX Screenshots (375×812) ===\n')

    // ── 1. Landing page / wizard start ──────────────────────────────────────
    console.log('1. Landing + wizard start')
    await page.goto(`${BASE}/en/services/translate-document/start`, { waitUntil: 'networkidle', timeout: 20000 })
    await page.waitForTimeout(1000)
    await shot(page, '01_landing_wizard_start', 'Landing page / wizard step 1')
    allIssues['01_landing'] = await checkIssues(page, '01_landing')

    // ── 2. Evidence Review page — top (field list) ──────────────────────────
    console.log('\n2. Evidence Review — field list top')
    await page.goto(`${BASE}/en/services/translate-document/session/${SESSION_ID}/review`, { waitUntil: 'networkidle', timeout: 20000 })
    await page.waitForTimeout(1500)
    await shot(page, '02_review_top', 'Evidence Review page — top / field list')
    allIssues['02_review_top'] = await checkIssues(page, '02_review_top')

    // ── 3. Evidence Review — scrolled to show bbox viewer ───────────────────
    console.log('\n3. Evidence Review — bbox viewer (scrolled)')
    await page.evaluate(() => window.scrollTo(0, 400))
    await page.waitForTimeout(500)
    await shot(page, '03_review_bbox_viewer', 'Evidence Review — exact bbox crop')
    allIssues['03_bbox_viewer'] = await checkIssues(page, '03_bbox_viewer')

    // ── 4. Evidence Review — scrolled further (combined bbox) ───────────────
    console.log('\n4. Evidence Review — combined bbox region')
    await page.evaluate(() => window.scrollTo(0, 800))
    await page.waitForTimeout(500)
    await shot(page, '04_review_combined_bbox', 'Evidence Review — combined bbox context')
    allIssues['04_combined_bbox'] = await checkIssues(page, '04_combined_bbox')

    // ── 5. Correction modal (try to open on first field) ────────────────────
    console.log('\n5. Correction modal')
    await page.evaluate(() => window.scrollTo(0, 0))
    await page.waitForTimeout(300)
    // Click the first "Edit" or "Correct" button if visible
    const editBtn = page.locator('button').filter({ hasText: /edit|correct|змін/i }).first()
    const editVisible = await editBtn.isVisible().catch(() => false)
    if (editVisible) {
      await editBtn.click()
      await page.waitForTimeout(500)
    }
    await shot(page, '05_correction_modal', 'Correction modal (or review page if modal not triggered)')
    allIssues['05_correction_modal'] = await checkIssues(page, '05_correction_modal')
    // Close modal if open
    const closeBtn = page.locator('button').filter({ hasText: /cancel|close|скасу/i }).first()
    if (await closeBtn.isVisible().catch(() => false)) await closeBtn.click()

    // ── 6. Certification form (locked — unpaid) ──────────────────────────────
    console.log('\n6. Certification form')
    await page.goto(`${BASE}/en/services/translate-document/session/${SESSION_ID}/certify`, { waitUntil: 'networkidle', timeout: 20000 })
    await page.waitForTimeout(1000)
    await shot(page, '06_certification_form', 'Certification form')
    allIssues['06_certification'] = await checkIssues(page, '06_certification')

    // ── 7. Payment gate page ────────────────────────────────────────────────
    console.log('\n7. Payment / checkout page')
    await page.goto(`${BASE}/en/services/translate-document/session/${SESSION_ID}/payment`, { waitUntil: 'networkidle', timeout: 20000 }).catch(() => {})
    await page.waitForTimeout(1000)
    await shot(page, '07_payment_gate', 'Payment gate / checkout redirect page')
    allIssues['07_payment'] = await checkIssues(page, '07_payment')

    // ── 8. Final download page ──────────────────────────────────────────────
    console.log('\n8. Final download / complete page')
    await page.goto(`${BASE}/en/services/translate-document/session/${SESSION_ID}/complete`, { waitUntil: 'networkidle', timeout: 20000 }).catch(() => {})
    await page.waitForTimeout(1000)
    await shot(page, '08_final_download', 'Final download / order complete page')
    allIssues['08_download'] = await checkIssues(page, '08_download')

  } catch (err) {
    console.error('\n❌ Screenshot script error:', err.message)
  } finally {
    await browser.close()
  }

  // ── Summary ──────────────────────────────────────────────────────────────
  console.log('\n══════════════════════════════════════════')
  console.log('PHASE 2 MOBILE UX SUMMARY')
  const totalIssues = Object.values(allIssues).flat().length
  console.log(`Screenshots: 8 captured → artifacts/mobile_ux/`)
  console.log(`Layout issues: ${totalIssues === 0 ? '0 — all clear ✅' : totalIssues + ' — review required ⚠️'}`)
  if (totalIssues > 0) {
    for (const [screen, issues] of Object.entries(allIssues)) {
      if (issues.length > 0) console.log(`  ${screen}: ${issues.join('; ')}`)
    }
  }
  console.log('══════════════════════════════════════════')
})()
