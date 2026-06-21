/**
 * knowledgeNormalize + arbitration D2 authority layer (ADR-017 §D2).
 *
 * The dictionary is an AUTHORITY LAYER with provenance + action, NOT an auto-replace.
 * These tests assert the CONFLICT behaviour (the AI-risk requirement), not just the happy path:
 * a conflict on a value surfaces a candidate for review and NEVER silently rewrites the read.
 */
import { describe, it, expect } from 'vitest'
import { normalizeCanonicalValue } from '../knowledgeNormalize'
import { arbitrateDocument } from '../arbitration'
import type { FieldCandidate } from '../types'

function c(p: Partial<FieldCandidate> & { key: string; value: string }): FieldCandidate {
  return { source: 'ai_vision', confidence: 0.9, provider: 'gemini', ...p }
}

describe('knowledgeNormalize — D2 decision contract (provenance + action, no silent override)', () => {
  it('Russian spelling on a UA doc → REVIEW with candidate, NOT a silent final', () => {
    const d = normalizeCanonicalValue('given_name', 'Андрей', { ukrainianDoc: true })
    expect(d.action).toBe('review')
    expect(d.finalValue).toBeNull()              // never finalize a suspected misread
    expect(d.candidateValue).toBeTruthy()        // offer the transliteration for a human
    expect(d.reasonCodes).toContain('russian_spelling_suspected')
  })

  it('clean Ukrainian spelling → ACCEPT (KMU-55), transliterated final', () => {
    const d = normalizeCanonicalValue('given_name', 'Іван', { ukrainianDoc: true })
    expect(d.action).toBe('accept')
    expect(d.finalValue).toBeTruthy()
    expect(d.finalValue).not.toMatch(/[Ѐ-ӿ]/)
  })

  it('gazetteer EXACT city → ACCEPT', () => {
    const d = normalizeCanonicalValue('place_of_birth_city', 'Київ', { ukrainianDoc: true })
    expect(d.action).toBe('accept')
    expect(d.provenance).toBe('gazetteer_exact')
  })

  it('gazetteer FUZZY city → SUGGEST, never overwrite', () => {
    const d = normalizeCanonicalValue('place_of_birth_city', 'Простянець', { ukrainianDoc: true })
    expect(d.action).toBe('suggest')
    expect(d.finalValue).toBeNull()
  })

  it('genuinely-UNKNOWN small town → ACCEPT transliteration (no review-flag inflation)', () => {
    // Not in the ~500-entry seed gazetteer and not a fuzzy near-match of a known
    // place → must NOT force review (that blocked the pay button on legit villages).
    const d = normalizeCanonicalValue('place_of_birth_city', 'Кудашівка', { ukrainianDoc: true })
    expect(d.action).toBe('accept')
    expect(d.finalValue).toBeTruthy()
  })

  it('patronymic fragment → REVIEW', () => {
    const d = normalizeCanonicalValue('child_patronymic', 'ович')
    expect(d.action).toBe('review')
  })

  it('valid patronymic with sex → ACCEPT, never "Middle Name"', () => {
    const d = normalizeCanonicalValue('patronymic', 'Петрович', { sex: 'M' })
    expect(d.action).toBe('accept')
    expect(d.finalValue).not.toMatch(/[Ѐ-ӿ]/)
  })

  it('controlling Latin (MRZ) name → PRESERVE, spelling kept', () => {
    const d = normalizeCanonicalValue('family_name', 'IVANENKO')
    expect(d.action).toBe('preserve')
    expect(d.finalValue).toBe('Ivanenko')
  })

  it('known authority Міліція → ACCEPT Militsiya (never Police)', () => {
    const d = normalizeCanonicalValue('issuing_authority', 'міліція', { isHistorical: true })
    expect(d.action).toBe('accept')
    expect(d.finalValue).toMatch(/Militsiya/i)
    expect(d.finalValue).not.toMatch(/police/i)
  })

  it('unknown authority → REVIEW (do not invent a final)', () => {
    const d = normalizeCanonicalValue('issuing_authority', 'Якась Невідома Контора')
    expect(d.action).toBe('review')
    expect(d.finalValue).toBeNull()
  })
})

describe('arbitrateDocument — knowledge OFF = identical, ON = conflict→review (no silent rewrite)', () => {
  it('no knowledge ctx → byte-identical (value untouched)', () => {
    const fields = arbitrateDocument([c({ key: 'given_name', value: 'Андрей' })])
    expect(fields[0].normalizedValue).toBe('Андрей')
    expect(fields[0].reviewReasons).not.toContain('russian_spelling_suspected')
  })

  it('knowledge ON: Russian spelling → review + suggestedValue, read value KEPT (not silently "fixed")', () => {
    const fields = arbitrateDocument(
      [c({ key: 'given_name', value: 'Андрей' })],
      { documentClass: 'birth_certificate_handwritten', ukrainianDoc: true },
    )
    expect(fields[0].normalizedValue).toBe('Андрей')   // NOT replaced
    expect(fields[0].reviewRequired).toBe(true)
    expect(fields[0].suggestedValue).toBeTruthy()      // candidate surfaced
    expect(fields[0].reviewReasons.some((r) => r.includes('russian_spelling'))).toBe(true)
  })

  it('knowledge ON: clean UA spelling → accepted transliteration as the final value', () => {
    const fields = arbitrateDocument(
      [c({ key: 'given_name', value: 'Іван' })],
      { documentClass: 'birth_certificate_handwritten', ukrainianDoc: true },
    )
    expect(fields[0].normalizedValue).not.toMatch(/[Ѐ-ӿ]/) // transliterated
  })
})
