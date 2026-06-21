/**
 * i765DocumentBoundary — the TPS document/application BOUNDARY for I-765.
 *
 * GAP-3: the shared canonical I-765 mapper (buildI765DocumentOps) is pure
 * (canonical key → PrefillOp, no normalization). The ONE place country
 * normalization is still legitimately applied for the legacy TPSAnswers shape is
 * HERE, at the boundary — NOT inside the field map. This converts the
 * document-derived TPSAnswers facts into a minimal CanonicalDocumentResult whose
 * RELEASED values are exactly what the shared mapper should transcribe.
 *
 * This boundary does the ONLY value transform left (normalizeCountryOfBirth:
 * oblast/city → country), because legacy TPSAnswers carries a raw oblast string,
 * not an arbitrated canonical country. Once TPS feeds a real CanonicalDocumentResult
 * (arbitration output) this boundary collapses to a pass-through. Everything else
 * is a verbatim copy of the document fact under its canonical key.
 *
 * It does NOT touch user-declared / product-config fields (application type,
 * category, address, race, english, contact, Line 29) — those stay in the field
 * map at the application layer.
 */
import type { TPSAnswers } from '../answers'
import { normalizeCountryOfBirth } from '../answers'
import type { CanonicalDocumentResult, CanonicalField } from '@/lib/canonical/types'

function docField(key: string, value: string | null | undefined): CanonicalField | null {
  if (value == null || value === '') return null
  return {
    key,
    rawValue: value,
    normalizedValue: value,
    // finalValue undefined ⇒ accessor releases normalizedValue (legacy path, C3 off here).
    criticality: 'medium',
    confidence: { ocr: null, field_match: null, normalization: null, source_match: null, final: 1 },
    source: 'document_ocr',
    reviewRequired: false,
    reviewReasons: [],
    evidence: [],
  }
}

/**
 * Build the minimal CanonicalDocumentResult of DOCUMENT-DERIVED facts the shared
 * I-765 mapper consumes. country_of_birth is normalized HERE (the boundary), not
 * in the mapper.
 */
export function tpsDocumentFactsToCanonical(a: TPSAnswers): CanonicalDocumentResult {
  const pairs: Array<[string, string | null | undefined]> = [
    ['family_name', a.family_name],
    ['given_name', a.given_name],
    ['middle_name', a.middle_name ?? ''],
    ['date_of_birth', a.dob],
    ['sex', a.sex ?? ''],
    // BOUNDARY normalization (oblast/city → country) — the one remaining transform.
    ['country_of_birth', normalizeCountryOfBirth(a.country_of_birth, a.country_of_nationality)],
    ['city_of_birth', a.city_of_birth ?? ''],
    ['province_of_birth', a.province_of_birth ?? ''],
    ['a_number', a.a_number ?? ''],
    ['passport_number', a.passport_number],
    ['passport_country_of_issuance', a.passport_country_of_issuance],
    ['passport_expiration_date', a.passport_expiration_date],
    ['i94_admission_number', a.i94_admission_number ?? ''],
    ['i94_date_of_entry', a.last_entry_date],
    ['status_at_last_entry', a.status_at_last_entry ?? ''],
    ['current_immigration_status', a.current_immigration_status ?? ''],
    ['place_of_last_entry', a.place_of_last_entry ?? ''],
  ]
  const fields = pairs
    .map(([k, v]) => docField(k, v))
    .filter((f): f is CanonicalField => f !== null)

  return {
    documentSessionId: 'tps-i765-boundary',
    product: 'tps',
    docType: 'tps_combined',
    fields,
    hashes: { uploadHash: null, normalizedImageHash: null, canonicalResultHash: null },
    createdAt: new Date().toISOString(),
    requiresReview: false,
  }
}
