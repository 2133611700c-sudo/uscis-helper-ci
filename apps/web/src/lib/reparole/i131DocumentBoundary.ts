/**
 * i131DocumentBoundary — the Re-Parole document/application BOUNDARY for I-131.
 *
 * Phase 1 canonical single-currency: converts document-derived ReParoleAnswers
 * facts into a minimal CanonicalDocumentResult that the shared i131DocumentMapper
 * (buildI131DocumentOps) consumes. Follows the exact pattern of i765DocumentBoundary
 * and i821DocumentBoundary.
 *
 * Boundary responsibilities:
 *   - Verbatim copy of document-derived fields under canonical keys.
 *   - No value normalizations (country_of_birth on I-131 comes from USCIS EAD/I-94
 *     which already carries the English country name — no oblast-to-country transform
 *     needed, unlike the Ukrainian passport path in TPS).
 *
 * Once Re-Parole feeds a real CanonicalDocumentResult from arbitration output, this
 * boundary collapses to a pass-through.
 */
import type { ReParoleAnswers } from './answers'
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
 * Build the minimal CanonicalDocumentResult of DOCUMENT-DERIVED facts that
 * buildI131DocumentOps consumes.
 */
export function i131DocumentFactsToCanonical(a: ReParoleAnswers): CanonicalDocumentResult {
  const pairs: Array<[string, string | null | undefined]> = [
    ['family_name',          a.family_name],
    ['given_name',           a.given_name],
    ['middle_name',          a.middle_name ?? ''],
    ['a_number',             a.a_number ?? ''],
    ['country_of_birth',     a.country_of_birth],
    ['country_of_nationality', a.country_of_nationality],
    ['sex',                  a.sex ?? ''],
    ['date_of_birth',        a.dob],
    ['i94_class_of_admission', a.class_of_admission ?? ''],
    ['i94_admission_number', a.i94_admission_number ?? ''],
  ]

  const fields = pairs
    .map(([k, v]) => docField(k, v))
    .filter((f): f is CanonicalField => f !== null)

  return {
    documentSessionId: 'reparole-i131-boundary',
    product: 'reparole',
    docType: 'reparole_combined',
    fields,
    hashes: { uploadHash: null, normalizedImageHash: null, canonicalResultHash: null },
    createdAt: new Date().toISOString(),
    requiresReview: false,
  }
}
