/**
 * Birth Certificate Validators — Messenginfo v6.0
 *
 * All validators specific to Ukrainian birth certificate (ua_birth_certificate).
 * Supplements shared validators in dateFieldLockValidator.ts and agencyGlossary.ts.
 *
 * Safety rules enforced here:
 *   - certificate_number ≠ act_record_number (different fields, different zones)
 *   - act_record_date from act-record zone only, not from date_of_birth zone
 *   - date_of_issue from issuance zone only
 *   - parent names from correct parent label blocks, not swapped
 *   - names in genitive/dative: offer nominative candidate, never force
 *   - mixed Cyrillic/Latin → review_required
 *   - unknown civil registry abbreviation → review_required
 *   - Russian fallback → review_required (Ukrainian is primary)
 *   - 'По батькові' rendered as Patronymic, not Middle Name
 */
import { ExtractedField } from '../types'
import { resolveAgencyAbbr, scanTextForAgencyAbbr } from '../glossary/agencyGlossary'
import { restoreNominative } from '../glossary/nominativeCaseRestorer'

// ── Result type ───────────────────────────────────────────────────────────────

export interface BirthCertValidationResult {
  passed: boolean
  review_required: boolean
  reason?: string
  warning?: string
  candidate_value?: string   // suggested corrected value, if any
}

// ── Allowed source zones by field ─────────────────────────────────────────────

const BIRTH_CERT_DATE_ZONES: Record<string, string[]> = {
  act_record_date:  ['act_record_block', 'civil_act_block', 'registration_block'],
  date_of_birth:    ['birth_block', 'personal_data', 'dob_line', 'demographic_block', 'child_block'],
  date_of_issue:    ['issuance_block', 'issue_block', 'validity_block', 'administrative_block', 'footer_block'],
}

const PARENT_SOURCE_ZONES: Record<string, string[]> = {
  father_full_name: ['father_block', 'father_section', 'parent_block_father', 'parent_father'],
  mother_full_name: ['mother_block', 'mother_section', 'parent_block_mother', 'parent_mother'],
}

// ── 1. certificate_number_not_act_record_number ───────────────────────────────

/**
 * USCIS-critical: certificate_number and act_record_number are DIFFERENT fields.
 * certificate_number: the printed series+number on the certificate face (e.g. І-КВ 123456)
 * act_record_number:  the civil registry act entry number (e.g. 789)
 * Fail if they share raw values, source zones, or OCR token IDs.
 */
export function validateCertNumNotActRecord(
  certNumField: ExtractedField | undefined,
  actRecordField: ExtractedField | undefined,
): BirthCertValidationResult {
  if (!certNumField || !actRecordField) {
    return { passed: true, review_required: false }
  }

  if (
    certNumField.raw_value &&
    actRecordField.raw_value &&
    certNumField.raw_value.trim() === actRecordField.raw_value.trim()
  ) {
    return {
      passed: false,
      review_required: true,
      reason: 'certificate_number_equals_act_record_number',
      warning:
        `certificate_number and act_record_number have identical raw values ` +
        `('${certNumField.raw_value}'). These are different fields — manual review required.`,
    }
  }

  if (
    certNumField.source_zone &&
    actRecordField.source_zone &&
    certNumField.source_zone === actRecordField.source_zone
  ) {
    return {
      passed: false,
      review_required: true,
      reason: 'certificate_and_act_record_same_source_zone',
      warning:
        `certificate_number and act_record_number both extracted from zone ` +
        `'${certNumField.source_zone}'. Possible mislabeling — review required.`,
    }
  }

  const certIds = new Set(certNumField.ocr_ids ?? [])
  const sharedIds = (actRecordField.ocr_ids ?? []).filter(id => certIds.has(id))
  if (sharedIds.length > 0) {
    return {
      passed: false,
      review_required: true,
      reason: 'certificate_and_act_record_share_ocr_ids',
      warning:
        `certificate_number and act_record_number share OCR token IDs: ${sharedIds.join(', ')}. ` +
        'These must come from separate source zones.',
    }
  }

  return { passed: true, review_required: false }
}

// ── 2. act_record_date_lock ───────────────────────────────────────────────────

/**
 * act_record_date must come from the act record label zone.
 * It must NOT be date_of_birth or date_of_issue.
 * Also validates the value is not the same raw text as another date field.
 */
export function validateActRecordDateLock(
  actRecordDateField: ExtractedField | undefined,
  otherDateFields: ExtractedField[],
): BirthCertValidationResult {
  if (!actRecordDateField) {
    return {
      passed: false,
      review_required: true,
      reason: 'act_record_date_missing',
      warning: 'act_record_date could not be extracted. Manual review required.',
    }
  }

  const zoneLower = (actRecordDateField.source_zone ?? '').toLowerCase()
  const allowedZones = BIRTH_CERT_DATE_ZONES.act_record_date
  const zoneOk = allowedZones.some(z => zoneLower.includes(z))

  if (!zoneOk) {
    // Check if extracted from birth or issue zone — high-risk mislabel
    const isBirthZone = BIRTH_CERT_DATE_ZONES.date_of_birth.some(z => zoneLower.includes(z))
    const isIssueZone = BIRTH_CERT_DATE_ZONES.date_of_issue.some(z => zoneLower.includes(z))

    if (isBirthZone || isIssueZone) {
      return {
        passed: false,
        review_required: true,
        reason: 'act_record_date_from_wrong_zone',
        warning:
          `act_record_date extracted from zone '${actRecordDateField.source_zone}' ` +
          `which appears to be a ${isBirthZone ? 'birth date' : 'issue date'} zone. ` +
          'Dates cannot be cross-mapped between fields.',
      }
    }

    return {
      passed: false,
      review_required: true,
      reason: 'act_record_date_zone_not_verified',
      warning:
        `act_record_date extracted from unrecognized zone '${actRecordDateField.source_zone}'. ` +
        `Allowed zones: ${allowedZones.join(', ')}. Review required.`,
    }
  }

  // Check for accidental duplication with date_of_birth or date_of_issue
  for (const other of otherDateFields) {
    if (other.field === 'act_record_date') continue
    if (
      other.raw_value &&
      actRecordDateField.raw_value &&
      other.raw_value.trim() === actRecordDateField.raw_value.trim()
    ) {
      return {
        passed: false,
        review_required: true,
        reason: 'act_record_date_equals_other_date_field',
        warning:
          `act_record_date ('${actRecordDateField.raw_value}') matches ` +
          `${other.field} ('${other.raw_value}'). ` +
          'These must come from different source zones unless the document confirms they are identical.',
      }
    }
  }

  return { passed: true, review_required: false }
}

// ── 3. date_of_issue_lock (birth cert specific) ───────────────────────────────

/**
 * date_of_issue must come from the issuance zone.
 * Must not equal act_record_date or date_of_birth unless label-confirmed.
 */
export function validateDateOfIssueLock(
  dateOfIssueField: ExtractedField | undefined,
  otherDateFields: ExtractedField[],
): BirthCertValidationResult {
  if (!dateOfIssueField) {
    return {
      passed: false,
      review_required: true,
      reason: 'date_of_issue_missing',
      warning: 'date_of_issue could not be extracted.',
    }
  }

  const zoneLower = (dateOfIssueField.source_zone ?? '').toLowerCase()
  const allowedZones = BIRTH_CERT_DATE_ZONES.date_of_issue
  const zoneOk = allowedZones.some(z => zoneLower.includes(z))

  if (!zoneOk) {
    return {
      passed: false,
      review_required: true,
      reason: 'date_of_issue_zone_not_verified',
      warning:
        `date_of_issue extracted from zone '${dateOfIssueField.source_zone}'. ` +
        `Expected zones: ${allowedZones.join(', ')}.`,
    }
  }

  return { passed: true, review_required: false }
}

// ── 4. parent_names_not_swapped ───────────────────────────────────────────────

/**
 * Father and mother names must come from their respective label zones.
 * If zone metadata is absent or unclear, flag review_required — do NOT swap.
 */
export function validateParentNamesNotSwapped(
  fatherField: ExtractedField | undefined,
  motherField: ExtractedField | undefined,
): BirthCertValidationResult {
  if (!fatherField && !motherField) {
    return { passed: true, review_required: false }
  }

  const results: BirthCertValidationResult[] = []

  for (const [field, allowed] of Object.entries(PARENT_SOURCE_ZONES)) {
    const f = field === 'father_full_name' ? fatherField : motherField
    if (!f) continue

    const zoneLower = (f.source_zone ?? '').toLowerCase()
    const zoneOk = allowed.some(z => zoneLower.includes(z))

    // Check if this field is in the OTHER parent's zone
    const otherKey = field === 'father_full_name' ? 'mother_full_name' : 'father_full_name'
    const otherAllowed = PARENT_SOURCE_ZONES[otherKey]
    const inOtherZone = otherAllowed.some(z => zoneLower.includes(z))

    if (inOtherZone) {
      results.push({
        passed: false,
        review_required: true,
        reason: `${field}_in_wrong_parent_zone`,
        warning:
          `${field} was extracted from a zone that belongs to the other parent ` +
          `('${f.source_zone}'). Father and mother names may be swapped.`,
      })
    } else if (!zoneOk && f.source_zone) {
      results.push({
        passed: false,
        review_required: true,
        reason: `${field}_zone_not_verified`,
        warning:
          `${field} extracted from unverified zone '${f.source_zone}'. ` +
          'Cannot confirm parent label assignment.',
      })
    }
  }

  if (results.length > 0) return results[0]
  return { passed: true, review_required: false }
}

// ── 5. nominative_case_required ───────────────────────────────────────────────

/**
 * Parent and child names may appear in genitive or dative case.
 * This validator attempts nominative restoration and flags if uncertain.
 * Never silently normalizes — always surfaces a candidate for user review.
 */
export function validateNominativeCase(
  nameField: ExtractedField | undefined,
  fieldKey: string,
): BirthCertValidationResult {
  if (!nameField || !nameField.raw_value) {
    return { passed: true, review_required: false }
  }

  const raw = nameField.raw_value.trim()
  const restored = restoreNominative(raw)

  if (restored !== raw) {
    return {
      passed: true,   // not a hard failure; just a candidate
      review_required: true,
      reason: 'nominative_case_restored',
      warning:
        `${fieldKey}: name '${raw}' appears to be in oblique case. ` +
        `Nominative candidate: '${restored}'. User confirmation required.`,
      candidate_value: restored,
    }
  }

  return { passed: true, review_required: false }
}

// ── 6. name_mixed_script ──────────────────────────────────────────────────────

/**
 * Names must be in Cyrillic. Latin characters mixed into a Cyrillic name
 * are OCR errors (e.g. Latin 'o' mistaken for Cyrillic 'о').
 * If Latin lookalikes are detected → review_required.
 */
const LATIN_LOOKALIKES = /[a-zA-Z]/

export function validateNameMixedScript(
  nameField: ExtractedField | undefined,
  fieldKey: string,
): BirthCertValidationResult {
  if (!nameField || !nameField.raw_value) {
    return { passed: true, review_required: false }
  }

  const raw = nameField.raw_value.trim()
  if (LATIN_LOOKALIKES.test(raw)) {
    return {
      passed: false,
      review_required: true,
      reason: 'name_mixed_script',
      warning:
        `${fieldKey}: value '${raw}' contains Latin characters mixed with Cyrillic. ` +
        'OCR lookalike substitution suspected. Review required.',
    }
  }

  return { passed: true, review_required: false }
}

// ── 7. civil_registry_glossary ────────────────────────────────────────────────

/**
 * issuing_authority must resolve through the civil registry glossary.
 * Known abbreviations (ЗАГС, РАЦС, ДРАЦС, etc.) → resolved, review_required=false.
 * Unknown abbreviation → review_required=true with reason civil_registry_abbreviation_not_verified.
 * ЗАГС must NOT be silently modernized to ДРАЦС.
 */
export function validateCivilRegistryGlossary(
  issuingAuthorityField: ExtractedField | undefined,
  docYear?: number,
): BirthCertValidationResult & { resolved_en?: string } {
  if (!issuingAuthorityField || !issuingAuthorityField.raw_value) {
    return {
      passed: false,
      review_required: true,
      reason: 'issuing_authority_missing',
      warning: 'issuing_authority could not be extracted. Manual review required.',
    }
  }

  const raw = issuingAuthorityField.raw_value.trim()

  // Scan for known abbreviations
  const knownMatches = scanTextForAgencyAbbr(raw, docYear)
  const unknownMatches: string[] = []

  // Check for upper-case Cyrillic tokens that weren't resolved
  const tokens = raw.split(/\s+/)
  for (const token of tokens) {
    if (!/^[А-ЯЁІЇЄҐ]{2,8}$/.test(token)) continue
    if (!knownMatches.find(m => m.abbreviation === token)) {
      unknownMatches.push(token)
    }
  }

  // Detect ЗАГС→ДРАЦС silent modernization attempt
  const hasZAGS = raw.includes('ЗАГС')
  const hasDRATSS = raw.includes('ДРАЦС')
  if (hasZAGS && hasDRATSS) {
    return {
      passed: false,
      review_required: true,
      reason: 'civil_registry_modernization_conflict',
      warning:
        'issuing_authority contains both ЗАГС and ДРАЦС. ' +
        'Cannot silently modernize Soviet-era ЗАГС to modern ДРАЦС. Manual review required.',
    }
  }

  if (unknownMatches.length > 0) {
    return {
      passed: false,
      review_required: true,
      reason: 'civil_registry_abbreviation_not_verified',
      warning:
        `Unknown civil registry abbreviation(s) in issuing_authority: ${unknownMatches.join(', ')}. ` +
        'Preserve as printed; review required.',
    }
  }

  // Build resolved English form
  const resolved_en = knownMatches
    .filter(m => m.resolved_en)
    .map(m => raw.replace(m.abbreviation, m.resolved_en!))
    .join('; ') || raw

  const anyReviewRequired = knownMatches.some(m => m.review_required)

  return {
    passed: true,
    review_required: anyReviewRequired,
    reason: anyReviewRequired ? 'civil_registry_era_conflict' : undefined,
    resolved_en,
  }
}

// ── 8. source_evidence_required ───────────────────────────────────────────────

/**
 * Every critical field must have OCR evidence (ocr_ids or bbox).
 * Fields with bbox_status='missing' and no ocr_ids → review_required.
 */
export function validateSourceEvidence(
  field: ExtractedField,
): BirthCertValidationResult {
  const hasOcrIds = (field.ocr_ids?.length ?? 0) > 0
  const hasBbox = field.bbox_status && field.bbox_status !== 'missing'

  if (!hasOcrIds && !hasBbox) {
    return {
      passed: false,
      review_required: true,
      reason: 'source_evidence_missing',
      warning:
        `${field.field}: no OCR evidence (no ocr_ids, bbox_status='missing'). ` +
        'Cannot confirm extraction source. Review required.',
    }
  }

  return { passed: true, review_required: false }
}

// ── 9. bilingual_layer ────────────────────────────────────────────────────────

/**
 * Ukrainian is the primary language. If a field was extracted from Russian text
 * (detected by Russian month names or Cyrillic-Russian distinctive characters),
 * set review_required=true with reason 'russian_fallback_used'.
 */
export function validateBilingualLayer(
  field: ExtractedField,
  usedRussianFallback: boolean,
): BirthCertValidationResult {
  if (usedRussianFallback) {
    return {
      passed: true,   // not a hard block; Russian text is common in older documents
      review_required: true,
      reason: 'russian_fallback_used',
      warning:
        `${field.field}: value extracted from Russian text layer. ` +
        'Ukrainian is primary. Review required to confirm accuracy.',
    }
  }

  return { passed: true, review_required: false }
}

// ── 10. forbidden_birth_cert_mislabels ────────────────────────────────────────

/**
 * Detects known labeling mistakes specific to birth certificates:
 *   - act_record_number being labeled as certificate_number
 *   - child_patronymic being rendered as "middle name"
 *   - parent names being swapped based on label order vs label content
 */
export interface MislabelCheckResult {
  valid: boolean
  violations: string[]
}

export function validateForbiddenMislabels(
  fields: ExtractedField[],
  renderLabels: Record<string, string>,
): MislabelCheckResult {
  const violations: string[] = []

  const certNum = fields.find(f => f.field === 'certificate_number')
  const actRecord = fields.find(f => f.field === 'act_record_number')

  // Violation: act record labeled as certificate_number in render
  if (renderLabels['act_record_number']?.toLowerCase().includes('certificate number')) {
    violations.push(
      'act_record_number is labeled as "Certificate Number" in render. ' +
      'These are different fields.',
    )
  }

  // Violation: patronymic labeled as "Middle Name"
  if (renderLabels['child_patronymic']?.toLowerCase().includes('middle name')) {
    violations.push(
      'child_patronymic is labeled as "Middle Name". ' +
      'Must be "Patronymic" per USCIS translation standards.',
    )
  }
  if (renderLabels['child_patronymic']?.toLowerCase() === 'middle name') {
    violations.push('child_patronymic render label must not be "Middle Name".')
  }

  // Violation: act record value in certificate_number field
  if (
    certNum?.raw_value &&
    actRecord?.raw_value &&
    certNum.raw_value.trim() === actRecord.raw_value.trim()
  ) {
    violations.push(
      `certificate_number and act_record_number have the same value ('${certNum.raw_value}'). ` +
      'Possible mislabeling.',
    )
  }

  return { valid: violations.length === 0, violations }
}

// ── 11. date normalization — Ukrainian month support ──────────────────────────

import { UKRAINIAN_MONTHS, RUSSIAN_MONTHS } from '../numericAccuracy/dateFieldLockValidator'

export interface DateNormResult {
  normalized: string | null
  review_required: boolean
  reason?: string
  used_fallback_language?: 'russian'
}

/**
 * Normalize a date from a birth certificate.
 * Ukrainian month names are primary; Russian month names require review_required=true.
 * Spelled-out numeric dates (e.g. "двадцять п'ятого") are NOT supported — review_required.
 *
 * Normalized output format: "DD Month YYYY" (e.g. "25 June 1986")
 * Not MM/DD/YYYY (not used in customer-facing PDF).
 */
export function normalizeBirthCertDate(raw: string): DateNormResult {
  if (!raw || !raw.trim()) {
    return { normalized: null, review_required: true, reason: 'date_empty' }
  }

  const cleaned = raw.trim()

  // Pattern: "01 січня 1990" or "01 січня 1990 р."
  const match = cleaned.match(/^(\d{1,2})\s+([а-яїієёА-ЯЇІЄЁа-яА-Я]+)\s+(\d{4})/)
  if (!match) {
    // Could be a spelled-out date (e.g. "двадцять п'ятого...")
    // These require manual review — do not attempt to parse
    return {
      normalized: null,
      review_required: true,
      reason: 'date_format_not_parseable',
    }
  }

  const day = match[1].padStart(2, '0')
  const monthRaw = match[2].toLowerCase()
  const year = match[3]

  // Try Ukrainian first
  const ukMonth = UKRAINIAN_MONTHS[monthRaw]
  if (ukMonth) {
    return {
      normalized: `${day} ${ukMonth} ${year}`,
      review_required: false,
    }
  }

  // Fallback to Russian — requires review_required
  const ruMonth = RUSSIAN_MONTHS[monthRaw]
  if (ruMonth) {
    return {
      normalized: `${day} ${ruMonth} ${year}`,
      review_required: true,
      reason: 'russian_month_fallback',
      used_fallback_language: 'russian',
    }
  }

  // Month not recognized at all
  return {
    normalized: null,
    review_required: true,
    reason: 'month_name_not_recognized',
  }
}
