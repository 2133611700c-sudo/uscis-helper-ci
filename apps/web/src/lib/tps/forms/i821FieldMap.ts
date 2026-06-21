/**
 * I-821 field map — Application for Temporary Protected Status.
 *
 * Source PDF: apps/web/public/uscis/tps/i-821.pdf
 * Edition: 01/20/25 (verified 2026-05-10 against uscis.gov page + PDF footer)
 * Total fields: 511 (per field_inventory_i821.json)
 *
 * We map the SUBSET of fields needed for a single-adult applicant on the
 * initial or re-registration path.
 *
 * FIELD CLASSIFICATION (per TPS_FIELD_COVERAGE_CLOSEOUT_V1):
 *   MAPPED (this file):
 *     Part 1  — filing type, TPS country, concurrent EAD
 *     Part 2  — identity, address, A-number, DOB (Item 10 only — Item 11
 *               "Other Dates of Birth Used" is left for the user), sex, SSN,
 *               marital status, city/country of birth, passport, I-94, status
 *               at entry, port of entry, authorized stay, other names used
 *               (Items 2/3 — first 2 slots). Items 15/16 (Countries of
 *               Residence / Citizenship) are NOT mapped (no source).
 *     Part 3  — biographic (ethnicity, race, eye/hair color)
 *     Part 7  — all yes/no background questions (defaults to No; user reviews)
 *     Part 8  — phone, email (contact)
 *   NOT MAPPED (intentionally manual):
 *     Part 2  — height/weight (Pt2Line3/4; cosmetic, user fills in Adobe)
 *     Part 4  — spouse information (conditional, user fills)
 *     Part 5  — prior spouse information (conditional, user fills)
 *     Part 6  — co-applicant children (conditional, user fills)
 *     Part 7  — text fields (trip dates, prior TPS dates) — user fills
 *     Part 8  — signature/date — user signs in ink
 *     Part 9  — interpreter — N/A if user self-prepares
 *     Part 10 — preparer — N/A if user self-prepares
 *
 * The user signs the blank signature line themselves before mailing.
 *
 * Field-name format is the literal AcroForm field name from the PDF:
 *   form1[0].Page02[0].Part2_Item1_FamilyName[0]
 *
 * Types:
 *   'text'      → setText(value)
 *   'date'      → setText(MM/DD/YYYY)
 *   'checkbox'  → check() if true
 *   'choice'    → select state from US 2-letter abbr (uses pdf-lib dropdown)
 */

import type { TPSAnswers } from '../answers'
import { buildI821DocumentOps, type I821Op } from '@/lib/canonical/forms/i821DocumentMapper'
import { i821DocumentFactsToCanonical } from './i821DocumentBoundary'

export type { I821Op }

export function buildI821Ops(a: TPSAnswers): I821Op[] {
  const ops: I821Op[] = []

  // ── DOCUMENT-DERIVED fields via the ONE shared canonical mapper ───────────────
  // Legal name, DOB, sex, A-Number, birth city/country, passport, I-94, entry info
  // are now owned by i821DocumentMapper. normalizeCountryOfBirth runs at the boundary
  // (i821DocumentBoundary), NOT here.
  ops.push(...buildI821DocumentOps(i821DocumentFactsToCanonical(a)))

  // ── Part 1 — Type of application ──────────────────────────────────────────
  // Field name pattern in inventory:
  //   form1[0].Page01[0].Part1_Item1_ApplicationType[0]  (initial)
  //   form1[0].Page01[0].Part1_Item1_ApplicationType[1]  (re-registration)
  // These are two separate checkboxes — exactly one is checked.
  ops.push({
    field: 'form1[0].Page01[0].Part1_Item1_ApplicationType[0]',
    kind: 'checkbox',
    value: a.filing_path === 'initial',
  })
  ops.push({
    field: 'form1[0].Page01[0].Part1_Item1_ApplicationType[1]',
    kind: 'checkbox',
    value: a.filing_path === 're_registration',
  })

  // Country of TPS designation — for Ukrainians applying, this is always 'Ukraine'
  ops.push({
    field: 'form1[0].Page01[0].Part1_TPScountry[0]',
    kind: 'text',
    value: a.country_of_nationality || 'Ukraine',
  })

  // ── Part 1 — Item 3: am I also filing I-765 concurrently? ─────────────────
  // [0] = Yes (filing concurrently), [1] = No (not filing concurrently / already have EAD)
  ops.push({
    field: 'form1[0].Page01[0].Part1_Item3_EADApp[0]',
    kind: 'checkbox',
    value: a.wants_ead === true,
  })
  ops.push({
    field: 'form1[0].Page01[0].Part1_Item3_EADApp[1]',
    kind: 'checkbox',
    value: a.wants_ead === false,
  })

  // (Legal name Part 2 Item 1 is now emitted by the shared canonical document mapper.)

  // ── Part 2 — Item 4: US physical address (Page02) ──────────────────────────
  if (a.us_address_in_care_of) {
    ops.push({ field: 'form1[0].Page02[0].Part2_Item4_InCareofName[0]', kind: 'text', value: a.us_address_in_care_of })
  }
  ops.push({ field: 'form1[0].Page02[0].Part2_Item4_StreetNumberName[0]', kind: 'text', value: a.us_address_street })

  // Unit type checkboxes: [0]=Apt, [1]=Ste, [2]=Flr
  const unitIdx = a.us_address_unit_type === 'apt' ? 0 : a.us_address_unit_type === 'ste' ? 1 : a.us_address_unit_type === 'flr' ? 2 : -1
  for (let i = 0; i < 3; i++) {
    ops.push({ field: `form1[0].Page02[0].Part2_Item4_Unit[${i}]`, kind: 'checkbox', value: i === unitIdx })
  }
  if (a.us_address_unit_number) {
    ops.push({ field: 'form1[0].Page02[0].Part2_Item4_AptSteFlrNumber[0]', kind: 'text', value: a.us_address_unit_number })
  }
  ops.push({ field: 'form1[0].Page02[0].Part2_Item4_CityOrTown[0]', kind: 'text', value: a.us_address_city })
  ops.push({ field: 'form1[0].Page02[0].Part2_Item4_State[0]',     kind: 'choice', value: a.us_address_state })
  ops.push({ field: 'form1[0].Page02[0].Part2_Item4_ZipCode[0]',   kind: 'text', value: a.us_address_zip })

  // ── Part 2 — Item 5: is mailing same as physical? ──────────────────────────
  // [0] = Yes (same), [1] = No (different)
  ops.push({ field: 'form1[0].Page02[0].Part2_Item5_YN[0]', kind: 'checkbox', value: a.mailing_same_as_physical === true })
  ops.push({ field: 'form1[0].Page02[0].Part2_Item5_YN[1]', kind: 'checkbox', value: a.mailing_same_as_physical === false })

  // ── Part 2 — Item 6: mailing address (if different) ───────────────────────
  if (!a.mailing_same_as_physical) {
    if (a.mailing_in_care_of) {
      // (Not in our subset; ignored for now.)
    }
    ops.push({ field: 'form1[0].Page02[0].Part2_Item6_StreetNumberName[0]', kind: 'text', value: a.mailing_street ?? '' })
    const mUnitIdx = a.mailing_unit_type === 'apt' ? 0 : a.mailing_unit_type === 'ste' ? 1 : a.mailing_unit_type === 'flr' ? 2 : -1
    for (let i = 0; i < 3; i++) {
      ops.push({ field: `form1[0].Page02[0].Part2_Item6_Unit[${i}]`, kind: 'checkbox', value: i === mUnitIdx })
    }
    if (a.mailing_unit_number) {
      ops.push({ field: 'form1[0].Page02[0].Part2_Item6_AptSteFlrNumber[0]', kind: 'text', value: a.mailing_unit_number })
    }
    ops.push({ field: 'form1[0].Page02[0].Part2_Item6_CityOrTown[0]', kind: 'text', value: a.mailing_city ?? '' })
    ops.push({ field: 'form1[0].Page02[0].Part2_Item6_State[0]',     kind: 'choice', value: a.mailing_state ?? '' })
    ops.push({ field: 'form1[0].Page02[0].Part2_Item6_ZipCode[0]',   kind: 'text', value: a.mailing_zip ?? '' })
  }

  // (A-Number Part 2 Item 7 is now emitted by the shared canonical document mapper.)

  // ── Part 2 — Item 8 (USCIS online account number, if any) ─────────────────
  if (a.uscis_online_account) {
    ops.push({
      field: 'form1[0].Page02[0].#area[0].Part2_Item8_AcctIdentifier[0]',
      kind: 'text',
      value: a.uscis_online_account,
    })
  }

  // (DOB Part 2 Item 10 and Sex Part 2 Item 12 are now emitted by the canonical mapper.)

  // ── Part 2 — Item 9: Social Security Number (if applicant has one) ──────────
  if (a.ssn) {
    ops.push({
      field: 'form1[0].Page02[0].Part2_Item9_SocialSecurityNumber[0]',
      kind: 'text',
      value: a.ssn,
    })
  }

  // ── Part 2 — Item 11: "Other Dates of Birth Used (if any)" ─────────────────
  // DO NOT write the applicant's real DOB here. Item 11 (Page 2, labeled
  // "Other Dates of Birth Used") asks for ALTERNATE/alias dates of birth the
  // applicant has previously used. Filling it with the real DOB (which the
  // mapper previously did, into [0] and [1]) fabricates an alias DOB the
  // applicant never claimed. The real DOB belongs only in Item 10 (above).
  // We have no alias-DOB source in TPSAnswers, so these cells stay empty for
  // the user to complete if applicable.

  // (City/country of birth Items 13/14 are now emitted by the canonical mapper.)

  // ── Part 2 — Item 17: marital status ──────────────────────────────────────
  // Seven checkboxes [0]-[6]: single, married, divorced, widowed,
  // legally_separated, annulled, other. At most one is checked.
  const maritalMap: Record<string, number> = {
    single: 0, married: 1, divorced: 2, widowed: 3,
    legally_separated: 4, annulled: 5, other: 6,
  }
  for (let i = 0; i < 7; i++) {
    ops.push({
      field: `form1[0].Page02[0].Part2_Item17_MaritalStatus[${i}]`,
      kind: 'checkbox',
      value: a.marital_status !== undefined && maritalMap[a.marital_status] === i,
    })
  }

  // ── Part 2 — Items 2/3: "Other Names Used" (aliases / maiden / prior names) ──
  // The I-821 (Edition 01/20/25) places the two "Other Names Used" slots on
  // Page 2, left column, as Items 2.a-2.c (first slot) and 3.a-3.c (second
  // slot) — verified against the rendered PDF widget positions + printed
  // labels. The AcroForm cells named Part2_Item15* / Part2_Item16* are the
  // RIGHT-column "Countries of Residence" and "Countries of Citizenship or
  // Nationality" fields — NOT name fields. The mapper previously wrote name
  // parts into Items 15/16, polluting country fields with a person's name; it
  // is corrected here to target the real other-name cells (Items 2/3).
  // Fields: Item2_FamilyName / Item2_GivenName / Item2_MiddleName, etc.
  if (a.other_names && a.other_names.length > 0) {
    const n0 = a.other_names[0]
    ops.push({ field: 'form1[0].Page02[0].Part2_Item2_FamilyName[0]', kind: 'text', value: n0.family })
    ops.push({ field: 'form1[0].Page02[0].Part2_Item2_GivenName[0]',  kind: 'text', value: n0.given })
    ops.push({ field: 'form1[0].Page02[0].Part2_Item2_MiddleName[0]', kind: 'text', value: n0.middle ?? '' })
  }
  if (a.other_names && a.other_names.length > 1) {
    const n1 = a.other_names[1]
    ops.push({ field: 'form1[0].Page02[0].Part2_Item3_FamilyName[0]', kind: 'text', value: n1.family })
    ops.push({ field: 'form1[0].Page02[0].Part2_Item3_GivenName[0]',  kind: 'text', value: n1.given })
    ops.push({ field: 'form1[0].Page02[0].Part2_Item3_MiddleName[0]', kind: 'text', value: n1.middle ?? '' })
  }

  // (Port of entry Items 20 city/state are now emitted by the canonical mapper,
  //  pre-split from place_of_last_entry in i821DocumentBoundary.)

  // ── Part 2 — Item 21: Authorized period of stay ──────────────────────────────
  if (a.authorized_stay) {
    ops.push({ field: 'form1[0].Page03[0].Part2_Item21_AuthorizedPdofStay[0]', kind: 'text', value: a.authorized_stay })
  }

  // (Items 18/19/22/24 — last arrival date, immigration status, passport, I-94 are
  //  now emitted by the canonical mapper via i821DocumentBoundary.)

  // ── Part 3 — Biographic Information (Pages 03-04) ────────────────────────────
  // Ethnicity: [0]=Yes Hispanic/Latino, [1]=No not Hispanic/Latino
  const ethnicityIdx = a.ethnicity === 'hispanic' ? 0 : a.ethnicity === 'not_hispanic' ? 1 : -1
  for (let i = 0; i < 2; i++) {
    ops.push({ field: `form1[0].Page03[0].Part3_Item1_Ethnicity[${i}]`, kind: 'checkbox', value: i === ethnicityIdx })
  }
  // Race (one or more may be checked)
  ops.push({ field: 'form1[0].Page03[0].Part3_Item2_RaceW[0]', kind: 'checkbox', value: a.race_white ?? false })
  ops.push({ field: 'form1[0].Page03[0].Part3_Item2_RaceA[0]', kind: 'checkbox', value: a.race_asian ?? false })
  ops.push({ field: 'form1[0].Page03[0].Part3_Item2_RaceB[0]', kind: 'checkbox', value: a.race_black ?? false })
  ops.push({ field: 'form1[0].Page03[0].Part3_Item2_RaceI[0]', kind: 'checkbox', value: a.race_american_indian ?? false })
  ops.push({ field: 'form1[0].Page03[0].Part3_Item2_RaceH[0]', kind: 'checkbox', value: a.race_pacific_islander ?? false })

  // Eye color: [0]=Black [1]=Blue [2]=Brown [3]=Gray [4]=Green [5]=Hazel [6]=Maroon [7]=Pink [8]=Unknown
  const eyeColorOrder = ['black', 'blue', 'brown', 'gray', 'green', 'hazel', 'maroon', 'pink', 'unknown'] as const
  const eyeIdx = a.eye_color !== undefined ? eyeColorOrder.indexOf(a.eye_color) : -1
  for (let i = 0; i < 9; i++) {
    ops.push({ field: `form1[0].Page04[0].Page04[0].Part3_Item5_Eyecolor[${i}]`, kind: 'checkbox', value: i === eyeIdx })
  }
  // Hair color: [0]=Bald [1]=Black [2]=Blonde [3]=Brown [4]=Gray [5]=Red [6]=Sandy [7]=White [8]=Unknown
  const hairColorOrder = ['bald', 'black', 'blonde', 'brown', 'gray', 'red', 'sandy', 'white', 'unknown'] as const
  const hairIdx = a.hair_color !== undefined ? hairColorOrder.indexOf(a.hair_color) : -1
  for (let i = 0; i < 9; i++) {
    ops.push({ field: `form1[0].Page04[0].Page04[0].Part3_Item6_Haircolor[${i}]`, kind: 'checkbox', value: i === hairIdx })
  }

  // ── Part 7 — Background declaration yes/no questions ─────────────────────────
  // Default: all false (No). User must review and confirm before generation.
  // The PacketCompletenessChecker enforces part7_reviewed=true before allowing
  // ZIP download. This satisfies the field_provenance requirement: no silent
  // defaults — user explicitly sees and confirms each answer.
  //
  // Field pattern: _YN[0]=Yes, _YN[1]=No (or _YND for Yes/No/Don't Know)
  // We write: [0]=value, [1]=!value
  type YNQ = [string, boolean]  // [field_prefix, answer_value]
  const part7Questions: YNQ[] = [
    // Page 7
    ['form1[0].Page07[0].Part7_Item4a_YN', !!a.part7_4a],
    ['form1[0].Page07[0].Part7_Item4b_YN', !!a.part7_4b],
    ['form1[0].Page07[0].Part7_Item4c_YN', !!a.part7_4c],
    // Page 8
    ['form1[0].Page08[0].Part7_Item5a_YN', !!a.part7_5a],
    ['form1[0].Page08[0].Part7_Item5b_YN', !!a.part7_5b],
    ['form1[0].Page08[0].Part7_Item5c_YN', !!a.part7_5c],
    ['form1[0].Page08[0].Part7_Item7a_YN', !!a.part7_7a],
    ['form1[0].Page08[0].Part7_Item7b_YN', !!a.part7_7b],
    ['form1[0].Page08[0].Part7_Item7c_YN', !!a.part7_7c],
    ['form1[0].Page08[0].Part7_Item8_YN',  !!a.part7_8],
    ['form1[0].Page08[0].Part7_Item9a_YN', !!a.part7_9a],
    ['form1[0].Page08[0].Part7_Item9b_YN', !!a.part7_9b],
    ['form1[0].Page08[0].Part7_Item9c_YN', !!a.part7_9c],
    ['form1[0].Page08[0].Part7_Item9d_YN', !!a.part7_9d],
    ['form1[0].Page08[0].Part7_Item9e_YN', !!a.part7_9e],
    ['form1[0].Page08[0].Part7_Item11a_YN', !!a.part7_11a],
    ['form1[0].Page08[0].Part7_Item11b_YN', !!a.part7_11b],
    ['form1[0].Page08[0].Part7_Item11c_YN', !!a.part7_11c],
    ['form1[0].Page08[0].Part7_Item11d_YN', !!a.part7_11d],
    ['form1[0].Page08[0].Part7_Item12a_YN', !!a.part7_12a],
    ['form1[0].Page08[0].Part7_Item12b_YN', !!a.part7_12b],
    ['form1[0].Page08[0].Part7_Item12c_YN', !!a.part7_12c],
    ['form1[0].Page08[0].Part7_Item12d_YN', !!a.part7_12d],
    ['form1[0].Page08[0].Part7_Item13a_YN', !!a.part7_13a],
    ['form1[0].Page08[0].Part7_Item13b_YN', !!a.part7_13b],
    ['form1[0].Page08[0].Part7_Item13c_YN', !!a.part7_13c],
    // Page 9
    ['form1[0].Page09[0].Part7_Item17_YN',  !!a.part7_17],
    ['form1[0].Page09[0].Part7_Item18a_YN', !!a.part7_18a],
    ['form1[0].Page09[0].Part7_Item18b_YN', !!a.part7_18b],
    ['form1[0].Page09[0].Part7_Item18c_YN', !!a.part7_18c],
  ]
  for (const [prefix, yes] of part7Questions) {
    ops.push({ field: `${prefix}[0]`, kind: 'checkbox', value: yes })   // Yes
    ops.push({ field: `${prefix}[1]`, kind: 'checkbox', value: !yes })  // No
  }

  // ── Part 8 — Contact information (Page 11) ──────────────────────────────────
  // Phone maxLength = 10 (digits only). Strip non-digits before writing.
  const phoneDigitsOnly = (a.daytime_phone || '').replace(/\D/g, '').slice(0, 10)
  ops.push({ field: 'form1[0].Page11[0].Part8_Item3_DayPhone[0]', kind: 'text', value: phoneDigitsOnly })
  // Mobile phone — copy from daytime if no separate mobile
  ops.push({ field: 'form1[0].Page11[0].Part8_Item4_MobilePhone[0]', kind: 'text', value: phoneDigitsOnly })
  ops.push({ field: 'form1[0].Page11[0].Part8_Item5_Email[0]',    kind: 'text', value: a.email })

  // ── Part 8: English proficiency statement ──────────────────────────────────
  // [0]=Yes I can read/understand English, [1]=No
  const eng = a.english_proficiency ?? false
  ops.push({ field: 'form1[0].Page10[0].Part8_Item1_AppStmt[0]', kind: 'checkbox', value: eng })
  ops.push({ field: 'form1[0].Page10[0].Part8_Item1_AppStmt[1]', kind: 'checkbox', value: !eng })

  // ── Part 8 — Signature + Date (Page 11) ─────────────────────────────────────
  // If electronic signature provided, fill the signature text field with /s/ format
  // and set the date. If paper mode, leave blank for handwritten signature.
  if (a._signature_mode === 'screen' && a._signature_name) {
    ops.push({ field: 'form1[0].Page11[0].Part8_Item6a_Signature[0]', kind: 'text', value: `/s/ ${a._signature_name}` })
    ops.push({ field: 'form1[0].Page11[0].Part8_Item6b_DateofSignature[0]', kind: 'text', value: a._signature_date || new Date().toLocaleDateString('en-US', { month: '2-digit', day: '2-digit', year: 'numeric' }) })
  }

  return ops
}
