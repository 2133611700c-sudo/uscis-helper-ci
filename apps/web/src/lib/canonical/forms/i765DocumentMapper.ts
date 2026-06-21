/**
 * i765DocumentMapper — ONE shared canonical mapper for the DOCUMENT-DERIVED
 * fields of USCIS Form I-765 (edition 08/21/25).
 *
 * GAP-3 closeout (Phase 1, "one canonical currency"). Before this file there were
 * TWO I-765 maps writing the SAME PDF:
 *   - lib/ead/i765FieldMap.ts        (EAD wizard, sparse EadFieldData)
 *   - lib/tps/forms/i765FieldMap.ts  (TPS pipeline, rich TPSAnswers)
 * Both hand-coded the SAME AcroForm field names for the same document facts
 * (legal name, DOB, country of birth, A-number, gender, passport, I-94). That is
 * DUPLICATE_LOGIC — one canonical fact, two transcriptions, drift waiting to happen.
 *
 * This mapper owns ONLY the document-derived I-765 fields. It:
 *   - reads every value through the frozen accessor (getValueByAliases →
 *     getCanonicalValue), honoring C3's finalValue contract uniformly;
 *   - emits PrefillOps (I765Op) by canonical key → PDF field name ONLY;
 *   - does NOT normalize country/name/date, NOT apply a dictionary, NOT infer,
 *     NOT change review state. The canonical value is already the release value
 *     (arbitration + C3 ran upstream). In particular normalizeCountryOfBirth has
 *     been MOVED OUT to the document/application boundary — country_of_birth here
 *     is whatever arbitration released, untouched.
 *
 * What this mapper does NOT own (stays at the application/product layer, and the
 * two products may legitimately DIFFER here — explicit, not hidden):
 *   - Type of application (initial / replacement / renewal / new)  → USER_DECLARED
 *   - Eligibility category, Item 27 (a12/c19 vs c11/c08/a12)        → PRODUCT_CONFIG
 *   - Mailing vs physical address, in-care-of, unit type           → USER_DECLARED
 *   - Country of citizenship / nationality cells (Line 17)         → product layer
 *   - Race / ethnicity checkboxes (Line 10)                        → USER_DECLARED
 *   - SSN (Line 12b)                                               → USER_DECLARED
 *   - English proficiency (Part 3 Item 1)                          → USER_DECLARED
 *   - Phone / email / signature (Part 3)                           → USER_DECLARED
 *   - "Previously filed I-765?" (Line 29)                          → derived from
 *                                                                     filing reason
 *                                                                     (USER_DECLARED)
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * INPUT CLASSIFICATION (every input of both old maps)
 *
 * EAD map (EadFieldData):
 *   lastName / firstName / middleName  DOCUMENT_DERIVED  → owned here
 *   dob                                DOCUMENT_DERIVED  → owned here (date format = PDF_FORMATTING)
 *   countryOfBirth                     DOCUMENT_DERIVED  → owned here
 *   alienNumber                        DOCUMENT_DERIVED  → owned here
 *   gender                             DOCUMENT_DERIVED  → owned here (enum map = PDF_FORMATTING)
 *   appType                            USER_DECLARED     → app layer
 *   category                           PRODUCT_CONFIG    → app layer
 *   usAddress                          USER_DECLARED     → app layer
 *
 * TPS map (TPSAnswers, document-derived subset):
 *   family_name / given_name / middle_name      DOCUMENT_DERIVED → owned here
 *   dob                                          DOCUMENT_DERIVED → owned here
 *   country_of_birth (+ normalizeCountryOfBirth) DOCUMENT_DERIVED → owned here;
 *                                                normalizeCountryOfBirth = DUPLICATE_LOGIC,
 *                                                moved OUT to the boundary.
 *   city_of_birth / province_of_birth            DOCUMENT_DERIVED → owned here
 *   a_number                                     DOCUMENT_DERIVED → owned here
 *   sex                                          DOCUMENT_DERIVED → owned here
 *   passport_number / passport_country_of_issuance / passport_expiration_date
 *                                                DOCUMENT_DERIVED → owned here
 *   i94_admission_number / last_entry_date / status_at_last_entry /
 *   current_immigration_status / place_of_last_entry
 *                                                DOCUMENT_DERIVED → owned here
 *   i765_application_type / filing_path          USER_DECLARED  → app layer
 *   mailing_* / us_address_* / in_care_of        USER_DECLARED  → app layer
 *   race_* / ssn / english_proficiency           USER_DECLARED  → app layer
 *   daytime_phone / email / _signature_*         USER_DECLARED  → app layer
 *   ead_category / country_of_nationality        PRODUCT_CONFIG / app layer
 *
 * LEGACY_ALIAS: dob↔date_of_birth, a_number↔alien_number, country_of_birth↔
 *   place_of_birth, passport_expiration_date↔date_of_expiry — resolved via
 *   keyAliases (frozen registry), not re-declared here.
 * ─────────────────────────────────────────────────────────────────────────────
 */
import type { CanonicalDocumentResult } from '../types'
import { applyCanonicalFieldMap, type CanonicalFieldMap } from '../core/adapterContract'

/** A single PDF prefill operation (kept structurally identical to the old maps). */
export interface I765Op {
  field: string
  kind: 'text' | 'checkbox' | 'choice'
  value: string | boolean
}

/** YYYY-MM-DD → MM/DD/YYYY for USCIS form fields. PDF_FORMATTING only (no value change). */
function toUscisDate(iso: string): string {
  if (!iso) return ''
  const m = iso.match(/^(\d{4})-(\d{2})-(\d{2})$/)
  return m ? `${m[2]}/${m[3]}/${m[1]}` : iso
}

/**
 * Normalize an A-Number to the 9 digits the I-765 Line 7 AcroForm cell expects.
 *
 * PDF_FORMATTING only — NOT a value change. The Alien Registration Number IS a
 * 9-digit number; the leading "A" and any separators (spaces, dashes) are display
 * formatting. The PDF field has maxLength=9, so an "A"-prefixed or dashed value
 * (e.g. "A012345678" or "012-345-678") is REJECTED by pdf-lib and the field is
 * silently left blank — an EMPTY_WRONG defect. We strip every non-digit and keep
 * the trailing 9 digits (preserving leading zeros).
 *
 * Same intent as the existing phone digit-strip in the product field maps. If the
 * input does not contain 9 trailing digits we return the digits we have (the field
 * cap still applies upstream) rather than fabricating.
 */
function toI765ANumber(raw: string): string {
  const digits = raw.replace(/\D/g, '')
  return digits.length > 9 ? digits.slice(-9) : digits
}

// AcroForm field names on the shared i-765.pdf (edition 08/21/25). These are the
// SAME literals both old maps used for document-derived fields — single-sourced here.
const F = {
  familyName: 'form1[0].Page1[0].Line1a_FamilyName[0]',
  givenName: 'form1[0].Page1[0].Line1b_GivenName[0]',
  middleName: 'form1[0].Page1[0].Line1c_MiddleName[0]',
  alienNumber: 'form1[0].Page2[0].Line7_AlienNumber[0]',
  genderMale: 'form1[0].Page2[0].Line9_Checkbox[0]',
  genderFemale: 'form1[0].Page2[0].Line9_Checkbox[1]',
  cityOfBirth: 'form1[0].Page3[0].Line18a_CityTownOfBirth[0]',
  provinceOfBirth: 'form1[0].Page3[0].Line18b_CityTownOfBirth[0]',
  countryOfBirth: 'form1[0].Page3[0].Line18c_CountryOfBirth[0]',
  dob: 'form1[0].Page3[0].Line19_DOB[0]',
  passportNumber: 'form1[0].Page3[0].Line20b_Passport[0]',
  passportCountry: 'form1[0].Page3[0].Line20d_CountryOfIssuance[0]',
  passportExp: 'form1[0].Page3[0].Line20e_ExpDate[0]',
  i94Number: 'form1[0].Page3[0].Line20a_I94Number[0]',
  lastEntryDate: 'form1[0].Page3[0].Line21_DateOfLastEntry[0]',
  statusLastEntry: 'form1[0].Page3[0].Line23_StatusLastEntry[0]',
  currentStatus: 'form1[0].Page3[0].Line24_CurrentStatus[0]',
  placeLastEntry: 'form1[0].Page3[0].place_entry[0]',
} as const

/**
 * The declarative document-field map. Each entry: canonical key (aliases resolved
 * by the frozen keyAliases registry) → an internal handle. The shared engine
 * (applyCanonicalFieldMap) resolves values purely through fieldAccessor.
 *
 * Gender, dates and the empty-vs-absent rules are applied below from these values.
 */
const DOCUMENT_FIELD_MAP: CanonicalFieldMap = [
  { out: 'familyName', canonicalKey: 'family_name' },
  { out: 'givenName', canonicalKey: 'given_name' },
  { out: 'middleName', canonicalKey: 'middle_name' },
  { out: 'dob', canonicalKey: 'date_of_birth' },
  { out: 'sex', canonicalKey: 'sex' },
  { out: 'alienNumber', canonicalKey: 'a_number' },
  { out: 'cityOfBirth', canonicalKey: 'city_of_birth' },
  { out: 'provinceOfBirth', canonicalKey: 'province_of_birth' },
  { out: 'countryOfBirth', canonicalKey: 'country_of_birth' },
  { out: 'passportNumber', canonicalKey: 'passport_number' },
  { out: 'passportCountry', canonicalKey: 'passport_country_of_issuance' },
  { out: 'passportExp', canonicalKey: 'passport_expiration_date' },
  { out: 'i94Number', canonicalKey: 'i94_admission_number' },
  { out: 'lastEntryDate', canonicalKey: 'i94_date_of_entry' },
  { out: 'statusLastEntry', canonicalKey: 'status_at_last_entry' },
  { out: 'currentStatus', canonicalKey: 'current_immigration_status' },
  { out: 'placeLastEntry', canonicalKey: 'place_of_last_entry' },
]

/**
 * Build the DOCUMENT-DERIVED I-765 prefill ops from the single canonical result.
 *
 * Pure: canonical-key → PrefillOp. No normalization, no dictionary, no inference,
 * no review-state change. Date strings are reformatted to MM/DD/YYYY and the
 * gender enum is expanded to the two PDF checkboxes — these are PDF_FORMATTING, not
 * value changes. Absent canonical values produce NO op (the field is left for the
 * application layer / user, exactly as the old maps did for absent inputs).
 *
 * The two products call this for the document half and add their own product/
 * user-declared ops (application type, category, address, race, english, contact)
 * separately. This mapper deliberately does NOT own those.
 */
export function buildI765DocumentOps(canonical: CanonicalDocumentResult): I765Op[] {
  const { values } = applyCanonicalFieldMap(canonical, DOCUMENT_FIELD_MAP)
  const ops: I765Op[] = []
  const text = (field: string, v: string | undefined) => {
    if (v !== undefined && v !== '') ops.push({ field, kind: 'text', value: v })
  }

  // ── Page 1, Line 1 — legal name ───────────────────────────────────────────
  text(F.familyName, values.familyName)
  text(F.givenName, values.givenName)
  text(F.middleName, values.middleName)

  // ── Page 2, Line 7 — A-Number (PDF_FORMATTING: strip "A"/separators → 9 digits)
  // The cell is maxLength=9; an "A"-prefixed or dashed value would be rejected by
  // pdf-lib and silently dropped. Normalize to the 9-digit form the field holds.
  if (values.alienNumber) text(F.alienNumber, toI765ANumber(values.alienNumber))

  // ── Page 2, Line 9 — Gender (PDF_FORMATTING: enum → two checkboxes) ────────
  // Canonical 'sex' is 'M' | 'F' (or absent). Emit checkboxes only when present,
  // matching whichever the value selects. Absent ⇒ no checkbox op (do not force
  // both-off, which would differ from product-specific maps that emit defaults).
  const sex = values.sex
  if (sex === 'M' || sex === 'F') {
    ops.push({ field: F.genderMale, kind: 'checkbox', value: sex === 'M' })
    ops.push({ field: F.genderFemale, kind: 'checkbox', value: sex === 'F' })
  }

  // ── Page 3 — birthplace ───────────────────────────────────────────────────
  text(F.cityOfBirth, values.cityOfBirth)
  text(F.provinceOfBirth, values.provinceOfBirth)
  // country_of_birth is the value arbitration released — NOT re-normalized here.
  text(F.countryOfBirth, values.countryOfBirth)

  // ── Page 3, Line 19 — DOB (PDF_FORMATTING: ISO → MM/DD/YYYY) ───────────────
  if (values.dob) text(F.dob, toUscisDate(values.dob))

  // ── Page 3, Line 20 — passport ────────────────────────────────────────────
  text(F.passportNumber, values.passportNumber)
  text(F.passportCountry, values.passportCountry)
  if (values.passportExp) text(F.passportExp, toUscisDate(values.passportExp))

  // ── Page 3, Lines 20a–24 — I-94 / entry ───────────────────────────────────
  text(F.i94Number, values.i94Number)
  if (values.lastEntryDate) text(F.lastEntryDate, toUscisDate(values.lastEntryDate))
  text(F.statusLastEntry, values.statusLastEntry)
  text(F.currentStatus, values.currentStatus)
  text(F.placeLastEntry, values.placeLastEntry)

  return ops
}

/** Exposed for parity tests / boundary use. PDF date formatting only. */
export { toUscisDate as toUscisDateI765 }
