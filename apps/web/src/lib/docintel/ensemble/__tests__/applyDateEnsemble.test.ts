/**
 * applyDateEnsemble.test.ts — field-level cross-engine date check.
 * Synthetic data only. Pins the real handwritten failure: primary (Gemini) reads
 * the month as July, the second engine (Vision) reads June → force review +
 * attach the second reading; never overwrite, never lower review.
 */
import { describe, it, expect } from 'vitest'
import { extractDateCandidatesFromText } from '../dateReconcile'
import { applyDateEnsemble, isDateFieldName, type EnsembleField } from '../applyDateEnsemble'

describe('isDateFieldName — detect by NAME (live kind is the source, not the type)', () => {
  it('detects date fields regardless of kind (the silenced-ensemble bug)', () => {
    expect(isDateFieldName('dob', 'ai_vision')).toBe(true)
    expect(isDateFieldName('date_of_issue', 'ai_vision')).toBe(true)
    expect(isDateFieldName('date_of_marriage', 'ai_vision')).toBe(true)
    expect(isDateFieldName('child_family_name', 'ai_vision')).toBe(false)
    expect(isDateFieldName('issuing_authority', 'ai_vision')).toBe(false)
  })
})

describe('extractDateCandidatesFromText', () => {
  it('pulls Ukrainian/Russian word-month dates and ISO from OCR noise', () => {
    const text = 'родился (лась) 14 июня 1990\nдата видачі 03.05.1991\nact 1990-06-14 №428'
    const got = extractDateCandidatesFromText(text)
    expect(got).toEqual(expect.arrayContaining(['14 июня 1990', '03.05.1991', '1990-06-14']))
  })
  it('returns empty for text with no dates', () => {
    expect(extractDateCandidatesFromText('no dates here, just words')).toEqual([])
  })
  it('captures month+year even when the day is missing (OCR of a date region)', () => {
    // Vision OCR of a zoomed handwritten date often drops a clean day digit.
    const got = extractDateCandidatesFromText('родился (лась) июня 1996 место')
    expect(got.some((s) => /июня\s+1996/.test(s))).toBe(true)
  })
})

describe('applyDateEnsemble — month-only second reading (no day) still surfaces', () => {
  it('Gemini July(full date) vs Vision "июня 1996" (no day) → month disagreement flagged', () => {
    const input: EnsembleField[] = [{ field: 'dob', kind: 'ai_vision', raw_cyrillic: '14 липня 1990', review_required: false }]
    const out = applyDateEnsemble(input, 'родился июня 1996')
    expect(out.disagreements).toContain('dob')
    expect(out.fields[0].ensemble_candidate).toMatch(/июня\s+1996/)
  })
})

describe('applyDateEnsemble — cross-engine date conflict', () => {
  const fields: EnsembleField[] = [
    { field: 'child_family_name', kind: 'name', value: 'Kovalenko', review_required: false },
    { field: 'dob', kind: 'date', value: '1990-07-14', raw_cyrillic: '14 липня 1990', review_required: false },
  ]

  it('Gemini July vs Vision June on the same year → force review + candidate attached', () => {
    const out = applyDateEnsemble(fields, 'родился (лась) 14 июня 1990')
    expect(out.applied).toBe(true)
    expect(out.disagreements).toContain('dob')
    const dob = out.fields.find((f) => f.field === 'dob')!
    expect(dob.review_required).toBe(true)
    expect(dob.review_reasons).toContain('date_ensemble_disagreement')
    expect(dob.review_reasons).toContain('date_month_disagreement')
    expect(dob.ensemble_candidate).toBe('14 июня 1990')
    // never overwrites the primary value
    expect(dob.value).toBe('1990-07-14')
  })

  it('agreement → no new review, no disagreement', () => {
    const out = applyDateEnsemble(fields, 'родился (лась) 14 липня 1990')
    expect(out.disagreements).toEqual([])
    const dob = out.fields.find((f) => f.field === 'dob')!
    expect(dob.review_required).toBe(false)
    expect(dob.ensemble_candidate).toBeUndefined()
  })

  it('does not touch non-date fields', () => {
    const out = applyDateEnsemble(fields, 'родился (лась) 14 июня 1990')
    const name = out.fields.find((f) => f.field === 'child_family_name')!
    expect(name.review_required).toBe(false)
  })

  it('different year still surfaces (the real handwritten case: Vision gets month, Gemini gets year)', () => {
    // We crop the DATE region, so the second engine reads THIS date — a difference
    // with no shared component (e.g. Vision misreads the year but reads the month)
    // must still surface, not be suppressed.
    const out = applyDateEnsemble(fields, 'родился 14 июня 1996')
    expect(out.disagreements).toContain('dob')
    expect(out.fields.find((f) => f.field === 'dob')!.ensemble_candidate).toBe('14 июня 1996')
  })

  it('no second-engine date at all → no flag (nothing to compare)', () => {
    const out = applyDateEnsemble(fields, 'no date here, just words and a stamp')
    expect(out.disagreements).toEqual([])
  })

  it('never lowers an already-required review', () => {
    const reviewed: EnsembleField[] = [
      { field: 'dob', kind: 'date', value: '1990-06-14', raw_cyrillic: '14 червня 1990', review_required: true },
    ]
    const out = applyDateEnsemble(reviewed, 'родился 14 июня 1990') // agreement
    expect(out.fields[0].review_required).toBe(true)
  })
})
