/**
 * ownerMode.test.ts — the Translation wizard must let the verified site owner
 * run the full flow WITHOUT payment (parity with the TPS wizard). Source-level
 * (vitest env is node, no DOM).
 */
import { describe, it, expect } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'

const SRC = fs.readFileSync(path.resolve(__dirname, '..', 'TranslateWizard.tsx'), 'utf-8')

describe('TranslateWizard — owner mode (free testing)', () => {
  it('checks owner status on mount', () => {
    expect(SRC).toMatch(/fetch\('\/api\/owner\/status'\)/)
    expect(SRC).toMatch(/setIsOwner\(true\)/)
  })
  it('skips Stripe and advances to the sign/download screen for the owner', () => {
    // saveDraft is awaited so the server-ledger token cookie is set before the
    // owner advances (parity with the paid path under the server-ledger flag).
    expect(SRC).toMatch(/if \(isOwner\) \{ await saveDraft\(\); setScreen\(7\); return \}/)
  })
  it('labels the CTA for the owner', () => {
    expect(SRC).toMatch(/Owner — continue free/)
  })
})
