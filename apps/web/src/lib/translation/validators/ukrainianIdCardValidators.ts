/**
 * Ukrainian ID Card Validators — Messenginfo v6.0
 *
 * Validators specific to Ukrainian ID card (ua_id_card).
 * All functions are pure and never throw.
 *
 * Safety rules enforced here:
 *   - MRZ TD1 check digits validated per ICAO 9303
 *   - MRZ/VIZ field mismatch → review_required=true
 *   - document_number ≠ record_number (УНЗР) — CRITICAL separation
 *   - rnokpp: reviewRequired=true always, NEVER logged or rendered to customer
 *   - issuing_state_code must be 'UKR'
 *   - Latin names used verbatim — no re-transliteration
 *   - Both Latin and Cyrillic names present on bilingual face
 *
 * IMPORTANT: rnokpp values MUST NOT appear in any log output.
 * The validateRnokppSensitive function is deliberately minimal and
 * never surfaces the raw value.
 */
import type { ExtractedField } from '../types'
import {
  parseTd1,
  detectMrzVizMismatches,
} from '../identity/mrzParser'

// ── Shared result type ────────────────────────────────────────────────────────

export interface IdCardValidationResult {
  passed: boolean
  review_required: boolean
  reason?: string
  warning?: string
  candidate_value?: string
}

// ── 1. mrz_td1_check_digits ───────────────────────────────────────────────────

/**
 * Validates MRZ TD1 check digits (ID card).
 * Parses all 3 MRZ lines, checks per ICAO 9303 TD1:
 *   - Document number check digit (line 1, pos 14)
 *   - Date of birth check digit (line 2, pos 6)
 *   - Date of expiry check digit (line 2, pos 13)
 *   - Composite check digit (line 2, pos 29)
 *     covers: line1[0..29] + line2[0..6] + line2[7..28]
 *
 * Returns review_required=true if any check digit fails.
 */
export function validateMrzTd1CheckDigits(
  mrzLine1Field: ExtractedField | undefined,
  mrzLine2Field: ExtractedField | undefined,
  mrzLine3Field?: ExtractedField | undefined,
): IdCardValidationResult {
  if (!mrzLine1Field?.raw_value || !mrzLine2Field?.raw_value) {
    return {
      passed: false,
      review_required: true,
      reason: 'mrz_lines_missing',
      warning: 'MRZ line 1 or 2 is absent — cannot validate check digits.',
    }
  }

  const line1 = mrzLine1Field.raw_value.trim()
  const line2 = mrzLine2Field.raw_value.trim()
  // line3 is the name line — not always stored as a separate field,
  // use empty filler if absent (check digits don't depend on line 3)
  const line3 = mrzLine3Field?.raw_value?.trim() ?? '<'.repeat(30)

  const result = parseTd1(line1, line2, line3)

  if (result.errors.length > 0) {
    return {
      passed: false,
      review_required: true,
      reason: 'mrz_parse_error',
      warning: `MRZ TD1 parse error(s): ${result.errors.join('; ')}`,
    }
  }

  if (result.reviewRequired) {
    const failedChecks = result.checkResults
      .filter(r => r.valid === false)
      .map(r => r.field)
    const failedDesc = failedChecks.length > 0 ? failedChecks.join(', ') : 'unknown'

    return {
      passed: false,
      review_required: true,
      reason: 'td1_composite_check_failure',
      warning: `MRZ TD1 check digit validation failed for: ${failedDesc}.`,
    }
  }

  return { passed: true, review_required: false }
}

// ── 2. document_number_not_record_number ──────────────────────────────────────

/**
 * CRITICAL VALIDATOR: Ensures document_number and record_number (УНЗР) are distinct.
 *
 * Ukrainian ID Card has TWO separate identification numbers:
 *   - document_number: 9-digit printed number on card face (e.g. '012345678')
 *   - record_number (УНЗР): registration number from TD1 MRZ optional data 1
 *     (line 1, positions 15–29), format YYYYMMDDNNNNNC (14 chars)
 *
 * These fields MUST come from different source zones and have different formats.
 * If they appear identical or come from the same OCR zone, review is required.
 */
export function validateDocumentNumberNotRecordNumber(
  documentNumberField: ExtractedField | undefined,
  recordNumberField: ExtractedField | undefined,
): IdCardValidationResult {
  if (!documentNumberField || !recordNumberField) {
    return { passed: true, review_required: false }
  }

  const docNum = documentNumberField.raw_value?.trim() ?? ''
  const recNum = recordNumberField.raw_value?.trim() ?? ''

  // Check for identical values (strong conflict signal)
  if (docNum && recNum && docNum === recNum) {
    return {
      passed: false,
      review_required: true,
      reason: 'document_number_equals_record_number',
      warning:
        `document_number and record_number (УНЗР) have identical values '${docNum}'. ` +
        `These are distinct fields — document_number is the 9-digit card face number, ` +
        `record_number (УНЗР) is from MRZ optional data 1. Manual review required.`,
    }
  }

  // Check for same OCR source zone
  if (
    documentNumberField.source_zone &&
    recordNumberField.source_zone &&
    documentNumberField.source_zone === recordNumberField.source_zone
  ) {
    return {
      passed: false,
      review_required: true,
      reason: 'document_number_record_number_same_zone',
      warning:
        `document_number and record_number (УНЗР) extracted from same zone ` +
        `'${documentNumberField.source_zone}'. These fields occupy different zones — review required.`,
    }
  }

  // Check for overlapping OCR token IDs
  const docIds = documentNumberField.ocr_ids ?? []
  const recIds = recordNumberField.ocr_ids ?? []
  const sharedIds = docIds.filter(id => recIds.includes(id))
  if (sharedIds.length > 0) {
    return {
      passed: false,
      review_required: true,
      reason: 'document_number_record_number_share_ocr_ids',
      warning:
        `document_number and record_number share OCR token IDs [${sharedIds.join(', ')}]. ` +
        `Token overlap — possible field confusion. Manual review required.`,
    }
  }

  // Validate format separation:
  // document_number: typically 9 digits (numeric only, printed on face)
  // record_number: 14-char УНЗР starting with year (YYYY...)
  if (docNum && /^\d{14}/.test(docNum)) {
    return {
      passed: false,
      review_required: true,
      reason: 'document_number_appears_to_be_record_number',
      warning:
        `document_number value '${docNum}' appears to be in УНЗР format (14+ digits). ` +
        `Verify that document_number is the 9-digit printed card number, not the УНЗР.`,
    }
  }

  if (recNum && /^\d{9}$/.test(recNum)) {
    return {
      passed: false,
      review_required: true,
      reason: 'record_number_appears_to_be_document_number',
      warning:
        `record_number value '${recNum}' appears to be a 9-digit document number. ` +
        `Verify that record_number (УНЗР) is from MRZ optional data 1, not the card face number.`,
    }
  }

  return { passed: true, review_required: false }
}

// ── 3. rnokpp_sensitive ───────────────────────────────────────────────────────

/**
 * RNOKPP no-log gate.
 *
 * SECURITY RULE: This function MUST NOT log or surface the raw rnokpp
 * value in any warning, reason, or candidate_value field.
 *
 * The RNOKPP is:
 *   - Always review_required=true (operator must manually confirm)
 *   - Never included in customer PDF (enforced at render layer)
 *   - Never included in audit logs or telemetry
 *   - Excluded from PacketIdentityAnchor
 *
 * This validator only checks that the field is present and has the correct
 * format (10-digit numeric), WITHOUT surfacing the value.
 */
export function validateRnokppSensitive(
  field: ExtractedField | undefined,
): IdCardValidationResult {
  // Always review_required regardless of validity
  if (!field?.raw_value || field.raw_value.trim() === '') {
    return {
      passed: false,
      review_required: true,
      reason: 'rnokpp_absent',
      warning: 'rnokpp field is absent. Operator must verify from source document.',
      // NOTE: never log raw_value here
    }
  }

  const raw = field.raw_value.trim().replace(/</g, '') // strip MRZ fillers

  if (!/^\d{10}$/.test(raw)) {
    return {
      passed: false,
      review_required: true,
      reason: 'rnokpp_format_invalid',
      warning:
        'rnokpp does not match expected 10-digit РНОКПП format. ' +
        'Operator review required.',
      // NOTE: never include raw value in warning
    }
  }

  // Format valid — but still always review_required
  return {
    passed: true,
    review_required: true,
    reason: 'rnokpp_always_review',
    warning: 'rnokpp is always subject to operator review before use.',
  }
}

// ── 4. mrz_viz_mismatch (ID card) ─────────────────────────────────────────────

/**
 * Detects mismatch between MRZ TD1 fields and VIZ (Visual Inspection Zone) fields.
 * Used for mrz_viz_surname_match, mrz_viz_dob_match, mrz_viz_docnum_match validators.
 *
 * Ukrainian ID card has bilingual face (Latin + Cyrillic) — MRZ carries Latin names.
 * Comparison is case-insensitive and whitespace-normalized.
 */
export function validateIdCardMrzVizMismatch(
  mrzLine1: string | undefined,
  mrzLine2: string | undefined,
  mrzLine3: string | undefined,
  vizFields: Record<string, string | undefined>,
): IdCardValidationResult {
  if (!mrzLine1 || !mrzLine2) {
    return {
      passed: false,
      review_required: true,
      reason: 'mrz_lines_missing_for_viz_check',
      warning: 'Cannot perform MRZ/VIZ cross-check: MRZ lines absent.',
    }
  }

  const td1 = parseTd1(
    mrzLine1,
    mrzLine2,
    mrzLine3 ?? '<'.repeat(30),
  )

  if (td1.errors.length > 0) {
    return {
      passed: false,
      review_required: true,
      reason: 'mrz_parse_error_for_viz_check',
      warning: `MRZ parse error prevents VIZ comparison: ${td1.errors.join('; ')}`,
    }
  }

  const mrzFieldsRecord: Record<string, string | null> = {
    surname_latin:     td1.surname,
    given_names_latin: td1.givenNames,
    date_of_birth:     td1.dateOfBirth,
    document_number:   td1.documentNumber,
  }

  const vizFieldsRecord: Record<string, string | null> = {}
  for (const [k, v] of Object.entries(vizFields)) {
    vizFieldsRecord[k] = v ?? null
  }

  const mismatches = detectMrzVizMismatches(
    mrzFieldsRecord,
    vizFieldsRecord,
    ['surname_latin', 'given_names_latin', 'date_of_birth', 'document_number'],
  )

  if (mismatches.length > 0) {
    const summary = mismatches
      .map(m => `${m.field}: MRZ='${m.mrzValue}' vs VIZ='${m.vizValue}'`)
      .join('; ')

    return {
      passed: false,
      review_required: true,
      reason: 'mrz_viz_mismatch',
      warning: `MRZ/VIZ mismatch detected: ${summary}`,
    }
  }

  return { passed: true, review_required: false }
}

// ── 5. issuing_state_is_ukr ───────────────────────────────────────────────────

const VALID_UKR_STATE_CODES = new Set(['UKR', 'UKRAINE', 'УКРАЇНА'])

/**
 * Validates that the issuing state code is 'UKR'.
 * This module handles Ukrainian ID cards only.
 */
export function validateIdCardIssuingStateIsUkr(
  field: ExtractedField | undefined,
): IdCardValidationResult {
  if (!field?.raw_value) {
    return {
      passed: false,
      review_required: true,
      reason: 'issuing_state_missing',
      warning: 'nationality/issuing_state_code is missing — cannot verify document is Ukrainian.',
    }
  }

  const normalized = field.raw_value.trim().toUpperCase()

  if (!VALID_UKR_STATE_CODES.has(normalized)) {
    return {
      passed: false,
      review_required: true,
      reason: 'issuing_state_not_ukr',
      warning:
        `nationality '${field.raw_value}' does not match expected Ukrainian designators. ` +
        `This module only processes Ukrainian ID cards.`,
    }
  }

  return { passed: true, review_required: false }
}

// ── 6. source_evidence_required ───────────────────────────────────────────────

export function validateIdCardSourceEvidence(
  field: ExtractedField,
): IdCardValidationResult {
  const hasOcrIds = (field.ocr_ids?.length ?? 0) > 0
  const hasBbox = field.bbox_status && field.bbox_status !== 'missing'

  if (!hasOcrIds && !hasBbox) {
    return {
      passed: false,
      review_required: true,
      reason: 'no_ocr_evidence',
      warning: `Field '${field.field}' has no OCR token IDs or bbox evidence. Value may not be traceable.`,
    }
  }

  return { passed: true, review_required: false }
}

// ── 7. name_mixed_script ─────────────────────────────────────────────────────

/**
 * Detects mixed Cyrillic + Latin characters within a single name field.
 * ID card has both Latin and Cyrillic names on the face — but each field
 * should contain only one script, not a mix.
 */
export function validateIdCardNameMixedScript(
  field: ExtractedField | undefined,
): IdCardValidationResult {
  if (!field?.raw_value) return { passed: true, review_required: false }

  const value = field.raw_value
  const hasCyrillic = /[а-яА-ЯіІїЇєЄёЁ]/.test(value)
  const hasLatin = /[a-zA-Z]/.test(value)

  if (hasCyrillic && hasLatin) {
    return {
      passed: false,
      review_required: true,
      reason: 'mixed_script_in_name',
      warning:
        `Field '${field.field}' contains both Cyrillic and Latin characters — ` +
        `possible extraction error. Each name field should be in a single script.`,
    }
  }

  return { passed: true, review_required: false }
}

// ── 8. latin_name_no_retransliteration (ID card) ─────────────────────────────

const STRONG_RETRANSLITERATION_PATTERNS_ID = [
  /SHCH/i,
  /\bIE\b/i,
]

/**
 * Detects re-transliteration in Latin name fields on the ID card.
 * Same logic as international passport — Latin names come from the bilingual
 * face VIZ and must not be generated by transliterating the Cyrillic.
 */
export function validateIdCardLatinNameNoRetransliteration(
  field: ExtractedField | undefined,
): IdCardValidationResult {
  if (!field?.raw_value) return { passed: true, review_required: false }

  const value = field.raw_value.trim()

  for (const pattern of STRONG_RETRANSLITERATION_PATTERNS_ID) {
    if (pattern.test(value)) {
      return {
        passed: false,
        review_required: true,
        reason: 'latin_name_likely_retransliterated',
        warning:
          `Field '${field.field}' value '${value}' contains patterns ` +
          `suggesting re-transliteration from Cyrillic. ` +
          `Use the official Latin spelling from the card face VIZ verbatim.`,
      }
    }
  }

  if (field.source_zone) {
    const zoneLower = field.source_zone.toLowerCase()
    const isCyrillicZone =
      zoneLower.includes('cyrillic') ||
      zoneLower.includes('кирил') ||
      zoneLower.includes('ukr_text')

    if (isCyrillicZone) {
      return {
        passed: false,
        review_required: true,
        reason: 'latin_name_from_cyrillic_zone',
        warning:
          `Field '${field.field}' was extracted from a Cyrillic source zone '${field.source_zone}'. ` +
          `Latin names must come from the Latin/VIZ zone of the card face.`,
      }
    }
  }

  return { passed: true, review_required: false }
}
