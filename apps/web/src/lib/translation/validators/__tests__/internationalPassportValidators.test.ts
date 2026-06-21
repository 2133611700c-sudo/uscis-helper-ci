/**
 * International Passport Validators Tests — Messenginfo v6.0
 *
 * Tests for internationalPassportValidators.ts:
 *   - validateMrzTd3CheckDigits
 *   - validateMrzVizMismatch
 *   - validateLatinNameNoRetransliteration
 *   - validateDateOfExpiryNotExpired
 *   - validateIssuingStateIsUkr
 *   - validatePersonalNumberSensitive
 *   - validateIntlPassportSourceEvidence
 *   - validateNameMixedScript
 *
 * Privacy invariant: personal_number raw values must NEVER appear
 * in validator output (warnings, reasons, or candidate_value).
 */
import { describe, it, expect } from 'vitest'
import type { ExtractedField } from '../../types'
import {
  validateMrzTd3CheckDigits,
  validateMrzVizMismatch,
  validateLatinNameNoRetransliteration,
  validateDateOfExpiryNotExpired,
  validateIssuingStateIsUkr,
  validatePersonalNumberSensitive,
  validateIntlPassportSourceEvidence,
  validateNameMixedScript,
} from '../internationalPassportValidators'

// ── Fixtures ──────────────────────────────────────────────────────────────────

// Valid TD3 MRZ (44 chars each)
const VALID_TD3_LINE1 = 'P<UKRKOVALENKO<<OLEKSII<MYKHAILO<<<<<<<<<<<<'
const VALID_TD3_LINE2 = 'FC12345679UKR9101036M31053191234567890<<<<71'

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

// ── validateMrzTd3CheckDigits ─────────────────────────────────────────────────

describe('validateMrzTd3CheckDigits', () => {
  it('passes for valid TD3 MRZ', () => {
    const line1 = makeField({ field: 'mrz_line_1', raw_value: VALID_TD3_LINE1 })
    const line2 = makeField({ field: 'mrz_line_2', raw_value: VALID_TD3_LINE2 })
    const result = validateMrzTd3CheckDigits(line1, line2)
    expect(result.passed).toBe(true)
    expect(result.review_required).toBe(false)
  })

  it('returns review_required when mrz_line_1 is missing', () => {
    const line2 = makeField({ field: 'mrz_line_2', raw_value: VALID_TD3_LINE2 })
    const result = validateMrzTd3CheckDigits(undefined, line2)
    expect(result.passed).toBe(false)
    expect(result.review_required).toBe(true)
    expect(result.reason).toBe('mrz_lines_missing')
  })

  it('returns review_required when mrz_line_2 is missing', () => {
    const line1 = makeField({ field: 'mrz_line_1', raw_value: VALID_TD3_LINE1 })
    const result = validateMrzTd3CheckDigits(line1, undefined)
    expect(result.passed).toBe(false)
    expect(result.review_required).toBe(true)
  })

  it('returns review_required for wrong line length', () => {
    const line1 = makeField({ field: 'mrz_line_1', raw_value: 'P<UKR' }) // too short
    const line2 = makeField({ field: 'mrz_line_2', raw_value: VALID_TD3_LINE2 })
    const result = validateMrzTd3CheckDigits(line1, line2)
    expect(result.passed).toBe(false)
    expect(result.review_required).toBe(true)
    expect(result.reason).toBe('mrz_parse_error')
  })

  it('returns review_required when doc number check digit is corrupted', () => {
    // Corrupt check digit at position 9 (doc number check)
    const corruptLine2 = VALID_TD3_LINE2.substring(0, 9) + '0' + VALID_TD3_LINE2.substring(10)
    const line1 = makeField({ field: 'mrz_line_1', raw_value: VALID_TD3_LINE1 })
    const line2 = makeField({ field: 'mrz_line_2', raw_value: corruptLine2 })
    const result = validateMrzTd3CheckDigits(line1, line2)
    expect(result.passed).toBe(false)
    expect(result.review_required).toBe(true)
    expect(result.reason).toBe('mrz_check_digit_failure')
  })

  it('returns review_required when composite check digit is corrupted', () => {
    // Corrupt composite check digit (last char of line2, position 43)
    const corruptLine2 = VALID_TD3_LINE2.substring(0, 43) + '0'
    const line1 = makeField({ field: 'mrz_line_1', raw_value: VALID_TD3_LINE1 })
    const line2 = makeField({ field: 'mrz_line_2', raw_value: corruptLine2 })
    const result = validateMrzTd3CheckDigits(line1, line2)
    expect(result.passed).toBe(false)
    expect(result.review_required).toBe(true)
  })

  it('returns review_required for empty raw_value', () => {
    const line1 = makeField({ field: 'mrz_line_1', raw_value: '' })
    const line2 = makeField({ field: 'mrz_line_2', raw_value: VALID_TD3_LINE2 })
    const result = validateMrzTd3CheckDigits(line1, line2)
    expect(result.review_required).toBe(true)
  })
})

// ── validateMrzVizMismatch ────────────────────────────────────────────────────

describe('validateMrzVizMismatch', () => {
  it('passes when MRZ surname matches VIZ (case-insensitive)', () => {
    const vizFields = {
      surname_latin: 'KOVALENKO',
      given_names_latin: 'OLEKSII MYKHAILO',
      date_of_birth: '3 January 1991',
      document_number: 'FC1234567',
    }
    const result = validateMrzVizMismatch(VALID_TD3_LINE1, VALID_TD3_LINE2, vizFields)
    expect(result.passed).toBe(true)
    expect(result.review_required).toBe(false)
  })

  it('detects surname mismatch', () => {
    const vizFields = {
      surname_latin: 'KOWALENKO', // different spelling
      given_names_latin: 'OLEKSII MYKHAILO',
      date_of_birth: '3 January 1991',
      document_number: 'FC1234567',
    }
    const result = validateMrzVizMismatch(VALID_TD3_LINE1, VALID_TD3_LINE2, vizFields)
    expect(result.passed).toBe(false)
    expect(result.review_required).toBe(true)
    expect(result.reason).toBe('mrz_viz_mismatch')
    expect(result.warning).toContain('surname_latin')
  })

  it('returns review_required when MRZ lines are missing', () => {
    const result = validateMrzVizMismatch(undefined, VALID_TD3_LINE2, {})
    expect(result.review_required).toBe(true)
    expect(result.reason).toBe('mrz_lines_missing_for_viz_check')
  })

  it('returns review_required for invalid MRZ', () => {
    const result = validateMrzVizMismatch('SHORT', VALID_TD3_LINE2, {})
    expect(result.review_required).toBe(true)
    expect(result.reason).toBe('mrz_parse_error_for_viz_check')
  })

  it('passes when vizFields is empty (no VIZ data to compare)', () => {
    const result = validateMrzVizMismatch(VALID_TD3_LINE1, VALID_TD3_LINE2, {})
    expect(result.passed).toBe(true)
    expect(result.review_required).toBe(false)
  })
})

// ── validateLatinNameNoRetransliteration ──────────────────────────────────────

describe('validateLatinNameNoRetransliteration', () => {
  it('passes for a normal Latin name without retransliteration patterns', () => {
    const field = makeField({ field: 'surname_latin', raw_value: 'KOVALENKO' })
    const result = validateLatinNameNoRetransliteration(field)
    expect(result.passed).toBe(true)
    expect(result.review_required).toBe(false)
  })

  it('flags SHCH pattern (strong retransliteration signal)', () => {
    const field = makeField({ field: 'surname_latin', raw_value: 'SHCHERBENKO' })
    const result = validateLatinNameNoRetransliteration(field)
    expect(result.passed).toBe(false)
    expect(result.review_required).toBe(true)
    expect(result.reason).toBe('latin_name_likely_retransliterated')
  })

  it('flags IE pattern (strong retransliteration signal)', () => {
    const field = makeField({ field: 'given_names_latin', raw_value: 'OLEKSIE' })
    const result = validateLatinNameNoRetransliteration(field)
    expect(result.passed).toBe(false)
    expect(result.review_required).toBe(true)
  })

  it('flags Cyrillic source zone for Latin field', () => {
    const field = makeField({
      field: 'surname_latin',
      raw_value: 'KOVALENKO',
      source_zone: 'cyrillic_layer',
    })
    const result = validateLatinNameNoRetransliteration(field)
    expect(result.passed).toBe(false)
    expect(result.review_required).toBe(true)
    expect(result.reason).toBe('latin_name_from_cyrillic_zone')
  })

  it('passes for undefined field', () => {
    const result = validateLatinNameNoRetransliteration(undefined)
    expect(result.passed).toBe(true)
    expect(result.review_required).toBe(false)
  })

  it('passes for a name with KH that is not retransliteration (real name)', () => {
    // 'MIKHAIL' has KH but it is a legitimate transliteration in some passports
    const field = makeField({ field: 'given_names_latin', raw_value: 'MIKHAIL' })
    const result = validateLatinNameNoRetransliteration(field)
    // KH is in weak patterns, not strong — should pass (no strong signal)
    expect(result.passed).toBe(true)
  })
})

// ── validateDateOfExpiryNotExpired ────────────────────────────────────────────

describe('validateDateOfExpiryNotExpired', () => {
  it('passes for a future expiry date', () => {
    // Use a date far in the future
    const field = makeField({ field: 'date_of_expiry', raw_value: '1 January 2035' })
    const result = validateDateOfExpiryNotExpired(field)
    expect(result.passed).toBe(true)
    expect(result.review_required).toBe(false)
  })

  it('warns (passed=true) for expired passport — does not block', () => {
    const field = makeField({ field: 'date_of_expiry', raw_value: '1 January 2020' })
    const result = validateDateOfExpiryNotExpired(field)
    // warn only — not a blocking failure
    expect(result.passed).toBe(true)
    expect(result.reason).toBe('passport_expired')
    expect(result.warning).toContain('expired')
  })

  it('returns review_required for invalid date format', () => {
    const field = makeField({ field: 'date_of_expiry', raw_value: '2025-01-01' })
    const result = validateDateOfExpiryNotExpired(field)
    expect(result.passed).toBe(false)
    expect(result.review_required).toBe(true)
    expect(result.reason).toBe('expiry_date_format_invalid')
  })

  it('returns review_required for unparseable month', () => {
    const field = makeField({ field: 'date_of_expiry', raw_value: '1 Janvary 2035' })
    const result = validateDateOfExpiryNotExpired(field)
    expect(result.passed).toBe(false)
    expect(result.review_required).toBe(true)
  })

  it('passes for undefined field', () => {
    const result = validateDateOfExpiryNotExpired(undefined)
    expect(result.passed).toBe(true)
    expect(result.review_required).toBe(false)
  })
})

// ── validateIssuingStateIsUkr ─────────────────────────────────────────────────

describe('validateIssuingStateIsUkr', () => {
  it('passes for UKR', () => {
    const field = makeField({ field: 'issuing_state_code', raw_value: 'UKR' })
    expect(validateIssuingStateIsUkr(field).passed).toBe(true)
  })

  it('passes for UKRAINE (full name)', () => {
    const field = makeField({ field: 'issuing_state_code', raw_value: 'UKRAINE' })
    expect(validateIssuingStateIsUkr(field).passed).toBe(true)
  })

  it('passes for УКРАЇНА (Cyrillic)', () => {
    const field = makeField({ field: 'issuing_state_code', raw_value: 'УКРАЇНА' })
    expect(validateIssuingStateIsUkr(field).passed).toBe(true)
  })

  it('returns review_required for non-Ukrainian state code', () => {
    const field = makeField({ field: 'issuing_state_code', raw_value: 'POL' })
    const result = validateIssuingStateIsUkr(field)
    expect(result.passed).toBe(false)
    expect(result.review_required).toBe(true)
    expect(result.reason).toBe('issuing_state_not_ukr')
  })

  it('returns review_required for missing field', () => {
    const result = validateIssuingStateIsUkr(undefined)
    expect(result.passed).toBe(false)
    expect(result.review_required).toBe(true)
    expect(result.reason).toBe('issuing_state_missing')
  })

  it('is case-insensitive (ukr → passes)', () => {
    const field = makeField({ field: 'issuing_state_code', raw_value: 'ukr' })
    expect(validateIssuingStateIsUkr(field).passed).toBe(true)
  })
})

// ── validatePersonalNumberSensitive ───────────────────────────────────────────

describe('validatePersonalNumberSensitive', () => {
  it('always returns review_required=true for valid 10-digit RNOKPP', () => {
    const field = makeField({ field: 'personal_number', raw_value: '1234567890' })
    const result = validatePersonalNumberSensitive(field)
    // Format is valid but still always review_required
    expect(result.passed).toBe(true)
    expect(result.review_required).toBe(true)
    expect(result.reason).toBe('personal_number_always_review')
  })

  it('returns review_required for missing personal_number', () => {
    const result = validatePersonalNumberSensitive(undefined)
    expect(result.passed).toBe(false)
    expect(result.review_required).toBe(true)
    expect(result.reason).toBe('personal_number_absent')
  })

  it('returns review_required for non-10-digit value', () => {
    const field = makeField({ field: 'personal_number', raw_value: '12345' })
    const result = validatePersonalNumberSensitive(field)
    expect(result.passed).toBe(false)
    expect(result.review_required).toBe(true)
    expect(result.reason).toBe('personal_number_format_invalid')
  })

  it('PRIVACY: warning does not contain raw personal_number value', () => {
    const secretValue = '9876543210'
    const field = makeField({ field: 'personal_number', raw_value: secretValue })
    const result = validatePersonalNumberSensitive(field)
    // The raw value must NEVER appear in any output field
    expect(result.warning ?? '').not.toContain(secretValue)
    expect(result.reason ?? '').not.toContain(secretValue)
    expect(result.candidate_value ?? '').not.toContain(secretValue)
  })

  it('PRIVACY: warning for missing field does not include any PII context', () => {
    const result = validatePersonalNumberSensitive(undefined)
    // Should not mention RNOKPP digits or format that could be confused with PII
    expect(result.warning).not.toMatch(/\d{10}/)
  })

  it('PRIVACY: warning for invalid format does not include raw value', () => {
    const invalidValue = '123ABC456'
    const field = makeField({ field: 'personal_number', raw_value: invalidValue })
    const result = validatePersonalNumberSensitive(field)
    expect(result.warning ?? '').not.toContain(invalidValue)
    expect(result.candidate_value).toBeUndefined()
  })

  it('handles MRZ filler-padded personal number', () => {
    // MRZ personal number may have << fillers: '1234567890<<<<'
    const field = makeField({ field: 'personal_number', raw_value: '1234567890<<<<' })
    const result = validatePersonalNumberSensitive(field)
    // After stripping fillers → '1234567890' (10 digits) — should be valid
    expect(result.passed).toBe(true)
    expect(result.review_required).toBe(true)
  })
})

// ── validateIntlPassportSourceEvidence ───────────────────────────────────────

describe('validateIntlPassportSourceEvidence', () => {
  it('passes when field has OCR IDs', () => {
    const field = makeField({ ocr_ids: ['ocr-1', 'ocr-2'], bbox_status: 'missing' })
    expect(validateIntlPassportSourceEvidence(field).passed).toBe(true)
  })

  it('passes when field has bbox (no OCR IDs)', () => {
    const field = makeField({ ocr_ids: [], bbox_status: 'exact' })
    expect(validateIntlPassportSourceEvidence(field).passed).toBe(true)
  })

  it('returns review_required when both OCR IDs and bbox are absent', () => {
    const field = makeField({ ocr_ids: [], bbox_status: 'missing' })
    const result = validateIntlPassportSourceEvidence(field)
    expect(result.passed).toBe(false)
    expect(result.review_required).toBe(true)
    expect(result.reason).toBe('no_ocr_evidence')
  })
})

// ── validateNameMixedScript ───────────────────────────────────────────────────

describe('validateNameMixedScript', () => {
  it('passes for pure Latin name', () => {
    const field = makeField({ field: 'surname_latin', raw_value: 'KOVALENKO' })
    expect(validateNameMixedScript(field).passed).toBe(true)
  })

  it('passes for pure Cyrillic name', () => {
    const field = makeField({ field: 'surname_cyrillic', raw_value: 'КОВАЛЕНКО' })
    expect(validateNameMixedScript(field).passed).toBe(true)
  })

  it('flags mixed Cyrillic + Latin in a single field', () => {
    const field = makeField({ field: 'surname_latin', raw_value: 'KOVAЛенко' })
    const result = validateNameMixedScript(field)
    expect(result.passed).toBe(false)
    expect(result.review_required).toBe(true)
    expect(result.reason).toBe('mixed_script_in_name')
  })

  it('passes for undefined field', () => {
    const result = validateNameMixedScript(undefined)
    expect(result.passed).toBe(true)
  })
})

// ── Never throws ──────────────────────────────────────────────────────────────

describe('international passport validators — never throw', () => {
  const nastyField = makeField({
    field: 'test',
    raw_value: '<script>alert(1)</script>',
    source_zone: '../../etc/passwd',
    ocr_ids: [],
    bbox_status: undefined,
  })

  it('validateMrzTd3CheckDigits does not throw on garbage', () => {
    expect(() => validateMrzTd3CheckDigits(nastyField, nastyField)).not.toThrow()
  })

  it('validateMrzVizMismatch does not throw on garbage', () => {
    expect(() => validateMrzVizMismatch('garbage', 'input', {})).not.toThrow()
  })

  it('validateLatinNameNoRetransliteration does not throw on garbage', () => {
    expect(() => validateLatinNameNoRetransliteration(nastyField)).not.toThrow()
  })

  it('validatePersonalNumberSensitive does not throw on garbage', () => {
    expect(() => validatePersonalNumberSensitive(nastyField)).not.toThrow()
  })

  it('validateIssuingStateIsUkr does not throw on garbage', () => {
    expect(() => validateIssuingStateIsUkr(nastyField)).not.toThrow()
  })

  it('validateDateOfExpiryNotExpired does not throw on garbage', () => {
    expect(() => validateDateOfExpiryNotExpired(nastyField)).not.toThrow()
  })
})
