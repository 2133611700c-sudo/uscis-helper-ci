/**
 * TPSAnswers — wizard-internal contract for TPS Ukraine packet construction.
 *
 * Locked structure: this is what we collect from the user (whether typed or
 * OCR'd from documents), and what gets written into I-821 + I-765 PDFs by
 * the prefiller engine. Per the source layer audit (2026-05-10), all 4
 * fillable USCIS PDFs are Hybrid XFA + AcroForm — the prefiller strips XFA
 * after fill so Adobe falls back to AcroForm rendering.
 *
 * NOT in scope today: OCR (user types fields), I-912 prefill (optional path),
 * I-601, online filing through my.uscis.gov.
 */

import { requiredRules } from './readinessPolicy'

export type FilingPath = 'initial' | 're_registration'

/**
 * I-765 Eligibility Category. For TPS this is exactly (a)(12) or (c)(19).
 *   - 'c19' → first-time TPS applicant filing concurrently with I-821 initial
 *              (pending TPS — 8 CFR 274a.12(c)(19))
 *   - 'a12' → already-granted TPS re-registering
 *              (approved TPS — 8 CFR 274a.12(a)(12))
 */
export type EadCategory = 'a12' | 'c19' | null

export type Sex = 'M' | 'F'

export interface TPSAnswers {
  // ── Identity (Part 2 of I-821, Part 2 of I-765) ────────────────────────────
  family_name: string
  given_name: string
  middle_name?: string
  other_names?: Array<{ family: string; given: string; middle?: string }>

  dob: string                  // YYYY-MM-DD (HTML date input format)
  sex: Sex
  country_of_birth: string
  country_of_nationality: string   // 'Ukraine'

  a_number?: string                // 9-digit, no 'A' prefix
  uscis_online_account?: string    // 12 digits
  ssn?: string                     // 9 digits, no dashes

  // ── Civil status ───────────────────────────────────────────────────────────
  city_of_birth?: string           // I-821 Part2 Item 13, I-765 Line 18a
  province_of_birth?: string       // I-765 Line 18b (oblast/province)
  english_proficiency?: boolean    // I-765 Part3 Item 1.a (Yes=can read English)
  place_of_last_entry?: string     // I-765 Line 22 (e.g. "Los Angeles, CA")
  /** Marital status for I-821 Part 2 Item 17. Maps to checkboxes [0]-[6].
   *  'legally_separated' → checkbox [4], 'annulled' → [5], 'other' → [6]. */
  marital_status?: 'single' | 'married' | 'divorced' | 'widowed' | 'legally_separated' | 'annulled' | 'other'

  // ── Travel document ─────────────────────────────────────────────────────────
  passport_number: string
  passport_country_of_issuance: string
  passport_expiration_date: string  // YYYY-MM-DD

  // ── US physical address (I-821 Pt2 Item 4, I-765 Pt2 Item 5) ──────────────
  us_address_in_care_of?: string
  us_address_street: string
  us_address_unit_type?: 'apt' | 'ste' | 'flr'
  us_address_unit_number?: string
  us_address_city: string
  us_address_state: string          // 2-letter, e.g. 'CA'
  us_address_zip: string

  mailing_same_as_physical: boolean
  mailing_in_care_of?: string
  mailing_street?: string
  mailing_unit_type?: 'apt' | 'ste' | 'flr'
  mailing_unit_number?: string
  mailing_city?: string
  mailing_state?: string
  mailing_zip?: string

  // ── Entry information ──────────────────────────────────────────────────────
  last_entry_date: string           // YYYY-MM-DD
  i94_admission_number?: string     // 11 digits
  status_at_last_entry?: string     // e.g. 'Parole', 'B-2'
  current_immigration_status?: string

  // ── Filing path & EAD bundle ───────────────────────────────────────────────
  filing_path: FilingPath
  wants_ead: boolean
  ead_category: EadCategory         // 'c19' for initial (pending), 'a12' for re-registration (approved)

  // ── Fee bundle ─────────────────────────────────────────────────────────────
  /** True if the user is requesting a fee waiver (Form I-912). Drives README
   *  fee guidance + (future) I-912 packet inclusion. */
  wants_fee_waiver?: boolean

  // ── Contact ────────────────────────────────────────────────────────────────
  daytime_phone: string
  email: string

  // ── I-821 Part 3 — Biographic information ─────────────────────────────────
  /** Hispanic or Latino ethnicity. Drives Part3_Item1_Ethnicity checkboxes.
   *  [0]=Yes Hispanic/Latino, [1]=No */
  ethnicity?: 'hispanic' | 'not_hispanic'
  /** Race checkboxes: Part3_Item2_Race{W/A/B/I/H}. One or more may be true. */
  race_white?: boolean
  race_asian?: boolean
  race_black?: boolean
  race_american_indian?: boolean
  race_pacific_islander?: boolean
  /** Eye color. Part3_Item5_Eyecolor[0-8].
   *  Indices: 0=Black 1=Blue 2=Brown 3=Gray 4=Green 5=Hazel 6=Maroon 7=Pink 8=Unknown */
  eye_color?: 'black' | 'blue' | 'brown' | 'gray' | 'green' | 'hazel' | 'maroon' | 'pink' | 'unknown'
  /** Hair color. Part3_Item6_Haircolor[0-8].
   *  Indices: 0=Bald 1=Black 2=Blonde 3=Brown 4=Gray 5=Red 6=Sandy 7=White 8=Unknown */
  hair_color?: 'bald' | 'black' | 'blonde' | 'brown' | 'gray' | 'red' | 'sandy' | 'white' | 'unknown'

  // ── I-821 Part 2 Items 15/16 — Other names used ────────────────────────────
  // Stored in other_names[] already; Items 15a-16d are the first two other-name
  // slots the PDF has AcroForm fields for. See i821FieldMap for mapping logic.

  // ── I-821 Part 2 Item 20/21 — Port of entry / authorized stay ─────────────
  port_of_entry_city?: string       // Part2_Item20_CityOrTown[0]
  port_of_entry_state?: string      // Part2_Item20_State[0] (2-letter)
  authorized_stay?: string          // Part2_Item21_AuthorizedPdofStay[0] e.g. 'D/S', '1 year'

  // ── I-765 Part 1 — Type of application ────────────────────────────────────
  /**
   * I-765 Part 1 application type checkbox.
   *   'initial'     → Part1_Checkbox[0] (initial permission to accept employment)
   *   'replacement' → Part1_Checkbox[1] (replace lost/stolen/damaged card)
   *   'renewal'     → Part1_Checkbox[2] (renewal of permission/card)
   * Defaults based on filing_path but user must confirm/override.
   */
  i765_application_type?: 'initial' | 'replacement' | 'renewal'

  // ── I-821 Part 7 — Additional information (yes/no questions) ──────────────
  /**
   * Part 7 yes/no items. Each key maps to one question on the form.
   * For a typical Ukrainian TPS applicant through U4U parole ALL should be
   * false (No). The UI shows every question so the user can correct any answer
   * before signing. Unchecked (undefined) items are treated as false for the
   * PDF but the PacketCompletenessChecker blocks generation until the user
   * has explicitly reviewed the Part 7 declaration.
   *
   * Naming: part7_{item}_{sub} where item = I-821 Part 7 item number and
   * sub = a/b/c if the item has sub-parts.
   *
   * Source: I-821 01/20/25 edition, Pages 7-9
   */
  // Criminal activity (Page 7)
  part7_4a?: boolean   // Committed any crime?
  part7_4b?: boolean   // Arrested/charged/detained?
  part7_4c?: boolean   // Convicted of any crime?
  // DUI (Page 7-8)
  part7_5a?: boolean   // Arrested/cited for DUI?
  part7_5b?: boolean   // Drove under influence without arrest?
  part7_5c?: boolean   // Convicted of DUI?
  // Persecution/genocide (Page 8)
  part7_7a?: boolean   // Ordered/incited/committed torture or genocide?
  part7_7b?: boolean   // Engaged in persecution?
  part7_7c?: boolean   // Member of military/paramilitary/police unit that committed abuses?
  // Domestic violence IMBRA (Page 8)
  part7_8?: boolean    // Convicted of domestic violence / stalking?
  // Immigration fraud (Page 8)
  part7_9a?: boolean   // Misrepresented facts to obtain immigration benefit?
  part7_9b?: boolean   // Falsely claimed US citizenship?
  part7_9c?: boolean   // Obtained/used false US passport?
  part7_9d?: boolean   // Submitted false documents to federal/state/local authority?
  part7_9e?: boolean   // Practiced unlawful polygamy?
  // Removal/exclusion (Page 8)
  part7_11a?: boolean  // Subject to removal/deportation/exclusion proceeding?
  part7_11b?: boolean  // Issued final order of removal/deportation/exclusion?
  part7_11c?: boolean  // Removed/deported/excluded?
  part7_11d?: boolean  // Unlawfully present after removal order?
  // Prior TPS history (Page 8)
  part7_12a?: boolean  // Previously applied for TPS?
  part7_12b?: boolean  // Previously granted TPS?
  part7_12c?: boolean  // Previous TPS terminated or withdrawn?
  part7_12d?: boolean  // Previous TPS application denied?
  // Benefit fraud (Page 8)
  part7_13a?: boolean  // Obtained public benefit by fraud?
  part7_13b?: boolean  // Made false representation to obtain federal benefit?
  part7_13c?: boolean  // Submitted false document to obtain public benefit?
  // Prior TPS filing (Page 9)
  part7_17?: boolean   // Filed I-821 before?
  // Immigration proceedings (Page 9)
  part7_18a?: boolean  // In immigration court proceedings?
  part7_18b?: boolean  // Immigration judge ordered removal?
  part7_18c?: boolean  // Appeal filed with BIA?
  /** Has the user reviewed and confirmed the Part 7 background declaration?
   *  REQUIRED before generation — PacketCompletenessChecker enforces this.
   *  Prevents silent-default risk: user must see and confirm every No answer. */
  part7_reviewed?: boolean

  // ── Risk flags (drive manual review routing) ───────────────────────────────
  has_criminal_concern: boolean
  has_prior_tps_denial: boolean
  left_us_without_advance_parole: boolean

  // ── Signature (set by wizard SignaturePad) ──────────────────────────────────
  _signature_mode?: 'screen' | 'paper' | 'online_myuscis'
  _signature_name?: string           // e.g. "JOHN DOE" for /s/ format
  _signature_date?: string           // MM/DD/YYYY
  _signature_image_base64?: string   // PNG from SignaturePad (future: overlay)

  // ── Canonical continuity linkage ────────────────────────────────────────────
  /**
   * UUID of the canonical_documents row created during OCR extract.
   * Passed through the wizard → generate-packet so the packet route can load
   * the persisted canonical result instead of reconstructing from DTO.
   *
   * The extract route persists the canonical document (shadow) and, when that
   * persist succeeds, returns its id. The wizard captures it for the PRIMARY
   * identity document (passport → booklet → any slot that returned one) and
   * resends it here so generation can be tied back to the same canonical read.
   * OPTIONAL: absent when CANONICAL_CONTINUITY_MODE=off or persist failed in
   * shadow mode — never fabricate an id. Enforce-mode enforcement lives server-side.
   * Naming: no _-prefix despite being a system field; it is load-bearing for routing.
   */
  canonical_document_id?: string
}

/**
 * Returns true if the answers are minimally complete enough to attempt PDF
 * generation. Does not validate USCIS eligibility — only "all required fields
 * have a value". Eligibility checks live in the classifier (next cycle).
 */
export function isMinimallyComplete(a: TPSAnswers): { ok: boolean; missing: string[] } {
  const missing: string[] = []
  // Required-field list comes from the single readinessPolicy ('generate'
  // stage), with conditionals applied (e.g. ead_category only if wants_ead).
  // No local literal here — it can never drift from centralBrain / mailReadyGate.
  for (const r of requiredRules('generate', a)) {
    const v = a[r.field]
    // "Present" = has a real value. `v !== false` preserves the original
    // boolean check for part7_reviewed (false = not reviewed = missing).
    const present = v !== undefined && v !== null && v !== '' && v !== false
    if (!present) missing.push(String(r.field))
  }
  return { ok: missing.length === 0, missing }
}

/**
 * Convenience: given filing_path, return the EAD category that USCIS expects.
 * Caller can let user override (rare but possible).
 */
export function defaultEadCategoryFor(path: FilingPath): EadCategory {
  if (path === 'initial') return 'c19'        // pending TPS — 8 CFR 274a.12(c)(19)
  if (path === 're_registration') return 'a12' // approved TPS — 8 CFR 274a.12(a)(12)
  return null
}

/**
 * Convert YYYY-MM-DD (HTML date input) to MM/DD/YYYY (USCIS form format).
 * Returns '' if input is empty/invalid.
 */
export function toUscisDate(iso: string | undefined): string {
  if (!iso) return ''
  const m = iso.match(/^(\d{4})-(\d{2})-(\d{2})$/)
  if (!m) return ''
  return `${m[2]}/${m[3]}/${m[1]}`
}

/**
 * Ukrainian passports show "Місце народження" (place of birth) as an oblast
 * or city (e.g. "ВІННИЦЬКА ОБЛ." or "Vinnytska Obl. / Ukr").
 * USCIS forms ask for COUNTRY of birth = "Ukraine", not the region.
 *
 * Normalizes any oblast/city/mixed value to the clean country name.
 */
export function normalizeCountryOfBirth(raw: string, nationality?: string): string {
  if (!raw) return nationality || 'Ukraine'
  const lower = raw.toLowerCase().trim()
  if (lower === 'ukraine' || lower === 'україна') return 'Ukraine'
  if (/\bukr/i.test(raw)) return 'Ukraine'
  if (/обл\.?|obl\.?|область|м\.|місто|city|village|район|raion/i.test(raw)) {
    return nationality || 'Ukraine'
  }
  if (raw.length <= 30 && !/[,\/]/.test(raw)) return raw
  return nationality || 'Ukraine'
}
