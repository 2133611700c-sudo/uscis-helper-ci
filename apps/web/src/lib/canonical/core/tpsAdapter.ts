/**
 * canonical/core/tpsAdapter.ts — B1 bridge: CanonicalDocumentResult → TPS types.
 *
 * Converts Core arbitration output into TpsModuleResult so the existing TPS
 * pipeline (contract firewall, postExtractNormalize, Brain fallback, audit) can
 * consume it unchanged. This is the thin product adapter for TPS/Re-Parole.
 *
 * Used behind ONE_CORE_TPS_ENABLED=1 flag only. Never affects old path.
 * See docs/architecture/ONE_BRAIN_DECISION.md for the architecture contract.
 */
import type { CanonicalField } from '../types'
import type { TpsExtractedField, TpsModuleResult } from '@/lib/tps/types'

/**
 * Map TPS wizard docHint → docintel document type ID.
 * Returns null for US-form slots that docintel doesn't cover (i94, ead, dl, i797).
 */
export function mapTpsHintToDocintelId(hint: string): string | null {
  const map: Record<string, string> = {
    passport: 'ua_international_passport',
    booklet:  'ua_internal_passport_booklet',
  }
  return map[hint] ?? null
}

/** Convert one CanonicalField to a TpsExtractedField. */
export function canonicalFieldToTpsField(
  f: CanonicalField,
  documentId: string,
): TpsExtractedField {
  const lang = (() => {
    // Fields that carry Cyrillic Ua values as rawValue
    if (['family_name_cyrillic','given_name_cyrillic','patronymic_cyrillic',
         'place_of_birth_raw'].includes(f.key)) return 'cyrillic' as const
    // Fields that always come from the MRZ (all-Latin)
    if (f.source === 'mrz') return 'mrz' as const
    // Dates and numbers are numeric/mixed
    if (['date_of_birth','dob','date_of_expiry','passport_number','sex'].includes(f.key)) return 'mixed' as const
    return 'latin' as const
  })()

  return {
    field:              f.key,
    raw_value:          f.rawValue ?? '',
    // Phase 3 (ADR-017 C3 contract): use finalValue when C3 has run.
    // finalValue=string → C3 accepted. finalValue=null → C3 rejected (block).
    // finalValue=undefined → C3 not run (flag OFF); fall back to normalizedValue for backward compat.
    normalized_value:   f.finalValue !== undefined ? f.finalValue : (f.normalizedValue ?? f.rawValue ?? null),
    extraction_source:  'canonical_core',
    source_document_id: documentId,
    source_zone:        f.source,
    bbox:               null,
    language_layer:     lang,
    confidence:         f.confidence.final ?? null,
    review_required:    f.reviewRequired,
    ocr_word_ids:       [],
    passes:             [],
    failures:           [],
    user_corrected:     false,
  }
}

/** Convert Core fields to a TpsModuleResult that feeds the existing TPS pipeline. */
export function canonicalToTpsModuleResult(
  fields: CanonicalField[],
  docTypeHint: string,
  documentId: string,
): TpsModuleResult {
  const tpsFields = fields.map((f) => canonicalFieldToTpsField(f, documentId))
  const anyReview = fields.some((f) => f.reviewRequired)
  return {
    module: 'unknown' as import('@/lib/tps/types').TpsDocType, // refined by contract firewall downstream
    matched: tpsFields.length > 0,
    match_reason: tpsFields.length > 0 ? 'core_visual_read' : 'core_no_fields',
    fields: tpsFields,
    warnings: anyReview ? ['canonical_core: some fields require review'] : [],
    manual_review_required: anyReview,
    manual_review_reasons: anyReview ? ['core_review_required'] : [],
  }
}
