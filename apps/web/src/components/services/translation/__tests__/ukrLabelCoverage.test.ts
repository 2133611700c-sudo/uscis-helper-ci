/**
 * ukrLabelCoverage.test.ts — pins the silent-drop bug found 2026-06-11: the
 * translation review table filtered fields through UKR_LABEL_BY_FIELD (6 booklet
 * keys only), silently dropping passport_number/expiry (the owner's "нет дат"),
 * 9 of 10 birth-cert fields, and military doc_number. Every field of every
 * translation-consumer doc type MUST have a label (or the render must fall back,
 * never drop).
 */
import { describe, it, expect } from 'vitest'
import { UKR_LABEL_BY_FIELD, ukrLabelFor } from '../translationFieldLabels'
import { getDocTypeSpec } from '@/lib/docintel/documentRegistry'

const WIZARD_REGISTRY_IDS = [
  'ua_internal_passport_booklet', 'ua_international_passport',
  'ua_birth_certificate', 'ua_marriage_certificate', 'ua_divorce_certificate', 'ua_id_card', 'ua_military_id',
]

describe('UKR_LABEL_BY_FIELD covers every wizard doc-type field (no silent drops)', () => {
  for (const id of WIZARD_REGISTRY_IDS) {
    it(`${id}: every field labeled`, () => {
      const spec = getDocTypeSpec(id)!
      const missing = spec.fields.map((f) => f.field).filter((f) => !UKR_LABEL_BY_FIELD[f])
      expect(missing, `unlabeled fields would be silently dropped: ${missing.join(', ')}`).toEqual([])
    })
  }
})

describe('ukrLabelFor never drops', () => {
  it('unknown field falls back to its key (renders, not vanishes)', () => {
    expect(ukrLabelFor('some_future_field')).toBe('some_future_field')
  })
})
