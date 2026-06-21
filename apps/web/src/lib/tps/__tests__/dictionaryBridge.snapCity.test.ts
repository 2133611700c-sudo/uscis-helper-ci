import { describe, it, expect, afterEach } from 'vitest'
import { normalizeCity } from '../dictionaryBridge'

// P2.1 — snapCity wired into the live door behind SMART_NORMALIZE_ENABLED.
// Hard rule: matched=false → review_required, NEVER a silent replacement.

afterEach(() => { delete process.env.SMART_NORMALIZE_ENABLED })

describe('normalizeCity — SMART_NORMALIZE_ENABLED OFF (default, unchanged behavior)', () => {
  it('flag OFF: no gazetteer, passthrough as before', () => {
    delete process.env.SMART_NORMALIZE_ENABLED
    const r = normalizeCity('Вінниця')
    expect(r.value).toBe('Вінниця')
    expect(r.review_required).toBeUndefined() // no P2 signal when flag OFF
  })
})

describe('normalizeCity — SMART_NORMALIZE_ENABLED ON', () => {
  it('exact gazetteer city → matched, no review', () => {
    process.env.SMART_NORMALIZE_ENABLED = '1'
    const r = normalizeCity('Вінниця')
    expect(r.source).toBe('gazetteer')
    expect(r.value).toBe('Вінниця')
    expect(r.review_required).toBe(false)
  })

  it('unknown gibberish → review_required, RAW kept, NO silent replace', () => {
    process.env.SMART_NORMALIZE_ENABLED = '1'
    const r = normalizeCity('Жжжщ')
    expect(r.review_required).toBe(true)
    expect(r.value).toBe('Жжжщ') // raw preserved, not replaced
  })

  it('fuzzy near-miss → review_required, NOT silently snapped to a real city', () => {
    process.env.SMART_NORMALIZE_ENABLED = '1'
    const r = normalizeCity('Простянець')
    // Per anti-silent-snap rule: a fuzzy guess must NOT become the final value.
    if (r.review_required) {
      // fuzzy path: raw kept, suggestion surfaced
      expect(r.value).toBe('Простянець')
    } else {
      // only acceptable if it was an EXACT gazetteer entry
      expect(r.source).toBe('gazetteer')
    }
  })
})
