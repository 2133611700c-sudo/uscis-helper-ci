/**
 * Birth Certificate Validators Tests
 *
 * Unit tests for all 11 birth certificate validators.
 * Uses mock ExtractedField objects — no live OCR, no real documents.
 *
 * Fixture labels are clearly OCR MOCK — not live OCR proof.
 */
import { describe, it, expect } from 'vitest'
import {
  validateCertNumNotActRecord,
  validateActRecordDateLock,
  validateDateOfIssueLock,
  validateParentNamesNotSwapped,
  validateNominativeCase,
  validateNameMixedScript,
  validateCivilRegistryGlossary,
  validateSourceEvidence,
  validateBilingualLayer,
  validateForbiddenMislabels,
  normalizeBirthCertDate,
} from '../birthCertificateValidators'
import type { ExtractedField } from '../../types'

// ── Mock factory ──────────────────────────────────────────────────────────────

function mockField(overrides: Partial<ExtractedField> & { field: string }): ExtractedField {
  return {
    source_label: 'mock_label',
    bbox: [0, 0, 1, 1],
    language_layer: 'uk',
    raw_value: 'test',
    normalized_value: 'test',
    ocr_ids: ['w_001'],
    source_zone: 'main_block',
    confidence: 0.95,
    review_required: false,
    evidence_type: 'ocr_bbox',
    bbox_status: 'exact',
    ...overrides,
  }
}

// ── 1. validateCertNumNotActRecord ────────────────────────────────────────────

describe('validateCertNumNotActRecord', () => {
  it('passes when values are different and zones differ', () => {
    const cert = mockField({
      field: 'certificate_number', raw_value: '123456',
      source_zone: 'cert_header_block', ocr_ids: ['w_010', 'w_011'],
    })
    const act = mockField({
      field: 'act_record_number', raw_value: '789',
      source_zone: 'act_record_block', ocr_ids: ['w_020', 'w_021'],
    })
    const result = validateCertNumNotActRecord(cert, act)
    expect(result.passed).toBe(true)
    expect(result.review_required).toBe(false)
  })

  it('fails and flags review_required when values are identical', () => {
    const cert = mockField({ field: 'certificate_number', raw_value: '123456', source_zone: 'cert_header_block' })
    const act = mockField({ field: 'act_record_number', raw_value: '123456', source_zone: 'act_record_block' })
    const result = validateCertNumNotActRecord(cert, act)
    expect(result.passed).toBe(false)
    expect(result.review_required).toBe(true)
    expect(result.reason).toBe('certificate_number_equals_act_record_number')
  })

  it('fails when both fields share the same source zone', () => {
    const cert = mockField({ field: 'certificate_number', raw_value: '111', source_zone: 'ambiguous_block' })
    const act = mockField({ field: 'act_record_number', raw_value: '222', source_zone: 'ambiguous_block' })
    const result = validateCertNumNotActRecord(cert, act)
    expect(result.passed).toBe(false)
    expect(result.review_required).toBe(true)
    expect(result.reason).toBe('certificate_and_act_record_same_source_zone')
  })

  it('fails when fields share OCR IDs', () => {
    // Use distinct zones so the zone check doesn't fire first
    const cert = mockField({
      field: 'certificate_number', raw_value: '111',
      source_zone: 'cert_header_block', ocr_ids: ['w_010', 'w_011'],
    })
    const act = mockField({
      field: 'act_record_number', raw_value: '222',
      source_zone: 'act_record_block', ocr_ids: ['w_011', 'w_012'],
    })
    const result = validateCertNumNotActRecord(cert, act)
    expect(result.passed).toBe(false)
    expect(result.review_required).toBe(true)
    expect(result.reason).toBe('certificate_and_act_record_share_ocr_ids')
  })

  it('passes when either field is undefined', () => {
    expect(validateCertNumNotActRecord(undefined, undefined).passed).toBe(true)
    expect(validateCertNumNotActRecord(mockField({ field: 'certificate_number' }), undefined).passed).toBe(true)
  })
})

// ── 2. validateActRecordDateLock ──────────────────────────────────────────────

describe('validateActRecordDateLock', () => {
  it('passes when act_record_date is from act_record_block', () => {
    const actDate = mockField({ field: 'act_record_date', raw_value: '15 лютого 1985', source_zone: 'act_record_block' })
    const dob = mockField({ field: 'date_of_birth', raw_value: '10 березня 1984', source_zone: 'birth_block' })
    const result = validateActRecordDateLock(actDate, [dob])
    expect(result.passed).toBe(true)
    expect(result.review_required).toBe(false)
  })

  it('fails when act_record_date is from birth_block (cross-zone error)', () => {
    const actDate = mockField({ field: 'act_record_date', raw_value: '15 лютого 1985', source_zone: 'birth_block' })
    const result = validateActRecordDateLock(actDate, [])
    expect(result.passed).toBe(false)
    expect(result.review_required).toBe(true)
    expect(result.reason).toBe('act_record_date_from_wrong_zone')
  })

  it('fails when act_record_date equals date_of_birth raw value', () => {
    const actDate = mockField({ field: 'act_record_date', raw_value: '10 березня 1984', source_zone: 'act_record_block' })
    const dob = mockField({ field: 'date_of_birth', raw_value: '10 березня 1984', source_zone: 'birth_block' })
    const result = validateActRecordDateLock(actDate, [dob])
    expect(result.passed).toBe(false)
    expect(result.review_required).toBe(true)
    expect(result.reason).toBe('act_record_date_equals_other_date_field')
  })

  it('fails when act_record_date field is missing', () => {
    const result = validateActRecordDateLock(undefined, [])
    expect(result.passed).toBe(false)
    expect(result.review_required).toBe(true)
    expect(result.reason).toBe('act_record_date_missing')
  })
})

// ── 3. validateDateOfIssueLock ────────────────────────────────────────────────

describe('validateDateOfIssueLock', () => {
  it('passes when date_of_issue from issuance_block', () => {
    const f = mockField({ field: 'date_of_issue', source_zone: 'issuance_block' })
    expect(validateDateOfIssueLock(f, []).passed).toBe(true)
  })

  it('fails when date_of_issue from unrecognized zone', () => {
    const f = mockField({ field: 'date_of_issue', source_zone: 'birth_block' })
    const result = validateDateOfIssueLock(f, [])
    expect(result.passed).toBe(false)
    expect(result.review_required).toBe(true)
  })

  it('fails when missing', () => {
    const result = validateDateOfIssueLock(undefined, [])
    expect(result.passed).toBe(false)
    expect(result.review_required).toBe(true)
  })
})

// ── 4. validateParentNamesNotSwapped ─────────────────────────────────────────

describe('validateParentNamesNotSwapped', () => {
  it('passes when father and mother from correct zones', () => {
    const father = mockField({ field: 'father_full_name', source_zone: 'father_block' })
    const mother = mockField({ field: 'mother_full_name', source_zone: 'mother_block' })
    const result = validateParentNamesNotSwapped(father, mother)
    expect(result.passed).toBe(true)
    expect(result.review_required).toBe(false)
  })

  it('flags review_required when father is in mother zone', () => {
    const father = mockField({ field: 'father_full_name', source_zone: 'mother_block' })
    const mother = mockField({ field: 'mother_full_name', source_zone: 'mother_block' })
    const result = validateParentNamesNotSwapped(father, mother)
    expect(result.review_required).toBe(true)
    expect(result.reason).toContain('wrong_parent_zone')
  })

  it('passes when both fields are undefined', () => {
    const result = validateParentNamesNotSwapped(undefined, undefined)
    expect(result.passed).toBe(true)
  })
})

// ── 5. validateNominativeCase ─────────────────────────────────────────────────

describe('validateNominativeCase', () => {
  it('flags review_required when name is in genitive -ка ending (ченка → ченко)', () => {
    const f = mockField({ field: 'father_full_name', raw_value: 'Петренка Іван' })
    const result = validateNominativeCase(f, 'father_full_name')
    expect(result.review_required).toBe(true)
    expect(result.reason).toBe('nominative_case_restored')
    expect(result.candidate_value).toBeDefined()
  })

  it('passes without flag when name is already nominative', () => {
    const f = mockField({ field: 'child_surname', raw_value: 'Коваль' })
    const result = validateNominativeCase(f, 'child_surname')
    expect(result.review_required).toBe(false)
  })

  it('passes when field is undefined', () => {
    expect(validateNominativeCase(undefined, 'child_surname').passed).toBe(true)
  })
})

// ── 6. validateNameMixedScript ────────────────────────────────────────────────

describe('validateNameMixedScript', () => {
  it('flags review_required when Latin lookalike present in Cyrillic name', () => {
    // 'o' is Latin lookalike for Cyrillic 'о'
    const f = mockField({ field: 'child_surname', raw_value: 'Kоваль' })
    const result = validateNameMixedScript(f, 'child_surname')
    expect(result.passed).toBe(false)
    expect(result.review_required).toBe(true)
    expect(result.reason).toBe('name_mixed_script')
  })

  it('passes for pure Cyrillic name', () => {
    const f = mockField({ field: 'child_surname', raw_value: 'Коваль' })
    expect(validateNameMixedScript(f, 'child_surname').passed).toBe(true)
  })

  it('passes when field is undefined', () => {
    expect(validateNameMixedScript(undefined, 'child_surname').passed).toBe(true)
  })
})

// ── 7. validateCivilRegistryGlossary ─────────────────────────────────────────

describe('validateCivilRegistryGlossary', () => {
  it('recognizes ЗАГС and does not flag review_required', () => {
    const f = mockField({ field: 'issuing_authority', raw_value: 'ЗАГС м. Київ' })
    const result = validateCivilRegistryGlossary(f)
    expect(result.review_required).toBe(false)
    expect(result.resolved_en).toContain('Civil Registry')
  })

  it('recognizes РАЦС and does not flag review_required', () => {
    const f = mockField({ field: 'issuing_authority', raw_value: 'РАЦС Харківського району' })
    const result = validateCivilRegistryGlossary(f)
    expect(result.review_required).toBe(false)
  })

  it('recognizes ДРАЦС and does not flag review_required', () => {
    const f = mockField({ field: 'issuing_authority', raw_value: 'ДРАЦС Дніпровського р-ну' })
    const result = validateCivilRegistryGlossary(f)
    expect(result.review_required).toBe(false)
  })

  it('flags unknown civil registry abbreviation', () => {
    const f = mockField({ field: 'issuing_authority', raw_value: 'РАЦКО м. Полтава' })
    const result = validateCivilRegistryGlossary(f)
    expect(result.review_required).toBe(true)
    expect(result.reason).toBe('civil_registry_abbreviation_not_verified')
  })

  it('does not silently modernize ЗАГС to ДРАЦС — flags conflict if both present', () => {
    const f = mockField({ field: 'issuing_authority', raw_value: 'ЗАГС / ДРАЦС' })
    const result = validateCivilRegistryGlossary(f)
    expect(result.review_required).toBe(true)
    expect(result.reason).toBe('civil_registry_modernization_conflict')
  })

  it('flags review_required when field is missing', () => {
    const result = validateCivilRegistryGlossary(undefined)
    expect(result.review_required).toBe(true)
    expect(result.reason).toBe('issuing_authority_missing')
  })
})

// ── 8. validateSourceEvidence ─────────────────────────────────────────────────

describe('validateSourceEvidence', () => {
  it('passes when ocr_ids present', () => {
    const f = mockField({ field: 'child_surname', ocr_ids: ['w_010'], bbox_status: 'exact' })
    expect(validateSourceEvidence(f).passed).toBe(true)
  })

  it('flags review_required when no ocr_ids and bbox_status missing', () => {
    const f = mockField({ field: 'child_surname', ocr_ids: [], bbox_status: 'missing' })
    const result = validateSourceEvidence(f)
    expect(result.passed).toBe(false)
    expect(result.review_required).toBe(true)
    expect(result.reason).toBe('source_evidence_missing')
  })
})

// ── 9. validateBilingualLayer ─────────────────────────────────────────────────

describe('validateBilingualLayer', () => {
  it('passes without flag when Ukrainian source used', () => {
    const f = mockField({ field: 'date_of_birth' })
    expect(validateBilingualLayer(f, false).review_required).toBe(false)
  })

  it('flags review_required when Russian fallback used', () => {
    const f = mockField({ field: 'date_of_birth' })
    const result = validateBilingualLayer(f, true)
    expect(result.review_required).toBe(true)
    expect(result.reason).toBe('russian_fallback_used')
  })
})

// ── 10. validateForbiddenMislabels ────────────────────────────────────────────

describe('validateForbiddenMislabels', () => {
  it('passes for clean labels', () => {
    const fields = [
      mockField({ field: 'certificate_number', raw_value: '123456' }),
      mockField({ field: 'act_record_number', raw_value: '789' }),
    ]
    const labels = {
      child_patronymic: "Child's Patronymic",
      act_record_number: 'Act Record Number',
    }
    const result = validateForbiddenMislabels(fields, labels)
    expect(result.valid).toBe(true)
    expect(result.violations.length).toBe(0)
  })

  it('fails when child_patronymic labeled as Middle Name', () => {
    const fields: ExtractedField[] = []
    const labels = { child_patronymic: 'Middle Name' }
    const result = validateForbiddenMislabels(fields, labels)
    expect(result.valid).toBe(false)
    expect(result.violations.some(v => v.includes('Middle Name'))).toBe(true)
  })

  it('fails when act_record_number labeled as certificate number', () => {
    const fields: ExtractedField[] = []
    const labels = { act_record_number: 'Certificate Number' }
    const result = validateForbiddenMislabels(fields, labels)
    expect(result.valid).toBe(false)
    expect(result.violations.some(v => v.includes('Certificate Number'))).toBe(true)
  })

  it('fails when certificate_number and act_record_number have same value', () => {
    const fields = [
      mockField({ field: 'certificate_number', raw_value: '999' }),
      mockField({ field: 'act_record_number', raw_value: '999' }),
    ]
    const result = validateForbiddenMislabels(fields, {})
    expect(result.valid).toBe(false)
  })
})

// ── 11. normalizeBirthCertDate ────────────────────────────────────────────────

describe('normalizeBirthCertDate — date normalization', () => {
  it('normalizes Ukrainian date: 01 січня 1990 → 01 January 1990', () => {
    const result = normalizeBirthCertDate('01 січня 1990')
    expect(result.normalized).toBe('01 January 1990')
    expect(result.review_required).toBe(false)
  })

  it('normalizes Russian date with review_required: 01 января 1990 → 01 January 1990 + review', () => {
    const result = normalizeBirthCertDate('01 января 1990')
    expect(result.normalized).toBe('01 January 1990')
    expect(result.review_required).toBe(true)
    expect(result.reason).toBe('russian_month_fallback')
    expect(result.used_fallback_language).toBe('russian')
  })

  it('normalizes Ukrainian February: 10 лютого 2003', () => {
    const result = normalizeBirthCertDate('10 лютого 2003')
    expect(result.normalized).toBe('10 February 2003')
    expect(result.review_required).toBe(false)
  })

  it('лютого ≠ жовтня (February ≠ October)', () => {
    const feb = normalizeBirthCertDate('10 лютого 2003')
    const oct = normalizeBirthCertDate('10 жовтня 2003')
    expect(feb.normalized).not.toBe(oct.normalized)
    expect(feb.normalized).toContain('February')
    expect(oct.normalized).toContain('October')
  })

  it('февраля ≠ октября (Russian Feb ≠ Oct)', () => {
    const feb = normalizeBirthCertDate('10 февраля 2003')
    const oct = normalizeBirthCertDate('10 октября 2003')
    expect(feb.normalized).toContain('February')
    expect(oct.normalized).toContain('October')
    expect(feb.normalized).not.toBe(oct.normalized)
  })

  it('returns review_required for spelled-out date', () => {
    const result = normalizeBirthCertDate("двадцять п'ятого червня тисяча дев'ятсот вісімдесят шостого року")
    expect(result.normalized).toBeNull()
    expect(result.review_required).toBe(true)
    expect(result.reason).toBe('date_format_not_parseable')
  })

  it('returns review_required for empty string', () => {
    const result = normalizeBirthCertDate('')
    expect(result.normalized).toBeNull()
    expect(result.review_required).toBe(true)
  })

  it('returns review_required for unrecognized month', () => {
    const result = normalizeBirthCertDate('10 місяць 2003')
    expect(result.normalized).toBeNull()
    expect(result.review_required).toBe(true)
    expect(result.reason).toBe('month_name_not_recognized')
  })
})
