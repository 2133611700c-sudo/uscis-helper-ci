/**
 * canonical/core/mrzAuthority.ts — MRZ → FieldCandidate[] bridge.
 *
 * Wraps the packages/knowledge MRZ parser into the Core reader interface.
 * When a valid TD3 MRZ is found, produces FieldCandidate[] with source='mrz'
 * and mrzCheckValid=true so the Core arbitration gives MRZ authority over
 * the passport identity fields.
 *
 * Authority hierarchy (matches arbitration.ts PASSPORT_MRZ_FIELDS):
 *   MRZ valid (check digits pass) → wins over ai_vision / document_ocr
 *   MRZ found but invalid         → review_required=true, source='mrz', mrzCheckValid=false
 *   MRZ not found                 → returns empty array (no candidates injected)
 *
 * MRZ-controlled fields (when valid):
 *   passport_number, date_of_birth, sex, date_of_expiry,
 *   family_name, given_name, nationality
 *
 * MRZ NEVER populates (hard rule — do not touch):
 *   i94_admission_number, i94_date_of_entry, i94_class_of_admission,
 *   a_number, ead_category, us_address, patronymic,
 *   place_of_birth, issuing_authority, eligibility
 */
import { parseMrz } from '@uscis-helper/knowledge'
import type { FieldCandidate } from './types'

// ---------------------------------------------------------------------------
// MRZ debug status classification
// ---------------------------------------------------------------------------

/**
 * Debug status for MRZ parsing — surfaces specific failure reasons so that
 * routes can return targeted diagnostics instead of a generic NOT_PRESENT.
 *
 * valid_mrz              — all check digits pass; MRZ is trusted.
 * no_mrz_lines           — no 44-char (TD3) or 30-char (TD1) lines found in OCR.
 * partial_mrz_lines      — found 1 of the 2 required lines (truncated OCR, line wrap).
 * check_digit_failed     — MRZ lines found but at least one check digit is invalid.
 * ocr_noise_in_mrz       — looks like MRZ zone but contains invalid characters.
 * mrz_parse_error        — parser threw (malformed input, internal error).
 */
export type MrzDebugStatus =
  | 'valid_mrz'
  | 'no_mrz_lines'
  | 'partial_mrz_lines'
  | 'check_digit_failed'
  | 'ocr_noise_in_mrz'
  | 'mrz_parse_error'

/**
 * Classify the MRZ debug status from raw OCR text BEFORE parsing.
 * Returns a status string that explains WHY the MRZ was not found or was invalid.
 */
export function classifyMrzStatus(rawText: string, parsedOk: boolean, parsedChecks?: {
  passport_no: boolean; dob: boolean; expiry: boolean
}): MrzDebugStatus {
  if (parsedOk && parsedChecks?.passport_no && parsedChecks?.dob && parsedChecks?.expiry) {
    return 'valid_mrz'
  }

  // Detect potential MRZ lines: TD3 = 44 chars, TD1 = 30 chars
  const lines = rawText.split(/\r?\n/)
  const td3Lines = lines.filter(l => /^[A-Z0-9<]{44}$/.test(l.trim()))
  const td1Lines = lines.filter(l => /^[A-Z0-9<]{30}$/.test(l.trim()))

  // Lines that look like MRZ but have invalid chars (OCR noise)
  const mrzLike44 = lines.filter(l => /^[A-Z0-9<\s]{40,48}$/.test(l.trim()) && /[^A-Z0-9<\s]/.test(l.trim()))
  const mrzLike30 = lines.filter(l => /^[A-Z0-9<\s]{27,33}$/.test(l.trim()) && /[^A-Z0-9<\s]/.test(l.trim()))

  if (td3Lines.length >= 2 || td1Lines.length >= 3) {
    // Lines look valid but check digits failed
    if (parsedChecks && (!parsedChecks.passport_no || !parsedChecks.dob || !parsedChecks.expiry)) {
      return 'check_digit_failed'
    }
    return 'check_digit_failed' // check digits failed (parsedOk=false means parser ran but failed checks)
  }

  if (td3Lines.length === 1 || td1Lines.length === 1 || td1Lines.length === 2) {
    return 'partial_mrz_lines'
  }

  if (mrzLike44.length >= 1 || mrzLike30.length >= 2) {
    return 'ocr_noise_in_mrz'
  }

  return 'no_mrz_lines'
}

// ---------------------------------------------------------------------------
// Fields that MRZ is authoritative for (must match arbitration.ts PASSPORT_MRZ_FIELDS)
// ---------------------------------------------------------------------------

export const MRZ_CONTROLLED_FIELDS = [
  'passport_number',
  'date_of_birth',
  'sex',
  'date_of_expiry',
  'family_name',
  'given_name',
  'nationality',
] as const

export type MrzControlledField = (typeof MRZ_CONTROLLED_FIELDS)[number]

// ---------------------------------------------------------------------------
// Fields MRZ is FORBIDDEN to populate — never add to this module
// ---------------------------------------------------------------------------

export const MRZ_FORBIDDEN_FIELDS = [
  'i94_admission_number',
  'i94_date_of_entry',
  'i94_class_of_admission',
  'a_number',
  'ead_category',
  'us_address',
  'patronymic',
  'place_of_birth',
  'issuing_authority',
  'eligibility',
] as const

// ---------------------------------------------------------------------------
// MRZ → FieldCandidate[] conversion
// ---------------------------------------------------------------------------

/**
 * Parse MRZ from raw OCR text and emit FieldCandidate[] for the Core.
 *
 * - Valid MRZ (check digits pass)  → candidates with mrzCheckValid=true, confidence=0.99
 * - Invalid MRZ (bad check digits) → candidates with mrzCheckValid=false, confidence=0.3,
 *                                     reviewRequired=true
 * - MRZ not found                  → empty array (Core sees no MRZ candidates)
 *
 * The caller must pass `rawText` which is the full OCR output for the page
 * (typically Vision API fullTextAnnotation or Gemini text).
 */
export function mrzCandidatesFromText(rawText: string): FieldCandidate[] {
  const mrz = parseMrz(rawText)

  // MRZ not found — no candidates injected. Core falls through to visual candidates.
  if (!mrz.ok && !mrz.surname && !mrz.passport_no) {
    return []
  }

  // Any check digit failed → present the values as candidates but force review.
  // The Core arbitration will also flag mrz_check_failed (see arbitration.ts).
  const allChecksPass = mrz.checks.passport_no && mrz.checks.dob && mrz.checks.expiry
  const mrzCheckValid = allChecksPass
  const confidence = allChecksPass ? 0.99 : 0.3
  const reviewRequired = !allChecksPass
  const reviewReasons: string[] = reviewRequired ? ['mrz_check_failed'] : []

  const candidates: FieldCandidate[] = []

  function push(key: MrzControlledField, value: string | null | undefined): void {
    if (!value || value.trim() === '') return
    candidates.push({
      key,
      value: value.trim(),
      source: 'mrz',
      confidence,
      mrzCheckValid,
      provider: 'mrz_authority',
      reviewRequired,
      reviewReasons,
    })
  }

  push('passport_number', mrz.passport_no || null)
  push('date_of_birth', mrz.date_of_birth)
  push('date_of_expiry', mrz.expiry)
  push('family_name', mrz.surname || null)
  push('given_name', mrz.given_names || null)
  push('nationality', mrz.nationality || null)

  // Sex: MRZ uses 'X' for unspecified ('<'); only emit M or F as real values.
  if (mrz.sex === 'M' || mrz.sex === 'F') {
    push('sex', mrz.sex)
  }

  return candidates
}

// MRZ field keys → the translation registry's field names, per docType. The MRZ
// parser emits ICAO names (date_of_birth/date_of_expiry); the translation reader
// uses dob/passport_expiration_date. Only the fields the registry expects are
// kept (nationality/sex are dropped for the intl passport's 5-field spec).
const TRANSLATION_MRZ_KEYMAP: Record<string, Record<string, string>> = {
  ua_international_passport: { date_of_birth: 'dob', date_of_expiry: 'passport_expiration_date' },
}
const TRANSLATION_MRZ_ALLOWED: Record<string, Set<string>> = {
  ua_international_passport: new Set(['family_name', 'given_name', 'passport_number', 'dob', 'passport_expiration_date']),
}

/**
 * MRZ candidates for the TRANSLATION path, remapped to a docType's registry
 * field names so a valid MRZ merges with the Gemini read (same arbitration key)
 * and auto-resolves the field instead of falling to critical_no_mrz_anchor.
 * Returns [] for docTypes without an MRZ mapping (no behavior change).
 */
export function mrzCandidatesForTranslation(rawText: string, docTypeId: string): FieldCandidate[] {
  const keymap = TRANSLATION_MRZ_KEYMAP[docTypeId]
  const allowed = TRANSLATION_MRZ_ALLOWED[docTypeId]
  if (!keymap || !allowed) return []
  const out: FieldCandidate[] = []
  for (const c of mrzCandidatesFromText(rawText)) {
    const key = keymap[c.key] ?? c.key
    if (allowed.has(key)) out.push({ ...c, key })
  }
  return out
}

/**
 * Extended MRZ parse result with debug classification.
 * Used by routes that need to return specific failure reasons.
 */
export interface MrzParseResult {
  valid: boolean
  debug_status: MrzDebugStatus
  mrz_lines_found: number
  candidates: FieldCandidate[]
  check_digits_pass: {
    passport_no: boolean
    dob: boolean
    expiry: boolean
  }
}

/**
 * Parse MRZ from raw OCR text and return an extended result with debug status.
 *
 * This is the recommended function for routes/endpoints that need to surface
 * the specific reason why MRZ was not found or invalid:
 *
 *   valid_mrz           → all checks pass, candidates have mrzCheckValid=true
 *   no_mrz_lines        → no MRZ-like lines found at all
 *   partial_mrz_lines   → found 1 of 2 required lines (OCR truncation?)
 *   check_digit_failed  → lines found but check digits bad (OCR quality?)
 *   ocr_noise_in_mrz    → MRZ zone has invalid characters (OCR noise)
 *   mrz_parse_error     → parser threw
 *
 * Use `candidates` from this result instead of calling mrzCandidatesFromText separately.
 */
export function parseMrzFromText(rawText: string): MrzParseResult {
  let mrz: ReturnType<typeof parseMrz>
  try {
    mrz = parseMrz(rawText)
  } catch {
    return {
      valid: false,
      debug_status: 'mrz_parse_error',
      mrz_lines_found: 0,
      candidates: [],
      check_digits_pass: { passport_no: false, dob: false, expiry: false },
    }
  }

  const candidates = mrzCandidatesFromText(rawText)
  const allChecksPass = mrz.checks.passport_no && mrz.checks.dob && mrz.checks.expiry
  const noCandidates = !mrz.ok && !mrz.surname && !mrz.passport_no

  // Count MRZ-like lines for debug classification
  const lines = rawText.split(/\r?\n/)
  const td3Lines = lines.filter(l => /^[A-Z0-9<]{44}$/.test(l.trim())).length
  const td1Lines = lines.filter(l => /^[A-Z0-9<]{30}$/.test(l.trim())).length
  const mrzLinesFound = td3Lines + td1Lines

  const debugStatus = noCandidates
    ? classifyMrzStatus(rawText, false, undefined)
    : classifyMrzStatus(rawText, allChecksPass, mrz.checks)

  return {
    valid: allChecksPass && !noCandidates,
    debug_status: debugStatus,
    mrz_lines_found: mrzLinesFound,
    candidates,
    check_digits_pass: {
      passport_no: mrz.checks.passport_no,
      dob: mrz.checks.dob,
      expiry: mrz.checks.expiry,
    },
  }
}

/**
 * The mrzRead reader — injected as CoreReaders.mrzRead.
 *
 * Accepts a raw OCR text string (the `file` param) rather than image bytes,
 * because MRZ parsing works on the text output of the OCR stage, not the image.
 * In production the caller must have already run OCR and pass the fullText here.
 *
 * Usage in readDocumentCore:
 *   readers.mrzRead = mrzReadFromOcrText
 *   req.expectMrz = true  (for international passport / ua_international_passport)
 */
export async function mrzReadFromOcrText(file: unknown): Promise<FieldCandidate[]> {
  const rawText = typeof file === 'string' ? file : ''
  return mrzCandidatesFromText(rawText)
}
