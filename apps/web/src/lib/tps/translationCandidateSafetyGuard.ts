/**
 * translationCandidateSafetyGuard.ts — Translation output firewall.
 *
 * Guards the boundary between raw OCR extraction and the Translation Review Gate.
 * Runs BEFORE the Controlled Translation Renderer produces HTML.
 *
 * Blocks:
 * 1. Forbidden phrases in any extracted field value (legal/compliance)
 * 2. "Middle Name" label for patronymic (HARD RULE — must be "Patronymic")
 * 3. "Police Department" or "Militia" for pre-2015 MVS/міліція issuing authority
 * 4. OCR garbage values (empty, all-digit names, label-as-value patterns)
 * 5. Cyrillic leak: untransliterated Cyrillic in any output field
 *
 * Does NOT block missing fields — missing is acceptable (renders as blank in translation).
 * Does NOT translate anything — that happens in the Renderer.
 *
 * Constitution reference: ADR-008, forbidden_phrase_violations === 0 required before ZIP.
 */

import type { TranslationFieldSet } from './translationExtractor'

// ── Forbidden phrase patterns ─────────────────────────────────────────────────

const FORBIDDEN_EXACT: ReadonlyArray<string> = [
  'certified by AI',
  'USCIS accepted', 'USCIS-accepted',
  'guaranteed acceptance',
  'will be accepted by USCIS',
  'CERTIFIED COPY', 'certified copy',
  'Middle Name',         // patronymic mislabel — HARD RULE
  'Police Department',   // pre-2015 MVS/міліція — must be "Militsiya"
  'passport police',
  'Translator Note', 'internal QA',
  'source_trace', 'source trace',
  'bbox', 'ocr_id', 'ocr_ids',
  'confidence:', 'hallucination',
]

// Regex patterns checked against each field value
const FORBIDDEN_PATTERNS: ReadonlyArray<RegExp> = [
  /militi[ay]/i,         // "Militia" / "Militiya" — must be "Militsiya"
  /поліц/ui,             // Ukrainian Cyrillic "police" — must not appear in translation output
  /міліц/ui,             // Cyrillic милiція — must be transliterated
]

// Fields that must never contain raw Cyrillic (translation output must be Latin)
const LATIN_REQUIRED_FIELDS: ReadonlySet<string> = new Set([
  'family_name', 'given_name', 'patronymic', 'city_of_birth',
  'province_of_birth', 'issued_by', 'sex',
])

// Label words that indicate OCR returned a label instead of a value
const LABEL_GARBAGE: ReadonlyArray<RegExp> = [
  /^прізвище$/iu,
  /^ім'?я$/iu,
  /^по батькові$/iu,
  /^дата народження$/iu,
  /^стать$/iu,
  /^місце народження$/iu,
  /^surname$/i,
  /^given name$/i,
  /^date of birth$/i,
  /^place of birth$/i,
  /^patronymic$/i,
]

// ── Guard result ──────────────────────────────────────────────────────────────

export interface SafetyGuardResult {
  safe: boolean
  violations: SafetyViolation[]
}

export interface SafetyViolation {
  field: string
  value: string
  rule: string
  severity: 'block' | 'warn'
}

// ── Main guard ────────────────────────────────────────────────────────────────

/**
 * Run safety checks on a TranslationFieldSet before it enters the Renderer.
 * Returns { safe: true } only when violations.length === 0 (all severity levels).
 */
export function guardTranslationCandidates(
  fields: TranslationFieldSet,
): SafetyGuardResult {
  const violations: SafetyViolation[] = []

  const fieldEntries: Array<[string, string | null]> = [
    ['family_name',      fields.family_name],
    ['given_name',       fields.given_name],
    ['patronymic',       fields.patronymic],
    ['date_of_birth',    fields.date_of_birth],
    ['sex',              fields.sex],
    ['passport_number',  fields.passport_number],
    ['city_of_birth',    fields.city_of_birth],
    ['province_of_birth', fields.province_of_birth],
    ['issued_by',        fields.issued_by],
    ['date_of_issue',    fields.date_of_issue],
  ]

  for (const [field, rawValue] of fieldEntries) {
    if (!rawValue) continue
    const value = rawValue.trim()
    if (!value) continue

    // 1. Forbidden exact phrases
    for (const phrase of FORBIDDEN_EXACT) {
      if (value.includes(phrase)) {
        violations.push({ field, value, rule: `forbidden_phrase:${phrase}`, severity: 'block' })
      }
    }

    // 2. Forbidden regex patterns
    for (const pattern of FORBIDDEN_PATTERNS) {
      if (pattern.test(value)) {
        violations.push({ field, value, rule: `forbidden_pattern:${pattern.source}`, severity: 'block' })
      }
    }

    // 3. Label-as-value (OCR returned the field label, not the data)
    for (const labelRe of LABEL_GARBAGE) {
      if (labelRe.test(value)) {
        violations.push({ field, value, rule: 'label_as_value', severity: 'block' })
        break
      }
    }

    // 4. Cyrillic leak in Latin-required fields
    if (LATIN_REQUIRED_FIELDS.has(field) && /[а-яА-ЯіїєґІЇЄҐ]/u.test(value)) {
      violations.push({
        field, value,
        rule: 'cyrillic_in_latin_required_field',
        severity: 'block',
      })
    }
  }

  return { safe: violations.length === 0, violations }
}

/**
 * Convenience: returns just the violation strings for use in `violations[]` arrays.
 */
export function collectViolationStrings(result: SafetyGuardResult): string[] {
  return result.violations.map(
    (v) => `[${v.severity}] ${v.field}: ${v.rule} — "${v.value.slice(0, 60)}${v.value.length > 60 ? '…' : ''}"`,
  )
}
