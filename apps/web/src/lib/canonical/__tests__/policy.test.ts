/**
 * policy.test.ts — proves each acceptance bullet of
 * FIELD_CONFIDENCE_AND_CRITICALITY_POLICY.md §F for the canonical contract.
 */
import { describe, it, expect } from 'vitest'
import {
  computeFinalConfidence,
  buildConfidence,
  criticalityOf,
  materiallyDifferent,
  higherAuthority,
  sourceRank,
  resolveDisagreement,
  decideReviewRequired,
  CRITICAL_FIELDS,
  REVIEW_THRESHOLD,
} from '../policy'
import type { FieldEvidence } from '../types'

describe('canonical policy — confidence math (§A)', () => {
  it('final never exceeds the weakest applicable layer', () => {
    expect(computeFinalConfidence({ ocr: 0.99, field_match: 0.9, normalization: 0.6, source_match: 0.95 })).toBe(0.6)
  })

  it('a null layer is excluded from the min, not treated as 1', () => {
    // pure digit field: normalization does not apply
    expect(computeFinalConfidence({ ocr: 0.7, field_match: 0.8, normalization: null, source_match: 0.9 })).toBe(0.7)
  })

  it('no applicable layer → final 0 (no basis to trust)', () => {
    expect(computeFinalConfidence({ ocr: null, field_match: null, normalization: null, source_match: null })).toBe(0)
  })

  it('buildConfidence derives final, never trusts a provider-supplied one', () => {
    const c = buildConfidence({ ocr: 0.5, field_match: 0.9, normalization: 0.9, source_match: 0.9 })
    expect(c.final).toBe(0.5)
  })
})

describe('canonical policy — criticality matrix (§B)', () => {
  it('the six critical fields are critical', () => {
    for (const k of ['family_name', 'given_name', 'patronymic', 'date_of_birth', 'passport_number', 'a_number']) {
      expect(criticalityOf(k)).toBe('critical')
      expect(CRITICAL_FIELDS.has(k)).toBe(true)
    }
  })

  it('high/medium/low mapped per matrix; unknown → low', () => {
    expect(criticalityOf('issuing_authority')).toBe('high')
    expect(criticalityOf('place_of_birth')).toBe('high')
    expect(criticalityOf('sex')).toBe('medium')
    expect(criticalityOf('document_color')).toBe('low')
    expect(criticalityOf('totally_unknown')).toBe('low')
  })

  it('a critical field cannot be auto-finalized even at perfect confidence', () => {
    const d = decideReviewRequired({
      key: 'family_name',
      rawValue: 'KOVALENKO',
      normalizedValue: 'Kovalenko',
      confidence: buildConfidence({ ocr: 1, field_match: 1, normalization: 1, source_match: 1 }),
      evidence: [],
    })
    expect(d.reviewRequired).toBe(true)
    expect(d.reasons).toContain('critical_field_requires_review')
  })
})

describe('canonical policy — no-silent-correction (§E)', () => {
  it('case/whitespace/punctuation differences are NOT material', () => {
    expect(materiallyDifferent('Kovalenko', 'KOVALENKO')).toBe(false)
    expect(materiallyDifferent(' Vinnytsia ', 'Vinnytsia')).toBe(false)
    expect(materiallyDifferent("O'Brien", 'OBrien')).toBe(false)
  })

  it('a different value IS material → forces review and keeps raw', () => {
    expect(materiallyDifferent('Ярошенець', 'Вінниця')).toBe(true)
    const d = decideReviewRequired({
      key: 'place_of_birth',
      rawValue: 'Ярошенець',
      normalizedValue: 'Вінниця',
      confidence: buildConfidence({ ocr: 0.9, field_match: 0.9, normalization: 0.9, source_match: 0.9 }),
      evidence: [],
    })
    expect(d.reviewRequired).toBe(true)
    expect(d.reasons).toContain('material_normalization_change')
  })

  it('a canonicalizer can treat transliteration-equivalent names as equal', () => {
    const canon = (s: string) => s.replace(/i/gi, 'y') // toy: i≈y
    expect(materiallyDifferent('Vasil', 'Vasyl', canon)).toBe(false)
  })
})

describe('canonical policy — source authority (§D)', () => {
  it('MRZ outranks everything; manual is lowest', () => {
    expect(higherAuthority('mrz', 'passport_visual')).toBe('mrz')
    expect(higherAuthority('ai_vision', 'mrz')).toBe('mrz')
    expect(higherAuthority('manual_user_entry', 'document_ocr')).toBe('document_ocr')
    expect(sourceRank('mrz')).toBeGreaterThan(sourceRank('manual_user_entry'))
  })
})

describe('canonical policy — provider disagreement (§C)', () => {
  const ev = (value: string, source: FieldEvidence['source'], confidence = 0.9, provider = 'p'): FieldEvidence =>
    ({ value, source, confidence, provider })

  it('material disagreement on a critical field forces review; neither auto-wins outright', () => {
    const r = resolveDisagreement([ev('Kovalenko', 'document_ocr'), ev('Kovalenenko', 'ai_vision')], 'critical')
    expect(r.forcesReview).toBe(true)
    expect(r.provisional).not.toBeNull()
  })

  it('agreement (after norm) does not force review; higher-authority provisional wins', () => {
    const r = resolveDisagreement([ev('KOVALENKO', 'ai_vision'), ev('Kovalenko', 'mrz')], 'critical')
    expect(r.forcesReview).toBe(false)
    expect(r.provisional?.source).toBe('mrz')
  })

  it('low-field disagreement does not force review', () => {
    const r = resolveDisagreement([ev('M', 'document_ocr'), ev('F', 'ai_vision')], 'low')
    expect(r.forcesReview).toBe(false)
  })

  it('decideReviewRequired surfaces provider_disagreement on a high field', () => {
    const d = decideReviewRequired({
      key: 'place_of_birth',
      rawValue: 'Lviv',
      normalizedValue: 'Lviv',
      confidence: buildConfidence({ ocr: 0.95, field_match: 0.95, normalization: 0.95, source_match: 0.95 }),
      evidence: [ev('Lviv', 'document_ocr'), ev('Kyiv', 'ai_vision')],
    })
    expect(d.reviewRequired).toBe(true)
    expect(d.reasons).toContain('provider_disagreement')
  })
})

describe('canonical policy — threshold (§A)', () => {
  it('high field below threshold → review; at/above → no confidence-driven review', () => {
    const low = decideReviewRequired({
      key: 'issuing_authority', rawValue: 'X', normalizedValue: 'X',
      confidence: buildConfidence({ ocr: 0.8, field_match: 0.8, normalization: 0.8, source_match: 0.8 }),
      evidence: [],
    })
    expect(low.reasons).toContain('low_final_confidence')
    const ok = decideReviewRequired({
      key: 'issuing_authority', rawValue: 'X', normalizedValue: 'X',
      confidence: buildConfidence({ ocr: 0.9, field_match: 0.9, normalization: 0.9, source_match: 0.9 }),
      evidence: [],
    })
    expect(ok.reasons).not.toContain('low_final_confidence')
    expect(REVIEW_THRESHOLD).toBe(0.85)
  })
})
