/**
 * sessionIsolation.test.ts — source-level guard: the translation wizard must NOT
 * resurrect a previous session's extracted fields on a fresh visit. Restoring a
 * stale draft showed foreign data ("Шуляк/Іван/Проскурів") as if recognized for
 * the current upload. The draft restore must be gated on the Stripe return (?paid=1),
 * and a new upload must clear prior fields.
 */
import { describe, it, expect } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'

const SRC = fs.readFileSync(path.resolve(__dirname, '..', 'TranslateWizard.tsx'), 'utf-8')

describe('TranslateWizard — session isolation', () => {
  it('gates draft restore on the Stripe return (?paid=1), not every mount', () => {
    // the restore effect must early-return when not a paid round-trip
    expect(SRC).toMatch(/if \(searchParams\?\.get\('paid'\) !== '1'\) return/)
  })

  it('clears extracted fields when a new file is uploaded', () => {
    expect(SRC).toMatch(/handleFiles[\s\S]{0,400}setExtractedFields\(\[\]\)/)
  })
})
