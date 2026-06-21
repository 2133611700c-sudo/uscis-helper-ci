/**
 * mirrorTranslation.test.ts — the extraction → official-schema → mirror-PDF wiring.
 * Synthetic data only (no PII). Pins the three new bricks that connect real
 * extracted fields to renderOfficialTranslation (previously fed only by mockOCR).
 */
import { describe, it, expect } from 'vitest'
import { getOfficialSchema, hasOfficialSchema, officialSchemaDocTypes } from '../../forms/ukraine/schemas/registry'
import { buildMirrorValues, collectMirrorExtras } from '../buildMirrorValues'
import { renderMirrorTranslationPDF } from '../renderMirrorTranslationPDF'

describe('official schema registry', () => {
  it('resolves the 5 certificate docTypes', () => {
    expect(officialSchemaDocTypes()).toEqual(expect.arrayContaining([
      'ua_birth_certificate', 'ua_marriage_certificate', 'ua_divorce_certificate',
      'ua_death_certificate', 'ua_name_change_certificate',
    ]))
  })
  it('returns the birth-cert schema with its KMU source', () => {
    const s = getOfficialSchema('ua_birth_certificate')
    expect(s?.titleEn).toBe('BIRTH CERTIFICATE')
    expect(s?.officialSource.act).toContain('1025')
  })
  it('passports are now registered (resolve to their schema)', () => {
    expect(getOfficialSchema('ua_internal_passport_booklet')?.docType).toBe('ua_internal_passport_booklet')
    expect(hasOfficialSchema('ua_international_passport')).toBe(true)
  })
  it('returns null for a genuinely unknown docType', () => {
    expect(getOfficialSchema('ua_unknown_doc')).toBeNull()
    expect(hasOfficialSchema('ua_unknown_doc')).toBe(false)
  })
})

describe('buildMirrorValues — registry keys → schema keys', () => {
  const schema = getOfficialSchema('ua_birth_certificate')!

  it('maps renamed extraction keys onto schema keys (finalValue-first)', () => {
    const v = buildMirrorValues(schema, [
      { field: 'child_family_name', final_value: 'Kovalenko', review_required: false },
      { field: 'dob', normalized_value: '2010-05-15', review_required: false },
      // LIVE translation path (documentRegistry) emits `place_of_birth_city`;
      // TPS path emits `city_of_birth`. Both alias → place_of_birth.
      { field: 'place_of_birth_city', normalized_value: 'Vinnytsia', review_required: true },
      { field: 'certificate_series_number', normalized_value: 'I-АМ № 428069', review_required: false },
    ])
    expect(v.child_surname).toEqual({ value: 'Kovalenko', review: false, canRead: true })
    expect(v.date_of_birth.value).toBe('2010-05-15')
    expect(v.place_of_birth).toEqual({ value: 'Vinnytsia', review: true, canRead: true })
    // certificate_series_number → series_number (was an unmapped blank before the fix)
    expect(v.series_number).toEqual({ value: 'I-АМ № 428069', review: false, canRead: true })
  })

  it('prefers final_value over normalized_value (C3 release contract)', () => {
    const v = buildMirrorValues(schema, [
      { field: 'child_given_name', normalized_value: 'OldRead', final_value: 'Confirmed', review_required: false },
    ])
    expect(v.child_given_name.value).toBe('Confirmed')
  })

  it('leaves schema fields with no extraction source blank (renderer prompts entry)', () => {
    const v = buildMirrorValues(schema, [{ field: 'child_family_name', final_value: 'X' }])
    expect(v.series_number).toEqual({ value: '', review: false, canRead: false })
    expect(v.place_of_registration.canRead).toBe(false)
  })

  it('surfaces extracted-but-unmapped fields as extras (no line is dropped)', () => {
    const extras = collectMirrorExtras(schema, [
      { field: 'child_family_name', final_value: 'Kovalenko' }, // maps → NOT an extra
      { field: 'spouse_1_full_name', final_value: 'Some Read Value' }, // no birth slot → extra
    ])
    expect(extras.map((e) => e.key)).toEqual(['spouse_1_full_name'])
    expect(extras[0]).toMatchObject({ label: 'Spouse 1 Full Name', value: 'Some Read Value' })
  })

  it('a fully-mapped birth cert produces NO extras (no behavior change)', () => {
    const extras = collectMirrorExtras(schema, [
      { field: 'child_family_name', final_value: 'Kovalenko' },
      { field: 'dob', final_value: '2010-05-15' },
      { field: 'place_of_birth_city', final_value: 'Vinnytsia' },
      { field: 'father_full_name', final_value: 'Petro Kovalenko' },
      { field: 'mother_full_name', final_value: 'Olha Kovalenko' },
      { field: 'issuing_authority', final_value: 'Vinnytsia ZAHS' },
    ])
    expect(extras).toEqual([])
  })

  it('maps split spouse keys onto groom/bride schema keys (marriage)', () => {
    const m = getOfficialSchema('ua_marriage_certificate')!
    const v = buildMirrorValues(m, [
      { field: 'spouse_1_surname', final_value: 'Ivanenko' },
      { field: 'spouse_2_given_name', final_value: 'Olena' },
      { field: 'issuing_authority', final_value: 'Vinnytsia ZAHS' },
      { field: 'certificate_series_number', final_value: 'I-АМ № 1' },
    ])
    expect(v.groom_surname).toMatchObject({ value: 'Ivanenko', canRead: true })
    expect(v.bride_given_name).toMatchObject({ value: 'Olena', canRead: true })
    // registration office reads into the official "Place of state registration"
    expect(v.place_of_registration).toMatchObject({ value: 'Vinnytsia ZAHS', canRead: true })
    expect(v.series_number).toMatchObject({ value: 'I-АМ № 1', canRead: true })
    // split keys must NOT leak into ADDITIONAL ENTRIES (all mapped)
    const extras = collectMirrorExtras(m, [
      { field: 'spouse_1_surname', final_value: 'Ivanenko' },
      { field: 'spouse_2_given_name', final_value: 'Olena' },
    ])
    expect(extras).toEqual([])
  })

  it('does not invent a value for an empty field', () => {
    const v = buildMirrorValues(schema, [{ field: 'child_family_name', normalized_value: '' }])
    expect(v.child_surname.canRead).toBe(false)
    expect(v.child_surname.value).toBe('')
  })
})

describe('renderMirrorTranslationPDF — end to end', () => {
  it('produces a real PDF buffer for a schema docType', async () => {
    const res = await renderMirrorTranslationPDF('ua_birth_certificate', [
      { field: 'child_family_name', final_value: 'Kovalenko', review_required: false },
      { field: 'child_given_name', final_value: 'Olena', review_required: false },
      { field: 'dob', normalized_value: '2010-05-15', review_required: false },
      { field: 'act_record_number', normalized_value: '123', review_required: false },
    ], { signerName: 'Test Signer' })
    expect(res).not.toBeNull()
    expect(res!.docType).toBe('ua_birth_certificate')
    expect(res!.schemaTitle).toBe('BIRTH CERTIFICATE')
    expect(Buffer.isBuffer(res!.pdf)).toBe(true)
    expect(res!.pdf.length).toBeGreaterThan(500)
    // PDF magic header
    expect(res!.pdf.subarray(0, 4).toString()).toBe('%PDF')
    // fields with no extraction (series_number, place_of_registration) → unresolved
    expect(res!.unresolved.length).toBeGreaterThan(0)
  })

  it('returns null for a genuinely unknown docType (caller falls back to generic)', async () => {
    const res = await renderMirrorTranslationPDF('ua_unknown_doc', [
      { field: 'family_name', final_value: 'X' },
    ])
    expect(res).toBeNull()
  })
})
