/**
 * Marriage Certificate Validators Tests — Messenginfo v6.0
 *
 * Uses mock ExtractedField objects — no live OCR, no real documents.
 * Fixture labels are clearly OCR MOCK — not live OCR proof.
 */
import { describe, it, expect } from 'vitest'
import {
  validateMarriageCertNumNotActRecord,
  validateActRecordNumberRequired,
  validateMarriageActRecordDateLock,
  validateDateOfMarriageLock,
  validateMarriageDateOfIssueLock,
  validateSpouseOrderPreserved,
  validateBeforeAfterSurnameNotSwapped,
  validateSpouseNamesNotSwapped,
  validateMarriageNominativeCase,
  validateMarriageCivilRegistryGlossary,
  validateMarriageSourceEvidence,
  validateMarriageBilingualLayer,
  validateForbiddenMarriageMislabels,
  normalizeMarriageCertDate,
} from '../marriageCertificateValidators'
import type { ExtractedField } from '../../types'

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

// ── 1. certificate_number_not_act_record_number ───────────────────────────────

describe('validateMarriageCertNumNotActRecord', () => {
  it('passes when values are different and zones differ', () => {
    const cert = mockField({ field: 'certificate_number', raw_value: 'І-КВ 123456', source_zone: 'cert_header_block', ocr_ids: ['w_010', 'w_011'] })
    const act = mockField({ field: 'act_record_number', raw_value: '789', source_zone: 'act_record_block', ocr_ids: ['w_020', 'w_021'] })
    const result = validateMarriageCertNumNotActRecord(cert, act)
    expect(result.passed).toBe(true)
    expect(result.review_required).toBe(false)
  })

  it('fails when raw values are identical', () => {
    const cert = mockField({ field: 'certificate_number', raw_value: '789', source_zone: 'cert_header_block', ocr_ids: ['w_010'] })
    const act = mockField({ field: 'act_record_number', raw_value: '789', source_zone: 'act_record_block', ocr_ids: ['w_020'] })
    const result = validateMarriageCertNumNotActRecord(cert, act)
    expect(result.passed).toBe(false)
    expect(result.review_required).toBe(true)
    expect(result.reason).toBe('certificate_number_equals_act_record_number')
  })

  it('fails when fields share same source_zone', () => {
    const cert = mockField({ field: 'certificate_number', raw_value: 'X1', source_zone: 'main_block', ocr_ids: ['w_010'] })
    const act = mockField({ field: 'act_record_number', raw_value: 'Y2', source_zone: 'main_block', ocr_ids: ['w_020'] })
    const result = validateMarriageCertNumNotActRecord(cert, act)
    expect(result.passed).toBe(false)
    expect(result.reason).toBe('certificate_and_act_record_same_zone')
  })

  it('fails when fields share OCR IDs', () => {
    const cert = mockField({ field: 'certificate_number', raw_value: 'A', source_zone: 'cert_block', ocr_ids: ['w_100', 'w_101'] })
    const act = mockField({ field: 'act_record_number', raw_value: 'B', source_zone: 'act_block', ocr_ids: ['w_101', 'w_102'] })
    const result = validateMarriageCertNumNotActRecord(cert, act)
    expect(result.passed).toBe(false)
    expect(result.reason).toBe('certificate_and_act_record_share_ocr_ids')
  })

  it('passes when either field is undefined', () => {
    expect(validateMarriageCertNumNotActRecord(undefined, undefined).passed).toBe(true)
  })
})

// ── 2. act_record_number_required ────────────────────────────────────────────

describe('validateActRecordNumberRequired', () => {
  it('passes when act_record_number has a value', () => {
    const f = mockField({ field: 'act_record_number', raw_value: '42' })
    expect(validateActRecordNumberRequired(f).passed).toBe(true)
  })

  it('fails when act_record_number is empty', () => {
    const f = mockField({ field: 'act_record_number', raw_value: '' })
    const result = validateActRecordNumberRequired(f)
    expect(result.passed).toBe(false)
    expect(result.reason).toBe('act_record_number_missing')
  })

  it('fails when act_record_number is undefined', () => {
    const result = validateActRecordNumberRequired(undefined)
    expect(result.passed).toBe(false)
  })
})

// ── 3. act_record_date_lock ───────────────────────────────────────────────────

describe('validateMarriageActRecordDateLock', () => {
  it('passes when act_record_date is in allowed zone', () => {
    const f = mockField({ field: 'act_record_date', source_zone: 'act_record_block', ocr_ids: ['w_010'] })
    expect(validateMarriageActRecordDateLock(f, undefined, undefined).passed).toBe(true)
  })

  it('fails when act_record_date is in a disallowed zone', () => {
    const f = mockField({ field: 'act_record_date', source_zone: 'marriage_block', ocr_ids: ['w_010'] })
    const result = validateMarriageActRecordDateLock(f, undefined, undefined)
    expect(result.passed).toBe(false)
    expect(result.reason).toBe('act_record_date_wrong_zone')
  })

  it('fails when act_record_date shares OCR IDs with date_of_marriage', () => {
    const actDate = mockField({ field: 'act_record_date', source_zone: 'act_record_block', ocr_ids: ['w_010', 'w_011'] })
    const marriage = mockField({ field: 'date_of_marriage', source_zone: 'marriage_block', ocr_ids: ['w_011', 'w_012'] })
    const result = validateMarriageActRecordDateLock(actDate, marriage, undefined)
    expect(result.passed).toBe(false)
    expect(result.reason).toBe('act_record_date_shares_tokens_with_date_of_marriage')
  })

  it('passes when undefined', () => {
    expect(validateMarriageActRecordDateLock(undefined, undefined, undefined).passed).toBe(true)
  })
})

// ── 4. date_of_marriage_lock ──────────────────────────────────────────────────

describe('validateDateOfMarriageLock', () => {
  it('passes when date_of_marriage is in allowed zone', () => {
    const f = mockField({ field: 'date_of_marriage', source_zone: 'marriage_block', ocr_ids: ['w_010'] })
    expect(validateDateOfMarriageLock(f, []).passed).toBe(true)
  })

  it('fails when date_of_marriage is in disallowed zone', () => {
    const f = mockField({ field: 'date_of_marriage', source_zone: 'issuance_block', ocr_ids: ['w_010'] })
    const result = validateDateOfMarriageLock(f, [])
    expect(result.passed).toBe(false)
    expect(result.reason).toBe('date_of_marriage_wrong_zone')
  })

  it('fails when shares OCR IDs with act_record_date', () => {
    const dom = mockField({ field: 'date_of_marriage', source_zone: 'marriage_block', ocr_ids: ['w_010', 'w_011'] })
    const actDate = mockField({ field: 'act_record_date', source_zone: 'act_record_block', ocr_ids: ['w_011'] })
    const result = validateDateOfMarriageLock(dom, [actDate])
    expect(result.passed).toBe(false)
    expect(result.reason).toContain('date_of_marriage_shares_tokens_with_act_record_date')
  })
})

// ── 5. date_of_issue_lock ─────────────────────────────────────────────────────

describe('validateMarriageDateOfIssueLock', () => {
  it('passes when date_of_issue is in allowed zone', () => {
    const f = mockField({ field: 'date_of_issue', source_zone: 'issuance_block' })
    expect(validateMarriageDateOfIssueLock(f, []).passed).toBe(true)
  })

  it('fails when date_of_issue is from wrong zone', () => {
    const f = mockField({ field: 'date_of_issue', source_zone: 'marriage_block' })
    const result = validateMarriageDateOfIssueLock(f, [])
    expect(result.passed).toBe(false)
    expect(result.reason).toBe('date_of_issue_wrong_zone')
  })
})

// ── 6. spouse_order_preserved ─────────────────────────────────────────────────

describe('validateSpouseOrderPreserved', () => {
  it('passes when spouse_1 fields are in spouse_1 zone', () => {
    const s1 = [mockField({ field: 'spouse_1_given_name', source_zone: 'spouse_1_block' })]
    const s2 = [mockField({ field: 'spouse_2_given_name', source_zone: 'spouse_2_block' })]
    expect(validateSpouseOrderPreserved(s1, s2).passed).toBe(true)
  })

  it('fails when spouse_1 field comes from spouse_2 zone', () => {
    const s1 = [mockField({ field: 'spouse_1_given_name', source_zone: 'spouse_2_block' })]
    const s2: ExtractedField[] = []
    const result = validateSpouseOrderPreserved(s1, s2)
    expect(result.passed).toBe(false)
    expect(result.reason).toBe('spouse_1_field_from_spouse_2_zone')
  })

  it('fails when spouse_2 field comes from spouse_1 zone', () => {
    const s1: ExtractedField[] = []
    const s2 = [mockField({ field: 'spouse_2_given_name', source_zone: 'spouse_1_block' })]
    const result = validateSpouseOrderPreserved(s1, s2)
    expect(result.passed).toBe(false)
    expect(result.reason).toBe('spouse_2_field_from_spouse_1_zone')
  })
})

// ── 7. before_after_surname_not_swapped ───────────────────────────────────────

describe('validateBeforeAfterSurnameNotSwapped', () => {
  it('passes when both surnames have different zones', () => {
    const before = mockField({ field: 'spouse_1_surname_before_marriage', source_label: 'прізвище до шлюбу', source_zone: 'before_zone' })
    const after = mockField({ field: 'spouse_1_surname_after_marriage', source_label: 'прізвище після шлюбу', source_zone: 'after_zone' })
    expect(validateBeforeAfterSurnameNotSwapped(before, after).passed).toBe(true)
  })

  it('fails when "before" field source_label contains "після"', () => {
    const before = mockField({ field: 'spouse_1_surname_before_marriage', source_label: 'після державної реєстрації' })
    const after = mockField({ field: 'spouse_1_surname_after_marriage', source_label: 'після шлюбу' })
    const result = validateBeforeAfterSurnameNotSwapped(before, after)
    expect(result.passed).toBe(false)
    expect(result.reason).toBe('before_after_surname_label_mismatch')
  })

  it('fails when values are identical from same zone', () => {
    const before = mockField({ field: 'spouse_1_surname_before_marriage', raw_value: 'Шевченко', source_zone: 'spouse_block' })
    const after = mockField({ field: 'spouse_1_surname_after_marriage', raw_value: 'Шевченко', source_zone: 'spouse_block' })
    const result = validateBeforeAfterSurnameNotSwapped(before, after)
    expect(result.passed).toBe(false)
    expect(result.reason).toBe('before_after_surname_identical_in_same_zone')
  })
})

// ── 8. spouse_names_not_swapped ───────────────────────────────────────────────

describe('validateSpouseNamesNotSwapped', () => {
  it('passes when spouse names from different zones', () => {
    const fields = [
      mockField({ field: 'spouse_1_given_name', source_zone: 'spouse_1_block' }),
      mockField({ field: 'spouse_2_given_name', source_zone: 'spouse_2_block' }),
    ]
    expect(validateSpouseNamesNotSwapped(fields).passed).toBe(true)
  })

  it('fails when both given names from same non-unknown zone', () => {
    const fields = [
      mockField({ field: 'spouse_1_given_name', source_zone: 'main_block' }),
      mockField({ field: 'spouse_2_given_name', source_zone: 'main_block' }),
    ]
    const result = validateSpouseNamesNotSwapped(fields)
    expect(result.passed).toBe(false)
    expect(result.reason).toBe('spouse_given_names_from_same_zone')
  })
})

// ── 9. nominative_case_required ───────────────────────────────────────────────

describe('validateMarriageNominativeCase', () => {
  it('passes for a name already in nominative', () => {
    const f = mockField({ field: 'spouse_1_given_name', raw_value: 'Іван' })
    expect(validateMarriageNominativeCase(f, 'spouse_1_given_name').passed).toBe(true)
  })

  it('passes when no raw_value', () => {
    const f = mockField({ field: 'spouse_1_given_name', raw_value: '' })
    expect(validateMarriageNominativeCase(f, 'spouse_1_given_name').passed).toBe(true)
  })
})

// ── 10. civil_registry_glossary_required ─────────────────────────────────────

describe('validateMarriageCivilRegistryGlossary', () => {
  it('passes when no raw_value', () => {
    const f = mockField({ field: 'issuing_authority', raw_value: '' })
    expect(validateMarriageCivilRegistryGlossary(f).passed).toBe(true)
  })

  it('passes when undefined', () => {
    expect(validateMarriageCivilRegistryGlossary(undefined).passed).toBe(true)
  })
})

// ── 11. source_evidence_required ─────────────────────────────────────────────

describe('validateMarriageSourceEvidence', () => {
  it('passes when ocr_ids present', () => {
    const f = mockField({ field: 'date_of_marriage', ocr_ids: ['w_010'], bbox_status: 'exact' })
    expect(validateMarriageSourceEvidence(f).passed).toBe(true)
  })

  it('fails when no ocr_ids and bbox_status missing', () => {
    const f = mockField({ field: 'date_of_marriage', ocr_ids: [], bbox_status: 'missing' })
    const result = validateMarriageSourceEvidence(f)
    expect(result.passed).toBe(false)
    expect(result.reason).toBe('no_ocr_evidence')
  })
})

// ── 12. bilingual_layer_protection ───────────────────────────────────────────

describe('validateMarriageBilingualLayer', () => {
  it('passes when Ukrainian layer', () => {
    const f = mockField({ field: 'spouse_1_given_name' })
    expect(validateMarriageBilingualLayer(f, false).passed).toBe(true)
  })

  it('flags review_required when Russian fallback', () => {
    const f = mockField({ field: 'spouse_1_given_name' })
    const result = validateMarriageBilingualLayer(f, true)
    expect(result.passed).toBe(false)
    expect(result.reason).toBe('russian_language_fallback')
  })
})

// ── 13. forbidden_marriage_mislabels ─────────────────────────────────────────

describe('validateForbiddenMarriageMislabels', () => {
  it('passes with correct Patronymic label', () => {
    const fields = [mockField({ field: 'spouse_1_patronymic', normalized_value: 'Іванович' })]
    const labels = { spouse_1_patronymic: "Spouse 1 Patronymic" }
    expect(validateForbiddenMarriageMislabels(fields, labels).passed).toBe(true)
  })

  it('fails when patronymic labeled as Middle Name', () => {
    const fields = [mockField({ field: 'spouse_1_patronymic', normalized_value: 'Іванович' })]
    const labels = { spouse_1_patronymic: 'Middle Name' }
    const result = validateForbiddenMarriageMislabels(fields, labels)
    expect(result.passed).toBe(false)
    expect(result.violations.some(v => v.includes('Middle Name'))).toBe(true)
  })

  it('fails when act_record_number labeled as Certificate Number', () => {
    const fields = [mockField({ field: 'act_record_number', raw_value: '42' })]
    const labels = { act_record_number: 'Certificate Number' }
    const result = validateForbiddenMarriageMislabels(fields, labels)
    expect(result.passed).toBe(false)
    expect(result.violations.some(v => v.includes('Act Record Number'))).toBe(true)
  })
})

// ── Date normalization ────────────────────────────────────────────────────────

describe('normalizeMarriageCertDate', () => {
  it('normalizes лютого correctly', () => {
    const result = normalizeMarriageCertDate('14 лютого 2005')
    expect(result.normalized).toContain('14 February 2005')
    expect(result.review_required).toBe(false)
  })

  it('normalizes березня correctly', () => {
    const result = normalizeMarriageCertDate('3 березня 2018')
    expect(result.normalized).toContain('3 March 2018')
  })

  it('лютого is NOT жовтня', () => {
    const feb = normalizeMarriageCertDate('14 лютого 2005')
    const oct = normalizeMarriageCertDate('14 жовтня 2005')
    expect(feb.normalized).not.toBe(oct.normalized)
    expect(feb.normalized).toContain('February')
    expect(oct.normalized).toContain('October')
  })

  it('Russian fallback requires review_required', () => {
    const result = normalizeMarriageCertDate('14 февраля 2005')
    expect(result.review_required).toBe(true)
    expect(result.reason).toBe('russian_month_fallback')
  })

  it('февраля is NOT лютого (different months)', () => {
    // Both should produce February but one is Russian (review_required)
    const ukResult = normalizeMarriageCertDate('14 лютого 2005')
    const ruResult = normalizeMarriageCertDate('14 февраля 2005')
    expect(ukResult.review_required).toBe(false)
    expect(ruResult.review_required).toBe(true)
  })

  it('partial date returns review_required', () => {
    const result = normalizeMarriageCertDate('14 [unclear]')
    expect(result.review_required).toBe(true)
  })
})
