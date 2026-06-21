/**
 * registryHandwritten.test.ts — the registry-wide invariant for hand-filled
 * Ukrainian civil-status CERTIFICATE blanks (audit #195 / Agent B).
 *
 * A Ukrainian civil certificate (свідоцтво) is a PRINTED form with HAND-FILLED
 * entries. Every value the reader extracts off such a blank is therefore
 * handwritten ⇒ each identity/date/place/name/sex/doc-number/agency field MUST
 * carry handwritten:true. That per-field flag is the deterministic reader-level
 * handwriting gate (documentFieldReader): handwriting is NEVER trusted as final,
 * it forces review_required regardless of model confidence. The proven failure
 * mode (act_record_number read WRONG at confidence ≥0.95, review=false, first
 * GT bench 2026-06-11) is what this invariant exists to make impossible to
 * regress, across ALL certificate types — not only the three pinned by the
 * older birthCertHandwrittenFlags.test.ts (which omitted death + name-change).
 *
 * Scope is exact and deliberate:
 *  - CERTIFICATE_DOC_TYPES  → every value field handwritten:true (this test).
 *  - MACHINE_PRINTED_DOC_TYPES → printed/MRZ zones, handwritten:false stays
 *    correct; asserting handwritten:true on them would be WRONG (it would
 *    force-review a trusted machine-printed read). Listed to prove every
 *    registry id was classified on purpose and none fell through the audit.
 */
import { describe, it, expect } from 'vitest'
import { DOCUMENT_TYPES, getDocTypeSpec } from '../documentRegistry'
import type { FieldKind } from '../types'

/**
 * Ukrainian civil-status certificate blanks (свідоцтво) — printed form,
 * hand-filled entries. EVERY value field on these is handwritten.
 */
const CERTIFICATE_DOC_TYPES = [
  'ua_birth_certificate',
  'ua_marriage_certificate',
  'ua_divorce_certificate',
  'ua_death_certificate',
  'ua_name_change_certificate',
] as const

/**
 * Machine-printed documents (printed booklets, polycarbonate ID cards, MRZ,
 * US printouts). Their value zones are NOT handwritten and MUST keep
 * handwritten:false. NOTE: ua_internal_passport_booklet and ua_military_id are
 * intentionally NOT in EITHER list — they are hand-filled identity pages whose
 * handwritten:true flags are owned/justified elsewhere and are not the subject
 * of the certificate invariant. Listing them here would assert the wrong thing.
 */
const MACHINE_PRINTED_DOC_TYPES = [
  'ua_international_passport',
  'ua_id_card',
  'us_ead',
  'us_i94',
  'us_i797',
] as const

/** Identity-bearing field kinds the certificate invariant specifically guards. */
const GUARDED_KINDS: FieldKind[] = ['name', 'date', 'place_city', 'place_oblast', 'sex']

describe.each(CERTIFICATE_DOC_TYPES)(
  'certificate registry invariant — %s',
  (docTypeId) => {
    const spec = getDocTypeSpec(docTypeId)!

    it('spec exists with the full certificate field set', () => {
      expect(spec).toBeTruthy()
      expect(spec.fields.length).toBeGreaterThanOrEqual(5)
    })

    it('EVERY name/date/place/sex field is handwritten:true (always review)', () => {
      const guarded = spec.fields.filter((f) => GUARDED_KINDS.includes(f.kind))
      // Each certificate carries at least one name and one date field.
      expect(guarded.some((f) => f.kind === 'name')).toBe(true)
      expect(guarded.some((f) => f.kind === 'date')).toBe(true)
      for (const f of guarded) {
        expect(
          f.handwritten,
          `${docTypeId}.${f.field} (${f.kind}) must be handwritten:true on a hand-filled certificate blank`,
        ).toBe(true)
      }
    })

    it('EVERY value field (incl. doc_number/agency) is handwritten:true — pins the act_record_number silent-wrong', () => {
      for (const f of spec.fields) {
        expect(
          f.handwritten,
          `${docTypeId}.${f.field} (${f.kind}) must be handwritten:true; whole blank is hand-filled`,
        ).toBe(true)
      }
    })
  },
)

describe('certificate invariant — classification is exhaustive', () => {
  it('every registry doc id is classified as certificate, machine-printed, or explicitly excused', () => {
    // Hand-filled identity pages that are neither civil certificates nor
    // machine-printed; their flags are owned outside this invariant.
    const EXCUSED = ['ua_internal_passport_booklet', 'ua_military_id']
    const classified = new Set<string>([
      ...CERTIFICATE_DOC_TYPES,
      ...MACHINE_PRINTED_DOC_TYPES,
      ...EXCUSED,
    ])
    const unclassified = Object.keys(DOCUMENT_TYPES).filter((id) => !classified.has(id))
    expect(
      unclassified,
      `new registry doc id(s) ${unclassified.join(', ')} must be classified in registryHandwritten.test.ts (certificate vs machine-printed)`,
    ).toEqual([])
  })

  it('every CERTIFICATE_DOC_TYPES id actually exists in the registry', () => {
    for (const id of CERTIFICATE_DOC_TYPES) {
      expect(getDocTypeSpec(id), `${id} must exist in the registry`).toBeTruthy()
    }
  })
})

describe('machine-printed docs keep handwritten:false (negative guard)', () => {
  it.each(MACHINE_PRINTED_DOC_TYPES)(
    '%s — all fields stay machine-printed (handwritten:false)',
    (docTypeId) => {
      const spec = getDocTypeSpec(docTypeId)!
      expect(spec).toBeTruthy()
      for (const f of spec.fields) {
        expect(
          f.handwritten,
          `${docTypeId}.${f.field} is machine-printed and must stay handwritten:false`,
        ).toBe(false)
      }
    },
  )
})
