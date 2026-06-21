/**
 * honest-pdf.test.ts — P0: a field that could not be read is NEVER silently dropped.
 * It becomes a visible MISSING placeholder, and any missing field makes the draft
 * NOT certifiable.
 */
import { describe, it, expect } from 'vitest'
import { planTranslationRows } from '../pdf'

describe('P0 — honest PDF field planning', () => {
  it('empty field becomes a visible MISSING row, not dropped', () => {
    const { rows, missingCount, certifiable } = planTranslationRows([
      { field: 'surname', normalized_value: 'Ivanenko', review_required: true },
      { field: 'date_of_birth', normalized_value: '', review_required: false },     // unread
      { field: 'place_of_birth', normalized_value: null, review_required: false },  // unread
    ])
    expect(rows.length).toBe(3) // nothing dropped — was the bug (silent continue)
    const dob = rows.find((r) => r.label === 'Date Of Birth')!
    expect(dob.status).toBe('missing')
    expect(dob.value.toLowerCase()).toContain('enter from document')
    expect(missingCount).toBe(2)
    expect(certifiable).toBe(false) // a missing field blocks certification
  })

  it('all fields present & reviewed → certifiable, review flagged', () => {
    const { rows, missingCount, reviewCount, certifiable } = planTranslationRows([
      { field: 'surname', normalized_value: 'Ivanenko', review_required: true },
      { field: 'passport_no', normalized_value: 'FA000000', review_required: false },
    ])
    expect(missingCount).toBe(0)
    expect(certifiable).toBe(true)
    expect(reviewCount).toBe(1)
    expect(rows.find((r) => r.label === 'Surname')!.status).toBe('review')
    expect(rows.find((r) => r.label === 'Passport No')!.status).toBe('ok')
  })
})
