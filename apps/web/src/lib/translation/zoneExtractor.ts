/**
 * Zone Extractor — v5 §9.
 *
 * Maps OCR words/lines (with bounding boxes) into LOGICAL ZONES (e.g.
 * `personal_data`, `issuance_block`, `civil_act_block`, `act_record_block`,
 * `validity_block`) BEFORE field extraction. This is what lets the field
 * extractor say "look for date_of_birth in personal_data, NOT in
 * issuance_block".
 *
 * The current production OCR path (Google Vision + DeepSeek Text mapper)
 * tags a `source_zone` directly via the extraction prompt. This module
 * exposes a deterministic helper for cases where we need to:
 *   - validate a DeepSeek-emitted source_zone against the per-module
 *     allowed zones
 *   - cluster a free-form OCR result into zones for tests/fixtures
 *   - serve as the canonical truth source for `source_zone` strings used
 *     across the codebase
 *
 * No magic. No LLM. Just deterministic rules + per-module zone tables.
 */

import type { DocumentType } from './types'

/** Canonical zone catalogue used across modules. Adding a zone here is
 *  intentional — it must be referenced by at least one module's
 *  expectedLabels or per-field allowed_zones. */
export const CANONICAL_ZONES = [
  'personal_data',
  'issuance_block',
  'validity_block',
  'photo_block',
  'demographic_block',
  'birth_block',
  'dob_line',
  'civil_act_block',
  'act_record_block',
  'registration_block',
  'main_block',
  'signature_block',
  'footer_block',
  'header_block',
  'mrz_block',
  'expiry_block',
  'issue_block',
  'child_block',
  'parent_block',
  'spouse_1_block',
  'spouse_2_block',
  'court_decision_block',
  'court_block',
  'administrative_block',
] as const

export type CanonicalZone = (typeof CANONICAL_ZONES)[number]

/** Per-document allowed zones (subset of CANONICAL_ZONES). */
const DOCUMENT_ZONE_TABLE: Record<string, ReadonlyArray<CanonicalZone>> = {
  ua_internal_passport_booklet: [
    'personal_data', 'issuance_block', 'validity_block', 'photo_block',
    'demographic_block', 'birth_block', 'dob_line', 'signature_block',
    'header_block', 'footer_block', 'administrative_block',
  ],
  ua_birth_certificate: [
    'header_block', 'main_block', 'civil_act_block', 'act_record_block',
    'registration_block', 'child_block', 'parent_block', 'footer_block',
  ],
  ua_marriage_certificate: [
    'header_block', 'main_block', 'civil_act_block', 'act_record_block',
    'registration_block', 'spouse_1_block', 'spouse_2_block', 'footer_block',
  ],
  ua_divorce_certificate: [
    'header_block', 'main_block', 'civil_act_block', 'act_record_block',
    'court_decision_block', 'court_block', 'spouse_1_block', 'spouse_2_block',
    'registration_block', 'footer_block',
  ],
  ua_international_passport: [
    'personal_data', 'mrz_block', 'photo_block', 'issue_block',
    'expiry_block', 'header_block', 'footer_block',
  ],
  ua_id_card: [
    'personal_data', 'mrz_block', 'photo_block', 'issue_block',
    'expiry_block', 'header_block', 'footer_block',
  ],
}

export interface ZoneValidationResult {
  ok: boolean
  zone: string
  documentType: string
  allowedForDocument: ReadonlyArray<CanonicalZone>
  reason?: 'not_canonical' | 'not_allowed_for_document'
}

/**
 * Validate that a `source_zone` string emitted by the field extractor is
 * (a) in the canonical zone catalogue, and
 * (b) permitted for the active document type.
 */
export function validateSourceZone(
  zone: string,
  documentType: DocumentType | string,
): ZoneValidationResult {
  const docKey = String(documentType)
  const allowed = DOCUMENT_ZONE_TABLE[docKey] ?? []

  // Match canonically by lowercased substring — DeepSeek occasionally
  // emits suffixes like "personal_data.line_3" which should still resolve.
  const z = zone.toLowerCase()
  const canonicalMatch = (CANONICAL_ZONES as ReadonlyArray<string>).find(c => z.includes(c))
  if (!canonicalMatch) {
    return {
      ok: false,
      zone,
      documentType: docKey,
      allowedForDocument: allowed,
      reason: 'not_canonical',
    }
  }

  if (allowed.length === 0) {
    // Document type not in the table — treat as ok (manual review path).
    return {
      ok: true,
      zone,
      documentType: docKey,
      allowedForDocument: allowed,
    }
  }

  const allowedHit = allowed.includes(canonicalMatch as CanonicalZone)
  return {
    ok: allowedHit,
    zone,
    documentType: docKey,
    allowedForDocument: allowed,
    reason: allowedHit ? undefined : 'not_allowed_for_document',
  }
}

/** Return the canonical zone list for a given document type. */
export function getZonesForDocument(
  documentType: DocumentType | string,
): ReadonlyArray<CanonicalZone> {
  return DOCUMENT_ZONE_TABLE[String(documentType)] ?? []
}
