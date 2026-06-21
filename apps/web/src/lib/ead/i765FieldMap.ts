/**
 * EAD / Work Permit — I-765 field map.
 *
 * Source PDF: same as TPS (`apps/web/public/uscis/tps/i-765.pdf`, edition 08/21/25).
 * The same USCIS form serves every category; only the data shape and the
 * Eligibility-Category cell on Page 3 Item 27 differ per product. We keep this
 * file product-specific so the EAD wizard's sparser data shape stays explicit
 * and the TPS map is not coupled to EAD's category set.
 *
 * Categories supported here (per EADWizard's Category type):
 *   c11  → (c)(11) parolee — humanitarian/public-benefit parole (U4U re-parole)
 *   c08  → (c)( 8) pending asylum applicant (I-589 filed 180+ days)
 *   a12  → (a)(12) TPS recipient
 *   other → leave Item 27 blank (user fills manually)
 *
 * Verified against uscis.gov/i-765 (2026-05-06) — see ead-work-permit/start/page.tsx.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * I-765 MAP UNIFICATION PLAN (Phase 1 — DOCUMENTED, NOT EXECUTED)
 *
 * There are TWO I-765 field maps today, both writing the SAME USCIS PDF
 * (edition 08/21/25):
 *   - lib/ead/i765FieldMap.ts  (this file) — EAD wizard, sparse EadFieldData,
 *     uses 'form1[0].Page1[0]...' / 'Page2[0]' / 'Page3[0]' field paths.
 *   - lib/tps/forms/i765FieldMap.ts        — TPS pipeline, richer answer shape.
 *
 * They diverge in the answer object they consume and in some PtLine/area paths,
 * so a naive merge risks changing a filled PDF value. The safe end state is a
 * single map that:
 *   1. Reads ALL document-derived values through the frozen accessor
 *      `getCanonicalValue` (lib/canonical/core/fieldAccessor.ts) so C3's
 *      finalValue contract is honored uniformly (no per-map re-implementation
 *      of normalizedValue ?? rawValue — the exact blind spot just fixed in
 *      reParoleAdapter).
 *   2. Keeps user-declared wizard answers (appType, category, address, contact)
 *      exactly as today — those are NOT document-derived and must not route
 *      through canonical.
 *   3. Is migrated ONLY behind a golden-PDF parity harness (byte/field-level
 *      diff of the two maps over a fixture matrix) proving zero output change.
 *
 * Until that parity infra exists, the two maps stay separate and NO duplicate
 * is removed. This pass only fixed the adapter-layer finalValue blind spot.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { buildI765DocumentOps, type I765Op } from '@/lib/canonical/forms/i765DocumentMapper'
import { eadDocumentFactsToCanonical } from './i765DocumentBoundary'

export type EadAppType = 'new' | 'renewal' | null
export type EadCategory = 'c11' | 'c08' | 'a12' | 'other' | null
export type EadGender = 'male' | 'female' | 'nonbinary' | ''

export interface EadFieldData {
  appType: EadAppType
  category: EadCategory
  firstName: string
  lastName: string
  middleName: string
  dob: string             // 'YYYY-MM-DD' from the date input
  countryOfBirth: string
  alienNumber: string     // may be empty for first-time applicants
  gender: EadGender
  usAddress: string       // single line (street + apt + city, state zip)
}

export type { I765Op }

/** Map EAD category to the two segments USCIS expects on Page 3 Item 27. */
export function categorySegments(c: EadCategory): { letter: string; number: string } | null {
  if (c === 'c11') return { letter: 'c', number: '11' }
  if (c === 'c08') return { letter: 'c', number: '8' }
  if (c === 'a12') return { letter: 'a', number: '12' }
  return null // 'other' or null → leave blank, user fills manually
}

export function buildEadI765Ops(d: EadFieldData): I765Op[] {
  const ops: I765Op[] = []

  // ── Page 1, Part 1 — Type of application ──────────────────────────────────
  //   Checkbox[0] = Initial permission to accept employment (= "new")
  //   Checkbox[1] = Replacement EAD (not in EAD wizard scope; always off here)
  //   Checkbox[2] = Renewal of EAD
  ops.push({ field: 'form1[0].Page1[0].Part1_Checkbox[0]', kind: 'checkbox', value: d.appType === 'new' })
  ops.push({ field: 'form1[0].Page1[0].Part1_Checkbox[1]', kind: 'checkbox', value: false })
  ops.push({ field: 'form1[0].Page1[0].Part1_Checkbox[2]', kind: 'checkbox', value: d.appType === 'renewal' })

  // ── DOCUMENT-DERIVED fields via the ONE shared canonical mapper (GAP-3) ─────
  // Legal name, A-Number, gender, country of birth, DOB. The EAD wizard assumes
  // country is already normalized upstream, so the boundary is a pass-through.
  ops.push(...buildI765DocumentOps(eadDocumentFactsToCanonical(d)))

  // ── Page 2, Line 4b — US mailing address ──────────────────────────────────
  // EAD wizard collects address as one line; we put the whole string in Line4b
  // and leave Line5 unit/city/state/zip blank for the user to split manually
  // (we don't synthesize a structured address from free text — that would be
  // making up fields we don't have).
  if (d.usAddress) {
    ops.push({ field: 'form1[0].Page2[0].Line4b_StreetNumberName[0]', kind: 'text', value: d.usAddress })
  }
  // Mailing-same-as-physical = YES (single address path)
  ops.push({ field: 'form1[0].Page2[0].Part2Line5_Checkbox[0]', kind: 'checkbox', value: false })
  ops.push({ field: 'form1[0].Page2[0].Part2Line5_Checkbox[1]', kind: 'checkbox', value: true })

  // (A-Number Line 7, Gender Line 9, Country of birth Line 18c, and DOB Line 19
  //  are now emitted by the shared canonical document mapper above.)

  // ── Page 3, Item 27 — Eligibility Category ────────────────────────────────
  //   The PDF splits this into three text boxes inside #area[1]:
  //     section_1 = letter ('a' or 'c'); section_2 = number; section_3 = empty.
  const segs = categorySegments(d.category)
  if (segs) {
    ops.push({ field: 'form1[0].Page3[0].#area[1].section_1[0]', kind: 'text', value: segs.letter })
    ops.push({ field: 'form1[0].Page3[0].#area[1].section_2[0]', kind: 'text', value: segs.number })
    ops.push({ field: 'form1[0].Page3[0].#area[1].section_3[0]', kind: 'text', value: '' })
  }

  // ── Page 3, Line 29 — Previously filed I-765? ─────────────────────────────
  //   Renewal → Yes; new → No.
  const prevFiled = d.appType === 'renewal'
  ops.push({ field: 'form1[0].Page3[0].PtLine29_YesNo[0]', kind: 'checkbox', value: prevFiled })
  ops.push({ field: 'form1[0].Page3[0].PtLine29_YesNo[1]', kind: 'checkbox', value: !prevFiled })

  return ops
}
