/**
 * Passport extraction module — Ukrainian international passport (TD3).
 *
 * Input:  OcrResult from /api/tps/ocr/extract (Google Vision DOCUMENT_TEXT_DETECTION)
 * Output: TpsModuleResult with TpsExtractedField[] for each MRZ-derived field
 *
 * Strategy:
 *   1. Locate the MRZ — 2 consecutive lines on the lower portion of the
 *      document with high MRZ-character ratio (uppercase A-Z, 0-9, '<')
 *      and length ≈ 44 each.
 *   2. Pass the two lines to v5 mrzParser.parseTd3().
 *   3. Map each parsed field to a TpsExtractedField with provenance
 *      (source_zone='mrz_line_X', bbox from the OCR line, confidence).
 *   4. Flag review_required when:
 *        - any check digit failed
 *        - DOB parses but is implausible (< 1900 or > today)
 *        - expiry already past or < 6 months from today
 *        - nationality != UKR (TPS Ukraine requires Ukrainian nationality)
 *
 * Reuse: lib/translation/identity/mrzParser.ts (TD3, check digits, dates).
 *
 * Privacy: RNOKPP / personalNumber is parsed for check-digit consistency
 * but is NOT returned as a TpsExtractedField — it is never used to fill a
 * USCIS form and we deliberately do not propagate it downstream.
 */

import type { OcrResult, OcrLine } from '@/lib/ocr/types'
import type {
  TpsExtractedField,
  TpsModuleResult,
  TpsDocType,
} from '@/lib/tps/types'
import { parseTd3 } from '@/lib/translation/identity/mrzParser'
import { formatLatinName } from '@uscis-helper/knowledge'

const PASSPORT_MODULE: TpsDocType = 'passport'

// Minimum MRZ-character ratio required to consider a line as MRZ.
// MRZ chars are A-Z, 0-9, '<'. We allow some OCR noise but reject lines
// like "Ivan Kovalenko" (lots of lowercase).
const MIN_MRZ_RATIO = 0.85

// TD3 line length is 44. We accept 42..46 to absorb OCR boundary drift.
const TD3_LINE_LEN_MIN = 42
const TD3_LINE_LEN_MAX = 46

/**
 * Returns the share of characters in `s` that are valid MRZ characters.
 */
function mrzCharRatio(s: string): number {
  if (s.length === 0) return 0
  let valid = 0
  for (const ch of s) {
    if (/[A-Z0-9<]/.test(ch)) valid++
  }
  return valid / s.length
}

/**
 * Compact an OCR line to MRZ shape: uppercase, strip whitespace, replace
 * common OCR confusions (« » → <, ' ' → '', etc.).
 */
function toMrzShape(s: string): string {
  return s
    .toUpperCase()
    .replace(/\s+/g, '')
    .replace(/[«»]/g, '<')
    .replace(/[¥]/g, '<')
}

/**
 * Pad / trim to exactly 44 chars. Padding with '<' is the ICAO standard
 * filler so it doesn't break check-digit math when the OCR clipped a
 * trailing filler.
 */
function normaliseTd3Line(s: string): string {
  if (s.length === 44) return s
  if (s.length < 44) return s.padEnd(44, '<')
  return s.slice(0, 44)
}

/**
 * Convert a "D Month YYYY" USCIS date (returned by parseMrzDate) to
 * ISO YYYY-MM-DD, since TPSAnswers stores dates in ISO form.
 */
const MONTH_MAP: Record<string, string> = {
  January: '01', February: '02', March: '03', April: '04',
  May: '05', June: '06', July: '07', August: '08',
  September: '09', October: '10', November: '11', December: '12',
}
function uscisDateToIso(d: string | null): string | null {
  if (!d) return null
  const m = d.match(/^(\d{1,2}) (\w+) (\d{4})$/)
  if (!m) return null
  const day = m[1].padStart(2, '0')
  const month = MONTH_MAP[m[2]]
  if (!month) return null
  return `${m[3]}-${month}-${day}`
}

/**
 * Find the two MRZ lines in an OcrResult. Returns null if not found.
 *
 * Strategy A: look at OcrResult.lines for two adjacent lines that
 *   independently match TD3 shape. This is the clean case.
 *
 * Strategy B (fallback): Google Vision sometimes merges the two MRZ
 *   lines into a single OcrLine with whitespace between them, even
 *   though raw_text preserves the newline. When strategy A fails,
 *   split raw_text on newlines, find adjacent MRZ-shape rows, and
 *   synthesise OcrLine wrappers using the original line's bbox so
 *   provenance still works for downstream agents.
 */
function locateMrzLines(ocr: OcrResult): { line1: OcrLine; line2: OcrLine } | null {
  // ── Strategy A: clean per-line lookup ─────────────────────────────────────
  const candidates: OcrLine[] = []
  for (const line of ocr.lines) {
    const shape = toMrzShape(line.text)
    if (shape.length < TD3_LINE_LEN_MIN || shape.length > TD3_LINE_LEN_MAX) continue
    if (mrzCharRatio(shape) < MIN_MRZ_RATIO) continue
    candidates.push(line)
  }
  if (candidates.length >= 2) {
    candidates.sort((a, b) => a.bbox.y - b.bbox.y)
    for (let i = 0; i < candidates.length - 1; i++) {
      const top = candidates[i]
      const next = candidates[i + 1]
      const topShape = toMrzShape(top.text)
      const gap = next.bbox.y - (top.bbox.y + top.bbox.height)
      if (gap > 0.05) continue
      if (topShape.startsWith('P')) return { line1: top, line2: next }
    }
    // Last-two fallback within strategy A.
    if (candidates.length >= 2) {
      return {
        line1: candidates[candidates.length - 2],
        line2: candidates[candidates.length - 1],
      }
    }
  }

  // ── Strategy B: raw_text newline split ────────────────────────────────────
  // Vision frequently merges MRZ lines into one OcrLine but preserves
  // \n in raw_text. Split there and rebuild.
  const rawLines = (ocr.raw_text ?? '').split(/\r?\n/).map((s) => s.trim()).filter(Boolean)
  // Try every pair of adjacent rows.
  for (let i = 0; i < rawLines.length - 1; i++) {
    const a = toMrzShape(rawLines[i])
    const b = toMrzShape(rawLines[i + 1])
    if (a.length < TD3_LINE_LEN_MIN || a.length > TD3_LINE_LEN_MAX) continue
    if (b.length < TD3_LINE_LEN_MIN || b.length > TD3_LINE_LEN_MAX) continue
    if (mrzCharRatio(a) < MIN_MRZ_RATIO) continue
    if (mrzCharRatio(b) < MIN_MRZ_RATIO) continue
    // Found two adjacent MRZ-shape rows. Build synthetic OcrLine wrappers.
    // Reuse the bbox/confidence of the OcrLine that contained both rows
    // (typically the first/only OcrLine).
    const sourceLine = ocr.lines[0] ?? null
    const bboxA = sourceLine?.bbox ?? { x: 0, y: 0.85, width: 1, height: 0.05 }
    const bboxB = sourceLine?.bbox ?? { x: 0, y: 0.9, width: 1, height: 0.05 }
    const confidence = sourceLine?.confidence ?? null
    const synthA: OcrLine = {
      id: 'l_raw_a',
      text: rawLines[i],
      page: 1,
      bbox: bboxA,
      words: [],
      confidence: confidence ?? undefined,
      source: 'google_vision_raw_text_split',
    }
    const synthB: OcrLine = {
      id: 'l_raw_b',
      text: rawLines[i + 1],
      page: 1,
      bbox: bboxB,
      words: [],
      confidence: confidence ?? undefined,
      source: 'google_vision_raw_text_split',
    }
    return { line1: synthA, line2: synthB }
  }

  return null
}

interface PassportModuleOptions {
  /** Caller-supplied document id used for source_document_id in fields. */
  document_id: string
}

/**
 * Run the passport module against an OcrResult.
 *
 * Always returns a result — never throws. If no MRZ found, returns
 * matched=false with a debug match_reason. If MRZ found but check digits
 * fail, returns matched=true with manual_review_required=true.
 */
export function runPassportModule(
  ocr: OcrResult,
  opts: PassportModuleOptions,
): TpsModuleResult {
  const located = locateMrzLines(ocr)
  if (!located) {
    return {
      module: PASSPORT_MODULE,
      matched: false,
      match_reason: 'mrz_not_located',
      fields: [],
      warnings: ['Could not locate a TD3 MRZ on this document.'],
      manual_review_required: false,
      manual_review_reasons: [],
    }
  }

  const line1 = normaliseTd3Line(toMrzShape(located.line1.text))
  const line2 = normaliseTd3Line(toMrzShape(located.line2.text))
  const parsed = parseTd3(line1, line2)

  // High-level routing decisions
  const manual_review_reasons: string[] = []
  if (!parsed.checkDigitsValid) {
    manual_review_reasons.push('mrz_check_digit_failed')
  }
  if (parsed.nationality && parsed.nationality !== 'UKR') {
    manual_review_reasons.push('not_ukrainian_nationality')
  }

  // Build extracted fields
  const fields: TpsExtractedField[] = []
  const baseProvenance = {
    extraction_source: 'ocr_mrz' as const,
    source_document_id: opts.document_id,
    language_layer: 'mrz' as const,
    user_corrected: false,
  }

  // Per-field check digit lookup
  const docNumCheck = parsed.checkResults.find(r => r.field === 'document_number')
  const dobCheck   = parsed.checkResults.find(r => r.field === 'date_of_birth')
  const expCheck   = parsed.checkResults.find(r => r.field === 'date_of_expiry')

  // 2026-05-21 FIX_TPS_PASSPORT_MRZ_REVIEW_ON_OVERALL_FAILURE:
  // If ANY check digit in the MRZ block failed, mark EVERY MRZ-derived
  // field as requires_review. Rationale: when the composite check fails,
  // OCR almost certainly mis-read at least one character somewhere in
  // the 88-character TD3 block — and we can't tell which character.
  // Adjacent fields whose individual check digit happens to validate are
  // still SUSPECT because the same OCR pass produced them. Names, sex,
  // and issuing state have no check digit at all, so without this guard
  // they'd ship as "MRZ высокая точность" while the document's overall
  // MRZ failed validation. User report 2026-05-21: passport_number
  // EK790396 emitted with review=false even though parser reason was
  // td3_parsed_with_check_failures — user knew the actual number was
  // different but the UI gave no hint to verify.
  const mrzOverallSuspect = !parsed.checkDigitsValid

  if (parsed.surname) {
    fields.push({
      ...baseProvenance,
      field: 'family_name',
      raw_value: parsed.surname,
      normalized_value: formatLatinName(parsed.surname),
      source_zone: 'mrz_line_1_surname',
      bbox: located.line1.bbox,
      confidence: located.line1.confidence ?? null,
      review_required: mrzOverallSuspect,
      ocr_word_ids: located.line1.words.map(w => w.id),
      passes: ['mrz_name_split'],
      failures: mrzOverallSuspect ? ['mrz_overall_check_digit'] : [],
    })
  }
  if (parsed.givenNames) {
    fields.push({
      ...baseProvenance,
      field: 'given_name',
      raw_value: parsed.givenNames,
      normalized_value: formatLatinName(parsed.givenNames),
      source_zone: 'mrz_line_1_given',
      bbox: located.line1.bbox,
      confidence: located.line1.confidence ?? null,
      review_required: mrzOverallSuspect,
      ocr_word_ids: located.line1.words.map(w => w.id),
      passes: ['mrz_name_split'],
      failures: mrzOverallSuspect ? ['mrz_overall_check_digit'] : [],
    })
  }
  if (parsed.documentNumber) {
    fields.push({
      ...baseProvenance,
      field: 'passport_number',
      raw_value: parsed.documentNumber,
      normalized_value: parsed.documentNumber,
      source_zone: 'mrz_line_2_document_number',
      bbox: located.line2.bbox,
      confidence: located.line2.confidence ?? null,
      review_required: docNumCheck?.valid === false || mrzOverallSuspect,
      ocr_word_ids: located.line2.words.map(w => w.id),
      passes: docNumCheck?.valid === true ? ['mrz_check_digit'] : [],
      failures: [
        ...(docNumCheck?.valid === false ? ['mrz_check_digit'] : []),
        ...(mrzOverallSuspect && docNumCheck?.valid !== false ? ['mrz_overall_check_digit'] : []),
      ],
    })
  }
  if (parsed.nationality) {
    fields.push({
      ...baseProvenance,
      field: 'country_of_nationality',
      raw_value: parsed.nationality,
      normalized_value: parsed.nationality === 'UKR' ? 'Ukraine' : parsed.nationality,
      source_zone: 'mrz_line_2_nationality',
      bbox: located.line2.bbox,
      confidence: located.line2.confidence ?? null,
      review_required: parsed.nationality !== 'UKR' || mrzOverallSuspect,
      ocr_word_ids: located.line2.words.map(w => w.id),
      passes: ['mrz_nationality_present'],
      failures: parsed.nationality !== 'UKR' ? ['nationality_not_ukr'] : [],
    })
  }
  if (parsed.dateOfBirth) {
    const iso = uscisDateToIso(parsed.dateOfBirth)
    fields.push({
      ...baseProvenance,
      field: 'dob',
      raw_value: parsed.dateOfBirth,
      normalized_value: iso,
      source_zone: 'mrz_line_2_dob',
      bbox: located.line2.bbox,
      confidence: located.line2.confidence ?? null,
      review_required: dobCheck?.valid === false || mrzOverallSuspect,
      ocr_word_ids: located.line2.words.map(w => w.id),
      passes: [
        ...(dobCheck?.valid === true ? ['mrz_check_digit'] : []),
        ...(iso ? ['iso_date_parsed'] : []),
      ],
      failures: [
        ...(dobCheck?.valid === false ? ['mrz_check_digit'] : []),
        ...(mrzOverallSuspect && dobCheck?.valid !== false ? ['mrz_overall_check_digit'] : []),
      ],
    })
  }
  if (parsed.sex !== 'Unspecified') {
    fields.push({
      ...baseProvenance,
      field: 'sex',
      raw_value: parsed.sex,
      normalized_value: parsed.sex === 'Male' ? 'M' : 'F',
      source_zone: 'mrz_line_2_sex',
      bbox: located.line2.bbox,
      confidence: located.line2.confidence ?? null,
      review_required: mrzOverallSuspect,
      ocr_word_ids: located.line2.words.map(w => w.id),
      passes: ['mrz_sex_present'],
      failures: mrzOverallSuspect ? ['mrz_overall_check_digit'] : [],
    })
  }
  if (parsed.dateOfExpiry) {
    const iso = uscisDateToIso(parsed.dateOfExpiry)
    const expired = iso ? iso < new Date().toISOString().slice(0, 10) : false
    fields.push({
      ...baseProvenance,
      field: 'passport_expiration_date',
      raw_value: parsed.dateOfExpiry,
      normalized_value: iso,
      source_zone: 'mrz_line_2_expiry',
      bbox: located.line2.bbox,
      confidence: located.line2.confidence ?? null,
      review_required: expCheck?.valid === false || expired || mrzOverallSuspect,
      ocr_word_ids: located.line2.words.map(w => w.id),
      passes: [
        ...(expCheck?.valid === true ? ['mrz_check_digit'] : []),
        ...(iso ? ['iso_date_parsed'] : []),
      ],
      failures: [
        ...(expCheck?.valid === false ? ['mrz_check_digit'] : []),
        ...(expired ? ['expired_passport'] : []),
      ],
    })
    if (expired) manual_review_reasons.push('expired_passport')
  }

  // Issuing country (separate from nationality field on USCIS forms)
  if (parsed.issuingState) {
    fields.push({
      ...baseProvenance,
      field: 'passport_country_of_issuance',
      raw_value: parsed.issuingState,
      normalized_value: parsed.issuingState === 'UKR' ? 'Ukraine' : parsed.issuingState,
      source_zone: 'mrz_line_1_issuing_state',
      bbox: located.line1.bbox,
      confidence: located.line1.confidence ?? null,
      review_required: mrzOverallSuspect,
      ocr_word_ids: located.line1.words.map(w => w.id),
      passes: ['mrz_issuing_state_present'],
      failures: mrzOverallSuspect ? ['mrz_overall_check_digit'] : [],
    })
  }

  const warnings: string[] = []
  if (parsed.errors.length > 0) warnings.push(...parsed.errors)
  if (!parsed.checkDigitsValid) {
    warnings.push('One or more MRZ check digits failed — verify on the document.')
  }
  if (parsed.nationality && parsed.nationality !== 'UKR') {
    warnings.push(`Passport nationality is ${parsed.nationality}, not UKR. TPS Ukraine requires Ukrainian nationality.`)
  }

  return {
    module: PASSPORT_MODULE,
    matched: true,
    match_reason: parsed.checkDigitsValid ? 'td3_parsed_valid' : 'td3_parsed_with_check_failures',
    fields,
    warnings,
    manual_review_required: manual_review_reasons.length > 0,
    manual_review_reasons,
  }
}
