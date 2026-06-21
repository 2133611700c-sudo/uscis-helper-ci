/**
 * Marriage Certificate Validators — Messenginfo v6.0
 *
 * All validators specific to Ukrainian marriage certificate (ua_marriage_certificate).
 * Supplements shared validators in dateFieldLockValidator.ts and agencyGlossary.ts.
 *
 * Safety rules enforced here:
 *   - certificate_number ≠ act_record_number (different fields, different zones)
 *   - act_record_date from act-record zone only (not date_of_marriage, not date_of_issue)
 *   - date_of_marriage from marriage registration label only
 *   - date_of_issue from issuance zone only
 *   - spouse_1 / spouse_2 fields must not be swapped
 *   - surname_before_marriage ≠ surname_after_marriage — different labels
 *   - patronymic rendered as Patronymic, NEVER "Middle Name"
 *   - names in genitive/dative → offer nominative candidate, never force
 *   - mixed Cyrillic/Latin → review_required
 *   - unknown civil registry abbreviation → review_required
 *   - Russian fallback → review_required (Ukrainian is primary)
 */
import type { ExtractedField } from '../types'
import { scanTextForAgencyAbbr } from '../glossary/agencyGlossary'
import { restoreNominative } from '../glossary/nominativeCaseRestorer'
import { ALL_MONTHS, normalizeDateUkrainian } from '../numericAccuracy/dateFieldLockValidator'

// ── Shared result type ────────────────────────────────────────────────────────

export interface MarriageCertValidationResult {
  passed: boolean
  review_required: boolean
  reason?: string
  warning?: string
  candidate_value?: string
}

// ── Allowed source zones ──────────────────────────────────────────────────────

const MARRIAGE_DATE_ZONES: Record<string, string[]> = {
  act_record_date:  ['act_record_block', 'civil_act_block', 'registration_block'],
  date_of_marriage: ['marriage_block', 'marriage_date_block', 'registration_date_block', 'main_block'],
  date_of_issue:    ['issuance_block', 'issue_block', 'validity_block', 'administrative_block', 'footer_block'],
}

const SPOUSE_SOURCE_ZONES: Record<string, string[]> = {
  spouse_1_surname_before_marriage: ['spouse_1_block', 'spouse1_block', 'first_spouse_block'],
  spouse_1_given_name:              ['spouse_1_block', 'spouse1_block', 'first_spouse_block'],
  spouse_1_patronymic:              ['spouse_1_block', 'spouse1_block', 'first_spouse_block'],
  spouse_1_surname_after_marriage:  ['spouse_1_block', 'spouse1_block', 'first_spouse_block'],
  spouse_2_surname_before_marriage: ['spouse_2_block', 'spouse2_block', 'second_spouse_block'],
  spouse_2_given_name:              ['spouse_2_block', 'spouse2_block', 'second_spouse_block'],
  spouse_2_patronymic:              ['spouse_2_block', 'spouse2_block', 'second_spouse_block'],
  spouse_2_surname_after_marriage:  ['spouse_2_block', 'spouse2_block', 'second_spouse_block'],
}

// ── 1. certificate_number_not_act_record_number ───────────────────────────────

export function validateMarriageCertNumNotActRecord(
  certNumField: ExtractedField | undefined,
  actRecordField: ExtractedField | undefined,
): MarriageCertValidationResult {
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
      reason: 'certificate_and_act_record_same_zone',
      warning:
        `certificate_number and act_record_number extracted from same source zone ` +
        `'${certNumField.source_zone}'. Zone mismatch — review required.`,
    }
  }

  const certIds = certNumField.ocr_ids ?? []
  const actIds = actRecordField.ocr_ids ?? []
  const sharedIds = certIds.filter(id => actIds.includes(id))
  if (sharedIds.length > 0) {
    return {
      passed: false,
      review_required: true,
      reason: 'certificate_and_act_record_share_ocr_ids',
      warning:
        `certificate_number and act_record_number share OCR token IDs [${sharedIds.join(', ')}]. ` +
        `Token overlap — manual review required.`,
    }
  }

  return { passed: true, review_required: false }
}

// ── 2. act_record_number_required ────────────────────────────────────────────

export function validateActRecordNumberRequired(
  actRecord: ExtractedField | undefined,
): MarriageCertValidationResult {
  if (!actRecord || !actRecord.raw_value || actRecord.raw_value.trim() === '') {
    return {
      passed: false,
      review_required: true,
      reason: 'act_record_number_missing',
      warning: 'act_record_number is required for marriage certificate translation. Field absent.',
    }
  }
  return { passed: true, review_required: false }
}

// ── 3. act_record_date_lock ───────────────────────────────────────────────────

export function validateMarriageActRecordDateLock(
  actDate: ExtractedField | undefined,
  dateOfMarriage: ExtractedField | undefined,
  dateOfIssue: ExtractedField | undefined,
): MarriageCertValidationResult {
  if (!actDate) return { passed: true, review_required: false }

  const zoneLower = actDate.source_zone?.toLowerCase() ?? ''
  const allowedZones = MARRIAGE_DATE_ZONES.act_record_date
  const inAllowedZone = allowedZones.some(z => zoneLower.includes(z))

  if (!inAllowedZone) {
    return {
      passed: false,
      review_required: true,
      reason: 'act_record_date_wrong_zone',
      warning: `act_record_date extracted from zone '${actDate.source_zone}' which is not in allowed zones: ${allowedZones.join(', ')}.`,
    }
  }

  // Must not equal date_of_marriage from a shared OCR source
  if (dateOfMarriage) {
    const sharedIds = (actDate.ocr_ids ?? []).filter(id => (dateOfMarriage.ocr_ids ?? []).includes(id))
    if (sharedIds.length > 0) {
      return {
        passed: false,
        review_required: true,
        reason: 'act_record_date_shares_tokens_with_date_of_marriage',
        warning: `act_record_date shares OCR IDs with date_of_marriage — possible field confusion.`,
      }
    }
  }

  // Must not equal date_of_issue from a shared OCR source
  if (dateOfIssue) {
    const sharedIds = (actDate.ocr_ids ?? []).filter(id => (dateOfIssue.ocr_ids ?? []).includes(id))
    if (sharedIds.length > 0) {
      return {
        passed: false,
        review_required: true,
        reason: 'act_record_date_shares_tokens_with_date_of_issue',
        warning: `act_record_date shares OCR IDs with date_of_issue — possible field confusion.`,
      }
    }
  }

  return { passed: true, review_required: false }
}

// ── 4. date_of_marriage_lock ──────────────────────────────────────────────────

export function validateDateOfMarriageLock(
  field: ExtractedField | undefined,
  others: ExtractedField[],
): MarriageCertValidationResult {
  if (!field) return { passed: true, review_required: false }

  const zoneLower = field.source_zone?.toLowerCase() ?? ''
  const allowedZones = MARRIAGE_DATE_ZONES.date_of_marriage
  const inAllowedZone = allowedZones.some(z => zoneLower.includes(z))

  if (!inAllowedZone) {
    return {
      passed: false,
      review_required: true,
      reason: 'date_of_marriage_wrong_zone',
      warning: `date_of_marriage extracted from zone '${field.source_zone}' which is not in allowed zones: ${allowedZones.join(', ')}.`,
    }
  }

  // Must not share OCR IDs with act_record_date or date_of_issue
  for (const other of others) {
    if (other.field === 'date_of_marriage') continue
    const sharedIds = (field.ocr_ids ?? []).filter(id => (other.ocr_ids ?? []).includes(id))
    if (sharedIds.length > 0 && (other.field === 'act_record_date' || other.field === 'date_of_issue')) {
      return {
        passed: false,
        review_required: true,
        reason: `date_of_marriage_shares_tokens_with_${other.field}`,
        warning: `date_of_marriage shares OCR IDs with ${other.field} — possible date field confusion.`,
      }
    }
  }

  return { passed: true, review_required: false }
}

// ── 5. date_of_issue_lock ─────────────────────────────────────────────────────

export function validateMarriageDateOfIssueLock(
  field: ExtractedField | undefined,
  others: ExtractedField[],
): MarriageCertValidationResult {
  if (!field) return { passed: true, review_required: false }

  const zoneLower = field.source_zone?.toLowerCase() ?? ''
  const allowedZones = MARRIAGE_DATE_ZONES.date_of_issue
  const inAllowedZone = allowedZones.some(z => zoneLower.includes(z))

  if (!inAllowedZone) {
    return {
      passed: false,
      review_required: true,
      reason: 'date_of_issue_wrong_zone',
      warning: `date_of_issue extracted from zone '${field.source_zone}' which is not in allowed zones: ${allowedZones.join(', ')}.`,
    }
  }

  return { passed: true, review_required: false }
}

// ── 6. spouse_order_preserved ─────────────────────────────────────────────────

export function validateSpouseOrderPreserved(
  spouse1Fields: ExtractedField[],
  spouse2Fields: ExtractedField[],
): MarriageCertValidationResult {
  // Check that spouse_1 fields don't come from spouse_2 zones
  for (const f of spouse1Fields) {
    if (!f.field.startsWith('spouse_1')) continue
    const zoneLower = f.source_zone?.toLowerCase() ?? ''
    const inSpouse2Zone = ['spouse_2_block', 'spouse2_block', 'second_spouse_block'].some(z =>
      zoneLower.includes(z),
    )
    if (inSpouse2Zone) {
      return {
        passed: false,
        review_required: true,
        reason: 'spouse_1_field_from_spouse_2_zone',
        warning: `Field '${f.field}' came from a spouse_2 zone '${f.source_zone}' — possible spouse swap.`,
      }
    }
  }

  // Check that spouse_2 fields don't come from spouse_1 zones
  for (const f of spouse2Fields) {
    if (!f.field.startsWith('spouse_2')) continue
    const zoneLower = f.source_zone?.toLowerCase() ?? ''
    const inSpouse1Zone = ['spouse_1_block', 'spouse1_block', 'first_spouse_block'].some(z =>
      zoneLower.includes(z),
    )
    if (inSpouse1Zone) {
      return {
        passed: false,
        review_required: true,
        reason: 'spouse_2_field_from_spouse_1_zone',
        warning: `Field '${f.field}' came from a spouse_1 zone '${f.source_zone}' — possible spouse swap.`,
      }
    }
  }

  return { passed: true, review_required: false }
}

// ── 7. before_after_surname_not_swapped ───────────────────────────────────────

export function validateBeforeAfterSurnameNotSwapped(
  surnameBefore: ExtractedField | undefined,
  surnameAfter: ExtractedField | undefined,
): MarriageCertValidationResult {
  if (!surnameBefore && !surnameAfter) return { passed: true, review_required: false }

  // If the label zones are swapped, flag it
  const beforeZone = surnameBefore?.source_label?.toLowerCase() ?? ''
  const afterZone = surnameAfter?.source_label?.toLowerCase() ?? ''

  if (
    beforeZone.includes('після') ||  // "after" in "before" field
    afterZone.includes('до') // "before" in "after" field
  ) {
    return {
      passed: false,
      review_required: true,
      reason: 'before_after_surname_label_mismatch',
      warning: `Surname before/after marriage labels appear swapped — review source labels.`,
    }
  }

  // Flag if both are present and identical (possible extraction error)
  if (
    surnameBefore?.raw_value &&
    surnameAfter?.raw_value &&
    surnameBefore.raw_value.trim() === surnameAfter.raw_value.trim() &&
    surnameBefore.source_zone === surnameAfter.source_zone
  ) {
    return {
      passed: false,
      review_required: true,
      reason: 'before_after_surname_identical_in_same_zone',
      warning: `Surname before and after marriage are identical and from the same zone — label distinction needed.`,
    }
  }

  return { passed: true, review_required: false }
}

// ── 8. spouse_names_not_swapped ───────────────────────────────────────────────

export function validateSpouseNamesNotSwapped(
  fields: ExtractedField[],
): MarriageCertValidationResult {
  const spouse1Given = fields.find(f => f.field === 'spouse_1_given_name')
  const spouse2Given = fields.find(f => f.field === 'spouse_2_given_name')

  if (!spouse1Given || !spouse2Given) return { passed: true, review_required: false }

  // If given names share the same source_zone, flag as potentially swapped
  if (
    spouse1Given.source_zone &&
    spouse2Given.source_zone &&
    spouse1Given.source_zone === spouse2Given.source_zone &&
    spouse1Given.source_zone !== 'unknown'
  ) {
    return {
      passed: false,
      review_required: true,
      reason: 'spouse_given_names_from_same_zone',
      warning: `Both spouse given names extracted from same zone '${spouse1Given.source_zone}' — possible spouse swap.`,
    }
  }

  return { passed: true, review_required: false }
}

// ── 9. nominative_case_required_for_names ────────────────────────────────────

export function validateMarriageNominativeCase(
  field: ExtractedField,
  key: string,
): MarriageCertValidationResult {
  if (!field.raw_value) return { passed: true, review_required: false }

  const restored = restoreNominative(field.raw_value)

  if (restored && restored !== field.raw_value) {
    return {
      passed: false,
      review_required: true,
      reason: 'oblique_case_detected',
      warning: `Field '${key}' may be in genitive/dative case. Suggested nominative: '${restored}'.`,
      candidate_value: restored,
    }
  }

  return { passed: true, review_required: false }
}

// ── 10. civil_registry_glossary_required ─────────────────────────────────────

export function validateMarriageCivilRegistryGlossary(
  field: ExtractedField | undefined,
): MarriageCertValidationResult {
  if (!field?.raw_value) return { passed: true, review_required: false }

  const results = scanTextForAgencyAbbr(field.raw_value)

  // Unverified: any abbreviation has unknown confidence (not in glossary)
  const hasUnverified = results.some(r => r.confidence === 'unknown')
  // Conflict: text contains both pre-2015 (ЗАГС/РАЦС) and post-2015 (ДРАЦС) era terms
  const upper = field.raw_value.toUpperCase()
  const hasLegacyTerm = upper.includes('ЗАГС') || upper.includes('РАЦС')
  const hasModernTerm = upper.includes('ДРАЦС')
  const hasConflict = hasLegacyTerm && hasModernTerm

  if (hasConflict) {
    return {
      passed: false,
      review_required: true,
      reason: 'civil_registry_modernization_conflict',
      warning: `Issuing authority '${field.raw_value}' contains both ЗАГС and ДРАЦС — historical/modern conflict detected.`,
    }
  }

  if (hasUnverified) {
    return {
      passed: false,
      review_required: true,
      reason: 'civil_registry_abbreviation_not_verified',
      warning: `Issuing authority '${field.raw_value}' contains unrecognized abbreviations. Manual review required.`,
    }
  }

  return { passed: true, review_required: false }
}

// ── 11. source_evidence_required ─────────────────────────────────────────────

export function validateMarriageSourceEvidence(
  field: ExtractedField,
): MarriageCertValidationResult {
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

// ── 12. bilingual_layer_protection ───────────────────────────────────────────

export function validateMarriageBilingualLayer(
  field: ExtractedField,
  usedRussianFallback: boolean,
): MarriageCertValidationResult {
  if (usedRussianFallback) {
    return {
      passed: false,
      review_required: true,
      reason: 'russian_language_fallback',
      warning: `Field '${field.field}' was extracted from the Russian layer. Ukrainian is primary. Review required.`,
    }
  }
  return { passed: true, review_required: false }
}

// ── 13. forbidden_marriage_mislabels ─────────────────────────────────────────

export interface MarriageMislabelCheckResult {
  violations: string[]
  passed: boolean
}

/**
 * Checks for forbidden label patterns in marriage certificate renders.
 * - Patronymic must NEVER appear as "Middle Name"
 * - Act record label must not be confused with certificate number label
 * - Spouse order labels must be preserved
 */
export function validateForbiddenMarriageMislabels(
  fields: ExtractedField[],
  renderLabels: Record<string, string>,
): MarriageMislabelCheckResult {
  const violations: string[] = []

  // Patronymic must never be labeled "Middle Name"
  const patronymicFields = fields.filter(f => f.field.endsWith('_patronymic'))
  for (const pf of patronymicFields) {
    const label = renderLabels[pf.field] ?? ''
    if (label.toLowerCase().includes('middle name')) {
      violations.push(`'${pf.field}' is labeled as "Middle Name". Must use "Patronymic".`)
    }
    if (pf.normalized_value?.toLowerCase().includes('middle name')) {
      violations.push(`'${pf.field}' normalized_value contains "Middle Name". Must use "Patronymic".`)
    }
  }

  // Act record number must not use certificate number label
  const actField = fields.find(f => f.field === 'act_record_number')
  if (actField) {
    const label = renderLabels[actField.field] ?? ''
    if (label.toLowerCase().includes('certificate number')) {
      violations.push(`act_record_number is labeled as "Certificate Number". Must use "Act Record Number".`)
    }
  }

  return { violations, passed: violations.length === 0 }
}

// ── Date normalization helper ─────────────────────────────────────────────────

/**
 * Normalize a Ukrainian or Russian date string for marriage certificate fields.
 * Ukrainian months are primary. Russian fallback sets review_required=true.
 */
export function normalizeMarriageCertDate(raw: string): {
  normalized: string | null
  review_required: boolean
  reason?: string
} {
  const trimmed = raw.trim()

  // Try Ukrainian primary parse
  const ukResult = normalizeDateUkrainian(trimmed, ALL_MONTHS)
  if (ukResult) {
    // Check if it came from Russian (Russian months are a subset of ALL_MONTHS)
    const RUSSIAN_MONTH_NAMES = [
      'января', 'февраля', 'марта', 'апреля', 'мая', 'июня',
      'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря',
    ]
    const usedRussian = RUSSIAN_MONTH_NAMES.some(m => trimmed.toLowerCase().includes(m))

    // Convert MM/DD/YYYY back to DD Month YYYY for display
    const [month, day, year] = ukResult.split('/')
    const MONTH_NAMES = [
      '', 'January', 'February', 'March', 'April', 'May', 'June',
      'July', 'August', 'September', 'October', 'November', 'December',
    ]
    const monthName = MONTH_NAMES[parseInt(month, 10)]
    // Strip leading zero from day (USCIS format: "3 October 2018" not "03 October 2018")
    const dayNum = parseInt(day, 10)
    const normalized = monthName ? `${dayNum} ${monthName} ${year}` : null

    if (usedRussian) {
      return { normalized, review_required: true, reason: 'russian_month_fallback' }
    }
    return { normalized, review_required: false }
  }

  // Spelled-out or unreadable
  if (/[а-яА-ЯіІїЇєЄёЁ]/.test(trimmed) && !/\d{4}/.test(trimmed)) {
    return {
      normalized: null,
      review_required: true,
      reason: 'partial_date_unreadable',
    }
  }

  return { normalized: null, review_required: true, reason: 'date_format_unrecognized' }
}
