/**
 * renderValue.test.ts — the bureau PDF must NEVER silently drop source data.
 * Proves the fix for the silent Cyrillic-strip blocker (I-АМ → I-, data loss).
 */
import { describe, it, expect } from 'vitest'
import { renderValueForPdf, pdfSafe } from '../renderValue'

describe('renderValueForPdf — no silent data loss', () => {
  it('transliterates a Cyrillic series instead of dropping it (I-АМ № 428069 → I-AM No. 428069)', () => {
    const r = renderValueForPdf('I-АМ № 428069')
    expect(r.text).toContain('I-AM')   // NOT "I-"
    expect(r.text).toContain('428069')
    expect(r.text).not.toMatch(/I-\s*№/) // no untranslated numero, no gap
    expect(r.text).not.toMatch(/I-\s+428069/) // series letters were not deleted
    expect(r.transliterated).toBe(true)
  })

  it('transliterates a Ukrainian name via KMU-55, never deletes it', () => {
    const r = renderValueForPdf('Шевченко Тарас Григорович')
    expect(r.text).toBe('Shevchenko Taras Hryhorovych')
    expect(r.unrenderable).toBe(false)
  })

  it('keeps unknown non-Latin source visible (marker), never silently removed', () => {
    const r = renderValueForPdf('Орган: 中文 agency')
    // Cyrillic part transliterated, CJK part marked — but NOT gone
    expect(r.text).toContain('[?]')
    expect(r.unrenderable).toBe(true)
    expect(r.text.length).toBeGreaterThan(0)
  })

  it('passes through plain ASCII unchanged', () => {
    const r = renderValueForPdf('Vinnytsia Oblast')
    expect(r.text).toBe('Vinnytsia Oblast')
    expect(r.transliterated).toBe(false)
    expect(r.unrenderable).toBe(false)
  })

  it('the old silent strip is gone — no input above U+00FF yields an empty string', () => {
    // previously replace(/[^\x00-\xFF]/g,'') turned "АМ" into "" — must not happen
    expect(pdfSafe('АМ')).toBe('AM')
    expect(pdfSafe('АМ').length).toBeGreaterThan(0)
  })
})
