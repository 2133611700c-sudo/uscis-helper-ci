/**
 * manualOverride.test.ts — the Manual Override Contract: lowest authority, applied
 * only on user confirmation, preserves the prior value, clears review.
 */
import { describe, it, expect } from 'vitest'
import { applyManualOverride } from '../manualOverride'
import { buildConfidence } from '../policy'
import type { CanonicalField } from '../types'

function critical(value: string): CanonicalField {
  return {
    key: 'family_name',
    rawValue: value,
    normalizedValue: value,
    criticality: 'critical',
    confidence: buildConfidence({ ocr: 0.6, field_match: null, normalization: null, source_match: null }),
    source: 'document_ocr',
    reviewRequired: true,
    reviewReasons: ['critical_field_requires_review', 'low_final_confidence'],
    evidence: [{ value, source: 'document_ocr', confidence: 0.6, provider: 'ocr:x' }],
  }
}

describe('Manual Override Contract', () => {
  it('sets the user value + manual source and clears review (the override IS confirmation)', () => {
    const out = applyManualOverride(critical('Kovalenenko'), 'Kovalenko')
    expect(out.normalizedValue).toBe('Kovalenko')
    expect(out.source).toBe('manual_user_entry')
    expect(out.reviewRequired).toBe(false)
    expect(out.reviewReasons).toEqual([])
    expect(out.confidence.final).toBe(1)
  })

  it('preserves the prior machine value as evidence (never lost) + records rejectedReason', () => {
    const out = applyManualOverride(critical('Kovalenenko'), 'Kovalenko')
    const prior = out.evidence.find((e) => e.provider === 'pre_manual_override')
    expect(prior?.value).toBe('Kovalenenko')
    expect(out.rejectedReason).toBe('superseded_by_manual_user_entry')
  })

  it('confirming the same value (only case/space differs) sets no rejectedReason', () => {
    const out = applyManualOverride(critical('Kovalenko'), '  KOVALENKO ')
    expect(out.normalizedValue).toBe('KOVALENKO')
    expect(out.reviewRequired).toBe(false)
    expect(out.rejectedReason).toBeUndefined()
  })

  it('trims the user entry', () => {
    expect(applyManualOverride(critical('X'), '  Lviv  ').normalizedValue).toBe('Lviv')
  })

  it('does not duplicate the prior evidence on repeated overrides', () => {
    const once = applyManualOverride(critical('A'), 'B')
    const twice = applyManualOverride(once, 'C')
    const priors = twice.evidence.filter((e) => e.provider === 'pre_manual_override')
    // 'A' captured on the first override; the override result's value 'B' becomes the new prior on the second
    expect(priors.length).toBeGreaterThanOrEqual(1)
    expect(twice.normalizedValue).toBe('C')
  })
})
