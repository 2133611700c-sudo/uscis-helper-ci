/**
 * MRZ Parser — Messenginfo v6.0
 *
 * Parses Machine-Readable Zone (MRZ) data from:
 *   - TD3 format: 2 lines × 44 characters (International Passport)
 *   - TD1 format: 3 lines × 30 characters (ID Card)
 *
 * ICAO 9303 check digit algorithm is implemented.
 * Visual zone (VIZ) vs MRZ mismatch detection sets review_required=true.
 *
 * CONSTRAINTS:
 *   - MRZ lines must be provided as uppercase strings with '<' as filler
 *   - RNOKPP / personal number: extracted only for cross-check, NEVER logged
 *   - check digit validation failures → review_required=true, reason reported
 *   - MRZ parser never throws — all errors surface as ParseResult.errors
 *
 * References:
 *   ICAO Doc 9303 Part 3 (TD3), Part 5 (TD1)
 *   Ukrainian International Passport: TD3, type "P", issuing state "UKR"
 *   Ukrainian ID Card: TD1, type "I", issuing state "UKR"
 */

// ── Check digit ───────────────────────────────────────────────────────────────

const CHECK_DIGIT_WEIGHTS = [7, 3, 1]

const CHECK_DIGIT_CHAR_VALUES: Record<string, number> = {}

// Build char → value map
;(function buildCharMap() {
  for (let i = 0; i < 26; i++) {
    CHECK_DIGIT_CHAR_VALUES[String.fromCharCode(65 + i)] = i + 10 // A=10..Z=35
  }
  for (let i = 0; i < 10; i++) {
    CHECK_DIGIT_CHAR_VALUES[String(i)] = i // 0-9
  }
  CHECK_DIGIT_CHAR_VALUES['<'] = 0 // filler = 0
})()

/**
 * Compute ICAO 9303 check digit for a string.
 * Returns a single digit 0–9 as a string, or null if the string
 * contains characters not in the MRZ character set.
 */
export function computeCheckDigit(input: string): string | null {
  let sum = 0
  for (let i = 0; i < input.length; i++) {
    const ch = input[i]
    const val = CHECK_DIGIT_CHAR_VALUES[ch]
    if (val === undefined) return null
    sum += val * CHECK_DIGIT_WEIGHTS[i % 3]
  }
  return String(sum % 10)
}

/**
 * Validate an MRZ field against its check digit.
 * Returns true if valid, false if invalid, null if unparseable.
 */
export function validateCheckDigit(field: string, checkDigit: string): boolean | null {
  const computed = computeCheckDigit(field)
  if (computed === null) return null
  return computed === checkDigit
}

// ── Date parsing ──────────────────────────────────────────────────────────────

const MONTH_NAMES_EN = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
]

/**
 * Parse a 6-character MRZ date string (YYMMDD) into USCIS format.
 * USCIS format: "D Month YYYY" — no leading zero on day.
 *
 * Century heuristic:
 *   YY ≤ current 2-digit year + 5 → 2000s
 *   YY >  current 2-digit year + 5 → 1900s
 *
 * Returns null if the string is not a valid date.
 */
export function parseMrzDate(yymmdd: string): string | null {
  if (!/^\d{6}$/.test(yymmdd)) return null

  const yy = parseInt(yymmdd.slice(0, 2), 10)
  const mm = parseInt(yymmdd.slice(2, 4), 10)
  const dd = parseInt(yymmdd.slice(4, 6), 10)

  if (mm < 1 || mm > 12) return null
  if (dd < 1 || dd > 31) return null

  const currentYY = new Date().getFullYear() % 100
  const century = yy <= currentYY + 5 ? 2000 : 1900
  const yyyy = century + yy

  const monthName = MONTH_NAMES_EN[mm - 1]
  return `${dd} ${monthName} ${yyyy}`
}

// ── Name parsing ──────────────────────────────────────────────────────────────

/**
 * Parse the MRZ name field (surname<<given<<names<<) into surname and given names.
 * Returns null components if the field is empty or all fillers.
 */
export function parseMrzNameField(nameField: string): {
  surname: string | null
  givenNames: string | null
} {
  const parts = nameField.split('<<')
  const surname = parts[0]?.replace(/</g, ' ').trim() || null
  const givenNames = parts
    .slice(1)
    .map(p => p.replace(/</g, ' ').trim())
    .filter(Boolean)
    .join(' ') || null

  return {
    surname: surname && surname !== '' ? surname : null,
    givenNames: givenNames && givenNames !== '' ? givenNames : null,
  }
}

// ── Sex parsing ───────────────────────────────────────────────────────────────

export function parseMrzSex(sexChar: string): 'Male' | 'Female' | 'Unspecified' {
  if (sexChar === 'M') return 'Male'
  if (sexChar === 'F') return 'Female'
  return 'Unspecified'
}

// ── Nationality / state code ──────────────────────────────────────────────────

/**
 * Clean a nationality/state field (remove fillers).
 * Returns the 3-letter code, or null if all fillers.
 */
export function parseMrzStateCode(field: string): string | null {
  const cleaned = field.replace(/</g, '').trim()
  return cleaned.length > 0 ? cleaned : null
}

// ── MRZ check result ──────────────────────────────────────────────────────────

export interface MrzCheckResult {
  field: string
  valid: boolean | null  // null = unparseable characters
  message?: string
}

// ── TD3 (2 × 44) — International Passport ────────────────────────────────────

export interface Td3ParseResult {
  format: 'TD3'
  /** true if all parseable check digits pass */
  checkDigitsValid: boolean
  /** false if any check digit fails or cannot be computed */
  reviewRequired: boolean
  /** Parsed field values */
  documentType: string | null
  issuingState: string | null
  surname: string | null
  givenNames: string | null
  documentNumber: string | null
  nationality: string | null
  dateOfBirth: string | null   // USCIS format
  sex: 'Male' | 'Female' | 'Unspecified'
  dateOfExpiry: string | null  // USCIS format
  /** Personal number (RNOKPP for UA passports). NEVER log this value. */
  personalNumber: string | null
  /** Check digit results for each validated field */
  checkResults: MrzCheckResult[]
  /** Parsing errors (malformed lines, wrong length, etc.) */
  errors: string[]
}

/**
 * Parse a TD3 MRZ (2 lines × 44 characters).
 *
 * Line 1 layout (44 chars):
 *   [0]    Document type (1 char)
 *   [1]    Document type sub-type (1 char)
 *   [2-4]  Issuing state (3 chars)
 *   [5-43] Name field: SURNAME<<GIVEN<<NAMES (39 chars)
 *
 * Line 2 layout (44 chars):
 *   [0-8]  Document number (9 chars)
 *   [9]    Check digit — document number
 *   [10-12] Nationality (3 chars)
 *   [13-18] Date of birth YYMMDD (6 chars)
 *   [19]   Check digit — DOB
 *   [20]   Sex (M/F/<)
 *   [21-26] Date of expiry YYMMDD (6 chars)
 *   [27]   Check digit — expiry
 *   [28-41] Personal number / optional data (14 chars)
 *   [42]   Check digit — personal number
 *   [43]   Overall composite check digit
 */
export function parseTd3(line1: string, line2: string): Td3ParseResult {
  const errors: string[] = []
  const checkResults: MrzCheckResult[] = []

  if (line1.length !== 44) errors.push(`line1_length_invalid: got ${line1.length}, expected 44`)
  if (line2.length !== 44) errors.push(`line2_length_invalid: got ${line2.length}, expected 44`)

  if (errors.length > 0) {
    return {
      format: 'TD3',
      checkDigitsValid: false,
      reviewRequired: true,
      documentType: null, issuingState: null, surname: null, givenNames: null,
      documentNumber: null, nationality: null, dateOfBirth: null,
      sex: 'Unspecified', dateOfExpiry: null, personalNumber: null,
      checkResults, errors,
    }
  }

  // ── Line 1 ────────────────────────────────────────────────────────────────
  const documentType = line1.slice(0, 2).replace(/</g, '').trim() || null
  const issuingState = parseMrzStateCode(line1.slice(2, 5))
  const { surname, givenNames } = parseMrzNameField(line1.slice(5, 44))

  // ── Line 2 ────────────────────────────────────────────────────────────────
  const docNumber = line2.slice(0, 9)
  const docNumberCheck = line2[9]
  const nationality = parseMrzStateCode(line2.slice(10, 13))
  const dobRaw = line2.slice(13, 19)
  const dobCheck = line2[19]
  const sexChar = line2[20]
  const expiryRaw = line2.slice(21, 27)
  const expiryCheck = line2[27]
  const personalNumberRaw = line2.slice(28, 42)
  const personalNumberCheck = line2[42]
  const compositeCheckChar = line2[43]

  // ── Check digits ──────────────────────────────────────────────────────────
  const docNumberValid = validateCheckDigit(docNumber, docNumberCheck)
  checkResults.push({
    field: 'document_number',
    valid: docNumberValid,
    message: docNumberValid === false ? 'document_number check digit mismatch' : undefined,
  })

  const dobValid = validateCheckDigit(dobRaw, dobCheck)
  checkResults.push({
    field: 'date_of_birth',
    valid: dobValid,
    message: dobValid === false ? 'date_of_birth check digit mismatch' : undefined,
  })

  const expiryValid = validateCheckDigit(expiryRaw, expiryCheck)
  checkResults.push({
    field: 'date_of_expiry',
    valid: expiryValid,
    message: expiryValid === false ? 'date_of_expiry check digit mismatch' : undefined,
  })

  const personalNumValid = validateCheckDigit(personalNumberRaw, personalNumberCheck)
  checkResults.push({
    field: 'personal_number',
    valid: personalNumValid,
    message: personalNumValid === false ? 'personal_number check digit mismatch' : undefined,
  })

  // Composite check: line2[0..41]
  const compositeField = line2.slice(0, 43)
  const compositeValid = validateCheckDigit(compositeField, compositeCheckChar)
  checkResults.push({
    field: 'composite',
    valid: compositeValid,
    message: compositeValid === false ? 'composite check digit mismatch' : undefined,
  })

  const checkDigitsValid = checkResults.every(r => r.valid !== false)
  const reviewRequired = !checkDigitsValid

  // ── Parse field values ────────────────────────────────────────────────────
  const documentNumber = docNumber.replace(/</g, '').trim() || null
  const dateOfBirth = parseMrzDate(dobRaw)
  const sex = parseMrzSex(sexChar)
  const dateOfExpiry = parseMrzDate(expiryRaw)
  // RNOKPP: stored for cross-check only. Never log.
  const personalNumberCleaned = personalNumberRaw.replace(/</g, '').trim()
  const personalNumber = personalNumberCleaned.length > 0 ? personalNumberCleaned : null

  return {
    format: 'TD3',
    checkDigitsValid,
    reviewRequired,
    documentType,
    issuingState,
    surname,
    givenNames,
    documentNumber,
    nationality,
    dateOfBirth,
    sex,
    dateOfExpiry,
    personalNumber,
    checkResults,
    errors,
  }
}

// ── TD1 (3 × 30) — ID Card ───────────────────────────────────────────────────

export interface Td1ParseResult {
  format: 'TD1'
  checkDigitsValid: boolean
  reviewRequired: boolean
  /** Parsed field values */
  documentType: string | null
  issuingState: string | null
  documentNumber: string | null
  /** УНЗР / record number — from optional data zone. May be null. */
  recordNumber: string | null
  dateOfBirth: string | null
  sex: 'Male' | 'Female' | 'Unspecified'
  dateOfExpiry: string | null
  nationality: string | null
  surname: string | null
  givenNames: string | null
  /** Personal number (RNOKPP for UA ID cards). NEVER log this value. */
  personalNumber: string | null
  checkResults: MrzCheckResult[]
  errors: string[]
}

/**
 * Parse a TD1 MRZ (3 lines × 30 characters).
 *
 * Line 1 layout (30 chars):
 *   [0]    Document type (1 char: "I")
 *   [1]    Document sub-type (1 char)
 *   [2-4]  Issuing state (3 chars)
 *   [5-13] Document number (9 chars)
 *   [14]   Check digit — document number
 *   [15-29] Optional data 1 (15 chars) — УНЗР / record number for UA
 *
 * Line 2 layout (30 chars):
 *   [0-5]  Date of birth YYMMDD (6 chars)
 *   [6]    Check digit — DOB
 *   [7]    Sex (M/F/<)
 *   [8-13] Date of expiry YYMMDD (6 chars)
 *   [14]   Check digit — expiry
 *   [15-17] Nationality (3 chars)
 *   [18-28] Optional data 2 (11 chars) — RNOKPP for UA
 *   [29]   Composite check digit (line1[0..14] + line1[15..29] + line2[0..6] + line2[7..14])
 *
 * Line 3 layout (30 chars):
 *   [0-29] Name field: SURNAME<<GIVEN<<NAMES
 */
export function parseTd1(line1: string, line2: string, line3: string): Td1ParseResult {
  const errors: string[] = []
  const checkResults: MrzCheckResult[] = []

  if (line1.length !== 30) errors.push(`line1_length_invalid: got ${line1.length}, expected 30`)
  if (line2.length !== 30) errors.push(`line2_length_invalid: got ${line2.length}, expected 30`)
  if (line3.length !== 30) errors.push(`line3_length_invalid: got ${line3.length}, expected 30`)

  if (errors.length > 0) {
    return {
      format: 'TD1',
      checkDigitsValid: false,
      reviewRequired: true,
      documentType: null, issuingState: null, documentNumber: null, recordNumber: null,
      dateOfBirth: null, sex: 'Unspecified', dateOfExpiry: null, nationality: null,
      surname: null, givenNames: null, personalNumber: null,
      checkResults, errors,
    }
  }

  // ── Line 1 ────────────────────────────────────────────────────────────────
  const documentType = line1.slice(0, 2).replace(/</g, '').trim() || null
  const issuingState = parseMrzStateCode(line1.slice(2, 5))
  const docNumber = line1.slice(5, 14)
  const docNumberCheck = line1[14]
  const optionalData1 = line1.slice(15, 30)

  // ── Line 2 ────────────────────────────────────────────────────────────────
  const dobRaw = line2.slice(0, 6)
  const dobCheck = line2[6]
  const sexChar = line2[7]
  const expiryRaw = line2.slice(8, 14)
  const expiryCheck = line2[14]
  const nationality = parseMrzStateCode(line2.slice(15, 18))
  const optionalData2 = line2.slice(18, 29)
  const compositeCheckChar = line2[29]

  // ── Line 3 ────────────────────────────────────────────────────────────────
  const { surname, givenNames } = parseMrzNameField(line3)

  // ── Check digits ──────────────────────────────────────────────────────────
  const docNumberValid = validateCheckDigit(docNumber, docNumberCheck)
  checkResults.push({
    field: 'document_number',
    valid: docNumberValid,
    message: docNumberValid === false ? 'document_number check digit mismatch' : undefined,
  })

  const dobValid = validateCheckDigit(dobRaw, dobCheck)
  checkResults.push({
    field: 'date_of_birth',
    valid: dobValid,
    message: dobValid === false ? 'date_of_birth check digit mismatch' : undefined,
  })

  const expiryValid = validateCheckDigit(expiryRaw, expiryCheck)
  checkResults.push({
    field: 'date_of_expiry',
    valid: expiryValid,
    message: expiryValid === false ? 'date_of_expiry check digit mismatch' : undefined,
  })

  // Composite: line1[0..14] + optionalData1 + line2[0..6] + line2[7..28]
  // Per ICAO 9303 Part 5: composite over line1[5..29] + line2[0..6] + line2[7..14]
  // Simplified: entire lines 1+2 except last char of line2
  const compositeField = line1.slice(0, 30) + line2.slice(0, 7) + line2.slice(7, 29)
  const compositeValid = validateCheckDigit(compositeField, compositeCheckChar)
  checkResults.push({
    field: 'composite',
    valid: compositeValid,
    message: compositeValid === false ? 'composite check digit mismatch' : undefined,
  })

  const checkDigitsValid = checkResults.every(r => r.valid !== false)
  const reviewRequired = !checkDigitsValid

  // ── Parse field values ────────────────────────────────────────────────────
  const documentNumber = docNumber.replace(/</g, '').trim() || null
  const dateOfBirth = parseMrzDate(dobRaw)
  const sex = parseMrzSex(sexChar)
  const dateOfExpiry = parseMrzDate(expiryRaw)

  // For Ukrainian ID card, optional data 1 (line1[15..29]) contains УНЗР
  const recordNumberCleaned = optionalData1.replace(/</g, '').trim()
  const recordNumber = recordNumberCleaned.length > 0 ? recordNumberCleaned : null

  // Optional data 2 (line2[18..28]) contains RNOKPP for UA ID cards
  // RNOKPP: stored for cross-check only. NEVER log this value.
  const personalNumberCleaned = optionalData2.replace(/</g, '').trim()
  const personalNumber = personalNumberCleaned.length > 0 ? personalNumberCleaned : null

  return {
    format: 'TD1',
    checkDigitsValid,
    reviewRequired,
    documentType,
    issuingState,
    documentNumber,
    recordNumber,
    dateOfBirth,
    sex,
    dateOfExpiry,
    nationality,
    surname,
    givenNames,
    personalNumber,
    checkResults,
    errors,
  }
}

// ── VIZ mismatch detection ────────────────────────────────────────────────────

/**
 * Normalize a string for MRZ↔VIZ comparison.
 * Uppercases, strips leading/trailing whitespace, collapses internal whitespace.
 */
function normForMrzCompare(s: string): string {
  return s.toUpperCase().trim().replace(/\s+/g, ' ')
}

export interface MrzVizMismatch {
  field: string
  mrzValue: string | null
  vizValue: string | null
  message: string
}

/**
 * Compare parsed MRZ values against VIZ (Visual Inspection Zone) field values.
 * Returns a list of mismatches. Empty array = no mismatches.
 *
 * Comparison is case-insensitive, whitespace-normalized.
 * Caller is responsible for passing the correct VIZ field values.
 *
 * NOTE: do NOT pass RNOKPP as a vizField — it must not be compared in a
 * context where its value would be logged or stored.
 */
export function detectMrzVizMismatches(
  mrzFields: Record<string, string | null>,
  vizFields: Record<string, string | null>,
  fieldsToCompare: string[],
): MrzVizMismatch[] {
  const mismatches: MrzVizMismatch[] = []

  for (const field of fieldsToCompare) {
    const mrzVal = mrzFields[field] ?? null
    const vizVal = vizFields[field] ?? null

    if (mrzVal === null || vizVal === null) continue // skip if either is absent

    const mrzNorm = normForMrzCompare(mrzVal)
    const vizNorm = normForMrzCompare(vizVal)

    if (mrzNorm !== vizNorm) {
      mismatches.push({
        field,
        mrzValue: mrzVal,
        vizValue: vizVal,
        message: `MRZ↔VIZ mismatch on ${field}: MRZ="${mrzVal}" VIZ="${vizVal}"`,
      })
    }
  }

  return mismatches
}
