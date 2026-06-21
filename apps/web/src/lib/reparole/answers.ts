/**
 * ReParoleAnswers — Re-Parole U4U packet input contract.
 *
 * Mirrors TPSAnswers in spirit (single flat record consumed by the field
 * map + packet builder) but uses the I-131 form's terminology and
 * Re-Parole specific fields.
 *
 * USCIS I-131 Form Instructions (Edition 01/20/25):
 *   - Re-parole applicants mark Part 1 Item 1.e on PAPER
 *     OR Box 10.C on my.uscis.gov ONLINE
 *   - Top of paper form: handwrite "Ukraine RE-PAROLE"
 *
 * Field naming convention:
 *   - All identity fields use the same names as the TPS contract where
 *     they overlap (family_name, given_name, dob, etc.). This means the
 *     OCR pipeline (passport, passportBooklet, i94, ead modules) can
 *     feed BOTH services with identical TpsExtractedField rows.
 *   - Re-Parole specific fields are namespaced (a_number, uscis_online_
 *     account_number, etc.).
 */

export interface ReParoleAnswers {
  // ── Part 2 Item 1: current legal name ───────────────────────────────────
  family_name: string
  given_name: string
  middle_name?: string

  // ── Part 2 Item 3: mailing address ──────────────────────────────────────
  mailing_in_care_of?: string
  mailing_street: string
  mailing_apt_ste_flr?: string
  mailing_city: string
  mailing_state: string         // US 2-letter
  mailing_zip: string

  // ── Part 2 Item 4: physical address (if different from mailing) ─────────
  /** True when mailing == physical; line 4 is then left blank. */
  physical_same_as_mailing?: boolean
  physical_street?: string
  physical_apt_ste_flr?: string
  physical_city?: string
  physical_state?: string
  physical_zip?: string

  // ── Part 2 Item 5: USCIS A-Number ───────────────────────────────────────
  /** A-Number from previous USCIS interactions (parole grant, EAD, etc.). */
  a_number?: string

  // ── Part 2 Item 6/7/8/9: demographics ───────────────────────────────────
  country_of_birth: string
  country_of_nationality: string    // == country_of_citizenship on I-131
  sex: 'M' | 'F' | ''
  dob: string                       // YYYY-MM-DD, written as MM/DD/YYYY on form

  // ── Part 2 Item 10/11: optional ─────────────────────────────────────────
  ssn?: string
  uscis_online_account_number?: string

  // ── Part 2 Item 12/13: arrival information ──────────────────────────────
  class_of_admission?: string       // typically 'UH' for U4U entrants
  i94_admission_number?: string     // 11 digits

  // ── Part 10: applicant statement / contact ──────────────────────────────
  daytime_phone: string
  mobile_phone?: string
  email: string

  // ── Application type marker (Re-Parole specific) ────────────────────────
  /** Filing method drives Part 1 checkbox + filing instructions. */
  filing_method: 'mail' | 'online' | 'unsure'

  // ── Canonical continuity linkage ─────────────────────────────────────────
  /**
   * UUID of the canonical_documents row created during OCR extract.
   * Passed through the wizard → generate-packet so the packet route can load
   * the persisted canonical result instead of reconstructing from DTO.
   * Optional: absent when CANONICAL_CONTINUITY_MODE=off or persist failed in shadow mode.
   */
  canonical_document_id?: string
}

/**
 * Returns true if the answers are minimally complete for I-131 paper
 * filing. Re-Parole has fewer required fields than TPS because much of
 * the form is the user's prior USCIS history (A-Number, USCIS account)
 * which is optional for first-time Re-Parole.
 */
export function isMinimallyComplete(a: ReParoleAnswers): { ok: boolean; missing: string[] } {
  const missing: string[] = []
  const need: Array<keyof ReParoleAnswers> = [
    'family_name', 'given_name', 'dob', 'sex',
    'country_of_birth', 'country_of_nationality',
    'mailing_street', 'mailing_city', 'mailing_state', 'mailing_zip',
    'daytime_phone', 'email',
  ]
  for (const k of need) {
    const v = a[k]
    if (v === undefined || v === null || String(v).trim() === '') missing.push(String(k))
  }
  return { ok: missing.length === 0, missing }
}

/** Format YYYY-MM-DD → MM/DD/YYYY for USCIS forms. */
export function toUscisDate(iso: string | undefined): string {
  if (!iso) return ''
  const m = iso.match(/^(\d{4})-(\d{2})-(\d{2})$/)
  if (!m) return iso
  return `${m[2]}/${m[3]}/${m[1]}`
}
