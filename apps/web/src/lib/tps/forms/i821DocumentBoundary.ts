/**
 * i821DocumentBoundary — the TPS document/application BOUNDARY for I-821.
 *
 * Phase 1 canonical single-currency: converts document-derived TPSAnswers facts
 * into a minimal CanonicalDocumentResult that the shared i821DocumentMapper
 * (buildI821DocumentOps) consumes. Follows the exact pattern of i765DocumentBoundary.
 *
 * Boundary responsibilities:
 *   - normalizeCountryOfBirth: oblast/city "place of birth" → ISO country name.
 *     Applied HERE, not inside the field map (the mapper is pure; it never normalizes).
 *   - port_of_entry split: place_of_last_entry "Los Angeles, CA" → separate
 *     port_of_entry_city / port_of_entry_state canonical keys that the mapper reads.
 *     TPSAnswers.port_of_entry_city / port_of_entry_state override the split when present.
 *
 * Once TPS feeds a real CanonicalDocumentResult from arbitration output, this
 * boundary collapses to a pass-through. Everything else is a verbatim copy of
 * the document fact under its canonical key.
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
 * Build the minimal CanonicalDocumentResult of DOCUMENT-DERIVED facts that
 * buildI821DocumentOps consumes.
 *
 * country_of_birth is boundary-normalized (oblast/city → country).
 * port_of_entry_city / port_of_entry_state are pre-split from place_of_last_entry
 * (or from explicit port_of_entry_* fields on TPSAnswers if provided).
 */
export function i821DocumentFactsToCanonical(a: TPSAnswers): CanonicalDocumentResult {
  // Port-of-entry split (Item 20): prefer explicit fields, fall back to comma-split.
  const rawPoe = a.place_of_last_entry ?? ''
  const poeCity  = a.port_of_entry_city  ?? rawPoe.split(',')[0]?.trim() ?? ''
  const poeState = a.port_of_entry_state ?? rawPoe.split(',')[1]?.trim() ?? ''

  const pairs: Array<[string, string | null | undefined]> = [
    ['family_name',              a.family_name],
    ['given_name',               a.given_name],
    ['middle_name',              a.middle_name ?? ''],
    ['date_of_birth',            a.dob],
    ['sex',                      a.sex ?? ''],
    // BOUNDARY normalization (oblast/city → country) — the one remaining transform.
    ['country_of_birth',         normalizeCountryOfBirth(a.country_of_birth, a.country_of_nationality)],
    ['city_of_birth',            a.city_of_birth ?? ''],
    ['a_number',                 a.a_number ?? ''],
    ['passport_number',          a.passport_number],
    ['passport_country_of_issuance', a.passport_country_of_issuance],
    ['passport_expiration_date', a.passport_expiration_date],
    ['i94_admission_number',     a.i94_admission_number ?? ''],
    ['i94_date_of_entry',        a.last_entry_date],
    ['status_at_last_entry',     a.status_at_last_entry ?? ''],
    // Pre-split for Item 20 (port of entry)
    ['port_of_entry_city',       poeCity],
    ['port_of_entry_state',      poeState],
  ]

  const fields = pairs
    .map(([k, v]) => docField(k, v))
    .filter((f): f is CanonicalField => f !== null)

  return {
    documentSessionId: 'tps-i821-boundary',
    product: 'tps',
    docType: 'tps_combined',
    fields,
    hashes: { uploadHash: null, normalizedImageHash: null, canonicalResultHash: null },
    createdAt: new Date().toISOString(),
    requiresReview: false,
  }
}
