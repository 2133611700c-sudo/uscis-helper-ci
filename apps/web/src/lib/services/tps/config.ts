/**
 * TPS Ukraine service config — single source of truth.
 *
 * Until today, the same constants lived in four places:
 *   - PacketCompletenessChecker.tsx     (UI list of forms + critical fields)
 *   - packetBuilder.ts                  (forms generated, editions)
 *   - /api/tps/health/route.ts          (probe response)
 *   - lib/tps/answers.ts                (isMinimallyComplete critical fields)
 *
 * Drift between them was a real risk. This file consolidates the contract
 * so any downstream component imports from one place. The vitest 'forms
 * manifest edition drift guard' continues to enforce that forms_manifest.json
 * agrees with these editions, so we get TWO independent checks.
 *
 * Why not a refactor of the Service Engine right now: that's Phase G.
 * This file is a CHEAP foundation step — just consolidates constants
 * without changing any code paths. Re-Parole gets its own
 * lib/services/re-parole/config.ts when its OCR wizard ships (RP.5).
 */

export const TPS_SERVICE_SLUG = 'tps-ukraine'

/** USCIS forms produced by the TPS packet builder. */
export const TPS_FORMS = {
  i821: {
    name: 'I-821',
    title: 'Application for Temporary Protected Status',
    edition: '01/20/25',
    pages: 13,
    filled: true, // we generate a filled PDF
    always_included: true, // I-821 is always in the ZIP
    signature_location: 'Part 8 on page 10',
    pdf_filename: 'i-821.pdf', // matches PINNED_HASHES key in formIntegrity.ts
  },
  i765: {
    name: 'I-765',
    title: 'Application for Employment Authorization',
    edition: '08/21/25',
    pages: 7,
    filled: true,
    always_included: false, // only when wants_ead=true
    signature_location: 'Part 3 on page 4',
    pdf_filename: 'i-765.pdf',
  },
  i912: {
    name: 'I-912',
    title: 'Request for Fee Waiver',
    edition: '07/22/25',
    pages: 8,
    // We do NOT generate a filled I-912 PDF today — landing copy must
    // reflect this honestly (closed in OC-1 fix). When this flips to
    // true, the packetBuilder + Checker + landing all update at once.
    filled: false,
    always_included: false,
    signature_location: 'Part 6 on page 6',
    pdf_filename: 'i-912.pdf',
  },
} as const

/** Critical fields that MUST be filled before Generate is allowed.
 *  MUST match isMinimallyComplete() in lib/tps/answers.ts.
 *  PacketCompletenessChecker imports this list to display the missing
 *  count to the user. */
export const TPS_CRITICAL_FIELDS = [
  'family_name',
  'given_name',
  'dob',
  'sex',
  'country_of_birth',
  'passport_number',
  'passport_country_of_issuance',
  'passport_expiration_date',
  'us_address_street',
  'us_address_city',
  'us_address_state',
  'us_address_zip',
  'last_entry_date',
  'marital_status',
  'daytime_phone',
  'email',
] as const

/** Non-critical fields — packet generates without them, but the Checker
 *  surfaces an amber warning so the user knows what they skipped. */
export const TPS_NONCRITICAL_FIELDS = [
  'middle_name',
  'a_number',
  'i94_admission_number',
  'uscis_online_account',
  'status_at_last_entry',
] as const

/** Documents accepted by the OCR pipeline for TPS. */
export const TPS_ACCEPTED_DOCUMENTS = [
  'international_passport',
  'ukrainian_internal_passport',
  'i94',
  'ead',
  'uscis_notice',
] as const

/** Snapshot date for the official-source manifests we are pinned to.
 *  Surfaced in /api/tps/health and inside the generated README so an
 *  external monitor can detect when refresh is overdue. */
export const TPS_SOURCES_SNAPSHOT_DATE = '2026-05-10'

/** Public health-probe shape — kept in this module so /api/tps/health
 *  can import the same constants the Checker uses. */
export interface TpsServiceHealthSnapshot {
  service: typeof TPS_SERVICE_SLUG
  forms: {
    i821: { edition: string; pages: number; filled: boolean }
    i765: { edition: string; pages: number; filled: boolean }
    i131: { edition: string; pages: number; filled: boolean }
    i912: { edition: string; pages: number; filled: boolean }
  }
  snapshot_date: string
}
