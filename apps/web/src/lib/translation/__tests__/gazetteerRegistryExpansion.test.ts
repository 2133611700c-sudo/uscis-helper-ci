/**
 * gazetteerRegistryExpansion.test.ts — (b) geo expansion.
 *
 * The handwriting fuzzy-matcher (snapCity) now scores against the official
 * КАТОТТГ settlement registry (Наказ Мінрегіону №290), not just the 60-item
 * curated seed. The matcher logic is unchanged; only the vocabulary grows.
 * Anti-silent-snap invariant must still hold: an exact registry city matches
 * cleanly; gibberish stays raw + review.
 */
import { describe, it, expect } from 'vitest'
import { GAZETTEER, snapCity } from '@uscis-helper/knowledge'

describe('gazetteer is expanded from the official settlement registry', () => {
  it('vocabulary is far larger than the 60-item seed', () => {
    expect(GAZETTEER.length).toBeGreaterThan(200) // seed ~60 + ~458 registry
  })

  it('still contains the curated confusion-test anchors', () => {
    for (const c of ['Вінниця', 'Шаргород', 'Енергодар', 'Коломия']) {
      expect(GAZETTEER).toContain(c)
    }
  })

  it('has no duplicate entries (seed ∪ registry de-duped)', () => {
    expect(new Set(GAZETTEER).size).toBe(GAZETTEER.length)
  })
})

describe('snapCity over the expanded vocabulary keeps the anti-silent-snap rule', () => {
  it('an exact registry city → matched, no review, value unchanged', () => {
    // Євпаторія is a real КАТОТТГ settlement absent from the curated seed.
    const r = snapCity('Євпаторія')
    expect(r.matched).toBe(true)
    expect(r.review_required).toBe(false)
    expect(r.value).toBe('Євпаторія')
  })

  it('gibberish → raw kept + review, never silently snapped', () => {
    const r = snapCity('Жжжщ')
    expect(r.matched).toBe(false)
    expect(r.review_required).toBe(true)
    expect(r.value).toBe('Жжжщ')
  })
})
