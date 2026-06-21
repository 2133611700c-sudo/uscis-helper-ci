/**
 * Divorce Certificate Validators Tests — Messenginfo v6.0
 *
 * Tests all 14 validators + normalizeDivorceCertDate helper.
 * Uses mock ExtractedField objects — no live OCR, no real documents.
 */
import { describe, it, expect } from 'vitest'
import type { ExtractedField } from '../../types'
import {
  validateDivorceCertNumNotActRecord,
  validateDivorceActRecordNumberRequired,
  validateDivorceActRecordDateLock,
  validateDateOfDivorceLock,
  validateDivorceDateOfIssueLock,
  validateDivorceSpouseOrderPreserved,
  validateDivorceSpouseNamesNotSwapped,
  validateBasisOfDivorcRequired,
  validateCourtDecisionNotInvented,
  validateDivorceNominativeCase,
  validateDivorceCivilRegistryGlossary,
  validateDivorceSourceEvidence,
  validateDivorceBilingualLayer,
  validateForbiddenDivorceMislabels,
  normalizeDivorceCertDate,
} from '../divorceCertificateValidators'

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

// ── 1. validateDivorceCertNumNotActRecord ─────────────────────────────────────

describe('validateDivorceCertNumNotActRecord', () => {
  it('passes when both fields are absent', () => {
    const r = validateDivorceCertNumNotActRecord(undefined, undefined)
    expect(r.passed).toBe(true)
    expect(r.review_required).toBe(false)
  })

  it('passes when only one field is present', () => {
    const cert = mockField({ field: 'certificate_number', raw_value: 'AB123' })
    const r = validateDivorceCertNumNotActRecord(cert, undefined)
    expect(r.passed).toBe(true)
  })

  it('fails when certificate_number equals act_record_number raw_value', () => {
    const cert = mockField({ field: 'certificate_number', raw_value: '999', source_zone: 'cert_block' })
    const act = mockField({ field: 'act_record_number', raw_value: '999', source_zone: 'act_block', ocr_ids: ['w_002'] })
    const r = validateDivorceCertNumNotActRecord(cert, act)
    expect(r.passed).toBe(false)
    expect(r.review_required).toBe(true)
    expect(r.reason).toBe('certificate_number_equals_act_record_number')
  })

  it('fails when both fields come from the same source_zone', () => {
    const cert = mockField({ field: 'certificate_number', raw_value: 'AB1', source_zone: 'shared_block', ocr_ids: ['w_001'] })
    const act = mockField({ field: 'act_record_number', raw_value: 'CD2', source_zone: 'shared_block', ocr_ids: ['w_002'] })
    const r = validateDivorceCertNumNotActRecord(cert, act)
    expect(r.passed).toBe(false)
    expect(r.reason).toBe('certificate_and_act_record_same_zone')
  })

  it('fails when certificate_number and act_record_number share OCR IDs', () => {
    const cert = mockField({ field: 'certificate_number', raw_value: 'AB1', source_zone: 'cert_block', ocr_ids: ['shared_w1', 'w_cert'] })
    const act = mockField({ field: 'act_record_number', raw_value: 'CD2', source_zone: 'act_block', ocr_ids: ['shared_w1', 'w_act'] })
    const r = validateDivorceCertNumNotActRecord(cert, act)
    expect(r.passed).toBe(false)
    expect(r.reason).toBe('certificate_and_act_record_share_ocr_ids')
  })

  it('passes when values differ, zones differ, ocr_ids differ', () => {
    const cert = mockField({ field: 'certificate_number', raw_value: 'AB1', source_zone: 'cert_block', ocr_ids: ['w_c1'] })
    const act = mockField({ field: 'act_record_number', raw_value: 'XY9', source_zone: 'act_block', ocr_ids: ['w_a1'] })
    const r = validateDivorceCertNumNotActRecord(cert, act)
    expect(r.passed).toBe(true)
  })
})

// ── 2. validateDivorceActRecordNumberRequired ─────────────────────────────────

describe('validateDivorceActRecordNumberRequired', () => {
  it('fails when field is undefined', () => {
    const r = validateDivorceActRecordNumberRequired(undefined)
    expect(r.passed).toBe(false)
    expect(r.review_required).toBe(true)
    expect(r.reason).toBe('act_record_number_missing')
  })

  it('fails when raw_value is empty string', () => {
    const f = mockField({ field: 'act_record_number', raw_value: '' })
    const r = validateDivorceActRecordNumberRequired(f)
    expect(r.passed).toBe(false)
    expect(r.reason).toBe('act_record_number_missing')
  })

  it('fails when raw_value is only whitespace', () => {
    const f = mockField({ field: 'act_record_number', raw_value: '   ' })
    const r = validateDivorceActRecordNumberRequired(f)
    expect(r.passed).toBe(false)
  })

  it('passes when raw_value is present', () => {
    const f = mockField({ field: 'act_record_number', raw_value: '42' })
    const r = validateDivorceActRecordNumberRequired(f)
    expect(r.passed).toBe(true)
    expect(r.review_required).toBe(false)
  })
})

// ── 3. validateDivorceActRecordDateLock ──────────────────────────────────────

describe('validateDivorceActRecordDateLock', () => {
  it('passes when field is undefined', () => {
    const r = validateDivorceActRecordDateLock(undefined, undefined, undefined)
    expect(r.passed).toBe(true)
  })

  it('passes when source_zone is act_record_block', () => {
    const f = mockField({ field: 'act_record_date', source_zone: 'act_record_block', ocr_ids: ['w_a1'] })
    const r = validateDivorceActRecordDateLock(f, undefined, undefined)
    expect(r.passed).toBe(true)
  })

  it('passes when source_zone is civil_act_block', () => {
    const f = mockField({ field: 'act_record_date', source_zone: 'civil_act_block', ocr_ids: ['w_a1'] })
    const r = validateDivorceActRecordDateLock(f, undefined, undefined)
    expect(r.passed).toBe(true)
  })

  it('fails when source_zone is not in allowed zones', () => {
    const f = mockField({ field: 'act_record_date', source_zone: 'footer_block' })
    const r = validateDivorceActRecordDateLock(f, undefined, undefined)
    expect(r.passed).toBe(false)
    expect(r.reason).toBe('act_record_date_wrong_zone')
  })

  it('fails when act_record_date shares OCR IDs with date_of_divorce', () => {
    const actDate = mockField({ field: 'act_record_date', source_zone: 'act_record_block', ocr_ids: ['shared_w1'] })
    const dateOfDivorce = mockField({ field: 'date_of_divorce', source_zone: 'divorce_block', ocr_ids: ['shared_w1', 'w_d2'] })
    const r = validateDivorceActRecordDateLock(actDate, dateOfDivorce, undefined)
    expect(r.passed).toBe(false)
    expect(r.reason).toBe('act_record_date_shares_tokens_with_date_of_divorce')
  })

  it('fails when act_record_date shares OCR IDs with date_of_issue', () => {
    const actDate = mockField({ field: 'act_record_date', source_zone: 'act_record_block', ocr_ids: ['shared_w2'] })
    const dateOfIssue = mockField({ field: 'date_of_issue', source_zone: 'issuance_block', ocr_ids: ['shared_w2', 'w_i1'] })
    const r = validateDivorceActRecordDateLock(actDate, undefined, dateOfIssue)
    expect(r.passed).toBe(false)
    expect(r.reason).toBe('act_record_date_shares_tokens_with_date_of_issue')
  })
})

// ── 4. validateDateOfDivorceLock ──────────────────────────────────────────────

describe('validateDateOfDivorceLock', () => {
  it('passes when field is undefined', () => {
    const r = validateDateOfDivorceLock(undefined, [])
    expect(r.passed).toBe(true)
  })

  it('passes when source_zone is divorce_block', () => {
    const f = mockField({ field: 'date_of_divorce', source_zone: 'divorce_block', ocr_ids: ['w_d1'] })
    const r = validateDateOfDivorceLock(f, [])
    expect(r.passed).toBe(true)
  })

  it('passes when source_zone is dissolution_block', () => {
    const f = mockField({ field: 'date_of_divorce', source_zone: 'dissolution_block', ocr_ids: ['w_d1'] })
    const r = validateDateOfDivorceLock(f, [])
    expect(r.passed).toBe(true)
  })

  it('passes when source_zone is main_block (allowed for date_of_divorce)', () => {
    const f = mockField({ field: 'date_of_divorce', source_zone: 'main_block', ocr_ids: ['w_d1'] })
    const r = validateDateOfDivorceLock(f, [])
    expect(r.passed).toBe(true)
  })

  it('fails when source_zone is act_record_block', () => {
    const f = mockField({ field: 'date_of_divorce', source_zone: 'act_record_block' })
    const r = validateDateOfDivorceLock(f, [])
    expect(r.passed).toBe(false)
    expect(r.reason).toBe('date_of_divorce_wrong_zone')
  })

  it('fails when date_of_divorce shares OCR IDs with act_record_date', () => {
    const f = mockField({ field: 'date_of_divorce', source_zone: 'divorce_block', ocr_ids: ['shared_tok'] })
    const actDate = mockField({ field: 'act_record_date', source_zone: 'act_record_block', ocr_ids: ['shared_tok'] })
    const r = validateDateOfDivorceLock(f, [actDate])
    expect(r.passed).toBe(false)
    expect(r.reason).toBe('date_of_divorce_shares_tokens_with_act_record_date')
  })

  it('fails when date_of_divorce shares OCR IDs with date_of_issue', () => {
    const f = mockField({ field: 'date_of_divorce', source_zone: 'divorce_block', ocr_ids: ['shared_iss'] })
    const issueDate = mockField({ field: 'date_of_issue', source_zone: 'issuance_block', ocr_ids: ['shared_iss'] })
    const r = validateDateOfDivorceLock(f, [issueDate])
    expect(r.passed).toBe(false)
    expect(r.reason).toBe('date_of_divorce_shares_tokens_with_date_of_issue')
  })
})

// ── 5. validateDivorceDateOfIssueLock ────────────────────────────────────────

describe('validateDivorceDateOfIssueLock', () => {
  it('passes when field is undefined', () => {
    const r = validateDivorceDateOfIssueLock(undefined)
    expect(r.passed).toBe(true)
  })

  it('passes when source_zone is issuance_block', () => {
    const f = mockField({ field: 'date_of_issue', source_zone: 'issuance_block' })
    const r = validateDivorceDateOfIssueLock(f)
    expect(r.passed).toBe(true)
  })

  it('passes when source_zone is footer_block', () => {
    const f = mockField({ field: 'date_of_issue', source_zone: 'footer_block' })
    const r = validateDivorceDateOfIssueLock(f)
    expect(r.passed).toBe(true)
  })

  it('passes when source_zone is administrative_block', () => {
    const f = mockField({ field: 'date_of_issue', source_zone: 'administrative_block' })
    const r = validateDivorceDateOfIssueLock(f)
    expect(r.passed).toBe(true)
  })

  it('fails when source_zone is divorce_block', () => {
    const f = mockField({ field: 'date_of_issue', source_zone: 'divorce_block' })
    const r = validateDivorceDateOfIssueLock(f)
    expect(r.passed).toBe(false)
    expect(r.reason).toBe('date_of_issue_wrong_zone')
  })

  it('fails when source_zone is main_block', () => {
    const f = mockField({ field: 'date_of_issue', source_zone: 'main_block' })
    const r = validateDivorceDateOfIssueLock(f)
    expect(r.passed).toBe(false)
  })
})

// ── 6. validateDivorceSpouseOrderPreserved ────────────────────────────────────

describe('validateDivorceSpouseOrderPreserved', () => {
  it('passes when all spouse_1 fields come from spouse_1 zones', () => {
    const s1Fields = [
      mockField({ field: 'spouse_1_surname', source_zone: 'spouse_1_block' }),
      mockField({ field: 'spouse_1_given_name', source_zone: 'first_spouse_block' }),
    ]
    const s2Fields = [
      mockField({ field: 'spouse_2_surname', source_zone: 'spouse_2_block' }),
    ]
    const r = validateDivorceSpouseOrderPreserved(s1Fields, s2Fields)
    expect(r.passed).toBe(true)
  })

  it('fails when spouse_1 field comes from spouse_2 zone', () => {
    const s1Fields = [
      mockField({ field: 'spouse_1_surname', source_zone: 'spouse_2_block' }),
    ]
    const r = validateDivorceSpouseOrderPreserved(s1Fields, [])
    expect(r.passed).toBe(false)
    expect(r.reason).toBe('spouse_1_field_from_spouse_2_zone')
  })

  it('fails when spouse_2 field comes from spouse_1 zone', () => {
    const s2Fields = [
      mockField({ field: 'spouse_2_given_name', source_zone: 'first_spouse_block' }),
    ]
    const r = validateDivorceSpouseOrderPreserved([], s2Fields)
    expect(r.passed).toBe(false)
    expect(r.reason).toBe('spouse_2_field_from_spouse_1_zone')
  })

  it('fails when spouse_1 field comes from second_spouse_block', () => {
    const s1Fields = [
      mockField({ field: 'spouse_1_given_name', source_zone: 'second_spouse_block' }),
    ]
    const r = validateDivorceSpouseOrderPreserved(s1Fields, [])
    expect(r.passed).toBe(false)
  })
})

// ── 7. validateDivorceSpouseNamesNotSwapped ───────────────────────────────────

describe('validateDivorceSpouseNamesNotSwapped', () => {
  it('passes when spouse given names come from different zones', () => {
    const fields = [
      mockField({ field: 'spouse_1_given_name', source_zone: 'spouse_1_block' }),
      mockField({ field: 'spouse_2_given_name', source_zone: 'spouse_2_block' }),
    ]
    const r = validateDivorceSpouseNamesNotSwapped(fields)
    expect(r.passed).toBe(true)
  })

  it('fails when both spouse given names come from same zone', () => {
    const fields = [
      mockField({ field: 'spouse_1_given_name', source_zone: 'main_block' }),
      mockField({ field: 'spouse_2_given_name', source_zone: 'main_block' }),
    ]
    const r = validateDivorceSpouseNamesNotSwapped(fields)
    expect(r.passed).toBe(false)
    expect(r.reason).toBe('spouse_given_names_from_same_zone')
  })

  it('passes when one given name is absent', () => {
    const fields = [
      mockField({ field: 'spouse_1_given_name', source_zone: 'spouse_1_block' }),
    ]
    const r = validateDivorceSpouseNamesNotSwapped(fields)
    expect(r.passed).toBe(true)
  })

  it('passes when both given names share zone "unknown" (unknown is exempt)', () => {
    const fields = [
      mockField({ field: 'spouse_1_given_name', source_zone: 'unknown' }),
      mockField({ field: 'spouse_2_given_name', source_zone: 'unknown' }),
    ]
    const r = validateDivorceSpouseNamesNotSwapped(fields)
    expect(r.passed).toBe(true)
  })
})

// ── 8. validateBasisOfDivorcRequired ─────────────────────────────────────────

describe('validateBasisOfDivorcRequired', () => {
  it('fails when field is undefined', () => {
    const r = validateBasisOfDivorcRequired(undefined)
    expect(r.passed).toBe(false)
    expect(r.review_required).toBe(true)
    expect(r.reason).toBe('basis_of_divorce_missing')
  })

  it('fails when raw_value is empty', () => {
    const f = mockField({ field: 'basis_of_divorce', raw_value: '' })
    const r = validateBasisOfDivorcRequired(f)
    expect(r.passed).toBe(false)
    expect(r.reason).toBe('basis_of_divorce_missing')
  })

  it('passes when basis_of_divorce has a short valid value', () => {
    const f = mockField({ field: 'basis_of_divorce', raw_value: 'Взаємна згода подружжя' })
    const r = validateBasisOfDivorcRequired(f)
    expect(r.passed).toBe(true)
    expect(r.review_required).toBe(false)
  })

  it('fails when basis_of_divorce text exceeds 30 words', () => {
    const longBasis = Array(31).fill('слово').join(' ')
    const f = mockField({ field: 'basis_of_divorce', raw_value: longBasis })
    const r = validateBasisOfDivorcRequired(f)
    expect(r.passed).toBe(false)
    expect(r.review_required).toBe(true)
    expect(r.reason).toBe('complex_legal_basis')
  })

  it('exactly 30 words passes (threshold is >30)', () => {
    const exactBasis = Array(30).fill('слово').join(' ')
    const f = mockField({ field: 'basis_of_divorce', raw_value: exactBasis })
    const r = validateBasisOfDivorcRequired(f)
    expect(r.passed).toBe(true)
  })

  it('fails when basis contains legal article reference ст. 106', () => {
    const f = mockField({ field: 'basis_of_divorce', raw_value: 'ст. 106 СК України' })
    const r = validateBasisOfDivorcRequired(f)
    expect(r.passed).toBe(false)
    expect(r.reason).toBe('legal_text_reference_detected')
  })

  it('fails when basis contains "стаття 107"', () => {
    const f = mockField({ field: 'basis_of_divorce', raw_value: 'стаття 107 СК України' })
    const r = validateBasisOfDivorcRequired(f)
    expect(r.passed).toBe(false)
    expect(r.reason).toBe('legal_text_reference_detected')
  })

  it('fails when basis contains справа №', () => {
    const f = mockField({ field: 'basis_of_divorce', raw_value: 'рішення суду справа № 2023/123' })
    const r = validateBasisOfDivorcRequired(f)
    expect(r.passed).toBe(false)
    expect(r.reason).toBe('legal_text_reference_detected')
  })

  it('fails when basis contains "article 5"', () => {
    const f = mockField({ field: 'basis_of_divorce', raw_value: 'based on article 5 of the code' })
    const r = validateBasisOfDivorcRequired(f)
    expect(r.passed).toBe(false)
    expect(r.reason).toBe('legal_text_reference_detected')
  })
})

// ── 9. validateCourtDecisionNotInvented ──────────────────────────────────────

describe('validateCourtDecisionNotInvented', () => {
  it('passes when field is undefined (court info not present)', () => {
    const r = validateCourtDecisionNotInvented(undefined, 'court_decision_number')
    expect(r.passed).toBe(true)
  })

  it('passes when field has value AND ocr_ids (evidence present)', () => {
    const f = mockField({ field: 'court_decision_number', raw_value: '2023/456', ocr_ids: ['w_c1'], bbox_status: 'exact' })
    const r = validateCourtDecisionNotInvented(f, 'court_decision_number')
    expect(r.passed).toBe(true)
  })

  it('passes when field has value AND bbox only (no ocr_ids but bbox present)', () => {
    const f = mockField({ field: 'court_decision_number', raw_value: '2023/456', ocr_ids: [], bbox_status: 'approximate' })
    const r = validateCourtDecisionNotInvented(f, 'court_decision_number')
    expect(r.passed).toBe(true)
  })

  it('fails when field has value but no OCR IDs and no bbox', () => {
    const f = mockField({ field: 'court_decision_number', raw_value: '2023/456', ocr_ids: [], bbox_status: 'missing' })
    const r = validateCourtDecisionNotInvented(f, 'court_decision_number')
    expect(r.passed).toBe(false)
    expect(r.review_required).toBe(true)
    expect(r.reason).toBe('court_field_no_ocr_evidence')
  })

  it('passes when field has empty value (not present)', () => {
    const f = mockField({ field: 'court_decision_number', raw_value: '', ocr_ids: [], bbox_status: 'missing' })
    const r = validateCourtDecisionNotInvented(f, 'court_decision_number')
    expect(r.passed).toBe(true)
  })

  it('warning includes the field name when failing', () => {
    const f = mockField({ field: 'court_name', raw_value: 'Шевченківський районний суд', ocr_ids: [], bbox_status: 'missing' })
    const r = validateCourtDecisionNotInvented(f, 'court_name')
    expect(r.passed).toBe(false)
    expect(r.warning).toContain('court_name')
  })
})

// ── 10. validateDivorceNominativeCase ────────────────────────────────────────

describe('validateDivorceNominativeCase', () => {
  it('passes when field has no raw_value', () => {
    const f = mockField({ field: 'spouse_1_surname', raw_value: '' })
    const r = validateDivorceNominativeCase(f, 'spouse_1_surname')
    expect(r.passed).toBe(true)
  })

  it('passes when raw_value is already in nominative form', () => {
    const f = mockField({ field: 'spouse_1_surname', raw_value: 'Коваль' })
    const r = validateDivorceNominativeCase(f, 'spouse_1_surname')
    // restoreNominative returns the same value → no change → pass
    expect(r.passed).toBe(true)
  })
})

// ── 11. validateDivorceCivilRegistryGlossary ──────────────────────────────────

describe('validateDivorceCivilRegistryGlossary', () => {
  it('passes when field is undefined', () => {
    const r = validateDivorceCivilRegistryGlossary(undefined)
    expect(r.passed).toBe(true)
  })

  it('passes when raw_value is empty', () => {
    const f = mockField({ field: 'issuing_authority', raw_value: '' })
    const r = validateDivorceCivilRegistryGlossary(f)
    expect(r.passed).toBe(true)
  })

  it('passes when issuing authority has no recognizable abbreviations', () => {
    // Plain text with no abbreviations → no glossary matches → passes
    const f = mockField({ field: 'issuing_authority', raw_value: 'Відділ реєстрації актів цивільного стану' })
    const r = validateDivorceCivilRegistryGlossary(f)
    expect(r.review_required).toBe(false)
  })

  it('returns review_required=true for known conflict (ЗАГС + ДРАЦС in same value)', () => {
    const f = mockField({ field: 'issuing_authority', raw_value: 'ЗАГС та ДРАЦС Шевченківський' })
    const r = validateDivorceCivilRegistryGlossary(f)
    // scanTextForAgencyAbbr should detect hasConflict
    expect(r.review_required).toBe(true)
  })
})

// ── 12. validateDivorceSourceEvidence ────────────────────────────────────────

describe('validateDivorceSourceEvidence', () => {
  it('passes when field has ocr_ids', () => {
    const f = mockField({ field: 'spouse_1_surname', ocr_ids: ['w_001'], bbox_status: 'missing' })
    const r = validateDivorceSourceEvidence(f)
    expect(r.passed).toBe(true)
  })

  it('passes when field has bbox (no ocr_ids)', () => {
    const f = mockField({ field: 'spouse_1_surname', ocr_ids: [], bbox_status: 'exact' })
    const r = validateDivorceSourceEvidence(f)
    expect(r.passed).toBe(true)
  })

  it('fails when field has no ocr_ids and no bbox', () => {
    const f = mockField({ field: 'spouse_1_surname', ocr_ids: [], bbox_status: 'missing' })
    const r = validateDivorceSourceEvidence(f)
    expect(r.passed).toBe(false)
    expect(r.review_required).toBe(true)
    expect(r.reason).toBe('no_ocr_evidence')
  })

  it('warning contains field name when failing', () => {
    const f = mockField({ field: 'basis_of_divorce', ocr_ids: [], bbox_status: 'missing' })
    const r = validateDivorceSourceEvidence(f)
    expect(r.warning).toContain('basis_of_divorce')
  })
})

// ── 13. validateDivorceBilingualLayer ────────────────────────────────────────

describe('validateDivorceBilingualLayer', () => {
  it('passes when Ukrainian layer used (usedRussianFallback=false)', () => {
    const f = mockField({ field: 'spouse_1_surname', language_layer: 'uk' })
    const r = validateDivorceBilingualLayer(f, false)
    expect(r.passed).toBe(true)
    expect(r.review_required).toBe(false)
  })

  it('fails when Russian fallback used', () => {
    const f = mockField({ field: 'spouse_2_surname', language_layer: 'ru' })
    const r = validateDivorceBilingualLayer(f, true)
    expect(r.passed).toBe(false)
    expect(r.review_required).toBe(true)
    expect(r.reason).toBe('russian_language_fallback')
  })

  it('warning contains field name when Russian fallback triggered', () => {
    const f = mockField({ field: 'date_of_divorce', language_layer: 'ru' })
    const r = validateDivorceBilingualLayer(f, true)
    expect(r.warning).toContain('date_of_divorce')
  })
})

// ── 14. validateForbiddenDivorceMislabels ─────────────────────────────────────

describe('validateForbiddenDivorceMislabels', () => {
  it('passes when patronymic labels are correct', () => {
    const fields = [
      mockField({ field: 'spouse_1_patronymic', normalized_value: 'Іванович' }),
      mockField({ field: 'spouse_2_patronymic', normalized_value: 'Петрівна' }),
    ]
    const labels = {
      spouse_1_patronymic: 'Spouse 1 Patronymic',
      spouse_2_patronymic: 'Spouse 2 Patronymic',
    }
    const r = validateForbiddenDivorceMislabels(fields, labels)
    expect(r.passed).toBe(true)
    expect(r.violations).toHaveLength(0)
  })

  it('detects when spouse_1_patronymic is labeled as Middle Name', () => {
    const fields = [mockField({ field: 'spouse_1_patronymic', normalized_value: 'Іванович' })]
    const labels = { spouse_1_patronymic: 'Spouse 1 Middle Name' }
    const r = validateForbiddenDivorceMislabels(fields, labels)
    expect(r.passed).toBe(false)
    expect(r.violations.some(v => v.includes('Middle Name'))).toBe(true)
  })

  it('detects when patronymic normalized_value contains "middle name"', () => {
    const fields = [mockField({ field: 'spouse_2_patronymic', normalized_value: 'middle name fallback' })]
    const labels = { spouse_2_patronymic: 'Spouse 2 Patronymic' }
    const r = validateForbiddenDivorceMislabels(fields, labels)
    expect(r.passed).toBe(false)
  })

  it('detects when act_record_number labeled as Certificate Number', () => {
    const fields = [mockField({ field: 'act_record_number' })]
    const labels = { act_record_number: 'Certificate Number' }
    const r = validateForbiddenDivorceMislabels(fields, labels)
    expect(r.passed).toBe(false)
    expect(r.violations.some(v => v.includes('Certificate Number'))).toBe(true)
  })

  it('detects when basis_of_divorce labeled as exactly "Court Decision"', () => {
    const fields = [mockField({ field: 'basis_of_divorce' })]
    const labels = { basis_of_divorce: 'Court Decision' }
    const r = validateForbiddenDivorceMislabels(fields, labels)
    expect(r.passed).toBe(false)
    expect(r.violations.some(v => v.includes('Court Decision'))).toBe(true)
  })

  it('passes when basis_of_divorce labeled as "Basis of Divorce"', () => {
    const fields = [mockField({ field: 'basis_of_divorce' })]
    const labels = { basis_of_divorce: 'Basis of Divorce' }
    const r = validateForbiddenDivorceMislabels(fields, labels)
    expect(r.passed).toBe(true)
  })

  it('accumulates multiple violations', () => {
    const fields = [
      mockField({ field: 'spouse_1_patronymic', normalized_value: 'Іванович' }),
      mockField({ field: 'act_record_number' }),
    ]
    const labels = {
      spouse_1_patronymic: 'Spouse 1 Middle Name',
      act_record_number: 'Certificate Number',
    }
    const r = validateForbiddenDivorceMislabels(fields, labels)
    expect(r.passed).toBe(false)
    expect(r.violations.length).toBeGreaterThanOrEqual(2)
  })
})

// ── normalizeDivorceCertDate ──────────────────────────────────────────────────

describe('normalizeDivorceCertDate', () => {
  it('normalizes Ukrainian date лютого correctly (February)', () => {
    const r = normalizeDivorceCertDate('15 лютого 2003 р.')
    expect(r.normalized).toBe('15 February 2003')
    expect(r.review_required).toBe(false)
  })

  it('normalizes Ukrainian date жовтня correctly (October)', () => {
    const r = normalizeDivorceCertDate('3 жовтня 2018 р.')
    expect(r.normalized).toBe('3 October 2018')
    expect(r.review_required).toBe(false)
  })

  it('normalizes травня correctly (May)', () => {
    const r = normalizeDivorceCertDate('22 травня 1999 р.')
    expect(r.normalized).toBe('22 May 1999')
    expect(r.review_required).toBe(false)
  })

  it('sets review_required=true for Russian month февраля', () => {
    const r = normalizeDivorceCertDate('10 февраля 2010 г.')
    expect(r.normalized).toBe('10 February 2010')
    expect(r.review_required).toBe(true)
    expect(r.reason).toBe('russian_month_fallback')
  })

  it('sets review_required=true for Russian month октября', () => {
    const r = normalizeDivorceCertDate('7 октября 2005 г.')
    expect(r.normalized).toBe('7 October 2005')
    expect(r.review_required).toBe(true)
    expect(r.reason).toBe('russian_month_fallback')
  })

  it('returns review_required=true for partial/unreadable Cyrillic date', () => {
    const r = normalizeDivorceCertDate('жовт')
    expect(r.normalized).toBe(null)
    expect(r.review_required).toBe(true)
  })

  it('returns review_required=true for unrecognized date format', () => {
    const r = normalizeDivorceCertDate('UNKNOWN_FORMAT')
    expect(r.normalized).toBe(null)
    expect(r.review_required).toBe(true)
  })

  it('лютого !== жовтня (correct month discrimination)', () => {
    const feb = normalizeDivorceCertDate('15 лютого 2003 р.')
    const oct = normalizeDivorceCertDate('15 жовтня 2003 р.')
    expect(feb.normalized).toBe('15 February 2003')
    expect(oct.normalized).toBe('15 October 2003')
    expect(feb.normalized).not.toBe(oct.normalized)
  })

  it('Russian fallback sets review_required=true; Ukrainian does not', () => {
    const uk = normalizeDivorceCertDate('15 лютого 2003 р.')
    const ru = normalizeDivorceCertDate('15 февраля 2003 г.')
    expect(uk.review_required).toBe(false)
    expect(ru.review_required).toBe(true)
  })
})
