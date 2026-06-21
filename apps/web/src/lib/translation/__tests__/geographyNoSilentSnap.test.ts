/**
 * geographyNoSilentSnap.test.ts — S1 safety: a fuzzy place must NEVER silently
 * replace the raw read. Locks the owner's live failure: с.м.т. Ярошенець must NOT
 * become Vinnytsia without review.
 */
import { describe, it, expect } from 'vitest'
import { snapCity } from '@uscis-helper/knowledge'

describe('S1 — geography no-silent-snap', () => {
  it('does NOT silently replace a distant read (Ярошенець ≠ Вінниця)', () => {
    // Ярошенець is dist ~2.4 from its nearest seed entry — beyond the absolute
    // fuzzy cap (2). It is now classified unknown_geography: the RAW read is kept
    // and NO (wrong) suggestion is offered — even safer than the old fuzzy path,
    // which used to suggest a different village. The owner's failure (Ярошенець →
    // Vinnytsia) is fully prevented.
    const r = snapCity('с.м.т. Ярошенець')
    expect(r.value).toContain('Ярошен')          // RAW preserved
    expect(r.matched).toBe(false)
    expect(r.suggestedValue ?? null).toBeNull()   // no wrong suggestion
    expect(r.reason).toBe('unknown_geography')
  })

  it('a CLOSE OCR misread still surfaces a suggestion, never silently applied (Простянець→Тростянець)', () => {
    const r = snapCity('Простянець') // dist ~0.4 (П↔Т cheap confusion) → real fuzzy
    expect(r.matched).toBe(false)                 // NOT silently replaced
    expect(r.value).toBe('Простянець')            // RAW preserved
    expect(r.suggestedValue).toBe('Тростянець')   // surfaced as a suggestion only
    expect(r.reason).toBe('fuzzy_geography_match')
  })

  it('an EXACT match still normalizes (Вінниця → Вінниця, no review)', () => {
    const r = snapCity('Вінниця')
    expect(r.value).toBe('Вінниця')
    expect(r.matched).toBe(true)
    expect(r.review_required).toBe(false)
    expect(r.suggestedValue ?? null).toBeNull()
  })

  it('unknown geography keeps the raw read + review, no suggestion', () => {
    const r = snapCity('Ззззжщ')
    expect(r.matched).toBe(false)
    expect(r.review_required).toBe(true)
    expect(r.reason).toBe('unknown_geography')
  })
})
