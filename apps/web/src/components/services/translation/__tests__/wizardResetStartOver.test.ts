/**
 * wizardResetStartOver.test.ts — source-level guard for the Translation wizard's
 * recovery UX. After a bad recognition the user must be able to (a) go Back from
 * the review screen to re-upload, and (b) Start over with a FULL reset that clears
 * every piece of session state — the explicit complement to the session-isolation
 * guard (no stale draft restore on a plain visit).
 *
 * Node-env, no DOM — same source-assertion approach as sessionIsolation.test.ts.
 */
import { describe, it, expect } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'

const SRC = fs.readFileSync(path.resolve(__dirname, '..', 'TranslateWizard.tsx'), 'utf-8')

describe('TranslateWizard — reset + Back/Start-over', () => {
  it('resetAll clears the attestation inputs and the persisted Stripe checkout id', () => {
    const body = SRC.slice(SRC.indexOf('const resetAll'), SRC.indexOf('const startOver'))
    expect(body).toMatch(/setCertifierAddress\(''\)/)
    expect(body).toMatch(/setDataReviewed\(false\)/)
    expect(body).toMatch(/setAccuracyAttested\(false\)/)
    expect(body).toMatch(/setStripeCheckoutId\(null\)/)
    // clears BOTH persisted keys so a fresh start cannot inherit stale data
    expect(body).toMatch(/removeItem\(DRAFT_KEY\)/)
    expect(body).toMatch(/removeItem\('tw:cs'\)/)
  })

  it('startOver confirms data loss, resets, and returns to doc-type (screen 2)', () => {
    const body = SRC.slice(SRC.indexOf('const startOver'), SRC.indexOf('const startOver') + 400)
    expect(body).toMatch(/window\.confirm\(t\.start_over_confirm\)/)
    expect(body).toMatch(/resetAll\(\)/)
    expect(body).toMatch(/goTo\(2\)/)
  })

  it('the review screen (5) offers a Back (to re-upload) and a Start-over control', () => {
    const screen5 = SRC.slice(SRC.indexOf('screen === 5'))
    // Back to upload (screen 3)
    expect(screen5).toMatch(/className="tw-back-btn" onClick=\{\(\) => goTo\(3\)\}/)
    // Start over wired to the startOver handler
    expect(screen5).toMatch(/onClick=\{startOver\}/)
  })

  it('provides the start_over copy in the RU base and EN override', () => {
    expect(SRC).toMatch(/start_over: '↺ Начать заново'/)
    expect(SRC).toMatch(/start_over: '↺ Start over'/)
  })
})
