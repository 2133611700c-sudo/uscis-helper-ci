/**
 * International Passport Validators — Messenginfo v6.0
 *
 * Validators specific to Ukrainian international passport (ua_international_passport).
 * All functions are pure and never throw.
 *
 * Safety rules enforced here:
 *   - MRZ TD3 check digits validated per ICAO 9303
 *   - MRZ/VIZ field mismatch → review_required=true
 *   - Latin names used verbatim — no re-transliteration allowed
 *   - personal_number (RNOKPP): reviewRequired=true always, never logged
 *   - issuing_state_code must be 'UKR'
 *   - date_of_expiry validated as not expired (warn, not block)
 *
 * IMPORTANT: personal_number values MUST NOT appear in any log output.
 * The validatePersonalNumberSensitive function is deliberately minimal —
 * it only confirms review_required and never surfaces the raw value.
 */
import type { ExtractedField } from '../types'
import {
  parseTd3,
  detectMrzVizMismatches,
} from '../identity/mrzParser'

// ── Shared result type ────────────────────────────────────────────────────────

export interface IntlPassportValidationResult {
  passed: boolean
  review_required: boolean
  reason?: string
  warning?: string
  candidate_value?: string
}

// ── 1. mrz_td3_check_digits ───────────────────────────────────────────────────

/**
 * Validates MRZ TD3 check digits (international passport).
 * Parses both MRZ lines, checks all 5 check digits per ICAO 9303:
 *   - Document number check digit
 *   - Date of birth check digit
 *   - Date of expiry check digit
 *   - Personal number check digit
 *   - Composite check digit (covers line2[0..42])
 *
 * Returns review_required=true if any check digit fails.
 */
export function validateMrzTd3CheckDigits(
  mrzLine1Field: ExtractedField | undefined,
  mrzLine2Field: ExtractedField | undefined,
): IntlPassportValidationResult {
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

  const result = parseTd3(line1, line2)

  if (result.errors.length > 0) {
    return {
      passed: false,
      review_required: true,
      reason: 'mrz_parse_error',
      warning: `MRZ parse error(s): ${result.errors.join('; ')}`,
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
      reason: 'mrz_check_digit_failure',
      warning: `MRZ check digit validation failed for: ${failedDesc}.`,
    }
  }

  return { passed: true, review_required: false }
}

// ── 2. mrz_viz_mismatch (surname, DOB, doc number) ───────────────────────────

/**
 * Detects mismatch between MRZ-extracted fields and VIZ (Visual Inspection Zone) fields.
 * Used for mrz_viz_surname_match, mrz_viz_dob_match, mrz_viz_docnum_match validators.
 *
 * Comparison is case-insensitive and whitespace-normalized.
 * Any mismatch → review_required=true.
 */
export function validateMrzVizMismatch(
  mrzLine1: string | undefined,
  mrzLine2: string | undefined,
  vizFields: Record<string, string | undefined>,
): IntlPassportValidationResult {
  if (!mrzLine1 || !mrzLine2) {
    return {
      passed: false,
      review_required: true,
      reason: 'mrz_lines_missing_for_viz_check',
      warning: 'Cannot perform MRZ/VIZ cross-check: MRZ lines absent.',
    }
  }

  const td3 = parseTd3(mrzLine1, mrzLine2)

  if (td3.errors.length > 0) {
    return {
      passed: false,
      review_required: true,
      reason: 'mrz_parse_error_for_viz_check',
      warning: `MRZ parse error prevents VIZ comparison: ${td3.errors.join('; ')}`,
    }
  }

  const mrzFieldsRecord: Record<string, string | null> = {
    surname_latin:    td3.surname,
    given_names_latin: td3.givenNames,
    date_of_birth:    td3.dateOfBirth,
    document_number:  td3.documentNumber,
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

// ── 3. latin_name_no_retransliteration ───────────────────────────────────────

// Patterns that indicate a name was transliterated from Cyrillic rather than
// taken verbatim from an official Latin-script source (MRZ/VIZ).
// Ukrainian transliteration has specific digraphs — these indicate re-transliteration:
const RETRANSLITERATION_PATTERNS = [
  /\bSHCH\b/i,  // ЩΣ→SHCH — rare in official passports but common in transliteration
  /\bKH\b/i,    // Х→KH — used in Ukrainian KMU transliteration, check in context
  /\bZH\b/i,    // Ж→ZH
  /\bTS\b/i,    // Ц→TS — but can appear in real names, so this is just a hint
  /\bYU\b/i,    // Ю→YU
  /\bYA\b/i,    // Я→YA
  /\bYI\b/i,    // ЇΣ→YI
]

// Specific sequences that strongly suggest re-transliteration from Ukrainian:
const STRONG_RETRANSLITERATION_PATTERNS = [
  /SHCH/i, // ЩΣ — very strong signal
  /IE/i,   // Є→IE — Ukrainian-specific (KMU transliteration)
]

/**
 * Detects if a Latin name field appears to have been re-transliterated
 * from Cyrillic rather than taken verbatim from the official Latin source.
 *
 * Returns review_required=true with a candidate if strong signal detected.
 * For weak signals, warns but does not block.
 *
 * Note: This is a heuristic validator. False positives are possible for
 * names that happen to contain these letter combinations. The operator
 * must confirm.
 */
export function validateLatinNameNoRetransliteration(
  field: ExtractedField | undefined,
): IntlPassportValidationResult {
  if (!field?.raw_value) return { passed: true, review_required: false }

  const value = field.raw_value.trim()

  // Strong patterns: high confidence of re-transliteration
  for (const pattern of STRONG_RETRANSLITERATION_PATTERNS) {
    if (pattern.test(value)) {
      return {
        passed: false,
        review_required: true,
        reason: 'latin_name_likely_retransliterated',
        warning:
          `Field '${field.field}' value '${value}' contains patterns ` +
          `(${pattern.source}) that suggest re-transliteration from Cyrillic. ` +
          `Use the official Latin spelling from the MRZ/VIZ verbatim.`,
      }
    }
  }

  // Check if the field was sourced from a Cyrillic zone
  if (field.source_zone) {
    const zoneLower = field.source_zone.toLowerCase()
    const isCyrillicZone =
      zoneLower.includes('cyrillic') ||
      zoneLower.includes('кирил') ||
      zoneLower.includes('ukr_text') ||
      zoneLower.includes('ukrainian_layer')

    if (isCyrillicZone) {
      return {
        passed: false,
        review_required: true,
        reason: 'latin_name_from_cyrillic_zone',
        warning:
          `Field '${field.field}' was extracted from a Cyrillic source zone '${field.source_zone}'. ` +
          `Latin names must come from the Latin/MRZ zone.`,
      }
    }
  }

  return { passed: true, review_required: false }
}

// ── 4. date_of_expiry_not_expired ────────────────────────────────────────────

/**
 * Warns if the passport expiry date is in the past.
 * This is a warn-only validator — expired passports are still valid for
 * translation purposes, but operators should note the expiry.
 *
 * Expects USCIS format: "D Month YYYY" (e.g. "3 January 2022").
 */
export function validateDateOfExpiryNotExpired(
  field: ExtractedField | undefined,
): IntlPassportValidationResult {
  if (!field?.raw_value) return { passed: true, review_required: false }

  const raw = field.raw_value.trim()

  // Parse USCIS date format: "D Month YYYY"
  const MONTH_MAP: Record<string, number> = {
    january: 1, february: 2, march: 3, april: 4,
    may: 5, june: 6, july: 7, august: 8,
    september: 9, october: 10, november: 11, december: 12,
  }

  const parts = raw.split(' ')
  if (parts.length !== 3) {
    return {
      passed: false,
      review_required: true,
      reason: 'expiry_date_format_invalid',
      warning: `date_of_expiry '${raw}' is not in expected USCIS format 'D Month YYYY'.`,
    }
  }

  const day = parseInt(parts[0], 10)
  const monthNum = MONTH_MAP[parts[1].toLowerCase()]
  const year = parseInt(parts[2], 10)

  if (isNaN(day) || !monthNum || isNaN(year)) {
    return {
      passed: false,
      review_required: true,
      reason: 'expiry_date_parse_failed',
      warning: `date_of_expiry '${raw}' could not be parsed.`,
    }
  }

  const expiryDate = new Date(year, monthNum - 1, day)
  const today = new Date()
  today.setHours(0, 0, 0, 0)

  if (expiryDate < today) {
    return {
      passed: true, // warn only — not a blocking failure
      review_required: false,
      reason: 'passport_expired',
      warning: `Passport expired on '${raw}'. Document is valid for translation but note expiry.`,
    }
  }

  return { passed: true, review_required: false }
}

// ── 5. issuing_state_is_ukr ───────────────────────────────────────────────────

const VALID_UKR_STATE_CODES = new Set(['UKR', 'UKRAINE', 'УКРАЇНА'])

/**
 * Validates that the issuing state code is 'UKR' (or equivalent Ukrainian designator).
 * This module handles Ukrainian international passports only.
 *
 * Returns review_required=true if state code indicates a different country.
 */
export function validateIssuingStateIsUkr(
  field: ExtractedField | undefined,
): IntlPassportValidationResult {
  if (!field?.raw_value) {
    return {
      passed: false,
      review_required: true,
      reason: 'issuing_state_missing',
      warning: 'issuing_state_code is missing — cannot verify document is Ukrainian.',
    }
  }

  const normalized = field.raw_value.trim().toUpperCase()

  if (!VALID_UKR_STATE_CODES.has(normalized)) {
    return {
      passed: false,
      review_required: true,
      reason: 'issuing_state_not_ukr',
      warning:
        `issuing_state_code '${field.raw_value}' does not match expected Ukrainian designators. ` +
        `This module only processes Ukrainian international passports.`,
    }
  }

  return { passed: true, review_required: false }
}

// ── 6. personal_number_sensitive ──────────────────────────────────────────────

/**
 * Personal number (RNOKPP) no-log gate.
 *
 * SECURITY RULE: This function MUST NOT log or surface the raw personal_number
 * value in any warning, reason, or candidate_value field.
 *
 * The personal number is:
 *   - Always review_required=true (operator must manually confirm)
 *   - Never included in customer PDF (enforced at render layer)
 *   - Never included in audit logs or telemetry
 *
 * This validator only checks that the field is present and has the correct
 * format (10-digit numeric), WITHOUT surfacing the value.
 */
export function validatePersonalNumberSensitive(
  field: ExtractedField | undefined,
): IntlPassportValidationResult {
  // Always review_required regardless of validity
  if (!field?.raw_value || field.raw_value.trim() === '') {
    return {
      passed: false,
      review_required: true,
      reason: 'personal_number_absent',
      warning: 'personal_number field is absent. Operator must verify from source document.',
      // NOTE: never log raw_value here
    }
  }

  const raw = field.raw_value.trim().replace(/</g, '') // strip MRZ fillers

  if (!/^\d{10}$/.test(raw)) {
    return {
      passed: false,
      review_required: true,
      reason: 'personal_number_format_invalid',
      warning:
        'personal_number does not match expected 10-digit RNOKPP format. ' +
        'Operator review required.',
      // NOTE: never include raw value in warning
    }
  }

  // Format valid — but still always review_required
  return {
    passed: true,
    review_required: true,
    reason: 'personal_number_always_review',
    warning: 'personal_number is always subject to operator review before use.',
  }
}

// ── 7. source_evidence_required ───────────────────────────────────────────────

export function validateIntlPassportSourceEvidence(
  field: ExtractedField,
): IntlPassportValidationResult {
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

// ── 8. name_mixed_script ─────────────────────────────────────────────────────

/**
 * Detects mixed Cyrillic + Latin characters within a single name field.
 * This indicates an extraction or transliteration error that requires review.
 */
export function validateNameMixedScript(
  field: ExtractedField | undefined,
): IntlPassportValidationResult {
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
        `possible extraction or transliteration error. Review required.`,
    }
  }

  return { passed: true, review_required: false }
}
