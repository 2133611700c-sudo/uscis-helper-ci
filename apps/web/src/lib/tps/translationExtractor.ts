/**
 * translationExtractor.ts — Translation Mode field extraction.
 *
 * Form Mode (Central Brain default): strict contract — booklet slot CANNOT
 * provide given_name / sex / passport_number (handwritten OCR unreliable for
 * USCIS form fields; controlling identity must come from international passport).
 *
 * Translation Mode (this module): ALL extracted fields are needed.
 * A USCIS-format translation must list every field present in the source document.
 * Contract-rejected fields from the booklet OCR are ACCEPTABLE for translation
 * because the user will review the translation before certifying.
 *
 * Flow:
 *   CB merged (contract-passed, normalized)
 *     + CB rejected (contract-blocked fields, still have their raw extraction)
 *     + manual (user-entered fallback)
 *   → TranslationFieldSet (all fields for translation renderer)
 *
 * ADR-008 §Translation Mode path.
 */

import type { MergedField, RejectedField } from './centralBrain'

// ── DOB formatting ────────────────────────────────────────────────────────────

const EN_MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
]

/**
 * Converts any supported DOB format to "Month DD, YYYY" (USCIS translation style).
 * Accepts: YYYY-MM-DD, MM/DD/YYYY, DD.MM.YYYY, DD/MM/YYYY (ambiguous — treated as DD/MM).
 * Returns null if unparseable.
 */
export function formatDobForTranslation(raw: string): string | null {
  if (!raw || !raw.trim()) return null
  const s = raw.trim()

  // ISO: YYYY-MM-DD
  const isoMatch = s.match(/^(\d{4})-(\d{2})-(\d{2})$/)
  if (isoMatch) {
    const [, y, m, d] = isoMatch
    const month = EN_MONTHS[parseInt(m, 10) - 1]
    if (!month) return null
    return `${month} ${parseInt(d, 10)}, ${y}`
  }

  // MM/DD/YYYY (US format from wizard state)
  const usMatch = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/)
  if (usMatch) {
    const [, m, d, y] = usMatch
    const month = EN_MONTHS[parseInt(m, 10) - 1]
    if (!month) return null
    return `${month} ${parseInt(d, 10)}, ${y}`
  }

  // DD.MM.YYYY (Cyrillic document format)
  const dotMatch = s.match(/^(\d{1,2})\.(\d{1,2})\.(\d{4})$/)
  if (dotMatch) {
    const [, d, m, y] = dotMatch
    const month = EN_MONTHS[parseInt(m, 10) - 1]
    if (!month) return null
    return `${month} ${parseInt(d, 10)}, ${y}`
  }

  // Already formatted: "June 25, 1986" — pass through
  if (/^[A-Z][a-z]+ \d{1,2}, \d{4}$/.test(s)) return s

  return null
}

// ── Translation field set ─────────────────────────────────────────────────────

export interface TranslationFieldSet {
  /** Romanized surname (KMU-55 applied in CB if from OCR) */
  family_name: string | null
  /** Romanized given name */
  given_name: string | null
  /** Romanized patronymic — label MUST be "Patronymic" never "Middle Name" */
  patronymic: string | null
  /** Formatted: "Month DD, YYYY" */
  date_of_birth: string | null
  /** "Male" | "Female" | raw value */
  sex: string | null
  /** Passport series + number, e.g. "IA 123456" */
  passport_number: string | null
  /** City of birth (English, normalized) */
  city_of_birth: string | null
  /** Oblast (English, normalized), e.g. "Vinnytsia Oblast" */
  province_of_birth: string | null
  /** Issuing authority (agency glossary or DeepSeek fallback) */
  issued_by: string | null
  /** Date of issue — formatted "Month DD, YYYY" if parseable */
  date_of_issue: string | null
  /** Source tag for each field — for audit, not rendered */
  _sources: Record<string, 'cb_merged' | 'cb_rejected' | 'manual'>
}

// ── Settlement type expansion ─────────────────────────────────────────────────

// CLAUDE.md rule: "смт" = "urban-type settlement", NEVER "city" or "town"
// USCIS form needs bare city name; translation needs full type.
// We recover the type from raw_value which is preserved through OCR → CB pipeline.
const SETTLEMENT_SUFFIX_MAP: Array<{ re: RegExp; suffix: string }> = [
  { re: /^(?:смт\.?|с-ще\.?|п\.?г\.?т\.?|пгт\.?|сел\.\s+міськ)/iu, suffix: 'urban-type settlement' },
  { re: /^с\.\s/iu, suffix: 'village' },
  { re: /^хут\./iu, suffix: 'khutor' },
  { re: /^сел\./iu, suffix: 'settlement' },
]

function cityWithSettlementType(normalizedCity: string, rawValue?: string): string {
  if (!rawValue) return normalizedCity
  const trimmed = rawValue.trim()
  for (const { re, suffix } of SETTLEMENT_SUFFIX_MAP) {
    if (re.test(trimmed)) return `${normalizedCity} ${suffix}`
  }
  return normalizedCity
}

// ── Internal helpers ──────────────────────────────────────────────────────────

function normalizeSex(raw: string | null): string | null {
  if (!raw) return null
  const upper = raw.trim().toUpperCase()
  if (upper === 'M' || upper === 'MALE' || upper === 'Ч' || upper === 'МУЖ' || upper === 'ЧОЛОВІЧА') return 'Male'
  if (upper === 'F' || upper === 'FEMALE' || upper === 'Ж' || upper === 'ЖЕН' || upper === 'ЖІНОЧА') return 'Female'
  return raw.trim() || null
}

// ── Main extractor ────────────────────────────────────────────────────────────

/**
 * Builds a complete TranslationFieldSet for the Translation Mode renderer.
 *
 * Priority order for each field:
 *   1. CB merged (contract-passed, hallucination-guarded, normalized)
 *   2. CB rejected that came from the booklet slot with ocr_visual/ocr_keyword source
 *      (blocked by form contract, but valid for translation)
 *   3. Manual entry (user typed)
 */
export function extractTranslationFields(
  merged: Record<string, MergedField>,
  rejected: RejectedField[],
  manual: Record<string, string> = {},
): TranslationFieldSet {
  const sources: Record<string, 'cb_merged' | 'cb_rejected' | 'manual'> = {}

  // Build rejected lookup: field → first rejected value from booklet slot
  // CB rejected fields still carry their raw_value from OCR extraction.
  const rejectedByField: Record<string, string> = {}
  for (const r of rejected) {
    if (r.slot === 'booklet' && !rejectedByField[r.field]) {
      rejectedByField[r.field] = r.raw_value
    }
  }

  function get(field: string): string | null {
    if (merged[field]?.value) {
      sources[field] = 'cb_merged'
      return merged[field].value
    }
    if (rejectedByField[field]) {
      sources[field] = 'cb_rejected'
      return rejectedByField[field]
    }
    if (manual[field]) {
      sources[field] = 'manual'
      return manual[field]
    }
    return null
  }

  const rawDob = get('dob')
  const rawDateOfIssue = get('passport_date_of_issue') ?? get('date_of_issue')

  return {
    family_name:     get('family_name'),
    given_name:      get('given_name'),
    patronymic:      get('patronymic') || get('middle_name'),
    date_of_birth:   rawDob ? (formatDobForTranslation(rawDob) ?? rawDob) : null,
    sex:             normalizeSex(get('sex')),
    passport_number: get('passport_number'),
    city_of_birth:   (() => {
      const val = get('city_of_birth')
      if (!val) return null
      return cityWithSettlementType(val, merged['city_of_birth']?.raw_value)
    })(),
    province_of_birth: get('province_of_birth'),
    issued_by:       get('issued_by'),
    date_of_issue:   rawDateOfIssue ? (formatDobForTranslation(rawDateOfIssue) ?? rawDateOfIssue) : null,
    _sources:        sources,
  }
}
