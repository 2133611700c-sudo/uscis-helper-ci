/**
 * Bridge: Vision Extraction → @messenginfo/knowledge → TPSAnswers
 * 
 * This module takes raw OCR output from vision-extraction-prompt
 * and normalizes it into TPSAnswers-compatible fields using the
 * canonical knowledge package (dictionary + transliteration + normalization).
 *
 * WHY THIS EXISTS:
 * - International passport: MRZ parser handles it (modules/passport.ts)
 * - Internal passport: HANDWRITTEN Cyrillic, no MRZ → needs vision AI
 *   extraction + normalization (patronymic, birth place, issuing authority)
 * - Drivers license: has Latin names (controlling spelling source)
 *
 * This bridge fills the gap between raw vision output and form-ready data.
 */

import {
  transliterateKMU55, convertDateToUSCIS,
  normalizeName, normalizeDate, normalizeSex,
  normalizeAuthority, normalizePlace, validateOutput,
  type NormalizedField, type NormalizationContext, type ControllingSpelling,
} from '@uscis-helper/knowledge'

import type { TPSAnswers } from '../answers'

// ── TYPES ────────────────────────────────────────────────────

/** Raw field from vision-extraction-prompt JSON output */
interface VisionRawField {
  field: string
  source_label_raw: string
  source_zone: string
  bbox: [number, number, number, number]
  raw_value: string
  language_layer: 'uk' | 'ru' | 'mixed' | 'unknown'
  confidence: number
  review_required: boolean
  quality_issue: string | null
}

/** Result of normalizing vision output for one document */
export interface DocumentNormalizationResult {
  document_type: string
  fields: NormalizedField[]
  tps_answers_patch: Partial<TPSAnswers>
  review_flags: Array<{ field: string; reason: string }>
  controlling_spellings_found: ControllingSpelling[]
}

// ── FIELD MAPPING: vision field name → TPSAnswers key ────────

const FIELD_TO_TPS: Record<string, keyof TPSAnswers> = {
  'Surname': 'family_name',
  'Given Name': 'given_name',
  'Patronymic': 'middle_name', // Note: stored as middle_name in TPSAnswers but labeled Patronymic
  'Date of Birth': 'dob',
  'Sex': 'sex',
  'Place of Birth': 'city_of_birth',
  'Province of Birth': 'province_of_birth',
  'Passport Number': 'passport_number',
  'Date of Expiry': 'passport_expiration_date',
  'Country of Issuance': 'passport_country_of_issuance',
  'I-94 Number': 'i94_admission_number',
  'A-Number': 'a_number',
}

// ── CORE NORMALIZATION ───────────────────────────────────────

/**
 * Process a batch of vision-extracted fields from one document.
 * Returns normalized fields + a partial TPSAnswers patch ready to merge.
 */
export function normalizeVisionOutput(
  rawFields: VisionRawField[],
  documentType: string,
  existingControlling: ControllingSpelling[] = [],
): DocumentNormalizationResult {
  const isHistorical = documentType === 'ua_passport_booklet' // internal passport = historical doc
  const ctx: NormalizationContext = {
    mode: 'uscis_normalized',
    controlling_spellings: existingControlling,
    is_historical_document: isHistorical,
  }

  const normalizedFields: NormalizedField[] = []
  const patch: Partial<TPSAnswers> = {}
  const reviewFlags: Array<{ field: string; reason: string }> = []
  const controllingFound: ControllingSpelling[] = []

  for (const raw of rawFields) {
    // Skip low-confidence fields
    if (raw.confidence < 0.3) {
      reviewFlags.push({ field: raw.field, reason: `OCR confidence too low: ${raw.confidence}` })
      continue
    }

    let normalized: NormalizedField

    switch (raw.field) {
      case 'Surname':
      case 'Given Name':
      case 'Patronymic': {
        const fieldType = raw.field === 'Surname' ? 'surname'
          : raw.field === 'Given Name' ? 'given_name' : 'patronymic'
        normalized = normalizeName(raw.raw_value, fieldType, documentType, ctx)
        break
      }

      case 'Date of Birth':
      case 'Date of Issue':
      case 'Date of Expiry':
        normalized = normalizeDate(raw.raw_value, raw.field, documentType)
        break

      case 'Sex':
        normalized = normalizeSex(raw.raw_value, documentType)
        break

      case 'Issuing Authority':
        normalized = normalizeAuthority(raw.raw_value, documentType, ctx)
        break

      case 'Place of Birth':
      case 'Province of Birth':
        normalized = normalizePlace(raw.raw_value, raw.field, documentType, ctx)
        break

      default:
        // Passthrough with basic transliteration
        normalized = {
          field: raw.field,
          raw_value: raw.raw_value,
          normalized_value: transliterateKMU55(raw.raw_value),
          source_document: documentType,
          rule_applied: 'kmu55_passthrough',
          confidence: raw.confidence,
          review_required: raw.review_required,
        }
    }

    // Apply blocklist validation
    normalized = validateOutput(normalized)

    // Inherit OCR confidence if lower
    if (raw.confidence < normalized.confidence) {
      normalized.confidence = raw.confidence
    }
    if (raw.review_required && !normalized.review_required) {
      normalized.review_required = true
      normalized.review_reason = raw.quality_issue || 'OCR flagged for review'
    }

    normalizedFields.push(normalized)

    // Collect review flags
    if (normalized.review_required) {
      reviewFlags.push({
        field: normalized.field,
        reason: normalized.review_reason || 'review required',
      })
    }

    // Map to TPSAnswers patch
    const tpsKey = FIELD_TO_TPS[raw.field]
    if (tpsKey && !normalized.review_required) {
      // Date fields need ISO format for TPSAnswers (YYYY-MM-DD)
      if (['Date of Birth', 'Date of Expiry'].includes(raw.field)) {
        const uscisDate = normalized.normalized_value // MM/DD/YYYY
        const parts = uscisDate.match(/^(\d{2})\/(\d{2})\/(\d{4})$/)
        if (parts) {
          (patch as any)[tpsKey] = `${parts[3]}-${parts[1]}-${parts[2]}`
        }
      } else if (raw.field === 'Sex') {
        (patch as any)[tpsKey] = normalized.normalized_value === 'Male' ? 'M' : 'F'
      } else {
        (patch as any)[tpsKey] = normalized.normalized_value
      }
    }

    // If this doc has Latin names (drivers license), save as controlling
    if (documentType === 'ua_drivers_license' && 
        ['Surname', 'Given Name'].includes(raw.field) &&
        raw.language_layer !== 'uk' && raw.language_layer !== 'ru') {
      controllingFound.push({
        field: raw.field === 'Surname' ? 'surname' : 'given_name',
        latin_value: raw.raw_value,
        source: 'drivers_license',
      })
    }
  }

  return {
    document_type: documentType,
    fields: normalizedFields,
    tps_answers_patch: patch,
    review_flags: reviewFlags,
    controlling_spellings_found: controllingFound,
  }
}

/**
 * Merge multiple document results into a single TPSAnswers patch.
 * Priority: drivers_license (controlling) > passport_booklet > passport_id
 * For conflicts: FLAG_FOR_HUMAN_REVIEW
 */
export function mergeDocumentResults(
  results: DocumentNormalizationResult[],
): {
  merged_patch: Partial<TPSAnswers>
  all_review_flags: Array<{ field: string; reason: string }>
  controlling_spellings: ControllingSpelling[]
} {
  const merged: Partial<TPSAnswers> = {}
  const allFlags: Array<{ field: string; reason: string }> = []
  const allControlling: ControllingSpelling[] = []

  // Priority order: drivers license first (controlling), then others
  const priority = ['ua_drivers_license', 'ua_passport_booklet', 'ua_passport_id_card']
  const sorted = [...results].sort((a, b) => {
    const ai = priority.indexOf(a.document_type)
    const bi = priority.indexOf(b.document_type)
    return (ai === -1 ? 99 : ai) - (bi === -1 ? 99 : bi)
  })

  for (const result of sorted) {
    allControlling.push(...result.controlling_spellings_found)
    allFlags.push(...result.review_flags)

    for (const [key, value] of Object.entries(result.tps_answers_patch)) {
      if (value === undefined || value === '') continue
      const existing = (merged as any)[key]
      if (existing && existing !== value) {
        allFlags.push({
          field: key,
          reason: `Conflict: "${existing}" (earlier doc) vs "${value}" (${result.document_type}). Human must decide.`,
        })
      } else {
        (merged as any)[key] = value
      }
    }
  }

  return { merged_patch: merged, all_review_flags: allFlags, controlling_spellings: allControlling }
}
