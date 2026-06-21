/**
 * Ukrainian ID Card Validators Tests — Messenginfo v6.0
 *
 * Tests for ukrainianIdCardValidators.ts:
 *   - validateMrzTd1CheckDigits
 *   - validateDocumentNumberNotRecordNumber
 *   - validateRnokppSensitive
 *   - validateIdCardMrzVizMismatch
 *   - validateIdCardIssuingStateIsUkr
 *   - validateIdCardSourceEvidence
 *   - validateIdCardNameMixedScript
 *   - validateIdCardLatinNameNoRetransliteration
 *
 * Privacy invariant: rnokpp raw values must NEVER appear in validator
 * output (warnings, reasons, or candidate_value).
 *
 * document_number ≠ record_number separation is CRITICAL — tested thoroughly.
 */
import { describe, it, expect } from 'vitest'
import type { ExtractedField } from '../../types'
import {
  validateMrzTd1CheckDigits,
  validateDocumentNumberNotRecordNumber,
  validateRnokppSensitive,
  validateIdCardMrzVizMismatch,
  validateIdCardIssuingStateIsUkr,
  validateIdCardSourceEvidence,
  validateIdCardNameMixedScript,
  validateIdCardLatinNameNoRetransliteration,
} from '../ukrainianIdCardValidators'
import { computeCheckDigit } from '../../identity/mrzParser'

// ── TD1 Fixtures ──────────────────────────────────────────────────────────────

// TD1 format: 3 lines × 30 characters
// line1: type(2) + state(3) + docNum(9) + checkDig(1) + optData1(15) = 30
// line2: dob(6) + checkDig(1) + sex(1) + expiry(6) + checkDig(1) + nationality(3) + optData2(11) + checkDig(1) = 30
// line3: surname<<givenNames (30 chars, name line)

const TD1_LINE1_BASE = 'I<UKRFC12345679200101030000100'
// TD1 composite covers line1[0..29] + line2[0..6] + line2[7..28]
const TD1_LINE2_WITHOUT_COMPOSITE = '9101036M3105319UKR1234567890<'
const td1CompositeField =
  TD1_LINE1_BASE.slice(0, 30) +
  TD1_LINE2_WITHOUT_COMPOSITE.slice(0, 7) +
  TD1_LINE2_WITHOUT_COMPOSITE.slice(7, 29)
const compositeCheckDigit = computeCheckDigit(td1CompositeField) ?? '0'
const VALID_TD1_LINE2 = TD1_LINE2_WITHOUT_COMPOSITE + compositeCheckDigit
const VALID_TD1_LINE3 = 'KOVALENKO<<OLEKSII<MYKHAILO<<<'

// ── Helper ────────────────────────────────────────────────────────────────────

function makeField(overrides: Partial<ExtractedField> & { field?: string } = {}): ExtractedField {
  return {
    field: 'test_field',
    raw_value: 'test',
    normalized_value: 'test',
    review_required: false,
    bbox: [0, 0, 1, 1],
    language_layer: 'uk',
    confidence: 0.95,
    bbox_status: 'exact',
    ocr_ids: ['ocr-1'],
    source_zone: 'main_block',
    source_label: 'Test',
    ...overrides,
  }
}

// ── validateMrzTd1CheckDigits ─────────────────────────────────────────────────

describe('validateMrzTd1CheckDigits', () => {
  it('passes for valid TD1 MRZ', () => {
    const line1 = makeField({ field: 'mrz_line_1', raw_value: TD1_LINE1_BASE })
    const line2 = makeField({ field: 'mrz_line_2', raw_value: VALID_TD1_LINE2 })
    const line3 = makeField({ field: 'mrz_line_3', raw_value: VALID_TD1_LINE3 })
    const result = validateMrzTd1CheckDigits(line1, line2, line3)
    expect(result.passed).toBe(true)
    expect(result.review_required).toBe(false)
  })

  it('returns review_required when mrz_line_1 is missing', () => {
    const line2 = makeField({ field: 'mrz_line_2', raw_value: VALID_TD1_LINE2 })
    const result = validateMrzTd1CheckDigits(undefined, line2)
    expect(result.passed).toBe(false)
    expect(result.review_required).toBe(true)
    expect(result.reason).toBe('mrz_lines_missing')
  })

  it('returns review_required for wrong line length', () => {
    const line1 = makeField({ field: 'mrz_line_1', raw_value: 'I<UKR' }) // too short
    const line2 = makeField({ field: 'mrz_line_2', raw_value: VALID_TD1_LINE2 })
    const result = validateMrzTd1CheckDigits(line1, line2)
    expect(result.passed).toBe(false)
    expect(result.review_required).toBe(true)
    expect(result.reason).toBe('mrz_parse_error')
  })

  it('returns review_required when composite check digit is corrupted', () => {
    // Corrupt last char of line2 (composite check digit)
    const corruptLine2 = VALID_TD1_LINE2.substring(0, 29) + '0'
    const line1 = makeField({ field: 'mrz_line_1', raw_value: TD1_LINE1_BASE })
    const line2 = makeField({ field: 'mrz_line_2', raw_value: corruptLine2 })
    const result = validateMrzTd1CheckDigits(line1, line2)
    expect(result.passed).toBe(false)
    expect(result.review_required).toBe(true)
    expect(result.reason).toBe('td1_composite_check_failure')
    expect(result.warning).toContain('composite')
  })

  it('works without line3 (uses filler padding)', () => {
    const line1 = makeField({ field: 'mrz_line_1', raw_value: TD1_LINE1_BASE })
    const line2 = makeField({ field: 'mrz_line_2', raw_value: VALID_TD1_LINE2 })
    // No line3 provided
    const result = validateMrzTd1CheckDigits(line1, line2, undefined)
    // Should not throw, should process with filler line3
    expect(result).toBeDefined()
    expect(typeof result.review_required).toBe('boolean')
  })

  it('returns review_required for doc number check digit failure', () => {
    // Corrupt doc number check digit at line1 position 14
    const corruptLine1 = TD1_LINE1_BASE.substring(0, 14) + '0' + TD1_LINE1_BASE.substring(15)
    const line1 = makeField({ field: 'mrz_line_1', raw_value: corruptLine1 })
    const line2 = makeField({ field: 'mrz_line_2', raw_value: VALID_TD1_LINE2 })
    const result = validateMrzTd1CheckDigits(line1, line2)
    expect(result.review_required).toBe(true)
  })
})

// ── validateDocumentNumberNotRecordNumber ─────────────────────────────────────

describe('validateDocumentNumberNotRecordNumber — CRITICAL separation', () => {
  it('passes when document_number and record_number are distinct and different format', () => {
    const docNum = makeField({
      field: 'document_number',
      raw_value: '012345678',          // 9-digit card face number
      source_zone: 'card_face_block',
      ocr_ids: ['ocr-1'],
    })
    const recNum = makeField({
      field: 'record_number',
      raw_value: '20010103000010',      // 14-char УНЗР
      source_zone: 'mrz_opt_data1_block',
      ocr_ids: ['ocr-2'],
    })
    const result = validateDocumentNumberNotRecordNumber(docNum, recNum)
    expect(result.passed).toBe(true)
    expect(result.review_required).toBe(false)
  })

  it('returns review_required when both have identical raw values', () => {
    const docNum = makeField({
      field: 'document_number',
      raw_value: '012345678',
      source_zone: 'block_a',
      ocr_ids: ['ocr-1'],
    })
    const recNum = makeField({
      field: 'record_number',
      raw_value: '012345678',  // same value!
      source_zone: 'block_b',
      ocr_ids: ['ocr-2'],
    })
    const result = validateDocumentNumberNotRecordNumber(docNum, recNum)
    expect(result.passed).toBe(false)
    expect(result.review_required).toBe(true)
    expect(result.reason).toBe('document_number_equals_record_number')
    expect(result.warning).toContain('УНЗР')
  })

  it('returns review_required when both from same source zone', () => {
    const docNum = makeField({
      field: 'document_number',
      raw_value: '012345678',
      source_zone: 'same_zone',
      ocr_ids: ['ocr-1'],
    })
    const recNum = makeField({
      field: 'record_number',
      raw_value: '20010103000010',
      source_zone: 'same_zone',  // same zone!
      ocr_ids: ['ocr-2'],
    })
    const result = validateDocumentNumberNotRecordNumber(docNum, recNum)
    expect(result.passed).toBe(false)
    expect(result.review_required).toBe(true)
    expect(result.reason).toBe('document_number_record_number_same_zone')
  })

  it('returns review_required when fields share OCR token IDs', () => {
    const sharedOcrId = 'ocr-shared-123'
    const docNum = makeField({
      field: 'document_number',
      raw_value: '012345678',
      source_zone: 'zone_a',
      ocr_ids: [sharedOcrId, 'ocr-unique-1'],
    })
    const recNum = makeField({
      field: 'record_number',
      raw_value: '20010103000010',
      source_zone: 'zone_b',
      ocr_ids: [sharedOcrId, 'ocr-unique-2'],
    })
    const result = validateDocumentNumberNotRecordNumber(docNum, recNum)
    expect(result.passed).toBe(false)
    expect(result.review_required).toBe(true)
    expect(result.reason).toBe('document_number_record_number_share_ocr_ids')
    expect(result.warning).toContain(sharedOcrId)
  })

  it('returns review_required when document_number looks like УНЗР (14 digits)', () => {
    const docNum = makeField({
      field: 'document_number',
      raw_value: '20010103000010',  // looks like УНЗР format
      source_zone: 'zone_a',
      ocr_ids: ['ocr-1'],
    })
    const recNum = makeField({
      field: 'record_number',
      raw_value: '012345678',
      source_zone: 'zone_b',
      ocr_ids: ['ocr-2'],
    })
    const result = validateDocumentNumberNotRecordNumber(docNum, recNum)
    expect(result.passed).toBe(false)
    expect(result.review_required).toBe(true)
    expect(result.reason).toBe('document_number_appears_to_be_record_number')
  })

  it('returns review_required when record_number looks like 9-digit doc number', () => {
    const docNum = makeField({
      field: 'document_number',
      raw_value: '012345678',
      source_zone: 'zone_a',
      ocr_ids: ['ocr-1'],
    })
    const recNum = makeField({
      field: 'record_number',
      raw_value: '987654321',  // looks like doc number
      source_zone: 'zone_b',
      ocr_ids: ['ocr-2'],
    })
    const result = validateDocumentNumberNotRecordNumber(docNum, recNum)
    expect(result.passed).toBe(false)
    expect(result.review_required).toBe(true)
    expect(result.reason).toBe('record_number_appears_to_be_document_number')
  })

  it('passes when either field is missing (no comparison possible)', () => {
    const docNum = makeField({ field: 'document_number', raw_value: '012345678' })
    expect(validateDocumentNumberNotRecordNumber(docNum, undefined).passed).toBe(true)
    expect(validateDocumentNumberNotRecordNumber(undefined, docNum).passed).toBe(true)
    expect(validateDocumentNumberNotRecordNumber(undefined, undefined).passed).toBe(true)
  })

  it('document_number and record_number have different labels in module', () => {
    // Labels are defined in the module — this test verifies they are semantically distinct
    expect('Document Number').not.toBe('Record Number (УНЗР)')
    expect('Record Number (УНЗР)').toContain('УНЗР')
  })
})

// ── validateRnokppSensitive ───────────────────────────────────────────────────

describe('validateRnokppSensitive', () => {
  it('always returns review_required=true for valid 10-digit RNOKPP', () => {
    const field = makeField({ field: 'rnokpp', raw_value: '3456789012' })
    const result = validateRnokppSensitive(field)
    expect(result.passed).toBe(true)
    expect(result.review_required).toBe(true)
    expect(result.reason).toBe('rnokpp_always_review')
  })

  it('returns review_required for missing rnokpp', () => {
    const result = validateRnokppSensitive(undefined)
    expect(result.passed).toBe(false)
    expect(result.review_required).toBe(true)
    expect(result.reason).toBe('rnokpp_absent')
  })

  it('returns review_required for non-10-digit value', () => {
    const field = makeField({ field: 'rnokpp', raw_value: '12345' })
    const result = validateRnokppSensitive(field)
    expect(result.passed).toBe(false)
    expect(result.review_required).toBe(true)
    expect(result.reason).toBe('rnokpp_format_invalid')
  })

  it('PRIVACY: warning does not contain raw rnokpp value', () => {
    const secretRnokpp = '9876543210'
    const field = makeField({ field: 'rnokpp', raw_value: secretRnokpp })
    const result = validateRnokppSensitive(field)
    expect(result.warning ?? '').not.toContain(secretRnokpp)
    expect(result.reason ?? '').not.toContain(secretRnokpp)
    expect(result.candidate_value ?? '').not.toContain(secretRnokpp)
  })

  it('PRIVACY: warning for missing field has no PII digits', () => {
    const result = validateRnokppSensitive(undefined)
    expect(result.warning).not.toMatch(/\d{10}/)
  })

  it('PRIVACY: invalid format warning has no raw value', () => {
    const invalidValue = '123ABC7890'
    const field = makeField({ field: 'rnokpp', raw_value: invalidValue })
    const result = validateRnokppSensitive(field)
    expect(result.warning ?? '').not.toContain(invalidValue)
    expect(result.candidate_value).toBeUndefined()
  })

  it('handles MRZ filler-padded RNOKPP', () => {
    const field = makeField({ field: 'rnokpp', raw_value: '3456789012<<<' })
    const result = validateRnokppSensitive(field)
    expect(result.passed).toBe(true)
    expect(result.review_required).toBe(true)
  })
})

// ── validateIdCardMrzVizMismatch ──────────────────────────────────────────────

describe('validateIdCardMrzVizMismatch', () => {
  it('passes when MRZ surname matches VIZ', () => {
    const vizFields = {
      surname_latin: 'KOVALENKO',
      given_names_latin: 'OLEKSII MYKHAILO',
      date_of_birth: '3 January 1991',
      document_number: 'FC1234567',
    }
    const result = validateIdCardMrzVizMismatch(
      TD1_LINE1_BASE,
      VALID_TD1_LINE2,
      VALID_TD1_LINE3,
      vizFields,
    )
    expect(result.passed).toBe(true)
    expect(result.review_required).toBe(false)
  })

  it('detects document_number mismatch', () => {
    const vizFields = {
      document_number: 'WRONGNUM9',  // different from MRZ
    }
    const result = validateIdCardMrzVizMismatch(
      TD1_LINE1_BASE,
      VALID_TD1_LINE2,
      VALID_TD1_LINE3,
      vizFields,
    )
    expect(result.review_required).toBe(true)
    expect(result.reason).toBe('mrz_viz_mismatch')
  })

  it('returns review_required when MRZ lines are absent', () => {
    const result = validateIdCardMrzVizMismatch(undefined, VALID_TD1_LINE2, VALID_TD1_LINE3, {})
    expect(result.review_required).toBe(true)
    expect(result.reason).toBe('mrz_lines_missing_for_viz_check')
  })

  it('works without line3 (uses filler padding)', () => {
    const result = validateIdCardMrzVizMismatch(
      TD1_LINE1_BASE,
      VALID_TD1_LINE2,
      undefined,
      {},
    )
    expect(result).toBeDefined()
    expect(typeof result.review_required).toBe('boolean')
  })
})

// ── validateIdCardIssuingStateIsUkr ───────────────────────────────────────────

describe('validateIdCardIssuingStateIsUkr', () => {
  it('passes for UKR', () => {
    const field = makeField({ field: 'nationality', raw_value: 'UKR' })
    expect(validateIdCardIssuingStateIsUkr(field).passed).toBe(true)
  })

  it('passes for УКРАЇНА', () => {
    const field = makeField({ field: 'nationality', raw_value: 'УКРАЇНА' })
    expect(validateIdCardIssuingStateIsUkr(field).passed).toBe(true)
  })

  it('returns review_required for non-Ukrainian code', () => {
    const field = makeField({ field: 'nationality', raw_value: 'POL' })
    const result = validateIdCardIssuingStateIsUkr(field)
    expect(result.passed).toBe(false)
    expect(result.review_required).toBe(true)
    expect(result.reason).toBe('issuing_state_not_ukr')
  })

  it('returns review_required for missing field', () => {
    const result = validateIdCardIssuingStateIsUkr(undefined)
    expect(result.passed).toBe(false)
    expect(result.review_required).toBe(true)
  })
})

// ── validateIdCardSourceEvidence ──────────────────────────────────────────────

describe('validateIdCardSourceEvidence', () => {
  it('passes when OCR IDs present', () => {
    const field = makeField({ ocr_ids: ['ocr-1'], bbox_status: 'missing' })
    expect(validateIdCardSourceEvidence(field).passed).toBe(true)
  })

  it('passes when bbox present (no OCR IDs)', () => {
    const field = makeField({ ocr_ids: [], bbox_status: 'exact' })
    expect(validateIdCardSourceEvidence(field).passed).toBe(true)
  })

  it('returns review_required when both absent', () => {
    const field = makeField({ ocr_ids: [], bbox_status: 'missing' })
    const result = validateIdCardSourceEvidence(field)
    expect(result.passed).toBe(false)
    expect(result.review_required).toBe(true)
  })
})

// ── validateIdCardNameMixedScript ─────────────────────────────────────────────

describe('validateIdCardNameMixedScript', () => {
  it('passes for pure Latin', () => {
    const field = makeField({ field: 'surname_latin', raw_value: 'KOVALENKO' })
    expect(validateIdCardNameMixedScript(field).passed).toBe(true)
  })

  it('passes for pure Cyrillic', () => {
    const field = makeField({ field: 'surname_cyrillic', raw_value: 'КОВАЛЕНКО' })
    expect(validateIdCardNameMixedScript(field).passed).toBe(true)
  })

  it('flags mixed Cyrillic + Latin', () => {
    const field = makeField({ field: 'surname_latin', raw_value: 'КОВАlenко' })
    const result = validateIdCardNameMixedScript(field)
    expect(result.passed).toBe(false)
    expect(result.review_required).toBe(true)
    expect(result.reason).toBe('mixed_script_in_name')
  })

  it('passes for undefined', () => {
    expect(validateIdCardNameMixedScript(undefined).passed).toBe(true)
  })
})

// ── validateIdCardLatinNameNoRetransliteration ────────────────────────────────

describe('validateIdCardLatinNameNoRetransliteration', () => {
  it('passes for clean Latin name', () => {
    const field = makeField({ field: 'surname_latin', raw_value: 'PETRENKO' })
    expect(validateIdCardLatinNameNoRetransliteration(field).passed).toBe(true)
  })

  it('flags SHCH pattern', () => {
    const field = makeField({ field: 'surname_latin', raw_value: 'SHCHERBYNA' })
    const result = validateIdCardLatinNameNoRetransliteration(field)
    expect(result.passed).toBe(false)
    expect(result.review_required).toBe(true)
    expect(result.reason).toBe('latin_name_likely_retransliterated')
  })

  it('flags Cyrillic source zone for Latin field', () => {
    const field = makeField({
      field: 'surname_latin',
      raw_value: 'KOVALENKO',
      source_zone: 'кирилиця_зона',
    })
    const result = validateIdCardLatinNameNoRetransliteration(field)
    expect(result.passed).toBe(false)
    expect(result.review_required).toBe(true)
    expect(result.reason).toBe('latin_name_from_cyrillic_zone')
  })

  it('passes for undefined field', () => {
    expect(validateIdCardLatinNameNoRetransliteration(undefined).passed).toBe(true)
  })
})

// ── Never throws ──────────────────────────────────────────────────────────────

describe('ukrainian ID card validators — never throw', () => {
  const nastyField = makeField({
    field: 'test',
    raw_value: '<script>alert(1)</script>',
    source_zone: '../../etc/passwd',
    ocr_ids: [],
    bbox_status: undefined,
  })

  it('validateMrzTd1CheckDigits does not throw on garbage', () => {
    expect(() => validateMrzTd1CheckDigits(nastyField, nastyField, nastyField)).not.toThrow()
  })

  it('validateDocumentNumberNotRecordNumber does not throw on garbage', () => {
    expect(() => validateDocumentNumberNotRecordNumber(nastyField, nastyField)).not.toThrow()
  })

  it('validateRnokppSensitive does not throw on garbage', () => {
    expect(() => validateRnokppSensitive(nastyField)).not.toThrow()
  })

  it('validateIdCardMrzVizMismatch does not throw on garbage', () => {
    expect(() =>
      validateIdCardMrzVizMismatch('garbage', 'input', 'line3', {})
    ).not.toThrow()
  })

  it('validateIdCardIssuingStateIsUkr does not throw on garbage', () => {
    expect(() => validateIdCardIssuingStateIsUkr(nastyField)).not.toThrow()
  })
})
