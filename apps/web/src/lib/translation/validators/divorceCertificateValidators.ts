/**
 * Divorce Certificate Validators — Messenginfo v6.0
 *
 * All validators specific to Ukrainian divorce certificate (ua_divorce_certificate).
 * Supplements shared validators in dateFieldLockValidator.ts and agencyGlossary.ts.
 *
 * Safety rules enforced here:
 *   - certificate_number ≠ act_record_number (different fields, different zones)
 *   - act_record_date from act-record zone only (not date_of_divorce, not date_of_issue)
 *   - date_of_divorce from dissolution label only
 *   - date_of_issue from issuance zone only
 *   - spouse_1 / spouse_2 fields must not be swapped
 *   - basis_of_divorce must come from visible label — never inferred
 *   - long/complex basis → manual_review_required
 *   - court decision details only if explicitly present — never invented
 *   - patronymic rendered as Patronymic, NEVER "Middle Name"
 *   - names in genitive/dative → offer nominative candidate, never force
 *   - mixed Cyrillic/Latin → review_required
 *   - Russian fallback → review_required (Ukrainian is primary)
 */
import type { ExtractedField } from '../types'
import { scanTextForAgencyAbbr } from '../glossary/agencyGlossary'
import { restoreNominative } from '../glossary/nominativeCaseRestorer'
import { ALL_MONTHS, normalizeDateUkrainian } from '../numericAccuracy/dateFieldLockValidator'

// ── Shared result type ────────────────────────────────────────────────────────

export interface DivorceCertValidationResult {
  passed: boolean
  review_required: boolean
  reason?: string
  warning?: string
  candidate_value?: string
}

// ── Allowed source zones ──────────────────────────────────────────────────────

const DIVORCE_DATE_ZONES: Record<string, string[]> = {
  act_record_date:  ['act_record_block', 'civil_act_block', 'registration_block'],
  date_of_divorce:  ['divorce_block', 'dissolution_block', 'divorce_date_block', 'main_block'],
  date_of_issue:    ['issuance_block', 'issue_block', 'validity_block', 'administrative_block', 'footer_block'],
}

// ── 1. certificate_number_not_act_record_number ───────────────────────────────

export function validateDivorceCertNumNotActRecord(
  certNumField: ExtractedField | undefined,
  actRecordField: ExtractedField | undefined,
): DivorceCertValidationResult {
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
        `certificate_number and act_record_number extracted from same zone ` +
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

export function validateDivorceActRecordNumberRequired(
  actRecord: ExtractedField | undefined,
): DivorceCertValidationResult {
  if (!actRecord || !actRecord.raw_value || actRecord.raw_value.trim() === '') {
    return {
      passed: false,
      review_required: true,
      reason: 'act_record_number_missing',
      warning: 'act_record_number is required for divorce certificate translation. Field absent.',
    }
  }
  return { passed: true, review_required: false }
}

// ── 3. act_record_date_lock ───────────────────────────────────────────────────

export function validateDivorceActRecordDateLock(
  actDate: ExtractedField | undefined,
  dateOfDivorce: ExtractedField | undefined,
  dateOfIssue: ExtractedField | undefined,
): DivorceCertValidationResult {
  if (!actDate) return { passed: true, review_required: false }

  const zoneLower = actDate.source_zone?.toLowerCase() ?? ''
  const allowedZones = DIVORCE_DATE_ZONES.act_record_date
  const inAllowedZone = allowedZones.some(z => zoneLower.includes(z))

  if (!inAllowedZone) {
    return {
      passed: false,
      review_required: true,
      reason: 'act_record_date_wrong_zone',
      warning: `act_record_date extracted from zone '${actDate.source_zone}' which is not in allowed zones: ${allowedZones.join(', ')}.`,
    }
  }

  // Must not share OCR IDs with date_of_divorce
  if (dateOfDivorce) {
    const sharedIds = (actDate.ocr_ids ?? []).filter(id => (dateOfDivorce.ocr_ids ?? []).includes(id))
    if (sharedIds.length > 0) {
      return {
        passed: false,
        review_required: true,
        reason: 'act_record_date_shares_tokens_with_date_of_divorce',
        warning: 'act_record_date shares OCR IDs with date_of_divorce — possible field confusion.',
      }
    }
  }

  // Must not share OCR IDs with date_of_issue
  if (dateOfIssue) {
    const sharedIds = (actDate.ocr_ids ?? []).filter(id => (dateOfIssue.ocr_ids ?? []).includes(id))
    if (sharedIds.length > 0) {
      return {
        passed: false,
        review_required: true,
        reason: 'act_record_date_shares_tokens_with_date_of_issue',
        warning: 'act_record_date shares OCR IDs with date_of_issue — possible field confusion.',
      }
    }
  }

  return { passed: true, review_required: false }
}

// ── 4. date_of_divorce_lock ───────────────────────────────────────────────────

export function validateDateOfDivorceLock(
  field: ExtractedField | undefined,
  others: ExtractedField[],
): DivorceCertValidationResult {
  if (!field) return { passed: true, review_required: false }

  const zoneLower = field.source_zone?.toLowerCase() ?? ''
  const allowedZones = DIVORCE_DATE_ZONES.date_of_divorce
  const inAllowedZone = allowedZones.some(z => zoneLower.includes(z))

  if (!inAllowedZone) {
    return {
      passed: false,
      review_required: true,
      reason: 'date_of_divorce_wrong_zone',
      warning: `date_of_divorce extracted from zone '${field.source_zone}' which is not in allowed zones: ${allowedZones.join(', ')}.`,
    }
  }

  // Must not share OCR IDs with act_record_date or date_of_issue
  for (const other of others) {
    if (other.field === 'date_of_divorce') continue
    if (other.field !== 'act_record_date' && other.field !== 'date_of_issue') continue
    const sharedIds = (field.ocr_ids ?? []).filter(id => (other.ocr_ids ?? []).includes(id))
    if (sharedIds.length > 0) {
      return {
        passed: false,
        review_required: true,
        reason: `date_of_divorce_shares_tokens_with_${other.field}`,
        warning: `date_of_divorce shares OCR IDs with ${other.field} — possible date field confusion.`,
      }
    }
  }

  return { passed: true, review_required: false }
}

// ── 5. date_of_issue_lock ─────────────────────────────────────────────────────

export function validateDivorceDateOfIssueLock(
  field: ExtractedField | undefined,
): DivorceCertValidationResult {
  if (!field) return { passed: true, review_required: false }

  const zoneLower = field.source_zone?.toLowerCase() ?? ''
  const allowedZones = DIVORCE_DATE_ZONES.date_of_issue
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

export function validateDivorceSpouseOrderPreserved(
  spouse1Fields: ExtractedField[],
  spouse2Fields: ExtractedField[],
): DivorceCertValidationResult {
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

// ── 7. spouse_names_not_swapped ───────────────────────────────────────────────

export function validateDivorceSpouseNamesNotSwapped(
  fields: ExtractedField[],
): DivorceCertValidationResult {
  const spouse1Given = fields.find(f => f.field === 'spouse_1_given_name')
  const spouse2Given = fields.find(f => f.field === 'spouse_2_given_name')

  if (!spouse1Given || !spouse2Given) return { passed: true, review_required: false }

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

// ── 8. basis_of_divorce_required_or_review ───────────────────────────────────

/** Max word count before basis_of_divorce is considered "complex legal text" */
const COMPLEX_BASIS_WORD_THRESHOLD = 30

export function validateBasisOfDivorcRequired(
  field: ExtractedField | undefined,
): DivorceCertValidationResult {
  if (!field || !field.raw_value || field.raw_value.trim() === '') {
    return {
      passed: false,
      review_required: true,
      reason: 'basis_of_divorce_missing',
      warning: 'basis_of_divorce is required. Value not found — manual review required.',
    }
  }

  const wordCount = field.raw_value.trim().split(/\s+/).length
  if (wordCount > COMPLEX_BASIS_WORD_THRESHOLD) {
    return {
      passed: false,
      review_required: true,
      reason: 'complex_legal_basis',
      warning: `basis_of_divorce text is ${wordCount} words. Complex legal text requires manual review.`,
    }
  }

  // Check for article references, court case numbers (legal complexity indicators)
  const legalPattern = /ст\.\s*\d+|стаття\s+\d+|справа\s+№|article\s+\d+/i
  if (legalPattern.test(field.raw_value)) {
    return {
      passed: false,
      review_required: true,
      reason: 'legal_text_reference_detected',
      warning: 'basis_of_divorce contains legal article references or case numbers — manual review required.',
    }
  }

  return { passed: true, review_required: false }
}

// ── 9. court_decision_details_not_invented ────────────────────────────────────

export function validateCourtDecisionNotInvented(
  courtField: ExtractedField | undefined,
  fieldName: string,
): DivorceCertValidationResult {
  if (!courtField) return { passed: true, review_required: false }

  // If field has no OCR evidence but has a non-empty value — flagged as invented
  const hasOcrIds = (courtField.ocr_ids?.length ?? 0) > 0
  const hasBbox = courtField.bbox_status && courtField.bbox_status !== 'missing'

  if (courtField.raw_value && courtField.raw_value.trim() !== '' && !hasOcrIds && !hasBbox) {
    return {
      passed: false,
      review_required: true,
      reason: 'court_field_no_ocr_evidence',
      warning: `'${fieldName}' has a value but no OCR token IDs or bbox. Court details may be invented — manual review required.`,
    }
  }

  return { passed: true, review_required: false }
}

// ── 10. nominative_case_required_for_names ───────────────────────────────────

export function validateDivorceNominativeCase(
  field: ExtractedField,
  key: string,
): DivorceCertValidationResult {
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

// ── 11. civil_registry_glossary_required ─────────────────────────────────────

export function validateDivorceCivilRegistryGlossary(
  field: ExtractedField | undefined,
): DivorceCertValidationResult {
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
      warning: `Issuing authority '${field.raw_value}' contains both ЗАГС and ДРАЦС — historical/modern conflict.`,
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

// ── 12. source_evidence_required ─────────────────────────────────────────────

export function validateDivorceSourceEvidence(
  field: ExtractedField,
): DivorceCertValidationResult {
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

// ── 13. bilingual_layer_protection ───────────────────────────────────────────

export function validateDivorceBilingualLayer(
  field: ExtractedField,
  usedRussianFallback: boolean,
): DivorceCertValidationResult {
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

// ── 14. forbidden_divorce_mislabels ──────────────────────────────────────────

export interface DivorceMislabelCheckResult {
  violations: string[]
  passed: boolean
}

export function validateForbiddenDivorceMislabels(
  fields: ExtractedField[],
  renderLabels: Record<string, string>,
): DivorceMislabelCheckResult {
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

  // basis_of_divorce must not be labeled as "Court Decision" unless explicitly court-based
  const basisField = fields.find(f => f.field === 'basis_of_divorce')
  if (basisField) {
    const label = renderLabels[basisField.field] ?? ''
    if (label.toLowerCase() === 'court decision') {
      violations.push(`basis_of_divorce is labeled as "Court Decision". Use "Basis of Divorce" unless value explicitly confirms court.`)
    }
  }

  return { violations, passed: violations.length === 0 }
}

// ── Date normalization helper ─────────────────────────────────────────────────

export function normalizeDivorceCertDate(raw: string): {
  normalized: string | null
  review_required: boolean
  reason?: string
} {
  const trimmed = raw.trim()

  const ukResult = normalizeDateUkrainian(trimmed, ALL_MONTHS)
  if (ukResult) {
    const RUSSIAN_MONTH_NAMES = [
      'января', 'февраля', 'марта', 'апреля', 'мая', 'июня',
      'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря',
    ]
    const usedRussian = RUSSIAN_MONTH_NAMES.some(m => trimmed.toLowerCase().includes(m))

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

  if (/[а-яА-ЯіІїЇєЄёЁ]/.test(trimmed) && !/\d{4}/.test(trimmed)) {
    return { normalized: null, review_required: true, reason: 'partial_date_unreadable' }
  }

  return { normalized: null, review_required: true, reason: 'date_format_unrecognized' }
}
