/**
 * i821DocumentMapper — shared canonical mapper for DOCUMENT-DERIVED fields of
 * USCIS Form I-821 (Application for Temporary Protected Status, edition 01/20/25).
 *
 * Phase 1 canonical single-currency: before this file, buildI821Ops read
 * TPSAnswers directly and duplicated the same field-to-name transcription that
 * i765DocumentMapper already owns for the shared fields (name, DOB, sex, birth,
 * passport, I-94). This mapper owns only document-derived I-821 identity fields;
 * USER_DECLARED / product-config fields (filing type, address, biographic, contact,
 * Part 7 questions) remain in the application-layer buildI821Ops caller.
 *
 * FIELD CLASSIFICATION (document-derived subset handled here):
 *   Part 2 Item 1   family/given/middle name           DOCUMENT_DERIVED
 *   Part 2 Item 7   A-Number                           DOCUMENT_DERIVED (9 digits, maxLength=9)
 *   Part 2 Item 10  date of birth                      DOCUMENT_DERIVED (ISO → MM/DD/YYYY)
 *   Part 2 Item 12  sex (M/F checkboxes)               DOCUMENT_DERIVED
 *   Part 2 Item 13  city of birth                      DOCUMENT_DERIVED
 *   Part 2 Item 14  country of birth                   DOCUMENT_DERIVED (boundary-normalized)
 *   Part 2 Item 18  date of last arrival               DOCUMENT_DERIVED (I-94)
 *   Part 2 Item 19  immigration status at last entry   DOCUMENT_DERIVED
 *   Part 2 Item 20  port of entry city + state         DOCUMENT_DERIVED (boundary pre-split)
 *   Part 2 Item 22  passport number + I-94 number      DOCUMENT_DERIVED
 *   Part 2 Item 24  passport country + expiration      DOCUMENT_DERIVED
 *
 * USER_DECLARED / PRODUCT_CONFIG (NOT handled here, stays in buildI821Ops):
 *   Part 1  filing type, TPS country, concurrent EAD
 *   Part 2  Items 2/3 other names, Items 5-6 mailing/physical address,
 *           Item 8 USCIS account, Item 9 SSN, Item 11 "Other DOBs used",
 *           Item 17 marital status
 *   Part 3  biographic (ethnicity, race, eye/hair)
 *   Part 7  background yes/no questions
 *   Part 8  contact, English proficiency, signature
 *
 * normalizeCountryOfBirth is applied in i821DocumentBoundary (the TPS boundary),
 * not here. The value arriving via CanonicalDocumentResult is already normalized.
 */
import type { CanonicalDocumentResult } from '../types'
import { applyCanonicalFieldMap, type CanonicalFieldMap } from '../core/adapterContract'

export interface I821Op {
  field: string
  kind: 'text' | 'checkbox' | 'choice'
  value: string | boolean
}

/** YYYY-MM-DD → MM/DD/YYYY. PDF_FORMATTING only. */
function toUscisDate(iso: string): string {
  const m = iso.match(/^(\d{4})-(\d{2})-(\d{2})$/)
  return m ? `${m[2]}/${m[3]}/${m[1]}` : iso
}

/**
 * Strip "A"/separators from A-Number → 9 trailing digits.
 * PDF_FORMATTING: Part2_Item7_AlienNumber[0] has maxLength=9. An "A"-prefixed
 * or dashed value (e.g. "A012345678") is silently rejected by pdf-lib.
 */
function toI821ANumber(raw: string): string {
  const digits = raw.replace(/\D/g, '')
  return digits.length > 9 ? digits.slice(-9) : digits
}

// I-821 AcroForm field names for document-derived identity fields.
const F = {
  // Part 2 Item 1 — legal name (Page 01)
  familyName: 'form1[0].Page01[0].Part2_Item1_FamilyName[0]',
  givenName:  'form1[0].Page01[0].Part2_Item1_GivenName[0]',
  middleName: 'form1[0].Page01[0].Part2_Item1_MiddleName[0]',
  // Part 2 Item 7 — A-Number (Page 02)
  alienNumber: 'form1[0].Page02[0].Part2_Item7_AlienNumber[0]',
  // Part 2 Item 10 — DOB (Page 02)
  dob: 'form1[0].Page02[0].Part2_Item10_DateOfBirth[0]',
  // Part 2 Item 12 — Sex (Page 02): [0]=Male, [1]=Female (standard USCIS ordering)
  sexMale:   'form1[0].Page02[0].Part2_Item12_Sex[0]',
  sexFemale: 'form1[0].Page02[0].Part2_Item12_Sex[1]',
  // Part 2 Item 13 — City of birth (Page 02)
  cityOfBirth: 'form1[0].Page02[0].Part2_Item13_CityOrTown[0]',
  // Part 2 Item 14 — Country of birth (Page 02; boundary-normalized)
  countryOfBirth: 'form1[0].Page02[0].Part2_Item14_CountryofBirth[0]',
  // Part 2 Item 18 — Date of last arrival (Page 03; AcroForm name is misleading)
  lastEntryDate: 'form1[0].Page03[0].P2_Line7_DateOfBirth[0]',
  // Part 2 Item 19 — Immigration status at last entry (Page 03)
  statusAtLastEntry: 'form1[0].Page03[0].Part2_Item19_ImmigrationStatus[0]',
  // Part 2 Item 20 — Port of entry city + state (Page 03; state is a dropdown)
  portOfEntryCity:  'form1[0].Page03[0].Part2_Item20_CityOrTown[0]',
  portOfEntryState: 'form1[0].Page03[0].Part2_Item20_State[0]',
  // Part 2 Item 22 — Passport number + I-94 number (Page 03)
  passportNumber:   'form1[0].Page03[0].Part2_Item22_Passport[0]',
  i94Number:        'form1[0].Page03[0].Part2_Item22_I94[0]',
  // Part 2 Item 24 — Passport country + expiration (Page 03)
  passportCountry:  'form1[0].Page03[0].Part2_Item24_CountryofIssuance[0]',
  passportExp:      'form1[0].Page03[0].Part2_Item24_PassportExpiration[0]',
} as const

/**
 * Declarative field map (canonical key → output handle). The shared engine
 * resolves values through fieldAccessor, honoring C3 finalValue semantics.
 *
 * port_of_entry_city / port_of_entry_state are I-821-boundary-specific keys
 * emitted by i821DocumentBoundary (pre-split from place_of_last_entry).
 */
const DOCUMENT_FIELD_MAP: CanonicalFieldMap = [
  { out: 'familyName',        canonicalKey: 'family_name' },
  { out: 'givenName',         canonicalKey: 'given_name' },
  { out: 'middleName',        canonicalKey: 'middle_name' },
  { out: 'dob',               canonicalKey: 'date_of_birth' },
  { out: 'sex',               canonicalKey: 'sex' },
  { out: 'alienNumber',       canonicalKey: 'a_number' },
  { out: 'cityOfBirth',       canonicalKey: 'city_of_birth' },
  { out: 'countryOfBirth',    canonicalKey: 'country_of_birth' },
  { out: 'passportNumber',    canonicalKey: 'passport_number' },
  { out: 'passportCountry',   canonicalKey: 'passport_country_of_issuance' },
  { out: 'passportExp',       canonicalKey: 'passport_expiration_date' },
  { out: 'i94Number',         canonicalKey: 'i94_admission_number' },
  { out: 'lastEntryDate',     canonicalKey: 'i94_date_of_entry' },
  { out: 'statusAtLastEntry', canonicalKey: 'status_at_last_entry' },
  // Pre-split by i821DocumentBoundary from place_of_last_entry or port_of_entry_*
  { out: 'portOfEntryCity',  canonicalKey: 'port_of_entry_city' },
  { out: 'portOfEntryState', canonicalKey: 'port_of_entry_state' },
]

/**
 * Build DOCUMENT-DERIVED I-821 prefill ops from one canonical result.
 *
 * Pure: canonical-key → I821Op. No normalization, no dictionary, no inference.
 * Date strings are reformatted to MM/DD/YYYY; the gender enum expands to two
 * PDF checkboxes; A-Number is stripped to 9 digits — all PDF_FORMATTING only.
 * Absent canonical values produce NO op (field left for user / application layer).
 */
export function buildI821DocumentOps(canonical: CanonicalDocumentResult): I821Op[] {
  const { values } = applyCanonicalFieldMap(canonical, DOCUMENT_FIELD_MAP)
  const ops: I821Op[] = []
  const text = (field: string, v: string | undefined): void => {
    if (v !== undefined && v !== '') ops.push({ field, kind: 'text', value: v })
  }

  // ── Part 2 Item 1 — legal name ───────────────────────────────────────────────
  text(F.familyName, values.familyName)
  text(F.givenName, values.givenName)
  text(F.middleName, values.middleName)

  // ── Part 2 Item 7 — A-Number (PDF_FORMATTING: strip "A"/separators → 9 digits)
  if (values.alienNumber) text(F.alienNumber, toI821ANumber(values.alienNumber))

  // ── Part 2 Item 10 — DOB (PDF_FORMATTING: ISO → MM/DD/YYYY) ─────────────────
  if (values.dob) text(F.dob, toUscisDate(values.dob))

  // ── Part 2 Item 12 — Sex (PDF_FORMATTING: enum → two checkboxes) ────────────
  // I-821 uses standard USCIS widget ordering: Sex[0]=Male, Sex[1]=Female.
  // Only emit when sex is known; absent → no checkbox op.
  const sex = values.sex
  if (sex === 'M' || sex === 'F') {
    ops.push({ field: F.sexMale,   kind: 'checkbox', value: sex === 'M' })
    ops.push({ field: F.sexFemale, kind: 'checkbox', value: sex === 'F' })
  }

  // ── Part 2 Item 13 — City of birth ──────────────────────────────────────────
  text(F.cityOfBirth, values.cityOfBirth)

  // ── Part 2 Item 14 — Country of birth (boundary-normalized) ─────────────────
  text(F.countryOfBirth, values.countryOfBirth)

  // ── Part 2 Item 18 — Date of last arrival (ISO → MM/DD/YYYY) ────────────────
  if (values.lastEntryDate) text(F.lastEntryDate, toUscisDate(values.lastEntryDate))

  // ── Part 2 Item 19 — Immigration status at last entry ───────────────────────
  text(F.statusAtLastEntry, values.statusAtLastEntry)

  // ── Part 2 Item 20 — Port of entry city + state ──────────────────────────────
  // Pre-split from place_of_last_entry (or port_of_entry_* overrides) by the boundary.
  text(F.portOfEntryCity, values.portOfEntryCity)
  if (values.portOfEntryState) {
    ops.push({ field: F.portOfEntryState, kind: 'choice', value: values.portOfEntryState })
  }

  // ── Part 2 Items 22 + 24 — Passport + I-94 ───────────────────────────────────
  text(F.passportNumber, values.passportNumber)
  text(F.i94Number, values.i94Number)
  text(F.passportCountry, values.passportCountry)
  if (values.passportExp) text(F.passportExp, toUscisDate(values.passportExp))

  return ops
}

export { toUscisDate as toUscisDateI821 }
