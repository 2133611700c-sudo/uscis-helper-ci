/**
 * eadAdapter.test.ts — B4: CanonicalDocumentResult → EadCoreAnswers adapter.
 *
 * Verifies: toEadAnswers is a pure function (no I/O, no Gemini calls).
 * Tests: field mapping, source-gating, review_required propagation,
 * uncertain_fields tracking, core_status logic, invented_fields_count=0,
 * EAD/I-797/I-94/DL source gates enforced.
 *
 * Hard rules verified here:
 *  - passport-only → a_number=null, ead_category=null, i94=null, us_address=null
 *  - EAD source → a_number mapped, ead_category mapped
 *  - I-94 source → i94 fields mapped
 *  - DL source → us_address mapped
 *  - invented_fields_count always 0
 *
 * ONE_BRAIN_COMPLETE_CODE_READY: TPS (B1) + Translation (B2) + Re-Parole (B3) + EAD (B4).
 */
import { describe, it, expect } from 'vitest'
import { toEadAnswers } from '../eadAdapter'
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
  docType = 'ua_international_passport',
  overrides: Partial<CanonicalDocumentResult> = {},
): CanonicalDocumentResult {
  return {
    documentSessionId: 'test-ead-session',
    product: 'ead',
    docType,
    fields,
    hashes: { uploadHash: null, normalizedImageHash: null, canonicalResultHash: null },
    createdAt: '2026-06-03T00:00:00.000Z',
    requiresReview: fields.some((f) => f.reviewRequired),
    ...overrides,
  }
}

// ── Identity field mapping ────────────────────────────────────────────────────

describe('toEadAnswers — identity field mapping', () => {
  it('maps family_name from canonical', () => {
    const result = toEadAnswers(makeCanonical([makeField('family_name', 'Ivanenko')]))
    expect(result.family_name).toBe('Ivanenko')
  })

  it('maps given_name from canonical', () => {
    const result = toEadAnswers(makeCanonical([makeField('given_name', 'Ivan')]))
    expect(result.given_name).toBe('Ivan')
  })

  it('maps date_of_birth with dob alias', () => {
    const result = toEadAnswers(makeCanonical([makeField('dob', '1990-01-01')]))
    expect(result.date_of_birth).toBe('1990-01-01')
  })

  it('maps date_of_birth primary key when present', () => {
    const result = toEadAnswers(makeCanonical([makeField('date_of_birth', '1990-01-01')]))
    expect(result.date_of_birth).toBe('1990-01-01')
  })

  it('maps sex from canonical', () => {
    const result = toEadAnswers(makeCanonical([makeField('sex', 'M')]))
    expect(result.sex).toBe('M')
  })

  it('maps passport_number from canonical', () => {
    const result = toEadAnswers(makeCanonical([makeField('passport_number', 'AB123456')]))
    expect(result.passport_number).toBe('AB123456')
  })

  it('maps passport_expiry via date_of_expiry alias', () => {
    const result = toEadAnswers(makeCanonical([makeField('date_of_expiry', '2030-06-25')]))
    expect(result.passport_expiry).toBe('2030-06-25')
  })

  it('maps country_of_birth with place_of_birth alias', () => {
    const result = toEadAnswers(makeCanonical([makeField('place_of_birth', 'Ukraine')]))
    expect(result.country_of_birth).toBe('Ukraine')
  })

  it('maps country_of_nationality with nationality alias', () => {
    const result = toEadAnswers(makeCanonical([makeField('nationality', 'Ukrainian')]))
    expect(result.country_of_nationality).toBe('Ukrainian')
  })

  it('maps middle_name with patronymic alias', () => {
    const result = toEadAnswers(makeCanonical([makeField('patronymic', 'Viktorovych')]))
    expect(result.middle_name).toBe('Viktorovych')
  })
})

// ── Passport-only proof case (critical B4 requirement) ────────────────────────

describe('toEadAnswers — passport-only: source-gated fields are null', () => {
  const passportFields = [
    makeField('family_name', 'Ivanenko'),
    makeField('given_name', 'Ivan'),
    makeField('date_of_birth', '1990-01-01'),
    makeField('sex', 'M'),
    makeField('passport_number', 'AB123456'),
    makeField('date_of_expiry', '2030-06-25'),
  ]
  const passport = makeCanonical(passportFields, 'ua_international_passport')

  it('a_number is null when source is passport (not EAD/I-797)', () => {
    expect(toEadAnswers(passport).a_number).toBeNull()
  })

  it('ead_category is null when source is passport (not EAD/I-797)', () => {
    expect(toEadAnswers(passport).ead_category).toBeNull()
  })

  it('uscis_number is null when source is passport (not EAD/I-797)', () => {
    expect(toEadAnswers(passport).uscis_number).toBeNull()
  })

  it('card_number is null when source is passport (not EAD/I-797)', () => {
    expect(toEadAnswers(passport).card_number).toBeNull()
  })

  it('ead_validity_from is null when source is passport (not EAD/I-797)', () => {
    expect(toEadAnswers(passport).ead_validity_from).toBeNull()
  })

  it('ead_validity_to is null when source is passport (not EAD/I-797)', () => {
    expect(toEadAnswers(passport).ead_validity_to).toBeNull()
  })

  it('i94_admission_number is null when source is passport (not I-94)', () => {
    expect(toEadAnswers(passport).i94_admission_number).toBeNull()
  })

  it('i94_date_of_entry is null when source is passport (not I-94)', () => {
    expect(toEadAnswers(passport).i94_date_of_entry).toBeNull()
  })

  it('i94_class_of_admission is null when source is passport (not I-94)', () => {
    expect(toEadAnswers(passport).i94_class_of_admission).toBeNull()
  })

  it('i94_place_of_entry is null when source is passport (not I-94)', () => {
    expect(toEadAnswers(passport).i94_place_of_entry).toBeNull()
  })

  it('us_address is null when source is passport (not DL/manual)', () => {
    expect(toEadAnswers(passport).us_address).toBeNull()
  })

  it('invented_fields_count is always 0 (passport-only case)', () => {
    expect(toEadAnswers(passport).invented_fields_count).toBe(0)
  })

  it('core_status=ok when critical fields present', () => {
    expect(toEadAnswers(passport).core_status).toBe('ok')
  })

  it('family_name, given_name, date_of_birth are mapped from passport', () => {
    const result = toEadAnswers(passport)
    expect(result.family_name).toBe('Ivanenko')
    expect(result.given_name).toBe('Ivan')
    expect(result.date_of_birth).toBe('1990-01-01')
  })
})

// ── EAD card source gates ────────────────────────────────────────────────────

describe('toEadAnswers — EAD card source (us_ead)', () => {
  const eadFields = [
    makeField('family_name', 'Kovalenko'),
    makeField('given_name', 'Olena'),
    makeField('date_of_birth', '1990-05-15'),
    makeField('a_number', 'A123456789'),
    makeField('ead_category', 'c11'),
    makeField('card_number', 'MSC2112345678'),
    makeField('ead_validity_from', '2025-01-01'),
    makeField('ead_validity_to', '2025-12-31'),
  ]
  const ead = makeCanonical(eadFields, 'us_ead')

  it('a_number is mapped when source is us_ead', () => {
    expect(toEadAnswers(ead).a_number).toBe('A123456789')
  })

  it('ead_category is mapped when source is us_ead', () => {
    expect(toEadAnswers(ead).ead_category).toBe('c11')
  })

  it('card_number is mapped when source is us_ead', () => {
    expect(toEadAnswers(ead).card_number).toBe('MSC2112345678')
  })

  it('ead_validity_from is mapped when source is us_ead', () => {
    expect(toEadAnswers(ead).ead_validity_from).toBe('2025-01-01')
  })

  it('ead_validity_to is mapped when source is us_ead', () => {
    expect(toEadAnswers(ead).ead_validity_to).toBe('2025-12-31')
  })

  it('i94 fields are null even for EAD source (not I-94)', () => {
    const result = toEadAnswers(ead)
    expect(result.i94_admission_number).toBeNull()
    expect(result.i94_date_of_entry).toBeNull()
  })

  it('invented_fields_count is 0 for EAD source', () => {
    expect(toEadAnswers(ead).invented_fields_count).toBe(0)
  })
})

// ── I-94 source gates ────────────────────────────────────────────────────────

describe('toEadAnswers — I-94 source (us_i94)', () => {
  const i94Fields = [
    makeField('family_name', 'Bondar'),
    makeField('given_name', 'Mykola'),
    makeField('date_of_birth', '1988-11-20'),
    makeField('i94_admission_number', '12345678901'),
    makeField('i94_date_of_entry', '2022-04-20'),
    makeField('i94_class_of_admission', 'UH'),
    makeField('i94_place_of_entry', 'JFK'),
  ]
  const i94 = makeCanonical(i94Fields, 'us_i94')

  it('i94_admission_number is mapped when source is us_i94', () => {
    expect(toEadAnswers(i94).i94_admission_number).toBe('12345678901')
  })

  it('i94_date_of_entry is mapped when source is us_i94', () => {
    expect(toEadAnswers(i94).i94_date_of_entry).toBe('2022-04-20')
  })

  it('i94_class_of_admission is mapped when source is us_i94', () => {
    expect(toEadAnswers(i94).i94_class_of_admission).toBe('UH')
  })

  it('i94_place_of_entry is mapped when source is us_i94', () => {
    expect(toEadAnswers(i94).i94_place_of_entry).toBe('JFK')
  })

  it('a_number is null even for I-94 source (not EAD/I-797)', () => {
    expect(toEadAnswers(i94).a_number).toBeNull()
  })

  it('invented_fields_count is 0 for I-94 source', () => {
    expect(toEadAnswers(i94).invented_fields_count).toBe(0)
  })
})

// ── DL source gate for address ────────────────────────────────────────────────

describe('toEadAnswers — DL source gate for us_address', () => {
  it('us_address is mapped when source is drivers_license', () => {
    const dlFields = [
      makeField('family_name', 'Petrenko'),
      makeField('given_name', 'Ivan'),
      makeField('date_of_birth', '1985-07-15'),
      makeField('us_address', '123 Main St, Chicago, IL 60601'),
    ]
    const result = toEadAnswers(makeCanonical(dlFields, 'drivers_license'))
    expect(result.us_address).toBe('123 Main St, Chicago, IL 60601')
  })

  it('us_address is null when source is passport (not DL)', () => {
    const passportFields = [
      makeField('family_name', 'Petrenko'),
      makeField('us_address', '123 Main St'),
    ]
    // Even if the canonical has us_address field, gate must block it for passport
    const result = toEadAnswers(makeCanonical(passportFields, 'ua_international_passport'))
    expect(result.us_address).toBeNull()
  })

  it('us_address is null when source is I-94 (not DL)', () => {
    const i94Fields = [
      makeField('family_name', 'Petrenko'),
      makeField('us_address', '456 Oak Ave'),
    ]
    const result = toEadAnswers(makeCanonical(i94Fields, 'us_i94'))
    expect(result.us_address).toBeNull()
  })
})

// ── review_required propagation ───────────────────────────────────────────────

describe('toEadAnswers — review_required propagation', () => {
  it('preserves review_required=true from canonical', () => {
    const canonical = makeCanonical(
      [makeField('family_name', 'Kovalenko', { reviewRequired: true, reviewReasons: ['critical_no_mrz_anchor'] })],
      'ua_international_passport',
      { requiresReview: true },
    )
    expect(toEadAnswers(canonical).review_required).toBe(true)
  })

  it('review_required=true when uncertain_fields is non-empty', () => {
    // Only given_name and date_of_birth — family_name missing
    const canonical = makeCanonical([
      makeField('given_name', 'Olena'),
      makeField('date_of_birth', '1990-05-15'),
    ])
    canonical.requiresReview = false
    const result = toEadAnswers(canonical)
    expect(result.review_required).toBe(true)
    expect(result.uncertain_fields).toContain('family_name')
  })

  it('fields flagged reviewRequired are added to uncertain_fields', () => {
    const canonical = makeCanonical([
      makeField('family_name', 'Kovalenko', { reviewRequired: true }),
    ])
    const result = toEadAnswers(canonical)
    expect(result.uncertain_fields).toContain('family_name')
  })
})

// ── uncertain_fields tracking ─────────────────────────────────────────────────

describe('toEadAnswers — uncertain_fields tracking', () => {
  it('tracks missing fields in uncertain_fields', () => {
    const canonical = makeCanonical([makeField('family_name', 'Kovalenko')])
    const result = toEadAnswers(canonical)
    expect(result.uncertain_fields).toContain('given_name')
    expect(result.uncertain_fields).toContain('date_of_birth')
  })

  it('does not list a field in uncertain_fields when present and not flagged', () => {
    const canonical = makeCanonical([makeField('family_name', 'Kovalenko', { reviewRequired: false })])
    const result = toEadAnswers(canonical)
    expect(result.uncertain_fields).not.toContain('family_name')
  })

  it('deduplicates uncertain_fields', () => {
    const canonical = makeCanonical([])
    const result = toEadAnswers(canonical)
    const unique = new Set(result.uncertain_fields)
    expect(unique.size).toBe(result.uncertain_fields.length)
  })
})

// ── core_status ───────────────────────────────────────────────────────────────

describe('toEadAnswers — core_status', () => {
  it('core_status=ok when family_name, given_name, date_of_birth are all present', () => {
    const canonical = makeCanonical([
      makeField('family_name', 'Kovalenko'),
      makeField('given_name', 'Olena'),
      makeField('date_of_birth', '1990-05-15'),
    ])
    expect(toEadAnswers(canonical).core_status).toBe('ok')
  })

  it('core_status=partial when some critical fields are present but not all', () => {
    const canonical = makeCanonical([makeField('family_name', 'Kovalenko')])
    expect(toEadAnswers(canonical).core_status).toBe('partial')
  })

  it('core_status=failed when no fields are mapped at all', () => {
    const canonical = makeCanonical([])
    expect(toEadAnswers(canonical).core_status).toBe('failed')
  })
})

// ── Adapter purity ────────────────────────────────────────────────────────────

describe('toEadAnswers — adapter purity', () => {
  it('invented_fields_count is always 0', () => {
    // All cases: passport, EAD, I-94, empty
    expect(toEadAnswers(makeCanonical([makeField('family_name', 'Test')], 'ua_international_passport')).invented_fields_count).toBe(0)
    expect(toEadAnswers(makeCanonical([makeField('a_number', 'A123')], 'us_ead')).invented_fields_count).toBe(0)
    expect(toEadAnswers(makeCanonical([makeField('i94_admission_number', '123')], 'us_i94')).invented_fields_count).toBe(0)
    expect(toEadAnswers(makeCanonical([])).invented_fields_count).toBe(0)
  })

  it('fallback_used is always false from this adapter', () => {
    const canonical = makeCanonical([makeField('family_name', 'Kovalenko')])
    expect(toEadAnswers(canonical).fallback_used).toBe(false)
  })

  it('source_doc_types contains the canonical docType', () => {
    const canonical = makeCanonical([], 'ua_international_passport')
    expect(toEadAnswers(canonical).source_doc_types).toContain('ua_international_passport')
  })

  it('returns a new object each call (pure, no mutation)', () => {
    const canonical = makeCanonical([makeField('family_name', 'Kovalenko')])
    const r1 = toEadAnswers(canonical)
    const r2 = toEadAnswers(canonical)
    expect(r1).not.toBe(r2)
    expect(r1.family_name).toBe(r2.family_name)
  })

  it('does not mutate the canonical input', () => {
    const canonical = makeCanonical([makeField('family_name', 'Kovalenko')])
    const originalFieldCount = canonical.fields.length
    toEadAnswers(canonical)
    expect(canonical.fields.length).toBe(originalFieldCount)
  })

  it('normalizedValue takes precedence over rawValue', () => {
    const canonical = makeCanonical([{
      ...makeField('family_name', 'KOVALENKO'),
      normalizedValue: 'Kovalenko',
    }])
    expect(toEadAnswers(canonical).family_name).toBe('Kovalenko')
  })

  it('falls back to rawValue when normalizedValue is null', () => {
    const canonical = makeCanonical([{
      ...makeField('family_name', 'Kovalenko'),
      normalizedValue: null,
    }])
    expect(toEadAnswers(canonical).family_name).toBe('Kovalenko')
  })
})

// ── Source type recognition ───────────────────────────────────────────────────

describe('toEadAnswers — source type recognition (gate variants)', () => {
  const aField = makeField('a_number', 'A987654321')
  const identity = [makeField('family_name', 'Test'), makeField('given_name', 'User'), makeField('date_of_birth', '2000-01-01')]

  it('recognizes i766 as EAD source', () => {
    const result = toEadAnswers(makeCanonical([...identity, aField], 'i766'))
    expect(result.a_number).toBe('A987654321')
  })

  it('recognizes i797 as EAD source', () => {
    const result = toEadAnswers(makeCanonical([...identity, aField], 'i797'))
    expect(result.a_number).toBe('A987654321')
  })

  it('recognizes uscis_notice as EAD source', () => {
    const result = toEadAnswers(makeCanonical([...identity, aField], 'uscis_notice'))
    expect(result.a_number).toBe('A987654321')
  })

  it('recognizes dl as DL source for address', () => {
    const addrField = makeField('us_address', '789 Pine St, LA, CA 90001')
    const result = toEadAnswers(makeCanonical([...identity, addrField], 'dl'))
    expect(result.us_address).toBe('789 Pine St, LA, CA 90001')
  })

  it('rejects i94 for EAD fields (wrong gate)', () => {
    const result = toEadAnswers(makeCanonical([...identity, aField], 'us_i94'))
    expect(result.a_number).toBeNull()
  })
})

// ── Full fixture: passport ────────────────────────────────────────────────────

describe('toEadAnswers — full passport fixture (B4 proof)', () => {
  it('maps a complete passport and leaves all gated fields null', () => {
    const canonical = makeCanonical([
      makeField('family_name', 'Ivanenko'),
      makeField('given_name', 'Ivan'),
      makeField('date_of_birth', '1990-01-01'),
      makeField('sex', 'M'),
      makeField('passport_number', 'AB123456'),
      makeField('date_of_expiry', '2030-06-25'),
      makeField('country_of_nationality', 'Ukraine'),
    ], 'ua_international_passport')

    const result = toEadAnswers(canonical)

    // Identity mapped
    expect(result.family_name).toBe('Ivanenko')
    expect(result.given_name).toBe('Ivan')
    expect(result.date_of_birth).toBe('1990-01-01')
    expect(result.sex).toBe('M')
    expect(result.passport_number).toBe('AB123456')
    expect(result.passport_expiry).toBe('2030-06-25')
    expect(result.country_of_nationality).toBe('Ukraine')

    // EAD-gated → null (source is passport)
    expect(result.a_number).toBeNull()
    expect(result.ead_category).toBeNull()
    expect(result.uscis_number).toBeNull()
    expect(result.card_number).toBeNull()
    expect(result.ead_validity_from).toBeNull()
    expect(result.ead_validity_to).toBeNull()

    // I-94-gated → null (source is passport)
    expect(result.i94_admission_number).toBeNull()
    expect(result.i94_date_of_entry).toBeNull()
    expect(result.i94_class_of_admission).toBeNull()
    expect(result.i94_place_of_entry).toBeNull()

    // DL-gated → null (source is passport)
    expect(result.us_address).toBeNull()

    // Quality
    expect(result.invented_fields_count).toBe(0)
    expect(result.fallback_used).toBe(false)
    expect(result.core_status).toBe('ok')
  })
})
