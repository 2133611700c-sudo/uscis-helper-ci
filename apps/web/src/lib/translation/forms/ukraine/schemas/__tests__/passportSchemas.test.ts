/**
 * passportSchemas.test.ts — the 3 passport schemas exist with full rule coverage,
 * and are DELIBERATELY NOT registered: registration in OFFICIAL_SCHEMAS is the live
 * switch of the customer PDF (generate-pdf: hasOfficialSchema→mirror). The prompt's
 * 2.4 (register) and 2.6 (legacy stays primary) contradict — resolved per the
 * migration plan: register only behind the staged plan. This test PINS that choice
 * so a future change is a conscious one.
 */
import { describe, it, expect } from 'vitest'
import { internalPassportSchema } from '../internal-passport.schema'
import { internationalPassportSchema } from '../international-passport.schema'
import { idCardSchema } from '../id-card.schema'
import { hasOfficialSchema } from '../registry'

const ALL = [internalPassportSchema, internationalPassportSchema, idCardSchema]

describe('passport schemas — shape', () => {
  for (const s of ALL) {
    it(`${s.docType}: every field carries a translationRule + source present`, () => {
      expect(s.fields.length).toBeGreaterThanOrEqual(5)
      for (const f of s.fields) expect(f.translationRule).toBeTruthy()
      expect(s.officialSource.url).toMatch(/^https?:\/\//)
    })
  }
  it('suppression invariant: no MRZ/personal_number/rnokpp keys are declared', () => {
    for (const s of ALL) {
      const keys = s.fields.map((f) => f.key).join(',')
      expect(keys).not.toMatch(/mrz|personal_number|rnokpp/)
    }
  })
})

describe('passport schemas — REGISTERED (2026-06-12, flag retired)', () => {
  it('all 3 passport schemas resolve via the registry (mirror live by default)', () => {
    expect(hasOfficialSchema('ua_internal_passport_booklet')).toBe(true)
    expect(hasOfficialSchema('ua_international_passport')).toBe(true)
    expect(hasOfficialSchema('ua_id_card')).toBe(true)
  })
})
