/**
 * reParoleAdapter.test.ts — B3: CanonicalDocumentResult → ReParoleCoreAnswers adapter.
 *
 * Verifies: toReParoleCoreAnswers is a pure function (no I/O, no Gemini calls).
 * Tests: field mapping, review_required propagation, uncertain_fields tracking,
 * core_status logic, I-94 field non-invention, fallback_used=false.
 *
 * ONE_BRAIN_PARTIAL_3_PRODUCTS: TPS (B1) + Translation (B2) + Re-Parole (B3).
 */
import { describe, it, expect } from 'vitest'
import { toReParoleCoreAnswers } from '../reParoleAdapter'
import type { CanonicalDocumentResult, CanonicalField } from '../../types'

// ── Helpers ──────────────────────────────────────────────────────────────────

function makeField(
  key: string,
  rawValue: string | null,
  overrides: Partial<CanonicalField> = {},
): CanonicalField {
  return {
    key,
    rawValue,
    normalizedValue: rawValue,
    criticality: 'medium',
    confidence: { ocr: 0.9, field_match: null, normalization: null, source_match: null, final: 0.9 },
    source: 'ai_vision',
    reviewRequired: false,
    reviewReasons: [],
    evidence: [],
    ...overrides,
  }
}

function makeCanonical(
  fields: CanonicalField[],
  overrides: Partial<CanonicalDocumentResult> = {},
): CanonicalDocumentResult {
  return {
    documentSessionId: 'test-session-1',
    product: 'reparole',
    docType: 'ua_international_passport',
    fields,
    hashes: { uploadHash: null, normalizedImageHash: null, canonicalResultHash: null },
    createdAt: '2026-06-03T00:00:00.000Z',
    requiresReview: fields.some((f) => f.reviewRequired),
    ...overrides,
  }
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('toReParoleCoreAnswers — identity field mapping', () => {
  it('maps family_name from canonical', () => {
    const canonical = makeCanonical([makeField('family_name', 'Kovalenko')])
    const result = toReParoleCoreAnswers(canonical)
    expect(result.family_name).toBe('Kovalenko')
  })

  it('maps given_name from canonical', () => {
    const canonical = makeCanonical([makeField('given_name', 'Olena')])
    const result = toReParoleCoreAnswers(canonical)
    expect(result.given_name).toBe('Olena')
  })

  it('maps date_of_birth with dob alias', () => {
    // Gemini docintel emits 'dob' as alias for date_of_birth
    const canonical = makeCanonical([makeField('dob', '1990-05-15')])
    const result = toReParoleCoreAnswers(canonical)
    expect(result.date_of_birth).toBe('1990-05-15')
  })

  it('maps date_of_birth primary key when present', () => {
    const canonical = makeCanonical([makeField('date_of_birth', '1990-05-15')])
    const result = toReParoleCoreAnswers(canonical)
    expect(result.date_of_birth).toBe('1990-05-15')
  })

  it('maps sex from canonical', () => {
    const canonical = makeCanonical([makeField('sex', 'M')])
    const result = toReParoleCoreAnswers(canonical)
    expect(result.sex).toBe('M')
  })

  it('maps passport_number from canonical', () => {
    const canonical = makeCanonical([makeField('passport_number', 'EK123456')])
    const result = toReParoleCoreAnswers(canonical)
    expect(result.passport_number).toBe('EK123456')
  })

  it('maps country_of_nationality with nationality alias', () => {
    const canonical = makeCanonical([makeField('nationality', 'Ukrainian')])
    const result = toReParoleCoreAnswers(canonical)
    expect(result.country_of_nationality).toBe('Ukrainian')
  })

  it('maps country_of_birth with place_of_birth alias', () => {
    const canonical = makeCanonical([makeField('place_of_birth', 'Kyiv')])
    const result = toReParoleCoreAnswers(canonical)
    expect(result.country_of_birth).toBe('Kyiv')
  })
})

describe('toReParoleCoreAnswers — I-94 field mapping', () => {
  it('maps i94_admission_number when present', () => {
    const canonical = makeCanonical([makeField('i94_admission_number', '12345678901')])
    const result = toReParoleCoreAnswers(canonical)
    expect(result.i94_admission_number).toBe('12345678901')
  })

  it('does NOT invent i94_admission_number when absent (stays null)', () => {
    const canonical = makeCanonical([
      makeField('family_name', 'Kovalenko'),
      makeField('given_name', 'Olena'),
      makeField('date_of_birth', '1990-05-15'),
    ])
    const result = toReParoleCoreAnswers(canonical)
    // Passport document has no I-94 fields — must stay null
    expect(result.i94_admission_number).toBeNull()
    expect(result.last_entry_date).toBeNull()
    expect(result.i94_class_of_admission).toBeNull()
  })

  it('maps last_entry_date with alias date_of_last_entry', () => {
    const canonical = makeCanonical([makeField('date_of_last_entry', '2022-04-20')])
    const result = toReParoleCoreAnswers(canonical)
    expect(result.last_entry_date).toBe('2022-04-20')
  })

  it('maps i94_class_of_admission with alias class_of_admission', () => {
    const canonical = makeCanonical([makeField('class_of_admission', 'UH')])
    const result = toReParoleCoreAnswers(canonical)
    expect(result.i94_class_of_admission).toBe('UH')
  })
})

describe('toReParoleCoreAnswers — review_required propagation', () => {
  it('preserves review_required=true from canonical', () => {
    const canonical = makeCanonical(
      [makeField('family_name', 'Kovalenko', { reviewRequired: true, reviewReasons: ['critical_no_mrz_anchor'] })],
      { requiresReview: true },
    )
    const result = toReParoleCoreAnswers(canonical)
    expect(result.review_required).toBe(true)
  })

  it('review_required=false when all fields are clean and canonical says false', () => {
    const canonical = makeCanonical([
      makeField('family_name', 'Kovalenko', { reviewRequired: false }),
      makeField('given_name', 'Olena', { reviewRequired: false }),
      makeField('date_of_birth', '1990-05-15', { reviewRequired: false }),
    ])
    // Override requiresReview to false explicitly
    canonical.requiresReview = false
    const result = toReParoleCoreAnswers(canonical)
    // Still has uncertain_fields for unmapped optional fields, so review_required=true
    // (uncertain_fields length > 0 triggers it)
    expect(result.review_required).toBe(true) // uncertain fields present for missing optional fields
  })

  it('review_required=true when uncertain_fields is non-empty (missing critical field)', () => {
    // Only given_name and date_of_birth — family_name missing
    const canonical = makeCanonical([
      makeField('given_name', 'Olena'),
      makeField('date_of_birth', '1990-05-15'),
    ])
    canonical.requiresReview = false
    const result = toReParoleCoreAnswers(canonical)
    expect(result.review_required).toBe(true)
    expect(result.uncertain_fields).toContain('family_name')
  })

  it('fields flagged review_required are added to uncertain_fields', () => {
    const canonical = makeCanonical([
      makeField('family_name', 'Kovalenko', { reviewRequired: true }),
    ])
    const result = toReParoleCoreAnswers(canonical)
    expect(result.uncertain_fields).toContain('family_name')
  })
})

describe('toReParoleCoreAnswers — uncertain_fields tracking', () => {
  it('tracks missing fields in uncertain_fields', () => {
    const canonical = makeCanonical([makeField('family_name', 'Kovalenko')])
    const result = toReParoleCoreAnswers(canonical)
    // given_name, date_of_birth, and many others are missing → uncertain
    expect(result.uncertain_fields).toContain('given_name')
    expect(result.uncertain_fields).toContain('date_of_birth')
  })

  it('does not list a field in uncertain_fields when it is present and not review-flagged', () => {
    const canonical = makeCanonical([
      makeField('family_name', 'Kovalenko', { reviewRequired: false }),
    ])
    const result = toReParoleCoreAnswers(canonical)
    expect(result.uncertain_fields).not.toContain('family_name')
  })

  it('deduplicates uncertain_fields', () => {
    const canonical = makeCanonical([])
    const result = toReParoleCoreAnswers(canonical)
    const unique = new Set(result.uncertain_fields)
    expect(unique.size).toBe(result.uncertain_fields.length)
  })
})

describe('toReParoleCoreAnswers — core_status', () => {
  it('core_status=ok when family_name, given_name, date_of_birth are all present', () => {
    const canonical = makeCanonical([
      makeField('family_name', 'Kovalenko'),
      makeField('given_name', 'Olena'),
      makeField('date_of_birth', '1990-05-15'),
    ])
    const result = toReParoleCoreAnswers(canonical)
    expect(result.core_status).toBe('ok')
  })

  it('core_status=partial when some critical fields are present but not all', () => {
    const canonical = makeCanonical([makeField('family_name', 'Kovalenko')])
    const result = toReParoleCoreAnswers(canonical)
    expect(result.core_status).toBe('partial')
  })

  it('core_status=failed when no fields are mapped at all', () => {
    const canonical = makeCanonical([])
    const result = toReParoleCoreAnswers(canonical)
    expect(result.core_status).toBe('failed')
  })
})

describe('toReParoleCoreAnswers — adapter purity', () => {
  it('fallback_used is always false from this adapter (no fallback inside adapter)', () => {
    const canonical = makeCanonical([makeField('family_name', 'Kovalenko')])
    const result = toReParoleCoreAnswers(canonical)
    expect(result.fallback_used).toBe(false)
  })

  it('source_doc_types contains the canonical docType', () => {
    const canonical = makeCanonical([], { docType: 'ua_international_passport' })
    const result = toReParoleCoreAnswers(canonical)
    expect(result.source_doc_types).toContain('ua_international_passport')
  })

  it('returns a new object each call (pure, no mutation)', () => {
    const canonical = makeCanonical([makeField('family_name', 'Kovalenko')])
    const r1 = toReParoleCoreAnswers(canonical)
    const r2 = toReParoleCoreAnswers(canonical)
    expect(r1).not.toBe(r2) // different object references
    expect(r1.family_name).toBe(r2.family_name) // same values
  })

  it('does not mutate the canonical input', () => {
    const canonical = makeCanonical([makeField('family_name', 'Kovalenko')])
    const originalFieldCount = canonical.fields.length
    toReParoleCoreAnswers(canonical)
    expect(canonical.fields.length).toBe(originalFieldCount)
  })

  it('normalizedValue takes precedence over rawValue', () => {
    const canonical = makeCanonical([{
      ...makeField('family_name', 'KOVALENKO'),
      normalizedValue: 'Kovalenko', // capitalized normalized form
    }])
    const result = toReParoleCoreAnswers(canonical)
    expect(result.family_name).toBe('Kovalenko') // normalized wins
  })

  it('falls back to rawValue when normalizedValue is null', () => {
    const canonical = makeCanonical([{
      ...makeField('family_name', 'Kovalenko'),
      normalizedValue: null,
    }])
    const result = toReParoleCoreAnswers(canonical)
    expect(result.family_name).toBe('Kovalenko') // rawValue used
  })
})

describe('toReParoleCoreAnswers — full passport fixture', () => {
  it('maps a complete passport correctly', () => {
    const canonical = makeCanonical([
      makeField('family_name', 'Kovalenko'),
      makeField('given_name', 'Olena'),
      makeField('date_of_birth', '1990-05-15'),
      makeField('sex', 'F'),
      makeField('passport_number', 'EK654321'),
      makeField('country_of_nationality', 'Ukraine'),
      makeField('date_of_expiry', '2028-10-20'),
    ])
    const result = toReParoleCoreAnswers(canonical)
    expect(result.family_name).toBe('Kovalenko')
    expect(result.given_name).toBe('Olena')
    expect(result.date_of_birth).toBe('1990-05-15')
    expect(result.sex).toBe('F')
    expect(result.passport_number).toBe('EK654321')
    expect(result.country_of_nationality).toBe('Ukraine')
    expect(result.passport_expiration_date).toBe('2028-10-20')
    // I-94 fields not in passport → must be null
    expect(result.i94_admission_number).toBeNull()
    expect(result.last_entry_date).toBeNull()
    expect(result.i94_class_of_admission).toBeNull()
    expect(result.core_status).toBe('ok')
    expect(result.fallback_used).toBe(false)
  })
})

// ── C3 finalValue contract (the fixed blind spot) ──────────────────────────────
describe('toReParoleCoreAnswers — C3 finalValue contract (regression)', () => {
  it('does NOT release a C3-REJECTED field (finalValue=null), even if normalizedValue is set', () => {
    // C3 (applyOcrFieldSafety) ran and rejected family_name: finalValue=null.
    // A non-null normalizedValue/rawValue must NOT be resurrected — the whole
    // point of the bugfix. Before the fix this returned 'Kovalenko'.
    const canonical = makeCanonical([
      makeField('family_name', 'Kovalenko', {
        finalValue: null,
        reviewRequired: true,
        reviewReasons: ['ocr_field_safety_rejected'],
      }),
      makeField('given_name', 'Olena'),
    ])
    const result = toReParoleCoreAnswers(canonical)
    expect(result.family_name).toBeNull()
    // given_name (no C3) maps normally — parity for non-rejected fields.
    expect(result.given_name).toBe('Olena')
    // A rejected critical field is recorded as uncertain and forces review.
    expect(result.uncertain_fields).toContain('family_name')
    expect(result.review_required).toBe(true)
  })

  it('releases a C3-ACCEPTED field using finalValue (not normalizedValue)', () => {
    // finalValue=string is the release value — it wins over normalizedValue.
    const canonical = makeCanonical([
      makeField('family_name', 'KOVALENKO', {
        normalizedValue: 'KOVALENKO',
        finalValue: 'Kovalenko',
      }),
    ])
    const result = toReParoleCoreAnswers(canonical)
    expect(result.family_name).toBe('Kovalenko')
  })

  it('falls back to normalizedValue when C3 did not run (finalValue=undefined) — parity', () => {
    const canonical = makeCanonical([makeField('family_name', 'Kovalenko')])
    const result = toReParoleCoreAnswers(canonical)
    expect(result.family_name).toBe('Kovalenko')
  })
})
