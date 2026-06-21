/**
 * coreFixes.test.ts — tests for the three real-data bugs fixed in session 92.
 *
 * Bug 1: criticalityOf('dob') was 'low' → fixed: 'critical' (alias for date_of_birth).
 * Bug 2: birth cert child fields (child_family_name etc.) were 'low' → fixed: 'critical'.
 * Bug 3: reader review_required not carried into FieldCandidate → fixed: reviewRequired field.
 */
import { describe, it, expect } from 'vitest'
import { criticalityOf, CRITICAL_FIELDS } from '../../policy'
import { arbitrateField } from '../arbitration'
import type { FieldCandidate } from '../types'

const c = (p: Partial<FieldCandidate> & { key: string; value: string; source: FieldCandidate['source'] }): FieldCandidate => ({
  confidence: 0.9,
  provider: 'test',
  ...p,
})

// ── Bug 1: dob alias ────────────────────────────────────────────────────────

describe('criticalityOf — dob alias', () => {
  it('dob is critical (alias for date_of_birth)', () => {
    expect(criticalityOf('dob')).toBe('critical')
  })

  it('date_of_birth remains critical', () => {
    expect(criticalityOf('date_of_birth')).toBe('critical')
  })

  it('dob is in CRITICAL_FIELDS', () => {
    expect(CRITICAL_FIELDS.has('dob')).toBe(true)
  })
})

// ── Bug 2: birth cert child fields ─────────────────────────────────────────

describe('criticalityOf — birth cert child fields', () => {
  it('child_family_name is critical', () => {
    expect(criticalityOf('child_family_name')).toBe('critical')
  })

  it('child_given_name is critical', () => {
    expect(criticalityOf('child_given_name')).toBe('critical')
  })

  it('child_patronymic is critical', () => {
    expect(criticalityOf('child_patronymic')).toBe('critical')
  })

  it('child_dob is critical', () => {
    expect(criticalityOf('child_dob')).toBe('critical')
  })

  it('child_date_of_birth is critical', () => {
    expect(criticalityOf('child_date_of_birth')).toBe('critical')
  })
})

// ── Bug 3: review_required carry-through ───────────────────────────────────

describe('arbitrateField — reader reviewRequired carry-through', () => {
  it('candidate with reviewRequired=true carries review into result', () => {
    const f = arbitrateField('place_of_birth', [
      c({ key: 'place_of_birth', value: 'Vinnytsia', source: 'ai_vision', reviewRequired: true }),
    ])!
    expect(f).not.toBeNull()
    expect(f.reviewRequired).toBe(true)
    expect(f.reviewReasons).toContain('reader_review_required')
  })

  it('candidate with reviewRequired=true and reviewReasons carries named reasons', () => {
    const f = arbitrateField('place_of_birth', [
      c({
        key: 'place_of_birth', value: 'Vinnytsia', source: 'ai_vision',
        reviewRequired: true, reviewReasons: ['low_ocr_quality'],
      }),
    ])!
    expect(f.reviewRequired).toBe(true)
    expect(f.reviewReasons).toContain('low_ocr_quality')
  })

  it('candidate with reviewRequired=false does NOT add spurious review reasons', () => {
    // medium-criticality field, no other review triggers → should NOT be reviewRequired
    const f = arbitrateField('sex', [
      c({ key: 'sex', value: 'M', source: 'ai_vision', confidence: 0.95, reviewRequired: false }),
    ])!
    expect(f.reviewRequired).toBe(false)
    expect(f.reviewReasons).not.toContain('reader_review_required')
  })

  it('dob candidate is still critical-no-mrz-anchor even when review not set by reader', () => {
    // Verify the dob alias feeds into the correct criticality path
    const f = arbitrateField('dob', [
      c({ key: 'dob', value: '1990-01-01', source: 'ai_vision', reviewRequired: false }),
    ])!
    expect(f.reviewRequired).toBe(true)
    expect(f.reviewReasons).toContain('critical_no_mrz_anchor')
  })
})
