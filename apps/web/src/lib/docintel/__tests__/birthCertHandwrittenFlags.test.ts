/**
 * birthCertHandwrittenFlags.test.ts — pins the fix for a REAL silent-wrong caught by
 * the first ground-truth bench (2026-06-11): on a real handwritten birth certificate,
 * `act_record_number` was read WRONG with review_required=false (confidence ≥0.95) and
 * would have flowed into the PDF silently. Identity fields were saved by the
 * anti-fabrication/self-consistency gates, but doc_number/agency/date kinds are not in
 * that allowlist — the per-field `handwritten` flag is the layer that must catch them.
 *
 * On Soviet/Ukrainian certificate blanks EVERY value is handwritten (the form is
 * printed, the entries are by hand) ⇒ every value field must carry handwritten: true,
 * which forces review_required in documentFieldReader regardless of model confidence.
 */
import { describe, it, expect } from 'vitest'
import { getDocTypeSpec } from '../documentRegistry'

describe.each(['ua_birth_certificate', 'ua_marriage_certificate', 'ua_divorce_certificate'])(
  '%s — every value field is handwritten (always review)', (docTypeId) => {
  const spec = getDocTypeSpec(docTypeId)!

  it('spec exists with the full field set', () => {
    expect(spec).toBeTruthy()
    expect(spec.fields.length).toBeGreaterThanOrEqual(5)
  })

  it('EVERY field is flagged handwritten — incl. act_record_number (the proven silent-wrong)', () => {
    for (const f of spec.fields) {
      expect(f.handwritten, `${f.field} must be handwritten:true on a handwritten-filled blank`).toBe(true)
    }
  })

  it('act_record_number specifically (regression pin for the 2026-06-11 GT-bench finding)', () => {
    const act = spec.fields.find((f) => f.field === 'act_record_number')
    if (act) expect(act.handwritten).toBe(true) // present on birth/marriage/divorce
  })
})
