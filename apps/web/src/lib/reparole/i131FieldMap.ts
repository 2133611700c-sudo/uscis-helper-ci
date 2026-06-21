/**
 * I-131 field map — Re-Parole U4U (Form Edition 01/20/25).
 *
 * Field names enumerated directly from the official PDF AcroForm via
 * pypdf on 2026-05-11. See docs/uscis/forms/reparole/ for the inventory.
 *
 * Coverage in v1:
 *   Part 2 Item 1   — applicant current legal name (family/given/middle)
 *   Part 2 Item 3   — mailing address (street, apt, city, state, zip,
 *                     in-care-of)
 *   Part 2 Item 4   — physical address (only when different from mailing)
 *   Part 2 Item 5   — A-Number (if any)
 *   Part 2 Item 6   — country of birth
 *   Part 2 Item 7   — country of citizenship / nationality
 *   Part 2 Item 8   — gender (M / F checkbox)
 *   Part 2 Item 9   — date of birth (MM/DD/YYYY)
 *   Part 2 Item 10  — SSN (optional)
 *   Part 2 Item 11  — USCIS online account number (optional)
 *   Part 2 Item 12  — class of admission (typically "UH" for U4U entrants)
 *   Part 2 Item 13  — I-94 record number
 *   Part 10 Line 1  — daytime phone
 *   Part 10 Line 2  — mobile phone
 *   Part 10 Line 3  — email
 *
 * NOT covered in v1 (user fills on paper):
 *   - Part 1 Item 1.e checkbox (Re-Parole) — the user marks it on paper
 *     per the existing 05-form-i131-guide.txt; we can wire the specific
 *     CB_AppType[*] index once we have a visual check against the PDF.
 *   - Family-member rows (Lines 16-17 spouse/children)
 *   - Travel plans (Part 4)
 *   - Applicant signature line (user signs in ink)
 *
 * Privacy: SSN field is conditional — if the user did NOT type one, we
 * do not write to that field at all (no '0' filler).
 */

import type { PrefillOp } from '@/lib/tps/pdfPrefiller'
import type { ReParoleAnswers } from './answers'
import { buildI131DocumentOps } from '@/lib/canonical/forms/i131DocumentMapper'
import { i131DocumentFactsToCanonical } from './i131DocumentBoundary'

/**
 * SSN AcroForm field (Part 2 Item 10) has maxLength=9 and expects 9 digits
 * without hyphens. A dashed "123-45-6789" (11 chars) is rejected outright,
 * dropping the field. Strip to digits.
 */
function normalizeSsn(raw: string | undefined): string {
  return (raw ?? '').replace(/\D/g, '').slice(0, 9)
}

export function buildI131Ops(a: ReParoleAnswers): PrefillOp[] {
  const ops: PrefillOp[] = []

  // ── DOCUMENT-DERIVED fields via the ONE shared canonical mapper ───────────────
  // Legal name, A-Number, country of birth/nationality, sex (gender-inversion-safe),
  // DOB, class of admission, I-94 number are now owned by i131DocumentMapper.
  ops.push(...buildI131DocumentOps(i131DocumentFactsToCanonical(a)))

  // (Part 2 Item 1 legal name now emitted by canonical mapper above.)

  // ── Part 2 Item 3 — Mailing address ───────────────────────────────────
  if (a.mailing_in_care_of) {
    ops.push({ field: 'form1[0].P5[0].Part2_Line3_InCareofName[0]',     kind: 'text', value: a.mailing_in_care_of })
  }
  ops.push({ field: 'form1[0].P5[0].Part2_Line3_StreetNumberName[0]',    kind: 'text', value: a.mailing_street })
  if (a.mailing_apt_ste_flr) {
    ops.push({ field: 'form1[0].P5[0].Part2_Line3_AptSteFlrNumber[0]',   kind: 'text', value: a.mailing_apt_ste_flr })
  }
  ops.push({ field: 'form1[0].P5[0].Part2_Line3_CityTown[0]',            kind: 'text', value: a.mailing_city })
  ops.push({ field: 'form1[0].P5[0].Part2_Line3_State[0]',               kind: 'choice', value: a.mailing_state })
  ops.push({ field: 'form1[0].P5[0].Part2_Line3_ZipCode[0]',             kind: 'text', value: a.mailing_zip })

  // ── Part 2 Item 4 — Physical address (only when different) ────────────
  if (a.physical_same_as_mailing !== true) {
    if (a.physical_street) {
      ops.push({ field: 'form1[0].P5[0].Part2_Line4_StreetNumberName[0]',  kind: 'text', value: a.physical_street })
    }
    if (a.physical_apt_ste_flr) {
      ops.push({ field: 'form1[0].P5[0].Part2_Line4_AptSteFlrNumber[0]',   kind: 'text', value: a.physical_apt_ste_flr })
    }
    if (a.physical_city) {
      ops.push({ field: 'form1[0].P5[0].Part2_Line4_CityTown[0]',          kind: 'text', value: a.physical_city })
    }
    if (a.physical_state) {
      ops.push({ field: 'form1[0].P5[0].Part2_Line4_State[0]',             kind: 'choice', value: a.physical_state })
    }
    if (a.physical_zip) {
      ops.push({ field: 'form1[0].P5[0].Part2_Line4_ZipCode[0]',           kind: 'text', value: a.physical_zip })
    }
  }

  // (Items 5/6/7/8/9 — A-Number, country of birth/nationality, gender, DOB are
  //  now emitted by the canonical mapper via i131DocumentBoundary.)

  // ── Part 2 Item 10 — SSN (optional; 9 digits, no hyphens; maxLength=9) ──
  const ssnDigits = normalizeSsn(a.ssn)
  if (ssnDigits) {
    ops.push({ field: 'form1[0].P5[0].#area[1].Part2_Line10_SSN[0]', kind: 'text', value: ssnDigits })
  }

  // ── Part 2 Item 11 — USCIS Online Account Number ─────────────────────
  if (a.uscis_online_account_number) {
    ops.push({ field: 'form1[0].P5[0].Part2_Line11_USCISOnlineAcctNumber[0]', kind: 'text', value: a.uscis_online_account_number })
  }

  // (Items 12/13 — class of admission + I-94 number are now emitted by canonical mapper.)

  // ── Part 10 — Applicant contact info ──────────────────────────────────
  // I-131 phone fields use the same digits-only validation as I-765 did;
  // strip non-digits to avoid maxLength rejection.
  const phoneDigits = (s: string | undefined): string => (s || '').replace(/\D/g, '').slice(0, 10)
  ops.push({ field: 'form1[0].#subform[10].Part10_Line1_DayPhone[0]',     kind: 'text', value: phoneDigits(a.daytime_phone) })
  if (a.mobile_phone) {
    ops.push({ field: 'form1[0].#subform[10].Part10_Line2_MobilePhone[0]', kind: 'text', value: phoneDigits(a.mobile_phone) })
  }
  ops.push({ field: 'form1[0].#subform[10].Part10_Line3_Email[0]',         kind: 'text', value: a.email })

  return ops
}
