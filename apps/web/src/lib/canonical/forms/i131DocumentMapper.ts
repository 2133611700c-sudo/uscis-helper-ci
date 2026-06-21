/**
 * i131DocumentMapper — shared canonical mapper for DOCUMENT-DERIVED fields of
 * USCIS Form I-131 (Application for Travel Document — Re-Parole U4U, edition 01/20/25).
 *
 * Phase 1 canonical single-currency: before this file, buildI131Ops read
 * ReParoleAnswers directly and re-implemented document-derived field transcription
 * already handled for the same facts in i765DocumentMapper (name, DOB, sex, country
 * of birth, A-number, I-94). This mapper owns only the document-derived fields;
 * USER_DECLARED (address, SSN, USCIS account, contact) remain in the
 * application-layer buildI131Ops caller.
 *
 * FIELD CLASSIFICATION (document-derived subset handled here):
 *   Part 2 Item 1   family/given/middle name                DOCUMENT_DERIVED
 *   Part 2 Item 5   A-Number                                DOCUMENT_DERIVED (9 digits, maxLength=9)
 *   Part 2 Item 6   country of birth                        DOCUMENT_DERIVED
 *   Part 2 Item 7   country of citizenship/nationality      DOCUMENT_DERIVED
 *   Part 2 Item 8   gender (M/F)                            DOCUMENT_DERIVED — INVERTED WIDGETS
 *   Part 2 Item 9   date of birth                           DOCUMENT_DERIVED (ISO → MM/DD/YYYY)
 *   Part 2 Item 12  class of admission                      DOCUMENT_DERIVED (I-94)
 *   Part 2 Item 13  I-94 record number                      DOCUMENT_DERIVED
 *
 * USER_DECLARED (NOT handled here, stays in buildI131Ops):
 *   Part 2 Item 3   mailing address
 *   Part 2 Item 4   physical address
 *   Part 2 Item 10  SSN
 *   Part 2 Item 11  USCIS online account number
 *   Part 10         contact (phone, email)
 *
 * ── CRITICAL: I-131 GENDER WIDGET INVERSION ────────────────────────────────
 * The AcroForm widget ORDER on I-131 (Edition 01/20/25) is the REVERSE of the
 * visible "Male  Female" label order (verified via pdf-lib getOnValue()):
 *   Part2_Line8_Gender[0] → on-value /F  (Female widget)
 *   Part2_Line8_Gender[1] → on-value /M  (Male widget)
 * Targeting by index alone inverts the legal answer (sex=M would check Female).
 * This mapper always targets by the verified index that carries the matching /M or /F
 * on-value — NOT by the physical label position.
 */
import type { CanonicalDocumentResult } from '../types'
import { applyCanonicalFieldMap, type CanonicalFieldMap } from '../core/adapterContract'
import type { PrefillOp } from '@/lib/tps/pdfPrefiller'

/** YYYY-MM-DD → MM/DD/YYYY. PDF_FORMATTING only. */
function toUscisDate(iso: string): string {
  const m = iso.match(/^(\d{4})-(\d{2})-(\d{2})$/)
  return m ? `${m[2]}/${m[3]}/${m[1]}` : iso
}

/**
 * Strip "A"/separators from A-Number → 9 trailing digits.
 * PDF_FORMATTING: Part2_Line5_AlienNumber[0] has maxLength=9. An "A"-prefixed
 * or dashed value (e.g. "A-123-456-789") is silently rejected by pdf-lib.
 */
function toI131ANumber(raw: string): string {
  const digits = raw.replace(/\D/g, '')
  return digits.length > 9 ? digits.slice(-9) : digits
}

// I-131 AcroForm field names for document-derived identity fields.
const F = {
  // Part 2 Item 1 — legal name (P4 page)
  familyName: 'form1[0].P4[0].Part2_Line1_FamilyName[0]',
  givenName:  'form1[0].P4[0].Part2_Line1_GivenName[0]',
  middleName: 'form1[0].P4[0].Part2_Line1_MiddleName[0]',
  // Part 2 Item 5 — A-Number (P5 page; maxLength=9, no "A" prefix)
  alienNumber: 'form1[0].P5[0].#area[0].Part2_Line5_AlienNumber[0]',
  // Part 2 Item 6/7 — Country of birth / nationality
  countryOfBirth: 'form1[0].P5[0].Part2_Line6_CountryOfBirth[0]',
  countryOfNationality: 'form1[0].P5[0].Part2_Line7_CountryOfCitizenshiporNationality[0]',
  // Part 2 Item 8 — Gender (INVERTED: Gender[0]=/F Female, Gender[1]=/M Male)
  genderFemaleWidget: 'form1[0].P5[0].Part2_Line8_Gender[0]',  // on-value=/F
  genderMaleWidget:   'form1[0].P5[0].Part2_Line8_Gender[1]',  // on-value=/M
  // Part 2 Item 9 — Date of birth
  dob: 'form1[0].P5[0].Part2_Line9_DateOfBirth[0]',
  // Part 2 Item 12/13 — Class of admission + I-94 record number
  classOfAdmission: 'form1[0].P5[0].Part2_Line12_ClassofAdmission[0]',
  i94Number:        'form1[0].P5[0].Part2_Line13_I94RecordNo[0]',
} as const

const DOCUMENT_FIELD_MAP: CanonicalFieldMap = [
  { out: 'familyName',          canonicalKey: 'family_name' },
  { out: 'givenName',           canonicalKey: 'given_name' },
  { out: 'middleName',          canonicalKey: 'middle_name' },
  { out: 'alienNumber',         canonicalKey: 'a_number' },
  { out: 'countryOfBirth',      canonicalKey: 'country_of_birth' },
  { out: 'countryOfNationality', canonicalKey: 'country_of_nationality' },
  { out: 'sex',                 canonicalKey: 'sex' },
  { out: 'dob',                 canonicalKey: 'date_of_birth' },
  { out: 'classOfAdmission',    canonicalKey: 'i94_class_of_admission' },
  { out: 'i94Number',           canonicalKey: 'i94_admission_number' },
]

/**
 * Build DOCUMENT-DERIVED I-131 prefill ops from one canonical result.
 *
 * Pure: canonical-key → PrefillOp. No normalization, no inference.
 * Date strings are reformatted to MM/DD/YYYY; gender expands to the two PDF
 * widgets using verified on-values (NOT index order); A-Number stripped to 9
 * digits. Absent canonical values produce NO op.
 */
export function buildI131DocumentOps(canonical: CanonicalDocumentResult): PrefillOp[] {
  const { values } = applyCanonicalFieldMap(canonical, DOCUMENT_FIELD_MAP)
  const ops: PrefillOp[] = []
  const text = (field: string, v: string | undefined): void => {
    if (v !== undefined && v !== '') ops.push({ field, kind: 'text', value: v })
  }

  // ── Part 2 Item 1 — legal name ───────────────────────────────────────────────
  text(F.familyName, values.familyName)
  text(F.givenName, values.givenName)
  text(F.middleName, values.middleName)

  // ── Part 2 Item 5 — A-Number (PDF_FORMATTING: strip "A"/separators → 9 digits)
  if (values.alienNumber) text(F.alienNumber, toI131ANumber(values.alienNumber))

  // ── Part 2 Item 6/7 — Country of birth / nationality ────────────────────────
  text(F.countryOfBirth, values.countryOfBirth)
  text(F.countryOfNationality, values.countryOfNationality)

  // ── Part 2 Item 8 — Gender (INVERTED widget order; target by verified on-value)
  // Gender[0] carries on-value /F (Female); Gender[1] carries on-value /M (Male).
  // Checking by physical index inverts the legal answer. Always use the index that
  // matches the canonical sex value's AcroForm on-value.
  const sex = values.sex
  if (sex === 'M') {
    ops.push({ field: F.genderMaleWidget, kind: 'checkbox', value: true })
  } else if (sex === 'F') {
    ops.push({ field: F.genderFemaleWidget, kind: 'checkbox', value: true })
  }

  // ── Part 2 Item 9 — DOB (PDF_FORMATTING: ISO → MM/DD/YYYY) ─────────────────
  if (values.dob) text(F.dob, toUscisDate(values.dob))

  // ── Part 2 Items 12/13 — Class of admission + I-94 number ───────────────────
  text(F.classOfAdmission, values.classOfAdmission)
  text(F.i94Number, values.i94Number)

  return ops
}

export { toUscisDate as toUscisDateI131 }
