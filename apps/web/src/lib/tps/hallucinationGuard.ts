/**
 * hallucinationGuard — OCR garbage and AI hallucination detector for Central Brain.
 *
 * Catches:
 *   A. Plausibility failures: value doesn't look like a valid name/date/number/geography.
 *   B. Label-as-value: OCR returned a field label instead of a real value.
 *   C. Cross-document name conflict: Levenshtein > 2 with a higher-priority source.
 *   D. Unknown geography: city/province not plausible as a Ukrainian location.
 *
 * Does NOT make legal decisions. Output is a risk assessment — callers decide.
 */

import { levenshtein, isPlausibleName, FIELD_CLASS } from '@/lib/tps/fieldArbiter'
import { analyseNameField, hasMixedScript } from '@/lib/ocr/nameNormalizer'

// TPS-specific name fields (distinct from nameNormalizer's booklet field names)
const TPS_NAME_FIELDS = new Set(['family_name', 'given_name', 'middle_name'])
import { normalizeOblastToNominative, GLOBAL_BLOCKLIST } from '@uscis-helper/knowledge'
import type { SlottedField } from '@/lib/tps/sourcePriority'

export type HallucinationRisk = 'none' | 'low' | 'high'

export interface HallucinationResult {
  risk: HallucinationRisk
  reasons: string[]
  /** True if the value should be blocked outright; false if just flagged. */
  should_block: boolean
}

// Common OCR label words that sometimes bleed into extracted values.
const LABEL_WORDS = new Set([
  'surname', 'given', 'name', 'last', 'first', 'middle', 'patronymic',
  'date', 'birth', 'nationality', 'country', 'passport', 'number',
  'expiry', 'expiration', 'sex', 'gender', 'place', 'city', 'province',
  'oblast', 'region', 'address', 'state', 'zip', 'phone', 'email',
  'прізвище', 'ім\'я', 'по батькові', 'дата', 'народження', 'стать',
  'громадянство', 'місце', 'проживання', 'серія', 'номер',
])

// Strings that indicate OCR returned garbage or a non-data string.
// Note: "no letters" check is omitted here — digits are valid for non-name fields
// (a_number, dob, passport_number). Name fields run isPlausibleName instead.
const GARBAGE_PATTERNS = [
  /\d{4,}.*[а-яА-Яa-zA-Z].*\d{4,}/, // date-digit-letter-digit noise
  /[<>|\\\/]{2,}/, // multiple MRZ filler chars
  /^[A-Z]{6,}[0-9]/, // looks like MRZ garbage in a name field
]

/**
 * Check if a value looks like OCR garbage or a label returned as a value.
 */
export function detectGarbageString(
  field: string,
  value: string,
): HallucinationResult {
  const reasons: string[] = []
  const trimmed = value.trim()

  if (!trimmed) return { risk: 'none', reasons: [], should_block: false }

  // Label-as-value check
  const lower = trimmed.toLowerCase()
  if (LABEL_WORDS.has(lower)) {
    reasons.push(`label-as-value: "${trimmed}" matches field label vocabulary`)
    return { risk: 'high', reasons, should_block: true }
  }

  // Garbage pattern check
  for (const pat of GARBAGE_PATTERNS) {
    if (pat.test(trimmed)) {
      reasons.push(`garbage-pattern: "${trimmed}" matches noise pattern ${pat}`)
      return { risk: 'high', reasons, should_block: true }
    }
  }

  // Name plausibility for STRONG_IDENTITY name fields
  const cls = FIELD_CLASS[field]
  if (cls === 'STRONG_IDENTITY' && TPS_NAME_FIELDS.has(field)) {
    // Direct mixed-script check (faster than full analyseNameField for guard purposes)
    if (hasMixedScript(trimmed)) {
      reasons.push(`mixed-script: Cyrillic+Latin lookalike detected in "${trimmed}"`)
      return { risk: 'high', reasons, should_block: true }
    }
    if (!isPlausibleName(trimmed)) {
      reasons.push(`implausible-name: "${trimmed}" fails name plausibility check`)
      return { risk: 'high', reasons, should_block: true }
    }
    // Full analysis for review_reason flags
    const analysis = analyseNameField(trimmed)
    if (analysis.review_required && analysis.review_reason !== 'mixed_script_ocr_suspected') {
      reasons.push(`abnormal-casing: "${trimmed}" — review_reason=${analysis.review_reason ?? 'unknown'}`)
      return { risk: 'low', reasons, should_block: false }
    }
  }

  // Global blocklist
  if (GLOBAL_BLOCKLIST.has(trimmed.toLowerCase())) {
    reasons.push(`blocklist: "${trimmed}" is in global OCR blocklist`)
    return { risk: 'high', reasons, should_block: true }
  }

  return { risk: 'none', reasons: [], should_block: false }
}

/**
 * Cross-document name conflict check.
 *
 * If a higher-priority source (e.g. passport) provides a different name
 * from a lower-priority source (e.g. EAD), flag if distance > 2.
 * Distance ≤ 2 = possible OCR transcription error → risk=low.
 * Distance > 2 = real conflict or hallucination → risk=high.
 */
export function crossDocumentConflict(
  field: string,
  highPriorityValue: string,
  lowPriorityValue: string,
): HallucinationResult {
  if (!highPriorityValue || !lowPriorityValue) {
    return { risk: 'none', reasons: [], should_block: false }
  }
  const a = highPriorityValue.toLowerCase().trim()
  const b = lowPriorityValue.toLowerCase().trim()
  if (a === b) return { risk: 'none', reasons: [], should_block: false }

  const dist = levenshtein(a, b)
  if (dist <= 2) {
    return {
      risk: 'low',
      reasons: [`cross-doc-fuzzy: "${highPriorityValue}" vs "${lowPriorityValue}" (distance=${dist}, possible OCR error)`],
      should_block: false,
    }
  }
  return {
    risk: 'high',
    reasons: [`cross-doc-conflict: "${highPriorityValue}" vs "${lowPriorityValue}" (distance=${dist}, conflict in ${field})`],
    should_block: true,
  }
}

/**
 * Geography sanity check for city_of_birth and province_of_birth.
 * Province must be a known Ukrainian oblast (via knowledge package).
 * City must not contain label words, dates, or oblast descriptors.
 */
export function checkGeography(
  field: string,
  value: string,
): HallucinationResult {
  const reasons: string[] = []
  const trimmed = value.trim()
  if (!trimmed) return { risk: 'none', reasons: [], should_block: false }

  if (field === 'province_of_birth') {
    // Accept English-normalized "X Oblast" forms (post-dictionaryBridge output e.g. "Vinnytsia Oblast").
    // These are already validated — re-running the Cyrillic dictionary check on Latin input would fail.
    if (/^[A-Za-z][A-Za-z\s\-]*\s+Oblast$/i.test(trimmed)) {
      return { risk: 'none', reasons: [], should_block: false }
    }
    const normalized = normalizeOblastToNominative(trimmed)
    if (!normalized) {
      reasons.push(`unknown-province: "${trimmed}" not recognized as a Ukrainian oblast`)
      return { risk: 'high', reasons, should_block: false } // flag but don't block — could be foreign
    }
    return { risk: 'none', reasons: [], should_block: false }
  }

  if (field === 'city_of_birth') {
    // Reject values that look like they contain oblast/settlement noise
    if (/oblast|область|обл\.|район|settlement|settlement/i.test(trimmed)) {
      reasons.push(`city-contains-oblast: "${trimmed}" includes geographic administrative descriptor`)
      return { risk: 'high', reasons, should_block: true }
    }
    // Reject if all digits or suspiciously short
    if (/^\d+$/.test(trimmed) || trimmed.length < 2) {
      reasons.push(`city-garbage: "${trimmed}" fails city sanity check`)
      return { risk: 'high', reasons, should_block: true }
    }
  }

  return { risk: 'none', reasons: [], should_block: false }
}

/**
 * Run all hallucination checks for a SlottedField.
 * Returns merged risk and all reasons.
 */
export function guardField(sf: SlottedField): HallucinationResult {
  const results: HallucinationResult[] = [
    detectGarbageString(sf.field, sf.value),
  ]
  if (sf.field === 'city_of_birth' || sf.field === 'province_of_birth') {
    results.push(checkGeography(sf.field, sf.value))
  }

  const allReasons = results.flatMap((r) => r.reasons)
  const shouldBlock = results.some((r) => r.should_block)
  const maxRisk = results.reduce<HallucinationRisk>((acc, r) => {
    if (r.risk === 'high') return 'high'
    if (r.risk === 'low' && acc === 'none') return 'low'
    return acc
  }, 'none')

  return { risk: maxRisk, reasons: allReasons, should_block: shouldBlock }
}

/**
 * Cross-validate name fields across multiple SlottedFields for the same logical field.
 * The first candidate (highest priority) is treated as the reference.
 */
export function crossValidateField(
  field: string,
  candidates: SlottedField[],
): HallucinationResult {
  if (candidates.length < 2) return { risk: 'none', reasons: [], should_block: false }
  const [ref, ...rest] = candidates
  const allReasons: string[] = []
  let maxRisk: HallucinationRisk = 'none'
  let shouldBlock = false

  for (const c of rest) {
    const r = crossDocumentConflict(field, ref.value, c.value)
    allReasons.push(...r.reasons)
    if (r.risk === 'high') { maxRisk = 'high'; shouldBlock = shouldBlock || r.should_block }
    else if (r.risk === 'low' && maxRisk === 'none') maxRisk = 'low'
  }
  return { risk: maxRisk, reasons: allReasons, should_block: shouldBlock }
}
